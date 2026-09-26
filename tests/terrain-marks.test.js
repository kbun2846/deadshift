// Hills: ground marks as pooled quads and draped burns (effects/terrain-marks.js,
// routed by effects/surface-marks.js), instead of a DecalGeometry projected
// onto the RTIN tiles.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { maps, groundFor } from '../src/maps.js';
import { TerrainMarks, TERRAIN_MARK_CAP, drapeBurn, burnSide, QUAD_MAX, LIFT, BURN_MAX } from '../src/effects/terrain-marks.js';
import { SurfaceMarks } from '../src/effects/surface-marks.js';
import { buildTerrainMesh } from '../src/render/terrain-mesh.js';

const map = maps['hill-test'], ground = groundFor(map);
const PRESETS = ['potato', 'performance', 'balanced', 'quality', 'extreme'];
const view = (qualityName = 'balanced', terrainError = .02) => ({ scene: new THREE.Scene(), ground, qualityName, terrainError });
const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });

// Every kept triangle of a draped burn, sampled inside: how far below the
// drawn ground (m) it ever goes, and how far above.
function drapeFit(x, z, size, lift) {
 const n = burnSide(size), position = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), index = new Uint16Array((BURN_MAX - 1) ** 2 * 6);
 const kept = drapeBurn(ground, x, z, size, .7, lift, position, uv, 0, index, 0, n);
 let below = 0, above = 0;
 for (let t = 0; t < kept * 3; t += 3) {
  const p = [0, 1, 2].map(k => index[t + k] * 3);
  for (const [a, b] of [[.2, .2], [.6, .2], [.2, .6], [1 / 3, 1 / 3], [.5, 0], [0, .5], [.5, .5]]) {
   const c = 1 - a - b, px = position[p[0]] * c + position[p[1]] * a + position[p[2]] * b, pz = position[p[0] + 2] * c + position[p[1] + 2] * a + position[p[2] + 2] * b;
   const py = position[p[0] + 1] * c + position[p[1] + 1] * a + position[p[2] + 1] * b, gap = py - ground.drawnHeightAt(px, pz);
   below = Math.max(below, -gap); above = Math.max(above, gap);
  }
 }
 return { kept, full: (n - 1) ** 2 * 2, below, above };
}

test('a burn is draped over the ground: across tile edges, down into the hollow, over the hill', () => {
 // (12, 18) is the corner of four 32 m RTIN tiles; a decal stopped at their edges.
 for (const [x, z, size] of [[12, 18, 8], [4, 20, 8], [14, -10, 8], [8, -2, 6], [-6, 12, 1.4], [0, 16, 3]]) {
  const fit = drapeFit(x, z, size, LIFT);
  assert.equal(fit.kept, fit.full, `no cell left out at ${x}, ${z}`);
  // Never under the drawn grid by more than the lift (so the RTIN error
  // allowance is all the extra it needs), and at most a few centimetres over
  // it where a cell cuts across a bend in the ground.
  assert.ok(fit.below < LIFT, `sinks ${fit.below.toFixed(4)} m at ${x}, ${z}`);
  assert.ok(fit.above < LIFT + .04, `floats ${fit.above.toFixed(4)} m at ${x}, ${z}`);
 }
 assert.equal(burnSide(.8), 9); assert.equal(burnSide(8), 17); assert.equal(burnSide(40), 17);
});

test('a burn against a retaining wall leaves out the drop, so no sheet hangs off the top', () => {
 // The plateau's east wall runs along x = -12 (2.5 m high).
 const fit = drapeFit(-12, -17, 6, LIFT);
 assert.ok(fit.kept < fit.full && fit.kept > fit.full * .7, `${fit.kept} of ${fit.full}`);
 assert.ok(fit.above < .15, `floats ${fit.above.toFixed(3)} m by the wall`);
});

test('small marks are quads on the slope; big ones are burns; both pools recycle per preset', () => {
 for (const quality of PRESETS) {
  const v = view(quality, .035), marks = new TerrainMarks(v, material);
  assert.ok(v.scene.children.includes(marks.quads) && v.scene.children.includes(marks.burns), 'in the scene before the warm-up');
  // On the hill's south face: tilted toward the slope, just above the ground.
  marks.mark(14, -2, .3);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  marks.quads.getMatrixAt(0, m); m.decompose(p, q, s);
  assert.equal(marks.quads.count, 1);
  assert.ok(Math.abs(p.y - (ground.drawnHeightAt(14, -2) + .035 + LIFT)) < 1e-6);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q), g = ground.gradientAt(14, -2);
  assert.ok(g.z < -.1, 'a real slope'); assert.ok(up.angleTo(new THREE.Vector3(-g.x, 1, -g.z).normalize()) < .03, 'tilted to the slope');
  assert.ok(Math.abs(s.x - .3) < 1e-6 && Math.abs(s.z - .3) < 1e-6);
  marks.mark(4, 20, QUAD_MAX + .1);
  assert.equal(marks.burns.geometry.drawRange.count, (BURN_MAX - 1) ** 2 * 6);
  const quads = TERRAIN_MARK_CAP.quads[quality], burns = TERRAIN_MARK_CAP.burns[quality];
  for (let i = 0; i < quads + 5; i++) marks.mark(i % 20, 5, .3);
  for (let i = 0; i < burns + 3; i++) marks.mark(i % 10, 5, 3);
  assert.equal(marks.quads.count, quads); assert.equal(marks.burns.geometry.drawRange.count, burns * (BURN_MAX - 1) ** 2 * 6);
  marks.clear(); assert.equal(marks.quads.count, 0); assert.equal(marks.burns.geometry.drawRange.count, 0);
 }
 // Extreme is Quality plus, never minus.
 for (const kind of ['quads', 'burns']) assert.ok(TERRAIN_MARK_CAP[kind].extreme >= TERRAIN_MARK_CAP[kind].quality);
});

// A SurfaceMarks on Test Hill without its canvas texture (node has no DOM).
function hillMarks(extra = []) {
 const v = view(); v.map = map; v.static = new THREE.Group(); v.props = new Map(); v.targets = new Map(); v.roofs = [];
 v.terrainMesh = buildTerrainMesh({ sunOffset: new THREE.Vector3(-30, 50, -20), groundMaterials: new Set() }, ground, map, .02);
 v.scene.add(v.static, v.terrainMesh); for (const o of extra) v.static.add(o);
 const marks = Object.create(SurfaceMarks.prototype);
 Object.assign(marks, { view: v, jobs: [], currentJob: null, receiverCache: null, batches: new Map(), count: 0, material, ray: new THREE.Raycaster() });
 marks.ray.layers.enable(1); marks.terrain = new TerrainMarks(v, material);
 v.scene.updateMatrixWorld(true);
 return marks;
}

test('SurfaceMarks sends ground hits on a terrain map to the pools, and keeps decals for what stands on it', () => {
 const deck = new THREE.Mesh(new THREE.BoxGeometry(2, .1, 2)); deck.position.set(-6, ground.drawnHeightAt(-6, 12) + .4, 12);
 const marks = hillMarks([deck]), v = marks.view;
 assert.ok(!marks.surfaces().includes(v.terrainMesh), 'the RTIN tiles are never raycast for a mark');
 // A round into the hill's face: a quad.
 marks.bullet({ x: 14, z: -2, vx: 0, vz: -1, ground: true });
 assert.equal(marks.terrain.quads.count, 1); assert.equal(marks.batches.size, 0);
 // A round flying level into rising ground (the foot of the plateau's east
 // wall; the wall's own boxes are not in this stand-in): a quad where it meets it.
 marks.bullet({ x: -11.2, z: -17, vx: -1, vz: 0 });
 assert.equal(marks.terrain.quads.count, 2);
 // A grenade in the hollow: one draped burn, no decal.
 for (const _ of marks.explosion({ x: 4, z: 20, radius: 4 })) void _;
 assert.equal(marks.terrain.burns.geometry.drawRange.count > 0, true); assert.equal(marks.batches.size, 0);
 // Something standing over the ground (a deck, a floor) still takes a decal.
 const hit = marks.hit(new THREE.Vector3(-6, ground.drawnHeightAt(-6, 12) + 1, 12), new THREE.Vector3(0, -1, 0), 2);
 assert.equal(hit.object, deck);
 marks.stamp(hit, .3); assert.equal(marks.batches.size, 1);
 // The walk along a level ray meets the rising ground within a few centimetres.
 const along = marks.groundAlong(new THREE.Vector3(14, ground.drawnHeightAt(14, 0) + .72, 0), new THREE.Vector3(0, 0, -1), 6);
 assert.ok(along && Math.abs(along.point.y - ground.drawnHeightAt(along.point.x, along.point.z)) < .02);
 marks.clear(); assert.equal(marks.terrain.quads.count, 0);
});

test('a ground mark costs a small fraction of a DecalGeometry over the RTIN tiles', () => {
 const marks = hillMarks(), tiles = marks.view.terrainMesh.children, spots = [[12, 18], [4, 20], [14, -10], [8, -2], [-6, 12], [0, 16]];
 const tileAt = (x, z) => { const ray = new THREE.Raycaster(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0)); return ray.intersectObjects(tiles)[0]; };
 const time = (label, runs, fn) => { for (let i = 0; i < 3; i++) fn(i); const start = performance.now(); for (let i = 0; i < runs; i++) fn(i); return (performance.now() - start) / runs; };
 // Before: a decal on the tile under the mark (what stamp did), and the raycast that found it.
 const decal = size => time('decal', 30, i => { const [x, z] = spots[i % spots.length], h = tileAt(x, z); new DecalGeometry(h.object, h.point, new THREE.Euler(-Math.PI / 2, 0, 0), new THREE.Vector3(size, size, Math.max(.12, size * .18))).dispose(); });
 const beforeBullet = decal(.3), beforeBurn = decal(8);
 const bullet = time('quad', 300, i => { const [x, z] = spots[i % spots.length]; marks.stamp(marks.hit(new THREE.Vector3(x, ground.heightAt(x, z) + 1, z), new THREE.Vector3(0, -1, 0), 2), .3); });
 const burn = time('burn', 100, i => { const [x, z] = spots[i % spots.length]; marks.stamp(marks.hit(new THREE.Vector3(x, ground.heightAt(x, z) + .72, z), new THREE.Vector3(0, -1, 0), 1.5), 8); });
 console.log(`# per mark (node): bullet ${beforeBullet.toFixed(3)} -> ${bullet.toFixed(3)} ms, 8 m burn ${beforeBurn.toFixed(3)} -> ${burn.toFixed(3)} ms`);
 assert.ok(bullet < beforeBullet / 3 && burn < beforeBurn / 3, 'much cheaper than the decal');
});
