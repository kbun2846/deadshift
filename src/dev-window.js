// A floating developer panel. It sits over the game rather than inside the
// settings modal, so overrides can be flipped while play continues: toggled
// with O once the tools are unlocked, and dragged anywhere by its header.
// Its options are the shared list in dev-options.js, one dropdown per section,
// all writing to sim.dev, the same object the settings panel writes to, so the
// two never hold separate opinions.

import { GRAPHICS } from './settings.js';
import { DEV_OPTIONS, buildDevOptions, refill } from './dev-options.js';
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
  panel.innerHTML = `<header class="dev-window-bar"><span>DEV · O</span><button type="button" class="dev-window-close plain-text" aria-label="Close developer window">×</button></header><div class="dev-window-body"></div>`;
  root.append(panel);
  const body = panel.querySelector('.dev-window-body');
  let built = null;
  // Filled the first time it opens, which is only ever after the unlock.
  const build = () => built ||= buildDevOptions(body, { sim, where: 'window', changed: () => changed?.(), doc,
    hooks: { refill: () => refill(sim), ...hooks, ...(setQuality ? { setQuality, quality, qualityOptions: () => Object.entries(GRAPHICS).map(([name, tier]) => [name, tier.label]) } : {}) } });

  let open = false, position = clampWindowPosition(readWindowPosition(storage), { width: innerWidth, height: innerHeight }, { width: 232, height: 360 });
  const place = () => {
    const box = panel.getBoundingClientRect();
    position = clampWindowPosition(position, { width: innerWidth, height: innerHeight },
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
    show() { open = true; build(); panel.classList.remove('hidden'); built.sync(); place(); },
    hide() { open = false; panel.classList.add('hidden'); },
    toggle() { open ? api.hide() : api.show(); return open; },
    sync() { built?.sync(); },
  };
  return api;
}
