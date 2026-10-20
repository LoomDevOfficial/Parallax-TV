'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
  ? path.join(__dirname, 'public')
  : __dirname;
const PRIVATE = new Set(['server.js', 'package.json', 'package-lock.json', 'railway.json', 'railway.toml', 'readme.md', 'node_modules']);

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
const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN'
};
const cache = new Map();

function cacheControl(ext) {
  if (ext === '.html' || ext === '.js' || ext === '.css' || ext === '.webmanifest') return 'no-cache';
  return 'public, max-age=604800, stale-while-revalidate=86400';
}

function resolveFile(urlPath) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath.split('?')[0]);
  } catch (err) {
    return null;
  }
  if (rel.includes('\0')) return null;
  if (rel === '/' || rel === '') rel = '/index.html';
  const parts = rel.split('/').filter(Boolean);
  if (parts.some((p) => p.startsWith('.') || p === '..')) return null;
  if (ROOT === __dirname && PRIVATE.has(parts[0].toLowerCase())) return null;
  const file = path.join(ROOT, ...parts);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null;
  return file;
}

function load(file, stat) {
  const hit = cache.get(file);
  if (hit && hit.mtime === stat.mtimeMs && hit.size === stat.size) return hit;
  const body = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  const entry = {
    mtime: stat.mtimeMs,
    size: stat.size,
    body,
    etag: `"${stat.size.toString(36)}-${Math.round(stat.mtimeMs).toString(36)}"`,
    br: null,
    gzip: null
  };
  if (COMPRESS.has(ext) && body.length > 1024) {
    entry.br = zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } });
    entry.gzip = zlib.gzipSync(body, { level: 9 });
  }
  cache.set(file, entry);
  return entry;
}

function send(res, status, body, type, extra = {}) {
  res.writeHead(status, { ...HEADERS, 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), ...extra });
  res.end(body);
}

function notFound(req, res) {
  const index = path.join(ROOT, 'index.html');
  const wantsPage = (req.headers.accept || '').includes('text/html') && !path.extname(req.url.split('?')[0]);
  if (wantsPage && fs.existsSync(index)) return serve(req, res, index);
  return send(res, 404, 'Not found', 'text/plain; charset=utf-8', { 'Cache-Control': 'no-store' });
}

function serve(req, res, file) {
  let stat;
  try {
    stat = fs.statSync(file);
    if (stat.isDirectory()) {
      file = path.join(file, 'index.html');
      stat = fs.statSync(file);
    }
  } catch (err) {
    return notFound(req, res);
  }
  const ext = path.extname(file).toLowerCase();
  const entry = load(file, stat);
  const headers = {
    ...HEADERS,
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': cacheControl(ext),
    'Last-Modified': new Date(entry.mtime).toUTCString(),
    ETag: entry.etag,
    Vary: 'Accept-Encoding'
  };
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

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method not allowed', 'text/plain; charset=utf-8', { Allow: 'GET, HEAD' });
  }
  if (req.url === '/health' || req.url === '/healthz') {
    return send(res, 200, 'ok', 'text/plain; charset=utf-8', { 'Cache-Control': 'no-store' });
  }
  const file = resolveFile(req.url || '/');
  if (!file) return send(res, 404, 'Not found', 'text/plain; charset=utf-8', { 'Cache-Control': 'no-store' });
  try {
    serve(req, res, file);
  } catch (err) {
    console.error('[Parallax TV] Request failed:', err);
    if (!res.headersSent) send(res, 500, 'Server error', 'text/plain; charset=utf-8', { 'Cache-Control': 'no-store' });
    else res.destroy();
  }
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.listen(PORT, () => {
  console.log(`[Parallax TV] Serving ${path.relative(process.cwd(), ROOT) || '.'} on port ${PORT}`);
});

function shutdown(signal) {
  console.log(`[Parallax TV] ${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));