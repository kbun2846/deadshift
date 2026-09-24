// Practice targets and dummies show damage as they lose health (Balanced and
// up), in two kinds that never mix up:
//   bullet damage   only from real bullets (Nominal rounds, Ballast pellets;
//                   `target.bulletHits`, counted in simulation.js hit()):
//                   holes with a pale chipped ring in a board, small dark
//                   punctures with straw tufts in a dummy's burlap, a batch
//                   more every two hits;
//   breaking        from health lost to anything (the C stream, orbs, the hex,
//                   grenades, fire, any ability to come) and from bullets too:
//                   a board cracks in from the rim, chips, splinters, then a
//                   piece splits off and hangs; a dummy's burlap tears, straw
//                   bursts out of the head and an arm and spills at its feet.
//                   On Quality and Extreme each new stage also knocks pieces
//                   off (`set` returns how many stages just broke; the
//                   renderer throws the debris).
// Quality has more stages than Balanced and Extreme the most, each with more
// pieces. Each stage or batch is merged into one or two draws (gore.js
// `compact`) and shown or hidden whole; a full-health target shows none.
// Seeded by the target's id, so a target always breaks the same way.
import * as THREE from 'three';
import { compact } from './gore.js';

export const DAMAGE_STAGES = Object.freeze({
 balanced: { at: [.66, .33], detail: 1, batches: 3, debris: 0 },
 quality: { at: [.75, .5, .25], detail: 1.4, batches: 4, debris: 5 },
 extreme: { at: [.8, .6, .4, .2], detail: 2, batches: 6, debris: 8 },
});
// Two bullet hits per batch of holes.
export const HITS_PER_BATCH = 2;

const COLOURS = { hole: '#2c2219', chip: '#c9a676', crack: '#3b2e22', splinter: '#d9bd8c', gouge: '#b89a6a', tear: '#5e513a', puncture: '#2e271c', straw: '#d8c07a', strawDark: '#b39a58', burlap: '#8f8262' };

// Which way a target or dummy faces: seeded by its id, anywhere within about
// 60 degrees either side of facing the camera (screen down), never turned
// away from it, so its face always reads from above.
export function targetYaw(id) {
 let seed = 11; for (const c of String(id)) seed = (seed * 31 + c.charCodeAt(0)) % 2147483647; seed ||= 1;
 for (let i = 0; i < 3; i++) seed = (seed * 16807) % 2147483647;
 return (seed / 2147483647 * 2 - 1) * 1.05;
}

export function makeTargetDamage(board, kind, id, qualityName) {
 const spec = DAMAGE_STAGES[qualityName]; if (!spec) return null;
 let seed = 7; for (const c of String(id)) seed = (seed * 31 + c.charCodeAt(0)) % 2147483647; seed ||= 1;
 const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
 const box = new THREE.BoxGeometry(1, 1, 1), disc = new THREE.CylinderGeometry(1, 1, 1, 7), stick = new THREE.CylinderGeometry(.5, .5, 1, 4);
 const mats = Object.fromEntries(Object.entries(COLOURS).map(([k, c]) => [k, new THREE.MeshLambertMaterial({ color: c, flatShading: true })]));
 const add = (group, geometry, material, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz); group.add(m); return m; };
 const count = n => Math.max(1, Math.round(n * spec.detail));
 const stages = spec.at.map(() => new THREE.Group()), batches = Array.from({ length: spec.batches }, () => new THREE.Group());
 const last = stages.length - 1;
 if (kind === 'dummy') {
  // Dummy space: torso (r .24-.32, 1.04 m up, squashed to .65 deep), head
  // (r .23 at 1.58), arms out at 1.2; its front is +z.
  const onBurlap = y => { const a = (random() - .5) * 2.2, r = .3 - (y - .72) * .12; return [Math.sin(a) * r, Math.cos(a) * r * .65 + .01, a]; };
  const tear = (group, y, big) => {
   const [x, z, a] = onBurlap(y);
   add(group, box, mats.tear, x, y, z, .09 * big, .12 * big, .012, 0, a, 0);
   for (let i = 0; i < count(3) * big; i++) add(group, stick, random() > .4 ? mats.straw : mats.strawDark, x + (random() - .5) * .06, y + (random() - .5) * .08, z + .03, .012, .08 + random() * .08, .012, Math.PI / 2 + (random() - .5) * .9, 0, (random() - .5) * 1.2);
  };
  stages.forEach((group, s) => {
   const worse = (s + 1) / stages.length;
   for (let i = 0; i < count(2 + s); i++) tear(group, .8 + random() * .5, 1 + worse * .6);
   // What the camera sees from above: torn tops of the arms with straw
   // sticking up, and straw fallen round the post.
   for (let i = 0; i < count(1 + s); i++) {
    const side = random() > .5 ? 1 : -1, x = side * (.22 + random() * .3), y = 1.2 + (Math.abs(x) - .2) * -.35 + .09;
    add(group, box, mats.tear, x, y, (random() - .5) * .08, .08 + random() * .05, .01, .1);
    for (let k = 0; k < count(3); k++) add(group, stick, random() > .4 ? mats.straw : mats.strawDark, x + (random() - .5) * .07, y + .04, (random() - .5) * .1, .012, .09 + random() * .07, .012, (random() - .5) * .7, 0, (random() - .5) * .7);
   }
   if (worse >= .34) for (let i = 0; i < count(3 + s * 2); i++) add(group, stick, random() > .5 ? mats.straw : mats.strawDark, (random() - .5) * (.4 + worse * .5), .015, (random() - .5) * (.35 + worse * .4), .013, .14 + random() * .1, .013, Math.PI / 2, random() * Math.PI, 0);
   if (worse >= .5) for (let i = 0; i < count(5); i++) add(group, stick, mats.straw, (random() - .5) * .22, 1.62 + random() * .12, (random() - .5) * .22, .012, .1 + random() * .08, .012, (random() - .5) * 1.4, 0, (random() - .5) * 1.4); // straw out of the head
   if (s === last) {
    // Burst open: an arm split with straw hanging from it, and a pile at its feet.
    const side = random() > .5 ? 1 : -1;
    for (let i = 0; i < count(6); i++) add(group, stick, mats.straw, side * (.5 + random() * .1), 1.1 - random() * .15, (random() - .5) * .12, .012, .12 + random() * .1, .012, (random() - .5) * .5, 0, (random() - .5) * .5);
    for (let i = 0; i < count(10); i++) add(group, stick, random() > .5 ? mats.straw : mats.strawDark, (random() - .5) * .6, .02, (random() - .5) * .5, .014, .18 + random() * .12, .014, Math.PI / 2, random() * Math.PI, 0);
   }
  });
  // Bullet punctures: small dark holes in the burlap (front and the top of
  // the shoulders, where the camera sees), a tuft of straw at some.
  for (const group of batches) for (let i = 0; i < HITS_PER_BATCH; i++) {
   const y = .82 + random() * .45, [x, z, a] = onBurlap(y), r = .018 + random() * .01;
   add(group, disc, mats.puncture, x, y, z + .004, r, .006, r, Math.PI / 2, a, 0);
   if (random() < .5) add(group, stick, mats.straw, x, y, z + .025, .008, .05, .008, Math.PI / 2 + (random() - .5) * .8, 0, (random() - .5) * .8);
  }
 } else {
  // Board space: the face (radius .6, .14 thick) sits 1 m up, tipped .6 rad
  // toward the camera; its painted side is local +y.
  for (const group of [...stages, ...batches]) { group.position.set(0, 1, 0); group.rotation.x = .6; }
  const onFace = (r = .5) => { const a = random() * Math.PI * 2, d = Math.sqrt(random()) * r; return [Math.cos(a) * d, Math.sin(a) * d]; };
  stages.forEach((group, s) => {
   const worse = (s + 1) / stages.length;
   // Breaking: gouges where paint and wood chipped off (pale, no hole),
   // cracks running in from the rim, splinters standing off it.
   for (let i = 0; i < count(2 + s); i++) {
    const [x, z] = onFace(.5), a = random() * Math.PI;
    add(group, box, mats.gouge, x, .119, z, .05 + random() * .07 * (1 + worse), .004, .03 + random() * .04, 0, a, 0);
   }
   for (let i = 0; i < count(1 + s * 1.5); i++) {
    const a = random() * Math.PI * 2, len = .16 + random() * .28 * (.5 + worse), mid = .6 - len / 2;
    add(group, box, mats.crack, Math.cos(a) * mid, .121, Math.sin(a) * mid, len, .004, .012, 0, -a, 0);
    // a branch off the main crack
    if (worse >= .5) { const b = a + (random() - .5) * .9, l2 = len * .45, m2 = .6 - len * .7; add(group, box, mats.crack, Math.cos(b) * m2, .121, Math.sin(b) * m2, l2, .004, .009, 0, -b + (random() - .5) * .6, 0); }
   }
   if (worse >= .34) for (let i = 0; i < count(3 + s); i++) {
    const a = random() * Math.PI * 2;
    add(group, box, mats.splinter, Math.cos(a) * .6, .02, Math.sin(a) * .6, .1 + random() * .08, .02, .025, 0, -a, (random() - .5) * .6);
   }
   if (s === last) {
    // Split at the edge: a piece hanging off by a splinter.
    const a = random() * Math.PI * 2;
    add(group, box, mats.chip, Math.cos(a) * .66, -.08, Math.sin(a) * .66, .22, .12, .1, .5, -a, .7);
    add(group, box, mats.crack, Math.cos(a) * .5, .121, Math.sin(a) * .5, .26, .004, .02, 0, -a + Math.PI / 2, 0);
   }
  });
  // Bullet holes, each with a pale chipped ring.
  for (const group of batches) for (let i = 0; i < HITS_PER_BATCH; i++) {
   const [x, z] = onFace(.52), r = .025 + random() * .02;
   add(group, disc, mats.chip, x, .118, z, r * 1.7, .004, r * 1.7); add(group, disc, mats.hole, x, .122, z, r, .004, r);
  }
 }
 for (const group of [...stages, ...batches]) { board.add(group); compact(group); group.visible = false; }
 box.dispose(); disc.dispose(); stick.dispose(); Object.values(mats).forEach(m => m.dispose());
 let shown = 0, holes = 0;
 return {
  quality: qualityName, debris: spec.debris,
  // fraction: health left, 0..1; bullets: bullet hits taken this life.
  // Returns how many breaking stages this call added (for debris).
  set(fraction, bullets = 0) {
   const n = fraction >= 1 ? 0 : spec.at.filter(t => fraction < t).length;
   const b = fraction >= 1 ? 0 : Math.min(batches.length, Math.ceil(bullets / HITS_PER_BATCH));
   const broke = Math.max(0, n - shown);
   if (n !== shown) { shown = n; stages.forEach((group, i) => { group.visible = i < n; }); }
   if (b !== holes) { holes = b; batches.forEach((group, i) => { group.visible = i < b; }); }
   return broke;
  },
  dispose() { for (const group of [...stages, ...batches]) { group.traverse(o => { if (o.userData.goreMerged) o.geometry.dispose(); }); group.removeFromParent(); } },
 };
}
