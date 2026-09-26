// A terrain map's decks over its streams (map.terrain.decks) and what stands
// in the water round them (stage 2, s2-crossings; the looks in
// maps/hollow-wick-crossings.js, map.crossings):
//  - the bridge: an open timber bridge, unpainted weathered grey, plank deck
//    on stringers (seen when you wade under it), stone abutments on the
//    banks, low curb timbers (walk-over) and kingposts only at its ends;
//  - the log: a fallen bark-covered trunk, snapped branch stubs, moss on top
//    and its root plate on the south bank beside its end;
//  - the footbridge: three planks on caps and two trestles in the water;
//  - the mill dam's timber crib, the water spilling over it, rubble at its
//    foot, and stones in the stream (one static mesh with the mill wheel's
//    race: world/mill-wheel.js builds the wheel itself).
// Each deck's walk surface is exactly its `h` (the planks' tops, the trunk's
// flat top) and runs between the midpoints of its short sides, stopping short
// wherever a bank rises over its top instead of running on into it. Nothing
// along a deck's long sides rises more than a curb over it (you step off its
// sides into the water, owner 2026-09-26), and nothing here has a collider.
//
// Anyone can wade in under a deck (simulation.js `below`): while the player
// is under one, that deck turns see-through for them, as a roof lifts when
// you walk in under it (owner, 2026-09-26). Each crossing is ONE merged mesh
// with its own material, so all of it fades together.
import * as THREE from 'three';
import { Parts } from './parts.js';
import { buildMillWheel, updateMillWheel } from '../world/mill-wheel.js';

const SEE_THROUGH = .22;
export const CURB = .12; // how far anything along a deck's sides rises over its top
// Weathered grey timber (design notes: #6f6a62), darker where it is wet or
// shaded; fieldstone; bark.
const GREY = ['#6f6a62', '#686359', '#76716a', '#625e57'], TIMBER = '#5d5850', WET = '#4a453e';
const STONE = ['#7f7b72', '#5f5c56', '#6a665c'], CAP = '#8b8a80', MOSS = '#56603f';
const BARK = '#3b322c', HEART = '#231d1a', SPLINTER = '#8a7a5a', EARTH = '#4b4333';

// A deck's axes: from the middle of one short side to the other, and how far
// out from the middle each way the ground stays under its top.
export function deckFrame(deck, ground) {
 const [a, b, c, d] = deck.poly, mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
 const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
 const [e0, e1] = ab < bc ? [mid(a, b), mid(c, d)] : [mid(b, c), mid(d, a)], length = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]), width = Math.min(ab, bc);
 const ux = (e1[0] - e0[0]) / length, uz = (e1[1] - e0[1]) / length, cx = (e0[0] + e1[0]) / 2, cz = (e0[1] + e1[1]) / 2;
 // (Local x across, local z along: world = centre + x (uz, -ux) + z (ux, uz).)
 const world = (x, s) => [cx + uz * x + ux * s, cz - ux * x + uz * s];
 const floor = (x, s) => ground.drawnHeightAt(...world(x, s));
 const clear = s => [-.45, 0, .45].every(k => floor(width * k, s) < deck.h - .02);
 const reach = sign => { let s = 0; while (s < length / 2 - .05 && clear(sign * (s + .05))) s += .05; return s; };
 const back = reach(-1), ahead = reach(1);
 const matrix = new THREE.Matrix4().makeRotationY(Math.atan2(ux, uz)).setPosition(cx, 0, cz);
 return { cx, cz, ux, uz, length, width, s0: -back, s1: ahead, span: back + ahead, world, floor, matrix };
}

// A seeded random, so every build is the same.
const seeded = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// Stone abutment at a deck's end (end: s of the end, out: +1/-1 toward the
// bank beyond it): a coursed fieldstone block under the deck's end, its face
// to the water, capped, with a few loose stones at its foot and corners.
function abutment(parts, f, end, out, top, rand) {
 const w = f.width + .9, inward = 1.1, outward = .6;
 const face = end - out * inward, lowest = Math.min(f.floor(0, face - out * .3), f.floor(-w / 2, face), f.floor(w / 2, face)) - .25;
 const z = end + out * (outward - inward) / 2, d = inward + outward;
 const courses = Math.max(2, Math.round((top - lowest) / .32));
 for (let i = 0; i < courses; i++) {
  const y0 = lowest + (top - lowest) * i / courses, y1 = lowest + (top - lowest) * (i + 1) / courses;
  // (Each course set back a touch and a shade apart, so the courses read.)
  parts.box((rand() - .5) * .06, (y0 + y1) / 2, z + out * i * .03, w - i * .04, y1 - y0 - .01, d - i * .06, STONE[i % 2], null, 'abutment', .92 + rand() * .16);
 }
 parts.box(0, top + .04, z + out * .05, w + .06, .08, d - .1, CAP, null, 'abutment');
 for (const side of [-1, 1]) {
  const x = side * (w / 2 + .1);
  parts.stone(x, f.floor(x, face) + .08, face + out * .1, .34, .26, .3, STONE[1], rand() * 3, 'abutment');
  parts.stone(x * .8, f.floor(x * .8, face - out * .5) + .02, face - out * .45, .26, .2, .24, STONE[0], rand() * 3, 'abutment', .9);
 }
}

function buildBridge(parts, deck, f, look, rand) {
 const { width: W, s0, s1, span } = f, h = deck.h, mid = (s0 + s1) / 2;
 // Planks across, 0.3 wide with thin gaps; one warped, one replaced darker.
 const n = Math.max(1, Math.round(span / .33)), step = span / n;
 for (let i = 0; i < n; i++) {
  const s = s0 + step * (i + .5), warped = i === Math.floor(n * .63), replaced = i === Math.floor(n * .31);
  parts.box((rand() - .5) * .08, h - .04, s, W - .02 - rand() * .1, .08, step - .035, replaced ? '#57534c' : GREY[i % 4], warped ? { y: .035 } : null, 'plank', .94 + rand() * .12);
 }
 // Stringers under the planks, resting on the abutments (running into them).
 const count = look.stringers || 4;
 for (let k = 0; k < count; k++) {
  const x = (k / (count - 1) - .5) * W * .76;
  parts.box(x, h - .08 - .14, mid, .17, .28, span + 1.4, WET, null, 'stringer', .9 + rand() * .15);
 }
 // A cross beam under the middle, tying the stringers.
 parts.box(0, h - .08 - .28 - .08, mid, W * .9, .16, .18, WET, null, 'stringer');
 // Low curb timbers along the edges: walk over them (no colliders).
 for (const side of [-1, 1]) parts.box(side * (W / 2 - .09), h + CURB / 2, mid, .16, CURB, span - .1, TIMBER, null, 'curb');
 // Stone abutments at each end on the banks.
 const top = h - .08 - .28;
 abutment(parts, f, s0, -1, top, rand);
 abutment(parts, f, s1, 1, top, rand);
 // Kingposts only at the ends, just outside the deck's sides, each with a
 // short brace down to the curb line (nothing along the middle).
 if (look.kingposts) for (const [end, out] of [[s0, -1], [s1, 1]]) for (const side of [-1, 1]) {
  const x = side * (W / 2 + .13), sEnd = end + out * .15, rise = 1.35;
  parts.box(x, (top + h + rise) / 2, sEnd, .22, h + rise - top, .22, TIMBER, null, 'kingpost', .95);
  parts.box(x, h + rise + .04, sEnd, .28, .08, .28, GREY[3], null, 'kingpost');
  parts.beam(x, h + rise - .15, sEnd - out * .08, x, h + .05, sEnd - out * 1.55, .15, .15, TIMBER, 'kingpost', .9);
 }
}

function buildLog(parts, deck, f, look, rand) {
 const { s0, s1, span } = f, h = deck.h, R = look.radius || .55, flat = Math.cos(Math.PI / 8);
 const y = h - R * flat, mid = (s0 + s1) / 2;
 // The trunk: eight-sided, a flat face on top at exactly the deck's height.
 const along = { x: Math.PI / 2, y: Math.PI / 8 };
 parts.cyl(0, y, mid, R, span, BARK, along, 'trunk');
 // Bark ridges (a darker skin along the flanks) and a worn strip on top.
 for (const side of [-1, 1]) parts.cyl(side * R * .62, y - R * .32, mid, R * .45, span - .3, HEART, along, 'trunk', 8, 1, .95);
 parts.box(0, h - .005, mid, R * .55, .012, span - .6, '#463c34', null, 'trunk');
 // The root end flares (its top kept under the deck's), the crown end is
 // snapped off in a splintered stump.
 const root = look.rootEnd === -1 ? s0 : s1, crown = root === s1 ? s0 : s1, out = Math.sign(root - crown);
 const flare = R * 1.3;
 parts.cyl(0, h - flare * flat, root - out * .3, flare, .6, BARK, along, 'trunk', 8, .8);
 parts.cyl(0, y, crown + out * .02, R * .96, .06, SPLINTER, along, 'trunk');
 for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; parts.box(Math.cos(a) * R * .55, y + Math.sin(a) * R * .55 - .05, crown - out * .06, .12, .12, .22 + rand() * .2, SPLINTER, { z: a }, 'trunk'); }
 // Moss in patches on top (a hair over it) and down one flank.
 for (let k = 0; k < 6; k++) {
  const s = s0 + span * (.12 + k * .15 + rand() * .06);
  parts.box((rand() - .5) * R * .6, h + .006, s, R * (.3 + rand() * .35), .012, .35 + rand() * .5, MOSS, { y: rand() - .5 }, 'moss');
 }
 parts.box(R * .72, y + R * .45, mid + span * .12, .08, .22, span * .3, MOSS, { z: -.7 }, 'moss', .9);
 // Snapped branch stubs out of the flanks and underneath (never up over the
 // top: that is where you walk), each with a pale broken end.
 for (let k = 0; k < 6; k++) {
  const side = k % 2 ? 1 : -1, s = s0 + span * (.15 + k * .13 + rand() * .05), len = .45 + rand() * .5, r = .07 + rand() * .05;
  const tilt = -.1 - rand() * .7, sweep = (rand() - .5) * .8;
  const dx = side * Math.cos(tilt) * Math.cos(sweep), dy = Math.sin(tilt), dz = Math.cos(tilt) * Math.sin(sweep);
  const bx = side * R * .8, by = y + R * .1 + dy * 0;
  parts.beam(bx, by, s, bx + dx * len, by + dy * len, s + dz * len, r * 1.6, r * 1.6, k % 3 ? BARK : HEART, 'stub');
  parts.box(bx + dx * (len + .02), by + dy * (len + .02), s + dz * (len + .02), r * 1.3, r * 1.3, r * 1.3, SPLINTER, { y: sweep, z: tilt }, 'stub');
 }
 // The root plate: torn up on the bank beside the root end (to one side, so
 // the end stays clear to walk onto), earth and stones caught in it and
 // roots sticking out of its edge.
 const side = look.rootSide || 1, px = side * (R + 1.25), ps = root - out * .35;
 const pr = 1.05, py = f.floor(px, ps) + pr * .45;
 const tip = { x: Math.PI / 2, y: 0, z: side * .25, order: 'YXZ' };
 parts.cyl(px, py, ps, pr, .38, EARTH, { ...tip, y: side * .5 }, 'root', 9, .85);
 parts.cyl(px - side * .05, py, ps - out * .2, pr * .92, .12, HEART, { ...tip, y: side * .5 }, 'root', 9);
 for (let k = 0; k < 7; k++) {
  const a = k / 7 * Math.PI * 2 + rand() * .4, len = .35 + rand() * .45;
  const ex = px + Math.cos(a) * (pr + len) * .8, ey = Math.max(py + Math.sin(a) * (pr + len), py - pr * .5);
  parts.beam(px + Math.cos(a) * pr * .7, py + Math.sin(a) * pr * .7, ps, ex, ey, ps + out * (rand() - .3) * .5, .08, .08, HEART, 'root');
 }
 parts.stone(px + side * .3, py + .35, ps - out * .15, .2, .16, .18, STONE[1], rand() * 3, 'root');
 parts.stone(px - side * .35, py - .2, ps - out * .15, .16, .13, .15, STONE[0], rand() * 3, 'root');
}

function buildFootbridge(parts, deck, f, look, rand) {
 const { width: W, s0, s1, span } = f, h = deck.h, mid = (s0 + s1) / 2;
 // Long planks laid along it, each its own grey, a slight gap between.
 const n = look.planks || 3, pw = (W - .06 * (n - 1)) / n;
 for (let k = 0; k < n; k++) {
  const x = -W / 2 + pw / 2 + k * (pw + .06);
  parts.box(x, h - .035, mid + (rand() - .5) * .1, pw - .01, .07, span - .1, GREY[k % 4], { y: (rand() - .5) * .004 }, 'plank', .95 + rand() * .1);
 }
 // Caps across under the planks: on the banks at each end, and on each
 // trestle (two posts, braced, standing on the stream bed).
 const capY = h - .07 - .07, trestles = look.trestles || 2;
 for (const s of [s0 + .25, s1 - .25]) parts.box(0, capY, s, W + .2, .14, .2, WET, null, 'cap');
 for (let t = 1; t <= trestles; t++) {
  const s = s0 + span * t / (trestles + 1);
  parts.box(0, capY, s, W + .3, .14, .18, WET, null, 'cap');
  let low = Infinity;
  for (const side of [-1, 1]) {
   const x = side * (W / 2 - .02), bed = f.floor(x, s) - .2; low = Math.min(low, bed);
   parts.box(x, (bed + capY - .07) / 2, s, .15, capY - .07 - bed, .15, WET, { z: side * .04 }, 'trestle', .9);
  }
  // (One diagonal brace, high enough to show over the water.)
  parts.beam(-W / 2 + .05, capY - .12, s + .09, W / 2 - .05, Math.max(low + .4, -.1), s + .09, .08, .1, WET, 'trestle', .85);
 }
}

// The plain deck any other map's decks get (no look authored).
function buildPlain(parts, deck, f) {
 parts.box(0, deck.h - .09, (f.s0 + f.s1) / 2, f.width, .18, f.span, GREY[0], null, 'plank');
}

const BUILDERS = { bridge: buildBridge, log: buildLog, footbridge: buildFootbridge, plain: buildPlain };

// One deck's parts, in world space (for the view and the tests).
export function crossingParts(deck, ground, look = {}, index = 0) {
 const f = deckFrame(deck, ground);
 if (f.span < .5) return null;
 const parts = new Parts(f.matrix);
 (BUILDERS[look.kind] || buildPlain)(parts, deck, f, look, seeded(1790 + index * 101));
 parts.frame = null;
 return { parts, frame: f };
}

// The dam's crib, the water spilling over it (its own mesh: it runs) and the
// stones in the stream, all into `parts` (world space).
export function streamWorks(parts, ground, crossings) {
 const rand = seeded(1817);
 const dam = crossings?.dam;
 if (dam) {
  const { x, z0, z1, depth, top } = dam, zm = (z0 + z1) / 2, len = z1 - z0;
  let bed = Infinity; for (let z = z0; z <= z1; z += .5) bed = Math.min(bed, ground.drawnHeightAt(x, z), ground.drawnHeightAt(x + depth, z));
  // The crib: a body of wet timber, log courses on its downstream face with
  // the ends of its cross ties showing, and boards on top.
  parts.box(x + depth / 2, (bed - .2 + top - .06) / 2, zm, depth, top - .06 - bed + .2, len, WET, null, 'dam');
  for (let k = 0; k < 3; k++) parts.cyl(x + .06, top - .12 - k * .19, zm, .1, len, k % 2 ? WET : TIMBER, { x: Math.PI / 2 }, 'dam', 7);
  for (let z = z0 + .8; z < z1 - .4; z += 1.45) parts.box(x - .02, top - .2, z + (rand() - .5) * .2, .22, .14, .14, TIMBER, null, 'dam', .9);
  for (let z = z0 + .25, i = 0; z < z1; z += .55, i++) parts.box(x + depth / 2, top - .03, z, depth + .1, .06, .5, GREY[i % 4], null, 'dam', .8 + rand() * .1);
  // Rubble at its foot, showing through the tail water.
  for (let z = z0 + 1.2; z < z1 - .8; z += .9 + rand() * .5) {
   const s = .3 + rand() * .22, sx = x - .35 - rand() * .5, floor = ground.drawnHeightAt(sx, z);
   parts.stone(sx, Math.max(floor + s * .35, dam.down - s * .55), z, s, s * .7, s * .85, STONE[k3(z)], rand() * 3, 'rubble', .85 + rand() * .15);
  }
 }
 // Stones in the stream: half sunk in the bed, their tops just out of it.
 for (const [x, z, s] of crossings?.stones || []) {
  const floor = ground.drawnHeightAt(x, z);
  parts.stone(x, floor + s * .25, z, s, s * .7, s * .85, STONE[k3(x)], rand() * 3, 'stream-stone', .85 + rand() * .2);
  if (s > .35) parts.stone(x + s * .9, floor + s * .1, z - s * .5, s * .45, s * .35, s * .4, STONE[1], rand() * 3, 'stream-stone');
 }
}
const k3 = v => Math.abs(Math.round(v * 7)) % 3;

// The sheet of water over the dam's crib: over its lip and down its face to
// a pale rim of broken water at its foot (one strip, its streaks running).
export function spillGeometry(ground, dam) {
 const { x, top, down } = dam;
 // Where the water runs over it: the channel's width at the crib.
 let a = null, b = null;
 for (let z = dam.z0; z <= dam.z1; z += .1) if (ground.drawnHeightAt(x + .3, z) < dam.up - .02) { a ??= z; b = z; }
 if (a === null) return null;
 a += .15; b -= .15;
 // Profile (x, y) from the pond over the lip, down the face, out at the foot.
 const profile = [[x + .35, dam.up + .012], [x + .02, top + .03], [x - .12, (top + down) / 2], [x - .2, down + .02], [x - .75, down + .012]];
 const cols = Math.max(2, Math.ceil((b - a) / 1.5) + 1), rows = profile.length;
 const position = [], uv = [], index = [];
 let v = 0; const vs = [0];
 for (let r = 1; r < rows; r++) { v += Math.hypot(profile[r][0] - profile[r - 1][0], profile[r][1] - profile[r - 1][1]); vs.push(v); }
 for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const z = a + (b - a) * c / (cols - 1);
  position.push(profile[r][0], profile[r][1], z); uv.push((z - a) / 1.2, vs[r] / .6);
 }
 for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
  const i = r * cols + c;
  index.push(i, i + 1, i + cols, i + 1, i + cols + 1, i + cols);
 }
 const geometry = new THREE.BufferGeometry();
 geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
 geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
 geometry.setIndex(index); geometry.computeVertexNormals();
 return geometry;
}

// Streaks for the spill: pale runs down a darker sheet (a tiny texture).
function streakTexture() {
 const w = 16, h = 32, data = new Uint8Array(w * h * 4), rand = seeded(42);
 const cols = Array.from({ length: w }, () => .55 + rand() * .45);
 for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
  const run = Math.sin((j / h) * Math.PI * 2 * 2 + i * 1.7) * .5 + .5, v = Math.min(1, cols[i] * (.7 + .3 * run) + (rand() < .04 ? .25 : 0));
  const k = (j * w + i) * 4; data[k] = data[k + 1] = data[k + 2] = Math.round(v * 255); data[k + 3] = 255;
 }
 const texture = new THREE.DataTexture(data, w, h);
 texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
 return texture;
}

// Builds the crossings into the view: view.deckMeshes (one merged mesh per
// deck, each fading on its own), view.streamWorks (the dam, the stones and
// the wheel's race: one static mesh), view.damSpill, and the mill wheel.
export function buildCrossingDecks(view, ground, map) {
 view.deckMeshes = [];
 const looks = map.crossings?.decks || {};
 (map.terrain?.decks || []).forEach((deck, index) => {
  const built = crossingParts(deck, ground, looks[deck.id] || {}, index);
  if (!built) return;
  const mesh = built.parts.mesh({ transparent: true, opacity: 1 });
  mesh.name = 'deck:' + (deck.id || index);
  view.scene.add(mesh);
  view.deckMeshes.push({ mesh, index, fade: 1 });
 });
 const crossings = map.crossings;
 if (!crossings) return;
 const works = new Parts();
 streamWorks(works, ground, crossings);
 view.millWheel = buildMillWheel(view, ground, crossings.wheel, works);
 const mesh = works.mesh();
 if (mesh) { mesh.name = 'stream-works'; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); view.scene.add(mesh); view.streamWorks = mesh; }
 const spill = crossings.dam && spillGeometry(ground, crossings.dam);
 if (spill) {
  const map = streakTexture(); map.repeat.set(1, 1);
  const sheet = new THREE.Mesh(spill, new THREE.MeshStandardMaterial({ color: '#56625f', map, roughness: .35, metalness: 0 }));
  sheet.name = 'dam-spill'; sheet.receiveShadow = true; sheet.matrixAutoUpdate = false; sheet.updateMatrix();
  view.scene.add(sheet); view.damSpill = sheet;
 }
}

// Each frame: the deck the player is under fades to see-through; the rest
// come back (a quarter of a second either way). The spill runs and the mill
// wheel turns.
export function updateCrossingDecks(view, sim, dt) {
 if (view.damSpill) view.damSpill.material.map.offset.y -= dt * .9;
 if (view.millWheel) updateMillWheel(view.millWheel, dt);
 if (!view.deckMeshes?.length) return;
 // The decks someone is under: you, and anyone else the view draws wading
 // under one (a robot or another player: stage 4 audit, robots fought from
 // under the bridge unseen; one the view hides gives nothing away).
 const p = sim.player, under = view.decksUnder ||= new Set(); under.clear();
 if (p.below) under.add(view.ground.deckAt(p.x, p.z));
 if (view.remote?.anyUnder) for (const a of view.remote.avatars.values()) if (a.under && a.root.visible && a.root.parent) under.add(view.ground.deckAt(a.root.position.x, a.root.position.z));
 for (const d of view.deckMeshes) {
  const want = under.has(d.index) ? SEE_THROUGH : 1;
  if (d.fade === want) continue;
  d.fade = want > d.fade ? Math.min(want, d.fade + dt * 4) : Math.max(want, d.fade - dt * 4);
  // (Every part of a crossing is in its one mesh, so it all fades together.)
  d.mesh.material.opacity = d.fade;
  // (Opaque again, it sorts and writes depth as before.)
  d.mesh.material.depthWrite = d.fade > .99;
 }
}
