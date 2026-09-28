// v0.990a merge: the scope's grey (render/scope-shading.js) is given at the
// warm-up to the world only (the scene's children before any staging), never
// to the warm rack's stand-ins or the staged deaths: those stand for
// materials play makes fresh or clips indoors later, and a hooked stand-in
// warmed a program nothing in play asked for (tools/program-check.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ScopeShading } from '../src/render/scope-shading.js';

test('scope shading: only the listed children are shaded; with no list, the whole root as before', () => {
 const root = new THREE.Group(), world = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial()), rack = new THREE.Group(), stand = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
 rack.add(stand); root.add(world, rack);
 const plainKey = stand.material.customProgramCacheKey();
 const shading = new ScopeShading();
 shading.apply(root, new Set([world]));
 assert.match(world.material.customProgramCacheKey(), /scope-world-gray/);
 assert.equal(stand.material.customProgramCacheKey(), plainKey, 'the stand-in keeps its plain key');
 new ScopeShading().apply(rack);
 assert.match(stand.material.customProgramCacheKey(), /scope-world-gray/);
});

test('the warm-up hands the scope shading the world as it stood before staging', async () => {
 const { readFileSync } = await import('node:fs');
 const src = readFileSync(new URL('../src/render/warm-up.js', import.meta.url), 'utf8');
 assert.match(src, /const world = new Set\(this\.scene\.children\)/);
 assert.match(src, /this\.scopeShading\.apply\(this\.scene, world\)/);
 assert.ok(src.indexOf('const world = new Set') < src.indexOf('new BloodDrops') || src.indexOf('const world = new Set') < src.indexOf('.ensure()'), 'taken before anything is staged');
});
