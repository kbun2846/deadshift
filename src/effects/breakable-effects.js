// How Hollow Wick's breakables come apart (task s2-breakables; the models are
// world/hollow-breakables.js, the sounds effects/breakable-sounds.js).
//
// Each type has a recipe: debris in its own colours and shapes, and one thing
// it leaves behind or does that no other breakable does (a pumpkin's pulp, a
// keg's cider thrown in arcs and the wet stain under it, apples and logs that
// roll downhill and stay where they stop, a heap of grain, feathers drifting
// down, a swarm breaking up, a candle guttering out on the ground).
//
// Cheap by construction:
//  - Flying pieces are the view's own particles (renderer.js particles, the
//    tinted white pool), so a break adds no draw and obeys the preset's cap.
//  - What stays on the ground (rolling fruit and logs, stains, heaps, pulp)
//    is one instanced mesh for the whole map: flat-shaded Lambert with
//    per-instance colour, the same program as DetailFX's chunk pool, so it
//    compiles nothing new. At most LEAVINGS_CAP of them per preset; the
//    oldest goes first. Hidden when empty.
//  - Flames and glows use DetailFX (none on Potato, which gets a particle).
//  - Counts scale with the preset (DETAIL): Potato and Performance get fewer
//    pieces and fewer rollers.
// Everything here is cosmetic: the simulation only knows the prop broke.
import * as THREE from 'three';
import { HOLLOW_BREAKABLES, HB } from '../world/hollow-breakables.js';
import { nearColliders } from '../world/collider-grid.js';

export const LEAVINGS_CAP = Object.freeze({ potato: 48, performance: 96, balanced: 180, quality: 280, extreme: 320 });
// A multiplier on every count (pieces, rollers, feathers, bees).
export const DETAIL = Object.freeze({ potato: .4, performance: .6, balanced: 1, quality: 1.5, extreme: 2 });
const GRAVITY = 9.8, WHITE_POOL = 7;
// Rollers: how far one may travel from where it was thrown (a crate's apples
// run a little way down a slope, not across the map).
const ROLL_REACH = 2.6;

const colour = hex => new THREE.Color(hex);
const C = Object.fromEntries(Object.entries(HB).map(([k, v]) => [k, colour(v)]));
// A stain is wet earth: darker than the ground (#625840), never black.
const PULP = colour('#8a4a22'), SEED = colour('#d9c9a0'), CIDER = colour('#b8862f'), CIDER_DARK = colour('#8a5a1e'), STAIN = colour('#584d3a');
const FEATHER = colour('#d8d2c4'), FEATHER_BROWN = colour('#8f8272'), BEE = colour('#1e2024'), FLAME = colour('#ffb347'), TALLOW = colour('#d8c9a0');
const SHARD_GREY = colour('#9a9384');

// Which types this module handles (renderer.js breakProp dispatches on it).
export const handlesBreak = type => !!HOLLOW_BREAKABLES[type];

export class HollowBreakFX {
  constructor(view) {
    this.view = view; this.time = 0;
    this.items = []; this.floaters = []; this.emitters = [];
    this.dirty = false;
    const cap = LEAVINGS_CAP.extreme;
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Allocated up front (per-instance colour is part of the shader).
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.visible = false; this.mesh.frustumCulled = false;
    this.mesh.castShadow = false; this.mesh.receiveShadow = true;
    view.scene?.add(this.mesh);
    this.dummy = new THREE.Object3D(); this.dummy.rotation.order = 'YXZ';
    this.up = new THREE.Vector3(0, 1, 0); this.normal = new THREE.Vector3(); this.tilt = new THREE.Quaternion(); this.turn = new THREE.Quaternion();
    this.grad = { x: 0, z: 0 };
  }

  get detail() { return DETAIL[this.view.qualityName] ?? 1; }
  get cap() { return LEAVINGS_CAP[this.view.qualityName] ?? LEAVINGS_CAP.balanced; }
  n(base) { const exact = base * this.detail; return Math.max(1, Math.floor(exact) + (Math.random() < exact % 1 ? 1 : 0)); }
  gy(x, z) { return this.view.gy ? this.view.gy(x, z) : 0; }

  // ---- the break ---------------------------------------------------------
  break(e) {
    const recipe = RECIPES[e.propType]; if (!recipe) return;
    const s = e.scale || 1, dashed = !!e.dashed, dir = Math.atan2(e.directionZ || 0, e.directionX || 0);
    const angle = this.view.lastSim?.props?.find(p => p.id === e.id)?.angle ?? 0;
    recipe(this, { ...e, s, dashed, dir, angle, force: dashed ? 1.5 : 1, hasDir: !!(e.directionX || e.directionZ) });
    this.view.shake = Math.max(this.view.shake || 0, dashed ? .06 : .03);
  }

  // Flying pieces in the view's particle pool: `colours` (THREE.Color list),
  // `size`, `y` (height they start at), `speed`, `up` (upward speed), `fan`
  // (spread about the hit direction; a full circle when there was none),
  // `stretch` (long pieces), `sound` (the clatter when they land).
  pieces(e, count, { colours, size = .1, sizeJitter = .6, y = .4, yJitter = .3, speed = 2.4, up = 2.4, fan = 1.8, stretch = 1.6, sound = 'wood', spread = .35, life = 2 }) {
    const view = this.view, particles = view.particles; if (!particles) return;
    const cap = view.quality?.particleCap ?? 400;
    for (let i = 0; i < count && particles.length < cap; i++) {
      const a = e.hasDir ? e.dir + (Math.random() - .5) * fan * (e.dashed ? .7 : 1) : Math.random() * Math.PI * 2;
      const v = speed * (.45 + Math.random() * .9) * e.force, l = life * (.8 + Math.random() * .5);
      particles.push({ x: e.x + (Math.random() - .5) * spread * 2, z: e.z + (Math.random() - .5) * spread * 2, y: (y + Math.random() * yJitter) * e.s,
        vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: up * (.5 + Math.random() * .8),
        life: l, maxLife: l, size: size * (1 - sizeJitter / 2 + Math.random() * sizeJitter) * e.s, material: WHITE_POOL,
        tint: colours[i % colours.length].clone().multiplyScalar(.85 + Math.random() * .3),
        angle: Math.random() * 6.28, spin: (Math.random() - .5) * 14, stretch, debris: true, bounces: 0, sound });
    }
  }

  // A particle whose flight this module steers each frame (feathers, bees).
  floater(p, steer) { const view = this.view; if (!view.particles || view.particles.length >= (view.quality?.particleCap ?? 400)) return; view.particles.push(p); this.floaters.push({ p, steer, born: this.time }); }

  // Something left on the ground: `shape` 'flat' (a stain, a splat), 'heap'
  // (a mound) or 'lump' (a piece lying there). `size` its radius, `height`
  // its thickness, `life` seconds (Infinity: stays until the map resets),
  // `grow` seconds to reach full size, `fade` seconds of shrinking at the end.
  leave(x, z, { shape = 'flat', size = .4, height = .01, stretch = 1, yaw = Math.random() * 6.28, color, life = Infinity, grow = .25, fade = 6, sink = 0 }) {
    return this.add({ kind: shape, x, z, size, height, stretch, yaw, color, life, grow, fade, sink, age: 0 });
  }

  // A thing thrown that rolls (apples, squash, logs, a wheel, a lid): it
  // falls, bounces, rolls downhill on the ground's slope, slows and stays.
  // `form` 'ball', 'log' (rolls across its length) or 'disc' (rolls on its
  // rim, then topples flat).
  roll(x, z, { form = 'ball', r = .09, length = r, color, vx = 0, vz = 0, vy = 1.5, y = .5, friction = 1.2, reach = ROLL_REACH, life = Infinity, fade = 4, sound = 'plant', axis = Math.random() * 6.28 }) {
    return this.add({ kind: 'roll', form, x, z, y, vx, vz, vy, r, length, color, friction, reach, life, fade, sound, ox: x, oz: z,
      axis, spin: 0, tilt: 0, rest: false, age: 0, grow: 0, bounces: 0 });
  }

  add(item) {
    const cap = this.cap;
    while (this.items.length >= cap) this.items.shift();
    this.items.push(item); this.dirty = true; return item;
  }

  // Something that keeps happening for a while after the break: `tick(dt, t)`
  // each frame until `life` runs out.
  emit(life, tick) { this.emitters.push({ life, age: 0, tick }); }

  // ---- each frame ---------------------------------------------------------
  update(dt) {
    if (!dt) return;
    this.time += dt;
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const em = this.emitters[i]; em.age += dt; em.tick(dt, em.age / em.life, em);
      if (em.age >= em.life) this.emitters.splice(i, 1);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      if (f.p.life <= 0) { this.floaters.splice(i, 1); continue; }
      f.steer(f.p, dt, this.time - f.born);
    }
    if (!this.items.length) { if (this.mesh.visible) { this.mesh.count = 0; this.mesh.visible = false; } return; }
    let animating = this.dirty; this.dirty = false;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]; it.age += dt;
      if (it.age >= it.life) { this.items.splice(i, 1); animating = true; continue; }
      if (it.kind === 'roll' && !it.rest) { this.stepRoller(it, dt); animating = true; }
      else if (it.kind === 'roll' && it.form === 'disc' && it.tilt > -Math.PI / 2) { it.tilt = Math.max(-Math.PI / 2, it.tilt - dt * 4.5); animating = true; }
      if (it.age < it.grow + dt || it.life - it.age < it.fade) animating = true;
    }
    if (animating) this.draw();
  }

  stepRoller(it, dt) {
    const g = this.view.ground, grad = g?.gradientAt ? g.gradientAt(it.x, it.z, this.grad) : null;
    it.vy -= GRAVITY * dt; it.y += it.vy * dt;
    const floor = it.form === 'disc' ? it.r : it.form === 'log' ? it.r : it.r * .9;
    const onGround = it.y <= floor;
    if (onGround) {
      it.y = floor;
      if (it.vy < -1.2 && it.bounces < 3) { it.vy *= -.3; it.bounces++; this.view.onClatter?.(it.sound); } else it.vy = 0;
      // Downhill: a rolling body takes 5/7 of the slope's pull (a sphere);
      // a log only across its length.
      if (grad) { it.vx -= grad.x * GRAVITY * .71 * dt; it.vz -= grad.z * GRAVITY * .71 * dt; }
      if (it.form === 'log') {
        // Keep only the part of the velocity across the log's axis.
        const ax = Math.sin(it.axis), az = Math.cos(it.axis), along = it.vx * ax + it.vz * az;
        it.vx -= along * ax * .9; it.vz -= along * az * .9;
      }
      const speed = Math.hypot(it.vx, it.vz), drop = it.friction * dt;
      if (speed <= drop) { it.vx = 0; it.vz = 0; } else { it.vx *= (speed - drop) / speed; it.vz *= (speed - drop) / speed; }
    } else { it.vx *= Math.exp(-dt * .2); it.vz *= Math.exp(-dt * .2); }
    const nx = it.x + it.vx * dt, nz = it.z + it.vz * dt;
    // Walls, buildings, fences and retaining walls stop it; so does its reach
    // and the stream (it sinks where the water starts).
    // (On the ground it stops there; in the air it glances back.)
    if (this.blocked(nx, nz, it.r) || Math.hypot(nx - it.ox, nz - it.oz) > it.reach) { if (onGround) { it.vx = it.vz = 0; } else { it.vx *= -.2; it.vz *= -.2; } }
    else { it.x = nx; it.z = nz; }
    const speed = Math.hypot(it.vx, it.vz);
    if (speed > .02) {
      // Rolls about an axis across its way (local z: (sin axis, cos axis)).
      if (it.form !== 'log') it.axis = Math.atan2(-it.vz, it.vx);
      it.spin -= speed * dt / Math.max(.03, it.r);
    }
    if (g?.bankDistance && g.bankDistance(it.x, it.z) < -.4) { it.rest = true; it.sunk = true; }
    if (onGround && it.vy === 0 && speed < .03) it.rest = true;
  }

  blocked(x, z, r) {
    const colliders = this.view.lastSim?.colliders; if (!colliders) return false;
    for (const c of nearColliders(colliders, x - r - .1, z - r - .1, x + r + .1, z + r + .1)) {
      // (Breakables and ankle clutter let a roller by; solid props, walls and
      // fences, corn shocks, the crib, stop it like any wall.)
      if ((c.propId !== undefined && c.destructible) || c.walkOver) continue;
      const w = (c.localW ?? c.w) / 2 + r, d = (c.localD ?? c.d) / 2 + r, a = c.angle || 0;
      const dx = x - c.x, dz = z - c.z, cs = Math.cos(a), sn = Math.sin(a);
      const lx = a ? dx * cs - dz * sn : dx, lz = a ? dx * sn + dz * cs : dz;
      if (Math.abs(lx) < w && Math.abs(lz) < d) return true;
    }
    return false;
  }

  draw() {
    const m = this.mesh, d = this.dummy, n = Math.min(this.items.length, LEAVINGS_CAP.extreme);
    const g = this.view.ground;
    for (let i = 0; i < n; i++) {
      const it = this.items[i];
      const grow = it.grow > 0 ? Math.min(1, it.age / it.grow) : 1, left = it.life - it.age;
      const k = (left < it.fade ? Math.max(0, left / it.fade) : 1) * (grow < 1 ? 1 - (1 - grow) ** 2 : 1);
      const base = this.gy(it.x, it.z);
      if (it.kind === 'roll') {
        const flat = -it.tilt / (Math.PI / 2);
        const y = it.sunk ? base - it.r * 1.5 : base + (it.form === 'disc' ? it.y * (1 - flat) + it.length * flat : it.y);
        d.position.set(it.x, y, it.z);
        d.rotation.set(it.tilt, it.axis, it.spin, 'YXZ');
        const len = it.form === 'ball' ? it.r : it.length;
        d.scale.set(it.r * k, it.r * k, len * k);
      } else {
        // Laid on the slope: turned to the ground's normal under it.
        if (g?.gradientAt) { g.gradientAt(it.x, it.z, this.grad); this.normal.set(-this.grad.x, 1, -this.grad.z).normalize(); } else this.normal.copy(this.up);
        this.tilt.setFromUnitVectors(this.up, this.normal).multiply(this.turn.setFromAxisAngle(this.up, it.yaw));
        d.quaternion.copy(this.tilt);
        const h = it.height;
        d.position.set(it.x, base + (it.kind === 'flat' ? .015 : -it.sink), it.z);
        d.scale.set(it.size * it.stretch * k, h * Math.max(.2, k), it.size * k);
      }
      d.updateMatrix(); m.setMatrixAt(i, d.matrix); m.setColorAt(i, it.color);
    }
    m.count = n; m.visible = n > 0;
    m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
  }

  clear() {
    this.items.length = 0; this.floaters.length = 0; this.emitters.length = 0;
    this.mesh.count = 0; this.mesh.visible = false;
  }

  dispose() { this.clear(); this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.dispose?.(); }
}

// ---- helpers shared by the recipes ------------------------------------------
// A flat patch with a ragged outline: three overlapping blobs, each turned
// and stretched its own way (one flattened blob alone reads as a hexagon).
function smear(fx, x, z, size, color, { yaw = Math.random() * 6.28, reach = .45, ...rest } = {}) {
  for (let i = 0; i < 3; i++) {
    const a = yaw + i * 2.1 + Math.random() * .6, r = i ? size * reach * (.6 + Math.random() * .5) : 0;
    fx.leave(x + Math.cos(a) * r, z + Math.sin(a) * r, { size: size * (i ? .5 + Math.random() * .2 : .7), height: .01, stretch: 1 + Math.random() * .5, yaw: a, color: color.clone().multiplyScalar(.92 + Math.random() * .16), ...rest });
  }
}
// A scatter of small pieces lying round a spot (chips, straw, shards).
function litter(fx, x, z, n, radius, colours, { size = .06, height = .012, ...rest } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * radius;
    fx.leave(x + Math.cos(a) * r, z + Math.sin(a) * r, { shape: 'lump', size: size * (.7 + Math.random() * .6), height, stretch: 1.5 + Math.random(), color: jitter(colours[i % colours.length]), ...rest });
  }
}
const pick = list => list[Math.floor(Math.random() * list.length)];
const jitter = c => c.clone().multiplyScalar(.85 + Math.random() * .3);
// A throw away from the hit (or anywhere, with no direction).
function throwFrom(e, speed, fan = 1.6) {
  const a = e.hasDir ? e.dir + (Math.random() - .5) * fan : Math.random() * Math.PI * 2, v = speed * (.5 + Math.random() * .8) * e.force;
  return { vx: Math.cos(a) * v, vz: Math.sin(a) * v };
}
// A drifting feather: falls at a walking pace at most, swaying side to side.
// (Steered over the view's debris physics, which pulls down at 9 m/s².)
const featherSteer = phase => (p, dt, t) => {
  p.vy += dt * 8.6; if (p.vy < -.55) p.vy = -.55;
  p.vx += Math.sin(t * 3.1 + phase) * dt * 2.2; p.vz += Math.cos(t * 2.3 + phase) * dt * 1.4;
  p.spin = Math.sin(t * 4 + phase) * 3;
};
// A bee: circles the skep in a cloud that widens and drifts off, then is gone.
const beeSteer = (cx, cz, phase, radius, driftX, driftZ) => (p, dt, t) => {
  const r = radius * (.4 + t * 1.1), a = phase + t * (3.4 + (phase % 1) * 2);
  const tx = cx + driftX * t + Math.cos(a) * r, tz = cz + driftZ * t + Math.sin(a * 1.3) * r * .8, ty = .9 + Math.sin(a * 2.1) * .3 + t * .25;
  p.vx = (tx - p.x) * 5; p.vz = (tz - p.z) * 5; p.vy = (ty - p.y) * 5 + dt * 9;
};

// ---- the recipes --------------------------------------------------------------
const RECIPES = {
  // Bursts into orange chunks and pale seeds; a pulp splat stays on the
  // ground and fades, with a few chunks lying in it.
  pumpkin(fx, e) {
    fx.pieces(e, fx.n(12), { colours: [C.pumpkin, C.pumpkinDark, PULP], size: .13, y: .15, speed: 2.4, up: 3, stretch: 1.3, sound: 'plant' });
    fx.pieces(e, fx.n(10), { colours: [SEED], size: .035, y: .2, speed: 1.8, up: 2.2, stretch: 1.8, sound: 'plant', life: 1.6 });
    fx.pieces(e, 1, { colours: [C.stem], size: .09, y: .45, speed: 1, up: 4, stretch: 1.5, sound: 'wood' });
    smear(fx, e.x, e.z, .5 * e.s, PULP, { life: 28, fade: 10, grow: .2 });
    for (let i = 0, n = fx.n(3); i < n; i++) {
      const v = throwFrom(e, 1.4);
      fx.roll(e.x, e.z, { r: .09 + Math.random() * .05, length: .06, color: jitter(pick([C.pumpkin, C.pumpkinDark])), ...v, vy: 2.5, y: .3, friction: 3.5, life: 28, fade: 8, sound: 'plant' });
    }
  },
  // The keg bursts: staves and hoops fly, the cider comes out in amber arcs
  // for most of a second and leaves a dark wet stain that dries slowly.
  ciderKeg(fx, e) {
    fx.pieces(e, fx.n(12), { colours: [C.woodPale, C.wood, C.woodDark], size: .14, y: .7, speed: 2.8, up: 2.8, stretch: 2.6, sound: 'wood' });
    fx.pieces(e, fx.n(3), { colours: [C.iron], size: .16, y: .8, speed: 2, up: 3, stretch: 3.2, sound: 'clay' });
    const a = e.hasDir ? e.dir : Math.random() * 6.28;
    fx.emit(.9, (dt, t) => {
      const view = fx.view, cap = view.quality?.particleCap ?? 400;
      for (let i = 0, n = Math.max(1, Math.round(1.6 * fx.detail * dt * 60)); i < n && view.particles.length < cap; i++) {
        const side = Math.random() < .5 ? -1 : 1, spray = a + side * (.5 + Math.random() * .9), v = (2.8 - t * 2) * (.7 + Math.random() * .5);
        const l = .55 + Math.random() * .3;
        view.particles.push({ x: e.x + Math.cos(spray) * .3, z: e.z + Math.sin(spray) * .3, y: .85 * e.s, vx: Math.cos(spray) * v, vz: Math.sin(spray) * v, vy: 1.2 + Math.random() * 1.2,
          life: l, maxLife: l, size: .05 + Math.random() * .04, material: WHITE_POOL, tint: (Math.random() < .3 ? CIDER_DARK : CIDER).clone(), angle: Math.random() * 6, stretch: 1.4 });
      }
    });
    smear(fx, e.x, e.z, .75 * e.s, STAIN, { yaw: a, reach: .6, life: 60, fade: 20, grow: 1.1 });
    const v = throwFrom(e, 2);
    fx.roll(e.x, e.z, { form: 'disc', r: .06, length: .05, color: C.tin.clone(), ...v, vy: 3, y: .6, friction: 1.5, sound: 'clay' });
  },
  // Slats fly and the apples spill out, roll off down any slope and stay.
  appleCrate(fx, e) {
    fx.pieces(e, fx.n(10), { colours: [C.wood, C.woodPale, C.woodDark], size: .12, y: .3, speed: 2.4, up: 2.4, stretch: 2.8, sound: 'wood' });
    for (let i = 0, n = fx.n(9); i < n; i++) {
      const v = throwFrom(e, 1.8, 2.6);
      fx.roll(e.x + (Math.random() - .5) * .5, e.z + (Math.random() - .5) * .4, { r: .085, color: jitter(pick([C.apple, C.russet, C.apple, C.appleGold])), ...v, vy: 1 + Math.random() * 2, y: .45, friction: .9, sound: 'plant' });
    }
  },
  // The sacks tear: tatters of sacking, then the grain pours out for a
  // moment and builds a little heap that stays.
  grainSacks(fx, e) {
    fx.pieces(e, fx.n(8), { colours: [C.sacking, C.sackingDark], size: .16, sizeJitter: .8, y: .4, speed: 1.8, up: 2, stretch: 1.8, sound: 'plant' });
    fx.leave(e.x, e.z, { shape: 'heap', size: .55 * e.s, height: .2 * e.s, stretch: 1.2, color: C.straw.clone(), grow: 1.4, sink: .02 });
    fx.leave(e.x + .3, e.z - .2, { shape: 'heap', size: .3 * e.s, height: .1 * e.s, color: C.strawDark.clone(), grow: 1.6, sink: .02 });
    fx.leave(e.x - .25, e.z + .2, { shape: 'lump', size: .32, height: .1, stretch: 1.4, color: C.sacking.clone(), grow: .1, sink: .03 });
    fx.emit(1.3, dt => {
      const view = fx.view, cap = view.quality?.particleCap ?? 400;
      for (let i = 0, n = Math.max(1, Math.round(dt * 60 * .5 * fx.detail)); i < n && view.particles.length < cap; i++) {
        const l = .35 + Math.random() * .2, a = Math.random() * 6.28, r = Math.random() * .25;
        view.particles.push({ x: e.x + Math.cos(a) * r, z: e.z + Math.sin(a) * r, y: .5 + Math.random() * .2, vx: Math.cos(a) * .3, vz: Math.sin(a) * .3, vy: -.5,
          life: l, maxLife: l, size: .03 + Math.random() * .02, material: WHITE_POOL, tint: jitter(C.straw), angle: a, stretch: 1 });
      }
    });
  },
  // Planks and shingles go, and a cloud of old feathers bursts up and drifts
  // down slowly, some staying where they land.
  chickenCoop(fx, e) {
    fx.pieces(e, fx.n(12), { colours: [C.weathered, C.woodDark, C.weathered], size: .15, y: .5, speed: 2.6, up: 2.6, stretch: 2.6, sound: 'wood' });
    fx.pieces(e, fx.n(4), { colours: [C.shingle], size: .16, y: .9, speed: 2, up: 3, stretch: 1.5, sound: 'wood' });
    for (let i = 0, n = fx.n(16); i < n; i++) {
      const a = Math.random() * 6.28, v = .6 + Math.random() * 1.6, l = 3.5 + Math.random() * 2.5;
      fx.floater({ x: e.x + (Math.random() - .5) * .8, z: e.z + (Math.random() - .5) * .5, y: .6 + Math.random() * .4, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 2 + Math.random() * 2.5,
        life: l, maxLife: l, size: .07 + Math.random() * .04, material: WHITE_POOL, tint: (i % 4 ? FEATHER : FEATHER_BROWN).clone(), angle: a, spin: 3, stretch: 2.4, debris: true, bounces: 3 }, featherSteer(Math.random() * 6));
    }
    for (let i = 0, n = fx.n(5); i < n; i++) {
      const a = Math.random() * 6.28, r = .4 + Math.random() * 1.4;
      fx.leave(e.x + Math.cos(a) * r, e.z + Math.sin(a) * r, { shape: 'lump', size: .07, height: .012, stretch: 2.2, color: (i % 3 ? FEATHER : FEATHER_BROWN).clone(), life: 40, fade: 8, grow: 3 + Math.random() * 2 });
    }
    litter(fx, e.x, e.z, fx.n(6), .7, [C.straw, C.strawDark], { life: 50, fade: 10 });
  },
  // Straw coils burst off the stool and a dark swarm lifts out, circles
  // once, widens and breaks up.
  beeSkep(fx, e) {
    fx.pieces(e, fx.n(12), { colours: [C.straw, C.strawDark], size: .1, y: .7, speed: 2, up: 2.6, stretch: 2.8, sound: 'plant' });
    fx.pieces(e, fx.n(4), { colours: [C.wood, C.woodDark], size: .12, y: .4, speed: 1.8, up: 2, stretch: 2.4, sound: 'wood' });
    for (let i = 0; i < 2; i++) { const v = throwFrom(e, 1.2); fx.roll(e.x, e.z, { form: 'disc', r: .2 - i * .06, length: .05, color: (i ? C.strawDark : C.straw).clone(), ...v, vy: 2.5, y: .8, friction: 3, life: 40, fade: 8, sound: 'plant' }); }
    const driftA = Math.random() * 6.28, drift = 1.4 + Math.random();
    for (let i = 0, n = fx.n(24); i < n; i++) {
      const l = 2.2 + Math.random() * 1.6;
      fx.floater({ x: e.x, z: e.z, y: .8, vx: 0, vz: 0, vy: 0, life: l, maxLife: l, size: .04 + Math.random() * .02, material: WHITE_POOL, tint: BEE.clone(), angle: Math.random() * 6, spin: 8, stretch: 1.4, debris: true, bounces: 3 },
        beeSteer(e.x, e.z, Math.random() * 6.28, .5 + Math.random() * .6, Math.cos(driftA) * drift, Math.sin(driftA) * drift));
    }
  },
  // Salt-glazed shards and blue-banded pieces; the big crock's board lid
  // spins off like a coin, rolls and settles flat; a few big shards stay.
  stoneware(fx, e) {
    fx.pieces(e, fx.n(14), { colours: [C.stone, C.stoneDark, SHARD_GREY, C.cobalt], size: .08, y: .25, speed: 2.4, up: 2.8, stretch: 1.3, sound: 'clay' });
    const v = throwFrom(e, 2.4, 1);
    fx.roll(e.x, e.z, { form: 'disc', r: .24, length: .035, color: C.woodPale.clone(), ...v, vy: 3.2, y: .55, friction: 1, reach: 3.5, sound: 'wood' });
    for (let i = 0, n = fx.n(4); i < n; i++) {
      const a = Math.random() * 6.28, r = Math.random() * .6;
      fx.leave(e.x + Math.cos(a) * r, e.z + Math.sin(a) * r, { shape: 'lump', size: .1 + Math.random() * .06, height: .035, stretch: 1.3, color: jitter(i % 3 ? C.stone : C.cobalt), life: 45, fade: 8, grow: .3, sink: .005 });
    }
    smear(fx, e.x, e.z, .35, STAIN, { life: 40, fade: 15, grow: .8 });
  },
  // Tin clatters off the crook, the post comes down, and the candle keeps
  // burning where it lands for a few seconds, guttering, then goes out in a
  // curl of smoke.
  tinLantern(fx, e) {
    fx.pieces(e, fx.n(8), { colours: [C.tin, C.tinDark], size: .07, y: 1.1, speed: 1.8, up: 2, stretch: 1.5, sound: 'clay' });
    const v = throwFrom(e, 1.2), post = throwFrom(e, .8);
    fx.roll(e.x, e.z, { form: 'log', r: .06, length: .55, color: C.woodDark.clone(), ...post, vy: 1, y: .6, friction: 3, axis: (e.hasDir ? e.dir : Math.random() * 6) + Math.PI / 2, sound: 'wood' });
    fx.roll(e.x, e.z, { form: 'disc', r: .11, length: .12, color: C.tin.clone(), ...v, vy: 2.5, y: 1.2, friction: 2.2, sound: 'clay' });
    // The candle: where it lands (a short throw), burning.
    const cx = e.x + v.vx * .35, cz = e.z + v.vz * .35;
    fx.leave(cx, cz, { shape: 'lump', size: .04, height: .04, stretch: 2.4, color: TALLOW.clone(), grow: .3, sink: -.03 });
    fx.leave(cx, cz, { size: .16, height: .008, stretch: 1.3, color: STAIN.clone().multiplyScalar(.8), life: 90, fade: 30, grow: 5 });
    const burn = 5.5 + Math.random() * 1.5;
    fx.emit(burn, (dt, t, em) => {
      const view = fx.view, gutter = t > .7 ? (Math.random() < .35 ? .2 : 1) * (1 - t) / .3 : 1;
      em.clock = (em.clock || 0) - dt; if (em.clock > 0) return; em.clock = .05;
      if (view.fx?.on) {
        view.fx.ember({ x: cx + (Math.random() - .5) * .05, y: .08, z: cz + (Math.random() - .5) * .05, vx: (Math.random() - .5) * .2, vz: (Math.random() - .5) * .2, vy: .5, life: .35 * gutter + .1, size: .025 + .02 * gutter, rise: 1 });
        view.fx.glow({ x: cx, y: .06, z: cz, size: .7 * (.6 + .4 * gutter) * (.85 + Math.random() * .3), life: .08, color: FLAME, glow: .7 * gutter });
      } else if (view.particles && view.particles.length < (view.quality?.particleCap ?? 48)) {
        view.particles.push({ x: cx, z: cz, y: .1, vx: 0, vz: 0, vy: .9, life: .25, maxLife: .25, size: .06 * gutter + .02, material: WHITE_POOL, tint: FLAME.clone(), angle: 0 });
      }
      if (view.fxLight && (view.fxLightLevel ?? 0) < 3) { view.fxLight.color.set('#ffae52'); view.fxLight.position.set(cx, .4 + fx.gy(cx, cz), cz); view.fxLightLevel = (2 + Math.random()) * gutter; }
      if (t > .97 && view.fx?.on && !em.smoked) { em.smoked = true; for (let i = 0; i < 3; i++) view.fx.puff({ x: cx, y: .15, z: cz, vx: .1, vz: 0, vy: .5, size: .05, grow: 3, life: 1.6, alpha: .35, rise: .6, color: new THREE.Color('#7d776d') }); }
    });
  },
  // Split logs tumble off the pile and roll down the slope, knocking as they
  // land, and stay where they stop; bark chips fly.
  cordwood(fx, e) {
    fx.pieces(e, fx.n(10), { colours: [C.bark, C.split, C.woodDark], size: .1, y: .4, speed: 2.2, up: 2.4, stretch: 2, sound: 'wood' });
    const along = e.angle;
    for (let i = 0, n = Math.max(3, fx.n(7)); i < n; i++) {
      const v = throwFrom(e, 1.6, 2.2), x = e.x + (Math.random() - .5) * 1.2, z = e.z + (Math.random() - .5) * .5;
      fx.roll(x, z, { form: 'log', r: .08, length: .3 + Math.random() * .08, color: jitter(i % 3 ? C.bark : C.split), ...v, vy: 1.4 + Math.random() * 2, y: .3 + Math.random() * .4, friction: 1.6, axis: along + Math.PI / 2 + (Math.random() - .5) * .8, sound: 'wood' });
    }
    litter(fx, e.x, e.z, fx.n(8), .9, [C.split, C.bark], { size: .07, life: 80, fade: 20 });
  },
  // The barrow splits, the squash roll off and stay, and the wheel runs
  // away on its rim before it topples over.
  squashBarrow(fx, e) {
    fx.pieces(e, fx.n(10), { colours: [C.wood, C.woodPale, C.woodDark], size: .13, y: .5, speed: 2.4, up: 2.4, stretch: 2.6, sound: 'wood' });
    for (let i = 0, n = Math.max(2, fx.n(5)); i < n; i++) {
      const v = throwFrom(e, 1.5, 2.4);
      fx.roll(e.x + (Math.random() - .5) * .6, e.z + (Math.random() - .5) * .4, { r: .15 + Math.random() * .04, length: .13, color: jitter(pick([C.squashGold, C.squashGrey, C.pumpkin])), ...v, vy: 1.5 + Math.random(), y: .7, friction: 1.4, sound: 'plant' });
    }
    const v = throwFrom(e, 3, .8);
    fx.roll(e.x, e.z, { form: 'disc', r: .26, length: .05, color: C.woodDark.clone(), ...v, vy: 1.5, y: .3, friction: .8, reach: 4.5, sound: 'wood', axis: Math.atan2(v.vx, v.vz) + Math.PI / 2 });
  },
};

export const BREAK_RECIPES = Object.freeze(Object.keys(RECIPES));
