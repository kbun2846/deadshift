// The 1V1 duel circle (owner, 2026-09-29): "for 1v1 mode, there should be a
// second boundary that is like a circle that spawns in one of any part of each
// map. The size of this circle should be about 1/4-1/5 the size of the actual
// map ... it shouldn't ever be cut off by map border, it should always have the
// full circle. It's fine whatever's in it"; "the circle size should be a close
// range duel box". Forced in every 1V1 (online and SOLO vs a robot), a new
// place each round, and no storm in 1V1.
//
// A boundary: nobody walks out of it (Simulation.movePlayer confines the body,
// `sim.boundary`); shots and blasts pass (it is fog). Both players come in on
// opposite sides of it, well apart. Drawn by render/duel-circle-view.js.
//
// Pure: no DOM, no three.js. The host (net/arena.js) and SOLO (duel.js) pick
// it with their own random; joiners get it in the match state.
import { isPlayable } from './playable-area.js';
import { openAt, blocked } from './net/spawn-points.js';

export const DUEL_CIRCLE = Object.freeze({
 // (Owner, 2026-09-29: "make it so that the circle is a little bit bigger.
 // Always make it slightly bigger": .22 → .26, 14-30 → 16-34 m.)
 share: .26,          // across, as a share of the map's size (its mean side)
 minR: 16, maxR: 34,  // metres
 border: 1.5,         // metres kept between the circle and the map's edge (and its fences)
 spawnAt: [.55, .8],  // the two spots, as a share of the radius from the centre
 tries: 120,
 shrink: .92,         // no room for the whole circle anywhere: try a little smaller
 // Room to fight: at least this share of the floor inside free of walls,
 // towers and cover (a city block's tower or a mill can fill a circle).
 open: .6, grid: 2,   // metres between the floor samples
});

// The radius on a map: 1/4-1/5 of its size across (Deadwater about 26 m).
export function duelCircleRadius(map) {
 const size = ((map.width || 0) + (map.depth || 0)) / 2;
 return Math.max(DUEL_CIRCLE.minR, Math.min(DUEL_CIRCLE.maxR, size * DUEL_CIRCLE.share / 2));
}

// Two spots on opposite sides of the circle, open for a body (openAt) and
// not refused by `skip(x, z)` (online: the weapon pick's view); null if none.
export function duelSpawns(circle, map, colliders, { random = Math.random, skip = null } = {}) {
 const [near, far] = DUEL_CIRCLE.spawnAt, ok = p => openAt(map, colliders, p.x, p.z, 1) && !skip?.(p.x, p.z);
 for (let k = 0; k < 60; k++) {
  const a = random() * Math.PI * 2, d = circle.r * (near + random() * (far - near)), c = Math.cos(a) * d, s = Math.sin(a) * d;
  const one = { x: circle.x + c, z: circle.z + s }, two = { x: circle.x - c, z: circle.z - s };
  if (ok(one) && ok(two)) return [one, two];
 }
 return null;
}

// Whether the whole circle lies on playable ground (owner, 2026-09-29: "it
// should never be able to go outside of the map border, it should always be
// within the borders of the map; the fence should never be within [it]"):
// its edge all the way round, `border` metres clear of the map's outline
// (where its fences stand), and rings inside it (an outline's notch).
export function circleFits(map, x, z, r) {
 for (let i = 0; i < 64; i++) {
  const a = i / 64 * Math.PI * 2;
  if (!isPlayable(map, x + Math.cos(a) * r, z + Math.sin(a) * r, DUEL_CIRCLE.border)) return false;
 }
 for (const ring of [0, .4, .75]) for (let i = 0; i < 16; i++) {
  const a = (i + ring) / 16 * Math.PI * 2;
  if (!isPlayable(map, x + Math.cos(a) * r * ring, z + Math.sin(a) * r * ring, .5)) return false;
 }
 return true;
}

// The share of the floor inside the circle a body can stand on (playable, not
// in a wall, a solid tower or a crate): sampled every `grid` metres.
export function openShare(map, colliders, x, z, r) {
 const near = colliders.filter(b => !b.walkOver && Math.abs(b.x - x) <= r + b.w / 2 + 1 && Math.abs(b.z - z) <= r + b.d / 2 + 1), g = DUEL_CIRCLE.grid;
 let all = 0, free = 0;
 for (let dx = -r + g / 2; dx < r; dx += g) for (let dz = -r + g / 2; dz < r; dz += g) {
  if (dx * dx + dz * dz > r * r) continue;
  all++; if (isPlayable(map, x + dx, z + dz, 0) && !blocked(near, x + dx, z + dz, .4)) free++;
 }
 return all ? free / all : 0;
}

// A circle anywhere on the map, whole inside its playable outline (never over
// its edge or fences: circleFits), with its two spots. `avoid`: the last
// round's circle, not used again if another place will do. It must leave room
// to fight (openShare >= DUEL_CIRCLE.open); failing that, the most open one
// found. Where the full size fits nowhere, a little smaller, down to minR.
export function pickDuelCircle(map, colliders, { random = Math.random, skip = null, avoid = null } = {}) {
 let fallback = null;
 for (let r = duelCircleRadius(map); r >= DUEL_CIRCLE.minR * .75; r *= DUEL_CIRCLE.shrink) {
  const hx = Math.max(0, map.width / 2 - r - DUEL_CIRCLE.border), hz = Math.max(0, map.depth / 2 - r - DUEL_CIRCLE.border);
  let score = -1;
  for (let k = 0; k < DUEL_CIRCLE.tries; k++) {
   const x = (random() * 2 - 1) * hx, z = (random() * 2 - 1) * hz;
   if (!circleFits(map, x, z, r)) continue;
   const spawns = duelSpawns({ x, z, r }, map, colliders, { random, skip });
   if (!spawns) continue;
   const circle = { x, z, r, spawns }, again = avoid && Math.hypot(avoid.x - x, avoid.z - z) < r;
   const share = openShare(map, colliders, x, z, r);
   if (share >= DUEL_CIRCLE.open && !again) return circle;
   const s = share - (again ? .5 : 0); if (s > score) { score = s; fallback = circle; }
  }
  if (fallback) return fallback;
 }
 const r = DUEL_CIRCLE.minR, centre = { x: 0, z: 0, r };
 return { ...centre, spawns: duelSpawns(centre, map, colliders, { random, skip }) || [{ x: -r * .6, z: 0 }, { x: r * .6, z: 0 }] };
}

// The body kept inside (its whole radius): pushed back to the edge, and any
// speed outward taken away. Returns whether it was moved.
export function confineToCircle(player, circle, radius = 0) {
 if (!circle) return false;
 const dx = player.x - circle.x, dz = player.z - circle.z, limit = Math.max(0, circle.r - radius), d2 = dx * dx + dz * dz;
 if (d2 <= limit * limit) return false;
 const d = Math.sqrt(d2) || 1, nx = dx / d, nz = dz / d;
 player.x = circle.x + nx * limit; player.z = circle.z + nz * limit;
 const out = (player.vx || 0) * nx + (player.vz || 0) * nz;
 if (out > 0) { player.vx -= out * nx; player.vz -= out * nz; }
 return true;
}

// The circle as it travels (centimetres; no spawns).
export const circleState = c => (c ? { x: Math.round(c.x * 100) / 100, z: Math.round(c.z * 100) / 100, r: Math.round(c.r * 100) / 100 } : null);
