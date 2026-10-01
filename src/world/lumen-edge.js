// Lumen's edge (stage 1): the ring of sealed towers round the playable area
// and the caution barricades that close each road where it leaves the map.
// Plain data from the layout (maps/lumen-layout.js), seeded; the towers are
// `map.solids` (drawn and cut by render/city-shells.js), the barricades are
// solids that are colliders only (`shell: false`) drawn by
// world/city-barricades.js. tests/lumen-ground.test.js checks them.
import { OUTLINE, ROADS, BARRICADES } from '../maps/lumen-layout.js';
import { roadGeometry, seeded } from './lumen-ground.js';

export const EDGE = Object.freeze({
  depth: [8, 13], length: [7, 13], height: [44, 62],
  // A road's corridor (roadway and sidewalks) stays open past the edge.
  corridorMargin: .15,
  barrier: { height: 1.25, thickness: .7, beyond: .9 }, // the line of water-filled barriers, set in from the boundary
});

const FRACTIONS = [.1, .5, .9]; // where along each metre the ring's free-run test looks
const signedArea = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
function pointInPoly(pts, x, z) {
  // (Indexed, not destructured: this runs cold, thousands of times, at import.)
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[j], b = pts[i], az = a[1], bz = b[1]; if ((az > z) !== (bz > z) && x < (b[0] - a[0]) * (z - az) / (bz - az) + a[0]) inside = !inside; }
  return inside;
}
// Every road's corridor as numbers, worked out once per margin: edgeTowers
// asks about tens of thousands of points and it runs when maps.js loads (every
// page, whichever map it plays), so a point is compared against ready-made
// bounds, no arrays are made per point, and a slanted road's polygons are only
// walked when the point is inside their box. (The bounds are the same
// expressions the tests were once written as, so the answers are identical.)
const corridors = new Map(); // margin -> { rects: Float64Array [x0, x1, z0, z1, ...], slanted: [{ pts, x0, x1, z0, z1 }] }
function corridorsFor(m) {
  let c = corridors.get(m);
  if (c) return c;
  const rects = [], slanted = [];
  for (const r of ROADS) {
    if (r.axis === 'x') rects.push(r.from - m, r.to + m, r.centre - r.width / 2 - r.sidewalk - m, r.centre + r.width / 2 + r.sidewalk + m);
    else if (r.axis === 'z') rects.push(r.centre - r.width / 2 - r.sidewalk - m, r.centre + r.width / 2 + r.sidewalk + m, r.from - m, r.to + m);
    else {
      const g = roadGeometry(r);
      for (const pts of [g.road, ...g.walks]) {
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const [x, z] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
        slanted.push({ pts, x0, x1, z0, z1 });
      }
    }
  }
  corridors.set(m, c = { rects: Float64Array.from(rects), slanted });
  return c;
}

// Is (x, z) in any road's corridor (roadway or sidewalk), grown by m?
export function inCorridor(x, z, m = EDGE.corridorMargin) {
  const { rects, slanted } = corridorsFor(m);
  for (let i = 0; i < rects.length; i += 4) if (x > rects[i] && x < rects[i + 1] && z > rects[i + 2] && z < rects[i + 3]) return true;
  for (let k = 0; k < slanted.length; k++) { const o = slanted[k]; if (x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1 && pointInPoly(o.pts, x, z)) return true; }
  return false;
}

// Could any point of this box be in a corridor? A box that touches no road's
// bounds holds no corridor point, so a stretch of the ring far from every road
// (nearly all of it) is known free without asking about each point in it.
function corridorMayTouch(x0, x1, z0, z1) {
  const { rects, slanted } = corridorsFor(EDGE.corridorMargin);
  for (let i = 0; i < rects.length; i += 4) if (x1 >= rects[i] && x0 <= rects[i + 1] && z1 >= rects[i + 2] && z0 <= rects[i + 3]) return true;
  for (let k = 0; k < slanted.length; k++) { const o = slanted[k]; if (x1 >= o.x0 && x0 <= o.x1 && z1 >= o.z0 && z0 <= o.z1) return true; }
  return false;
}

// The ring: towers along every outline edge, outward, continuous, with varied
// depth and height (a stepped skyline), leaving each road's corridor open.
// Axis-aligned edges get plain boxes; the chamfer's diagonal gets turned
// ones (angle). Convex corners get a corner tower.
export function edgeTowers() {
  const rand = seeded(3310), out = [], s = Math.sign(signedArea(OUTLINE)) || 1, n = OUTLINE.length;
  const range = ([a, b]) => a + rand() * (b - a);
  for (let i = 0; i < n; i++) {
    const [ax, az] = OUTLINE[i], [bx, bz] = OUTLINE[(i + 1) % n], len = Math.hypot(bx - ax, bz - az);
    if (len < .5) continue;
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    // outward normal (away from the playable area)
    const nx = s * uz, nz = -s * ux;
    const axis = Math.abs(ux) < 1e-6 || Math.abs(uz) < 1e-6;
    // Which metres along the edge are free of every road's corridor (the
    // ring runs right up to a road, never over it).
    const steps = Math.max(1, Math.round(len * 2)), step = len / steps, free = [];
    for (let k = 0; k < steps; k++) {
      let ok = true;
      // (Axis-aligned edges look 12 m out, the towers' depth; the chamfer's
      // towers are turned, so only a thin strip at the edge is tested, and
      // the Cut's corridor keeps its own clearance.)
      const reach = axis ? 6 : 1;
      // (The box round every point tested for this step, a hair wider for rounding.)
      const p0x = ax + ux * k * step, p0z = az + uz * k * step, p1x = ax + ux * (k + 1) * step, p1z = az + uz * (k + 1) * step, ox = nx * reach * 2, oz = nz * reach * 2;
      if (!corridorMayTouch(Math.min(p0x, p1x, p0x + ox, p1x + ox) - 1e-6, Math.max(p0x, p1x, p0x + ox, p1x + ox) + 1e-6, Math.min(p0z, p1z, p0z + oz, p1z + oz) - 1e-6, Math.max(p0z, p1z, p0z + oz, p1z + oz) + 1e-6)) { free.push(true); continue; }
      for (let j = 0; j <= reach && ok; j++) for (let fi = 0; fi < 3; fi++) { const f = FRACTIONS[fi], tt = (k + f) * step, x = ax + ux * tt + nx * j * 2, z = az + uz * tt + nz * j * 2; if (inCorridor(x, z)) { ok = false; break; } }
      free.push(ok);
    }
    for (let k = 0; k < steps;) {
      if (!free[k]) { k++; continue; }
      let end = k; while (end < steps && free[end]) end++;
      // the run k..end, cut into towers
      let t = k * step; const stop = end * step;
      while (t < stop - .01) {
        let piece = Math.min(stop - t, range(EDGE.length)); if (stop - t - piece < 3) piece = stop - t;
        const dep = range(EDGE.depth), cx = ax + ux * (t + piece / 2), cz = az + uz * (t + piece / 2);
        const mx = cx + nx * dep / 2, mz = cz + nz * dep / 2, height = Math.round(range(EDGE.height));
        if (axis) out.push({ id: `ring-${out.length}`, x: +mx.toFixed(3), z: +mz.toFixed(3), w: +(Math.abs(ux) * piece + Math.abs(nx) * dep).toFixed(3), d: +(Math.abs(uz) * piece + Math.abs(nz) * dep).toFixed(3), height, ring: true });
        else out.push({ id: `ring-${out.length}`, x: +mx.toFixed(3), z: +mz.toFixed(3), w: +piece.toFixed(3), d: +dep.toFixed(3), angle: +Math.atan2(-uz, ux).toFixed(5), height, ring: true });
        t += piece;
      }
      k = end;
    }
    // A convex corner (the outline turns away from the ring): fill the gap.
    const [cx2, cz2] = OUTLINE[(i + 2) % n], vx = cx2 - bx, vz = cz2 - bz, turn = ux * vz - uz * vx;
    if (turn * s > 1e-6) {
      // Outward normals of this edge and the next: the gap lies between them.
      const vl = Math.hypot(vx, vz) || 1, mx2 = s * vz / vl, mz2 = -s * vx / vl, dep = 10;
      const px = bx + (nx + mx2) * dep / 2, pz = bz + (nz + mz2) * dep / 2;
      if (!inCorridor(px, pz)) out.push({ id: `ring-${out.length}`, x: +px.toFixed(3), z: +pz.toFixed(3), w: dep, d: dep, height: Math.round(range(EDGE.height)), ring: true, corner: true });
    }
  }
  return out;
}

// The barricades: across each road where it leaves the map, a solid line of
// water-filled barriers (colliders only; drawn by world/city-barricades.js),
// set EDGE.barrier.beyond m inside the playable boundary so nothing that
// moves a body (a walk, a dodge, a dash, knockback, a launch, the draw-cut)
// ever reaches the edge through them. Unbreakable, no gaps.
export function barricades() {
  return BARRICADES.map((b, i) => {
    const B = EDGE.barrier;
    if (b.axis === 'x') return { id: `barricade-${i}`, road: b.road, x: b.x, z: b.z, w: b.length, d: B.thickness, height: B.height, shell: false, barricade: true, out: [0, b.z < 0 ? -1 : 1] };
    if (b.axis === 'z') return { id: `barricade-${i}`, road: b.road, x: b.x, z: b.z, w: B.thickness, d: b.length, height: B.height, shell: false, barricade: true, out: [b.x < 0 ? -1 : 1, 0] };
    const r = ROADS.find(q => q.id === b.road), g = roadGeometry(r);
    return { id: `barricade-${i}`, road: b.road, x: b.x, z: b.z, w: b.length, d: B.thickness, angle: +Math.atan2(-g.nz, g.nx).toFixed(5), height: B.height, shell: false, barricade: true, out: [+g.ux.toFixed(5), +g.uz.toFixed(5)] };
  });
}
