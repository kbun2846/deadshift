// Keyboard bindings (owner, v147): every game key can be changed in
// Settings > Controls > KEYBOARD. The game itself still reads one fixed
// "token" per action (the action's default key code, e.g. 'KeyQ' for dodge,
// GAME_KEYS in controls.js): `gameCode` turns the physical key pressed into
// that token, so nothing downstream needs to know about rebinding. A key
// that is some action's token but is no longer bound to it does nothing.
// Bindings live on this device (localStorage), one key per action; binding
// a key another action has swaps the two.
//
// Fixed (shown, not changeable): Esc pauses, Tab holds the scoreboard, the
// left mouse button fires and the right one aims in. Menus keep their keys
// (E / Enter confirm, Q / Esc back, arrows move).

export const KEY_ACTIONS = Object.freeze([
 { id: 'up', label: 'move up', group: 'move', key: 'KeyW' },
 { id: 'left', label: 'move left', group: 'move', key: 'KeyA' },
 { id: 'down', label: 'move down', group: 'move', key: 'KeyS' },
 { id: 'right', label: 'move right', group: 'move', key: 'KeyD' },
 { id: 'dodge', label: 'dodge', group: 'move', key: 'KeyQ' },
 { id: 'shoot', label: 'fire / launch', group: 'fight', key: 'Space' },
 { id: 'aim', label: 'aim in', group: 'fight', key: 'ShiftLeft' },
 { id: 'secondary', label: 'weapon action (orbs, grenade, double)', group: 'fight', key: 'KeyE' },
 { id: 'ability', label: 'x ability (hex, nova, blast)', group: 'fight', key: 'KeyX' },
 { id: 'stream', label: 'stream (static)', group: 'fight', key: 'KeyC' },
 { id: 'reload', label: 'reload', group: 'fight', key: 'KeyR' },
 { id: 'aimUp', label: 'aim up', group: 'aim', key: 'ArrowUp' },
 { id: 'aimLeft', label: 'aim left', group: 'aim', key: 'ArrowLeft' },
 { id: 'aimDown', label: 'aim down', group: 'aim', key: 'ArrowDown' },
 { id: 'aimRight', label: 'aim right', group: 'aim', key: 'ArrowRight' },
 { id: 'map', label: 'map', group: 'other', key: 'KeyM' },
 { id: 'mute', label: 'mute sound', group: 'other', key: 'KeyN' },
]);
export const KEY_GROUPS = Object.freeze([['move', 'moving'], ['fight', 'fighting'], ['aim', 'aiming with keys'], ['other', 'other']]);
export const FIXED_KEYS = Object.freeze([['pause', 'Esc'], ['scoreboard (online)', 'Tab'], ['fire', 'left mouse'], ['aim in', 'right mouse']]);
// Keys that can never be bound (they belong to the fixed list above, or the browser).
export const RESERVED = Object.freeze(new Set(['Escape', 'Tab', 'MetaLeft', 'MetaRight', 'ContextMenu', 'F5', 'F11', 'F12']));
const STORE = 'deadshift.keybinds';
const TOKEN = new Map(KEY_ACTIONS.map(a => [a.id, a.key]));

let binds = null, reverse = null, version = 0;
// Bumped on every change, so on-screen key names can redraw.
export const bindsVersion = () => version;
function load(storage = globalThis.localStorage) {
 let saved = {};
 try { saved = JSON.parse(storage?.getItem(STORE) || '{}') || {}; } catch { saved = {}; }
 binds = new Map(KEY_ACTIONS.map(a => [a.id, a.key]));
 for (const a of KEY_ACTIONS) {
  const k = saved[a.id];
  if (typeof k === 'string' && k && !RESERVED.has(k) ) binds.set(a.id, k);
 }
 // One key per action: any clash falls back to defaults for both.
 const seen = new Map();
 for (const [id, k] of binds) { if (seen.has(k)) { binds.set(id, TOKEN.get(id)); binds.set(seen.get(k), TOKEN.get(seen.get(k))); } seen.set(k, id); }
 index();
}
function index() { version++; reverse = new Map(); for (const [id, k] of binds) if (k) reverse.set(k, id); }
function save(storage = globalThis.localStorage) {
 try { storage?.setItem(STORE, JSON.stringify(Object.fromEntries([...binds].filter(([id, k]) => k !== TOKEN.get(id))))); } catch { /* private window */ }
}
const ready = () => { if (!binds) load(); };

export function bindOf(id) { ready(); return binds.get(id) ?? null; }
export function allBinds() { ready(); return Object.fromEntries(binds); }

// The token the game reads for a physical key (or the key itself when it
// belongs to no action; null when it is an action's token no longer bound).
export function gameCode(code) {
 ready();
 const id = reverse.get(code);
 if (id) return TOKEN.get(id);
 // Right Shift aims in too while aim-in keeps Left Shift.
 if (code === 'ShiftRight' && binds.get('aim') === 'ShiftLeft') return 'ShiftLeft';
 for (const t of TOKEN.values()) if (t === code) return null;
 return code;
}

// Binds `code` to action `id`; the action that had it gets `id`'s old key.
// Returns the id of the action swapped with (or null), false if refused.
export function setBind(id, code, storage) {
 ready();
 if (!TOKEN.has(id) || !code || RESERVED.has(code)) return false;
 const old = binds.get(id), other = reverse.get(code);
 if (other === id) return null;
 binds.set(id, code);
 if (other) binds.set(other, old);
 index(); save(storage);
 return other || null;
}
export function resetBinds(storage) { ready(); binds = new Map(KEY_ACTIONS.map(a => [a.id, a.key])); index(); save(storage); }
export function reloadBinds(storage) { load(storage); }

// How a key code reads on screen: 'KeyQ' -> 'Q', 'ArrowUp' -> '↑'.
const NAMES = { Space: 'SPACE', ShiftLeft: 'SHIFT', ShiftRight: 'R SHIFT', ControlLeft: 'CTRL', ControlRight: 'R CTRL', AltLeft: 'ALT', AltRight: 'R ALT', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'ENTER', Backspace: 'BKSP', CapsLock: 'CAPS', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: '\'', Comma: ',', Period: '.', Slash: '/', Delete: 'DEL', Insert: 'INS', Home: 'HOME', End: 'END', PageUp: 'PGUP', PageDown: 'PGDN' };
export function keyName(code) {
 if (!code) return '—';
 if (NAMES[code]) return NAMES[code];
 if (/^Key[A-Z]$/.test(code)) return code.slice(3);
 if (/^Digit\d$/.test(code)) return code.slice(5);
 if (/^Numpad/.test(code)) return 'NUM ' + code.slice(6).toUpperCase();
 return code.toUpperCase();
}
export const bindLabel = id => keyName(bindOf(id));

// Text written with the default keys ('press [E]', 'X / NOVA', a HUD hint)
// shown with the player's keys: a default key's name becomes the bound one.
const DEFAULT_NAMES = new Map(KEY_ACTIONS.map(a => [keyName(a.key), a.id]));
DEFAULT_NAMES.set('CTRL', 'dodge');
export function displayKey(name) {
 const up = String(name).toUpperCase(), id = DEFAULT_NAMES.get(up);
 return id ? bindLabel(id) : name;
}
// 'E / NADE', 'LMB / SPACE', 'RMB / SHIFT': each part on its own.
export const displayKeys = text => String(text).split(/(\s*\/\s*)/).map(part => (/^\s*\/\s*$/.test(part) ? part : displayKey(part))).join('');
