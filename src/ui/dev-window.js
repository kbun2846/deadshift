// A floating developer panel. It sits over the game rather than inside the
// settings modal, so overrides can be flipped while play continues: toggled
// with O once the tools are unlocked, and dragged anywhere by its header.
// Its options are the shared list in dev-options.js, one dropdown per section,
// all writing to sim.dev, the same object the settings panel writes to, so the
// two never hold separate opinions.

import { GRAPHICS } from '../settings.js';
import { DEV_OPTIONS, buildDevOptions, refill } from './dev-options.js';
import { viewWidth, viewHeight } from '../viewport.js';
export { refill };

export const DEV_WINDOW_KEY = 'deadshift-dev-window';
// The switches, as [key, label] pairs (kept for anything that lists them).
export const DEV_TOGGLES = Object.freeze(DEV_OPTIONS.filter(o => o.kind === 'toggle').map(o => [o.key, o.label]));
export const DEV_SELECTS = Object.freeze(DEV_OPTIONS.filter(o => o.kind === 'select' && o.options));

// Kept fully on screen whatever the window was last left at, so a panel saved
// on a wide monitor cannot strand itself off a phone.
export function clampWindowPosition(position, viewport, size) {
  const maxX = Math.max(0, viewport.width - size.width);
  const maxY = Math.max(0, viewport.height - size.height);
  return {
    x: Math.min(maxX, Math.max(0, Number.isFinite(position?.x) ? position.x : maxX - 24)),
    y: Math.min(maxY, Math.max(0, Number.isFinite(position?.y) ? position.y : 96)),
  };
}

// Reading globalThis.localStorage is itself a throwing operation where a host
// denies storage access — a sandboxed frame, say — so it is resolved lazily
// behind a guard instead of in a default parameter. The dev window is built on
// the startup path, and an exception raised there took the whole game down
// with it: the splash cleared, the menu appeared, and nothing was wired up.
export const safeStorage = () => { try { return globalThis.localStorage || null; } catch { return null; } };

export function readWindowPosition(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(DEV_WINDOW_KEY) || 'null');
    return saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) ? saved : null;
  } catch { return null; }
}

export function createDevWindow(root, { sim, hooks = {}, changed, setQuality, quality = () => 'balanced', storage = safeStorage(), document: doc = globalThis.document } = {}) {
  const panel = doc.createElement('section');
  panel.className = 'dev-window hidden';
  panel.setAttribute('aria-label', 'Developer window');
  // Header: drag handle, the size switch (compact / large), close. Under it
  // the quick bar (the options marked `quick`) and a filter box, then the
  // sections. Large: a wide window, bigger text, sections laid out in columns
  // and all opened, so everything can be seen and hit at once.
  panel.innerHTML = `<header class="dev-window-bar"><span>DEV · O</span><span class="dev-window-actions"><button type="button" class="dev-window-size plain-text" aria-label="Larger developer window" aria-pressed="false">⤢</button><button type="button" class="dev-window-close plain-text" aria-label="Close developer window">×</button></span></header><div class="dev-window-quick"></div><input class="dev-window-filter" type="search" placeholder="find an option" aria-label="Find a developer option"/><div class="dev-window-body"></div>`;
  root.append(panel);
  const body = panel.querySelector('.dev-window-body'), quick = panel.querySelector('.dev-window-quick'), filter = panel.querySelector('.dev-window-filter');
  const sizeButton = panel.querySelector('.dev-window-size');
  let large = false;
  try { large = storage?.getItem(DEV_WINDOW_KEY + '-large') === '1'; } catch { /* no storage */ }
  const setLarge = (on, openAll = true) => {
   large = on; panel.classList.toggle('large', on); sizeButton.setAttribute('aria-pressed', String(on));
   sizeButton.textContent = on ? '⤡' : '⤢'; sizeButton.setAttribute('aria-label', on ? 'Smaller developer window' : 'Larger developer window');
   if (on && openAll) for (const d of body.querySelectorAll('details')) d.open = true;
   try { storage?.setItem(DEV_WINDOW_KEY + '-large', on ? '1' : '0'); } catch { /* private mode */ }
   if (open) place();
  };
  sizeButton.onclick = () => setLarge(!large);
  // Quick bar: one press each, a lit button while a switch is on.
  const allHooks = () => ({ refill: () => refill(sim), ...hooks });
  const quickItems = DEV_OPTIONS.filter(o => o.quick && (o.kind === 'toggle' || o.kind === 'action'));
  const syncQuick = () => { for (const b of quick.querySelectorAll('[data-quick-toggle]')) b.setAttribute('aria-pressed', String(!!sim.dev[b.dataset.quickToggle])); };
  for (const o of quickItems) {
   const b = doc.createElement('button'); b.type = 'button'; b.className = 'dev-quick plain-text'; b.textContent = o.label.replace(/ \(.*\)$/, '');
   if (o.kind === 'toggle') b.dataset.quickToggle = o.key; else b.dataset.quickAction = o.key;
   quick.append(b);
  }
  quick.addEventListener('click', event => {
   const b = event.target.closest('button'); if (!b) return;
   if (b.dataset.quickToggle) sim.dev[b.dataset.quickToggle] = !sim.dev[b.dataset.quickToggle];
   else allHooks()[b.dataset.quickAction]?.();
   built?.sync(); syncQuick(); changed?.();
   b.blur(); // (Space is the fire key: a focused button would press again)
  });
  // Filter: rows whose words match stay, their sections open; the rest hide.
  filter.addEventListener('input', () => {
   const q = filter.value.trim().toLowerCase();
   // (The row's own words, not its dropdown's options.)
   for (const row of body.querySelectorAll('.dev-row')) row.hidden = !!q && !(row.firstChild?.textContent || '').toLowerCase().includes(q);
   for (const d of [...body.querySelectorAll('details')].reverse()) {
    const any = [...d.querySelectorAll('.dev-row')].some(r => !r.hidden);
    d.hidden = !!q && !any; if (q && any) d.open = true;
   }
  });
  // Keys typed in the filter are not game keys.
  filter.addEventListener('keydown', event => { event.stopPropagation(); if (event.key === 'Escape') event.preventDefault(); if (event.key === 'Escape') { filter.value = ''; filter.dispatchEvent(new Event('input')); filter.blur(); } });
  let built = null;
  // Filled the first time it opens, which is only ever after the unlock.
  const build = () => built ||= buildDevOptions(body, { sim, where: 'window', changed: () => changed?.(), doc,
    hooks: { ...allHooks(), ...(setQuality ? { setQuality, quality, qualityOptions: () => Object.entries(GRAPHICS).map(([name, tier]) => [name, tier.label]) } : {}) } });

  let open = false, position = clampWindowPosition(readWindowPosition(storage), { width: viewWidth(), height: viewHeight() }, { width: 232, height: 360 });
  const place = () => {
    const box = panel.getBoundingClientRect();
    position = clampWindowPosition(position, { width: viewWidth(), height: viewHeight() },
      { width: box.width || 232, height: box.height || 360 });
    panel.style.left = position.x + 'px';
    panel.style.top = position.y + 'px';
  };
  const save = () => { try { storage?.setItem(DEV_WINDOW_KEY, JSON.stringify(position)); } catch { /* private mode still works */ } };

  panel.querySelector('.dev-window-close').onclick = () => api.hide();

  // Dragging is on the header only, so the controls stay clickable.
  const bar = panel.querySelector('.dev-window-bar');
  let holding = null;
  bar.addEventListener('pointerdown', event => {
    if (event.target.closest('button')) return;
    holding = { id: event.pointerId, x: event.clientX - position.x, y: event.clientY - position.y };
    bar.setPointerCapture(event.pointerId); panel.classList.add('dragging'); event.preventDefault();
  });
  bar.addEventListener('pointermove', event => {
    if (!holding || event.pointerId !== holding.id) return;
    position = { x: event.clientX - holding.x, y: event.clientY - holding.y };
    place();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) bar.addEventListener(name, event => {
    if (!holding || event.pointerId !== holding.id) return;
    holding = null; panel.classList.remove('dragging'); save();
  });
  addEventListener('resize', () => { if (open) place(); });

  const api = {
    panel,
    get isOpen() { return open; },
    show() { open = true; build(); setLarge(large, false); panel.classList.remove('hidden'); built.sync(); syncQuick(); place(); },
    hide() { open = false; panel.classList.add('hidden'); },
    toggle() { open ? api.hide() : api.show(); return open; },
    sync() { built?.sync(); syncQuick(); },
  };
  return api;
}
