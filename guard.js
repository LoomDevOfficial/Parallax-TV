(() => {
  'use strict';

  const TIERS = ['low', 'medium', 'high'];

  function read(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (err) {
      return null;
    }
  }

  function startTier() {
    const prefs = read('parallax:player');
    if (prefs && TIERS.includes(prefs.fx)) return prefs.fx;
    const auto = read('parallax:fx-auto');
    if (auto && TIERS.includes(auto.t)) return auto.t;
    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 8;
    const saver = navigator.connection && navigator.connection.saveData;
    if (saver || cores <= 2 || memory <= 2) return 'low';
    if (cores <= 4 || memory <= 4) return 'medium';
    return 'high';
  }

  document.documentElement.dataset.fx = startTier();

  const editable = (node) => Boolean(node && node.closest && node.closest('input, textarea, [contenteditable="true"]'));

  document.addEventListener('contextmenu', (e) => {
    if (!editable(e.target)) e.preventDefault();
  }, { capture: true });

  document.addEventListener('dragstart', (e) => {
    if (!editable(e.target)) e.preventDefault();
  }, { capture: true });

  document.addEventListener('keydown', (e) => {
    const key = (e.key || '').toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    const blocked =
      key === 'f12' ||
      (mod && e.shiftKey && (key === 'i' || key === 'j' || key === 'c' || key === 'k')) ||
      (e.metaKey && e.altKey && (key === 'i' || key === 'j' || key === 'c' || key === 'u')) ||
      (mod && !e.shiftKey && !e.altKey && (key === 'u' || key === 's' || key === 'p'));
    if (!blocked) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, { capture: true });

  if (window.console && console.log) {
    console.log('%cHold up!', 'color:#f4f4f6;font:700 42px system-ui,sans-serif;text-shadow:0 2px 12px rgba(0,0,0,.6)');
    console.log('%cThis is a browser feature for developers. If someone told you to paste something here, it is a scam that can take over your account or device.', 'color:#c9c9ce;font:500 15px system-ui,sans-serif;line-height:1.5');
    console.log('%cParallax TV', 'color:#8c8c94;font:600 12px system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase');
  }
})();