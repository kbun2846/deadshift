// Hollow Wick's open ground (stage 2, src/maps/hollow-wick-props.js and
// src/world/hollow-props.js): every piece stands on dry, gentle ground, off
// the paths' centre lines, out of the water, doorways and spawn areas; the
// field's stalk patches keep 11 m from every crossing exit and 3 m from the
// footpaths; colliders carry their heights; Deadwater is untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hollowWick, BUILDING_PADS, BASES } from '../src/maps/hollow-wick.js';
import { deadwater } from '../src/maps/deadwater.js';
import { HW_PROPS, HW_CROPS, CROSSING_EXITS, DRAG_TRAIL } from '../src/maps/hollow-wick-props.js';
import { HOLLOW_TYPES } from '../src/world/hollow-props.js';
import { PROP_TYPES, groundFor, mapProps, mapColliders } from '../src/map-kit.js';
import { insidePoly } from '../src/world/heightfield.js';
import { cropSegments } from '../src/crops.js';

const ground = groundFor(hollowWick);
const segDist = (x, z, [ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(ax + dx * t - x, az + dz * t - z); };
const lineDist = (x, z, pts) => Math.min(...pts.slice(1).map((p, i) => segDist(x, z, pts[i], p)));
const slope = (x, z) => { const g = ground.gradientAt(x, z); return Math.hypot(g.x, g.z); };
const props = mapProps(hollowWick).filter(p => HOLLOW_TYPES[p.type]);
const colliders = mapColliders(hollowWick).filter(c => props.some(p => p.id === c.propId));
// A collider's corners and edge midpoints, and its centre.
const outline = c => {
 const a = c.angle || 0, cs = Math.cos(a), sn = Math.sin(a), w = (c.localW ?? c.w) / 2, d = (c.localD ?? c.d) / 2, pts = [[c.x, c.z]];
 for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) pts.push([c.x + u * w * cs + v * d * sn, c.z - u * w * sn + v * d * cs]);
 return pts;
};
// Does a segment cross a (rotated) box?
const crosses = (c, [ax, az], [bx, bz]) => {
 const a = c.angle || 0, cs = Math.cos(a), sn = Math.sin(a), w = (c.localW ?? c.w) / 2, d = (c.localD ?? c.d) / 2;
 const local = (x, z) => [(x - c.x) * cs - (z - c.z) * sn, (x - c.x) * sn + (z - c.z) * cs];
 const [px, pz] = local(ax, az), [qx, qz] = local(bx, bz);
 for (let t = 0; t <= 1; t += .02) { const x = px + (qx - px) * t, z = pz + (qz - pz) * t; if (Math.abs(x) <= w && Math.abs(z) <= d) return true; }
 return false;
};
// Pieces meant to meet the water: the body pile lies partly in it.
const IN_WATER = new Set(['bodyPile']);

test('every piece is a known type with a unique id, inside the fence', () => {
 const ids = new Set();
 for (const p of HW_PROPS) {
  assert.ok(PROP_TYPES[p.type], p.type); assert.ok(!ids.has(p.id), p.id); ids.add(p.id);
  assert.ok(insidePoly(p.x, p.z, hollowWick.playableArea), `${p.id} outside the fence`);
 }
 assert.ok(hollowWick.props.length >= HW_PROPS.length);
 // Nothing breakable here (another builder places those).
 for (const t of Object.values(HOLLOW_TYPES)) assert.equal(t.health, null);
});

test('nothing in the water or on a deck (the body pile only partly)', () => {
 for (const c of colliders) {
  const p = props.find(q => q.id === c.propId);
  const wet = outline(c).filter(([x, z]) => ground.wetAt(x, z) || ground.deckAt(x, z) >= 0);
  if (IN_WATER.has(p.type)) assert.ok(wet.length < 5 && !ground.wetAt(c.x, c.z), `${p.id} too far in`);
  else assert.equal(wet.length, 0, `${p.id} in the water at ${JSON.stringify(wet[0])}`);
 }
 for (const p of props) if (!IN_WATER.has(p.type)) assert.ok(!ground.wetAt(p.x, p.z), p.id);
});

test('nothing on a path: off every centre line, off the drawn roads', () => {
 for (const c of colliders) {
  const p = props.find(q => q.id === c.propId);
  for (const path of hollowWick.terrain.paths) {
   const pts = path.points;
   for (let i = 0; i < pts.length - 1; i++) assert.ok(!crosses(c, pts[i], pts[i + 1]), `${p.id} across ${path.id}'s centre line`);
   // The drawn road (colour) is kept clear to its edge (screens excepted: reeds).
   if (path.colourMix !== 0 && !p.screen) for (const [x, z] of outline(c)) assert.ok(lineDist(x, z, pts) > path.width / 2 - .25, `${p.id} on ${path.id}`);
  }
  for (const f of hollowWick.terrain.fords) for (const [x, z] of outline(c)) assert.ok(lineDist(x, z, f.points) > f.width / 2, `${p.id} in the ford`);
 }
});

test('out of buildings, doorways and spawn areas', () => {
 for (const c of colliders) {
  const p = props.find(q => q.id === c.propId);
  for (const b of BUILDING_PADS) {
   const a = b.angle || 0, cs = Math.cos(a), sn = Math.sin(a);
   for (const [x, z] of outline(c)) {
    const lx = (x - b.x) * cs - (z - b.z) * sn, lz = (x - b.x) * sn + (z - b.z) * cs;
    assert.ok(Math.abs(lx) > b.w / 2 + .3 || Math.abs(lz) > b.d / 2 + .3, `${p.id} in ${b.id}`);
    // Every side's middle may hold a door: keep 2.2 m round each.
    for (const [mx, mz] of [[0, b.d / 2], [0, -b.d / 2], [b.w / 2, 0], [-b.w / 2, 0]]) if (!p.stoop) assert.ok(Math.hypot(lx - mx, lz - mz) > 2.2, `${p.id} in ${b.id}'s doorway`);
   }
  }
  for (const [k, [bx, bz]] of Object.entries(BASES)) assert.ok(Math.hypot(c.x - bx, c.z - bz) > 5, `${p.id} in base ${k}'s spawn area`);
  // Practice targets keep their ground (a moving one its whole run).
  // (A moving target runs east-west, `travel` either side.)
  for (const t of hollowWick.targets) assert.ok(segDist(c.x, c.z, [t.x - (t.travel || 0) - .01, t.z], [t.x + (t.travel || 0) + .01, t.z]) > 1.6 + Math.max(c.w, c.d) / 2, `${p.id} on target ${t.id}`);
 }
});

test('everything stands on gentle ground; long pieces follow it', () => {
 for (const p of props) {
  const t = PROP_TYPES[p.type], big = t.w * t.d > 1.2 && !['railFence', 'splitRail', 'reeds', 'bodyPile', 'dragTrail', 'fieldWall'].includes(p.type);
  if (big) for (const c of colliders.filter(q => q.propId === p.id)) for (const [x, z] of outline(c)) assert.ok(slope(x, z) <= .36, `${p.id} on a ${slope(x, z).toFixed(2)} slope`);
  // Across a flat-bottomed piece the ground varies by less than a hand.
  if (big) { const hs = colliders.filter(q => q.propId === p.id).flatMap(outline).map(([x, z]) => ground.heightAt(x, z)); assert.ok(Math.max(...hs) - Math.min(...hs) < .45, `${p.id} spans ${(Math.max(...hs) - Math.min(...hs)).toFixed(2)} m`); }
  // No fence panel climbs a wall or a cliff.
  if (p.type === 'railFence' || p.type === 'splitRail') for (let s = -.5; s <= .5; s += .1) { const x = p.x + s * p.span * Math.cos(p.angle), z = p.z - s * p.span * Math.sin(p.angle); assert.ok(slope(x, z) < .6 && !ground.wallAt(x, z), `${p.id} over steep ground`); }
 }
 // The drag trail runs over dry ground, from the main path into the woods.
 for (const [x, z] of DRAG_TRAIL) assert.ok(!ground.wetAt(x, z));
 assert.ok(insidePoly(...DRAG_TRAIL.at(-1), hollowWick.terrain.levels.find(l => l.id === 'ridge').poly));
});

test('colliders carry heights: fences 1.1, woodpiles 1.2, the cart 1.4; reeds only screen', () => {
 const height = type => colliders.find(c => props.find(p => p.id === c.propId).type === type).height;
 assert.equal(height('railFence'), 1.1); assert.equal(height('splitRail'), 1.1); assert.equal(height('woodpile'), 1.2); assert.equal(height('oxCart'), 1.4);
 assert.ok(height('haystack') > 1.5 && height('cornCrib') > 1.5);
 const reed = colliders.find(c => props.find(p => p.id === c.propId).type === 'reeds');
 assert.ok(reed.blocksSight && reed.walkOver && reed.playerOnly);
 // Lying pieces have none.
 for (const type of ['skeletonLeaves', 'skeletonSickle', 'dragTrail']) assert.ok(!colliders.some(c => props.find(p => p.id === c.propId).type === type));
});

test('stalk patches: 6 x 8 m, 2 m lanes, 11 m from crossing exits, 3 m from footpaths, on the field', () => {
 const field = hollowWick.terrain.levels.find(l => l.id === 'field').poly;
 assert.equal(hollowWick.crops, HW_CROPS); assert.ok(HW_CROPS.length >= 4);
 for (const f of HW_CROPS) {
  assert.ok(f.w >= 5 && f.w <= 7 && f.d >= 7 && f.d <= 9, f.id);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [f.x + u * f.w / 2, f.z + v * f.d / 2]);
  for (const [x, z] of corners) { assert.ok(insidePoly(x, z, field) && insidePoly(x, z, hollowWick.playableArea), f.id); assert.ok(slope(x, z) < .2, f.id); }
  const boxDist = (x, z) => Math.hypot(Math.max(0, Math.abs(x - f.x) - f.w / 2), Math.max(0, Math.abs(z - f.z) - f.d / 2));
  for (const [x, z] of CROSSING_EXITS) assert.ok(boxDist(x, z) >= 11, `${f.id} ${boxDist(x, z).toFixed(1)} m from the crossing at ${x}, ${z}`);
  for (const path of hollowWick.terrain.paths) for (let i = 0; i < path.points.length - 1; i++) for (let t = 0; t <= 1; t += .05) {
   const [ax, az] = path.points[i], [bx, bz] = path.points[i + 1];
   assert.ok(boxDist(ax + (bx - ax) * t, az + (bz - az) * t) >= path.width / 2 + 3, `${f.id} by ${path.id}`);
  }
  for (const g of HW_CROPS) if (g !== f) assert.ok(Math.abs(g.x - f.x) >= (g.w + f.w) / 2 + 2 || Math.abs(g.z - f.z) >= (g.d + f.d) / 2 + 2, `${f.id} and ${g.id}: a 2 m lane`);
  for (const c of colliders) for (const [x, z] of outline(c)) assert.ok(boxDist(x, z) > .5, `${c.propId} in ${f.id}`);
 }
 // The crossing exits are real: each is by a deck's end or the ford.
 for (const [x, z] of CROSSING_EXITS) assert.ok(!ground.wetAt(x, z) || ground.deckAt(x, z) >= 0);
 // Few sections per patch (each is a draw): rows x cols.
 const segs = cropSegments(hollowWick);
 assert.equal(segs.length, HW_CROPS.reduce((n, f) => n + f.rows * f.cols, 0));
 for (const f of HW_CROPS) assert.ok(segs.filter(s => s.fieldId === f.id).every(s => s.neighbors.length >= 1));
});

test('the field has cover: no open stretch longer than 16 m between pieces', () => {
 // Sample the field's open ground: every point within 8 m of a collider or a stalk patch.
 const field = hollowWick.terrain.levels.find(l => l.id === 'field').poly;
 const cover = [...colliders.filter(c => c.height >= 1 || c.blocksSight).map(c => [c.x, c.z]), ...HW_CROPS.flatMap(f => [[f.x, f.z - 3], [f.x, f.z + 3], [f.x - 2.5, f.z], [f.x + 2.5, f.z]])];
 for (let x = -8; x <= 54; x += 2) for (let z = 30; z <= 48; z += 2) if (insidePoly(x, z, field) && insidePoly(x, z, hollowWick.playableArea)) {
  const near = Math.min(...cover.map(([cx, cz]) => Math.hypot(cx - x, cz - z)));
  assert.ok(near <= 8, `open at ${x}, ${z} (${near.toFixed(1)} m to cover)`);
 }
});

test('Deadwater is untouched: its props keep their types and 1.2 / 0.5 m colliders', () => {
 for (const c of mapColliders(deadwater)) if (c.propId !== undefined) { assert.ok(c.height === 1.2 || c.height === .5, c.propId); assert.ok(!('playerOnly' in c), c.propId); }
 assert.ok(!(deadwater.crops || []).some(f => f.rows || f.cols));
 assert.equal(cropSegments(deadwater).length, (deadwater.crops || []).length * 56);
});
