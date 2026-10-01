// Lumen's wreck scenes, the moving parts (design 6; stage 4): the smouldering
// pileup on the Boulevard (a smoke column, rising embers), the sedan nosed into
// the laundromat's front (a pale steam wisp off its hood), the crackling EV in
// the charging lot (white-lemon arcs crawling over its split battery floor and
// sparks) and the downed cable across West Street (a frayed end that arcs and
// spits sparks on the wet road). All cosmetic: no damage, no sight blocked
// (the smoke is thin and stays over the wreck), nothing shootable. The cars and
// the cable themselves are static models (world/lumen-vehicles.js,
// world/lumen-bus.js); the lit panels that throw their light on the road are
// the signs system's (maps/lumen-vehicle-lights.js).
//
// Two meshes, two draws, each built (with its shader) in the constructor:
//   smoke   camera-facing soft puffs, alpha-blended, a fixed run of them per
//           column, each riding a loop of its own (one column dark and reddish
//           at the root, the wisp pale grey)
//   glow    additive ribbons: the arcs (a jagged, morphing line that slides
//           back and forth along a seam of the car), the sparks (a short
//           streak thrown off a seam, gravity pulling it down) and the embers
//           (slow red-orange motes that rise off the pileup)
// Every position, velocity and phase is a per-instance number written once at
// build; the shaders derive the frame from one time value (the weather clock:
// the same for everyone) and the last burst times, so the CPU's work is six
// uniforms and two visibility flags a frame. Nothing is allocated per frame. A
// lower preset draws fewer of each kind (a `rank` per instance against a count
// uniform) and Potato only the smoke column, two arcs and a few sparks.
//
// The sparks are cued to the soundscape: the crackle at the EV and at the cable
// fire on lumen-ambience.js's schedule (slotFire(site, ..., period, spread)),
// and the sparks fly at those same instants, the arcs flaring with them. Between
// bursts the arcs idle at a third of their strength, coming and going slowly
// (nothing large flashes; the changes are smooth).
//
// Not Static's electricity (renderer.js updateStaticCrackle: cyan-white lines
// wound round the gun, forks and rings): these are warm white-lemon (#fff2b0),
// lie along the ground and the car's sills, and never fork.
import * as THREE from 'three';
import { registerCitySystem, BRIGHT_LAYER } from '../render/city-registry.js';
import { PILEUP, VEHICLE_LIGHTS, vehicleStates, cableRoute } from '../maps/lumen-vehicle-lights.js';

export const WRECKS = Object.freeze({
  // Instances of each kind, by preset (per scene; the arcs and sparks belong to the EV, half as many to the cable).
  presets: Object.freeze({
    potato:      Object.freeze({ smoke: 5,  wisp: 0,  embers: 0,  arcs: 2,  sparks: 5 }),
    performance: Object.freeze({ smoke: 9,  wisp: 3,  embers: 6,  arcs: 4,  sparks: 9 }),
    balanced:    Object.freeze({ smoke: 14, wisp: 5,  embers: 10, arcs: 6,  sparks: 14 }),
    quality:     Object.freeze({ smoke: 20, wisp: 7,  embers: 16, arcs: 9,  sparks: 22 }),
    extreme:     Object.freeze({ smoke: 30, wisp: 10, embers: 26, arcs: 12, sparks: 34 }),
  }),
  reach: 48,            // m from the camera's focus past which nothing of a scene is drawn (the whole mesh hides when no scene is near)
  smoke: Object.freeze({ life: 5.2, rise: 6.4, size: .55, grow: 1.9, opacity: .5, drift: Object.freeze([.35, .12]), colour: '#3a3d46', root: '#5a2a1e' }),
  wisp: Object.freeze({ life: 3.4, rise: 2.6, size: .32, grow: 1.6, opacity: .32, colour: '#8a9099' }),
  ember: Object.freeze({ life: Object.freeze([1.6, 3.2]), rise: Object.freeze([.7, 1.6]), size: .07, colour: '#ff5a22' }),
  arc: Object.freeze({ colour: '#fff2b0', width: .05, jitter: .11, speed: Object.freeze([.6, 1.5]), idle: .34, decay: 5.5, hdr: 2.2 }),
  spark: Object.freeze({ colour: '#ffe9a0', life: Object.freeze([.55, 1]), speed: Object.freeze([2.2, 5]), size: .06, gravity: 9, hdr: 2.6 }),
  // The soundscape's schedule (lumen-ambience.js LUMEN_SITES ev / cable; audio-lumen.js slotFire sites 10 and 11): a burst at each crackle.
  bursts: Object.freeze({ ev: Object.freeze({ site: 10, period: 1.3, spread: 1.1 }), cable: Object.freeze({ site: 11, period: 1.1, spread: .9 }) }),
});

// The sounds' hash (audio-lumen.js hash01, copied so this module stays light; tests/lumen-vehicles.test.js checks they agree).
export function hash01(a, b = 0, c = 0) {
  let h = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul(b | 0, 0x85EBCA77) ^ Math.imul(c | 0, 0xC2B2AE3D)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297A2D39) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
// The last burst of a site at or before `clock` (audio-lumen.js slotFire's events), or -99.
export function lastBurst(site, clock, period, spread) {
  const first = Math.floor((clock - spread) / period) - 1;
  for (let n = Math.floor(clock / period); n >= first; n--) {
    const t = n * period + hash01(site, n, 7) * spread;
    if (t <= clock) return t;
  }
  return -99;
}

// --- The scenes ---------------------------------------------------------------------
const stream = seed => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const local = (s, x, y, z) => { const c = Math.cos(s.angle), n = Math.sin(s.angle); return [s.x + x * c + z * n, y, s.z - x * n + z * c]; };

// Every place the effects stand, from the map's props (the sound scene finds its cars the same way).
export function wreckScenes(props) {
  const states = vehicleStates(props), out = { pileup: null, shopfront: null, ev: null, cable: null };
  for (const s of states.values()) {
    if (s.scene === 'pileup') out.pileup = { hood: local(s, ...PILEUP.hood), x: s.x, z: s.z };
    else if (s.scene === 'shopfront') out.shopfront = { hood: local(s, 1.85, .95, 0), x: s.x, z: s.z, angle: s.angle };
    else if (s.scene === 'ev') out.ev = { s, x: s.x, z: s.z };
  }
  const route = cableRoute(props);
  out.cable = { end: route.end, x: route.end[0], z: route.end[2] };
  return out;
}

// The instance data. Smoke: aP (x, y, z origin; w size), aQ (phase, rank, kind 0 column / 1 wisp, rise).
// Glow: aA (x, y, z, kind 0 arc / 1 spark / 2 ember), aB (arc: the far end; spark and ember: velocity; w seed),
// aC (rank, site -1 none / 0 EV / 1 cable, arc speed / spark life / ember life, size).
export function buildInstances(scenes, max = WRECKS.presets.extreme) {
  const smoke = [], glow = [], W = WRECKS;
  const rnd = stream(90731);
  const putSmoke = (x, y, z, size, kind, rank, rise) => smoke.push([x, y, z, size, rnd(), rank, kind, rise]);
  const putGlow = (a, b, c) => glow.push([...a, ...b, ...c]);
  const P = scenes.pileup;
  if (P) {
    for (let i = 0; i < max.smoke; i++) putSmoke(P.hood[0] + (rnd() - .5) * .5, P.hood[1], P.hood[2] + (rnd() - .5) * .5, W.smoke.size * (.8 + rnd() * .5), 0, i, W.smoke.rise * (.75 + rnd() * .5));
    for (let i = 0; i < max.embers; i++) {
      const life = W.ember.life[0] + rnd() * (W.ember.life[1] - W.ember.life[0]);
      putGlow([P.hood[0] + (rnd() - .5) * .9, P.hood[1] - .05, P.hood[2] + (rnd() - .5) * 1.2, 2], [(rnd() - .3) * .5, W.ember.rise[0] + rnd() * (W.ember.rise[1] - W.ember.rise[0]), (rnd() - .5) * .4, rnd()], [i, -1, life, W.ember.size * (.7 + rnd() * .7)]);
    }
  }
  const S = scenes.shopfront;
  if (S) for (let i = 0; i < max.wisp; i++) putSmoke(S.hood[0] + (rnd() - .5) * .4, S.hood[1], S.hood[2] + (rnd() - .5) * .4, W.wisp.size * (.8 + rnd() * .5), 1, i, W.wisp.rise * (.8 + rnd() * .4));
  const arcSpeed = () => W.arc.speed[0] + rnd() * (W.arc.speed[1] - W.arc.speed[0]);
  const E = scenes.ev;
  if (E) {
    const hw = .85, s = E.s;
    // The seams, most important first (a lower preset draws the first few): the two sills, then steps up the flanks and the ends of the pack.
    const seams = [
      [[-1.15, .26, hw + .03], [1.1, .26, hw + .03]], [[-1.15, .26, -hw - .03], [1.1, .26, -hw - .03]],
      [[-.9, .3, hw + .05], [.2, .12, hw + .55]], [[.9, .3, -hw - .05], [-.1, .12, -hw - .5]],
      [[1.15, .2, -hw], [1.2, .18, hw]], [[-1.2, .2, hw], [-1.15, .18, -hw]],
      [[.1, .27, hw + .05], [1.0, .1, hw + .4]], [[-.3, .27, -hw - .05], [-1.05, .1, -hw - .45]],
      [[-.5, .3, hw + .04], [.6, .3, hw + .04]], [[-.6, .3, -hw - .04], [.7, .3, -hw - .04]],
      [[.4, .22, hw + .1], [.3, .05, hw + .9]], [[-.4, .22, -hw - .1], [-.5, .05, -hw - .9]],
    ];
    for (let i = 0; i < max.arcs; i++) {
      const [a, b] = seams[i % seams.length];
      putGlow([...local(s, ...a), 0], [...local(s, ...b), rnd()], [i, 0, arcSpeed(), W.arc.width * (i < 2 ? 1.25 : 1)]);
    }
    for (let i = 0; i < max.sparks; i++) {
      const [a] = seams[Math.floor(rnd() * 4)], side = a[2] > 0 ? 1 : -1, x = -1 + rnd() * 2.1;
      const dir = local(s, 0, 0, side), c = [dir[0] - s.x, dir[2] - s.z];
      const sp = W.spark.speed[0] + rnd() * (W.spark.speed[1] - W.spark.speed[0]);
      putGlow([...local(s, x, .28, side * (hw + .05)), 1], [c[0] * sp * .7 + (rnd() - .5) * 1.6, 1.6 + rnd() * 2.6, c[1] * sp * .7 + (rnd() - .5) * 1.6, rnd()], [i, 0, W.spark.life[0] + rnd() * (W.spark.life[1] - W.spark.life[0]), W.spark.size * (.8 + rnd() * .6)]);
    }
  }
  const C = scenes.cable;
  if (C) {
    const [ex, ey, ez] = C.end, nArcs = Math.ceil(max.arcs / 2), nSparks = Math.ceil(max.sparks * .75);
    for (let i = 0; i < nArcs; i++) {
      const a = rnd() * Math.PI * 2, r = .35 + rnd() * .55;
      putGlow([ex, ey + .03, ez, 0], [ex + Math.cos(a) * r, ey + .02, ez + Math.sin(a) * r, rnd()], [i, 1, arcSpeed() * 1.4, W.arc.width * .9]);
    }
    for (let i = 0; i < nSparks; i++) {
      const a = rnd() * Math.PI * 2, sp = 1 + rnd() * 2.4;
      putGlow([ex, ey + .07, ez, 1], [Math.cos(a) * sp, 2.4 + rnd() * 3, Math.sin(a) * sp, rnd()], [i, 1, W.spark.life[0] + rnd() * (W.spark.life[1] - W.spark.life[0]), W.spark.size * (.8 + rnd() * .6)]);
    }
  }
  return { smoke, glow };
}

// --- The shaders ------------------------------------------------------------------------
const HASH = `
float h11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }`;

const c3 = hex => { const c = new THREE.Color(hex); return new THREE.Vector3(c.r, c.g, c.b); };

export function smokeMaterial() {
  const S = WRECKS.smoke, K = WRECKS.wisp;
  const material = new THREE.ShaderMaterial({
    uniforms: { uClock: { value: 0 }, uCount: { value: new THREE.Vector2() }, colours: { value: [c3(S.colour), c3(S.root), c3(K.colour)] } },
    vertexShader: `
attribute vec4 aP;
attribute vec4 aQ;
uniform float uClock;
uniform vec2 uCount;
uniform vec3 colours[3];
varying vec3 vCol;
varying float vAlpha;
varying vec2 vUv;
${HASH}
void main() {
  vUv = position.xy;
  bool wisp = aQ.z > .5;
  float rank = aQ.y;
  vAlpha = 0.0; vCol = colours[0];
  if (rank >= (wisp ? uCount.y : uCount.x)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float life = ${WRECKS.smoke.life.toFixed(2)}, wlife = ${WRECKS.wisp.life.toFixed(2)};
  float t = fract(uClock / (wisp ? wlife : life) + aQ.x);
  float rise = aQ.w * t;
  vec3 p = aP.xyz + vec3(${WRECKS.smoke.drift[0].toFixed(3)} * rise + sin(t * 5.0 + aQ.x * 20.0) * .16 * t, rise, ${WRECKS.smoke.drift[1].toFixed(3)} * rise + cos(t * 4.0 + aQ.x * 13.0) * .12 * t);
  float radius = aP.w * (.55 + ${WRECKS.smoke.grow.toFixed(2)} * t);
  float fade = smoothstep(0.0, .1, t) * pow(1.0 - t, 1.25);
  vAlpha = fade * (wisp ? ${WRECKS.wisp.opacity.toFixed(2)} : ${WRECKS.smoke.opacity.toFixed(2)});
  vCol = wisp ? colours[2] : mix(colours[1], colours[0], smoothstep(0.0, .3, t));
  vec4 mv = viewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * radius;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `
varying vec3 vCol;
varying float vAlpha;
varying vec2 vUv;
void main() {
  float d = length(vUv);
  if (d > 1.0 || vAlpha <= 0.002) discard;
  float a = vAlpha * (1.0 - smoothstep(.35, 1.0, d));
  gl_FragColor = vec4(vCol * (.92 + .16 * (1.0 - d)), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    transparent: true, depthWrite: false, fog: false,
  });
  material.customProgramCacheKey = () => 'lumen-wreck-smoke-v1';
  return material;
}

export function glowMaterial() {
  const A = WRECKS.arc, Sp = WRECKS.spark, Em = WRECKS.ember;
  const material = new THREE.ShaderMaterial({
    uniforms: { uClock: { value: 0 }, uCount: { value: new THREE.Vector3() }, uBurst: { value: new THREE.Vector2(-99, -99) }, colours: { value: [c3(A.colour), c3(Sp.colour), c3(Em.colour)] } },
    vertexShader: `
attribute vec4 aA;
attribute vec4 aB;
attribute vec4 aC;
uniform float uClock;
uniform vec3 uCount;
uniform vec2 uBurst;
uniform vec3 colours[3];
varying vec3 vCol;
varying float vAlpha;
varying float vSide;
${HASH}
const float SEGMENTS = 8.0;
vec3 sparkAt(vec3 origin, vec3 v0, float seed, float salt, float t) {
  vec3 v = v0 * (.7 + .6 * h11(seed + salt * 13.0)) + vec3((h11(seed * 3.0 + salt * 5.0) - .5) * 1.6, 0.0, (h11(seed * 7.0 + salt * 9.0) - .5) * 1.6);
  return origin + v * t + vec3(0.0, -.5 * ${Sp.gravity.toFixed(1)} * t * t, 0.0);
}
void main() {
  int kind = int(aA.w + .5);
  float rank = aC.x;
  vSide = position.y; vAlpha = 0.0; vCol = colours[0];
  if (rank >= (kind == 0 ? uCount.x : kind == 1 ? uCount.y : uCount.z)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float seed = aB.w;
  float u = position.x;
  vec3 pos = aA.xyz, tail = aA.xyz;
  float halfW = .03;
  vec3 dirW = vec3(1.0, 0.0, 0.0);
  float site = aC.y;
  float burstAt = site < -.5 ? -99.0 : (site < .5 ? uBurst.x : uBurst.y);
  float age = uClock - burstAt;
  if (kind == 0) {
    // An arc: a jagged line along a seam, a window of it sliding back and forth, morphing smoothly.
    vec3 A = aA.xyz, B = aB.xyz;
    float len = .55;
    float s0 = (1.0 - len) * (.5 + .5 * sin(uClock * aC.z + seed * 40.0));
    float p = s0 + u * len;
    vec3 along = normalize(B - A + vec3(.0001));
    vec3 across = normalize(cross(vec3(0.0, 1.0, 0.0), along) + vec3(.0001, 0.0, 0.0));
    float tt = uClock * 5.0 + seed * 31.0, k0 = floor(tt), f = smoothstep(0.0, 1.0, fract(tt));
    float i = floor(u * SEGMENTS + .5);
    vec2 j0 = vec2(h21(vec2(i, k0 + seed * 50.0)), h21(vec2(i + 40.0, k0 + seed * 50.0))) - .5;
    vec2 j1 = vec2(h21(vec2(i, k0 + 1.0 + seed * 50.0)), h21(vec2(i + 40.0, k0 + 1.0 + seed * 50.0))) - .5;
    vec2 j = mix(j0, j1, f);
    float amp = ${A.jitter.toFixed(3)} * (.7 + .5 * h11(seed * 9.0)) * sin(3.14159 * clamp(p, 0.0, 1.0));
    pos = mix(A, B, p) + across * j.x * amp * 2.0 + vec3(0.0, abs(j.y) * amp * 1.5, 0.0);
    tail = pos + along;
    halfW = aC.w * .5;
    dirW = along;
    float coming = mix(.2, 1.0, smoothstep(.15, .5, .5 + .5 * sin(uClock * (.9 + seed * 1.3) + seed * 13.0)));
    float flare = age >= 0.0 ? exp(-age * ${A.decay.toFixed(1)}) : 0.0;
    vAlpha = clamp((${A.idle.toFixed(2)} + .2 * sin(uClock * (.7 + seed) + seed * 20.0)) * coming + flare, 0.0, 1.0);
    vCol = colours[0] * ${A.hdr.toFixed(2)};
  } else if (kind == 1) {
    // A spark: thrown at a burst, gravity pulling it down, a short bright streak that fades.
    float life = aC.z, delay = h11(seed * 11.0) * .16;
    float t = age - delay, salt = fract(burstAt * 7.31);
    if (site < -.5 || t < 0.0 || t > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    pos = sparkAt(aA.xyz, aB.xyz, seed, salt, t);
    tail = sparkAt(aA.xyz, aB.xyz, seed, salt, max(t - .07, 0.0));
    if (pos.y < .02) { pos.y = .02; tail.y = max(tail.y, .02); }
    float k = t / life;
    vAlpha = pow(1.0 - k, 1.4);
    vCol = colours[1] * ${Sp.hdr.toFixed(2)} * mix(1.0, .6, k);
    halfW = aC.w * (.25 + .75 * u);
    dirW = pos - tail;
  } else {
    // An ember: a slow mote lifting off the wreck, wandering, cooling from orange to dull red.
    float life = aC.z, t = fract(uClock / life + seed);
    vec3 v = aB.xyz;
    pos = aA.xyz + v * t * life + vec3(sin(t * 7.0 + seed * 20.0), 0.0, cos(t * 6.0 + seed * 15.0)) * .28 * t;
    tail = pos - v * .12;
    halfW = aC.w * (.4 + .6 * u);
    dirW = pos - tail;
    vAlpha = smoothstep(0.0, .08, t) * pow(1.0 - t, 1.2) * (.65 + .35 * sin(uClock * 7.0 + seed * 50.0));
    vCol = mix(colours[2], colours[2] * vec3(.6, .25, .2), t) * 1.6;
  }
  vec3 point = kind == 0 ? pos : mix(tail, pos, u);
  vec4 mv = viewMatrix * vec4(point, 1.0);
  vec2 dir = (viewMatrix * vec4(dirW, 0.0)).xy;
  dir = length(dir) < .0001 ? vec2(1.0, 0.0) : normalize(dir);
  mv.xy += vec2(-dir.y, dir.x) * position.y * halfW;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `
varying vec3 vCol;
varying float vAlpha;
varying float vSide;
void main() {
  float a = vAlpha * (1.0 - vSide * vSide);
  if (a <= .004) discard;
  gl_FragColor = vec4(vCol, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  material.customProgramCacheKey = () => 'lumen-wreck-glow-v1';
  return material;
}

// A strip of `SEGMENTS` quads: position.x runs 0 to 1 along it, position.y is the side (-1 or 1).
export function ribbonGeometry(segments = 8) {
  const positions = new Float32Array((segments + 1) * 2 * 3), index = [];
  for (let i = 0; i <= segments; i++) for (let s = 0; s < 2; s++) positions.set([i / segments, s * 2 - 1, 0], (i * 2 + s) * 3);
  for (let i = 0; i < segments; i++) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3)); g.setIndex(index);
  return g;
}
export function puffGeometry() {
  const g = new THREE.InstancedBufferGeometry(), src = new THREE.PlaneGeometry(2, 2);
  g.setAttribute('position', src.attributes.position); g.setIndex(src.index); src.dispose?.();
  return g;
}

export class LumenWrecks {
  constructor(view, map, city) {
    this.view = view; this.city = city;
    this.scenes = wreckScenes(map.props || []);
    const { smoke, glow } = buildInstances(this.scenes);
    this.smoke = this.mesh(puffGeometry(), smokeMaterial(), 'lumen-wreck-smoke', { aP: [smoke, 0, 4], aQ: [smoke, 4, 4] }, smoke.length);
    this.glow = this.mesh(ribbonGeometry(8), glowMaterial(), 'lumen-wreck-glow', { aA: [glow, 0, 4], aB: [glow, 4, 4], aC: [glow, 8, 4] }, glow.length);
    this.glow.layers.enable(BRIGHT_LAYER);
    // Where a scene stands, for the reach test.
    this.places = [];
    for (const key of ['pileup', 'shopfront', 'ev', 'cable']) { const s = this.scenes[key]; if (s) this.places.push({ key, x: s.x, z: s.z, kind: key === 'pileup' || key === 'shopfront' ? 'smoke' : 'glow' }); }
    this.setQuality(view.qualityName || 'balanced');
  }
  mesh(geometry, material, name, attributes, count) {
    for (const [attr, [data, from, size]] of Object.entries(attributes)) {
      const a = new Float32Array(data.length * size);
      data.forEach((row, i) => { for (let k = 0; k < size; k++) a[i * size + k] = row[from + k]; });
      geometry.setAttribute(attr, new THREE.InstancedBufferAttribute(a, size));
    }
    geometry.instanceCount = count;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.raycast = () => {}; mesh.visible = false; mesh.matrixAutoUpdate = false;
    this.view.scene?.add(mesh);
    return mesh;
  }
  setQuality(name) {
    const c = this.counts = WRECKS.presets[name] || WRECKS.presets.balanced;
    this.smoke.material.uniforms.uCount.value.set(c.smoke, c.wisp);
    this.glow.material.uniforms.uCount.value.set(c.arcs, c.sparks, c.embers);
  }
  update(frame) {
    const clock = Number.isFinite(frame.clock) ? frame.clock : frame.elapsed || 0, focus = frame.focus, reach2 = WRECKS.reach * WRECKS.reach;
    let smoke = false, glow = false;
    for (let i = 0; i < this.places.length; i++) {
      const p = this.places[i];
      if (focus) { const dx = p.x - focus.x, dz = p.z - focus.z; if (dx * dx + dz * dz > reach2) continue; }
      if (p.kind === 'smoke') smoke = true; else glow = true;
    }
    this.smoke.visible = smoke; this.glow.visible = glow;
    if (smoke) this.smoke.material.uniforms.uClock.value = clock;
    if (glow) {
      const g = this.glow.material.uniforms, B = WRECKS.bursts;
      g.uClock.value = clock;
      g.uBurst.value.set(lastBurst(B.ev.site, clock, B.ev.period, B.ev.spread), lastBurst(B.cable.site, clock, B.cable.period, B.cable.spread));
    }
  }
  // The warm-up's draw: both meshes shown once.
  warm() { this.smoke.visible = true; this.glow.visible = true; }
  dispose() {
    for (const m of [this.smoke, this.glow]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
  }
}

registerCitySystem('wrecks', (view, map, city) => (map.city?.wrecks ? new LumenWrecks(view, map, city) : null));
void VEHICLE_LIGHTS;
