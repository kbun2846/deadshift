import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { castToWall } from '../src/effects/blood-surfaces.js';
import { BloodDrops, DROP_CAP } from '../src/effects/blood-drops.js';
import { Simulation } from '../src/simulation.js';
import { maps } from '../src/maps.js';

test('thrown blood finds the first wall face along its line, skipping windows and the box it starts in', () => {
 const walls = [{ x: 3, z: 0, w: 1, d: 4, height: 3 }, { x: 1.5, z: 0, w: .2, d: 4, height: .5, playerOnly: true }];
 const hit = castToWall(walls, 0, 0, 1, 0, 5);
 assert.ok(Math.abs(hit.x - 2.5) < 1e-6 && Math.abs(hit.distance - 2.5) < 1e-6);
 assert.deepEqual([Math.round(hit.nx), Math.round(hit.nz)], [-1, 0], 'the face turned toward the shot');
 assert.equal(castToWall(walls, 0, 0, 1, 0, 2), null, 'out of reach');
 assert.equal(castToWall(walls, 3, 0, 1, 0, 5), null, 'starting inside a box is not a hit');
 const turned = castToWall([{ x: 0, z: 3, w: 4, d: 1, angle: .3, localW: 4, localD: 1, height: 3 }], 0, 0, 0, 1, 5);
 assert.ok(turned && turned.nz < -.8, 'a rotated box faces back along the ray');
});

test('drops are one instanced draw, capped per preset; a broken crate takes its drops, a reset takes all', () => {
 const scene = new THREE.Scene(), drops = new BloodDrops({ scene, qualityName: 'potato' });
 for (let i = 0; i < DROP_CAP.potato + 30; i++) drops.stain(i * .01, .02, 0, .05, i % 2 ? 1 : null, 0, i % 2 ? 'crate' : null);
 assert.equal(drops.mesh.count, DROP_CAP.potato, 'the oldest go first');
 assert.equal(scene.children.filter(o => o.isInstancedMesh).length, 1);
 drops.dropProp('crate'); assert.ok(drops.props.every(p => p !== 'crate'));
 drops.clear(); assert.equal(drops.mesh.count, 0);
});

test('solo RESET MAP puts props, crops and targets back and leaves the player be', () => {
 const map = Object.values(maps)[0], sim = new Simulation(map);
 const prop = sim.props.find(p => p.hp !== null); prop.hp = 0; sim.colliders = sim.colliders.filter(c => c.propId !== prop.id);
 sim.targets[0].hp = 0; sim.player.x += 2; const x = sim.player.x;
 sim.resetWorld();
 assert.equal(prop.hp, prop.health); assert.ok(sim.colliders.some(c => c.propId === prop.id));
 assert.equal(sim.targets[0].hp, sim.targets[0].maxHp); assert.equal(sim.player.x, x);
 const events = sim.drainEvents().map(e => e.type);
 assert.ok(events.includes('propRestore') && events.at(-1) === 'mapReset');
});

test('walking through a pool soaks you in stages, leaves prints after, and dries off', async () => {
 const { Wading, WADING } = await import('../src/effects/blood-wading.js');
 const w = new Wading(), prints = [], drops = { print: (...a) => prints.push(a) }, pool = [{ x: 0, z: 0, r: 1 }];
 for (let i = 0; i < 12; i++) w.update(-1 + i * .12, 0, 7, 0, 1 / 60, pool, drops, null);
 assert.ok(w.level > WADING.stages[0], 'one run through: at least the boots');
 w.update(0, 0, 0, 0, 1, pool, drops, null); const still = w.level;
 assert.ok(still <= w.level, 'standing still in it does not soak you more');
 // Steps are placed by the renderer (the same steps as the dirt prints); each
 // one asks whether the boots still print.
 for (let i = 0; i < 60; i++) { w.update(1.5 + i * .12, 0, 7, 0, 1 / 60, pool, drops, null); if (i % 5 === 0) { const k = w.takePrint(); if (k) prints.push(k); } }
 assert.ok(prints.length > 0 && prints.length <= WADING.prints, 'a few red steps after');
 assert.ok(prints[0] > prints[prints.length - 1], 'fainter step by step');
 const level = w.level; w.update(20, 0, 0, 0, 10, pool, drops, null); assert.ok(w.level < level, 'dries off');
 w.reset(); assert.equal(w.level, 0);
});
