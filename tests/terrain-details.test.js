// Ground detail on maps with hills (world/terrain-details.js): what it
// places, where it keeps clear of, how it sits on the drawn ground, and
// what it costs the renderer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { hillTest } from '../src/maps/hill-test.js';
import { deadwater } from '../src/maps/deadwater.js';
import { groundFor, building, mapColliders } from '../src/map-kit.js';
import { Ground, FLAT, insidePoly, edgeCollider } from '../src/world/heightfield.js';
import { bakeTerrain } from '../src/world/terrain-bake.js';
import { buildTerrainMesh } from '../src/render/terrain-mesh.js';
import { inside } from '../src/simulation.js';
import { placeTerrainDetails, buildTerrainDetails, detailClearance, DETAIL_KINDS, DETAIL_KIND_NAMES, DETAIL_TIERS, MAX_SLOPE } from '../src/world/terrain-details.js';

const LITTER = ['#8a6a3e', '#7a5a34', '#5a4632'];
const all = pieces => DETAIL_KIND_NAMES.flatMap(name => pieces[name].map(p => ({ ...p, kind: name })));
const segDist = (x, z, [ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(ax + dx * t - x, az + dz * t - z); };
const lineDist = (x, z, pts) => Math.min(...pts.slice(1).map((p, i) => segDist(x, z, pts[i], p)));

// A made-up map with everything a piece must keep off: a stream with a ford
// and a deck, a path, a pad, a walled plateau, a building, a prop, a target,
// and a region where leaves lie four times as thick.
const creek = {
 id: 'detail-test', name: 'Detail test', width: 60, depth: 50, scenerySeed: 42,
 terrain: {
  bounds: [-30, -25, 30, 25], base: 0, noise: { cell: 9, amp: .1, seed: 3 },
  levels: [{ id: 'shelf', h: 1.5, grade: .25, cliffs: [0, 1], poly: [[-25, 8], [-10, 8], [-10, 20], [-25, 20]] }],
  paths: [{ points: [[-25, -20, 0], [20, -20, 0]], width: 3, shoulder: .5 }],
  water: [{ points: [[-30, 0, 1.5, -1], [30, 2, 1.5, -1]], top: -.3, bank: 1.2 }],
  fords: [{ points: [[10, -4, -.2], [10, 6, -.2]], width: 3, shoulder: 1 }],
  decks: [{ poly: [[-12, -3], [-8, -3], [-8, 5], [-12, 5]], h: .4 }],
  pads: [{ x: 18, z: -12, w: 5, d: 4, h: .4 }],
 },
 buildings: [building('hut', 6, 15, 4, 4, 3, '', '#777777', '#333333')],
 props: [{ type: 'crate', x: 0, z: -10 }], fences: [], zones: [],
 targets: [{ id: 't', x: -5, z: -12 }],
 groundDetail: { regions: [{ poly: [[0, -25], [30, -25], [30, -5], [0, -5]], kinds: { leaves: 4 } }] },
};
const baked = bakeTerrain(creek), creekGround = new Ground({ ...baked, heights: baked.heights }, creek.terrain);

test('Test Hill gets every kind, the same pieces on every load', () => {
 const ground = groundFor(hillTest), a = placeTerrainDetails(ground, hillTest), b = placeTerrainDetails(ground, hillTest);
 assert.deepEqual(a, b);
 for (const name of DETAIL_KIND_NAMES) assert.ok(a[name].length > 50, `${name}: ${a[name].length}`);
 // Changing one kind's density leaves every other kind where it was.
 const c = placeTerrainDetails(ground, { ...hillTest, groundDetail: { ...hillTest.groundDetail, kinds: { tufts: { density: 2 } } } });
 assert.ok(c.tufts.length > a.tufts.length * 1.6);
 for (const name of DETAIL_KIND_NAMES.filter(n => n !== 'tufts')) assert.deepEqual(c[name], a[name]);
});

test('the presets build up: sparse, then medium, then dense', () => {
 const pieces = all(placeTerrainDetails(groundFor(hillTest), hillTest));
 const counts = DETAIL_TIERS.map((_, tier) => pieces.filter(p => p.tier === tier).length);
 assert.deepEqual(DETAIL_TIERS.map(([key]) => key), ['performanceDetails', 'groundDetails', 'extraGroundDetails']);
 // Performance sees the first group, Balanced the first two, Quality and Extreme all three.
 const seen = [counts[0], counts[0] + counts[1], counts[0] + counts[1] + counts[2]];
 assert.ok(seen[0] > 150 && seen[1] > seen[0] * 2 && seen[2] > seen[1] * 1.6, JSON.stringify(seen));
 // renderer.js shows the groups by preset (Potato: none of them).
 const renderer = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
 assert.match(renderer, /this\.performanceDetails\.visible = name !== 'potato'/);
 assert.match(renderer, /this\.groundDetails\.visible = name === 'balanced' \|\| isDemanding\(name\)/);
 assert.match(renderer, /this\.extraGroundDetails\.visible = isDemanding\(name\)/);
});

test('litter stays brown: no red on the ground', () => {
 const pieces = placeTerrainDetails(groundFor(hillTest), hillTest);
 for (const p of pieces.leaves) assert.ok(LITTER.includes(p.color), p.color);
 assert.deepEqual(DETAIL_KINDS.leaves.colors, LITTER);
 for (const name of DETAIL_KIND_NAMES) for (const hex of DETAIL_KINDS[name].colors) {
  const hsl = new THREE.Color(hex).getHSL({}, THREE.SRGBColorSpace);
  // Nothing redder than orange-brown (hue under 20 degrees) or saturated.
  assert.ok(hsl.s < .45 && (hsl.h * 360 > 20 || hsl.s < .15), `${name} ${hex}`);
 }
 // A map can bring its own colours.
 const own = placeTerrainDetails(groundFor(hillTest), { ...hillTest, groundDetail: { kinds: { leaves: { colors: ['#7a5a34'] } } } });
 assert.ok(own.leaves.every(p => p.color === '#7a5a34'));
});

test('pieces keep off paths, water, fords, decks, pads, walls, buildings, props and steep ground', () => {
 for (const [map, ground] of [[hillTest, groundFor(hillTest)], [creek, creekGround]]) {
  const pieces = all(placeTerrainDetails(ground, map)), t = map.terrain;
  assert.ok(pieces.length > 300, `${map.id}: ${pieces.length}`);
  const boxes = [...mapColliders({ ...map, terrain: null }), ...ground.edges.map(edgeCollider)], slope = { x: 0, z: 0 };
  for (const p of pieces) {
   const where = `${map.id} ${p.kind} at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`;
   assert.ok(p.x > ground.minX && p.x < ground.maxX && p.z > ground.minZ && p.z < ground.maxZ, where);
   const g = ground.gradientAt(p.x, p.z, slope);
   assert.ok(Math.hypot(g.x, g.z) <= MAX_SLOPE && !ground.wallAt(p.x, p.z), `${where}: steep or on a wall`);
   for (const path of t.paths || []) assert.ok(lineDist(p.x, p.z, path.points) > path.width / 2 + .45, `${where}: on a path`);
   for (const w of t.water || []) assert.ok(lineDist(p.x, p.z, w.points) > 1.5 + w.bank, `${where}: in the stream`);
   for (const f of t.fords || []) assert.ok(lineDist(p.x, p.z, f.points) > f.width / 2, `${where}: on the ford`);
   for (const d of t.decks || []) assert.ok(!insidePoly(p.x, p.z, d.poly), `${where}: on a deck`);
   for (const b of map.buildings) assert.ok(!inside(p, { ...b, angle: b.angle || 1e-9, localW: b.w, localD: b.d }, Number.isFinite(b.baseY) ? 1.5 : .5), `${where}: in ${b.id}`);
   for (const pad of t.pads || []) assert.ok(!inside(p, pad, 1.5), `${where}: on a pad`);
   assert.ok(!boxes.some(b => inside(p, b, .3)), `${where}: in a collider`);
   for (const target of map.targets) assert.ok(Math.hypot(target.x - p.x, target.z - p.z) > 1.4, `${where}: at a target`);
  }
 }
 // The stream really was in the way (the made-up map is mostly open ground).
 const clear = detailClearance(creekGround, creek);
 assert.equal(clear(0, 1), false); assert.equal(clear(10, 0), false); assert.equal(clear(-10, 0.5), false);
 assert.equal(clear(0, -20), false); assert.equal(clear(18, -12), false); assert.equal(clear(6, 15), false);
 assert.equal(clear(-2, -15), true);
});

test('map data: regions thicken a kind, and groundDetail: false turns the layer off', () => {
 const pieces = placeTerrainDetails(creekGround, creek), region = creek.groundDetail.regions[0].poly;
 const density = (list, inRegion) => list.filter(p => insidePoly(p.x, p.z, region) === inRegion).length;
 const leavesIn = density(pieces.leaves, true), leavesOut = density(pieces.leaves, false), tuftsIn = density(pieces.tufts, true), tuftsOut = density(pieces.tufts, false);
 // Leaves are far thicker in the region than tufts are, relative to outside.
 assert.ok(leavesIn / leavesOut > 2.5 * tuftsIn / tuftsOut, JSON.stringify({ leavesIn, leavesOut, tuftsIn, tuftsOut }));
 const none = placeTerrainDetails(creekGround, { ...creek, groundDetail: false });
 assert.equal(all(none).length, 0);
 // A flat map (Deadwater) never gets this layer.
 assert.equal(all(placeTerrainDetails(FLAT, deadwater)).length, 0);
});

test('pieces sit on the drawn ground: flat ones on it, upright ones rooted in it, on every preset mesh', () => {
 const ground = groundFor(hillTest), fakeView = () => ({ sunOffset: { x: -24, y: 40, z: -18 }, groundMaterials: new Set() });
 const coarse = fakeView(); coarse.terrainMesh = buildTerrainMesh(coarse, ground, hillTest, .035);
 const fine = buildTerrainMesh(fakeView(), ground, hillTest, .01);
 // Down onto a mesh (its own triangles).
 const ray = new THREE.Raycaster(), meshAt = (mesh, x, z) => { ray.set(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0)); return ray.intersectObject(mesh, true)[0]?.point.y; };
 const view = { ...coarse, performanceDetails: new THREE.Group(), groundDetails: new THREE.Group(), extraGroundDetails: new THREE.Group() };
 buildTerrainDetails(view, ground, hillTest);
 const pieces = placeTerrainDetails(ground, hillTest, null), sample = all(pieces).filter((_, i) => i % 23 === 0);
 assert.ok(sample.length > 60);
 let checked = 0;
 const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
 for (const [key] of DETAIL_TIERS) for (const mesh of view[key].children) {
  const kind = DETAIL_KINDS[mesh.userData.terrainDetail];
  for (let i = 0; i < mesh.count; i += 7) {
   mesh.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix);
   const loaded = meshAt(coarse.terrainMesh, position.x, position.z), finer = meshAt(fine, position.x, position.z);
   if (loaded === undefined || finer === undefined) continue;
   if (kind.sink) { assert.ok(position.y < loaded && position.y < finer && position.y > loaded - kind.sink - .05, `upright ${position.y} vs ${loaded}/${finer}`); }
   // Flat pieces: just on the loaded mesh (within 2 cm over it), never under a finer one.
   else { assert.ok(position.y >= loaded - 1e-4 && position.y < loaded + .02 + .04, `flat ${position.y} vs ${loaded}`); assert.ok(position.y >= finer - 1e-3, `under the finer mesh ${position.y} vs ${finer}`); }
   checked++;
  }
 }
 assert.ok(checked > 200, `${checked}`);
});

test('the renderer cost: one instanced draw per kind per group, no shadows, and quick to build', () => {
 const view = { performanceDetails: new THREE.Group(), groundDetails: new THREE.Group(), extraGroundDetails: new THREE.Group() };
 const stats = buildTerrainDetails(view, groundFor(hillTest), hillTest);
 let triangles = 0;
 for (const [key] of DETAIL_TIERS) {
  const group = view[key];
  assert.ok(group.children.length <= DETAIL_KIND_NAMES.length);
  for (const mesh of group.children) {
   assert.ok(mesh.isInstancedMesh && mesh.instanceColor && !mesh.castShadow);
   triangles += mesh.count * mesh.geometry.attributes.position.count / 3;
  }
  assert.equal(stats.groups[key].draws, group.children.length);
 }
 // Every group on together (Quality, Extreme) stays a light layer on Test Hill.
 assert.ok(triangles < 80000, `${triangles} triangles`);
 assert.ok(stats.ms < 2000, `${stats.ms} ms`);
 // Each shape stays low-poly.
 const shapes = new Map(); for (const [key] of DETAIL_TIERS) for (const m of view[key].children) shapes.set(m.userData.terrainDetail, m.geometry.attributes.position.count / 3);
 for (const [name, count] of shapes) assert.ok(count <= 30, `${name}: ${count}`);
});

test('the map view builds the layer on terrain maps (world-build.js makeHillTerrain)', () => {
 const source = readFileSync(new URL('../src/render/world-build.js', import.meta.url), 'utf8');
 const hill = source.slice(source.indexOf('makeHillTerrain() {'), source.indexOf('refineTerrain(name)'));
 assert.match(hill, /buildTerrainDetails\(this, this\.ground, map\)/);
 assert.ok(hill.indexOf('buildTerrainDetails') > hill.indexOf("'performanceDetails']"), 'after the groups are made');
});
