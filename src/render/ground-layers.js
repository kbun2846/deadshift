// The ground's colour on a map with terrain, as one world-space texture the
// terrain material reads per pixel (terrain-mesh.js). RTIN puts very few
// vertices on flat ground, so tints baked per vertex blurred into big
// triangles there; a texture keeps a path's edge where it is.
//
// Baked once at load from the map's data, in layers, each over the one
// before (colours mixed in linear light, stored as sRGB bytes):
//  1. the map's ground colour (map.palette.ground);
//  2. map.groundLayers, in order: [{ poly: [[x, z], ...], colour: '#hex' (or
//     a list of colours, mixed by slow noise: leaf litter), feather: metres
//     of soft edge (1), mix: 0..1 (1), noise: 0..1 (.3): a ragged edge and
//     patchiness }] (woods litter, field stubble, graveyard turf, yards);
//  3. banks: steep ground, earthier (map.terrainLook.bank, bankMix);
//  4. low ground: damp below terrainLook.dampBelow (0 m), full over dampDepth
//     (1.2 m), and, when the map names one, a hollow colour below hollowBelow
//     (terrainLook.hollow, hollowDepth, hollowMix), their edges broken by noise
//     so they are not contour lines;
//  5. paths (map.terrain.paths): packed and lighter (map.palette.road, or a
//     path's own `colour`, `colourMix`), soft, slightly uneven edges with a
//     worn, broken fringe; a path in damp ground takes a little of the damp;
//  6. a slow variation in tone so big areas are never one flat colour
//     (terrainLook.variation, .06).
// Each layer and path is drawn only over its own box (grown by its edge),
// and its edge distance only near its own segments, so the cost follows what
// is drawn, not the map's size times the layer count.
//
// Pure: no three.js here (terrain-mesh.js makes the texture), so the bake runs
// in Node tests.
import { addWorldXZ, shadeSampler } from './hill-shade.js';

// Metres per texel, per preset: under a million texels for a 172 x 160 m map.
export const GROUND_TEXEL = { potato: .5, performance: .5, balanced: .35, quality: .25, extreme: .25 };

const DEFAULTS = { ground: '#6e6a50', road: '#857a5c', bank: '#5f5842', bankMix: .55, damp: '#57503e', dampBelow: 0, dampDepth: 1.2, dampMix: .7, hollowBelow: -1, hollowDepth: 1, hollowMix: .65, variation: .06 };

// sRGB hex to linear [r, g, b] and back to a byte.
export function linear(hex) {
 const v = parseInt(String(hex).replace('#', ''), 16);
 return [v >> 16 & 255, v >> 8 & 255, v & 255].map(c => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
}
const SRGB = new Uint8Array(4097);
for (let i = 0; i <= 4096; i++) { const c = i / 4096; SRGB[i] = Math.round(255 * (c <= .0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - .055)); }
const toByte = c => SRGB[c <= 0 ? 0 : c >= 1 ? 4096 : Math.round(c * 4096)];

// Smooth value noise, 0..1, on a unit lattice.
function hash(ix, iz, seed) {
 let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 2147483647);
 h = Math.imul(h ^ (h >>> 13), 1274126177);
 return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise(x, z, seed = 0) {
 const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
 const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
 const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
 return a + (b - a) * u + (c - a + (d - c - b + a) * u) * v;
}
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// Across a half-metre step each way: the rise per metre, where a retaining
// wall's drop (steeper than 1:1) on one side gives way to the other side's
// slope, as the mesh's normals do (terrain-mesh.js riseAcross), so the ground
// at a wall's top and foot is not painted as a bank.
function riseAcross(a, c, b) {
 const l = c - a, r = b - c;
 if (Math.abs(l) <= .5 && Math.abs(r) <= .5) return l + r;
 return 2 * (Math.abs(l) < Math.abs(r) ? l : r);
}

// Values on the height grid, bilinear at each texel's centre.
function resample(values, grid, frame) {
 const { cols, rows, cell, minX, minZ } = grid, { originX, originZ, texel, width, height } = frame;
 const out = new Float32Array(width * height), per = 1 / cell, cx = new Int32Array(width), tx = new Float32Array(width);
 for (let i = 0; i < width; i++) {
  const f = Math.max(0, Math.min(cols - 1, (originX + (i + .5) * texel - minX) * per)), c = Math.min(cols - 2, Math.floor(f));
  cx[i] = c; tx[i] = f - c;
 }
 for (let j = 0; j < height; j++) {
  const f = Math.max(0, Math.min(rows - 1, (originZ + (j + .5) * texel - minZ) * per)), r = Math.min(rows - 2, Math.floor(f)), tz = f - r;
  for (let i = 0; i < width; i++) {
   const k = r * cols + cx[i], t = tx[i], a = values[k], b = values[k + 1], d = values[k + cols], e = values[k + cols + 1];
   const top = a + (b - a) * t;
   out[j * width + i] = top + (d + (e - d) * t - top) * tz;
  }
 }
 return out;
}

// The texture's frame over a ground's grid at `texel` metres.
export function frameFor(grid, texel) {
 const spanX = (grid.cols - 1) * grid.cell, spanZ = (grid.rows - 1) * grid.cell;
 return { originX: grid.minX, originZ: grid.minZ, texel, width: Math.max(1, Math.ceil(spanX / texel)), height: Math.max(1, Math.ceil(spanZ / texel)) };
}

// Distance from each texel of a box to a polyline (or a closed ring), kept
// only within `reach` of it (farther stays at reach). Returns the box and its
// distances.
function distanceField(frame, points, reach, closed) {
 const { originX, originZ, texel, width, height } = frame;
 let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
 for (const [x, z] of points) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
 const toI = x => (x - originX) / texel - .5, toJ = z => (z - originZ) / texel - .5;
 const i0 = Math.max(0, Math.floor(toI(x0 - reach))), i1 = Math.min(width - 1, Math.ceil(toI(x1 + reach)));
 const j0 = Math.max(0, Math.floor(toJ(z0 - reach))), j1 = Math.min(height - 1, Math.ceil(toJ(z1 + reach)));
 if (i1 < i0 || j1 < j0) return null;
 const w = i1 - i0 + 1, h = j1 - j0 + 1, dist = new Float32Array(w * h).fill(reach);
 const count = closed ? points.length : points.length - 1;
 for (let s = 0; s < count; s++) {
  const [ax, az] = points[s], [bx, bz] = points[(s + 1) % points.length];
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const si0 = Math.max(i0, Math.floor(toI(Math.min(ax, bx) - reach))), si1 = Math.min(i1, Math.ceil(toI(Math.max(ax, bx) + reach)));
  const sj0 = Math.max(j0, Math.floor(toJ(Math.min(az, bz) - reach))), sj1 = Math.min(j1, Math.ceil(toJ(Math.max(az, bz) + reach)));
  for (let j = sj0; j <= sj1; j++) {
   const z = originZ + (j + .5) * texel;
   // Only the stretch of this row within reach of the segment (a long
   // diagonal path's box is mostly empty).
   let lo = si0, hi = si1;
   if (Math.abs(dz) > 1e-9) {
    const ta = Math.max(0, Math.min(1, (z - reach - az) / dz)), tb = Math.max(0, Math.min(1, (z + reach - az) / dz));
    const xa = ax + dx * ta, xb = ax + dx * tb;
    lo = Math.max(si0, Math.floor(toI(Math.min(xa, xb) - reach))); hi = Math.min(si1, Math.ceil(toI(Math.max(xa, xb) + reach)));
   }
   for (let i = lo; i <= hi; i++) {
    const x = originX + (i + .5) * texel;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    const ex = ax + dx * t - x, ez = az + dz * t - z, d = Math.sqrt(ex * ex + ez * ez), k = (j - j0) * w + i - i0;
    if (d < dist[k]) dist[k] = d;
   }
  }
 }
 return { i0, j0, w, h, dist };
}

// Which texels of a field's box are inside a polygon: each row's crossings,
// sorted, fill between pairs (even-odd, as insidePoly).
function insideMask(frame, field, poly) {
 const { originX, originZ, texel } = frame, { i0, j0, w, h } = field, inside = new Uint8Array(w * h), xs = [];
 for (let r = 0; r < h; r++) {
  const z = originZ + (j0 + r + .5) * texel; xs.length = 0;
  for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
   const [ax, az] = poly[a], [bx, bz] = poly[b];
   if ((az > z) !== (bz > z)) xs.push(ax + (z - az) / (bz - az) * (bx - ax));
  }
  xs.sort((p, q) => p - q);
  for (let k = 0; k + 1 < xs.length; k += 2) {
   const from = Math.max(0, Math.ceil((xs[k] - originX) / texel - .5) - i0), to = Math.min(w - 1, Math.floor((xs[k + 1] - originX) / texel - .5) - i0);
   for (let c = from; c <= to; c++) inside[r * w + c] = 1;
  }
 }
 return inside;
}

// `grid`: heightsOf(ground) (hill-shade.js); `map`: the map's data; `texel`:
// metres; `shade`: a hill-shade bake to carry in the alpha. Returns { data
// (RGBA bytes: sRGB colour, linear alpha), width, height, originX, originZ,
// texel, ms, steps: { base, layers, low, paths, finish } (ms each) }.
export function bakeGroundLayers(grid, map, texel = .5, { seed = 7, shade = null } = {}) {
 const t0 = now(), frame = frameFor(grid, texel), { originX, originZ, width, height } = frame, count = width * height;
 const palette = map.palette || {}, look = { ...DEFAULTS, ...(map.terrainLook || {}) };
 const rgb = new Float32Array(count * 3);
 const put = (k, c, a) => { const o = k * 3; rgb[o] += (c[0] - rgb[o]) * a; rgb[o + 1] += (c[1] - rgb[o + 1]) * a; rgb[o + 2] += (c[2] - rgb[o + 2]) * a; };
 // 1. Base colour, and each texel's height, slope and slow tone variation for
 // the later layers (worked out on the half-metre grid, then resampled).
 const { cols, rows } = grid, points = grid.heights, slopeAt = new Float32Array(points.length), toneAt = new Float32Array(points.length), wetAt = new Float32Array(points.length);
 for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const k = r * cols + c, h = points[k];
  const sx = riseAcross(points[c > 0 ? k - 1 : k], h, points[c < cols - 1 ? k + 1 : k]), sz = riseAcross(points[r > 0 ? k - cols : k], h, points[r < rows - 1 ? k + cols : k]);
  slopeAt[k] = Math.sqrt(sx * sx + sz * sz);
  const x = grid.minX + c * grid.cell, z = grid.minZ + r * grid.cell;
  toneAt[k] = noise(x / 23, z / 23, seed + 11) * .65 + noise(x / 7, z / 7, seed + 12) * .35 - .5;
  wetAt[k] = (noise(x * .35, z * .35, seed + 7) - .5) * .5;
 }
 const heights = resample(points, grid, frame), slopes = resample(slopeAt, grid, frame), tones = resample(toneAt, grid, frame), wobbles = resample(wetAt, grid, frame);
 const base = linear(palette.ground || DEFAULTS.ground);
 for (let k = 0; k < count; k++) { rgb[k * 3] = base[0]; rgb[k * 3 + 1] = base[1]; rgb[k * 3 + 2] = base[2]; }
 const t1 = now();
 // 2. The map's layers, in order.
 (map.groundLayers || []).forEach((layer, n) => {
  const feather = Math.max(texel, layer.feather ?? 1), rough = layer.noise ?? .3, amount = layer.mix ?? 1;
  const wobble = rough * (.6 + feather * .5), reach = feather / 2 + wobble + texel;
  const colours = [].concat(layer.colour || '#808080').map(linear), s = seed + 101 * (n + 1);
  const field = distanceField(frame, layer.poly, reach, true); if (!field) return;
  const inside = insideMask(frame, field, layer.poly), { i0, j0, w, h, dist } = field, c = [0, 0, 0];
  for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) {
   const f = r * w + q, x = originX + (i0 + q + .5) * texel, z = originZ + (j0 + r + .5) * texel;
   const signed = inside[f] ? dist[f] : -dist[f];
   if (signed <= -reach + texel) continue;
   const edge = (noise(x * .45, z * .45, s) - .5) * 2 * wobble;
   let a = smooth(-feather / 2, feather / 2, signed + edge);
   if (a <= 0) continue;
   a *= amount * (1 - rough * .45 * noise(x * .9, z * .9, s + 1));
   // Several colours: mixed by slow noise (a litter of different leaves).
   let pick = colours[0];
   if (colours.length > 1) {
    const m = noise(x * .3, z * .3, s + 2) * (colours.length - 1), lo = Math.min(colours.length - 2, Math.floor(m)), t = m - lo;
    for (let ch = 0; ch < 3; ch++) c[ch] = colours[lo][ch] + (colours[lo + 1][ch] - colours[lo][ch]) * t;
    pick = c;
   }
   const tone = 1 + rough * .16 * (noise(x * 1.7, z * 1.7, s + 3) - .5);
   const o = (j0 + r) * width + i0 + q;
   put(o, [pick[0] * tone, pick[1] * tone, pick[2] * tone], a);
  }
 });
 const t2 = now();
 // 3-4. Banks, then damp and hollow ground (every texel: they follow heights).
 const bank = linear(look.bank), damp = linear(look.damp), hollow = look.hollow ? linear(look.hollow) : null;
 const wet = new Float32Array(count);
 for (let k = 0; k < count; k++) {
  const b = smooth(.12, .5, slopes[k]) * look.bankMix;
  if (b > 0) put(k, bank, b);
  const h = heights[k];
  if (h > look.dampBelow + .3) continue;
  const n = wobbles[k], d = smooth(0, 1, (look.dampBelow - h + n) / look.dampDepth) * look.dampMix;
  if (d > 0) { put(k, damp, d); wet[k] = d; }
  if (hollow) { const w = smooth(0, 1, (look.hollowBelow - h + n) / look.hollowDepth) * look.hollowMix; if (w > 0) put(k, hollow, w); }
 }
 const t3 = now();
 // 5. Paths: a soft edge half a metre wide, moved in and out a little along
 // the way (a worn, uneven edge), and a broken fringe of wear just outside.
 const road = palette.road || DEFAULTS.road;
 (map.terrain?.paths || []).forEach((path, n) => {
  // (A path with colourMix 0 shapes the ground only: no worn track.)
  if (path.colourMix === 0) return;
  const points = path.points.map(p => [p[0], p[1]]), colour = linear(path.colour || road), amount = path.colourMix ?? .85;
  const half = path.width / 2 + (path.colourPad ?? .3), soft = .3, wear = .7, reach = half + soft + wear + .3, s = seed + 911 * (n + 1);
  const field = distanceField(frame, points, reach, false); if (!field) return;
  const { i0, j0, w, h, dist } = field, c = [0, 0, 0];
  for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) {
   const f = r * w + q; if (dist[f] >= reach) continue;
   const x = originX + (i0 + q + .5) * texel, z = originZ + (j0 + r + .5) * texel;
   const d = dist[f] + (noise(x * .7, z * .7, s) - .5) * .5;
   let a = 1 - smooth(half - soft, half + soft, d);
   // The fringe: broken patches of wear, fading out over `wear`.
   const fringe = (1 - smooth(half, half + wear, d)) * smooth(.45, .75, noise(x * 1.6, z * 1.6, s + 1)) * .45;
   a = Math.max(a, fringe) * amount;
   if (a <= 0) continue;
   const o = (j0 + r) * width + i0 + q, tone = 1 + .08 * (noise(x * 1.3, z * 1.3, s + 2) - .5), wetness = wet[o] * .35;
   for (let ch = 0; ch < 3; ch++) c[ch] = (colour[ch] + (damp[ch] - colour[ch]) * wetness) * tone;
   put(o, c, a);
  }
 });
 const t4 = now();
 // 6. Slow variation in tone, then sRGB bytes.
 const data = new Uint8Array(count * 4), vary = look.variation;
 for (let k = 0; k < count; k++) {
  const n = tones[k], light = 1 + vary * 2 * n, warm = vary * .5 * n;
  const o = k * 3, p = k * 4;
  data[p] = toByte(rgb[o] * light * (1 + warm)); data[p + 1] = toByte(rgb[o + 1] * light); data[p + 2] = toByte(rgb[o + 2] * light * (1 - warm)); data[p + 3] = 255;
 }
 // The hill shade (hill-shade.js), if given, rides in the alpha: the sun left.
 if (shade) {
  const sunLeft = shadeSampler(shade);
  for (let j = 0, k = 0; j < height; j++) for (let i = 0; i < width; i++, k++) data[k * 4 + 3] = Math.round(sunLeft(originX + (i + .5) * texel, originZ + (j + .5) * texel) * 255);
 }
 const t5 = now();
 return { data, width, height, originX, originZ, texel, ms: t5 - t0, steps: { base: t1 - t0, layers: t2 - t1, low: t3 - t2, paths: t4 - t3, finish: t5 - t4 } };
}

const now = () => globalThis.performance?.now?.() ?? Date.now();

// The terrain material's ground colour: diffuse x the baked colour (the
// material itself is white), and the texture's alpha (the hill shade) kept
// in `groundSunLeft` for hillShadePatch(..., { source: 'groundSunLeft' }).
// `uniforms`: { groundLook: { value: texture }, groundLookBox: { value: Vector4 } }.
export function groundLayersPatch(uniforms) {
 const patch = shader => {
  addWorldXZ(shader);
  Object.assign(shader.uniforms, uniforms);
  shader.fragmentShader = 'uniform sampler2D groundLook; uniform vec4 groundLookBox;\nfloat groundSunLeft = 1.0;\n' + shader.fragmentShader.replace('#include <color_fragment>',
   `#include <color_fragment>
 {
  vec4 groundLookColour = texture2D( groundLook, ( vLookWorld - groundLookBox.xy ) * groundLookBox.zw );
  diffuseColor.rgb *= groundLookColour.rgb; groundSunLeft = groundLookColour.a;
 }`);
 };
 patch.key = 'ground-layers';
 return patch;
}
