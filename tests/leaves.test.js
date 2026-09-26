// Hollow Wick's leaves (stage 3, s3-leaves): the woods' carpet, falling leaves
// and leaves kicked up (world/leaf-carpet.js, effects/leaf-fx.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { maps, groundFor } from '../src/maps.js';
import { WOODS } from '../src/maps/hollow-wick.js';
import { insidePoly } from '../src/world/heightfield.js';
import { placeLeafCarpet, litterField, LEAF_CARPET, GROUND_LEAF_COLOURS, LITTER_BROWNS, CANOPY_ONLY, EDGE_OUT, TRACK, carpetPatchGeometry, looseLeafGeometry } from '../src/world/leaf-carpet.js';
import { buildLeaves, LEAF_FX, LEAF_CAPACITY } from '../src/effects/leaf-fx.js';

const wick = maps['hollow-wick'], ground = groundFor(wick);
const PRESETS = ['potato', 'performance', 'balanced', 'quality', 'extreme'];
const patches = placeLeafCarpet(ground, wick);
const edge = (x, z, poly) => Math.min(...poly.map((a, i) => { const b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)); return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z); }));
const nearWoods = (x, z, reach = EDGE_OUT) => WOODS.some(w => insidePoly(x, z, w.poly) || edge(x, z, w.poly) < reach);
const RED = new Set(CANOPY_ONLY);

function view(quality = 'balanced', focus = [-6, -52]) {
 const v = { scene: new THREE.Scene(), map: wick, ground, qualityName: quality, focus: new THREE.Vector3(focus[0], 0, focus[1]), remotePlayers: [], player: { visible: true } };
 v.leafFX = buildLeaves(v, wick);
 return v;
}
const player = (x, z, vx = 0, vz = 0, dodge = 0) => ({ player: { x, z, vx, vz, dodgeRemaining: dodge, dead: false } });
const run = (fx, sim, seconds, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) fx.update(sim, dt); };
// Deep in the North Woods, off the paths (where the carpet lies thickest).
const deep = (() => { const field = litterField(ground, wick); let best = null; for (const p of patches) if (p.wood === 0 && field.at(p.x, p.z) >= .99 && (!best || Math.hypot(p.x + 6, p.z + 52) < Math.hypot(best.x + 6, best.z + 52))) best = p; return best; })();

test('the carpet lies only in and at the edge of the woods, off the paths, in ground colours', () => {
 assert.ok(patches.length > 2500, `${patches.length} patches`);
 for (const p of patches) {
  assert.ok(nearWoods(p.x, p.z), `patch at ${p.x.toFixed(1)},${p.z.toFixed(1)} outside the woods`);
  assert.ok(GROUND_LEAF_COLOURS.includes(p.color), p.color);
  assert.ok(!RED.has(p.color), 'no rust or red on the ground');
  assert.ok(p.y >= ground.heightAt(p.x, p.z) && p.y >= ground.drawnHeightAt(p.x, p.z), 'never under the ground');
 }
 // Worn paths stay readable: nothing on a path's drawn width.
 for (const path of wick.terrain.paths.filter(p => p.colourMix !== 0)) for (const p of patches) {
  for (let i = 1; i < path.points.length; i++) {
   const [ax, az] = path.points[i - 1], [bx, bz] = path.points[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / l2));
   assert.ok(Math.hypot(ax + dx * t - p.x, az + dz * t - p.z) >= path.width / 2, `patch on path ${path.id ?? ''}`);
  }
 }
 // Both woods carpeted, mostly litter browns.
 assert.ok(patches.some(p => p.wood === 0) && patches.some(p => p.wood === 1));
 const browns = patches.filter(p => LITTER_BROWNS.includes(p.color)).length;
 assert.ok(browns / patches.length > .6, `browns ${browns / patches.length}`);
});

test('the carpet is thickest under the canopies, thins out at the woods edges and lies thin on the tracks', () => {
 const field = litterField(ground, wick);
 assert.ok(field.tracks.some(t => t.id === 'woods-track') && field.tracks.some(t => t.id === 'back-trail'));
 let onTrack = 0, trackArea = 0, beside = 0, besideArea = 0;
 for (const p of patches) { if (field.trackAt(p.x, p.z)) onTrack++; }
 for (let x = -66; x < 22; x += .5) for (let z = -67; z < 16; z += .5) {
  if (field.woodsAt(x, z).depth < 1) continue;
  if (field.trackAt(x, z)) trackArea++; else besideArea++;
 }
 beside = patches.length - onTrack;
 assert.ok(onTrack / trackArea < .5 * beside / besideArea, `track ${onTrack / trackArea} beside ${beside / besideArea}`);
 let under = 0, underArea = 0, rim = 0, rimArea = 0;
 for (let x = -66; x < 22; x += .5) for (let z = -67; z < 16; z += .5) {
  const w = field.woodsAt(x, z); if (w.index < 0) continue;
  const n = patches.filter(p => Math.abs(p.x - x) < .25 && Math.abs(p.z - z) < .25).length;
  if (w.depth >= 1 && field.canopyAt(x, z) > .8) { under += n; underArea++; }
  else if (w.depth > 0 && w.depth < .3) { rim += n; rimArea++; }
 }
 assert.ok(underArea > 50 && rimArea > 50);
 assert.ok(under / underArea > 2.5 * (rim / rimArea), `under ${under / underArea} rim ${rim / rimArea}`);
});

test('each preset draws more of the carpet, sparse on Potato, all of it on Extreme', () => {
 let last = 0;
 for (const q of PRESETS) {
  const v = view(q), carpet = v.leafFX.carpet, drawn = carpet.meshes.reduce((n, m) => n + (m.visible ? m.count : 0), 0);
  assert.ok(drawn > last, `${q} ${drawn}`); last = drawn;
  assert.equal(drawn, carpet.meshes.reduce((n, m) => n + Math.round(m.userData.leafCarpet * LEAF_CARPET[q]), 0));
  assert.ok(carpet.meshes.length <= 2, 'one draw per wood');
  if (q === 'potato') assert.ok(drawn < patches.length * .2);
  if (q === 'extreme') assert.equal(drawn, patches.length);
 }
 // Two carpet draws and one for the moving leaves: every mesh the leaves add.
 const v = view('extreme'), added = v.scene.children.filter(o => o.isInstancedMesh);
 assert.equal(added.length, 3);
 assert.ok(added.every(m => !m.castShadow));
 assert.equal(carpetPatchGeometry().attributes.position.count / 3, 16);
 assert.equal(looseLeafGeometry().attributes.position.count / 3, 8);
 // A preset switch (the renderer's qualityName) re-thins the carpet.
 v.qualityName = 'potato'; v.leafFX.update(player(0, 0), 1 / 60);
 assert.equal(v.leafFX.carpet.quality, 'potato');
 assert.ok(v.leafFX.carpet.meshes.every(m => m.count < m.userData.leafCarpet * .2));
});

test('leaves fall from the canopies near the camera on every preset but Potato, within their pools', () => {
 for (const q of PRESETS) {
  const v = view(q), fx = v.leafFX;
  run(fx, player(-6, -52), 12);
  const falling = fx.count('fall');
  if (q === 'potato') { assert.equal(falling, 0); continue; }
  assert.ok(falling > 0 && falling <= LEAF_FX[q].fall, `${q}: ${falling}`);
  assert.ok(fx.mesh.count <= LEAF_CAPACITY && fx.mesh.count === fx.leaves.length);
  // Only near the camera.
  for (const l of fx.leaves) assert.ok(Math.abs(l.x + 6) < 26 && Math.abs(l.z + 52) < 20);
 }
 // Out in the open field, far from any canopy: none.
 const v = view('extreme', [30, 45]); run(v.leafFX, player(30, 45), 6);
 assert.equal(v.leafFX.count('fall'), 0);
 assert.ok(LEAF_FX.potato.fall === 0 && LEAF_FX.extreme.fall > LEAF_FX.performance.fall);
});

test('red and rust fall but are gone before they lie on the ground', () => {
 const v = view('extreme'), fx = v.leafFX;
 let reds = 0, lowest = Infinity;
 for (let t = 0; t < 40; t += 1 / 30) {
  fx.update(player(-6, -52), 1 / 30);
  for (const l of fx.leaves) if (RED.has(l.colour)) {
   reds++;
   const h = l.y - ground.drawnHeightAt(l.x, l.z);
   lowest = Math.min(lowest, h);
   assert.ok(!l.landed);
   // Shrinking out as it nears the ground: nothing of it left there.
   assert.ok(h > .4 || l.fade * l.size < .01, `a red leaf ${h.toFixed(2)} m up at fade ${l.fade}`);
  }
  for (const l of fx.lying()) assert.ok(!RED.has(l.colour), 'red on the ground');
 }
 assert.ok(reds > 0, 'some red falls');
});

test('walking and dodging through litter kick leaves up; none on open ground or paths', () => {
 assert.ok(deep, 'a deep spot');
 // Walking in the woods.
 let v = view('quality', [deep.x, deep.z]), fx = v.leafFX;
 for (let t = 0; t < 1.5; t += 1 / 60) fx.update(player(deep.x, deep.z, 4, 0), 1 / 60);
 const walked = fx.count('kick');
 assert.ok(walked > 0, 'a walk kicks leaves');
 for (const l of fx.leaves) if (l.kind === 'kick') assert.ok(!RED.has(l.colour) && GROUND_LEAF_COLOURS.includes(l.colour));
 // A dodge lifts more at once.
 v = view('quality', [deep.x, deep.z]); fx = v.leafFX;
 fx.update(player(deep.x, deep.z, 0, 0), 1 / 60);
 fx.update(player(deep.x, deep.z, 12, 0, .2), 1 / 60);
 const dodged = fx.count('kick');
 v = view('quality', [deep.x, deep.z]); v.leafFX.update(player(deep.x, deep.z, 0, 0), 1 / 60); v.leafFX.update(player(deep.x, deep.z, 4, 0), 1 / 60);
 assert.ok(dodged > v.leafFX.count('kick') && dodged >= 5, `dodge ${dodged}`);
 // Robots and other players too (the view's remotePlayers).
 v = view('quality', [deep.x, deep.z]); fx = v.leafFX; v.remotePlayers = [{ id: 'bot', x: deep.x, z: deep.z, vx: 0, vz: 4, dodgeRemaining: 0, hp: 500 }];
 for (let t = 0; t < 1.5; t += 1 / 60) fx.update(player(30, 45), 1 / 60);
 assert.ok(fx.count('kick') > 0, 'a robot kicks leaves');
 // The town yard: no litter, nothing kicked.
 v = view('extreme', [30, -4.5]); fx = v.leafFX;
 for (let t = 0; t < 2; t += 1 / 60) fx.update(player(30, -4.5, 5, 0, t < .2 ? .2 : 0), 1 / 60);
 assert.equal(fx.count('kick'), 0);
 // A worn path through the woods: hardly any loose litter on it.
 const field = litterField(ground, wick), onPath = wick.terrain.paths.find(p => p.id === 'woods-track').points[2];
 assert.ok(field.woodsAt(onPath[0], onPath[1]).depth >= 1 && field.trackAt(onPath[0], onPath[1]), 'the woods track');
 assert.ok(field.at(onPath[0], onPath[1]) <= TRACK);
 // The fork maple's carpet counts as litter.
 const maple = wick.trees.trees.find(t => t.kind === 'maple');
 assert.equal(litterField(ground, wick).at(maple.x + 1, maple.z + 1), 1);
 // Kicked leaves settle and are gone within a few seconds.
 v = view('balanced', [deep.x, deep.z]); fx = v.leafFX;
 fx.kick(deep.x, deep.z, 10, 1, 0, 2, 2);
 run(fx, player(0, 0), 2);
 assert.ok(fx.leaves.some(l => l.landed), 'they settle');
 run(fx, player(0, 0), 6);
 assert.equal(fx.count('kick'), 0);
});

test('a blast in the woods throws a burst of leaves, in town none; pools per preset', () => {
 let last = 0;
 for (const q of PRESETS) {
  const v = view(q, [deep.x, deep.z]), fx = v.leafFX;
  for (let i = 0; i < 6; i++) fx.blast({ type: 'grenadeExplosion', x: deep.x, z: deep.z, radius: 3 });
  const n = fx.count('kick');
  assert.ok(n > 0 && n <= LEAF_FX[q].kick, `${q} ${n}`);
  assert.ok(n >= last); last = n;
 }
 const v = view('extreme', [30, -4.5]);
 v.leafFX.blast({ type: 'explosion', x: 30, z: -4.5, radius: 3, count: 10 });
 assert.equal(v.leafFX.count('kick'), 0);
 // Far from the camera: nothing made.
 const far = view('extreme', [30, 45]);
 far.leafFX.blast({ type: 'explosion', x: deep.x, z: deep.z, radius: 3 });
 assert.equal(far.leafFX.leaves.length, 0);
});

test('the pools are cleared with the map, and a preset drop trims them', () => {
 const v = view('extreme', [deep.x, deep.z]), fx = v.leafFX;
 run(fx, player(deep.x, deep.z, 4, 0), 3);
 fx.blast({ type: 'explosion', x: deep.x, z: deep.z, radius: 3 });
 assert.ok(fx.leaves.length > 20);
 v.qualityName = 'performance'; fx.update(player(deep.x, deep.z), 1 / 60);
 assert.ok(fx.count('fall') <= LEAF_FX.performance.fall && fx.count('kick') <= LEAF_FX.performance.kick);
 fx.clear();
 assert.equal(fx.leaves.length, 0); assert.equal(fx.mesh.count, 0); assert.equal(fx.mesh.visible, false);
 // Maps without woods to carpet get nothing.
 assert.equal(buildLeaves({ scene: new THREE.Scene(), ground: groundFor(maps.deadwater) }, maps.deadwater), null);
 assert.equal(maps['hill-test'].leafLitter, undefined);
});
