// Extreme's finishing passes, run after the scene is drawn. Loaded only when
// Extreme is chosen, so no other preset downloads or compiles any of it.
//
//  1. Ambient occlusion (GTAO): soft contact darkening where things meet the
//     ground and each other: crate bases, wall feet, under the boardwalk
//     eaves. The biggest single step up in how solid the world reads.
//  2. Bloom: only genuinely bright light spills: Static's orbs and arcs,
//     tracers, pellets, sparks. Sunlit surfaces stay under the threshold.
//  3. Grade and output, in one pass: a gentle warm/cool split between light
//     and shade and a touch more midtone depth, then the sRGB conversion.
//
// The scene itself is tone mapped exactly as on every other preset, per
// material, while it is drawn (the target is flagged as an output target),
// so effects built to skip tone mapping keep their exact colours: the
// orange of a blast stays orange. Tone mapping the finished frame instead
// washed bright effects out towards white.
//
// The AO draws the scene's depth and normals again at its own half
// resolution. (Reusing the main pass's depth and rebuilding normals from it
// was tried: it saves that draw but the occlusion goes lopsided and greys the
// screen edges.) Things that are not solid (glows, particles, decals, lines,
// faded roofs, birds) are hidden for that draw, so they neither cast
// occlusion nor get outlined by it.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export const EXTREME_POST = Object.freeze({
 // AO runs at this share of the screen resolution and is blurred back up;
 // at 0.5 it costs a quarter of full resolution and looks the same from
 // this camera height.
 aoScale: .5,
 // When the device cannot keep up even at the lowest render scale (setLight).
 strainedAoScale: .38, strainedDenoiseSamples: 5,
 ao: { radius: 1.6, distanceExponent: 1.2, thickness: 2.5, scale: 1.2, samples: 12 },
 aoIntensity: .9,
 // Indoors, with the roof lifted, the walls close in on every side and full
 // occlusion turns the room's warm light grey; it eases down to this.
 aoIndoor: .4,
 denoise: { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 },
 // After tone mapping, sunlit surfaces top out around 0.8 in brightness;
 // near-white effects sit at 0.9 to 1, so the threshold falls between them.
 bloom: { strength: .6, radius: .45, threshold: .86, cap: .8 },
 grade: { warmth: .05, shade: .025, contrast: .05, saturation: 1.05 },
});

const GradeShader = {
 name: 'DeadshiftGradeOutput',
 uniforms: { tDiffuse: { value: null }, warmth: { value: 0 }, shade: { value: 0 }, contrast: { value: 0 }, saturation: { value: 1 } },
 vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
 fragmentShader: `
  uniform sampler2D tDiffuse; uniform float warmth, shade, contrast, saturation; varying vec2 vUv;
  void main(){
   vec4 c = texture2D(tDiffuse, vUv);
   float l = dot(c.rgb, vec3(.2126, .7152, .0722));
   // Warm the light, cool the shade a little: sunlit adobe and blue-grey shadow.
   float lit = smoothstep(.15, .9, l);
   c.rgb *= mix(vec3(1.0 - shade * .6, 1.0 - shade * .15, 1.0 + shade), vec3(1.0 + warmth, 1.0 + warmth * .45, 1.0 - warmth * .5), lit);
   // Gentle S-curve on luminance (HDR-safe: only reshapes up to ~1).
   float k = clamp(l, 0.0, 1.0), curved = k + contrast * k * (1.0 - k) * (k - .5) * 4.0;
   c.rgb *= l > 1e-4 ? mix(1.0, curved / max(k, 1e-4), step(l, 1.0)) : 1.0;
   float g = dot(c.rgb, vec3(.2126, .7152, .0722));
   c.rgb = clamp(mix(vec3(g), c.rgb, saturation), 0.0, 1.0);
   // Linear to sRGB for the screen.
   c.rgb = mix(c.rgb * 12.92, 1.055 * pow(c.rgb, vec3(1.0 / 2.4)) - .055, step(vec3(.0031308), c.rgb));
   gl_FragColor = c;
  }`,
};

class SceneAOPass extends GTAOPass {
 constructor(scene, camera, width, height, excluded) { super(scene, camera, width, height); this.excluded = excluded; }
 // The stock version walks the whole scene every frame looking for lines and
 // points; the view already knows what to leave out.
 _overrideVisibility() {
  const cache = this._visibilityCache;
  for (const o of this.excluded()) if (o && o.visible) { o.visible = false; cache.push(o); }
 }
 _restoreVisibility() {
  for (const o of this._visibilityCache) o.visible = true;
  this._visibilityCache.length = 0;
 }
}

export class ExtremePost {
 constructor(renderer, scene, camera, { excluded }) {
  this.renderer = renderer;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // Multisampled HDR target: the composer bypasses the canvas's own
  // antialiasing, so edges would otherwise come out jagged on Extreme only.
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  // three tone maps only when drawing to an output target; this makes it
  // treat the first buffer as one, while keeping it linear (see top).
  target.isXRRenderTarget = true; target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  this.composer = new EffectComposer(renderer, target);
  // The composer ping-pongs between this target and a clone of it, and the
  // scene can land in either; the flag is not copied by clone().
  for (const t of [this.composer.renderTarget1, this.composer.renderTarget2]) {
   t.isXRRenderTarget = true; t.texture.colorSpace = THREE.LinearSRGBColorSpace;
  }
  // The scene is always drawn into the second buffer (the passes swap twice a
  // frame), so only that one needs multisampling; the first only ever gets
  // full-screen passes. Saves a multisampled HDR buffer the size of the screen.
  this.composer.renderTarget1.samples = 0;
  this.composer.setPixelRatio(1);
  this.composer.addPass(new RenderPass(scene, camera));
  const s = EXTREME_POST;
  this.ao = new SceneAOPass(scene, camera, Math.max(1, Math.round(size.x * s.aoScale)), Math.max(1, Math.round(size.y * s.aoScale)), excluded);
  // GTAO's depth texture has no size until its target is first drawn into,
  // but the shader warm-up samples it before that: WebGL then rejected a
  // zero-sized allocation (GL_INVALID_VALUE). Give it the target's size now.
  const depth = this.ao.depthTexture, gbuffer = this.ao.normalRenderTarget;
  if (depth && gbuffer && !(depth.image?.width > 0)) depth.image = { width: gbuffer.width, height: gbuffer.height, depth: 1 };
  this.ao.updateGtaoMaterial(s.ao); this.ao.updatePdMaterial(s.denoise); this.ao.blendIntensity = s.aoIntensity;
  this.composer.addPass(this.ao);
  this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), s.bloom.strength, s.bloom.radius, s.bloom.threshold);
  // Only the light above the threshold spills, and never more than a cap:
  // the Static stream stacks dozens of additive layers, and passing all of
  // that through turned a bright beam into a white-out.
  const high = this.bloom.materialHighPassFilter;
  high.fragmentShader = high.fragmentShader.replace('gl_FragColor = mix( outputColor, texel, alpha );',
   'vec3 over = texel.rgb * (max(v - luminosityThreshold, 0.0) / max(v, 1e-4)); gl_FragColor = vec4(min(over, vec3(' + s.bloom.cap.toFixed(2) + ')) * alpha, 1.0);');
  high.needsUpdate = true;
  this.composer.addPass(this.bloom);
  this.grade = new ShaderPass(GradeShader);
  for (const [k, v] of Object.entries(s.grade)) this.grade.uniforms[k].value = v;
  this.composer.addPass(this.grade);
  this.size = size.clone(); this.aoScale = s.aoScale; this.bloomDivisor = 2; this.light = false;
 }

 // Strained (adaptive resolution is at its floor and still short): the AO
 // runs at a smaller share with a lighter blur, and bloom a size down. Both
 // are soft effects, so the look barely moves while the frame gets cheaper.
 // Lifted again once the frame rate recovers.
 setLight(on) {
  if (this.light === on) return;
  this.light = on; this.aoScale = on ? EXTREME_POST.strainedAoScale : EXTREME_POST.aoScale; this.bloomDivisor = on ? 3 : 2;
  this.ao.updatePdMaterial({ ...EXTREME_POST.denoise, samples: on ? EXTREME_POST.strainedDenoiseSamples : EXTREME_POST.denoise.samples });
  this.size.set(0, 0); // re-size everything on the next frame
 }

 // Follows the canvas's drawing buffer (which already includes the preset's
 // pixel ratio and any adaptive scaling).
 sync() {
  const size = this.renderer.getDrawingBufferSize(this.bufferSize ||= new THREE.Vector2());
  if (size.equals(this.size)) return;
  this.size.copy(size);
  this.composer.setSize(size.x, size.y);
  // The composer resizes every pass to full size; AO wants its own share.
  this.ao.setSize(Math.max(1, Math.round(size.x * this.aoScale)), Math.max(1, Math.round(size.y * this.aoScale)));
  this.bloom.setSize(size.x / this.bloomDivisor, size.y / this.bloomDivisor); // it halves again inside: bloom at a quarter
 }

 // 0 outdoors, 1 with a roof fully lifted.
 setIndoor(amount) { this.ao.blendIntensity = EXTREME_POST.aoIntensity + (EXTREME_POST.aoIndoor - EXTREME_POST.aoIntensity) * amount; }

 render() { this.sync(); this.composer.render(); }

 dispose() {
  for (const pass of this.composer.passes) pass.dispose?.();
  this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose();
 }
}
