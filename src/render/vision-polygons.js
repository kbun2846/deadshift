import * as THREE from 'three';
import { buildingPoint, buildingOpenings } from '../maps.js';
import { sameRoomGroup } from '../world/city-rooms.js';

export function interiorPolygons(room, player) {
  const polygons = [room.quad ? room.quad.map(([x, z]) => ({ x, z })) : [buildingPoint(room,-room.w/2,-room.d/2),buildingPoint(room,room.w/2,-room.d/2),buildingPoint(room,room.w/2,room.d/2),buildingPoint(room,-room.w/2,room.d/2)]];
  for (const opening of buildingOpenings(room)) {
    const {a,b} = opening;
    const distance = Math.abs((b.x-a.x)*(player.z-a.z)-(b.z-a.z)*(player.x-a.x))/Math.hypot(b.x-a.x,b.z-a.z);
    // A portal seen exactly edge-on has no area, not an unrestricted sight region.
    if (distance < .001) continue;
    // Lumen: an inner doorway shows the next room only, so its cone stops
    // at that room's far walls (each edge ray where it leaves the room).
    const next = opening.into && room.siblings?.get(opening.into);
    if (next) {
      // (The doorway's true ends: the .1 m the other doors keep in would leave
      // a grey sliver along the next room's view that the game still sees.)
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1, ux = (b.x - a.x) / l * .1, uz = (b.z - a.z) / l * .1;
      for (const quad of throughDoorway(next, player, { x: a.x - ux, z: a.z - uz }, { x: b.x + ux, z: b.z + uz })) polygons.push(quad);
      continue;
    }
    const factor = 1 + 65 / Math.max(.01,Math.min(Math.hypot(a.x-player.x,a.z-player.z),Math.hypot(b.x-player.x,b.z-player.z)));
    const extend = p => ({x:player.x+(p.x-player.x)*factor,z:player.z+(p.z-player.z)*factor});
    polygons.push([a,b,extend(b),extend(a)]);
  }
  return polygons;
}

// What of room r shows through the doorway a-b: the room cut to the wedge
// between the two rays from the player through the doorway's ends (convex:
// the doorway, where each ray leaves the room, and the room's corners
// between them), handed back as 4-point convex pieces (the shader reads
// quads; a triangle repeats a point).
export function throughDoorway(r, player, a, b) {
  const pts = [a, b, exitPoint(r, player, b), exitPoint(r, player, a)];
  const corners = r.quad || [[r.x - r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z + r.d / 2], [r.x - r.w / 2, r.z + r.d / 2]];
  const ax = a.x - player.x, az = a.z - player.z, bx = b.x - player.x, bz = b.z - player.z, side = ax * bz - az * bx;
  for (const [x, z] of corners) {
    const cx = x - player.x, cz = z - player.z;
    // between the rays (same turn from a as b, and from b as a), beyond the doorway line
    if ((ax * cz - az * cx) * side > 1e-9 && (cx * bz - cz * bx) * side > 1e-9 && ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x)) * ((b.x - a.x) * (player.z - a.z) - (b.z - a.z) * (player.x - a.x)) < 0) pts.push({ x, z });
  }
  const hull = convexHull(pts), quads = [];
  for (let i = 1; i < hull.length - 1; i += 2) { const q = [hull[0], hull[i], hull[i + 1], hull[Math.min(i + 2, hull.length - 1)]]; quads.push(q); }
  return quads;
}
function convexHull(points) {
  const p = points.map(q => ({ x: q.x, z: q.z })).sort((u, v) => u.x - v.x || u.z - v.z), cross = (o, u, v) => (u.x - o.x) * (v.z - o.z) - (u.z - o.z) * (v.x - o.x);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-9) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 1e-9) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// Where the ray from the player through doorway point p leaves room r.
export function exitPoint(r, player, p) {
  const pts = r.quad || [[r.x - r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z + r.d / 2], [r.x - r.w / 2, r.z + r.d / 2]];
  let dx = p.x - player.x, dz = p.z - player.z; const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((ax - p.x) * ez - (az - p.z) * ex) / den, u = ((ax - p.x) * dz - (az - p.z) * dx) / den;
    if (t > .05 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, t);
  }
  if (!Number.isFinite(best)) best = 0;
  return { x: p.x + dx * best, z: p.z + dz * best };
}

// The room you are in as the camera sees it: its box from the floor to the
// eaves and out past the walls' faces and trim, as six faces whose union is
// its outline on screen. The shroud (vision.js) clears it as well as the
// polygons above (stage 5 review, owner: laid at .7 m, the room's clear patch
// left the upper walls, the window heads and the pulpit grey between the
// openings' cones, grey patches where no window was). The polygons above stay
// the flat sight test (interior-visibility.js reads their XZ, four points each).
export const ROOM_MARGIN = .3;
export function roomBox(room) {
  const base = room.baseY || 0, top = base + (room.height || 3), m = ROOM_MARGIN;
  if (room.quad) { // Lumen's wedge rooms: the prism over the quad, each edge pushed out by the margin
    const low = offsetPolygon(room.quad, m).map(([x, z]) => ({ x, z, y: base }));
    const high = low.map(p => ({ x: p.x, z: p.z, y: top }));
    return [low, high, ...low.map((p, i) => [p, low[(i + 1) % 4], high[(i + 1) % 4], high[i]])];
  }
  const at = (sx, sz) => { const p = buildingPoint(room, sx * (room.w / 2 + m), sz * (room.d / 2 + m)); return { x: p.x, z: p.z, y: base }; };
  const low = [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)], high = low.map(p => ({ x: p.x, z: p.z, y: top }));
  return [low, high, ...low.map((p, i) => [p, low[(i + 1) % 4], high[(i + 1) % 4], high[i]])];
}

// A convex polygon with every edge moved out by d (each corner where its two
// moved edges meet).
export function offsetPolygon(poly, d) {
  const n = poly.length; let area = 0;
  for (let i = 0; i < n; i++) { const p = poly[i], q = poly[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
  const s = area > 0 ? 1 : -1, lines = [];
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n], ex = q[0] - p[0], ez = q[1] - p[1], l = Math.hypot(ex, ez) || 1, nx = s * ez / l, nz = -s * ex / l;
    lines.push({ px: p[0] + nx * d, pz: p[1] + nz * d, ex, ez });
  }
  return lines.map((b, i) => {
    const a = lines[(i + n - 1) % n], den = a.ex * b.ez - a.ez * b.ex;
    if (Math.abs(den) < 1e-9) return [b.px, b.pz];
    const t = ((b.px - a.px) * b.ez - (b.pz - a.pz) * b.ex) / den;
    return [a.px + a.ex * t, a.pz + a.ez * t];
  });
}

// Clip BEFORE perspective division: points behind the camera otherwise mirror
// across the screen and turn a doorway cone into a large false clear region.
export function projectVisionPolygon(points,camera,width,height,y=.7) {
  const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  // (A point's own `y` if it has one: roomBox's faces.)
  let vertices = points.map(p=>new THREE.Vector4(p.x,p.y ?? y,p.z,1).applyMatrix4(matrix));
  for (const axis of ['x','y','z']) for (const sign of [-1,1]) {
    const output=[];
    for(let i=0;i<vertices.length;i++) {
      const a=vertices[i],b=vertices[(i+1)%vertices.length],da=a.w+sign*a[axis],db=b.w+sign*b[axis];
      if(da>=0) output.push(a);
      if((da>=0)!==(db>=0)) output.push(a.clone().lerp(b,da/(da-db)));
    }
    vertices=output;
  }
  return vertices.map(p=>({x:(p.x/p.w*.5+.5)*width,y:(.5-p.y/p.w*.5)*height}));
}

// Open sheds also conceal occupants from an observer under a different roof.
export function roomShowsEntity(sim,p) {
 const room=sim.buildingAt(p.x,p.z);return !room||sameRoomGroup(room,sim.interior);
}
