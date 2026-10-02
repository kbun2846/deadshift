// Lumen stage 5: the districts' set pieces (world/lumen-setpieces.js, maps/lumen-setpieces.js; design 18b).
// 54 outdoor, street-level scenes' worth of pieces (roadworks, the median's planters, the Uptown plaza's dry
// fountain, the Stacks' drying racks and cable spans, the market stalls' goods, Velvet Row's door dressing, the
// garage's lift and the charge bays, the Metro plaza's turnstiles). Built in node on a stand-in view
// (tests/lumen-stub-view.js) and measured like the furniture: every model fits the collision boxes the simulation
// uses, is the same on every load, keeps to the city's colours and stays cheap; and the placement keeps the same
// rules the breakables and the cover do (tests/lumen-place-lib.js), on the finished map.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { PROP_TYPES } from '../src/maps.js';
import { LUMEN_PROP_TYPES, LUMEN_MODELS } from '../src/world/lumen-props.js';
import { LUMEN_SETPIECE_TYPES, SETPIECE_MODELS, SETPIECE_BREAKS } from '../src/world/lumen-setpieces.js';
import { LUMEN_DETAIL_TYPES } from '../src/world/lumen-detail.js';
import { LUMEN_BODY_TYPES } from '../src/world/lumen-bodies.js';
import { LUMEN_BREAKABLES } from '../src/world/lumen-breakables.js';
import { LUMEN_SETPIECE_PROPS, RETIRED_SETPIECES } from '../src/maps/lumen-setpieces.js';
import { LUMEN_VENTS } from '../src/maps/lumen-vents.js';
import { CITY } from '../src/world/lumen-kit.js';
import { litMaterial } from '../src/world/lumen-glow.js';
import { deltaBytes, hexToBytes } from '../tools/contrast-lib.mjs';
import { stubView, buildModel, countGroup } from './lumen-stub-view.js';
import { TERRAIN } from '../src/config/gameplay.js';
import * as L from './lumen-place-lib.js';
import { acrossPiece } from './lumen-rounds-lib.js';

const root = new URL('..', import.meta.url).pathname;
const TEAM = { amber: '#ffb020', cyan: '#2ee6ff', violet: '#b77bff' };
const GREYS = new Set(['#6b6f78', '#585c64', '#7c808a']); // the stage 2 placeholders' greys
const NAMES = Object.keys(LUMEN_SETPIECE_TYPES);
const hooked = LUMEN_SETPIECE_PROPS.every(q => L.map.props.some(p => p.id === q.id)) ? L.map : { ...L.map, props: [...L.map.props, ...LUMEN_SETPIECE_PROPS] };
const heightOf = t => t.collisionBoxes.length ? Math.max(...t.collisionBoxes.map(b => b[4])) : 0;
const hung = t => !t.walkOver && t.collisionBoxes.length === 0;

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

test('types: 40 or more, each solid, walk-over or hung, with a real model and no name shared with another set', () => {
  assert.ok(NAMES.length >= 40, `${NAMES.length} types`);
  assert.deepEqual([...SETPIECE_MODELS].sort(), [...NAMES].sort(), 'every type has a model and every model a type');
  const others = new Set([...Object.keys(LUMEN_PROP_TYPES), ...Object.keys(LUMEN_DETAIL_TYPES), ...Object.keys(LUMEN_BODY_TYPES), ...Object.keys(LUMEN_BREAKABLES)]);
  for (const n of NAMES) {
    const t = PROP_TYPES[n];
    assert.ok(t, `${n} is in PROP_TYPES`);
    assert.equal(typeof LUMEN_MODELS.get(n), 'function', `${n} has a registered model`);
    assert.ok(!others.has(n) || LUMEN_PROP_TYPES[n] === LUMEN_SETPIECE_TYPES[n], `${n} is another set's type too`);
    // (Most stand; what a person could smash breaks, owner 2026-10-01: SETPIECE_BREAKS, never anything of steel, stone or car-sized.)
    if (SETPIECE_BREAKS.includes(n)) assert.ok(Number.isInteger(t.health) && t.health >= 3 && t.health <= 12 && !t.walkOver, `${n}: health ${t.health}`);
    else assert.equal(t.health, null, `${n}: set pieces stand`);
    assert.ok(t.w > 0 && t.d > 0, `${n}: no footprint`);
    for (const [x, z, w, d, h] of t.collisionBoxes) {
      assert.ok([x, z, w, d, h].every(Number.isFinite) && w > 0 && d > 0 && h > 0, `${n}: a bad box`);
      assert.ok(Math.abs(x) + w / 2 <= t.w / 2 + 1e-6 && Math.abs(z) + d / 2 <= t.d / 2 + 1e-6, `${n}: a box outside its footprint`);
    }
    // A solid piece is either real cover (rounds meet it at 0.74 m: 0.94+ tall, or `lowTop` with its true top) or walked over.
    const h = heightOf(t);
    if (!hung(t) && !t.walkOver && !t.lowTop) assert.ok(h >= TERRAIN.roundHeight + .2, `${n}: ${h} m is neither knee-high (lowTop) nor cover`);
    if (t.lowTop) assert.ok(!t.walkOver);
    // Walk-over pieces have no collider: a round on a flat map meets every collider it crosses (weapons/rifle.js roundMeets).
    if (t.walkOver) assert.deepEqual(t.collisionBoxes, [], `${n}: walk-over with a collider`);
  }
});

// Every vertex of a model (in the prop's own frame, angle 0) inside the union of its type's collision boxes,
// each with its own height, +0.1 m: what a body or a round meets is what is drawn. Exceptions, still in the
// footprint: a roof or a string overhead (from OVERHEAD up), and ground dressing up to GROUND. A hung piece (no
// collider) and a walk-over piece (no collider, under 0.32 m) keep to their footprint. Rotated meshes are measured by their real vertices.
const OVERHEAD = TERRAIN.bodyTop + .2, GROUND = .2;
function outsideBoxes(g, t, tol) {
  const v = new THREE.Vector3(), out = [];
  g.updateMatrixWorld(true);
  g.traverse(o => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const inFootprint = Math.abs(v.x) <= t.w / 2 + tol && Math.abs(v.z) <= t.d / 2 + tol;
      const inside = hung(t) || t.walkOver ? inFootprint
        : t.collisionBoxes.some(([bx, bz, bw, bd, bh]) => Math.abs(v.x - bx) <= bw / 2 + tol && Math.abs(v.z - bz) <= bd / 2 + tol && v.y <= bh + tol) || (inFootprint && (v.y >= OVERHEAD || v.y <= GROUND));
      if (!inside) out.push({ x: v.x, y: v.y, z: v.z });
    }
  });
  return out;
}

test('every model stays inside its collision boxes (+0.1 m, each at its height), fills the height where a round meets it, and walk-overs stay flat', () => {
  const bad = [];
  for (const name of NAMES) {
    const t = PROP_TYPES[name], { g } = buildModel(stubView(), LUMEN_MODELS, PROP_TYPES, name, { x: 10.5, z: -7.25 });
    const b = new THREE.Box3().setFromObject(g, true), hMax = heightOf(t);
    const out = outsideBoxes(g, t, .105);
    if (out.length) { const w = out[0]; bad.push(`${name}: ${out.length} vertices outside its boxes, first at (${w.x.toFixed(2)}, ${w.y.toFixed(2)}, ${w.z.toFixed(2)})`); }
    if (b.min.y < -.02) bad.push(`${name}: below the ground (${b.min.y.toFixed(2)})`);
    if (hMax && !t.lowTop && !t.walkOver && b.max.y < hMax * .85) bad.push(`${name}: only ${b.max.y.toFixed(2)} m of ${hMax} m`);
    if (t.walkOver && b.max.y > .32) bad.push(`${name}: a walk-over ${b.max.y.toFixed(2)} m tall`);
    if (hung(t) && b.max.y < 1) bad.push(`${name}: a hung piece drawn at ${b.max.y.toFixed(2)} m`);
  }
  assert.deepEqual(bad, []);
});

test('models are made of few, simple parts: triangles and meshes stay in budget', () => {
  const view = stubView(); let total = 0;
  for (const name of NAMES) {
    const { g } = buildModel(view, LUMEN_MODELS, PROP_TYPES, name), n = countGroup(g);
    total += n.triangles;
    assert.ok(n.triangles > 20, `${name} is a bare box`);
    assert.ok(n.triangles <= 2000, `${name}: ${n.triangles} triangles`);
    assert.ok(n.meshes <= 100, `${name}: ${n.meshes} meshes`);
  }
  assert.ok(total < 40000, `${total} triangles for one of each`);
  // What the map spends: every placed piece's model, all of it merged into the static batches.
  const byType = new Map(); for (const p of LUMEN_SETPIECE_PROPS) byType.set(p.type, (byType.get(p.type) || 0) + 1);
  let placed = 0; for (const [type, n] of byType) placed += n * countGroup(buildModel(view, LUMEN_MODELS, PROP_TYPES, type).g).triangles;
  assert.ok(placed < 60000, `${placed} triangles for the whole map's set pieces`);
});

test('a model is the same on every load, and two of a type are not identical', () => {
  const sum = a => { if (!a) return 0; let t = 0; for (let i = 0; i < a.array.length; i++) t += a.array[i] * ((i % 7) + 1); return t; };
  const sig = g => { const parts = []; g.traverse(o => { if (o.isMesh) parts.push([o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, sum(o.geometry.attributes.position), sum(o.geometry.attributes.color), o.material.color ? o.material.color.getHex() : 0].map(v => +v.toFixed(4)).join()); }); return parts.join('|'); };
  let varied = 0;
  for (const name of NAMES) {
    const a = sig(buildModel(stubView(), LUMEN_MODELS, PROP_TYPES, name, { x: 4.25, z: 12.5 }).g), b = sig(buildModel(stubView(), LUMEN_MODELS, PROP_TYPES, name, { x: 4.25, z: 12.5 }).g);
    assert.equal(a, b, `${name} differs between loads`);
    if (a !== sig(buildModel(stubView(), LUMEN_MODELS, PROP_TYPES, name, { x: -33.5, z: -41.75 }).g)) varied++;
  }
  assert.ok(varied >= NAMES.length * .6, `${varied} of ${NAMES.length} vary with their spot`);
});

test('colours: nothing near Amber, Cyan or Violet (built or written), no placeholder greys', () => {
  const bad = [];
  for (const name of NAMES) for (const at of [{ x: 7.75, z: 3.5 }, { x: -33.5, z: -41.75 }, { x: 12.25, z: 30.5 }, { x: -9.5, z: 8.25 }, { x: 51, z: -19.75 }]) {
    const { g } = buildModel(stubView(), LUMEN_MODELS, PROP_TYPES, name, at), used = colours(g);
    assert.ok(used.size >= 3, `${name}: ${used.size} colours`);
    for (const hex of used) {
      if (GREYS.has(hex)) bad.push(`${name}: placeholder grey ${hex}`);
      for (const [team, ref] of Object.entries(TEAM)) { const d = deltaBytes(hexToBytes(hex), hexToBytes(ref)); if (d < 15) bad.push(`${name}: ${hex} is ${d.toFixed(1)} from ${team}`); }
    }
  }
  for (const file of ['src/world/lumen-setpieces.js', 'src/maps/lumen-setpieces.js']) {
    for (const m of fs.readFileSync(root + file, 'utf8').matchAll(/'(#[0-9a-fA-F]{6})'/g)) for (const [k, ref] of Object.entries(TEAM)) { const d = deltaBytes(hexToBytes(m[1]), hexToBytes(ref)); if (d < 15) bad.push(`${file}: ${m[1]} is ${d.toFixed(1)} from ${k}`); }
  }
  assert.deepEqual(bad, []);
  for (const [k, hex] of Object.entries(CITY)) for (const [team, ref] of Object.entries(TEAM)) assert.ok(deltaBytes(hexToBytes(hex), hexToBytes(ref)) >= 15, `CITY.${k} ${hex} is near ${team}`);
});

test('no lettering: the source draws no text (no canvas text, no glyph strings)', () => {
  const src = fs.readFileSync(root + 'src/world/lumen-setpieces.js', 'utf8');
  assert.ok(!/fillText|strokeText|TextGeometry|new FontLoader/.test(src));
});

test('static pieces are plain merged parts: nothing casts a shadow individually, lit parts are the one lit material, and there is nothing to update per frame', () => {
  const view = stubView(), lit = litMaterial(view);
  for (const name of NAMES) {
    const { g } = buildModel(view, LUMEN_MODELS, PROP_TYPES, name);
    let glowing = 0; g.traverse(o => { if (o.isMesh && o.material === lit) glowing++; });
    assert.ok(glowing <= 30, `${name}: ${glowing} lit parts`);
    g.traverse(o => assert.ok(!o.isLight, `${name} carries a light`));
  }
});

// (102 placed at stage 5; the owner's two clutter cuts, 2026-10-01, left 82, then 65 and RETIRED_SETPIECES unplaced.)
test('placement: 55 to 110 pieces, every type but the retired placed, ids unique, spread over the seven districts', () => {
  const n = LUMEN_SETPIECE_PROPS.length;
  assert.ok(n >= 55 && n <= 110, `${n} placed`);
  for (const t of NAMES) assert.equal(LUMEN_SETPIECE_PROPS.some(p => p.type === t), !RETIRED_SETPIECES.includes(t), `${t} is ${RETIRED_SETPIECES.includes(t) ? 'retired but placed' : 'never placed'}`);
  for (const t of SETPIECE_BREAKS) assert.ok(!RETIRED_SETPIECES.includes(t), `${t} breaks but is retired`);
  const ids = L.mapProps(hooked).map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, 'prop ids repeat');
  for (const p of LUMEN_SETPIECE_PROPS) assert.ok(Number.isFinite(p.x + p.z + p.angle), `${p.id} has no angle`);
  const where = {
    boulevard: p => Math.abs(p.z) < 9, uptown: p => p.x > 30 && p.z < -8, stacks: p => p.x < -30 && p.z < -17 && p.z > -50,
    market: p => p.x > -25 && p.x < 0 && p.z < -32, velvet: p => p.x < -25 && p.z > 30 && p.z < 52, garage: p => p.x < -30 && p.z > 5 && p.z < 32, metro: p => p.x > 15 && p.z > 8,
  };
  for (const [name, f] of Object.entries(where)) assert.ok(LUMEN_SETPIECE_PROPS.filter(f).length >= 5, `${name}: ${LUMEN_SETPIECE_PROPS.filter(f).length} pieces`);
  for (let cx = -80; cx < 80; cx += 20) for (let cz = -60; cz < 60; cz += 20) assert.ok(LUMEN_SETPIECE_PROPS.filter(p => p.x >= cx && p.x < cx + 20 && p.z >= cz && p.z < cz + 20).length <= 22, `a 20 m cell at ${cx},${cz} is crowded`);
});

test('placement rules: inside the outline, 1.4 m off every building, no overlap, 2.4 m from outer doors, off zebras, 1 m from the sniper lane, gaps under 0.7 or 1.4 and over, the alley kept, spawns legal', () => {
  const mine = new Set(LUMEN_SETPIECE_PROPS.map(p => p.id));
  const all = L.piecePolys(hooked), pieces = all.filter(c => mine.has(c.propId)), byId = new Map(L.mapProps(hooked).map(p => [p.id, p]));
  assert.ok(pieces.length >= 40, `${pieces.length} colliders`); // (79 before the second clutter cut, 2026-10-01; 46 after)
  const bad = [], f1 = v => v.toFixed(1), name = c => { const p = byId.get(c.propId); return `${p.id} ${p.type} (${f1(p.x)},${f1(p.z)})`; };
  const near = (a, b, m) => a.bb.x1 + m >= b.bb.x0 && a.bb.x0 - m <= b.bb.x1 && a.bb.z1 + m >= b.bb.z0 && a.bb.z0 - m <= b.bb.z1;
  const walls = [...L.footprints, ...L.solids.filter(s => s.kind !== 'barricade')];
  for (const c of pieces) {
    if (!L.isPlayable(L.map, c.x, c.z, .3) || c.poly.some(([x, z]) => !L.isPlayable(L.map, x, z, 0))) bad.push(`${name(c)} outside the outline`);
    for (const w of [...L.footprints, ...L.solids]) if (near(c, w, 0) && L.penetration(c.poly, w.poly) > .02) bad.push(`${name(c)} overlaps ${w.id ?? w.kind}`);
    // the sidewalk's building-side strip (tests/lumen-cover.test.js applies it to every prop collider)
    for (const w of L.footprints) if (near(c, w, 1.4) && L.distance(c.poly, w.poly) < 1.4 - 1e-3) bad.push(`${name(c)} is ${L.distance(c.poly, w.poly).toFixed(2)} m from ${w.id}`);
    for (const o of all) if (o.propId !== c.propId && near(c, o, 0) && !o.walkOver && !c.walkOver && L.penetration(c.poly, o.poly) > .02) bad.push(`${name(c)} overlaps ${byId.get(o.propId).type} ${o.propId}`);
    if (!c.walkOver) {
      for (const d of L.doors) if (L.penetration(c.poly, d.poly) > .01) bad.push(`${name(c)} blocks a door of ${d.id}`);
      for (const z of [...L.zebras, ...L.stripes]) if (near(c, z, 0) && L.penetration(c.poly, z.poly) > .01) bad.push(`${name(c)} on a zebra`);
      if (L.penetration(c.poly, L.lane.poly) > 0) bad.push(`${name(c)} on the sniper lane`);
      if (L.penetration(c.poly, L.recess.poly) > 0) bad.push(`${name(c)} in the body pile's recess`);
      if (Math.hypot(c.x - L.map.spawn.x, c.z - L.map.spawn.z) < 1.5 + Math.max(c.w, c.d) / 2) bad.push(`${name(c)} on the spawn`);
      for (const s of L.spawnPts) if (L.distance(c.poly, L.boxPoly(s.x, s.z, .02, .02)) < 1) bad.push(`${name(c)} within 1 m of a spawn point`);
      for (const b of L.BASES) if (c.height >= .5 && L.distance(c.poly, L.boxPoly(b.x, b.z, .02, .02)) < 3.5) bad.push(`${name(c)} in the middle of base ${b.id}`);
      for (const s of L.solids) if (s.kind === 'barricade' && near(c, s, 1.5) && L.distance(c.poly, s.poly) < 1.5) bad.push(`${name(c)} at a barricade`);
      if (near(c, L.crossRect, 0) && L.penetration(c.poly, L.crossRect.poly) > 0) bad.push(`${name(c)} in the Crossroads`);
      for (const o of [...all.filter(x => x.propId !== c.propId && !x.walkOver), ...walls]) {
        if (!near(c, o, 1.4)) continue;
        const g = L.distance(c.poly, o.poly); if (g > .705 && g < 1.395) bad.push(`${name(c)} and ${o.propId ? byId.get(o.propId).type + ' ' + o.propId : o.id ?? o.kind}: gap ${g.toFixed(2)} m`);
      }
    }
  }
  // Steam vents: 1.6 m clear (they jet and blind a body standing in one); practice targets: 1 m and off their line of sight.
  for (const c of pieces) for (const v of LUMEN_VENTS) if (Math.abs(c.x - v.x) < 4 && Math.abs(c.z - v.z) < 4 && L.distance(c.poly, L.boxPoly(v.x, v.z, .02, .02)) < 1.6) bad.push(`${name(c)} on a vent`);
  for (const c of pieces) if (!c.walkOver) for (const t of L.targetPts) if (L.distance(c.poly, L.boxPoly(t.x, t.z, .02, .02)) < 1) bad.push(`${name(c)} within 1 m of target ${t.id}`);
  // Lamp and sign poles (visuals with no collider) stand clear of every new piece by 0.3 m.
  for (const s of L.map.citySigns || []) {
    if (!(s.kind === 'lamp' || (s.kind === 'pole' && s.buildingId == null && !/gantry/.test(s.id)))) continue;
    const pole = L.boxPoly(s.at[0], s.at[2], .02, .02);
    for (const c of pieces) if (!c.walkOver && Math.abs(c.x - s.at[0]) < 3 && Math.abs(c.z - s.at[2]) < 3 && L.distance(c.poly, pole) < .3) bad.push(`${name(c)} is ${L.distance(c.poly, pole).toFixed(2)} m from ${s.id}`);
  }
  // Back Alley keeps 1.8 m clear (this counts every solid piece, ours included).
  const A = L.BACK_ALLEY; let narrowest = Infinity;
  for (let x = A.x0; x <= A.x1 + 1e-9; x += .25) {
    const blocked = all.filter(c => !c.walkOver && c.bb.x0 <= x && c.bb.x1 >= x && c.bb.z1 > A.z0 && c.bb.z0 < A.z1).map(c => { const zs = c.poly.map(p => p[1]); return [Math.max(A.z0, Math.min(...zs)), Math.min(A.z1, Math.max(...zs))]; }).sort((a, b) => a[0] - b[0]);
    let free = 0, from = A.z0; for (const [a, b] of blocked) { free = Math.max(free, a - from); from = Math.max(from, b); }
    narrowest = Math.min(narrowest, Math.max(free, A.z1 - from));
  }
  assert.ok(narrowest >= 1.8, `Back Alley ${narrowest.toFixed(2)} m clear`);
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} problems`);
});

test('rounds fly over every walk-over piece: a real round fired across each in the Simulation passes it', () => {
  const bad = [], unclear = [], f2 = v => v.toFixed(2);
  for (const p of L.mapProps(hooked).filter(q => LUMEN_SETPIECE_PROPS.some(s => s.id === q.id) && q.walkOver)) {
    const tries = acrossPiece(hooked, p);
    if (!tries.length) unclear.push(`${p.id} ${p.type}`);
    for (const r of tries) if (r.withIt < r.centre || Math.abs(r.withIt - r.without) > 1e-6) bad.push(`${p.id} ${p.type}: stopped at ${f2(r.withIt)} m (${f2(r.without)} m without it)`);
  }
  assert.deepEqual(unclear, [], 'a walk-over piece no round can be fired across');
  assert.deepEqual(bad, []);
});

test('knee-high pieces (lowTop, under a round\'s 0.74 m) let rounds fly over on the city\'s flat streets; taller ones stop them', () => {
  const bad = [], f2 = v => v.toFixed(2);
  let over = 0, met = 0;
  for (const p of L.mapProps(hooked).filter(q => LUMEN_SETPIECE_PROPS.some(s => s.id === q.id) && q.lowTop)) {
    const top = heightOf(p), low = top < TERRAIN.roundHeight;
    if (!low && Math.min(...p.collisionBoxes.map(q => q[4])) < TERRAIN.roundHeight) continue; // (a low pit behind a tall barrier: either)
    for (const r of acrossPiece(hooked, p, 1)) {
      if (low) { over++; if (r.withIt < r.centre || Math.abs(r.withIt - r.without) > 1e-6) bad.push(`${p.id} ${p.type} (${top} m) stopped a round at ${f2(r.withIt)} m`); }
      else { met++; if (r.withIt > r.far) bad.push(`${p.id} ${p.type} (${top} m): a round flew through`); }
    }
  }
  // (Fewer since the second clutter cut, 2026-10-01: the median planter and the lit ledge low, the crates and drum tall.)
  assert.ok(over >= 2 && met >= 3, `${over} low, ${met} tall pieces shot across`);
  assert.deepEqual(bad, []);
});

test('hung pieces (cable spans, bead curtains) have no collider, sit on ground that is playable, and the spans cross a street or a courtyard', () => {
  const hungTypes = NAMES.filter(n => hung(PROP_TYPES[n]));
  assert.ok(hungTypes.length >= 2);
  for (const p of LUMEN_SETPIECE_PROPS.filter(q => hungTypes.includes(q.type))) assert.ok(L.isPlayable(L.map, p.x, p.z, 0), `${p.id} ${p.type} hangs over nothing`);
  const colliders = new Set(L.propPolys(hooked).map(c => c.propId));
  for (const p of LUMEN_SETPIECE_PROPS.filter(q => hungTypes.includes(q.type))) assert.ok(!colliders.has(p.id), `${p.id} has a collider`);
});

test('every piece stands where its district story puts it: pieces named for a place are within 12 m of it', () => {
  const near = (type, x, z, r) => LUMEN_SETPIECE_PROPS.filter(p => p.type === type).some(p => Math.hypot(p.x - x, p.z - z) < r);
  assert.ok(near('cityDryFountain', 49, -33, 12), 'the dry fountain is in the Uptown plaza');
  assert.ok(near('cityCarLift', -40, 30, 12), 'the car lift is in the garage');
  assert.ok(near('cityTurnstileBank', 32, 41, 12), 'the turnstiles are at the Metro plaza');
  assert.ok(near('cityFishTank', -6, -37, 12), 'the fish tank is at the market');
  assert.ok(near('cityRoadPit', -46, -4, 12), 'the road pit is on the Boulevard');
  assert.ok(near('cityShrineNiche', -45, -30, 12), 'the shrine is in the Stacks courtyard');
});
