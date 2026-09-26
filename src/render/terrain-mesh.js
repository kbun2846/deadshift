// The drawn ground of a map with terrain (world/heightfield.js): an
// error-bounded mesh over the drawn height grid, and the retaining walls
// along its authored edges. Built once at load; a flat map never comes here.
//
// The mesh: RTIN (right-triangulated irregular network, the "Martini"
// method) in 32 m tiles. Each tile keeps only the triangles it needs for the
// ground to stay within `maxError` of the grid (a few centimetres on the phone
// presets, one above), so a flat field is a handful of big triangles and a
// retaining wall or a bank gets fine ones. Neighbouring tiles agree on every
// point along the edge they share (their errors there are made equal before
// either is cut), so there are no cracks between them.
//
// Colour is not in the mesh: one world-space texture read per pixel
// (ground-layers.js: the map's ground, its layers, banks, damp and hollow
// ground, paths), so an edge stays where it is however few triangles the
// ground has there. The hills' own long shadow is a second texture that dims
// only the sun's direct light (hill-shade.js), carried in the same texture's
// alpha (the terrain casts nothing in the shadow map, everything else still
// does, onto it). Baked once at load; one material, one texture read, one
// shader program per preset.
import * as THREE from 'three';
import { CELL } from '../world/heightfield.js';
import { bakeGroundLayers, groundLayersPatch, GROUND_TEXEL } from './ground-layers.js';
import { bakeHillShade, heightsOf, hillShadePatch, addPatch, boxOf } from './hill-shade.js';
import { mapLook } from './map-look.js';

const TILE = 64, SIZE = TILE + 1;
let COORDS = null; // the RTIN triangle table for one SIZE x SIZE tile (shared)

function triangles() {
 if (COORDS) return COORDS;
 const count = TILE * TILE * 2 - 2, parents = count - TILE * TILE, coords = new Uint16Array(count * 4);
 for (let i = 0; i < count; i++) {
  let id = i + 2, ax = 0, ay = 0, bx = 0, by = 0, cx = 0, cy = 0;
  if (id & 1) { bx = by = cx = TILE; } else { ax = ay = cy = TILE; }
  while ((id >>= 1) > 1) {
   const mx = (ax + bx) >> 1, my = (ay + by) >> 1;
   if (id & 1) { bx = ax; by = ay; ax = cx; ay = cy; } else { ax = bx; ay = by; bx = cx; by = cy; }
   cx = mx; cy = my;
  }
  const k = i * 4; coords[k] = ax; coords[k + 1] = ay; coords[k + 2] = bx; coords[k + 3] = by;
 }
 return COORDS = { count, parents, coords };
}

// One pass over a tile, smallest triangles first: each hypotenuse midpoint
// holds the most any triangle it splits would be off, children included.
// Keeps (max) whatever `errors` already holds, so a second pass after the
// shared edges were evened out carries them up.
function accumulate(heights, errors) {
 const { count, parents, coords } = triangles();
 for (let i = count - 1; i >= 0; i--) {
  const k = i * 4, ax = coords[k], ay = coords[k + 1], bx = coords[k + 2], by = coords[k + 3];
  const mx = (ax + bx) >> 1, my = (ay + by) >> 1, cx = mx + my - ay, cy = my + ax - mx, mid = my * SIZE + mx;
  const e = Math.abs((heights[ay * SIZE + ax] + heights[by * SIZE + bx]) / 2 - heights[mid]);
  if (e > errors[mid]) errors[mid] = e;
  if (i < parents) {
   const l = errors[((ay + cy) >> 1) * SIZE + ((ax + cx) >> 1)], r = errors[((by + cy) >> 1) * SIZE + ((bx + cx) >> 1)];
   if (l > errors[mid]) errors[mid] = l;
   if (r > errors[mid]) errors[mid] = r;
  }
 }
}

// The triangles of one tile at `maxError`: vertex grid points and indices.
function cut(errors, maxError) {
 const index = new Int32Array(SIZE * SIZE).fill(-1), points = [], faces = [];
 const vertex = (x, y) => { const i = y * SIZE + x; if (index[i] < 0) { index[i] = points.length / 2; points.push(x, y); } return index[i]; };
 const stack = [0, 0, TILE, TILE, TILE, 0, TILE, TILE, 0, 0, 0, TILE];
 while (stack.length) {
  const cy = stack.pop(), cx = stack.pop(), by = stack.pop(), bx = stack.pop(), ay = stack.pop(), ax = stack.pop();
  const mx = (ax + bx) >> 1, my = (ay + by) >> 1;
  if (Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && errors[my * SIZE + mx] > maxError) stack.push(cx, cy, ax, ay, mx, my, bx, by, cx, cy, mx, my);
  else faces.push(vertex(ax, ay), vertex(bx, by), vertex(cx, cy));
 }
 return { points, faces };
}

// Across a grid step: the rise per metre from the two half-metre steps either
// side of a point (h at -.5, 0 and +.5). Where one of them is a retaining
// wall's drop (steeper than 1:1), the point belongs to the level on the other
// side: that side's slope, so the level ground at a wall's top and foot stays
// level instead of leaning into the drop (dark saw teeth along every wall).
function riseAcross(a, c, b) {
 const l = c - a, r = b - c;
 if (Math.abs(l) <= .5 && Math.abs(r) <= .5) return l + r;
 return 2 * (Math.abs(l) < Math.abs(r) ? l : r);
}

// `view`: the WorldView (for the sun and the ground materials). Returns the
// group of tile meshes (added to the scene by the caller).
export function buildTerrainMesh(view, ground, map, maxError) {
 const cols = ground.cols, rows = ground.rows, tilesX = Math.ceil((cols - 1) / TILE), tilesZ = Math.ceil((rows - 1) / TILE);
 // Heights per tile, in metres, from the drawn grid (clamped past its edge).
 const drawn = ground.drawn, at = (c, r) => drawn[Math.min(rows - 1, r) * cols + Math.min(cols - 1, c)] * .001;
 const tiles = [];
 for (let tz = 0; tz < tilesZ; tz++) for (let tx = 0; tx < tilesX; tx++) {
  const heights = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) heights[y * SIZE + x] = at(tx * TILE + x, tz * TILE + y);
  const errors = new Float32Array(SIZE * SIZE);
  accumulate(heights, errors);
  tiles.push({ tx, tz, heights, errors });
 }
 // Even out the shared edges (the larger error wins on both sides), carry
 // that up through each tile again, and repeat until the edges agree.
 const tileAt = (tx, tz) => tx < tilesX && tz < tilesZ ? tiles[tz * tilesX + tx] : null;
 for (let pass = 0; pass < 6; pass++) {
  let changed = false;
  for (const t of tiles) {
   const east = tileAt(t.tx + 1, t.tz), south = tileAt(t.tx, t.tz + 1);
   for (let k = 0; k < SIZE; k++) {
    if (east) { const a = k * SIZE + TILE, b = k * SIZE, m = Math.max(t.errors[a], east.errors[b]); if (t.errors[a] !== m || east.errors[b] !== m) { t.errors[a] = east.errors[b] = m; changed = true; } }
    if (south) { const a = TILE * SIZE + k, b = k, m = Math.max(t.errors[a], south.errors[b]); if (t.errors[a] !== m || south.errors[b] !== m) { t.errors[a] = south.errors[b] = m; changed = true; } }
   }
  }
  if (!changed) break;
  for (const t of tiles) accumulate(t.heights, t.errors);
 }

 const material = groundLook(view, ground, map);
 const group = new THREE.Group(); group.name = 'terrain';
 let triangleCount = 0;
 for (const t of tiles) {
  const { points, faces } = cut(t.errors, maxError), n = points.length / 2;
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
   const gx = t.tx * TILE + points[i * 2], gz = t.tz * TILE + points[i * 2 + 1];
   const x = ground.minX + gx * CELL, z = ground.minZ + gz * CELL, h = t.heights[points[i * 2 + 1] * SIZE + points[i * 2]];
   position[i * 3] = x; position[i * 3 + 1] = h; position[i * 3 + 2] = z;
   // Normal from the grid around it (half a metre each way; riseAcross).
   const nx = -riseAcross(ground.drawnHeightAt(x - .5, z), h, ground.drawnHeightAt(x + .5, z)), nz = -riseAcross(ground.drawnHeightAt(x, z - .5), h, ground.drawnHeightAt(x, z + .5));
   const nl = Math.hypot(nx, 1, nz); normal[i * 3] = nx / nl; normal[i * 3 + 1] = 1 / nl; normal[i * 3 + 2] = nz / nl;
   uv[i * 2] = x / 4; uv[i * 2 + 1] = z / 4;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  // (RTIN's triangles already face up: counter-clockwise seen from above.)
  const index = n > 65535 ? new Uint32Array(faces) : new Uint16Array(faces);
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingSphere(); geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  mesh.userData.terrain = true;
  group.add(mesh);
  triangleCount += faces.length / 3;
 }
 group.userData.triangles = triangleCount;
 return group;
}

// The terrain's one material, its texture (colour, and the hill shade in its
// alpha) and their patches. Made with
// the first mesh; a later build (a finer preset: refineTerrain) reuses the
// material and re-bakes the colour only when the preset wants finer texels
// (the uniforms take the new texture: no new program). `view.groundLook`
// keeps the texture, the hill-shade bake (for props later) and what the
// bakes cost.
function groundLook(view, ground, map) {
 const preset = view.qualityName || view.initialQuality, texel = GROUND_TEXEL[preset] ?? GROUND_TEXEL.balanced;
 let look = view.groundLook;
 if (!look) {
  const grid = heightsOf(ground), shade = bakeHillShade(grid, view.sunOffset || mapLook(map).sunOffset);
  look = view.groundLook = { grid, shade, texel: Infinity, timing: { shade: Math.round(shade.ms) }, uniforms: { groundLook: { value: null }, groundLookBox: { value: new THREE.Vector4() } } };
 }
 if (texel < look.texel) {
  const bake = bakeGroundLayers(look.grid, map, texel, { shade: look.shade });
  const texture = new THREE.DataTexture(bake.data, bake.width, bake.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.SRGBColorSpace;
  look.colour?.dispose(); look.colour = finish(texture); look.texel = texel;
  look.uniforms.groundLook.value = texture; look.uniforms.groundLookBox.value.set(...boxOf(bake));
  look.timing.colour = Math.round(bake.ms); look.timing.texels = bake.width * bake.height;
 }
 let material = view.terrainMaterial;
 if (!material) {
  // White: the colour is all in the texture (and the sand tile's grain, map).
  material = view.terrainMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
  addPatch(material, groundLayersPatch(look.uniforms));
  // The hill shade rides in the colour texture's alpha: one read, not two.
  addPatch(material, hillShadePatch(null, { source: 'groundSunLeft' }));
 }
 view.groundMaterials.add(material);
 return material;
}
// Smooth between texels, no mipmaps (the camera always sees them larger than
// a pixel), clamped at the map's edge.
function finish(texture) {
 texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false;
 texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.needsUpdate = true;
 return texture;
}

// Retaining walls: dry-stone faces along each authored edge, with a lighter
// cap, from just below the low side's ground to just above the high side's.
// Boxes into the view's static group, so they batch like every other wall.
export function buildRetainingWalls(view, ground, look = {}) {
 const face = look.wallFace || '#6a665c', cap = look.wallCap || '#8b8a80', dark = look.wallDark || '#5f5c56';
 let piece = 0;
 for (const e of ground.edges) {
  const steps = Math.max(1, Math.ceil((e.length + e.extend * 2) / .9));
  const span = (e.length + e.extend * 2) / steps, angle = Math.atan2(e.ux, e.uz);
  // The wall stands over the drop: a level's cliff from the edge outward,
  // a polyline edge centred on its line.
  const thick = e.centred ? .45 : .5, out = e.centred ? 0 : thick / 2 - .05;
  for (let s = 0; s < steps; s++) {
   const along = -e.extend + (s + .5) * span, x = e.ax + e.ux * along + e.nx * out, z = e.az + e.uz * along + e.nz * out;
   // High and low ground either side of this piece.
   const sideA = ground.heightAt(x - e.nx * .7, z - e.nz * .7), sideB = ground.heightAt(x + e.nx * .9, z + e.nz * .9);
   const top = Math.max(sideA, sideB, e.top ?? -Infinity) + .06, bottom = Math.min(sideA, sideB, ground.heightAt(x, z)) - .25;
   const height = top - bottom; if (height < .12) continue;
   const stone = view.box(x, bottom + height / 2, z, thick, height, span + .02, piece++ % 3 === 1 ? dark : face);
   stone.rotation.y = angle;
   const capping = view.box(x, top + .04, z, thick + .08, .1, span + .03, cap);
   capping.rotation.y = angle;
  }
 }
}
