// Lumen's cut (AGENTS.md > Lumen > "What the camera can and can't see"):
// what of the city's buildings the camera draws. View-only and per client:
// no simulation, no network. Pure JS (no three.js), tested on its own
// (tests/city-cut.test.js) and by the visibility audit
// (tools/lumen-visaudit-lib.mjs, tests/lumen-visaudit.test.js); CUT_GLSL is
// mirrored line for line by CityCut's landing / inK / fadeKnee / hidden.
//
// THE RULE (owner, 2026-09-30: "the logic of what you can and can't see
// should be better ... the whole building shown and then when I approach it
// from the right it all goes away is unrealistic"; "when the camera is
// blocked by a building it shouldn't show any of the interior of its first
// floor"; "a player pressed against a first-floor wall ... that wall
// transparent down a bit, a low border"). One rule, per pixel: no building
// is lowered for you or for anyone you look at, no wall top chases the
// camera (only the camera itself, coming into a building, takes the part of
// it round it down: 5).
//
// K, the keep-visible region, is a set of ground points (world xz):
//   - outdoors: open ground (outside every footprint, CUT.mask.grow m
//     clear of it: footprintMask) within CUT.you m of you, and within
//     CUT.others.radius m of up to CUT.others.count others the view draws on
//     your screen near you (each disc keeps its player while it qualifies,
//     holds CUT.others.hold s when it stops, and grows and shrinks over
//     CUT.ease s);
//   - inside: your room's floor (its outline grown CUT.roomGrow m), the first
//     CUT.door.depth m outside each of its outer doorways, and the disc.
// A fragment's landing point is where the main camera's ray through it
// meets the ground (y = 0; from cutEye, the camera, so the wet mirror's pass
// agrees; the shadow pass never cuts: buildings keep casting their shadows).
//   1. Cutaway: a fragment of a building above its first floor (over that
//      top + CUT.above) whose landing point is in K is not drawn. A clean
//      hole that follows you; a building beside you never qualifies (its
//      rays land inside its own footprint), and where one would (round its
//      end, just ahead of you) it is kept within CUT.beside.band m of your
//      row (row 0 y 2).
//   2. Solid section: every building has a dark section cap over its
//      footprint just over its first floor's walls (render/city-shells.js,
//      role `section`), never cut by 1: into a cutaway you see a solid block
//      top, never its first floor's inside.
//   3. See-through first floor: a first-floor fragment (a wall, its facade
//      parts, the section cap, of any building) above CUT.knee whose landing
//      point is on open ground within CUT.fade m of you is not drawn (inside:
//      above CUT.roomKnee where it lands on your room's floor, CUT.roomInset
//      m in from its walls): the wall hiding you goes see-through down to a
//      low border. Colliders unchanged.
//   4. Your building (inside): everything above its first floor goes and its
//      section cap with it (open), easing over CUT.ease s; leaving, the cap
//      is back at once and the storeys rise over CUT.ease s, facade and all.
//   5. The camera inside a building (its footprint grown CUT.near.margin m,
//      under its top): what of it stands within CUT.near.radius m of the
//      camera is drawn to its first floor (its section cap on top; from
//      inside, its walls face away anyway, but what hangs on them would
//      float). Coming up to one (the city camera passes over a tall building
//      south of you; walking along a street north of one it comes in through
//      a side wall), from CUT.near.reach m off its footprint that part is
//      drawn only up to a height that comes down with the distance, from the
//      camera's height to the first floor, under a dark lid
//      (render/city-shells.js, role `lid`): no wall the camera is about to
//      pass through fills the screen and then vanishes; it goes as the
//      camera comes, and comes back as it leaves. Row 2 x.
// Interiors (render/city-shells.js): yours, and one within
// SHELLS.interiorReach of whose outer door you stand; never another's.
export const CUT = Object.freeze({
  you: 6,       // R1: m round you, open ground: nothing above a first floor hides it
  // Beside you (owner: "walking side to side or forward nothing beside you
  // changes"): a building in your row within `side` m of you (besideYou) is
  // never cut within `band` m of your row, even where a line to K crosses
  // it (round its corner, just ahead of you).
  beside: Object.freeze({ side: 9, band: 1.5 }),
  fade: 1.6,    // R3: m round you where a first floor in the way goes see-through
  knee: .7,     // m: the low border a see-through first floor keeps (outdoors; inside ROOM_VIEW.knee)
  roomKnee: 1,  // m: inside, over your room's floor (render/city-shells.js ROOM_VIEW.knee)
  others: Object.freeze({ radius: 3, count: 3, reach: 20, screen: Object.freeze([19, 13]), hold: .4 }),
  ease: .15,    // s: a disc grows or shrinks; your building opens or comes back
  // Inside: outside each outer doorway of your room (m out, m either side of it; up to `max` doors)
  door: Object.freeze({ depth: 2.5, side: .3, back: .3, max: 8 }),
  roomGrow: .15, // m: your room's outline grown (ROOM_VIEW.grow): K's room
  roomInset: .17, // m inside your room's outline its floor starts (a wall's inner face): what goes see-through over it
  above: .04,   // m over its first floor's top a fragment counts as above it (over the section cap: render/city-shells.js SHELLS.section)
  // Rule 5 (the camera coming up to a building, and in it): `reach` m from
  // its footprint grown `margin` m it starts to come down; only within
  // `radius` m of the camera (round it, not the whole building: from a
  // courtyard, the wings you face stand).
  near: Object.freeze({ reach: 4, margin: .3, radius: 5 }),
  // The footprint mask: `cell` m texels, footprints grown `grow` m (past a
  // wall's outer face: a ray landing at a wall's foot is never "open"), a
  // signed distance clamped at `range` m (bilinear filtering keeps the edge
  // exact between texels), `margin` m round the city.
  mask: Object.freeze({ cell: .5, grow: .3, range: 1.5, margin: 4 }),
});

// The cut stamp every shell vertex carries (render/city-shells.js,
// render/city-facades.js): slot x CUT_ROLES + role. Slot 0: no building
// (interior floors). Roles: 0 a first floor (a wall, its facade parts), 1 an
// upper wall, 2 a cap (the roof), 3 dressing above the first floor, 4 an
// outer doorway's plug (drawn only while its building's interior is hidden),
// 5 a lintel over a doorway (gone where the room's knee-wall view lowers its
// wall), 6 the section cap, 7 the lid (rule 5: the section cap's twin, at
// the height its building is drawn up to while that is coming down or going
// up; gone otherwise). Stamp -1: never cut (the furniture). A role changes
// nothing but these: which fragments are cut is the rule above.
export const CUT_ROLES = 8;
export const CUT_ROLE = Object.freeze({ fixed: 0, upper: 1, cap: 2, dressing: 3, plug: 4, lintel: 5, section: 6, lid: 7 });
export const cutStamp = (slot, role) => slot * CUT_ROLES + role;
export const STANDING = 'standing', OPEN = 'open';

const f = v => Number(v).toFixed(4);
// The rule in GLSL (the shells' fragment shader and their black twin's; the
// signs', screens', halos' and pools' vertex shaders, per piece centre). The
// cut table (city.cutTexture, one texel a slot), row 0: x how far it is
// hidden from the top down (0..1: yours opening, cityHideHeight), y its
// section cap gone (1: yours, open) or beside you (2), z the first floor's
// top, w the top; row 1 x: its doorways plugged; row 2 x: how far it is
// hidden near the camera (rule 5, within CUT.near.radius m of it).
export const CUT_GLSL = `
uniform vec4 cutEye;          // the main camera: x, y, z; w 1 while the cut is on
uniform vec4 cutTargets[4];   // K's discs: x, z, radius, fade radius (0 yours)
uniform float cityRoomQuad[8]; // inside: your room's outline, grown (ROOM_VIEW)
uniform float cityRoomOn;
uniform vec4 cityDoors[${CUT.door.max}];   // inside: each outer doorway: middle x, z, its outward normal's angle, half width
uniform float cityDoorCount;
uniform sampler2D cityFootMask; // footprints (grown): > .5 inside
uniform vec4 cityFootBox;       // the mask's x0, z0, 1 / its width, 1 / its depth (m)
// Where the main camera's ray through p meets the ground (false: p is not under the camera).
bool cityLanding(vec3 p, out vec2 g) {
  float h = cutEye.y - p.y;
  g = vec2(0.0);
  if (h < .01) return false;
  g = cutEye.xz + (p.xz - cutEye.xz) * (cutEye.y / h);
  return true;
}
bool cityOpenGround(vec2 g) {
  vec2 uv = (g - cityFootBox.xy) * cityFootBox.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return true;
  return textureLod(cityFootMask, uv, 0.0).r < .5;
}
// How far g stands inside your room's (grown) outline (negative: outside).
float cityRoomDepth(vec2 g) {
  float area = 0.0, d = 1e5;
  for (int i = 0; i < 4; i++) { int j = i == 3 ? 0 : i + 1; area += cityRoomQuad[i * 2] * cityRoomQuad[j * 2 + 1] - cityRoomQuad[j * 2] * cityRoomQuad[i * 2 + 1]; }
  for (int i = 0; i < 4; i++) {
    int j = i == 3 ? 0 : i + 1;
    vec2 a = vec2(cityRoomQuad[i * 2], cityRoomQuad[i * 2 + 1]), e = vec2(cityRoomQuad[j * 2], cityRoomQuad[j * 2 + 1]) - a;
    d = min(d, sign(area) * (e.x * (g.y - a.y) - e.y * (g.x - a.x)) / max(length(e), 1e-4));
  }
  return d;
}
bool cityInK(vec2 g) {
  bool disc = false;
  for (int i = 0; i < 4; i++) { vec4 t = cutTargets[i]; vec2 d = g - t.xy; if (dot(d, d) < t.z * t.z) disc = true; }
  if (disc && cityOpenGround(g)) return true;
  if (cityRoomOn < .5) return false;
  if (cityRoomDepth(g) >= 0.0) return true;
  for (int i = 0; i < ${CUT.door.max}; i++) {
    if (float(i) >= cityDoorCount) break;
    vec4 d = cityDoors[i];
    vec2 n = vec2(cos(d.z), sin(d.z)), q = g - d.xy;
    float out_ = dot(q, n), along = n.x * q.y - n.y * q.x;
    if (out_ > ${f(-CUT.door.back)} && out_ < ${f(CUT.door.depth)} && abs(along) < d.w) return true;
  }
  return false;
}
// The knee a first-floor fragment landing at g keeps (a big number: not see-through).
float cityFadeKnee(vec2 g) {
  if (cityRoomOn > .5 && cityRoomDepth(g) >= ${f(CUT.roomGrow + CUT.roomInset)}) return ${f(CUT.roomKnee)};
  vec4 t = cutTargets[0];
  vec2 d = g - t.xy;
  if (dot(d, d) < t.w * t.w && cityOpenGround(g)) return ${f(CUT.knee)};
  return 1e5;
}
// The height above which a building is not drawn, hidden x (0..1) of the
// way from 3 m over its top to just over its first floor (row: its row 0).
float cityHideHeight(vec4 row, float x) { return x > .001 ? mix(row.w + 3.0, row.z + ${f(CUT.above)}, x) : 1e5; }
// A fragment at p of a building: firstTop = its first floor's top (1e5: it
// has no storey above it), hide = the height above which it is not drawn
// (yours, open), near = that height within CUT.near.radius m of the camera
// (rule 5), beside = 1 beside you.
bool cityHidden(vec3 p, float firstTop, float hide, float beside, float near) {
  if (p.y > hide) return true;
  if (p.y > near) { vec2 e = p.xz - cutEye.xz; if (dot(e, e) < ${f(CUT.near.radius * CUT.near.radius)}) return true; }
  if (cutEye.w < .5) return false;
  vec2 g;
  if (!cityLanding(p, g)) return false;
  if (p.y > firstTop + ${f(CUT.above)}) return cityInK(g) && !(beside > .5 && abs(p.z - cutTargets[0].y) < ${f(CUT.beside.band)});
  return p.y > cityFadeKnee(g);
}
// A piece (a sign, a screen, a halo, a pool) whose centre is p, on the
// building whose cut rows are row (0) and near (row 2 x): the same rule at
// its centre (whole pieces).
bool cityPieceHidden(vec4 row, float near, vec3 p) {
  return cityHidden(p, row.w > row.z + .05 ? row.z : 1e5, cityHideHeight(row, row.x), row.y > 1.5 ? 1.0 : 0.0, cityHideHeight(row, near));
}
`;
export const SCOOP_GLSL = CUT_GLSL; // (the old name, still imported by city-signs.js)

// The uniforms CUT_GLSL reads, made on the hub's uniforms once (the shells
// fill them each frame; the signs share the same objects).
export function cutUniforms(u = {}) {
  u.cutEye ||= { value: new Float32Array(4) };
  if (!(u.cutEye.value instanceof Float32Array) || u.cutEye.value.length < 4) u.cutEye.value = new Float32Array(4);
  u.cutTargets ||= { value: new Float32Array(16) };
  u.cityRoomQuad ||= { value: new Float32Array(8) };
  u.cityRoomOn ||= { value: 0 };
  u.cityDoors ||= { value: new Float32Array(CUT.door.max * 4) };
  u.cityDoorCount ||= { value: 0 };
  u.cityFootMask ||= { value: null };
  u.cityFootBox ||= { value: new Float32Array([0, 0, 1, 1]) };
  return { cutEye: u.cutEye, cutTargets: u.cutTargets, cityRoomQuad: u.cityRoomQuad, cityRoomOn: u.cityRoomOn, cityDoors: u.cityDoors, cityDoorCount: u.cityDoorCount, cityFootMask: u.cityFootMask, cityFootBox: u.cityFootBox };
}

// An eased amount (0..1, linear in time) as drawn: smooth at both ends.
export const shape = u => u * u * (3 - 2 * u);
const ease = (value, target, step) => target > value ? Math.min(target, value + step) : Math.max(target, value - step);

// One building as the cut sees it: slot (its column in the table), polygons
// (its rooms' and blocked parts' outlines, convex, [[x, z], ...]), top (its
// shell's height), floor (the first floor's height), bounds.
export function cutBuilding(slot, polygons, top, floor) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of polygons) for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { slot, polygons, top, floor, x0, z0, x1, z1, upper: top > floor + .05,
    mode: STANDING, open: 0, hide: 0, near: 0, section: 0, beside: false, interior: false };
}

// Signed distance from (x, z) to convex polygon `poly`'s outline, positive
// inside: the nearest edge's line inside, the farthest edge line outside (a
// mitred outline grown or shrunk: pointInConvex's convention).
export function convexDistance(poly, x, z) {
  let area = 0; const n = poly.length;
  for (let i = 0; i < n; i++) { const p = poly[i], q = poly[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
  const s = area > 0 ? 1 : -1;
  let d = Infinity;
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n], ex = q[0] - p[0], ez = q[1] - p[1], len = Math.hypot(ex, ez) || 1;
    d = Math.min(d, -((x - p[0]) * (s * ez / len) + (z - p[1]) * (-s * ex / len)));
  }
  return d;
}
function pointInConvex(poly, x, z, grow) { return convexDistance(poly, x, z) >= -grow; }
export function insideFootprint(b, x, z, grow = 0) {
  if (x < b.x0 - grow || x > b.x1 + grow || z < b.z0 - grow || z > b.z1 + grow) return false;
  for (const poly of b.polygons) if (pointInConvex(poly, x, z, grow)) return true;
  return false;
}

// The footprint mask (CUT.mask): an R8 grid over the city, each texel the
// signed distance (clamped to +-range, .5 on the outline) to the union of
// every footprint grown `grow` m; > .5 inside. Built once at load (the
// shells make it a texture, cityFootMask; maskAt reads it as the GPU's
// bilinear filter does). Returns { data, w, h, x0, z0, cell }.
export function footprintMask(buildings, o = CUT.mask) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const b of buildings) { x0 = Math.min(x0, b.x0); z0 = Math.min(z0, b.z0); x1 = Math.max(x1, b.x1); z1 = Math.max(z1, b.z1); }
  if (!Number.isFinite(x0)) { x0 = z0 = -1; x1 = z1 = 1; }
  const cell = o.cell, m = o.margin + o.grow + o.range;
  x0 = Math.floor((x0 - m) / cell) * cell; z0 = Math.floor((z0 - m) / cell) * cell;
  const w = Math.ceil((x1 + m - x0) / cell), h = Math.ceil((z1 + m - z0) / cell), data = new Uint8Array(w * h);
  const reach = o.grow + o.range;
  for (const b of buildings) for (const poly of b.polygons) {
    let px0 = Infinity, pz0 = Infinity, px1 = -Infinity, pz1 = -Infinity;
    for (const [x, z] of poly) { px0 = Math.min(px0, x); px1 = Math.max(px1, x); pz0 = Math.min(pz0, z); pz1 = Math.max(pz1, z); }
    const i0 = Math.max(0, Math.floor((px0 - reach - x0) / cell)), i1 = Math.min(w - 1, Math.ceil((px1 + reach - x0) / cell));
    const j0 = Math.max(0, Math.floor((pz0 - reach - z0) / cell)), j1 = Math.min(h - 1, Math.ceil((pz1 + reach - z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = convexDistance(poly, x0 + (i + .5) * cell, z0 + (j + .5) * cell) + o.grow;
      const v = Math.round(255 * Math.min(1, Math.max(0, .5 + d / (2 * o.range)))), k = j * w + i;
      if (v > data[k]) data[k] = v;
    }
  }
  return { data, w, h, x0, z0, cell };
}
// The mask at (x, z), 0..1, as the GPU's linear filter reads it (texel
// centres, clamped at the edges); 0 (open) off the mask.
export function maskAt(mask, x, z) {
  const W = mask.w * mask.cell, H = mask.h * mask.cell;
  if (x < mask.x0 || z < mask.z0 || x > mask.x0 + W || z > mask.z0 + H) return 0;
  const u = (x - mask.x0) / mask.cell - .5, v = (z - mask.z0) / mask.cell - .5;
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const at = (a, b) => mask.data[Math.min(mask.h - 1, Math.max(0, b)) * mask.w + Math.min(mask.w - 1, Math.max(0, a))] / 255;
  return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv;
}

// Rule 5: how far building b is hidden (0..1, as CityCut hide: the height
// above which it is not drawn is mix(top + 3, floor + CUT.above, hide)) for
// the camera at `eye` under its top: 1 inside its footprint (grown
// CUT.near.margin), 0 CUT.near.reach m or more from it, and between, the
// height coming down linearly from the camera's to the first floor's.
export function nearHide(b, eye) {
  const { reach, margin } = CUT.near;
  if (eye.x < b.x0 - reach - margin || eye.x > b.x1 + reach + margin || eye.z < b.z0 - reach - margin || eye.z > b.z1 + reach + margin) return 0;
  let inside = -Infinity;
  for (const poly of b.polygons) inside = Math.max(inside, convexDistance(poly, eye.x, eye.z));
  const away = -inside - margin; // (m outside the grown footprint)
  if (away <= 0) return 1;
  if (away >= reach) return 0;
  const lo = b.floor + CUT.above, hi = Math.min(b.top + 3, eye.y), h = lo + (hi - lo) * away / reach;
  return Math.min(1, Math.max(0, (b.top + 3 - h) / (b.top + 3 - lo)));
}

// Does building b stand beside (x, z): in its row (z), within `side` m of it?
// (The city camera keeps off those, world/city-camera.js; the audit checks
// none of them is ever cut.)
export function besideYou(b, x, z, side = CUT.beside.side) {
  if (z < b.z0 || z > b.z1 || x < b.x0 - side || x > b.x1 + side) return false;
  for (const poly of b.polygons) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0, n = poly.length; i < n; i++) {
      const az = poly[i][1], bz = poly[(i + 1) % n][1];
      if ((az - z) * (bz - z) > 0 || az === bz) continue;
      const cx = poly[i][0] + (poly[(i + 1) % n][0] - poly[i][0]) * (z - az) / (bz - az);
      lo = Math.min(lo, cx); hi = Math.max(hi, cx);
    }
    if (lo <= hi && (x < lo ? lo - x : x > hi ? x - hi : 0) < side) return true;
  }
  return false;
}

// Your room for the cut (inside): its outline grown CUT.roomGrow m (four xz
// corners, flat: ROOM_VIEW's uniform) and its outer doorways (`openings`:
// map-kit.js buildingOpenings(room)) as { x, z (middle), angle (its
// outward normal's), half (half width + CUT.door.side) }. Made once a room.
export function roomView(room, openings = []) {
  const quad = new Float32Array(8), g = CUT.roomGrow;
  let cx = 0, cz = 0;
  if (room.quad) {
    for (const [x, z] of room.quad) { cx += x / 4; cz += z / 4; }
    for (let i = 0; i < 4; i++) { const [x, z] = room.quad[i], dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1; quad[i * 2] = x + dx / l * g; quad[i * 2 + 1] = z + dz / l * g; }
  } else {
    cx = room.x; cz = room.z;
    const a = room.angle || 0, c = Math.cos(a), sn = Math.sin(a), hw = room.w / 2 + g, hd = room.d / 2 + g, corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    for (let i = 0; i < 4; i++) { const [lx, lz] = corners[i]; quad[i * 2] = room.x + lx * c + lz * sn; quad[i * 2 + 1] = room.z - lx * sn + lz * c; }
  }
  const doors = [];
  for (const o of openings) {
    if (!o.outer || !o.a || !o.b || doors.length >= CUT.door.max) continue;
    const mx = (o.a.x + o.b.x) / 2, mz = (o.a.z + o.b.z) / 2, l = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) || 1;
    let nx = -(o.b.z - o.a.z) / l, nz = (o.b.x - o.a.x) / l;
    if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
    doors.push({ x: mx, z: mz, angle: Math.atan2(nz, nx), half: l / 2 + .1 + CUT.door.side });
  }
  return { room, quad, doors };
}
// How far (x, z) stands inside the four-point outline `q` (flat; negative
// outside): cityRoomDepth, line for line.
export function quadDepth(q, x, z) {
  let area = 0, d = 1e5;
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; area += q[i * 2] * q[j * 2 + 1] - q[j * 2] * q[i * 2 + 1]; }
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, ax = q[i * 2], az = q[i * 2 + 1], ex = q[j * 2] - ax, ez = q[j * 2 + 1] - az;
    d = Math.min(d, Math.sign(area) * (ex * (z - az) - ez * (x - ax)) / Math.max(Math.hypot(ex, ez), 1e-4));
  }
  return d;
}

export class CityCut {
  constructor(buildings, mask = footprintMask(buildings)) {
    this.buildings = buildings;
    this.bySlot = new Map(buildings.map(b => [b.slot, b]));
    this.mask = mask;
    this.eye = { x: 0, y: 30, z: 0 }; this.on = true;
    // K's discs: 0 yours, 1..3 others' (`who` the position object a disc
    // follows: sticky, so a disc never jumps from one player to another).
    this.discs = [];
    for (let k = 0; k <= CUT.others.count; k++) this.discs.push({ x: 0, z: 0, strength: 0, want: 0, clear: 0, who: null, radius: 0, fade: 0 });
    this.pick = []; this.from = { x: 0, z: 0 };
    this.nearer = (a, b) => ((a.x - this.from.x) ** 2 + (a.z - this.from.z) ** 2) - ((b.x - this.from.x) ** 2 + (b.z - this.from.z) ** 2);
    this.room = null; // roomView(...) while you are inside
    this.inside = -1; // (whereIs)
    this.g = { x: 0, z: 0 }; // (reused) a landing point
  }

  // The building you are in (its slot, or -1): your room's (roomSlot), or,
  // while you still stand on the footprint of the one you were in (a
  // doorway between two of its rooms, the frame of its outer door), that one.
  whereIs(roomSlot, player) {
    if (roomSlot < 0) { const was = this.bySlot.get(this.inside); roomSlot = was && player && insideFootprint(was, player.x, player.z, .02) ? this.inside : -1; }
    return (this.inside = roomSlot);
  }

  // camera {x, y, z}: the main camera now; player {x, z} or null (not
  // drawn); others [{x, z}]; inside: the slot of the building you are in, or
  // -1; room: roomView(...) of your room while inside, else null. dt in s.
  update(dt, camera, player, others, inside = -1, room = null) {
    const step = dt / CUT.ease;
    this.eye.x = camera.x; this.eye.y = camera.y; this.eye.z = camera.z;
    this.room = inside >= 0 ? room : null;
    this.assign(dt, camera, player, others);
    for (let k = 0; k < this.discs.length; k++) {
      const d = this.discs[k], s = shape(d.strength);
      d.radius = (k ? CUT.others.radius : CUT.you) * s; d.fade = k ? 0 : CUT.fade * s;
    }
    for (const b of this.buildings) {
      const open = b.slot === inside;
      b.mode = open ? OPEN : STANDING;
      b.open = ease(b.open, open ? 1 : 0, step);
      b.hide = shape(b.open);
      b.near = !open && b.upper && camera.y < b.top ? nearHide(b, camera) : 0;
      b.section = open ? 1 : 0; // (back the moment you leave: the storeys rise over it)
      b.beside = inside < 0 && !!player && b.upper && besideYou(b, player.x, player.z);
    }
  }

  // Which players K's discs follow this frame, and how strong each is.
  assign(dt, camera, player, others) {
    const discs = this.discs, step = dt / CUT.ease, o = CUT.others;
    const you = discs[0];
    if (player) { you.who = player; you.x = player.x; you.z = player.z; you.want = 1; } else you.want = 0;
    // Others: on your screen (a box round you, else round what the camera
    // looks at), within reach, nearest first. A disc keeps its player while
    // it still qualifies; one gone holds o.hold s where it was, then eases out.
    const pick = this.pick; pick.length = 0;
    this.from.x = player ? player.x : camera.x; this.from.z = player ? player.z : camera.z - camera.y * .35;
    const fx = this.from.x, fz = this.from.z;
    for (const p of others || []) {
      if (!p || Math.abs(p.x - fx) > o.screen[0] || Math.abs(p.z - fz) > o.screen[1] || (p.x - fx) ** 2 + (p.z - fz) ** 2 > o.reach * o.reach) continue;
      pick.push(p);
    }
    if (pick.length > 1) pick.sort(this.nearer);
    if (pick.length > o.count) pick.length = o.count;
    for (let k = 1; k < discs.length; k++) {
      const c = discs[k], i = c.who ? pick.indexOf(c.who) : -1;
      if (i >= 0) { c.x = c.who.x; c.z = c.who.z; c.want = 1; c.clear = 0; pick[i] = null; }
      else if (c.who && (c.clear += dt) >= o.hold) c.want = 0;
    }
    for (const p of pick) {
      if (!p) continue;
      let c = null;
      for (let k = 1; k < discs.length; k++) if (!discs[k].who) { c = discs[k]; break; }
      if (!c) break;
      c.who = p; c.x = p.x; c.z = p.z; c.want = 1; c.clear = 0; c.strength = 0;
    }
    for (const c of discs) { c.strength = ease(c.strength, c.want, step); if (!c.want && c.strength <= 0 && c !== discs[0]) c.who = null; }
  }

  // cityLanding: where the camera's ray through (x, y, z) meets the ground,
  // into this.g; false when the point is not under the camera.
  landing(x, y, z, out = this.g) {
    const e = this.eye, h = e.y - y;
    if (h < .01) return false;
    const k = e.y / h;
    out.x = e.x + (x - e.x) * k; out.z = e.z + (z - e.z) * k;
    return true;
  }
  openGround(x, z) { return maskAt(this.mask, x, z) < .5; }
  // cityInK
  inK(x, z) {
    let disc = false;
    for (const d of this.discs) if ((x - d.x) ** 2 + (z - d.z) ** 2 < d.radius * d.radius) { disc = true; break; }
    if (disc && this.openGround(x, z)) return true;
    const r = this.room;
    if (!r) return false;
    if (quadDepth(r.quad, x, z) >= 0) return true;
    for (const d of r.doors) {
      const nx = Math.cos(d.angle), nz = Math.sin(d.angle), qx = x - d.x, qz = z - d.z, out = qx * nx + qz * nz, along = nx * qz - nz * qx;
      if (out > -CUT.door.back && out < CUT.door.depth && Math.abs(along) < d.half) return true;
    }
    return false;
  }
  // cityFadeKnee
  fadeKnee(x, z) {
    if (this.room && quadDepth(this.room.quad, x, z) >= CUT.roomGrow + CUT.roomInset) return CUT.roomKnee;
    const d = this.discs[0];
    if ((x - d.x) ** 2 + (z - d.z) ** 2 < d.fade * d.fade && this.openGround(x, z)) return CUT.knee;
    return 1e5;
  }
  // cityHidden for building b's fragment at (x, y, z) (section: its section cap).
  hidden(b, x, y, z, section = false) {
    if (!section && (y > this.hideAt(b) || this.nearCut(b, x, y, z))) return true;
    if (!this.on || !this.landing(x, y, z)) return false;
    if (!section && b.upper && y > b.floor + CUT.above) return this.inK(this.g.x, this.g.z) && !this.kept(b, z);
    return y > this.fadeKnee(this.g.x, this.g.z);
  }
  // Is building b's storey at z kept for standing beside you (CUT.beside)?
  kept(b, z) { return b.beside && Math.abs(z - this.discs[0].z) < CUT.beside.band; }
  // The height above which building b is not drawn now (row 0 x).
  // cityHideHeight: building b's height above which nothing is drawn (yours,
  // `x` = b.hide), or (x = b.near) near the camera.
  hideAt(b, x = b.hide) { return x > .001 ? b.top + 3 + (b.floor + CUT.above - b.top - 3) * x : 1e5; }
  // Is b's piece at (x, y, z) hidden for the camera near it (rule 5)?
  nearCut(b, x, y, z) { const r = CUT.near.radius; return y > this.hideAt(b, b.near) && (x - this.eye.x) ** 2 + (z - this.eye.z) ** 2 < r * r; }

  // Is a piece whose centre is (x, y, z) on building `slot` out of view now
  // (cityPieceHidden: a sign, a screen, a hologram's projector)? The CPU twin
  // of the signs' cutAway (a light out of view goes out).
  hides(slot, x, y, z) {
    const b = this.bySlot.get(slot);
    if (!b) return false;
    if (y > this.hideAt(b) || this.nearCut(b, x, y, z)) return true;
    if (!this.on || !this.landing(x, y, z)) return false;
    if (b.upper && y > b.floor + CUT.above) return this.inK(this.g.x, this.g.z) && !this.kept(b, z);
    return y > this.fadeKnee(this.g.x, this.g.z);
  }

  // Into the shared uniforms (cutUniforms) and the cut table's rows (data:
  // the texture's floats, `slots` a row): returns whether the table changed.
  pack(u, data, slots) {
    const e = u.cutEye.value; e[0] = this.eye.x; e[1] = this.eye.y; e[2] = this.eye.z; e[3] = this.on ? 1 : 0;
    const t = u.cutTargets.value;
    for (let k = 0; k < 4; k++) { const d = this.discs[k]; t[k * 4] = d ? d.x : 0; t[k * 4 + 1] = d ? d.z : 0; t[k * 4 + 2] = d ? d.radius : 0; t[k * 4 + 3] = d ? d.fade : 0; }
    const r = this.room;
    u.cityRoomOn.value = r ? 1 : 0;
    if (r) {
      u.cityRoomQuad.value.set(r.quad);
      const dv = u.cityDoors.value;
      for (let i = 0; i < r.doors.length; i++) { const d = r.doors[i]; dv[i * 4] = d.x; dv[i * 4 + 1] = d.z; dv[i * 4 + 2] = d.angle; dv[i * 4 + 3] = d.half; }
      u.cityDoorCount.value = r.doors.length;
    } else u.cityDoorCount.value = 0;
    let changed = false;
    if (data) for (const b of this.buildings) {
      const i = b.slot * 4, plug = b.interior ? 0 : 1, j = slots * 4 + i, k = slots * 8 + i;
      if (data[k] !== b.near) { data[k] = b.near; changed = true; }
      const y = b.section || (b.beside ? 2 : 0);
      if (data[i] !== b.hide || data[i + 1] !== y) { data[i] = b.hide; data[i + 1] = y; changed = true; }
      if (data[j] !== plug) { data[j] = plug; changed = true; }
    }
    return changed;
  }
}
