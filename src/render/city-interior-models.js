// City interiors' models (Lumen stage 4): every piece of a building's
// furniture list (world/city-interiors.js cityPieces, the list the colliders
// come from) drawn low-poly and flat-shaded from boxes, cylinders and flats in
// vertex colours, merged into ONE mesh per building on the shells' own
// material with the shells' attributes (render/city-shells.js): cityCut 0
// (the cut never moves it), cityGlow for the lit parts (fridges, screens,
// pods, fittings, the club's floor, the soft pools of light the fittings cast
// on each room's own floor). Plus one mesh of fine detail (stock on shelves,
// glasses, litter, wires, handles), shown from Balanced up (INTERIOR_LOOK).
// The shells call the builder for each building after its floors
// (render/city-registry.js registerCityInteriors); `group` is the building's
// interior group, shown only while you are inside or by a door. No real
// lights (the light pool is fixed): lit parts glow their own colour. Built
// once at load (about a sixth of the shells' own build); nothing per frame.
//
// A kind's model is CITY_MODELS[kind](m, p) (coded below) or its `parts` (a
// district file's data-made kind; world/city-interiors.js's header). `m` draws
// in the piece's own frame: origin at its footprint's centre on the floor, x
// across (w), z toward its front (d, +z), y up; `p` is the resolved piece
// (w, d, h, params: the data object, rand(): its own seeded random).
import * as THREE from 'three';
import { registerCityInteriors, registerCitySystem } from './city-registry.js';
import { CITY_PIECES, cityPieces } from '../world/city-interiors.js';

export const INTERIOR_LOOK = Object.freeze({
  fineFrom: ['balanced', 'quality', 'extreme'], // presets that show the fine-detail mesh
  glow: 1.8,        // a lit part's default glow (times its own colour)
  fitting: 2.6,     // ceiling fittings
  screen: 1.5,      // screens and panels
  floorY: .036,     // flats (stains, papers, pools) sit this far above the floor...
  roomFloor: .024,  // ...over the room's own floor (the shells' floor cap is at .015)
  pool: [.06, .1, .15], // a fitting's pool of light on the floor: the light its rings add (times the fitting's colour), outer to inner
});

// --- Geometry --------------------------------------------------------------
class Buf {
  constructor(n) { this.a = new Float32Array(n); this.n = 0; }
  need(k) { if (this.n + k > this.a.length) { const b = new Float32Array(Math.max(this.a.length * 2, this.n + k)); b.set(this.a.subarray(0, this.n)); this.a = b; } }
  view() { return this.a.subarray(0, this.n); }
}
// One mesh's attributes, as render/city-shells.js meshFrom reads them (it
// copies them, so two scratch soups serve every building in turn).
class Soup {
  constructor() { this.p = new Buf(9 * 8192); this.nm = new Buf(9 * 8192); this.c = new Buf(9 * 8192); this.g = new Buf(9 * 8192); this.k = new Buf(3 * 8192); this.t = new Buf(6 * 8192); }
  reset() { this.p.n = this.nm.n = this.c.n = this.g.n = this.k.n = this.t.n = 0; return this; }
  get count() { return this.p.n / 3; }
  get position() { return this.p.view(); } get normal() { return this.nm.view(); } get color() { return this.c.view(); }
  get glow() { return this.g.view(); } get cut() { return this.k.view(); } get at() { return this.t.view(); }
}
let SCRATCH = null; // [base, fine], made on first use

const colours = new Map();
function rgb(hex) {
  let c = colours.get(hex);
  if (!c) { const k = new THREE.Color(hex); c = [k.r, k.g, k.b]; colours.set(hex, c); }
  return c;
}
const _c = [0, 0, 0];
const shade = (col, f) => { const c = typeof col === 'string' ? rgb(col) : col; return [c[0] * f, c[1] * f, c[2] * f]; };

// Rotation (row-major 3x3) for x, y, z turns applied z, then x, then y
// (Ry * Rx * Rz), written into `o`.
function rotInto(o, rx = 0, ry = 0, rz = 0) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  // Rx * Rz
  const a0 = cz, a1 = -sz, a2 = 0, a3 = cx * sz, a4 = cx * cz, a5 = -sx, a6 = sx * sz, a7 = sx * cz, a8 = cx;
  o[0] = cy * a0 + sy * a6; o[1] = cy * a1 + sy * a7; o[2] = cy * a2 + sy * a8;
  o[3] = a3; o[4] = a4; o[5] = a5;
  o[6] = -sy * a0 + cy * a6; o[7] = -sy * a1 + cy * a7; o[8] = -sy * a2 + cy * a8;
  return o;
}
const HEXA_FACES = [[4, 7, 6, 5], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [0, 3, 2, 1]];
const BOX = [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]];
// Its faces, each counter-clockwise seen from outside: top, bottom, front
// (+z), back, right (+x), left; the axis (column of the turn) and sign of each normal.
const BOX_FACES = [[4, 7, 6, 5], [0, 1, 2, 3], [3, 2, 6, 7], [1, 0, 4, 5], [2, 1, 5, 6], [0, 3, 7, 4]];
const BOX_AXIS = [1, 1, 2, 2, 0, 0], BOX_SIGN = [1, -1, 1, -1, 1, -1];
const NOGLOW = [0, 0, 0];

// The maker: draws parts in a piece's frame into the building's two soups.
// Built for speed (every building at load): scratch buffers, no per-vertex
// allocation.
class Maker {
  constructor(stamp) {
    SCRATCH ||= [new Soup(), new Soup()];
    this.base = SCRATCH[0].reset(); this.fine = SCRATCH[1].reset(); this.stamp = stamp; this.tris = 0;
    this.frames = Array.from({ length: 12 }, () => ({ r: new Float64Array(9), t: new Float64Array(3) })); this.depth = 0;
    this.L = new Float64Array(3 * 64); this.W = new Float64Array(3 * 64); this.R = new Float64Array(9); this.A = new Float64Array(9); this.g3 = [0, 0, 0];
  }
  // The piece's frame: at (x, z) turned by `angle` (rotation.y).
  piece(x, z, angle) { this.depth = 0; const f = this.frames[0]; rotInto(f.r, 0, angle, 0); f.t[0] = x; f.t[1] = 0; f.t[2] = z; }
  // A nested frame: parts drawn inside `fn` are moved by (tx, ty, tz) and turned.
  group(tx, ty, tz, rx, ry, rz, fn) {
    const top = this.frames[this.depth], next = this.frames[++this.depth], R = rotInto(this.R, rx, ry, rz), a = top.r;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) next.r[i * 3 + j] = a[i * 3] * R[j] + a[i * 3 + 1] * R[3 + j] + a[i * 3 + 2] * R[6 + j];
    next.t[0] = top.t[0] + a[0] * tx + a[1] * ty + a[2] * tz; next.t[1] = top.t[1] + a[3] * tx + a[4] * ty + a[5] * tz; next.t[2] = top.t[2] + a[6] * tx + a[7] * ty + a[8] * tz;
    fn(); this.depth--;
  }
  // L[0 .. 3n) (the current frame) -> W (world).
  toWorld(n) {
    const f = this.frames[this.depth], r = f.r, t = f.t, L = this.L, W = this.W;
    for (let i = 0; i < n * 3; i += 3) { const x = L[i], y = L[i + 1], z = L[i + 2]; W[i] = t[0] + r[0] * x + r[1] * y + r[2] * z; W[i + 1] = t[1] + r[3] * x + r[4] * y + r[5] * z; W[i + 2] = t[2] + r[6] * x + r[7] * y + r[8] * z; }
  }
  glowOf(glow) { if (!glow) return NOGLOW; if (typeof glow === 'number') { const g = this.g3; g[0] = g[1] = g[2] = glow; return g; } return glow; }
  // Triangles from W points (indices, in order round a flat face), normal given.
  emit(idx, n, nx, ny, nz, c, g, fine) {
    const s = fine ? this.fine : this.base, W = this.W, k = n - 2;
    s.p.need(9 * k); s.nm.need(9 * k); s.c.need(9 * k); s.g.need(9 * k); s.k.need(3 * k); s.t.need(6 * k);
    const P = s.p.a, N = s.nm.a, C = s.c.a, G = s.g.a, K = s.k.a, T = s.t.a;
    for (let i = 1; i + 1 < n; i++) for (let v = 0; v < 3; v++) {
      const q = 3 * idx[v === 0 ? 0 : v === 1 ? i : i + 1];
      P[s.p.n++] = W[q]; P[s.p.n++] = W[q + 1]; P[s.p.n++] = W[q + 2];
      N[s.nm.n++] = nx; N[s.nm.n++] = ny; N[s.nm.n++] = nz;
      C[s.c.n++] = c[0]; C[s.c.n++] = c[1]; C[s.c.n++] = c[2];
      G[s.g.n++] = g[0]; G[s.g.n++] = g[1]; G[s.g.n++] = g[2];
      K[s.k.n++] = this.stamp; T[s.t.n++] = W[q]; T[s.t.n++] = W[q + 2];
    }
    this.tris += k;
  }
  // A face through W points `idx` in order; its normal by Newell's method.
  // With (mx, my, mz) given, it is wound to face away from that point.
  polyW(idx, n, col, glow, fine, mx, my, mz) {
    const W = this.W; let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < n; i++) { const a = 3 * idx[i], b = 3 * idx[(i + 1) % n]; nx += (W[a + 1] - W[b + 1]) * (W[a + 2] + W[b + 2]); ny += (W[a + 2] - W[b + 2]) * (W[a] + W[b]); nz += (W[a] - W[b]) * (W[a + 1] + W[b + 1]); }
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz); if (l < 1e-12) return;
    nx /= l; ny /= l; nz /= l;
    const c = typeof col === 'string' ? rgb(col) : col, g = this.glowOf(glow);
    if (mx !== undefined) {
      const q = 3 * idx[0];
      if (nx * (W[q] - mx) + ny * (W[q + 1] - my) + nz * (W[q + 2] - mz) < 0) { const rev = this.rev || (this.rev = new Array(8)); for (let i = 0; i < n; i++) rev[i] = idx[n - 1 - i]; this.emit(rev, n, -nx, -ny, -nz, c, g, fine); return; }
    }
    this.emit(idx, n, nx, ny, nz, c, g, fine);
  }
  // One flat face from points (arrays [x, y, z] in the current frame), wound as given (its front: counter-clockwise).
  face(pts, col, glow, fine) {
    const L = this.L; for (let i = 0; i < pts.length; i++) { L[3 * i] = pts[i][0]; L[3 * i + 1] = pts[i][1]; L[3 * i + 2] = pts[i][2]; }
    this.toWorld(pts.length); const idx = this.seq || (this.seq = Array.from({ length: 64 }, (_, i) => i));
    this.polyW(idx, pts.length, col, glow, fine);
  }
  // The six-faced solid now in L[0..24) (bottom 0..3, top 4..7, each -x-z,
  // +x-z, +x+z, -x+z): faces wound outward, the bottom only if `bottom`.
  // o.top / o.front recolour those faces; o.glowFace 'top' | 'front' lights only that one.
  solid(col, o, bottom) {
    this.toWorld(8);
    const W = this.W; let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < 24; i += 3) { mx += W[i]; my += W[i + 1]; mz += W[i + 2]; }
    mx /= 8; my /= 8; mz /= 8;
    const g = o.glow, gf = o.glowFace;
    for (let i = 0; i < (bottom ? 6 : 5); i++) {
      const isTop = i === 0, isFront = i === 3;
      const c = isTop ? (o.top ?? col) : isFront && o.front ? o.front : (o.side ?? col);
      const gl = gf === undefined ? g : (gf === 'top' && isTop) || (gf === 'front' && isFront) ? g : null;
      this.polyW(HEXA_FACES[i], 4, c, gl, o.fine, mx, my, mz);
    }
  }
  hexa(c, col, o = {}) { const L = this.L; for (let i = 0; i < 8; i++) { L[3 * i] = c[i][0]; L[3 * i + 1] = c[i][1]; L[3 * i + 2] = c[i][2]; } this.solid(col, o, !!o.bottom); }
  // A box: centre (x, z), bottom y, size w (x) h (y) d (z), turned about its
  // own middle by o.rx / o.ry / o.rz; o.glow lights it (o.glowFace 'top' or
  // 'front' lights one face only); o.front / o.top recolour those faces.
  box(x, y, z, w, h, d, col, o = EMPTY) {
    const hw = w / 2, hh = h / 2, hd = d / 2, L = this.L, turned = o.rx || o.ry || o.rz, R = turned ? rotInto(this.R, o.rx, o.ry, o.rz) : null;
    for (let i = 0; i < 8; i++) {
      const px = BOX[i][0] * hw, py = BOX[i][1] * hh, pz = BOX[i][2] * hd;
      if (R) { L[3 * i] = x + R[0] * px + R[1] * py + R[2] * pz; L[3 * i + 1] = y + hh + R[3] * px + R[4] * py + R[5] * pz; L[3 * i + 2] = z + R[6] * px + R[7] * py + R[8] * pz; }
      else { L[3 * i] = x + px; L[3 * i + 1] = y + hh + py; L[3 * i + 2] = z + pz; }
    }
    this.toWorld(8);
    // The box's axes in the world (the frame's turn times its own): each
    // face's normal, its winding known (BOX_FACES go round counter-clockwise
    // seen from outside), so no normal is worked out per face.
    const F = this.frames[this.depth].r, A = this.A;
    if (R) { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[i * 3 + j] = F[i * 3] * R[j] + F[i * 3 + 1] * R[3 + j] + F[i * 3 + 2] * R[6 + j]; }
    else for (let i = 0; i < 9; i++) A[i] = F[i];
    const g = this.glowOf(o.glow), none = NOGLOW, gf = o.glowFace, bottom = o.bottom ?? !!turned;
    const c = typeof col === 'string' ? rgb(col) : col, top = o.top ? (typeof o.top === 'string' ? rgb(o.top) : o.top) : c, front = o.front ? (typeof o.front === 'string' ? rgb(o.front) : o.front) : c;
    for (let f = 0; f < 6; f++) {
      if (f === 1 && !bottom) continue;
      const ax = BOX_AXIS[f], s = BOX_SIGN[f];
      const gl = gf === undefined ? g : (gf === 'top' && f === 0) || (gf === 'front' && f === 2) ? g : none;
      this.emit(BOX_FACES[f], 4, A[ax] * s, A[3 + ax] * s, A[6 + ax] * s, f === 0 ? top : f === 2 ? front : c, gl, o.fine);
    }
  }
  // A sloped block: a box whose top runs from height h0 at its back (-z) to h1 at its front (+z).
  wedge(x, y, z, w, h0, h1, d, col, o = EMPTY) {
    const hw = w / 2, hd = d / 2;
    this.hexa([[x - hw, y, z - hd], [x + hw, y, z - hd], [x + hw, y, z + hd], [x - hw, y, z + hd], [x - hw, y + h0, z - hd], [x + hw, y + h0, z - hd], [x + hw, y + h1, z + hd], [x - hw, y + h1, z + hd]], col, o);
  }
  // A tapered block: bottom w x d, top tw x td, h tall (o.shift moves the top along z).
  taper(x, y, z, w, d, tw, td, h, col, o = EMPTY) {
    const a = w / 2, b = d / 2, c = tw / 2, e = td / 2, dz = o.shift || 0;
    this.hexa([[x - a, y, z - b], [x + a, y, z - b], [x + a, y, z + b], [x - a, y, z + b], [x - c, y + h, z - e + dz], [x + c, y + h, z - e + dz], [x + c, y + h, z + e + dz], [x - c, y + h, z + e + dz]], col, o);
  }
  // An upright cylinder (o.sides, default 8; o.top a different top radius),
  // bottom y; o.rx / o.ry / o.rz turn it about its middle.
  cyl(x, y, z, r, h, col, o = EMPTY) {
    const n = Math.min(o.sides || 8, 24), r2 = o.top ?? r, hh = h / 2, turned = o.rx || o.rz || o.ry, R = turned ? rotInto(this.R, o.rx, o.ry, o.rz) : null, L = this.L;
    for (let k = 0; k < 2; k++) for (let i = 0; i < n; i++) {
      const a = (i + .5) / n * Math.PI * 2, rr = k ? r2 : r, px = Math.cos(a) * rr, py = k ? hh : -hh, pz = Math.sin(a) * rr, q = 3 * (k * n + i);
      if (R) { L[q] = x + R[0] * px + R[1] * py + R[2] * pz; L[q + 1] = y + hh + R[3] * px + R[4] * py + R[5] * pz; L[q + 2] = z + R[6] * px + R[7] * py + R[8] * pz; }
      else { L[q] = x + px; L[q + 1] = y + hh + py; L[q + 2] = z + pz; }
    }
    this.toWorld(2 * n);
    // Normals: the turn (frame times its own) of the side's direction; the
    // side quads [low i, high i, high j, low j] and the low ring face out as
    // they go, the high ring reversed.
    const F = this.frames[this.depth].r, A = this.A;
    if (R) { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[i * 3 + j] = F[i * 3] * R[j] + F[i * 3 + 1] * R[3 + j] + F[i * 3 + 2] * R[6 + j]; }
    else for (let i = 0; i < 9; i++) A[i] = F[i];
    const c = typeof col === 'string' ? rgb(col) : col, cap = o.cap ? (typeof o.cap === 'string' ? rgb(o.cap) : o.cap) : c, g = this.glowOf(o.glow);
    const quad = this.quad || (this.quad = [0, 0, 0, 0]), ring = this.ring || (this.ring = new Array(24));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = (i + 1) / n * Math.PI * 2, nx = Math.cos(a), nz = Math.sin(a);
      quad[0] = i; quad[1] = n + i; quad[2] = n + j; quad[3] = j;
      this.emit(quad, 4, A[0] * nx + A[2] * nz, A[3] * nx + A[5] * nz, A[6] * nx + A[8] * nz, c, g, o.fine);
    }
    for (let i = 0; i < n; i++) ring[i] = 2 * n - 1 - i;
    this.emit(ring, n, A[1], A[4], A[7], cap, g, o.fine);
    if (turned || o.bottom) { for (let i = 0; i < n; i++) ring[i] = i; this.emit(ring, n, -A[1], -A[4], -A[7], cap, g, o.fine); }
  }
  // A flat upward polygon in world coordinates ([[x, z], ...], convex), at height y.
  worldFlat(pts, y, col, glow, fine) {
    const n = pts.length; if (n < 3) return;
    let area = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    // (+y needs the order that turns from +z toward +x: a negative area in x, z)
    const W = this.W, idx = this.seq || (this.seq = Array.from({ length: 64 }, (_, i) => i));
    for (let i = 0; i < n; i++) { const q = area > 0 ? pts[n - 1 - i] : pts[i]; W[3 * i] = q[0]; W[3 * i + 1] = y; W[3 * i + 2] = q[1]; }
    this.emit(idx, n, 0, 1, 0, typeof col === 'string' ? rgb(col) : col, this.glowOf(glow), fine);
  }
  // A flat upward quad at height y (o.ry turns it).
  flat(x, y, z, w, d, col, o = EMPTY) {
    const c = Math.cos(o.ry || 0), s = Math.sin(o.ry || 0), hw = w / 2, hd = d / 2, L = this.L;
    const P = FLAT;
    for (let i = 0; i < 4; i++) { const a = P[i][0] * hw, b = P[i][1] * hd; L[3 * i] = x + a * c + b * s; L[3 * i + 1] = y; L[3 * i + 2] = z - a * s + b * c; }
    this.toWorld(4); this.polyW(SEQ4, 4, col, o.glow, o.fine);
  }
  // A flat quad on a vertical plane facing +z (a screen's face, a poster), centre (x, y), at depth z.
  panel(x, y, z, w, h, col, o = EMPTY) {
    const L = this.L, hw = w / 2, hh = h / 2;
    L[0] = x - hw; L[1] = y - hh; L[2] = z; L[3] = x + hw; L[4] = y - hh; L[5] = z; L[6] = x + hw; L[7] = y + hh; L[8] = z; L[9] = x - hw; L[10] = y + hh; L[11] = z;
    this.toWorld(4); this.polyW(SEQ4, 4, col, o.glow, o.fine);
  }
}
const EMPTY = Object.freeze({}), FLAT = [[-1, -1], [-1, 1], [1, 1], [1, -1]], SEQ4 = [0, 1, 2, 3];

// A piece's seeded random (the same on every load).
function randomFor(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// --- Palettes ----------------------------------------------------------------
const STEEL = '#8a9099', STEEL_D = '#4c525b', DARK = '#23262c', BLACK = '#15171b', WHITE = '#d9dde2', PLASTIC = '#c9ccd1';
const WOOD = '#6e5642', CARD = '#9a7b58', CARD_D = '#7d6246', RUBBER = '#1c1d20', CHROME = '#b6bcc4', GLASS = '#a8bab4';
const SKIN = ['#e0b99c', '#c08f6c', '#9a6a4c', '#6b4a36', '#4a3326'];
const BLOTCH = '#6f7f5a', VEIN = '#2c3527', PORT = '#b8d88a', PORT_DEAD = '#7b8077', DRIED = '#2e1a1a';
const STOCK = ['#c8574a', '#4f7fb0', '#e8e2d4', '#5a9a6a', '#d8d880', '#8f5a9a', '#e88a4a', '#3f6f8f'];
const LIT = INTERIOR_LOOK.glow, FIT = INTERIOR_LOOK.fitting, SCR = INTERIOR_LOOK.screen, FY = INTERIOR_LOOK.floorY;
const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];

// --- Shared bits -------------------------------------------------------------
// Four legs under a top (a table, a bench).
function legs(m, w, d, h, t, col, inset = .05) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(sx * (w / 2 - inset - t / 2), 0, sz * (d / 2 - inset - t / 2), t, h, t, col); }
// A screen's picture (no lettering): v 0 an ad (colour blocks and a round
// pictogram), 1 the biohazard trefoil, 2 a flat line, 3 static, 4 music bars.
function picture(m, x, y, z, w, h, col, v, r) {
  const g = SCR, dim = shade(col, .35);
  m.panel(x, y, z, w, h, dim, { glow: g });
  const f = z + .004;
  if (v === 1) {
    m.panel(x, y, f, h * .18, h * .18, '#1a0d10', { glow: .3 });
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + 1.571; m.panel(x + Math.cos(a) * h * .22, y + Math.sin(a) * h * .22, f, h * .22, h * .22, '#1a0d10', { glow: .3 }); }
    m.panel(x, y, f + .002, h * .08, h * .08, col, { glow: g });
  } else if (v === 2) {
    m.panel(x - w * .18, y - h * .05, f, w * .5, h * .03, '#c4ff8a', { glow: 2 });
    m.panel(x + w * .12, y + h * .06, f, w * .04, h * .25, '#c4ff8a', { glow: 2 });
    m.panel(x + w * .3, y - h * .05, f, w * .3, h * .03, '#c4ff8a', { glow: 2 });
  } else if (v === 3) {
    for (let k = 0; k < 14; k++) { const t = .4 + r() * .9; m.panel(x + (r() - .5) * w * .85, y + (r() - .5) * h * .8, f, w * (.05 + r() * .2), h * .05, shade('#c8d0d8', t), { glow: g, fine: true }); }
  } else if (v === 4) {
    const n = 9; for (let k = 0; k < n; k++) { const bh = h * (.15 + r() * .6); m.panel(x - w * .4 + k * w * .8 / (n - 1), y - h * .4 + bh / 2, f, w * .06, bh, col, { glow: g * 1.4 }); }
  } else {
    m.panel(x - w * .22, y, f, w * .4, h * .8, col, { glow: g * 1.2 });
    m.panel(x + w * .22, y + h * .15, f, h * .35, h * .35, '#f2f2f2', { glow: g });
    m.panel(x + w * .22, y - h * .25, f, w * .35, h * .08, shade(col, .8), { glow: g });
  }
}
// Stock on a shelf board: little boxes and bottles of varied colours.
function stock(m, r, w, y, d, cols = STOCK, fill = .85, fine = true) {
  let x = -w / 2 + .03;
  while (x < w / 2 - .08) {
    const bw = .08 + r() * .16, bh = .08 + r() * .2, bd = d * (.5 + r() * .35);
    if (r() < fill && x + bw < w / 2 - .02) m.box(x + bw / 2, y, (r() - .5) * .04, bw, bh, bd, pick(r, cols), { fine });
    x += bw + .015;
  }
}
// A civilian or patient (never a player: no hat, no coat, no team colour;
// gowns and everyday clothes, visible hair, bare arms). Built lying along +z
// (head at -z) from the origin, then posed by the caller's groups.
function figure(m, r, p, pose) {
  const look = p.params.look || {}, skin = look.skin || pick(r, SKIN), hair = look.hair || '#2a211c';
  const cloth = look.cloth || (look.gown ? pick(r, ['#94a89e', '#9fb7a8', '#aeb0a6', '#b7b2a6']) : pick(r, ['#5b6b7a', '#6a5a4c', '#4f5d4a', '#7a6a78']));
  const legsCol = look.gown ? skin : look.legs || '#3b4250', infected = !!p.params.infected;
  const blotch = (x, y, z, s) => infected && m.box(x, y, z, s, .012, s * .8, BLOTCH, { fine: false });
  // Head and neck (the port), torso, arms, legs; y is up from the back.
  const head = () => {
    m.group(0, 0, -.62, 0, p.params.turn || 0, 0, () => {
      m.box(0, .02, -.1, .17, .18, .21, skin);
      m.box(0, .15, -.11, .18, .06, .22, hair); m.box(0, .02, -.21, .18, .16, .04, hair);
      if (look.long) m.box(0, -.02, -.3, .2, .08, .2, hair);
      if (infected) { m.box(.086, .06, -.08, .012, .06, .07, BLOTCH); m.box(-.03, .201, -.04, .06, .004, .05, BLOTCH); }
    });
    m.box(0, .03, -.6, .1, .1, .07, skin);
    if (infected) { m.box(.052, .06, -.6, .012, .03, .03, p.params.pose === 'strapped' ? PORT_DEAD : PORT, { glow: p.params.pose === 'strapped' ? 0 : .5 }); m.box(-.05, .05, -.58, .008, .06, .005, VEIN); }
  };
  head();
  m.box(0, 0, -.28, .38, .19, .56, cloth);
  if (look.gown) m.box(0, .1, -.05, .36, .05, .12, shade(cloth, .88));
  blotch(.12, .19, -.35, .08);
  return { skin, cloth, legsCol, blotch };
}
// Its arm from the shoulder at (x, y, z), out along +z by `len`, turned by rx / ry.
function arm(m, x, y, z, rx, ry, len, skin, sleeve, infected) {
  m.group(x, y, z, rx, ry, 0, () => {
    if (sleeve) m.box(0, -.05, .07, .1, .1, .14, sleeve);
    m.box(0, -.045, len / 2 + .07, .08, .08, len - .14, skin);
    m.box(0, -.05, len + .04, .09, .05, .1, skin);
    if (infected) { m.box(.041, -.02, len * .6, .008, .04, .12, BLOTCH); m.box(-.01, .036, len * .45, .03, .006, .18, VEIN); }
  });
}
function legPair(m, col, skin, shoe) {
  for (const sx of [-.1, .1]) { m.box(sx, 0, .22, .15, .15, .44, col); m.box(sx, 0, .64, .13, .13, .4, skin); m.box(sx, -.01, .86, .12, .12, .1, shoe || '#2a2a2e'); }
}

// A polygon clipped to a convex one (Sutherland-Hodgman; points [x, z]).
function clipTo(subject, clip) {
  let out = subject;
  const n = clip.length, cx = clip.reduce((s, p) => s + p[0], 0) / n, cz = clip.reduce((s, p) => s + p[1], 0) / n;
  for (let i = 0; i < n && out.length; i++) {
    const [ax, az] = clip[i], [bx, bz] = clip[(i + 1) % n];
    let nx = -(bz - az), nz = bx - ax; if ((cx - ax) * nx + (cz - az) * nz < 0) { nx = -nx; nz = -nz; }
    const inside = q => (q[0] - ax) * nx + (q[1] - az) * nz >= 0, input = out; out = [];
    for (let k = 0; k < input.length; k++) {
      const P = input[k], Q = input[(k + 1) % input.length], pi = inside(P), qi = inside(Q);
      if (pi) out.push(P);
      if (pi !== qi) { const dp = (P[0] - ax) * nx + (P[1] - az) * nz, dq = (Q[0] - ax) * nx + (Q[1] - az) * nz, t = dp / (dp - dq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
    }
  }
  return out;
}
const rectXZ = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
// A fitting's pool of light on the floor under it, kept inside its room.
// Three soft octagonal rings, fainter outward (flat shading has no falloff).
// Each is the room's floor colour lit, adding the fitting's colour: the
// shader adds cityGlow x the vertex colour, so the glow is the light over
// the floor's colour (a pool of light, never a painted disc).
function pool(m, p, col, size) {
  if (p.params.pool === false) return;
  const light = rgb(col), floor = rgb(p.floorCol || '#5a5e66'), add = INTERIOR_LOOK.pool;
  for (let k = 0; k < add.length; k++) {
    const rad = size * (2.2 - k * .6), pts = [];
    for (let i = 0; i < 8; i++) { const a = (i + .5) / 8 * Math.PI * 2; pts.push([p.x + Math.cos(a) * rad, p.z + Math.sin(a) * rad]); }
    const glow = [0, 1, 2].map(c => add[k] * light[c] / Math.max(.02, floor[c]));
    m.worldFlat(clipTo(pts, p.inner), INTERIOR_LOOK.roomFloor + .004 + k * .0015, floor, glow);
  }
}

// --- The models --------------------------------------------------------------
export const CITY_MODELS = {
  // Basic fittings ---------------------------------------------------------
  floor(m, p, r) {
    const pat = p.params.pattern || 'plain', col = p.params.col || '#5a5e66', col2 = p.params.col2 || shade(col, .82), y = INTERIOR_LOOK.roomFloor, poly = p.inner;
    const xs = poly.map(q => q[0]), zs = poly.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const put = (a, b, c, d, colour, dy = 0) => m.worldFlat(clipTo(rectXZ(a, b, c, d), poly), y + dy, colour);
    if (pat === 'carpet') { put(x0, z0, x1, z1, col2); put(x0 + .3, z0 + .3, x1 - .3, z1 - .3, col, .001); return; }
    if (pat === 'checker') {
      const sz = p.params.size || .5;
      for (let i = 0; x0 + i * sz < x1; i++) for (let j = 0; z0 + j * sz < z1; j++) put(x0 + i * sz, z0 + j * sz, Math.min(x1, x0 + (i + 1) * sz), Math.min(z1, z0 + (j + 1) * sz), (i + j) % 2 ? col2 : col);
      return;
    }
    put(x0, z0, x1, z1, col);
    if (pat === 'tiles' || pat === 'grate') {
      const sz = p.params.size || (pat === 'grate' ? .15 : .6), t = pat === 'grate' ? .04 : .025;
      for (let x = x0 + sz; x < x1 - .05; x += sz) put(x - t / 2, z0, x + t / 2, z1, col2, .001);
      if (pat === 'tiles') for (let z = z0 + sz; z < z1 - .05; z += sz) put(x0, z - t / 2, x1, z + t / 2, col2, .001);
    } else if (pat === 'planks') {
      const sz = p.params.size || .22;
      for (let z = z0, k = 0; z < z1; z += sz, k++) { put(x0, z, x1, Math.min(z1, z + sz), k % 3 === 0 ? col2 : k % 3 === 1 ? col : shade(col, .92), .001); put(x0, z + sz - .012, x1, Math.min(z1, z + sz), shade(col, .6), .0015); }
    } else if (pat === 'concrete') {
      for (let x = x0 + 2; x < x1 - .3; x += 2) put(x - .015, z0, x + .015, z1, col2, .001);
      for (let z = z0 + 2; z < z1 - .3; z += 2) put(x0, z - .015, x1, z + .015, col2, .001);
      for (let k = 0; k < 3; k++) { const cx = x0 + r() * (x1 - x0), cz = z0 + r() * (z1 - z0), s = .4 + r() * .8; put(cx - s, cz - s * .7, cx + s, cz + s * .7, shade(col, .88 + r() * .06), .0012); }
    }
  },
  'ceiling-light'(m, p) {
    const col = p.params.col || '#e8f1ff', y = p.h;
    pool(m, p, col, Math.max(p.w, p.d) * .7);
    // (Seen from above, as the camera always sees it: the lit tube's rim
    // round a slim grey housing.)
    m.box(0, y - .08, 0, p.w, .04, p.d, col, { glow: FIT });
    m.box(0, y - .04, 0, p.w - .1, .04, p.d - .1, '#7c828a');
    m.box(-p.w * .35, y, 0, .015, 3.6 - y, .015, BLACK, { fine: true }); m.box(p.w * .35, y, 0, .015, 3.6 - y, .015, BLACK, { fine: true });
  },
  'ceiling-panel'(m, p) {
    const col = p.params.col || '#e8f1ff', y = p.h;
    pool(m, p, col, p.w);
    m.box(0, y - .07, 0, p.w, .03, p.d, col, { glow: FIT });
    m.box(0, y - .04, 0, p.w - .12, .04, p.d - .12, '#7c828a');
  },
  'wall-screen'(m, p, r) {
    const w = p.w, top = p.h, h = Math.min(.72, w * .6), y = top - h / 2, col = p.params.col || '#9fb3c4';
    m.box(0, top - h - .03, -p.d / 2 + .03, w, h + .06, .05, BLACK);
    picture(m, 0, y, -p.d / 2 + .058, w - .06, h - .04, col, p.params.v ?? 0, r);
  },
  'exit-sign'(m, p) {
    const y = p.h - .15, z = -p.d / 2 + .03;
    m.box(0, y, z, .4, .16, .05, '#1c2a22');
    m.panel(0, y + .08, z + .026, .36, .12, '#52d44a', { glow: 2 });
    // the running figure and its arrow: bars, never a letter
    const f = z + .03, W = '#f4fff6';
    m.panel(-.08, y + .115, f, .03, .03, W, { glow: 2 }); m.panel(-.085, y + .08, f, .02, .05, W, { glow: 2 });
    m.face([[-.095, y + .055, f], [-.075, y + .055, f], [-.045, y + .03, f], [-.065, y + .03, f]], W, 2);
    m.panel(.07, y + .08, f, .1, .02, W, { glow: 2 }); m.face([[.12, y + .1, f], [.15, y + .08, f], [.12, y + .06, f]], W, 2);
  },
  extinguisher(m, p) {
    if (p.params.v === 1) { m.cyl(0, .08, 0, .08, .5, '#b3242c', { rx: Math.PI / 2 }); m.box(0, .02, .3, .03, .03, .15, BLACK); return; }
    const z = -p.d / 2 + .1;
    m.box(0, .95, -p.d / 2 + .01, .1, .3, .02, STEEL_D);
    m.cyl(0, .7, z, .08, .48, '#b3242c'); m.box(0, 1.18, z, .05, .06, .05, BLACK); m.box(.05, 1.14, z + .03, .02, .02, .12, BLACK, { fine: true });
  },
  outlet(m, p) {
    const z = -p.d / 2 + .01;
    m.box(0, .3, z, .12, .08, .02, WHITE); m.box(.02, .0, z + .06, .015, .3, .015, BLACK, { fine: true }); m.box(.02, 0, z + .2, .015, .015, .3, BLACK, { fine: true });
  },
  'floor-strip'(m, p) { m.box(0, 0, 0, p.w, .02, p.d, p.params.col || '#ff2a3a', { glow: LIT * 1.2 }); },
  'neon-tube'(m, p) {
    const col = p.params.col || '#ff2a66', y = p.h, z = -p.d / 2 + .04;
    if (p.params.v === 1) {
      const n = 4, seg = p.w / n;
      for (let k = 0; k < n; k++) m.box(-p.w / 2 + seg * (k + .5), y - .12, z, seg * 1.08, .04, .04, col, { glow: LIT * 1.4, rz: k % 2 ? .45 : -.45 });
    } else m.box(0, y, z, p.w, .045, .045, col, { glow: LIT * 1.4 });
    m.box(-p.w * .42, y - .02, z - .02, .03, .08, .03, STEEL_D, { fine: true }); m.box(p.w * .42, y - .02, z - .02, .03, .08, .03, STEEL_D, { fine: true });
  },
  'cable-run'(m, p) { for (const [dz, c] of [[-.03, BLACK], [.01, '#2a2d33'], [.04, '#3a2a22']]) m.box(0, 0, dz, p.w, .018, .02, c); },
  stain(m, p, r) {
    const col = p.params.col || '#2c2426';
    m.flat(0, FY, 0, p.w * .8, p.d * .7, col, { ry: r() * 3 });
    m.flat((r() - .5) * p.w * .3, FY + .002, (r() - .5) * p.d * .3, p.w * .5, p.d * .5, shade(col, .85), { ry: r() * 3 });
    m.flat((r() - .5) * p.w * .4, FY + .001, (r() - .5) * p.d * .4, p.w * .3, p.d * .35, shade(col, 1.1), { ry: r() * 3 });
  },
  litter(m, p, r) {
    const n = 3 + (p.params.v ?? 3) * 2;
    for (let k = 0; k < n; k++) {
      const x = (r() - .5) * p.w, z = (r() - .5) * p.d, t = r();
      if (t < .55) m.flat(x, FY + k * .0005, z, .14 + r() * .12, .1 + r() * .12, pick(r, ['#c9c4b8', '#d8d4ca', '#a8b0b8', '#9a9c9e']), { ry: r() * 3, fine: true });
      else if (t < .8) m.cyl(x, .04, z, .035, .1, pick(r, ['#e8e2d4', '#b8423a', '#3f6f8f']), { rz: Math.PI / 2, ry: r() * 3, sides: 6, fine: true });
      else m.box(x, 0, z, .12, .04, .08, pick(r, STOCK), { ry: r() * 3, fine: true });
    }
  },

  // Shared furniture ---------------------------------------------------------
  'shelf-unit'(m, p, r) {
    const { w, d, h } = p, frame = STEEL_D, bare = p.params.v === 1;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(sx * (w / 2 - .02), 0, sz * (d / 2 - .02), .035, h, .035, frame);
    const levels = 5;
    for (let k = 0; k < levels; k++) {
      const y = .08 + k * (h - .12) / (levels - 1);
      m.box(0, y, 0, w - .02, .025, d - .02, STEEL);
      if (k < levels - 1 && (!bare || r() < .3)) stock(m, r, w - .06, y + .025, d - .06, STOCK, bare ? .2 : .85, k > 0);
      if (k === 0 && !bare) for (let b = 0; b < 2; b++) m.box(-w / 4 + b * w / 2, y + .025, 0, w * .42, .28, d * .8, pick(r, [CARD, CARD_D]));
    }
  },
  'wire-shelf'(m, p, r) {
    const { w, d, h } = p, v = p.params.v || 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(sx * (w / 2 - .015), 0, sz * (d / 2 - .015), .025, h, .025, CHROME);
    for (let k = 0; k < 5; k++) {
      const y = .1 + k * (h - .15) / 4;
      m.box(0, y, 0, w, .02, d, '#a9b0b8');
      for (let s = 0; s < 4; s++) m.box(-w / 2 + (s + .5) * w / 4, y + .02, 0, .008, .008, d, '#8d939a', { fine: true });
      if (k === 4) continue;
      if (v === 0) stock(m, r, w - .04, y + .02, d - .05, ['#e8ecef', '#d0e2f0', '#5a86b8', '#e8ecef', '#c9d8c4'], .9, k > 0);
      else if (v === 2) stock(m, r, w - .04, y + .02, d - .05, ['#b0332f', '#3a3d42', '#d8d860', '#5f6770'], .6, true);
      else if (r() < .5) m.box((r() - .5) * w * .5, y + .02, 0, .3, .12, d * .7, CARD, { ry: (r() - .5) * .8, fine: true });
    }
  },
  locker(m, p) {
    const { w, d, h } = p, col = p.params.col || '#56606c', n = 2, dw = w / n;
    m.box(0, 0, 0, w, h, d, col);
    for (let k = 0; k < n; k++) {
      const x = -w / 2 + dw * (k + .5), open = p.params.v === 1 && k === 1;
      if (open) { m.box(x, .02, d / 2 - .01, dw - .04, h - .06, .01, BLACK); m.group(x + dw / 2 - .02, 0, d / 2, 0, -1.2, 0, () => m.box(-dw / 2 + .02, .03, .01, dw - .04, h - .08, .02, shade(col, 1.08))); m.box(x, h * .55, d / 2 - .2, dw * .6, .25, .15, '#5b6b7a'); }
      else { m.box(x, .03, d / 2, dw - .04, h - .08, .01, shade(col, 1.06)); for (let s = 0; s < 3; s++) m.box(x, h - .25 - s * .05, d / 2 + .006, dw * .5, .015, .005, shade(col, .7), { fine: true }); m.box(x + dw * .32, h * .5, d / 2 + .008, .02, .08, .015, CHROME, { fine: true }); }
    }
  },
  cabinet(m, p) {
    const { w, d, h } = p, col = p.params.col || '#5c6570';
    m.box(0, 0, 0, w, h, d, col);
    m.box(0, .05, d / 2, .012, h - .1, .01, shade(col, .6));
    m.box(-.06, h * .5, d / 2 + .01, .02, .12, .02, CHROME, { fine: true }); m.box(.06, h * .5, d / 2 + .01, .02, .12, .02, CHROME, { fine: true });
    m.box(0, h, 0, w * .5, .12, d * .6, CARD, { fine: true });
  },
  fridge(m, p, r) {
    const { w, d, h } = p, open = p.params.v === 1, inside = '#e6f4ff';
    m.box(0, 0, -.05, w, h, d - .1, '#2c3036');
    m.box(0, h - .22, d / 2 - .06, w, .2, .03, '#3a404a'); m.panel(0, h - .12, d / 2 - .04, w * .7, .08, '#ff5a8c', { glow: LIT });
    m.box(0, .12, d / 2 - .1, w - .1, h - .38, .02, inside, { glow: .9 });
    for (let k = 0; k < 4; k++) { const y = .2 + k * (h - .5) / 4; m.box(0, y, 0, w - .12, .015, d - .3, '#c9d6e2', { glow: .5 }); stock(m, r, w - .16, y + .015, d - .4, ['#e84a5a', '#4ab0e8', '#e8d24a', '#5ae88a', '#f2703a', '#e8e8e8'], .95, k !== 1); }
    if (open) m.group(w / 2, 0, d / 2 - .04, 0, -1.3, 0, () => { m.box(-w / 2, .08, 0, w - .04, h - .32, .04, '#98aaa4', { glow: .25 }); });
    else m.box(0, .08, d / 2 - .04, w - .04, h - .32, .015, GLASS, { glow: .35 });
  },
  'box-stack'(m, p, r) {
    const { w, d, h } = p;
    m.box(0, 0, 0, w, .12, d, '#7a6246');
    let y = .12; const rows = Math.max(1, Math.round((h - .12) / .42));
    for (let k = 0; k < rows; k++) {
      const bh = (h - .12) / rows - .01;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (k < rows - 1 || r() < .75) m.box(sx * w / 4 * (1 - r() * .05), y, sz * d / 4, w / 2 - .02, bh, d / 2 - .02, pick(r, [CARD, CARD_D, '#a88a64']), { ry: (r() - .5) * .08 });
      y += bh + .01;
    }
    m.box(0, h - .005, 0, w * .9, .01, .04, '#c9b99a', { fine: true });
  },
  table(m, p) { const { w, d, h } = p, col = p.params.col || '#6e6a64'; m.box(0, h - .04, 0, w, .04, d, col); legs(m, w, d, h - .04, .045, STEEL_D); },
  'round-table'(m, p) { const { w, h } = p; m.cyl(0, h - .03, 0, w / 2, .03, p.params.col || '#2a2d33', { sides: 10 }); m.cyl(0, .03, 0, .04, h - .06, CHROME, { sides: 6 }); m.cyl(0, 0, 0, w * .28, .03, STEEL_D, { sides: 8 }); },
  'high-table'(m, p, r) {
    const { w, h } = p; m.cyl(0, h - .03, 0, w / 2, .03, '#1e2026', { sides: 10 }); m.cyl(0, .03, 0, .04, h - .06, CHROME, { sides: 6 }); m.cyl(0, 0, 0, w * .3, .03, STEEL_D, { sides: 8 });
    for (let k = 0; k < 3; k++) m.cyl((r() - .5) * w * .5, h, (r() - .5) * w * .5, .03, .1 + r() * .06, '#cfe3ea', { sides: 6, fine: true });
  },
  chair(m, p) {
    const col = p.params.col || '#8a9a8e', { w, d } = p;
    m.box(0, .42, 0, w, .05, d, col); m.box(0, .47, -d / 2 + .03, w, .38, .05, col, { rx: -.12 });
    legs(m, w, d, .42, .03, STEEL_D, .04);
  },
  stool(m, p) { m.cyl(0, p.h - .06, 0, p.w / 2, .06, '#2a2226', { sides: 8 }); m.cyl(0, .02, 0, .03, p.h - .08, CHROME, { sides: 6 }); m.cyl(0, 0, 0, p.w * .4, .02, STEEL_D, { sides: 8 }); m.cyl(0, .28, 0, p.w * .35, .02, CHROME, { sides: 8, fine: true }); },
  sofa(m, p) {
    const { w, d, h } = p, col = p.params.col || '#4a4550', dark = shade(col, .8);
    m.box(0, .08, 0, w, .3, d, dark); m.box(0, .38, .05, w - .3, .1, d - .2, col);
    m.box(0, .38, -d / 2 + .1, w - .3, h - .38, .2, col, { rx: -.1 });
    for (const sx of [-1, 1]) m.box(sx * (w / 2 - .075), .08, 0, .15, .5, d, dark);
    for (const sx of [-1, 1]) m.box(sx * (w / 2 - .1), 0, 0, .06, .08, d - .1, BLACK);
    m.box(-w * .2, .48, .05, .01, .005, d - .3, shade(col, .7), { fine: true }); m.box(w * .2, .48, .05, .01, .005, d - .3, shade(col, .7), { fine: true });
  },
  desk(m, p, r) {
    const { w, d, h } = p;
    m.box(0, h - .04, 0, w, .04, d, '#4a4e56');
    m.box(-w / 2 + .03, 0, 0, .04, h - .04, d, STEEL_D); m.box(w / 2 - .25, 0, 0, .45, h - .04, d - .04, '#3e424a');
    if (p.params.v === 1) { for (let k = 0; k < 4; k++) m.flat((r() - .5) * w * .6, h + .002 + k * .002, (r() - .5) * d * .5, .21, .28, '#dcd8cc', { ry: r() * 1.5, fine: true }); return; }
    m.box(0, h, -d / 2 + .12, .08, .22, .06, BLACK); m.box(0, h + .2, -d / 2 + .12, .55, .32, .03, BLACK);
    picture(m, 0, h + .36, -d / 2 + .136, .5, .27, '#6fa8dc', 3, r);
    m.box(0, h, .08, .42, .015, .14, '#2a2d33', { fine: true }); m.box(.3, h, .1, .06, .02, .1, '#2a2d33', { fine: true });
    m.cyl(-w / 2 + .15, h, .15, .04, .1, '#e8e2d4', { sides: 6, fine: true });
  },
  'office-chair'(m, p) {
    for (let k = 0; k < 5; k++) m.box(0, .04, 0, .5, .03, .05, BLACK, { ry: k * 1.2566 });
    m.cyl(0, .07, 0, .03, .36, CHROME, { sides: 6 }); m.box(0, .43, 0, .48, .08, .46, '#2e3138'); m.box(0, .5, -.21, .44, .45, .06, '#2e3138', { rx: -.1 });
  },
  counter(m, p, r) {
    const { w, d, h } = p, col = p.params.col || '#4a4e58';
    m.box(0, .08, 0, w, h - .12, d, col); m.box(0, 0, .02, w - .06, .08, d - .06, BLACK);
    m.box(0, h - .04, .02, w + .04, .04, d + .04, shade(col, 1.35));
    if (p.params.v === 1) { m.box(w * .25, h, -.05, .35, .12, .3, '#2e3138'); m.box(w * .25, h + .12, -.12, .3, .18, .03, BLACK, { rx: -.3 }); m.box(w * .25, h - .12, d / 2 + .12, .3, .08, .25, '#3a3e46'); }
    for (let k = 0; k < 3; k++) m.box((r() - .5) * w * .7, h, (r() - .5) * d * .5, .1 + r() * .1, .03, .1 + r() * .08, pick(r, STOCK), { ry: r() * 3, fine: true });
  },
  bench(m, p) { const { w, d, h } = p; m.box(0, h - .05, 0, w, .05, d, '#5a5048'); legs(m, w, d, h - .05, .05, STEEL_D, .1); },
  bed(m, p) {
    const { w, d } = p, torn = p.params.v === 1;
    m.box(0, .15, 0, w, .12, d, STEEL); m.box(0, .27, 0, w - .06, .16, d - .08, '#dfe6ea');
    m.box(0, .43, -d / 2 + .25, w * .6, .08, .3, '#f0f3f5');
    m.box(0, .15, -d / 2 + .02, w, .55, .04, STEEL_D); m.box(0, .15, d / 2 - .02, w, .3, .04, STEEL_D);
    for (const sx of [-1, 1]) { m.box(sx * (w / 2 + .01), .4, 0, .03, .03, d * .5, CHROME, { fine: true }); for (const sz of [-1, 1]) m.cyl(sx * (w / 2 - .08), 0, sz * (d / 2 - .1), .05, .15, BLACK, { sides: 6 }); }
    if (torn) for (const [x, z] of [[-.2, -.3], [.25, .25]]) { m.box(x, .43, z, .06, .01, .35, '#c2b89a'); m.box(w / 2 + .01, .1, z, .01, .35, .06, '#c2b89a'); }
  },
  cot(m, p) {
    const { w, d } = p;
    for (const sx of [-1, 1]) m.box(sx * (w / 2 - .02), .3, 0, .03, .03, d, STEEL_D);
    for (const sz of [-.4, .4]) for (const sx of [-1, 1]) m.box(sx * (w / 2 - .05), 0, sz * d, .03, .32, .03, STEEL_D, { rx: sz > 0 ? .15 : -.15 });
    m.box(0, .31, 0, w - .04, .04, d - .05, '#5a6650'); m.box(0, .35, .15, w - .02, .08, d * .6, '#6b4a4a', { ry: .04 }); m.box(0, .35, -d / 2 + .22, w * .6, .09, .3, '#c9c4b8');
  },
  sink(m, p) {
    const { w, d, h } = p, v = p.params.v === 1, basins = Math.max(1, Math.round(w / .85));
    m.box(0, 0, 0, w, h - .08, d, '#d7d9dc'); m.box(0, h - .08, 0, w, .08, d, '#eceeef');
    for (let k = 0; k < basins; k++) {
      const x = -w / 2 + w / basins * (k + .5);
      m.flat(x, h + .002, .03, w / basins * .6, d * .55, '#aab3ba');
      m.box(x, h, -d / 2 + .06, .03, .18, .03, CHROME); m.box(x, h + .15, -d / 2 + .1, .03, .03, .1, CHROME);
      m.box(x, 1.25, -d / 2 + .005, w / basins * .7, .6, .01, v && k === 0 ? '#8a9894' : '#a9c0cc', { glow: .15 });
      if (v && k === 0) { for (let s = 0; s < 4; s++) m.box(x + (s - 1.5) * .07, 1.3 + s * .1, -d / 2 + .012, .01, .35, .004, BLACK, { rz: (s - 1.5) * .6 }); m.box(x, h + .02, -d / 2 + .14, .015, .13, .015, '#d0ece4', { glow: .6 }); }
    }
  },
  toilet(m, p) {
    const { w, d } = p;
    m.box(0, 0, .05, w * .7, .38, d * .6, '#e3e5e7'); m.box(0, .38, .06, w, .04, d * .65, '#eceeef'); m.box(0, 0, -d / 2 + .1, w, .78, .18, '#dfe1e3');
  },
  'toilet-stall'(m, p) {
    const { w, d, h } = p, col = p.params.col || '#6d6470';
    for (const sx of [-1, 1]) m.box(sx * (w / 2 - .02), .15, 0, .04, h - .15, d, col);
    m.box(0, .15, -d / 2 + .02, w - .08, h - .15, .04, shade(col, .9));
    if (p.params.v === 1) m.group(-w / 2 + .04, 0, d / 2 - .02, 0, .9, -.18, () => m.box(w / 2 - .05, .2, 0, w - .1, h - .4, .03, shade(col, 1.1)));
    else m.group(-w / 2 + .04, 0, d / 2 - .02, 0, .5, 0, () => m.box(w / 2 - .05, .15, 0, w - .1, h - .3, .03, shade(col, 1.1)));
    m.box(0, 0, -d / 2 + .5, .32, .38, .45, '#e3e5e7'); m.box(0, 0, -d / 2 + .15, .4, .75, .16, '#dfe1e3');
  },
  bin(m, p, r) {
    const { w, h } = p, hazard = p.params.v === 1;
    m.cyl(0, 0, 0, w / 2, h - .05, hazard ? '#fcee0a' : '#5b6470', { sides: 8 });
    m.cyl(0, h - .05, 0, w / 2 + .02, .05, hazard ? '#c9bc10' : '#3a3f47', { sides: 8 });
    if (hazard) {
      m.panel(0, h * .5, w / 2 + .005, .16, .16, BLACK); m.panel(0, h * .5, w / 2 + .008, .06, .06, '#fcee0a');
      for (let k = 0; k < 3; k++) m.box((r() - .5) * .2, h, (r() - .5) * .2, .2 + r() * .1, .12 + r() * .1, .18, pick(r, ['#e8e44a', '#d8d2b0', '#c9c02a']), { ry: r() * 3, rz: (r() - .5) * .5 });
      m.box(.25, 0, .15, .25, .12, .2, '#e0d84a', { ry: .7 });
    }
  },
  crate(m, p, r) {
    const { w, d, h } = p, col = p.params.col || '#2f5f8f';
    m.box(0, 0, 0, w, h, d, col); m.box(0, h - .01, 0, w - .06, .012, d - .06, shade(col, .45));
    for (let k = 0; k < 6; k++) m.box((r() - .5) * (w - .15), h * .2, (r() - .5) * (d - .15), .12, .03, .12, pick(r, ['#15171b', '#e8e2d4', '#3a3d42']), { ry: r() * 3, fine: true });
  },
  drum(m, p) {
    const { w, h } = p, col = p.params.col || '#3f5f7a';
    m.cyl(0, 0, 0, w / 2, h, col, { sides: 10 }); m.cyl(0, h * .33, 0, w / 2 + .01, .03, shade(col, .75), { sides: 10 }); m.cyl(0, h * .66, 0, w / 2 + .01, .03, shade(col, .75), { sides: 10 });
    m.cyl(w * .2, h, 0, .04, .02, STEEL_D, { sides: 6, fine: true });
  },
  'potted-plant'(m, p, r) {
    m.cyl(0, 0, 0, p.w / 2 - .04, .5, '#3a3d44', { sides: 8, top: p.w / 2 }); m.cyl(0, .5, 0, p.w / 2 - .06, .02, '#2a221c', { sides: 8 });
    for (let k = 0; k < 5; k++) m.box((r() - .5) * .2, .5, (r() - .5) * .2, .02, .35 + r() * .3, .02, '#5a5238', { rx: (r() - .5) * .6, rz: (r() - .5) * .6 });
    for (let k = 0; k < 4; k++) m.flat((r() - .5) * .5, FY, (r() - .5) * .5, .1, .06, '#6a5a3a', { ry: r() * 3, fine: true });
  },
  'vending-snacks'(m, p, r) {
    const { w, d, h } = p;
    m.box(0, 0, 0, w, h, d, '#2a2d38'); m.box(-.08, .5, d / 2, w - .3, h - .7, .02, '#cfe0ea', { glow: .7 });
    for (let k = 0; k < 5; k++) stock(m, r, w - .36, .55 + k * .22, .12, STOCK, .9, true);
    m.box(w / 2 - .12, .9, d / 2, .14, .4, .02, BLACK); m.panel(w / 2 - .12, 1.2, d / 2 + .012, .1, .06, '#8aff4a', { glow: LIT });
  },

  // The dead and the lost -------------------------------------------------------
  body(m, p, r) {
    const pose = p.params.pose || 'reach', inf = !!p.params.infected;
    if (pose === 'sheet') {
      // On the bed (top at .43) under a sheet; the head and one arm out.
      m.group(0, .45, -.05, 0, 0, 0, () => {
        const { skin } = figure(m, r, p, pose);
        m.box(0, .08, .2, .52, .16, 1.2, '#dfe3e2'); m.box(0, .2, -.15, .46, .06, .5, '#e6e9e8'); m.box(0, .02, .75, .5, .1, .3, '#d6dad9');
        m.box(-.08, .21, .28, .3, .01, .25, '#c8ccc9', { fine: true });
        arm(m, .24, .08, -.35, .2, 1.35, .62, skin, null, inf);
        m.group(.24, .08, -.35, 0, 1.35, 0, () => m.group(0, 0, .5, .9, 0, 0, () => m.box(0, -.05, .1, .08, .08, .2, skin)));
      });
      m.flat(.62, FY, -.05, .22, .16, DRIED, { ry: .4 });
      return;
    }
    if (pose === 'strapped') {
      // Reclined in the surgical chair: back tilted, head turned toward the arms.
      let legsCol = '#94a89e', skin = '#b08a6e';
      m.group(0, .8, -.12, .5, 0, 0, () => {
        const f = figure(m, r, p, pose); legsCol = f.legsCol; skin = f.skin;
        arm(m, .25, .06, -.45, 0, .05, .62, skin, look(p).gown ? null : f.cloth, inf); arm(m, -.25, .06, -.45, 0, -.05, .62, skin, look(p).gown ? null : f.cloth, inf);
        for (const z of [-.42, .05]) m.box(0, .19, z, .44, .02, .07, '#3a3230');
      });
      m.group(0, .78, -.12, -.12, 0, 0, () => { legPair(m, legsCol, skin, skin); m.box(0, .15, .45, .4, .02, .07, '#3a3230'); });
      return;
    }
    if (pose === 'slump') {
      m.group(0, .05, -.1, 1.3, 0, 0, () => { const { skin, cloth } = figure(m, r, p, pose); arm(m, .25, .05, -.38, .3, .25, .6, skin, cloth, inf); arm(m, -.25, .05, -.38, .2, -.3, .6, skin, cloth, inf); });
      m.group(0, .05, .1, 0, 0, 0, () => legPair(m, '#3b4250', '#3b4250'));
      m.flat(0, FY, -.1, .5, .4, DRIED, { ry: r() });
      return;
    }
    // 'reach': prone, face down, head toward +z, one arm out toward +z (the airlock).
    m.group(0, .19, .1, 0, Math.PI, Math.PI, () => {
      const { skin, cloth, legsCol } = figure(m, r, p, pose);
      arm(m, .25, .03, -.4, .1, Math.PI - .15, .64, skin, look(p).gown ? null : cloth, inf);
      arm(m, -.25, .03, -.4, 0, .8, .55, skin, look(p).gown ? null : cloth, inf);
      m.group(0, 0, 0, 0, 0, 0, () => legPair(m, legsCol, skin, skin));
    });
    m.flat(.05, FY, -.15, .45, .5, DRIED, { ry: .5 }); m.flat(.1, FY + .001, -.55, .16, .4, shade(DRIED, .8), { ry: .1 }); m.flat(-.12, FY + .001, .2, .2, .18, shade(DRIED, 1.1), { ry: 1.1 });
  },
  'dropped-jacket'(m, p, r) {
    const col = p.params.col || '#5b6b7a';
    m.box(0, 0, 0, .5, .05, .42, col, { ry: .2 }); m.box(-.3, 0, .1, .35, .04, .12, col, { ry: .9 }); m.box(.28, 0, -.12, .3, .04, .11, shade(col, .9), { ry: -.6 });
    m.box(0, .05, -.18, .3, .03, .08, shade(col, .8), { fine: true });
  },
  handbag(m, p, r) {
    m.box(0, 0, 0, .32, .2, .12, '#6a2a2e', { rz: 1.4 }); m.box(0, .16, 0, .2, .02, .02, '#3a1a1c', { fine: true });
    for (let k = 0; k < 4; k++) m.box(.2 + r() * .25, 0, (r() - .5) * .3, .08, .02, .12, pick(r, STOCK), { ry: r() * 3, fine: true });
  },
  phone(m, p) { m.box(0, 0, 0, .08, .012, .16, BLACK); m.box(0, .012, 0, .07, .002, .14, '#b8e8c8', { glow: 2 }); m.box(0, .015, -.03, .04, .001, .03, '#e8f4ff', { glow: 2.2 }); },
  masks(m, p, r) { for (let k = 0; k < 4; k++) m.flat((r() - .5) * p.w, FY + k * .001, (r() - .5) * p.d, .16, .1, pick(r, ['#b8d0cc', '#e8eef0', '#b8d0cc']), { ry: r() * 3 }); },
  'tipped-chair'(m, p) {
    const col = p.params.col || '#8a9a8e';
    m.group(0, .03, .1, -Math.PI / 2 + .1, 0, 0, () => { m.box(0, .42, 0, .45, .05, .45, col); m.box(0, .47, -.2, .45, .38, .05, col); legs(m, .45, .45, .42, .03, STEEL_D, .04); });
  },
  shoes(m, p, r) {
    const n = Math.max(1, p.params.v || 1), col = p.params.col || '#3b3f46', step = p.w / n;
    for (let k = 0; k < n; k++) for (const sx of [-.05, .05]) m.box(-p.w / 2 + step * (k + .5) + sx, 0, 0, .08, .05, .24, col, { ry: n > 1 ? 0 : (r() - .5) });
  },
  bottles(m, p, r) {
    const col = p.params.col || '#e8604a';
    for (let k = 0; k < 11; k++) { const x = (r() - .5) * p.w, z = (r() - .5) * p.d; m.cyl(x, .025, z, .025, .07, col, { rz: Math.PI / 2, ry: r() * 3, sides: 6 }); if (r() < .4) m.box(x + .05, 0, z, .02, .01, .02, '#f0ece0', { fine: true }); }
  },
  glasses(m, p, r) {
    for (let k = 0; k < 7; k++) { const x = (r() - .5) * p.w, z = (r() - .5) * p.d; if (r() < .5) m.cyl(x, .025, z, .03, .09, '#cfe3ea', { rz: Math.PI / 2, ry: r() * 3, sides: 6, fine: true }); else m.flat(x, FY, z, .06, .04, '#dfeef4', { ry: r() * 3, fine: true }); }
    m.flat(0, FY - .001, 0, p.w * .5, p.d * .5, '#241c22', { ry: r() * 3 });
  },
};
const look = p => p.params.look || {};

// The south district's own kinds (world/city-interiors.js SOUTH_PIECES).
Object.assign(CITY_MODELS, SOUTH_MODELS());

// A data-made kind: its parts ['box' | 'cyl' | 'flat', ...] in its own frame.
function drawParts(m, parts) {
  for (const [shape, ...a] of parts) {
    if (shape === 'box') { const [x, y, z, w, h, d, col, o] = a; m.box(x, y, z, w, h, d, col, o || {}); }
    else if (shape === 'cyl') { const [x, y, z, r, h, col, o] = a; m.cyl(x, y, z, r, h, col, o || {}); }
    else if (shape === 'flat') { const [x, y, z, w, d, col, o] = a; m.flat(x, y, z, w, d, col, o || {}); }
    else throw new Error(`city interiors: part shape '${shape}'?`);
  }
}

// --- The builder -------------------------------------------------------------
// Every building's two interior meshes (base, fine), for the quality switch.
const FINE = new WeakMap(); // shells -> [fine meshes]
export const interiorStats = { ms: 0, buildings: 0, tris: {}, fineTris: {} };

// A mesh on the shells' material with the shells' attributes (position,
// normal, color, cityCut, cityGlow, cityAt: render/city-shells.js), copied
// out of the scratch soup. Casts no shadow (only big things do); takes them.
function meshOf(shells, soup) {
  const g = new THREE.BufferGeometry(), take = (b, n) => new THREE.BufferAttribute(b.a.slice(0, b.n), n);
  g.setAttribute('position', take(soup.p, 3)); g.setAttribute('normal', take(soup.nm, 3)); g.setAttribute('color', take(soup.c, 3));
  g.setAttribute('cityCut', take(soup.k, 1)); g.setAttribute('cityGlow', take(soup.g, 3)); g.setAttribute('cityAt', take(soup.t, 2));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, shells.material);
  mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  return mesh;
}

export function buildCityInterior(shells, spec, rooms, group) {
  const t0 = performance.now();
  const pieces = cityPieces(spec.id, rooms);
  if (!pieces.length) return null;
  // cityCut 0: never touched by the cut (the shells' own first floor and
  // floors use it too). A building's slot, even with role 0, is squashed to
  // the first floor's top when the building is cut (render/city-shells.js
  // CUT_VERTEX), which would flatten the furniture the moment you enter.
  const m = new Maker(-1); // (-1: the cut never moves it, and the room's knee-wall view never drops it: render/city-shells.js ROOM_VIEW)
  const seed = spec.seed ?? 1;
  // (Each room's floor colour, for the pools of light on it.)
  const floors = new Map(pieces.filter(p => p.kind === 'floor').map(p => [p.room, p.params.col]));
  for (const p of pieces) {
    const make = CITY_MODELS[p.kind], parts = p.spec.parts;
    if (!make && !parts) throw new Error(`city interiors: no model for '${p.kind}'`);
    m.piece(p.x, p.z, p.angle);
    const r = randomFor(seed * 131 + p.index * 7919 + 17);
    const piece = { ...p, rand: r, floorCol: floors.get(p.room) };
    if (make) make(m, piece, r); else drawParts(m, parts);
  }
  const base = meshOf(shells, m.base); base.name = 'interior-furniture:' + spec.id; group.add(base);
  let fine = null;
  if (m.fine.count) { fine = meshOf(shells, m.fine); fine.name = 'interior-detail:' + spec.id; group.add(fine); let list = FINE.get(shells); if (!list) FINE.set(shells, list = []); list.push(fine); }
  interiorStats.ms += performance.now() - t0; interiorStats.buildings++;
  interiorStats.tris[spec.id] = m.base.count / 3; interiorStats.fineTris[spec.id] = m.fine.count / 3;
  return { base, fine };
}
registerCityInteriors(buildCityInterior);

// The fine detail's switch: shown from Balanced up (setQuality only; nothing
// per frame). A city system with no other work.
registerCitySystem('interiors', (view, map, city) => {
  const list = () => FINE.get(city.shells) || [];
  return { setQuality(name) { const on = INTERIOR_LOOK.fineFrom.includes(name); for (const mesh of list()) mesh.visible = on; } };
});

// --- The south district's kinds ------------------------------------------------
function SOUTH_MODELS() {
  const HAZ = '#fcee0a', MINT = '#9fb7a8', CLINIC = '#e3e8ec', COLD = '#d8ecff', SICK = '#b9d98f';
  return {
    // laundromat
    washer(m, p, r) {
      const { w, d, h } = p, v = p.params.v || 0, z = d / 2;
      m.box(0, 0, 0, w, h, d, '#d8dcdf'); m.box(0, h - .12, z, w - .04, .1, .01, '#aeb4ba');
      m.panel(w * .28, h - .07, z + .012, .12, .04, v === 2 ? '#8aff4a' : '#5b6470', { glow: v === 2 ? 2 : 0 });
      m.cyl(0, .42, z - .01, .23, .03, '#3a3f47', { rx: Math.PI / 2, sides: 10 });
      if (v === 2) m.cyl(0, .42, z + .01, .19, .02, '#6f93b3', { rx: Math.PI / 2, sides: 10, glow: .6 });
      else if (v === 1) { m.group(-.22, .42, z + .02, 0, -1.4, 0, () => m.cyl(-.2, 0, 0, .2, .04, '#aeb4ba', { rx: Math.PI / 2, sides: 10 })); for (let k = 0; k < 5; k++) m.box((r() - .5) * .5, 0, z + .15 + r() * .35, .22, .05, .16, pick(r, ['#6a7fa8', '#c98a8a', '#e8e2d4', '#5a7a5a']), { ry: r() * 3 }); m.flat(0, FY, z + .3, .7, .5, '#3a4a5a', { ry: .2 }); }
      else m.cyl(0, .42, z + .01, .19, .02, '#1c2a36', { rx: Math.PI / 2, sides: 10 });
    },
    'dryer-stack'(m, p) {
      const { w, d, h } = p;
      m.box(0, 0, 0, w, h, d, '#e2e5e8');
      for (const y of [.45, 1.35]) { m.cyl(0, y, d / 2 - .01, .25, .03, '#3a3f47', { rx: Math.PI / 2, sides: 10 }); m.cyl(0, y, d / 2 + .01, .21, .02, '#23303b', { rx: Math.PI / 2, sides: 10 }); }
      m.box(0, .9, d / 2, w - .04, .02, .01, '#9aa2aa'); m.panel(w * .3, 1.78, d / 2 + .01, .1, .04, '#ff5a8c', { glow: 1.5 });
    },
    'folding-table'(m, p, r) {
      const { w, d, h } = p; m.box(0, h - .04, 0, w, .04, d, '#d9d6cf'); legs(m, w, d, h - .04, .04, STEEL_D);
      for (let k = 0; k < 4; k++) m.box(-w / 2 + .25 + k * .38, h, (r() - .5) * .15, .3, .06 + r() * .1, .26, pick(r, ['#6a7fa8', '#c98a8a', '#e8e2d4', '#8a9a6a', '#4a4a5a']));
      m.box(w / 2 - .25, h, -.05, .36, .22, .28, '#e8e4dc'); m.box(w / 2 - .25, h + .22, -.05, .3, .04, .22, '#c96a8a', { fine: true });
    },
    'laundry-cart'(m, p) {
      const { w, d, h } = p;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { m.box(sx * (w / 2 - .02), .05, sz * (d / 2 - .02), .025, h - .05, .025, CHROME); m.cyl(sx * (w / 2 - .05), 0, sz * (d / 2 - .05), .04, .06, BLACK, { sides: 6 }); }
      m.box(0, .35, 0, w - .04, .02, d - .04, '#a9b0b8'); m.box(0, h - .02, 0, w, .03, d, CHROME);
      m.box(0, .37, 0, w - .12, h - .45, d - .15, '#5a6a8a'); m.box(0, h - .08, 0, w - .2, .12, d - .25, '#c9c4b8');
    },
    'change-machine'(m, p) { const { w, d, h } = p; m.box(0, .6, 0, w, h - .6, d, '#3a4050'); m.panel(0, 1.2, d / 2 + .005, w * .7, .25, '#8aff4a', { glow: LIT }); m.box(0, 0, 0, .12, .6, .12, STEEL_D); },
    'hot-plate'(m, p) {
      const { w, d, h } = p; m.box(0, h - .03, 0, w, .03, d, '#6e6a64'); legs(m, w, d, h - .03, .035, STEEL_D);
      m.box(-.15, h, 0, .34, .06, .3, '#2a2d33'); m.cyl(-.15, h + .06, 0, .1, .01, '#ff4a3a', { sides: 8, glow: .8 });
      m.cyl(-.15, h + .07, 0, .11, .12, '#8a9099', { sides: 8 }); m.cyl(.2, h, .02, .07, .16, '#c9ccd1', { sides: 8 }); m.box(.3, h + .1, .02, .06, .02, .02, '#c9ccd1', { fine: true });
    },
    // clinic
    'reception-desk'(m, p, r) {
      const { w, d, h } = p;
      m.box(0, 0, .05, w, h, d - .1, '#dfe4e8'); m.box(0, h, .1, w + .04, .04, d - .1, '#f0f2f4');
      m.box(0, h + .04, -d / 2 + .08, w, .9, .03, '#bcd4e0', { glow: .15 });
      m.box(-.4, h, -.05, .45, .3, .05, BLACK); picture(m, -.4, h + .16, -.02, .4, .24, '#f25060', 1, r);
      m.box(.35, h + .04, .12, .3, .02, .2, '#2a2d33', { fine: true }); m.box(.6, h + .04, .15, .08, .1, .08, '#3f6f8f', { fine: true });
    },
    'number-post'(m, p) { m.cyl(0, 0, 0, .12, .03, STEEL_D, { sides: 8 }); m.cyl(0, .03, 0, .03, p.h - .2, CHROME, { sides: 6 }); m.box(0, p.h - .2, 0, .2, .18, .14, '#c9ccd1'); m.panel(0, p.h - .11, .072, .12, .08, '#ff2a3a', { glow: 2 }); m.box(.06, p.h - .25, .08, .08, .04, .02, '#f0ece0', { fine: true }); },
    'waiting-chairs'(m, p) {
      const { w, d } = p, n = Math.max(2, Math.round(w / .48)), seat = w / n, col = '#8a9a8e';
      m.box(0, .3, -.05, w, .05, .06, STEEL_D); for (const sx of [-1, 1]) m.box(sx * (w / 2 - .1), 0, -.05, .05, .3, .3, STEEL_D);
      for (let k = 0; k < n; k++) {
        const x = -w / 2 + seat * (k + .5);
        if (p.params.v === 1 && k === 1) continue;
        m.box(x, .38, .02, seat - .06, .05, d - .08, col); m.box(x, .43, -d / 2 + .05, seat - .06, .36, .05, col, { rx: -.15 });
      }
    },
    'surgical-chair'(m, p) {
      const { w, d } = p, pad = '#3a4550', frame = '#c9ced4';
      m.box(0, 0, 0, .55, .08, 1.2, frame); m.cyl(0, .08, .1, .09, .45, '#9aa2aa', { sides: 8 });
      m.box(0, .55, .1, w * .8, .1, .6, pad);             // seat
      m.group(0, .6, -.2, .5, 0, 0, () => m.box(0, 0, -.4, w * .8, .1, .8, pad)); // back, reclined
      m.box(0, .5, .7, w * .7, .1, .6, pad, { rx: .25 });  // leg rest
      for (const sx of [-1, 1]) m.box(sx * .36, .72, -.15, .08, .06, .55, pad, { rx: .3 });
      m.box(0, .95, -.85, .25, .08, .18, pad, { rx: .5 });
    },
    'tool-arms'(m, p, r) {
      // A ceiling ring, three jointed arms frozen mid-reach over the chair.
      const top = 3.45;
      m.cyl(0, top - .08, 0, .35, .08, '#c9ced4', { sides: 12 }); m.cyl(0, top - .2, 0, .12, .12, STEEL_D, { sides: 8 });
      for (let k = 0; k < 3; k++) {
        const a = k * 2.094 + .4;
        m.group(Math.cos(a) * .25, top - .15, Math.sin(a) * .25, 0, -a, 0, () => {
          m.box(.35, -.55, 0, .09, .09, .8, '#dfe4e8', { rz: .9, ry: Math.PI / 2 });
          m.box(.62, -1.05, 0, .07, .07, .6, '#b8c0c8', { rz: -.5, ry: Math.PI / 2 });
          m.box(.7, -1.45, 0, .06, .12, .06, STEEL_D); m.box(.7, -1.55, 0, .012, .1, .012, CHROME);
          m.box(.7, -1.35, .04, .03, .03, .03, '#ff2a3a', { glow: 1.2 });
        });
      }
    },
    'instrument-cart'(m, p) {
      const { w, d, h } = p;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(sx * (w / 2 - .02), .04, sz * (d / 2 - .02), .02, h - .04, .02, CHROME);
      m.box(0, h - .02, 0, w, .02, d, '#c9ced4'); m.box(0, .3, 0, w, .02, d, '#c9ced4'); m.box(0, h, 0, w - .06, .03, d - .06, '#9aa2aa');
      m.box(-.1, h + .03, 0, .15, .01, .02, CHROME, { fine: true }); m.box(.08, h + .03, .05, .12, .01, .015, CHROME, { fine: true });
    },
    'monitor-stand'(m, p, r) {
      const { h } = p; m.cyl(0, 0, 0, .2, .04, STEEL_D, { sides: 6 }); m.cyl(0, .04, 0, .03, h - .45, CHROME, { sides: 6 });
      m.box(0, h - .42, 0, .48, .36, .06, BLACK, { rx: -.15 });
      m.group(0, h - .24, .04, -.15, 0, 0, () => { picture(m, 0, 0, 0, .42, .28, '#2a4a3a', 2, r); for (let k = 0; k < 3; k++) m.panel(-.05 + k * .04, .02 - k * .03, .006, .01, .2, '#cfe8ff', { glow: .8 }); });
    },
    'instrument-tray'(m, p, r) {
      m.box(0, 0, 0, .45, .03, .32, '#9aa2aa', { rz: Math.PI });
      for (let k = 0; k < 9; k++) m.box((r() - .5) * p.w, 0, (r() - .5) * p.d, .14 + r() * .08, .012, .015, CHROME, { ry: r() * 3 });
      m.flat(.1, FY, .1, .3, .2, '#241c22', { ry: .8 });
    },
    'port-dish'(m, p, r) { m.cyl(0, 0, 0, .13, .04, CHROME, { sides: 10, top: .15 }); for (let k = 0; k < 5; k++) m.box((r() - .5) * .14, .04, (r() - .5) * .14, .035, .02, .025, k ? '#7b8077' : PORT, { ry: r() * 3, glow: k ? 0 : .5 }); },
    'surgical-light'(m, p) {
      const top = 3.45; m.box(0, 3.1, 0, .04, top - 3.1, .04, STEEL_D); m.box(.25, 3.05, 0, .5, .04, .04, STEEL_D);
      m.cyl(.5, 2.85, 0, .24, .16, '#8a9096', { sides: 10, top: .14 }); m.cyl(.5, 2.84, 0, .2, .02, COLD, { sides: 10, glow: 1.6, bottom: true });
    },
    'iv-stand'(m, p) {
      const stand = () => { for (let k = 0; k < 4; k++) m.box(0, .03, 0, .45, .025, .03, STEEL_D, { ry: k * .785 }); m.cyl(0, .05, 0, .015, 1.75, CHROME, { sides: 5 }); m.box(0, 1.75, 0, .3, .015, .015, CHROME); m.box(.13, 1.45, 0, .1, .2, .03, '#d6ecf2', { glow: .15 }); };
      if (p.params.v === 1) { m.group(0, .05, 0, Math.PI / 2 - .05, 0, 0, stand); m.flat(.2, FY, 1.5, .5, .35, '#b9d0c8'); m.box(.15, 0, 1.5, .14, .02, .2, '#d6ecf2', { ry: .6 }); }
      else stand();
    },
    'dragged-sheet'(m, p, r) { m.box(0, 0, 0, .8, .03, 1.1, '#dfe3e2', { ry: .1 }); m.box(-.1, 0, .7, .5, .04, .4, '#d4d8d7', { ry: -.3 }); m.box(.05, .02, -.3, .6, .03, .3, '#e8ebea', { ry: .25 }); },
    'isolation-tent'(m, p, r) {
      const { w, d, h } = p, frame = '#9aa2aa', sheet = '#c8dcc4';
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(sx * (w / 2 - .02), 0, sz * (d / 2 - .02), .03, h, .03, frame);
      m.box(0, h - .03, 0, w, .03, d, frame, { top: '#b9cbb4' });
      for (const sx of [-1, 1]) m.box(sx * (w / 2 - .01), .05, 0, .015, h - .12, d - .06, sheet, { glow: .08 });
      m.box(0, .05, -d / 2 + .01, w - .06, h - .12, .015, sheet, { glow: .08 });
      m.box(-w / 4, .2, d / 2 - .01, w / 2 - .05, h - .3, .015, shade(sheet, .95), { rz: .06 });  // the front flap half torn
      m.box(w / 4 + .1, .9, d / 2 + .02, .25, h - 1.0, .015, shade(sheet, .9), { rz: -.35 });
      // the bed inside, empty and stripped
      m.box(0, .15, 0, w - .3, .12, d - .3, STEEL); m.box(0, .27, 0, w - .36, .14, d - .38, '#cfd6d4');
      m.box(0, .41, -d / 2 + .4, (w - .36) * .6, .07, .28, '#e0e5e3');
    },
    'air-scrubber'(m, p) {
      const { w, d, h } = p; m.box(0, .06, 0, w, h - .06, d, '#d6d9dc');
      for (let k = 0; k < 5; k++) m.box(0, .3 + k * .1, d / 2 + .004, w - .12, .02, .01, '#7a8088', { fine: true });
      m.panel(w / 2 - .1, h - .12, d / 2 + .01, .06, .06, '#8aff4a', { glow: 2.5 }); for (const sx of [-1, 1]) m.cyl(sx * (w / 2 - .08), 0, 0, .04, .06, BLACK, { sides: 6 });
      m.box(0, h, 0, .12, .25, .12, '#aeb4ba'); m.cyl(0, h + .25, 0, .08, .06, '#aeb4ba', { sides: 8 });
    },
    'hazmat-suit'(m, p, r) {
      const suit = '#e8e27a', dark = '#6a6a5a';
      m.group(0, .02, -.2, 1.25, 0, 0, () => {
        m.box(0, 0, -.28, .44, .24, .6, suit); m.box(0, .02, -.72, .3, .28, .3, suit); m.panel(0, .16, -.565, .2, .14, '#2a3a44', { glow: .15 });
        m.group(.26, .05, -.45, .2, .5, 0, () => m.box(0, 0, .25, .12, .12, .5, suit)); m.group(-.26, .05, -.45, .1, -.35, 0, () => m.box(0, 0, .25, .12, .12, .5, suit));
      });
      for (const sx of [-.12, .12]) m.box(sx, 0, .35, .16, .16, .8, suit, { ry: sx * .8 }); m.box(-.3, 0, .6, .22, .15, .2, dark);
      m.box(.35, 0, -.2, .2, .08, .15, dark, { ry: .4 });
    },
    'airlock-plastic'(m, p, r) {
      const { w, h } = p, sheet = '#cfe0cc';
      m.box(0, h - .08, 0, w + .2, .06, .06, STEEL_D);
      for (let k = 0; k < 6; k++) {
        const x = -w / 2 + (k + .5) * w / 6, len = k === 2 || k === 3 ? .7 + r() * .4 : h - .25 - r() * .5;
        m.box(x, h - .08 - len, (r() - .5) * .08, w / 6 - .01, len, .012, shade(sheet, .9 + r() * .15), { rz: (r() - .5) * .25, rx: (r() - .5) * .3, glow: .06 });
      }
      m.box(-w * .3, 1.0, .08, w * .7, .06, .01, HAZ, { rz: -.2 }); m.box(w * .35, .85, .08, w * .35, .06, .01, HAZ, { rz: .9 }); m.box(-w * .45, .7, .08, .08, .5, .01, HAZ);
      for (let k = 0; k < 4; k++) m.box(-w * .3 + k * .22, 1.0 + k * .045 - k * .09, .09, .05, .062, .005, BLACK, { rz: -.2, fine: true });
    },
    sanitiser(m, p) { m.box(0, 0, 0, .18, .08, .26, WHITE, { ry: .3 }); m.box(.1, 0, .2, .07, .04, .07, '#b8d0cc', { ry: .7 }); m.flat(0, FY, .35, .35, .3, '#b9d0d8', { ry: .5 }); },
    'vial-crate'(m, p, r) { m.box(0, 0, 0, .45, .1, .3, '#e8ecef', { rz: .15 }); for (let k = 0; k < 12; k++) m.cyl((r() - .5) * .9, .015, (r() - .5) * .7, .012, .06, pick(r, ['#cfe8ff', '#e8604a', '#b8d88a']), { rz: Math.PI / 2, ry: r() * 3, sides: 5 }); },
    scrubs(m, p, r) { const c = p.params.col || '#5f8f86'; m.box(0, 0, 0, .5, .05, .4, c, { ry: .2 }); m.box(.2, 0, .25, .3, .04, .25, shade(c, .9), { ry: -.6 }); m.box(-.25, 0, -.1, .35, .04, .15, shade(c, 1.1), { ry: 1.1 }); },
    // pharmacy
    gondola(m, p, r) {
      const { w, d, h } = p;
      m.box(0, 0, 0, w, .12, d, '#e0e3e6'); m.box(0, .12, 0, w, h - .12, .05, '#cfd3d7');
      for (let k = 0; k < 4; k++) {
        const y = .15 + k * (h - .25) / 3;
        for (const sz of [-1, 1]) { m.box(0, y, sz * d / 4, w - .04, .02, d / 2 - .04, '#e8ebed'); if (k < 3) m.group(0, 0, sz * d / 4, 0, sz < 0 ? Math.PI : 0, 0, () => stock(m, r, w - .1, y + .02, d / 2 - .1, ['#e8ecef', '#4f7fb0', '#e84a5a', '#5aa86a', '#e0e070', '#f0f0f0', '#8f5a9a'], .9, k > 0)); }
      }
      m.box(0, h, 0, w, .06, d * .6, '#46a07a');
    },
    'pharmacy-counter'(m, p, r) {
      const { w, d, h } = p;
      m.box(0, 0, 0, w, h - .04, d, '#e3e7ea'); m.box(0, h - .04, 0, w + .06, .04, d + .06, '#46a07a');
      m.box(0, .1, d / 2 + .004, w - .1, .06, .01, '#46a07a', { glow: .8 });
      m.box(-w / 2 + .5, h, -.05, .36, .12, .3, '#2e3138'); m.box(-w / 2 + .5, h + .12, -.14, .34, .22, .03, BLACK, { rx: -.3 });
      m.box(.4, h, -.1, .04, .26, .04, BLACK); m.box(.4, h + .26, -.1, .45, .3, .03, BLACK); picture(m, .4, h + .41, -.08, .41, .26, '#46a07a', 0, r);
      for (let k = 0; k < 4; k++) m.box(w / 2 - .5 + (r() - .5) * .5, h, (r() - .5) * .3, .12, .15, .08, '#f0ece0', { fine: true });
    },
    'dispensary-shelf'(m, p, r) {
      const { w, d, h } = p, stripped = p.params.v === 1, gone = p.params.col || '#e8604a';
      m.box(0, 0, -d / 2 + .02, w, h, .04, '#cfd3d7'); for (const sx of [-1, 1]) m.box(sx * (w / 2 - .02), 0, 0, .04, h, d, '#cfd3d7');
      for (let k = 0; k < 6; k++) {
        const y = .1 + k * (h - .15) / 5; m.box(0, y, 0, w - .04, .02, d - .04, '#e8ebed');
        if (k === 5) continue;
        if (stripped) { for (let b = 0; b < 3; b++) if (r() < .5) m.cyl((r() - .5) * (w - .2), y + .02, (r() - .5) * .1, .025, .07, gone, { sides: 6, rz: r() < .5 ? Math.PI / 2 : 0, fine: true }); }
        else { let x = -w / 2 + .06; while (x < w / 2 - .06) { m.cyl(x, y + .02, 0, .028, .08 + r() * .04, pick(r, ['#f0f0f0', '#4f7fb0', '#e0e070', '#5aa86a', '#d0d8e8']), { sides: 6, fine: k !== 2 }); x += .065 + r() * .03; } }
      }
      if (stripped) m.box(0, h, 0, w, .05, .05, gone, { glow: .4 });
    },
    'cage-gate'(m, p) {
      const { w, h } = p;
      m.group(-w / 2, 0, 0, 0, .35, 0, () => {
        for (const x of [.02, w - .02]) m.box(x, 0, 0, .04, h, .04, STEEL_D); m.box(w / 2, h - .04, 0, w, .04, .04, STEEL_D); m.box(w / 2, .05, 0, w, .04, .04, STEEL_D);
        for (let k = 1; k < 8; k++) m.box(k * w / 8, .05, 0, .012, h - .1, .012, '#6a727c');
        m.box(w - .06, 1.0, .02, .1, .12, .05, '#2a2d33'); m.box(w - .06, 1.12, .04, .04, .05, .02, CHROME, { rz: .8 });
      });
    },
    'pill-counter'(m, p, r) {
      const { w, d, h } = p; m.box(0, 0, 0, w, h - .04, d, '#dfe3e6'); m.box(0, h - .04, 0, w + .04, .04, d + .04, '#f0f2f4');
      for (let k = 0; k < 3; k++) m.box(-.4 + k * .3, h, 0, .22, .02, .3, '#5a86b8'); m.box(.5, h, -.1, .22, .16, .22, '#2e3138');
      for (let k = 0; k < 6; k++) m.box((r() - .5) * w * .8, h + .02, (r() - .5) * d * .6, .015, .006, .015, '#f0ece0', { fine: true });
    },
    // garage and workshop
    'car-lift'(m, p, r) {
      const { w, d } = p, post = '#c93a3a', car = '#4a5a6e', y = 1.05;
      for (const sx of [-1, 1]) { m.box(sx * (w / 2 - .12), 0, 0, .24, 2.2, .3, post); m.box(sx * (w / 2 - .12), 0, 0, .4, .04, .5, STEEL_D); for (const sz of [-1, 1]) m.box(sx * (w / 2 - .5), y - .05, sz * .8, .6, .05, .1, STEEL_D, { ry: sz * .3 }); }
      m.box(0, 2.12, 0, w, .08, .12, post);
      // the car, stopped half-way up
      m.box(0, y, 0, 1.75, .45, 4.2, car); m.box(0, y + .05, 2.12, 1.7, .3, .06, '#2a2d33');
      m.taper(0, y + .45, -.2, 1.65, 2.3, 1.35, 1.6, .5, '#2a3444', { shift: -.1 });
      m.box(0, y + .95, -.25, 1.3, .02, 1.5, car);
      for (const sx of [-1, 1]) for (const sz of [-1.3, 1.35]) { m.cyl(sx * .78, y - .08, sz, .32, .24, RUBBER, { rz: Math.PI / 2, sides: 10 }); m.cyl(sx * .9, y - .08, sz, .18, .01, CHROME, { rz: Math.PI / 2, sides: 8 }); }
      m.panel(-.55, y + .3, 2.105, .35, .08, '#f4f0e8', { glow: .6 }); m.panel(.55, y + .3, 2.105, .35, .08, '#f4f0e8', { glow: .6 });
      m.box(0, y + .25, -2.11, 1.4, .06, .02, '#ff2a3a', { glow: 1.2 });
      m.box(0, y - .02, .6, 1.5, .03, 1.4, '#1c1e22'); // the battery floor, open
      m.box(-.4, y - .3, .6, .6, .25, .8, '#2e3a48', { fine: true });
    },
    'tyre-stack'(m, p) { const n = p.params.v || 4; for (let k = 0; k < n; k++) { m.cyl(0, k * .22, 0, .32, .2, RUBBER, { sides: 10 }); m.cyl(0, k * .22 + .2, 0, .17, .005, '#0e0f11', { sides: 8 }); } },
    'diagnostic-cart'(m, p, r) {
      const { w, d, h } = p; m.box(0, .08, 0, w, .8, d, '#2e3440'); for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.cyl(sx * (w / 2 - .06), 0, sz * (d / 2 - .06), .04, .08, BLACK, { sides: 6 });
      m.box(0, .88, 0, .06, .3, .06, STEEL_D); m.box(0, 1.1, .05, .62, .36, .05, BLACK, { rx: -.2 });
      m.group(0, 1.28, .09, -.2, 0, 0, () => { picture(m, 0, 0, 0, .56, .3, '#3d62ff', 4, r); for (let k = 0; k < 5; k++) m.panel(-.15, .1 - k * .045, .005, .22, .012, '#dfe8ff', { glow: 1.2 }); });
      m.box(.25, .88, -.1, .1, .02, .06, '#ff2a3a', { glow: 1.5, fine: true }); m.box(-.2, .88, 0, .25, .06, .15, '#1c1e22', { fine: true });
    },
    'wall-charger'(m, p) {
      const { w, d, h } = p; m.box(0, 0, 0, w * .7, .12, d * .8, STEEL_D); m.box(0, .12, -.03, w, h - .12, d - .06, '#dfe3e6');
      m.box(0, h - .45, d / 2 - .03, w - .12, .3, .01, BLACK); m.panel(0, h - .3, d / 2 - .015, w - .18, .24, '#8aff4a', { glow: LIT });
      m.box(0, .8, d / 2 - .02, .12, .16, .08, '#2a2d33'); m.cyl(0, .5, d / 2 + .08, .12, .06, BLACK, { rx: Math.PI / 2, sides: 8 });
    },
    'charge-cable'(m, p, r) {
      let x = -p.w / 2, z = 0, a = 0;
      for (let k = 0; k < 9; k++) { a += (r() - .5) * 1.2; const l = .22 + r() * .1, nx = x + Math.cos(a) * l, nz = z + Math.sin(a) * l; m.box((x + nx) / 2, 0, (z + nz) / 2, l + .02, .035, .04, '#1a1b1e', { ry: -a }); x = nx; z = nz; }
      m.box(x, 0, z, .12, .06, .08, '#2a2d33', { ry: -a }); m.box(x + .05, .06, z, .03, .01, .03, '#8aff4a', { glow: 1.6 });
    },
    workbench(m, p, r) {
      const { w, d, h } = p, v = p.params.v || 0; m.box(0, h - .05, 0, w, .05, d, '#5a5048'); legs(m, w, d, h - .05, .06, STEEL_D); m.box(0, .15, 0, w - .1, .03, d - .1, STEEL_D);
      m.box(w / 2 - .2, h, .2, .16, .12, .14, '#2a4a6a'); m.box(0, h, -d / 2 + .02, w, .6, .03, '#7a8088');
      for (let k = 0; k < 7; k++) m.box(-w / 2 + .2 + k * w / 8, h + .2 + r() * .25, -d / 2 + .05, .04, .18, .02, pick(r, [STEEL_D, '#b0332f', '#3a3d42']), { fine: true });
      if (v === 1) for (let k = 0; k < 4; k++) m.cyl(-w / 3 + k * .2, h, .1, .07, .12, pick(r, ['#4a3d5c', '#6e3c4a', '#3f5d4c', '#b8c0c8']), { sides: 8 });
      else if (v === 2) { m.box(-.3, h, .05, .4, .03, .3, '#2a4a3a'); for (let k = 0; k < 6; k++) m.box(-.3 + (r() - .5) * .3, h + .03, .05 + (r() - .5) * .2, .03, .02, .02, pick(r, STOCK), { fine: true }); m.box(.3, h, 0, .2, .12, .15, '#1c1e22'); m.panel(.3, h + .09, .076, .1, .04, '#8aff4a', { glow: 1.5 }); }
      else for (let k = 0; k < 4; k++) m.box((r() - .5) * w * .6, h, (r() - .5) * .3, .25, .03, .05, CHROME, { ry: r() * 3, fine: true });
    },
    'engine-block'(m, p) {
      const { w, d } = p; m.box(0, 0, 0, w, .12, d, '#7a6246');
      m.box(0, .12, 0, w * .75, .45, d * .65, '#3a4452'); m.cyl(0, .57, 0, .18, .2, '#5a6470', { sides: 8 }); m.cyl(w * .35, .3, 0, .15, .2, '#c96a2a', { rz: Math.PI / 2, sides: 8 });
      m.box(-w * .2, .57, .15, .2, .1, .15, '#2a2d33'); m.box(0, .5, d * .33, .6, .04, .04, '#c96a2a', { fine: true });
    },
    'parts-shelf'(m, p, r) {
      const { w, d, h } = p; for (const sx of [-1, 1]) m.box(sx * (w / 2 - .04), 0, 0, .06, h, d, '#3a5a8a');
      for (let k = 0; k < 4; k++) { const y = .1 + k * (h - .2) / 3; m.box(0, y, 0, w - .08, .05, d, '#c96a2a'); if (k < 3) for (let b = 0; b < 3; b++) if (r() < .85) m.box(-w / 3 + b * w / 3, y + .05, 0, w / 3 - .08, .2 + r() * .15, d - .1, pick(r, [CARD, CARD_D, '#5a6470', '#2a4a6a'])); }
    },
    'welding-station'(m, p, r) {
      const { w, d, h } = p; m.box(0, h - .06, 0, w, .06, d, '#3a3d42'); legs(m, w, d, h - .06, .07, STEEL_D);
      m.box(-.3, h, 0, .7, .03, .5, '#6a6f78'); m.box(-.3, h + .03, 0, .5, .02, .06, '#fff0e0', { glow: 2.5 }); m.flat(-.3, h + .031, .1, .3, .15, '#5a3a2a');
      m.box(w / 2 - .3, 0, -.1, .4, .5, .35, '#2e5a8a'); m.panel(w / 2 - .3, .4, .08, .15, .06, '#8aff4a', { glow: 1.5 });
      for (const [x, c] of [[w / 2 - .12, '#3a6a4a'], [w / 2 - .32, '#8a3a3a']]) { m.cyl(x, 0, -d / 2 - .02, .1, 1.3, c, { sides: 8 }); m.cyl(x, 1.3, -d / 2 - .02, .04, .1, STEEL_D, { sides: 6 }); }
      m.box(0, h, .3, .3, .2, .2, '#1c1e22', { fine: true }); for (let k = 0; k < 6; k++) m.flat((r() - .5) * .6, FY, d / 2 + .1 + r() * .3, .05, .05, '#2a2016', { fine: true });
    },
    'sheet-rack'(m, p, r) {
      const { w, d, h } = p; m.box(0, 0, 0, w, .1, d, STEEL_D); for (let k = 0; k < 5; k++) m.box(-w / 2 + .05 + k * (w - .1) / 4, .1, 0, .05, h - .1, .05, STEEL_D);
      for (let k = 0; k < 7; k++) m.box((r() - .5) * .2, .1, -d / 2 + .08 + k * (d - .16) / 6, w - .3 - r() * .5, h - .4 - r() * .5, .02, pick(r, ['#9aa2aa', '#aeb4ba', '#8a9099', '#b8a888']));
    },
    'cut-sheets'(m, p, r) { for (let k = 0; k < 5; k++) m.box((r() - .5) * p.w * .6, k * .012, (r() - .5) * p.d * .6, .5 + r() * .5, .01, .3 + r() * .4, pick(r, ['#9aa2aa', '#aeb4ba', '#b8a888']), { ry: r() * 3 }); for (let k = 0; k < 8; k++) m.box((r() - .5) * p.w, 0, (r() - .5) * p.d, .08, .01, .02, CHROME, { ry: r() * 3, fine: true }); },
    'drill-press'(m, p) { m.box(0, 0, 0, .5, .08, .5, STEEL_D); m.cyl(0, .08, -.12, .05, 1.5, '#5a6470', { sides: 6 }); m.box(0, .8, 0, .4, .04, .4, '#5a6470'); m.box(0, 1.35, -.02, .3, .3, .4, '#2e5a4a'); m.box(0, 1.25, .12, .03, .15, .03, CHROME); m.box(.2, 1.4, .1, .25, .02, .02, CHROME, { ry: .6 }); },
    'paint-stand'(m, p) {
      const { w, h } = p; for (const sx of [-1, 1]) { m.box(sx * (w / 2 - .1), 0, 0, .05, h, .05, STEEL_D); m.box(sx * (w / 2 - .1), 0, 0, .06, .04, .5, STEEL_D); }
      m.box(0, .45, 0, w - .1, h - .55, .03, '#b8b8b0'); m.box(-.25, .45, .016, w * .5, h - .55, .004, '#b83a5a'); m.box(.2, .75, .017, .3, .5, .004, '#b83a5a', { rz: .3 });
    },
    'paint-extractor'(m, p) {
      const { w, d, h } = p; m.box(0, 0, 0, w, h, d, '#9aa2aa');
      for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) m.box(-w / 3 + i * w / 3, .25 + j * .45, d / 2, w / 3 - .06, .4, .01, j === 1 && i === 1 ? '#c8a8b8' : '#e8e4d4');
      m.box(0, h - .2, d / 2 + .02, w, .1, .04, '#5a6470');
    },
    respirator(m, p) { m.box(0, 0, 0, .18, .08, .14, '#2a2d33'); for (const sx of [-1, 1]) m.cyl(sx * .1, .02, .02, .05, .05, '#c93a3a', { rz: Math.PI / 2, sides: 8 }); m.box(0, .02, -.12, .25, .01, .02, BLACK, { ry: .3 }); },
    'tool-cabinet'(m, p, r) {
      const { w, d, h } = p; m.box(0, .08, 0, w, .85, d, '#a33a3a'); for (let k = 0; k < 5; k++) m.box(0, .15 + k * .16, d / 2, w - .08, .13, .01, '#8a2e2e'); for (let k = 0; k < 5; k++) m.box(0, .2 + k * .16, d / 2 + .01, w * .4, .015, .01, CHROME, { fine: true });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.cyl(sx * (w / 2 - .06), 0, sz * (d / 2 - .06), .04, .08, BLACK, { sides: 6 });
      m.box(0, .93, -d / 2 + .02, w, h - .93, .03, '#7a8088'); for (let k = 0; k < 8; k++) m.box(-w / 2 + .1 + k * w / 9, 1.0 + r() * .25, -d / 2 + .06, .04, .15, .02, pick(r, [STEEL_D, '#3a3d42', CHROME]), { fine: true });
    },
    // parking
    'micro-car'(m, p) {
      const { w, d } = p, col = p.params.col || '#3c4f66', glass = '#1c2430';
      m.box(0, .22, 0, w, .5, d, col, { top: shade(col, 1.1) });
      m.taper(0, .72, -.1, w - .08, d * .6, w - .25, d * .38, .55, glass, { shift: -.05 });
      m.box(0, 1.27, -.18, w - .28, .04, d * .36, col);
      m.box(0, .22, d / 2 - .02, w - .1, .22, .06, '#2a2d33'); m.box(0, .22, -d / 2 + .02, w - .1, .22, .06, '#2a2d33');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { m.cyl(sx * (w / 2 - .06), .02, sz * (d / 2 - .55), .26, .16, RUBBER, { rz: Math.PI / 2, sides: 10 }); m.cyl(sx * (w / 2 + .01), .02, sz * (d / 2 - .55), .14, .01, CHROME, { rz: Math.PI / 2, sides: 8 }); }
      m.panel(-w / 2 + .25, .5, d / 2 + .004, .3, .06, '#f4f0e8', { glow: .5 }); m.panel(w / 2 - .25, .5, d / 2 + .004, .3, .06, '#f4f0e8', { glow: .5 });
      m.box(0, .45, -d / 2 - .005, w - .2, .05, .02, '#ff2a3a', { glow: 1.2 });
      if (p.params.v === 1) m.box(0, 1.31, -.1, .16, .06, .12, '#ff2a3a', { glow: 2.5 });
      m.box(0, 1.31, -.4, .5, .01, .3, '#9aa2aa', { fine: true });
    },
    motorbike(m, p) {
      const col = '#8a2e3a';
      for (const sz of [-.7, .7]) { m.cyl(0, 0, sz, .3, .09, RUBBER, { rz: Math.PI / 2, sides: 10 }); m.cyl(0, 0, sz, .14, .1, CHROME, { rz: Math.PI / 2, sides: 8 }); }
      m.box(0, .3, 0, .22, .3, 1.0, '#2a2d33'); m.box(0, .55, -.05, .3, .25, .7, col); m.box(0, .8, -.35, .26, .08, .6, BLACK);
      m.box(0, .55, .55, .06, .5, .06, CHROME, { rx: -.35 }); m.box(0, 1.0, .68, .7, .04, .04, BLACK); m.panel(0, .88, .78, .14, .1, '#f4f0e8', { glow: .6 });
      m.box(.2, 0, .1, .03, .35, .03, STEEL_D, { rz: .5 });
    },
    pillar(m, p) {
      const { w, d, h } = p; m.box(0, 0, 0, w, h, d, '#6e7178');
      for (let k = 0; k < 4; k++) m.box(0, .1 + k * .2, 0, w + .01, .1, d + .01, k % 2 ? BLACK : HAZ);
    },
    'barrier-post'(m, p) {
      const { w, d, h } = p; m.box(0, 0, 0, w, h - .1, d, '#e8e4dc'); m.box(0, h - .1, 0, w - .06, .1, d - .06, '#c93a3a');
      m.panel(0, .8, d / 2 + .005, .14, .14, '#ff2a3a', { glow: 2 }); m.box(w / 2, h - .25, 0, .35, .1, .1, HAZ); m.box(w / 2 + .35, h - .25, 0, .35, .1, .1, BLACK, { rz: -.35 });
    },
    'pay-machine'(m, p, r) {
      const { w, d, h } = p; m.box(0, 0, 0, w, h, d, '#3a4050'); m.box(0, h - .55, d / 2, w - .1, .35, .01, BLACK); picture(m, 0, h - .37, d / 2 + .006, w - .16, .28, '#46a07a', 0, r);
      m.box(0, .8, d / 2, .2, .08, .02, '#1c1e22'); m.box(0, .5, d / 2, .25, .12, .04, '#2a2d33'); m.panel(.14, .95, d / 2 + .01, .04, .04, '#8aff4a', { glow: 2 });
    },
    'bay-lines'(m, p) {
      const { w, d } = p, c = '#c9c4b0', y = FY;
      m.flat(-w / 2 + .05, y, 0, .1, d, c); m.flat(w / 2 - .05, y, 0, .1, d, c); m.flat(0, y, -d / 2 + .05, w, .1, shade(c, .8));
      m.flat(0, y + .001, d * .15, w * .3, w * .3, '#3d62ff'); m.flat(0, y + .002, d * .15, w * .12, w * .2, c);
    },
    'wheel-stop'(m, p) { m.box(0, 0, 0, p.w, p.h, p.d, '#8a8d93'); m.box(-p.w * .3, p.h, 0, p.w * .2, .005, p.d, '#fcee0a'); m.box(p.w * .3, p.h, 0, p.w * .2, .005, p.d, '#fcee0a'); },
    cone(m, p) {
      const c = '#e8602a';
      if (p.params.v === 1) { m.group(0, .2, 0, Math.PI / 2 - .1, 0, 0, () => { m.cyl(0, -.3, 0, .15, .55, c, { top: .03, sides: 8 }); m.cyl(0, -.1, 0, .12, .08, '#f0f0f0', { top: .1, sides: 8 }); }); m.box(0, 0, -.2, .35, .03, .35, '#2a2d33'); return; }
      m.box(0, 0, 0, .38, .03, .38, '#2a2d33'); m.cyl(0, .03, 0, .15, .55, c, { top: .03, sides: 8 }); m.cyl(0, .25, 0, .11, .08, '#f0f0f0', { top: .09, sides: 8 });
    },
    'alarm-light'(m, p) { const z = -p.d / 2; m.box(0, p.h - .2, z + .02, .16, .12, .04, STEEL_D); m.cyl(0, p.h - .18, z + .08, .06, .12, '#ff2a3a', { glow: 3, sides: 8 }); },
    'scooter-heap'(m, p, r) {
      for (let k = 0; k < 3; k++) m.group((k - 1) * .3, .05 + k * .08, (r() - .5) * .2, 0, (r() - .5) * 1.2, Math.PI / 2 - .1, () => {
        m.box(0, -.03, 0, .06, .06, 1.0, pick(r, ['#2a2d33', '#d8dcdf', '#3a6a4a'])); m.box(0, 0, .45, .05, .6, .05, '#2a2d33', { rx: .15 }); m.box(0, .55, .48, .4, .03, .03, BLACK);
        for (const sz of [-.45, .45]) m.cyl(0, -.1, sz, .1, .04, RUBBER, { rz: Math.PI / 2, sides: 8 });
      });
    },
    'barrier-arm'(m, p) { const n = 6, seg = p.w / n; for (let k = 0; k < n; k++) m.box(-p.w / 2 + seg * (k + .5), 0, 0, seg, .1, .1, k % 2 ? BLACK : HAZ, { ry: k > 3 ? .12 : 0 }); },
    'ticket-desk'(m, p, r) {
      const { w, d, h } = p; m.box(0, 0, 0, w, h - .04, d, '#4a4e56'); m.box(0, h - .04, 0, w + .04, .04, d + .04, '#6a6f78');
      for (const x of [-.35, .3]) { m.box(x, h, -d / 2 + .1, .05, .2, .05, BLACK); m.box(x, h + .18, -d / 2 + .1, .5, .32, .03, BLACK); picture(m, x, h + .34, -d / 2 + .117, .45, .27, x < 0 ? '#3d62ff' : '#46a07a', x < 0 ? 3 : 0, r); }
      m.box(.1, h, .1, .2, .12, .1, '#2a2d33'); m.box(.18, h + .12, .1, .01, .15, .01, BLACK); m.panel(.05, h + .08, .151, .06, .03, '#ff5a8c', { glow: 1.5 });
    },
    // charging office
    'snack-shelf'(m, p, r) {
      const { w, d, h } = p; m.box(0, 0, -d / 2 + .03, w, h, .05, '#3a3e46'); for (const sx of [-1, 1]) m.box(sx * (w / 2 - .02), 0, 0, .04, h, d, '#3a3e46');
      for (let k = 0; k < 4; k++) { const y = .1 + k * (h - .15) / 3; m.box(0, y, 0, w - .04, .02, d - .04, '#5a5f68'); if (k < 3) stock(m, r, w - .1, y + .02, d - .12, ['#e84a5a', '#e0e070', '#4ab0e8', '#5ae88a', '#f2703a', '#2a2d33', '#e8e8e8'], .92, k > 0); }
      for (let k = 0; k < 4; k++) m.box(-w / 2 + .2 + k * .35, h - .3, d / 2 - .02, .02, .25, .02, BLACK, { fine: true });
    },
    'coffee-counter'(m, p, r) {
      const { w, d, h } = p; m.box(0, 0, 0, w, h - .04, d, '#3a3e46'); m.box(0, h - .04, 0, w + .04, .04, d + .04, '#6a6f78');
      m.box(-.3, h, -.05, .4, .5, .35, '#1c1e22'); m.panel(-.3, h + .38, .126, .2, .08, '#ff5a8c', { glow: 1.6 }); m.box(-.3, h + .15, .1, .1, .02, .1, '#9aa2aa'); m.cyl(-.3, h + .02, .08, .04, .09, '#e8e2d4', { sides: 6 });
      m.flat(-.3, h + .001, .2, .15, .12, '#2a1a12'); m.box(-.3, h + .12, .08, .01, .08, .01, '#3a2216');
      for (let k = 0; k < 5; k++) m.cyl(.2 + k * .08, h, -.1, .035, .1, '#e8e2d4', { sides: 6, fine: true });
    },
    // club
    'dance-tiles'(m, p, r) {
      const n = 8, tw = p.w / n, td = p.d / n, cols = ['#ff2a66', '#3d62ff', '#8aff4a', '#fcee0a', '#ff5a8c', '#ff2a3a'];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const on = r() < .55, c = on ? pick(r, cols) : '#101016';
        m.box(-p.w / 2 + tw * (i + .5), 0, -p.d / 2 + td * (j + .5), tw - .04, .03, td - .04, c, { glow: on ? .55 + r() * .45 : 0 });
      }
      m.box(0, 0, 0, p.w + .08, .025, p.d + .08, '#08080c');
    },
    'light-rig'(m, p, r) {
      const { w, d, h } = p, bar = '#1a1a20', y = h - .25, cols = ['#ff2a66', '#3d62ff', '#8aff4a', '#ff2a3a', '#fcee0a'];
      for (const sz of [-1, 1]) { m.box(0, y, sz * d / 2, w, .12, .12, bar); m.box(sz * w / 2, y, 0, .12, .12, d, bar); }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(sx * w / 2, y + .12, sz * d / 2, .04, 3.6 - y - .12, .04, BLACK, { fine: true });
      for (let k = 0; k < 12; k++) {
        const side = k % 4, t = (Math.floor(k / 4) + .5) / 3 - .5, x = side < 2 ? t * w : (side === 2 ? -1 : 1) * w / 2, z = side < 2 ? (side === 0 ? -1 : 1) * d / 2 : t * d, c = pick(r, cols);
        m.cyl(x, y - .22, z, .08, .2, '#2a2a30', { sides: 6, rx: (r() - .5) * .8, rz: (r() - .5) * .8 });
        m.cyl(x, y - .24, z, .06, .02, c, { sides: 6, glow: 2.2, bottom: true });
      }
    },
    'speaker-stack'(m, p) {
      const { w, d, h } = p;
      for (const [y, hh] of [[0, h * .55], [h * .55, h * .45]]) { m.box(0, y, 0, w, hh - .01, d, '#1a1b20'); m.cyl(0, y + hh * .5, d / 2 - .02, Math.min(w, hh) * .36, .04, '#2e3038', { rx: Math.PI / 2, sides: 10 }); m.cyl(0, y + hh * .5, d / 2 + .01, Math.min(w, hh) * .14, .02, '#44464e', { rx: Math.PI / 2, sides: 8 }); }
      m.panel(w * .38, h - .08, d / 2 + .005, .04, .04, '#8aff4a', { glow: 2 });
    },
    'bar-counter'(m, p, r) {
      const { w, d, h } = p; m.box(0, 0, 0, w, h - .05, d, '#2a1c28'); m.box(0, h - .05, 0, w + .06, .05, d + .06, '#15111a');
      m.box(0, .08, d / 2 + .005, w - .06, .04, .01, '#ff2a66', { glow: LIT });
      for (let k = 0; k < 5; k++) m.cyl((r() - .5) * (w - .2), h, (r() - .5) * (d - .2), .03, .1 + r() * .08, pick(r, ['#cfe3ea', '#3a6a4a', '#8a3a2a', '#cfe3ea']), { sides: 6, fine: k > 1 });
      m.flat((r() - .5) * w * .5, h + .001, 0, .3, .2, '#3a1a2a', { ry: r() * 3 });
    },
    'back-bar'(m, p, r) {
      const { w, d, h } = p; m.box(0, 0, 0, w, .9, d, '#2a1c28'); m.box(0, .9, -d / 2 + .02, w, h - .9, .04, '#1a1420');
      m.box(0, .9, -d / 2 + .05, w - .06, h - 1.0, .01, '#ff5a8c', { glow: .6 });
      for (let k = 0; k < 3; k++) { const y = 1.05 + k * .3; m.box(0, y, 0, w - .04, .02, d - .04, '#c9d6e2', { glow: .4 }); let x = -w / 2 + .06; while (x < w / 2 - .06) { m.cyl(x, y + .02, 0, .035, .18 + r() * .1, pick(r, ['#3a6a4a', '#8a3a2a', '#9a6a3a', '#cfe3ea', '#5a3a6a', '#2a4a6a']), { sides: 6, glow: .25, fine: k === 2 }); x += .09; } }
    },
    'vip-booth'(m, p, r) {
      const { w, d } = p, col = p.params.col || '#4a1d33', dark = shade(col, .75);
      m.box(0, 0, -d / 2 + .3, w, .45, .6, dark); m.box(0, .45, -d / 2 + .1, w, .5, .2, col);
      for (const sx of [-1, 1]) { m.box(sx * (w / 2 - .3), 0, .15, .6, .45, d - .9, dark); m.box(sx * (w / 2 - .1), .45, .15, .2, .5, d - .9, col); }
      m.cyl(0, .6, .2, .42, .04, '#15111a', { sides: 10 }); m.cyl(0, 0, .2, .06, .6, CHROME, { sides: 6 });
      for (let k = 0; k < 4; k++) m.cyl((r() - .5) * .5, .64, .2 + (r() - .5) * .4, .03, .12, '#cfe3ea', { sides: 6, fine: true });
      m.box(.1, .64, .1, .25, .12, .04, '#9a6a3a', { glow: .4, fine: true });
    },
    'dj-desk'(m, p, r) {
      const { w, d, h } = p; m.box(0, 0, 0, w, h - .1, d, '#15151c'); m.box(0, .15, d / 2 + .005, w - .1, .06, .01, '#3d62ff', { glow: LIT });
      m.box(0, h - .1, 0, w, .06, d, '#23232c');
      for (const x of [-.6, .6]) { m.box(x, h - .04, 0, .5, .04, .45, '#2e2e38'); m.cyl(x, h, 0, .17, .015, '#101014', { sides: 12 }); m.cyl(x, h + .015, 0, .04, .01, '#ff2a66', { sides: 6, glow: 1.5 }); }
      m.box(0, h - .04, 0, .4, .05, .4, '#2e2e38'); for (let k = 0; k < 6; k++) m.box(-.12 + (k % 3) * .12, h + .01, -.08 + Math.floor(k / 3) * .16, .04, .01, .04, pick(r, ['#8aff4a', '#ff2a66', '#3d62ff']), { glow: 2 });
      m.box(.1, h + .02, -.3, .4, .02, .28, '#2a2d33', { rx: -.2 }); m.box(.1, h + .1, -.4, .4, .26, .02, '#2a2d33', { rx: .3 });
    },
    'velvet-rope'(m, p) {
      for (const [x, a] of [[-1.05, 1.2], [1.0, -.4]]) m.group(x, 0, 0, 0, 0, 0, () => { m.cyl(0, .06, 0, .15, .04, CHROME, { rx: Math.PI / 2 - .05, sides: 8 }); m.cyl(.45 * Math.cos(a), .04, .45 * Math.sin(a), .025, .85, '#9a6a3a', { rz: Math.PI / 2, ry: -a, sides: 6 }); });
      m.box(0, 0, .05, 1.9, .05, .05, '#8a1a3a', { ry: .1 }); m.box(.3, 0, .15, .6, .05, .05, '#8a1a3a', { ry: -.4 });
    },
    'cloak-counter'(m, p, r) { const { w, d, h } = p; m.box(0, 0, 0, w, h - .05, d, '#2a2330'); m.box(0, h - .05, 0, w + .06, .05, d + .06, '#15111a'); m.box(0, .08, d / 2 + .005, w - .06, .03, .01, '#ff5a8c', { glow: LIT }); m.box(.5, h, 0, .1, .1, .1, '#9a6a3a', { fine: true }); },
    'coat-rail'(m, p, r) {
      const { w, d, h } = p; for (const sx of [-1, 1]) m.box(sx * (w / 2 - .03), 0, 0, .04, h, .04, CHROME); m.box(0, h - .04, 0, w, .03, .03, CHROME); m.box(0, 0, 0, w, .04, d, STEEL_D);
      for (let k = 0; k < 7; k++) m.box(-w / 2 + .18 + k * (w - .3) / 6, h - .95 - r() * .15, 0, .1, .9 + r() * .1, d - .08, pick(r, ['#2a2d33', '#5a2438', '#3a4a5a', '#6a5a4c', '#1c1e22']), { ry: (r() - .5) * .3 });
    },
    // bar
    'pool-table'(m, p, r) {
      const { w, d, h } = p;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(sx * (w / 2 - .12), 0, sz * (d / 2 - .15), .14, h - .15, .14, '#3a2418');
      m.box(0, h - .2, 0, w, .12, d, '#4a2e1e'); m.box(0, h - .08, 0, w - .16, .02, d - .16, '#1f6a4a');
      for (const sx of [-1, 1]) m.box(sx * (w / 2 - .04), h - .08, 0, .08, .08, d, '#4a2e1e'); for (const sz of [-1, 1]) m.box(0, h - .08, sz * (d / 2 - .04), w, .08, .08, '#4a2e1e');
      const balls = ['#e8e8e8', '#e0e070', '#3d62ff', '#c93a3a', '#6a3a8a', '#e87a2a', '#2a8a4a', '#15171b', '#8a2a2a'];
      for (let k = 0; k < balls.length; k++) m.cyl((r() - .5) * (w - .4), h - .06, (r() - .5) * (d - .4), .03, .055, balls[k], { sides: 6 });
      m.box(.1, h - .03, .2, .02, .02, 1.45, '#a88a6a', { ry: .5 }); m.box(0, h - .06, -d * .3, .06, .02, .06, '#3d62ff', { fine: true });
    },
    jukebox(m, p, r) {
      const { w, d, h } = p; m.box(0, 0, 0, w, h * .6, d, '#3a1c2a');
      m.taper(0, h * .6, 0, w, d, w * .8, d * .7, h * .38, '#4a2438');
      m.panel(0, h * .45, d / 2 + .005, w * .7, h * .28, '#ff5a8c', { glow: 1.2 }); m.panel(0, h * .75, d * .36 + .01, w * .6, h * .15, '#fcee0a', { glow: 1.5 });
      for (let k = 0; k < 5; k++) m.box(-w * .3 + k * w * .15, h * .15, d / 2 + .004, .06, .08, .01, pick(r, ['#8aff4a', '#ff2a66', '#3d62ff']), { glow: 2 });
    },
    booth(m, p, r) {
      const { w, d, h } = p, col = '#5a2a2a';
      for (const sx of [-1, 1]) { m.box(sx * (w / 2 - .22), 0, 0, .44, .45, d, shade(col, .8)); m.box(sx * (w / 2 - .07), .45, 0, .14, h - .45, d, col); }
      m.box(0, .72, 0, w - 1.0, .04, d - .1, '#3a2418'); m.box(0, 0, 0, .1, .72, .1, STEEL_D);
      for (let k = 0; k < 3; k++) m.cyl((r() - .5) * .3, .76, (r() - .5) * (d - .4), .035, .12, pick(r, ['#9a6a3a', '#cfe3ea', '#3a6a4a']), { sides: 6, fine: true, rz: k === 0 ? Math.PI / 2 : 0 });
    },
    'cue-rack'(m, p, r) { const z = -p.d / 2 + .02; m.box(0, .5, z, p.w, .06, .03, '#3a2418'); m.box(0, 1.5, z, p.w, .06, .03, '#3a2418'); for (let k = 0; k < 5; k++) m.box(-p.w / 2 + .1 + k * (p.w - .2) / 4, .4, z + .03, .025, 1.3, .025, '#a88a6a', { rz: (r() - .5) * .04 }); },
    // capsule hotel
    'capsule-pods'(m, p, r) {
      const { w, d, h } = p, shell = '#e3dfe6', inside = '#ff5a8c', open = p.params.v === 1;
      for (let k = 0; k < 2; k++) {
        const y = k * h / 2, ph = h / 2 - .02;
        m.box(0, y, 0, w, ph, d, shell); m.box(0, y + .08, d / 2, w - .12, ph - .16, .01, inside, { glow: 1.3 });
        const curtain = k === 0 && open ? .45 : .9;
        m.box(-(w - .12) / 2 + (w - .12) * curtain / 2, y + .08, d / 2 + .01, (w - .12) * curtain, ph - .16, .01, '#6a5a78');
        if (k === 0 && open) m.box(.3, y + .08, d / 2 - .2, .22, .18, .3, '#3a4a5a');
        m.box(w * .35, y + ph - .1, d / 2 + .012, .06, .04, .01, '#8aff4a', { glow: 1.5, fine: true });
      }
      m.box(0, h / 2 - .02, d / 2, w, .03, .12, '#c9c4cc'); m.box(w / 2 - .06, 0, d / 2 + .06, .03, h / 2, .03, CHROME, { fine: true });
      // from above: the stack's top (a vent, its number glyph) and the pink light at its open end
      m.box(0, h, 0, w - .1, .02, d - .2, '#cfcad4'); m.box(0, h + .02, -d * .2, w * .5, .02, .3, '#9a96a0'); m.box(0, h + .02, d * .25, .12, .005, .16, '#2a2630');
      m.box(0, h - .06, d / 2 - .03, w - .04, .06, .06, '#ff5a8c', { glow: 1.4 });
      m.flat(0, FY, d / 2 + .35, w - .05, .6, '#ff5a8c', { glow: .22 });
    },
    'side-pods'(m, p, r) {
      const { w, d, h } = p, shell = '#e3dfe6';
      for (let k = 0; k < 2; k++) {
        const y = k * h / 2, ph = h / 2 - .02;
        m.box(0, y, 0, w, ph, d, shell); m.box(0, y + .1, d / 2, w - .2, ph - .2, .01, '#ff5a8c', { glow: 1.3 });
        const n = 3; for (let c = 0; c < n; c++) if (!(k === 1 && c === 2)) m.box(-w / 2 + .1 + (w - .2) * (c + .5) / n, y + .1, d / 2 + .01, (w - .2) / n - .02, ph - .2, .01, pick(r, ['#6a5a78', '#5a4a68']));
      }
      m.box(0, h / 2 - .02, d / 2, w, .03, .1, '#c9c4cc');
      m.box(0, h, 0, w - .1, .02, d - .1, '#cfcad4'); m.box(0, h - .06, d / 2 - .03, w - .04, .06, .06, '#ff5a8c', { glow: 1.4 });
      m.flat(0, FY, d / 2 + .3, w - .1, .5, '#ff5a8c', { glow: .2 });
    },
    'shoe-lockers'(m, p) {
      const { w, d, h } = p, cols = Math.max(2, Math.round(w / .3)), rows = 4; m.box(0, 0, 0, w, h, d, '#b8a88a');
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { const x = -w / 2 + (i + .5) * w / cols, y = .1 + (j + .5) * (h - .15) / rows; m.box(x, y - .14, d / 2, w / cols - .03, .28, .01, '#cbbd9e'); m.box(x, y, d / 2 + .01, .06, .03, .01, '#5a4a3a', { fine: true }); }
    },
    'shower-stall'(m, p) {
      const { w, d, h } = p; m.box(0, 0, 0, w, .06, d, '#dfe3e6');
      for (const sx of [-1, 1]) m.box(sx * (w / 2 - .02), .06, 0, .04, h - .06, d, '#c9d6dc'); m.box(0, .06, -d / 2 + .02, w - .08, h - .06, .04, '#d6dfe4');
      m.box(0, .2, d / 2 - .02, w - .1, h - .4, .01, '#a8bab4', { glow: .1 }); m.box(0, h - .4, -d / 2 + .12, .15, .04, .15, CHROME);
    },
    // karaoke
    'karaoke-sofa'(m, p) {
      const { w, d, h } = p, col = p.params.col || '#5a2a44';
      m.box(0, 0, 0, w, .42, d, shade(col, .8)); m.box(0, .42, .05, w - .1, .06, d - .2, col); m.box(0, .42, -d / 2 + .09, w, h - .42, .18, col);
      if (p.params.v === 1) { m.box(-w / 2 + d / 2, 0, d / 2 + .45, d, .42, .9, shade(col, .8)); m.box(-w / 2 + .09, .42, d / 2 + .45, .18, h - .42, .9, col); }
      m.box(0, .08, d / 2 + .005, w - .1, .03, .01, '#ff2a66', { glow: 1.2 });
    },
    'karaoke-table'(m, p, r) {
      const { w, d, h } = p; m.box(0, 0, 0, w, h - .03, d, '#1a1820'); m.box(0, h - .03, 0, w + .02, .03, d + .02, '#2a2632');
      m.box(-w * .25, h, 0, .22, .015, .15, BLACK); m.box(-w * .25, h + .015, 0, .2, .003, .13, '#b8e8c8', { glow: 1.5 });
      m.box(w * .15, h, .05, .2, .04, .04, '#2a2d33', { ry: .4 });
      for (let k = 0; k < 4; k++) m.cyl((r() - .5) * w * .8, h, (r() - .5) * d * .6, .03, .12, pick(r, ['#cfe3ea', '#9a6a3a', '#8a3a2a']), { sides: 6, rz: p.params.v === 1 && k < 2 ? Math.PI / 2 : 0, fine: k > 1 });
      if (p.params.v === 1) m.flat(0, h + .001, 0, w * .5, d * .6, '#3a1a24');
    },
    mic(m, p) { m.box(0, .02, 0, .25, .035, .035, '#2a2d33'); m.cyl(.14, .005, 0, .03, .06, '#7a8088', { rz: Math.PI / 2, sides: 6 }); m.box(-.2, 0, .1, .2, .01, .01, BLACK, { ry: .6 }); },
    'jammed-door'(m, p) { const { w, h } = p; m.box(0, 0, 0, w, h, .05, '#3a2a44'); m.box(w / 2 - .1, 1.0, .04, .03, .15, .03, CHROME); m.box(0, .05, -.1, .2, .08, .12, '#6a5a3a', { ry: .3 }); },
  };
}
