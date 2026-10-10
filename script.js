(() => {
  'use strict';

  const brand = document.getElementById('brand');
  const content = document.getElementById('content');
  const status = document.getElementById('refresh-status');
  if (!brand || !content) return;

  const icon = brand.querySelector('.brand__icon');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const EASE = 'cubic-bezier(.22, 1, .36, 1)';
  const EASE_IN_OUT = 'cubic-bezier(.65, 0, .35, 1)';
  const loaders = new Set();
  let busy = false;

  const settle = (anims) => Promise.all(anims.map((a) => a.finished.catch(() => {})));

  const inView = (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  };

  function popIcon() {
    if (reduced.matches) return;
    icon.animate(
      [
        { transform: 'scale(.94)' },
        { transform: 'scale(1.04)', offset: .45 },
        { transform: 'scale(1)' }
      ],
      { duration: 420, easing: EASE_IN_OUT }
    );
  }

  function fadeOut() {
    const still = reduced.matches;
    return [...content.children].map((el) => el.animate(
      [
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
        { opacity: 0, transform: still ? 'none' : 'translateY(-6px)', filter: still ? 'blur(0px)' : 'blur(6px)' }
      ],
      { duration: inView(el) ? 260 : 0, easing: 'ease-in', fill: 'forwards' }
    ));
  }

  function fadeIn(exits) {
    const still = reduced.matches;
    let i = 0;
    const enters = [...content.children].filter(inView).map((el) => el.animate(
      [
        { opacity: 0, transform: still ? 'none' : 'translateY(10px)', filter: still ? 'blur(0px)' : 'blur(8px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' }
      ],
      { duration: 560, delay: still ? 0 : Math.min(i++, 6) * 40, easing: EASE, fill: 'backwards' }
    ));
    exits.forEach((a) => a.cancel());
    return enters;
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    content.setAttribute('aria-busy', 'true');

    popIcon();
    const exits = fadeOut();
    await settle(exits);
    window.scrollTo(0, 0);

    try {
      for (const load of loaders) await load(content);
    } catch (err) {
      console.error('[Parallax TV] Refresh failed:', err);
    }
    content.dispatchEvent(new CustomEvent('parallax:refresh', { bubbles: true, detail: { content } }));

    await settle(fadeIn(exits));

    content.removeAttribute('aria-busy');
    if (status) {
      status.textContent = '';
      requestAnimationFrame(() => { status.textContent = 'Content refreshed'; });
    }
    busy = false;
  }

  const search = document.getElementById('search');
  if (search) {
    const input = search.querySelector('.search__input');
    const sheen = search.querySelector('.search__sheen');
    const sweep = (delay = 0) => {
      if (!sheen || reduced.matches) return;
      sheen.animate(
        [
          { opacity: 1, backgroundPosition: '100% 0' },
          { opacity: 1, backgroundPosition: '0% 0' }
        ],
        { duration: 1400, delay, easing: EASE_IN_OUT }
      );
    };
    search.addEventListener('submit', (e) => {
      e.preventDefault();
      submitSearch(input);
    });
    if (input) {
      input.addEventListener('focus', () => sweep());
      input.addEventListener('input', hideHint);
    }
    sweep(1300);
  }

  const CINESRC = 'https://cinesrc.st';
  const TMDB_KEY = '61a09c0871365a16273d146bf94fc545';
  const TMDB_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI2MWEwOWMwODcxMzY1YTE2MjczZDE0NmJmOTRmYzU0NSIsIm5iZiI6MTc5MTYyNDE1OS4yNDE5OTk5LCJzdWIiOiI2YWNhMDNkZjY4MjI5MmZlMDU0ODBjNzYiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.stXimpCMAzBK1KztgBm9r-_JSLyVcc1rhFCe7w0eP60';
  const TMDB_API = 'https://api.themoviedb.org/3';
  const TMDB_IMG = 'https://image.tmdb.org/t/p/';
  const LOADER_MIN = 2600;
  const EASE_MORPH = 'cubic-bezier(.76, 0, .24, 1)';
  const FULL_CLIP = 'inset(0px 0px 0px 0px round 0px)';
  const player = document.getElementById('player');
  const frame = document.getElementById('player-frame');
  const picker = document.getElementById('picker');
  const backdrop = document.getElementById('player-backdrop');
  const backButton = document.getElementById('player-back');
  const loaderLogo = player ? player.querySelector('.player__logo') : null;
  const hint = document.getElementById('search-hint');
  const field = document.querySelector('.search__field');
  const searchInput = document.getElementById('search-input');
  const tmdbCache = new Map();
  const disposers = new Set();
  let session = null;
  let closing = false;
  let homeAnims = [];
  let readyTimer = 0;
  let autoplayTimer = 0;
  let playing = false;

  const ICONS = {
    tv: '<rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline>',
    left: '<polyline points="15 18 9 12 15 6"></polyline>',
    right: '<polyline points="9 18 15 12 9 6"></polyline>',
    down: '<polyline points="6 9 12 15 18 9"></polyline>',
    play: '<path fill="currentColor" stroke="none" d="M5 5.27368C5 3.56682 6.82609 2.48151 8.32538 3.2973L20.687 10.0235C22.2531 10.8756 22.2531 13.124 20.687 13.9762L8.32538 20.7024C6.82609 21.5181 5 20.4328 5 18.726V5.27368Z"></path>'
  };

  const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const yearOf = (date) => (date ? date.slice(0, 4) : '');
  const motion = () => (reduced.matches ? 'auto' : 'smooth');
  const SHAPES = {
    movie: 'M4.18 2h15.64A2.18 2.18 0 0 1 22 4.18v15.64A2.18 2.18 0 0 1 19.82 22H4.18A2.18 2.18 0 0 1 2 19.82V4.18A2.18 2.18 0 0 1 4.18 2zM7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5',
    tv: 'M4 7h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM17 2l-5 5-5-5'
  };
  const PRISM = [[255, 196, 140], [255, 255, 255], [140, 194, 255], [194, 166, 255]];
  const seasonName = (n) => (n === 0 ? 'Specials' : `Season ${n}`);

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function shortDate(date) {
    const d = new Date(`${date}T00:00:00`);
    return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function dispose() {
    disposers.forEach((fn) => fn());
    disposers.clear();
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svgIcon(name, className) {
    const wrap = document.createElement('span');
    wrap.innerHTML = `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
    return wrap.firstElementChild;
  }

  function parseQuery(value) {
    const text = value.trim();
    if (/^\d+$/.test(text)) return { type: 'auto', id: text };
    let match = text.match(/themoviedb\.org\/movie\/(\d+)/i);
    if (match) return { type: 'movie', id: match[1] };
    match = text.match(/themoviedb\.org\/tv\/(\d+)[^/?#]*(?:\/season\/(\d+)(?:\/episode\/(\d+))?)?/i);
    if (match) return { type: 'tv', id: match[1], s: match[2], e: match[3] };
    match = text.match(/^(movie|tv)[\s:/]+(\d+)$/i);
    if (match) return { type: match[1].toLowerCase(), id: match[2] };
    return null;
  }

  function routeHash(route) {
    if (route.type === 'movie') return `#movie/${route.id}`;
    if (route.type === 'tv') return route.s && route.e ? `#tv/${route.id}/${route.s}/${route.e}` : `#tv/${route.id}`;
    return `#watch/${route.id}`;
  }

  function routeFromHash() {
    const hash = window.location.hash;
    let match = hash.match(/^#movie\/(\d+)$/);
    if (match) return { type: 'movie', id: match[1] };
    match = hash.match(/^#tv\/(\d+)(?:\/(\d+)\/(\d+))?$/);
    if (match) return { type: 'tv', id: match[1], s: match[2], e: match[3] };
    match = hash.match(/^#watch\/(\d+)$/);
    if (match) return { type: 'auto', id: match[1] };
    return null;
  }

  function setHash(route, push) {
    try {
      if (push) history.pushState({ parallax: true }, '', routeHash(route));
      else history.replaceState(history.state && history.state.parallax ? history.state : null, '', routeHash(route));
    } catch (err) {
      console.warn('[Parallax TV] Could not update history:', err);
    }
    if (session) session.hash = window.location.hash;
  }

  function showHint(message) {
    if (!hint) return;
    hint.textContent = message;
    hint.classList.add('is-visible');
  }

  function hideHint() {
    if (hint) hint.classList.remove('is-visible');
  }

  function nudgeField() {
    if (!field || reduced.matches) return;
    field.animate(
      [
        { translate: '0 0' },
        { translate: '-6px 0' },
        { translate: '5px 0' },
        { translate: '-3px 0' },
        { translate: '0 0' }
      ],
      { duration: 420, easing: EASE_IN_OUT }
    );
  }

  function submitSearch(input) {
    if (!input) return;
    const route = parseQuery(input.value);
    if (!route) {
      nudgeField();
      showHint(input.value.trim()
        ? 'Name search is coming soon. Enter a TMDB ID for now.'
        : 'Enter a TMDB ID to start watching.');
      return;
    }
    hideHint();
    openPlayer(route, { push: true, fullscreen: true });
  }

  function fieldClip() {
    if (!field) return 'inset(50% 50% 50% 50% round 999px)';
    const r = field.getBoundingClientRect();
    const w = window.innerWidth;
    const h = window.innerHeight;
    return `inset(${r.top}px ${w - r.right}px ${h - r.bottom}px ${r.left}px round ${r.height / 2}px)`;
  }

  function enterFullscreen() {
    const root = document.documentElement;
    if (document.fullscreenElement || !root.requestFullscreen) return Promise.resolve();
    return root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }

  function leaveFullscreen() {
    if (!document.fullscreenElement || !document.exitFullscreen) return Promise.resolve();
    return document.exitFullscreen().catch(() => {});
  }

  function hideHome() {
    const blur = reduced.matches ? 'blur(0px)' : 'blur(10px)';
    homeAnims.forEach((a) => a.cancel());
    homeAnims = [brand, content].map((el) => el.animate(
      [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: blur }],
      { duration: 520, easing: EASE, fill: 'forwards' }
    ));
    brand.inert = true;
    content.inert = true;
  }

  function showHome() {
    brand.inert = false;
    content.inert = false;
    const anims = homeAnims;
    homeAnims = [];
    anims.forEach((a) => a.reverse());
    return settle(anims).then(() => anims.forEach((a) => a.cancel()));
  }

  async function tmdb(path, signal) {
    if (tmdbCache.has(path)) return tmdbCache.get(path);
    const url = new URL(TMDB_API + path);
    url.searchParams.set('api_key', TMDB_KEY);
    try {
      let res = await fetch(url, { headers: { accept: 'application/json' }, signal });
      if (res.status === 401 && TMDB_TOKEN) {
        url.searchParams.delete('api_key');
        res = await fetch(url, { headers: { accept: 'application/json', Authorization: `Bearer ${TMDB_TOKEN}` }, signal });
      }
      if (res.status === 404) {
        tmdbCache.set(path, null);
        return null;
      }
      if (!res.ok) return undefined;
      const data = await res.json();
      tmdbCache.set(path, data);
      return data;
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('[Parallax TV] TMDB request failed:', err);
      return undefined;
    }
  }

  async function resolveRoute(route, signal) {
    if (route.type === 'movie') return { kind: 'movie' };
    const [movie, show] = await Promise.all([
      route.type === 'tv' ? Promise.resolve(null) : tmdb(`/movie/${route.id}`, signal),
      tmdb(`/tv/${route.id}`, signal)
    ]);
    if (movie && show) return { kind: 'choose', movie, show };
    if (show) return { kind: 'tv', show };
    if (movie) return { kind: 'movie' };
    return movie === undefined || show === undefined ? { kind: 'error' } : { kind: 'missing' };
  }

  function settleLogo() {
    if (!loaderLogo || player.classList.contains('is-picking')) return;
    const from = getComputedStyle(loaderLogo).opacity;
    player.classList.add('is-picking');
    loaderLogo.animate([{ opacity: from }, { opacity: 1 }], { duration: 400, easing: EASE });
  }

  function showPicker(build, wide = false) {
    if (!picker || !session) return;
    const still = reduced.matches;
    dispose();
    settleLogo();
    player.classList.toggle('is-wide', wide);
    picker.replaceChildren(...build());
    picker.hidden = false;
    picker.animate(
      [
        { opacity: 0, filter: still ? 'blur(0px)' : 'blur(10px)', translate: still ? '0 0' : '0 10px' },
        { opacity: 1, filter: 'blur(0px)', translate: '0 0' }
      ],
      { duration: 700, easing: EASE }
    );
  }

  async function hidePicker(keepPicking = false) {
    dispose();
    hideBackdrop();
    if (picker && !picker.hidden) {
      const out = picker.animate(
        [
          { opacity: 1, filter: 'blur(0px)' },
          { opacity: 0, filter: reduced.matches ? 'blur(0px)' : 'blur(8px)' }
        ],
        { duration: 300, easing: 'ease-in', fill: 'forwards' }
      );
      await settle([out]);
      picker.hidden = true;
      picker.replaceChildren();
      out.cancel();
    }
    player.classList.remove('is-wide');
    if (!keepPicking) player.classList.remove('is-picking');
  }

  function showBackdrop(path) {
    if (!backdrop || !path) return;
    const url = `${TMDB_IMG}w1280${path}`;
    const img = new Image();
    img.onload = () => {
      if (!session || !player.classList.contains('is-picking')) return;
      backdrop.style.setProperty('--backdrop', `url("${url}")`);
      backdrop.classList.add('is-visible');
    };
    img.src = url;
  }

  function hideBackdrop() {
    if (backdrop) backdrop.classList.remove('is-visible');
  }

  function pickerHead(title, meta) {
    const head = el('div', 'picker__head');
    head.append(el('h2', 'picker__title', title));
    if (meta) head.append(el('p', 'picker__meta', meta));
    return head;
  }

  function playButton() {
    const button = el('button', 'picker__play');
    button.type = 'button';
    button.append(svgIcon('play', 'picker__play-icon'), el('span', 'picker__play-label', 'Play'));
    return button;
  }

  function secondaryButton(text, onClick) {
    const button = el('button', 'picker__secondary', text);
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
  }

  function arrowButton(name, label) {
    const button = el('button', 'rail__arrow');
    button.type = 'button';
    button.disabled = true;
    button.setAttribute('aria-label', label);
    button.append(svgIcon(name, 'rail__arrow-icon'));
    return button;
  }

  function buildMessage(title, meta, actions) {
    const row = el('div', 'picker__actions');
    row.append(...actions);
    return [pickerHead(title, meta), row];
  }

  function playableSeasons(show) {
    const all = (show && show.seasons ? show.seasons : [])
      .filter((s) => s.episode_count > 0)
      .sort((a, b) => a.season_number - b.season_number);
    return [...all.filter((s) => s.season_number > 0), ...all.filter((s) => s.season_number === 0)];
  }

  function seasonRow(seasons, current, onChange) {
    const row = el('div', 'seasons');
    const pill = el('span', 'seasons__pill');
    let ticking = false;
    let first = true;
    pill.setAttribute('aria-hidden', 'true');
    row.append(pill);

    const chips = seasons.map((s) => {
      const chip = el('button', 'season', seasonName(s.season_number));
      chip.type = 'button';
      chip.dataset.season = String(s.season_number);
      chip.setAttribute('aria-pressed', String(s.season_number === current));
      chip.addEventListener('click', () => {
        if (chip.getAttribute('aria-pressed') === 'true') return;
        chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
        place(true);
        reveal(chip, motion());
        onChange(s.season_number);
      });
      row.append(chip);
      return chip;
    });

    const selected = () => chips.find((c) => c.getAttribute('aria-pressed') === 'true');

    function sync() {
      const max = row.scrollWidth - row.clientWidth;
      row.classList.toggle('has-prev', max > 4 && row.scrollLeft > 4);
      row.classList.toggle('has-next', max > 4 && row.scrollLeft < max - 4);
    }

    function place(animate) {
      const chip = selected();
      if (!chip || !chip.offsetWidth) return;
      const instant = !animate || reduced.matches;
      if (instant) pill.style.transition = 'none';
      pill.style.width = `${chip.offsetWidth}px`;
      pill.style.transform = `translateX(${chip.offsetLeft}px)`;
      pill.classList.add('is-visible');
      if (instant) {
        pill.getBoundingClientRect();
        pill.style.transition = '';
      }
    }

    function reveal(chip, behavior) {
      const left = chip.offsetLeft - 30;
      const right = chip.offsetLeft + chip.offsetWidth + 30 - row.clientWidth;
      if (row.scrollLeft > left) row.scrollTo({ left: Math.max(0, left), behavior });
      else if (row.scrollLeft < right) row.scrollTo({ left: right, behavior });
    }

    row.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        sync();
      });
    }, { passive: true });

    row.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || row.scrollWidth - row.clientWidth <= 4) return;
      e.preventDefault();
      row.scrollLeft += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    }, { passive: false });

    const observer = new ResizeObserver(() => {
      place(false);
      if (first && selected()) {
        first = false;
        reveal(selected(), 'auto');
      }
      sync();
    });
    observer.observe(row);

    return { node: row, dispose: () => observer.disconnect() };
  }

  function sampleShape(name, size, count) {
    const px = Math.max(24, Math.ceil(size));
    const off = document.createElement('canvas');
    off.width = px;
    off.height = px;
    const g = off.getContext('2d', { willReadFrequently: true });
    g.scale(px / 24, px / 24);
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#ffffff';
    g.stroke(new Path2D(SHAPES[name]));
    const data = g.getImageData(0, 0, px, px).data;
    const points = [];
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        if (data[(y * px + x) * 4 + 3] > 128) points.push([x - px / 2 + 0.5, y - px / 2 + 0.5]);
      }
    }
    if (!points.length) points.push([0, 0]);
    for (let i = points.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [points[i], points[j]] = [points[j], points[i]];
    }
    return Array.from({ length: count }, (_, i) => points[i % points.length]);
  }

  function particleField(canvas, area, sides) {
    const ctx = canvas.getContext('2d');
    const touch = window.matchMedia('(hover: none)').matches;
    const amounts = sides.map(() => 0);
    const start = performance.now();
    let last = start;
    let particles = [];
    let pointer = null;
    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;

    const clamp = (v) => Math.min(1, Math.max(0, v));
    const smooth = (v) => {
      const t = clamp(v);
      return t * t * (3 - 2 * t);
    };

    function prism(u) {
      const t = clamp(u) * (PRISM.length - 1);
      const i = Math.min(PRISM.length - 2, Math.floor(t));
      const f = t - i;
      return PRISM[i].map((c, n) => c + (PRISM[i + 1][n] - c) * f);
    }

    function build() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      w = rect.width;
      h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const half = w / 2;
      const size = Math.min(half * 0.46, h * 0.46);
      const count = Math.round(Math.min(520, Math.max(220, (half * h) / 85)));
      const spread = Math.min(half * 0.4, h * 0.36);
      particles = [];
      sides.forEach((side, s) => {
        const cx = half * s + half / 2;
        const cy = h * 0.42;
        const dir = s === 0 ? 1 : -1;
        sampleShape(side.key, size, count).forEach(([sx, sy]) => {
          particles.push({
            side: s,
            cx,
            cy,
            angle: Math.random() * Math.PI * 2,
            radius: Math.pow(Math.random(), 0.75) * spread,
            spin: (0.05 + Math.random() * 0.2) * dir,
            phase: Math.random() * Math.PI * 2,
            tx: cx + sx,
            ty: cy + sy,
            delay: Math.random() * 0.35,
            size: 0.7 + Math.random() * 1.1,
            alpha: 0.18 + Math.random() * 0.45,
            tint: prism((sx + sy * 0.4) / size + 0.5)
          });
        });
      });
    }

    function target(s, time) {
      if (sides[s].button && sides[s].button.matches(':focus-visible')) return 1;
      if (touch) return time > 0.9 ? 1 : 0;
      if (!pointer) return 0;
      const dx = (pointer.x - (w / 4 + (w / 2) * s)) / (w / 2);
      const dy = (pointer.y - h * 0.42) / h;
      return 1 - smooth((Math.hypot(dx, dy * 0.8) - 0.16) / 0.44);
    }

    function draw(now) {
      raf = requestAnimationFrame(draw);
      if (!particles.length) return;
      const still = reduced.matches;
      const dt = Math.min(0.05, (now - last) / 1000);
      const time = (now - start) / 1000;
      const intro = still ? 1 : 1 - Math.pow(1 - clamp(time / 1.4), 3);
      last = now;

      sides.forEach((side, s) => {
        const goal = target(s, time);
        amounts[s] = still ? goal : amounts[s] + (goal - amounts[s]) * (1 - Math.exp(-dt * 5));
        const active = amounts[s] > 0.5;
        if (side.active !== active) {
          side.active = active;
          side.button.classList.toggle('is-active', active);
        }
      });

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, w, h);

      sides.forEach((side, s) => {
        const a = amounts[s];
        if (a < 0.01) return;
        const cx = w / 4 + (w / 2) * s;
        const glow = ctx.createRadialGradient(cx, h * 0.42, 0, cx, h * 0.42, Math.min(w / 4, h * 0.5));
        glow.addColorStop(0, `rgba(210, 214, 230, ${(0.07 * a).toFixed(3)})`);
        glow.addColorStop(1, 'rgba(210, 214, 230, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(cx - w / 4, 0, w / 2, h);
      });

      ctx.globalCompositeOperation = 'lighter';
      for (const p of particles) {
        const k = smooth((amounts[p.side] - p.delay) / 0.65);
        if (!still) p.angle += p.spin * dt * (1 - k * 0.9);
        const r = p.radius * intro * (still ? 1 : 1 + Math.sin(time * 0.8 + p.phase) * 0.07);
        const hx = p.cx + Math.cos(p.angle) * r;
        const hy = p.cy + Math.sin(p.angle) * r * 0.78;
        const j = still ? 0 : k * 0.55;
        const fx = p.tx + Math.sin(time * 2.1 + p.phase) * j;
        const fy = p.ty + Math.cos(time * 1.7 + p.phase) * j;
        const x = hx + (fx - hx) * k;
        const y = hy + (fy - hy) * k;
        const m = k * 0.75;
        const red = 201 + (p.tint[0] - 201) * m;
        const green = 201 + (p.tint[1] - 201) * m;
        const blue = 206 + (p.tint[2] - 206) * m;
        const alpha = (p.alpha + (0.9 - p.alpha) * k) * intro;
        const size = p.size * (1 - k * 0.15);
        ctx.fillStyle = `rgba(${red | 0}, ${green | 0}, ${blue | 0}, ${alpha.toFixed(3)})`;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }

    const move = (e) => {
      const r = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const leave = () => { pointer = null; };

    area.addEventListener('pointermove', move);
    area.addEventListener('pointerdown', move);
    area.addEventListener('pointerleave', leave);
    const observer = new ResizeObserver(build);
    observer.observe(canvas);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      area.removeEventListener('pointermove', move);
      area.removeEventListener('pointerdown', move);
      area.removeEventListener('pointerleave', leave);
    };
  }

  function buildChooser(route, movie, show) {
    const area = el('div', 'chooser');
    const canvas = el('canvas', 'chooser__canvas');
    const grid = el('div', 'chooser__sides');
    const count = playableSeasons(show).filter((s) => s.season_number > 0).length;
    const hours = Math.floor((movie.runtime || 0) / 60);
    const minutes = (movie.runtime || 0) % 60;
    const runtime = movie.runtime ? `${hours ? `${hours}h` : ''}${minutes ? ` ${minutes}m` : ''}`.trim() : '';
    const sides = [
      { key: 'movie', label: 'Movie', title: movie.title || 'Untitled', meta: [yearOf(movie.release_date), runtime] },
      { key: 'tv', label: 'TV Show', title: show.name || 'Untitled', meta: [yearOf(show.first_air_date), count ? `${count} Season${count === 1 ? '' : 's'}` : ''] }
    ];
    let chosen = false;
    canvas.setAttribute('aria-hidden', 'true');

    sides.forEach((side) => {
      const button = el('button', `chooser__side chooser__side--${side.key}`);
      const meta = side.meta.filter(Boolean).join(' · ');
      button.type = 'button';
      button.append(el('span', 'chooser__label', side.label), el('span', 'chooser__title', side.title));
      if (meta) button.append(el('span', 'chooser__meta', meta));
      button.addEventListener('click', () => {
        if (chosen || !session) return;
        chosen = true;
        if (side.key === 'movie') playRoute({ type: 'movie', id: route.id });
        else switchToTv(route, show);
      });
      side.button = button;
      grid.append(button);
    });

    area.append(canvas, grid);
    disposers.add(particleField(canvas, area, sides));
    return [pickerHead('Movie or TV Show?', `TMDB ID ${route.id} matches both. Pick one.`), area];
  }

  function buildTvPicker(route, show, seasons) {
    const now = today();
    const signal = session.controller.signal;
    const wanted = Number(route.s);
    let season = seasons.some((s) => s.season_number === wanted) ? wanted : seasons[0].season_number;
    let episode = 1;
    let token = 0;
    let ticking = false;

    const play = playButton();
    const label = play.querySelector('.picker__play-label');
    const rail = el('div', 'rail');
    const track = el('div', 'rail__track');
    const prev = arrowButton('left', 'Previous episodes');
    const next = arrowButton('right', 'Next episodes');
    rail.append(prev, track, next);

    const updateLabel = () => { label.textContent = `Play S${season} · E${episode}`; };
    const go = () => {
      if (episode) playRoute({ type: 'tv', id: route.id, s: String(season), e: String(episode) });
    };
    const cards = () => [...track.querySelectorAll('button.ep')];
    const aired = (info) => !info.air_date || info.air_date <= now;
    const metrics = () => {
      const style = getComputedStyle(track);
      return { gap: parseFloat(style.columnGap) || 0, pad: parseFloat(style.paddingLeft) || 0 };
    };

    function syncArrows() {
      const max = track.scrollWidth - track.clientWidth;
      const scrollable = max > 4;
      const atStart = track.scrollLeft <= 4;
      const atEnd = track.scrollLeft >= max - 4;
      rail.classList.toggle('is-scrollable', scrollable);
      track.classList.toggle('has-prev', scrollable && !atStart);
      track.classList.toggle('has-next', scrollable && !atEnd);
      prev.disabled = !scrollable || atStart;
      next.disabled = !scrollable || atEnd;
    }

    function page(dir) {
      const card = track.querySelector('.ep');
      if (!card) return;
      const { gap, pad } = metrics();
      const step = card.offsetWidth + gap;
      const count = Math.max(1, Math.floor((track.clientWidth - pad * 2 + gap) / step));
      const index = Math.round(track.scrollLeft / step) + dir * count;
      track.scrollTo({ left: Math.max(0, index * step), behavior: motion() });
    }

    function reveal(card, behavior = motion()) {
      const { pad } = metrics();
      const left = card.offsetLeft - pad;
      const right = card.offsetLeft + card.offsetWidth + pad - track.clientWidth;
      if (track.scrollLeft > left) track.scrollTo({ left, behavior });
      else if (track.scrollLeft < right) track.scrollTo({ left: right, behavior });
    }

    function select(card) {
      episode = Number(card.dataset.episode);
      cards().forEach((c) => c.setAttribute('aria-pressed', String(c === card)));
      updateLabel();
      reveal(card);
    }

    function fadeTrack() {
      if (reduced.matches) return;
      track.animate(
        [
          { opacity: 0, filter: 'blur(6px)', translate: '14px 0' },
          { opacity: 1, filter: 'blur(0px)', translate: '0 0' }
        ],
        { duration: 520, easing: EASE }
      );
    }

    function skeletonCard() {
      const card = el('div', 'ep is-skeleton');
      const body = el('span', 'ep__body');
      body.append(el('span', 'ep__bar'), el('span', 'ep__bar ep__bar--short'));
      card.append(el('span', 'ep__still'), body);
      return card;
    }

    function episodeCard(info, locked) {
      const n = info.episode_number;
      const upcoming = locked && !aired(info);
      const card = el('button', 'ep');
      const still = el('span', 'ep__still');
      const body = el('span', 'ep__body');
      card.type = 'button';
      card.disabled = upcoming;
      card.dataset.episode = String(n);
      card.setAttribute('aria-pressed', String(n === episode));

      if (info.still_path) {
        const img = el('img', 'ep__img');
        img.alt = '';
        img.decoding = 'async';
        img.draggable = false;
        still.classList.add('is-loading');
        img.addEventListener('load', () => {
          still.classList.remove('is-loading');
          img.classList.add('is-loaded');
        }, { once: true });
        img.addEventListener('error', () => {
          still.classList.remove('is-loading');
          img.replaceWith(svgIcon('tv', 'ep__fallback'));
        }, { once: true });
        img.src = `${TMDB_IMG}w300${info.still_path}`;
        still.append(img);
      } else {
        still.append(svgIcon('tv', 'ep__fallback'));
      }

      still.append(el('span', 'ep__tag', `E${n}`));
      const side = upcoming ? `Airs ${shortDate(info.air_date)}` : info.runtime ? `${info.runtime}m` : '';
      if (side) still.append(el('span', 'ep__time', side));

      const desc = info.overview || (upcoming ? "This episode hasn't aired yet." : 'No description available.');
      body.append(
        el('span', 'ep__name', info.name || `Episode ${n}`),
        el('span', info.overview ? 'ep__desc' : 'ep__desc is-empty', desc)
      );
      card.append(still, body);
      card.addEventListener('click', () => select(card));
      card.addEventListener('dblclick', go);
      return card;
    }

    function renderCards(list) {
      const locked = list.some(aired);
      const playable = (info) => !locked || aired(info);
      if (!list.some((info) => info.episode_number === episode && playable(info))) {
        const first = list.find(playable) || list[0];
        episode = first ? first.episode_number : 1;
      }
      track.replaceChildren(...list.map((info) => episodeCard(info, locked)));
      track.scrollLeft = 0;
      updateLabel();
      const selected = cards().find((c) => c.getAttribute('aria-pressed') === 'true');
      if (selected) reveal(selected, 'auto');
      syncArrows();
    }

    async function loadSeason(n, animate) {
      const id = ++token;
      const meta = seasons.find((s) => s.season_number === n);
      const path = `/tv/${route.id}/season/${n}`;
      const cached = tmdbCache.has(path);
      if (!cached) {
        track.replaceChildren(...Array.from({ length: Math.max(1, Math.min(meta.episode_count, 8)) }, skeletonCard));
        track.scrollLeft = 0;
        syncArrows();
        if (animate) fadeTrack();
      }
      const data = await tmdb(path, signal);
      if (id !== token || signal.aborted || !track.isConnected) return;
      const list = data && Array.isArray(data.episodes) ? data.episodes.filter((ep) => ep.episode_number > 0) : [];
      renderCards(list.length ? list : Array.from({ length: meta.episode_count }, (_, i) => ({ episode_number: i + 1 })));
      if (animate || !cached) fadeTrack();
    }

    track.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        syncArrows();
      });
    }, { passive: true });

    track.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || track.scrollWidth - track.clientWidth <= 4) return;
      e.preventDefault();
      track.scrollLeft += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    }, { passive: false });

    track.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const list = cards().filter((c) => !c.disabled);
      const index = list.indexOf(document.activeElement);
      if (index < 0) return;
      e.preventDefault();
      const target = list[Math.max(0, Math.min(list.length - 1, index + (e.key === 'ArrowRight' ? 1 : -1)))];
      target.focus({ preventScroll: true });
      select(target);
    });

    prev.addEventListener('click', () => page(-1));
    next.addEventListener('click', () => page(1));

    const observer = new ResizeObserver(syncArrows);
    observer.observe(track);
    disposers.add(() => observer.disconnect());

    const seasonPicker = seasonRow(seasons, season, (n) => {
      if (n === season) return;
      season = n;
      episode = 0;
      label.textContent = `Play S${season}`;
      loadSeason(n, true);
    });
    disposers.add(seasonPicker.dispose);

    const count = seasons.filter((s) => s.season_number > 0).length || seasons.length;
    const meta = [yearOf(show.first_air_date), `${count} Season${count === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
    const nodes = [pickerHead(show.name || 'TV Show', meta), seasonPicker.node, rail, play];

    play.addEventListener('click', go);
    updateLabel();
    loadSeason(season, false);
    return nodes;
  }

  function showTv(route, show) {
    if (!session) return;
    const tvRoute = { type: 'tv', id: route.id, s: route.s };
    session.route = tvRoute;
    setHash({ type: 'tv', id: route.id }, false);
    const seasons = playableSeasons(show);
    if (!seasons.length) {
      showPicker(() => buildMessage(show.name || 'TV Show', 'No episodes are available to watch yet.', [secondaryButton('Back to home', requestClose)]));
      return;
    }
    showPicker(() => buildTvPicker(tvRoute, show, seasons), true);
    showBackdrop(show.backdrop_path);
  }

  async function switchToTv(route, show) {
    if (!session) return;
    const current = session;
    await hidePicker(true);
    if (session !== current) return;
    showTv(route, show);
  }

  function embedUrl(route) {
    const params = new URLSearchParams();
    if (route.type === 'tv') {
      params.set('s', route.s);
      params.set('e', route.e);
    }
    params.set('back', 'close');
    params.set('autoplay', 'true');
    params.set('color', '#d4d4d8');
    return `${CINESRC}/embed/${route.type}/${route.id}?${params}`;
  }

  function loadEmbed(route) {
    if (!session) return;
    playing = false;
    session.loadedAt = performance.now();
    session.starting = false;
    clearTimeout(autoplayTimer);
    const iframe = document.createElement('iframe');
    iframe.src = embedUrl(route);
    iframe.title = route.type === 'tv' ? 'Episode player' : 'Movie player';
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation allow-orientation-lock');
    iframe.referrerPolicy = 'origin';
    iframe.addEventListener('load', () => {
      clearTimeout(readyTimer);
      readyTimer = setTimeout(markReady, 600);
    }, { once: true });
    clearTimeout(readyTimer);
    readyTimer = setTimeout(markReady, 8000);
    frame.replaceChildren(iframe);
  }

  async function playRoute(route) {
    if (!session || session.starting) return;
    const current = session;
    current.starting = true;
    current.route = route;
    setHash(route, false);
    await hidePicker();
    if (session !== current) return;
    player.scrollTop = 0;
    loadEmbed(route);
  }

  async function retry(route) {
    if (!session) return;
    const current = session;
    await hidePicker();
    const result = await resolveRoute(route, current.controller.signal);
    if (session !== current) return;
    handleResult(route, result);
  }

  function handleResult(route, result) {
    if (!session) return;
    switch (result.kind) {
      case 'movie':
        session.route = { type: 'movie', id: route.id };
        setHash(session.route, false);
        loadEmbed(session.route);
        break;
      case 'tv':
        showTv(route, result.show);
        break;
      case 'choose':
        showPicker(() => buildChooser(route, result.movie, result.show), true);
        break;
      case 'error':
        showPicker(() => buildMessage("Couldn't reach TMDB", 'Check your connection and try again.', [
          secondaryButton('Try again', () => retry(route)),
          secondaryButton('Back to home', requestClose)
        ]));
        break;
      default:
        showPicker(() => buildMessage('Nothing found', `No movie or show matches TMDB ID ${route.id}.`, [
          secondaryButton('Back to home', requestClose)
        ]));
    }
  }

  function markReady() {
    clearTimeout(readyTimer);
    if (!session || player.classList.contains('is-ready')) return;
    const iframe = frame.querySelector('iframe');
    if (!iframe) return;
    const wait = LOADER_MIN - (performance.now() - (session.loadedAt || 0));
    if (wait > 0 && !reduced.matches) {
      readyTimer = setTimeout(markReady, wait);
      return;
    }
    player.classList.add('is-ready');
    iframe.focus({ preventScroll: true });
  }

  function sendCommand(command, args = []) {
    const iframe = frame && frame.querySelector('iframe');
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage({ type: 'cinesrc:command', command, args }, CINESRC);
  }

  function startPlayback() {
    if (playing) return;
    sendCommand('play');
    clearTimeout(autoplayTimer);
    autoplayTimer = setTimeout(() => {
      if (playing || !session) return;
      sendCommand('setMuted', [true]);
      sendCommand('play');
    }, 3000);
  }

  async function openPlayer(route, { push = true, fullscreen = true } = {}) {
    if (!player || !frame || session) return;
    const pending = fullscreen ? enterFullscreen() : Promise.resolve();
    const current = { route, hash: '', controller: new AbortController(), loadedAt: 0, starting: false };
    session = current;
    playing = false;
    clearTimeout(autoplayTimer);
    setHash(route, push);

    dispose();
    hideBackdrop();
    player.classList.remove('is-ready', 'is-picking', 'is-wide');
    player.scrollTop = 0;
    if (picker) {
      picker.hidden = true;
      picker.replaceChildren();
    }

    const direct = route.type === 'movie' || (route.type === 'tv' && route.s && route.e);
    if (direct) loadEmbed(route);
    const resolving = direct ? null : resolveRoute(route, current.controller.signal);

    await pending;
    await frames();
    if (session !== current) return;

    const clip = fieldClip();
    const still = reduced.matches;
    player.hidden = false;
    hideHome();
    const morph = player.animate(
      still
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { clipPath: clip, opacity: 0 },
            { clipPath: clip, opacity: 1, offset: 0.1 },
            { clipPath: FULL_CLIP, opacity: 1 }
          ],
      { duration: still ? 250 : 900, easing: EASE_MORPH }
    );

    if (!resolving) return;
    const [result] = await Promise.all([resolving, settle([morph])]);
    if (session !== current) return;
    handleResult(route, result);
  }

  async function closePlayer() {
    if (!session || closing) return;
    closing = true;
    dispose();
    session.controller.abort();
    await leaveFullscreen();
    await frames();

    const clip = fieldClip();
    const still = reduced.matches;
    const homeIn = showHome();
    const out = player.animate(
      still
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { clipPath: FULL_CLIP, opacity: 1, filter: 'blur(0px)' },
            { clipPath: clip, opacity: 1, filter: 'blur(2px)', offset: 0.8 },
            { clipPath: clip, opacity: 0, filter: 'blur(8px)' }
          ],
      { duration: still ? 250 : 850, easing: EASE_MORPH, fill: 'forwards' }
    );
    await Promise.all([settle([out]), homeIn]);

    clearTimeout(readyTimer);
    clearTimeout(autoplayTimer);
    playing = false;
    player.hidden = true;
    player.classList.remove('is-ready', 'is-picking', 'is-wide');
    player.scrollTop = 0;
    hideBackdrop();
    if (picker) {
      picker.hidden = true;
      picker.replaceChildren();
    }
    frame.replaceChildren();
    out.cancel();
    if (searchInput) searchInput.value = '';
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (routeFromHash()) {
      try {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch (err) {
        console.warn('[Parallax TV] Could not update history:', err);
      }
    }
    session = null;
    closing = false;
  }

  function requestClose() {
    if (history.state && history.state.parallax) history.back();
    else closePlayer();
  }

  if (backButton) backButton.addEventListener('click', requestClose);

  window.addEventListener('message', (event) => {
    if (event.origin !== CINESRC || !session || !event.data) return;
    switch (event.data.type) {
      case 'cinesrc:ready':
        markReady();
        sendCommand('play');
        break;
      case 'cinesrc:loadedmetadata':
        startPlayback();
        break;
      case 'cinesrc:play':
        playing = true;
        clearTimeout(autoplayTimer);
        break;
      case 'cinesrc:pause':
      case 'cinesrc:ended':
        playing = false;
        break;
      case 'cinesrc:nextepisode':
        if (session.route.type === 'tv' && event.data.season && event.data.episode) {
          session.route = { type: 'tv', id: session.route.id, s: String(event.data.season), e: String(event.data.episode) };
          setHash(session.route, false);
        }
        break;
      case 'cinesrc:close':
        requestClose();
        break;
    }
  });

  window.addEventListener('popstate', () => {
    const route = routeFromHash();
    if (session && (!route || window.location.hash !== session.hash)) closePlayer();
    else if (!session && route) openPlayer(route, { push: false, fullscreen: false });
  });

  const initialRoute = routeFromHash();
  if (initialRoute) openPlayer(initialRoute, { push: false, fullscreen: false });

  brand.addEventListener('click', refresh);

  window.ParallaxTV = Object.assign(window.ParallaxTV || {}, {
    refresh,
    play: (id, s, e) => openPlayer(
      s && e ? { type: 'tv', id: String(id), s: String(s), e: String(e) } : { type: 'auto', id: String(id) }
    ),
    close: requestClose,
    onRefresh(fn) {
      loaders.add(fn);
      return () => loaders.delete(fn);
    }
  });
})();