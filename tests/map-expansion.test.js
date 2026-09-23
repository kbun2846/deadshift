import test from 'node:test';
import assert from 'node:assert/strict';
import { deadwater, mapColliders, localOpenings, buildingOpenings } from '../src/maps.js';
import { inside, RULES, segmentBox } from '../src/simulation.js';

test('expanded map has three times the area, varied interiors and single-entry small houses', () => {
  assert.ok(deadwater.width * deadwater.depth / (76 * 64) > 2.9);
  assert.equal(deadwater.buildings.length, 20);
  for (const id of ['old-house', 'abandoned-store']) {
    const b = deadwater.buildings.find(b => b.id === id);
    assert.equal(localOpenings(b).length, 1); assert.equal(localOpenings(b)[0].type, 'door');
  }
  for (const b of deadwater.buildings) for (const opening of localOpenings(b)) {
    const span = ['front', 'back'].includes(opening.side) ? b.w : b.d;
    assert.ok(Math.abs(opening.offset) + opening.width / 2 < span / 2);
  }
});

test('all interiors and farm entrances are reachable from spawn without crossing cover', () => {
  const step = .5, width = deadwater.width * 2 + 1, depth = deadwater.depth * 2 + 1;
  const colliders = mapColliders(deadwater), open = new Uint8Array(width * depth), visited = new Uint8Array(width * depth);
  const point = index => ({ x: index % width * step - deadwater.width / 2, z: Math.floor(index / width) * step - deadwater.depth / 2 });
  const index = p => Math.round((p.z + deadwater.depth / 2) / step) * width + Math.round((p.x + deadwater.width / 2) / step);
  for (let i = 0; i < open.length; i++) {
    const p = point(i);
    open[i] = Number(Math.abs(p.x) < deadwater.width / 2 - RULES.radius && Math.abs(p.z) < deadwater.depth / 2 - RULES.radius && !colliders.some(c => inside(p, c, RULES.radius)));
  }
  const queue = [index(deadwater.spawn)]; visited[queue[0]] = 1;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const i = queue[cursor];
    for (const next of [i - 1, i + 1, i - width, i + width]) if (open[next] && !visited[next]) { visited[next] = 1; queue.push(next); }
  }
  for (const b of deadwater.buildings) {
    assert.ok(visited[index(b)], b.id + ' interior is unreachable');
    for (const door of buildingOpenings(b).filter(o => o.type === 'door')) {
      const middle = { x: (door.a.x + door.b.x) / 2, z: (door.a.z + door.b.z) / 2 };
      assert.ok(visited[index(middle)], b.id + ' doorway is obstructed');
    }
  }
  assert.ok(visited[index(deadwater.crops[0])]);
});

test('boarded windows have real walls and never provide firing cones', () => {
  for (const b of deadwater.buildings.filter(b => b.abandoned)) {
    assert.ok(buildingOpenings(b).every(o => o.type === 'door'));
    const solid = mapColliders({ ...deadwater, buildings: [b], props: [], fences: [] });
    assert.ok(solid.some(c => segmentBox(b.x, b.z, b.x - 10, b.z, c) !== null));
  }
});

