// Ground detail on a map with hills (world/heightfield.js): small pieces lying
// on the drawn ground, tilted to its slope. Dry grass tufts, fieldstones,
// twigs, dead weed stalks and fallen-leaf bits (litter browns only: red on the
// ground reads as blood). Deadwater's scrub (world-build.js makeGroundDetails)
// is never built on these maps.
//
// Each kind is one InstancedMesh per detail group, so the whole layer is at
// most 5 draws per group (renderer.js shows the groups by preset: Performance
// the sparse fifth, Balanced half, Quality and Extreme all of it, Potato
// none). Every group is built at load, whatever the preset: it is a few
// thousand instances, a few milliseconds, and a later switch to a higher
// preset then has nothing to build. No per-frame work, no shadows cast.
//
// Placement is seeded (map.scenerySeed), so every load and every screen gets
// the same ground. Pieces keep off paths, the stream's channel and banks,
// fords, decks, steep ground, retaining walls, building footprints and pads,
// crop fields, props, fences and practice targets, and stay on the terrain
// grid.
//
// Optional map data, all of it defaulting to the look below:
//   map.groundDetail = false            no ground detail at all
//   map.groundDetail = {
//     density: 1,                       the whole layer's multiplier
//     kinds: { leaves: { colors: ['#8a6a3e', ...], density: 1.5 }, ... },
//                                       per kind: its colours and multiplier
//     regions: [{ poly: [[x, z], ...], density: 2, kinds: { leaves: 3, tufts: .5 } }],
//                                       inside `poly` (the last region that
//                                       holds a point wins): the layer's
//                                       multiplier there, and per kind
//   }
// Kinds: tufts, stones, twigs, stalks, leaves.
import * as THREE from 'three';
import { insidePoly, edgeCollider } from './heightfield.js';
import { mapColliders } from '../map-kit.js';
import { inside } from '../simulation.js';
import { boxIndex } from '../box-index.js';

// Pieces per 100 m² of open ground with every group shown (Quality and
// Extreme), before the map's own multipliers. `lie`: how far a piece turns to
// the slope (1 flat pieces; upright grass and stalks only half, they grow up).
// `sink`: metres into the ground (upright pieces start below it so no base
// ever shows a gap); `lift`: above it (flat pieces clear the drawn mesh).
export const DETAIL_KINDS = {
 tufts: { per100: 9, colors: ['#8a7a4e', '#857d5c', '#7d7658'], lie: .5, sink: .03, size: [.26, .44], clump: 1.5 },
 stones: { per100: 2.2, colors: ['#7f7b72', '#5f5c56', '#6c6860'], lie: 1, sink: 0, size: [.06, .15], clump: .6 },
 twigs: { per100: 2.6, colors: ['#3b322c', '#4a3e33', '#54473a'], lie: 1, sink: 0, size: [.26, .5], clump: .8 },
 stalks: { per100: 2.4, colors: ['#6b6448', '#7a6a4a', '#5e5640'], lie: .5, sink: .03, size: [.32, .55], clump: 1.3 },
 leaves: { per100: 11, colors: ['#8a6a3e', '#7a5a34', '#5a4632'], lie: 1, sink: 0, size: [.85, 1.25], clump: 1.6 },
};
export const DETAIL_KIND_NAMES = Object.keys(DETAIL_KINDS);
// The groups, lowest preset first, and the share of each kind in each.
export const DETAIL_TIERS = [['performanceDetails', .2], ['groundDetails', .3], ['extraGroundDetails', .5]];
// Keep-clear margins (m).
const PATH_MARGIN = .5, WATER_MARGIN = .3, FORD_MARGIN = .5, DECK_MARGIN = .6, BUILDING_MARGIN = .6, BOX_MARGIN = .35, TARGET_CLEAR = 1.5;
export const MAX_SLOPE = .5;
const LIFT = .012; // flat pieces over the ground: at least the finest mesh's error (1 cm)

const seeded = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// ---- The shapes: unit-sized, with a per-vertex shade (the colour attribute)
// that the instance colour multiplies, so a tuft's tips are lighter than its
// base and no two leaves in a patch are quite the same brown.
function shaded(geometry, shade) {
 const g = geometry.index ? geometry.toNonIndexed() : geometry;
 g.deleteAttribute('uv');
 const p = g.attributes.position, c = new Float32Array(p.count * 3);
 for (let i = 0; i < p.count; i++) { const s = shade(p.getX(i), p.getY(i), p.getZ(i), i); c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = s; }
 g.setAttribute('color', new THREE.BufferAttribute(c, 3));
 return g;
}
function merged(parts) {
 let count = 0; for (const g of parts) count += g.attributes.position.count;
 const out = new THREE.BufferGeometry();
 for (const name of ['position', 'normal', 'color']) {
  const array = new Float32Array(count * 3); let at = 0;
  for (const g of parts) { array.set(g.attributes[name].array, at); at += g.attributes[name].array.length; }
  out.setAttribute(name, new THREE.BufferAttribute(array, 3));
 }
 for (const g of parts) g.dispose();
 return out;
}
const place = (g, x, y, z, rx, ry, rz, sx = 1, sy = 1, sz = 1) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz)));

// Each shape is 1 m tall (or long, or wide) and scaled per piece by `size`.
function shapes() {
 const random = seeded(9127);
 // Six open three-sided blades leaning out of one root: 18 triangles.
 const tuft = [];
 for (let i = 0; i < 6; i++) {
  const angle = i / 6 * Math.PI * 2 + random() * .6, lean = .25 + random() * .35, h = .6 + random() * .4;
  const blade = shaded(new THREE.ConeGeometry(.06, 1, 3, 1, true), (x, y) => .78 + (y + .5) * .42);
  tuft.push(place(blade, Math.cos(angle) * (.06 + h * .5 * Math.sin(lean)), h * .5 * Math.cos(lean), Math.sin(angle) * (.06 + h * .5 * Math.sin(lean)), Math.sin(angle) * lean, 0, -Math.cos(angle) * lean, 1, h, 1));
 }
 // A flattened, half-buried icosahedron: 20 triangles.
 const stone = place(shaded(new THREE.IcosahedronGeometry(1, 0), (x, y) => .9 + y * .12), 0, .1, 0, 0, 0, 0, 1, .5, .8);
 // A dead stick with one side shoot, lying down: 12 triangles.
 const stick = place(shaded(new THREE.CylinderGeometry(.03, .04, 1, 3, 1, true), () => 1), 0, .025, 0, 0, 0, Math.PI / 2);
 const shoot = place(shaded(new THREE.CylinderGeometry(.018, .026, .38, 3, 1, true), () => .9), .12, .025, .1, 0, -.75, Math.PI / 2);
 // Three dead stalks, two with a dark seed head: 21 triangles.
 const stalks = [];
 for (let i = 0; i < 3; i++) {
  const angle = i * 2.2 + random(), h = .65 + random() * .35, lean = .08 + random() * .15, x = Math.cos(angle) * .05, z = Math.sin(angle) * .05;
  stalks.push(place(shaded(new THREE.ConeGeometry(.018, 1, 3, 1, true), () => 1), x, h * .5, z, Math.sin(angle) * lean, 0, -Math.cos(angle) * lean, 1, h, 1));
  if (i < 2) stalks.push(place(shaded(new THREE.ConeGeometry(.035, .14, 3, 1, false), () => .72), x + Math.cos(angle) * h * lean, h * .96, z + Math.sin(angle) * h * lean, 0, random() * 3, 0));
 }
 // A drift of seven leaves, each a slightly cupped rhomb: 28 triangles.
 const leaves = [];
 for (let i = 0; i < 7; i++) {
  const angle = i * 1.9 + random(), r = i ? .08 + random() * .24 : 0, length = .15 + random() * .05, width = length * .6, lift = i * .0015;
  const positions = new Float32Array([
   -length / 2, lift, 0, 0, lift + .008, width / 2, 0, lift + .012, 0,
   0, lift + .008, width / 2, length / 2, lift, 0, 0, lift + .012, 0,
   length / 2, lift, 0, 0, lift + .008, -width / 2, 0, lift + .012, 0,
   0, lift + .008, -width / 2, -length / 2, lift, 0, 0, lift + .012, 0]);
  const leaf = new THREE.BufferGeometry(); leaf.setAttribute('position', new THREE.BufferAttribute(positions, 3)); leaf.computeVertexNormals();
  const tone = .84 + random() * .28;
  leaves.push(place(shaded(leaf, () => tone), Math.cos(angle) * r, 0, Math.sin(angle) * r, (random() - .5) * .3, random() * 6, (random() - .5) * .3));
 }
 return { tufts: merged(tuft), stones: merged([stone]), twigs: merged([stick, shoot]), stalks: merged(stalks), leaves: merged(leaves) };
}

// ---- Where the drawn ground is: the terrain mesh's own triangles when the
// view has one (RTIN is within a few centimetres of the grid, more on the
// phone presets), found through the grid's cells.
function meshSurface(view, ground) {
 const tiles = view?.terrainMesh?.children?.filter(t => t.geometry?.index) || [];
 if (!tiles.length) return null;
 const cell = .5, cols = Math.ceil((ground.maxX - ground.minX) / cell) + 1, rows = Math.ceil((ground.maxZ - ground.minZ) / cell) + 1;
 const cells = new Map();
 for (const tile of tiles) {
  const p = tile.geometry.attributes.position.array, index = tile.geometry.index.array;
  for (let t = 0; t < index.length; t += 3) {
   const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
   const c0 = Math.max(0, Math.floor((Math.min(p[a], p[b], p[c]) - ground.minX) / cell)), c1 = Math.min(cols - 1, Math.floor((Math.max(p[a], p[b], p[c]) - ground.minX) / cell));
   const r0 = Math.max(0, Math.floor((Math.min(p[a + 2], p[b + 2], p[c + 2]) - ground.minZ) / cell)), r1 = Math.min(rows - 1, Math.floor((Math.max(p[a + 2], p[b + 2], p[c + 2]) - ground.minZ) / cell));
   for (let r = r0; r <= r1; r++) for (let q = c0; q <= c1; q++) {
    const key = r * cols + q; let list = cells.get(key); if (!list) cells.set(key, list = []);
    list.push(p, a, b, c);
   }
  }
 }
 return (x, z) => {
  const list = cells.get(Math.floor((z - ground.minZ) / cell) * cols + Math.floor((x - ground.minX) / cell));
  if (list) for (let i = 0; i < list.length; i += 4) {
   const p = list[i], a = list[i + 1], b = list[i + 2], c = list[i + 3];
   const ax = p[a], az = p[a + 2], bx = p[b], bz = p[b + 2], cx = p[c], cz = p[c + 2];
   const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(det) < 1e-12) continue;
   const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, w = 1 - u - v;
   if (u >= -1e-6 && v >= -1e-6 && w >= -1e-6) return u * p[a + 1] + v * p[b + 1] + w * p[c + 1];
  }
  return ground.drawnHeightAt(x, z);
 };
}

// ---- Where a piece may lie.
function segDist(x, z, ax, az, bx, bz) {
 const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
 let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
 return { d: Math.hypot(ax + dx * t - x, az + dz * t - z), t };
}
// A polyline with a keep-clear half-width at each point (`half(i)`), with its box.
function band(points, half) {
 const halves = points.map((_, i) => half(i)), grow = Math.max(...halves);
 const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
 return { points, halves, x0: Math.min(...xs) - grow, x1: Math.max(...xs) + grow, z0: Math.min(...zs) - grow, z1: Math.max(...zs) + grow };
}
function inBand(x, z, b) {
 if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) return false;
 for (let i = 1; i < b.points.length; i++) {
  const { d, t } = segDist(x, z, b.points[i - 1][0], b.points[i - 1][1], b.points[i][0], b.points[i][1]);
  if (d < b.halves[i - 1] + (b.halves[i] - b.halves[i - 1]) * t) return true;
 }
 return false;
}
function polyNear(x, z, poly, margin) {
 if (insidePoly(x, z, poly)) return true;
 for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; if (segDist(x, z, a[0], a[1], b[0], b[1]).d < margin) return true; }
 return false;
}

// Everything a piece keeps clear of, as one test.
export function detailClearance(ground, map) {
 const terrain = map.terrain || {};
 const bands = [
  // (Only worn tracks: a path that only shapes the ground is grown over.)
  ...(terrain.paths || []).filter(p => p.colourMix !== 0).map(p => band(p.points, () => p.width / 2 + PATH_MARGIN)),
  ...(terrain.water || []).map(w => band(w.points, i => (w.points[i].length > 2 ? w.points[i][2] : w.half) + (w.bank || 0) + WATER_MARGIN)),
  ...(terrain.fords || []).map(f => band(f.points, () => f.width / 2 + (f.shoulder || 0) * .5 + FORD_MARGIN)),
 ];
 const decks = terrain.decks || [], crops = map.crops || [];
 // Building footprints and the pads cut for them (and the spec's own pads).
 // (A turn, however small, makes inside() read localW/localD.)
 const pads = [
  ...(map.buildings || []).map(b => ({ x: b.x, z: b.z, angle: b.angle || 0, localW: b.w + 2 * ((Number.isFinite(b.baseY) ? b.padMargin ?? 1.5 : 0) + BUILDING_MARGIN), localD: b.d + 2 * ((Number.isFinite(b.baseY) ? b.padMargin ?? 1.5 : 0) + BUILDING_MARGIN) })),
  ...(terrain.pads || []).map(p => ({ x: p.x, z: p.z, angle: p.angle || 0, localW: p.w + 2 * ((p.margin ?? 1.5) + BUILDING_MARGIN), localD: p.d + 2 * ((p.margin ?? 1.5) + BUILDING_MARGIN) })),
 ].map(p => ({ ...p, angle: p.angle || 1e-9 }));
 // Props, fences and walls from the map kit (without its ground, which a test
 // map may not have baked), and this ground's retaining walls.
 const boxes = [...mapColliders({ ...map, terrain: null, buildings: map.buildings || [], fences: map.fences || [] }), ...ground.edges.map(edgeCollider)];
 const obstacles = boxIndex(boxes), targets = map.targets || [], slope = { x: 0, z: 0 };
 const x0 = ground.minX + .75, x1 = ground.maxX - .75, z0 = ground.minZ + .75, z1 = ground.maxZ - .75;
 return (x, z) => {
  if (!(x > x0 && x < x1 && z > z0 && z < z1)) return false;
  const g = ground.gradientAt(x, z, slope);
  if (g.x * g.x + g.z * g.z > MAX_SLOPE * MAX_SLOPE || ground.wallAt(x, z)) return false;
  for (const b of bands) if (inBand(x, z, b)) return false;
  for (const d of decks) if (polyNear(x, z, d.poly, DECK_MARGIN)) return false;
  for (const p of pads) if (inside({ x, z }, p)) return false;
  for (const f of crops) if (inside({ x, z }, f, .3)) return false;
  if (obstacles.some(x, z, BOX_MARGIN, b => inside({ x, z }, b, BOX_MARGIN))) return false;
  for (const t of targets) if (Math.hypot(t.x - x, t.z - z) < TARGET_CLEAR) return false;
  return true;
 };
}

// Soft patchiness (so the layer reads as drifts and clumps, not an even
// sprinkle): value noise, 0 to 1, about 7 m across.
function patchiness(seed) {
 const hash = (ix, iz) => { let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(seed, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
 return (x, z) => {
  const fx = x / 7, fz = z / 7, ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const top = hash(ix, iz) + (hash(ix + 1, iz) - hash(ix, iz)) * sx, bottom = hash(ix, iz + 1) + (hash(ix + 1, iz + 1) - hash(ix, iz + 1)) * sx;
  return top + (bottom - top) * sz;
 };
}

// The map's settings merged over the defaults: per kind its colours, and its
// density at (x, z) (the layer's, the region's and the kind's multipliers).
export function detailSettings(map) {
 const data = map.groundDetail === false ? { density: 0 } : map.groundDetail || {};
 const global = data.density ?? 1, regions = (data.regions || []).map(r => ({ ...r, density: r.density ?? 1, kinds: r.kinds || {} }));
 const kinds = {};
 for (const name of DETAIL_KIND_NAMES) {
  const own = data.kinds?.[name] || {}, base = own.density ?? 1;
  kinds[name] = { ...DETAIL_KINDS[name], colors: own.colors?.length ? own.colors : DETAIL_KINDS[name].colors, base: global * base };
 }
 const multiplier = (name, x, z) => {
  let m = kinds[name].base;
  for (let i = regions.length - 1; i >= 0; i--) if (insidePoly(x, z, regions[i].poly)) { m *= regions[i].density * (regions[i].kinds[name] ?? 1); break; }
  return m;
 };
 const highest = name => Math.max(kinds[name].base, ...regions.map(r => kinds[name].base * r.density * (r.kinds[name] ?? 1)));
 return { kinds, multiplier, highest };
}

// Where every piece goes: { kind: [{ x, z, y, yaw, size, color, tier, nx, nz }] }.
// Pure (no three.js scene): the node tests read it. `surface(x, z)`, the
// drawn mesh's height when known.
export function placeTerrainDetails(ground, map, surface = null) {
 const out = {}; for (const name of DETAIL_KIND_NAMES) out[name] = [];
 if (!ground || ground.flat || !map.terrain) return out;
 const { kinds, multiplier, highest } = detailSettings(map), clear = detailClearance(ground, map);
 // Only as far past the fence as anyone at the fence can see (the camera
 // shows about 19 m either side and 13 m up and down the screen).
 const near = nearFence(map, FENCE_REACH);
 let x0 = ground.minX, x1 = ground.maxX, z0 = ground.minZ, z1 = ground.maxZ;
 if (map.playableArea) {
  const xs = map.playableArea.map(p => p[0]), zs = map.playableArea.map(p => p[1]);
  x0 = Math.max(x0, Math.min(...xs) - FENCE_REACH); x1 = Math.min(x1, Math.max(...xs) + FENCE_REACH);
  z0 = Math.max(z0, Math.min(...zs) - FENCE_REACH); z1 = Math.min(z1, Math.max(...zs) + FENCE_REACH);
 }
 const width = x1 - x0, depth = z1 - z0, area = width * depth;
 const slope = { x: 0, z: 0 };
 DETAIL_KIND_NAMES.forEach((name, k) => {
  const kind = kinds[name], top = highest(name) * (1 + kind.clump * .5);
  if (!(top > 0)) return;
  // Each kind walks its own seeded sequence, a fixed number of draws per
  // candidate, so changing one kind's density never moves another's pieces.
  const random = seeded((map.scenerySeed ?? 1) * 7 + 911 + k * 7919), patch = patchiness((map.scenerySeed ?? 1) + k * 31);
  const candidates = Math.round(area / 100 * kind.per100 * top);
  for (let i = 0; i < candidates; i++) {
   const x = x0 + random() * width, z = z0 + random() * depth;
   const keep = random(), tierRoll = random(), yaw = random() * Math.PI * 2, size = kind.size[0] + random() * (kind.size[1] - kind.size[0]), tone = random(), shade = random();
   const local = multiplier(name, x, z) * (1 + kind.clump * (patch(x, z) - .5));
   if (keep * top >= local || !near(x, z) || !clear(x, z)) continue;
   let tier = 0; for (let t = 0, sum = 0; t < DETAIL_TIERS.length; t++) { sum += DETAIL_TIERS[t][1]; if (tierRoll < sum) { tier = t; break; } }
   const g = ground.gradientAt(x, z, slope), drawn = ground.drawnHeightAt(x, z), mesh = surface ? surface(x, z) : drawn;
   // Upright pieces root at the lower of the two surfaces (no gap under a
   // blade on any preset's mesh); flat ones lie on the higher (never under).
   const y = kind.sink ? Math.min(drawn, mesh) - kind.sink : Math.max(drawn, mesh) + LIFT;
   out[name].push({ x, z, y, yaw, size, tier, nx: -g.x * kind.lie, nz: -g.z * kind.lie, color: kind.colors[Math.floor(tone * kind.colors.length)], shade: .94 + shade * .12 });
  }
 });
 return out;
}

// Inside the map's playable outline or within `reach` of it (no outline:
// everywhere).
const FENCE_REACH = 16;
function nearFence(map, reach) {
 const pts = map.playableArea;
 if (!pts) return () => true;
 return (x, z) => {
  if (insidePoly(x, z, pts)) return true;
  for (let i = 0; i < pts.length; i++) {
   const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
   const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
   if ((a[0] + dx * t - x) ** 2 + (a[1] + dz * t - z) ** 2 < reach * reach) return true;
  }
  return false;
 };
}

let shapeCache = null;
// Fills the view's three detail groups (made empty by world-build.js
// makeHillTerrain). Returns what it built, per group: draws, triangles,
// instances, and the time it took.
export function buildTerrainDetails(view, ground, map) {
 const started = performance.now();
 const pieces = placeTerrainDetails(ground, map, meshSurface(view, ground));
 const shapeSet = shapeCache ||= shapes();
 // Deadwater's ground cover shares this material (renderer.js bakedMaterial),
 // so the layer gets the same light, Extreme's weathering and cloud shadows.
 const material = view.bakedMaterial ? view.bakedMaterial('plain') : new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, vertexColors: true });
 const stats = { ms: 0, groups: {} };
 const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), turn = new THREE.Quaternion(), yawTurn = new THREE.Quaternion(), scale = new THREE.Vector3();
 const up = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3(), color = new THREE.Color();
 DETAIL_TIERS.forEach(([key], tier) => {
  const group = view[key], counts = { draws: 0, triangles: 0, instances: 0 };
  stats.groups[key] = counts;
  if (!group) return;
  for (const name of DETAIL_KIND_NAMES) {
   const list = pieces[name].filter(p => p.tier === tier);
   if (!list.length) continue;
   const geometry = shapeSet[name], mesh = new THREE.InstancedMesh(geometry, material, list.length);
   list.forEach((p, i) => {
    normal.set(p.nx, 1, p.nz).normalize();
    turn.setFromUnitVectors(up, normal).multiply(yawTurn.setFromAxisAngle(up, p.yaw));
    matrix.compose(position.set(p.x, p.y, p.z), turn, scale.setScalar(p.size));
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, color.set(p.color).multiplyScalar(p.shade));
   });
   mesh.castShadow = false; mesh.receiveShadow = true;
   mesh.computeBoundingSphere(); mesh.name = `terrain-${name}`; mesh.userData.terrainDetail = name;
   group.add(mesh);
   counts.draws++; counts.instances += list.length; counts.triangles += list.length * geometry.attributes.position.count / 3;
  }
 });
 stats.ms = performance.now() - started;
 view.terrainDetailStats = stats;
 return stats;
}
