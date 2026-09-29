import test from 'node:test';
import assert from 'node:assert/strict';
import { cropEntityVisible } from '../src/crops.js';
const section = () => ({ fieldId: 'farm', x: 0, z: 0, w: 10, d: 10, state: 'standing', visibility: 4.2 });
// (v0.999a, owner: crops hide nobody any more.)
test('crops hide nobody: players and targets are seen in and out of any field', () => {
  const crops = [{ id: 'a', fieldId: 'f', x: 0, z: 0, w: 4, d: 4, state: 'standing', visibility: 2 }, { id: 'b', fieldId: 'g', x: 10, z: 0, w: 4, d: 4, state: 'standing', visibility: 2 }];
  for (const [viewer, entity] of [[{ x: 20, z: 0 }, { x: 0, z: 0 }], [{ x: 0, z: 0 }, { x: 10, z: 0 }], [{ x: 0, z: 0 }, { x: 1.9, z: 1.9 }], [{ x: 10, z: 0 }, { x: 30, z: 0 }]])
    assert.equal(cropEntityVisible(crops, viewer, entity), true);
});

