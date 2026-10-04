// The mix: layout B ("Galley") as the skeleton, with the "+" on the page and
// the clamp in the margin. This script switches the mock between states by
// URL hash, and makes the few things that should move when clicked actually
// move (groups open and close, right-click opens More, the device buttons
// switch the preview). Nothing here is product code.
(() => {
  // tags: which data-states lists a state answers to (an extra reuses a base
  // state and adds one thing); drawer: the open drawer; device: the preview.
  const CONF = {
    'editor': { tags: ['editor'] },
    'editor-1280': { tags: ['editor'] },
    'add': { tags: ['add'] },
    'structure': { tags: ['structure'], drawer: 'outline' },
    'style': { tags: ['style'] },
    'drag': { tags: ['drag'] },
    'tablet': { tags: ['tablet'], device: 'tablet' },
    'publish': { tags: ['publish'] },
    'history': { tags: ['history'], drawer: 'history' },
    'media': { tags: ['media'] },
    'site-style': { tags: ['site-style'] },
    'empty': { tags: ['empty'] },
    'shortcuts': { tags: ['shortcuts'] },
    // extra states (shots-extra/, made by extra-shots.mjs)
    'text-editing': { tags: ['text-editing'] },
    'small-block': { tags: ['small-block'] },
    'block-menu': { tags: ['small-block', 'block-menu'] },
    'insert-at-seam': { tags: ['insert-at-seam'] },
    'insert-drawer-1280': { tags: ['insert-drawer-1280'], drawer: 'insert' },
    'page-tab': { tags: ['page-tab'] },
    'schedule': { tags: ['editor', 'schedule'] },
    'more': { tags: ['editor', 'more'] },
    'new-section': { tags: ['new-section'] },
    'phone': { tags: ['phone'], device: 'phone' },
    'section': { tags: ['section'] },
    'pages': { tags: ['editor', 'pages'] },
    'conflict': { tags: ['editor', 'conflict'] },
    'offline': { tags: ['editor', 'offline'] },
    // added after review: the narrow gutter, the seam under the pointer,
    // a first-column block with the Outline open (1280) and with Insert open
    'narrow-gutter': { tags: ['narrow-gutter'] },
    'seam-hover': { tags: ['seam-hover'] },
    'outline-col1': { tags: ['outline-col1'], drawer: 'outline' },
    'insert-col1': { tags: ['insert-col1'], drawer: 'insert' },
  };
  // Where the canvas opens, for the states that look further down the page:
  // the gap kept above the element that carries the state in data-scroll.
  const SCROLL_GAP = { structure: 150, 'text-editing': 150, 'insert-drawer-1280': 110, section: 108, 'new-section': 120, 'narrow-gutter': 150, 'seam-hover': 330 };

  const root = document.documentElement;
  const list = (el, attr) => (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean);

  function apply() {
    const wanted = location.hash.slice(1);
    if (!CONF[wanted] && root.dataset.ready) return; // an anchor inside the page
    const id = CONF[wanted] ? wanted : 'editor';
    const conf = CONF[id];
    const hit = (el, attr) => { const l = list(el, attr); return l.includes(id) || conf.tags.some((t) => l.includes(t)); };

    root.dataset.state = id;
    root.dataset.drawer = conf.drawer || '';
    root.dataset.device = conf.device || 'desktop';
    root.dataset.ready = '1';

    document.querySelectorAll('[data-states]').forEach((el) => { el.hidden = !hit(el, 'data-states'); });
    document.querySelectorAll('[data-hide]').forEach((el) => {
      if (list(el, 'data-hide').includes(id) || list(el, 'data-hide').some((t) => conf.tags.includes(t) && t !== 'editor')) el.hidden = true;
      else if (!el.hasAttribute('data-states')) el.hidden = false;
    });
    document.querySelectorAll('[data-sel]').forEach((el) => {
      const on = hit(el, 'data-sel');
      el.classList.toggle('is-sel', on);
      if (el.hasAttribute('aria-pressed')) el.setAttribute('aria-pressed', String(on));
      if (el.getAttribute('role') === 'tab') el.setAttribute('aria-selected', String(on));
    });
    // the device switch in the bottom line: one radio per preview width
    document.querySelectorAll('.devices [data-device]').forEach((el) => el.setAttribute('aria-checked', String(el.dataset.device === root.dataset.device)));
    document.querySelectorAll('[data-open]').forEach((el) => el.setAttribute('aria-expanded', String(list(el, 'data-open').includes(id))));
    // the one control that holds keyboard focus in this state
    document.querySelectorAll('[data-focus]').forEach((el) => el.classList.toggle('is-focus', list(el, 'data-focus').includes(id)));
    document.querySelectorAll('[data-off]').forEach((el) => {
      const off = hit(el, 'data-off');
      el.classList.toggle('is-off', off);
      if (off) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled');
    });
    fitPage();
    scrollCanvas(id);
    readWidth();
  }

  // A desktop page with less than 800 of room keeps its 800 layout and is
  // drawn smaller, as the real editor does (shared/preview-widths.ts,
  // fitPreview): the frame is 800 wide and scaled to the room.
  function fitPage() {
    const canvas = document.getElementById('canvas');
    document.querySelectorAll('.frame').forEach((f) => {
      f.removeAttribute('data-scale');
      f.style.removeProperty('--unscale');
      ['width', 'transform', 'marginBottom'].forEach((p) => { f.style[p] = ''; });
    });
    if (root.dataset.device !== 'desktop') return;
    const frame = [...document.querySelectorAll('.frame')].find((f) => f.offsetParent !== null);
    if (!frame) return;
    const cs = getComputedStyle(frame);
    const room = canvas.clientWidth - parseFloat(cs.marginLeft) - parseFloat(cs.marginRight);
    if (room >= 800) return;
    const s = Math.floor((room / 800) * 10000) / 10000;
    frame.dataset.scale = String(s);
    frame.style.setProperty('--unscale', String(1 / s));
    frame.style.width = '800px';
    frame.style.transform = `scale(${s})`;
    frame.style.marginBottom = `${32 - frame.offsetHeight * (1 - s)}px`;
  }

  // Some states look at a part of the page further down.
  function scrollCanvas(id) {
    const canvas = document.getElementById('canvas');
    canvas.scrollTop = 0;
    const target = [...document.querySelectorAll('[data-scroll]')].find((el) => list(el, 'data-scroll').includes(id) || CONF[id].tags.some((t) => list(el, 'data-scroll').includes(t)));
    if (!target) return;
    const gap = SCROLL_GAP[id] ?? 60;
    canvas.scrollTop = target.getBoundingClientRect().top - canvas.getBoundingClientRect().top - gap;
  }

  // The bottom line says how wide the page is laid out, which layout that is
  // (the container query breakpoints of the theme: 560 and 800), and the
  // scale when it is drawn smaller.
  function readWidth() {
    const out = document.getElementById('width-readout');
    const site = [...document.querySelectorAll('.frame .site')].find((s) => s.offsetParent !== null);
    if (!out || !site) return;
    const w = site.offsetWidth;
    const layout = w >= 800 ? 'desktop' : w >= 560 ? 'tablet' : 'phone';
    const scale = site.closest('.frame').dataset.scale;
    out.textContent = `Page ${w} wide, ${layout} layout${scale ? `, drawn at ${Math.round(scale * 100)}%` : ''}`;
  }

  window.addEventListener('hashchange', apply);
  window.addEventListener('resize', () => { fitPage(); readWidth(); });
  apply();
  document.fonts.ready.then(() => { fitPage(); scrollCanvas(root.dataset.state); readWidth(); });

  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { e.preventDefault(); location.hash = go.dataset.go; return; }
    // collapsible groups open and close
    const head = e.target.closest('.grp-head');
    if (head && head.getAttribute('aria-disabled') !== 'true') {
      const open = head.getAttribute('aria-expanded') === 'true';
      head.setAttribute('aria-expanded', String(!open));
      const body = head.nextElementSibling;
      if (body && body.classList.contains('grp-body')) body.hidden = open;
    }
    // Block edges: a view toggle, on or off
    const edges = e.target.closest('.sb-edges');
    if (edges) {
      const on = edges.getAttribute('aria-pressed') !== 'true';
      edges.setAttribute('aria-pressed', String(on));
      root.classList.toggle('show-edges', on);
    }
  });

  // Right-click on a block opens More, the same menu as the clamp's last key.
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('.canvas .w')) return;
    e.preventDefault();
    location.hash = 'more';
  });

  // When the app menu opens, focus moves into it: one focus ring on screen.
  const appMenu = document.getElementById('app-menu');
  if (appMenu) appMenu.addEventListener('toggle', (e) => {
    if (e.newState !== 'open') return;
    document.querySelectorAll('.is-focus').forEach((el) => el.classList.remove('is-focus'));
    appMenu.querySelector('[data-first]')?.focus();
  });

  // The keys of the mix, as far as a static mock can show them. Alt and Shift
  // chords go by the key's place (code), so Option on a Mac and other
  // layouts do not change them.
  const BY_CODE = { KeyN: 'insert-drawer-1280', KeyO: 'structure', Digit1: 'editor', Digit2: 'tablet', Digit3: 'phone' };
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, [popover]')) return;
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && BY_CODE[e.code]) { e.preventDefault(); location.hash = BY_CODE[e.code]; return; }
    if (e.key === '?') location.hash = 'shortcuts';
    if (e.key === '+' && e.target.closest('.canvas')) location.hash = 'add';
    if (e.key === 'Escape' && root.dataset.state !== 'editor') location.hash = 'editor';
  });
})();
