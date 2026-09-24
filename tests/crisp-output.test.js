import test from 'node:test';
import assert from 'node:assert/strict';
import { CrispOutput, CRISP } from '../src/render/crisp-output.js';

test('Performance and Balanced draw at their internal size and write a larger, smoothed and sharpened picture', () => {
 const crisp = new CrispOutput({ info: {} });
 // A 3x phone, 390 x 844 CSS pixels: Performance's world stays under 1x, the screen gets 1.5x.
 const out = crisp.outputRatio(CRISP.performance, 3, 390, 844);
 assert.equal(out, 1.5);
 crisp.setSize(CRISP.performance, 390, 844, .94, out);
 assert.deepEqual([crisp.target.width, crisp.target.height], [367, 793]);
 assert.equal(crisp.target.samples, 0); assert.equal(crisp.material.uniforms.fxaa.value, 1);
 assert.ok(crisp.material.uniforms.sharpen.value > .3, 'stretched 1.6x: full sharpening');
 // Balanced: real multisampling off-screen, no FXAA; at 1:1 nothing is sharpened.
 crisp.setSize(CRISP.balanced, 1280, 720, 1, 1);
 assert.equal(crisp.target.samples, 4); assert.equal(crisp.material.uniforms.fxaa.value, 0);
 assert.equal(crisp.material.uniforms.sharpen.value, 0);
 // The output is capped in pixels, so a huge screen never costs more than that.
 assert.ok(crisp.outputRatio(CRISP.balanced, 2, 2560, 1440) ** 2 * 2560 * 1440 <= CRISP.balanced.maxOutput + 1);
 // Colours: the buffer is drawn like the screen (tone mapped, sRGB bytes), stored as plain RGBA8.
 assert.equal(crisp.target.isXRRenderTarget, true); assert.equal(crisp.target.texture.internalFormat, 'RGBA8');
 crisp.dispose();
});
