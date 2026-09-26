// The placement rules for Hollow Wick's breakables (task s2-breakables),
// shared by tests/hollow-breakables.test.js and the placing tools. Returns a
// list of what is wrong with one placed prop (empty: fine).
import { PROP_TYPES } from '../src/map-kit.js';
import { isPlayable } from '../src/playable-area.js';
import { BUILDING_PADS, BASES } from '../src/maps/hollow-wick.js';

export const RULES = Object.freeze({
  baseClear: 3,      // m from a base's centre (the task: nothing within 2)
  padClear: 1,       // m off a building's walls
  doorClear: 2.5,    // m clear in front of a building's long sides
  pathClear: .25,    // m past a path's half width (and the prop's own size)
  bankClear: .4,     // m outside the stream's banks
  edgeClear: .5,     // m off a retaining wall's line
  targetClear: 2,    // m from a practice target
  maxSlope: .35,     // rise per metre at the prop's corners
  spacing: .1,       // m between two props' footprints
});

const segDistance = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l)) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
};

// The prop's footprint corners and radius (turned by its angle as mapColliders turns it).
export function footprint(p) {
  const t = PROP_TYPES[p.type], s = p.scale || 1, w = t.w * s, d = t.d * s, a = p.angle || 0, c = Math.cos(a), sn = Math.sin(a);
  const corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => [p.x + x * c + z * sn, p.z - x * sn + z * c]);
  return { corners, radius: Math.hypot(w, d) / 2, half: Math.min(w, d) / 2 };
}

export function placementProblems(map, ground, p, others = []) {
  const out = [], t = PROP_TYPES[p.type];
  if (!t) return [`unknown type ${p.type}`];
  const { corners, radius } = footprint(p), points = [[p.x, p.z], ...corners];
  // Inside the fence.
  if (!points.every(([x, z]) => isPlayable(map, x, z, .5))) out.push('outside the fence');
  // Water, decks, slope.
  for (const [x, z] of points) {
    if (ground.bankDistance(x, z) < RULES.bankClear) { out.push('in the stream'); break; }
  }
  if (points.some(([x, z]) => ground.deckAt(x, z) >= 0)) out.push('on a deck');
  const g = { x: 0, z: 0 };
  for (const [x, z] of points) { ground.gradientAt(x, z, g); if (Math.hypot(g.x, g.z) > RULES.maxSlope) { out.push(`on a slope ${Math.hypot(g.x, g.z).toFixed(2)}`); break; } }
  // Retaining walls.
  for (const e of ground.edges) if (segDistance(p.x, p.z, e.ax, e.az, e.bx, e.bz) < radius + RULES.edgeClear) { out.push('against a retaining wall'); break; }
  // Paths (every path: drawn or not, they are the ways people walk).
  for (const path of map.terrain.paths) {
    const pts = path.points;
    for (let i = 1; i < pts.length; i++) {
      const dmin = Math.min(...points.map(([x, z]) => segDistance(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])));
      if (dmin < path.width / 2 + RULES.pathClear) { out.push(`on path ${path.id}`); break; }
    }
  }
  // Buildings: off the walls, and clear of the doors on the long sides.
  for (const b of BUILDING_PADS) {
    const a = b.angle || 0, c = Math.cos(a), s = Math.sin(a);
    for (const [x, z] of points) {
      const dx = x - b.x, dz = z - b.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
      const ox = Math.abs(lx) - b.w / 2, oz = Math.abs(lz) - b.d / 2;
      if (ox < RULES.padClear && oz < RULES.padClear) { out.push(`against ${b.id}`); break; }
      const longX = b.w >= b.d;
      if (longX ? (Math.abs(lx) < b.w / 2 && oz < RULES.doorClear) : (Math.abs(lz) < b.d / 2 && ox < RULES.doorClear)) { out.push(`before ${b.id}'s door side`); break; }
    }
  }
  for (const [id, [bx, bz]] of Object.entries(BASES)) if (Math.hypot(p.x - bx, p.z - bz) < RULES.baseClear + radius) out.push(`in base ${id}`);
  for (const target of map.targets || []) if (Math.hypot(p.x - target.x, p.z - target.z) < RULES.targetClear + radius) out.push(`by target ${target.id}`);
  // Any other prop on the map (other builders' too, once merged).
  for (const o of others) {
    if (o === p || o.id === p.id || !PROP_TYPES[o.type]) continue;
    const r2 = footprint(o).radius;
    if (Math.hypot(p.x - o.x, p.z - o.z) < (radius + r2) * .72 + RULES.spacing) out.push(`overlaps ${o.type} at ${o.x},${o.z}`);
  }
  return out;
}
