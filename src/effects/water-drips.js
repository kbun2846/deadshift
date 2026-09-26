// Water running off a body that has just stepped out of a stream (owner,
// 2026-09-26: on the good presets, water drips from the player for a moment
// after they leave the stream). The deeper they waded, the longer and heavier
// it drips: about two seconds at most, thinning out. Drops are the effect
// pool's small lit chunks in a pale water grey; they fall, sit on the ground
// as wet specks for a moment and are gone. Balanced and up only (the pool's
// level is .55 there); nothing on Potato and Performance.
import * as THREE from 'three';

const DROP = new THREE.Color('#9fb2b6'), DARK = new THREE.Color('#6f8286');
const DRIP_TIME = 2.2, MIN_LEVEL = .5;

export class WaterDrips {
 constructor(fx) { this.fx = fx; this.wet = 0; this.clock = 0; }
 clear() { this.wet = 0; this.clock = 0; }
 // share: how deep the body stands in water now, 0..1 of WADE.depth; x, z
 // where it is drawn.
 update(dt, x, z, share) {
  if (share > 0) { this.wet = Math.max(this.wet, Math.min(1, .35 + share)); return; }
  if (!(this.wet > 0)) return;
  this.wet = Math.max(0, this.wet - dt / DRIP_TIME);
  const fx = this.fx;
  if (!fx.on || fx.level < MIN_LEVEL) return;
  this.clock -= dt;
  if (this.clock > 0) return;
  this.clock = .04 + (1 - this.wet) * .14;
  for (let i = 0, n = fx.n(1.6 * this.wet); i < n; i++) {
   // Off the coat's hem, the sleeves and the gun: round the body, from
   // knee to chest height.
   const a = Math.random() * Math.PI * 2, r = .14 + Math.random() * .16;
   fx.chunk({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, y: .25 + Math.random() * .75, vx: 0, vy: -.3 - Math.random() * .4, vz: 0,
    size: .014 + Math.random() * .012, color: Math.random() < .3 ? DARK : DROP, life: .55 + Math.random() * .35, bounce: 0, spin: 0 });
  }
 }
}
