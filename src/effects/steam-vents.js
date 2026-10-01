// Lumen's steam vents, the look (lumen-design.md section 20.6). The vents,
// their schedule and the sight they block are maps/lumen-vents.js (pure,
// shared with the simulation); this draws the clouds.
//
// One instanced mesh of soft camera-facing puffs for every vent (one
// material, built at load, one draw while any vent shows steam). Each vent
// owns a fixed run of the pool; each puff rises on its own loop, spreading
// and thinning, and the whole cloud is scaled by the vent's `strength`
// (ventState: builds over 0.35 s, holds for the 4 s burst, thins over 1.1 s).
// Between bursts each vent breathes a faint wisp, so players learn where the
// vents are. Every preset draws the burst (it blocks sight for everyone, so
// it must be seen by everyone); the higher presets use more, finer puffs.
// The CPU writes a few matrices and alphas a frame; nothing is allocated.
// The covers (manhole discs and grates) are painted into the city ground's
// markings (world/city-ground.js ventCovers): no draw of their own.
import * as THREE from 'three';
import { registerCitySystem } from '../render/city-registry.js';
import { VENTS, ventState } from '../maps/lumen-vents.js';

export const STEAM = Object.freeze({
  // Puffs per vent, by preset.
  puffs: Object.freeze({ potato: 7, performance: 9, balanced: 12, quality: 16, extreme: 22 }),
  life: 1.7,          // s one puff takes to rise and fade
  colour: '#a9b2be',  // cool grey: reads against the dark street and the neon, never a team colour
  opacity: .68,       // one puff at its densest (overlaps build the wall)
  size: Object.freeze([.8, 1.7]), // m radius at the vent .. at the top of its rise
  spread: .9,         // m a puff drifts out from the vent's axis as it rises (x its seed)
  // Every third puff is a billow: it rolls low round the vent at about this
  // share of VENTS.radius, so the cloud fills the whole cylinder that blocks
  // sight (seen from the camera above), not just a column over the grate.
  billow: .7, billowSize: 1.45, billowOpacity: .74,
  drift: Object.freeze([.35, .12]), // m per metre risen, sideways (the rain's wind)
  idle: .1,           // the wisp between bursts, as a share of the burst
  idleSize: .45,      // .. and of its size
  reach: 40,          // m from the camera's focus past which a vent's puffs are left out
});

const PUFFS_MAX = Math.max(...Object.values(STEAM.puffs));

// A puff's seeds, the same every load.
function seeds(count) {
  let s = 90217; const random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  return Array.from({ length: count }, () => ({ angle: random() * Math.PI * 2, out: .4 + random() * .6, rise: .8 + random() * .4, phase: random() }));
}

// Soft discs facing the camera. instanceMatrix carries only the centre and
// the radius (a uniform scale); `alpha` is per puff.
export function steamMaterial() {
  const material = new THREE.ShaderMaterial({
    uniforms: { colour: { value: new THREE.Color(STEAM.colour) } },
    vertexShader: `
attribute float alpha;
varying float vAlpha;
varying vec2 vUv;
void main() {
  vec3 centre = instanceMatrix[3].xyz;
  float radius = length(instanceMatrix[0].xyz);
  vAlpha = alpha; vUv = position.xy;
  vec4 mv = viewMatrix * vec4(centre, 1.0);
  mv.xy += position.xy * radius;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `
uniform vec3 colour;
varying float vAlpha;
varying vec2 vUv;
void main() {
  float d = length(vUv);
  if (d > 1.0 || vAlpha <= 0.0) discard;
  float a = vAlpha * (1.0 - smoothstep(0.4, 1.0, d));
  gl_FragColor = vec4(colour * (0.9 + 0.2 * (1.0 - d)), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    transparent: true, depthWrite: false, fog: false,
  });
  material.customProgramCacheKey = () => 'lumen-steam-v1';
  return material;
}

export class SteamVents {
  constructor(view, map, city) {
    this.view = view; this.city = city; this.vents = map.city.vents;
    const count = this.vents.length * PUFFS_MAX;
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(count), 1); this.alpha.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('alpha', this.alpha);
    this.mesh = new THREE.InstancedMesh(geometry, steamMaterial(), count);
    this.mesh.name = 'lumen-steam'; this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.mesh.raycast = () => {};
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.visible = false;
    view.scene?.add(this.mesh);
    this.seeds = seeds(PUFFS_MAX);
    this.state = {}; // ventState's reused out
    this.setQuality(view.qualityName || 'balanced');
  }

  setQuality(name) { this.puffs = STEAM.puffs[name] ?? STEAM.puffs.balanced; }

  update(frame) {
    const clock = frame.clock, focus = frame.focus, m = this.mesh.instanceMatrix.array, a = this.alpha.array;
    const n = this.puffs, vents = this.vents, state = this.state, S = STEAM;
    let used = 0, shown = false;
    for (let i = 0; i < vents.length; i++) {
      const v = vents[i];
      ventState(clock, i, vents.length, state);
      const far = focus && Math.hypot(v.x - focus.x, v.z - focus.z) > S.reach;
      // The burst over the idle wisp: size and density both follow it.
      const level = Math.max(state.strength, S.idle), grow = state.strength > S.idle ? .55 + .45 * state.strength : S.idleSize;
      for (let k = 0; k < n; k++, used++) {
        const seed = this.seeds[k], u = ((clock / S.life + seed.phase + k / n) % 1 + 1) % 1, billow = k % 3 === 0;
        let x, y, z, radius, alpha;
        if (billow) {
          // Low, wide, turning slowly round the vent; only with the burst.
          const a = seed.angle + clock * .35 * (seed.out - .7), out = VENTS.radius * S.billow * (.8 + .4 * seed.out) * grow;
          x = v.x + Math.cos(a) * out; z = v.z + Math.sin(a) * out; y = .35 + .3 * seed.rise;
          radius = S.billowSize * (.85 + .3 * Math.sin(clock * 1.3 + seed.phase * 6.3)) * grow;
          alpha = S.billowOpacity * state.strength;
        } else {
          const up = u * VENTS.height * seed.rise, out = S.spread * seed.out * (.25 + u) * grow;
          x = v.x + Math.cos(seed.angle) * out + S.drift[0] * up; z = v.z + Math.sin(seed.angle) * out + S.drift[1] * up; y = .2 + up;
          radius = (S.size[0] + (S.size[1] - S.size[0]) * u) * grow;
          // Faint as it forms, densest low, gone at the top of its rise.
          alpha = S.opacity * level * Math.min(1, u / .12) * Math.pow(1 - u, 1.1);
        }
        if (far) radius = alpha = 0;
        const o = used * 16;
        m[o] = radius; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
        m[o + 4] = 0; m[o + 5] = radius; m[o + 6] = 0; m[o + 7] = 0;
        m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = radius; m[o + 11] = 0;
        m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
        a[used] = alpha;
        if (alpha > 0) shown = true;
      }
    }
    this.mesh.count = used; this.mesh.visible = shown && used > 0;
    this.mesh.instanceMatrix.needsUpdate = true; this.alpha.needsUpdate = true;
    this.mesh.instanceMatrix.clearUpdateRanges?.(); this.alpha.clearUpdateRanges?.();
    this.mesh.instanceMatrix.addUpdateRange?.(0, used * 16); this.alpha.addUpdateRange?.(0, used);
  }

  // The warm-up's draw: the whole pool shown once.
  warm() { this.mesh.count = this.vents.length * PUFFS_MAX; this.mesh.visible = true; }

  // For the sound (and anything else): vent i's state now, into `out`.
  ventAt(clock, i, out = {}) { return ventState(clock, i, this.vents.length, out); }

  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

registerCitySystem('vents', (view, map, city) => (map.city?.vents?.length ? new SteamVents(view, map, city) : null));
