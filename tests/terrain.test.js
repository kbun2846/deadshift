// The hills system's ground (world/heightfield.js, world/terrain-bake.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { maps, groundFor, mapColliders, mapHash, hashNumber } from '../src/maps.js';
import { isPlayable } from '../src/playable-area.js';
import { FLAT, Ground, CELL, FLIGHT_STEP, FLIGHT_SPAN, decodeHeights, edgeCollider } from '../src/world/heightfield.js';
import { bakeTerrain, encodeHeights, terrainSourceHash } from '../src/world/terrain-bake.js';
import { BAKED_TERRAIN } from '../src/maps/terrain/index.js';
import { inside } from '../src/simulation.js';
import { RULES, TERRAIN } from '../src/config/gameplay.js';

const terrainMaps = Object.values(maps).filter(m => m.terrain);
function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const groundOf = map => { const b = bakeTerrain(map); return new Ground({ ...b, heights: b.heights }, map.terrain); };

test('a map without terrain is exactly flat, and gets no terrain colliders', () => {
 assert.equal(groundFor(maps.deadwater), FLAT);
 assert.equal(groundFor({ id: 'x' }), FLAT);
 assert.ok(Object.isFrozen(FLAT));
 assert.equal(FLAT.heightAt(12.3, -40), 0);
 assert.deepEqual(FLAT.gradientAt(1, 2), { x: 0, z: 0 });
 assert.equal(FLAT.sightClear(0, 0, 50, 50), true);
 assert.equal(FLAT.flight(1, 0, 1, 0, 55, 0).stop, Infinity);
 assert.equal(FLAT.flightReaches(0, 0, 50, 50), true);
 assert.equal(mapColliders(maps.deadwater).some(c => c.terrainEdge), false);
});

test('every terrain map ships an up-to-date bake (else: node tools/bake-terrain.mjs)', () => {
 assert.ok(terrainMaps.length > 0);
 for (const map of terrainMaps) {
  const shipped = BAKED_TERRAIN[map.id];
  assert.ok(shipped, `${map.id} has no baked terrain`);
  assert.equal(shipped.hash, terrainSourceHash(map), `${map.id}: the terrain spec or a building pad changed; re-bake`);
  const fresh = bakeTerrain(map), heights = decodeHeights(shipped.data, shipped.cols, shipped.rows);
  assert.deepEqual([shipped.minX, shipped.minZ, shipped.cols, shipped.rows], [fresh.minX, fresh.minZ, fresh.cols, fresh.rows]);
  assert.ok(Buffer.from(heights.buffer).equals(Buffer.from(fresh.heights.buffer)), `${map.id}: shipped grid differs from a fresh bake`);
  // And a second bake is identical to the first.
  assert.ok(Buffer.from(bakeTerrain(map).heights.buffer).equals(Buffer.from(fresh.heights.buffer)));
 }
});

test('the grid text form round-trips any heights', () => {
 const random = seeded(5), cols = 37, rows = 23, heights = new Int16Array(cols * rows);
 for (let i = 0; i < heights.length; i++) heights[i] = random() < .1 ? Math.round((random() - .5) * 65000) : Math.round(Math.sin(i * .1) * 3000 + random() * 20);
 const back = decodeHeights(encodeHeights(heights, cols), cols, rows);
 assert.deepEqual([...back], [...heights]);
});

test('buildings stand on flat pads at their baseY', () => {
 for (const map of terrainMaps) {
  const ground = groundFor(map);
  for (const b of map.buildings.filter(b => Number.isFinite(b.baseY))) {
   const c = Math.cos(b.angle || 0), s = Math.sin(b.angle || 0);
   let lo = Infinity, hi = -Infinity;
   for (let i = 0; i <= 24; i++) for (let j = 0; j <= 24; j++) {
    const lx = (i / 24 - .5) * b.w, lz = (j / 24 - .5) * b.d;
    const h = ground.heightAt(b.x + lx * c + lz * s, b.z - lx * s + lz * c);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
   }
   assert.ok(hi - lo < .05, `${map.id} ${b.id}: footprint varies ${(hi - lo).toFixed(3)} m`);
   assert.ok(Math.abs(lo - b.baseY) < .002, `${map.id} ${b.id}: pad at ${lo} not ${b.baseY}`);
  }
 }
});

test('gradientAt is the slope of heightAt', () => {
 const ground = groundFor(maps['hill-test']), random = seeded(9), out = { x: 0, z: 0 };
 for (let k = 0; k < 400; k++) {
  const x = -40 + random() * 80, z = -36 + random() * 72, e = 1e-4;
  ground.gradientAt(x, z, out);
  const cx = Math.floor((x - ground.minX) / CELL), cz = Math.floor((z - ground.minZ) / CELL);
  // Stay inside one grid cell for the finite difference.
  const fx = (x - ground.minX) / CELL - cx, fz = (z - ground.minZ) / CELL - cz;
  if (fx < .01 || fx > .99 || fz < .01 || fz > .99) continue;
  assert.ok(Math.abs(out.x - (ground.heightAt(x + e, z) - ground.heightAt(x - e, z)) / (2 * e)) < 1e-3);
  assert.ok(Math.abs(out.z - (ground.heightAt(x, z + e) - ground.heightAt(x, z - e)) / (2 * e)) < 1e-3);
 }
});

test('sight over the ground is mutual, blocked by a crest and clear over open ground', () => {
 const map = maps['hill-test'], ground = groundFor(map), random = seeded(21);
 let blocked = 0;
 for (let k = 0; k < 3000; k++) {
  const ax = -34 + random() * 68, az = -28 + random() * 56, bx = -34 + random() * 68, bz = -28 + random() * 56;
  const ab = ground.sightClear(ax, az, bx, bz);
  assert.equal(ab, ground.sightClear(bx, bz, ax, az), `sight (${ax},${az}) <-> (${bx},${bz}) is one-way`);
  if (!ab) blocked++;
 }
 assert.ok(blocked > 50, 'the hill and the plateau hide some pairs');
 // Either side of the hill, low down: hidden. Along open flat ground: seen.
 assert.equal(ground.sightClear(-4, -10, 32, -10), false);
 assert.equal(ground.sightClear(-8, 4, 8, 8), true);
 // Up close nothing hides you.
 assert.equal(ground.sightClear(14, -10, 14.4, -10.2), true);
 // From the top of the hill you see down both sides.
 assert.equal(ground.sightClear(14, -10, 0, -10), true);
 assert.equal(ground.sightClear(14, -10, 28, -10), true);
});

test('a round flies over the ground: never into it before its stop, never steeper than 1:1, and stopped only by walls', () => {
 // (Owner, 2026-09-26: rounds stay over the ground wherever the height
 // changes gently. heightfield.js flight.)
 for (const map of terrainMaps) {
  const ground = groundFor(map), random = seeded(33), walls = mapColliders(map).filter(c => c.terrainEdge);
  let stopped = 0;
  for (let k = 0; k < 500; k++) {
   const ox = ground.minX + random() * (ground.maxX - ground.minX), oz = ground.minZ + random() * (ground.maxZ - ground.minZ), a = random() * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
   if (walls.some(w => inside({ x: ox, z: oz }, w, RULES.radius))) continue;
   const x = ox + dx * .9, z = oz + dz * .9, f = ground.flight(x, z, dx, dz, 40, ground.heightAt(ox, oz));
   for (let i = 1; i <= f.n; i++) {
    const s = Math.min(40, i * FLIGHT_STEP), was = Math.min(40, (i - 1) * FLIGHT_STEP);
    assert.ok(Math.abs(f.heights[i] - f.heights[i - 1]) <= TERRAIN.roundClimb * (s - was) + 1e-9, `${map.id}: too steep at ${s}`);
    if (s < f.stop) assert.ok(ground.drawnHeightAt(x + dx * s, z + dz * s) <= f.heights[i] + TERRAIN.roundHeight + 1e-9 || ground.deckAt(x + dx * s, z + dz * s) >= 0, `${map.id}: into the ground at ${s} before its stop ${f.stop}`);
   }
   if (!(f.stop < 40)) continue;
   stopped++;
   // Where it stops, a retaining wall stands, or the ground rises steeper
   // than it climbs.
   const px = x + dx * f.stop, pz = z + dz * f.stop;
   const wall = walls.some(w => inside({ x: px, z: pz }, w, 1.5)), steep = ground.drawnHeightAt(px, pz) - ground.drawnHeightAt(px - dx, pz - dz) > TERRAIN.orbRise;
   assert.ok(wall || steep, `${map.id}: stopped at ${px.toFixed(2)}, ${pz.toFixed(2)} by neither a wall nor a steep rise`);
  }
  assert.ok(stopped >= 3, `${map.id}: the walls end some rounds (${stopped})`);
 }
});

test('a round holds its height across a narrow hollow, comes down a slope with the ground, and goes over or under a deck', () => {
 const map = maps['hollow-wick'], ground = groundFor(map);
 // Across the east gully (a walled cutting 4.4 m wide) from the town to the town.
 assert.equal(ground.flightReaches(43.9, 6.9, 32.1, -4.4), true);
 assert.ok(FLIGHT_SPAN >= 4.4);
 // Down the terraced slope and over the lip to the stream's bank: it keeps
 // to the ground (never more than a metre over it by the end).
 const f = ground.flight(-40, -14, 0, 1, 26, ground.heightAt(-40, -14));
 assert.equal(f.stop, Infinity);
 assert.ok(ground.flightAt(f, 26) - ground.heightAt(-40, 12) < 1, 'it came down with the ground');
 // Along the bridge from its north bank: over the deck all the way.
 const deck = ground.decks[ground.deckAt(-14, 22)], along = ground.flight(-14, 14, 0, 1, 16, ground.heightAt(-14, 14));
 for (let s = 4; s <= 13; s += .5) assert.ok(Math.abs(ground.flightAt(along, s) - deck.h) < .05, `over the bridge at ${s}: ${ground.flightAt(along, s)}`);
 // Across the stream under it from the west: under the deck.
 const under = ground.flight(-19, 22.1, 1, 0, 10, ground.heightAt(-19, 22.1));
 for (let s = 4; s <= 6; s += .5) assert.ok(ground.flightAt(under, s) + TERRAIN.roundHeight < deck.h - .15, `under the bridge at ${s}`);
 assert.equal(ground.flightReaches(-19, 22.1, -14, 22.1, undefined, ground.drawnHeightAt(-14, 22.1)), true, 'reaches a body wading under it');
 assert.equal(ground.flightReaches(-19, 22.1, -14, 22.1), false, 'not one standing on it');
});

test('decks are ground to stand on but are not drawn', () => {
 const map = { id: 'deck-test', buildings: [], terrain: { bounds: [-10, -10, 10, 10], base: 0,
  carves: [{ line: [[-10, 0], [10, 0]], half: 2, floor: -2, grade: 1, reach: 4 }],
  decks: [{ poly: [[-1, -4], [1, -4], [1, 4], [-1, 4]], h: .4 }] } };
 const ground = groundOf(map);
 assert.equal(ground.heightAt(0, 0), .4);
 assert.equal(ground.drawnHeightAt(0, 0), -2);
 assert.equal(ground.heightAt(5, 0), -2);
});

// A deck's sides are left out: you may step off a bridge into the stream
// (and wade under it), so its edge is a drop by design.
const nearDeck = (ground, x, z) => ground.decks.some(d => x > d.x0 - 1.1 && x < d.x1 + 1.1 && z > d.z0 - 1.1 && z < d.z1 + 1.1 &&
 d.poly.some((a, i) => { const b = d.poly[(i + 1) % d.poly.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)); return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z) < 1.1; }));

test('steep edges are walls; nowhere a body can stand is steeper than 1:1', () => {
 for (const map of terrainMaps) {
  const ground = groundFor(map), walls = mapColliders(map).filter(c => c.terrainEdge);
  assert.equal(walls.length, ground.edges.length);
  for (const w of walls) assert.ok(w.playerOnly && w.localD >= .6 && w.localW > .7);
  const r = RULES.radius, out = { x: 0, z: 0 }, bad = [];
  for (let x = -map.width / 2; x <= map.width / 2; x += .25) for (let z = -map.depth / 2; z <= map.depth / 2; z += .25) {
   if (!isPlayable(map, x, z, r) || nearDeck(ground, x, z)) continue;
   if (walls.some(w => inside({ x, z }, w, r))) continue;
   ground.gradientAt(x, z, out);
   if (Math.hypot(out.x, out.z) > 1) bad.push([x, z, Math.hypot(out.x, out.z).toFixed(2)]);
  }
  assert.deepEqual(bad.slice(0, 5), [], `${map.id}: steep ground a body can reach (${bad.length} points)`);
 }
});

test('open ground: never steeper than an orb climbs, nor steeper than 30% for more than 8 m', () => {
 // Bodies walk any open ground (streams included: they are waded); orbs stop
 // against a rise steeper than TERRAIN.orbRise, so no ground a body can
 // stand on may be steeper (they must agree). And no slope over 30% runs on
 // for more than 8 m (the design had 4 m; the owner, 2026-09-26, wants earth
 // banks between levels, not walls, and a bank down from a town is ~6 m).
 for (const map of terrainMaps) {
  const ground = groundFor(map), walls = mapColliders(map).filter(c => c.terrainEdge), r = RULES.radius, out = { x: 0, z: 0 };
  const open = (x, z) => isPlayable(map, x, z, r) && !nearDeck(ground, x, z) && !walls.some(w => inside({ x, z }, w, r));
  const slope = (x, z) => { ground.gradientAt(x, z, out); return Math.hypot(out.x, out.z); };
  const steep = [], long = [];
  for (let x = -map.width / 2; x <= map.width / 2; x += .25) for (let z = -map.depth / 2; z <= map.depth / 2; z += .25) {
   if (!open(x, z)) continue;
   const g = slope(x, z);
   if (g > TERRAIN.orbRise) steep.push([x, z, g.toFixed(2)]);
   if (g <= TERRAIN.fullGrade) continue;
   // Down the fall line from here while it stays steeper than 30%.
   let px = x, pz = z, run = 0;
   while (run < 10) { ground.gradientAt(px, pz, out); const m = Math.hypot(out.x, out.z); if (m <= TERRAIN.fullGrade || !open(px, pz)) break; px -= out.x / m * .1; pz -= out.z / m * .1; run += .1; }
   if (run > 8) long.push([x, z, run.toFixed(1)]);
  }
  assert.deepEqual(steep.slice(0, 5), [], `${map.id}: open ground steeper than orbs climb (${steep.length} points)`);
  assert.deepEqual(long.slice(0, 5), [], `${map.id}: slopes over 30% for more than 8 m (${long.length} points)`);
 }
});

test('map fingerprints: engine-independent (every number to the micrometre, far from a tie)', () => {
 // Numbers worked out at load (Deadwater's outline: Math.hypot) may differ in
 // the last bit between browsers; rounded to whole micrometres they agree, as
 // long as no number sits near a rounding tie.
 for (const map of Object.values(maps)) {
  const close = [];
  JSON.stringify(map, (key, v) => { if (typeof v === 'number' && Number.isFinite(v)) { const f = Math.abs(v * 1e6) % 1; if (Math.abs(f - .5) < 1e-4) close.push([key, v]); } return v; });
  assert.deepEqual(close, [], map.id);
 }
 assert.equal(hashNumber(1.2345674), 1234567);
 assert.equal(hashNumber('a'), 'a');
 // Every approximated Math function a few ulps off while the maps load (a
 // fresh module graph each time): the same fingerprints.
 const script = `
  const nudge = +process.env.NUDGE;
  if (nudge) {
   const f = new Float64Array(1), i = new BigInt64Array(f.buffer);
   const off = v => { if (!Number.isFinite(v) || v === 0) return v; f[0] = v; i[0] += BigInt(nudge); return f[0]; };
   for (const name of ['acos','acosh','asin','asinh','atan','atanh','atan2','cbrt','cos','cosh','exp','expm1','hypot','log','log1p','log10','log2','pow','sin','sinh','tan','tanh']) { const fn = Math[name]; Math[name] = (...a) => off(fn(...a)); }
  }
  const { maps, mapHash } = await import(process.env.MAPS);
  console.log(JSON.stringify(Object.values(maps).map(m => [m.id, mapHash(m)])));`;
 const run = nudge => execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, NUDGE: String(nudge), MAPS: new URL('../src/maps.js', import.meta.url).href }, encoding: 'utf8' }).trim();
 const plain = run(0);
 assert.equal(plain, JSON.stringify(Object.values(maps).map(m => [m.id, mapHash(m)])));
 for (const nudge of [1, -1, 4, -4]) assert.equal(run(nudge), plain, `nudged ${nudge} ulp`);
});

test('an edge collider covers its edge', () => {
 const e = { ax: 0, az: 0, bx: 4, bz: 3, length: 5, ux: .8, uz: .6, nx: .6, nz: -.8, drop: 2, depth: .6, extend: .35, centred: false };
 const box = edgeCollider(e);
 for (let t = 0; t <= 1; t += .1) {
  assert.ok(inside({ x: 4 * t + .6 * .2, z: 3 * t - .8 * .2 }, box), 'just outside the edge line');
  assert.ok(!inside({ x: 4 * t - .6 * .3, z: 3 * t + .8 * .3 }, box), 'on the level itself');
 }
 assert.equal(TERRAIN.crest, .5);
});
