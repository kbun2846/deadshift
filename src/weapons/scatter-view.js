// What Ballast's Scatter looks like (weapons/scatter.js is the rules).
//
// Shells: one InstancedMesh for every red shell in flight (yours and other
// players', from the draw sim): big ones long and fat, small ones short,
// glowing red (unlit, so they read in shade), each leaving a dotted trail of
// red embers and, for the big ones, a thread of dark smoke.
// Events: readied (a red glow at the gun), fired (a red muzzle blast, a
// kick of the view), split (a flash and a spit of sparks where a big shell
// breaks), hit (sparks), and the little explosions (EffectsDetail.miniBlast
// plus a red flicker of the effects light). Everything else comes from the
// shared effect pools; this adds one draw while shells fly and none after.
import * as THREE from 'three';
import { SCATTER_RED } from '../effects/effects-detail.js';
import { SCATTER } from '../config/gameplay.js';
import { groundY, hilly, roundFlight } from '../render/ground-lift.js';

const CAPACITY = 64;
const RED = new THREE.Color('#ff3a2a'), FIRE_GLOW = new THREE.Color('#ff3a22'), FIRE_RING = new THREE.Color('#ff6a4a'), SPLIT_FLASH = new THREE.Color('#ffd0b8');
// More of everything on Quality and Extreme (owner, v0.9b): heat haze glows
// round the big shells, spark streaks behind them, a cone of sparks and a
// rolling smoke bank at the muzzle, shock rings, a swirl of embers while
// readied, pillars of fire and flying slag where they burst.
const HEAT = new THREE.Color('#ff5a1e'), CORE = new THREE.Color('#ffe2b0'), PILLAR = new THREE.Color('#ff4a24'), SLAG = new THREE.Color('#3a1a14'), DARK_SMOKE = new THREE.Color('#2e2522'), ORANGE = new THREE.Color('#ff8a3a');
// Quality and Extreme (FX_DETAIL quality 1, extreme 1.8).
const rich = fx => (fx?.level || 0) >= 1;

export class ScatterView {
 constructor(view) {
  this.view = view;
  this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: RED, toneMapped: false }), CAPACITY);
  this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  this.mesh.count = 0; this.mesh.visible = false; this.mesh.frustumCulled = false; this.mesh.castShadow = false;
  view.scene.add(this.mesh);
  this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
  this.trails = new WeakMap(); this.glides = new WeakMap();
 }

 update(sim, dt) {
  const list = sim.scatterShells || [], fx = this.view.fx, hills = hilly(this.view);
  let n = 0;
  for (const b of list) {
   if (n >= CAPACITY) break;
   // A shell starts at the muzzle, not the body.
   const lift = b.big ? .78 : .72, len = b.big ? .42 : .22, wide = b.big ? .15 : .09;
   // (Hills: on its flight over the ground, as rifle rounds are.)
   const under = hills ? this.view.ground.flightAt(roundFlight(this.view, this.glides, b, b.x - b.dx * b.travel, b.z - b.dz * b.travel, groundY(this.view, b.x - b.dx * b.travel, b.z - b.dz * b.travel), b.limit), b.travel) : 0;
   this.p.set(b.x, lift + under, b.z); this.q.setFromAxisAngle(this.up, -Math.atan2(b.dz, b.dx)); this.s.set(len, wide, wide);
   this.mesh.setMatrixAt(n++, this.m.compose(this.p, this.q, this.s));
   // The trail, at a steady rate whatever the frame rate.
   if (fx?.on) {
    let t = (this.trails.get(b) ?? 0) - dt;
    if (t <= 0) {
     t += b.big ? .03 : .06;
     fx.ember({ x: b.x - b.dx * len * .6, y: lift, z: b.z - b.dz * len * .6, vx: -b.dx * .6, vz: -b.dz * .6, vy: .2, life: .28, size: b.big ? .05 : .03, rise: .1, stops: SCATTER_RED, glow: 1.6 });
     if (b.big && Math.random() < .35) fx.puff({ x: b.x, y: lift, z: b.z, vx: 0, vz: 0, vy: .3, size: .08, grow: 2.2, life: .6, alpha: .28, rise: .3, color: SMOKE });
     if (rich(fx)) {
      // A hot haze round the shell, and sparks thrown off behind it.
      fx.glow({ x: b.x, y: lift, z: b.z, size: b.big ? .75 : .4, grow: .2, life: .09, color: HEAT, glow: 1.3 });
      for (let i = 0, n = fx.n(b.big ? 1.4 : .6); i < n; i++) {
       const a = Math.atan2(-b.dz, -b.dx) + (Math.random() - .5) * 1.1, speed = 2 + Math.random() * 4;
       fx.spark({ x: b.x, y: lift, z: b.z, vx: Math.cos(a) * speed, vy: Math.random() * 1.5, vz: Math.sin(a) * speed, life: .12 + Math.random() * .18, stops: SCATTER_RED, length: .1, width: .016 });
      }
      if (b.big) fx.ember({ x: b.x + (Math.random() - .5) * .2, y: lift, z: b.z + (Math.random() - .5) * .2, vx: (Math.random() - .5), vz: (Math.random() - .5), vy: .8, life: .6, size: .035, rise: .5, stops: SCATTER_RED, glow: 1.8 });
     }
    }
    this.trails.set(b, t);
   }
  }
  this.mesh.count = n; this.mesh.visible = n > 0;
  if (n) this.mesh.instanceMatrix.needsUpdate = true;
  this.readied(sim, dt);
 }

 // Readied, until it fires (owner, v143: obvious it is on): a red ring on the
 // ground that pulses faster and tightens while it charges (SCATTER.prime),
 // embers drawn in round you, a glow at the gun; once charged, a steady
 // bright ring and a faster swirl.
 readied(sim, dt) {
  const fx = this.view.fx, sc = sim.scatter, at = this.view.player?.position;
  if (!fx?.on || !sc?.armed || sim.player.dead || !at) { this.pulseIn = 0; return; }
  const k = Math.min(1, (sc.armedFor || 0) / SCATTER.prime), primed = k >= 1;
  this.pulseIn = (this.pulseIn || 0) - dt;
  if (this.pulseIn <= 0) {
   this.pulseIn = primed ? .32 : .6 - k * .35;
   fx.ring({ x: at.x, z: at.z, radius: primed ? 1.05 : 1.9 - k * .8, from: primed ? 1.2 : 2.4 - k * .9, life: primed ? .34 : .5, color: primed ? CORE : FIRE_RING, glow: .7 + k * .7 });
   fx.glow({ x: at.x, y: .8, z: at.z, size: .9 + k * .8, life: .3, color: RED, glow: .8 + k });
  }
  this.emberIn = (this.emberIn || 0) - dt;
  if (this.emberIn <= 0) {
   this.emberIn = primed ? .03 : .07 - k * .03;
   const a = Math.random() * 6.3, r = 1.1 + Math.random() * .6;
   fx.ember({ x: at.x + Math.cos(a) * r, y: .25 + Math.random() * .5, z: at.z + Math.sin(a) * r, vx: -Math.cos(a) * r * 2 - Math.sin(a) * 1.5, vz: -Math.sin(a) * r * 2 + Math.cos(a) * 1.5, vy: .5, life: .42, size: .035 + k * .02, rise: .3, stops: SCATTER_RED, glow: 1.6 + k });
  }
 }

 // `shooter`: whoever it came from (you, or another player's position/aim).
 event(e, shooter) {
  const v = this.view, fx = v.fx;
  if (e.type === 'scatterArm') {
   fx?.glow({ x: e.x, y: .8, z: e.z, size: 1.3, life: .25, color: RED, glow: 1.2 });
   // Readied: embers swirl in to the gun, and a low red ring.
   for (let i = 0, n = fx?.n(rich(fx) ? 14 : 6) || 0; i < n; i++) {
    const a = Math.random() * 6.3, r = 1 + Math.random() * .8;
    fx.ember({ x: e.x + Math.cos(a) * r, y: .3 + Math.random() * .6, z: e.z + Math.sin(a) * r, vx: -Math.cos(a) * r * 2.2, vz: -Math.sin(a) * r * 2.2, vy: .6, life: .45, size: .04, rise: .3, stops: SCATTER_RED, glow: 1.8 });
   }
   fx?.ring({ x: e.x, z: e.z, radius: 1.2, from: 1.9, life: .35, color: FIRE_RING, glow: .9 });
   return true;
  }
  if (e.type === 'scatterPrimed') {
   // Charged: a bright snap of light and a ring, so it reads as ready.
   fx?.glow({ x: e.x, y: .8, z: e.z, size: 2.2, life: .22, color: CORE, glow: 1.8 });
   fx?.ring({ x: e.x, z: e.z, radius: 2.2, from: .3, life: .4, color: CORE, glow: 1.4 });
   return true;
  }
  if (e.type === 'scatterFire') {
   const dx = e.aimX ?? shooter?.aimX ?? 1, dz = e.aimZ ?? shooter?.aimZ ?? 0;
   fx?.muzzle('ballast', e.x, .77, e.z, dx, dz, 1);
   fx?.glow({ x: e.x + dx * .4, y: .8, z: e.z + dz * .4, size: 2.6, life: .18, color: FIRE_GLOW, glow: 1.8 });
   fx?.ring({ x: e.x + dx * .5, y: .77, z: e.z + dz * .5, radius: 2.4, from: .15, life: .3, color: FIRE_RING, glow: 1 });
   this.flash(e.x, e.z, 22);
   // The rest of the blast (more on Quality and Extreme): a cone of sparks
   // and streaks along the volley, a white-hot core, a second shock ring, a
   // rolling bank of dark smoke, grit kicked up under the muzzle.
   if (fx?.on) {
    const heading = Math.atan2(dz, dx), big = rich(fx);
    fx.glow({ x: e.x + dx * .3, y: .8, z: e.z + dz * .3, size: 1.2, life: .08, color: CORE, glow: 2.2 });
    fx.ring({ x: e.x, z: e.z, radius: big ? 4.2 : 3, from: .3, life: .5, color: HEAT, glow: 1.2 });
    for (let i = 0, n = fx.n(big ? 30 : 14); i < n; i++) {
     const a = heading + (Math.random() - .5) * 1.2, speed = 9 + Math.random() * 14;
     fx.spark({ x: e.x + dx * .4, y: .78, z: e.z + dz * .4, vx: Math.cos(a) * speed, vy: Math.random() * 3, vz: Math.sin(a) * speed, life: .18 + Math.random() * .3, stops: SCATTER_RED, length: .16 + Math.random() * .12, width: .022 });
    }
    for (let i = 0, n = fx.n(big ? 10 : 4); i < n; i++) {
     const a = heading + (Math.random() - .5) * .9, speed = 1.5 + Math.random() * 3;
     fx.puff({ x: e.x + dx * .8, y: .6, z: e.z + dz * .8, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, vy: .5, size: .3 + Math.random() * .2, grow: 3, life: 1.2 + Math.random() * .8, alpha: .42, rise: .5, color: i % 2 ? DARK_SMOKE : SMOKE });
    }
    if (big) for (let i = 0, n = fx.n(8); i < n; i++) fx.ember({ x: e.x + dx * .6, y: .8, z: e.z + dz * .6, vx: Math.cos(heading) * (2 + Math.random() * 4) + (Math.random() - .5) * 2, vz: Math.sin(heading) * (2 + Math.random() * 4) + (Math.random() - .5) * 2, vy: 1 + Math.random() * 2, life: .8 + Math.random() * .6, size: .04, rise: .4, stops: SCATTER_RED, glow: 2 });
    fx.grit?.(e.x, e.z, SLAG, -dx, -dz, big ? 1.4 : .7);
   }
   return true;
  }
  if (e.type === 'scatterSplit') {
   fx?.glow({ x: e.x, y: .75, z: e.z, size: 1.2, life: .1, color: SPLIT_FLASH, glow: 1.8 });
   if (rich(fx)) { fx.ring({ x: e.x, z: e.z, radius: .9, from: .1, life: .22, color: ORANGE, glow: 1.3, y: .7 }); fx.glow({ x: e.x, y: .7, z: e.z, size: 2, life: .2, color: HEAT, glow: 1 }); }
   for (let i = 0, n = fx?.n(7) || 0; i < n; i++) {
    const a = Math.atan2(e.dz || 0, e.dx || 1) + (Math.random() - .5) * 1.4, speed = 4 + Math.random() * 6;
    fx.spark({ x: e.x, y: .75, z: e.z, vx: Math.cos(a) * speed, vy: Math.random() * 2, vz: Math.sin(a) * speed, life: .15 + Math.random() * .2, stops: SCATTER_RED, length: .14, width: .02 });
   }
   return true;
  }
  if (e.type === 'scatterHit') { v.burst(e.x, e.z, e.big ? 8 : 4, 'hit'); return true; }
  if (e.type === 'scatterBurst') {
   fx?.miniBlast(e.x, e.z, e.radius || 1.4);
   // Quality and Extreme: a short pillar of fire, flying slag, a second ring.
   if (rich(fx)) {
    fx.pillar?.({ x: e.x, z: e.z, radius: .35, height: 2.2, life: .3, color: PILLAR, glow: 1.4 });
    fx.ring({ x: e.x, z: e.z, radius: (e.radius || 1.4) * 1.6, from: .3, life: .4, color: HEAT, glow: .8 });
    for (let i = 0, n = fx.n(4); i < n; i++) { const a = Math.random() * 6.3, speed = 2 + Math.random() * 4; fx.chunk({ x: e.x, y: .3, z: e.z, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, vy: 2 + Math.random() * 3, size: .03 + Math.random() * .03, color: SLAG, life: 1.4 }); }
   }
   v.surfaceMarks?.enqueue?.('explosion', { x: e.x, z: e.z, radius: (e.radius || 1.4) * .5 });
   this.flash(e.x, e.z, 8);
   return true;
  }
  return false;
 }

 // The effects light, red, for a moment (every tier with lights has it).
 flash(x, z, level) {
  const v = this.view; if (!v.fxLight) return;
  v.fxLight.color.set('#ff5a3a'); v.fxLight.position.set(x, 1.1, z); v.fxLightLevel = Math.max(v.fxLightLevel || 0, level);
 }

 clear() { this.mesh.count = 0; this.mesh.visible = false; }
}
const SMOKE = new THREE.Color('#4a3a36');
