// Lumen stage 5 (s3): the holographic ads (effects/lumen-holograms.js) and the
// life in the lights (effects/lumen-lights-life.js). Checks design 12, 13 and
// the stage 5 brief: built once with their programs, instanced, sized by preset,
// never over the play, cut with their buildings and gone over your room, faint
// over a player, no team colour at their glow, nothing allocated per frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import vm from 'node:vm';
import * as THREE from 'three';
import { HOLOGRAMS, HOLOGRAM_SHAPES, LumenHolograms, hologramShape, hologramInstances, lowestPoint, glitchStart, glitchLevel, insideQuad } from '../src/effects/lumen-holograms.js';
import { LIGHTS_LIFE, LumenLightsLife, lightsWithLife, lifeInstances } from '../src/effects/lumen-lights-life.js';
import { CITY_SYSTEMS } from '../src/render/city-registry.js';
import { NEON } from '../src/render/city-signs.js';
import { slotFire } from '../src/audio-lumen.js';
import { lumen } from '../src/maps/lumen.js';
import { OUTLINE } from '../src/maps/lumen-layout.js';
import { acesFilmic, deltaE2000, hexLinear, hexRgb, lab, toSrgb } from '../src/render/look-contrast.js';

const PRESETS = ['potato', 'performance', 'balanced', 'quality', 'extreme'];
const TEAMS = [['amber', '#ffb020'], ['cyan', '#2ee6ff'], ['violet', '#b77bff']].map(([k, h]) => [k, lab(hexRgb(h))]);
// A colour drawn at an HDR gain: clamped, and through ACES (as the screen shows it), its gap to each team colour.
function teamGaps(label, hex, gains) {
  const close = [], lin = hexLinear(hex);
  for (const g of gains) for (const shown of [lin.map(q => Math.min(1, q * g)).map(toSrgb), acesFilmic(lin.map(q => q * g), 1).map(toSrgb)])
    for (const [k, t] of TEAMS) { const d = deltaE2000(lab(shown), t); if (d < 15) close.push(`${label} ${hex} x${g}: ${d.toFixed(1)} from ${k}`); }
  return close;
}
const inPolygon = (x, z, poly) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside; } return inside; };

// A city stand-in: the uniforms the systems read, the shells' slots and cut, a recording signs system.
function stubCity({ hides = () => false } = {}) {
  const slots = new Map(lumen.cityBuildings.map((b, i) => [b.id, i + 1]));
  const calls = [];
  const signs = { addPole: o => calls.push(['pole', o]), addPanel: o => calls.push(['panel', o]), finish: () => calls.push(['finish']) };
  return { calls, city: { uniforms: { time: { value: 0 }, rain: { value: 0 }, sag: { value: 0 }, cityRoomOn: { value: 0 }, cityRoomQuad: { value: new Float32Array(8) } }, shells: { slots, cut: { hides } }, signs, emitters: [] } };
}
function makeHolograms(quality = 'quality', opts) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), focus = new THREE.Vector3(6, 0, 0);
  const view = { scene, camera, focus, qualityName: quality };
  const { city, calls } = stubCity(opts);
  const holo = new LumenHolograms(view, lumen, city);
  return { holo, view, city, calls, scene };
}
const frameAt = (view, holo, over = {}) => ({ clock: 10, elapsed: 10, dt: 1 / 60, camera: view.camera, focus: view.focus, player: null, others: [], ...over });
// Park the camera where the game's would be for a focus (29 m up, tilted from the south).
const aim = (view, x, z) => { view.focus.set(x, 0, z); view.camera.position.set(x, 29, z + 10.2); view.camera.lookAt(x, 0, z); view.camera.updateMatrixWorld(); };

test('holograms: one instanced mesh, its program keyed and built at load, on the mirror\'s bright layer; counts by preset', () => {
  const rows = [];
  for (const q of PRESETS) {
    const { holo, scene } = makeHolograms(q);
    const m = holo.mesh;
    assert.ok(scene.children.includes(m) && m.material.isShaderMaterial && m.material.customProgramCacheKey() === 'lumen-holograms-v1');
    assert.equal(m.visible, false, 'hidden until an update shows it');
    assert.ok(m.layers.isEnabled(3), 'the mirror reflects it (BRIGHT_LAYER)');
    assert.equal(m.geometry.instanceCount, holo.firsts[HOLOGRAMS.presets[q].count]);
    rows.push([HOLOGRAMS.presets[q].count, HOLOGRAMS.presets[q].tier, m.geometry.instanceCount]);
    assert.equal(scene.children.filter(o => o.isMesh).length, 1, 'one draw');
  }
  for (let i = 1; i < rows.length; i++) rows[i].forEach((v, k) => assert.ok(v >= rows[i - 1][k], `${PRESETS[i]} is ${PRESETS[i - 1]} plus`));
  assert.deepEqual(rows[0], [0, -1, 0], 'Potato draws none');
  assert.ok(rows[1][0] >= 2 && rows[1][0] <= 4, 'Performance a few');
  assert.equal(rows[4][0], HOLOGRAMS.list.length, 'Extreme all');
  // A modest instance pool: a quad per stroke segment.
  assert.ok(rows[4][2] < 2000, `${rows[4][2]} instances`);
  const { rows: inst } = hologramInstances();
  for (const r of inst) assert.ok(r.every(Number.isFinite));
});

test('holograms: every shape builds, strokes in its unit frame, the flat ones with their pictogram fill', () => {
  for (const name of HOLOGRAM_SHAPES) {
    const s = hologramShape(name);
    assert.ok(s.segs.length >= 20, `${name}: ${s.segs.length} strokes`);
    assert.ok(s.segs.some(g => g.tier === 0) && s.segs.every(g => [0, 1, 2, 3].includes(g.tier)), name);
    for (const g of s.segs) for (const p of [g.a, g.b]) assert.ok(p.every(v => Math.abs(v) <= .75), `${name} ${p}`);
  }
  for (const name of ['heart', 'eye', 'cocktail', 'bowl']) assert.equal(hologramShape(name).fills.length, 1, name);
  for (const h of HOLOGRAMS.list) assert.ok(HOLOGRAM_SHAPES.includes(h.shape), h.id);
});

test('holograms: high over the play (lowest point above 4.5 m), over the playable city, their projectors on real buildings', () => {
  const ids = new Set(lumen.cityBuildings.map(b => b.id));
  for (const h of HOLOGRAMS.list) {
    assert.ok(lowestPoint(h) >= HOLOGRAMS.minBottom, `${h.id}: its foot at ${lowestPoint(h).toFixed(2)} m`);
    assert.ok(inPolygon(h.at[0], h.at[2], OUTLINE), `${h.id} over the playable area`);
    assert.ok(h.lens[1] < h.at[1], `${h.id}: the projector below its picture`);
    if (h.building) assert.ok(ids.has(h.building), `${h.id} on ${h.building}`);
    assert.ok(h.size >= 1.5 && h.size <= 4.5, h.id);
  }
  // Named places: the Uptown plaza, the Crossroads' gantry, Metro Plaza, the Flatiron, Velvet Row, the Night Market.
  const near = (x, z, r) => HOLOGRAMS.list.some(h => Math.hypot(h.at[0] - x, h.at[2] - z) < r);
  for (const [name, x, z] of [['uptown', 46, -28], ['gantry', 6, -4.6], ['metro', 27, 42], ['flatiron', 33, 11], ['velvet', -42, 44], ['market', -13, -40]]) assert.ok(near(x, z, 5), name);
});

test('holograms: no team colour at their glow (strokes, cores, fills, beams), all from the signs\' NEON palette', () => {
  const close = [];
  for (const h of HOLOGRAMS.list) for (const key of [h.colour, h.core || h.colour]) {
    assert.ok(NEON[key], `${h.id}: ${key} is a NEON name`);
    close.push(...teamGaps(h.id, NEON[key], [1, HOLOGRAMS.gain, HOLOGRAMS.gain * 1.3])); // (x1.3: two strokes crossing)
  }
  assert.deepEqual(close.slice(0, 8), [], `${close.length} too near a team colour`);
});

test('holograms: cut with their building, gone over your room, faint over a player', () => {
  // The club's two are on a cut building (the shells' cut says so): both go; the others stay.
  let cutSlot = 0; const asked = [];
  const { holo, view, city } = makeHolograms('extreme', { hides: (slot, x, y, z) => { asked.push([x, y, z]); return slot === cutSlot; } });
  cutSlot = city.shells.slots.get('club');
  const idx = id => HOLOGRAMS.list.findIndex(h => h.id === id);
  aim(view, -45, 40);
  const run = (n, over) => { for (let k = 0; k < n; k++) holo.update(frameAt(view, holo, over)); };
  run(60);
  assert.equal(holo.holos[idx('velvet')].vis, 0, 'the heart over Velvet Row goes with the club');
  assert.equal(holo.holos[idx('club-door')].vis, 0);
  cutSlot = 0; run(60);
  assert.ok(holo.holos[idx('velvet')].vis > .95, 'back when the club is whole');
  const lens = HOLOGRAMS.list[idx('velvet')].lens;
  assert.ok(asked.some(p => p[0] === lens[0] && p[1] === lens[1] && p[2] === lens[2]), 'judged at its projector (a sign on the club): never a picture without its lens');
  // Standing in a room under it (the knee-wall view): the heart's line from the camera lands on the room's floor.
  const q = city.uniforms.cityRoomQuad.value; q.set([-46, 38, -38, 38, -38, 48, -46, 48]); city.uniforms.cityRoomOn.value = 1;
  run(60); assert.equal(holo.holos[idx('velvet')].vis, 0, 'hidden over the room you are in');
  city.uniforms.cityRoomOn.value = 0; run(60);
  // A player it is drawn over: faint, not gone.
  const h = holo.holos[idx('velvet')], cam = view.camera.position, k = (1.2 - cam.y) / (h.y - cam.y);
  const under = new THREE.Vector3(cam.x + (h.x - cam.x) * k, 0, cam.z + (h.z - cam.z) * k);
  run(60, { player: under }); assert.ok(Math.abs(h.vis - HOLOGRAMS.playerFade) < .02, `over the player: ${h.vis}`);
  run(60, { player: null, others: [under] }); assert.ok(Math.abs(h.vis - HOLOGRAMS.playerFade) < .02, 'over someone else too');
  run(60, { player: new THREE.Vector3(h.x + 15, 0, h.z + 15) }); assert.ok(h.vis > .95);
  // Far from the camera's focus: not drawn at all.
  aim(view, 55, -50); run(90);
  assert.equal(holo.holos[idx('velvet')].vis, 0);
  assert.ok(insideQuad([0, 0, 1, 0, 1, 1, 0, 1], .5, .5) && !insideQuad([0, 0, 1, 0, 1, 1, 0, 1], 2, .5) && insideQuad([0, 0, 1, 0, 1, 1, 0, 1], 2, .5, 1.1));
});

test('holograms: projectors are the signs\' pieces (a housing, a lit lens looking up), cut with their buildings, made at load', () => {
  const { calls, city } = makeHolograms('balanced');
  const panels = calls.filter(c => c[0] === 'panel'), poles = calls.filter(c => c[0] === 'pole');
  assert.equal(panels.length, HOLOGRAMS.list.length);
  assert.ok(poles.length >= HOLOGRAMS.list.length);
  assert.deepEqual(calls[calls.length - 1], ['finish'], 'rebuilt once at load');
  for (const [, o] of panels) { assert.equal(o.tilt, 90); assert.ok(!o.breakable); }
  const club = panels.find(([, o]) => o.building === city.shells.slots.get('club'));
  assert.ok(club, 'on the club: its cut slot');
});

test('holograms: the glitches fall on the sound\'s schedule (audio-lumen.js slotFire), a few seconds apart', () => {
  const G = HOLOGRAMS.glitch;
  for (let i = 0; i < 3; i++) {
    let prev = 0, seen = 0;
    for (let t = .05; t < 200; t += .05) {
      const e = slotFire(G.site + i, t - .05, t, G.period, G.spread);
      if (e === e) { assert.ok(Math.abs(glitchStart(i, t) - e) < 1e-9, `hologram ${i} at ${t}`); assert.ok(glitchLevel(i, e + .01) > .9); if (seen) assert.ok(e - prev > 1.5); prev = e; seen++; }
    }
    assert.ok(seen >= 15 && seen <= 30, `${seen} glitches in 200 s`);
  }
});

test('holograms: update allocates nothing', () => {
  const { holo, view } = makeHolograms('extreme');
  aim(view, 6, 0);
  const frame = frameAt(view, holo, { player: new THREE.Vector3(6, 0, 2), others: [new THREE.Vector3(10, 0, -3)] });
  const step = () => { frame.clock += 1 / 60; holo.update(frame); };
  heapFlat(step);
  assert.ok(holo.mesh.visible);
});

// No allocation per frame: the heap barely grows over a thousand frames (the least of five windows, as tests/hollow-life.test.js).
function heapFlat(step) {
  v8.setFlagsFromString('--expose-gc'); const gc = vm.runInNewContext('gc');
  for (let k = 0; k < 4000; k++) step();
  let grown = Infinity;
  for (let w = 0; w < 5 && grown >= 256 * 1024; w++) { gc(); const before = process.memoryUsage().heapUsed; for (let k = 0; k < 1000; k++) step(); grown = process.memoryUsage().heapUsed - before; }
  assert.ok(grown < 256 * 1024, `grew ${(grown / 1024).toFixed(0)} KB over 1000 frames`);
}

// --- Life in the lights ------------------------------------------------------------------------
function emitterList() {
  const out = [];
  for (let i = 0; i < 40; i++) out.push({ x: i * 3, y: 6.7, z: 10, kind: 'lamp', colour: new THREE.Color('#e6f0ff'), source: [0, i === 5 ? 4 : 0, .3, i] });
  for (let i = 0; i < 30; i++) out.push({ x: i * 2, y: i % 2 ? 3.5 : 12, z: -8, kind: 'neon', colour: new THREE.Color('#ff2d8a'), source: [0, 0, .2, 100 + i] });
  out.push({ x: 0, y: 1, z: 0, kind: 'screen', colour: new THREE.Color('#ffffff') });
  return out;
}
test('lights life: swarms at most lamps (not the dead) and some low neon, one mesh, none on Potato and Performance', () => {
  const emitters = emitterList(), lights = lightsWithLife(emitters);
  const lamps = lights.filter(l => l.lamp), neon = lights.filter(l => !l.lamp);
  assert.ok(lamps.length >= 20 && lamps.length < 40, `${lamps.length} lamps`);
  assert.ok(!lights.some(l => l.x === 15 && l.lamp), 'the dead lamp has none');
  assert.ok(neon.length >= 1 && neon.every(l => l.y <= LIGHTS_LIFE.neonMaxHeight), 'only low neon');
  for (const q of PRESETS) {
    const scene = new THREE.Scene(), view = { scene, qualityName: q };
    const life = new LumenLightsLife(view, lumen, { uniforms: { rain: { value: 0 }, sag: { value: 0 } }, emitters });
    const m = life.mesh, P = LIGHTS_LIFE.presets[q];
    assert.ok(scene.children.includes(m) && m.material.customProgramCacheKey() === 'lumen-lights-life-v1' && m.material.blending === THREE.AdditiveBlending);
    assert.deepEqual([m.material.uniforms.uCount.value.x, m.material.uniforms.uCount.value.y], [P.moths, P.mist]);
    life.update({ clock: 3, dt: 1 / 60 });
    assert.equal(m.visible, P.moths > 0, q);
    assert.equal(m.material.uniforms.uRain, life.material.uniforms.uRain);
    assert.ok(m.geometry.instanceCount <= lights.length * LIGHTS_LIFE.maxMoths + lights.length);
    if (q === 'extreme') { heapFlat(() => life.update({ clock: 3, dt: 1 / 60 })); assert.ok(life.sites.length === lights.length * 2); }
  }
  assert.equal(LIGHTS_LIFE.presets.potato.moths + LIGHTS_LIFE.presets.performance.moths, 0);
  const rows = lifeInstances(lights);
  for (const r of rows) assert.ok(r.every(Number.isFinite));
  for (const hex of [LIGHTS_LIFE.moth.colour, LIGHTS_LIFE.mist.colour]) assert.deepEqual(teamGaps('lights life', hex, [1, LIGHTS_LIFE.moth.gain]), []);
});

test('the three systems register with the hub and only come up for a city map that is Lumen or asks for them', () => {
  const flags = CITY_SYSTEMS.map(e => e[0]);
  for (const f of ['holograms', 'lightLife']) assert.ok(flags.includes(f), f);
  const make = flag => CITY_SYSTEMS.find(e => e[0] === flag)[1];
  const view = { scene: new THREE.Scene(), qualityName: 'balanced', camera: new THREE.PerspectiveCamera(), focus: new THREE.Vector3() };
  const city = stubCity().city;
  assert.equal(make('holograms')(view, { id: 'city-test', city: {} }, city), null);
  assert.ok(make('holograms')(view, lumen, city));
  assert.equal(make('holograms')(view, { ...lumen, city: { ...lumen.city, holograms: false } }, city), null);
  assert.equal(make('lightLife')(view, { id: 'city-test', city: {} }, city), null);
});
