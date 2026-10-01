// The rules of tests/lumen-cover.test.js and the spawns test, as functions over the map's own data (stage 4,
// tests/lumen-breakables.test.js): the obstacles a new piece must clear (buildings, solids, the pieces already
// placed, door aprons, zebras, the sniper lane, the Crossroads, Back Alley, the spawns and targets) and the
// geometry to measure them. No three.js, no DOM.
import { maps, mapColliders, mapProps, buildingOpenings } from '../src/maps.js';
import { isPlayable } from '../src/playable-area.js';
import { ROADS, CROSSROADS, BACK_ALLEY, FOOTPRINTS, BASES, BARRICADES, OUTLINE } from '../src/maps/lumen-layout.js';
import { intersections, groundMarkings, LUMEN_GROUND } from '../src/world/lumen-ground.js';
import { SNIPER_LANE } from '../src/maps/lumen-cover.js';
export const map = maps.lumen;
export { maps };
export { ROADS, CROSSROADS, BACK_ALLEY, FOOTPRINTS, BASES, BARRICADES, OUTLINE, SNIPER_LANE, isPlayable, mapColliders, mapProps, buildingOpenings };
export const boxPoly = (x, z, w, d, a = 0) => {
  const c = Math.cos(a), s = Math.sin(a), hw = w / 2, hd = d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]);
};
export const area = poly => poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const withBB = e => { e.bb = bounds(e.poly); return e; };
export const bounds = poly => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of poly) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } return { x0, x1, z0, z1 }; };
export function penetration(P, Q) {
  let least = Infinity;
  for (const poly of [P, Q]) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], nx = -(b[1] - a[1]), nz = b[0] - a[0], len = Math.hypot(nx, nz) || 1;
    let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
    for (const [x, z] of P) { const v = (x * nx + z * nz) / len; if (v < p0) p0 = v; if (v > p1) p1 = v; }
    for (const [x, z] of Q) { const v = (x * nx + z * nz) / len; if (v < q0) q0 = v; if (v > q1) q1 = v; }
    least = Math.min(least, Math.min(p1, q1) - Math.max(p0, q0));
  }
  return least;
}
function pointSegment(px, pz, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2)) : 0; return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t); }
export function distance(P, Q) {
  if (penetration(P, Q) > 1e-9) return 0;
  let best = Infinity;
  for (const [A, B] of [[P, Q], [Q, P]]) for (const [x, z] of A) for (let i = 0; i < B.length; i++) best = Math.min(best, pointSegment(x, z, B[i], B[(i + 1) % B.length]));
  return best;
}
export const footprints = FOOTPRINTS.flatMap(f => [...(f.parts || []).map(([x0, x1, z0, z1]) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]), ...(f.quads || [])].map(poly => withBB({ poly, id: f.id })));
const withBox = e => e;
// The colliders of a map's props (as polygons) and the rest of its solid pieces.
export const propPolys = m => mapColliders(m).filter(c => c.propId !== undefined).map(c => withBB({ ...c, poly: boxPoly(c.x, c.z, c.localW ?? c.w, c.localD ?? c.d, c.angle || 0) }));
// Walk-over pieces have no collider (a round would stop on one: weapons/rifle.js roundMeets on a flat map);
// their footprint stands in for it wherever placement rules measure them.
export const footprintPoly = p => boxPoly(p.x, p.z, p.w * (p.scale || 1), p.d * (p.scale || 1), p.angle || 0);
export const walkOverPolys = m => mapProps(m).filter(p => p.walkOver && Array.isArray(p.collisionBoxes) && !p.collisionBoxes.length)
  .map(p => withBB({ x: p.x, z: p.z, w: p.w * (p.scale || 1), d: p.d * (p.scale || 1), angle: p.angle || 0, height: 0, walkOver: true, propId: p.id, poly: footprintPoly(p) }));
export const piecePolys = m => [...propPolys(m), ...walkOverPolys(m)];
export const solids = mapColliders(map).filter(c => c.solid !== undefined && c.propId === undefined).map(c => withBB({ ...c, poly: boxPoly(c.x, c.z, c.localW ?? c.w, c.localD ?? c.d, c.angle || 0), kind: c.barricade ? 'barricade' : 'solid' }));
// door aprons
export const doors = [];
for (const b of map.buildings) for (const o of buildingOpenings(b)) if (o.outer) {
  const mx = (o.a.x + o.b.x) / 2, mz = (o.a.z + o.b.z) / 2, len = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) || 1, ux = (o.b.x - o.a.x) / len, uz = (o.b.z - o.a.z) / len;
  let nx = -uz, nz = ux; if ((mx + nx - b.x) ** 2 + (mz + nz - b.z) ** 2 < (mx - b.x) ** 2 + (mz - b.z) ** 2) { nx = -nx; nz = -nz; }
  const w = o.width + 1.4, out = 2.4;
  doors.push(withBB({ id: b.id, poly: [[mx - ux * w / 2, mz - uz * w / 2], [mx + ux * w / 2, mz + uz * w / 2], [mx + ux * w / 2 + nx * out, mz + uz * w / 2 + nz * out], [mx - ux * w / 2 + nx * out, mz - uz * w / 2 + nz * out]] }));
}
// zebras
const blvd = ROADS.find(r => r.id === 'boulevard'), ave = ROADS.find(r => r.id === 'avenue'), C = CROSSROADS;
export const zebras = [...intersections().flatMap(j => j.crosswalks),
  { x0: C.x0, x1: C.x0 + 3, z0: -blvd.width / 2, z1: blvd.width / 2 }, { x0: C.x1 - 3, x1: C.x1, z0: -blvd.width / 2, z1: blvd.width / 2 },
  { x0: ave.centre - ave.width / 2, x1: ave.centre + ave.width / 2, z0: C.z0, z1: C.z0 + 3 }, { x0: ave.centre - ave.width / 2, x1: ave.centre + ave.width / 2, z0: C.z1 - 3, z1: C.z1 }]
  .map(r => withBB({ poly: [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]] }));
export const stripes = groundMarkings().filter(m => m.colour === LUMEN_GROUND.crosswalk).map(m => withBB({ poly: m.quad }));
export const lane = withBB({ poly: boxPoly((SNIPER_LANE.from[0] + SNIPER_LANE.to[0]) / 2, SNIPER_LANE.from[1], SNIPER_LANE.to[0] - SNIPER_LANE.from[0] - .1, 2) });
export const crossRect = withBB({ poly: boxPoly((C.x0 + C.x1) / 2, (C.z0 + C.z1) / 2, C.x1 - C.x0, C.z1 - C.z0) });
export const recess = withBB({ poly: boxPoly(-12, BACK_ALLEY.z0 + .6, 5, 1.2) });
export const alleyBox = withBB({ poly: boxPoly((BACK_ALLEY.x0 + BACK_ALLEY.x1) / 2, (BACK_ALLEY.z0 + BACK_ALLEY.z1) / 2, BACK_ALLEY.x1 - BACK_ALLEY.x0, BACK_ALLEY.z1 - BACK_ALLEY.z0) });
export const spawnPts = [...map.bases.flatMap(b => b.points), ...map.ffaSpawns, map.spawn];
export const targetPts = map.targets;
