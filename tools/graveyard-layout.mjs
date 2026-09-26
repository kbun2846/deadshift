// Lays out Hollow Wick's burying ground and fieldstone walls (task
// s2-graveyard) and writes the result as plain data to
// src/maps/hollow-wick-graveyard.js. Deterministic: run it again after a
// terrain or path change and commit what it writes.
//   node tools/graveyard-layout.mjs [--check]
// The rules it keeps (tests/hollow-wick-graveyard.test.js checks them again):
// graves in north-south ranks 2.5-3 m apart lying east-west, clear of the
// aisles and their shoulders, of every other path, the building pads, base
// B's spawn ground and the bank faces (nothing on ground steeper than 0.3);
// no standing spot in the graveyard more than 3.5 m from hard cover; about
// 40% of the cover solid, 60% breakable.
import { writeFileSync } from 'node:fs';
import { hollowWick, BUILDING_PADS, BASES } from '../src/maps/hollow-wick.js';
import { groundFor, mapColliders } from '../src/map-kit.js';
import { insidePoly } from '../src/world/heightfield.js';
import { FIELD_WALLS as OLD_WALLS, GRAVEYARD_PROPS as OLD_GRAVES } from '../src/maps/hollow-wick-graveyard.js';

const map = { ...hollowWick, props: [] }, ground = groundFor(hollowWick);
const O = [-44, -22.5];
const r2 = v => Math.round(v * 100) / 100;
let seed = 1790;
const rand = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export const level = id => hollowWick.terrain.levels.find(l => l.id === id);
const TERRACES = ['foot', 't3', 't2', 't1'].map(level), SUMMIT = level('summit');
// The terraces, and the summit's east half round the meetinghouse (clear of
// its east door under the belfry and of its south portico).
export function inGraveyard(x, z) {
  if (!insidePoly(x, z, SUMMIT.poly)) return TERRACES.some(l => insidePoly(x, z, l.poly));
  if (x < -42) return false;
  if (x > -38.5 && z > -25 && z < -20) return false;          // the east door
  if (z > -18.5 && x < -39) return false;                     // the portico
  return !(Math.abs(x - O[0]) < 7.5 && Math.abs(z - O[1]) < 5.5); // a walk round the walls
}
const slope = (x, z) => { const g = ground.gradientAt(x, z); return Math.hypot(g.x, g.z); };
function segDist(x, z, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz; let t = L ? ((x - a[0]) * dx + (z - a[1]) * dz) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); }
// Distance past a path's shoulder (negative: on the path or its shoulder).
export function pathClearance(x, z) {
  let best = Infinity;
  for (const p of hollowWick.terrain.paths) for (let i = 1; i < p.points.length; i++) best = Math.min(best, segDist(x, z, p.points[i - 1], p.points[i]) - p.width / 2 - p.shoulder);
  return best;
}
function inPad(x, z, margin) {
  return BUILDING_PADS.some(b => { const a = b.angle || 0, c = Math.cos(a), s = Math.sin(a), dx = x - b.x, dz = z - b.z; return Math.abs(dx * c - dz * s) < b.w / 2 + margin && Math.abs(dx * s + dz * c) < b.d / 2 + margin; });
}
const BASE_B = BASES.B, BASE_CLEAR = 5;
// Reserved spots (the set pieces) keep graves off them.
const reserved = [];
// The tomb's door (its east side): 2 m clear outside it (tests/hollow-wick-buildings).
{ const t = BUILDING_PADS.find(b => b.id === 'tomb'), c = Math.cos(t.angle || 0), s = Math.sin(t.angle || 0), out = t.w / 2 + 1.4; reserved.push([t.x + out * c, t.z - out * s, 2.3]); }
const isReserved = (x, z) => reserved.some(r => Math.hypot(x - r[0], z - r[1]) < r[2]);
function okPoint(x, z, { path = 0, pad = .5, slopeMax = .3, graveyard = true, base = true } = {}) {
  if (graveyard && !inGraveyard(x, z)) return false;
  if (pathClearance(x, z) < path) return false;
  if (inPad(x, z, pad)) return false;
  if (base && Math.hypot(x - BASE_B[0], z - BASE_B[1]) < BASE_CLEAR) return false;
  if (Math.hypot(x - BASE_B[0], z - BASE_B[1]) < 2) return false;
  if (ground.bankDistance(x, z) < 1) return false;
  if (slope(x, z) > slopeMax) return false;
  return !isReserved(x, z);
}
// A footprint (local box, turned `a`) is fine when its corners, edge
// midpoints and centre are, and it sits on one level (no bank inside it).
function okBox(x, z, w, d, a = 0, opts) {
  const c = Math.cos(a), s = Math.sin(a), hs = [];
  for (const u of [-.5, 0, .5]) for (const v of [-.5, 0, .5]) {
    const px = x + u * w * c + v * d * s, pz = z - u * w * s + v * d * c;
    if (!okPoint(px, pz, opts)) return false;
    hs.push(ground.heightAt(px, pz));
  }
  return Math.max(...hs) - Math.min(...hs) < Math.max(.3, Math.max(w, d) * .3);
}
const local = (x, z, a, u, v) => [x + u * Math.cos(a) + v * Math.sin(a), z - u * Math.sin(a) + v * Math.cos(a)];

const props = [];
const solids = [];                                  // hard cover footprints: { x, z, w, d, a }
const blockers = [];                                // everything a new grave must keep off
const addBlock = (x, z, w, d, a = 0) => blockers.push({ x, z, w, d, a });
const hits = (x, z, w, d, a = 0, gap = .35) => blockers.some(b => {
  // Circle-ish test: two turned boxes overlap if their bounding circles and
  // axis extents overlap (grown by `gap`). Good enough for grave spacing.
  const ex = (bw, bd, aa) => [Math.abs(bw * Math.cos(aa)) + Math.abs(bd * Math.sin(aa)), Math.abs(bw * Math.sin(aa)) + Math.abs(bd * Math.cos(aa))];
  const [aw, ad] = ex(w, d, a), [bw, bd] = ex(b.w, b.d, b.a);
  return Math.abs(x - b.x) < (aw + bw) / 2 + gap && Math.abs(z - b.z) < (ad + bd) / 2 + gap;
});

// --- Set pieces -------------------------------------------------------------
// The open grave on the foot terrace (the hearse house's pad stands on the
// layout's (-27, -7.5), so it is dug just north-west of it) with the fresh
// mounds beside it; the skeleton slumped on a double stone at (-31, -27).
function nearestOk(x0, z0, w, d, a, reach = 4, opts = { pad: .3, slopeMax: .34 }) {
  for (let r = 0; r <= reach; r += .25) for (let k = 0; k < Math.max(1, Math.round(r * 8)); k++) {
    const t = k / Math.max(1, Math.round(r * 8)) * Math.PI * 2, x = x0 + Math.cos(t) * r, z = z0 + Math.sin(t) * r;
    if (okBox(x, z, w, d, a, opts) && !hits(x, z, w, d, a, .3)) return [r2(x), r2(z)];
  }
  console.warn(`no room near ${x0},${z0}`); return null;
}
// (The hole and its lips; the spoil heap north of it may lie on the bank.)
const [ogx, ogz] = nearestOk(-27.5, -4.6, 2.4, 1.3, 0, 5);
props.push({ type: 'openGrave', x: ogx, z: ogz, angle: 0 }); addBlock(ogx, ogz - .6, 2.4, 2.6);
const moundSpots = [];
for (const [mx, mz, a] of [[-30.5, -4.5, .05], [-31, -7, -.08]]) {
  const at = nearestOk(mx, mz, 1.9, 1, a, 6); if (!at) continue;
  const [x, z] = at;
  props.push({ type: 'freshMound', x, z, angle: a }); addBlock(x, z, 2, 1.1, a); moundSpots.push([x, z]);
}
const [skx, skz] = nearestOk(-31, -27, .9, 1.5, 0, 6, { pad: .3, slopeMax: .4, path: -.55 });
props.push({ type: 'bigStone', x: r2(skx - .3), z: skz, angle: 0, v: 1, h: 1 });
props.push({ type: 'graveSkeleton', x: r2(skx - .05), z: skz, angle: 0 });
solids.push({ x: skx - .3, z: skz, w: .3, d: 1.34, a: 0 }); addBlock(skx + .2, skz, 2, 1.8);
// Base B's own cover on its graveyard side: a table tomb at the edge of its
// spawn ground.
{
  const at = nearestOk(-27.2, -43.2, 2, 1.1, .6, 1.5, { base: false, graveyard: false, slopeMax: .3 });
  if (at) { props.push({ type: 'tableTomb', x: at[0], z: at[1], angle: .6, v: 1 }); solids.push({ x: at[0], z: at[1], w: 1.94, d: 1.04, a: .6 }); addBlock(at[0], at[1], 2, 1.1, .6); }
}

// --- Family plots -----------------------------------------------------------
// Low fieldstone walls round a few plots, open on the east (the gate gap),
// each holding a short rank of stones; and two plots railed between granite
// posts.
const WALL_TYPES = [2, 3, 4, 5, 6];
function wallRun(x0, z0, x1, z1, gapsAt = []) {
  // Split into pieces of the wall lengths we have, turned along the run.
  const len = Math.hypot(x1 - x0, z1 - z0), a = -Math.atan2(z1 - z0, x1 - x0);
  const pieces = [];
  let left = len, at = 0;
  while (left > 1.5) {
    const n = WALL_TYPES.filter(t => t <= left + .01).pop() ?? 2;
    pieces.push([at, n]); at += n; left -= n;
  }
  return pieces.map(([s, n]) => { const t = (s + n / 2) / len; return { type: 'fieldWall' + n, x: r2(x0 + (x1 - x0) * t), z: r2(z0 + (z1 - z0) * t), angle: r2(a), n }; });
}
function plotWalls(cx, cz, W, D) {
  // W east-west, D north-south; the east side has a 1.4 m gate in its middle.
  const x0 = cx - W / 2, x1 = cx + W / 2, z0 = cz - D / 2, z1 = cz + D / 2, g = (D - 1.4) / 2;
  const runs = [[x0, z0, x1, z0], [x0, z1, x1, z1], [x0, z0 + .27, x0, z1 - .27], [x1, z0 + .27, x1, z0 + .27 + g - .27], [x1, z1 - .27 - (g - .27), x1, z1 - .27]];
  return runs.flatMap(r => wallRun(...r));
}
function tryPlot(cx0, cz0, W, D) {
  for (let r = 0; r <= 6; r += .25) for (let k = 0; k < 16; k++) {
    const cx = cx0 + Math.cos(k * .3927) * r, cz = cz0 + Math.sin(k * .3927) * r;
    const walls = plotWalls(cx, cz, W, D);
    if (process.argv.includes('--plots')) { const bad = walls.filter(w => !okBox(w.x, w.z, w.n, .55, w.angle, { path: .1, slopeMax: .3 })).length, hit = walls.filter(w => hits(w.x, w.z, w.n, .55, w.angle, .6)).length; if (bad + hit <= 1) console.log('plot near', cx0, cz0, 'at', cx.toFixed(1), cz.toFixed(1), 'bad', bad, 'hit', hit, okBox(cx, cz, W - 1, D - 1, 0)); }
    if (walls.some(w => w.n < 2)) continue;
    // One piece that would stand on a bank or a path is left out: a gap,
    // fallen long ago.
    if (walls.some(w => hits(w.x, w.z, w.n, .55, w.angle, .6))) continue;
    const good = walls.filter(w => okBox(w.x, w.z, w.n, .55, w.angle, { path: .1, slopeMax: .3 }));
    if (good.length < walls.length - 1 || good.length < 3) continue;
    const count = Math.max(1, Math.floor((D - 1.4) / 1.3));
    const graves = Array.from({ length: count }, (_, i) => [cx - .1, cz - (count - 1) * 1.3 / 2 + i * 1.3]).filter(([x, z]) => okBox(x, z, 1.75, .76, 0));
    if (!graves.length) continue;
    return { cx, cz, walls: good, graves };
  }
  return null;
}
const plots = [];
for (const [cx, cz, W, D] of [[-24, -18, 3.4, 4.2], [-38, -6.5, 3.4, 4.2], [-25.5, -34.5, 3.4, 4.2], [-22, -26, 3.4, 4.2]]) {
  const plot = tryPlot(cx, cz, W, D);
  if (!plot) { console.warn('plot skipped', cx, cz); continue; }
  plots.push(plot);
  for (const w of plot.walls) { const { n, ...rest } = w; props.push(rest); solids.push({ x: w.x, z: w.z, w: n, d: .55, a: w.angle }); addBlock(w.x, w.z, n, .55, w.angle); }
  addBlock(plot.cx, plot.cz, W - .6, D - .6);
}
const railPlots = [];
for (const [cx, cz] of [[-35, -38.5], [-20, -1.5], [-38.5, -31]]) {
  let placed = null;
  for (let r = 0; r <= 3 && !placed; r += .5) for (let k = 0; k < 8 && !placed; k++) {
    const x = cx + Math.cos(k * .785) * r, z = cz + Math.sin(k * .785) * r;
    if (okBox(x, z, 3.5, 4.7, 0, { path: .3 }) && !hits(x, z, 3.5, 4.7, 0, .9)) placed = [r2(x), r2(z)];
  }
  if (!placed) { console.warn('rail plot skipped', cx, cz); continue; }
  props.push({ type: 'railPlot', x: placed[0], z: placed[1], angle: 0 });
  for (const [px, pz] of [[-1.6, -2.2], [-1.6, 0], [-1.6, 2.2], [0, -2.2], [0, 2.2], [1.6, -2.2], [1.6, 2.2]]) solids.push({ x: placed[0] + px, z: placed[1] + pz, w: .26, d: .26, a: 0 });
  addBlock(placed[0], placed[1], 3.5, 4.7);
  railPlots.push({ cx: placed[0], cz: placed[1], graves: [[placed[0] - .1, placed[1] - .8], [placed[0] - .1, placed[1] + .8]].filter(([x, z]) => okBox(x, z, 1.75, .76, 0)) });
}

// --- The ranks ----------------------------------------------------------------
// North-south ranks 2.75 m apart (a little uneven: 2.5-3 m), graves 1.6-1.9
// m apart along them, each lying east-west: headstone at the west end
// (x - .95), footstone at the east end.
const slots = [];
// Packed greedily over every spot a grave fits (the treads between the banks
// are narrow): east to west, north to south, a grave taken when every grave
// so far is a rank away (2.5 m east-west) or clear of it along the rank
// (1.45 m north-south). The ranks come out north-south, a little ragged.
const GRAVE = { w: 1.75, d: .76 };                      // headstone to footstone, one grave wide
const HEAD = .78;                                       // the headstone stands this far west of the middle
const candidates = [];
for (let x = -17; x > -44; x -= .25) for (let z = -50; z < 8; z += .25) {
  const a = r2((rand() - .5) * .08);
  if (okBox(x, z, GRAVE.w, GRAVE.d, a) && !hits(x, z, GRAVE.w, GRAVE.d, a, .3)) candidates.push({ x: r2(x), z: r2(z), a });
}
for (const c of candidates) {
  if (slots.some(s => Math.abs(s.x - c.x) < 2.5 && Math.abs(s.z - c.z) < 1.22)) continue;
  slots.push(c);
}
for (const s of slots) addBlock(s.x, s.z, GRAVE.w, GRAVE.d, s.a);
for (const p of [...plots, ...railPlots]) for (const [x, z] of p.graves) slots.push({ x: r2(x), z: r2(z), a: 0, plot: true });

// --- What stands at each grave -----------------------------------------------
// Solid (table tombs, big stones) first where the 3.5 m rule needs hard
// cover, then more until about 40% of the cover is solid; the rest
// headstones (some leaning), a few fallen, a few unmarked.
const PADS_COVER = BUILDING_PADS.filter(b => ['meetinghouse', 'tomb', 'hearse-house', 'horse-sheds'].includes(b.id)).map(b => ({ x: b.x, z: b.z, w: b.w, d: b.d, a: b.angle || 0 }));
const boxDist = (x, z, b) => { const c = Math.cos(b.a), s = Math.sin(b.a), dx = x - b.x, dz = z - b.z, u = dx * c - dz * s, v = dx * s + dz * c; return Math.hypot(Math.max(0, Math.abs(u) - b.w / 2), Math.max(0, Math.abs(v) - b.d / 2)); };
// Every standing spot on the graveyard's ground (treads: only the level
// ground off the aisles, a metre across at least, where cover can stand).
export const standingSpots = (treads = false) => {
  const spots = [];
  for (let x = -44; x <= -16; x += .5) for (let z = -50; z <= 8; z += .5) if (inGraveyard(x, z) && Math.hypot(x - BASE_B[0], z - BASE_B[1]) > BASE_CLEAR - 1)
    if (!treads || okBox(x, z, 1, 1, 0, { base: false })) spots.push([x, z]);
  return spots;
};
const spots = standingSpots(true);
const kind = new Map();
const solidOf = s => kind.get(s) === 'tableTomb' ? { x: s.x - .05, z: s.z, w: 1.94, d: 1.04, a: s.a } : kind.get(s) === 'smallTomb' ? { x: s.x - .05, z: s.z, w: 1.94 * .8, d: 1.04 * .8, a: s.a } : { x: s.x - HEAD, z: s.z, w: .3, d: 1.34, a: s.a };
const allSolids = () => [...solids, ...PADS_COVER, ...slots.filter(s => ['tableTomb', 'smallTomb', 'bigStone'].includes(kind.get(s))).map(solidOf)];
const worst = (from = spots) => {
  const list = allSolids(); let w = null;
  for (const [x, z] of from) { if (list.some(b => boxDist(x, z, b) < .01)) continue; let d = Infinity; for (const b of list) d = Math.min(d, boxDist(x, z, b)); if (!w || d > w.d) w = { x, z, d }; }
  return w;
};
// A big stone needs room north and south of it.
const roomFor = (s, t) => t === 'tableTomb' ? okBox(s.x - .05, s.z, 1.94, 1.04, s.a, { slopeMax: .35 }) : t === 'smallTomb' ? okBox(s.x - .05, s.z, 1.94 * .8, 1.04 * .8, s.a, { slopeMax: .35 }) : (okBox(s.x - HEAD, s.z, .42, 1.46, s.a, { slopeMax: .35 }) && slots.every(o => o === s || Math.abs(o.x - s.x) > 1 || Math.abs(o.z - s.z) > 1.3));
let loners = 0;
const coverCount = () => {
  const solid = solids.length - 7 * railPlots.length + railPlots.length + slots.filter(s => ['tableTomb', 'smallTomb', 'bigStone'].includes(kind.get(s))).length;
  return { solid, total: solid + slots.filter(s => !kind.has(s) || kind.get(s) === 'headstone').length };
};
const share = () => { const c = coverCount(); return c.solid / c.total; };
// Hard cover where the 3.5 m rule needs it most, while the solid share stays
// under 55%: the grave nearest the worst spot turns solid.
for (let guard = 0; guard < 200 && share() < .55; guard++) {
  const w = worst(); if (!w || w.d <= 3.4) break;
  let best = null;
  for (const s of slots) { if (kind.has(s) || s.plain) continue; const d = Math.hypot(s.x - HEAD - w.x, s.z - w.z); if (!best || d < best.d) best = { s, d }; }
  if (!best || best.d > 3.2) {
    // No grave near it: a lone stone (a big double stone on its own footing)
    // where one fits within reach of the spot, or give the spot up.
    let at = null;
    for (let r = 1; r <= 3.3 && !at; r += .25) for (let k = 0; k < 16 && !at; k++) {
      const x = w.x + Math.cos(k * .3927) * r, z = w.z + Math.sin(k * .3927) * r;
      if (okBox(x, z, .5, 1.5, 0) && !hits(x, z, .5, 1.5, 0, .5) && slots.every(o => Math.hypot(o.x - HEAD - x, o.z - z) > 1.6)) at = [r2(x), r2(z)];
    }
    if (at) { props.push({ type: 'bigStone', x: at[0], z: at[1], angle: 0, v: 0, h: 1 }); solids.push({ x: at[0], z: at[1], w: .3, d: 1.34, a: 0 }); addBlock(at[0], at[1], .5, 1.5); loners++; }
    else spots.splice(spots.findIndex(([x, z]) => x === w.x && z === w.z), 1);
    continue;
  }
  const t = roomFor(best.s, 'bigStone') && (rand() < .45 || !roomFor(best.s, 'tableTomb')) ? 'bigStone' : roomFor(best.s, 'tableTomb') ? 'tableTomb' : roomFor(best.s, 'smallTomb') ? 'smallTomb' : null;
  if (t) kind.set(best.s, t); else best.s.plain = true;
}
// Then about 40% solid overall, spread out.
while (share() < .4) {
  const free = slots.filter(s => !kind.has(s) && !s.plot && !s.plain); if (!free.length) break;
  const list = allSolids(); let best = null;
  for (const s of free) { let d = Infinity; for (const b of list) d = Math.min(d, boxDist(s.x, s.z, b)); if (!best || d > best.d) best = { s, d }; }
  const t = roomFor(best.s, 'bigStone') && (rand() < .4 || !roomFor(best.s, 'tableTomb')) ? 'bigStone' : roomFor(best.s, 'tableTomb') ? 'tableTomb' : roomFor(best.s, 'smallTomb') ? 'smallTomb' : null;
  if (t) kind.set(best.s, t); else best.s.plain = true;
}
// A few fallen (their stump stays) and a few unmarked (only the turf and a
// footstone): these count as neither kind of cover.
const rest = slots.filter(s => !kind.has(s));
for (let i = 0; i < 2; i++) kind.set(rest[Math.floor(rand() * rest.length)], 'fallen');

for (const s of slots) {
  const k = kind.get(s) || 'headstone', hx = r2(s.x - HEAD);
  const v = Math.floor(rand() * 4), size = r2(.86 + rand() * .3);
  if (k === 'smallTomb') { props.push({ type: 'tableTomb', x: r2(s.x - .05), z: s.z, angle: s.a, v: 0, scale: .8 }); continue; }
  if (k === 'tableTomb') { props.push({ type: 'tableTomb', x: r2(s.x - .05), z: s.z, angle: s.a, v: rand() < .25 ? 1 : 0 }); continue; }
  if (k === 'bigStone') { props.push({ type: 'bigStone', x: hx, z: s.z, angle: s.a, v: v % 2, h: r2(.95 + rand() * .15) }); props.push({ type: 'grave', x: s.x, z: s.z, angle: s.a, len: 1.7, foot: 0 }); continue; }
  props.push({ type: 'grave', x: s.x, z: s.z, angle: s.a, len: r2(1.45 + rand() * .15), foot: rand() < .8 ? 1 : 0 });
  props.push({ type: 'headstoneStump', x: hx, z: s.z, angle: s.a, size });
  if (k === 'fallen') { props.push({ type: 'fallenStone', x: r2(s.x - .2), z: s.z, angle: s.a, size, v }); continue; }
  const hs = { type: 'headstone', x: hx, z: s.z, angle: s.a, v, size, h: r2(.8 + rand() * .2) };
  if (rand() < .22) hs.lean = [r2((rand() - .5) * .36), r2((rand() - .5) * .2)];
  hs.moss = r2(.4 + rand() * 1.2);
  props.push(hs);
}

// --- Fieldstone walls elsewhere ------------------------------------------------
// Where the old layout had them (layout data WALLS), low and broken, never
// across a path: the broken walls round the fork, the base screens, and a
// few field and lane walls. Each run is checked; a piece that would stand on
// a path, a pad, the water or a bank is dropped.
const RUNS = [
  // The fork: four broken pieces, 5-8 m apart, round the open ground.
  ['fork', [[-18.5, 2, -18.5, -3], [-16, -10, -10.5, -10.8], [-6, -9.5, -.5, -10.5], [-4.5, 4.5, 1, 3.5], [-16.5, 6, -13, 7]]],
  // Base screens (layout WALLS a-yard, b-trail, c-side, c-lip).
  ['a-yard', [[27.4, -8, 27.4, -3], [27.4, -2.4, 27.4, 1.6]]],
  ['b-trail', [[-21, -44, -21, -39]]],
  ['c-side', [[-24.5, 34, -24.5, 39]]],
  ['c-lip', [[-37, 29.8, -32, 29.8], [-30.5, 29.8, -26.5, 29.8]]],
  // Field walls: the scarecrow field's north edge, in pieces with gaps at
  // the paths, and a lane wall along the north lane's south side.
  ['field', [[-5, 30.2, 1, 30.2], [3, 30.3, 8, 30.4], [18, 31, 24, 31.2], [27, 31.3, 33, 31.4], [45, 31.6, 50, 31.6]]],
  ['lane', [[18, -29, 22, -29]]],
];
const walls = [];
const wallOpts = { graveyard: false, path: .15, pad: .8, slopeMax: .35 };
// (Stage 4 audit: walls were laid against a map without its other props, so
// two stood through the fork's own walls and others through a stalk patch, a
// corn shock and a stone pile.) Every other prop's solid collider keeps 0.35
// m off a wall, and the stalk patches 0.8 m.
const own = new Set([...OLD_WALLS, ...OLD_GRAVES]), others = hollowWick.props.filter(p => !own.has(p));
const otherSolids = mapColliders({ ...hollowWick, buildings: [], trees: null, fences: [], crossings: null, props: others }).filter(c => !c.walkOver && !c.terrainEdge);
const boxGap = (x, z, c) => { const a = c.angle || 0, cs = Math.cos(a), sn = Math.sin(a), dx = x - c.x, dz = z - c.z; return Math.hypot(Math.max(0, Math.abs(dx * cs - dz * sn) - (c.localW ?? c.w) / 2), Math.max(0, Math.abs(dx * sn + dz * cs) - (c.localD ?? c.d) / 2)); };
const clearOfOthers = (x, z) => otherSolids.every(c => boxGap(x, z, c) >= .35) && (hollowWick.crops || []).every(f => Math.abs(x - f.x) >= f.w / 2 + .8 || Math.abs(z - f.z) >= f.d / 2 + .8);
for (const [id, runs] of RUNS) for (const [x0, z0, x1, z1] of runs) {
  // Only the stretches of the run that are clear (sampled every half metre,
  // across its width too) are built: the wall breaks where a path, a pad,
  // the water or a bank is.
  const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len;
  const ok = [];
  for (let t = 0; t <= len + 1e-6; t += .5) { const x = x0 + ux * t, z = z0 + uz * t; ok.push([-.3, 0, .3].every(o => okPoint(x - uz * o, z + ux * o, wallOpts) && clearOfOthers(x - uz * o, z + ux * o))); }
  let start = null;
  for (let i = 0; i <= ok.length; i++) {
    if (i < ok.length && ok[i]) { if (start === null) start = i; continue; }
    if (start !== null) {
      const a = start * .5, b = (i - 1) * .5;
      if (b - a >= 2) for (const w of wallRun(x0 + ux * a, z0 + uz * a, x0 + ux * b, z0 + uz * b)) {
        if (!okBox(w.x, w.z, w.n, .55, w.angle, wallOpts)) { console.warn('wall piece dropped', id, w.x, w.z, w.n); continue; }
        const { n, ...rest } = w; walls.push({ ...rest, group: id });
      }
      start = null;
    }
  }
}

// --- Report and write ----------------------------------------------------------
const final = worst(standingSpots()), finalTreads = worst(standingSpots(true)), counts = coverCount();
const byType = {}; for (const p of props) byType[p.type] = (byType[p.type] || 0) + 1;
console.log({ graves: slots.length, byType, cover: counts, solidShare: +(counts.solid / counts.total).toFixed(2), worstSpot: final, worstTreadSpot: finalTreads, walls: walls.length, plots: plots.length, railPlots: railPlots.length });
const line = p => '  ' + JSON.stringify(p).replace(/"(\w+)":/g, '$1:').replace(/"/g, "'") + ',';
const out = `// Hollow Wick's burying ground and fieldstone walls (task s2-graveyard): plain
// data written by tools/graveyard-layout.mjs (do not edit by hand: change the
// tool and run it again). The models and prop types are in
// src/world/graveyard.js; hollow-wick.js spreads these into its props.
// x east, z south, metres. A grave's headstone and its stump stand at its
// west end (x - .78), facing east; its footstone at the east end.

// The open grave, the fresh mounds and the slumped skeleton (set pieces).
export const GRAVEYARD_MARKS = ${JSON.stringify({ openGrave: [ogx, ogz], mounds: moundSpots, skeleton: [r2(skx - .05), skz] })};

// Every grave slot (${slots.length}): x, z of the grave's middle.
export const GRAVE_SLOTS = ${JSON.stringify(slots.map(s => [s.x, s.z]))};

export const GRAVEYARD_PROPS = [
${props.map(line).join('\n')}
];

// Low fieldstone walls outside the graveyard (group: where; layout WALLS).
export const FIELD_WALLS = [
${walls.map(line).join('\n')}
];
`;
if (!process.argv.includes('--check')) writeFileSync(new URL('../src/maps/hollow-wick-graveyard.js', import.meta.url), out);
if (!process.argv.includes('--check')) console.log('wrote src/maps/hollow-wick-graveyard.js', props.length + walls.length, 'props');
