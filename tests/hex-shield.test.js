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

// v0.990a (owner: "being inside the hex should prevent bullets and stuff
// from entering the hex"): a round fired from outside stops at the hex's
// wall with a spark there, instead of flying on in to the people inside.
test('rounds from outside stop at the hex wall; from inside they pass out', async () => {
 const { shieldEntry } = await import('../src/simulation.js');
 const hex = { x: 10, z: 0, rotation: 0, limit: 3 }, round = { x: 10, z: 0, rotation: 0, limit: 3, round: true };
 const t = shieldEntry(hex, 0, 0, 20, 0);
 assert.ok(t > 0 && t < .5 && insideShield(hex, t * 20 + .01, 0) && !insideShield(hex, t * 20 - .01, 0), 'enters at the wall');
 assert.equal(shieldEntry(hex, 0, 5, 20, 5), null, 'passing by');
 assert.ok(Math.abs(shieldEntry(round, 0, 0, 20, 0) * 20 - (10 - 3 / Math.cos(Math.PI / 6))) < 1e-6, 'a pulsed (round) hex as a circle');
 // A rifle round from outside, at a target inside: it stops at the wall.
 const sim = new Simulation(empty({ targets: [{ id: 'in', x: 10, z: 0 }] }));
 sim.weapon = 'rifle'; sim.shields = [{ ...hex, owner: 'other' }];
 const hp = sim.targets[0].hp;
 for (let i = 0; i < 40; i++) sim.step({ aimX: 1, aimZ: 0, aimPointX: 10, aimPointZ: 0, fire: i < 3, tapFire: i === 0 });
 assert.equal(sim.targets[0].hp, hp, 'nothing reaches the target');
 assert.ok(sim.drainEvents().some(e => e.type === 'hexBlock' && e.wall && e.x < 10 - 2.9), 'a spark on the wall');
 // From inside the same hex, out: nothing stops it.
 const inner = new Simulation(empty({ spawn: { x: 10, z: 0 } })); inner.shields = [hex];
 assert.equal(inner.shieldStop(10, 0, 30, 0), null);
});
