// Where Hollow Wick's life pieces (stage 5, s5-life: the goat's pen, the
// washing line, the stick effigies; src/maps/hollow-wick-life.js) may stand.
// A copy of tools/place-detail.mjs's problems(p) (that tool writes its file
// when imported, so it cannot be imported), on top of the breakables' rules
// (tests/hollow-breakables-rules.js placementProblems): inside the fence, out
// of the stream, off decks, retaining walls, every path's walking lane and
// the building pads, 2.4 m clear of every doorway, 1.1 m round every spawn
// point, 5.5 m from a base's middle, off a practice target's run, 0.35 m from
// every other solid and 1.2 m from a tree trunk, level (the ground under a
// solid piece varies by less than 0.38 m, no corner on a slope over 0.34),
// 2.5 m off the drag trail and clear of the other builders' set pieces.
// Pure (no three.js): used by tests/hollow-life.test.js.
import { mapColliders, buildingOpenings } from '../src/map-kit.js';
import { placementProblems } from './hollow-breakables-rules.js';
import { DRAG_TRAIL, KEEP_CLEAR, lineDistance } from '../src/maps/hollow-wick-tree-rules.js';
import { BUILDING_PADS, BASES } from '../src/maps/hollow-wick.js';

const boxDistance = (x, z, c) => { const a = c.angle || 0, cs = Math.cos(a), sn = Math.sin(a), dx = x - c.x, dz = z - c.z; const lx = Math.abs(dx * cs - dz * sn) - (c.localW ?? c.w) / 2, lz = Math.abs(dx * sn + dz * cs) - (c.localD ?? c.d) / 2; return Math.hypot(Math.max(0, lx), Math.max(0, lz)); };
const cornersOf = c => { const a = c.angle || 0, cs = Math.cos(a), sn = Math.sin(a), w = (c.localW ?? c.w) / 2, d = (c.localD ?? c.d) / 2; return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([lx, lz]) => [c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs]); };

// The rules against `full` (the whole map) without the pieces in `own` (ids):
// a piece is never measured against itself or the other life pieces' first
// placement, only against what `placed` lists.
export function lifeRules(full, ground, own) {
 const map = { ...full, props: full.props.filter(p => !own.has(p.id)) };
 const points = [...map.bases.flatMap(b => b.points), ...map.ffaSpawns];
 const doors = map.buildings.flatMap(b => buildingOpenings(b).filter(o => o.type === 'door').map(o => ({ b, o })));
 const solids = mapColliders(map).filter(c => !c.walkOver && !c.terrainEdge);
 const collidersOf = p => mapColliders({ ...map, buildings: [], trees: null, fences: [], crossings: null, props: [p] }).filter(c => c.propId !== undefined);
 return function problems(p, placed = []) {
  const mine = collidersOf({ ...p, id: 'probe' }), others = solids.concat(placed.filter(q => q.id !== p.id).flatMap(collidersOf));
  // (The slope rule is for solid pieces, which stand on the ground: a piece
  // with no collider (an effigy hanging over a bank) may be over a slope.)
  const out = placementProblems(map, ground, p, [...map.props, ...placed]).filter(m => mine.length || !m.startsWith('on a slope'));
  if (points.some(s => mine.some(c => boxDistance(s.x, s.z, c) < 1.1))) out.push('spawn');
  for (const { b, o } of doors) {
   const mx = (o.a.x + o.b.x) / 2, mz = (o.a.z + o.b.z) / 2, ux = o.b.x - o.a.x, uz = o.b.z - o.a.z, len = Math.hypot(ux, uz);
   let nx = -uz / len, nz = ux / len; if (nx * (mx - b.x) + nz * (mz - b.z) < 0) { nx = -nx; nz = -nz; }
   for (const step of [.5, 1.2, 2, 2.4]) for (const side of [-.7, 0, .7]) if (mine.some(c => boxDistance(mx + nx * step + ux / len * side, mz + nz * step + uz / len * side, c) < .55)) { out.push(`${b.id}'s door`); break; }
  }
  for (const c of mine) if (others.some(s => boxDistance(c.x, c.z, s) < Math.max(c.localW ?? c.w, c.localD ?? c.d) / 2 + (s.tree ? 1.2 : .35))) { out.push('solid'); break; }
  // A flat-bottomed piece: the ground under it varies by less than 0.38 m.
  const hs = mine.flatMap(c => cornersOf(c).map(([x, z]) => ground.heightAt(x, z)));
  if (hs.length && Math.max(...hs) - Math.min(...hs) > .38) out.push('uneven');
  const corners = mine.flatMap(cornersOf);
  for (const b of BUILDING_PADS) {
   const a = b.angle || 0, cs = Math.cos(a), sn = Math.sin(a);
   for (const [x, z] of corners) {
    const lx = (x - b.x) * cs - (z - b.z) * sn, lz = (x - b.x) * sn + (z - b.z) * cs;
    if (Math.abs(lx) <= b.w / 2 + .5 && Math.abs(lz) <= b.d / 2 + .5) out.push('pad');
    if ([[0, b.d / 2], [0, -b.d / 2], [b.w / 2, 0], [-b.w / 2, 0]].some(([mx, mz]) => Math.hypot(lx - mx, lz - mz) <= 2.4)) out.push(`${b.id}'s side middle`);
   }
  }
  if (Object.values(BASES).some(([bx, bz]) => Math.hypot(p.x - bx, p.z - bz) < 5.5 + 1.2)) out.push('base');
  for (const t of map.targets || []) if (Math.abs(p.z - t.z) < 3 && p.x > t.x - (t.travel || 0) - 3 && p.x < t.x + (t.travel || 0) + 3) out.push('target');
  for (const [x, z] of corners) { const g = ground.gradientAt(x, z); if (Math.hypot(g.x, g.z) > .34) { out.push('slope'); break; } } // (corners of colliders only)
  if (lineDistance(p.x, p.z, DRAG_TRAIL) < 2.5) out.push('drag trail');
  if (KEEP_CLEAR.some(([kx, kz, kr]) => Math.hypot(p.x - kx, p.z - kz) < kr + 1.2)) out.push('set piece');
  return out;
 };
}
