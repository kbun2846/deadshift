import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, RULES } from '../src/simulation.js';
const map = (props = []) => ({ width: 60, depth: 60, spawn: { x: 0, z: 0 }, buildings: [], targets: [], fences: [], props });
const tick = (sim, extra = {}) => sim.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, ...extra });

test('rapid placement produces separated drifting orbs', () => {
  const sim = new Simulation(map());
  for (let i = 0; i < 130; i++) tick(sim, { seed: true });
  assert.equal(sim.seeds.length, 12);
  for (const a of sim.seeds) for (const b of sim.seeds) if (a.id < b.id)
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > RULES.orbRadius * 2 - .01);
});

test('overlapping orbs separate deterministically without damaging nearby cover', () => {
  const sim = new Simulation(map([{ type: 'crate', x: 1.5, z: 0 }]));
  sim.shots = [1, 2].map(id => ({ id, x: .77, z: 0, vx: 0, vz: 0, age: 0, launched: false }));
  tick(sim);
  assert.equal(sim.props[0].hp, 10);
  for (const orb of sim.seeds) assert.ok(orb.x < .79, 'separation cannot push through a crate');
});

test('separated orbs still arrive at one exact point after launch', () => {
  const sim = new Simulation(map()); for (let i = 0; i < 120; i++) tick(sim, { seed: true });
  sim.launch(9, 2); for (let i = 0; i < 50; i++) tick(sim);
  const ends = sim.events.filter(e => e.type === 'trailEnd'); assert.equal(ends.length, 12);
  assert.ok(ends.every(e => Math.abs(e.x - 9) < 1e-6 && Math.abs(e.z - 2) < 1e-6));
});
