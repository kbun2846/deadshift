// Lumen stage 5 (s3): the interiors' life and the bus's doors
// (effects/lumen-interior-life.js), and the new sounds that go with them and
// with the holograms and the lamps' insects (audio-lumen.js startLife,
// lumen-ambience.js lifeTick). Checks design 5, 6, 14 and the stage 5 brief:
// every source found from its piece, two instanced meshes built at load, the
// effects following their interiors' visibility, pools sized by preset, no
// team colour at their glow, the doors on the hiss's schedule, nothing
// allocated per frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import vm from 'node:vm';
import * as THREE from 'three';
import { INTERIOR_LIFE, MODES, BUS_DOORS, LumenInteriorLife, interiorLifePlan, busDoorOpen } from '../src/effects/lumen-interior-life.js';
import { HOLOGRAMS } from '../src/effects/lumen-holograms.js';
import { CITY_SYSTEMS } from '../src/render/city-registry.js';
import { BUS, busPoint } from '../src/maps/lumen-vehicle-lights.js';
import { LUMEN_SITES, LumenAmbience } from '../src/lumen-ambience.js';
import { slotFire, compressorAt, newLifeMix, LUMEN_LIFE_SOUND, LumenSound } from '../src/audio-lumen.js';
import { lumen } from '../src/maps/lumen.js';
import { acesFilmic, deltaE2000, hexLinear, hexRgb, lab, toSrgb } from '../src/render/look-contrast.js';

const PRESETS = ['potato', 'performance', 'balanced', 'quality', 'extreme'];
const plan = interiorLifePlan(lumen);
const MODE_NAME = Object.fromEntries(Object.entries(MODES).map(([k, v]) => [v, k]));
const glowOf = mode => plan.glow.filter(r => r[3] === MODES[mode]);
const buildingOf = r => plan.buildings[r[12]];

// A city stand-in: the shells' interiors (a group each, shown or not), the shared uniforms.
function stubCity() {
  const interiors = new Map();
  for (const b of lumen.cityBuildings) interiors.set(b.id, { group: new THREE.Group(), doors: [], slot: 1 });
  for (const e of interiors.values()) e.group.visible = false;
  return { uniforms: { time: { value: 0 }, sag: { value: 0 } }, shells: { interiors } };
}
function makeLife(quality = 'quality') {
  const scene = new THREE.Scene(), view = { scene, qualityName: quality, focus: new THREE.Vector3(6, 0, 0) }, city = stubCity();
  return { life: new LumenInteriorLife(view, lumen, city), view, city, scene };
}

test('interior life: every source found from its piece, in its building', () => {
  const puffs = k => plan.puffs.filter(r => r[3] === k && r[5] === 0);
  const steamIn = new Set(puffs(0).map(r => plan.buildings[r[6]]));
  for (const id of ['noodle-bar', 'tenement-b', 'stacks-main', 'laundromat', 'hotel']) assert.ok(steamIn.has(id), `steam in ${id}`);
  assert.ok(puffs(0).length >= 8, `${puffs(0).length} pots`);
  assert.deepEqual([...new Set(puffs(1).map(r => plan.buildings[r[6]]))], ['market-hall'], 'the cold room\'s fog');
  const where = mode => new Set(glowOf(mode).map(buildingOf));
  for (const id of ['stacks-main', 'pawn', 'arcade']) assert.ok(where('static').has(id), `a TV of static in ${id}`);
  assert.equal(glowOf('attract').length, 2, 'two cabinets in attract mode'); assert.ok(where('attract').has('arcade'));
  assert.ok(glowOf('pachinko').length >= 60 && glowOf('pachinko').length === glowOf('chase').length, `${glowOf('pachinko').length} machines`);
  assert.deepEqual([...where('pachinko')], ['pachinko']);
  assert.ok(where('leds').has('corporate-tower') && where('leds').has('stacks-main'), 'the server racks');
  assert.ok(where('blink').has('metro-entrance') && where('blink').has('corporate-tower'), 'the gates');
  assert.deepEqual([...where('tiles')], ['club']); assert.equal(glowOf('pool').length, 8); assert.equal(glowOf('beam').length, 8);
  assert.equal(glowOf('drum').length, 2, 'the one machine spinning: its drum and its dial'); assert.deepEqual([...where('drum')], ['laundromat']);
  assert.equal(glowOf('solid').length, 18, 'the headset: cable, shell, visor'); assert.deepEqual([...where('solid')], ['arcade']);
  assert.equal(glowOf('strip').length, 6, 'the bus strip\'s live sections'); assert.deepEqual([...where('strip')], ['bus']);
  assert.equal(glowOf('glass').length, 4 * 6, 'four door leaves'); assert.deepEqual([...where('glass')], ['bus-outside']);
  for (const r of [...plan.puffs, ...plan.glow]) assert.ok(r.every(Number.isFinite));
  for (const r of plan.glow) { const U = r.slice(4, 7), V = r.slice(8, 11); if (r[3] !== MODES.beam) { assert.ok(Math.abs(Math.hypot(...U) - 1) < 1e-6 && Math.abs(Math.hypot(...V) - 1) < 1e-6, MODE_NAME[r[3]]); assert.ok(Math.abs(U[0] * V[0] + U[1] * V[1] + U[2] * V[2]) < 1e-6); } }
  // Every source stands inside its building's footprint (the doors on the bus's flank).
  const rooms = lumen.buildings;
  const inGroup = (id, x, z, grow = .3) => rooms.some(r => r.group === id && (r.quad ? true : Math.abs(x - r.x) <= r.w / 2 + grow && Math.abs(z - r.z) <= r.d / 2 + grow));
  for (const r of plan.glow) if (buildingOf(r) !== 'bus-outside' && r[3] !== MODES.beam) assert.ok(inGroup(buildingOf(r), r[0], r[2]), `${MODE_NAME[r[3]]} at ${r[0].toFixed(2)}, ${r[2].toFixed(2)} in ${buildingOf(r)}`);
  // The sounds' places.
  const kinds = new Set(plan.sounds.map(s => s.kind));
  for (const k of ['simmer', 'tv', 'washer', 'compressor', 'pachinko', 'servers', 'arcade']) assert.ok(kinds.has(k), k);
});

test('interior life: two instanced meshes, their programs built at load; pools and tiers by preset', () => {
  const rows = [];
  for (const q of PRESETS) {
    const { life, scene } = makeLife(q);
    for (const [m, key] of [[life.puffs, 'lumen-interior-puffs-v1'], [life.glow, 'lumen-interior-glow-v1']]) {
      assert.ok(scene.children.includes(m) && m.material.isShaderMaterial && m.material.customProgramCacheKey() === key);
      assert.equal(m.visible, false);
    }
    assert.equal(scene.children.filter(o => o.isMesh).length, 2);
    const c = life.puffs.material.uniforms.uCount.value, P = INTERIOR_LIFE.presets[q];
    assert.deepEqual([c.x, c.y, life.glow.material.uniforms.uTier.value], [P.steam, P.fog, P.tier]);
    rows.push([P.steam, P.fog, P.tier]);
    assert.equal(life.puffs.geometry.instanceCount, plan.puffs.length);
    assert.equal(life.glow.geometry.instanceCount, plan.glow.length);
    assert.equal(life.puffs.material.uniforms.uShow, life.glow.material.uniforms.uShow, 'one visibility table');
  }
  for (let i = 1; i < rows.length; i++) rows[i].forEach((v, k) => assert.ok(v >= rows[i - 1][k], PRESETS[i]));
  assert.deepEqual(rows[0].slice(0, 2), [0, 0], 'no puffs on Potato');
  assert.ok(plan.puffs.length <= 200 && plan.glow.length <= 400, `${plan.puffs.length} puffs, ${plan.glow.length} quads`);
});

test('interior life: the effects follow their interiors\' visibility; the doors are drawn near the bus', () => {
  const { life, view, city } = makeLife('extreme');
  const show = life.show.value, idx = id => plan.buildings.indexOf(id);
  const frame = { clock: 5, elapsed: 5, dt: 1 / 60, focus: view.focus };
  view.focus.set(-60, 0, -50); life.update(frame);
  assert.equal(life.puffs.visible, false); assert.equal(life.glow.visible, false, 'no interior shown, the bus far: nothing drawn');
  assert.ok([...show].every(v => v === 0));
  city.shells.interiors.get('noodle-bar').group.visible = true; life.update(frame);
  assert.equal(show[idx('noodle-bar')], 1); assert.equal(show[idx('club')], 0);
  assert.equal(life.puffs.visible, true, 'the noodle bar steams'); assert.equal(life.glow.visible, false, 'nothing in it glows');
  city.shells.interiors.get('noodle-bar').group.visible = false; city.shells.interiors.get('club').group.visible = true; life.update(frame);
  assert.equal(life.puffs.visible, false); assert.equal(life.glow.visible, true, 'the club\'s floor');
  city.shells.interiors.get('club').group.visible = false;
  const bus = busPoint(0, 0, 0); view.focus.set(bus[0] + 10, 0, bus[2] + 12); life.update(frame);
  assert.equal(show[idx('bus-outside')], 1); assert.equal(life.glow.visible, true, 'the doors, from the street');
  assert.equal(show[idx('bus')], 0, 'the strip only with the bus\'s interior');
  // Potato: the glow still, never the puffs.
  const low = makeLife('potato');
  low.city.shells.interiors.get('noodle-bar').group.visible = true; low.city.shells.interiors.get('club').group.visible = true; low.life.update(frame);
  assert.equal(low.life.puffs.visible, false); assert.equal(low.life.glow.visible, true);
});

test('interior life: no team colour at its glow (each pattern at its brightest)', () => {
  const TEAMS = [['amber', '#ffb020'], ['cyan', '#2ee6ff'], ['violet', '#b77bff']].map(([k, h]) => [k, lab(hexRgb(h))]), close = [];
  const C = INTERIOR_LIFE.colours, P = INTERIOR_LIFE.peaks, G = INTERIOR_LIFE.gain;
  const check = (label, hex, peak) => {
    const lin = hexLinear(hex);
    for (const g of [1, peak * G]) for (const shown of [lin.map(q => Math.min(1, q * g)).map(toSrgb), acesFilmic(lin.map(q => q * g), 1).map(toSrgb)])
      for (const [k, t] of TEAMS) { const d = deltaE2000(lab(shown), t); if (d < 15) close.push(`${label} ${hex} x${g.toFixed(2)}: ${d.toFixed(1)} from ${k}`); }
  };
  check('static', C.static, P.static); for (const c of C.attract) check('attract', c, P.attract);
  check('pachinko', C.pachinko, P.pachinko); check('chase', C.chase, P.chase); for (const c of C.leds) check('leds', c, P.leds);
  check('red', C.red, P.blink); check('green', C.green, P.blink); for (const c of C.tiles) check('tiles', c, P.tiles);
  for (const c of C.spots) { check('pool', c, P.pool); check('beam', c, P.beam); } check('drum', C.drum, P.drum); check('strip', C.strip, P.strip);
  check('steam', INTERIOR_LIFE.steam.colour, 1); check('fog', INTERIOR_LIFE.fog.colour, 1);
  // Every glowing quad's colour is one of these.
  const listed = new Set([C.static, ...C.attract, C.pachinko, C.chase, ...C.leds, C.red, C.green, C.drum, C.strip, ...C.spots].map(h => new THREE.Color(h).getHex()));
  for (const r of plan.glow) if (![MODES.solid, MODES.glass, MODES.tiles].includes(r[3])) assert.ok(listed.has(new THREE.Color(r[16], r[17], r[18]).getHex()), MODE_NAME[r[3]]);
  assert.deepEqual(close.slice(0, 8), [], `${close.length} too near a team colour`);
});

test('the bus doors: open on the hiss\'s events (the same schedule), stay open, shut; the leaves fill the openings shut and stand clear of them open', () => {
  assert.deepEqual([LUMEN_SITES.bus.period, LUMEN_SITES.bus.spread, LUMEN_SITES.bus.open], [BUS_DOORS.period, BUS_DOORS.spread, BUS_DOORS.open]);
  assert.equal(BUS_DOORS.site, 2, 'site 2: lumen-ambience.js busDoorAt');
  assert.ok(BUS_DOORS.period - BUS_DOORS.spread > BUS_DOORS.open + BUS_DOORS.closing, 'one cycle ends before the next begins');
  let opens = 0, prev = 0, shut = 0;
  for (let t = .05; t < 400; t += .05) {
    const e = slotFire(BUS_DOORS.site, t - .05, t, BUS_DOORS.period, BUS_DOORS.spread);
    if (e === e) {
      opens++;
      assert.ok(busDoorOpen(e - .01) < .01, 'shut just before'); assert.ok(busDoorOpen(e + .3) > .1, 'opening with the hiss');
      assert.equal(busDoorOpen(e + BUS_DOORS.open - .5), 1); assert.ok(busDoorOpen(e + BUS_DOORS.open + BUS_DOORS.closing + .05) < .01, 'shut with the second hiss');
      if (prev) { const gap = e - prev - BUS_DOORS.open; assert.ok(gap >= 6 && gap <= 16, `shut for ${gap.toFixed(1)} s`); shut += gap; }
      prev = e;
    }
  }
  assert.ok(opens >= 17 && opens <= 23, `${opens} cycles in 400 s`);
  // The leaves: along the flank, two to a door, together as wide as the opening.
  const leaves = glowOf('glass').filter((_, i) => i % 6 === 0).map(r => r.slice(0, 3));
  for (const d of BUS.doors) {
    const mine = leaves.filter(p => { const along = (p[0] - BUS.cx) * BUS.ux + (p[2] - BUS.cz) * BUS.uz; return Math.abs(along - d.x) < d.width / 2; });
    assert.equal(mine.length, 2, `door at ${d.x}`);
  }
  // Cosmetic only: nothing solid added.
  assert.ok(!(lumen.props || []).some(p => /door|leaf/i.test(p.type) && p.type.startsWith('cityBus')));
});

test('interior life: update allocates nothing', () => {
  const { life, view, city } = makeLife('extreme');
  for (const id of ['noodle-bar', 'club', 'pachinko', 'arcade', 'bus']) city.shells.interiors.get(id).group.visible = true;
  const bus = busPoint(0, 0, 0); view.focus.set(bus[0], 0, bus[2] + 8);
  const frame = { clock: 0, elapsed: 0, dt: 1 / 60, focus: view.focus };
  const step = () => { frame.clock += 1 / 60; city.uniforms.time.value = frame.clock; life.update(frame); };
  v8.setFlagsFromString('--expose-gc'); const gc = vm.runInNewContext('gc');
  for (let k = 0; k < 4000; k++) step();
  let grown = Infinity;
  for (let w = 0; w < 5 && grown >= 256 * 1024; w++) { gc(); const before = process.memoryUsage().heapUsed; for (let k = 0; k < 1000; k++) step(); grown = process.memoryUsage().heapUsed - before; }
  assert.ok(grown < 256 * 1024, `grew ${(grown / 1024).toFixed(0)} KB over 1000 frames`);
  assert.ok(life.glow.visible && life.puffs.visible);
});

test('the system registers with the hub, for Lumen or a city map that asks', () => {
  const make = CITY_SYSTEMS.find(e => e[0] === 'interiorLife')?.[1];
  assert.ok(make);
  const view = { scene: new THREE.Scene(), qualityName: 'balanced' };
  assert.equal(make(view, { id: 'city-test', city: {} }, stubCity()), null);
  assert.ok(make(view, lumen, stubCity()));
});

// --- The new sounds ---------------------------------------------------------------------------------
test('sounds: the beds follow the holograms, the moths and the interiors; one-shots stay in the voice budget', () => {
  // A voice that records what it is told.
  const calls = [];
  const voice = { lifeMix: l => calls.push(['mix', { ...l }]), blup: (...a) => calls.push(['blup', ...a]), pachinkoBalls: (...a) => calls.push(['balls', ...a]), arcadeTune: (...a) => calls.push(['tune', ...a]), holoGlitch: (...a) => calls.push(['glitch', ...a]) };
  const holos = HOLOGRAMS.list.map((h, i) => ({ i, x: h.at[0], y: h.at[1], z: h.at[2], vis: 1 }));
  const lifeSites = new Float32Array([10, 10]);
  const city = { holograms: { count: holos.length, holos }, lightLife: { on: true, counts: { moths: 3 }, sites: lifeSites }, interiorLife: { sounds: plan.sounds } };
  const amb = new LumenAmbience({ qualityName: 'balanced' }, lumen, city);
  amb.voice = voice;
  const mixAt = (x, z, group = -1) => { amb.groupNow = group; calls.length = 0; amb.lifeTick(100, x, z, group >= 0); return calls.find(c => c[0] === 'mix')[1]; };
  const koi = HOLOGRAMS.list[0];
  assert.ok(mixAt(koi.at[0], koi.at[2]).holo > .5, 'the hum under the koi');
  assert.ok(mixAt(-55, 0).holo < .01, 'none far from them');
  assert.ok(mixAt(10.5, 10).insects > .9 && mixAt(20, 10).insects === 0, 'the insects only by a swarm');
  const g = id => amb.plan.groupIndex.get(id);
  const pot = plan.sounds.find(s => s.kind === 'simmer' && s.group === 'noodle-bar');
  assert.ok(mixAt(pot.x + 1, pot.z, g('noodle-bar')).simmer > .9, 'the pots, in the noodle bar');
  assert.ok(mixAt(pot.x, pot.z + 20).simmer < .02, 'hardly from the street');
  const pach = plan.sounds.find(s => s.kind === 'pachinko');
  assert.ok(mixAt(pach.x, pach.z, g('pachinko')).pachinko > .9);
  const cold = plan.sounds.find(s => s.kind === 'compressor');
  const inCold = t => { amb.groupNow = g('market-hall'); calls.length = 0; amb.lifeTick(t, cold.x, cold.z, true); return calls.find(c => c[0] === 'mix')[1].compressor; };
  assert.ok(inCold(0) > .9 && inCold(30) === 0 && compressorAt(0) === 1, 'the compressor cycles');
  // One-shots come: the pots bubble, the balls run.
  let blups = 0, balls = 0; amb.groupNow = g('noodle-bar');
  for (let k = 0; k < 200; k++) { calls.length = 0; amb.lifeTick(100 + k * .1, pot.x, pot.z, true); blups += calls.filter(c => c[0] === 'blup').length; }
  amb.groupNow = g('pachinko');
  for (let k = 0; k < 200; k++) { calls.length = 0; amb.lifeTick(100 + k * .1, pach.x, pach.z, true); balls += calls.filter(c => c[0] === 'balls').length; }
  assert.ok(blups >= 8 && balls >= 10, `${blups} bubbles, ${balls} runs of balls in 20 s`);
  // The glitch crackle falls on the holograms' glitches.
  let crackles = 0;
  for (let t = .1; t < 60; t += .1) { calls.length = 0; amb.glitches(t - .1, t, koi.at[0], koi.at[2]); crackles += calls.filter(c => c[0] === 'glitch').length; }
  assert.ok(crackles >= 4, `${crackles} crackles in a minute under the koi`);
  // The mix object is reused.
  assert.equal(newLifeMix().holo, 0); assert.ok(Object.values(LUMEN_LIFE_SOUND.level).every(v => v > 0 && v <= .05), 'soft beds');
});

test('sounds: the new voices are built with the graph and every one-shot respects the preset\'s voice limit', () => {
  // A minimal Web Audio stand-in (as tests/lumen-sound.test.js): nodes that connect and count.
  let made = 0;
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = extra => { made++; return { connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), ...extra }; };
  const ctx = { currentTime: 0, sampleRate: 8000, state: 'running', createGain: () => node(), createBiquadFilter: () => node({ type: '' }), createOscillator: () => node({ type: '' }), createBufferSource: () => node({ buffer: null, loop: false }), createConvolver: () => node({ buffer: null }), createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }) };
  const sound = { context: ctx, enabled: true, buses: { ambient: node(), effects: node() }, noiseBuffer: {}, wind: null };
  const v = new LumenSound(sound, { quality: 'potato' });
  v.start(sound);
  for (const name of ['holoGain', 'insectGain', 'simmerGain', 'tvHissGain', 'washerGain', 'compressorGain', 'pachinkoGain', 'serverFanGain']) assert.ok(v[name], name);
  v.lifeMix({ ...newLifeMix(), holo: 1, simmer: 1 });
  v.active = v.limit; const before = made;
  v.lastKind = {}; v.holoGlitch(1); v.lastKind = {}; v.blup(1); v.lastKind = {}; v.pachinkoBalls(1); v.lastKind = {}; v.arcadeTune(1, 5);
  assert.equal(made, before, 'a full budget refuses them all');
  v.active = 0; v.lastKind = {}; v.pachinkoBalls(1);
  assert.ok(made > before && v.active <= v.limit);
});
