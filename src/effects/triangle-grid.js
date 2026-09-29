// A flat grid over a mesh's triangles, for the short rays and small decals of
// bullet and blast marks (surface-marks.js). (v0.999a, owner: "frame loss
// especially when firing multiple projectiles or causing explosions".)
//
// The world is merged into big meshes (renderer.js batch: 24-40 m cells of
// thousands of triangles). three.js raycasts a mesh by testing every one of
// its triangles once the ray is inside its bounding sphere, and DecalGeometry
// makes two vectors for every vertex of the mesh it is laid on before clipping
// almost all of them away: a bullet mark cost a raycast over each nearby cell
// and a decal over the whole cell hit, and a blast 25 rays. Here each big
// mesh gets, once, a grid of 1.5 m squares (in its own x, z) listing the
// triangles over each square; a ray reads only the squares along it, and a
// decal is cut from only the triangles near it. The results are the same
// (same triangles, same order of tests per triangle); only what is skipped is
// what could not be hit.
//
// Grids are made on first use or ahead of time (`prepare`), a few per frame.
import * as THREE from 'three';

const CELL = 1.5, BIG = 256; // a triangle over more than BIG squares is checked by every query
const MIN_TRIANGLES = 300;   // smaller meshes: three.js's own raycast is as quick
const grids = new WeakMap();

export function gridEligible(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh || Array.isArray(o.material)) return false;
  const g = o.geometry, pos = g?.attributes.position;
  if (!pos || g.morphAttributes?.position || g.groups.length > 1 || (g.drawRange.start !== 0 || g.drawRange.count !== Infinity)) return false;
  return (g.index ? g.index.count : pos.count) / 3 >= MIN_TRIANGLES;
}
export const hasGrid = o => { const g = grids.get(o.geometry); return !!g && g.version === version(o.geometry) && g.next >= g.tris; };
const version = g => g.attributes.position.version + (g.index ? g.index.version * 1e6 : 0);

export function gridFor(o) {
  const grid = startGrid(o);
  if (grid.next < grid.tris) build(grid, o.geometry, Infinity);
  return grid;
}
// A grid is made in steps (`build` with a time budget), so making one ahead
// of time never costs a frame more than its budget.
function startGrid(o) {
  const geometry = o.geometry, v = version(geometry);
  let grid = grids.get(geometry);
  if (grid && grid.version === v) return grid;
  const pos = geometry.attributes.position, tris = (geometry.index ? geometry.index.count : pos.count) / 3;
  grid = { version: v, cells: new Map(), big: [], tris, next: 0, seen: new Uint32Array(tris), stamp: 0, low: new Float32Array(tris), high: new Float32Array(tris) };
  grids.set(geometry, grid);
  return grid;
}
function build(grid, geometry, budget) {
  const pos = geometry.attributes.position, index = geometry.index?.array ?? null, cells = grid.cells;
  const flat = !pos.isInterleavedBufferAttribute, arr = pos.array, end = budget === Infinity ? Infinity : performance.now() + budget;
  const X = i => flat ? arr[i * 3] : pos.getX(i), Y = i => flat ? arr[i * 3 + 1] : pos.getY(i), Z = i => flat ? arr[i * 3 + 2] : pos.getZ(i);
  const low = grid.low, high = grid.high;
  let t = grid.next;
  while (t < grid.tris) {
    const stop = Math.min(grid.tris, t + 2048);
    for (; t < stop; t++) {
      const i0 = index ? index[t * 3] : t * 3, i1 = index ? index[t * 3 + 1] : t * 3 + 1, i2 = index ? index[t * 3 + 2] : t * 3 + 2;
      const ax = X(i0), bx = X(i1), cx = X(i2), az = Z(i0), bz = Z(i1), cz = Z(i2), ay = Y(i0), by = Y(i1), cy = Y(i2);
      low[t] = Math.min(ay, by, cy); high[t] = Math.max(ay, by, cy);
      const x0 = Math.floor(Math.min(ax, bx, cx) / CELL), x1 = Math.floor(Math.max(ax, bx, cx) / CELL);
      const z0 = Math.floor(Math.min(az, bz, cz) / CELL), z1 = Math.floor(Math.max(az, bz, cz) / CELL);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > BIG) { grid.big.push(t); continue; }
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const key = x * 100003 + z; let list = cells.get(key); if (!list) cells.set(key, list = []); list.push(t);
      }
    }
    if (performance.now() > end) break;
  }
  grid.next = t;
}

// Every triangle whose square overlaps local [x0, x1] x [z0, z1], once each.
function each(grid, x0, z0, x1, z1, visit) {
  if (++grid.stamp === 0xffffffff) { grid.seen.fill(0); grid.stamp = 1; }
  const s = grid.stamp, seen = grid.seen;
  for (const t of grid.big) { seen[t] = s; if (visit(t) === false) return; }
  const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL), cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
  for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) {
    const list = grid.cells.get(x * 100003 + z); if (!list) continue;
    for (const t of list) if (seen[t] !== s) { seen[t] = s; if (visit(t) === false) return; }
  }
}

// The same along a segment (local x, z from a to b): only the squares it
// passes through, in order (Amanatides and Woo), each widened by a hair.
function along(grid, ax, az, bx, bz, visit) {
  if (++grid.stamp === 0xffffffff) { grid.seen.fill(0); grid.stamp = 1; }
  const s = grid.stamp, seen = grid.seen;
  for (const t of grid.big) { seen[t] = s; if (visit(t) === false) return; }
  const cell = (x, z) => { const list = grid.cells.get(x * 100003 + z); if (list) for (const t of list) if (seen[t] !== s) { seen[t] = s; if (visit(t) === false) return false; } };
  let x = Math.floor(ax / CELL), z = Math.floor(az / CELL);
  const ex = Math.floor(bx / CELL), ez = Math.floor(bz / CELL), dx = bx - ax, dz = bz - az;
  const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(CELL / dx) : Infinity, tdz = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
  let tx = dx !== 0 ? ((dx > 0 ? (x + 1) * CELL - ax : ax - x * CELL) / Math.abs(dx)) : Infinity;
  let tz = dz !== 0 ? ((dz > 0 ? (z + 1) * CELL - az : az - z * CELL) / Math.abs(dz)) : Infinity;
  // (A segment point on a square's edge belongs to the square `floor` puts it
  // in, where every triangle holding that point is listed: exact.)
  for (let steps = 0; steps < 100000; steps++) {
    if (cell(x, z) === false) return;
    if (x === ex && z === ez) return;
    let enter;
    if (tx < tz) { enter = tx; x += sx; tx += tdx; } else { enter = tz; z += sz; tz += tdz; }
    if (enter > 1) return;
  }
}

const inverse = new THREE.Matrix4(), localRay = new THREE.Ray(), end = new THREE.Vector3(), sphere = new THREE.Sphere();
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), point = new THREE.Vector3(), best = new THREE.Vector3();

// Like Mesh.raycast (nearest hit only, which is all the marks read): pushes
// { distance, point, object, face, faceIndex } onto `out`.
export function raycastGrid(raycaster, o, out) {
  const g = o.geometry, ray = raycaster.ray, far = raycaster.far;
  if (g.boundingSphere === null) g.computeBoundingSphere();
  sphere.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
  if (!ray.intersectsSphere(sphere)) return;
  const grid = gridFor(o), pos = g.attributes.position, index = g.index, vert = i => index ? index.getX(i) : i;
  inverse.copy(o.matrixWorld).invert();
  localRay.copy(ray).applyMatrix4(inverse);
  const reach = Number.isFinite(far) ? far : 1e4;
  end.copy(ray.direction).multiplyScalar(reach).add(ray.origin).applyMatrix4(inverse);
  const side = o.material.side, cull = side !== THREE.DoubleSide;
  let hitT = -1, hitD = Infinity;
  const o0 = localRay.origin;
  const yLo = Math.min(o0.y, end.y) - 1e-4, yHi = Math.max(o0.y, end.y) + 1e-4, low = grid.low, high = grid.high;
  along(grid, o0.x, o0.z, end.x, end.z, t => {
    if (high[t] < yLo || low[t] > yHi) return; // wholly above or below the segment
    a.fromBufferAttribute(pos, vert(t * 3)); b.fromBufferAttribute(pos, vert(t * 3 + 1)); c.fromBufferAttribute(pos, vert(t * 3 + 2));
    const p = side === THREE.BackSide ? localRay.intersectTriangle(c, b, a, true, point) : localRay.intersectTriangle(a, b, c, cull, point);
    if (!p) return;
    const d = best.copy(p).applyMatrix4(o.matrixWorld).distanceTo(ray.origin);
    if (d < raycaster.near || d > far || d >= hitD) return;
    hitD = d; hitT = t;
  });
  if (hitT < 0) return;
  const ia = vert(hitT * 3), ib = vert(hitT * 3 + 1), ic = vert(hitT * 3 + 2);
  a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
  const p = (side === THREE.BackSide ? localRay.intersectTriangle(c, b, a, true, point) : localRay.intersectTriangle(a, b, c, cull, point)).clone().applyMatrix4(o.matrixWorld);
  const normal = new THREE.Vector3(); THREE.Triangle.getNormal(a, b, c, normal);
  out.push({ distance: hitD, point: p, object: o, face: { a: ia, b: ib, c: ic, normal, materialIndex: 0 }, faceIndex: hitT });
}

// Like raycaster.intersectObjects(roots, true), sorted nearest first; big
// meshes go through their grids.
export function intersectFast(raycaster, roots) {
  const out = [];
  const visit = o => {
    if (o.layers.test(raycaster.layers)) { if (gridEligible(o)) raycastGrid(raycaster, o, out); else o.raycast(raycaster, out); }
    for (const child of o.children) visit(child);
  };
  for (const root of roots) visit(root);
  return out.sort((x, y) => x.distance - y.distance);
}

// A stand-in for `o` holding only its triangles within `radius` (world) of
// `center` (world), for DecalGeometry, which reads every vertex it is given.
// Null: use the mesh itself.
const subCenter = new THREE.Vector3(), scale = new THREE.Vector3();
export function nearTriangles(o, center, radius) {
  if (!gridEligible(o)) return null;
  const g = o.geometry, pos = g.attributes.position, normal = g.attributes.normal, index = g.index, vert = i => index ? index.getX(i) : i;
  const grid = gridFor(o);
  inverse.copy(o.matrixWorld).invert(); subCenter.copy(center).applyMatrix4(inverse);
  o.matrixWorld.decompose(a, new THREE.Quaternion(), scale);
  const r = radius / Math.max(1e-6, Math.min(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)));
  const picked = [];
  each(grid, subCenter.x - r, subCenter.z - r, subCenter.x + r, subCenter.z + r, t => {
    // Its box against the sphere's box (in height too): cheap, and a superset.
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < 3; k++) { const y = pos.getY(vert(t * 3 + k)); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    if (hi >= subCenter.y - r && lo <= subCenter.y + r) picked.push(t);
  });
  const positions = new Float32Array(picked.length * 9), normals = normal ? new Float32Array(picked.length * 9) : null;
  picked.forEach((t, n) => {
    for (let k = 0; k < 3; k++) {
      const i = vert(t * 3 + k), at = n * 9 + k * 3;
      positions[at] = pos.getX(i); positions[at + 1] = pos.getY(i); positions[at + 2] = pos.getZ(i);
      if (normals) { normals[at] = normal.getX(i); normals[at + 1] = normal.getY(i); normals[at + 2] = normal.getZ(i); }
    }
  });
  const sub = new THREE.BufferGeometry();
  sub.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (normals) sub.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  const stand = new THREE.Mesh(sub); stand.matrixAutoUpdate = false; stand.matrixWorld.copy(o.matrixWorld);
  return stand;
}

// Make grids ahead of use, up to `budget` ms (surface-marks.js, idle frames).
export function prepare(meshes, budget) {
  const end = performance.now() + budget;
  while (meshes.length && performance.now() < end) {
    const o = meshes.at(-1);
    if (!gridEligible(o) || hasGrid(o)) { meshes.pop(); continue; }
    const grid = startGrid(o); build(grid, o.geometry, end - performance.now());
    if (grid.next >= grid.tris) meshes.pop();
  }
  return meshes.length;
}

// The same one level up: every mesh under `roots` by where it stands (its
// world bounding sphere over 4 m squares), so a short ray tests the few
// meshes near it instead of walking the whole world (thousands of objects a
// ray). For what does not move (the static world, roofs, props); a prop that
// is knocked about is caught when the index is made again (`age`).
const OCELL = 4, OBIG = 64;
export function objectIndex(roots) {
  const cells = new Map(), big = [], all = [];
  const add = o => {
    if (!(o.isMesh || o.isLine || o.isPoints)) return;
    const g = o.geometry; if (!g?.attributes?.position) return;
    if (o.isInstancedMesh) { if (o.boundingSphere === null) o.computeBoundingSphere(); }
    else if (g.boundingSphere === null) g.computeBoundingSphere();
    const s = (o.isInstancedMesh ? o.boundingSphere : g.boundingSphere).clone().applyMatrix4(o.matrixWorld);
    const e = { o, s, stamp: 0 }; all.push(e);
    const x0 = Math.floor((s.center.x - s.radius) / OCELL), x1 = Math.floor((s.center.x + s.radius) / OCELL), z0 = Math.floor((s.center.z - s.radius) / OCELL), z1 = Math.floor((s.center.z + s.radius) / OCELL);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > OBIG) { big.push(e); return; }
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const key = x * 100003 + z; let list = cells.get(key); if (!list) cells.set(key, list = []); list.push(e); }
  };
  for (const root of roots) { root.updateMatrixWorld(); root.traverse(add); }
  let stamp = 0;
  return {
    made: performance.now(), size: all.length, all, big,
    // Hits along raycaster's ray within its far, sorted; `layers` as three.js.
    intersect(raycaster, out = []) {
      const ray = raycaster.ray, far = Number.isFinite(raycaster.far) ? raycaster.far : 1e4, o = ray.origin;
      const ex = o.x + ray.direction.x * far, ez = o.z + ray.direction.z * far; stamp++;
      const test = e => {
        if (e.stamp === stamp) return; e.stamp = stamp;
        const obj = e.o; if (!obj.layers.test(raycaster.layers) || !ray.intersectsSphere(e.s)) return;
        if (gridEligible(obj)) raycastGrid(raycaster, obj, out); else obj.raycast(raycaster, out);
      };
      for (const e of big) test(e);
      const cx0 = Math.floor(Math.min(o.x, ex) / OCELL), cx1 = Math.floor(Math.max(o.x, ex) / OCELL), cz0 = Math.floor(Math.min(o.z, ez) / OCELL), cz1 = Math.floor(Math.max(o.z, ez) / OCELL);
      for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) { const list = cells.get(x * 100003 + z); if (list) for (const e of list) test(e); }
      return out;
    },
  };
}
