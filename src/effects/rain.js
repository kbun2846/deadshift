// Lumen's rain (lumen-design.md sections 10, 10b, 17): the shared schedule,
// the ground's wetness, the roof and puddle masks, the falling streaks and
// the splash rings. Built only for a map with `city.rain` (city-features.js).
//
// The schedule is pure functions of the weather clock (`rainAt`,
// `wetnessAt`), never integrated state: the host and a joiner who arrives two
// minutes late compute exactly the same rain and the same wet ground from the
// same clock, with nothing sent over the network.
//
// Everything that moves is animated on the GPU from `city.uniforms.time` and
// per-streak / per-ring seeds: one static streak mesh whose draw range follows
// the preset and the rain, and one instanced ring pool whose count does. The
// CPU sets four numbers a frame.
import * as THREE from 'three';
import { buildingContains } from '../map-kit.js';
import { registerCitySystem, GROUND_LAYER } from '../render/city-registry.js';

// The weather. Times in seconds of the weather clock.
export const RAIN = Object.freeze({
  period: 240,   // one whole cycle: rain then dry
  on: 120,       // the first 120 s of each cycle it rains
  ramp: 12,      // rain eases in over the first 12 s and out over the last 12 s of those 120
  wetIn: 30,     // the ground soaks over ~30 s of full rain (slower in a drizzle)
  dryOut: 90,    // and dries over ~90 s once the rain has stopped
  offset: 0,     // a map may start the cycle part way through (seconds into the cycle at clock 0)
  // Falling streaks and splash rings per preset (section 10b's table).
  streaks: Object.freeze({ potato: 0, performance: 350, balanced: 900, quality: 1800, extreme: 3000 }),
  rings: Object.freeze({ potato: 0, performance: 60, balanced: 150, quality: 300, extreme: 500 }),
});

// How the rain looks. Lengths in metres.
export const RAIN_LOOK = Object.freeze({
  colour: '#9fb4d6',   // pale blue-grey: reads as water on the dark street, far from the team cyan
  opacity: .2,         // per streak at its head (additive, so overlapping streaks add up)
  length: .9,          // a streak is the drop's blur over about a tenth of a second
  width: .035,         // at the camera's usual 29 m about one pixel; widened with distance so it never vanishes
  fallSpeed: 10,       // m/s, jittered +-15% per streak
  wind: Object.freeze([.22, .08]), // sideways drift per metre fallen (x, z): a steady slant, the same everywhere
  // The box of rain that follows the camera's focus: a little wider than the
  // outdoor view (29 m up, 40 degree field) so nothing pops in at the edges.
  halfX: 26, halfZ: 22, height: 12,
  ringLife: .55,       // s one splash ring lasts (jittered +-20%)
  ringRadius: .3,      // m its widest
  ringOpacity: .32,
  ringLift: .03,       // m above the flat street
  // The animation's own clock wraps every `wrap` seconds (a float's precision
  // runs out on a phone's GPU after a long session). Each streak's fall speed
  // is rounded to a whole number of falls per wrap, and each ring's life to a
  // whole number of lives, and a spot's seed steps with the fall or life
  // counted modulo that number: at the wrap every streak and ring is exactly
  // where it was, so the wrap never shows. (Speeds move by under 0.3%.)
  wrap: 480,
});

// The animation clock for the rain's shaders: the view's time, wrapped.
export const rainTime = (elapsed, look = RAIN_LOOK) => ((elapsed % look.wrap) + look.wrap) % look.wrap;
// A streak's whole falls per wrap and a ring's whole lives per wrap, from its
// seed.w (the shaders do the same sums; tests/rain.test.js checks the wrap).
export function streakFalls(seedW, look = RAIN_LOOK) {
  const lo = look.fallSpeed * .85 * look.wrap / look.height, hi = look.fallSpeed * 1.15 * look.wrap / look.height;
  return Math.floor(lo + (hi - lo) * seedW + .5);
}
export function ringLives(seedW, look = RAIN_LOOK) {
  const lo = look.wrap / (look.ringLife * .8), hi = look.wrap / (look.ringLife * 1.2);
  return Math.floor(lo + (hi - lo) * seedW + .5);
}

// The masks: one texel per half metre over the playable box plus a margin.
export const RAIN_MASK = Object.freeze({
  texel: .5,
  margin: 8,           // m round the playable box (streaks fall that far past its edge)
  maxTexels: 2048,     // per side; a bigger map gets coarser texels, never a bigger texture
  threshold: .5,       // the roof mask counts as a roof from here up (bilinear edges)
  puddleEdge: .55,     // a puddle is full water inside this fraction of its radius, then fades out
});

// The seeded stand-in puddles for a map that lists none (stage 1 gives Lumen its real list).
export const SEEDED_PUDDLES = Object.freeze({ count: 8, rx: [.8, 2.2], rz: [.5, 1.3], tries: 400 });

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
// The smooth ramp (smoothstep) and its integral from 0: how much rain has
// fallen part way up a ramp.
const ease = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const easeArea = x => { x = clamp01(x); return x * x * x - x * x * x * x / 2; };

function timing(spec) {
  const period = Math.max(spec.period, 1e-3), on = Math.min(Math.max(spec.on, 0), period);
  return { period, on, ramp: Math.min(Math.max(spec.ramp, 0), on / 2), wetIn: Math.max(spec.wetIn, 1e-3), dryOut: Math.max(spec.dryOut, 1e-3) };
}

// Seconds into the current cycle (0 .. period), for any clock, negative too.
export function rainPhase(clock, spec = RAIN) {
  const { period } = timing(spec);
  return (((clock + (spec.offset || 0)) % period) + period) % period;
}

// How hard it is raining now, 0 .. 1.
export function rainAt(clock, spec = RAIN) {
  const t = timing(spec), p = rainPhase(clock, spec);
  if (p >= t.on) return 0;
  if (t.ramp <= 0) return 1;
  return ease(Math.min(p / t.ramp, (t.on - p) / t.ramp));
}

// Rain-seconds fallen since the cycle began (full rain counts 1 a second).
function rainSoFar(p, t) {
  const { on, ramp } = t;
  if (p <= 0) return 0;
  if (p < ramp) return ramp * easeArea(p / ramp);
  if (p < on - ramp) return ramp / 2 + (p - ramp);
  if (p < on) return on - ramp - ramp * easeArea((on - p) / ramp);
  return on - ramp;
}

// The ground's wetness as a closed form of the clock.
//
// The model: while it rains the ground soaks at (rain / wetIn) a second up to
// soaked; once the rain has stopped it dries at 1 / dryOut a second down to
// dry. Over one cycle that raises the wetness by A = (rain-seconds) / wetIn
// (capped at 1) and then lowers it by D = (dry seconds) / dryOut (floored at
// 0). The weather has been repeating forever, so the wetness a cycle starts
// with is the cycle's fixed point, found exactly rather than by stepping:
//   A > D: the rain always soaks the ground, which dries to 1 - D (or 0);
//   A <= D: the ground always dries out before the next rain.
// With Lumen's numbers A = 3.6, D = 1.33: the ground is dry again 90 s after
// each rain and 30 s before the next. A longer dryOut (or a shorter dry spell)
// leaves it damp when the rain returns, and the curve is still continuous
// across the cycle boundary. The result is eased so it starts and settles
// gently.
function wetnessStart(t) {
  const soak = (t.on - t.ramp) / t.wetIn, dry = (t.period - t.on) / t.dryOut;
  return soak > dry ? Math.max(0, 1 - dry) : 0;
}

export function wetnessLinear(clock, spec = RAIN) {
  const t = timing(spec), p = rainPhase(clock, spec), start = wetnessStart(t);
  if (p <= t.on) return Math.min(1, start + rainSoFar(p, t) / t.wetIn);
  const soaked = Math.min(1, start + (t.on - t.ramp) / t.wetIn);
  return Math.max(0, soaked - (p - t.on) / t.dryOut);
}

export function wetnessAt(clock, spec = RAIN) { return ease(wetnessLinear(clock, spec)); }

// ---------------------------------------------------------------------------
// The masks.

// What keeps rain off: every room, every sealed tower mass, every canopy.
export function roofShapes(map) {
  return [...(map.buildings || []), ...(map.solids || []), ...(map.city?.canopies || [])];
}

// The box a room, solid or canopy (rect with angle, or quad) covers.
export function shapeBox(shape) {
  if (shape.quad) {
    const xs = shape.quad.map(p => p[0]), zs = shape.quad.map(p => p[1]);
    return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
  }
  const c = Math.abs(Math.cos(shape.angle || 0)), s = Math.abs(Math.sin(shape.angle || 0));
  const hx = shape.w / 2 * c + shape.d / 2 * s, hz = shape.w / 2 * s + shape.d / 2 * c;
  return [shape.x - hx, shape.z - hz, shape.x + hx, shape.z + hz];
}

// The playable box plus the margin, snapped to whole texels, the width a
// multiple of four texels (an R8 row then needs no unpack padding, though the
// texture also sets unpackAlignment 1).
export function maskBounds(map, options = RAIN_MASK) {
  let x0, z0, x1, z1;
  if (map.playableArea?.length) {
    const xs = map.playableArea.map(p => p[0]), zs = map.playableArea.map(p => p[1]);
    x0 = Math.min(...xs); x1 = Math.max(...xs); z0 = Math.min(...zs); z1 = Math.max(...zs);
  } else { x0 = -map.width / 2; x1 = map.width / 2; z0 = -map.depth / 2; z1 = map.depth / 2; }
  x0 -= options.margin; z0 -= options.margin; x1 += options.margin; z1 += options.margin;
  const texel = Math.max(options.texel, (x1 - x0) / options.maxTexels, (z1 - z0) / options.maxTexels);
  const width = Math.ceil((x1 - x0) / texel / 4) * 4, height = Math.ceil((z1 - z0) / texel);
  x0 = Math.floor(x0 / texel) * texel; z0 = Math.floor(z0 / texel) * texel;
  return { x0, z0, x1: x0 + width * texel, z1: z0 + height * texel, width, height, texel };
}

// World xz -> the texel the GPU's (bounds-relative) uv lands in, clamped to
// the edge as the texture's ClampToEdge wrapping does. The shaders compute
// uv = (xz - (x0, z0)) / (x1 - x0, z1 - z0); row j is z, column i is x.
export function maskTexel(bounds, x, z) {
  const i = Math.min(bounds.width - 1, Math.max(0, Math.floor((x - bounds.x0) / bounds.texel)));
  const j = Math.min(bounds.height - 1, Math.max(0, Math.floor((z - bounds.z0) / bounds.texel)));
  return j * bounds.width + i;
}

// The mask's value (0..1) at a point, nearest texel (the GPU blends the four
// nearest, which only softens the half-metre edge).
export const maskValue = (data, bounds, x, z) => data[maskTexel(bounds, x, z)] / 255;

// 1 at every texel within a texel of a room, a tower mass or a canopy (a
// room reaches into the square of one texel round its centre), so the mask
// errs dry: the GPU blends the four nearest texels, so every point under a
// roof then reads a full 1 right up to the wall. A texel counted only by its
// centre left a wet, raining band up to a quarter metre inside a room's wall
// (owner: interiors never get wet). The price is a dry strip about half a
// metre wide along the outside of every wall, where eaves would keep it dry.
const ROOF_SAMPLES = [0, -.5, .5, -1, 1].flatMap(u => [0, -.5, .5, -1, 1].map(v => [.5 + u, .5 + v]));
export function buildRoofMask(map, bounds) {
  const data = new Uint8Array(bounds.width * bounds.height), point = { x: 0, z: 0 }, t = bounds.texel;
  for (const shape of roofShapes(map)) {
    const [bx0, bz0, bx1, bz1] = shapeBox(shape);
    const i0 = Math.max(0, Math.floor((bx0 - bounds.x0) / t) - 1), i1 = Math.min(bounds.width - 1, Math.ceil((bx1 - bounds.x0) / t));
    const j0 = Math.max(0, Math.floor((bz0 - bounds.z0) / t) - 1), j1 = Math.min(bounds.height - 1, Math.ceil((bz1 - bounds.z0) / t));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const at = j * bounds.width + i; if (data[at]) continue;
      for (const [u, v] of ROOF_SAMPLES) {
        point.x = bounds.x0 + (i + u) * t; point.z = bounds.z0 + (j + v) * t;
        if (buildingContains(shape, point)) { data[at] = 255; break; }
      }
    }
  }
  return data;
}

// Standing water: soft-edged ellipses, never under a roof.
export function buildPuddleMask(puddles, bounds, roof) {
  const data = new Uint8Array(bounds.width * bounds.height), t = bounds.texel;
  for (const p of puddles) {
    const c = Math.cos(p.angle || 0), s = Math.sin(p.angle || 0), reach = Math.max(p.rx, p.rz);
    const i0 = Math.max(0, Math.floor((p.x - reach - bounds.x0) / t)), i1 = Math.min(bounds.width - 1, Math.ceil((p.x + reach - bounds.x0) / t));
    const j0 = Math.max(0, Math.floor((p.z - reach - bounds.z0) / t)), j1 = Math.min(bounds.height - 1, Math.ceil((p.z + reach - bounds.z0) / t));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const at = j * bounds.width + i;
      if (roof && roof[at] >= 128) continue;
      const dx = bounds.x0 + (i + .5) * t - p.x, dz = bounds.z0 + (j + .5) * t - p.z;
      const u = (dx * c + dz * s) / p.rx, v = (-dx * s + dz * c) / p.rz, r = Math.hypot(u, v);
      const water = 1 - ease((r - RAIN_MASK.puddleEdge) / (1 - RAIN_MASK.puddleEdge));
      if (water > 0) data[at] = Math.max(data[at], Math.round(water * 255));
    }
  }
  return data;
}

// A few puddles on open ground, the same every load (the map's scenery seed),
// for a map with no `city.puddles` (the test map). Each lies wholly in the
// playable box and clear of every roof shape.
export function seededPuddles(map, { count = SEEDED_PUDDLES.count, seed = map.scenerySeed ?? 1 } = {}) {
  const random = mulberry(seed * 7919 + 17), shapes = roofShapes(map), bounds = maskBounds(map, { ...RAIN_MASK, margin: 0 });
  const covered = (x, z) => shapes.some(s => buildingContains(s, { x, z }));
  const range = ([a, b]) => a + random() * (b - a), puddles = [];
  for (let tries = 0; puddles.length < count && tries < SEEDED_PUDDLES.tries; tries++) {
    const rx = range(SEEDED_PUDDLES.rx), rz = range(SEEDED_PUDDLES.rz), angle = random() * Math.PI;
    const x = bounds.x0 + rx + 1 + random() * (bounds.x1 - bounds.x0 - 2 * rx - 2), z = bounds.z0 + rx + 1 + random() * (bounds.z1 - bounds.z0 - 2 * rx - 2);
    let clear = !covered(x, z);
    for (let k = 0; clear && k < 8; k++) {
      const a = k / 8 * Math.PI * 2, u = Math.cos(a) * rx, v = Math.sin(a) * rz;
      clear = !covered(x + u * Math.cos(angle) - v * Math.sin(angle), z + u * Math.sin(angle) + v * Math.cos(angle));
    }
    if (clear && puddles.every(p => Math.hypot(p.x - x, p.z - z) > p.rx + rx + 1)) puddles.push({ x: round2(x), z: round2(z), rx: round2(rx), rz: round2(rz), angle: round2(angle) });
  }
  return puddles;
}
const round2 = v => Math.round(v * 100) / 100;
function mulberry(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function maskTexture(data, bounds) {
  const texture = new THREE.DataTexture(data, bounds.width, bounds.height, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.unpackAlignment = 1; texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------
// The streaks and rings.

// Shared GLSL: a mask's value at a world xz.
const MASK_GLSL = `
uniform sampler2D roofMask;
uniform vec4 maskBounds;
vec2 rainMaskUv(vec2 xz) { return (xz - maskBounds.xy) / (maskBounds.zw - maskBounds.xy); }
float rainRoofAt(vec2 xz) { return texture2D(roofMask, rainMaskUv(xz)).r; }
`;
// Where a seeded spot lands this cycle, wrapped round the focus so the rain
// stays put in the world while the box follows the camera. Each cycle steps
// the seed by the golden ratios, so a streak or ring never repeats in place.
const WRAP_GLSL = `
uniform vec3 focus;
uniform vec3 rainBox; // half width (x), height, half depth (z)
vec2 rainSpot(vec2 seedXz, float cycle, vec2 drift) {
  vec2 size = rainBox.xz * 2.0;
  vec2 xz = fract(seedXz + cycle * vec2(0.6180339, 0.7548777)) * size + drift;
  return focus.xz + mod(xz - focus.xz + rainBox.xz, size) - rainBox.xz;
}
float rainEdgeFade(vec2 xz) { vec2 l = abs(xz - focus.xz) / rainBox.xz; return 1.0 - smoothstep(0.82, 1.0, max(l.x, l.y)); }
`;
const HIDDEN = 'gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;'; // outside the clip box: no fragments

// One quad per streak: position.x across (-1..1), position.y along (0 head .. 1 tail).
export function streakGeometry(count) {
  const position = new Float32Array(count * 12), seed = new Float32Array(count * 16), index = new Uint16Array(count * 6), random = mulberry(4051);
  const corners = [-1, 0, 1, 0, 1, 1, -1, 1];
  for (let s = 0; s < count; s++) {
    const a = random(), b = random(), c = random(), d = random();
    for (let k = 0; k < 4; k++) {
      position.set([corners[k * 2], corners[k * 2 + 1], 0], (s * 4 + k) * 3);
      seed.set([a, b, c, d], (s * 4 + k) * 4);
    }
    index.set([s * 4, s * 4 + 1, s * 4 + 2, s * 4, s * 4 + 2, s * 4 + 3], s * 6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); // moved on the GPU; never culled
  return geometry;
}

export function ringGeometry(count) {
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), random = mulberry(8093), seed = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seed[i] = random();
  geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(seed, 4));
  return geometry;
}

// Additive blending: a streak adds a little light (the street and the neon
// catching the drop), never darkens what is behind it, and 3,000 overlapping
// streaks in one mesh need no back-to-front sort to look right. Normal
// blending at this alpha would grey the neon it crosses.
function rainMaterial(uniforms, vertexShader, fragmentShader, key) {
  // Double-sided: a streak turns to face the camera, so which way its quad
  // winds is not fixed.
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
  material.customProgramCacheKey = () => key;
  return material;
}

export function streakMaterial(city, focus, time = { value: 0 }) {
  const look = RAIN_LOOK;
  return rainMaterial({
    time, rain: city.uniforms.rain, roofMask: city.uniforms.roofMask, maskBounds: city.uniforms.maskBounds,
    focus: { value: focus }, rainBox: { value: new THREE.Vector3(look.halfX, look.height, look.halfZ) },
    wind: { value: new THREE.Vector2(...look.wind) }, fall: { value: new THREE.Vector3(look.fallSpeed, look.length, look.width) },
    falls: { value: new THREE.Vector3(look.fallSpeed * .85 * look.wrap / look.height, look.fallSpeed * 1.15 * look.wrap / look.height, look.wrap) },
    colour: { value: new THREE.Color(look.colour) }, opacity: { value: look.opacity },
  }, `
attribute vec4 seed; // column x, column z, where in its fall it starts, speed
uniform float time;
uniform vec2 wind;
uniform vec3 fall; // speed, length, width
uniform vec3 falls; // whole falls per wrap (fewest, most), the wrap (s)
${MASK_GLSL}${WRAP_GLSL}
varying float vAlong;
varying float vAcross;
varying float vFade;
varying float vHeight;
varying vec2 vWorldXz;
void main() {
  float n = floor(mix(falls.x, falls.y, seed.w) + 0.5); // (streakFalls)
  float travel = seed.z * rainBox.y + time * n * rainBox.y / falls.z;
  float cycle = floor(travel / rainBox.y);
  float y = rainBox.y - (travel - cycle * rainBox.y);
  vec2 xz = rainSpot(seed.xy, mod(cycle, n), wind * (rainBox.y - y));
  if (rainRoofAt(xz) > ${RAIN_MASK.threshold.toFixed(2)}) { ${HIDDEN} }
  vec3 down = normalize(vec3(wind.x, -1.0, wind.y));
  vec3 p = vec3(xz.x, y, xz.y) - down * (fall.y * position.y);
  vec3 across = normalize(cross(down, cameraPosition - p));
  p += across * position.x * fall.z * (distance(cameraPosition, p) / 29.0);
  vAlong = position.y; vAcross = position.x; vHeight = p.y; vWorldXz = p.xz;
  vFade = rainEdgeFade(xz) * (1.0 - smoothstep(rainBox.y - 1.5, rainBox.y, y));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`, `
uniform vec3 colour;
uniform float opacity;
uniform float rain;
${MASK_GLSL}
varying float vAlong;
varying float vAcross;
varying float vFade;
varying float vHeight;
varying vec2 vWorldXz;
void main() {
  // The tail can lean over a roof edge the head is clear of.
  if (rainRoofAt(vWorldXz) > ${RAIN_MASK.threshold.toFixed(2)}) discard;
  float alpha = opacity * (1.0 - vAlong) * (1.0 - abs(vAcross)) * vFade * (0.6 + 0.4 * rain);
  // Brighter in the last few metres: the drops catch the street's light.
  gl_FragColor = vec4(colour * (0.85 + 0.35 * (1.0 - smoothstep(0.0, 4.0, vHeight))), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`, 'lumen-rain-streaks');
}

export function ringMaterial(city, focus, time = { value: 0 }) {
  const look = RAIN_LOOK;
  return rainMaterial({
    time, rain: city.uniforms.rain, roofMask: city.uniforms.roofMask, puddleMask: city.uniforms.puddleMask, maskBounds: city.uniforms.maskBounds,
    focus: { value: focus }, rainBox: { value: new THREE.Vector3(look.halfX, look.height, look.halfZ) },
    ring: { value: new THREE.Vector4(look.ringLife, look.ringRadius, look.ringOpacity, look.ringLift) },
    lives: { value: new THREE.Vector3(look.wrap / (look.ringLife * .8), look.wrap / (look.ringLife * 1.2), look.wrap) },
    colour: { value: new THREE.Color(look.colour) },
  }, `
attribute vec4 seed; // spot x, spot z, phase, life
uniform float time;
uniform vec4 ring; // life, radius, opacity, lift
uniform vec3 lives; // whole lives per wrap (most, fewest), the wrap (s)
uniform sampler2D puddleMask;
${MASK_GLSL}${WRAP_GLSL}
varying vec2 vRingUv;
varying float vLife;
varying float vPool;
varying float vFade;
void main() {
  float m = floor(mix(lives.x, lives.y, seed.w) + 0.5); // (ringLives)
  float t = time * m / lives.z + seed.z;
  float cycle = floor(t);
  vLife = t - cycle;
  vec2 xz = rainSpot(seed.xy, mod(cycle, m), vec2(0.0));
  vec2 uv = rainMaskUv(xz);
  if (texture2D(roofMask, uv).r > ${RAIN_MASK.threshold.toFixed(2)}) { ${HIDDEN} }
  vPool = texture2D(puddleMask, uv).r;
  vFade = rainEdgeFade(xz);
  vRingUv = position.xz * 2.0;
  // Rings in standing water spread a little wider.
  vec3 p = vec3(xz.x, ring.w, xz.y) + position * (2.0 * ring.y * (1.0 + 0.4 * vPool));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`, `
uniform vec3 colour;
uniform vec4 ring;
uniform float rain;
varying vec2 vRingUv;
varying float vLife;
varying float vPool;
varying float vFade;
void main() {
  float d = length(vRingUv);
  if (d > 1.0) discard;
  // Sharper and brighter in a puddle, soft and faint on wet asphalt.
  float band = 1.0 - smoothstep(0.0, mix(0.16, 0.08, vPool), abs(d - (0.15 + 0.85 * vLife)));
  float alpha = ring.z * band * (1.0 - vLife) * mix(0.75, 1.35, vPool) * vFade * (0.5 + 0.5 * rain);
  gl_FragColor = vec4(colour, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`, 'lumen-rain-rings');
}

const STREAKS_MAX = Math.max(...Object.values(RAIN.streaks)), RINGS_MAX = Math.max(...Object.values(RAIN.rings));

export class RainSystem {
  constructor(view, map, city) {
    this.view = view; this.map = map; this.city = city;
    const flag = map.city?.rain;
    this.spec = Object.freeze({ ...RAIN, ...(flag && typeof flag === 'object' ? flag : {}) });
    this.focus = new THREE.Vector3().copy(view.focus || new THREE.Vector3());

    // The masks, made once from the map.
    const bounds = this.bounds = maskBounds(map);
    this.roofData = buildRoofMask(map, bounds);
    this.puddles = map.city?.puddles ?? seededPuddles(map);
    this.puddleData = buildPuddleMask(this.puddles, bounds, this.roofData);
    city.uniforms.maskBounds.value.set(bounds.x0, bounds.z0, bounds.x1, bounds.z1);
    city.uniforms.roofMask.value = this.roofTexture = maskTexture(this.roofData, bounds);
    city.uniforms.puddleMask.value = this.puddleTexture = maskTexture(this.puddleData, bounds);

    // One static streak mesh at Extreme's count and one ring pool at
    // Extreme's size, in the scene from the start (the warm-up draws them).
    // The shaders' own clock: the view's time wrapped (RAIN_LOOK.wrap).
    this.time = { value: 0 };
    this.streaks = new THREE.Mesh(streakGeometry(STREAKS_MAX), streakMaterial(city, this.focus, this.time));
    this.rings = new THREE.InstancedMesh(ringGeometry(RINGS_MAX), ringMaterial(city, this.focus, this.time), RINGS_MAX);
    for (const mesh of [this.streaks, this.rings]) { mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.name = 'lumen-rain'; view.scene?.add(mesh); }
    // Rings lie flat on the street: the ground layer, never drawn into the mirror.
    this.rings.layers.set(GROUND_LAYER);
    this.rings.count = 0; this.streaks.geometry.setDrawRange(0, 0);
    this.streakCount = 0; this.ringCount = 0;
    this.setQuality(view.qualityName || 'balanced');
  }

  setQuality(name) {
    this.quality = name;
    this.streakCount = this.spec.streaks[name] ?? RAIN.streaks[name] ?? 0;
    this.ringCount = this.spec.rings[name] ?? RAIN.rings[name] ?? 0;
    // The wet ground's gloss and mirror defines follow the preset too.
    for (const material of this.city.wetGroundMaterials || []) material.userData.setQuality?.(name);
    this.apply(this.city.uniforms.rain.value);
  }

  // Draw only as many streaks and rings as the preset and the rain ask for.
  apply(rain) {
    const streaks = Math.round(this.streakCount * rain), rings = Math.round(this.ringCount * rain);
    this.streaks.geometry.setDrawRange(0, streaks * 6); this.streaks.visible = streaks > 0;
    this.rings.count = rings; this.rings.visible = rings > 0;
  }

  update(frame) {
    const rain = rainAt(frame.clock, this.spec), u = this.city.uniforms;
    this.time.value = rainTime(frame.elapsed ?? u.time.value);
    u.rain.value = rain; u.wetness.value = wetnessAt(frame.clock, this.spec);
    if (frame.focus) this.focus.copy(frame.focus);
    this.apply(rain);
  }

  // The warm-up's draw: everything at full size, so the first shower builds
  // nothing (update puts the real counts back next frame).
  warm() {
    this.streaks.geometry.setDrawRange(0, STREAKS_MAX * 6); this.streaks.visible = true;
    this.rings.count = RINGS_MAX; this.rings.visible = true;
  }

  // The rain's own reading of the masks, for gameplay and sound later
  // (footsteps in puddles, muffled rain under a roof).
  roofAt(x, z) { return maskValue(this.roofData, this.bounds, x, z); }
  puddleAt(x, z) { return maskValue(this.puddleData, this.bounds, x, z); }

  dispose() {
    for (const mesh of [this.streaks, this.rings]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); }
    this.roofTexture.dispose(); this.puddleTexture.dispose();
    if (this.city.uniforms.roofMask.value === this.roofTexture) this.city.uniforms.roofMask.value = null;
    if (this.city.uniforms.puddleMask.value === this.puddleTexture) this.city.uniforms.puddleMask.value = null;
  }
}

registerCitySystem('rain', (view, map, city) => new RainSystem(view, map, city));
