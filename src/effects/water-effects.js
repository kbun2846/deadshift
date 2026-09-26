// Everything that moves on the stream (effects/water-field.js answers where
// the water is): made once when the water mesh is built (render/water-mesh.js,
// so every pool is in the scene before the shader warm-up), stepped from the
// view's update, fed the view's events. Cosmetic only: nothing here touches
// the simulation.
//
// Five instanced draws at most, each skipped while empty:
//  - streaks: thin light lines sliding downstream, fading in and out;
//  - rings: ripple rings (wading, rocks, the ford, the weir, splashes);
//  - patches: soft flat blobs on the surface (blood spreading thin and
//    drifting away, the white churn of a spout or the weir);
//  - drops: splash droplets (lit, flat-shaded);
//  - floaters: leaves and foam flecks riding the current (lit, flat-shaded).
// Mist over a splash is DetailFX's own puffs (view.fx), lifted to the water.
//
// The ladder (WATER_DETAIL): Potato still water with a few streaks;
// Performance adds splashes (and a wader's ripples); Balanced rings round the
// rocks, the crossings and the ford, and floating leaves; Quality foam and
// blood that drifts downstream; Extreme more of everything (and the surface's
// swell and shimmer: water-mesh.js).
//
// Every wading effect keys on a body standing where the ground is below the
// water's surface (the field's depth), never on the ford by name.
//
// Hooks for later stages: addSource('wheel' | 'pile' | 'rock', x, z, options)
// (the waterwheel's drips, the body pile's reddish drift), driftBody (a body
// left in the stream drifting with it), onSound(kind, x, z, strength) for the
// audio (kinds: wadeStep, wadeDodge, splash, spout, plop).
import * as THREE from 'three';
import { swellAt } from './water-field.js';
import { setWaterLook } from '../render/water-mesh.js';

export const WATER_DETAIL = Object.freeze({
 potato: { streaks: 10, splash: 0, wade: 0, rings: 0, leaves: 0, foam: 0, blood: .5, drift: 0, mist: 0 },
 performance: { streaks: 18, splash: .55, wade: .6, rings: 0, leaves: 0, foam: 0, blood: .7, drift: 0, mist: .5 },
 balanced: { streaks: 30, splash: .8, wade: 1, rings: 1, leaves: 12, foam: 0, blood: 1, drift: 0, mist: 1 },
 quality: { streaks: 42, splash: 1, wade: 1, rings: 1.3, leaves: 20, foam: 1, blood: 1.3, drift: 1, mist: 1 },
 extreme: { streaks: 64, splash: 1.5, wade: 1.3, rings: 1.7, leaves: 30, foam: 1.6, blood: 1.6, drift: 1, mist: 1.4 },
});
const CAPACITY = Object.freeze({ streaks: 80, rings: 160, patches: 160, drops: 480, floaters: 320 });
// How far round the camera's focus the stream is kept alive (m).
const WINDOW = Object.freeze({ x: 26, z: 19 });
const GRAVITY = 9.8;

// Colours: the palette's highlights for the light things on the water.
const STREAK = new THREE.Color('#3f4a4a').multiplyScalar(.9), RING = new THREE.Color('#3f4a4a').multiplyScalar(.5);
const SPRAY = new THREE.Color('#b9c3c0'), DROP = new THREE.Color('#c8d0cc'), FOAM = [new THREE.Color('#c9ccc3'), new THREE.Color('#b8bdb4'), new THREE.Color('#d6d8cf')];
const BLOOD = new THREE.Color('#4e0b12'), CHURN = new THREE.Color('#aab3af');
// Litter browns (the ground's) and the canopy's yellows and oranges: never red.
const LEAVES = ['#8a6a3e', '#7a5a34', '#6e4a2c', '#b8923a', '#c07a2e', '#a8682a', '#9c8a3a'].map(c => new THREE.Color(c));

// ---- Procedural textures (DataTextures: no canvas, so tests run in node) ----
function texture(width, height, fill) {
 const data = new Uint8Array(width * height * 4);
 for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const v = fill((x + .5) / width, (y + .5) / height), k = (y * width + x) * 4;
  data[k] = data[k + 1] = data[k + 2] = Math.round(255 * Math.min(1, Math.max(0, v[0]))); data[k + 3] = Math.round(255 * Math.min(1, Math.max(0, v[1])));
 }
 const t = new THREE.DataTexture(data, width, height);
 t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
 return t;
}
// A streak: bright down its middle, tapering to nothing at both ends.
const streakTexture = () => texture(8, 64, (u, v) => { const k = Math.sin(Math.PI * v) ** 1.6 * (1 - (2 * u - 1) ** 2); return [k, k]; });
// A lobed blob, soft at the edge, a little mottled inside.
const blobTexture = () => texture(64, 64, (u, v) => {
 const x = u * 2 - 1, y = v * 2 - 1, r = Math.hypot(x, y), a = Math.atan2(y, x);
 const edge = .74 + .1 * Math.sin(3 * a + 1) + .07 * Math.sin(5 * a + 2.3) + .04 * Math.sin(9 * a + .7);
 const k = 1 - Math.min(1, Math.max(0, (r - edge + .22) / .22)), mottle = .82 + .18 * Math.sin(x * 9 + Math.sin(y * 7) * 2) * Math.sin(y * 8 + 1);
 return [1, k * mottle];
});

// A flat pool material, patched: `shape` 'ring' draws a ring of each
// instance's own width; 'alpha' takes a per-instance opacity.
function poolMaterial(kind, options) {
 const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, ...options });
 if (kind === 'ring') {
  material.onBeforeCompile = shader => {
   shader.vertexShader = 'attribute float ringWidth; varying float vRingWidth; varying vec2 vRingUv;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRingWidth = ringWidth; vRingUv = uv;');
   shader.fragmentShader = 'varying float vRingWidth; varying vec2 vRingUv;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
    float r = length(vRingUv * 2.0 - 1.0);
    diffuseColor.rgb *= smoothstep(1.0 - vRingWidth - .05, 1.0 - vRingWidth, r) * (1.0 - smoothstep(.95, 1.0, r));`);
  };
  material.customProgramCacheKey = () => 'water-ring';
 }
 if (kind === 'alpha') {
  material.onBeforeCompile = shader => {
   shader.vertexShader = 'attribute float patchAlpha; varying float vPatchAlpha;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vPatchAlpha = patchAlpha;');
   shader.fragmentShader = 'varying float vPatchAlpha;\n' + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= vPatchAlpha;');
  };
  material.customProgramCacheKey = () => 'water-patch';
 }
 return material;
}

// A leaf or a fleck of foam: a flat six-sided chip, pointed at its ends and
// raised a little in the middle so its facets take the light.
function chipGeometry() {
 const rim = [[0, 1], [.45, .35], [.4, -.4], [0, -1], [-.4, -.4], [-.45, .35]], position = [0, .18, 0];
 for (const [x, z] of rim) position.push(x, 0, z);
 const index = [];
 for (let i = 0; i < 6; i++) index.push(0, 1 + (i + 1) % 6, 1 + i);
 const g = new THREE.BufferGeometry();
 g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); g.setIndex(index);
 const flat = g.toNonIndexed(); flat.computeVertexNormals(); g.dispose();
 return flat;
}

class Pool {
 constructor(scene, geometry, material, capacity, { alpha = null, order = 0, colour = true } = {}) {
  this.capacity = capacity; this.items = [];
  if (alpha) geometry.setAttribute(alpha, new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage));
  this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
  this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Allocated up front: per-instance colour is part of the program.
  if (colour) this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
  this.mesh.count = 0; this.mesh.visible = false; this.mesh.frustumCulled = false; this.mesh.renderOrder = order;
  this.m = this.mesh.instanceMatrix.array; this.c = this.mesh.instanceColor?.array; this.extra = alpha ? geometry.attributes[alpha] : null;
  scene.add(this.mesh);
 }
 add(item) { if (this.items.length < this.capacity) this.items.push(item); else this.items[Math.floor(Math.random() * this.capacity)] = item; return item; }
 // Scaled (sx across, sy up, sz along), turned so its z runs along (dx, dz).
 place(i, x, y, z, sx, sy, sz, dx, dz) {
  const m = this.m, o = i * 16, c = dz, s = dx;
  m[o] = c * sx; m[o + 1] = 0; m[o + 2] = -s * sx; m[o + 3] = 0;
  m[o + 4] = 0; m[o + 5] = sy; m[o + 6] = 0; m[o + 7] = 0;
  m[o + 8] = s * sz; m[o + 9] = 0; m[o + 10] = c * sz; m[o + 11] = 0;
  m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
 }
 colour(i, colour, scale = 1) { const c = this.c, o = i * 3; c[o] = colour.r * scale; c[o + 1] = colour.g * scale; c[o + 2] = colour.b * scale; }
 finish(n) {
  this.items.length = n; this.mesh.count = n; this.mesh.visible = n > 0;
  if (!n) return;
  this.mesh.instanceMatrix.needsUpdate = true;
  if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  if (this.extra) this.extra.needsUpdate = true;
 }
 clear() { this.items.length = 0; this.finish(0); }
}

export class WaterEffects {
 // `field`: the WaterField; `rocks`: water-mesh.js's rock spots; `surfaces`:
 // the water's meshes (their triangles follow the preset).
 constructor(view, field, { rocks = [], surfaces = [] } = {}) {
  this.view = view; this.field = field; this.surfaces = surfaces; this.time = 0; this.quality = null; this.detail = WATER_DETAIL.balanced;
  this.onSound = null; this.bodies = new Map(); this.sources = []; this.plopped = new WeakSet(); this.probe = {}; this.probe2 = {};
  const scene = view.scene, flat = new THREE.PlaneGeometry(1, 1); flat.rotateX(-Math.PI / 2);
  this.pools = {
   streaks: new Pool(scene, flat.clone(), poolMaterial('plain', { map: streakTexture(), blending: THREE.AdditiveBlending, toneMapped: false }), CAPACITY.streaks, { order: 1 }),
   rings: new Pool(scene, flat.clone(), poolMaterial('ring', { blending: THREE.AdditiveBlending, toneMapped: false }), CAPACITY.rings, { alpha: 'ringWidth', order: 1 }),
   patches: new Pool(scene, flat, poolMaterial('alpha', { map: blobTexture() }), CAPACITY.patches, { alpha: 'patchAlpha', order: 2 }),
   drops: new Pool(scene, new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), CAPACITY.drops),
   floaters: new Pool(scene, chipGeometry(), new THREE.MeshLambertMaterial({ flatShading: true, side: THREE.DoubleSide }), CAPACITY.floaters),
  };
  for (const pool of Object.values(this.pools)) pool.mesh.name = 'water-fx';
  // Where the stream stirs by itself: rocks, the crossings' sides, the ford's
  // riffles and the weir under the dam.
  this.emitters = [...rocks.map(r => ({ kind: 'rock', x: r.x, z: r.z, r: r.r, clock: Math.random() * 2 })), ...crossingEmitters(field, view.map)];
  if (view.qualityName || view.initialQuality) this.setQuality(view.qualityName || view.initialQuality);
 }

 get meshes() { return Object.values(this.pools).map(p => p.mesh); }

 setQuality(name) {
  if (this.quality === name) return;
  this.quality = name; this.detail = WATER_DETAIL[name] || WATER_DETAIL.balanced;
  setWaterLook(this.view.waterMaterial, name, this.surfaces);
  const d = this.detail, { streaks, floaters, drops, rings } = this.pools;
  // Trim what a lower rung does not have.
  if (streaks.items.length > d.streaks) streaks.finish(d.streaks);
  if (!d.leaves && !d.foam) floaters.clear(); else floaters.items = floaters.items.filter(f => f.leaf ? d.leaves : d.foam);
  if (!d.splash) drops.clear();
  if (!d.rings && !d.wade) rings.clear();
 }

 // ---- queries (for the view's hooks) ----
 // Depth of the water over the ground at (x, z): <= 0 dry.
 depthAt(x, z) { return this.field.depthAt(x, z); }
 wet(x, z) { return this.field.wet(x, z, .03); }
 // What a step, a dodge or a blast kicks up here: spray, not dust (null: dry).
 sprayColour(x, z) { return this.field.wet(x, z, .03) ? SPRAY : null; }

 // ---- events (returns true when the water took the place of the dust) ----
 event(e) {
  if (!this.quality) this.setQuality(this.view.qualityName);
  const type = e.type;
  if (type === 'rifleImpact' || type === 'pointImpact' || type === 'scatterHit') {
   const s = this.surface(e.x, e.z); if (!s) return false;
   this.splash(e.x, e.z, s, type === 'pointImpact' ? 1.2 : .7);
   return type === 'rifleImpact' && this.detail.splash > 0;
  }
  if (type === 'explosion' || type === 'scatterBurst') { const s = this.surface(e.x, e.z); if (s) this.burst(e.x, e.z, s, e.radius || 2, type === 'explosion' ? Math.min(1.4, .5 + (e.count || 4) * .08) : .6); return false; }
  if (type === 'grenadeExplosion') { const s = this.surface(e.x, e.z); if (s) this.spout(e.x, e.z, s, e.radius || 3); return false; }
  if (type === 'playerDeath') { this.death(e.x, e.z, e.directionX || 0, e.directionZ || 0); return false; }
  if (type === 'mapReset') this.clear();
  return false;
 }

 // The water here, if a thing landing at (x, z) would land in it.
 surface(x, z) { const s = this.field.sample(x, z, this.probe2); return s && s.depth > .03 ? s : null; }

 // ---- one-off effects ----
 // A round or an orb into the water: a crown of droplets, a quick ring, a
 // breath of spray.
 splash(x, z, s, power = 1) {
  const d = this.detail; this.onSound?.('splash', x, z, power);
  if (!d.splash) return;
  for (let i = 0, n = count(8 * power * d.splash); i < n; i++) {
   const a = Math.random() * 6.3, speed = (.5 + Math.random() * 1.6) * power;
   this.drop(x, s.level + .03, z, Math.cos(a) * speed, 1.8 + Math.random() * 2.6 * power, Math.sin(a) * speed, .028 + Math.random() * .03);
  }
  // The white of the water broken, gone in a moment.
  this.patch(x, z, s.level, .06, .35 * power + .1, .6, .5, CHURN, false);
  this.ring(x, z, s.level, .06, .7 * power + .3, .55, .06, 1.3);
  if (d.rings) this.ring(x, z, s.level, .1, 1.3 * power + .4, 1.4, .04, .8);
  this.mist(x, z, s, count(1.5 * power * d.mist), .1 * power);
 }

 // An orb volley or Scatter's burst over the water: a dome of spray thrown
 // out, rings running out past the blast.
 burst(x, z, s, radius, power) {
  const d = this.detail; this.onSound?.('splash', x, z, 1 + power);
  if (!d.splash) return;
  for (let i = 0, n = count(34 * power * d.splash); i < n; i++) {
   const a = Math.random() * 6.3, speed = (1.5 + Math.random() * 3.5) * power, r = Math.random() * radius * .3;
   this.drop(x + Math.cos(a) * r, s.level + .05, z + Math.sin(a) * r, Math.cos(a) * speed, 2.5 + Math.random() * 4 * power, Math.sin(a) * speed, .03 + Math.random() * .035);
  }
  for (let k = 0; k < 3; k++) this.ring(x, z, s.level, radius * .1, radius * (.8 + k * .45), .7 + k * .45, .05, 1.6 - k * .35);
  this.patch(x, z, s.level, radius * .3, radius * (d.foam ? 1.1 : .8), d.foam ? 3.5 : 1.8, .5, CHURN, false);
  this.mist(x, z, s, count(5 * power * d.mist), .4 * power);
 }

 // A grenade under the water: a spout thrown straight up, a crown round its
 // foot, rings running out and a white churn left behind.
 spout(x, z, s, radius) {
  const d = this.detail; this.onSound?.('spout', x, z, 1);
  // (Potato still gets the churn and a ring: the blast's own flash and dust do the rest.)
  this.ring(x, z, s.level, .3, radius * 1.3, 1.1, .06, 1.6);
  this.patch(x, z, s.level, radius * .35, radius * .9, 3.2, .6, CHURN, false);
  if (!d.splash) return;
  for (let i = 0, n = count(60 * d.splash); i < n; i++) {
   const a = Math.random() * 6.3, r = Math.random() * .45, up = 6 + Math.random() * 6;
   this.drop(x + Math.cos(a) * r, s.level + .1, z + Math.sin(a) * r, Math.cos(a) * (.3 + Math.random() * 1.4), up, Math.sin(a) * (.3 + Math.random() * 1.4), .04 + Math.random() * .05);
  }
  for (let i = 0, n = count(26 * d.splash); i < n; i++) {
   const a = i / 26 * 6.3 + Math.random() * .3, speed = 2 + Math.random() * 2.5;
   this.drop(x + Math.cos(a) * .6, s.level + .05, z + Math.sin(a) * .6, Math.cos(a) * speed, 2 + Math.random() * 2.5, Math.sin(a) * speed, .03 + Math.random() * .03);
  }
  for (let k = 1; k < 3; k++) this.ring(x, z, s.level, radius * .2, radius * (1.3 + k * .5), 1.3 + k * .6, .045, 1.2 - k * .3);
  // The spout's spray hangs in the air a moment.
  const fx = this.view.fx;
  if (fx?.on && d.mist) for (let i = 0, n = count(10 * d.mist); i < n; i++) {
   const a = Math.random() * 6.3, h = .4 + Math.random() * 2.6;
   fx.puff({ x: x + Math.cos(a) * .3, y: s.depth + h, z: z + Math.sin(a) * .3, vx: Math.cos(a) * .6, vz: Math.sin(a) * .6, vy: 1.4 + Math.random() * 1.2, size: .22 + Math.random() * .2, grow: 2.4, life: 1.1 + Math.random() * .8, alpha: .42, rise: .2, drag: 1.2, color: SPRAY.clone().multiplyScalar(.95 + Math.random() * .1) });
  }
 }

 // A breath of spray over the water (DetailFX's puffs, lifted to the surface).
 mist(x, z, s, n, spread) {
  const fx = this.view.fx; if (!fx?.on) return;
  for (let i = 0; i < n; i++) fx.puff({ x: x + (Math.random() - .5) * spread, y: s.depth + .08, z: z + (Math.random() - .5) * spread, vx: (Math.random() - .5) * .6, vz: (Math.random() - .5) * .6, vy: .5 + Math.random() * .4,
   size: .08 + Math.random() * .06, grow: 2.2, life: .6 + Math.random() * .4, alpha: .32, rise: .2, color: SPRAY });
 }

 // ---- blood ----
 // A shot body's blood (the view's bleed): what lands on the water spreads
 // thin and fades; Quality and up it drifts off downstream.
 blood(x, z, dx, dz, amount = 1) {
  const d = this.detail; if (!d.blood) return;
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  const n = count((1 + amount * 1.2) * d.blood), here = this.surface(x, z);
  if (here) this.bloodPatch(x, z, here, .9);
  for (let i = 0; i < n; i++) {
   const reach = .3 + Math.random() * 2 * Math.min(1.6, .6 + amount * .3), side = (Math.random() - .5) * 1.2 * reach * .5;
   const px = x + dx * reach - dz * side, pz = z + dz * reach + dx * side, s = this.surface(px, pz);
   if (s) this.bloodPatch(px, pz, s, .6 + Math.random() * .5);
  }
 }
 bloodPatch(x, z, s, size) {
  const drift = !!this.detail.drift;
  this.patch(x, z, s.level, .15 * size, (.75 + Math.random() * .55) * size * (drift ? 1.35 : 1.1), drift ? 13 + Math.random() * 6 : 7 + Math.random() * 3, .5, BLOOD, drift);
 }
 // A body that falls in the water bleeds into it for a while: downstream it
 // draws out into a thinning red trail (Quality and up; below, it spreads).
 death(x, z, dx = 0, dz = 0) {
  const s = this.surface(x, z) || this.surface(x + dx * .6, z + dz * .6); if (!s || !this.detail.blood) return;
  for (let i = 0; i < 3; i++) this.bloodPatch(x + (Math.random() - .5) * .5, z + (Math.random() - .5) * .5, s, 1.1);
  this.addSource('body', x, z, { life: this.detail.drift ? 30 : 8 });
 }

 // ---- sources: things that keep stirring the water ----
 // kind: 'body' (bleeding, fading over `life`), 'pile' (the body pile on the
 // bank: a faint reddish drift, for good), 'wheel' (the waterwheel: drips
 // along its rim, `width` m across, falling `height` m), 'rock' (foam and
 // rings round something standing in the stream). Returns the source (remove
 // it with removeSource).
 addSource(kind, x, z, options = {}) {
  const source = { kind, x, z, clock: 0, age: 0, life: Infinity, width: 1.6, height: 2.2, strength: 1, dx: 1, dz: 0, ...options };
  if (kind === 'rock') { this.emitters.push({ kind: 'rock', x, z, r: options.r ?? .4, clock: 0 }); return this.emitters[this.emitters.length - 1]; }
  this.sources.push(source); return source;
 }
 removeSource(source) { this.sources = this.sources.filter(s => s !== source); this.emitters = this.emitters.filter(s => s !== source); }

 // A body left in the stream drifts slowly with it until it fetches up in
 // the shallows (for the corpse views: `body` { x, z } is moved in place).
 // Returns how far it moved.
 driftBody(body, dt) {
  const s = this.field.sample(body.x, body.z, this.probe);
  if (!s || s.depth < .3) return 0;
  const step = s.speed * .3 * Math.min(1, (s.depth - .3) / .2) * dt, next = this.field.sample(body.x + s.dx * step, body.z + s.dz * step, this.probe);
  if (!next || next.depth < .3) return 0;
  body.x += s.dx * step; body.z += s.dz * step;
  return step;
 }

 // ---- per frame ----
 // `sim`: the local simulation (its player, grenades); the view's own
 // `remotePlayers` (online players and robots) wade too.
 update(sim, dt, elapsed) {
  if (this.quality !== this.view.qualityName) this.setQuality(this.view.qualityName);
  this.time += dt;
  const u = this.view.waterMaterial?.userData.water; if (u) u.waterTime.value = this.time;
  const focus = this.view.focus || { x: 0, z: 0 };
  this.windowAt(focus.x, focus.z);
  if (dt > 0) {
   this.spawnStreaks(); this.spawnLeaves(); this.stir(dt); this.wade(sim, dt); this.plops(sim); this.runSources(dt);
  }
  this.step(dt);
 }

 // The stretch of each channel in view (+ a margin): [from, to] metres along.
 windowAt(x, z) {
  if (this.windowFor && Math.abs(this.windowFor.x - x) < 1 && Math.abs(this.windowFor.z - z) < 1) return;
  this.windowFor = { x, z }; this.windows = [];
  for (const channel of this.field.channels) {
   let from = Infinity, to = -Infinity;
   for (const s of channel.sections) if (Math.abs(s.x - x) < WINDOW.x && Math.abs(s.z - z) < WINDOW.z) { from = Math.min(from, s.along); to = Math.max(to, s.along); }
   if (to > from) this.windows.push({ channel, from, to });
  }
 }
 inWindow(channel, along, margin = 0) { return this.windows.some(w => w.channel === channel && along > w.from - margin && along < w.to + margin); }

 spawnStreaks() {
  const pool = this.pools.streaks, want = this.detail.streaks;
  let tries = 4;
  while (pool.items.length < want && this.windows.length && tries--) {
   const w = this.windows[Math.floor(Math.random() * this.windows.length)], along = w.from + Math.random() * (w.to - w.from);
   const mid = this.field.pointAt(w.channel, along, 0, this.probe); if (!mid) continue;
   const across = (Math.random() - .5) * 1.7 * (mid.water - .9), p = this.field.pointAt(w.channel, along, across, this.probe);
   const s = p && this.field.sample(p.x, p.z, this.probe2); if (!s || s.depth < .15) continue;
   pool.add({ channel: w.channel, along, across, life: 2.5 + Math.random() * 3, age: 0, length: .7 + Math.random() * 1.6, width: .025 + Math.random() * .035, glow: .6 + Math.random() * .6 });
  }
 }

 spawnLeaves() {
  const pool = this.pools.floaters, want = this.detail.leaves;
  let leaves = 0; for (const f of pool.items) if (f.leaf) leaves++;
  let tries = 3;
  while (leaves < want && this.windows.length && tries--) {
   const w = this.windows[Math.floor(Math.random() * this.windows.length)];
   // At first scattered along the stretch; after that coming in from upstream.
   const along = !this.leavesSeeded ? w.from + Math.random() * (w.to - w.from) : w.channel.dir < 0 ? w.to + 2 - Math.random() * 3 : w.from - 2 + Math.random() * 3;
   const mid = this.field.pointAt(w.channel, along, 0, this.probe); if (!mid) continue;
   const across = (Math.random() - .5) * 1.6 * (mid.water - .9), p = this.field.pointAt(w.channel, along, across, this.probe);
   const s = p && this.field.sample(p.x, p.z, this.probe2); if (!s || s.depth < .1) continue;
   const size = .05 + Math.random() * .05;
   pool.add({ leaf: true, channel: w.channel, along, across, drift: (Math.random() - .5) * .1, yaw: Math.random() * 6.3, spin: (Math.random() - .5) * .5, sx: size * .75, sz: size * 1.35, age: 0, life: Infinity, colour: LEAVES[Math.floor(Math.random() * LEAVES.length)].clone().multiplyScalar(.8 + Math.random() * .3) });
   leaves++;
  }
  if (this.windows.length) this.leavesSeeded = true;
 }

 // Rocks, crossings, the ford and the weir, near the camera: rings (Balanced
 // and up) and foam (Quality and up) coming off them.
 stir(dt) {
  const d = this.detail, focus = this.view.focus || { x: 0, z: 0 };
  if (!d.rings && !d.foam) return;
  for (const e of this.emitters) {
   if (Math.abs(e.x - focus.x) > WINDOW.x || Math.abs(e.z - focus.z) > WINDOW.z) continue;
   e.clock -= dt; e.foamClock = (e.foamClock ?? Math.random()) - dt;
   const s = this.field.sample(e.x, e.z, this.probe); if (!s) continue;
   const busy = e.kind === 'weir' ? 3.5 : e.kind === 'riffle' ? .3 : e.kind === 'post' ? .6 : 1;
   if (d.rings && e.clock <= 0) {
    e.clock = (1.6 + Math.random() * 1.8) / (busy * d.rings);
    const r = e.r ?? .3;
    this.ring(e.x + s.dx * r * .6, e.z + s.dz * r * .6, s.level, r * .8, r + .4 + Math.random() * .4, 2 + Math.random(), .05, e.kind === 'riffle' ? .35 : .6, s.dx * s.speed * .8, s.dz * s.speed * .8);
   }
   if (d.foam && e.foamClock <= 0) {
    e.foamClock = (.35 + Math.random() * .5) / (busy * d.foam);
    const r = (e.r ?? .3) + .05, side = (Math.random() - .5) * 2 * r;
    this.fleck(e.x + s.dx * r - s.dz * side, e.z + s.dz * r + s.dx * side, e.kind === 'weir' ? 1.4 : 1);
    if (e.kind === 'weir' && Math.random() < .6) this.patch(e.x + s.dx * .3, e.z + s.dz * .3 + (Math.random() - .5) * .6, s.level, .25, .6 + Math.random() * .5, 2.4, .3, CHURN, true);
   }
  }
 }

 // A fleck of foam at (x, z), riding the current and breaking up.
 fleck(x, z, size = 1) {
  const s = this.field.sample(x, z, this.probe2); if (!s || s.depth < .03) return;
  const k = (.025 + Math.random() * .045) * size;
  this.pools.floaters.add({ foam: true, x, z, level: s.level, yaw: Math.random() * 6.3, spin: (Math.random() - .5) * 1.5, sx: k, sz: k * (.8 + Math.random() * .5), age: 0, life: 2.5 + Math.random() * 3.5, colour: FOAM[Math.floor(Math.random() * FOAM.length)] });
 }

 // Bodies in the water: you, other players and robots. Ripples as they
 // wade, a splash with each step and a bigger one with a dodge; standing
 // still, a slow ring now and then.
 wade(sim, dt) {
  const d = this.detail, seen = new Set(), list = this.wadeList ||= [];
  list.length = 0;
  const p = sim?.player;
  if (p && !p.dead && this.view.player?.visible !== false) list.push({ id: 'you', x: p.x, z: p.z, vx: p.vx, vz: p.vz, dodge: p.dodgeRemaining > 0 });
  for (const o of this.view.remotePlayers || []) {
   if (o.dead || o.hp <= 0 || this.view.remote?.avatars?.get(o.id)?.root?.visible === false) continue;
   list.push({ id: o.id, x: o.x, z: o.z, vx: o.vx, vz: o.vz, dodge: (o.dodgeRemaining || 0) > 0 });
  }
  for (const b of list) {
   seen.add(b.id);
   const was = this.bodies.get(b.id) || { x: b.x, z: b.z, step: 0, still: Math.random(), dodge: false };
   // Online players carry no velocity: from where they were.
   const vx = b.vx ?? (dt > 0 ? (b.x - was.x) / dt : 0), vz = b.vz ?? (dt > 0 ? (b.z - was.z) / dt : 0), speed = Math.hypot(vx, vz);
   const s = this.field.sample(b.x, b.z, this.probe);
   if (s && s.depth > .03) {
    const deep = Math.min(1, s.depth / .25);
    if (b.dodge && !was.dodge) {
     this.onSound?.('wadeDodge', b.x, b.z, deep);
     if (d.splash) for (let i = 0, n = count(20 * d.splash * (.5 + deep * .5)); i < n; i++) {
      const a = Math.atan2(vz, vx) + (Math.random() - .5) * 2.4, sp = 1 + Math.random() * 2.5;
      this.drop(b.x, s.level + .05, b.z, Math.cos(a) * sp + vx * .25, 1.5 + Math.random() * 2.5, Math.sin(a) * sp + vz * .25, .026 + Math.random() * .03);
     }
     if (d.wade) this.ring(b.x, b.z, s.level, .3, 1.8, .9, .05, 1.3);
     this.mist(b.x, b.z, s, count(3 * d.mist), .5);
    }
    if (speed > .6) {
     was.step -= dt;
     if (was.step <= 0) {
      was.step = .3;
      this.onSound?.('wadeStep', b.x, b.z, deep);
      if (d.wade) this.ring(b.x - vx * .05, b.z - vz * .05, s.level, .22, 1 + deep * .5, .9, .06, 1.1 * d.wade, vx * .15, vz * .15);
      if (d.splash) for (let i = 0, n = count(4 * d.splash * (.5 + deep)); i < n; i++) {
       const a = Math.random() * 6.3, sp = .4 + Math.random() * .9;
       this.drop(b.x + Math.cos(a) * .2, s.level + .03, b.z + Math.sin(a) * .2, Math.cos(a) * sp + vx * .3, 1 + Math.random() * 1.6, Math.sin(a) * sp + vz * .3, .022 + Math.random() * .022);
      }
      if (d.foam) for (let i = 0; i < 2; i++) this.fleck(b.x + (Math.random() - .5) * .5, b.z + (Math.random() - .5) * .5, .8);
     }
    } else if (d.rings) {
     was.still -= dt;
     if (was.still <= 0) { was.still = 1.2 + Math.random() * .8; this.ring(b.x, b.z, s.level, .3, .9 + Math.random() * .3, 1.8, .05, .7, s.dx * s.speed * .4, s.dz * s.speed * .4); }
    }
   }
   was.x = b.x; was.z = b.z; was.dodge = b.dodge; this.bodies.set(b.id, was);
  }
  for (const id of this.bodies.keys()) if (!seen.has(id)) this.bodies.delete(id);
 }

 // A thrown grenade that comes down in the water goes in with a plop (and
 // is hidden under it until it goes off).
 plops(sim) {
  for (const g of sim?.grenades || []) {
   if (!g.released || this.plopped.has(g)) continue;
   const s = this.field.sample(g.x, g.z, this.probe);
   if (s && s.depth > .1 && g.y <= s.level + .02) { this.plopped.add(g); this.splash(g.x, g.z, s, .9); this.onSound?.('plop', g.x, g.z, 1); }
  }
 }

 runSources(dt) {
  const d = this.detail;
  this.sources = this.sources.filter(src => {
   src.age += dt; src.clock -= dt;
   if (src.age > src.life) return false;
   const s = this.field.sample(src.x, src.z, this.probe);
   if (src.kind === 'body' && src.clock <= 0 && s && s.depth > .02) {
    // Heavier at first, easing off.
    const left = 1 - src.age / src.life;
    src.clock = (d.drift ? .45 : 1.2) / Math.max(.15, left);
    this.bloodPatch(src.x + (Math.random() - .5) * .4, src.z + (Math.random() - .5) * .4, s, .7 + left * .5);
   }
   if (src.kind === 'pile' && src.clock <= 0 && s && d.blood) {
    src.clock = 1.1 + Math.random();
    this.patch(src.x + (Math.random() - .5) * src.width, src.z + (Math.random() - .5) * src.width, s.level, .3, 1 + Math.random() * .6, 10, .16 * src.strength, BLOOD, !!d.drift);
   }
   if (src.kind === 'wheel' && src.clock <= 0 && d.splash) {
    src.clock = .06 / d.splash;
    const k = Math.random() - .5, x = src.x - src.dz * k * src.width, z = src.z + src.dx * k * src.width, at = this.field.sample(x, z, this.probe2);
    if (at) this.drop(x, at.level + src.height * (.4 + Math.random() * .6), z, (Math.random() - .5) * .3, -.5, (Math.random() - .5) * .3, .015 + Math.random() * .015);
    if (at && d.rings && Math.random() < .08 * d.rings) this.ring(x, z, at.level, .1, .6, 1, .06, .6, at.dx * at.speed * .5, at.dz * at.speed * .5);
    if (at && d.foam && Math.random() < .2 * d.foam) this.fleck(x, z, 1.2);
   }
   return true;
  });
 }

 // ---- pool primitives ----
 drop(x, y, z, vx, vy, vz, size) { if (this.detail.splash) this.pools.drops.add({ x, y, z, vx, vy, vz, size, age: 0, life: 2.2 }); }
 // A ring on the water at `level`: from `from` to `to` m over `life` s, of
 // `width` m, `glow` bright, drifting (vx, vz).
 ring(x, z, level, from, to, life, width, glow, vx = 0, vz = 0) { this.pools.rings.add({ x, z, level, from, to, life, width, glow, vx, vz, age: 0 }); }
 // A soft blob spreading on the water, fading; `drift`: carried downstream.
 patch(x, z, level, from, to, life, alpha, colour, drift) { this.pools.patches.add({ x, z, level, from, to, life, alpha, colour, drift, age: 0, yaw: Math.random() * 6.3, stretch: 1, dx: 1, dz: 0 }); }

 step(dt) {
  const f = this.field, probe = this.probe, t = this.time, wave = this.detail === WATER_DETAIL.extreme;
  // Extreme's swell rises a couple of centimetres: flat things ride just over its crests.
  const lift = wave ? .024 : 0;
  const { streaks, rings, patches, drops, floaters } = this.pools;

  let n = 0;
  for (const p of streaks.items) {
   p.age += dt; if (p.age >= p.life || !this.inWindow(p.channel, p.along, 6)) continue;
   const at = f.pointAt(p.channel, p.along, p.across, probe); if (!at) continue;
   p.along += at.speed * dt * p.channel.dir;
   const k = Math.min(1, p.age / .7) * Math.min(1, (p.life - p.age) / 1.1);
   streaks.items[n] = p;
   streaks.place(n, at.x, at.level + .012 + (wave ? swellAt(p.along, p.across / at.reach, t, p.channel.dir) : 0), at.z, p.width, 1, p.length * (1 + at.speed * .8), at.dx, at.dz);
   streaks.colour(n, STREAK, k * p.glow);
   n++;
  }
  streaks.finish(n);

  n = 0;
  for (const p of rings.items) {
   p.age += dt; if (p.age >= p.life) continue;
   rings.items[n] = p;
   p.x += p.vx * dt; p.z += p.vz * dt;
   const k = p.age / p.life, r = p.from + (p.to - p.from) * (1 - (1 - k) ** 2);
   rings.place(n, p.x, p.level + .014 + lift, p.z, r * 2, 1, r * 2, 0, 1);
   rings.extra.array[n] = Math.min(.6, p.width / r);
   rings.colour(n, RING, p.glow * (1 - k) ** 1.5 * Math.min(1, p.age / .08));
   n++;
  }
  rings.finish(n);

  n = 0;
  for (const p of patches.items) {
   p.age += dt; if (p.age >= p.life) continue;
   let dx = p.dx, dz = p.dz;
   if (p.drift) {
    const s = f.sample(p.x, p.z, probe);
    // Carried with the current until it reaches a bank; drawn out along it.
    if (s && s.depth > .02) { const step = s.speed * dt; p.x += s.dx * step; p.z += s.dz * step; p.level = s.level; dx = p.dx = s.dx; dz = p.dz = s.dz; p.stretch = Math.min(3, p.stretch + dt * .22); }
   }
   patches.items[n] = p;
   const k = p.age / p.life, r = p.from + (p.to - p.from) * (1 - (1 - Math.min(1, k * 2.2)) ** 2);
   patches.place(n, p.x, p.level + .016 + lift, p.z, r * 2, 1, r * 2 * p.stretch, dx, dz);
   patches.extra.array[n] = p.alpha * (1 - k) ** 1.3 * Math.min(1, p.age / .15);
   patches.colour(n, p.colour);
   n++;
  }
  patches.finish(n);

  n = 0;
  for (const p of drops.items) {
   p.age += dt; if (p.age >= p.life) continue;
   p.vy -= GRAVITY * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
   const s = f.sample(p.x, p.z, probe), floor = s && s.depth > 0 ? s.level : this.view.ground?.heightAt?.(p.x, p.z) ?? 0;
   if (p.y < floor && p.vy < 0) {
    // Back into the water with a tiny ring; on the bank it is just gone.
    if (s && s.depth > 0 && this.detail.rings && Math.random() < .25) this.ring(p.x, p.z, s.level, .03, .25, .5, .03, .6);
    continue;
   }
   drops.items[n] = p;
   const size = p.size * Math.min(1, (p.life - p.age) / .4);
   drops.place(n, p.x, p.y, p.z, size, size * (1 + Math.min(1.5, Math.abs(p.vy) * .15)), size, 0, 1);
   drops.colour(n, DROP);
   n++;
  }
  drops.finish(n);

  n = 0;
  for (const p of floaters.items) {
   p.age += dt; if (p.age >= p.life) continue;
   let x, z, level, across;
   if (p.leaf) {
    if (!this.inWindow(p.channel, p.along, 4)) continue;
    const at = f.pointAt(p.channel, p.along, p.across, probe); if (!at) continue;
    p.along += at.speed * .95 * dt * p.channel.dir; p.across = Math.max(-(at.water - .8), Math.min(at.water - .8, p.across + p.drift * dt));
    x = at.x; z = at.z; level = at.level; across = p.across / at.reach;
    // A leaf under a deck or on a gravel bar is hidden by it; no matter.
   } else {
    const s = f.sample(p.x, p.z, probe); if (!s || s.depth < .01) continue;
    const step = s.speed * dt; p.x += s.dx * step; p.z += s.dz * step;
    x = p.x; z = p.z; level = s.level; across = s.across / s.reach; p.along = s.along; p.dir = s.channel.dir;
   }
   p.yaw += p.spin * dt;
   floaters.items[n] = p;
   const fade = p.foam ? Math.min(1, (p.life - p.age) / 1.2) * Math.min(1, p.age / .2) : Math.min(1, p.age / .8);
   floaters.place(n, x, level + .008 + (wave ? swellAt(p.along ?? 0, across, t, p.channel?.dir ?? p.dir ?? 1) : 0), z, p.sx * fade, .5 * p.sx, p.sz * fade, Math.sin(p.yaw), Math.cos(p.yaw));
   floaters.colour(n, p.colour);
   n++;
  }
  floaters.finish(n);
 }

 // A map reset: blood, churn, drops, splashes and bleeding bodies go.
 clear() {
  for (const pool of Object.values(this.pools)) pool.clear();
  this.sources = this.sources.filter(s => s.kind !== 'body');
  this.bodies.clear(); this.leavesSeeded = false;
 }
}

// A count from a fractional amount (fractions fire now and then).
function count(amount) { return Math.floor(amount) + (Math.random() < amount % 1 ? 1 : 0); }

// Where the stream stirs by the crossings: along each deck's upstream and
// downstream sides where they stand in the water, over the ford's shallow
// riffles, and in a line across the weir's foot (below the dam).
export function crossingEmitters(field, map) {
 const out = [], probe = {};
 const add = (kind, x, z, r) => { const s = field.sample(x, z, probe); if (s && s.depth > .03) out.push({ kind, x, z, r, clock: Math.random() * 2 }); };
 for (const deck of map.terrain?.decks || []) {
  const [a, b, c, d] = deck.poly, weir = field.channels.some(ch => ch.damX > Math.min(a[0], c[0]) - 1 && ch.damX < Math.max(a[0], c[0]) + 1);
  // The deck's long sides (the ones crossing the stream), a post every metre or so.
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), sides = ab > bc ? [[a, b], [c, d]] : [[b, c], [d, a]];
  for (const [p, q] of sides) {
   const length = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.max(1, Math.round(length / (weir ? 1.2 : 2.6)));
   for (let i = 0; i <= n; i++) {
    const x = p[0] + (q[0] - p[0]) * i / n, z = p[1] + (q[1] - p[1]) * i / n;
    const s = field.sample(x, z, probe);
    // Downstream of the dam the weir churns; elsewhere a post in the flow.
    if (weir) { if (s && (x - s.channel.damX) * s.channel.dir > 0) add('weir', x + .3 * s.channel.dir, z, .35); }
    else if (s && s.depth > .4) add('post', x, z, .18);
   }
  }
 }
 // A dam that is the ground's own (a level across the stream, `overWater`,
 // with no deck at it): the weir's churn in a line across the channel at the
 // foot of its downstream face.
 for (const channel of field.channels) {
  if (!Number.isFinite(channel.damX) || (map.terrain?.decks || []).some(d => d.poly.some(([px]) => Math.abs(px - channel.damX) < 1))) continue;
  const at = channel.sections.reduce((best, q) => Math.abs(q.x - channel.damX) < Math.abs(best.x - channel.damX) ? q : best);
  const dam = (map.terrain?.levels || []).find(l => l.overWater && l.poly.some(([px]) => Math.abs(px - channel.damX) < 3));
  const xs = dam ? dam.poly.map(([px]) => px) : [channel.damX], face = channel.dir < 0 ? Math.min(...xs) : Math.max(...xs);
  for (let w = -at.water + .7; w <= at.water - .7; w += .9) add('weir', face + channel.dir * .5, at.z + at.mz * w, .35);
 }
 for (const ford of map.terrain?.fords || []) {
  const pts = ford.points;
  for (let i = 1; i < pts.length; i++) {
   const a = pts[i - 1], b = pts[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
   for (let t = 0; t < length; t += 1.1) for (let w = -ford.width / 2; w <= ford.width / 2; w += 1.2) {
    const ux = (b[0] - a[0]) / length, uz = (b[1] - a[1]) / length, x = a[0] + ux * t - uz * w, z = a[1] + uz * t + ux * w;
    const s = field.sample(x, z, probe);
    if (s && s.depth > .03 && s.depth < .3) out.push({ kind: 'riffle', x, z, r: .22, clock: Math.random() * 3 });
   }
  }
 }
 return out;
}
