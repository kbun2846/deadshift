// world/roof-fade.js: the hole walls and tree limbs open over a character
// standing outside under them, and the colonial roofs' whole sections
// (s6-roofs). The shared list holds only the characters outside every
// building, packed from the first slot, and the shader loops over just the
// slots in use (v0.980a: it used to test all eight for every roof and limb
// pixel).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { roofFade, ditherFade, fadeRoofMeshes, fadeOverlay, prepareFades, treeFade, ROOF_FADE, TREE_FADE, WALL_FADE,
 SECTION_FADE, fadeRoofMaterial, roofOverlayMaterial, roofSections, registerSections, updateSections, shownInside } from '../src/world/roof-fade.js';

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

// --- The colonial roofs' sections (s6-roofs, owner: "make it bigger and make
// it make the whole front section of the roof transparent") -----------------

// A gable house at the origin, 8 x 6, eaves 2.8, ridge 5.6, its front (+z)
// eave running .45 past the wall and its north one .2 (as colonial-buildings
// builds them), and a hood over the front door taking the front slope along.
// The sections are in the building's frame; the camera over whoever is
// looked at, 29 m up and about 10 south, as the game's.
function sectionView() {
 const house = { id: 'house', x: 0, z: 0, w: 8, d: 6, angle: 0, baseY: 0 }, slope = (za, ya, zb, yb) => ({ x0: -4.37, x1: 4.37, z0: za - .15, z1: zb + .15, y0: -Infinity, t0: ya + SECTION_FADE.thick, t1: yb + SECTION_FADE.thick, along: 2 });
 const view = { player: new THREE.Group(), renderer: { info: { render: { frame: 1 } } }, map: { buildings: [house] }, remote: { avatars: new Map() }, camera: { position: new THREE.Vector3() } };
 const record = registerSections(view, house, [
  { shapes: [slope(0, 5.6, 3.45, 2.38)] }, // 0: the front slope
  { shapes: [slope(-3.2, 2.61, 0, 5.6)] }, // 1: the back slope
  { shapes: [{ x0: -1.65, x1: 1.65, z0: 3.16, z1: 4.06, y0: 2.05, t0: 2.75, t1: 2.75, along: 0 }], pull: 0 }, // 2: the front door's hood
 ]);
 record.entry = { opacity: 1 }; record.box = new THREE.Box3(new THREE.Vector3(-4.4, 2, -3.4), new THREE.Vector3(4.4, 6, 4.1));
 roofFade(view);
 const look = (x, z) => view.camera.position.set(x, 29, z + 29 * 11.5 / 33);
 // Stand the player (and anyone else) somewhere, the camera over the player, and decide.
 const stand = (x, z, others = []) => {
  view.player.position.set(x, 0, z); look(x, z);
  view.remote.avatars = new Map(others.map(([ox, oz], i) => { const root = new THREE.Group(); root.position.set(ox, 0, oz); new THREE.Group().add(root); return [i, { root }]; }));
  view.roofFade.refresh(); updateSections(view, 0);
  return record.sections.map(s => s.target);
 };
 return { view, record, stand, look };
}

test('a colonial roof fades by whole sections: one shared table, a section per vertex, dropped from the opaque draw, drawn by the blended copy', () => {
 const view = { renderer: { info: { render: { frame: 1 } } } };
 const compile = material => { const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\n#include <project_vertex>', fragmentShader: '#include <common>\nvoid main() {\n#include <clipping_planes_fragment>\n}' }; material.onBeforeCompile(shader); return shader; };
 const roof = new THREE.MeshStandardMaterial({ vertexColors: true }); fadeRoofMaterial(view, roof);
 const clear = roofOverlayMaterial(view), a = compile(roof), c = compile(clear);
 assert.equal(roofOverlayMaterial(view), clear, 'one blended material for every roof\'s copy');
 const { values } = roofSections(view);
 assert.equal(values.length, SECTION_FADE.slots);
 for (const s of [a, c]) {
  assert.equal(s.uniforms.roofSections.value, values, 'the live table, shared');
  assert.match(s.vertexShader, /attribute float roofSection;/);
  assert.match(s.vertexShader, new RegExp(`uniform vec4 roofSections\\[${SECTION_FADE.slots / 4}\\];`));
  assert.doesNotMatch(s.fragmentShader, /roofFadeCount|discard/, 'no per-pixel loop, no discard: the old patch is the walls\' now');
 }
 // Opaque: a faded section's vertices go outside the view (no fragments, early depth kept); the copy: only those, at 1 - fade x strength.
 assert.match(a.vertexShader, /if \(sectionGone > 0\.0040\) gl_Position = vec4\(2\.0, 2\.0, 2\.0, 1\.0\);/);
 assert.match(c.vertexShader, /if \(sectionGone <= 0\.0040\) gl_Position = vec4\(2\.0, 2\.0, 2\.0, 1\.0\);/);
 assert.match(c.fragmentShader, new RegExp(`diffuseColor\\.a \\*= 1\\.0 - vSectionFade \\* ${SECTION_FADE.strength.toFixed(4)};`));
 assert.ok(clear.transparent && !clear.depthWrite);
 assert.notEqual(roof.customProgramCacheKey(), clear.customProgramCacheKey());
 assert.ok(SECTION_FADE.strength > .8 && SECTION_FADE.strength < .9, 'about .85');
});

test('a section fades for someone standing under it or hidden by it from the camera, not for someone beside it', () => {
 const { stand } = sectionView();
 assert.deepEqual(stand(0, 12), [0, 0, 0], 'in the street: nothing');
 assert.deepEqual(stand(0, 3.75), [1, 0, 1], 'on the front stoop: the hood, and the front slope with it');
 assert.deepEqual(stand(3, 3.75), [1, 0, 0], 'hugging the front wall, under the eave: the front slope');
 assert.deepEqual(stand(3, 4.55), [0, 0, 0], 'a metre out in front: the camera looks from the south, nothing hides them');
 assert.deepEqual(stand(-1, -3.6), [0, 1, 0], 'against the back wall: the back slope only');
 assert.deepEqual(stand(-1, -4.3), [0, 1, 0], 'a metre behind the house: the back eave hides their middle from the camera');
 assert.deepEqual(stand(-1, -5.7), [0, 0, 0], 'further back: the line clears the roof');
 assert.deepEqual(stand(0, 0), [0, 0, 0], 'inside: under their own roof by design (the whole roof lifts for you)');
 // Anyone the view draws counts, not only you: someone behind the house while you stand beside it.
 assert.deepEqual(stand(8, -3, [[-1, -3.6]]), [0, 1, 0]);
 // Toward the top of the screen the camera looks in lower: seen from the street, their line crosses the whole house.
 assert.deepEqual(stand(0, 12, [[-1, -3.6]]), [1, 1, 0]);
});

test('sections ease in and out (smoothstep, fadeIn / fadeOut seconds), into the shared table', () => {
 const { view, record, stand } = sectionView(), front = record.sections[0], { values } = view.roofSections;
 stand(0, 3.75);
 const seen = [];
 for (let t = 0; t < SECTION_FADE.fadeIn + .05; t += .02) { updateSections(view, .02); seen.push(values[front.index]); }
 assert.ok(seen.every((v, i) => !i || v >= seen[i - 1]), 'rises steadily');
 assert.ok(seen[0] < .1, 'no pop: it starts gently');
 assert.equal(seen.at(-1), 1);
 const half = Math.round(SECTION_FADE.fadeIn / 2 / .02) - 1;
 assert.ok(Math.abs(seen[half] - .5) < .15, `about half way at half the time (${seen[half].toFixed(2)})`);
 stand(0, 12); let t = 0;
 while (values[front.index] > 0 && t < 1) { updateSections(view, .02); t += .02; }
 assert.ok(Math.abs(t - SECTION_FADE.fadeOut) < .03, `gone after fadeOut (${t.toFixed(2)} s)`);
 assert.ok(SECTION_FADE.fadeIn >= .15 && SECTION_FADE.fadeOut <= .25);
});

test('a roof\'s blended copy shows while any of its sections is faded or fading, never while the roof fades as a whole', () => {
 const { view, record, stand } = sectionView(), S = view.roofSections;
 const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
 let whole = false;
 fadeRoofMeshes(view, [mesh], new THREE.MeshStandardMaterial(), () => whole, { start: record.start, end: record.start + record.sections.length });
 const copy = mesh.children[0];
 assert.equal(copy.geometry, mesh.geometry); assert.equal(copy.visible, false);
 assert.equal(mesh.onBeforeRender, THREE.Object3D.prototype.onBeforeRender, 'no hook: prepareFades decides the sections');
 const frame = () => { S.clock = Math.max(0, performance.now() - 100); prepareFades(view); }; // (a tenth of a second since the last frame)
 stand(0, 12); frame(); assert.equal(copy.visible, false, 'nobody under it');
 view.player.position.set(0, 0, 3.75); view.camera.position.set(0, 29, 3.75 + 10.1); frame();
 assert.equal(copy.visible, true, 'on the stoop');
 whole = true; frame(); assert.equal(copy.visible, false, 'the roof fades as a whole: its copy stays hidden');
 whole = false; view.player.position.set(0, 0, 12); view.camera.position.set(0, 29, 22.1); frame();
 assert.equal(copy.visible, true, 'still fading out');
 for (let i = 0; i < 4; i++) frame();
 assert.equal(copy.visible, false, 'faded back in: hidden again');
});

test('nobody inside a closed building shows through its faded roof: only to someone inside it or in its doorway (gameplay guard)', () => {
 const house = { id: 'house', x: 0, z: 0, w: 8, d: 6 }, barn = { id: 'barn', x: 20, z: 0, w: 6, d: 8 }, shed = { id: 'shed', x: -20, z: 0, w: 4, d: 4, open: true };
 const view = {}, S = roofSections(view);
 for (const b of [house, barn, shed]) registerSections(view, b, [{ shapes: [] }]).entry = { opacity: 1 };
 const inHouse = { x: 1, z: 1 }, outside = { x: 0, z: 9 }, inShed = { x: -20, z: .5 };
 assert.equal(shownInside(view, { roofId: null }, inHouse), false, 'you outside: hidden, even through a faded section');
 assert.equal(shownInside(view, { roofId: 'barn' }, inHouse), false, 'you in another building: hidden');
 assert.equal(shownInside(view, { roofId: 'house' }, inHouse), true, 'you inside it too');
 S.roofs[0].entry.opacity = .4;
 assert.equal(shownInside(view, { roofId: null }, inHouse), true, 'you in its doorway: its roof lifting for you');
 S.roofs[0].entry.opacity = .999;
 assert.equal(shownInside(view, { roofId: null }, inHouse), false, 'closed again');
 assert.equal(shownInside(view, { roofId: null }, inShed), true, 'an open shed is outdoors');
 assert.equal(shownInside(view, { roofId: null }, outside), true);
 assert.equal(shownInside({}, { roofId: null }, inHouse), true, 'no sectioned roofs (Deadwater): nothing changes');
});
