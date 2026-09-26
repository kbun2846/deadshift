// Hollow Wick's breakables (stage 2, task s2-breakables): ten things a 1790s
// New England village leaves lying about in late autumn, each with its own
// model here and its own way of coming apart (effects/breakable-effects.js)
// and its own sound (effects/breakable-sounds.js). Deadwater's barrels and
// crates are untouched; these are separate types, spread into PROP_TYPES.
//
// Sizes are the footprint the simulation collides with (map-kit.js
// mapColliders: one box w x d, or collisionBoxes). Health follows the game's
// rule for scenery (5: one orb clears it on the way through), with the three
// big wooden ones sturdier (a coop, a wheelbarrow, a cordwood stack). None is
// ankle-high, so none is walk-over. Models are built from y 0 up (makeProp
// sets the group on the ground) in the map's dull palette, a few boxes and
// cylinders each, merged by the prop batches like every other breakable.
import * as THREE from 'three';
import { settle } from './settle.js';

export const HOLLOW_BREAKABLES = Object.freeze({
  pumpkin: { w: .8, d: .8, health: 5 },
  ciderKeg: { w: 1.3, d: .72, health: 5 },
  appleCrate: { w: 1, d: .72, health: 5 },
  grainSacks: { w: 1.25, d: .95, health: 5 },
  chickenCoop: { w: 1.6, d: 1, health: 8 },
  beeSkep: { w: .8, d: .8, health: 5 },
  stoneware: { w: 1.05, d: .8, health: 5 },
  tinLantern: { w: .42, d: .42, health: 3 },
  cordwood: { w: 1.9, d: .85, health: 12 },
  squashBarrow: { w: 1.9, d: .82, health: 8 },
});

// The palette (design notes): dull, with the oranges and yellows popping.
export const HB = Object.freeze({
  pumpkin: '#b8612a', pumpkinDark: '#9a4f22', stem: '#4a4030', husk: '#6e5a34',
  wood: '#6b5842', woodDark: '#4e4030', woodPale: '#8a7658', weathered: '#7d7a72', barnRed: '#7a3a2e',
  iron: '#3b3632', shingle: '#3a3632', sacking: '#857655', sackingDark: '#6f6246', twine: '#4a4030',
  apple: '#7e2a20', russet: '#9a5a2a', appleGold: '#b08a3c', straw: '#a8925a', strawDark: '#8f7a48',
  stone: '#8f887a', stoneDark: '#6f6a60', cobalt: '#4a5470', tin: '#6a6862', tinDark: '#4c4b47', candle: '#e0a24c',
  bark: '#3b322c', split: '#8a6a44', squashGold: '#c49a3a', squashGrey: '#6a7258',
});

// The candle inside a lantern is lit (someone lit them, and no one is left to
// put them out): an unlit-looking colour would read as dead tin. Shared by
// every lantern, so the batches merge them into one draw.
let glowMaterial = null;
const lanternGlow = () => glowMaterial ||= new THREE.MeshBasicMaterial({ color: HB.candle, toneMapped: false });

// A stable pseudo-random number per prop (0..1), so the same pumpkin is the
// same shape every load and on every player's screen.
const seeded = (p, k = 0) => { const s = Math.sin(p.x * 12.9898 + p.z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };

export function makeHollowBreakable(view, p, g) {
  const box = (x, y, z, w, h, d, c, parent = g) => view.box(x, y, z, w, h, d, c, parent);
  const cyl = (x, y, z, r, h, c, seg = 8, top = r, parent = g) => view.cylinder(x, y, z, r, h, c, parent, seg, top);
  const ball = (x, y, z, r, c, sy = 1, parent = g) => { const m = view.mesh(new THREE.IcosahedronGeometry(r, 0), c, x, y, z, parent); m.scale.y = sy; return m; };
  const t = p.type, r = k => seeded(p, k);

  if (t === 'pumpkin') {
    // Squat and lobed: two eight-sided spheres a sixteenth of a turn apart,
    // in two oranges, read from above as ribs. A dry stem and a curl of husk.
    for (const [turn, colour, s] of [[0, HB.pumpkin, 1], [Math.PI / 8, HB.pumpkinDark, .96]]) {
      const lobe = view.mesh(new THREE.SphereGeometry(.36 * s, 8, 5), colour, 0, .23, 0, g);
      lobe.scale.set(1, .64, 1); lobe.rotation.y = turn;
    }
    const stem = cyl(0, .5, 0, .045, .14, HB.stem, 5, .03); stem.rotation.z = (r(1) - .5) * .6;
    const leaf = box(.1, .46, .06, .2, .02, .12, HB.husk); leaf.rotation.set(.2, r(2) * 3, .15);
  } else if (t === 'ciderKeg') {
    // A keg on its side on a trestle, a spigot at the tap end and a tin cup
    // left on the trestle's rail.
    for (const x of [-.42, .42]) for (const side of [-1, 1]) {
      const leg = box(x, .3, side * .2, .07, .66, .07, HB.woodDark); leg.rotation.x = side * .38;
    }
    for (const x of [-.42, .42]) box(x, .58, 0, .09, .07, .42, HB.wood);
    box(0, .16, 0, .9, .05, .05, HB.woodDark);
    const keg = cyl(0, .92, 0, .32, .86, HB.woodPale, 10, .32); keg.rotation.z = Math.PI / 2;
    for (const x of [-.38, -.13, .13, .38]) { const hoop = cyl(x, .92, 0, Math.abs(x) > .3 ? .305 : .33, .045, HB.iron, 10); hoop.rotation.z = Math.PI / 2; }
    const head = cyl(.44, .92, 0, .28, .02, HB.wood, 10); head.rotation.z = Math.PI / 2;
    box(.5, .82, 0, .1, .05, .05, HB.woodDark); box(.54, .78, 0, .03, .07, .03, HB.woodDark);
    cyl(-.62, .06, .18, .06, .12, HB.tin, 7);
  } else if (t === 'appleCrate') {
    // Slatted, open-topped, heaped with late apples; two have rolled off.
    for (const y of [.08, .25, .42]) for (const side of [-1, 1]) {
      box(0, y, side * .32, .94, .1, .04, y === .25 ? HB.woodPale : HB.wood);
      box(side * .45, y, 0, .04, .1, .64, HB.wood);
    }
    for (const [x, z] of [[-.45, -.32], [.45, -.32], [-.45, .32], [.45, .32]]) box(x, .24, z, .07, .48, .07, HB.woodDark);
    box(0, .04, 0, .9, .04, .6, HB.woodDark);
    const colours = [HB.apple, HB.russet, HB.apple, HB.appleGold, HB.russet];
    for (let i = 0; i < 12; i++) {
      const col = i % 4, row = Math.floor(i / 4);
      ball(-.3 + col * .2 + (row % 2) * .08, .44 + (row === 1 ? .06 : 0), -.18 + row * .18, .09, colours[i % 5], .9);
    }
    ball(.66, .08, .3, .085, HB.apple, .9); ball(.58, .08, -.4, .085, HB.appleGold, .9);
  } else if (t === 'grainSacks') {
    // Two sacks lying, one standing with its neck tied, leaning on them.
    for (const [x, z, a] of [[-.28, -.18, .12], [.3, .08, -.2]]) {
      const sack = ball(x, .2, z, .36, x < 0 ? HB.sacking : HB.sackingDark, .55); sack.scale.x = 1.3; sack.rotation.y = a;
    }
    const upright = cyl(-.08, .42, .26, .26, .6, HB.sacking, 7, .2); upright.rotation.x = -.15;
    cyl(-.08, .76, .33, .11, .12, HB.sackingDark, 6, .06);
    cyl(-.08, .72, .32, .12, .03, HB.twine, 6);
    // A little grain already spilt from a split seam.
    ball(.5, .03, -.32, .16, HB.straw, .25);
  } else if (t === 'chickenCoop') {
    // A small coop on legs: plank sides, a slatted run door on the front,
    // a shingle pitch and a cleated ramp. Empty (no birds anywhere in the map).
    for (const [x, z] of [[-.65, -.35], [.65, -.35], [-.65, .35], [.65, .35]]) box(x, .15, z, .08, .3, .08, HB.woodDark);
    box(0, .55, 0, 1.4, .5, .8, HB.weathered);
    box(0, .31, 0, 1.44, .06, .84, HB.woodDark);
    for (let i = 0; i < 5; i++) box(-.4 + i * .2, .55, .42, .05, .44, .03, HB.woodDark);
    for (const side of [-1, 1]) { const roof = box(0, .93, side * .23, 1.56, .05, .55, HB.shingle); roof.rotation.x = side * .52; }
    box(0, 1.08, 0, 1.58, .06, .08, HB.woodDark);
    for (const side of [-1, 1]) box(side * .7, .86, 0, .04, .22, .6, HB.weathered);
    const ramp = box(.95, .17, .22, .52, .03, .2, HB.wood); ramp.rotation.z = .55;
    for (let i = 0; i < 3; i++) ball(-.3 + i * .35, .02, .62 + (i % 2) * .08, .1, HB.straw, .15);
  } else if (t === 'beeSkep') {
    // A coiled straw skep on a stool: a stack of shrinking coils, two straws
    // alternating, and the dark mouth at its foot. Quiet now.
    for (const [x, z] of [[-.28, -.28], [.28, -.28], [-.28, .28], [.28, .28]]) box(x, .22, z, .06, .44, .06, HB.woodDark);
    box(0, .46, 0, .7, .06, .7, HB.wood);
    const coils = [[.3, .12], [.3, .12], [.28, .11], [.24, .1], [.18, .09], [.1, .08]];
    let y = .52;
    coils.forEach(([rad, h], i) => { cyl(0, y + h / 2, 0, rad, h, i % 2 ? HB.strawDark : HB.straw, 9, i === coils.length - 1 ? .04 : rad * .92); y += h * .92; });
    box(0, .54, .28, .12, .06, .06, '#231d1a');
  } else if (t === 'stoneware') {
    // Salt-glazed crocks and a jug by a wall: grey, with a dull cobalt band
    // (the one blue in the village), a board lid on the big one.
    cyl(-.22, .25, -.05, .25, .5, HB.stone, 9, .23);
    cyl(-.22, .32, -.05, .255, .06, HB.cobalt, 9);
    cyl(-.22, .52, -.05, .24, .04, HB.woodPale, 9);
    cyl(.24, .17, -.14, .17, .34, HB.stoneDark, 8, .15);
    cyl(.24, .35, -.14, .13, .03, '#2e2b27', 8);
    // The jug: a belly, a shoulder, a neck and a loop handle.
    const jx = .22, jz = .2;
    ball(jx, .17, jz, .17, HB.stone, 1.05);
    cyl(jx, .36, jz, .07, .12, HB.stone, 7, .05);
    cyl(jx, .43, jz, .05, .03, HB.stoneDark, 7);
    const handle = view.mesh(new THREE.TorusGeometry(.07, .02, 4, 8, Math.PI), HB.stone, jx + .1, .3, jz, g); handle.rotation.z = -Math.PI / 2;
  } else if (t === 'tinLantern') {
    // A pierced-tin lantern hung from a post's crook: a cone cap, a ring
    // handle, a tin drum in slats with the candle's light between them.
    box(0, .8, 0, .12, 1.6, .12, HB.woodDark);
    box(0, .02, 0, .3, .04, .3, HB.woodDark);
    box(.17, 1.55, 0, .34, .07, .07, HB.woodDark);
    const x = .3;
    view.mesh(new THREE.CylinderGeometry(.08, .08, .22, 7), lanternGlow(), x, 1.2, 0, g);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; box(x + Math.cos(a) * .1, 1.2, Math.sin(a) * .1, .04, .24, .04, HB.tin).rotation.y = -a; }
    cyl(x, 1.08, 0, .11, .03, HB.tinDark, 8);
    view.mesh(new THREE.ConeGeometry(.13, .16, 8), HB.tin, x, 1.39, 0, g);
    cyl(x, 1.49, 0, .015, .1, HB.tinDark, 4);
  } else if (t === 'cordwood') {
    // Split cordwood between two stakes, three rows, the ends showing pale
    // split faces, and a couple of splits dropped in front (lying flat: the
    // chopping block it had stood outside its collider, stage 4 audit).
    for (let row = 0; row < 3; row++) for (let i = 0; i < 6 - row; i++) {
      const z = (i - (5 - row) / 2) * .13, y = .09 + row * .16;
      const log = cyl(0, y, z, .085, 1.5 - row * .1, i % 2 ? HB.bark : '#5a4a3c', 5); log.rotation.z = Math.PI / 2; log.rotation.x = i * .9;
      const end = cyl((1.5 - row * .1) / 2 + .005, y, z, .08, .01, HB.split, 5); end.rotation.z = Math.PI / 2; end.rotation.x = i * .9;
    }
    for (const x of [-.82, .82]) for (const z of [-.42, .42]) box(x, .45, z, .07, .9, .07, HB.woodDark);
    for (const [x, a] of [[-.5, .5], [.35, -.3]]) { const s = box(x, .05, .56, .5, .09, .12, HB.split); s.rotation.y = a; }
  } else if (t === 'squashBarrow') {
    // A wooden wheelbarrow (a solid plank wheel, a splayed tray, two long
    // handles and legs) heaped with squash in three colours.
    const wheel = cyl(-.82, .26, 0, .26, .08, HB.woodDark, 10); wheel.rotation.x = Math.PI / 2;
    cyl(-.82, .26, 0, .06, .16, HB.iron, 6).rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) { const handle = box(.15, .42, side * .26, 1.7, .06, .06, HB.wood); handle.rotation.z = -.08; box(.25, .2, side * .26, .06, .4, .06, HB.woodDark); }
    box(-.15, .48, 0, .9, .05, .6, HB.wood);
    for (const side of [-1, 1]) { const wall = box(-.15, .6, side * .33, .92, .2, .04, HB.woodPale); wall.rotation.x = side * .3; }
    box(-.6, .6, 0, .04, .22, .6, HB.woodPale); box(.3, .6, 0, .04, .22, .6, HB.woodPale);
    const squash = [HB.squashGold, HB.squashGrey, HB.pumpkin, HB.squashGold, HB.squashGrey];
    for (let i = 0; i < 5; i++) {
      const s = ball(-.42 + (i % 3) * .27, .66 + (i > 2 ? .12 : 0), (i % 2 ? .12 : -.13) + (i > 2 ? .05 : 0), .15 + (i % 2) * .03, squash[i], .8);
      s.scale.x = i % 2 ? 1.4 : 1;
    }
  }
  // The data's size (a big pumpkin, a small one): map-kit scales the collider
  // by it too (stage 4 audit: it was never drawn).
  if (p.scale && p.scale !== 1) g.scale.setScalar(p.scale);
  // Settled to the low side of a slope (world/settle.js).
  const T = HOLLOW_BREAKABLES[t]; if (T) settle(view, p, g, T.w * (p.scale || 1), T.d * (p.scale || 1));
}
