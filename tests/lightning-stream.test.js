import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, RULES } from '../src/simulation.js';
const make = targets => new Simulation({ width: 80, depth: 80, spawn: { x: 0, z: 0 }, buildings: [], fences: [], props: [], targets: targets || [] });
const step = (sim, extra = {}, dt) => sim.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, spray: true, ...extra }, dt);

test('standing still never refills ammo during the C stream',()=>{
 const sim=make();sim.ammo=6;sim.rechargeProgress=.3;
 sim.spray.active=true;sim.player.vx=sim.player.vz=0;
 sim.recharge(2);assert.equal(sim.ammo,6);assert.equal(sim.rechargeProgress,0);
 assert.equal(sim.rechargeWait,RULES.rechargeDelay);
 sim.spray.active=false;
 sim.recharge(RULES.rechargeDelay);assert.equal(sim.ammo,6);
 sim.recharge(RULES.rechargeInterval/RULES.stationaryRecharge);
 assert.equal(sim.ammo,7);
});

test('stream windup warns without damage or spending ammo', () => {
  const sim = make([{ id: 'a', x: 2, z: 0 }]);
  for (let i = 0; i < 10; i++) step(sim);
  assert.equal(sim.ammo, 12); assert.equal(sim.targets[0].hp, 100);
  assert.ok(sim.events.some(e => e.type === 'sprayArc' && !e.firing));
  step(sim, { spray: false }); assert.equal(sim.spray.active, false);
});

test('each ammo provides exactly 0.25 seconds (three seconds at full ammo) of stream, with no recharge during firing', () => {
  const sim = make([{ id: 'a', x: 3, z: 0 }]); sim.targets[0].hp = 10000;
  step(sim, {}, .01);
  // Isolate firing time from recoil movement for exact damage integration.
  const startHP = sim.targets[0].hp;
  for (let i = 0; i < 320; i++) sim.stepSpray(.01);
  assert.equal(sim.ammo, 0); assert.equal(sim.spray.active, false);
  const expected = RULES.sprayInnerDPS * (1 - .25 * (3 - .65) / RULES.sprayRange) * 12 * .25;
  assert.ok(Math.abs(startHP - sim.targets[0].hp - expected) < 1e-6);
  for (let i = 0; i < 300; i++) step(sim);
  assert.equal(sim.spray.active, false, 'holding C after exhaustion cannot auto-restart');
});

test('inner cone is stronger, outer cone weaker, outside and covered targets safe', () => {
  const sim = make([{ id: 'inner', x: 4, z: 0 }, { id: 'outer', x: 4, z: 1.1 }, { id: 'outside', x: 4, z: 4 }, { id: 'covered', x: 7, z: 0 }]);
  sim.colliders.push({ x: 5.5, z: 0, w: .2, d: 2 });
  for (let i = 0; i < 25; i++) step(sim);
  assert.ok(sim.targets[0].hp < sim.targets[1].hp && sim.targets[1].hp < 100);
  assert.equal(sim.targets[2].hp, 100); assert.equal(sim.targets[3].hp, 100);
});

test('recoil pushes an idle caster backward and slows forward movement', () => {
  const idle = make(), forward = make(), normal = make();
  for (let i = 0; i < 60; i++) { step(idle); step(forward, { moveX: 1 }); step(normal, { moveX: 1, spray: false }); }
  assert.ok(idle.player.x < -1); assert.ok(forward.player.x > 0 && forward.player.x < normal.player.x - 1);
});

test('stream turning is limited and dodge cancels it; reset clears all channel state', () => {
  const sim = make(); step(sim); step(sim, { aimX: -1, aimZ: 0 });
  assert.ok(Math.abs(Math.atan2(sim.player.aimZ, sim.player.aimX)) <= RULES.sprayTurnRate * RULES.step + 1e-8);
  step(sim, { dodge: true, moveX: 1 }); assert.equal(sim.spray.active, false);
  sim.reset(); assert.equal(sim.spray.active, false); assert.equal(sim.spray.credit, 0); assert.equal(sim.ammo, 12);
});

test('backward channeling adds only a small recoil boost, including diagonal retreat', () => {
  for (const angle of [0, Math.PI / 4]) {
    const firing = make(), normal = make();
    const input = { moveX: -Math.cos(angle), moveZ: -Math.sin(angle), aimX: Math.cos(angle), aimZ: Math.sin(angle) };
    for (let i = 0; i < 60; i++) { step(firing, input); step(normal, { ...input, spray: false }); }
    assert.ok(Math.hypot(firing.player.vx, firing.player.vz) <= Math.hypot(normal.player.vx, normal.player.vz) + .2);
  }
});

test('stream does not use deployed orb reserves or damage the caster', () => {
  const sim = make(); sim.seed(); sim.seed();
  for (let i = 0; i < 180; i++) step(sim);
  assert.equal(sim.seeds.length, 2); assert.equal(sim.player.hp, 500);
  assert.ok(sim.ammo + sim.seeds.length <= 12);
});
