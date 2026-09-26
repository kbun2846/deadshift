// The headless tools' spots and the walk judge (tools/terrain-spots.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSpot, parseArgs, judgeWalk, SPOTS } from '../tools/terrain-spots.mjs';
import { hillTest } from '../src/maps/hill-test.js';

test('named and x,z spots resolve; unknown names throw', () => {
 assert.deepEqual(resolveSpot('hill-test', 'start'), { name: 'start', x: 0, z: 6 });
 assert.equal(resolveSpot('hill-test', '12,-4').z, -4);
 assert.equal(resolveSpot('hill-test', null), null);
 assert.throws(() => resolveSpot('hill-test', 'nowhere'), /unknown spot/);
});

test('Test Hill spots sit inside the terrain', () => {
 const [x0, z0, x1, z1] = hillTest.terrain.bounds;
 for (const s of Object.values(SPOTS['hill-test'])) assert.ok(s.x > x0 && s.x < x1 && s.z > z0 && s.z < z1);
});

test('flags parse with a space or =', () => {
 assert.deepEqual(parseArgs(['--map', 'hill-test', '--spot=plateau', '--walk', 'extreme']), { flags: { map: 'hill-test', spot: 'plateau', walk: true }, rest: ['extreme'] });
});

test('the walk judge catches NaN, sinking and getting stuck', () => {
 const ok = [{ t: 0, x: 0, z: 0, y: 1, ground: 1 }], leg = { name: 'n', from: { x: 0, z: 0 }, to: { x: 0, z: -5 } };
 assert.deepEqual(judgeWalk(ok, [leg]), []);
 assert.match(judgeWalk([{ ...ok[0], x: NaN }], [leg])[0], /NaN/);
 assert.match(judgeWalk([{ ...ok[0], y: .5 }], [leg])[0], /below ground/);
 assert.match(judgeWalk(ok, [{ ...leg, to: { x: 0, z: -.3 } }])[0], /stuck/);
});
