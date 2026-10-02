// Media mode (developer tools > Media; owner, 2026-10-01: "Add a mode into
// DevTools that lets you ... it's kind of like a media mode that lets me use
// OBS to take videos and post on TikTok or YouTube ... That media mode thing
// should let me cover the useless UI features and make the game look good and
// stuff").
//
// What it does, all of it on this screen only (nothing reaches the simulation,
// the network or anybody else's view, so it is the same online as solo):
// - Clean screen: one body class, `media-mode`, hides the clutter that never
//   belongs in a clip (the title / map · mode / room badge, the map and sound
//   buttons, ping and fps, dev overlays) and one `media-hide-<element>` class
//   per HUD element that is switched off (MEDIA_ELEMENTS). The rules are in
//   styles/media-mode.css; a new HUD element joins a toggle with a
//   `data-media="<element id>"` attribute. The pause button stays where it was,
//   invisible but still pressable (a phone has no Esc).
// - Look: "best look" draws with the highest preset the machine can run while
//   media mode is on (bestLookPreset) and goes back to the player's own preset
//   when it goes off: the preset is never saved, the setting is not touched.
//   The camera can sit a little closer or wider and follow more smoothly
//   (mediaCamera; wider never online, where seeing more would be an edge).
// - Vertical: a 9:16 guide dims everything outside a centred 9:16 frame at
//   the window's height, for cropping in OBS (the kill feed moves inside it).
// - H turns it on and off (once the tools are unlocked, never while typing,
//   and not if H has been bound to a game key). It starts off on every page
//   load; its settings are kept in localStorage (MEDIA_STORE).

export const MEDIA_STORE = 'deadstab-media';
export const MEDIA_HOTKEY = 'KeyH';
export const MEDIA_HOTKEY_LABEL = 'H';

// Every element a viewer might want, in the order the panel lists them.
// `true` in a preset shows it.
export const MEDIA_ELEMENTS = Object.freeze([
 { id: 'health', label: 'Health bar' },
 { id: 'weapon', label: 'Weapon and ammo' },
 { id: 'dodge', label: 'Dodge charges' },
 { id: 'crosshair', label: 'Crosshair / aim dot' },
 { id: 'aim', label: 'Aim guides' },
 { id: 'damage', label: 'Damage numbers' },
 { id: 'hits', label: 'Hit direction arcs' },
 { id: 'feed', label: 'Kill feed' },
 { id: 'score', label: 'Match score and clock' },
 { id: 'scoreboard', label: 'Scoreboard (Tab)' },
 { id: 'storm', label: 'Storm readout' },
 { id: 'banners', label: 'Round banners' },
 { id: 'notices', label: 'Notices and tutorial' },
 { id: 'labels', label: 'Bot labels' },
 { id: 'touch', label: 'Touch controls' },
 { id: 'vignette', label: 'Vignette' },
 // (The killcam's bars and plaque: on in both presets, a killcam makes a good clip.)
 { id: 'killcam', label: 'Killcam' },
]);
const ELEMENT_IDS = MEDIA_ELEMENTS.map(e => e.id);
const only = ids => Object.freeze(Object.fromEntries(ELEMENT_IDS.map(id => [id, ids.includes(id)])));
// Clean: just the game (and its damage numbers, the vignette it is drawn
// with). Minimal HUD: what a viewer needs to follow a fight.
export const MEDIA_PRESETS = Object.freeze({
 clean: only(['damage', 'vignette', 'killcam']),
 minimal: only(['health', 'dodge', 'crosshair', 'aim', 'damage', 'hits', 'feed', 'score', 'scoreboard', 'storm', 'banners', 'vignette', 'killcam']),
});
export const MEDIA_PRESET_LABELS = Object.freeze([['clean', 'Clean'], ['minimal', 'Minimal HUD']]);

// (Auto: the best this machine runs, bestLookPreset.)
export const MEDIA_LOOKS = Object.freeze([['auto', 'Auto (best)'], ['quality', 'Quality'], ['extreme', 'Extreme'], ['off', 'My preset']]);
export const MEDIA_ZOOMS = Object.freeze([['0.8', 'Closer'], ['0.9', 'Close'], ['1', 'Normal'], ['1.12', 'Wide (solo)'], ['1.25', 'Wider (solo)']]);
// Multipliers on the camera's follow rate: lower trails the player more softly.
export const MEDIA_FOLLOWS = Object.freeze([['normal', 'Normal', 1], ['smooth', 'Smooth', .55], ['cinematic', 'Cinematic', .32]]);
export const MEDIA_FRAMES = Object.freeze([['off', 'Off'], ['guide', '9:16 guide']]);

export const DEFAULT_MEDIA = Object.freeze({ show: MEDIA_PRESETS.clean, look: 'auto', zoom: 1, follow: 'smooth', frame: 'off' });

const pick = (value, list, fallback) => list.some(([v]) => v === String(value)) ? value : fallback;
// Anything stored (or nothing, or garbage) to a complete, valid settings object.
export function validMediaSettings(saved) {
 const s = saved && typeof saved === 'object' ? saved : {};
 const show = {};
 for (const id of ELEMENT_IDS) show[id] = typeof s.show?.[id] === 'boolean' ? s.show[id] : DEFAULT_MEDIA.show[id];
 const zoom = Number(s.zoom);
 return {
  show,
  look: pick(s.look, MEDIA_LOOKS, DEFAULT_MEDIA.look),
  zoom: MEDIA_ZOOMS.some(([v]) => Number(v) === zoom) ? zoom : DEFAULT_MEDIA.zoom,
  follow: pick(s.follow, MEDIA_FOLLOWS, DEFAULT_MEDIA.follow),
  frame: pick(s.frame, MEDIA_FRAMES, DEFAULT_MEDIA.frame),
 };
}
export const safeLocalStorage = () => { try { return globalThis.localStorage || null; } catch { return null; } };
export function loadMediaSettings(storage) {
 try { return validMediaSettings(JSON.parse(storage?.getItem(MEDIA_STORE) || 'null')); } catch { return validMediaSettings(null); }
}
// Only the settings are kept: whether media mode is on is not (it starts off).
export function saveMediaSettings(settings, storage) {
 try { storage?.setItem(MEDIA_STORE, JSON.stringify(validMediaSettings(settings))); } catch { /* private window: this page only */ }
}

// Which preset the shown elements match ('custom' when neither).
export function mediaPresetOf(show) {
 for (const [name, preset] of Object.entries(MEDIA_PRESETS)) if (ELEMENT_IDS.every(id => !!show?.[id] === preset[id])) return name;
 return 'custom';
}

// The body classes for these settings while media mode is on.
export function mediaClasses(settings) {
 const s = validMediaSettings(settings);
 const list = ['media-mode', ...ELEMENT_IDS.filter(id => !s.show[id]).map(id => 'media-hide-' + id)];
 if (s.frame === 'guide') list.push('media-frame-guide');
 return list;
}

// Best look: the preset to draw with while media mode is on, or null to keep
// the player's own. `auto` is the best the machine can run, from the device
// tier (device-tier.js): a Quality machine runs Extreme, a Balanced computer
// Quality (a phone stays at Balanced), anything else one step up to Balanced.
// Never lower than the player's own preset.
export const PRESET_ORDER = Object.freeze(['potato', 'performance', 'balanced', 'quality', 'extreme']);
export function bestLookPreset(choice, { tier = 'balanced', current = 'balanced', mobile = false } = {}) {
 if (!choice || choice === 'off') return null;
 const want = choice === 'auto' ? (tier === 'quality' ? 'extreme' : tier === 'balanced' && !mobile ? 'quality' : 'balanced') : choice;
 const at = PRESET_ORDER.indexOf(want);
 if (at < 0 || PRESET_ORDER.indexOf(current) >= at) return null;
 return want;
}

// The camera while media mode is on: { zoom, follow } (camera height and
// follow-rate multipliers). Online the camera may only come closer: a wider
// view would show more of the map than everyone else sees.
export function mediaCamera(settings, { online = false } = {}) {
 const s = validMediaSettings(settings);
 const zoom = online ? Math.min(1, s.zoom) : s.zoom;
 const follow = MEDIA_FOLLOWS.find(([v]) => v === s.follow)?.[2] ?? 1;
 return { zoom, follow };
}

// H, unmodified, not held, not typed into a field, and not bound to a game
// action (config/keybinds.js gameCode gives the action's token for a bound key).
export function isMediaHotkey(event, gameCode = code => code) {
 if (!event || event.code !== MEDIA_HOTKEY || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return false;
 if (event.target?.matches?.('input,select,textarea,[contenteditable=true]')) return false;
 return gameCode(event.code) === event.code;
}

// The controller. `body` takes the classes, `root` (#game) the 9:16 guide.
// hooks: setLook(preset | null) draws with that preset (null: the player's
// own); online() is true in an online game; tier() the device tier; quality()
// the player's own preset; mobile() a touch device; changed() after any change.
export function createMediaMode({ body, root = null, doc = globalThis.document, storage = safeLocalStorage(), hooks = {} } = {}) {
 let settings = loadMediaSettings(storage), on = false, applied = [], look = null, capped = false;
 const listeners = new Set();
 let frame = null;
 if (root && doc?.createElement) {
  frame = doc.createElement('div'); frame.className = 'media-frame'; frame.setAttribute?.('aria-hidden', 'true');
  root.append(frame);
 }
 const lookWanted = () => {
  const want = on ? bestLookPreset(settings.look, { tier: hooks.tier?.(), current: hooks.quality?.(), mobile: !!hooks.mobile?.() }) : null;
  return capped && want === 'extreme' ? bestLookPreset('quality', { current: hooks.quality?.() }) : want;
 };
 function apply() {
  const want = on ? mediaClasses(settings) : [];
  for (const name of applied) if (!want.includes(name)) body.classList.remove(name);
  for (const name of want) body.classList.add(name);
  applied = want;
  const next = lookWanted();
  if (next !== look) { look = next; hooks.setLook?.(look); }
  hooks.changed?.();
  for (const fn of listeners) fn(api);
 }
 const api = {
  get on() { return on; },
  get settings() { return settings; },
  get look() { return look; },
  get preset() { return mediaPresetOf(settings.show); },
  enable() { if (!on) { on = true; apply(); } return on; },
  disable() { if (on) { on = false; apply(); } return on; },
  toggle() { return on ? api.disable() : api.enable(); },
  // One setting: a shown element ('show.health'), or look / zoom / follow / frame.
  set(key, value) {
   const next = { ...settings, show: { ...settings.show } };
   if (key.startsWith('show.')) next.show[key.slice(5)] = !!value; else next[key] = value;
   settings = validMediaSettings(next); saveMediaSettings(settings, storage); apply();
  },
  usePreset(name) {
   if (!MEDIA_PRESETS[name]) return;
   settings = validMediaSettings({ ...settings, show: MEDIA_PRESETS[name] }); saveMediaSettings(settings, storage); apply();
  },
  // The camera for the renderer this frame (null: media mode is off).
  camera() { return on ? mediaCamera(settings, { online: !!hooks.online?.() }) : null; },
  // Extreme lost its context too often here (main.js): Quality at most from now on.
  lookFailed() { capped = true; apply(); },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  frame,
 };
 return api;
}
