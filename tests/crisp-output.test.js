import test from 'node:test';
import assert from 'node:assert/strict';
import { CrispOutput, CRISP, appleTouch, crispSpec } from '../src/render/crisp-output.js';

test('Balanced and Quality draw smaller and are upscaled (FSR 1-style) to the screen size', () => {
 const crisp = new CrispOutput({ info: {} });
 // An iPhone (3x, 390 x 844 CSS pixels) on Balanced: FXAA instead of multisampling, the screen at 2x.
 const apple = crispSpec('balanced', true);
 const out = crisp.outputRatio(apple, 3, 390, 844);
 assert.equal(out, 2);
 crisp.setSize(apple, 390, 844, .8, out);
 assert.deepEqual([crisp.target.width, crisp.target.height], [312, 675]);
 assert.equal(crisp.target.samples, 0);
 // FXAA at the world's size, then EASU into a screen-sized buffer, then RCAS.
 assert.deepEqual([crisp.aaTarget.width, crisp.aaTarget.height], [312, 675]);
 assert.deepEqual([crisp.upTarget.width, crisp.upTarget.height], [780, 1688]);
 assert.equal(crisp.easuMaterial.uniforms.map.value, crisp.aaTarget.texture);
 assert.ok(Math.abs(crisp.easuMaterial.uniforms.inScale.value.x - 312 / 780) < 1e-9);
 assert.ok(crisp.rcasMaterial.uniforms.sharpness.value > .6, 'stretched 2.5x: strong RCAS');
 // Adaptive resolution: a smaller corner is read, nothing reallocated.
 crisp.setScale(.7);
 assert.deepEqual([crisp.target.width, crisp.aaTarget.width], [312, 312]);
 assert.equal(crisp.easuMaterial.uniforms.inMax.value.x, Math.round(390 * .8 * .7) - 1);
 assert.equal(crisp.aaTarget.viewport.z, Math.round(390 * .8 * .7));
 crisp.setScale(1);
 // Performance keeps its one pass at its old size (three passes cost it more than they saved).
 crisp.setSize(CRISP.performance, 390, 844, .8, 1.5);
 assert.equal(crisp.upTarget, null); assert.equal(crisp.target.samples, 0);
 // Balanced and Quality: real multisampling off-screen, no FXAA pass.
 crisp.setSize(CRISP.balanced, 1280, 720, .82, 1);
 assert.equal(crisp.target.samples, 4); assert.equal(crisp.aaTarget, null);
 assert.equal(crisp.easuMaterial.uniforms.map.value, crisp.target.texture);
 crisp.setSize(CRISP.quality, 1600, 900, .77, 1);
 assert.equal(crisp.target.samples, 4); assert.deepEqual([crisp.target.width, crisp.upTarget.width], [1232, 1600]);
 // Potato keeps its one pass.
 crisp.setSize(CRISP.potato, 1280, 720, .55, 1);
 assert.equal(crisp.upTarget, null); assert.equal(crisp.material.uniforms.fxaa.value, 1);
 assert.ok(crisp.material.uniforms.sharpen.value > .3, 'stretched 1.8x: full sharpening');
 // The output is capped in pixels, so a huge screen never costs more than that.
 assert.ok(crisp.outputRatio(CRISP.balanced, 2, 2560, 1440) ** 2 * 2560 * 1440 <= CRISP.balanced.maxOutput + 1);
 // Colours: the buffer is drawn like the screen (tone mapped, sRGB bytes), stored as plain RGBA8.
 assert.equal(crisp.target.isXRRenderTarget, true); assert.equal(crisp.target.texture.internalFormat, 'RGBA8');
 assert.equal(crisp.materials().length, 4);
 crisp.dispose();
});

test('Extreme is not in the crisp chain: it keeps drawing straight to the screen', () => {
 assert.equal(CRISP.extreme, undefined);
 assert.equal(crispSpec('extreme', false), null);
});

test('iPhone and iPad: FXAA in place of a multisampled buffer', () => {
 assert.equal(appleTouch({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 }), true);
 // An iPad asks for desktop pages: a Mac with touch points.
 assert.equal(appleTouch({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 }), true);
 assert.equal(appleTouch({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 }), false);
 assert.equal(appleTouch({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv8l', maxTouchPoints: 5 }), false);
 for (const name of ['balanced', 'quality']) {
  const spec = crispSpec(name, true);
  assert.equal(spec.samples, 0); assert.equal(spec.fxaa, true); assert.equal(spec.upscale, 'fsr');
  assert.equal(crispSpec(name, false).samples, 4);
 }
 assert.equal(crispSpec('performance', true), CRISP.performance);
});
