// effects/lumen-water.js and effects/lumen-water-places.js (Lumen stage 3): the
// water effects' pools per preset, that an event allocates nothing and stays
// out of the rooms, the shoe prints' four seconds, the drains and spouts
// standing in the same open-air places every load, and that the materials
// exist before play.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const { lumen } = await import('../src/maps/lumen.js');
const { cityTest } = await import('../src/maps/city-test.js');
const { WaterSystem, WATER, WATER_FX, WATER_LOOK, runoffAt, dripAt, flowAt, steamAt } = await import('../src/effects/lumen-water.js');
const { waterPlaces, gutterRuns, planGutters, planSpouts, planAwnings, planLedges, outdoorsTest, insidePoly, WATER_PLACES, HOT_SPOTS } = await import('../src/effects/lumen-water-places.js');
const { RAIN } = await import('../src/effects/rain.js');
const { CITY_SYSTEMS } = await import('../src/render/city-features.js');
const { buildingContains } = await import('../src/map-kit.js');

const PRESETS = ['potato', 'performance', 'balanced', 'quality', 'extreme'];

const cityFor = () => ({ uniforms: {
  time: { value: 10 }, wetness: { value: 1 }, rain: { value: 1 }, sag: { value: 0 },
  puddleMask: { value: null }, roofMask: { value: null }, maskBounds: { value: new THREE.Vector4(-1, -1, 1, 1) },
  mirrorMap: { value: null }, mirrorMatrix: { value: new THREE.Matrix4() }, mirrorStrength: { value: 0 } }, emitters: [] });
const make = (quality = 'extreme', map = lumen) => {
  const view = { scene: new THREE.Scene(), focus: new THREE.Vector3(6, 0, 0), qualityName: quality, camera: new THREE.PerspectiveCamera() };
  const city = cityFor();
  return { view, city, water: new WaterSystem(view, map, city) };
};

// Open wet street with no puddle (the Crossroads); a spot in the first puddle; a room's floor.
const STREET = [6, 0];
const puddle = lumen.city.puddles[0];
const room = lumen.buildings.find(b => b.id === 'clinic/surgery');

test('the hub knows the water system, and Lumen turns it on', () => {
  assert.ok(CITY_SYSTEMS.some(([flag]) => flag === 'water'), 'registered under map.city.water');
  assert.equal(lumen.city.water, true);
});

test('the presets: Extreme is Quality plus, every rung at least the one below, Potato is splash only', () => {
  for (const key of Object.keys(WATER.presets.extreme)) {
    for (let i = 1; i < PRESETS.length; i++) {
      const lower = WATER.presets[PRESETS[i - 1]][key], upper = WATER.presets[PRESETS[i]][key];
      assert.ok(typeof lower === 'boolean' ? upper >= lower : upper >= lower, `${key}: ${PRESETS[i]} (${upper}) >= ${PRESETS[i - 1]} (${lower})`);
    }
  }
  const p = WATER.presets.potato;
  assert.equal(p.rings + p.prints + p.ponds + p.drips + p.puffs + p.sparks, 0, 'Potato: wet darkening, footstep splashes, rain sound only');
  assert.ok(p.splashes > 0);
  assert.equal(WATER.presets.performance.ponds, 0); assert.ok(WATER.presets.performance.drips > 0 && WATER.presets.performance.prints > 0);
  assert.ok(WATER.presets.balanced.ponds > 0 && WATER.presets.balanced.gutters && WATER.presets.balanced.puffs > 0);
  assert.ok(WATER.presets.quality.scatterCrowns > 0 && WATER.presets.quality.curtains && WATER.presets.quality.sparks > 0);
  assert.equal(WATER.presets.balanced.curtains, false); assert.equal(WATER.presets.balanced.sparks, 0);
});

test('pools are sized once at Extreme and a preset uses its share; a full pool overwrites its oldest, never grows', () => {
  const { water } = make('extreme');
  const before = Object.fromEntries(['decal', 'crown', 'fall', 'steam'].map(k => [k, Object.values(water[k].attrs).map(a => a.array)]));
  const lengths = Object.fromEntries(Object.entries(before).map(([k, arrays]) => [k, arrays.map(a => a.length)]));
  const puddles = lumen.city.puddles.length;
  for (const name of PRESETS) {
    water.setQuality(name);
    const s = WATER.presets[name], feet = waterPlaces(lumen).spouts.length * s.spoutSplashes;
    assert.equal(water.rings.size, s.rings); assert.equal(water.prints.size, s.prints); assert.equal(water.stains.size, s.stains);
    assert.equal(water.splashes.size, s.splashes);
    assert.ok(water.pondCount <= s.ponds && (s.ponds === 0 ? water.pondCount === 0 : water.pondCount >= Math.min(puddles, s.ponds) - 1), `${name} ripples ${water.pondCount}/${s.ponds}`);
    assert.equal(water.decalCount, s.rings + s.prints + s.stains + water.pondCount);
    assert.equal(water.crownCount, s.splashes + feet + s.puddleCrowns + s.scatterCrowns);
    assert.equal(water.decal.geometry.instanceCount, water.decalCount); assert.equal(water.crown.geometry.instanceCount, water.crownCount);
    assert.equal(water.steamCount, water.places.steam.length * s.puffs); assert.equal(water.sparkCount, water.places.sparks.length * s.sparks);
    // A storm of events on wet ground: never more live than the pool holds.
    water.city.uniforms.time.value = 50;
    for (let i = 0; i < 3000; i++) {
      water.onStep(STREET[0] + (i % 7) * .1, STREET[1] + (i % 5) * .1, 5, i % 11 === 0);
      water.onImpact(STREET[0] + 1, STREET[1] + 1, i % 9 === 0 ? 'blast' : 'round');
      water.onCasing(STREET[0] - 1, STREET[1]); water.onFall(STREET[0], STREET[1] - 1);
      water.onBlood(puddle.x, puddle.z, .6);
    }
    const now = 50.2;
    assert.ok(water.liveDecals(now) <= s.rings + s.prints + s.stains, `${name}: ${water.liveDecals(now)} live decals`);
    assert.ok(water.liveDecals(now, 1) <= s.prints, `${name}: prints capped`);
    assert.ok(water.liveCrowns(now) <= s.splashes, `${name}: crowns capped`);
    if (s.rings) assert.equal(water.liveDecals(now, 0), s.rings, `${name}: the ring buffer is full and wrapped`);
  }
  // Nothing was allocated: the same typed arrays, the same sizes.
  for (const k of Object.keys(before)) Object.values(water[k].attrs).forEach((a, i) => { assert.equal(a.array, before[k][i], `${k} attribute ${i} is the same array`); assert.equal(a.array.length, lengths[k][i]); });
});

test('an event allocates nothing: no new array, mesh or texture, the heap does not grow with the count', () => {
  const { view, water } = make('extreme');
  const meshes = view.scene.children.length;
  // Warm the paths once, then measure a large run.
  for (let i = 0; i < 2000; i++) { water.onStep(STREET[0], STREET[1], 5, false); water.onBlood(puddle.x, puddle.z, .5); water.onImpact(STREET[0], STREET[1], 'blast'); }
  if (global.gc) global.gc();
  const start = process.memoryUsage().heapUsed;
  for (let i = 0; i < 200000; i++) {
    water.city.uniforms.time.value = 10 + i * .001;
    water.onStep(STREET[0] + (i % 13) * .05, STREET[1], 4 + (i % 3), i % 17 === 0);
    water.onImpact(STREET[0], STREET[1] + (i % 5) * .1, i % 23 === 0 ? 'blast' : 'round');
    water.onBlood(puddle.x, puddle.z, .5); water.onCasing(STREET[0], STREET[1]); water.onFall(STREET[0], STREET[1]);
  }
  const grown = (process.memoryUsage().heapUsed - start) / 1e6;
  assert.ok(grown < 8, `1.2 million events grew the heap by ${grown.toFixed(1)} MB`);
  assert.equal(view.scene.children.length, meshes, 'no mesh made by an event');
});

test('nothing is spawned indoors: every room is dry, whatever the weather', () => {
  const { water } = make('extreme');
  water.city.uniforms.time.value = 20;
  let indoors = 0;
  for (const b of lumen.buildings) {
    // The room's middle, and a point in each of its corners' insides.
    const spots = [[b.x, b.z]];
    if (!b.quad) spots.push([b.x - b.w / 2 + .6, b.z - b.d / 2 + .6], [b.x + b.w / 2 - .6, b.z + b.d / 2 - .6]);
    for (const [x, z] of spots) {
      if (b.quad ? !insideQuad(b.quad, x, z) : false) continue;
      if (!buildingContains(b, { x, z })) continue;
      indoors++;
      water.onStep(x, z, 5, true); water.onImpact(x, z, 'blast'); water.onImpact(x, z, 'round'); water.onBlood(x, z, 1); water.onCasing(x, z); water.onFall(x, z);
      assert.equal(water.wetAt(x, z), false, `${b.id} at ${x.toFixed(1)}, ${z.toFixed(1)} is dry`);
    }
  }
  assert.ok(indoors > 60, `checked ${indoors} indoor spots`);
  assert.equal(water.liveDecals(20.05), 0, 'no ring, print or stain indoors');
  assert.equal(water.liveCrowns(20.05), 0, 'no splash indoors');
  // The same calls outside do spawn.
  water.onStep(STREET[0], STREET[1], 5, false); water.onImpact(STREET[0] + 2, STREET[1], 'round');
  assert.ok(water.liveDecals(20.05) >= 3 && water.liveCrowns(20.05) >= 1);
  // Placed things stand in the open air too.
  const outdoors = outdoorsTest(lumen), p = waterPlaces(lumen);
  for (const s of p.spouts) assert.ok(outdoors(s.x, s.z), `spout ${s.id} in the open`);
  for (const d of p.drains) assert.ok(outdoors(d.x, d.z), `drain at ${d.x}, ${d.z} in the open`);
  for (const a of p.awnings) for (const [x, z] of [[a.x0, a.z0], [a.x1, a.z1]]) assert.ok(outdoors(x, z), `awning ${a.id} in the open`);
  for (let i = 0; i < p.ledges.length; i += 4) assert.ok(outdoors(p.ledges[i], p.ledges[i + 2]), `ledge at ${p.ledges[i]}, ${p.ledges[i + 2]} in the open`);
  for (const s of [...p.steam, ...p.sparks]) assert.ok(outdoors(s.x, s.z), `${s.id} in the open`);
});
const insideQuad = (quad, x, z) => insidePoly(quad, x, z);

test('dry ground shows nothing but a puddle does: a step needs wetness above 0.2 or standing water', () => {
  const { water, city } = make('extreme');
  city.uniforms.wetness.value = 0; city.uniforms.time.value = 30;
  water.onStep(STREET[0], STREET[1], 5, false);
  assert.equal(water.liveDecals(30.05), 0, 'dry street: nothing');
  water.onStep(puddle.x, puddle.z, 5, false);
  assert.ok(water.liveDecals(30.05, 0) >= 1, 'a puddle rings even between showers');
  assert.equal(water.liveDecals(30.05, 1), 0, 'and leaves no print in the middle of the water');
  water.onBlood(STREET[0], STREET[1], 1); assert.equal(water.liveDecals(30.05, 2), 0, 'no blood in water on dry ground');
  city.uniforms.wetness.value = .19; water.onStep(STREET[0] + 3, STREET[1], 5, false); assert.equal(water.liveDecals(30.05, 1), 0, 'just under the threshold');
  city.uniforms.wetness.value = .21; water.onStep(STREET[0] + 3, STREET[1], 5, false); assert.equal(water.liveDecals(30.05, 1), 1, 'just over it');
});

test('a wet shoe print stays about four seconds, then is gone; a ring is much shorter', () => {
  const { water } = make('balanced');
  assert.equal(WATER_FX.printLife, 4);
  water.city.uniforms.time.value = 100;
  water.onStep(STREET[0], STREET[1], 5, false);
  assert.equal(water.liveDecals(100.01, 1), 1);
  const t = water.decal.attrs.aTime.array, i = water.prints.start;
  assert.equal(t[i * 4 + 1], 4, 'life 4 s'); assert.equal(t[i * 4 + 2], 1, 'kind: print'); assert.equal(t[i * 4], 100, 'born now');
  assert.equal(water.liveDecals(103.9, 1), 1, 'still there at 3.9 s');
  assert.equal(water.liveDecals(104.1, 1), 0, 'gone by 4.1 s');
  assert.ok(water.liveDecals(101.5, 0) === 0, 'the ring is over by 1.5 s');
  // Walking leaves a line of prints, each turned along the walk, feet either side of it.
  const w2 = make('balanced').water;
  for (let k = 0; k < 6; k++) { w2.city.uniforms.time.value = 200 + k * .3; w2.onStep(STREET[0] + k * .7, STREET[1] + 4, 4, false); }
  const a = w2.decal.attrs, first = w2.prints.start;
  for (let k = 1; k < 6; k++) {
    const o = (first + k) * 4;
    assert.ok(Math.abs(Math.cos(a.aExtra.array[o])) > .99, `print ${k} points east (${a.aExtra.array[o].toFixed(2)})`);
  }
  const z = [0, 1, 2, 3, 4, 5].map(k => a.aPlace.array[(first + k) * 4 + 1]);
  assert.ok(z[2] !== z[3] && Math.abs(z[2] - z[3]) > .1, 'feet alternate sides');
});

test('Potato throws a splash and nothing flat; Performance rings and prints but no crowns for rain', () => {
  const { water } = make('potato');
  water.city.uniforms.time.value = 40;
  water.onStep(STREET[0], STREET[1], 5, false); water.onImpact(STREET[0], STREET[1], 'round');
  assert.equal(water.liveDecals(40.05), 0); assert.ok(water.liveCrowns(40.05) >= 1);
  water.setQuality('performance');
  water.onStep(STREET[0] + 2, STREET[1], 5, false);
  assert.ok(water.liveDecals(40.05, 0) >= 1 && water.liveDecals(40.05, 1) >= 1);
  assert.equal(water.crownCount, WATER.presets.performance.splashes, 'no rain crowns or spout feet on Performance');
});

test('blood in water is thin and pale, drifts toward a drain by a kerb on Quality, never a team colour', () => {
  const { water } = make('quality');
  const G = water.places.pieces[0];
  water.uniforms.amounts.value.x = 1;
  water.city.uniforms.time.value = 5;
  water.onBlood(G.x1 - (G.x1 - G.x0) * .1, G.z1 - (G.z1 - G.z0) * .1 + .2, .8);
  const a = water.decal.attrs, s = water.stains.start * 4;
  assert.equal(a.aTime.array[s + 2], 2, 'a stain');
  assert.ok(a.aTime.array[s + 1] >= WATER_FX.bloodLife);
  const speed = Math.hypot(a.aDrift.array[water.stains.start * 2], a.aDrift.array[water.stains.start * 2 + 1]);
  assert.ok(Math.abs(speed - WATER_FX.gutterDrift) < 1e-4, `carried along the gutter at ${speed}`);
  assert.equal(WATER_LOOK.bloodDeep, '#8c1c2a', "blood's own colour");
  const far = (a, b) => { const A = new THREE.Color(a), B = new THREE.Color(b); return Math.hypot(A.r - B.r, A.g - B.g, A.b - B.b); };
  for (const key of ['water', 'foam', 'steam', 'spark', 'bloodDeep', 'bloodPale', 'bloodRim']) for (const team of ['#ffb020', '#2ee6ff', '#b77bff']) {
    assert.ok(far(WATER_LOOK[key], team) > .3, `${key} ${WATER_LOOK[key]} is clear of ${team}`);
  }
  // Balanced does not carry blood along; it only spreads in place.
  const b = make('balanced').water; b.uniforms.amounts.value.x = 1; b.city.uniforms.time.value = 5;
  b.onBlood(G.x1, G.z1, .8);
  assert.equal(b.decal.attrs.aDrift.array[b.stains.start * 2], 0); assert.equal(b.decal.attrs.aDrift.array[b.stains.start * 2 + 1], 0);
});

test('drains, gutters, downspouts and awnings are the same every load and stand where they should', () => {
  const first = waterPlaces(lumen), again = waterPlaces({ ...lumen }); // (a fresh object: a fresh computation, not the cache)
  assert.notEqual(first, again);
  assert.deepEqual(JSON.parse(JSON.stringify(again)), JSON.parse(JSON.stringify(first)));
  // Twice through the planners directly.
  const outdoors = outdoorsTest(lumen);
  assert.deepEqual(planSpouts(lumen, outdoors), planSpouts(lumen, outdoors));
  assert.deepEqual(planAwnings(lumen, outdoors), planAwnings(lumen, outdoors));
  assert.deepEqual(planLedges(lumen, outdoors, first.awnings), planLedges(lumen, outdoors, first.awnings));
  // Drains: about every 20 m along each run of kerb, each with a piece of gutter from either side that ends on it.
  assert.ok(first.runs.length >= 20 && first.drains.length >= 30, `${first.runs.length} runs, ${first.drains.length} drains`);
  for (const run of first.runs) {
    const mine = first.drains.filter(d => d.road === run.road && (d.x - run.ax) * run.ux + (d.z - run.az) * run.uz >= -.01 && (d.x - run.ax) * run.ux + (d.z - run.az) * run.uz <= run.length + .01 && Math.abs((d.x - run.ax) * run.nx + (d.z - run.az) * run.nz) < .01);
    const expected = Math.max(1, Math.round(run.length / WATER_PLACES.drainSpacing));
    assert.equal(mine.length, expected, `${run.road} run of ${run.length.toFixed(1)} m has ${expected} drains`);
    const along = mine.map(d => (d.x - run.ax) * run.ux + (d.z - run.az) * run.uz).sort((x, y) => x - y);
    for (let i = 1; i < along.length; i++) assert.ok(along[i] - along[i - 1] < WATER_PLACES.drainSpacing * 1.5 && along[i] - along[i - 1] > WATER_PLACES.drainSpacing * .5, 'spaced about every 20 m');
  }
  for (const p of first.pieces) assert.ok(first.drains.some(d => Math.hypot(d.x - p.x1, d.z - p.z1) < .02), 'every gutter piece runs to a drain');
  // The gutters lie on the ground's own gutter strip: 0.2 m in from a kerb.
  for (const r of first.runs) if (r.road === 'boulevard') assert.ok(Math.abs(Math.abs(r.az) - 6.8) < .01, `boulevard gutter at |z| ${Math.abs(r.az)}`);
  // Downspouts: on low buildings at least 3.5 m tall, none on a tower, clear of the doorways.
  const low = new Map(lumen.cityBuildings.filter(b => b.low).map(b => [b.id, b]));
  assert.ok(first.spouts.length >= 15, `${first.spouts.length} downspouts`);
  for (const s of first.spouts) {
    const b = low.get(s.building); assert.ok(b && b.height >= WATER_PLACES.spoutMinHeight, `${s.id} is on a low building`);
    for (const d of b.doors || []) assert.ok(Math.hypot(d.at[0] - s.x, d.at[1] - s.z) >= WATER_PLACES.spoutDoorClear - 1e-9, `${s.id} clear of a doorway`);
    assert.equal(s.top, b.height - .15);
  }
  assert.equal(first.spouts.some(s => s.building === 'bus'), false, 'not the bus');
  assert.ok(first.awnings.length >= 4 && first.awnings.length <= WATER_PLACES.awningCap, `${first.awnings.length} awnings`);
  for (const a of first.awnings) assert.ok(low.has(a.building));
  assert.ok(first.ledges.length >= 4 * 40, 'ledges to drip from');
});

test('the test street has no roads: spouts and an awning, no gutters', () => {
  const p = waterPlaces(cityTest);
  assert.equal(p.pieces.length, 0); assert.equal(p.drains.length, 0);
  assert.ok(p.spouts.length >= 1 && p.spouts.every(s => s.building === 'low-shop'));
  const { water } = make('balanced', cityTest);
  assert.ok(water.streams.indexCount > 0);
  assert.equal(water.steamCount, 0);
});

test('the hot spots: steam and sparks, none in a room, none near a team colour; the list is frozen', () => {
  assert.ok(Object.isFrozen(HOT_SPOTS) && Object.isFrozen(HOT_SPOTS.steam));
  assert.ok(HOT_SPOTS.steam.some(s => Math.hypot(s.x - 27.2, s.z + 4) < 3), 'the pileup');
  assert.ok(HOT_SPOTS.sparks.length >= 2);
});

test('the schedule: drips run ~60 s after the rain, spouts ~18 s, both off before the next shower; all pure functions of the clock', () => {
  const on = RAIN.on;
  assert.equal(runoffAt(on - 1, 60), 1); assert.equal(runoffAt(on, 60), 1);
  assert.ok(Math.abs(runoffAt(on + 30, 60) - .5) < 1e-9); assert.equal(runoffAt(on + 60, 60), 0); assert.equal(runoffAt(on + 61, 60), 0);
  assert.ok(dripAt(on + 30) > .2 && dripAt(on + 59) > 0, 'still dripping half a minute on');
  assert.equal(dripAt(on + 60.5), 0); assert.equal(dripAt(RAIN.period - 1), 0);
  assert.ok(runoffAt(3, 18) > 0 && runoffAt(3, 18) < 1, 'roofs soak first'); assert.equal(runoffAt(RAIN.period + 20, 18), runoffAt(20, 18));
  assert.equal(runoffAt(on + 19, 18), 0, 'downspouts stop 18 s after');
  for (let c = 0; c < 600; c += .25) { const a = dripAt(c), b = dripAt(c + .25); assert.ok(a >= 0 && a <= 1 && Math.abs(a - b) < .06, `no jump at ${c}`); }
  assert.equal(flowAt(0, 0), 0); assert.equal(flowAt(1, 1), 1); assert.ok(flowAt(.4, 0) > 0 && flowAt(.4, 0) < .5);
  assert.ok(steamAt(0, 0) === WATER_FX.steamBase && steamAt(1, 1) === 1);
});

test('every material exists from the constructor: five meshes, one material each, no mesh or material made later', () => {
  const { view, water, city } = make('balanced');
  const meshes = view.scene.children.filter(m => m.name?.startsWith('lumen-water'));
  assert.equal(meshes.length, 5);
  assert.equal(new Set(meshes.map(m => m.material)).size, 5, 'one material per kind of thing');
  const keys = meshes.map(m => m.material.customProgramCacheKey());
  assert.equal(new Set(keys).size, 5); for (const k of keys) assert.match(k, /^lumen-water-/);
  for (const m of meshes) { assert.equal(m.frustumCulled, false); assert.equal(m.castShadow, false); }
  // Preset changes, events, frames and a warm-up add nothing.
  for (const name of PRESETS) water.setQuality(name);
  for (let i = 0; i < 50; i++) { city.uniforms.time.value += .1; water.onStep(STREET[0], STREET[1], 5, false); water.update({ clock: 100 + i, focus: new THREE.Vector3(6, 0, 0) }); }
  water.warm();
  assert.equal(view.scene.children.length, 5);
  assert.ok(meshes.every(m => m.visible), 'the warm-up shows every mesh');
  // Materials carry no per-preset define, so nothing is rebuilt by a preset.
  for (const m of meshes) assert.deepEqual(Object.keys(m.material.defines || {}), []);
});

test('a frame switches each mesh on only when it has something to show', () => {
  const { water, city } = make('balanced');
  const frame = (clock, x = 6, z = 0) => ({ clock, focus: new THREE.Vector3(x, 0, z), dt: 1 / 60 });
  const on = () => Object.fromEntries([['decals', water.decalMesh], ['crowns', water.crownMesh], ['streams', water.streamMesh], ['drops', water.fallMesh], ['steam', water.steamMesh]].map(([k, m]) => [k, m.visible]));
  // Dry, nothing happening: only the steam on the pileup's hot metal.
  city.uniforms.rain.value = 0; city.uniforms.wetness.value = 0; city.uniforms.time.value = 500;
  water.update(frame(RAIN.period - 5, 24, -4));
  assert.deepEqual(on(), { decals: false, crowns: false, streams: false, drops: false, steam: true });
  // Far from every hot thing: not even that.
  water.update(frame(RAIN.period - 5, -60, -45)); assert.equal(water.steamMesh.visible, false);
  // Full rain: ripples, crowns, streams and drips.
  city.uniforms.rain.value = 1; city.uniforms.wetness.value = 1;
  water.update(frame(60, 6, 0));
  const r = on(); assert.ok(r.decals && r.crowns && r.streams && r.drops, JSON.stringify(r));
  // Potato: no gutters, no ripples; Performance: drips but no streams.
  water.setQuality('performance'); water.update(frame(60, 6, 0));
  assert.equal(water.streamMesh.visible, false); assert.equal(water.decalMesh.visible, false); assert.ok(water.fallMesh.visible);
  water.setQuality('potato'); water.update(frame(60, 6, 0));
  assert.deepEqual(on(), { decals: false, crowns: false, streams: false, drops: false, steam: false });
  // Drips stop a minute after the rain.
  water.setQuality('balanced'); city.uniforms.rain.value = 0;
  water.update(frame(RAIN.on + 65, 6, 0)); assert.equal(water.fallMesh.visible, false);
});

test('drips pick the nearest ledges and signs, and the pool never holds more than the preset says', () => {
  const { water, city } = make('balanced');
  city.emitters.push({ x: 8, y: 4.5, z: 3, kind: 'neon', id: 900 }, { x: 9, y: 4.5, z: 3, kind: 'lamp', id: 901 }, { x: 2000, y: 4.5, z: 3, kind: 'neon', id: 902 });
  city.uniforms.time.value = 100;
  water.update({ clock: 60, focus: new THREE.Vector3(8, 0, 3), dt: .016 });
  assert.equal(water.pickedCount, WATER.presets.balanced.drips, 'a full pool near the Crossroads');
  const n = water.pickedCount, o = water.fall.attrs.aOrigin.array;
  for (let i = 1; i < n; i++) assert.ok(water.pickedD[i] >= water.pickedD[i - 1], 'nearest first');
  assert.ok(Array.from({ length: n }, (_, i) => o[i * 4]).includes(8), 'the neon sign drips, the lamp and the far one do not');
  assert.ok(!Array.from({ length: n }, (_, i) => o[i * 4]).includes(9)); assert.ok(!Array.from({ length: n }, (_, i) => o[i * 4]).includes(2000));
  // Far from any ledge: nothing to pick.
  city.uniforms.time.value = 200;
  water.update({ clock: 60, focus: new THREE.Vector3(500, 0, 500), dt: .016 });
  assert.equal(water.pickedCount, 0); assert.equal(water.fallMesh.visible, false);
});
