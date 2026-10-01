// Coplanar overlap finder (tests/lumen-flicker.test.js, tools): two faces in
// one plane (within `tol` metres), facing the same way and overlapping in
// area, drawn in different colours, flicker through each other as the camera
// moves (z-fighting): the depth buffer cannot tell them apart, so which one
// shows changes with every sub-pixel step. No DOM, no WebGL.
//
// tris: a flat array of triangles' corners [x0,y0,z0, x1,y1,z1, x2,y2,z2, ...]
// and `colours`, one key per triangle (faces of the same colour may share a
// plane: nothing changes when one shows instead of the other).
// Returns [{ area, at: [x, y, z], normal, a, b }] (a, b: triangle indices).
export function coplanarOverlaps(tris, colours, { tol = 2e-4, minArea = 1e-4 } = {}) {
  const T = colours.length, plane = new Float64Array(T * 4), buckets = new Map(), out = [];
  for (let t = 0; t < T; t++) {
    const o = t * 9, ux = tris[o + 3] - tris[o], uy = tris[o + 4] - tris[o + 1], uz = tris[o + 5] - tris[o + 2], vx = tris[o + 6] - tris[o], vy = tris[o + 7] - tris[o + 1], vz = tris[o + 8] - tris[o + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); if (l < 1e-9) { plane[t * 4 + 3] = NaN; continue; }
    nx /= l; ny /= l; nz /= l;
    const d = nx * tris[o] + ny * tris[o + 1] + nz * tris[o + 2];
    plane.set([nx, ny, nz, d], t * 4);
    const key = `${Math.round(nx * 200)},${Math.round(ny * 200)},${Math.round(nz * 200)},${Math.round(d / .002)}`;
    let list = buckets.get(key); if (!list) buckets.set(key, list = []); list.push(t);
  }
  const A = [[0, 0], [0, 0], [0, 0]], B = [[0, 0], [0, 0], [0, 0]];
  const flat = (t, e1, e2, P) => { const o = t * 9; for (let k = 0; k < 3; k++) { const x = tris[o + k * 3], y = tris[o + k * 3 + 1], z = tris[o + k * 3 + 2]; P[k][0] = x * e1[0] + y * e1[1] + z * e1[2]; P[k][1] = x * e2[0] + y * e2[1] + z * e2[2]; } return area2(P) < 0 ? [P[0], P[2], P[1]] : [P[0], P[1], P[2]]; };
  for (const [key, list] of buckets) {
    // (neighbouring buckets too: a plane on a bucket's edge)
    const [kx, ky, kz, kd] = key.split(',').map(Number), near = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dd = -1; dd <= 1; dd++) { const other = buckets.get(`${kx + dx},${ky + dy},${kz + dz},${kd + dd}`); if (other) near.push(other); }
    for (const t of list) {
      const nx = plane[t * 4], ny = plane[t * 4 + 1], nz = plane[t * 4 + 2];
      const h = Math.abs(nx) < .9 ? [1, 0, 0] : [0, 1, 0];
      let e1 = [h[1] * nz - h[2] * ny, h[2] * nx - h[0] * nz, h[0] * ny - h[1] * nx]; const l1 = Math.hypot(...e1); e1 = e1.map(v => v / l1);
      const e2 = [ny * e1[2] - nz * e1[1], nz * e1[0] - nx * e1[2], nx * e1[1] - ny * e1[0]];
      let pa = null;
      for (const other of near) for (const u of other) {
        if (u <= t || colours[u] === colours[t]) continue;
        if (nx * plane[u * 4] + ny * plane[u * 4 + 1] + nz * plane[u * 4 + 2] < .99995) continue;
        // (the distance between the planes, measured at u's corners)
        const o = u * 9; let off = 0;
        for (let k = 0; k < 3; k++) off = Math.max(off, Math.abs(nx * tris[o + k * 3] + ny * tris[o + k * 3 + 1] + nz * tris[o + k * 3 + 2] - plane[t * 4 + 3]));
        if (off > tol) continue;
        pa ||= flat(t, e1, e2, A).map(p => [...p]);
        const pb = flat(u, e1, e2, B), area = Math.abs(area2(clip(pa, pb))) / 2;
        if (area < minArea) continue;
        const c = t * 9;
        out.push({ area, a: t, b: u, normal: [nx, ny, nz], at: [0, 1, 2].map(i => (tris[c + i] + tris[c + 3 + i] + tris[c + 6 + i]) / 3) });
      }
    }
  }
  return out;
}
function area2(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s; }
// Sutherland-Hodgman: polygon `subject` clipped by the convex, counter-clockwise `by`.
function clip(subject, by) {
  let out = subject;
  for (let i = 0; i < by.length && out.length; i++) {
    const [x1, y1] = by[i], [x2, y2] = by[(i + 1) % by.length], input = out; out = [];
    const side = p => (x2 - x1) * (p[1] - y1) - (y2 - y1) * (p[0] - x1);
    for (let j = 0; j < input.length; j++) {
      const P = input[j], Q = input[(j + 1) % input.length], sp = side(P), sq = side(Q);
      if (sp >= 0) out.push(P);
      if ((sp >= 0) !== (sq >= 0)) { const k = sp / (sp - sq); out.push([P[0] + (Q[0] - P[0]) * k, P[1] + (Q[1] - P[1]) * k]); }
    }
  }
  return out;
}

// Every triangle of the meshes under `root` in world space, with a colour key
// per triangle (its material's colour, or its first corner's vertex colour).
export function worldTriangles(root, THREE) {
  const tris = [], colours = [], v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry, pos = g.attributes.position, col = g.attributes.color, idx = g.index, n = idx ? idx.count : pos.count;
    const base = !col || !o.material.vertexColors ? o.material.color?.getHexString() : null;
    for (let i = 0; i + 2 < n; i += 3) {
      for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(o.matrixWorld); tris.push(v.x, v.y, v.z); }
      const c0 = idx ? idx.getX(i) : i;
      colours.push(base ?? `${col.getX(c0).toFixed(3)},${col.getY(c0).toFixed(3)},${col.getZ(c0).toFixed(3)}`);
    }
  });
  return { tris, colours };
}
