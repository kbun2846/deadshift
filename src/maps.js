// Every map in the game, and what each one is for. Each map is plain data in
// its own file under src/maps/; the helpers that read map data (walls, props,
// colliders, prop types) live in map-kit.js and are re-exported here so the
// rest of the game imports from one place.
//
// Adding a map: make src/maps/<id>.js exporting its data (copy dry-creek.js),
// import it below and add it to MAP_LIST with the modes it supports. The
// menus, multiplayer, thumbnails and spawns read this list; nothing else
// names a map. See AGENTS.md > Adding a map.
import { deadwater } from './maps/deadwater.js';
import { dryCreek } from './maps/dry-creek.js';
import { hillTest } from './maps/hill-test.js';
import { hollowWick } from './maps/hollow-wick.js';
import { groundFor } from './map-kit.js';

export * from './map-kit.js';
export { deadwater, dryCreek, hillTest, hollowWick };

// modes: where the map can be played ('practice', 'multiplayer').
// menu:  listed on the Gamemodes > Practice map page (false = dev only, ?map=id).
const MAP_LIST = [
  { map: deadwater, modes: ['practice', 'multiplayer'], menu: true },
  { map: dryCreek, modes: ['practice'], menu: false },
  // The hills system's proving ground (stage 0 of Hollow Wick).
  { map: hillTest, modes: ['practice'], menu: false },
  // Being built (AGENTS.md > Adding a map, the staged process).
  { map: hollowWick, modes: ['practice'], menu: false },
];

for (const entry of MAP_LIST) Object.assign(entry.map, { modes: entry.modes, menu: entry.menu });

export const maps = Object.freeze(Object.fromEntries(MAP_LIST.map(({ map }) => [map.id, map])));

// A fingerprint of a map's data and its ground. The host sends it when a
// player joins; a joiner on a different map or build of it is turned away
// (every hit, wall and slope would disagree otherwise).
// Every number goes in rounded to the micrometre: some are worked out as the
// map loads (Deadwater's rounded outline uses Math.hypot), and browsers may
// differ in the last bit of those (Firefox's hypot is not Chrome's or
// Safari's), which must never turn a player away. Authored numbers are whole
// micrometres, far from any rounding tie (tests/terrain.test.js checks both).
const fingerprints = new WeakMap();
export const hashNumber = v => (typeof v === 'number' ? Math.round(v * 1e6) : v);
export function mapHash(map) {
  let hash = fingerprints.get(map);
  if (hash) return hash;
  const text = JSON.stringify(map, (key, value) => hashNumber(value)) + '|' + groundFor(map).hash;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  fingerprints.set(map, hash = h.toString(16).padStart(8, '0'));
  return hash;
}
export const DEFAULT_MAP = 'deadwater';
export const mapById = id => maps[id] || maps[DEFAULT_MAP];
export const supportsMode = (map, mode) => !!map?.modes?.includes(mode);
// The maps the Practice menu offers, in order.
export const menuMaps = () => MAP_LIST.filter(e => e.menu && e.modes.includes('practice')).map(e => e.map);
// Maps still being built (not in the menus): reached from Developer tools >
// World on the game page (hidden until the tools are unlocked).
export const workMaps = () => MAP_LIST.filter(e => !e.menu).map(e => e.map);
// Where multiplayer rooms are played (the first multiplayer map for now; a
// map vote or host pick would choose among these).
export const multiplayerMaps = () => MAP_LIST.filter(e => e.modes.includes('multiplayer')).map(e => e.map);
