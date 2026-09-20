import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, RULES, segmentBox, segmentCircle, inside, damagePerOrb } from '../src/simulation.js';
import { deadwater, dryCreek, mapColliders } from '../src/maps.js';

const input = overrides => ({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, seed: false, launch: false, ...overrides });
const empty = (overrides = {}) => ({ id: 'test', width: 100, depth: 100, spawn: { x: 0, z: 0 }, buildings: [], props: [], fences: [], targets: [], ...overrides });
function step(sim, count, commands = {}) { for (let i = 0; i < count; i++) sim.step(input(commands)); }
const close = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${a} should be close to ${b}`);

test('first refill after spending ammo is 40 percent faster, then returns to normal',()=>{
  const sim=new Simulation(empty());sim.player.vx=1;
  sim.seed();sim.seed();sim.launch(20,0);
  sim.recharge(RULES.rechargeDelay+RULES.rechargeInterval/1.4);
  assert.equal(sim.ammo,11);assert.equal(sim.firstRefill,false);
  sim.recharge(RULES.rechargeInterval/1.4);assert.equal(sim.ammo,11);
  sim.recharge(RULES.rechargeInterval-RULES.rechargeInterval/1.4);assert.equal(sim.ammo,12);
  sim.seed();assert.equal(sim.firstRefill,true);
  sim.reset();assert.equal(sim.firstRefill,false);
});

test('all twelve stationary refills are 18 percent faster than the prior stationary rate',()=>{
  const sim=new Simulation(empty());sim.ammo=0;sim.firstRefill=true;
  close(sim.rechargeRate,1.25*1.18);
  let elapsed=0,previousTime=0;
  for(let round=1;round<=12;round++){
    const oldDuration=(round===1?RULES.rechargeInterval/1.4:RULES.rechargeInterval)/1.25;
    const duration=oldDuration/1.18;
    sim.recharge(duration*.99);assert.equal(sim.ammo,round-1);
    sim.recharge(duration*.01);assert.equal(sim.ammo,round);
    elapsed+=duration;previousTime+=oldDuration;
  }
  close(elapsed,previousTime/1.18);
  sim.player.vx=1;assert.equal(sim.rechargeRate,1);
});

test('movement accelerates and diagonal transitions preserve inertia', () => {
  const sim = new Simulation(empty());
  sim.step(input({ moveX: 1 })); assert.ok(sim.player.vx > 0 && sim.player.vx < RULES.speed / 2);
  step(sim, 120, { moveX: 1 });
  const previousX = sim.player.vx;
  sim.step(input({ moveX: 1, moveZ: -1 }));
  assert.ok(sim.player.vx < previousX && sim.player.vx > RULES.speed / Math.sqrt(2));
  assert.ok(sim.player.vz < 0 && sim.player.vz > -RULES.speed / Math.sqrt(2));
});

test('diagonal movement is no faster than cardinal movement', () => {
  const sim = new Simulation(empty()); step(sim, 120, { moveX: 1, moveZ: -1 });
  close(Math.hypot(sim.player.vx, sim.player.vz), RULES.speed);
});

test('releasing input brings motion smoothly to rest', () => {
  const sim = new Simulation(empty()); step(sim, 60, { moveX: 1 });
  sim.step(input()); assert.ok(sim.player.vx > 0);
  step(sim, 90); assert.ok(Math.abs(sim.player.vx) < .0001);
});

test('walls block movement while allowing tangential sliding', () => {
  const sim = new Simulation(empty({ props: [{ type: 'crate', x: 2, z: 0 }] }));
  step(sim, 40, { moveX: 1 });
  assert.ok(sim.player.x <= 2 - 1.25 / 2 - RULES.radius + .0001);
  step(sim, 12, { moveX: 1, moveZ: 1 }); assert.ok(sim.player.z > .4);
});

test('seed capacity is bounded and seeded shots drift slowly', () => {
  const sim = new Simulation(empty()); step(sim, 180, { seed: true });
  assert.equal(sim.seeds.length, RULES.maxSeeds);
  for (const shot of sim.seeds) close(Math.hypot(shot.vx, shot.vz), RULES.driftSpeed);
});

test('each orb travels straight from its position to the captured cursor point', () => {
  const sim = new Simulation(empty()); step(sim, 80, { seed: true, moveZ: 1 });
  const before = sim.seeds.map(s => ({ ...s })); assert.ok(before.length > 5);
  sim.launch(5, -4);
  for (const [i, s] of sim.shots.entries()) {
    close(s.x, before[i].x); close(s.z, before[i].z);
    close(s.x + s.vx * s.travelDuration, 5); close(s.z + s.vz * s.travelDuration, -4);
    assert.equal(s.owner, 'local'); assert.equal(s.team, 0); assert.equal(s.launched, true);
  }
  assert.equal(sim.seeds.length, 0);
});

test('empty launch only cocks the gun without creating a volley or changing ammo and recharge', () => {
  const sim = new Simulation(empty()); sim.ammo = 5; sim.rechargeProgress = .3; sim.launch();
  assert.equal(sim.volley, 0); assert.equal(sim.ammo, 5); assert.equal(sim.rechargeProgress, .3);
  assert.equal(sim.rechargeWait, 0); assert.equal(sim.shots.length, 0); assert.deepEqual(sim.events, [{ type: 'cock' }]);
});

test('unlaunched seeds expire and never damage targets', () => {
  const sim = new Simulation(empty({ targets: [{ id: 'a', x: 2, z: 0 }] }));
  sim.seed(); step(sim, 570);
  assert.equal(sim.shots.length, 0); assert.equal(sim.targets[0].hp, RULES.targetHealth);
});

test('continuous collision detects thin walls and small targets', () => {
  close(segmentBox(0, 0, 30, 0, { x: 15, z: 0, w: .1, d: 3 }), 14.95 / 30);
  close(segmentCircle(0, 0, 30, 0, 15, 0, .5), 14.5 / 30);
  assert.equal(segmentBox(0, 5, 30, 5, { x: 15, z: 0, w: .1, d: 3 }), null);
});

test('cover takes precedence over a target behind it', () => {
  const sim = new Simulation(empty({ targets: [{ id: 'a', x: 5, z: 0 }], props: [{ type: 'crate', x: 3, z: 0 }] }));
  sim.seed(); sim.launch(5, 0); step(sim, 30);
  assert.equal(sim.targets[0].hp, RULES.targetHealth); assert.equal(sim.shots.length, 0);
  assert.equal(sim.props[0].hp, sim.props[0].health - damagePerOrb(1));
  assert.ok(sim.events.some(e => e.type === 'propHit'));
});

test('a volley can destroy a target, score once, and target respawns', () => {
  const sim = new Simulation(empty({ targets: [{ id: 'a', x: 5, z: 0 }] }));
  step(sim, 110, { seed: true }); sim.launch(5, 0); step(sim, 30);
  assert.equal(sim.stats.kills, 1); assert.equal(sim.stats.bestVolley, 1);
  assert.equal(sim.targets[0].hp, 0); assert.equal(sim.events.filter(e => e.type === 'kill').length, 1);
  step(sim, 280); assert.equal(sim.targets[0].hp, RULES.targetHealth);
});

test('seeding next to a wall does not spawn through it', () => {
  const sim = new Simulation(empty({ props: [{ type: 'crate', x: 1.1, z: 0 }] }));
  sim.seed(); assert.equal(sim.shots.length, 0);
});

test('roof entry follows footprint through the real doorway', () => {
  const sim = new Simulation(deadwater); const b = deadwater.buildings[0];
  sim.player.x = b.x + b.w / 2 + 2; sim.player.z = b.z;
  assert.equal(sim.roofId, null);
  step(sim, 32, { moveX: -1 }); assert.equal(sim.roofId, b.id);
  step(sim, 45, { moveX: 1 }); assert.equal(sim.roofId, null);
});

test('different maps load independent dimensions, colliders and targets', () => {
  for (const map of [deadwater, dryCreek]) {
    const sim = new Simulation(map); assert.equal(sim.targets.length, map.targets.length);
    assert.ok(!mapColliders(map).some(c => inside(sim.player, c, RULES.radius)));
    sim.player.x = map.width / 2 - .1; sim.step(input({ moveX: 1 }));
    assert.ok(sim.player.x <= map.width / 2 - RULES.radius);
  }
  assert.notEqual(deadwater.width, dryCreek.width);
});

test('reset restores targets, player, projectiles and scores', () => {
  const sim = new Simulation(deadwater); step(sim, 90, { moveZ: 1, seed: true });
  sim.stats.kills = 5; sim.targets[0].hp = 0; sim.reset();
  close(sim.player.x, deadwater.spawn.x); close(sim.player.z, deadwater.spawn.z);
  assert.equal(sim.shots.length, 0); assert.equal(sim.stats.kills, 0); assert.equal(sim.targets[0].hp, RULES.targetHealth);
});

test('fixed input replay yields identical simulation state', () => {
  const a = new Simulation(deadwater), b = new Simulation(deadwater);
  for (let i = 0; i < 400; i++) {
    const commands = input({ moveX: Math.sin(i * .03), moveZ: Math.cos(i * .07), aimX: Math.cos(i), aimZ: Math.sin(i), seed: i % 5 !== 0, launch: i % 61 === 0 });
    a.step(commands); b.step(commands);
  }
  assert.deepEqual(a.player, b.player); assert.deepEqual(a.shots, b.shots); assert.deepEqual(a.targets, b.targets);
});
