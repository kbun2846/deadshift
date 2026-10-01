// Lumen stage 5: street detail. The small things a city leaves on its
// streets when everyone runs (claude/lumen-design.md 6 "Debris", 8, 18, 18b
// "Everywhere at street level" and each district's ground detail): glass,
// paper, fliers, cans, cups, cigarette ends, burst shopping bags, umbrellas
// and shoes along the stampede, lit phones face-up, drain grates, three kinds
// of manhole, hatches, lane studs, bike rails with half-locked bikes,
// conduits and cable trays up the building bases, standpipes, gas meters,
// pavement vents, the clutter at shop backs and image-only posters. Placed
// by tools/lumen-place-detail.mjs into maps/lumen-detail.js.
//
// Types here are spread into map-kit.js PROP_TYPES (so this module must not
// import map-kit.js: a cycle); every model registers with world/lumen-props.js
// registerLumenModel(type, make) and is built with world/lumen-kit.js.
//
// No colliders. Almost every piece is walk-over clutter under 0.3 m or flat on
// a wall, so its type has `collisionBoxes: []` (walkOver, health null): on a
// flat map a round meets EVERY collider on its path (weapons/rifle.js
// roundMeets: a round has no `flight` there), so a walk-over box round a paper
// cup would stop bullets, and a box in the sidewalk's building-side 1.4 m would
// break the cover rules. The one solid kind is the bike rail (a steel rail a
// body meets, lowTop like a bench; placed by the cover rules).
//
// Drawn per preset without a program or a material of its own:
//  - tier 0 parts (the bigger pieces: grates, manholes, hatches, rails,
//    conduits, meters, posters, boxes at the shop backs) stay in the prop's
//    group and merge into the static cell batches like any solid scenery
//    (0 draws);
//  - finer parts are tagged with a tier (1 Performance, 2 Balanced, 3 Quality,
//    4 Extreme) and moved by the `detail` city system (render/city-detail.js)
//    into one merged mesh per preset step and material (the whole map), on the static batch's
//    own 'plain' material and the lit-part material (world/lumen-glow.js);
//    setQuality shows the step's meshes: a preset draws its tiers and every
//    tier under it: two draws (Performance up), wherever you stand.
// Nothing moves and nothing runs per frame.
import { registerLumenModel } from './lumen-props.js';
import { kit, frontFace, FLAT_PART, CITY as C } from './lumen-kit.js';
import { claimDetail, CITY_DETAIL } from '../render/city-detail.js'; // (the tiers' system; registers itself with the hub)

const PI = Math.PI;

// The tier each preset draws up to (a part tagged tier t shows from the
// preset whose step is t). Extreme is Quality plus, never minus.
export const DETAIL_STEPS = CITY_DETAIL.steps;

// Colours of the clutter (never within 15 CIEDE2000 of Amber #ffb020, Cyan
// #2ee6ff or Violet #b77bff: the test measures them; lit colours at their glow).
export const DETAIL_COLOURS = Object.freeze({
  paper: '#b8b0a0', paperGrey: '#98948a', paperWet: '#6f6b63', white: '#c3c4c0', card: '#7d6a4f', cardDark: '#5f5039', cardWet: '#4d4337',
  // Fliers and posters: colour blocks (no letters), the city's brands in muted print.
  ink: Object.freeze(['#a8386a', '#8c2a36', '#34508c', '#b5ad48', '#3a7a56', '#1d1f25', '#c9c6bd', '#2e6f73', '#6b3a78', '#c46a4a']),
  can: Object.freeze(['#8a2f3a', '#3a5a8c', '#9aa2ab', '#3a6a52', '#22252b', '#b6b9bf', '#7a6a2e']),
  fruit: Object.freeze(['#b0572a', '#7e2328', '#5c7a34', '#b8b23e']),
  canopy: Object.freeze(['#1c1e24', '#1f2a44', '#7a2430', '#5e6e80', '#2f5a44', '#6a2e4c', '#3a3d44']),
  shoe: Object.freeze(['#c4c4c0', '#1d1f24', '#4a3a2c', '#3a4a6a', '#6a2430']),
  cloth: Object.freeze(['#2b3242', '#4a2e30', '#39433a', '#5a5048', '#23262d', '#5e3f52']),
  iron: '#1c1e23', ironRim: '#464951', ironRidge: '#2d3037', steel: '#5a6068', steelLight: '#7c838c', plate: '#4b5058',
  glass: '#a6b4b0', glassDark: '#4f6275', bag: '#1c1e22', bagGrey: '#2b2d31', bagBlue: '#2b3b55', rubber: '#15171b',
  meter: '#858b83', gasPipe: '#9a923e', fireRed: '#7a2a2a', brass: '#7a6a4a', conduit: '#6a6e76', conduitDark: '#4a4e55', cable: '#1c1e24',
  wood: '#6a5a44', woodDark: '#4e4232', phone: '#15171c', filter: '#a88a64', butt: '#d0cec8', ash: '#5a5a58',
});
const K = DETAIL_COLOURS;

// A flat, walk-over piece: no collider (see the header). `w`, `d` its
// footprint (m), `top` its highest point.
const flat = (w, d) => ({ w, d, health: null, walkOver: true, collisionBoxes: [] });
// A wall piece: `w` along the wall, `d` out from it (its back at local z = -d/2).
const onWall = (w, d) => ({ w, d, health: null, walkOver: true, collisionBoxes: [] });

// Where the generator (tools/lumen-place-detail.mjs) may put each type:
//   gutter  the roadway's 0.15-0.7 m along a kerb;  lane  a traffic lane (manholes, studs);
//   kerb    the sidewalk's kerb-side band;          walk  anywhere on a sidewalk's outer part, plazas, lots;
//   wall    on a building's street-level wall (seen from the camera's side);
//   back    on the ground against a wall at a shop's back (the alley, the courtyard, lots);
//   crash   round a wreck;  stampede  along the run to the metro;  puddle  at a standing puddle's edge;
//   drain   on a storm drain (effects/lumen-water-places.js);  rail  a solid bike rail at the kerb.
// `tier` the lowest tier its main part shows at (0 = every preset, Potato too).
const INFO = {}, TYPES = {}, MODELS = {};
function type(name, spec, info, make) { TYPES[name] = Object.freeze(spec); INFO[name] = Object.freeze(info); MODELS[name] = make; }

// ---------------------------------------------------------------------------
// The detail builder: kit() (world/lumen-kit.js) with a tier on every part.
// Registers the prop's group so the detail system finds its tiered parts.
export const detailOff = () => !!(typeof globalThis.location !== 'undefined' && globalThis.location?.search && /[?&]detail=0\b/.test(globalThis.location.search));
function builder(view, p, g) {
  const B = kit(view, p, g);
  claimDetail(view, g);
  // (Tilts are the part's own and the turn is last: rotation order YXZ, so [tilt x, turn, tilt z] lies as written.)
  const tag = (m, tier, shadow = false) => { m.rotation.order = 'YXZ'; if (tier) m.userData.lumenDetailTier = Math.min(CITY_DETAIL.top, tier); m.castShadow = !tier && shadow; return m; };
  // (A wall piece's boards as thin as FLAT_PART.height, facing out of the wall: their front face alone.)
  const onWall = INFO[p.type]?.spot === 'wall' || INFO[p.type]?.spot === 'door';
  const board = (d, rot) => onWall && d <= FLAT_PART.height && (!rot || (Math.abs(rot[0] || 0) <= FLAT_PART.tilt && Math.abs(rot[1] || 0) <= FLAT_PART.tilt));
  const D = {
    rand: B.rand, pick: B.pick, range: (a, b) => a + B.rand() * (b - a),
    box: (t, x, y, z, w, h, d, c, rot, shadow) => tag(board(d, rot) ? B.mesh(frontFace(w, h, d), c, x, y, z, rot) : B.box(x, y, z, w, h, d, c, rot), t, shadow),
    cyl: (t, x, y, z, r, h, c, seg = 6, top = r, rot, shadow) => tag(B.cyl(x, y, z, r, h, c, seg, top, rot), t, shadow),
    ball: (t, x, y, z, r, c, sy = 1, sx = 1, sz = 1, rot) => tag(B.ball(x, y, z, r, c, sy, sx, sz, rot), t),
    // A lit part: never on Potato (it would be a draw of the lit material in a cell with none).
    lit: (t, x, y, z, w, h, d, c, strength = 1, rot) => tag(B.lit(x, y, z, w, h, d, c, strength, rot), Math.max(1, t)),
    // A sheet lying on the ground (turned by `turn`, tipped a little), its top at about `y`.
    sheet: (t, x, z, w, d, c, turn = 0, y = .007, tip = .04) => tag(B.box(x, y, z, w, .006, d, c, [(B.rand() - .5) * tip, turn, (B.rand() - .5) * tip]), t),
  };
  return D;
}

// ---------------------------------------------------------------------------
// Little things, reused by the pieces (each in the piece's own frame).
function can(D, t, x, z, turn, colour, standing = false) {
  if (standing) { D.cyl(t, x, .06, z, .033, .12, colour, 6); D.cyl(t + 1, x, .121, z, .03, .004, K.steelLight, 6); return; }
  D.cyl(t, x, .033, z, .033, .12, colour, 6, .033, [0, turn, PI / 2]);
}
function crushedCan(D, t, x, z, turn, colour) { D.box(t, x, .012, z, .11, .024, .07, colour, [0, turn, .15]); D.box(t + 1, x + .03, .02, z, .03, .02, .075, K.steelLight, [0, turn, 0]); }
function cup(D, t, x, z, turn, lying = true) {
  if (lying) { D.cyl(t, x, .045, z, .04, .12, K.white, 6, .05, [0, turn, PI / 2]); D.cyl(t + 1, x, .046, z, .046, .035, K.card, 6, .05, [0, turn, PI / 2]); }
  else { D.cyl(t, x, .06, z, .04, .12, K.white, 6, .05); D.cyl(t + 1, x, .122, z, .052, .01, C.graphite, 6); }
}
function butts(D, t, x, z, n, spread) {
  for (let i = 0; i < n; i++) {
    const bx = x + (D.rand() - .5) * spread, bz = z + (D.rand() - .5) * spread, turn = D.rand() * PI;
    D.box(t, bx, .007, bz, .05, .012, .012, K.butt, [0, turn, 0]);
    D.box(t + (i % 2), bx + Math.cos(turn) * .03, .007, bz - Math.sin(turn) * .03, .018, .013, .013, K.filter, [0, turn, 0]);
  }
}
function shards(D, t, x, z, n, spread, big = .12) {
  for (let i = 0; i < n; i++) {
    const s = big * (.35 + D.rand() * .65);
    D.box(t + (i % 3 === 2 ? 1 : 0), x + (D.rand() - .5) * spread, .005, z + (D.rand() - .5) * spread * .8, s, .008, s * (.4 + D.rand() * .5), i % 4 === 3 ? K.glassDark : K.glass, [0, D.rand() * PI, 0]);
  }
}
// A glint: a tiny lit chip the street's lights catch (the lit material).
function glint(D, t, x, z) { D.lit(t, x, .01, z, .035, .004, .02, '#dfe8f5', .55, [0, D.rand() * PI, 0]); }
function flier(D, t, x, z, w, d, turn) {
  const [a, b, c] = [D.pick(K.ink), D.pick(K.ink), D.pick(K.ink)];
  D.sheet(t, x, z, w, d, D.pick([K.white, K.paper, a]), turn);
  // Colour blocks only: a band and a disc-like square (no letters).
  const cs = Math.cos(turn), sn = Math.sin(turn), off = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
  let [bx, bz] = off(0, -d * .2); D.box(t + 1, bx, .011, bz, w * .8, .003, d * .3, b, [0, turn, 0]);
  [bx, bz] = off(w * .2, d * .2); D.box(t + 1, bx, .011, bz, w * .3, .003, w * .3, c, [0, turn + .78, 0]);
}
function paper(D, t, x, z, turn, colour = D.pick([K.paper, K.paperGrey, K.white])) {
  D.sheet(t, x, z, .21, .29, colour, turn);
  if (D.rand() < .5) D.box(t + 1, x + .05, .03, z + .04, .12, .02, .1, colour, [.3, turn + .4, .2]); // a crumpled fold
}
function wad(D, t, x, z, c = K.paper) { D.ball(t, x, .035, z, .05, c, .7, 1, 1, [D.rand(), D.rand() * PI, 0]); }
function wrapper(D, t, x, z, turn) { D.box(t, x, .008, z, .14, .012, .07, D.pick(['#9aa2ab', '#b6b9bf', '#8a2f3a', '#3a5a8c']), [.1, turn, .08]); }
function fruit(D, t, x, z, c) { D.ball(t, x, .035, z, .038, c, .95); }
function shoe(D, t, x, z, turn, colour, onSide = false) {
  // In the shoe's own frame (x heel to toe), turned by `turn`; on its side it rolls about its length.
  const cs = Math.cos(turn), sn = Math.sin(turn), at = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
  const tip = [onSide ? PI / 2 - .12 : 0, turn, 0];
  let [a, b] = at(0, 0); D.box(t, a, onSide ? .052 : .025, b, .27, .05, .1, K.white, tip);          // the sole
  [a, b] = at(-.03, onSide ? -.05 : 0); D.box(t, a, onSide ? .05 : .07, b, .2, onSide ? .08 : .07, onSide ? .06 : .09, colour, tip); // the upper
  [a, b] = at(.09, onSide ? -.035 : 0); D.box(t + 1, a, onSide ? .05 : .055, b, .08, .06, .06, colour, tip); // the toe
}

// ---------------------------------------------------------------------------
// Glass, paper, fliers, cans, cups, butts.
type('cityDGlass', flat(.9, .7), { spot: 'crash', tier: 1 }, (view, p, g) => {
  const D = builder(view, p, g); shards(D, 1, 0, 0, 9, .75, .1); glint(D, 2, .12, .08); glint(D, 3, -.2, -.1);
});
type('cityDGlassFan', flat(1.8, 1.2), { spot: 'crash', tier: 1 }, (view, p, g) => {
  // A fan of glass off a burst window: thick at one end, thinning out.
  const D = builder(view, p, g);
  for (let i = 0; i < 16; i++) { const u = D.rand(); shards(D, 1, -.8 + u * 1.5, (D.rand() - .5) * (.3 + u * .8), 1, .05, .16 * (1 - u * .6)); }
  for (let i = 0; i < 4; i++) glint(D, 2 + (i % 2), -.6 + D.rand() * 1.3, (D.rand() - .5) * .9);
  D.box(0, -.72, .012, -.1, .3, .024, .22, K.glassDark, [0, .4, .05]); // one big piece (every preset)
});
type('cityDBottle', flat(.5, .4), { spot: 'litter', tier: 2 }, (view, p, g) => {
  const D = builder(view, p, g), c = D.pick(['#2f4a36', '#4a3a26', '#5a6a66']);
  D.cyl(2, -.05, .035, 0, .035, .2, c, 6, .035, [0, .3, PI / 2]); D.cyl(2, .1, .03, -.04, .015, .08, c, 5, .015, [0, .3, PI / 2]);
  shards(D, 3, .14, .05, 4, .2, .05);
});
type('cityDPaper', flat(.8, .6), { spot: 'litter', tier: 1 }, (view, p, g) => {
  const D = builder(view, p, g); for (let i = 0; i < 3; i++) paper(D, i ? 2 : 1, (D.rand() - .5) * .45, (D.rand() - .5) * .3, D.rand() * PI);
  wad(D, 2, .25, .15);
});
type('cityDPaperWet', flat(.7, .5), { spot: 'gutter', tier: 1 }, (view, p, g) => {
  const D = builder(view, p, g); D.sheet(1, 0, 0, .4, .3, K.paperWet, D.rand() * PI, .004, .02); D.sheet(2, .12, .08, .22, .2, K.paperGrey, D.rand() * PI, .007, .02); wad(D, 3, -.2, -.1, K.paperWet);
});
type('cityDFlier', flat(.6, .5), { spot: 'litter', tier: 1 }, (view, p, g) => {
  const D = builder(view, p, g); flier(D, 1, 0, 0, .22, .3, D.rand() * PI); if (D.rand() < .6) flier(D, 2, .16, .1, .22, .3, D.rand() * PI);
});
type('cityDFlierDrift', flat(1.6, .6), { spot: 'gutter', tier: 1 }, (view, p, g) => {
  // Fliers washed into a drift along the kerb (local -z is the kerb side).
  const D = builder(view, p, g);
  for (let i = 0; i < 7; i++) flier(D, i < 3 ? 1 : 2, -.65 + i * .21 + (D.rand() - .5) * .08, -.12 + (D.rand() - .5) * .18, .22, .3, D.rand() * PI);
  paper(D, 2, .3, .1, D.rand() * PI); wad(D, 3, -.4, .1);
});
type('cityDCans', flat(.6, .5), { spot: 'litter', tier: 1 }, (view, p, g) => {
  const D = builder(view, p, g); can(D, 1, 0, 0, D.rand() * PI, D.pick(K.can)); can(D, 2, .18, .12, D.rand() * PI, D.pick(K.can), true); crushedCan(D, 2, -.18, .1, D.rand() * PI, D.pick(K.can));
});
type('cityDCanCrushed', flat(.4, .3), { spot: 'gutter', tier: 2 }, (view, p, g) => {
  const D = builder(view, p, g); crushedCan(D, 2, 0, 0, D.rand() * PI, D.pick(K.can)); crushedCan(D, 3, .12, .06, D.rand() * PI, D.pick(K.can));
});
type('cityDCup', flat(.5, .4), { spot: 'litter', tier: 1 }, (view, p, g) => {
  const D = builder(view, p, g); cup(D, 1, 0, 0, D.rand() * PI); D.cyl(2, .13, .006, .1, .052, .01, C.graphite, 6); // its lid, off
  D.cyl(3, -.1, .006, .12, .004, .16, D.pick(['#c3c4c0', '#8a2f3a']), 4, .004, [0, D.rand() * PI, PI / 2]); // the straw
});
type('cityDCupSpill', flat(.8, .6), { spot: 'litter', tier: 2 }, (view, p, g) => {
  const D = builder(view, p, g); cup(D, 2, -.15, 0, D.rand() * PI);
  D.box(2, .15, .002, .05, .45, .003, .3, '#2a221c', [0, D.rand() * PI, 0]); D.box(3, .2, .003, .12, .2, .003, .16, '#3a2e24', [0, D.rand() * PI, 0]); // the coffee, soaked in
});
type('cityDButts', flat(.5, .4), { spot: 'kerb', tier: 2 }, (view, p, g) => {
  const D = builder(view, p, g); butts(D, 2, 0, 0, 6, .38); D.box(3, .05, .002, .02, .16, .003, .12, K.ash, [0, D.rand() * PI, 0]); butts(D, 4, .1, -.05, 4, .3);
});
type('cityDWrappers', flat(.6, .5), { spot: 'litter', tier: 2 }, (view, p, g) => {
  const D = builder(view, p, g); for (let i = 0; i < 3; i++) wrapper(D, 2 + (i === 2 ? 1 : 0), (D.rand() - .5) * .45, (D.rand() - .5) * .35, D.rand() * PI); wad(D, 3, .2, -.12, '#b6b9bf');
});
type('cityDNoodleBox', flat(.6, .5), { spot: 'litter', tier: 1 }, (view, p, g) => {
  const D = builder(view, p, g), turn = D.rand() * PI;
  D.box(1, 0, .05, 0, .12, .1, .1, K.white, [0, turn, PI / 2 - .1]); D.box(2, .06, .1, 0, .03, .01, .1, '#8a2f3a', [0, turn, PI / 2 - .1]);
  for (let i = 0; i < 5; i++) D.box(3, .12 + D.rand() * .15, .005, (D.rand() - .5) * .15, .12, .006, .012, '#c9b98a', [0, D.rand() * PI, 0]); // noodles
  for (const s of [-1, 1]) D.box(2, -.15, .006, s * .03 + .1, .2, .008, .008, C.woodPale, [0, turn + s * .1, 0]); // chopsticks
});
type('cityDTickets', flat(.7, .5), { spot: 'stampede', tier: 2 }, (view, p, g) => {
  const D = builder(view, p, g); for (let i = 0; i < 6; i++) D.sheet(2 + (i > 3 ? 1 : 0), (D.rand() - .5) * .55, (D.rand() - .5) * .38, .06, .09, D.pick(['#c9c6bd', '#b5ad48', '#34508c']), D.rand() * PI, .005, .02);
});

// ---------------------------------------------------------------------------
// The stampede: bags, umbrellas, shoes, phones, what people dropped.
type('cityDBagBurst', flat(1.1, .8), { spot: 'stampede', tier: 1 }, (view, p, g) => {
  // A shopping bag split open, fruit rolled out in a line (toward local +x: the way it rolled).
  const D = builder(view, p, g), bag = D.pick(['#c3c4c0', '#6a8a5a', '#a8386a', '#2b3b55']);
  D.box(1, -.35, .068, 0, .3, .1, .22, bag, [0, .2, .15]); D.box(2, -.2, .05, .02, .18, .03, .2, bag, [0, -.3, .5]);
  for (let i = 0; i < 6; i++) fruit(D, i < 2 ? 1 : 2 + (i % 2), -.15 + i * .12 + D.rand() * .08, (D.rand() - .5) * .45, D.pick(K.fruit));
  D.box(3, .3, .004, .2, .08, .006, .05, '#5c7a34', [0, D.rand() * PI, 0]); // a squashed one
});
type('cityDBagBoxes', flat(1, .8), { spot: 'stampede', tier: 1 }, (view, p, g) => {
  const D = builder(view, p, g);
  D.box(1, -.3, .075, -.1, .32, .1, .24, K.white, [0, .3, .2]);
  D.box(1, .1, .045, .05, .16, .09, .12, K.white, [0, D.rand() * PI, 0]); D.box(2, .1, .09, .05, .17, .006, .13, '#b8b0a0', [0, D.rand() * PI, 0]);
  D.box(2, .32, .07, -.2, .14, .08, .1, '#8a2f3a', [0, D.rand() * PI, PI / 2]);
  for (let i = 0; i < 3; i++) D.box(3, (D.rand() - .2) * .5, .006, (D.rand() - .5) * .5, .08, .008, .04, '#c9b98a', [0, D.rand() * PI, 0]);
});
type('cityDBagTipped', flat(.8, .6), { spot: 'litter', tier: 1 }, (view, p, g) => {
  const D = builder(view, p, g); D.ball(1, -.15, .08, 0, .16, D.pick([K.white, '#2b3b55', '#3a6a52']), .5, 1.2, .9);
  can(D, 2, .15, .05, D.rand() * PI, D.pick(K.can)); can(D, 2, .25, -.1, D.rand() * PI, D.pick(K.can)); wrapper(D, 3, .05, .18, D.rand());
});
function umbrellaOpen(D, t, colour) {
  // Upside down on its canopy (a shallow eight-sided dome), handle up and over.
  D.cyl(t, 0, .09, 0, .1, .16, colour, 8, .46, [PI, 0, 0]);
  D.cyl(t, 0, .005, 0, .03, .01, colour, 6);
  for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; D.box(t + 1, Math.cos(a) * .44, .168, Math.sin(a) * .44, .03, .015, .03, C.steelDark); }
  D.cyl(t, .1, .2, 0, .012, .5, C.graphite, 5, .012, [0, 0, 1.2]); D.box(t + 1, .33, .24, 0, .08, .03, .03, C.black);
}
type('cityDUmbrellaOpen', flat(1, 1), { spot: 'stampede', tier: 0 }, (view, p, g) => { const D = builder(view, p, g); umbrellaOpen(D, 0, D.pick(K.canopy)); });
type('cityDUmbrellaClosed', flat(.9, .3), { spot: 'stampede', tier: 0 }, (view, p, g) => {
  const D = builder(view, p, g), c = D.pick(K.canopy);
  D.cyl(0, 0, .04, 0, .04, .6, c, 6, .012, [0, 0, PI / 2]); D.cyl(2, .34, .03, 0, .01, .1, C.graphite, 4, .01, [0, 0, PI / 2]);
  D.box(2, -.36, .03, .03, .06, .04, .07, C.black); D.box(3, .05, .045, .03, .05, .03, .03, c);
});
type('cityDUmbrellaBroken', flat(1, .9), { spot: 'stampede', tier: 0 }, (view, p, g) => {
  // Blown inside out: the canopy up as a cup, ribs bent out of it, a panel torn.
  const D = builder(view, p, g), c = D.pick(K.canopy);
  D.cyl(0, 0, .15, 0, .38, .12, c, 8, .12, [.18, 0, .1]);
  for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2 + .3 + (D.rand() - .5) * .5; D.box(2, Math.cos(a) * .36, .19, Math.sin(a) * .33, .3, .012, .012, C.steelDark, [0, -a, .3 + D.rand() * .2]); }
  D.cyl(1, -.1, .03, .1, .012, .7, C.graphite, 5, .012, [0, .5, PI / 2]); D.box(3, .3, .01, -.3, .2, .01, .14, c, [0, 1, .1]);
});
type('cityDShoe', flat(.4, .3), { spot: 'stampede', tier: 1 }, (view, p, g) => { const D = builder(view, p, g); shoe(D, 1, 0, 0, D.rand() * PI, D.pick(K.shoe), D.rand() < .4); });
type('cityDShoeHeel', flat(.35, .25), { spot: 'stampede', tier: 1 }, (view, p, g) => {
  // A dropped high heel on its side (Velvet Row, the stampede).
  const D = builder(view, p, g), c = D.pick(['#7a1f2c', '#1d1f24', '#b8a898', '#6a2e4c']), turn = D.rand() * PI;
  D.box(1, 0, .035, 0, .22, .03, .07, c, [PI / 2 - .2, turn, 0]); D.box(1, -.1, .07, 0, .012, .012, .1, c, [0, turn, 0]);
  D.box(2, .06, .05, 0, .09, .06, .07, c, [PI / 2 - .2, turn, .2]);
});
type('cityDShoeWork', flat(.4, .3), { spot: 'stampede', tier: 1 }, (view, p, g) => {
  const D = builder(view, p, g), turn = D.rand() * PI; shoe(D, 1, 0, 0, turn, D.pick(['#2a2420', '#4a3a2c', '#1d1f24']));
  D.box(2, -.14, .01, .08, .08, .012, .04, '#2a2420', [0, turn + .5, 0]); // a lace torn off
});
function phone(D, t, x, z, turn, cracked) {
  D.box(t, x, .006, z, .085, .012, .16, K.phone, [0, turn, 0]);
  // The lit screen: a pale glow and a brighter bar across its top (no text: blocks of light).
  D.lit(t, x, .0125, z, .075, .002, .145, cracked ? '#8ea6d8' : '#cfdcff', cracked ? .45 : .75, [0, turn, 0]);
  const cs = Math.cos(turn), sn = Math.sin(turn);
  D.lit(t + 1, x - sn * .05, .0135, z - cs * .05, .06, .002, .02, '#e6f0ff', 1.05, [0, turn, 0]);
  if (cracked) for (let i = 0; i < 3; i++) D.box(t + 1, x + (D.rand() - .5) * .04, .0145, z + (D.rand() - .5) * .1, .09, .002, .004, '#2a3040', [0, turn + (D.rand() - .5) * 2, 0]);
}
type('cityDPhone', flat(.3, .3), { spot: 'stampede', tier: 1 }, (view, p, g) => { const D = builder(view, p, g); phone(D, 1, 0, 0, D.rand() * PI, false); });
type('cityDPhoneCracked', flat(.4, .4), { spot: 'stampede', tier: 1 }, (view, p, g) => {
  const D = builder(view, p, g); phone(D, 1, 0, 0, D.rand() * PI, true); shards(D, 3, .1, .1, 3, .15, .03);
});
type('cityDBackpack', flat(.7, .5), { spot: 'stampede', tier: 1 }, (view, p, g) => {
  const D = builder(view, p, g), c = D.pick(K.cloth), turn = D.rand() * PI;
  D.box(1, 0, .09, 0, .42, .18, .3, c, [0, turn, 0]); D.box(2, .02, .19, 0, .3, .03, .26, c, [0, turn, 0]);
  D.box(2, -.24, .06, 0, .1, .1, .22, c, [0, turn, .2]);
  for (const s of [-1, 1]) D.box(2, .1, .02, s * .1, .36, .02, .05, C.black, [0, turn, 0]); // the straps, splayed
});
type('cityDHandbag', flat(.7, .5), { spot: 'stampede', tier: 1 }, (view, p, g) => {
  const D = builder(view, p, g), c = D.pick(['#4a2e30', '#1d1f24', '#b8a898', '#6a2430']);
  D.box(1, -.15, .075, 0, .28, .12, .11, c, [.25, 0, 0]);
  D.box(2, -.1, .005, .15, .3, .01, .015, c, [0, .2, 0]);
  D.box(2, .12, .012, .02, .1, .02, .07, '#1d1f24', [0, D.rand() * PI, 0]); // a purse
  D.box(3, .22, .01, -.12, .08, .015, .02, '#8a2f3a', [0, D.rand() * PI, 0]); D.box(3, .05, .01, -.15, .09, .012, .06, '#c3c4c0', [0, D.rand() * PI, 0]);
});
type('cityDBriefcase', flat(.9, .7), { spot: 'stampede', tier: 1 }, (view, p, g) => {
  const D = builder(view, p, g), turn = 0;
  D.box(1, -.2, .04, .12, .45, .08, .3, '#23262d', [0, turn, 0]); D.box(1, -.2, .03, -.2, .45, .06, .28, '#23262d', [0, turn, 0]); D.box(2, -.2, .065, -.2, .4, .004, .25, '#3a2e2a', [0, turn, 0]); // lid flung open, its lining up
  for (let i = 0; i < 4; i++) paper(D, 2, .08 + D.rand() * .15, (D.rand() - .5) * .3, D.rand() * PI, K.white);
});
type('cityDJacket', flat(1, .7), { spot: 'stampede', tier: 1 }, (view, p, g) => {
  // A jacket dropped flat (thin: never a body's shape or colour of a coat).
  const D = builder(view, p, g), c = D.pick(K.cloth);
  D.box(1, 0, .02, 0, .5, .035, .4, c, [0, D.rand() * .5, 0]);
  D.box(1, .35, .015, .1, .34, .03, .12, c, [0, .6, 0]); D.box(2, -.33, .015, -.12, .3, .03, .12, c, [0, -.9, 0]);
  D.box(2, .05, .04, .02, .3, .008, .02, C.steelMid, [0, .1, 0]);
});
type('cityDToy', flat(.4, .3), { spot: 'stampede', tier: 2 }, (view, p, g) => {
  const D = builder(view, p, g), c = D.pick(['#b8a898', '#5e6e80', '#8a5a4a']);
  D.ball(2, 0, .06, 0, .07, c, .8); D.ball(2, .1, .05, .02, .05, c); for (const s of [-1, 1]) D.ball(3, .14, .09, s * .03, .02, c);
});
type('cityDGlasses', flat(.25, .2), { spot: 'stampede', tier: 3 }, (view, p, g) => {
  const D = builder(view, p, g), turn = D.rand() * PI;
  for (const s of [-1, 1]) { D.box(3, s * .035, .006, 0, .05, .006, .035, '#1d1f24', [0, turn, 0]); D.lit(3, s * .035, .0095, 0, .04, .001, .025, '#9fb4d0', .3, [0, turn, 0]); }
  D.box(4, .08, .005, .04, .08, .005, .005, '#1d1f24', [0, turn + .8, 0]);
});
type('cityDKeys', flat(.2, .2), { spot: 'stampede', tier: 3 }, (view, p, g) => {
  const D = builder(view, p, g); D.cyl(3, 0, .004, 0, .02, .006, K.steelLight, 6); for (let i = 0; i < 3; i++) D.box(3, .03 + i * .01, .005, (i - 1) * .015, .05, .004, .012, i === 1 ? C.steel : '#9a8a5a', [0, (i - 1) * .4, 0]);
  D.box(4, -.05, .004, .02, .08, .003, .02, '#8a2f3a', [0, .3, 0]);
});

// ---------------------------------------------------------------------------
// The street's own fittings: drains, manholes, hatches, studs, vents.
type('cityDDrain', flat(.9, .45), { spot: 'drain', tier: 0 }, (view, p, g) => {
  // A kerb-side storm grate (local -z to the kerb): an iron frame and bars across the flow.
  const D = builder(view, p, g);
  D.box(0, 0, .008, 0, .9, .016, .45, K.ironRim); D.box(0, 0, .012, 0, .8, .012, .36, K.iron);
  for (let i = 0; i < 7; i++) D.box(i % 2 ? 1 : 0, -.33 + i * .11, .016, 0, .035, .01, .36, K.ironRidge);
  D.box(2, 0, .017, -.2, .88, .006, .03, '#2a2b2e'); D.box(3, .2, .018, .05, .1, .004, .07, K.paperWet, [0, .4, 0]); // silt, a sodden scrap
});
type('cityDDrainKerb', flat(1.2, .5), { spot: 'gutter', tier: 0 }, (view, p, g) => {
  // A kerb inlet: the slot under the kerb stone and its apron, a lip of grit.
  const D = builder(view, p, g);
  D.box(0, 0, .007, -.12, 1.1, .014, .24, K.ironRim); D.box(0, 0, .01, -.2, .95, .01, .06, '#101114');
  D.box(1, 0, .012, .02, 1, .006, .08, '#35363a'); D.box(2, .3, .015, -.05, .12, .012, .08, D.pick(K.can), [0, .5, .2]);
});
function disc(D, t, r, colour, y = .012, seg = 10) { D.cyl(t, 0, y / 2, 0, r, y, colour, seg); }
type('cityDManholeRound', flat(1, 1), { spot: 'lane', tier: 0 }, (view, p, g) => {
  // Type 1: a plain round cover, raised rings and a pick hole.
  const D = builder(view, p, g);
  disc(D, 0, .47, K.ironRim, .014); disc(D, 0, .41, K.iron, .018);
  for (const r of [.31, .19]) D.cyl(1, 0, .02, 0, r, .006, K.ironRidge, 10, r);
  D.cyl(0, 0, .021, 0, .07, .006, K.ironRidge, 8); D.box(2, .28, .021, 0, .06, .004, .025, '#0d0e10');
});
type('cityDManholeSquare', flat(.9, .9), { spot: 'lane', tier: 0 }, (view, p, g) => {
  // Type 2: a square cover in a frame, diamond ridges.
  const D = builder(view, p, g);
  D.box(0, 0, .007, 0, .86, .014, .86, K.ironRim); D.box(0, 0, .011, 0, .74, .014, .74, K.iron);
  for (let i = -2; i <= 2; i++) D.box(i % 2 ? 1 : 0, i * .13, .019, 0, .02, .006, .68, K.ironRidge, [0, .78, 0]);
  for (let i = -2; i <= 2; i++) D.box(1, 0, .019, i * .13, .68, .006, .02, K.ironRidge, [0, .78, 0]);
});
type('cityDManholeVent', flat(1, 1), { spot: 'lane', tier: 0 }, (view, p, g) => {
  // Type 3: a vented cover: a ring of slots and a hex boss (the old service tunnels).
  const D = builder(view, p, g);
  disc(D, 0, .46, K.ironRim, .014); disc(D, 0, .4, '#24262b', .018);
  for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2; D.box(i % 2, Math.cos(a) * .28, .02, Math.sin(a) * .28, .12, .006, .035, '#0d0e10', [0, -a, 0]); }
  D.cyl(0, 0, .022, 0, .1, .008, K.ironRidge, 6); D.cyl(2, 0, .024, 0, .05, .006, K.iron, 6);
});
type('cityDHatch', flat(1.3, .8), { spot: 'walk', tier: 0 }, (view, p, g) => {
  // A double-leaf steel utility hatch flush in the paving, hinges and a lifting slot.
  const D = builder(view, p, g);
  D.box(0, 0, .006, 0, 1.3, .012, .8, K.steelLight); for (const s of [-1, 1]) D.box(0, s * .31, .01, 0, .6, .012, .7, K.plate);
  for (const s of [-1, 1]) for (const z of [-.25, .25]) D.box(1, s * .6, .016, z, .05, .008, .1, K.steel);
  D.box(1, 0, .016, 0, .02, .006, .6, '#2b2e36'); D.box(2, .2, .017, .2, .1, .004, .03, '#15171b');
});
type('cityDValveLid', flat(.35, .35), { spot: 'walk', tier: 0 }, (view, p, g) => {
  const D = builder(view, p, g); D.box(0, 0, .007, 0, .32, .014, .32, K.ironRim); D.box(0, 0, .01, 0, .24, .012, .24, K.iron); D.box(1, 0, .016, 0, .12, .004, .03, K.ironRidge);
});
type('cityDExhaustVent', flat(1.2, .7), { spot: 'kerb', tier: 0 }, (view, p, g) => {
  // A pavement vent over the subway's air: a low grille box, slats, stained round.
  const D = builder(view, p, g);
  D.box(0, 0, .05, 0, 1.2, .1, .7, K.steel, undefined, true); D.box(0, 0, .101, 0, 1.1, .004, .6, '#141518');
  for (let i = 0; i < 9; i++) D.box(i % 2 ? 1 : 0, -.48 + i * .12, .108, 0, .04, .012, .6, K.steelLight);
  D.box(2, 0, .003, 0, 1.3, .004, .8, '#26282c');
});
function studRow(D, n, span, colour, strength) {
  for (let i = 0; i < n; i++) {
    const x = -span / 2 + (n > 1 ? i * span / (n - 1) : span / 2);
    D.box(1, x, .012, 0, .1, .024, .1, '#8a8d93'); D.lit(1, x, .02, .052, .07, .012, .006, colour, strength);
  }
}
type('cityDStuds', flat(6, .2), { spot: 'lane', tier: 1 }, (view, p, g) => { const D = builder(view, p, g); studRow(D, 3, 5.6, '#e6f0ff', .55); });
type('cityDStudsLemon', flat(6, .2), { spot: 'lane', tier: 1 }, (view, p, g) => { const D = builder(view, p, g); studRow(D, 3, 5.6, '#fcee0a', .45); });
type('cityDStudsRed', flat(4, .2), { spot: 'lane', tier: 1 }, (view, p, g) => { const D = builder(view, p, g); studRow(D, 2, 3.6, '#ff3040', .45); });

// ---------------------------------------------------------------------------
// The one solid kind: a steel bike rail at the kerb with what was left
// locked to it. Local x along the kerb; lowTop (a round flies over, a body
// meets it, like a bench); placed by the cover rules.
function railFrame(D) {
  for (const x of [-1, 0, 1]) { D.box(0, x - .22, .45, 0, .05, .9, .05, K.steelLight, undefined, true); D.box(0, x + .22, .45, 0, .05, .9, .05, K.steelLight, undefined, true); D.box(0, x, .88, 0, .49, .05, .05, K.steelLight, undefined, true); }
  for (const x of [-1, 0, 1]) D.box(1, x, .01, 0, .56, .02, .1, K.steel);
}
function lockedBike(D, x, z, colour, stripped) {
  // A bike along the rail (on its far side, local +z), locked by its frame; the wheels are
  // flat boxes seen from above (a ring each), a stripped one has lost its front wheel and saddle.
  for (const s of stripped ? [-1] : [-1, 1]) { D.cyl(0, x + s * .5, .33, z, .33, .04, K.rubber, 8, .33, [PI / 2, 0, 0]); D.cyl(1, x + s * .5, .33, z, .06, .05, C.steelMid, 6, .06, [PI / 2, 0, 0]); }
  D.box(0, x, .5, z, .9, .04, .04, colour, [0, 0, -.2]); D.box(0, x - .12, .42, z, .04, .4, .04, colour, [0, 0, .3]); D.box(0, x + .3, .55, z, .04, .4, .04, colour, [0, 0, -.25]);
  if (!stripped) D.box(1, x - .18, .68, z, .2, .04, .08, C.black);
  D.box(1, x + .38, .78, z, .04, .04, .4, C.graphite); // bars
  D.box(1, x, .45, z - .15, .06, .1, .18, '#2a2b2e'); // the lock, round the rail
}
type('cityDBikeRail', { w: 2.6, d: .9, health: null, lowTop: true, collisionBoxes: [[0, 0, 2.6, .9, .95]] }, { spot: 'rail', tier: 0 }, (view, p, g) => {
  const D = builder(view, p, g); railFrame(D);
  lockedBike(D, -.55, .25, D.pick(['#2b4058', '#6a2a2a', '#2e3a30', '#1c1e24']), false);
  if (D.rand() < .6) lockedBike(D, .7, .25, D.pick(['#5e6e80', '#3a3d44', '#4a2e30']), true);
});
type('cityDBikeRailCut', { w: 2.6, d: .9, health: null, lowTop: true, collisionBoxes: [[0, 0, 2.6, .9, .95]] }, { spot: 'rail', tier: 0 }, (view, p, g) => {
  // One lock cut: its bike gone, the chain lying open, the cut ends bright.
  const D = builder(view, p, g); railFrame(D);
  lockedBike(D, .5, .25, D.pick(['#2b4058', '#3a3d44', '#1c1e24']), false);
  for (let i = 0; i < 7; i++) D.box(1, -.9 + i * .07, .012, .2 + Math.sin(i) * .08, .06, .02, .03, '#2a2b2e', [0, i * .5, 0]);
  D.box(2, -.4, .014, .22, .02, .015, .02, C.steel); D.box(2, -.93, .014, .15, .02, .015, .02, C.steel);
  D.box(1, -.6, .03, -.2, .12, .06, .06, '#2a2b2e');
});

// ---------------------------------------------------------------------------
// On the walls, street level (local z out from the wall; the back at -d/2).
type('cityDConduit', onWall(.8, .16), { spot: 'wall', tier: 0 }, (view, p, g) => {
  // Conduits up the base: two or three pipes from the ground to a junction box, clamps.
  const D = builder(view, p, g), n = 2 + Math.floor(D.rand() * 2), top = D.range(2.2, 3), box = D.range(1.4, 2);
  for (let i = 0; i < n; i++) { const x = -.25 + i * .18; D.cyl(0, x, top / 2, -.02, .025, top, i ? K.conduit : K.conduitDark, 5); for (let y = .6; y < top; y += .7) D.box(2, x, y, -.03, .07, .03, .07, K.steel); }
  D.box(0, .25, box, -.01, .3, .36, .14, K.plate); D.box(1, .25, box, .062, .26, .3, .01, K.steelLight); D.box(2, .25, box - .1, .07, .06, .04, .01, '#fcee0a');
});
type('cityDCableTray', onWall(3, .3), { spot: 'wall', tier: 0 }, (view, p, g) => {
  // A tray along the wall at 2.6 m, cables sagging out of it and one run dropping to a box.
  const D = builder(view, p, g), y = D.range(2.45, 2.7);
  D.box(0, 0, y, -.02, 3, .06, .22, K.steel); D.box(1, 0, y + .06, .08, 3, .08, .02, K.steelLight); D.box(1, 0, y + .06, -.12, 3, .08, .02, K.steelLight);
  for (let i = 0; i < 3; i++) D.box(1, (i - 1) * 1.2, y - .1, -.1, .04, .2, .06, K.steel);
  for (let i = 0; i < 3; i++) D.cyl(2, -1 + i * .8 + D.rand() * .3, y - .1, .05, .018, .5, K.cable, 4, .018, [0, 0, PI / 2 + (D.rand() - .5) * .3]);
  const x = D.range(-1.2, 1.2); D.cyl(1, x, y / 2, -.06, .02, y, K.cable, 4); D.box(1, x, .9, -.05, .22, .3, .12, K.plate);
});
type('cityDStandpipe', onWall(.6, .32), { spot: 'wall', tier: 0 }, (view, p, g) => {
  // A fire standpipe: a Y inlet off the wall at knee height, two capped ports, a chain.
  const D = builder(view, p, g);
  D.box(0, 0, .75, -.14, .3, .3, .04, K.fireRed); D.cyl(0, 0, .75, -.04, .06, .18, K.fireRed, 6, .06, [PI / 2, 0, 0]);
  for (const s of [-1, 1]) { D.cyl(0, s * .1, .8, .06, .045, .16, K.fireRed, 6, .045, [PI / 2 - .2, 0, s * .5]); D.cyl(1, s * .15, .82, .13, .05, .04, K.brass, 6, .05, [PI / 2, 0, 0]); }
  D.box(2, 0, .6, .1, .02, .25, .02, C.steelDark);
});
type('cityDGasMeter', onWall(.7, .3), { spot: 'wall', tier: 0 }, (view, p, g) => {
  // A gas meter box at the wall base, its dull-yellow pipes into the wall and ground.
  const D = builder(view, p, g);
  D.box(0, -.05, .75, -.02, .38, .44, .22, K.meter, undefined, true); D.box(1, -.05, .82, .095, .2, .12, .01, '#2a2e33');
  D.lit(2, -.05, .82, .101, .16, .05, .004, '#d8f0e0', .35);
  D.cyl(0, .22, .6, -.08, .025, 1.2, K.gasPipe, 5); D.box(0, .08, .45, -.06, .3, .05, .05, K.gasPipe);
  D.box(1, .22, .02, -.08, .1, .04, .1, K.gasPipe); D.box(2, .22, 1.1, -.08, .07, .05, .07, K.gasPipe);
});
type('cityDMeterBank', onWall(1.1, .3), { spot: 'wall', tier: 0 }, (view, p, g) => {
  // Three electric meters in a mesh cage, conduits down into the ground.
  const D = builder(view, p, g);
  D.box(0, 0, 1.3, -.06, 1.05, .8, .16, K.plate, undefined, true);
  for (let i = 0; i < 3; i++) { D.box(1, -.33 + i * .33, 1.35, .03, .24, .3, .04, K.meter); D.lit(1, -.33 + i * .33, 1.42, .052, .12, .05, .004, D.pick(['#d8f0e0', '#e6f0ff']), .45); }
  for (let i = 0; i < 4; i++) D.box(2, -.5 + i * .33, 1.3, .08, .02, .8, .02, K.steelLight);
  for (const x of [-.3, .3]) D.cyl(0, x, .45, -.08, .03, .9, K.conduitDark, 5);
});
type('cityDVentGrille', onWall(.9, .12), { spot: 'wall', tier: 0 }, (view, p, g) => {
  const D = builder(view, p, g), y = D.range(.6, .9);
  D.box(0, 0, y, -.03, .8, .5, .06, K.steel); for (let i = 0; i < 6; i++) D.box(1, 0, y - .2 + i * .08, .01, .74, .03, .04, K.steelLight, [.5, 0, 0]);
  D.box(2, 0, y - .42, -.04, .9, .3, .01, '#26282c'); // the soot streak under it
});
// A poster: colour blocks on paper (no letters), pasted flat on the wall.
function posterFace(D, t, x, y, w, h, torn) {
  const ink = [D.pick(K.ink), D.pick(K.ink), D.pick(K.ink)];
  D.box(t, x, y, -.03, w, h, .008, D.pick([K.white, K.paper, ink[0]]));
  D.box(t, x, y + h * .15, -.022, w * .8, h * .45, .006, ink[1]);
  D.box(t + 1, x - w * .18, y - h * .28, -.02, w * .3, w * .3, .006, ink[2], [0, 0, .78]);
  D.box(t + 1, x + w * .2, y - h * .3, -.02, w * .3, h * .08, .006, ink[0]);
  if (torn) D.box(t, x + w * .38, y + h * .4, -.018, w * .3, h * .22, .01, D.pick([K.paperGrey, '#3a3d44']), [0, 0, .5]);
}
type('cityDPoster', onWall(1, .1), { spot: 'wall', tier: 0, poster: true }, (view, p, g) => {
  const D = builder(view, p, g); posterFace(D, 0, 0, D.range(1.5, 1.9), .7, 1, D.rand() < .5);
});
type('cityDPosterRow', onWall(2.6, .1), { spot: 'wall', tier: 0, poster: true }, (view, p, g) => {
  // Wheatpasted in a row, the same bill four times, the older layer peeling under it.
  const D = builder(view, p, g), y = D.range(1.5, 1.8), ink = [D.pick(K.ink), D.pick(K.ink)];
  D.box(0, 0, y, -.035, 2.5, 1.1, .006, K.paperGrey);
  for (let i = 0; i < 4; i++) { const x = -.93 + i * .62; D.box(0, x, y, -.028, .56, .8, .006, K.white); D.box(0, x, y + .12, -.022, .46, .34, .006, ink[0]); D.box(1, x, y - .24, -.02, .3, .12, .006, ink[1]); }
  D.box(1, .4, y - .45, -.018, .3, .2, .01, K.paperGrey, [0, 0, .4]);
});
type('cityDPosterTorn', onWall(1.2, .1), { spot: 'wall', tier: 0, poster: true }, (view, p, g) => {
  const D = builder(view, p, g), y = D.range(1.3, 1.7);
  posterFace(D, 0, -.15, y, .7, .95, true); posterFace(D, 1, .25, y - .15, .55, .75, true);
  D.box(2, .1, y - .6, -.025, .4, .12, .008, K.paperWet, [0, 0, .2]); // a strip hanging off
});
type('cityDStickers', onWall(.6, .1), { spot: 'wall', tier: 2, poster: true }, (view, p, g) => {
  const D = builder(view, p, g), y = D.range(1.1, 1.5);
  for (let i = 0; i < 7; i++) D.box(2 + (i > 4 ? 1 : 0), (D.rand() - .5) * .5, y + (D.rand() - .5) * .3, -.04, .06 + D.rand() * .06, .05 + D.rand() * .06, .006, D.pick(K.ink), [0, 0, (D.rand() - .5) * .6]);
});
type('cityDPasteUp', onWall(.8, .1), { spot: 'wall', tier: 1, poster: true }, (view, p, g) => {
  // A pictogram paste-up: an eye (a lens and a pupil), a hand, or a heart, black on white.
  const D = builder(view, p, g), y = D.range(1.4, 2), kind = Math.floor(D.rand() * 3);
  D.box(1, 0, y, -.035, .6, .6, .006, K.white);
  if (kind === 0) { D.box(1, 0, y, -.028, .44, .18, .006, K.ink[5], [0, 0, 0]); D.box(1, 0, y, -.024, .14, .14, .006, K.white, [0, 0, .78]); D.box(2, 0, y, -.02, .07, .07, .006, K.ink[5]); }
  else if (kind === 1) { D.box(1, 0, y - .06, -.028, .22, .26, .006, K.ink[5]); for (let i = 0; i < 4; i++) D.box(2, -.08 + i * .055, y + .14, -.028, .04, .16, .006, K.ink[5]); }
  else { for (const s of [-1, 1]) D.box(1, s * .06, y + .03, -.028, .17, .17, .006, K.ink[0], [0, 0, s * .6]); D.box(1, 0, y - .06, -.026, .17, .17, .006, K.ink[0], [0, 0, .78]); }
});

// ---------------------------------------------------------------------------
// At the shop backs and against walls: bags, boxes, crates, pallets.
type('cityDBinBagSplit', flat(1, .8), { spot: 'back', tier: 0 }, (view, p, g) => {
  // A bin bag split open and slumped, its rubbish fanned out (low: walked over).
  const D = builder(view, p, g), bag = D.pick([K.bag, K.bagGrey, K.bagBlue]);
  D.ball(0, -.15, .12, -.1, .28, bag, .42, 1.1, .85); D.ball(1, .12, .08, -.2, .18, bag, .45);
  for (let i = 0; i < 3; i++) paper(D, 1 + (i > 1 ? 1 : 0), .1 + D.rand() * .3, .15 + D.rand() * .2, D.rand() * PI);
  can(D, 2, .35, .05, D.rand() * PI, D.pick(K.can)); wad(D, 2, -.3, .25); wrapper(D, 3, .15, .3, D.rand());
});
type('cityDBinBagFlat', flat(.8, .6), { spot: 'back', tier: 0 }, (view, p, g) => {
  const D = builder(view, p, g), bag = D.pick([K.bag, K.bagGrey]); D.ball(0, 0, .1, 0, .3, bag, .33, 1.1, .8); D.box(1, .25, .1, .1, .1, .06, .06, bag, [0, .4, .8]);
});
type('cityDBoxesFlat', flat(1.2, .9), { spot: 'back', tier: 0 }, (view, p, g) => {
  // Flattened cartons in a stack, one sliding off (dry, then soaked at the bottom).
  const D = builder(view, p, g);
  for (let i = 0; i < 4; i++) D.box(i < 2 ? 0 : 1, (D.rand() - .5) * .1, .015 + i * .025, (D.rand() - .5) * .08, 1, .022, .7, i ? D.pick([K.card, K.cardDark]) : K.cardWet, [0, (D.rand() - .5) * .2, 0]);
  D.box(1, .22, .02, .15, .6, .02, .5, K.card, [0, .5, .06]); D.box(2, -.2, .12, 0, .3, .004, .1, '#c3c4c0', [0, .2, 0]); // a shipping label (blank)
});
type('cityDBoxesWet', flat(1, .8), { spot: 'back', tier: 1 }, (view, p, g) => {
  // Boxes gone soft in the rain, sagging (low).
  const D = builder(view, p, g);
  D.box(1, -.15, .1, 0, .5, .2, .4, K.cardWet, [0, .2, .05]); D.box(1, -.15, .21, 0, .45, .02, .36, K.cardDark, [.1, .2, 0]);
  D.box(1, .3, .1, .1, .35, .14, .3, K.card, [0, -.4, .15]); D.box(2, .1, .005, -.25, .6, .006, .15, K.cardWet, [0, .1, 0]);
});
type('cityDCrateTipped', flat(.7, .6), { spot: 'back', tier: 1 }, (view, p, g) => {
  // A plastic crate on its side, the open face toward you, a bottle rolled out.
  const D = builder(view, p, g), c = D.pick([C.plasticRed, C.plasticBlue, C.plasticGreen, C.plasticGrey]);
  D.box(1, 0, .015, 0, .55, .03, .38, c); D.box(1, 0, .285, 0, .55, .03, .38, c); D.box(1, 0, .15, -.18, .55, .27, .03, c);
  for (const s of [-1, 1]) D.box(1, s * .26, .15, 0, .03, .27, .38, c);
  D.cyl(2, .15, .03, .28, .03, .2, '#2f4a36', 6, .03, [0, .8, PI / 2]);
});
type('cityDBottleCrate', flat(.6, .45), { spot: 'back', tier: 1 }, (view, p, g) => {
  const D = builder(view, p, g), c = D.pick([C.plasticRed, C.plasticYellow, C.plasticGreen]);
  D.box(1, 0, .13, 0, .5, .26, .35, c);
  for (let i = 0; i < 6; i++) { const x = -.16 + (i % 3) * .16, z = -.08 + Math.floor(i / 3) * .16; if (D.rand() < .8) D.cyl(2, x, .28, z, .03, .06, '#2f4a36', 5); }
});
type('cityDPallet', flat(1.2, 1), { spot: 'back', tier: 0 }, (view, p, g) => {
  const D = builder(view, p, g);
  for (const z of [-.42, 0, .42]) D.box(0, 0, .05, z, 1.2, .08, .1, K.woodDark);
  for (let i = 0; i < 5; i++) if (i !== 3 || D.rand() < .5) D.box(0, -.5 + i * .25, .115, 0, .14, .024, 1, K.wood);
});
type('cityDTarpScrap', flat(1.2, .8), { spot: 'back', tier: 1 }, (view, p, g) => {
  const D = builder(view, p, g), c = D.pick([C.tarp, '#3a5a4a', '#5a5048']);
  D.sheet(1, 0, 0, 1, .6, c, 0, .008, .04); D.box(2, .4, .075, .2, .3, .04, .25, c, [.3, .4, .2]); D.box(2, -.35, .01, -.25, .3, .01, .02, K.cable, [0, .5, 0]);
});
type('cityDCableCoil', flat(.8, .8), { spot: 'back', tier: 1 }, (view, p, g) => {
  const D = builder(view, p, g); for (let i = 0; i < 3; i++) D.cyl(1, 0, .02 + i * .025, 0, .28 - i * .03, .02, K.cable, 8, .28 - i * .03);
  D.cyl(2, .3, .02, .1, .018, .4, K.cable, 4, .018, [0, .6, PI / 2]);
});
type('cityDSignFallen', flat(1.2, .8), { spot: 'litter', tier: 1 }, (view, p, g) => {
  // A shop's A-frame board blown flat: its face a pictogram (a cup, a bowl: blocks, no letters).
  const D = builder(view, p, g), ink = D.pick(K.ink);
  D.box(1, 0, .025, 0, .9, .03, .6, C.graphite); D.box(1, 0, .042, 0, .78, .006, .5, K.white);
  D.box(2, -.1, .046, 0, .3, .004, .24, ink); D.box(2, .2, .046, -.1, .12, .004, .12, ink, [0, .78, 0]);
  D.box(1, 0, .03, .38, .9, .05, .06, C.graphite, [.5, 0, 0]);
});
type('cityDPipeStub', flat(.4, .4), { spot: 'kerb', tier: 1 }, (view, p, g) => {
  // A sawn-off sign post in its base plate (the sign long gone), bolts round it.
  const D = builder(view, p, g); D.box(1, 0, .01, 0, .3, .02, .3, C.steelDark); D.cyl(1, 0, .06, 0, .04, .12, C.steelMid, 6);
  for (const [x, z] of [[-.11, -.11], [.11, -.11], [-.11, .11], [.11, .11]]) D.cyl(2, x, .025, z, .015, .02, C.steel, 5);
});
type('cityDPuddleJunk', flat(1, .7), { spot: 'puddle', tier: 1 }, (view, p, g) => {
  // What collects at a puddle's edge: sodden paper, a can, a floating wrapper, grit.
  const D = builder(view, p, g);
  D.sheet(1, -.2, 0, .3, .24, K.paperWet, D.rand() * PI, .004, .01); can(D, 1, .2, .1, D.rand() * PI, D.pick(K.can));
  wrapper(D, 2, .05, -.15, D.rand()); D.box(2, -.3, .003, .2, .35, .004, .12, '#26282c', [0, .3, 0]); butts(D, 3, .3, -.1, 3, .2);
});
type('cityDMedianDebris', flat(1, .6), { spot: 'litter', tier: 2 }, (view, p, g) => {
  // A car's lost bits: a hubcap, a lamp lens, a strip of trim.
  const D = builder(view, p, g); D.cyl(2, -.2, .02, 0, .2, .04, C.steelMid, 8, .17); D.cyl(3, -.2, .042, 0, .06, .01, C.graphite, 6);
  D.box(2, .25, .012, .1, .3, .02, .12, '#6a2430', [0, .4, 0]); D.box(3, .15, .01, -.15, .5, .015, .03, C.graphite, [0, -.3, 0]);
});

// ---------------------------------------------------------------------------
// Velvet Row's lit touches (stage 5 review: the lane read sparse and dark).
// Its deep red, pink and rose white (design 15), steady (the district's
// pulse is the signs'). Lit parts from Performance up; Potato keeps the dark
// trims and the wet sheen.
const VELVET = Object.freeze({ red: C.litRed, pink: C.litPink, rose: '#ffd6e4', lacquer: '#1a1b20', wet: '#1e2027' });
type('cityDDoorGlow', onWall(2, .08), { spot: 'door', tier: 1 }, (view, p, g) => {
  // A lit frame round a club door: two neon jambs outside the opening (1.6 m) and a bar over it, on
  // black lacquer trims. Flat on the wall, beside and over the doorway, never in it.
  const D = builder(view, p, g), c = D.pick([VELVET.pink, VELVET.red, VELVET.rose]);
  for (const s of [-1, 1]) { D.box(0, s * .92, 1.12, -.02, .1, 2.24, .04, VELVET.lacquer); D.lit(1, s * .92, 1.15, .01, .035, 2.1, .025, c, .9); }
  D.box(0, 0, 2.3, -.02, 1.94, .1, .04, VELVET.lacquer); D.lit(1, 0, 2.3, .01, 1.8, .035, .025, c, .9);
});
type('cityDNeonSide', onWall(.3, .08), { spot: 'wall', tier: 1 }, (view, p, g) => {
  // A neon strip up the wall beside a doorway (placed clear of its apron): a straight tube or a wave of
  // short ones, on a lacquer back.
  const D = builder(view, p, g), c = D.pick([VELVET.pink, VELVET.red]), wave = D.rand() < .5;
  D.box(0, 0, 1.25, -.025, .14, 2, .03, VELVET.lacquer);
  if (!wave) D.lit(1, 0, 1.25, 0, .035, 1.9, .03, c, .9);
  else for (let i = 0; i < 6; i++) D.lit(1, (i % 2 ? .03 : -.03), .45 + i * .32, 0, .03, .3, .03, c, .9, [0, 0, i % 2 ? .25 : -.25]);
});
type('cityDPuddleGlint', flat(1.1, .6), { spot: 'velvet', tier: 1 }, (view, p, g) => {
  // A wet patch by the lane's wall catching the signs: a dark sheen (every preset) and two or three
  // thin glints of the district's light lying in it (a lit sliver a millimetre over the water).
  const D = builder(view, p, g), c = D.pick([VELVET.pink, VELVET.red, VELVET.rose]);
  D.sheet(0, 0, 0, 1, .5, VELVET.wet, D.rand() * .3, .003, .005);
  const n = 2 + Math.floor(D.rand() * 2);
  for (let i = 0; i < n; i++) D.lit(1, D.range(-.3, .3), .006, D.range(-.12, .12), D.range(.25, .45), .002, D.range(.05, .09), c, .7, [0, D.range(-.3, .3), 0]);
});

// ---------------------------------------------------------------------------
export const LUMEN_DETAIL_TYPES = Object.freeze(TYPES);
export const LUMEN_DETAIL_INFO = Object.freeze(INFO);
export const DETAIL_MODELS = Object.freeze(Object.keys(MODELS));
for (const [name, make] of Object.entries(MODELS)) registerLumenModel(name, (view, p, g) => { if (!detailOff()) make(view, p, g); });
