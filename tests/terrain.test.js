// The hills system's ground (world/heightfield.js, world/terrain-bake.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { maps, groundFor, mapColliders, mapHash, hashNumber } from '../src/maps.js';
import { isPlayable } from '../src/playable-area.js';
import { FLAT, Ground, CELL, ROUND_GRACE, decodeHeights, edgeCollider } from '../src/world/heightfield.js';
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
 assert.equal(FLAT.roundStop(0, 0, 1, 0, 1, 0, 55), Infinity);
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

test('a round flies on as far as its shooter can see, and no further', () => {
 const map = maps['hill-test'], ground = groundFor(map), random = seeded(33);
 let stopped = 0;
 for (let k = 0; k < 600; k++) {
  const ox = -30 + random() * 60, oz = -26 + random() * 52, a = random() * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
  const x = ox + dx * .9, z = oz + dz * .9, range = 40, stop = ground.roundStop(ox, oz, x, z, dx, dz, range);
  if (stop < range) stopped++;
  // A body standing on the path that its shooter can see is never past the
  // round's end (it would fly through it into the ground first).
  for (let s = 1; s < range; s += .75) {
   if (ground.sightClear(ox, oz, x + dx * s, z + dz * s)) assert.ok(s <= stop + .75, `seen at ${s}, round ends at ${stop}`);
  }
 }
 assert.ok(stopped > 20, 'the ground ends some rounds');
 // Straight into the hill from its foot: the round ends on the slope; from
 // the top down the other side: it flies on.
 assert.ok(ground.roundStop(-8, -10, -7, -10, 1, 0, 55) < 40);
 assert.equal(ground.roundStop(14, -10, 15, -10, 1, 0, 20), Infinity);
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

test('steep edges are walls; nowhere a body can stand is steeper than 1:1', () => {
 for (const map of terrainMaps) {
  const ground = groundFor(map), walls = mapColliders(map).filter(c => c.terrainEdge);
  assert.equal(walls.length, ground.edges.length);
  for (const w of walls) assert.ok(w.playerOnly && w.localD >= .6 && w.localW > 1);
  const r = RULES.radius, out = { x: 0, z: 0 }, bad = [];
  for (let x = -map.width / 2; x <= map.width / 2; x += .25) for (let z = -map.depth / 2; z <= map.depth / 2; z += .25) {
   if (!isPlayable(map, x, z, r)) continue;
   if (walls.some(w => inside({ x, z }, w, r))) continue;
   ground.gradientAt(x, z, out);
   if (Math.hypot(out.x, out.z) > 1) bad.push([x, z, Math.hypot(out.x, out.z).toFixed(2)]);
  }
  assert.deepEqual(bad.slice(0, 5), [], `${map.id}: steep ground a body can reach (${bad.length} points)`);
 }
});

test('open ground: never steeper than an orb climbs, nor steeper than 30% for more than 4 m', () => {
 // Bodies walk any open ground; orbs stop against a rise steeper than
 // TERRAIN.orbRise, so no ground a body can stand on may be steeper (they
 // must agree). And the design: no slope over 30% runs on for more than 4 m.
 for (const map of terrainMaps) {
  const ground = groundFor(map), walls = mapColliders(map).filter(c => c.terrainEdge), r = RULES.radius, out = { x: 0, z: 0 };
  const open = (x, z) => isPlayable(map, x, z, r) && !walls.some(w => inside({ x, z }, w, r));
  const slope = (x, z) => { ground.gradientAt(x, z, out); return Math.hypot(out.x, out.z); };
  const steep = [], long = [];
  for (let x = -map.width / 2; x <= map.width / 2; x += .25) for (let z = -map.depth / 2; z <= map.depth / 2; z += .25) {
   if (!open(x, z)) continue;
   const g = slope(x, z);
   if (g > TERRAIN.orbRise) steep.push([x, z, g.toFixed(2)]);
   if (g <= TERRAIN.fullGrade) continue;
   // Down the fall line from here while it stays steeper than 30%.
   let px = x, pz = z, run = 0;
   while (run < 6) { ground.gradientAt(px, pz, out); const m = Math.hypot(out.x, out.z); if (m <= TERRAIN.fullGrade || !open(px, pz)) break; px -= out.x / m * .1; pz -= out.z / m * .1; run += .1; }
   if (run > 4) long.push([x, z, run.toFixed(1)]);
  }
  assert.deepEqual(steep.slice(0, 5), [], `${map.id}: open ground steeper than orbs climb (${steep.length} points)`);
  assert.deepEqual(long.slice(0, 5), [], `${map.id}: slopes over 30% for more than 4 m (${long.length} points)`);
 }
});

test('a round goes no further than a metre past the last point its shooter can see', () => {
 // (The other half of the test above: rounds carrying on through the ground.)
 const map = maps['hill-test'], ground = groundFor(map), random = seeded(34);
 // (Shooters only where a body can stand: not inside a retaining wall.)
 const walls = mapColliders(map).filter(c => c.terrainEdge);
 let stopped = 0;
 for (let k = 0; k < 300; k++) {
  const ox = -30 + random() * 60, oz = -26 + random() * 52, a = random() * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
  if (walls.some(w => inside({ x: ox, z: oz }, w, RULES.radius))) continue;
  const x = ox + dx * .9, z = oz + dz * .9, range = 40, stop = ground.roundStop(ox, oz, x, z, dx, dz, range);
  if (!(stop < range)) continue;
  stopped++;
  let last = 0;
  for (let s = .25; s <= range; s += .25) if (ground.sightClear(ox, oz, x + dx * s, z + dz * s)) last = s;
  assert.ok(stop <= last + ROUND_GRACE + .75, `round ends at ${stop.toFixed(2)}, last seen ${last} (from ${ox.toFixed(2)}, ${oz.toFixed(2)})`);
 }
 assert.ok(stopped > 10);
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
