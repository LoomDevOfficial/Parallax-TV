'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

loadEnvFile(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT) || 3000;
const ROOT = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
  ? path.join(__dirname, 'public')
  : __dirname;
const PRIVATE = new Set(['server.js', 'package.json', 'package-lock.json', 'railway.json', 'railway.toml', 'readme.md', 'deploy.md', 'node_modules']);
const PRODUCTION = process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME);

const TMDB_UPSTREAM = (process.env.TMDB_UPSTREAM || 'https://api.themoviedb.org/3').replace(/\/+$/, '');
const TMDB_TOKEN = (process.env.TMDB_TOKEN || '').trim();
const TMDB_KEY = (process.env.TMDB_KEY || '').trim();
const TMDB_PATH = /^\/(movie|tv|search|discover|trending|genre|find|person|collection|configuration)(\/[A-Za-z0-9_-]{1,40}){0,6}$/;
const TMDB_TTL = 10 * 60 * 1000;
const TMDB_CACHE_MAX = 1500;
const TMDB_TIMEOUT = 8000;
const RATE_WINDOW = 60 * 1000;
const RATE_MAX = 400;

const PLAYER_HOSTS = ['https://cinesrc.st', 'https://*.cinesrc.st'];
const IMAGE_HOSTS = ['https://image.tmdb.org', ...PLAYER_HOSTS];

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${IMAGE_HOSTS.join(' ')}`,
  "font-src 'self' data:",
  `connect-src 'self' ${IMAGE_HOSTS.join(' ')}`,
  `frame-src ${PLAYER_HOSTS.join(' ')}`,
  "media-src 'self' blob: https:",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
};
const COMPRESS = new Set(['.html', '.css', '.js', '.json', '.webmanifest', '.svg', '.txt', '.xml']);
const files = new Map();
const minified = new Map();
const tmdbCache = new Map();
const tmdbPending = new Map();
const hits = new Map();

function loadEnvFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return;
  }
  text.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trim().startsWith('#')) return;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  });
}

function baseHeaders(req) {
  const headers = {
    'Content-Security-Policy': PRODUCTION ? `${CSP}; upgrade-insecure-requests` : CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-DNS-Prefetch-Control': 'on',
    'X-Permitted-Cross-Domain-Policies': 'none'
  };
  if (req.headers['x-forwarded-proto'] === 'https') headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return headers;
}

function send(req, res, status, body, type, extra = {}) {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, { ...baseHeaders(req), 'Content-Type': type, 'Content-Length': data.length, ...extra });
  res.end(req.method === 'HEAD' ? undefined : data);
}

function sendText(req, res, status, text) {
  send(req, res, status, text, 'text/plain; charset=utf-8', { 'Cache-Control': 'no-store' });
}

function sendJson(req, res, status, data, extra = {}) {
  send(req, res, status, data, 'application/json; charset=utf-8', extra);
}

function clientIp(req) {
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real) return real.trim();
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',').pop().trim();
  return req.socket.remoteAddress || 'unknown';
}

function limited(req) {
  const ip = clientIp(req);
  const now = Date.now();
  let entry = hits.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    entry = { start: now, count: 0 };
    hits.set(ip, entry);
  }
  entry.count += 1;
  return entry.count > RATE_MAX ? Math.ceil((entry.start + RATE_WINDOW - now) / 1000) : 0;
}

setInterval(() => {
  const now = Date.now();
  hits.forEach((entry, ip) => {
    if (now - entry.start > RATE_WINDOW) hits.delete(ip);
  });
  tmdbCache.forEach((entry, key) => {
    if (now > entry.expires) tmdbCache.delete(key);
  });
}, RATE_WINDOW).unref();

function crossSite(req) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return true;
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host !== req.headers.host;
  } catch (err) {
    return true;
  }
}

async function tmdbProxy(req, res, url) {
  if (!TMDB_TOKEN && !TMDB_KEY) {
    console.error('[Parallax TV] TMDB_TOKEN is not set. Add it in Railway > Variables.');
    return sendJson(req, res, 503, '{"status_message":"Service unavailable"}', { 'Cache-Control': 'no-store' });
  }
  if (crossSite(req)) return sendJson(req, res, 403, '{"status_message":"Forbidden"}', { 'Cache-Control': 'no-store' });
  const wait = limited(req);
  if (wait) return sendJson(req, res, 429, '{"status_message":"Too many requests"}', { 'Cache-Control': 'no-store', 'Retry-After': String(wait) });

  const apiPath = url.pathname.slice('/api/tmdb'.length) || '/';
  if (!TMDB_PATH.test(apiPath) || url.search.length > 600) {
    return sendJson(req, res, 400, '{"status_message":"Bad request"}', { 'Cache-Control': 'no-store' });
  }
  const params = new URLSearchParams();
  [...url.searchParams.entries()]
    .filter(([k]) => k !== 'api_key' && /^[a-z0-9_.|]{1,40}$/i.test(k))
    .slice(0, 20)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .forEach(([k, v]) => params.append(k, v.slice(0, 200)));
  const key = `${apiPath}?${params.toString()}`;

  const cached = tmdbCache.get(key);
  if (cached && Date.now() < cached.expires) return reply(cached);

  let pending = tmdbPending.get(key);
  if (!pending) {
    pending = fetchTmdb(apiPath, params).finally(() => tmdbPending.delete(key));
    tmdbPending.set(key, pending);
  }
  const result = await pending;
  if (result.status === 200 || result.status === 404) {
    if (tmdbCache.size >= TMDB_CACHE_MAX) tmdbCache.delete(tmdbCache.keys().next().value);
    tmdbCache.set(key, { ...result, expires: Date.now() + (result.status === 200 ? TMDB_TTL : TMDB_TTL / 5) });
  }
  return reply(result);

  function reply(entry) {
    if (res.writableEnded) return;
    const accept = req.headers['accept-encoding'] || '';
    const extra = { 'Cache-Control': entry.status === 200 ? 'private, max-age=300' : 'no-store', Vary: 'Accept-Encoding' };
    let body = entry.body;
    if (entry.gzip && /\bgzip\b/.test(accept)) {
      body = entry.gzip;
      extra['Content-Encoding'] = 'gzip';
    }
    sendJson(req, res, entry.status, body, extra);
  }
}

async function fetchTmdb(apiPath, params) {
  const target = new URL(TMDB_UPSTREAM + apiPath);
  params.forEach((v, k) => target.searchParams.append(k, v));
  const headers = { accept: 'application/json' };
  if (TMDB_TOKEN) headers.Authorization = `Bearer ${TMDB_TOKEN}`;
  else target.searchParams.set('api_key', TMDB_KEY);
  try {
    const upstream = await fetch(target, { headers, signal: AbortSignal.timeout(TMDB_TIMEOUT) });
    if (upstream.status === 404) return { status: 404, body: Buffer.from('{"status_message":"Not found"}') };
    if (upstream.status === 401) {
      console.error('[Parallax TV] TMDB rejected the token. Check TMDB_TOKEN in Railway > Variables.');
      return { status: 502, body: Buffer.from('{"status_message":"Upstream error"}') };
    }
    if (!upstream.ok) return { status: upstream.status === 429 ? 429 : 502, body: Buffer.from('{"status_message":"Upstream error"}') };
    const body = Buffer.from(await upstream.arrayBuffer());
    return { status: 200, body, gzip: body.length > 1024 ? zlib.gzipSync(body, { level: 6 }) : null };
  } catch (err) {
    console.warn('[Parallax TV] TMDB request failed:', err.name === 'TimeoutError' ? 'timed out' : err.message);
    return { status: 504, body: Buffer.from('{"status_message":"Upstream timeout"}') };
  }
}

function cacheControl(ext) {
  if (ext === '.html' || ext === '.js' || ext === '.css' || ext === '.webmanifest') return 'no-cache';
  return 'public, max-age=604800, stale-while-revalidate=86400';
}

function resolveFile(pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch (err) {
    return null;
  }
  if (rel.includes('\0') || rel.includes('\\')) return null;
  if (rel === '/' || rel === '') rel = '/index.html';
  const parts = rel.split('/').filter(Boolean);
  if (parts.some((p) => p.startsWith('.'))) return null;
  if (ROOT === __dirname && PRIVATE.has(parts[0].toLowerCase())) return null;
  const file = path.join(ROOT, ...parts);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null;
  return file;
}

function load(file, stat) {
  const hit = files.get(file);
  if (hit && hit.mtime === stat.mtimeMs && hit.size === stat.size) return hit;
  const ext = path.extname(file).toLowerCase();
  let body = fs.readFileSync(file);
  const small = minified.get(file);
  if (small && small.mtime === stat.mtimeMs) body = small.body;
  const entry = {
    mtime: stat.mtimeMs,
    size: stat.size,
    body,
    etag: `"${body.length.toString(36)}-${Math.round(stat.mtimeMs).toString(36)}"`,
    br: null,
    gzip: null
  };
  if (COMPRESS.has(ext) && body.length > 1024) {
    entry.br = zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } });
    entry.gzip = zlib.gzipSync(body, { level: 9 });
  }
  files.set(file, entry);
  return entry;
}

function notFound(req, res, pathname) {
  const index = path.join(ROOT, 'index.html');
  const wantsPage = (req.headers.accept || '').includes('text/html') && !path.extname(pathname);
  if (wantsPage && fs.existsSync(index)) return serveFile(req, res, index, pathname);
  return sendText(req, res, 404, 'Not found');
}

function serveFile(req, res, file, pathname) {
  let stat;
  try {
    stat = fs.statSync(file);
    if (stat.isDirectory()) {
      file = path.join(file, 'index.html');
      stat = fs.statSync(file);
    }
  } catch (err) {
    return notFound(req, res, pathname);
  }
  const ext = path.extname(file).toLowerCase();
  const entry = load(file, stat);
  const headers = {
    ...baseHeaders(req),
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': cacheControl(ext),
    'Last-Modified': new Date(entry.mtime).toUTCString(),
    ETag: entry.etag,
    Vary: 'Accept-Encoding'
  };
  if (ext === '.png' || ext === '.ico' || ext === '.svg' || ext === '.webmanifest') headers['Cross-Origin-Resource-Policy'] = 'cross-origin';
  if (req.headers['if-none-match'] === entry.etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  const accept = req.headers['accept-encoding'] || '';
  let body = entry.body;
  if (entry.br && /\bbr\b/.test(accept)) {
    body = entry.br;
    headers['Content-Encoding'] = 'br';
  } else if (entry.gzip && /\bgzip\b/.test(accept)) {
    body = entry.gzip;
    headers['Content-Encoding'] = 'gzip';
  }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

async function minifyScripts() {
  if (!PRODUCTION) return;
  let terser;
  try {
    terser = require('terser');
  } catch (err) {
    return;
  }
  const list = fs.readdirSync(ROOT).filter((name) => name.endsWith('.js') && !PRIVATE.has(name.toLowerCase()));
  for (const name of list) {
    const file = path.join(ROOT, name);
    try {
      const stat = fs.statSync(file);
      const out = await terser.minify(fs.readFileSync(file, 'utf8'), {
        ecma: 2020,
        compress: { passes: 2, drop_debugger: true },
        mangle: true,
        format: { comments: false }
      });
      if (out && out.code) minified.set(file, { mtime: stat.mtimeMs, body: Buffer.from(out.code) });
    } catch (err) {
      console.warn(`[Parallax TV] Could not minify ${name}, serving it as is:`, err.message);
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(req, res, 405, 'Method not allowed', 'text/plain; charset=utf-8', { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' });
  }
  if ((req.url || '').length > 2048) return sendText(req, res, 414, 'URI too long');
  let url;
  try {
    url = new URL(req.url || '/', 'http://localhost');
  } catch (err) {
    return sendText(req, res, 400, 'Bad request');
  }
  if (url.pathname === '/health' || url.pathname === '/healthz') return sendText(req, res, 200, 'ok');
  if (url.pathname === '/robots.txt' && !fs.existsSync(path.join(ROOT, 'robots.txt'))) {
    return send(req, res, 200, 'User-agent: *\nDisallow: /api/\n', 'text/plain; charset=utf-8', { 'Cache-Control': 'public, max-age=86400' });
  }
  if (url.pathname === '/api/tmdb' || url.pathname.startsWith('/api/tmdb/')) {
    return tmdbProxy(req, res, url).catch((err) => {
      console.error('[Parallax TV] Proxy failed:', err);
      if (!res.headersSent) sendJson(req, res, 500, '{"status_message":"Server error"}', { 'Cache-Control': 'no-store' });
      else res.destroy();
    });
  }
  if (url.pathname.startsWith('/api/')) return sendText(req, res, 404, 'Not found');
  const file = resolveFile(url.pathname);
  if (!file) return sendText(req, res, 404, 'Not found');
  try {
    serveFile(req, res, file, url.pathname);
  } catch (err) {
    console.error('[Parallax TV] Request failed:', err);
    if (!res.headersSent) sendText(req, res, 500, 'Server error');
    else res.destroy();
  }
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 30000;

minifyScripts().finally(() => {
  server.listen(PORT, () => {
    console.log(`[Parallax TV] Live on port ${PORT}${TMDB_TOKEN || TMDB_KEY ? '' : ' (TMDB_TOKEN missing)'}`);
  });
});

function shutdown(signal) {
  console.log(`[Parallax TV] ${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));