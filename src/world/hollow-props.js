// Hollow Wick's open-ground pieces (stage 2, the props builder): the field's
// corn shocks, scarecrows and cart, the crib and haystack, woodpiles, the well
// sweep, fences, stones and reeds, the orchard, and the set pieces (the
// hanging tree, the drag trail, the body pile, the skeletons, the rocking
// chair). Data: src/maps/hollow-wick-props.js. Every type here is solid
// scenery (health null), so makeProp puts it under the static root and batch()
// merges it into a few vertex-coloured draws per 24 m cell. The two things
// that move (the hanged man, the rocking chair) get their own small groups
// under the scene, merged and swung from their mesh's onBeforeRender, so no
// per-frame hook is needed in the renderer.
//
// Local frame: x along a piece (a fence panel, a woodpile, the cart), z its
// front (a scarecrow faces +z); models are built from y 0 up. On a hills map
// the group stands at the ground under its centre (makeProp), and `lift`
// below gives the ground's height at any local point relative to that, so
// long pieces (fences, the pile, the trail) follow the slope.
import * as THREE from 'three';

// Collision boxes are [x, z, w, d, height] in the prop's own frame (height:
// the map-kit hook; rounds stop at low cover only at their own height).
// `screen`: stops sight only (walked through, shot through: reeds).
export const HOLLOW_TYPES = {
 scarecrow: { w: .8, d: .6, health: null, collisionBoxes: [[0, 0, .3, .3, 1.9]] },
 emptyCross: { w: .8, d: .6, health: null, collisionBoxes: [[0, 0, .3, .3, 2.2]] },
 cornShock: { w: 1.3, d: 1.3, health: null, blocksSight: true, collisionBoxes: [[0, 0, 1.05, 1.05, 1.7]] },
 oxCart: { w: 3.6, d: 1.9, health: null, collisionBoxes: [[-.2, 0, 2.5, 1.5, 1.4]] },
 cornCrib: { w: 3.4, d: 1.9, health: null, blocksSight: true, collisionBoxes: [[0, 0, 3.2, 1.7, 2.6]] },
 haystack: { w: 3.4, d: 3.4, health: null, blocksSight: true, collisionBoxes: [[0, 0, 2.3, 2.9, 2.8], [0, 0, 2.9, 2.3, 2.8]] },
 woodpile: { w: 2.6, d: 1.1, health: null, collisionBoxes: [[0, 0, 2.5, .95, 1.2]] },
 choppingBlock: { w: .7, d: .7, health: null, collisionBoxes: [[0, 0, .55, .55, .6]] },
 wellSweep: { w: 6.4, d: 2.2, health: null, collisionBoxes: [[0, 0, 1.9, 1.9, .9], [3, 0, .32, .32, 2.9]] },
 waterTrough: { w: 2.2, d: .8, health: null, collisionBoxes: [[0, 0, 2.1, .7, .7]] },
 railFence: { w: 3, d: .3, health: null, collisionBoxes: [[0, 0, 3, .24, 1.1]] },
 splitRail: { w: 3, d: .8, health: null, collisionBoxes: [[0, 0, 3, .6, 1.1]] },
 fieldWall: { w: 4, d: .9, health: null, collisionBoxes: [[0, 0, 4, .75, 1.1]] },
 fieldBoulder: { w: 2.1, d: 1.7, health: null, collisionBoxes: [[0, 0, 1.9, 1.4, 1.1]] },
 stonePile: { w: 2, d: 1.6, health: null, collisionBoxes: [[0, 0, 1.8, 1.3, .8]] },
 markerStone: { w: .5, d: .35, health: null, collisionBoxes: [[0, 0, .45, .3, .95]] },
 reeds: { w: 2.8, d: 1, health: null, blocksSight: true, screen: true, walkOver: true, collisionBoxes: [[0, 0, 2.4, .7, .5]] },
 orchardTree: { w: 1, d: 1, health: null, collisionBoxes: [[0, 0, .4, .4, 3]] },
 hangingTree: { w: 2, d: 2, health: null, blocksSight: true, collisionBoxes: [[0, 0, 1, 1, 4]] },
 // (Its collider covers the heap up the bank; the bodies below it lie in the water.)
 bodyPile: { w: 4.6, d: 2.8, health: null, collisionBoxes: [[0, -1.2, 4.2, 1.5, 1.1]] },
 rockingChair: { w: .9, d: .9, health: null, collisionBoxes: [[0, 0, .7, .75, 1.1]] },
 // Lying on the ground: nothing to collide with.
 skeletonLeaves: { w: 1.8, d: 1, health: null, collisionBoxes: [] },
 skeletonSickle: { w: 1.9, d: 1.2, health: null, collisionBoxes: [] },
 dragTrail: { w: 1, d: 1, health: null, collisionBoxes: [] },
};

const C = {
 wood: '#6f6458', woodDark: '#4f473d', woodGrey: '#7a7266', rail: '#6b5f50', railPale: '#83786a',
 straw: '#a8925a', strawDark: '#8f7a48', strawPale: '#b59c5e', cloth: '#6a6258', clothDark: '#57504a', rope: '#5a4e3c',
 stone: '#7f7b72', stoneDark: '#5f5c56', lichen: '#8b8a80', moss: '#56603f',
 trunk: '#231d1a', bark: '#3b322c', bone: '#e2d6b8', boneOld: '#cbbd9a', iron: '#3a3836',
 logEnd: '#9a8462', logBark: '#4a3f33', logMid: '#6e5c46',
 shingle: '#3a3632', corn: '#b08a3c', stalk: '#9a8656', stalkDark: '#85744a',
 crow: '#2a2c30', crowWing: '#1e2024',
 // The game's gore (effects/gore.js), rotted: dulled and darkened.
 blood: '#8c1c2a', soaked: '#5a1019', flesh: '#b4505e', rot: '#6e2e28', rotDark: '#4e1c1a', dried: '#7a4a3e', leather: '#8a5a48', rag: '#4a4540', ragDark: '#3e3a34',
 leaf: ['#8a6a3e', '#7a5a34', '#6e4a2c'],
};

// A repeatable 0..1 sequence per prop (the same every load).
function seeded(n) { let s = (Math.floor(Math.abs(n)) % 2147483646) + 1; return () => (s = s * 16807 % 2147483647) / 2147483647; }

export function makeHollowProp(view, p, g) {
 const random = seeded(p.x * 131 + p.z * 977 + 7);
 const c = Math.cos(p.angle || 0), s = Math.sin(p.angle || 0), base = view.gy(p.x, p.z);
 const world = (lx, lz) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
 // The ground's height at a local point, relative to the group's origin.
 const lift = (lx, lz) => view.gy(...world(lx, lz)) - base;
 const box = (x, y, z, w, h, d, colour, parent = g) => view.box(x, y, z, w, h, d, colour, parent);
 const cyl = (x, y, z, r, h, colour, parent = g, seg = 6, top = r) => view.cylinder(x, y, z, r, h, colour, parent, seg, top);
 const rock = (x, y, z, r, colour, parent = g, sy = .6) => { const m = view.mesh(new THREE.DodecahedronGeometry(r, 0), colour, x, y, z, parent); m.scale.set(1, sy, .85 + random() * .3); m.rotation.set(random() * .5, random() * 6.3, random() * .5); return m; };
 // A stick from a to b (points [x, y, z]), radius r (top r2).
 const stick = (a, b, r, colour, parent = g, seg = 5, r2 = r) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
  const m = view.mesh(new THREE.CylinderGeometry(r2, r, len, seg), colour, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, parent);
  m.quaternion.setFromUnitVectors(UP, new THREE.Vector3(dx / len, dy / len, dz / len)); return m;
 };
 const builder = BUILDERS[p.type];
 builder?.({ view, p, g, random, lift, world, box, cyl, rock, stick, base });
}

const UP = new THREE.Vector3(0, 1, 0);

// A lying skeleton (bones only, ivory, flat-shaded like gore.js's fire
// deaths). `missing`: parts left out; `sink`: how far into the ground.
function skeleton(k, x0, z0, yaw, { sink = 0, missing = [], splay = 0, parent = k.g } = {}) {
 const { view, stick, random } = k, B = C.bone, O = C.boneOld;
 const cy = Math.cos(yaw), sy = Math.sin(yaw);
 // Local body frame: along +z from the skull (z 0) to the feet (z 1.7).
 const P = (x, y, z) => [x0 + x * cy + z * sy, y - sink, z0 - x * sy + z * cy];
 if (!missing.includes('skull')) {
  const skull = view.mesh(new THREE.IcosahedronGeometry(.13, 0), B, ...P(0, .12, .05), parent); skull.scale.set(.85, .8, 1.05); skull.rotation.set(.3, yaw + .4, .2);
  for (const side of [-1, 1]) view.box(...P(side * .045, .2, -.02), .05, .02, .05, '#2a2420', parent);
  view.box(...P(0, .06, -.07), .12, .05, .07, O, parent); // the jaw, dropped open
 }
 // Spine and ribs.
 stick(P(0, .06, .2), P(0, .06, .85), .025, O, parent);
 for (let i = 0; i < 5; i++) {
  const rib = view.mesh(new THREE.TorusGeometry(.13 - i * .008, .016, 3, 8, Math.PI), B, ...P(0, .06, .3 + i * .09), parent);
  rib.rotation.set(0, yaw, 0); rib.rotateX(-Math.PI / 2 + (random() - .5) * .3);
 }
 // Pelvis.
 const pelvis = view.box(...P(0, .06, .92), .3, .08, .14, B, parent); pelvis.rotation.y = yaw + (random() - .5) * .3;
 // Arms (shoulder, elbow, hand) and legs (hip, knee, foot), splayed.
 const limb = (name, pts, r) => { if (missing.includes(name)) return; for (let i = 0; i < pts.length - 1; i++) stick(P(...pts[i]), P(...pts[i + 1]), r, i ? O : B, parent); view.box(...P(...pts[pts.length - 1]), .08, .03, .12, B, parent); };
 const a = splay;
 limb('armL', [[-.2, .05, .22], [-.34 - a, .05, .5], [-.38 - a * 1.6, .04, .78]], .022);
 limb('armR', [[.2, .05, .22], [.36 + a * .5, .05, .46], [.5 + a, .04, .6]], .022);
 limb('legL', [[-.1, .06, .95], [-.16 - a * .4, .06, 1.38], [-.2 - a * .6, .05, 1.8]], .028);
 limb('legR', [[.1, .06, .95], [.18 + a, .06, 1.36], [.3 + a * 1.4, .05, 1.76]], .028);
}

// A low-poly body (rotted): torso, head, limbs, for the pile and the hanged
// man. Returns the group; `pose` bends the limbs.
function body(k, parent, { flesh = C.rot, cloth = C.rag, dark = C.rotDark, pose = 'lie', gore = false } = {}) {
 const { view, random, box, stick } = k, b = new THREE.Group(); parent.add(b);
 // Torso along z (lying) or y (hanging).
 if (pose === 'hang') {
  box(0, -.95, 0, .42, .62, .24, cloth, b);
  box(0, -.62, 0, .46, .12, .26, C.ragDark, b);
  const head = view.mesh(new THREE.IcosahedronGeometry(.15, 0), flesh, .05, -.42, .04, b); head.scale.set(.9, 1.05, .95); head.rotation.z = .5;
  box(0, -1.32, 0, .38, .2, .22, C.ragDark, b);
  // Arms hang straight down, one hand gone.
  for (const side of [-1, 1]) { stick([side * .26, -.7, 0], [side * .3, -1.3, .04], .06, cloth, b); stick([side * .3, -1.3, .04], [side * .3, -1.62, .08], .045, flesh, b); }
  // Legs, the feet pointing down.
  for (const side of [-1, 1]) { stick([side * .1, -1.4, 0], [side * .12, -2.0, .03], .075, C.ragDark, b); stick([side * .12, -2.0, .03], [side * .13, -2.38, 0], .06, dark, b); box(side * .13, -2.44, .05, .09, .1, .2, C.iron, b); }
  if (gore) {
   // The belly opened: soaked cloth, a raw wound and what hangs out of it.
   box(0, -1.04, .125, .3, .34, .02, C.soaked, b);
   box(0, -1.02, .135, .16, .2, .02, C.flesh, b);
   for (let i = 0; i < 3; i++) { const loop = view.mesh(new THREE.TorusGeometry(.06, .025, 4, 7), i % 2 ? C.flesh : '#d98a8e', (i - 1) * .05, -1.18 - i * .09, .15, b); loop.rotation.set(1.3, i, .2); }
   box(.12, -.85, .125, .1, .16, .02, C.blood, b);
   // The rope's mark round the neck, and the face gone dark.
   box(.02, -.28, 0, .14, .06, .14, C.soaked, b);
   box(.09, -.44, .12, .08, .07, .03, '#2a1414', b);
  }
  return b;
 }
 // Lying: head at z 0, feet toward +z.
 const head = view.mesh(new THREE.IcosahedronGeometry(.14, 0), random() < .35 ? C.boneOld : flesh, 0, .12, .02, b); head.scale.set(.9, .8, 1.05);
 box(0, .12, .45, .42, .22, .6, cloth, b);
 box(0, .12, .45, .3, .23, .3, random() < .5 ? dark : flesh, b); // rot showing through the cloth
 for (const side of [-1, 1]) {
  const bend = (random() - .5) * .9;
  stick([side * .25, .1, .2], [side * (.35 + Math.abs(bend) * .3), .09, .55 + bend * .2], .055, cloth, b);
  stick([side * (.35 + Math.abs(bend) * .3), .09, .55 + bend * .2], [side * (.3 + random() * .25), .07, .82], .045, random() < .4 ? C.boneOld : flesh, b);
  stick([side * .11, .1, .74], [side * (.14 + random() * .1), .09, 1.2], .075, C.ragDark, b);
  stick([side * (.14 + random() * .1), .09, 1.2], [side * (.12 + random() * .2), .07, 1.62], .06, random() < .3 ? C.boneOld : dark, b);
 }
 return b;
}

const BUILDERS = {
 // A scarecrow facing +z: a sack head (no brim), a clear T crossbar, a grey
 // coat with straw at the cuffs and hem. Never a player or a dummy.
 scarecrow(k) {
  const { g, box, view, random, stick } = k, lean = new THREE.Group(); g.add(lean);
  lean.rotation.z = (random() - .5) * .14; lean.rotation.x = (random() - .5) * .1;
  box(0, 1.15, 0, .12, 2.6, .12, C.woodDark, lean);
  box(0, 1.78, 0, 2.0, .1, .1, C.wood, lean);
  // The coat: hung on the cross, sleeves along the bar, a ragged hem.
  box(0, 1.4, 0, .52, .66, .28, C.cloth, lean);
  box(0, 1.72, 0, .6, .12, .3, C.clothDark, lean);
  for (const side of [-1, 1]) {
   box(side * .56, 1.76, 0, .6, .2, .22, C.cloth, lean);
   const cuff = view.mesh(new THREE.ConeGeometry(.12, .3, 5), C.straw, side * .95, 1.74, 0, lean); cuff.rotation.z = side * Math.PI / 2;
  }
  for (let i = 0; i < 4; i++) { const tag = box(-.18 + i * .12, 1.0 - (i % 2) * .06, .02, .1, .2 + (i % 3) * .06, .24, i % 2 ? C.cloth : C.clothDark, lean); tag.rotation.z = (random() - .5) * .4; }
  const hem = view.mesh(new THREE.ConeGeometry(.24, .3, 6), C.straw, 0, .93, 0, lean); hem.rotation.x = Math.PI;
  // The sack head, tied at the neck with straw sticking out under the cord.
  const head = view.mesh(new THREE.IcosahedronGeometry(.22, 0), C.cloth, 0, 2.14, .02, lean); head.scale.set(.9, 1.1, .85); head.rotation.z = .25;
  box(0, 1.95, 0, .2, .06, .2, C.rope, lean);
  const tuft = view.mesh(new THREE.ConeGeometry(.16, .16, 6), C.straw, 0, 1.88, 0, lean); tuft.rotation.x = Math.PI;
  const knot = view.mesh(new THREE.ConeGeometry(.06, .16, 4), C.clothDark, .03, 2.38, 0, lean); knot.rotation.z = -.4;
  // Two dark stitched eyes, a little crooked.
  box(-.07, 2.18, .18, .06, .03, .02, '#2c2824', lean); box(.08, 2.15, .18, .06, .03, .02, '#2c2824', lean);
  // Straw fallen round the foot of the post.
  for (let i = 0; i < 5; i++) { const s = box((random() - .5) * .9, .02, (random() - .5) * .9, .35, .03, .05, C.straw); s.rotation.y = random() * 3; }
  stick([.05, .02, .15], [.45, .02, .3], .015, C.strawDark);
 },
 // Where a scarecrow stood: the cross, a torn strip and its straw below.
 emptyCross(k) {
  const { g, box, random } = k;
  const post = box(0, 1.2, 0, .13, 2.7, .13, C.woodDark); post.rotation.z = .05;
  box(0, 1.9, 0, 1.9, .1, .1, C.wood);
  box(.62, 1.62, .06, .1, .5, .03, C.cloth); box(-.8, 1.72, .06, .08, .28, .03, C.rope);
  for (let i = 0; i < 9; i++) { const s = box((random() - .5) * 1.4, .02, (random() - .5) * 1.4, .4, .03, .06, i % 3 ? C.straw : C.strawDark); s.rotation.y = random() * 3; }
  // The fallen sack head, face down in the stubble.
  const head = k.view.mesh(new THREE.IcosahedronGeometry(.2, 0), C.cloth, .55, .13, .4, g); head.scale.set(1, .6, .9);
 },
 // A shock of cut corn stood up to dry: a tied teepee of stalks.
 cornShock(k) {
  const { g, view, random, box } = k, tilt = new THREE.Group(); g.add(tilt);
  tilt.rotation.set((random() - .5) * .12, random() * 6.3, (random() - .5) * .12);
  const h = 1.8 + random() * .35;
  view.mesh(new THREE.ConeGeometry(.62, h, 7), random() < .5 ? C.stalk : C.stalkDark, 0, h / 2 - .05, 0, tilt);
  view.mesh(new THREE.CylinderGeometry(.32, .56, .5, 7), C.stalkDark, 0, .2, 0, tilt);
  k.cyl(0, h * .66, 0, .23, .1, C.rope, tilt, 6);
  const top = view.mesh(new THREE.ConeGeometry(.3, .5, 6), C.strawPale, 0, h - .02, 0, tilt); top.rotation.x = Math.PI;
  // Loose stalks leaning on it and fallen round it.
  for (let i = 0; i < 4; i++) { const a = random() * 6.3, st = box(Math.cos(a) * .55, .6, Math.sin(a) * .55, .05, 1.3, .05, C.stalk, tilt); st.rotation.set(Math.sin(a) * .35, 0, -Math.cos(a) * .35); }
  for (let i = 0; i < 3; i++) { const a = random() * 6.3, st = box(Math.cos(a) * 1, .03, Math.sin(a) * 1, 1.1, .04, .05, C.stalkDark); st.rotation.y = a + 1.3; }
 },
 // An abandoned two-wheeled ox cart, down on one side where a wheel broke.
 oxCart(k) {
  const { g, box, view, stick, random } = k, bed = new THREE.Group(); g.add(bed);
  bed.position.set(-.2, .55, 0); bed.rotation.set(-.2, 0, .06);
  box(0, 0, 0, 2.4, .1, 1.4, C.wood, bed);
  for (const z of [-.66, .66]) { box(0, .28, z, 2.4, .42, .08, z < 0 ? C.woodGrey : C.wood, bed); for (const x of [-1.1, -.3, .5, 1.15]) box(x, .28, z * 1.03, .08, .5, .06, C.woodDark, bed); }
  box(-1.16, .26, 0, .08, .38, 1.3, C.woodGrey, bed);
  // One plank gone from the near side.
  box(.4, .1, .67, .7, .1, .09, C.woodDark, bed);
  // The standing wheel, and the broken one lying flat.
  const wheel = view.mesh(new THREE.TorusGeometry(.6, .07, 4, 12), C.woodDark, -.3, .62, -.86, g);
  for (let i = 0; i < 4; i++) { const sp = box(0, 0, 0, 1.15, .06, .06, C.wood, wheel); sp.rotation.z = i * Math.PI / 4; }
  const flat = view.mesh(new THREE.TorusGeometry(.6, .07, 4, 12), C.woodDark, -.1, .07, 1.25, g); flat.rotation.x = Math.PI / 2;
  for (let i = 0; i < 2; i++) { const sp = box(-.1 + (i - .5) * .4, .05, 1.25, 1.0, .05, .06, C.wood); sp.rotation.y = i * 1.1 + .3; }
  // The tongue, run out forward and resting on the ground.
  stick([1.2, .6, 0], [2.9, .08, .1], .06, C.woodGrey);
  box(2.8, .1, .1, .1, .12, .7, C.woodDark);
  // What was left in it: two sacks and a spilled heap of rotten corn.
  for (const [x, z] of [[-.6, -.2], [.2, .15]]) { const sack = view.mesh(new THREE.IcosahedronGeometry(.3, 0), C.cloth, x, .28, z, bed); sack.scale.set(1.3, .7, .9); }
  for (let i = 0; i < 5; i++) { const ear = box(-1.3 + random() * .5, .04, .6 + random() * .8, .22, .07, .08, i % 2 ? C.corn : C.strawDark); ear.rotation.y = random() * 3; }
 },
 // A slatted corn crib on stone piers under a shingle roof, rotten corn inside.
 cornCrib(k) {
  const { box, cyl } = k;
  for (const x of [-1.4, 1.4]) for (const z of [-.7, .7]) cyl(x, .2, z, .16, .4, C.stoneDark, k.g, 6);
  box(0, .45, 0, 3.2, .1, 1.7, C.woodDark);
  box(0, 1.0, 0, 3.0, 1.0, 1.5, C.corn); // the corn behind the slats
  for (let i = 0; i < 14; i++) for (const z of [-.8, .8]) box(-1.55 + i * .24, 1.45, z, .12, 1.9, .05, i % 4 ? C.woodGrey : C.wood);
  for (let i = 0; i < 7; i++) for (const x of [-1.6, 1.6]) box(x, 1.45, -.72 + i * .24, .05, 1.9, .12, i % 3 ? C.woodGrey : C.wood);
  for (const z of [-.8, .8]) box(0, 2.42, z, 3.3, .1, .08, C.woodDark);
  // Gable roof, a few shingles gone.
  for (const side of [-1, 1]) { const r = box(0, 2.72, side * .52, 3.6, .08, 1.22, C.shingle); r.rotation.x = side * .55; }
  box(0, 3.04, 0, 3.64, .08, .12, C.woodDark);
  box(.8, 2.74, .5, .5, .09, .4, C.corn).rotation.x = .55;
  box(-1.8, 2.3, 0, .06, .5, 1.5, C.woodGrey);
 },
 // A round stack on a pole, loose hay round its foot, a fork left in it.
 haystack(k) {
  const { view, cyl, stick, random, box } = k;
  cyl(0, .06, 0, 1.9, .12, C.strawDark, k.g, 9);
  cyl(0, .85, 0, 1.45, 1.6, C.straw, k.g, 9, 1.55);
  view.mesh(new THREE.ConeGeometry(1.52, 1.5, 9), C.strawPale, 0, 2.38, 0, k.g);
  cyl(0, 2.6, 0, .06, 2.1, C.woodDark, k.g, 5);
  // Weather-darkened streaks down one side.
  for (let i = 0; i < 3; i++) { const a = -1 + i * .5, st = box(Math.cos(a) * 1.46, 1.0, Math.sin(a) * 1.46, .3, 1.4, .1, C.strawDark); st.rotation.y = -a; }
  stick([1.1, .2, .9], [1.4, 1.9, 1.3], .03, C.woodGrey);
  for (let i = 0; i < 3; i++) stick([1.38 + i * .04, 1.85, 1.28], [1.3 + i * .05, 2.2, 1.26], .012, C.iron);
  for (let i = 0; i < 6; i++) { const a = random() * 6.3, s = box(Math.cos(a) * 2.1, .03, Math.sin(a) * 2.1, .5, .04, .08, C.straw); s.rotation.y = a; }
 },
 // Split logs stacked between stakes, two fallen off the front.
 woodpile(k) {
  const { cyl, box, random, lift } = k, sink = Math.min(0, lift(-1.2, 0), lift(1.2, 0));
  const rows = 5, per = [9, 9, 8, 8, 6];
  for (let r = 0; r < rows; r++) for (let i = 0; i < per[r]; i++) {
   const log = cyl(-1.08 + (9 - per[r]) * .13 + i * .27 + (random() - .5) * .04, sink + .14 + r * .23, (random() - .5) * .08, .13, .9 + random() * .15, [C.logMid, C.logBark, C.logEnd][(r + i) % 3], k.g, 6);
   log.rotation.x = Math.PI / 2; log.rotation.y = (random() - .5) * .08;
  }
  for (const x of [-1.25, 1.25]) for (const z of [-.3, .3]) box(x, sink + .6, z, .08, 1.35, .08, C.woodDark);
  // Bark on the top course.
  box(-.1, sink + 1.18, 0, 1.6, .04, .7, C.logBark);
  for (let i = 0; i < 2; i++) { const log = cyl(-.4 + i * .9, .12, .75 + random() * .2, .12, .85, C.logMid, k.g, 6); log.rotation.set(Math.PI / 2, 0, 0); log.rotation.z = 1 + random(); }
 },
 // A chopping block with the axe still in it, chips round it.
 choppingBlock(k) {
  const { cyl, box, random } = k;
  cyl(0, .25, 0, .3, .5, C.logMid, k.g, 7, .28);
  cyl(0, .505, 0, .28, .02, C.logEnd, k.g, 7);
  const axe = new THREE.Group(); axe.position.set(.05, .52, 0); axe.rotation.z = .5; k.g.add(axe);
  box(0, .06, 0, .06, .16, .22, C.iron, axe); box(0, .42, 0, .05, .7, .05, C.woodGrey, axe);
  for (let i = 0; i < 7; i++) { const ch = box((random() - .5) * 1.1, .015, (random() - .5) * 1.1, .12, .03, .07, C.logEnd); ch.rotation.y = random() * 3; }
 },
 // The well and its sweep: a fieldstone curb, a forked upright 3 m off, the
 // long pole pivoted on it (a stone lashed to its short end on the ground,
 // the long end high over the well) and the rod down to the bucket.
 wellSweep(k) {
  const { cyl, box, stick, rock, random, view } = k;
  cyl(0, .4, 0, .95, .8, C.stone, k.g, 9);
  cyl(0, .81, 0, .72, .03, '#1c2224', k.g, 9);
  for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28; box(Math.cos(a) * .88, .83, Math.sin(a) * .88, .34, .08, .22, i % 3 ? C.lichen : C.stoneDark).rotation.y = -a; }
  view.mesh(new THREE.TorusGeometry(.93, .05, 3, 12), C.moss, 0, .5, 0, k.g).rotation.x = Math.PI / 2;
  // The upright, forked at the top.
  box(3, 1.35, 0, .28, 2.9, .28, C.woodDark);
  for (const z of [-.12, .12]) box(3, 2.95, z, .1, .4, .08, C.woodDark);
  // The sweep pole: pivot (3, 2.9); long end over the well, short end down.
  stick([4.9, .45, 0], [-.15, 5.05, 0], .08, C.woodGrey, k.g, 5, .05);
  rock(4.95, .3, 0, .38, C.stoneDark); box(4.8, .5, 0, .12, .12, .3, C.rope);
  stick([-.1, 5.0, 0], [-.05, 1.35, 0], .025, C.woodDark);
  cyl(-.05, 1.2, 0, .16, .3, C.wood, k.g, 7, .19);
  box(-.05, 1.36, 0, .34, .03, .04, C.iron);
  for (let i = 0; i < 4; i++) { const st = rock(1.2 + random() * .4, .05, -.9 + random() * 1.8, .14, C.stoneDark); st.scale.y = .4; }
 },
 // A hollowed log trough on two blocks.
 waterTrough(k) {
  const { cyl, box } = k;
  for (const x of [-.75, .75]) box(x, .12, 0, .3, .24, .6, C.stoneDark);
  const log = cyl(0, .45, 0, .34, 2.1, C.logMid, k.g, 7); log.rotation.z = Math.PI / 2;
  box(0, .72, 0, 1.9, .04, .42, '#262c2c');
  box(-1.06, .45, 0, .04, .5, .5, C.logEnd);
 },
 // One panel of a post-and-rail fence: a post at its start (and at its end
 // on a run's last panel), three rails post to post over the ground, now and
 // then one down in the grass.
 railFence(k) {
  const { p, box, lift, random } = k, L = p.span || 3, ya = lift(-L / 2, 0), yb = lift(L / 2, 0);
  const post = (x, y) => box(x, y + .5, 0, .15, 1.3, .15, C.woodDark);
  post(-L / 2, ya); if (p.end) post(L / 2, yb);
  const run = Math.hypot(L, yb - ya), pitch = Math.atan2(yb - ya, L), drop = random() < .22 ? Math.floor(random() * 3) : -1;
  [.36, .68, 1.0].forEach((h, i) => {
   if (i === drop) { const r = box(0, (ya + yb) / 2 + .05, .35, L * .9, .09, .11, C.rail); r.rotation.y = .15; return; }
   const r = box(0, (ya + yb) / 2 + h, 0, run - .1, .1, .09, i % 2 ? C.railPale : C.rail); r.rotation.z = pitch;
  });
 },
 // One leg of a zigzag split-rail (worm) fence: five rails stacked at a slant
 // (alternate panels slant the other way), stakes crossed where legs meet.
 splitRail(k) {
  const { p, box, lift, stick } = k, L = p.span || 3, flip = p.flip ? -1 : 1, za = -.28 * flip, zb = .28 * flip;
  const ya = lift(-L / 2, za), yb = lift(L / 2, zb), run = Math.hypot(L, .56), yaw = Math.atan2(.56 * flip, L);
  for (let i = 0; i < 5; i++) {
   const y = (ya + yb) / 2 + .12 + i * .2, r = box(0, y, 0, run + .3, .1, .12, i % 2 ? C.railPale : C.rail);
   r.rotation.order = 'YZX'; r.rotation.set(0, -yaw, Math.atan2(yb - ya, L));
  }
  for (const s of [-1, 1]) stick([-L / 2 + s * .25, ya - .1, za + .2], [-L / 2 - s * .15, ya + 1.25, za - .1], .04, C.woodDark);
  if (p.end) for (const s of [-1, 1]) stick([L / 2 + s * .25, yb - .1, zb + .2], [L / 2 - s * .15, yb + 1.25, zb - .1], .04, C.woodDark);
 },
 // A tumbled run of dry-stone wall, stones fallen off its face.
 fieldWall(k) {
  const { box, rock, random, lift } = k;
  for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) {
   if (row === 2 && (i === 1 || i === 5 || i === 6)) continue;
   const x = -1.75 + i * .58 + (row % 2) * .2, y = lift(x, 0) + .18 + row * .34;
   const st = box(x, y, (random() - .5) * .08, .54, .32, .72 - row * .06, (i + row) % 3 ? C.stone : C.stoneDark); st.rotation.y = (random() - .5) * .2; st.rotation.z = (random() - .5) * .08;
  }
  for (let i = 0; i < 4; i++) rock(-1.5 + random() * 3, lift(0, .7) + .1, .7 + random() * .3, .2 + random() * .08, C.stoneDark);
  box(.6, lift(.6, 0) + 1.04, .05, .34, .04, .26, C.moss);
 },
 fieldBoulder(k) {
  const { rock, box } = k;
  const big = rock(0, .35, 0, 1.0, C.stone, k.g, .72); big.scale.x = 1.05;
  rock(.7, .2, .45, .5, C.stoneDark, k.g, .7);
  box(-.1, .72, .05, .7, .05, .5, C.lichen).rotation.y = .4;
  box(.3, .62, -.3, .4, .05, .3, C.moss);
 },
 // Fieldstones cleared off the land and heaped.
 stonePile(k) {
  const { rock, random } = k;
  for (let i = 0; i < 12; i++) { const a = random() * 6.3, r = random() * .7, top = i > 8; rock(Math.cos(a) * r * (top ? .4 : 1.1), top ? .5 + random() * .15 : .16, Math.sin(a) * r * (top ? .3 : .8), .2 + random() * .14, random() < .3 ? C.stoneDark : random() < .5 ? C.lichen : C.stone); }
 },
 // The fork's marker stone: a rough granite post, leaning, moss at its foot.
 markerStone(k) {
  const { box, view } = k, st = new THREE.Group(); st.rotation.set(.06, .1, -.08); k.g.add(st);
  box(0, .42, 0, .4, 1.0, .26, C.stone, st);
  const cap = view.mesh(new THREE.CylinderGeometry(.2, .2, .26, 7, 1, false, 0, Math.PI), C.stone, 0, .92, 0, st); cap.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  box(0, .6, .135, .3, .2, .02, C.lichen, st);
  box(0, .04, 0, .6, .08, .45, C.moss);
 },
 // A clump of dry reeds on a bank, a few cattail heads.
 reeds(k) {
  const { view, random, lift } = k, cols = ['#8a8056', '#7d7650', '#9a8e62', '#6e6a48'];
  for (let i = 0; i < 26; i++) {
   const x = (random() - .5) * 2.5, z = (random() - .5) * .8, h = .9 + random() * .8, y = lift(x, z);
   const blade = view.mesh(new THREE.ConeGeometry(.045, h, 3), cols[i % 4], x, y + h / 2 - .05, z, k.g); blade.rotation.set((random() - .5) * .4, random() * 3, (random() - .5) * .4);
   if (i % 6 === 0) k.cyl(x + blade.rotation.z * -h * .5, y + h - .05, z + blade.rotation.x * h * .5, .035, .2, '#4a3a28', k.g, 5);
  }
 },
 // A small gnarled apple tree, nearly bare; windfalls rotting under it.
 orchardTree(k) {
  const { stick, view, random, box } = k, lean = (random() - .5) * .4;
  const top = [lean, 1.5, (random() - .5) * .3];
  stick([0, -.1, 0], top, .17, C.bark, k.g, 6, .12);
  for (let i = 0; i < 4; i++) {
   const a = i * 1.6 + random(), end = [top[0] + Math.cos(a) * 1.2, top[1] + .6 + random() * .6, top[2] + Math.sin(a) * 1.2];
   stick(top, end, .08, C.trunk, k.g, 5, .04);
   stick(end, [end[0] + Math.cos(a + .6) * .5, end[1] + .35, end[2] + Math.sin(a + .6) * .5], .035, C.trunk, k.g, 4, .015);
   if (random() < .6) { const clump = view.mesh(new THREE.IcosahedronGeometry(.32 + random() * .15, 0), ['#8a7040', '#a4552a', '#b8923c'][i % 3], end[0], end[1] + .1, end[2], k.g); clump.scale.y = .6; clump.castShadow = true; }
  }
  for (let i = 0; i < 5; i++) { const a = random() * 6.3, d = .4 + random() * 1.2; view.mesh(new THREE.IcosahedronGeometry(.06, 0), i % 2 ? '#7a5a34' : '#6e4a2c', Math.cos(a) * d, .05, Math.sin(a) * d, k.g); }
  for (let i = 0; i < 7; i++) { const a = random() * 6.3, d = .3 + random() * 1.1, lf = box(Math.cos(a) * d, .02, Math.sin(a) * d, .16, .02, .12, C.leaf[i % 3]); lf.rotation.y = a; lf.castShadow = false; }
 },
 // The hanging tree: a gnarled bare oak with a strong low branch, a hanged
 // man on it (swaying, see swing()), an empty noose on a second branch and
 // crows watching. Its trunk collides.
 hangingTree(k) {
  const { stick, view, box, g, random } = k;
  // Root flares and the trunk, leaning a little away from the branch.
  for (let i = 0; i < 5; i++) { const a = i * 1.26 + .3; stick([Math.cos(a) * .95, .02, Math.sin(a) * .95], [Math.cos(a) * .2, .7, Math.sin(a) * .2], .16, C.bark, g, 5, .3); }
  stick([0, -.2, 0], [-.2, 2.6, .1], .55, C.trunk, g, 7, .42);
  stick([-.2, 2.6, .1], [-.5, 4.6, 0], .42, C.trunk, g, 7, .26);
  // The strong low branch, reaching east almost level, knuckled.
  stick([-.1, 2.9, .05], [1.6, 3.35, .2], .26, C.bark, g, 6, .2);
  stick([1.6, 3.35, .2], [3.4, 3.3, .1], .2, C.bark, g, 6, .12);
  stick([3.4, 3.3, .1], [4.4, 3.7, -.3], .11, C.trunk, g, 5, .05);
  // A second branch, higher, to the north-west: the empty noose.
  stick([-.35, 3.7, 0], [-2.1, 4.5, -1.4], .2, C.bark, g, 6, .1);
  stick([-2.1, 4.5, -1.4], [-3.0, 5.1, -1.9], .09, C.trunk, g, 5, .04);
  // The crown: bare limbs, twigs.
  const crown = [[-.5, 4.6, 0], [.9, 6.2, .8], [-1.8, 6.1, .6], [-.4, 6.6, -1.2], [1.2, 5.6, -1.4]];
  for (let i = 1; i < crown.length; i++) {
   stick(crown[0], crown[i], .16, C.trunk, g, 5, .07);
   for (let j = 0; j < 2; j++) stick(crown[i], [crown[i][0] + (random() - .5) * 1.6, crown[i][1] + .4 + random() * .6, crown[i][2] + (random() - .5) * 1.6], .05, C.trunk, g, 4, .015);
  }
  // Knots and a scar on the trunk.
  box(.33, 1.6, .2, .1, .3, .2, C.bark).rotation.y = .5;
  // The empty noose: rope down from the second branch, the loop open.
  stick([-2.05, 4.47, -1.35], [-2.05, 3.0, -1.35], .02, C.rope);
  view.mesh(new THREE.TorusGeometry(.17, .025, 3, 8), C.rope, -2.05, 2.82, -1.35, g).rotation.x = .3;
  // The rope's wrap on the low branch.
  box(2.6, 3.32, .15, .16, .3, .3, C.rope);
  // (Its crows are the live flock's, effects/crow-rules.js HANGING_TREE_PERCHES:
  // they scatter, caw and come back like every other crow.)
  // Dried blood and leaves under him.
  const stain = view.mesh(new THREE.CircleGeometry(.55, 9), '#3a1614', 2.6, k.lift(2.6, .15) + .03, .15, g); stain.rotation.x = -Math.PI / 2; stain.castShadow = false;
  for (let i = 0; i < 8; i++) { const a = random() * 6.3, d = random() * 1.8; const leaf = box(Math.cos(a) * d + 1, k.lift(Math.cos(a) * d + 1, Math.sin(a) * d) + .02, Math.sin(a) * d, .16, .02, .12, C.leaf[i % 3]); leaf.rotation.y = a; leaf.castShadow = false; }
  // The hanged man: his own group under the scene (the static root never moves).
  swing(k, 'hang', [2.6, 3.2, .15]);
 },
 // About twelve rotted bodies, bones and skeletons on the west bank, the
 // lower ones in the water: one merged asset.
 bodyPile(k) {
  const { view, g, random, lift } = k;
  const spots = [[-1.6, -.6, .3], [-.8, .5, 2.2], [0, -.3, 1.2], [.9, .4, 3.8], [1.6, -.5, .7], [-1.1, .1, 4.4], [.4, .9, 5.3], [-.3, -.8, 2.9],
   [.2, .1, .5, 1], [-.9, -.2, 1.9, 1], [1.0, -.1, 4.8, 1], [-.1, .2, 3.3, 2]];
  const palettes = [[C.rot, C.rag], [C.rotDark, C.ragDark], [C.dried, C.rag], [C.leather, C.ragDark], [C.rot, '#5a4a3c'], [C.soaked, C.ragDark]];
  spots.forEach(([x, z, yaw, layer = 0], i) => {
   const [flesh, cloth] = palettes[i % palettes.length], y = lift(x, z) + layer * .24;
   const b = body(k, g, { flesh, cloth, dark: C.rotDark });
   b.position.set(x - Math.sin(yaw) * .8, y, z - Math.cos(yaw) * .8); b.rotation.set((random() - .5) * .25, yaw, (random() - .5) * .5);
  });
  // Skeletons and loose bones through it.
  skeleton(k, -2.2, .9, 1.1, { sink: -lift(-2.2, .9) - .02, missing: ['legR'], splay: .2 });
  skeleton(k, 1.9, -1.1, -2.4, { sink: -lift(1.9, -1.1) - .1, missing: ['armL', 'legL'] });
  for (let i = 0; i < 10; i++) { const x = (random() - .5) * 4.4, z = (random() - .5) * 2.6; k.stick([x, lift(x, z) + .05, z], [x + (random() - .5) * .6, lift(x, z) + .06, z + (random() - .5) * .6], .025, i % 2 ? C.bone : C.boneOld); }
  for (let i = 0; i < 3; i++) { const x = (random() - .5) * 3.6, z = (random() - .5) * 2; view.mesh(new THREE.IcosahedronGeometry(.12, 0), C.bone, x, lift(x, z) + .1, z, g).scale.set(.9, .8, 1.05); }
  // Rags and dark rot soaked into the ground round it.
  for (let i = 0; i < 6; i++) { const x = (random() - .5) * 5, z = (random() - .5) * 3.2, r = k.box(x, lift(x, z) + .03, z, .5 + random() * .4, .04, .3 + random() * .3, i % 2 ? C.ragDark : C.rotDark); r.rotation.y = random() * 3; r.castShadow = false; }
  // The water round it runs faintly red (a sheet on the surface, drifting
  // downstream to the west).
  bloodWater(k);
 },
 // A skeleton half-sunk in the leaves (North Woods).
 skeletonLeaves(k) {
  const { view, random, box, g } = k;
  skeleton(k, 0, -.9, Math.PI / 2 + .3, { sink: .07, missing: ['legL'], splay: .35 });
  // Leaves drifted over the legs and one arm.
  for (let i = 0; i < 16; i++) { const x = -.3 + random() * 1.4, z = (random() - .5) * 1.1; const lf = box(x, .03 + random() * .06, z, .2, .025, .14, C.leaf[i % 3]); lf.rotation.set((random() - .5) * .4, random() * 3, (random() - .5) * .4); lf.castShadow = false; }
  for (let i = 0; i < 3; i++) { const m = view.mesh(new THREE.IcosahedronGeometry(.3, 0), C.leaf[i], .3 + i * .35, 0, (random() - .5) * .4, g); m.scale.set(1.2, .28, .9); m.castShadow = false; }
  // A leg bone dragged off by something.
  k.stick([-.9, .04, .6], [-.5, .04, .75], .028, C.boneOld);
 },
 // The field's skeleton, sprawled on its back with its sickle by its hand.
 skeletonSickle(k) {
  const { view, g, random, box } = k;
  skeleton(k, 0, -.85, Math.PI / 2 - .2, { sink: .01, missing: ['armR'], splay: .5 });
  // The sickle: a wooden grip and a rusted crescent blade.
  const sk = new THREE.Group(); sk.position.set(-.5, .03, .75); sk.rotation.y = .7; g.add(sk);
  box(0, 0, 0, .34, .05, .05, C.woodGrey, sk);
  const blade = view.mesh(new THREE.TorusGeometry(.24, .025, 3, 9, Math.PI * 1.1), '#5a4638', .4, 0, .22, sk); blade.rotation.x = -Math.PI / 2;
  // The missing arm's bones, a little way off in the stubble.
  k.stick([.9, .03, .7], [1.2, .03, .45], .022, C.boneOld); k.stick([1.25, .03, .4], [1.5, .03, .3], .02, C.bone);
  for (let i = 0; i < 6; i++) { const s = box((random() - .5) * 1.8, .015, (random() - .5) * 1.2, .35, .03, .05, C.strawDark); s.rotation.y = random() * 3; s.castShadow = false; }
 },
 // A body in a rocking chair on a stoop, facing the road; the chair still
 // rocks (see swing()).
 rockingChair(k) { swing(k, 'rock', [0, 0, 0]); },
 // The drag trail: old dried blood from the main path into the North Woods,
 // stopping dead; part-covered by leaves. Drawn as one draped decal mesh.
 dragTrail(k) { dragTrail(k); },
};

// A perched crow (body, wings folded, beak), looking along `yaw`.
function crow(k, at, yaw) {
 const { view, g } = k, c = new THREE.Group(); c.position.set(...at); c.rotation.y = yaw; g.add(c);
 const b = view.mesh(new THREE.IcosahedronGeometry(.13, 0), C.crow, 0, .1, 0, c); b.scale.set(.8, .75, 1.35);
 view.mesh(new THREE.IcosahedronGeometry(.08, 0), C.crow, 0, .22, .15, c);
 const beak = view.mesh(new THREE.ConeGeometry(.03, .1, 4), '#1a1a1c', 0, .21, .25, c); beak.rotation.x = Math.PI / 2;
 for (const s of [-1, 1]) { const w = view.box(s * .09, .12, -.03, .04, .09, .3, C.crowWing, c); w.rotation.y = s * .12; }
 view.box(0, .08, -.24, .1, .03, .16, C.crowWing, c);
}

// Something that moves: built in its own group under the scene at the prop's
// place, merged (batch) into a draw or two, and moved from onBeforeRender (the
// clock is the page's, so every viewer sees it move; a frame's lag is
// invisible at this speed). Nothing under the static root ever moves.
function swing(k, kind, [ax, ay, az]) {
 const { view, p } = k, root = new THREE.Group();
 root.position.set(p.x, view.gy(p.x, p.z) + (p.lift || 0), p.z); root.rotation.y = p.angle || 0;
 const pivot = new THREE.Group(); root.add(pivot);
 const box = (x, y, z, w, h, d, colour, parent = pivot) => view.box(x, y, z, w, h, d, colour, parent);
 const stick = (a, b, r, colour, parent = pivot, seg, r2) => k.stick(a, b, r, colour, parent, seg, r2);
 const sub = { ...k, g: pivot, box, stick };
 if (kind === 'hang') {
  pivot.position.set(ax, ay, az);
  stick([0, .1, 0], [0, -.3, 0], .022, C.rope, pivot);
  body(sub, pivot, { flesh: C.rot, cloth: C.rag, pose: 'hang', gore: true });
  // Blood run down the legs, dried black at the feet.
  box(.12, -1.9, .085, .05, .5, .02, C.soaked); box(-.1, -2.1, .08, .04, .3, .02, C.rotDark);
 } else {
  // The chair's rockers touch the stoop at the pivot (the group's origin).
  const bh = .42;
  // Rockers: three pieces each, curving up at both ends.
  for (const x of [-.24, .24]) for (const [z, y, tilt] of [[-.36, .06, .35], [0, .025, 0], [.36, .06, -.35]]) box(x, y, z, .05, .05, .38, C.woodDark).rotation.x = tilt;
  box(0, bh, 0, .54, .06, .5, C.wood);
  for (const [x, z] of [[-.24, -.2], [.24, -.2], [-.24, .2], [.24, .2]]) box(x, bh / 2 + .02, z, .05, bh - .04, .05, C.woodDark);
  const back = new THREE.Group(); back.position.set(0, bh, -.24); back.rotation.x = -.18; pivot.add(back);
  for (const x of [-.24, .24]) box(x, .45, 0, .06, .9, .06, C.woodDark, back);
  for (let i = 0; i < 4; i++) box(-.12 + i * .08, .42, 0, .03, .7, .03, C.wood, back);
  box(0, .88, 0, .56, .1, .06, C.wood, back);
  for (const x of [-.29, .29]) box(x, bh + .24, 0, .06, .05, .5, C.wood);
  // Who sits in it: slumped, the head dropped forward, long dead.
  const who = new THREE.Group(); who.position.set(0, bh + .02, -.04); pivot.add(who);
  box(0, .32, -.06, .4, .52, .26, C.ragDark, who);
  box(0, .6, -.05, .44, .1, .26, C.rag, who);
  const head = view.mesh(new THREE.IcosahedronGeometry(.14, 0), '#9a8468', 0, .74, .1, who); head.scale.set(.88, 1, .92); head.rotation.x = .5;
  box(-.05, .68, .2, .06, .04, .03, '#2a1c16', who); box(.05, .68, .2, .06, .04, .03, '#2a1c16', who);
  for (const s of [-1, 1]) {
   stick([s * .1, .06, 0], [s * .12, .06, .42], .07, C.ragDark, who);
   stick([s * .12, .06, .42], [s * .13, -.36, .5], .06, C.ragDark, who);
   box(s * .13, -.4, .56, .1, .08, .2, '#2c2622', who);
   stick([s * .24, .52, -.04], [s * .29, .28, .14], .05, C.rag, who);
   stick([s * .29, .28, .14], [s * .27, .26, .38], .04, '#8a7258', who);
  }
  // A dark stain where he has leaked onto the boards below him.
  const stain = view.mesh(new THREE.CircleGeometry(.36, 8), '#3a1a16', .05, .015, .25, root); stain.rotation.x = -Math.PI / 2; stain.castShadow = false;
 }
 view.scene.add(root);
 root.updateMatrixWorld(true);
 view.batch(pivot);
 const meshes = []; root.traverse(o => { if (o.isMesh) meshes.push(o); });
 // Moved when drawn (the pivot's children are merged into one or two meshes).
 const seed = (p.x * 7 + p.z * 3) % 6.28;
 let last = -1;
 const move = () => {
  const t = performance.now() / 1000; if (t === last) return; last = t;
  if (kind === 'hang') { pivot.rotation.set(Math.sin(t * .55 + seed) * .045, Math.sin(t * .21 + seed) * .35, Math.sin(t * .47 + seed) * .06); }
  else pivot.rotation.x = Math.sin(t * 1.15 + seed) * .075;
  pivot.updateMatrixWorld(true);
 };
 for (const m of meshes) if (isUnder(m, pivot)) m.onBeforeRender = move;
 (view.hollowMoving ||= []).push({ pivot, move });
}
const isUnder = (o, root) => { for (let q = o.parent; q; q = q.parent) if (q === root) return true; return false; };

// The water faintly red round the body pile and drifting downstream.
function bloodWater(k) {
 const { view, p } = k, ground = view.ground; if (!ground?.water?.length) return;
 const shape = new THREE.PlaneGeometry(9, 5, 18, 10); shape.rotateX(-Math.PI / 2);
 const pos = shape.attributes.position, alpha = new Float32Array(pos.count);
 const level = ground.waterAt(p.x, p.z + 2.5);
 for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i) - 2, z = pos.getZ(i) + 2.3, wx = p.x + x, wz = p.z + z;
  // Strongest at the pile, fading downstream (west) and to the far bank.
  const wet = ground.waterAt(wx, wz) > ground.drawnHeightAt(wx, wz) - .05;
  alpha[i] = wet ? Math.max(0, 1 - Math.hypot((x + 1) / 5, (z - .2) / 2.4)) * .5 : 0;
  pos.setXYZ(i, wx, (Number.isFinite(level) ? level : 0) + .02, wz);
 }
 shape.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
 const colours = new Float32Array(pos.count * 3); for (let i = 0; i < pos.count; i++) colours.set([.42, .1, .09], i * 3);
 shape.setAttribute('color', new THREE.BufferAttribute(colours, 3));
 const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, opacity: 1 });
 material.onBeforeCompile = sh => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float alpha;\nvarying float vAlpha;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = alpha;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlpha;').replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= vAlpha;');
 };
 material.customProgramCacheKey = () => 'hollow-blood-water';
 const mesh = new THREE.Mesh(shape, material); mesh.renderOrder = -1; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
 view.scene.add(mesh);
}

// The drag trail: stains along p.points (each [x, z]), every metre or so,
// smeared along the way it was dragged, drying darker and patchier toward the
// woods, then nothing. One mesh (a small canvas of stain shapes, each quad
// draped on the ground), and leaves over parts of it merged with the statics.
function dragTrail(k) {
 const { view, p, random } = k, pts = p.points; if (!pts?.length || typeof document === 'undefined') return;
 const texture = trailTexture(), ground = view.ground;
 const positions = [], uvs = [], index = [];
 const quad = (x, z, len, wid, yaw, cell) => {
  const n = 3, base = positions.length / 3, ux = Math.sin(yaw), uz = Math.cos(yaw), vx = uz, vz = -ux;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
   const a = (i / n - .5) * wid, b = (j / n - .5) * len, wx = x + vx * a + ux * b, wz = z + vz * a + uz * b;
   positions.push(wx, (ground?.flat === false ? ground.drawnHeightAt(wx, wz) : 0) + .035, wz);
   uvs.push((cell % 2 + i / n) / 2, (Math.floor(cell / 2) + j / n) / 2);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const q = base + j * (n + 1) + i; index.push(q, q + n + 1, q + 1, q + 1, q + n + 1, q + n + 2); }
 };
 let total = 0; const legs = [];
 for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); legs.push(l); total += l; }
 for (let d = 0, leg = 0, into = 0; d < total; ) {
  const [ax, az] = pts[leg], [bx, bz] = pts[leg + 1], t = into / legs[leg];
  const x = ax + (bx - ax) * t + (random() - .5) * .35, z = az + (bz - az) * t + (random() - .5) * .35, yaw = Math.atan2(bx - ax, bz - az) + (random() - .5) * .3;
  const along = d / total, gap = random() < .2 + along * .3;
  // Smears (cells 0, 1) most of the way; blots and spatter (2, 3) now and then.
  if (!gap) quad(x, z, 1.1 + random() * .6, .55 + random() * .3 - along * .15, yaw, random() < .75 ? Math.floor(random() * 2) : 2 + Math.floor(random() * 2));
  const step = .75 + random() * .5; d += step; into += step;
  while (leg < legs.length && into > legs[leg]) { into -= legs[leg]; leg++; }
  if (leg >= legs.length) break;
 }
 // It stops dead: one last dark blot where it ends.
 const [ex, ez] = pts[pts.length - 1]; quad(ex, ez, 1.2, 1.1, random() * 3, 2);
 const geometry = new THREE.BufferGeometry();
 geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
 geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
 geometry.setIndex(index); geometry.computeVertexNormals();
 const material = new THREE.MeshLambertMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
 const mesh = new THREE.Mesh(geometry, material); mesh.renderOrder = -1; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
 view.scene.add(mesh);
 // Leaves fallen over parts of it (merged with the static scenery).
 const lx = p.x, lz = p.z, c = Math.cos(p.angle || 0), s = Math.sin(p.angle || 0);
 for (let i = 0; i < Math.round(total * 1.3); i++) {
  const d = random() * total; let leg = 0, into = d; while (leg < legs.length - 1 && into > legs[leg]) { into -= legs[leg]; leg++; }
  const [ax, az] = pts[leg], [bx, bz] = pts[leg + 1], t = into / legs[leg];
  const wx = ax + (bx - ax) * t + (random() - .5) * 1.1, wz = az + (bz - az) * t + (random() - .5) * 1.1;
  const x = (wx - lx) * c - (wz - lz) * s, z = (wx - lx) * s + (wz - lz) * c;
  const leaf = view.box(x, k.lift(x, z) + .045, z, .17, .02, .12, C.leaf[i % 3], k.g); leaf.rotation.y = random() * 3; leaf.castShadow = false;
 }
}

// Four stains on one small canvas: two drag smears, a blot, a spatter. The
// game's blood (blood-splatter.js) darkened, dulled and cracked by age.
let trailCanvasTexture = null;
function trailTexture() {
 if (trailCanvasTexture) return trailCanvasTexture;
 const size = 256, cell = size / 2, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
 const ctx = canvas.getContext('2d'), random = seeded(1790);
 const blob = (x, y, r, colour, alpha) => { ctx.globalAlpha = alpha; ctx.fillStyle = colour; ctx.beginPath(); ctx.ellipse(x, y, r * (.7 + random() * .6), r * (.7 + random() * .6), random() * 3, 0, Math.PI * 2); ctx.fill(); };
 // (Dried brown-red, never the fresh #8c1c2a: it has been there a long time.)
 const shades = ['#34170f', '#3f1d14', '#2b140d', '#482619'];
 for (let c = 0; c < 4; c++) {
  const ox = (c % 2) * cell, oy = Math.floor(c / 2) * cell;
  ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, cell, cell); ctx.clip();
  if (c < 2) {
   // A smear: streaks running the length of the cell (the drag), broken.
   for (let i = 0; i < 9; i++) {
    const x = ox + cell * (.28 + random() * .44), w = 3 + random() * 9;
    ctx.globalAlpha = .4 + random() * .35; ctx.strokeStyle = shades[i % 4]; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, oy + 8 + random() * 20);
    for (let y = oy + 20; y < oy + cell - 10; y += 14) ctx.lineTo(x + (random() - .5) * 6, y);
    ctx.stroke();
   }
   for (let i = 0; i < 6; i++) blob(ox + cell * (.3 + random() * .4), oy + cell * (.15 + random() * .7), 5 + random() * 10, shades[i % 4], .7);
  } else if (c === 2) {
   blob(ox + cell / 2, oy + cell / 2, 34, shades[0], .85); blob(ox + cell / 2 + 8, oy + cell / 2 - 6, 24, shades[2], .8);
   for (let i = 0; i < 10; i++) { const a = random() * 6.3, d = 30 + random() * 22; blob(ox + cell / 2 + Math.cos(a) * d, oy + cell / 2 + Math.sin(a) * d, 3 + random() * 6, shades[i % 4], .75); }
  } else for (let i = 0; i < 26; i++) blob(ox + cell * (.15 + random() * .7), oy + cell * (.15 + random() * .7), 2 + random() * 7, shades[i % 4], .7);
  // Age: dried cracks and dust-dulled patches cut out of it.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 18; i++) blob(ox + random() * cell, oy + random() * cell, 2 + random() * 6, '#000', .35 + random() * .4);
  ctx.globalAlpha = .5; ctx.lineWidth = 1.2; ctx.strokeStyle = '#000';
  for (let i = 0; i < 8; i++) { const x = ox + random() * cell, y = oy + random() * cell; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (random() - .5) * 30, y + (random() - .5) * 30); ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over'; ctx.restore();
 }
 // Soft edges on every cell so no quad shows its square.
 const img = ctx.getImageData(0, 0, size, size), d = img.data;
 for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const lx = (x % cell) / cell - .5, ly = (y % cell) / cell - .5, e = Math.max(0, Math.min(1, (.5 - Math.max(Math.abs(lx), Math.abs(ly))) / .12));
  d[(y * size + x) * 4 + 3] *= e;
 }
 ctx.putImageData(img, 0, 0);
 trailCanvasTexture = new THREE.CanvasTexture(canvas); trailCanvasTexture.colorSpace = THREE.SRGBColorSpace;
 return trailCanvasTexture;
}
