// Crisp output for the phone and laptop tiers (Performance, Balanced).
//
// Those tiers draw the world below the screen's resolution to stay fast, and
// the browser used to stretch that small image up to the screen with a plain
// bilinear filter: everything soft, and thin lines (plank seams, fence rails,
// tracers, the cone's edge) stair-stepped and crawling, because Performance
// had no antialiasing at all.
//
// Now the world is drawn into an off-screen buffer at the same internal size
// as before (so the expensive part costs what it did), and one cheap pass
// writes it to the screen at a higher output resolution:
//   - FXAA-lite (Performance): smooths stair-stepped edges along their
//     direction, using the luma of the four neighbours.
//   - Balanced keeps real 4x multisampling, now on the off-screen buffer (the
//     screen itself no longer needs it), so its pass does not blur.
//   - Contrast-limited sharpening, scaled by how far the image is stretched
//     (none at 1:1), clamped to the neighbourhood so it never rings or halos.
// The pass is a single triangle, at most ~9 texture reads per output pixel,
// on an output capped at `maxOutput` pixels: well under a millisecond on the
// phones the tiers are for, against the scene's many draws.
//
// Tone mapping and sRGB are still applied by the scene's own shaders (the
// buffer is flagged like Extreme's composer buffers), so colours are exactly
// what drawing straight to the screen gave; the pass copies them unchanged.
import * as THREE from 'three';

export const CRISP = Object.freeze({
 performance: { output: 1.5, maxOutput: 1800000, fxaa: true, sharpen: .38, samples: 0 },
 balanced: { output: 2, maxOutput: 3200000, fxaa: false, sharpen: .26, samples: 4 },
});

const vertexShader = `varying vec2 vUv;
void main(){ vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }`;

const fragmentShader = `
uniform sampler2D map; uniform vec2 texel; uniform float sharpen; uniform float fxaa; uniform vec2 area; uniform vec2 areaMax;
varying vec2 vUv;
float luma(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
// The world fills the corner "area" of the buffer (all of it at full
// resolution); reads stay inside it, as the buffer's own edge clamp did.
vec3 tex(vec2 uv){ return texture2D(map, min(uv, areaMax)).rgb; }
void main(){
 vec2 uv = vUv * area;
 vec3 c = tex(uv);
 vec3 n = tex(uv + vec2(0., texel.y)), s = tex(uv - vec2(0., texel.y));
 vec3 e = tex(uv + vec2(texel.x, 0.)), w = tex(uv - vec2(texel.x, 0.));
 vec3 lo = min(c, min(min(n, s), min(e, w))), hi = max(c, max(max(n, s), max(e, w)));
 if (fxaa > .5) {
  float lN = luma(n), lS = luma(s), lE = luma(e), lW = luma(w), lC = luma(c);
  float lMin = min(lC, min(min(lN, lS), min(lE, lW))), lMax = max(lC, max(max(lN, lS), max(lE, lW)));
  if (lMax - lMin > max(.04, lMax * .125)) {
   // Blur along the edge (across the gradient), as FXAA does.
   vec2 dir = vec2(-(lN - lS), lE - lW);
   float reduce = max((lN + lS + lE + lW) * .03125, 1. / 128.);
   dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), -4., 4.) * texel;
   vec3 a = .5 * (tex(uv - dir * (1. / 6.)) + tex(uv + dir * (1. / 6.)));
   vec3 b = a * .5 + .25 * (tex(uv - dir * .5) + tex(uv + dir * .5));
   float lB = luma(b);
   c = (lB < lMin || lB > lMax) ? a : b;
  }
 }
 vec3 sharp = c + (c - (n + s + e + w) * .25) * sharpen;
 gl_FragColor = vec4(clamp(sharp, lo, hi), 1.);
}`;

export class CrispOutput {
 constructor(renderer) {
  this.renderer = renderer; this.samples = -1; this.spec = null;
  this.material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, depthTest: false, depthWrite: false,
   uniforms: { map: { value: null }, texel: { value: new THREE.Vector2() }, sharpen: { value: 0 }, fxaa: { value: 0 }, area: { value: new THREE.Vector2(1, 1) }, areaMax: { value: new THREE.Vector2(1, 1) } } });
  this.scale = 1;
  const triangle = new THREE.BufferGeometry(); triangle.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  this.quad = new THREE.Mesh(triangle, this.material); this.quad.frustumCulled = false;
  this.scene = new THREE.Scene(); this.scene.add(this.quad); this.camera = new THREE.OrthographicCamera();
 }

 // Output (canvas) ratio for a w x h CSS window.
 outputRatio(spec, dpr, w, h) { return Math.min(dpr, spec.output, Math.sqrt(spec.maxOutput / Math.max(1, w * h))); }

 // The off-screen buffer for this tier at `internal` ratio (never above output).
 setSize(spec, w, h, internal, output) {
  if (this.samples !== spec.samples) { this.target?.dispose(); this.target = null; this.samples = spec.samples; }
  if (!this.target) {
   this.target = new THREE.WebGLRenderTarget(1, 1, { samples: spec.samples, depthBuffer: true, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
   // Drawn into exactly like the screen: flagged like Extreme's composer
   // buffers, the scene's shaders tone map and encode sRGB themselves. The
   // storage is plain RGBA8 (not an sRGB format, which would encode a second
   // time), so the bytes are what the screen would have got and the pass
   // copies them unchanged.
   this.target.isXRRenderTarget = true; this.target.texture.colorSpace = THREE.SRGBColorSpace; this.target.texture.internalFormat = 'RGBA8';
  }
  // The buffer is allocated at the tier's full internal size; adaptive
  // resolution then draws into a smaller corner of it (setScale) instead of
  // reallocating it (and, with multisampling, its sample buffers) mid-game,
  // which stalled the frame each time the scale stepped.
  const ratio = Math.min(internal, output), tw = Math.max(1, Math.round(w * ratio)), th = Math.max(1, Math.round(h * ratio));
  if (this.target.width !== tw || this.target.height !== th) this.target.setSize(tw, th);
  this.spec = spec; this.size = { w, h, ratio, output };
  const u = this.material.uniforms;
  u.map.value = this.target.texture; u.texel.value.set(1 / tw, 1 / th);
  u.fxaa.value = spec.fxaa ? 1 : 0;
  this.setScale(this.scale);
 }

 // Draw the world at `scale` of the full internal size (adaptive resolution).
 setScale(scale) {
  this.scale = scale;
  if (!this.target || !this.size) return;
  const { w, h, ratio, output } = this.size, tw = this.target.width, th = this.target.height;
  const aw = Math.max(1, Math.min(tw, Math.round(w * ratio * scale))), ah = Math.max(1, Math.min(th, Math.round(h * ratio * scale)));
  this.target.viewport.set(0, 0, aw, ah); this.target.scissor.set(0, 0, aw, ah);
  this.activeHeight = ah;
  const u = this.material.uniforms, stretch = output / (ratio * scale);
  u.area.value.set(aw / tw, ah / th); u.areaMax.value.set((aw - .5) / tw, (ah - .5) / th);
  // No sharpening at 1:1; full strength from 1.5x stretch up.
  u.sharpen.value = this.spec.sharpen * Math.max(0, Math.min(1, (stretch - 1) / .5));
 }

 get height() { return this.activeHeight || this.target?.height || 1; }

 render(scene, camera) {
  const r = this.renderer;
  r.setRenderTarget(this.target); r.render(scene, camera);
  // The pass adds to the frame's draw count instead of replacing it.
  const reset = r.info.autoReset; r.info.autoReset = false;
  r.setRenderTarget(null); r.render(this.scene, this.camera);
  r.info.autoReset = reset;
 }

 dispose() { this.target?.dispose(); this.target = null; this.material.dispose(); this.quad.geometry.dispose(); }
}
