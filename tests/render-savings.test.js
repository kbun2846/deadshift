// The render savings that must keep the picture exactly as it was: the shader
// patches (shadow early-out, dark effects light skipped) and the colour bake
// that merges held weapons and roofs into fewer draws.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ORIGINAL_CHUNKS, PATCHED_CHUNKS, patchShadowChunk, patchLightsChunk } from '../src/shader-savings.js';
import { bakeColors } from '../src/bake-colors.js';
import { makeRifle } from '../src/rifle-model.js';
import { makeShotgun } from '../src/shotgun-model.js';

test('the shader patches apply to this three.js and are installed', () => {
  for (const chunk of ['shadowmap_pars_fragment', 'lights_fragment_begin']) {
    assert.ok(ORIGINAL_CHUNKS[chunk], `${chunk}: three's own version kept`);
    assert.equal(THREE.ShaderChunk[chunk], PATCHED_CHUNKS[chunk], `${chunk}: patched version installed`);
  }
  assert.equal(patchShadowChunk('not three'), null);
  assert.equal(patchLightsChunk('not three'), null);
});

test('shadow early-out keeps every tap of both filters for the edge case', () => {
  const taps = source => (source.match(/texture2DCompare\( shadowMap/g) || []).length;
  const original = ORIGINAL_CHUNKS.shadowmap_pars_fragment, patched = PATCHED_CHUNKS.shadowmap_pars_fragment;
  // PCF: 17 taps, 5 of them probes reused. PCF soft: 16 fetches, 8 probes reused.
  assert.equal(taps(patched), taps(original));
  assert.match(patched, /probe == 0\.0 \|\| probe == 5\.0/);
  assert.match(patched, /probe == 0\.0 \|\| probe == 8\.0/);
  assert.match(patched, /\( 1\.0 \/ 17\.0 \)/);
  assert.match(patched, /\( 1\.0 \/ 9\.0 \)/);
});

test('the effects light is skipped only while it is dark', () => {
  const patched = PATCHED_CHUNKS.lights_fragment_begin;
  assert.match(patched, /if \( pointLight\.color\.r \+ pointLight\.color\.g \+ pointLight\.color\.b > 0\.0 \) \{/);
  // The loop stays unrollable: three matches its body up to the closing brace
  // followed by the unroll_loop_end pragma.
  assert.match(patched, /for \( int i = 0; i < NUM_POINT_LIGHTS; i \+\+ \) \{[\s\S]+?\}\s+#pragma unroll_loop_end/);
});

const colours = mesh => {
  const c = mesh.geometry.attributes.color, seen = new Set();
  for (let i = 0; i < c.count; i++) seen.add([c.getX(i), c.getY(i), c.getZ(i)].map(v => v.toFixed(4)).join());
  return seen;
};

test('bakeColors merges plain parts into one draw with their colours per vertex', () => {
  const group = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: '#ff0000' }), blue = new THREE.MeshLambertMaterial({ color: '#0000ff' });
  const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), red); a.position.x = 2;
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), blue);
  const moving = new THREE.Group(); moving.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), red));
  group.add(a, b, moving);
  const merged = bakeColors(group);
  assert.equal(group.children.length, 2, 'the merged mesh and the moving part');
  assert.ok(group.children.includes(moving));
  assert.equal(merged.material.vertexColors, true);
  assert.equal(merged.material.color.getHexString(), 'ffffff');
  assert.equal(colours(merged).size, 2);
  merged.geometry.computeBoundingBox();
  assert.equal(merged.geometry.boundingBox.max.x, 2.5, 'part positions baked in');
});

test('held weapons draw once per rigid part', () => {
  let rifleDraws = 0; makeRifle(3).traverse(o => { if (o.isMesh) rifleDraws++; });
  assert.equal(rifleDraws, 1);
  const shotgun = makeShotgun(2);
  let shotgunDraws = 0; shotgun.traverse(o => { if (o.isMesh) shotgunDraws++; });
  assert.equal(shotgunDraws, 4, 'body, barrels, two shells');
  // The parts that move are still their own objects.
  assert.ok(shotgun.userData.barrels.isGroup);
  assert.equal(shotgun.userData.shells.length, 2);
  for (const shell of shotgun.userData.shells) assert.equal(shell.children.filter(c => c.isMesh).length, 1);
});

// Multiplayer: another player's Static stream used to hang off your own gun
// (a white bolt from your muzzle to their stream), because its arcs kept a
// reference to the muzzle point that was borrowed for their event and put back.
test("another player's stream arcs start at their gun and stay there", async () => {
  const { WorldView } = await import('../src/renderer.js');
  const view = Object.create(WorldView.prototype);
  const arcs = [], light = { color: { set() {} }, position: new THREE.Vector3() };
  Object.assign(view, {
    staticMuzzle: new THREE.Vector3(1, .76, 2), lastSim: { player: { x: 0, z: 0, aimX: 0, aimZ: 1 }, colliders: [] },
    electric: { event: e => arcs.push(...e.paths), aftershock() {} }, fx: { electric() {}, glow() {} }, fxLight: light, fxLightLevel: 0,
    muzzleLight() {},
  });
  const shooter = { x: 10, z: 10, aimX: 1, aimZ: 0 };
  view.netEvent({ type: 'sprayArc', firing: true, paths: [{ b: { x: 13, z: 10 }, energy: 1 }] }, shooter, 2);
  assert.equal(arcs.length, 1);
  assert.notEqual(arcs[0].a, view.staticMuzzle, 'not your muzzle');
  assert.deepEqual([arcs[0].a.x, arcs[0].a.z], [10.95, 9.75], "their muzzle");
  assert.deepEqual(view.staticMuzzle.toArray(), [1, .76, 2], 'yours untouched');
  // Your own stream still follows your live gun.
  view.event({ type: 'sprayArc', firing: false, paths: [{ b: { x: 3, z: 3 }, energy: 1 }] });
  assert.equal(arcs[1].a, view.staticMuzzle);
});
