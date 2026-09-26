// world/roof-fade.js: the dithered hole roofs and tree limbs open over a
// character standing outside under them. The shared list holds only the
// characters outside every building, packed from the first slot, and the
// shader loops over just the slots in use (v0.980a: it used to test all
// eight for every roof and limb pixel).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { roofFade, ditherFade, fadeRoofMeshes, ROOF_FADE, LIMB_FADE, WALL_FADE } from '../src/world/roof-fade.js';

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

test('the shader reads the count and stops at it; every material shares one list and one count', () => {
 const view = fakeView(), shared = roofFade(view);
 const compile = material => {
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\nvoid main() {\n#include <clipping_planes_fragment>\n}' };
  material.onBeforeCompile(shader); return shader;
 };
 const roof = new THREE.MeshStandardMaterial(), limbs = new THREE.MeshStandardMaterial();
 ditherFade(view, roof, { key: 'roof' }); ditherFade(view, limbs, { key: 'limbs', ...LIMB_FADE });
 const a = compile(roof), b = compile(limbs);
 for (const s of [a, b]) {
  assert.equal(s.uniforms.roofFade.value, shared.fade);
  assert.equal(s.uniforms.roofFadeCount, shared.count, 'the live count object, not a copy');
  assert.match(s.fragmentShader, /uniform int roofFadeCount;/);
  assert.match(s.fragmentShader, /if \(roofFadeCount > 0\) \{/);
  assert.match(s.fragmentShader, /if \(i >= roofFadeCount\) break;/);
  assert.match(s.vertexShader, /vRoofWorld = /);
  // The hole follows the line from the head to this view's camera, not a fixed tilt.
  assert.match(s.fragmentShader, /vec2 toCamera = \(cameraPosition\.xz - c\.xy\) \/ max\(cameraPosition\.y - headY, 1\.0\);/);
 }
 // The limbs only fade above the shoulders; the roofs from the feet up.
 assert.match(b.fragmentShader, new RegExp(`c\\.z \\+ ${LIMB_FADE.above.toFixed(4)}`));
 assert.match(a.fragmentShader, /c\.z \+ 0\.0000/);
 assert.notEqual(roof.customProgramCacheKey(), limbs.customProgramCacheKey());
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
