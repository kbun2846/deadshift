// Lumen stage 5: the civilian dead and the stampede's leavings (design 5c, 6;
// owner rules binding). Types here are spread into map-kit.js PROP_TYPES (so
// this module must not import map-kit.js: a cycle); their models register with
// world/lumen-props.js registerLumenModel(type, make). Placement:
// maps/lumen-bodies.js.
//
// The dead outside (design 6, "Panic and chaos"): the pileup's driver slumped
// out of the smouldering car's window, one half-covered by a coat on the
// Crossroads crosswalk beside the taxi, and the body pile in Back Alley (about
// ten, heaped against the north wall; two show the infection). The other
// three of the design's five are indoors already (maps/lumen-interiors-*.js,
// drawn by render/city-interior-models.js `body`): this file keeps that
// file's look rules (the same skin tones, the same dried blood, the same
// infection colours and where they go: blotches on the face and forearm, a dark
// vein, the port at the neck) so indoor and outdoor dead match.
//
// Civilian rules (owner): stylised, flat-shaded, a step below player deaths
// (old dried blood, a few wounds, torn clothing; nothing cut off, no brains,
// no char); never mistakable for a player: everyday city clothes (t-shirts,
// hoodies, office shirts, a puffer or a short jacket; trousers, jeans, a
// skirt; sneakers, work shoes) in muted colours, never a hat or a long coat,
// never a team colour, varied skin, visible hair, bare faces and hands (bare
// arms in t-shirts). Poses are articulated and slack (curled, sprawled, draped,
// slumped): a player's death is the whole figure tipping over stiff (effects/
// death-corpse.js), so none of these reads as one.
//
// Everything here is solid scenery (health null): the static batch bakes each
// part's colour into the map-wide vertex-coloured material and merges it per
// 24 m cell (renderer.js batch), so the dead cost no draw of their own. Built
// once at load; nothing per frame. The module's top level only declares data:
// every model is made when the world builds.
import * as THREE from 'three';
import { registerLumenModel } from './lumen-props.js';
import { propStream, tone, CITY as C } from './lumen-kit.js';
import { litBox } from './lumen-glow.js';

const PI = Math.PI;

// --- The look (shared with render/city-interior-models.js's dead) -----------------
// Skin tones and the infection are the interior file's (SKIN, BLOTCH, VEIN,
// PORT, PORT_DEAD, DRIED); clothes are muted everyday colours, each kept 15+
// CIEDE2000 from Amber #ffb020, Cyan #2ee6ff and Violet #b77bff
// (tests/lumen-bodies.test.js measures them plain and lit by the night look).
export const BODY_LOOK = Object.freeze({
  skin: Object.freeze(['#e0b99c', '#c08f6c', '#9a6a4c', '#6b4a36', '#4a3326']),
  hair: Object.freeze(['#2a211c', '#15110e', '#3a2c22', '#5a3a24', '#6a4a30', '#8a6a4a', '#8c8a86']),
  tees: Object.freeze(['#5b6b7a', '#6a5a4c', '#4f5d4a', '#7a6a78', '#8a8478', '#6a4f47', '#4a5a5e', '#a09a8a', '#3f4a5c']),
  hoodies: Object.freeze(['#3e4450', '#4a4a48', '#5a4a3e', '#2f3a34', '#5e4a5a']),
  shirts: Object.freeze(['#b8bcc2', '#a4acb4', '#c2bca8', '#a8b0a0']), // office shirts: pale
  jackets: Object.freeze(['#2e3138', '#3a4452', '#4a3a30', '#3e4439']), // short jackets
  puffers: Object.freeze(['#3a4452', '#503a40', '#2e3a32', '#44464c']), // quilted, to the hip
  jeans: Object.freeze(['#3b4a62', '#2f3a4e', '#4a5870']),
  trousers: Object.freeze(['#2e3138', '#4a4238', '#5a5a58', '#3a3d44']),
  skirts: Object.freeze(['#3a2e3a', '#2e3138', '#5a4a3a']),
  sneakers: Object.freeze(['#c8c8c2', '#2a2a2e', '#6a6e76']),
  work: Object.freeze(['#3a2a20', '#1c1c1e', '#2e2620']),
  sole: '#d8d6d0',
  // Old blood: dried to near black, browner at the edges (never the players' #8c1c2a or anything near it).
  dried: '#2e1a1a', driedDark: '#221313', driedEdge: '#3a2220', wound: '#3b1d1e',
  // The infection (design 5c): grey-green blotches, dark veins, the port at the neck dead grey or faintly pale green.
  blotch: '#6f7f5a', vein: '#2c3527', port: '#b8d88a', portDead: '#7b8077',
  coat: '#7d7565', coatDark: '#5c5548', // the coat someone laid over the crosswalk's dead (khaki: not worn, never the hoodie's green)
});
const L = BODY_LOOK;

// --- The types ---------------------------------------------------------------------
// Walk-over pieces have no collider at all (`collisionBoxes: []`, as
// world/lumen-detail.js's clutter): a body steps over them and a round flies
// over them. (A collider, even a walkOver one, would stop every round on a
// flat map: rounds there have no flight path, weapons/rifle.js roundMeets.)
// Their footprint (w, d) is what the placement keeps off doorways and the rest.
const low = (w, d) => ({ w, d, health: null, walkOver: true, collisionBoxes: [] });

// The body pile against Back Alley's north wall (the prop at x -12, z -24.65,
// angle 0: local +z faces the alley, the wall's face at local z -.66). Its
// collider follows the heap: a low tail at each end, the peak in the middle
// where the alley is widest between the two doors' aprons (the noodle bar's
// and the pawn shop's: the peak stays west of the pawn's, x < -12, and the
// tails stay behind both, z < -24.4), so a body meets the bodies, not air, and
// the alley keeps 1.8 m clear to the pawn shop's wall (z -22.19). The boxes
// reach the wall (z -25.48) and overlap each other, so no box leaves a gap a
// robot would try (0.7-1.4 m) to a wall or the next building. The rats'
// and pigeons' spots round it (effects/lumen-life-rules.js BODY_PILE) sit just
// outside these boxes. Knee-to-waist high: a round (.74 m) meets the peak and
// the middle, flies over the tails.
export const PILE_BOXES = Object.freeze([
  Object.freeze([-1.875, -.34, 1.05, .98, .45]), // the west tail: the lowest ones' legs
  Object.freeze([-.875, -.09, 1.65, 1.48, .95]), // the peak
  Object.freeze([.6, -.315, 1.9, 1.03, .8]),     // the east shoulder
  Object.freeze([1.95, -.34, .8, .98, .45]),     // the east tail: one curled at the foot
]);

export const LUMEN_BODY_TYPES = Object.freeze({
  // --- The dead ---
  // The pileup's driver, slumped out of the smouldering car's window: placed on
  // that car's own centre and heading (its nose +x, the driver's side -z),
  // inside the car's collision box. Walk-over: the car's box is what stops you.
  cityBodyDriver: low(1.4, .9),
  // Half covered by a coat on the Crossroads crosswalk beside the taxi (lying low: the coat's top .3 m up).
  cityBodyCoat: low(1.0, 2.0),
  // The Back Alley body pile: one merged heap, its collider shaped to it (above).
  cityBodyPile: { w: 4.8, d: 1.5, health: null, lowTop: true, collisionBoxes: PILE_BOXES },
  // --- Old blood ---
  // A dried pool (v 0) or a trail of drips and smears (v 1): ground marks.
  cityBloodDried: low(1.2, .9),
  // Two heel furrows and a smear: someone dragged along the ground.
  cityDragMarks: low(3.6, .7),
  // --- The stampede (design 6: belongings toward the metro; the small litter is world/lumen-detail.js's) ---
  citySuitcase: low(.9, .95),         // a hard-shell case burst open, clothes spilling
  cityStroller: low(1.2, .8),         // a stroller trampled onto its side
  cityBackpack: low(.55, .45),
  cityDuffel: low(.85, .5),
  cityJacketDropped: low(.85, .7),    // a puffer jacket dropped and trodden on
  cityShoeLost: low(.4, .35),         // one shoe (v 0) or a pair kicked apart (v 1)
  cityShelterPanel: low(2.5, 1.8),    // a bus shelter's end glass, fallen and trampled
  cityBelongingsHeap: low(1.8, 1.0),  // bags and cases dropped in a heap at the metro
  // The toppled ad pillar: lying on its side, its screens dead. Waist high: a
  // body hides behind it (not knee high, so not lowTop), it hides nobody.
  cityAdPillarDown: { w: 2.9, d: 1.3, health: null, collisionBoxes: [[0, 0, 2.8, 1.2, 1.15]] },
  // Uptown's revolving door, jammed half turned: a set piece on a tower's
  // face (beside the real doorway, never in it). Only its front half stands
  // out of the wall (the back half is behind the facade): the drum about
  // 2.1 m across, 1 m deep. Glass: you see through it, you cannot walk or shoot
  // through it.
  cityRevolvingDoor: { w: 2.3, d: 1.05, health: null, collisionBoxes: [[0, 0, 2.2, 1.0, 2.6]] },
  // --- The abandoned checkpoint (design 6; the booth holds the riot shield, the scanner, the trefoil poster) ---
  cityCheckpointTape: low(3.0, .9),   // torn striped tape trailing on the road (lemon and black, no text)
  cityCasings: low(1.2, .9),          // spent casings where the line broke
  cityTrefoilSign: low(.8, 1.1),      // a folding biohazard sign knocked flat (the trefoil pictogram)
});

// Pieces that stand against a building's wall by design (the brief: the pile
// in Back Alley's wall recess, the revolving door on a tower's face), so the
// building-side 1.4 m rule of tests/lumen-cover.test.js lets them be.
export const LUMEN_BODY_WALL_PIECES = Object.freeze(['cityBodyPile', 'cityRevolvingDoor']);

// --- The builder: nested frames over the view's boxes -------------------------------
// A rig draws in the current frame (a THREE.Group); `group` nests a frame
// moved and turned (Euler 'YXZ': rz, then rx, then ry, as the interiors'
// Maker) so a limb is built at its joint. Every part is a plain-coloured mesh
// the static batch bakes. Nothing here casts a shadow (lying figures would
// only add shadow-pass triangles) unless `cast` is set.
class Rig {
  constructor(view, root, p, cast = false) { this.view = view; this.stack = [root]; this.cast = cast; this.rand = propStream(p, 4051); }
  get top() { return this.stack[this.stack.length - 1]; }
  group(x, y, z, rx, ry, rz, fn) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rx || 0, ry || 0, rz || 0, 'YXZ');
    this.top.add(g); this.stack.push(g); fn(); this.stack.pop(); return g;
  }
  // A box by its centre (x, y, z), turned about its centre by rot [rx, ry, rz].
  box(x, y, z, w, h, d, col, rot) {
    const m = this.view.box(x, y, z, w, h, d, col, this.top);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0, 'YXZ');
    m.castShadow = this.cast; return m;
  }
  // A cylinder (prism) standing on its centre; rot turns it.
  cyl(x, y, z, r, h, col, sides = 6, rot, top = r) {
    const m = this.view.mesh(new THREE.CylinderGeometry(top, r, h, sides), col, x, y, z, this.top);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0, 'YXZ');
    m.castShadow = this.cast; return m;
  }
  // A flat patch on the ground (or any level): an irregular polygon (a
  // `sides`-gon squashed sx by sz, turned ry), at height y. Blood, stains, cloth.
  patch(x, y, z, sx, sz, col, ry = 0, sides = 7) {
    const m = this.view.mesh(new THREE.CircleGeometry(1, sides), col, x, y, z, this.top);
    m.rotation.set(-PI / 2, ry, 0, 'YXZ'); m.scale.set(sx, sz, 1); m.castShadow = false; return m;
  }
  // A flat quad on a vertical face (a smear on a wall): centre (x, y), at depth z, facing +z.
  panel(x, y, z, w, h, col, rz = 0) {
    const m = this.view.mesh(new THREE.PlaneGeometry(w, h), col, x, y, z, this.top);
    m.rotation.set(0, 0, rz); m.castShadow = false; return m;
  }
  r() { return this.rand(); }
  pick(list) { return list[Math.floor(this.rand() * list.length) % list.length]; }
  // A colour a touch lighter or darker (coloured ones only ever darker: wear never drifts toward a team colour).
  wear(hex, amount = .16) { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = n >> 8 & 255, b = n & 255, k = (this.rand() - .5) * amount; return tone(hex, Math.max(r, g, b) - Math.min(r, g, b) > 40 ? -Math.abs(k) : k, 10); }
}

// --- A civilian ------------------------------------------------------------------
// An outfit from the seeded stream: the top (tee, hoodie, office shirt,
// puffer, short jacket), the bottom (jeans, trousers, a skirt), shoes, skin,
// hair (sometimes long). `o` overrides any of it; `o.infected` shows the
// infection. Never a hat, never a long coat, never a team colour.
function outfitFor(rig, o = {}) {
  const top = o.top || rig.pick(['tee', 'tee', 'hoodie', 'shirt', 'puffer', 'jacket']);
  const bottom = o.bottom || rig.pick(['jeans', 'jeans', 'trousers', 'trousers', 'skirt']);
  const topCol = o.topCol || rig.wear(rig.pick({ tee: L.tees, hoodie: L.hoodies, shirt: L.shirts, puffer: L.puffers, jacket: L.jackets }[top]));
  const legCol = o.legCol || rig.wear(rig.pick({ jeans: L.jeans, trousers: L.trousers, skirt: L.skirts }[bottom]));
  const sneakers = rig.r() < .6;
  return {
    top, bottom, topCol, legCol,
    under: top === 'jacket' ? rig.pick(L.tees) : null, // the tee under an open jacket
    shoe: o.shoe || rig.pick(sneakers ? L.sneakers : L.work), sneakers,
    skin: o.skin || rig.pick(L.skin), hair: o.hair || rig.pick(L.hair), long: o.long ?? rig.r() < .35,
    sleeves: top !== 'tee', infected: !!o.infected, portCol: o.portDead ? L.portDead : L.port,
    wounds: o.wounds ?? 1 + Math.floor(rig.r() * 2), torn: o.torn ?? rig.r() < .6,
  };
}

// The figure standing (feet at y 0, facing +z, its left toward +x), posed by
// joint turns: `pose` { spine, neck, shL, shR (shoulders [rx, ry, rz]), elL,
// elR (elbows, rx: negative bends forward), hipL, hipR ([rx, rz]: rx
// negative swings the thigh forward), knL, knR (knees, rx positive bends) }.
// Callers lay it down with `lie`. About 30 boxes (~360 triangles).
function figure(rig, out, pose = {}) {
  const P = pose, skin = out.skin, sleeve = out.sleeves ? out.topCol : null;
  rig.group(0, .9, 0, 0, 0, 0, () => {
    // Hips and legs.
    rig.box(0, -.05, 0, .34, .16, .2, out.legCol);
    for (const s of [1, -1]) {
      const hip = (s > 0 ? P.hipL : P.hipR) || [0, 0], knee = (s > 0 ? P.knL : P.knR) || 0;
      rig.group(s * .095, -.1, 0, hip[0], 0, hip[1] || 0, () => {
        rig.box(0, -.21, 0, .15, .44, .16, out.legCol);
        if (out.bottom === 'skirt') rig.box(0, -.12, 0, .17, .22, .18, out.legCol); // (the skirt's hem over the thigh)
        rig.group(0, -.42, 0, knee, 0, 0, () => {
          rig.box(0, -.2, 0, .12, .4, .13, out.bottom === 'skirt' ? skin : out.legCol);
          rig.box(0, -.42, .05, .115, .08, .25, out.shoe);
          if (out.sneakers) rig.box(0, -.455, .05, .12, .02, .26, L.sole);
        });
      });
    }
    // Torso, head, arms.
    const sp = P.spine || [0, 0, 0];
    rig.group(0, .02, 0, sp[0], sp[1], sp[2], () => {
      const puffy = out.top === 'puffer' ? .05 : 0;
      rig.box(0, .27, 0, .38 + puffy, .52, .21 + puffy, out.topCol);
      if (out.top === 'puffer') for (const y of [.14, .3, .44]) rig.box(0, y, 0, .44, .025, .265, tone(out.topCol, -.2));
      if (out.top === 'jacket') rig.box(0, .27, .108, .12, .5, .012, out.under); // (the open front: the tee under it)
      if (out.top === 'shirt') { rig.box(0, .51, .06, .2, .04, .1, tone(out.topCol, .1)); rig.box(0, .3, .108, .012, .4, .01, tone(out.topCol, -.2)); }
      if (out.top === 'hoodie') { rig.box(0, .5, -.12, .26, .12, .08, tone(out.topCol, -.12)); rig.box(0, .18, .11, .22, .12, .012, tone(out.topCol, -.12)); }
      // Wounds (old: dark, dried) and a torn place (skin through the cloth, a flap).
      if (out.wounds > 0) rig.box(-.08, .33, .107 + puffy / 2, .1, .12, .01, L.wound);
      if (out.wounds > 1) rig.box(.1, .12, .107 + puffy / 2, .07, .06, .01, L.wound);
      if (out.torn) { rig.box(.1, .38, .108 + puffy / 2, .1, .07, .008, skin); rig.box(.13, .33, .12 + puffy / 2, .08, .08, .012, tone(out.topCol, -.1), [.5, 0, .3]); }
      if (out.infected) { rig.box(-.12, .2, .11 + puffy / 2, .08, .07, .008, L.blotch); }
      // Neck and head (hair on the crown and the back; long hair down the back).
      const nk = P.neck || [0, 0, 0];
      rig.group(0, .53, 0, nk[0], nk[1], nk[2], () => {
        rig.box(0, .04, 0, .09, .09, .09, skin);
        rig.box(0, .17, .01, .17, .21, .2, skin);
        rig.box(0, .285, -.005, .185, .05, .21, out.hair);
        rig.box(0, .19, -.095, .185, .18, .04, out.hair);
        if (out.long) rig.box(0, .05, -.12, .2, .2, .05, out.hair);
        if (out.wounds > 1) rig.box(.05, .23, .112, .06, .05, .008, L.wound);
        if (out.infected) {
          rig.box(.086, .16, .03, .012, .07, .08, L.blotch); rig.box(-.04, .1, .112, .06, .05, .006, L.blotch);
          rig.box(.05, .03, .02, .014, .035, .035, out.portCol); // the port at the neck
          rig.box(.047, .05, -.03, .006, .07, .006, L.vein);
        }
      });
      for (const s of [1, -1]) {
        const sh = (s > 0 ? P.shL : P.shR) || [0, 0, s * .12], el = (s > 0 ? P.elL : P.elR) || 0;
        rig.group(s * .235, .47, 0, sh[0], sh[1], sh[2], () => {
          rig.box(0, -.14, 0, .09, .3, .095, sleeve || skin);
          if (!sleeve) rig.box(0, -.05, 0, .105, .12, .11, out.topCol); // the tee's short sleeve
          rig.group(0, -.29, 0, el, 0, 0, () => {
            rig.box(0, -.12, 0, .08, .25, .085, sleeve && out.top !== 'shirt' ? sleeve : skin);
            if (out.top === 'shirt') rig.box(0, -.02, 0, .088, .06, .092, out.topCol); // (sleeves rolled up)
            rig.box(0, -.29, .01, .075, .1, .05, skin);
            if (out.infected && s > 0) { rig.box(.041, -.12, 0, .008, .1, .05, L.blotch); rig.box(0, -.1, .043, .01, .16, .006, L.vein); }
          });
        });
      }
    });
  });
}

// A civilian standing, un-posed (tests/lumen-bodies.test.js holds the outfit
// rules against the figure itself: no hat over the hair, nothing in the top's
// colour below the hips). Returns the outfit.
export function standingCivilian(view, g, p, overrides) {
  const rig = new Rig(view, g, p), out = outfitFor(rig, overrides);
  figure(rig, out, {});
  return out;
}

// Lays a figure down: at (x, y, z) (the figure's middle, y its lift off the
// ground), its head pointing along `head` (a heading: 0 = -z, PI/2 = -x,
// -PI/2 = +x, PI = +z), `roll` about its own length (0 face up, PI face
// down, +-PI/2 on a side), `tilt` its head end raised (a body lying up a slope).
function lie(rig, x, y, z, head, roll, out, pose, tilt = 0) {
  rig.group(x, y, z, 0, head, 0, () => rig.group(0, 0, 0, -PI / 2 + tilt, 0, 0, () => rig.group(0, -.9, 0, 0, roll, 0, () => figure(rig, out, pose))));
}

// Slack poses (never a player's stiff fall): curled on a side, sprawled face
// down with an arm out, on the back with the knees fallen aside, draped.
const POSES = Object.freeze({
  curled: { spine: [.35, 0, 0], neck: [.3, 0, 0], shL: [-1.1, 0, .2], shR: [-.9, 0, -.1], elL: -1.3, elR: -1.6, hipL: [-1.2, .1], hipR: [-1, -.05], knL: 1.7, knR: 1.5 },
  sprawl: { spine: [0, 0, .08], neck: [0, 0, .5], shL: [-2.6, 0, .5], shR: [.2, 0, -.5], elL: -.4, elR: -.3, hipL: [-.5, .35], hipR: [.1, -.1], knL: .9, knR: .2 },
  back: { spine: [-.05, 0, 0], neck: [-.2, .4, 0], shL: [-.3, 0, 1.2], shR: [0, 0, -.35], elL: -.6, elR: -.2, hipL: [-.5, .5], hipR: [-.15, -.2], knL: 1.1, knR: .4 },
  limp: { spine: [.1, 0, -.1], neck: [.5, .5, 0], shL: [0, 0, .2], shR: [-.4, 0, -.3], elL: -.2, elR: -.9, hipL: [-.2, .15], hipR: [-.35, -.05], knL: .4, knR: .7 },
  draped: { spine: [.55, 0, .1], neck: [.5, 0, .2], shL: [-.8, 0, .25], shR: [-.6, 0, -.2], elL: -.3, elR: -.5, hipL: [-.4, .1], hipR: [-.3, -.1], knL: .1, knR: .05 },
  tucked: { spine: [.35, 0, 0], neck: [.35, 0, 0], shL: [-.5, 0, .05], shR: [-.7, 0, -.05], elL: -1.9, elR: -1.7, hipL: [-1.25, .05], hipR: [-1.05, -.05], knL: 1.9, knR: 1.8 },
  flat: { neck: [0, .6, 0], shL: [0, 0, .18], shR: [0, 0, -.12], elL: -.35, elR: -.15, hipL: [-.15, .1], hipR: [0, -.05], knL: .3, knR: .1 },
  flatDown: { neck: [0, -.9, 0], shL: [.1, 0, .12], shR: [.15, 0, -.15], elL: -.1, elR: -.05, hipL: [0, .12], hipR: [-.1, 0], knL: .15, knR: .45 },
});

// A dried pool under a body: a dark middle, browner rims, a few spatters.
function pool(rig, x, z, size, ry = 0, y = .012) {
  rig.patch(x, y, z, size, size * .7, L.driedEdge, ry, 7);
  rig.patch(x + size * .08, y + .002, z - size * .05, size * .72, size * .48, L.dried, ry + .4, 6);
  rig.patch(x - size * .1, y + .004, z + size * .06, size * .36, size * .26, L.driedDark, ry + 1.1, 5);
  for (let k = 0; k < 3; k++) { const a = rig.r() * PI * 2, d = size * (1.05 + rig.r() * .3); rig.patch(x + Math.cos(a) * d, y, z + Math.sin(a) * d * .7, .04 + rig.r() * .05, .03 + rig.r() * .03, L.dried, rig.r() * 3, 5); }
}

// --- The dead ---------------------------------------------------------------------
// The pileup's driver (in the smouldering car's frame: nose +x, the driver's
// door -z, the seat at x -.4): sat, the seat belt still across, the upper body
// fallen out through the smashed window, the head and an arm hanging down the
// door toward the ground, dried blood down the door and a pool under the hand.
function driver(view, p, g) {
  const rig = new Rig(view, g, p), out = outfitFor(rig, { top: 'shirt', bottom: 'trousers', shoe: L.work[1], wounds: 2, torn: true });
  // Seated facing the nose (+x), leaning out to its left (-z), the head down past the sill.
  // (The figure stands .9 m to its pelvis; lowered so the pelvis sits on the seat at .47.)
  rig.group(-.4, -.36, -.34, 0, PI / 2, 0, () => {
    figure(rig, out, { spine: [.15, 0, -.8], neck: [.1, 0, -1.25], shL: [0, 0, .66], elL: -.1, shR: [-.9, 0, -.3], elR: -1.1, hipL: [-1.45, .1], hipR: [-1.45, -.05], knL: 1.45, knR: 1.4 });
  });
  // Blood dried down the door from the window, and on the ground under the hand.
  rig.box(-.25, .42, -.885, .42, .4, .012, L.dried, [0, 0, .08]);
  rig.box(-.1, .3, -.888, .1, .3, .01, L.driedDark);
  pool(rig, -.3, -.9, .12, .6, .012);
}

// The crosswalk's dead (prop frame: the body along local z, head toward -z):
// lying on its back, a khaki coat someone laid over the head and chest, the
// legs, an arm and the hair out from under it; a dried pool at the head.
//
// Owner, 2026-09-30: it read as a green blocky lump. The coat was the same
// dark green as the hoodie and lay inside the torso (its top at .255 m, the
// torso's at .275), so what showed was a hoodie with stripes of coat at its
// edges, and a random skirt or jeans. Now the outfit is fixed and contrasts
// with the coat (blue-grey tee, dark jeans, pale sneakers), the body lies
// lower, and the coat rides over it as a tent: a ridge at .33 m, its edges
// falling to the ground, a mound where the head is and the hair showing at
// the collar, so from above it is one person under a coat. Everything stays
// under the walk-over .36 m.
function coatBody(view, p, g) {
  const rig = new Rig(view, g, p), out = outfitFor(rig, { top: 'tee', topCol: '#5b6b7a', bottom: 'jeans', legCol: '#2f3a4e', shoe: L.sneakers[0], wounds: 0, torn: false, long: false });
  pool(rig, .14, -.74, .3, .3);
  // On its back, turned a little onto its side, one arm flung out from under the coat, a knee fallen aside.
  lie(rig, 0, .17, .08, 0, .2, out, { neck: [0, .4, 0], shL: [0, 0, .5], elL: -.25, shR: [.1, 0, -.2], elR: -.3, hipL: [-.12, .3], hipR: [0, -.08], knL: .45, knR: .1 });
  // The coat, over the head and chest (z -.9 .. .02): the ridge, the two slopes to the ground, the head's mound, the collar, a sleeve out on the ground.
  rig.group(-.01, 0, -.44, 0, .05, 0, () => {
    rig.box(0, .31, .02, .4, .045, .86, L.coat);
    rig.box(-.32, .19, .02, .3, .04, .86, L.coat, [0, 0, .8]);
    rig.box(.32, .19, .02, .3, .04, .86, L.coatDark, [0, 0, -.8]);
    rig.box(0, .1, .46, .62, .14, .04, L.coatDark);            // the hem, fallen at the waist
    rig.box(0, .325, -.2, .3, .03, .3, tone(L.coat, .08));    // the head's mound under the cloth (the collar end)
    rig.box(0, .31, -.43, .3, .05, .05, L.coatDark);          // the collar
    rig.box(-.35, .03, .2, .4, .05, .12, L.coat, [0, .7, 0]); // a sleeve on the ground
    rig.box(.33, .03, .3, .3, .05, .11, L.coatDark, [0, -.5, 0]); // the other, folded across
  });
  // The hair, out past the collar, and the face's chin below the hem of the cloth: the figure's own parts show at the ends.
  rig.box(-.02, .04, -.93, .2, .06, .14, out.hair);
}

// The Back Alley body pile (prop frame: local +z the alley, the wall at z -.65):
// about ten civilians heaped against the wall as they were dragged there, a
// bottom row along the wall, more over them, one draped face down over the
// top with an arm hanging, one curled at the east foot, one slid to the west
// end; two show the infection. Dried blood pooled at the foot and the edges,
// a smear down the wall behind. One model (the static batch merges it).
const PILE = Object.freeze([
  // [x, lift, z, head (heading), roll, pose, outfit overrides, tilt (the head end raised)]
  [-1.05, .13, -.36, -PI / 2, 0, 'flat', {}],                                   // the bottom row, along the wall
  [.95, .12, -.36, PI / 2, PI, 'flatDown', { top: 'puffer' }],
  [-1.2, .12, .0, -PI / 2, PI, 'flatDown', { reach: true }],                  // the bottom front: an arm out toward the alley
  [-.75, .32, -.3, -PI / 2 + .1, PI, 'flatDown', { infected: true, portDead: true }], // the second layer
  [.8, .32, -.28, PI / 2 - .08, 0, 'flat', { bottom: 'skirt' }],
  [-.85, .56, -.1, PI / 2 + .1, PI / 2, 'curled', {}],                         // the third
  [.55, .5, -.25, -PI / 2, -PI / 2, 'limp', { infected: true }],
  [-.86, .64, .02, PI - 1, PI, 'draped', { top: 'tee' }],              // face down across the top, the head hanging toward the alley
  [1.62, .24, -.32, PI / 2 + .15, -PI / 2, 'tucked', { top: 'tee', long: true }], // curled at the east foot
  [.35, .26, .0, PI / 2, PI / 2, 'curled', { bottom: 'jeans' }],                // slid off the front
]);
function bodyPile(view, p, g) {
  const rig = new Rig(view, g, p);
  // Dried blood under and round the foot of the heap, inside its footprint.
  for (const [x, z, s, ry] of [[-1.2, .45, .34, .2], [-.6, .4, .3, 1.3], [.8, -.05, .28, 2.2], [1.8, .0, .22, .7], [-1.95, -.08, .2, 2.8], [.3, -.2, .28, 0]]) pool(rig, x, z, s, ry, .01);
  // The smear down the wall behind (painted on the wall's face).
  const wall = -.64;
  for (const [x, top, h, w, col, rz] of [[-.9, 1.55, .9, .28, L.dried, .05], [-.62, 1.4, .8, .12, L.driedDark, -.04], [-.3, 1.2, .5, .22, L.driedEdge, .1], [.35, 1.1, .45, .3, L.dried, -.03], [-1.25, 1.05, .35, .16, L.driedEdge, 0]])
    rig.panel(x, top - h / 2, wall, w, h, col, rz);
  rig.panel(-.78, 1.5, wall + .002, .12, .14, L.driedDark, .3); // (a hand's smear, fingers dragged down)
  for (let f = 0; f < 4; f++) rig.panel(-.83 + f * .035, 1.36, wall + .002, .02, .2, L.driedDark, .05);
  for (const [x, lift, z, head, roll, name, o, tilt] of PILE) {
    const { reach, ...rest } = o;
    const out = outfitFor(rig, rest), pose = { ...POSES[name] };
    if (reach) { pose.shR = [0, 0, -.75]; pose.elR = -.2; }
    lie(rig, x, lift, z, head, roll, out, pose, tilt || 0);
  }
}

// --- Old blood ----------------------------------------------------------------------
function bloodDried(view, p, g) {
  const rig = new Rig(view, g, p);
  if ((p.v || 0) === 0) { pool(rig, 0, 0, .38, rig.r() * 3); return; }
  // A trail: drips and small smears along local x.
  for (let k = 0; k < 9; k++) { const x = -.5 + k * .12 + (rig.r() - .5) * .05, z = (rig.r() - .5) * .25; rig.patch(x, .012, z, .03 + rig.r() * .05, .025 + rig.r() * .03, k % 3 ? L.dried : L.driedEdge, rig.r() * 3, 5); }
  rig.patch(.35, .011, .05, .16, .09, L.driedEdge, .3, 6); rig.patch(.37, .013, .05, .09, .05, L.dried, .5, 5);
}
function dragMarks(view, p, g) {
  const rig = new Rig(view, g, p);
  // Two heel furrows in dried blood, fading toward the start (-x), a wider smear between.
  for (const s of [-1, 1]) for (let k = 0; k < 7; k++) {
    const x = -1.6 + k * .5 + (rig.r() - .5) * .08, fade = k / 6;
    rig.patch(x, .01 + s * .001 + .004, s * .13 + (rig.r() - .5) * .04, .26, .035 + fade * .03, fade > .4 ? L.dried : L.driedEdge, (rig.r() - .5) * .08, 5);
  }
  for (let k = 0; k < 4; k++) rig.patch(-.4 + k * .5, .012, (rig.r() - .5) * .08, .28, .1 + k * .03, k > 1 ? L.dried : L.driedEdge, (rig.r() - .5) * .1, 6);
  rig.patch(1.55, .013, 0, .24, .18, L.driedDark, .4, 6);
}

// --- The stampede ---------------------------------------------------------------------
const CLOTHES = ['#5b6b7a', '#8a8478', '#6a4f47', '#b8bcc2', '#4f5d4a', '#3f4a5c', '#a09a8a'];
function suitcase(view, p, g) {
  const rig = new Rig(view, g, p), col = rig.wear(rig.pick(['#3a4a5e', '#503a40', '#2e3138', '#8a8478', '#4a5a4a']));
  // The shell on its back, the lid flung open flat beside it (the hinge along local x at z 0), clothes out of both.
  rig.box(0, .07, -.2, .7, .14, .42, col); rig.box(0, .145, -.2, .66, .012, .38, tone(col, -.35));
  rig.box(0, .03, .22, .7, .06, .42, tone(col, -.1)); rig.box(0, .062, .22, .64, .008, .36, tone(col, -.4));
  for (const x of [-.25, 0, .25]) rig.box(x, .15, -.2, .015, .02, .4, tone(col, .15)); // ribs
  rig.box(.36, .09, -.2, .03, .04, .16, C.graphite); rig.box(-.28, .03, -.43, .05, .05, .05, C.black); rig.box(.28, .03, -.43, .05, .05, .05, C.black);
  for (let k = 0; k < 5; k++) rig.box((rig.r() - .5) * .5, .16 + k * .012, -.2 + (rig.r() - .5) * .2, .22 + rig.r() * .12, .025, .16, rig.pick(CLOTHES), [0, rig.r() * 3, 0]);
  for (let k = 0; k < 3; k++) rig.box(-.1 + rig.r() * .5, .02, .3 + rig.r() * .12, .25, .02, .18, rig.pick(CLOTHES), [0, rig.r() * 3, .05]);
  rig.box(.1, .015, .38, .3, .012, .12, rig.pick(CLOTHES), [0, .6, 0]);
}
function stroller(view, p, g) {
  const rig = new Rig(view, g, p), col = rig.wear(rig.pick(['#3e4450', '#4a5a4a', '#5a4a3e', '#2e3138'])), frame = C.steelDark;
  // On its side (local +z up off the ground was its left), trodden flat: the seat
  // bucket, the canopy crushed, the wheels standing out sideways, the handle bent.
  rig.box(0, .13, 0, .55, .24, .36, col, [0, 0, .12]);
  rig.box(-.28, .16, 0, .26, .28, .36, tone(col, -.2), [0, 0, -.5]);         // the canopy, folded
  rig.box(.08, .26, 0, .4, .02, .3, tone(col, .12));
  rig.box(.35, .06, -.2, .5, .04, .04, frame, [0, .2, .05]); rig.box(.35, .06, .2, .5, .04, .04, frame, [0, -.15, .05]);
  rig.box(-.35, .04, 0, .03, .03, .5, frame);
  for (const [x, z] of [[.4, -.26], [.4, .26], [-.3, -.26], [-.3, .26]]) rig.cyl(x, .13 + (z > 0 ? .1 : 0), z > 0 ? .3 : -.3, .09, .04, C.black, 8, [PI / 2, 0, 0]);
  rig.box(.62, .05, 0, .04, .04, .44, frame, [0, 0, .3]); rig.box(.66, .09, 0, .05, .05, .3, C.black);
  rig.box(-.05, .02, .38, .18, .02, .12, '#b8b0a0', [0, .4, 0]); // a dropped blanket
}
function backpack(view, p, g) {
  const rig = new Rig(view, g, p), col = rig.wear(rig.pick(['#2e3138', '#3a4452', '#4a4a48', '#503a40', '#3e4439']));
  rig.box(0, .09, 0, .42, .18, .3, col); rig.box(0, .13, .16, .3, .1, .06, tone(col, -.2)); rig.box(0, .185, -.02, .38, .01, .24, tone(col, .1));
  for (const x of [-.1, .1]) rig.box(x, .02, -.19, .05, .025, .12, C.black, [0, x * 2, 0]);
  rig.box(.16, .19, .05, .012, .012, .18, C.steelMid);
}
function duffel(view, p, g) {
  const rig = new Rig(view, g, p), col = rig.wear(rig.pick(['#2e3138', '#3e4439', '#5a4a3e', '#3a4452']));
  rig.cyl(0, .14, 0, .14, .7, col, 7, [0, 0, PI / 2]); rig.cyl(.36, .14, 0, .145, .02, tone(col, -.3), 7, [0, 0, PI / 2]); rig.cyl(-.36, .14, 0, .145, .02, tone(col, -.3), 7, [0, 0, PI / 2]);
  rig.box(0, .282, 0, .5, .012, .04, C.steelMid); rig.box(.05, .05, .2, .5, .02, .05, C.black, [0, .3, 0]);
  rig.box(-.1, .02, -.2, .3, .02, .12, rig.pick(CLOTHES), [0, .4, 0]);
}
function jacketDropped(view, p, g) {
  const rig = new Rig(view, g, p), col = rig.wear(rig.pick(L.puffers));
  // A puffer on the ground, trodden: the body flat and creased, the sleeves flung, a boot print of grime.
  rig.box(0, .04, 0, .46, .08, .4, col, [0, .15, 0]);
  for (const x of [-.12, .02, .16]) rig.box(x, .082, 0, .015, .012, .38, tone(col, -.25), [0, .15, 0]);
  rig.box(-.32, .035, .12, .34, .07, .12, col, [0, .9, .05]); rig.box(.3, .03, -.14, .3, .06, .11, tone(col, -.08), [0, -.6, 0]);
  rig.box(0, .075, -.2, .3, .04, .08, tone(col, -.15), [0, .15, 0]);
  rig.patch(.06, .085, .06, .09, .05, C.grime, .4, 5);
}
function shoeLost(view, p, g) {
  const rig = new Rig(view, g, p), col = rig.pick([...L.sneakers, ...L.work]), n = (p.v || 0) === 1 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const x = k ? .12 : 0, z = k ? .08 : 0, ry = k ? 1.9 : rig.r() * .6;
    if (k && rig.r() < .5) { rig.box(x, .05, z, .1, .1, .26, col, [0, ry, PI / 2]); continue; } // on its side
    rig.box(x, .04, z, .1, .08, .26, col, [0, ry, 0]); rig.box(x, .01, z, .11, .02, .27, L.sole, [0, ry, 0]);
    rig.box(x - Math.sin(ry) * .06, .09, z - Math.cos(ry) * .06, .08, .04, .1, tone(col, -.2), [0, ry, 0]);
  }
}
function shelterPanel(view, p, g) {
  const rig = new Rig(view, g, p);
  // A shelter's end glass (1.44 x 2.2, the frame the shelters' own) lying flat, starred and trodden;
  // shards round it, the frame's post snapped off.
  rig.box(0, .03, 0, 2.2, .025, 1.4, C.glass, [0, 0, .02]);
  for (const [x, z, w, d] of [[0, -.72, 2.26, .06], [0, .72, 2.26, .06], [-1.12, 0, .06, 1.44], [1.12, 0, .06, 1.44]]) rig.box(x, .035, z, w, .045, d, C.graphite);
  for (let k = 0; k < 7; k++) { const a = k * .9 + rig.r() * .4, l = .3 + rig.r() * .5; rig.box(.3 + Math.cos(a) * l / 2, .046, -.1 + Math.sin(a) * l / 2, l, .004, .012, C.glassPale, [0, -a, 0]); }
  rig.box(-.4, .047, .3, .5, .003, .3, C.grime, [0, .3, 0]); // a footprint of grime
  for (let k = 0; k < 8; k++) rig.box((rig.r() - .5) * 2.1, .012, (rig.r() > .5 ? 1 : -1) * (.78 + rig.r() * .12), .07 + rig.r() * .07, .012, .05, C.glassPale, [0, rig.r() * 3, 0]);
  rig.box(1.2, .06, .45, .1, .1, .5, C.graphite, [0, .2, PI / 2]);
}
function belongingsHeap(view, p, g) {
  const rig = new Rig(view, g, p);
  // Cases, bags and coats dropped where the crowd stopped: low, spread against each other.
  const bag = (x, z, w, h, d, col, ry) => { rig.box(x, h / 2, z, w, h, d, col, [0, ry, 0]); rig.box(x, h + .004, z, w * .8, .008, d * .6, tone(col, -.25), [0, ry, 0]); };
  bag(-.5, -.15, .6, .16, .4, rig.wear('#3a4a5e'), .2);
  bag(.1, -.2, .45, .2, .3, rig.wear('#2e3138'), -.3);
  bag(.55, .1, .5, .14, .36, rig.wear('#503a40'), .6);
  bag(-.1, .22, .7, .12, .44, rig.wear('#8a8478'), -.1);
  rig.box(-.2, .27, -.02, .5, .12, .34, rig.wear('#3e4439'), [0, .5, .12]); // a case on top
  rig.cyl(.7, .12, -.3, .12, .5, rig.wear('#4a4a48'), 7, [0, .8, PI / 2]);
  rig.box(-.75, .03, .3, .4, .05, .3, rig.pick(L.puffers), [0, .9, 0]);
  rig.box(.35, .33, -.1, .3, .03, .2, rig.pick(CLOTHES), [0, 1.2, .1]);
  for (let k = 0; k < 4; k++) rig.box((rig.r() - .5) * 1.5, .015, .35 + rig.r() * .12, .18, .03, .12, rig.pick(CLOTHES), [0, rig.r() * 3, 0]);
}

// The toppled ad pillar (1.2 x 1.2 x 2.8 standing: world/lumen-furniture.js
// adPillar's shape) lying on its side along local x, its foot (the plinth,
// torn off with it) at -x; the two screens (now facing +z and -z sideways)
// dead: cracked black glass; the cap's light strip out.
function adPillarDown(view, p, g) {
  const rig = new Rig(view, g, p, true);
  rig.group(0, .6, 0, 0, 0, PI / 2, () => rig.group(0, 0, 0, 0, PI / 2, 0, () => { // (stood on end: local y along the pillar, toward -x; turned so a dead screen faces up)
    rig.box(0, -1.27, 0, 1.2, .26, 1.2, C.concreteDark);
    rig.box(0, .05, 0, 1.04, 2.3, 1.14, C.panel);
    for (const [x, z] of [[-.53, -.58], [.53, -.58], [-.53, .58], [.53, .58]]) rig.box(x, 0, z, .1, 2.6, .1, C.steelMid);
    rig.box(0, 1.32, 0, 1.2, .16, 1.2, C.graphite);
    rig.box(0, 1.22, .56, 1, .04, .04, C.steelDark); rig.box(0, 1.22, -.56, 1, .04, .04, C.steelDark);
    for (const s of [-1, 1]) {
      rig.box(0, .2, s * .572, .96, 1.9, .012, C.black);
      for (let k = 0; k < 5; k++) rig.box((rig.r() - .5) * .6, .2 + (rig.r() - .5) * 1.4, s * .58, .5 + rig.r() * .3, .01, .004, C.glassDark, [0, 0, rig.r() * 3]);
    }
    rig.box(-.524, .2, 0, .02, 1.4, .8, C.graphite); rig.box(.524, .2, 0, .02, 1.4, .8, C.graphite);
  }));
  // Chunks of the plinth's footing and a cable torn out with it.
  rig.box(-1.3, .06, .42, .2, .12, .16, C.concreteDark, [0, .5, 0]); rig.box(-1.32, .04, -.45, .14, .08, .12, C.concrete, [0, 1.2, 0]);
  rig.cyl(-1.33, .05, .1, .025, .3, C.black, 5, [0, 1.2, PI / 2]);
}

// The jammed revolving door (prop frame: local +z out from the facade, the
// facade at z -.52): the front half of the drum standing out of the wall,
// curved glass on a steel frame, a rim band over it (no roof), the floor plate; the four
// wings jammed at a skew, a bag caught between a wing and the drum, a shoe on
// the plate. A cold light strip under the header.
function revolvingDoor(view, p, g) {
  const rig = new Rig(view, g, p, true), R = 1.02, cz = -.5, steel = C.steelMid;
  rig.group(0, 0, cz, 0, 0, 0, () => {
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const a = i / n * PI, x = Math.cos(a) * R, z = Math.sin(a) * R;
      rig.box(x, 1.2, z, .06, 2.4, .06, steel);
      if (i < n) {
        const b = (i + .5) / n * PI, w = 2 * R * Math.sin(PI / n / 2);
        // (two panels are the drum's open mouths: the wings jam across them)
        if (i === 1 || i === n - 2) continue;
        rig.box(Math.cos(b) * R * .985, 1.2, Math.sin(b) * R * .985, w, 2.3, .03, C.glass, [0, PI / 2 - b, 0]);
      }
    }
    // The rim (a band round the drum's top) and the floor plate; no roof over it, so from above
    // the drum reads as it does on a plan: a half circle cut by the wings' cross.
    for (let i = 0; i < n; i++) { const b = (i + .5) / n * PI, w = 2 * R * Math.sin(PI / n / 2) + .04; rig.box(Math.cos(b) * R, 2.44, Math.sin(b) * R, w, .12, .07, C.graphite, [0, PI / 2 - b, 0]); }
    half(rig, 0, .02, R, .04, C.steelDark);
    rig.box(0, 2.44, .03, 2 * R + .1, .12, .06, C.graphite); // (the header along the facade)
    // The wings, jammed at a skew (one would turn them; one is bent).
    const skew = .42;
    for (let k = 0; k < 4; k++) {
      const a = skew + k * PI / 2;
      if (Math.sin(a) < -.05) continue; // (behind the facade)
      const len = R - .06, bent = k === 1 ? .25 : 0;
      rig.group(0, 0, 0, 0, -a, 0, () => {
        rig.box(len / 2, 1.2, 0, len, 2.2, .025, C.glassPale, [0, bent, 0]);
        rig.box(len / 2, .06, 0, len, .08, .05, steel); rig.box(len / 2, 2.32, 0, len, .06, .05, steel);
        rig.box(len - .02, 1.2, 0, .05, 2.2, .05, steel);
      });
    }
    rig.cyl(0, 1.2, 0, .05, 2.4, steel, 6);
    // Caught in it: a handbag between a wing and the glass; a shoe on the plate.
    rig.box(Math.cos(.3) * .8, .95, Math.sin(.3) * .8, .3, .22, .1, '#503a40', [0, -.3, .2]);
    rig.box(.3, .08, .6, .1, .08, .26, L.sneakers[0], [0, .8, 0]);
  });
  // The light strip under the header (cold white, dimmed; the city's one lit material, world/lumen-glow.js).
  litBox(view, g, 0, 2.36, cz + .06, 1.8, .03, .03, C.litWhite, .7);
}

// The front half of a drum (theta across +z): the floor plate ends at the facade.
function half(rig, x, y, r, h, col) {
  const m = rig.view.mesh(new THREE.CylinderGeometry(r, r, h, 10, 1, false, -PI / 2, PI), col, x, y, 0, rig.top);
  m.castShadow = rig.cast; return m;
}

// --- The abandoned checkpoint ------------------------------------------------------------
// Tape: lemon and black stripes (no text), torn in strands trailing along the road.
function checkpointTape(view, p, g) {
  const rig = new Rig(view, g, p), lemon = C.hazard, black = C.black;
  for (let s = 0; s < 3; s++) {
    let x = -1.4 + rig.r() * .3, z = -.3 + s * .3 + (rig.r() - .5) * .1, a = (rig.r() - .5) * .4;
    const n = 7 + Math.floor(rig.r() * 8);
    for (let k = 0; k < n && x < 1.45; k++) {
      const l = .16; a += (rig.r() - .5) * .5; a = Math.max(-.9, Math.min(.9, a));
      const nx = x + Math.cos(a) * l, nz = Math.max(-.4, Math.min(.4, z + Math.sin(a) * l));
      rig.box((x + nx) / 2, .006 + (k % 2) * .001, (z + nz) / 2, l + .01, .004, .05, k % 2 ? black : lemon, [0, -Math.atan2(nz - z, nx - x), 0]);
      x = nx; z = nz;
    }
    rig.box(x + .03, .007, z, .06, .004, .03, lemon, [0, .7, 0]); // the torn end
  }
}
function casings(view, p, g) {
  const rig = new Rig(view, g, p);
  for (let k = 0; k < 22; k++) {
    const a = rig.r() * PI * 2, d = Math.sqrt(rig.r()) * .5;
    rig.box(Math.cos(a) * d * 1.1, .007, Math.sin(a) * d * .8, .03, .012, .012, k % 5 ? '#9a8a5a' : '#7a6e4a', [0, rig.r() * 3, 0]);
  }
  rig.box(.3, .01, .2, .08, .02, .05, C.black, [0, .6, 0]); // a dropped magazine
}
// A folding sign knocked flat: a lemon board with the black biohazard trefoil
// (three crescents round a ring: a pictogram), its legs folded under.
function trefoilSign(view, p, g) {
  const rig = new Rig(view, g, p), lemon = C.hazard, black = C.black;
  rig.box(0, .025, 0, .62, .03, .78, lemon);
  rig.box(0, .022, 0, .66, .026, .82, C.graphite);
  rig.box(0, .06, .5, .6, .03, .06, C.graphite); rig.box(0, .055, -.5, .6, .03, .06, C.graphite);
  const y = .042;
  // (three black discs, each cut by a lemon one further out: the crescents; a lemon gap round the middle, a black ring in it)
  for (let k = 0; k < 3; k++) { const a = k * 2 * PI / 3 + PI / 2; rig.cyl(Math.cos(a) * .105, y, Math.sin(a) * .105, .1, .004, black, 12); }
  for (let k = 0; k < 3; k++) { const a = k * 2 * PI / 3 + PI / 2; rig.cyl(Math.cos(a) * .158, y + .002, Math.sin(a) * .158, .068, .004, lemon, 12); }
  rig.cyl(0, y + .004, 0, .05, .004, lemon, 12); rig.cyl(0, y + .006, 0, .038, .004, black, 12); rig.cyl(0, y + .008, 0, .022, .004, lemon, 10);
  rig.box(0, .012, .1, .7, .02, .1, C.steelDark, [0, .5, 0]);
}

// --- Registration --------------------------------------------------------------------
export const BODY_MODELS = Object.freeze({
  cityBodyDriver: driver, cityBodyCoat: coatBody, cityBodyPile: bodyPile, cityBloodDried: bloodDried, cityDragMarks: dragMarks,
  citySuitcase: suitcase, cityStroller: stroller, cityBackpack: backpack, cityDuffel: duffel, cityJacketDropped: jacketDropped,
  cityShoeLost: shoeLost, cityShelterPanel: shelterPanel, cityBelongingsHeap: belongingsHeap, cityAdPillarDown: adPillarDown,
  cityRevolvingDoor: revolvingDoor, cityCheckpointTape: checkpointTape, cityCasings: casings, cityTrefoilSign: trefoilSign,
});
for (const [type, make] of Object.entries(BODY_MODELS)) registerLumenModel(type, make);
