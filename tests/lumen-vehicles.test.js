// Lumen stage 4, agent C: the vehicles, the bus's outside, the wreck scenes and
// the light they throw (world/lumen-vehicles.js, world/lumen-bus.js,
// effects/lumen-wrecks.js, maps/lumen-vehicle-lights.js). Checks
// claude/lumen-design.md 6, 7, 8, 12 and 17 against the built models.
import test from 'node:test';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import vm from 'node:vm';
import { existsSync } from 'node:fs';
import { register } from 'node:module';
import * as THREE from 'three';

if (!existsSync(new URL('../src/render/city-shells.js', import.meta.url))) {
  register('data:text/javascript,' + encodeURIComponent(`export async function resolve(specifier, context, next) {
    if (specifier === './city-shells.js') return { url: 'data:text/javascript,export class CityShells { constructor() {} }', shortCircuit: true };
    return next(specifier, context);
  }`));
}
const { LUMEN_PROP_TYPES, LUMEN_MODELS } = await import('../src/world/lumen-props.js');
const Vehicles = await import('../src/world/lumen-vehicles.js');
const { VEHICLE_COLOURS, COLOUR_LIST } = await import('../src/world/lumen-vehicle-parts.js');
const { BUS_LOOK } = await import('../src/world/lumen-bus.js');
const L = await import('../src/maps/lumen-vehicle-lights.js');
const W = await import('../src/effects/lumen-wrecks.js');
const { LUMEN_PROPS, SHOPFRONT_CAR } = await import('../src/maps/lumen-cover.js');
const { ROADS } = await import('../src/maps/lumen-layout.js');
const { roadGeometry, poolShapes } = await import('../src/world/lumen-ground.js');
const { POOL_TONES } = await import('../src/maps/lumen-signs.js');
const { NEON } = await import('../src/render/city-signs.js');
const { CityFeatures } = await import('../src/render/city-features.js');
const { cityTest } = await import('../src/maps/city-test.js');
const { hexToBytes, deltaBytes } = await import('../tools/contrast-lib.mjs');
const { hash01: soundHash, slotFire } = await import('../src/audio-lumen.js');
const { LUMEN_SITES } = await import('../src/lumen-ambience.js');

const TEAM = ['#ffb020', '#2ee6ff', '#b77bff'];
const CLEAR = 15; // CIEDE2000 from a team colour (the owner's ~15)
const deltaE = (a, b) => deltaBytes(hexToBytes(a), hexToBytes(b));
const hexOf = c => (typeof c === 'string' && c.startsWith('#')) ? c : (NEON[c] || '#' + new THREE.Color(c).getHexString());
const teamGap = c => Math.min(...TEAM.map(t => deltaE(hexOf(c), t)));

// --- A view that records what is built ------------------------------------------------
function fakeView(quality = 'quality') {
  const materials = new Map(), colours = new Set();
  const view = {
    initialQuality: quality, static: new THREE.Group(), colours,
    material(c) { let m = materials.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c }); m.userData.hex = c; materials.set(c, m); } colours.add(c); return m; },
    mesh(geometry, color, x, y, z, parent) { const m = new THREE.Mesh(geometry, typeof color === 'string' ? view.material(color) : color); m.position.set(x, y, z); parent?.add(m); return m; },
    box(x, y, z, w, h, d, color, parent) { return view.mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z, parent); },
  };
  return view;
}
const typeOf = name => ({ ...LUMEN_PROP_TYPES[name] });
function build(prop, quality) {
  const view = fakeView(quality), g = new THREE.Group();
  LUMEN_MODELS.get(prop.type)(view, { ...typeOf(prop.type), ...prop, id: prop.id || 'test' }, g);
  g.updateMatrixWorld(true);
  return { g, view };
}
const skipped = o => { for (let n = o; n; n = n.parent) if (n.userData?.door || n.userData?.debris) return true; return false; };
function meshes(g, { all = false } = {}) { const out = []; g.traverse(o => { if (o.isMesh && (all || !skipped(o))) out.push(o); }); return out; }
function boundsOf(g, opts) { const b = new THREE.Box3(); for (const m of meshes(g, opts)) b.union(new THREE.Box3().setFromObject(m)); return b; }
const trisOf = g => meshes(g, { all: true }).reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0);
const signature = g => meshes(g, { all: true }).map(m => `${m.material.userData.hex || 'lit'}${m.position.x.toFixed(2)},${m.position.y.toFixed(2)},${m.position.z.toFixed(2)}r${m.quaternion.x.toFixed(2)},${m.quaternion.y.toFixed(2)},${m.quaternion.z.toFixed(2)}`).join('|');

const VEHICLES = LUMEN_PROPS.filter(p => L.VEHICLE_TYPES.includes(p.type));
// A stand-in for a type the map does not place: a few at scattered spots.
const synthetic = (type, n = 5) => Array.from({ length: n }, (_, i) => ({ type, x: 900 + i * 3.7 + type.length, z: 900 + i * 2.3, angle: 0 }));

test('every vehicle type has a model, and every vehicle-like type is a vehicle type', () => {
  for (const type of L.VEHICLE_TYPES) { assert.ok(LUMEN_PROP_TYPES[type], type + ' is a prop type'); assert.ok(LUMEN_MODELS.has(type), type + ' has a model'); }
  for (const [name, t] of Object.entries(LUMEN_PROP_TYPES)) if (['car', 'van', 'wreck', 'bike'].includes(t.look)) assert.ok(L.VEHICLE_TYPES.includes(name), `${name} is vehicle-like but not listed`);
  for (const type of L.INTACT_CARS) assert.ok(L.CAR_RIG[type], type + ' has a rig');
  // The rig repeats the collision box it must fill.
  for (const type of L.INTACT_CARS) { const b = LUMEN_PROP_TYPES[type].collisionBoxes[0], r = L.CAR_RIG[type]; assert.deepEqual([r.L, r.W, r.H], [b[2], b[3], b[4]], type); }
});

test('each model fills its collision boxes and stays inside them (+0.1 m), doors and debris apart', () => {
  const list = [...VEHICLES, ...L.INTACT_CARS.flatMap(t => VEHICLES.some(p => p.type === t) ? [] : synthetic(t)), ...synthetic('cityMotorbike', 2)];
  assert.ok(VEHICLES.length >= 35, 'the map has its cars');
  for (const p of list) {
    const type = LUMEN_PROP_TYPES[p.type], { g } = build(p), b = boundsOf(g);
    const boxes = type.collisionBoxes.map(([x, z, w, d, h]) => new THREE.Box3(new THREE.Vector3(x - w / 2, 0, z - d / 2), new THREE.Vector3(x + w / 2, h, z + d / 2)));
    const outer = boxes.reduce((a, c) => a.union(c), new THREE.Box3()), grown = outer.clone().expandByScalar(.1);
    const where = `${p.type} at ${p.x},${p.z}`;
    assert.ok(b.min.x >= grown.min.x - 1e-6 && b.max.x <= grown.max.x + 1e-6 && b.min.z >= grown.min.z - 1e-6 && b.max.z <= grown.max.z + 1e-6, `${where} outside its box: ${b.min.toArray().map(v => v.toFixed(2))} .. ${b.max.toArray().map(v => v.toFixed(2))}`);
    assert.ok(b.max.y <= outer.max.y + .1 + 1e-6, `${where} too tall (${b.max.y.toFixed(2)} of ${outer.max.y})`);
    // Each part sits in (or by) one of the boxes.
    const near = boxes.map(x => x.clone().expandByScalar(.12));
    for (const m of meshes(g)) { const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()); assert.ok(near.some(x => x.containsPoint(c)), `${where}: a part is outside every box (${c.toArray().map(v => v.toFixed(2))})`); }
    // It fills: the extent is most of the box (cars are wedges, wrecks are crumpled: 80%).
    const fill = (b.max.x - b.min.x) / (outer.max.x - outer.min.x), fillZ = (b.max.z - b.min.z) / (outer.max.z - outer.min.z), fillY = b.max.y / outer.max.y;
    assert.ok(fill >= .8 && fillZ >= .8 && fillY >= (p.type === 'cityMotorbike' ? .7 : .75), `${where} does not fill its box (${fill.toFixed(2)}, ${fillZ.toFixed(2)}, ${fillY.toFixed(2)})`);
  }
});

test('the shopfront car throws its glass and rubble across the sidewalk: flat, walk-over, and only there', () => {
  const car = LUMEN_PROPS.find(p => p.x === SHOPFRONT_CAR.x && p.z === SHOPFRONT_CAR.z), { g } = build(car);
  const debris = g.children.find(c => c.userData.debris);
  assert.ok(debris && debris.children.length >= 15, 'a fan of pieces');
  const b = new THREE.Box3().setFromObject(debris);
  assert.ok(b.max.y < .07, 'nothing to trip on: ' + b.max.y);
  for (const other of VEHICLES.filter(p => p !== car && L.INTACT_CARS.includes(p.type)).slice(0, 6)) assert.ok(!build(other).g.children.some(c => c.userData.debris), 'debris only at the shopfront');
});

test('models are chunky low poly: a few hundred to a thousand triangles a car, and no two alike', () => {
  const seen = new Map();
  let total = 0;
  for (const p of VEHICLES) {
    const { g } = build(p), tris = trisOf(g);
    total += tris;
    const cap = p.type === 'cityPileup' ? 2600 : p.type === 'cityTruck' ? 1900 : p.type === 'cityMotorbike' ? 500 : 1500;
    assert.ok(tris > (p.type === 'cityMotorbike' ? 100 : 300) && tris <= cap, `${p.type} at ${p.x},${p.z}: ${tris} triangles`);
    const key = signature(g); assert.ok(!seen.has(key), `${p.type} at ${p.x},${p.z} is identical to ${seen.get(key)}`); seen.set(key, `${p.type} ${p.x},${p.z}`);
  }
  // The whole map's cars: well under the +25k the Crossroads may add across a view.
  assert.ok(total < 40000, `${total} triangles in all the cars`);
  // One mesh count, and every part a plain colour (so the static batcher merges them).
  const { g } = build(VEHICLES.find(p => p.type === 'citySedan'));
  for (const m of meshes(g, { all: true })) assert.ok(m.material.userData.hex || m.geometry.attributes.color, 'a part with no plain colour and no vertex colours');
});

test('Potato and Performance keep to the big shapes: a lean car has well under the full one\'s triangles and the same footprint', () => {
  for (const type of ['citySedan', 'cityCompact', 'citySuv', 'cityTaxi', 'cityVan']) {
    const prop = { type, x: 900, z: 900, angle: 0 };
    const full = build(prop, 'quality'), lean = build(prop, 'potato'), perf = build(prop, 'performance');
    assert.ok(trisOf(lean.g) < trisOf(full.g) * (type === 'cityVan' ? .92 : .88), `${type}: ${trisOf(lean.g)} of ${trisOf(full.g)}`);
    assert.equal(trisOf(perf.g), trisOf(lean.g));
    const a = boundsOf(full.g), b = boundsOf(lean.g);
    assert.ok(Math.abs(a.max.x - b.max.x) < .1 && Math.abs(a.max.z - b.max.z) < .1 && Math.abs(a.max.y - b.max.y) < .1, type + ' bounds');
  }
});

test('the seeded damage shows: dents, cracks, flat tyres, open and missing doors, differing colours', () => {
  const seen = { cracked: 0, open: 0 }, colours = new Set();
  for (const p of VEHICLES.filter(q => L.INTACT_CARS.includes(q.type))) {
    const { g, view } = build(p);
    if (meshes(g, { all: true }).some(m => m.material.userData.hex === VEHICLE_COLOURS.crack)) seen.cracked++;
    if (g.children.some(c => c.userData.door)) seen.open++;
    colours.add(p.type + g.userData.bodyColour);
  }
  assert.ok(seen.cracked >= 5, 'cracked windscreens: ' + seen.cracked);
  assert.ok(seen.open >= 4 && seen.open <= 14, 'open doors: ' + seen.open);
  assert.ok(colours.size >= 12, 'colours across the cars: ' + colours.size);
});

test('an open door swings onto no sidewalk, into no building, and the three hazard cars stand with theirs open', () => {
  const walks = ROADS.flatMap(r => roadGeometry(r).walks);
  const inside = (poly, x, z) => { let s = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > z) !== (poly[j][1] > z) && x < (poly[j][0] - poly[i][0]) * (z - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) s = !s; return s; };
  let opened = 0;
  for (const p of VEHICLES) {
    const st = L.stateOf(p), plan = Vehicles.doorPlan(st);
    if (!plan) continue;
    opened++;
    const c = Math.cos(st.angle), s = Math.sin(st.angle);
    for (const t of [.25, .5, .75, 1]) {
      const lx = plan.hinge - plan.len * t * Math.cos(plan.phi), lz = plan.side * (plan.hw + plan.len * t * Math.sin(plan.phi));
      const wx = st.x + lx * c + lz * s, wz = st.z - lx * s + lz * c;
      assert.ok(!walks.some(w => inside(w, wx, wz)), `${p.type} at ${p.x},${p.z}: its door lands on a sidewalk at ${wx.toFixed(1)},${wz.toFixed(1)}`);
    }
  }
  assert.ok(opened >= 4, 'cars with a door open: ' + opened);
  const states = [...L.vehicleStates().values()];
  const hazards = states.filter(s => s.scene === 'hazard' || s.scene === 'alarm');
  assert.ok(hazards.length >= 3);
  assert.ok(hazards.filter(s => Vehicles.doorPlan(s)).length >= 2, 'the abandoned cars mostly stand with a door open');
});

test('colours: every vehicle, light and effect colour keeps clear of the team colours', () => {
  const colours = new Set(COLOUR_LIST);
  for (const p of [...VEHICLES, ...L.INTACT_CARS.flatMap(t => synthetic(t, 3))]) { const { view } = build(p); for (const c of view.colours) colours.add(c); }
  const bad = [...colours].filter(c => c.startsWith('#') && teamGap(c) < CLEAR).map(c => `${c} ${teamGap(c).toFixed(1)}`);
  assert.deepEqual(bad, [], 'too close to a team colour');
  for (const c of [...Object.values(L.VEHICLE_LIGHTS).filter(v => typeof v === 'string' && v.startsWith('#')), ...Object.values(BUS_LOOK).filter(v => typeof v === 'string' && v.startsWith('#')), W.WRECKS.arc.colour, W.WRECKS.spark.colour, W.WRECKS.ember.colour, W.WRECKS.smoke.colour, W.WRECKS.smoke.root, W.WRECKS.wisp.colour, '#8aa2e8', '#fff2b0', '#e6f0ff', '#ff3040'])
    assert.ok(teamGap(c) >= CLEAR, `${c} is ${teamGap(c).toFixed(1)} from a team colour`);
  // The lit parts' vertex colours (litBox) too.
  for (const p of [VEHICLES.find(q => q.type === 'cityTaxi'), ...L.INTACT_CARS.map(t => VEHICLES.find(q => q.type === t)).filter(Boolean)]) {
    const { g } = build(p);
    for (const m of meshes(g, { all: true })) if (m.geometry.attributes.color) { const c = new THREE.Color().fromArray(m.geometry.attributes.color.array, 0); c.multiplyScalar(1 / Math.max(1, c.r, c.g, c.b)); assert.ok(teamGap('#' + c.getHexString()) >= CLEAR, 'a lit part near a team colour'); }
  }
});

// --- The lights -------------------------------------------------------------------------
test('the vehicle light list: known kinds, lemon hazards that blink, red tails, white heads, no team colours', () => {
  const list = L.lumenVehicleLights();
  assert.ok(list.length >= 40 && list.length <= 130, 'entries: ' + list.length);
  const seen = new Set();
  for (const e of list) {
    assert.equal(e.kind, 'panel', e.id);
    assert.ok(!seen.has(e.id), 'duplicate id ' + e.id); seen.add(e.id);
    assert.ok(e.at.length === 3 && e.at.every(Number.isFinite) && Number.isFinite(e.facing) && e.w > 0 && e.h > 0, e.id);
    assert.equal(e.breakable, false, e.id);
    assert.ok(teamGap(e.colour) >= CLEAR, `${e.id} ${e.colour}`);
  }
  const hazards = list.filter(e => e.id.startsWith('car-hazard'));
  assert.ok(hazards.length >= 12 && hazards.length % 4 === 0);
  for (const e of hazards) { assert.equal(e.mode, 'blink'); assert.equal(hexOf(e.colour).toLowerCase(), '#fcee0a'); assert.ok(.9 + 1.2 * e.seed > .95 && .9 + 1.2 * e.seed < 1.15, 'about 1 Hz'); }
  assert.ok(list.filter(e => e.id.startsWith('car-head')).every(e => e.colour === 'coldWhite' && e.emitter));
  assert.ok(list.filter(e => e.id.startsWith('car-tail')).every(e => e.colour === 'red'));
  assert.ok(list.filter(e => e.emitter).length <= 60, 'emitters stay few: ' + list.filter(e => e.emitter).length);
  // The bus's window light stutters together; the smouldering car's glow flickers; the EV's sills and the cable's end flicker.
  assert.ok(list.filter(e => e.id.startsWith('bus-window')).every(e => e.mode === 'flicker'));
  for (const id of ['cable-glow']) assert.ok(list.some(e => e.id === id && e.mode === 'flicker'));
  assert.ok(list.some(e => e.id.startsWith('wreck-glow') && e.mode === 'flicker'));
  assert.equal(list.filter(e => e.id.startsWith('ev-sill')).length, 2);
});

test('the list goes into the signs system and comes out as emitters (breakable: false costs no break slot)', () => {
  const list = L.lumenVehicleLights();
  const scene = new THREE.Scene(), view = { scene, qualityName: 'balanced', camera: new THREE.PerspectiveCamera(), focus: new THREE.Vector3() };
  const city = new CityFeatures(view, { ...cityTest, citySigns: list, city: { signs: true } });
  const signs = city.signs;
  assert.equal(signs.pieces.length, 1, 'no break slots used');
  assert.equal(signs.emitters.length, list.filter(e => e.emitter).length);
  // The blinking hazards and flickering glows get pool cards; the steady heads do not (their cones are painted).
  assert.ok(signs.emitters.filter(e => e.pool).length >= 8);
  for (const e of signs.emitters) assert.ok(teamGap('#' + e.colour.getHexString()) >= CLEAR - 1, 'emitter colour');
});

test('headlight cones are painted on the road ahead of every steady head bar', () => {
  const pools = L.lumenVehiclePools(), states = [...L.vehicleStates().values()].filter(s => s.head && !s.alarm);
  assert.equal(pools.length, states.length);
  assert.ok(pools.length >= 5);
  for (const p of pools) { assert.ok(POOL_TONES[p.tone]); assert.ok(p.rx > p.rz && p.strength > 0 && p.strength <= 1 && [p.x, p.z, p.angle].every(Number.isFinite)); }
  poolShapes(pools); // (the ground accepts them)
  for (const s of states) {
    const rig = L.CAR_RIG[s.type], nose = [s.x + Math.cos(s.angle) * rig.L / 2, s.z - Math.sin(s.angle) * rig.L / 2];
    const pool = pools.filter(p => Math.hypot(p.x - nose[0], p.z - nose[1]) < L.VEHICLE_LIGHTS.pool.ahead + .2).sort((a, b) => Math.hypot(a.x - nose[0], a.z - nose[1]) - Math.hypot(b.x - nose[0], b.z - nose[1]))[0];
    assert.ok(pool, `no cone ahead of ${s.type} at ${s.x},${s.z}`);
    assert.ok(Math.abs(Math.cos(pool.angle + s.angle)) > .999, 'the cone lies along the car');
  }
});

test('the scenes find the same cars as the soundscape', () => {
  const states = [...L.vehicleStates().values()], by = scene => states.filter(s => s.scene === scene);
  const S = LUMEN_SITES, nearest = (list, [x, z]) => list.reduce((a, c) => Math.hypot(c.x - x, c.z - z) < Math.hypot(a.x - x, a.z - z) ? c : a);
  const cars = states.filter(s => /^city(Compact|Sedan|Suv|Taxi|Sports|Van|Truck|Wreck|Pileup)$/.test(s.type));
  assert.equal(by('alarm')[0], nearest(cars.filter(s => s.type === 'citySedan'), S.alarm.near));
  assert.equal(by('ev')[0], nearest(cars.filter(s => s.type === 'cityCompact'), S.ev.near));
  assert.deepEqual(new Set(by('hazard').concat(by('alarm'))).size >= 3, true);
  for (const spot of S.hazards) { const c = nearest(cars, spot); assert.ok(c.hazard || !L.INTACT_CARS.includes(c.type), `the hazard car near ${spot}`); }
  assert.equal(by('shopfront')[0].x, SHOPFRONT_CAR.x);
  assert.ok(Math.hypot(by('pileup')[0].x - S.smoulder.x, by('pileup')[0].z - S.smoulder.z) < .5);
  // The wreck effects' cues are the sound's: same hash, same sites and periods.
  for (const [a, b, c] of [[10, 3, 7], [11, 5, 7], [1234, 99, 3]]) assert.equal(W.hash01(a, b, c), soundHash(a, b, c));
  assert.equal(W.WRECKS.bursts.ev.period, S.ev.period); assert.equal(W.WRECKS.bursts.ev.spread, S.ev.spread);
  assert.equal(W.WRECKS.bursts.cable.period, S.cable.period); assert.equal(W.WRECKS.bursts.cable.spread, S.cable.spread);
  // lastBurst is the latest of slotFire's events.
  for (const clock of [3.2, 17.9, 402.5]) for (const [key, site] of [['ev', 10], ['cable', 11]]) {
    const B = W.WRECKS.bursts[key], t = W.lastBurst(B.site, clock, B.period, B.spread);
    assert.ok(t <= clock && clock - t < B.period + B.spread, `${key} at ${clock}: ${t}`);
    assert.equal(slotFire(site, t - 1e-6, t, B.period, B.spread), t);
    assert.ok(Number.isNaN(slotFire(site, t, clock, B.period, B.spread)) || clock === t, 'no later event before the clock');
  }
});

// --- The bus ------------------------------------------------------------------------------
test('the bus is dressed outside its walls, with its door openings empty and no collider', () => {
  const view = fakeView(), host = new THREE.Group();
  const g = Vehicles.makeLumenBus(view, host);
  assert.equal(host.children.length, 1); g.updateMatrixWorld(true);
  const B = L.BUS, out = B.hw + B.wall;
  let parts = 0;
  for (const m of meshes(g, { all: true })) {
    parts++;
    const b = new THREE.Box3().setFromObject(m);
    // (in the bus's frame; the group is rotated, so bring the box back)
    const inv = g.matrixWorld.clone().invert(), local = new THREE.Box3();
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) local.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(inv));
    void local;
  }
  assert.ok(parts >= 60, 'parts: ' + parts);
  // In the bus's own frame every part: within 0.35 m of the shell's outer faces (skin, not mass), nothing in a door opening.
  const frame = new THREE.Matrix4().copy(g.matrixWorld).invert();
  let worst = 0;
  for (const m of meshes(g, { all: true })) {
    const pos = m.geometry.attributes.position, v = new THREE.Vector3();
    m.updateMatrixWorld(true);
    const toBus = new THREE.Matrix4().multiplyMatrices(frame, m.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(toBus);
      worst = Math.max(worst, Math.abs(v.x) - (B.hl + B.wall), Math.abs(v.z) - out);
      for (const d of B.doors) {
        const inOpening = Math.abs(v.x - d.x) < d.width / 2 - .02 && v.y > .03 && v.y < 2.5 && Math.abs(v.z) > out - .3;
        assert.ok(!inOpening, `a part stands in the door opening at x ${d.x.toFixed(2)}: ${v.toArray().map(q => q.toFixed(2))}`);
      }
    }
  }
  assert.ok(worst < .5, 'a part stands ' + worst.toFixed(2) + ' m off the bus');
  // Not more than a few thousand triangles a side; lit parts in litBox only.
  assert.ok(trisOf(g) < 6000, 'bus triangles ' + trisOf(g));
  // The cable is on the road, walk-over: nothing above head height except its rise to the pole stump.
  const cable = Vehicles.makeLumenCable(view, host);
  assert.ok(new THREE.Box3().setFromObject(cable).max.y < 1.6);
});

// --- The wreck scenes -----------------------------------------------------------------------------
function makeWrecks(quality) {
  const scene = new THREE.Scene(), view = { scene, qualityName: quality, camera: new THREE.PerspectiveCamera(), focus: new THREE.Vector3(6, 0, 0) };
  const city = new CityFeatures(view, { ...cityTest, props: LUMEN_PROPS, city: { wrecks: true } });
  return { city, view, scene, wrecks: city.wrecks };
}

test('the wreck system builds two meshes with their programs ready, and sizes its pools by preset', () => {
  const rows = {};
  for (const q of ['potato', 'performance', 'balanced', 'quality', 'extreme']) {
    const { wrecks, scene } = makeWrecks(q);
    assert.ok(wrecks, q);
    const meshesOf = [wrecks.smoke, wrecks.glow];
    for (const m of meshesOf) { assert.ok(scene.children.includes(m) && m.material.isShaderMaterial && m.material.customProgramCacheKey().startsWith('lumen-wreck')); assert.equal(m.visible, false); assert.ok(m.geometry.instanceCount > 0); }
    const u = wrecks.glow.material.uniforms.uCount.value, s = wrecks.smoke.material.uniforms.uCount.value;
    rows[q] = [s.x, s.y, u.x, u.y, u.z];
    assert.deepEqual([s.x, s.y, u.x, u.y, u.z], [W.WRECKS.presets[q].smoke, W.WRECKS.presets[q].wisp, W.WRECKS.presets[q].arcs, W.WRECKS.presets[q].sparks, W.WRECKS.presets[q].embers]);
    assert.ok(wrecks.glow.layers.isEnabled(3), 'the glow is reflected by the mirror');
  }
  // Extreme most, Potato none or few; each step never less.
  const order = ['potato', 'performance', 'balanced', 'quality', 'extreme'];
  for (let i = 1; i < order.length; i++) rows[order[i]].forEach((v, k) => assert.ok(v >= rows[order[i - 1]][k], `${order[i]} column ${k}`));
  assert.ok(Math.max(...rows.potato) <= 5 && rows.potato[4] === 0);
  // The instance pools hold Extreme's counts and no more.
  const { wrecks } = makeWrecks('extreme');
  assert.ok(wrecks.smoke.geometry.instanceCount <= 60 && wrecks.glow.geometry.instanceCount <= 140, `${wrecks.smoke.geometry.instanceCount} / ${wrecks.glow.geometry.instanceCount}`);
});

test('the scenes stand where the models and the sound expect them', () => {
  const { wrecks } = makeWrecks('quality'), S = wrecks.scenes;
  const pileup = LUMEN_PROPS.find(p => p.type === 'cityPileup');
  assert.ok(Math.hypot(S.pileup.hood[0] - pileup.x - L.PILEUP.hood[0], S.pileup.hood[2] - pileup.z - L.PILEUP.hood[2]) < 1e-6);
  assert.ok(Math.hypot(S.ev.x - LUMEN_SITES.ev.near[0], S.ev.z - LUMEN_SITES.ev.near[1]) < .5, 'the EV is the sound scene\'s');
  assert.ok(Math.hypot(S.cable.x - LUMEN_SITES.cable.x, S.cable.z - LUMEN_SITES.cable.z) < 5, 'the cable end is within earshot of its sound');
  assert.ok(Math.hypot(S.shopfront.x - SHOPFRONT_CAR.x, S.shopfront.z - SHOPFRONT_CAR.z) < .3);
  // Every instance is finite.
  for (const geometry of [wrecks.smoke.geometry, wrecks.glow.geometry]) for (const a of Object.values(geometry.attributes)) assert.ok(a.array.every(Number.isFinite));
});

test('the wreck system updates without allocating; meshes show only near a scene', () => {
  const { wrecks, view } = makeWrecks('extreme');
  const frame = { clock: 0, elapsed: 0, dt: 1 / 60, focus: view.focus };
  const step = () => { frame.clock += 1 / 60; frame.elapsed = frame.clock; wrecks.update(frame); };
  view.focus.set(6, 0, 0); step();
  assert.equal(wrecks.smoke.visible, true, 'the pileup is within reach of the Crossroads');
  view.focus.set(-15, 0, 80); step();
  assert.equal(wrecks.glow.visible, true, 'the charging lot is in reach at the EV');
  assert.equal(wrecks.smoke.visible, false, 'the smoke columns are out of reach at the far side of the charging lot');
  view.focus.set(-60, 0, -50); step();
  assert.equal(wrecks.smoke.visible || wrecks.glow.visible, false, 'nothing drawn far from every scene');
  view.focus.set(6, 0, 0);
  v8.setFlagsFromString('--expose-gc'); const gc = vm.runInNewContext('gc');
  for (let k = 0; k < 1500; k++) step();
  gc(); const before = process.memoryUsage().heapUsed;
  for (let k = 0; k < 6000; k++) step();
  gc(); const grown = process.memoryUsage().heapUsed - before;
  assert.ok(grown < 250 * 1024, `the heap grew ${(grown / 1024).toFixed(0)} KB over 6000 frames`);
  // The uniforms follow the clock, and the burst times are the last events.
  assert.equal(wrecks.smoke.material.uniforms.uClock.value, frame.clock);
  const b = wrecks.glow.material.uniforms.uBurst.value;
  assert.ok(b.x <= frame.clock && b.y <= frame.clock && frame.clock - b.x < 2.5 && frame.clock - b.y < 2.1);
  // A shown scene is warmed by the warm-up.
  wrecks.smoke.visible = wrecks.glow.visible = false; wrecks.warm(); assert.ok(wrecks.smoke.visible && wrecks.glow.visible);
});
