// Where you can walk into a city building, and the light that says so
// (owner, 2026-10-01, by voice: "Make the doorways and entrances on Lumen a
// little bit more prominent so you can tell where you can enter").
//
// Every building on Lumen can be entered, through its outer doorways. From
// the top-down camera at night a doorway was a dark gap like any dark shop
// bay or shutter, and a doorway on a north face (the camera looks from the
// south) could not be seen at all: its wall faces away and the roof hides
// the first metre or two of street in front of it. So each doorway throws a
// spill of interior light out onto the street, the way an open door does
// at night: a bright sill line at the wall, then a soft fan that widens and
// fades over ENTRANCE.length metres, far enough out to show past a low
// roof's edge. (Its frame's lit header is the facades': render/city-facades.js
// DOORWAY.)
//
// The doorways are read from the same data the colliders and the cut use:
// each city room's `openings` with `outer` (world/city-rooms.js, map-kit.js
// buildingOpenings), so every real way in gets one and nothing else does
// (a shutter or rolling door dressed on a facade bay is not an opening).
// Pure JS (no three.js): the geometry is tested in Node; render/
// city-entrances.js draws it (one mesh, one draw, all presets).
import { buildingOpenings } from '../map-kit.js';

export const ENTRANCE = Object.freeze({
  face: .19,        // m from the wall's line to its outer face (city-shells SHELLS.thickness / 2): the spill starts here
  length: 3.2,      // m out from the face at most...
  away: 1,          // ...and this much more for a doorway facing away from the camera (north: a 5 m roof hides about 1.8 m of street in front of it)
  minLength: 1,     // m: never shorter (an outer door opens onto 1.4 m of open ground at least: tests/lumen-buildings)
  side: .12,        // m past each jamb at the wall...
  spread: .75,      // ...and this much more each side at its far end (a fan)
  clear: .16,       // m it keeps from any other footprint's line (a wall's outer face is .19 out)
  step: .1,         // m: the clipping's sampling step
  sill: .14,        // m: the bright line along the threshold, out from the face
});

const roomPoly = r => r.quad ? r.quad.map(p => [p[0], p[1]]) : [[r.x - r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z + r.d / 2], [r.x - r.w / 2, r.z + r.d / 2]];
const solidPoly = s => { const a = s.angle || 0, c = Math.cos(a), n = Math.sin(a), hw = s.w / 2, hd = s.d / 2; return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [s.x + x * c + z * n, s.z - x * n + z * c]); };

// Every outer doorway of every city room: { building, room, x, z (its middle
// on the wall's line), ux, uz (along the wall), nx, nz (out, onto the
// street), width }.
export function cityEntrances(map) {
  const out = [];
  for (const room of map?.buildings || []) {
    if (!room.group) continue;
    const poly = roomPoly(room), cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    for (const o of buildingOpenings(room)) {
      if (!o.outer) continue;
      const x = (o.a.x + o.b.x) / 2, z = (o.a.z + o.b.z) / 2, l = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) || 1, ux = (o.b.x - o.a.x) / l, uz = (o.b.z - o.a.z) / l;
      let nx = -uz, nz = ux; if ((x - cx) * nx + (z - cz) * nz < 0) { nx = -nx; nz = -nz; }
      out.push({ building: room.group, room: room.id, x, z, ux, uz, nx, nz, width: o.width });
    }
  }
  return out;
}

// Every footprint a spill must keep off: the city rooms, the solids (the
// sealed ring, blocked stairwells, the road-end barricades).
export function entranceFootprints(map) {
  const polys = [...(map?.buildings || []).filter(b => b.group).map(roomPoly), ...(map?.solids || []).map(solidPoly)];
  return polys.map(poly => ({ poly, box: [Math.min(...poly.map(p => p[0])), Math.max(...poly.map(p => p[0])), Math.min(...poly.map(p => p[1])), Math.max(...poly.map(p => p[1]))] }));
}
const segDist = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
const inPoly = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [ax, az] = poly[j], [bx, bz] = poly[i]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) c = !c; } return c; };
// How far (x, z) stands outside every footprint (0 inside one), up to `cap`.
export function footprintDistance(footprints, x, z, cap = 1) {
  let best = cap;
  for (const { poly, box } of footprints) {
    if (x < box[0] - best || x > box[1] + best || z < box[2] - best || z > box[3] + best) continue;
    if (inPoly(poly, x, z)) return 0;
    for (let k = 0; k < poly.length; k++) { const [ax, az] = poly[k], [bx, bz] = poly[(k + 1) % poly.length]; best = Math.min(best, segDist(x, z, ax, az, bx, bz)); }
  }
  return best;
}

// Each doorway's spill on the ground: the doorway, then the fan's shape in
// its own frame (s along the wall from the middle, t out from the wall's
// line): from t0 (the outer face) to t1, half wide hw0 at t0 and hw1 at t1;
// `half` the opening's half width (the sill line's). The fan is cut short,
// and its widening narrowed, where another footprint (or its own building's
// next wing) comes within ENTRANCE.clear of it.
export function entranceSpills(map, entrances = cityEntrances(map)) {
  const E = ENTRANCE, foot = entranceFootprints(map), out = [];
  for (const d of entrances) {
    const half = d.width / 2, t0 = E.face;
    const at = (s, t) => [d.x + d.ux * s + d.nx * t, d.z + d.uz * s + d.nz * t];
    const clear = (s, t) => { const [x, z] = at(s, t); return footprintDistance(foot, x, z, E.clear + .01) >= E.clear; };
    // The widest fan whose first minLength metres stay clear, then as far
    // out as every row of it does (rows every E.step, seven points across).
    let side = E.side, rate = E.spread / (E.length + E.away);
    const rowClear = (t, hw) => { for (let k = 0; k <= 6; k++) if (!clear(-hw + 2 * hw * k / 6, t)) return false; return true; };
    const hwAt = t => half + side + rate * (t - t0);
    const reach = limit => { let t = t0; while (t + E.step <= t0 + limit + 1e-6 && rowClear(t + E.step, hwAt(t + E.step))) t += E.step; return t - t0; };
    while ((side > 0 || rate > 0) && (!rowClear(t0, hwAt(t0)) || reach(E.minLength) < E.minLength - 1e-6)) { if (rate > 0) rate = Math.max(0, rate - .05); else side = Math.max(0, side - .03); }
    const length = Math.max(E.minLength, reach(E.length + E.away * Math.max(0, -d.nz)));
    out.push({ ...d, half, t0, t1: t0 + length, hw0: half + side, hw1: hwAt(t0 + length) });
  }
  return out;
}

// The spill's corners in the world (a trapezoid, wall side first): for the
// mesh and the tests.
export function spillCorners(p) {
  const at = (s, t) => [p.x + p.ux * s + p.nx * t, p.z + p.uz * s + p.nz * t];
  return [at(-p.hw0, p.t0), at(p.hw0, p.t0), at(p.hw1, p.t1), at(-p.hw1, p.t1)];
}
