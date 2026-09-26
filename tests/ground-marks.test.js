// Hollow Wick's ground marks (s5-ground: world/ground-marks.js places them,
// render/ground-marks-view.js drapes them, render/ground-marks-atlas.js
// paints them): every mark is where its story says, keeps the placement
// rules, lies on the drawn ground, and costs two draws.
//
// The rules checked here are the placement rules the other stage 5 builders
// share (tools/place-detail.mjs problems(), tests/hollow-breakables-rules.js
// placementProblems) that apply to something flat you walk over: inside the
// fence, out of the stream, off decks and retaining walls, never inside a
// building, off the drag trail and the set pieces. The rest of those rules
// (door aprons, path lanes, spawn points, base middles, a target's run, the
// graveyard's ranks) are there so a SOLID piece never blocks a way, a spawn
// or a shot; a ground mark has no collider (checked below: the map's
// colliders are the same with and without the marks), so ruts lie on the
// roads and straw at the barn doors on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { hollowWick } from '../src/maps/hollow-wick.js';
import { hillTest } from '../src/maps/hill-test.js';
import { groundFor, mapColliders, mapProps, buildingOpenings, buildingContains } from '../src/map-kit.js';
import { insidePoly, FLAT } from '../src/world/heightfield.js';
import { isPlayable } from '../src/playable-area.js';
import { inside } from '../src/simulation.js';
import { DRAG_TRAIL, KEEP_CLEAR } from '../src/maps/hollow-wick-tree-rules.js';
import { placeGroundMarks, markPoints, MARK_TIER, LAYER, GAUGE, BIT_COLOURS } from '../src/world/ground-marks.js';
import { drapeMarks, buildGroundMarks, bitGeometry, MARK_LIFT } from '../src/render/ground-marks-view.js';
import { ATLAS_CELLS } from '../src/render/ground-marks-atlas.js';
import { LITTER_BROWNS } from '../src/world/leaf-carpet.js';

const map = hollowWick, ground = groundFor(map);
const placed = placeGroundMarks(ground, map);
const props = mapProps(map);
const segDist = (x, z, [ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)) : 0; return Math.hypot(ax + dx * t - x, az + dz * t - z); };
const lineDist = (x, z, pts) => Math.min(...pts.slice(1).map((p, i) => segDist(x, z, pts[i], p)));
const polyDist = (x, z, poly) => Math.min(...poly.map((p, i) => segDist(x, z, p, poly[(i + 1) % poly.length])));
// Inside a room: past its walls' inner faces (the walls are .38 m thick).
const inRoom = (x, z) => map.buildings.find(b => { const c = Math.cos(b.angle || 0), s = Math.sin(b.angle || 0), dx = x - b.x, dz = z - b.z; return Math.abs(dx * c - dz * s) < b.w / 2 - .19 && Math.abs(dx * s + dz * c) < b.d / 2 - .19; });

// The shared rules, worked out here on their own (not with the module's
// helpers), for one point of a mark. `owner`: the set piece it belongs to.
function problems(x, z, owner) {
 const out = [];
 if (!isPlayable(map, x, z, 0)) out.push('outside the fence');
 if (ground.waterAt(x, z) > ground.drawnHeightAt(x, z) - .03) out.push('in the water');
 for (const d of map.terrain.decks) if (insidePoly(x, z, d.poly) || polyDist(x, z, d.poly) < .3) out.push(`on deck ${d.id}`);
 if (ground.wallAt(x, z)) out.push('on a retaining wall');
 const b = inRoom(x, z); if (b) out.push(`inside ${b.id}`);
 if (lineDist(x, z, DRAG_TRAIL) < .9) out.push('on the drag trail');
 const [hx, hz] = KEEP_CLEAR[0]; if (Math.hypot(x - hx, z - hz) < 4.2) out.push('under the hanging tree');
 for (const p of props.filter(p => ['skeletonLeaves', 'skeletonSickle', 'graveSkeleton', 'rockingChair'].includes(p.type))) if (p.id !== owner && Math.hypot(x - p.x, z - p.z) < 1) out.push(`on ${p.id}`);
 return out;
}

test('ground marks: the map has them, deterministically, and they add no collider', () => {
 assert.ok(placed.decals.length > 250, `decals ${placed.decals.length}`);
 assert.ok(placed.strips.length >= 6, `strips ${placed.strips.length}`);
 assert.ok(placed.bits.length > 700, `bits ${placed.bits.length}`);
 assert.equal(JSON.stringify(placeGroundMarks(ground, map)), JSON.stringify(placed));
 const without = mapColliders({ ...map, groundMarks: undefined });
 assert.equal(mapColliders(map).length, without.length);
 // No terrain, no data: nothing.
 assert.equal(placeGroundMarks(FLAT, map).decals.length, 0);
 assert.equal(placeGroundMarks(groundFor(hillTest), hillTest).decals.length, 0);
});

test('ground marks: every flat mark keeps the placement rules', () => {
 const bad = [];
 for (const m of placed.decals) for (const [x, z] of markPoints(m)) { const p = problems(x, z, m.owner); if (p.length) { bad.push(`${m.kind} ${m.x.toFixed(1)},${m.z.toFixed(1)}: ${p.join(', ')}`); break; } }
 assert.deepEqual(bad, []);
 // And lies on ground a body could walk (no mark on a wall's drop or a bank steeper than 0.62).
 const slope = { x: 0, z: 0 };
 for (const m of placed.decals) { ground.gradientAt(m.x, m.z, slope); assert.ok(Math.hypot(slope.x, slope.z) <= .62, `${m.kind} on a slope at ${m.x},${m.z}`); }
});

test('ground marks: the ruts and cart tracks keep the rules along their whole length and never cross a deck', () => {
 const bad = [];
 for (const s of placed.strips) for (const r of s.rows) for (const k of [-1, 0, 1]) {
  const x = r.x + r.nx * k * s.width / 2, z = r.z + r.nz * k * s.width / 2, p = problems(x, z);
  if (p.length) bad.push(`${s.road} ${x.toFixed(1)},${z.toFixed(1)}: ${p.join(', ')}`);
 }
 assert.deepEqual(bad.slice(0, 5), []);
 // Each road has its ruts (a strip per wheel, a cart's gauge apart), faded in and out at every end.
 for (const id of ['town-road', 'bridge-road', 'meeting-road']) {
  const ruts = placed.strips.filter(s => s.road === id && s.kind === 'ruts');
  assert.ok(ruts.length >= 2, id);
  const [a, b] = ruts, r = a.rows[Math.floor(a.rows.length / 2)], k = b.rows[Math.floor(b.rows.length / 2)];
  assert.ok(Math.abs(Math.hypot(r.x - k.x, r.z - k.z) - GAUGE) < .02, `${id}: the wheels are a gauge apart`);
 }
 for (const s of placed.strips) { assert.ok(s.rows[0].a < .05 && s.rows.at(-1).a < .05, `${s.road} ends fade`); assert.ok(Math.max(...s.rows.map(r => r.a)) > .3, `${s.road} shows`); }
 // Broken over the ledges: no rut row lies on a ledge's rock at full strength.
 const ledges = placed.decals.filter(d => d.kind === 'ledge');
 assert.ok(ledges.length >= 3);
 for (const l of ledges) for (const s of placed.strips) for (const r of s.rows) {
  const dx = r.x - l.x, dz = r.z - l.z, a = dx * Math.cos(l.yaw) - dz * Math.sin(l.yaw), b = dx * Math.sin(l.yaw) + dz * Math.cos(l.yaw);
  if (Math.abs(a) < l.w / 2 && Math.abs(b) < l.l / 2) assert.ok(r.a < .01, `a rut over the ledge at ${l.x},${l.z}`);
 }
 // The bridge road stops short of the bridge at both ends.
 const bridge = map.terrain.decks.find(d => d.id === 'bridge');
 const near = placed.strips.filter(s => s.road === 'bridge-road').flatMap(s => s.rows).map(r => polyDist(r.x, r.z, bridge.poly));
 assert.ok(Math.min(...near) >= .3);
 assert.ok(Math.min(...near) < 2.5, 'the ruts run on to near the bridge');
});

test('ground marks: puddles lie in the ruts, by the well and by each trough, never in the stream', () => {
 const puddles = placed.decals.filter(d => d.kind === 'puddle');
 const ruts = placed.strips.filter(s => s.kind === 'ruts').flatMap(s => s.rows);
 const inRut = p => ruts.some(r => Math.hypot(r.x - p.x, r.z - p.z) < .75);
 assert.ok(puddles.filter(inRut).length >= 5, `puddles in ruts: ${puddles.filter(inRut).length}`);
 const well = props.find(p => p.type === 'wellSweep');
 assert.ok(puddles.some(p => Math.hypot(p.x - well.x, p.z - well.z) < 2.6), 'a puddle by the well');
 for (const t of props.filter(p => p.type === 'waterTrough')) assert.ok(puddles.some(p => Math.hypot(p.x - t.x, p.z - t.z) < 2.2), `a puddle by ${t.id}`);
 for (const p of puddles) for (const [x, z] of markPoints(p)) assert.ok(ground.waterAt(x, z) < ground.drawnHeightAt(x, z) - .03, `puddle in the stream at ${x},${z}`);
});

test('ground marks: the bare feet walk from the body pile into the stream and never come out', () => {
 const feet = placed.decals.filter(d => d.kind === 'barefoot');
 const pile = props.find(p => p.type === 'bodyPile');
 assert.ok(feet.length >= 6, `${feet.length} prints`);
 assert.ok(Math.hypot(feet[0].x - pile.x, feet[0].z - pile.z) < 3.5, 'they start at the pile');
 // Left, right, left...: each on the other side of the way.
 for (let i = 1; i < feet.length; i++) assert.notEqual(feet[i].mirror, feet[i - 1].mirror);
 // Downhill all the way, and the last is at the water's edge.
 for (let i = 1; i < feet.length; i++) assert.ok(ground.drawnHeightAt(feet[i].x, feet[i].z) <= ground.drawnHeightAt(feet[i - 1].x, feet[i - 1].z) + .02);
 const last = feet.at(-1);
 let edge = Infinity; for (let a = 0; a < 16; a++) for (let d = .1; d < 2; d += .1) { const x = last.x + Math.cos(a / 16 * Math.PI * 2) * d, z = last.z + Math.sin(a / 16 * Math.PI * 2) * d; if (ground.waterAt(x, z) > ground.drawnHeightAt(x, z)) { edge = Math.min(edge, d); break; } }
 assert.ok(edge < 1.1, `the last print is ${edge} m from the water`);
 // Nothing on the far bank: every bare print (every mark near the pile) is on its side of the stream.
 const stream = map.terrain.water[0].points.map(p => [p[0], p[1]]);
 const southOfStream = (x, z) => { for (let i = 1; i < stream.length; i++) if (x >= stream[i - 1][0] && x <= stream[i][0]) { const t = (x - stream[i - 1][0]) / (stream[i][0] - stream[i - 1][0]); return z > stream[i - 1][1] + (stream[i][1] - stream[i - 1][1]) * t; } return false; };
 for (const f of feet) assert.ok(!southOfStream(f.x, f.z));
 assert.ok(!placed.decals.some(d => d.kind === 'barefoot' && southOfStream(d.x, d.z)));
});

test('ground marks: prints and tracks by the barn and the smithy, straw at the barn doors and round the hay', () => {
 const barn = map.buildings.find(b => b.interiorStyle === 'barn'), smithy = map.buildings.find(b => b.interiorStyle === 'smithy'), forge = map.buildings.find(b => b.id === 'forge');
 const near = (kind, x, z, r) => placed.decals.filter(d => d.kind === kind && Math.hypot(d.x - x, d.z - z) < r);
 assert.ok(near('hoof', barn.x, barn.z, 9).length >= 10, 'hoofprints by the barn');
 assert.ok(near('hoof', forge.x, forge.z, 7).length + near('hoof', smithy.x, smithy.z, 7).length >= 10, 'hoofprints by the smithy');
 assert.ok(placed.strips.some(s => s.kind === 'cartTrack' && Math.hypot(s.rows.at(-1).x - barn.x, s.rows.at(-1).z - barn.z) < 6), 'a cart track into the barn');
 assert.ok(placed.strips.some(s => s.kind === 'cartTrack' && Math.hypot(s.rows.at(-1).x - forge.x, s.rows.at(-1).z - forge.z) < 5), 'a cart track to the forge');
 for (const door of buildingOpenings(barn).filter(o => o.type === 'door')) {
  const mx = (door.a.x + door.b.x) / 2, mz = (door.a.z + door.b.z) / 2;
  assert.ok(near('straw', mx, mz, 2.2).length >= 1, `straw at the barn's ${door.side} door`);
 }
 for (const h of props.filter(p => p.type === 'haystack')) assert.ok(near('straw', h.x, h.z, 3.4).length >= 3, 'straw round the hay');
 assert.ok(placed.bits.filter(b => b.kind === 'straw').length >= 60);
});

test('ground marks: chips round every woodpile and block, ash by the forge, grain by the mill, soil at the new graves', () => {
 const near = (kind, x, z, r) => placed.decals.some(d => d.kind === kind && Math.hypot(d.x - x, d.z - z) < r);
 for (const p of props.filter(p => ['woodpile', 'choppingBlock', 'cordwood'].includes(p.type))) {
  assert.ok(near('chips', p.x, p.z, 1.6), `chips at ${p.id}`);
  assert.ok(placed.bits.some(b => (b.kind === 'chip' || b.kind === 'kindling') && Math.hypot(b.x - p.x, b.z - p.z) < 2.2), `chips lying round ${p.id}`);
 }
 const hearth = props.find(p => p.type === 'forgeHearth');
 assert.ok(placed.decals.filter(d => d.kind === 'ash' && Math.hypot(d.x - hearth.x, d.z - hearth.z) < 5.5).length >= 2, 'ash by the forge');
 assert.ok(placed.bits.filter(b => b.kind === 'cinder').length >= 20);
 const mill = map.buildings.find(b => b.interiorStyle === 'gristmill');
 assert.ok(placed.decals.some(d => d.kind === 'grain' && Math.hypot(d.x - mill.x, d.z - mill.z) < 7), 'grain by the mill');
 for (const g of props.filter(p => p.type === 'openGrave' || p.type === 'freshMound')) assert.ok(near('soil', g.x, g.z, 2.5), `soil at ${g.id}`);
});

test('ground marks: leaves drift on the fieldstone walls\' north sides and into building corners, litter browns only', () => {
 for (const w of props.filter(p => /^fieldWall\d?$/.test(p.type))) {
  const drifts = placed.decals.filter(d => d.kind === 'leaves' && d.owner === w.id);
  assert.ok(drifts.length >= 1, `leaves at ${w.id}`);
  // On the side facing north (a wall running north-south: its west side),
  // unless that side is a retaining wall's lip (then the other side).
  const [ax, az] = [Math.sin(w.angle || 0), Math.cos(w.angle || 0)];
  let north = Math.abs(az) >= .5 ? -Math.sign(az) : -Math.sign(ax);
  const probe = [w.x + ax * north * (w.d / 2 + .6), w.z + az * north * (w.d / 2 + .6)];
  if (ground.wallAt(...probe)) north = -north;
  for (const d of drifts) {
   const off = [d.x - w.x, d.z - w.z], facing = off[0] * ax + off[1] * az;
   assert.ok(Math.sign(facing) === north, `${w.id}'s drift on its north (or west) side`);
  }
 }
 const corners = placed.decals.filter(d => d.cell === 'leaves-corner');
 assert.ok(corners.length >= 10, `${corners.length} corner drifts`);
 for (const b of placed.bits.filter(b => b.kind === 'leaf')) assert.ok(LITTER_BROWNS.includes(b.color), b.color);
 assert.deepEqual(BIT_COLOURS.leaf, LITTER_BROWNS);
});

test('ground marks: the raised bits keep the rules and never lie inside anything solid', () => {
 const solids = mapColliders(map).filter(c => !c.walkOver && !c.terrainEdge && !c.playerOnly && c.buildingId === undefined);
 const bad = [];
 for (const b of placed.bits) {
  const p = problems(b.x, b.z, b.owner);
  if (solids.some(c => inside(b, c, .02))) p.push('inside something solid');
  if (p.length) bad.push(`${b.kind} ${b.x.toFixed(2)},${b.z.toFixed(2)}: ${p.join(', ')}`);
 }
 assert.deepEqual(bad.slice(0, 5), []);
 for (const b of placed.bits) assert.ok(Math.max(b.sx, b.sz) < .45 && b.sy < .08, `${b.kind} is small`);
 // Sorted by tier (a preset draws a prefix); none on Potato.
 for (let i = 1; i < placed.bits.length; i++) assert.ok(placed.bits[i].tier >= placed.bits[i - 1].tier);
 assert.ok(placed.bits.every(b => b.tier >= 1));
});

test('ground marks: draped on the drawn ground, lifted just clear of it, never over the water', () => {
 const lift = .035 + MARK_LIFT, built = drapeMarks(ground, placed, lift);
 const n = built.position.length / 3;
 assert.ok(n > 1000 && n < 65536, `${n} vertices`);
 for (let k = 0; k < n; k++) {
  const x = built.position[k * 3], y = built.position[k * 3 + 1], z = built.position[k * 3 + 2], g = ground.drawnHeightAt(x, z);
  assert.ok(y >= g + lift - 1e-6 && y <= g + lift + .1, `vertex ${k} at ${y - g} over the ground`);
  assert.ok(built.normal[k * 3 + 1] > .5, 'normals face up');
 }
 for (const i of built.index) assert.ok(i >= 0 && i < n);
 // Every triangle's middle is over the drawn ground too (raised where a flat triangle would cut under a crest).
 for (let t = 0; t < built.index.length; t += 3) {
  const [a, b, c] = [built.index[t], built.index[t + 1], built.index[t + 2]];
  const x = (built.position[a * 3] + built.position[b * 3] + built.position[c * 3]) / 3, z = (built.position[a * 3 + 2] + built.position[b * 3 + 2] + built.position[c * 3 + 2]) / 3, y = (built.position[a * 3 + 1] + built.position[b * 3 + 1] + built.position[c * 3 + 1]) / 3;
  assert.ok(y >= ground.drawnHeightAt(x, z) + lift - .002, `triangle ${t / 3} cuts the ground`);
  assert.ok(ground.waterAt(x, z) < y - .02, `triangle ${t / 3} over the water`);
 }
 // Every picture it names is in the atlas.
 for (const m of [...placed.decals, ...placed.strips]) assert.ok(ATLAS_CELLS[m.cell], m.cell);
 for (const c of Object.values(ATLAS_CELLS)) assert.ok(c.u0 >= 0 && c.v0 >= 0 && c.u0 + c.du <= 1 && c.v0 + c.dv <= 1);
});

test('ground marks: two draws, no shadows cast, fewer on the phone presets', () => {
 const scene = new THREE.Scene(), details = new THREE.Group(); scene.add(details);
 const view = { scene, ground, terrainError: .02, initialQuality: 'balanced', performanceDetails: details };
 const marks = buildGroundMarks(view, map);
 const meshes = []; scene.traverse(o => { if (o.isMesh) meshes.push(o); });
 assert.equal(meshes.length, 2);
 for (const m of meshes) { assert.equal(m.castShadow, false); assert.equal(m.receiveShadow, true); }
 assert.equal(marks.bits.parent, details, 'the bits are ground cover (hidden on Potato, out of the AO pass)');
 assert.equal(marks.decals.material.transparent, true); assert.equal(marks.decals.material.depthWrite, false);
 const count = {};
 for (const name of Object.keys(MARK_TIER)) { marks.setQuality(name); count[name] = { tris: marks.decals.geometry.drawRange.count, bits: marks.bits.count }; }
 assert.ok(count.potato.tris > 0 && count.potato.tris < count.performance.tris && count.performance.tris <= count.balanced.tris && count.balanced.tris <= count.quality.tris);
 assert.deepEqual(count.quality, count.extreme);
 assert.equal(count.potato.bits, 0);
 assert.ok(count.performance.bits < count.balanced.bits && count.balanced.bits < count.quality.bits);
 // A preset change is followed the next time the mesh is drawn (no renderer hook).
 view.qualityName = 'potato'; marks.decals.onBeforeRender(); assert.equal(marks.quality, 'potato'); assert.equal(marks.bits.count, 0);
 view.qualityName = 'quality'; marks.bits.onBeforeRender(); assert.equal(marks.decals.geometry.drawRange.count, count.quality.tris);
 // The draw order: ground marks under ruts under puddles under prints under spills under leaves.
 assert.deepEqual(Object.values(LAYER), [0, 1, 2, 3, 4, 5]);
 // The raised bits' shape: six facets, all facing up.
 const shape = bitGeometry(), normals = shape.attributes.normal;
 assert.equal(shape.attributes.position.count, 18);
 for (let i = 0; i < normals.count; i++) assert.ok(normals.getY(i) > .3);
 // No map data (or a flat map): nothing built.
 assert.equal(buildGroundMarks({ scene: new THREE.Scene(), ground }, { ...map, groundMarks: undefined }), null);
 assert.equal(buildGroundMarks({ scene: new THREE.Scene(), ground: FLAT }, map), null);
});
