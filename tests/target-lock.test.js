import test from 'node:test';
import assert from 'node:assert/strict';
import { createTargetLock } from '../src/target-lock.js';

const player = { x: 0, z: 0, aimX: 1, aimZ: 0 };
const me = { x: 400, y: 300 };
const row = [
 { id: 'near', x: 3, z: 0, sx: 500, sy: 300 },
 { id: 'right', x: 8, z: 0, sx: 700, sy: 300 },
 { id: 'left', x: -6, z: 0, sx: 200, sy: 300 },
 { id: 'up', x: 3, z: -7, sx: 500, sy: 100 },
];
const aim = { x: 4, z: 0 };

test('idle by default: nothing is locked until an arrow or flick picks a target', () => {
 const lock = createTargetLock();
 assert.equal(lock.update(row, player, 1 / 60), null, 'idle: ordinary aiming');
 assert.ok(lock.select(row, me, 1, 0, aim)); assert.equal(lock.id, 'near', 'right of the player: the nearest that way');
 const lock2 = createTargetLock();
 assert.ok(lock2.select(row, me, -1, 0, aim)); assert.equal(lock2.id, 'left');
 const lock3 = createTargetLock();
 assert.ok(!lock3.select(row, me, 0, 1, aim), 'nothing below the player: stays idle');
 assert.equal(lock3.id, null);
});

test('the aim glides onto the picked target', () => {
 const lock = createTargetLock();
 lock.select(row, me, 1, 0, aim);
 lock.update(row, player, 1 / 60);
 assert.ok(Math.hypot(lock.point.x - 3, lock.point.z) > .1, 'it travels there, not jumps');
 for (let i = 0; i < 60; i++) lock.update(row, player, 1 / 60);
 assert.ok(Math.hypot(lock.point.x - 3, lock.point.z) < .01, 'and arrives');
});

test('locked, arrows move to the next target that way; none that way goes idle', () => {
 const lock = createTargetLock();
 lock.select(row, me, 1, 0, aim);
 assert.ok(lock.swap(row, 1, 0)); assert.equal(lock.id, 'right');
 assert.ok(!lock.swap(row, 1, 0), 'nothing further right');
 assert.equal(lock.id, null, 'so it lets go');
 lock.select(row, me, 1, 0, aim); lock.swap(row, 0, -1); assert.equal(lock.id, 'up');
});

test('a target that dies or leaves hands over to the nearest other one, or goes idle', () => {
 const lock = createTargetLock();
 lock.select(row, me, 1, 0, aim);
 assert.equal(lock.update([row[1], row[2]], player, 1 / 60).id, 'left', 'the nearest remaining');
 assert.equal(lock.update([], player, 1 / 60), null);
 assert.equal(lock.id, null, 'none left: idle');
});

import { Simulation } from '../src/simulation.js';
import { deadwater } from '../src/maps.js';

test('only targets the player can see count: not under a roof, and from indoors only through openings', () => {
 const sim = new Simulation(deadwater);
 const saloon = deadwater.buildings.find(b => b.id === 'saloon');
 // Outside, on the street: something inside the saloon is under its roof.
 sim.player.x = 0; sim.player.z = 7;
 assert.equal(sim.canSeeTarget(saloon.x, saloon.z), false, 'under a roof');
 // Inside the saloon: its own room is visible.
 sim.player.x = saloon.x; sim.player.z = saloon.z;
 assert.equal(sim.canSeeTarget(saloon.x + 1, saloon.z + 1), true, 'same room');
 // Straight through a solid side wall to the outside: not visible.
 const behindWall = { x: saloon.x - saloon.w / 2 - 4, z: saloon.z };
 assert.equal(sim.canSeeTarget(behindWall.x, behindWall.z), false, 'not through the solid side wall');
 assert.equal(sim.canSeeTarget(saloon.x + saloon.w / 2 + 4, saloon.z), true, 'but out through the doorway');
});

test('aim assist ignores targets the player cannot see', () => {
 const sim = new Simulation(deadwater);
 const saloon = deadwater.buildings.find(b => b.id === 'saloon');
 sim.targets = [{ id: 'hidden', x: saloon.x, z: saloon.z, hp: 100, maxHp: 100 }];
 sim.player.x = 0; sim.player.z = 7;
 assert.equal(sim.assistTargets().length, 0);
});

test('a moment out of sight keeps the lock; a longer one or a death lets it go', () => {
 const lock = createTargetLock();
 lock.select(row, me, 1, 0, aim);
 const alive = id => (id === 'near' ? { id: 'near', x: 3, z: 0 } : null);
 for (let i = 0; i < 20; i++) lock.update([row[1]], player, 1 / 60, alive);
 assert.equal(lock.id, 'near', 'a third of a second behind cover: still locked');
 for (let i = 0; i < 40; i++) lock.update([row[1]], player, 1 / 60, alive);
 assert.equal(lock.id, 'right', 'too long: the one in sight takes over');
 lock.select(row, me, -1, 0, aim);
 assert.equal(lock.update([], player, 1 / 60, () => null), null, 'dead: no grace');
});
