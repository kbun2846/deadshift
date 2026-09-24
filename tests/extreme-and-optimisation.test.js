import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { freezeTransforms } from '../src/render/frozen-transforms.js';
import { setExtremeSurfaces } from '../src/render/extreme-surfaces.js';
import { GRAPHICS } from '../src/settings.js';
import { RIFLE_QUALITY } from '../src/weapons/rifle-quality.js';
import { ARC_DETAIL } from '../src/effects/electric-effects.js';

test('a frozen root is computed once and then skipped, until it moves or grows', () => {
 const scene = new THREE.Scene(); scene.matrixAutoUpdate = false;
 const root = new THREE.Group(), child = new THREE.Mesh(); child.position.set(1, 2, 3);
 root.add(child); scene.add(root);
 freezeTransforms(root);
 assert.deepEqual(child.matrixWorld.elements.slice(12, 15), [1, 2, 3]);
 // Moving a child of a frozen static root does nothing: it is meant to be still.
 child.position.x = 9; scene.updateMatrixWorld();
 assert.equal(child.matrixWorld.elements[12], 1);
 // A child added later is placed on the next frame.
 const late = new THREE.Mesh(); late.position.z = 4; root.add(late); scene.updateMatrixWorld();
 assert.equal(late.matrixWorld.elements[14], 4);
});

test('a movable frozen group carries its children only on the frames it moves', () => {
 const scene = new THREE.Scene(); scene.matrixAutoUpdate = false;
 const prop = new THREE.Group(), part = new THREE.Mesh(); part.position.y = 1; prop.add(part); scene.add(prop);
 prop.position.x = 5; freezeTransforms(prop, { movable: true });
 assert.equal(part.matrixWorld.elements[12], 5);
 prop.rotation.z = .5; scene.updateMatrixWorld();
 assert.equal(part.matrixWorld.elements[1], 0, 'not moved until updateMatrix()');
 prop.updateMatrix(); scene.updateMatrixWorld();
 assert.ok(Math.abs(part.matrixWorld.elements[1] - Math.sin(.5)) < 1e-6);
});

test('Extreme surface detail compiles in only while Extreme is on, and ground and surfaces never share a program', () => {
 const ground = new THREE.MeshStandardMaterial(), surface = new THREE.MeshStandardMaterial();
 setExtremeSurfaces({ ground: [ground], surfaces: [surface] }, true);
 assert.ok('EXTREME_SURFACE' in ground.defines && 'EXTREME_SURFACE' in surface.defines);
 assert.notEqual(ground.customProgramCacheKey(), surface.customProgramCacheKey());
 const shader = { vertexShader: '#include <begin_vertex>', fragmentShader: 'void main(){\n#include <map_fragment>\n}', uniforms: {} };
 ground.onBeforeCompile(shader);
 assert.match(shader.fragmentShader, /exNoise/);
 setExtremeSurfaces({ ground: [ground], surfaces: [surface] }, false);
 assert.ok(!('EXTREME_SURFACE' in ground.defines));
 const plain = { vertexShader: '#include <begin_vertex>', fragmentShader: '#include <map_fragment>', uniforms: {} };
 ground.onBeforeCompile(plain);
 assert.equal(plain.fragmentShader, '#include <map_fragment>', 'other presets run the untouched shader');
});

test('Extreme builds on Quality: never less of anything, more of the things that show', () => {
 const q = GRAPHICS.quality, x = GRAPHICS.extreme;
 for (const key of ['shadows', 'texture', 'effects', 'particleCap', 'motes', 'anisotropy', 'maxPixels']) assert.ok(x[key] >= q[key], key);
 assert.ok(x.shadows > q.shadows && x.texture > q.texture);
 for (const key of ['radialSegments', 'sparks', 'smoke', 'impact']) assert.ok(RIFLE_QUALITY.extreme[key] > RIFLE_QUALITY.quality[key], key);
 assert.ok(RIFLE_QUALITY.extreme.trailLength > .3);
 for (const key of ['scatter', 'forks', 'strays']) assert.ok(ARC_DETAIL.extreme[key] > ARC_DETAIL.quality[key], key);
 // Performance now affords a finer shadow map and ground texture than it did.
 assert.ok(GRAPHICS.performance.shadows >= 768 && GRAPHICS.performance.texture >= 256);
});
