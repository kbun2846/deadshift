// Where a robot can walk, and how it gets there.
//
// The map is laid out as a grid of CELL-metre squares. A square is open when
// a body (RULES.radius, plus a little room) standing at its centre overlaps
// no collider and stays inside the playable area: the same round-body-against-
// rotated-box test the movement code uses (Simulation.movePlayer), so the
// grid never promises a spot the body cannot stand on. Floor clutter a player
// walks over (walkOver) is ignored, as it is when walking.
//
// On top of that:
//  - clearance: how many squares to the nearest wall, from one flood out of
//    every blocked square. Paths pay a little extra next to walls, so a robot
//    walks down the middle of a street and through the middle of a doorway
//    instead of scraping every corner.
//  - path(): A* over the eight neighbours (no cutting a blocked corner), with
//    that wall cost, then pulled tight: every waypoint that can be skipped
//    with a straight, open walk is dropped, so the robot walks the way a
//    person would, corner to corner, not square to square.
//  - flood(): distances from one spot to every square within a range (for
//    choosing cover and flanking spots by real walking distance, not by the
//    straight line through a wall).
// It rebuilds itself when the colliders change (a prop broken or put back).
// No DOM, no three.js.
import { RULES, WADE } from '../config/gameplay.js';
import { isPlayable } from '../playable-area.js';
import { groundFor } from '../map-kit.js';

export const CELL = .5;
const ROOM = .08; // extra clearance round the body, metres

export function bodyBlocked(colliders, x, z, r) {
 for (const b of colliders) {
  if (b.walkOver) continue;
  if (Math.abs(x - b.x) > b.w / 2 + r || Math.abs(z - b.z) > b.d / 2 + r) continue;
  const angle = b.localW !== undefined ? (b.angle || 0) : 0, c = Math.cos(angle), s = Math.sin(angle);
  const px = (x - b.x) * c - (z - b.z) * s, pz = (x - b.x) * s + (z - b.z) * c;
  const hw = (b.localW ?? b.w) / 2, hd = (b.localD ?? b.d) / 2;
  const cx = Math.max(-hw, Math.min(hw, px)), cz = Math.max(-hd, Math.min(hd, pz));
  if ((px - cx) ** 2 + (pz - cz) ** 2 < r * r) return true;
 }
 return false;
}

// A small binary heap of cell indices keyed by a Float64Array of scores.
class Heap {
 constructor(score) { this.items = []; this.score = score; }
 get size() { return this.items.length; }
 push(i) { const a = this.items, s = this.score; a.push(i); let k = a.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (s[a[p]] <= s[a[k]]) break; [a[p], a[k]] = [a[k], a[p]]; k = p; } }
 pop() {
  const a = this.items, s = this.score, top = a[0], last = a.pop();
  if (a.length) { a[0] = last; let k = 0; for (;;) { const l = k * 2 + 1, r = l + 1; let m = k; if (l < a.length && s[a[l]] < s[a[m]]) m = l; if (r < a.length && s[a[r]] < s[a[m]]) m = r; if (m === k) break; [a[m], a[k]] = [a[k], a[m]]; k = m; } }
  return top;
 }
}

const STEPS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

export class NavGrid {
 constructor(map, colliders, radius = RULES.radius) {
  this.map = map; this.radius = radius + ROOM;
  this.cols = Math.ceil(map.width / CELL); this.rows = Math.ceil(map.depth / CELL);
  this.x0 = -map.width / 2; this.z0 = -map.depth / 2;
  const n = this.cols * this.rows;
  this.open = new Uint8Array(n); this.clearance = new Uint8Array(n);
  this.g = new Float64Array(n); this.f = new Float64Array(n); this.from = new Int32Array(n); this.stamp = new Uint32Array(n); this.closed = new Uint32Array(n); this.search = 0;
  // Hills: a steep square costs a little more to cross (up to +50% at a 30%
  // slope), so robots take the easier way round when it is not much longer.
  // None on a flat map (so its paths are exactly as they were).
  const ground = groundFor(map);
  if (!ground.flat) {
   const slope = this.slope = new Float32Array(n), out = { x: 0, z: 0 };
   // Wading costs too (up to double in water WADE.depth deep), so robots
   // cross by the bridges and the ford when the stream is not much shorter.
   for (let i = 0; i < n; i++) { const c = this.centre(i); ground.gradientAt(c.x, c.z, out); slope[i] = .5 * Math.min(1.5, Math.hypot(out.x, out.z) / .3) + Math.min(1, ground.waterDepthAt(c.x, c.z) / WADE.depth); }
  }
  this.build(colliders);
 }

 // --- cells ------------------------------------------------------------------
 cellOf(x, z) { const c = Math.floor((x - this.x0) / CELL), r = Math.floor((z - this.z0) / CELL); return c < 0 || r < 0 || c >= this.cols || r >= this.rows ? -1 : r * this.cols + c; }
 centre(i) { return { x: this.x0 + (i % this.cols + .5) * CELL, z: this.z0 + (Math.floor(i / this.cols) + .5) * CELL }; }
 isOpen(x, z) { const i = this.cellOf(x, z); return i >= 0 && this.open[i] === 1; }

 build(colliders) {
  this.colliders = colliders; this.count = colliders.length; this.known = new Set(colliders);
  // Playable area first (kept, for later partial updates), then every
  // collider stamped over the squares its box (grown by the body) covers.
  this.fillPlayable(this.radius);
  this.playable = this.open.slice();
  for (const b of colliders) this.block(b);
  this.flowClearance();
 }

 // The squares a collider's box, grown by the body, could reach.
 area(b) {
  const r = this.radius, reach = Math.max(b.w || 0, b.d || 0, Math.hypot(b.localW || 0, b.localD || 0)) / 2 + r;
  return [Math.max(0, Math.floor((b.x - reach - this.x0) / CELL)), Math.min(this.cols - 1, Math.floor((b.x + reach - this.x0) / CELL)),
   Math.max(0, Math.floor((b.z - reach - this.z0) / CELL)), Math.min(this.rows - 1, Math.floor((b.z + reach - this.z0) / CELL))];
 }

 block(b) {
  if (b.walkOver) return;
  const [c0, c1, r0, r1] = this.area(b), one = [b], { cols, open } = this;
  for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
   const i = row * cols + col; if (!open[i]) continue;
   if (bodyBlocked(one, this.x0 + (col + .5) * CELL, this.z0 + (row + .5) * CELL, this.radius)) open[i] = 0;
  }
 }

 // Clearance: squares to the nearest blocked one (capped at CAP), by a
 // breadth-first flood out of every blocked square. Given a window (after a
 // prop broke), only that window and a CAP-wide margin round it are worked
 // out again, seeded from the unchanged squares just outside.
 flowClearance(c0 = 0, c1 = this.cols - 1, r0 = 0, r1 = this.rows - 1) {
  const CAP = 12, { cols, rows, open } = this, cl = this.clearance;
  c0 = Math.max(0, c0 - CAP - 1); c1 = Math.min(cols - 1, c1 + CAP + 1); r0 = Math.max(0, r0 - CAP - 1); r1 = Math.min(rows - 1, r1 + CAP + 1);
  const buckets = Array.from({ length: CAP + 1 }, () => []);
  for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
   const i = row * cols + col;
   if (!open[i]) { cl[i] = 0; buckets[0].push(i); } else cl[i] = 255;
  }
  // The ring just outside the window keeps its values and seeds the flood.
  const seed = (col, row) => { if (col < 0 || row < 0 || col >= cols || row >= rows) return; const i = row * cols + col, v = cl[i]; if (v < CAP) buckets[v].push(i); };
  if (r0 > 0) for (let col = c0; col <= c1; col++) seed(col, r0 - 1);
  if (r1 < rows - 1) for (let col = c0; col <= c1; col++) seed(col, r1 + 1);
  if (c0 > 0) for (let row = r0; row <= r1; row++) seed(c0 - 1, row);
  if (c1 < cols - 1) for (let row = r0; row <= r1; row++) seed(c1 + 1, row);
  for (let d = 0; d < CAP; d++) {
   const list = buckets[d], next = buckets[d + 1];
   for (let k = 0; k < list.length; k++) {
    const i = list[k]; if (cl[i] !== d) continue;
    const col = i % cols, row = (i - col) / cols;
    if (col > c0 && cl[i - 1] > d + 1) { cl[i - 1] = d + 1; next.push(i - 1); }
    if (col < c1 && cl[i + 1] > d + 1) { cl[i + 1] = d + 1; next.push(i + 1); }
    if (row > r0 && cl[i - cols] > d + 1) { cl[i - cols] = d + 1; next.push(i - cols); }
    if (row < r1 && cl[i + cols] > d + 1) { cl[i + cols] = d + 1; next.push(i + cols); }
   }
  }
 }

 // The playable area (isPlayable with the body's margin), filled a row at a
 // time: where each row crosses the outline, then the squares within the
 // margin of any edge taken back out. The same answer as asking isPlayable
 // for every square, a hundred times faster (a map is ~200 000 squares).
 fillPlayable(r) {
  const { cols, rows, open, map } = this, pts = map.playableArea;
  if (!pts) {
   for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x = this.x0 + (col + .5) * CELL, z = this.z0 + (row + .5) * CELL;
    open[row * cols + col] = isPlayable(map, x, z, r) ? 1 : 0;
   }
   return;
  }
  open.fill(0);
  const xs = [];
  for (let row = 0; row < rows; row++) {
   const z = this.z0 + (row + .5) * CELL; xs.length = 0;
   for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, az] = pts[j], [bx, bz] = pts[i];
    if ((az > z) !== (bz > z)) xs.push((bx - ax) * (z - az) / (bz - az) + ax);
   }
   xs.sort((a, b) => a - b);
   for (let k = 0; k + 1 < xs.length; k += 2) {
    const c0 = Math.max(0, Math.ceil((xs[k] - this.x0) / CELL - .5)), c1 = Math.min(cols - 1, Math.floor((xs[k + 1] - this.x0) / CELL - .5));
    for (let col = c0; col <= c1; col++) open[row * cols + col] = 1;
   }
  }
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
   const [ax, az] = pts[j], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
   const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - this.x0) / CELL)), c1 = Math.min(cols - 1, Math.floor((Math.max(ax, bx) + r - this.x0) / CELL));
   const r0 = Math.max(0, Math.floor((Math.min(az, bz) - r - this.z0) / CELL)), r1 = Math.min(rows - 1, Math.floor((Math.max(az, bz) + r - this.z0) / CELL));
   for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
    const x = this.x0 + (col + .5) * CELL, z = this.z0 + (row + .5) * CELL;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
    if ((x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2 < r * r) open[row * cols + col] = 0;
   }
  }
 }

 // Rebuilt when a prop broke or came back (the collider list changes).
 refresh(colliders) {
  if (colliders === this.colliders && colliders.length === this.count) return;
  // Only what changed: a prop broken (its boxes gone) or put back (boxes
  // added). The squares under a removed box are worked out again from the
  // playable area and whatever else still stands there.
  const now = new Set(colliders), removed = [...this.known].filter(b => !now.has(b)), added = colliders.filter(b => !this.known.has(b));
  if (removed.length + added.length > 40) { this.build(colliders); return; }
  const { cols, open, playable } = this;
  for (const b of removed) {
   if (b.walkOver) continue;
   const [c0, c1, r0, r1] = this.area(b);
   const x0 = this.x0 + c0 * CELL - 1, x1 = this.x0 + (c1 + 1) * CELL + 1, z0 = this.z0 + r0 * CELL - 1, z1 = this.z0 + (r1 + 1) * CELL + 1;
   const near = colliders.filter(o => !o.walkOver && o.x + Math.max(o.w, o.d) > x0 - 3 && o.x - Math.max(o.w, o.d) < x1 + 3 && o.z + Math.max(o.w, o.d) > z0 - 3 && o.z - Math.max(o.w, o.d) < z1 + 3);
   for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
    const i = row * cols + col;
    open[i] = playable[i] && !bodyBlocked(near, this.x0 + (col + .5) * CELL, this.z0 + (row + .5) * CELL, this.radius) ? 1 : 0;
   }
  }
  for (const b of added) this.block(b);
  this.colliders = colliders; this.count = colliders.length; this.known = now;
  for (const b of [...removed, ...added]) { const [c0, c1, r0, r1] = this.area(b); this.flowClearance(c0, c1, r0, r1); }
 }

 // Extra cost for a square next to a wall: nothing from three squares out.
 wallCost(i) { const c = this.clearance[i]; return c >= 4 ? 0 : (4 - c) * .45; }

 // The nearest open square to (x, z), searching outward (a body pushed against
 // a wall, or a goal inside furniture).
 nearestOpen(x, z, maxRing = 8) {
  const i = this.cellOf(x, z); if (i >= 0 && this.open[i]) return i;
  const col = Math.floor((x - this.x0) / CELL), row = Math.floor((z - this.z0) / CELL);
  let best = -1, bestD = Infinity;
  for (let ring = 1; ring <= maxRing && best < 0; ring++)
   for (let dr = -ring; dr <= ring; dr++) for (let dc = -ring; dc <= ring; dc++) {
    if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
    const c = col + dc, r = row + dr; if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
    const j = r * this.cols + c; if (!this.open[j]) continue;
    const d = dc * dc + dr * dr; if (d < bestD) { bestD = d; best = j; }
   }
  return best;
 }

 // A straight walk from a to b stays on open squares (sampled every third of
 // a square, so no corner is clipped).
 walkable(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(d / (CELL / 3)));
  for (let k = 0; k <= steps; k++) { const t = k / steps; if (!this.isOpen(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
  return true;
 }

 // A* from (ax, az) to (bx, bz): [{x, z}, ...] ending at the goal (or at the
 // reachable square nearest to it), or null when there is no way at all.
 // `limit` caps the squares searched, so a hopeless search stays cheap.
 path(ax, az, bx, bz, limit = 60000) {
  const start = this.nearestOpen(ax, az), goal = this.nearestOpen(bx, bz);
  if (start < 0 || goal < 0) return null;
  const { cols, g, f, from, stamp, closed } = this, run = ++this.search;
  const gc = goal % cols, gr = (goal / cols) | 0;
  const h = i => { const dc = Math.abs(i % cols - gc), dr = Math.abs(((i / cols) | 0) - gr); return (Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr)); };
  const heap = new Heap(f);
  g[start] = 0; f[start] = h(start); from[start] = -1; stamp[start] = run; heap.push(start);
  let best = start, bestH = f[start], visited = 0;
  while (heap.size) {
   const i = heap.pop();
   if (closed[i] === run) continue; closed[i] = run;
   if (i === goal) { best = i; break; }
   const hi = f[i] - g[i]; if (hi < bestH) { bestH = hi; best = i; }
   if (++visited > limit) break;
   const col = i % cols, row = (i / cols) | 0;
   for (const [dc, dr, cost] of STEPS) {
    const c = col + dc, r = row + dr; if (c < 0 || r < 0 || c >= cols || r >= this.rows) continue;
    const j = r * cols + c; if (!this.open[j] || closed[j] === run) continue;
    // No squeezing diagonally between two blocked squares.
    if (dc && dr && (!this.open[row * cols + c] || !this.open[r * cols + col])) continue;
    const next = g[i] + cost * (1 + this.wallCost(j) + (this.slope ? this.slope[j] : 0));
    if (stamp[j] !== run || next < g[j]) { stamp[j] = run; g[j] = next; f[j] = next + h(j); from[j] = i; heap.push(j); }
   }
  }
  const cells = []; for (let i = best; i >= 0; i = from[i]) { cells.push(i); if (i === start) break; }
  cells.reverse();
  const points = cells.map(i => this.centre(i));
  // The real goal when it is open (not its square's centre).
  if (best === goal && this.isOpen(bx, bz)) points[points.length - 1] = { x: bx, z: bz };
  return this.smooth({ x: ax, z: az }, points);
 }

 // Pulled tight: from each kept point, jump to the furthest later point that
 // can be walked to in a straight line.
 smooth(from, points) {
  if (points.length <= 1) return points;
  const out = []; let anchor = from, i = 0;
  while (i < points.length) {
   let j = points.length - 1;
   while (j > i && !this.walkable(anchor.x, anchor.z, points[j].x, points[j].z)) j--;
   out.push(points[j]); anchor = points[j]; i = j + 1;
  }
  return out;
 }

 // Walking distance (metres) from (x, z) to every square within `range`:
 // a Map of cell index -> distance.
 flood(x, z, range = 14) {
  const start = this.nearestOpen(x, z); const out = new Map(); if (start < 0) return out;
  const { cols, g, stamp, closed } = this, run = ++this.search, heap = new Heap(g);
  g[start] = 0; stamp[start] = run; heap.push(start);
  while (heap.size) {
   const i = heap.pop(); if (closed[i] === run) continue; closed[i] = run;
   const d = g[i] * CELL; if (d > range) continue; out.set(i, d);
   const col = i % cols, row = (i / cols) | 0;
   for (const [dc, dr, cost] of STEPS) {
    const c = col + dc, r = row + dr; if (c < 0 || r < 0 || c >= cols || r >= this.rows) continue;
    const j = r * cols + c; if (!this.open[j] || closed[j] === run) continue;
    if (dc && dr && (!this.open[row * cols + c] || !this.open[r * cols + col])) continue;
    const next = g[i] + cost; if (stamp[j] !== run || next < g[j]) { stamp[j] = run; g[j] = next; heap.push(j); }
   }
  }
  return out;
 }
}
