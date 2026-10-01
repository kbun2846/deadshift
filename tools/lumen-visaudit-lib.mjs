// Lumen's visibility audit, the pure part (tools/lumen-visaudit.mjs runs it
// over the map; tests/lumen-visaudit.test.js and tests/city-camera.test.js
// use it): a CPU ray caster over the analytic city and the cut's rule
// (world/city-cut.js), so "what the camera can and can't see" is checked
// everywhere, not only where someone looked.
//
// The city as the caster sees it: every building (and ring tower) a prism
// over its footprint (its rooms' and blocked parts' outlines): the first
// floor from the ground to its top (its outer walls and, on top, the
// section cap), the storeys above to the building's top; its outer doorways
// holes in the first floor's outline (the ground to SHELLS.doorHeight). A
// wall has no thickness here: the footprint's outline is the wall's line.
// Along one ray from the camera (a ray lands at one ground point, so the
// rule is the same all along it):
//   - a building's storeys are open where the landing point is in K, or
//     while it is yours (open) or holds the camera (CityCut hide);
//   - a first floor is open above the knee where the landing point is on
//     the fade (by you, or on your room's floor), and has no section cap
//     while it is yours;
//   - a doorway shows the interior only while it is drawn (yours, or you by
//     its door: CityCut interior), else its plug.
// castRay returns the first thing the ray meets: { kind, slot, t } with
// kind 'ground' (open ground or a floor you may see), 'roof' (a building's
// top), 'upper' (a storey's outer wall), 'first' (a first floor's outer
// wall or knee border), 'section' (a section cap), 'own' (inside your
// building, from above), 'peek' (through a doorway into a drawn interior),
// 'plug' (a doorway, dark), 'interior' (inside another building's first
// floor with nothing hiding it: never allowed).
import { CUT, besideYou, convexDistance, insideFootprint } from '../src/world/city-cut.js';
import { buildingOpenings } from '../src/map-kit.js';
import { CAMERA_TILT, OUTDOOR_CAMERA_HEIGHT, interiorCameraHeight, fairFov } from '../src/render/camera-framing.js';
import { isPlayable } from '../src/playable-area.js';
import { ROADS } from '../src/maps/lumen-layout.js';

// The model from built shells (render/city-shells.js CityShells: its slots
// and its cut) and the map: per building its cut record and its outer
// doorways (segments on the footprint's outline, { ax, az, bx, bz }). `wall`:
// half a wall's thickness (the outline is its line), for the knee border.
export function auditModel(shells, map, doorHeight = 2.5, wall = .2) {
  const cut = shells.cut, doors = new Map();
  for (const room of map.buildings) {
    const slot = shells.slots.get(room.group); if (!slot) continue;
    let list = doors.get(slot); if (!list) doors.set(slot, list = []);
    // (the openings' ends, pulled in .1 m by map-kit, put back)
    for (const o of buildingOpenings(room)) if (o.outer && o.a && o.b) {
      const dx = o.b.x - o.a.x, dz = o.b.z - o.a.z, l = Math.hypot(dx, dz) || 1, e = .1 / l;
      list.push({ ax: o.a.x - dx * e, az: o.a.z - dz * e, bx: o.b.x + dx * e, bz: o.b.z + dz * e });
    }
  }
  const entries = cut.buildings.map(b => ({ b, doors: doors.get(b.slot) || [] }));
  return { cut, entries, doorHeight, wall, bySlot: new Map(entries.map(e => [e.b.slot, e])) };
}

// Where the ray o + t d (t >= 0) is over convex polygon `poly` (xz): into
// span [t0, t1]; false if never.
const span = { t0: 0, t1: 0 };
function overPolygon(ox, oz, dx, dz, poly) {
  let area = 0; const n = poly.length;
  for (let i = 0; i < n; i++) { const p = poly[i], q = poly[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
  const s = area > 0 ? 1 : -1;
  let t0 = 0, t1 = Infinity;
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n], ex = q[0] - p[0], ez = q[1] - p[1], len = Math.hypot(ex, ez) || 1;
    const nx = s * ez / len, nz = -s * ex / len, dist = (ox - p[0]) * nx + (oz - p[1]) * nz, rate = dx * nx + dz * nz;
    if (Math.abs(rate) < 1e-12) { if (dist > 0) return false; continue; }
    const t = -dist / rate;
    if (rate < 0) { if (t > t0) t0 = t; } else if (t < t1) t1 = t;
    if (t0 > t1) return false;
  }
  span.t0 = t0; span.t1 = t1;
  return true;
}
// Building b's footprint along the ray: merged spans (rooms side by side are
// one run), into `out` [t0, t1, ...]; returns the count of numbers.
function footprintSpans(b, ox, oz, dx, dz, out) {
  let n = 0;
  for (const poly of b.polygons) {
    if (!overPolygon(ox, oz, dx, dz, poly)) continue;
    out[n++] = span.t0; out[n++] = span.t1;
  }
  if (n <= 2) return n;
  // (sort the pairs by start, merge those that touch)
  const pairs = []; for (let i = 0; i < n; i += 2) pairs.push([out[i], out[i + 1]]);
  pairs.sort((p, q) => p[0] - q[0]);
  let m = 0;
  for (const [a, c] of pairs) {
    if (m && a <= out[m - 1] + 1e-6) out[m - 1] = Math.max(out[m - 1], c);
    else { out[m++] = a; out[m++] = c; }
  }
  return m;
}
const onDoor = (e, x, z) => {
  for (const d of e.doors) {
    const ex = d.bx - d.ax, ez = d.bz - d.az, l2 = ex * ex + ez * ez, t = ((x - d.ax) * ex + (z - d.az) * ez) / l2;
    if (t < 0 || t > 1) continue;
    if (Math.hypot(d.ax + ex * t - x, d.az + ez * t - z) < .05) return true;
  }
  return false;
};

// The first thing the ray from the camera (cut.eye) along (dx, dy, dz)
// meets, up to tMax (a target's parameter; Infinity: the ground). Uses the
// cut's state as it is now (CityCut.update).
const SP = new Float64Array(64), G = { x: 0, z: 0 };
export function castRay(model, dx, dy, dz, tMax = Infinity, hit = {}) {
  const cut = model.cut, e = cut.eye, ox = e.x, oy = e.y, oz = e.z;
  hit.kind = 'sky'; hit.slot = 0; hit.t = Infinity; hit.through = null;
  if (dy >= 0) return hit;
  const tGround = -oy / dy, gx = ox + dx * tGround, gz = oz + dz * tGround;
  // The rule along this ray (world/city-cut.js: K, the fade's knee).
  const inK = cut.on && cut.inK(gx, gz), knee = cut.on ? cut.fadeKnee(gx, gz) : 1e5;
  let best = Math.min(tGround, tMax), kind = tGround <= tMax ? 'ground' : 'target', slot = 0, through = null, throughT = Infinity, throughX = 0, throughZ = 0, kept = false;
  const lx0 = Math.min(ox, gx), lx1 = Math.max(ox, gx), lz0 = Math.min(oz, gz), lz1 = Math.max(oz, gz);
  for (const en of model.entries) {
    const b = en.b;
    if (b.x1 < lx0 || b.x0 > lx1 || b.z1 < lz0 || b.z0 > lz1) continue;
    const n = footprintSpans(b, ox, oz, dx, dz, SP);
    if (!n) continue;
    const own = b.mode === 'open', hide = b.hide > .001 || b.near > .001;
    if (own) {
      // Yours, open: no roof, no storeys, no section cap; its walls stand to
      // the first floor's top (to the knee over your room's floor) and stop
      // a ray coming in through them or going out through them from inside.
      const wall = Math.min(knee, b.upper ? b.floor : b.top);
      for (let i = 0; i < n; i += 2) {
        const t0 = SP[i], t1 = SP[i + 1];
        if (t0 >= best) break;
        const y0 = oy + dy * t0, y1 = oy + dy * t1;
        if (t0 > 1e-9 && y0 <= wall && !(y0 < model.doorHeight && onDoor(en, ox + dx * t0, oz + dz * t0))) { best = t0; kind = 'first'; slot = b.slot; break; }
        if (t1 < best && y1 <= wall && y1 > 0 && !(y1 < model.doorHeight && onDoor(en, ox + dx * t1, oz + dz * t1))) { best = t1; kind = 'first'; slot = b.slot; break; }
      }
      continue;
    }
    // The height the ray must come down to for b to stop it (its opaque top):
    // its storeys are open where the ray lands in K (or it is hidden above
    // its first floor), unless it stands beside you and the ray meets them
    // within CUT.beside.band of your row (CityCut kept).
    const first = b.upper ? b.floor : b.top;
    for (let i = 0; i < n; i += 2) {
      const t0 = SP[i], t1 = SP[i + 1];
      if (t0 >= best) break;
      const yIn = oy + dy * t0, tIn = yIn > b.top ? (oy - b.top) / -dy : t0;
      // Rule 5: within CUT.near.radius m of the camera (horizontally) it is
      // drawn only up to its near height (under its lid); the ray is there
      // until tNear.
      const hNear = cut.hideAt(b, b.near >= .999 ? 1 : b.near), dxz = Math.hypot(dx, dz), tNear = b.near > .001 ? CUT.near.radius / dxz : -1;
      const upperOpen = !b.upper || b.hide >= .999 || (inK && !cut.kept(b, oz + dz * tIn));
      let top = upperOpen ? first : Math.min(b.top, cut.hideAt(b));
      if (!upperOpen && hNear < top) {
        // (a ray going down: still near the camera where it comes down to hNear? then hNear is its top there)
        const tH = (oy - hNear) / -dy;
        if (Math.max(t0, tH) <= tNear) top = hNear;
      }
      // The camera inside its footprint under that top, or the ray coming in
      // through its wall where rule 5 hides it (within CUT.near.radius of the
      // camera, over hNear): from inside its walls face away (not drawn), so
      // only what faces up stops the ray: its lid (coming down) or its
      // section cap.
      const inside = t0 <= 1e-9 && oy < top, through5 = !inside && !upperOpen && t0 <= tNear && yIn > hNear;
      if (inside || through5) { top = !upperOpen && b.near > .001 && b.near < .999 ? hNear : first; }
      if (top === hNear && b.near >= .999) top = first; // (no lid at the end: the section cap)
      if (upperOpen && knee < first) top = knee;
      const tTop = (oy - top) / -dy;
      // Storeys the ray passes through open (for "nothing beside you is cut").
      if (b.upper && upperOpen && !hide) {
        const yOut = oy + dy * t1;
        if (yIn > b.floor + CUT.above && yOut < b.top && tIn < throughT) { through = b; throughT = tIn; throughX = ox + dx * tIn; throughZ = oz + dz * tIn; }
      }
      const t = Math.max(t0, tTop);
      if (t > t1 || t >= best) continue;
      const y = oy + dy * t;
      let k;
      if (t <= t0 + 1e-9 && t0 > 1e-9 && !through5) {
        // Through its outline: a wall, or one of its doorways.
        const x = ox + dx * t, z = oz + dz * t;
        if (y < model.doorHeight && onDoor(en, x, z)) k = b.interior ? 'peek' : 'plug';
        else k = y > first + CUT.above ? 'upper' : 'first';
      } else if (!upperOpen && top > first + CUT.above) k = 'roof';
      else if (top === first && !(knee < first)) k = 'section';
      else {
        // In through the see-through first floor's top: inside it, unless
        // within its wall's thickness of its outline (the knee border's top).
        const x = ox + dx * t, z = oz + dz * t;
        let inner = -Infinity; for (const poly of b.polygons) inner = Math.max(inner, convexDistance(poly, x, z));
        k = inner < model.wall ? 'first' : 'interior';
      }
      best = t; kind = k; slot = b.slot; kept = inK && !upperOpen && b.upper && !hide;
    }
  }
  hit.kind = kind; hit.slot = slot; hit.t = best; hit.through = throughT < best ? through : null; hit.tx = throughX; hit.tz = throughZ; hit.gx = gx; hit.gz = gz; hit.inK = inK; hit.knee = knee; hit.kept = kept;
  return hit;
}
// Can the camera see the point (x, y, z)? The ray's first hit, if it is not.
export function blockedAt(model, x, y, z, hit = {}) {
  const e = model.cut.eye, dx = x - e.x, dy = y - e.y, dz = z - e.z;
  castRay(model, dx, dy, dz, 1 - 1e-6, hit);
  return hit.kind === 'target' || (hit.kind === 'ground' && y < .02) ? null : hit;
}

// A perspective camera's rays: `cols` x `rows` directions over its view
// (eye at cut.eye looking at (fx, 0, fz), vertical fov in degrees, aspect),
// into `out` (flat dx, dy, dz). Allocation-free with a reused out.
export function viewRays(eye, fx, fy, fz, fov, aspect, cols, rows, out = new Float64Array(cols * rows * 3)) {
  let wx = fx - eye.x, wy = fy - eye.y, wz = fz - eye.z; const wl = Math.hypot(wx, wy, wz); wx /= wl; wy /= wl; wz /= wl;
  // right = forward x up(0,1,0), up' = right x forward
  let rx = -wz, ry = 0, rz = wx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  const ux = ry * wz - rz * wy, uy = rz * wx - rx * wz, uz = rx * wy - ry * wx;
  const th = Math.tan(fov * Math.PI / 360), tw = th * aspect;
  let k = 0;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const sx = ((i + .5) / cols * 2 - 1) * tw, sy = (1 - (j + .5) / rows * 2) * th;
    out[k++] = wx + rx * sx + ux * sy; out[k++] = wy + ry * sx + uy * sy; out[k++] = wz + rz * sx + uz * sy;
  }
  return out;
}

// One camera position's audit: the view's rays (a grid) checked against
// the rule's promises, and the targets (your body, your room's floor).
//   (a) K: a ray landing in K is never stopped by a storey (only a first
//       floor, a section cap, or you by what stands on the ground), but
//       one of a building beside you within CUT.beside.band of your row
//       (counted: `kept`);
//   (b) nothing inside another building's first floor is ever reached
//       ('interior'); a doorway shows only a drawn interior;
//   (c) no ray reaches the ground through a standing building's storeys
//       (see-through) outside K (a hidden storey: yours, or one holding
//       the camera, is its own case: `hidden`);
//   (d) no storey of a building beside you (in your row, within 9 m) is
//       cut where it stands beside you: within `row` m of your row (a
//       corner of it south of you, between the camera and K, may go).
//       Outdoors (ctx.inside false): inside, K is your room.
// Returns counts and the first few examples of each.
export function auditView(model, rays, player, ctx = {}, row = 1.5) {
  const r = { rays: 0, inK: 0, kept: 0, a: 0, b: 0, c: 0, d: 0, examples: [] }, hit = {};
  const note = (what, h) => { if (r.examples.length < 6 && (!ctx.only || what === ctx.only)) r.examples.push(`${what} ${ctx.label || ''} slot ${h.slot} ${h.kind} at ${h.gx?.toFixed(1)},${h.gz?.toFixed(1)}`); };
  for (let k = 0; k < rays.length; k += 3) {
    castRay(model, rays[k], rays[k + 1], rays[k + 2], Infinity, hit);
    if (hit.kind === 'sky') continue;
    r.rays++;
    if (hit.inK) { r.inK++; if (hit.kept) r.kept++; else if (hit.kind === 'roof' || hit.kind === 'upper') { r.a++; note('(a)', hit); } }
    if (hit.kind === 'interior') { r.b++; note('(b)', hit); }
    if (hit.kind === 'ground' && !hit.inK && hit.through && hit.through.hide <= .001) { r.c++; note('(c)', hit); }
    if (player && !ctx.inside && hit.through && Math.abs(hit.tz - player.z) < row && besideYou(hit.through, player.x, player.z)) { r.d++; note('(d)', { ...hit, slot: hit.through.slot }); }
  }
  return r;
}

// Where you can stand on the roads: [label, x, z] every `step` m along each
// road's centre line and sidewalks (both ways are the same positions).
export function roadSpots(map, cut, step = 2) {
  const out = [];
  for (const r of ROADS) for (const o of [0, r.width / 2 + r.sidewalk / 2, -(r.width / 2 + r.sidewalk / 2)]) {
    let ax, az, bx, bz;
    if (r.axis === 'x') [ax, az, bx, bz] = [r.from, r.centre + o, r.to, r.centre + o];
    else if (r.axis === 'z') [ax, az, bx, bz] = [r.centre + o, r.from, r.centre + o, r.to];
    else { const [px, pz] = r.a, [qx, qz] = r.b, l = Math.hypot(qx - px, qz - pz), nx = -(qz - pz) / l, nz = (qx - px) / l; [ax, az, bx, bz] = [px + nx * o, pz + nz * o, qx + nx * o, qz + nz * o]; }
    const len = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d <= len; d += step) {
      const x = ax + (bx - ax) * d / len, z = az + (bz - az) * d / len;
      if (!isPlayable(map, x, z, .4) || cut.buildings.some(b => insideFootprint(b, x, z, .45))) continue;
      out.push([`${r.id}${o ? (o > 0 ? '+' : '-') : ''} ${x.toFixed(1)},${z.toFixed(1)}`, x, z]);
    }
  }
  return out;
}
// The cut and the interiors as the game has them for you at (x, z)
// (outdoors: inside = -1), the camera at `eye`; settled (1 s of updates).
export function settle(shells, cut, eye, player, inside = -1, room = null) {
  for (let i = 0; i < 4; i++) cut.update(.25, eye, player, [], inside, room);
  const reach = 1.5 * 1.5;
  for (const e of shells.interiorList) {
    const b = cut.bySlot.get(e.slot);
    b.interior = b.mode === 'open' || (inside < 0 && !!player && e.doors.some(d => (d.x - player.x) ** 2 + (d.z - player.z) ** 2 < reach));
  }
}
// Outdoors at (x, z): the settled city camera for a screen of this aspect.
export function outdoorEye(camera, x, z) {
  const fx = camera.focusX(x, z), H = OUTDOOR_CAMERA_HEIGHT;
  return { eye: { x: fx, y: H, z: z + H * CAMERA_TILT }, fx, fz: z };
}
// Inside `room`, standing at (px, pz): the room camera (renderer.js).
export function roomEye(room, px, pz, aspect) {
  const h = interiorCameraHeight(room, aspect, fairFov(aspect)), follow = !!room.followCamera;
  const fx = follow ? px : room.x, fz = follow ? pz : room.z;
  return { eye: { x: fx, y: h + (room.baseY || 0), z: fz + h * CAMERA_TILT }, fx, fz, follow };
}
const outline = r => r.quad || [[r.x - r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z + r.d / 2], [r.x - r.w / 2, r.z + r.d / 2]];
// Your room's floor points: every .5 m, `inset` m in from its walls.
export function floorPoints(room, inset = .3) {
  const poly = outline(room), pts = [], box = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, polygons: [poly] };
  for (const [x, z] of poly) { box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.z0 = Math.min(box.z0, z); box.z1 = Math.max(box.z1, z); }
  for (let x = box.x0 + inset; x <= box.x1 - inset + 1e-9; x += .5) for (let z = box.z0 + inset; z <= box.z1 - inset + 1e-9; z += .5) if (insideFootprint(box, x, z, -inset)) pts.push([x, z]);
  return pts;
}
export function roomStands(room) {
  const poly = outline(room), cx = poly.reduce((q, p) => q + p[0], 0) / poly.length, cz = poly.reduce((q, p) => q + p[1], 0) / poly.length;
  return [[cx, cz], ...poly.map(([x, z]) => [x + (cx - x) * .25, z + (cz - z) * .25])];
}

