import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FogSheets, FOG_CLEAR, clearingAt, lowRange, formationGround } from '../src/render/fog-sheets.js';
import { setExtremeGround, groundHeights } from '../src/render/extreme-surfaces.js';
import { mapLook, BASE_LOOK } from '../src/render/map-look.js';
import { maps, groundFor } from '../src/maps.js';

// A seeded stand-in for Math.random, so the runs repeat.
const seeded = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const fakeTexture = new THREE.Texture();

test('the clearing always keeps the old inner radii clear, whatever its lobes, grain and wake', () => {
 const random = seeded(3);
 for (const which of ['player', 'aim']) {
  const clear = FOG_CLEAR[which];
  for (let i = 0; i < 4000; i++) {
   const angle = random() * Math.PI * 2, d = random() * clear.inner;
   const trailAngle = random() * Math.PI * 2, trail = random() * clear.trail;
   const left = clearingAt(Math.cos(angle) * d, Math.sin(angle) * d, Math.cos(trailAngle) * trail, Math.sin(trailAngle) * trail,
    random() * 20, random() * 20, random(), clear);
   assert.equal(left, 0, `${which}: fog at ${d.toFixed(2)} m`);
  }
  // Far outside, the fog is untouched.
  assert.equal(clearingAt(clear.outer * 1.6 + 1, 0, 0, 0, 0, 0, 1, clear), 1);
 }
});

test('the clearing is not a circle: its edge wanders with direction and with time', () => {
 const clear = FOG_CLEAR.player, d = 4;
 const round = (p2, p3) => Array.from({ length: 36 }, (_, i) => clearingAt(Math.cos(i / 36 * Math.PI * 2) * d, Math.sin(i / 36 * Math.PI * 2) * d, 0, 0, p2, p3, .5, clear));
 const now = round(1.3, 4.1), later = round(1.3 + .21 * 8, 4.1 - .17 * 8);
 assert.ok(Math.max(...now) - Math.min(...now) > .4, `at ${d} m the fog should vary round the player (${Math.min(...now).toFixed(2)}..${Math.max(...now).toFixed(2)})`);
 assert.ok(now.some((v, i) => Math.abs(v - later[i]) > .2), 'the lobes should drift over a few seconds');
 // The grain moves the edge too (ragged, not one smooth curve).
 assert.notEqual(clearingAt(4, 0, 0, 0, 0, 0, .1, clear), clearingAt(4, 0, 0, 0, 0, 0, .9, clear));
});

test('a moving centre leaves a wake that closes in behind it', () => {
 const clear = FOG_CLEAR.player;
 // Walking east: the wake lies west of the player.
 const q = Math.PI / 2, behind = clearingAt(-4.5, 0, -4, 0, q, q, .5, clear), ahead = clearingAt(4.5, 0, -4, 0, q, q, .5, clear);
 assert.ok(behind < ahead - .3, `behind ${behind.toFixed(2)} should be clearer than ahead ${ahead.toFixed(2)}`);
 // And the sheets' own wake follows the player, then closes up when they stop.
 const sheets = new FogSheets({ fog: BASE_LOOK.fog, ground: groundFor(maps.deadwater), texture: fakeTexture, random: seeded(1) });
 const focus = new THREE.Vector3(), frame = { count: 3, interior: false, focus, halfWidth: 20, halfHeight: 11, dt: 1 / 60, elapsed: 0, player: { x: 0, z: 0, y: 0 }, aim: { x: 0, z: 0, y: 0 } };
 for (let i = 0; i < 90; i++) { frame.player.x = i * 7 / 60; frame.aim.x = frame.player.x + 3; frame.elapsed += frame.dt; sheets.update(frame); }
 const trail = sheets.clear.trail.value;
 assert.ok(trail.x < -1.5 && trail.x >= -FOG_CLEAR.player.trail - 1e-9, `the wake trails the runner (${trail.x.toFixed(2)})`);
 for (let i = 0; i < 180; i++) { frame.elapsed += frame.dt; sheets.update(frame); }
 assert.ok(Math.abs(sheets.clear.trail.value.x) < .1, 'stopped, the wake has closed in');
});

test('flat maps: the sheets ride with the camera as before, in Deadwater\'s own dust', () => {
 const look = mapLook(maps.deadwater);
 assert.deepEqual({ ...look.fog }, { colour: '#d0ba8e', highlight: '#e8d6ac', opacity: .27, lowBias: 0 });
 const sheets = new FogSheets({ fog: look.fog, ground: groundFor(maps.deadwater), heights: groundHeights(), texture: fakeTexture, random: seeded(2) });
 assert.equal(sheets.terrain, false);
 const focus = new THREE.Vector3(10, 0, -5), frame = { count: 3, interior: false, focus, halfWidth: 20, halfHeight: 11, dt: 1 / 60, elapsed: 1, player: { x: 10, z: -5, y: 0 }, aim: { x: 12, z: -5, y: 0 } };
 sheets.update(frame);
 const a = sheets.meshes[0].position.clone(), height = sheets.meshes[0].userData.drift.height;
 assert.ok(Math.abs(a.y - height) < 1e-9);
 focus.x += 6; frame.player.x += 6; sheets.update(frame);
 assert.ok(sheets.meshes[0].position.x - a.x > 5.9, 'a flat map\'s sheet moves with the camera');
 assert.ok(Math.abs(sheets.meshes[0].material.opacity - .27 * Math.sin(sheets.meshes[0].userData.drift.age / sheets.meshes[0].userData.drift.life * Math.PI) ** 2) < 1e-12);
 assert.equal(sheets.meshes[4].visible, false, 'past the preset\'s count, hidden');
});

test('terrain maps: a sheet keeps the world height it formed at, and forms over low ground with lowBias', () => {
 const map = maps['hill-test'], ground = groundFor(map), look = mapLook(map);
 setExtremeGround(ground);
 const heights = groundHeights();
 assert.ok(heights?.texture.value?.isDataTexture, 'the ground\'s height texture is made at load, on any preset');
 assert.equal(look.fog.colour, '#c4c7c3'); assert.equal(look.fog.highlight, '#d8dad7'); assert.equal(look.fog.lowBias, 1);
 const run = (lowBias, seed) => {
  const sheets = new FogSheets({ fog: { ...look.fog, lowBias }, ground, heights, texture: fakeTexture, random: seeded(seed) });
  assert.equal(sheets.terrain, true);
  // Walk from the plateau east down into the lower ground, then back.
  const focus = new THREE.Vector3(-8, ground.heightAt(-8, -8), -8), formed = [];
  const frame = { count: 5, interior: false, focus, halfWidth: 20, halfHeight: 11, dt: 1 / 20, elapsed: 0, player: { x: 0, z: 0, y: 0 }, aim: { x: 0, z: 0, y: 0 } };
  let lastDrift = sheets.meshes.map(m => m.userData.drift), kept = 0;
  for (let i = 0; i < 20 * 240; i++) {
   const t = i / 20;
   focus.x = -8 + 30 * Math.sin(t * .05); focus.z = -8 + 20 * Math.sin(t * .031); focus.y = ground.heightAt(focus.x, focus.z);
   frame.player.x = focus.x; frame.player.z = focus.z; frame.player.y = focus.y; frame.aim.x = focus.x + 2; frame.aim.z = focus.z; frame.aim.y = focus.y;
   frame.elapsed = t;
   const before = sheets.meshes.map(m => ({ drift: m.userData.drift, x: m.position.x, y: m.position.y, z: m.position.z, opacity: m.material.opacity }));
   sheets.update(frame);
   for (const [k, mesh] of sheets.meshes.entries()) {
    const drift = mesh.userData.drift;
    assert.equal(drift.world, true);
    if (drift === before[k].drift && i > 0) { assert.equal(mesh.position.y, before[k].y, 'a sheet never changes height'); kept++; }
    else {
     // Formed again: over the ground where it is half way through its life,
     // plus its own height, and from nothing (no pop).
     formed.push(drift.y - drift.height);
     const mx = drift.ox + drift.vx * drift.life * .5, mz = drift.oz + drift.vz * drift.life * .5;
     assert.ok(Math.abs(drift.y - drift.height - formationGround(ground, mx, mz, mesh.scale.x, mesh.scale.z)) < 1e-9);
     assert.ok(drift.y - drift.height >= ground.heightAt(mx, mz) - 1e-9, 'never below the ground under its middle');
     if (i > 0) assert.ok(mesh.material.opacity < .01, `a new sheet fades in (${mesh.material.opacity})`);
     if (i > 0) assert.ok(before[k].opacity < .06 || Math.abs(before[k].x - focus.x) > frame.halfWidth || Math.abs(before[k].z - focus.z) > frame.halfHeight,
      'an old sheet goes only when faded or off screen');
    }
   }
   lastDrift = sheets.meshes.map(m => m.userData.drift);
  }
  assert.ok(kept > 1000 && lastDrift.length === 5);
  return formed.reduce((a, b) => a + b, 0) / formed.length;
 };
 const plain = (run(0, 5) + run(0, 6)) / 2, low = (run(1, 5) + run(1, 6)) / 2;
 assert.ok(low < plain - .15, `lowBias forms sheets over lower ground (${low.toFixed(2)} vs ${plain.toFixed(2)})`);
 const range = lowRange(ground);
 assert.ok(range.lo < range.hi && range.lo < 0, `hill-test's low ground is its hollow (${range.lo}..${range.hi})`);
 setExtremeGround(null);
});

test('the sheets\' shader: an uneven clearing everywhere, the air fade only on terrain maps, each warmed as one program', () => {
 const compiled = sheets => {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
  const material = sheets.meshes[0].material;
  material.onBeforeCompile(shader);
  return { shader, key: material.customProgramCacheKey(), defines: material.defines || {} };
 };
 const flat = compiled(new FogSheets({ fog: BASE_LOOK.fog, ground: groundFor(maps.deadwater), texture: fakeTexture }));
 assert.ok(!/smoothstep\(2\.2, ?5\.5, ?distance/.test(flat.shader.fragmentShader), 'no perfect circle');
 assert.match(flat.shader.fragmentShader, /fogClear\(onPlayer - clearPlayer/);
 assert.ok(!('FOG_GROUND' in flat.defines) && !flat.shader.uniforms.fogGround, 'a flat map reads no height texture');
 const ground = groundFor(maps['hill-test']); setExtremeGround(ground);
 const hills = compiled(new FogSheets({ fog: mapLook(maps['hill-test']).fog, ground, heights: groundHeights(), texture: fakeTexture }));
 assert.ok('FOG_GROUND' in hills.defines);
 assert.match(hills.shader.fragmentShader, /float air = vFogWorld\.y - under;/);
 assert.equal(hills.shader.uniforms.fogGround.value, groundHeights().texture.value, 'shares Extreme\'s height texture');
 assert.notEqual(hills.key, flat.key);
 // Every sheet shares one program.
 const sheets = new FogSheets({ fog: BASE_LOOK.fog, ground: groundFor(maps.deadwater), texture: fakeTexture });
 assert.equal(new Set(sheets.meshes.map(m => m.material.customProgramCacheKey())).size, 1);
 setExtremeGround(null);
});
