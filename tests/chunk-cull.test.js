import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ChunkCull, CHUNK_SIZE } from '../src/render/chunk-cull.js';

// A stand-in view: only what ChunkCull reads (the shadow map it wraps, the sun).
function fakeView() {
 const calls = [];
 const shadowMap = { render(lights, scene, camera) { calls.push(lights); } };
 const sun = new THREE.DirectionalLight(); sun.castShadow = true;
 return { renderer: { shadowMap }, sun, calls };
}

// A frozen root of boxes spread over a 200 m square, some in nested groups as batch() leaves them.
function scenery() {
 const root = new THREE.Group(), geometry = new THREE.BoxGeometry(1, 2, 1), material = new THREE.MeshBasicMaterial();
 for (let x = -100; x < 100; x += 7) for (let z = -100; z < 100; z += 9) {
  const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, 1, z);
  if ((x + z) % 3 === 0) { const g = new THREE.Group(); g.position.set(x, 0, z); mesh.position.set(0, 1, 0); g.add(mesh); root.add(g); }
  else root.add(mesh);
 }
 const never = new THREE.Mesh(geometry, material); never.frustumCulled = false; never.position.set(90, 1, 90); root.add(never);
 root.add(new THREE.Group()); // an empty group: nothing to test
 root.updateMatrixWorld(true);
 return root;
}

const camera = () => {
 const c = new THREE.PerspectiveCamera(40, 16 / 9, .5, 120); c.position.set(0, 30, 12); c.lookAt(0, 0, 0);
 c.updateMatrixWorld(); c.updateProjectionMatrix(); return c;
};
const meshes = root => { const list = []; root.traverse(o => { if (o.isMesh) list.push(o); }); return list; };
const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

test('scenery goes into chunks with every world matrix unchanged', () => {
 const view = fakeView(), root = scenery();
 const before = new Map(meshes(root).map(m => [m, m.matrixWorld.clone()]));
 const cull = new ChunkCull(view); cull.adopt(root);
 assert.ok(cull.chunks.length > 10, 'the map is split into many chunks');
 assert.ok(root.children.length < before.size / 3, 'the root walks far fewer children');
 for (const [mesh, matrix] of before) {
  mesh.updateMatrixWorld(false);
  assert.ok(mesh.matrixWorld.equals(matrix));
 }
 // Each chunk holds children standing within one CHUNK_SIZE square (by their centres).
 for (const c of cull.chunks) {
  const xs = c.spheres.map(s => Math.floor(s.center.x / CHUNK_SIZE));
  assert.ok(Math.max(...xs) - Math.min(...xs) <= 1);
 }
 // Adopting again changes nothing.
 const count = cull.chunks.length; cull.adopt(root); assert.equal(cull.chunks.length, count);
});

test('a chunk is hidden only when three would have culled every mesh in it', () => {
 const view = fakeView(), root = scenery(), cull = new ChunkCull(view); cull.adopt(root);
 const scene = new THREE.Scene(); scene.add(root);
 const cam = camera(), frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
 cull.cull(cam);
 let hidden = 0;
 for (const mesh of meshes(root)) {
  const drawn = !mesh.frustumCulled || frustum.intersectsObject(mesh);
  if (drawn) assert.ok(shown(mesh), 'everything three would draw stays shown');
  if (!shown(mesh)) hidden++;
 }
 assert.ok(hidden > 100, 'most of the map is skipped as whole chunks');
 cull.restore();
 for (const mesh of meshes(root)) assert.ok(shown(mesh), 'after the frame everything is shown again');
});

test('the shadow pass sees every chunk (shadow cache), or what the sun\'s box reaches', () => {
 const view = fakeView(), root = scenery(), cull = new ChunkCull(view); cull.adopt(root);
 const scene = new THREE.Scene(); scene.add(root, view.sun, view.sun.target);
 view.sun.position.set(-24, 40, -18); view.sun.target.position.set(0, 0, 0);
 const s = view.sun.shadow.camera; s.left = -30; s.right = 30; s.top = 30; s.bottom = -30; s.near = 1; s.far = 120; s.updateProjectionMatrix();
 // What is shown while the (wrapped) shadow map draws.
 const during = []; view.calls.push = () => during.push(cull.chunks.filter(c => c.group.visible).length);
 cull.cull(camera());
 const cameraSeen = cull.chunks.filter(c => c.seen).length;
 view.renderer.shadowMap.render([view.sun], scene, camera());
 assert.ok(during[0] > cameraSeen, 'casters just off screen are drawn into the shadow map');
 assert.ok(during[0] < cull.chunks.length, 'far chunks are still skipped');
 assert.equal(cull.chunks.filter(c => c.group.visible).length, cameraSeen, 'the camera\'s set is back after the shadow pass');
 // With a shadow cache active, every chunk is shown for it (it redraws kept regions from the same roots).
 view.shadowCache = { active: true };
 view.renderer.shadowMap.render([view.sun], scene, camera());
 assert.equal(during[1], cull.chunks.length);
 cull.restore();
});
