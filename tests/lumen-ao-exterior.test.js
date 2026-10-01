// From outside you see a building's outside only (owner, 2026-10-01: "i can
// literally see through the ceilings / walls of towers and buildings, so i
// can see the interiors on first floor / models in there. i should be able
// to only see exteriors from outside"). On Extreme the ambient occlusion
// draws the scene's depth and normals again with one plain normals material
// (no cut), so Lumen's shells were left out of that draw; with nothing in
// their place it worked the occlusion out from the first floors and rooms
// under every roof and wall and laid it over them on screen. Now the shells
// go into that draw with their own cut (render/city-shells.js aoScene,
// render/extreme-post.js SceneAOPass `extra`): the occlusion's depth is the
// frame's own, roof for roof and hole for hole.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { CityShells } from '../src/render/city-shells.js';
import { SceneAOPass } from '../src/render/extreme-post.js';
import { maps } from '../src/maps.js';

const view = { scene: new THREE.Scene() }, city = { uniforms: { cutTexture: { value: null } }, cutTexture: null };
const shells = new CityShells(view, maps.lumen, city);
shells.setQuality('extreme');

test('the AO\'s stand-ins: every shell and facade mesh, its own geometry, shown as it is', () => {
  const scene = shells.aoScene(), sources = [...shells.cellMeshes, ...shells.detailMeshes.flat()];
  assert.equal(scene.children.length, sources.length);
  for (const [i, p] of scene.children.entries()) {
    assert.equal(p.geometry, sources[i].geometry, 'the same geometry, never copied');
    assert.equal(p.material, shells.aoMaterial);
    assert.equal(p.visible, sources[i].visible);
  }
  assert.ok(sources.length > 40, `${sources.length}`);
  // A preset that shows another detail step: the stand-ins follow.
  shells.setQuality('balanced');
  const again = shells.aoScene(), all = [...shells.cellMeshes, ...shells.detailMeshes.flat()];
  for (const p of again.children) assert.equal(p.visible, p.userData.source.visible && p.userData.source.parent?.visible !== false);
  assert.ok(again.children.some(p => p.userData.source.name === 'city-facade-detail-3' && !p.visible), 'Extreme\'s detail hidden on Balanced');
  assert.ok(again.children.length === all.length);
  // (a mesh the chunk cull hides this frame is hidden in the AO's draw too)
  const m = shells.cellMeshes[0]; m.visible = false;
  assert.equal(shells.aoScene().children.find(p => p.userData.source === m).visible, false);
  m.visible = true;
  shells.setQuality('extreme');
});

test('the AO\'s stand-ins draw normals with the shells\' own cut (the same discard, the same moved section caps, lids, plugs and knee walls)', () => {
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\n#include <project_vertex>', fragmentShader: '#include <common>\nvoid main() {\n#include <clipping_planes_fragment>\n}' };
  shells.aoMaterial.onBeforeCompile(shader);
  const shell = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: 'void main() {\n#include <clipping_planes_fragment>\n}' };
  shells.material.onBeforeCompile(shell);
  const cut = s => s.slice(s.indexOf('if (vCityInfo.z'), s.indexOf('discard;') + 8);
  assert.ok(cut(shader.fragmentShader).length > 40 && cut(shader.fragmentShader) === cut(shell.fragmentShader), 'the shells\' discard');
  assert.match(shader.vertexShader, /vCityWorld = \(modelMatrix \* vec4\(transformed, 1\.0\)\)\.xyz;/);
  assert.match(shader.vertexShader, /cityRoomKnee\(cityAt\)/);
  for (const u of ['cityCutMap', 'cutEye', 'cutTargets', 'cityFootMask', 'cityFootBox', 'cityRoomQuad']) assert.ok(shader.uniforms[u], u);
  assert.ok(shells.aoMaterial.isMeshNormalMaterial && shells.aoMaterial.blending === THREE.NoBlending);
  assert.equal(shells.aoMaterial.customProgramCacheKey(), 'lumen-city-shell-ao-v1');
});

test('the AO pass draws the scene, then the shells with their cut, into the same depth and normals (no clear between)', () => {
  const extra = new THREE.Scene(), pass = new SceneAOPass(new THREE.Scene(), new THREE.PerspectiveCamera(), 4, 4, () => [], () => extra);
  const calls = [], renderer = {
    autoClear: true, getClearColor: c => c, getClearAlpha: () => 1, setClearColor() {}, setClearAlpha() {},
    setRenderTarget: t => calls.push(['target', t]), clear: () => calls.push(['clear']),
    render: (s, c) => calls.push(['render', s, renderer.autoClear, pass.scene.overrideMaterial]),
  };
  pass._renderOverride(renderer, pass.normalMaterial, pass.normalRenderTarget, 0x7777ff, 1);
  const renders = calls.filter(c => c[0] === 'render');
  assert.equal(renders.length, 2);
  assert.equal(renders[0][1], pass.scene); assert.equal(renders[0][3], pass.normalMaterial);
  assert.equal(renders[1][1], extra); assert.equal(renders[1][2], false, 'drawn over, not cleared');
  assert.equal(renders[1][3], null, 'with its own materials');
  assert.equal(calls.filter(c => c[0] === 'clear').length, 1);
  assert.equal(calls.findLastIndex(c => c[0] === 'target'), calls.findIndex(c => c[1] === extra) - 1);
  assert.equal(calls[calls.findIndex(c => c[1] === extra) - 1][1], pass.normalRenderTarget);
  assert.equal(renderer.autoClear, true);
  // Another target (none of the AO's own draws): nothing extra.
  calls.length = 0; pass._renderOverride(renderer, pass.normalMaterial, new THREE.WebGLRenderTarget(2, 2), 0, 1);
  assert.equal(calls.filter(c => c[0] === 'render').length, 1);
  // No extra (every other map): just the scene.
  const plain = new SceneAOPass(new THREE.Scene(), new THREE.PerspectiveCamera(), 4, 4, () => [], () => null);
  calls.length = 0; plain._renderOverride(renderer, plain.normalMaterial, plain.normalRenderTarget, 0, 1);
  assert.equal(calls.filter(c => c[0] === 'render').length, 1);
});

test('the view hands the AO the shells instead of its plain draw of them, and warms their program', () => {
  const src = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(src, /extra: \(\) => this\.city\?\.shells\?\.aoScene\?\.\(\)/);
  assert.match(src, /list\.push\(this\.city\.shells\.upper, \.\.\.this\.city\.shells\.cellMeshes\)/);
  const warm = readFileSync(new URL('../src/render/warm-up.js', import.meta.url), 'utf8');
  assert.match(warm, /ao\.drawExtra\?\.\(this\.renderer\)/);
});
