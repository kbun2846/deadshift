// Drawing the ground marks (world/ground-marks.js places them): every flat
// mark (ruts, puddles, prints, mud, straw, chips, ash, grain, leaf drifts...)
// is a small grid draped on the drawn ground with a picture from one canvas
// atlas (render/ground-marks-atlas.js), and all of them are ONE mesh: one
// draw for the whole map. The raised bits (straws, chips, cinders, clods,
// leaves) are instances of one small shape: one more draw. Nothing casts a
// shadow; both receive them. No per-frame work beyond a string compare.
//
// Heights: every vertex lies at the drawn ground (drawnHeightAt) plus the
// preset's mesh error and a few millimetres (as effects/terrain-marks.js
// does), so the drawn ground's own triangles never poke through; a triangle
// that would cut under a crest has its corners raised by as much, and the
// material's polygon offset settles the rest. So nothing z-fights on any
// preset, and nothing floats more than a few centimetres.
//
// Presets: each mark has a tier (MARK_TIER). The mesh's index list is
// rewritten for a preset (marks in draw order, those over its tier left
// out: a preset change touches one buffer, no geometry is rebuilt, and no
// program changes), and the bits' instance count is cut to the preset's
// share (they are sorted by tier). The check runs in the meshes'
// onBeforeRender, so no renderer hook is needed.
//
// Programs: the decal mesh is a Lambert material with a map and vertex
// colours with alpha (one program, built at load by the warm-up like every
// other; a preset change never makes another), the bits use the view's baked
// 'plain' material with instance colours (the ground detail's program:
// nothing new). The bits live in the view's performanceDetails group (the
// ground cover: hidden on Potato, left out of Extreme's occlusion pass).
import * as THREE from 'three';
import { placeGroundMarks, MARK_TIER, RUT_WIDTH } from '../world/ground-marks.js';
import { ATLAS_CELLS, STRIP_LENGTH, groundAtlasTexture } from './ground-marks-atlas.js';

// Over the drawn ground (m): the preset's RTIN error (view.terrainError)
// plus this, as the terrain marks.
export const MARK_LIFT = .006;
// Draped grids: vertices at most this far apart (m) (the height grid's own
// spacing), at most 9 a side.
const SPACING = .5, MAX_SIDE = 9;
// A triangle rising faster than this is a retaining wall's drop: left out.
const STEEPEST = 1.6;
// Where a triangle is checked against the ground: its middle and its sides'
// middles (weights of its three corners).
const WEIGHTS = new Float32Array([1 / 3, 1 / 3, 1 / 3, .5, .5, 0, 0, .5, .5, .5, 0, .5]);

// The raised bits' shape: a low six-sided cone (a chip, a straw, a leaf, a
// cinder, a clod by its scale), unit across and unit high, its facets shaded
// (the instance colour multiplies the shade).
export function bitGeometry() {
 const random = (() => { let s = 20417; return () => (s = s * 16807 % 2147483647) / 2147483647; })();
 const rim = Array.from({ length: 6 }, (_, i) => { const a = i / 6 * Math.PI * 2 + (random() - .5) * .4, r = .42 + random() * .12; return [Math.cos(a) * r, 0, Math.sin(a) * r]; });
 const top = [.06, 1, -.04], positions = [], shades = [];
 for (let i = 0; i < 6; i++) {
  const a = rim[i], b = rim[(i + 1) % 6];
  // (Wound so each facet faces up.)
  positions.push(...top, ...b, ...a);
  shades.push(1.06, .86, .86);
 }
 const g = new THREE.BufferGeometry();
 g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
 g.computeVertexNormals();
 const colour = new Float32Array(shades.length * 3); shades.forEach((s, i) => colour.fill(s, i * 3, i * 3 + 3));
 g.setAttribute('color', new THREE.BufferAttribute(colour, 3));
 return g;
}

// The drawn ground's normal at (x, z) into out[k..k+2].
function normalAt(ground, x, z, out, k) {
 const h = .25, nx = ground.drawnHeightAt(x - h, z) - ground.drawnHeightAt(x + h, z), nz = ground.drawnHeightAt(x, z - h) - ground.drawnHeightAt(x, z + h), ny = 2 * h, l = Math.hypot(nx, ny, nz);
 out[k] = nx / l; out[k + 1] = ny / l; out[k + 2] = nz / l;
}

// Builds the vertex and index lists for every mark. Pure apart from three's
// maths: the node tests call it. Returns { position, normal, uv, color,
// items: [{ tier, layer, start, count }] (index ranges, in draw order),
// index }.
export function drapeMarks(ground, placed, lift) {
 const position = [], normal = [], uv = [], color = [], items = [];
 const tri = [];
 const n3 = [0, 0, 0];
 // One vertex: its ground height (kept for the raise), its uv and colour.
 const vertex = (x, z, u, v, tint, alpha) => {
  const k = position.length / 3;
  position.push(x, ground.drawnHeightAt(x, z), z);
  normalAt(ground, x, z, n3, 0); normal.push(n3[0], n3[1], n3[2]);
  uv.push(u, v); color.push(tint, tint, tint, alpha);
  return k;
 };
 // Triangles of a grid of `cols` x `rows` vertices from vertex `base`, with
 // the checks against the ground (a wall's drop left out; corners raised
 // where the flat triangle would cut under the ground). No allocation per
 // triangle: this runs for every mark at load.
 const one = (base, p, q, s, raise, out) => {
  const P = (base + p) * 3, Q = (base + q) * 3, S = (base + s) * 3;
  const px = position[P], py = position[P + 1], pz = position[P + 2], qx = position[Q], qy = position[Q + 1], qz = position[Q + 2], sx = position[S], sy = position[S + 1], sz = position[S + 2];
  const hi = py > qy ? (py > sy ? py : sy) : (qy > sy ? qy : sy), lo = py < qy ? (py < sy ? py : sy) : (qy < sy ? qy : sy);
  if (hi - lo > STEEPEST * 1.5 * (Math.hypot(px - qx, pz - qz) + 1e-6)) return;
  // The ground at the middle and the sides' middles against the flat triangle.
  let under = 0;
  for (let k = 0; k < 12; k += 3) {
   const wp = WEIGHTS[k], wq = WEIGHTS[k + 1], ws = WEIGHTS[k + 2];
   const d = ground.drawnHeightAt(px * wp + qx * wq + sx * ws, pz * wp + qz * wq + sz * ws) - (py * wp + qy * wq + sy * ws);
   if (d > under) under = d;
  }
  if (under > raise[p]) raise[p] = under; if (under > raise[q]) raise[q] = under; if (under > raise[s]) raise[s] = under;
  out.push(base + p, base + q, base + s);
 };
 const grid = (base, cols, rows) => {
  const out = [], raise = new Float32Array(cols * rows);
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
   const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
   one(base, a, d, b, raise, out); one(base, b, d, e, raise, out);
  }
  for (let k = 0; k < cols * rows; k++) position[(base + k) * 3 + 1] += raise[k] + lift;
  return out;
 };

 // The flat marks.
 for (const m of placed.decals) {
  const cell = ATLAS_CELLS[m.cell]; if (!cell) continue;
  const cols = Math.min(MAX_SIDE, Math.max(2, Math.ceil(m.w / SPACING) + 1)), rows = Math.min(MAX_SIDE, Math.max(2, Math.ceil(m.l / SPACING) + 1));
  const sa = Math.sin(m.yaw), ca = Math.cos(m.yaw), base = position.length / 3;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
   const fu = c / (cols - 1), fv = r / (rows - 1), a = (fu - .5) * m.w, b = (fv - .5) * m.l;
   vertex(m.x + a * ca + b * sa, m.z - a * sa + b * ca, cell.u0 + (m.mirror ? 1 - fu : fu) * cell.du, cell.v0 + fv * cell.dv, m.tint ?? 1, m.alpha ?? 1);
  }
  const t = grid(base, cols, rows);
  items.push({ tier: m.tier, layer: m.layer, start: tri.length, count: t.length }); tri.push(...t);
 }
 // The strips (ruts, cart tracks): rows across the way (three vertices
 // across a rut), cut into pieces no longer than the atlas strip (its
 // picture runs on seamlessly from one piece to the next).
 for (const s of placed.strips) {
  const cell = ATLAS_CELLS[s.cell]; if (!cell) continue;
  const width = s.width ?? RUT_WIDTH, columns = Math.max(3, Math.ceil(width / SPACING) + 1);
  const across = Array.from({ length: columns }, (_, i) => (i / (columns - 1) - .5) * width);
  let v = s.v0 ?? 0, rows = [];
  const emit = () => {
   if (rows.length < 2) { rows = []; return; }
   const base = position.length / 3;
   for (const r of rows) across.forEach((a, i) => vertex(r.x + r.nx * a, r.z + r.nz * a, cell.u0 + (i / (across.length - 1)) * cell.du, cell.v0 + r.v * cell.dv, 1, r.a));
   const t = grid(base, across.length, rows.length);
   items.push({ tier: s.tier, layer: s.layer, start: tri.length, count: t.length }); tri.push(...t);
   rows = [];
  };
  for (let i = 0; i < s.rows.length; i++) {
   const r = s.rows[i];
   if (i > 0) {
    const p = s.rows[i - 1], step = (r.s - p.s) / STRIP_LENGTH;
    if (v + step > 1) {
     // The picture's end falls between these rows: end the piece exactly
     // there and start the next from the same place at the picture's start.
     const t = (1 - v) / step, mid = { x: p.x + (r.x - p.x) * t, z: p.z + (r.z - p.z) * t, nx: p.nx + (r.nx - p.nx) * t, nz: p.nz + (r.nz - p.nz) * t, a: p.a + (r.a - p.a) * t };
     rows.push({ ...mid, v: 1 }); emit(); rows.push({ ...mid, v: 0 }); v = (1 - t) * step;
    } else v += step;
   }
   rows.push({ ...r, v });
  }
  emit();
 }
 return { position, normal, uv, color, items, index: tri };
}

// Builds the marks into the view: { meshes, decals, bits, setQuality, stats }
// or null when the map has none.
export function buildGroundMarks(view, map) {
 const started = performance.now(), ground = view.ground;
 if (!map?.groundMarks || !ground || ground.flat) return null;
 const placed = placeGroundMarks(ground, map), placedAt = performance.now();
 const lift = (view.terrainError ?? .02) + MARK_LIFT;
 const built = drapeMarks(ground, placed, lift), drapedAt = performance.now();
 // Draw order: the ground's own marks first, the leaves last (a stable sort).
 const order = built.items.map((it, i) => ({ ...it, i })).sort((a, b) => a.layer - b.layer || a.i - b.i);
 const vertices = built.position.length / 3;
 const geometry = new THREE.BufferGeometry();
 geometry.setAttribute('position', new THREE.Float32BufferAttribute(built.position, 3));
 geometry.setAttribute('normal', new THREE.Float32BufferAttribute(built.normal, 3));
 geometry.setAttribute('uv', new THREE.Float32BufferAttribute(built.uv, 2));
 geometry.setAttribute('color', new THREE.Float32BufferAttribute(built.color, 4));
 const all = built.index, Index = vertices > 65535 ? Uint32Array : Uint16Array;
 geometry.setIndex(new THREE.BufferAttribute(new Index(all.length), 1));
 geometry.computeBoundingSphere();
 // (The phone presets paint the atlas at half size: a quarter of the work.)
 const atlasTimes = {}, map_ = groundAtlasTexture(atlasTimes, ['potato', 'performance'].includes(view.initialQuality) ? 512 : 1024);
 // (alphaTest: the see-through parts of a picture are thrown away before
 // they are lit or blended; most of a mark's rectangle is see-through.)
 const material = new THREE.MeshLambertMaterial({ map: map_, vertexColors: true, transparent: true, depthWrite: false, alphaTest: .02, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
 const decals = new THREE.Mesh(geometry, material);
 decals.name = 'ground-marks'; decals.renderOrder = -1.1; decals.castShadow = false; decals.receiveShadow = true;
 decals.frustumCulled = false; decals.matrixAutoUpdate = false; decals.updateMatrix();
 view.scene.add(decals);

 // The raised bits.
 const shape = bitGeometry(), list = placed.bits;
 const bitMaterial = view.bakedMaterial ? view.bakedMaterial('plain') : new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, vertexColors: true });
 const bits = new THREE.InstancedMesh(shape, bitMaterial, Math.max(1, list.length));
 const matrix = new THREE.Matrix4(), at = new THREE.Vector3(), turn = new THREE.Quaternion(), spin = new THREE.Quaternion(), tilt = new THREE.Quaternion(), scale = new THREE.Vector3();
 const up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3(), euler = new THREE.Euler(), colour = new THREE.Color(), n3 = [0, 0, 0];
 list.forEach((b, i) => {
  normalAt(ground, b.x, b.z, n3, 0); n.set(n3[0], n3[1], n3[2]);
  turn.setFromUnitVectors(up, n).multiply(spin.setFromAxisAngle(up, b.yaw)).multiply(tilt.setFromEuler(euler.set(b.tiltX, 0, b.tiltZ)));
  bits.setMatrixAt(i, matrix.compose(at.set(b.x, ground.drawnHeightAt(b.x, b.z) + lift - .004, b.z), turn, scale.set(b.sx, b.sy, b.sz)));
  bits.setColorAt(i, colour.set(b.color).multiplyScalar(b.shade));
 });
 if (!list.length) bits.setColorAt(0, colour.set('#000000'));
 // (Its bounds over every bit, before the preset cuts the count: an
 // InstancedMesh's sphere covers only the instances counted when it is made.)
 bits.computeBoundingSphere(); bits.count = 0; bits.castShadow = false; bits.receiveShadow = true; bits.name = 'ground-bits';
 bits.matrixAutoUpdate = false; bits.updateMatrix();
 (view.performanceDetails || view.scene).add(bits);

 // How many of each the tiers draw.
 const bitCount = [0, 1, 2, 3].map(t => list.filter(b => b.tier <= t).length);
 const marks = {
  meshes: [decals, bits], decals, bits, placed, quality: null,
  setQuality(name) {
   marks.quality = name;
   const tier = MARK_TIER[name] ?? MARK_TIER.balanced, index = geometry.index;
   let n = 0;
   for (const it of order) if (it.tier <= tier) { index.array.set(all.slice(it.start, it.start + it.count), n); n += it.count; }
   index.needsUpdate = true; geometry.setDrawRange(0, n);
   bits.count = bitCount[tier];
  },
  stats: null,
 };
 // A preset change is seen the next time either is drawn (no renderer hook).
 const follow = () => { const name = view.qualityName; if (name && name !== marks.quality) marks.setQuality(name); };
 decals.onBeforeRender = follow; bits.onBeforeRender = follow;
 marks.setQuality(view.qualityName || view.initialQuality || 'balanced');
 marks.stats = { ms: performance.now() - started, place: placedAt - started, drape: drapedAt - placedAt, atlas: atlasTimes, vertices, triangles: all.length / 3, decals: placed.decals.length, strips: placed.strips.length, bits: list.length, ...placed.stats };
 view.groundMarkStats = marks.stats;
 return marks;
}
