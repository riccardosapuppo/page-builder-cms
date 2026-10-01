// Switches the mock between states by URL hash. Nothing else here matters.
(() => {
  const STATES = ['editor', 'style', 'drag', 'save-states', 'media', 'publish', 'history', 'site-style',
    'shortcuts', 'empty', 'page', 'page-phone', 'tokens', 'about', 'context', 'advanced'];
  const root = document.documentElement;
  const has = (el, attr, state) => (el.getAttribute(attr) || '').split(/\s+/).includes(state);

  function apply() {
    const wanted = location.hash.slice(1);
    if (!STATES.includes(wanted) && root.dataset.ready) return; // an anchor inside the page
    const state = STATES.includes(wanted) ? wanted : 'editor';
    root.dataset.state = state;
    root.dataset.ready = '1';
    document.querySelectorAll('[data-states]').forEach((el) => { el.hidden = !has(el, 'data-states', state); });
    document.querySelectorAll('[data-sel]').forEach((el) => {
      const on = has(el, 'data-sel', state);
      el.classList.toggle('is-sel', on);
      if (el.hasAttribute('aria-pressed')) el.setAttribute('aria-pressed', String(on));
    });
    document.querySelectorAll('[data-open]').forEach((el) => el.setAttribute('aria-expanded', String(has(el, 'data-open', state))));
    // the one control that holds keyboard focus in a state, and controls that are off in it
    document.querySelectorAll('[data-focus]').forEach((el) => el.classList.toggle('is-focus', has(el, 'data-focus', state)));
    document.querySelectorAll('[data-off]').forEach((el) => {
      const off = has(el, 'data-off', state);
      el.classList.toggle('is-off', off);
      if (off) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled');
    });
    scrollCanvas(state);
  }

  // Some states look at a part of the page further down.
  function scrollCanvas(state) {
    const canvas = document.getElementById('canvas');
    if (!canvas) return;
    canvas.scrollTop = 0;
    const target = [...document.querySelectorAll('[data-scroll]')].find((el) => has(el, 'data-scroll', state));
    if (!target) return;
    const offset = { drag: 170, advanced: 100 }[state] ?? 56;
    canvas.scrollTop = target.getBoundingClientRect().top - canvas.getBoundingClientRect().top - offset;
  }

  window.addEventListener('hashchange', apply);
  apply();
  document.fonts.ready.then(() => scrollCanvas(root.dataset.state));

  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { e.preventDefault(); location.hash = go.dataset.go; }
    const ctx = document.getElementById('ctx-menu');
    if (ctx && root.dataset.state !== 'context' && !e.target.closest('#ctx-menu')) ctx.hidden = true;
  });

  // Right-click on a block opens its context menu at the pointer.
  document.addEventListener('contextmenu', (e) => {
    const block = e.target.closest('.canvas .w');
    const ctx = document.getElementById('ctx-menu');
    if (!block || !ctx || root.dataset.state === 'page') return;
    e.preventDefault();
    ctx.hidden = false;
    ctx.style.left = `${e.clientX}px`;
    ctx.style.top = `${e.clientY}px`;
    ctx.classList.add('is-floating');
  });

  // When the app menu opens, focus moves into it: one focus ring on screen.
  const appMenu = document.getElementById('app-menu');
  if (appMenu) appMenu.addEventListener('toggle', (e) => {
    if (e.newState !== 'open') return;
    document.querySelectorAll('.is-focus').forEach((el) => el.classList.remove('is-focus'));
    appMenu.querySelector('[data-first]')?.focus();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, [popover]')) return;
    if (e.key === '?') location.hash = 'shortcuts';
    if (e.key === 'Escape' && root.dataset.state !== 'editor') location.hash = 'editor';
  });
})();
