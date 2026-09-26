// Hollow Wick's burying ground and fieldstone walls (stage 2, task
// s2-graveyard): the prop types (GRAVE_TYPES, spread into PROP_TYPES in
// map-kit.js) and their models (makeGrave, called from makeProp in
// render/world-build.js). The placements are data in
// src/maps/hollow-wick-graveyard.js (made by tools/graveyard-layout.mjs).
//
// A burying ground of about 1790-1820: slate headstones with a rounded head
// and shoulders (some leaning, a few fallen), small footstones, table tombs,
// low fieldstone plot walls and granite posts with wooden rails; no iron, no
// obelisks, no lettering. Everything is a few chunky boxes and cylinders in
// the design palette, so it merges into a handful of draws.
//
// Gameplay (AGENTS.md > Hollow Wick graveyard): headstones break like
// Deadwater's crates (slate shards and a thud) and leave their stump, a
// separate solid prop that stays as a little low cover. Table tombs, plot
// walls, big stones and wall runs are solid. `coverHeight` is the collider's
// height (map-kit.js mapColliders): low cover meets a round only at its own
// height (rifle.js roundMeets). Dressing (grave turf and footstones, fallen
// stones, mounds, the open grave, the skeleton) has no collider at all
// (`collisionBoxes: []`): walked over, never stops a round or an orb.
import * as THREE from 'three';
import { settle } from './settle.js';

export const SLATE = '#4c4f52', SLATE_TOP = '#5f5c56', LICHEN = '#8b8a80', MOSS = '#56603f';
export const FIELDSTONE = '#7f7b72', FIELDSTONE_DARK = '#5f5c56', CAP = '#8b8a80', RETAIN = '#6a665c';
const TURF = '#4d4535', EARTH = '#6a5238', EARTH_DARK = '#4e3c2a', HOLE = '#1c1714', BONE = '#e2d6b8';
const RAIL = '#6f6252', GRANITE = '#8e8c86', HAFT = '#7a6446', BLADE = '#3f4140';

// Lengths of the fieldstone wall runs (a type per length: a prop's footprint
// comes from its type).
export const WALL_LENGTHS = [2, 3, 4, 5, 6];
const NONE = [];
export const GRAVE_TYPES = {
  // Breakable: the stone above its stump. Thin east-west, broad north-south.
  headstone: { w: .2, d: .72, health: 5, coverHeight: .9 },
  // What a broken headstone leaves: solid, knee-high, narrower than the stone.
  headstoneStump: { w: .16, d: .46, health: null, coverHeight: .35 },
  // Solid cover.
  bigStone: { w: .3, d: 1.34, health: null, coverHeight: 1.05 },
  tableTomb: { w: 1.94, d: 1.04, health: null, coverHeight: .8 },
  ...Object.fromEntries(WALL_LENGTHS.map(n => ['fieldWall' + n, { w: n, d: .55, health: null, coverHeight: 1 }])),
  // Granite posts with two wooden rails round a plot (3.4 x 4.6, open on the
  // east): only the posts are solid; the rails stop nothing.
  railPlot: { w: 3.4, d: 4.6, health: null, coverHeight: 1,
    collisionBoxes: [[-1.6, -2.2, .26, .26], [-1.6, 0, .26, .26], [-1.6, 2.2, .26, .26], [0, -2.2, .26, .26], [0, 2.2, .26, .26], [1.6, -2.2, .26, .26], [1.6, 2.2, .26, .26]] },
  // Dressing: no collider.
  grave: { w: .9, d: .7, health: null, collisionBoxes: NONE },
  fallenStone: { w: .7, d: .5, health: null, collisionBoxes: NONE },
  freshMound: { w: 1, d: .8, health: null, collisionBoxes: NONE },
  openGrave: { w: 1.2, d: .8, health: null, collisionBoxes: NONE },
  graveSkeleton: { w: .5, d: .4, health: null, collisionBoxes: NONE },
};

// A small deterministic random per prop (the same stones lean the same way on
// every load and every machine).
function seeded(p) {
  let s = (Math.round(p.x * 100) * 73856093 ^ Math.round(p.z * 100) * 19349663) >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Lays a child group on the slope under the prop (for flat things: turf,
// mounds, a fallen stone), in the prop's own turned frame.
function onSlope(view, p, g) {
  const t = new THREE.Group(); g.add(t);
  const gr = view.ground?.gradientAt ? view.ground.gradientAt(p.x, p.z) : { x: 0, z: 0 };
  const a = p.angle || 0, c = Math.cos(a), s = Math.sin(a);
  const sx = gr.x * c - gr.z * s, sz = gr.x * s + gr.z * c;
  t.rotation.set(-Math.atan(sz), 0, Math.atan(sx));
  return t;
}

// The head of a slate stone: a round tympanum between two lower shoulders,
// the stone's face to the east (+x). `w` wide (z), `h` to the shoulders.
function stoneHead(view, parent, w, h, t, v, rand) {
  const box = (x, y, z, bw, bh, bd, c) => view.box(x, y, z, bw, bh, bd, c, parent);
  const cyl = (y, z, r, c, seg) => { const m = view.cylinder(0, y, z, r, t, c, parent, seg); m.rotation.z = Math.PI / 2; return m; };
  box(0, h / 2, 0, t, h, w, SLATE);
  if (v === 2) {
    // A plain square-topped stone with a bevelled cap.
    box(0, h + .03, 0, t + .02, .06, w + .02, SLATE_TOP);
    return h + .06;
  }
  const r = w * (v === 1 ? .42 : .34);
  cyl(h, 0, r, SLATE_TOP, 10);
  // Shoulders: quarter rounds either side of the head.
  for (const side of [-1, 1]) cyl(h - .02, side * (w / 2 - w * .1), w * .1, SLATE_TOP, 6);
  if (v === 3) box(0, h + r * .55, 0, t + .004, .04, r * 1.2, SLATE_TOP); // a carved finial ridge
  return h + r;
}

// Lichen and moss spots: on stones only.
function weather(view, parent, t, w, top, rand, amount = 1) {
  const n = Math.floor(rand() * 3 * amount);
  for (let i = 0; i < n; i++) {
    const y = .25 + rand() * (top - .35), z = (rand() - .5) * w * .7, side = rand() < .6 ? 1 : -1;
    view.box(side * (t / 2 + .004), y, z, .01, .07 + rand() * .08, .06 + rand() * .1, rand() < .55 ? LICHEN : MOSS, parent);
  }
  if (rand() < .5 * amount) view.box(0, top - .01, (rand() - .5) * w * .3, t * .7, .025, .09, rand() < .5 ? MOSS : LICHEN, parent);
  // Moss creeping up from the turf at the foot.
  if (rand() < .6 * amount) view.box(.02, .06, (rand() - .5) * w * .5, t + .03, .12, .12 + rand() * .15, MOSS, parent);
}

// A run of dry-laid fieldstone, `len` long along local x, about 1 m high,
// with a lighter cap. Built from y -.15 so it never floats on a slope, and
// each stone at the ground under it (`lift(x)`: along a slope the run steps
// with the ground; stage 4 audit: the uphill end of a plot wall was buried
// half its height).
function fieldWall(view, g, len, rand, lift = () => 0) {
  const n = Math.max(2, Math.round(len / .62)), step = len / n;
  for (let row = 0; row < 3; row++) {
    const shift = row % 2 ? step / 2 : 0, y = -.15 + row * .34;
    for (let i = 0; i < n; i++) {
      let x0 = -len / 2 + i * step + shift, x1 = Math.min(len / 2, x0 + step);
      if (row % 2 && i === 0) x0 = -len / 2;
      if (x1 - x0 < .08) continue;
      const b = view.box((x0 + x1) / 2, y + .165 + lift((x0 + x1) / 2), (rand() - .5) * .05, x1 - x0 - .04, .32 + rand() * .03, .52 - row * .05, (i + row) % 3 ? FIELDSTONE : FIELDSTONE_DARK, g);
      b.rotation.y = (rand() - .5) * .06;
    }
  }
  // Cap stones, a little proud and uneven, with a gap here and there.
  for (let i = 0; i < n; i++) {
    if (rand() < .12) continue;
    const b = view.box(-len / 2 + (i + .5) * step, .93 + rand() * .05 + lift(-len / 2 + (i + .5) * step), (rand() - .5) * .05, step - .06, .12, .42 + rand() * .08, CAP, g);
    b.rotation.y = (rand() - .5) * .12;
  }
  // A stone or two fallen off at the foot.
  if (rand() < .6) { const x = (rand() - .5) * len * .8, b = view.box(x, .05 + lift(x), (rand() < .5 ? -1 : 1) * .45, .3, .16, .24, FIELDSTONE, g); b.rotation.y = rand() * 3; }
  if (rand() < .4) { const x = (rand() - .5) * len * .7; view.box(x, .02 + lift(x), (rand() < .5 ? -1 : 1) * .3, .5, .08, .16, MOSS, g); }
}

// A squashed, faceted lump (earth, clods): a low-poly half ellipsoid.
const LUMP = new THREE.IcosahedronGeometry(1, 0);
function lump(view, parent, x, y, z, rx, ry, rz, colour) {
  const m = view.mesh(LUMP, colour, x, y, z, parent); m.scale.set(rx, ry, rz); if (rx < .2) m.rotation.y = x * 3.1 + z; return m;
}

function skeleton(view, g) {
  // Slumped against the stone behind it (to the west, -x), legs out east,
  // the head fallen onto its shoulder. Bones only: ivory, flat-shaded.
  const bone = (x, y, z, len, r, rx, rz, parent = g) => { const m = view.cylinder(x, y, z, r, len, BONE, parent, 5, r * .85); m.rotation.set(rx, 0, rz); return m; };
  const knob = (x, y, z, r) => view.mesh(new THREE.IcosahedronGeometry(r, 0), BONE, x, y, z, g);
  // Pelvis on the turf, spine leaning back to the stone.
  const pelvis = view.box(.02, .1, 0, .16, .1, .3, BONE, g); pelvis.rotation.z = -.2;
  for (let i = 0; i < 6; i++) view.box(-.02 - i * .045, .18 + i * .075, 0, .05, .045, .06, BONE, g);
  // Ribs: arcs round the leaning spine.
  for (let i = 0; i < 4; i++) {
    const cage = new THREE.Group(); cage.position.set(.02 - i * .045, .3 + i * .07, 0); cage.rotation.z = .55; g.add(cage);
    const rib = view.mesh(new THREE.TorusGeometry(.13 - i * .012, .014, 3, 8, Math.PI * 1.5), BONE, 0, 0, 0, cage);
    rib.rotation.set(Math.PI / 2, 0, -Math.PI * .25);
  }
  // The skull on its shoulder, the jaw dropped open beside it.
  const skull = view.mesh(new THREE.IcosahedronGeometry(.11, 1), BONE, -.14, .66, .12, g); skull.scale.set(.95, .85, .8);
  view.box(-.1, .67, .12, .06, .04, .09, '#2a2320', g).position.x = -.04; // the eye sockets' shadow, to the east
  const jaw = view.box(-.02, .56, .17, .08, .03, .1, BONE, g); jaw.rotation.set(.4, 0, .3);
  // Arms: one down in the lap, one fallen to the turf.
  bone(.02, .32, -.16, .3, .022, 0, -1.1);
  bone(.2, .2, -.12, .26, .02, .3, -1.35);
  bone(-.02, .3, .18, .3, .022, -.2, -.9);
  bone(.14, .05, .32, .26, .02, Math.PI / 2, .2);
  for (let i = 0; i < 4; i++) knob(.3 + i * .03, .03, .38 + (i % 2) * .04, .018);
  // Legs out to the east, one knee up, one foot gone.
  for (const [z, knee] of [[-.1, .22], [.1, 0]]) {
    const femur = bone(.24, .1 + knee / 2, z, .44, .03, 0, -Math.PI / 2 + (knee ? .6 : .08));
    femur.position.y = .1 + knee * .6;
    knob(.44, .08 + knee, z, .04);
    bone(.64, .08 + knee / 2, z, .4, .024, 0, -Math.PI / 2 - (knee ? .55 : .02));
  }
  view.box(.86, .03, -.1, .16, .03, .07, BONE, g);
}

export function makeGrave(view, p, g) {
  const rand = seeded(p), box = (x, y, z, w, h, d, c, parent = g) => view.box(x, y, z, w, h, d, c, parent);
  const v = p.v ?? 0, s = p.size ?? 1;
  if (p.type === 'headstone') {
    // Above its stump (y .32); the lean tips it about its foot.
    const stone = new THREE.Group(); stone.position.y = .3; g.add(stone);
    if (p.lean) { stone.rotation.z = p.lean[0]; stone.rotation.x = p.lean[1]; }
    const w = .62 * s, t = .12, h = (p.h ?? .78) * s - .3;
    const top = stoneHead(view, stone, w, h, t, v, rand);
    weather(view, stone, t, w, top, rand, p.moss ?? 1);
    return;
  }
  if (p.type === 'headstoneStump') {
    // The base of the stone, set in the turf; broken edges on top (inside
    // the stone while it stands).
    const w = .62 * (p.size ?? 1);
    box(0, .1, 0, .14, .42, w, SLATE);
    box(0, .35, -w * .2, .1, .1, w * .4, SLATE_TOP);
    box(0, .33, w * .28, .1, .06, w * .3, SLATE);
    box(.02, .03, 0, .2, .08, w * .8, MOSS);
    return;
  }
  if (p.type === 'grave') {
    // The grave itself: a sunken turf rectangle east of its headstone, and the
    // small footstone at its east end.
    const t = onSlope(view, p, g), len = p.len ?? 1.7;
    box(0, -.03, 0, len, .08, .78, TURF, t);
    if (p.foot !== 0) {
      box(len / 2, .12, 0, .08, .34, .3, SLATE);
      const cap = view.cylinder(len / 2, .29, 0, .1, .08, SLATE_TOP, g, 6); cap.rotation.z = Math.PI / 2;
      if (rand() < .4) box(len / 2 + .045, .16, 0, .01, .08, .1, LICHEN);
    }
    return;
  }
  if (p.type === 'fallenStone') {
    // Face up in the turf, its head to the east, where it fell off its stump.
    const t = onSlope(view, p, g), w = .62 * (p.size ?? 1), len = .75 * (p.size ?? 1);
    const slab = new THREE.Group(); slab.rotation.z = Math.PI / 2; slab.position.set(-len / 2, .07, 0); t.add(slab);
    stoneHead(view, slab, w, len - .18, .12, p.v ?? 0, rand);
    box(-.1, .135, .1, .2, .01, .16, LICHEN, t); box(.15, .135, -.15, .14, .01, .12, MOSS, t);
    return;
  }
  if (p.type === 'bigStone' || p.type === 'tableTomb') settle(view, p, g, GRAVE_TYPES[p.type].w * (p.scale || 1), GRAVE_TYPES[p.type].d * (p.scale || 1)); // (world/settle.js)
  if (p.type === 'bigStone') {
    // A double stone for a husband and wife: two heads on one broad slab, on
    // a granite footing.
    box(0, .02, 0, .42, .2, 1.46, GRANITE);
    const h = (p.h ?? .95) - .3;
    for (const side of [-1, 1]) {
      const half = new THREE.Group(); half.position.set(0, .12, side * .33); g.add(half);
      stoneHead(view, half, .66, h, .2, v === 2 ? 0 : v, rand);
      weather(view, half, .2, .66, h + .2, rand);
    }
    return;
  }
  if (p.type === 'tableTomb') {
    // (A child's tomb is the same, smaller: `scale` shrinks its footprint, not its height.)
    if (p.scale) { const inner = new THREE.Group(); inner.scale.set(p.scale, 1, p.scale); g.add(inner); g = inner; }
    // Solid sides on a plinth, a slate slab overhanging them.
    box(0, .02, 0, 1.94, .24, 1.04, FIELDSTONE_DARK);
    box(0, .4, 0, 1.64, .56, .76, RETAIN);
    for (const x of [-.74, .74]) for (const z of [-.3, .3]) box(x, .4, z, .2, .56, .2, FIELDSTONE);
    const lid = box(0, .74, 0, 1.9, .1, 1, SLATE_TOP); lid.rotation.y = (rand() - .5) * .04;
    if (v === 1) { const l2 = box(.35, .82, .08, .9, .06, .5, SLATE); l2.rotation.y = .2; } // a slipped top slab
    for (let i = 0; i < 3; i++) box((rand() - .5) * 1.4, .795, (rand() - .5) * .7, .2 + rand() * .3, .012, .14 + rand() * .2, rand() < .5 ? LICHEN : MOSS);
    box(0, .1, .54, 1.4, .16, .08, MOSS);
    return;
  }
  if (/^fieldWall\d$/.test(p.type)) {
    const a = p.angle || 0, c = Math.cos(a), s = Math.sin(a), g0 = view.ground && !view.ground.flat ? view.ground : null, y0 = g0 ? g0.heightAt(p.x, p.z) : 0;
    fieldWall(view, g, GRAVE_TYPES[p.type].w, rand, g0 ? x => g0.heightAt(p.x + x * c, p.z - x * s) - y0 : undefined); return;
  }
  if (p.type === 'railPlot') {
    for (const [x, z] of GRAVE_TYPES.railPlot.collisionBoxes) {
      box(x, .4, z, .24, .96, .24, GRANITE);
      box(x, .9, z, .27, .05, .27, '#a3a098');
    }
    // Two rails on three sides; the east side open. One rail down.
    const rails = [[-1.6, 0, .08, 4.4], [0, -2.2, 3.2, .08], [0, 2.2, 3.2, .08]];
    rails.forEach(([x, z, w, d], i) => {
      for (const y of [.42, .78]) {
        if (i === 2 && y > .5) { const r = box(x + .3, .08, z + .35, w, .07, d, RAIL); r.rotation.y = .12; continue; }
        box(x, y, z, w, .07, d, RAIL);
      }
    });
    return;
  }
  if (p.type === 'freshMound') {
    // Raw earth heaped over a new grave: a long low hump, clods on it.
    const t = onSlope(view, p, g);
    lump(view, t, 0, 0, 0, 1.05, .32, .52, EARTH);
    lump(view, t, -.35, .08, .05, .55, .24, .38, EARTH_DARK);
    for (let i = 0; i < 5; i++) lump(view, t, (rand() - .5) * 1.6, .16 + rand() * .1, (rand() - .5) * .6, .12, .08, .1, rand() < .5 ? EARTH_DARK : EARTH);
    return;
  }
  if (p.type === 'openGrave') {
    // A dark hole with raw earth lips, the spoil heaped to its north with the
    // shovel stuck upright in it (the hole is drawn: the ground is not cut).
    const t = onSlope(view, p, g);
    box(0, .015, 0, 2.1, .03, .95, HOLE, t);
    box(0, .03, -.52, 2.3, .06, .12, EARTH_DARK, t); box(0, .03, .52, 2.3, .06, .12, EARTH_DARK, t);
    box(-1.1, .03, 0, .12, .06, 1.1, EARTH_DARK, t); box(1.1, .03, 0, .12, .06, 1.1, EARTH_DARK, t);
    box(0, .04, 0, 1.9, .012, .76, '#120e0c', t);
    // The spoil heap.
    lump(view, t, 0, 0, -1.2, 1.2, .5, .6, EARTH);
    lump(view, t, .3, .15, -1.25, .6, .4, .4, EARTH_DARK);
    for (let i = 0; i < 6; i++) lump(view, t, (rand() - .5) * 2, .1 + rand() * .25, -1.2 + (rand() - .5) * 1, .13, .09, .11, rand() < .5 ? EARTH_DARK : EARTH);
    // The shovel: iron blade in the heap, wooden haft leaning east.
    const shovel = new THREE.Group(); shovel.position.set(.35, .45, -1.3); shovel.rotation.set(.1, .4, -.28); g.add(shovel);
    view.box(0, .05, 0, .02, .3, .24, BLADE, shovel);
    view.cylinder(0, .72, 0, .025, 1.1, HAFT, shovel, 5);
    view.box(0, 1.3, 0, .05, .04, .18, HAFT, shovel);
    // A plank laid across the foot of the hole.
    const plank = box(.95, .08, 0, .22, .05, 1.3, '#8a7a62'); plank.rotation.y = .1;
    return;
  }
  if (p.type === 'graveSkeleton') { skeleton(view, g); return; }
}

// A headstone breaking (renderer.breakProp): slate shards, flat and dark,
// thrown low and short (stone is heavy), a spray of grey chips. Returns true
// when it handled the break.
const SHARD = new THREE.Color(SLATE), CHIP = new THREE.Color(SLATE_TOP);
export function graveBreak(view, e) {
  if (!GRAVE_TYPES[e.propType] || e.propType !== 'headstone') return false;
  const dashed = !!e.dashed, angle = Math.atan2(e.directionZ, e.directionX);
  const count = Math.round(11 * (dashed ? 1.5 : 1) * (view.qualityName === 'extreme' ? 2.4 : .6 + (view.quality?.effects ?? 1) * .5));
  for (let i = 0; i < count && view.particles.length < view.quality.particleCap; i++) {
    const direction = angle + (Math.random() - .5) * 1.5, speed = (1.2 + Math.random() * 2.4) * (dashed ? 1.4 : 1);
    const life = 2 + Math.random() * 1.2, chip = i % 3 === 0;
    view.particles.push({ x: e.x + (Math.random() - .5) * .3, z: e.z + (Math.random() - .5) * .5, y: .4 + Math.random() * .5,
      vx: Math.cos(direction) * speed, vz: Math.sin(direction) * speed, vy: .8 + Math.random() * 2.2,
      life, maxLife: life, size: chip ? .05 + Math.random() * .04 : .1 + Math.random() * .1,
      material: 7, tint: (chip ? CHIP : SHARD).clone().multiplyScalar(.85 + Math.random() * .3),
      angle: Math.random() * 6.28, spin: (Math.random() - .5) * 10, stretch: chip ? 1.2 : 1.9,
      debris: true, bounces: 0, sound: 'stone' });
  }
  return true;
}

// The sound of a headstone going over (audio.js propBreak): a crack, then a
// heavy dull thud as the slab hits the turf, and a clink of shards.
export function graveThud(audio, e) {
  if (e.propType !== 'headstone') return false;
  audio.impact(.05, .2, 2200);
  audio.tone(150, 60, .16, .12, 'triangle', .05);
  audio.impact(.12, .16, 380, 'effects', .06);
  audio.tone(90, 40, .22, .09, 'sine', .07);
  for (let i = 0; i < 3; i++) audio.impact(.025, .04, 1800 + Math.random() * 1200, 'effects', .12 + i * .06);
  if (e.dashed) audio.impact(.08, .18, 460);
  return true;
}
