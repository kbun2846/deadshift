// Hills: bullet marks, soot and burns on the terrain's own ground. On a flat
// map every mark is a DecalGeometry (surface-marks.js), but projected onto
// the RTIN tiles one cost 1-2 ms (it clips every triangle of a 32 m tile) and
// a burn stopped dead at a tile's edge. Here the ground's height grid does the
// work instead: a small mark is one instance of a quad laid on the slope, and
// a burn is a little grid draped over drawnHeightAt, so it crosses tile edges
// and follows hollows and crests. Both are fixed pools; the oldest goes first.
// Marks on walls, buildings, decks and props stay decals (surface-marks.js).
import * as THREE from 'three';

// How many of each the preset keeps (Extreme never fewer than Quality).
export const TERRAIN_MARK_CAP = Object.freeze({
 quads: Object.freeze({ potato: 120, performance: 240, balanced: 480, quality: 900, extreme: 900 }),
 burns: Object.freeze({ potato: 10, performance: 16, balanced: 28, quality: 48, extreme: 48 }),
});
// Wider than this (m) and a mark is draped: a flat quad would float over a
// hollow or sink into a crest.
export const QUAD_MAX = .6;
// A burn's grid: at least 9 x 9 vertices, and no further apart than the
// height grid (0.5 m), so a grenade's 8 m burn still hugs the ground; 17 x 17
// at most (the slot size).
export const BURN_MIN = 9, BURN_MAX = 17, BURN_SPACING = .5;
const SLOT_VERTICES = BURN_MAX * BURN_MAX, SLOT_INDICES = (BURN_MAX - 1) * (BURN_MAX - 1) * 6;
// Height over the grid: the drawn mesh strays from the grid by up to the
// preset's RTIN error (view.terrainError), plus a few millimetres; the
// material's polygonOffset settles the rest.
export const LIFT = .006;
// A grid cell rising faster than this (m per m) is a retaining wall's drop,
// not ground: left out, so no sheet of soot hangs off a wall's top.
const STEEPEST = 1.6, BENT = .08;

// Vertices per side for a burn `size` metres across.
export const burnSide = size => Math.max(BURN_MIN, Math.min(BURN_MAX, Math.ceil(size / BURN_SPACING) + 1));

// Scratch for drapeBurn: each vertex's raise and each triangle's verdict.
const RAISE = new Float32Array(BURN_MAX * BURN_MAX), KEEP = new Uint8Array((BURN_MAX - 1) * (BURN_MAX - 1) * 2);
// Where each of a cell's two triangles (split b-c) is checked against the
// ground (fractions across and down the cell): its middle and its sides'.
const SAMPLES = [[[1 / 3, 1 / 3], [.5, 0], [0, .5], [.5, .5]], [[2 / 3, 2 / 3], [1, .5], [.5, 1], [.5, .5]]];

// Lay one burn's grid over the ground: `n` x `n` vertices over a square
// `size` across centred on (x, z) and turned `yaw`, each at drawnHeightAt
// plus `lift`, into `position`/`uv` from vertex `base`, and its triangles
// into `index` from `at` (SLOT_INDICES of them; unused and left-out ones are
// written as degenerate). Returns the number of triangles kept.
export function drapeBurn(ground, x, z, size, yaw, lift, position, uv, base, index, at, n = burnSide(size)) {
 const cos = Math.cos(yaw), sin = Math.sin(yaw), step = size / (n - 1), half = size / 2;
 const px = (col, row) => x + (col * step - half) * cos - (row * step - half) * sin, pz = (col, row) => z + (col * step - half) * sin + (row * step - half) * cos;
 for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
  const k = base + row * n + col, vx = px(col, row), vz = pz(col, row);
  position[k * 3] = vx; position[k * 3 + 1] = ground.drawnHeightAt(vx, vz); position[k * 3 + 2] = vz;
  uv[k * 2] = col / (n - 1); uv[k * 2 + 1] = 1 - row / (n - 1);
  RAISE[row * n + col] = 0;
 }
 const rise = STEEPEST * step * Math.SQRT2, y = k => position[(base + k) * 3 + 1];
 for (let row = 0; row < n - 1; row++) for (let col = 0; col < n - 1; col++) {
  const a = row * n + col, b = a + 1, c = a + n, d = c + 1, ya = y(a), yb = y(b), yc = y(c), yd = y(d);
  for (let half = 0; half < 2; half++) {
   // The triangle a-c-b, then b-c-d.
   const cell = (row * (n - 1) + col) * 2 + half, first = half ? b : a, last = half ? d : b, y0 = half ? yb : ya, y2 = half ? yd : yb;
   KEEP[cell] = 0;
   // A retaining wall's drop is not ground.
   if (Math.max(y0, yc, y2) - Math.min(y0, yc, y2) > rise) continue;
   // Checked against the ground at a few points: one bent across a wall's
   // lip or foot strays far and is left out; over a crest a flat triangle
   // cuts under the ground, so its corners are raised by as much.
   let under = 0, bent = false;
   for (const [u, v] of SAMPLES[half]) {
    const flat = half ? yd + (yc - yd) * (1 - u) + (yb - yd) * (1 - v) : ya + (yb - ya) * u + (yc - ya) * v;
    const gap = ground.drawnHeightAt(px(col + u, row + v), pz(col + u, row + v)) - flat;
    if (gap > BENT || gap < -BENT) { bent = true; break; }
    if (gap > under) under = gap;
   }
   if (bent) continue;
   KEEP[cell] = 1;
   if (under > RAISE[first]) RAISE[first] = under;
   if (under > RAISE[c]) RAISE[c] = under;
   if (under > RAISE[last]) RAISE[last] = under;
  }
 }
 for (let k = 0; k < n * n; k++) position[(base + k) * 3 + 1] += RAISE[k] + lift;
 let kept = 0, i = at;
 for (let row = 0; row < n - 1; row++) for (let col = 0; col < n - 1; col++) {
  const a = base + row * n + col, b = a + 1, c = a + n, d = c + 1, cell = (row * (n - 1) + col) * 2;
  // Counter-clockwise from above, as the ground's own triangles.
  if (KEEP[cell]) { index[i++] = a; index[i++] = c; index[i++] = b; kept++; }
  if (KEEP[cell + 1]) { index[i++] = b; index[i++] = c; index[i++] = d; kept++; }
 }
 while (i < at + SLOT_INDICES) index[i++] = base;
 return kept;
}

const UP = new THREE.Vector3(0, 1, 0);

export class TerrainMarks {
 // `material`: the soot material the decals use (surface-marks.js), shared so
 // the burns need no new shader and the quads only its instanced variant.
 constructor(view, material) {
  this.view = view; this.ground = view.ground;
  // Built at the largest cap and used up to the preset's: a preset change
  // needs no rebuild, and both are in the scene before the warm-up draws it.
  const quadCap = TERRAIN_MARK_CAP.quads.extreme, burnCap = TERRAIN_MARK_CAP.burns.extreme;
  const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
  this.quads = new THREE.InstancedMesh(plane, material, quadCap);
  this.quads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  this.burns = new THREE.Mesh(new THREE.BufferGeometry(), material);
  const g = this.burns.geometry;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(burnCap * SLOT_VERTICES * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(burnCap * SLOT_VERTICES * 2), 2).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(burnCap * SLOT_INDICES), 1).setUsage(THREE.DynamicDrawUsage));
  for (const mesh of [this.quads, this.burns]) {
   // Same place in the draw order as the decals: over the ground, under
   // transparent effects. Never culled (the pools span the map).
   mesh.userData.surfaceMark = true; mesh.renderOrder = -1; mesh.frustumCulled = false;
   mesh.matrixAutoUpdate = false; view.scene.add(mesh);
  }
  this.matrix = new THREE.Matrix4(); this.turn = new THREE.Quaternion(); this.tilt = new THREE.Quaternion();
  this.normal = new THREE.Vector3(); this.at = new THREE.Vector3(); this.scale = new THREE.Vector3();
  this.clear();
 }

 cap(kind) { return TERRAIN_MARK_CAP[kind][this.view.qualityName] ?? TERRAIN_MARK_CAP[kind].balanced; }
 get lift() { return (this.view.terrainError ?? .02) + LIFT; }

 // One mark `size` across at (x, z) on the ground.
 mark(x, z, size) { if (size > QUAD_MAX) this.burn(x, z, size); else this.quad(x, z, size); }

 quad(x, z, size) {
  const cap = this.cap('quads'), i = this.quadNext % cap, ground = this.ground, h = .25;
  // The drawn ground's own slope here (gradientAt reads the grid with decks).
  this.normal.set(ground.drawnHeightAt(x - h, z) - ground.drawnHeightAt(x + h, z), 2 * h, ground.drawnHeightAt(x, z - h) - ground.drawnHeightAt(x, z + h)).normalize();
  this.tilt.setFromUnitVectors(UP, this.normal).multiply(this.turn.setFromAxisAngle(UP, Math.random() * Math.PI * 2));
  this.matrix.compose(this.at.set(x, ground.drawnHeightAt(x, z) + this.lift, z), this.tilt, this.scale.set(size, 1, size));
  this.quads.setMatrixAt(i, this.matrix);
  this.quadNext = (i + 1) % cap; this.quadUsed = Math.min(this.quadUsed + 1, cap); this.quads.count = this.quadUsed;
  // Only this instance goes to the GPU (three clears the ranges once sent).
  this.quads.instanceMatrix.addUpdateRange(i * 16, 16); this.quads.instanceMatrix.needsUpdate = true;
 }

 burn(x, z, size) {
  const cap = this.cap('burns'), slot = this.burnNext % cap, g = this.burns.geometry;
  const position = g.attributes.position, uv = g.attributes.uv, index = g.index;
  drapeBurn(this.ground, x, z, size, Math.random() * Math.PI * 2, this.lift, position.array, uv.array, slot * SLOT_VERTICES, index.array, slot * SLOT_INDICES);
  // Only this slot goes to the GPU.
  for (const [attribute, width, count] of [[position, 3, SLOT_VERTICES], [uv, 2, SLOT_VERTICES], [index, 1, SLOT_INDICES]]) {
   attribute.addUpdateRange(slot * count * width, count * width); attribute.needsUpdate = true;
  }
  this.burnNext = (slot + 1) % cap; this.burnUsed = Math.min(this.burnUsed + 1, cap);
  g.setDrawRange(0, this.burnUsed * SLOT_INDICES);
 }

 clear() {
  this.quadNext = this.quadUsed = 0; this.quads.count = 0;
  this.burnNext = this.burnUsed = 0; this.burns.geometry.setDrawRange(0, 0);
 }

 dispose() {
  for (const mesh of [this.quads, this.burns]) { mesh.removeFromParent(); mesh.geometry.dispose(); }
  this.quads.dispose();
 }
}
