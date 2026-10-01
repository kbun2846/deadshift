// Lumen's signs, screens, traffic lights and street lamps (stage 3): the map's
// `citySigns` list, plain seeded data for render/city-signs.js `addList`, and
// the light pools painted into the ground under the bright ones.
// Read claude/lumen-design.md sections 8 (street furniture), 12 (lighting),
// 13 (screens), 15 (palette, district light identities) and 19/20 (decisions).
//
// What is in it (tests/lumen-signs.test.js checks all of it):
//   - Traffic lights: mast-arm poles on the corners of the five signalled
//     junctions (one blinks red, one is dead with its pole fallen), heads for
//     each approach (both directions of a road are one group, the cross road
//     the other), pedestrian heads at the ends of the crosswalks that exist,
//     and at the Crossroads the most: a gantry over the island and a mast at
//     each of the five mouths.
//   - Street lamps every 16-18 m along the main roads (the Boulevard, the
//     Avenue, the Cut), sparser on the side streets, cold LED white and
//     sodium in the industrial west; one flickers, one is dead, one sparks.
//     The poles stand on the kerb edge of the sidewalks, never in a doorway's
//     apron, on a crosswalk or in the building-side 1.4 m of a sidewalk, and
//     never through a prop. They are visuals: no colliders (a body walks
//     through a 14 cm pole).
//   - Neon on the buildings, by district (the light identities of section 15),
//     shop screens by the doors, facade panels, window slits, about twelve
//     big screens and about forty small ones, a few that loop the warning
//     pictograms, a few broken (frozen, glitch-torn, cracked).
//   - The light mix (section 12): about 45% plain white and utility light,
//     35% neon (a fifth of it failing or half dead), 20% screens.
//
// Shootable (design 20): a piece is `breakable` only if its lowest edge is
// under 2.4 m (rounds fly at 0.7-1.3 m and a sign is above them: CitySigns
// onShot breaks a piece a round's path meets at any height under its top) and
// it is not within 15 m of a base's area or 2 m of a doorway. Everything else is
// fixed (no break slot).
//
// Every number is rounded (2 decimals; 3 for angles and seeds), so the list is
// the same on every engine whatever its Math.sin does in the last bit; the map
// keeps it out of its fingerprint anyway (lumen.js, like `city.ground`).
import { FOOTPRINTS, ROADS, CROSSROADS } from './lumen-layout.js';
import { intersections, roadGeometry, groundMarkings, insideOutline, LUMEN_GROUND } from '../world/lumen-ground.js';
import { LUMEN_BUILDINGS_NORTH } from './lumen-buildings-north.js';
import { LUMEN_BUILDINGS_SOUTH } from './lumen-buildings-south.js';
import { LUMEN_BUILDINGS_EAST } from './lumen-buildings-east.js';
import { LUMEN_PROPS } from './lumen-cover.js';
import { LUMEN_BASES } from './lumen-spawns.js';
import { LUMEN_PROP_TYPES } from '../world/lumen-props.js';
import { LUMEN_DETAIL_PROPS } from './lumen-detail.js';
import { edgeTowers } from '../world/lumen-edge.js';

export const LUMEN_SIGN_RULES = Object.freeze({
  wall: .19,            // m from a footprint edge to the shell's outer face (half the 0.38 m wall)
  reachable: 2.4,       // m: a piece whose lowest edge is under this can be hit by a round
  baseClear: 15,        // m: nothing breakable within this of a base's area (its polygon edge)
  doorClear: 2,         // m: nothing breakable within this of a doorway
  doorApron: 2.4,       // m: a door's apron (the cover rules'), poles keep out of it
  buildingSide: 1.4,    // m of every sidewalk on the building side stays clear of poles
  poleFromKerb: .55,    // m: a lamp or signal pole's centre stands this far in from the kerb line
  poleReach: .3,        // m round a pole that props and crosswalks keep clear of it
  lamp: Object.freeze({ height: 7, arm: 1.6, mainSpacing: 17, sideSpacing: 26, wiggle: 1, mixEvery: 3 }),
  // The pieces' own numbers where the placement rules need them (the builders
  // know the same ones in render/city-signs.js SIGN and SCREEN).
  neonMargin: .12, bezel: .09,
  hang: 2,              // m clear under a small tube sign that nothing forbids from being shot
});
const R = LUMEN_SIGN_RULES;

const round = (v, k = 100) => Math.round(v * k) / k;
const r2 = v => round(v), r3 = v => round(v, 1000);
// A seeded stream of its own (the layout's, not shared: the same numbers whatever else changes).
function stream(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

// ---------------------------------------------------------------------------
// Buildings: exposed faces and doors.

const SPECS = [...LUMEN_BUILDINGS_NORTH, ...LUMEN_BUILDINGS_SOUTH, ...LUMEN_BUILDINGS_EAST];
const SPEC = new Map(SPECS.map(b => [b.id, b]));
const DOOR_WIDTH = 1.6; // world/city-rooms.js CITY_DOOR

const compass = (nx, nz) => {
  const a = Math.atan2(nx, nz) * 180 / Math.PI; // 0 = +z (south), 90 = +x (east)
  const names = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
  return names[((Math.round(a / 45) % 8) + 8) % 8];
};
const inPoly = (poly, x, z) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
};

// Every footprint's exposed edges (not shared with another part of the same
// building), each with its outward normal, its compass name and length.
function buildFaces() {
  const faces = new Map();
  for (const f of FOOTPRINTS) {
    const rings = [...(f.parts || []).map(([x0, x1, z0, z1]) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]), ...(f.quads || []).map(q => q.map(p => [p[0], p[1]]))];
    const list = [];
    rings.forEach((ring, ri) => {
      const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < .5) return;
        let nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
        if ((cx - (a[0] + b[0]) / 2) * nx + (cz - (a[1] + b[1]) / 2) * nz > 0) { nx = -nx; nz = -nz; }
        // The stretches of the edge not hidden inside another part of the
        // same building (a U's arms share long walls with its back).
        const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], step = .1;
        let start = null;
        const close = end => {
          if (start !== null && end - start >= .5) {
            const a2 = [a[0] + dir[0] * start, a[1] + dir[1] * start], b2 = [a[0] + dir[0] * end, a[1] + dir[1] * end];
            list.push({ id: f.id, name: compass(nx, nz), a: a2, b: b2, len: end - start, n: [nx, nz], dir, axis: Math.abs(nx) > .99 ? 'z' : Math.abs(nz) > .99 ? 'x' : 'd' });
          }
          start = null;
        };
        for (let k = 0; k * step < len; k++) {
          const t = Math.min(len, (k + .5) * step), mx = a[0] + dir[0] * t + nx * .3, mz = a[1] + dir[1] * t + nz * .3;
          const hidden = rings.some((other, oi) => oi !== ri && inPoly(other, mx, mz));
          if (hidden) close(k * step); else if (start === null) start = k * step;
        }
        close(len);
      });
    });
    faces.set(f.id, list);
  }
  return faces;
}
// (Everything below that is worked out from the layout is made the first time it
// is asked for, not at import: it cost every page load ~.1 s, whichever map it
// played. maps/lumen.js reads the signs lazily.)
const once = make => { let value; let made = false; return () => made ? value : (made = true, value = make()); };
const getFaces = once(buildFaces);

// The face of building `id` called `name` ('S', 'NE', ...) that holds `u` (a
// world x for a N/S face, z for an E/W face, metres from the start for a
// diagonal one), else the longest.
function faceOf(id, name, u) {
  const list = (getFaces().get(id) || []).filter(f => f.name === name);
  if (!list.length) throw new Error(`lumen-signs: ${id} has no ${name} face`);
  if (u != null) {
    const held = list.filter(f => coordinateRange(f)[0] - 1e-6 <= u && u <= coordinateRange(f)[1] + 1e-6);
    if (held.length) return held[0];
  }
  return list.reduce((best, f) => (f.len > best.len ? f : best));
}
function coordinateRange(f) {
  if (f.axis === 'x') return [Math.min(f.a[0], f.b[0]), Math.max(f.a[0], f.b[0])];
  if (f.axis === 'z') return [Math.min(f.a[1], f.b[1]), Math.max(f.a[1], f.b[1])];
  return [0, f.len];
}
// Metres from the face's start for a coordinate.
const alongFace = (f, u) => f.axis === 'x' ? (u - f.a[0]) * f.dir[0] : f.axis === 'z' ? (u - f.a[1]) * f.dir[1] : u;
// The point on the shell's outer face at coordinate u, and the angle its face looks.
function wallPoint(f, u, out = R.wall) {
  const t = alongFace(f, u);
  return { x: f.a[0] + f.dir[0] * t + f.n[0] * out, z: f.a[1] + f.dir[1] * t + f.n[1] * out, t, facing: Math.atan2(f.n[0], f.n[1]), f };
}

// Outer doors: { id, x, z, nx, nz, ux, uz, width } at the wall line.
function buildDoors() {
  const doors = [];
  for (const spec of SPECS) for (const d of spec.doors || []) {
    const face = (getFaces().get(spec.id) || []).find(f => {
      const t = (d.at[0] - f.a[0]) * f.dir[0] + (d.at[1] - f.a[1]) * f.dir[1], off = (d.at[0] - f.a[0]) * f.n[0] + (d.at[1] - f.a[1]) * f.n[1];
      return Math.abs(off) < .06 && t > -.05 && t < f.len + .05;
    });
    if (!face) continue; // (a door on an inner shared wall of the footprint: not an outside door)
    doors.push({ id: spec.id, x: d.at[0], z: d.at[1], nx: face.n[0], nz: face.n[1], ux: face.dir[0], uz: face.dir[1], width: d.width ?? DOOR_WIDTH, face: face.name });
  }
  return doors;
}
const getDoors = once(buildDoors);
export const lumenDoors = () => getDoors().map(d => ({ ...d }));

const dist2seg = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
};
// Distance from the wall segment (x, z) +- (ux, uz) * half to the nearest doorway (its opening).
function doorDistance(x, z, ux, uz, half) {
  let best = Infinity;
  for (const d of getDoors()) {
    const hw = d.width / 2;
    for (const t of [-1, -.5, 0, .5, 1]) best = Math.min(best, dist2seg(x + ux * half * t, z + uz * half * t, d.x - d.ux * hw, d.z - d.uz * hw, d.x + d.ux * hw, d.z + d.uz * hw));
  }
  return best;
}
// Distance to the nearest base AREA (0 inside): the rule keeps a base's whole ground, not just its
// spawn points, free of breakables. Uses the base's own polygon (its points' bounds, 1.2 m out).
const baseDistance = (x, z) => { let d = Infinity; for (const b of LUMEN_BASES) d = Math.min(d, polyDistance(x, z, b.poly)); return d; };

// ---------------------------------------------------------------------------
// Props: their footprints, so a pole never stands in one.
const getPropBoxes = once(() => LUMEN_PROPS.flatMap(p => {
  const t = LUMEN_PROP_TYPES[p.type]; if (!t) return [];
  const c = Math.cos(p.angle || 0), s = Math.sin(p.angle || 0);
  return t.collisionBoxes.map(([bx, bz, w, d]) => ({ x: p.x + bx * c + bz * s, z: p.z - bx * s + bz * c, w, d, c, s }));
}));
// Is (x, z), grown by `r`, inside a prop's box?
function inProp(x, z, r) {
  for (const b of getPropBoxes()) {
    const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
    if (Math.abs(lx) < b.w / 2 + r && Math.abs(lz) < b.d / 2 + r) return true;
  }
  return false;
}


// ---------------------------------------------------------------------------
// Where a pole may stand.

const ringsOf = f => [...(f.parts || []).map(([x0, x1, z0, z1]) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]), ...(f.quads || []).map(q => q.map(p => [p[0], p[1]]))];
const getBuildingRings = once(() => FOOTPRINTS.flatMap(ringsOf));
// Distance from a point to a polygon (0 inside).
function polyDistance(x, z, ring) {
  if (inPoly(ring, x, z)) return 0;
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; best = Math.min(best, dist2seg(x, z, a[0], a[1], b[0], b[1])); }
  return best;
}
const buildingDistance = (x, z) => { let d = Infinity; for (const ring of getBuildingRings()) d = Math.min(d, polyDistance(x, z, ring)); return d; };

let ZEBRAS = null; // the crosswalk bars (lumen-ground.js groundMarkings), made once
const zebras = () => {
  if (!ZEBRAS) {
    const paint = new Set([LUMEN_GROUND.crosswalk, ...LUMEN_GROUND.crosswalkFaded]);
    ZEBRAS = groundMarkings().filter(m => paint.has(m.colour)).map(m => m.quad);
  }
  return ZEBRAS;
};
function zebraDistance(x, z) {
  let d = Infinity; for (const q of zebras()) d = Math.min(d, polyDistance(x, z, q));
  return d;
}
// Is (x, z) nearer than `limit` to any of `rings`? The same answer as
// comparing the distances above, but a ring whose box (grown by `limit`)
// the point is outside cannot be that near and is skipped: poleFree asks this
// for thousands of candidate spots against every building and crosswalk bar
// (it was half a second of Lumen's load).
const ringBoxes = new WeakMap();
function ringBox(ring) {
  let box = ringBoxes.get(ring);
  if (!box) {
    box = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, z] of ring) { box[0] = Math.min(box[0], x); box[1] = Math.max(box[1], x); box[2] = Math.min(box[2], z); box[3] = Math.max(box[3], z); }
    ringBoxes.set(ring, box);
  }
  return box;
}
function nearAny(rings, x, z, limit) {
  for (const ring of rings) {
    const b = ringBox(ring);
    if (x < b[0] - limit || x > b[1] + limit || z < b[2] - limit || z > b[3] + limit) continue;
    if (polyDistance(x, z, ring) < limit) return true;
  }
  return false;
}
// Is (x, z) in a door's apron (its width + 1.4 m, 2.4 m out), grown by `pad`?
function inApron(x, z, pad = 0) {
  for (const d of getDoors()) {
    const dx = x - d.x, dz = z - d.z, along = dx * d.ux + dz * d.uz, out = dx * d.nx + dz * d.nz;
    if (Math.abs(along) < d.width / 2 + .7 + pad && out > -pad && out < R.doorApron + pad) return true;
  }
  return false;
}
// The junction boxes and the Crossroads (with a margin), where lamps make way for the signals.
const getJunctions = once(intersections);
function nearJunction(x, z, m) {
  const C = CROSSROADS;
  if (x > C.x0 - m && x < C.x1 + m && z > C.z0 - m && z < C.z1 + m) return true;
  return getJunctions().some(j => x > j.x0 - m && x < j.x1 + m && z > j.z0 - m && z < j.z1 + m);
}
// A pole's foot at (x, z): on the map, off the crosswalks, out of doors' aprons
// and props, and its building side clear (1.4 m of every sidewalk).
function poleFree(x, z, { junction = 0, building = R.buildingSide + .1, offRoad = false } = {}) {
  return insideOutline(x, z, 1.6) && !nearAny(getBuildingRings(), x, z, building) && !nearAny(zebras(), x, z, .5) && !inApron(x, z, .3) && !inProp(x, z, R.poleReach) && !(junction && nearJunction(x, z, junction)) && !(offRoad && onRoadway(x, z));
}
// The nearest free spot to (x, z) within `reach` m, tried outward in rings of
// .25 m steps; null when none.
function nearestFree(x, z, reach = 2.5, options = {}) {
  if (poleFree(x, z, options)) return [x, z];
  for (let d = .25; d <= reach; d += .25) for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (poleFree(px, pz, options)) return [px, pz];
  }
  return null;
}

// ---------------------------------------------------------------------------
// The list. Every piece goes through `emit`, which rounds its numbers.

const NUMERIC_3 = new Set(['facing', 'seed', 'tilt']);
// Every other building's and ring tower's footprint (outline, top): a face is
// "exposed" in buildFaces when no other part of its own building covers it,
// so a stretch against a neighbour (a party wall) counted too, and 53 signs
// stood inside the building next door: unseen until that one was cut away
// or the camera came into it, then floating in the air (owner, 2026-10-01,
// "exterior detail showing when ... they go transparent").
const getVolumes = once(() => [
  ...FOOTPRINTS.flatMap(f => [...(f.parts || []).map(([x0, x1, z0, z1]) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]), ...(f.quads || []).map(q => q.map(p => [p[0], p[1]]))]
    .map(ring => ({ id: f.id, ring, top: SPEC.get(f.id)?.height ?? f.low ?? 60 }))),
  ...edgeTowers().filter(s => s.shell !== false).map(s => {
    const a = s.angle || 0, c = Math.cos(a), n = Math.sin(a), hw = s.w / 2, hd = s.d / 2;
    return { id: 'tower', ring: [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [s.x + x * c + z * n, s.z - x * n + z * c]), top: s.height ?? 60 };
  }),
]);
// Is a piece on building `id`'s wall (at its middle, facing, `half` m to
// each side along the wall, its foot at `foot` m) inside another building or
// tower under its top? (`.1` m out from the wall, so a party line counts.)
export function buriedPiece(id, at, facing, half, foot) {
  const nx = Math.sin(facing || 0), nz = Math.cos(facing || 0);
  for (const s of [0, -half, half]) {
    const x = at[0] + nx * .1 + nz * s, z = at[2] + nz * .1 - nx * s;
    for (const v of getVolumes()) if (v.id !== id && foot < v.top && inPoly(v.ring, x, z)) return true;
  }
  return false;
}
const pieceBuried = o => o.buildingId && o.at && o.mount !== 'free' && (o.kind === 'neon' || o.kind === 'screen' || o.kind === 'panel')
  && buriedPiece(o.buildingId, o.at, o.facing, o.kind === 'neon' ? (o.size ?? 1) * aspectOf(o.shape) / 2 : (o.w ?? 1) / 2, o.at[1] - (o.kind === 'neon' ? (o.size ?? 1) : (o.h ?? .5)) / 2);
function emit(out, o) {
  if (pieceBuried(o)) return { ...o }; // (inside the building next door: never made)
  const piece = {};
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v === undefined) continue;
    piece[k] = Array.isArray(v) && typeof v[0] === 'number' ? v.map(r2) : typeof v === 'number' ? (NUMERIC_3.has(k) ? r3(v) : r2(v)) : v;
  }
  out.push(piece);
  return piece;
}

// ---------------------------------------------------------------------------
// Street lamps.

const isSodium = (x, z) => x <= -24 && z >= 8; // the industrial west: the garage, West Street's south, South Street's west end
function onRoadway(x, z) {
  for (const r of ROADS) if (polyDistance(x, z, roadGeometry(r).road) === 0) return true;
  return false;
}
// (roadGeometry allocates; the roads are few and this runs at load only.)

function lampList(out) {
  const rand = stream(5150), lamps = [];
  const L = R.lamp;
  const place = (x, z, facing, extra = {}) => lamps.push({ x, z, facing, ...extra });
  // Along a road, one side: candidates every ~spacing, each moved along the
  // kerb (not across it) to the nearest free spot; a candidate with none is
  // skipped.
  const along = (r, side, from, to, spacing) => {
    const h = r.width / 2 + R.poleFromKerb;
    let pos, facing;
    if (r.axis === 'x') { pos = t => [t, r.centre + side * h]; facing = side < 0 ? 0 : Math.PI; }
    else if (r.axis === 'z') { pos = t => [r.centre + side * h, t]; facing = -side * Math.PI / 2; }
    else {
      const g = roadGeometry(r), ux = g.ux, uz = g.uz, nx = g.nx, nz = g.nz;
      pos = t => [r.a[0] + ux * t + nx * side * h, r.a[1] + uz * t + nz * side * h];
      facing = Math.atan2(-side * nx, -side * nz);
    }
    for (let t = from; t <= to;) {
      let spot = null;
      for (let d = 0; d <= 6 && !spot; d += .5) for (const sgn of d ? [-1, 1] : [1]) {
        const tt = t + sgn * d; if (tt < from - 1 || tt > to + 1) continue;
        const [x, z] = pos(tt);
        if (poleFree(x, z, { junction: 3.6 })) { spot = [x, z, tt]; break; }
      }
      if (spot) { place(spot[0], spot[1], facing); t = spot[2] + spacing + (rand() - .5) * 2; } else t += 2;
    }
  };
  const road = id => ROADS.find(r => r.id === id);
  const main = L.mainSpacing, side = L.sideSpacing;
  along(road('boulevard'), -1, -58, 58, main); along(road('boulevard'), 1, -58 + main / 2, 58, main);
  along(road('avenue'), -1, -52, 52, main); along(road('avenue'), 1, -52 + main / 2, 52, main);
  // The Cut runs from the Crossroads' corner to its barricade (34.5 m along, 3.5 m short of it).
  along(road('the-cut'), -1, 6, 31, main); along(road('the-cut'), 1, 6 + main / 2, 31, main);
  along(road('west-street'), -1, -52, 31, side); along(road('west-street'), 1, -52 + side / 2, 31, side);
  along(road('north-lane'), -1, -25, 0, side); along(road('north-lane'), 1, -25 + side / 2, 0, side);
  along(road('south-street'), -1, -58, 0, side); along(road('south-street'), 1, -58 + side / 2, 0, side);
  // The plazas and the lot: hand-placed targets, moved to the nearest free spot
  // that is not a roadway; the arm points at the target.
  for (const [tx, tz, ax, az] of [
    [-9, -9.6, 6, 0], [21, -9.6, 6, 0], [-8.6, 9.6, 6, 0], [21.4, 11.6, 6, 0],         // the Crossroads' corners, arms to its middle
    [43, -16, 50, -24], [55, -33, 50, -24], [58.4, -18, 50, -24],                       // Uptown's plaza
    [19.2, 24, 26, 30], [19.4, 38, 26, 38], [31, 34.6, 26, 38], [29, 55, 30, 48],       // the metro plaza
    [-23.2, 38.4, -12, 46], [-5.4, 38.4, -12, 46], [-4.6, 55, -12, 48], [-23, 55, -12, 48], // the charging lot's floods
  ]) {
    const spot = nearestFree(tx, tz, 3, { junction: 0 });
    if (!spot || onRoadway(spot[0], spot[1])) continue;
    place(spot[0], spot[1], Math.atan2(ax - spot[0], az - spot[1]));
  }
  // The failing ones (design 8): one flickers, one is dead, one sparks.
  const nearest = (x, z, skip) => lamps.reduce((best, l) => (skip.has(l) || Math.hypot(l.x - x, l.z - z) >= Math.hypot(best.x - x, best.z - z) ? best : l), lamps.find(l => !skip.has(l)));
  const taken = new Set(), pick = (x, z) => { const l = nearest(x, z, taken); taken.add(l); return l; };
  pick(-40, -7.6).mode = 'flicker';
  pick(-31, -28).mode = 'dead';
  pick(11.6, 38).spark = 55;
  lamps.forEach((l, i) => {
    const sodium = isSodium(l.x, l.z);
    emit(out, { kind: 'lamp', at: [l.x, 0, l.z], facing: l.facing, height: L.height, arm: L.arm, colour: sodium ? 'sodium' : 'coldWhite', intensity: sodium ? 1.7 : 1.9,
      mode: l.mode, seed: r3(rand()), breakable: l.spark ? true : false, spark: l.spark, id: `lamp-${i}` });
  });
  return lamps.length;
}

// ---------------------------------------------------------------------------
// Traffic lights.

const SIGNAL = Object.freeze({ pole: 6.4, headY: 5.55, pedY: 2.9, pedPole: 3.4, cornerOff: .6, pedOff: .13, headsWide: [2.3, 5], headsMid: [2, 4.2], headsNarrow: [1.8] });
const APPROACHES = [
  // Traffic coming from the west (eastbound), from the east, from the north, from the south:
  // the mast stands on the far right corner, its arm over the lanes, the head facing the traffic.
  { name: 'W', group: 0, corner: j => [j.x1 + SIGNAL.cornerOff, j.z1 + SIGNAL.cornerOff], arm: [0, -1], face: -Math.PI / 2 },
  { name: 'E', group: 0, corner: j => [j.x0 - SIGNAL.cornerOff, j.z0 - SIGNAL.cornerOff], arm: [0, 1], face: Math.PI / 2 },
  { name: 'N', group: 1, corner: j => [j.x0 - SIGNAL.cornerOff, j.z1 + SIGNAL.cornerOff], arm: [1, 0], face: Math.PI },
  { name: 'S', group: 1, corner: j => [j.x1 + SIGNAL.cornerOff, j.z0 - SIGNAL.cornerOff], arm: [-1, 0], face: 0 },
];
const JUNCTION_ROADS = { 'boulevard-west': ['boulevard', 'west-street'], 'north-west': ['north-lane', 'west-street'], 'north-avenue': ['north-lane', 'avenue'], 'south-avenue': ['south-street', 'avenue'], 'south-west': ['south-street', 'west-street'] };
const PHASE = { 'boulevard-west': 0, 'north-west': 0, 'north-avenue': 9, 'south-avenue': 21, crossroads: 14 };
const headOffsets = width => width >= 14 ? SIGNAL.headsWide : width >= 10 ? SIGNAL.headsMid : SIGNAL.headsNarrow;

// A mast: the pole at `foot`, its arm along (ax, az), heads on the arm.
function mast(out, foot, arm, heads, { face, group, phase, state, id, emitter = true }) {
  const facingArm = Math.atan2(arm[0], arm[1]), length = Math.max(...heads) + .7;
  emit(out, { kind: 'pole', at: [foot[0], 0, foot[1]], facing: facingArm, height: SIGNAL.pole, arm: length, width: .16, id: `${id}-pole` });
  heads.forEach((d, k) => emit(out, { kind: 'signal', at: [foot[0] + arm[0] * d, SIGNAL.headY, foot[1] + arm[1] * d], facing: face, group, phaseOffset: phase, state: state === 'normal' ? undefined : state, emitter: state === 'dead' ? false : emitter, tilt: 12, id: `${id}-head-${k}` }));
}
// A pedestrian head at a crosswalk's end: on the mast there if one stands
// within a metre, else on a short pole of its own.
function pedHead(out, masts, end, facing, group, phase, state, id) {
  const [ex, ez] = end;
  let host = masts.find(m => Math.hypot(m[0] - ex, m[1] - ez) < 1);
  if (!host) {
    // (a short pole of its own, at the end or the nearest free spot to it: never in a prop or a doorway)
    host = nearestFree(ex, ez, 2.2, { building: R.buildingSide, offRoad: true }) || [ex, ez];
    masts.push(host); emit(out, { kind: 'pole', at: [host[0], 0, host[1]], height: SIGNAL.pedPole, width: .14, id: `${id}-pole` });
  }
  const fx = Math.sin(facing), fz = Math.cos(facing);
  emit(out, { kind: 'ped', at: [host[0] + fx * SIGNAL.pedOff, SIGNAL.pedY, host[1] + fz * SIGNAL.pedOff], facing, tilt: 12, group, phaseOffset: phase, state: state === 'normal' ? undefined : state, emitter: state === 'dead' ? false : true, id });
}
// Both ends of a crosswalk (every one that exists on the junction): the head
// at each end faces the other. `across`: 'x' walks along x, with the
// east-west traffic (group 0); 'z' along z (group 1).
function crosswalkHeads(out, masts, cw, j, phase, state, id) {
  const off = SIGNAL.cornerOff;
  if (cw.across === 'x') {
    const z = cw.z1 <= j.z0 + .01 ? cw.z1 - off : cw.z0 + off;
    pedHead(out, masts, [cw.x0 - off, z], Math.PI / 2, 0, phase, state, `${id}-w`);
    pedHead(out, masts, [cw.x1 + off, z], -Math.PI / 2, 0, phase, state, `${id}-e`);
  } else {
    const x = cw.x1 <= j.x0 + .01 ? cw.x1 - off : cw.x0 + off;
    pedHead(out, masts, [x, cw.z0 - off], 0, 1, phase, state, `${id}-n`);
    pedHead(out, masts, [x, cw.z1 + off], Math.PI, 1, phase, state, `${id}-s`);
  }
}

function signalList(out) {
  const road = id => ROADS.find(r => r.id === id);
  for (const j of getJunctions()) {
    const [ewId, nsId] = JUNCTION_ROADS[j.id], ew = road(ewId), ns = road(nsId), state = j.signals, phase = PHASE[j.id] ?? 0, masts = [];
    const exists = { W: ew.from < j.x0 - .01, E: ew.to > j.x1 + .01, N: ns.from < j.z0 - .01, S: ns.to > j.z1 + .01 };
    for (const a of APPROACHES) {
      if (!exists[a.name]) continue;
      // The dead junction's north-west pole lies fallen across the corner (the prop): no mast there.
      if (state === 'dead' && a.name === 'E') continue;
      const width = a.name === 'W' || a.name === 'E' ? ew.width : ns.width, heads = headOffsets(width);
      const spot = nearestFree(...a.corner(j), 1.2, { building: R.buildingSide }) || a.corner(j);
      masts.push(spot);
      mast(out, spot, a.arm, heads, { face: a.face, group: a.group, phase, state, id: `${j.id}-${a.name}` });
    }
    if (state !== 'dead') j.crosswalks.forEach((cw, k) => crosswalkHeads(out, masts, cw, j, phase, state, `${j.id}-ped${k}`));
  }
  crossroadsSignals(out);
}

// The Crossroads: the most. A gantry over the island (a beam between two
// poles on its planters carries the east-west heads back to back; each pole
// carries the head for the Avenue's traffic), and a mast at each of the five
// mouths, two heads each, and pedestrian heads at the ends of the four arm
// crosswalks.
function crossroadsSignals(out) {
  const C = CROSSROADS, phase = PHASE.crossroads, masts = [];
  const cut = ROADS.find(r => r.axis === 'diagonal'), g = roadGeometry(cut);
  const mouths = [
    { id: 'w', foot: [C.x0 + .6, 8.3], arm: [0, -1], heads: [2.3, 5], face: -Math.PI / 2, group: 0 },
    { id: 'e', foot: [C.x1 - .6, -8.3], arm: [0, 1], heads: [2.3, 5], face: Math.PI / 2, group: 0 },
    { id: 'n', foot: [.4, C.z0 + .6], arm: [1, 0], heads: [2.6, 4.8], face: Math.PI, group: 1 },
    { id: 's', foot: [11.6, C.z1 - .6], arm: [-1, 0], heads: [2.6, 4.7], face: 0, group: 1 },
    // The Cut's traffic comes up from the south-east, heading north-west: the mast on its right, its arm across.
    { id: 'cut', foot: [cut.a[0] + g.ux * 2.5 - g.nx * (cut.width / 2 + R.poleFromKerb), cut.a[1] + g.uz * 2.5 - g.nz * (cut.width / 2 + R.poleFromKerb)], arm: [g.nx, g.nz], heads: [2.4, 4.6], face: Math.atan2(g.ux, g.uz), group: 1 },
  ];
  for (const m of mouths) {
    const spot = nearestFree(m.foot[0], m.foot[1], 1.5, { building: R.buildingSide }) || m.foot;
    masts.push(spot);
    mast(out, spot, m.arm, m.heads, { face: m.face, group: m.group, phase, state: 'normal', id: `crossroads-${m.id}` });
  }
  // The gantry: on the island's planters (.7 m high), x = 6.
  const top = .7, north = [6, -7.45], south = [6, -1.75], beam = Math.hypot(south[0] - north[0], south[1] - north[1]);
  emit(out, { kind: 'pole', at: [north[0], top, north[1]], facing: 0, height: SIGNAL.pole - .4, arm: beam, width: .18, id: 'crossroads-gantry-north' });
  emit(out, { kind: 'pole', at: [south[0], top, south[1]], height: SIGNAL.pole - .4, width: .18, id: 'crossroads-gantry-south' });
  const y = top + SIGNAL.headY - .55;
  for (const dz of [1.6, 4.3]) for (const [dx, face] of [[.26, Math.PI / 2], [-.26, -Math.PI / 2]]) {
    emit(out, { kind: 'signal', at: [6 + dx, y, north[1] + dz], facing: face, group: 0, phaseOffset: phase, tilt: 12, id: `crossroads-gantry-${dz}-${face > 0 ? 'e' : 'w'}` });
  }
  emit(out, { kind: 'signal', at: [6, y, north[1] - .3], facing: Math.PI, group: 1, phaseOffset: phase, tilt: 12, id: 'crossroads-gantry-n' });
  emit(out, { kind: 'signal', at: [6, y, south[1] + .3], facing: 0, group: 1, phaseOffset: phase, tilt: 12, id: 'crossroads-gantry-s' });
  // Pedestrian heads at the ends of the four arm crosswalks (straight across each road where it enters the plaza).
  const off = SIGNAL.cornerOff;
  const arms = [
    { id: 'w', across: 'z', x: C.x0 + off, z0: -7, z1: 7 }, { id: 'e', across: 'z', x: C.x1 - off, z0: -7, z1: 7 },
    { id: 'n', across: 'x', z: C.z0 + off, x0: 1, x1: 11 }, { id: 's', across: 'x', z: C.z1 - off, x0: 1, x1: 11 },
  ];
  for (const a of arms) {
    if (a.across === 'z') {
      pedHead(out, masts, [a.x, a.z0 - off], 0, 1, phase, 'normal', `crossroads-ped-${a.id}-n`);
      pedHead(out, masts, [a.x, a.z1 + off], Math.PI, 1, phase, 'normal', `crossroads-ped-${a.id}-s`);
    } else {
      pedHead(out, masts, [a.x0 - off, a.z], Math.PI / 2, 0, phase, 'normal', `crossroads-ped-${a.id}-w`);
      pedHead(out, masts, [a.x1 + off, a.z], -Math.PI / 2, 0, phase, 'normal', `crossroads-ped-${a.id}-e`);
    }
  }
}

// ---------------------------------------------------------------------------
// Signs on the buildings.

// Neon shapes of our own (plain strokes in the unit box; the builder's own
// names cover hearts, cocktails, bolts, pictograms and glyph words).
const SHAPES = Object.freeze({
  boxWide: { strokes: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], [[.08, .5], [.92, .5]]], aspect: 2.6 },
  boxTall: { strokes: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], [[.5, .08], [.5, .92]]], aspect: .42 },
  underline: { strokes: [[[0, .5], [1, .5]], [[0, .15], [1, .15]]], aspect: 5 },
});
const aspectOf = shape => {
  if (typeof shape === 'string') return shape === 'bar' ? 4 : shape === 'vbar' ? .25 : 1;
  if (shape.glyphs != null) { const n = Array.isArray(shape.glyphs) ? shape.glyphs.length : shape.glyphs, span = n + .2 * (n - 1); return shape.vertical ? 1 / span : span; }
  return shape.aspect ?? 1;
};
const WHITE_COLOURS = new Set(['warmWhite', 'coldWhite', 'sodium', 'roseWhite']);
export const lightClass = p => p.kind === 'lamp' ? 'white' : p.kind === 'screen' ? 'screen' : p.kind === 'neon' ? 'neon' : p.kind === 'panel' ? (WHITE_COLOURS.has(p.colour ?? 'warmWhite') ? 'white' : 'neon') : null;

// The failing tubes (section 12): of the neon whose mode is left to the
// district, one in five flickers, some are half dead, some blink.
const AUTO_MODES = ['steady', 'steady', 'flicker', 'steady', 'blink', 'steady', 'flicker', 'steady', 'dead-segment', 'steady'];

function buildingList(out) {
  const rand = stream(2029);
  let autoMode = 0;
  const counts = new Map();
  const nextId = building => { const n = (counts.get(building) || 0) + 1; counts.set(building, n); return `${building}-${n}`; };
  const areaOf = id => SPEC.get(id)?.district ?? 'edge';
  // Where a wall piece stands and whether a round can break it.
  const spot = (id, face, u, out0 = 0) => { const f = faceOf(id, face, u), w = wallPoint(f, u, R.wall + out0); return { f, ...w }; };
  const breakableAt = (x, z, facing, y, halfHeight, halfWidth, area) => {
    const rx = Math.cos(facing), rz = -Math.sin(facing);
    return y - halfHeight < R.reachable && baseDistance(x, z) >= R.baseClear && doorDistance(x, z, rx, rz, halfWidth) >= R.doorClear;
  };
  const finish = (piece, breakable) => { if (!breakable) piece.breakable = false; return emit(out, piece); };

  // Neon on a wall.
  const neon = (id, face, u, y, shape, { colour = 'pink', size = 1, mode, tilt, poolReach, spark, emitter, standoff = 0, seed, slide = false } = {}) => {
    const width = size * aspectOf(shape), m = mode ?? AUTO_MODES[autoMode++ % AUTO_MODES.length];
    // `slide`: a small tube sign put where a round can reach it: along its wall to the nearest spot that is
    // clear of doorways and bases (and of the pieces already on that stretch), else where it was put.
    if (slide) {
      const f = faceOf(id, face, u), [lo, hi] = coordinateRange(f), hang = R.hang + size / 2 + R.neonMargin;
      for (const off of [0, .7, -.7, 1.4, -1.4, 2.1, -2.1, 2.8, -2.8, 3.5, -3.5]) {
        const v = u + off; if (v < lo + width / 2 + .3 || v > hi - width / 2 - .3) continue;
        const q = wallPoint(f, v, R.wall + standoff);
        if (!breakableAt(q.x, q.z, q.facing, hang, size / 2 + R.neonMargin, width / 2 + .15)) continue;
        if (out.some(o => o.buildingId === id && o.kind !== 'pole' && Math.hypot(o.at[0] - q.x, o.at[2] - q.z) < width / 2 + (o.w ?? o.size ?? 1) / 2 + .3 && Math.abs(o.at[1] - hang) < size / 2 + (o.h ?? o.size ?? 1) / 2 + .2)) continue;
        u = v; y = hang; break;
      }
    }
    const w = spot(id, face, u, standoff);
    const vertical = shape.vertical, lean = tilt ?? (vertical || size > 3 ? 8 : 25);
    // A small tube sign hangs low, where a round can find it (design 9: they spark, pop and go dark)
    // unless a doorway or a base forbids that: then it stays where it was put.
    const hang = R.hang + size / 2 + R.neonMargin;
    if (size <= 1.2 && y > hang && breakableAt(w.x, w.z, w.facing, hang, size / 2 + R.neonMargin, width / 2 + .15)) y = hang;
    return finish({ kind: 'neon', id: nextId(id), area: areaOf(id), buildingId: id, shape, at: [w.x, y, w.z], facing: w.facing, size, colour, mode: m === 'steady' ? undefined : m, tilt: lean, seed: seed ?? rand(),
      poolReach, spark, emitter: emitter ?? (size >= .9 ? undefined : false) }, breakableAt(w.x, w.z, w.facing, y, size / 2 + R.neonMargin, width / 2 + .15));
  };
  // A blade sign: a neon standing out from the wall at right angles to it, seen along the street.
  const blade = (id, face, u, y, shape, { colour = 'lemon', size = 1, mode, side = 1, seed } = {}) => {
    const w = spot(id, face, u), width = size * aspectOf(shape), facing = w.facing + side * Math.PI / 2, m = mode ?? AUTO_MODES[autoMode++ % AUTO_MODES.length];
    const nx = w.f.n[0], nz = w.f.n[1], reach = width / 2 + .12;
    const at = [w.x + nx * reach, y, w.z + nz * reach];
    return finish({ kind: 'neon', id: nextId(id), area: areaOf(id), buildingId: id, shape, at, facing, size, colour, mode: m === 'steady' ? undefined : m, tilt: 0, mount: 'free', seed: seed ?? rand(), emitter: size >= .9 ? undefined : false },
      breakableAt(at[0], at[2], facing, y, size / 2 + R.neonMargin, width / 2 + .15));
  };
  // A lit panel (a door strip, a window slit, a bulb). Never breakable (CitySigns addPanel has no break slot).
  const panel = (id, face, u, y, w, h, { colour = 'warmWhite', mode, tilt = 0, standoff = 0 } = {}) => {
    const p = spot(id, face, u, standoff);
    return finish({ kind: 'panel', id: nextId(id), area: areaOf(id), buildingId: id, at: [p.x, y, p.z], facing: p.facing, w, h, colour: colour === 'warmWhite' ? undefined : colour, mode, tilt: tilt || undefined, seed: rand() }, false);
  };
  // A screen on a wall.
  const screen = (id, face, u, y, w, h, { mode = 'picto', palette, tilt, seed, standoff = 0, breakable: allow = true } = {}) => {
    const p = spot(id, face, u, standoff);
    return finish({ kind: 'screen', id: nextId(id), area: areaOf(id), buildingId: id, at: [p.x, y, p.z], facing: p.facing, w, h, mode, palette, tilt: tilt ?? (h > 2.5 ? 15 : 12), seed: seed ?? rand(),
      emitter: w * h >= 1.8 ? undefined : false }, allow && breakableAt(p.x, p.z, p.facing, y, h / 2 + R.bezel, w / 2 + R.bezel + .1));
  };
  // A board standing on a roof, on two legs. facing: where it looks.
  const roofBoard = (id, x, z, w, h, facing, { mode = 'picto', palette, lift = 1.4, seed } = {}) => {
    const roof = SPEC.get(id).height, y = roof + lift + h / 2, rx = Math.cos(facing), rz = -Math.sin(facing);
    for (const s of [-1, 1]) emit(out, { kind: 'pole', id: nextId(id), buildingId: id, at: [x + rx * s * (w / 2 - .5), roof, z + rz * s * (w / 2 - .5)], height: lift + .3, width: .14 });
    return emit(out, { kind: 'screen', id: nextId(id), area: areaOf(id), buildingId: id, at: [x, y, z], facing, w, h, mode, palette, tilt: 14, mount: 'free', seed: seed ?? rand(), breakable: false });
  };
  // A neon standing on a roof, on two legs (the club's heart).
  const roofNeon = (id, x, z, shape, { colour = 'pink', size = 3, mode, facing = 0, lift = 1.2, poolReach, seed } = {}) => {
    const roof = SPEC.get(id).height, width = size * aspectOf(shape), rx = Math.cos(facing), rz = -Math.sin(facing);
    for (const s of [-1, 1]) emit(out, { kind: 'pole', id: nextId(id), buildingId: id, at: [x + rx * s * width * .22, roof, z + rz * s * width * .22], height: lift + .4, width: .14 });
    return emit(out, { kind: 'neon', id: nextId(id), area: areaOf(id), buildingId: id, shape, at: [x, roof + lift + size / 2, z], facing, size, colour, mode: mode === 'steady' ? undefined : mode, tilt: 10, mount: 'free', poolReach, seed: seed ?? rand(), breakable: false });
  };
  // -- Stacks (sick green, dim warm bulbs; small tube signs, a taped pictogram, one magenta ad)
  neon('tenement-b', 'S', -46, 2.3, 'bowl', { colour: 'sickGreen', size: .9, mode: 'flicker' });
  neon('tenement-b', 'E', -11.6, 6.6, { glyphs: 4, vertical: true, seed: .3 }, { colour: 'sickGreen', size: 4.2, mode: 'steady' });
  screen('tenement-b', 'S', -52, 5.4, 2, 1.4, { mode: 'picto', palette: ['pink', 'screenBlack'] });
  neon('tenement-a', 'E', -48, 3.2, 'eye', { colour: 'sickGreen', size: 1, mode: 'flicker' });
  neon('tenement-a', 'E', -54.6, 2.7, { glyphs: 3, seed: .61 }, { colour: 'sodium', size: .5, mode: 'dead-segment' });
  neon('stacks-main', 'E', -25, 3, 'hand', { colour: 'lemon', size: .8, mode: 'steady' });
  neon('stacks-main', 'E', -31.4, 3.4, 'bar', { colour: 'sickGreen', size: .4, mode: 'flicker' });
  for (const [face, u, y] of [['S', -46.5, 6.2], ['S', -42, 6.2], ['N', -44, 6.2], ['N', -48, 6.4]]) panel('stacks-main', face, u, y, 1.1, .22, { colour: 'sodium' });
  panel('tenement-a', 'E', -46, 8.2, 1.2, .22); panel('tenement-a', 'E', -53.5, 11.4, 1.2, .22);
  panel('tenement-b', 'S', -55, 7.4, 1.4, .22); panel('tenement-b', 'S', -49, 10.6, 1.4, .22);

  // -- Night Market (warm white bulbs, red lanterns; hand-painted boards)
  for (const u of [-20, -14.3, -9]) neon('market-hall', 'S', u, 3.7, 'ring', { colour: 'coral', size: .55, mode: 'steady', emitter: false });
  neon('market-hall', 'S', -16.9, 2.2, 'bowl', { colour: 'sodium', size: .9, mode: 'steady' });
  neon('market-hall', 'S', -4.6, 3, 'can', { colour: 'warmWhite', size: 1, mode: 'flicker' });
  for (let u = -23; u <= -3; u += 4) panel('market-hall', 'S', u, 4.5, .32, .32, { colour: 'warmWhite' });
  screen('market-hall', 'S', -4.4, 1.9, 1.5, 1, { mode: 'picto', palette: ['warmWhite', 'screenBlack'] });
  roofBoard('market-hall', -12, -46.4, 6, 2.6, 0, { mode: 'wipe', palette: ['warmWhite', 'coral'] });
  neon('stall-shed', 'N', -16, 2.4, 'can', { colour: 'sodium', size: .9 });
  // The stalls on North Lane: a warm bulb over each canvas back.
  for (const p of LUMEN_PROPS) if (p.type === 'cityStall') emit(out, { kind: 'panel', id: nextId('stalls'), area: 'night-market', at: [p.x, 2.1, p.z - .78], facing: Math.PI, w: 1.2, h: .14, mount: 'free', seed: rand(), breakable: false });
  neon('lock-up', 'N', -7, 2.4, 'ring', { colour: 'warmWhite', size: .9, mode: 'steady' });
  panel('stall-shed', 'N', -18.5, 3.1, 1, .14); panel('lock-up', 'N', -4, 3.1, 1, .14);

  // -- The Boulevard's north frontage (pink and warm white; boxes, corner neon, wall screens)
  neon('convenience', 'S', -21, 3.9, SHAPES.boxWide, { colour: 'pink', size: .8, mode: 'steady' });
  blade('convenience', 'S', -18.45, 3.7, 'bolt', { colour: 'lemon', size: 1.1, mode: 'flicker', side: 1 });
  screen('convenience', 'W', -19, 1.9, 1.1, 1.5, { mode: 'picto', palette: ['lemon', 'screenBlack'] });
  screen('convenience', 'S', -22.6, 1.8, .9, 1.2, { mode: 'loading', palette: ['pink', 'warmWhite'], tilt: 8 });
  panel('convenience', 'N', -22.3, 2.85, 1.2, .12, { colour: 'coldWhite', mode: 'flicker' });
  roofBoard('convenience', -21, -12.4, 3.4, 1.5, 0, { mode: 'wipe', palette: ['pink', 'warmWhite'] });

  neon('noodle-bar', 'S', -16.8, 3.5, 'bowl', { colour: 'warmWhite', size: 1.2, mode: 'steady' });
  neon('noodle-bar', 'S', -17.4, 8, { glyphs: 4, vertical: true, seed: .52 }, { colour: 'pink', size: 4.6, mode: 'flicker' });
  screen('noodle-bar', 'S', -13.4, 9, 1.5, 6, { mode: 'picto', palette: ['pink', 'screenBlack'], tilt: 8 });
  neon('noodle-bar', 'N', -17, 3.3, 'bar', { colour: 'green', size: .35, mode: 'flicker' });
  panel('noodle-bar', 'N', -15.3, 2.85, 1.2, .12, { colour: 'coldWhite', mode: 'flicker' });

  // The Crossroads' corners face the plaza: lemon and electric blue lead.
  neon('pawn', 'SE', .9, 3.5, 'ring', { colour: 'blue', size: 1.1, mode: 'steady' });
  neon('pawn', 'SE', 4.2, 3.4, 'bolt', { colour: 'lemon', size: 1.1 });
  screen('pawn', 'SE', .7, 1.8, .9, 1.3, { mode: 'glitch', palette: ['lemon', 'blue'], tilt: 8 });
  roofBoard('pawn', -9.3, -14.6, 4.2, 2, Math.atan2(...faceOf('pawn', 'SE').n), { mode: 'frozen', palette: ['lemon', 'uptownBlue'] });
  neon('arcade', 'SE', 1.6, 4.4, 'sparkle', { colour: 'blue', size: 1.3, mode: 'flicker' });
  neon('arcade', 'SE', 5.5, 3.6, 'chevrons', { colour: 'lemon', size: 1 });
  neon('arcade', 'E', -19.9, 7.4, { glyphs: 3, vertical: true, seed: .27 }, { colour: 'blue', size: 4.4 });
  screen('arcade', 'SE', 3.4, 8.6, 4.5, 2.2, { mode: 'picto', palette: ['lemon', 'uptownBlue'], tilt: 18 });
  screen('arcade', 'SE', 6.35, 1.8, .9, 1.2, { mode: 'loading', palette: ['blue', 'lemon'], tilt: 8 });
  panel('arcade', 'N', -5, 2.85, 1.2, .12, { colour: 'coldWhite' });

  // -- The Boulevard's south frontage
  neon('laundromat', 'E', 13.6, 3.7, 'ring', { colour: 'coldWhite', size: 1.1, mode: 'flicker', spark: 40 });
  neon('laundromat', 'N', -17.6, 2.3, 'bar', { colour: 'pink', size: .3, mode: 'steady' });
  screen('laundromat', 'N', -17.7, 1.8, 1, 1.4, { mode: 'cracked', palette: ['pink', 'warmWhite'], tilt: 8 });
  screen('laundromat', 'W', 14.4, 1.7, 1, 1.4, { mode: 'glyphs', palette: ['coldWhite', 'blue'], tilt: 8 });
  neon('clinic', 'S', -17, 3.7, 'cross', { colour: 'coldWhite', size: 1.6, mode: 'steady' });
  panel('clinic', 'S', -21, 2.85, 1.3, .14, { colour: 'red' });
  neon('clinic', 'W', 18.6, 2, 'biohazard', { colour: 'lemon', size: .6, mode: 'steady' });
  panel('clinic', 'S', -15, 3.4, 1.4, .18, { colour: 'coldWhite' });

  screen('pharmacy', 'NE', 6.6, 8.3, 4.8, 2, { mode: 'picto', palette: ['lemon', 'blue'], tilt: 18 });
  screen('pharmacy', 'NE', 6.6, 11.1, 3.8, 1.4, { mode: 'wipe', palette: ['coldWhite', 'uptownBlue'], tilt: 18 });
  neon('pharmacy', 'NE', 6.6, 4.6, 'cross', { colour: 'green', size: 1.5, mode: 'steady' });
  neon('pharmacy', 'E', 21, 3.4, 'pill', { colour: 'coldWhite', size: 1, mode: 'flicker' });
  screen('pharmacy', 'E', 22.6, 1.8, .9, 1.3, { mode: 'picto', palette: ['green', 'screenBlack'], tilt: 8 });
  neon('pharmacy', 'E', 19.8, 8, { glyphs: 3, vertical: true, seed: .81 }, { colour: 'coldWhite', size: 4, mode: 'steady' });

  // -- Garage and Charging (sodium and lemon; lit pictogram boards, hazards)
  roofBoard('ev-garage', -55.5, 12.4, 5, 2.2, Math.PI, { mode: 'warning', palette: ['lemon', 'sodium'] });
  neon('ev-garage', 'N', -58.1, 3.9, 'car', { colour: 'lemon', size: 1.3, mode: 'steady' });
  neon('ev-garage', 'N', -52.4, 3.7, 'bolt', { colour: 'green', size: 1, mode: 'flicker' });
  neon('fab-workshop', 'N', -45.2, 3.2, 'bulb', { colour: 'sodium', size: 1, mode: 'flicker' });
  neon('fab-workshop', 'S', -48.5, 3.4, 'sparkle', { colour: 'lemon', size: 1, mode: 'steady' });
  screen('fab-workshop', 'N', -50.2, 1.9, .9, 1.2, { mode: 'loading', palette: ['sodium', 'lemon'], tilt: 8 });
  neon('parking', 'N', -41.5, 3, 'car', { colour: 'lemon', size: .9, mode: 'steady' });
  neon('parking', 'N', -36.7, 3, 'chevrons', { colour: 'sodium', size: .8, mode: 'blink' });
  screen('parking', 'N', -43.2, 1.7, .8, 1.1, { mode: 'loading', palette: ['lemon', 'sodium'], tilt: 8 });
  neon('charging-office', 'W', 50.8, 3, 'bolt', { colour: 'green', size: 1.2, mode: 'steady' });
  neon('charging-office', 'E', 49.6, 3.2, 'bolt', { colour: 'green', size: 1.6, mode: 'blink' });
  neon('charging-office', 'N', -6, 3, 'ring', { colour: 'lemon', size: .8, mode: 'steady' });
  screen('charging-office', 'W', 45.7, 1.8, .9, 1.2, { mode: 'loading', palette: ['green', 'lemon'], tilt: 8 });
  screen('charging-office', 'E', 45.7, 1.8, .9, 1.2, { mode: 'picto', palette: ['green', 'screenBlack'], tilt: 8 });
  panel('charging-office', 'N', -8.5, 3.2, 1.4, .16, { colour: 'coldWhite' }); panel('charging-office', 'N', -3.5, 3.2, 1.4, .16, { colour: 'coldWhite' });

  // -- Velvet Row (deep red and pink; curved neon, hearts, lips, a bulb marquee; pulsing, never strobing)
  roofNeon('club', -55, 38.5, 'heart', { colour: 'pink', size: 3.2, mode: 'pulse', facing: Math.PI, poolReach: 2.4 });
  neon('club', 'N', -58.5, 4.4, 'lips', { colour: 'rose', size: 1.4, mode: 'pulse', poolReach: 2 });
  neon('club', 'N', -48.5, 4.4, 'cocktail', { colour: 'pink', size: 1.3, mode: 'pulse', poolReach: 2 });
  neon('club', 'E', 40.5, 3.7, 'heart', { colour: 'velvetRed', size: 1, mode: 'pulse', poolReach: 1.6 });
  neon('club', 'N', -45, 6.4, 'moon', { colour: 'roseWhite', size: 1.2, mode: 'steady', poolReach: 2 });
  for (const u of [-55.6, -54.3, -53, -51.7, -50.4]) panel('club', 'N', u, 3.7, .3, .3, { colour: 'roseWhite' });
  screen('club', 'N', -49, 1.9, 1, 1.5, { mode: 'wipe', palette: ['rose', 'velvetRed'], tilt: 8 });
  neon('bar', 'N', -38, 3.3, 'cocktail', { colour: 'rose', size: 1.1, mode: 'flicker', poolReach: 2 });
  neon('bar', 'N', -34.2, 3.3, 'moon', { colour: 'roseWhite', size: .9, mode: 'pulse', poolReach: 2 });
  neon('bar', 'W', 39.4, 3.2, 'bottle', { colour: 'velvetRed', size: 1, mode: 'pulse', poolReach: 1.6 });
  screen('bar', 'N', -33.2, 1.8, .9, 1.3, { mode: 'picto', palette: ['rose', 'screenBlack'], tilt: 8 });
  neon('capsule-hotel', 'N', -30.8, 7.6, { glyphs: 5, vertical: true, seed: .66 }, { colour: 'roseWhite', size: 5.4, mode: 'steady', poolReach: 2 });
  neon('capsule-hotel', 'N', -26.4, 4.4, 'moon', { colour: 'rose', size: 1.3, mode: 'pulse', poolReach: 2 });
  screen('capsule-hotel', 'E', 40.5, 1.9, .9, 1.3, { mode: 'loading', palette: ['rose', 'roseWhite'], tilt: 8 });
  neon('karaoke', 'N', -38, 3.3, 'note', { colour: 'rose', size: 1.3, mode: 'pulse', poolReach: 2 });
  neon('karaoke', 'N', -33.6, 3.3, 'note', { colour: 'pink', size: 1, mode: 'pulse', poolReach: 2 });
  neon('karaoke', 'E', 54, 3.2, 'note', { colour: 'velvetRed', size: 1, mode: 'flicker', poolReach: 1.6 });
  screen('karaoke', 'N', -31, 1.8, 1, 1.4, { mode: 'glyphs', palette: ['pink', 'roseWhite'], tilt: 8 });
  roofBoard('karaoke', -34, 52.6, 3.6, 1.6, Math.PI, { mode: 'wipe', palette: ['rose', 'velvetRed'] });

  // -- Uptown (cold white and electric blue; thin light lines, a few clean glyph logos)
  neon('hotel', 'W', -36, 9, 'vbar', { colour: 'uptownBlue', size: 6, mode: 'steady' });
  neon('hotel', 'W', -46, 9, 'vbar', { colour: 'uptownBlue', size: 6, mode: 'steady' });
  neon('hotel', 'W', -31, 4.7, { glyphs: 2, seed: .14 }, { colour: 'coldWhite', size: .9, mode: 'steady' });
  screen('hotel', 'W', -35.3, 1.9, 1, 1.6, { mode: 'glyphs', palette: ['coldWhite', 'uptownBlue'], tilt: 8 });
  neon('showroom', 'SW', 2.6, 4, 'frame', { colour: 'coldWhite', size: 1.3, mode: 'steady' });
  neon('showroom', 'SW', 8.8, 4, 'eye', { colour: 'uptownBlue', size: 1.2, mode: 'steady' });
  neon('showroom', 'SW', 5.9, 4.7, 'sparkle', { colour: 'lime', size: .9, mode: 'steady' });
  screen('showroom', 'SW', 2.2, 1.9, 1, 1.5, { mode: 'picto', palette: ['coldWhite', 'uptownBlue'], tilt: 8 });
  screen('showroom', 'SW', 9.8, 1.9, 1, 1.5, { mode: 'wipe', palette: ['coldWhite', 'blue'], tilt: 8 });
  neon('luxury-tower', 'S', 26.2, 8, 'vbar', { colour: 'uptownBlue', size: 7 });
  neon('luxury-tower', 'S', 36.6, 8, 'vbar', { colour: 'uptownBlue', size: 7 });
  neon('luxury-tower', 'S', 31, 4.7, { glyphs: 3, seed: .33 }, { colour: 'coldWhite', size: .8, mode: 'steady' });
  screen('luxury-tower', 'S', 31.4, 10.5, 6, 3.4, { mode: 'picto', palette: ['coldWhite', 'uptownBlue'], tilt: 16 });
  neon('luxury-tower', 'E', -22, 5.6, { glyphs: 2, seed: .71 }, { colour: 'coldWhite', size: 1.2, mode: 'steady' });
  neon('luxury-tower', 'E', -26, 9, 'vbar', { colour: 'uptownBlue', size: 6 });
  neon('corporate-tower', 'S', 46, 5.4, { glyphs: 3, seed: .4 }, { colour: 'coldWhite', size: 1.4, mode: 'steady' });
  neon('corporate-tower', 'S', 40, 9, 'vbar', { colour: 'uptownBlue', size: 6 });
  neon('corporate-tower', 'S', 54, 9, 'vbar', { colour: 'uptownBlue', size: 6 });
  screen('corporate-tower', 'S', 46, 11.5, 6, 3.2, { mode: 'wipe', palette: ['uptownBlue', 'coldWhite'], tilt: 16 });
  screen('corporate-tower', 'S', 44.6, 1.9, 1.1, 1.6, { mode: 'glyphs', palette: ['coldWhite', 'uptownBlue'], tilt: 8 });
  neon('checkpoint-booth', 'E', -47.7, 2.3, 'warning', { colour: 'lemon', size: .8, mode: 'steady' });
  panel('checkpoint-booth', 'W', -47.7, 1.7, 1.2, .5, { colour: 'coldWhite', mode: 'flicker' });

  // -- Flatiron and the Metro Plaza (lemon and electric blue; the biggest screen, transit pictograms)
  screen('flatiron', 'NW', 2.5, 11.4, 4.6, 7, { mode: 'centrepiece', palette: ['lemon', 'blue'], tilt: 18, seed: .05 });
  neon('flatiron', 'N', 36.5, 7.6, { glyphs: 5, vertical: true, seed: .18 }, { colour: 'lemon', size: 5, mode: 'steady' });
  neon('flatiron', 'N', 39.2, 4.3, 'bolt', { colour: 'blue', size: 1.4, mode: 'blink' });
  screen('flatiron', 'N', 38.6, 1.9, 1, 1.4, { mode: 'loading', palette: ['lemon', 'blue'], tilt: 8 });
  screen('flatiron', 'N', 40.3, 1.9, 1, 1.4, { mode: 'glitch', palette: ['lemon', 'blue'], tilt: 8 });
  neon('flatiron', 'SW', 6.6, 3.6, 'chevrons', { colour: 'lemon', size: 1.4, mode: 'steady' });
  neon('flatiron', 'SW', 13.6, 4, 'bolt', { colour: 'blue', size: 1.1, mode: 'flicker' });
  screen('flatiron', 'SW', 4.6, 1.9, 1, 1.4, { mode: 'frozen', palette: ['lemon', 'blue'], tilt: 8 });
  screen('pachinko', 'N', 52.6, 9.6, 6.6, 3.4, { mode: 'wipe', palette: ['lemon', 'uptownBlue'], tilt: 16 });
  neon('pachinko', 'N', 54.6, 4.4, 'sparkle', { colour: 'lemon', size: 1.6, mode: 'flicker' });
  neon('pachinko', 'N', 45.9, 4.1, 'ring', { colour: 'lemon', size: 1, mode: 'blink' });
  neon('pachinko', 'N', 58.6, 7.6, { glyphs: 4, vertical: true, seed: .44 }, { colour: 'lemon', size: 4.6, mode: 'steady' });
  neon('pachinko', 'SE', 4.3, 3.8, 'sparkle', { colour: 'blue', size: 1.2, mode: 'steady' });
  neon('pachinko', 'SW', 7, 3.6, 'bolt', { colour: 'lemon', size: 1.1, mode: 'dead-segment' });
  screen('pachinko', 'N', 53.3, 1.9, 1, 1.4, { mode: 'frozen', palette: ['lemon', 'red'], tilt: 8 });
  screen('pachinko', 'SW', 4, 1.9, 1, 1.4, { mode: 'picto', palette: ['lemon', 'blue'], tilt: 8 });
  screen('body-mod', 'W', 38, 9.6, 1.6, 6.4, { mode: 'picto', palette: ['coldWhite', 'blue'], tilt: 8 });
  neon('body-mod', 'E', 38, 4, 'eye', { colour: 'lemon', size: 1.3, mode: 'steady' });
  neon('body-mod', 'W', 33, 4.7, 'sparkle', { colour: 'blue', size: 1, mode: 'flicker' });
  neon('body-mod', 'N', 18, 3.6, 'pill', { colour: 'lemon', size: 1, mode: 'steady' });
  screen('body-mod', 'E', 36, 1.9, 1, 1.4, { mode: 'wipe', palette: ['lemon', 'blue'], tilt: 8 });
  screen('body-mod', 'W', 36, 1.9, 1, 1.4, { mode: 'glyphs', palette: ['blue', 'coldWhite'], tilt: 8 });
  screen('metro-entrance', 'N', 25.6, 1.9, 1, 1.4, { mode: 'warning', palette: ['lemon', 'screenBlack'], seed: .7, tilt: 8 });
  screen('metro-entrance', 'N', 31.6, 1.9, 1, 1.4, { mode: 'warning', palette: ['lemon', 'screenBlack'], seed: .2, tilt: 8 });
  screen('metro-entrance', 'W', 49.6, 1.9, 1, 1.4, { mode: 'warning', palette: ['lemon', 'screenBlack'], seed: .7, tilt: 8 });
  neon('metro-entrance', 'N', 28.5, 3.4, 'chevrons', { colour: 'coldWhite', size: 1.2, mode: 'steady' });
  neon('metro-entrance', 'S', 28.5, 3, 'walk', { colour: 'coldWhite', size: .9, mode: 'steady' });
  for (const u of [26, 29, 32]) panel('metro-entrance', 'N', u, 3.3, 1.4, .16, { colour: 'coldWhite' });

  // -- Small tube signs, so that the tubes make up a third of the light (steady, a few failing), slid along
  // their walls to where a round can reach them.
  const tube = (id, face, u, y, shape, o) => neon(id, face, u, y, shape, { ...o, slide: true });
  tube('convenience', 'W', -14, 3.2, 'can', { colour: 'coral', size: .8, mode: 'steady' });
  tube('pawn', 'W', -13, 3.2, 'ring', { colour: 'pink', size: .8, mode: 'steady' });
  tube('arcade', 'N', -3.4, 3.2, 'chevrons', { colour: 'blue', size: .8, mode: 'dead-segment' });
  tube('laundromat', 'E', 11.4, 3.2, 'sparkle', { colour: 'coldWhite', size: .8, mode: 'steady' });
  tube('pharmacy', 'NE', 10.4, 3.2, 'cross', { colour: 'green', size: .8, mode: 'steady' });
  tube('tenement-b', 'S', -41, 3.2, 'pill', { colour: 'sickGreen', size: .8, mode: 'steady' });
  tube('stacks-main', 'S', -44, 3.2, 'moon', { colour: 'lemon', size: .8, mode: 'steady' });
  tube('market-hall', 'S', -11.6, 3.2, 'ring', { colour: 'coral', size: .8, mode: 'steady' });
  tube('market-hall', 'W', -48, 3.2, 'ring', { colour: 'coral', size: .8, mode: 'steady' });
  tube('stall-shed', 'W', -27.8, 3.2, 'bowl', { colour: 'sodium', size: .8, mode: 'steady' });
  tube('hotel', 'W', -40, 3.2, { glyphs: 2, seed: .52 }, { colour: 'uptownBlue', size: .6, mode: 'steady' });
  tube('showroom', 'SW', 6.2, 3.2, 'bar', { colour: 'coldWhite', size: .5, mode: 'steady' });
  tube('luxury-tower', 'S', 33, 3.2, 'frame', { colour: 'coldWhite', size: .8, mode: 'steady' });
  tube('corporate-tower', 'S', 50, 3.2, 'eye', { colour: 'uptownBlue', size: .8, mode: 'steady' });
  tube('metro-entrance', 'W', 46, 3.2, 'walk', { colour: 'coldWhite', size: .8, mode: 'steady' });
  tube('flatiron', 'NW', 2.5, 4.6, 'ring', { colour: 'lemon', size: .8, mode: 'steady' });
  tube('body-mod', 'N', 22, 3.2, 'eye', { colour: 'blue', size: .8, mode: 'steady' });
  tube('club', 'N', -52, 3.2, 'heart', { colour: 'pink', size: .8, mode: 'pulse', poolReach: 1.6 });
  tube('karaoke', 'E', 53, 3.2, 'note', { colour: 'rose', size: .8, mode: 'pulse', poolReach: 1.6 });
  tube('fab-workshop', 'N', -47.5, 3.2, 'bolt', { colour: 'lemon', size: .8, mode: 'steady' });
  tube('charging-office', 'S', -6, 3.2, 'bolt', { colour: 'green', size: .8, mode: 'steady' });
  tube('ev-garage', 'S', -55, 3.2, 'car', { colour: 'sodium', size: .8, mode: 'steady' });

  // -- The bus: its destination board
  screen('bus', 'W', 1.3, 2.5, 1.6, .5, { mode: 'glyphs', palette: ['lemon', 'screenBlack'], tilt: 0 });

  // -- The street's own furniture: the island's screen, the pillar, the kiosk, the screen walls, the shelters.
  const prop = type => LUMEN_PROPS.filter(p => p.type === type);
  const screenAt = (x, y, z, facing, w, h, o, id, area) => {
    const bottomOk = breakableAt(x, z, facing, y, h / 2 + R.bezel, w / 2 + R.bezel + .1);
    return finish({ kind: 'screen', id, area, at: [x, y, z], facing, w, h, mode: o.mode, palette: o.palette, tilt: o.tilt ?? 10, seed: o.seed ?? rand(), emitter: w * h >= 1.8 ? undefined : false }, bottomOk);
  };
  {
    // The island's screen (3.6 x .4 m slab standing north-south at (6, -4.6)): one face east, one west, a shade toed in.
    const island = prop('cityIslandScreen')[0];
    screenAt(island.x + .24, 1.65, island.z, Math.PI / 2, 3, 1.7, { mode: 'wipe', palette: ['lemon', 'blue'], tilt: 8, seed: .31 }, 'island-e', 'crossroads');
    screenAt(island.x - .24, 1.65, island.z, -Math.PI / 2, 3, 1.7, { mode: 'picto', palette: ['coldWhite', 'blue'], tilt: 8, seed: .58 }, 'island-w', 'crossroads');
  }
  for (const p of prop('cityAdPillar')) {
    screenAt(p.x, 1.7, p.z - .64, Math.PI, .9, 1.7, { mode: 'picto', palette: ['lemon', 'blue'], tilt: 6 }, 'pillar-n', 'metro');
    screenAt(p.x, 1.7, p.z + .64, 0, .9, 1.7, { mode: 'frozen', palette: ['blue', 'lemon'], tilt: 6 }, 'pillar-s', 'metro');
  }
  for (const p of prop('cityKiosk')) {
    screenAt(p.x, 1.7, p.z - 1.24, Math.PI, 1.6, 1.1, { mode: 'glitch', palette: ['pink', 'warmWhite'], tilt: 6 }, 'kiosk-n', 'garage');
    screenAt(p.x, 1.7, p.z + 1.24, 0, 1.6, 1.1, { mode: 'picto', palette: ['sodium', 'screenBlack'], tilt: 6 }, 'kiosk-s', 'garage');
  }
  prop('cityScreenWall').forEach((p, k) => {
    // (both stand with their long side north-south: the faces look east and west)
    if (p.x > 0) {
      screenAt(p.x - .24, 1.9, p.z, -Math.PI / 2, 4.6, 2.2, { mode: 'picto', palette: ['lemon', 'blue'], tilt: 10, seed: .46 }, `wall-${k}-w`, 'flatiron');
      screenAt(p.x + .24, 1.9, p.z, Math.PI / 2, 3.6, 1.6, { mode: 'wipe', palette: ['blue', 'lemon'], tilt: 10, seed: .77 }, `wall-${k}-e`, 'flatiron');
    } else {
      screenAt(p.x + .24, 1.8, p.z, Math.PI / 2, 3.2, 1.6, { mode: 'glitch', palette: ['lemon', 'blue'], tilt: 10 }, `wall-${k}-e`, 'velvet-row');
      screenAt(p.x - .24, 1.8, p.z, -Math.PI / 2, 3.2, 1.6, { mode: 'frozen', palette: ['blue', 'lemon'], tilt: 10 }, `wall-${k}-w`, 'velvet-row');
    }
  });
  // The bus shelters: an ad on the back glass, outside face.
  for (const p of prop('cityShelter')) {
    if (p.x < 0) continue; // (North Lane's stands 2 m from the market hall: no ad there)
    const a = p.angle || 0, ox = -Math.sin(a) * .8, oz = -Math.cos(a) * .8, facing = a + Math.PI;
    screenAt(p.x + ox, 1.45, p.z + oz, facing, 1.6, 1.1, { mode: 'picto', palette: ['lemon', 'blue'], tilt: 6 }, `shelter-${p.x}`, 'boulevard');
  }

  // -- Door strips and window slits: the plain white and utility light.
  const streetDistance = (x, z) => {
    const C = CROSSROADS;
    if (x > C.x0 && x < C.x1 && z > C.z0 && z < C.z1) return 0;
    return Math.min(...ROADS.map(r => polyDistance(x, z, roadGeometry(r).road)));
  };
  const NO_STRIP = new Set(['bus', 'tenement-a', 'tenement-b', 'checkpoint-booth', 'lock-up', 'stall-shed']); // (dim, or nothing to light)
  const stripColour = { velvet: 'roseWhite', 'velvet-row': 'roseWhite', garage: 'sodium', charging: 'sodium', 'south-frontage': 'coldWhite', uptown: 'coldWhite', metro: 'coldWhite', flatiron: 'coldWhite' };
  const panels = out.filter(p => p.kind === 'panel');
  const stripped = new Map();
  for (const d of getDoors().slice().sort((a, b) => b.width - a.width)) {
    const outside = [d.x + d.nx * 2.5, d.z + d.nz * 2.5];
    if (NO_STRIP.has(d.id) || streetDistance(outside[0], outside[1]) > 4.5 || (stripped.get(d.id) || 0) >= 2) continue;
    stripped.set(d.id, (stripped.get(d.id) || 0) + 1);
    if (panels.some(p => Math.hypot(p.at[0] - d.x, p.at[2] - d.z) < 1.4 && p.at[1] > 2.5 && p.at[1] < 3.6)) continue; // (a hand-placed strip is there)
    const area = SPEC.get(d.id).district, wallOut = R.wall;
    const facing = Math.atan2(d.nx, d.nz), x = d.x + d.nx * wallOut, z = d.z + d.nz * wallOut, w = Math.min(d.width + .5, 2);
    finish({ kind: 'panel', id: nextId(d.id), area, buildingId: d.id, at: [x, 2.85, z], facing, w, h: .12, colour: stripColour[area], seed: rand() }, false);
  }
  // A couple of lit slits on the tall buildings' street faces, at seeded spots between the doors.
  for (const spec of SPECS) {
    if (!spec.tall) continue;
    const faces = (getFaces().get(spec.id) || []).filter(f => f.len >= 5 && streetDistance(f.a[0] + f.dir[0] * f.len / 2 + f.n[0] * 4, f.a[1] + f.dir[1] * f.len / 2 + f.n[1] * 4) < 6);
    if (!faces.length) continue;
    const colour = spec.district === 'stacks' ? 'sodium' : ['uptown', 'flatiron', 'metro', 'south-frontage'].includes(spec.district) ? 'coldWhite' : spec.district === 'velvet-row' ? 'roseWhite' : 'warmWhite';
    for (let k = 0; k < 2; k++) {
      const f = faces[Math.floor(rand() * faces.length)], t = 1 + rand() * (f.len - 2), y = 5.6 + Math.floor(rand() * 5) * 2.8, x = f.a[0] + f.dir[0] * t + f.n[0] * R.wall, z = f.a[1] + f.dir[1] * t + f.n[1] * R.wall;
      if (out.some(p => p.buildingId === spec.id && Math.hypot(p.at[0] - x, p.at[2] - z) < 1.6 && Math.abs(p.at[1] - y) < 3.6)) continue;
      finish({ kind: 'panel', id: nextId(spec.id), area: spec.district, buildingId: spec.id, at: [x, y, z], facing: Math.atan2(f.n[0], f.n[1]), w: 1.2 + Math.floor(rand() * 4) * .2, h: .2, colour: colour === 'warmWhite' ? undefined : colour, seed: rand() }, false);
    }
  }
}

// ---------------------------------------------------------------------------
// Light pools on the ground (section 15): the lit ground under the lamps, the
// steady neon and the screens, as plain ellipses for lumen-ground.js
// `poolShapes` to paint into the ground's colour (a soft radial falloff,
// normal blend: world/city-ground.js GLOW_PROFILE). Lamps throw a cone-ish
// oval down the kerb, out over the road; signs and screens a broad wash along
// their wall, in front. Changing signs (flicker, blink, pulse, a dead lamp)
// get none here: the pool cards of render/city-signs.js follow those by the
// clock.
//   { x, z, rx, rz, angle (of the rx axis, from +x toward +z), tone, strength }
// Pink and red pools stay off the roadways and the Crossroads (blood, #8c1c2a,
// would vanish in them): they hug their wall as a low streak on the sidewalk.
export const POOL_TONES = Object.freeze({ white: '#646564', blue: '#353853', lemon: '#4e4a27', green: '#314b38', pink: '#4e2e39', red: '#3e2121', sodium: '#594832' }); // (world/lumen-ground.js POOL_TINTS)
const TONE_OF = Object.freeze({
  pink: 'pink', rose: 'pink', roseWhite: 'pink', red: 'red', velvetRed: 'red', coral: 'red', lemon: 'lemon', blue: 'blue', uptownBlue: 'blue',
  green: 'green', lime: 'green', sickGreen: 'green', sodium: 'sodium', warmWhite: 'white', coldWhite: 'white',
});
export const poolTone = colour => TONE_OF[colour] ?? 'white';
const WARM_TONES = new Set(['pink', 'red']);
function inCrossroads(x, z) { const C = CROSSROADS; return x > C.x0 && x < C.x1 && z > C.z0 && z < C.z1; }
export const LAMP_POOL = Object.freeze({ rx: 7.2, rz: 5, ahead: 1.3 });

export function lumenLightPools(list) {
  const pools = [];
  const add = (x, z, rx, rz, angle, tone, strength) => {
    if (WARM_TONES.has(tone)) {
      // (no part of a pink or red pool on a roadway or the Crossroads)
      const ax = Math.cos(angle), az = Math.sin(angle);
      for (const [px, pz] of [[x, z], [x + ax * rx, z + az * rx], [x - ax * rx, z - az * rx], [x - az * rz, z + ax * rz], [x + az * rz, z - ax * rz]]) {
        if (onRoadway(px, pz) || inCrossroads(px, pz)) return;
      }
    }
    pools.push({ x: r2(x), z: r2(z), rx: r2(rx), rz: r2(rz), angle: r3(angle) || 0, tone, strength: r2(strength) });
  };
  for (const p of list) {
    const sn = Math.sin(p.facing || 0), cs = Math.cos(p.facing || 0), along = Math.atan2(-sn, cs);
    if (p.kind === 'lamp') {
      if (p.mode && p.mode !== 'steady') continue;
      // the head is at the arm's tip; the light falls a little roadward of it, longer along the kerb than across
      const arm = (p.arm ?? R.lamp.arm) - .26 + LAMP_POOL.ahead, x = p.at[0] + sn * arm, z = p.at[2] + cs * arm;
      add(x, z, LAMP_POOL.rx, LAMP_POOL.rz, along, p.colour === 'sodium' ? 'sodium' : 'white', p.colour === 'sodium' ? 1 : .9);
    } else if (p.kind === 'neon') {
      const size = p.size ?? 1;
      if ((p.mode && p.mode !== 'dead-segment') || p.emitter === false || size < .9 || p.mount === 'free' && p.buildingId && p.at[1] > 6) continue;
      const tone = poolTone(p.colour), reach = p.poolReach ?? Math.min(8, Math.max(3, size * 3)), high = p.at[1] > 6;
      const across = Math.min(4.6, reach * .6), wide = Math.min(7, across * 1.5 + size * .6);
      if (WARM_TONES.has(tone)) {
        const out = Math.min(1.1, across * .4);
        add(p.at[0] + sn * out, p.at[2] + cs * out, Math.min(3.4, wide * .8), Math.min(1.6, Math.max(1.1, across * .55)), along, tone, .8);
      } else {
        add(p.at[0] + sn * across * .5, p.at[2] + cs * across * .5, wide, across, along, tone, high ? .7 : 1);
      }
    } else if (p.kind === 'screen') {
      const area = p.w * p.h;
      if (area < 1.8 || p.mode === 'frozen' && area < 4) continue;
      const ink = (p.palette || []).find(c => c !== 'screenBlack') ?? 'coldWhite', tone = poolTone(ink), high = p.at[1] > 6;
      // (a big screen's wash is broad along its wall, a small one's a small dim one)
      const across = Math.min(5.4, 1.6 + Math.sqrt(area) * .75), wide = Math.min(8.5, p.w / 2 + 1.2 + Math.sqrt(area) * .45), strength = Math.min(1, .5 + area * .07) * (high ? .75 : 1);
      if (WARM_TONES.has(tone)) add(p.at[0] + sn, p.at[2] + cs, Math.min(3.4, wide * .7), Math.min(1.6, Math.max(1.1, across * .5)), along, tone, .8);
      else add(p.at[0] + sn * (across * .5 + (high ? .8 : 0)), p.at[2] + cs * (across * .5 + (high ? .8 : 0)), wide, across, along, tone, strength);
    }
  }
  return pools;
}

// ---------------------------------------------------------------------------
// Neon outline signs (owner, 2026-09-30: "neon pink signs and neon blue, not
// as actual sources that show light but as neon signs with just outlines of
// symbols or gibberish words, not English"). Bare tubes on the walls, no
// backing: pictogram outlines and words of the invented script (the glyph
// atlas's shapes as strokes, render/glyph-atlas.js shapeStrokes; never a
// letter or a digit), in hot pink or electric blue, the district's lead
// colour most often. At street level over the shopfronts, and up the tall
// buildings' street faces (vertical words, big pictograms). They glow in
// their own colour (a thin halo card) and light nothing: `emitter: false`
// (no light-pool light, no facade wash, no ground pool), `glow: true`,
// never breakable (render/city-signs.js addNeon; NEON_OUTLINE). Kept clear
// of the other pieces on their wall, of doorways and canopies (street
// level), of corners and of the roof; north faces (only glimpsed) get none.
export const OUTLINES = Object.freeze({
  // The district's lead (the other colour takes the rest).
  lead: Object.freeze({ 'north-frontage': 'pink', 'south-frontage': 'pink', 'velvet-row': 'pink', stacks: 'pink', 'night-market': 'pink', uptown: 'blue', flatiron: 'blue', metro: 'blue', garage: 'blue', charging: 'blue' }),
  leadEvery: 3,         // the lead colour, but every third sign in a district the other
  intensity: 1.5,       // the tubes' HDR multiplier (render/city-signs.js NEON_OUTLINE.intensity; this module is plain data, no three)
  // Pictograms bent in tube (none that reads as a letter or a digit: no ring, cross, bar or frame).
  pictograms: Object.freeze(['heart', 'cocktail', 'note', 'lips', 'can', 'bowl', 'moon', 'eye', 'bolt', 'sparkle', 'bottle', 'pill', 'phone', 'bulb', 'car', 'chevrons', 'arrow-up', 'hand']),
  street: Object.freeze({ y: [3.3, 4.3], picto: [.75, 1.15], word: [.5, .7], glyphs: [3, 5], tilt: 14, perBuilding: [1, .9, .7, .5] }),
  tower: Object.freeze({ y: [8, 22], picto: [1.6, 2.4], column: [3, 5], glyphs: [3, 6], tilt: 6, perBuilding: [.9, .7, .5] }),
  // (tilt: degrees a sign leans back toward the camera, less than a boxed sign: bare tubes stay near their wall)
  wordShare: .5,        // of the street signs, words (else pictograms); up the towers, vertical words
  margin: .5,           // m from a face's ends
  clear: .35,           // m between a sign and another piece on its wall
  doorClear: .6,        // m past a doorway's edges a street sign keeps (its canopy, its strip)
  roof: .5,             // m under a low building's roof
  // The street detail's wall pieces (world/lumen-detail.js, their widths; tests/lumen-signs.test.js
  // checks them): tools/lumen-place-detail.mjs keeps them 1.3 m + half their width from a sign under
  // 4.5 m, so a street-level outline keeps off them the same way (they were placed first).
  detailClear: 1.3, detailWalls: Object.freeze({ cityDConduit: .8, cityDCableTray: 3, cityDStandpipe: .6, cityDGasMeter: .7, cityDMeterBank: 1.1, cityDVentGrille: .9, cityDPoster: 1, cityDPosterRow: 2.6, cityDPosterTorn: 1.2, cityDStickers: .6, cityDPasteUp: .8, cityDDoorGlow: 2, cityDNeonSide: .3 }),
  modes: Object.freeze(['steady', 'steady', 'steady', 'steady', 'flicker', 'steady', 'steady', 'dead-segment', 'steady', 'steady', 'steady', 'flicker']),
});

function outlineList(out) {
  const O = OUTLINES, rand = stream(4242);
  const range = ([a, b]) => a + rand() * (b - a), pick = list => list[Math.floor(rand() * list.length) % list.length];
  let n = 0, mode = 0;
  const byDistrict = new Map();
  // A piece's half extents on its wall (along, up), for the clearance.
  const extent = p => p.kind === 'neon' ? [(p.size ?? 1) * aspectOf(p.shape) / 2 + R.neonMargin, (p.size ?? 1) / 2 + R.neonMargin] : p.kind === 'screen' ? [p.w / 2 + R.bezel, p.h / 2 + R.bezel] : p.kind === 'panel' ? [p.w / 2, p.h / 2] : [.3, .3];
  const place = (spec, f, t, y, shape, size, tilt) => {
    const width = size * aspectOf(shape), hw = width / 2 + .1, hh = size / 2 + .1;
    if (t - hw < O.margin || t + hw > f.len - O.margin) return false;
    if (!spec.tall && y + hh > spec.height - O.roof) return false;
    const u = f.axis === 'x' ? f.a[0] + f.dir[0] * t : f.axis === 'z' ? f.a[1] + f.dir[1] * t : t, w = wallPoint(f, u);
    if (buriedPiece(spec.id, [w.x, y, w.z], w.facing, hw, y - hh)) return false; // (a party wall: inside the building next door)
    // Clear of every piece already on this wall (the district's own signs, strips, slits and the outlines so far).
    for (const o of out) {
      if (o.buildingId !== spec.id || !o.at || o.kind === 'pole') continue;
      const dx = o.at[0] - w.x, dz = o.at[2] - w.z, along = dx * f.dir[0] + dz * f.dir[1], off = dx * f.n[0] + dz * f.n[1];
      if (Math.abs(off) > 2.5) continue;
      const [ohw, ohh] = extent(o);
      if (Math.abs(along) < hw + ohw + O.clear && Math.abs(o.at[1] - y) < hh + ohh + O.clear) return false;
    }
    // Under 4.5 m, off the street detail's wall pieces.
    if (y < 4.5) for (const q of LUMEN_DETAIL_PROPS) { const dw = O.detailWalls[q.type]; if (dw != null && Math.hypot(q.x - w.x, q.z - w.z) < O.detailClear + dw / 2 + .05) return false; }
    // At street level, off the doorways (their canopies and strips).
    if (y - hh < 4.6) for (const d of getDoors()) {
      if (d.id !== spec.id || d.nx * f.n[0] + d.nz * f.n[1] < .9) continue;
      const along = (d.x - w.x) * f.dir[0] + (d.z - w.z) * f.dir[1], off = (d.x - w.x) * f.n[0] + (d.z - w.z) * f.n[1];
      if (Math.abs(off) < .6 && Math.abs(along) < d.width / 2 + hw + O.doorClear) return false;
    }
    const lead = O.lead[spec.district] ?? 'pink', k = (byDistrict.get(spec.district) || 0) + 1; byDistrict.set(spec.district, k);
    const colour = k % O.leadEvery === 0 ? (lead === 'blue' ? 'pink' : 'blue') : lead;
    const m = O.modes[mode++ % O.modes.length];
    emit(out, { kind: 'neon', id: `${spec.id}-outline-${++n}`, area: spec.district, buildingId: spec.id, outline: true, shape, at: [w.x, y, w.z], facing: w.facing, size, colour,
      mode: m === 'steady' ? undefined : m, tilt, seed: rand(), backing: false, emitter: false, glow: true, breakable: false, intensity: O.intensity });
    return true;
  };
  // A few tries along a face for one sign.
  const tryFace = (spec, f, make) => { for (let k = 0; k < 14; k++) { const { t, y, shape, size, tilt } = make(); if (place(spec, f, t, y, shape, size, tilt)) return true; } return false; };
  for (const spec of SPECS) {
    if (spec.id === 'bus' || spec.id === 'checkpoint-booth') continue;
    const faces = (getFaces().get(spec.id) || []).filter(f => f.name !== 'N' && f.len >= 2.5);
    if (!faces.length) continue;
    // (the longest faces first, then the rest, seeded)
    const order = faces.slice().sort((a, b) => b.len - a.len);
    // (a face that takes none, a party wall's stretch inside the building
    // next door, hands the sign on to the next face)
    const onFaces = (i, make) => { for (let k = 0; k < order.length; k++) if (tryFace(spec, order[(i + k) % order.length], make(order[(i + k) % order.length]))) return; };
    O.street.perBuilding.forEach((chance, i) => {
      if (rand() > chance) return;
      onFaces(i, f => () => {
        const word = rand() < O.wordShare, size = word ? range(O.street.word) : range(O.street.picto);
        const shape = word ? { glyphs: Math.round(range(O.street.glyphs)), seed: Math.round(rand() * 1000) / 1000 } : pick(O.pictograms);
        return { t: rand() * f.len, y: range(O.street.y), shape, size, tilt: O.street.tilt };
      });
    });
    if (!spec.tall) continue;
    O.tower.perBuilding.forEach((chance, i) => {
      if (rand() > chance) return;
      onFaces(i, f => () => {
        const word = rand() < O.wordShare;
        const shape = word ? { glyphs: Math.round(range(O.tower.glyphs)), vertical: true, seed: Math.round(rand() * 1000) / 1000 } : pick(O.pictograms);
        const size = word ? range(O.tower.column) : range(O.tower.picto);
        return { t: rand() * f.len, y: range(O.tower.y), shape, size, tilt: O.tower.tilt };
      });
    });
  }
  return n;
}

// The whole list, seeded and deterministic: the same on every load.
export function lumenSigns() {
  const out = [];
  lampList(out); signalList(out); buildingList(out); outlineList(out);
  return out;
}
export { faceOf, wallPoint, getFaces, getDoors, SPEC, r2, r3, stream, compass, inPoly, doorDistance, baseDistance, inProp, poleFree, nearestFree, buildingDistance, zebraDistance, inApron, polyDistance };
