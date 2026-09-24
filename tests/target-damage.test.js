import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeTargetDamage, targetYaw, HITS_PER_BATCH } from '../src/effects/target-damage.js';
import { Simulation } from '../src/simulation.js';

const visible = board => board.children.filter(g => g.visible).length;

test('bullet holes only from bullets; any damage breaks it; new stages report debris', () => {
 for (const kind of ['board', 'dummy']) {
  const board = new THREE.Group(), damage = makeTargetDamage(board, kind, 't1', 'extreme');
  assert.equal(damage.set(1, 0), 0); assert.equal(visible(board), 0, 'full health shows nothing');
  const broke = damage.set(.5, 0);
  assert.ok(broke >= 2, 'stages crossed are reported for debris');
  const cracksOnly = visible(board);
  damage.set(.5, HITS_PER_BATCH * 2);
  assert.equal(visible(board), cracksOnly + 2, 'two batches of holes for four bullets');
  assert.equal(damage.set(.5, HITS_PER_BATCH * 2), 0, 'nothing new, no debris');
  damage.dispose();
 }
 assert.equal(makeTargetDamage(new THREE.Group(), 'board', 'x', 'performance'), null, 'none below Balanced');
});

test('the sim counts bullet hits only for real bullets, and forgets them on respawn', () => {
 const sim = new Simulation({ width: 100, depth: 100, spawn: { x: 0, z: 0 }, buildings: [], props: [], fences: [], targets: [{ id: 'a', x: 5, z: 0 }] });
 const t = sim.targets[0];
 sim.hit(t, { damage: 10, owner: 'p', volley: 1, electric: true });
 sim.hit(t, { damage: 10, owner: 'p', volley: 2, blast: true });
 assert.equal(t.bulletHits || 0, 0, 'stream and blasts leave no holes');
 sim.hit(t, { damage: 10, owner: 'p', volley: 3, bullet: true });
 assert.equal(t.bulletHits, 1);
});

test('targets face within about 60 degrees of the camera, never away', () => {
 const yaws = Array.from({ length: 200 }, (_, i) => targetYaw('target-' + i));
 assert.ok(yaws.every(y => Math.abs(y) <= 1.05 + 1e-9));
 assert.ok(Math.max(...yaws) - Math.min(...yaws) > 1.5, 'they vary');
 assert.equal(targetYaw('same'), targetYaw('same'), 'stable per target');
});
