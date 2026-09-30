// What a game was launched with, kept out of the address bar (v0.996a, owner:
// "remove all this crap from the game url when selecting bots and stuff, make
// it shorter"). The menus used to load `?map=…&weapon=…&play=1&mode=duel&
// duel=3v3~0~on~random~…`; now the choices go in sessionStorage and the page
// loads at its own plain address. readLaunch (once, at boot) reads them, and
// takes the game's keys off whatever is in the address bar (a join code or a
// development flag stays). A link that still carries them (an old link, the
// development tools' ?capture) works as before.
export const GAME_KEYS = Object.freeze(['map', 'weapon', 'play', 'mode', 'duel', 'course']);
const QUERY = 'deadstab.launchQuery', PENDING = 'deadstab.launch';
let current = null;
const store = (key, value) => { try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); } catch { /* private mode: the query still rides this page */ } };
const read = key => { try { return sessionStorage.getItem(key); } catch { return null; } };
// Only the game's own keys are kept for later (never a join code or an auto-host flag).
const gameOnly = query => { const q = new URLSearchParams(); for (const k of GAME_KEYS) if (query.has(k)) q.set(k, query.get(k)); return q.toString(); };

// At boot: the launch's settings, and whether this load is a launch (a game to
// start at once) rather than a plain visit or reload (the menu, on the last map).
export function readLaunch(url = globalThis.location) {
  const search = new URLSearchParams(url?.search || '');
  const pending = read(PENDING); store(PENDING, null);
  let launched;
  if (GAME_KEYS.some(k => search.has(k))) {
    current = search;
    // (menu.js marked this very address before loading it: the old way, still honoured.)
    launched = pending === '?' + search;
  } else {
    current = new URLSearchParams(read(QUERY) || '');
    for (const [k, v] of search) if (!current.has(k)) current.set(k, v);
    launched = pending === '1';
    if (!launched) for (const k of ['play', 'mode', 'duel', 'course', 'weapon']) current.delete(k);
  }
  store(QUERY, gameOnly(current));
  const keep = new URLSearchParams(url?.search || ''); for (const k of GAME_KEYS) keep.delete(k);
  try { globalThis.history?.replaceState(null, '', (url?.pathname || '') + (keep.size ? '?' + keep : '') + (url?.hash || '')); } catch { /* not a browser */ }
  return { params: current, launched };
}
// The settings the game is running with (a same-map start sets them too).
export const launchParams = () => current || new URLSearchParams();
export function setLaunch(query) { current = new URLSearchParams(query); store(QUERY, gameOnly(current)); }
// A new map: the settings kept, the page loaded again at its plain address.
export function launchTo(query) { setLaunch(query); store(PENDING, '1'); globalThis.location.href = globalThis.location.pathname; }
