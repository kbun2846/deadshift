// v0.996a (owner: Extreme ran at 20 fps for the first 20 s of a map): the
// warm-up waits for the driver's parallel compiles while they keep finishing,
// and gives up only when they stall (a driver that never reports).
import test from 'node:test';
import assert from 'node:assert/strict';
import { programsSettled } from '../src/render/warm-up.js';

const clock = () => { let t = 0; return { now: () => t, wait: async ms => { t += ms; } }; };

test('waits as long as programs keep finishing, then resolves true', async () => {
  const c = clock(), programs = Array.from({ length: 10 }, (_, i) => ({ isReady: () => c.now() > i * 1500 }));
  assert.equal(await programsSettled({ info: { programs } }, { stall: 4000, ...c }), true);
  assert.ok(c.now() >= 9 * 1500, 'waited past the old 2.5 s');
});

test('gives up when nothing finishes for the stall time, or at the cap', async () => {
  const c = clock(), stuck = [{ isReady: () => false }];
  assert.equal(await programsSettled({ info: { programs: stuck } }, { stall: 4000, ...c }), false);
  assert.ok(c.now() >= 4000 && c.now() < 4200);
  const d = clock(), slow = Array.from({ length: 1000 }, (_, i) => ({ isReady: () => d.now() > i * 100 }));
  assert.equal(await programsSettled({ info: { programs: slow } }, { stall: 4000, max: 20000, ...d }), false);
  assert.ok(d.now() >= 20000 && d.now() < 20200);
  assert.equal(await programsSettled({ info: { programs: [] } }), true, 'nothing to wait for');
});
