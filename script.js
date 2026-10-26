(() => {
  'use strict';

  const nativeAnimate = Element.prototype.animate;
  if (nativeAnimate) {
    Element.prototype.animate = function animate(keyframes, options) {
      const tier = document.documentElement.dataset.fx;
      if ((tier === 'low' || tier === 'medium') && Array.isArray(keyframes)) {
        keyframes = keyframes.map((frame) => {
          if (!frame || typeof frame.filter !== 'string' || !frame.filter.includes('blur(')) return frame;
          const next = { ...frame };
          next.filter = tier === 'low'
            ? frame.filter.replace(/blur\((?:[^()]|\([^()]*\))*\)/g, '').trim()
            : frame.filter.replace(/blur\(\s*([\d.]+)px\s*\)/g, (_, px) => `blur(${Number(px) / 2}px)`);
          if (!next.filter) delete next.filter;
          return next;
        });
      }
      return nativeAnimate.call(this, keyframes, options);
    };
  }

  const MOBILE_UA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Silk|Kindle/i;

  function isMobile() {
    const ua = navigator.userAgent || '';
    if (navigator.userAgentData && navigator.userAgentData.mobile) return true;
    if (MOBILE_UA.test(ua)) return true;
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
    return window.matchMedia('(pointer: coarse) and (hover: none)').matches;
  }

  function showGate() {
    const line = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    document.documentElement.classList.add('is-gated');
    const gate = document.createElement('div');
    gate.className = 'gate';
    gate.setAttribute('role', 'alertdialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-labelledby', 'gate-title');
    gate.setAttribute('aria-describedby', 'gate-text');
    gate.innerHTML = `<div class="gate__card"><img class="gate__logo" src="icon.svg" alt="" width="56" height="56"><span class="gate__chip">${line('<rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>')}Desktop only</span><h1 class="gate__title" id="gate-title">Parallax TV is made for PC</h1><p class="gate__text" id="gate-text">We're building for the big screen first. Open Parallax TV on a desktop or laptop for the full experience.</p><button class="gate__copy" type="button"><span class="gate__link">${line('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>')}</span><span class="gate__ok">${line('<polyline points="20 6 9 17 4 12"></polyline>')}</span><span class="gate__label">Copy link for your PC</span></button><p class="gate__note">Mobile support is coming soon.</p></div>`;
    const copy = gate.querySelector('.gate__copy');
    const label = gate.querySelector('.gate__label');
    let timer = 0;
    copy.addEventListener('click', async () => {
      let ok = false;
      try {
        await navigator.clipboard.writeText(window.location.href.split('#')[0]);
        ok = true;
      } catch (err) {
        ok = false;
      }
      copy.classList.toggle('is-done', ok);
      label.textContent = ok ? 'Link copied' : 'Copy the link from your address bar';
      clearTimeout(timer);
      timer = setTimeout(() => {
        copy.classList.remove('is-done');
        label.textContent = 'Copy link for your PC';
      }, 2400);
    });
    document.body.append(gate);
  }

  if (isMobile()) {
    showGate();
    return;
  }

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
      input.addEventListener('focus', () => {
        sweep();
        if (input.value.trim()) runSearch(input.value, 0);
      });
      input.addEventListener('input', () => {
        hideHint();
        runSearch(input.value, SEARCH_DEBOUNCE);
      });
      input.addEventListener('keydown', onSearchKeydown);
    }
    sweep(1300);
  }

  const CINESRC = 'https://cinesrc.st';
  const TMDB_KEY = '';
  const TMDB_TOKEN = '';
  const TMDB_API = `${window.location.origin}/api/tmdb`;
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
  let errorTimer = 0;
  let playing = false;

  const ICONS = {
    info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>',
    success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
    error: '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>',
    offline: '<line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line>',
    online: '<path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line>',
    code: '<polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>',
    refresh: '<polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>',
    gauge: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
    tv: '<rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline>',
    film: '<rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line>',
    close: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
    left: '<polyline points="15 18 9 12 15 6"></polyline>',
    right: '<polyline points="9 18 15 12 9 6"></polyline>',
    down: '<polyline points="6 9 12 15 18 9"></polyline>',
    check: '<polyline points="20 6 9 17 4 12"></polyline>',
    ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path><path d="M13 5v2"></path><path d="M13 17v2"></path><path d="M13 11v2"></path>',
    play: '<path fill="currentColor" stroke="none" d="M5 5.27368C5 3.56682 6.82609 2.48151 8.32538 3.2973L20.687 10.0235C22.2531 10.8756 22.2531 13.124 20.687 13.9762L8.32538 20.7024C6.82609 21.5181 5 20.4328 5 18.726V5.27368Z"></path>'
  };

  const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const yearOf = (date) => (date ? date.slice(0, 4) : '');
  const motion = () => (reduced.matches ? 'auto' : 'smooth');
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const seasonName = (n) => (n === 0 ? 'Specials' : `Season ${n}`);

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function dayOffset(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
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

  const results = document.getElementById('results');
  const resultsList = document.getElementById('results-list');
  const resultsLabel = document.getElementById('results-label');
  const resultsTabs = results ? [...results.querySelectorAll('.results__tab')] : [];
  const SEARCH_DEBOUNCE = 650;
  const SEARCH_LIMIT = 10;
  const SEARCH_MIN = 2;
  let searchTimer = 0;
  let searchAbort = null;
  let searchSeq = 0;
  let lastQuery = '';
  let searchItems = [];
  let searchFilter = 'all';
  let searchActive = -1;
  let searchMode = 'results';
  let panelOpen = false;
  let panelAnim = null;
  const tabsBar = results ? results.querySelector('.results__tabs') : null;
  const tabsPill = el('span', 'results__pill');
  tabsPill.setAttribute('aria-hidden', 'true');
  if (tabsBar) tabsBar.prepend(tabsPill);
  const resultsCount = results ? el('span', 'results__count') : null;
  if (resultsCount) {
    resultsCount.setAttribute('aria-hidden', 'true');
    results.append(resultsCount);
  }
  const resultsPrev = document.getElementById('results-prev');
  const resultsNext = document.getElementById('results-next');
  const resultsDots = document.getElementById('results-dots');
  const resultsBar = document.getElementById('results-bar');
  let searchTouched = false;
  let swipeX = null;
  let swiped = false;

  function searchVisible() {
    return searchItems;
  }

  function paintTabs(animate) {
    resultsTabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.filter === searchFilter)));
    const tab = resultsTabs.find((t) => t.dataset.filter === searchFilter);
    if (!tab || !tab.offsetWidth) return;
    const instant = !animate || reduced.matches;
    if (instant) tabsPill.style.transition = 'none';
    tabsPill.style.width = `${tab.offsetWidth}px`;
    tabsPill.style.transform = `translateX(${tab.offsetLeft}px)`;
    tabsPill.classList.add('is-visible');
    if (instant) {
      tabsPill.getBoundingClientRect();
      tabsPill.style.transition = '';
    }
  }

  function openResults() {
    if (!results || panelOpen) return;
    panelOpen = true;
    if (panelAnim) panelAnim.cancel();
    results.hidden = false;
    if (content) content.classList.add('is-searching');
    if (searchInput) searchInput.setAttribute('aria-expanded', 'true');
    paintTabs(false);
    if (!reduced.matches) {
      panelAnim = results.animate(
        [
          { opacity: 0, translate: '0 -8px', scale: '.985' },
          { opacity: 1, translate: '0 0', scale: '1' }
        ],
        { duration: 460, easing: EASE }
      );
    }
  }

  function closeResults() {
    clearTimeout(searchTimer);
    searchSeq++;
    if (searchAbort) searchAbort.abort();
    if (searchInput) {
      searchInput.setAttribute('aria-expanded', 'false');
      searchInput.removeAttribute('aria-activedescendant');
    }
    searchActive = -1;
    if (content) content.classList.remove('is-searching');
    if (!results || !panelOpen) return;
    panelOpen = false;
    if (panelAnim) panelAnim.cancel();
    const done = () => {
      if (panelOpen) return;
      results.hidden = true;
      if (resultsList) resultsList.replaceChildren();
    };
    if (reduced.matches) {
      done();
      return;
    }
    const anim = results.animate(
      [
        { opacity: 1, translate: '0 0', scale: '1' },
        { opacity: 0, translate: '0 -6px', scale: '.985' }
      ],
      { duration: 260, easing: 'ease-in', fill: 'forwards' }
    );
    panelAnim = anim;
    anim.finished.then(() => {
      done();
      anim.cancel();
    }).catch(() => {});
  }

  function paintActive() {
    if (!searchInput) return;
    const row = resultsList ? resultsList.querySelector('.result:not(.is-skeleton):not([data-leaving])') : null;
    if (row && searchActive >= 0) searchInput.setAttribute('aria-activedescendant', row.id);
    else searchInput.removeAttribute('aria-activedescendant');
  }

  function paintDots() {
    const many = searchItems.length > 1;
    if (results) results.classList.toggle('is-cycling', many);
    if (resultsCount) resultsCount.textContent = many && searchActive >= 0 ? `${searchActive + 1} / ${searchItems.length}` : '';
    if (!resultsDots) return;
    if (resultsBar) resultsBar.hidden = !many;
    if (!many) {
      resultsDots.replaceChildren();
      return;
    }
    if (resultsDots.children.length !== searchItems.length) {
      resultsDots.replaceChildren(...searchItems.map((_, i) => {
        const dot = el('button', 'results__dot');
        dot.type = 'button';
        dot.addEventListener('pointerdown', (e) => e.preventDefault());
        dot.addEventListener('click', () => showMatch(i));
        return dot;
      }));
    }
    [...resultsDots.children].forEach((dot, i) => {
      dot.setAttribute('aria-label', `Result ${i + 1} of ${searchItems.length}`);
      dot.setAttribute('aria-current', String(i === searchActive));
    });
  }

  function preloadMatch(index) {
    const item = searchItems[index];
    if (!item) return;
    const path = item.backdrop_path ? `w780${item.backdrop_path}` : item.poster_path ? `w500${item.poster_path}` : '';
    if (path) new Image().src = `${TMDB_IMG}${path}`;
  }

  function showMatch(index, dir = 0) {
    const count = searchItems.length;
    if (count < 2 || !panelOpen) return;
    const next = ((index % count) + count) % count;
    if (next === searchActive) return;
    const step = dir || Math.sign(next - searchActive) || 1;
    const id = searchSeq;
    searchActive = next;
    searchTouched = true;
    paintDots();
    swapRows([resultRow(searchItems[next])], step, id).then(() => {
      if (id === searchSeq) paintActive();
    });
    preloadMatch((next + step + count) % count);
  }

  function cycleResults(dir) {
    showMatch(searchActive + dir, dir);
  }

  function skeletonResult() {
    const row = el('div', 'result is-skeleton');
    row.setAttribute('aria-hidden', 'true');
    const body = el('span', 'result__body');
    body.append(el('span', 'ep__bar'), el('span', 'ep__bar ep__bar--short'), el('span', 'ep__bar'));
    row.append(body);
    return row;
  }

  function paintTitle(node, title, term) {
    node.replaceChildren();
    const q = (term || '').trim().toLowerCase();
    if (!q) {
      node.textContent = title;
      return;
    }
    const lower = title.toLowerCase();
    let i = 0;
    let idx = lower.indexOf(q, i);
    if (idx === -1) {
      node.textContent = title;
      return;
    }
    while (idx !== -1) {
      if (idx > i) node.append(document.createTextNode(title.slice(i, idx)));
      node.append(el('span', 'result__hit', title.slice(idx, idx + q.length)));
      i = idx + q.length;
      idx = lower.indexOf(q, i);
    }
    if (i < title.length) node.append(document.createTextNode(title.slice(i)));
  }

  function nudgeIntoView(node, box, horizontal) {
    if (!node || !box) return;
    const r = node.getBoundingClientRect();
    const c = box.getBoundingClientRect();
    const behavior = motion();
    if (horizontal) {
      if (r.left < c.left - 1) box.scrollTo({ left: box.scrollLeft - (c.left - r.left), behavior });
      else if (r.right > c.right + 1) box.scrollTo({ left: box.scrollLeft + (r.right - c.right), behavior });
    } else {
      if (r.top < c.top - 1) box.scrollTo({ top: box.scrollTop - (c.top - r.top), behavior });
      else if (r.bottom > c.bottom + 1) box.scrollTo({ top: box.scrollTop + (r.bottom - c.bottom), behavior });
    }
  }

  function revealRow(row) {
    const list = row.closest('.results__list');
    nudgeIntoView(row, list, false);
    setTimeout(() => {
      if (row.isConnected && (row.matches(':hover') || row.dataset.active)) nudgeIntoView(row, list, false);
    }, 550);
  }

  function revealCard(card) {
    nudgeIntoView(card, card.closest('.row__track'), true);
  }

  function fmtRuntime(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h ? `${h}h ${m}m` : `${m}m`;
  }

  function paintMeta(meta, parts) {
    meta.replaceChildren();
    parts.forEach(([text, cls], i) => {
      if (i) meta.append(document.createTextNode(' · '));
      meta.append(cls ? el('span', cls, text) : document.createTextNode(text));
    });
  }

  function resultRow(item) {
    const kind = item.media_type === 'tv' ? 'tv' : 'movie';
    const title = kind === 'tv' ? (item.name || item.original_name) : (item.title || item.original_title);
    const year = yearOf(kind === 'tv' ? item.first_air_date : item.release_date);
    const row = el('button', 'result');
    row.type = 'button';
    row.id = `result-${kind}-${item.id}`;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', 'true');
    row.dataset.active = 'true';
    const artPath = item.backdrop_path
      ? `${TMDB_IMG}w780${item.backdrop_path}`
      : item.poster_path
        ? `${TMDB_IMG}w500${item.poster_path}`
        : '';
    if (artPath) {
      const art = el('span', 'result__art');
      const img = el('img');
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.loading = 'lazy';
      img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
      img.addEventListener('error', () => {
        art.remove();
      }, { once: true });
      img.src = artPath;
      art.append(img);
      row.append(art);
    }
    const body = el('span', 'result__body');
    const titleEl = el('span', 'result__title');
    paintTitle(titleEl, title || 'Untitled', searchMode === 'results' ? lastQuery : '');
    body.append(titleEl);
    const meta = el('span', 'result__meta');
    const base = [];
    if (item.vote_average) base.push([`★ ${item.vote_average.toFixed(1)}`, 'result__rating']);
    if (year) base.push([year]);
    base.push([kind === 'tv' ? 'TV Series' : 'Movie']);
    paintMeta(meta, base);
    body.append(meta);
    const more = el('span', 'result__more');
    const moreInner = el('span', 'result__more-inner');
    if (item.overview) moreInner.append(el('span', 'result__overview', item.overview));
    const actions = el('span', 'result__actions');
    const cta = el('span', 'result__cta');
    cta.append(svgIcon('play', 'result__cta-icon'), el('span', null, 'Watch now'));
    actions.append(cta);
    moreInner.append(actions);
    more.append(moreInner);
    body.append(more);
    row.append(body);
    row.addEventListener('click', () => chooseResult(item));
    tmdb(kind === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`).then((data) => {
      if (!data || !meta.isConnected) return;
      let extra = '';
      if (kind === 'tv') {
        const ep = (data.episode_run_time || []).find(Boolean);
        if (ep) extra = `${ep}m / ep`;
        else if (data.number_of_seasons) extra = `${data.number_of_seasons} Season${data.number_of_seasons === 1 ? '' : 's'}`;
      } else if (data.runtime) {
        extra = fmtRuntime(data.runtime);
      }
      if (extra) paintMeta(meta, [...base, [extra]]);
    }).catch(() => {});
    row.addEventListener('mouseenter', () => revealRow(row));
    row.addEventListener('focus', () => revealRow(row));
    return row;
  }

  function resultsEmpty(message, retry) {
    const wrap = el('div', 'results__empty');
    wrap.append(el('p', null, message));
    if (retry) wrap.append(secondaryButton('Try again', retry));
    return wrap;
  }

  function rankMatches(pool, query) {
    const q = query.toLowerCase();
    const tier = (item) => {
      const title = (item.media_type === 'tv' ? item.name || item.original_name : item.title || item.original_title) || '';
      const t = title.toLowerCase();
      const known = (item.vote_count || 0) >= 20 || (item.popularity || 0) >= 5;
      let score = known && t === q ? 0 : known && t.startsWith(q) ? 1 : 2;
      if (!item.poster_path && !item.backdrop_path) score += 3;
      return score;
    };
    return pool
      .map((item, index) => ({ item, index, tier: tier(item) }))
      .sort((a, b) => a.tier - b.tier || a.index - b.index)
      .map((entry) => entry.item);
  }

  async function fetchMatches(query, filter, signal) {
    if (/^\d+$/.test(query)) {
      const [movie, show] = await Promise.all([
        filter === 'tv' ? Promise.resolve(null) : tmdb(`/movie/${query}`, signal),
        filter === 'movie' ? Promise.resolve(null) : tmdb(`/tv/${query}`, signal)
      ]);
      if (movie === undefined && show === undefined) return undefined;
      const items = [];
      if (movie) items.push({ ...movie, media_type: 'movie' });
      if (show) items.push({ ...show, media_type: 'tv' });
      return { items, byId: true };
    }
    const path = filter === 'all' ? '/search/multi' : `/search/${filter}`;
    const data = await tmdb(path, signal, { query, include_adult: 'false', language: 'en-US', page: '1' });
    if (!data || !Array.isArray(data.results)) return undefined;
    const pool = data.results
      .map((item) => (filter === 'all' ? item : { ...item, media_type: filter }))
      .filter((item) => item.media_type === 'movie' || item.media_type === 'tv');
    return { items: rankMatches(pool, query).slice(0, SEARCH_LIMIT), byId: false };
  }

  async function swapRows(nodes, dir, id) {
    if (!resultsList) return;
    const leaving = [...resultsList.children];
    const startH = resultsList.offsetHeight;
    if (leaving.length && !reduced.matches) {
      const outs = leaving.map((node) => {
        if (node.dataset.leaving) return node.getAnimations()[0];
        node.dataset.leaving = 'true';
        return node.animate(
          [
            { opacity: 1, translate: '0 0' },
            { opacity: 0, translate: dir ? `${dir * -20}px 0` : '0 -6px' }
          ],
          { duration: 200, easing: 'ease-in', fill: 'forwards' }
        );
      }).filter(Boolean);
      await settle(outs);
      if (id !== searchSeq) return;
    }
    resultsList.replaceChildren(...nodes);
    resultsList.scrollTop = 0;
    if (reduced.matches) return;
    const endH = resultsList.offsetHeight;
    if (Math.abs(endH - startH) > 1) {
      resultsList.animate([{ height: `${startH}px` }, { height: `${endH}px` }], { duration: 440, easing: EASE });
    }
    nodes.forEach((node, i) => node.animate(
      [
        { opacity: 0, translate: dir ? `${dir * 24}px 0` : '0 10px' },
        { opacity: 1, translate: '0 0' }
      ],
      { duration: 500, delay: i * 55, easing: EASE, fill: 'backwards' }
    ));
  }

  async function showResults(dir = 0) {
    const query = lastQuery;
    if (!query || !resultsList) return;
    const id = ++searchSeq;
    if (searchAbort) searchAbort.abort();
    const controller = new AbortController();
    searchAbort = controller;
    const filter = searchFilter;
    const found = await fetchMatches(query, filter, controller.signal);
    if (id !== searchSeq || controller.signal.aborted) return;
    openResults();
    searchActive = -1;
    if (!found) {
      searchItems = [];
      paintDots();
      if (resultsLabel) resultsLabel.textContent = "Couldn't reach TMDB";
      await swapRows([resultsEmpty('Check your connection and try again.', () => showResults(0))], dir, id);
      return;
    }
    const noun = filter === 'movie' ? 'movie' : filter === 'tv' ? 'show' : 'title';
    searchItems = found.items;
    searchMode = found.byId ? 'id' : 'results';
    searchActive = searchItems.length ? 0 : -1;
    searchTouched = false;
    paintDots();
    if (resultsLabel) {
      resultsLabel.textContent = found.byId
        ? (found.items.length ? `TMDB ID ${query}` : `No ${noun} with TMDB ID ${query}`)
        : (found.items.length ? `Best matches for “${query}”` : `No ${noun}s match “${query}”`);
    }
    const nodes = found.items.length
      ? [resultRow(found.items[0])]
      : [resultsEmpty(found.byId ? 'Try another ID or search by title.' : 'Try a different spelling or a TMDB ID.')];
    await swapRows(nodes, dir, id);
    if (id !== searchSeq) return;
    paintActive();
    preloadMatch(1);
    preloadMatch(found.items.length - 1);
    if (filter === 'all') ['movie', 'tv'].forEach((f) => fetchMatches(query, f));
  }

  function chooseResult(item) {
    const kind = item.media_type === 'tv' ? 'tv' : 'movie';
    rememberSearch(lastQuery);
    closeResults();
    if (searchInput) searchInput.value = '';
    openPlayer({ type: kind, id: String(item.id) }, { push: true, fullscreen: true });
  }

  function runSearch(raw, delay = SEARCH_DEBOUNCE) {
    clearTimeout(searchTimer);
    const query = (raw || '').trim();
    if (!query || (!/^\d+$/.test(query) && query.length < SEARCH_MIN)) {
      lastQuery = '';
      closeResults();
      return;
    }
    searchTimer = setTimeout(() => {
      if (query === lastQuery && panelOpen) return;
      lastQuery = query;
      showResults(0);
    }, delay);
  }

  function onSearchKeydown(e) {
    if (!results || results.hidden) return;
    const rows = searchVisible();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      cycleResults(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter') {
      const query = searchInput ? searchInput.value.trim() : '';
      if (rows[searchActive] && query === lastQuery && (searchTouched || searchMode === 'results')) {
        e.preventDefault();
        chooseResult(rows[searchActive]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeResults();
      if (searchInput) searchInput.blur();
    }
  }

  resultsTabs.forEach((tab, index) => {
    tab.addEventListener('pointerdown', (e) => e.preventDefault());
    tab.addEventListener('click', () => {
      const next = tab.dataset.filter;
      if (next === searchFilter) return;
      const from = resultsTabs.findIndex((t) => t.dataset.filter === searchFilter);
      searchFilter = next;
      paintTabs(true);
      showResults(Math.sign(index - from) || 1);
    });
  });

  [[resultsPrev, -1], [resultsNext, 1]].forEach(([button, dir]) => {
    if (!button) return;
    button.addEventListener('pointerdown', (e) => e.preventDefault());
    button.addEventListener('click', () => cycleResults(dir));
  });

  if (results) results.addEventListener('keydown', (e) => {
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || !e.target.closest('.results__list, .results__bar')) return;
    e.preventDefault();
    cycleResults(e.key === 'ArrowRight' ? 1 : -1);
  });

  if (resultsList) {
    resultsList.addEventListener('pointerdown', (e) => {
      swipeX = e.pointerType === 'mouse' ? null : e.clientX;
    });
    resultsList.addEventListener('pointerup', (e) => {
      if (swipeX === null) return;
      const dx = e.clientX - swipeX;
      swipeX = null;
      if (Math.abs(dx) < 40) return;
      swiped = true;
      setTimeout(() => { swiped = false; }, 350);
      cycleResults(dx < 0 ? 1 : -1);
    });
    resultsList.addEventListener('pointercancel', () => { swipeX = null; });
    resultsList.addEventListener('click', (e) => {
      if (!swiped) return;
      swiped = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  document.addEventListener('pointerdown', (e) => {
    if (results && !results.hidden && search && !search.contains(e.target)) closeResults();
  }, true);

  const RECENT_KEY = 'parallax:recent';
  const RECENT_MAX = 5;
  let recents = loadRecents();
  const recentsBox = search && searchInput ? el('div', 'recents') : null;
  const recentsList = el('div', 'recents__list');

  function loadRecents() {
    try {
      const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(list) ? list.filter((q) => typeof q === 'string' && q.trim()).slice(0, RECENT_MAX) : [];
    } catch (err) {
      return [];
    }
  }

  function saveRecents() {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recents));
    } catch (err) {
      console.warn('[Parallax TV] Could not save recent searches:', err);
    }
  }

  function rememberSearch(query) {
    const text = (query || '').trim().slice(0, 60);
    if (!text) return;
    recents = [text, ...recents.filter((q) => q.toLowerCase() !== text.toLowerCase())].slice(0, RECENT_MAX);
    saveRecents();
    renderRecents();
  }

  function forgetSearch(query, chip) {
    recents = recents.filter((q) => q !== query);
    saveRecents();
    if (!recents.length || !chip || reduced.matches) {
      paintRecents();
      if (recentsBox && !recentsBox.classList.contains('is-visible')) return;
      renderRecents();
      return;
    }
    if (chip.classList.contains('is-leaving')) return;
    chip.classList.add('is-leaving');
    const width = chip.offsetWidth;
    const out = chip.animate(
      [
        { opacity: 1, filter: 'blur(0px)', transform: 'scale(1)', width: `${width}px`, marginRight: '0px' },
        { opacity: 0, filter: 'blur(4px)', transform: 'scale(.86)', width: '0px', marginRight: '-8px' }
      ],
      { duration: 420, easing: EASE, fill: 'forwards' }
    );
    settle([out]).then(() => {
      if (chip.isConnected) chip.remove();
    });
  }

  function renderRecents() {
    if (!recentsBox) return;
    recentsList.replaceChildren(...recents.map((query, i) => {
      const chip = el('span', 'recent');
      chip.style.setProperty('--ri', String(i));
      const pick = el('button', 'recent__pick', query);
      pick.type = 'button';
      pick.title = query;
      pick.addEventListener('click', () => {
        searchInput.value = query;
        searchInput.focus({ preventScroll: true });
        hideHint();
        runSearch(query, 0);
        paintRecents();
      });
      const drop = el('button', 'recent__drop');
      drop.type = 'button';
      drop.setAttribute('aria-label', `Remove ${query} from recent searches`);
      drop.append(svgIcon('close', 'recent__drop-icon'));
      drop.addEventListener('click', () => forgetSearch(query, chip));
      chip.append(pick, drop);
      return chip;
    }));
  }

  function paintRecents() {
    if (!recentsBox || !searchInput) return;
    const focused = document.activeElement === searchInput || recentsBox.contains(document.activeElement);
    const show = focused && !content.classList.contains('is-quiet') && !searchInput.value.trim() && recents.length > 0 && !panelOpen && !(hint && hint.classList.contains('is-visible'));
    if (show && !recentsBox.classList.contains('is-visible')) renderRecents();
    recentsBox.classList.toggle('is-visible', show);
  }

  if (recentsBox) {
    recentsBox.setAttribute('role', 'group');
    recentsBox.setAttribute('aria-label', 'Recent searches');
    recentsBox.append(el('span', 'recents__label', 'Recent'), recentsList);
    recentsBox.addEventListener('pointerdown', (e) => e.preventDefault());
    recentsBox.addEventListener('focusout', () => requestAnimationFrame(paintRecents));
    search.append(recentsBox);
    renderRecents();
    const wake = () => content.classList.remove('is-quiet');
    searchInput.addEventListener('focus', paintRecents);
    searchInput.addEventListener('input', () => {
      wake();
      paintRecents();
    });
    searchInput.addEventListener('blur', () => {
      wake();
      requestAnimationFrame(paintRecents);
    });
    search.addEventListener('pointerdown', () => {
      if (!content.classList.contains('is-quiet')) return;
      wake();
      requestAnimationFrame(paintRecents);
    });
    if (hint) new MutationObserver(paintRecents).observe(hint, { attributes: true, attributeFilter: ['class'] });
  }

  if (field && searchInput) {
    const clear = el('button', 'search__clear');
    clear.type = 'button';
    clear.setAttribute('aria-label', 'Clear search');
    clear.append(svgIcon('close', 'search__clear-icon'));
    clear.addEventListener('pointerdown', (e) => e.preventDefault());
    clear.addEventListener('click', () => {
      searchInput.value = '';
      hideHint();
      runSearch('', 0);
      searchInput.focus({ preventScroll: true });
      paintRecents();
    });
    field.append(clear);
  }

  const rowsMount = document.getElementById('rows');

  function posterCard(item, kind, extra = {}) {
    const title = kind === 'tv' ? (item.name || item.original_name) : (item.title || item.original_title);
    const year = yearOf(kind === 'tv' ? item.first_air_date : item.release_date);
    const card = el('button', 'poster');
    card.type = 'button';
    card.dataset.id = String(item.id);
    card.setAttribute('aria-label', `${title || 'Untitled'}${year ? `, ${year}` : ''}`);
    const art = el('span', 'poster__art');
    if (item.poster_path) {
      const img = el('img');
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.loading = 'lazy';
      img.addEventListener('error', () => {
        img.replaceWith(svgIcon('tv', 'ep__fallback'));
      }, { once: true });
      img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
      img.src = `${TMDB_IMG}w342${item.poster_path}`;
      art.append(img);
    } else {
      art.append(svgIcon('tv', 'ep__fallback'));
    }
    const body = el('span', 'poster__body');
    body.append(el('span', 'poster__title', title || 'Untitled'));
    const meta = [];
    if (item.vote_average) meta.push(`★ ${item.vote_average.toFixed(1)}`);
    if (year) meta.push(year);
    body.append(el('span', 'poster__meta', extra.sub || meta.join(' · ') || (kind === 'tv' ? 'TV Series' : 'Movie')));
    if (extra.badge) art.append(badgeEl(extra));
    if (extra.progress > 0) art.append(progressBar(extra.progress));
    art.append(el('span', 'poster__sheen'));
    card.append(art, body);
    card.addEventListener('click', () => openPlayer({ type: kind, id: String(item.id) }, { push: true, fullscreen: true, origin: art }));
    card.addEventListener('focus', () => {
      if (card.matches(':focus-visible')) revealCard(card);
    });
    return card;
  }

  function skeletonPoster() {
    const card = el('div', 'poster is-skeleton');
    card.setAttribute('aria-hidden', 'true');
    const body = el('span', 'poster__body');
    body.append(el('span', 'ep__bar'), el('span', 'ep__bar ep__bar--short'));
    card.append(el('span', 'poster__art'), body);
    return card;
  }

  function rowNav(dir, label) {
    const button = el('button', `row__nav row__nav--${dir < 0 ? 'prev' : 'next'}`);
    button.type = 'button';
    button.disabled = true;
    button.setAttribute('aria-label', `${label}: scroll ${dir < 0 ? 'left' : 'right'}`);
    button.append(svgIcon(dir < 0 ? 'left' : 'right', 'row__nav-icon'));
    return button;
  }

  function rowHead(label, sub, navs) {
    const head = el('div', 'row__head');
    const titles = el('div', 'row__titles');
    titles.append(el('h2', 'row__title', label));
    if (sub) titles.append(el('span', 'row__sub', sub));
    head.append(titles);
    if (navs) {
      const group = el('div', 'row__navs');
      group.append(...navs);
      head.append(group);
    }
    return head;
  }

  function badgeEl(extra) {
    return el('span', extra.live ? 'poster__badge is-live' : 'poster__badge', extra.badge);
  }

  function progressBar(pct) {
    const bar = el('span', 'ep__progress');
    const fill = el('span', 'ep__progress-fill');
    fill.style.width = `${Math.min(100, Math.max(4, pct * 100)).toFixed(1)}%`;
    bar.append(fill);
    return bar;
  }

  function episodeState(id, s, e) {
    const saved = progress[`tv:${id}:${s}:${e}`];
    const none = { done: false, pct: 0, left: 0 };
    if (!saved || typeof saved !== 'object') return none;
    if (saved.done) return { done: true, pct: 1, left: 0 };
    if (!saved.d || !(saved.t > 0)) return none;
    const pct = Math.min(1, saved.t / saved.d);
    if (pct >= 0.94) return { done: true, pct: 1, left: 0 };
    return { done: false, pct, left: Math.max(1, Math.round((saved.d - saved.t) / 60)) };
  }

  function wideCard(item, kind, extra = {}) {
    const title = titleOf(item, kind);
    const year = yearOf(kind === 'tv' ? item.first_air_date : item.release_date);
    const card = el('button', 'wide');
    card.type = 'button';
    card.setAttribute('aria-label', `${title}${year ? `, ${year}` : ''}`);
    const art = el('span', 'wide__art');
    const path = item.backdrop_path || item.poster_path;
    if (path) {
      const img = el('img');
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.loading = 'lazy';
      img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
      img.addEventListener('error', () => img.remove(), { once: true });
      img.src = `${TMDB_IMG}w780${path}`;
      art.append(img);
    }
    const body = el('span', 'wide__body');
    const meta = [];
    if (item.vote_average) meta.push(`★ ${item.vote_average.toFixed(1)}`);
    if (year) meta.push(year);
    body.append(el('span', 'wide__title', title), el('span', 'wide__meta', extra.sub || meta.join(' · ') || (kind === 'tv' ? 'TV Series' : 'Movie')));
    if (extra.desc) body.append(el('span', 'wide__desc', extra.desc));
    art.append(el('span', 'poster__sheen'), body);
    if (extra.badge) art.append(badgeEl(extra));
    if (extra.progress > 0) art.append(progressBar(extra.progress));
    card.append(art);
    card.addEventListener('click', () => openPlayer({ type: kind, id: String(item.id) }, { push: true, fullscreen: true, origin: art }));
    card.addEventListener('focus', () => {
      if (card.matches(':focus-visible')) revealCard(card);
    });
    return card;
  }

  function countdown(date) {
    const days = daysUntil(date);
    if (Number.isNaN(days)) return '';
    if (days < 0) return 'Out now';
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days <= 30) return `In ${days} days`;
    const weeks = Math.round(days / 7);
    return `In ${weeks} weeks`;
  }

  function heroKicker(kind, i, total) {
    const tag = el('span', 'spot__kicker');
    if (kind === 'tv') {
      tag.classList.add('is-channel');
      tag.style.setProperty('--gt', `${-Math.round(performance.now() % 2400)}ms`);
      const ch = el('span', 'spot__kicker-ch');
      ch.append(el('span', null, 'CH'), el('b', null, String(i + 1).padStart(2, '0')));
      const signal = el('span', 'spot__signal');
      signal.setAttribute('aria-hidden', 'true');
      signal.append(el('i'), el('i'), el('i'));
      const on = el('span', 'spot__kicker-on');
      on.append(signal, document.createTextNode('Trending'));
      tag.append(ch, on);
      return tag;
    }
    tag.classList.add('is-ticket');
    tag.style.setProperty('--gt', `${-Math.round(performance.now() % 4500)}ms`);
    const live = el('span', 'spot__kicker-live');
    live.append(svgIcon('ticket', 'spot__kicker-icon'), el('span', 'spot__kicker-text', 'Now showing'));
    const num = el('span', 'spot__kicker-num');
    num.append(el('b', null, String(i + 1).padStart(2, '0')), document.createTextNode(`/ ${String(total).padStart(2, '0')}`));
    tag.append(live, num);
    return tag;
  }

  function rankCard(item, kind, rank) {
    const title = titleOf(item, kind);
    const year = yearOf(kind === 'tv' ? item.first_air_date : item.release_date);
    const n = String(rank + 1);
    const card = el('button', rank < 3 ? 'rank is-podium' : 'rank');
    card.type = 'button';
    card.setAttribute('aria-label', `Number ${n}, ${title}${year ? `, ${year}` : ''}`);
    const num = el('span', 'rank__num', n);
    num.dataset.n = n;
    num.setAttribute('aria-hidden', 'true');
    const col = el('span', 'rank__col');
    const tilt = el('span', 'rank__tilt');
    const art = el('span', 'rank__art');
    if (item.poster_path) {
      const img = el('img');
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.loading = 'lazy';
      img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
      img.addEventListener('error', () => img.replaceWith(svgIcon('film', 'ep__fallback')), { once: true });
      img.src = `${TMDB_IMG}w342${item.poster_path}`;
      art.append(img);
    } else {
      art.append(svgIcon('film', 'ep__fallback'));
    }
    if (item.vote_average) {
      const score = el('span', 'rank__score');
      score.append(el('b', null, '★'), document.createTextNode(item.vote_average.toFixed(1)));
      art.append(score);
    }
    art.append(el('span', 'rank__glare'));
    tilt.append(art);
    const votes = item.vote_count ? `${new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(item.vote_count)} votes` : '';
    const body = el('span', 'rank__body');
    body.append(el('span', 'rank__title', title), el('span', 'rank__meta', [year, votes].filter(Boolean).join(' · ') || 'Movie'));
    col.append(tilt, body);
    card.append(num, col);
    card.addEventListener('pointermove', (e) => {
      if (reduced.matches || e.pointerType !== 'mouse') return;
      const r = tilt.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty('--rx', `${(-y * 7).toFixed(2)}deg`);
      card.style.setProperty('--ry', `${(x * 9).toFixed(2)}deg`);
      card.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty('--lx', x.toFixed(3));
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
      card.style.setProperty('--lx', '0');
    });
    card.addEventListener('click', () => openPlayer({ type: kind, id: String(item.id) }, { push: true, fullscreen: true, origin: art }));
    card.addEventListener('focus', () => {
      if (card.matches(':focus-visible')) revealCard(card);
    });
    return card;
  }

  function timelineGroups(kind, items, opts) {
    const groups = new Map();
    items.forEach((item) => {
      const date = kind === 'tv' ? item.first_air_date : item.release_date;
      if (!date) return;
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(item);
    });
    return [...groups.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(0, 12)
      .map(([date, list], i) => {
        const d = new Date(`${date}T00:00:00`);
        const group = el('div', i === 0 ? 'tl is-next' : 'tl');
        group.style.setProperty('--rd', `${Math.round((opts.delay || 0) + Math.min(i, 9) * 60)}ms`);
        const head = el('div', 'tl__date');
        const side = el('span', 'tl__side');
        side.append(
          el('span', 'tl__month', d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()),
          el('span', 'tl__weekday', d.toLocaleDateString(undefined, { weekday: 'long' }))
        );
        head.append(el('span', 'tl__day', String(d.getDate()).padStart(2, '0')), side);
        const when = countdown(date);
        const cards = el('div', 'tl__cards');
        cards.append(...list.slice(0, 3).map((item, n) => posterCard(item, kind, n === 0 && when ? { badge: when } : {})));
        group.append(head, cards);
        return group;
      });
  }

  function buildCards(kind, items, opts) {
    if (opts.layout === 'timeline') return timelineGroups(kind, items, opts);
    if (opts.layout === 'ranked') {
      return items.slice(0, 10).map((item, i) => {
        const card = rankCard(item, kind, i);
        card.style.setProperty('--rd', `${Math.round((opts.delay || 0) + Math.min(i, 9) * 60)}ms`);
        return card;
      });
    }
    return items.slice(0, 18).map((item, i) => {
      const k = kind === 'mixed' ? (item.media_type === 'tv' ? 'tv' : 'movie') : kind;
      const extra = opts.decorate ? opts.decorate(item) : {};
      const card = opts.layout === 'wide' ? wideCard(item, k, extra) : posterCard(item, k, extra);
      card.style.setProperty('--rd', `${Math.round((opts.delay || 0) + Math.min(i, 9) * 45)}ms`);
      return card;
    });
  }

  function curve(track) {
    const box = track.getBoundingClientRect();
    const mid = box.left + box.width / 2;
    const half = box.width / 2 || 1;
    track.querySelectorAll(':scope > .poster').forEach((card) => {
      const r = card.getBoundingClientRect();
      const x = (r.left + r.width / 2 - mid) / half;
      const edge = Math.min(1, Math.max(0, (Math.abs(x) - 0.45) / 0.55));
      const sign = x < 0 ? 1 : -1;
      card.style.setProperty('--cy', `${(sign * edge * 14).toFixed(2)}deg`);
      card.style.setProperty('--cs', (1 - edge * 0.06).toFixed(3));
    });
  }

  function bentoRow(label, kind, items, opts, sec) {
    sec.classList.add('is-filled');
    sec.removeAttribute('aria-hidden');
    sec.setAttribute('aria-label', label);
    const list = items.filter((item) => item.backdrop_path);
    const count = list.length >= 9 ? 9 : Math.min(5, list.length);
    const grid = el('div', 'bento');
    grid.append(...list.slice(0, count).map((item, i) => {
      const extra = opts.decorate ? opts.decorate(item) : {};
      const card = wideCard(item, kind, i === 0 ? { ...extra, desc: item.overview } : extra);
      if (i === 0) card.classList.add('is-lead');
      card.style.setProperty('--rd', `${Math.round((opts.delay || 0) + i * 60)}ms`);
      return card;
    }));
    sec.replaceChildren(rowHead(label, opts.sub), grid);
    return sec;
  }

  function discoveryRow(label, kind, items, opts = {}, sec = el('section', 'row')) {
    sec.classList.add('is-filled');
    sec.removeAttribute('aria-hidden');
    sec.setAttribute('aria-label', label);
    const prev = rowNav(-1, label);
    const next = rowNav(1, label);
    const rail = el('div', 'row__rail');
    const track = el('div', 'row__track');
    if (opts.layout) sec.classList.add(`row--${opts.layout}`);
    track.append(...buildCards(kind, items, opts));
    const step = (dir) => track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: motion() });
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    rail.append(track);
    let ticking = false;
    const sync = () => {
      const max = track.scrollWidth - track.clientWidth;
      const canPrev = max > 4 && track.scrollLeft > 4;
      const canNext = max > 4 && track.scrollLeft < max - 4;
      rail.classList.toggle('can-prev', canPrev);
      rail.classList.toggle('can-next', canNext);
      prev.disabled = !canPrev;
      next.disabled = !canNext;
      sec.classList.toggle('is-static', max <= 4);
      if (opts.layout === 'curve') curve(track);
    };
    track.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        sync();
      });
    }, { passive: true });
    const observer = new ResizeObserver(() => {
      if (!track.isConnected) {
        observer.disconnect();
        return;
      }
      sync();
    });
    observer.observe(track);
    sec.replaceChildren(rowHead(label, opts.sub, [prev, next]), rail);
    return sec;
  }

  function skeletonWide(lead) {
    const card = el('div', lead ? 'wide is-skeleton is-lead' : 'wide is-skeleton');
    card.setAttribute('aria-hidden', 'true');
    card.append(el('span', 'wide__art'));
    return card;
  }

  function skeletonRow(label, sub, layout) {
    const sec = el('section', 'row');
    sec.setAttribute('aria-hidden', 'true');
    if (layout === 'bento') {
      const grid = el('div', 'bento');
      grid.append(...Array.from({ length: 5 }, (_, i) => skeletonWide(i === 0)));
      sec.append(rowHead(label, sub), grid);
      return sec;
    }
    const track = el('div', 'row__track');
    track.append(...Array.from({ length: layout === 'wide' ? 5 : 8 }, () => (layout === 'wide' ? skeletonWide(false) : skeletonPoster())));
    const rail = el('div', 'row__rail');
    rail.append(track);
    sec.append(rowHead(label, sub), rail);
    return sec;
  }

  const SECTIONS = {
    movie: {
      title: 'Movies',
      rows: [
        { label: 'Trending', sub: 'What everyone is watching', path: '/movie/popular', layout: 'curve' },
        { label: 'In Theaters', sub: 'Playing on the big screen', path: '/movie/now_playing', layout: 'wide' },
        { label: 'Premiere Calendar', sub: 'Coming soon to theaters', path: '/discover/movie', layout: 'timeline' },
        { label: 'Hall of Fame', sub: 'The highest rated films of all time', path: '/movie/top_rated', layout: 'ranked' }
      ]
    },
    tv: {
      title: 'TV Shows',
      rows: [
        { label: 'Trending Now', sub: 'What everyone is binging', path: '/tv/popular', layout: 'wide' },
        { label: 'On Air Today', sub: 'Fresh episodes today', path: '/tv/airing_today', mode: 'live', layout: 'wide' },
        { label: 'This Week', sub: 'New episodes over the next few days', path: '/tv/on_the_air', mode: 'week', layout: 'poster' },
        { label: 'Premieres', sub: 'New series on the way', path: '/discover/tv', mode: 'upcoming', layout: 'wide' },
        { label: 'Binge-worthy', sub: 'The best rated series of all time', path: '/tv/top_rated', mode: 'rated', layout: 'bento' }
      ]
    }
  };
  const portal = document.getElementById('portal');
  const settingsMount = document.getElementById('settings');
  const hub = document.getElementById('hub');
  const hubItems = hub ? [...hub.querySelectorAll('.hub__item')] : [];
  let view = 'search';
  let sectionSeq = 0;
  let hubState = 'closed';
  let hubExit = null;
  let hubReturn = null;
  let peekTimer = 0;
  let peeked = null;
  const hubGrid = hub ? hub.querySelector('.hub__grid') : null;

  function sectionParams(path) {
    const params = { language: 'en-US', page: '1' };
    if (path === '/discover/movie') {
      Object.assign(params, {
        sort_by: 'popularity.desc',
        'primary_release_date.gte': today(),
        'primary_release_date.lte': dayOffset(150),
        with_release_type: '2|3',
        include_adult: 'false'
      });
    }
    if (path === '/discover/tv') {
      Object.assign(params, { sort_by: 'popularity.desc', 'first_air_date.gte': today(), include_null_first_air_dates: 'false' });
    }
    return params;
  }

  function titleOf(item, kind) {
    return (kind === 'tv' ? (item.name || item.original_name) : (item.title || item.original_title)) || 'Untitled';
  }

  function daysUntil(date) {
    const d = new Date(`${date}T00:00:00`);
    const t = new Date(`${today()}T00:00:00`);
    return Math.round((d - t) / 86400000);
  }

  function decorator(mode, kind) {
    if (mode === 'upcoming') {
      return (item) => {
        const date = kind === 'tv' ? item.first_air_date : item.release_date;
        if (!date) return {};
        const days = daysUntil(date);
        if (Number.isNaN(days)) return {};
        return { badge: days <= 0 ? 'Out now' : days === 1 ? 'Tomorrow' : days <= 14 ? `In ${days} days` : shortDate(date) };
      };
    }
    if (mode === 'live') return () => ({ badge: 'New today', live: true });
    if (mode === 'rated') return (item) => (item.vote_average ? { badge: `★ ${item.vote_average.toFixed(1)}` } : {});
    return null;
  }

  function sectionHead(kind) {
    const def = SECTIONS[kind];
    const head = el('div', 'rows__head');
    const toggle = el('div', 'switch');
    toggle.setAttribute('role', 'tablist');
    toggle.setAttribute('aria-label', 'Browse');
    toggle.dataset.on = kind;
    toggle.append(el('span', 'switch__pill'));
    [['movie', 'Movies'], ['tv', 'TV Shows']].forEach(([key, text]) => {
      const tab = el('button', 'switch__opt', text);
      tab.type = 'button';
      tab.dataset.key = key;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(key === kind));
      tab.addEventListener('click', () => switchSection(key, toggle));
      toggle.append(tab);
    });
    head.append(el('h1', 'sr-only', def.title), toggle);
    return head;
  }

  let heroTicking = false;
  window.addEventListener('scroll', () => {
    if (heroTicking) return;
    heroTicking = true;
    requestAnimationFrame(() => {
      heroTicking = false;
      const hero = rowsMount && SECTIONS[view] ? rowsMount.querySelector('.spot') : null;
      if (!hero) return;
      const h = hero.offsetHeight || 1;
      hero.style.setProperty('--sp', Math.min(1, Math.max(0, window.scrollY / h)).toFixed(3));
    });
  }, { passive: true });

  let switching = false;

  async function switchSection(next, toggle) {
    if (next === view || switching || !SECTIONS[next] || !rowsMount) return;
    switching = true;
    toggle.dataset.on = next;
    toggle.querySelectorAll('.switch__opt').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.key === next)));
    let out = null;
    if (!reduced.matches) {
      await wait(220);
      out = rowsMount.animate(
        [
          { opacity: 1, filter: 'blur(0px)', translate: '0 0' },
          { opacity: 0, filter: 'blur(8px)', translate: '0 -8px' }
        ],
        { duration: 340, easing: 'ease-in', fill: 'forwards' }
      );
      await settle([out]);
    }
    try {
      if (SECTIONS[view]) applyView(next);
      if (out) {
        await frames();
        const back = rowsMount.animate(
          [
            { opacity: 0, filter: 'blur(8px)', translate: '0 10px' },
            { opacity: 1, filter: 'blur(0px)', translate: '0 0' }
          ],
          { duration: 520, easing: EASE }
        );
        out.cancel();
        await settle([back]);
      }
    } finally {
      switching = false;
    }
  }

  function spotSkeleton(kind) {
    const sec = el('section', SECTIONS[kind] ? `spot spot--${kind} is-skeleton` : 'spot is-skeleton');
    sec.setAttribute('aria-hidden', 'true');
    return sec;
  }

  function fillSpotlight(sec, kind, items) {
    const picks = items.filter((item) => item.backdrop_path && item.overview).slice(0, 5);
    if (!picks.length) {
      sec.remove();
      return;
    }
    picks.forEach((item) => tmdb(`/${kind}/${item.id}`));
    const stage = el('div', 'spot__stage');
    const shade = el('div', 'spot__shade');
    const info = el('div', 'spot__info');
    const ticks = el('div', kind === 'tv' ? 'spot__dial' : 'spot__ticks');
    if (kind === 'tv') {
      ticks.setAttribute('role', 'group');
      ticks.setAttribute('aria-label', 'Channels');
    }
    let index = -1;

    const tickButtons = picks.map((item, i) => {
      const tick = el('button', kind === 'tv' ? 'spot__chan' : 'spot__tick');
      const fill = el('span', kind === 'tv' ? 'spot__chfill' : 'spot__fill');
      tick.type = 'button';
      tick.setAttribute('aria-label', `Show ${titleOf(item, kind)}`);
      if (kind === 'tv') {
        const body = el('span', 'spot__chbody');
        const clip = el('span', 'spot__chclip');
        const track = el('span', 'spot__chtrack');
        track.append(fill);
        clip.append(el('span', 'spot__chname', titleOf(item, kind)), track);
        body.append(clip);
        tick.append(el('span', 'spot__chnum', String(i + 1).padStart(2, '0')), body);
      } else {
        const thumb = el('span', 'spot__thumb');
        const img = el('img');
        img.alt = '';
        img.decoding = 'async';
        img.draggable = false;
        img.src = `${TMDB_IMG}w300${item.backdrop_path}`;
        thumb.append(img);
        const tInfo = el('span', 'spot__tinfo');
        const bar = el('span', 'spot__bar');
        bar.append(fill);
        const tMeta = [yearOf(item.release_date), item.vote_average ? `★ ${item.vote_average.toFixed(1)}` : ''].filter(Boolean).join(' · ');
        tInfo.append(el('span', 'spot__tname', titleOf(item, kind)), el('span', 'spot__tmeta', tMeta || 'Movie'), bar);
        tick.append(thumb, tInfo);
      }
      tick.addEventListener('click', () => show(i));
      fill.addEventListener('animationend', () => {
        if (tick.classList.contains('is-active')) show((index + 1) % picks.length);
      });
      return tick;
    });
    if (picks.length > 1) {
      if (kind === 'movie') ticks.append(el('span', 'spot__ticks-label', 'Featured'));
      ticks.append(...tickButtons);
    }

    function fillInfo(item, i, details) {
      const year = yearOf(kind === 'tv' ? item.first_air_date : item.release_date);
      const meta = el('p', 'spot__meta');
      const parts = [];
      if (item.vote_average) parts.push([`★ ${item.vote_average.toFixed(1)}`, 'result__rating']);
      if (year) parts.push([year]);
      parts.push([kind === 'tv' ? 'TV Series' : 'Movie']);
      paintMeta(meta, parts);
      const play = el('button', 'spot__play');
      play.type = 'button';
      const disc = el('span', 'spot__play-disc');
      disc.append(svgIcon('play', 'spot__play-icon'));
      play.append(disc, el('span', 'spot__play-label', kind === 'tv' ? 'Browse episodes' : 'Watch now'));
      if (details) {
        const extra = [];
        if (kind === 'movie' && details.runtime) extra.push([fmtRuntime(details.runtime)]);
        (details.genres || []).slice(0, 2).forEach((genre) => extra.push([genre.name]));
        if (extra.length) paintMeta(meta, [...parts.slice(0, -1), ...extra]);
        if (kind === 'movie' && details.runtime) play.append(el('span', 'spot__play-time', fmtRuntime(details.runtime)));
      }
      play.addEventListener('click', () => openPlayer({ type: kind, id: String(item.id) }, { push: true, fullscreen: true, origin: play }));
      const nodes = [
        heroKicker(kind, i, picks.length),
        el('h2', titleOf(item, kind).length > 24 ? 'spot__title is-long' : 'spot__title', titleOf(item, kind)),
        meta,
        el('p', 'spot__overview', item.overview),
        play
      ];
      info.replaceChildren(...nodes);
      if (reduced.matches) return;
      nodes.forEach((node, n) => node.animate(
        [
          { opacity: 0, filter: 'blur(6px)', translate: '0 10px' },
          { opacity: 1, filter: 'blur(0px)', translate: '0 0' }
        ],
        { duration: 720, delay: 60 + n * 60, easing: EASE, fill: 'backwards' }
      ));
    }

    function show(i) {
      if (i === index || !sec.isConnected) return;
      const item = picks[i];
      index = i;
      tickButtons.forEach((tick, n) => {
        tick.classList.toggle('is-active', n === i);
        tick.classList.toggle('is-done', n < i);
        tick.setAttribute('aria-current', String(n === i));
      });
      const slide = el('div', 'spot__slide');
      const img = el('img', 'spot__img');
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.addEventListener('load', () => {
        if (!sec.isConnected || index !== i) return;
        const old = [...stage.children];
        stage.append(slide);
        slide.classList.add('is-live');
        const fade = slide.animate(
          [
            { opacity: 0, filter: reduced.matches ? 'blur(0px)' : 'blur(10px)' },
            { opacity: 1, filter: 'blur(0px)' }
          ],
          { duration: reduced.matches ? 200 : 1200, easing: EASE }
        );
        settle([fade]).then(() => old.forEach((node) => node.remove()));
      }, { once: true });
      img.src = `${TMDB_IMG}w1280${item.backdrop_path}`;
      slide.append(img);
      let details = null;
      const detailsReady = tmdb(`/${kind}/${item.id}`).then((data) => { details = data || null; }).catch(() => {});
      const leaving = [...info.children].filter((node) => !node.dataset.leaving);
      const outs = info.children.length && !reduced.matches
        ? leaving.map((node) => {
          node.dataset.leaving = 'true';
          return node.animate(
            [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(6px)' }],
            { duration: 260, easing: 'ease-in', fill: 'forwards' }
          );
        })
        : [];
      Promise.all([settle(outs), Promise.race([detailsReady, wait(600)])]).then(() => {
        if (index === i) fillInfo(item, i, details);
      });
      const upNext = picks[(i + 1) % picks.length];
      if (upNext) new Image().src = `${TMDB_IMG}w1280${upNext.backdrop_path}`;
    }

    sec.addEventListener('pointermove', (e) => {
      if (reduced.matches || e.pointerType !== 'mouse') return;
      const r = sec.getBoundingClientRect();
      sec.style.setProperty('--sx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
      sec.style.setProperty('--sy', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
    });
    sec.addEventListener('pointerleave', () => {
      sec.style.setProperty('--sx', '0');
      sec.style.setProperty('--sy', '0');
    });
    sec.classList.remove('is-skeleton');
    sec.classList.add(`spot--${kind}`);
    sec.removeAttribute('aria-hidden');
    sec.setAttribute('aria-label', 'Spotlight');
    sec.replaceChildren(stage, shade, info, ticks);
    show(0);
  }

  function watchingEntries(kind) {
    const list = [];
    Object.entries(progress).forEach(([key, value]) => {
      if (!value || typeof value !== 'object') return;
      if (kind === 'movie' && key.startsWith('movie:') && !value.done && value.d && value.t >= RESUME_MIN) {
        list.push({ id: key.slice(6), at: value.at || 0, left: Math.max(1, Math.round((value.d - value.t) / 60)), pct: value.t / value.d });
      }
      if (kind === 'tv' && key.startsWith('show:') && value.s && value.e) {
        const id = key.slice(5);
        const next = lastEpisode(id);
        if (!next) return;
        const saved = progress[`tv:${id}:${next.s}:${next.e}`];
        list.push({ id, at: value.at || 0, s: next.s, e: next.e, pct: saved && !saved.done && saved.d ? saved.t / saved.d : 0 });
      }
    });
    return list.sort((a, b) => b.at - a.at).slice(0, 12);
  }

  async function loadWatching(kind, entries, slot, id, delayFor) {
    const details = await Promise.all(entries.map((entry) => tmdb(`/${kind}/${entry.id}`)));
    if (id !== sectionSeq || view !== kind || !slot.isConnected) return;
    const items = [];
    const extras = new Map();
    details.forEach((data, i) => {
      if (!data) return;
      const entry = entries[i];
      items.push({ ...data, media_type: kind });
      extras.set(String(data.id), kind === 'tv'
        ? { progress: entry.pct, sub: `S${entry.s} · E${entry.e}` }
        : { progress: entry.pct, sub: `${fmtRuntime(entry.left)} left` });
    });
    if (!items.length) {
      slot.remove();
      return;
    }
    discoveryRow('Continue Watching', kind, items, {
      sub: 'Pick up where you left off',
      layout: kind === 'tv' ? 'wide' : 'curve',
      decorate: (item) => extras.get(String(item.id)) || {},
      delay: delayFor(slot)
    }, slot);
  }

  const revealer = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        revealer.unobserve(entry.target);
        entry.target.classList.remove('is-pending');
        entry.target.classList.add('is-entering');
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 })
    : null;

  function airDates(sec, id) {
    sec.querySelectorAll('.poster[data-id]').forEach((card) => {
      tmdb(`/tv/${card.dataset.id}`).then((data) => {
        if (id !== sectionSeq || !card.isConnected || !data) return;
        const next = data.next_episode_to_air;
        if (!next || !next.air_date) return;
        const days = daysUntil(next.air_date);
        if (Number.isNaN(days) || days < 0 || days > 7) return;
        const art = card.querySelector('.poster__art');
        if (!art || art.querySelector('.poster__badge')) return;
        const when = days === 0 ? 'Tonight' : days === 1 ? 'Tomorrow' : new Date(`${next.air_date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
        const badge = el('span', 'poster__badge is-airing');
        badge.append(el('b', null, when), document.createTextNode(`S${next.season_number} · E${next.episode_number}`));
        art.append(badge);
      }).catch(() => {});
    });
  }

  async function loadSection(kind, fresh = false) {
    const def = SECTIONS[kind];
    if (!rowsMount || !def) return;
    const id = ++sectionSeq;
    const startAt = performance.now();
    const still = reduced.matches;
    if (revealer) revealer.disconnect();
    const stagger = (node, i) => {
      if (i >= 3 && revealer && !still) {
        node.classList.add('is-pending');
        revealer.observe(node);
        return node;
      }
      node.classList.add('is-entering');
      node.style.setProperty('--sd', `${still ? 0 : i * 110}ms`);
      return node;
    };
    const delayFor = (node) => {
      if (still) return 0;
      if (node.classList.contains('is-pending') || !node.style.getPropertyValue('--sd')) return 140;
      return Math.max(0, startAt + (parseFloat(node.style.getPropertyValue('--sd')) || 0) + 200 - performance.now());
    };
    const requests = def.rows.map((row) => [row.path, sectionParams(row.path)]);
    if (fresh) requests.forEach(([path, params]) => tmdbCache.delete(`${path}?${new URLSearchParams(params).toString()}`));
    const head = stagger(sectionHead(kind), 0);
    const spot = stagger(spotSkeleton(kind), 1);
    const watching = watchingEntries(kind);
    const watchSlot = watching.length ? stagger(skeletonRow('Continue Watching', 'Pick up where you left off', kind === 'tv' ? 'wide' : 'curve'), 2) : null;
    const offset = watchSlot ? 3 : 2;
    const slots = def.rows.map((row, i) => stagger(skeletonRow(row.label, row.sub, row.layout), offset + i));
    rowsMount.replaceChildren(...[head, spot, watchSlot, ...slots].filter(Boolean));
    if (watchSlot) loadWatching(kind, watching, watchSlot, id, delayFor);
    const data = await Promise.all(requests.map(([path, params]) => tmdb(path, undefined, params)));
    if (id !== sectionSeq || view !== kind || !rowsMount.isConnected) return;
    const now = today();
    let filled = 0;
    let spotted = false;
    def.rows.forEach((row, i) => {
      const slot = slots[i];
      const d = data[i];
      let items = d && Array.isArray(d.results) ? d.results : [];
      const withArt = items.filter((item) => item.poster_path);
      if (withArt.length >= 6) items = withArt;
      if (row.mode === 'upcoming') {
        const ahead = items.filter((item) => (kind === 'tv' ? item.first_air_date : item.release_date) > now);
        if (ahead.length >= 6) items = ahead;
      }
      if (row.layout === 'wide' || row.layout === 'bento') {
        const wide = items.filter((item) => item.backdrop_path);
        if (wide.length >= 4) items = wide;
      }
      if (!items.length) {
        slot.remove();
        return;
      }
      filled++;
      const opts = { sub: row.sub, layout: row.layout, decorate: decorator(row.mode, kind), delay: delayFor(slot) };
      if (row.layout === 'bento') bentoRow(row.label, kind, items, opts, slot);
      else discoveryRow(row.label, kind, items, opts, slot);
      if (row.mode === 'week') airDates(slot, id);
      if (i === 0) {
        spotted = true;
        fillSpotlight(spot, kind, items);
      }
    });
    if (!spotted) spot.remove();
    if (!filled) {
      rowsMount.append(stagger(sectionFailed(() => loadSection(kind, true)), 1));
    }
  }

  function applyView(next) {
    view = next;
    closeResults();
    hideHint();
    if (searchInput) searchInput.blur();
    content.style.transition = 'none';
    content.classList.add('is-settled');
    content.classList.toggle('is-browsing', next !== 'search');
    if (search) search.hidden = next !== 'search';
    if (settingsMount) {
      settingsMount.hidden = next !== 'settings';
      if (next === 'settings') buildSettings();
      else settingsMount.replaceChildren();
    }
    if (rowsMount) {
      if (SECTIONS[next]) loadSection(next);
      else rowsMount.replaceChildren();
    }
    window.scrollTo(0, 0);
    content.getBoundingClientRect();
    content.style.transition = '';
  }

  function setPortal(open) {
    if (!portal) return;
    portal.setAttribute('aria-expanded', String(open));
    portal.setAttribute('aria-label', open ? 'Close navigator' : 'Open navigator');
  }

  function markCurrent() {
    hubItems.forEach((item) => {
      if (item.dataset.go === view) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  }

  function clearLit() {
    hubItems.forEach((item) => item.classList.remove('is-lit'));
  }

  function finishHub() {
    setPeek(null);
    if (hub) {
      hub.getAnimations().forEach((a) => a.cancel());
      hub.classList.remove('is-leaving', 'is-travelling');
      hub.hidden = true;
    }
    hubItems.forEach((item) => item.getAnimations().forEach((a) => a.cancel()));
    hubState = 'closed';
    clearLit();
  }

  function resetHub() {
    if (hubExit) {
      hubExit.cancel();
      hubExit = null;
    }
    content.getAnimations().forEach((a) => a.cancel());
    content.inert = false;
    brand.inert = false;
    setPortal(false);
    finishHub();
  }

  function fadeHubOut(still) {
    const from = getComputedStyle(hub).opacity;
    hub.getAnimations().forEach((a) => a.cancel());
    return hub.animate(
      [
        { opacity: from, filter: 'blur(0px)' },
        { opacity: 0, filter: still ? 'blur(0px)' : 'blur(8px)' }
      ],
      { duration: still ? 200 : 380, easing: 'ease-in', fill: 'forwards' }
    );
  }

  function bringContentBack(still) {
    const from = Number(getComputedStyle(content).opacity);
    if (hubExit) {
      hubExit.cancel();
      hubExit = null;
    }
    content.inert = false;
    brand.inert = false;
    hubReturn = content.animate(
      [
        { opacity: from, filter: still ? 'blur(0px)' : `blur(${((1 - from) * 10).toFixed(2)}px)`, translate: still ? '0 0' : '0 8px' },
        { opacity: 1, filter: 'blur(0px)', translate: '0 0' }
      ],
      { duration: still ? 200 : 620, easing: EASE }
    );
    return hubReturn;
  }

  function openHub() {
    if (!hub || session || (hubState !== 'closed' && hubState !== 'closing')) return;
    const reopening = hubState === 'closing';
    hubState = 'opening';
    const still = reduced.matches;
    const keyboard = portal && portal.matches(':focus-visible');
    closeResults();
    hideHint();
    if (searchInput) searchInput.blur();
    clearLit();
    markCurrent();
    const hubFrom = reopening ? Number(getComputedStyle(hub).opacity) : 0;
    const shown = Number(getComputedStyle(content).opacity);
    hub.getAnimations().forEach((a) => a.cancel());
    hub.classList.remove('is-leaving', 'is-travelling');
    hub.hidden = false;
    setPortal(true);
    content.inert = true;
    brand.inert = true;
    if (hubReturn) {
      hubReturn.cancel();
      hubReturn = null;
    }
    if (hubExit) hubExit.cancel();
    hubExit = content.animate(
      [
        { opacity: shown, filter: still ? 'blur(0px)' : `blur(${((1 - shown) * 10).toFixed(2)}px)` },
        { opacity: 0, filter: still ? 'blur(0px)' : 'blur(10px)' }
      ],
      { duration: still ? 200 : 420, easing: EASE, fill: 'forwards' }
    );
    const anims = [hub.animate([{ opacity: hubFrom }, { opacity: 1 }], { duration: still ? 200 : 420, easing: 'ease-out' })];
    if (!reopening) hubItems.forEach((item, i) => anims.push(item.animate(
      [
        { opacity: 0, filter: still ? 'blur(0px)' : 'blur(8px)', translate: still ? '0 0' : '0 12px' },
        { opacity: 1, filter: 'blur(0px)', translate: '0 0' }
      ],
      { duration: still ? 200 : 680, delay: still ? 0 : 140 + i * 70, easing: EASE, fill: 'backwards' }
    )));
    const current = hubItems.find((item) => item.dataset.go === view) || hubItems[0];
    if (keyboard && current) current.focus({ preventScroll: true });
    settle(anims).then(() => {
      if (hubState === 'opening') hubState = 'open';
    });
  }

  function closeHub() {
    if (!hub || (hubState !== 'open' && hubState !== 'opening')) return;
    hubState = 'closing';
    const still = reduced.matches;
    setPortal(false);
    hub.classList.add('is-leaving');
    const fade = fadeHubOut(still);
    bringContentBack(still);
    settle([fade]).then(() => {
      if (hubState === 'closing') finishHub();
    });
  }

  async function travel(item) {
    if (!hub || (hubState !== 'open' && hubState !== 'opening')) return;
    const target = item.dataset.go;
    if (target !== 'search' && target !== 'settings' && !SECTIONS[target]) return;
    hubState = 'travelling';
    const still = reduced.matches;
    setPortal(false);
    hub.classList.add('is-leaving', 'is-travelling');
    item.classList.add('is-lit');
    await wait(still ? 60 : 320);
    if (hubState !== 'travelling') return;
    const fade = fadeHubOut(still);
    await wait(still ? 0 : 160);
    if (hubState !== 'travelling') return;
    if (target !== view) {
      applyView(target);
      await frames();
    }
    const arrive = bringContentBack(still);
    await settle([fade]);
    if (hubState === 'travelling') finishHub();
    await settle([arrive]);
    if (target === 'search' && searchInput && window.matchMedia('(hover: hover)').matches && document.activeElement !== searchInput) {
      content.classList.add('is-quiet');
      searchInput.focus({ preventScroll: true });
    }
  }

  if (portal) portal.addEventListener('click', () => {
    if (hubState === 'closed') openHub();
    else closeHub();
  });

  if (hub) {
    hub.addEventListener('click', (e) => {
      const item = e.target.closest('.hub__item');
      if (item) travel(item);
      else closeHub();
    });

    hub.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const index = hubItems.indexOf(document.activeElement);
      if (index < 0) return;
      e.preventDefault();
      const step = e.key === 'ArrowRight' ? 1 : -1;
      hubItems[(index + step + hubItems.length) % hubItems.length].focus({ preventScroll: true });
    });
  }

  const HUB_PEEKS = {
    search: { kicker: 'Find anything', text: 'Search any movie or show by name, TMDB ID or link.' },
    movie: { kicker: 'Now trending', text: 'The Spotlight, In Theaters, the Premiere Calendar and the Hall of Fame.', path: '/movie/popular' },
    tv: { kicker: 'On air', text: 'Trending shows, new episodes this week and the best series ever made.', path: '/tv/popular' },
    settings: { kicker: 'Your player', text: 'Playback, quality and sources, with a live preview of every change.' }
  };

  function setPeek(item) {
    if (peeked === item) return;
    peeked = item;
    hubItems.forEach((node) => node.classList.toggle('is-peek', node === item));
    if (hubGrid) hubGrid.classList.toggle('has-peek', Boolean(item));
    if (item) fillPeek(item);
  }

  function fillPeek(item) {
    const art = item.querySelector('.hub__peek-art');
    if (!art) return;
    const go = item.dataset.go;
    if (go === 'search' || go === 'settings') {
      const kicker = item.querySelector('.hub__peek-kicker');
      if (go === 'search' && kicker) kicker.textContent = recents.length ? 'Recent searches' : 'Try searching';
      const chips = go === 'search'
        ? (recents.length ? recents.slice(0, 3) : ['Breaking Bad', '1396'])
        : [prefs.autoplay ? 'Autoplay on' : 'Autoplay off', `${prefs.seek}s seek`, prefs.quality === 'auto' ? 'Auto quality' : `${prefs.quality}p`];
      art.className = 'hub__peek-art is-chips';
      art.replaceChildren(...chips.map((text, n) => {
        const chip = el('span', 'hub__chip', text);
        chip.style.setProperty('--pi', String(n));
        return chip;
      }));
      return;
    }
    const def = HUB_PEEKS[go];
    if (!def || !def.path || art.dataset.filled) return;
    art.dataset.filled = 'true';
    art.className = 'hub__peek-art is-posters';
    art.replaceChildren(...Array.from({ length: 3 }, (_, n) => {
      const slot = el('span', 'hub__thumb');
      slot.style.setProperty('--pi', String(n));
      return slot;
    }));
    tmdb(def.path, undefined, sectionParams(def.path)).then((data) => {
      const list = data && Array.isArray(data.results) ? data.results.filter((r) => r.poster_path).slice(0, 3) : [];
      if (!list.length) {
        delete art.dataset.filled;
        return;
      }
      [...art.children].forEach((slot, n) => {
        const pick = list[n];
        if (!pick) {
          slot.remove();
          return;
        }
        const img = el('img');
        img.alt = '';
        img.decoding = 'async';
        img.draggable = false;
        img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
        img.src = `${TMDB_IMG}w185${pick.poster_path}`;
        slot.append(img);
      });
    }).catch(() => { delete art.dataset.filled; });
  }

  hubItems.forEach((item, i) => {
    const main = el('span', 'hub__main');
    main.append(...item.childNodes);
    const key = el('kbd', 'hub__key', String(i + 1));
    key.setAttribute('aria-hidden', 'true');
    main.append(key);
    const def = HUB_PEEKS[item.dataset.go] || {};
    const peek = el('span', 'hub__peek');
    peek.setAttribute('aria-hidden', 'true');
    const inner = el('span', 'hub__peek-inner');
    inner.append(el('span', 'hub__peek-kicker', def.kicker || ''), el('span', 'hub__peek-text', def.text || ''), el('span', 'hub__peek-art'));
    peek.append(inner);
    item.append(main, peek);
    item.setAttribute('aria-keyshortcuts', String(i + 1));
    item.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(peekTimer);
      peekTimer = setTimeout(() => {
        if (hubState === 'open' || hubState === 'opening') setPeek(item);
      }, peeked ? 90 : 160);
    });
    item.addEventListener('focus', () => {
      clearTimeout(peekTimer);
      if (item.matches(':focus-visible') && (hubState === 'open' || hubState === 'opening')) setPeek(item);
    });
  });

  if (hubGrid) {
    hubGrid.addEventListener('pointerleave', () => {
      clearTimeout(peekTimer);
      peekTimer = setTimeout(() => {
        if (hubState === 'open' || hubState === 'opening') setPeek(null);
      }, 200);
    });
  }

  if (hub) {
    const tip = el('div', 'hub__hint');
    tip.setAttribute('aria-hidden', 'true');
    tip.innerHTML = '<kbd>1</kbd><span>to</span><kbd>4</kbd><span>Jump to a section</span><i></i><kbd>Esc</kbd><span>Close</span>';
    hub.append(tip);
  }

  let jumpTo = null;
  let jumpOut = null;

  async function quickJump(target) {
    jumpTo = target;
    if (jumpOut) return;
    if (target === view) {
      jumpTo = null;
      return;
    }
    const still = reduced.matches;
    closeResults();
    hideHint();
    if (searchInput) searchInput.blur();
    const from = Number(getComputedStyle(content).opacity);
    content.getAnimations().forEach((a) => {
      if (!('transitionProperty' in a) && !('animationName' in a)) a.cancel();
    });
    hubReturn = null;
    const out = content.animate(
      [
        { opacity: from, filter: still ? 'blur(0px)' : `blur(${((1 - from) * 8).toFixed(2)}px)`, translate: '0 0' },
        { opacity: 0, filter: still ? 'blur(0px)' : 'blur(8px)', translate: still ? '0 0' : '0 -6px' }
      ],
      { duration: still ? 120 : Math.round(110 + 150 * from), easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' }
    );
    jumpOut = out;
    await settle([out]);
    jumpOut = null;
    const dest = jumpTo;
    jumpTo = null;
    if (session || (hubState !== 'closed' && hubState !== 'closing')) {
      out.cancel();
      return;
    }
    if (dest && dest !== view) {
      applyView(dest);
      await frames();
      if (session) {
        out.cancel();
        return;
      }
    }
    markCurrent();
    const arrive = content.animate(
      [
        { opacity: 0, filter: still ? 'blur(0px)' : 'blur(8px)', translate: still ? '0 0' : '0 8px' },
        { opacity: 1, filter: 'blur(0px)', translate: '0 0' }
      ],
      { duration: still ? 200 : 560, easing: EASE }
    );
    out.cancel();
    await settle([arrive]);
    if (view === 'search' && !jumpOut && !session && hubState === 'closed' && searchInput && window.matchMedia('(hover: hover)').matches && document.activeElement !== searchInput) {
      content.classList.add('is-quiet');
      searchInput.focus({ preventScroll: true });
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || session || busy || switching) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (!/^[1-9]$/.test(e.key)) return;
    const item = hubItems[Number(e.key) - 1];
    if (!item) return;
    e.preventDefault();
    if (hubState === 'open' || hubState === 'opening') {
      travel(item);
      return;
    }
    if (hubState === 'travelling') return;
    quickJump(item.dataset.go);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || (hubState !== 'open' && hubState !== 'opening')) return;
    e.preventDefault();
    closeHub();
    if (portal) portal.focus({ preventScroll: true });
  });

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
    if (route) {
      rememberSearch(input.value);
      hideHint();
      closeResults();
      openPlayer(route, { push: true, fullscreen: true });
      return;
    }
    const query = input.value.trim();
    if (!query) {
      nudgeField();
      showHint('Type a title or TMDB ID to start watching.');
      return;
    }
    hideHint();
    const rows = searchVisible();
    if (panelOpen && query === lastQuery && searchActive >= 0 && rows[searchActive]) {
      chooseResult(rows[searchActive]);
      return;
    }
    if (query.length < SEARCH_MIN) {
      nudgeField();
      showHint('Keep typing, at least 2 letters.');
      return;
    }
    runSearch(query, 0);
  }

  function fieldClip(node) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const target = node && node.isConnected && node.offsetWidth ? node : field && field.offsetWidth ? field : null;
    if (!target) return `inset(${h / 2 - 1}px ${w / 2 - 1}px ${h / 2 - 1}px ${w / 2 - 1}px round 12px)`;
    const r = target.getBoundingClientRect();
    const radius = target === field ? r.height / 2 : parseFloat(getComputedStyle(target).borderTopLeftRadius) || 12;
    return `inset(${r.top}px ${w - r.right}px ${h - r.bottom}px ${r.left}px round ${radius}px)`;
  }

  let snapTimer = 0;

  function snapLayout() {
    content.classList.add('is-snapping');
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => content.classList.remove('is-snapping'), 700);
  }

  window.addEventListener('resize', snapLayout);
  document.addEventListener('fullscreenchange', snapLayout);

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
    homeAnims = [brand, portal, content].filter(Boolean).map((el) => el.animate(
      [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: blur }],
      { duration: 520, easing: EASE, fill: 'forwards' }
    ));
    brand.inert = true;
    content.inert = true;
    if (portal) portal.inert = true;
  }

  function showHome() {
    brand.inert = false;
    content.inert = false;
    if (portal) portal.inert = false;
    const anims = homeAnims;
    homeAnims = [];
    anims.forEach((a) => a.reverse());
    return settle(anims).then(() => anims.forEach((a) => a.cancel()));
  }

  async function tmdb(path, signal, params) {
    const key = path + (params ? `?${new URLSearchParams(params).toString()}` : '');
    if (tmdbCache.has(key)) return tmdbCache.get(key);
    const url = new URL(TMDB_API + path);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' }, credentials: 'same-origin', signal });
      if (res.status === 404) {
        tmdbCache.set(key, null);
        return null;
      }
      if (!res.ok) {
        tmdbTrouble(res.status);
        return undefined;
      }
      const data = await res.json();
      tmdbCache.set(key, data);
      return data;
    } catch (err) {
      if (err.name === 'AbortError') return undefined;
      console.warn('[Parallax TV] TMDB request failed:', err);
      tmdbTrouble(0);
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

  function buildChooser(route, movie, show) {
    const count = playableSeasons(show).filter((s) => s.season_number > 0).length;
    const sides = [
      { key: 'movie', label: 'Movie', title: movie.title || 'Untitled', poster: movie.poster_path, rating: movie.vote_average, meta: [yearOf(movie.release_date), movie.runtime ? fmtRuntime(movie.runtime) : ''], cta: 'Watch now' },
      { key: 'tv', label: 'TV Show', title: show.name || 'Untitled', poster: show.poster_path, rating: show.vote_average, meta: [yearOf(show.first_air_date), count ? `${count} Season${count === 1 ? '' : 's'}` : ''], cta: 'Browse episodes' }
    ];
    const grid = el('div', 'versus');
    let chosen = false;

    const cards = sides.map((side, i) => {
      const card = el('button', `pick pick--${side.key}`);
      const art = el('span', 'pick__art');
      const body = el('span', 'pick__body');
      const glow = el('span', 'pick__glow');
      glow.setAttribute('aria-hidden', 'true');
      if (side.poster) glow.style.setProperty('--art', `url("${TMDB_IMG}w185${side.poster}")`);
      card.type = 'button';
      card.style.setProperty('--pd', `${i * 90}ms`);
      if (side.poster) {
        const img = el('img', 'pick__img');
        img.alt = '';
        img.decoding = 'async';
        img.draggable = false;
        art.classList.add('is-loading');
        img.addEventListener('load', () => {
          art.classList.remove('is-loading');
          img.classList.add('is-loaded');
        }, { once: true });
        img.addEventListener('error', () => {
          art.classList.remove('is-loading');
          img.replaceWith(svgIcon('tv', 'ep__fallback'));
        }, { once: true });
        img.src = `${TMDB_IMG}w342${side.poster}`;
        art.append(img);
      } else {
        art.append(svgIcon('tv', 'ep__fallback'));
      }
      const tag = el('span', 'pick__tag');
      tag.append(svgIcon(side.key === 'movie' ? 'film' : 'tv', 'pick__tag-icon'), document.createTextNode(side.label));
      art.append(el('span', 'pick__sheen'), tag);
      body.append(el('span', 'pick__title', side.title));
      const parts = [
        ...(side.rating ? [[`★ ${side.rating.toFixed(1)}`, 'result__rating']] : []),
        ...side.meta.filter(Boolean).map((text) => [text])
      ];
      if (parts.length) {
        const metaLine = el('span', 'pick__meta');
        paintMeta(metaLine, parts);
        body.append(metaLine);
      }
      const cta = el('span', 'pick__cta');
      cta.append(el('span', null, side.cta), svgIcon('right', 'pick__cta-icon'));
      body.append(cta);
      card.append(glow, art, body);
      card.addEventListener('click', () => {
        if (chosen || !session) return;
        chosen = true;
        card.classList.add('is-chosen');
        grid.classList.add('has-choice');
        if (side.key === 'movie') playRoute({ type: 'movie', id: route.id });
        else switchToTv(route, show);
      });
      return card;
    });

    const or = el('span', 'versus__or');
    or.append(el('span', 'versus__or-chip', 'or'));
    or.setAttribute('aria-hidden', 'true');
    grid.append(cards[0], or, cards[1]);
    grid.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      cards[e.key === 'ArrowLeft' ? 0 : 1].focus({ preventScroll: true });
    });
    const head = pickerHead('Movie or TV Show?');
    const sub = el('p', 'picker__meta');
    sub.append(document.createTextNode('TMDB ID '), el('span', 'picker__id', route.id), document.createTextNode(' matches both. Pick one.'));
    head.append(sub);
    return [head, grid];
  }

  function buildTvPicker(route, show, seasons) {
    const now = today();
    const signal = session.controller.signal;
    const wanted = Number(route.s);
    let season = seasons.some((s) => s.season_number === wanted) ? wanted : seasons[0].season_number;
    let episode = season === wanted && Number(route.e) ? Number(route.e) : 1;
    let token = 0;
    let ticking = false;
    let shown = -1;
    let hold = null;
    const warmed = new Set();

    const play = playButton();
    const label = play.querySelector('.picker__play-label');
    const rail = el('div', 'rail');
    const track = el('div', 'rail__track');
    const prev = arrowButton('left', 'Previous episodes');
    const next = arrowButton('right', 'Next episodes');
    rail.append(prev, track, next);

    const updateLabel = () => {
      const watch = episode ? episodeState(route.id, season, episode) : null;
      label.textContent = `${watch && watch.pct > 0 && !watch.done ? 'Resume' : 'Play'} S${season} · E${episode}`;
    };
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

    function leaveTrack(dir) {
      if (reduced.matches || !track.children.length) return Promise.resolve();
      if (hold) return settle([hold]);
      const from = getComputedStyle(track).opacity;
      track.getAnimations().forEach((a) => a.cancel());
      hold = track.animate(
        [
          { opacity: from, filter: 'blur(0px)', translate: '0 0' },
          { opacity: 0, filter: 'blur(4px)', translate: `${dir * -18}px 0` }
        ],
        { duration: 220, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' }
      );
      return settle([hold]);
    }

    function enterTrack(dir) {
      if (reduced.matches) return;
      const anim = track.animate(
        [
          { opacity: 0, filter: 'blur(4px)', translate: `${dir * 18}px 0` },
          { opacity: 1, filter: 'blur(0px)', translate: '0 0' }
        ],
        { duration: 520, easing: EASE }
      );
      track.getAnimations().forEach((a) => { if (a !== anim) a.cancel(); });
      hold = null;
    }

    function revealCards() {
      if (reduced.matches) return;
      cards().forEach((card, i) => card.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 380, delay: Math.min(i, 6) * 30, easing: EASE, fill: 'backwards' }
      ));
    }

    function skeletonCard() {
      const card = el('div', 'ep is-skeleton');
      const body = el('span', 'ep__body');
      body.append(el('span', 'ep__bar ep__bar--title'), el('span', 'ep__bar'), el('span', 'ep__bar ep__bar--short'));
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
      const watch = episodeState(route.id, season, n);
      let side = upcoming ? `Airs ${shortDate(info.air_date)}` : info.runtime ? `${info.runtime}m` : '';
      if (watch.done) {
        card.classList.add('is-watched');
        const mark = el('span', 'ep__done', 'Watched');
        still.append(mark, progressBar(1));
      } else if (watch.pct > 0) {
        card.classList.add('is-started');
        still.append(progressBar(watch.pct));
        side = `${fmtRuntime(watch.left)} left`;
      }
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

    function episodesOf(data, meta) {
      const list = data && Array.isArray(data.episodes) ? data.episodes.filter((ep) => ep.episode_number > 0) : [];
      return list.length ? list : Array.from({ length: meta.episode_count }, (_, i) => ({ episode_number: i + 1 }));
    }

    async function loadSeason(n, animate) {
      const id = ++token;
      const index = seasons.findIndex((s) => s.season_number === n);
      const meta = seasons[index];
      const path = `/tv/${route.id}/season/${n}`;
      const dir = shown < 0 ? 1 : Math.sign(index - shown) || 1;
      shown = index;
      const request = tmdb(path, signal);
      if (animate) await leaveTrack(dir);
      if (id !== token || signal.aborted || (animate && !track.isConnected)) return;
      if (tmdbCache.has(path)) {
        const data = await request;
        if (id !== token || signal.aborted || !track.isConnected) return;
        renderCards(episodesOf(data, meta));
        if (animate) enterTrack(dir);
        return;
      }
      track.replaceChildren(...Array.from({ length: Math.max(1, Math.min(meta.episode_count, 8)) }, skeletonCard));
      track.scrollLeft = 0;
      syncArrows();
      if (animate) enterTrack(dir);
      const data = await request;
      if (id !== token || signal.aborted || !track.isConnected) return;
      renderCards(episodesOf(data, meta));
      revealCards();
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
    seasonPicker.node.querySelectorAll('.season').forEach((chip) => {
      const info = seasons.find((s) => String(s.season_number) === chip.dataset.season);
      const prefix = `tv:${route.id}:${chip.dataset.season}:`;
      let started = 0;
      let finished = 0;
      Object.entries(progress).forEach(([key, value]) => {
        if (!key.startsWith(prefix) || !value || typeof value !== 'object') return;
        started++;
        if (episodeState(route.id, chip.dataset.season, key.slice(prefix.length)).done) finished++;
      });
      if (info && finished && finished >= info.episode_count) chip.classList.add('is-complete');
      else if (started) chip.classList.add('is-started');
    });
    seasonPicker.node.addEventListener('pointerover', (e) => {
      const chip = e.target.closest('.season');
      if (!chip || warmed.has(chip.dataset.season)) return;
      warmed.add(chip.dataset.season);
      tmdb(`/tv/${route.id}/season/${chip.dataset.season}`, signal);
    });

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
    const last = route.s ? null : lastEpisode(route.id);
    const tvRoute = { type: 'tv', id: route.id, s: route.s || (last && last.s), e: route.e || (last && last.e) };
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

  const PREFS_KEY = 'parallax:player';
  const FEBBOX_TOKEN = '';
  const PREF_DEFAULTS = {
    color: '#d4d4d8',
    seek: 10,
    quality: 'auto',
    autoplay: true,
    resume: true,
    remember: true,
    muted: false,
    autonext: true,
    autoskip: false,
    prioritize: true,
    febbox: '',
    fx: 'auto'
  };
  const FX_TIERS = ['low', 'medium', 'high'];
  const FX_LABEL = { low: 'Low', medium: 'Medium', high: 'High' };
  const FX_OPTIONS = [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']];
  const FX_AUTO_KEY = 'parallax:fx-auto';
  const DEV_KEY = 'parallax:dev';
  const fxProbe = { raf: 0, start: 0, last: 0, frames: 0, slow: 0, bad: 0, good: 0, raised: false, after: performance.now() + 3000 };
  const fxCache = new Map();
  const fxSheet = document.createElement('style');
  document.head.append(fxSheet);
  const PREF_TOGGLES = [
    ['autoplay', 'Autoplay', 'Start playing as soon as it loads'],
    ['resume', 'Resume where you left off', 'Offers Continue or Restart when you come back'],
    ['remember', 'Remember volume & speed', 'Keep the volume and playback speed you last used'],
    ['muted', 'Start muted', 'Begin with the sound off'],
    ['autonext', 'Autoplay next episode', 'Roll into the next episode when one ends'],
    ['autoskip', 'Skip intros & recaps', 'Jump past them when detected'],
    ['prioritize', 'Remember server', 'Open on the last server you used']
  ];
  const SEEK_STEPS = [5, 10, 15, 30];
  const QUALITIES = [['auto', 'Auto'], ['1080', '1080p'], ['720', '720p'], ['480', '480p']];
  const prefsPaint = [];
  let monitorPaint = null;
  let savedTimer = 0;

  function loadPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      return { ...PREF_DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
    } catch (err) {
      return { ...PREF_DEFAULTS };
    }
  }

  let prefs = loadPrefs();

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (err) {
      console.warn('[Parallax TV] Could not save settings:', err);
      storageFailed();
    }
    flashSaved();
    if (monitorPaint) monitorPaint(true);
    paintQuality(true);
    fxApply();
  }

  function paintQuality(animate) {
    const mon = settingsMount ? settingsMount.querySelector('.monitor') : null;
    if (!mon) return;
    const from = mon.dataset.q;
    mon.dataset.q = prefs.quality;
    if (!animate || reduced.matches || !from || from === prefs.quality) return;
    const rank = (q) => (q === 'auto' ? 1080 : Number(q) || 1080);
    mon.classList.remove('is-upscale', 'is-downscale');
    void mon.offsetWidth;
    mon.classList.add(rank(prefs.quality) >= rank(from) ? 'is-upscale' : 'is-downscale');
  }

  function paintPrefs(animate) {
    prefsPaint.forEach((fn) => fn(animate));
  }

  function flashSaved() {
    const badge = settingsMount ? settingsMount.querySelector('.settings__status') : null;
    if (!badge) return;
    badge.classList.add('is-visible');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => badge.classList.remove('is-visible'), 1600);
  }

  function settingsGroup(label, rows) {
    const group = el('section', 'settings__group');
    const panel = el('div', 'settings__panel');
    panel.append(...rows);
    group.append(el('h2', 'settings__label', label), panel);
    return group;
  }

  function prefsSegment(key, label, note, options) {
    const row = el('div', 'prefs__line');
    row.dataset.pv = key;
    const text = el('span', 'prefs__text');
    const title = el('span', 'prefs__name', label);
    title.id = `prefs-${key}`;
    text.append(title, el('span', 'prefs__note', note));
    const seg = el('div', 'prefs__seg');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-labelledby', title.id);
    const pill = el('span', 'prefs__pill');
    pill.setAttribute('aria-hidden', 'true');
    seg.append(pill);
    const buttons = options.map(([value, text]) => {
      const button = el('button', 'prefs__opt', text);
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.addEventListener('click', () => {
        prefs[key] = value;
        savePrefs();
        paintPrefs(true);
      });
      seg.append(button);
      return [value, button];
    });
    prefsPaint.push((animate) => {
      buttons.forEach(([value, button]) => button.setAttribute('aria-checked', String(value === prefs[key])));
      const on = buttons.find(([value]) => value === prefs[key]);
      if (!on || !on[1].offsetWidth) {
        pill.classList.remove('is-visible');
        return;
      }
      const instant = !animate || reduced.matches;
      if (instant) pill.style.transition = 'none';
      pill.style.width = `${on[1].offsetWidth}px`;
      pill.style.transform = `translateX(${on[1].offsetLeft}px)`;
      pill.classList.add('is-visible');
      if (instant) {
        pill.getBoundingClientRect();
        pill.style.transition = '';
      }
    });
    row.append(text, seg);
    return row;
  }

  function prefsSwitch([key, label, note]) {
    const row = el('label', 'prefs__row');
    row.dataset.pv = key;
    const text = el('span', 'prefs__text');
    text.append(el('span', 'prefs__name', label), el('span', 'prefs__note', note));
    const input = el('input', 'prefs__switch');
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.addEventListener('change', () => {
      prefs[key] = input.checked;
      savePrefs();
    });
    row.append(text, input);
    prefsPaint.push(() => { input.checked = Boolean(prefs[key]); });
    return row;
  }

  function prefsToken() {
    const row = el('div', 'prefs__field');
    row.dataset.pv = 'febbox';
    const text = el('span', 'prefs__text');
    const title = el('label', 'prefs__name', 'Febbox token');
    text.append(title, el('span', 'prefs__note', 'Optional. Unlocks premium sources.'));
    const input = el('input', 'prefs__input');
    input.id = 'prefs-febbox';
    input.type = 'password';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'Paste your token';
    title.htmlFor = input.id;
    input.addEventListener('input', () => {
      prefs.febbox = input.value.trim();
      savePrefs();
    });
    prefsPaint.push(() => { input.value = prefs.febbox || ''; });
    row.append(text, input);
    return row;
  }

  const CS_ICONS = {
    play: ['<path d="M7 4.6v14.8a1 1 0 0 0 1.53.85l11.6-7.4a1 1 0 0 0 0-1.7L8.53 3.75A1 1 0 0 0 7 4.6z"/>'],
    pause: ['<rect x="5.5" y="4" width="4.5" height="16" rx="1.2"/><rect x="14" y="4" width="4.5" height="16" rx="1.2"/>'],
    vol: ['<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>'],
    mute: ['<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/>'],
    back: ['<path d="M8.5 3.5 5 7l3.5 3.5M5 7h8a6.5 6.5 0 0 1 0 13h-1"/>', true],
    fwd: ['<path d="M15.5 3.5 19 7l-3.5 3.5M19 7h-8a6.5 6.5 0 0 0 0 13h1"/>', true],
    cloud: ['<path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>'],
    eps: ['<path d="M6 15H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1"/><rect x="7" y="9" width="14" height="11" rx="2"/>', true],
    subs: ['<path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z"/>'],
    gear: ['<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.48.48 0 0 0-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/>'],
    full: ['<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>', true],
    arrow: ['<line x1="20" y1="12" x2="4" y2="12"/><polyline points="11 19 4 12 11 5"/>', true],
    pip: ['<rect x="2" y="4" width="20" height="16" rx="3"/><rect x="12" y="12" width="7" height="5" rx="1"/>', true],
    cast: ['<path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><line x1="2" y1="20" x2="2.01" y2="20"/>', true],
    close: ['<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', true],
    chev: ['<polyline points="15 18 9 12 15 6"/>', true],
    check: ['<polyline points="20 6 9 17 4 12"/>', true],
    retry: ['<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>', true],
    refresh: ['<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>', true],
    lock: ['<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', true],
    star: ['<path d="M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52 6.12 20.6l1.12-6.55L2.48 9.42l6.58-.96z"/>'],
    brand: ['<path d="M17.6 6.5A7.6 7.6 0 1 0 17.6 17.5" stroke-width="3.4"/><path d="M14.4 9.7A3.2 3.2 0 1 0 14.4 14.3" stroke-width="2.6"/>', true]
  };

  function csIcon(name, className = 'cs__icon') {
    const [markup, stroke] = CS_ICONS[name];
    const body = stroke ? `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${markup}</g>` : markup;
    const wrap = document.createElement('span');
    wrap.innerHTML = `<svg class="${className}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}</svg>`;
    return wrap.firstElementChild;
  }

  function fmtClock(sec) {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
  }

  const PV_CAPTIONS = {
    autoplay: () => (prefs.autoplay ? 'CineSrc starts playing the moment it loads.' : 'CineSrc waits for you to press play.'),
    resume: () => (prefs.resume ? 'CineSrc asks if you want to continue or start over.' : 'Every title starts from the beginning.'),
    remember: () => {
      if (!prefs.remember) return 'Opens at full volume and normal speed.';
      const volume = Number(sound.volume);
      const rate = Number(sound.rate);
      if (!(volume > 0) && !(rate > 0)) return 'Opens at the volume and speed you last used.';
      return `Opens at ${volume > 0 ? Math.round(volume * 100) : 100}% volume and ${rate >= 0.25 ? rate : 1}× speed, like last time.`;
    },
    muted: () => (prefs.muted ? 'Starts with the sound off.' : 'Starts with the sound on.'),
    autonext: () => (prefs.autonext ? 'Up next counts down, then plays the next episode.' : 'Stops when an episode ends.'),
    autoskip: () => (prefs.autoskip ? 'Intros and recaps are skipped for you.' : 'A Skip Intro button shows up instead.'),
    seek: () => `The rewind and forward buttons jump ${prefs.seek} seconds.`,
    quality: () => (prefs.quality === 'auto' ? 'Picks the best quality for your connection.' : `Picks ${prefs.quality}p when the server has it.`),
    prioritize: () => (prefs.prioritize ? 'Your last server gets a star and opens first.' : 'CineSrc picks a server for you.'),
    febbox: () => (prefs.febbox ? 'FebBox premium servers are unlocked.' : 'Add a token to unlock FebBox premium servers.')
  };

  function buildMonitor() {
    const mon = el('div', 'monitor');
    mon.setAttribute('aria-hidden', 'true');
    mon.dataset.q = prefs.quality;
    const screen = el('div', 'monitor__screen');
    const img = el('img', 'monitor__img');
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
    const cs = el('div', 'cs');
    const button = (name, key, cls) => {
      const node = el('span', cls ? `cs__btn ${cls}` : 'cs__btn');
      if (key) node.dataset.pv = key;
      node.append(csIcon(name));
      return node;
    };

    const title = el('span', 'cs__title', 'Now playing');
    const topRight = el('span', 'cs__group cs__group--top');
    topRight.append(button('pip'), button('cast'));
    const top = el('div', 'cs__top');
    top.append(button('arrow'), title, topRight);

    const fill = el('span', 'cs__fill');
    const knob = el('span', 'cs__knob');
    const track = el('span', 'cs__track');
    track.append(fill, knob);
    const time = el('span', 'cs__time');
    const line = el('div', 'cs__line');
    line.append(track, time);

    const play = button('play', 'autoplay', 'cs__play');
    play.append(csIcon('pause', 'cs__icon cs__icon--alt'));
    const seekButton = (name, side) => {
      const node = button(name, 'seek', `cs__seek cs__seek--${side}`);
      const num = el('span', 'cs__num');
      node.append(num);
      return [node, num];
    };
    const [back, backNum] = seekButton('back', 'back');
    const [fwd, fwdNum] = seekButton('fwd', 'fwd');
    const vol = button('vol', 'muted remember', 'cs__vol');
    vol.append(csIcon('mute', 'cs__icon cs__icon--alt'));
    const level = el('span', 'cs__level');
    level.dataset.pv = 'remember';
    level.append(el('span', 'cs__level-fill'));
    const leftGroup = el('span', 'cs__group');
    leftGroup.append(play, back, fwd, vol, level);
    const brand = el('span', 'cs__brand');
    const logo = el('img', 'cs__logo');
    logo.alt = '';
    logo.decoding = 'async';
    logo.draggable = false;
    logo.width = 24;
    logo.height = 24;
    logo.addEventListener('error', () => logo.replaceWith(csIcon('brand')), { once: true });
    logo.src = `${CINESRC}/cinesrc.svg`;
    brand.append(logo, el('span', null, 'CineSrc'));
    const rightGroup = el('span', 'cs__group');
    rightGroup.append(brand, button('cloud', 'prioritize febbox'), button('eps'), button('subs'), button('gear', 'quality'), button('full'));
    const controls = el('div', 'cs__controls');
    controls.append(leftGroup, rightGroup);
    const bottom = el('div', 'cs__bottom');
    bottom.append(line, controls);

    const leftAt = el('b');
    const leftOff = el('span', 'cs__modal-text');
    leftOff.append(document.createTextNode('You left off at '), leftAt, document.createTextNode('.'));
    const resumeName = el('span', 'cs__modal-sub', 'Now playing');
    const cont = el('span', 'cs__cta cs__cta--main cs__cta--ring');
    cont.append(csIcon('play'), el('span', null, 'Continue'));
    const over = el('span', 'cs__cta');
    over.append(csIcon('retry'), el('span', null, 'Start over'));
    const modal = el('div', 'cs__modal');
    modal.append(el('b', 'cs__modal-title', 'Resume watching?'), resumeName, leftOff, cont, over);

    const qBack = el('span', 'cs__pback');
    qBack.append(csIcon('chev'), el('span', null, 'Back'));
    const qHead = el('div', 'cs__phead');
    qHead.append(qBack, el('b', null, 'Quality'));
    const qList = el('div', 'cs__plist');
    const qPanel = el('div', 'cs__panel cs__panel--quality');
    qPanel.append(qHead, qList);

    const sTitles = el('span', 'cs__stack');
    sTitles.append(el('b', null, 'Servers'), el('span', null, 'Select a server'));
    const sHead = el('div', 'cs__shead');
    sHead.append(csIcon('cloud'), sTitles);
    const sList = el('div', 'cs__slist');
    const sFoot = el('div', 'cs__sfoot');
    sFoot.append(csIcon('refresh'), el('span', null, 'Retry All'));
    const sPanel = el('div', 'cs__panel cs__panel--servers');
    sPanel.append(sHead, sList, sFoot);

    const nextBar = el('span', 'cs__next-bar');
    const nextName = el('span', null, 'Next episode');
    const nextText = el('span', 'cs__stack');
    nextText.append(el('span', 'cs__eyebrow', 'Up next'), el('b', null, 'S01E02'), nextName);
    const nextTop = el('span', 'cs__next-top');
    nextTop.append(nextText, csIcon('close'));
    const playNow = el('span', 'cs__cta cs__cta--main');
    playNow.append(csIcon('play'), el('span', null, 'Play Now'));
    const count = el('span', 'cs__count', '13s');
    const nextRow = el('span', 'cs__next-row');
    nextRow.append(playNow, count);
    const next = el('div', 'cs__next');
    next.append(nextBar, nextTop, nextRow);

    const skip = el('div', 'cs__skip', 'Skip Intro');
    const toast = el('div', 'cs__toast');
    toast.append(csIcon('check'), el('span', null, 'Intro skipped'));

    cs.append(el('span', 'cs__shade'), top, bottom, el('span', 'cs__veil'), modal, qPanel, sPanel, next, skip, toast);
    screen.append(img, cs);
    const caption = el('div', 'monitor__caption');
    const label = el('span', 'monitor__label');
    label.append(el('i'), document.createTextNode('Live preview'));
    const text = el('span', 'monitor__text');
    caption.append(label, text);
    mon.append(screen, caption);

    const LENGTH = 3243;
    const SPOT = 1456;
    const COUNT = 13;
    const keys = Object.keys(PV_CAPTIONS);
    const look = (key) => (key === 'febbox' ? Boolean(prefs.febbox) : prefs[key]);
    const snap = {};
    let focus = '';
    let at = 1122;
    let ticks = COUNT;
    let timer = 0;
    let jumpTimer = 0;
    let demoTimer = 0;

    const volumeOf = () => {
      if (prefs.muted) return 0;
      const volume = Number(sound.volume);
      return prefs.remember && volume > 0 && volume <= 1 ? volume : 1;
    };

    const rateOf = () => {
      const rate = Number(sound.rate);
      return prefs.remember && rate >= 0.25 && rate <= 2 ? rate : 1;
    };

    function drawTime() {
      const pct = `${((at / LENGTH) * 100).toFixed(3)}%`;
      fill.style.width = pct;
      knob.style.left = pct;
      time.textContent = `${fmtClock(at)} / ${fmtClock(LENGTH)}`;
    }

    function jumpTo(sec) {
      at = Math.max(0, Math.min(LENGTH - 1, sec));
      cs.classList.add('is-jump');
      clearTimeout(jumpTimer);
      jumpTimer = setTimeout(() => cs.classList.remove('is-jump'), 750);
      drawTime();
    }

    function restartBar() {
      nextBar.getAnimations().forEach((a) => a.cancel());
      if (reduced.matches) return;
      nextBar.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: COUNT * 1000, easing: 'linear', fill: 'forwards' });
    }

    function demo(key) {
      clearTimeout(demoTimer);
      mon.classList.remove('is-skipped');
      if (key === 'resume') {
        leftAt.textContent = fmtClock(SPOT);
        jumpTo(prefs.resume ? SPOT : 0);
      } else if (key === 'seek') {
        jumpTo(at + (Number(prefs.seek) || 10));
        const icon = fwd.querySelector('svg');
        if (icon && !reduced.matches) {
          icon.animate([{ rotate: '0deg' }, { rotate: '30deg', offset: 0.35 }, { rotate: '0deg' }], { duration: 620, easing: EASE_IN_OUT });
        }
      } else if (key === 'autoskip') {
        jumpTo(42);
        if (prefs.autoskip) {
          demoTimer = setTimeout(() => {
            if (focus !== 'autoskip' || !mon.isConnected) return;
            jumpTo(131);
            mon.classList.add('is-skipped');
          }, 800);
        }
      } else if (key === 'autonext') {
        ticks = COUNT;
        count.textContent = `${ticks}s`;
        jumpTo(LENGTH - COUNT - 1);
        restartBar();
      }
    }

    function tick() {
      if (!mon.isConnected) {
        clearInterval(timer);
        return;
      }
      if (document.hidden) return;
      const held = focus === 'resume' && prefs.resume;
      if (prefs.autoplay && !held) {
        at += rateOf();
        if (at >= LENGTH - 1) jumpTo(0);
        else drawTime();
      }
      if (focus === 'autonext' && prefs.autonext) {
        ticks -= 1;
        if (ticks <= 0) {
          ticks = COUNT;
          jumpTo(LENGTH - COUNT - 1);
          restartBar();
        }
        count.textContent = `${ticks}s`;
      }
    }

    function say(animate) {
      const words = focus && PV_CAPTIONS[focus] ? PV_CAPTIONS[focus]() : 'Hover any setting to see it in the player.';
      if (text.textContent === words) return;
      text.textContent = words;
      if (!animate || reduced.matches) return;
      text.animate(
        [
          { opacity: 0, filter: 'blur(4px)', translate: '0 3px' },
          { opacity: 1, filter: 'blur(0px)', translate: '0 0' }
        ],
        { duration: 380, easing: EASE }
      );
    }

    function serverRow(name, on, starred) {
      const row = el('span', on ? 'cs__srow is-on' : 'cs__srow');
      row.append(el('span', 'cs__grip'), on ? csIcon('check', 'cs__icon cs__state') : el('span', 'cs__dot'), el('span', 'cs__flag'));
      if (starred) row.append(csIcon('star', 'cs__icon cs__star'));
      row.append(el('b', null, name));
      return row;
    }

    function paint(animate) {
      if (!mon.isConnected) return;
      [['is-playing', prefs.autoplay], ['is-muted', prefs.muted], ['is-resume', prefs.resume], ['is-autonext', prefs.autonext], ['is-autoskip', prefs.autoskip]]
        .forEach(([cls, on]) => mon.classList.toggle(cls, Boolean(on)));
      backNum.textContent = String(prefs.seek);
      fwdNum.textContent = String(prefs.seek);
      level.style.setProperty('--lv', String(volumeOf()));
      qList.replaceChildren(...QUALITIES.map(([value, name]) => {
        const on = String(value) === String(prefs.quality);
        const row = el('span', on ? 'cs__prow is-on' : 'cs__prow');
        const words = el('span', 'cs__stack');
        words.append(el('b', null, name));
        if (value === 'auto') words.append(el('span', null, 'Currently 1080p'));
        row.append(words);
        if (on) row.append(csIcon('check'));
        return row;
      }));
      const febbox = el('span', prefs.febbox ? 'cs__srow' : 'cs__srow is-locked');
      febbox.append(el('span', 'cs__grip'), prefs.febbox ? el('span', 'cs__dot') : csIcon('lock', 'cs__icon cs__lock'), el('span', 'cs__flag'), el('b', null, 'FebBox'), el('span', 'cs__tag', 'Premium'));
      sList.replaceChildren(
        serverRow('Nebula', true, Boolean(prefs.prioritize)),
        febbox,
        ...['Thunder', 'Storm', 'Wave', 'Surge', 'Blizzard'].map((name) => serverRow(name, false, false))
      );
      const changed = keys.filter((key) => key in snap && snap[key] !== look(key));
      keys.forEach((key) => { snap[key] = look(key); });
      if (animate && !reduced.matches) {
        cs.querySelectorAll('[data-pv]').forEach((node) => {
          if (!node.dataset.pv.split(' ').some((key) => changed.includes(key))) return;
          node.animate([{ scale: '1' }, { scale: '1.14', offset: 0.4 }, { scale: '1' }], { duration: 480, easing: EASE_IN_OUT });
        });
      }
      if (focus && changed.includes(focus)) demo(focus);
      say(animate);
    }

    function setFocus(key) {
      if (key === focus) return;
      focus = key;
      mon.classList.toggle('has-focus', Boolean(key));
      if (key) mon.dataset.demo = key;
      else delete mon.dataset.demo;
      cs.querySelectorAll('[data-pv]').forEach((node) => node.classList.toggle('is-focus', Boolean(key) && node.dataset.pv.split(' ').includes(key)));
      demo(key);
      say(true);
    }

    tmdb('/trending/tv/week', undefined, { language: 'en-US' }).then((data) => {
      const list = data && Array.isArray(data.results) ? data.results.filter((item) => item.backdrop_path) : [];
      if (!list.length || !mon.isConnected) return;
      const item = list[Math.floor(Math.random() * Math.min(list.length, 8))];
      const name = titleOf(item, 'tv');
      title.textContent = name;
      resumeName.textContent = name;
      nextName.textContent = name;
      img.src = `${TMDB_IMG}w780${item.backdrop_path}`;
    }).catch(() => {});

    drawTime();
    timer = setInterval(tick, 1000);
    return { node: mon, paint, setFocus };
  }

  function buildSettings() {
    if (!settingsMount) return;
    prefsPaint.length = 0;
    const toggles = Object.fromEntries(PREF_TOGGLES.map((t) => [t[0], t]));
    const head = el('div', 'settings__head');
    const titles = el('div', 'settings__titles');
    titles.append(el('h1', 'rows__title', 'Settings'), el('p', 'settings__sub', 'Saved on this device. Changes apply to the next title you play.'));
    const badge = el('span', 'settings__status');
    badge.setAttribute('role', 'status');
    badge.append(svgIcon('check', 'settings__status-icon'), el('span', null, 'Saved'));
    head.append(titles, badge);
    const reset = el('button', 'prefs__reset', 'Reset to defaults');
    reset.type = 'button';
    reset.addEventListener('click', () => {
      prefs = { ...PREF_DEFAULTS };
      savePrefs();
      paintPrefs(true);
    });
    const foot = el('div', 'settings__foot');
    const clear = el('button', 'prefs__reset', 'Clear watch history');
    clear.type = 'button';
    clear.addEventListener('click', () => {
      progress = {};
      storeProgress();
      flashSaved();
    });
    foot.append(reset, clear);
    const monitor = buildMonitor();
    monitorPaint = monitor.paint;
    prefsPaint.push(monitor.paint);
    const list = el('div', 'settings__list');
    list.append(
      settingsGroup('Playback', ['autoplay', 'resume', 'remember', 'muted', 'autonext', 'autoskip'].map((key) => prefsSwitch(toggles[key]))),
      settingsGroup('Player', [
        prefsSegment('seek', 'Seek step', 'How far the skip buttons jump', SEEK_STEPS.map((n) => [n, `${n}s`])),
        prefsSegment('quality', 'Quality', 'Preferred stream quality when available', QUALITIES)
      ]),
      settingsGroup('Sources', [prefsSwitch(toggles.prioritize), prefsToken()]),
      settingsGroup('Display', [fxRow()]),
      settingsGroup('Extras', [secretField()]),
      ...(devOn() ? [devGroup()] : []),
      foot
    );
    let aimTimer = 0;
    const aim = (e) => {
      const row = e.target.closest('[data-pv]');
      clearTimeout(aimTimer);
      if (row) monitor.setFocus(row.dataset.pv);
      else aimTimer = setTimeout(() => monitor.setFocus(''), 220);
    };
    list.addEventListener('pointerover', aim);
    list.addEventListener('focusin', aim);
    list.addEventListener('pointerleave', () => {
      clearTimeout(aimTimer);
      aimTimer = setTimeout(() => {
        if (!list.querySelector(':focus-visible')) monitor.setFocus('');
      }, 220);
    });
    list.addEventListener('focusout', (e) => {
      if (!list.contains(e.relatedTarget) && !list.matches(':hover')) monitor.setFocus('');
    });
    const body = el('div', 'settings__body');
    body.append(monitor.node, list);
    settingsMount.replaceChildren(head, body);
    paintPrefs(false);
  }

  const PROGRESS_KEY = 'parallax:progress';
  const SERVER_KEY = 'parallax:server';
  const RESUME_MIN = 30;
  const RESUME_DONE = 0.94;
  const PROGRESS_LIMIT = 300;
  let progressSaved = 0;

  function readStore(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value === null ? fallback : value;
    } catch (err) {
      return fallback;
    }
  }

  let progress = readStore(PROGRESS_KEY, {});
  if (!progress || typeof progress !== 'object') progress = {};

  function storeProgress() {
    const keys = Object.keys(progress);
    if (keys.length > PROGRESS_LIMIT) {
      keys
        .sort((a, b) => (progress[a].at || 0) - (progress[b].at || 0))
        .slice(0, keys.length - PROGRESS_LIMIT)
        .forEach((key) => { delete progress[key]; });
    }
    progressSaved = Date.now();
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch (err) {
      console.warn('[Parallax TV] Could not save progress:', err);
      storageFailed();
    }
  }

  function playable(route) {
    return Boolean(route) && (route.type === 'movie' || route.type === 'tv');
  }

  function progressKey(route) {
    return route.type === 'tv' ? `tv:${route.id}:${route.s}:${route.e}` : `movie:${route.id}`;
  }

  function finishTitle(route) {
    if (!playable(route)) return;
    const key = progressKey(route);
    const prev = progress[key];
    if (prev && prev.done) return;
    const d = prev && prev.d ? prev.d : 1;
    progress[key] = { t: d, d, done: true, at: Date.now() };
    storeProgress();
  }

  function recordTime(route, time, duration) {
    if (!playable(route) || !(duration > 0) || !Number.isFinite(time)) return;
    if (time / duration >= RESUME_DONE) {
      finishTitle(route);
      return;
    }
    if (time < RESUME_MIN) return;
    progress[progressKey(route)] = { t: Math.floor(time), d: Math.floor(duration), at: Date.now() };
    if (Date.now() - progressSaved > 5000) storeProgress();
  }

  function resumeTime(route) {
    if (!prefs.resume || !playable(route)) return 0;
    const saved = progress[progressKey(route)];
    return saved && !saved.done && saved.t >= RESUME_MIN ? saved.t : 0;
  }

  function rememberEpisode(route) {
    progress[`show:${route.id}`] = { s: String(route.s), e: String(route.e), at: Date.now() };
  }

  function lastEpisode(id) {
    const last = progress[`show:${id}`];
    if (!last || !last.s || !last.e) return null;
    const saved = progress[`tv:${id}:${last.s}:${last.e}`];
    return { s: String(last.s), e: String(saved && saved.done ? Number(last.e) + 1 : last.e) };
  }

  function lastServer() {
    const id = readStore(SERVER_KEY, '');
    return typeof id === 'string' ? id : '';
  }

  function saveServer(id) {
    try {
      localStorage.setItem(SERVER_KEY, JSON.stringify(id));
    } catch (err) {
      console.warn('[Parallax TV] Could not save server:', err);
    }
  }

  const SOUND_KEY = 'parallax:sound';
  let sound = readStore(SOUND_KEY, {});
  if (!sound || typeof sound !== 'object') sound = {};
  let soundTimer = 0;

  function saveSound(patch) {
    if (!prefs.remember) return;
    Object.assign(sound, patch);
    clearTimeout(soundTimer);
    soundTimer = setTimeout(() => {
      try {
        localStorage.setItem(SOUND_KEY, JSON.stringify(sound));
      } catch (err) {
        console.warn('[Parallax TV] Could not save sound:', err);
      }
    }, 400);
  }

  function applySound() {
    if (!prefs.remember || !session) return;
    const volume = Number(sound.volume);
    const rate = Number(sound.rate);
    if (volume > 0 && volume <= 1) sendCommand('setVolume', [volume]);
    if (rate >= 0.25 && rate <= 2 && rate !== 1) sendCommand('setPlaybackRate', [rate]);
  }

  function embedUrl(route) {
    const params = new URLSearchParams();
    if (route.type === 'tv') {
      params.set('s', route.s);
      params.set('e', route.e);
    }
    const color = PREF_DEFAULTS.color;
    const seek = Math.min(99, Math.max(1, Math.round(Number(prefs.seek) || PREF_DEFAULTS.seek)));
    const febbox = prefs.febbox || FEBBOX_TOKEN;
    params.set('back', 'close');
    params.set('autoplay', String(Boolean(prefs.autoplay)));
    params.set('muted', String(Boolean(prefs.muted)));
    params.set('color', color);
    params.set('seek', String(seek));
    params.set('autoskip', String(Boolean(prefs.autoskip)));
    params.set('prioritize', String(Boolean(prefs.prioritize)));
    if (route.type === 'tv') params.set('autonext', String(Boolean(prefs.autonext)));
    if (prefs.quality && prefs.quality !== 'auto') params.set('quality', String(prefs.quality));
    if (febbox) params.set('febbox', febbox);
    const resume = resumeTime(route);
    if (resume) {
      params.set('t', String(resume));
      params.set('continueprompt', 'true');
    }
    const server = prefs.prioritize ? lastServer() : '';
    if (server) params.set('lastserver', server);
    return `${CINESRC}/embed/${route.type}/${route.id}?${params}`;
  }

  function loadEmbed(route) {
    if (!session) return;
    playing = false;
    session.loadedAt = performance.now();
    session.starting = false;
    session.resuming = Boolean(resumeTime(route));
    session.duration = 0;
    session.played = false;
    session.failed = false;
    watchReset(false);
    clearTimeout(errorTimer);
    if (route.type === 'tv') rememberEpisode(route);
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

  function streamFailed() {
    if (!session || session.played || session.failed || closing) return;
    session.failed = true;
    clearTimeout(readyTimer);
    clearTimeout(autoplayTimer);
    playing = false;
    player.classList.remove('is-ready');
    frame.replaceChildren();
    const route = session.route;
    showPicker(() => buildMessage("Couldn't load this stream", 'The source may be down right now. Give it another try in a moment.', [
      secondaryButton('Try again', () => playRoute(route)),
      secondaryButton('Back to home', requestClose)
    ]));
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

  async function openPlayer(route, { push = true, fullscreen = true, origin = null } = {}) {
    if (!player || !frame || session) return;
    if (hubState !== 'closed') resetHub();
    const pending = fullscreen ? enterFullscreen() : Promise.resolve();
    const current = { route, hash: '', controller: new AbortController(), loadedAt: 0, starting: false, origin };
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

    const clip = fieldClip(current.origin);
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
    sendCommand('getCurrentTime');
    storeProgress();
    dispose();
    session.controller.abort();
    await leaveFullscreen();
    await frames();

    const clip = fieldClip(session.origin);
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
    clearTimeout(errorTimer);
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
  window.addEventListener('pagehide', storeProgress);

  window.addEventListener('message', (event) => {
    if (event.origin !== CINESRC || !session || !event.data || typeof event.data !== 'object') return;
    const source = frame && frame.querySelector('iframe');
    if (!source || event.source !== source.contentWindow) return;
    switch (event.data.type) {
      case 'cinesrc:ready':
        markReady();
        if (prefs.autoplay && !session.resuming) sendCommand('play');
        break;
      case 'cinesrc:loadedmetadata':
        if (Number(event.data.duration) > 0) session.duration = Number(event.data.duration);
        clearTimeout(errorTimer);
        applySound();
        if (prefs.autoplay && !session.resuming) startPlayback();
        break;
      case 'cinesrc:play':
        playing = true;
        session.played = true;
        clearTimeout(autoplayTimer);
        clearTimeout(errorTimer);
        break;
      case 'cinesrc:pause':
        playing = false;
        storeProgress();
        break;
      case 'cinesrc:ended':
        playing = false;
        if (performance.now() < (session.settleAt || 0)) break;
        session.ended = true;
        finishTitle(session.route);
        break;
      case 'cinesrc:timeupdate':
      case 'cinesrc:seeked': {
        if (performance.now() < (session.settleAt || 0)) break;
        const time = Number(event.data.currentTime);
        const duration = Number(event.data.duration) > 0 ? Number(event.data.duration) : session.duration;
        if (duration > 0) session.duration = duration;
        if (event.data.type === 'cinesrc:timeupdate') watchPeak(time, duration);
        recordTime(session.route, time, duration);
        break;
      }
      case 'cinesrc:volumechange':
        if (!event.data.muted && Number(event.data.volume) > 0) saveSound({ volume: Number(event.data.volume) });
        break;
      case 'cinesrc:ratechange':
        if (Number(event.data.playbackRate) > 0) saveSound({ rate: Number(event.data.playbackRate) });
        break;
      case 'cinesrc:response':
        if (event.data.command === 'getCurrentTime' && session.duration) {
          recordTime(session.route, Number(event.data.result), session.duration);
          storeProgress();
        }
        break;
      case 'cinesrc:sourceused':
        clearTimeout(errorTimer);
        if (event.data.sourceId !== undefined && event.data.sourceId !== null) saveServer(String(event.data.sourceId));
        break;
      case 'cinesrc:nextepisode': {
        const season = event.data.season;
        const episode = Number(event.data.episode);
        if (session.route.type !== 'tv' || season === undefined || season === null || !(episode > 0)) break;
        if (String(season) === String(session.route.s) && String(episode) === String(session.route.e)) break;
        if (episodeFinished()) finishTitle(session.route);
        session.route = { type: 'tv', id: session.route.id, s: String(season), e: String(episode) };
        watchReset(true);
        setHash(session.route, false);
        rememberEpisode(session.route);
        storeProgress();
        break;
      }
      case 'cinesrc:error':
        if (!session.played && !session.failed) {
          clearTimeout(errorTimer);
          errorTimer = setTimeout(streamFailed, 5000);
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

  function noticeHost() {
    let host = document.querySelector('.toasts');
    if (!host) {
      host = el('div', 'toasts');
      host.setAttribute('aria-live', 'polite');
      document.body.append(host);
    }
    return host;
  }

  function pushNotice(message, opts = {}) {
    const { tone = 'info', icon = '', detail = '', action = null, ms = 5200, gap = 6000, key = '' } = opts;
    if (!pushNotice.seen) pushNotice.seen = new Map();
    if (!pushNotice.renew) pushNotice.renew = new WeakMap();
    const host = noticeHost();
    if (key) {
      const live = [...host.children].find((node) => node.dataset.key === key && !node.classList.contains('is-leaving'));
      if (live) {
        const renew = pushNotice.renew.get(live);
        if (renew) renew();
        return live;
      }
      if (Date.now() - (pushNotice.seen.get(key) || 0) < gap) return null;
      pushNotice.seen.set(key, Date.now());
    }
    const toast = el('div', `toast toast--${tone}`);
    toast.setAttribute('role', tone === 'error' || tone === 'warn' ? 'alert' : 'status');
    if (key) toast.dataset.key = key;
    const badge = el('span', 'toast__icon');
    badge.append(svgIcon(icon || ({ success: 'success', warn: 'alert', error: 'error' }[tone] || 'info'), 'toast__glyph'));
    const body = el('span', 'toast__body');
    body.append(el('span', 'toast__title', message));
    if (detail) body.append(el('span', 'toast__detail', detail));
    toast.append(badge, body);
    if (action) {
      const button = el('button', 'toast__action', action.label);
      button.type = 'button';
      button.addEventListener('click', () => {
        dropNotice(toast);
        action.run();
      });
      toast.append(button);
    }
    const close = el('button', 'toast__close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss');
    close.append(svgIcon('close', 'toast__close-icon'));
    close.addEventListener('click', () => dropNotice(toast));
    toast.append(close);
    let timer = 0;
    let left = ms;
    let started = 0;
    const run = () => {
      if (!ms) return;
      clearTimeout(timer);
      started = Date.now();
      timer = setTimeout(() => dropNotice(toast), left);
    };
    const hold = () => {
      if (!ms || !started) return;
      clearTimeout(timer);
      left = Math.max(1200, left - (Date.now() - started));
      started = 0;
    };
    pushNotice.renew.set(toast, () => {
      left = ms;
      if (started) run();
    });
    toast.addEventListener('pointerenter', hold);
    toast.addEventListener('pointerleave', run);
    toast.addEventListener('focusin', hold);
    toast.addEventListener('focusout', (e) => {
      if (!toast.contains(e.relatedTarget)) run();
    });
    const shown = [...host.children].filter((node) => !node.classList.contains('is-leaving'));
    if (shown.length >= 3) dropNotice(shown[0]);
    host.append(toast);
    if (!reduced.matches) {
      toast.animate(
        [
          { opacity: 0, filter: 'blur(6px)', translate: '0 14px', scale: '.97' },
          { opacity: 1, filter: 'blur(0px)', translate: '0 0', scale: '1' }
        ],
        { duration: 480, easing: EASE }
      );
    }
    run();
    return toast;
  }

  function dropNotice(toast) {
    if (!toast || !toast.isConnected || toast.classList.contains('is-leaving')) return;
    toast.classList.add('is-leaving');
    if (reduced.matches) {
      toast.remove();
      return;
    }
    const fade = toast.animate(
      [{ opacity: 1, scale: '1' }, { opacity: 0, scale: '.97' }],
      { duration: 240, easing: 'ease-in', fill: 'forwards' }
    );
    settle([fade]).then(() => {
      if (!toast.isConnected) return undefined;
      const style = getComputedStyle(toast);
      const gapPx = toast.parentElement ? parseFloat(getComputedStyle(toast.parentElement).rowGap) || 0 : 0;
      const side = toast.nextElementSibling ? 'marginBottom' : 'marginTop';
      toast.style.overflow = 'hidden';
      const collapse = toast.animate(
        [
          { height: `${toast.offsetHeight}px`, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, [side]: '0px' },
          { height: '0px', paddingTop: '0px', paddingBottom: '0px', [side]: `${-gapPx}px` }
        ],
        { duration: 260, easing: EASE, fill: 'forwards' }
      );
      return settle([collapse]).then(() => toast.remove());
    });
  }

  function shakeNode(node) {
    if (!node || reduced.matches) return;
    node.animate(
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

  function storageFailed() {
    pushNotice("Couldn't save on this device", { tone: 'warn', detail: 'Your browser is blocking storage, so settings and progress may reset.', key: 'storage', gap: 60000 });
  }

  function offlineNotice() {
    pushNotice("You're offline", { tone: 'warn', icon: 'offline', detail: "We'll pick things back up as soon as you reconnect.", key: 'net', gap: 0, ms: 0 });
  }

  function backOnline() {
    const host = document.querySelector('.toasts');
    const live = host ? [...host.children].find((node) => node.dataset.key === 'net') : null;
    if (live) dropNotice(live);
    pushNotice('Back online', { tone: 'success', icon: 'online', key: 'online', gap: 4000, ms: 3200 });
    if (!session && rowsMount && SECTIONS[view] && rowsMount.querySelector('.row__empty')) loadSection(view, true);
    if (panelOpen && lastQuery && !searchItems.length) showResults(0);
  }

  function tmdbTrouble(status) {
    if (navigator.onLine === false) return;
    if (status !== 0 && status !== 429 && status < 500) return;
    if (status === 429) {
      pushNotice('Things are a little busy', { tone: 'warn', detail: 'TMDB is getting a lot of requests. Give it a few seconds.', key: 'tmdb', gap: 20000 });
    } else if (status === 503) {
      pushNotice('Movie info is unavailable', { tone: 'error', detail: "The server isn't connected to TMDB right now.", key: 'tmdb', gap: 20000 });
    } else {
      pushNotice("Couldn't reach TMDB", { tone: 'warn', detail: 'Some titles may not load. Trying again usually helps.', key: 'tmdb', gap: 20000 });
    }
  }

  function sectionFailed(retry) {
    const offline = navigator.onLine === false;
    const box = el('div', 'row__empty is-error');
    box.setAttribute('role', 'alert');
    const badge = el('span', 'row__empty-icon');
    badge.append(svgIcon(offline ? 'offline' : 'alert', 'row__empty-glyph'));
    const copy = el('span', 'row__empty-copy');
    copy.append(
      el('span', 'row__empty-title', offline ? "You're offline" : "Couldn't load this section"),
      el('span', 'row__empty-text', offline ? "Reconnect and we'll load it right away." : 'TMDB might be having a moment. Give it another try.')
    );
    box.append(badge, copy, secondaryButton('Try again', retry));
    return box;
  }

  function crashScreen({ preview = false } = {}) {
    if (document.querySelector('.crash')) return;
    const screen = el('div', 'crash');
    screen.setAttribute('role', 'alertdialog');
    screen.setAttribute('aria-modal', 'true');
    screen.setAttribute('aria-labelledby', 'crash-title');
    const card = el('div', 'crash__card');
    const logo = el('img', 'crash__logo');
    logo.src = 'icon.svg';
    logo.alt = '';
    logo.width = 52;
    logo.height = 52;
    const chip = el('span', 'crash__chip');
    chip.append(svgIcon(preview ? 'code' : 'error', 'crash__chip-icon'), document.createTextNode(preview ? 'Preview' : 'Error'));
    const title = el('h2', 'crash__title', 'Something went wrong');
    title.id = 'crash-title';
    const text = el('p', 'crash__text', 'Parallax TV hit an unexpected problem. Refreshing usually fixes it, and your settings and watch progress are safe.');
    const actions = el('div', 'crash__actions');
    const reload = el('button', 'crash__btn is-primary');
    reload.type = 'button';
    reload.append(svgIcon('refresh', 'crash__btn-icon'), el('span', null, 'Refresh'));
    reload.addEventListener('click', () => window.location.reload());
    const stay = el('button', 'crash__btn', preview ? 'Close preview' : 'Keep browsing');
    stay.type = 'button';
    actions.append(reload, stay);
    card.append(logo, chip, title, text, actions);
    screen.append(card);
    let closed = false;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      shut();
    };
    function shut() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      if (reduced.matches) {
        screen.remove();
        return;
      }
      card.animate(
        [
          { opacity: 1, scale: '1', filter: 'blur(0px)' },
          { opacity: 0, scale: '.97', filter: 'blur(6px)' }
        ],
        { duration: 280, easing: 'ease-in', fill: 'forwards' }
      );
      const out = screen.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-in', fill: 'forwards' });
      settle([out]).then(() => screen.remove());
    }
    stay.addEventListener('click', shut);
    document.addEventListener('keydown', onKey, true);
    document.body.append(screen);
    if (!reduced.matches) {
      screen.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, easing: 'ease-out' });
      card.animate(
        [
          { opacity: 0, scale: '.96', filter: 'blur(8px)', translate: '0 12px' },
          { opacity: 1, scale: '1', filter: 'blur(0px)', translate: '0 0' }
        ],
        { duration: 620, delay: 60, easing: EASE, fill: 'backwards' }
      );
    }
    stay.focus({ preventScroll: true });
  }

  function reportFault(err) {
    try {
      const now = Date.now();
      reportFault.log = (reportFault.log || []).filter((at) => now - at < 15000);
      reportFault.log.push(now);
      console.error('[Parallax TV] Unexpected error:', err);
      if (reportFault.log.length >= 3) {
        reportFault.log = [];
        crashScreen();
        return;
      }
      pushNotice('Something went wrong', {
        tone: 'error',
        detail: 'Part of the page hit a snag. Refresh if anything looks off.',
        key: 'crash',
        gap: 15000,
        action: { label: 'Refresh', run: () => window.location.reload() }
      });
    } catch (failure) {
      console.error('[Parallax TV] Could not show the error:', failure);
    }
  }

  function watchReset(settling) {
    if (!session) return;
    session.peakTime = 0;
    session.peakDuration = 0;
    session.ended = false;
    session.settleAt = settling ? performance.now() + 1500 : 0;
  }

  function watchPeak(time, duration) {
    if (!session || !Number.isFinite(time)) return;
    if (time > (session.peakTime || 0)) session.peakTime = time;
    if (duration > 0) session.peakDuration = duration;
  }

  function episodeFinished(route = session && session.route) {
    if (!session || !playable(route)) return false;
    if (session.ended) return true;
    const saved = progress[progressKey(route)];
    if (saved && saved.done) return true;
    const time = Math.max(session.peakTime || 0, saved && saved.t > 0 ? saved.t : 0);
    const duration = session.peakDuration || session.duration || (saved && saved.d) || 0;
    if (duration > 0) return time / duration >= 0.8 || (time >= RESUME_MIN && duration - time <= 150);
    return time >= 1200;
  }

  function fxGuess() {
    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 8;
    const saver = navigator.connection && navigator.connection.saveData;
    if (saver || cores <= 2 || memory <= 2) return 'low';
    if (cores <= 4 || memory <= 4) return 'medium';
    return 'high';
  }

  function fxStored() {
    const saved = readStore(FX_AUTO_KEY, null);
    return saved && typeof saved === 'object' && FX_TIERS.includes(saved.t) ? saved : null;
  }

  function fxRemember(tier, down) {
    try {
      localStorage.setItem(FX_AUTO_KEY, JSON.stringify({ t: tier, down: Boolean(down) }));
    } catch (err) {
      storageFailed();
    }
  }

  function fxTier() {
    if (FX_TIERS.includes(prefs.fx)) return prefs.fx;
    const stored = fxStored();
    return stored ? stored.t : fxGuess();
  }

  function fxBlur(value, tier) {
    if (tier === 'low') return value.replace(/blur\((?:[^()]|\([^()]*\))*\)/g, '').trim() || 'none';
    return value.replace(/blur\(\s*([\d.]+)px\s*\)/g, (_, px) => `blur(${Number(px) / 2}px)`);
  }

  function fxSolid(style) {
    const match = style.getPropertyValue('background-color').match(/rgba?\(([^)]+)\)/);
    if (!match) return false;
    const parts = match[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 4) return false;
    const alpha = parseFloat(parts[3]) * (parts[3].includes('%') ? 0.01 : 1);
    return alpha < 0.6;
  }

  function fxDecls(style, tier) {
    const back = style.getPropertyValue('backdrop-filter') || style.getPropertyValue('-webkit-backdrop-filter');
    if (!back || back === 'none') return '';
    const next = tier === 'low' ? 'none' : fxBlur(back, tier);
    const out = [`backdrop-filter: ${next} !important`, `-webkit-backdrop-filter: ${next} !important`];
    if (tier === 'low' && fxSolid(style)) out.push('background-color: rgba(22, 22, 26, .92)');
    return out.join('; ');
  }

  function fxFrames(rule, tier) {
    const steps = [...rule.cssRules];
    const filters = steps.map((step) => step.style.getPropertyValue('filter'));
    if (!filters.some((f) => f.includes('blur('))) return '';
    if (!filters.some((f) => !f || /blur\(\s*0/.test(f))) return '';
    const body = steps.map((step) => {
      const decls = [...step.style].map((prop) => {
        const value = step.style.getPropertyValue(prop);
        return `${prop}: ${prop === 'filter' && value.includes('blur(') ? fxBlur(value, tier) : value}`;
      });
      return `${step.keyText} { ${decls.join('; ')} }`;
    });
    return `@keyframes ${rule.name} { ${body.join(' ')} }`;
  }

  function fxCss(tier) {
    if (tier === 'high') return '';
    if (fxCache.has(tier)) return fxCache.get(tier);
    const walk = (rules) => {
      const out = [];
      [...rules].forEach((rule) => {
        if (rule instanceof CSSStyleRule) {
          const decls = fxDecls(rule.style, tier);
          if (decls) out.push(`${rule.selectorText} { ${decls} }`);
        } else if (rule instanceof CSSKeyframesRule) {
          const text = fxFrames(rule, tier);
          if (text) out.push(text);
        } else if (rule instanceof CSSMediaRule) {
          const inner = walk(rule.cssRules);
          if (inner.length) out.push(`@media ${rule.media.mediaText} { ${inner.join(' ')} }`);
        } else if (window.CSSSupportsRule && rule instanceof CSSSupportsRule) {
          const inner = walk(rule.cssRules);
          if (inner.length) out.push(`@supports ${rule.conditionText} { ${inner.join(' ')} }`);
        }
      });
      return out;
    };
    const parts = [];
    [...document.styleSheets].forEach((sheet) => {
      if (sheet.ownerNode === fxSheet) return;
      let rules = null;
      try {
        rules = sheet.cssRules;
      } catch (err) {
        rules = null;
      }
      if (rules) parts.push(...walk(rules));
    });
    const css = parts.join('\n');
    if (css) fxCache.set(tier, css);
    return css;
  }

  function fxApply() {
    const tier = fxTier();
    const root = document.documentElement;
    if (!fxSheet.isConnected) document.head.append(fxSheet);
    if (root.dataset.fx !== tier || fxSheet.dataset.tier !== tier) {
      root.classList.add('is-fx-shift');
      root.dataset.fx = tier;
      fxSheet.dataset.tier = tier;
      fxSheet.textContent = fxCss(tier);
      frames().then(() => root.classList.remove('is-fx-shift'));
    }
    fxPaintNote();
    fxWatch();
  }

  function fxWatch() {
    if (FX_TIERS.includes(prefs.fx)) {
      cancelAnimationFrame(fxProbe.raf || 0);
      fxProbe.raf = 0;
      return;
    }
    if (fxProbe.raf) return;
    Object.assign(fxProbe, { begin: performance.now() + 3000, last: 0, start: 0, count: 0, slow: 0, score: 0, smooth: 0 });
    fxProbe.raf = requestAnimationFrame(fxFrame);
  }

  function fxFrame(now) {
    fxProbe.raf = requestAnimationFrame(fxFrame);
    if (document.hidden || session || now < fxProbe.begin) {
      fxProbe.last = 0;
      return;
    }
    if (!fxProbe.last || now - fxProbe.last > 1000) {
      Object.assign(fxProbe, { last: now, start: now, count: 0, slow: 0 });
      return;
    }
    if (now - fxProbe.last > 50) fxProbe.slow++;
    fxProbe.last = now;
    fxProbe.count++;
    if (now - fxProbe.start < 2000) return;
    const fps = (fxProbe.count * 1000) / (now - fxProbe.start);
    const jank = fxProbe.slow / Math.max(1, fxProbe.count);
    Object.assign(fxProbe, { start: now, count: 0, slow: 0 });
    fxJudge(fps, jank);
  }

  function fxJudge(fps, jank) {
    const current = document.documentElement.dataset.fx;
    const index = Math.max(0, FX_TIERS.indexOf(current));
    if (fps < 24 || jank > 0.12) {
      fxProbe.smooth = 0;
      fxProbe.score += 1;
      if (fxProbe.score < 2 || index === 0) return;
      const next = FX_TIERS[index - 1];
      fxProbe.score = 0;
      fxProbe.begin = performance.now() + 3000;
      fxRemember(next, true);
      fxApply();
      pushNotice(`Switched to ${FX_LABEL[next]} quality`, {
        tone: 'info',
        icon: 'gauge',
        detail: 'Your device was working hard, so we eased off the effects to keep things smooth. You can change this in Settings.',
        key: 'fx',
        gap: 20000
      });
      return;
    }
    fxProbe.score = Math.max(0, fxProbe.score - 0.5);
    if (fps < 50 || jank >= 0.02) return;
    fxProbe.smooth += 1;
    const stored = fxStored();
    if (fxProbe.smooth < 30 || fxProbe.upgraded || index >= FX_TIERS.length - 1 || (stored && stored.down)) return;
    fxProbe.upgraded = true;
    fxProbe.smooth = 0;
    fxRemember(FX_TIERS[index + 1], false);
    fxApply();
  }

  function fxNote() {
    if (prefs.fx === 'low') return 'Fewest effects, smoothest on older computers';
    if (prefs.fx === 'medium') return 'Lighter glass and motion blur';
    if (prefs.fx === 'high') return 'Every effect, glass and depth at full strength';
    return `Matches your device. Running on ${FX_LABEL[fxTier()]} right now.`;
  }

  function fxPaintNote() {
    const note = settingsMount ? settingsMount.querySelector('.prefs__fx .prefs__note') : null;
    if (note) note.textContent = fxNote();
  }

  function fxRow() {
    const row = prefsSegment('fx', 'Website quality', fxNote(), FX_OPTIONS);
    delete row.dataset.pv;
    row.classList.add('prefs__fx');
    prefsPaint.push(fxPaintNote);
    return row;
  }

  function retestFx() {
    try {
      localStorage.removeItem(FX_AUTO_KEY);
    } catch (err) {
      storageFailed();
    }
    cancelAnimationFrame(fxProbe.raf || 0);
    fxProbe.raf = 0;
    fxProbe.upgraded = false;
    prefs.fx = 'auto';
    savePrefs();
    paintPrefs(true);
    pushNotice('Performance check restarted', { tone: 'info', icon: 'gauge', detail: `Starting on ${FX_LABEL[fxGuess()]} and adjusting as you browse.`, key: 'retest', gap: 1500 });
  }

  function devState() {
    const state = readStore(DEV_KEY, null);
    return state && typeof state === 'object' ? state : {};
  }

  function devOn() {
    return devState().on === true;
  }

  function setDev(patch) {
    const next = { ...devState(), ...patch };
    try {
      localStorage.setItem(DEV_KEY, JSON.stringify(next));
    } catch (err) {
      storageFailed();
    }
    return next;
  }

  async function unlockDev(code) {
    if (!/^[\x20-\x7e]{1,32}$/.test(code)) return 'wrong';
    try {
      const res = await fetch(`${window.location.origin}/api/unlock`, {
        headers: { 'x-parallax-code': code },
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (res.ok) return 'ok';
      if (res.status === 401) return 'wrong';
      if (res.status === 429) return 'slow';
      if (res.status === 503) return 'off';
      return 'down';
    } catch (err) {
      return 'down';
    }
  }

  function secretNote() {
    return devOn() ? 'Dev Mode is unlocked on this browser.' : 'Have a code? Enter it to unlock extras.';
  }

  function secretField() {
    const row = el('div', 'prefs__field prefs__secret');
    const text = el('span', 'prefs__text');
    const title = el('label', 'prefs__name', 'Secret code');
    const note = el('span', 'prefs__note', secretNote());
    text.append(title, note);
    const form = el('form', 'secret');
    form.noValidate = true;
    const input = el('input', 'prefs__input secret__input');
    input.id = 'prefs-secret';
    input.type = 'password';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.maxLength = 32;
    input.placeholder = 'Enter code';
    title.htmlFor = input.id;
    const go = el('button', 'secret__go');
    go.type = 'submit';
    go.setAttribute('aria-label', 'Unlock');
    go.append(svgIcon('right', 'secret__go-icon'));
    form.append(input, go);
    let checking = false;
    input.addEventListener('input', () => {
      note.classList.remove('is-error');
      note.textContent = secretNote();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (checking) return;
      const code = input.value.trim();
      if (!code) {
        shakeNode(form);
        input.focus({ preventScroll: true });
        return;
      }
      checking = true;
      form.classList.add('is-busy');
      go.disabled = true;
      const result = await unlockDev(code);
      checking = false;
      form.classList.remove('is-busy');
      go.disabled = false;
      if (!row.isConnected) return;
      if (result === 'ok') {
        const fresh = !devOn();
        input.value = '';
        input.blur();
        setDev({ on: true });
        note.classList.remove('is-error');
        note.textContent = secretNote();
        row.classList.add('is-unlocked');
        if (fresh) pushNotice('Dev Mode unlocked', { tone: 'success', icon: 'code', detail: 'New tools are waiting at the bottom of Settings.', key: 'dev-on', gap: 2000 });
        showDevGroup();
        return;
      }
      shakeNode(form);
      note.classList.add('is-error');
      note.textContent = {
        wrong: "That code didn't work.",
        slow: 'Too many tries. Wait a few minutes and try again.',
        off: "Codes aren't set up on this server yet."
      }[result] || "Couldn't check the code right now. Try again in a moment.";
      input.select();
    });
    if (devOn()) row.classList.add('is-unlocked');
    row.append(text, form);
    return row;
  }

  function devAction(name, note, label, run) {
    const row = el('div', 'prefs__row dev__row');
    const text = el('span', 'prefs__text');
    text.append(el('span', 'prefs__name', name), el('span', 'prefs__note', note));
    const button = el('button', 'dev__btn', label);
    button.type = 'button';
    button.dataset.label = label;
    button.addEventListener('click', () => run(button));
    row.append(text, button);
    return row;
  }

  function devSwitch(name, note, key, run) {
    const row = el('label', 'prefs__row dev__row');
    const text = el('span', 'prefs__text');
    text.append(el('span', 'prefs__name', name), el('span', 'prefs__note', note));
    const input = el('input', 'prefs__switch');
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.checked = Boolean(devState()[key]);
    input.addEventListener('change', () => {
      setDev({ [key]: input.checked });
      run(input.checked);
    });
    row.append(text, input);
    return row;
  }

  function devGroup() {
    const group = settingsGroup('Developer Access', [
      devAction('Mobile screen', 'See the screen phones and tablets get', 'Preview', previewMobileGate),
      devAction('Notifications', 'Show one of every notice style', 'Test', testNotices),
      devAction('Error screen', 'Preview the screen shown after repeated errors', 'Preview', () => crashScreen({ preview: true })),
      devSwitch('Performance meter', 'Live frame rate and quality tier in the corner', 'hud', perfMeter),
      devAction('Re-test performance', 'Forget the saved result and measure this device again', 'Re-test', retestFx),
      devAction('Clear site data', 'Wipe settings, history and progress on this browser', 'Clear', wipeSite),
      devAction('Lock Dev Mode', 'Hide these tools until the code is entered again', 'Lock', lockDev)
    ]);
    group.classList.add('settings__group--dev');
    return group;
  }

  function showDevGroup() {
    if (!settingsMount || settingsMount.querySelector('.settings__group--dev')) return;
    const foot = settingsMount.querySelector('.settings__foot');
    if (!foot) return;
    const group = devGroup();
    foot.before(group);
    if (reduced.matches) return;
    group.animate(
      [
        { opacity: 0, filter: 'blur(6px)', translate: '0 12px' },
        { opacity: 1, filter: 'blur(0px)', translate: '0 0' }
      ],
      { duration: 560, easing: EASE }
    );
  }

  function lockDev() {
    try {
      localStorage.removeItem(DEV_KEY);
    } catch (err) {
      storageFailed();
    }
    perfMeter(false);
    const secret = settingsMount ? settingsMount.querySelector('.prefs__secret') : null;
    if (secret) {
      secret.classList.remove('is-unlocked');
      const note = secret.querySelector('.prefs__note');
      if (note) note.textContent = secretNote();
    }
    pushNotice('Dev Mode locked', { tone: 'info', icon: 'lock', detail: 'Enter the code again to bring the tools back.', key: 'dev-off', gap: 0 });
    const group = settingsMount ? settingsMount.querySelector('.settings__group--dev') : null;
    if (!group) return;
    if (reduced.matches) {
      group.remove();
      return;
    }
    group.style.overflow = 'hidden';
    const out = group.animate(
      [
        { opacity: 1, height: `${group.offsetHeight}px`, filter: 'blur(0px)' },
        { opacity: 0, height: '0px', filter: 'blur(6px)' }
      ],
      { duration: 420, easing: EASE, fill: 'forwards' }
    );
    settle([out]).then(() => group.remove());
  }

  function wipeSite(button) {
    if (!button.classList.contains('is-armed')) {
      button.classList.add('is-armed');
      button.textContent = 'Click again';
      clearTimeout(wipeSite.timer);
      wipeSite.timer = setTimeout(() => {
        button.classList.remove('is-armed');
        button.textContent = button.dataset.label || 'Clear';
      }, 3200);
      return;
    }
    clearTimeout(wipeSite.timer);
    progress = {};
    prefs = { ...PREF_DEFAULTS };
    try {
      Object.keys(localStorage).filter((key) => key.startsWith('parallax:')).forEach((key) => localStorage.removeItem(key));
    } catch (err) {
      storageFailed();
    }
    window.location.reload();
  }

  function testNotices() {
    const samples = [
      ['Heads up', { tone: 'info', detail: 'General info looks like this.' }],
      ['All set', { tone: 'success', detail: 'Shown when something finishes.' }],
      ['Careful', { tone: 'warn', detail: 'Shown when something needs attention.' }],
      ['Something went wrong', { tone: 'error', detail: 'Shown when something fails.', action: { label: 'Retry', run: () => pushNotice('Retried', { tone: 'success', ms: 2400 }) } }]
    ];
    samples.forEach(([title, opts], i) => setTimeout(() => pushNotice(title, opts), i * 240));
  }

  function previewMobileGate() {
    if (document.querySelector('.gate')) return;
    const scroll = window.scrollY;
    showGate();
    const gate = document.querySelector('.gate');
    if (!gate) return;
    const exit = el('button', 'gate__exit');
    exit.type = 'button';
    exit.append(svgIcon('close', 'gate__exit-icon'), el('span', null, 'Exit preview'));
    gate.append(exit);
    let closed = false;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      leave();
    };
    function leave() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      const done = () => {
        gate.remove();
        document.documentElement.classList.remove('is-gated');
        window.scrollTo(0, scroll);
      };
      if (reduced.matches) {
        done();
        return;
      }
      settle([gate.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-in', fill: 'forwards' })]).then(done);
    }
    exit.addEventListener('click', leave);
    document.addEventListener('keydown', onKey, true);
    if (!reduced.matches) gate.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' });
    exit.focus({ preventScroll: true });
  }

  function perfMeter(on) {
    const existing = document.querySelector('.fx-hud');
    if (!on) {
      cancelAnimationFrame(perfMeter.raf || 0);
      perfMeter.raf = 0;
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    const hud = el('div', 'fx-hud');
    hud.setAttribute('aria-hidden', 'true');
    const fps = el('b', 'fx-hud__fps', '--');
    const worst = el('span', 'fx-hud__worst', '');
    const tier = el('span', 'fx-hud__tier', '');
    hud.append(fps, el('span', 'fx-hud__unit', 'fps'), worst, tier);
    document.body.append(hud);
    let start = 0;
    let last = 0;
    let count = 0;
    let peak = 0;
    const loop = (now) => {
      perfMeter.raf = requestAnimationFrame(loop);
      if (!start || now - last > 1000) {
        start = now;
        last = now;
        count = 0;
        peak = 0;
        return;
      }
      peak = Math.max(peak, now - last);
      last = now;
      count++;
      if (now - start < 500) return;
      const rate = Math.round((count * 1000) / (now - start));
      fps.textContent = String(rate);
      worst.textContent = `${Math.round(peak)}ms`;
      tier.textContent = FX_LABEL[document.documentElement.dataset.fx] || 'High';
      hud.classList.toggle('is-slow', rate < 40);
      start = now;
      count = 0;
      peak = 0;
    };
    perfMeter.raf = requestAnimationFrame(loop);
  }

  window.addEventListener('error', (e) => {
    const message = e.message || '';
    if (!e.error && (!message || message === 'Script error.')) return;
    if (/ResizeObserver loop/i.test(message)) return;
    reportFault(e.error || message);
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    if (reason && (reason.name === 'AbortError' || reason.name === 'NotAllowedError')) return;
    reportFault(reason);
  });

  window.addEventListener('offline', offlineNotice);
  window.addEventListener('online', backOnline);
  fxApply();
  if (devOn() && devState().hud) perfMeter(true);
  if (navigator.onLine === false) offlineNotice();

  const depth = document.getElementById('depth');
  const DEPTH_SLOTS = [
    ['far', 24, 9, true], ['far', 47, 12], ['far', 36, 30, true], ['far', 18, 47, true], ['far', 42, 88], ['far', 61, 84, true], ['far', 93, 90, true],
    ['mid', 12, 20], ['mid', 4, 41, true], ['mid', 71, 19], ['mid', 90, 46, true], ['mid', 28, 77],
    ['near', 6, 67], ['near', 86, 11], ['near', 78, 77],
    ['far', 58, 7, true], ['far', 35, 8, true], ['far', 78, 44, true], ['far', 26, 58, true], ['far', 16, 92, true], ['far', 95, 66, true],
    ['mid', 58, 29, true], ['mid', 52, 74, true]
  ];
  const DEPTH_SHIFT = { far: 8, mid: 18, near: 38 };
  const depthAim = { x: 0, y: 0 };
  const depthAt = { x: 0, y: 0 };
  let depthPool = [];
  let depthLayers = null;
  let depthSeq = 0;
  let depthFrame = 0;

  function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function depthLayersInit() {
    if (!depth) return null;
    if (!depthLayers) {
      depthLayers = {};
      ['far', 'mid', 'near'].forEach((name) => {
        const layer = el('div', `depth__layer depth__layer--${name}`);
        depth.append(layer);
        depthLayers[name] = layer;
      });
    }
    return depthLayers;
  }

  const DEPTH_LAG = { far: 0, mid: 160, near: 320 };
  let depthTimer = 0;

  function depthKey(item) {
    return `${item.media_type}:${item.id}`;
  }

  function depthImage(size, path) {
    const img = el('img', 'depth__img');
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.src = `${TMDB_IMG}${size}${path}`;
    return img;
  }

  function setTileItem(tile, item) {
    const title = item.media_type === 'tv' ? (item.name || item.original_name) : (item.title || item.original_title);
    const year = yearOf(item.media_type === 'tv' ? item.first_air_date : item.release_date);
    tile.dataset.key = depthKey(item);
    tile.dataset.kind = item.media_type;
    tile.dataset.id = String(item.id);
    const label = tile.querySelector('.depth__label-text');
    if (label) label.textContent = `${title || 'Untitled'}${year ? ` · ${year}` : ''}`;
  }

  async function loadDepthPool(id) {
    const pages = await Promise.all(['1', '2'].map((page) => tmdb('/trending/all/week', undefined, { language: 'en-US', page })));
    if (id !== depthSeq) return false;
    const seen = new Set();
    depthPool = pages
      .flatMap((data) => (data && Array.isArray(data.results) ? data.results : []))
      .filter((item) => {
        if (!item.poster_path || (item.media_type !== 'movie' && item.media_type !== 'tv')) return false;
        const key = depthKey(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return true;
  }

  async function buildDepth(first = false) {
    const layers = depthLayersInit();
    if (!layers) return;
    const id = ++depthSeq;
    if (!depthPool.length && !(await loadDepthPool(id))) return;
    if (!depthPool.length) return;
    const picks = shuffle(depthPool);
    const start = performance.now() + (first ? 1000 : 120);
    const still = reduced.matches;
    Object.values(layers).forEach((layer) => layer.replaceChildren());
    DEPTH_SLOTS.forEach(([name, x, y, extra], i) => {
      const item = picks[i % picks.length];
      const size = name === 'near' ? 'w342' : 'w185';
      const tile = el('span', extra ? 'depth__tile depth__tile--extra' : 'depth__tile');
      const card = el('span', 'depth__card is-waiting');
      const label = el('span', 'depth__label');
      const clip = el('span', 'depth__label-clip');
      clip.append(el('span', 'depth__label-text'));
      label.append(clip);
      tile.style.left = `${x}%`;
      tile.style.top = `${y}%`;
      tile.style.setProperty('--dd', `${-((i * 2.7) % 13).toFixed(1)}s`);
      tile.dataset.size = size;
      tile.append(card, label);
      setTileItem(tile, item);
      const img = depthImage(size, item.poster_path);
      const lag = DEPTH_LAG[name] + Math.random() * 420;
      img.addEventListener('load', () => {
        if (!tile.isConnected) return;
        card.classList.remove('is-waiting');
        tile.dataset.ready = 'true';
        if (still) return;
        card.animate(
          [
            { opacity: 0, filter: 'blur(12px)', translate: '0 26px', scale: '.9' },
            { opacity: 1, filter: 'blur(0px)', translate: '0 0', scale: '1' }
          ],
          { duration: 1500 + Math.random() * 500, delay: Math.max(0, start + lag - performance.now()), easing: EASE, fill: 'backwards' }
        );
      }, { once: true });
      img.addEventListener('error', () => tile.remove(), { once: true });
      card.append(img);
      tile.addEventListener('click', () => {
        if (!tile.dataset.ready || session) return;
        openPlayer({ type: tile.dataset.kind, id: tile.dataset.id }, { push: true, fullscreen: true, origin: card });
      });
      tile.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'mouse') return;
        depthHover = tile;
        placeLabel(tile);
        startMarquee(tile);
      });
      tile.addEventListener('pointerleave', () => {
        if (depthHover === tile) depthHover = null;
        stopMarquee(tile);
      });
      layers[name].append(tile);
    });
    scheduleShift();
  }

  function scheduleShift() {
    clearTimeout(depthTimer);
    depthTimer = setTimeout(shiftDepth, 5200 + Math.random() * 3800);
  }

  function shiftDepth() {
    scheduleShift();
    if (!depth || reduced.matches || document.hidden || view !== 'search' || session || hubState !== 'closed') return;
    const all = [...depth.querySelectorAll('.depth__tile')];
    const shown = new Set(all.map((tile) => tile.dataset.key));
    const spare = shuffle(depthPool.filter((item) => !shown.has(depthKey(item))));
    const ready = shuffle(all.filter((tile) => tile.dataset.ready && !tile.classList.contains('is-swapping') && !tile.matches(':hover') && tile.offsetParent !== null));
    const count = Math.min(spare.length, ready.length, Math.random() < 0.35 ? 2 : 1);
    for (let i = 0; i < count; i++) setTimeout(() => swapTile(ready[i], spare[i]), i * 900);
  }

  function swapTile(tile, item) {
    if (!tile.isConnected || tile.matches(':hover')) return;
    const card = tile.querySelector('.depth__card');
    if (!card) return;
    const old = card.querySelector('.depth__img:not([data-leaving])');
    tile.classList.add('is-swapping');
    const img = depthImage(tile.dataset.size || 'w185', item.poster_path);
    img.addEventListener('load', () => {
      if (!tile.isConnected) return;
      setTileItem(tile, item);
      card.append(img);
      const timing = { duration: 1600, easing: EASE };
      const fadeIn = img.animate([{ opacity: 0, scale: '1.06' }, { opacity: 1, scale: '1' }], timing);
      card.animate([{ filter: 'blur(0px)' }, { filter: 'blur(5px)', offset: 0.45 }, { filter: 'blur(0px)' }], timing);
      if (old) {
        old.dataset.leaving = 'true';
        old.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, fill: 'forwards' });
      }
      settle([fadeIn]).then(() => {
        if (old) old.remove();
        tile.classList.remove('is-swapping');
      });
    }, { once: true });
    img.addEventListener('error', () => tile.classList.remove('is-swapping'), { once: true });
  }

  let depthHover = null;

  function placeLabel(tile) {
    const label = tile && tile.isConnected ? tile.querySelector('.depth__label') : null;
    if (!label) return;
    const m = 14;
    const r = tile.getBoundingClientRect();
    const w = label.offsetWidth;
    const h = label.offsetHeight;
    const cx = r.left + r.width / 2;
    const top = r.bottom + 10;
    let dx = 0;
    let dy = 0;
    if (cx - w / 2 < m) dx = m - (cx - w / 2);
    else if (cx + w / 2 > window.innerWidth - m) dx = window.innerWidth - m - (cx + w / 2);
    if (top + h > window.innerHeight - m) dy = window.innerHeight - m - (top + h);
    if (top + dy < m) dy = m - top;
    label.style.setProperty('--lx', `${dx.toFixed(1)}px`);
    label.style.setProperty('--ly', `${dy.toFixed(1)}px`);
  }

  function startMarquee(tile) {
    const label = tile.querySelector('.depth__label');
    const clip = tile.querySelector('.depth__label-clip');
    const text = tile.querySelector('.depth__label-text');
    if (!label || !clip || !text || reduced.matches) return;
    text.getAnimations().forEach((a) => a.cancel());
    label.classList.remove('is-long');
    if (clip.scrollWidth - clip.clientWidth <= 2) return;
    label.classList.add('is-long');
    const run = text.offsetWidth - (clip.clientWidth - 20);
    if (run <= 2) {
      label.classList.remove('is-long');
      return;
    }
    const hold = 1100;
    const go = Math.max(1600, (run / 30) * 1000);
    const back = Math.max(900, go * 0.6);
    const total = hold + go + hold + back;
    text.animate(
      [
        { transform: 'translateX(0px)', offset: 0 },
        { transform: 'translateX(0px)', offset: hold / total, easing: EASE_IN_OUT },
        { transform: `translateX(${-run}px)`, offset: (hold + go) / total },
        { transform: `translateX(${-run}px)`, offset: (hold + go + hold) / total, easing: EASE_IN_OUT },
        { transform: 'translateX(0px)', offset: 1 }
      ],
      { duration: total, iterations: Infinity }
    );
  }

  function stopMarquee(tile) {
    const label = tile.querySelector('.depth__label');
    const text = tile.querySelector('.depth__label-text');
    if (!label || !text) return;
    const running = text.getAnimations();
    if (!running.length) return;
    const from = getComputedStyle(text).transform;
    running.forEach((a) => a.cancel());
    const settleBack = text.animate([{ transform: from === 'none' ? 'translateX(0px)' : from }, { transform: 'translateX(0px)' }], { duration: 450, easing: EASE });
    settle([settleBack]).then(() => {
      setTimeout(() => {
        if (!tile.matches(':hover') && !text.getAnimations().length) label.classList.remove('is-long');
      }, 150);
    });
  }

  function depthStep() {
    depthFrame = 0;
    depthAt.x += (depthAim.x - depthAt.x) * 0.06;
    depthAt.y += (depthAim.y - depthAt.y) * 0.06;
    if (depthLayers) {
      Object.entries(depthLayers).forEach(([name, layer]) => {
        const s = DEPTH_SHIFT[name];
        layer.style.transform = `translate3d(${(depthAt.x * -s).toFixed(2)}px, ${(depthAt.y * -s).toFixed(2)}px, 0)`;
      });
    }
    if (depthHover) placeLabel(depthHover);
    if (Math.abs(depthAim.x - depthAt.x) > 0.001 || Math.abs(depthAim.y - depthAt.y) > 0.001) {
      depthFrame = requestAnimationFrame(depthStep);
    }
  }

  function aimDepth(x, y) {
    depthAim.x = x;
    depthAim.y = y;
    if (!depthFrame) depthFrame = requestAnimationFrame(depthStep);
  }

  if (depth && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    window.addEventListener('pointermove', (e) => {
      if (reduced.matches || view !== 'search' || session) return;
      aimDepth((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', () => aimDepth(0, 0));
  }

  loaders.add(() => (view === 'search' ? buildDepth() : loadSection(view, true)));
  buildDepth(true);

  brand.addEventListener('click', refresh);
  brand.addEventListener('click', () => brand.classList.add('is-quiet'));
  brand.addEventListener('pointerleave', () => brand.classList.remove('is-quiet'));

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