// Crisp output: the world drawn off-screen, then written to the screen by a
// short chain of full-screen passes (Potato, Performance, Balanced, Quality).
//
// Those tiers draw the world below the screen's resolution to stay fast, and
// the browser used to stretch that small image up to the screen with a plain
// bilinear filter: everything soft, and thin lines (plank seams, fence rails,
// tracers, the cone's edge) stair-stepped and crawling, because Performance
// had no antialiasing at all.
//
// Potato: one cheap pass (`simple`): FXAA-lite, a bilinear stretch and
// contrast-limited sharpening scaled by the stretch, clamped to the
// neighbourhood so it never rings or halos.
//
// Performance, Balanced and Quality (v0.999a, owner: "double FPS ... looks
// mostly similar when I load in", no blurriness): the world is drawn smaller
// than before (settings.js GRAPHICS `scale`), about three quarters of the old
// width and height, and brought back up to the old screen resolution by an
// FSR 1-style upscale (AMD FidelityFX Super Resolution 1, reimplemented):
//   1. antialiasing at the world's own size: 4x multisampling in the buffer
//      (Balanced, Quality) or FXAA 3.11 with an edge-end search (Performance,
//      and every tier on an iPhone/iPad, see `appleTouch`), so the upscale is
//      fed clean edges (upscaling stair steps only makes bigger ones);
//   2. EASU: edge-adaptive upscale. Twelve texels round each output pixel; the
//      local edge direction and strength shape a Lanczos-like kernel, long
//      along an edge and narrow across it, so edges stay sharp and straight
//      instead of going soft (bilinear) or blocky (nearest). The result is
//      clamped to the four nearest texels, so it cannot ring;
//   3. RCAS: contrast-adaptive sharpening at the screen's resolution, limited
//      per pixel so it never pushes past its neighbours (no halos) and eased
//      where the picture is noisy (no fizzing grain).
// The passes read texels directly (texelFetch), so the result does not depend
// on filtering, and everything stays inside the drawn corner (adaptive
// resolution, setScale).
//
// Temporal upscaling was not used: it needs a motion vector for every pixel,
// and most of what moves here (instanced sparks and smoke, arcs, tracers, fog
// sheets with a moving clearing, fading roofs, the camera's pixel snap) has
// none, so it would ghost and smear exactly where the fight is.
//
// Tone mapping and sRGB are still applied by the scene's own shaders (the
// buffer is flagged like Extreme's composer buffers), so colours are exactly
// what drawing straight to the screen gave; the passes work on those sRGB
// bytes (the space FSR is designed for) and write them out as they are.
import * as THREE from 'three';

// output/maxOutput: the screen's ratio to CSS pixels and its pixel cap (the
// world's own size is GRAPHICS pixelRatio x scale, capped by maxPixels).
// upscale 'fsr': the three-step chain above, 'simple': Potato's one pass.
// fxaa: antialiasing pass (no multisampling); samples: multisampling in the buffer.
// rcas: RCAS strength in stops (0 sharpest; +1 halves it). sharpen: `simple`'s.
export const CRISP = Object.freeze({
 // Potato (v0.999a, owner: "make potato mode look better without sacrificing
 // the cheap performance"): its half-size frame was stretched by the browser,
 // soft and stair-stepped; now the same frame goes through the same one pass,
 // at the screen's own size (no higher: it is the one cost added).
 potato: { output: 1, maxOutput: 1300000, upscale: 'simple', fxaa: true, sharpen: .42, samples: 0 },
 // Performance (phones) keeps its one pass at its old size: three passes cost
 // it more than the smaller world saved (measured, v0.999a).
 performance: { output: 1.5, maxOutput: 1800000, upscale: 'simple', fxaa: true, sharpen: .38, samples: 0 },
 balanced: { output: 2, maxOutput: 3200000, upscale: 'fsr', fxaa: false, rcas: .3, samples: 4 },
 // Quality drew straight to the screen with the context's multisampling at up
 // to 2x (3.7 M pixels); the screen keeps that size, the world is drawn at
 // about 0.77 of it and upscaled.
 quality: { output: 2, maxOutput: 3700000, upscale: 'fsr', fxaa: false, rcas: .3, samples: 4 },
});

// iPhone and iPad (Safari and every iOS browser, which are all WebKit; an iPad
// asks for desktop pages and says "Macintosh", so touch points tell it apart).
// Their GPUs draw in on-chip tiles, where a multisampled buffer that has to be
// read back afterwards costs its full four samples of memory traffic, while
// FXAA is one light pass at the world's size. On a 2x-3x screen FXAA's
// softness at edges does not show, so the tiers that multisample use FXAA
// there instead (v0.999a).
export function appleTouch(nav = globalThis.navigator) {
 if (!nav) return false;
 const ua = nav.userAgent || '', platform = nav.platform || '';
 return /iPad|iPhone|iPod/.test(ua) || /iPad|iPhone|iPod/.test(platform) || (/Macintosh|MacIntel/.test(ua + platform) && (nav.maxTouchPoints || 0) > 1);
}

// The spec a tier draws with on this device.
export function crispSpec(name, apple = appleTouch()) {
 const spec = CRISP[name];
 if (!spec || !apple || !spec.samples) return spec || null;
 return { ...spec, samples: 0, fxaa: true };
}

const vertexShader = `varying vec2 vUv;
void main(){ vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }`;

// Potato's one pass (and a plain copy at 1:1 with sharpen 0).
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

// FXAA 3.11 (quality flavour) at the world's own size, drawn into the same
// corner of a second buffer. Edges are found from luma, their orientation
// from the 3x3 neighbourhood, then walked both ways (up to about 18 texels)
// to find where the step ends: a long, shallow roof or wall edge is blended
// by where along the step each pixel is, which a 4-neighbour blur cannot do.
// Texture detail (sand grain, planks) is kept: the sub-pixel blend is light.
const fxaaShader = `
uniform sampler2D map; uniform vec2 texel; uniform vec2 areaMax;
float luma(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
vec3 tex(vec2 uv){ return texture2D(map, min(uv, areaMax)).rgb; }
float lum(vec2 uv){ return luma(tex(uv)); }
void main(){
 vec2 uv = gl_FragCoord.xy * texel;
 vec3 centre = tex(uv);
 float lC = luma(centre);
 float lD = lum(uv + vec2(0., -texel.y)), lU = lum(uv + vec2(0., texel.y)), lL = lum(uv + vec2(-texel.x, 0.)), lR = lum(uv + vec2(texel.x, 0.));
 float lMin = min(lC, min(min(lD, lU), min(lL, lR))), lMax = max(lC, max(max(lD, lU), max(lL, lR)));
 float range = lMax - lMin;
 if (range < max(.0312, lMax * .125)) { gl_FragColor = vec4(centre, 1.); return; }
 float lDL = lum(uv - texel), lUR = lum(uv + texel), lUL = lum(uv + vec2(-texel.x, texel.y)), lDR = lum(uv + vec2(texel.x, -texel.y));
 float lDU = lD + lU, lLR = lL + lR, lLc = lDL + lUL, lDc = lDL + lDR, lRc = lDR + lUR, lUc = lUR + lUL;
 float edgeH = abs(-2. * lL + lLc) + abs(-2. * lC + lDU) * 2. + abs(-2. * lR + lRc);
 float edgeV = abs(-2. * lU + lUc) + abs(-2. * lC + lLR) * 2. + abs(-2. * lD + lDc);
 bool horizontal = edgeH >= edgeV;
 float l1 = horizontal ? lD : lL, l2 = horizontal ? lU : lR;
 float g1 = l1 - lC, g2 = l2 - lC;
 bool steep1 = abs(g1) >= abs(g2);
 float gScaled = .25 * max(abs(g1), abs(g2));
 float stepLength = horizontal ? texel.y : texel.x;
 float localAverage;
 if (steep1) { stepLength = -stepLength; localAverage = .5 * (l1 + lC); } else localAverage = .5 * (l2 + lC);
 vec2 edgeUv = uv;
 if (horizontal) edgeUv.y += stepLength * .5; else edgeUv.x += stepLength * .5;
 vec2 offset = horizontal ? vec2(texel.x, 0.) : vec2(0., texel.y);
 vec2 uv1 = edgeUv - offset, uv2 = edgeUv + offset;
 float end1 = lum(uv1) - localAverage, end2 = lum(uv2) - localAverage;
 bool done1 = abs(end1) >= gScaled, done2 = abs(end2) >= gScaled;
 if (!done1) uv1 -= offset; if (!done2) uv2 += offset;
 // The walk's stride grows with distance (FXAA 3.11 quality 12's steps).
 float stride[7]; stride[0] = 1.5; stride[1] = 2.; stride[2] = 2.; stride[3] = 2.; stride[4] = 2.; stride[5] = 4.; stride[6] = 8.;
 for (int i = 0; i < 7; i++) {
  if (done1 && done2) break;
  if (!done1) { end1 = lum(uv1) - localAverage; done1 = abs(end1) >= gScaled; }
  if (!done2) { end2 = lum(uv2) - localAverage; done2 = abs(end2) >= gScaled; }
  if (!done1) uv1 -= offset * stride[i];
  if (!done2) uv2 += offset * stride[i];
 }
 float d1 = horizontal ? uv.x - uv1.x : uv.y - uv1.y, d2 = horizontal ? uv2.x - uv.x : uv2.y - uv.y;
 bool nearer1 = d1 < d2;
 float pixelOffset = -min(d1, d2) / (d1 + d2) + .5;
 bool centreSmaller = lC < localAverage;
 float edgeOffset = (((nearer1 ? end1 : end2) < 0.) != centreSmaller) ? pixelOffset : 0.;
 float average = (1. / 12.) * (2. * (lDU + lLR) + lLc + lRc);
 float sub = clamp(abs(average - lC) / range, 0., 1.);
 sub = (-2. * sub + 3.) * sub * sub;
 float finalOffset = max(edgeOffset, sub * sub * .4);
 vec2 finalUv = uv;
 if (horizontal) finalUv.y += finalOffset * stepLength; else finalUv.x += finalOffset * stepLength;
 gl_FragColor = vec4(tex(finalUv), 1.);
}`;

// EASU (FSR 1's edge-adaptive spatial upscale), from AMD's ffx_fsr1.h in plain
// GLSL. The twelve texels round the output pixel's position in the input:
//      b c
//    e f g h
//    i j k l
//      n o
// Each of f, g, j, k gives an edge direction and strength from its cross of
// neighbours, weighted bilinearly by the position; those shape the kernel.
const easuShader = `
uniform sampler2D map; uniform vec2 inScale; uniform ivec2 inMax;
vec3 fetch(ivec2 p){ return texelFetch(map, clamp(p, ivec2(0), inMax), 0).rgb; }
float lumaOf(vec3 c){ return c.b * .5 + (c.r * .5 + c.g); }
void easuSet(inout vec2 dir, inout float len, float w, float lA, float lB, float lC, float lD, float lE){
 float dc = lD - lC, cb = lC - lB;
 float lenX = max(abs(dc), abs(cb)); lenX = lenX > 0. ? 1. / lenX : 0.;
 float dirX = lD - lB;
 dir.x += dirX * w;
 lenX = clamp(abs(dirX) * lenX, 0., 1.); lenX *= lenX; len += lenX * w;
 float ec = lE - lC, ca = lC - lA;
 float lenY = max(abs(ec), abs(ca)); lenY = lenY > 0. ? 1. / lenY : 0.;
 float dirY = lE - lA;
 dir.y += dirY * w;
 lenY = clamp(abs(dirY) * lenY, 0., 1.); lenY *= lenY; len += lenY * w;
}
void easuTap(inout vec3 aC, inout float aW, vec2 off, vec2 dir, vec2 len2, float lob, float clp, vec3 c){
 vec2 v = vec2(off.x * dir.x + off.y * dir.y, off.x * -dir.y + off.y * dir.x) * len2;
 float d2 = min(v.x * v.x + v.y * v.y, clp);
 float wB = .4 * d2 - 1., wA = lob * d2 - 1.;
 wB *= wB; wA *= wA;
 wB = 1.5625 * wB - .5625;
 float w = wB * wA;
 aC += c * w; aW += w;
}
void main(){
 vec2 pp = gl_FragCoord.xy * inScale - .5;
 vec2 fp = floor(pp); pp -= fp;
 ivec2 p = ivec2(fp);
 vec3 b = fetch(p + ivec2(0, -1)), c = fetch(p + ivec2(1, -1));
 vec3 e = fetch(p + ivec2(-1, 0)), f = fetch(p), g = fetch(p + ivec2(1, 0)), h = fetch(p + ivec2(2, 0));
 vec3 i = fetch(p + ivec2(-1, 1)), j = fetch(p + ivec2(0, 1)), k = fetch(p + ivec2(1, 1)), l = fetch(p + ivec2(2, 1));
 vec3 n = fetch(p + ivec2(0, 2)), o = fetch(p + ivec2(1, 2));
 float bL = lumaOf(b), cL = lumaOf(c), eL = lumaOf(e), fL = lumaOf(f), gL = lumaOf(g), hL = lumaOf(h);
 float iL = lumaOf(i), jL = lumaOf(j), kL = lumaOf(k), lL = lumaOf(l), nL = lumaOf(n), oL = lumaOf(o);
 vec2 dir = vec2(0.); float len = 0.;
 easuSet(dir, len, (1. - pp.x) * (1. - pp.y), bL, eL, fL, gL, jL);
 easuSet(dir, len, pp.x * (1. - pp.y), cL, fL, gL, hL, kL);
 easuSet(dir, len, (1. - pp.x) * pp.y, fL, iL, jL, kL, nL);
 easuSet(dir, len, pp.x * pp.y, gL, jL, kL, lL, oL);
 float dirR = dot(dir, dir);
 bool zero = dirR < 1. / 32768.;
 dir = zero ? vec2(1., 0.) : dir * inversesqrt(dirR);
 len = len * .5; len *= len;
 float stretch = dot(dir, dir) / max(abs(dir.x), abs(dir.y));
 vec2 len2 = vec2(1. + (stretch - 1.) * len, 1. - .5 * len);
 float lob = .5 + ((1. / 4. - .04) - .5) * len;
 float clp = 1. / lob;
 vec3 aC = vec3(0.); float aW = 0.;
 easuTap(aC, aW, vec2(0., -1.) - pp, dir, len2, lob, clp, b);
 easuTap(aC, aW, vec2(1., -1.) - pp, dir, len2, lob, clp, c);
 easuTap(aC, aW, vec2(-1., 1.) - pp, dir, len2, lob, clp, i);
 easuTap(aC, aW, vec2(0., 1.) - pp, dir, len2, lob, clp, j);
 easuTap(aC, aW, vec2(0., 0.) - pp, dir, len2, lob, clp, f);
 easuTap(aC, aW, vec2(-1., 0.) - pp, dir, len2, lob, clp, e);
 easuTap(aC, aW, vec2(1., 1.) - pp, dir, len2, lob, clp, k);
 easuTap(aC, aW, vec2(2., 1.) - pp, dir, len2, lob, clp, l);
 easuTap(aC, aW, vec2(2., 0.) - pp, dir, len2, lob, clp, h);
 easuTap(aC, aW, vec2(1., 0.) - pp, dir, len2, lob, clp, g);
 easuTap(aC, aW, vec2(1., 2.) - pp, dir, len2, lob, clp, o);
 easuTap(aC, aW, vec2(0., 2.) - pp, dir, len2, lob, clp, n);
 vec3 lo = min(min(f, g), min(j, k)), hi = max(max(f, g), max(j, k));
 gl_FragColor = vec4(clamp(aC / aW, lo, hi), 1.);
}`;

// RCAS (FSR 1's robust contrast-adaptive sharpening) at the screen's size:
// the sharpening lobe is the most each pixel can take without leaving the
// range of its four neighbours, times the strength (sharpness).
const rcasShader = `
uniform sampler2D map; uniform ivec2 inMax; uniform float sharpness;
vec3 fetch(ivec2 p){ return texelFetch(map, clamp(p, ivec2(0), inMax), 0).rgb; }
float lumaOf(vec3 c){ return c.b * .5 + (c.r * .5 + c.g); }
void main(){
 ivec2 p = ivec2(gl_FragCoord.xy);
 vec3 b = fetch(p + ivec2(0, 1)), d = fetch(p + ivec2(-1, 0)), e = fetch(p), f = fetch(p + ivec2(1, 0)), h = fetch(p + ivec2(0, -1));
 vec3 mn4 = min(min(b, d), min(f, h)), mx4 = max(max(b, d), max(f, h));
 vec3 hitMin = min(mn4, e) / (4. * mx4 + 1e-5);
 vec3 hitMax = (1. - max(mx4, e)) / min(4. * mn4 - 4., -1e-5);
 vec3 lobeRGB = max(-hitMin, hitMax);
 float lobe = max(-.1875, min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), 0.)) * sharpness;
 // Noise: a lone pixel unlike its neighbours (grain, a spark) is sharpened less.
 float bL = lumaOf(b), dL = lumaOf(d), eL = lumaOf(e), fL = lumaOf(f), hL = lumaOf(h);
 float nz = .25 * (bL + dL + fL + hL) - eL;
 float spread = max(max(max(bL, dL), max(fL, hL)), eL) - min(min(min(bL, dL), min(fL, hL)), eL);
 nz = spread > 0. ? clamp(abs(nz) / spread, 0., 1.) : 0.;
 lobe *= -.5 * nz + 1.;
 gl_FragColor = vec4((lobe * (b + d + f + h) + e) / (4. * lobe + 1.), 1.);
}`;

const plainTarget = () => new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });

export class CrispOutput {
 constructor(renderer) {
  this.renderer = renderer; this.samples = -1; this.spec = null;
  this.material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, depthTest: false, depthWrite: false,
   uniforms: { map: { value: null }, texel: { value: new THREE.Vector2() }, sharpen: { value: 0 }, fxaa: { value: 0 }, area: { value: new THREE.Vector2(1, 1) }, areaMax: { value: new THREE.Vector2(1, 1) } } });
  const pass = (fragment, uniforms) => new THREE.ShaderMaterial({ vertexShader, fragmentShader: fragment, depthTest: false, depthWrite: false, uniforms });
  this.fxaaMaterial = pass(fxaaShader, { map: { value: null }, texel: { value: new THREE.Vector2() }, areaMax: { value: new THREE.Vector2(1, 1) } });
  this.easuMaterial = pass(easuShader, { map: { value: null }, inScale: { value: new THREE.Vector2(1, 1) }, inMax: { value: new THREE.Vector2(0, 0) } });
  this.rcasMaterial = pass(rcasShader, { map: { value: null }, inMax: { value: new THREE.Vector2(0, 0) }, sharpness: { value: 1 } });
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
   // (Nothing reads the multisampled depth: the resolve copies colour only.)
   this.target.resolveDepthBuffer = false;
   this.target.isXRRenderTarget = true; this.target.texture.colorSpace = THREE.SRGBColorSpace; this.target.texture.internalFormat = 'RGBA8';
  }
  // The buffer is allocated at the tier's full internal size; adaptive
  // resolution then draws into a smaller corner of it (setScale) instead of
  // reallocating it (and, with multisampling, its sample buffers) mid-game,
  // which stalled the frame each time the scale stepped.
  const ratio = Math.min(internal, output), tw = Math.max(1, Math.round(w * ratio)), th = Math.max(1, Math.round(h * ratio));
  if (this.target.width !== tw || this.target.height !== th) this.target.setSize(tw, th);
  // The FSR chain's buffers: the antialiased world (same size and corner as
  // the world's) and the upscaled picture (the canvas's size, as three sizes
  // the canvas: floor of CSS size x ratio). Plain RGBA8, no depth.
  const fsr = spec.upscale === 'fsr';
  const ow = Math.max(1, Math.floor(w * output)), oh = Math.max(1, Math.floor(h * output));
  if (fsr && spec.fxaa) { this.aaTarget ||= plainTarget(); if (this.aaTarget.width !== tw || this.aaTarget.height !== th) this.aaTarget.setSize(tw, th); }
  else { this.aaTarget?.dispose(); this.aaTarget = null; }
  if (fsr) { this.upTarget ||= plainTarget(); if (this.upTarget.width !== ow || this.upTarget.height !== oh) this.upTarget.setSize(ow, oh); }
  else { this.upTarget?.dispose(); this.upTarget = null; }
  this.spec = spec; this.size = { w, h, ratio, output, ow, oh };
  const u = this.material.uniforms;
  u.map.value = this.target.texture; u.texel.value.set(1 / tw, 1 / th);
  u.fxaa.value = spec.fxaa ? 1 : 0;
  this.fxaaMaterial.uniforms.map.value = this.target.texture; this.fxaaMaterial.uniforms.texel.value.set(1 / tw, 1 / th);
  this.easuMaterial.uniforms.map.value = this.aaTarget ? this.aaTarget.texture : this.target.texture;
  this.rcasMaterial.uniforms.map.value = this.upTarget?.texture || null;
  this.rcasMaterial.uniforms.inMax.value.set(ow - 1, oh - 1);
  this.setScale(this.scale);
 }

 // Draw the world at `scale` of the full internal size (adaptive resolution).
 setScale(scale) {
  this.scale = scale;
  if (!this.target || !this.size) return;
  const { w, h, ratio, output, ow, oh } = this.size, tw = this.target.width, th = this.target.height;
  const aw = Math.max(1, Math.min(tw, Math.round(w * ratio * scale))), ah = Math.max(1, Math.min(th, Math.round(h * ratio * scale)));
  this.target.viewport.set(0, 0, aw, ah); this.target.scissor.set(0, 0, aw, ah);
  this.aaTarget?.viewport.set(0, 0, aw, ah);
  this.activeHeight = ah;
  const u = this.material.uniforms, stretch = output / (ratio * scale);
  u.area.value.set(aw / tw, ah / th); u.areaMax.value.set((aw - .5) / tw, (ah - .5) / th);
  this.fxaaMaterial.uniforms.areaMax.value.copy(u.areaMax.value);
  // No sharpening at 1:1; full strength from 1.5x stretch up.
  u.sharpen.value = (this.spec.sharpen || 0) * Math.max(0, Math.min(1, (stretch - 1) / .5));
  this.easuMaterial.uniforms.inScale.value.set(aw / ow, ah / oh);
  this.easuMaterial.uniforms.inMax.value.set(aw - 1, ah - 1);
  // RCAS at the tier's strength once the world is stretched by 1.2x or more,
  // easing to a third of it at 1:1 (nothing to restore there, but the same
  // look as the stretched frames when adaptive resolution steps back up).
  const ease = Math.max(0, Math.min(1, (stretch - 1) / .2));
  this.rcasMaterial.uniforms.sharpness.value = 2 ** -(this.spec.rcas ?? 1) * (.33 + .67 * ease);
 }

 get height() { return this.activeHeight || this.target?.height || 1; }

 pass(material, target) {
  this.quad.material = material;
  this.renderer.setRenderTarget(target); this.renderer.render(this.scene, this.camera);
 }

 render(scene, camera) {
  const r = this.renderer;
  r.setRenderTarget(this.target); r.render(scene, camera);
  // The passes add to the frame's draw count instead of replacing it.
  const reset = r.info.autoReset; r.info.autoReset = false;
  if (this.spec?.upscale === 'fsr') {
   if (this.aaTarget) this.pass(this.fxaaMaterial, this.aaTarget);
   this.pass(this.easuMaterial, this.upTarget);
   this.pass(this.rcasMaterial, null);
  } else this.pass(this.material, null);
  r.info.autoReset = reset;
 }

 // Every pass's shader, built now (the warm-up) rather than on first use.
 materials() { return [this.material, this.fxaaMaterial, this.easuMaterial, this.rcasMaterial]; }

 dispose() {
  this.target?.dispose(); this.target = null; this.aaTarget?.dispose(); this.aaTarget = null; this.upTarget?.dispose(); this.upTarget = null;
  for (const m of this.materials()) m.dispose();
  this.quad.geometry.dispose();
 }
}
