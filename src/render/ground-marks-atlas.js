// The pictures the ground marks are drawn with (world/ground-marks.js says
// where they go, render/ground-marks-view.js drapes them on the ground): one
// 1024 x 1024 canvas painted once at load, in the map's muted palette. Four
// strips for the wheel ruts (each one rut, half a metre across and 16 m
// long, seamless end to end, so a road runs on without a joint: two deep and
// wet, two older and grassed) and 128 px cells for the rest:
// puddles, mud, worn doorways, fresh soil, a hoofprint, a bare foot, a boot,
// the ledges, ash and cinders, straw, grain, wood chips and leaf drifts.
//
// Conventions (the view relies on them): a cell's u runs across a mark
// (u = 1 on the mark's +across side, which is a walker's left) and v along
// it (v = 1 ahead: a print's toes, a spill's far edge). What lies against a
// wall or a door (a drift's heap, a spill's thick edge) is painted at v = 0,
// a corner drift's heap at u = 0, v = 0. Canvas y runs with v (no flip:
// the texture is uploaded as data).
//
// Cost: thousands of small shapes (straws, kernels, leaves, chips) would be
// thousands of canvas fills; they are gathered by colour and alpha into one
// path each (`Ink`) and filled once, so a cell is a handful of fills. The
// canvas is read back once: every see-through pixel takes its cell's
// average colour before upload, so the mipmaps (which average colour and
// alpha separately) never darken a pale mark's edge into a dark fringe.
import * as THREE from 'three';

export const ATLAS_SIZE = 1024;
// The straw's and the grain's colours, faded so an Amber hat or ring still
// reads on them (tests/hollow-wick-look.test.js; stage 5 review: #c2a868 was
// 9.7 from the Amber ring). Every other mark is browns, greys and blacks.
export const STRAW_COLOURS = Object.freeze(['#9c8a58', '#9a8c64', '#8f7a48', '#a0936e']);
export const GRAIN_COLOURS = Object.freeze(['#9c8a3c', '#9e8452', '#a39676', '#9b8f6e']);
const CELL = 128, STRIP_W = 32;
// Strips: x in px, full height (64 px a metre both ways: a rut seen from the
// camera shrinks the same both ways, so one mip level suits it). Cells:
// [column, row] in the 6 x 8 grid right of the strips.
const STRIPS = { 'rut-a': 0, 'rut-b': 32, 'rut-old-a': 64, 'rut-old-b': 96 };
const GRID = {
 'puddle-0': [0, 0], 'puddle-1': [1, 0], 'puddle-2': [2, 0], 'puddle-3': [3, 0], wet: [4, 0], char: [5, 0],
 'mud-0': [0, 1], 'mud-1': [1, 1], 'mud-2': [2, 1], 'scuff-0': [3, 1], 'scuff-1': [4, 1], 'soil-0': [5, 1],
 hoof: [0, 2], foot: [1, 2], 'foot-wet': [2, 2], boot: [3, 2], 'soil-1': [4, 2],
 'ledge-0': [0, 3], 'ledge-1': [1, 3], 'ledge-2': [2, 3], 'ash-0': [3, 3], 'ash-1': [4, 3],
 'straw-0': [0, 4], 'straw-1': [1, 4], 'straw-2': [2, 4], 'straw-edge': [3, 4], 'grain-0': [4, 4], 'grain-1': [5, 4],
 'grain-dribble': [0, 5], 'chips-0': [1, 5], 'chips-1': [2, 5], 'chips-2': [3, 5],
 'leaves-0': [0, 6], 'leaves-1': [1, 6], 'leaves-2': [2, 6], 'leaves-corner': [3, 6],
};
// Each picture's rectangle in the atlas (0..1): { u0, v0, du, dv }. A strip's
// dv covers its whole 16 m.
export const ATLAS_CELLS = Object.freeze(Object.fromEntries([
 ...Object.entries(STRIPS).map(([name, x]) => [name, { u0: (x + 1) / ATLAS_SIZE, v0: 0, du: (STRIP_W - 2) / ATLAS_SIZE, dv: 1, strip: true }]),
 ...Object.entries(GRID).map(([name, [c, r]]) => [name, { u0: (256 + c * CELL + 1) / ATLAS_SIZE, v0: (r * CELL + 1) / ATLAS_SIZE, du: (CELL - 2) / ATLAS_SIZE, dv: (CELL - 2) / ATLAS_SIZE }]),
]));
// A strip's length in metres (its full height).
export const STRIP_LENGTH = 16;
// The bare foot's and the boot's cells are painted for marks this size (m):
// ground-marks.js lays them at it.
export const FOOT_SIZE = [.16, .35];

const seeded = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const TAU = Math.PI * 2;
const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];

// Shapes gathered by colour and alpha into one path each, filled (or
// stroked) once at flush(), in the order the colours were first used. Every
// shape is wound the same way, so overlaps of one colour fill as one.
class Ink {
 constructor(ctx) { this.ctx = ctx; this.batches = new Map(); }
 path(colour, alpha, width = 0) {
  const key = `${colour}|${Math.round(alpha * 40)}|${width}`;
  let b = this.batches.get(key); if (!b) this.batches.set(key, b = { colour, alpha: Math.round(alpha * 40) / 40, width, path: new Path2D() });
  return b.path;
 }
 blob(x, y, rx, ry, rot, colour, alpha) {
  rx = Math.max(.3, rx); ry = Math.max(.3, ry);
  const p = this.path(colour, alpha); p.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); p.ellipse(x, y, rx, ry, rot, 0, TAU);
 }
 dot(x, y, s, colour, alpha) { this.path(colour, alpha).rect(x - s / 2, y - s / 2, s, s); }
 poly(pts, colour, alpha) { const p = this.path(colour, alpha); p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); p.closePath(); }
 // An irregular lump: n corners round (x, y).
 lump(rnd, x, y, r, colour, alpha, n = 6, squash = 1) {
  const a0 = rnd() * TAU, pts = [];
  for (let i = 0; i < n; i++) { const a = a0 + i / n * TAU, d = r * (.6 + rnd() * .5); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d * squash]); }
  this.poly(pts, colour, alpha);
 }
 line(pts, width, colour, alpha) { const p = this.path(colour, alpha, Math.round(width * 4) / 4 || .25); p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); }
 arc(x, y, rx, ry, from, to, width, colour, alpha) { const p = this.path(colour, alpha, Math.round(width * 4) / 4 || .25); p.moveTo(x + rx * Math.cos(from), y + ry * Math.sin(from)); p.ellipse(x, y, rx, ry, 0, from, to); }
 // A soft irregular patch: overlapping ellipses round a centre (one colour,
 // so they fill as one shape).
 patch(rnd, x, y, rx, ry, colour, alpha, n = 7) {
  for (let i = 0; i < n; i++) { const a = rnd() * TAU, d = rnd() * .45; this.blob(x + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d, rx * (.45 + rnd() * .35), ry * (.45 + rnd() * .35), rnd() * 3, colour, alpha); }
 }
 flush() {
  const ctx = this.ctx; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const b of this.batches.values()) {
   ctx.globalAlpha = b.alpha;
   if (b.width) { ctx.strokeStyle = b.colour; ctx.lineWidth = b.width; ctx.stroke(b.path); } else { ctx.fillStyle = b.colour; ctx.fill(b.path); }
  }
  this.batches.clear(); ctx.globalAlpha = 1;
 }
}

// ---- The strips: the rut pair along y (seamless over the strip's height).
// Periodic wobble: whole numbers of cycles over the height, so the top meets
// the bottom.
const wave = (y, h, parts) => parts.reduce((s, [cycles, amp, phase]) => s + Math.sin(y / h * TAU * cycles + phase) * amp, 0);
function hoofMark(ink, x, y, r, alpha) {
 ink.blob(x, y, r * .9, r, 0, '#4a3f31', alpha * .5);
 ink.arc(x, y, r * .78, r * .86, -.55, Math.PI + .55, Math.max(.8, r * .28), '#2e261e', alpha * .8);
}
function paintRut(ink, rnd, h, old, variant) {
 const w = STRIP_W, mid = w / 2, ph = variant * 2.1 + (old ? 1 : 0);
 const cx = y => mid + wave(y, h, [[2, 1.1, ph], [5, .6, 2 + ph], [11, .3, 1 + ph]]);
 // Its width wanders a lot: dug deep in places, nearly grown over in others.
 const depth = y => Math.max(0, Math.min(1, .62 + .45 * wave(y, h, [[3, .7, ph * 2], [7, .45, 1 + ph], [13, .25, 2 + ph]]) - (old ? .14 : 0)));
 const hw = y => (old ? 7 : 9.5) * (.45 + .75 * depth(y));
 // Pushed-up lips either side, broken.
 for (const lip of [-1, 1]) for (let y = 0; y < h; y += 5) { if (rnd() < .35) continue; ink.blob(cx(y) + lip * (hw(y) + 2.2), y, 1.4 + rnd(), 2 + rnd() * 1.5, 0, pick(rnd, ['#8c7e60', '#95876a', '#7f7258']), (old ? .1 : .15) * (.4 + depth(y))); }
 ink.flush();
 // The rut: soft walls, a darker bottom (three passes, narrowing).
 for (const [k, colour, alpha] of [[1.15, '#4a3e30', old ? .12 : .2], [.85, '#3d3329', old ? .18 : .3], [.5, '#2c2620', old ? .16 : .4]]) {
  const left = [], right = [];
  for (let y = -8; y <= h + 8; y += 6) { left.push([cx(y) - hw(y) * k, y]); right.push([cx(y) + hw(y) * k, y]); }
  ink.poly([...left, ...right.reverse()], colour, alpha); ink.flush();
 }
 // Dug deeper here and there (darker, not wet).
 for (let y = rnd() * 80; y < h - 40; y += 60 + rnd() * 120) { const len = 16 + rnd() * 36; if (depth(y) > .5) ink.blob(cx(y + len / 2), y + len / 2, hw(y) * .5, len / 2, 0, '#28221c', old ? .14 : .28); }
 ink.flush();
 // Standing water now and then, with a dull sheen of the overcast (the
 // ruts' gloss); kept off the strip's ends.
 for (let y = 30 + rnd() * 60; y < h - 80; y += 110 + rnd() * 170) {
  if (old && rnd() < .7) continue;
  const len = 14 + rnd() * 34, x = cx(y + len / 2);
  ink.blob(x, y + len / 2, hw(y) * .45, len / 2, 0, '#2e3436', .45);
  ink.blob(x - hw(y) * .1, y + len / 2, hw(y) * .2, len * .36, 0, '#8d928c', .22);
 }
 // Pebbles and dry cracks.
 for (let i = 0; i < 40; i++) { const y = rnd() * h; ink.dot(cx(y) + (rnd() - .5) * hw(y) * 2.6, y, 1.2 + rnd() * 1.2, pick(rnd, ['#6d685e', '#8a857a', '#5c574f']), .55); }
 for (let i = 0; i < 22; i++) { const y = rnd() * (h - 10), side = rnd() < .5 ? -1 : 1, x = cx(y) + side * (hw(y) + 1.5 + rnd() * 3); ink.line([[x, y], [x + (rnd() - .5) * 4, y + 3 + rnd() * 5]], .8, '#3a3128', .3); }
 ink.flush();
 if (old) {
  // Dead grass creeping in at its sides.
  for (let i = 0; i < 80; i++) {
   const y = rnd() * h, x = rnd() < .5 ? 2 + rnd() * 6 : w - 2 - rnd() * 6, a = -Math.PI / 2 + (rnd() - .5) * 1.4, l = 3 + rnd() * 5;
   ink.line([[x, y], [x + Math.cos(a) * l * .5, y + Math.sin(a) * l]], .9, pick(rnd, ['#7d7658', '#8a7a4e', '#6e6a50']), .5);
  }
  ink.flush();
 }
}

// ---- The cells (w = h = CELL).
function paintPuddle(ink, rnd, w, h, n) {
 const ctx = ink.ctx;
 // A ragged outline: a few big lobes and more small ones round them.
 const lobes = []; const count = 3 + (n % 3);
 for (let i = 0; i < count; i++) lobes.push([w / 2 + (rnd() - .5) * w * .26, h / 2 + (rnd() - .5) * h * .3, w * (.14 + rnd() * .09), h * (.16 + rnd() * .1), rnd() * 3]);
 for (let i = 0; i < 6; i++) { const [x, y, rx, ry] = pick(rnd, lobes), a = rnd() * TAU; lobes.push([x + Math.cos(a) * rx * .9, y + Math.sin(a) * ry * .9, rx * (.3 + rnd() * .25), ry * (.3 + rnd() * .25), rnd() * 3]); }
 // Wet mud round it.
 for (const [x, y, rx, ry, r] of lobes) ink.blob(x, y, rx + 8, ry + 8, r, '#3e3429', .2);
 ink.flush();
 for (const [x, y, rx, ry, r] of lobes) ink.blob(x, y, rx + 3, ry + 3, r, '#302a23', .38);
 ink.flush();
 // The water: the stream's dark grey under a dull sheen of the overcast,
 // brighter toward the far side (never a black hole).
 const water = new Path2D(); for (const [x, y, rx, ry, r] of lobes) { water.moveTo(x + rx * Math.cos(r), y + rx * Math.sin(r)); water.ellipse(x, y, rx, ry, r, 0, TAU); }
 ctx.globalAlpha = .9; ctx.fillStyle = '#34393a'; ctx.fill(water);
 const sheen = ctx.createLinearGradient(0, h * .2, 0, h * .8); sheen.addColorStop(0, '#8e908a'); sheen.addColorStop(.5, '#666a66'); sheen.addColorStop(1, '#3d4141');
 ctx.globalAlpha = .42; ctx.fillStyle = sheen; ctx.fill(water);
 ctx.save(); ctx.clip(water);
 // Silt and a floating scum of leaf bits make it read as a puddle in mud,
 // not a pane of glass; the sky's gleam is thin.
 for (let i = 0; i < 14; i++) ink.blob(w * (.3 + rnd() * .4), h * (.3 + rnd() * .4), 2 + rnd() * 5, 1.5 + rnd() * 3, rnd() * 3, '#4a4234', .18);
 ink.flush();
 ink.blob(w * (.42 + rnd() * .16), h * .36, w * .2, h * .08, (rnd() - .5) * .6, '#a8aaa2', .18);
 for (let i = 0; i < 2; i++) { const y = h * (.35 + rnd() * .35); ink.line([[w * .28, y], [w * .5, y + (rnd() - .5) * 3], [w * .72, y]], 1, '#a8aaa2', .12); }
 ink.flush(); ctx.restore();
 if (n === 1) { ink.blob(w * .58, h * .44, 4, 2.5, .6, '#7a5a34', .9); ink.line([[w * .58 - 4, h * .44 + 2], [w * .58 + 4, h * .44 - 2]], .6, '#5a4028', .8); }
 if (n === 3) ink.blob(w * .4, h * .56, 3, 2, 2, '#5a4632', .85);
 ink.flush();
}
function paintMud(ink, rnd, w, h, n) {
 // Trodden wet earth: a little darker than the ground, broken up, with
 // pale dried crumbs and the dents of hooves (a horse stood here: n 2).
 ink.patch(rnd, w / 2, h / 2, w * .42, h * .4, '#524534', .13, 9); ink.flush();
 ink.patch(rnd, w / 2, h / 2, w * .28, h * .26, '#473b2e', .14, 7); ink.flush();
 for (let i = 0; i < 4; i++) ink.blob(w * (.25 + rnd() * .5), h * (.25 + rnd() * .5), 3 + rnd() * 5, 2 + rnd() * 4, rnd() * 3, '#3a332b', .16);
 for (let i = 0; i < 40; i++) ink.lump(rnd, w * (.15 + rnd() * .7), h * (.15 + rnd() * .7), 1 + rnd() * 2.2, pick(rnd, ['#76684f', '#7f7057', '#62543f']), .38);
 ink.flush();
 // Churned: dents and slides.
 for (let i = 0; i < (n === 2 ? 16 : 5); i++) hoofMark(ink, w * (.2 + rnd() * .6), h * (.2 + rnd() * .6), 4 + rnd() * 1.5, .3);
 for (let i = 0; i < 6; i++) { const x = w * (.2 + rnd() * .6), y = h * (.2 + rnd() * .6), a = rnd() * TAU; ink.line([[x, y], [x + Math.cos(a) * 12, y + Math.sin(a) * 12]], 2.4, '#342d25', .14); }
 ink.flush();
}
function paintScuff(ink, rnd, w, h, n) {
 // Heaviest at the sill (v = 0), fading out into the yard.
 for (let i = 0; i < 50; i++) { const y = Math.pow(rnd(), 1.6) * h * .85, x = w * (.12 + rnd() * .76); ink.blob(x, y, 6 + rnd() * 10, 3 + rnd() * 5, (rnd() - .5) * .5, pick(rnd, ['#857659', '#7a6c52', '#8e8064']), y < h * .3 ? .1 : .05); }
 ink.flush();
 for (let i = 0; i < 20; i++) { const y = Math.pow(rnd(), 1.3) * h * .8, x = w * (.15 + rnd() * .7), a = Math.PI / 2 + (rnd() - .5) * .9; ink.line([[x, y], [x + Math.cos(a) * (5 + rnd() * 9), y + Math.sin(a) * (5 + rnd() * 9)]], 2.4, '#4e4434', y < h * .3 ? .16 : .08); }
 if (n) for (let i = 0; i < 4; i++) ink.blob(w * (.3 + rnd() * .4), h * (.1 + rnd() * .25), 5, 3, 0, '#3e3529', .18);
 ink.flush();
}
function paintSoil(ink, rnd, w, h) {
 ink.patch(rnd, w / 2, h / 2, w * .34, h * .32, '#5a4632', .35, 8); ink.flush();
 for (let i = 0; i < 110; i++) { const a = rnd() * TAU, d = Math.pow(rnd(), .8) * w * .45; ink.lump(rnd, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d * .9, 1.2 + rnd() * 3.2 * (1 - d / w), pick(rnd, ['#6a5238', '#4e3c2a', '#7a6044', '#5a4632']), .85); }
 ink.flush();
}
function paintWet(ink, rnd, w, h) {
 ink.patch(rnd, w / 2, h / 2, w * .4, h * .38, '#2e2a24', .2, 9); ink.flush();
 ink.patch(rnd, w / 2, h * .45, w * .26, h * .24, '#25221e', .22, 6); ink.flush();
 for (let i = 0; i < 12; i++) ink.blob(w * (.2 + rnd() * .6), h * (.2 + rnd() * .6), 2 + rnd() * 3, 2 + rnd() * 2, 0, '#1f1d1a', .3);
 ink.flush();
}
function paintChar(ink, rnd, w, h) {
 ink.patch(rnd, w / 2, h / 2, w * .44, h * .44, '#7d7a74', .3, 9); ink.flush();
 ink.patch(rnd, w / 2, h / 2, w * .28, h * .28, '#1c1a19', .6, 8); ink.flush();
 for (let i = 0; i < 14; i++) { const a = rnd() * TAU, d = rnd() * w * .25, l = 8 + rnd() * 14; ink.line([[w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d], [w / 2 + Math.cos(a) * (d + l), h / 2 + Math.sin(a) * (d + l)]], 3, '#2a211c', .8); }
 for (let i = 0; i < 60; i++) ink.dot(w * (.2 + rnd() * .6), h * (.2 + rnd() * .6), 1.5 + rnd() * 1.5, pick(rnd, ['#a3a09a', '#8d8a84']), .6);
 ink.flush();
}
// A print in metres: `wide` x `long` over the cell (the mark is that size),
// toe toward +y.
function metric(w, h, wide, long) { return { X: m => (m / wide + .5) * w, Y: m => (m / long + .5) * h, R: m => m / wide * w, Q: m => m / long * h }; }
function paintFoot(ink, rnd, w, h, wet) {
 const { X, Y, R, Q } = metric(w, h, ...FOOT_SIZE), dark = wet ? '#211b16' : '#2c241c', deep = '#1f1914';
 // A left foot walking toward +y, seen from above: the heel, the outer edge
 // of the arch (+x), the ball, five toes with the big toe on the inner side
 // (-x). The view mirrors it for a right foot.
 ink.blob(X(.004), Y(-.105), R(.031), Q(.04), 0, dark, .82);
 ink.poly([[X(.03), Y(-.11)], [X(.038), Y(-.01)], [X(.034), Y(.06)], [X(.014), Y(.06)], [X(.02), Y(-.02)], [X(.012), Y(-.11)]], dark, .82);
 ink.blob(X(-.004), Y(.058), R(.043), Q(.035), 0, dark, .82);
 [[-.032, .113, .016], [-.01, .124, .011], [.007, .122, .0095], [.022, .116, .0085], [.035, .105, .0075]].forEach(([x, y, r]) => ink.blob(X(x), Y(y), R(r), Q(r * 1.1), 0, dark, .82));
 ink.flush();
 // Pressed deeper at the heel and ball; the wet ones hold water.
 ink.blob(X(.004), Y(-.105), R(.019), Q(.024), 0, deep, .55);
 ink.blob(X(-.006), Y(.058), R(.025), Q(.019), 0, deep, .5);
 ink.flush();
 // Fresh: water seeps into the heel and the ball (more near the stream),
 // with a dull gleam of the sky on it: what catches the eye from above.
 ink.blob(X(.002), Y(-.105), R(wet ? .018 : .012), Q(wet ? .021 : .014), 0, '#2a3032', wet ? .85 : .6); ink.blob(X(-.008), Y(.056), R(wet ? .024 : .015), Q(wet ? .017 : .011), 0, '#2a3032', wet ? .8 : .55); ink.flush();
 ink.blob(X(-.01), Y(.05), R(wet ? .012 : .007), Q(.007), 0, '#9aa09a', wet ? .45 : .3); ink.blob(X(-.004), Y(-.11), R(wet ? .009 : .006), Q(.007), 0, '#9aa09a', wet ? .4 : .25); ink.flush();
 // Mud pushed up round the edge (the pale lip is what the eye catches on
 // dark ground).
 ink.arc(X(0), Y(0), R(.056), Q(.15), 0, TAU, 4, '#968766', .4); ink.flush();
}
function paintBoot(ink, rnd, w, h) {
 const { X, Y, R, Q } = metric(w, h, ...FOOT_SIZE);
 ink.blob(X(0), Y(.055), R(.045), Q(.075), 0, '#3a3026', .72);
 ink.blob(X(0), Y(-.1), R(.039), Q(.04), 0, '#3a3026', .75);
 ink.flush();
 for (let i = 0; i < 5; i++) ink.line([[X(-.034), Y(i * .025)], [X(.034), Y(i * .025)]], 1.4, '#5a4c3a', .35);
 ink.flush();
}
function paintLedge(ink, rnd, w, h, n) {
 const ctx = ink.ctx;
 // The rock's outline: an irregular slab, its edges sunk in the dirt.
 const pts = []; const count = 9 + n;
 for (let i = 0; i < count; i++) { const a = i / count * TAU, rx = w * (.34 + rnd() * .1), ry = h * (.32 + rnd() * .11); pts.push([w / 2 + Math.cos(a) * rx, h / 2 + Math.sin(a) * ry]); }
 ink.poly(pts.map(([x, y]) => [w / 2 + (x - w / 2) * 1.14, h / 2 + (y - h / 2) * 1.14]), '#5a4e3c', .32); ink.flush();
 ink.poly(pts, '#77736a', .95); ink.flush();
 const rock = new Path2D(); rock.moveTo(pts[0][0], pts[0][1]); for (const p of pts) rock.lineTo(p[0], p[1]); rock.closePath();
 ctx.save(); ctx.clip(rock);
 // Plates split by cracks; their tops lighter.
 for (let i = 0; i < 4; i++) ink.lump(rnd, w * (.2 + rnd() * .6), h * (.2 + rnd() * .6), 12 + rnd() * 14, pick(rnd, ['#8b8a80', '#827f76', '#6c6860']), .5, 7, .7);
 ink.flush();
 for (let i = 0; i < 5; i++) { let x = w * rnd(), y = h * (.1 + rnd() * .8); const ptsL = [[x, y]]; for (let k = 0; k < 5; k++) { x += (rnd() - .3) * 16; y += (rnd() - .5) * 14; ptsL.push([x, y]); } ink.line(ptsL, 1.5, '#433f39', .75); }
 // Wheel scrapes where the ruts cross it (at the gauge, along v).
 for (const u of [.2, .8]) for (let i = 0; i < 3; i++) { const x = w * u + (rnd() - .5) * 6; ink.line([[x, h * .12], [x + (rnd() - .5) * 3, h * .88]], 1.25, '#9a968c', .22); }
 // Lichen and soil in the hollows.
 for (let i = 0; i < 40; i++) ink.blob(w * (.15 + rnd() * .7), h * (.15 + rnd() * .7), 1 + rnd() * 3, 1 + rnd() * 2.5, 0, pick(rnd, ['#9a9a8a', '#8b8a80', '#7e8566', '#56603f']), .45);
 for (let i = 0; i < 10; i++) ink.blob(w * (.15 + rnd() * .7), h * (.15 + rnd() * .7), 2 + rnd() * 4, 1 + rnd() * 2, rnd() * 3, '#4a3f30', .4);
 ink.flush(); ctx.restore();
}
function paintAsh(ink, rnd, w, h, heap) {
 // Soft grey ash (a heap, or dust thrown out from the top edge).
 if (heap) { ink.patch(rnd, w / 2, h / 2, w * .38, h * .38, '#8f8b84', .42, 10); ink.flush(); ink.patch(rnd, w / 2, h * .48, w * .24, h * .24, '#a39f98', .4, 7); ink.flush(); }
 else { for (let i = 0; i < 26; i++) ink.blob(w * (.12 + rnd() * .76), Math.pow(rnd(), 1.4) * h * .85, 6 + rnd() * 10, 4 + rnd() * 6, rnd() * 3, pick(rnd, ['#8f8b84', '#7f7c76']), .13); ink.flush(); }
 // Clinker and cinders, scale from the anvil, charcoal.
 for (let i = 0; i < (heap ? 80 : 50); i++) {
  const x = heap ? w / 2 + (rnd() - .5) * w * .72 : w * (.1 + rnd() * .8), y = heap ? h / 2 + (rnd() - .5) * h * .7 : Math.pow(rnd(), 1.3) * h * .9;
  ink.lump(rnd, x, y, 1.2 + rnd() * (heap ? 3 : 2.2), pick(rnd, ['#3d3935', '#4a4541', '#2b2826', '#4a3a30', '#5c4232', '#57524b']), .75);
 }
 for (let i = 0; i < 40; i++) ink.dot(w * (.15 + rnd() * .7), h * (.15 + rnd() * .7), 1.2 + rnd() * 1.2, '#b2aea6', .5);
 ink.flush();
}
function straws(ink, rnd, count, where, aligned = 0) {
 for (let i = 0; i < count; i++) {
  const [x, y] = where(), a = aligned ? Math.PI / 2 + (rnd() - .5) * aligned : rnd() * TAU, l = 7 + rnd() * 11, bend = (rnd() - .5) * 2;
  ink.line([[x - Math.cos(a) * l / 2, y - Math.sin(a) * l / 2], [x + bend, y], [x + Math.cos(a) * l / 2, y + Math.sin(a) * l / 2]], rnd() < .5 ? 1 : 1.5, pick(rnd, STRAW_COLOURS), rnd() < .5 ? .8 : .95);
 }
}
function paintStraw(ink, rnd, w, h, n) {
 ink.patch(rnd, w / 2, h / 2, w * .36, h * .34, '#9c8a58', .12, 8); ink.flush();
 const where = () => { const a = rnd() * TAU, d = Math.pow(rnd(), .75) * .42; return [w / 2 + Math.cos(a) * d * w, h / 2 + Math.sin(a) * d * h]; };
 straws(ink, rnd, 230 + n * 30, where);
 for (let i = 0; i < 5; i++) { const [x, y] = where(); straws(ink, rnd, 18, () => [x + (rnd() - .5) * 12, y + (rnd() - .5) * 12]); }
 ink.flush();
}
function paintStrawEdge(ink, rnd, w, h) {
 // Thick at the sill (v = 0), dragged out in a ragged fan: tongues where it
 // was forked and carried, bare ground between them further out.
 const tongues = Array.from({ length: 4 }, () => [w * (.15 + rnd() * .7), .5 + rnd() * .5]);
 const where = () => {
  const y = Math.pow(rnd(), 1.5) * h * .94, k = y / h;
  if (k < .3 || rnd() < .25) return [w * (.05 + rnd() * .9), y];
  const [tx, reach] = pick(rnd, tongues); if (k > reach) return [w * (.1 + rnd() * .8), Math.pow(rnd(), 3) * h * .3];
  return [tx + (rnd() - .5) * w * .28 * (1 - k * .6), y];
 };
 for (let i = 0; i < 16; i++) { const [x, y] = where(); ink.blob(x, y, 8 + rnd() * 12, 5 + rnd() * 7, 0, '#9c8a58', .09); }
 ink.flush();
 straws(ink, rnd, 400, where, 1.6); ink.flush();
}
function paintGrain(ink, rnd, w, h, fan) {
 // Meal dust under it, then kernels: mostly corn, some rye.
 ink.patch(rnd, w / 2, fan ? h * .3 : h / 2, w * .36, h * .3, GRAIN_COLOURS[2], .14, 8); ink.flush();
 const where = fan ? () => [w * (.5 + (rnd() - .5) * (.3 + .6 * rnd())), Math.pow(rnd(), 1.5) * h * .88] : () => { const a = rnd() * TAU, d = Math.pow(rnd(), .7) * .4; return [w / 2 + Math.cos(a) * d * w, h / 2 + Math.sin(a) * d * h]; };
 for (let i = 0; i < 1100; i++) { const [x, y] = where(); ink.dot(x, y, 1.3 + rnd() * .9, pick(rnd, GRAIN_COLOURS), .85); }
 for (let i = 0; i < 25; i++) { const [x, y] = where(); ink.blob(x, y, 2, 1, rnd() * 3, GRAIN_COLOURS[3], .6); }
 ink.flush();
}
function paintDribble(ink, rnd, w, h) {
 for (let i = 0; i < 240; i++) { const y = h * (.05 + rnd() * .9), x = w / 2 + (rnd() - .5) * w * .22 * (1 + Math.sin(y * .1)); if (Math.sin(y * .23) > .6) continue; ink.dot(x, y, 1.3 + rnd() * .8, pick(rnd, GRAIN_COLOURS), .85); }
 ink.flush();
}
function paintChips(ink, rnd, w, h, n) {
 ink.patch(rnd, w / 2, h / 2, w * .3, h * .3, '#8a7a5e', .12, 7); ink.flush();
 const where = () => { const a = rnd() * TAU, d = Math.pow(rnd(), .8 + n * .15) * .44; return [w / 2 + Math.cos(a) * d * w, h / 2 + Math.sin(a) * d * h]; };
 for (let i = 0; i < 220; i++) { const [x, y] = where(); ink.dot(x, y, 1.2, '#a8916a', .4); }
 ink.flush();
 for (let i = 0; i < 120; i++) { const [x, y] = where(); ink.lump(rnd, x, y, 1.6 + rnd() * 3.2, pick(rnd, ['#a08a66', '#8a7a62', '#7d7466', '#6e665a', '#95805e', '#4a3f33']), .92, 4 + Math.floor(rnd() * 3), .5); }
 ink.flush();
}
function paintLeaves(ink, rnd, w, h, corner) {
 const colours = ['#8a6a3e', '#7a5a34', '#5a4632'];
 // Heaped against the wall (v = 0; a corner's in the corner, u = v = 0),
 // thinning outward and toward the ends: old leaves dark underneath, the
 // newest on top.
 const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
 const where = () => {
  for (;;) {
   if (corner) { const r = Math.pow(rnd(), 1.35) * w * .96, a = rnd() * Math.PI / 2; return [Math.cos(a) * r, Math.sin(a) * r]; }
   const x = rnd(), y = Math.pow(rnd(), 1.8) * h * .95;
   if (rnd() < smooth(0, .22 + .2 * y / h, Math.min(x, 1 - x))) return [x * w, y];
  }
 };
 for (let i = 0; i < 24; i++) { const [x, y] = where(); ink.blob(x, y, 8 + rnd() * 10, 5 + rnd() * 6, rnd() * 3, '#5a4028', .2); }
 ink.flush();
 for (let i = 0; i < 260; i++) { const [x, y] = where(), a = rnd() * TAU, s = 2.4 + rnd() * 2.6; ink.blob(x, y, s, s * .55, a, pick(rnd, colours), .9); if (i % 3 === 0) ink.line([[x - Math.cos(a) * s * 1.2, y - Math.sin(a) * s * 1.2], [x + Math.cos(a) * s * .8, y + Math.sin(a) * s * .8]], .5, '#4a3522', .55); }
 for (let i = 0; i < 6; i++) { const [x, y] = where(), a = rnd() * TAU; ink.line([[x, y], [x + Math.cos(a) * 14, y + Math.sin(a) * 14]], 1, '#3b322c', .7); }
 ink.flush();
}

const PAINTERS = {
 'puddle-0': (k, r, w, h) => paintPuddle(k, r, w, h, 0), 'puddle-1': (k, r, w, h) => paintPuddle(k, r, w, h, 1), 'puddle-2': (k, r, w, h) => paintPuddle(k, r, w, h, 2), 'puddle-3': (k, r, w, h) => paintPuddle(k, r, w, h, 3),
 wet: paintWet, char: paintChar,
 'mud-0': (k, r, w, h) => paintMud(k, r, w, h, 0), 'mud-1': (k, r, w, h) => paintMud(k, r, w, h, 1), 'mud-2': (k, r, w, h) => paintMud(k, r, w, h, 2),
 'scuff-0': (k, r, w, h) => paintScuff(k, r, w, h, 0), 'scuff-1': (k, r, w, h) => paintScuff(k, r, w, h, 1), 'soil-0': paintSoil, 'soil-1': paintSoil,
 hoof: (k, r, w, h) => { k.arc(w / 2, h / 2, w * .42, h * .44, 0, TAU, 7, '#8a7b5c', .22); k.flush(); hoofMark(k, w / 2, h / 2, w * .34, .75); k.flush(); k.blob(w / 2, h * .36, w * .09, h * .11, 0, '#5a4c3a', .35); k.flush(); },
 foot: (k, r, w, h) => paintFoot(k, r, w, h, false), 'foot-wet': (k, r, w, h) => paintFoot(k, r, w, h, true), boot: paintBoot,
 'ledge-0': (k, r, w, h) => paintLedge(k, r, w, h, 0), 'ledge-1': (k, r, w, h) => paintLedge(k, r, w, h, 1), 'ledge-2': (k, r, w, h) => paintLedge(k, r, w, h, 2),
 'ash-0': (k, r, w, h) => paintAsh(k, r, w, h, true), 'ash-1': (k, r, w, h) => paintAsh(k, r, w, h, false),
 'straw-0': (k, r, w, h) => paintStraw(k, r, w, h, 0), 'straw-1': (k, r, w, h) => paintStraw(k, r, w, h, 1), 'straw-2': (k, r, w, h) => paintStraw(k, r, w, h, 2), 'straw-edge': paintStrawEdge,
 'grain-0': (k, r, w, h) => paintGrain(k, r, w, h, true), 'grain-1': (k, r, w, h) => paintGrain(k, r, w, h, false), 'grain-dribble': paintDribble,
 'chips-0': (k, r, w, h) => paintChips(k, r, w, h, 0), 'chips-1': (k, r, w, h) => paintChips(k, r, w, h, 1), 'chips-2': (k, r, w, h) => paintChips(k, r, w, h, 2),
 'leaves-0': (k, r, w, h) => paintLeaves(k, r, w, h, false), 'leaves-1': (k, r, w, h) => paintLeaves(k, r, w, h, false), 'leaves-2': (k, r, w, h) => paintLeaves(k, r, w, h, false), 'leaves-corner': (k, r, w, h) => paintLeaves(k, r, w, h, true),
};
// Cells whose picture reaches their edges on purpose (the heaped side of a
// drift or a spill lies against a wall): no fade on those edges.
const HARD_EDGES = { 'straw-edge': 'top', 'leaves-0': 'top', 'leaves-1': 'top', 'leaves-2': 'top', 'leaves-corner': 'corner', 'scuff-0': 'top', 'scuff-1': 'top' };

// Paints the atlas; returns its RGBA pixels (straight alpha, see-through
// pixels coloured) or null without a DOM (node tests).
// `size`: the canvas's side (the layout is always drawn in 1024 px units and
// scaled: the phone presets paint at 512, a quarter of the work, for marks
// they draw a few pixels across anyway).
export function paintGroundAtlas(seed = 1790, timings = {}, size = ATLAS_SIZE) {
 if (typeof document === 'undefined' || typeof Path2D === 'undefined') return null;
 const t0 = performance.now(), k = size / ATLAS_SIZE;
 const S = size, canvas = document.createElement('canvas'); canvas.width = canvas.height = S;
 const ctx = canvas.getContext('2d', { willReadFrequently: true }), ink = new Ink(ctx);
 ctx.scale(k, k);
 const rnd = seeded(seed);
 const regions = [];
 for (const [name, x] of Object.entries(STRIPS)) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, 0, STRIP_W, ATLAS_SIZE); ctx.clip(); ctx.translate(x, 0);
  paintRut(ink, rnd, ATLAS_SIZE, name.includes('old'), name.endsWith('b') ? 1 : 0); ink.flush(); ctx.restore();
  regions.push({ x: x * k, y: 0, w: STRIP_W * k, h: S, strip: true });
 }
 for (const [name, [c, r]] of Object.entries(GRID)) {
  const x = 256 + c * CELL, y = r * CELL;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, CELL, CELL); ctx.clip(); ctx.translate(x, y);
  PAINTERS[name](ink, rnd, CELL, CELL); ink.flush(); ctx.restore();
  regions.push({ x: x * k, y: y * k, w: CELL * k, h: CELL * k, hard: HARD_EDGES[name] });
 }
 ctx.globalAlpha = 1;
 const t1 = performance.now();
 const image = ctx.getImageData(0, 0, S, S), d = image.data, d32 = new Uint32Array(d.buffer, d.byteOffset, d.byteLength >> 2);
 const t2 = performance.now();
 for (const g of regions) {
  // Soft borders (no quad ever shows its edge: a fade over the outer tenth,
  // none on a hard edge), then the colour bleed. Fades are per column and
  // per row, multiplied.
  const fx = new Float32Array(g.w), fy = new Float32Array(g.h);
  for (let x = 0; x < g.w; x++) { const l = (x + .5) / g.w; fx[x] = g.strip ? Math.min(1, Math.min(l, 1 - l) / .08) : Math.min(1, (g.hard === 'corner' ? 1 - l : Math.min(l, 1 - l)) / .1) * (g.hard === 'corner' ? Math.min(1, l / .02) : 1); }
  for (let y = 0; y < g.h; y++) { const l = (y + .5) / g.h; fy[y] = g.strip ? 1 : Math.min(1, (g.hard ? 1 - l : Math.min(l, 1 - l)) / .1) * (g.hard ? Math.min(1, l / .02) : 1); }
  // (Whole pixels at a time: R | G << 8 | B << 16 | A << 24, little-endian.)
  let r = 0, gg = 0, b = 0, weight = 0;
  for (let y = 0; y < g.h; y++) {
   const row = (g.y + y) * S + g.x, f = fy[y];
   for (let x = 0; x < g.w; x++) {
    const i = row + x, px = d32[i], a0 = px >>> 24; if (!a0) continue;
    const a = (a0 * f * fx[x] + .5) | 0; d32[i] = (px & 0xffffff) | (a << 24);
    if (a > 24) { r += (px & 255) * a; gg += ((px >>> 8) & 255) * a; b += ((px >>> 16) & 255) * a; weight += a; }
   }
  }
  if (!weight) continue;
  const fill = Math.round(r / weight) | Math.round(gg / weight) << 8 | Math.round(b / weight) << 16;
  for (let y = 0; y < g.h; y++) { const row = (g.y + y) * S + g.x; for (let x = 0; x < g.w; x++) { const i = row + x, a = d32[i] >>> 24; if (a < 6) d32[i] = fill | (a << 24); } }
 }
 timings.paint = t1 - t0; timings.read = t2 - t1; timings.edges = performance.now() - t2;
 return d;
}

// The atlas as a texture (null in node). Uploaded as data: straight alpha,
// sRGB, mipmapped.
export function groundAtlasTexture(timings = {}, size = ATLAS_SIZE) {
 const data = paintGroundAtlas(1790, timings, size);
 if (!data) return null;
 const texture = new THREE.DataTexture(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
 texture.colorSpace = THREE.SRGBColorSpace;
 texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true;
 texture.anisotropy = 4; texture.needsUpdate = true;
 return texture;
}
