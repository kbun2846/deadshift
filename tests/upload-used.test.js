import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installUploadUsed } from '../src/render/upload-used.js';

// three.js clears update ranges after it uploads; stand in for that.
const uploaded = a => { const r = a.updateRanges.map(x => [x.start, x.count]); a.clearUpdateRanges(); return r; };

test('dynamic buffers upload only the drawn instances and vertices, and catch up when they grow', () => {
  const scene = new THREE.Scene(); installUploadUsed(scene);
  const pool = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 100); pool.count = 3;
  pool.setColorAt(0, new THREE.Color(1, 1, 1));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(300), 3).setUsage(THREE.DynamicDrawUsage)); g.setDrawRange(0, 10);
  const ribbon = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
  const own = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 50); own.count = 2;
  scene.add(pool, ribbon, own);
  const render = () => scene.onBeforeRender(null, scene, null, null);
  pool.instanceMatrix.needsUpdate = true; pool.instanceColor.needsUpdate = true; g.attributes.position.needsUpdate = true;
  own.instanceMatrix.addUpdateRange(16, 16); own.instanceMatrix.needsUpdate = true;
  render();
  assert.deepEqual(uploaded(pool.instanceMatrix), [[0, 48]]);
  assert.deepEqual(uploaded(pool.instanceColor), [[0, 9]]);
  assert.deepEqual(uploaded(g.attributes.position), [[0, 30]]);
  assert.deepEqual(uploaded(own.instanceMatrix), [[16, 16]], 'an attribute with its own ranges is left alone');
  // No new write: nothing to send.
  render(); assert.equal(pool.instanceMatrix.updateRanges.length, 0);
  // The pool grows without a new write: the grown part goes up.
  pool.count = 5; const v = pool.instanceMatrix.version; render();
  assert.ok(pool.instanceMatrix.version > v); assert.deepEqual(uploaded(pool.instanceMatrix), [[48, 32]]);
  // Drawn in full again: the rest of the ribbon goes up.
  g.setDrawRange(0, Infinity); render(); assert.deepEqual(uploaded(g.attributes.position), [[30, 270]]);
  // A range still waiting (not drawn) is widened by a later, larger write.
  pool.count = 2; pool.instanceMatrix.needsUpdate = true; render();
  pool.count = 4; pool.instanceMatrix.needsUpdate = true; render();
  assert.deepEqual(uploaded(pool.instanceMatrix), [[0, 64]]);
});
