// Lumen's buildings as rooms (stage 0, AGENTS.md > Lumen > Rooms).
//
// A city building is one shell, one cut and one interior made of several
// rooms. Each room is an ordinary entry in `map.buildings` (a rectangle, or a
// four-sided `quad` for the flatiron's wedge), so everything that already
// works on one room (the simulation's interior, the camera's room framing,
// the shroud, the sight cones, robots' rooms) works on each room unchanged.
// The rooms of one building share its `group` (the building's id): moving
// between them keeps the building cut; seeing between them goes through the
// inner doorways only.
//
// Authoring (map data, world coordinates):
//   { id, tall | low, height, floor, rooms: [
//       { id, rect: [x0, x1, z0, z1] } | { id, quad: [[x, z] x4] },
//       ... ],
//     doors: [{ at: [x, z], width }]        doorways to the outside, on a room's outer wall
//     links: [{ at: [x, z], width }]        inner doorways, on the wall two rooms share
//   }
// A door's `at` is a point on the wall line; the room (or the two rooms) and
// the side are found from it. Rooms must tile cleanly: two rooms that touch
// share a whole side of the smaller one (tests/city-rooms.test.js).
import { quadEdge, quadContains, buildingWalls, buildingContains } from '../map-kit.js';

const EPS = .01;
export const CITY_DOOR = 1.6;      // an outer doorway's default width (m)
export const CITY_LINK = 1.6;      // an inner doorway's width at least (m): 1.3 let no nav-grid square's centre through (0.5 m squares, a 0.46 m body), so robots missed 41 rooms
export const CITY_FLOOR = 3.6;     // the first floor's height: the cut stops here

// A room's outline as points in order (rect rooms go round clockwise from
// the north-west corner as seen from above: -z is north).
export function roomOutline(r) {
  if (r.quad) return r.quad.map(([x, z]) => [x, z]);
  const [x0, x1, z0, z1] = r.rect;
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}

// Which side (rect) or edge (quad) of room `r` the point lies on, and where
// along it (offset from the side's middle), or null.
export function wallAt(r, x, z) {
  if (r.quad) {
    for (let i = 0; i < r.quad.length; i++) {
      const e = quadEdge(r.quad, i), t = (x - e.mx) * e.ux + (z - e.mz) * e.uz, n = Math.abs((x - e.mx) * e.uz - (z - e.mz) * e.ux);
      if (n < .05 && Math.abs(t) <= e.length / 2 + EPS) return { edge: i, offset: t, length: e.length };
    }
    return null;
  }
  const [x0, x1, z0, z1] = r.rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, inX = x >= x0 - EPS && x <= x1 + EPS, inZ = z >= z0 - EPS && z <= z1 + EPS;
  if (Math.abs(z - z1) < .05 && inX) return { side: 'front', offset: x - cx, length: x1 - x0 };
  if (Math.abs(z - z0) < .05 && inX) return { side: 'back', offset: x - cx, length: x1 - x0 };
  if (Math.abs(x - x1) < .05 && inZ) return { side: 'right', offset: z - cz, length: z1 - z0 };
  if (Math.abs(x - x0) < .05 && inZ) return { side: 'left', offset: z - cz, length: z1 - z0 };
  return null;
}
const wallKey = w => w.side ?? w.edge;

// Where two rooms touch: the overlap of one room's side with another's
// (collinear, facing), as { a: wall of r1, b: wall of r2, length }.
export function contact(r1, r2) {
  const o1 = roomOutline(r1), o2 = roomOutline(r2);
  let best = null;
  for (let i = 0; i < o1.length; i++) {
    const [ax, az] = o1[i], [bx, bz] = o1[(i + 1) % o1.length];
    for (let j = 0; j < o2.length; j++) {
      const [cx, cz] = o2[j], [dx, dz] = o2[(j + 1) % o2.length];
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
      // collinear: both of c, d on the line a-b
      if (Math.abs((cx - ax) * uz - (cz - az) * ux) > .02 || Math.abs((dx - ax) * uz - (dz - az) * ux) > .02) continue;
      const tc = (cx - ax) * ux + (cz - az) * uz, td = (dx - ax) * ux + (dz - az) * uz;
      const lo = Math.max(0, Math.min(tc, td)), hi = Math.min(len, Math.max(tc, td));
      if (hi - lo < .05) continue;
      const mid = [ax + ux * (lo + hi) / 2, az + uz * (lo + hi) / 2];
      const a = wallAt(r1, ...mid), b = wallAt(r2, ...mid);
      if (a && b && (!best || hi - lo > best.length)) best = { a, b, length: hi - lo, full1: hi - lo > a.length - .05, full2: hi - lo > b.length - .05, mid };
    }
  }
  return best;
}

// The rooms of one city building as `map.buildings` entries.
export function cityRooms(b) {
  // (A room lower than the first floor, the bus or a booth: its floor is its roof.)
  const wallHeight = b.tall ? (b.height ?? 60) : (b.height ?? 5), floor = Math.min(b.floor ?? CITY_FLOOR, wallHeight);
  const rooms = b.rooms.map(r => {
    const pts = roomOutline(r), xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const room = { id: `${b.id}/${r.id}`, room: r.id, group: b.id, style: 'city-room', x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, angle: 0,
      height: floor, wallHeight, doorWidth: CITY_DOOR, doors: [], openings: [], ...(r.followCamera && { followCamera: true }) };
    if (r.quad) room.quad = r.quad.map(([x, z]) => [x, z]);
    return { spec: r, room };
  });
  const opening = (entry, wall, width, extra = {}) => entry.room.openings.push({ ...(wall.side ? { side: wall.side } : { edge: wall.edge }), offset: wall.offset, width, ...extra });
  // Outer doors: on the one room whose wall the point is on.
  for (const d of b.doors || []) {
    const hits = rooms.filter(r => wallAt(r.spec, ...d.at));
    if (hits.length !== 1) throw new Error(`${b.id}: outer door at ${d.at} is on ${hits.length} room walls`);
    opening(hits[0], wallAt(hits[0].spec, ...d.at), d.width ?? CITY_DOOR, { outer: true });
  }
  // Inner doorways: on both rooms, each seeing the other through it.
  for (const l of b.links || []) {
    const hits = rooms.filter(r => wallAt(r.spec, ...l.at));
    if (hits.length !== 2) throw new Error(`${b.id}: inner door at ${l.at} is on ${hits.length} room walls`);
    const [p, q] = hits;
    opening(p, wallAt(p.spec, ...l.at), Math.max(l.width ?? 0, CITY_LINK), { into: q.room.id });
    opening(q, wallAt(q.spec, ...l.at), Math.max(l.width ?? 0, CITY_LINK), { into: p.room.id });
  }
  // Shared walls: the smaller room's side is the copy that is not built.
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const c = contact(rooms[i].spec, rooms[j].spec); if (!c) continue;
    // (Equal sides, one measured along a quad's edge: within a centimetre counts
    // as equal, so the owner never flips on the last bit of a square root.)
    const [skip, wall] = c.full1 && (!c.full2 || c.a.length <= c.b.length + .01) ? [rooms[i], c.a] : c.full2 ? [rooms[j], c.b] : [null, null];
    if (!skip) throw new Error(`${b.id}: rooms ${rooms[i].spec.id} and ${rooms[j].spec.id} touch along part of a side only`);
    const key = skip.room.quad ? 'sharedEdges' : 'sharedSides';
    (skip.room[key] ||= []).push(wallKey(wall));
  }
  // Each room can find its neighbours by id (the sight cones through inner
  // doorways; vision-polygons.js). Not enumerable: map data stays plain for
  // the map's fingerprint (maps.js mapHash) and never loops.
  const siblings = new Map(rooms.map(r => [r.room.id, r.room]));
  for (const r of rooms) Object.defineProperty(r.room, 'siblings', { value: siblings, enumerable: false });
  return rooms.map(r => r.room);
}

// Every city building's rooms, for `map.buildings`.
export const cityBuildings = list => list.flatMap(cityRooms);

// The same room group? (Lumen: rooms of one building see each other through
// their inner doorways.) Any other map: only the same room.
export const sameRoomGroup = (a, b) => a === b || (!!a && !!b && !!a.group && a.group === b.group);

// --- Sight between rooms of one building (Simulation.canAimAt) -------------
// From inside `room` at (px, pz), is (x, z) in view? Through the building's
// walls only by their doorways, and never through a third room: the room you
// are in, a room next to it through an inner doorway, or outside through one
// of your room's own outer doorways.
const groupWalls = new WeakMap();
function wallsOf(map, group) {
  let cache = groupWalls.get(map);
  if (!cache) groupWalls.set(map, cache = new Map());
  let entry = cache.get(group);
  if (!entry) {
    const rooms = map.buildings.filter(b => b.group === group);
    entry = { rooms, walls: rooms.flatMap(buildingWalls).filter(w => !w.playerOnly) };
    cache.set(group, entry);
  }
  return entry;
}
function segmentHitsBox(ax, az, bx, bz, box) {
  let x0 = ax - box.x, z0 = az - box.z, x1 = bx - box.x, z1 = bz - box.z, hw = box.w / 2, hd = box.d / 2;
  if (box.angle && box.localW !== undefined) {
    const c = Math.cos(box.angle), s = Math.sin(box.angle);
    [x0, z0, x1, z1] = [x0 * c - z0 * s, x0 * s + z0 * c, x1 * c - z1 * s, x1 * s + z1 * c]; hw = box.localW / 2; hd = box.localD / 2;
  }
  let near = 0, far = 1; const dx = x1 - x0, dz = z1 - z0;
  for (const [p, d, h] of [[x0, dx, hw], [z0, dz, hd]]) {
    if (Math.abs(d) < 1e-9) { if (p < -h || p > h) return false; continue; }
    const t0 = (-h - p) / d, t1 = (h - p) / d;
    near = Math.max(near, Math.min(t0, t1)); far = Math.min(far, Math.max(t0, t1)); if (near > far) return false;
  }
  return true;
}
// Does the segment pass through the inside of room r (kept .25 m in from its walls)?
function crossesRoom(ax, az, bx, bz, r) {
  for (let k = 1; k < 16; k++) {
    const t = k / 16, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    if (!buildingContains(r, { x, z })) continue;
    // inset: all four neighbours .25 m away inside as well
    if (buildingContains(r, { x: x + .25, z }) && buildingContains(r, { x: x - .25, z }) && buildingContains(r, { x, z: z + .25 }) && buildingContains(r, { x, z: z - .25 })) return true;
  }
  return false;
}
export function cityCanAim(map, room, px, pz, x, z) {
  const { rooms, walls } = wallsOf(map, room.group);
  for (const w of walls) if (segmentHitsBox(px, pz, x, z, w)) return false;
  const target = rooms.find(r => buildingContains(r, { x, z })) || null;
  for (const r of rooms) if (r !== room && r !== target && crossesRoom(px, pz, x, z, r)) return false;
  return true;
}

// Rooms as a list of outlines (overhead map, ground, rain mask).
export const roomPolygon = r => r.quad ? r.quad : [[r.x - r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z + r.d / 2], [r.x - r.w / 2, r.z + r.d / 2]];
export { quadContains };
