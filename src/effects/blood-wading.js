// Walking through blood: a player who walks through a pool (a death's stain,
// a body, a blast's pool) gets it on them and tracks it about.
//   - `level` 0..1 rises while they walk in it and shows as stains on the
//     body in three stages (boots, legs, coat hem: `makeBloodStains`); it
//     dries off slowly (DRY seconds from full) and is gone on a respawn.
//   - For a few steps after, each step leaves a red boot print, on the same
//     spot and the same size and shape as the step's print in the dirt
//     (renderer.js updateFootprints -> takePrint -> BloodDrops.print).
// Used for your own player (renderer.js) and every other player online
// (remote-players.js), each with its own `Wading`.
import * as THREE from 'three';
import { compact } from './gore.js';

export const WADING = Object.freeze({ soak: 1.6, dry: 150, prints: 8, stride: .55, speed: .5, stages: [.12, .42, .72] });

export class Wading {
 constructor() { this.level = 0; this.wet = 0; this.walked = 0; this.side = 1; this.last = null; }
 // sources: [{ x, z, r }] pools on the ground this frame. drops: BloodDrops
 // (prints), map for the floor height. Returns the level.
 update(x, z, vx, vz, dt, sources, drops, map) {
  const speed = Math.hypot(vx, vz);
  let inside = false;
  for (const s of sources) if ((x - s.x) ** 2 + (z - s.z) ** 2 < s.r * s.r) { inside = true; break; }
  if (inside && speed > WADING.speed) { this.level = Math.min(1, this.level + dt * WADING.soak); this.wet = WADING.prints; }
  else this.level = Math.max(0, this.level - dt / WADING.dry);
  this.inside = inside;
  this.last = { x, z };
  return this.level;
 }
 // A footstep just landed (renderer.js places them, the same steps as the
 // dirt prints): if the boots are still wet and off the pool, how strong a
 // blood print it leaves (1 fresh .. fainter), else 0.
 takePrint() { if (this.wet <= 0 || this.inside) return 0; const k = this.wet / WADING.prints; this.wet--; return k; }
 reset() { this.level = 0; this.wet = 0; this.walked = 0; this.last = null; this.inside = false; }
}

// Blood on a gunslinger (avatar space: legs are boxes at x ±.15 up to .27 m,
// the coat a cylinder from .26 m, radius about .29, the collar's top at .89
// m). Three merged stages, shown as `level` passes WADING.stages: boots, then
// legs and hem, then up the coat and on the shoulders and arm (what the
// top-down camera sees best). Returns { root, set(level) }.
export function makeBloodStains(parent) {
 const root = new THREE.Group(); parent.add(root);
 const box = new THREE.BoxGeometry(1, 1, 1), red = new THREE.MeshLambertMaterial({ color: '#9a1622' }), dark = new THREE.MeshLambertMaterial({ color: '#6a0d16' });
 let seed = 7; const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
 const fleck = (group, x, y, z, w, h, d) => { const m = new THREE.Mesh(box, random() > .4 ? red : dark); m.position.set(x, y, z); m.scale.set(w, h, d); group.add(m); };
 const legFlecks = (group, low, high, count) => {
  for (let i = 0; i < count; i++) {
   const side = random() > .5 ? 1 : -1, face = Math.floor(random() * 4), y = low + random() * (high - low), s = .04 + random() * .05;
   const cx = side * .15, u = (random() - .5) * .15;
   if (face === 0) fleck(group, cx + u, y, .137, s, s * 1.4, .006);
   else if (face === 1) fleck(group, cx + u, y, -.137, s, s * 1.4, .006);
   else fleck(group, cx + (face === 2 ? .092 : -.092), y, u, .006, s * 1.4, s);
  }
 };
 const stages = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
 // The brim's flecks go with the head (a headless death leaves them out).
 const brim = new THREE.Group(); brim.userData.deathPart = 'head';
 // 1: soaked boots (a band round the bottom of each leg) and splashes.
 for (const side of [-1, 1]) { fleck(stages[0], side * .15, .025, 0, .186, .05, .276); }
 legFlecks(stages[0], .05, .12, 10);
 // 2: up the legs and round the coat's hem.
 legFlecks(stages[1], .1, .26, 16);
 const coatFleck = (group, low, high) => { const a = random() * Math.PI * 2, y = low + random() * (high - low), r = .29 - (y - .255) * .08 + .004, s = .05 + random() * .06; const m = new THREE.Mesh(box, random() > .4 ? red : dark); m.position.set(Math.sin(a) * r, y, Math.cos(a) * r); m.rotation.y = a; m.scale.set(s, s * 1.5, .006); group.add(m); };
 for (let i = 0; i < 16; i++) coatFleck(stages[1], .27, .44);
 // 3: splashed up the coat, and on top where the camera sees it: the
 // shoulders (the collar's top at .89 m) and the arm.
 for (let i = 0; i < 18; i++) coatFleck(stages[2], .44, .82);
 for (let i = 0; i < 12; i++) { const s = .05 + random() * .06; fleck(stages[2], (random() - .5) * .38, .893, .04 + (random() - .5) * .34, s, .006, s * 1.3); }
 // A few flecks on the hat's brim (top at 1.1 m), which covers most of the
 // body from above: the splatter reads at the camera's height.
 // The hat gets it too, and more as the soaking goes on: a few flecks on the
 // brim from the second stage, then more on the brim and on the crown's top.
 const brimEarly = new THREE.Group(); brimEarly.userData.deathPart = 'head';
 for (let i = 0; i < 5; i++) { const a = random() * Math.PI * 2, r = .25 + random() * .12, s = .03 + random() * .035; fleck(brimEarly, Math.sin(a) * r, 1.104, Math.cos(a) * r, s, .006, s * 1.3); }
 for (let i = 0; i < 10; i++) { const a = random() * Math.PI * 2, r = .26 + random() * .1, s = .035 + random() * .045; fleck(brim, Math.sin(a) * r, 1.104, Math.cos(a) * r, s, .006, s * 1.3); }
 for (let i = 0; i < 6; i++) { const a = random() * Math.PI * 2, r = random() * .15, s = .03 + random() * .04; fleck(brim, Math.sin(a) * r, 1.307, Math.cos(a) * r, s, .006, s * 1.2); }
 for (let i = 0; i < 5; i++) { const s = .04 + random() * .04; fleck(stages[2], .27 + (random() - .5) * .1, .773, -.2 + (random() - .5) * .3, s, .006, s * 1.4); }
 for (const stage of [...stages, brim, brimEarly]) { root.add(stage); compact(stage); stage.visible = false; }
 box.dispose(); red.dispose(); dark.dispose();
 let shown = -1;
 return {
  root,
  set(level) {
   const n = WADING.stages.filter(t => level >= t).length;
   if (n === shown) return; shown = n;
   stages.forEach((stage, i) => { stage.visible = i < n; }); brim.visible = n >= 3; brimEarly.visible = n >= 2;
  },
  dispose() { [...stages, brim, brimEarly].forEach(stage => stage.traverse(o => { if (o.userData.goreMerged) o.geometry.dispose(); })); root.removeFromParent(); },
 };
}

// Blood on the gun in the hand: flecks on its top faces (what the camera
// sees), a few at the second stage and more at the third. Built for whatever
// gun is held (`key` names it) from its own bounds, as a child of the gun so
// it moves with it. Returns { key, set(level), dispose() }.
export function makeGunStains(gun, key) {
 const root = new THREE.Group(); root.userData.gunStains = true;
 const bounds = new THREE.Box3(), part = new THREE.Box3(), inverse = new THREE.Matrix4();
 gun.updateMatrixWorld(true); inverse.copy(gun.matrixWorld).invert();
 gun.traverse(o => { if (!o.isMesh || !o.visible || o.parent?.userData.gunStains || o.userData.goreMerged) return; o.geometry.computeBoundingBox?.(); part.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).applyMatrix4(inverse); bounds.union(part); });
 const stages = [new THREE.Group(), new THREE.Group()];
 if (!bounds.isEmpty()) {
  const box = new THREE.BoxGeometry(1, 1, 1), red = new THREE.MeshLambertMaterial({ color: '#9a1622' }), dark = new THREE.MeshLambertMaterial({ color: '#6a0d16' });
  let seed = 19; const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const w = bounds.max.x - bounds.min.x, d = bounds.max.z - bounds.min.z, top = bounds.max.y + .004;
  stages.forEach((group, s) => {
   for (let i = 0; i < 4 + s * 5; i++) {
    const m = new THREE.Mesh(box, random() > .4 ? red : dark), size = Math.min(w, d) * (.12 + random() * .18);
    m.position.set(bounds.min.x + w * (.2 + .6 * random()), top, bounds.min.z + d * (.1 + .8 * random()));
    m.rotation.y = random() * Math.PI; m.scale.set(size, .005, size * (1 + random())); group.add(m);
   }
   gun.add(root); root.add(group); compact(group); group.visible = false;
  });
  box.dispose(); red.dispose(); dark.dispose();
 }
 let shown = -1;
 return {
  key,
  set(level) { const n = WADING.stages.filter(t => level >= t).length; if (n === shown) return; shown = n; stages[0].visible = n >= 2; stages[1].visible = n >= 3; },
  dispose() { stages.forEach(stage => stage.traverse(o => { if (o.userData.goreMerged) o.geometry.dispose(); })); root.removeFromParent(); },
 };
}
