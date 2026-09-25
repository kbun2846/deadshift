import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, RULES, explosionFor } from '../src/simulation.js';
import { MOUSE_VOLLEY_ASSIST, RIFLE } from '../src/config/gameplay.js';
import { killLabel } from '../src/ui/outgoing-feedback.js';

const empty = extra => ({ width: 100, depth: 100, spawn: { x: 0, z: 0 }, buildings: [], props: [], fences: [], targets: [], ...extra });

test('splash is measured to the edge of a body, and crates do not shelter from it', () => {
 const blast = explosionFor(8);
 // Centre just outside the radius, body inside it: hit.
 const edge = new Simulation(empty({ targets: [{ id: 'a', x: blast.radius + .3, z: 0, maxHp: 500 }] }));
 edge.player.x = 50; edge.explode({ x: 0, z: 0, arrived: 8 }, 1);
 assert.ok(edge.targets[0].hp < 500, 'a body half inside the blast is hit');
 // A crate between blast and target: still hit.
 const crate = new Simulation(empty({ props: [{ type: 'crate', x: 1, z: 0 }], targets: [{ id: 'a', x: 1.9, z: 0, maxHp: 500 }] }));
 crate.player.x = 50; crate.explode({ x: 0, z: 0, arrived: 8 }, 1);
 assert.ok(crate.targets[0].hp < 500, 'a crate is not a wall');
});

test('a mouse volley is drawn onto a target near the cursor; others land where pointed', () => {
 const near = { x: 10, z: MOUSE_VOLLEY_ASSIST.radius * .6 };
 const run = mouse => { const sim = new Simulation(empty({ targets: [{ id: 'a', x: near.x, z: near.z, maxHp: 500 }] })); sim.seed(); sim.seed(); sim.launch(10, 0, false, mouse); return sim.shots[0]; };
 const pulled = run(true), plain = run(false);
 assert.ok(Math.abs(pulled.focusZ - near.z * MOUSE_VOLLEY_ASSIST.pull) < 1e-6, 'pulled part of the way');
 assert.equal(plain.focusZ, 0);
});

test('the hex ring spreads faster, and Nominal holds 28', () => {
 assert.equal(RULES.hexSpeed, 3.6);
 assert.equal(RIFLE.magazine, 28);
});

test('a kill reads KILL, or ONE SHOT', () => {
 assert.equal(killLabel({}), 'KILL');
 assert.equal(killLabel({ oneShot: true }), 'ONE SHOT');
});
