import * as THREE from 'three';

// Detail effects: the extra layer of sparks, embers, smoke, flashes, shock
// rings and grit laid over every weapon, blast, fire and footstep. Everything
// here is cosmetic and never touches the simulation.
//
// Each kind of particle is one instanced mesh, so the whole layer is at most
// nine draws however busy the screen gets, and a kind with nothing alive is
// hidden (no draw at all). Matrices are written straight into the instance
// buffers, not through Object3D, because a grenade on Extreme is several
// hundred particles for a second or two.
//
// How much of it each preset gets is FX_DETAIL: a multiplier on every count.
// Potato gets none of it, Performance a light touch, Extreme the lot.
// Stand-in for code that runs without a view's detail layer (tests, previews).
export const NO_FX = Object.freeze({ on: false, level: 0 });

export const FX_DETAIL = Object.freeze({ potato: 0, performance: .3, balanced: .55, quality: 1, extreme: 1.8 });

// How big an orb blast looks, one step per orb that lands: 2-3 orbs are a
// small pop, 4-7 a medium blast, and around 10 is the full-size fireball
// (12 and the rarer bigger volleys go a little past it). Only the look scales;
// the blast radius and damage stay the simulation's (explosionFor).
export function orbBlastScale(count) {
  const orbs = Math.max(2, Math.min(16, count || 2));
  return .3 + .0875 * (orbs - 2);
}

const CAPACITY =Object.freeze({ spark: 700, ember: 320, puff: 420, glow: 160, ring: 48, hexRing: 24, pillar: 24, chunk: 240, streak: 96 });
const GRAVITY = 9.8;

// Colour over a spark's life: white-hot, yellow, orange, dull red. Electric
// sparks run white, ice blue, deep blue instead.
const HOT = [new THREE.Color('#fff8e6'), new THREE.Color('#ffd36b'), new THREE.Color('#ff8a2a'), new THREE.Color('#9c2a10')];
export const ELECTRIC = [new THREE.Color('#ffffff'), new THREE.Color('#bdefff'), new THREE.Color('#62b8ff'), new THREE.Color('#2a3cff')];
const SCRATCH = new THREE.Color();
function ramp(stops, t, out = SCRATCH) {
 const f = Math.min(.999, Math.max(0, t)) * (stops.length - 1), i = Math.floor(f);
 return out.copy(stops[i]).lerp(stops[i + 1], f - i);
}

function softTexture(size = 128) {
 const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
 const ctx = canvas.getContext('2d'), c = size / 2;
 const g = ctx.createRadialGradient(c, c, 0, c, c, c);
 g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
 ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
 const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
 return texture;
}

// A column of light: full at the ground, gone by the top.
function columnTexture() {
 const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 128;
 const ctx = canvas.getContext('2d'), g = ctx.createLinearGradient(0, 128, 0, 0);
 g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
 ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 128);
 const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
 return texture;
}

const additive = extra => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, ...extra });

// Smoke and dust: a round puff, shaded lighter on top than underneath so it
// reads as a volume, with edges that thin out to nothing instead of ending
// on a hard facet. Per-puff opacity comes in through its own attribute.
// Lumpy rather than round: every vertex is pushed in or out by a hash of
// where it sits, so each puff is a cauliflower of smoke, not a ball. Shared
// with the footstep dust.
export const LUMPY = `transformed *= 1.0 + .26 * (fract(sin(dot(position, vec3(12.9898, 78.233, 37.719))) * 43758.5453) - .5);`;

// `clear` holds the player's position: smoke thins out right around them,
// so a cloud never sits over the one thing the player has to see.
function puffMaterial(clear) {
 const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
 material.onBeforeCompile = shader => {
  shader.uniforms.clearPlayer = clear;
  shader.vertexShader = 'attribute float instanceAlpha; varying float vAlpha; varying float vFacing; varying float vTop; varying float vNear; uniform vec2 clearPlayer;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
   ${LUMPY}
   vAlpha = instanceAlpha;
   #ifdef USE_INSTANCING
   vNear = smoothstep(1.1, 3.2, distance((modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xz, clearPlayer));
   #else
   vNear = 1.0;
   #endif
   vec3 round = normalize(position);
   #ifdef USE_INSTANCING
   vec3 turned = normalize(mat3(instanceMatrix) * round);
   #else
   vec3 turned = round;
   #endif
   vTop = turned.y;
   vFacing = abs(normalize(mat3(modelViewMatrix) * turned).z);`);
  shader.fragmentShader = 'varying float vAlpha; varying float vFacing; varying float vTop; varying float vNear;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
   diffuseColor.rgb *= mix(.72, 1.12, vTop * .5 + .5);
   diffuseColor.a *= vAlpha * smoothstep(.02, .62, vFacing) * mix(.3, 1.0, vNear);`);
 };
 material.customProgramCacheKey = () => 'detail-puff';
 return material;
}

class Pool {
 constructor(scene, geometry, material, capacity, { colored = true, alpha = false, order = 0 } = {}) {
  this.capacity = capacity; this.items = [];
  if (alpha) geometry.setAttribute('instanceAlpha', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage));
  this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
  this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Allocated up front: per-instance colour is part of the shader, and a pool
  // that grew it on first use compiled a second program mid-game.
  if (colored) this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
  this.mesh.count = 0; this.mesh.visible = false; this.mesh.frustumCulled = false; this.mesh.renderOrder = order;
  this.matrices = this.mesh.instanceMatrix.array; this.colors = this.mesh.instanceColor?.array; this.alphas = alpha ? geometry.attributes.instanceAlpha.array : null;
  scene.add(this.mesh);
 }
 add(item) { if (this.items.length < this.capacity) this.items.push(item); else this.items[Math.floor(Math.random() * this.capacity)] = item; return item; }
 // Scaled about y, turned about y, at a position.
 flat(i, x, y, z, sx, sy, sz, yaw) {
  const m = this.matrices, o = i * 16, c = Math.cos(yaw), s = Math.sin(yaw);
  m[o] = c * sx; m[o + 1] = 0; m[o + 2] = -s * sx; m[o + 3] = 0;
  m[o + 4] = 0; m[o + 5] = sy; m[o + 6] = 0; m[o + 7] = 0;
  m[o + 8] = s * sz; m[o + 9] = 0; m[o + 10] = c * sz; m[o + 11] = 0;
  m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
 }
 // A unit box stretched along a direction: a streak of light or a sliver.
 along(i, x, y, z, dx, dy, dz, length, width) {
  const m = this.matrices, o = i * 16, l = Math.hypot(dx, dy, dz) || 1;
  const fx = dx / l, fy = dy / l, fz = dz / l;
  // Side axis: across the direction, on the ground plane where possible.
  let sx = fz, sz = -fx, sl = Math.hypot(sx, sz);
  if (sl < 1e-4) { sx = 1; sz = 0; sl = 1; }
  sx /= sl; sz /= sl;
  const ux = fy * sz, uy = fz * sx - fx * sz, uz = -fy * sx;
  m[o] = sx * width; m[o + 1] = 0; m[o + 2] = sz * width; m[o + 3] = 0;
  m[o + 4] = ux * width; m[o + 5] = uy * width; m[o + 6] = uz * width; m[o + 7] = 0;
  m[o + 8] = fx * length; m[o + 9] = fy * length; m[o + 10] = fz * length; m[o + 11] = 0;
  m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
 }
 color(i, color, scale = 1) { const c = this.colors, o = i * 3; c[o] = color.r * scale; c[o + 1] = color.g * scale; c[o + 2] = color.b * scale; }
 finish(count) {
  this.mesh.count = count; this.mesh.visible = count > 0;
  if (!count) return;
  this.mesh.instanceMatrix.needsUpdate = true;
  if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  if (this.alphas) this.mesh.geometry.attributes.instanceAlpha.needsUpdate = true;
 }
 clear() { this.items.length = 0; this.finish(0); }
}

export class DetailFX {
 constructor(scene) {
  this.scene = scene; this.level = 1; this.time = 0;
  this.clearZone = { value: new THREE.Vector2(1e5, 1e5) }; // set each frame to the player's position
  const glowMap = softTexture(128);
  const hex = new THREE.RingGeometry(.9, 1, 6); hex.rotateX(-Math.PI / 2);
  const ring = new THREE.RingGeometry(.93, 1, 56); ring.rotateX(-Math.PI / 2);
  const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
  const pillar = new THREE.CylinderGeometry(.5, .5, 1, 12, 1, true); pillar.translate(0, .5, 0);
  const box = new THREE.BoxGeometry(1, 1, 1);
  this.pools = {
   spark: new Pool(scene, box, additive(), CAPACITY.spark, { order: 3 }),
   streak: new Pool(scene, box.clone(), additive({ opacity: .85 }), CAPACITY.streak, { order: 3 }),
   ember: new Pool(scene, new THREE.IcosahedronGeometry(1, 0), additive(), CAPACITY.ember, { order: 3 }),
   puff: new Pool(scene, new THREE.IcosahedronGeometry(1, 2), puffMaterial(this.clearZone), CAPACITY.puff, { alpha: true, order: 1 }),
   glow: new Pool(scene, plane, additive({ map: glowMap }), CAPACITY.glow, { order: 4 }),
   ring: new Pool(scene, ring, additive({ side: THREE.DoubleSide }), CAPACITY.ring, { order: 2 }),
   hexRing: new Pool(scene, hex, additive({ side: THREE.DoubleSide }), CAPACITY.hexRing, { order: 2 }),
   pillar: new Pool(scene, pillar, additive({ side: THREE.DoubleSide, map: columnTexture() }), CAPACITY.pillar, { order: 4 }),
   chunk: new Pool(scene, new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), CAPACITY.chunk, { order: 0 }),
  };
 }

 get meshes() { return Object.values(this.pools).map(p => p.mesh); }
 setQuality(name) { this.level = FX_DETAIL[name] ?? 1; if (!this.level) this.clear(); }
 // A count scaled to the preset; fractions still fire now and then.
 n(base) { const exact = base * this.level; return Math.floor(exact) + (Math.random() < exact % 1 ? 1 : 0); }
 get on() { return this.level > 0; }

 // ---- primitives -------------------------------------------------------
 spark(o) { if (this.on) this.pools.spark.add({ born: this.time, life: .5, gravity: 1, drag: 1.5, bounce: .35, width: .018, length: .09, stops: HOT, glow: 1.4, y: .8, ...o }); }
 ember(o) { if (this.on) this.pools.ember.add({ born: this.time, life: 1.4, size: .03, rise: .9, wobble: 1, stops: HOT, glow: 1.2, ...o }); }
 puff(o) { if (this.on) this.pools.puff.add({ born: this.time, life: 1, size: .25, grow: 2, drag: 2.2, rise: .4, alpha: .5, fadeIn: .08, spin: (Math.random() - .5) * 1.2, yaw: Math.random() * 6.3, ...o }); }
 glow(o) { if (this.on) this.pools.glow.add({ born: this.time, life: .15, size: 1, grow: .4, glow: 1, flicker: 0, y: .8, ...o }); }
 ring(o) { if (this.on) this.pools[o.hex ? 'hexRing' : 'ring'].add({ born: this.time, life: .45, radius: 2, from: .1, glow: 1, y: .08, yaw: 0, width: 1, ...o }); }
 pillar(o) { if (this.on) this.pools.pillar.add({ born: this.time, life: .5, radius: .3, height: 4, glow: 1, ...o }); }
 chunk(o) { if (this.on) this.pools.chunk.add({ born: this.time, life: 2.4, size: .05, drag: .6, bounce: .3, spin: (Math.random() - .5) * 20, yaw: Math.random() * 6.3, y: .3, ...o }); }
 streak(o) { if (this.on) this.pools.streak.add({ born: this.time, life: .12, width: .03, glow: 1, ...o }); }

 // ---- weapon and world effects -----------------------------------------

 // A gun going off at (x, y, z) pointing along (dx, dz). `kind` is 'rifle' or
 // 'ballast'; `charge` (0..1) scales the Ballast's blast.
 muzzle(kind, x, y, z, dx, dz, charge = 0) {
  if (!this.on) return;
  const ballast = kind === 'ballast', power = ballast ? 1 + charge * 1.2 : .45;
  const sx = -dz, sz = dx;
  // The bloom of the flash itself, a hot core and petals venting to the sides.
  this.glow({ x, y, z, size: 1.1 * power, grow: .5, life: ballast ? .11 + charge * .05 : .06, color: new THREE.Color('#ffc46b'), glow: 1.6 });
  this.glow({ x: x + dx * .25 * power, y, z: z + dz * .25 * power, size: .45 * power, life: ballast ? .07 : .045, color: new THREE.Color('#fff4d8'), glow: 2 });
  for (const side of [-1, 1]) this.glow({ x: x + sx * side * .22 * power, y, z: z + sz * side * .22 * power, size: .4 * power, life: .06, color: new THREE.Color('#ffae4a'), glow: 1.2 });
  // The pressure ring leaving the muzzle, flat on the air in front of it.
  if (ballast) this.ring({ x: x + dx * .3, y, z: z + dz * .3, radius: 1 + charge * 1.4, from: .15, life: .18 + charge * .08, color: new THREE.Color('#ffe2b0'), glow: .7 });
  // Burning powder: bright streaks thrown out in a cone, falling as they cool.
  for (let i = 0, count = this.n(ballast ? 18 + charge * 26 : 6); i < count; i++) {
   const spread = (Math.random() - .5) * (ballast ? .9 : .5), speed = (ballast ? 6 : 5) + Math.random() * (ballast ? 9 + charge * 8 : 6);
   const c = Math.cos(spread), s = Math.sin(spread), vx = (dx * c - dz * s) * speed, vz = (dz * c + dx * s) * speed;
   this.spark({ x, y, z, vx, vy: (Math.random() - .2) * 2.2, vz, life: .12 + Math.random() * (ballast ? .35 : .18), length: .12 + Math.random() * .12, width: .016 + Math.random() * .012 });
  }
  // Smoke: a rolling cloud pushed out ahead, slowing, lifting and spreading.
  for (let i = 0, count = this.n(ballast ? 7 + charge * 9 : 3); i < count; i++) {
   const reach = Math.random() * (ballast ? 1.4 + charge : .5), speed = (ballast ? 2.2 : 1.4) * (1 - reach * .3) + Math.random();
   const side = (Math.random() - .5) * 1.4;
   this.puff({ x: x + dx * reach, y: y - .05, z: z + dz * reach, vx: dx * speed + sx * side, vz: dz * speed + sz * side, vy: .2 + Math.random() * .4,
    size: (ballast ? .16 : .08) * (1 + Math.random()), grow: ballast ? 3.2 : 2.4, life: (ballast ? 1.3 : .8) + Math.random() * .8, alpha: ballast ? .42 : .3,
    color: new THREE.Color('#cfc6b2').multiplyScalar(.85 + Math.random() * .2), rise: .5 });
  }
  if (ballast) for (let i = 0, count = this.n(4 + charge * 6); i < count; i++) {
   // Embers of wadding drifting down after the big shot.
   const speed = 3 + Math.random() * 4, spread = (Math.random() - .5) * .6;
   this.ember({ x, y, z, vx: (dx - dz * spread) * speed, vz: (dz + dx * spread) * speed, vy: .6, life: .9 + Math.random() * .8, size: .025 + Math.random() * .02, rise: -.4 });
  }
 }

 // Where a bullet or pellet lands: a spit of sparks off the hit, a puff of
 // whatever it hit and a few clods thrown.
 impact(x, z, ground, { dx = 0, dz = 0, hard = false } = {}) {
  if (!this.on) return;
  this.glow({ x, y: .25, z, size: .5, life: .05, color: new THREE.Color('#ffe7b0'), glow: 1.2 });
  for (let i = 0, count = this.n(hard ? 7 : 4); i < count; i++) {
   const a = Math.atan2(-dz, -dx) + (Math.random() - .5) * 2.2, speed = 2 + Math.random() * 4;
   this.spark({ x, y: .2, z, vx: Math.cos(a) * speed, vy: 1 + Math.random() * 3, vz: Math.sin(a) * speed, life: .15 + Math.random() * .25, length: .07, width: .012 });
  }
  const dust = ground || new THREE.Color('#b59a72');
  for (let i = 0, count = this.n(3); i < count; i++) this.puff({ x: x + (Math.random() - .5) * .2, y: .12, z: z + (Math.random() - .5) * .2,
   vx: (Math.random() - .5) * .8 - dx * .4, vz: (Math.random() - .5) * .8 - dz * .4, vy: .5 + Math.random() * .5, size: .07, grow: 3, life: .7 + Math.random() * .5, alpha: .45, color: dust.clone().multiplyScalar(.95 + Math.random() * .15) });
  for (let i = 0, count = this.n(3); i < count; i++) {
   const a = Math.random() * 6.3, speed = .8 + Math.random() * 2;
   this.chunk({ x, y: .1, z, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, vy: 1.5 + Math.random() * 2, size: .02 + Math.random() * .025, color: dust.clone().multiplyScalar(.7), life: 1.2 });
  }
 }

 // A fireball: flash, a double shock ring over the ground, a spray of hot
 // streaks, clods and grit thrown out, a column of smoke that rolls up and
 // leans with the wind, and embers left floating in it.
 //
 // `scale` shrinks the pieces whose size is fixed rather than tied to the blast
 // radius (smoke puffs, how far sparks and clods fly, flash brightness). Orb
 // blasts pass orbBlastScale(count); grenades pass nothing and keep the full size.
 explosion(x, z, radius, count = 6, ground = null, scale = 1) {
  if (!this.on) return;
  const s = scale, reach = .35 + .65 * s, bright = Math.min(1, .4 + .6 * s);
  const power = Math.min(2.2, .6 + count * .12) * Math.min(1, s), dust = ground || new THREE.Color('#a88c66');
  this.glow({ x, y: .4 + .6 * Math.min(1, s), z, size: radius * 2.6, grow: .3, life: .16, color: new THREE.Color('#fff1c8'), glow: 2.2 * bright });
  this.glow({ x, y: .15, z, size: radius * 3.2, grow: .2, life: .5 * reach, color: new THREE.Color('#ff8a33'), glow: .9 * bright });
  this.ring({ x, z, radius: radius * 1.35, from: .05, life: .38, color: new THREE.Color('#fff0cf'), glow: 1.3 * bright });
  if (s >= .45) this.ring({ x, z, radius: radius * 2, from: .2, life: .7, color: new THREE.Color('#ffb56b'), glow: .55 * bright });
  for (let i = 0, n = this.n(40 * power); i < n; i++) {
   const a = Math.random() * 6.3, speed = (4 + Math.random() * 10 * power) * reach;
   this.spark({ x, y: .5 * reach, z, vx: Math.cos(a) * speed, vy: (2 + Math.random() * 7) * reach, vz: Math.sin(a) * speed, life: .35 + Math.random() * .7 * reach, length: (.14 + Math.random() * .16) * reach, width: .022 });
  }
  for (let i = 0, n = this.n(22 * power); i < n; i++) {
   const a = Math.random() * 6.3, speed = (2 + Math.random() * 6) * reach;
   this.chunk({ x: x + Math.cos(a) * .3 * s, y: .2, z: z + Math.sin(a) * .3 * s, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, vy: (3 + Math.random() * 5) * reach, size: (.03 + Math.random() * .06) * reach, color: dust.clone().multiplyScalar(.55 + Math.random() * .35) });
  }
  // The column: dark at its core, pale dust around the base.
  for (let i = 0, n = this.n(16 * power); i < n; i++) {
   const a = Math.random() * 6.3, r = Math.random() * radius * .45;
   this.puff({ x: x + Math.cos(a) * r, y: (.4 + Math.random() * .6) * reach, z: z + Math.sin(a) * r, vx: (Math.cos(a) * 1.4 + .5) * reach, vz: Math.sin(a) * 1.4 * reach, vy: (1.4 + Math.random() * 1.8) * reach,
    size: (.35 + Math.random() * .3) * s, grow: 3, life: (1.8 + Math.random() * 1.2) * reach, alpha: .42, fadeIn: .15, drag: 1.4, rise: .7 * reach,
    color: new THREE.Color(i % 3 ? '#5c554c' : '#7d7466').multiplyScalar(.9 + Math.random() * .2) });
  }
  for (let i = 0, n = this.n(14 * power); i < n; i++) {
   const a = Math.random() * 6.3, r = radius * (.5 + Math.random() * .6);
   this.puff({ x: x + Math.cos(a) * r * .5, y: .15, z: z + Math.sin(a) * r * .5, vx: Math.cos(a) * 4 * reach, vz: Math.sin(a) * 4 * reach, vy: .3,
    size: .3 * s, grow: 3, life: (1.6 + Math.random()) * reach, alpha: .38, drag: 2.6, rise: .2, color: dust.clone().multiplyScalar(1.05 + Math.random() * .15) });
  }
  for (let i = 0, n = this.n(18 * power); i < n; i++) {
   const a = Math.random() * 6.3, r = Math.random() * radius * .6;
   this.ember({ x: x + Math.cos(a) * r, y: (.6 + Math.random()) * reach, z: z + Math.sin(a) * r, vx: Math.cos(a) * 1.5 * reach, vz: Math.sin(a) * 1.5 * reach, vy: (1.5 + Math.random() * 2) * reach, life: (1.2 + Math.random() * 1.6) * reach });
  }
 }

 // Static's electricity touching something: a blue-white spit of sparks that
 // do not fall like powder, a flash, and a thin ring.
 electric(x, y, z, power = 1, { ring = true } = {}) {
  if (!this.on) return;
  this.glow({ x, y, z, size: .9 * power, life: .09, color: new THREE.Color('#b8ecff'), glow: 1.6, flicker: 1 });
  if (ring) this.ring({ x, y: Math.max(.08, y - .6), z, radius: .9 * power, from: .1, life: .25, color: new THREE.Color('#9fe1ff'), glow: .8 });
  for (let i = 0, n = this.n(8 * power); i < n; i++) {
   const a = Math.random() * 6.3, speed = 2 + Math.random() * 5 * power;
   this.spark({ x, y, z, vx: Math.cos(a) * speed, vy: (Math.random() - .3) * 4, vz: Math.sin(a) * speed, life: .1 + Math.random() * .22, stops: ELECTRIC, gravity: .25, drag: 4, length: .1, width: .012, glow: 1.6 });
  }
 }

 // The hex pulse (X): a hexagon of light racing out over the ground, a column
 // of light at every node, sparks fountaining from them and a lingering ring.
 hexPulse(nodes, origin) {
  if (!this.on) return;
  const o = origin || nodes[0];
  this.ring({ hex: true, x: o.originX ?? o.x, z: o.originZ ?? o.z, radius: 13, from: .05, life: .55, color: new THREE.Color('#bfeeff'), glow: 1.4, yaw: nodes[0]?.age ?? 0 });
  this.ring({ hex: true, x: o.originX ?? o.x, z: o.originZ ?? o.z, radius: 9, from: .3, life: .9, color: new THREE.Color('#5fb4ff'), glow: .7, yaw: .3 });
  for (const n of nodes) {
   const r = n.power?.radius ?? 1.6;
   this.pillar({ x: n.x, z: n.z, radius: .28, height: 5.5, life: .5, color: new THREE.Color('#9fe3ff'), glow: 1.3 });
   this.pillar({ x: n.x, z: n.z, radius: .7, height: 3, life: .35, color: new THREE.Color('#4f9dff'), glow: .6 });
   this.ring({ hex: true, x: n.x, z: n.z, radius: r * 1.2, from: .1, life: .45, color: new THREE.Color('#dcf6ff'), glow: 1.1, yaw: Math.random() });
   this.electric(n.x, .75, n.z, 1.4, { ring: false });
   for (let i = 0, count = this.n(10); i < count; i++) {
    const a = Math.random() * 6.3, speed = 1 + Math.random() * 3;
    this.spark({ x: n.x, y: .2, z: n.z, vx: Math.cos(a) * speed, vy: 3 + Math.random() * 5, vz: Math.sin(a) * speed, life: .4 + Math.random() * .5, stops: ELECTRIC, gravity: .8, drag: 1.2, length: .12, width: .014, glow: 1.4 });
   }
  }
 }

 // Walking, dashing and skidding throw grit as well as haze: small clods of
 // the ground itself, kicked back and bouncing to rest.
 grit(x, z, color, dx = 0, dz = 0, amount = 1) {
  if (!this.on) return;
  for (let i = 0, count = this.n(3 * amount); i < count; i++) {
   const a = Math.atan2(-dz, -dx) + (Math.random() - .5) * 1.8, speed = (.6 + Math.random() * 1.6) * (.6 + amount * .4);
   this.chunk({ x: x + (Math.random() - .5) * .2, y: .05, z: z + (Math.random() - .5) * .2, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, vy: .8 + Math.random() * 1.6,
    size: .012 + Math.random() * .02, life: .9, color: color.clone().multiplyScalar(.72 + Math.random() * .2) });
  }
 }

 // ---- per frame --------------------------------------------------------
 update(dt) {
  this.time += dt;
  if (!this.on) return;
  const t = this.time, damp = k => Math.exp(-k * dt);
  const { spark, ember, puff, glow, ring, hexRing, pillar, chunk, streak } = this.pools;

  let n = 0;
  for (const p of spark.items) {
   const age = t - p.born; if (age >= p.life) continue; spark.items[n] = p;
   p.vx *= damp(p.drag); p.vz *= damp(p.drag); p.vy -= GRAVITY * p.gravity * dt;
   p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
   if (p.y < .02 && p.vy < 0) { p.y = .02; p.vy *= -p.bounce; p.vx *= .55; p.vz *= .55; }
   const k = age / p.life, speed = Math.hypot(p.vx, p.vy, p.vz);
   spark.along(n, p.x, p.y, p.z, p.vx, p.vy, p.vz, p.length * (.5 + Math.min(2.5, speed * .12)), p.width);
   spark.color(n, ramp(p.stops, k), p.glow * (1 - k * k));
   n++;
  }
  spark.items.length = n; spark.finish(n);

  n = 0;
  for (const p of ember.items) {
   const age = t - p.born; if (age >= p.life) continue; ember.items[n] = p;
   p.vx *= damp(1.6); p.vz *= damp(1.6); p.vy += (p.rise - p.vy) * (1 - damp(1.2));
   p.x += (p.vx + Math.sin(t * 3 + p.born * 7) * .3 * p.wobble) * dt; p.y = Math.max(.03, p.y + p.vy * dt); p.z += (p.vz + Math.cos(t * 2.6 + p.born * 5) * .3 * p.wobble) * dt;
   const k = age / p.life, flicker = .75 + .25 * Math.sin(t * 31 + p.born * 91);
   ember.flat(n, p.x, p.y, p.z, p.size, p.size, p.size, 0);
   ember.color(n, ramp(p.stops, .25 + k * .7), p.glow * flicker * (1 - k) * Math.min(1, age / .05));
   n++;
  }
  ember.items.length = n; ember.finish(n);

  n = 0;
  for (const p of puff.items) {
   const age = t - p.born; if (age >= p.life) continue; puff.items[n] = p;
   if (p.devil) {
    // Caught in a dust devil (dust-devils.js): circling its moving centre,
    // climbing, and swinging wider as it rises, so the column is a funnel.
    p.theta += p.omega * dt; p.y += p.up * dt;
    const r = p.r0 * (1 + p.y * .8);
    p.x = p.devil.x + Math.cos(p.theta) * r; p.z = p.devil.z + Math.sin(p.theta) * r;
   } else {
    p.vx *= damp(p.drag); p.vz *= damp(p.drag); p.vy *= damp(p.drag * .6);
    p.x += p.vx * dt; p.y += (p.vy + p.rise * .3) * dt; p.z += p.vz * dt;
   }
   const k = age / p.life, ease = 1 - (1 - k) ** 2, size = p.size * (1 + p.grow * ease);
   puff.flat(n, p.x, p.y, p.z, size, size * .72, size, p.yaw + p.spin * age);
   puff.color(n, p.color);
   puff.alphas[n] = p.alpha * Math.min(1, age / p.fadeIn) * (1 - k) ** 1.5;
   n++;
  }
  puff.items.length = n; puff.finish(n);

  n = 0;
  for (const p of glow.items) {
   const age = t - p.born; if (age >= p.life) continue; glow.items[n] = p;
   const k = age / p.life, size = p.size * (1 + p.grow * k), flick = p.flicker ? .7 + .3 * Math.sin(t * 90 + p.born * 50) : 1;
   glow.flat(n, p.x, p.y, p.z, size, 1, size, p.born * 13);
   glow.color(n, p.color, p.glow * flick * (1 - k) ** 1.4);
   n++;
  }
  glow.items.length = n; glow.finish(n);

  for (const pool of [ring, hexRing]) {
   n = 0;
   for (const p of pool.items) {
    const age = t - p.born; if (age >= p.life) continue; pool.items[n] = p;
    const k = age / p.life, reach = p.radius * (p.from + (1 - p.from) * (1 - (1 - k) ** 3));
    pool.flat(n, p.x, p.y, p.z, reach, 1, reach, p.yaw + k * (pool === hexRing ? .6 : 0));
    pool.color(n, p.color, p.glow * (1 - k) ** 1.3);
    n++;
   }
   pool.items.length = n; pool.finish(n);
  }

  n = 0;
  for (const p of pillar.items) {
   const age = t - p.born; if (age >= p.life) continue; pillar.items[n] = p;
   const k = age / p.life, width = p.radius * (1 + k * .8);
   pillar.flat(n, p.x, 0, p.z, width, p.height * (.4 + .6 * Math.min(1, age / .06)), width, t * 4);
   pillar.color(n, p.color, p.glow * (1 - k) ** 1.6);
   n++;
  }
  pillar.items.length = n; pillar.finish(n);

  n = 0;
  for (const p of chunk.items) {
   const age = t - p.born; if (age >= p.life) continue; chunk.items[n] = p;
   const grounded = !p.devil && p.y <= p.size && Math.abs(p.vy) < .4;
   if (p.devil) {
    // Grit and twigs whirled round a dust devil, climbing and flung wider.
    p.theta += p.omega * dt; p.y += p.up * dt;
    const r = p.r0 * (1 + p.y * .6);
    p.x = p.devil.x + Math.cos(p.theta) * r; p.z = p.devil.z + Math.sin(p.theta) * r;
   } else if (!grounded) {
    p.vy -= GRAVITY * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < p.size) { p.y = p.size; p.vy *= -p.bounce; p.vx *= .5; p.vz *= .5; p.spin *= .5; }
   }
   const k = age / p.life, shrink = k > .75 ? 1 - (k - .75) / .25 : 1, s = p.size * shrink;
   chunk.flat(n, p.x, p.y, p.z, s, s * .8, s, p.yaw + (grounded ? 0 : p.spin * age));
   chunk.color(n, p.color);
   n++;
  }
  chunk.items.length = n; chunk.finish(n);

  n = 0;
  for (const p of streak.items) {
   const age = t - p.born; if (age >= p.life) continue; streak.items[n] = p;
   const k = age / p.life, dx = p.x - p.fromX, dz = p.z - p.fromZ, length = Math.hypot(dx, dz);
   streak.along(n, (p.x + p.fromX) / 2, p.y, (p.z + p.fromZ) / 2, dx, 0, dz, Math.max(.01, length), p.width * (1 - k * .5));
   streak.color(n, p.color, p.glow * (1 - k));
   n++;
  }
  streak.items.length = n; streak.finish(n);
 }

 clear() { for (const pool of Object.values(this.pools)) pool.clear(); }
}
