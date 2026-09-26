// Hollow Wick's static dressing (stage 5, task s5-props): the small period
// things a village of about 1790-1820 leaves where it used them, each where it
// makes sense. Data: src/maps/hollow-wick-dressing.js (spread last into the
// map's props). Types: DRESSING_TYPES, spread into map-kit.js PROP_TYPES;
// models: makeDressing, called from world-build.js makeProp.
//
//  - Puritan justice by the meetinghouse: the stocks (a pair of worn shoes
//    still in the holes), the pillory, the whipping post, a granite mounting
//    block by the portico.
//  - The town: hitching rails outside the tavern and the smithy, a hay wagon
//    by the barn doors, rain barrels under the eaves, the smithy's grindstone,
//    a heap of slag and cinders by the forge, a plough and a harrow left by
//    the farm, a scythe leaning on a fence.
//  - The graveyard's edge: a bier outside the hearse house with an empty
//    coffin on it, the coffin's lid leaning on the wall, the digger's barrow of
//    earth by the open grave, an unlit pierced-tin lantern on a table tomb.
//  - The stream and the mill: a rowboat pulled up the bank, an eel pot at the
//    water's edge, a washtub and washboard on the bank below the farm, two
//    spare millstones leaning on the mill.
//  - The woods: a ring of blackened stones round a long-dead fire (charred
//    sticks, small bones, a pot on its side) on the North Woods' knoll, two
//    cairns where the back trail enters the North Woods, and in the West Woods
//    a collapsed lean-to with a deer carcass under the tree beside it.
//
// Every piece is solid scenery (health null): makeProp puts it under the
// static root and batch() merges it with everything else there, so the
// dressing adds triangles but no draws (plain colours only, through
// view.box/cylinder/mesh, baked to vertex colours; no textures, no glow).
// Nothing moves. Low-poly, flat-shaded, the map's dull palette; nothing pops.
//
// Collision (map-kit.js mapColliders): a box's fifth number is its honest
// height (low cover meets a round only at its own height). Small or lying
// things have `collisionBoxes: []` (walked over, never stop a round). The
// hitching rails are `screen`: map-kit makes their boxes playerOnly, so they
// stop bodies and robots but rounds pass under the rail, as they would.
//
// Local frame, as the other Hollow Wick builders: x along a piece, z its
// front, built from y 0 up; the group stands at the ground under its centre
// and `lift` gives the ground's height at a local point relative to that.
import * as THREE from 'three';

const NONE = [];
export const DRESSING_TYPES = {
  // Puritan justice (Church Hill).
  stocks: { w: 1.9, d: 1.1, health: null, collisionBoxes: [[0, -.1, 1.8, .8, .7]] },
  pillory: { w: 1.4, d: .6, health: null, collisionBoxes: [[0, 0, .34, .34, 2.1]] },
  whippingPost: { w: .6, d: .6, health: null, collisionBoxes: [[0, 0, .32, .32, 2.5]] },
  mountingBlock: { w: 1.05, d: .85, health: null, collisionBoxes: [[0, 0, 1, .8, .7]] },
  // The town.
  hitchingRail: { w: 2.9, d: .5, health: null, screen: true, collisionBoxes: [[0, 0, 2.8, .2, 1.05]] },
  hayWagon: { w: 3.9, d: 1.9, health: null, collisionBoxes: [[-.15, 0, 3.3, 1.6, 1.5]] },
  rainBarrel: { w: .7, d: .7, health: null, collisionBoxes: [[0, 0, .62, .62, .95]] },
  grindstone: { w: 1.3, d: .8, health: null, collisionBoxes: [[0, 0, 1.2, .62, 1]] },
  slagHeap: { w: 1.8, d: 1.3, health: null, collisionBoxes: NONE },
  plough: { w: 2.5, d: .8, health: null, collisionBoxes: [[0, 0, 2.2, .5, .6]] },
  harrow: { w: 1.6, d: 1.4, health: null, collisionBoxes: NONE },
  scythe: { w: .5, d: .5, health: null, collisionBoxes: NONE },
  // The graveyard's edge and the hearse house.
  bier: { w: 2.4, d: .8, health: null, collisionBoxes: [[0, 0, 2.2, .7, 1.05]] },
  coffinLid: { w: .6, d: .8, health: null, collisionBoxes: NONE },
  diggersBarrow: { w: 1.7, d: .75, health: null, collisionBoxes: [[0, 0, 1.5, .62, .6]] },
  tombLantern: { w: .3, d: .3, health: null, collisionBoxes: NONE },
  // The stream and the mill. (The boat's box is its dry half only.)
  rowboat: { w: 3.6, d: 1.4, health: null, collisionBoxes: [[.85, 0, 1.7, 1.2, .6]] },
  eelPot: { w: 1.1, d: .5, health: null, collisionBoxes: NONE },
  washTub: { w: 1.1, d: .9, health: null, collisionBoxes: [[0, 0, .8, .8, .45]] },
  spareMillstones: { w: 1.3, d: .8, health: null, collisionBoxes: [[0, 0, 1.2, .6, 1.1]] },
  // The woods.
  fireRing: { w: 1.9, d: 1.7, health: null, collisionBoxes: NONE },
  cairn: { w: .7, d: .7, health: null, collisionBoxes: [[0, 0, .55, .55, .7]] },
  deerCarcass: { w: 1.9, d: 1.1, health: null, collisionBoxes: NONE },
  leanTo: { w: 2.6, d: 1.9, health: null, collisionBoxes: [[0, -.15, 2.2, 1.3, .8]] },
};

// The palette: the interiors' woods, the props' stones and straw, the
// graveyard's earth (colonial-interiors.js, hollow-props.js, graveyard.js).
const K = {
  wood: '#6b5a45', dark: '#4f4234', worn: '#7d6a52', pale: '#8e7b60', grey: '#7a7266', greyDark: '#5e574d', rubbed: '#9a8a70',
  iron: '#3a3836', rust: '#5a4638', tin: '#6a6862', tinDark: '#4c4b47', pewter: '#8a8c86', wax: '#cfc8b6', steel: '#77756e',
  stone: '#7f7b72', stoneDark: '#5f5c56', granite: '#8e8c86', graniteDark: '#77756e', lichen: '#8b8a80', moss: '#56603f', sandstone: '#8f887a',
  earth: '#6a5238', earthDark: '#4e3c2a', trampled: '#5f5140', hole: '#1c1714',
  straw: '#a8925a', strawDark: '#8f7a48', strawPale: '#b59c5e', hay: '#9c8a55',
  leather: '#5a4232', leatherDark: '#3e2e24', buckle: '#8a8c86', linen: '#a59a84', rag: '#4a4540',
  rope: '#5a4e3c', bone: '#e2d6b8', boneOld: '#cbbd9a', hide: '#6e5038', hideDark: '#57402e', hidePale: '#8a7258',
  ash: '#8a867e', ashDark: '#6e6a64', char: '#2a2622', soot: '#2f2d2a', cinder: '#35312c', slag: '#3f4642',
  water: '#232a2c', washWater: '#3a3f3c', wicker: '#8a7a52', wickerDark: '#6e6040', bark: '#3b322c', trunk: '#231d1a', logBark: '#4a3f33',
  hull: '#5e574d', hullPale: '#7a7266', hullIn: '#6b5f50', rot: '#4b4a2e', stain: '#3a2a20',
  leaf: ['#8a6a3e', '#7a5a34', '#6e4a2c'],
};

// Polyhedra and extrusions come without an index; batch() keeps indexed and
// unindexed geometry apart, so a piece with a few unindexed parts would add a
// draw in a cell that had none. An identity index (no vertex shared, so the
// faces stay flat) puts them in the boxes' and cylinders' batch.
const indexed = geometry => { if (!geometry.index) geometry.setIndex([...Array(geometry.attributes.position.count).keys()]); return geometry; };
// A repeatable 0..1 sequence per piece (the same every load, on every screen).
function seeded(n) { let s = (Math.floor(Math.abs(n)) % 2147483646) + 1; return () => (s = s * 16807 % 2147483647) / 2147483647; }
const UP = new THREE.Vector3(0, 1, 0);

export function makeDressing(view, p, g) {
  const random = seeded(p.x * 131 + p.z * 977 + 11);
  const c = Math.cos(p.angle || 0), s = Math.sin(p.angle || 0), base = view.gy(p.x, p.z);
  const world = (lx, lz) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
  // The ground's height at a local point, relative to the group's origin.
  const lift = (lx, lz) => view.gy(...world(lx, lz)) - base;
  const box = (x, y, z, w, h, d, colour, parent = g) => view.box(x, y, z, w, h, d, colour, parent);
  const cyl = (x, y, z, r, h, colour, parent = g, seg = 6, top = r) => view.cylinder(x, y, z, r, h, colour, parent, seg, top);
  const ball = (x, y, z, r, colour, parent = g) => view.mesh(indexed(new THREE.IcosahedronGeometry(r, 0)), colour, x, y, z, parent);
  const rock = (x, y, z, r, colour, parent = g, sy = .6) => { const m = view.mesh(indexed(new THREE.DodecahedronGeometry(r, 0)), colour, x, y, z, parent); m.scale.set(1, sy, .85 + random() * .3); m.rotation.set(random() * .4, random() * 6.3, random() * .4); return m; };
  // A stick from a to b (points [x, y, z]), radius r (r2 at b).
  const stick = (a, b, r, colour, parent = g, seg = 5, r2 = r) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
    const m = view.mesh(new THREE.CylinderGeometry(r2, r, len, seg), colour, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, parent);
    m.quaternion.setFromUnitVectors(UP, new THREE.Vector3(dx / len, dy / len, dz / len)); return m;
  };
  const group = (x, y, z, rx = 0, ry = 0, rz = 0, parent = g) => { const q = new THREE.Group(); q.position.set(x, y, z); q.rotation.set(rx, ry, rz); parent.add(q); return q; };
  // A child group laid on the ground's slope under the piece (flat things:
  // trodden earth, ash, hide), in the piece's own turned frame.
  const onSlope = (parent = g) => {
    const gr = view.ground?.gradientAt && !view.ground.flat ? view.ground.gradientAt(p.x, p.z) : { x: 0, z: 0 };
    const sx = gr.x * c - gr.z * s, sz = gr.x * s + gr.z * c;
    return group(0, 0, 0, -Math.atan(sz), 0, Math.atan(sx), parent);
  };
  // Flat ground dressing: no shadow (it would only darken itself).
  const flat = (x, y, z, w, h, d, colour, parent) => { const m = box(x, y, z, w, h, d, colour, parent); m.castShadow = false; return m; };
  // A soft patch on the ground (trodden earth, ash, an old stain): an
  // eight-sided disc squashed and turned, so it never reads as a square mat.
  const patch = (x, z, rx, rz, colour, parent = g, y = .01) => { const m = cyl(x, y, z, 1, .02, colour, parent, 8); m.scale.set(rx, 1, rz); m.rotation.y = random() * 3; m.castShadow = false; return m; };
  // Leaves dropped round a point (on `parent`: a slope group already follows the ground).
  const leaves = (n, cx, cz, spread, parent = g, y = .02) => {
    for (let i = 0; i < n; i++) { const a = random() * 6.3, r = random() * spread, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; flat(x, (parent === g ? lift(x, z) : 0) + y, z, .16, .02, .12, K.leaf[i % 3], parent).rotation.y = a; }
  };
  BUILDERS[p.type]?.({ view, p, g, random, lift, world, box, cyl, ball, rock, stick, group, onSlope, flat, patch, leaves, base });
}

// A plain six-board coffin's outline (wide at the shoulders, narrow at head
// and foot): the head end at -x.
function coffinShape(L, head, shoulder, foot) {
  const shape = new THREE.Shape(), s0 = -L / 2 + L * .27;
  shape.moveTo(-L / 2, -head / 2); shape.lineTo(s0, -shoulder / 2); shape.lineTo(L / 2, -foot / 2);
  shape.lineTo(L / 2, foot / 2); shape.lineTo(s0, shoulder / 2); shape.lineTo(-L / 2, head / 2); shape.closePath();
  return shape;
}

// Wall boards along a closed outline (x, z points), `h` high, `t` thick.
function boardsAlong(k, pts, y, h, t, colour, parent) {
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], len = Math.hypot(bx - ax, bz - az);
    k.box((ax + bx) / 2, y, (az + bz) / 2, len + t * .6, h, t, colour, parent).rotation.y = -Math.atan2(bz - az, bx - ax);
  }
}

const BUILDERS = {
  // The stocks: two posts and the two-board leg stock between them (the upper
  // board hinged, the ankle holes along the joint), a plank bench behind for
  // the sitter. A pair of worn buckled shoes still stuck in the middle holes,
  // toes out: whoever wore them is gone.
  stocks(k) {
    const { box, group, random, onSlope, ball } = k;
    for (const x of [-.82, .82]) { box(x, .37, 0, .14, .78, .14, K.dark); box(x, .78, 0, .18, .05, .18, K.greyDark); }
    box(0, .3, 0, 1.52, .24, .09, K.grey);
    const upper = group(-.76, .43, 0, 0, 0, .025); box(.76, .1, 0, 1.52, .2, .09, K.worn, upper);
    for (const x of [-.52, -.28, .28, .52]) box(x, .43, 0, .1, .07, .1, K.hole);
    box(.66, .44, .05, .06, .18, .02, K.iron); box(-.7, .5, .05, .1, .05, .02, K.iron);
    // The bench: a split plank on four splayed stakes.
    box(0, .41, -.42, 1.56, .06, .28, K.worn);
    for (const x of [-.62, .62]) for (const z of [-.52, -.32]) box(x, .19, z, .06, .4, .06, K.dark).rotation.x = (z < -.4 ? -1 : 1) * .14;
    // The shoes: heels in the holes, toes drooping out toward the ground.
    for (const x of [-.28, .28]) {
      const shoe = group(x + (random() - .5) * .02, .42, .07, .32, (random() - .5) * .25, 0);
      box(0, 0, .1, .1, .08, .24, K.leather, shoe);
      box(0, -.045, .11, .11, .025, .27, K.leatherDark, shoe);
      box(0, .045, .04, .07, .02, .04, K.buckle, shoe);
    }
    const t = onSlope();
    // Something thrown at the last one kept here, gone to rot.
    for (let i = 0; i < 3; i++) { const lump = ball(-.5 + random(), .04, .3 + random() * .2, .06 + random() * .03, i % 2 ? K.rot : '#5d6444', t); lump.scale.y = .5; lump.castShadow = false; }
  },
  // The pillory: a post on a fieldstone footing with the head-and-hands board
  // at the top, its upper half hinged and left lifted a crack at the free end.
  pillory(k) {
    const { box, group, rock, onSlope, ball, random } = k;
    rock(0, .08, 0, .34, K.stoneDark, k.g, .45); box(0, .16, 0, .34, .1, .34, K.stone);
    box(0, 1.12, 0, .2, 2.16, .2, K.dark); box(0, 2.22, 0, .27, .06, .27, K.greyDark);
    box(0, 1.52, .14, 1.32, .22, .08, K.grey);
    const lid = group(-.66, 1.63, .14, 0, 0, .07); box(.66, .1, 0, 1.32, .2, .08, K.worn, lid);
    // The neck hole between the hand holes, along the joint.
    box(0, 1.635, .14, .2, .1, .1, K.hole); for (const x of [-.42, .42]) box(x, 1.635, .14, .11, .07, .1, K.hole);
    box(-.6, 1.62, .19, .1, .3, .02, K.iron); box(.6, 1.56, .19, .06, .12, .02, K.iron);
    // A brace from the post up to the board's back.
    box(0, 1.3, .07, .08, .5, .06, K.dark).rotation.x = .25;
    const t = onSlope();
    for (let i = 0; i < 2; i++) { const lump = ball(-.3 + random() * .6, .04, .35 + random() * .2, .07, i ? K.rot : '#5d6444', t); lump.scale.y = .45; lump.castShadow = false; }
  },
  // The whipping post: tall, leaning a little, worn pale at shoulder height,
  // an iron ring on a staple and a frayed rope end hanging from it. The
  // ground round its foot trodden bare.
  whippingPost(k) {
    const { box, group, stick, view, patch, onSlope, random } = k;
    const post = group(0, 0, 0, (random() - .5) * .05, 0, .035);
    box(0, 1.25, 0, .26, 2.5, .26, K.dark, post); box(0, 2.52, 0, .3, .06, .3, K.greyDark, post);
    box(0, 1.5, 0, .27, .26, .27, K.worn, post);
    box(0, 1.98, .14, .07, .1, .04, K.iron, post);
    const ring = view.mesh(new THREE.TorusGeometry(.09, .02, 4, 10), K.iron, 0, 1.87, .17, post); ring.rotation.x = .6;
    stick([0, 1.8, .2], [.04, 1.3, .22], .024, K.rope, post);
    for (let i = 0; i < 4; i++) stick([.04, 1.3, .22], [.04 + (i - 1.5) * .04, 1.14 + random() * .04, .22 + (random() - .5) * .08], .008, K.strawDark, post);
    const t = onSlope(); patch(0, 0, .75, .6, K.trampled, t);
  },
  // A granite mounting block of two steps, the top worn hollow, lichen on it.
  mountingBlock(k) {
    const { box, flat } = k;
    box(0, .16, 0, 1, .36, .8, K.granite);
    box(-.25, .52, 0, .5, .36, .8, K.graniteDark);
    box(-.2, .706, 0, .28, .01, .42, '#9a9890'); box(.28, .346, .05, .3, .01, .5, '#9a9890');
    box(-.36, .706, -.28, .16, .012, .18, K.lichen); box(.4, .346, -.3, .14, .012, .12, K.lichen);
    flat(.2, .03, .42, .6, .06, .08, K.moss); flat(-.52, .03, -.1, .06, .06, .5, K.moss);
  },
  // Two posts and a pole rail, rubbed pale where the reins went; the ground
  // trodden bare in front (the horses' side, +z) and a cast shoe in it.
  hitchingRail(k) {
    const { box, cyl, patch, onSlope, view, random } = k;
    for (const x of [-1.3, 1.3]) { box(x, .55, 0, .15, 1.1, .15, K.dark); box(x, 1.11, 0, .18, .04, .18, K.greyDark); }
    cyl(0, 1.02, 0, .055, 2.9, K.wood).rotation.z = Math.PI / 2;
    for (const x of [-.75, .05, .7]) cyl(x + (random() - .5) * .2, 1.02, 0, .059, .22, K.rubbed).rotation.z = Math.PI / 2;
    const t = onSlope(); patch(-.45, .75, .9, .5, K.trampled, t); patch(.55, .7, .8, .45, K.trampled, t, .012);
    const shoe = view.mesh(new THREE.TorusGeometry(.07, .016, 3, 8, Math.PI * 1.55), K.rust, .6, .03, .9, t); shoe.rotation.set(-Math.PI / 2, 0, random() * 6); shoe.castShadow = false;
  },
  // A hay wagon (bed, flared hay ladders, four spoked wheels, the tongue down
  // on the ground), heaped with hay over the ladders; a fork left in it.
  hayWagon(k) {
    const { box, cyl, group, stick, view, ball, random, flat, lift } = k;
    const bx = -.15, y = .8;
    const wheel = (x, z, r) => {
      const w = view.mesh(new THREE.TorusGeometry(r, .05, 4, 12), K.dark, bx + x, r, z, k.g);
      for (let i = 0; i < 3; i++) { const sp = box(bx + x, r, z, r * 2 - .06, .05, .04, K.wood); sp.rotation.z = i * Math.PI / 3; }
      cyl(bx + x, r, z, .09, .16, K.greyDark, k.g, 7).rotation.x = Math.PI / 2;
      return w;
    };
    for (const z of [-.78, .78]) { wheel(-1.05, z, .56); wheel(1.05, z, .46); }
    for (const x of [-1.05, 1.05]) box(bx + x, x < 0 ? .56 : .46, 0, .1, .1, 1.7, K.dark);
    box(bx, y, 0, 3.2, .08, 1.36, K.wood);
    for (const z of [-.68, .68]) box(bx, y + .18, z, 3.2, .3, .06, z < 0 ? K.grey : K.wood);
    for (const x of [-1.58, 1.58]) box(bx + x, y + .18, 0, .06, .3, 1.36, K.greyDark);
    // The hay ladders, flared out over the wheels.
    for (const side of [-1, 1]) {
      const rack = group(bx, y + .32, side * .7, side * .42, 0, 0);
      box(0, .56, 0, 3.4, .06, .06, K.dark, rack);
      for (let i = 0; i < 6; i++) box(-1.55 + i * .62, .28, 0, .05, .58, .05, K.dark, rack);
    }
    // The hay: a long heap over the bed and the ladders, a paler top.
    for (let i = 0; i < 4; i++) { const h = ball(bx - 1.1 + i * .74, y + .45, (random() - .5) * .2, .72, i % 2 ? K.straw : K.hay); h.scale.set(.9, .56, 1.18); h.rotation.y = random() * 3; }
    for (let i = 0; i < 3; i++) { const h = ball(bx - .75 + i * .72, y + .68, (random() - .5) * .2, .48, K.strawPale); h.scale.set(1, .5, 1.1); }
    for (let i = 0; i < 7; i++) { const side = i % 2 ? 1 : -1, st = box(bx - 1.3 + i * .42, y + .38, side * 1.02, .06, .5, .12, K.strawDark); st.rotation.x = side * .5; st.castShadow = false; }
    // The fork, stuck in the hay.
    stick([bx + .7, y + .8, .1], [bx + 1.3, y + 1.7, .35], .025, K.pale);
    for (const dz of [-.05, 0, .05]) stick([bx + .7, y + .8, .1 + dz], [bx + .6, y + .55, .08 + dz], .01, K.iron);
    // The tongue, run out forward, its end down on the ground; hay dropped round it.
    stick([bx + 1.6, .55, 0], [bx + 2.05, lift(bx + 2.05, 0) + .06, .05], .05, K.grey);
    for (let i = 0; i < 8; i++) { const a = random() * 6.3, r = 1.2 + random() * .7, x = Math.cos(a) * r * 1.3, z = Math.sin(a) * r * .8; flat(x, lift(x, z) + .02, z, .45, .03, .07, i % 2 ? K.straw : K.strawDark).rotation.y = a; }
  },
  // A rain barrel under the eaves: staves, three hoops, dark water to the
  // brim, a gourd dipper hung on the rim; moss and wet earth at its foot.
  rainBarrel(k) {
    const { box, cyl, stick, ball } = k;
    cyl(0, .45, 0, .28, .9, K.worn, k.g, 10, .3);
    for (const y of [.14, .5, .82]) cyl(0, y, 0, .3 + y * .015, .045, K.iron, k.g, 10);
    cyl(0, .875, 0, .275, .012, K.water, k.g, 10);
    box(.2, .45, .21, .07, .82, .015, K.dark).rotation.y = -.78;
    const gourd = ball(.26, .74, -.12, .08, K.wicker); gourd.scale.set(1, .8, 1);
    stick([.24, .79, -.1], [.08, .92, -.02], .012, K.wicker);
    cyl(0, .03, 0, .34, .06, K.moss, k.g, 10).castShadow = false;
    k.patch(.3, .3, .4, .28, K.earthDark);
  },
  // The smithy's grindstone: a sandstone wheel on its axle between the rails
  // of a splayed trestle, the crank, the water trough under it, and a blade
  // left on the frame to be ground.
  grindstone(k) {
    const { box, cyl } = k;
    for (const z of [-.25, .25]) box(0, .62, z, 1.2, .08, .08, K.dark);
    for (const x of [-.5, .5]) for (const z of [-.25, .25]) { const leg = box(x, .3, z * 1.15, .07, .64, .07, K.dark); leg.rotation.set(z > 0 ? -.12 : .12, 0, x > 0 ? -.1 : .1); }
    const wheel = cyl(0, .84, 0, .42, .13, K.sandstone, k.g, 14); wheel.rotation.x = Math.PI / 2;
    cyl(0, .84, 0, .3, .135, '#9a9284', k.g, 14).rotation.x = Math.PI / 2;
    cyl(0, .84, 0, .03, .72, K.iron, k.g, 5).rotation.x = Math.PI / 2;
    box(0, .74, .37, .04, .22, .03, K.iron); box(0, .63, .43, .03, .03, .14, K.wood);
    box(0, .44, 0, .52, .16, .26, K.dark); box(0, .525, 0, .46, .01, .2, K.washWater);
    box(-.42, .67, 0, .3, .02, .06, K.iron).rotation.y = .3;
  },
  // A low heap of the forge's slag and cinders, raked out and left: dark
  // glassy lumps, clinker, a bent bar and a broken shoe in it.
  slagHeap(k) {
    const { rock, box, view, random, onSlope, flat } = k, t = onSlope();
    const cols = [K.cinder, K.soot, K.slag, '#4a4540', K.cinder];
    for (let i = 0; i < 9; i++) { const a = random() * 6.3, r = random() * .55, m = rock(Math.cos(a) * r * 1.3, .05, Math.sin(a) * r * .9, .16 + random() * .22, cols[i % 5], t, .35); m.castShadow = i < 3; }
    for (let i = 0; i < 10; i++) { const a = random() * 6.3, r = .5 + random() * .45; flat(Math.cos(a) * r * 1.3, .02, Math.sin(a) * r * .8, .08 + random() * .08, .04, .07, cols[i % 5], t).rotation.y = a; }
    box(.3, .16, -.1, .5, .03, .03, K.rust, t).rotation.set(.2, .5, .1);
    const shoe = view.mesh(new THREE.TorusGeometry(.07, .015, 3, 8, Math.PI), K.rust, -.4, .08, .25, t); shoe.rotation.set(-1.3, 0, 1); shoe.castShadow = false;
    k.patch(0, 0, .85, .6, K.soot, t);
  },
  // A wooden plough left where it stopped: the beam, the iron share and
  // mouldboard, the two handles, tipped onto its landside; a short stretch of
  // turned earth behind it.
  plough(k) {
    const { box, stick, group, flat, onSlope, random } = k;
    const t = onSlope(), pl = group(.2, 0, 0, .14, 0, 0, t);
    stick([1.1, .5, 0], [-.35, .32, 0], .055, K.wood, pl);
    box(-.05, .2, 0, .08, .34, .1, K.dark, pl);
    box(.02, .05, 0, .82, .06, .1, K.dark, pl);
    box(.48, .06, .07, .24, .05, .18, K.iron, pl).rotation.y = -.4;
    box(.14, .17, .12, .5, .24, .04, K.worn, pl).rotation.set(.35, -.45, 0);
    stick([-.25, .24, -.1], [-1.05, .86, -.28], .03, K.wood, pl); stick([-.25, .24, .1], [-1.05, .86, .28], .03, K.wood, pl);
    box(-.78, .66, 0, .04, .04, .46, K.dark, pl);
    box(1.12, .5, 0, .1, .1, .07, K.iron, pl);
    // Turned earth: two low furrow ridges behind it (earth on edge, half sunk).
    for (const z of [-.22, .2]) { const r = flat(-.8, .0, z, 1.05, .16, .16, z < 0 ? K.earthDark : K.earth, t); r.rotation.set(Math.PI / 4, (random() - .5) * .08, 0); }
  },
  // A square timber harrow, its iron teeth driven through the bars, lying
  // flat in the grass with its drawing chain.
  harrow(k) {
    const { box, view, onSlope, random } = k, t = onSlope();
    [-.55, -.18, .18, .55].forEach((z, i) => box(0, .1, z, 1.5, .09, .09, i % 2 ? K.dark : K.wood, t));
    for (const x of [-.68, 0, .68]) box(x, .17, 0, .09, .06, 1.3, K.dark, t);
    for (const x of [-.5, -.17, .17, .5]) for (const z of [-.55, -.18, .18, .55]) box(x + (Math.abs(z) < .3 ? .16 : 0), .15, z, .04, .03, .04, K.iron, t);
    for (let i = 0; i < 4; i++) { const link = view.mesh(new THREE.TorusGeometry(.04, .012, 3, 6), K.rust, .82 + i * .07, .02, (random() - .5) * .05, t); link.rotation.set(-Math.PI / 2, 0, 0); link.rotation.y = i % 2 ? 1.57 : 0; link.castShadow = false; }
  },
  // A scythe leaning on a fence (the fence at -z): the bent snath with its two
  // grips, the long blade down in the grass at its heel.
  scythe(k) {
    const { box, stick, group } = k;
    const heel = [0, .04, .18], mid = [.04, .78, -.04], top = [.08, 1.42, -.2];
    stick(heel, mid, .034, K.pale); stick(mid, top, .03, K.pale);
    stick([.02, .52, .06], [.19, .56, .13], .02, K.wood); stick([.06, 1.08, -.1], [.23, 1.1, -.04], .02, K.wood);
    const blade = group(0, .04, .18, 0, -.35, 0);
    for (let i = 0; i < 4; i++) { const b = box(.1 + i * .17, .012, -i * i * .02, .18, .014, .08 - i * .012, K.steel, blade); b.rotation.y = i * .12; b.castShadow = false; box(.1 + i * .17, .014, -i * i * .02 + .035 - i * .006, .18, .014, .015, K.buckle, blade).rotation.y = i * .12; }
  },
  // The parish bier outside the hearse house: two long carrying poles worn
  // pale at the handles, four short legs, slats, and on it a plain six-board
  // coffin with its lid off, empty.
  bier(k) {
    const { box, view, group } = k;
    for (const z of [-.3, .3]) { box(0, .6, z, 2.4, .06, .07, K.dark); for (const x of [-1.1, 1.1]) box(x, .6, z, .2, .065, .075, K.worn); }
    for (const x of [-.72, .72]) for (const z of [-.3, .3]) box(x, .3, z, .07, .6, .07, K.dark);
    for (const x of [-.6, -.2, .2, .6]) box(x, .645, 0, .09, .03, .66, K.wood);
    const L = 1.85, pts = [[-L / 2, -.17], [-L / 2 + L * .27, -.27], [L / 2, -.14], [L / 2, .14], [-L / 2 + L * .27, .27], [-L / 2, .17]];
    const cof = group(0, .66, 0);
    const bottom = view.mesh(indexed(new THREE.ExtrudeGeometry(coffinShape(L, .34, .54, .28), { depth: .04, bevelEnabled: false })), K.dark, 0, 0, 0, cof); bottom.rotation.x = Math.PI / 2; bottom.position.y = .04;
    box(0, .045, 0, 1.7, .012, .28, K.soot, cof);
    boardsAlong(k, pts, .2, .34, .03, K.pale, cof);
    // A strip of the shroud's linen caught on the rim, hanging over the side.
    const strip = box(.25, .3, .27, .34, .24, .012, K.linen, cof); strip.rotation.set(.15, .12, .1);
  },
  // The coffin's lid, stood on its end and leaning back on the wall (at -z).
  coffinLid(k) {
    const { view, group, box } = k;
    const lean = group(0, 0, .45, -.48, 0, 0);
    const lid = view.mesh(indexed(new THREE.ExtrudeGeometry(coffinShape(1.8, .32, .52, .27), { depth: .035, bevelEnabled: false })), K.pale, 0, .9, 0, lean);
    lid.rotation.set(0, 0, Math.PI / 2);
    for (const y of [.5, 1.35]) box(0, y, -.03, .44, .05, .025, K.dark, lean);
  },
  // The grave digger's wheelbarrow, heaped with raw earth from the grave, a
  // mattock laid across it; clods fallen round it.
  diggersBarrow(k) {
    const { box, cyl, stick, group, random, lift } = k;
    const wheel = cyl(.78, .26, 0, .26, .08, K.dark, k.g, 10); wheel.rotation.x = Math.PI / 2;
    cyl(.78, .26, 0, .06, .16, K.iron, k.g, 6).rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) { box(-.12, .44, side * .26, 1.7, .06, .06, K.wood).rotation.z = .08; box(-.35, .2, side * .26, .06, .4, .06, K.dark); }
    box(.12, .48, 0, .9, .05, .6, K.wood);
    for (const side of [-1, 1]) box(.12, .6, side * .33, .92, .2, .04, K.pale).rotation.x = side * .3;
    box(-.33, .6, 0, .04, .22, .6, K.pale); box(.57, .6, 0, .04, .22, .6, K.pale);
    const earth = [K.earth, K.earthDark];
    for (let i = 0; i < 6; i++) { const l = k.ball(.12 + (random() - .5) * .6, .66 + random() * .12, (random() - .5) * .35, 1, earth[i % 2]); l.scale.set(.2 + random() * .12, .12 + random() * .06, .16 + random() * .08); }
    const m = group(.05, .88, .02, 0, .5, 0); stick([-.6, 0, 0], [.55, 0, 0], .022, K.pale, m); box(.55, 0, 0, .07, .06, .5, K.iron, m);
    for (let i = 0; i < 5; i++) { const x = (random() - .5) * 1.6, z = (random() < .5 ? -1 : 1) * (.45 + random() * .15); const l = k.ball(x, lift(x, z) + .03, z, 1, earth[i % 2]); l.scale.set(.09, .05, .08); l.castShadow = false; }
  },
  // An unlit pierced-tin lantern set down on a table tomb (p.lift: the slab's
  // top), its candle burnt out, a spill of old wax beside it.
  tombLantern(k) {
    const { box, cyl, view, random } = k, y = k.p.lift ?? .8;
    cyl(0, y + .02, 0, .12, .04, K.tinDark, k.g, 8);
    cyl(0, y + .18, 0, .105, .28, K.pewter, k.g, 8);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + (i % 2) * .3, h = y + .11 + (i % 2) * .12; box(Math.cos(a) * .106, h, Math.sin(a) * .106, .03, .03, .03, K.soot).rotation.y = -a; }
    view.mesh(new THREE.ConeGeometry(.13, .16, 8), K.pewter, 0, y + .4, 0, k.g);
    const ring = view.mesh(new THREE.TorusGeometry(.05, .012, 3, 8), K.tinDark, 0, y + .52, 0, k.g); ring.rotation.y = random() * 3;
    box(.2, y + .004, .06, .14, .008, .1, K.wax).rotation.y = .5; cyl(.2, y + .035, -.1, .025, .07, K.wax, k.g, 5);
  },
  // A flat-bottomed skiff pulled half out of the water, its bow up the bank
  // (+x), stern afloat; thwarts, an oar in it and one on the bank, the
  // painter run to a stake. Laid on the bank's slope (and the water).
  rowboat(k) {
    const { box, stick, group, view, lift, world, random } = k, L = 3.4;
    const ground = view.ground, [sx, sz] = world(-1.3, 0);
    const level = ground?.waterAt ? ground.waterAt(sx, sz) - k.base : -Infinity;
    const yb = lift(1.3, 0), ys = Math.max(lift(-1.3, 0), Number.isFinite(level) ? level - .1 : -Infinity);
    const hull = group(0, (yb + ys) / 2 + .03, 0, .07, 0, Math.atan2(yb - ys, 2.6));
    const pts = [[-L / 2, -.52], [-.3, -.6], [L / 2 - .5, -.36], [L / 2, 0], [L / 2 - .5, .36], [-.3, .6], [-L / 2, .52]];
    const shape = new THREE.Shape(); pts.forEach(([x, z], i) => i ? shape.lineTo(x, z) : shape.moveTo(x, z)); shape.closePath();
    const bottom = view.mesh(indexed(new THREE.ExtrudeGeometry(shape, { depth: .05, bevelEnabled: false })), K.hull, 0, .05, 0, hull); bottom.rotation.x = Math.PI / 2;
    box(0, .055, 0, 2.4, .01, .6, K.hullIn, hull);
    // The sides: one board per leg of the outline, flared out; a pale gunwale on top.
    // (Walking the outline this way the hull's inside is always on a board's
    // local +z, so every board flares out toward its local -z.)
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), yaw = -Math.atan2(bz - az, bx - ax);
      const side = group((ax + bx) / 2, .2, (az + bz) / 2, 0, yaw, 0, hull);
      box(0, 0, 0, len + .04, .3, .04, K.hull, side).rotation.x = -.25;
      box(0, .15, -.037, len + .04, .04, .07, K.hullPale, side);
    }
    box(-L / 2, .2, 0, .05, .3, 1.02, K.hull, hull);
    for (const x of [-.95, .35]) box(x, .26, 0, .22, .04, 1.1 - Math.abs(x + .3) * .12, K.hullPale, hull);
    // Water in its low end, an oar along the thwarts.
    box(-1.2, .07, 0, .7, .01, .8, K.water, hull);
    const oar = group(.1, .33, .2, 0, .08, 0, hull); stick([-1.3, 0, 0], [.9, 0, 0], .025, K.pale, oar); box(-1.45, 0, 0, .45, .02, .12, K.pale, oar);
    // The other oar on the bank, and the painter to a stake up the bank.
    const bank = group(1.3, lift(1.3, .9) + .03, .95, 0, -.3, 0); stick([-.9, 0, 0], [1, 0, 0], .025, K.pale, bank); box(1.15, 0, 0, .45, .02, .12, K.pale, bank);
    const stake = [2.1, lift(2.1, -.2), -.2];
    stick(stake, [stake[0] + .02, stake[1] + .5, stake[2]], .04, K.dark);
    stick([L / 2 - .05, yb + .35, 0], [stake[0], stake[1] + .38, stake[2]], .014, K.rope);
    for (let i = 0; i < 2; i++) { const z = (random() - .5) * .3; k.flat(-.4 + i * .8, .07, z, .16, .02, .12, K.leaf[i], hull); }
  },
  // A wicker eel pot at the water's edge, its funnel mouth into the stream
  // (-x), tied back to a stake in the bank.
  eelPot(k) {
    const { cyl, stick, group, view, lift } = k;
    const y0 = lift(-.35, 0), y1 = lift(.35, 0);
    // (The narrow closed end up the bank at +x, the funnel mouth at -x.)
    const pot = group(0, (y0 + y1) / 2 + .15, 0, 0, 0, Math.atan2(y1 - y0, .7) - Math.PI / 2);
    cyl(0, 0, 0, .15, .8, K.wicker, pot, 8, .08);
    for (const y of [-.3, -.1, .1, .3]) cyl(0, y, 0, .15 - (y + .4) * .085 + .008, .04, K.wickerDark, pot, 8);
    view.mesh(new THREE.ConeGeometry(.15, .18, 8, 1, true), K.wickerDark, 0, -.45, 0, pot).rotation.x = Math.PI;
    cyl(0, .42, 0, .05, .06, K.rope, pot, 5);
    const stake = [.55, lift(.55, .05), .05];
    stick(stake, [stake[0], stake[1] + .45, stake[2]], .03, K.dark);
    stick([.4, (y0 + y1) / 2 + .18, 0], [stake[0], stake[1] + .3, stake[2]], .012, K.rope);
  },
  // A washtub on the bank below the farm: staves and hoops, grey water, a
  // carved wooden washboard (fluted, no metal) leaning in it, wet linen over
  // the rim, the battling paddle down in the grass.
  washTub(k) {
    const { box, cyl, group } = k;
    cyl(0, .19, 0, .35, .38, K.worn, k.g, 10, .39);
    for (const y of [.08, .3]) cyl(0, y, 0, .36 + y * .1, .04, K.dark, k.g, 10);
    cyl(0, .33, 0, .37, .01, K.washWater, k.g, 10);
    const board = group(.14, .2, 0, 0, 0, -.42);
    box(0, .3, 0, .34, .64, .03, K.pale, board);
    for (let i = 0; i < 7; i++) box(0, .1 + i * .06, .02, .28, .025, .02, K.worn, board);
    box(-.27, .36, .08, .22, .015, .38, K.linen).rotation.z = .3;
    box(-.4, .2, .08, .015, .26, .34, K.linen);
    const bat = group(-.1, .03, .56, 0, .9, 0); box(0, 0, 0, .3, .04, .12, K.pale, bat); box(.28, 0, 0, .28, .035, .04, K.pale, bat);
    k.patch(.1, .1, .6, .45, K.earthDark);
  },
  // Two spare millstones leaning on the mill's wall (at -z): thick granite
  // discs on edge with the dressing's furrows and the square eye on their
  // faces, chocked at the foot.
  spareMillstones(k) {
    const { box, cyl, group, random } = k;
    [[-.3, .59, K.granite, -.08, .4], [.32, .54, K.graniteDark, .1, .36]].forEach(([x, r, colour, z0, lean]) => {
      const st = group(x, r * Math.cos(lean), z0, -lean, 0, 0);
      cyl(0, 0, 0, r, .2, colour, st, 14).rotation.x = Math.PI / 2;
      box(0, 0, .105, .13, .13, .012, K.hole, st);
      for (let i = 0; i < 6; i++) { const f = box(0, 0, .104, .025, r * .8, .006, K.stoneDark, st); f.rotation.z = i / 6 * Math.PI * 2 + .25; f.position.set(Math.cos(i / 6 * Math.PI * 2 + .25 + Math.PI / 2) * r * .5, Math.sin(i / 6 * Math.PI * 2 + .25 + Math.PI / 2) * r * .5, .104); }
      box(r * .3, r * .55, .104, .16, .1, .006, K.lichen, st).rotation.z = random();
      box(x, .04, z0 + r * Math.sin(lean) + .08, .22, .08, .12, K.dark);
    });
  },
  // A ring of blackened stones round the ash of a fire long dead: charred
  // sticks, a few small bones, an iron pot on its side.
  fireRing(k) {
    const { rock, cyl, stick, ball, view, onSlope, random } = k, t = onSlope();
    for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2 + random() * .2, r = .6 + random() * .06; rock(Math.cos(a) * r, .06, Math.sin(a) * r, .13 + random() * .06, [K.char, '#3a3834', '#4a4744'][i % 3], t, .7).castShadow = false; }
    cyl(0, .015, 0, .5, .03, K.ash, t, 10).castShadow = false; cyl(.05, .03, -.03, .3, .02, K.ashDark, t, 9).castShadow = false;
    for (let i = 0; i < 5; i++) { const a = i * 1.3 + random() * .4, r = .1 + random() * .25; stick([Math.cos(a) * r, .04, Math.sin(a) * r], [Math.cos(a) * (r + .35), .06, Math.sin(a) * (r + .35)], .025, i % 2 ? K.char : K.soot, t).castShadow = false; }
    // Small bones (a rabbit's, a bird's), picked clean.
    for (let i = 0; i < 4; i++) { const a = random() * 6.3, r = .15 + random() * .3; stick([Math.cos(a) * r, .045, Math.sin(a) * r], [Math.cos(a) * r + .1, .045, Math.sin(a) * r + (random() - .5) * .08], .01, i % 2 ? K.bone : K.boneOld, t).castShadow = false; }
    const skull = ball(.22, .05, .18, .035, K.bone, t); skull.scale.set(1.6, .9, 1); skull.castShadow = false;
    // The pot, tipped over outside the ring.
    const pot = cyl(.95, .13, .3, .13, .2, K.iron, t, 8, .15); pot.rotation.set(0, 0, 1.3);
    cyl(1.04, .13, .3, .11, .01, K.soot, t, 8).rotation.set(0, 0, 1.3);
    view.mesh(new THREE.TorusGeometry(.12, .01, 3, 8, Math.PI), K.iron, .92, .2, .3, t).rotation.set(0, 0, -.3);
    k.patch(0, 0, .85, .8, '#453c32', t, .006);
  },
  // A small cairn of stacked flat fieldstones, a pale stone on top.
  cairn(k) {
    const { rock, random } = k;
    const layers = [[.3, .12], [.27, .12], [.23, .12], [.19, .11], [.15, .1], [.11, .09]];
    let y = .04;
    layers.forEach(([r, h], i) => { rock((random() - .5) * .06, y + h * .4, (random() - .5) * .06, r, i === layers.length - 1 ? '#a3a098' : [K.stone, K.stoneDark, K.lichen][i % 3], k.g, .42); y += h * 1.05; });
    k.patch(.05, .12, .32, .2, K.moss);
    k.leaves(4, 0, 0, .6);
  },
  // A deer's carcass under a tree, long picked over: the ribs arched off the
  // spine, the skull with a young buck's antlers, leg bones pulled apart, a
  // few scraps of hide with the hair on, an old dark stain, leaves over it.
  deerCarcass(k) {
    const { box, stick, ball, view, onSlope, random, flat } = k, t = onSlope();
    stick([-.62, .08, 0], [.42, .1, .02], .03, K.boneOld, t);
    for (let i = 0; i < 7; i++) {
      const rib = view.mesh(new THREE.TorusGeometry(.2 - i * .012, .016, 3, 7, Math.PI * (.75 + random() * .25)), i % 3 ? K.bone : K.boneOld, -.42 + i * .12, .08, .02, t);
      rib.rotation.set(-.55, Math.PI / 2, 0);
    }
    box(-.68, .08, 0, .14, .08, .26, K.bone, t).rotation.y = .3;
    const skull = ball(.72, .09, .08, .1, K.bone, t); skull.scale.set(1.9, .75, .9); skull.rotation.y = .3;
    box(.66, .045, .16, .22, .03, .05, K.boneOld, t).rotation.y = .5;
    for (const side of [-1, 1]) {
      const a = [.66, .14, .08 + side * .06], b = [.5, .3, .08 + side * .3];
      stick(a, b, .016, K.boneOld, t); stick(b, [.36, .42, .08 + side * .44], .011, K.boneOld, t); stick([.55, .26, .08 + side * .24], [.66, .42, .08 + side * .34], .01, K.boneOld, t);
    }
    for (let i = 0; i < 4; i++) { const x = -.5 + random() * 1.1, z = (random() < .5 ? -1 : 1) * (.3 + random() * .25), a = random() * 6.3; stick([x, .04, z], [x + Math.cos(a) * .36, .04, z + Math.sin(a) * .36], .016, K.boneOld, t); box(x + Math.cos(a) * .38, .03, z + Math.sin(a) * .38, .05, .05, .06, K.char, t); }
    for (const [x, z, w, d, a, c] of [[-.2, -.25, .5, .3, .3, K.hide], [.25, .28, .34, .22, -.4, K.hideDark], [-.55, .3, .3, .2, 1, K.hidePale]]) flat(x, .04, z, w, .02, d, c, t).rotation.set((random() - .5) * .3, a, (random() - .5) * .3);
    k.patch(-.05, 0, .8, .45, K.stain, t, .006);
    k.leaves(7, 0, 0, .9, t, .03);
  },
  // A collapsed lean-to: the forked stake still standing (+x), the ridge pole
  // fallen from it to the ground, the branches that leaned on it slid down,
  // old bracken for a bed under them and a blanket gone to rags.
  leanTo(k) {
    const { stick, ball, flat, onSlope, random } = k, t = onSlope();
    const fork = [1.05, 1.12, .02];
    stick([1.1, -.05, 0], fork, .05, K.bark, t); stick(fork, [1.12, 1.3, -.06], .03, K.bark, t); stick(fork, [.98, 1.28, .08], .03, K.bark, t);
    stick([1.05, 1.08, 0], [-1.2, .1, -.1], .055, K.logBark, t);
    for (let i = 0; i < 9; i++) {
      const u = i / 8, x = 1 - u * 2.1, top = 1.05 - u * .95;
      if (i % 3 === 1) stick([x - .2, .05, -.85 - random() * .15], [x + .3, .06, -.1], .03, K.bark, t);
      else stick([x + (random() - .5) * .2, .02, -.95], [x, top, -.1], .032, i % 2 ? K.bark : K.trunk, t);
    }
    for (let i = 0; i < 3; i++) { const x = .6 - i * .6; stick([x, .04, .15], [x + .5, .05, .55 + random() * .3], .03, K.bark, t); }
    for (let i = 0; i < 4; i++) { const b = ball(.5 - i * .45, .05, -.45, .32, i % 2 ? K.leaf[1] : K.leaf[2], t); b.scale.set(1.2, .22, .9); b.castShadow = false; }
    flat(-.2, .1, -.4, .7, .02, .5, K.rag, t).rotation.set(.1, .4, .08);
    k.leaves(8, 0, -.2, 1.2, t, .03);
  },
};
