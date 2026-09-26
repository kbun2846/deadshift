// Marks on the ground of a map with hills (stage 5 detail, s5-ground): wagon
// ruts along the roads carts used, puddles in the ruts' low points and by the
// wells and troughs, hoofprints and cart tracks where horses stood and carts
// turned in, a trail of bare feet, straw at the barn doors and round the hay,
// chips round every woodpile and chopping block, ash and cinders by the
// forge, grain at the mill door, soil round the fresh graves, worn ground at
// the doors, and leaves drifted against the fieldstone walls and into
// building corners.
//
// This file only decides WHERE (pure: no three.js, no DOM; the node tests
// read it). render/ground-marks-view.js draws the result: every flat mark is
// a small grid draped on the drawn ground with a picture from one canvas
// atlas (render/ground-marks-atlas.js), all in one mesh (one draw), and the
// raised bits (straw, chips, cinders, leaves) are instances of one small
// shape (one more draw).
//
// Map data (all optional; a map without `groundMarks` gets none):
//   map.groundMarks = { ruts, oldRuts, ledges, cartTracks, trampled,
//     barefoot, ash, grain }   (see maps/hollow-wick-ground-marks.js)
// Everything else is found from the map: props by type (woodpile,
// choppingBlock, cordwood, haystack, wellSweep, waterTrough, fieldWall*,
// openGrave, freshMound, bodyPile, and any fire ring), buildings by style
// (straw at the barn's and horse sheds' doors, grain at the mill's) and
// every building's doors and corners.
//
// Every mark keeps the rules in markRules (below): inside the fence, out
// of the water, off decks and retaining walls, never inside a building, off
// the drag trail and the set pieces it does not belong to; raised bits also
// never inside anything solid. Flat marks and the raised bits have no
// collider: they are walked over and never stop a body, a round or a spawn,
// so the solid props' rules (door aprons, path lanes, spawn points) do not
// apply to them; ruts lie on the roads and straw at the doors on purpose.
import { isPlayable } from '../playable-area.js';
import { mapProps, mapColliders, buildingOpenings } from '../map-kit.js';
import { inside } from '../simulation.js';
import { boxIndex } from '../box-index.js';

// Which marks a preset draws: every mark has a tier; a preset draws the marks
// up to its own. Potato keeps the stories (ruts, puddles, the bare feet, the
// straw, chips, ash and grain; no raised bits), Performance adds the prints,
// cart tracks, mud and leaf drifts (and a fifth of the raised bits),
// Balanced the older ruts, worn doorways and the rest of the prints (more
// than half the bits), Quality and Extreme everything.
export const MARK_TIER = Object.freeze({ potato: 0, performance: 1, balanced: 2, quality: 3, extreme: 3 });
// Draw order inside the one mesh (later lies over earlier).
export const LAYER = Object.freeze({ ground: 0, ruts: 1, puddles: 2, prints: 3, spill: 4, leaves: 5 });
// The ruts: a strip this wide (m) under each wheel, GAUGE apart (a farm
// cart's track).
export const RUT_WIDTH = .5, GAUGE = 1.44;
// The raised bits' share per preset tier (a roll per bit): none on Potato.
const BIT_TIERS = [[1, .22], [2, .36], [3, .42]];
// Keep-clear margins (m).
const DRY = .03, DECK_MARGIN = .35, ROOM_INSET = .19, DRAG_CLEAR = 1, SET_PIECE_CLEAR = .4;
// The set pieces the marks keep off (their own builders' ground; the drag
// trail too, by its line): the hanging tree, the three skeletons, the
// rocking chair's stoop.
const SET_PIECES = ['hangingTree', 'skeletonLeaves', 'skeletonSickle', 'graveSkeleton', 'rockingChair'];
const SET_PIECE_REACH = { hangingTree: 4.2, skeletonLeaves: 1.6, skeletonSickle: 1.7, graveSkeleton: 1.1, rockingChair: 1 };

// Colours of the raised bits (sRGB). Leaves: the woods' litter browns only
// (never red: red on the ground reads as blood).
export const BIT_COLOURS = Object.freeze({
 straw: ['#9c8752', '#a8925a', '#8a7646', '#94825a'],
 chip: ['#8e7a5c', '#806e56', '#766b5c', '#6e665a', '#655d52'],
 bark: ['#4a3f33', '#3b322c', '#54473a'],
 kindling: ['#7a6a52', '#6e5c46', '#665644'],
 cinder: ['#2a2826', '#1f1e1d', '#34302c', '#3d3a36'],
 leaf: ['#8a6a3e', '#7a5a34', '#5a4632'],
 clod: ['#6a5238', '#4e3c2a', '#5a4632'],
});

const seeded = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Smooth 1-D value noise, -1..1.
const noise1 = (seed, t) => {
 const h = i => { let v = Math.imul(i | 0, 374761393) ^ Math.imul(seed, 668265263); v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 2147483648 - 1; };
 const i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f);
 return h(i) + (h(i + 1) - h(i)) * s;
};
const segDist = (x, z, ax, az, bx, bz) => {
 const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)) : 0;
 return Math.hypot(ax + dx * t - x, az + dz * t - z);
};
const lineDist = (x, z, pts) => { let best = Infinity; for (let i = 1; i < pts.length; i++) best = Math.min(best, segDist(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])); return best; };
const polyDist = (x, z, poly) => { let best = Infinity; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; best = Math.min(best, segDist(x, z, a[0], a[1], b[0], b[1])); } return best; };
const insidePolygon = (x, z, poly) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [ax, az] = poly[i], [bx, bz] = poly[j]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside; } return inside; };
// A local point of something turned by `angle` (props, buildings) in the world.
const toWorld = (o, lx, lz) => { const c = Math.cos(o.angle || 0), s = Math.sin(o.angle || 0); return [o.x + lx * c + lz * s, o.z - lx * s + lz * c]; };
// A direction in something's frame, in the world.
const dirWorld = (o, dx, dz) => { const c = Math.cos(o.angle || 0), s = Math.sin(o.angle || 0); return [dx * c + dz * s, -dx * s + dz * c]; };
const heading = (dx, dz) => Math.atan2(dx, dz);

// The corners of a mark's rectangle (and its middle and edge middles).
// A mark's frame: `along` = (sin yaw, cos yaw), `across` = (cos yaw, -sin yaw).
const RECT = [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]];
export function markPoints(m) {
 const sa = Math.sin(m.yaw), ca = Math.cos(m.yaw), hw = m.w / 2, hl = m.l / 2;
 return RECT.map(([u, v]) => [m.x + u * hw * ca + v * hl * sa, m.z - u * hw * sa + v * hl * ca]);
}

// Inside the fence: the same crossing test as playable-area.js isPlayable
// (radius 0), with the outline's edges bucketed by metre of z, so a point
// asks only the few edges level with it (the rounded outline has ~180).
function outlineTest(map) {
 const pts = map.playableArea;
 if (!pts) return (x, z) => isPlayable(map, x, z, 0);
 const bands = new Map();
 for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
  const [ax, az] = pts[j], [bx, bz] = pts[i];
  for (let k = Math.floor(Math.min(az, bz)); k <= Math.floor(Math.max(az, bz)); k++) { let list = bands.get(k); if (!list) bands.set(k, list = []); list.push([ax, az, bx, bz]); }
 }
 return (x, z) => {
  let inside = false;
  for (const [ax, az, bx, bz] of bands.get(Math.floor(z)) || []) if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  return inside;
 };
}

// ---- The rules every mark keeps (placement uses them to reject a spot; the
// tests check every placed mark with them).
export function markRules(map, ground) {
 const buildings = map.buildings || [], decks = ground.decks || [], playable = outlineTest(map);
 const props = mapProps(map);
 // Everything a raised bit may not lie inside: props' solid boxes, trunks,
 // stumps, logs, the stream works (not building walls: rooms are their own
 // rule; not retaining walls: the wall mask is).
 const solids = mapColliders(map).filter(c => !c.walkOver && !c.terrainEdge && !c.playerOnly && c.buildingId === undefined);
 const solidIndex = boxIndex(solids);
 const drag = props.filter(p => p.type === 'dragTrail').map(p => p.points).filter(Boolean);
 const setPieces = props.filter(p => SET_PIECES.includes(p.type)).map(p => ({ id: p.id, x: p.x, z: p.z, r: SET_PIECE_REACH[p.type] }));
 // Rooms: each building's inside (past its walls' inner faces), with a box
 // round it to reject most points at once.
 const rooms = buildings.map(b => ({ id: b.id, x: b.x, z: b.z, c: Math.cos(b.angle || 0), s: Math.sin(b.angle || 0), hw: b.w / 2 - ROOM_INSET, hd: b.d / 2 - ROOM_INSET, r: Math.hypot(b.w, b.d) / 2 }));
 const room = (x, z) => {
  for (const b of rooms) {
   const dx = x - b.x, dz = z - b.z; if (dx > b.r || dx < -b.r || dz > b.r || dz < -b.r) continue;
   if (Math.abs(dx * b.c - dz * b.s) < b.hw && Math.abs(dx * b.s + dz * b.c) < b.hd) return b;
  }
  return null;
 };
 const dragBox = drag.map(line => { const xs = line.map(p => p[0]), zs = line.map(p => p[1]); return [Math.min(...xs) - DRAG_CLEAR, Math.max(...xs) + DRAG_CLEAR, Math.min(...zs) - DRAG_CLEAR, Math.max(...zs) + DRAG_CLEAR]; });
 // One point's problem (null: fine). `owner`: the set piece a mark belongs to.
 const pointProblem = (x, z, owner) => {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 'not a number';
  if (!playable(x, z)) return 'outside the fence';
  if (ground.waterAt(x, z) > ground.drawnHeightAt(x, z) - DRY) return 'in the water';
  for (const d of decks) if (x >= d.x0 - DECK_MARGIN && x <= d.x1 + DECK_MARGIN && z >= d.z0 - DECK_MARGIN && z <= d.z1 + DECK_MARGIN && (insidePolygon(x, z, d.poly) || polyDist(x, z, d.poly) < DECK_MARGIN)) return 'on a deck';
  if (ground.wallAt(x, z)) return 'on a retaining wall';
  const b = room(x, z); if (b) return `inside ${b.id}`;
  for (let i = 0; i < drag.length; i++) { const k = dragBox[i]; if (x > k[0] && x < k[1] && z > k[2] && z < k[3] && lineDist(x, z, drag[i]) < DRAG_CLEAR) return 'on the drag trail'; }
  for (const s of setPieces) if (s.id !== owner && Math.hypot(x - s.x, z - s.z) < s.r + SET_PIECE_CLEAR) return `on ${s.id}`;
  return null;
 };
 return {
  pointProblem,
  // A flat mark (its rectangle's middle, corners and edge middles).
  decal(m) {
   // (A print-sized mark: its middle and corners are enough.)
   const sa = Math.sin(m.yaw), ca = Math.cos(m.yaw), hw = m.w / 2, hl = m.l / 2, n = Math.max(m.w, m.l) < .5 ? 5 : RECT.length;
   for (let k = 0; k < n; k++) { const [u, v] = RECT[k], p = pointProblem(m.x + u * hw * ca + v * hl * sa, m.z - u * hw * sa + v * hl * ca, m.owner); if (p) return p; }
   return null;
  },
  // A raised bit: its point, and never inside anything solid.
  bit(b) {
   const p = pointProblem(b.x, b.z, b.owner); if (p) return p;
   if (solidIndex.some(b.x, b.z, .05, c => inside(b, c, .03))) return 'inside something solid';
   return null;
  },
  solids, props,
 };
}

// ---- Roads: the ruts' centre lines.
function chainPoints(map, chain) {
 const out = [];
 for (const item of chain) {
  const pts = typeof item === 'string' ? (map.terrain?.paths || []).find(p => p.id === item)?.points.map(p => [p[0], p[1]]) : [item];
  if (!pts) continue;
  for (const p of pts) if (!out.length || Math.hypot(out.at(-1)[0] - p[0], out.at(-1)[1] - p[1]) > .05) out.push(p);
 }
 return out;
}
// Corners cut (Chaikin, twice): a cart turns, it does not kink.
function smoothLine(pts, rounds = 2) {
 let line = pts;
 for (let r = 0; r < rounds; r++) {
  const next = [line[0]];
  for (let i = 0; i < line.length - 1; i++) {
   const [ax, az] = line[i], [bx, bz] = line[i + 1];
   next.push([ax * .75 + bx * .25, az * .75 + bz * .25], [ax * .25 + bx * .75, az * .25 + bz * .75]);
  }
  next.push(line.at(-1)); line = next;
 }
 return line;
}
// Points every `step` m along a line: { x, z, s (m along), tx, tz (unit) }.
export function resample(pts, step = .5) {
 const out = []; let s = 0;
 const lengths = []; for (let i = 1; i < pts.length; i++) lengths.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
 const total = lengths.reduce((a, b) => a + b, 0);
 const n = Math.max(1, Math.round(total / step));
 let leg = 0, into = 0;
 for (let k = 0; k <= n; k++) {
  s = total * k / n;
  while (leg < lengths.length - 1 && into + lengths[leg] < s) { into += lengths[leg]; leg++; }
  const [ax, az] = pts[leg], [bx, bz] = pts[leg + 1], l = lengths[leg] || 1, t = Math.max(0, Math.min(1, (s - into) / l));
  out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, s, tx: (bx - ax) / l, tz: (bz - az) / l });
 }
 // Tangents from the neighbours (smoother than a leg's own).
 for (let k = 0; k < out.length; k++) {
  const a = out[Math.max(0, k - 1)], b = out[Math.min(out.length - 1, k + 1)], l = Math.hypot(b.x - a.x, b.z - a.z);
  if (l > 1e-6) { out[k].tx = (b.x - a.x) / l; out[k].tz = (b.z - a.z) / l; }
 }
 return out;
}
// A cubic curve (4 points) as a polyline.
const cubic = (c, n = 24) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [0, 1].map(k => u * u * u * c[0][k] + 3 * u * u * t * c[1][k] + 3 * u * t * t * c[2][k] + t * t * t * c[3][k]); });

// ---- The placement.
export function placeGroundMarks(ground, map) {
 // (`rejected`: the spots a rule turned down, for the tools and tests.)
 const out = { decals: [], strips: [], bits: [], stats: {}, rejected: [] };
 const data = map?.groundMarks;
 if (!data || !ground || ground.flat || !map.terrain) return out;
 const rules = markRules(map, ground), props = rules.props;
 const random = seeded(((map.scenerySeed ?? 1) * 977 + 5151) >>> 0);
 const slope = { x: 0, z: 0 };
 const steep = (x, z) => { ground.gradientAt(x, z, slope); return Math.hypot(slope.x, slope.z); };
 // A flat mark, kept only if it keeps the rules.
 // Spills, drifts and patches that do not fit (a wall, a building, the
 // fence) are tried again smaller before they are given up; prints,
 // puddles and ledges keep their size.
 const SHRINKS = ['chips', 'straw', 'soil', 'leaves', 'mud', 'ash', 'scuff', 'wet', 'grain'];
 const decal = (m, trusted = false) => {
  const mark = { alpha: 1, tint: 1, mirror: false, tier: 0, layer: LAYER.ground, ...m };
  // (Prints inside a band already checked, a rut pair's middle: no second check.)
  if (trusted) { out.decals.push(mark); return mark; }
  let why = null;
  // (Chips and soil round a block or a grave by a wall may also slide off it
  // a little.)
  const nudges = ['chips', 'soil'].includes(mark.kind) ? [[0, 0], [.45, 0], [-.45, 0], [0, .45], [0, -.45], [.8, 0], [-.8, 0], [0, .8], [0, -.8]] : [[0, 0]];
  for (const k of SHRINKS.includes(mark.kind) ? [1, .75, .55] : [1]) for (const [dx, dz] of nudges) {
   const tried = k === 1 && !dx && !dz ? mark : { ...mark, x: mark.x + dx, z: mark.z + dz, w: mark.w * k, l: mark.l * k };
   why = rules.decal(tried) || (steep(tried.x, tried.z) > .62 ? 'steep' : null);
   if (!why) { out.decals.push(tried); return tried; }
  }
  out.rejected.push({ kind: mark.kind, x: mark.x, z: mark.z, why }); return null;
 };
 // A raised bit: a small piece lying on the ground (tier rolled per bit
 // unless given).
 const bit = (kind, x, z, size, extra = {}) => {
  const [sx, sy, sz] = size, colours = BIT_COLOURS[extra.colours || kind];
  const b = { kind, x, z, yaw: random() * Math.PI * 2, sx, sy, sz, tiltX: (random() - .5) * (extra.tilt ?? .3), tiltZ: (random() - .5) * (extra.tilt ?? .3),
   color: colours[Math.floor(random() * colours.length)], shade: .88 + random() * .2, tier: extra.tier ?? rollTier(random()), owner: extra.owner };
  if (extra.yaw !== undefined) b.yaw = extra.yaw;
  if (rules.bit(b) || steep(x, z) > .55) return null;
  out.bits.push(b); return b;
 };

 // A walking horse: each side's hind hoof lands on or just by its fore
 // hoof's print, the sides alternating every half stride.
 const hoofTrail = (pts, { stride = 1.5, gauge = .24, tier = 1, alpha = .85, owner, trusted = false } = {}) => {
  if (pts.length < 2) return;
  const line = resample(pts, stride / 2);
  line.forEach((p, i) => {
   if (i === 0 || i === line.length - 1) return;
   const side = i % 2 ? 1 : -1, nx = p.tz, nz = -p.tx, yaw = heading(p.tx, p.tz);
   const x = p.x + nx * side * gauge / 2 + (random() - .5) * .05, z = p.z + nz * side * gauge / 2 + (random() - .5) * .05;
   decal({ kind: 'hoof', cell: 'hoof', x, z, yaw: yaw + (random() - .5) * .25, w: .14, l: .16, alpha, tier, layer: LAYER.prints, owner }, trusted);
   decal({ kind: 'hoof', cell: 'hoof', x: x + p.tx * .09 + nx * side * .03, z: z + p.tz * .09 + nz * side * .03, yaw: yaw + (random() - .5) * .3, w: .13, l: .15, alpha: alpha * .7, tier: Math.max(tier, 2), layer: LAYER.prints, owner }, trusted);
  });
 };
 // Where a horse stood: churned mud, prints every way.
 const trample = (x, z, r, owner) => {
  decal({ kind: 'mud', cell: 'mud-2', x, z, yaw: random() * Math.PI * 2, w: r * 2.3, l: r * 2, alpha: .8, tier: 1, owner });
  const n = Math.round(10 + r * 8);
  for (let i = 0; i < n; i++) {
   const a = random() * Math.PI * 2, d = Math.sqrt(random()) * r;
   decal({ kind: 'hoof', cell: 'hoof', x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, yaw: random() * Math.PI * 2, w: .14, l: .16, alpha: .55 + random() * .3, tier: i < n / 2 ? 1 : 2, layer: LAYER.prints, owner });
  }
 };
 // Ledges: rock showing through a road. Placed first: the ruts break over them.
 const ledges = [];
 for (const [x, z, w, l, yaw] of data.ledges || []) {
  const m = decal({ kind: 'ledge', cell: `ledge-${ledges.length % 3}`, x, z, w, l, yaw, tier: 0, layer: LAYER.ground, alpha: .95 });
  if (m) ledges.push(m);
 }
 const onLedge = (x, z, grow = 0) => ledges.find(m => { const dx = x - m.x, dz = z - m.z, a = dx * Math.cos(m.yaw) - dz * Math.sin(m.yaw), b = dx * Math.sin(m.yaw) + dz * Math.cos(m.yaw); return Math.abs(a) < m.w / 2 + grow && Math.abs(b) < m.l / 2 + grow; });

 // ---- Ruts: a narrow strip for each wheel, GAUGE apart on the pair's line
 // (the axle keeps them parallel), each its own picture so the two differ
 // (two narrow strips shade half the ground one 2 m strip for the pair
 // would).
 const roads = new Map();
 const stripRuns = (rows, spec) => {
  // Rows that break the rules for the pair (a deck, the water, a wall...)
  // split it into runs; a run under 2 m is dropped, and each fades in and
  // out. Returns the runs.
  const runs = []; let run = [];
  const reach = GAUGE / 2 + RUT_WIDTH / 2, stone = (x, z) => onLedge(x, z, RUT_WIDTH / 2 + .05) ? 0 : onLedge(x, z, .8) ? .35 : 1;
  const flush = () => {
   if (run.length >= 5) {
    const s0 = run[0].s, s1 = run.at(-1).s, fade = spec.cutFade ?? 1.4;
    const faded = run.map(r => ({ ...r, a: r.a * smooth(s0 - .01, s0 + fade, r.s) * smooth(s1 + .01, s1 - fade, r.s) }));
    spec.cells.forEach((cell, k) => {
     const side = k ? -1 : 1, seed = spec.seed + k * 13;
     // (Each wheel breaks over rock under it: `stone`.)
     out.strips.push({ kind: spec.kind, cell, width: RUT_WIDTH, tier: spec.tier, layer: LAYER.ruts, road: spec.road, v0: random(),
      rows: faded.map(r => { const x = r.x + r.nx * side * GAUGE / 2, z = r.z + r.nz * side * GAUGE / 2; return { x, z, s: r.s, nx: r.nx, nz: r.nz, a: r.a * (.8 + .2 * noise1(seed, r.s / 5)) * stone(x, z) }; }) });
    });
    runs.push(faded);
   }
   run = [];
  };
  for (const r of rows) {
   const ok = r.a > .02 && [0, reach, -reach].every(k => !rules.pointProblem(r.x + r.nx * k, r.z + r.nz * k)) && steep(r.x, r.z) < .6;
   r.ok = ok; if (ok) run.push(r); else flush();
  }
  flush();
  return runs;
 };
 const rutCells = cell => cell === 'ruts-old' ? ['rut-old-a', 'rut-old-b'] : ['rut-a', 'rut-b'];
 (data.ruts || []).forEach((road, index) => {
  const line = resample(smoothLine(chainPoints(map, road.chain)), .5);
  if (line.length < 4) return;
  const length = line.at(-1).s, seed = 31 + index * 17, fade = road.fade ?? 3;
  // The pair's line wanders a little off the path's centre (never off the path).
  const rows = line.map(p => {
   const off = (road.wander ?? .2) * noise1(seed, p.s / 9);
   const nx = p.tz, nz = -p.tx; // the way's left (a mark's `across`: (cos yaw, -sin yaw))
   const x = p.x + nx * off, z = p.z + nz * off;
   let a = (road.wear ?? 1) * smooth(0, fade, p.s) * smooth(length, length - fade, p.s) * (.8 + .2 * noise1(seed + 7, p.s / 3.5));
   // Broken over the rock.
   if (onLedge(x, z, .1)) a = 0; else if (onLedge(x, z, .8)) a *= .35;
   return { x, z, s: p.s, nx, nz, a };
  });
  roads.set(road.id, { rows, road });
  const runs = stripRuns(rows, { kind: 'ruts', cells: rutCells(road.cell), tier: 0, road: road.id, seed });
  // The horse's way between the wheels: its prints, faint (Balanced and up).
  for (const run of runs) hoofTrail(run.filter(r => r.a > .4).map(r => [r.x, r.z]), { tier: 2, alpha: .42, gauge: .22, trusted: true });
 });
 for (const extra of data.oldRuts || []) {
  const r = roads.get(extra.road); if (!r) continue;
  const rows = r.rows.filter(p => p.s >= extra.from && p.s <= extra.to).map(p => ({ ...p, x: p.x + p.nx * extra.offset, z: p.z + p.nz * extra.offset, a: (extra.wear ?? .5) * smooth(extra.from, extra.from + 3, p.s) * smooth(extra.to, extra.to - 3, p.s) * (onLedge(p.x, p.z, .3) ? 0 : 1) }));
  stripRuns(rows, { kind: 'ruts', cells: rutCells(extra.cell || 'ruts-old'), tier: 2, road: extra.road, seed: 71 });
 }
 // ---- Puddles in the ruts' low points: where a ramp runs out onto level
 // ground (the water comes down the ruts and stands there), at the bends
 // (the wheels dig in), and on level stretches a few more, in whichever rut
 // lies lower. At most `puddles` a road, 7 m apart along it and 6 m from
 // any other.
 let puddleCount = 0; const puddleSpots = [];
 const puddleCell = () => `puddle-${puddleCount++ % 4}`;
 for (const { rows, road } of roads.values()) {
  const h = (i, side) => { const r = rows[Math.max(0, Math.min(rows.length - 1, i))]; return ground.drawnHeightAt(r.x + r.nx * side * GAUGE / 2, r.z + r.nz * side * GAUGE / 2); };
  const scored = [];
  for (let i = 4; i < rows.length - 4; i++) {
   const r = rows[i]; if (r.a < .45 || !r.ok || !rows[i - 2].ok || !rows[i + 2].ok) continue;
   const grade = Math.abs(h(i + 2, 0) - h(i - 2, 0)) / 2;
   if (grade > .05) continue;
   const before = (h(i - 6, 0) - h(i, 0)) / 3, after = (h(i + 6, 0) - h(i, 0)) / 3;
   const foot = Math.max(0, Math.max(before, after) - .08) * 6;
   const turn = Math.abs(Math.atan2(rows[i - 3].nx * rows[i + 3].nz - rows[i - 3].nz * rows[i + 3].nx, rows[i - 3].nx * rows[i + 3].nx + rows[i - 3].nz * rows[i + 3].nz));
   scored.push({ i, score: foot * 1.6 + turn + random() * .5, foot });
  }
  scored.sort((a, b) => b.score - a.score);
  const taken = [];
  for (const c of scored) {
   if (taken.length >= (road.puddles ?? 3)) break;
   if (taken.some(t => Math.abs(rows[t].s - rows[c.i].s) < 7)) continue;
   const r = rows[c.i]; if (puddleSpots.some(([x, z]) => Math.hypot(x - r.x, z - r.z) < 6)) continue;
   const side = h(c.i, 1) < h(c.i, -1) ? 1 : h(c.i, 1) > h(c.i, -1) ? -1 : (random() < .5 ? 1 : -1);
   // (A ramp's foot gathers the most: sometimes right across the road.)
   const wide = c.foot > .3 && random() < .7;
   const x = r.x + r.nx * (wide ? side * .2 : side * GAUGE / 2), z = r.z + r.nz * (wide ? side * .2 : side * GAUGE / 2);
   const m = decal({ kind: 'puddle', cell: puddleCell(), x, z, yaw: heading(-r.nz, r.nx) + (random() - .5) * .2, w: wide ? 1.9 : .55 + random() * .15, l: wide ? 1.3 + random() * .4 : 1.1 + random() * .7, tint: 1.08, tier: 0, layer: LAYER.puddles });
   if (m) { taken.push(c.i); puddleSpots.push([r.x, r.z]); }
  }
 }
 // By the wells and troughs: where buckets were set down and water slopped,
 // and where the animals stood to drink (churned mud).
 for (const p of props) {
  if (p.type === 'wellSweep') {
   // Round the curb, away from the sweep's upright and its stone (the
   // upright stands 3 m off along the prop's local x).
   const away = heading(...dirWorld(p, -1, 0)), tries = [.35, -.35, .9, -.9, 1.4, -1.4].map(a => a + away);
   let n = 0;
   for (const a of tries) {
    if (n >= 2) break;
    const r = 1.55 + n * .35, x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
    decal({ kind: 'mud', cell: 'mud-0', x, z, yaw: a, w: 1.9, l: 1.5, alpha: .8, tier: 1, owner: p.id });
    if (decal({ kind: 'puddle', cell: puddleCell(), x, z, yaw: a + Math.PI / 2, w: n ? .6 : .85, l: n ? .8 : 1.15, tint: 1.08, tier: 0, layer: LAYER.puddles, owner: p.id })) n++;
   }
  }
  if (p.type === 'waterTrough') {
   // The long side with the more open ground in front.
   for (const side of [1, -1]) {
    const [x, z] = toWorld(p, (random() - .5) * .5, side * 1.05), [nx, nz] = dirWorld(p, 0, side), yaw = heading(nx, nz);
    if (rules.pointProblem(x + nx * 1.4, z + nz * 1.4) || rules.solids.some(c => c.propId !== p.id && inside({ x: x + nx * .8, z: z + nz * .8 }, c, .3))) continue;
    decal({ kind: 'mud', cell: 'mud-1', x: x + nx * .4, z: z + nz * .4, yaw, w: 2.8, l: 1.8, alpha: .85, tier: 1, owner: p.id });
    decal({ kind: 'puddle', cell: puddleCell(), x, z, yaw: yaw + Math.PI / 2, w: .7, l: 1.5, tint: 1.08, tier: 0, layer: LAYER.puddles, owner: p.id });
    decal({ kind: 'wet', cell: 'wet', x: x + nx * .5, z: z + nz * .5, yaw, w: 1.8, l: 1, alpha: .7, tier: 1, owner: p.id });
    // The beasts stood here to drink.
    trample(x + nx * 1.1, z + nz * 1.1, .8, p.id);
    break;
   }
  }
 }
 out.stats.puddles = out.decals.filter(d => d.kind === 'puddle').length;

 // ---- Prints.
 for (const t of data.cartTracks || []) {
  const pts = cubic(t.curve);
  const rows = resample(pts, .5).map((p, i, all) => ({ x: p.x, z: p.z, s: p.s, nx: p.tz, nz: -p.tx, a: (t.wear ?? .7) * smooth(0, 3, p.s) * smooth(all.at(-1).s + .1, all.at(-1).s - .9, p.s) }));
  stripRuns(rows, { kind: 'cartTrack', cells: rutCells('ruts-old'), tier: 1, road: t.id, seed: 91, cutFade: .9 });
  hoofTrail(pts, { tier: 1, alpha: .75 });
 }
 for (const [x, z, r] of data.trampled || []) trample(x, z, r);
 // The bare feet: a person's stride, short and even, straight down the bank.
 // The last few are sunk deeper and hold water; the last one is at the
 // water's edge. Nothing comes out on the other side.
 if (data.barefoot?.length > 1) {
  // Steps .62 m apart, shortening to .46 over the last two metres (slower,
  // as if wading in were hard), along the trail's line.
  const line = resample(data.barefoot, .05), total = line.at(-1).s, prints = [];
  for (let s = .1; s <= total + 1e-6; s += .46 + .16 * smooth(total, total - 2, s)) prints.push(line[Math.min(line.length - 1, Math.round(s / total * (line.length - 1)))]);
  const owner = props.find(p => p.type === 'bodyPile')?.id;
  prints.forEach((p, i) => {
   const left = i % 2 === 0, nx = p.tz, nz = -p.tx, side = left ? 1 : -1, near = i >= prints.length - 3;
   // (The game's own print scale: its boot prints are 19 x 36 cm.)
   decal({ kind: 'barefoot', cell: near ? 'foot-wet' : 'foot', x: p.x + nx * side * .1, z: p.z + nz * side * .1, yaw: heading(p.tx, p.tz) + side * .06, w: .19, l: .41, mirror: !left, alpha: 1, tint: 1.1, tier: 0, layer: LAYER.prints, owner });
  });
  out.stats.barefoot = out.decals.filter(d => d.kind === 'barefoot').length;
 }

 // ---- Scatter.
 const buildingDoors = b => buildingOpenings(b).filter(o => o.type === 'door').map(o => {
  const mx = (o.a.x + o.b.x) / 2, mz = (o.a.z + o.b.z) / 2, ux = o.b.x - o.a.x, uz = o.b.z - o.a.z, len = Math.hypot(ux, uz) || 1;
  let nx = -uz / len, nz = ux / len; if (nx * (mx - b.x) + nz * (mz - b.z) < 0) { nx = -nx; nz = -nz; }
  return { ...o, x: mx, z: mz, nx, nz, width: o.width };
 });
 // A fan of something spilled out of a doorway: its thick edge at the sill.
 const doorSpill = (b, door, kind, cells, { depth = 1.9, tier = 0, bits = 0, bitKind = kind, bitSize, extraTier = 1 } = {}) => {
  const yaw = heading(door.nx, door.nz), w = door.width + .5;
  const x = door.x + door.nx * (.19 + depth / 2), z = door.z + door.nz * (.19 + depth / 2);
  decal({ kind, cell: cells[0], x, z, yaw, w, l: depth, tier, layer: LAYER.spill, owner: b.id });
  decal({ kind, cell: cells[1 % cells.length], x: x + door.nx * depth * .45 + (random() - .5) * .6, z: z + door.nz * depth * .45 + (random() - .5) * .6, yaw: yaw + (random() - .5) * .4, w: w * .8, l: depth * .8, alpha: .8, tier: extraTier, layer: LAYER.spill, owner: b.id });
  // (Along the wall: (-nz, nx).)
  for (let i = 0; i < bits; i++) {
   const along = (random() - .5) * w, away = .3 + Math.pow(random(), 1.6) * depth * 1.25;
   bit(bitKind, door.x + door.nx * away - door.nz * along, door.z + door.nz * away + door.nx * along, bitSize(), { owner: b.id });
  }
 };
 const strawSize = () => [.2 + random() * .2, .012, .016 + random() * .01];
 const chipSize = () => [.05 + random() * .07, .02 + random() * .015, .035 + random() * .04];
 const cinderSize = () => [.035 + random() * .045, .03 + random() * .03, .035 + random() * .04];
 const leafSize = () => [.11 + random() * .05, .01, .07 + random() * .03];
 for (const b of map.buildings || []) {
  const style = b.interiorStyle, doors = buildingDoors(b);
  if (style === 'barn' || style === 'horse-sheds') for (const d of doors) doorSpill(b, d, 'straw', ['straw-edge', 'straw-1'], { depth: style === 'barn' ? 2.2 : 1.5, bits: style === 'barn' ? 34 : 12, bitSize: strawSize, tier: 0 });
  if (style === 'gristmill' && data.grain?.building === b.id) {
   const d = doors.find(o => o.side === data.grain.side) || doors[0];
   if (d) doorSpill(b, d, 'grain', ['grain-0', 'grain-1'], { depth: 1.5, tier: 0 });
   (data.grain.dribble || []).forEach(([x, z], i, all) => {
    const [nx, nz] = i < all.length - 1 ? [all[i + 1][0] - x, all[i + 1][1] - z] : [x - all[i - 1][0], z - all[i - 1][1]];
    decal({ kind: 'grain', cell: 'grain-dribble', x, z, yaw: heading(nx, nz), w: .5, l: 1.2, alpha: .85 - i * .15, tier: 1, layer: LAYER.spill, owner: b.id });
   });
  }
  // Worn ground outside every other door (not the tomb's: nobody goes in).
  if (!['barn', 'horse-sheds', 'gristmill', 'tomb'].includes(style) && b.id !== 'forge') for (const d of doors) {
   decal({ kind: 'scuff', cell: `scuff-${Math.floor(random() * 2)}`, x: d.x + d.nx * .95, z: d.z + d.nz * .95, yaw: heading(d.nx, d.nz), w: d.width + .5, l: 1.4, alpha: .75, tier: 2, owner: b.id });
  }
 }
 // The forge's ash heap and cinders (data), with lumps of clinker on them.
 for (const [x, z, w, l, yaw] of data.ash || []) {
  const m = decal({ kind: 'ash', cell: w > 1.9 ? 'ash-0' : 'ash-1', x, z, yaw, w, l, tier: 0, layer: LAYER.spill });
  if (!m) continue;
  for (let i = 0; i < Math.round(w * l * 9); i++) bit('cinder', x + (random() - .5) * w * .9, z + (random() - .5) * l * .9, cinderSize(), { tilt: .8 });
 }
 // Chips round every woodpile, chopping block and stack of cordwood: on the
 // side where the splitting was done (a pile's front), all round a block.
 for (const p of props) {
  if (!['woodpile', 'choppingBlock', 'cordwood'].includes(p.type)) continue;
  const block = p.type === 'choppingBlock';
  const [cx, cz] = block ? [p.x, p.z] : toWorld(p, 0, .75);
  const yaw = heading(...dirWorld(p, 0, 1)), w = block ? 1.9 : p.w + 1, l = block ? 1.9 : 1.7;
  decal({ kind: 'chips', cell: `chips-${Math.floor(random() * 3)}`, x: cx, z: cz, yaw: block ? random() * 6.28 : yaw, w, l, tier: 0, layer: LAYER.spill, owner: p.id });
  if (!block) decal({ kind: 'chips', cell: `chips-${Math.floor(random() * 3)}`, x: toWorld(p, 0, -.7)[0], z: toWorld(p, 0, -.7)[1], yaw: yaw + Math.PI, w: w * .8, l: 1.1, alpha: .6, tier: 2, layer: LAYER.spill, owner: p.id });
  const n = block ? 22 : p.type === 'woodpile' ? 26 : 14;
  for (let i = 0; i < n; i++) {
   const a = random() * Math.PI * 2, d = block ? .42 + Math.pow(random(), 1.5) * .75 : 0;
   const [x, z] = block ? [p.x + Math.cos(a) * d, p.z + Math.sin(a) * d] : toWorld(p, (random() - .5) * (p.w + .4), .62 + Math.pow(random(), 1.4) * 1.1);
   const kind = random() < .16 ? 'bark' : random() < .08 ? 'kindling' : 'chip';
   bit(kind === 'kindling' ? 'kindling' : 'chip', x, z, kind === 'kindling' ? [.24 + random() * .14, .028, .03] : chipSize(), { colours: kind, owner: p.id });
  }
 }
 // Straw round every haystack (and a few wisps blown further).
 for (const p of props.filter(p => p.type === 'haystack')) {
  for (let i = 0; i < 5; i++) {
   const a = i / 5 * Math.PI * 2 + random() * .6, r = 2.2 + random() * .5;
   decal({ kind: 'straw', cell: `straw-${i % 3}`, x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r, yaw: a, w: 2.2, l: 1.6, alpha: .9, tier: i < 3 ? 0 : 1, layer: LAYER.spill, owner: p.id });
  }
  for (let i = 0; i < 40; i++) { const a = random() * Math.PI * 2, r = 1.75 + Math.pow(random(), 1.3) * 1.7; bit('straw', p.x + Math.sin(a) * r, p.z + Math.cos(a) * r, strawSize(), { owner: p.id }); }
 }
 // Fresh earth round the open grave and the new mounds (the digger's spoil
 // thrown and trodden), and the digger's boot prints.
 for (const p of props.filter(p => p.type === 'openGrave' || p.type === 'freshMound')) {
  const open = p.type === 'openGrave';
  for (let i = 0; i < (open ? 3 : 2); i++) {
   const [x, z] = toWorld(p, (random() - .5) * 1.8, (open ? -.9 : 0) + (random() - .5) * 1.6);
   decal({ kind: 'soil', cell: `soil-${i % 2}`, x, z, yaw: random() * 6.28, w: 1.5, l: 1.3, alpha: .85, tier: i ? 2 : 1, owner: p.id });
  }
  for (let i = 0; i < (open ? 16 : 8); i++) { const [x, z] = toWorld(p, (random() - .5) * 2.8, (open ? -.8 : 0) + (random() - .5) * 2.2); bit('clod', x, z, [.07 + random() * .06, .04 + random() * .03, .06 + random() * .05], { tilt: .7, owner: p.id }); }
  if (open) for (let i = 0; i < 9; i++) {
   const a = random() * Math.PI * 2, [x, z] = toWorld(p, Math.cos(a) * (1.35 + random() * .5), Math.sin(a) * (.9 + random() * .5));
   decal({ kind: 'boot', cell: 'boot', x, z, yaw: random() * 6.28, w: .15, l: .33, mirror: random() < .5, alpha: .8, tier: 2, layer: LAYER.prints, owner: p.id });
  }
 }
 // A dead fire (another builder's ring of stones, if the map has one): ash
 // and char in it.
 for (const p of props.filter(p => /fire.?(ring|pit)|campfire|deadfire/i.test(p.type))) {
  decal({ kind: 'char', cell: 'char', x: p.x, z: p.z, yaw: random() * 6.28, w: 1.4, l: 1.4, tier: 0, layer: LAYER.spill, owner: p.id });
  for (let i = 0; i < 12; i++) { const a = random() * 6.28, r = random() * .55; bit('cinder', p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, cinderSize(), { tilt: .8, owner: p.id }); }
 }

 // ---- Leaves: drifted against the fieldstone walls' north sides (a wall
 // running north-south: its west side, the way the dusk air drifts them
 // east), and into building corners. The woods' litter colours only.
 for (const p of props) {
  if (!/^fieldWall\d?$/.test(p.type)) continue;
  const len = p.w, depth = p.d;
  // The side facing most to the north (or west).
  const [ax, az] = dirWorld(p, 0, 1); // local +z in the world
  let side = az > 0 ? -1 : 1; // -z of the world is north
  if (Math.abs(az) < .5) side = ax > 0 ? -1 : 1; // a north-south wall: its west side
  // (A wall on the lip of a retaining wall has no ground on that side: the
  // leaves lie on its other side.)
  const probe = toWorld(p, 0, side * (depth / 2 + .6));
  if (ground.wallAt(probe[0], probe[1])) side = -side;
  const [nx, nz] = [ax * side, az * side], yaw = heading(nx, nz);
  const pieces = Math.max(1, Math.round(len / 1.7));
  for (let i = 0; i < pieces; i++) {
   const t = (i + .5) / pieces - .5, along = t * len + (random() - .5) * .4;
   // (Out past the strip a metre-high wall hides from the camera on its
   // north side, about .35 m: the drift runs a metre and more out.)
   const l = 1.1 + random() * .35, [x, z] = toWorld(p, along, side * (depth / 2 - .05 + l / 2));
   decal({ kind: 'leaves', cell: `leaves-${Math.floor(random() * 3)}`, x, z, yaw, w: len / pieces * (1 + random() * .3), l, tier: i % 2 ? 2 : 1, layer: LAYER.leaves, owner: p.id });
   for (let k = 0; k < 7; k++) {
    const [bx, bz] = toWorld(p, along + (random() - .5) * len / pieces, side * (depth / 2 + .15 + Math.pow(random(), 1.5) * .95));
    bit('leaf', bx, bz, leafSize(), { tilt: .5, owner: p.id });
   }
  }
 }
 for (const b of map.buildings || []) {
  if (b.interiorStyle === 'tomb' || b.id === 'forge') continue;
  const doors = buildingDoors(b);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
   const [x, z] = toWorld(b, sx * b.w / 2, sz * b.d / 2);
   const n1 = dirWorld(b, 0, sz), n2 = dirWorld(b, sx, 0);
   return { x, z, n1, n2, south: n1[1] + n2[1] };
  }).sort((a, c) => c.south - a.south);
  // The south corners first: the camera looks north, so a roof hides the
  // ground on a building's north side (you see it only when the roof fades,
  // from inside); one north corner now and then for that.
  corners.forEach((c, i) => {
   if (i === 2 || (i === 3 && random() < .5)) return;
   // Not in front of a door on either wall, nor squeezed against the next
   // building (the forge against the smithy).
   if (doors.some(d => Math.hypot(d.x - c.x, d.z - c.z) < d.width / 2 + 1.1)) return;
   if ((map.buildings || []).some(o => o !== b && Math.hypot(o.x - c.x, o.z - c.z) < Math.hypot(o.w, o.d) / 2 + 1.5)) return;
   const w = 1.1 + random() * .4, l = 1.1 + random() * .4, yaw = heading(c.n1[0], c.n1[1]);
   const across = [Math.cos(yaw), -Math.sin(yaw)], flip = across[0] * c.n2[0] + across[1] * c.n2[1] < 0;
   const x = c.x + c.n1[0] * (l / 2 + .12) + c.n2[0] * (w / 2 + .12), z = c.z + c.n1[1] * (l / 2 + .12) + c.n2[1] * (w / 2 + .12);
   decal({ kind: 'leaves', cell: 'leaves-corner', x, z, yaw, w, l, mirror: flip, tier: i < 2 ? 1 : 3, layer: LAYER.leaves, owner: b.id });
   for (let k = 0; k < 8; k++) {
    const u = Math.pow(random(), 1.6) * w, v = Math.pow(random(), 1.6) * l;
    bit('leaf', c.x + c.n1[0] * (v + .2) + c.n2[0] * (u + .2), c.z + c.n1[1] * (v + .2) + c.n2[1] * (u + .2), leafSize(), { tilt: .5, owner: b.id });
   }
  });
 }
 // Bits sorted by tier: a preset draws a prefix.
 out.bits.sort((a, b) => a.tier - b.tier);
 out.stats.decals = out.decals.length; out.stats.strips = out.strips.length; out.stats.bits = out.bits.length;
 return out;
}

function rollTier(roll) {
 let sum = 0;
 for (const [tier, share] of BIT_TIERS) { sum += share; if (roll < sum) return tier; }
 return BIT_TIERS.at(-1)[0];
}
