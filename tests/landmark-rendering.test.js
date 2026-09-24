import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WorldView } from '../src/render/renderer.js';
import { makeLandmark } from '../src/world/world-details.js';

test('open-country landmarks build finite geometry with the real renderer helpers', () => {
  const view = Object.create(WorldView.prototype); view.materials = new Map(); view.static = new THREE.Group();
  for (const type of ['deadTree', 'stump', 'boulder', 'cistern', 'ruinedArch', 'telegraph', 'windmill', 'trough', 'brokenWagon']) {
    const group = new THREE.Group(); makeLandmark(view, { type }, group);
    assert.ok(group.children.length > 0, type);
    group.traverse(o => {
      if (!o.geometry) return;
      assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite), type + ' has invalid vertices');
      assert.ok(o.position.toArray().every(Number.isFinite), type + ' has invalid placement');
      o.geometry.dispose();
    });
  }
});
