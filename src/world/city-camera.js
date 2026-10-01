// Lumen's outdoor camera focus (AGENTS.md > Lumen > Shells and the cut):
// where the camera looks when you are outdoors on a city map. Pure JS (no
// three.js), tested on its own (tests/city-camera.test.js); renderer.js asks
// it for the focus's x each frame (outdoors, not scoped, not spectating) and
// eases toward it as it always does.
//
// Owner, 2026-09-29: "Moving left and right into a building, since the
// camera is wide, it shouldn't cause the building to go away to fit the
// camera; the camera should slide against the building and stop before
// clipping into the building ... fixed when the player moves up and down
// against the building ... if they step away from the building the camera
// should follow them as usual" and "it can get a little closer as the player
// gets closer".
//
// The camera stands CAMERA_TILT x 29 = 10.1 m south of what it looks at, 29
// m up, and sees about 20 m to either side. So a tall wall beside you, from
// your row to past the camera's, would fill half the screen at arm's length
// (or have the camera inside it). The focus slides sideways instead: over
// the rows of ground from you to past the camera's (`band`), every tall wall
// east of you asks the focus to stay `keep` m west of it, and every one west
// of you `keep` m east of it. Each row's wall asks with a spring of
// stiffness `give` x the row's weight squared, and the stiffest pull on each
// side wins (a wall beside the camera needs the camera kept off it however
// short it is), against a spring of stiffness 1 pulling the focus to you:
//   - 9 m or more from the wall, nothing changes (the camera follows you);
//   - walking up to it, the camera slows and stops at 6.5 m from the wall
//     (keep x give / (1 + give)): "a little closer as you get closer";
//   - walking along it, it stays put sideways and follows you up and down;
//   - between two walls (a street narrower than 2 x keep), the middle.
// They are hinge springs, so the answer is the one minimum of a convex
// function (found by bisection on its slope): continuous in where you
// stand, and it moves the way you move (it never runs back). The rows'
// weights ramp in over metres (`band`), so a wall coming into the band as
// you walk pushes the camera aside gradually, never at once.
//
// Only a wall beside you counts: one that reaches your row (the tall ground
// directly behind that face runs north to you or past). A building wholly
// south of you, between you and the camera, is in front of you: the scoop's
// (world/city-cut.js), which lowers the part in the way (kept off, the
// camera would look past its corner and lose the ground in front of it). A
// face's pull fades out over `gap` m as the building's north end falls
// behind you (walking on past its end), so the handover is gradual. Where
// you pass the end of a building in front of you whose face still pulls
// (within `gap` of your row), that pull lets go over `release` m: its
// spring's rest point slides from `keep` m off the end to you and, in the
// last third, its stiffness fades out (no jump).
//
// Only tall shells count (tall buildings and the edge ring's towers, at
// least `minTop` m): a low roof passes under the camera. The rows are a
// fixed world lattice (`row` m), their tall intervals merged once at load
// (party walls and overlapping towers are one wall), each face with how far
// north it runs, so a frame costs a walk over ~36 rows and a 40-step
// bisection (x4, averaged), and allocates nothing.
export const CITY_CAMERA = Object.freeze({
  keep: 9,        // m (D0): how far from a tall wall the focus keeps, once you are this far from it
  give: 2.6,      // the wall's spring against yours: at the wall the focus stands keep x give / (1 + give) = 6.5 m off (D1)
  gap: 5,         // m: a face whose building ends this far south of your row no longer pulls (it is in front of you)
  release: 12,    // m: past the end of a building in front of you, its wall lets go over this far
  // The band: the rows from you (0) south past the camera's ground point
  // (10.1), each row's weight (u m south of you, piecewise linear): full
  // from 7 m to just past the camera (a wall there fills the screen), less
  // toward you (a wall beside you only is seen from well off, and ramps in
  // as you walk on along it) and past the camera (rows it is about to
  // reach: a wall ahead pushes it aside before it gets there); none north
  // of you (what stands there is seen from outside).
  band: Object.freeze([[0, 0], [7, 1], [11, 1], [18, 0]]),
  row: .5,        // m: the rows' spacing (a fixed world lattice)
  merge: .6,      // m: gaps between tall parts narrower than this are closed (party walls, the ring's overlaps)
  minTop: 12,     // m: parts at least this tall count
  reach: 32,      // m: parts further than this to either side are not looked at
  span: 30,       // m: the bisection looks this far either side of you
  // Where the answer is averaged (m either side of you: a 2.4 m box, which
  // rounds off where one wall's pull hands over to another's).
  taps: Object.freeze([-.9, -.3, .3, .9]),
});

// The band's weight u m south of you.
export function bandWeight(u) {
  const b = CITY_CAMERA.band;
  if (u <= b[0][0] || u >= b[b.length - 1][0]) return 0;
  for (let i = 1; i < b.length; i++) if (u <= b[i][0]) { const [u0, w0] = b[i - 1], [u1, w1] = b[i]; return w0 + (w1 - w0) * (u - u0) / (u1 - u0); }
  return 0;
}

// A face's pull by how far south of your row its building ends (<= 0: it
// reaches you, 1), gone at `gap` (squared, so it lets go softly).
const beside = (south, gap) => south <= 0 ? 1 : south >= gap ? 0 : (1 - south / gap) ** 2;

const outline = r => r.quad ? r.quad : [[r.x - r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z + r.d / 2], [r.x - r.w / 2, r.z + r.d / 2]];
// A solid's outline, turned by its angle (as city-shells.js solidOutline).
function solidOutline(s) {
  const a = s.angle || 0, c = Math.cos(a), n = Math.sin(a), hw = s.w / 2, hd = s.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [s.x + x * c + z * n, s.z - x * n + z * c]);
}

// The map's tall footprints (convex polygons [[x, z], ...]): the rooms and
// blocked parts of each tall city building, and the sealed towers (the ones
// city-shells.js draws). Low buildings are left out.
export function tallFootprints(map) {
  const out = [], min = CITY_CAMERA.minTop;
  for (const spec of map.cityBuildings || []) {
    const top = spec.tall ? (spec.height ?? 60) : (spec.height ?? 5);
    if (top < min) continue;
    for (const r of map.buildings || []) if (r.group === spec.id) out.push(outline(r));
    for (const [x0, x1, z0, z1] of spec.blocked || []) out.push([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
  }
  for (const s of map.solids || []) if (s.shell !== false && (s.height ?? 60) >= min) out.push(solidOutline(s));
  return out;
}

// Where the line z = const crosses a convex polygon: [x0, x1] or null.
function rowSpan(poly, z) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % n];
    if ((az - z) * (bz - z) > 0) continue;
    if (az === bz) { lo = Math.min(lo, ax, bx); hi = Math.max(hi, ax, bx); continue; }
    const x = ax + (bx - ax) * (z - az) / (bz - az);
    lo = Math.min(lo, x); hi = Math.max(hi, x);
  }
  return lo <= hi ? [lo, hi] : null;
}

// The rows: for each world row (centre z0 + (j + .5) x row), its tall
// intervals, merged and sorted, flat: xs[start[j] .. start[j + 1]) in pairs;
// and for each, how far north (z) the tall ground directly behind its west
// face and behind its east face runs (the rows going north while the half
// metre inside that face stays covered), in tops[] at the same places.
export function cameraRows(polygons) {
  const g = CITY_CAMERA.row;
  let zMin = Infinity, zMax = -Infinity;
  for (const p of polygons) for (const [, z] of p) { zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); }
  if (!polygons.length) { zMin = 0; zMax = 0; }
  const z0 = Math.floor(zMin / g) * g, count = Math.max(1, Math.ceil((zMax - z0) / g));
  const start = new Int32Array(count + 1), xs = [];
  for (let j = 0; j < count; j++) {
    start[j] = xs.length;
    const z = z0 + (j + .5) * g, spans = [];
    for (const p of polygons) { const s = rowSpan(p, z); if (s) spans.push(s); }
    spans.sort((a, b) => a[0] - b[0]);
    let cur = null;
    for (const s of spans) {
      if (cur && s[0] <= cur[1] + CITY_CAMERA.merge) cur[1] = Math.max(cur[1], s[1]);
      else { if (cur) xs.push(cur[0], cur[1]); cur = [s[0], s[1]]; }
    }
    if (cur) xs.push(cur[0], cur[1]);
  }
  start[count] = xs.length;
  const covered = (j, x0, x1) => { for (let i = start[j]; i < start[j + 1]; i += 2) if (xs[i] <= x0 + 1e-6 && xs[i + 1] >= x1 - 1e-6) return true; return false; };
  const tops = new Float64Array(xs.length);
  for (let j = 0; j < count; j++) for (let i = start[j]; i < start[j + 1]; i += 2) {
    const a = xs[i], b = xs[i + 1], inA = Math.min(a + g, b), inB = Math.max(b - g, a);
    let ja = j; while (ja > 0 && covered(ja - 1, a, inA)) ja--;
    let jb = j; while (jb > 0 && covered(jb - 1, inB, b)) jb--;
    tops[i] = z0 + ja * g; tops[i + 1] = z0 + jb * g;
  }
  return { z0, count, start, xs: Float64Array.from(xs), tops };
}

export class CityCamera {
  // map: a city map (its tall footprints are read once), or { polygons }.
  constructor(map) {
    this.rows = cameraRows(map.polygons || tallFootprints(map));
    // The springs this frame (reused): rest point and stiffness, east walls
    // (the focus stays west of them) and west walls.
    const n = 512;
    this.eastAt = new Float64Array(n); this.eastK = new Float64Array(n);
    this.westAt = new Float64Array(n); this.westK = new Float64Array(n);
    this.east = 0; this.west = 0;
  }

  // The focus's x for you at (px, pz): how far the springs move the focus
  // off you, averaged over you standing at each of `taps` (a 2.4 m box,
  // which rounds off where one wall's pull hands over to another's).
  focusX(px, pz) {
    const t = CITY_CAMERA.taps, n = t.length;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += this.solve(px + t[i], pz) - t[i];
    return sum / n;
  }
  // The springs' answer for you at exactly (px, pz).
  solve(px, pz) {
    this.gather(px, pz);
    if (!this.east && !this.west) return px;
    // The slope of the springs' energy (halved), increasing in x: find where it is 0.
    let lo = px - CITY_CAMERA.span, hi = px + CITY_CAMERA.span;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (this.slope(mid, px) > 0) hi = mid; else lo = mid; }
    return (lo + hi) / 2;
  }
  // Half the slope of the energy (x - px)^2 + max east k (x - at)+^2 + max
  // west k (at - x)+^2 at x: the slope of whichever spring is stiffest there.
  slope(x, px) {
    let e = 0, de = 0, w = 0, dw = 0;
    for (let i = 0; i < this.east; i++) { const d = x - this.eastAt[i]; if (d > 0 && this.eastK[i] * d * d > e) { e = this.eastK[i] * d * d; de = this.eastK[i] * d; } }
    for (let i = 0; i < this.west; i++) { const d = this.westAt[i] - x; if (d > 0 && this.westK[i] * d * d > w) { w = this.westK[i] * d * d; dw = this.westK[i] * d; } }
    return x - px + de - dw;
  }

  // The walls round (px, pz) as springs.
  gather(px, pz) {
    const { z0, count, start, xs, tops } = this.rows, g = CITY_CAMERA.row, band = CITY_CAMERA.band;
    const { keep, give, release, reach, gap } = CITY_CAMERA, cap = this.eastAt.length;
    this.east = this.west = 0;
    const j0 = Math.max(0, Math.floor((pz + band[0][0] - z0) / g)), j1 = Math.min(count - 1, Math.ceil((pz + band[band.length - 1][0] - z0) / g));
    for (let j = j0; j <= j1; j++) {
      const w = bandWeight(z0 + (j + .5) * g - pz);
      if (w <= 0) continue;
      // (Squared: a wall's pull starts at nothing and gathers, so one coming
      // into the band moves the camera no faster than about you walk.)
      const k = give * w * w;
      for (let i = start[j]; i < start[j + 1]; i += 2) {
        const a = xs[i], b = xs[i + 1];
        if (a > px + reach || b < px - reach) continue;
        // Beside you: how far south of your row the building behind each
        // face ends (none: it reaches you), its pull fading out by `gap`.
        const nearA = beside(tops[i] - pz, gap), nearB = beside(tops[i + 1] - pz, gap);
        if (!nearA && !nearB) continue;
        // Its west face, a wall east of you; or, once you are in front of
        // the building (past that face), letting go over `release` m. Its
        // east face, the mirror: a wall west of you; or, while you are in
        // front of it, taking hold as you near that end. Each pulls less
        // the nearer you are to the building's far face (a narrow building
        // cannot throw the camera from one side of it to the other).
        const east = nearA * Math.min(1, ((b - px) / release) ** 2), west = nearB * Math.min(1, ((px - a) / release) ** 2);
        if (px <= a) { if (east && this.east < cap) { this.eastAt[this.east] = a - keep; this.eastK[this.east++] = k * east; } }
        else if (east && px - a < release && px < b && this.east < cap) {
          this.eastAt[this.east] = a - keep + (px - a) * (release + keep) / release; this.eastK[this.east++] = k * east * Math.min(1, 3 * (1 - (px - a) / release));
        }
        if (px >= b) { if (west && this.west < cap) { this.westAt[this.west] = b + keep; this.westK[this.west++] = k * west; } }
        else if (west && b - px < release && px > a && this.west < cap) {
          this.westAt[this.west] = b + keep - (b - px) * (release + keep) / release; this.westK[this.west++] = k * west * Math.min(1, 3 * (1 - (b - px) / release));
        }
      }
    }
  }
}
