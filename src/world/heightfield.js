// The hills system's ground ("2.5D"). Positions stay x/z (metres, x east,
// z south); the height of the ground under any point comes from one shared
// grid, 0.5 m apart, in whole millimetres. Maps with a `terrain` spec ship
// that grid prebaked (tools/bake-terrain.mjs writes src/maps/terrain/<id>.js
// from the spec and world/terrain-bake.js), so every browser, the host and
// the tests read exactly the same numbers.
//
// No three.js and no DOM: the simulation, robots, the network and the
// renderer all read this.
//
// A map without terrain gets FLAT: height 0 everywhere. Callers check
// `ground.flat` first so flat maps run exactly the code they always did
// (tests/golden-flat.test.js locks Deadwater, byte for byte).
//
// What a Ground answers:
//  - heightAt(x, z): the ground you stand on (bilinear; decks included).
//  - drawnHeightAt(x, z): the ground as drawn (no decks: a bridge's deck is
//    its own mesh over the water).
//  - gradientAt(x, z, out): rise per metre east (out.x) and south (out.z).
//  - sightClear(ax, az, bx, bz): can two bodies standing there see each
//    other over the ground? Symmetric by construction (TERRAIN in
//    config/gameplay.js: eye 1.35, body .9, crest .5).
//  - roundStop(ox, oz, x, z, dx, dz, range): how far a round fired from
//    (x, z) along (dx, dz) by someone standing at (ox, oz) flies before the
//    ground hides the rest of its path from them (Infinity: never).
//  - edges: the authored steep edges (level "cliff" segments), each a thin
//    box the map kit turns into a playerOnly/terrainEdge collider.
import { TERRAIN } from '../config/gameplay.js';

export const CELL = .5, TILE = 8; // grid spacing (m); grid cells per sight tile (4 m)
export const ROUND_GRACE = 1;     // a round flies on this far past the last point its shooter sees
const PER_CELL = 1 / CELL, MM = .001;

// A map without terrain. Frozen: nothing may hang state off the shared object.
export const FLAT = Object.freeze({
 flat: true, hash: 'flat', minY: 0, maxY: 0, edges: Object.freeze([]),
 heightAt: () => 0,
 drawnHeightAt: () => 0,
 gradientAt(x, z, out = { x: 0, z: 0 }) { out.x = 0; out.z = 0; return out; },
 sightClear: () => true,
 roundStop: () => Infinity,
});

// ---- The prebaked grid's text form (written by terrain-bake.js) ----
// Each value is predicted from its neighbours (left + up - up-left; the
// first row from the left, the first column from above) and only the
// difference is stored, as a zigzag varint, then base64. Smooth ground costs
// about a byte a point.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function decodeHeights(text, cols, rows) {
 const lookup = new Int8Array(128).fill(-1);
 for (let i = 0; i < 64; i++) lookup[B64.charCodeAt(i)] = i;
 const bytes = new Uint8Array(Math.floor(text.length * 3 / 4));
 let n = 0, acc = 0, bits = 0;
 for (let i = 0; i < text.length; i++) {
  const v = lookup[text.charCodeAt(i) & 127];
  if (v < 0) continue; // '=' padding
  acc = (acc << 6) | v; bits += 6;
  if (bits >= 8) { bits -= 8; bytes[n++] = (acc >> bits) & 255; }
 }
 const out = new Int16Array(cols * rows);
 let at = 0;
 for (let i = 0; i < out.length; i++) {
  let z = 0, shift = 0, b;
  do { b = bytes[at++]; z |= (b & 127) << shift; shift += 7; } while (b & 128);
  const delta = (z >>> 1) ^ -(z & 1);
  const c = i % cols;
  const left = c ? out[i - 1] : 0, up = i >= cols ? out[i - cols] : 0;
  const predict = i < cols ? left : c ? left + up - out[i - cols - 1] : up;
  out[i] = predict + delta;
 }
 if (at > n) throw new Error('terrain grid: data too short');
 return out;
}

// ---- Polygons (decks, edges) ----
export function insidePoly(x, z, poly) {
 let inside = false;
 for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
  const ax = poly[j][0], az = poly[j][1], bx = poly[i][0], bz = poly[i][1];
  if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
 }
 return inside;
}

export class Ground {
 // `baked`: { minX, minZ, cols, rows, heights (Int16Array mm, the drawn
 // ground), hash }. `spec`: the map's terrain spec (decks and levels are read
 // here; the rest was used by the bake).
 constructor(baked, spec = {}) {
  this.flat = false; this.hash = baked.hash; this.spec = spec;
  this.minX = baked.minX; this.minZ = baked.minZ; this.cols = baked.cols; this.rows = baked.rows;
  this.maxX = this.minX + (this.cols - 1) * CELL; this.maxZ = this.minZ + (this.rows - 1) * CELL;
  this.drawn = baked.heights;
  // Decks (a bridge, a log, a dam walk) are ground you stand on but are not
  // drawn as terrain: the physics grid only.
  const grid = this.grid = baked.heights.slice();
  for (const deck of spec.decks || []) {
   const top = Math.round(deck.h * 1000);
   let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
   for (const [x, z] of deck.poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
   const c0 = Math.max(0, Math.floor((x0 - this.minX) * PER_CELL)), c1 = Math.min(this.cols - 1, Math.ceil((x1 - this.minX) * PER_CELL));
   const r0 = Math.max(0, Math.floor((z0 - this.minZ) * PER_CELL)), r1 = Math.min(this.rows - 1, Math.ceil((z1 - this.minZ) * PER_CELL));
   for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const i = r * this.cols + c;
    if (insidePoly(this.minX + c * CELL, this.minZ + r * CELL, deck.poly) && grid[i] < top) grid[i] = top;
   }
  }
  // The highest grid point per TILE x TILE block (shared edges included, so
  // no point inside a tile is higher): one look at the tiles under a line's
  // box says whether anything there can reach it at all (most lines: nothing).
  const tc = this.tileCols = Math.ceil((this.cols - 1) / TILE), tr = this.tileRows = Math.ceil((this.rows - 1) / TILE);
  const tiles = this.tileMax = new Int16Array(tc * tr).fill(-32768), lows = this.tileMin = new Int16Array(tc * tr).fill(32767);
  let lo = Infinity, hi = -Infinity;
  for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
   const v = grid[r * this.cols + c]; if (v < lo) lo = v; if (v > hi) hi = v;
   for (let tz = Math.max(0, Math.ceil(r / TILE) - 1); tz <= Math.min(tr - 1, Math.floor(r / TILE)); tz++)
    for (let tx = Math.max(0, Math.ceil(c / TILE) - 1); tx <= Math.min(tc - 1, Math.floor(c / TILE)); tx++) {
     const k = tz * tc + tx; if (tiles[k] < v) tiles[k] = v; if (lows[k] > v) lows[k] = v;
    }
  }
  this.minY = lo * MM; this.maxY = hi * MM;
  this.edges = levelEdges(spec, this);
  // Retaining walls are walls to sight and shots as well as to bodies (owner,
  // 2026-09-25: from a wall's foot you must not see, shoot or launch over its
  // top). TERRAIN.crest's half-metre allowance is for natural crests only:
  // every grid point on or beside an authored edge (its collider grown half a
  // metre each side, so the lip counts too) cuts a line at its full height.
  // `tileWall`: the highest of those points per tile (for the early-outs).
  const wall = this.wall = new Uint8Array(this.cols * this.rows), tileWall = this.tileWall = new Int16Array(tc * tr).fill(-32768);
  for (const e of this.edges) {
   const box = edgeCollider(e), cos = Math.cos(box.angle), sin = Math.sin(box.angle), halfW = box.localW / 2, halfD = box.localD / 2 + .5, reach = Math.hypot(halfW, halfD);
   const c0 = Math.max(0, Math.floor((box.x - reach - this.minX) * PER_CELL)), c1 = Math.min(this.cols - 1, Math.ceil((box.x + reach - this.minX) * PER_CELL));
   const r0 = Math.max(0, Math.floor((box.z - reach - this.minZ) * PER_CELL)), r1 = Math.min(this.rows - 1, Math.ceil((box.z + reach - this.minZ) * PER_CELL));
   for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const rx = this.minX + c * CELL - box.x, rz = this.minZ + r * CELL - box.z;
    if (Math.abs(rx * cos - rz * sin) > halfW || Math.abs(rx * sin + rz * cos) > halfD) continue;
    const i = r * this.cols + c, v = grid[i]; wall[i] = 1;
    for (let tz = Math.max(0, Math.ceil(r / TILE) - 1); tz <= Math.min(tr - 1, Math.floor(r / TILE)); tz++)
     for (let tx = Math.max(0, Math.ceil(c / TILE) - 1); tx <= Math.min(tc - 1, Math.floor(c / TILE)); tx++) { const k = tz * tc + tx; if (tileWall[k] < v) tileWall[k] = v; }
   }
  }
 }

 // Is (x, z) on or beside a retaining wall (its nearest grid point marked)?
 wallAt(x, z) {
  const c = Math.round((x - this.minX) * PER_CELL), r = Math.round((z - this.minZ) * PER_CELL);
  return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.wall[r * this.cols + c] === 1;
 }
 // How far below a line the ground must stay there: a wall's full height, or a
 // crest's allowance.
 cutAt(x, z) { return this.wallAt(x, z) ? 0 : TERRAIN.crest; }

 // Bilinear on one grid (mm), in metres. Off the grid: its nearest edge.
 sample(grid, x, z) {
  let fx = (x - this.minX) * PER_CELL, fz = (z - this.minZ) * PER_CELL;
  const cols = this.cols, lastC = cols - 1, lastR = this.rows - 1;
  if (!(fx > 0)) fx = 0; else if (fx > lastC) fx = lastC;
  if (!(fz > 0)) fz = 0; else if (fz > lastR) fz = lastR;
  let c = Math.floor(fx), r = Math.floor(fz);
  if (c >= lastC) c = lastC - 1; if (r >= lastR) r = lastR - 1;
  const tx = fx - c, tz = fz - r, i = r * cols + c;
  const a = grid[i], b = grid[i + 1], d = grid[i + cols], e = grid[i + cols + 1];
  const top = a + (b - a) * tx, bottom = d + (e - d) * tx;
  return (top + (bottom - top) * tz) * MM;
 }
 heightAt(x, z) { return this.sample(this.grid, x, z); }
 drawnHeightAt(x, z) { return this.sample(this.drawn, x, z); }

 // Rise per metre (the bilinear patch's own slope at the point).
 gradientAt(x, z, out = { x: 0, z: 0 }) {
  let fx = (x - this.minX) * PER_CELL, fz = (z - this.minZ) * PER_CELL;
  const cols = this.cols, lastC = cols - 1, lastR = this.rows - 1, g = this.grid;
  if (!(fx > 0)) fx = 0; else if (fx > lastC) fx = lastC;
  if (!(fz > 0)) fz = 0; else if (fz > lastR) fz = lastR;
  let c = Math.floor(fx), r = Math.floor(fz);
  if (c >= lastC) c = lastC - 1; if (r >= lastR) r = lastR - 1;
  const tx = fx - c, tz = fz - r, i = r * cols + c;
  const a = g[i], b = g[i + 1], d = g[i + cols], e = g[i + cols + 1];
  out.x = ((b - a) * (1 - tz) + (e - d) * tz) * PER_CELL * MM;
  out.z = ((d - a) * (1 - tx) + (e - b) * tx) * PER_CELL * MM;
  return out;
 }

 // The highest / lowest ground (m) in the tiles a box touches.
 maxInBox(x0, z0, x1, z1) { return this.tileScan(this.tileMax, x0, z0, x1, z1, 1); }
 minInBox(x0, z0, x1, z1) { return this.tileScan(this.tileMin, x0, z0, x1, z1, -1); }
 tileScan(tiles, x0, z0, x1, z1, sign) {
  const tc = this.tileCols, tr = this.tileRows, size = TILE * CELL;
  const a = Math.max(0, Math.min(tc - 1, Math.floor((x0 - this.minX) / size))), b = Math.max(0, Math.min(tc - 1, Math.floor((x1 - this.minX) / size)));
  const c = Math.max(0, Math.min(tr - 1, Math.floor((z0 - this.minZ) / size))), d = Math.max(0, Math.min(tr - 1, Math.floor((z1 - this.minZ) / size)));
  let best = sign > 0 ? -32768 : 32767;
  for (let tz = c; tz <= d; tz++) for (let tx = a; tx <= b; tx++) { const v = tiles[tz * tc + tx]; if (sign > 0 ? v > best : v < best) best = v; }
  return best * MM;
 }

 // Can bodies standing at a and at b see each other over the ground? Two
 // lines: a's eye to b's body, and a's body to b's eye; either one clear is
 // enough. A line is cut where the ground rises TERRAIN.crest or more above
 // it, or reaches it at all at a retaining wall (cutAt). The pair is put in a fixed order first, so (a, b) and (b, a) take
 // exactly the same samples: sight is always mutual.
 sightClear(ax, az, bx, bz) {
  if (ax > bx || (ax === bx && az > bz)) { let t = ax; ax = bx; bx = t; t = az; az = bz; bz = t; }
  const dx = bx - ax, dz = bz - az, n = Math.ceil(Math.sqrt(dx * dx + dz * dz) * PER_CELL);
  if (n < 2) return true;
  // No real line is 2 km long: a runaway position (a bad packet) must not
  // walk millions of samples every frame. Clear, as on a flat map.
  if (!(n < 4096)) return true;
  const ha = this.heightAt(ax, az), hb = this.heightAt(bx, bz), eye = TERRAIN.eye, body = TERRAIN.body, crest = TERRAIN.crest;
  const e1 = ha + eye, f1 = hb + body, e2 = ha + body, f2 = hb + eye;
  // Nothing between them reaches either line (a straight line between two
  // points above a level stays above it): clear without walking it. (A
  // retaining wall counts at its full height.)
  const z0 = Math.min(az, bz), z1 = Math.max(az, bz), wallTop = this.tileScan(this.tileWall, ax, z0, bx, z1, 1);
  if (Math.max(this.maxInBox(ax, z0, bx, z1) - crest, wallTop) < Math.min(e1, f1, e2, f2)) return true;
  // Near a retaining wall, quarter-metre steps (as roundStop takes), so both
  // find the same narrow lip.
  const steps = wallTop > -30 ? n * 2 : n;
  let clear1 = true, clear2 = true;
  for (let k = 1; k < steps; k++) {
   const t = k / steps, x = ax + dx * t, z = az + dz * t, g = this.heightAt(x, z) - this.cutAt(x, z);
   if (clear1 && g >= e1 + (f1 - e1) * t) clear1 = false;
   if (clear2 && g >= e2 + (f2 - e2) * t) clear2 = false;
   if (!clear1 && !clear2) return false;
  }
  return true;
 }

 // A round from (x, z) along (dx, dz) (unit), fired by someone standing at
 // (ox, oz): how far until the rest of its path is hidden from them by the
 // ground. Walked in quarter metres with two running horizons (the same two
 // lines as sightClear, from the shooter to a body at each point along the
 // path). A point is seen if either line to it clears every earlier point.
 // Hidden dips are flown over; the round ends ROUND_GRACE past the last point
 // that can be seen, so it still reaches a body standing there (whose middle
 // may be a little further on). Infinity: seen all the way to `range`.
 roundStop(ox, oz, x, z, dx, dz, range) {
  if (!(range < 2048)) return Infinity; // (as sightClear: no runaway walks)
  const eye = TERRAIN.eye, body = TERRAIN.body, crest = TERRAIN.crest, step = CELL / 2;
  const ho = this.heightAt(ox, oz), top1 = ho + eye, top2 = ho + body;
  // Nothing on the way rises to the lower end of any line (the shooter's
  // body, or a body on the lowest ground about): seen to the end.
  const ex = x + dx * range, ez = z + dz * range, x0 = Math.min(ox, x, ex), z0 = Math.min(oz, z, ez), x1 = Math.max(ox, x, ex), z1 = Math.max(oz, z, ez);
  if (Math.max(this.maxInBox(x0, z0, x1, z1) - crest, this.tileScan(this.tileWall, x0, z0, x1, z1, 1)) < Math.min(ho, this.minInBox(x0, z0, x1, z1)) + body) return Infinity;
  let h1 = -Infinity, h2 = -Infinity, seen = 0, lastSeen = true;
  const n = Math.ceil(range / step);
  for (let k = 0; k <= n; k++) {
   const s = Math.min(range, k * step), px = x + dx * s, pz = z + dz * s;
   const ux = px - ox, uz = pz - oz, u = Math.sqrt(ux * ux + uz * uz);
   if (u < CELL) continue; // under the shooter's own feet
   const g = this.heightAt(px, pz);
   // Seen: the line to a body here climbs above both horizons so far.
   lastSeen = (g + body - top1) / u > h1 || (g + eye - top2) / u > h2;
   if (lastSeen) seen = s;
   const cut = this.cutAt(px, pz), r1 = (g - cut - top1) / u, r2 = (g - cut - top2) / u;
   if (r1 > h1) h1 = r1; if (r2 > h2) h2 = r2;
  }
  if (lastSeen || seen + ROUND_GRACE >= range) return Infinity;
  // The horizons follow the round's own path, which starts at the muzzle
  // beside the shooter: where it grazes a corner it can end short of a body
  // the shooter can see (sightClear). Check on past the stop, a metre at a
  // time for 25 m, and carry the round to the last such point.
  let stop = seen + ROUND_GRACE;
  for (let s = stop; s < Math.min(range, stop + 25); s += 1) if (this.sightClear(ox, oz, x + dx * s, z + dz * s)) seen = s;
  stop = Math.max(stop, seen + ROUND_GRACE);
  return stop >= range ? Infinity : stop;
 }
}

// The authored steep edges, as thin boxes (retaining walls: they stop bodies
// and robots; the ground decides sight and shots):
//  - every "cliff" side of every level, standing outside the level's edge
//    over the drop, deep enough to cover the face however tall;
//  - every segment of the spec's own `edges` polylines (a ramp's side
//    walls), centred on the line.
// Each runs a little past both ends so corners close.
function levelEdges(spec, ground) {
 const edges = [];
 const add = (ax, az, bx, bz, nx, nz, centred, drop, steep, extend, top) => {
  const length = Math.hypot(bx - ax, bz - az); if (length < 1e-6) return;
  const depth = Math.max(.6, drop / steep + .3);
  edges.push({ ax, az, bx, bz, ux: (bx - ax) / length, uz: (bz - az) / length, nx, nz, length, drop, depth, extend, centred, top });
 };
 for (const level of spec.levels || []) {
  const poly = level.poly, cliffs = new Set(level.cliffs || []), steep = level.cliffGrade || 8;
  for (let i = 0; i < poly.length; i++) {
   if (!cliffs.has(i)) continue;
   const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
   const length = Math.hypot(bx - ax, bz - az); if (length < 1e-6) continue;
   // The outward normal: away from the level's inside.
   let nx = (bz - az) / length, nz = -(bx - ax) / length;
   if (insidePoly((ax + bx) / 2 + nx * .05, (az + bz) / 2 + nz * .05, poly)) { nx = -nx; nz = -nz; }
   // The drop: from the level's height to the ground just beyond the face.
   let drop = 0;
   for (let k = 0; k <= 8; k++) {
    const t = k / 8, px = ax + (bx - ax) * t + nx * 1.5, pz = az + (bz - az) * t + nz * 1.5;
    drop = Math.max(drop, level.lower ? ground.heightAt(px, pz) - level.h : level.h - ground.heightAt(px, pz));
   }
   add(ax, az, bx, bz, nx, nz, false, drop, steep, level.edgeExtend ?? .35, level.lower ? null : level.h);
  }
 }
 for (const line of spec.edges || []) {
  const pts = line.points;
  for (let i = 1; i < pts.length; i++) {
   const [ax, az] = pts[i - 1], [bx, bz] = pts[i], length = Math.hypot(bx - ax, bz - az); if (length < 1e-6) continue;
   const nx = (bz - az) / length, nz = -(bx - ax) / length;
   let drop = 0;
   for (let k = 0; k <= 8; k++) {
    const px = ax + (bx - ax) * k / 8, pz = az + (bz - az) * k / 8;
    drop = Math.max(drop, Math.abs(ground.heightAt(px + nx, pz + nz) - ground.heightAt(px - nx, pz - nz)));
   }
   add(ax, az, bx, bz, nx, nz, true, drop, line.grade || 8, line.extend ?? .35, null);
  }
 }
 return edges;
}

// An edge as a collider (the map kit's box format: w/d the world-axis
// extents, angle/localW/localD the box itself). A level's cliff sits from
// .1 m inside the edge to `depth` - .1 outside; a polyline edge is centred.
export function edgeCollider(e) {
 const along = e.length + e.extend * 2, across = e.depth, out = e.centred ? 0 : across / 2 - .1;
 const x = (e.ax + e.bx) / 2 + e.nx * out, z = (e.az + e.bz) / 2 + e.nz * out;
 // Local x runs along the edge: (cos a, -sin a) = (ux, uz).
 const c = e.ux, s = -e.uz, angle = Math.atan2(s, c);
 return { x, z, w: Math.abs(along * c) + Math.abs(across * s), d: Math.abs(along * s) + Math.abs(across * c),
  angle, localW: along, localD: across, height: Math.max(.5, e.drop), playerOnly: true, terrainEdge: true };
}

// The ground of a map from its prebaked grid (see map-kit.js groundFor).
export function groundFromBaked(baked, spec) {
 return new Ground({ ...baked, heights: decodeHeights(baked.data, baked.cols, baked.rows) }, spec);
}
