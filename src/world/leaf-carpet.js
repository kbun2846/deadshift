// Hollow Wick's woods floor (stage 3, s3-leaves): a thick carpet of fallen
// leaves under the North Woods and the West Woods, on top of stage 1's
// sparse ground detail (world/terrain-details.js: its litter-brown leaf bits
// and twigs) and the trees' own drifts and the fork maple's orange carpet
// (world/trees.js), which it does not repeat.
//
// Where: inside each wood's outline (map.leafLitter.woods, Hollow Wick's
// WOODS), thickest under the canopies (near the trunks of the trees standing
// in it) and thinning out over the last few metres to the outline and a
// little past it. It keeps clear of whatever stage 1's detail keeps clear of
// (detailClearance: worn paths and their shoulders, the stream, pads, props,
// trunks, steep ground...), and lies thin on the tracks through the woods
// (the paths that only shape the ground), so every way through stays
// readable.
//
// Colours: mostly the litter browns, with the canopies' maple yellow, burnt
// orange and ochre mixed in (more of them right under a crown, where they
// have just come down). Never rust or red: red on the ground reads as blood.
//
// Cost: one InstancedMesh per wood (two draws, often only one in view), each
// instance a small patch of four cupped leaves (16 triangles), on the view's
// baked 'plain' material with instance colours: the same program as stage 1's
// ground detail, so nothing new compiles. No shadows cast, no per-frame work.
// The patches are stored in a random order, and each preset draws a prefix
// of them (LEAF_CARPET): an even thinning, sparse on Potato, lush on Extreme.
import * as THREE from 'three';
import { insidePoly } from './heightfield.js';
import { detailClearance } from './terrain-details.js';

export const LITTER_BROWNS = ['#8a6a3e', '#7a5a34', '#6e4a2c'];
// The canopies' colours that may lie on the ground (in the carpet, and a
// falling or kicked leaf that has landed).
export const CANOPY_GROUND = ['#c49a3a', '#c0612b', '#b8923c'];
// Canopy only: they may fall, but never lie on the ground.
export const CANOPY_ONLY = ['#a4552a', '#8e2f22'];
export const GROUND_LEAF_COLOURS = [...LITTER_BROWNS, ...CANOPY_GROUND];
// The share of the carpet each preset draws.
export const LEAF_CARPET = Object.freeze({ potato: .14, performance: .34, balanced: .58, quality: .82, extreme: 1 });
// Patches per m² at full thickness (deep in a wood, right under a crown).
export const CARPET_PEAK = 5.2;
// How far past a wood's outline the carpet thins out to nothing, and how deep
// in from it before it is at full thickness (m).
export const EDGE_OUT = 1.5, EDGE_IN = 4;
// A crown's reach over the ground per unit of tree scale (m).
const CROWN_REACH = 3.4;
// The carpet's share left on a track through the woods.
export const TRACK = .22;
const LIFT = .042; // over the higher of the grid and the drawn ground (the coarsest mesh's error is 4 cm)

const seeded = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function edgeDistance(x, z, poly) {
 let best = Infinity;
 for (let i = 0; i < poly.length; i++) {
  const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
  best = Math.min(best, Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z));
 }
 return best;
}

// The woods' outlines (map.leafLitter.woods: [{ id, poly }] or bare polys).
export const woodsOf = map => (map?.leafLitter?.woods || []).map(w => Array.isArray(w) ? w : w.poly).filter(p => p?.length > 2);

// Where the litter lies, as numbers (pure: no three.js; the tests and the
// effects read it). One per map, cached.
const fields = new WeakMap();
export function litterField(ground, map) {
 let field = fields.get(map);
 if (field && field.ground === ground) return field;
 const woods = woodsOf(map), trees = map.trees?.trees || [], drifts = map.trees?.drifts || [];
 // The trees standing in (or at the edge of) a wood give it its crowns.
 const crowns = trees.filter(t => woods.some(poly => insidePoly(t.x, t.z, poly) || edgeDistance(t.x, t.z, poly) < 2))
  .map(t => ({ x: t.x, z: t.z, r: CROWN_REACH * (t.s || 1) }));
 const maples = trees.filter(t => t.kind === 'maple').map(t => ({ x: t.x, z: t.z, r: 5.2 * (t.s || 1) * .9 }));
 const heaps = drifts.map(d => ({ x: d.x, z: d.z, r: .9 * (d.s || 1) }));
 const boxes = woods.map(poly => { const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]); return { x0: Math.min(...xs) - EDGE_OUT, x1: Math.max(...xs) + EDGE_OUT, z0: Math.min(...zs) - EDGE_OUT, z1: Math.max(...zs) + EDGE_OUT }; });
 let clear = null;
 // 0..1: how deep in a wood (0 past EDGE_OUT outside, 1 EDGE_IN inside);
 // `index`, which wood.
 const woodsAt = (x, z) => {
  for (let i = 0; i < woods.length; i++) {
   const b = boxes[i]; if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
   const d = edgeDistance(x, z, woods[i]), signed = insidePoly(x, z, woods[i]) ? d : -d;
   if (signed > -EDGE_OUT) return { depth: smooth(-EDGE_OUT, EDGE_IN, signed), index: i };
  }
  return { depth: 0, index: -1 };
 };
 // 0..1: how close under a crown.
 const canopyAt = (x, z) => {
  let best = 0;
  for (const c of crowns) { const dx = x - c.x, dz = z - c.z; if (dx * dx + dz * dz < c.r * c.r) best = Math.max(best, 1 - smooth(c.r * .3, c.r, Math.hypot(dx, dz))); }
  return best;
 };
 const inDisc = (list, x, z) => list.some(c => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r);
 // Tracks through the woods (paths that only shape the ground, `colourMix:
 // 0`: stage 1's detail grows over them): trodden, so the carpet is thin on
 // them and they still read as ways through the leaves.
 const tracks = (map.terrain?.paths || []).filter(p => p.colourMix === 0 && p.points.some(([x, z]) => woods.some(poly => insidePoly(x, z, poly))));
 const trackAt = (x, z) => {
  for (const t of tracks) for (let i = 1; i < t.points.length; i++) {
   const [ax, az] = t.points[i - 1], [bx, bz] = t.points[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
   const k = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
   if (Math.hypot(ax + dx * k - x, az + dz * k - z) < t.width / 2) return true;
  }
  return false;
 };
 field = {
  ground, woods, crowns, maples, heaps, tracks, woodsAt, canopyAt, trackAt,
  // Loose leaves underfoot, 0..1: the woods (much less on their paths and
  // anything else the carpet keeps off), the maple's carpet and the drifts.
  // What a walker or a blast kicks up.
  at(x, z) {
   if (inDisc(maples, x, z) || inDisc(heaps, x, z)) return 1;
   const w = woodsAt(x, z).depth; if (w <= 0) return 0;
   return w * (!field.clear(x, z) ? .15 : trackAt(x, z) ? TRACK : 1);
  },
  // The carpet's thickness here, 0..1 (before the clearance test).
  // Stage 1's keep-clear test (built on first use: about 0.2 s).
  clear(x, z) { clear ||= detailClearance(ground, map); return clear(x, z); },
  density(x, z) { const w = woodsAt(x, z).depth; return w > 0 ? w * (.3 + .7 * canopyAt(x, z)) * (trackAt(x, z) ? TRACK : 1) : 0; },
 };
 fields.set(map, field);
 return field;
}

// Every patch: [{ x, z, y, yaw, size, nx, nz, color, shade, rank, wood }],
// sorted by `rank` (random), so any prefix is an even thinning.
export function placeLeafCarpet(ground, map) {
 const out = [];
 if (!ground || ground.flat || !map?.terrain) return out;
 const field = litterField(ground, map), clear = field.clear, slope = { x: 0, z: 0 };
 const random = seeded(((map.scenerySeed ?? 1) * 131 + 4409) >>> 0);
 field.woods.forEach((poly, index) => {
  const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
  const x0 = Math.min(...xs) - EDGE_OUT, x1 = Math.max(...xs) + EDGE_OUT, z0 = Math.min(...zs) - EDGE_OUT, z1 = Math.max(...zs) + EDGE_OUT;
  const candidates = Math.round((x1 - x0) * (z1 - z0) * CARPET_PEAK);
  for (let i = 0; i < candidates; i++) {
   // A fixed number of draws per candidate: one change never reshuffles the rest.
   const x = x0 + random() * (x1 - x0), z = z0 + random() * (z1 - z0), keep = random(), yaw = random() * Math.PI * 2;
   const size = .8 + random() * .5, tone = random(), bright = random(), shade = random(), rank = random();
   const at = field.woodsAt(x, z); if (at.index !== index) continue;
   const canopy = field.canopyAt(x, z), d = at.depth * (.3 + .7 * canopy) * (field.trackAt(x, z) ? TRACK : 1);
   if (keep >= d || !clear(x, z)) continue;
   // More of the crowns' colours right under them.
   const color = bright < .12 + .26 * canopy ? CANOPY_GROUND[Math.floor(tone * CANOPY_GROUND.length)] : LITTER_BROWNS[Math.floor(tone * LITTER_BROWNS.length)];
   const g = ground.gradientAt(x, z, slope);
   out.push({ x, z, y: Math.max(ground.heightAt(x, z), ground.drawnHeightAt(x, z)) + LIFT, yaw, size, nx: -g.x, nz: -g.z, color,
    shade: CANOPY_GROUND.includes(color) ? .8 + shade * .16 : .9 + shade * .16, rank, wood: index });
  }
 });
 return out.sort((a, b) => a.rank - b.rank);
}

// A patch of four cupped leaves, about half a metre across, with a shade per
// leaf in its colour attribute (the instance colour multiplies it).
export function carpetPatchGeometry() {
 const random = seeded(7717), parts = [];
 for (let i = 0; i < 4; i++) {
  const angle = i * 1.7 + random(), r = i ? .1 + random() * .14 : 0, length = .16 + random() * .06, width = length * .62, lift = i * .002;
  parts.push(leafTriangles(length, width, lift, Math.cos(angle) * r, Math.sin(angle) * r, random() * 6.3, .84 + random() * .3));
 }
 return join(parts);
}
// A single leaf seen from both sides (it tumbles as it falls): 8 triangles.
export function looseLeafGeometry() {
 const top = leafTriangles(1, .62, 0, 0, 0, 0, 1), under = top.clone();
 // The underside: every triangle turned over, a little darker.
 const p = under.attributes.position.array;
 for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
 under.computeVertexNormals(); under.attributes.color.array.fill(.82);
 return join([top, under]);
}
function leafTriangles(length, width, lift, x, z, yaw, tone) {
 const l = length / 2, w = width / 2, cup = length * .06;
 const positions = new Float32Array([
  -l, lift, 0, 0, lift + cup * .6, w, 0, lift + cup, 0,
  0, lift + cup * .6, w, l, lift, 0, 0, lift + cup, 0,
  l, lift, 0, 0, lift + cup * .6, -w, 0, lift + cup, 0,
  0, lift + cup * .6, -w, -l, lift, 0, 0, lift + cup, 0]);
 const g = new THREE.BufferGeometry();
 g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
 g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z));
 g.computeVertexNormals();
 g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(positions.length).fill(tone), 3));
 return g;
}
function join(parts) {
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

// The carpet's meshes, one per wood, in the scene. `setQuality(name)` sets
// how much of each is drawn.
export function buildLeafCarpet(view, ground, map, material) {
 const patches = placeLeafCarpet(ground, map), geometry = carpetPatchGeometry();
 const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), turn = new THREE.Quaternion(), yawTurn = new THREE.Quaternion(), scale = new THREE.Vector3();
 const up = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3(), color = new THREE.Color();
 const meshes = [];
 woodsOf(map).forEach((_, index) => {
  const list = patches.filter(p => p.wood === index);
  if (!list.length) return;
  const mesh = new THREE.InstancedMesh(geometry, material, list.length);
  list.forEach((p, i) => {
   normal.set(p.nx, 1, p.nz).normalize();
   turn.setFromUnitVectors(up, normal).multiply(yawTurn.setFromAxisAngle(up, p.yaw));
   mesh.setMatrixAt(i, matrix.compose(position.set(p.x, p.y, p.z), turn, scale.setScalar(p.size)));
   mesh.setColorAt(i, color.set(p.color).multiplyScalar(p.shade));
  });
  mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.computeBoundingSphere(); mesh.name = `leaf-carpet-${index}`; mesh.userData.leafCarpet = list.length;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  view.scene.add(mesh); meshes.push(mesh);
 });
 const carpet = {
  meshes, patches: patches.length, quality: null,
  setQuality(name) {
   carpet.quality = name;
   const share = LEAF_CARPET[name] ?? LEAF_CARPET.balanced;
   for (const mesh of meshes) { mesh.count = Math.round(mesh.userData.leafCarpet * share); mesh.visible = mesh.count > 0; }
  },
  // Triangles drawn at a preset (every wood in view).
  triangles(name) { return meshes.reduce((n, m) => n + Math.round(m.userData.leafCarpet * (LEAF_CARPET[name] ?? 1)), 0) * geometry.attributes.position.count / 3; },
 };
 return carpet;
}
