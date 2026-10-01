// Lumen stage 4: how the city's breakables come apart (design 9; the types and
// models are world/lumen-breakables.js, the sounds effects/lumen-break-sounds.js).
// `LumenBreakFX` is Hollow Wick's break effect (effects/breakable-effects.js:
// pieces in the view's particle pool, one instanced mesh for everything that
// stays on the ground, rollers that run downhill, emitters and floaters) with
// twenty-two recipes of its own, so it is the one break effect of a city map
// (`makeBreakFX`) and adds no mesh but the hydrant's mist.
//
// Each type comes apart in its own way and leaves its own mark, all of it
// staying until the map is reset (the oldest goes first past the preset's
// LEAVINGS_CAP):
//   cityVending  glass, cans that roll, a sticky puddle, sparks and a dying screen
//   cityTrashBags  bag scraps, paper drifting down, bottles that roll, a slumped heap
//   cityHydrant  the cap rolls off; a 6 s jet (spray, mist, a puddle that spreads)
//   cityChargePost  plastic, a whipping cable, arcs and a flash, a scorch
//   cityCone  it tumbles away; its black foot stays
//   cityCrate / cityDeliveryBox / cityStool / cityPlasticChair  plastic and cardboard
//   cityMeshBin / cityRecycleBin  wire, bins that roll, lids, bottles and litter
//   cityCableReel  flanges that roll away, the cable unspooled in a line
//   cityWaterBarrier  plastic, a spray of water and a wide puddle
//   cityBicycle / cityBikeRack  wheels that run off on their rims, frame tubes, a bell
//   cityScooter / cityScooterHeap  wheels, a battery that pops, then smoulders
//   cityFoodCart  pans and lids, spilled food, steam, a scorch of gas
//   cityParcelLocker  doors, parcels tumbling out, dead LEDs
//   cityShopGlass  a fine shattering, glass crumbs everywhere, the frame
//   cityInfoTerminal  the screen implodes, the board arcs
//   cityParkingMeter  brass coins that spin, roll far and lie about
//
// Cheap by construction (as Hollow Wick's): counts scale with the preset,
// flying pieces are the particle pool's (nothing new to draw), the DetailFX
// layer (sparks, embers, puffs) is used where the preset has it and a few
// particles stand in on Potato. Everything here is cosmetic; the simulation
// only knows the prop broke. The hydrant's mist is the one thing drawn for
// its own sake: it blocks sight for everyone (world/lumen-breakables.js
// jetsBlockSight), so every preset shows it, as the steam vents' clouds:
// one instanced mesh of soft puffs on the steam vents' own shader (no new
// program), hidden unless a jet runs, at most four jets at once.
import * as THREE from 'three';
import { HollowBreakFX } from './breakable-effects.js';
import { steamMaterial } from './steam-vents.js';
import { JET } from '../world/lumen-breakables.js';
import { CITY } from '../world/lumen-kit.js';

const WHITE_POOL = 7;

// The hot colours on screen: what glows (sparks, embers, flashes, the fx light
// over a smoulder). Each ramp is read by DetailFX at its glow multiplier (a
// spark x1.5, an ember x1.2, a flash x1.5) and the orange middle of a classic
// fire ramp lands within 6-9 CIEDE2000 of Amber there, so the city's fire is
// the wrecks' ember red (effects/lumen-wrecks.js #ff5a22): a pale cream that
// jumps straight to a red-orange, never through orange. Every sample along
// every ramp stays 18+ from the team colours at its multiplier
// (tests/lumen-breakables.test.js measures them: 17+ with a margin for bloom).
export const BREAK_GLOW = Object.freeze({
  flame: '#ff5a22',                                                  // the fx light and Potato's embers over a smoulder
  ember: Object.freeze({ stops: Object.freeze(['#fff4dc', '#ff4a2a', '#b8301a', '#3a1a12']), glow: 1.2 }),
  hotSparks: Object.freeze({ stops: Object.freeze(['#fff8e6', '#ffe4d0', '#ff4a2a', '#9c2a10']), glow: 1.5 }),
  coolSparks: Object.freeze({ stops: Object.freeze(['#ffffff', '#e3ebff', '#b6bcd8', '#191e2e']), glow: 1.5 }), // a live wire: blue-white to a steel lavender (a periwinkle tail passed 14.6 from Violet at x1.5)
  whiteSparks: Object.freeze({ stops: Object.freeze(['#ffffff', '#f2f6ff', '#ccd4e0', '#2e343e']), glow: 1.5 }), // glass and screens: white to a neutral dark (a slate tail passed 16 from Violet)
  gasFlash: '#ff4a2a',                                               // the food cart's gas: its flash glows x1.5
  flashes: Object.freeze(['#dbe6ff', '#dfe8ff', '#e6f0ff', '#ffe9f2', '#ffe4d0']), glow: 1.5,
});
const c = hex => new THREE.Color(hex);
const K = {
  steel: c(CITY.steel), steelMid: c(CITY.steelMid), steelDark: c(CITY.steelDark), graphite: c(CITY.graphite), black: c('#15171c'), panel: c(CITY.panel),
  concrete: c(CITY.concreteDark), glass: c('#7f9fb8'), glassDim: c('#4c6a86'), glassDark: c('#1c2735'),
  white: c(CITY.plasticWhite), grey: c(CITY.plasticGrey), red: c(CITY.plasticRed), green: c(CITY.plasticGreen), blue: c(CITY.plasticBlue), yellow: c('#c9bd22'),
  cardboard: c(CITY.cardboard), cardboardDark: c(CITY.cardboardDark), paper: c(CITY.paper), foam: c('#dcdcd6'), tape: c('#a58a55'),
  hydrant: c('#8a2a34'), hydrantDark: c('#5e1c25'), water: c('#3a536b'), waterDark: c('#2e4459'), spray: c('#d6e4f2'),
  bagA: c('#1d2026'), bagB: c('#26303f'), bagC: c('#20302a'), bottle: c('#2a4a34'), bottleClear: c('#9fb8b0'),
  can: [c('#c23a48'), c('#a8ff3c'), c('#b8a85a'), c('#e8e8e8'), c('#3a5a8c')],
  sticky: c('#3a2830'), scorch: c('#0f1116'), scorchWarm: c('#1c1512'),
  wood: c(CITY.woodPale), woodDark: c(CITY.wood), cable: c('#15171c'), copper: c('#a0622f'), coin: c('#b8a85a'), coinDark: c('#8a7a3c'),
  sauce: c('#8a2a34'), noodle: c('#d9c48a'), greens: c('#3f6a3f'), broth: c('#5a3a24'), awning: c('#8a2f3a'),
  board: c('#2f5a3f'), flame: c(BREAK_GLOW.flame), warm: c('#f4b088'), cool: c('#dfe8ff'),
};
// The ramps as colours, made once (nothing is allocated as they burn).
const COOL_SPARKS = BREAK_GLOW.coolSparks.stops.map(c), HOT_SPARKS = BREAK_GLOW.hotSparks.stops.map(c);
const WHITE_SPARKS = BREAK_GLOW.whiteSparks.stops.map(c), EMBER = BREAK_GLOW.ember.stops.map(c);

export const handlesLumenBreak = type => Object.hasOwn(RECIPES, type);

// ---- helpers shared by the recipes ------------------------------------------
const pick = list => list[Math.floor(Math.random() * list.length)];
const jitter = col => col.clone().multiplyScalar(.85 + Math.random() * .3);
const rnd = (a, b) => a + Math.random() * (b - a);
const particleCap = fx => fx.view.quality?.particleCap ?? 400;

function throwFrom(e, speed, fan = 1.6) {
  const a = e.hasDir ? e.dir + (Math.random() - .5) * fan : Math.random() * Math.PI * 2, v = speed * (.5 + Math.random() * .8) * e.force;
  return { vx: Math.cos(a) * v, vz: Math.sin(a) * v };
}
// A ragged patch: three overlapping blobs, each turned and stretched its own way.
function smear(fx, x, z, size, color, { yaw = Math.random() * 6.28, reach = .45, ...rest } = {}) {
  const made = [];
  for (let i = 0; i < 3; i++) {
    const a = yaw + i * 2.1 + Math.random() * .6, r = i ? size * reach * (.6 + Math.random() * .5) : 0;
    made.push(fx.leave(x + Math.cos(a) * r, z + Math.sin(a) * r, { size: size * (i ? .5 + Math.random() * .2 : .7), height: .01, stretch: 1 + Math.random() * .5, yaw: a, color: color.clone().multiplyScalar(.92 + Math.random() * .16), ...rest }));
  }
  return made;
}
// Small pieces lying about a spot.
function litter(fx, x, z, n, radius, colours, { size = .06, height = .012, stretch = 1.5, ...rest } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * radius;
    fx.leave(x + Math.cos(a) * r, z + Math.sin(a) * r, { shape: 'lump', size: size * (.7 + Math.random() * .6), height, stretch: stretch + Math.random(), color: jitter(colours[i % colours.length]), ...rest });
  }
}
// Sparks from a point: DetailFX's where the preset has it, a few glowing
// particles on Potato.
function sparks(fx, x, y, z, n, { stops = COOL_SPARKS, speed = 3.4, up = 2.4, life = .32, length = .1 } = {}) {
  const d = fx.view.fx;
  if (d?.on) {
    for (let i = 0, k = d.n(n); i < k; i++) {
      const a = Math.random() * 6.28, v = speed * (.4 + Math.random() * .8);
      d.spark({ x, y, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: (Math.random() - .25) * up * 2, life: life * (.6 + Math.random() * .8), stops, gravity: .6, drag: 2.2, length, width: .012, glow: BREAK_GLOW.hotSparks.glow });
    }
    return;
  }
  const view = fx.view, cap = particleCap(fx);
  for (let i = 0, k = Math.max(1, Math.round(n * fx.detail * .3)); i < k && view.particles.length < cap; i++) {
    const a = Math.random() * 6.28, v = speed * .5 * (.4 + Math.random() * .8), l = .18 + Math.random() * .16;
    view.particles.push({ x, z, y, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 1 + Math.random() * up, life: l, maxLife: l, size: .045, material: WHITE_POOL, tint: stops[1].clone(), angle: Math.random() * 6, stretch: 1.6 });
  }
}
// The shared fx light (one for the whole view, only when idle): a flash.
function flash(fx, x, y, z, color, level = 4) {
  const view = fx.view;
  if (view.fxLight && (view.fxLightLevel ?? 0) < 3) { view.fxLight.color.set(color); view.fxLight.position.set(x, y + fx.gy(x, z), z); view.fxLightLevel = level; }
  if (view.fx?.on) view.fx.glow({ x, y, z, size: 1.1, life: .08, color: new THREE.Color(color), glow: BREAK_GLOW.glow, flicker: 1 });
}
// A puff of smoke or steam: DetailFX's, or nothing on Potato.
function puff(fx, x, y, z, { size = .16, grow = 3, life = 1.4, alpha = .35, rise = .6, color = K.steelMid, vx = 0, vz = 0 } = {}) {
  fx.view.fx?.puff({ x, y, z, vx, vz, vy: .4, size, grow, life, alpha, rise, color });
}
// Glass: shards flying (a lot of small ones), the crumbs staying.
function glassShards(fx, e, count, { y = 1, yJitter = .8, size = .06, colours = [K.glass, K.glassDim, K.white] } = {}) {
  fx.pieces(e, count, { colours, size, y, yJitter, speed: 2.6, up: 2.6, stretch: 1.5, sound: 'clay', spread: .5, life: 1.8 });
}
// A paper-light thing drifting down (cardboard, cloth, paper), falling at
// most `fall` m/s, swaying.
const driftSteer = (phase, fall = .8) => (p, dt, t) => {
  p.vy += dt * 8.4; if (p.vy < -fall) p.vy = -fall;
  p.vx += Math.sin(t * 2.7 + phase) * dt * 1.8; p.vz += Math.cos(t * 2.1 + phase) * dt * 1.2;
  p.spin = Math.sin(t * 3.4 + phase) * 2.4;
};
function drifters(fx, e, count, colours, { y = .5, size = .1, life = 3, fall = .8, stretch = 1.7, gap = 1.4 } = {}) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * 6.28, v = .5 + Math.random() * gap, l = life * (.8 + Math.random() * .6);
    fx.floater({ x: e.x + (Math.random() - .5) * .5, z: e.z + (Math.random() - .5) * .4, y: (y + Math.random() * .3) * e.s, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 2 + Math.random() * 2,
      life: l, maxLife: l, size: size * (.8 + Math.random() * .5) * e.s, material: WHITE_POOL, tint: jitter(colours[i % colours.length]), angle: a, spin: 3, stretch, debris: true, bounces: 3 }, driftSteer(Math.random() * 6, fall));
  }
}
// Droplets thrown in arcs for `life` seconds from a point (`rate` per second
// at Balanced; scaled by the preset), `lean` toward a direction.
function spray(fx, life, { x, z, y = .5, rate = 40, up = 2.6, spread = .9, lean = 0, dir = 0, size = .06, colour = K.spray, dark = null, fade = true, ttl = .8, stop = null }) {
  fx.emit(life, (dt, t, em) => {
    if (stop?.()) { em.age = em.life; return; }
    const view = fx.view, cap = particleCap(fx), strength = fade ? 1 - t * .7 : 1;
    em.acc = (em.acc || 0) + rate * fx.detail * dt * strength;
    while (em.acc >= 1) {
      em.acc--; if (view.particles.length >= cap) break;
      const a = Math.random() * 6.28, r = Math.random() * spread, l = ttl * (.7 + Math.random() * .6);
      view.particles.push({ x, z, y, vx: Math.cos(a) * r + Math.cos(dir) * lean, vz: Math.sin(a) * r + Math.sin(dir) * lean, vy: up * (.6 + Math.random() * .7),
        life: l, maxLife: l, size: size * (.7 + Math.random() * .7), material: WHITE_POOL, tint: (dark && Math.random() < .3 ? dark : colour).clone(), angle: Math.random() * 6, stretch: 1.2 });
    }
  });
}
// Fizzling sparks for a while (a broken screen, a live cable).
function fizz(fx, x, y, z, life, { every = .1, n = 3, stops = COOL_SPARKS } = {}) {
  fx.emit(life, (dt, t, em) => {
    em.clock = (em.clock || 0) - dt; if (em.clock > 0) return;
    em.clock = every * (1 + t * 3) * (.6 + Math.random() * .8);
    sparks(fx, x + (Math.random() - .5) * .2, y, z + (Math.random() - .5) * .2, n * (1 - t * .6), { stops, speed: 1.6, up: 1.4, life: .3 });
  });
}
// Smouldering (a battery cell): embers and a wisp, guttering out.
function smoulder(fx, x, z, life, y = .15) {
  fx.emit(life, (dt, t, em) => {
    em.clock = (em.clock || 0) - dt; if (em.clock > 0) return; em.clock = .12;
    const view = fx.view, d = view.fx, level = 1 - t;
    if (d?.on) {
      if (Math.random() < level) d.ember({ x: x + (Math.random() - .5) * .3, y, z: z + (Math.random() - .5) * .3, vx: (Math.random() - .5) * .2, vz: (Math.random() - .5) * .2, vy: .5, life: .5 * level + .2, size: .03, rise: 1, glow: BREAK_GLOW.ember.glow, stops: EMBER });
      if (Math.random() < .5) puff(fx, x, y + .1, z, { size: .08, grow: 4, life: 1.6, alpha: .3 * level, rise: .8, color: c('#5e5a55') });
    } else if (view.particles && view.particles.length < particleCap(fx) && Math.random() < level) {
      view.particles.push({ x, z, y, vx: 0, vz: 0, vy: .8, life: .3, maxLife: .3, size: .05 * level + .02, material: WHITE_POOL, tint: K.flame.clone(), angle: 0 });
    }
    if (t < .5 && view.fxLight && (view.fxLightLevel ?? 0) < 2) { view.fxLight.color.set(BREAK_GLOW.flame); view.fxLight.position.set(x, .3 + fx.gy(x, z), z); view.fxLightLevel = (1 + Math.random()) * (1 - t); }
  });
}
// A bounded string of lumps (a cable, a chain) laid out from a spot.
function strand(fx, x, z, dir, n, step, color, { size = .1, stretch = 2.2, wiggle = .25, ...rest } = {}) {
  let px = x, pz = z, a = dir;
  for (let i = 0; i < n; i++) {
    a += (Math.random() - .5) * wiggle * 2; px += Math.cos(a) * step; pz += Math.sin(a) * step;
    fx.leave(px, pz, { shape: 'lump', size, height: .03, stretch, yaw: -a, color: i === n - 1 ? K.copper.clone() : jitter(color), ...rest });
  }
}

// ---- the hydrant's mist -----------------------------------------------------
// Soft puffs on the steam vents' own shader (a cache key shared, so the
// program is already built), a run of the pool per jet. Nothing allocated in
// update; the mesh is hidden while no jet runs.
const MIST = Object.freeze({ jets: 4, puffs: { potato: 6, performance: 8, balanced: 10, quality: 14, extreme: 18 }, life: 1.5, opacity: .62, colour: '#c8d6e6' });
const MIST_MAX = Math.max(...Object.values(MIST.puffs));

class JetMist {
  constructor(view) {
    this.view = view; this.time = 0;
    const count = MIST.jets * MIST_MAX;
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(count), 1); this.alpha.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('alpha', this.alpha);
    const material = steamMaterial(); material.uniforms.colour.value.set(MIST.colour);
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.name = 'lumen-jet-mist'; this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.mesh.raycast = () => {};
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.visible = false;
    view.scene?.add(this.mesh);
    // Each puff's seed, the same every load.
    let s = 4711; const random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    this.seeds = Array.from({ length: MIST_MAX }, () => ({ angle: random() * 6.283, out: .4 + random() * .6, rise: .7 + random() * .5, phase: random() }));
  }
  get puffs() { return MIST.puffs[this.view.qualityName] ?? MIST.puffs.balanced; }

  // How dense a jet's cloud is `age` seconds in: builds fast, holds while the
  // jet blocks sight, thins as it ends.
  static strength(age) {
    const hold = JET.duration - JET.linger * .7, gone = JET.duration + JET.linger * .3;
    return age < 0 ? 0 : age < .3 ? age / .3 : age < hold ? 1 : Math.max(0, (gone - age) / (gone - hold));
  }

  update(dt, jets) {
    const mesh = this.mesh, n = this.puffs;
    if (!jets.length) { if (mesh.visible) { mesh.count = 0; mesh.visible = false; } return; }
    this.time += dt;
    const m = mesh.instanceMatrix.array, a = this.alpha.array, R = JET.radius, gy = this.view.gy;
    let used = 0;
    for (let j = 0; j < jets.length; j++) {
      const jet = jets[j], s = JetMist.strength(jet.age);
      const ground = gy ? gy(jet.x, jet.z) : 0;
      for (let k = 0; k < n; k++, used++) {
        const seed = this.seeds[k], u = ((this.time / MIST.life + seed.phase + k / n) % 1 + 1) % 1;
        let x, y, z, radius, alpha;
        if (k % 2 === 0) {
          // A billow low round the jet, turning slowly: fills the cylinder that blocks sight.
          const ang = seed.angle + this.time * .4 * (seed.out - .5), out = R * .62 * (.7 + .5 * seed.out);
          x = jet.x + Math.cos(ang) * out; z = jet.z + Math.sin(ang) * out; y = .45 + .5 * seed.rise;
          radius = 1 * (.85 + .3 * Math.sin(this.time * 1.3 + seed.phase * 6.3)); alpha = MIST.opacity * .85 * s;
        } else {
          // A plume rising from the nozzle, spreading and thinning.
          const out = .9 * seed.out * (.25 + u);
          x = jet.x + Math.cos(seed.angle) * out + jet.lx * u; z = jet.z + Math.sin(seed.angle) * out + jet.lz * u; y = .5 + u * 1.9 * seed.rise;
          radius = .5 + u * .95; alpha = MIST.opacity * s * Math.min(1, u * 6) * (1 - u) ** .8;
        }
        const o = (used) * 16;
        m[o] = radius; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0; m[o + 4] = 0; m[o + 5] = radius; m[o + 6] = 0; m[o + 7] = 0;
        m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = radius; m[o + 11] = 0; m[o + 12] = x; m[o + 13] = y + ground; m[o + 14] = z; m[o + 15] = 1;
        a[used] = alpha;
      }
    }
    mesh.count = used; mesh.visible = used > 0;
    mesh.instanceMatrix.needsUpdate = true; this.alpha.needsUpdate = true;
  }
  clear() { this.mesh.count = 0; this.mesh.visible = false; }
  dispose() { this.clear(); this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.dispose?.(); }
}

// ---- the recipes ------------------------------------------------------------
const RECIPES = {
  // Steel panels, the window's glass, cans dropping out and rolling; a sticky
  // puddle; the screen sparks, fizzles and dies.
  cityVending(fx, e) {
    fx.pieces(e, fx.n(9), { colours: [K.graphite, K.panel, K.steelMid], size: .2, y: 1, yJitter: .8, speed: 2.4, up: 2.6, stretch: 2, sound: 'clay' });
    glassShards(fx, e, fx.n(14), { y: 1.3 });
    for (let i = 0, n = fx.n(6); i < n; i++) {
      const v = throwFrom(e, 1.8, 2.4);
      fx.roll(e.x + (Math.random() - .5) * .5, e.z + (Math.random() - .5) * .3, { form: 'log', r: .033, length: .06, color: jitter(pick(K.can)), ...v, vy: 1 + Math.random() * 2, y: .6, friction: 1.1, axis: Math.random() * 6, sound: 'clay' });
    }
    smear(fx, e.x, e.z, .6 * e.s, K.sticky, { reach: .5, grow: .9 });
    smear(fx, e.x, e.z, .4 * e.s, K.scorch, { grow: .3 });
    litter(fx, e.x, e.z, fx.n(5), .8, [K.glass, K.glassDim], { size: .045, stretch: 1.3 });
    sparks(fx, e.x, 1.3, e.z, 16); flash(fx, e.x, 1.3, e.z, '#dbe6ff', 6);
    fizz(fx, e.x, 1.2, e.z, 1.6);
  },
  // Bags split: scraps, paper drifting down, bottles rolling; the heap slumps.
  cityTrashBags(fx, e) {
    fx.pieces(e, fx.n(10), { colours: [K.bagA, K.bagB, K.bagC], size: .17, sizeJitter: .8, y: .3, speed: 1.8, up: 2.2, stretch: 1.7, sound: 'plant' });
    drifters(fx, e, fx.n(9), [K.paper, K.white, K.cardboard], { y: .4, size: .09, life: 3, fall: .7 });
    for (let i = 0, n = fx.n(2); i < n; i++) { const v = throwFrom(e, 1.5); fx.roll(e.x, e.z, { form: 'log', r: .04, length: .11, color: i ? K.bottleClear.clone() : K.bottle.clone(), ...v, vy: 2, y: .4, friction: .9, axis: Math.random() * 6, sound: 'clay' }); }
    fx.leave(e.x, e.z, { shape: 'heap', size: .5 * e.s, height: .16, stretch: 1.3, color: K.bagA.clone(), grow: .5, sink: .01 });
    fx.leave(e.x + .3, e.z - .15, { shape: 'heap', size: .3 * e.s, height: .1, color: K.bagB.clone(), grow: .6, sink: .01 });
    litter(fx, e.x, e.z, fx.n(6), 1, [K.paper, K.cardboard, K.white], { size: .06, stretch: 1.6 });
    puff(fx, e.x, .25, e.z, { size: .14, grow: 3, life: 1.2, alpha: .28, color: c('#5a5750') });
  },
  // The cap clangs off and rolls; then six seconds of jet: spray in arcs, a
  // cloud that hides the corner, and a puddle that spreads until it stops.
  cityHydrant(fx, e) {
    fx.pieces(e, fx.n(9), { colours: [K.hydrant, K.hydrantDark, K.steelMid, K.steelDark], size: .11, y: .4, speed: 2.4, up: 3, stretch: 1.6, sound: 'clay' });
    const v = throwFrom(e, 2.6, 1.2);
    fx.roll(e.x, e.z, { form: 'disc', r: .09, length: .035, color: K.steelMid.clone(), ...v, vy: 3, y: .7, friction: 1.6, reach: 3.5, sound: 'clay' });
    const stub = fx.leave(e.x, e.z, { shape: 'lump', size: .13, height: .13, color: K.hydrantDark.clone(), grow: .12, sink: -.08 });
    const dir = e.hasDir ? e.dir : Math.random() * 6.28, lean = .5 + Math.random() * .3;
    const jet = { id: e.id, x: e.x, z: e.z, age: 0, lx: Math.cos(dir) * lean, lz: Math.sin(dir) * lean, dead: false, items: [stub] };
    fx.startJet(jet);
    jet.items.push(...smear(fx, e.x, e.z, 1.2, K.water, { reach: .7, grow: JET.duration - .5 }));
    jet.items.push(...smear(fx, e.x, e.z, .5, K.waterDark, { reach: .4, grow: 2 }));
    spray(fx, JET.duration, { x: e.x, z: e.z, y: .78, rate: 46, up: 5.2, spread: .55, lean: lean * 1.6, dir, size: .07, dark: K.steel, ttl: .95, fade: false, stop: () => jet.dead });
    spray(fx, JET.duration, { x: e.x, z: e.z, y: .3, rate: 14, up: 1.4, spread: 1.6, size: .09, colour: K.spray, ttl: .6, fade: false, stop: () => jet.dead });
    puff(fx, e.x, .8, e.z, { size: .3, grow: 3, life: 1.6, alpha: .3, color: K.spray });
    flash(fx, e.x, .8, e.z, '#dfe8ff', 2);
  },
  // Plastic, the cable whipping away, arcs and a flash; a scorch and the plinth stay.
  cityChargePost(fx, e) {
    fx.pieces(e, fx.n(9), { colours: [K.white, K.grey, K.graphite], size: .13, y: 1, yJitter: .6, speed: 2.4, up: 2.8, stretch: 2, sound: 'wood' });
    const v = throwFrom(e, 2, 1.6);
    fx.roll(e.x, e.z, { form: 'log', r: .022, length: .3, color: K.cable.clone(), ...v, vy: 2.5, y: 1, friction: 1.4, axis: Math.random() * 6, sound: 'wood' });
    sparks(fx, e.x, 1.1, e.z, 16, { speed: 3.6 }); flash(fx, e.x, 1.1, e.z, '#dbe6ff', 7);
    fizz(fx, e.x, .9, e.z, 1.8, { every: .09, n: 3 });
    fx.leave(e.x, e.z, { shape: 'lump', size: .21, height: .07, stretch: 1.15, color: K.concrete.clone(), grow: .1, sink: -.02 });
    smear(fx, e.x, e.z, .5 * e.s, K.scorch, { grow: .3 });
    litter(fx, e.x, e.z, fx.n(4), .7, [K.white, K.graphite], { size: .06 });
  },
  // Hollow and quick: it bonks off and tumbles away; its black foot stays.
  cityCone(fx, e) {
    fx.pieces(e, fx.n(5), { colours: [c('#d8cc22'), K.white, K.black], size: .09, y: .25, speed: 2.2, up: 2.4, stretch: 1.5 });
    const v = throwFrom(e, 2.6, 1.4);
    fx.roll(e.x, e.z, { form: 'log', r: .1, length: .2, color: c('#d8cc22'), ...v, vy: 2.5, y: .3, friction: 1.4, axis: Math.random() * 6 });
    fx.leave(e.x, e.z, { shape: 'lump', size: .2, height: .02, color: K.black.clone(), grow: .05, sink: -.01 });
  },
  // Crates fly apart: coloured plastic slats, a few staying where they land.
  cityCrate(fx, e) {
    const cols = [K.grey, K.blue, K.red, K.yellow];
    const a = pick(cols), b = pick(cols);
    fx.pieces(e, fx.n(12), { colours: [a, b, K.graphite], size: .14, y: .4, yJitter: .4, speed: 2.6, up: 2.6, stretch: 2.4 });
    litter(fx, e.x, e.z, fx.n(4), .8, [a, b], { size: .1, height: .03, stretch: 2.4 });
    fx.leave(e.x, e.z, { shape: 'lump', size: .25, height: .04, stretch: 1.4, color: a.clone(), grow: .1, sink: -.005 });
  },
  // Cardboard: scraps drift down, a flattened box and packing peanuts stay.
  cityDeliveryBox(fx, e) {
    fx.pieces(e, fx.n(8), { colours: [K.cardboard, K.cardboardDark, K.paper], size: .2, sizeJitter: .8, y: .25, speed: 1.8, up: 2.4, stretch: 1.5, sound: 'plant' });
    drifters(fx, e, fx.n(6), [K.cardboard, K.paper], { y: .35, size: .12, life: 2.6, fall: .75 });
    for (let i = 0, n = fx.n(2); i < n; i++) fx.leave(e.x + (Math.random() - .5) * .5, e.z + (Math.random() - .5) * .4, { shape: 'flat', size: .3, height: .012, stretch: 1.4, color: jitter(K.cardboard), grow: .1 });
    litter(fx, e.x, e.z, fx.n(7), .9, [K.foam], { size: .04, height: .04, stretch: 1.1 });
    const v = throwFrom(e, 1.6);
    fx.roll(e.x, e.z, { form: 'disc', r: .06, length: .03, color: K.tape.clone(), ...v, vy: 2, y: .4, friction: 1.2, sound: 'plant' });
  },
  // A stool: seat and legs go different ways.
  cityStool(fx, e) {
    fx.pieces(e, fx.n(6), { colours: [K.steelMid, K.steelDark, K.grey], size: .09, y: .3, speed: 2.2, up: 2.4, stretch: 2.6, sound: 'clay' });
    const v = throwFrom(e, 2, 1.6);
    fx.roll(e.x, e.z, { form: 'disc', r: .17, length: .03, color: K.grey.clone(), ...v, vy: 2.2, y: .5, friction: 1.4, sound: 'wood' });
    for (let i = 0; i < 2; i++) { const w = throwFrom(e, 1.6); fx.roll(e.x, e.z, { form: 'log', r: .015, length: .22, color: K.steelMid.clone(), ...w, vy: 1.6, y: .3, friction: 1.6, axis: Math.random() * 6, sound: 'clay' }); }
  },
  // A brittle shell snapping in two, the legs skittering.
  cityPlasticChair(fx, e) {
    const col = pick([K.grey, K.blue, K.white]);
    fx.pieces(e, fx.n(8), { colours: [col, K.grey], size: .12, y: .4, speed: 2.4, up: 2.6, stretch: 1.8 });
    for (let i = 0; i < 2; i++) { const v = throwFrom(e, 1.8); fx.roll(e.x, e.z, { form: 'log', r: .012, length: .2, color: K.steelMid.clone(), ...v, vy: 1.6, y: .3, friction: 1.4, axis: Math.random() * 6, sound: 'clay' }); }
    fx.leave(e.x, e.z, { shape: 'lump', size: .22, height: .04, stretch: 1.2, color: col.clone(), grow: .1, sink: -.005 });
  },
  // Wire flies, the bin topples and rolls, its hoop runs off and topples; litter stays.
  cityMeshBin(fx, e) {
    fx.pieces(e, fx.n(10), { colours: [K.steel, K.steelMid], size: .05, y: .5, yJitter: .5, speed: 2.4, up: 2.6, stretch: 3.6, sound: 'clay' });
    const v = throwFrom(e, 1.6, 1.4);
    fx.roll(e.x, e.z, { form: 'log', r: .2, length: .38, color: K.bagA.clone(), ...v, vy: 1.5, y: .4, friction: 1.3, axis: Math.random() * 6, sound: 'clay', reach: 2.8 });
    const w = throwFrom(e, 2.4, 1.6);
    fx.roll(e.x, e.z, { form: 'disc', r: .22, length: .012, color: K.steel.clone(), ...w, vy: 2, y: .6, friction: 1, reach: 3.4, sound: 'clay' });
    litter(fx, e.x, e.z, fx.n(6), .9, [K.paper, K.cardboard, K.foam], { size: .06, stretch: 1.6 });
    const t = throwFrom(e, 1.4); fx.roll(e.x, e.z, { form: 'log', r: .033, length: .06, color: jitter(pick(K.can)), ...t, vy: 2, y: .5, friction: 1, axis: Math.random() * 6, sound: 'clay' });
  },
  // Three bins tip over, their lids run off, bottles and cans go everywhere.
  cityRecycleBin(fx, e) {
    fx.pieces(e, fx.n(9), { colours: [K.graphite, K.blue, K.green, K.yellow], size: .15, y: .6, speed: 2.4, up: 2.6, stretch: 2 });
    for (let i = 0; i < 2; i++) { const v = throwFrom(e, 1.4, 2); fx.roll(e.x + (i - .5) * .5, e.z, { form: 'log', r: .24, length: .4, color: K.graphite.clone(), ...v, vy: 1.4, y: .5, friction: 1.5, axis: Math.random() * 6, reach: 2.2 }); }
    for (const col of [K.blue, K.green, K.yellow]) { const v = throwFrom(e, 2.4, 2.4); fx.roll(e.x, e.z, { form: 'disc', r: .28, length: .03, color: col.clone(), ...v, vy: 2.5, y: .9, friction: 1.2, reach: 3, sound: 'wood' }); }
    for (let i = 0, n = fx.n(5); i < n; i++) { const v = throwFrom(e, 1.8, 2.6); fx.roll(e.x, e.z, { form: 'log', r: i % 2 ? .04 : .033, length: i % 2 ? .1 : .06, color: jitter(i % 2 ? pick([K.bottle, K.bottleClear]) : pick(K.can)), ...v, vy: 1.5 + Math.random() * 1.5, y: .8, friction: .9, axis: Math.random() * 6, sound: 'clay' }); }
    litter(fx, e.x, e.z, fx.n(6), 1.1, [K.paper, K.cardboard, K.white], { size: .06 });
  },
  // The spool's flanges split and roll off; the cable whips out and lies in a line.
  cityCableReel(fx, e) {
    fx.pieces(e, fx.n(9), { colours: [K.wood, K.woodDark, K.black], size: .14, y: .5, speed: 2.4, up: 2.6, stretch: 2.6, sound: 'wood' });
    for (let i = 0; i < 2; i++) { const v = throwFrom(e, 2.6, 2); fx.roll(e.x, e.z, { form: 'disc', r: .4, length: .03, color: jitter(K.wood), ...v, vy: 1.5, y: .6, friction: .9, reach: 3.6, sound: 'wood' }); }
    const dir = e.hasDir ? e.dir : Math.random() * 6.28;
    strand(fx, e.x, e.z, dir, fx.n(9), .3, K.cable, { size: .1, stretch: 2.4 });
    sparks(fx, e.x, .5, e.z, 5, { stops: HOT_SPARKS, speed: 2 });
    fx.leave(e.x, e.z, { shape: 'lump', size: .25, height: .08, stretch: 1.4, color: K.black.clone(), grow: .1, sink: -.01 });
  },
  // A plastic boom and a rush of water; the puddle spreads slowly and stays.
  cityWaterBarrier(fx, e) {
    fx.pieces(e, fx.n(10), { colours: [K.yellow, c('#d0c528'), K.graphite], size: .16, y: .45, speed: 2.6, up: 2.6, stretch: 2 });
    const dir = e.hasDir ? e.dir : Math.random() * 6.28;
    spray(fx, 1.6, { x: e.x, z: e.z, y: .3, rate: 34, up: 2.2, spread: 1.1, lean: 1, dir, size: .07, ttl: .7 });
    smear(fx, e.x, e.z, 1.1 * e.s, K.water, { reach: .7, grow: 2.4 });
    smear(fx, e.x, e.z, .5 * e.s, K.waterDark, { grow: 1.2 });
    litter(fx, e.x, e.z, fx.n(3), .9, [K.yellow], { size: .16, height: .04, stretch: 2 });
  },
  // Both wheels run off on their rims; frame tubes stay.
  cityBicycle(fx, e) {
    fx.pieces(e, fx.n(8), { colours: [K.steelMid, K.graphite, K.red, K.steel], size: .09, y: .5, speed: 2.4, up: 2.8, stretch: 3.4, sound: 'clay' });
    for (let i = 0; i < 2; i++) { const v = throwFrom(e, 3, 1.2); fx.roll(e.x + (i - .5) * .8, e.z, { form: 'disc', r: .33, length: .02, color: K.black.clone(), ...v, vy: 1.5, y: .5, friction: .7, reach: 4.4, sound: 'clay' }); }
    litter(fx, e.x, e.z, fx.n(3), .7, [K.steelMid, K.red], { size: .3, height: .03, stretch: 2.6 });
    sparks(fx, e.x, .5, e.z, 5, { stops: HOT_SPARKS, speed: 2 });
  },
  // Plastic cracks, the wheels go, the battery pops with a flash and smoulders.
  cityScooter(fx, e) {
    fx.pieces(e, fx.n(9), { colours: [K.graphite, K.panel, K.steelMid, K.black], size: .11, y: .35, speed: 2.4, up: 2.8, stretch: 2 });
    for (let i = 0; i < 2; i++) { const v = throwFrom(e, 2.4, 1.8); fx.roll(e.x, e.z, { form: 'disc', r: .1, length: .05, color: K.black.clone(), ...v, vy: 2, y: .3, friction: 1, reach: 3.2, sound: 'clay' }); }
    sparks(fx, e.x, .3, e.z, 10, { speed: 2.8 }); flash(fx, e.x, .3, e.z, '#ffe9f2', 4);
    smear(fx, e.x, e.z, .4 * e.s, K.scorch, { grow: .3 });
    litter(fx, e.x, e.z, fx.n(3), .6, [K.graphite, K.steelMid], { size: .22, height: .04, stretch: 2 });
    smoulder(fx, e.x, e.z, 2.6);
  },
  // Several scooters going at once: more of everything, a fire in the cells for four seconds.
  cityScooterHeap(fx, e) {
    fx.pieces(e, fx.n(18), { colours: [K.graphite, K.panel, K.steelMid, K.black, K.white], size: .12, y: .6, yJitter: .6, speed: 2.8, up: 3, stretch: 2, spread: .6 });
    for (let i = 0, n = fx.n(4); i < n; i++) { const v = throwFrom(e, 2.6, 2.4); fx.roll(e.x + (Math.random() - .5) * .8, e.z + (Math.random() - .5) * .5, { form: 'disc', r: .1, length: .05, color: K.black.clone(), ...v, vy: 2, y: .5, friction: 1, reach: 3.4, sound: 'clay' }); }
    sparks(fx, e.x, .5, e.z, 22, { speed: 3.4 }); flash(fx, e.x, .5, e.z, '#ffe4d0', 6);
    smear(fx, e.x, e.z, .8 * e.s, K.scorch, { grow: .4, reach: .6 });
    litter(fx, e.x, e.z, fx.n(5), 1, [K.graphite, K.steelMid, K.panel], { size: .2, height: .04, stretch: 2.2 });
    fx.leave(e.x, e.z, { shape: 'heap', size: .5 * e.s, height: .1, stretch: 1.5, color: K.graphite.clone(), grow: .3, sink: .01 });
    smoulder(fx, e.x, e.z, 4.4, .25);
  },
  // Hoops ring, the bikes crash over, wheels run off, the chain stays in a heap.
  cityBikeRack(fx, e) {
    fx.pieces(e, fx.n(11), { colours: [K.steel, K.steelMid, K.red, K.graphite], size: .1, y: .55, speed: 2.6, up: 2.8, stretch: 3, sound: 'clay' });
    for (let i = 0; i < 2; i++) { const v = throwFrom(e, 3, 2); fx.roll(e.x + (i - .5) * .8, e.z, { form: 'disc', r: .33, length: .02, color: K.black.clone(), ...v, vy: 1.5, y: .5, friction: .8, reach: 4.2, sound: 'clay' }); }
    for (let i = 0; i < 2; i++) { const v = throwFrom(e, 1.6); fx.roll(e.x, e.z, { form: 'log', r: .02, length: .3, color: K.steelMid.clone(), ...v, vy: 1.5, y: .4, friction: 1.4, axis: Math.random() * 6, sound: 'clay' }); }
    litter(fx, e.x, e.z, fx.n(3), .9, [K.steel], { size: .3, height: .04, stretch: 1.8 });
    strand(fx, e.x + .3, e.z, Math.random() * 6.28, fx.n(5), .12, K.steelDark, { size: .05, stretch: 1.4, wiggle: .8 });
    sparks(fx, e.x, .6, e.z, 6, { stops: HOT_SPARKS, speed: 2 });
  },
  // Pans and lids go clanging, food spills and stays, steam and a burst of gas.
  cityFoodCart(fx, e) {
    fx.pieces(e, fx.n(11), { colours: [K.yellow, K.steel, K.graphite, K.steelMid], size: .14, y: .7, speed: 2.6, up: 2.8, stretch: 2, sound: 'clay' });
    for (let i = 0; i < 3; i++) { const v = throwFrom(e, 2.2, 2.4); fx.roll(e.x, e.z, { form: 'disc', r: i ? .13 : .16, length: .025, color: jitter(i ? K.steel : K.steelDark), ...v, vy: 2.5, y: .9, friction: 1.1, reach: 3, sound: 'clay' }); }
    litter(fx, e.x, e.z, fx.n(8), 1, [K.noodle, K.sauce, K.greens, K.noodle], { size: .08, height: .03, stretch: 1.6 });
    smear(fx, e.x, e.z, .8 * e.s, K.broth, { reach: .6, grow: .6 });
    smear(fx, e.x, e.z, .4 * e.s, K.scorchWarm, { grow: .3 });
    drifters(fx, e, fx.n(3), [K.awning], { y: .9, size: .16, life: 3, fall: .8 });
    fx.emit(2.2, (dt, t, em) => {
      em.clock = (em.clock || 0) - dt; if (em.clock > 0) return; em.clock = .13;
      const view = fx.view;
      if (view.fx?.on) puff(fx, e.x + (Math.random() - .5) * .5, .7, e.z + (Math.random() - .5) * .3, { size: .1, grow: 3, life: 1.6, alpha: .28 * (1 - t), rise: .9, color: c('#c9ccd0') });
      else if (view.particles.length < particleCap(fx) && Math.random() < .6 * (1 - t)) view.particles.push({ x: e.x, z: e.z, y: .7, vx: 0, vz: 0, vy: .7, life: .8, maxLife: .8, size: .18, material: WHITE_POOL, tint: c('#9a9ea4'), angle: 0 });
    });
    flash(fx, e.x, .8, e.z, BREAK_GLOW.gasFlash, 4);
    sparks(fx, e.x, .8, e.z, 8, { stops: HOT_SPARKS, speed: 2.6 });
  },
  // Big steel doors bang off, parcels tumble out and lie about, the LEDs die.
  cityParcelLocker(fx, e) {
    fx.pieces(e, fx.n(10), { colours: [K.steelMid, K.steelDark, K.graphite], size: .26, sizeJitter: .8, y: 1, yJitter: 1.2, speed: 2.4, up: 2.6, stretch: 1.6, sound: 'clay' });
    fx.pieces(e, fx.n(8), { colours: [K.cardboard, K.cardboardDark, K.paper], size: .18, y: .7, yJitter: .8, speed: 2, up: 2.2, stretch: 1.4, sound: 'plant' });
    const v = throwFrom(e, 2.4, 1.6);
    fx.roll(e.x, e.z, { form: 'disc', r: .3, length: .02, color: K.steelMid.clone(), ...v, vy: 2, y: .8, friction: 2.2, reach: 2.6, sound: 'clay' });
    for (let i = 0, n = fx.n(4); i < n; i++) {
      const a = Math.random() * 6.28, r = .3 + Math.random() * .8;
      fx.leave(e.x + Math.cos(a) * r, e.z + Math.sin(a) * r, { shape: 'lump', size: .2 + Math.random() * .08, height: .11, stretch: 1.3, yaw: Math.random() * 6, color: jitter(pick([K.cardboard, K.cardboardDark, K.paper])), grow: .15 + Math.random() * .3, sink: -.02 });
    }
    sparks(fx, e.x, 1.2, e.z, 9); flash(fx, e.x, 1.2, e.z, '#e6f0ff', 4);
    smear(fx, e.x, e.z, .5 * e.s, K.scorch, { grow: .3 });
  },
  // A sheet of glass: a fine shattering, crumbs over a wide floor, the frame bars fall.
  cityShopGlass(fx, e) {
    glassShards(fx, e, fx.n(30), { y: 1.1, yJitter: 1.1, size: .055, colours: [K.glass, K.glassDim, K.white, K.spray] });
    fx.pieces(e, fx.n(3), { colours: [K.steelMid, K.steelDark], size: .12, y: 1, yJitter: 1, speed: 1.6, up: 2, stretch: 4, sound: 'clay' });
    litter(fx, e.x, e.z, fx.n(14), 1.6, [K.glass, K.glassDim, K.white], { size: .035, height: .012, stretch: 1.3 });
    for (let i = 0; i < 2; i++) { const v = throwFrom(e, 1.4, 1.6); fx.roll(e.x + (i - .5) * 1, e.z, { form: 'log', r: .02, length: .5, color: K.steelMid.clone(), ...v, vy: 1.4, y: .9, friction: 1.6, axis: Math.random() * 6, sound: 'clay' }); }
    sparks(fx, e.x, 1.1, e.z, 7, { stops: WHITE_SPARKS, speed: 2.2, life: .22 });
  },
  // The screen implodes: dark glass, a board, sparks, a smoky fizzle; a scorch and dead glass stay.
  cityInfoTerminal(fx, e) {
    glassShards(fx, e, fx.n(12), { y: 1.2, colours: [K.glassDark, K.glassDim, K.glass] });
    fx.pieces(e, fx.n(7), { colours: [K.graphite, K.board, K.steelMid], size: .1, y: 1, yJitter: .6, speed: 2.4, up: 2.6, stretch: 1.8, sound: 'clay' });
    sparks(fx, e.x, 1.25, e.z, 14, { speed: 3.4 }); flash(fx, e.x, 1.25, e.z, '#dbe6ff', 6);
    fizz(fx, e.x, 1.2, e.z, 1.6);
    puff(fx, e.x, 1.2, e.z, { size: .1, grow: 3, life: 1.6, alpha: .3, rise: .8, color: c('#5e5a55') });
    fx.leave(e.x, e.z, { shape: 'lump', size: .2, height: .04, stretch: 1.3, color: K.glassDark.clone(), grow: .1, sink: -.005 });
    smear(fx, e.x, e.z, .45 * e.s, K.scorch, { grow: .3 });
    litter(fx, e.x, e.z, fx.n(3), .6, [K.glassDim, K.board], { size: .05 });
  },
  // Coins fly, spin and roll far, and lie about; the head cracks off the post.
  cityParkingMeter(fx, e) {
    fx.pieces(e, fx.n(9), { colours: [K.coin, K.coinDark], size: .035, y: .9, yJitter: .4, speed: 2.6, up: 3.2, stretch: 1, sizeJitter: .3, sound: 'clay', life: 1.8 });
    fx.pieces(e, fx.n(4), { colours: [K.steelMid, K.graphite], size: .1, y: 1.1, speed: 2, up: 2.6, stretch: 2, sound: 'clay' });
    for (let i = 0, n = fx.n(5); i < n; i++) { const v = throwFrom(e, 2.6, 2.6); fx.roll(e.x, e.z, { form: 'disc', r: .022, length: .004, color: jitter(K.coin), ...v, vy: 2 + Math.random() * 1.5, y: .9, friction: .5, reach: 3.4, sound: 'clay' }); }
    const v = throwFrom(e, 1.4, 1.2);
    fx.roll(e.x, e.z, { form: 'log', r: .03, length: .55, color: K.steelMid.clone(), ...v, vy: 1.4, y: .7, friction: 2, axis: e.hasDir ? e.dir + Math.PI / 2 : Math.random() * 6, sound: 'clay' });
    litter(fx, e.x, e.z, fx.n(6), .9, [K.coin, K.coinDark], { size: .022, height: .006, stretch: 1 });
    sparks(fx, e.x, 1, e.z, 6, { stops: HOT_SPARKS, speed: 2 });
  },
};
export const LUMEN_BREAK_RECIPES = Object.freeze(Object.keys(RECIPES));

// ---- the effect ----------------------------------------------------------------
export class LumenBreakFX extends HollowBreakFX {
  constructor(view) {
    super(view);
    this.jets = [];
    this.mist = new JetMist(view);
  }

  break(e) {
    const recipe = RECIPES[e.propType]; if (!recipe) return super.break(e);
    const s = e.scale || 1, dashed = !!e.dashed, dir = Math.atan2(e.directionZ || 0, e.directionX || 0);
    const angle = this.view.lastSim?.props?.find(p => p.id === e.id)?.angle ?? 0;
    recipe(this, { ...e, s, dashed, dir, angle, force: dashed ? 1.5 : 1, hasDir: !!(e.directionX || e.directionZ) });
    this.view.shake = Math.max(this.view.shake || 0, dashed ? .06 : .03);
  }

  // A jet started (the hydrant's recipe): at most four at once, the oldest gives way.
  startJet(jet) {
    for (let i = this.jets.length - 1; i >= 0; i--) if (this.jets[i].id === jet.id) this.jets.splice(i, 1);
    while (this.jets.length >= MIST.jets) this.jets.shift().dead = true;
    this.jets.push(jet);
    // The droplets' emitters check this and end when the jet does.
    return jet;
  }

  // The prop stood again (rebuilt): its jet stops. (What it left stays until the map resets.)
  restore(e) {
    for (let i = this.jets.length - 1; i >= 0; i--) if (this.jets[i].id === e.id) { this.jets[i].dead = true; this.jets.splice(i, 1); }
    this.mist.update(0, this.jets);
  }

  update(dt) {
    super.update(dt);
    if (!dt) return;
    for (let i = this.jets.length - 1; i >= 0; i--) {
      const j = this.jets[i]; j.age += dt;
      if (j.age > JET.duration + JET.linger || j.dead) this.jets.splice(i, 1);
    }
    this.mist.update(dt, this.jets);
  }

  clear() { super.clear(); this.jets.length = 0; this.mist?.clear(); }
  dispose() { this.mist.dispose(); super.dispose(); }
}

// The break effect a view makes on its first break (renderer.js breakProp,
// warm-up.js): a city map's, else Hollow Wick's.
export const makeBreakFX = view => view.map?.city ? new LumenBreakFX(view) : new HollowBreakFX(view);

