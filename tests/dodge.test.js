import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, RULES } from '../src/simulation.js';
const make = () => new Simulation({ width: 60, depth: 60, spawn: { x: 0, z: 0 }, buildings: [], props: [], fences: [], targets: [] });
const finish = sim => { for (let i = 0; i < 15; i++) sim.step({}); };

test('dodge moves a modest fixed distance, with equal cardinal and diagonal travel', () => {
  for (const [moveX, moveZ] of [[1, 0], [1, 1], [0, -1]]) {
    const sim = make(); sim.step({ moveX, moveZ, dodge: true }); finish(sim);
    assert.ok(Math.abs(Math.hypot(sim.player.x, sim.player.z) - RULES.dodgeDistance) < .01);
    assert.equal(sim.player.dodgeRemaining, 0);
  }
});
test('two dodges consume stamina, third is blocked, and it replenishes over time', () => {
  const sim = make();
  for (let i = 0; i < 2; i++) { sim.step({ moveX: 1, dodge: true }); finish(sim); }
  assert.equal(sim.player.stamina, 0);
  sim.step({ moveX: 1, dodge: true }); assert.equal(sim.events.filter(e => e.type === 'dodge').length, 2);
  for (let i = 0; i < 150; i++) sim.step({});
  assert.ok(sim.player.stamina >= 1); sim.step({ moveZ: 1, dodge: true });
  assert.equal(sim.events.filter(e => e.type === 'dodge').length, 3);
  sim.reset(); assert.equal(sim.player.stamina, 2);
});
test('stationary dodge does nothing and dodge direction is captured rather than aim direction', () => {
  const sim = make(); sim.step({ dodge: true }); assert.equal(sim.player.stamina, 2);
  sim.step({ moveX: 1, aimX: 0, aimZ: -1, dodge: true });
  sim.step({ moveZ: -1 }); assert.equal(sim.player.dodgeX, 1); assert.equal(sim.player.dodgeZ, 0);
});
test('dodge respects walls and the expanding hex boundary', () => {
  const sim = make(); sim.colliders.push({ x: 1.5, z: 0, w: .2, d: 8 });
  sim.step({ moveX: 1, dodge: true }); finish(sim); assert.ok(sim.player.x <= 1.5 - .1 - RULES.radius + .001);
  sim.reset(); sim.hex(); sim.step({ moveX: 1, dodge: true });
  for (let i = 0; i < 15; i++) { sim.step({}); assert.ok(sim.withinHex(sim.player.x, sim.player.z)); }
});
test('dodge shrinks the attack hitbox and reduces damage, without granting invulnerability', () => {
  const sim = make(); sim.step({ moveX: 1, dodge: true });
  assert.equal(sim.playerHitRadius, RULES.dodgeHitRadius);
  const p = sim.player;
  assert.equal(sim.hitPlayerProjectile(p.x - 2, p.z + .28, p.x + 2, p.z + .28, { damage: 100, owner: 'enemy' }), 0);
  assert.equal(sim.hitPlayerProjectile(p.x - 2, p.z, p.x + 2, p.z, { damage: 100, owner: 'enemy' }), 50);
  assert.equal(sim.damagePlayer(100, 'local'), 0);
  finish(sim); assert.equal(sim.playerHitRadius, RULES.radius); assert.equal(sim.damagePlayer(100, 'enemy'), 100);
});
