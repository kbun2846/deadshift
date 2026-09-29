// The kept sun shadow map (render/shadow-cache.js) and the matte lighting's
// closed form (render/matte-lighting.js): the parts that must hold for the
// picture to stay as it was.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShadowCache, SHADOW_CACHE } from '../src/render/shadow-cache.js';
import { lightBasis, settleShadowBox, shadowBoxOver, shadowFrame, SHADOW_FIT } from '../src/render/shadow-snap.js';
import { FLAT } from '../src/world/heightfield.js';
import { ORIGINAL_MATTE_CHUNKS, PATCHED_MATTE_CHUNKS, isMatte, setMatte } from '../src/render/matte-lighting.js';
import { PATCHED_CHUNKS } from '../src/render/shader-savings.js';

const SUN = { x: -24, y: 40, z: -18 };
const view = { height: 29, tilt: .62, fov: 40, aspect: 16 / 9, near: 2 };

function fakeView(size = 1280) {
  const frame = shadowFrame(SUN, view);
  const sun = new THREE.DirectionalLight(); sun.shadow.camera.up.set(frame.up.x, frame.up.y, frame.up.z);
  const v = { sun, sunOffset: SUN, sunBasis: frame.basis, quality: { shadows: size }, shadowBox: null,
    renderer: { shadowMap: { render() {} }, capabilities: { maxTextureSize: 8192 } } };
  v.fit = (x, z) => { v.shadowBox = settleShadowBox(v.shadowBox, shadowBoxOver(view, SUN, frame.basis, FLAT, x, 0, z)); };
  return v;
}
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

test('the kept region holds the view, at the same texel size, on a grid fixed to the world', () => {
  const v = fakeView(), cache = new ShadowCache(v); cache.active = true;
  v.fit(0, 7); cache.follow(0, 0, 7);
  const r = cache.region, box = v.shadowBox;
  assert.equal(r.tx, (box.right - box.left) / 1280);
  assert.equal(r.ty, (box.top - box.bottom) / 1280);
  // Whole texels from the world's origin across the light.
  assert.ok(Math.abs(r.a0 / r.tx - Math.round(r.a0 / r.tx)) < 1e-6 && Math.abs(r.b0 / r.ty - Math.round(r.b0 / r.ty)) < 1e-6);
  // At least the margin all round the view's box, and the map as big as the region.
  assert.ok(r.nx >= 1280 + 2 * Math.floor(SHADOW_CACHE.margin / r.tx) && r.ny >= 1280 + 2 * Math.floor(SHADOW_CACHE.margin / r.ty));
  assert.deepEqual([v.sun.shadow.mapSize.x, v.sun.shadow.mapSize.y], [r.nx, r.ny]);
  // The camera's box is the region, seen from the anchor.
  const cam = v.sun.shadow.camera, anchorA = dot(r.anchor, v.sunBasis.x);
  assert.ok(Math.abs(anchorA + cam.left - r.a0) < 1e-6 && Math.abs(cam.right - cam.left - r.nx * r.tx) < 1e-6);
  assert.ok(Math.abs(v.sun.shadow.bias + SHADOW_FIT.bias / (cam.far - cam.near)) < 1e-12);
});

test('walking within the margin keeps the region; past it the new one lands on the same texel grid', () => {
  const v = fakeView(), cache = new ShadowCache(v); cache.active = true;
  v.fit(0, 7); cache.follow(0, 0, 7); const first = cache.region; cache.rebuild = false;
  v.fit(1.5, 8); cache.follow(1.5, 0, 8);
  assert.equal(cache.region, first); assert.equal(cache.rebuild, false);
  v.fit(9, 7); cache.follow(9, 0, 7);
  const next = cache.region;
  assert.notEqual(next, first); assert.equal(cache.rebuild, true);
  const shift = (next.a0 - first.a0) / first.tx;
  assert.ok(Math.abs(shift - Math.round(shift)) < 1e-6, 'a whole number of texels');
});

test('a sphere lands on the texels under it', () => {
  const v = fakeView(), cache = new ShadowCache(v); cache.active = true;
  v.fit(0, 0); cache.follow(0, 0, 0);
  const r = cache.region, c = new THREE.Vector3(1, 1, 2);
  const [x, y, w, h] = cache.rectFor(new THREE.Sphere(c, .5));
  const a = (dot(c, v.sunBasis.x) - r.a0) / r.tx, b = (dot(c, v.sunBasis.y) - r.b0) / r.ty;
  assert.ok(x <= a - .5 / r.tx && x + w >= a + .5 / r.tx && y <= b - .5 / r.ty && y + h >= b + .5 / r.ty);
  assert.equal(cache.rectFor(new THREE.Sphere(new THREE.Vector3(500, 0, 500), 1)), null);
});

test('the renderer hands the sun to the kept region below Extreme only', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(src, /this\.shadowCache\?\.setEnabled\(q\.shadows > 0 && name !== 'extreme'\)/);
  assert.match(src, /if \(this\.shadowCache\?\.active\) this\.shadowCache\.follow\(fx, this\.focus\.y, fz\)/);
  assert.match(src, /setMatte\(m, name !== 'extreme'\)/);
});

test('the matte patches apply to this three.js and are installed', () => {
  for (const chunk of ['lights_physical_fragment', 'lights_physical_pars_fragment']) {
    assert.ok(ORIGINAL_MATTE_CHUNKS[chunk]); assert.equal(THREE.ShaderChunk[chunk], PATCHED_MATTE_CHUNKS[chunk]);
    // Unmarked materials compile three's own code: everything added is behind the defines.
    assert.ok(PATCHED_MATTE_CHUNKS[chunk].replace(/#ifdef MATTE_SURFACE[\s\S]*?#else\n([\s\S]*?)#endif/g, '$1').includes(ORIGINAL_MATTE_CHUNKS[chunk].trim().slice(0, 40)));
  }
});

// three's BRDF_GGX (lights_physical_pars_fragment), in JS.
const schlick = (f0, f90, vh) => { const f = 2 ** ((-5.55473 * vh - 6.98316) * vh); return f0 * (1 - f) + f90 * f; };
function ggx(alpha, nl, nv, nh, vh) {
  const a2 = alpha * alpha, V = .5 / Math.max(nl * Math.sqrt(a2 + (1 - a2) * nv * nv) + nv * Math.sqrt(a2 + (1 - a2) * nl * nl), 1e-6);
  const D = a2 / (Math.PI * (nh * nh * (a2 - 1) + 1) ** 2);
  return schlick(.04, 1, vh) * V * D;
}
test('at roughness 1 the matte highlight is three\'s GGX', () => {
  for (let i = 0; i < 200; i++) {
    const nl = Math.random(), nv = Math.random(), nh = Math.random(), vh = Math.random();
    const matte = schlick(.04, 1, vh) * (.5 / Math.max(nl + nv, 1e-6) / Math.PI);
    assert.ok(Math.abs(matte - ggx(1, nl, nv, nh, vh)) < 1e-9);
  }
});

test('only rough, non-metal, unmapped standard materials are marked, and never on Extreme', () => {
  const plain = new THREE.MeshStandardMaterial({ roughness: 1 });
  assert.ok(isMatte(plain));
  for (const m of [new THREE.MeshStandardMaterial({ roughness: .88 }), new THREE.MeshStandardMaterial({ roughness: 1, metalness: .2 }),
    new THREE.MeshPhysicalMaterial({ roughness: 1 }), new THREE.MeshLambertMaterial()]) assert.equal(isMatte(m), false);
  assert.equal(setMatte(plain, true), true); assert.ok('MATTE_SURFACE' in plain.defines && 'NO_ENV_SPECULAR' in plain.defines);
  assert.equal(setMatte(plain, true), false);
  assert.equal(setMatte(plain, false), true); assert.ok(!('MATTE_SURFACE' in plain.defines) && !('NO_ENV_SPECULAR' in plain.defines));
  const roof = setMatte(new THREE.MeshStandardMaterial({ roughness: .88 }), true);
  assert.equal(roof, true, 'a roof keeps its highlight but skips the dead env term');
  assert.equal(setMatte(new THREE.MeshLambertMaterial(), true), false);
});

test('the sun\'s shadow is not looked up where the sun cannot reach', () => {
  assert.match(PATCHED_CHUNKS.lights_fragment_begin, /receiveShadow && dot\( geometryNormal, directLight\.direction \) > 0\.0 \) \? getShadow\( directionalShadowMap/);
});
