import * as THREE from 'three';
import { LUMPY } from './effects-detail.js';

// Ground haze kicked up by the feet. Separate from the debris particles: those
// are lit chips that arc and bounce, these are flat, slow, and fade where they
// were rather than travelling. One instanced mesh, one draw call, per-instance
// alpha through the same fade attribute the other puff pools use.
//
// Walking dust is deliberately small and brief — it marks where the player just
// was without smearing the view. The dash leaves the same haze sampled along
// the whole travelled path, so the streak reads as distance covered, not as a
// longer-lived cloud.
export const DUST_RICHNESS = Object.freeze({ potato: 0, performance: .55, balanced: 1, quality: 1.5, extreme: 2 });
// Debris particles at a footfall and on a dash. Quality and Balanced carry the
// extra; the lower tiers keep their existing budget.
export const FOOTFALL_PARTICLES = Object.freeze({ potato: 1, performance: 1, balanced: 1.8, quality: 2.2, extreme: 2.8 });
// Impacts, breakages and respawns. Same shape as above: the two top presets
// carry the extra, the low tiers keep the budget they were tuned for.
export const IMPACT_PARTICLES = Object.freeze({ potato: 1, performance: 1, balanced: 1.5, quality: 2.1, extreme: 2.8 });
// Kicked dust is lighter and drier than the packed ground it came off, so it
// has to be lifted away from the surface colour or it is simply not visible.
export const kickedDust = color => color.clone().lerp(PALE, .34).multiplyScalar(1.16);

// What a thing throws up when it comes apart is mostly itself, not the ground
// it was standing on. Each tint is taken from the colour the prop's own model
// is built from, moved the way breaking it would actually move it, and the
// weight is how much of the cloud is the object rather than the dust:
//  - a cactus is wet inside, so the pulp dominates and reads pale green;
//  - a barrel is iron hoops over dark staves and darker contents, so it dirties
//    the cloud rather than lightening it;
//  - a crate is dry pine, which is sawdust — close to dust already, so light;
//  - hay is chaff, golden and airborne, and carries a lot of the cloud;
//  - deadwood and a painted sign are grey-brown splinters, barely a shift.
export const DEBRIS_DUST = Object.freeze({
  cactus: { color: '#93a878', weight: .58 },
  barrel: { color: '#5f6257', weight: .5 },
  crate: { color: '#caae82', weight: .34 },
  hay: { color: '#d6bd79', weight: .46 },
  deadwood: { color: '#8e7f66', weight: .38 },
  sign: { color: '#b29a74', weight: .3 },
  brokenChair: { color: '#9d8663', weight: .32 },
});

// Small floor clutter throws itself, not the ground. A pot coming apart is a
// spray of clay, not a cloud of dust — it weighs nothing and it was never
// sitting in the dirt. These are the particle colours for the pieces, taken
// from the object's own material rather than blended with the floor, and a
// prop listed here skips the dust and smoke systems entirely.
export const CLUTTER_BURST = Object.freeze({
  pot: '#b3735a',
  pottedPlant: '#8a6b4a',
  brokenChair: '#8d7454',
});
export const throwsDust = type => !(type in CLUTTER_BURST);
const DEBRIS_COLORS = new Map(Object.entries(DEBRIS_DUST).map(([type, t]) => [type, new THREE.Color(t.color)]));
// Ground dust blended toward the material that broke. The ground still shows
// through, so a cactus in a dry wash and one on the road are not the same cloud.
export function debrisDust(ground, type) {
  const tint = DEBRIS_DUST[type];
  return tint ? ground.clone().lerp(DEBRIS_COLORS.get(type), tint.weight) : ground;
}

const PALE = new THREE.Color('#e9dcbd');
const STEP = Object.freeze({ life: .5, rise: .34, spread: .22, start: .13, grow: 1.5, alpha: .48 });
const DASH = Object.freeze({ life: .78, rise: .5, spread: .42, start: .18, grow: 2.6, alpha: .62 });
// A dodge ends on the feet, not in the air: the stop deserves its own kick.
const LAND = Object.freeze({ life: .6, rise: .42, spread: .3, start: .2, grow: 2.2, alpha: .58 });
// Weather rather than movement — wide, slow, thin, and low to the ground.
const GUST = Object.freeze({ life: 2.4, rise: .3, spread: 1.5, start: .5, grow: 3.4, alpha: .17 });

export class DustTrail {
  constructor(scene, capacity = 192) {
    this.capacity = capacity; this.time = 0; this.puffs = []; this.richness = 1; this.dashClock = 0;
    // Hills: a puff's y is above the ground under it (set by the view; null: flat).
    this.ground = null;
    // Rounder than it used to be, shaded lighter on top than underneath and
    // thinning out towards its outline, so a puff reads as a soft cloud of
    // sand with some volume rather than a flat faceted pebble.
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    geometry.setAttribute('instanceFade', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute float instanceFade; varying float vFade;\n' + shader.vertexShader;
      shader.vertexShader = 'varying float vTop; varying float vFacing;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vFade=instanceFade;
        ${LUMPY}
        vec3 turned = normalize(mat3(instanceMatrix) * normalize(position));
        vTop = turned.y; vFacing = abs(normalize(mat3(modelViewMatrix) * turned).z);`);
      shader.fragmentShader = 'varying float vFade; varying float vTop; varying float vFacing;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb*=mix(.8,1.1,vTop*.5+.5);
        diffuseColor.a*=vFade*smoothstep(.02,.55,vFacing);`);
    };
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    // Per-instance colour is part of the shader, so allocate it now: grown on
    // the first puff, it compiled a second program the first time anyone walked.
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
  }

  setQuality(name) {
    this.richness = DUST_RICHNESS[name] ?? 1;
    if (!this.richness) this.clear();
    this.mesh.visible = this.richness > 0;
  }

  // Fractional counts still fire proportionally rather than rounding to zero.
  #count(base) {
    const exact = base * this.richness;
    return Math.floor(exact) + (Math.random() < exact % 1 ? 1 : 0);
  }

  #emit(x, z, color, shape, drift = 0, alongX = 0, alongZ = 0) {
    if (this.puffs.length >= this.capacity) return;
    const angle = Math.random() * Math.PI * 2, offset = Math.random() * shape.spread;
    this.puffs.push({
      x: x + Math.cos(angle) * offset + alongX * drift, z: z + Math.sin(angle) * offset + alongZ * drift,
      y: .05 + Math.random() * .07, born: this.time, shape,
      vx: Math.cos(angle) * .16 + alongX * .22, vz: Math.sin(angle) * .16 + alongZ * .22,
      size: shape.start * (.75 + Math.random() * .6), spin: (Math.random() - .5) * 1.4,
      color: color ? color.clone().multiplyScalar(.94 + Math.random() * .16) : new THREE.Color('#b09a76'),
    });
  }

  // One footfall: a small puff just behind the player, gone within half a second.
  // (Hills: none in a stream; the water splashes instead.)
  step(x, z, color, dirX = 0, dirZ = 0) {
    if (this.ground?.wetAt?.(x, z)) return;
    for (let i = 0, n = this.#count(2); i < n; i++) this.#emit(x, z, color, STEP, -.18, dirX, dirZ);
  }

  // Called every frame of a dodge, so the haze samples the path actually taken
  // — through a wall slide or a clipped dash as readily as a clean one.
  dash(x, z, color, dt, dirX = 0, dirZ = 0) {
    if (this.ground?.wetAt?.(x, z)) return;
    this.dashClock -= dt;
    if (this.dashClock > 0) return;
    this.dashClock += .016;
    for (let i = 0, n = Math.max(1, this.#count(3)); i < n; i++) this.#emit(x, z, color, DASH, -.1, dirX, dirZ);
  }

  dashStart() { this.dashClock = 0; }

  // The skid where a dodge stops, thrown forward off the heels.
  land(x, z, color, dirX = 0, dirZ = 0) {
    for (let i = 0, n = this.#count(5); i < n; i++) this.#emit(x, z, color, LAND, .12, dirX, dirZ);
  }

  // A sheet of wind-driven sand crossing open ground. Laid as a line rather than
  // a cluster so it reads as a gust travelling, not as a puff expanding.
  gust(x, z, dirX, dirZ, color, length = 14) {
    const count = this.#count(11);
    for (let i = 0; i < count; i++) {
      const along = (i / Math.max(1, count - 1) - .5) * length;
      this.#emit(x + dirX * along, z + dirZ * along, color, GUST, (Math.random() - .5) * 2.5, dirX, dirZ);
    }
  }

  update(dt) {
    if (!this.richness) { this.mesh.count = 0; return; }
    this.time += Math.max(0, dt);
    this.puffs = this.puffs.filter(p => this.time - p.born < p.shape.life);
    const fade = this.mesh.geometry.attributes.instanceFade, ground = this.ground && !this.ground.flat ? this.ground : null;
    let i = 0;
    for (const p of this.puffs) {
      if (i >= this.capacity) break;
      const age = this.time - p.born, progress = age / p.shape.life;
      const ease = 1 - (1 - progress) ** 2, x = p.x + p.vx * age, z = p.z + p.vz * age;
      this.dummy.position.set(x, p.y + p.shape.rise * ease * .35 + (ground ? ground.heightAt(x, z) : 0), z);
      this.dummy.rotation.set(0, p.spin * age + p.born, 0);
      const size = p.size * (1 + p.shape.grow * ease);
      this.dummy.scale.set(size, size * .45, size);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, p.color);
      // Fade in fast, out slow: a puff should never pop into existence at full alpha.
      fade.setX(i++, p.shape.alpha * Math.min(1, age / .06) * (1 - progress) ** 1.6);
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    fade.needsUpdate = true;
  }

  clear() { this.puffs.length = 0; this.mesh.count = 0; this.time = 0; this.dashClock = 0; }
}
