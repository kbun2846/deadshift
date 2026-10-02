// Lumen stage 5: the street detail (world/lumen-detail.js types and models,
// render/city-detail.js the preset tiers, tools/lumen-place-detail.mjs the
// seeded placement, maps/lumen-detail.js what it wrote). The types are many
// and small, without colliders but the bike rails'; every model keeps to its
// footprint and its height (ankle clutter, flat wall pieces); no team colour,
// no lettering (colour blocks only); the preset steps merge per cell into the
// map's own two materials; every placed piece keeps the placement rules on
// the live map, and the file is what the generator writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as THREE from 'three';
import { maps, PROP_TYPES, mapColliders } from '../src/maps.js';
import { LUMEN_MODELS } from '../src/world/lumen-props.js';
import { LUMEN_DETAIL_TYPES, LUMEN_DETAIL_INFO, DETAIL_MODELS, DETAIL_COLOURS } from '../src/world/lumen-detail.js';
import { LUMEN_DETAIL_PROPS } from '../src/maps/lumen-detail.js';
import { CityDetail, DETAIL_GROUPS, CITY_DETAIL, mergeParts } from '../src/render/city-detail.js';
import { litMaterial } from '../src/world/lumen-glow.js';
import { detailProblems, obstacles, isDetail, PLACE, STAMPEDE, onMainWalk, onRoomFace, modelTop, velvetDoors } from '../tools/lumen-place-detail.mjs';
import { ROOM_VIEW } from '../src/render/city-shells.js';
import { deltaE2000, lab, hexRgb, toSrgb } from '../src/render/look-contrast.js';
import { stubView, countGroup } from './lumen-stub-view.js';
import * as L from './lumen-place-lib.js';

const root = new URL('..', import.meta.url).pathname;
const TEAM = { amber: '#ffb020', cyan: '#2ee6ff', violet: '#b77bff' };
const NAMES = Object.keys(LUMEN_DETAIL_TYPES);
const map = maps.lumen;

// Builds `type` at a spot (the seed) into a fresh group; returns the group and its meshes' world vertices.
function build(type, x = 10.5, z = -7.25, view = stubView()) {
  const p = { ...PROP_TYPES[type], type, x, z, angle: 0 }, g = new THREE.Group();
  LUMEN_MODELS.get(type)(view, p, g);
  g.updateMatrixWorld(true);
  return { g, p, view };
}
function eachVertex(g, fn) {
  const v = new THREE.Vector3();
  g.traverse(o => { if (!o.isMesh) return; const pos = o.geometry.attributes.position; for (let i = 0; i < pos.count; i++) fn(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld), o); });
}
const far = (hex, min = 15) => Object.values(TEAM).every(t => deltaE2000(lab(hexRgb(hex)), lab(hexRgb(t))) >= min);

test('types: 60 or more new city detail types, walk-over with no collider but the bike rails, each with a model and a place', () => {
  assert.ok(NAMES.length >= 60, `${NAMES.length} types`);
  assert.deepEqual([...DETAIL_MODELS].sort(), [...NAMES].sort());
  for (const name of NAMES) {
    const t = LUMEN_DETAIL_TYPES[name], I = LUMEN_DETAIL_INFO[name];
    assert.ok(name.startsWith('city'), name);
    assert.equal(PROP_TYPES[name], t, `${name} is in PROP_TYPES`);
    assert.equal(typeof LUMEN_MODELS.get(name), 'function', `${name} has a model`);
    assert.ok(I && typeof I.spot === 'string' && I.tier >= 0 && I.tier <= 4, `${name} info`);
    assert.equal(t.health, null, `${name} is scenery`);
    if (I.spot === 'rail') {
      assert.ok(t.lowTop && !t.walkOver && t.collisionBoxes.length === 1, `${name}: a low solid rail`);
      const [x, z, w, d, h] = t.collisionBoxes[0]; assert.ok(Math.abs(x) + w / 2 <= t.w / 2 + 1e-9 && Math.abs(z) + d / 2 <= t.d / 2 + 1e-9 && h < 1.1);
    } else assert.ok(t.walkOver && Array.isArray(t.collisionBoxes) && t.collisionBoxes.length === 0, `${name}: walk-over, no collider (a round meets every collider on a flat map)`);
  }
  // no detail piece adds a collider to the map but the rails
  const ids = new Set(LUMEN_DETAIL_PROPS.filter(p => LUMEN_DETAIL_INFO[p.type].spot !== 'rail').map(p => p.id));
  assert.equal(mapColliders(map).filter(c => ids.has(c.propId)).length, 0);
});

test('models: inside their footprint and low (ankle clutter under 0.32 m; wall pieces flat on the wall and under 3 m; rails in their box), the same each load', () => {
  const bad = [];
  for (const name of NAMES) {
    const t = LUMEN_DETAIL_TYPES[name], I = LUMEN_DETAIL_INFO[name], onWall = I.spot === 'wall' || I.spot === 'door'; // (a door's lit frame is a wall piece)
    for (let s = 0; s < 5; s++) {
      const { g } = build(name, 3 + s * 7.3, -2 + s * 4.1);
      let top = 0, low = Infinity, n = 0;
      g.position.set(0, 0, 0); g.updateMatrixWorld(true);
      eachVertex(g, v => {
        n++; top = Math.max(top, v.y); low = Math.min(low, v.y);
        if (I.spot === 'rail') { const [bx, bz, bw, bd] = t.collisionBoxes[0]; if (Math.abs(v.x - bx) > bw / 2 + .1 || Math.abs(v.z - bz) > bd / 2 + .1) bad.push(`${name}: ${v.x.toFixed(2)},${v.z.toFixed(2)} outside its box`); }
        else if (Math.abs(v.x) > t.w / 2 + .1 || v.z > t.d / 2 + .1 || v.z < -t.d / 2 - (onWall ? .02 : .1)) bad.push(`${name}: ${v.x.toFixed(2)},${v.z.toFixed(2)} outside ${t.w} x ${t.d}`);
      });
      if (!n) bad.push(`${name}: no parts`);
      const cap = I.spot === 'rail' ? t.collisionBoxes[0][4] + .1 : onWall ? PLACE.wallTop + .05 : .32;
      if (top > cap) bad.push(`${name}: ${top.toFixed(2)} m tall (cap ${cap})`);
      if (low < -.02) bad.push(`${name}: below the ground (${low.toFixed(3)})`);
      if (bad.length > 20) break;
    }
  }
  assert.deepEqual([...new Set(bad)].slice(0, 12), []);
  // the same model every load; a different one at another spot
  const verts = g => { const out = []; eachVertex(g, v => out.push(+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4))); return out; };
  for (const name of ['cityDBagBurst', 'cityDUmbrellaBroken', 'cityDConduit', 'cityDPaper']) {
    assert.deepEqual(verts(build(name, 4, 5).g), verts(build(name, 4, 5).g), `${name} repeats`);
    assert.notDeepEqual(verts(build(name, 4, 5).g), verts(build(name, 9, -3).g), `${name} varies`);
  }
});

test('models: cheap (under 450 triangles each, the whole placement under 90k), lit parts only on tiers from Performance up, tiers 0-4', () => {
  let total = 0; const bad = [];
  const perType = {};
  for (const name of NAMES) { const { g } = build(name); perType[name] = countGroup(g).triangles; if (perType[name] > 450) bad.push(`${name}: ${perType[name]} triangles`); }
  for (const p of LUMEN_DETAIL_PROPS) total += perType[p.type];
  assert.ok(total < 90000, `${total} triangles placed`);
  for (const name of NAMES) {
    const { g, view } = build(name), lit = litMaterial(view);
    g.traverse(o => {
      if (!o.isMesh) return;
      const t = o.userData.lumenDetailTier ?? 0;
      if (!Number.isInteger(t) || t < 0 || t > CITY_DETAIL.top) bad.push(`${name}: tier ${t}`);
      if (o.material === lit && t < 1) bad.push(`${name}: a lit part on Potato`);
      if (t && o.castShadow) bad.push(`${name}: a tiered part casts`);
    });
  }
  assert.deepEqual(bad, []);
});

test('colours: nothing within 15 CIEDE2000 of Amber, Cyan or Violet (plain parts as written, lit parts at their glow)', () => {
  const bad = [], c = new THREE.Color();
  for (const m of JSON.stringify(DETAIL_COLOURS).matchAll(/#[0-9a-f]{6}/gi)) if (!far(m[0])) bad.push(`DETAIL_COLOURS ${m[0]}`);
  for (const name of NAMES) for (let s = 0; s < 3; s++) {
    const { g } = build(name, s * 5.3, s * 2.9);
    g.traverse(o => {
      if (!o.isMesh) return;
      const col = o.geometry.attributes.color;
      if (col) { c.setRGB(Math.min(1, col.getX(0)), Math.min(1, col.getY(0)), Math.min(1, col.getZ(0))); const hex = '#' + c.getHexString(); if (!far(hex, 12)) bad.push(`${name}: lit ${hex}`); }
      else if (o.material.color && !far('#' + o.material.color.getHexString())) bad.push(`${name}: ${o.material.color.getHexString()}`);
    });
  }
  assert.deepEqual([...new Set(bad)], []);
});

// A view with a scene (the system adds its steps to it).
function sceneView(name = 'balanced') { const v = stubView(); v.scene = new THREE.Scene(); v.qualityName = name; return v; }
function buildPlaced(view, filter = () => true) {
  const groups = [];
  for (const q of LUMEN_DETAIL_PROPS.filter(filter)) {
    const g = new THREE.Group(); g.position.set(q.x, 0, q.z); g.rotation.y = q.angle; view.scene.add(g);
    LUMEN_MODELS.get(q.type)(view, { ...PROP_TYPES[q.type], ...q }, g); groups.push(g);
  }
  return groups;
}

test('the preset steps: tagged parts leave the props for one mesh per cell (the map) per step and material, on the map\'s own plain and lit materials; Potato shows none; each step holds the one under it', () => {
  const view = sceneView('balanced'), groups = buildPlaced(view, q => Math.abs(q.x - 6) < 40 && Math.abs(q.z) < 30);
  const tagged = () => groups.reduce((n, g) => n + g.children.filter(o => o.userData.lumenDetailTier).length, 0);
  const before = tagged(); assert.ok(before > 200, `${before} tagged parts`);
  assert.equal(DETAIL_GROUPS.get(view).length, groups.length);
  const sys = new CityDetail(view, DETAIL_GROUPS.get(view));
  assert.equal(tagged(), 0, 'every tagged part was taken out of its prop');
  assert.equal(sys.parts, before);
  const lit = litMaterial(view), plain = view.bakedMaterial('plain');
  let last = 0;
  for (let s = 1; s <= CITY_DETAIL.top; s++) {
    const step = sys.steps[s], cells = new Map();
    step.traverse(o => {
      if (!o.isMesh) return;
      assert.ok(o.material === lit || o.material === plain, 'only the map\'s two materials');
      assert.equal(o.castShadow, false);
      const key = o.name.split('-').slice(3, 5).join(',');
      cells.set(key, (cells.get(key) || 0) + 1);
    });
    for (const [k, n] of cells) assert.ok(n <= 2, `step ${s} cell ${k}: ${n} meshes`);
    const { triangles } = sys.stats(s); assert.ok(triangles > last, `step ${s} adds`); last = triangles;
  }
  for (const [name, step] of Object.entries(CITY_DETAIL.steps)) {
    sys.setQuality(name);
    for (let s = 1; s <= CITY_DETAIL.top; s++) assert.equal(sys.steps[s].visible, s === step, `${name} step ${s}`);
  }
  // Extreme is Quality plus: every Quality part is in Extreme's step.
  assert.ok(sys.stats(4).triangles > sys.stats(3).triangles);
  sys.dispose();
  // merging keeps position count and colours
  const box = new THREE.BoxGeometry(1, 1, 1), merged = mergeParts([{ geometry: box, matrix: new THREE.Matrix4().makeTranslation(2, 0, 0), colour: new THREE.Color('#ff0000') }]);
  assert.equal(merged.attributes.position.count, 36); assert.ok(Math.abs(merged.attributes.position.getX(0) - 2.5) < 1e-6 || Math.abs(merged.attributes.position.getX(0) - 1.5) < 1e-6);
});

test('placement: many pieces of many types, each keeping the rules on the live map (outline, buildings, solids, other pieces, doorways, crosswalks, vents, drains, poles, the sidewalks\' building-side 1.4 m)', () => {
  assert.ok(LUMEN_DETAIL_PROPS.length >= 230, `${LUMEN_DETAIL_PROPS.length} pieces`); // (280 before the owner's second clutter cut, 2026-10-01: 245 after)
  const placedTypes = new Set(LUMEN_DETAIL_PROPS.map(p => p.type));
  assert.ok(placedTypes.size >= 60, `${placedTypes.size} types placed`);
  LUMEN_DETAIL_PROPS.forEach((p, i) => { assert.equal(p.id, `ld${i}`); assert.ok(LUMEN_DETAIL_TYPES[p.type], p.type); assert.ok([p.x, p.z, p.angle].every(Number.isFinite)); });
  // the live map (the hook in maps/lumen.js, or the pieces added to it)
  const hooked = LUMEN_DETAIL_PROPS.every(q => map.props.some(p => p.id === q.id)) ? map : { ...map, props: [...map.props, ...LUMEN_DETAIL_PROPS] };
  const base = { ...hooked, props: hooked.props.filter(p => !isDetail(p)) }, O = obstacles(base);
  const placed = LUMEN_DETAIL_PROPS.map(q => ({ ...q, f: { poly: L.boxPoly(q.x, q.z, LUMEN_DETAIL_TYPES[q.type].w, LUMEN_DETAIL_TYPES[q.type].d, q.angle) } }));
  for (const q of placed) q.f.bb = L.bounds(q.f.poly);
  const bad = [];
  for (const q of placed) { const why = detailProblems(q, O, placed); if (why.length) bad.push(`${q.id} ${q.type} (${q.x},${q.z}): ${why.join(', ')}`); }
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} problems`);
  // the storm drains all have a grate; the run to the metro its belongings
  assert.ok(LUMEN_DETAIL_PROPS.filter(p => p.type === 'cityDDrain').length >= O.drains.length - 8);
  const onRun = p => STAMPEDE.some(path => path.some((a, i) => { const b = path[i + 1]; if (!b) return false; const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(p.x - a[0] - dx * t, p.z - a[1] - dz * t) < 3.2; }));
  const stampede = LUMEN_DETAIL_PROPS.filter(p => LUMEN_DETAIL_INFO[p.type].spot === 'stampede');
  assert.ok(stampede.length >= 40 && stampede.every(onRun), `${stampede.length} belongings, all on the run`);
  assert.ok(LUMEN_DETAIL_PROPS.filter(p => /Umbrella/.test(p.type)).length >= 12, 'umbrellas along the stampede');
  // nothing on the ground in a main sidewalk's building-side 1.4 m
  for (const q of placed) if (LUMEN_DETAIL_INFO[q.type].spot !== 'wall') for (const f of L.footprints) if (L.distance(q.f.poly, f.poly) < 1.4 && q.f.poly.some(([x, z]) => onMainWalk(x, z))) bad.push(`${q.id} in the strip`);
  assert.deepEqual(bad.slice(0, 5), []);
});

test('placement: no wall piece stands over a room\'s knee wall (on the outside of a room\'s camera-facing wall, nothing over knee height floats when you are inside); Velvet Row has its lit touches', () => {
  const bad = [];
  for (const q of LUMEN_DETAIL_PROPS) {
    const I = LUMEN_DETAIL_INFO[q.type]; if (I.spot !== 'wall' && I.spot !== 'door') continue;
    const room = onRoomFace(q, LUMEN_DETAIL_TYPES[q.type].d);
    if (room && modelTop(q) > ROOM_VIEW.knee + .01) bad.push(`${q.id} ${q.type} (${q.x},${q.z}) ${modelTop(q).toFixed(2)} m on ${room.id}`);
  }
  assert.deepEqual(bad, []);
  // (the reviewer's nine: the luxury lobby's conduits among them)
  assert.ok(onRoomFace({ x: 26.27, z: -10.41, angle: 0 }, .16), 'the luxury lobby\'s south face is a room face');
  const lit = ['cityDDoorGlow', 'cityDNeonSide', 'cityDPuddleGlint'].map(t => LUMEN_DETAIL_PROPS.filter(p => p.type === t).length);
  assert.ok(lit[0] >= 3 && lit[1] >= 2 && lit[2] >= 4, `Velvet Row: ${lit.join(', ')}`);
  assert.ok(velvetDoors().length >= 3);
});

test('placement: the bike rails keep the cover rules (no overlap, gaps under 0.7 or over 1.4 m, off doors, zebras, the sniper lane, spawns, the Crossroads)', () => {
  const hooked = LUMEN_DETAIL_PROPS.every(q => map.props.some(p => p.id === q.id)) ? map : { ...map, props: [...map.props, ...LUMEN_DETAIL_PROPS] };
  const rails = new Set(LUMEN_DETAIL_PROPS.filter(p => LUMEN_DETAIL_INFO[p.type].spot === 'rail').map(p => p.id));
  assert.ok(rails.size >= 3, `${rails.size} rails`);
  const all = L.propPolys(hooked), mine = all.filter(c => rails.has(c.propId)), bad = [];
  const walls = [...L.footprints, ...L.solids.filter(s => s.kind !== 'barricade')];
  for (const c of mine) {
    for (const o of all) if (o.propId !== c.propId && !o.walkOver && L.penetration(c.poly, o.poly) > .02) bad.push(`${c.propId} overlaps ${o.propId}`);
    for (const d of L.doors) if (L.penetration(c.poly, d.poly) > .01) bad.push(`${c.propId} in a doorway`);
    for (const z of [...L.zebras, ...L.stripes]) if (L.penetration(c.poly, z.poly) > .01) bad.push(`${c.propId} on a zebra`);
    if (L.penetration(c.poly, L.lane.poly) > 0) bad.push(`${c.propId} on the sniper lane`);
    if (L.penetration(c.poly, L.crossRect.poly) > 0) bad.push(`${c.propId} in the Crossroads`);
    for (const s of L.spawnPts) if (L.distance(c.poly, L.boxPoly(s.x, s.z, .02, .02)) < 1) bad.push(`${c.propId} by a spawn`);
    for (const o of [...all.filter(x => x.propId !== c.propId && !x.walkOver), ...walls]) { const g = L.distance(c.poly, o.poly); if (g > .705 && g < 1.395) bad.push(`${c.propId} gap ${g.toFixed(2)}`); }
  }
  assert.deepEqual(bad, []);
});

test('the generator is deterministic and the file is what it writes (--check)', () => {
  const r = spawnSync(process.execPath, [root + 'tools/lumen-place-detail.mjs', '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test('the density bar: with the rest of the map, 50 or more pieces per 1000 m² and every screen 25 or more', () => {
  const r = spawnSync(process.execPath, [root + 'tools/detail-density.mjs', 'lumen'], { encoding: 'utf8' });
  const per = +r.stdout.match(/: ([\d.]+) per 1000/)[1], sparse = +r.stdout.match(/(\d+) screens under 25/)[1];
  assert.ok(per >= 50, `${per} per 1000 m²`); assert.equal(sparse, 0, r.stdout);
});
