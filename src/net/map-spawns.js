// Authored spawns (maps with `bases` / `ffaSpawns`: Hollow Wick). A map
// without them (Deadwater) never reaches this file: its spawns stay the
// building interiors of spawn-points.js, exactly as before.
//
// What a map gives (src/maps/hollow-wick-spawns.js):
//  - bases: [{ id, x, z, poly, points: [{x, z}] }]: team modes spawn each side
//    at its base (`teamBases[number of sides]` names them in TEAMS order),
//    whatever the spawns setting.
//  - ffaSpawns: [{x, z}]: everyone else (FFA, 1V1, practice, scattered SOLO)
//    comes in at one of these, at least `space` (SPAWN_APART) from everyone
//    alive and, where it can be, hidden from them by the ground
//    (ground.sightClear); failing that the caller samples an open spot.
//  - noSpawn: [{ id, poly }]: never a spawn there.
// Every point is re-checked against the live world (spawnProblem): a prop or
// wall within 1 m, water, a deck, steep ground, a building or a no-spawn area
// drops it, so later props can never bury a spawn.
// No DOM, no three.js.
import { groundFor, buildingContains } from '../maps.js';
import { isPlayable } from '../playable-area.js';
import { insidePoly } from '../world/heightfield.js';
import { onScreenOf } from '../render/camera-framing.js';
import { segmentBox } from '../simulation.js';

export const SPAWN_CLEAR = 1;      // metres from a spawn to the nearest collider
export const SPAWN_SLOPE = .3;     // steepest ground (rise per metre) to spawn on
export const BASE_GAP = 1.6;       // teammates at a base: a body apart
// A base point this close to a living enemy, or in their sight (on their
// screen, over the ground, with no building wall between: that stops every
// round), is passed over while another will do (stage 4 audit: base A sits on
// the main street, and every respawn landed in view of an enemy standing there).
export const BASE_SAFE = 12;
const SLOPE_RING = [[0, 0], [.5, 0], [-.5, 0], [0, .5], [0, -.5]];

export const hasAuthoredSpawns = map => !!(map?.bases?.length || map?.ffaSpawns?.length);

// Distance from (x, z) to a (possibly rotated) collider box; 0 inside.
function boxDistance(b, x, z) {
 const angle = b.localW !== undefined ? (b.angle || 0) : 0, c = Math.cos(angle), s = Math.sin(angle);
 const px = (x - b.x) * c - (z - b.z) * s, pz = (x - b.x) * s + (z - b.z) * c;
 const hw = (b.localW ?? b.w) / 2, hd = (b.localD ?? b.d) / 2;
 return Math.hypot(Math.max(0, Math.abs(px) - hw), Math.max(0, Math.abs(pz) - hd));
}

export const inNoSpawn = (map, x, z) => !!map.noSpawn?.some(a => insidePoly(x, z, a.poly));

// Why (x, z) is no place to spawn ('edge', 'water', 'deck', 'slope',
// 'noSpawn', 'building', 'collider'), or null when it is fine.
export function spawnProblem(map, colliders, x, z, { clear = SPAWN_CLEAR } = {}) {
 if (!isPlayable(map, x, z, 1)) return 'edge';
 const ground = groundFor(map);
 if (!ground.flat) {
  if (ground.bankDistance(x, z) < 0 || ground.wetAt(x, z)) return 'water';
  if (ground.deckAt(x, z) >= 0) return 'deck';
  const g = { x: 0, z: 0 };
  for (const [dx, dz] of SLOPE_RING) { ground.gradientAt(x + dx, z + dz, g); if (Math.hypot(g.x, g.z) > SPAWN_SLOPE) return 'slope'; }
  if (ground.wallAt?.(x, z)) return 'slope';
 }
 if (inNoSpawn(map, x, z)) return 'noSpawn';
 if (map.buildings?.some(b => buildingContains(b, { x, z }))) return 'building';
 for (const b of colliders) {
  if (b.walkOver) continue;
  if (Math.abs(x - b.x) > b.w / 2 + clear || Math.abs(z - b.z) > b.d / 2 + clear) continue;
  if (boxDistance(b, x, z) < clear) return 'collider';
 }
 return null;
}

// The base each side uses: TEAMS order (their ids) against teamBases[n].
export function teamBase(map, team, sides) {
 const ids = map.teamBases?.[sides.length], i = sides.indexOf(team);
 const id = ids?.[i]; return id ? map.bases.find(b => b.id === id) || null : null;
}

// Can a living enemy at `e` see or shoot (x, z)? Within BASE_SAFE, or on
// their screen with the ground and the buildings' walls clear between.
export function exposedTo(map, colliders, e, x, z) {
 const dx = x - e.x, dz = z - e.z;
 if (Math.hypot(dx, dz) < BASE_SAFE) return true;
 const ground = groundFor(map);
 if (!onScreenOf(e.aspect || 16 / 9, dx, dz, ground.heightAt(x, z) - ground.heightAt(e.x, e.z))) return false;
 if (!ground.flat && !ground.sightClear(e.x, e.z, x, z)) return false;
 return !colliders.some(b => b.buildingId && !b.playerOnly && segmentBox(e.x, e.z, x, z, b, 0) !== null);
}

// A spot at `base` for a body: one of its points nobody is on (random),
// preferring those no living enemy (`enemies`) can see or reach; when every
// point is exposed, the FFA point nearest the base that is not (within 30 m);
// else an exposed point, a sampled open spot within 7 m of its centre, or its
// first point.
export function baseSpot(map, colliders, base, { others = [], enemies = [], random = Math.random, gap = BASE_GAP } = {}) {
 if (!base) return null;
 const free = pt => others.every(o => Math.hypot(o.x - pt.x, o.z - pt.z) >= gap);
 const good = base.points.filter(pt => free(pt) && !spawnProblem(map, colliders, pt.x, pt.z));
 const safe = pt => !enemies.some(e => exposedTo(map, colliders, e, pt.x, pt.z));
 const hidden = enemies.length ? good.filter(safe) : good;
 if (hidden.length) { const pt = hidden[Math.floor(random() * hidden.length)]; return { x: pt.x, z: pt.z }; }
 if (enemies.length) {
  const alt = (map.ffaSpawns || []).filter(pt => free(pt) && safe(pt) && Math.hypot(pt.x - base.x, pt.z - base.z) < 30 && !spawnProblem(map, colliders, pt.x, pt.z))
   .sort((a, b) => Math.hypot(a.x - base.x, a.z - base.z) - Math.hypot(b.x - base.x, b.z - base.z))[0];
  if (alt) return { x: alt.x, z: alt.z };
 }
 if (good.length) { const pt = good[Math.floor(random() * good.length)]; return { x: pt.x, z: pt.z }; }
 for (let k = 0; k < 200; k++) {
  const a = random() * Math.PI * 2, d = 1 + random() * 6, x = base.x + Math.cos(a) * d, z = base.z + Math.sin(a) * d;
  if (free({ x, z }) && !spawnProblem(map, colliders, x, z)) return { x, z };
 }
 return { x: base.points[0].x, z: base.points[0].z };
}

// An FFA point `space` metres from everyone in `others` (a screen away: off
// every screen), half the time one the ground hides from all of them too
// (stage 4 audit: always taking a hidden one, when there was one, put a third
// of all respawns at the one point behind Church Hill), leaving out the last
// few used (`recent`, [{x, z}], when the caller keeps them). Null when no
// authored point is that far from everyone (the caller then samples).
// `skip(x, z)`: points to leave out (the weapon-pick view's ground).
export function ffaSpot(map, colliders, { others = [], random = Math.random, space = 26, skip = null, recent = null } = {}) {
 const ground = groundFor(map), far = [], hidden = [];
 for (const pt of map.ffaSpawns || []) {
  if (skip?.(pt.x, pt.z) || spawnProblem(map, colliders, pt.x, pt.z)) continue;
  if (recent?.some(r => r.x === pt.x && r.z === pt.z)) continue;
  if (!others.every(o => Math.hypot(o.x - pt.x, o.z - pt.z) >= space)) continue;
  far.push(pt);
  if (others.every(o => !ground.sightClear(pt.x, pt.z, o.x, o.z))) hidden.push(pt);
 }
 if (!far.length && recent?.length) return ffaSpot(map, colliders, { others, random, space, skip });
 const pool = hidden.length && (random() < .5 || hidden.length === far.length) ? hidden : far;
 if (!pool.length) return null;
 const pt = pool[Math.floor(random() * pool.length)];
 return { x: pt.x, z: pt.z };
}

// Last resort: the valid authored point furthest from everyone.
export function furthestSpot(map, colliders, others = []) {
 let best = null, bestD = -1;
 for (const pt of map.ffaSpawns || []) {
  if (spawnProblem(map, colliders, pt.x, pt.z)) continue;
  const d = others.length ? Math.min(...others.map(o => Math.hypot(o.x - pt.x, o.z - pt.z))) : Infinity;
  if (d > bestD) { bestD = d; best = pt; }
 }
 return best && { x: best.x, z: best.z };
}
