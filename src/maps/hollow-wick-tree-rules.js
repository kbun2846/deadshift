// Where a tree, stump, log or leaf drift may stand on Hollow Wick (stage 2,
// the trees). Pure: it takes the map and its ground (map-kit.js groundFor), so
// the placing tool (tools/place-trees.mjs) and the tests
// (tests/hollow-wick-trees.test.js) ask the same questions. No three.js.
import { isPlayable } from '../playable-area.js';
import { BASES } from './hollow-wick.js';
import { mapColliders } from '../map-kit.js';

// Everything solid on the map but the trees (other builders' headstones,
// walls and props, the buildings' walls), once per map.
const SOLIDS = new WeakMap();
function solids(map) {
 let list = SOLIDS.get(map);
 if (!list) SOLIDS.set(map, list = mapColliders({ ...map, trees: null }).filter(c => !c.terrainEdge && !c.walkOver && !c.playerOnly));
 return list;
}
const boxDistance = (x, z, c) => {
 const a = c.angle || 0, cs = Math.cos(a), sn = Math.sin(a), dx = x - c.x, dz = z - c.z;
 const lx = Math.abs(dx * cs - dz * sn) - (c.localW ?? c.w) / 2, lz = Math.abs(dx * sn + dz * cs) - (c.localD ?? c.d) / 2;
 return Math.hypot(Math.max(0, lx), Math.max(0, lz));
};

// Spots other builders own, kept clear (x, z, radius m): the hanging tree set
// piece (4 m round it), the skeletons, the drag trail's end, the fork's
// marker, the well and woodpile, the open grave, the rocking chair, the body
// pile, the reed beds by the bridge, the covered bridge's wings, and the
// field's set pieces.
export const KEEP_CLEAR = [
 [-4, -24, 4.6], [-9, -55, 2.2], [-31, -27, 2], [14, 38, 2], [8, -49.5, 2], [-7.5, -4.5, 1.6], [20, -3, 2.4], [14.5, -5.8, 2],
 [-27, -7.5, 2.4], [-28, -5, 2], [13, -19.2, 2], [-40, 17, 4.5], [22, 18.6, 3], [22, 33, 2.5], [16.5, 29.5, 2], [40, 34, 2],
 [-6, 44, 2.5], [-36, 46, 3], [30, -29, 2],
];
// Rectangles other builders own (x0, x1, z0, z1): the reed beds.
export const KEEP_CLEAR_BOXES = [[-10.5, -6.5, 19, 25], [-25.5, -18.5, 19.5, 25.5]];
// The drag trail of dried blood (its own builder): a line kept 1.5 m clear.
export const DRAG_TRAIL = [[13, -9.5], [10, -15.5], [6.5, -22], [6, -36], [8, -49.5]];

const segmentDistance = (x, z, ax, az, bx, bz) => {
 const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)) : 0;
 return Math.hypot(x - ax - dx * t, z - az - dz * t);
};
export const lineDistance = (x, z, points) => {
 let best = Infinity;
 for (let i = 1; i < points.length; i++) best = Math.min(best, segmentDistance(x, z, points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]));
 return best;
};
export const insidePolygon = (x, z, poly) => {
 let inside = false;
 for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
  const [ax, az] = poly[i], [bx, bz] = poly[j];
  if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
 }
 return inside;
};
const padDistance = (x, z, p) => {
 const c = Math.cos(p.angle || 0), s = Math.sin(p.angle || 0), dx = x - p.x, dz = z - p.z;
 const lx = Math.abs(dx * c - dz * s) - p.w / 2, lz = Math.abs(dx * s + dz * c) - p.d / 2;
 return Math.hypot(Math.max(0, lx), Math.max(0, lz)) - (lx < 0 && lz < 0 ? Math.min(-lx, -lz) : 0);
};

// Every reason (x, z) is no place for something `r` m in radius: [] when it
// is clear. `bank`: how far outside the stream's banks it must stand (the
// willows stand closer), `slope`: the steepest ground allowed.
export function spotProblems(map, ground, x, z, r = .5, { bank = 1, slope = .35, fenceRoom = 1.2 } = {}) {
 const problems = [], t = map.terrain;
 for (const p of t.paths) if (lineDistance(x, z, p.points) < p.width / 2 + (p.shoulder ?? 1) + r) problems.push('path ' + p.id);
 for (const f of t.fords || []) if (lineDistance(x, z, f.points) < f.width / 2 + (f.shoulder ?? 1) + r) problems.push('ford');
 if (ground.bankDistance(x, z) < bank + r) problems.push('water');
 for (const d of t.decks || []) if (insidePolygon(x, z, d.poly) || d.poly.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2 + r)) problems.push('deck ' + d.id);
 for (const p of t.pads || []) if (padDistance(x, z, p) < (p.margin ?? 1.5) + .5 + r) problems.push('pad');
 // (The buildings make their own pads now: baseY, padMargin.)
 for (const b of map.buildings || []) if (b.baseY !== undefined && padDistance(x, z, b) < (b.padMargin ?? 1.5) + .5 + r) problems.push('pad');
 // Clear of everything else solid by a body's width (a walk round a trunk).
 for (const c of solids(map)) if (boxDistance(x, z, c) < r + .9) { problems.push('solid'); break; }
 for (const e of ground.edges) if (segmentDistance(x, z, e.ax, e.az, e.bx, e.bz) < 1 + r) problems.push('wall');
 // (map.bases: the spawn areas, { x, z, points }; BASES before they were built.)
 const bases = Array.isArray(map.bases) ? map.bases : Object.values(BASES).map(([bx, bz]) => ({ x: bx, z: bz, points: [] }));
 for (const b of bases) if (Math.hypot(x - b.x, z - b.z) < 6 + r || b.points?.some(p => Math.hypot(x - p.x, z - p.z) < 2 + r)) problems.push('base');
 for (const p of map.ffaSpawns || []) if (Math.hypot(x - p.x, z - p.z) < 2 + r) problems.push('spawn');
 for (const [kx, kz, kr] of KEEP_CLEAR) if (Math.hypot(x - kx, z - kz) < kr + r) problems.push('keep-clear');
 for (const [x0, x1, z0, z1] of KEEP_CLEAR_BOXES) if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) problems.push('keep-clear');
 if (lineDistance(x, z, DRAG_TRAIL) < 1.5 + r) problems.push('drag trail');
 for (const target of map.targets || []) if (Math.hypot(x - target.x, z - target.z) < 2.5 + r + (target.travel || 0)) problems.push('target');
 const g = ground.gradientAt(x, z, { x: 0, z: 0 });
 if (Math.hypot(g.x, g.z) > slope) problems.push('slope');
 // Inside the fence, never pinching the walk along it (outside it is backdrop).
 if (isPlayable(map, x, z, 0) && !isPlayable(map, x, z, fenceRoom + r)) problems.push('fence');
 return problems;
}
