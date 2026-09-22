// A floating developer panel. It sits over the game rather than inside the
// settings modal, so overrides can be flipped while play continues: toggled
// with O once the tools are unlocked, and dragged anywhere by its header.
// Everything here writes straight to sim.dev, the same object the settings tab
// writes to, so the two never hold separate opinions.

import { GRAPHICS } from './settings.js';

export const DEV_WINDOW_KEY = 'deadshift-dev-window';
export const DEV_TOGGLES = Object.freeze([
  ['ammo', 'Unlimited ammo'],
  ['orbs', 'Floating orbs'],
  ['cooldowns', 'No hex cooldown'],
  ['stamina', 'Unlimited dodge'],
  ['invulnerable', 'Invulnerable'],
  ['teleport', 'Map teleport'],
  ['rifleInstantReload', 'Nominal instant reload'],
  ['extendedCooldown', 'No extended mag cooldown'],
  ['grenadeCooldown', 'No grenade cooldown'],
  ['shotgunInstantReload', 'Ballast instant reload'],
]);
// Dropdowns the window carries alongside the switches.
export const DEV_SELECTS = Object.freeze([
  { key: 'speed', label: 'Run speed', numeric: true, options: [['1', '1×'], ['2', '2×'], ['4', '4×']] },
]);

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

export function createDevWindow(root, { sim, spawnBird, changed, setQuality, quality = () => 'balanced', storage = safeStorage(), document: doc = globalThis.document } = {}) {
  const panel = doc.createElement('section');
  panel.className = 'dev-window hidden';
  panel.setAttribute('aria-label', 'Developer window');
  panel.innerHTML = `<header class="dev-window-bar"><span>DEV · O</span><button type="button" class="dev-window-close plain-text" aria-label="Close developer window">×</button></header>
    <div class="dev-window-body">
      ${DEV_SELECTS.map(select => `<label class="dev-window-row">${select.label}<select data-dev-select="${select.key}">${select.options.map(([value, text]) => `<option value="${value}">${text}</option>`).join('')}</select></label>`).join('')}
      <label class="dev-window-row">Graphics preset<select class="dev-window-quality">${Object.entries(GRAPHICS).map(([name, tier]) => `<option value="${name}">${tier.label}</option>`).join('')}</select></label>
      <div class="dev-window-switches">
        ${DEV_TOGGLES.map(([key, label]) => `<label class="dev-window-row">${label}<input type="checkbox" data-dev="${key}"/></label>`).join('')}
      </div>
      <button type="button" class="dev-window-bird plain-text">Spawn bird</button>
      <button type="button" class="dev-window-refill plain-text">Restore health / ammo</button>
    </div>`;
  root.append(panel);

  const preset = panel.querySelector('.dev-window-quality');
  const bird = panel.querySelector('.dev-window-bird');
  if (!setQuality) preset.closest('.dev-window-row').remove();
  if (!spawnBird) bird.remove();

  let open = false, position = clampWindowPosition(readWindowPosition(storage), { width: innerWidth, height: innerHeight }, { width: 208, height: 320 });
  const place = () => {
    const box = panel.getBoundingClientRect();
    position = clampWindowPosition(position, { width: innerWidth, height: innerHeight },
      { width: box.width || 208, height: box.height || 320 });
    panel.style.left = position.x + 'px';
    panel.style.top = position.y + 'px';
  };
  const save = () => { try { storage?.setItem(DEV_WINDOW_KEY, JSON.stringify(position)); } catch { /* private mode still works */ } };

  // Reflect sim.dev rather than remember its own copy, so it is always correct
  // when opened, including after P has toggled everything at once.
  const sync = () => {
    for (const select of panel.querySelectorAll('[data-dev-select]')) select.value = String(sim.dev[select.dataset.devSelect] || 1);
    for (const input of panel.querySelectorAll('[data-dev]')) input.checked = !!sim.dev[input.dataset.dev];
    if (setQuality) preset.value = quality();
  };

  panel.addEventListener('change', event => {
    const toggle = event.target.dataset?.dev, choice = event.target.dataset?.devSelect;
    if (toggle) sim.dev[toggle] = event.target.checked;
    else if (choice) sim.dev[choice] = Number(event.target.value);
    else if (setQuality && event.target === preset) setQuality(preset.value);
    else return;
    changed?.();
  });
  panel.querySelector('.dev-window-refill').onclick = () => { refill(sim); changed?.(); };
  panel.querySelector('.dev-window-close').onclick = () => api.hide();
  if (spawnBird) bird.onclick = () => { const name = spawnBird(); if (name) bird.textContent = `Spawn bird · ${name}`; };

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
    show() { open = true; panel.classList.remove('hidden'); sync(); place(); },
    hide() { open = false; panel.classList.add('hidden'); },
    toggle() { open ? api.hide() : api.show(); return open; },
    sync,
  };
  return api;
}

// Shared with the settings tab's own restore button.
export function refill(sim) {
  sim.player.hp = sim.player.maxHp;
  sim.player.stamina = sim.maxStamina;
  sim.ammo = Math.max(0, 12 - sim.seeds.length - Math.ceil(sim.hexOrbs.length * 10 / 6));
  sim.rifle.ammo = sim.rifle.capacity; sim.rifle.reload = 0;
  sim.shotgun.ammo = 2; sim.shotgun.reload = 0; sim.shotgun.spent = 0;
  sim.rifle.extendedCooldown = 0; sim.hexCooldown = 0; sim.grenadeCooldown = 0;
}
