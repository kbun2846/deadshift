import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, RULES } from '../src/simulation.js';
const map = (props = []) => ({ width: 60, depth: 60, spawn: { x: 0, z: 0 }, buildings: [], targets: [], fences: [], props });
const tick = (sim, extra = {}) => sim.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, ...extra });
// Orbs converge slightly past the aim point, so the arrival point is the aim
// point pushed further along the same ray from the player.
const past=(from,x,z,d=RULES.launchOvershoot)=>{const r=Math.hypot(x-from.x,z-from.z);return {x:x+(x-from.x)/r*d,z:z+(z-from.z)/r*d};};


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
  // Drifting orbs still respect cover; only launched ones pass through it.
  assert.equal(sim.props[0].hp, sim.props[0].health);
  for (const orb of sim.seeds) assert.ok(orb.x < .79, 'separation cannot push through a crate');
});

test('separated orbs still arrive at one exact point after launch', () => {
  const sim = new Simulation(map()); for (let i = 0; i < 120; i++) tick(sim, { seed: true });
  sim.launch(9, 2); for (let i = 0; i < 50; i++) tick(sim);
  const ends = sim.events.filter(e => e.type === 'trailEnd'); assert.equal(ends.length, 12);
  const meet = past(sim.map.spawn, 9, 2);
  assert.ok(ends.every(e => Math.abs(e.x - meet.x) < 1e-6 && Math.abs(e.z - meet.z) < 1e-6),
    'every orb must still converge on one exact point');
});
