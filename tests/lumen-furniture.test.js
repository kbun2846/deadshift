// Lumen stage 4: the street furniture's models (world/lumen-furniture.js,
// world/lumen-kit.js) and the breakables' and trees' shapes (world/lumen-breakables.js).
// Built in node on a stand-in view (tests/lumen-stub-view.js) and measured: every
// model fits the collision boxes the simulation uses, fills them where a body
// would meet them, is the same on every load and different from its neighbours,
// keeps to the city's colours (never Amber, Cyan or Violet) and stays cheap.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PROP_TYPES } from '../src/maps.js';
import { LUMEN_PROP_TYPES, LUMEN_MODELS } from '../src/world/lumen-props.js';
import { FURNITURE_MODELS } from '../src/world/lumen-furniture.js';
import { BREAKABLE_MODELS, LUMEN_BREAKABLES } from '../src/world/lumen-breakables.js';
import { CITY, propStream, tone, modelBounds } from '../src/world/lumen-kit.js';
import { litMaterial } from '../src/world/lumen-glow.js';
import { deltaBytes, hexToBytes } from '../tools/contrast-lib.mjs';
import { stubView, buildModel, countGroup } from './lumen-stub-view.js';
import { TERRAIN } from '../src/config/gameplay.js';

const ALL = [...FURNITURE_MODELS, ...BREAKABLE_MODELS];
const TEAM = { amber: '#ffb020', cyan: '#2ee6ff', violet: '#b77bff' };
const GREYS = new Set(['#6b6f78', '#585c64', '#7c808a']); // the stage 2 placeholders' greys

// Every colour a model uses: its materials' and its vertex colours', as sRGB hex.
function colours(g) {
  const out = new Set(), c = new THREE.Color();
  g.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) { if (m.color && !m.vertexColors) out.add('#' + m.color.getHexString()); }
    const a = o.geometry.attributes.color;
    if (a) { const seen = new Set(); for (let i = 0; i < a.count; i++) { const key = `${a.getX(i).toFixed(3)},${a.getY(i).toFixed(3)},${a.getZ(i).toFixed(3)}`; if (seen.has(key)) continue; seen.add(key); c.setRGB(a.getX(i), a.getY(i), a.getZ(i)); out.add('#' + c.getHexString()); } }
  });
  return out;
}
const typeOf = name => ({ ...LUMEN_PROP_TYPES[name], ...LUMEN_BREAKABLES[name] });
const heightOf = t => Math.max(...t.collisionBoxes.map(b => b[4]));

test('every furniture, breakable and tree type has a real model (not the grey placeholder)', () => {
  assert.ok(FURNITURE_MODELS.length >= 16, `${FURNITURE_MODELS.length} furniture models`);
  assert.ok(BREAKABLE_MODELS.length >= 25, `${BREAKABLE_MODELS.length} breakable and tree models`);
  for (const name of ALL) {
    assert.ok(PROP_TYPES[name], `${name} is in PROP_TYPES`);
    assert.equal(typeof LUMEN_MODELS.get(name), 'function', `${name} has a registered model`);
  }
  // The solid furniture of the stage 2 list, all of it (the vehicles are agent C's).
  const solid = Object.entries(LUMEN_PROP_TYPES).filter(([, t]) => !t.look || !/car|wreck|van|bike/.test(t.look)).map(([n]) => n)
    .filter(n => !['cityCompact', 'citySedan', 'citySuv', 'cityTaxi', 'citySports', 'cityVan', 'cityTruck', 'cityWreck', 'cityPileup', 'cityMotorbike'].includes(n));
  const missing = solid.filter(n => !LUMEN_MODELS.has(n));
  assert.deepEqual(missing, [], `no model for ${missing}`);
});

// Every vertex of a model (in the prop's own frame, angle 0) inside the union
// of its type's collision boxes, each with its own height, +0.1 m: what a
// body or a round meets is what is drawn. Two exceptions, both still inside
// the type's footprint: a roof overhead (from OVERHEAD up: over a body's top,
// so nothing walks or shoots into it; the shelter's roof over its bench), and
// ground dressing up to GROUND (a kerb, a flat box, litter: walked over). A
// tree's crown is wider than its trunk's collider: a tree keeps to its
// footprint and its height instead.
const OVERHEAD = TERRAIN.bodyTop + .2, GROUND = .2;
function outsideBoxes(g, boxes, tol, t) {
  const v = new THREE.Vector3(), m = new THREE.Matrix4(), out = [];
  g.updateMatrixWorld(true);
  g.traverse(o => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position, copies = o.isInstancedMesh ? o.count : 1;
    for (let c = 0; c < copies; c++) {
      if (o.isInstancedMesh) { o.getMatrixAt(c, m); m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        const inFootprint = Math.abs(v.x) <= t.w / 2 + tol && Math.abs(v.z) <= t.d / 2 + tol;
        const inside = boxes.some(([bx, bz, bw, bd, bh]) => Math.abs(v.x - bx) <= bw / 2 + tol && Math.abs(v.z - bz) <= bd / 2 + tol && v.y <= bh + tol)
          || (inFootprint && (v.y >= OVERHEAD || v.y <= GROUND));
        if (!inside) { let worst = Infinity; for (const [bx, bz, bw, bd, bh] of boxes) worst = Math.min(worst, Math.max(Math.abs(v.x - bx) - bw / 2, Math.abs(v.z - bz) - bd / 2, v.y - bh, 0)); out.push({ x: v.x, y: v.y, z: v.z, by: worst }); }
      }
    }
  });
  return out;
}

test('every model stays inside the union of its collision boxes (+0.1 m, each at its height) and fills them where a body would meet them', () => {
  const bad = [];
  for (const name of ALL) {
    const t = typeOf(name), { g } = buildModel(stubView(), LUMEN_MODELS, PROP_TYPES, name, { x: 10.5, z: -7.25 });
    const b = modelBounds(g), hMax = heightOf(t), tol = .105;
    if (/Tree/.test(name)) {
      if (Math.max(-b.min.x, b.max.x) > t.w / 2 + tol || Math.max(-b.min.z, b.max.z) > t.d / 2 + tol) bad.push(`${name}: x ${b.min.x.toFixed(2)}..${b.max.x.toFixed(2)} z ${b.min.z.toFixed(2)}..${b.max.z.toFixed(2)} beyond ${(t.w / 2).toFixed(2)} x ${(t.d / 2).toFixed(2)}`);
      if (b.max.y > hMax + tol) bad.push(`${name}: ${b.max.y.toFixed(2)} m tall, collision ${hMax} m`);
    } else {
      const out = outsideBoxes(g, t.collisionBoxes, tol, t);
      if (out.length) { const w = out.reduce((a, q) => q.by > a.by ? q : a); bad.push(`${name}: ${out.length} vertices outside its boxes, the worst ${w.by.toFixed(2)} m out at (${w.x.toFixed(2)}, ${w.y.toFixed(2)}, ${w.z.toFixed(2)})`); }
    }
    if (b.min.y < -.02) bad.push(`${name}: below the ground (${b.min.y.toFixed(2)})`);
    // (fills the height where a round would meet it; a lowTop piece and a tree's crown need not)
    if (!t.lowTop && !/Tree/.test(name) && b.max.y < hMax * .85) bad.push(`${name}: only ${b.max.y.toFixed(2)} m of ${hMax} m`);
  }
  assert.deepEqual(bad, []);
});

test('models are made of few, simple parts: triangles and meshes stay in budget', () => {
  const view = stubView(), rows = {}; let total = 0;
  for (const name of ALL) {
    const { g } = buildModel(view, LUMEN_MODELS, PROP_TYPES, name), n = countGroup(g);
    rows[name] = n; total += n.triangles;
    assert.ok(n.triangles > 20, `${name} is a bare box`);
    // A prop is a few hundred triangles: the biggest sets (the island, a scooter heap, a bike rack) stay under 2,000.
    assert.ok(n.triangles <= 2000, `${name}: ${n.triangles} triangles`);
    assert.ok(n.meshes <= 100, `${name}: ${n.meshes} meshes`);
  }
  assert.ok(total < 30000, `${total} triangles for one of each`);
});

test('a model is the same on every load, and two of a type are not identical', () => {
  const sum = a => { if (!a) return 0; let t = 0; for (let i = 0; i < a.array.length; i++) t += a.array[i] * ((i % 7) + 1); return t; };
  const sig = g => { const parts = []; g.traverse(o => { if (o.isMesh) parts.push([o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, sum(o.geometry.attributes.position), sum(o.geometry.attributes.color), o.material.color ? o.material.color.getHex() : 0].map(v => +v.toFixed(4)).join()); }); return parts.join('|'); };
  let varied = 0;
  for (const name of ALL) {
    const a = sig(buildModel(stubView(), LUMEN_MODELS, PROP_TYPES, name, { x: 4.25, z: 12.5 }).g), b = sig(buildModel(stubView(), LUMEN_MODELS, PROP_TYPES, name, { x: 4.25, z: 12.5 }).g);
    assert.equal(a, b, `${name} differs between loads`);
    if (a !== sig(buildModel(stubView(), LUMEN_MODELS, PROP_TYPES, name, { x: -33.5, z: -41.75 }).g)) varied++;
  }
  // (seeded wear: most types differ from spot to spot; a few are one shape)
  assert.ok(varied >= ALL.length * .7, `${varied} of ${ALL.length} vary with their spot`);
  // The stream itself: the same from the same spot, another from another.
  const p = { type: 'cityBench', x: 1.5, z: 2.5 };
  assert.equal(propStream(p)(), propStream(p)());
  assert.notEqual(propStream(p)(), propStream({ ...p, x: 9 })());
});

test('colours: nothing near Amber, Cyan or Violet, no placeholder greys, and lit parts are the lit set', () => {
  const bad = [];
  for (const name of ALL) for (const at of [{ x: 7.75, z: 3.5 }, { x: -33.5, z: -41.75 }, { x: 12.25, z: 30.5 }, { x: -9.5, z: 8.25 }, { x: 51, z: -19.75 }]) {
    const { g } = buildModel(stubView(), LUMEN_MODELS, PROP_TYPES, name, at);
    const used = colours(g);
    assert.ok(used.size >= 3, `${name}: ${used.size} colours`);
    for (const hex of used) {
      if (GREYS.has(hex)) bad.push(`${name}: placeholder grey ${hex}`);
      for (const [team, ref] of Object.entries(TEAM)) { const d = deltaBytes(hexToBytes(hex), hexToBytes(ref)); if (d < 15) bad.push(`${name}: ${hex} is ${d.toFixed(1)} from ${team}`); }
    }
  }
  assert.deepEqual(bad, []);
  // The palette itself.
  for (const [k, hex] of Object.entries(CITY)) for (const [team, ref] of Object.entries(TEAM)) assert.ok(deltaBytes(hexToBytes(hex), hexToBytes(ref)) >= 15, `CITY.${k} ${hex} is near ${team}`);
});

test('breakables are one baked mesh on the shared plain material; lit parts are the one lit material; nothing casts a shadow', () => {
  const view = stubView(), lit = litMaterial(view);
  for (const name of BREAKABLE_MODELS) {
    const t = typeOf(name); if (t.health === null) continue;
    const { g } = buildModel(view, LUMEN_MODELS, PROP_TYPES, name, { health: t.health });
    const meshes = []; g.traverse(o => { if (o.isMesh) meshes.push(o); });
    const plain = meshes.filter(m => m.material !== lit), glowing = meshes.filter(m => m.material === lit);
    assert.equal(plain.length, 1, `${name}: ${plain.length} plain meshes (one baked mesh expected)`);
    assert.equal(plain[0].material, view.bakedMaterial('plain'), `${name} is not on the shared plain material`);
    assert.equal(plain[0].castShadow, false, `${name} casts a shadow`);
    assert.ok(glowing.length <= 30, `${name}: ${glowing.length} lit parts`);
  }
});

test('the kit: tone snaps to a few steps, so wear adds a handful of colours, not hundreds', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(tone('#474a52', (Math.sin(i * 12.9898) * 43758.5453 % 1) - .5));
  assert.ok(seen.size <= 11, `${seen.size} shades of one grey`);
  assert.equal(tone('#474a52', 0), '#474a52');
  const dark = tone('#a2abb5', -1), light = tone('#a2abb5', 1);
  assert.ok(dark < '#a2abb5' && light > '#a2abb5' || light === '#ffffff' && dark === '#000000');
});
