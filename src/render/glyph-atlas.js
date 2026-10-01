// Lumen's invented script and pictograms (lumen-design.md section 13; the
// owner's rule: no lettering anywhere in the world). One small generated
// atlas every screen, pedestrian head and neon glyph reads: nothing loaded,
// nothing drawn on a canvas, the same bytes every load.
//
// The atlas is a 256 x 256 single-channel (R8) coverage mask:
//   rows   0 ..  63  the glyph script: 64 glyphs in 16 px cells (16 x 4)
//   rows  64 .. 191  pictograms: up to 32 in 32 px cells (8 x 4)
//   rows 192 .. 255  a cracked-glass pattern over the whole 256 x 64 strip
// Colour comes from the screen's palette in the shader, so one mask serves
// every hue. Row r of the data is atlas v = (r + .5) / 256 (flipY off); the
// drawings are authored y-up, so a cell's top row is its first data row and
// a shader reads local (x, y-up) at v = (cellTop + (1 - y) * cell) / 256.
//
// Every shape is a list of primitives in a unit box, x right and y up:
//   { kind: 'disc', x, y, r }             filled circle
//   { kind: 'ring', x, y, r, w }          circle outline, stroke w
//   { kind: 'poly', pts }                 filled polygon (even-odd)
//   { kind: 'line', pts, w }              polyline stroke with round caps
// and `cut: true` on any of them subtracts it from what came before. The
// same lists give the neon tubes their strokes (`shapeStrokes`), so a glyph
// on a screen and the same glyph bent in glass are one design.
//
// THE GLYPH RULE (why no glyph can read as a letter or digit). Every Latin
// capital and every digit, in any plain rendering, is ONE connected stroke
// shape with no solid filled area. Every glyph here is built as
//   one ANCHOR: a ring, a filled triangle or a filled diamond (a solid or a
//     closed loop, never an open stroke), plus
//   one to three SATELLITES: dots, short bars, small triangles, tiny rings
//     or bracket corners, each kept at least a gap away from everything else,
// so each glyph is (a) at least two separate pieces and (b) carries at least
// one solid filled mark. Neither holds for A-Z or 0-9. Two-piece symbols that
// do exist (i, j, !, ?, :, ;, =, %) are made of bars and dots only; a glyph
// always has a ring, triangle or diamond anchor, and no satellite is longer
// than a quarter of the box, so none of those forms can appear either.
// tests/city-signs.test.js checks the rule on the rasters (connected pieces,
// filled marks) and compares every glyph with a 5 x 7 rendering of A-Z, 0-9
// and those symbols.
import * as THREE from 'three';

export const ATLAS = Object.freeze({
  size: 256,          // texels per side
  glyphCell: 16,      // px per glyph cell
  glyphPad: 1,        // px of empty margin round each glyph (mip bleed)
  glyphColumns: 16,
  glyphRows: 4,       // 64 glyphs
  pictoTop: 64,       // first row of the pictogram block
  pictoCell: 32,
  pictoPad: 2,
  pictoColumns: 8,
  pictoRows: 4,       // up to 32 pictograms
  crackTop: 192,      // the cracked-glass strip: rows 192..255, all 256 columns
  supersample: 4,     // 4 x 4 coverage samples per texel (soft, even edges)
  seed: 20260929,     // the script's seed: change it and every glyph changes
});

export const GLYPH_COUNT = ATLAS.glyphColumns * ATLAS.glyphRows;

// ---------------------------------------------------------------------------
// The glyph script.

function mulberry(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// How far a primitive reaches from its centre (for keeping pieces apart).
const reachOf = p => p.reach;

// The anchors and satellites. Each maker returns { prims, reach } centred on
// (x, y); `reach` bounds everything it draws.
const ANCHORS = [
  (x, y, rnd) => triangle(x, y, .25 + rnd() * .06, Math.floor(rnd() * 4)),
  (x, y, rnd) => { const s = .21 + rnd() * .05; return { prims: [{ kind: 'poly', pts: [[x, y + s], [x + s, y], [x, y - s], [x - s, y]] }], reach: s }; },
  // A ring with a dot held inside it: still one closed loop plus a solid.
  (x, y, rnd) => { const r = .25 + rnd() * .04; return { prims: [{ kind: 'ring', x, y, r, w: .12 }, { kind: 'disc', x, y, r: .08 }], reach: r + .06 }; },
  // A half-filled disc (a solid half moon closed by its chord).
  (x, y, rnd) => { const r = .24 + rnd() * .04, k = Math.floor(rnd() * 4) * Math.PI / 2;
    return { prims: [{ kind: 'ring', x, y, r: r - .06, w: .12 }, { kind: 'poly', pts: circlePts(x, y, r, 10, k, k + Math.PI) }], reach: r }; },
];
function triangle(x, y, s, dir) {
  // dir 0 up, 1 right, 2 down, 3 left.
  const base = [[0, s], [s * .95, -s * .6], [-s * .95, -s * .6]];
  const turn = [[1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1], [0, -1, 1, 0]][dir];
  const pts = base.map(([u, v]) => [x + u * turn[0] + v * turn[1], y + u * turn[2] + v * turn[3]]);
  return { prims: [{ kind: 'poly', pts }], reach: s };
}
const SATELLITES = [
  (x, y) => ({ prims: [{ kind: 'disc', x, y, r: .1 }], reach: .1 }),
  (x, y, rnd) => { const h = rnd() < .5, l = .14; return { prims: [{ kind: 'line', pts: h ? [[x - l, y], [x + l, y]] : [[x, y - l], [x, y + l]], w: .12 }], reach: l + .06 }; },
  (x, y, rnd) => { const d = rnd() < .5 ? 1 : -1, l = .1; return { prims: [{ kind: 'line', pts: [[x - l, y - l * d], [x + l, y + l * d]], w: .12 }], reach: l * 1.42 + .06 }; },
  (x, y, rnd) => triangle(x, y, .13, Math.floor(rnd() * 4)),
  (x, y) => ({ prims: [{ kind: 'ring', x, y, r: .09, w: .075 }], reach: .13 }),
  // A bracket corner: two short bars meeting (an L turned any way), small.
  (x, y, rnd) => { const k = Math.floor(rnd() * 4), sx = k & 1 ? 1 : -1, sy = k & 2 ? 1 : -1, l = .11;
    return { prims: [{ kind: 'line', pts: [[x + sx * l, y + sy * l], [x - sx * l, y + sy * l], [x - sx * l, y - sy * l]], w: .1 }], reach: l * 1.42 + .05 }; },
];
const ANCHOR_SPOTS = [[.38, .5], [.62, .5], [.5, .38], [.5, .62], [.37, .37], [.63, .63], [.37, .63], [.63, .37]];
const SAT_SPOTS = []; for (const x of [.13, .5, .87]) for (const y of [.13, .5, .87]) SAT_SPOTS.push([x, y]);
for (const [x, y] of [[.31, .13], [.69, .13], [.31, .87], [.69, .87], [.13, .31], [.13, .69], [.87, .31], [.87, .69]]) SAT_SPOTS.push([x, y]);
const GAP = .09; // the least space between two pieces of one glyph (1.3 px of the 14 px box)

// Glyph `index`'s primitives (unit box, y up). Deterministic.
export function glyphShape(index) { return GLYPHS()[index % GLYPH_COUNT]; }

let glyphCache = null;
function GLYPHS() {
  if (glyphCache) return glyphCache;
  const rnd = mulberry(ATLAS.seed), list = [], seen = new Set();
  for (let tries = 0; list.length < GLYPH_COUNT && tries < 20000; tries++) {
    const anchorSpot = ANCHOR_SPOTS[Math.floor(rnd() * ANCHOR_SPOTS.length)];
    const anchor = ANCHORS[Math.floor(rnd() * ANCHORS.length)](anchorSpot[0], anchorSpot[1], rnd);
    const pieces = [{ x: anchorSpot[0], y: anchorSpot[1], reach: reachOf(anchor) }], prims = [...anchor.prims];
    const want = 1 + Math.floor(rnd() * 3);
    for (let k = 0, attempts = 0; k < want && attempts < 40; attempts++) {
      const [x, y] = SAT_SPOTS[Math.floor(rnd() * SAT_SPOTS.length)];
      const sat = SATELLITES[Math.floor(rnd() * SATELLITES.length)](x, y, rnd);
      if (pieces.some(p => Math.hypot(p.x - x, p.y - y) < p.reach + sat.reach + GAP)) continue;
      if (x - sat.reach < 0 || x + sat.reach > 1 || y - sat.reach < 0 || y + sat.reach > 1) continue;
      pieces.push({ x, y, reach: sat.reach }); prims.push(...sat.prims); k++;
    }
    if (pieces.length < 2) continue;
    // Two glyphs that raster the same are one glyph: keep the first.
    const key = rasterKey(prims);
    if (seen.has(key)) continue;
    seen.add(key); list.push(prims);
  }
  return glyphCache = list;
}

// ---------------------------------------------------------------------------
// The pictograms. Authored in the unit box, y up.

const circlePts = (x, y, r, n = 16, a0 = 0, a1 = Math.PI * 2) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [x + Math.cos(a) * r, y + Math.sin(a) * r]; });
const mirrorX = prims => prims.map(p => ({ ...p, x: p.x == null ? p.x : 1 - p.x, pts: p.pts?.map(([x, y]) => [1 - x, y]) }));
const rotate90 = prims => prims.map(p => ({ ...p, ...(p.x == null ? {} : { x: 1 - p.y, y: p.x }), pts: p.pts?.map(([x, y]) => [1 - y, x]) }));

const ARROW_RIGHT = [{ kind: 'poly', pts: [[.1, .4], [.54, .4], [.54, .2], [.9, .5], [.54, .8], [.54, .6], [.1, .6]] }];
const EYE_OUTLINE = [...Array.from({ length: 9 }, (_, i) => [.06 + .88 * i / 8, .5 + .3 * Math.sin(Math.PI * i / 8)]), ...Array.from({ length: 7 }, (_, i) => [.94 - .88 * (i + 1) / 8, .5 - .3 * Math.sin(Math.PI * (i + 1) / 8)])];

export const PICTOGRAMS = Object.freeze({
  can: [
    { kind: 'poly', pts: [[.3, .08], [.7, .08], [.7, .8], [.3, .8]] },
    { kind: 'poly', pts: [[.33, .8], [.67, .8], [.63, .9], [.37, .9]] },
    { kind: 'line', pts: [[.3, .66], [.7, .66]], w: .045, cut: true },
    { kind: 'disc', x: .5, y: .4, r: .12, cut: true },
    { kind: 'disc', x: .5, y: .4, r: .06 },
  ],
  bowl: [
    { kind: 'poly', pts: [[.1, .44], ...circlePts(.5, .44, .4, 12, Math.PI, Math.PI * 2).slice(1, -1), [.9, .44]] },
    { kind: 'line', pts: [[.06, .44], [.94, .44]], w: .06 },
    ...[.32, .5, .68].map(x => ({ kind: 'line', pts: [[x, .54], [x + .05, .64], [x - .03, .75], [x + .03, .88]], w: .05 })),
  ],
  heart: [
    { kind: 'disc', x: .34, y: .64, r: .2 }, { kind: 'disc', x: .66, y: .64, r: .2 },
    { kind: 'poly', pts: [[.155, .57], [.845, .57], [.5, .12]] },
  ],
  bolt: [{ kind: 'poly', pts: [[.6, .96], [.24, .47], [.47, .47], [.37, .04], [.78, .57], [.54, .57], [.7, .96]] }],
  'arrow-right': ARROW_RIGHT,
  'arrow-left': mirrorX(ARROW_RIGHT),
  'arrow-up': rotate90(ARROW_RIGHT),
  walk: [
    { kind: 'disc', x: .56, y: .86, r: .095 },
    { kind: 'line', pts: [[.53, .72], [.47, .44]], w: .12 },
    { kind: 'line', pts: [[.47, .44], [.62, .26], [.68, .06]], w: .1 },
    { kind: 'line', pts: [[.47, .44], [.37, .23], [.24, .08]], w: .1 },
    { kind: 'line', pts: [[.52, .68], [.67, .54], [.76, .42]], w: .085 },
    { kind: 'line', pts: [[.52, .68], [.37, .56], [.3, .43]], w: .085 },
  ],
  hand: [
    { kind: 'poly', pts: [[.3, .08], [.7, .08], [.74, .5], [.28, .5]] },
    ...[[.34, .82], [.46, .9], [.58, .88], [.69, .78]].map(([x, top]) => ({ kind: 'line', pts: [[x, .46], [x, top]], w: .1 })),
    { kind: 'line', pts: [[.3, .3], [.15, .52]], w: .1 },
  ],
  warning: [
    { kind: 'poly', pts: [[.5, .95], [.96, .1], [.04, .1]] },
    { kind: 'poly', pts: [[.5, .77], [.81, .2], [.19, .2]], cut: true },
    { kind: 'line', pts: [[.5, .64], [.5, .42]], w: .1 },
    { kind: 'disc', x: .5, y: .29, r: .06 },
  ],
  biohazard: [
    ...[0, 1, 2].map(k => { const a = Math.PI / 2 + k * Math.PI * 2 / 3; return { kind: 'disc', x: .5 + Math.cos(a) * .2, y: .47 + Math.sin(a) * .2, r: .21 }; }),
    ...[0, 1, 2].map(k => { const a = Math.PI / 2 + k * Math.PI * 2 / 3; return { kind: 'disc', x: .5 + Math.cos(a) * .29, y: .47 + Math.sin(a) * .29, r: .15, cut: true }; }),
    { kind: 'disc', x: .5, y: .47, r: .08, cut: true },
    { kind: 'ring', x: .5, y: .47, r: .17, w: .05 },
    { kind: 'disc', x: .5, y: .47, r: .035, cut: true },
  ],
  'no-port': [
    { kind: 'disc', x: .5, y: .5, r: .15 }, { kind: 'disc', x: .5, y: .5, r: .065, cut: true },
    ...[0, 1, 2, 3].map(k => { const a = Math.PI / 4 + k * Math.PI / 2; return { kind: 'disc', x: .5 + Math.cos(a) * .24, y: .5 + Math.sin(a) * .24, r: .04 }; }),
    { kind: 'ring', x: .5, y: .5, r: .38, w: .08 },
    { kind: 'line', pts: [[.24, .76], [.76, .24]], w: .12, cut: true },
    { kind: 'line', pts: [[.24, .76], [.76, .24]], w: .075 },
  ],
  note: [
    { kind: 'disc', x: .36, y: .22, r: .14 },
    { kind: 'line', pts: [[.48, .24], [.48, .88]], w: .075 },
    { kind: 'line', pts: [[.48, .88], [.68, .72], [.66, .52]], w: .075 },
  ],
  cocktail: [
    { kind: 'poly', pts: [[.14, .86], [.86, .86], [.5, .46]] },
    { kind: 'line', pts: [[.5, .48], [.5, .14]], w: .065 },
    { kind: 'line', pts: [[.3, .1], [.7, .1]], w: .07 },
    { kind: 'disc', x: .63, y: .72, r: .08, cut: true },
    { kind: 'line', pts: [[.66, .8], [.82, .96]], w: .045 },
  ],
  lips: [
    { kind: 'poly', pts: [[.06, .5], [.24, .67], [.41, .72], [.5, .65], [.59, .72], [.76, .67], [.94, .5], [.5, .54]] },
    { kind: 'poly', pts: [[.06, .5], [.5, .47], [.94, .5], [.76, .33], [.5, .26], [.24, .33]] },
  ],
  bottle: [
    { kind: 'poly', pts: [[.36, .06], [.64, .06], [.64, .55], [.56, .68], [.56, .92], [.44, .92], [.44, .68], [.36, .55]] },
    { kind: 'line', pts: [[.36, .32], [.64, .32]], w: .05, cut: true },
  ],
  sparkle: [{ kind: 'poly', pts: [[.5, .96], [.58, .58], [.96, .5], [.58, .42], [.5, .04], [.42, .42], [.04, .5], [.42, .58]] }],
  eye: [
    { kind: 'poly', pts: EYE_OUTLINE },
    { kind: 'disc', x: .5, y: .5, r: .2, cut: true },
    { kind: 'disc', x: .5, y: .5, r: .1 },
  ],
  cross: [{ kind: 'poly', pts: [[.38, .08], [.62, .08], [.62, .38], [.92, .38], [.92, .62], [.62, .62], [.62, .92], [.38, .92], [.38, .62], [.08, .62], [.08, .38], [.38, .38]] }],
  pill: [
    { kind: 'line', pts: [[.3, .3], [.7, .7]], w: .3 },
    { kind: 'line', pts: [[.4, .6], [.6, .4]], w: .045, cut: true },
  ],
  moon: [{ kind: 'disc', x: .5, y: .5, r: .38 }, { kind: 'disc', x: .66, y: .62, r: .32, cut: true }],
  car: [
    { kind: 'poly', pts: [[.05, .28], [.95, .28], [.95, .5], [.72, .53], [.6, .72], [.32, .72], [.2, .53], [.05, .5]] },
    { kind: 'poly', pts: [[.35, .55], [.48, .55], [.48, .66], [.36, .66]], cut: true },
    { kind: 'poly', pts: [[.52, .55], [.66, .55], [.58, .66], [.52, .66]], cut: true },
    { kind: 'disc', x: .27, y: .27, r: .14, cut: true }, { kind: 'disc', x: .73, y: .27, r: .14, cut: true },
    { kind: 'disc', x: .27, y: .27, r: .1 }, { kind: 'disc', x: .73, y: .27, r: .1 },
  ],
  phone: [
    { kind: 'poly', pts: [[.3, .06], [.7, .06], [.7, .94], [.3, .94]] },
    { kind: 'poly', pts: [[.35, .2], [.65, .2], [.65, .84], [.35, .84]], cut: true },
    { kind: 'disc', x: .5, y: .13, r: .035, cut: true },
    { kind: 'poly', pts: [[.4, .5], [.6, .62], [.4, .74]] }, // a play mark on its screen (an ad, not a word)
  ],
  chevrons: [
    { kind: 'line', pts: [[.2, .8], [.48, .5], [.2, .2]], w: .12 },
    { kind: 'line', pts: [[.52, .8], [.8, .5], [.52, .2]], w: .12 },
  ],
  bulb: [
    { kind: 'disc', x: .5, y: .6, r: .28 },
    { kind: 'poly', pts: [[.36, .4], [.64, .4], [.6, .2], [.4, .2]] },
    { kind: 'line', pts: [[.4, .13], [.6, .13]], w: .06 },
    { kind: 'line', pts: [[.44, .6], [.5, .5], [.56, .6]], w: .05, cut: true },
  ],
});
export const PICTOGRAM_NAMES = Object.freeze(Object.keys(PICTOGRAMS));
export const PICTOGRAM_INDEX = Object.freeze(Object.fromEntries(PICTOGRAM_NAMES.map((n, i) => [n, i])));
if (PICTOGRAM_NAMES.length > ATLAS.pictoColumns * ATLAS.pictoRows) throw new Error('glyph-atlas: too many pictograms for the atlas');

// ---------------------------------------------------------------------------
// The rasteriser: coverage of a primitive list at a unit-box point.

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  const ex = px - ax - dx * t, ey = py - ay - dy * t;
  return Math.sqrt(ex * ex + ey * ey);
}
// (Index loops, no destructuring or spreads: these run a few million times
// per atlas and every allocation there is garbage to collect.)
function inPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function primContains(p, x, y) {
  switch (p.kind) {
    case 'disc': { const dx = x - p.x, dy = y - p.y; return dx * dx + dy * dy <= p.r * p.r; }
    case 'ring': { const dx = x - p.x, dy = y - p.y; return Math.abs(Math.sqrt(dx * dx + dy * dy) - p.r) <= p.w / 2; }
    case 'poly': return inPolygon(x, y, p.pts);
    case 'line': { const q = p.pts; for (let i = 1; i < q.length; i++) if (segmentDistance(x, y, q[i - 1][0], q[i - 1][1], q[i][0], q[i][1]) <= p.w / 2) return true; return false; }
    default: return false;
  }
}
export function shapeCovers(prims, x, y) {
  let on = false;
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i], b = p.box;
    if (b && (x < b[0] || x > b[2] || y < b[1] || y > b[3])) continue;
    if (primContains(p, x, y)) on = !p.cut;
  }
  return on;
}
// Each primitive with its bounds (`box`), so a sample far from it skips it.
function withBoxes(prims) {
  return prims.map(p => {
    if (p.box) return p;
    const pad = p.kind === 'disc' ? p.r : p.kind === 'ring' ? p.r + p.w / 2 : p.kind === 'line' ? p.w / 2 : 0;
    const pts = p.pts || [[p.x, p.y]], xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    return { ...p, box: [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad] };
  });
}

// Draw `prims` into `data` (row-major, `stride` wide) over a box of `inner`
// texels at (left, top), y up in the shape, rows growing down in the data.
function rasterInto(data, stride, shape, left, top, inner, supersample = ATLAS.supersample) {
  const n = supersample, total = n * n, prims = withBoxes(shape);
  // Most texels are wholly in or out: probe the corners and the centre first
  // (every stroke is wider than a texel, so none slips between the probes)
  // and supersample only the texels on an edge. About 5x faster.
  const at = (c, r) => shapeCovers(prims, c / inner, 1 - r / inner);
  for (let row = 0; row < inner; row++) for (let col = 0; col < inner; col++) {
    const probe = at(col + .5, row + .5);
    if (probe === at(col, row) && probe === at(col + 1, row) && probe === at(col, row + 1) && probe === at(col + 1, row + 1)) {
      if (probe) data[(top + row) * stride + left + col] = 255;
      continue;
    }
    let hits = 0;
    for (let sy = 0; sy < n; sy++) for (let sx = 0; sx < n; sx++) {
      const x = (col + (sx + .5) / n) / inner, y = 1 - (row + (sy + .5) / n) / inner;
      if (shapeCovers(prims, x, y)) hits++;
    }
    if (hits) data[(top + row) * stride + left + col] = Math.round(255 * hits / total);
  }
}

// A shape rasterised on its own (tests, and the glyphs' duplicate check):
// `inner` x `inner` bytes, row 0 the top.
export function rasterShape(prims, inner = ATLAS.glyphCell - 2 * ATLAS.glyphPad, supersample = ATLAS.supersample) {
  const data = new Uint8Array(inner * inner);
  rasterInto(data, inner, prims, 0, 0, inner, supersample);
  return data;
}
function rasterKey(prims) {
  const r = rasterShape(prims, 12, 2); let key = '';
  for (let i = 0; i < r.length; i++) key += r[i] >= 128 ? '1' : '0';
  return key;
}

// The pieces of a thresholded raster (8-connected), for the glyph rule.
export function componentCount(data, width, height, threshold = 128) {
  const seen = new Uint8Array(width * height), stack = [];
  let count = 0;
  for (let start = 0; start < data.length; start++) {
    if (data[start] < threshold || seen[start]) continue;
    count++; stack.push(start); seen[start] = 1;
    while (stack.length) {
      const at = stack.pop(), x = at % width, y = (at - x) / width;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, n = ny * width + nx;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || seen[n] || data[n] < threshold) continue;
        seen[n] = 1; stack.push(n);
      }
    }
  }
  return count;
}

// The cracked-glass strip: lines from two impact points, branching. Drawn in
// the strip's own proportions (x 0..4, y 0..1: it is 256 x 64 texels), so a
// line is the same width whichever way it runs.
const CRACK_ASPECT = 4;
function crackPrims() {
  const rnd = mulberry(ATLAS.seed ^ 0x5eed), prims = [], w = .022;
  for (const [ix, iy] of [[1.1, .58], [2.9, .4]]) {
    prims.push({ kind: 'ring', x: ix, y: iy, r: .06, w });
    const arms = 7 + Math.floor(rnd() * 3);
    for (let a = 0; a < arms; a++) {
      let angle = a / arms * Math.PI * 2 + rnd() * .5, x = ix, y = iy;
      const pts = [[x, y]], steps = 5 + Math.floor(rnd() * 4);
      for (let s = 0; s < steps; s++) {
        angle += (rnd() - .5) * .8; const len = .06 + rnd() * .1;
        x += Math.cos(angle) * len; y += Math.sin(angle) * len;
        pts.push([x, y]);
        if (rnd() < .35) { const b = angle + (rnd() < .5 ? .9 : -.9), l = .04 + rnd() * .08; prims.push({ kind: 'line', pts: [[x, y], [x + Math.cos(b) * l, y + Math.sin(b) * l]], w: w * .8 }); }
      }
      prims.push({ kind: 'line', pts, w });
    }
  }
  return withBoxes(prims);
}

// ---------------------------------------------------------------------------
// The atlas.

let atlasCache = null;
// { data (Uint8Array size*size), size, glyphCount, pictograms (names) }, made
// once per page (deterministic).
export function buildGlyphAtlas() {
  if (atlasCache) return atlasCache;
  const size = ATLAS.size, data = new Uint8Array(size * size);
  const glyphs = GLYPHS(), gi = ATLAS.glyphCell - 2 * ATLAS.glyphPad;
  glyphs.forEach((prims, i) => {
    const col = i % ATLAS.glyphColumns, row = Math.floor(i / ATLAS.glyphColumns);
    rasterInto(data, size, prims, col * ATLAS.glyphCell + ATLAS.glyphPad, row * ATLAS.glyphCell + ATLAS.glyphPad, gi);
  });
  const pi = ATLAS.pictoCell - 2 * ATLAS.pictoPad;
  PICTOGRAM_NAMES.forEach((name, i) => {
    const col = i % ATLAS.pictoColumns, row = Math.floor(i / ATLAS.pictoColumns);
    rasterInto(data, size, PICTOGRAMS[name], col * ATLAS.pictoCell + ATLAS.pictoPad, ATLAS.pictoTop + row * ATLAS.pictoCell + ATLAS.pictoPad, pi);
  });
  // The crack strip: its own 256 x 64 box, 2 x 2 samples a texel.
  const strip = crackPrims(), top = ATLAS.crackTop, h = size - top;
  const covers = (c, r) => shapeCovers(strip, c / size * CRACK_ASPECT, 1 - r / h);
  for (let row = 0; row < h; row++) for (let col = 0; col < size; col++) {
    const probe = covers(col + .5, row + .5);
    if (probe === covers(col, row) && probe === covers(col + 1, row) && probe === covers(col, row + 1) && probe === covers(col + 1, row + 1)) {
      if (probe) data[(top + row) * size + col] = 255;
      continue;
    }
    let hits = 0;
    for (let s = 0; s < 4; s++) { const x = (col + (s & 1 ? .75 : .25)) / size * CRACK_ASPECT, y = 1 - (row + (s & 2 ? .75 : .25)) / h; if (shapeCovers(strip, x, y)) hits++; }
    if (hits) data[(top + row) * size + col] = Math.round(255 * hits / 4);
  }
  return atlasCache = { data, size, glyphCount: glyphs.length, pictograms: PICTOGRAM_NAMES };
}

// A new texture over the shared bytes (one per view; three uploads it once).
// Mipmapped: the screens read it with textureGrad from their continuous
// coordinates, so a glyph's cell edge never picks the smallest mip.
export function glyphAtlasTexture() {
  const { data, size } = buildGlyphAtlas();
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.unpackAlignment = 1; texture.flipY = false;
  texture.name = 'lumen-glyph-atlas'; texture.needsUpdate = true;
  return texture;
}

// A pictogram's cell in atlas uv (u0, v0 at its top-left texel corner, u1,
// v1 at the bottom-right; v grows downward through the drawing).
export function pictogramRect(name) {
  const i = typeof name === 'number' ? name : PICTOGRAM_INDEX[name];
  if (i == null) throw new Error(`glyph-atlas: no pictogram "${name}"`);
  const col = i % ATLAS.pictoColumns, row = Math.floor(i / ATLAS.pictoColumns), s = ATLAS.size, c = ATLAS.pictoCell;
  return { u0: col * c / s, v0: (ATLAS.pictoTop + row * c) / s, u1: (col + 1) * c / s, v1: (ATLAS.pictoTop + (row + 1) * c) / s };
}

// ---------------------------------------------------------------------------
// Strokes for the neon tubes: a shape's primitives as polylines (unit box,
// y up). Discs become small rings, rings circles, polygons their outline,
// lines themselves. A cut is drawn as its own outline (a tube cannot subtract).
export function shapeStrokes(prims, { ringSegments = 14 } = {}) {
  const strokes = [];
  for (const p of prims) {
    if (p.kind === 'disc') strokes.push(circlePts(p.x, p.y, Math.max(p.r * .6, .03), Math.max(6, Math.round(ringSegments * .6))));
    else if (p.kind === 'ring') strokes.push(circlePts(p.x, p.y, p.r, ringSegments));
    else if (p.kind === 'poly') strokes.push([...p.pts, p.pts[0]]);
    else if (p.kind === 'line') strokes.push(p.pts.map(q => [...q]));
  }
  return strokes;
}
export const glyphStrokes = index => shapeStrokes(glyphShape(index));
export const pictogramStrokes = name => shapeStrokes(PICTOGRAMS[name]);
