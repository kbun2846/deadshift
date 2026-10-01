// Lumen stage 5: the districts' set pieces (design 18b, district by district).
// Types here are spread into map-kit.js PROP_TYPES (so this module must not
// import map-kit.js: a cycle); their models register with world/lumen-props.js
// registerLumenModel(type, make) and are built with world/lumen-kit.js (city
// palette, seeded wear) and world/lumen-glow.js (lit parts).
//
// What is here is what the streets still lack after stage 2's cover, stage 4's
// furniture and breakables, and the facades (render/city-facades.js already
// hangs the canopies over every door, the lanterns along the market, the
// laundry lines across the courtyard, the roofs' dishes and the wall cables):
// pieces at street level that make a district read as itself.
//   Boulevard   a road-work pit, cones knocked into a line, median planters, a stop flag
//   Uptown      a dry fountain, sculptural bollards, a valet podium, camera poles,
//               light-strip inlays in the paving, banner poles
//   The Stacks  drying racks, a crate table and its game, cable spans over the
//               alley and the courtyard, an open junction box, dishes on posts, a
//               shrine niche, spilled bags, a rusted scooter frame, a rain drum
//   Night Market  a tarp over a crate table, produce, a fish tank, a meat rail, gas
//               bottles, price boards in tally marks and pictograms, a scale,
//               lantern poles, bulb strings
//   Velvet Row  a knocked-over rope, a doorman's podium, a half-dead neon heart on a
//               stand, bead curtains beside a door, a dropped heel, glitter, a drinks
//               cooler, the karaoke box's lit mat
//   Garage and Charging  tyres, oil drums, a car on stands, an engine block, a creeper
//               board, hazard posts, a fast charger, a cable lying to a car, a tool cart,
//               a two-post lift, a spill kit
//   Flatiron and Metro Plaza  the metro's pictogram map, a ticket machine, a turnstile
//               bank, a comm booth, a tipped queue corral, the prow's lit ledge
//
// Every footprint, height and collision box below is the gameplay truth (the
// placement, tests/lumen-setpieces.test.js): a model stays inside its boxes
// (+0.1 m), except a roof or an arm overhead (from 2.1 m up, inside its
// footprint: over a body's top) and ground dressing (up to 0.2 m). Knee-high
// pieces are `lowTop` (rounds fly over anything above their own top); ankle
// clutter is `walkOver` with no collider (bodies step over it, rounds fly over
// it); the cable spans and bead curtains have no collider either
// (`collisionBoxes: []`, as the graveyard's flat graves): they hang above or
// beside where a body goes. Nothing is a breakable (health null): the
// districts' dressing is the static batch's, merged per cell with the rest.
// No lettering (price boards are tally marks and pictograms) and no team
// colours; anything that glows is a lit part (litBox) in the city's pinks,
// blues, greens, reds, lemon and whites.
import * as THREE from 'three';
import { registerLumenModel } from './lumen-props.js';
import { kit, tone, CITY as C } from './lumen-kit.js';

const PI = Math.PI;

// A type: footprint, its boxes [x, z, w, d, height] in the prop's frame (local x
// runs along world (cos a, -sin a)), and how rounds meet it.
const solid = (w, d, boxes, extra = {}) => ({ w, d, health: null, collisionBoxes: boxes, ...extra });
const low = (w, d, boxes, extra = {}) => solid(w, d, boxes, { lowTop: true, ...extra });
// (Walk-over: no collider. A collider, even a walkOver one, stops every round
// on a flat map, where rounds have no flight path: weapons/rifle.js roundMeets.
// The model keeps to its footprint w x d and under 0.3 m.)
const flat = (w, d, extra = {}) => solid(w, d, [], { walkOver: true, ...extra });
const hung = (w, d, extra = {}) => solid(w, d, [], extra); // (overhead or beside: no collider)

export const LUMEN_SETPIECE_TYPES = Object.freeze({
  // --- Boulevard ---
  cityRoadPit: low(2.6, 1.8, [[0, -.1, 2.5, 1.4, .45], [0, .8, 2.4, .14, .95]]), // a road-work pit and its folding barrier
  cityConeLine: flat(4.8, .7), // cones knocked into a line where a lane was being closed
  cityMedianPlanter: low(3.2, .9, [[0, 0, 3.1, .8, .55]]),
  cityStopFlag: solid(.7, .7, [[0, 0, .2, .2, 2.85]]), // a bus stop's flag: pole and pictogram disc
  // --- Uptown ---
  cityDryFountain: low(4.4, 4.4, [[0, 0, 4.2, 4.2, .55], [0, 0, .6, .6, 1.6]]),
  citySculptBollard: low(.5, .5, [[0, 0, .36, .36, 1]]),
  cityValetPodium: solid(1, .8, [[0, 0, .8, .6, 1.15]]),
  cityCameraPole: solid(.9, .9, [[0, 0, .2, .2, 3.4]]), // a security camera on an arm
  cityPaverInlay: flat(3.4, 2.2), // light strips let into the paving
  cityBannerPole: solid(1.6, .5, [[0, 0, .24, .24, 4]]),
  // --- The Stacks ---
  cityDryingRack: solid(1.8, .8, [[0, 0, 1.7, .6, 1.55]]),
  cityCrateTable: low(1.1, 1.1, [[0, 0, .95, .95, .78]]),
  cityCableSpanShort: hung(3.8, .6), // over Back Alley
  cityCableSpanLong: hung(12.4, .6), // over the courtyard and West Street
  cityJunctionBox: solid(.9, .9, [[0, 0, .85, .85, 1.25]]),
  cityDishPost: solid(1.2, 1.2, [[0, 0, .22, .22, 2.9]]),
  cityShrineNiche: solid(1.4, .8, [[0, 0, 1.2, .6, 1.3]]),
  cityBagSpill: flat(1.9, 1.2),
  cityScooterFrame: low(1.5, .7, [[0, 0, 1.4, .6, .5]]),
  cityWaterDrum: low(1, 1, [[0, 0, .9, .8, 1]]),
  // --- Night Market ---
  cityTarpCanopy: solid(3.6, 2.6, [[-1.6, -1.1, .12, .12, 2.8], [1.6, -1.1, .12, .12, 2.8], [-1.6, 1.1, .12, .12, 2.8], [1.6, 1.1, .12, .12, 2.8]]),
  cityProduceStack: low(1.3, .8, [[0, 0, 1.2, .7, .75]]),
  cityFishTank: solid(1.8, .8, [[0, 0, 1.7, .7, 1.3]]),
  cityMeatRail: solid(2.4, .8, [[0, 0, 2.3, .6, 2.05]]),
  cityGasBottles: low(1.1, .7, [[0, 0, 1, .6, .7]]),
  cityPriceBoard: solid(1.3, .4, [[0, 0, 1.2, .3, 1.65]]),
  cityMarketScale: low(.8, .6, [[0, 0, .7, .4, 1.1]]),
  cityLanternPole: solid(1.6, .5, [[0, 0, .2, .2, 2.9]]),
  cityBulbString: solid(5.2, .4, [[-2.4, 0, .14, .14, 3.2], [2.4, 0, .14, .14, 3.2]]),
  // --- Velvet Row ---
  cityRopeStanchions: flat(2.9, .9),
  cityDoormanPodium: solid(.9, .7, [[0, 0, .8, .6, 1.15]]),
  cityHeartStand: solid(1.3, .5, [[0, 0, 1.1, .3, 1.6]]), // the club's neon heart, half dead, on a floor stand
  cityBeadCurtain: hung(1.2, .3),
  cityHighHeel: flat(.4, .4),
  cityGlitterSpill: flat(1.6, 1.1),
  cityDrinksCooler: solid(1.6, .9, [[0, 0, 1.5, .8, 1.95]]),
  cityKaraokeMat: flat(2.2, 1.1),
  // --- Garage and Charging ---
  cityTyreStack: solid(1.5, 1.1, [[0, 0, 1.45, 1.05, .98]]),
  cityOilDrums: solid(1.5, 1.4, [[0, .1, 1.4, 1.2, .95]]),
  cityCarOnStands: solid(4, 2, [[0, 0, 3.7, 1.75, 1.35]]),
  cityEngineBlock: low(1.5, 1.1, [[0, 0, 1.4, 1, .8]]),
  cityCreeperBoard: flat(1.3, .7),
  cityHazardPost: low(.4, .4, [[0, 0, .24, .24, 1]]),
  cityFastCharger: solid(1, .7, [[0, 0, .8, .55, 1.75]]),
  cityPlugCable: flat(1, .4),
  cityToolCart: solid(1.2, 1, [[0, .05, 1.1, .9, 1.05]]),
  cityCarLift: solid(4.4, 1.6, [[-1.95, 0, .34, .6, 2.15], [1.95, 0, .34, .6, 2.15]]),
  citySpillKit: low(1, .7, [[0, 0, .9, .6, .7]]),
  // --- Flatiron and Metro Plaza ---
  cityMetroMap: solid(2.2, .4, [[0, 0, 2, .3, 2.3]]),
  cityTicketMachine: solid(1, .8, [[0, 0, .85, .6, 1.55]]),
  cityTurnstileBank: solid(3.2, 1, [[0, 0, 3, .8, 1.1]]),
  cityCommBooth: solid(1.3, 1.3, [[0, 0, 1.1, 1, 2.25]]),
  cityQueueCorral: flat(3.2, 1.6),
  cityLitLedge: low(4.4, .8, [[0, 0, 4.2, .7, .5]]),
});

// ---------------------------------------------------------------------------
// Shared bits. Local frame: from y 0 up, the front (the side to use) is +z.

// Stripes of hazard lemon and graphite along a board (a barrier, a bollard's band).
function hazardBand(K, x, y, z, w, h, n, face = 1, depth = .012) {
  const step = w / n;
  for (let i = 0; i < n; i++) K.box(x - w / 2 + step * (i + .5), y, z + face * depth / 2, step * .62, h, depth, i % 2 ? C.hazard : C.hazardDark, [0, 0, .6]);
}

// A run of thin segments on a sag between two ends (cables, ropes, a bulb string):
// y follows a shallow parabola, each piece a box turned to the slope.
function sagLine(K, x0, x1, y, z, sag, thick, colour, segments = 8) {
  const at = t => [x0 + (x1 - x0) * t, y - sag * (1 - (2 * t - 1) ** 2)];
  for (let i = 0; i < segments; i++) {
    const [ax, ay] = at(i / segments), [bx, by] = at((i + 1) / segments);
    K.box((ax + bx) / 2, (ay + by) / 2, z, Math.hypot(bx - ax, by - ay) + .02, thick, thick, colour, [0, 0, Math.atan2(by - ay, bx - ax)]);
  }
  return at;
}

// A heart in tubes (a neon outline), facing +z, centred (cx, cy), `s` metres from the tip to the
// top of the lobes; `dead` says which tubes are dark. The lit ones are lit parts.
const HEART = [[0, -1], [-.95, -.05], [-.95, .35], [-.65, .75], [-.3, .8], [0, .45], [.3, .8], [.65, .75], [.95, .35], [.95, -.05]];
function heartTubes(K, cx, cy, z, s, colour, strength, dead = () => false, thick = .045) {
  for (let i = 0; i < HEART.length; i++) {
    const a = HEART[i], b = HEART[(i + 1) % HEART.length];
    const ax = cx + a[0] * s * .5, ay = cy + a[1] * s * .5, bx = cx + b[0] * s * .5, by = cy + b[1] * s * .5;
    const len = Math.hypot(bx - ax, by - ay) + .03, ang = Math.atan2(by - ay, bx - ax);
    if (dead(i, a, b)) K.box((ax + bx) / 2, (ay + by) / 2, z, len, thick, thick, C.glassDark, [0, 0, ang]);
    else K.lit((ax + bx) / 2, (ay + by) / 2, z, len, thick, thick, colour, strength, [0, 0, ang]);
  }
}

// Dead soil with butts and a few brittle stems (a planter nobody watered).
function soilBed(K, x0, x1, z0, z1, y, stems = 6, tall = .3) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  K.box(cx, y - .02, cz, w, .05, d, C.soil);
  for (let i = 0; i < 4; i++) K.box(cx + (K.rand() - .5) * w * .8, y + .008, cz + (K.rand() - .5) * d * .7, .2 + K.rand() * .3, .015, .14 + K.rand() * .2, K.pick([C.dead, C.grime, '#3b342b']), [0, K.rand() * PI, 0]);
  for (let i = 0; i < stems; i++) {
    const h = tall * (.4 + K.rand() * .6);
    K.cyl(cx + (K.rand() - .5) * w * .85, y + h / 2, cz + (K.rand() - .5) * d * .7, .01, h, C.dead, 4, .005, [(K.rand() - .5) * .6, 0, (K.rand() - .5) * .6]);
  }
  for (let i = 0; i < 6; i++) K.box(cx + (K.rand() - .5) * w * .9, y + .012, cz + (K.rand() - .5) * d * .85, .04, .014, .012, i % 2 ? C.paper : '#8a8474', [0, K.rand() * PI, 0]);
}

// A steel post with a base plate: poles, flags, lantern posts.
function post(K, x, z, h, r = .045, colour = C.steelMid) {
  K.cyl(x, .03, z, r * 2.6, .06, C.concreteDark, 6);
  return K.cyl(x, h / 2, z, r, h, colour, 6);
}

// A row of laundry pieces on a rail: tees, a towel, trousers, socks (colour blocks, no prints).
const CLOTH = ['#8a2f3a', '#3a5a8c', '#b6b9bf', '#5a5e67', '#7a634a', '#3a6a52', '#a8a08c', '#2e4e7a'];

// ---------------------------------------------------------------------------
// Boulevard

function roadPit(view, p, g) {
  const K = kit(view, p, g);
  // A pit cut in the road 2.5 x 1.4: broken asphalt lips round a black hole (a lid of black just under the
  // rim reads as depth from above), a ladder's rails, a steel plate leant against the spoil heap, a folding
  // barrier (lemon and graphite boards on A-frame legs, a lamp on the corner) and a hard hat dropped by the
  // rim. The barrier stands on the +z side, the pit's boxes cover the hole and the heap.
  const cz = -.1;
  for (const [x, z, w, d] of [[0, cz - .62, 2.5, .2], [0, cz + .62, 2.5, .2], [-1.15, cz, .2, 1.08], [1.15, cz, .2, 1.08]])
    K.box(x, .1, z, w, .2, d, K.wear(C.asphalt, .4));
  K.box(0, .16, cz, 2.06, .02, 1.06, C.black);
  K.box(-.15, .2, cz - .2, .55, .02, .3, C.grime); // a slick of muck
  for (const s of [-1, 1]) K.box(.5 + s * .16, .31, cz + .1, .04, .3, .03, C.steelMid, [.25, 0, 0]);
  for (let i = 0; i < 3; i++) K.box(.5, .24 + i * .07, cz + .05 + i * .03, .32, .025, .03, C.steelMid);
  for (let i = 0; i < 5; i++) K.ball(.75 + K.rand() * .5, .15, cz + (K.rand() - .5) * .9, .15 + K.rand() * .08, '#3a322a', .7);
  K.box(-.7, .3, cz - .5, .9, .05, .5, C.steelDark, [.55, 0, 0]); // a road plate leant against the lip
  for (const s of [-1, 1]) K.box(s * 1.0, .47, .8, .05, .94, .1, C.steelDark, [0, 0, s * .12]);
  K.box(0, .74, .8, 2.36, .22, .05, C.hazardDark); K.box(0, .43, .8, 2.36, .22, .05, C.hazardDark);
  hazardBand(K, 0, .74, .825, 2.3, .2, 10); hazardBand(K, 0, .43, .825, 2.3, .2, 10);
  K.lit(-1.05, .99, .8, .09, .07, .09, C.litLemon, 1.3);
  K.ball(1.05, .12, .55, .13, C.hazard, .75); K.box(1.05, .015, .68, .2, .02, .12, tone(C.hazard, -.3)); // the hard hat and its brim
  K.done();
}

function coneLine(view, p, g) {
  const K = kit(view, p, g);
  // Six cones in a line 4.6 m long, knocked over as a lane was being closed: lying on their sides every
  // way (lemon, two white bands), one still leaning on its foot; a strand of hazard tape trailing between
  // them. Under 0.3 m all of it: walked over.
  const body = new THREE.ConeGeometry(.13, .46, 7);
  for (let i = 0; i < 6; i++) {
    const x = -2.1 + i * .84 + (K.rand() - .5) * .2, z = (K.rand() - .5) * .3, yaw = K.rand() * PI * 2;
    if (i === 4) {
      K.box(x, .015, z, .34, .03, .34, C.black, [0, yaw, 0]);
      K.mesh(body, '#d8cc22', x, .215, z, [0, yaw, 1.15]);
    } else {
      K.mesh(body, '#d8cc22', x, .13, z, [0, yaw, PI / 2]);
      K.box(x + Math.cos(yaw) * .06, .028, z - Math.sin(yaw) * .06, .34, .03, .34, C.black, [0, yaw + 1.2, 0]);
      K.mesh(new THREE.CylinderGeometry(.085, .1, .05, 7), C.white, x - Math.cos(yaw) * .02, .13, z + Math.sin(yaw) * .02, [0, yaw, PI / 2]);
    }
  }
  for (let i = 0; i < 5; i++) K.box(-1.7 + i * .84 + (K.rand() - .5) * .1, .012, .05 + Math.sin(i) * .12, .8, .012, .045, i % 2 ? C.hazard : C.hazardDark, [0, Math.sin(i * 2) * .5, 0]);
  K.done();
}

function medianPlanter(view, p, g) {
  const K = kit(view, p, g);
  // A long trough for the median, 3.1 x .8 x .55: board-formed concrete with a steel lip, drain slots low
  // on the side, lemon reflector caps at each end (the traffic's side), dead soil, brittle stems, butts and
  // a crushed cup.
  K.box(0, .28, 0, 3.1, .54, .78, C.concrete); K.box(0, .5, 0, 3.1, .08, .78, C.concretePale);
  for (const s of [-1, 1]) K.box(0, .5, s * .395, 3.14, .06, .04, C.steelDark);
  for (let i = -5; i <= 5; i++) for (const s of [-1, 1]) K.box(i * .28, .13, s * .392, .14, .05, .01, C.black);
  for (const s of [-1, 1]) { K.box(s * 1.5, .42, .0, .12, .2, .74, C.concreteDark); K.box(s * 1.565, .42, 0, .012, .14, .3, C.hazard); K.lit(s * 1.566, .42, 0, .01, .06, .1, C.litLemon, .8); }
  soilBed(K, -1.4, 1.4, -.33, .33, .54, 10, .12);
  K.box(.6, .57, .1, .1, .06, .1, K.pick([C.plasticBlue, C.plasticRed, C.plasticWhite]), [.3, K.rand() * PI, .2]);
  K.box(0, .04, .0, 3.16, .08, .82, C.concreteDark);
  K.done();
}

function stopFlag(view, p, g) {
  const K = kit(view, p, g);
  // A bus stop's flag: a pole 2.85 m with a round lemon-and-graphite disc (a bus in blocks: body, window
  // row, wheels), a lower plate of route stripes. The disc reaches out past the pole, over a body's top
  // (from 2.1 m). Pictogram only, and a blank timetable taped on.
  post(K, 0, 0, 2.85, .035, C.steelMid);
  K.cyl(0, 2.45, .04, .3, .03, C.hazard, 12, undefined, [PI / 2, 0, 0]);
  K.cyl(0, 2.45, .028, .33, .03, C.graphite, 12, undefined, [PI / 2, 0, 0]);
  K.box(0, 2.43, .062, .34, .15, .01, C.black); K.box(0, 2.47, .07, .28, .05, .01, C.glassPale);
  for (const s of [-1, 1]) K.cyl(s * .1, 2.34, .07, .035, .012, C.hazardDark, 6, undefined, [PI / 2, 0, 0]);
  K.box(0, 1.9, .035, .3, .22, .015, C.panel);
  [[C.litPink, .07], [C.litBlue, 0], [C.litLemon, -.07]].forEach(([c, y]) => K.lit(0, 1.9 + y, .048, .22, .03, .01, c, .9));
  K.box(0, 1.5, 0, .06, .05, .06, C.steelDark); K.box(.04, 1.1, .0, .012, .6, .07, C.paper);
  K.done();
}

// ---------------------------------------------------------------------------
// Uptown

function dryFountain(view, p, g) {
  const K = kit(view, p, g);
  // The plaza's dry fountain: an eight-sided stone basin 4.2 m across (a rim .55 high, the floor inside a
  // step down), a film of rainwater lying on the floor, coins on the bottom, a stepped pedestal and a spire
  // whose tip is lit; the basin's inner wall is lit low round the water. Nothing runs.
  K.cyl(0, .26, 0, 2.1, .52, C.stone, 8);
  K.cyl(0, .53, 0, 2.1, .05, C.concretePale, 8);
  K.cyl(0, .52, 0, 1.78, .04, C.concreteDark, 8, 1.78);
  K.cyl(0, .31, 0, 1.82, .02, C.graphite, 8);
  K.cyl(0, .325, 0, 1.68, .012, '#3a546d', 8); // the film of rainwater
  for (let i = 0; i < 8; i++) { const a = i * PI / 4 + PI / 8; K.lit(Math.sin(a) * 1.8, .42, Math.cos(a) * 1.8, .5, .03, .03, C.litWhite, .55, [0, a, 0]); }
  for (let i = 0; i < 18; i++) { const a = K.rand() * PI * 2, r = 1.05 + K.rand() * .65; K.box(Math.sin(a) * r, .335, Math.cos(a) * r, .05, .012, .05, K.pick(['#7c7654', '#6a6a70', '#8c8460']), [0, K.rand() * PI, 0]); }
  K.cyl(0, .68, 0, .38, .34, C.stone, 8, .3);
  K.cyl(0, .92, 0, .3, .14, C.concretePale, 8);
  K.cyl(0, 1.2, 0, .22, .6, C.steelMid, 6, .09);
  K.cyl(0, 1.56, 0, .09, .12, C.steel, 6, .03);
  K.lit(0, 1.6, 0, .07, .07, .07, C.litWhite, 1.4);
  K.done();
}

function sculptBollard(view, p, g) {
  const K = kit(view, p, g);
  // A sculptural bollard 1 m: three prisms stacked and twisted a little each (stone, steel, pale steel),
  // a lit slit down one face.
  K.box(0, .18, 0, .34, .36, .34, C.stone);
  K.box(0, .55, 0, .28, .38, .28, C.steelMid, [0, .45, 0]);
  K.box(0, .88, 0, .22, .24, .22, C.steel, [0, .9, 0]);
  K.lit(.075, .55, .15, .03, .3, .03, C.litWhite, 1.1, [0, .45, 0]);
  K.box(0, .995, 0, .16, .01, .16, C.concretePale, [0, .9, 0]);
  K.done();
}

function valetPodium(view, p, g) {
  const K = kit(view, p, g);
  // A valet's podium .8 x .6 x 1.15: a black lacquer stand, a slanted desk on top with a ticket pad and
  // a bowl of fob keys, a key board on the front with hooks and the hung keys (colour blocks), a warm lamp.
  K.box(0, .5, 0, .8, 1, .6, C.black); K.box(0, .02, 0, .84, .04, .64, C.graphite);
  K.box(0, 1.03, -.02, .84, .06, .62, C.panel, [.12, 0, 0]);
  K.box(-.15, 1.09, -.02, .3, .01, .22, C.paper, [.12, 0, .05]);
  K.cyl(.22, 1.09, -.05, .09, .05, C.steelDark, 8);
  K.box(0, .62, .305, .6, .5, .02, C.graphite);
  for (let i = 0; i < 8; i++) { const x = -.25 + (i % 4) * .17, y = .78 - Math.floor(i / 4) * .2; K.box(x, y + .03, .32, .02, .03, .02, C.steelDark); K.box(x, y - .04, .325, .045, .09, .012, K.pick(['#8a2f3a', '#3a5a8c', C.plasticWhite, C.steelMid, C.hazard])); }
  K.lit(.32, 1.12, .12, .05, .05, .05, C.litWarm, 1.3);
  K.done();
}

function cameraPole(view, p, g) {
  const K = kit(view, p, g);
  // A security camera on a pole 3.4 m: a graphite pole with a service plate, an arm reaching out at the
  // top, the housing under a hood with a dark lens, a conduit run and a small red light on it (a lit part;
  // never a team colour). The housing sits over a body's top (from 3 m).
  post(K, 0, 0, 3.4, .06, C.graphite);
  K.box(0, .5, .062, .16, .3, .02, C.steelDark); K.box(0, .5, .075, .04, .06, .01, C.hazard);
  K.box(.18, 3.3, 0, .4, .07, .07, C.graphite);
  K.box(.36, 3.2, 0, .3, .13, .14, C.panel); K.box(.36, 3.28, 0, .34, .03, .18, C.steelDark);
  K.box(.52, 3.2, 0, .04, .09, .09, C.black);
  K.lit(.36, 3.14, .075, .04, .04, .02, C.litRed, 1.8);
  K.cyl(-.06, 1.7, -.02, .018, 3.2, C.black, 4);
  K.done();
}

function paverInlay(view, p, g) {
  const K = kit(view, p, g);
  // Light strips let into Uptown's clean paving 3.2 x 2: five long strips, cold white, dim, with a short
  // blue cross strip and dark stone borders either side. Flat: walked over.
  for (const s of [-1, 1]) K.box(0, .006, s * 1.0, 3.2, .012, .08, C.graphite);
  for (let i = -2; i <= 2; i++) K.lit(0, .014, i * .3, 3.0 - Math.abs(i) * .5, .018, .035, C.litWhite, .6);
  for (const s of [-1, 1]) K.lit(s * 1.45, .014, 0, .035, .018, 1.2, C.litBlue, .8);
  K.lit(0, .016, 0, .07, .02, .07, C.litWhite, 1.4);
  K.done();
}

function bannerPole(view, p, g) {
  const K = kit(view, p, g);
  // A banner pole 4 m: a post, two long banners hung from a cross arm (deep blue and pale grey, a plain
  // pictogram each: a circle, bars), a lit finial. Banners hang from 3.6 m to 2.3 m: over a body's top.
  post(K, 0, 0, 4, .05, C.graphite);
  K.box(0, 3.75, 0, 1.4, .05, .05, C.steelDark);
  for (const [x, col, mark] of [[-.4, '#233a78', C.litWhite], [.4, '#8f96a0', C.graphite]]) {
    K.box(x, 2.95, 0, .5, 1.3, .015, col);
    K.box(x, 3.62, 0, .55, .035, .03, C.steelDark);
    K.cyl(x, 3.2, .012, .1, .01, mark === C.litWhite ? C.white : mark, 8, undefined, [PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) K.box(x, 2.85 - i * .13, .012, .32 - i * .06, .04, .01, mark === C.litWhite ? C.white : mark);
  }
  K.lit(0, 4.02, 0, .08, .08, .08, C.litWhite, 1.3);
  K.done();
}

// ---------------------------------------------------------------------------
// The Stacks

function dryingRack(view, p, g) {
  const K = kit(view, p, g);
  // A drying rack 1.7 x .5 x 1.5: two steel A-frame ends with cross feet, two rails, and the wash hung on
  // it: tees, trousers, a towel, a row of socks (colour blocks, none printed), still damp-dark at the hem.
  for (const s of [-1, 1]) {
    K.box(s * .82, .75, 0, .04, 1.5, .04, C.steelMid); K.box(s * .82, .04, 0, .05, .04, .56, C.steelDark);
    for (const z of [-.22, .22]) K.box(s * .82, .55, z, .03, 1.1, .03, C.steelMid, [z > 0 ? .2 : -.2, 0, 0]);
  }
  K.box(0, 1.48, 0, 1.66, .03, .03, C.steelMid); K.box(0, 1.08, 0, 1.66, .03, .03, C.steelMid);
  for (let i = 0; i < 4; i++) { const x = -.6 + i * .4, c = K.pick(CLOTH); K.box(x, 1.28, 0, .34, .4, .02, c); K.box(x, 1.09, 0, .34, .06, .02, tone(c, -.3)); K.box(x - .19, 1.4, 0, .1, .14, .02, c, [0, 0, .5]); K.box(x + .19, 1.4, 0, .1, .14, .02, c, [0, 0, -.5]); }
  K.box(-.3, .92, .0, .6, .32, .02, K.pick(CLOTH)); K.box(.45, .88, 0, .18, .4, .02, C.steelDark); K.box(.65, .88, 0, .18, .4, .02, C.steelDark);
  for (let i = 0; i < 5; i++) K.box(-.65 + i * .11, 1.05, .08, .06, .11, .015, K.pick(CLOTH));
  K.done();
}

function crateTable(view, p, g) {
  const K = kit(view, p, g);
  // A table of an upturned crate with a plank top .9 x .9 x .75: a half-played game on it (a paper board
  // ruled in lines, red and pale stones in two camps, a captured few by the edge, a cup and a bottle).
  const crate = K.pick([C.plasticBlue, C.plasticRed, '#4a4e56']);
  K.box(0, .3, 0, .78, .56, .78, crate);
  for (const s of [-1, 1]) for (const a of [0, PI / 2]) K.box(a ? s * .391 : 0, .36, a ? 0 : s * .391, a ? .01 : .4, .1, a ? .4 : .01, tone(crate, -.4));
  K.box(0, .585, 0, .9, .04, .9, C.woodPale, [0, .08, 0]);
  K.box(0, .61, 0, .64, .012, .64, C.paper, [0, .08, 0]);
  for (let i = -2; i <= 2; i++) { K.box(i * .13, .617, 0, .006, .006, .6, C.graphite, [0, .08, 0]); K.box(0, .617, i * .13, .6, .006, .006, C.graphite, [0, .08, 0]); }
  for (let i = 0; i < 9; i++) K.cyl(-.24 + (i % 3) * .13 + K.rand() * .02, .625, -.26 + Math.floor(i / 3) * .12, .034, .018, i % 2 ? '#8a2f3a' : C.plasticWhite, 8);
  for (let i = 0; i < 6; i++) K.cyl(.05 + (i % 3) * .13, .625, .1 + Math.floor(i / 3) * .12, .034, .018, i % 3 ? C.plasticWhite : '#8a2f3a', 8);
  for (let i = 0; i < 3; i++) K.cyl(.34, .62, -.3 + i * .05, .03, .012, '#8a2f3a', 8);
  K.cyl(-.36, .655, .32, .045, .08, C.plasticWhite, 8, .038);
  K.cyl(.36, .68, .36, .028, .13, C.glassPale, 6);
  K.done();
}

// A cable bundle sagging between two wings, high over a way: three cables of different weights riding
// a sagging line with clamps and a hanging drop, ends buried in the walls (the piece is a little longer
// than the gap). No collider: it is all above 4.5 m.
function cableSpan(K, length, salt) {
  const hw = length / 2 - .1, cables = [[C.black, .05, 0, 0], [C.graphite, .035, .06, .04], ['#3b3f47', .03, -.05, .08]];
  const sagBase = Math.min(.9, length * .07);
  for (const [colour, thick, dz, extra] of cables) sagLine(K, -hw, hw, 5.35 - extra, dz, sagBase + extra, thick, colour, Math.max(6, Math.round(length / 1.2)));
  const at = t => 5.35 - sagBase * (1 - (2 * t - 1) ** 2);
  for (let i = 1; i < Math.round(length / 2.2); i++) {
    const t = i / Math.round(length / 2.2), x = -hw + (hw * 2) * t, y = at(t);
    K.box(x, y, .02, .08, .16, .14, C.steelDark);
    if ((i + salt) % 2) K.box(x + .02, y - .3, .0, .025, .55, .025, C.black, [0, 0, .05]);
  }
  // a tag or two: taped colour blocks, no marks
  K.box(-hw * .35, at(.32) - .14, 0, .1, .16, .015, K.pick([C.litPink, C.hazard, C.plasticBlue]));
  K.box(hw * .3, at(.66) - .14, 0, .1, .16, .015, K.pick([C.plasticRed, C.paper, C.hazard]));
}
function cableSpanShort(view, p, g) { const K = kit(view, p, g); cableSpan(K, 3.8, 0); K.done(); }
function cableSpanLong(view, p, g) { const K = kit(view, p, g); cableSpan(K, 12.4, 1); K.done(); }

function junctionBox(view, p, g) {
  const K = kit(view, p, g);
  // A street junction cabinet with its door hanging open: .6 x .4 x 1.2 on a plinth, the breaker rows
  // inside (small colour blocks), wires pulled out and hanging, the door swung square to the front, and
  // sparks (a few white and lemon lit flecks where a wire touches). Static: the crackle is a sound.
  const paint = K.pick(['#5a6058', '#4a5560', '#5c5f66']);
  K.box(0, .06, -.15, .7, .12, .5, C.concreteDark);
  K.box(0, .68, -.2, .62, 1.16, .4, paint); K.box(0, 1.27, -.2, .68, .05, .46, tone(paint, .15));
  K.box(0, .68, -.005, .5, 1.04, .02, C.black);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) K.box(-.18 + c * .12, .35 + r * .22, .02, .08, .1, .02, r % 2 ? C.graphite : C.steelDark);
  K.box(.11, .5, .03, .05, .03, .015, C.hazard); K.box(-.1, .95, .03, .05, .03, .015, C.plasticRed);
  K.box(.33, .67, .21, .03, 1.12, .42, tone(paint, -.1)); K.box(.33, 1.18, .42, .02, .1, .04, C.steelDark);
  for (let i = 0; i < 4; i++) K.box(.29, .42 + i * .1, .28, .01, .03, .2, C.black);
  for (let i = 0; i < 3; i++) K.box(-.08 + i * .1, .9 - i * .28, .06 + i * .07, .012, .3, .012, C.black, [.35 + i * .2, 0, (i - 1) * .3]);
  K.lit(-.02, .55, .18, .04, .04, .04, C.litWhite, 2); K.lit(.06, .5, .24, .03, .03, .03, C.litLemon, 2); K.lit(-.09, .6, .12, .025, .025, .025, C.litWhite, 1.6);
  K.box(0, .16, .13, .4, .18, .01, C.grime);
  K.done();
}

function dishPost(view, p, g) {
  const K = kit(view, p, g);
  // A satellite dish on a short mast in the courtyard's corner (the roofs' dishes are the facades'; this
  // one is at eye height for the street): a slim pole with a bracket, a main dish (a shallow cone
  // tilted up and out, rust at the rim) and a smaller one below, LNB arms and a cable run.
  post(K, 0, 0, 2.9, .04, C.steelDark);
  K.box(0, 2.45, 0, .05, .3, .05, C.steelMid);
  K.mesh(new THREE.ConeGeometry(.44, .2, 10, 1, true), C.white, .1, 2.62, .15, [PI / 2 - .85, 0, 0]);
  K.mesh(new THREE.ConeGeometry(.46, .03, 10), C.rustDark, .1, 2.58, .09, [PI / 2 - .85, 0, 0]);
  K.cyl(.1, 2.78, .33, .012, .4, C.steelDark, 4, undefined, [PI / 2 - .85, 0, 0]);
  K.box(.1, 2.9, .48, .05, .05, .07, C.black);
  K.mesh(new THREE.ConeGeometry(.3, .14, 8, 1, true), C.paper, -.05, 2.3, -.08, [PI / 2 - .5, .4, 0]);
  K.cyl(-.03, 1.4, -.05, .012, 2.7, C.black, 4);
  K.done();
}

function shrineNiche(view, p, g) {
  const K = kit(view, p, g);
  // A courtyard shrine 1.2 x .5 x 1.3: a stepped stone plinth, a niche under a small tiled roof (dark
  // inside, a lit-warm back), four candles burning low, joss sticks in a bowl with red tips, offerings
  // (oranges, a cup, a tin can of something), paper strips pinned at the sides. Small, warm, lit.
  K.box(0, .18, 0, 1.2, .36, .6, C.concrete); K.box(0, .38, .04, 1.1, .05, .5, C.concretePale);
  for (const s of [-1, 1]) K.box(s * .5, .77, -.06, .16, .74, .4, C.stone);
  K.box(0, .77, -.24, 1.0, .74, .06, C.stone);
  K.box(0, .77, -.19, .82, .66, .03, C.black); K.lit(0, .78, -.16, .74, .5, .012, C.litWarm, .3);
  K.box(0, 1.2, -.05, 1.2, .1, .5, C.rust);
  K.box(0, 1.28, -.05, 1.0, .07, .3, C.rustDark, [0, 0, 0]);
  K.box(0, 1.24, .2, 1.24, .05, .1, C.rust, [.3, 0, 0]);
  for (const x of [-.36, -.18, .28, .44]) { K.cyl(x, .48, .02 + (x > 0 ? .06 : -.05), .022, .1 + K.rand() * .05, C.paper, 6); K.lit(x, .56 + K.rand() * .02, .02 + (x > 0 ? .06 : -.05), .025, .04, .025, C.litWarm, 2); }
  K.cyl(.05, .45, .08, .09, .06, C.steelDark, 8, .07);
  for (let i = -1; i <= 1; i++) { K.cyl(.05 + i * .035, .56, .08, .004, .18, C.plasticRed, 4, undefined, [0, 0, i * .12]); K.lit(.05 + i * .035 + i * .012, .655, .08, .012, .012, .012, C.litRed, 2); }
  K.ball(-.08, .43, .17, .045, '#b84a2a'); K.ball(-.02, .425, .2, .04, '#b84a2a'); K.cyl(.22, .43, .18, .028, .06, C.steel, 8);
  for (const s of [-1, 1]) K.box(s * .64, .75, .09, .012, .4, .1, s > 0 ? C.litPink : C.paper);
  K.done();
}

function bagSpill(view, p, g) {
  const K = kit(view, p, g);
  // Bin bags split and spilled 1.8 x 1.1 (ankle high, walked over): three slumped bags (black, navy,
  // grey-green), one torn with its scraps fanned out (flattened boxes, cans on their sides, cups,
  // paper), and a flat cardboard sheet under it all.
  K.box(-.1, .012, 0, 1.2, .02, .8, C.cardboardDark, [0, .2, 0]);
  for (const [x, z, r, col] of [[-.5, -.1, .27, '#1d2026'], [.05, -.25, .24, '#2f3a4a'], [-.1, .2, .22, '#33403a']]) K.ball(x, r * .55, z, r, col, .6, 1.1, 1);
  for (let i = 0; i < 10; i++) K.box(.25 + K.rand() * .6, .02, -.1 + (K.rand() - .5) * .8, .1 + K.rand() * .18, .025, .08 + K.rand() * .1, K.pick([C.paper, C.plasticWhite, C.cardboard, C.plasticGreen]), [0, K.rand() * PI, 0]);
  for (let i = 0; i < 6; i++) K.cyl(.1 + K.rand() * .75, .035, -.4 + K.rand() * .8, .03, .1, K.pick([C.plasticRed, C.steel, C.plasticBlue]), 6, undefined, [0, K.rand() * PI, PI / 2]);
  K.cyl(.7, .05, .3, .04, .09, C.plasticWhite, 6, .03, [.3, 0, .4]);
  K.done();
}

function scooterFrame(view, p, g) {
  const K = kit(view, p, g);
  // A stripped, rusted scooter frame on its side 1.2 x .5: the deck and the folded stem lying along the
  // ground, a bare handlebar, the two wheel rims with no tyres (spoked hubs), rust patches, a cut cable.
  K.box(-.1, .09, 0, .9, .05, .22, C.rust); K.box(-.1, .05, 0, .5, .04, .16, C.rustDark);
  K.cyl(.28, .2, .0, .03, .82, C.steelDark, 6, undefined, [0, 0, PI / 2 - .12]);
  K.box(.66, .3, 0, .04, .04, .44, C.steelDark, [0, 0, .1]);
  for (const [x, z] of [[-.55, .18], [.5, -.14]]) { K.cyl(x, .15, z, .15, .04, C.rustDark, 8, undefined, [PI / 2, 0, 0]); K.cyl(x, .15, z, .04, .06, C.steelMid, 6, undefined, [PI / 2, 0, 0]); for (let i = 0; i < 3; i++) K.box(x, .15, z, .28, .015, .015, C.steelDark, [i * PI / 3, 0, 0]); }
  K.box(-.3, .125, .05, .2, .015, .14, C.rustDark, [0, .4, 0]);
  K.box(.68, .05, -.12, .3, .012, .012, C.black, [0, .5, 0]);
  K.done();
}

function waterDrum(view, p, g) {
  const K = kit(view, p, g);
  // A blue plastic rain drum .55 wide and 1 m tall with a tarp funnel over its mouth and a hose coil, a
  // bucket standing by it: the courtyard catches what falls.
  const blue = K.pick([C.plasticBlue, '#3a5a8c', '#2e4e7a']);
  K.cyl(-.15, .47, 0, .27, .94, blue, 10); K.cyl(-.15, .96, 0, .285, .05, tone(blue, -.25), 10); K.cyl(-.15, .3, 0, .28, .03, tone(blue, -.25), 10); K.cyl(-.15, .64, 0, .28, .03, tone(blue, -.25), 10);
  K.box(-.13, .955, 0, .58, .02, .58, C.tarp, [.18, .5, .1]); K.box(-.13, .925, 0, .18, .05, .18, C.black);
  K.cyl(.33, .14, .08, .13, .28, C.plasticWhite, 8, .16); K.cyl(.33, .28, .08, .128, .02, C.steelDark, 8);
  K.ring(-.15, .04, -.32, .15, .018, C.black, [PI / 2, 0, 0], 8, 4); K.ring(-.15, .07, -.32, .15, .018, C.black, [PI / 2, 0, 0], 8, 4);
  K.box(.05, .012, .15, .3, .015, .015, C.black, [0, .8, 0]);
  K.done();
}

// ---------------------------------------------------------------------------
// Night Market

function tarpCanopy(view, p, g) {
  const K = kit(view, p, g);
  // A tarp stretched over a crate table's corner of the market, on four slim posts 3.2 x 2.2 m apart: the
  // sheet sagging between the posts (2.66 m at them, about 2.5 m in the middle, over a body's top) in four
  // panels, each turned a little (the folds read in the flat shading), a crease across it, a valance along
  // both long edges, ropes to the posts' feet, a patch of another colour sewn on, three warm bulbs under
  // it. Weathered, dull colours: the market's light, not the tarp, is the colour. The posts are the only
  // collider. Every part of the sheet is `canopyFade` (the batch's canopy kind, world/roof-fade.js
  // CANOPY_FADE): it opens over anyone standing under it or behind it, so it never hides a body.
  const fade = m => { m.userData.canopyFade = true; return m; };
  const tarp = K.pick(TARP_COLOURS);
  const posts = [[-1.6, -1.1], [1.6, -1.1], [-1.6, 1.1], [1.6, 1.1]];
  for (const [x, z] of posts) { K.box(x, 1.4, z, .09, 2.8, .09, C.wood); K.box(x, .1, z, .3, .2, .3, C.concreteDark); }
  // The sag: y at x along the sheet (a parabola from the posts' line to the middle).
  const sag = .16, top = 2.66, at = x => top - sag * (1 - (x / 1.8) ** 2);
  for (let i = 0; i < 4; i++) {
    const x0 = -1.8 + i * .9, x1 = x0 + .9, y0 = at(x0), y1 = at(x1);
    fade(K.box((x0 + x1) / 2, (y0 + y1) / 2, 0, .905, .03, 2.6, tone(tarp, i % 2 ? -.06 : .04), [.1, 0, Math.atan2(y1 - y0, .9)]));
  }
  // A crease running across (the sheet pulled toward one post) and the valances, following the sag's ends.
  fade(K.box(-.35, at(-.35) + .025, .1, 2.2, .012, .05, tone(tarp, -.18), [.1, .55, 0]));
  fade(K.box(0, 2.42, 1.3, 3.6, .2, .03, tone(tarp, -.25), [.1, 0, 0]));
  fade(K.box(0, 2.56, -1.3, 3.6, .2, .03, tone(tarp, -.2), [.1, 0, 0]));
  fade(K.box(.95, at(.95) + .03, -.3, .8, .012, .7, tone(tarp === TARP_COLOURS[3] ? TARP_COLOURS[0] : TARP_COLOURS[3], -.05), [.1, 0, Math.atan2(at(1.35) - at(.55), .8)]));
  for (const [x, z] of posts) K.cyl(x * 1.06, 2.5, z * 1.06, .01, .5, C.grime, 4, undefined, [z > 0 ? -.4 : .4, 0, x > 0 ? .4 : -.4]);
  for (const x of [-1, 0, 1]) K.lit(x, 2.3, 0, .07, .06, .07, C.litWarm, 1.4);
  fade(K.box(0, 2.44, 0, 3.4, .02, .02, C.black));
  K.done();
}
// The tarps' colours: weathered blue-grey, olive, faded brick and canvas (desaturated: stage 5 review).
const TARP_COLOURS = Object.freeze(['#46505c', '#4c5446', '#634c46', '#8a8476']);

function produceStack(view, p, g) {
  const K = kit(view, p, g);
  // Produce crates stacked two high .6 x .4 each (three of them: a pair below, one across the top),
  // slatted plastic in a few colours, each with its pile of fruit or roots (blocks and balls in reds,
  // pinks, dark purple and a pale root) and a cardboard sign face down.
  const cols = [C.plasticRed, C.plasticBlue, C.plasticGreen, C.plasticYellow];
  const fruit = [['#c23a48', '#ff5a6e'], ['#4a3a5a', '#6a4a70'], ['#b6b9bf', '#c8c0b0'], ['#9cc23a', '#7a9c34']];
  const crate = (x, y, z, w, d, col, fr) => {
    K.box(x, y + .13, z, w, .04, d, col); for (const s of [-1, 1]) { K.box(x + s * (w / 2 - .02), y + .13, z, .04, .26, d, col); K.box(x, y + .13, z + s * (d / 2 - .02), w, .26, .04, col); }
    for (let i = 0; i < 4; i++) K.box(x, y + .05 + i * .05, z, w - .02, .02, d + .01, tone(col, -.35));
    for (let i = 0; i < 7; i++) K.ball(x + (K.rand() - .5) * (w - .14), y + .29, z + (K.rand() - .5) * (d - .12), .06, K.pick(fr), .85);
  };
  crate(-.3, 0, -.1, .6, .4, K.pick(cols), K.pick(fruit)); crate(.32, 0, .08, .6, .4, K.pick(cols), K.pick(fruit));
  crate(0, .28, -.03, .58, .38, K.pick(cols), K.pick(fruit));
  K.box(.4, .3, .3, .3, .01, .2, C.cardboard, [.4, .3, 0]);
  K.done();
}

function fishTank(view, p, g) {
  const K = kit(view, p, g);
  // A fish tank on a steel stand 1.7 x .6 x 1.3: two shelves of ice boxes and buckets below; the tank
  // above is a lit glass box (a pale-blue back light, glass sides, a light bar in the lid), gravel, a
  // couple of pink coral blocks, three fish (red-brown bodies, tail blocks) and a column of bubbles.
  for (const [x, z] of [[-.8, -.24], [.8, -.24], [-.8, .24], [.8, .24]]) K.box(x, .38, z, .05, .76, .05, C.steelMid);
  K.box(0, .76, 0, 1.7, .05, .62, C.steelDark); K.box(0, .3, 0, 1.6, .03, .56, C.steelDark);
  K.box(-.45, .18, 0, .5, .24, .4, C.plasticWhite); K.box(-.45, .32, 0, .52, .03, .42, tone(C.plasticWhite, -.2));
  K.cyl(.3, .14, .05, .17, .24, C.plasticBlue, 8, .2); K.cyl(.62, .12, -.05, .14, .2, C.plasticRed, 8, .16);
  K.box(0, .49, .28, 1.5, .28, .02, C.grime);
  K.box(0, 1.03, 0, 1.64, .5, .58, C.glass); // the water, a glass block
  K.lit(0, 1.03, -.26, 1.5, .44, .02, C.litBlue, .55);
  K.box(0, .81, 0, 1.6, .05, .54, tone(C.soil, .3));
  K.ball(-.5, .85, .05, .07, '#a8506a', .8); K.ball(.45, .86, -.08, .09, '#a8506a', .9);
  for (const [x, y, z, a] of [[-.3, 1.05, .02, 0], [.25, 1.15, -.1, PI], [.55, .98, .12, .3]]) {
    K.box(x, y, z, .17, .07, .04, '#a8412e'); K.box(x - Math.cos(a) * .11, y, z, .06, .08, .015, '#c8483a', [0, 0, .3]);
  }
  for (let i = 0; i < 6; i++) K.box(-.6 + Math.sin(i) * .04, .9 + i * .07, .1, .025, .025, .025, C.white);
  K.box(0, 1.29, 0, 1.68, .05, .62, C.steelDark); K.lit(0, 1.264, .27, 1.4, .02, .03, C.litWhite, 1.2);
  for (const s of [-1, 1]) K.box(s * .84, 1.03, 0, .03, .5, .6, C.steelDark);
  K.done();
}

function meatRail(view, p, g) {
  const K = kit(view, p, g);
  // A hanging rail 2.3 m: two steel uprights on feet, a top bar at 2 m, hooks, and six sides of meat in
  // plastic sheeting (pale wrapped shapes on hooks, a clear sheet across the front), a steel drip tray
  // under. Wrapped, pale and unmarked: no more than the shapes.
  for (const s of [-1, 1]) { K.box(s * 1.12, 1, 0, .06, 2, .06, C.steel); K.box(s * 1.12, .04, 0, .1, .08, .5, C.steelDark); }
  K.box(0, 1.98, 0, 2.3, .05, .05, C.steel);
  K.box(0, .14, 0, 2.1, .06, .5, C.steelDark);
  for (const s of [-1, 1]) K.box(s * 1.02, .21, 0, .04, .1, .5, C.steelDark);
  for (let i = 0; i < 6; i++) {
    const x = -.95 + i * .38, h = .7 + K.rand() * .25;
    K.box(x, 1.9, 0, .012, .1, .03, C.steelMid);
    K.box(x, 1.85 - h / 2, 0, .2, h, .17, K.pick(['#b8a29c', '#c2aeaa', '#a8908e']));
    K.box(x, 1.85 - h / 2, 0, .24, h + .05, .22, K.pick(['#7f9391', '#879a96']), [0, .2, 0]); // the wrapping, pale glass-grey
    K.box(x, 1.85 - h - .02, 0, .16, .05, .14, C.plasticWhite);
  }
  K.box(0, 1.1, .2, 2.2, 1.5, .012, '#688688');
  K.done();
}

function gasBottles(view, p, g) {
  const K = kit(view, p, g);
  // Three gas bottles chained in a row .9 x .5 x .7: a red, a grey-blue and a green-grey one with valve
  // collars and wheels, a rusted foot ring, a chain across them, a hose to a two-ring burner on a crate.
  [[-.3, C.plasticRed], [0, '#5f8288'], [.3, '#4f6a58']].forEach(([x, col], i) => {
    K.cyl(x, .28, -.05, .14, .5, col, 8); K.cyl(x, .55, -.05, .12, .06, tone(col, .1), 8, .07); K.cyl(x, .6, -.05, .04, .1, C.steel, 6);
    K.cyl(x, .07, -.05, .13, .08, C.rustDark, 8); K.box(x, .68, -.05, .12, .02, .02, C.steelDark, [0, i * .5, 0]);
  });
  K.box(0, .35, .09, .9, .03, .02, C.steelDark);
  K.box(.16, .5, .12, .02, .02, .35, C.black, [0, 0, 0]);
  K.box(.35, .1, .27, .26, .2, .2, C.wood); K.cyl(.35, .22, .27, .08, .04, C.black, 8);
  K.done();
}

function priceBoard(view, p, g) {
  const K = kit(view, p, g);
  // A price board 1.2 x .2 x 1.6 on a stand: dark slate in a black frame with a row of warm bulbs on
  // top, three rows of goods (a fish, a bowl, a chilli, as blocks) each with its price in tally marks
  // (fours struck through by a fifth) in chalk white. No digits, no letters.
  K.box(0, 1.05, 0, 1.2, 1.2, .05, C.black); K.box(0, 1.05, .03, 1.1, 1.1, .02, '#26302e');
  for (const s of [-1, 1]) K.box(s * .46, .54, -.13, .04, 1.05, .04, C.steelDark, [s * .08, 0, 0]);
  K.box(0, .5, -.13, .96, .03, .03, C.steelDark);
  for (const x of [-.4, -.13, .13, .4]) K.lit(x, 1.655, .02, .07, .07, .07, C.litWarm, 1.3);
  const row = (y, icon, tallies) => {
    icon(-.36, y);
    tallies.forEach((n, gi) => {
      const x0 = -.05 + gi * .27;
      for (let i = 0; i < Math.min(4, n); i++) K.box(x0 + i * .045, y, .045, .012, .17, .008, C.white);
      if (n >= 5) K.box(x0 + .07, y, .05, .22, .012, .008, C.white, [0, 0, .5]);
    });
  };
  row(1.42, (x, y) => { K.box(x, y, .045, .2, .11, .01, C.paper, [0, 0, .3]); K.box(x + .13, y, .045, .1, .1, .01, C.paper, [0, 0, .8]); K.box(x - .07, y + .01, .05, .02, .02, .01, C.black); }, [5, 2]);
  row(1.06, (x, y) => { K.cyl(x, y - .03, .05, .1, .05, C.plasticWhite, 8, .08, [PI / 2, 0, 0]); for (let i = 0; i < 3; i++) K.box(x - .05 + i * .05, y + .1, .045, .012, .1, .008, C.white, [0, 0, .1]); }, [3, 3]);
  row(.7, (x, y) => { K.box(x, y, .045, .22, .06, .01, '#b0262e', [0, 0, .4]); K.box(x - .11, y - .09, .045, .06, .03, .01, '#5a7a4a', [0, 0, .4]); }, [4]);
  K.done();
}

function marketScale(view, p, g) {
  const K = kit(view, p, g);
  // A hanging-pan scale on a little crate: a steel column, a beam tipped a shade (the heavier pan low),
  // two pans on chains, an iron weight in one and a heap of fruit in the other, a plumb needle.
  K.box(0, .17, 0, .52, .34, .38, C.wood); K.box(0, .35, 0, .54, .03, .4, C.woodPale);
  K.cyl(0, .68, 0, .03, .66, C.steelMid, 6);
  K.box(0, 1.03, 0, .66, .03, .03, C.steel, [0, 0, .06]);
  K.box(0, .93, .02, .02, .13, .012, C.black);
  for (const [x, y] of [[-.29, .95], [.29, .99]]) {
    for (const dx of [-.07, .07]) K.box(x + dx * .5, y - .2, 0, .008, .38, .008, C.steelDark, [0, 0, -dx * 1.2]);
    K.cyl(x, y - .4, 0, .13, .025, C.steel, 10, .11);
  }
  K.box(-.29, .6, 0, .08, .08, .08, C.black); K.cyl(-.29, .68, 0, .012, .08, C.steelDark, 4);
  for (let i = 0; i < 5; i++) K.ball(.26 + (K.rand() - .5) * .1, .63 + (i % 2) * .05, (K.rand() - .5) * .08, .045, K.pick(['#c23a48', '#9cc23a', '#4a3a5a']), .9);
  K.done();
}

function lanternPole(view, p, g) {
  const K = kit(view, p, g);
  // A lantern pole 2.9 m: a post on a poured foot, a cross bar at the top and three red paper lanterns
  // and one warm one hanging from it on cords (lit parts), a pictogram tag (no lettering) on the post.
  K.box(0, .1, 0, .34, .2, .34, C.concreteDark); K.cyl(0, 1.4, 0, .04, 2.8, C.wood, 6);
  K.box(0, 2.78, 0, 1.5, .05, .05, C.wood);
  [[-.6, C.litRed], [-.2, C.litRed], [.2, C.litWarm], [.6, C.litRed]].forEach(([x, c], i) => {
    K.box(x, 2.66, 0, .006, .2, .006, C.black); K.lit(x, 2.46 - (i % 2) * .05, 0, .22, .26, .22, c, 1.35);
    K.box(x, 2.6 - (i % 2) * .05, 0, .12, .03, .12, C.black); K.box(x, 2.31 - (i % 2) * .05, 0, .1, .03, .1, C.black);
  });
  K.box(0, 1.4, .05, .12, .18, .01, C.paper); K.box(0, 1.4, .058, .06, .06, .01, C.plasticRed, [0, 0, .78]);
  K.done();
}

function bulbString(view, p, g) {
  const K = kit(view, p, g);
  // A string of bulbs between two posts 4.8 m apart: each a wooden post 3.2 m on a concrete foot with a
  // steel cap and a cleat, and the cable between them sagging, a lit warm bulb hanging every .5 m (a
  // lit part), a couple already dead (dark glass).
  for (const s of [-1, 1]) { K.box(s * 2.4, .1, 0, .34, .2, .34, C.concreteDark); K.box(s * 2.4, 1.6, 0, .1, 3.2, .1, C.wood); K.box(s * 2.4, 3.2, 0, .14, .04, .14, C.steelDark); K.box(s * 2.4, 2.9, .06, .05, .05, .04, C.steelMid); }
  const at = sagLine(K, -2.4, 2.4, 3.0, 0, .3, .022, C.black, 10);
  for (let i = 1; i < 10; i++) {
    const t = i / 10, x = -2.4 + 4.8 * t, y = at(t)[1];
    if (i === 3 || i === 7) K.box(x, y - .1, 0, .07, .1, .07, C.glassDark);
    else K.lit(x, y - .1, 0, .07, .1, .07, C.litWarm, 1.35);
    K.box(x, y - .03, 0, .03, .05, .03, C.black);
  }
  K.done();
}

// ---------------------------------------------------------------------------
// Velvet Row

function ropeStanchions(view, p, g) {
  const K = kit(view, p, g);
  // A velvet rope knocked flat 2.8 m: two brass-look stanchions lying on their sides (pole, round foot,
  // ball finial), the deep-red rope between them slumped in a bight on the ground. Ankle high.
  const brass = K.pick(['#8c7c50', '#7a7050']);
  for (const [x, z, yaw] of [[-.95, -.05, .25], [.95, .12, PI - .3]]) {
    K.cyl(x, .05, z, .026, .95, brass, 6, undefined, [0, yaw, PI / 2]);
    K.cyl(x - Math.cos(yaw) * .48, .16, z + Math.sin(yaw) * .48, .16, .035, tone(brass, -.2), 10, undefined, [0, yaw, PI / 2]);
    K.ball(x + Math.cos(yaw) * .48, .06, z - Math.sin(yaw) * .48, .05, brass);
  }
  const rope = '#7a1f33', pts = [[-.55, -.02], [-.3, .18], [.05, .3], [.4, .22], [.7, .12]];
  for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; K.box((ax + bx) / 2, .035, (az + bz) / 2, Math.hypot(bx - ax, bz - az) + .03, .05, .05, rope, [0, -Math.atan2(bz - az, bx - ax), 0]); }
  K.done();
}

function doormanPodium(view, p, g) {
  const K = kit(view, p, g);
  // The doorman's podium .8 x .6 x 1.1: a black lacquered stand with a rose-pink trim, a slanted top with
  // the guest sheet (blank paper, a pen), a lit pink heart on the front (a lit part), a velvet rope hung
  // from a short brass hook on its side.
  K.box(0, .5, 0, .8, 1, .6, C.black); K.box(0, .02, 0, .84, .04, .64, C.graphite);
  K.box(0, 1.03, -.02, .84, .07, .62, C.panel, [.14, 0, 0]);
  K.box(0, .84, .302, .74, .03, .01, '#a84a6e');
  K.box(-.1, 1.08, -.02, .34, .01, .24, C.paper, [.14, 0, .06]); K.box(.22, 1.09, .02, .1, .012, .012, C.black, [.14, .7, 0]);
  heartTubes(K, 0, .55, .306, .3, C.litPink, 1.5, () => false, .03);
  K.cyl(.41, .86, .1, .015, .16, C.steelMid, 6, undefined, [0, 0, PI / 2]);
  K.box(.45, .78, .16, .03, .2, .03, '#7a1f33');
  K.done();
}

function heartStand(view, p, g) {
  const K = kit(view, p, g);
  // The club's neon heart, half dead, on a floor stand (the club door's own): a heavy foot, a stand,
  // a sandwich frame 1.1 wide, the heart outline in tubes. The right side still glows pink; the left is
  // dark glass with a crack in it, one short piece dim and stuttering-looking (lit low). Not lettering.
  K.box(0, .05, 0, 1.0, .1, .3, C.graphite);
  for (const s of [-1, 1]) K.box(s * .5, .8, 0, .05, 1.5, .05, C.steelDark);
  K.box(0, 1.55, 0, 1.06, .06, .06, C.steelDark);
  K.box(0, 1.1, -.05, 1.0, .95, .02, C.black);
  heartTubes(K, 0, 1.12, .02, 1.05, C.litPink, 1.5, (i, a, b) => a[0] < -.1 && b[0] < -.1);
  K.lit(-.27, 1.36, .02, .1, .04, .04, C.litPink, .35, [0, 0, .5]);
  K.box(-.2, 1.0, -.03, .01, .1, .02, C.black); // the crack in the dead glass
  K.cyl(.2, .02, .1, .02, .5, C.black, 4, undefined, [0, .3, PI / 2]); // the cable to the socket
  K.lit(.44, .1, .1, .04, .04, .04, C.litRed, .9);
  K.done();
}

function beadCurtain(view, p, g) {
  const K = kit(view, p, g);
  // Bead curtains beside a doorway (never across it): a rail under a hood, eight strands from 2.3 m down
  // to .15 m, each a cord with beads threaded in rose, red, smoked glass and pale, the strands swaying
  // a little out of true. No collider: they hang against the wall, thin as string.
  K.box(0, 2.34, 0, 1.1, .04, .06, C.steelDark); K.box(0, 2.4, -.02, 1.14, .05, .1, C.graphite);
  const beads = ['#c25a86', '#7a1f33', '#3a3038', '#d8c8cc', '#a84a6e'];
  for (let i = 0; i < 8; i++) {
    const x = -.5 + i * .143, len = 2.05 - K.rand() * .15, lean = (K.rand() - .5) * .04;
    K.box(x, 2.32 - len / 2, 0, .008, len, .008, C.black, [0, 0, lean]);
    for (let j = 0; j < 4; j++) K.box(x + lean * (j - 2) * 6, 2.05 - j * .5 - K.rand() * .1, 0, .04, .05, .04, K.pick(beads));
  }
  K.done();
}

function highHeel(view, p, g) {
  const K = kit(view, p, g);
  // A dropped high heel lying on its side, toe to the street: a wine-red sole and upper, a thin heel,
  // a strap, a scuff. 0.3 m long, 0.12 high: something a body steps over.
  const red = K.pick(['#8a2f3a', '#7a1f33', '#5a1f3a']);
  K.box(-.02, .025, 0, .2, .025, .075, tone(red, -.4), [0, 0, .06]);
  K.box(.04, .05, 0, .17, .05, .065, red, [0, 0, .12]);
  K.box(-.1, .05, 0, .06, .06, .065, red);
  K.cyl(-.13, .045, .0, .008, .1, C.steel, 4, .004, [0, 0, .1]);
  K.box(-.03, .09, 0, .012, .04, .07, red, [0, 0, .3]);
  K.box(.11, .045, 0, .05, .03, .06, tone(red, .1));
  K.lit(.02, .07, .02, .012, .012, .012, C.litPink, 1.4); // a fleck of glitter on it
  K.done();
}

function glitterSpill(view, p, g) {
  const K = kit(view, p, g);
  // Glitter spilled on the wet ground, 1.5 x 1: a scatter of tiny lit flecks (pink, white, pale blue, rose;
  // a lit part each), thick in the middle and thin at the edge, with a faint sticky sheen under them (a
  // dark-rose flat patch). Under 5 cm: walked over.
  K.box(0, .004, 0, 1.0, .008, .6, '#3a2830', [0, .3, 0]);
  const cols = [C.litPink, C.litWhite, C.litBlue, '#ff8cc0'];
  for (let i = 0; i < 22; i++) {
    const a = K.rand() * PI * 2, r = Math.sqrt(K.rand()) * .72;
    K.lit(Math.cos(a) * r, .013, Math.sin(a) * r * .65, .026 + K.rand() * .02, .012, .026, cols[i % cols.length], 1.3 + K.rand() * .6, [0, K.rand() * PI, 0]);
  }
  K.done();
}

function drinksCooler(view, p, g) {
  const K = kit(view, p, g);
  // A drinks cooler 1.5 x .8 x 1.9 (not the breakable vending machine): a wide open-fronted display with
  // two glass doors, three lit shelves of bottles in colour blocks, a cocktail-glass pictogram lit in the
  // header, side vents, a kick plate and a drip tray. Pink and white light.
  K.box(0, 1, -.1, 1.5, 1.8, .55, C.panel); K.box(0, .07, 0, 1.5, .14, .8, C.graphite);
  for (const s of [-1, 1]) K.box(s * .745, 1, 0, .03, 1.8, .8, C.graphite);
  K.box(0, 1.88, 0, 1.5, .1, .8, C.black);
  K.box(0, 1.05, .39, 1.44, 1.36, .02, C.glassDark);
  K.box(0, 1.05, .4, .02, 1.36, .02, C.steelMid);
  for (const s of [-1, 1]) K.box(s * .3, 1.05, .41, .012, 1.36, .012, C.glassPale, [0, 0, .12]);
  for (let i = 0; i < 3; i++) {
    const y = .62 + i * .42;
    K.lit(0, y, .3, 1.36, .025, .1, i === 1 ? C.litPink : C.litWhite, .95);
    for (let j = 0; j < 9; j++) K.box(-.6 + j * .15, y + .13, .28, .07, .22, .07, K.pick(['#c25a86', '#3a5a8c', '#b6b9bf', '#7a1f33', '#5a6a52', C.plasticWhite]));
  }
  K.box(0, 1.6, .405, 1.3, .16, .01, C.black);
  K.lit(0, 1.6, .412, .3, .06, .01, C.litPink, .9, [0, 0, .5]); K.lit(0, 1.6, .412, .3, .06, .01, C.litPink, .9, [0, 0, -.5]);
  K.lit(0, 1.535, .412, .03, .1, .01, C.litPink, .9); K.lit(0, 1.49, .412, .16, .02, .01, C.litPink, .9);
  K.lit(.4, 1.6, .412, .07, .07, .01, C.litWhite, 1.1, [0, 0, .78]);
  K.lit(0, 1.88 - .01, .404, 1.4, .03, .01, C.litPink, .8);
  for (let i = 0; i < 5; i++) K.box(.73, .5 + i * .05, .0, .012, .025, .5, C.black);
  K.done();
}

function karaokeMat(view, p, g) {
  const K = kit(view, p, g);
  // The karaoke box's entrance mat, lit, 2.1 x 1: a black rubber mat with a pink light border, a music
  // note in light on it (note head, stem, flag) and two pale arrows toward the door. Flat: walked over.
  K.box(0, .012, 0, 2.1, .024, 1, C.black);
  for (const [x, z, w, d] of [[0, -.46, 2.0, .04], [0, .46, 2.0, .04], [-1.01, 0, .04, .88], [1.01, 0, .04, .88]]) K.lit(x, .026, z, w, .012, d, C.litPink, 1.2);
  K.lit(-.25, .03, .1, .22, .012, .16, C.litPink, 1.3, [0, .4, 0]); K.lit(-.16, .03, -.12, .04, .012, .4, C.litPink, 1.3); K.lit(-.09, .03, -.28, .16, .012, .05, C.litPink, 1.3, [0, .5, 0]);
  K.lit(.25, .03, .1, .22, .012, .16, C.litWhite, 1, [0, .4, 0]); K.lit(.34, .03, -.12, .04, .012, .4, C.litWhite, 1);
  for (const x of [-.7, .7]) { K.lit(x, .028, .26, .3, .012, .05, C.litWhite, .8); K.lit(x - .07, .028, .3, .14, .012, .04, C.litWhite, .8, [0, .7, 0]); K.lit(x - .07, .028, .22, .14, .012, .04, C.litWhite, .8, [0, -.7, 0]); }
  K.done();
}

// ---------------------------------------------------------------------------
// Garage and Charging

function tyreStack(view, p, g) {
  const K = kit(view, p, g);
  // Tyre stacks: one of five, one of three and a tyre leant on them, each a short fat cylinder (black
  // rubber a shade different, a pale wall-ring, a dark hub hole), streaked with brake dust and oil.
  const tyre = (x, y, z, r = .34, dark = 0, rot) => {
    K.cyl(x, y, z, r, .185, tone('#1d1f24', dark), 10, undefined, rot);
    K.cyl(x, y + (rot ? 0 : .094), z, r * .52, .01, C.black, 8, undefined, rot);
    K.cyl(x, y, z, r * .99, .04, '#2a2c32', 10, undefined, rot);
  };
  for (let i = 0; i < 5; i++) tyre(-.4 + (K.rand() - .5) * .04, .095 + i * .19, -.1 + (K.rand() - .5) * .04, .34, (K.rand() - .5) * .3);
  for (let i = 0; i < 3; i++) tyre(.42 + (K.rand() - .5) * .04, .095 + i * .19, .05 + (K.rand() - .5) * .04, .33, (K.rand() - .5) * .3);
  K.cyl(.02, .36, .36, .33, .185, '#1d1f24', 10, undefined, [PI / 2 - .5, 0, 0]);
  K.box(.45, .01, -.4, .5, .015, .3, C.grime, [0, .4, 0]);
  K.done();
}

function oilDrums(view, p, g) {
  const K = kit(view, p, g);
  // Oil drums: two standing (rust-brown, faded blue), a graphite one on its side beside them with a dark
  // oil slick under its bung; ribs (two rings each), a hazard diamond block on the front, bungs and a
  // drip stain down the side.
  const drum = (x, z, col) => {
    K.cyl(x, .44, z, .29, .88, col, 10);
    for (const y of [.25, .63]) K.cyl(x, y, z, .3, .05, tone(col, -.2), 10);
    K.cyl(x, .885, z, .27, .015, tone(col, -.35), 10); K.cyl(x + .1, .9, z - .06, .04, .02, C.steel, 6);
    K.box(x, .5, z + .293, .2, .2, .01, C.hazard, [0, 0, .78]); K.box(x, .5, z + .3, .12, .12, .01, C.black, [0, 0, .78]);
    K.box(x - .13, .45, z + .3, .04, .5, .01, C.grime);
  };
  drum(-.45, -.15, K.pick([C.rust, '#5a4030']));
  drum(.05, -.25, '#2f4a6c');
  K.cyl(.05, .29, .3, .29, .88, C.graphite, 10, undefined, [0, .3, PI / 2]);
  K.cyl(.05, .29, .3, .3, .05, C.black, 10, undefined, [0, .3, PI / 2]);
  K.box(.4, .006, .32, .6, .012, .4, C.black, [0, .3, 0]);
  K.done();
}

function carOnStands(view, p, g) {
  const K = kit(view, p, g);
  // A compact city car with its wheels off, lifted on four jack stands 3.7 x 1.7 x 1.3: the body a
  // shade up from the ground, a bonnet propped open on its stay, the cabin's glass dark, brake discs
  // bare at the hubs, a drained sump pan under the engine bay, and the four wheels stacked at the nose end.
  const paint = K.pick(['#4a5a6a', '#6a3a3a', '#5a6a52', '#7a7a80']);
  K.box(-.3, .68, 0, 3.0, .42, 1.62, paint);
  K.box(-.4, .28, 0, 2.7, .22, 1.3, C.black);
  K.box(-.55, 1.13, 0, 1.5, .5, 1.42, C.glassDark);
  K.box(-.55, 1.4, 0, 1.4, .05, 1.38, paint);
  for (const s of [-1, 1]) { K.box(-.55, 1.15, s * .715, 1.35, .42, .02, C.glass); K.box(-1.2, 1.1, s * .72, .05, .45, .04, C.steelDark); }
  K.box(.95, .62, 0, .9, .1, 1.5, C.black); // engine bay, open
  K.box(.95, 1.0, 0, .96, .04, 1.4, paint, [0, 0, .95]); // the bonnet up
  K.cyl(.75, .8, .55, .015, .4, C.steelMid, 4, undefined, [0, 0, .5]);
  for (const [x, z] of [[-1.25, .82], [-1.25, -.82], [.85, .82], [.85, -.82]]) {
    K.cyl(x, .45, z * .97, .17, .05, C.steelDark, 10, undefined, [PI / 2, 0, 0]); K.cyl(x, .43, z * 1.03, .04, .06, C.steelMid, 6, undefined, [PI / 2, 0, 0]);
    K.cyl(x, .16, z * 1.05, .03, .3, C.hazardDark, 4, undefined); K.cyl(x, .015, z * 1.05, .14, .03, C.hazardDark, 4);
  }
  for (const [x, z, s] of [[-1.55, 0, -1], [-1.55, 0, 1]]) K.box(x, .5, z + s * .4, .04, .1, .4, C.hazard);
  for (let i = 0; i < 4; i++) { K.cyl(1.55, .095 + i * .19, .25, .3, .185, '#1d1f24', 10); K.cyl(1.55, .19 + i * .19, .25, .16, .006, C.steelDark, 8); }
  K.box(.3, .015, 0, .7, .03, .9, C.black); K.box(.3, .012, .5, .5, .02, .3, C.grime, [0, .3, 0]);
  K.box(1.4, .7, -.68, .28, .07, .03, C.glassDark); // (a dead headlamp)
  K.done();
}

function engineBlock(view, p, g) {
  const K = kit(view, p, g);
  // An engine block on a wooden pallet 1.4 x 1 x .8: cast-iron dark, four bores, a bolt row, a sump and
  // a timing cover, capped pipe stubs, a rusted lifting eye and a drip pan, the pallet split at a corner.
  for (let i = 0; i < 3; i++) K.box(0, .07, -.38 + i * .38, 1.36, .1, .18, C.wood);
  for (let i = 0; i < 4; i++) K.box(-.55 + i * .37, .015, 0, .12, .03, .96, C.woodPale);
  K.box(0, .32, 0, 1.0, .42, .58, C.steelDark); K.box(0, .58, 0, .92, .1, .5, C.graphite);
  for (let i = 0; i < 4; i++) { K.cyl(-.36 + i * .24, .64, 0, .085, .03, C.black, 8); for (let j = 0; j < 4; j++) K.cyl(-.36 + i * .24 + Math.cos(j * PI / 2) * .11, .625, Math.sin(j * PI / 2) * .11 * 1.2, .012, .03, C.steel, 4); }
  K.box(.56, .32, 0, .12, .4, .5, C.rust); K.box(-.56, .32, .05, .1, .3, .4, C.steelMid);
  K.box(0, .16, .3, .8, .18, .03, C.rustDark); K.cyl(.3, .68, -.1, .04, .1, C.rust, 6, undefined, [PI / 2, 0, 0]);
  for (const x of [-.25, .25]) K.cyl(x, .7, .32, .028, .12, C.steelDark, 6, undefined, [PI / 2, 0, 0]);
  K.box(.6, .028, .34, .3, .06, .2, C.grime, [0, .4, 0]);
  K.done();
}

function creeperBoard(view, p, g) {
  const K = kit(view, p, g);
  // A mechanic's creeper board 1 x .4, left on the floor: a dark-red plastic board with a padded head
  // rest, six castors under it, and a dropped spanner and an oily rag beside it. Under .2 m.
  const col = K.pick(['#7a2f3a', '#3a3f4a']);
  K.box(0, .075, 0, 1.0, .04, .38, col); K.box(-.4, .105, 0, .2, .04, .3, tone(col, -.3));
  for (const [x, z] of [[-.4, -.15], [-.4, .15], [0, -.15], [0, .15], [.4, -.15], [.4, .15]]) { K.cyl(x, .035, z, .035, .05, C.black, 6, undefined, [0, 0, PI / 2]); K.box(x, .052, z, .04, .014, .05, C.steelDark); }
  K.box(.5, .014, .17, .3, .02, .035, C.steel, [0, .4, 0]); K.cyl(.63, .014, .12, .03, .02, C.steel, 6);
  K.ball(-.65, .03, -.15, .07, '#2a2a2a', .55);
  K.done();
}

function hazardPost(view, p, g) {
  const K = kit(view, p, g);
  // A hazard post 1 m: a flexible spring bollard on a bolted plate (a coil of spring below, a fat post
  // above), wrapped in lemon and graphite bands with a reflective ring, a lit lemon cap, scuffed where
  // it has been hit.
  K.box(0, .02, 0, .3, .04, .3, C.steelDark); for (const [x, z] of [[-.11, -.11], [.11, -.11], [-.11, .11], [.11, .11]]) K.cyl(x, .05, z, .02, .03, C.steel, 6);
  K.cyl(0, .2, 0, .06, .3, C.steelMid, 8); for (let i = 0; i < 4; i++) K.cyl(0, .1 + i * .07, 0, .07, .015, C.black, 8);
  K.cyl(0, .68, 0, .08, .66, C.hazardDark, 8);
  for (let i = 0; i < 3; i++) K.cyl(0, .5 + i * .2, 0, .082, .1, C.hazard, 8);
  K.cyl(0, .96, 0, .085, .04, C.white, 8); K.lit(0, 1.0, 0, .09, .05, .09, C.litLemon, 1.5);
  K.box(.02, .4, .08, .05, .08, .01, C.grime);
  K.done();
}

function fastCharger(view, p, g) {
  const K = kit(view, p, g);
  // A dual fast charger .8 x .5 x 1.75: a graphite cabinet on a plinth with a bevelled hood, a lit green
  // status screen and a light bar, two holsters each with its cable coiled on a hook, a card reader, a
  // hazard sticker; lit parts green and white.
  K.box(0, .08, 0, .82, .16, .54, C.concreteDark); K.box(0, .93, 0, .74, 1.55, .46, C.panel);
  K.box(0, 1.76, 0, .78, .06, .5, C.graphite, [.05, 0, 0]);
  K.box(0, 1.52, .235, .5, .34, .02, C.black); K.lit(0, 1.52, .25, .44, .28, .01, C.litGreen, .55);
  K.lit(0, 1.7, .25, .5, .03, .01, C.litWhite, 1);
  for (const s of [-1, 1]) {
    K.box(s * .2, 1.0, .25, .16, .3, .06, C.black); K.cyl(s * .2, 1.0, .29, .045, .1, C.steelDark, 6, undefined, [PI / 2, 0, 0]);
    K.ring(s * .2, .66, .27, .11, .022, C.black, [0, 0, 0], 8, 4); K.ring(s * .2, .66, .27, .085, .022, C.black, [0, 0, 0], 8, 4);
    K.box(s * .2, .8, .26, .02, .3, .02, C.black); K.lit(s * .2, 1.16, .262, .1, .03, .01, s > 0 ? C.litGreen : C.litWhite, 1.1);
  }
  K.box(0, 1.22, .24, .2, .1, .02, C.steelDark); K.lit(0, 1.22, .254, .06, .02, .01, C.litGreen, 1.2);
  K.box(.28, .5, .238, .12, .12, .01, C.hazard);
  K.done();
}

function plugCable(view, p, g) {
  const K = kit(view, p, g);
  // A charge cable lying in the .4 m between a post and the car it is still plugged into, laid along the
  // gap (x runs along it, the post on the -z side, the car on the +z side): a thick black cable from the
  // post's foot in a lazy S with a loop of slack to a coupler at the car end, whose ring glows a steady
  // green (a lit part: the charge light). Under .12 m: walked over.
  const pts = [[-.42, -.12], [-.26, -.05], [-.08, -.1], [.12, .02], [.28, .08], [.4, .1]];
  for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; K.box((ax + bx) / 2, .022, (az + bz) / 2, Math.hypot(bx - ax, bz - az) + .03, .04, .04, C.black, [0, -Math.atan2(bz - az, bx - ax), 0]); }
  K.ring(-.02, .022, .03, .09, .016, C.black, [PI / 2, 0, 0], 8, 4); K.ring(-.02, .05, .03, .075, .016, C.black, [PI / 2, 0, 0], 8, 4);
  K.box(-.44, .04, -.13, .09, .08, .09, C.graphite);
  K.box(.44, .045, .11, .1, .09, .1, C.graphite);
  K.lit(.44, .048, .11, .11, .05, .11, C.litGreen, 1.8);
  K.done();
}

function toolCart(view, p, g) {
  const K = kit(view, p, g);
  // A rolling tool chest 1.1 x .55 x 1: a steel chest of four drawers on castors with a top tray, the
  // second drawer pulled out (the box reaches to it) with tools in it, spanners and a torque wrench on
  // the lid, a bar handle and a hazard sticker. The chest stands at the back of its footprint.
  const red = K.pick(['#8a2f3a', '#3a4a6c', '#5a5e67']), oz = -.12;
  K.box(0, .5, oz, 1.06, .74, .56, red); K.box(0, .9, oz, 1.1, .06, .6, tone(red, -.25));
  for (const [x, z] of [[-.46, -.22], [.46, -.22], [-.46, .22], [.46, .22]]) { K.cyl(x, .06, z + oz, .06, .04, C.black, 6, undefined, [0, 0, PI / 2]); K.box(x, .1, z + oz, .05, .08, .06, C.steelDark); }
  for (let i = 0; i < 4; i++) { K.box(0, .3 + i * .17, .285 + oz, .96, .13, .015, tone(red, i % 2 ? .1 : -.05)); K.box(0, .32 + i * .17, .3 + oz, .5, .03, .02, C.steel); }
  K.box(0, .5, .48 + oz, .94, .1, .4, tone(red, -.3)); // drawer two, out
  for (let i = 0; i < 5; i++) K.box(-.35 + i * .17, .57, .48 + oz, .06, .03, .32, K.pick([C.steel, C.steelMid, C.hazard]), [0, (i - 2) * .06, 0]);
  K.box(0, .95, -.28 + oz, 1.06, .06, .04, C.steelMid);
  K.box(-.1, .935, .05 + oz, .5, .02, .04, C.steel, [0, .2, 0]); K.box(.3, .935, -.05 + oz, .4, .028, .028, C.steelDark, [0, -.3, 0]);
  K.box(.36, .62, .29 + oz, .13, .13, .01, C.hazard);
  K.done();
}

function carLift(view, p, g) {
  const K = kit(view, p, g);
  // A two-post car lift 3.9 wide: two steel columns 2.1 m with base plates, carriage blocks, four swing
  // arms lowered to the floor with rubber pads, an overhead beam joining the tops (over a body's top)
  // with hydraulic hoses running along it, a control panel on one column with a lit green button.
  for (const s of [-1, 1]) {
    const x = s * 1.95;
    K.box(x, .02, 0, .5, .04, .8, C.concreteDark);
    K.box(x, 1.08, 0, .3, 2.12, .5, C.steelDark); K.box(x, 1.08, .26, .24, 2, .02, C.steelMid);
    K.box(x, .5, 0, .34, .34, .56, C.hazardDark); hazardBand(K, x, .5, .29, .3, .3, 4);
    for (const z of [-.24, .24]) { K.box(x - s * .6, .07, z * 1.8, 1.0, .09, .13, C.steelMid, [0, s * (z > 0 ? -.12 : .12), 0]); K.cyl(x - s * 1.08, .13, z * 2.05, .06, .04, C.black, 8); }
  }
  K.box(0, 2.21, 0, 3.9, .12, .3, C.hazardDark); hazardBand(K, 0, 2.21, .155, 3.8, .08, 14);
  for (const z of [-.05, .05]) K.box(0, 2.3, z, 3.9, .03, .03, C.black);
  K.box(-1.95, 1.3, .28, .18, .3, .05, C.black); K.lit(-1.95, 1.34, .31, .04, .04, .01, C.litGreen, 1.6); K.box(-1.95, 1.24, .3, .06, .06, .03, C.plasticRed);
  K.done();
}

function spillKit(view, p, g) {
  const K = kit(view, p, g);
  // A spill kit left open .9 x .6 x .6: a lemon-and-graphite bin on its side wall bracket-less, the lid
  // thrown back, absorbent pads pulled out in a pale fan, a black sock boom lying across the floor in
  // front, and a pictogram drop in blue on the bin front.
  K.box(0, .28, -.1, .8, .5, .4, C.hazard); hazardBand(K, 0, .1, .11, .78, .1, 10);
  K.box(0, .26, -.1, .82, .04, .42, C.hazardDark);
  K.box(0, .53, -.28, .84, .03, .5, tone(C.hazard, -.15), [1.9, 0, 0]);
  for (let i = 0; i < 5; i++) K.box(-.24 + i * .12, .56, .05 + i * .015, .13, .012, .42, K.pick([C.plasticWhite, '#a8a8a0', C.paper]), [-.18 + i * .07, (i - 2) * .08, 0]);
  K.cyl(0, .06, .32, .045, .8, C.black, 6, undefined, [0, .1, PI / 2]);
  K.box(0, .35, .105, .1, .14, .01, C.plasticBlue, [0, 0, .78]); K.cyl(0, .27, .105, .04, .01, C.plasticBlue, 8, undefined, [PI / 2, 0, 0]);
  K.done();
}

// ---------------------------------------------------------------------------
// Flatiron and Metro Plaza

function metroMap(view, p, g) {
  const K = kit(view, p, g);
  // The metro's route map, freestanding 2 x .3 x 2.3: two legs, a rain hood, a lit board with the lines
  // drawn as coloured light strips (pink, lemon, green, white) crossing at interchange dots and a
  // "you are here" marker in red; the board's face lit soft blue and the back plain graphite. Pictograms.
  for (const s of [-1, 1]) { K.box(s * .93, 1.1, -.02, .09, 2.2, .1, C.steelDark); K.box(s * .93, .04, -.02, .3, .08, .34, C.concreteDark); }
  K.box(0, 1.5, -.04, 1.9, 1.5, .08, C.graphite); K.box(0, 2.3 - .05, 0, 2.04, .08, .2, C.steelDark, [.15, 0, 0]);
  K.lit(0, 1.5, .03, 1.78, 1.38, .012, C.litBlue, .32);
  const line = (x, y, w, a, c) => K.lit(x, y, .04, w, .04, .012, c, 1.1, [0, 0, a]);
  line(-.1, 1.72, 1.5, 0, C.litPink); line(.3, 1.35, 1.3, 0, C.litLemon); line(-.35, 1.5, 1.5, .78, C.litGreen); line(.15, 1.5, 1.4, -.9, C.litWhite);
  for (const [x, y] of [[-.4, 1.72], [.3, 1.72], [.15, 1.35], [-.6, 1.35], [.05, 1.52]]) K.lit(x, y, .048, .1, .1, .012, C.litWhite, 1.6);
  K.lit(.62, 1.35, .05, .08, .08, .012, C.litRed, 1.6);
  K.box(0, .6, -.02, 1.8, .24, .08, C.panel); K.lit(0, .6, .03, 1.5, .03, .012, C.litWhite, .6);
  K.done();
}

function ticketMachine(view, p, g) {
  const K = kit(view, p, g);
  // A ticket machine .85 x .6 x 1.5: a graphite kiosk on a plinth, a slanted top with a lit soft-blue
  // screen (route lines as light strips, no text), a card slot with a lit green edge, a coin tray, a
  // paper slot, an emergency-call button (red), a hazard sticker; a dent and a scratch.
  K.box(0, .07, 0, .88, .14, .62, C.concreteDark); K.box(0, .78, -.02, .82, 1.26, .54, C.graphite);
  K.box(0, 1.46, .0, .84, .1, .58, C.panel, [.12, 0, 0]);
  K.box(0, 1.14, .258, .62, .5, .02, C.black); K.lit(0, 1.15, .27, .56, .44, .01, C.litBlue, .5);
  K.lit(-.1, 1.22, .278, .3, .03, .01, C.litPink, 1.2); K.lit(.08, 1.1, .278, .34, .03, .01, C.litLemon, 1.2, [0, 0, .3]); K.lit(.2, 1.2, .278, .05, .05, .01, C.litWhite, 1.5);
  K.box(-.22, .78, .258, .28, .1, .02, C.black); K.lit(-.22, .78, .27, .2, .012, .01, C.litGreen, 1.3);
  K.box(.22, .78, .258, .2, .12, .02, C.steelDark); K.box(.22, .64, .27, .2, .08, .1, C.steel);
  K.box(0, .56, .258, .3, .03, .02, C.black); K.cyl(-.25, .5, .26, .03, .02, C.plasticRed, 8, undefined, [PI / 2, 0, 0]);
  K.box(.28, .42, .258, .2, .16, .01, C.hazard); K.box(-.3, .38, .258, .01, .3, .01, C.grime, [0, 0, .3]);
  K.done();
}

function turnstileBank(view, p, g) {
  const K = kit(view, p, g);
  // A bank of three turnstiles 3 x .8 x 1.05, the gates of a metro that stopped: four steel-and-graphite
  // cabinets with slanted tops (lit arrows on them: green for go, red for stop), a tripod of bars at
  // each passage locked at rest, and a wide gate for prams at one end with its glass leaf swung open.
  for (let i = 0; i < 4; i++) {
    const x = -1.35 + i * .9;
    K.box(x, .5, 0, .24, 1, .74, C.steelDark); K.box(x, .93, 0, .24, .08, .74, C.graphite, [0, 0, .0]);
    K.box(x, 1.02, .0, .16, .02, .5, C.black, [0, 0, .1]);
    K.lit(x, 1.03, .1, .05, .02, .1, i % 2 ? C.litRed : C.litGreen, 1.5); K.lit(x, 1.03, -.1, .09, .02, .05, i % 2 ? C.litRed : C.litGreen, 1.2);
    K.box(x, .04, 0, .3, .08, .8, C.concreteDark);
  }
  for (let i = 0; i < 3; i++) {
    const x = -.9 + i * .9;
    for (let j = 0; j < 3; j++) K.cyl(x + Math.sin(j * 2.1) * .05, .93 + Math.cos(j * 2.1) * .1, Math.cos(j * 2.1) * .1, .022, .32, C.steel, 6, undefined, [j * 2.1 + 1.5, 0, PI / 2]);
    K.cyl(x, .93, 0, .05, .06, C.steelMid, 6);
  }
  K.box(1.06, .5, -.32, .04, 1, .18, C.glass);
  K.done();
}

function commBooth(view, p, g) {
  const K = kit(view, p, g);
  // A public comm booth 1 x 1 x 2.2, open to the front: a steel frame, dark glass side and back panels, a
  // roof slab (over a body's top), a lit soft-blue panel on the back with a handset and a keypad of blocks
  // (no digits), a pictogram strip in the header (a speech bubble, a heart, a moon), a floor plate.
  const at = (x, y, z, w, h, d, c, rot) => K.box(x, y, z, w, h, d, c, rot);
  for (const [x, z] of [[-.5, -.45], [.5, -.45], [-.5, .45], [.5, .45]]) at(x, 1.05, z, .07, 2.1, .07, C.steelDark);
  at(0, 2.18, 0, 1.12, .1, 1.06, C.graphite); at(0, 2.24, 0, 1.0, .03, .9, C.panel);
  at(0, 1.1, -.47, .96, 1.9, .03, C.glassDark); for (const s of [-1, 1]) at(s * .5, 1.1, 0, .03, 1.9, .9, C.glassDark);
  at(0, .05, 0, 1.06, .1, 1.0, C.concreteDark);
  K.lit(0, 1.35, -.44, .7, .6, .015, C.litBlue, .55);
  at(0, 1.72, -.43, .3, .3, .03, C.black); K.lit(0, 1.72, -.41, .22, .22, .012, C.litWhite, .7);
  at(-.12, 1.05, -.42, .08, .32, .07, C.black, [0, 0, .1]); at(-.1, 1.22, -.4, .24, .07, .07, C.black);
  for (let i = 0; i < 6; i++) at(.1 + (i % 3) * .1, 1.05 + Math.floor(i / 2) * .1 - .1, -.42, .07, .07, .02, i === 5 ? C.plasticRed : C.steel);
  K.lit(-.3, 2.0, .49, .16, .12, .015, C.litWhite, 1); K.lit(0, 2.0, .49, .12, .12, .015, C.litPink, 1, [0, 0, .78]); K.lit(.3, 2.0, .49, .12, .12, .015, C.litLemon, 1);
  at(.05, 2.0, .48, 1.0, .18, .02, C.black);
  K.done();
}

function queueCorral(view, p, g) {
  const K = kit(view, p, g);
  // A tipped queue corral 3.2 x 1.6: three barrier panels knocked flat (steel frames with two cross bars
  // and white reflective stripes) at angles, their feet sticking out, a coil of tape and a torn ribbon
  // under them. Under .3 m: walked over.
  const panel = (cx, cz, yaw, lean) => {
    const c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
    for (const dz of [-.05, .05]) { const [x, z] = at(0, dz); K.box(x, .06 + lean, z, 1.0, .03, .03, C.steel, [0, yaw, 0]); }
    for (const lx of [-.5, .5]) { const [x, z] = at(lx, 0); K.box(x, .06 + lean, z, .03, .03, .12, C.steel, [0, yaw, 0]); }
    for (const lx of [-.25, .25]) { const [x, z] = at(lx, 0); K.box(x, .062 + lean, z, .16, .02, .13, C.hazard, [0, yaw + .3, 0]); }
    const [fx, fz] = at(-.5, .18); K.box(fx, .04, fz, .04, .04, .3, C.steelMid, [0, yaw, 0]);
  };
  panel(-.9, -.2, .3, 0); panel(.35, .35, -.5, .02); panel(1.0, -.3, .05, .0);
  K.ring(-.2, .02, .5, .13, .02, C.hazardDark, [PI / 2, 0, 0], 8, 4);
  K.box(.3, .008, -.4, .8, .012, .04, C.plasticWhite, [0, .4, 0]);
  K.done();
}

function litLedge(view, p, g) {
  const K = kit(view, p, g);
  // A lit ledge under the prow's screen 4.2 x .7 x .5: a long concrete plinth with a steel cap slab and
  // a pale seat plank along it, its lower lip lit lemon (a soft strip lighting the pavement), a few
  // cigarette ends and a can at one end. Low: rounds fly over it.
  K.box(0, .2, 0, 4.1, .4, .6, C.concrete); K.box(0, .43, 0, 4.2, .06, .7, C.steelDark);
  K.box(0, .47, .1, 4.0, .03, .3, K.pick([C.woodPale, '#54606a']));
  K.lit(0, .12, .305, 3.9, .05, .012, C.litLemon, 1.1);
  for (const s of [-1, 1]) K.box(s * 1.4, .2, .304, .5, .3, .006, C.concreteDark);
  for (let i = 0; i < 4; i++) K.box(-1.6 + K.rand() * 3.2, .49, .1 + (K.rand() - .5) * .25, .04, .012, .012, C.paper, [0, K.rand(), 0]);
  K.cyl(1.7, .53, .0, .03, .09, C.plasticRed, 6, undefined, [0, 0, PI / 2]);
  K.done();
}

const MODELS = {
  cityRoadPit: roadPit, cityConeLine: coneLine, cityMedianPlanter: medianPlanter, cityStopFlag: stopFlag,
  cityDryFountain: dryFountain, citySculptBollard: sculptBollard, cityValetPodium: valetPodium, cityCameraPole: cameraPole, cityPaverInlay: paverInlay, cityBannerPole: bannerPole,
  cityDryingRack: dryingRack, cityCrateTable: crateTable, cityCableSpanShort: cableSpanShort, cityCableSpanLong: cableSpanLong, cityJunctionBox: junctionBox,
  cityDishPost: dishPost, cityShrineNiche: shrineNiche, cityBagSpill: bagSpill, cityScooterFrame: scooterFrame, cityWaterDrum: waterDrum,
  cityTarpCanopy: tarpCanopy, cityProduceStack: produceStack, cityFishTank: fishTank, cityMeatRail: meatRail, cityGasBottles: gasBottles, cityPriceBoard: priceBoard,
  cityMarketScale: marketScale, cityLanternPole: lanternPole, cityBulbString: bulbString,
  cityRopeStanchions: ropeStanchions, cityDoormanPodium: doormanPodium, cityHeartStand: heartStand, cityBeadCurtain: beadCurtain, cityHighHeel: highHeel,
  cityGlitterSpill: glitterSpill, cityDrinksCooler: drinksCooler, cityKaraokeMat: karaokeMat,
  cityTyreStack: tyreStack, cityOilDrums: oilDrums, cityCarOnStands: carOnStands, cityEngineBlock: engineBlock, cityCreeperBoard: creeperBoard, cityHazardPost: hazardPost,
  cityFastCharger: fastCharger, cityPlugCable: plugCable, cityToolCart: toolCart, cityCarLift: carLift, citySpillKit: spillKit,
  cityMetroMap: metroMap, cityTicketMachine: ticketMachine, cityTurnstileBank: turnstileBank, cityCommBooth: commBooth, cityQueueCorral: queueCorral, cityLitLedge: litLedge,
};
for (const [type, make] of Object.entries(MODELS)) registerLumenModel(type, make);
export const SETPIECE_MODELS = Object.freeze(Object.keys(MODELS));
