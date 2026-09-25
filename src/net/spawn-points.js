// Where players come into a multiplayer game: always inside a building,
// picked at random, never on top of furniture or another player.
//
// Each building is sampled on a small grid in its own (rotated) frame. A spot
// counts if a body fits there: inside the walls with a margin, clear of every
// collider (furniture, crates, the walls themselves) and inside the playable
// area. Rail cars and other tiny shells are skipped: a spawn should be a room.
import { buildingContains } from '../maps.js';
import { isPlayable } from '../playable-area.js';
import { RULES } from '../config/gameplay.js';

const MIN_ROOM = 6;       // metres: anything narrower is a shelter, not a room
const GRID = 1.4;         // metres between sampled spots
const CLEARANCE = .25;    // extra room around the body

function blocked(colliders, x, z, r) {
 for (const b of colliders) {
  if (b.walkOver) continue;
  if (Math.abs(x - b.x) > b.w / 2 + r || Math.abs(z - b.z) > b.d / 2 + r) continue;
  const angle = b.localW !== undefined ? (b.angle || 0) : 0, c = Math.cos(angle), s = Math.sin(angle);
  const px = (x - b.x) * c - (z - b.z) * s, pz = (x - b.x) * s + (z - b.z) * c;
  const hw = (b.localW ?? b.w) / 2, hd = (b.localD ?? b.d) / 2;
  const cx = Math.max(-hw, Math.min(hw, px)), cz = Math.max(-hd, Math.min(hd, pz));
  if (Math.hypot(px - cx, pz - cz) < r) return true;
 }
 return false;
}

// Every usable spot, grouped by building: [{ id, points: [{x, z}] }].
export function interiorSpawns(map, colliders) {
 const r = RULES.radius + CLEARANCE, rooms = [];
 for (const b of map.buildings) {
  if (b.w < MIN_ROOM || b.d < MIN_ROOM) continue;
  const c = Math.cos(b.angle || 0), s = Math.sin(b.angle || 0), points = [];
  for (let lx = -b.w / 2 + 1.2; lx <= b.w / 2 - 1.2 + 1e-6; lx += GRID)
   for (let lz = -b.d / 2 + 1.2; lz <= b.d / 2 - 1.2 + 1e-6; lz += GRID) {
    // Local to world: the inverse of buildingContains' rotation.
    const x = b.x + lx * c + lz * s, z = b.z - lx * s + lz * c;
    if (!buildingContains(b, { x, z }) || !isPlayable(map, x, z, r) || blocked(colliders, x, z, r)) continue;
    points.push({ x, z });
   }
  if (points.length) rooms.push({ id: b.id, points });
 }
 return rooms;
}

// A random building, then a random spot in it, preferring spots with nobody
// within `space` metres. `others`: [{x, z}] of players already in the world.
export function pickSpawn(rooms, others = [], random = Math.random, space = 6) {
 if (!rooms.length) return null;
 const clear = p => others.every(o => Math.hypot(o.x - p.x, o.z - p.z) >= space);
 const order = rooms.map(room => ({ room, key: random() })).sort((a, b) => a.key - b.key).map(e => e.room);
 for (const room of order) {
  const free = room.points.filter(clear);
  if (free.length) return free[Math.floor(random() * free.length)];
 }
 const room = order[0];
 return room.points[Math.floor(random() * room.points.length)];
}

// A random open spot anywhere in the map (solo practice spawns, the dev
// tools' "move to a random spot"): inside the playable area with room round
// it, clear of every collider, and (when `others` are given) at least
// `space` metres from each of them. Null if none turns up in `tries`.
export function openSpot(map, colliders, { random = Math.random, others = [], space = 0, tries = 400, margin = 2 } = {}) {
 const r = RULES.radius + CLEARANCE + .15;
 for (let k = 0; k < tries; k++) {
  const x = (random() - .5) * (map.width - margin * 2), z = (random() - .5) * (map.depth - margin * 2);
  if (!isPlayable(map, x, z, margin) || blocked(colliders, x, z, r)) continue;
  // Not wedged into a tiny shell (rail cars, sheds): open ground or a room.
  if (map.buildings?.some(b => (b.w < MIN_ROOM || b.d < MIN_ROOM) && buildingContains(b, { x, z }))) continue;
  if (space && others.some(o => Math.hypot(o.x - x, o.z - z) < space)) continue;
  return { x, z };
 }
 return null;
}
