// Where Lumen's water things stand (lumen-design.md section 10b): the storm
// drains and the gutters that run to them, the downspouts and awning curtains
// of the low buildings, the ledges that drip after the rain, and the hot
// things that steam and spark. Pure functions of the map (seeded, no state),
// so the same drains and spouts stand in the same place on every load and for
// every player, and a test can check them without a browser.
//
// Nothing here draws; effects/lumen-water.js turns these lists into meshes
// and pools. Stage 4 places the crackling EV and the downed cable properly:
// move their entries in HOT_SPOTS and the steam and sparks follow.
import { ROADS, CROSSROADS } from '../maps/lumen-layout.js';
import { roadGeometry, intersections, seeded } from '../world/lumen-ground.js';
import { roomOutline } from '../world/city-rooms.js';
import { buildingContains } from '../map-kit.js';

export const WATER_PLACES = Object.freeze({
  // Gutters: the ground paints a dark 0.35 m strip 0.2 m in from each kerb
  // (world/lumen-ground.js); the running water lies on it.
  gutterInset: .2,        // m from the roadway's edge to the gutter's centre line
  gutterWidth: .34,
  step: .5,               // m between the samples a run is found with
  minRun: 3,              // a shorter piece of kerb has no gutter
  edgeMargin: 1.6,        // m: gutters stop this far inside the playable outline (the barricades)
  drainSpacing: 20,       // m between storm drains along a run ("every ~20 m")
  drainJitter: 1.4,       // m a drain may sit off the even spacing
  drainEnd: 1.6,          // m a drain keeps from either end of a run
  drainSize: .55,         // m: half the foam quad that swirls into it
  // Downspouts: low buildings at least this tall; a wide building gets two.
  spoutMinHeight: 3.5,
  spoutWide: 9,
  spoutSpread: 6,         // m the second spout keeps from the first
  spoutDoorClear: 1.6,    // m a spout keeps from a doorway
  spoutRunoff: 5,         // m the stream on the ground may run toward the gutter
  cornerProbe: .14,       // m: how far the corner test looks off a vertex
  // Awning curtains, over a doorway of a low building.
  awningHeight: 2.7, awningReach: .9, awningMax: 4.2, awningMinEdge: 3.2, awningChance: .6, awningCap: 8,
  // Ledges that drip: the eaves of low buildings, and the first-floor line of
  // the towers (their cut stops at 3.6 m).
  eaveSpacing: 4.5, ledgeHeight: 3.6, ledgeSpacing: 7, ledgeOut: .12,
  sourceCap: 320,         // drip sources kept from the map (signs add theirs at run time)
});

// The hot things (world x, z, height y): steam rises from them and the
// sparks fall from them. A small list of my own because the cars and cables
// are grey placeholders until stage 4: it reads the cover list's positions
// (maps/lumen-cover.js: the pileup at 27.2, -4; the charging lot's cars; the
// fallen pole at -30.35, 29.75), and stage 4 moves the entries.
export const HOT_SPOTS = Object.freeze({
  steam: Object.freeze([
    Object.freeze({ id: 'pileup-hood', x: 26.6, z: -4.2, y: .85, strength: 1, note: 'the smouldering car of the Boulevard pileup' }),
    Object.freeze({ id: 'pileup-rear', x: 28.5, z: -3.3, y: .7, strength: .55, note: 'a second wreck, cooling' }),
    Object.freeze({ id: 'ev-battery', x: -15.6, z: 39.6, y: .5, strength: .5, note: 'the crackling EV in the charging lot' }),
    Object.freeze({ id: 'cable-road', x: -29.6, z: 28.9, y: .1, strength: .35, note: 'the downed cable on the wet road' }),
  ]),
  sparks: Object.freeze([
    Object.freeze({ id: 'ev', x: -15.6, z: 39.6, y: .55, note: 'the crackling EV' }),
    Object.freeze({ id: 'cable', x: -29.6, z: 28.9, y: .35, note: 'the downed cable, sparking on the wet road' }),
  ]),
});

// The hot spots of a map: its own list (`city.water.hot`), else Lumen's, with
// the pileup's entries moved to wherever the cover list puts the pileup.
export function hotSpotsFor(map) {
  const own = map.city?.water?.hot;
  if (own) return own;
  if (map.id !== 'lumen') return { steam: [], sparks: [] };
  // (Offsets from the prop each hot thing belongs to: the pileup, and the
  // fallen pole whose cable lies across West Street.)
  const pile = (map.props || []).find(p => p.type === 'cityPileup'), pole = (map.props || []).find(p => p.type === 'cityFallenPole');
  const at = { 'pileup-hood': [pile, -.6, -.2], 'pileup-rear': [pile, 1.3, .7], 'cable-road': [pole, .75, -.85], cable: [pole, .75, -.85] };
  const move = s => { const [prop, dx, dz] = at[s.id] || []; return prop ? { ...s, x: round2(prop.x + dx), z: round2(prop.z + dz) } : s; };
  return { steam: HOT_SPOTS.steam.map(move), sparks: HOT_SPOTS.sparks.map(move) };
}

// A drain in Back Alley, where the body pile's blood is carried to.
const EXTRA_DRAINS = Object.freeze([{ x: -13, z: -23.75, nx: 0, nz: 1 }]);

// ---------------------------------------------------------------------------
// Small geometry helpers.

// Even-odd point in polygon ([[x, z], ...]); with `margin` the point must
// also keep that far from every edge.
export function insidePoly(poly, x, z, margin = 0) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
    if (margin > 0) {
      const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      if ((x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2 < margin * margin) return false;
    }
  }
  return inside;
}

// Open air: inside the playable area (keeping `margin` from its edge) and in
// no room and no sealed mass. One scratch point, so it allocates nothing.
export function outdoorsTest(map) {
  const shapes = [...(map.buildings || []), ...(map.solids || [])], area = map.playableArea, point = { x: 0, z: 0 };
  return (x, z, margin = 0) => {
    if (area && !insidePoly(area, x, z, margin)) return false;
    point.x = x; point.z = z;
    for (const s of shapes) if (buildingContains(s, point)) return false;
    return true;
  };
}

const hash = (a, b = 0) => { let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x7f4a7c15, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
const hashString = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const round2 = v => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------
// Gutters and drains.

// Where the roads' kerbs are open: `mouth(x, z)` is true where a kerb must
// stop (a crosswalk, the mouth of a crossing road, the Crossroads), the same
// test the ground uses for its own gutter strip; `open(x, z)` where water may
// run (open air, clear of the map's edge).
export function gutterRuns(roads, { mouth, open }, spec = WATER_PLACES) {
  const runs = [];
  for (const r of roads) {
    const h = r.width / 2, diagonal = r.axis === 'diagonal';
    const g = diagonal ? roadGeometry(r) : null;
    // The centre line as origin + t * direction, and the normal the sides use.
    const line = diagonal
      ? { ox: g.a[0], oz: g.a[1], ux: g.ux, uz: g.uz, nx: g.nx, nz: g.nz, len: Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) }
      : r.axis === 'x'
        ? { ox: r.from, oz: r.centre, ux: 1, uz: 0, nx: 0, nz: 1, len: r.to - r.from }
        : { ox: r.centre, oz: r.from, ux: 0, uz: 1, nx: 1, nz: 0, len: r.to - r.from };
    for (const side of [-1, 1]) {
      const off = side * (h - spec.gutterInset);
      const at = t => [line.ox + line.ux * t + line.nx * off, line.oz + line.uz * t + line.nz * off];
      let start = null, last = null;
      const flush = () => {
        if (start !== null && last - start >= spec.minRun) {
          const [ax, az] = at(start), [bx, bz] = at(last);
          runs.push({ road: r.id, side, ax, az, bx, bz, ux: line.ux, uz: line.uz, nx: line.nx * side, nz: line.nz * side, length: last - start });
        }
        start = null;
      };
      for (let t = spec.step / 2; t < line.len; t += spec.step) {
        const [x, z] = at(t);
        if (!mouth(x, z) && open(x, z)) { if (start === null) start = t - spec.step / 2; last = t + spec.step / 2; } else flush();
      }
      flush();
    }
  }
  return runs;
}

// Drains along each run, and the pieces of gutter that run to them: every
// piece starts at a high point half way to the neighbouring drain (or at the
// run's end) and ends at its drain, so the water always flows toward one.
export function planGutters(runs, spec = WATER_PLACES) {
  const pieces = [], drains = [];
  runs.forEach((run, ri) => {
    const rand = seeded(hashString(run.road) + ri * 7919 + (run.side > 0 ? 1 : 0));
    const count = Math.max(1, Math.round(run.length / spec.drainSpacing));
    const at = [];
    for (let i = 0; i < count; i++) {
      const even = (i + .5) * run.length / count, jitter = (rand() * 2 - 1) * spec.drainJitter;
      at.push(Math.min(run.length - spec.drainEnd, Math.max(spec.drainEnd, even + jitter)));
    }
    if (run.length < 2 * spec.drainEnd) at[0] = run.length / 2;
    at.forEach((d, i) => {
      const before = i === 0 ? 0 : (at[i - 1] + d) / 2, after = i === count - 1 ? run.length : (d + at[i + 1]) / 2;
      const point = t => [run.ax + run.ux * t, run.az + run.uz * t];
      const [dx, dz] = point(d);
      drains.push({ x: round2(dx), z: round2(dz), ux: run.ux, uz: run.uz, nx: run.nx, nz: run.nz, road: run.road });
      // (Two pieces per drain, one from each side; a piece shorter than a
      // metre is not worth a quad.)
      for (const from of [before, after]) {
        if (Math.abs(d - from) < 1) continue;
        const [sx, sz] = point(from);
        pieces.push({ x0: round2(sx), z0: round2(sz), x1: round2(dx), z1: round2(dz), length: round2(Math.abs(d - from)), road: run.road });
      }
    });
  });
  return { pieces, drains };
}

// The nearest gutter point to (x, z) within `reach` m, or null: [px, pz, dirX, dirZ]
// (the direction the water flows there). Used for blood and for a spout's stream.
export function nearestGutter(pieces, x, z, reach, out = [0, 0, 0, 0]) {
  let best = reach * reach, found = false;
  for (const p of pieces) {
    const dx = p.x1 - p.x0, dz = p.z1 - p.z0, len2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - p.x0) * dx + (z - p.z0) * dz) / len2));
    const px = p.x0 + dx * t, pz = p.z0 + dz * t, d2 = (x - px) ** 2 + (z - pz) ** 2;
    if (d2 < best) { best = d2; found = true; const l = Math.sqrt(len2); out[0] = px; out[1] = pz; out[2] = dx / l; out[3] = dz / l; }
  }
  return found ? out : null;
}

// ---------------------------------------------------------------------------
// Buildings.

// The outer edges of a building: each room's edge that has open air outside
// it and the room's own floor inside (a wall shared with another room of the
// same building is not one). { ax, az, bx, bz, length, ux, uz, nx, nz }, the
// normal pointing out.
export function outerEdges(spec, polys = spec.rooms.map(roomOutline)) {
  const inside = (x, z) => polys.some(p => insidePoly(p, x, z)), edges = [];
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], length = Math.hypot(bx - ax, bz - az);
      if (length < 1) continue;
      const ux = (bx - ax) / length, uz = (bz - az) / length;
      // Which side is out: the one where none of three probes is inside.
      for (const sign of [1, -1]) {
        const nx = -uz * sign, nz = ux * sign;
        const outside = [.25, .5, .75].every(f => !inside(ax + ux * length * f + nx * .25, az + uz * length * f + nz * .25));
        const within = [.25, .5, .75].every(f => inside(ax + ux * length * f - nx * .25, az + uz * length * f - nz * .25));
        if (outside && within) { edges.push({ ax, az, bx, bz, length, ux, uz, nx, nz }); break; }
      }
    }
  }
  return edges;
}

const lowBuildings = (map, spec = WATER_PLACES) => (map.cityBuildings || []).filter(b => b.low && !b.tall && (b.height ?? 0) >= spec.spoutMinHeight && b.id !== 'bus');

// Downspouts: at an outer, convex corner of a low building, on open ground,
// clear of doorways. Seeded per building (its id), so the same spouts stand
// in the same corners for everyone. { id, building, x, z, top, nx, nz }
// (nx, nz: the way the corner faces out).
export function planSpouts(map, outdoors = outdoorsTest(map), spec = WATER_PLACES) {
  const out = [];
  for (const b of lowBuildings(map, spec)) {
    const polys = b.rooms.map(roomOutline), inside = (x, z) => polys.some(p => insidePoly(p, x, z)), doors = b.doors || [];
    const candidates = [], seen = new Set(), e = spec.cornerProbe;
    for (const poly of polys) for (const [vx, vz] of poly) {
      const key = `${Math.round(vx * 10)},${Math.round(vz * 10)}`;
      if (seen.has(key)) continue; seen.add(key);
      // A convex outer corner has exactly one of its four quadrants inside.
      const quadrants = [[1, 1], [1, -1], [-1, 1], [-1, -1]].filter(([qx, qz]) => inside(vx + qx * e, vz + qz * e));
      if (quadrants.length !== 1) continue;
      const nx = -quadrants[0][0], nz = -quadrants[0][1], x = vx + nx * e * 1.4, z = vz + nz * e * 1.4;
      if (!outdoors(x, z, .5) || doors.some(d => Math.hypot(d.at[0] - x, d.at[1] - z) < spec.spoutDoorClear)) continue;
      candidates.push({ x: round2(x), z: round2(z), nx: nx * Math.SQRT1_2, nz: nz * Math.SQRT1_2 });
    }
    if (!candidates.length) continue;
    const xs = polys.flat().map(p => p[0]), zs = polys.flat().map(p => p[1]), wide = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) >= spec.spoutWide;
    const seed = hashString(b.id) ^ (b.seed | 0);
    candidates.sort((p, q) => hash(seed, Math.round(p.x * 10) + Math.round(p.z * 100)) - hash(seed, Math.round(q.x * 10) + Math.round(q.z * 100)));
    const chosen = [candidates[0]];
    if (wide) { const second = candidates.find(c => Math.hypot(c.x - chosen[0].x, c.z - chosen[0].z) >= spec.spoutSpread); if (second) chosen.push(second); }
    chosen.forEach((c, i) => out.push({ id: `${b.id}#${i}`, building: b.id, x: c.x, z: c.z, top: (b.height ?? 5) - .15, nx: c.nx, nz: c.nz }));
  }
  return out;
}

// Awning curtains: water sheeting off the edge of an awning over a doorway
// of a low building. About 60% of the buildings that have a wide enough
// doorway wall get one, at most `awningCap` in all. { id, building, x0, z0, x1, z1, y, nx, nz }
export function planAwnings(map, outdoors = outdoorsTest(map), spec = WATER_PLACES) {
  const out = [];
  for (const b of lowBuildings(map, spec)) {
    if (hash(hashString(b.id), b.seed | 0) >= spec.awningChance) continue;
    const edges = outerEdges(b);
    for (const d of b.doors || []) {
      const edge = edges.find(ed => {
        const t = (d.at[0] - ed.ax) * ed.ux + (d.at[1] - ed.az) * ed.uz, off = Math.abs((d.at[0] - ed.ax) * ed.uz - (d.at[1] - ed.az) * ed.ux);
        return off < .06 && t > -.06 && t < ed.length + .06 && ed.length >= spec.awningMinEdge;
      });
      if (!edge) continue;
      const t = Math.min(edge.length - .4, Math.max(.4, (d.at[0] - edge.ax) * edge.ux + (d.at[1] - edge.az) * edge.uz));
      const half = Math.min(spec.awningMax, edge.length - .8) / 2, lo = Math.max(.2, t - half), hi = Math.min(edge.length - .2, t + half);
      const point = s => [edge.ax + edge.ux * s + edge.nx * spec.awningReach, edge.az + edge.uz * s + edge.nz * spec.awningReach];
      const [x0, z0] = point(lo), [x1, z1] = point(hi), [xm, zm] = point((lo + hi) / 2);
      if (![[x0, z0], [x1, z1], [xm, zm]].every(([x, z]) => outdoors(x, z, .5))) continue;
      out.push({ id: `${b.id}@${out.length}`, building: b.id, x0: round2(x0), z0: round2(z0), x1: round2(x1), z1: round2(z1), y: spec.awningHeight, nx: edge.nx, nz: edge.nz });
      break; // one doorway a building
    }
  }
  return out.sort((a, b) => a.id < b.id ? -1 : 1).slice(0, spec.awningCap);
}

// Drip sources: points along the eaves of the low buildings and the
// first-floor line of the towers, each with a threshold in (0, 1): a source
// drips while the runoff is above it, so they stop one after another as the
// roofs dry. [x, y, z, threshold] flat.
export function planLedges(map, outdoors = outdoorsTest(map), awnings = [], spec = WATER_PLACES) {
  const out = [];
  const add = (x, y, z, key) => { if (out.length < spec.sourceCap * 4) out.push(round2(x), round2(y), round2(z), round2(.05 + .9 * hash(key, out.length))); };
  for (const b of map.cityBuildings || []) {
    const low = !!b.low && !b.tall, seed = hashString(b.id);
    const height = low ? (b.height ?? 5) - .1 : spec.ledgeHeight, spacing = low ? spec.eaveSpacing : spec.ledgeSpacing;
    for (const edge of outerEdges(b)) {
      const n = Math.max(1, Math.floor(edge.length / spacing));
      for (let i = 0; i < n; i++) {
        const t = (i + .5) * edge.length / n, x = edge.ax + edge.ux * t + edge.nx * spec.ledgeOut, z = edge.az + edge.uz * t + edge.nz * spec.ledgeOut;
        if (outdoors(x, z, .5)) add(x, height, z, seed + i);
      }
    }
  }
  // Awnings drip along their whole outer edge.
  for (const a of awnings) {
    const len = Math.hypot(a.x1 - a.x0, a.z1 - a.z0), n = Math.max(2, Math.round(len / .9));
    for (let i = 0; i < n; i++) add(a.x0 + (a.x1 - a.x0) * (i + .5) / n, a.y, a.z0 + (a.z1 - a.z0) * (i + .5) / n, hashString(a.id) + i);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The lot.

// The gutters need the roads: Lumen's are in its layout; a map that lists
// its own (`city.water.roads`) gets those; any other city map (the test
// street) has no gutters.
function roadsFor(map) {
  const flag = map.city?.water;
  if (flag && typeof flag === 'object' && flag.roads) return flag.roads;
  return map.id === 'lumen' ? ROADS : [];
}

// Where a gutter must stop: a crosswalk, the mouth of a crossing road or the
// Crossroads (the ground's own test, so the water lies exactly on its strip).
function lumenMouth() {
  const junctions = intersections(), mouths = junctions.flatMap(j => j.crosswalks), C = CROSSROADS;
  return (x, z) => mouths.some(c => x > c.x0 - .3 && x < c.x1 + .3 && z > c.z0 - .3 && z < c.z1 + .3)
    || junctions.some(j => x > j.x0 - .3 && x < j.x1 + .3 && z > j.z0 - .3 && z < j.z1 + .3)
    || (x > C.x0 && x < C.x1 && z > C.z0 && z < C.z1);
}

const cache = new WeakMap();

// Everything, made once per map. { runs, pieces, drains, spouts, awnings, ledges, steam, sparks }
export function waterPlaces(map, spec = WATER_PLACES) {
  if (cache.has(map)) return cache.get(map);
  const outdoors = outdoorsTest(map), roads = roadsFor(map), lumen = map.id === 'lumen';
  const runs = roads.length ? gutterRuns(roads, { mouth: lumen ? lumenMouth() : () => false, open: (x, z) => outdoors(x, z, spec.edgeMargin) }, spec) : [];
  const { pieces, drains } = planGutters(runs, spec);
  if (lumen) for (const d of EXTRA_DRAINS) drains.push({ ...d, ux: 1, uz: 0, road: 'back-alley' });
  const spouts = planSpouts(map, outdoors, spec), awnings = planAwnings(map, outdoors, spec);
  const ledges = planLedges(map, outdoors, awnings, spec);
  const hot = hotSpotsFor(map);
  const places = Object.freeze({ runs, pieces, drains, spouts, awnings, ledges, steam: hot.steam, sparks: hot.sparks });
  cache.set(map, places);
  return places;
}
