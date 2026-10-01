import test from 'node:test';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import vm from 'node:vm';
import * as THREE from 'three';
import { LightPool, LIGHT_POOL } from '../src/render/light-pool.js';
import { CITY_SYSTEMS } from '../src/render/city-features.js';

const DT = 1 / 60;

// A view, a hub and a frame that hold only what the pool reads.
function makePool(quality, emitters = [], focus = new THREE.Vector3()) {
  const view = { scene: new THREE.Scene() };
  const city = { emitters, uniforms: { sag: { value: 0 } } };
  const pool = new LightPool(view, {}, city);
  pool.setQuality(quality);
  const frame = { sim: null, dt: DT, elapsed: 0, clock: 0, camera: null, focus, player: null, others: [] };
  return { view, city, pool, frame, focus };
}
const pointLights = scene => scene.children.filter(o => o.isPointLight);
const emitter = (x, z, extra = {}) => ({ x, y: 4.5, z, colour: '#ffe9c4', intensity: 1, reach: 10, kind: 'lamp', ...extra });
function run(pool, frame, seconds) { for (let i = 0, n = Math.round(seconds / DT); i < n; i++) { frame.elapsed += DT; pool.update(frame); } }
// The x of every light that is giving light.
const lit = pool => pool.slots.filter(s => s.light.intensity > 0.01).map(s => s.light.position.x).sort((a, b) => a - b);

test('the pool is registered as the city system "lights"', () => {
  assert.ok(CITY_SYSTEMS.some(([flag]) => flag === 'lights'));
});

test('lights per preset: 0 / 0 / 2 / 4 / 6, no shadows, all present and dark until used', () => {
  const expected = { potato: 0, performance: 0, balanced: 2, quality: 4, extreme: 6 };
  assert.deepEqual({ ...LIGHT_POOL.counts }, expected);
  for (const [name, count] of Object.entries(expected)) {
    const { view } = makePool(name, [emitter(0, 0)]);
    const lights = pointLights(view.scene);
    assert.equal(lights.length, count, name);
    for (const light of lights) {
      assert.equal(light.castShadow, false);
      assert.equal(light.visible, true, 'never hidden: the light count is part of every shader key');
      assert.equal(light.intensity, 0);
      assert.deepEqual(light.color.toArray(), [0, 0, 0]);
    }
  }
});

test('setQuality adds and removes lights to match, and only there', () => {
  const { view, pool, frame } = makePool('balanced', [emitter(0, 0), emitter(5, 0), emitter(-5, 0)]);
  assert.equal(pointLights(view.scene).length, 2);
  pool.setQuality('extreme'); assert.equal(pointLights(view.scene).length, 6);
  pool.setQuality('quality'); assert.equal(pointLights(view.scene).length, 4);
  pool.setQuality('potato'); assert.equal(pointLights(view.scene).length, 0);
  run(pool, frame, 1); // no lights: update does nothing and adds none
  assert.equal(pointLights(view.scene).length, 0);
  pool.setQuality('quality');
  const before = pool.slots.map(s => s.light);
  pool.setQuality('quality'); // same preset: same lights
  assert.deepEqual(pool.slots.map(s => s.light), before);
  pool.dispose(); assert.equal(pointLights(view.scene).length, 0);
});

test('the count and the very same lights stay through updates, lit or not', () => {
  const emitters = Array.from({ length: 40 }, (_, i) => emitter(-40 + i * 2.1, (i % 5) * 3, { intensity: .5 + (i % 4) * .3 }));
  const { view, pool, frame, focus } = makePool('quality', emitters);
  const lights = pointLights(view.scene), slots = [...pool.slots];
  for (let i = 0; i < 600; i++) { focus.x = Math.sin(i / 50) * 30; run(pool, frame, DT); }
  assert.equal(pointLights(view.scene).length, 4);
  assert.deepEqual(pointLights(view.scene), lights);
  assert.deepEqual(pool.slots, slots);
  for (const light of lights) assert.equal(light.visible, true);
});

test('the lights go to the emitters nearest the focus, and follow it', () => {
  const emitters = [-30, -10, 10, 30].map(x => emitter(x, 0));
  const { pool, frame, focus } = makePool('balanced', emitters);
  focus.set(-20, 0, 0); run(pool, frame, 1.5);
  assert.deepEqual(lit(pool), [-30, -10]);
  focus.set(20, 0, 0); run(pool, frame, 1.5);
  assert.deepEqual(lit(pool), [10, 30]);
});

test('brighter emitters win over nearer dim ones, and emitters beyond the view reach are never lit', () => {
  const dim = emitter(3, 0, { intensity: .2 }), mid = emitter(5, 0, { intensity: .6 }), bright = emitter(8, 0, { intensity: 1.5 });
  const beyond = emitter(LIGHT_POOL.viewReach + 4, 0, { intensity: 50 });
  const { pool, frame } = makePool('balanced', [dim, mid, bright, beyond]);
  run(pool, frame, 1);
  assert.deepEqual(lit(pool), [5, 8], 'the dim lamp is nearest but the two brighter ones take the two lights');
  const far = makePool('balanced', [beyond]);
  run(far.pool, far.frame, 1);
  assert.deepEqual(lit(far.pool), []);
});

test('hysteresis: a slightly nearer emitter does not steal a light, a clearly nearer one does', () => {
  const a = emitter(5, 0), b = emitter(-6, 0);
  const { pool, frame, city } = makePool('balanced', [a, b]);
  run(pool, frame, 1);
  assert.deepEqual(lit(pool), [-6, 5]);
  const near = emitter(4.6, 0); // a hair nearer than a
  city.emitters.push(near);
  run(pool, frame, 2);
  assert.deepEqual(lit(pool), [-6, 5], 'no hop');
  const clear = emitter(1, 0);
  city.emitters.push(clear);
  run(pool, frame, 2);
  assert.deepEqual(lit(pool), [1, 5], 'a clearly better emitter takes the weaker light (b, at 6 m, loses it)');
});

test('hysteresis: two equal lamps either side of a moving focus do not swap on every step', () => {
  const { pool, frame, focus } = makePool('balanced', [emitter(-10, 0), emitter(10, 0), emitter(0, 12)]);
  let hops = 0, last = null;
  for (let i = 0; i < 600; i++) {
    focus.x = Math.sin(i / 20) * 1.5; // wobbles about the middle
    run(pool, frame, DT);
    const now = pool.slots.map(s => s.emitter?.x + ',' + s.emitter?.z).sort().join('|');
    if (last !== null && now !== last) hops++;
    last = now;
  }
  assert.ok(hops <= 2, `${hops} hops`);
});

test('a light fades in over about 0.3 s and out again', () => {
  const e = emitter(2, 0);
  const { pool, frame } = makePool('balanced', [e]);
  const light = pool.slots[0].light, full = e.intensity * LIGHT_POOL.intensityScale;
  // 9 frames = 0.15 s
  run(pool, frame, 0.15);
  assert.ok(Math.abs(light.intensity / full - .5) < .1, `half way at 0.15 s (${(light.intensity / full).toFixed(2)})`);
  run(pool, frame, 0.05);
  assert.ok(light.intensity < full * .99, 'not full before 0.3 s');
  run(pool, frame, 0.2);
  assert.ok(Math.abs(light.intensity - full) < 1e-6, `full after 0.3 s (${light.intensity})`);
  e.broken = true; run(pool, frame, 0.15);
  assert.ok(light.intensity > 0 && light.intensity < full * .6, 'fading out');
  run(pool, frame, 0.25);
  assert.equal(light.intensity, 0);
  // And once released it is black again, ready to be skipped.
  run(pool, frame, 0.5);
  assert.deepEqual(light.color.toArray(), [0, 0, 0]);
});

test('a light that changes emitter fades out, moves while dark, then fades in', () => {
  const a = emitter(-8, 0), b = emitter(8, 0), c = emitter(0, 20);
  const { pool, frame, focus } = makePool('balanced', [a, b, c]);
  focus.set(0, 0, 0);
  run(pool, frame, 1);
  assert.deepEqual(lit(pool), [-8, 8]);
  // The focus walks north: c becomes the best, and it displaces the weaker of a and b.
  focus.set(0, 0, 20);
  const lights = pool.slots.map(s => s.light);
  const seen = lights.map(l => ({ x: l.position.x, z: l.position.z, i: l.intensity }));
  let sawDark = false, movedLit = 0;
  for (let i = 0; i < 120; i++) {
    run(pool, frame, DT);
    lights.forEach((l, k) => {
      const moved = l.position.x !== seen[k].x || l.position.z !== seen[k].z;
      if (moved && l.intensity > 0) movedLit++; // it must move while dark
      if (moved && l.intensity === 0) sawDark = true;
      seen[k] = { x: l.position.x, z: l.position.z, i: l.intensity };
    });
  }
  assert.ok(sawDark, 'it moved');
  assert.equal(movedLit, 0, 'no light ever moved while lit');
  assert.ok(pool.slots.some(s => s.light.position.z === 20 && s.light.intensity > LIGHT_POOL.intensityScale * .9), 'c is lit at the end'); // (was > 50 at a scale of 55; 46 since the darker night, 2026-09-30)
  assert.equal(lit(pool).length, 2);
});

test('the same emitters again after a pause: nothing moves', () => {
  const { pool, frame } = makePool('quality', [emitter(-3, 0), emitter(3, 0), emitter(0, 4), emitter(0, -4)]);
  run(pool, frame, 1);
  const positions = pool.slots.map(s => s.light.position.toArray().join());
  run(pool, frame, 5);
  assert.deepEqual(pool.slots.map(s => s.light.position.toArray().join()), positions);
});

test('broken emitters are never chosen; one that breaks while lit is dropped and replaced', () => {
  const near = emitter(1, 0, { broken: true }), a = emitter(6, 0), b = emitter(-7, 0);
  const { pool, frame, city } = makePool('balanced', [near, a, b]);
  run(pool, frame, 1);
  assert.deepEqual(lit(pool), [-7, 6]);
  a.broken = true;
  const spare = emitter(10, 0);
  city.emitters.push(spare);
  run(pool, frame, 1.5);
  assert.deepEqual(lit(pool), [-7, 10]);
  // Mended, it is a candidate again.
  near.broken = false;
  run(pool, frame, 1.5);
  assert.ok(lit(pool).includes(1));
});

test('a dimmed emitter (level) gives a dimmer light, and level 0 is not a candidate', () => {
  const dim = emitter(3, 0, { level: .5 }), off = emitter(1, 0, { level: 0 });
  const { pool, frame } = makePool('balanced', [dim, off]);
  run(pool, frame, 1);
  assert.deepEqual(lit(pool), [3]);
  assert.ok(Math.abs(pool.slots.find(s => s.emitter === dim).light.intensity - .5 * LIGHT_POOL.intensityScale) < 1e-6);
});

test('the power sag dims every pool light, and a full sag nearly darkens them', () => {
  const { pool, frame, city } = makePool('quality', [emitter(-3, 0), emitter(3, 0), emitter(0, 4)]);
  run(pool, frame, 1);
  const base = pool.slots.filter(s => s.emitter).map(s => s.light.intensity);
  assert.equal(base.length, 3);
  city.uniforms.sag.value = .5; run(pool, frame, DT);
  pool.slots.filter(s => s.emitter).forEach((s, i) => assert.ok(Math.abs(s.light.intensity / base[i] - (1 - .5 * LIGHT_POOL.sagDim)) < 1e-6));
  city.uniforms.sag.value = 1; run(pool, frame, DT);
  pool.slots.filter(s => s.emitter).forEach((s, i) => assert.ok(s.light.intensity / base[i] <= 1 - LIGHT_POOL.sagDim + 1e-6));
  city.uniforms.sag.value = 0; run(pool, frame, DT);
  pool.slots.filter(s => s.emitter).forEach((s, i) => assert.ok(Math.abs(s.light.intensity - base[i]) < 1e-6));
});

// (The darker night, 2026-09-30: a light takes its emitter's colour LIGHT_POOL.desaturate of the way to its own grey.)
const toned = hex => { const c = new THREE.Color(hex), g = .2126 * c.r + .7152 * c.g + .0722 * c.b, k = LIGHT_POOL.desaturate; return c.setRGB(c.r + (g - c.r) * k, c.g + (g - c.g) * k, c.b + (g - c.b) * k).getHexString(); };
test('colours are copied faithfully (strings, numbers and THREE.Color, toned toward grey), with the emitter\'s own reach', () => {
  const pink = emitter(2, 0, { colour: '#ff40a0', reach: 8 });
  const teal = emitter(-2, 0, { colour: new THREE.Color('#20e0b0'), reach: 100 });
  const tiny = emitter(0, 3, { colour: 0xfcee0a, reach: 1 });
  const { pool, frame } = makePool('quality', [pink, teal, tiny]);
  run(pool, frame, 1);
  const light = e => pool.slots.find(s => s.emitter === e).light;
  assert.equal(light(pink).color.getHexString(), toned('#ff40a0'));
  assert.equal(light(teal).color.getHexString(), toned('#20e0b0'));
  assert.equal(light(tiny).color.getHexString(), toned(0xfcee0a));
  assert.ok(LIGHT_POOL.desaturate > 0 && LIGHT_POOL.desaturate < .6, 'a tint, never grey');
  assert.equal(light(pink).distance, 8);
  assert.equal(light(teal).distance, LIGHT_POOL.maxDistance);
  assert.equal(light(tiny).distance, LIGHT_POOL.minDistance);
  assert.equal(light(pink).decay, LIGHT_POOL.decay);
});

test('a moving emitter drags its light with it', () => {
  const car = emitter(0, 0);
  const { pool, frame } = makePool('balanced', [car]);
  run(pool, frame, 1);
  car.x = 6; car.z = -2;
  run(pool, frame, DT);
  assert.deepEqual(pool.slots[0].light.position.toArray(), [6, 4.5, -2]);
});

test('a wall sign\'s light stands out from its wall along its facing (no hot spot in the wall); a lamp\'s stays put', () => {
  const sign = emitter(4, 2, { kind: 'neon', y: 3, facing: Math.PI / 2 }), lamp = emitter(-4, 2);
  const { pool, frame } = makePool('balanced', [sign, lamp]);
  run(pool, frame, 1);
  const at = e => pool.slots.find(s => s.emitter === e).light.position;
  assert.ok(Math.abs(at(sign).x - (4 + LIGHT_POOL.standoff)) < 1e-6 && Math.abs(at(sign).z - 2) < 1e-6 && at(sign).y === 3);
  assert.deepEqual(at(lamp).toArray(), [-4, 4.5, 2]);
});

test('an empty city, or no focus yet, is fine', () => {
  const { pool, frame, city } = makePool('quality', []);
  run(pool, frame, 1);
  assert.deepEqual(lit(pool), []);
  city.emitters = undefined; run(pool, frame, .5);
  frame.focus = null; city.emitters = [emitter(0, 0)]; run(pool, frame, .5);
  assert.deepEqual(lit(pool), []);
});

test('update allocates nothing: the same slots and scratch arrays, and the heap does not grow over a long run', () => {
  // A full collection before and none during: the heap then grows by exactly
  // what the run allocated (a scavenge needs ~16 MB of garbage to happen).
  v8.setFlagsFromString('--expose-gc');
  const collect = vm.runInNewContext('gc');
  const emitters = Array.from({ length: 300 }, (_, i) => emitter((i % 30) * 3 - 45, Math.floor(i / 30) * 4 - 18, { intensity: .4 + (i % 7) * .2, colour: ['#ffe9c4', '#ff40a0', '#20e0b0'][i % 3] }));
  const { pool, frame, focus, city } = makePool('extreme', emitters);
  const kept = [pool.slots, pool.picks, pool.pickScores, pool.pickTaken, ...pool.slots, ...pool.slots.map(s => s.light)];
  const keys = pool.slots.map(s => Object.keys(s).join());
  const step = i => { focus.x = Math.sin(i / 90) * 40; focus.z = Math.cos(i / 130) * 10; city.uniforms.sag.value = i % 500 < 20 ? .6 : 0; frame.elapsed += DT; pool.update(frame); };
  for (let i = 0; i < 4000; i++) step(i); // warm the JIT and meet every colour
  // Bytes the heap grew by over one run; the least of three, since the first
  // pass can still be warming up. Code that allocates does so in every pass.
  const measure = (times, work) => {
    let least = Infinity;
    for (let round = 0; round < 3; round++) { collect(); const before = process.memoryUsage().heapUsed; for (let i = 0; i < times; i++) work(i); least = Math.min(least, process.memoryUsage().heapUsed - before); }
    return least;
  };
  // The choice on its own (what runs four times a second), with the focus
  // sweeping the city so lights hop about: 50,000 picks.
  const pickBytes = measure(50000, i => { focus.x = Math.sin(i / 90) * 40; focus.z = Math.cos(i / 130) * 10; pool.pick(focus); for (const s of pool.slots) if (s.pending) pool.assign(s, s.pending), s.pending = null; });
  // The per-frame fade with the choice switched off.
  pool.pickTimer = -1e12;
  const updateBytes = measure(200000, step);
  assert.deepEqual([pool.slots, pool.picks, pool.pickScores, pool.pickTaken, ...pool.slots, ...pool.slots.map(s => s.light)], kept);
  assert.deepEqual(pool.slots.map(s => Object.keys(s).join()), keys);
  assert.ok(pickBytes < 100e3, `${pickBytes} bytes allocated by 50,000 picks`);
  assert.ok(updateBytes < 1e6, `${updateBytes} bytes allocated by 200,000 frames`);
});
