// Bakes a map's terrain spec into the height grid that ships with the game
// (tools/bake-terrain.mjs writes it to src/maps/terrain/<id>.js; the game
// never runs this). Only + - * / sqrt, floor, integer hashing and, for turned
// building pads, cos/sin are used, then every point is rounded to the
// millimetre; tests/terrain.test.js re-bakes and compares byte for byte.
//
// The spec (map.terrain), in metres, heights above the map's zero:
//   bounds: [minX, minZ, maxX, maxZ]  the grid (the whole drawn world, beyond the fence)
//   base, noise: { cell, amp, seed }   the plain ground and a gentle roll
//   carves: [{ line, half, floor, grade, reach }]   valleys (lowest wins)
//   levels: [{ poly, h, grade, cliffs, cliffGrade, lower }]   plateaus
//     (and pits with lower): flat inside, falling away at `grade` (rise per
//     metre) outside, except "cliff" segments (indices into poly), which drop
//     at cliffGrade (8) and become retaining walls (heightfield.js edges).
//     Each side falls at its own grade and the highest wins, so a wall fades
//     out where it meets a gentle side, like a real retaining wall.
//     `openings` are steep like cliffs but have no wall: a walled ramp or
//     steps (a path plus `edges`) go down through them.
//   edges: [{ points }]                walls along a polyline (a ramp's sides)
//   knolls: [{ x, z, r, h }]           round bumps (added)
//   paths: [{ points: [[x, z, h]], width, shoulder, onlyDown }]   ramps and
//     cuttings: the ground is pulled to the path's own height along it
//   water: [{ points: [[x, z, half, bed]], top, bank }]   the stream's channel
//   fords: [{ points: [[x, z, h]], width, shoulder }]
//   decks: [{ poly, h }]               walk surfaces over water (heightfield.js)
//   pads: [{ x, z, w, d, angle, h, margin, blend }]   extra flat pads
// Every building with a `baseY` gets a flat pad: its footprint plus
// `margin` (1.5 m), blended out over `blend` (2 m).
export const CELL = .5;
const mm = v => Math.round(v * 1000);

function hash(ix, iz, seed) {
 let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
 h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
 return (h >>> 0) / 4294967296;
}
function valueNoise(x, z, cell, seed) {
 const fx = x / cell, fz = z / cell, ix = Math.floor(fx), iz = Math.floor(fz);
 const tx = fx - ix, tz = fz - iz, sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
 const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
 const top = a + (b - a) * sx, bottom = c + (d - c) * sx;
 return top + (bottom - top) * sz;
}
const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

// Nearest-point helpers leave their answer here instead of allocating.
let hitT = 0, hitSeg = 0;
function segDist(x, z, ax, az, bx, bz) {
 const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
 let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
 t = t < 0 ? 0 : t > 1 ? 1 : t;
 const px = ax + dx * t - x, pz = az + dz * t - z;
 hitT = t; return Math.sqrt(px * px + pz * pz);
}
function insidePoly(x, z, poly) {
 let inside = false;
 for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
  const ax = poly[j][0], az = poly[j][1], bx = poly[i][0], bz = poly[i][1];
  if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
 }
 return inside;
}
// Nearest point of an open polyline: its distance (hitSeg, hitT say where).
function lineDist(x, z, pts) {
 let best = Infinity, seg = 0, along = 0;
 for (let i = 1; i < pts.length; i++) {
  const d = segDist(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  if (d < best) { best = d; seg = i - 1; along = hitT; }
 }
 hitSeg = seg; hitT = along; return best;
}
const valueAlong = (pts, seg, t, k = 2) => pts[seg][k] + (pts[seg + 1][k] - pts[seg][k]) * t;
function bounds(pts, pad) {
 let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
 for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
 return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}
const inBox = (b, x, z) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;

// Every building with a baseY stands on a pad (plus the spec's own pads).
export function terrainPads(map) {
 const pads = (map.buildings || []).filter(b => Number.isFinite(b.baseY))
  .map(b => ({ x: b.x, z: b.z, w: b.w, d: b.d, angle: b.angle || 0, h: b.baseY, margin: b.padMargin ?? 1.5, blend: b.padBlend ?? 2 }));
 return [...pads, ...(map.terrain?.pads || []).map(p => ({ angle: 0, margin: 1.5, blend: 2, ...p }))];
}

function prepare(spec, pads) {
 const floor = spec.floorMin ?? -3;
 const levels = (spec.levels || []).map(l => {
  const steepSides = new Set([...(l.cliffs || []), ...(l.openings || [])]), steep = l.cliffGrade || 8;
  const grades = l.poly.map((_, i) => steepSides.has(i) ? steep : l.grade);
  if (grades.some(g => !(g > 0))) throw new Error(`terrain level ${l.id ?? ''}: every side needs a grade above 0`);
  const gentlest = Math.min(...grades), reach = Math.min(80, Math.abs(l.lower ? (spec.ceiling ?? 12) - l.h : l.h - floor) / gentlest);
  return { ...l, grades, box: bounds(l.poly, reach) };
 });
 const carves = (spec.carves || []).map(c => ({ ...c, box: bounds(c.line, c.half + (c.reach || 30)) }));
 const paths = (spec.paths || []).filter(p => p.points[0].length > 2).map(p => ({ ...p, box: bounds(p.points, p.width / 2 + p.shoulder) }));
 const water = (spec.water || []).map(w => ({ ...w, box: bounds(w.points, Math.max(...w.points.map(p => p[2] ?? w.half)) + w.bank + .5) }));
 const fords = (spec.fords || []).map(f => ({ ...f, box: bounds(f.points, f.width / 2 + f.shoulder) }));
 const padded = pads.map(p => {
  const r = Math.hypot(p.w, p.d) / 2 + p.margin + p.blend;
  return { ...p, cos: Math.cos(p.angle), sin: Math.sin(p.angle), box: { minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r } };
 });
 return { ...spec, levels, carves, paths, water, fords, pads: padded };
}

// The ground's height at a point, before rounding (no decks).
function rawHeight(s, x, z) {
 let h = s.base || 0;
 if (s.noise) h += (valueNoise(x, z, s.noise.cell, s.noise.seed) - .5) * 2 * s.noise.amp;
 for (const c of s.carves) {
  if (!inBox(c.box, x, z)) continue;
  const d = lineDist(x, z, c.line);
  h = Math.min(h, c.floor + c.grade * Math.max(0, d - c.half));
 }
 for (const l of s.levels) {
  if (!inBox(l.box, x, z)) continue;
  let v;
  if (insidePoly(x, z, l.poly)) v = l.h;
  else {
   // Each side falls away at its own grade; the highest (for a pit, the
   // lowest) wins, so a cliff shrinks toward a gentle neighbour.
   v = l.lower ? Infinity : -Infinity;
   const poly = l.poly;
   for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const d = segDist(x, z, a[0], a[1], b[0], b[1]), side = l.lower ? l.h + l.grades[i] * d : l.h - l.grades[i] * d;
    v = l.lower ? Math.min(v, side) : Math.max(v, side);
   }
  }
  h = l.lower ? Math.min(h, v) : Math.max(h, v);
 }
 for (const k of s.knolls || []) {
  const dx = x - k.x, dz = z - k.z, d2 = dx * dx + dz * dz, r2 = k.r * k.r;
  if (d2 < r2) { const t = 1 - d2 / r2; h += k.h * t * t; }
 }
 for (const p of s.paths) {
  if (!inBox(p.box, x, z)) continue;
  const d = lineDist(x, z, p.points), half = p.width / 2;
  if (d > half + p.shoulder) continue;
  const ph = valueAlong(p.points, hitSeg, hitT);
  if (p.onlyDown && ph > h) continue;
  const w = d <= half ? 1 : 1 - smooth((d - half) / Math.max(1e-3, p.shoulder));
  h += (ph - h) * w;
 }
 for (const w of s.water) {
  if (!inBox(w.box, x, z)) continue;
  const d = lineDist(x, z, w.points);
  const half = w.points[0].length > 2 ? valueAlong(w.points, hitSeg, hitT) : w.half;
  const bed = w.points[0].length > 3 ? valueAlong(w.points, hitSeg, hitT, 3) : w.bed;
  if (d > half + w.bank) continue;
  const v = d <= half ? bed + (w.top - bed) * .15 * smooth(d / half) : bed + (w.top - bed) * (.15 + .85 * smooth((d - half) / w.bank));
  h = Math.min(h, v);
 }
 for (const f of s.fords) {
  if (!inBox(f.box, x, z)) continue;
  const d = lineDist(x, z, f.points), half = f.width / 2;
  if (d > half + f.shoulder) continue;
  const ph = valueAlong(f.points, hitSeg, hitT), w = d <= half ? 1 : 1 - smooth((d - half) / Math.max(1e-3, f.shoulder));
  h += (ph - h) * w;
 }
 for (const p of s.pads) {
  if (!inBox(p.box, x, z)) continue;
  // Distance outside the footprint grown by its margin (0 inside it).
  const lx = (x - p.x) * p.cos - (z - p.z) * p.sin, lz = (x - p.x) * p.sin + (z - p.z) * p.cos;
  const ox = Math.max(0, Math.abs(lx) - p.w / 2 - p.margin), oz = Math.max(0, Math.abs(lz) - p.d / 2 - p.margin);
  const d = Math.sqrt(ox * ox + oz * oz);
  if (d > p.blend) continue;
  h += (p.h - h) * (1 - smooth(d / p.blend));
 }
 return h;
}

// The whole grid: { minX, minZ, cols, rows, heights (Int16Array mm), hash }.
export function bakeTerrain(map) {
 const spec = map.terrain, [minX, minZ, maxX, maxZ] = spec.bounds;
 const s = prepare(spec, terrainPads(map));
 const cols = Math.round((maxX - minX) / CELL) + 1, rows = Math.round((maxZ - minZ) / CELL) + 1;
 const heights = new Int16Array(cols * rows);
 for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const v = mm(rawHeight(s, minX + c * CELL, minZ + r * CELL));
  if (v < -32768 || v > 32767) throw new Error(`terrain ${map.id}: height ${v / 1000} m out of range at ${minX + c * CELL}, ${minZ + r * CELL}`);
  heights[r * cols + c] = v;
 }
 return { minX, minZ, cols, rows, heights, hash: terrainSourceHash(map) };
}

// The grid as text (heightfield.js decodeHeights reads it back).
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function encodeHeights(heights, cols) {
 const bytes = [];
 for (let i = 0; i < heights.length; i++) {
  const c = i % cols, left = c ? heights[i - 1] : 0, up = i >= cols ? heights[i - cols] : 0;
  const predict = i < cols ? left : c ? left + up - heights[i - cols - 1] : up;
  const delta = heights[i] - predict;
  let z = delta >= 0 ? delta * 2 : -delta * 2 - 1;
  do { let b = z & 127; z >>>= 7; if (z) b |= 128; bytes.push(b); } while (z);
 }
 let out = '';
 for (let i = 0; i < bytes.length; i += 3) {
  const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2], n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
  out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (b === undefined ? '=' : B64[(n >> 6) & 63]) + (c === undefined ? '=' : B64[n & 63]);
 }
 return out;
}

// What the grid was baked from: the terrain spec and every building pad.
// The generated module carries it; tests/terrain.test.js fails with "re-bake"
// when the spec or a pad changes without a new bake.
export function terrainSourceHash(map) {
 const text = JSON.stringify({ terrain: map.terrain, pads: terrainPads(map), cell: CELL });
 let h = 0x811c9dc5;
 for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
 return h.toString(16).padStart(8, '0');
}
