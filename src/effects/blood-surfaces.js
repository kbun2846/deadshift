// Where thrown blood lands: the first wall or crate side along a line, found
// from the simulation's collider boxes (2D, cheap) instead of raycasting the
// merged world meshes (every triangle of the map, a visible hitch per death).
// Also the floor height at a point: a building's floorboards or the ground.
import { buildingContains } from '../map-kit.js';
import { segmentBox } from '../simulation.js';

// First collider face crossed from (x, z) along (dx, dz) within `reach`
// metres. Windows (playerOnly) let blood through. Returns { distance, x, z,
// nx, nz, height, propId } (n: the face's outward normal), or null.
export function castToWall(colliders, x, z, dx, dz, reach, minHeight = 0) {
 const length = Math.hypot(dx, dz); if (!colliders || length < 1e-6) return null;
 const ux = dx / length, uz = dz / length, ex = x + ux * reach, ez = z + uz * reach;
 let best = null, bestT = Infinity;
 for (const box of colliders) {
  if (box.playerOnly || (box.height ?? 3) < minHeight) continue;
  // Skip boxes the start point is inside (standing against or in a doorway).
  const t = segmentBox(x, z, ex, ez, box);
  if (t === null || t <= 1e-4 || t >= bestT) continue;
  bestT = t; best = box;
 }
 if (!best) return null;
 const hx = x + (ex - x) * bestT, hz = z + (ez - z) * bestT;
 // The face: which side of the box (in its own frame) the point sits on.
 const angle = best.localW !== undefined ? best.angle || 0 : 0, c = Math.cos(angle), s = Math.sin(angle);
 const w = best.localW ?? best.w, d = best.localD ?? best.d, rx = hx - best.x, rz = hz - best.z;
 const lx = rx * c - rz * s, lz = rx * s + rz * c;
 let nlx = 0, nlz = 0;
 if (Math.abs(Math.abs(lx) - w / 2) < Math.abs(Math.abs(lz) - d / 2)) nlx = Math.sign(lx) || 1; else nlz = Math.sign(lz) || 1;
 return { distance: bestT * reach, x: hx, z: hz, nx: nlx * c + nlz * s, nz: -nlx * s + nlz * c, height: best.height ?? 3, propId: best.propId ?? null };
}

// The floor under a point: floorboards (.065 up, the freight shed's deck
// higher) inside a building, else the ground.
export function floorHeight(map, x, z) {
 for (const b of map?.buildings || []) if (buildingContains(b, { x, z })) return b.cargo ? .3 : .07;
 return .02;
}
