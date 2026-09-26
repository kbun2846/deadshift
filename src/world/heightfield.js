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
//  - flight(x, z, dx, dz, range, h): a round's flight over the ground (a
//    rifle round, a pellet, a Scatter shell, a lane of Static's spray): its
//    height all along its path, and where the ground stops it (`stop`;
//    Infinity: never); flightAt(f, s) reads it, flightReaches(a, b) asks
//    whether a round from a body at a gets to a body at b.
//  - edges: the authored steep edges (level "cliff" segments), each a thin
//    box the map kit turns into a playerOnly/terrainEdge collider.
//  - water: waterAt(x, z) (the level a stream stands at there, or
//    -Infinity), waterDepthAt(x, z, y), wetAt, flowAt(x, z, out) (the way
//    it runs), bankDistance(x, z). Nothing stops a body going in: its depth
//    slows it (owner, 2026-09-26: wade anywhere).
//  - decks (a bridge, a log): heightAt includes them; a body that wades in
//    underneath one stands on drawnHeightAt instead (simulation.js `below`),
//    and sight passes over and under them (only the ground cuts); a round
//    flies over one it meets at about its top, and under it from lower down.
import { TERRAIN, WADE } from '../config/gameplay.js';

export const CELL = .5, TILE = 8; // grid spacing (m); grid cells per sight tile (4 m)
export const FLIGHT_STEP = .25;   // a round's flight is worked out every quarter metre
export const FLIGHT_SPAN = 6;     // it holds its height over a hollow no wider than this
const PER_CELL = 1 / CELL, MM = .001;

// A map without terrain. Frozen: nothing may hang state off the shared object.
export const FLAT = Object.freeze({
 flat: true, hash: 'flat', minY: 0, maxY: 0, edges: Object.freeze([]), decks: Object.freeze([]),
 wetAt: () => false, bankDistance: () => Infinity, waterAt: () => -Infinity, waterDepthAt: () => 0, deckAt: () => -1,
 flowAt(x, z, out = { x: 0, z: 0 }) { out.x = 0; out.z = 0; return out; },
 heightAt: () => 0,
 drawnHeightAt: () => 0,
 gradientAt(x, z, out = { x: 0, z: 0 }) { out.x = 0; out.z = 0; return out; },
 sightClear: () => true,
 flight: (x, z, dx, dz, range, h = 0) => ({ x, z, dx, dz, range, stop: Infinity, flat: h }),
 flightAt: f => f.flat,
 flightReaches: () => true,
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

// Distance from (x, z) to a closed polygon's outline.
function polyDistance(x, z, poly) {
 let best = Infinity;
 for (let i = 0; i < poly.length; i++) {
  const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
  best = Math.min(best, Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z));
 }
 return best;
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
  // Decks (a bridge, a log) are ground you stand on but are not drawn as
  // terrain. heightAt adds them exactly: level to their outline, then straight
  // down (a body steps off a deck's side into the water, and one wading in
  // under it stays under it: simulation.js `below`). `grid` is the drawn
  // ground with each deck raised on it, a grid step past its outline: only
  // for the highest-ground bounds below (tileMax: never lower than any deck)
  // and Extreme's ground texture.
  this.decks = (spec.decks || []).map(d => ({ poly: d.poly, h: Math.round(d.h * 1000) * MM, x0: Math.min(...d.poly.map(p => p[0])), x1: Math.max(...d.poly.map(p => p[0])), z0: Math.min(...d.poly.map(p => p[1])), z1: Math.max(...d.poly.map(p => p[1])) }));
  const grid = this.grid = baked.heights.slice(), drawn = baked.heights;
  for (const deck of spec.decks || []) {
   const top = Math.round(deck.h * 1000), poly = deck.poly;
   let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
   for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
   const c0 = Math.max(0, Math.floor((x0 - this.minX) * PER_CELL) - 1), c1 = Math.min(this.cols - 1, Math.ceil((x1 - this.minX) * PER_CELL) + 1);
   const r0 = Math.max(0, Math.floor((z0 - this.minZ) * PER_CELL) - 1), r1 = Math.min(this.rows - 1, Math.ceil((z1 - this.minZ) * PER_CELL) + 1);
   for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const i = r * this.cols + c, x = this.minX + c * CELL, z = this.minZ + r * CELL;
    if (grid[i] < top && (insidePoly(x, z, poly) || polyDistance(x, z, poly) <= CELL + 1e-6)) grid[i] = top;
   }
  }
  // The highest grid point per TILE x TILE block (shared edges included, so
  // no point inside a tile is higher): one look at the tiles under a line's
  // box says whether anything there can reach it at all (most lines: nothing).
  // The lowest comes from the drawn ground (a body under a deck stands on it).
  const tc = this.tileCols = Math.ceil((this.cols - 1) / TILE), tr = this.tileRows = Math.ceil((this.rows - 1) / TILE);
  const tiles = this.tileMax = new Int16Array(tc * tr).fill(-32768), lows = this.tileMin = new Int16Array(tc * tr).fill(32767);
  let lo = Infinity, hi = -Infinity;
  for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
   const v = grid[r * this.cols + c], u = drawn[r * this.cols + c]; if (u < lo) lo = u; if (v > hi) hi = v;
   for (let tz = Math.max(0, Math.ceil(r / TILE) - 1); tz <= Math.min(tr - 1, Math.floor(r / TILE)); tz++)
    for (let tx = Math.max(0, Math.ceil(c / TILE) - 1); tx <= Math.min(tc - 1, Math.floor(c / TILE)); tx++) {
     const k = tz * tc + tx; if (tiles[k] < v) tiles[k] = v; if (lows[k] > u) lows[k] = u;
    }
  }
  this.minY = lo * MM; this.maxY = hi * MM;
  this.edges = levelEdges(spec, this);
  // The streams' water.
  this.water = waterBands(spec);
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

 // The level the water stands at over (x, z) (-Infinity: no stream here).
 waterAt(x, z) {
  for (const w of this.water) {
   if (x < w.x0 || x > w.x1 || z < w.z0 || z > w.z1) continue;
   if (nearBand(w, x, z).out < 0) return levelOf(w, x);
  }
  return -Infinity;
 }
 // How deep the water is over a body standing at height y there (0: dry).
 waterDepthAt(x, z, y = this.heightAt(x, z)) { const level = this.waterAt(x, z); return level > y ? level - y : 0; }
 // Standing in water here (on the ground or a deck: heightAt)?
 wetAt(x, z) { return this.waterDepthAt(x, z) > .03; }
 // The way the water runs over (x, z) (unit; zero off the streams).
 flowAt(x, z, out = { x: 0, z: 0 }) {
  out.x = 0; out.z = 0;
  for (const w of this.water) {
   if (x < w.x0 || x > w.x1 || z < w.z0 || z > w.z1) continue;
   const n = nearBand(w, x, z);
   if (n.out < 0) { out.x = n.ux * w.flow; out.z = n.uz * w.flow; return out; }
  }
  return out;
 }
 // The deck whose outline holds (x, z) (its index), or -1.
 deckAt(x, z) {
  for (let i = 0; i < this.decks.length; i++) { const d = this.decks[i]; if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1 && insidePoly(x, z, d.poly)) return i; }
  return -1;
 }
 // How far (x, z) is outside the top of the nearest channel's banks (its half
 // width plus `bank`; negative: on a bank or in the water). The fence stops
 // at the banks by it.
 bankDistance(x, z) {
  let best = Infinity;
  for (const w of this.water) best = Math.min(best, nearBand(w, x, z).out);
  return best;
 }

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
 heightAt(x, z) {
  const y = this.sample(this.drawn, x, z);
  if (this.decks.length) { const k = this.deckAt(x, z); if (k >= 0 && this.decks[k].h > y) return this.decks[k].h; }
  return y;
 }
 drawnHeightAt(x, z) { return this.sample(this.drawn, x, z); }

 // Rise per metre (the bilinear patch's own slope at the point).
 gradientAt(x, z, out = { x: 0, z: 0 }) {
  let fx = (x - this.minX) * PER_CELL, fz = (z - this.minZ) * PER_CELL;
  const cols = this.cols, lastC = cols - 1, lastR = this.rows - 1, g = this.drawn;
  // (On a deck: level.)
  if (this.decks.length) { const k = this.deckAt(x, z); if (k >= 0 && this.decks[k].h > this.sample(g, x, z)) { out.x = 0; out.z = 0; return out; } }
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
 // exactly the same samples: sight is always mutual. `ha`, `hb`: the ground
 // each body stands on, when not heightAt there (a body wading under a deck
 // stands on the stream's bed). Along the line only the ground itself cuts:
 // decks are thin, and a line passes over or under them.
 sightClear(ax, az, bx, bz, ha = this.heightAt(ax, az), hb = this.heightAt(bx, bz)) {
  if (ax > bx || (ax === bx && az > bz)) { let t = ax; ax = bx; bx = t; t = az; az = bz; bz = t; t = ha; ha = hb; hb = t; }
  const dx = bx - ax, dz = bz - az, n = Math.ceil(Math.sqrt(dx * dx + dz * dz) * PER_CELL);
  if (n < 2) return true;
  // No real line is 2 km long: a runaway position (a bad packet) must not
  // walk millions of samples every frame. Clear, as on a flat map.
  if (!(n < 4096)) return true;
  const eye = TERRAIN.eye, body = TERRAIN.body, crest = TERRAIN.crest;
  const e1 = ha + eye, f1 = hb + body, e2 = ha + body, f2 = hb + eye;
  // Nothing between them reaches either line (a straight line between two
  // points above a level stays above it): clear without walking it. (A
  // retaining wall counts at its full height.)
  const z0 = Math.min(az, bz), z1 = Math.max(az, bz), wallTop = this.tileScan(this.tileWall, ax, z0, bx, z1, 1);
  if (Math.max(this.maxInBox(ax, z0, bx, z1) - crest, wallTop) < Math.min(e1, f1, e2, f2)) return true;
  // Near a retaining wall, quarter-metre steps, so a narrow lip is found.
  const steps = wallTop > -30 ? n * 2 : n;
  let clear1 = true, clear2 = true;
  for (let k = 1; k < steps; k++) {
   const t = k / steps, x = ax + dx * t, z = az + dz * t, g = this.drawnHeightAt(x, z) - this.cutAt(x, z);
   if (clear1 && g >= e1 + (f1 - e1) * t) clear1 = false;
   if (clear2 && g >= e2 + (f2 - e2) * t) clear2 = false;
   if (!clear1 && !clear2) return false;
  }
  return true;
 }

 // A round in flight (owner, 2026-09-26: wherever the height changes gently,
 // rounds stay over the ground instead of going into it). From (x, z) along
 // (dx, dz) (unit) for up to `range` m, set off over height `h` (the ground
 // its shooter stands on). Its flight line follows the ground under it,
 // climbing and dropping no more than TERRAIN.roundClimb per metre: up and
 // down every slope a body can walk and over every crest, and off a ledge it
 // comes down more gently than the ledge does. It does not dip into a hollow
 // it would climb straight back out of within FLIGHT_SPAN (a gully, a ditch,
 // a stream's channel): it holds its height across. The round flies
 // TERRAIN.roundHeight over that line and ends where the ground rises into it
 // (`stop`: a retaining wall's face, a rise too steep to climb; Infinity:
 // never). Decks: met at about their top (within WADE.step of the line, so it
 // came along a bank or another deck) they are ground to fly over; from lower
 // down it flies on underneath. Worked out every FLIGHT_STEP (`heights`), so
 // the host, every browser and the view get the same numbers. `lead`: how far
 // its shooter stood behind (x, z) (a muzzle ahead of the body): the line has
 // already come that far, so at the foot of a bank the round leaves the
 // barrel over the bank's rise instead of inside it.
 flight(x, z, dx, dz, range, h, lead = 0) {
  range = Math.min(range, 512); // (no round flies half that far: no runaway walks)
  const n = Math.max(1, Math.ceil(range / FLIGHT_STEP)), span = Math.round(FLIGHT_SPAN / FLIGHT_STEP), heights = new Float64Array(n + 1);
  const lift = TERRAIN.roundHeight, climb = TERRAIN.roundClimb, ground = new Float64Array(n + span + 1);
  for (let k = 0; k <= n + span; k++) { const s = k <= n ? Math.min(range, k * FLIGHT_STEP) : k * FLIGHT_STEP; ground[k] = this.drawnHeightAt(x + dx * s, z + dz * s); }
  let g = h, deck = -1, stop = Infinity, last = 0, over = 0, k = 0;
  for (; k <= n; k++) {
   const s = Math.min(range, k * FLIGHT_STEP);
   let under = ground[k];
   if (this.decks.length) {
    const d = this.deckAt(x + dx * s, z + dz * s);
    if (d >= 0 && (d === deck || g >= this.decks[d].h - WADE.step)) { deck = d; if (this.decks[d].h > under) under = this.decks[d].h; }
    else deck = -1;
   }
   // (From the shooter to the muzzle it has already come `lead` metres.)
   if (!k && lead > 0) { const c = climb * Math.min(lead, 2); g += Math.max(-c, Math.min(c, under - g)); }
   if (k) {
    // Down only as far as the highest ground just ahead (never up for it:
    // a wall ahead is met, not climbed early).
    let ahead = -Infinity;
    for (let j = k + 1; j <= k + span; j++) if (ground[j] > ahead) ahead = ground[j];
    const want = Math.max(under, Math.min(g, ahead)), c = climb * (s - last);
    g += Math.max(-c, Math.min(c, want - g));
   }
   heights[k] = g;
   // Into the ground: where between the last point and this one it rose
   // over the round.
   const into = under - g - lift;
   if (into > 0) { stop = k ? last + (s - last) * (-over / (into - over)) : 0; break; }
   over = into; last = s;
  }
  return { x, z, dx, dz, range, heights, n: Math.min(k, n), stop };
 }
 // The flight line's height `s` m along a flight (flight above).
 flightAt(f, s) {
  const i = Math.max(0, Math.min(s, f.range, f.stop)) / FLIGHT_STEP, k = Math.min(Math.floor(i), f.n), next = Math.min(k + 1, f.n);
  if (next === k) return f.heights[k];
  const s0 = k * FLIGHT_STEP, s1 = Math.min(f.range, next * FLIGHT_STEP), t = s1 > s0 ? (i * FLIGHT_STEP - s0) / (s1 - s0) : 0;
  return f.heights[k] + (f.heights[next] - f.heights[k]) * Math.min(1, t);
 }
 // Does a round from a body standing at a get to a body standing at b (it
 // is not stopped short of it, and passes it between its feet and
 // TERRAIN.bodyTop)? `ha`, `hb`: the ground each stands on, when not
 // heightAt there.
 flightReaches(ax, az, bx, bz, ha = this.heightAt(ax, az), hb = this.heightAt(bx, bz)) {
  const dx = bx - ax, dz = bz - az, d = Math.sqrt(dx * dx + dz * dz);
  if (!(d > 1e-6) || !(d < 2048)) return true;
  // Nothing on the way rises a round's height above anything else there, and
  // no wall: the ground cannot stop it, and it passes the body (robots ask
  // this a lot; most of the map is gentle).
  const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz), low = Math.min(this.minInBox(x0, z0, x1, z1), ha, hb);
  if (this.maxInBox(x0, z0, x1, z1) - low <= TERRAIN.roundHeight && Math.max(ha, hb) - low <= TERRAIN.roundHeight && this.tileScan(this.tileWall, x0, z0, x1, z1, 1) < -30) return true;
  const f = this.flight(ax, az, dx / d, dz / d, d, ha);
  if (f.stop < d - .3) return false; // (into the ground before the body's edge)
  const y = this.flightAt(f, d) + TERRAIN.roundHeight;
  return y >= hb - .1 && y <= hb + TERRAIN.bodyTop;
 }
}

// The authored steep edges, as thin boxes (retaining walls: they stop bodies
// and robots; the ground decides sight and shots):
//  - every "cliff" side of every level, standing outside the level's edge
//    over the drop, deep enough to cover the face however tall, with a gap
//    wherever one of the spec's paths crosses it (the path's width and half
//    its shoulders: a lane, a step flight or a gully goes through the wall;
//    the path pulls the ground there to its own height, and terrain-bake.js
//    eases what is left of the drop, so nothing in the gap is steep);
//  - every segment of the spec's own `edges` polylines (a ramp's side
//    walls), centred on the line.
// Each runs a little past both ends so corners close.
function levelEdges(spec, ground) {
 const edges = [];
 const add = (ax, az, bx, bz, nx, nz, centred, drop, steep, extend, top) => {
  const length = Math.hypot(bx - ax, bz - az); if (length < 1e-6) return;
  // (face: how far out the drop itself reaches; depth: the collider, deeper.)
  const face = drop / steep, depth = Math.max(.6, face + .3);
  edges.push({ ax, az, bx, bz, ux: (bx - ax) / length, uz: (bz - az) / length, nx, nz, length, drop, face, depth, extend, centred, top });
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
   // The pieces of the side between path crossings (metres along it), and
   // on a maxSlope map only where the drop is a real step (wallRuns).
   const extend = level.edgeExtend ?? .35, gaps = pathGaps(spec, ax, az, bx, bz, length);
   const dropAt = (d, out) => { const px = ax + (bx - ax) * d / length + nx * out, pz = az + (bz - az) * d / length + nz * out; return level.lower ? ground.heightAt(px, pz) - level.h : level.h - ground.heightAt(px, pz); };
   let from = 0;
   for (const [g0, g1] of [...gaps, [length + extend * 2, Infinity]]) {
    const piece = [from === 0 ? 0 : from, g1 === Infinity ? length : g0];
    from = g1;
    for (const [r0, r1] of wallRuns(spec, piece[0], piece[1], d => dropAt(d, .5))) {
     // A piece's box runs `extend` past its ends: at a corner of the level
     // (where the next side's wall meets it), not where a gap or a fading
     // drop ends it.
     const s0 = r0 === 0 ? 0 : r0 + extend, s1 = r1 === length ? length : r1 - extend;
     // (A stub between a gap and a corner: the next side's piece covers it.)
     if (s1 - s0 < .3) continue;
     // The drop: from the level's height to the ground just beyond the face.
     let drop = 0;
     for (let k = 0; k <= 8; k++) drop = Math.max(drop, dropAt(s0 + (s1 - s0) * k / 8, 1.5));
     add(ax + (bx - ax) * s0 / length, az + (bz - az) * s0 / length, ax + (bx - ax) * s1 / length, az + (bz - az) * s1 / length, nx, nz, false, drop, steep, extend, level.lower ? null : level.h);
    }
   }
  }
 }
 for (const line of spec.edges || []) {
  const pts = line.points, extend = line.extend ?? .35;
  for (let i = 1; i < pts.length; i++) {
   const [ax, az] = pts[i - 1], [bx, bz] = pts[i], length = Math.hypot(bx - ax, bz - az); if (length < 1e-6) continue;
   const nx = (bz - az) / length, nz = -(bx - ax) / length;
   const dropAt = d => { const px = ax + (bx - ax) * d / length, pz = az + (bz - az) * d / length; return Math.abs(ground.heightAt(px + nx, pz + nz) - ground.heightAt(px - nx, pz - nz)); };
   for (const [r0, r1] of wallRuns(spec, 0, length, dropAt)) {
    // (Polyline joints and ends keep their overlap; a faded end does not.)
    const s0 = r0 === 0 ? 0 : r0 + extend, s1 = r1 === length ? length : r1 - extend;
    if (s1 - s0 < .3) continue;
    let drop = 0;
    for (let k = 0; k <= 8; k++) drop = Math.max(drop, dropAt(s0 + (s1 - s0) * k / 8));
    add(ax + (bx - ax) * s0 / length, az + (bz - az) * s0 / length, ax + (bx - ax) * s1 / length, az + (bz - az) * s1 / length, nx, nz, true, drop, line.grade || 8, extend, null);
   }
  }
 }
 return edges;
}

// ---- Water ----
// Each channel of the spec's `water` (points [x, z, half, bed]) as the band
// its water fills: out to half + bank from its line (where its banks top
// out; the water itself reaches as far as the ground is below its level).
// The water stands at `surface.up` upstream of the dam at x `damX` and
// `down` below it; `flow` -1: it runs toward -x (1: toward +x). Nothing
// keeps a body out (owner, 2026-09-26: wade anywhere); its depth slows it
// (simulation.js wadeFactor).
function waterBands(spec) {
 return (spec.water || []).map(w => {
  const pts = w.points, bank = w.bank ?? 1, s = w.surface || {};
  const up = s.up ?? w.level ?? 0, down = s.down ?? up;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) { const r = (p[2] ?? w.half) + bank; x0 = Math.min(x0, p[0] - r); x1 = Math.max(x1, p[0] + r); z0 = Math.min(z0, p[1] - r); z1 = Math.max(z1, p[1] + r); }
  return { pts, half: w.half, bank, x0, x1, z0, z1, up, down, damX: s.damX ?? Infinity, flow: s.flow ?? 1 };
 });
}
// The water's level on a band at x: `up` on the dam's upstream side.
const levelOf = (w, x) => (x - w.damX) * w.flow < 0 ? w.up : w.down;
// The nearest point of a band's line to (x, z): how far outside its banks'
// tops that is (negative: over the channel), and the way the line runs there.
const near = { out: 0, ux: 1, uz: 0 };
function nearBand(w, x, z) {
 let best = Infinity;
 for (let i = 1; i < w.pts.length; i++) {
  const a = w.pts[i - 1], b = w.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
  const half = (a[2] ?? w.half) + ((b[2] ?? w.half) - (a[2] ?? w.half)) * t;
  const d = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z) - half - w.bank;
  if (d < best) { best = d; const l = Math.sqrt(l2) || 1; near.ux = dx / l; near.uz = dz / l; }
 }
 near.out = best;
 return near;
}

// On a map with `maxSlope` (terrain-bake.js eases whatever step a wall does
// not hold), a wall stands only where its drop is a real step: at least
// WALL_MIN_DROP. Where a wall fades out (a gentle side wrapping round a
// level's corner, the shallow top of a cutting) it ends, and the ground there
// is a short ramp a body can step up or round (owner, 2026-09-26: no
// invisible cut-off at a wall's ends). The runs [from, to] of [d0, d1] (metres
// along the edge) where dropAt(d) holds; without maxSlope, all of it.
export const WALL_MIN_DROP = .45;
function wallRuns(spec, d0, d1, dropAt) {
 if (!spec.maxSlope) return [[d0, d1]];
 const runs = [], n = Math.max(1, Math.ceil((d1 - d0) / .25));
 let start = null;
 for (let k = 0; k <= n; k++) {
  const d = d0 + (d1 - d0) * k / n, walled = dropAt(d) >= WALL_MIN_DROP;
  if (walled && start === null) start = k === 0 ? d0 : d - (d1 - d0) / n / 2;
  if (!walled && start !== null) { runs.push([start, d - (d1 - d0) / n / 2]); start = null; }
 }
 if (start !== null) runs.push([start, d1]);
 return runs;
}

// Where the spec's paths cross a level's side from (ax, az) to (bx, bz):
// merged [from, to] metres along it, each the path's width and half its
// shoulders across the side (wider where it crosses at a slant).
function pathGaps(spec, ax, az, bx, bz, length) {
 const gaps = [], ux = (bx - ax) / length, uz = (bz - az) / length;
 for (const path of spec.paths || []) {
  const pts = path.points;
  for (let i = 1; i < pts.length; i++) {
   const px = pts[i - 1][0], pz = pts[i - 1][1], qx = pts[i][0], qz = pts[i][1], dx = qx - px, dz = qz - pz;
   const denom = ux * dz - uz * dx; if (Math.abs(denom) < 1e-9) continue;
   // Side: a + u s; path segment: p + d t.
   const s = ((px - ax) * dz - (pz - az) * dx) / denom, t = ((px - ax) * uz - (pz - az) * ux) / denom;
   // (Crossings of this side itself, or within half a metre of its ends.)
   if (t < 0 || t > 1 || s < -.5 || s > length + .5) continue;
   const sin = Math.abs(denom) / Math.hypot(dx, dz), reach = path.width / 2 + (path.shoulder || 0) / 2, half = Math.min(reach * 4, reach / Math.max(sin, .25));
   gaps.push([s - half, s + half]);
  }
 }
 gaps.sort((a, b) => a[0] - b[0]);
 const merged = [];
 for (const g of gaps) { const last = merged[merged.length - 1]; if (last && g[0] <= last[1]) last[1] = Math.max(last[1], g[1]); else merged.push(g.slice()); }
 return merged;
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
  angle, localW: along, localD: across, height: Math.max(.5, e.drop), playerOnly: true, terrainEdge: true, ...(e.water ? { water: true } : {}) };
}

// The ground of a map from its prebaked grid (see map-kit.js groundFor).
export function groundFromBaked(baked, spec) {
 return new Ground({ ...baked, heights: decodeHeights(baked.data, baked.cols, baked.rows) }, spec);
}
