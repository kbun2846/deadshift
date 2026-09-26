// Hollow Wick's trees (stage 2): counts per wood, spacing, nothing on the
// paths, in the water, on the bases or the building pads, every trunk a
// collider, logs and stumps low enough to shoot over only where they are,
// and robots still find their way through the woods.
import test from 'node:test';
import assert from 'node:assert/strict';
import { maps, groundFor, mapColliders } from '../src/maps.js';
import { WOODS, BASES } from '../src/maps/hollow-wick.js';
import { NORTH_WOODS, WEST_WOODS, ORCHARD, VILLAGE_TREES, STREAM_TREES, FORK_MAPLE, HOLLOW_WICK_TREES } from '../src/maps/hollow-wick-trees.js';
import { spotProblems, insidePolygon } from '../src/maps/hollow-wick-tree-rules.js';
import { TREE_KINDS, trunkRadius, treeColliders } from '../src/world/tree-kinds.js';
import { roundMeets } from '../src/weapons/rifle.js';
import { NavGrid } from '../src/bots/nav-grid.js';
import { TERRAIN } from '../src/config/gameplay.js';

const map = maps['hollow-wick'], ground = groundFor(map);
const bare = { ...map, trees: null };
const { trees, stumps, logs, drifts } = HOLLOW_WICK_TREES;

test('each wood has about as many trees as the design asks, inside its outline', () => {
 const poly = id => WOODS.find(w => w.id === id).poly;
 assert.ok(NORTH_WOODS.length >= 70 && NORTH_WOODS.length <= 80, `North Woods ${NORTH_WOODS.length}`);
 assert.ok(WEST_WOODS.length >= 32 && WEST_WOODS.length <= 40, `West Woods ${WEST_WOODS.length}`);
 assert.ok(NORTH_WOODS.every(t => insidePolygon(t.x, t.z, poly('north-woods'))));
 assert.ok(WEST_WOODS.every(t => insidePolygon(t.x, t.z, poly('west-woods'))));
 // (Old apple trees along the back trail; the fenced orchard behind the
 // rear houses is the field props' own, orchardTree.)
 assert.ok(ORCHARD.length >= 8, 'an orchard of old apple trees');
 assert.ok(VILLAGE_TREES.length >= 8 && STREAM_TREES.length >= 6);
 assert.equal(FORK_MAPLE.length, 1);
 assert.ok(Math.hypot(FORK_MAPLE[0].x + 11, FORK_MAPLE[0].z + 3) < 5, 'the maple stands by the fork');
 assert.ok(trees.length >= 125 && trees.every(t => TREE_KINDS[t.kind]));
});

test('trees are staggered like real woods: never closer than 2.4 m, never on a grid', () => {
 for (let i = 0; i < trees.length; i++) for (let j = i + 1; j < trees.length; j++)
  assert.ok(Math.hypot(trees[i].x - trees[j].x, trees[i].z - trees[j].z) >= 2.4, `${i} and ${j} too close`);
 // Clumps and gaps: the nearest-neighbour spacing in the North Woods varies.
 const nearest = NORTH_WOODS.map(a => Math.min(...NORTH_WOODS.filter(b => b !== a).map(b => Math.hypot(a.x - b.x, a.z - b.z))));
 const mean = nearest.reduce((a, b) => a + b) / nearest.length, sd = Math.sqrt(nearest.reduce((a, b) => a + (b - mean) ** 2, 0) / nearest.length);
 assert.ok(sd > .25, `spacing varies (sd ${sd.toFixed(2)})`);
});

test('nothing on paths, in the water, on pads, decks, bases, steep ground or near the hanging tree', () => {
 for (const t of trees) {
  const problems = spotProblems(bare, ground, t.x, t.z, trunkRadius(t), t.kind === 'willow' ? { bank: .3, slope: .38 } : undefined);
  assert.deepEqual(problems, [], `${t.kind} at ${t.x},${t.z}`);
  assert.ok(Math.hypot(t.x + 4, t.z + 24) > 4, 'hanging tree kept clear');
  assert.ok(ground.bankDistance(t.x, t.z) > 0, 'never in the stream');
 }
 for (const s of stumps) assert.deepEqual(spotProblems(bare, ground, s.x, s.z, .4 * s.s), [], `stump ${s.x},${s.z}`);
 for (const l of logs) for (let k = -.5; k <= .5; k += .1) {
  const x = l.x + Math.cos(l.yaw) * l.length * k, z = l.z - Math.sin(l.yaw) * l.length * k;
  assert.deepEqual(spotProblems(bare, ground, x, z, l.radius, { slope: .34 }), [], `log ${l.x},${l.z}`);
 }
 for (const d of drifts) assert.ok(ground.bankDistance(d.x, d.z) > 0);
 for (const [, [bx, bz]] of Object.entries(BASES)) for (const t of [...trees, ...stumps, ...logs]) assert.ok(Math.hypot(t.x - bx, t.z - bz) > 6);
});

test('every trunk, stump and log collides; canopies do not', () => {
 const colliders = mapColliders(map), mine = colliders.filter(c => c.tree);
 assert.equal(mine.length, trees.length + stumps.length + logs.length);
 for (const t of trees) {
  const box = mine.find(c => c.x === t.x && c.z === t.z);
  assert.ok(box, `trunk at ${t.x},${t.z}`);
  assert.ok(Math.abs(box.w - trunkRadius(t) * 2) < 1e-9 && box.height > 1.5, 'a trunk-sized box that stops rounds');
 }
 assert.deepEqual(treeColliders(null), []);
 // Deadwater has no trees.
 assert.equal(mapColliders(maps.deadwater).filter(c => c.tree).length, 0);
});

test('rounds pass over a stump or thin log and meet a big log', () => {
 const sim = { ground };
 const round = { flight: ground.flight(-6, -52, 1, 0, 10, ground.heightAt(-6, -52)) };
 const low = logs.find(l => l.radius * 2 * .9 < TERRAIN.roundHeight), big = logs.find(l => l.radius * 2 * .9 > TERRAIN.roundHeight);
 assert.ok(low && big, 'both kinds of log');
 const boxFor = l => treeColliders({ logs: [l] })[0];
 // A round's height over the ground at the log is roundHeight: fake a flight
 // over each log's own spot.
 const at = l => ({ flight: ground.flight(l.x - 3, l.z, 1, 0, 8, ground.heightAt(l.x - 3, l.z)) });
 assert.equal(roundMeets(sim, at(low), boxFor(low), low.x, low.z, 3), false);
 assert.equal(roundMeets(sim, at(big), boxFor(big), big.x, big.z, 3), true);
 const stump = treeColliders({ stumps: [stumps[0]] })[0];
 assert.equal(roundMeets(sim, at(stumps[0]), stump, stumps[0].x, stumps[0].z, 3), false);
 assert.ok(round.flight);
});

test('robots still get through the woods', () => {
 const nav = new NavGrid(map, mapColliders(map)), open = new NavGrid(bare, mapColliders(bare));
 const length = (from, path) => [{ x: from[0], z: from[1] }, ...path].reduce((a, p, i) => i ? a + Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z) : 0, 0);
 for (const [from, to] of [[BASES.B, [-10, -2]], [[-12, -46], [-40, -22]], [[-4, -43], [6, -57]], [[-24, -56], [14, -52]], [BASES.B, [-58, 0]]]) {
  const path = nav.path(from[0], from[1], to[0], to[1]), free = open.path(from[0], from[1], to[0], to[1]);
  assert.ok(path && path.length, `a path from ${from} to ${to}`);
  const end = path.at(-1);
  assert.ok(Math.hypot(end.x - to[0], end.z - to[1]) < 1.5, `it arrives (${end.x},${end.z})`);
  assert.ok(length(from, path) < length(from, free) * 1.3 + 3, `not a long way round (${length(from, path).toFixed(1)} vs ${length(from, free).toFixed(1)})`);
 }
});
