// Lumen stage 4: real models for the city's solid street furniture. Each
// registers with world/lumen-props.js registerLumenModel(type, make); the
// footprints, heights and collision boxes are the gameplay truth (lumen-props.js
// LUMEN_PROP_TYPES), so every model stays inside its boxes (+0.1 m at most) and
// fills them where a body would meet it. Futuristic city, low-poly, flat
// colours (world/lumen-kit.js), a little worn and crooked by a seeded stream
// (the same on every load), matte except where a part is lit (litBox, world/
// lumen-glow.js: bus shelter route strip, kiosk edges, ad pillar cap, bollard
// bands). No team colours, no lettering: posters and stickers are colour
// blocks and pictograms. The breakable street furniture (vending machines,
// hydrants, charge posts, cones, trash bags) and the trees are in
// world/lumen-breakables.js; the vehicles are world/lumen-vehicles.js.
import { registerLumenModel } from './lumen-props.js';
import { kit, tone, CITY as C } from './lumen-kit.js';

const PI = Math.PI;

// A dead-soil bed with butts, dry twigs and wrappers: what a planter holds in
// a city that stopped being watered. (x0, x1, z0, z1: the bed; y the soil top.)
function deadBed(K, x0, x1, z0, z1, y, twigs = 5, tall = .3) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  K.box(cx, y - .03, cz, w, .06, d, C.soil);
  for (let i = 0; i < 3; i++) K.box(cx + (K.rand() - .5) * w * .7, y + .005, cz + (K.rand() - .5) * d * .6, .22 + K.rand() * .3, .02, .16 + K.rand() * .2, K.pick([C.dead, C.grime, '#3b342b']), [0, K.rand() * PI, 0]);
  for (let i = 0; i < twigs; i++) {
    const x = cx + (K.rand() - .5) * w * .8, z = cz + (K.rand() - .5) * d * .7, h = tall * (.4 + K.rand() * .6);
    K.cyl(x, y + h / 2, z, .012, h, C.dead, 4, .006, [(K.rand() - .5) * .5, 0, (K.rand() - .5) * .5]);
  }
  // Cigarette butts and a crushed cup: pale specks and a plastic wrapper.
  for (let i = 0; i < 5; i++) K.box(cx + (K.rand() - .5) * w * .9, y + .012, cz + (K.rand() - .5) * d * .85, .045, .015, .012, i % 2 ? C.paper : '#8a8474', [0, K.rand() * PI, 0]);
  K.box(cx + (K.rand() - .5) * w * .5, y + .03, cz + (K.rand() - .5) * d * .5, .1, .06, .1, K.pick([C.plasticBlue, C.plasticRed, C.plasticWhite]), [.3, K.rand() * PI, .2]);
}

// A pictogram poster: a few colour blocks on a panel (no letters). `face` is
// +1/-1 (the z side it faces); the poster is torn at one corner.
function poster(K, x, y, z, w, h, face, palette) {
  const p = palette ?? K.pick([[C.litPink, C.black, C.litLemon], [C.litBlue, C.paper, C.black], ['#a8ff3c', C.panel, C.paper], [C.litRed, C.paper, C.black]]);
  K.box(x, y, z + face * .006, w, h, .01, p[1]);
  K.box(x, y + h * .18, z + face * .012, w * .78, h * .42, .008, p[0]);
  K.cyl(x - w * .16, y - h * .26, z + face * .014, Math.min(w, h) * .15, .008, p[2], 8, undefined, [PI / 2, 0, 0]);
  K.box(x + w * .18, y - h * .26, z + face * .014, w * .34, h * .09, .008, p[2]);
  // torn corner: a dark notch and a curl
  K.box(x + w * .44, y + h * .44, z + face * .016, w * .14, h * .14, .01, C.panel, [0, 0, .78]);
}

function shelter(view, p, g) {
  const K = kit(view, p, g);
  const frame = C.graphite, alu = C.steelMid;
  // Frame: four posts, a roof (a shade off flat so it sheds the rain), a kick rail.
  for (const [x, z] of [[-1.92, -.72], [1.92, -.72], [-1.92, .72], [1.92, .72]]) K.box(x, 1.2, z, .1, 2.4, .1, frame);
  K.box(0, 2.42, 0, 4, .07, 1.56, C.panel, [.03, 0, 0]);
  K.box(0, 2.37, -.72, 3.9, .1, .12, frame); K.box(0, 2.37, .72, 3.9, .1, .1, frame);
  // Glass: back and two ends, a pale reflection streak on each, a metal kick plate under.
  K.box(0, 1.2, -.7, 3.7, 2.2, .06, C.glass); K.box(0, .1, -.7, 3.9, .2, .16, alu);
  for (const s of [-1, 1]) { K.box(s * 1.92, 1.2, 0, .06, 2.2, 1.44, C.glass); K.box(s * 1.92, .1, 0, .16, .2, 1.5, alu); }
  K.box(-1.1, 1.3, -.63, .35, 1.9, .012, C.glassPale, [0, 0, .5]); K.box(.9, 1.3, -.63, .2, 1.9, .012, C.glassPale, [0, 0, .5]);
  for (const s of [-1, 1]) K.box(s * 1.85, 1.3, .2, .012, 1.6, .28, C.glassPale, [.5, 0, 0]);
  // The seat: a perch on brackets off the back glass (13 cm deep, in the back's collider: a body
  // meets the glass's box, not thin air), and a lean rail over it.
  K.box(0, .62, -.585, 2.7, .05, .13, C.woodPale); for (const s of [-1, 1]) K.box(s * 1.1, .52, -.6, .06, .16, .1, frame);
  K.box(0, .98, -.58, 2.6, .05, .06, alu);
  // The route strip (a pictogram line: a lit rule with stops in the line's colours) under the roof
  // on the inside of the back glass, and a waste tray at one end.
  K.lit(0, 2.2, -.6, 3.3, .035, .02, C.litWhite, .9);
  [[-1.5, C.litLemon], [-.9, C.litBlue], [-.3, C.litGreen], [.3, C.litPink], [.9, C.litLemon], [1.5, C.litBlue]].forEach(([x, c], i) => K.lit(x, 2.2, -.585, .1, .1, .02, c, 1.2, [0, 0, i % 2 ? .78 : 0]));
  // Wear: a taped-on poster block on one end glass, a stain streak on the roof.
  K.box(1.88, 1.4, .1, .01, .5, .34, '#6a2a48'); K.box(1.3, 2.49, .2, .7, .01, .24, C.grime);
  K.done();
}

function planter(view, p, g) {
  const K = kit(view, p, g);
  // A low concrete trough with a steel lip, dead soil and butts (1.6 x .9, .65 high).
  K.box(0, .3, 0, 1.6, .6, .9, C.concrete); K.box(0, .6, 0, 1.64, .06, .94, C.concretePale);
  for (const s of [-1, 1]) K.box(s * .5, .3, .452, .5, .4, .01, C.concreteDark); // panel inlays
  K.box(0, .04, .0, 1.66, .08, .96, C.concreteDark);
  deadBed(K, -.75, .75, -.4, .4, .58, 7, .18);
  K.done();
}

function planterTall(view, p, g) {
  const K = kit(view, p, g);
  // A tall plant box 2 x 1.2 x 1.2: board-formed concrete, a steel cap rail, a lit-strip niche, dead shrub.
  K.box(0, .55, 0, 2, 1.1, 1.2, C.concrete); K.box(0, 1.14, 0, 2.02, .08, 1.22, C.steelDark);
  K.box(0, .05, 0, 2.06, .1, 1.26, C.concreteDark);
  for (let i = -3; i <= 3; i++) K.box(i * .28, .55, .602, .012, 1, .006, C.concreteDark);
  for (const z of [-1, 1]) K.box(0, .3, z * .603, 1.3, .12, .012, C.grime);
  deadBed(K, -.9, .9, -.5, .5, 1.1, 9, .07);
  for (let i = 0; i < 7; i++) { const x = (K.rand() - .5) * 1.6, z = (K.rand() - .5) * .8; K.cyl(x, 1.1 + .06, z, .018, .12, C.dead, 4, .008, [(K.rand() - .5) * .6, 0, (K.rand() - .5) * .6]); }
  K.done();
}

function jersey(view, p, g) {
  const K = kit(view, p, g);
  // The crash barrier's profile in three steps (0.6 wide at the foot, 0.28 at the top, 1.2 high), a chipped
  // top, lifting loops, and a worn lemon-and-graphite chevron band with reflector studs.
  const L = 1.96;
  K.box(0, .16, 0, L + .04, .32, .6, C.concrete); K.box(0, .55, 0, L, .46, .44, tone(C.concrete, .06)); K.box(0, .96, 0, L, .48, .3, C.concretePale);
  K.box(0, 1.19, 0, L - .06, .04, .32, C.concreteDark); // the cap
  for (let i = 0; i < 9; i++) K.box(-.85 + i * .213, .93, .155, .11, .3, .008, i % 2 ? C.hazard : C.hazardDark, [0, 0, i % 2 ? .6 : -.6]);
  for (const s of [-1, 1]) K.lit(s * .82, 1.02, .16, .07, .05, .01, C.litLemon, .8);
  for (const s of [-1, 1]) K.box(s * .93, .56, 0, .05, .06, .5, C.steelDark);
  K.box(.55 + K.rand() * .2, 1.185, -.05, .2, .05, .12, C.concreteDark, [0, K.rand(), 0]); // chip
  K.box(0, .1, .3, L * .96, .18, .02, C.grime); // splash-dirt at the foot
  K.done();
}

function bollard(view, p, g) {
  const K = kit(view, p, g);
  // A steel bollard with a domed cap and a reflective lemon band; some carry a lit cold-white ring.
  K.cyl(0, .04, 0, .14, .08, C.concreteDark, 8); K.cyl(0, .5, 0, .11, .84, C.steelMid, 8);
  K.cyl(0, .92 - .04, 0, .11, .06, C.steelDark, 8, .09); K.cyl(0, .8, 0, .114, .08, C.hazard, 8);
  if (K.rand() < .55) K.lit(0, .66, 0, .22, .035, .22, C.litWhite, 1.1);
  K.done();
}

function bench(view, p, g) {
  const K = kit(view, p, g);
  // A slat bench: five composite slats on two cast legs, a centre arm against sleeping.
  const wood = K.pick([C.woodPale, '#54606a', '#6a5a4a']);
  for (let i = 0; i < 5; i++) K.box(0, .43, -.22 + i * .11, 1.78, .05, .085, i % 2 ? wood : tone(wood, -.2));
  for (const s of [-1, 1]) { K.box(s * .78, .2, -.02, .08, .4, .5, C.graphite); K.box(s * .78, .02, -.02, .14, .04, .56, C.steelDark); }
  K.box(0, .32, 0, 1.6, .03, .06, C.steelDark); K.box(.05, .5, 0, .05, .08, .5, C.steelMid); // arm
  K.box(-.3, .46, .1, .3, .012, .2, C.paper, [0, .3, 0]); // a flyer (colour block)
  K.done();
}

function kiosk(view, p, g) {
  const K = kit(view, p, g);
  // A closed street kiosk 2.4 x 2.4 x 2.6: a ribbed graphite box on a plinth, a roof slab with a steel
  // edge, a serving window on the east face under a half-shut shutter, warm lit edges. The screens on
  // the north and south faces are the signs' (maps/lumen-signs.js), so those faces stay flat.
  K.box(0, .1, 0, 2.4, .2, 2.4, C.concreteDark);
  K.box(0, 1.35, 0, 2.3, 2.3, 2.3, C.panel);
  for (let i = -5; i <= 5; i++) { K.box(i * .2, 1.35, 1.16, .05, 2.2, .02, C.graphite); K.box(i * .2, 1.35, -1.16, .05, 2.2, .02, C.graphite); }
  K.box(0, 2.5, 0, 2.4, .12, 2.4, C.steelDark); K.box(0, 2.58, 0, 2.3, .04, 2.3, C.graphite);
  // the serving window (east, +x face): frame, dark glass, counter shelf, roll shutter half down
  K.box(1.16, 1.3, 0, .04, .9, 1.3, C.black); K.box(1.19, 1.3, 0, .02, .8, 1.2, C.glassDark); K.box(1.2, 1.7, 0, .03, .5, 1.28, C.steel);
  K.box(1.19, .86, 0, .12, .05, 1.4, C.steelDark);
  for (let i = 0; i < 6; i++) K.box(1.2, 1.53 + i * .02, 0, .012, .012, 1.26, C.steelDark);
  // the west face: a service door with a bar, a hazard sticker block, a conduit to the roof
  K.box(-1.16, 1.0, .3, .03, 1.9, .8, C.graphite); K.box(-1.19, 1.0, .05, .02, .05, .16, C.steelMid); K.box(-1.18, 1.5, -.6, .01, .3, .3, C.hazard);
  K.cyl(-1.14, 1.3, -.95, .03, 2.4, C.steelDark, 6);
  // lit: a warm strip under the roof edge, all round, and the window's lit frame
  for (const z of [-1.17, 1.17]) K.lit(0, 2.42, z, 2.1, .05, .02, C.litWarm, 1);
  K.lit(1.17, 2.42, 0, .02, .05, 2.1, C.litWarm, 1);
  K.lit(1.2, 1.3, .0, .012, .04, 1.24, C.litLemon, .9);
  K.done();
}

function dumpster(view, p, g) {
  const K = kit(view, p, g);
  // A steel bin 2 x 1.3 x 1.4: sloped-front body in a faded green/blue/graphite, ribs, lid flaps (one
  // ajar with trash under it), fork pockets, castors, rust and grime at the seams.
  const paint = K.pick(['#3a5a4a', '#3a4a6a', '#4a4e56', '#4c5a3a']);
  K.box(0, .68, 0, 2, .9, 1.3, paint);
  K.box(0, .68, .68, 2.02, .88, .04, tone(paint, -.1)); // front lip
  for (let i = -3; i <= 3; i++) K.box(i * .3, .7, .655, .05, .8, .03, C.graphite);
  K.box(0, .12, 0, 1.9, .24, 1.2, C.graphite);
  for (const [x, z] of [[-.85, -.5], [.85, -.5], [-.85, .5], [.85, .5]]) { K.cyl(x, .1, z, .08, .06, C.black, 6, undefined, [0, 0, PI / 2]); }
  for (const s of [-1, 1]) K.box(s * .55, .5, .67, .4, .12, .04, C.black); // fork pockets
  // lids: two flaps, the left ajar (raised .1 at the back edge)
  K.box(.5, 1.2, 0, .98, .06, 1.34, tone(paint, .1), [0, 0, 0]); K.box(-.5, 1.28, -.04, .98, .06, 1.34, tone(paint, .1), [.08, 0, 0]);
  K.box(0, 1.16, -.66, 2.02, .12, .06, C.steelDark);
  K.ball(-.5, 1.18, .1, .3, '#1d2026', .4, 1.4, 1); K.ball(-.62, 1.2, -.15, .2, '#2f3a4a', .5, 1, 1);
  K.box(.4, .8, .662, .5, .5, .01, C.rust); K.box(-.7, .3, .662, .4, .3, .01, C.rustDark);
  K.box(0, .93, .672, .36, .16, .012, C.hazard); // a stencilled hazard block
  K.done();
}

function utilityBox(view, p, g) {
  const K = kit(view, p, g);
  // A cabinet 1 x .6 x 1.3 for the mains and the fibre: louvred double door, hazard sticker, padlock,
  // conduits up the back wall and a cable gland; one of every few stands with a door ajar.
  const paint = K.pick(['#5a6058', '#4a5560', '#5c5f66']);
  K.box(0, .07, 0, 1.02, .14, .62, C.concreteDark); K.box(0, .72, 0, .96, 1.16, .56, paint); K.box(0, 1.3, 0, 1.02, .06, .6, tone(paint, .15));
  for (const s of [-1, 1]) { K.box(s * .24, .72, .29, .44, 1.04, .02, tone(paint, -.1)); for (let i = 0; i < 5; i++) K.box(s * .24, .3 + i * .1, .305, .32, .03, .012, C.black, [.4, 0, 0]); }
  K.box(0, .78, .31, .04, .2, .02, C.steel); K.box(0, .62, .32, .07, .08, .03, C.hazard); K.box(.22, 1.1, .31, .16, .16, .01, C.hazard);
  K.cyl(-.36, .7, -.32, .03, 1.4, C.steelDark, 6); K.cyl(.36, .7, -.32, .03, 1.4, C.steelDark, 6); K.box(0, 1.24, -.32, .8, .05, .05, C.steelDark);
  K.box(.3, .2, .27, .5, .16, .01, C.grime);
  K.done();
}

function adPillar(view, p, g) {
  const K = kit(view, p, g);
  // A double-sided ad pillar 1.2 x 1.2 x 2.8: a plinth, a steel-cornered graphite body, a lit cap. The two
  // big screens (north and south faces) are the signs'; the east and west faces carry a route pictogram.
  K.box(0, .13, 0, 1.2, .26, 1.2, C.concreteDark);
  K.box(0, 1.45, 0, 1.04, 2.3, 1.14, C.panel);
  for (const [x, z] of [[-.53, -.58], [.53, -.58], [-.53, .58], [.53, .58]]) K.box(x, 1.4, z, .1, 2.6, .1, C.steelMid);
  K.box(0, 2.72, 0, 1.2, .16, 1.2, C.graphite);
  K.lit(0, 2.62, .56, 1, .04, .04, C.litWhite, 1.2); K.lit(0, 2.62, -.56, 1, .04, .04, C.litWhite, 1.2);
  for (const s of [-1, 1]) {
    K.box(s * .524, 1.6, 0, .02, 1.4, .8, C.graphite);
    K.box(s * .54, 1.9, 0, .01, .5, .5, C.hazardDark); K.box(s * .545, 1.9, 0, .01, .28, .28, C.hazard, [0, 0, .78]);
    K.box(s * .54, 1.3, 0, .01, .06, .5, C.steelMid); K.box(s * .54, 1.2, 0, .01, .06, .3, C.steelMid);
  }
  K.box(0, .5, .6, .8, .5, .02, C.graphite); K.box(0, .5, -.6, .8, .5, .02, C.graphite); // service panels
  K.done();
}

function construction(view, p, g) {
  const K = kit(view, p, g);
  // A hoarding panel 3.5 x .5 x 2: painted plywood between two frames, posts on sandbag feet with
  // diagonal braces, a hazard-striped top rail, and image-only posters (colour blocks). Never a screen.
  const board = K.pick(['#3a4a5e', '#4a4e56', '#3e4a4c']);
  K.box(0, 1.05, 0, 3.4, 1.6, .06, board);
  for (let i = 0; i < 3; i++) K.box(-1.14 + i * 1.14, 1.05, .034, .015, 1.6, .01, C.graphite); // sheet seams
  K.box(0, 1.96, 0, 3.5, .1, .16, C.graphite);
  for (let i = 0; i < 14; i++) K.box(-1.62 + i * .25, 1.96, .085, .12, .09, .01, i % 2 ? C.hazard : C.hazardDark, [0, 0, .6]);
  K.box(0, .18, 0, 3.4, .12, .08, C.graphite);
  for (const x of [-1.6, 0, 1.6]) { K.box(x, 1, -.02, .1, 2, .1, C.steelDark); K.box(x, .09, .12, .3, .18, .22, K.pick([C.cardboard, C.paper])); K.box(x, .09, -.14, .3, .18, .2, K.pick([C.cardboard, C.paper])); }
  for (const x of [-1.6, 1.6]) K.box(x, .9, -.12, .05, 1.5, .04, C.steelDark, [.16, 0, 0]);
  poster(K, -.75, 1.05, .04, .8, 1.05, 1); poster(K, .55, 1.15, .04, .7, .9, 1);
  K.box(1.3, .5, .04, .5, .5, .01, C.grime); K.box(-1.35, 1.6, .04, .45, .22, .01, '#6a2a48');
  K.done();
}

function hoarding(view, p, g) {
  const K = kit(view, p, g);
  // The long screen of a street: 5 x .4 x 2.6, dark boarding on steel posts every 1.25 m, seamed, water-
  // stained, with sprayed colour marks, a torn poster or two and a hazard band. Unlit, never a sign.
  const board = K.pick(['#3c4046', '#34383e', '#424650']);
  K.box(0, 1.32, 0, 5, 2.4, .08, board);
  for (let i = -4; i <= 4; i++) K.box(i * .5, 1.32, .046, .012, 2.4, .01, C.graphite);
  for (let i = 0; i < 5; i++) K.box(-2.42 + i * 1.21, 1.3, -.06, .12, 2.6, .12, C.steelDark);
  K.box(0, 2.56, 0, 5.04, .09, .3, C.graphite); K.box(0, .05, 0, 5, .1, .3, C.concreteDark);
  for (let i = 0; i < 20; i++) K.box(-2.4 + i * .25, 2.1, .054, .12, .11, .01, i % 2 ? C.hazard : C.hazardDark, [0, 0, .5]);
  poster(K, -1.6, 1.25, .05, 1.1, 1.5, 1); poster(K, .3, 1.1, .05, .9, 1.25, 1); poster(K, 1.9, 1.35, .05, 1, 1.2, 1);
  for (let i = 0; i < 4; i++) K.box(-2 + i * 1.3 + K.rand() * .3, .55 + K.rand() * .4, .054, .3 + K.rand() * .5, .06 + K.rand() * .1, .008, K.pick([C.litPink, C.litBlue, '#a8ff3c']), [0, 0, (K.rand() - .5) * .3]);
  for (let i = 0; i < 6; i++) K.box(-2.3 + K.rand() * 4.6, 1.6 + K.rand() * .7, .053, .05 + K.rand() * .05, .5 + K.rand() * .6, .008, C.grime); // streaks
  for (const x of [-2.4, 2.4]) K.box(x, 1.2, -.14, .06, 2.3, .05, C.steelDark, [.12, 0, 0]);
  K.done();
}

function fallenPole(view, p, g) {
  const K = kit(view, p, g);
  // A signal pole down across a corner: the pole (x -3.2..3.6) lies on the ground; at the west end the
  // stump stands up on a broken base plate (1.4 m) with the mast arm's root; the dead head lies beside
  // it and a cable trails off. Dark, no light (the signs' dead junction is dark too).
  const pole = C.steelMid;
  K.cyl(.2, .2, 0, .17, 6.8, pole, 8, .12, [0, 0, PI / 2]);
  K.cyl(-3.6, .04, 0, .38, .08, C.concreteDark, 8); K.cyl(-3.6, .72, 0, .15, 1.36, pole, 8, .17);
  for (let i = 0; i < 4; i++) { const a = i * PI / 2 + .4; K.box(-3.6 + Math.cos(a) * .3, .12, Math.sin(a) * .3, .06, .12, .06, C.steelDark); }
  K.box(-3.45, 1.35, 0, .3, .1, .16, C.steelDark, [0, 0, .5]); // torn arm root
  K.box(-3.45, .95, .14, .06, .3, .02, C.black); // cable gland
  // the mast arm where it fell: bent, across the pole's end
  K.cyl(2.7, .12, 0, .06, 1.6, C.steelDark, 6, .045, [0, .12, PI / 2]);
  // the head: a dark three-lens box
  // (against the pole, inside its .35 m collider: it lay .3 m past it)
  K.box(1.5, .17, .11, .72, .26, .26, C.black); for (let i = 0; i < 3; i++) K.cyl(1.5 - .23 + i * .23, .17, .25, .08, .02, C.glassDark, 8, undefined, [PI / 2, 0, 0]);
  // cable: dark segments trailing from the stump
  for (let i = 0; i < 6; i++) K.box(-3.2 + i * .35, .02, .12 + Math.sin(i) * .1, .4, .025, .025, C.black, [0, Math.sin(i) * .3, 0]);
  K.done();
}

function island(view, p, g) {
  const K = kit(view, p, g);
  // The Crossroads' refuge 7.6 x 2.6: a raised kerbed slab (only the two planters collide), a worn lemon
  // kerb-edge stripe, dead planters 1.9 x 2.3 x .7 at either end, each with a steel post plate where the
  // signal gantry stands (maps/lumen-signs.js crossroadsSignals, .7 m up), a tactile pad in the middle
  // where the screen stands.
  K.box(0, .07, 0, 7.6, .14, 2.6, C.concretePale);
  K.box(0, .152, 0, 7.4, .012, 2.4, C.concrete);
  for (let i = 0; i < 14; i++) { K.box(-3.45 + i * .53, .16, 1.24, .3, .02, .05, C.hazard); K.box(-3.45 + i * .53, .16, -1.24, .3, .02, .05, C.hazard); }
  for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) K.cyl(-.7 + i * .2, .16, -.3 + j * .3, .03, .02, C.hazard, 5);
  for (const s of [-1, 1]) {
    const x = s * 2.85;
    K.box(x, .4, 0, 1.9, .54, 2.3, C.concrete); K.box(x, .68, 0, 1.94, .06, 2.34, C.steelDark);
    K.box(x, .69, 0, 1.6, .04, 2.0, C.soil);
    K.cyl(x, .72, 0, .34, .05, C.steelMid, 8);
    for (let i = 0; i < 4; i++) K.cyl(x + Math.cos(i * PI / 2) * .26, .75, Math.sin(i * PI / 2) * .26, .025, .04, C.steelDark, 5);
    for (let i = 0; i < 5; i++) K.cyl(x + (K.rand() - .5) * 1.2, .75, (K.rand() - .5) * 1.7, .012, .1, C.dead, 4, .006, [(K.rand() - .5) * .8, 0, (K.rand() - .5) * .8]);
    for (let i = 0; i < 5; i++) K.box(x + (K.rand() - .5) * 1.3, .715, (K.rand() - .5) * 1.8, .05, .015, .012, C.paper, [0, K.rand() * 3, 0]);
  }
  K.done();
}

function islandScreen(view, p, g) {
  const K = kit(view, p, g);
  // The curved-screen slab 3.6 x .4 x 2.6 (the two faces are the signs'): a graphite slab on a
  // concrete plinth, steel end posts and a cap, cable ducts down the ends, a faint lit foot strip.
  K.box(0, .16, 0, 3.6, .32, .4, C.concreteDark);
  K.box(0, 1.5, 0, 3.2, 2.2, .28, C.black);
  for (const s of [-1, 1]) { K.box(s * 1.7, 1.3, 0, .2, 2.6, .4, C.steelMid); K.box(s * 1.7, 1.3, .21, .05, 2.4, .04, C.graphite); }
  K.box(0, 2.56, 0, 3.6, .1, .4, C.steelDark);
  for (const s of [-1, 1]) K.lit(0, .3, s * .21, 3.0, .03, .012, C.litWhite, .9);
  K.done();
}

function screenWall(view, p, g) {
  const K = kit(view, p, g);
  // A freestanding ad screen 5 x .5 x 3 on two legs: a solid service base under the screens (which are the
  // signs', from y .8), steel legs, a dark slab, a top cap and a cable trunk down one leg.
  K.box(0, .42, 0, 5, .84, .4, C.graphite);
  for (let i = -6; i <= 6; i++) K.box(i * .38, .42, .205, .05, .7, .008, C.black); // vents
  K.box(0, 1.9, 0, 4.8, 2.2, .32, C.black);
  for (const s of [-1, 1]) { K.box(s * 2.4, 1.5, 0, .2, 3, .4, C.steelMid); K.box(s * 2.3, .06, 0, .4, .12, .46, C.concreteDark); }
  K.box(0, 2.96, 0, 5, .08, .4, C.steelDark);
  K.cyl(2.2, 1.5, -.22, .04, 3, C.steelDark, 6);
  K.box(-2.1, .55, .21, .4, .3, .01, C.hazard);
  K.done();
}

function checkpointBarrier(view, p, g) {
  const K = kit(view, p, g);
  // A half-set crash barrier 3.4 x .8 x 1.1: a heavy plastic barrier in lemon and graphite diagonal
  // stripes on a ballast foot, two steel stanchions with reflective caps.
  K.box(0, .12, 0, 3.4, .24, .78, C.graphite);
  K.box(0, .5, 0, 3.3, .55, .5, C.hazardDark); K.box(0, .93, 0, 3.2, .3, .32, C.hazardDark);
  for (let i = 0; i < 13; i++) { K.box(-1.5 + i * .25, .6, .255, .13, .5, .01, C.hazard, [0, 0, .7]); K.box(-1.5 + i * .25, .95, .165, .11, .28, .01, C.hazard, [0, 0, .7]); }
  for (const s of [-1, 1]) { K.cyl(s * 1.55, .55, -.3, .06, 1.0, C.steelMid, 6); K.cyl(s * 1.55, 1.06, -.3, .07, .08, C.hazard, 6); K.lit(s * 1.55, 1.06, -.3, .05, .03, .05, C.litLemon, .9); }
  K.box(0, 1.09, 0, 3.2, .04, .34, C.steelDark);
  K.done();
}

function stall(view, p, g) {
  const K = kit(view, p, g);
  // A market stall 2.5 x 1.5: the counter at the front (z +.42, 1.25 high, .6 deep), a canvas back on a
  // frame (2.4 high), and the tarp over it all cantilevered from the back posts on two struts, from
  // 2.1 m up: over a body's top, so nothing walks or shoots into it (a tarp sloping down to 1.5 m at the
  // front hung .3 m past the counter's collider, in a walker's face). Goods lie low on the counter,
  // a shelf and crates at the back, a bulb string under the tarp's front edge (lit warm). Wood-look
  // frame #6b4a32, tarp blue/green/cream/red by seed.
  // (Weathered, duller tarps than the city's plastics: stage 5 review, the market's light is the colour.)
  const tarp = K.pick(['#3e5068', '#48573f', C.paper, '#6a4640']), wood = '#6b4a32';
  for (const [x, z, h] of [[-1.15, -.66, 2.4], [1.15, -.66, 2.4], [-1.15, .68, 1.3], [1.15, .68, 1.3]]) K.box(x, h / 2, z, .08, h, .08, wood);
  K.box(0, 1.24, .42, 2.4, .1, .62, C.woodPale); K.box(0, .62, .42, 2.36, 1.2, .56, tone(wood, -.2));
  for (let i = -3; i <= 3; i++) K.box(i * .33, .62, .705, .03, 1.1, .008, C.rustDark);
  K.box(0, 1.35, -.65, 2.4, 1.9, .05, tone(tarp, -.15));
  K.box(0, 2.33, -.66, 2.44, .06, .08, wood);
  // the tarp: from the back frame's top (2.46) to the front (2.2), and its valance hanging to 2.12
  // (two panels sagging a little to the middle: the fold reads in the flat shading)
  for (const side of [-1, 1]) K.box(side * .625, 2.34, 0, 1.25, .04, 1.44, tone(tarp, side * .04), [.14, 0, side * .05]);
  K.box(0, 2.16, .7, 2.5, .08, .04, tone(tarp, -.25));
  for (const s of [-1, 1]) K.box(s * 1.2, 2.17, -.33, .04, .04, .75, wood, [-.43, 0, 0]);
  // goods: trays of produce and stacked packs low on the counter, in colour blocks
  for (let i = 0; i < 3; i++) K.box(-.85 + i * .85, 1.31, .42 + (K.rand() - .5) * .1, .5 + K.rand() * .2, .04, .34, K.pick([C.plasticRed, C.plasticGreen, C.plasticYellow, C.plasticBlue]));
  for (let i = 0; i < 8; i++) K.ball(-1 + i * .28, 1.305, .4 + (K.rand() - .5) * .12, .04, K.pick(['#c23a48', '#a8ff3c', '#e8322a', '#9cc23a', '#ff5a6e']), .8);
  K.box(-.4, 1.05, -.6, 1.4, .05, .2, wood); K.box(.6, 1.35, -.6, .9, .05, .2, wood);
  for (let i = 0; i < 4; i++) K.box(-.9 + i * .3, 1.15, -.57, .16, .16, .16, K.pick([C.cardboard, C.plasticWhite, C.plasticBlue]));
  // the bulb string: under the tarp's front edge, warm bulbs
  for (let i = 0; i < 6; i++) K.lit(-1 + i * .4, 2.165 - Math.sin(i / 5 * PI) * .02, .6, .06, .05, .06, C.litWarm, 1.2);
  K.done();
}

const MODELS = { cityShelter: shelter, cityPlanter: planter, cityPlanterTall: planterTall, cityJersey: jersey, cityBollard: bollard, cityBench: bench, cityKiosk: kiosk,
  cityDumpster: dumpster, cityUtilityBox: utilityBox, cityAdPillar: adPillar, cityConstruction: construction, cityHoarding: hoarding, cityFallenPole: fallenPole,
  cityIsland: island, cityIslandScreen: islandScreen, cityScreenWall: screenWall, cityCheckpointBarrier: checkpointBarrier, cityStall: stall };
for (const [type, make] of Object.entries(MODELS)) registerLumenModel(type, make);
export const FURNITURE_MODELS = Object.freeze(Object.keys(MODELS));
