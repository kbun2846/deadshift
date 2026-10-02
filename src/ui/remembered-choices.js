// Remembered choices (owner, 2026-10-02: "Do remember choices."; approved:
// the username, the last weapon and the last mode, so a returning player is
// two taps from playing). This browser only (localStorage), every read and
// write wrapped (a private window or blocked storage just remembers nothing),
// and anything unreadable or no longer valid is ignored.
//
// What is kept, and where it shows (AGENTS.md > Saved data):
//  - deadstab-last-weapon: the weapon of the last game played (any mode;
//    quick-wiring.js writes it while a game runs). Quick play plays it; the
//    weapons page and the online weapon pick open on it; BOTS uses it until
//    a weapon is picked there (BOTS keeps its own pick after that).
//  - deadstab-last-mode: the gamemodes page button last used (JOIN, HOST,
//    BOTS, TUTORIAL, PRACTICE): it is the page's pink main action and has the
//    focus, so PLAY then E (or a tap) goes the same way again.
//  - deadstab-last-map: the Practice map last picked: its card has the focus.
//  - The username (deadstab-username, online-play.js), BOTS' picks
//    (deadstab.duel, duel-menu.js) and HOST's setup (deadstab-host-settings,
//    deadstab-host-mode, menu.js) were already kept.
// Nothing here starts a game by itself.
import { isWeapon } from '../items.js';
import { underMaintenance } from '../weapon-maintenance.js';

export const LAST_WEAPON = 'deadstab-last-weapon';
export const LAST_MODE = 'deadstab-last-mode';
export const LAST_MAP = 'deadstab-last-map';
// The gamemodes page's buttons, by the mode each one stands for.
export const MODE_BUTTONS = Object.freeze({ join: 'join-mode', host: 'online-host', bots: 'duel-mode', tutorial: 'tutorial-mode', practice: 'practice-mode' });

const store = storage => { try { return storage === undefined ? globalThis.localStorage || null : storage; } catch { return null; } };
export function readKey(key, storage) { try { const v = store(storage)?.getItem(key); return typeof v === 'string' ? v : null; } catch { return null; } }
export function writeKey(key, value, storage) { try { const s = store(storage); if (value === null || value === undefined) s?.removeItem(key); else s?.setItem(key, String(value)); return true; } catch { return false; } }

// The last weapon, if it is a weapon that can be played now (one under
// maintenance, or a name from an older build, counts as none).
export function readLastWeapon(storage) {
 const id = readKey(LAST_WEAPON, storage);
 return id && isWeapon(id) && !underMaintenance(id) ? id : null;
}
export const saveLastWeapon = (id, storage) => (isWeapon(id) ? writeKey(LAST_WEAPON, id, storage) : false);

export function readLastMode(storage) {
 const mode = readKey(LAST_MODE, storage);
 return mode && Object.hasOwn(MODE_BUTTONS, mode) ? mode : null;
}
export const saveLastMode = (mode, storage) => (Object.hasOwn(MODE_BUTTONS, mode) ? writeKey(LAST_MODE, mode, storage) : false);

// `maps`: the ids the Practice page offers (a map since removed counts as none).
export function readLastMap(maps, storage) {
 const id = readKey(LAST_MAP, storage);
 return id && maps.includes(id) ? id : null;
}
export const saveLastMap = (id, storage) => (typeof id === 'string' && id && id !== 'tutorial' ? writeKey(LAST_MAP, id, storage) : false);

// Which mode button should be the gamemodes page's main (pink) action: the
// last one used if it is showing, else PRACTICE (the page's old default).
// `shown(mode)`: whether that button is visible (JOIN/HOST hide offline).
export function mainMode(last, shown = () => true) {
 if (last && shown(last)) return last;
 return 'practice';
}
