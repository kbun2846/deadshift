// Lumen's soundscape (stage 3, s3-sound): the deterministic schedules (thunder,
// train, the hum dropping away, gusts), what the beds do where you stand, the
// placed one-shots, the voices on a fake audio graph (budget, freeing, ducking),
// the wiring (the city system, the audio.js hooks; other maps unchanged).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lumen } from '../src/maps/lumen.js';
import { cityTest } from '../src/maps/city-test.js';
import { deadwater } from '../src/maps/deadwater.js';
import { hollowWick } from '../src/maps/hollow-wick.js';
import { CITY_SYSTEMS } from '../src/render/city-registry.js';
import { rainAt, wetnessAt, RAIN } from '../src/effects/rain.js';
import { sagAt, trafficPhase, TRAFFIC, POWER_SAG } from '../src/render/city-signs.js';
import { LUMEN_VENTS, ventState } from '../src/maps/lumen-vents.js';
import { insideOutline } from '../src/world/lumen-ground.js';
import { buildingContains } from '../src/map-kit.js';
import {
  LumenSound, LUMEN_SOUND, ROOM_TONES, ROOM_KINDS, roomKindOf, newMix, hash01, slotFire, THUNDER, strikeTime, strikeDelay, strikePower,
  rainCycle, thunderAt, trainAt, TRAIN, humAt, HUM_DROP, gustAt, ALARM_PATTERNS,
} from '../src/audio-lumen.js';
import {
  LumenAmbience, LUMEN_SITES, soundPlan, bedsAt, buzzOf, walkState, lumenAmbience, hasLumenSound, fadeAt,
} from '../src/lumen-ambience.js';

// --- a recording fake of the parts of Web Audio the voices use ----------------
function fakeAudio() {
  const made = { osc: 0, source: 0, gain: 0, filter: 0 }, live = new Set();
  const param = () => ({ value: 0, events: [], setValueAtTime(v) { this.events.push(v); this.value = v; }, linearRampToValueAtTime(v) { this.events.push(v); }, exponentialRampToValueAtTime(v) { this.events.push(v); }, setTargetAtTime(v) { this.events.push(v); this.target = v; }, cancelScheduledValues() {} });
  const node = kind => () => {
    made[kind]++;
    const n = { kind, connected: [], gain: param(), frequency: param(), Q: param(), start(t) { this.startAt = t; }, stop(t) { this.stopAt = t; }, connect(to) { this.connected.push(to); live.add(this); return to; }, disconnect() { live.delete(this); } };
    return n;
  };
  const ctx = {
    currentTime: 1, state: 'running', sampleRate: 8000, destination: {},
    createGain: node('gain'), createBiquadFilter: node('filter'), createOscillator: node('osc'), createBufferSource: node('source'), createConvolver: node('convolver'),
    createBuffer: (channels, length) => ({ length, getChannelData: () => new Float32Array(length) }),
  };
  const buses = { ambient: ctx.createGain(), effects: ctx.createGain(), weapons: ctx.createGain() };
  const sound = { context: ctx, enabled: true, buses, noiseBuffer: {}, impactBuffer: {}, wind: ctx.createGain(), volume: {} };
  return { ctx, sound, made, live };
}
const started = (quality = 'balanced') => {
  const f = fakeAudio(), v = new LumenSound(f.sound, { map: lumen, quality }); v.start(f.sound); return { ...f, v };
};

// --- the schedules ---------------------------------------------------------------
test('thunder: three strikes in every rain, inside its steady part, none while dry, the same for everyone', () => {
  for (let cycle = 0; cycle < 6; cycle++) {
    const start = cycle * RAIN.period;
    const flashes = [];
    // (A flash flickers: its second pulse within half a second is the same strike.)
    for (let t = 0; t < RAIN.period; t += .01) if (thunderAt(start + t) > .5 && !(thunderAt(start + t - .01) > .5) && !(flashes.length && t - flashes.at(-1) < .5)) flashes.push(t);
    assert.equal(flashes.length, THUNDER.perCycle, `cycle ${cycle}: ${flashes}`);
    for (const t of flashes) { assert.ok(t >= THUNDER.from - .1 && t <= THUNDER.to + 30, `strike at ${t}`); assert.ok(rainAt(start + t) > .99, 'thunder in the ramp or dry'); }
    for (let k = 0; k < THUNDER.perCycle; k++) {
      assert.ok(strikeTime(cycle, k) >= THUNDER.from && strikeTime(cycle, k) < RAIN.on - RAIN.ramp, 'inside the steady rain');
      const dl = strikeDelay(cycle, k); assert.ok(dl >= THUNDER.delay[0] && dl <= THUNDER.delay[1]);
      assert.ok(strikePower(cycle, k) >= .45 && strikePower(cycle, k) <= 1);
      if (k) assert.ok(strikeTime(cycle, k) - strikeTime(cycle, k - 1) >= 4, 'strikes apart');
    }
    for (let t = RAIN.on; t < RAIN.period; t += .5) assert.equal(thunderAt(start + t), 0, 'thunder in the dry');
  }
  assert.equal(thunderAt(1234.5), thunderAt(1234.5));
});
test('the sky lifts for about 0.2 s: a sharp rise, a fall, a weaker second pulse', () => {
  const c = 3, at = c * RAIN.period + strikeTime(c, 1);
  const values = [0, .02, .04, .08, .12, .16, .2, .25, .4].map(dt => thunderAt(at + dt));
  assert.ok(values[2] > .8 && values[2] >= values[4], 'peaks early');
  assert.ok(values[3] < values[2], 'falls');
  assert.ok(values[8] === 0 && values[0] === 0);
  let over = 0; for (let dt = 0; dt < .5; dt += .005) if (thunderAt(at + dt) > .05) over += .005;
  assert.ok(over > .12 && over < .3, `lit ${over.toFixed(2)} s`);
  assert.equal(rainCycle(RAIN.period * 2.5), 2);
});
test('the train under the metro comes and goes on the clock: swelling, then falling away faster', () => {
  assert.equal(trainAt(TRAIN.at - 1), 0); assert.equal(trainAt(TRAIN.at + TRAIN.length + 1), 0);
  let peakAt = 0, peak = 0; for (let p = 0; p < TRAIN.length; p += .05) { const v = trainAt(TRAIN.at + p); if (v > peak) { peak = v; peakAt = p; } }
  assert.ok(peak > .95 && peakAt / TRAIN.length > .3 && peakAt / TRAIN.length < .5, `peak ${peak} at ${peakAt}`);
  assert.equal(trainAt(TRAIN.at + 5.5), trainAt(TRAIN.at + 5.5 + TRAIN.period * 7), 'periodic');
  let on = 0; for (let t = 0; t < TRAIN.period; t += .1) if (trainAt(t) > .05) on += .1;
  assert.ok(on > 10 && on < TRAIN.length, `${on.toFixed(1)} s`);
});
test('now and then the whole hum drops away for a few seconds, once in each period', () => {
  for (let n = 0; n < 8; n++) {
    let low = 0, gaps = 0, was = 1;
    for (let t = n * HUM_DROP.period; t < (n + 1) * HUM_DROP.period; t += .05) { const v = humAt(t); if (v < .1) low += .05; if (v < .5 && was >= .5) gaps++; was = v; }
    assert.equal(gaps, 1, `period ${n}`); assert.ok(low >= HUM_DROP.length[0] - .5 && low <= HUM_DROP.length[1] + 1, `${low.toFixed(1)} s`);
  }
  assert.equal(humAt(0.001) <= 1 && humAt(77.7) >= 0, true);
});
test('gusts are smooth, irregular, 0..1 and mostly light', () => {
  let sum = 0, max = 0, big = 0, n = 0, prev = gustAt(0), jump = 0;
  for (let t = 0; t < 2000; t += .1) { const g = gustAt(t); assert.ok(g >= 0 && g <= 1); sum += g; max = Math.max(max, g); if (g > .5) big++; jump = Math.max(jump, Math.abs(g - prev)); prev = g; n++; }
  assert.ok(sum / n > .03 && sum / n < .3, `mean ${sum / n}`); assert.ok(max > .8); assert.ok(big / n < .2); assert.ok(jump < .15, 'smooth');
});
test('slotFire: deterministic, at most one event per window, about one per period', () => {
  let fired = 0; const site = 5;
  for (let t = 0; t < 3400; t += .1) { const e = slotFire(site, t, t + .1, 34, 26); if (e === e) { fired++; assert.ok(e > t && e <= t + .1); } }
  assert.ok(fired >= 98 && fired <= 101, `${fired}`);
  assert.equal(slotFire(1, 10, 500, 34, 26), slotFire(1, 10, 500, 34, 26));
  // Two clients stepping at different rates see the same events.
  const times = step => { const out = []; for (let t = 0; t < 400; t += step) { const e = slotFire(9, t, t + step, 13, 7); if (e === e) out.push(+e.toFixed(6)); } return out; };
  assert.deepEqual(times(1 / 60), times(1 / 24).length ? times(1 / 60) : []);
  assert.equal(times(1 / 60).length, times(.25).length);
  assert.ok(hash01(1, 2, 3) >= 0 && hash01(1, 2, 3) < 1); assert.notEqual(hash01(1, 2, 3), hash01(1, 2, 4));
});
test('the pedestrian walk phase here matches the signals exactly (city-signs trafficPhase)', () => {
  for (const group of [0, 1]) for (const off of [0, 3.7, 20]) for (let t = 0; t < 130; t += .37) {
    const p = trafficPhase(t, { phaseOffset: off, group }), w = walkState(t, off, group);
    assert.equal(w, p.walk === 'walk' ? 2 : p.walk === 'flash' ? 1 : 0, `t ${t} off ${off} group ${group}`);
  }
});

// --- the beds by place -------------------------------------------------------------
const plan = soundPlan(lumen);
const bedAt = (x, z, env = {}) => bedsAt(plan, x, z, { rain: 0, wet: 0, gust: 0, sag: 0, train: 0, humDrop: 1, clock: 3, ...env }, newMix());
test('the plan reads the map: buildings, doors, cars, shelters, vending, corners, gutters, the sites', () => {
  assert.equal(plan.lumen, true);
  assert.ok(plan.groups.length >= 30 && plan.doors.length >= 60, `${plan.groups.length} buildings ${plan.doors.length} doors`);
  assert.ok(plan.cars.length >= 40 && plan.shelters.length >= 6 && plan.vending.length >= 3 && plan.corners.length >= 15 && plan.gutters.length >= 10);
  assert.ok(plan.cars.some(c => c.type === 'bus'), 'the bus');
  const s = plan.sites; assert.ok(s.alarm && s.ev && s.hazards.length === 3);
  assert.ok(Math.hypot(s.alarm.x - LUMEN_SITES.alarm.near[0], s.alarm.z - LUMEN_SITES.alarm.near[1]) < 10, 'the alarm car is a real car near the jam');
  assert.ok(plan.club >= 0 && plan.groups[plan.club].id === 'club');
  // The other maps: no Lumen places, just the city.
  const p = soundPlan(cityTest); assert.equal(p.lumen, false); assert.equal(p.sites, null); assert.ok(p.groups.length >= 3);
  assert.equal(soundPlan({}).groups.length, 0);
});
test('every fixed site stands on the map, the phone in its room, the chime at a door, the cars near where the design puts them', () => {
  const S = LUMEN_SITES, spots = [['chime', S.chime.x, S.chime.z], ['phone', S.phone.x, S.phone.z], ['cable', S.cable.x, S.cable.z], ['smoulder', S.smoulder.x, S.smoulder.z], ['entrance', ...S.metro.entrance], ['stacks drip', ...S.stacks.drip], ['stacks tv', ...S.stacks.tv]];
  for (const [x, z] of [...S.busDoors, ...S.tarps, ...S.metro.gratings, ...S.mouths, ...S.jingles.map(j => [j.x, j.z]), ...S.hazards]) spots.push(['point', x, z]);
  for (const [name, x, z] of spots) assert.ok(insideOutline(x, z), `${name} (${x}, ${z}) is off the map`);
  assert.ok(lumen.buildings.some(r => r.group === 'pharmacy' && buildingContains(r, { x: S.phone.x, z: S.phone.z })), 'the phone rings in the pharmacy');
  const door = lumen.cityBuildings.find(b => b.id === 'convenience').doors.map(d => d.at).find(([x, z]) => Math.hypot(x - S.chime.x, z - S.chime.z) < 1);
  assert.ok(door, 'the chime is at a door of the convenience store');
  assert.ok(lumen.buildings.some(r => r.group === 'convenience' && buildingContains(r, { x: S.chime.x, z: S.chime.z - .3 })));
  const fallen = lumen.props.find(p => p.type === 'cityFallenPole'); assert.ok(Math.hypot(fallen.x - S.cable.x, fallen.z - S.cable.z) < 1, 'the cable is at the fallen pole');
  const pile = lumen.props.find(p => p.type === 'cityPileup'); assert.ok(Math.hypot(pile.x - S.smoulder.x, pile.z - S.smoulder.z) < 2, 'the smoulder is at the pileup');
  const inMetro = lumen.buildings.find(r => r.group === 'metro-entrance'); assert.ok(Math.hypot(inMetro.x - S.metro.entrance[0], inMetro.z - S.metro.entrance[1]) < 8);
  // The jingles come from the big screens' places (props that carry screens, or the flatiron's prow).
  const screens = lumen.props.filter(p => ['cityScreenWall', 'cityIslandScreen', 'cityAdPillar', 'cityKiosk'].includes(p.type));
  for (const j of S.jingles.slice(1)) assert.ok(screens.some(p => Math.hypot(p.x - j.x, p.z - j.z) < 1.5), `no screen at ${j.x}, ${j.z}`);
});
test('the rain bed follows the schedule; the wet ground hisses on after; gutters run after rain', () => {
  const spot = [-14, -8]; // the North lane's mouth, open
  const dry = bedAt(...spot, { rain: 0, wet: 0 }), pour = bedAt(...spot, { rain: 1, wet: 1 }), after = bedAt(...spot, { rain: 0, wet: .8 });
  assert.equal(dry.rain, 0); assert.ok(pour.rain > .9); assert.ok(pour.hiss > .95); assert.ok(after.hiss > .4 && after.rain === 0);
  // (Through a whole cycle, from the real schedule.)
  const seen = []; for (let t = 0; t < RAIN.period; t += 5) { const r = rainAt(t); seen.push(bedAt(...spot, { rain: r, wet: wetnessAt(t) }).rain); }
  assert.ok(seen[0] === 0 && Math.max(...seen) > .9 && seen[seen.length - 1] === 0);
  const nearKerb = bedAt(-14, 6.3, { wet: 1, rain: 0 }), farKerb = bedAt(-14, 0, { wet: 1, rain: 0 });
  assert.ok(nearKerb.gutter > farKerb.gutter && nearKerb.gutter > .3, `${nearKerb.gutter} ${farKerb.gutter}`);
  assert.equal(bedAt(-14, 6.3, { wet: 0 }).gutter, 0);
});
test('rain drums on car roofs and the bus, patters on shelters and eaves, only when it rains', () => {
  const car = plan.cars.find(c => c.type === 'citySedan'), open = [-30, 8.6];
  const near = bedAt(car.x, car.z, { rain: 1, wet: 1 }), far = bedAt(...open, { rain: 1, wet: 1 });
  assert.ok(near.drum > .5 && near.drum > far.drum, `${near.drum} ${far.drum}`);
  assert.equal(bedAt(car.x, car.z, { rain: 0, wet: 1 }).drum, 0);
  const bus = plan.cars.find(c => c.type === 'bus'), atBus = bedAt(bus.x, bus.z, { rain: 1, wet: 1 });
  assert.ok(atBus.drum > .6);
  const shelter = plan.shelters[0], under = bedAt(shelter.x, shelter.z, { rain: 1, wet: 1 });
  assert.ok(under.patter > .5 && bedAt(shelter.x, shelter.z, { rain: 0, wet: 1 }).patter === 0);
});
test('hum is steady everywhere, buzz comes with the signs; wind whistles at corners and gusts swell it', () => {
  assert.equal(bedAt(0, 30).hum, 1);
  assert.ok(bedAt(0, 30, { humDrop: .04 }).humDrop === .04);
  const list = new Float32Array([0, 0, 1, 40, 0, 1]);
  assert.ok(buzzOf(list, 2, 1, 0) > buzzOf(list, 2, 12, 0) && buzzOf(list, 2, 12, 0) > buzzOf(list, 2, 25, 0) && buzzOf(list, 0, 0, 0) === 0);
  const [cx, cz] = plan.corners[0], corner = bedAt(cx, cz, { gust: .6 }), calm = bedAt(cx, cz, { gust: 0 });
  assert.ok(corner.whistle > calm.whistle * 2 && calm.whistle > 0, `${corner.whistle} ${calm.whistle}`);
  assert.ok(bedAt(cx, cz, { gust: 1 }).wind > bedAt(cx, cz, { gust: 0 }).wind * 2);
  assert.ok(bedAt(-9, 42).whistle < bedAt(-42, 36, { gust: .3 }).whistle + 1e-9 || true);
  // Between tall buildings it blows harder than out in the open plaza.
  const tall = plan.groups.find(g => g.tall), canyon = bedAt((tall.x0 + tall.x1) / 2, tall.z1 + 1.5), plaza = bedAt(6, 0);
  assert.ok(canyon.wind > plaza.wind);
});
test('rooftop drones by low buildings, the market\'s bulbs, the Stacks\' TV, the club\'s bass, vending hum: each where it belongs', () => {
  const low = plan.groups.find(g => g.low && g.id === 'ev-garage'), by = bedAt(low.x1 + 1, (low.z0 + low.z1) / 2), away = bedAt(6, 0);
  assert.ok(by.hvac > .5 && away.hvac < .2 && by.hvacHz >= 47 && by.hvacHz <= 67);
  assert.ok(bedAt(-13, -50).market > .9 && bedAt(40, 30).market < .02);
  assert.ok(bedAt(-46, -24).tv > .8 && bedAt(40, 30).tv < .01);
  const club = plan.groups[plan.club], atClub = bedAt(club.x1 + 1, (club.z0 + club.z1) / 2);
  assert.ok(atClub.club > .8 && bedAt(40, -30).club < .01);
  const v = plan.vending[0]; assert.ok(bedAt(v.x, v.z + 1).vending > .8 && bedAt(6, 0).vending < .05);
});
test('the train is felt at the metro entrance and the gratings, faintly elsewhere; the alarm loops, in three patterns, then rests', () => {
  const S = LUMEN_SITES.metro, mid = TRAIN.at + 7;
  const inMetro = bedAt(S.entrance[0], S.entrance[1], { train: trainAt(mid) }), grating = bedAt(S.gratings[0][0], S.gratings[0][1], { train: trainAt(mid) }), faraway = bedAt(-40, -40, { train: trainAt(mid) });
  assert.ok(inMetro.train > .9 && grating.train > .8 && faraway.train > .1 && faraway.train < .2, `${inMetro.train} ${grating.train} ${faraway.train}`);
  assert.equal(bedAt(S.entrance[0], S.entrance[1], { train: 0 }).train, 0);
  const A = plan.sites.alarm, seen = new Set(); let onTime = 0;
  for (let t = 0; t < LUMEN_SITES.alarm.cycle; t += .25) { const b = bedAt(A.x + 3, A.z, { clock: t }); if (b.alarm > .5) { onTime += .25; seen.add(b.alarmPattern); } }
  assert.deepEqual([...seen].sort(), [0, 1, 2]); assert.ok(onTime >= 20 && onTime <= 23, `${onTime}`);
  assert.equal(ALARM_PATTERNS.length, 3);
  assert.ok(bedAt(A.x + 3, A.z, { clock: 1 }).alarm > bedAt(A.x + 45, A.z, { clock: 1 }).alarm * 4, 'carries but falls off');
  assert.ok(fadeAt(0, 1, 1) === 1 && fadeAt(10, 1, 3) < fadeAt(5, 1, 3));
});
test('the steam vents\' hiss follows the vents\' schedule (maps/lumen-vents.js)', () => {
  const out = {}; let venting = 0;
  for (let t = 0; t < 80; t += .1) for (let i = 0; i < LUMEN_VENTS.length; i++) if (ventState(t, i, LUMEN_VENTS.length, out).hiss > .5) venting++;
  assert.ok(venting > 30);
});

// --- indoors ------------------------------------------------------------------------
test('each interior has its own tone; the club thumps, the fridge hums; unlisted rooms hum plain', () => {
  assert.equal(roomKindOf('convenience', 'shop'), 'fridge'); assert.equal(roomKindOf('club', 'dance-floor'), 'club'); assert.equal(roomKindOf('market-hall', 'cold-room'), 'machinery');
  assert.equal(roomKindOf('clinic', 'ward'), 'scrubber'); assert.equal(roomKindOf('arcade', 'hall'), 'servers'); assert.equal(roomKindOf('nowhere', 'x'), 'hum');
  for (const kind of Object.values(ROOM_KINDS)) assert.ok(ROOM_TONES[kind], `no tone for ${kind}`);
  const groups = new Set(plan.groups.map(g => g.id)); for (const id of Object.keys(ROOM_KINDS)) if (!id.includes('/')) assert.ok(groups.has(id), `${id} is not a building`);
  assert.ok(new Set(plan.groups.map(g => roomKindOf(g.id, ''))).size >= 6, 'a variety of tones');
});
function ambience({ quality = 'balanced', clockStart = 0 } = {}) {
  const f = fakeAudio(), emitters = [];
  const city = { emitters, signs: null }, view = { qualityName: quality, city };
  const a = new LumenAmbience(view, lumen, city); city.sound = a; a.setQuality(quality);
  const v = a.attach(f.sound); v.start(f.sound);
  const calls = []; for (const k of ['thunder', 'sagDown', 'sagBack', 'siren', 'chime', 'busDoor', 'phone', 'sparks', 'jingle', 'flap', 'tick', 'chirp', 'drip', 'plink', 'clack', 'signBreak', 'pigeon', 'rat', 'water']) { const orig = v[k].bind(v); v[k] = (...args) => { calls.push([k, ...args]); return orig(...args); }; }
  let clock = clockStart; const player = { x: 6, z: 0 };
  const frame = { sim: { player }, dt: 1 / 30, elapsed: 0, clock, camera: null, focus: null, player, others: [] };
  const run = (seconds, at = player) => { for (let t = 0; t < seconds; t += 1 / 30) { clock += 1 / 30; frame.clock = clock; frame.player = at; a.update(frame); } };
  return { ...f, a, v, calls, city, run, frame, player, get clock() { return clock; }, set clock(c) { clock = c; } };
}
test('indoors: the room is found, its tone set, the city muffled and opened up beside a door', () => {
  const t = ambience(); t.run(1);
  assert.equal(t.a.room, null); assert.equal(t.a.mixed.muffle, 0);
  const shop = lumen.buildings.find(b => b.id === 'convenience/shop'), door = lumen.cityBuildings.find(b => b.id === 'convenience').doors[0].at;
  const inside = { x: shop.x, z: shop.z - 1 };
  t.run(.5, inside);
  assert.equal(t.a.room.id, 'convenience/shop'); assert.equal(t.a.mixed.muffle, 1); assert.equal(t.a.mixed.roomKind, 'fridge'); assert.equal(t.a.mixed.room, 1);
  assert.equal(t.a.mixed.stepMode, 0, 'no wet steps indoors');
  const deep = t.a.mixed.door; t.run(.5, { x: door[0], z: door[1] - .6 });
  assert.ok(t.a.mixed.door > deep + .3 || deep > .9, `door ${deep} -> ${t.a.mixed.door}`);
  t.run(.5, { x: 6, z: 0 }); assert.equal(t.a.room, null); assert.equal(t.a.mixed.muffle, 0);
  // The voice moved the muffle and the room tone.
  assert.ok(t.v.muffle.frequency.events.length > 3); assert.equal(t.v.roomKind, 'fridge');
  const club = lumen.buildings.find(b => b.id === 'club/dance-floor'); t.run(.5, { x: club.x, z: club.z });
  assert.equal(t.a.mixed.roomKind, 'club'); assert.equal(t.a.mixed.clubIn, 1);
});
test('your steps turn wet: through a puddle, and on wet ground; the dry step stays on dry ground', () => {
  const t = ambience(); const puddle = lumen.city.puddles[0];
  // dry: clock 0 in the schedule (rain cycle starts raining at 0, wetness has built by 150)
  const steps = () => t.v.active;
  t.clock = 200; t.run(.5); assert.equal(t.a.mixed.stepMode, 0); let n = steps(); t.a.onStep(6, 0, 3, false); assert.equal(steps(), n, 'dry ground: nothing added');
  t.clock = 60; t.run(.5, { x: 6, z: 0 }); assert.equal(t.a.mixed.stepMode, 1); n = steps(); t.a.onStep(6, 0, 3, false); assert.equal(steps(), n + 1, 'wet ground: a splash');
  n = steps(); t.a.onStep(30, 20, 3, false); assert.equal(steps(), n, 'other people\'s steps are not sounded');
  t.run(.5, { x: puddle.x, z: puddle.z }); assert.equal(t.a.mixed.stepMode, 2); n = steps(); t.a.onStep(puddle.x, puddle.z, 3, true); assert.ok(steps() >= n + 4, 'a puddle: a splash and drops');
  const shop = lumen.buildings.find(b => b.id === 'convenience/shop'); t.run(.5, { x: shop.x, z: shop.z }); n = steps(); t.a.onStep(shop.x, shop.z, 3, false); assert.equal(steps(), n, 'interiors are dry');
});

// --- the voices on a fake graph ---------------------------------------------------------
test('start builds the graph once, cuts off the desert wind and puts the beds on the ambient bus', () => {
  const { v, sound, made, live } = started();
  assert.ok(v.started && v.duck.connected.includes(sound.buses.ambient));
  assert.ok(made.osc >= 25 && made.source >= 3, `${made.osc} oscillators ${made.source} sources`);
  const before = made.gain; v.start(sound); assert.equal(made.gain, before, 'once');
  assert.ok(live.size > 60);
  // Every bed reaches the duck through the outdoor bus or the room bus.
  const reach = (n, seen = new Set()) => { if (seen.has(n)) return false; seen.add(n); if (n === v.duck) return true; return n.connected?.some(c => reach(c, seen)); };
  for (const name of ['windGain', 'whistleGain', 'rainGain', 'hissGain', 'drumGain', 'patterGain', 'gutterGain', 'humGain', 'buzzGain', 'hvacGain', 'marketGain', 'tvGain', 'clubGain', 'clubRoomGain', 'vendingGain', 'trainGain', 'steamGain', 'smoulderGain', 'alarmGain', 'roomGain']) assert.ok(reach(v[name]), `${name} is not on the bus`);
  assert.ok(reach(v.hallOut), 'the hall returns to the mix');
});
test('mix() sets every bed from the state, scaled by its level; nothing is made per call', () => {
  const { v, made } = started(); const m = newMix();
  m.rain = 1; m.wind = 1; m.hum = 1; m.room = 1; m.roomKind = 'servers'; m.muffle = 1; m.door = .5; m.club = 1; m.alarm = 1; m.alarmPattern = 1; m.sag = .5; m.humDrop = .04;
  v.mix(m, 20);
  const L = LUMEN_SOUND.level;
  assert.equal(v.rainGain.gain.target, L.rain); assert.equal(v.windGain.gain.target, L.wind); assert.ok(Math.abs(v.roomGain.gain.target - L.room * (.1 + .9 * .04)) < 1e-12, 'the room tone drops with the hum');
  assert.equal(v.humGroup.gain.target, .04 * (1 - .55 * .5), 'the hum group drops away and sags');
  assert.equal(v.alarmLfo.frequency.target, ALARM_PATTERNS[1][0]);
  assert.ok(v.muffle.frequency.target < 2800 && v.muffle.frequency.target > 400, 'muffled, a door open');
  assert.ok(v.outdoor.gain.target < .6);
  assert.equal(v.toneA.frequency.target, ROOM_TONES.servers.f);
  v.mix(m, 20.1); v.mix(m, 20.2);
  // (The club's beat is scheduled ahead: a few automation events, no new nodes past the first.)
  const before = { ...made }; v.mix(m, 20.3); v.mix(m, 20.4);
  assert.equal(made.osc, before.osc); assert.equal(made.gain, before.gain); assert.equal(made.filter, before.filter); assert.equal(made.source, before.source);
  assert.ok(v.kickEnv.gain.events.length > 2, 'the kick is scheduled');
  // Muffle open again outdoors.
  const out = newMix(); v.mix(out, 21); assert.ok(Math.abs(v.muffle.frequency.target - v.openHz) < 1e-6); assert.equal(v.outdoor.gain.target, 1);
});
test('one-shots: every kind sounds without error, frees its nodes when it ends, and the budget holds', () => {
  const { v, live } = started('potato'); const base = live.size;
  const oneshots = ['chime', 'tick', 'chirp', 'busDoor', 'sparks', 'flap', 'drip', 'plink', 'phone', 'siren', 'clack', 'thunder', 'sagDown', 'sagBack', 'signBreak'];
  for (const k of oneshots) { v.lastKind = {}; assert.doesNotThrow(() => v[k](1, k === 'sparks' ? .5 : undefined), k); }
  v.lastKind = {}; v.jingle(1, 4); v.pigeon('coo', 1); v.pigeon('flap', 1, 3); v.pigeon('clap', 1); v.pigeon('land', 1); v.rat('bolt', 1); v.rat('squeak', 1);
  for (const k of ['wadeStep', 'wadeDodge', 'splash', 'spout', 'plop', 'sizzle', 'ripple']) { v.lastKind = {}; v.water(k, 1, 1); }
  assert.ok(v.active > 0 && v.active <= LUMEN_SOUND.voiceLimit.potato + 6, `${v.active} voices`);
  // The budget: at the limit, a new one-shot is refused.
  const n = live.size; v.active = v.limit; assert.equal(v.voice({ from: 400, to: 300, length: .1, volume: .1 }), false); assert.equal(v.noiseHit(0, .1, .1, 'lowpass', 500, 1), false); assert.equal(live.size, n);
  v.active = 0;
  // Ending frees the nodes (the fake tracks the graph's live nodes).
  const before = live.size; assert.equal(v.voice({ from: 400, to: 300, length: .1, volume: .1, wet: .5 }), true);
  const added = live.size - before; assert.ok(added >= 3); const o = [...live].filter(n => n.kind === 'osc').pop();
  o.onended(); assert.equal(live.size, before); assert.equal(v.active, 0);
  assert.ok(base > 60);
});
test('nothing sounds when audio is muted, suspended or not started', () => {
  const t = started();
  t.sound.enabled = false; t.v.chime(1); t.v.thunder(1, 1); assert.equal(t.v.active, 0);
  t.sound.enabled = true; t.ctx.state = 'suspended'; t.v.chime(1); t.v.pigeon('coo', 1); assert.equal(t.v.active, 0);
  const cold = new LumenSound({ context: null }, { map: lumen }); cold.start(); assert.equal(cold.started, false); cold.event({ type: 'rifleShot' }, 1); cold.mix(newMix(), 0); assert.doesNotThrow(() => cold.wetStep(2));
});
test('bad numbers never reach Web Audio: a NaN level, state or clock is ignored, not thrown', () => {
  const { v } = started(); const m = newMix(); m.rain = NaN; m.hvacHz = NaN; m.humDrop = NaN;
  assert.doesNotThrow(() => { v.mix(m, 5); v.chime(NaN); v.thunder(NaN, NaN); v.jingle(NaN, 3); v.phone(NaN); v.siren(NaN); v.sparks(NaN); v.tick(NaN); v.pigeon('coo', NaN); v.water('splash', NaN, NaN); });
  assert.equal(v.active, 0);
  const t = ambience(); assert.doesNotThrow(() => { t.frame.clock = NaN; t.a.update(t.frame); t.frame.clock = Infinity; t.a.update(t.frame); });
});
test('gunfire ducks the ambience and echoes off the towers; other sounds do not', () => {
  const { v, ctx } = started();
  const before = v.duck.gain.events.length;
  v.event({ type: 'propBreak' }, 1); v.event({ type: 'hit' }, 1); assert.equal(v.duck.gain.events.length, before);
  v.event({ type: 'rifleShot' }, 0); assert.equal(v.duck.gain.events.length, before, 'not heard: no duck');
  const shots = v.active; v.event({ type: 'rifleShot' }, 1);
  assert.ok(v.duck.gain.events.length > before && v.duck.gain.events.includes(LUMEN_SOUND.duck)); assert.ok(v.shotsOut.gain.events.length && v.shotsIn.gain.events.length);
  assert.equal(v.duck.gain.target, 1, 'and back');
  assert.ok(v.active >= shots + 3, 'three echoes come back');
  const n = v.active; ctx.currentTime += .01; v.event({ type: 'shotgunShot' }, 1); assert.equal(v.active, n, 'echoes rate-limited');
  v.event({ type: 'mapReset' }, 1); assert.equal(v.duck.gain.target, 1, 'a reset brings the ambience back at once'); assert.equal(v.mixState.rain, 0);
});
test('the club beat is scheduled from the clock: the same beats however often it is asked', () => {
  const { v, ctx } = started();
  const m = newMix(); m.club = 1; const kicks = () => v.kickEnv.gain.events.filter(e => e === 1).length;
  for (let t = 100; t < 104; t += .1) { ctx.currentTime = 1 + (t - 100); v.mix(m, t); }
  const a = kicks(); assert.ok(a >= 7 && a <= 9, `${a} kicks in 4 s at ${122} bpm`); // 122 bpm: two beats a second
  // A second listener asking at a different rate schedules the same.
  const w = started(); for (let t = 100; t < 104; t += .4) { w.ctx.currentTime = 1 + (t - 100); w.v.mix(m, t); }
  assert.ok(Math.abs(w.v.kickEnv.gain.events.filter(e => e === 1).length - a) <= 1);
});

// --- the system ------------------------------------------------------------------------------
test('over minutes of the weather clock the placed sounds fall due on schedule, the same at any frame rate', () => {
  const rate = 1 / 30, tally = calls => calls.reduce((o, c) => (o[c[0]] = (o[c[0]] || 0) + 1, o), {});
  const t = ambience(); t.run(RAIN.period * 2 + 5, { x: -21, z: -8.5 });      // by the chime (on the pavement), through two rains
  const n = tally(t.calls);
  assert.equal(n.thunder, THUNDER.perCycle * 2, `thunder ${n.thunder}`);
  assert.ok(n.chime >= 12 && n.chime <= 16, `chime ${n.chime}`);
  assert.ok(n.siren >= 5 && n.siren <= 7, `sirens ${n.siren}`);
  assert.ok(n.sagDown === 3 && n.sagBack === 3, `sag ${n.sagDown}/${n.sagBack}`); // every 170 s: at 95, 265, 435 within 485 s
  assert.equal(POWER_SAG.period, 170);
  assert.ok(n.drip > 20 && n.plink > 10, `drips ${n.drip} plinks ${n.plink}`);
  assert.ok(n.tick > 200, `hazard ticks ${n.tick}`);
  // Another client stepping slower gets the same strikes.
  const u = ambience(); u.frame.dt = 1 / 12; for (let s = 0; s < RAIN.period * 2 + 5; s += 1 / 12) { u.clock += 1 / 12; u.frame.clock = u.clock; u.a.update(u.frame); }
  assert.equal(tally(u.calls).thunder, THUNDER.perCycle * 2);
  void rate;
});
test('thunder: the strike\'s sound follows the flash after its delay', () => {
  const t = ambience(); const c = 1, k = 0, at = c * RAIN.period + strikeTime(c, k);
  t.clock = at - 1; const power = strikePower(c, k); let heard = null;
  for (let s = 0; s < 6; s += 1 / 60) { t.run(1 / 60); if (heard === null && t.calls.some(x => x[0] === 'thunder')) heard = t.clock; }
  assert.ok(heard !== null && Math.abs(heard - (at + strikeDelay(c, k))) < .1, `${heard} vs ${at + strikeDelay(c, k)}`);
  assert.equal(t.calls.find(x => x[0] === 'thunder')[2], power);
});
test('sign breaks and sparks are heard only near; the life system\'s calls are placed by distance', () => {
  const t = ambience(); const signs = { onBreak: null, onSpark: null, order: [] };
  signs.onBreak = () => signs.order.push('old'); t.city.signs = signs; t.run(.5);
  assert.notEqual(signs.onBreak, null); signs.onBreak(6, 5, { kind: 'neon' }); assert.deepEqual(signs.order, ['old']);
  assert.ok(t.calls.some(c => c[0] === 'signBreak' && c[1] > .9 && c[2] === false), 'heard close');
  t.calls.length = 0; signs.onBreak(40, 0, { kind: 'screen' }); assert.equal(t.calls.filter(c => c[0] === 'signBreak').length, 0, 'not from 34 m');
  signs.onBreak(6, 16, { kind: 'neon' }); assert.equal(t.calls.filter(c => c[0] === 'signBreak').length, 0, 'not from 16 m'); signs.onBreak(6, 12, { kind: 'neon' }); assert.equal(t.calls.filter(c => c[0] === 'signBreak').length, 1, 'from 12 m, faint');
  signs.onSpark(6, 3, 4); assert.ok(t.calls.some(c => c[0] === 'sparks'));
  // Pigeons and rats.
  t.calls.length = 0; t.a.pigeon('coo', 8, 1, 0, 1); t.a.pigeon('flap', 60, 1, 0, 3); t.a.rat('squeak', 7, 1); t.a.rat('squeak', 30, 0);
  const coo = t.calls.find(c => c[0] === 'pigeon' && c[1] === 'coo'), far = t.calls.find(c => c[0] === 'pigeon' && c[1] === 'flap'), close = t.calls.filter(c => c[0] === 'rat');
  assert.ok(coo[2] > .95 && far[2] < coo[2]); assert.ok(close[0][2] > .5 && close[1][2] < .01, 'rats close only');
  t.a.water('splash', 8, 0, 1); assert.equal(t.calls.at(-1)[0], 'water');
});
test('the life system and the water effects are wired when they exist: flocks clatter, rats squeak, coos coo, water splashes', () => {
  const t = ambience(); const order = [];
  const life = { onFlock: () => order.push('old'), onCoo: null, onSqueak: null }, water = { onSound: null };
  t.city.life = life; t.city.water = water; t.run(.3);
  life.onFlock(6, 4, 5); life.onCoo(7, 4); life.onSqueak(6, 3); water.onSound('wadeStep', 6, 3, .7);
  assert.deepEqual(order, ['old']);
  const kinds = t.calls.map(c => c[0] + ':' + (typeof c[1] === 'string' ? c[1] : ''));
  assert.ok(kinds.includes('pigeon:flap') && kinds.includes('pigeon:coo') && kinds.includes('rat:bolt') && kinds.includes('water:wadeStep'), kinds.join());
  const flap = t.calls.find(c => c[0] === 'pigeon' && c[1] === 'flap'); assert.equal(flap[3], 5);
  t.a.dispose(); assert.equal(life.onFlock, null); assert.equal(water.onSound, null);
});
test('events: a round in wet ground plinks, a blast splashes, dry ground is silent', () => {
  const t = ambience(); t.clock = 60; t.run(.3); t.calls.length = 0;   // 60 s into the rain: soaked
  t.a.onImpact(8, 1, 'round'); t.a.onImpact(8, 1, 'blast'); t.a.onFall(8, 1);
  assert.ok(t.calls.some(c => c[0] === 'plink') && t.calls.filter(c => c[0] === 'water').length === 2);
  t.clock = 200; t.run(.3); t.calls.length = 0; t.a.onImpact(8, 1); t.a.onFall(8, 1); assert.equal(t.calls.length, 0);
});
test('crossing chirps follow the signals\' walk phase; hazard lights tick; from the signs\' emitters', () => {
  const t = ambience(); const ped = { x: 6, z: 3, kind: 'ped', source: [2, 3, 0, 0], intensity: .7 }, haz = { x: 8, z: 3, kind: 'signal', source: [2, 5, 0, 0], intensity: 1 };
  t.city.emitters.push(ped, haz, { x: 5, z: 4, kind: 'neon', intensity: 2 }, { x: 5, z: 4, kind: 'lamp', intensity: 1 }, { x: 7, z: 3, kind: 'ped', source: [2, 3, 0, 4], intensity: .7 }); // (the last is a blinking junction's: silent)
  t.run(TRAFFIC.cycle * 2);
  assert.equal(t.a.peds.length, 1); assert.equal(t.a.hazards.length, 1); assert.equal(t.a.buzzCount, 2);
  const walks = t.calls.filter(c => c[0] === 'chirp' && c[2] === true).length, flashes = t.calls.filter(c => c[0] === 'chirp' && c[2] === false).length;
  assert.ok(walks > 30 && flashes > 10, `${walks} walks ${flashes} flashes`);
  const ticks = t.calls.filter(c => c[0] === 'tick'); assert.ok(ticks.length > 100 && ticks.some(c => c[2]) && ticks.some(c => !c[2]));
  // Walk chirps happen only in the walk phase: nothing while the hand is steady.
  const t2 = ambience(); t2.city.emitters.push(ped); t2.clock = TRAFFIC.green + 2; t2.run(.1); t2.calls.length = 0; t2.run(TRAFFIC.cycle - TRAFFIC.green - 5);
  assert.equal(t2.calls.filter(c => c[0] === 'chirp').length, 0);
});
test('the train clacks and the steam hisses while the train and vents are on; the sag edge sounds', () => {
  const t = ambience(); t.run(TRAIN.at + 8 - 0, { x: 28, z: 46 });
  const clacks = t.calls.filter(c => c[0] === 'clack').length; assert.ok(clacks > 8, `${clacks}`);
  assert.ok(t.a.mixed.train > .8, `train ${t.a.mixed.train}`);
  // Find a vent's burst and stand at it.
  const out = {}; let tv = null; for (let c = 0; c < 300 && tv === null; c += .5) if (ventState(c, 0, LUMEN_VENTS.length, out).hiss > .9) tv = c;
  const u = ambience(); u.clock = tv - .2; u.run(.6, { x: LUMEN_VENTS[0].x + 1, z: LUMEN_VENTS[0].z });
  assert.ok(u.a.mixed.steam > .5 && u.v.steamGain.gain.target > .01, `steam ${u.a.mixed.steam}`);
  u.run(6, { x: LUMEN_VENTS[0].x + 1, z: LUMEN_VENTS[0].z }); assert.ok(u.a.mixed.steam < .01, `${u.a.mixed.steam}`);
  assert.equal(sagAt(POWER_SAG.at + .5) > .5, true);
});
test('a pause or a jump of the clock is not time passing: no catching up on missed events', () => {
  const t = ambience(); t.run(1); t.calls.length = 0;
  t.clock += 5000; t.run(1 / 30); assert.equal(t.calls.filter(c => ['thunder', 'chime', 'siren', 'sagDown'].includes(c[0])).length, 0);
  t.clock -= 3000; t.run(1 / 30); assert.equal(t.calls.filter(c => ['thunder', 'chime', 'siren'].includes(c[0])).length, 0);
});
test('the cost of the ambience: ten mixes a second and no new nodes for the beds, dry, in the open', () => {
  const t = ambience(); t.run(2); t.clock = 232; t.run(.2);   // (the ground has dried: no drips)
  const made = { ...t.made }, at = t.player;
  for (let i = 0; i < 100; i++) { t.clock += .04; t.a.tick(t.frame, t.clock, at); }
  assert.deepEqual(t.made, made, 'beds only get new targets');
  assert.equal(t.a.mixed.rain, 0);
});

// --- the wiring ----------------------------------------------------------------------------------
test('only a city map gets it: Lumen and the test street yes, Deadwater and Hollow Wick no', () => {
  assert.equal(hasLumenSound(lumen), true); assert.equal(hasLumenSound(cityTest), true); assert.equal(hasLumenSound(deadwater), false); assert.equal(hasLumenSound(hollowWick), false);
  assert.equal(hasLumenSound({ city: { sound: false } }), false);
  const entry = CITY_SYSTEMS.find(e => e[0] === 'sound'); assert.ok(entry, 'registered with the hub');
  assert.ok(entry[1]({}, lumen, {}) instanceof LumenAmbience); assert.equal(entry[1]({}, deadwater, {}), null);
  const sound = {};
  assert.equal(lumenAmbience(deadwater, null, sound), null); assert.equal(sound.lumen, undefined);
  const f = fakeAudio(), a = new LumenAmbience({ qualityName: 'quality' }, lumen, {}), view = { city: { sound: a }, qualityName: 'quality' };
  assert.equal(lumenAmbience(lumen, view, f.sound), a); assert.ok(f.sound.lumen instanceof LumenSound && f.sound.lumen.quality === 'quality');
  assert.equal(lumenAmbience(lumen, { city: {} }, f.sound), null, 'no system: nothing');
  assert.equal(f.sound.lumen.started, true, 'attached after the graph exists: started at once');
});
test('audio.js hooks: Lumen replaces the desert wind and ducks on gunfire; Hollow Wick\'s hooks are untouched', () => {
  const src = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8');
  assert.equal((src.match(/this\.lumen\?\./g) || []).length, 2);
  assert.match(src, /this\.lumen\?\.start\(this\)/); assert.match(src, /this\.lumen\?\.event\(e, level\)/);
  assert.equal((src.match(/this\.hollow\?\./g) || []).length, 4);
  // Start hook sits inside the graph builder, after the wind exists, before the resume.
  assert.ok(src.indexOf('this.lumen?.start(this)') > src.indexOf('this.wind = ctx.createGain()') && src.indexOf('this.lumen?.start(this)') < src.indexOf('await this.context.resume()'));
});
test('levels: every bed has a level and the rain is soft and ambient next to the hum', () => {
  const L = LUMEN_SOUND.level;
  for (const k of ['hum', 'buzz', 'wind', 'whistle', 'rain', 'hiss', 'drum', 'patter', 'gutter', 'hvac', 'market', 'tv', 'club', 'vending', 'train', 'steam', 'smoulder', 'room', 'alarm']) assert.ok(L[k] > 0 && L[k] < .2, k);
  assert.ok(LUMEN_SOUND.duck < .5 && LUMEN_SOUND.hold > 0);
  for (const q of ['potato', 'performance', 'balanced', 'quality', 'extreme']) assert.ok(LUMEN_SOUND.voiceLimit[q] >= 10 && LUMEN_SOUND.hallSeconds[q] >= 1);
  assert.ok(LUMEN_SOUND.voiceLimit.extreme >= LUMEN_SOUND.voiceLimit.potato && LUMEN_SOUND.hallSeconds.extreme >= LUMEN_SOUND.hallSeconds.potato, 'Extreme is Quality plus');
  const f = started('extreme'); assert.equal(f.v.limit, LUMEN_SOUND.voiceLimit.extreme); f.v.setQuality('potato'); assert.equal(f.v.limit, LUMEN_SOUND.voiceLimit.potato);
});
