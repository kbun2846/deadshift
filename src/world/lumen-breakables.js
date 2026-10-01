// Lumen stage 4: the city's breakable props and its three trees. Types here
// are spread into map-kit.js PROP_TYPES (so this module must not import
// map-kit.js: a cycle); their models register with world/lumen-props.js
// registerLumenModel (world-build.js dispatches `LUMEN_BREAKABLES[type]` to
// makeLumenPlaceholder, which calls the registered model). How each comes
// apart (debris, leavings, sparks, steam, the hydrant's jet) is
// effects/lumen-breaks.js; its sound is effects/lumen-break-sounds.js.
//
// Design 9: health 3-12, shot or dashed through; each with its own debris,
// sound and leavings; all new designs. There are 17 new types here; the
// stage-2 breakables in world/lumen-props.js (cityVending, cityTrashBags,
// cityHydrant, cityChargePost, cityCone) get their models here too. Sizes and
// heights are the collision the simulation uses (map-kit.js mapColliders); a
// model stays inside them (+0.1 m). A round meets anything not `lowTop`
// at every height it flies, and flies over a `lowTop` piece (used for what
// is knee-high or lower, below 0.8 m), so the medium pieces (a hydrant is
// already lowTop) are real, breakable cover. None is walk-over but the cone.
//
// The three trees are solid (health null) props with a trunk collider,
// not breakable: the Uptown planter's, the Stacks courtyard's and the metro
// stairs' (design 8: exactly three trees in the city).
import * as THREE from 'three';
import { registerLumenModel } from './lumen-props.js';
import { kit, tone, CITY as C } from './lumen-kit.js';

const PI = Math.PI;

export const LUMEN_BREAKABLES = Object.freeze({
  // --- Street and market clutter, low ---
  cityCrate: { w: .9, d: .62, health: 4, walkBreak: true, lowTop: true, collisionBoxes: [[0, 0, .86, .58, .7]] }, // plastic crates, stacked two high
  cityDeliveryBox: { w: .7, d: .5, health: 3, walkBreak: true, lowTop: true, collisionBoxes: [[0, 0, .66, .46, .55]] }, // three cardboard parcels
  cityStool: { w: .4, d: .4, health: 3, walkBreak: true, lowTop: true, collisionBoxes: [[0, 0, .38, .38, .5]] },
  cityPlasticChair: { w: .55, d: .55, health: 3, walkBreak: true, lowTop: true, collisionBoxes: [[0, 0, .5, .5, .75]] },
  // --- Medium: waist to chest, real cover until broken ---
  cityMeshBin: { w: .5, d: .5, health: 5, walkBreak: true, collisionBoxes: [[0, 0, .48, .48, .85]] },
  cityRecycleBin: { w: 1.3, d: .7, health: 6, collisionBoxes: [[0, 0, 1.3, .66, 1.1]] }, // three wheelie bins in a row
  cityCableReel: { w: 1.05, d: .65, health: 8, collisionBoxes: [[0, 0, 1.05, .62, 1.05]] }, // a spool on its side
  cityWaterBarrier: { w: 1.6, d: .55, health: 10, collisionBoxes: [[0, 0, 1.6, .5, .9]] }, // plastic, filled with water
  cityBicycle: { w: 1.7, d: .55, health: 4, walkBreak: true, collisionBoxes: [[0, 0, 1.7, .5, 1]] },
  cityScooter: { w: 1.1, d: .5, health: 5, walkBreak: true, collisionBoxes: [[0, 0, 1.05, .44, 1]] }, // a parked e-scooter with underglow
  cityScooterHeap: { w: 1.9, d: 1.2, health: 8, collisionBoxes: [[0, 0, 1.85, 1.15, 1.1]] }, // a dump of dockless scooters
  cityBikeRack: { w: 1.6, d: 1.9, health: 8, collisionBoxes: [[0, 0, 1.5, 1.85, 1]] }, // steel hoops and the two bikes locked to them
  cityFoodCart: { w: 1.8, d: .9, health: 9, collisionBoxes: [[0, 0, 1.75, .85, 1.1]] },
  // --- Tall: a body hides behind them until they go ---
  cityParcelLocker: { w: 1.5, d: .6, health: 12, collisionBoxes: [[0, 0, 1.5, .58, 1.9]] },
  cityShopGlass: { w: 1.6, d: .2, health: 3, collisionBoxes: [[0, 0, 1.6, .16, 2.1]] }, // a glass windbreak in a steel frame
  cityInfoTerminal: { w: .7, d: .5, health: 6, collisionBoxes: [[0, 0, .66, .46, 1.6]] },
  cityParkingMeter: { w: .3, d: .3, health: 4, collisionBoxes: [[0, 0, .26, .26, 1.3]] },
  // --- The three trees (solid; a trunk collider) ---
  // Uptown: a tree in a raised lit planter; collides as the planter (low) and the trunk.
  cityTreeUptown: { w: 2.4, d: 2.4, health: null, lowTop: true, collisionBoxes: [[0, 0, 2.2, 2.2, .6], [0, 0, .5, .5, 3.6]] },
  // The Stacks courtyard: a scraggly tree in a cracked ring of concrete, hung with bulbs.
  cityTreeStacks: { w: 2, d: 2, health: null, lowTop: true, collisionBoxes: [[0, 0, .6, .6, 3.4]] },
  // The metro stairs: a tree in a grate ringed by a square bench with a lit ledge.
  cityTreeMetro: { w: 2.8, d: 2.8, health: null, lowTop: true, collisionBoxes: [[0, -1.1, 2.6, .4, .5], [0, 1.1, 2.6, .4, .5], [-1.1, 0, .4, 1.8, .5], [1.1, 0, .4, 1.8, .5], [0, 0, .5, .5, 3.6]] },
});

// The types that come apart (everything with health): the stage-2 breakables
// plus the new ones. Order is the doc's.
export const LUMEN_BREAK_TYPES = Object.freeze(['cityVending', 'cityTrashBags', 'cityHydrant', 'cityChargePost', 'cityCone',
  ...Object.keys(LUMEN_BREAKABLES).filter(t => LUMEN_BREAKABLES[t].health !== null)]);
export const LUMEN_TREES = Object.freeze(Object.keys(LUMEN_BREAKABLES).filter(t => LUMEN_BREAKABLES[t].health === null));

// --- The hydrant's jet (design 9): a broken hydrant sprays for 6 s and, for
// that time, its cloud of spray blocks sight for everyone, robots included,
// as a steam vent does (maps/lumen-vents.js ventsBlockSight; never rounds or
// movement). The break time is stamped on the sim (`jetStart`, from
// Simulation.hitProp and the joiner's propBreak); a restored prop (hp > 0)
// ends it. Pure functions of the shared match clock (`worldTime()`, as the
// vents use), so every screen that ran the break agrees.
export const JET = Object.freeze({ types: Object.freeze(['cityHydrant']), duration: 6, radius: 1.5, rise: .3, linger: 1.2 });

// The clock a jet keeps: the shared match clock where the sim has one.
const clock = sim => sim.worldTime ? sim.worldTime() : sim.time;

// Stamp a jet when `prop` (a sim prop) breaks; `sim` holds `jets`. `at`: the
// break's time on the shared clock where the caller knows it better than
// now (a joiner: the host's tick, not when the news arrived).
export function jetStart(sim, prop, at = clock(sim)) {
  if (!JET.types.includes(prop.type)) return false;
  const jets = sim.jets ||= [];
  for (let i = jets.length - 1; i >= 0; i--) if (jets[i].prop === prop) jets.splice(i, 1);
  jets.push({ prop, x: prop.x, z: prop.z, at });
  return true;
}
// Is jet `j` spraying at `time`?
export const jetOn = (j, time) => j.prop.hp <= 0 && time - j.at >= 0 && time - j.at < JET.duration;
// Does the segment a..b pass through a spraying jet's cylinder? (Eye inside counts.)
export function jetsBlockSight(sim, ax, az, bx, bz) {
  const jets = sim.jets; if (!jets?.length) return false;
  const r = JET.radius, r2 = r * r, dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, time = clock(sim);
  for (let i = 0; i < jets.length; i++) {
    const j = jets[i];
    if (Math.min(ax, bx) > j.x + r || Math.max(ax, bx) < j.x - r || Math.min(az, bz) > j.z + r || Math.max(az, bz) < j.z - r) continue;
    if (!jetOn(j, time)) continue;
    const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((j.x - ax) * dx + (j.z - az) * dz) / l2)) : 0;
    const ex = ax + dx * t - j.x, ez = az + dz * t - j.z;
    if (ex * ex + ez * ez < r2) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The models. Local frame: from y 0 up, the front (the side to use) is +z.

// A sub-assembly turned about y (and leaned about its own x axis) at (ox, oz):
// the bikes and scooters, which lie every way in a rack and a heap.
function assembly(K, ox, oz, yaw = 0, lean = 0, oy = 0) {
  const eul = new THREE.Euler(lean, yaw, 0, 'YXZ'), qa = new THREE.Quaternion().setFromEuler(eul), qp = new THREE.Quaternion(), e2 = new THREE.Euler(), v = new THREE.Vector3();
  const fix = (mesh, x, y, z, rot) => {
    v.set(x, y, z).applyEuler(eul); mesh.position.set(ox + v.x, oy + v.y, oz + v.z);
    mesh.quaternion.copy(qa); if (rot) mesh.quaternion.multiply(qp.setFromEuler(e2.set(rot[0] || 0, rot[1] || 0, rot[2] || 0)));
    return mesh;
  };
  return {
    box: (x, y, z, w, h, d, colour, rot) => fix(K.box(0, 0, 0, w, h, d, colour), x, y, z, rot),
    cyl: (x, y, z, r, h, colour, seg, top, rot) => fix(K.cyl(0, 0, 0, r, h, colour, seg, top), x, y, z, rot),
    ring: (x, y, z, radius, tube, colour, rot, seg, tseg) => fix(K.ring(0, 0, 0, radius, tube, colour, [0, 0, 0], seg, tseg), x, y, z, rot || [0, 0, 0]),
    lit: (x, y, z, w, h, d, colour, strength, rot) => fix(K.lit(0, 0, 0, w, h, d, colour, strength), x, y, z, rot),
  };
}
// A thin tube between two points in the x-y plane (a bike frame member).
function bar(A, x1, y1, x2, y2, z, t, colour) {
  const dx = x2 - x1, dy = y2 - y1;
  return A.box((x1 + x2) / 2, (y1 + y2) / 2, z, Math.hypot(dx, dy), t, t, colour, [0, 0, Math.atan2(dy, dx)]);
}

// A bicycle along its local x (1.7 m long), standing upright.
function bicycle(A, colour, dark, seed) {
  const R = [-.6, .33], F = [.6, .33], B = [-.05, .3], S = [-.25, .82], H = [.42, .82];
  for (const x of [R[0], F[0]]) { A.ring(x, .33, 0, .31, .022, C.black, [0, 0, 0], 12, 4); A.cyl(x, .33, 0, .03, .06, C.steelMid, 5, undefined, [PI / 2, 0, 0]); }
  bar(A, R[0], R[1], B[0], B[1], 0, .035, colour); bar(A, B[0], B[1], S[0], S[1], 0, .04, colour); bar(A, S[0], S[1], R[0], R[1], 0, .03, colour);
  bar(A, S[0], S[1], H[0], H[1], 0, .04, colour); bar(A, B[0], B[1], H[0], H[1], 0, .045, colour); bar(A, H[0], H[1], F[0], F[1], 0, .035, dark);
  A.box(-.27, .87, 0, .22, .045, .1, C.black); A.box(.43, .9, 0, .05, .05, .44, dark); // saddle, handlebar
  A.box(-.03, .27, 0, .06, .06, .3, C.steelDark); // pedals' axle
  if (seed) A.lit(-.62, .5, 0, .03, .07, .05, C.litRed, 1); // a tail lamp on the mudguard
}

// An e-scooter along its local x (1.05 long), upright on its kickstand: a deck, a stem to a handlebar, two small
// wheels and a strip of underglow (lit).
function scooter(A, colour, glow, seedLamp) {
  A.box(-.05, .16, 0, .7, .05, .17, C.graphite); A.box(-.28, .2, 0, .2, .07, .15, colour); // deck, battery
  A.cyl(-.44, .12, 0, .1, .05, C.black, 8, undefined, [PI / 2, 0, 0]); A.cyl(.4, .12, 0, .1, .05, C.black, 8, undefined, [PI / 2, 0, 0]);
  A.cyl(.4, .12, 0, .04, .07, C.steelMid, 5, undefined, [PI / 2, 0, 0]);
  A.cyl(.42, .58, 0, .022, .95, C.steelMid, 6, undefined, [0, 0, -.14]); // stem
  A.box(.36, .99, 0, .05, .05, .38, C.graphite); A.box(.4, .99, .17, .07, .05, .06, C.black); A.box(.4, .99, -.17, .07, .05, .06, C.black); // (bars inside the .44 m collider)
  A.box(.44, .96, 0, .09, .07, .12, C.panel); // display
  A.lit(-.05, .11, 0, .62, .02, .13, glow, 1.4); // underglow
  if (seedLamp) A.lit(.5, .84, 0, .04, .06, .12, C.litWhite, 1.3);
  A.box(-.44, .24, 0, .18, .02, .16, colour, [0, 0, .2]); // mudguard
}

// ----- the stage-2 breakables -----

function vending(view, p, g) {
  const K = kit(view, p, g);
  // A drinks machine 1 x .9 x 1.9: a graphite body, a lit product window (cans in colour blocks against
  // the light), a keypad and a card pad, a delivery flap, a lit header. The window colour is seeded.
  const glow = K.pick([C.litBlue, C.litPink, C.litWarm, C.litGreen, C.litWhite]);
  K.box(0, .06, -.02, .96, .12, .8, C.concreteDark);
  K.box(0, .98, -.06, .98, 1.72, .72, tone(C.graphite, .08));
  K.box(0, .99, .3, 1, 1.78, .04, C.panel);
  K.box(-.1, 1.3, .335, .74, 1.14, .03, C.black); // bezel
  K.lit(-.1, 1.3, .35, .68, 1.08, .02, glow, 1.3);
  const cans = [C.plasticRed, C.plasticBlue, C.plasticGreen, C.plasticYellow, C.plasticWhite, '#a8ff3c', C.litPink];
  for (let row = 0; row < 4; row++) for (let i = 0; i < 5; i++) {
    const x = -.38 + i * .14 + (row % 2) * .02;
    K.cyl(x, 1.66 - row * .26, .385, .045, .12, cans[(i * 3 + row * 2 + Math.floor(K.rand() * 2)) % cans.length], 6);
  }
  for (let row = 0; row < 4; row++) K.box(-.1, 1.59 - row * .26, .37, .68, .012, .05, C.steelDark); // shelves
  K.box(.4, 1.3, .335, .16, 1.14, .03, C.graphite); // control column
  K.lit(.4, 1.62, .35, .1, .12, .02, C.litWhite, 1.1); // the card pad's screen
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) K.box(.36 + j * .04, 1.3 - i * .06, .35, .025, .025, .012, C.steel);
  K.lit(.4, 1.04, .35, .1, .05, .02, C.litLemon, 1);
  K.box(-.1, .5, .335, .74, .3, .03, C.black); K.box(-.1, .5, .36, .5, .18, .02, C.panel); // the delivery flap
  K.lit(.4, .58, .35, .07, .015, .02, C.litLemon, .8);
  K.lit(0, 1.9, .28, .9, .04, .04, glow, 1); // header strip
  K.box(0, 1.94, -.06, 1, .05, .74, C.steelDark);
  K.box(-.49, 1.0, -.06, .02, .9, .5, C.rustDark); // a stained side panel
  K.done();
}

function trashBags(view, p, g) {
  const K = kit(view, p, g);
  // Bin bags: black, navy and bottle green, stacked and slumped, knotted at the neck, one split with a torn
  // pizza box and a crushed can beside it.
  const cols = ['#1d2026', '#26303f', '#20302a', '#1d2026', '#2a2c34'];
  const spots = [[-.34, -.12, .28, 1.4], [.02, .1, .3, 1.5], [.35, -.1, .26, 1.3], [-.15, -.18, .24, 1.6], [.2, -.05, .22, 2]];
  spots.forEach(([x, z, r], i) => {
    const y = i > 2 ? .24 + i * .02 : r * .8;
    K.ball(x, y, z, r, cols[i], .78, 1.05, 1, [K.rand(), K.rand() * 6, K.rand() * .5]);
    K.mesh(new THREE.ConeGeometry(.05, .12, 5), cols[i], x + (K.rand() - .5) * .1, y + r * .72, z + (K.rand() - .5) * .1, [(K.rand() - .5) * .8, 0, (K.rand() - .5) * .8]);
  });
  K.box(.4, .04, .2, .3, .06, .26, C.cardboard, [0, .4, 0]); K.cyl(-.5, .045, .25, .035, .09, C.steelMid, 6, undefined, [PI / 2, 0, .4]);
  K.ball(.15, .1, .3, .07, '#c23a48', .5, 1.4, 1); // spilled: a torn wrapper
  K.done();
}

function hydrant(view, p, g) {
  const K = kit(view, p, g);
  // A fire hydrant .4 x .4 x .8: a flanged base, a fat barrel, two side nozzles with chained caps, a dome with a
  // bolt head. Deep red mostly, lemon for a few.
  const paint = K.rand() < .3 ? C.hazard : '#8a2a34', cap = C.steelMid;
  K.cyl(0, .03, 0, .17, .06, C.concreteDark, 8);
  K.cyl(0, .3, 0, .13, .48, paint, 8, .12);
  K.cyl(0, .58, 0, .15, .06, tone(paint, -.15), 8);
  K.cyl(0, .68, 0, .12, .1, paint, 8, .1); K.mesh(new THREE.SphereGeometry(.11, 8, 4, 0, PI * 2, 0, PI / 2), tone(paint, .1), 0, .72, 0);
  K.box(0, .82, 0, .06, .05, .06, cap);
  for (const s of [-1, 1]) { K.cyl(s * .18, .42, 0, .055, .1, paint, 6, undefined, [0, 0, PI / 2]); K.cyl(s * .245, .42, 0, .06, .03, cap, 6, undefined, [0, 0, PI / 2]); }
  K.cyl(0, .38, .17, .075, .1, paint, 6, undefined, [PI / 2, 0, 0]); K.cyl(0, .38, .225, .085, .04, cap, 6, undefined, [PI / 2, 0, 0]);
  K.box(.11, .3, .13, .012, .16, .012, C.black); // a chain link
  K.done();
}

function chargePost(view, p, g) {
  const K = kit(view, p, g);
  // An EV charging post .5 x .4 x 1.5: a base plinth, a white-grey column, a lit status ring, a dark screen with
  // a lit bolt pictogram, a holster on the side with the coiled cable and its plug. The ring colour is seeded
  // (acid green for a free bay, lemon busy).
  const ring = K.pick([C.litGreen, C.litGreen, C.litLemon, C.litWhite]);
  K.box(0, .07, 0, .44, .14, .36, C.concreteDark);
  K.box(0, .76, 0, .34, 1.26, .26, C.plasticWhite); K.box(0, .76, -.13, .32, 1.24, .02, C.plasticGrey);
  K.box(0, 1.42, 0, .38, .12, .3, C.graphite);
  K.box(0, 1.02, .135, .26, .34, .02, C.black); K.lit(0, 1.02, .147, .22, .3, .012, ring, .35);
  K.lit(0, 1.05, .155, .05, .18, .012, C.litWhite, 1.2, [0, 0, .5]); K.lit(.02, .96, .155, .05, .1, .012, C.litWhite, 1.2, [0, 0, -.5]); // the bolt
  K.lit(0, .62, 0, .36, .05, .28, ring, 1.5); // the status ring
  K.box(.22, .5, .05, .08, .3, .16, C.graphite); K.ring(.26, .5, .08, .1, .018, C.black, [0, PI / 2, 0], 10, 4); // holster and coiled cable
  K.box(.25, .3, .14, .05, .12, .07, C.steelDark);
  K.box(0, .3, .135, .2, .14, .02, C.graphite);
  K.done();
}

function cone(view, p, g) {
  const K = kit(view, p, g);
  // A traffic cone .4 x .4 x .5: lemon on a black square foot with two white reflective bands, a little worn.
  K.box(0, .02, 0, .38, .04, .38, C.black);
  K.cyl(0, .26, 0, .13, .44, '#d8cc22', 8, .025);
  K.cyl(0, .33, 0, .1, .07, C.white, 8, .085); K.cyl(0, .2, 0, .118, .05, C.white, 8, .108);
  K.box(.02, .05, .1, .1, .02, .05, C.grime);
  K.done();
}

// ----- the new breakables -----

function crate(view, p, g) {
  const K = kit(view, p, g);
  // Two stacked plastic crates (milk-crate style): a floor, corner posts, two rows of slats with gaps, a rim,
  // the top one turned a few degrees; blue, green, red or yellow, with a few things in the top one.
  const colour = K.pick([C.plasticBlue, C.plasticGreen, C.plasticRed, C.plasticYellow, C.plasticGrey]);
  for (let level = 0; level < 2; level++) {
    const y0 = level * .34, turn = level ? .08 : 0, c = level ? tone(colour, .15) : colour, w = .84, d = .56;
    const a = Math.cos(turn), s = Math.sin(turn);
    const at = (x, z) => [x * a + z * s, -x * s + z * a];
    const put = (x, y, z, W, H, D, col) => { const [px, pz] = at(x, z); K.box(px, y0 + y, pz, W, H, D, col, [0, turn, 0]); };
    put(0, .02, 0, w, .04, d, tone(c, -.15));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(x * (w / 2 - .03), .17, z * (d / 2 - .03), .06, .3, .06, c);
    for (const y of [.09, .22]) for (const z of [-1, 1]) put(0, y, z * (d / 2 - .015), w - .1, .07, .03, c);
    for (const y of [.09, .22]) for (const x of [-1, 1]) put(x * (w / 2 - .015), y, 0, .03, .07, d - .1, c);
    put(0, .33, -(d / 2 - .02), w, .03, .04, tone(c, -.1)); put(0, .33, d / 2 - .02, w, .03, .04, tone(c, -.1));
    put(-(w / 2 - .02), .33, 0, .04, .03, d, tone(c, -.1)); put(w / 2 - .02, .33, 0, .04, .03, d, tone(c, -.1));
  }
  // contents in the top crate: produce and bottles as colour blocks
  for (let i = 0; i < 5; i++) K.ball(-.3 + i * .15, .58, (K.rand() - .5) * .25, .07, K.pick(['#c23a48', '#a8ff3c', '#9cc23a', '#e8322a', '#3f5a3a']), .85);
  K.done();
}

function deliveryBox(view, p, g) {
  const K = kit(view, p, g);
  // Three cardboard parcels stacked and slumped: taped seams (a paler strip), a strap, a pictogram sticker
  // (colour blocks), one crushed at a corner.
  const box = (x, y, z, w, h, d, ry, c) => {
    K.box(x, y, z, w, h, d, c, [0, ry, 0]);
    K.box(x, y + h / 2 + .002, z, w * .12, .006, d * .98, tone(c, .25), [0, ry, 0]);
  };
  box(-.12, .12, 0, .42, .24, .36, .06, C.cardboard); box(.16, .12, .06, .3, .22, .3, -.12, tone(C.cardboard, -.15));
  box(-.02, .34, -.02, .34, .2, .28, .3, tone(C.cardboard, .12));
  K.box(-.1, .3, .16, .12, .1, .01, C.litPink, [0, 0, 0]); K.box(-.1, .3, .17, .06, .06, .01, C.paper);
  K.box(-.02, .45, -.02, .36, .015, .03, C.plasticGrey, [0, .3, 0]);
  K.done();
}

function stool(view, p, g) {
  const K = kit(view, p, g);
  // A plastic bar stool .4 x .4 x .5: a round seat, four splayed legs, a foot ring; in a bar's red, blue or grey.
  const c = K.pick([C.plasticRed, C.plasticBlue, C.plasticGrey, C.plasticGreen]);
  K.cyl(0, .46, 0, .17, .05, c, 10, .16);
  for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; K.cyl(Math.cos(a) * .11, .22, Math.sin(a) * .11, .022, .44, tone(c, -.2), 5, .016, [Math.sin(a) * .16, 0, -Math.cos(a) * .16]); }
  K.ring(0, .2, 0, .12, .012, C.steelDark, [PI / 2, 0, 0], 10, 4);
  K.done();
}

function plasticChair(view, p, g) {
  const K = kit(view, p, g);
  // A monobloc chair .55 x .55: a scooped seat, a slatted back a little raked, four legs; white, grey, red or blue.
  const c = K.pick([C.plasticWhite, C.plasticGrey, C.plasticRed, C.plasticBlue, C.plasticWhite]);
  K.box(0, .42, 0, .46, .04, .44, c);
  K.box(0, .64, -.2, .45, .34, .03, c, [.12, 0, 0]);
  for (let i = -1; i <= 1; i++) K.box(i * .12, .64, -.185, .03, .28, .01, tone(c, -.2), [.12, 0, 0]);
  for (const [x, z] of [[-.2, -.18], [.2, -.18], [-.2, .18], [.2, .18]]) K.cyl(x, .2, z, .022, .4, C.steelDark, 5, .017);
  K.done();
}

function meshBin(view, p, g) {
  const K = kit(view, p, g);
  // A wire-mesh litter bin .5 x .5 x .85: a steel base disc, twelve vertical wires between three rings, a dark
  // liner with bags heaped over the rim, a dent.
  K.cyl(0, .02, 0, .23, .04, C.steelDark, 10);
  for (let i = 0; i < 12; i++) { const a = i * PI / 6; K.cyl(Math.cos(a) * .22, .43, Math.sin(a) * .22, .009, .8, C.steelMid, 4); }
  for (const y of [.06, .42, .8]) K.ring(0, y, 0, .22, .012, C.steel, [PI / 2, 0, 0], 12, 4);
  K.cyl(0, .4, 0, .2, .76, '#1d2026', 10);
  K.ball(-.04, .8, 0, .16, '#26303f', .8); K.ball(.09, .82, .05, .11, C.paper, .7);
  K.box(.2, .5, .1, .02, .3, .12, C.steelDark, [0, .5, 0]);
  K.done();
}

function recycleBin(view, p, g) {
  const K = kit(view, p, g);
  // Three wheelie bins in a row 1.3 x .66 x 1.1 (blue, green, lemon lids and a paper-white one), each with a
  // pictogram of three chasing arrows (a triangle of small bars), a handle bar behind, castors.
  const lids = [C.plasticBlue, C.plasticGreen, '#a89a2c'];
  for (let i = 0; i < 3; i++) {
    const x = -.44 + i * .44, body = tone(C.graphite, .1);
    K.box(x, .45, 0, .38, .78, .52, body); K.box(x, .9, .02, .4, .1, .56, lids[i]);
    K.box(x, 1.07, .28, .38, .04, .04, lids[i]); // a lid lip
    K.box(x, .78, -.28, .3, .04, .04, C.steelDark);
    K.cyl(x - .16, .08, -.22, .08, .05, C.black, 6, undefined, [0, 0, PI / 2]); K.cyl(x + .16, .08, -.22, .08, .05, C.black, 6, undefined, [0, 0, PI / 2]);
    for (let k = 0; k < 3; k++) { const a = k * PI * 2 / 3; K.box(x + Math.cos(a) * .045, .5 + Math.sin(a) * .045, .262, .07, .012, .008, lids[i], [0, 0, a + PI / 2 + .3]); }
    K.box(x, .3, .262, .25, .1, .006, tone(lids[i], -.3));
  }
  K.done();
}

function cableReel(view, p, g) {
  const K = kit(view, p, g);
  // A cable drum on its side 1.05 x .62 x 1.05: two timber flanges, battens between, a hub, a wound coil of
  // black cable with a lemon marker tape, the free end trailing across the ground.
  const wood = K.pick([C.woodPale, '#6a5040']);
  for (const z of [-.27, .27]) K.cyl(0, .5, z, .49, .05, wood, 12, undefined, [PI / 2, 0, 0]);
  for (let i = 0; i < 8; i++) { const a = i * PI / 4; K.box(Math.cos(a) * .4, .5 + Math.sin(a) * .4, z0(i) * .5, .1, .05, .06, tone(wood, -.2), [0, 0, a + PI / 2]); }
  K.cyl(0, .5, 0, .14, .58, C.steelDark, 8, undefined, [PI / 2, 0, 0]);
  K.cyl(0, .5, 0, .4, .48, '#15171c', 12, undefined, [PI / 2, 0, 0]);
  K.cyl(0, .5, 0, .405, .05, C.hazard, 12, undefined, [PI / 2, 0, 0]);
  for (let i = 0; i < 4; i++) K.box(.3 + i * .05, .02, .28, .2, .04, .04, '#15171c', [0, .5 * i - .6, 0]);
  K.done();
  function z0(i) { return i % 2 ? .27 : -.27; }
}

function waterBarrier(view, p, g) {
  const K = kit(view, p, g);
  // A water-filled traffic barrier 1.6 x .5 x .9: a moulded plastic shell in lemon and graphite stripes (three
  // hollow lobes side by side), a filler cap, a drain plug and handle notches; ballast for the road works and
  // the checkpoint.
  const shell = K.pick(['#c9bd22', '#d0c528']);
  K.box(0, .2, 0, 1.6, .4, .5, C.graphite);
  K.box(0, .58, 0, 1.56, .4, .4, shell);
  K.box(0, .82, 0, 1.5, .16, .3, tone(shell, -.1));
  for (let i = 0; i < 7; i++) K.box(-.66 + i * .22, .5, .21, .1, .4, .01, C.black, [0, 0, .7]);
  for (const x of [-.55, 0, .55]) { K.box(x, .5, .25, .3, .1, .02, C.black); K.cyl(x, .9, 0, .05, .03, C.plasticRed, 6); }
  K.box(.7, .22, .26, .05, .05, .02, C.steelMid); // drain plug
  K.box(-.6, .84, .1, .02, .02, .2, C.hazard); // reflector tape
  K.done();
}

function bicycleProp(view, p, g) {
  const K = kit(view, p, g);
  // A bicycle leaning on its kickstand, 1.7 m long: thin tube frame in a bright colour, black tyres, a saddle
  // and bars; some carry a tail lamp.
  const A = assembly(K, 0, 0, 0, .14);
  bicycle(A, K.pick(['#8a2f3a', '#2f6a6a', '#c9bd22', C.plasticWhite, '#3a5a8c']), C.graphite, K.rand() < .5);
  K.done();
}

function scooterProp(view, p, g) {
  const K = kit(view, p, g);
  const A = assembly(K, 0, 0, 0, .1);
  scooter(A, K.pick(['#2f6a6a', '#8a2f3a', '#3a5a8c', C.plasticWhite]), K.pick([C.litGreen, C.litBlue, C.litPink]), true);
  K.done();
}

function scooterHeap(view, p, g) {
  const K = kit(view, p, g);
  // A dump of dockless e-scooters: five tangled in a heap, decks stacked crosswise, handlebars and wheels in the
  // air, underglows left burning (each in its own colour).
  const cols = ['#2f6a6a', '#8a2f3a', '#3a5a8c', C.plasticWhite, '#2f6a6a'], glows = [C.litGreen, C.litBlue, C.litPink, C.litGreen, C.litBlue];
  const poses = [[-.3, -.42, .12, .62, 0], [.35, -.36, PI - .2, -.55, .02], [-.1, .4, PI + .1, .6, 0], [.42, .34, -.15, -.5, .03], [0, 0, .5, .45, 0]];
  poses.forEach(([x, z, yaw, lean, y], i) => {
    const A = assembly(K, x, z, yaw, lean, .1 + y);
    scooter(A, cols[i], glows[i], false);
  });
  K.done();
}

function bikeRack(view, p, g) {
  const K = kit(view, p, g);
  // A steel bike rack 1.6 x 1.6: a row of three inverted-U hoops along the north edge with two bikes parked
  // nose-in and a lock chain through one; the bikes stand along z.
  const hoop = C.steel;
  for (const x of [-.55, 0, .55]) {
    K.cyl(x, .45, -.62, .022, .9, hoop, 6); K.cyl(x, .45, -.32, .022, .9, hoop, 6);
    K.box(x, .9, -.47, .05, .045, .34, hoop);
  }
  K.box(0, .02, -.47, 1.5, .03, .48, C.concreteDark);
  const cols = ['#c9bd22', '#8a2f3a'], A = [assembly(K, -.28, .08, PI / 2, .08), assembly(K, .28, .04, PI / 2 + .08, -.08)];
  A.forEach((a, i) => bicycle(a, cols[i], C.graphite, i));
  K.ring(-.28, .6, -.56, .14, .012, C.black, [0, PI / 2, 0], 10, 4); // the lock chain
  K.done();
}

function foodCart(view, p, g) {
  const K = kit(view, p, g);
  // A street food cart 1.8 x .9 x 1.1 with a steamer and a grill: a teal box body on two big wheels and a tow
  // handle, a steel counter, a glass shield, skewers laid over a glowing coal bed, a steam pot, a red paper
  // lantern (lit) on a post. The steam and skewers are what the break scatters.
  K.box(0, .42, 0, 1.6, .5, .74, '#2f5a5a'); K.box(0, .19, 0, 1.5, .1, .7, C.graphite);
  K.box(0, .72, 0, 1.72, .05, .82, C.steel);
  for (const s of [-1, 1]) { K.cyl(.55, .27, s * .42, .27, .08, C.black, 10, undefined, [PI / 2, 0, 0]); K.cyl(.55, .27, s * .44, .08, .09, C.steelMid, 6, undefined, [PI / 2, 0, 0]); }
  K.box(-.84, .3, 0, .2, .04, .06, C.steelDark, [0, 0, .1]);
  K.box(.55, .5, .372, .5, .28, .01, C.black); K.box(-.4, .45, .372, .7, .22, .01, tone('#2f5a5a', -.2)); // doors
  K.box(0, .96, .38, 1.5, .4, .02, C.glass, [-.2, 0, 0]);
  K.box(-.3, .78, -.05, .9, .06, .5, C.black); K.lit(-.3, .82, -.05, .84, .02, .44, '#ff4a2a', .85); // coals
  for (let i = 0; i < 10; i++) { K.cyl(-.3 - .4 + i * .09, .855, -.05, .008, .56, C.woodPale, 4, undefined, [PI / 2, 0, 0]); for (let k = 0; k < 3; k++) K.box(-.3 - .4 + i * .09, .87, -.24 + k * .18, .05, .04, .05, K.pick([C.cardboardDark, '#8a4a3a', C.paper])); }
  K.cyl(.5, .87, -.05, .2, .3, C.steel, 10, .18); K.cyl(.5, 1.03, -.05, .2, .03, C.steelDark, 10);
  K.cyl(-.78, .95, -.32, .06, .4, C.steelDark, 6, .05);
  K.cyl(.82, .9, .3, .018, .35, C.steelDark, 5); K.lit(.82, 1.06, .3, .12, .14, .12, '#e8322a', 1.3);
  K.box(.1, .78, .3, .5, .02, .3, C.paper, [0, .2, 0]);
  K.done();
}

function parcelLocker(view, p, g) {
  const K = kit(view, p, g);
  // A parcel locker bank 1.5 x .58 x 1.9: a graphite carcase on a plinth, a tall control column in the middle
  // with a lit screen and keypad, and two columns of doors each side in three sizes with colour-coded tags
  // (colour blocks), a few ajar. A slim canopy on top.
  K.box(0, .08, 0, 1.5, .16, .56, C.concreteDark);
  K.box(0, 1.02, -.02, 1.46, 1.72, .5, C.graphite);
  K.box(0, 1.9 - .03, 0, 1.5, .06, .58, C.steelDark);
  const doorCol = [C.plasticBlue, C.plasticGreen, C.plasticYellow, C.plasticRed, C.plasticWhite];
  for (const s of [-1, 1]) for (let col = 0; col < 2; col++) {
    const x = s * (.35 + col * .3);
    [[.5, .3], [.9, .34], [1.25, .3], [1.6, .3]].forEach(([y, h], row) => {
      const ajar = K.rand() < .12;
      K.box(x, y, .245, .27, h - .03, .02, tone(C.panel, ((row + col) % 2 ? .1 : 0)), ajar ? [0, s * .5, 0] : undefined);
      K.box(x - .09, y + h / 2 - .06, .258, .05, .02, .01, doorCol[(row * 2 + col + (s > 0 ? 1 : 0)) % 5]);
      K.box(x + .07, y, .258, .03, .06, .01, C.steel);
    });
  }
  K.box(0, 1.02, .255, .3, 1.7, .03, C.black);
  K.lit(0, 1.5, .27, .24, .3, .012, C.litBlue, 1.1); K.lit(0, 1.5, .278, .12, .12, .012, C.litWhite, 1.3);
  K.box(0, 1.16, .27, .18, .16, .02, C.steel); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) K.box(-.05 + j * .05, 1.2 - i * .05, .285, .03, .03, .01, C.steelDark);
  K.lit(0, 1.0, .275, .16, .04, .012, C.litLemon, 1);
  K.box(0, .9, .26, .2, .4, .02, C.graphite); K.box(0, .82, .275, .12, .06, .01, C.black); // parcel hatch
  K.done();
}

function shopGlass(view, p, g) {
  const K = kit(view, p, g);
  // A glass windbreak 1.6 x .16 x 2.1 for a noodle bar's pavement seats: a big pane in a slim steel frame on two
  // stands, a frosted band with a lit pictogram decal at eye height, a pale reflection streak.
  K.box(0, 1.08, 0, 1.44, 1.94, .035, C.glass);
  K.box(-.42, 1.15, .02, .2, 1.8, .01, C.glassPale, [0, 0, .32]); K.box(.28, 1.15, .02, .08, 1.8, .01, C.glassPale, [0, 0, .32]);
  K.box(0, 1.55, .0, 1.44, .3, .045, '#93a5a6'); // frosted band
  K.box(-.5, 1.55, .03, .3, .16, .01, C.plasticYellow); K.lit(-.5, 1.55, .04, .22, .1, .008, C.litWarm, .9); K.box(.25, 1.55, .03, .12, .12, .01, C.plasticRed);
  for (const s of [-1, 1]) { K.box(s * .76, 1.06, 0, .06, 2.1, .06, C.steelMid); K.box(s * .72, .03, 0, .16, .06, .16, C.steelDark); }
  K.box(0, 2.08, 0, 1.6, .05, .06, C.steelMid); K.box(0, .1, 0, 1.6, .08, .06, C.steelMid);
  K.box(0, 1.98, .02, 1.3, .03, .03, C.steelDark);
  K.done();
}

function infoTerminal(view, p, g) {
  const K = kit(view, p, g);
  // A public info terminal .7 x .5 x 1.6: a steel pylon on a plate, a tilted lit screen with a map pictogram
  // (dark blocks and a lemon route line), a speaker grille, a red help button, a hazard band. The screen cracks.
  K.box(0, .04, 0, .58, .08, .42, C.concreteDark);
  K.box(0, .62, -.02, .3, 1.16, .26, C.steelMid); K.box(0, .62, .108, .26, 1.1, .01, C.steelDark);
  K.box(0, 1.34, 0, .66, .5, .16, C.graphite, [-.25, 0, 0]);
  K.lit(0, 1.35, .095, .58, .42, .012, C.litWhite, .9, [-.25, 0, 0]);
  K.box(-.14, 1.36, .105, .2, .16, .006, C.glassDark, [-.25, 0, 0]); K.box(.1, 1.3, .108, .28, .02, .006, C.litLemon, [-.25, 0, .5]); K.box(.16, 1.4, .105, .16, .12, .006, C.tarp, [-.25, 0, 0]);
  K.box(0, 1.6 - .02, -.02, .34, .03, .16, C.steelDark);
  for (let i = 0; i < 4; i++) K.box(0, .96 + i * .03, .116, .16, .012, .006, C.black);
  K.lit(0, .76, .115, .06, .06, .01, C.litRed, 1.4); K.box(0, .5, .115, .2, .05, .01, C.hazard);
  K.done();
}

function parkingMeter(view, p, g) {
  const K = kit(view, p, g);
  // A parking meter .3 x .3 x 1.3: a base plate, a slim steel pole, a rounded head with a lit lemon display, a
  // coin slot and a solar cap; a lemon band on the pole.
  K.box(0, .02, 0, .26, .04, .26, C.concreteDark);
  K.cyl(0, .62, 0, .035, 1.2, C.steelMid, 6); K.cyl(0, .35, 0, .04, .06, C.hazard, 6);
  K.box(0, 1.14, 0, .2, .3, .14, C.graphite); K.box(0, 1.14, .075, .16, .26, .01, C.steelDark);
  K.lit(0, 1.22, .085, .1, .07, .01, C.litLemon, 1.1); K.box(.0, 1.06, .085, .08, .012, .01, C.black); K.box(0, 1.02, .085, .1, .04, .01, C.steel);
  K.box(0, 1.3 - .025, 0, .24, .04, .18, '#1c2735', [-.12, 0, 0]);
  K.done();
}

// ----- the three trees (solid; health null: drawn by the static batch) -----

// A leaf clump: a squashed icosahedron in a dim green, sparse (a city tree, poorly kept).
function leaves(K, x, y, z, r) { return K.ball(x, y, z, r, K.pick([C.leaf, C.leafDim, '#34482f']), .8, 1, 1, [K.rand() * 3, K.rand() * 6, 0]); }
// A limb from (x, y, z) leaning (rx, rz) up `len`.
function limb(K, x, y, z, len, r, rx, rz, colour = C.trunk) { return K.cyl(x + Math.sin(rz) * len / 2 * -1, y + Math.cos(rx) * Math.cos(rz) * len / 2, z + Math.sin(rx) * len / 2, r, len, colour, 5, r * .55, [rx, 0, rz]); }

function treeUptown(view, p, g) {
  const K = kit(view, p, g);
  // Uptown: a raised planter 2.2 x 2.2 x .6 in pale stone with a steel coping and a cold-white light line round its
  // foot; inside, a lit steel grate round the trunk (slits glowing), then a thin dark trunk and a few dark limbs
  // carrying sparse leaf clumps (3.6 m). Nothing green but the leaves.
  K.box(0, .3, 0, 2.2, .6, 2.2, C.stone); K.box(0, .61, 0, 2.26, .05, 2.26, C.steel);
  for (const s of [-1, 1]) { K.lit(0, .07, s * 1.105, 2.0, .03, .02, C.litWhite, 1.1); K.lit(s * 1.105, .07, 0, .02, .03, 2.0, C.litWhite, 1.1); }
  K.box(0, .58, 0, 2.0, .04, 2.0, C.soil);
  K.box(0, .61, 0, 1.0, .03, 1.0, C.graphite);
  for (let i = -3; i <= 3; i++) { K.lit(i * .13, .63, 0, .035, .012, .84, C.litWhite, 1.3); }
  K.cyl(0, 1.5, 0, .13, 1.7, C.trunk, 7, .1);
  limb(K, 0, 2.2, 0, 1.3, .07, .35, -.4); limb(K, 0, 2.4, 0, 1.2, .06, -.4, .3); limb(K, 0, 2.6, 0, 1.0, .05, .1, .55); limb(K, 0, 2.0, 0, .9, .05, -.5, -.5);
  for (const [x, y, z, r] of [[-.5, 3.0, .3, .32], [.35, 3.2, -.3, .28], [.2, 2.9, .55, .26], [-.3, 3.25, -.4, .24], [.7, 2.8, 0, .22], [-.6, 2.65, -.1, .2]]) leaves(K, x, y, z, r);
  K.done();
}

function treeStacks(view, p, g) {
  const K = kit(view, p, g);
  // The Stacks courtyard: a scraggly tree that grew through cracked paving (a broken concrete ring of slabs
  // heaved up), a bent trunk with an old rope scar, few limbs and thin leaves (3.4 m), a string of dim warm
  // bulbs hung across its lower limbs.
  for (let i = 0; i < 7; i++) { const a = i * PI * 2 / 7 + .3, r = .5 + K.rand() * .2; K.box(Math.cos(a) * r, .13, Math.sin(a) * r, .5 + K.rand() * .2, .16 + K.rand() * .08, .34, tone(C.concreteDark, (K.rand() - .5) * .3), [(K.rand() - .5) * .3, -a, (K.rand() - .5) * .2]); }
  K.cyl(0, .06, 0, .3, .1, C.soil, 8);
  K.cyl(0, .8, 0, .16, 1.5, C.trunk, 6, .11, [0, 0, .12]); K.cyl(.19, 1.9, 0, .1, 1.1, C.trunk, 5, .07, [0, 0, -.28]);
  K.box(.02, .8, .16, .06, .3, .02, C.rustDark);
  limb(K, .2, 2.3, 0, 1.0, .05, .3, .5); limb(K, .15, 2.1, 0, .9, .045, -.35, -.5); limb(K, .25, 2.6, 0, .8, .04, .1, -.2);
  for (const [x, y, z, r] of [[.75, 2.9, .2, .22], [-.2, 2.7, -.5, .2], [.6, 2.45, .6, .18], [.3, 3.15, -.1, .2]]) leaves(K, x, y, z, r);
  // the bulb string: from the lower limb across, warm and dim, sagging
  for (let i = 0; i < 6; i++) K.lit(-.55 + i * .32, 2.35 - Math.sin(i / 5 * PI) * .12, .5 - i * .1, .07, .08, .07, C.litWarm, 1);
  K.box(.3, 2.35, .28, .9, .01, .01, C.black, [0, .3, 0]);
  K.done();
}

function treeMetro(view, p, g) {
  const K = kit(view, p, g);
  // The metro stairs' tree: a square bench 2.6 x 2.6 round it (four slat runs on graphite legs, a warm light line
  // under each seat edge: the lit ledge), a steel grate in the middle, and the tree (3.6 m).
  const wood = '#54606a';
  for (const [x, z, w, d] of [[0, -1.1, 2.6, .4], [0, 1.1, 2.6, .4], [-1.1, 0, .4, 1.8], [1.1, 0, .4, 1.8]]) {
    K.box(x, .4, z, w, .06, d, wood); K.box(x, .2, z, w - .1, .34, d - .18, C.graphite);
    if (d < w) { K.lit(x, .3, z + (z > 0 ? -1 : 1) * (d / 2 - .02) * -1, w - .2, .03, .02, C.litWarm, 1); } else K.lit(x + (x > 0 ? -1 : 1) * (w / 2 - .02) * -1, .3, z, .02, .03, d - .2, C.litWarm, 1);
  }
  K.box(0, .02, 0, 1.6, .04, 1.6, C.concreteDark); K.box(0, .045, 0, 1.2, .03, 1.2, C.graphite);
  for (let i = -3; i <= 3; i++) K.lit(i * .15, .062, 0, .04, .01, 1.0, C.litWhite, 1.1);
  K.cyl(0, 1.55, 0, .14, 1.8, C.trunk, 7, .1);
  limb(K, 0, 2.3, 0, 1.2, .07, -.3, .4); limb(K, 0, 2.5, 0, 1.2, .06, .4, -.3); limb(K, 0, 2.2, 0, 1.0, .05, .05, -.6);
  for (const [x, y, z, r] of [[.45, 3.05, .3, .3], [-.35, 3.25, -.3, .28], [-.5, 2.8, .4, .24], [.3, 3.3, -.5, .22], [-.7, 3.0, 0, .2]]) leaves(K, x, y, z, r);
  K.done();
}

const MODELS = { cityVending: vending, cityTrashBags: trashBags, cityHydrant: hydrant, cityChargePost: chargePost, cityCone: cone,
  cityCrate: crate, cityDeliveryBox: deliveryBox, cityStool: stool, cityPlasticChair: plasticChair, cityMeshBin: meshBin, cityRecycleBin: recycleBin,
  cityCableReel: cableReel, cityWaterBarrier: waterBarrier, cityBicycle: bicycleProp, cityScooter: scooterProp, cityScooterHeap: scooterHeap,
  cityBikeRack: bikeRack, cityFoodCart: foodCart, cityParcelLocker: parcelLocker, cityShopGlass: shopGlass, cityInfoTerminal: infoTerminal,
  cityParkingMeter: parkingMeter, cityTreeUptown: treeUptown, cityTreeStacks: treeStacks, cityTreeMetro: treeMetro };
for (const [type, make] of Object.entries(MODELS)) registerLumenModel(type, make);
export const BREAKABLE_MODELS = Object.freeze(Object.keys(MODELS));
