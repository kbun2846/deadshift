// Life in Lumen's lights (stage 5; design 12, the owner's "lots of new
// particles"): moths and midges circling the street lamps and some of the shop
// neon, tiny warm specks darting round the light in loose, uneven loops; and on
// Extreme a soft halo of wet mist hanging under a few lamps, brighter while it
// rains (the light catching the drizzle). The lamps' own sparks are the signs
// system's; this only adds what makes a light feel lived round.
//
// Found from the city's emitters (the signs register them before this runs):
// every lamp but the dead ones gets a swarm by a seeded pick, and about one
// neon sign in six within reach of the street. Nothing is placed by hand, so a
// moved lamp takes its moths with it.
//
// Cost: ONE instanced mesh (camera-facing quads, additive), one ShaderMaterial
// built in the constructor; every orbit is a function of the weather clock on
// the GPU; the rain and the power sag are the hub's shared uniforms. The CPU's
// work a frame is one uniform. Potato and Performance draw nothing (the mesh
// hidden); Balanced 3 moths a light, Quality 4, Extreme 6 and the mist halos.
// One draw from Balanced up. Not on the mirror's layer (specks too small to
// reflect).
import * as THREE from 'three';
import { registerCitySystem } from '../render/city-registry.js';
import { puffGeometry } from './lumen-wrecks.js';

export const LIGHTS_LIFE = Object.freeze({
  // Moths a light and mist halos, by preset.
  presets: Object.freeze({
    potato:      Object.freeze({ moths: 0, mist: 0 }),
    performance: Object.freeze({ moths: 0, mist: 0 }),
    balanced:    Object.freeze({ moths: 3, mist: 0 }),
    quality:     Object.freeze({ moths: 4, mist: 0 }),
    extreme:     Object.freeze({ moths: 6, mist: 14 }),
  }),
  maxMoths: 6,          // per light (the instance pool holds Extreme's)
  lampShare: .7,        // of the lamps that get a swarm (seeded)
  neonShare: .17,       // of the neon signs that do
  neonMaxHeight: 6,     // m: neon higher than this is left alone (out of the street's air)
  moth: Object.freeze({ size: .045, radius: Object.freeze([.22, .62]), speed: Object.freeze([1.6, 4.8]), below: .22, colour: '#fff1d6', gain: 1.6 }),
  mist: Object.freeze({ radius: 1.7, below: 1.5, alpha: .045, rainAlpha: .1, colour: '#e6f0ff' }),
});

const stream = seed => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

// The lights that get moths and mist: from the emitters (kind 'lamp' not dead, some 'neon' low enough).
// Each: { x, y, z, colour: [r, g, b] linear, lamp: bool }.
export function lightsWithLife(emitters) {
  const L = LIGHTS_LIFE, rnd = stream(52017), out = [];
  for (const e of emitters || []) {
    const dead = Array.isArray(e.source) && e.source[1] === 4;
    if (dead) continue;
    const pick = rnd();
    if (e.kind === 'lamp' && pick < L.lampShare) out.push({ x: e.x, y: e.y, z: e.z, colour: colourOf(e.colour), lamp: true });
    else if (e.kind === 'neon' && e.y <= L.neonMaxHeight && pick < L.neonShare) out.push({ x: e.x, y: e.y, z: e.z, colour: colourOf(e.colour), lamp: false });
  }
  return out;
}
const colourOf = c => c?.isColor ? [c.r, c.g, c.b] : Array.isArray(c) ? c.slice(0, 3) : [1, .95, .85];

// Instances: aP (x, y, z centre, kind 0 moth / 1 mist), aQ (radius, speed, phase, rank), aR (colour rgb, size).
export function lifeInstances(lights) {
  const L = LIGHTS_LIFE, rnd = stream(8811), rows = [];
  for (const l of lights) for (let m = 0; m < L.maxMoths; m++) {
    const r = L.moth.radius[0] + rnd() * (L.moth.radius[1] - L.moth.radius[0]), sp = (L.moth.speed[0] + rnd() * (L.moth.speed[1] - L.moth.speed[0])) * (rnd() < .5 ? -1 : 1);
    const tint = [.55 + .45 * l.colour[0], .55 + .45 * l.colour[1], .5 + .4 * l.colour[2]];
    rows.push([l.x, l.y - L.moth.below, l.z, 0, r * (l.lamp ? 1 : .8), sp, rnd(), m, ...tint, L.moth.size * (.8 + rnd() * .5)]);
  }
  let k = 0;
  for (const l of lights) {
    if (!l.lamp || rnd() > .6) continue;
    rows.push([l.x, l.y - L.mist.below, l.z, 1, L.mist.radius * (.85 + rnd() * .3), .15 + rnd() * .2, rnd(), k++, ...l.colour.map(v => .6 + .4 * v), 0]);
  }
  return rows;
}

const c3 = hex => { const c = new THREE.Color(hex); return new THREE.Vector3(c.r, c.g, c.b); };

export function lightsLifeMaterial(shared = {}) {
  const L = LIGHTS_LIFE;
  const material = new THREE.ShaderMaterial({
    uniforms: { uClock: { value: 0 }, uCount: { value: new THREE.Vector2() }, uRain: shared.rain || { value: 0 }, uSag: shared.sag || { value: 0 }, uMoth: { value: c3(L.moth.colour) }, uMist: { value: c3(L.mist.colour) } },
    vertexShader: `
attribute vec4 aP;
attribute vec4 aQ;
attribute vec4 aR;
uniform float uClock;
uniform vec2 uCount;
uniform float uRain;
uniform float uSag;
uniform vec3 uMoth;
uniform vec3 uMist;
varying vec3 vCol;
varying float vAlpha;
varying vec2 vUv;
varying float vKind;
varying float vSeed;
float h11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
void main() {
  vUv = position.xy; vKind = aP.w; vSeed = aQ.z; vAlpha = 0.0; vCol = vec3(0.0);
  bool mist = aP.w > .5;
  if (aQ.w >= (mist ? uCount.y : uCount.x)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float t = uClock, ph = aQ.z * 6.2831853;
  vec3 p = aP.xyz;
  float radius;
  if (!mist) {
    // A loose loop round the light: its radius breathing, a dip and a bob, and every so often a
    // dart to a new line (a hash of the second, eased).
    float a = t * aQ.y + ph;
    float r = aQ.x * (1.0 + .3 * sin(t * 1.7 + ph * 3.0));
    float k = floor(t * .7 + aQ.z * 5.0), f = smoothstep(0.0, 1.0, fract(t * .7 + aQ.z * 5.0));
    vec3 dart = mix(vec3(h11(k + aQ.z * 91.0), h11(k * 1.3 + 7.0 + aQ.z * 37.0), h11(k * 2.1 + 3.0 + aQ.z * 53.0)),
                    vec3(h11(k + 1.0 + aQ.z * 91.0), h11((k + 1.0) * 1.3 + 7.0 + aQ.z * 37.0), h11((k + 1.0) * 2.1 + 3.0 + aQ.z * 53.0)), f) - .5;
    p += vec3(cos(a) * r, .14 * sin(t * 2.3 + ph) + .05 * sin(t * 7.1 + ph * 2.0), sin(a) * r * .85) + dart * vec3(.3, .2, .3);
    radius = aR.w;
    vAlpha = (.7 + .3 * sin(t * 38.0 + ph * 8.0)) * (1.0 - .5 * uSag);
    vCol = aR.rgb * uMoth * ${LIGHTS_LIFE.moth.gain.toFixed(2)};
  } else {
    // A halo of wet mist under the lamp: drifting a little, brighter while it rains.
    p += vec3(sin(t * aQ.y + ph) * .15, sin(t * aQ.y * .7 + ph) * .1, cos(t * aQ.y * .9 + ph) * .15);
    radius = aQ.x;
    vAlpha = (${LIGHTS_LIFE.mist.alpha.toFixed(3)} + ${LIGHTS_LIFE.mist.rainAlpha.toFixed(3)} * uRain) * (1.0 - .7 * uSag);
    vCol = aR.rgb * uMist;
  }
  vec4 mv = viewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * radius;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `
uniform float uClock;
varying vec3 vCol;
varying float vAlpha;
varying vec2 vUv;
varying float vKind;
varying float vSeed;
void main() {
  float d = length(vUv);
  if (d > 1.0 || vAlpha <= .002) discard;
  float a;
  if (vKind > .5) {
    // Soft, with slow drifting streaks (the drizzle in the light).
    float n = .75 + .25 * sin(vUv.x * 5.0 + uClock * .6 + vSeed * 20.0) * sin(vUv.y * 4.0 - uClock * .9);
    a = vAlpha * (1.0 - smoothstep(0.0, 1.0, d)) * n * smoothstep(1.0, .35, abs(vUv.y));
  } else a = vAlpha * (1.0 - smoothstep(.15, 1.0, d));
  gl_FragColor = vec4(vCol, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  });
  material.customProgramCacheKey = () => 'lumen-lights-life-v1';
  return material;
}

export class LumenLightsLife {
  constructor(view, map, city) {
    this.view = view; this.city = city;
    this.material = lightsLifeMaterial(city?.uniforms);
    const mesh = this.mesh = new THREE.Mesh(puffGeometry(), this.material);
    mesh.name = 'lumen-lights-life'; mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.raycast = () => {}; mesh.visible = false; mesh.matrixAutoUpdate = false;
    this.build();
    view.scene?.add(mesh);
    this.setQuality(view.qualityName || 'balanced');
  }
  // The swarms from the emitters (the signs have made them by now: render/city-systems.js imports
  // them first; were they not, this runs again once they exist).
  build() {
    const emitters = this.city?.emitters || [];
    this.emitterCount = emitters.length;
    this.lights = lightsWithLife(emitters);
    const rows = lifeInstances(this.lights), geometry = this.mesh.geometry;
    for (const [name, from] of [['aP', 0], ['aQ', 4], ['aR', 8]]) {
      const a = new Float32Array(Math.max(1, rows.length) * 4);
      rows.forEach((r, n) => { for (let k = 0; k < 4; k++) a[n * 4 + k] = r[from + k]; });
      geometry.setAttribute(name, new THREE.InstancedBufferAttribute(a, 4));
    }
    geometry.instanceCount = rows.length;
    // Where the swarms are, for the insects' buzz (lumen-ambience.js): x, z pairs.
    this.sites = new Float32Array(this.lights.length * 2);
    this.lights.forEach((l, i) => { this.sites[i * 2] = l.x; this.sites[i * 2 + 1] = l.z; });
  }
  setQuality(name) {
    const c = this.counts = LIGHTS_LIFE.presets[name] || LIGHTS_LIFE.presets.balanced;
    this.material.uniforms.uCount.value.set(c.moths, c.mist);
    this.on = c.moths > 0 || c.mist > 0;
    if (!this.on) this.mesh.visible = false;
  }
  update(frame) {
    if (!this.emitterCount && this.city?.emitters?.length) this.build();
    if (!this.on || !this.lights.length) { this.mesh.visible = false; return; }
    this.material.uniforms.uClock.value = Number.isFinite(frame.clock) ? frame.clock : frame.elapsed || 0;
    this.mesh.visible = true;
  }
  warm() { this.mesh.visible = true; }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.material.dispose(); }
}

registerCitySystem('lightLife', (view, map, city) => (map.city?.lightLife ?? map.id === 'lumen') ? new LumenLightsLife(view, map, city) : null);
