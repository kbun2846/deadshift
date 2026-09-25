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

const CAPACITY = 64;
const RED = new THREE.Color('#ff3a2a'), FIRE_GLOW = new THREE.Color('#ff3a22'), FIRE_RING = new THREE.Color('#ff6a4a'), SPLIT_FLASH = new THREE.Color('#ffd0b8');

export class ScatterView {
 constructor(view) {
  this.view = view;
  this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: RED, toneMapped: false }), CAPACITY);
  this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  this.mesh.count = 0; this.mesh.visible = false; this.mesh.frustumCulled = false; this.mesh.castShadow = false;
  view.scene.add(this.mesh);
  this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
  this.trails = new WeakMap();
 }

 update(sim, dt) {
  const list = sim.scatterShells || [], fx = this.view.fx;
  let n = 0;
  for (const b of list) {
   if (n >= CAPACITY) break;
   // A shell starts at the muzzle, not the body.
   const lift = b.big ? .78 : .72, len = b.big ? .42 : .22, wide = b.big ? .15 : .09;
   this.p.set(b.x, lift, b.z); this.q.setFromAxisAngle(this.up, -Math.atan2(b.dz, b.dx)); this.s.set(len, wide, wide);
   this.mesh.setMatrixAt(n++, this.m.compose(this.p, this.q, this.s));
   // The trail, at a steady rate whatever the frame rate.
   if (fx?.on) {
    let t = (this.trails.get(b) ?? 0) - dt;
    if (t <= 0) {
     t += b.big ? .03 : .06;
     fx.ember({ x: b.x - b.dx * len * .6, y: lift, z: b.z - b.dz * len * .6, vx: -b.dx * .6, vz: -b.dz * .6, vy: .2, life: .28, size: b.big ? .05 : .03, rise: .1, stops: SCATTER_RED, glow: 1.6 });
     if (b.big && Math.random() < .35) fx.puff({ x: b.x, y: lift, z: b.z, vx: 0, vz: 0, vy: .3, size: .08, grow: 2.2, life: .6, alpha: .28, rise: .3, color: SMOKE });
    }
    this.trails.set(b, t);
   }
  }
  this.mesh.count = n; this.mesh.visible = n > 0;
  if (n) this.mesh.instanceMatrix.needsUpdate = true;
 }

 // `shooter`: whoever it came from (you, or another player's position/aim).
 event(e, shooter) {
  const v = this.view, fx = v.fx;
  if (e.type === 'scatterArm') {
   fx?.glow({ x: e.x, y: .8, z: e.z, size: 1.3, life: .25, color: RED, glow: 1.2 });
   return true;
  }
  if (e.type === 'scatterFire') {
   const dx = e.aimX ?? shooter?.aimX ?? 1, dz = e.aimZ ?? shooter?.aimZ ?? 0;
   fx?.muzzle('ballast', e.x, .77, e.z, dx, dz, 1);
   fx?.glow({ x: e.x + dx * .4, y: .8, z: e.z + dz * .4, size: 2.6, life: .18, color: FIRE_GLOW, glow: 1.8 });
   fx?.ring({ x: e.x + dx * .5, y: .77, z: e.z + dz * .5, radius: 2.4, from: .15, life: .3, color: FIRE_RING, glow: 1 });
   this.flash(e.x, e.z, 22);
   return true;
  }
  if (e.type === 'scatterSplit') {
   fx?.glow({ x: e.x, y: .75, z: e.z, size: 1.2, life: .1, color: SPLIT_FLASH, glow: 1.8 });
   for (let i = 0, n = fx?.n(7) || 0; i < n; i++) {
    const a = Math.atan2(e.dz || 0, e.dx || 1) + (Math.random() - .5) * 1.4, speed = 4 + Math.random() * 6;
    fx.spark({ x: e.x, y: .75, z: e.z, vx: Math.cos(a) * speed, vy: Math.random() * 2, vz: Math.sin(a) * speed, life: .15 + Math.random() * .2, stops: SCATTER_RED, length: .14, width: .02 });
   }
   return true;
  }
  if (e.type === 'scatterHit') { v.burst(e.x, e.z, e.big ? 8 : 4, 'hit'); return true; }
  if (e.type === 'scatterBurst') {
   fx?.miniBlast(e.x, e.z, e.radius || 1.4);
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
