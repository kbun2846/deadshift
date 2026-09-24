// Dust devils (Extreme only): now and then a whirl of sand lifts off the open
// ground upwind, a leaning funnel of dust a few metres tall, and wanders
// across the view with the wind before it breaks up. It walks round anything
// solid by dying out against it rather than passing through.
//
// Cosmetic only, and nearly free: the funnel is made of the detail layer's
// own dust puffs (effects-detail.js; a puff with `devil` set circles the
// devil's centre instead of drifting), plus a little grit kicked up at its
// foot. No new meshes, materials or draws.
export const DUST_DEVIL = Object.freeze({
 every: [35, 70],     // seconds between devils (the first comes sooner)
 life: [13, 19],      // seconds a devil lasts
 speed: [2, 3.1],     // m/s, downwind
 puffs: 44,           // per second at full strength
});

import * as THREE from 'three';

const between = ([a, b]) => a + Math.random() * (b - a);
const BRUSH = new THREE.Color('#5e4a2e');

export class DustDevils {
 constructor(fx) { this.fx = fx; this.devil = null; this.clock = 12 + Math.random() * 14; this.puffDebt = 0; this.gritDebt = 0; }

 // view: { x, z, halfWidth, halfDepth } of the camera's ground footprint;
 // blocked(x, z): something solid there; ground(x, z): the kicked dust colour.
 update(dt, on, view, blocked, ground) {
  if (!on) { this.devil = null; return; }
  const d = this.devil;
  if (!d) {
   this.clock -= dt;
   if (this.clock > 0) return;
   this.clock = between(DUST_DEVIL.every);
   // Born just off the upwind (west) edge, somewhere down its length.
   const x = view.x - view.halfWidth - 2, z = view.z + (Math.random() - .5) * view.halfDepth * 1.4;
   if (blocked(x, z)) { this.clock = 3; return; }
   const heading = (Math.random() - .5) * .5;
   this.devil = { x, z, age: 0, life: between(DUST_DEVIL.life), speed: between(DUST_DEVIL.speed), heading, wander: Math.random() * 6.3, color: ground(x, z) };
   return;
  }
  d.age += dt;
  d.heading += Math.sin(d.age * .8 + d.wander) * .35 * dt;
  const nx = d.x + Math.cos(d.heading) * d.speed * dt, nz = d.z + Math.sin(d.heading) * d.speed * dt;
  // Against a wall or a stack: it spends itself there.
  if (blocked(nx, nz)) d.life = Math.min(d.life, d.age + 1.2); else { d.x = nx; d.z = nz; }
  if (d.age >= d.life) { this.devil = null; return; }
  // Up over the first two seconds, down over the last two.
  const strength = Math.min(1, d.age / 2, (d.life - d.age) / 2);
  if (Math.floor(d.age * 2) !== Math.floor((d.age - dt) * 2)) d.color = ground(d.x, d.z);
  this.puffDebt += DUST_DEVIL.puffs * strength * dt;
  for (; this.puffDebt >= 1; this.puffDebt--) {
   const size = .16 + Math.random() * .18;
   this.fx.puff({ devil: d, theta: Math.random() * 6.3, omega: 4 + Math.random() * 3.5, r0: .18 + Math.random() * .3, up: .9 + Math.random() * .9,
    x: d.x, y: .04 + Math.random() * .2, z: d.z, size, grow: 1.4, life: 1.6 + Math.random() * .9, alpha: (.2 + Math.random() * .12) * strength,
    fadeIn: .25, color: d.color.clone().multiplyScalar(.78 + Math.random() * .2) });
  }
  // Grit and bits of brush caught in it, circling faster than the dust.
  this.gritDebt += 14 * strength * dt;
  for (; this.gritDebt >= 1; this.gritDebt--) {
   const twig = Math.random() < .3;
   this.fx.chunk({ devil: d, theta: Math.random() * 6.3, omega: 6 + Math.random() * 4, r0: .15 + Math.random() * .35, up: .7 + Math.random() * 1.1,
    x: d.x, y: .05, z: d.z, size: twig ? .03 : .014 + Math.random() * .016, life: 1.3 + Math.random() * .8,
    color: twig ? BRUSH : d.color.clone().multiplyScalar(.6 + Math.random() * .2) });
  }
 }
}
