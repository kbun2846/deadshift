// Hollow Wick's moving leaves (stage 3, s3-leaves), on top of the woods'
// carpet (world/leaf-carpet.js):
//  - Falling: now and then a leaf lets go of a canopy near the camera and
//    drifts down, spinning and swaying, lands and fades. Any canopy colour
//    may fall, but rust and red fade out in the air before they get to the
//    ground (red lying on the ground reads as blood). None on Potato.
//  - Kicked up: any body (you, other players, robots) walking through leaf
//    litter (the woods, the fork maple's carpet, the drifts) lifts a few
//    leaves that flutter and settle; a dodge lifts more; a blast (an orb
//    volley's explosion, a grenade) in the woods throws a burst. Only litter
//    colours and the canopies' yellows and oranges.
//
// Cost: one InstancedMesh for both (one draw, only while a leaf is out), a
// double-sided leaf of 8 triangles on the view's baked 'plain' material with
// instance colours: the same program as the ground detail and the carpet, so
// nothing compiles mid-game. Pools per preset (LEAF_FX); only leaves near the
// camera are made, and a frame touches only the live ones. A leaf fades by
// shrinking (the material stays opaque). Cleared with the map (clear()).
import * as THREE from 'three';
import { litterField, looseLeafGeometry, buildLeafCarpet, LITTER_BROWNS, CANOPY_GROUND, CANOPY_ONLY } from '../world/leaf-carpet.js';

// Per preset: `fall` the pool of falling leaves and `rate` how many let go
// each second with canopies over the view; `kick` the pool of kicked-up
// leaves, `step` how many a stride lifts in thick litter, `dodge` a dodge,
// `blast` a blast in the woods.
export const LEAF_FX = Object.freeze({
 potato: { fall: 0, rate: 0, kick: 14, step: .6, dodge: 4, blast: 10 },
 performance: { fall: 18, rate: 2.2, kick: 28, step: 1, dodge: 6, blast: 16 },
 balanced: { fall: 32, rate: 3.8, kick: 48, step: 1.4, dodge: 9, blast: 26 },
 quality: { fall: 54, rate: 6, kick: 76, step: 1.9, dodge: 13, blast: 38 },
 extreme: { fall: 84, rate: 9, kick: 112, step: 2.4, dodge: 17, blast: 54 },
});
export const LEAF_CAPACITY = Math.max(...Object.values(LEAF_FX).map(q => q.fall + q.kick));
// The view's window round the camera's focus (m either side): falling leaves
// start inside it, bodies and blasts outside it make none.
export const LEAF_WINDOW = { x: 20, z: 15 };
const FADE_LOW = .45, FADE_SPAN = .9; // canopy-only colours are gone by FADE_LOW m over the ground
const LEAF_SIZE = [.13, .2];
const GROUND_KICK = [[LITTER_BROWNS[0], .3], [LITTER_BROWNS[1], .25], [LITTER_BROWNS[2], .2], [CANOPY_GROUND[0], .09], [CANOPY_GROUND[1], .08], [CANOPY_GROUND[2], .08]];
const CANOPY_FALL = [['#c49a3a', .3], ['#c0612b', .25], ['#b8923c', .2], ['#a4552a', .17], ['#8e2f22', .08]];
const pick = (weighted, r = Math.random()) => { r *= weighted.reduce((a, [, w]) => a + w, 0); for (const [c, w] of weighted) if ((r -= w) <= 0) return c; return weighted[0][0]; };
const wholeOf = n => Math.floor(n) + (Math.random() < n - Math.floor(n) ? 1 : 0);

// The canopies' clumps: from the tree view's instanced canopies when it has
// been built (world/trees.js), else roughly from the trees' places (tests).
function canopyClumps(view, map) {
 const out = [], m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color();
 for (const mesh of view.treeCanopies || []) for (let i = 0; i < mesh.count; i++) {
  mesh.getMatrixAt(i, m); m.decompose(p, q, s);
  if (mesh.instanceColor) mesh.getColorAt(i, c);
  out.push({ x: p.x, y: p.y, z: p.z, r: s.x, colour: '#' + nearestCanopy(c) });
 }
 if (out.length || !map.trees) return out;
 const ground = view.ground;
 for (const t of map.trees.trees || []) {
  if (t.kind === 'apple') continue;
  let seed = Math.floor(t.x * 131 + t.z * 977) >>> 0;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let k = 0; k < 3; k++) out.push({ x: t.x + (r() - .5) * 3 * t.s, y: ground.heightAt(t.x, t.z) + (3.8 + r() * 1.5) * t.s, z: t.z + (r() - .5) * 3 * t.s, r: 1.1 * t.s, colour: t.kind === 'maple' ? '#c0612b' : pick(CANOPY_FALL, r()) });
 }
 return out;
}
// A clump's colour, back to the palette it came from (its shade multiplies it).
const PALETTE = CANOPY_FALL.map(([h]) => [h.slice(1), new THREE.Color(h)]);
function nearestCanopy(c) {
 let best = PALETTE[0][0], d = Infinity;
 for (const [hex, p] of PALETTE) { const k = p.r || 1e-3, e = Math.abs(c.r / k * p.g - c.g) + Math.abs(c.r / k * p.b - c.b); if (e < d) { d = e; best = hex; } }
 return best;
}

export class LeafFX {
 constructor(view, map, material = null) {
  this.view = view; this.map = map; this.ground = view.ground;
  this.field = litterField(view.ground, map);
  this.clumps = canopyClumps(view, map);
  this.leaves = []; this.bodies = new Map(); this.budget = 0; this.nearClock = 0; this.near = [];
  this.mesh = new THREE.InstancedMesh(looseLeafGeometry(), material || new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, vertexColors: true }), LEAF_CAPACITY);
  this.mesh.setColorAt(0, new THREE.Color('#ffffff'));
  this.mesh.count = 0; this.mesh.visible = false; this.mesh.frustumCulled = false; this.mesh.name = 'leaf-fx';
  this.mesh.castShadow = false; this.mesh.receiveShadow = true;
  view.scene.add(this.mesh);
  this.matrix = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(); this.c = new THREE.Color();
  this.setQuality(view.qualityName || view.initialQuality || 'balanced');
 }

 setQuality(name) {
  this.quality = name; this.detail = LEAF_FX[name] || LEAF_FX.balanced;
  this.carpet?.setQuality(name);
  // A lower preset's smaller pools: drop what no longer fits.
  const keep = { fall: this.detail.fall, kick: this.detail.kick };
  this.leaves = this.leaves.filter(l => keep[l.kind]-- > 0);
 }

 count(kind) { let n = 0; for (const l of this.leaves) if (l.kind === kind) n++; return n; }
 focus() { const f = this.view.focus; return f ? { x: f.x, z: f.z } : { x: 0, z: 0 }; }
 inView(x, z, f = this.focus(), grow = 0) { return Math.abs(x - f.x) < LEAF_WINDOW.x + grow && Math.abs(z - f.z) < LEAF_WINDOW.z + grow; }

 // A leaf into its pool (none past the preset's cap).
 add(kind, leaf) {
  if (this.count(kind) >= this.detail[kind]) return null;
  const size = LEAF_SIZE[0] + Math.random() * (LEAF_SIZE[1] - LEAF_SIZE[0]);
  const l = { kind, age: 0, rest: 0, fade: 1, size, yaw: Math.random() * 6.3, pitch: (Math.random() - .5) * 2, roll: (Math.random() - .5) * 2,
   spinY: (Math.random() - .5) * 6, spinX: (Math.random() - .5) * 7, swayPhase: Math.random() * 6.3, sway: .25 + Math.random() * .35, swayRate: 1.6 + Math.random() * 1.4,
   fall: .5 + Math.random() * .35, landed: false, ...leaf };
  l.canopyOnly = CANOPY_ONLY.includes(l.colour);
  this.leaves.push(l);
  return l;
 }

 // Kicked up from the litter at (x, z): `n` leaves thrown along (dx, dz)
 // at `speed`, rising at `lift`.
 kick(x, z, n, dx = 0, dz = 0, speed = 1, lift = 1.2, spread = .35) {
  for (let i = 0, count = wholeOf(n); i < count; i++) {
   const a = Math.random() * 6.3, r = Math.random() * spread, ox = Math.cos(a) * r, oz = Math.sin(a) * r;
   const out = Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dz, dx) + (Math.random() - .5) * 1.6 : a, sp = speed * (.4 + Math.random() * .8);
   if (!this.add('kick', { x: x + ox, z: z + oz, y: this.ground.drawnHeightAt(x + ox, z + oz) + .05, vx: Math.cos(out) * sp, vz: Math.sin(out) * sp, vy: lift * (.6 + Math.random() * .7), colour: pick(GROUND_KICK), rest: 2 + Math.random() * 2.5 })) break;
  }
 }

 // A blast (renderer.explosion: an orb volley's or a grenade's): a burst of
 // leaves out of the litter round it.
 blast(e) {
  if (!this.detail.blast || !this.inView(e.x, e.z, undefined, 4)) return;
  const radius = Math.max(1.5, Math.min(4, (e.radius || 3) * .8));
  let litter = this.field.at(e.x, e.z);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; litter = Math.max(litter, this.field.at(e.x + Math.cos(a) * radius * .6, e.z + Math.sin(a) * radius * .6) * .8); }
  if (litter < .1) return;
  for (let i = 0, n = wholeOf(this.detail.blast * litter); i < n; i++) {
   const a = Math.random() * 6.3, r = Math.random() * radius * .5, x = e.x + Math.cos(a) * r, z = e.z + Math.sin(a) * r;
   if (this.field.at(x, z) < .05) continue;
   this.kick(x, z, 1, Math.cos(a), Math.sin(a), 2.5 + Math.random() * 3, 3 + Math.random() * 3, .1);
  }
 }

 // The bodies moving through litter: you, other players and robots (the
 // view's remotePlayers, as the stream's wading reads them).
 stir(sim, dt) {
  const list = this.bodyList ||= [], seen = new Set(), f = this.focus(), d = this.detail;
  list.length = 0;
  const p = sim?.player;
  if (p && !p.dead && this.view.player?.visible !== false) list.push({ id: 'you', x: p.x, z: p.z, vx: p.vx, vz: p.vz, dodge: p.dodgeRemaining > 0 });
  for (const o of this.view.remotePlayers || []) {
   if (o.dead || o.hp <= 0 || this.view.remote?.avatars?.get(o.id)?.root?.visible === false) continue;
   list.push({ id: o.id, x: o.x, z: o.z, vx: o.vx, vz: o.vz, dodge: (o.dodgeRemaining || 0) > 0 });
  }
  for (const b of list) {
   seen.add(b.id);
   const was = this.bodies.get(b.id) || { x: b.x, z: b.z, step: Math.random() * .2, dodge: false };
   const vx = b.vx ?? (dt > 0 ? (b.x - was.x) / dt : 0), vz = b.vz ?? (dt > 0 ? (b.z - was.z) / dt : 0), speed = Math.hypot(vx, vz);
   if (this.inView(b.x, b.z, f) && !(this.ground.waterDepthAt?.(b.x, b.z) > .03)) {
    if (b.dodge && !was.dodge) {
     const litter = this.field.at(b.x, b.z);
     if (litter > .1) this.kick(b.x, b.z, d.dodge * litter, vx, vz, 2.2 + speed * .15, 2, .5);
    }
    if (speed > 1) {
     was.step -= dt;
     if (was.step <= 0) {
      was.step = b.dodge ? .06 : .26;
      const litter = this.field.at(b.x, b.z);
      if (litter > .1) this.kick(b.x - vx * .04, b.z - vz * .04, (b.dodge ? d.step * .8 : d.step) * litter, vx, vz, .5 + speed * .12, 1.1, .3);
     }
    }
   }
   was.x = b.x; was.z = b.z; was.dodge = b.dodge;
   this.bodies.set(b.id, was);
  }
  for (const id of this.bodies.keys()) if (!seen.has(id)) this.bodies.delete(id);
 }

 // Leaves letting go of the canopies over the view.
 shed(dt) {
  const d = this.detail;
  if (!d.fall || !this.clumps.length) return;
  const f = this.focus();
  this.nearClock -= dt;
  if (this.nearClock <= 0) {
   this.nearClock = .5;
   this.near = this.clumps.filter(c => this.inView(c.x, c.z, f, -2));
  }
  if (!this.near.length) { this.budget = 0; return; }
  this.budget = Math.min(3, this.budget + d.rate * Math.min(1, this.near.length / 10) * dt);
  while (this.budget >= 1) {
   this.budget--;
   const c = this.near[Math.floor(Math.random() * this.near.length)], a = Math.random() * 6.3, r = Math.sqrt(Math.random()) * c.r * .9;
   if (!this.add('fall', { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, y: c.y - c.r * .2, vx: 0, vy: 0, vz: 0, colour: c.colour, rest: 1.2 + Math.random() * 1.8 })) break;
  }
 }

 update(sim, dt) {
  const name = this.view.qualityName;
  if (name && name !== this.quality) this.setQuality(name);
  if (!(dt > 0)) return;
  this.stir(sim, dt);
  this.shed(dt);
  const wind = .12;
  for (const l of this.leaves) {
   l.age += dt;
   const floor = this.ground.drawnHeightAt(l.x, l.z) + .02;
   if (!l.landed) {
    if (l.kind === 'kick' && l.vy > -l.fall) {
     // Thrown: slowed hard by the air, then it flutters down like the rest.
     l.vy -= 9 * dt; const drag = Math.exp(-3 * dt); l.vx *= drag; l.vz *= drag;
     l.x += l.vx * dt; l.z += l.vz * dt; l.y += l.vy * dt;
    } else {
     // Fluttering down: a steady sink, a side-to-side sway and a little wind.
     l.vx *= Math.exp(-2 * dt); l.vz *= Math.exp(-2 * dt);
     const sway = Math.cos(l.swayPhase + l.age * l.swayRate) * l.sway;
     l.x += (l.vx + wind + sway * .8) * dt; l.z += (l.vz + sway * .35) * dt;
     l.y -= l.fall * (1 - .35 * Math.abs(Math.sin(l.swayPhase + l.age * l.swayRate))) * dt;
    }
    l.yaw += l.spinY * dt; l.pitch += l.spinX * dt; l.roll = Math.sin(l.swayPhase + l.age * l.swayRate) * .7;
    // Rust and red never reach the ground: gone by FADE_LOW m over it.
    if (l.canopyOnly) l.fade = Math.min(l.fade, Math.max(0, (l.y - floor - FADE_LOW) / FADE_SPAN));
    if (l.y <= floor) { l.y = floor; l.landed = true; l.pitch = 0; l.roll = 0; }
   } else {
    l.y = floor;
    l.rest -= dt;
    if (l.rest < 0) l.fade = Math.max(0, 1 + l.rest / .7);
   }
  }
  this.leaves = this.leaves.filter(l => l.fade > .02 && !(l.landed && l.canopyOnly) && l.age < 25);
  this.draw();
 }

 draw() {
  const mesh = this.mesh, n = Math.min(this.leaves.length, LEAF_CAPACITY);
  for (let i = 0; i < n; i++) {
   const l = this.leaves[i];
   this.matrix.compose(this.p.set(l.x, l.y, l.z), this.q.setFromEuler(this.e.set(l.pitch, l.yaw, l.roll, 'YXZ')), this.s.setScalar(l.size * l.fade));
   mesh.setMatrixAt(i, this.matrix);
   // (Parsed once per leaf, not every frame.)
   mesh.setColorAt(i, l.col ||= this.c.clone().set(l.colour));
  }
  mesh.count = n; mesh.visible = n > 0;
  if (n) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
 }

 // What lies on the ground now (the tests: never red).
 lying() { return this.leaves.filter(l => l.landed || l.y <= this.ground.drawnHeightAt(l.x, l.z) + .05); }

 clear() { this.leaves.length = 0; this.bodies.clear(); this.budget = 0; this.mesh.count = 0; this.mesh.visible = false; }
}

// Everything leafy on a map that has woods to carpet (map.leafLitter):
// the carpet and the moving leaves. From world-build.js makeHillTerrain,
// after the trees (it reads their canopies) and the ground detail.
export function buildLeaves(view, map) {
 if (!map?.leafLitter || !view.ground || view.ground.flat) return null;
 const material = view.bakedMaterial ? view.bakedMaterial('plain') : null;
 const carpet = buildLeafCarpet(view, view.ground, map, material || new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, vertexColors: true }));
 const fx = new LeafFX(view, map, material);
 fx.carpet = carpet; carpet.setQuality(fx.quality);
 return fx;
}
