// Lumen's water effects (lumen-design.md sections 10, 10b, 11, 17): everything
// the rain does once it lands and after it stops. Built only for a map with
// `city.water` (city-features.js), after the rain (effects/rain.js), which
// sets the wetness, the masks and the schedule this reads.
//
//   footstep rings and wet shoe prints, splashes    gameplay: everyone sees them
//   puddle ripples, splash crowns where the rain hits
//   gutters running to storm drains, with foam; downspouts and their streams
//   awning curtains; drips off ledges and signs, for ~60 s after the rain
//   steam on the hot things; sparks that sizzle where they meet water
//   shots, blasts, casings and falls that splash; blood thinning in water
//
// Five meshes, one material each, all built (and their shaders) in the
// constructor; every animation is a function of `city.uniforms.time` and the
// per-instance numbers, computed on the GPU. The CPU's work:
//   * an event (a step, a round, a drop of blood) writes 12 numbers into a
//     ring buffer of instance slots that was allocated once, and marks it
//     for upload; a full pool overwrites its oldest slot. Nothing is
//     allocated per event or per frame.
//   * each frame sets a handful of uniforms (the runoff amounts, the
//     focus) and switches each mesh on or off, so a mesh with nothing to
//     show costs no draw call.
//   * four times a second, when there are drips to show, the nearest
//     ledges and signs are picked for the drip pool ("near you").
//
// Interiors are dry (owner): an event at a point under a roof does nothing,
// the loops never draw where the roof mask is set, and every placed thing
// (drain, spout, awning, ledge) stands in open air (lumen-water-places.js).
//
// Team colours never appear: water is a pale blue-grey, foam and steam grey,
// sparks white-lemon (decision 8), blood its own dark red diluted.
import * as THREE from 'three';
import { registerCitySystem, GROUND_LAYER, BRIGHT_LAYER } from '../render/city-registry.js';
import { blackTexture } from '../render/wet-ground.js';
import { RAIN, rainPhase, maskBounds, buildRoofMask, buildPuddleMask, maskTexture, maskValue, seededPuddles } from './rain.js';
import { waterPlaces, outdoorsTest, nearestGutter, WATER_PLACES } from './lumen-water-places.js';
import { buildingContains } from '../map-kit.js';

// What each preset draws (section 10b's table: the rain's streaks and splash
// rings are effects/rain.js; these are the water effects beside them). Pools
// are sized at Extreme's numbers once; a lower preset uses fewer slots.
//   rings     footstep, impact, casing and fall rings (a ring buffer)
//   prints    wet shoe prints, kept ~4 s (their own buffer, so a busy fight's rings never push them out)
//   stains    blood spreading in water
//   ponds     rain ripples overlapping in the standing puddles (only in rain)
//   splashes  spray crowns from steps, shots and blasts
//   spoutSplashes  crowns at each downspout's foot, per spout
//   puddleCrowns / scatterCrowns  crowns where the rain hits: in the puddles / on open ground round the camera
//   drips     falling drops off the nearest ledges and signs
//   puffs     steam puffs per hot spot;  sparks  sparks per spark spot
export const WATER = Object.freeze({
  presets: Object.freeze({
    potato:      Object.freeze({ rings: 0,   prints: 0,   stains: 0,  ponds: 0,   splashes: 12, spoutSplashes: 0, puddleCrowns: 0,   scatterCrowns: 0,   drips: 0,   puffs: 0,  sparks: 0,  gutters: false, curtains: false, gutterBlood: false }),
    performance: Object.freeze({ rings: 40,  prints: 40,  stains: 12, ponds: 0,   splashes: 16, spoutSplashes: 0, puddleCrowns: 0,   scatterCrowns: 0,   drips: 24,  puffs: 0,  sparks: 0,  gutters: false, curtains: false, gutterBlood: false }),
    balanced:    Object.freeze({ rings: 80,  prints: 64,  stains: 20, ponds: 80,  splashes: 24, spoutSplashes: 2, puddleCrowns: 0,   scatterCrowns: 0,   drips: 48,  puffs: 4,  sparks: 0,  gutters: true,  curtains: false, gutterBlood: false }),
    quality:     Object.freeze({ rings: 140, prints: 96,  stains: 32, ponds: 160, splashes: 40, spoutSplashes: 2, puddleCrowns: 40,  scatterCrowns: 60,  drips: 80,  puffs: 6,  sparks: 6,  gutters: true,  curtains: true,  gutterBlood: true }),
    extreme:     Object.freeze({ rings: 240, prints: 160, stains: 48, ponds: 300, splashes: 64, spoutSplashes: 3, puddleCrowns: 100, scatterCrowns: 160, drips: 140, puffs: 10, sparks: 10, gutters: true,  curtains: true,  gutterBlood: true }),
  }),
});

// How it behaves. Seconds and metres.
export const WATER_FX = Object.freeze({
  wetMin: .2,             // wetness above which wet ground shows a footstep (design 10)
  poolMin: .3,            // puddle mask above which a spot is standing water
  printMaxPool: .55,      // a print is left on wet ground, not in the middle of a puddle
  printLife: 4,           // s a wet shoe print stays (design 10: ~4 s)
  printSize: .2,          // m: half the quad; the sole is about 0.3 x 0.11 m
  printSide: .09,         // m each foot sits off the walking line
  printJoin: 2.4, printJoinTime: .8, // a print finds its heading from the last one within this many m and s
  ringSize: .34, ringSizePool: .5, ringLife: .8, ringLifePool: 1.1,
  strongSize: 1.1, strongLife: 1.2,       // a dodge or dash landing
  speedRef: 5,            // m/s: a step at this speed is a normal one
  impactSize: .45, impactLife: .8, blastSize: 3.4, blastLife: 1.1,
  casingSize: .16, fallSize: .8,
  bloodLife: 6, bloodLifePool: 8.5, bloodDrift: .05, gutterDrift: .4, gutterReach: .9,
  runoffRoof: 8,          // s a roof takes to start shedding once it rains
  spoutTail: 18,          // s downspouts and awning curtains run on after the rain
  dripTail: 60,           // s ledges and signs drip on after the rain (design 10b)
  steamBase: .45,         // steam on hot things when it is dry; rain and wet ground raise it to 1
  viewHalf: Object.freeze([32, 28]), // m: half the ground box the camera can see (x, z) with a margin; a hot spot, ledge or sign outside it draws nothing
  dripRefresh: .8, dripMove: 2.5, // s / m between re-picks of the nearest ledges
  scatterHalf: Object.freeze([22, 18]), // half sizes of the box of crowns that follows the camera
});

export const WATER_LOOK = Object.freeze({
  water: '#a9c1e4',       // pale blue-grey, kin to the rain streak (#9fb4d6) and far from team cyan
  foam: '#e4ecf6',
  steam: '#b4bdcb',
  spark: '#fff2b0',       // white-lemon: the crackling EV and cable are never Static's colour
  bloodDeep: '#8c1c2a',   // blood's own colour (design 12) ...
  bloodPale: '#c47a86',   // ... diluted toward this in water
  bloodRim: '#c23a48',    // the thin brighter wet rim
  printGain: .3,          // how much light a wet print adds (0 .. 1)
  ringGain: .38,
  wind: Object.freeze([.22, .08]),
  lift: .034,             // m above the street for the flat things (rain's rings lie at .03)
  gutterLift: .022,
});

// ---------------------------------------------------------------------------
// The schedule's water: pure functions of the weather clock, like the rain's
// own (host and joiners agree with nothing sent).

// How much a roof is shedding: it soaks for a few seconds after the rain
// starts, sheds while it rains and runs on for `tail` seconds after it stops.
export function runoffAt(clock, tail, spec = RAIN) {
  const p = rainPhase(clock, spec);
  if (p < spec.on) return Math.min(1, p / WATER_FX.runoffRoof);
  return Math.max(0, 1 - (p - spec.on) / Math.max(tail, 1e-3));
}
// The ledges' and signs' drips: the roof's runoff over a minute, easing off.
export const dripAt = (clock, spec = RAIN) => Math.pow(runoffAt(clock, WATER_FX.dripTail, spec), 1.4);
// The gutters: they start once the ground is wet (a little from the rain
// itself) and dwindle as it dries.
export function flowAt(wetness, rain) {
  const soaked = Math.min(1, Math.max(0, (wetness - .1) / .55));
  return Math.min(1, soaked * .8 + rain * .25);
}
// Steam on hot metal: a little when dry, more in the rain and on wet ground.
export const steamAt = (wetness, rain) => WATER_FX.steamBase + (1 - WATER_FX.steamBase) * Math.min(1, Math.max(rain, wetness * .7));

const PRESET_NAMES = Object.keys(WATER.presets);
const MAX = key => Math.max(...PRESET_NAMES.map(n => WATER.presets[n][key]));

// ---------------------------------------------------------------------------
// GLSL shared by the shaders.

const HIDDEN = 'gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;'; // outside the clip box: no fragments
const NOISE_GLSL = 'float h11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }\n';
const MASK_GLSL = `
uniform sampler2D roofMask;
uniform sampler2D puddleMask;
uniform vec4 maskBounds;
vec2 maskUv(vec2 xz) { return (xz - maskBounds.xy) / (maskBounds.zw - maskBounds.xy); }
`;
// The screen billboard axes, from the view matrix.
const BILLBOARD_GLSL = `
vec3 camRight() { return vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); }
vec3 camUp() { return vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); }
`;
const FRAGMENT_TAIL = `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

// Premultiplied blending: a fragment adds light (rgb with alpha 0) and/or
// covers what is under it (rgb = colour * cover, alpha = cover), so one
// material draws rings and prints (added light) and blood (covering).
function premultiplied(uniforms, vertexShader, fragmentShader, key, extra = {}) {
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, ...extra });
  material.customProgramCacheKey = () => key;
  return material;
}
function additive(uniforms, vertexShader, fragmentShader, key) {
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  material.customProgramCacheKey = () => key;
  return material;
}

// The shared numbers every material reads. Colours and amounts live in one
// object so a value set once reaches every shader at once, no recompile.
function makeUniforms(city, focus) {
  const u = city.uniforms, colour = hex => ({ value: new THREE.Color(hex) });
  const orBlack = source => ({ get value() { return source.value || blackTexture(); }, set value(v) { source.value = v; } });
  const look = WATER_LOOK;
  return {
    time: u.time, rain: u.rain, wetness: u.wetness, maskBounds: u.maskBounds,
    roofMask: orBlack(u.roofMask), puddleMask: orBlack(u.puddleMask),
    focus: { value: focus }, scatterHalf: { value: new THREE.Vector2(...WATER_FX.scatterHalf) },
    amounts: { value: new THREE.Vector3() },   // gutter flow, roof runoff (spouts, curtains, streams)
    drip: { value: 0 }, sparkOn: { value: 0 }, steam: { value: 0 },
    wind: { value: new THREE.Vector2(...look.wind) },
    water: colour(look.water), foam: colour(look.foam), steamColour: colour(look.steam), spark: colour(look.spark),
    bloodDeep: colour(look.bloodDeep), bloodPale: colour(look.bloodPale), bloodRim: colour(look.bloodRim),
    gains: { value: new THREE.Vector2(look.printGain, look.ringGain) },
  };
}
const pick = (all, names) => Object.fromEntries(names.map(n => [n, all[n]]));

// ---------------------------------------------------------------------------
// 1. Flat things on the street: rings, prints, blood in water, puddle ripples.
//
// One instance = one decal. Its four attribute groups:
//   aPlace  (x, z, rx, rz)       rx, rz > 0: a looping ripple that lands at a new spot inside that ellipse every cycle
//   aTime   (birth, life, kind, size)   life < 0: repeats every -life s; kind 0 ring, 1 print, 2 blood; size = half the quad
//   aExtra  (angle, strength, seed, pool)   pool 0 dry .. 1 standing water
//   aDrift  (vx, vz)             m/s the decal drifts (blood carried by a gutter)
const DECAL_VERTEX = `
attribute vec4 aPlace;
attribute vec4 aTime;
attribute vec4 aExtra;
attribute vec2 aDrift;
uniform float time;
uniform float rain;
${MASK_GLSL}${NOISE_GLSL}
varying vec2 vLocal;
varying vec4 vInfo;
varying float vSeed;
void main() {
  float life = abs(aTime.y);
  float age = time - aTime.x;
  float angle = aExtra.x;
  float pool = aExtra.w;
  float seed = aExtra.z;
  vec2 centre = aPlace.xy;
  float gate = 1.0;
  bool loops = aTime.y < 0.0;
  if (loops) {
    float c = age / life;
    float cycle = floor(c);
    age = (c - cycle) * life;
    float h1 = h11(seed + cycle * 7.13), h2 = h11(seed * 3.7 + cycle * 3.31), h3 = h11(seed * 1.7 + cycle * 5.17);
    float r = sqrt(h1), a = h2 * 6.2831853, ca = cos(angle), sa = sin(angle);
    vec2 l = vec2(cos(a), sin(a)) * r * aPlace.zw;
    centre += vec2(l.x * ca - l.y * sa, l.x * sa + l.y * ca);
    gate = step(h3, rain * 1.1);   // more of them land as the rain gets harder
    pool = 1.0;
    seed += cycle * 0.37;
    angle = h2 * 6.2831853;
  }
  float u = age / life;
  if (age < 0.0 || u >= 1.0 || gate < 0.5) { ${HIDDEN} }
  if (loops && texture2D(roofMask, maskUv(centre)).r > 0.5) { ${HIDDEN} }
  centre += aDrift * age;
  float size = aTime.w;
  vec2 q = position.xz * 2.0;
  float c = cos(angle), s = sin(angle);
  vLocal = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);   // the quad's point in the decal's own frame (x along its heading)
  vInfo = vec4(u, aTime.z, aExtra.y, pool);
  vSeed = seed;
  vec3 p = vec3(centre.x + q.x * size, ${WATER_LOOK.lift.toFixed(3)}, centre.y + q.y * size);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const DECAL_FRAGMENT = `
uniform vec3 water;
uniform vec3 bloodDeep;
uniform vec3 bloodPale;
uniform vec3 bloodRim;
uniform vec2 gains;
varying vec2 vLocal;
varying vec4 vInfo;
varying float vSeed;
void main() {
  float u = vInfo.x, kind = vInfo.y, k = vInfo.z, pool = vInfo.w;
  float d = length(vLocal);
  vec3 light = vec3(0.0);
  vec3 cover = vec3(0.0);
  float alpha = 0.0;
  if (kind < 0.5) {
    // A ring spreading out, with a fainter one trailing it. Sharp and bright
    // in standing water, soft and dull on wet asphalt.
    if (d > 1.0) discard;
    float r1 = 0.1 + 0.9 * (1.0 - pow(1.0 - u, 2.2));
    float w = mix(0.13, 0.065, pool);
    float b1 = 1.0 - smoothstep(0.0, w, abs(d - r1));
    float b2 = (1.0 - smoothstep(0.0, w * 1.3, abs(d - r1 * 0.66))) * 0.5 * smoothstep(0.08, 0.3, u);
    light = water * (b1 + b2) * pow(1.0 - u, 1.4) * k * mix(0.7, 1.25, pool) * gains.y;
  } else if (kind < 1.5) {
    // A wet sole: heel and ball, wet-bright, fading over its last half.
    float ball = length(vec2((vLocal.x - 0.34) / 0.52, vLocal.y / 0.33));
    float heel = length(vec2((vLocal.x + 0.52) / 0.33, vLocal.y / 0.25));
    float m = max(1.0 - smoothstep(0.7, 1.0, ball), 1.0 - smoothstep(0.7, 1.0, heel));
    light = water * m * smoothstep(0.0, 0.03, u) * (1.0 - smoothstep(0.5, 1.0, u)) * k * gains.x;
  } else {
    // Blood in water: a thin, uneven film that spreads, pales and fades.
    float th = atan(vLocal.y, vLocal.x);
    float wob = 1.0 + 0.14 * sin(th * 2.0 + vSeed * 40.0) + 0.1 * sin(th * 3.0 + vSeed * 17.0) + 0.07 * sin(th * 5.0 + vSeed * 29.0) + 0.04 * sin(th * 9.0 + vSeed * 11.0);
    float r = (0.3 + 0.7 * sqrt(u)) * wob;
    if (d > 1.0) discard;
    float body = 1.0 - smoothstep(r * 0.5, r, d);
    float rim = smoothstep(r * 0.6, r * 0.9, d) * (1.0 - smoothstep(r * 0.9, r, d));
    float thin = mix(0.6, 0.34, pool) * (1.0 - smoothstep(0.45, 1.0, u)) * k;
    vec3 colour = mix(bloodDeep, bloodPale, clamp(0.3 + pool * 0.45 + u * 0.35, 0.0, 1.0));
    alpha = body * thin;
    cover = colour * alpha;
    light = bloodRim * rim * thin * 0.35;
  }
  if (alpha + light.r + light.g + light.b < 0.004) discard;
  gl_FragColor = vec4(cover + light, alpha);
  ${FRAGMENT_TAIL}
}`;

// ---------------------------------------------------------------------------
// 2. Splash crowns: eight drops thrown up and out.
//
// Same attribute groups as the decals. kind: 0 a one-shot event (a step, a
// round), 1 a rain crown in a puddle (looping inside its ellipse), 2 a
// downspout's foot (looping, gated by the roof runoff), 3 rain on open
// ground round the camera (looping, wrapped round the focus like the rain).
const CROWN_VERTEX = `
attribute vec4 aPlace;
attribute vec4 aTime;
attribute vec4 aExtra;
uniform float time;
uniform float rain;
uniform vec3 amounts;
uniform vec3 focus;
uniform vec2 scatterHalf;
${MASK_GLSL}${NOISE_GLSL}${BILLBOARD_GLSL}
varying vec2 vQ;
varying float vAlpha;
void main() {
  float kind = aTime.z;
  float life = abs(aTime.y);
  float age = time - aTime.x;
  float seed = aExtra.z;
  float pool = aExtra.w;
  vec2 centre = aPlace.xy;
  float gate = 1.0;
  float fade = 1.0;
  float cycle = 0.0;
  if (aTime.y < 0.0) {
    float c = age / life;
    cycle = floor(c);
    age = (c - cycle) * life;
    float h1 = h11(seed + cycle * 7.13), h2 = h11(seed * 3.7 + cycle * 3.31), h3 = h11(seed * 1.7 + cycle * 5.17);
    if (kind < 1.5) {
      float r = sqrt(h1), a = h2 * 6.2831853, ca = cos(aExtra.x), sa = sin(aExtra.x);
      vec2 l = vec2(cos(a), sin(a)) * r * aPlace.zw;
      centre += vec2(l.x * ca - l.y * sa, l.x * sa + l.y * ca);
      gate = step(h3, rain * 1.1);
      pool = 1.0;
    } else if (kind < 2.5) {
      centre += (vec2(h1, h2) - 0.5) * 0.3;
      gate = step(h3, amounts.y);
    } else {
      vec2 box = scatterHalf * 2.0;
      vec2 xz = fract(aPlace.xy + cycle * vec2(0.6180339, 0.7548777)) * box;
      centre = focus.xz + mod(xz - focus.xz + scatterHalf, box) - scatterHalf;
      vec2 l = abs(centre - focus.xz) / scatterHalf;
      fade = 1.0 - smoothstep(0.8, 1.0, max(l.x, l.y));
      gate = step(h3, rain * 0.75);
      pool = texture2D(puddleMask, maskUv(centre)).r;
    }
    if (texture2D(roofMask, maskUv(centre)).r > 0.5) { ${HIDDEN} }
  }
  float u = age / life;
  if (age < 0.0 || u >= 1.0 || gate < 0.5) { ${HIDDEN} }
  float j = position.z;
  float angle = (j + h11(seed + j * 3.3)) * 0.7853982 + cycle * 2.399963;
  float size = aTime.w * (1.0 + 0.5 * pool);
  float strength = aExtra.y;
  float reach = size * (0.65 + 0.7 * h11(seed * 2.0 + j * 1.9)) * (0.2 + 0.8 * sqrt(u));
  float lift = size * strength * 1.4 * (0.55 + 0.8 * h11(seed + j * 5.1));
  float y = lift * 4.0 * u * (1.0 - u);
  vec3 p = vec3(centre.x + cos(angle) * reach, ${WATER_LOOK.lift.toFixed(3)} + y, centre.y + sin(angle) * reach);
  vec3 toCam = cameraPosition - p;
  float k = clamp(length(toCam) / 29.0, 0.7, 2.6);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  float vy = lift * 4.0 * (1.0 - 2.0 * u) / life;
  p += right * position.x * 0.032 * k + vec3(0.0, 1.0, 0.0) * position.y * (0.05 + 0.014 * min(abs(vy), 4.0)) * k;
  vQ = position.xy;
  vAlpha = strength * (1.0 - u) * fade * (0.55 + 0.45 * pool);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const CROWN_FRAGMENT = `
uniform vec3 water;
varying vec2 vQ;
varying float vAlpha;
void main() {
  float a = (1.0 - vQ.x * vQ.x) * (1.0 - vQ.y * vQ.y) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(water * 1.15, a);
  ${FRAGMENT_TAIL}
}`;

// ---------------------------------------------------------------------------
// 3. Running water on a static mesh: gutters, drain foam, downspouts, awning
// curtains and the streams that lead from a spout's foot.
//
// Attributes: uv (across 0..1, along or down in metres, always increasing the
// way the water goes), aInfo (kind, seed). kind 0 gutter, 1 drain (foam and a
// dark grate), 2 downspout, 3 curtain, 4 a stream on the ground from a spout.
// amounts.x (the gutters' flow) drives 0 and 1, amounts.y (the roofs' runoff)
// 2, 3 and 4. A kind with no water is hidden in the vertex shader.
const STREAM_VERTEX = `
attribute vec2 aInfo;
uniform vec3 amounts;
varying vec2 vUv;
varying vec3 vInfo;
void main() {
  float kind = aInfo.x;
  float amount = kind < 1.5 ? amounts.x : amounts.y;
  if (amount < 0.02) { ${HIDDEN} }
  vUv = uv;
  vInfo = vec3(kind, aInfo.y, amount);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const STREAM_FRAGMENT = `
uniform float time;
uniform vec3 water;
uniform vec3 foam;
varying vec2 vUv;
varying vec3 vInfo;
${NOISE_GLSL}
void main() {
  float kind = vInfo.x, seed = vInfo.y, amount = vInfo.z;
  float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
  vec3 light = vec3(0.0);
  float dark = 0.0;
  if (kind < 0.5 || kind > 3.5) {
    // A stream on the ground: three lanes, each a run of bright dashes
    // sliding the way it flows, over a faint sheet.
    float lane = floor(vUv.x * 3.0);
    float speed = 1.1 + 0.5 * h11(lane + seed);
    float p = fract(vUv.y * (0.7 + 0.2 * h11(lane * 3.1 + seed)) - time * speed + h11(lane * 7.1 + seed * 3.0));
    float dash = smoothstep(0.0, 0.2, p) * (1.0 - smoothstep(0.25, 0.7, p));
    float sheet = 0.07 + 0.3 * dash + 0.08 * dash * (0.5 + 0.5 * sin(vUv.y * 7.0 - time * 5.0 + vUv.x * 9.0));
    light = water * smoothstep(0.0, 0.5, across) * sheet * amount;
  } else if (kind < 1.5) {
    // A storm drain: a dark grate, and foam swirling into it.
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    float ang = atan(q.y, q.x);
    float f = (0.5 + 0.5 * sin(ang * 4.0 + r * 9.0 - time * 4.0 + seed * 6.0)) * (0.5 + 0.5 * sin(ang * 7.0 - r * 13.0 + time * 2.5 + seed * 3.0));
    float body = smoothstep(0.35, 0.9, f) * (1.0 - smoothstep(0.55, 1.0, r)) * smoothstep(0.12, 0.3, r);
    vec2 g = abs(q) / vec2(0.5, 0.26);
    float grate = (1.0 - smoothstep(0.85, 1.0, max(g.x, g.y))) * (0.55 + 0.45 * step(0.5, fract(q.x * 3.2)));
    light = foam * body * amount * 0.6;
    dark = grate * 0.55 * amount;
  } else if (kind < 2.5) {
    // A downspout: a thin stream, fast, in short bright lengths.
    float p = fract(vUv.y * 1.6 - time * 5.5 + seed);
    float run = smoothstep(0.0, 0.1, p) * (1.0 - smoothstep(0.4, 0.8, p));
    light = water * smoothstep(0.0, 0.6, across) * (0.35 + 0.65 * run) * amount * 0.65;
  } else {
    // A curtain off an awning's edge: strands, each at its own speed.
    float strand = floor(vUv.x * 7.0);
    float local = fract(vUv.x * 7.0);
    float speed = 3.2 + 2.2 * h11(strand + seed);
    float p = fract(vUv.y * 0.9 - time * speed * 0.35 + h11(strand * 5.3 + seed));
    float dash = smoothstep(0.0, 0.08, p) * (1.0 - smoothstep(0.25, 0.6, p));
    float thin = 1.0 - smoothstep(0.25, 0.5, abs(local - 0.5) + 0.2 * h11(strand + 2.0));
    light = water * dash * thin * amount * 0.4;
  }
  if (light.r + light.g + light.b + dark < 0.006) discard;
  gl_FragColor = vec4(light, dark);
  ${FRAGMENT_TAIL}
}`;

// ---------------------------------------------------------------------------
// 4. Things that fall: drips off ledges and signs, and sparks.
//
// One instance per drip source or spark. Each instance has three parts (the
// third coordinate of `position`): 0 the falling streak, 1 the ring or flash
// where it lands, 2 (sparks in water only) the wisp of steam that rises from
// the landing.
//   aOrigin (x, y, z, seed)
//   aMotion (kind, period, threshold, 0)   kind 0 drip (threshold: it drips while the drip amount is above it; 9 = an unused slot), 1 spark (threshold: the share of cycles that crackle)
const DROP_VERTEX = `
attribute vec4 aOrigin;
attribute vec4 aMotion;
uniform float time;
uniform float drip;
uniform float sparkOn;
uniform float wetness;
${MASK_GLSL}${NOISE_GLSL}${BILLBOARD_GLSL}
varying vec2 vQ;
varying vec4 vInfo;
varying float vKind;
const float G = 9.8;
void main() {
  float kind = aMotion.x;
  bool spark = kind > 0.5;
  float seed = aOrigin.w;
  float part = position.z;
  if (spark ? sparkOn < 0.5 : drip <= aMotion.z) { ${HIDDEN} }
  vec3 origin = aOrigin.xyz;
  float fallT = sqrt(2.0 * origin.y / G);
  float period = spark ? aMotion.y : max(aMotion.y * mix(1.5, 0.7, drip), fallT + 0.8);
  float c = time / period + seed * 13.0;
  float cycle = floor(c);
  float tt = (c - cycle) * period;
  float h1 = h11(seed + cycle * 3.7), h2 = h11(seed * 2.3 + cycle * 1.9), h3 = h11(seed * 4.1 + cycle * 6.3), h4 = h11(seed * 7.7 + cycle * 2.9);
  vec3 vel = vec3(0.0);
  float landT = fallT;
  if (spark) {
    if (h4 > aMotion.z) { ${HIDDEN} }
    float a = h1 * 6.2831853, s = 0.7 + 1.9 * h2, up = 1.4 + 2.6 * h3;
    vel = vec3(cos(a) * s, up, sin(a) * s);
    landT = (up + sqrt(up * up + 2.0 * G * origin.y)) / G;
  }
  vec2 land = origin.xz + vel.xz * landT;
  vec2 lu = maskUv(land);
  float roof = texture2D(roofMask, lu).r;
  float pool = texture2D(puddleMask, lu).r;
  float sizzle = spark ? clamp(max(pool, wetness * (1.0 - roof)), 0.0, 1.0) : pool;
  vec3 pos;
  float u = 0.0;
  float alpha = 1.0;
  if (part < 0.5) {
    if (tt > landT) { ${HIDDEN} }
    vec3 v = vel + vec3(0.0, -G * tt, 0.0);
    vec3 head = origin + vel * tt + vec3(0.0, -0.5 * G * tt * tt, 0.0);
    pos = mix(head, head - v * (spark ? 0.045 : 0.018), position.y * 0.5 + 0.5);
    float k = clamp(distance(cameraPosition, pos) / 29.0, 0.7, 2.6);
    pos += normalize(cross(v, cameraPosition - pos)) * position.x * (spark ? 0.02 : 0.016) * k;
    u = tt / landT;
    alpha = spark ? 1.0 : 0.8;
  } else if (part < 1.5) {
    float a = tt - landT;
    float span = spark ? 0.4 : 0.55;
    // (No landing rings under a roof: the same mask the other pieces here use.)
    if (a < 0.0 || a > span || roof > 0.5) { ${HIDDEN} }
    u = a / span;
    float radius = spark ? mix(0.1, 0.34, sizzle) : 0.22;
    pos = vec3(land.x + position.x * radius, ${WATER_LOOK.lift.toFixed(3)}, land.y + position.y * radius);
  } else {
    float a = tt - landT;
    if (!spark || sizzle < 0.15 || a < 0.0 || a > 1.0) { ${HIDDEN} }
    u = a;
    alpha = sizzle;
    vec3 centre = vec3(land.x + 0.1 * sin(seed * 20.0 + a * 3.0), 0.06 + 0.7 * a, land.y);
    pos = centre + (camRight() * position.x + camUp() * position.y) * (0.08 + 0.22 * a);
  }
  vQ = position.xy;
  vInfo = vec4(part, u, alpha, sizzle);
  vKind = kind;
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}`;

const DROP_FRAGMENT = `
uniform vec3 water;
uniform vec3 spark;
varying vec2 vQ;
varying vec4 vInfo;
varying float vKind;
void main() {
  float part = vInfo.x, u = vInfo.y, al = vInfo.z, sizzle = vInfo.w;
  bool isSpark = vKind > 0.5;
  vec3 rgb = isSpark ? spark * 2.2 : water * 0.9;
  float a;
  if (part < 0.5) {
    a = (1.0 - vQ.x * vQ.x) * (1.0 - 0.6 * (vQ.y * 0.5 + 0.5)) * al * (isSpark ? 1.0 : 0.6);
  } else if (part < 1.5) {
    float d = length(vQ);
    if (d > 1.0) discard;
    if (isSpark) {
      // A flash where it lands, and in water a ring that sizzles outward.
      float core = (1.0 - d) * (1.0 - d) * pow(1.0 - u, 1.5);
      float ring = sizzle * (1.0 - smoothstep(0.0, 0.14, abs(d - (0.25 + 0.7 * u)))) * (1.0 - u);
      a = core * 0.8 + ring * 0.5;
    } else {
      a = (1.0 - smoothstep(0.0, 0.16, abs(d - (0.2 + 0.8 * u)))) * (1.0 - u) * 0.55;
    }
  } else {
    float d = length(vQ);
    if (d > 1.0) discard;
    rgb = vec3(0.75, 0.8, 0.88);
    a = (1.0 - d) * (1.0 - d) * (1.0 - u) * 0.16 * al;
  }
  if (a < 0.01) discard;
  gl_FragColor = vec4(rgb, a);
  ${FRAGMENT_TAIL}
}`;

// ---------------------------------------------------------------------------
// 5. Steam on the hot things: soft grey puffs that rise, widen and thin out.
//   aOrigin (x, y, z, seed)     aMotion (period, size, drift, strength)
const STEAM_VERTEX = `
attribute vec4 aOrigin;
attribute vec4 aMotion;
uniform float time;
uniform float steam;
uniform vec2 wind;
${NOISE_GLSL}${BILLBOARD_GLSL}
varying vec2 vQ;
varying float vAlpha;
varying float vSeed;
void main() {
  float seed = aOrigin.w;
  float c = time / aMotion.x + seed * 7.0;
  float cycle = floor(c);
  float u = c - cycle;
  float rise = u * (1.1 + 0.9 * h11(seed + cycle * 2.3));
  vec3 p = aOrigin.xyz + vec3(wind.x * rise * 1.5 + sin(u * 5.0 + seed * 9.0) * aMotion.z, rise, wind.y * rise * 1.5 + cos(u * 4.0 + seed * 5.0) * aMotion.z);
  float size = aMotion.y * (0.45 + 1.6 * u);
  p += (camRight() * position.x + camUp() * position.y) * size;
  vQ = position.xy;
  vSeed = seed + cycle * 0.31;
  vAlpha = aMotion.w * steam * smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.35, 1.0, u));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const STEAM_FRAGMENT = `
uniform vec3 steamColour;
varying vec2 vQ;
varying float vAlpha;
varying float vSeed;
void main() {
  float d = length(vQ);
  if (d > 1.0) discard;
  float body = (1.0 - d) * (1.0 - d);
  float n = 0.5 + 0.5 * sin(vQ.x * 5.0 + vSeed * 37.0) * sin(vQ.y * 4.3 + vSeed * 23.0);
  float a = body * mix(0.55, 1.0, n) * vAlpha * 0.42;
  if (a < 0.004) discard;
  gl_FragColor = vec4(steamColour * a, a);
  ${FRAGMENT_TAIL}
}`;

// ---------------------------------------------------------------------------
// Geometry.

const LAYOUT = Object.freeze({
  decal: Object.freeze({ aPlace: 4, aTime: 4, aExtra: 4, aDrift: 2 }),
  crown: Object.freeze({ aPlace: 4, aTime: 4, aExtra: 4 }),
  fall: Object.freeze({ aOrigin: 4, aMotion: 4 }),
});
const NEVER = -1e9;   // a slot's birth when unused: its age is enormous, so the shader hides it

// A template's geometry made instanced, with attribute arrays for `count`
// instances (allocated once, here).
function instanced(template, count, layout) {
  const geometry = new THREE.InstancedBufferGeometry(), attrs = {};
  geometry.setIndex(template.index);
  geometry.setAttribute('position', template.getAttribute('position'));
  for (const [name, size] of Object.entries(layout)) {
    // (At least one instance's worth: a zero-length buffer bound to a draw is an error.)
    const attribute = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * size), size);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, attribute); attrs[name] = attribute;
  }
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); // placed on the GPU: never culled
  return { geometry, attrs };
}

function quadTemplate({ flat = false, part = 0 } = {}) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(flat ? [-.5, 0, -.5, .5, 0, -.5, .5, 0, .5, -.5, 0, .5] : [-1, -1, part, 1, -1, part, 1, 1, part, -1, 1, part]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

// Eight drops, each a quad whose third coordinate is its number.
function crownTemplate() {
  const position = [], index = [];
  for (let j = 0; j < 8; j++) {
    position.push(-1, -1, j, 1, -1, j, 1, 1, j, -1, 1, j);
    index.push(j * 4, j * 4 + 1, j * 4 + 2, j * 4, j * 4 + 2, j * 4 + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(position), 3));
  geometry.setIndex(index);
  return geometry;
}

// A falling drop's three parts (streak, landing, wisp) in one template.
function fallTemplate() {
  const position = [], index = [];
  for (let part = 0; part < 3; part++) {
    position.push(-1, -1, part, 1, -1, part, 1, 1, part, -1, 1, part);
    index.push(part * 4, part * 4 + 1, part * 4 + 2, part * 4, part * 4 + 2, part * 4 + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(position), 3));
  geometry.setIndex(index);
  return geometry;
}

const hash01 = n => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

// The gutters, drains, spouts, streams and curtains as one static mesh, the
// base (everything but the curtains) first so a preset without curtains
// draws a shorter index range.
export function buildStreams(places, outdoors, spec = WATER_PLACES) {
  const position = [], uv = [], info = [], index = [];
  const quad = (corners, uvs, kind, seed) => {
    const at = position.length / 3;
    for (let i = 0; i < 4; i++) { position.push(...corners[i]); uv.push(...uvs[i]); info.push(kind, seed); }
    index.push(at, at + 1, at + 2, at, at + 2, at + 3);
  };
  const y = WATER_LOOK.gutterLift, half = spec.gutterWidth / 2;
  places.pieces.forEach((p, i) => {
    const dx = p.x1 - p.x0, dz = p.z1 - p.z0, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, nx = -uz * half, nz = ux * half;
    quad([[p.x0 - nx, y, p.z0 - nz], [p.x0 + nx, y, p.z0 + nz], [p.x1 + nx, y, p.z1 + nz], [p.x1 - nx, y, p.z1 - nz]], [[0, 0], [1, 0], [1, len], [0, len]], 0, hash01(i + 1));
  });
  places.drains.forEach((d, i) => {
    const s = spec.drainSize, ax = (d.ux ?? 1) * s, az = (d.uz ?? 0) * s, bx = -(d.uz ?? 0) * s * .8, bz = (d.ux ?? 1) * s * .8;
    quad([[d.x - ax - bx, y + .002, d.z - az - bz], [d.x + ax - bx, y + .002, d.z + az - bz], [d.x + ax + bx, y + .002, d.z + az + bz], [d.x - ax + bx, y + .002, d.z - az + bz]], [[0, 0], [1, 0], [1, 1], [0, 1]], 1, hash01(i + 101));
  });
  const streams = [];
  places.spouts.forEach((s, i) => {
    const w = .09, top = s.top, seed = hash01(i + 201);
    // Two crossed sheets, so it reads from any side.
    quad([[s.x - w, top, s.z], [s.x + w, top, s.z], [s.x + w, .04, s.z], [s.x - w, .04, s.z]], [[0, 0], [1, 0], [1, top], [0, top]], 2, seed);
    quad([[s.x, top, s.z - w], [s.x, top, s.z + w], [s.x, .04, s.z + w], [s.x, .04, s.z - w]], [[0, 0], [1, 0], [1, top], [0, top]], 2, seed + .5);
    // The stream from its foot: to the nearest gutter, else straight out.
    const found = nearestGutter(places.pieces, s.x, s.z, 6);
    let dx = s.nx, dz = s.nz, length = 2;
    if (found) { const to = Math.hypot(found[0] - s.x, found[1] - s.z); if (to > .3) { dx = (found[0] - s.x) / to; dz = (found[1] - s.z) / to; length = Math.min(to, spec.spoutRunoff); } }
    else { const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n; }
    if (outdoors(s.x + dx * length, s.z + dz * length, .3) && outdoors(s.x + dx * length / 2, s.z + dz * length / 2, .3)) streams.push([s, dx, dz, length, seed]);
  });
  for (const [s, dx, dz, length, seed] of streams) {
    const hw = .15, nx = -dz * hw, nz = dx * hw, yy = y + .002;
    quad([[s.x - nx, yy, s.z - nz], [s.x + nx, yy, s.z + nz], [s.x + dx * length + nx, yy, s.z + dz * length + nz], [s.x + dx * length - nx, yy, s.z + dz * length - nz]], [[0, 0], [1, 0], [1, length], [0, length]], 4, seed);
  }
  const base = index.length;
  places.awnings.forEach((a, i) => {
    const len = Math.hypot(a.x1 - a.x0, a.z1 - a.z0);
    quad([[a.x0, a.y, a.z0], [a.x1, a.y, a.z1], [a.x1, .02, a.z1], [a.x0, .02, a.z0]], [[0, 0], [len, 0], [len, a.y], [0, a.y]], 3, hash01(i + 301));
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(position), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geometry.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(info), 2));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(index), 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return { geometry, baseIndexCount: base, indexCount: index.length };
}

// A pool's slots are used in turn and the oldest is overwritten: a ring
// buffer over [start, start + size).
class Ring {
  constructor() { this.start = 0; this.size = 0; this.head = 0; }
  set(start, size) { this.start = start; this.size = size; this.head = 0; }
  next() { const i = this.start + this.head; this.head = (this.head + 1) % this.size; return i; }
}

// ---------------------------------------------------------------------------

export class WaterSystem {
  constructor(view, map, city) {
    this.view = view; this.map = map; this.city = city;
    this.quality = view.qualityName || 'balanced';
    this.spec = WATER.presets[this.quality] ?? WATER.presets.balanced;
    this.rainSpec = city.rain?.spec ?? RAIN;
    this.raining = map.city?.rain !== false;
    this.focus = new THREE.Vector3().copy(view.focus || new THREE.Vector3());
    this.places = waterPlaces(map);
    this.outdoors = outdoorsTest(map);
    this.drains = this.places.drains;
    this.roofShapes = [...(map.buildings || []), ...(map.solids || [])]; this.spot = { x: 0, z: 0 };
    this.setUpMasks();

    const uniforms = this.uniforms = makeUniforms(city, this.focus);
    // The five meshes and their materials, made once. (A lower preset uses
    // fewer instances of the same shaders; nothing is built later.)
    const decal = this.decal = instanced(quadTemplate({ flat: true }), MAX('rings') + MAX('prints') + MAX('stains') + MAX('ponds'), LAYOUT.decal);
    const spoutFeet = this.places.spouts.length * MAX('spoutSplashes');
    const crown = this.crown = instanced(crownTemplate(), MAX('splashes') + spoutFeet + MAX('puddleCrowns') + MAX('scatterCrowns'), LAYOUT.crown);
    this.sourceMax = WATER_PLACES.sourceCap + 160;
    this.sparkSpots = this.places.sparks, this.steamSpots = this.places.steam;
    const fall = this.fall = instanced(fallTemplate(), MAX('drips') + this.sparkSpots.length * MAX('sparks'), LAYOUT.fall);
    const steam = this.steam = instanced(quadTemplate(), this.steamSpots.length * MAX('puffs'), LAYOUT.fall);
    const streams = this.streams = buildStreams(this.places, this.outdoors);
    this.decalList = Object.values(decal.attrs); this.crownList = Object.values(crown.attrs); // (listed once: a frame with events walks these, and makes no array)

    const decalMaterial = premultiplied(pick(uniforms, ['time', 'rain', 'roofMask', 'puddleMask', 'maskBounds', 'water', 'bloodDeep', 'bloodPale', 'bloodRim', 'gains']), DECAL_VERTEX, DECAL_FRAGMENT, 'lumen-water-decals');
    const crownMaterial = additive(pick(uniforms, ['time', 'rain', 'amounts', 'focus', 'scatterHalf', 'roofMask', 'puddleMask', 'maskBounds', 'water']), CROWN_VERTEX, CROWN_FRAGMENT, 'lumen-water-crowns');
    const streamMaterial = premultiplied(pick(uniforms, ['time', 'amounts', 'water', 'foam']), STREAM_VERTEX, STREAM_FRAGMENT, 'lumen-water-streams');
    const dropMaterial = additive(pick(uniforms, ['time', 'drip', 'sparkOn', 'wetness', 'roofMask', 'puddleMask', 'maskBounds', 'water', 'spark']), DROP_VERTEX, DROP_FRAGMENT, 'lumen-water-drops');
    const steamMaterial = premultiplied(pick(uniforms, ['time', 'steam', 'wind', 'steamColour']), STEAM_VERTEX, STEAM_FRAGMENT, 'lumen-water-steam');
    this.materials = [decalMaterial, crownMaterial, streamMaterial, dropMaterial, steamMaterial];

    const mesh = (geometry, material, name, order) => {
      const m = new THREE.Mesh(geometry, material);
      m.frustumCulled = false; m.renderOrder = order; m.name = name; m.visible = false; m.castShadow = false; m.receiveShadow = false;
      view.scene?.add(m); return m;
    };
    this.decalMesh = mesh(decal.geometry, decalMaterial, 'lumen-water-decals', 3);
    this.crownMesh = mesh(crown.geometry, crownMaterial, 'lumen-water-crowns', 3);
    this.streamMesh = mesh(streams.geometry, streamMaterial, 'lumen-water-streams', 2);
    this.fallMesh = mesh(fall.geometry, dropMaterial, 'lumen-water-drops', 3);
    this.steamMesh = mesh(steam.geometry, steamMaterial, 'lumen-water-steam', 4);
    // Flat things lie on the ground layer (never drawn into the mirror); the
    // sparks are on the bright layer too, so Quality's mirror reflects them.
    this.decalMesh.layers.set(GROUND_LAYER); this.streamMesh.layers.set(GROUND_LAYER);
    this.fallMesh.layers.enable(BRIGHT_LAYER);

    // Ring buffers over the pools' slots.
    this.rings = new Ring(); this.prints = new Ring(); this.stains = new Ring(); this.splashes = new Ring();
    this.printLog = { x: new Float32Array(24), z: new Float32Array(24), t: new Float32Array(24), head: 0 };
    this.parity = 0; this.random = 0x9e3779b9;
    this.decalsUntil = 0; this.crownsUntil = 0; this.dirtyDecals = false; this.dirtyCrowns = false;
    // Drip sources: the map's ledges, then the signs' (added when they exist).
    const ledges = this.places.ledges;
    this.sources = new Float32Array(this.sourceMax * 4); this.sources.set(ledges); this.sourceCount = ledges.length / 4;
    this.mapSources = this.sourceCount; this.emitterCount = -1;
    this.picked = new Int32Array(MAX('drips')); this.pickedD = new Float32Array(MAX('drips')); this.pickedCount = 0;
    this.lastPick = { x: 1e9, z: 1e9, t: -1e9 };
    this.shownDrips = 0; this.sparksNear = false; this.steamNear = false;
    this.streamsOn = false; this.state = { flow: 0, runoff: 0, drip: 0, steam: 0 };
    this.warming = false;
    this.setQuality(this.quality);
  }

  // The rain's masks: shared with the rain system when it is there (it made
  // them from the same map), else made here (a test, or a map with the rain off).
  setUpMasks() {
    const rain = this.city.rain, u = this.city.uniforms;
    if (rain?.roofData && rain?.puddleData) {
      this.bounds = rain.bounds; this.roofData = rain.roofData; this.puddleData = rain.puddleData; this.puddles = rain.puddles; this.ownMasks = false;
      return;
    }
    this.bounds = maskBounds(this.map);
    this.roofData = buildRoofMask(this.map, this.bounds);
    this.puddles = this.map.city?.puddles ?? seededPuddles(this.map);
    this.puddleData = buildPuddleMask(this.puddles, this.bounds, this.roofData);
    this.ownMasks = true;
    if (!u.roofMask.value) { u.maskBounds.value.set(this.bounds.x0, this.bounds.z0, this.bounds.x1, this.bounds.z1); u.roofMask.value = this.roofTexture = maskTexture(this.roofData, this.bounds); }
    if (!u.puddleMask.value) u.puddleMask.value = this.puddleTexture = maskTexture(this.puddleData, this.bounds);
  }

  roofAt(x, z) { return maskValue(this.roofData, this.bounds, x, z); }
  poolAt(x, z) { return maskValue(this.puddleData, this.bounds, x, z); }

  // Under a roof, in a room or in a sealed mass? The roof mask decides
  // (half-metre texels, the same one the wet ground uses); within half a
  // metre of a wall the shapes themselves are asked, so a doorstep is right.
  indoors(x, z) {
    if (this.roofAt(x, z) >= .5) return true;
    const t = this.bounds.texel;
    if (this.roofAt(x + t, z) < .5 && this.roofAt(x - t, z) < .5 && this.roofAt(x, z + t) < .5 && this.roofAt(x, z - t) < .5) return false;
    const spot = this.spot; spot.x = x; spot.z = z;
    for (const shape of this.roofShapes) if (buildingContains(shape, spot)) return true;
    return false;
  }

  // Does water show at this spot: open air that is wet or has standing water?
  // The view asks it to throw a splash where a round lands instead of dust.
  wetAt(x, z) { return this.water(x, z); }
  // Sets this.pool as a side effect (the puddle mask at the spot).
  water(x, z) {
    if (this.indoors(x, z)) return false;
    this.pool = this.poolAt(x, z);
    return this.pool > WATER_FX.poolMin || this.city.uniforms.wetness.value > WATER_FX.wetMin;
  }

  // ------------------------------------------------------------- presets

  setQuality(name) {
    this.quality = name;
    const s = this.spec = WATER.presets[name] ?? WATER.presets.balanced;
    // Decal slots: [rings][prints][stains][ponds]; crowns: [splashes][spout feet][puddle crowns][scatter].
    const d = this.decal.attrs, c = this.crown.attrs;
    let at = 0;
    this.rings.set(at, s.rings); at += s.rings;
    this.prints.set(at, s.prints); at += s.prints;
    this.stains.set(at, s.stains); at += s.stains;
    for (let i = 0; i < at; i++) this.clearDecal(i);
    this.pondCount = this.writePonds(at, s.ponds);
    this.decalCount = at + this.pondCount;
    this.decal.geometry.instanceCount = this.decalCount;

    at = 0;
    this.splashes.set(at, s.splashes); at += s.splashes;
    for (let i = 0; i < at; i++) this.clearCrown(i);
    const feet = this.places.spouts.length * s.spoutSplashes;
    this.writeFeet(at, feet); at += feet;
    this.writePuddleCrowns(at, s.puddleCrowns); at += s.puddleCrowns;
    this.writeScatter(at, s.scatterCrowns); at += s.scatterCrowns;
    this.crownCount = at; this.crownLoops = at - s.splashes;
    this.crown.geometry.instanceCount = this.crownCount;
    this.dirtyDecals = this.dirtyCrowns = true;
    for (const a of Object.values(d)) a.needsUpdate = true;
    for (const a of Object.values(c)) a.needsUpdate = true;

    this.streamsOn = s.gutters;
    this.streams.geometry.setDrawRange(0, s.curtains ? this.streams.indexCount : this.streams.baseIndexCount);
    this.writeSteam(); this.writeSparks();
    this.uniforms.sparkOn.value = s.sparks > 0 ? 1 : 0;
    this.pickedCount = 0; this.lastPick.t = -1e9; this.emitterCount = -1;
    this.clearDrips();
    this.decalsUntil = this.crownsUntil = 0;
  }

  clearDecal(i) {
    const a = this.decal.attrs;
    a.aTime.array.fill(0, i * 4, i * 4 + 4); a.aTime.array[i * 4] = NEVER; a.aTime.array[i * 4 + 1] = 1;
  }
  clearCrown(i) {
    const a = this.crown.attrs;
    a.aTime.array.fill(0, i * 4, i * 4 + 4); a.aTime.array[i * 4] = NEVER; a.aTime.array[i * 4 + 1] = 1;
  }

  // Ripples in the standing puddles, shared out by area: at least one per
  // puddle, each landing at a new spot inside the puddle every 1.1-1.9 s.
  writePonds(start, count) {
    const a = this.decal.attrs, puddles = this.puddles;
    if (!count || !puddles.length) return 0;
    const areas = puddles.map(p => p.rx * p.rz), total = areas.reduce((x, y) => x + y, 0);
    let k = 0;
    puddles.forEach((p, pi) => {
      const n = Math.max(1, Math.round(count * areas[pi] / total));
      for (let i = 0; i < n && k < count; i++, k++) {
        const slot = start + k, r = hash01(pi * 31 + i + 1), life = 1.1 + .8 * hash01(pi * 17 + i * 5 + 2);
        a.aPlace.array.set([p.x, p.z, p.rx * .92, p.rz * .92], slot * 4);
        a.aTime.array.set([r * life, -life, 0, .3 + .16 * hash01(pi + i * 3)], slot * 4);
        a.aExtra.array.set([p.angle || 0, .5 + .3 * hash01(pi * 7 + i), hash01(pi * 13 + i * 3 + 5) * 50, 1], slot * 4);
        a.aDrift.array.set([0, 0], slot * 2);
      }
    });
    return k;
  }

  writeFeet(start, count) {
    const a = this.crown.attrs, spouts = this.places.spouts, per = this.spec.spoutSplashes;
    let k = 0;
    spouts.forEach((s, si) => {
      for (let i = 0; i < per && k < count; i++, k++) {
        const slot = start + k, life = .5 + .2 * hash01(si * 5 + i);
        a.aPlace.array.set([s.x, s.z, 0, 0], slot * 4);
        a.aTime.array.set([hash01(si * 3 + i * 11) * life, -life, 2, .3], slot * 4);
        a.aExtra.array.set([0, .8, hash01(si * 19 + i * 7 + 1) * 50, 0], slot * 4);
      }
    });
  }

  writePuddleCrowns(start, count) {
    const a = this.crown.attrs, puddles = this.puddles;
    if (!count || !puddles.length) return;
    const areas = puddles.map(p => p.rx * p.rz), total = areas.reduce((x, y) => x + y, 0);
    let k = 0;
    puddles.forEach((p, pi) => {
      const n = Math.max(1, Math.round(count * areas[pi] / total));
      for (let i = 0; i < n && k < count; i++, k++) {
        const slot = start + k, life = .55 + .25 * hash01(pi * 9 + i);
        a.aPlace.array.set([p.x, p.z, p.rx * .85, p.rz * .85], slot * 4);
        a.aTime.array.set([hash01(pi * 23 + i * 7) * life, -life, 1, .26], slot * 4);
        a.aExtra.array.set([p.angle || 0, .9, hash01(pi * 41 + i * 13 + 3) * 50, 1], slot * 4);
      }
    });
    for (; k < count; k++) this.clearCrown(start + k);
  }

  writeScatter(start, count) {
    const a = this.crown.attrs;
    for (let k = 0; k < count; k++) {
      const slot = start + k, life = .45 + .2 * hash01(k * 3 + 1);
      a.aPlace.array.set([hash01(k * 2 + 1), hash01(k * 2 + 2), 0, 0], slot * 4);
      a.aTime.array.set([hash01(k + 77) * life, -life, 3, .2], slot * 4);
      a.aExtra.array.set([0, .85, hash01(k * 5 + 9) * 50, 0], slot * 4);
    }
  }

  writeSteam() {
    const a = this.steam.attrs, per = this.spec.puffs;
    let k = 0;
    this.steamSpots.forEach((s, si) => {
      for (let i = 0; i < per; i++, k++) {
        a.aOrigin.array.set([s.x, s.y, s.z, (i + hash01(si * 7 + i)) / per], k * 4);
        a.aMotion.array.set([2.6 + 1.2 * hash01(si + i * 3), .34 + .18 * (s.strength ?? 1), .08, .55 + .45 * (s.strength ?? 1)], k * 4);
      }
    });
    this.steamCount = k; this.steam.geometry.instanceCount = k;
    for (const attribute of Object.values(a)) attribute.needsUpdate = true;
  }

  // Drip slots first, then the sparks.
  writeSparks() {
    const a = this.fall.attrs, per = this.spec.sparks, start = this.spec.drips;
    let k = 0;
    this.sparkSpots.forEach((s, si) => {
      for (let i = 0; i < per; i++, k++) {
        a.aOrigin.array.set([s.x, s.y, s.z, (i + hash01(si * 11 + i)) / per], (start + k) * 4);
        a.aMotion.array.set([1, 1.3 + 1.5 * hash01(si * 5 + i * 3), .8, 0], (start + k) * 4);
      }
    });
    this.sparkCount = k;
    for (const attribute of Object.values(a)) attribute.needsUpdate = true;
  }

  clearDrips() {
    const a = this.fall.attrs;
    for (let i = 0; i < this.spec.drips; i++) a.aMotion.array.set([0, 2, 9, 0], i * 4);
    this.shownDrips = 0; a.aMotion.needsUpdate = true;
    this.fall.geometry.instanceCount = 0;
  }

  // ------------------------------------------------------------- events

  rand() { // xorshift32: 0 .. 1, no allocation
    let x = this.random; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.random = x >>> 0;
    return this.random / 4294967296;
  }
  now() { return this.uniforms.time.value; }

  // Write one decal into `ring`'s next slot. Returns its index, or -1 when the preset has none.
  putDecal(ring, x, z, birth, life, kind, size, angle, strength, pool, vx = 0, vz = 0) {
    if (!ring.size) return -1;
    const i = ring.next(), a = this.decal.attrs, o = i * 4;
    const place = a.aPlace.array, time = a.aTime.array, extra = a.aExtra.array;
    place[o] = x; place[o + 1] = z; place[o + 2] = 0; place[o + 3] = 0;
    time[o] = birth; time[o + 1] = life; time[o + 2] = kind; time[o + 3] = size;
    extra[o] = angle; extra[o + 1] = strength; extra[o + 2] = this.rand() * 50; extra[o + 3] = pool;
    a.aDrift.array[i * 2] = vx; a.aDrift.array[i * 2 + 1] = vz;
    this.dirtyDecals = true;
    const end = birth + life;
    if (end > this.decalsUntil) this.decalsUntil = end;
    return i;
  }
  putCrown(x, z, birth, size, strength, pool) {
    const ring = this.splashes;
    if (!ring.size) return;
    const i = ring.next(), a = this.crown.attrs, o = i * 4, life = .55;
    a.aPlace.array[o] = x; a.aPlace.array[o + 1] = z; a.aPlace.array[o + 2] = 0; a.aPlace.array[o + 3] = 0;
    a.aTime.array[o] = birth; a.aTime.array[o + 1] = life; a.aTime.array[o + 2] = 0; a.aTime.array[o + 3] = size;
    a.aExtra.array[o] = 0; a.aExtra.array[o + 1] = strength; a.aExtra.array[o + 2] = this.rand() * 50; a.aExtra.array[o + 3] = pool;
    this.dirtyCrowns = true;
    if (birth + life > this.crownsUntil) this.crownsUntil = birth + life;
  }

  // A footfall. On wet ground or in a puddle: a ring, a spray, and (on
  // wet ground, not in the middle of a puddle) a wet print that stays ~4 s.
  // Potato has the spray only (design 10b).
  onStep(x, z, speed = 1, strong = false) {
    if (!this.water(x, z)) return;
    const s = this.spec, F = WATER_FX, pool = this.pool, now = this.now();
    const power = Math.min(1.3, Math.max(.35, speed / F.speedRef));
    const inPool = pool > F.poolMin;
    if (s.splashes && (s.rings === 0 || strong || inPool)) this.putCrown(x, z, now, strong ? .62 : .2 + .1 * power, strong ? 1 : .55 + .3 * power, pool);
    if (s.rings) {
      const size = strong ? F.strongSize : (inPool ? F.ringSizePool : F.ringSize) * (.8 + .3 * power);
      this.putDecal(this.rings, x, z, now, strong ? F.strongLife : inPool ? F.ringLifePool : F.ringLife, 0, size, 0, strong ? 1 : .55 + .35 * power, pool);
    }
    if (s.prints && pool < F.printMaxPool && this.city.uniforms.wetness.value > F.wetMin) this.putPrint(x, z, now);
  }

  // A wet sole. Its heading comes from the last print close by and just
  // before (the sim tells us where a foot fell, not which way it walks);
  // alternate feet sit either side of the walking line.
  putPrint(x, z, now) {
    const F = WATER_FX, log = this.printLog;
    let angle = NaN;
    for (let n = 1; n <= log.x.length; n++) {
      const k = (log.head - n + log.x.length * 2) % log.x.length;
      if (now - log.t[k] > F.printJoinTime) break;
      if (log.t[k] > 0 && Math.hypot(x - log.x[k], z - log.z[k]) < F.printJoin && Math.hypot(x - log.x[k], z - log.z[k]) > .05) { angle = Math.atan2(z - log.z[k], x - log.x[k]); break; }
    }
    const known = !Number.isNaN(angle);
    if (!known) angle = this.rand() * Math.PI * 2;
    this.parity ^= 1;
    const side = known ? (this.parity ? 1 : -1) * F.printSide : 0;
    const px = x - Math.sin(angle) * side, pz = z + Math.cos(angle) * side;
    this.putDecal(this.prints, px, pz, now, F.printLife, 1, F.printSize, angle, 1, 0);
    log.x[log.head] = x; log.z[log.head] = z; log.t[log.head] = now; log.head = (log.head + 1) % log.x.length;
  }

  // A round or a blast meeting the ground: a splash and rings where there is
  // water (and, for the view, no dust: wetAt tells it).
  onImpact(x, z, kind = 'round') {
    if (!this.water(x, z)) return;
    const s = this.spec, F = WATER_FX, pool = this.pool, now = this.now();
    if (kind === 'blast') {
      if (s.rings) {
        this.putDecal(this.rings, x, z, now, F.blastLife, 0, F.blastSize, 0, 1.1, pool);
        this.putDecal(this.rings, x, z, now + .12, F.blastLife, 0, F.blastSize * .6, 0, .9, pool);
      }
      if (s.splashes) { this.putCrown(x, z, now, 1.6, 1.2, pool); this.putCrown(x, z, now + .05, 1.0, 1, pool); this.putCrown(x, z, now + .1, 2.1, .9, pool); }
      return;
    }
    if (s.splashes) this.putCrown(x, z, now, F.impactSize * (.8 + .4 * pool), .9, pool);
    if (s.rings) this.putDecal(this.rings, x, z, now, F.impactLife, 0, F.impactSize, 0, .85, pool);
  }

  // Blood reaching the ground: in water it spreads thin and pale and fades
  // (dry ground is the ground's own blood; never here). Quality up: on a
  // kerb it is carried along the gutter toward its drain.
  onBlood(x, z, amount = .5) {
    if (!this.spec.stains || !this.water(x, z)) return;
    const F = WATER_FX, pool = this.pool, now = this.now(), a = Math.min(1, Math.max(.1, amount));
    let vx = 0, vz = 0;
    if (this.spec.gutterBlood && this.uniforms.amounts.value.x > .1) {
      const g = nearestGutter(this.places.pieces, x, z, F.gutterReach, this.gutterScratch ||= [0, 0, 0, 0]);
      if (g) { vx = g[2] * F.gutterDrift; vz = g[3] * F.gutterDrift; }
    }
    if (!vx && !vz && pool > F.poolMin) { const t = this.rand() * 6.2832; vx = Math.cos(t) * F.bloodDrift; vz = Math.sin(t) * F.bloodDrift; }
    this.putDecal(this.stains, x, z, now, pool > F.poolMin ? F.bloodLifePool : F.bloodLife, 2, (.25 + .5 * a) * (1 + .7 * pool), 0, a, pool, vx, vz);
  }

  onFall(x, z) {
    if (!this.water(x, z)) return;
    const s = this.spec, F = WATER_FX, pool = this.pool, now = this.now();
    if (s.splashes) this.putCrown(x, z, now, .7, 1, pool);
    if (s.rings) this.putDecal(this.rings, x, z, now, F.strongLife, 0, F.fallSize, 0, .9, pool);
  }

  onCasing(x, z) {
    if (!this.water(x, z)) return;
    const s = this.spec, F = WATER_FX, pool = this.pool, now = this.now();
    if (s.rings) this.putDecal(this.rings, x, z, now, F.ringLife * .7, 0, F.casingSize, 0, .5, pool);
    else if (s.splashes) this.putCrown(x, z, now, .1, .5, pool);
  }

  // ------------------------------------------------------------- frame

  update(frame) {
    const u = this.city.uniforms, S = this.state, F = WATER_FX, time = u.time.value;
    const clock = frame.clock ?? 0, rain = u.rain.value, wet = u.wetness.value;
    if (frame.focus) this.focus.copy(frame.focus);
    // The water's amounts (the rain's own numbers, and the schedule's).
    S.flow = flowAt(wet, rain);
    S.runoff = this.raining ? runoffAt(clock, F.spoutTail, this.rainSpec) : 0;
    S.drip = this.raining ? dripAt(clock, this.rainSpec) : 0;
    S.steam = steamAt(wet, rain);
    this.uniforms.amounts.value.set(S.flow, S.runoff, 0);
    this.uniforms.drip.value = S.drip; this.uniforms.steam.value = S.steam; this.uniforms.sparkOn.value = this.spec.sparks > 0 ? 1 : 0;

    const s = this.spec;
    if (this.dirtyDecals) { for (const a of this.decalList) a.needsUpdate = true; this.dirtyDecals = false; }
    if (this.dirtyCrowns) { for (const a of this.crownList) a.needsUpdate = true; this.dirtyCrowns = false; }

    // A mesh with nothing to show is switched off and costs no draw call.
    this.decalMesh.visible = this.decalCount > 0 && ((this.pondCount > 0 && rain > .02) || time < this.decalsUntil);
    this.crownMesh.visible = this.crownCount > 0 && (time < this.crownsUntil || (this.crownLoops > 0 && (rain > .02 || (s.spoutSplashes > 0 && S.runoff > .02))));
    this.streamMesh.visible = this.streamsOn && (S.flow > .02 || S.runoff > .02);

    // Drips near you: re-pick the nearest ledges and signs now and then.
    if (s.drips > 0 && S.drip > .03) this.pickDrips(time);
    const spark = this.sparkCount > 0 && this.nearHot(this.sparkSpots);
    this.fall.geometry.instanceCount = spark ? s.drips + this.sparkCount : this.shownDrips;
    this.fallMesh.visible = (S.drip > .03 && this.shownDrips > 0) || spark;
    this.sparksNear = spark;
    this.steamNear = this.steamCount > 0 && this.nearHot(this.steamSpots);
    this.steamMesh.visible = this.steamNear;
  }

  nearHot(spots) {
    const f = this.focus, half = WATER_FX.viewHalf, hx = half[0], hz = half[1]; // (no destructuring: that allocates per frame)
    for (let i = 0; i < spots.length; i++) { const s = spots[i]; if (Math.abs(s.x - f.x) < hx && Math.abs(s.z - f.z) < hz) return true; }
    return false;
  }

  // Add the signs' emitters to the drip sources (once they exist), then keep
  // the nearest `drips` of them in the pool.
  pickDrips(time) {
    const F = WATER_FX, f = this.focus, last = this.lastPick, emitters = this.city.emitters;
    if (emitters && emitters.length !== this.emitterCount) {
      this.emitterCount = emitters.length; this.sourceCount = this.mapSources;
      for (const e of emitters) {
        if (this.sourceCount >= this.sourceMax) break;
        if (!(e.kind === 'neon' || e.kind === 'panel' || e.kind === 'screen') || !(e.y >= 2.2 && e.y <= 9.5)) continue;
        const o = this.sourceCount * 4;
        this.sources[o] = e.x; this.sources[o + 1] = e.y - .4; this.sources[o + 2] = e.z; this.sources[o + 3] = .05 + .9 * hash01((e.id ?? this.sourceCount) * 1.7 + 3);
        this.sourceCount++;
      }
      last.t = -1e9;
    }
    if (time - last.t < F.dripRefresh && Math.hypot(f.x - last.x, f.z - last.z) < F.dripMove) return;
    last.x = f.x; last.z = f.z; last.t = time;
    const n = this.spec.drips, src = this.sources, near = this.picked, dist = this.pickedD, hx = F.viewHalf[0], hz = F.viewHalf[1];
    let count = 0;
    for (let i = 0; i < this.sourceCount; i++) {
      const dx = src[i * 4] - f.x, dz = src[i * 4 + 2] - f.z, d2 = dx * dx + dz * dz;
      if (dx > hx || dx < -hx || dz > hz || dz < -hz) continue;
      if (count === n && d2 >= dist[count - 1]) continue;
      let at = count < n ? count++ : count - 1;
      while (at > 0 && dist[at - 1] > d2) { dist[at] = dist[at - 1]; near[at] = near[at - 1]; at--; }
      dist[at] = d2; near[at] = i;
    }
    this.pickedCount = count;
    const a = this.fall.attrs, origin = a.aOrigin.array, motion = a.aMotion.array;
    for (let k = 0; k < n; k++) {
      if (k < count) {
        const i = near[k], o = k * 4;
        origin[o] = src[i * 4]; origin[o + 1] = src[i * 4 + 1]; origin[o + 2] = src[i * 4 + 2]; origin[o + 3] = hash01(i * 0.618 + 1);
        motion[o] = 0; motion[o + 1] = 1.6 + 1.8 * hash01(i * 1.3 + 2); motion[o + 2] = src[i * 4 + 3]; motion[o + 3] = 0;
      } else { motion[k * 4 + 2] = 9; }
    }
    a.aOrigin.needsUpdate = true; a.aMotion.needsUpdate = true;
    this.shownDrips = count;
  }

  // The warm-up's one draw: every mesh shown at full size, so the first
  // shower builds nothing (update puts the real state back next frame).
  warm() {
    this.decal.geometry.instanceCount = this.decal.attrs.aTime.count; this.crown.geometry.instanceCount = this.crown.attrs.aTime.count;
    this.fall.geometry.instanceCount = this.fall.attrs.aMotion.count; this.steam.geometry.instanceCount = Math.max(this.steam.attrs.aMotion.count, 1);
    this.streams.geometry.setDrawRange(0, this.streams.indexCount);
    for (const m of [this.decalMesh, this.crownMesh, this.streamMesh, this.fallMesh, this.steamMesh]) m.visible = true;
    this.uniforms.amounts.value.set(1, 1, 0); this.uniforms.drip.value = 1; this.uniforms.sparkOn.value = 1; this.uniforms.steam.value = 1;
  }

  // How many slots are live now: for tests and the debug overlay, never per frame.
  liveDecals(now = this.now(), kind = -1) {
    const a = this.decal.attrs, t = a.aTime.array;
    let n = 0;
    for (let i = 0; i < this.decalCount - this.pondCount; i++) {
      const age = now - t[i * 4];
      if (t[i * 4 + 1] > 0 && age >= 0 && age < t[i * 4 + 1] && (kind < 0 || t[i * 4 + 2] === kind)) n++;
    }
    return n;
  }
  liveCrowns(now = this.now()) {
    const t = this.crown.attrs.aTime.array;
    let n = 0;
    for (let i = 0; i < this.spec.splashes; i++) { const age = now - t[i * 4]; if (age >= 0 && age < t[i * 4 + 1]) n++; }
    return n;
  }

  dispose() {
    for (const m of [this.decalMesh, this.crownMesh, this.streamMesh, this.fallMesh, this.steamMesh]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
    if (this.ownMasks) {
      const u = this.city.uniforms;
      this.roofTexture?.dispose(); this.puddleTexture?.dispose();
      if (u.roofMask.value === this.roofTexture) u.roofMask.value = null;
      if (u.puddleMask.value === this.puddleTexture) u.puddleMask.value = null;
    }
  }
}

registerCitySystem('water', (view, map, city) => new WaterSystem(view, map, city));
