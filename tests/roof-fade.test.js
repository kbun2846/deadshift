// world/roof-fade.js: the dithered hole roofs and tree limbs open over a
// character standing outside under them. The shared list holds only the
// characters outside every building, packed from the first slot, and the
// shader loops over just the slots in use (v0.980a: it used to test all
// eight for every roof and limb pixel).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { roofFade, ditherFade, fadeRoofMeshes, fadeOverlay, prepareFades, treeFade, ROOF_FADE, TREE_FADE, WALL_FADE } from '../src/world/roof-fade.js';

const body = (x, y, z, visible = true) => { const root = new THREE.Group(); root.position.set(x, y, z); root.visible = visible; new THREE.Group().add(root); return { root }; };

function fakeView() {
 const player = new THREE.Group(); player.position.set(10, 2, 5);
 return {
  player, renderer: { info: { render: { frame: 1 } } },
  map: { buildings: [{ x: 0, z: 0, w: 6, d: 6 }, { x: 40, z: 0, w: 4, d: 4, open: true }] },
  remote: { avatars: new Map([['a', body(1, 0, 1)], ['b', body(-20, 1, 3)], ['c', body(30, 0, 30, false)], ['d', body(40.5, 0, .5)]]) },
 };
}

test('the fade list: characters outside every building, packed from the first slot, the rest off', () => {
 const view = fakeView(), { fade, count, update } = roofFade(view);
 assert.equal(roofFade(view).fade, fade, 'one list per view');
 update();
 // You (outside), b (outside) and d (under an open shed's roof, which is
 // outdoors: stage 5 review); a stands inside the building; c is hidden.
 assert.equal(count.value, 3);
 assert.deepEqual(fade[0].toArray(), [10, 5, 2, 1]);
 assert.deepEqual(fade[1].toArray(), [-20, 3, 1, 1]);
 assert.deepEqual(fade[2].toArray(), [40.5, .5, 0, 1]);
 for (let i = 3; i < ROOF_FADE.slots; i++) assert.equal(fade[i].w, 0);
 // Once a frame: a second call in the same frame changes nothing.
 view.player.position.set(0, 0, 0); update(); assert.equal(count.value, 3);
 // Next frame: you walked inside.
 view.remote.avatars.delete('d'); view.renderer.info.render.frame = 2; update();
 assert.equal(count.value, 1); assert.deepEqual(fade[0].toArray(), [-20, 3, 1, 1]); assert.equal(fade[1].w, 0);
 // Nobody outside: the shader skips the fade entirely.
 view.remote.avatars.clear(); view.renderer.info.render.frame = 3; update();
 assert.equal(count.value, 0);
});

test('the shader reads the count and stops at it; every material shares one list and one count; the patch is cut clean, not dithered', () => {
 const view = fakeView(), shared = roofFade(view);
 const compile = material => {
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\nvoid main() {\n#include <clipping_planes_fragment>\n}' };
  material.onBeforeCompile(shader); return shader;
 };
 const roof = new THREE.MeshStandardMaterial(), walls = new THREE.MeshStandardMaterial(), clear = new THREE.MeshStandardMaterial();
 ditherFade(view, roof, { key: 'roof' }); ditherFade(view, walls, { key: 'walls', ...WALL_FADE }); ditherFade(view, clear, { key: 'roof', overlay: true });
 const a = compile(roof), b = compile(walls), c = compile(clear);
 for (const s of [a, b, c]) {
  assert.equal(s.uniforms.roofFade.value, shared.fade);
  assert.equal(s.uniforms.roofFadeCount, shared.count, 'the live count object, not a copy');
  assert.match(s.fragmentShader, /uniform int roofFadeCount;/);
  assert.match(s.fragmentShader, /if \(roofFadeCount > 0\) \{/);
  assert.match(s.fragmentShader, /if \(i >= roofFadeCount\) break;/);
  assert.match(s.vertexShader, /vRoofWorld = /);
  // The patch follows the line from the head to this view's camera, not a fixed tilt.
  assert.match(s.fragmentShader, /vec2 toCamera = \(cameraPosition\.xz - c\.xy\) \/ max\(cameraPosition\.y - headY, 1\.0\);/);
  assert.doesNotMatch(s.fragmentShader, /fract\(sin\(dot\(floor\(gl_FragCoord/, 'no dither noise (owner, v0.985a)');
 }
 // The opaque draw leaves the patch out; its blended copy draws only the patch, at the opacity the fade leaves.
 assert.match(a.fragmentShader, /if \(roofOpen > 0\.0040\) discard;/);
 assert.match(c.fragmentShader, /if \(roofOpen <= 0\.0040\) discard;\s*diffuseColor\.a \*= 1\.0 - roofOpen \* 0\.9200;/);
 assert.ok(clear.transparent && !clear.depthWrite, 'the copy blends and writes no depth');
 assert.notEqual(roof.customProgramCacheKey(), clear.customProgramCacheKey());
 // The walls only fade from the waist up; the roofs from the feet up.
 assert.match(b.fragmentShader, new RegExp(`c\\.z \\+ ${WALL_FADE.above.toFixed(4)}`));
 assert.match(a.fragmentShader, /c\.z \+ 0\.0000/);
 assert.notEqual(roof.customProgramCacheKey(), walls.customProgramCacheKey());
});

test('a blended copy shows only while someone is near its mesh, and never while it is told to stay hidden', () => {
 const view = fakeView(); roofFade(view);
 const near = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial()), far = near.clone();
 near.position.set(12, 0, 5); far.position.set(90, 0, 90); near.updateMatrixWorld(); far.updateMatrixWorld();
 let hide = false;
 const a = fadeOverlay(view, near, new THREE.MeshBasicMaterial()), b = fadeOverlay(view, far, new THREE.MeshBasicMaterial(), () => hide);
 assert.equal(a.parent, near); assert.equal(a.geometry, near.geometry); assert.equal(a.castShadow, false); assert.equal(a.visible, false);
 prepareFades(view);
 assert.equal(a.visible, true, 'you stand by it'); assert.equal(b.visible, false, 'nobody near');
 view.player.position.set(90, 0, 92); view.remote.avatars.clear(); prepareFades(view);
 assert.equal(a.visible, false); assert.equal(b.visible, true);
 hide = true; prepareFades(view); assert.equal(b.visible, false, 'told to stay hidden');
});

test('a whole tree fades: its clumps by instance, its limbs easing back to solid toward the trunk', () => {
 const view = fakeView();
 const compile = material => { const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\n#include <project_vertex>', fragmentShader: '#include <common>\nvoid main() {\n#include <clipping_planes_fragment>\n}' }; material.onBeforeCompile(shader); return shader; };
 const leaves = new THREE.MeshStandardMaterial(), leavesClear = new THREE.MeshStandardMaterial(), limbs = new THREE.MeshStandardMaterial(), limbsClear = new THREE.MeshStandardMaterial();
 treeFade(view, leaves, { key: 'c', instanced: true, strength: TREE_FADE.canopy }); treeFade(view, leavesClear, { key: 'c', instanced: true, strength: TREE_FADE.canopy, overlay: true });
 treeFade(view, limbs, { key: 'l', strength: TREE_FADE.limbs }); treeFade(view, limbsClear, { key: 'l', strength: TREE_FADE.limbs, overlay: true });
 const L = compile(leaves), LC = compile(leavesClear), T = compile(limbs), TC = compile(limbsClear);
 for (const s of [L, LC]) { assert.match(s.vertexShader, /attribute vec4 treeAt;/); assert.match(s.vertexShader, /float treeUnder\(vec4 t, float h\)/); }
 // The opaque leaves drop a fading clump by its vertices (no discard, early depth kept); the copy draws only those.
 assert.match(L.vertexShader, /if \(treeGone > 0\.0040\) gl_Position = vec4\(2\.0, 2\.0, 2\.0, 1\.0\);/);
 assert.match(LC.vertexShader, /if \(treeGone <= 0\.0040\) gl_Position = vec4\(2\.0, 2\.0, 2\.0, 1\.0\);/);
 assert.doesNotMatch(L.fragmentShader, /discard/); assert.match(LC.fragmentShader, /diffuseColor\.a \*= 1\.0 - vTreeFade;/);
 // Limbs: the whole tree, graded from the trunk's foot up.
 assert.match(T.fragmentShader, new RegExp(`smoothstep\\(vTreeAt\\.w \\+ ${TREE_FADE.from.toFixed(4)}, vTreeAt\\.w \\+ ${TREE_FADE.to.toFixed(4)}, vRoofWorld\\.y\\)`));
 assert.match(T.fragmentShader, /if \(treeGone > 0\.0040\) discard;/);
 assert.match(TC.fragmentShader, /if \(treeGone <= 0\.0040\) discard;\s*diffuseColor\.a \*= 1\.0 - treeGone \* 0\.8000;/);
 assert.ok(TREE_FADE.canopy >= .8, 'very see-through');
});

test('the roof meshes update the list with no wrapper of their own (nothing allocated a frame)', () => {
 const view = fakeView(), { update } = roofFade(view), root = new THREE.Group();
 const plain = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()), hooked = plain.clone(), prepass = plain.clone();
 let called = 0; hooked.onBeforeRender = () => { called++; }; prepass.userData.roofPrepass = true;
 root.add(plain, hooked, prepass);
 fadeRoofMeshes(view, root);
 assert.equal(plain.onBeforeRender, update, 'the shared update itself');
 assert.notEqual(hooked.onBeforeRender, update); hooked.onBeforeRender(); assert.equal(called, 1, 'a mesh\'s own hook still runs');
 assert.equal(prepass.onBeforeRender, THREE.Object3D.prototype.onBeforeRender, 'depth copies left alone');
});

test('the colonial walls open too: from the waist up, and only on the camera\'s side of the body', () => {
 const view = fakeView();
 const compile = material => { const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\nvoid main() {\n#include <clipping_planes_fragment>\n}' }; material.onBeforeCompile(shader); return shader; };
 const wall = new THREE.MeshStandardMaterial(), roof = new THREE.MeshStandardMaterial();
 ditherFade(view, wall, { key: 'wall', ...WALL_FADE }); ditherFade(view, roof, { key: 'roof' });
 const w = compile(wall), r = compile(roof);
 assert.match(w.fragmentShader, new RegExp(`c\\.z \\+ ${WALL_FADE.above.toFixed(4)}`));
 assert.match(w.fragmentShader, /if \(dot\(vRoofWorld\.xz - c\.xy, cameraPosition\.xz - c\.xy\) < -0\.3\) continue;/);
 assert.doesNotMatch(r.fragmentShader, /dot\(vRoofWorld/, 'a roof opens all round');
});
