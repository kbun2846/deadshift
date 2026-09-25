// The hex (Static's X, owner v0.9b): holds at its full size for a moment
// before it fades, lets teammates in, and shields whoever is inside from
// anything that comes from outside.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, insideShield, RULES } from '../src/simulation.js';

const empty = extra => ({ width: 120, depth: 120, spawn: { x: 0, z: 0 }, buildings: [], props: [], fences: [], targets: [], ...extra });

test('an unpulsed hex holds at its edge, still turning, for hexLinger before it fades; X still pulses it there', () => {
 const sim = new Simulation(empty()); sim.weapon = 'static'; sim.ammo = RULES.maxSeeds;
 sim.hex();
 const full = RULES.hexRange / RULES.hexSpeed;
 for (let t = 0; t < full + RULES.hexLinger * .5; t += 1 / 60) sim.step({});
 assert.equal(sim.hexOrbs.length, 6, 'still there, holding');
 const r = Math.hypot(sim.hexOrbs[0].x - sim.hexOrbs[0].originX, sim.hexOrbs[0].z - sim.hexOrbs[0].originZ);
 assert.ok(Math.abs(r - RULES.hexRange) < .05, 'at its full size');
 const a = Math.atan2(sim.hexOrbs[0].z, sim.hexOrbs[0].x); sim.step({}); const b = Math.atan2(sim.hexOrbs[0].z, sim.hexOrbs[0].x);
 assert.notEqual(a, b, 'still turning');
 sim.hex();
 assert.ok(sim.hexSpin, 'pulsed from the edge');
 const late = new Simulation(empty()); late.weapon = 'static'; late.ammo = RULES.maxSeeds; late.hex();
 for (let t = 0; t < full + RULES.hexLinger + .2; t += 1 / 60) late.step({});
 assert.equal(late.hexOrbs.length, 0, 'gone after the linger');
});

test('inside a hex, shots from outside do nothing; from inside they land', () => {
 const caster = new Simulation(empty()); caster.weapon = 'static'; caster.ammo = RULES.maxSeeds; caster.hex();
 for (let i = 0; i < 90; i++) caster.step({});
 const shield = caster.hexShield();
 assert.ok(shield && insideShield(shield, 1, 0) && !insideShield(shield, 30, 0));
 const shooter = new Simulation(empty({ spawn: { x: 30, z: 0 } }));
 shooter.shields = [shield];
 const target = { id: 'inside', x: 1, z: 0, hp: 500, maxHp: 500 };
 shooter.hit(target, { damage: 100, owner: 'x' });
 assert.equal(target.hp, 500, 'blocked');
 assert.ok(shooter.events.some(e => e.type === 'hexBlock'));
 const near = new Simulation(empty({ spawn: { x: 0, z: 1 } })); near.shields = [shield];
 near.hit(target, { damage: 100, owner: 'y' });
 assert.equal(target.hp, 400, 'from inside it lands');
});

test('a teammate is never pushed out of your hex; an enemy is', () => {
 const sim = new Simulation(empty()); sim.weapon = 'static'; sim.ammo = RULES.maxSeeds; sim.player.team = 'blue'; sim.hex();
 const mate = { id: 'm', x: 1, z: 0, hp: 500, team: 'blue' }, foe = { id: 'f', x: 1, z: 0, hp: 500, team: 'red' };
 sim.targets = [mate, foe];
 for (let i = 0; i < 60; i++) sim.stepHex(1 / 60);
 assert.equal(mate.x, 1);
 assert.ok(foe.x > 1.5, 'enemy pushed out');
});
