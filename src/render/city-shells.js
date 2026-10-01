// Lumen's building shells (AGENTS.md > Lumen > "What the camera can and
// can't see"). Every city building (map.cityBuildings, its rooms in
// map.buildings by `group`) and every sealed tower (map.solids) is drawn here:
//   - its outer walls: the first floor (it casts the shadows) and the storeys
//     above it up to the top (60 m for a tall shell: past the camera, so only
//     its sides are ever seen);
//   - its inner walls: the first floor only, with their doorways;
//   - its top: a flat cap (a low building's roof; a tall one's, never seen);
//   - its section cap: a dark flat top over its footprint just over its
//     first floor's walls, inside the closed shell, seen only where the cut
//     opens the storeys above it (a solid block top, never the first floor's
//     inside).
// All of it merges into one mesh per 40 m cell on one vertex-coloured
// material. Each vertex carries `cityCut` = cutStamp(slot, role)
// (world/city-cut.js CUT_ROLE). Nothing moves: the fragment shader asks
// world/city-cut.js's rule (CUT_GLSL cityHidden: where the main camera's ray
// through the fragment lands, and whether that is in K) and drops what the
// rule cuts. The cut table (city.cutTexture) says per building what is
// hidden above its first floor (yours, open; one holding the camera), its
// section cap gone (yours) and its doorways plugged. The program never
// changes: the cut costs no compile and no draw.
//
// The facade wash (owner: "where lights and ads are there should be
// good-looking, realistic light that fades smoothly"): bakeLight(emitters),
// once at load, lights the outer faces near every sign, screen and lamp in a
// per-vertex `cityGlow` (the light reaching the wall; the shader adds it times
// the wall's own colour as emitted light, so it is a wash on the wall, never
// a coloured spotlight). Walls near an emitter get finer columns and rows so
// it fades smoothly; nothing else changes, and nothing is done per frame.
//
// The facades (render/city-facades.js, stage 4): every stretch of outer
// wall is recorded as it is planned (its first floor or lintel, its storey,
// its building's look: the look also picks the walls' own colours), then
// dressed with parts in the same vertex format; the parts every preset draws
// merge into the cell meshes, the detail tiers into one more mesh a cell
// (setQuality). The meshes are built once, by bakeLight (with the hub; a bare
// build, a test, builds them at once): the walls used to be built twice.
//
// Interiors (floors, furniture, dressing) are drawn per building, only while
// you are inside it or stand by one of its outer doors (SHELLS.interiorReach:
// the look in through the door); nothing else can see them.
import * as THREE from 'three';
import { buildingOpenings } from '../map-kit.js';
import { CityCut, CUT, CUT_GLSL, CUT_ROLE, CUT_ROLES, OPEN, cutBuilding, cutStamp, cutUniforms, roomView } from '../world/city-cut.js';
import { roomOutline, CITY_FLOOR } from '../world/city-rooms.js';
import { BRIGHT_LAYER, CITY_INTERIORS } from './city-registry.js';
import { FACADES, PartSoup, buildFacades, cameraSpots, concatSoups, faceSeen, facadeLook, towerLook } from './city-facades.js';

export const SHELLS = Object.freeze({
  slots: 128, cell: 40, thickness: .38, doorHeight: 2.5, tallTop: 60,
  // m from an outer door within which you see the building's interior
  // (owner, 2026-09-30: "the buildings should be very logically thought of";
  // another building's inside shows only to someone in its doorway).
  interiorReach: 1.5,
  shroudReach: 40, // m round what the camera looks at: the buildings the shroud leaves clear (exteriorFaces)
  column: 1.5,      // m: the lattice the upper walls' columns and the caps' grid share
  // The section cap (world/city-cut.js rule 2): `lift` m over the first
  // floor's top (over every wall top and anything inside), plus `step` m a
  // slot (mod 8: towers that overlap never share a height).
  section: Object.freeze({ lift: .01, step: .003 }),
  colours: {
    // (the darker night, owner 2026-09-30: inner walls #7a7f88 -> #60646c, lintel, caps, roofs and the sealed a step down)
    outer: '#454850', lower: '#3e4a4c', inner: '#60646c', lintel: '#33363c', cap: '#25272c', roof: '#25272b', floor: '#5a5e66', sealed: '#2e3137',
    plug: '#17191e', // a closed doorway: the dark of an unlit opening
    section: '#26292f', // the section cap: a solid block's dark top
  },
});

// The facade wash (bakeLight). An emitter's light on a wall at distance d:
//   power x (1 - (d / R)^2)^2 / (1 + (d / near)^2)
// (a soft point light that ends smoothly at R = its reach x `reach`), times
// how squarely the wall faces it (wrapped Lambert: a sign's own wall, lit at
// a grazing angle, still takes some) and how far the wall is in front of it
// (full ahead, about half beside, a tenth behind: a sign's back is dark; a
// lamp lights all round). power = the emitter's
// intensity (1 = a street lamp) x its mean level (flicker, blink and signal
// phases averaged at load) x its kind's share x `gain`. Its colour is pulled
// `desaturate` toward grey, and a vertex's sum is held to `max` (luminance)
// and `maxSaturation`, so walls stay neutral-ish under a neon sign (the
// contrast rule: a wash, not a spotlight).
export const WASH = Object.freeze({
  gain: 32, near: 1.6, wrap: .5,
  reach: .8, minReach: 3, maxReach: 7, // m: where an emitter's wash ends (x its reach; past ~5 m it is already faint)
  vertical: 3.5, // m above and below an emitter where its wash on a wall has faded (a row there, and one at its height)
  column: 1.25,  // m: a first-floor wall's columns near an emitter
  desaturate: .4, maxSaturation: .6, max: 8,
  kinds: Object.freeze({ lamp: 1, neon: 1, panel: .7, screen: 1, signal: .45, ped: .25 }),
  omni: Object.freeze(['lamp']),
  samples: 96, // times sampled for a changing emitter's mean level
});

const ROLE = CUT_ROLE, CUT_ROLES_F = CUT_ROLES.toFixed(1);
// Inside a room (owner, 2026-09-29: "since I'm inside it, I can't see the
// whole room... it should all be gone for visibility"): the knee-wall view.
// Every first-floor piece of the room's own walls on an edge the camera
// stands outside of (its middle within ROOM_VIEW.wall of that edge of the
// room's outline, grown ROOM_VIEW.grow: its south wall under the usual
// camera, a side wall under a following one) comes down to ROOM_VIEW.knee,
// whole: a real knee wall with its top; a lintel over a doorway there goes.
// Anything else over the knee whose line from the camera lands on the room's
// floor (a neighbour's first floor, its section cap) is dropped by the rule
// (world/city-cut.js CUT.roomKnee, the same height). So the whole floor
// shows even in a 2 m corridor. The furniture (stamp -1) and the floors
// (under knee height) never move. Only the view: colliders and sight rules
// are the walls'. (A wall piece on the outside of such a wall is kept under
// knee height by tools/lumen-place-detail.mjs onRoomFace.)
export const ROOM_VIEW = Object.freeze({ knee: CUT.roomKnee, grow: CUT.roomGrow, wall: .6 }); // wall: how far off the room's outline a piece's middle still counts as its wall (m)
const ROOM_VIEW_GLSL = `
// Is a first-floor piece anchored at a (its middle) one of the room's walls
// on an edge the camera stands outside of?
bool cityRoomKnee(vec2 a) {
  if (cityRoomOn < .5) return false;
  vec2 c = vec2(0.0);
  for (int i = 0; i < 4; i++) c += vec2(cityRoomQuad[i * 2], cityRoomQuad[i * 2 + 1]) * .25;
  float best = ${ROOM_VIEW.wall.toFixed(2)}; int edge = -1;
  for (int i = 0; i < 4; i++) {
    int j = i == 3 ? 0 : i + 1;
    vec2 p = vec2(cityRoomQuad[i * 2], cityRoomQuad[i * 2 + 1]), e = vec2(cityRoomQuad[j * 2], cityRoomQuad[j * 2 + 1]) - p;
    float t = clamp(dot(a - p, e) / max(dot(e, e), 1e-4), 0.0, 1.0), d = length(a - p - e * t);
    if (d < best) { best = d; edge = i; }
  }
  if (edge < 0) return false;
  int j = edge == 3 ? 0 : edge + 1;
  vec2 p = vec2(cityRoomQuad[edge * 2], cityRoomQuad[edge * 2 + 1]), e = vec2(cityRoomQuad[j * 2], cityRoomQuad[j * 2 + 1]) - p;
  float inner = e.x * (c.y - p.y) - e.y * (c.x - p.x), eye = e.x * (cutEye.z - p.y) - e.y * (cutEye.x - p.x);
  return inner * eye < 0.0 && abs(eye) > .05 * length(e);
}
`;
// The shells' vertex shader (the shell material and its black twin): a
// section cap goes while its building is yours and open, its lid stands at
// the height the building is drawn up to while that moves (world/city-cut.js
// rule 5, and yours opening or closing), a doorway's plug goes while its
// building's interior shows, a room's own wall comes down to the knee
// (above). Then, per fragment, the rule (CUT_GLSL cityHidden), from
// vCityInfo: x the first floor's top (1e5: nothing of it counts as above a
// first floor: a section cap, a building with no storey), y the height above
// which nothing of it is drawn (yours, opening), z -1 never cut (the
// furniture), w 1 beside you (CUT.beside); vCityNear: that height within
// CUT.near.radius m of the camera (rule 5).
const CUT_VERTEX = `#include <begin_vertex>
        float citySlot = floor(cityCut / ${CUT_ROLES_F} + .01), cityRole = cityCut - citySlot * ${CUT_ROLES_F};
        vCityInfo = vec4(1e5, 1e5, cityCut > -.5 ? 0.0 : -1.0, 0.0); vCityNear = 1e5;
        if (citySlot > .5) {
          ivec2 cityTexel = ivec2(int(citySlot + .5), 0);
          vec4 cityRow = texelFetch(cityCutMap, cityTexel, 0);
          float cityNear = texelFetch(cityCutMap, cityTexel + ivec2(0, 2), 0).x;
          bool citySection = abs(cityRole - ${ROLE.section}.0) < .5;
          vCityInfo.x = citySection || cityRow.w < cityRow.z + .05 ? 1e5 : cityRow.z;
          vCityInfo.y = citySection ? 1e5 : cityHideHeight(cityRow, cityRow.x);
          vCityNear = citySection ? 1e5 : cityHideHeight(cityRow, cityNear);
          // The lid: at the height the building is drawn up to while that moves (under its roof), else gone.
          if (abs(cityRole - ${ROLE.lid}.0) < .5) transformed.y = (cityRow.x > .001 && cityRow.x < .999) || (cityNear > .001 && cityNear < .999) ? min(min(vCityInfo.y, vCityNear), cityRow.w) - .01 - mod(citySlot, 8.0) * .003 : -50.0;
          vCityInfo.w = cityRow.y > 1.5 ? 1.0 : 0.0;
          if (citySection && abs(cityRow.y - 1.0) < .5) transformed.y = -50.0;
          if (abs(cityRole - ${ROLE.plug}.0) < .5 && texelFetch(cityCutMap, cityTexel + ivec2(0, 1), 0).x < .5) transformed.y = -50.0;
        }
        if (cityCut > -.5 && (cityRole < .5 || abs(cityRole - ${ROLE.lintel}.0) < .5) && cityRoomKnee(cityAt)) transformed.y = cityRole > 4.5 ? -50.0 : min(transformed.y, ${ROOM_VIEW.knee.toFixed(2)});
        vCityWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`;
const CUT_HEAD = `attribute float cityCut;\nattribute vec2 cityAt;\nuniform sampler2D cityCutMap;\nvarying vec3 vCityWorld;\nvarying vec4 vCityInfo;\nvarying float vCityNear;\n${CUT_GLSL}\n${ROOM_VIEW_GLSL}\n`;
const CUT_FRAGMENT_HEAD = `varying vec3 vCityWorld;\nvarying vec4 vCityInfo;\nvarying float vCityNear;\n${CUT_GLSL}\n`;
const CUT_FRAGMENT = `if (vCityInfo.z > -.5 && cityHidden(vCityWorld, vCityInfo.x, vCityInfo.y, vCityInfo.w, vCityNear)) discard;`;
// (The detector, render/city-vis-debug.js, draws the shells with these.)
export const SHELL_GLSL = Object.freeze({ head: CUT_HEAD, vertex: CUT_VERTEX, fragmentHead: CUT_FRAGMENT_HEAD, fragment: CUT_FRAGMENT });
// The cut's uniforms, for a shader (the table as cityCutMap).
function cutShaderUniforms(shells) { return { cityCutMap: shells.city.uniforms.cutTexture, ...shells.cutUniforms }; }


// A growing list of flat-shaded triangles with colours, the cut stamp, the
// wash, and its anchor (`at`: the vertex's own xz, or, while a
// storey is being built, `cutAt`, its wall's line { ax, az, ux, uz }: each
// vertex projected onto it; see CUT_VERTEX). Typed arrays in chunks (the
// facades' PartSoup): nothing to collect, one copy into the cell's mesh.
const GLOW = { r: 0, g: 0, b: 0 };
class Soup extends PartSoup {
  constructor() { super(); this.cutAt = null; }
  tri(a, b, c, n, col, stamp, g) {
    const line = this.cutAt;
    for (let i = 0; i < 3; i++) {
      const p = i === 0 ? a : i === 1 ? b : c, w = g?.[i];
      let ax = p[0], az = p[2];
      if (line) { const t = (p[0] - line.ax) * line.ux + (p[2] - line.az) * line.uz; ax = line.ax + line.ux * t; az = line.az + line.uz * t; }
      if (w) { GLOW.r = w[0]; GLOW.g = w[1]; GLOW.b = w[2]; }
      this.vertex(p[0], p[1], p[2], n, col, stamp, ax, az, w ? GLOW : null);
    }
  }
  // A flat quad round a, b, c, d, wound to face n (front faces only are drawn).
  face(a, b, c, d, n, col, stamp, glow) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const flip = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] < 0;
    const g = glow ? [glow(a, n), glow(b, n), glow(c, n), glow(d, n)] : null;
    if (!flip) { this.tri(a, b, c, n, col, stamp, g && [g[0], g[1], g[2]]); this.tri(a, c, d, n, col, stamp, g && [g[0], g[2], g[3]]); }
    else { this.tri(a, c, b, n, col, stamp, g && [g[0], g[2], g[1]]); this.tri(a, d, c, n, col, stamp, g && [g[0], g[3], g[2]]); }
  }
}

// Tests only: set `walls` to an array and every wall box planned is listed in
// it (one entry a piece, before its columns).
export const shellDebug = { walls: null };

// Where a line (from (ax, az) along (ux, uz), `length` m) crosses the lattice
// (x or z a multiple of `g`): offsets along it, sorted, none within 5 cm of
// an end or 10 cm of another. The upper walls' columns and the caps' grid
// both break there, so a cap's edge meets its walls' tops vertex for vertex.
export function latticeStations(ax, az, ux, uz, length, g = SHELLS.column) {
  const out = [];
  for (const [a, u] of [[ax, ux], [az, uz]]) {
    if (Math.abs(u) < 1e-6) continue;
    const b = a + u * length, lo = Math.min(a, b), hi = Math.max(a, b);
    for (let k = Math.ceil(lo / g); k * g <= hi; k++) { const s = (k * g - a) / u; if (s > .05 && s < length - .05) out.push(s); }
  }
  out.sort((p, q) => p - q);
  const merged = [];
  for (const s of out) if (!merged.length || s - merged[merged.length - 1] > .1) merged.push(s);
  return merged;
}

// A flat convex polygon at height y, facing up: one fan, or (grid) cut along
// the lattice so each cell is its own piece (its edge meets its walls' columns).
function cap(soup, poly, y, col, stamp, grid = false) {
  const up = [0, 1, 0];
  const fan = pts => { for (let i = 1; i + 1 < pts.length; i++) upTri(soup, [pts[0][0], y, pts[0][1]], [pts[i][0], y, pts[i][1]], [pts[i + 1][0], y, pts[i + 1][1]], up, col, stamp); };
  if (!grid) { fan(poly); return; }
  const g = SHELLS.column, xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
  for (let i = Math.floor(Math.min(...xs) / g); i * g < Math.max(...xs); i++) {
    for (let j = Math.floor(Math.min(...zs) / g); j * g < Math.max(...zs); j++) {
      const cell = clipConvex([[i * g, j * g], [(i + 1) * g, j * g], [(i + 1) * g, (j + 1) * g], [i * g, (j + 1) * g]], poly);
      if (cell.length >= 3 && Math.abs(polyArea(cell)) > 1e-4) fan(cell);
    }
  }
}
// An outer doorway's plug (plan.plugs: its ends on the wall's outer face,
// facing out): one quad from the ground to the lintel.
function plug(soup, g, col) {
  const h = SHELLS.doorHeight, n = [g.n[0], 0, g.n[1]];
  soup.face([g.a[0], 0, g.a[1]], [g.b[0], 0, g.b[1]], [g.b[0], h, g.b[1]], [g.a[0], h, g.a[1]], n, col, g.stamp, null);
}
function upTri(soup, a, b, c, n, col, stamp) {
  const cross = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]); // y of (b - a) x (c - a)
  if (cross >= 0) soup.tri(a, b, c, n, col, stamp); else soup.tri(a, c, b, n, col, stamp);
}
const polyArea = poly => { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
// Sutherland-Hodgman: `subject` clipped to the convex polygon `clip`.
export function clipConvex(subject, clip) {
  const sg = Math.sign(polyArea(clip)) || 1;
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const p = clip[i], q = clip[(i + 1) % clip.length], ex = q[0] - p[0], ez = q[1] - p[1];
    const side = v => sg * (ex * (v[1] - p[1]) - ez * (v[0] - p[0]));
    const input = out; out = [];
    for (let k = 0; k < input.length; k++) {
      const a = input[k], b = input[(k + 1) % input.length], sa = side(a), sb = side(b);
      if (sa >= -1e-9) out.push(a);
      if ((sa >= -1e-9) !== (sb >= -1e-9)) { const t = sa / (sa - sb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
  }
  const clean = [];
  for (const v of out) { const l = clean[clean.length - 1]; if (!l || Math.hypot(v[0] - l[0], v[1] - l[1]) > 1e-5) clean.push(v); }
  if (clean.length > 1 && Math.hypot(clean[0][0] - clean[clean.length - 1][0], clean[0][1] - clean[clean.length - 1][1]) <= 1e-5) clean.pop();
  return clean;
}

// The wash at a point (x, y, z) of a face with outward normal (nx, 0, nz),
// from `lights` (prepared by bakeLight: x, y, z, r2 the reach squared, power,
// colour r g b, facing fx fz, omni). Into `out` (rgb), bounded.
export function washAt(x, y, z, nx, nz, lights, out = [0, 0, 0]) {
  let r = 0, g = 0, b = 0;
  for (const e of lights) {
    const dx = e.x - x, dy = e.y - y, dz = e.z - z, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= e.r2) continue;
    const d = Math.sqrt(d2) || 1e-3, facing = (nx * dx + nz * dz) / d;
    if (facing <= 0) continue; // behind the face (a light inside, or across the corner)
    const wrap = (facing + WASH.wrap) / (1 + WASH.wrap);
    let front = 1;
    if (!e.omni) { const h = Math.hypot(dx, dz) || 1e-3; front = Math.min(1, Math.max(.1, .55 - .45 * (e.fx * dx + e.fz * dz) / h)); }
    const q = 1 - d2 / e.r2, k = e.power * q * q / (1 + d2 / (WASH.near * WASH.near)) * wrap * front;
    r += e.r * k; g += e.g * k; b += e.b * k;
  }
  const lum = .2126 * r + .7152 * g + .0722 * b;
  if (lum > WASH.max) { const s = WASH.max / lum; r *= s; g *= s; b *= s; }
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b), l2 = .2126 * r + .7152 * g + .0722 * b;
  // Too saturated: pulled toward its grey (the same luminance) until the
  // saturation (hi - lo) / hi is the most allowed.
  const m = WASH.maxSaturation;
  if (hi > 1e-6 && (hi - lo) / hi > m) { const s = Math.min(1, Math.max(0, m * l2 / (hi - lo - m * (hi - l2)))); r = l2 + (r - l2) * s; g = l2 + (g - l2) * s; b = l2 + (b - l2) * s; }
  out[0] = Math.max(0, r); out[1] = Math.max(0, g); out[2] = Math.max(0, b);
  return out;
}

// The lights that reach wall piece `w` (its outer face), and the rows its
// face needs so their wash fades within it.
function lightsFor(w, lights) {
  if (!w.out || !lights.length) return null;
  const hl = w.length / 2, near = [];
  for (const e of lights) {
    const s = Math.max(-hl, Math.min(hl, (e.x - w.cx) * w.ux + (e.z - w.cz) * w.uz)), qx = w.cx + w.ux * s, qz = w.cz + w.uz * s;
    const dx = e.x - qx, dz = e.z - qz;
    if (dx * dx + dz * dz >= e.r2 || dx * w.out[0] + dz * w.out[1] < -.05) continue;
    if (e.y - WASH.vertical > w.y1 || e.y + WASH.vertical < w.y0) continue;
    near.push(e);
  }
  return near.length ? near : null;
}
// A wall's rows near lights: at each light's height and where its wash has
// faded above and below (linear between: a soft peak at the light).
function washRows(near, y0, y1) {
  const rows = [];
  for (const e of near) rows.push(e.y - WASH.vertical, e.y, e.y + WASH.vertical);
  rows.sort((a, b) => a - b);
  const out = [y0];
  for (const y of rows) if (y > out[out.length - 1] + .5 && y < y1 - .5) out.push(y);
  out.push(y1);
  return out;
}

// One planned wall piece into a soup: a box standing along a line (centre
// (cx, cz), along (ux, uz), across `thickness`, y0..y1). kind 'box' (a first
// floor, a lintel, an inner wall): every side; its outer face (w.out, the
// side facing out of its building) in columns and rows where a light reaches
// it. kind 'upper' (a storey): its outer face only (its inner face is never
// seen: a building's walls and cap are one closed hull, cut or not), its top
// and its ends, in the lattice's columns (a cap's edge meets them).
function buildWall(soup, w, lights) {
  const { cx, cz, ux, uz, length: L, thickness: T, y0, y1, col, stamp } = w, tx = -uz, tz = ux;
  const at = (s, side, y) => [cx + ux * (s - L / 2) + tx * side * T / 2, y, cz + uz * (s - L / 2) + tz * side * T / 2];
  const outSide = w.out ? (w.out[0] * tx + w.out[1] * tz >= 0 ? 1 : -1) : 0;
  const near = lightsFor(w, lights), glow = near ? (p, n) => washAt(p[0], p[1], p[2], n[0], n[2], near, [0, 0, 0]) : null;
  // A storey's anchor is its wall's line (w.shift: from the box's middle to
  // the party line), the same for all its vertices at a column.
  const [sx, sz] = w.shift || [0, 0];
  // A first floor's piece (a box) is anchored at its middle: the knee-wall
  // view (CUT_VERTEX) lowers or keeps it whole.
  soup.cutAt = w.kind === 'upper' ? { ax: cx + sx, az: cz + sz, ux, uz } : { ax: cx, az: cz, ux: 0, uz: 0 };
  let cols;
  if (w.kind === 'upper') cols = [0, ...w.stations, L];
  else if (near) { const n = Math.max(1, Math.ceil(L / WASH.column - .01)); cols = Array.from({ length: n + 1 }, (_, i) => L * i / n); }
  else cols = [0, L];
  const rows = near ? washRows(near, y0, y1) : [y0, y1];
  for (const side of [-1, 1]) {
    const n = [tx * side, 0, tz * side];
    if (side === outSide) {
      for (let i = 0; i + 1 < cols.length; i++) for (let j = 0; j + 1 < rows.length; j++)
        soup.face(at(cols[i], side, rows[j]), at(cols[i + 1], side, rows[j]), at(cols[i + 1], side, rows[j + 1]), at(cols[i], side, rows[j + 1]), n, col, stamp, glow);
    } else if (w.kind !== 'upper') soup.face(at(0, side, y0), at(L, side, y0), at(L, side, y1), at(0, side, y1), n, col, stamp, null);
  }
  const topCols = w.kind === 'upper' ? cols : [0, L];
  for (let i = 0; i + 1 < topCols.length; i++) soup.face(at(topCols[i], -1, y1), at(topCols[i + 1], -1, y1), at(topCols[i + 1], 1, y1), at(topCols[i], 1, y1), [0, 1, 0], col, stamp, null);
  soup.face(at(0, -1, y0), at(0, 1, y0), at(0, 1, y1), at(0, -1, y1), [-ux, 0, -uz], col, stamp, null);
  soup.face(at(L, -1, y0), at(L, 1, y0), at(L, 1, y1), at(L, -1, y1), [ux, 0, uz], col, stamp, null);
  soup.cutAt = null;
}

// A room's edges as { a: [x, z], b: [x, z], key (side or edge index) }, each
// running the way its openings' offsets are measured (map-kit.js).
export function roomEdges(room) {
  if (room.quad) return room.quad.map((p, i) => ({ a: p, b: room.quad[(i + 1) % 4], key: i }));
  const x0 = room.x - room.w / 2, x1 = room.x + room.w / 2, z0 = room.z - room.d / 2, z1 = room.z + room.d / 2;
  return [{ a: [x0, z0], b: [x1, z0], key: 'back' }, { a: [x1, z0], b: [x1, z1], key: 'right' }, { a: [x0, z1], b: [x1, z1], key: 'front' }, { a: [x0, z0], b: [x0, z1], key: 'left' }];
}
// Where other rooms of the building lie against edge e: intervals [from, to]
// in metres along it.
export function coveredIntervals(e, others) {
  const [ax, az] = e.a, [bx, bz] = e.b, len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, out = [];
  for (const r of others) for (const f of roomEdges(r)) {
    const [cx, cz] = f.a, [dx, dz] = f.b;
    if (Math.abs((cx - ax) * uz - (cz - az) * ux) > .02 || Math.abs((dx - ax) * uz - (dz - az) * ux) > .02) continue;
    const tc = (cx - ax) * ux + (cz - az) * uz, td = (dx - ax) * ux + (dz - az) * uz, lo = Math.max(0, Math.min(tc, td)), hi = Math.min(len, Math.max(tc, td));
    if (hi - lo > .05) out.push([lo, hi]);
  }
  out.sort((p, q) => p[0] - q[0]);
  const merged = [];
  for (const iv of out) { const last = merged[merged.length - 1]; if (last && iv[0] <= last[1] + .01) last[1] = Math.max(last[1], iv[1]); else merged.push([...iv]); }
  return merged;
}

// Where another building's rooms (or blocked parts, or a tower) lie against
// edge e of `self`: a party wall. [from, to, the neighbour's order, whether it
// lies on the same side of the line as self (overlapping towers)] (unmerged).
function partyIntervals(e, neighbours, self) {
  const [ax, az] = e.a, [bx, bz] = e.b, len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, out = [];
  const side = r => { const o = roomOutline2(r), cx = o.reduce((q, p) => q + p[0], 0) / o.length, cz = o.reduce((q, p) => q + p[1], 0) / o.length; return (cz - az) * ux - (cx - ax) * uz > 0; };
  const mine = side(self);
  for (const r of neighbours) for (const f of roomEdges(r)) {
    const [cx, cz] = f.a, [dx, dz] = f.b;
    if (Math.abs((cx - ax) * uz - (cz - az) * ux) > .02 || Math.abs((dx - ax) * uz - (dz - az) * ux) > .02) continue;
    const tc = (cx - ax) * ux + (cz - az) * uz, td = (dx - ax) * ux + (dz - az) * uz, lo = Math.max(0, Math.min(tc, td)), hi = Math.min(len, Math.max(tc, td));
    if (hi - lo > .05) out.push([lo, hi, r.order, side(r) === mine]);
  }
  return out;
}
// How a piece on a party line is built by the part of order `me`: its first
// floor only where it is the earliest there (built once), and its storeys
// above as a half-thick wall on its own side of the line (the neighbour's
// copy stands back to back on the other), both inside the first floor's
// thickness, so a cut storey tucks into the wall below it. `rank`: how many
// earlier neighbours stand on the same side there (towers that overlap);
// each later one stands its copy a half wall further in, so no two meet.
// Null: no neighbour, a whole wall on the line.
function partyWall(p, me) {
  if (!p.parties.length) return { floor: true, rank: null };
  return { floor: p.parties.every(q => me < q[2]), rank: p.parties.filter(q => q[3] && q[2] < me).length };
}

// Where edge e runs inside (or on) any of the convex outlines `polys`:
// intervals [from, to] in metres along it (unmerged).
export function insideIntervals(e, polys, margin = -.001) {
  const [ax, az] = e.a, [bx, bz] = e.b, len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, out = [];
  for (const poly of polys) {
    let area = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
    const sg = Math.sign(area) || 1; let lo = 0, hi = len;
    for (let i = 0; i < poly.length && lo < hi; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]), nx = -sg * (q[1] - p[1]) / l, nz = sg * (q[0] - p[0]) / l; // inward
      const d0 = (ax - p[0]) * nx + (az - p[1]) * nz - margin, dn = ux * nx + uz * nz; // d0 + t dn >= 0
      if (Math.abs(dn) < 1e-9) { if (d0 < 0) hi = -1; } else if (dn > 0) lo = Math.max(lo, -d0 / dn); else hi = Math.min(hi, -d0 / dn);
    }
    if (hi - lo > .05) out.push([lo, hi]);
  }
  return out;
}

// Split [0, len] at every boundary of `intervals` (covered) and `gaps` (openings).
function pieces(len, covered, gaps, party = []) {
  const cuts = new Set([0, len]);
  for (const [a, b] of [...covered, ...gaps, ...party]) { cuts.add(Math.max(0, Math.min(len, a))); cuts.add(Math.max(0, Math.min(len, b))); }
  const at = [...cuts].sort((a, b) => a - b), out = [];
  for (let i = 0; i + 1 < at.length; i++) {
    const from = at[i], to = at[i + 1]; if (to - from < .01) continue;
    const mid = (from + to) / 2;
    out.push({ from, to, covered: covered.some(([a, b]) => mid > a && mid < b), gap: gaps.some(([a, b]) => mid > a && mid < b), parties: party.filter(([a, b]) => mid > a && mid < b) });
  }
  return out;
}

export class CityShells {
  constructor(view, map, city) {
    const tBuild = globalThis.performance?.now?.() ?? 0; let signsMs = 0;
    this.view = view; this.map = map; this.city = city;
    this.table = Array.from({ length: SHELLS.slots }, () => new THREE.Vector4(0, 0, 0, 0));
    this.uniform = { value: this.table };
    this.cutUniforms = cutUniforms(city.uniforms);
    this.material = this.makeMaterial();
    this.group = new THREE.Group(); this.group.name = 'city-shells';
    this.interiors = new Map(); // building id -> { group, doors: [{x, z}] }
    this.interiorList = []; // the same entries as an array (the per-frame loop must not allocate a Map iterator)
    this.slots = new Map(); // building id -> slot
    this.insideSlot = -1; this.lastRoom = null; // the building you are in (update)
    // What to build, kept so bakeLight can build it again with the wash:
    // wall pieces ({ cell, part: fixed | rest, kind: box | upper, the box,
    // colour, stamp, out: its outer face's normal, stations: the lattice's
    // columns }) and caps ({ cell, poly, y, colour, stamp, grid }).
    this.plan = { walls: [], caps: [], plugs: [] };
    const cutList = [];
    const cellOf = (x, z) => `${Math.floor(x / SHELLS.cell)},${Math.floor(z / SHELLS.cell)}`;
    const colour = hex => new THREE.Color(hex);
    let slot = 0;
    const tone = (hex, seed, amount = .05) => { const c = colour(hex); const k = 1 + ((Math.sin(seed * 91.7) * 43758.5453) % 1) * amount; return c.multiplyScalar(k); };
    // A box standing along a line: centre (cx, cz) on the ground, length
    // along (ux, uz), thickness across, from y0 to y1; `out` the normal of
    // its outer face (null: an inner wall).
    const wallBox = (part, cx, cz, ux, uz, length, thickness, y0, y1, col, stamp, out = null) => {
      if (shellDebug.walls) shellDebug.walls.push({ cx, cz, ux, uz, length, thickness, y0, y1, stamp });
      const w = { cell: cellOf(cx, cz), part, kind: 'box', cx, cz, ux, uz, length, thickness, y0, y1, col, stamp, out };
      this.plan.walls.push(w);
      return w;
    };
    const planCap = (x, z, poly, y, col, stamp, grid) => this.plan.caps.push({ cell: cellOf(x, z), poly, y, col, stamp, grid });

    // Party walls (two buildings, a building and a tower, or two towers side
    // by side, or towers overlapping): the first floor is built once, by the
    // earliest (buildings in list order, then the towers); the storeys above
    // are built by both, each a half-thick wall on its own side of the line
    // (partyWall), so the two copies stand back to back (no coplanar faces
    // fighting) and each is cut with its own building.
    const order = new Map((map.cityBuildings || []).map((b, i) => [b.id, i]));
    const towers = (map.solids || []).filter(s => s.shell !== false); // (shell: false: a collider only, a blocked stairwell inside a building)
    const parts = [];
    for (const r of map.buildings) if (r.group && order.has(r.group)) parts.push(Object.assign(Object.create(r), { order: order.get(r.group), owner: r.group }));
    for (const b of map.cityBuildings || []) for (const [x0, x1, z0, z1] of b.blocked || []) parts.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, order: order.get(b.id), owner: b.id });
    const towerParts = towers.map((s, i) => ({ quad: solidOutline(s), order: order.size + i, owner: 'tower:' + i }));
    parts.push(...towerParts);
    const boxes = new Map(), bounds = r => { let b = boxes.get(r); if (!b) { const o = roomOutline2(r), xs = o.map(p => p[0]), zs = o.map(p => p[1]); boxes.set(r, b = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]); } return b; };
    const near = (r, pad = 1) => { const [x0, x1, z0, z1] = bounds(r); return q => { const b = bounds(q); return b[0] <= x1 + pad && b[1] >= x0 - pad && b[2] <= z1 + pad && b[3] >= z0 - pad; }; };
    const inset = (e, room) => { // unit normal of edge e pointing into `room`
      const [ax, az] = e.a, [bx, bz] = e.b, l = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / l, nz = (bx - ax) / l, o = roomOutline2(room);
      const cx = o.reduce((q, p) => q + p[0], 0) / o.length, cz = o.reduce((q, p) => q + p[1], 0) / o.length;
      return (cx - (ax + bx) / 2) * nx + (cz - (az + bz) / 2) * nz > 0 ? [nx, nz] : [-nx, -nz];
    };
    // A storey above a party wall: half a wall (less a hair) on its own side
    // of the line (n points into it), `rank` half walls further in. Its
    // columns break where the line crosses the lattice (as its cap's grid).
    // Its face: outward (a party wall's: the line's side, seen when the
    // neighbour is cut).
    const GAP = .005, HALF = SHELLS.thickness / 2 - GAP;
    const upperWall = (cx, cz, ux, uz, length, [nx, nz], rank, y0, y1, col, stamp) => {
      const stations = latticeStations(cx - ux * length / 2, cz - uz * length / 2, ux, uz, length), out = [-nx, -nz];
      let bx = cx, bz = cz, thickness = SHELLS.thickness;
      if (rank !== null) { const off = GAP + HALF / 2 + rank * (HALF + GAP); bx += nx * off; bz += nz * off; thickness = HALF; }
      if (shellDebug.walls) shellDebug.walls.push({ cx: bx, cz: bz, ux, uz, length, thickness, y0, y1, stamp });
      const w = { cell: cellOf(cx, cz), part: 'rest', kind: 'upper', cx: bx, cz: bz, ux, uz, length, thickness, y0, y1, col, stamp, out, stations, shift: [cx - bx, cz - bz] };
      this.plan.walls.push(w);
      return w;
    };
    // The facades (render/city-facades.js): a record for every stretch of
    // outer wall (its first floor or lintel, its storey, its building's
    // look), the doorways, the low roofs; dressed once the walls are planned.
    const facade = { pieces: [], doors: [], roofs: [] };
    this.looks = new Map();
    const record = (owner, slotN, look, floor, top, e, p, cx, cz, length, out, extra) => {
      const [ax, az] = e.a, [bx, bz] = e.b, edgeLen = Math.hypot(bx - ax, bz - az);
      const rec = { owner, slot: slotN, look, floor, top, ax, az, ux: (bx - ax) / edgeLen, uz: (bz - az) / edgeLen, from: p.from, len: length, edgeLen, ox: out[0], oz: out[1],
        cell: cellOf(cx, cz), party: p.parties.length > 0, hidden: false, lintel: p.gap, fixed: null, upper: null, stations: [], corners: [false, false], seen: false,
        wash: { cx, cz, ux: (bx - ax) / edgeLen, uz: (bz - az) / edgeLen, length: length + 1, out, y0: 0, y1: top }, ...extra };
      facade.pieces.push(rec);
      return rec;
    };
    for (const spec of map.cityBuildings || []) {
      const rooms = map.buildings.filter(b => b.group === spec.id);
      if (!rooms.length) continue;
      slot++; if (slot >= SHELLS.slots) throw new Error('city-shells: more buildings than cut slots');
      this.slots.set(spec.id, slot);
      const top = spec.tall ? (spec.height ?? SHELLS.tallTop) : (spec.height ?? 5), floor = rooms[0].height, grid = top > floor + .05;
      this.table[slot].set(0, 0, floor, top);
      // A blocked part (a sealed stairwell, the metro's stairs): part of the
      // shell, not a room. The rooms' walls against it are inner walls; its
      // outward faces and its top are drawn below with the building's slot.
      const blocked = (spec.blocked || []).map(([x0, x1, z0, z1]) => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }));
      cutList.push(cutBuilding(slot, [...rooms, ...blocked].map(roomOutline2), top, floor));
      const seed = spec.seed ?? slot, look = facadeLook(spec);
      this.looks.set(spec.id, look);
      const outer = tone(spec.colours?.outer ?? look.outer ?? SHELLS.colours.outer, seed), lower = tone(spec.colours?.lower ?? look.lower ?? SHELLS.colours.lower, seed + 1);
      const roofColour = spec.colours?.roof ?? look.roofColour ?? SHELLS.colours.roof;
      const inner = colour(spec.colours?.inner ?? SHELLS.colours.inner), lintel = colour(SHELLS.colours.lintel);
      const upperStamp = cutStamp(slot, ROLE.upper), capStamp = cutStamp(slot, ROLE.cap), plugStamp = cutStamp(slot, ROLE.plug);
      const fixedStamp = cutStamp(slot, ROLE.fixed), lintelStamp = cutStamp(slot, ROLE.lintel), sectionStamp = cutStamp(slot, ROLE.section), lidStamp = cutStamp(slot, ROLE.lid), sectionY = floor + SHELLS.section.lift + (slot % 8) * SHELLS.section.step, section = colour(SHELLS.colours.section);
      const doors = [];
      for (const room of rooms) {
        const others = [...rooms.filter(r => r !== room), ...blocked], openings = buildingOpenings(room);
        const neighbours = parts.filter(q => q.owner !== spec.id && near(room)(q)), me = order.get(spec.id);
        const skip = new Set([...(room.sharedSides || []), ...(room.sharedEdges || [])]);
        for (const e of roomEdges(room)) {
          const [ax, az] = e.a, [bx, bz] = e.b, len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, mid = len / 2;
          const gaps = openings.filter(o => (o.side ?? o.edge) === e.key).map(o => [mid + o.offset - o.width / 2, mid + o.offset + o.width / 2, o]);
          for (const g of gaps) if (g[2].outer) doors.push({ x: ax + ux * (g[0] + g[1]) / 2, z: az + uz * (g[0] + g[1]) / 2 });
          const covered = coveredIntervals(e, others);
          const at = t => [ax + ux * t, az + uz * t];
          const party = neighbours.length ? partyIntervals(e, neighbours, room) : [], n = inset(e, room), out = [-n[0], -n[1]];
          for (const p of pieces(len, covered, gaps.map(g => [g[0], g[1]]), party)) {
            const [cx, cz] = at((p.from + p.to) / 2), length = p.to - p.from;
            // A shared wall is built by the room that owns it (its twin is skipped).
            if (p.covered && skip.has(e.key)) continue;
            const pw = partyWall(p, me), ownsFloor = p.covered || pw.floor;
            const rec = p.covered ? null : record(spec.id, slot, look, floor, top, e, p, cx, cz, length, out);
            if (!p.gap && ownsFloor) { const w = wallBox(p.covered ? 'rest' : 'fixed', cx, cz, ux, uz, length, SHELLS.thickness, 0, floor, p.covered ? inner : lower, fixedStamp, p.covered ? null : out); if (rec) rec.fixed = w; }
            else if (p.gap) { const w = wallBox('fixed', cx, cz, ux, uz, length, SHELLS.thickness, SHELLS.doorHeight, floor, lintel, lintelStamp, p.covered ? null : out); if (rec) rec.fixed = w; }
            if (!p.covered && top > floor + .05) { const w = upperWall(cx, cz, ux, uz, length, n, pw.rank, floor, top, outer, upperStamp); rec.upper = w; rec.stations = w.stations; }
            // An outer doorway's plug: a dark face in its opening, on the
            // wall's outer face, drawn only while its interior is hidden.
            if (rec && p.gap) { const o = SHELLS.thickness / 2 + .004, [ax2, az2] = at(p.from), [bx2, bz2] = at(p.to); this.plan.plugs.push({ cell: rec.cell, a: [ax2 + out[0] * o, az2 + out[1] * o], b: [bx2 + out[0] * o, bz2 + out[1] * o], n: out, stamp: plugStamp }); }
            if (rec && p.gap) facade.doors.push({ owner: spec.id, look, piece: rec, cell: rec.cell, x0: ax + ux * p.from, z0: az + uz * p.from, x1: ax + ux * p.to, z1: az + uz * p.to, ux, uz });
          }
        }
        const poly = roomOutline2(room), cx = poly.reduce((q, p) => q + p[0], 0) / poly.length, cz = poly.reduce((q, p) => q + p[1], 0) / poly.length;
        planCap(cx, cz, poly, top, colour(spec.tall ? SHELLS.colours.cap : roofColour), capStamp, grid);
        if (grid) { planCap(cx, cz, poly, sectionY, section, sectionStamp, false); planCap(cx, cz, poly, sectionY, section, lidStamp, false); }
      }
      // A low building's roof is dressed once, over all its rooms (one
      // record per room scattered the same few boxes on every room: the
      // club's nine rooms had eighteen identical AC units in a grid).
      if (!spec.tall && top > floor + .05 && rooms.length) {
        const polys = rooms.map(roomOutline2), mid = polys.flat().reduce((q, p) => [q[0] + p[0], q[1] + p[1]], [0, 0]).map(v => v / polys.flat().length);
        facade.roofs.push({ owner: spec.id, slot, look, floor, top, polys, roofColour, cell: cellOf(mid[0], mid[1]) });
      }
      for (const part of blocked) {
        const neighbours = parts.filter(q => q.owner !== spec.id && near(part)(q)), me = order.get(spec.id);
        for (const e of roomEdges(part)) {
          const [ax, az] = e.a, [bx, bz] = e.b, len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
          const party = partyIntervals(e, neighbours, part), n = inset(e, part), out = [-n[0], -n[1]];
          for (const p of pieces(len, coveredIntervals(e, rooms), [], party)) {
            if (p.covered) continue; // (the room's wall against it)
            const t = (p.from + p.to) / 2, cx = ax + ux * t, cz = az + uz * t, length = p.to - p.from, pw = partyWall(p, me);
            const rec = record(spec.id, slot, look, floor, top, e, p, cx, cz, length, out);
            if (pw.floor) rec.fixed = wallBox('fixed', cx, cz, ux, uz, length, SHELLS.thickness, 0, floor, lower, fixedStamp, out);
            if (top > floor + .05) { rec.upper = upperWall(cx, cz, ux, uz, length, n, pw.rank, floor, top, outer, upperStamp); rec.stations = rec.upper.stations; }
          }
        }
        planCap(part.x, part.z, roomOutline2(part), top, colour(spec.tall ? SHELLS.colours.cap : roofColour), capStamp, grid);
        if (grid) { planCap(part.x, part.z, roomOutline2(part), sectionY, section, sectionStamp, false); planCap(part.x, part.z, roomOutline2(part), sectionY, section, lidStamp, false); }
      }
      // The interior: floors and the rooms' furniture.
      const inside = new THREE.Group(); inside.name = 'interior:' + spec.id; inside.visible = false;
      const floorSoup = new Soup();
      for (const room of rooms) cap(floorSoup, roomOutline2(room), .015, colour(spec.colours?.floor ?? SHELLS.colours.floor), 0);
      inside.add(this.meshFrom(floorSoup, false));
      CITY_INTERIORS.build?.(this, spec, rooms, inside); // the rooms' furniture (stage 4)
      const entry = { group: inside, doors, slot }; this.interiors.set(spec.id, entry); this.interiorList.push(entry);
      this.group.add(inside);
    }
    // Sealed towers (the edge ring): a shell and a cap, never entered. Where
    // a building (or an earlier tower) stands against one, it owns the first
    // floor there, and the storeys above are a party wall (partyWall). Where
    // a tower's wall runs inside an earlier tower (the ring's towers overlap)
    // its first floor is left out: that tower's first floor and its cap (up,
    // or down as the cut's dark top) hide everything inside it up to there.
    for (const [i, s] of towers.entries()) {
      slot++; if (slot >= SHELLS.slots) throw new Error('city-shells: more buildings than cut slots');
      const self = towerParts[i], poly = self.quad, top = s.height ?? SHELLS.tallTop, floor = Math.min(CITY_FLOOR, top);
      this.table[slot].set(0, 0, floor, top);
      cutList.push(cutBuilding(slot, [poly], top, floor));
      const look = towerLook(s, i); this.looks.set('tower:' + i, look);
      const col = tone(look.outer ?? SHELLS.colours.sealed, slot), low = tone(look.lower ?? SHELLS.colours.sealed, slot + 1), neighbours = parts.filter(q => q !== self && near(self)(q));
      const earlier = towerParts.slice(0, i).filter(near(self, 0));
      for (const e of roomEdges(self)) {
        const [ax, az] = e.a, [bx, bz] = e.b, len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
        const party = partyIntervals(e, neighbours, self), n = inset(e, self), out = [-n[0], -n[1]];
        const within = insideIntervals(e, earlier.map(q => q.quad));
        for (const p of pieces(len, [], within, party)) {
          const t = (p.from + p.to) / 2, cx = ax + ux * t, cz = az + uz * t, length = p.to - p.from, pw = partyWall(p, self.order);
          // (a stretch inside an earlier tower is hidden: not dressed)
          const rec = record('tower:' + i, slot, look, floor, top, e, { ...p, gap: false }, cx, cz, length, out, { hidden: p.gap });
          if (pw.floor && !p.gap) rec.fixed = wallBox('fixed', cx, cz, ux, uz, length, SHELLS.thickness, 0, floor, low, cutStamp(slot, ROLE.fixed), out);
          if (top > floor) { rec.upper = upperWall(cx, cz, ux, uz, length, n, pw.rank, floor, top, col, cutStamp(slot, ROLE.upper)); rec.stations = rec.upper.stations; }
        }
      }
      planCap(s.x, s.z, poly, top, colour(SHELLS.colours.cap), cutStamp(slot, ROLE.cap), top > floor + .05);
      if (top > floor + .05) for (const role of [ROLE.section, ROLE.lid]) planCap(s.x, s.z, poly, floor + SHELLS.section.lift + (slot % 8) * SHELLS.section.step, colour(SHELLS.colours.section), cutStamp(slot, role), false);
    }
    this.cut = new CityCut(cutList);
    // Each building's hull (its footprint polygons as prisms to its top), for
    // the shroud (render/vision.js: exteriorFaces).
    this.hulls = cutList.map(b => ({ b, faces: b.polygons.flatMap(poly => [poly.map(([x, z]) => ({ x, y: b.top, z })), ...poly.map(([x, z], i) => { const [x2, z2] = poly[(i + 1) % poly.length]; return [{ x, y: 0, z }, { x: x2, y: 0, z: z2 }, { x: x2, y: b.top, z: z2 }, { x, y: b.top, z }]; })]) }));
    // The footprint mask (world/city-cut.js footprintMask), for the rule's
    // open ground: one R8 texture, made once.
    const mask = this.cut.mask, maskTexture = new THREE.DataTexture(mask.data, mask.w, mask.h, THREE.RedFormat, THREE.UnsignedByteType);
    maskTexture.magFilter = maskTexture.minFilter = THREE.LinearFilter; maskTexture.generateMipmaps = false; maskTexture.unpackAlignment = 1;
    maskTexture.wrapS = maskTexture.wrapT = THREE.ClampToEdgeWrapping; maskTexture.needsUpdate = true; maskTexture.name = 'lumen-footprints';
    this.cutUniforms.cityFootMask.value = this.maskTexture = maskTexture;
    this.cutUniforms.cityFootBox.value.set([mask.x0, mask.z0, 1 / (mask.w * mask.cell), 1 / (mask.h * mask.cell)]);
    this.slotCount = slot;
    // Dress the facades: which faces a camera can see, which corners are
    // convex (a pilaster, a neon strip; one wall owns each), the signs'
    // places (parts keep clear of them), then the parts.
    const spots = cameraSpots(map);
    const polys = parts.map(q => q.quad || roomOutline2(q));
    for (const rec of facade.pieces) {
      const t = rec.from + rec.len / 2, mx = rec.ax + rec.ux * t + rec.ox * FACADES.face, mz = rec.az + rec.uz * t + rec.oz * FACADES.face;
      const level = spots.length ? faceSeen(mx, mz, rec.ox, rec.oz, spots) : 2;
      rec.seen = level > 0; rec.rich = level === 2;
    }
    markCorners(facade.pieces, polys);
    this.facadePieces = facade.pieces; this.facadeInput = facade;
    const tSigns = globalThis.performance?.now?.() ?? 0;
    facade.signs = facadeSigns(map); // (the first read of map.citySigns makes them: the signs' cost, not the facades')
    facade.framed = (map.props || []).filter(p => /DoorGlow$/.test(p.type)).map(p => [p.x, p.z]); // (doorways a prop already frames: the facades' DOORWAY frame keeps off them)
    signsMs = (globalThis.performance?.now?.() ?? 0) - tSigns;
    // (?facades=0 on the dev server: none, to measure what they cost; the
    // built page ignores it, so a shared link can't strip the city bare)
    // Only what every preset draws now; the detail tiers the first time a
    // preset shows them (setQuality: a Potato or Performance load never
    // spends on them).
    this.facadesOff = !!import.meta.env?.DEV && /[?&]facades=0\b/.test(globalThis.location?.search || '');
    // (?visdebug on the dev server: the visibility ID render for
    // tools/lumen-visaudit-gpu.mjs, render/city-vis-debug.js; never built)
    if (import.meta.env?.DEV && /[?&]visdebug\b/.test(globalThis.location?.search || '')) import('./city-vis-debug.js').then(m => { globalThis.__cityVisDebug = m; });
    this.facades = this.facadesOff ? { cells: new Map(), owners: new Map() } : buildFacades(facade, { tiers: [0, 0] });
    this.facadeTier = 0; this.detailBuilt = 0; this.lightList = [];
    // Two meshes a cell: the first floors (never cut; they cast the shadows)
    // and the rest (the storeys above, the caps, the inner walls), apart so
    // Extreme's ambient occlusion, which draws the scene with its own normals
    // material (no cut in it), leaves the part that is cut out of its depth
    // (renderer.js aoExcluded: `upper`).
    this.upper = new THREE.Group(); this.upper.name = 'city-shells-upper';
    // Quality's mirror draws only the bright layer, on black: with nothing
    // solid in it, a sign behind a tower showed in the wet street through the
    // tower. So every shell has a black twin on the bright layer alone: all of
    // them merged into one mesh (positions and the cut stamp only; one draw,
    // where a twin per cell cost the pass 17 more at the Crossroads), unlit,
    // no shadow, the same cut in its vertex shader. The pass sees the towers
    // as black, depth and all, and they hide what stands behind them. The
    // screen's camera and Extreme's full mirror never see it.
    this.occluderMaterial = this.makeOccluderMaterial();
    this.cellMeshes = []; this.detailMeshes = [[], [], [], []]; this.detailTriangles = [0, 0, 0, 0];
    // Built with the hub (city.emitters): bakeLight, right after every
    // system has added its emitters, builds the meshes once, with the wash
    // (building them here too cost the load a second build). Alone (a test),
    // built now.
    this.assembled = false;
    if (Array.isArray(city.emitters)) this.occluders = new THREE.Group();
    else this.assemble([]);
    view.scene.add(this.group, this.upper, this.occluders);
    // The same table as a texture, for the signs' shaders (city-signs.js:
    // a sign above the first floor of a cut building goes with it).
    this.texture = city.cutTexture;
    if (this.texture) for (let i = 0; i < SHELLS.slots; i++) { const d = this.texture.image.data; d[i * 4 + 2] = this.table[i].z; d[i * 4 + 3] = this.table[i].w; }
    if (this.texture) this.texture.needsUpdate = true;
    this.buildMs = (globalThis.performance?.now?.() ?? 0) - tBuild - signsMs; // (load time: the shells and their facades, ms)
  }

  // Build the cells' meshes (and the black twin) from the plan, with the
  // wash from `lights` (bakeLight's list; none: plain walls).
  assemble(lights) {
    const soups = new Map(), soupAt = key => { let s = soups.get(key); if (!s) soups.set(key, s = { fixed: new Soup(), rest: new Soup() }); return s; };
    for (const w of this.plan.walls) buildWall(soupAt(w.cell)[w.part], w, lights);
    for (const c of this.plan.caps) cap(soupAt(c.cell).rest, c.poly, c.y, c.col, c.stamp, c.grid);
    const plugColour = new THREE.Color(SHELLS.colours.plug);
    for (const g of this.plan.plugs) plug(soupAt(g.cell).rest, g, plugColour);
    for (const m of this.cellMeshes) { m.parent?.remove(m); m.geometry.dispose(); }
    this.cellMeshes = [];
    // A cell's shells and the parts every preset draws, in one mesh each.
    const parts = this.facades?.cells || new Map(), wash = new Map();
    for (const key of new Set([...soups.keys(), ...parts.keys()])) {
      const walls = soups.get(key), p = parts.get(key);
      const fixed = [walls?.fixed, p?.fixed].filter(s => s?.count), rest = [walls?.rest, p?.rest].filter(s => s?.count);
      if (fixed.length) { const m = this.meshFrom(fixed, true, lights, wash); m.userData.facadeTriangles = (p?.fixed.count || 0) / 3; this.group.add(m); this.cellMeshes.push(m); }
      if (rest.length) { const m = this.meshFrom(rest, false, lights, wash); m.userData.facadeTriangles = (p?.rest.count || 0) / 3; this.upper.add(m); this.cellMeshes.push(m); }
    }
    this.lightList = lights;
    for (let tier = 1; tier <= 3; tier++) if (this.detailMeshes[tier].length || (tier === this.facadeTier && this.detailBuilt >= tier)) this.assembleDetail(tier, lights, wash);
    // The black twin: the same walls without the wash's extra columns and
    // rows, and the caps whole (it only has to hide what stands behind a
    // tower from the bright-only mirror; the caps' lattice and the wash
    // would add about 18k triangles to that pass for nothing).
    const twin = new Soup();
    for (const w of this.plan.walls) buildWall(twin, w, []);
    for (const c of this.plan.caps) cap(twin, c.poly, c.y, c.col, c.stamp, false);
    for (const g of this.plan.plugs) plug(twin, g, plugColour);
    const old = this.occluders;
    this.occluders = this.occluderMesh(twin);
    if (old) { old.parent?.add(this.occluders); old.parent?.remove(old); old.geometry?.dispose(); }
    this.triangles = this.cellMeshes.reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0);
    this.assembled = true;
  }
  // The facades' detail from Balanced up: one mesh a cell per step (its
  // tiers merged: Balanced 1, Quality 1-2, Extreme 1-3), one step shown.
  // (one step's meshes at a time, made when that step is first shown)
  assembleDetail(tier, lights, wash = new Map()) {
    for (const m of this.detailMeshes[tier]) { m.parent?.remove(m); m.geometry.dispose(); }
    this.detailMeshes[tier] = [];
    for (const p of this.facades.cells.values()) {
      const list = p.tiers.slice(1, tier + 1).filter(s => s.count);
      if (!list.length) continue;
      const m = this.meshFrom(list, false, lights, wash); m.name = 'city-facade-detail-' + tier; m.castShadow = false;
      m.visible = tier === this.facadeTier;
      this.upper.add(m); this.detailMeshes[tier].push(m);
    }
    this.detailTriangles[tier] = this.detailMeshes[tier].reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0);
  }
  // The preset ladder: the detail meshes of this preset's step shown (none
  // on Potato and Performance), made the first time one is wanted (at load
  // or a preset change, before the warm-up). The same material: no program
  // is ever built for them.
  setQuality(name) {
    this.facadeTier = FACADES.tiers[name] ?? 0;
    const tier = this.facadeTier;
    if (tier > this.detailBuilt && !this.facadesOff) {
      // (only the tiers this preset adds: Balanced 1, Quality 2, Extreme 3)
      buildFacades(this.facadeInput, { tiers: [this.detailBuilt + 1, tier], into: this.facades });
      this.detailBuilt = tier;
    }
    if (tier > 0 && !this.detailMeshes[tier].length && !this.facadesOff && this.assembled) this.assembleDetail(tier, this.lightList);
    for (let tier = 1; tier <= 3; tier++) for (const m of this.detailMeshes[tier]) m.visible = tier === this.facadeTier;
  }

  // The facade wash, once at load (CityFeatures, after every system has
  // added its emitters): each emitter's light baked into the outer walls
  // near it. `emitters`: city.emitters ({ x, y, z, colour, intensity, reach,
  // kind, facing, source }). Returns how many lights it baked.
  bakeLight(emitters) {
    const t0 = globalThis.performance?.now?.() ?? 0, signs = this.city.signs, lights = [];
    for (const e of emitters || []) {
      if (!e?.colour || !(e.intensity > 0)) continue;
      const share = WASH.kinds[e.kind] ?? 1, level = this.meanLevel(e, signs);
      const power = e.intensity * level * share * WASH.gain;
      if (power < .01) continue;
      // Its colour's hue, pulled toward grey, at unit luminance (the power
      // carries the brightness; a saturated hue's peak channel held to 3).
      const c = e.colour, peak = Math.max(c.r, c.g, c.b) || 1, l = (.2126 * c.r + .7152 * c.g + .0722 * c.b) / peak, k = WASH.desaturate;
      const lum = Math.max(l * (1 - k) + l * k, 1 / 3) * peak; // (the desaturated colour's luminance, x peak below)
      const reach = Math.min(WASH.maxReach, Math.max(WASH.minReach, (e.reach || 3) * WASH.reach)), f = e.facing || 0;
      lights.push({ x: e.x, y: e.y, z: e.z, r2: reach * reach, power, r: (c.r * (1 - k) + l * peak * k) / lum, g: (c.g * (1 - k) + l * peak * k) / lum, b: (c.b * (1 - k) + l * peak * k) / lum, fx: Math.sin(f), fz: Math.cos(f), omni: WASH.omni.includes(e.kind) });
    }
    this.washLights = lights.length;
    if (lights.length || !this.assembled) this.assemble(lights);
    this.bakeMs = (globalThis.performance?.now?.() ?? 0) - t0;
    return lights.length;
  }
  // An emitter's mean level over time (flicker, blink, pulse and the traffic
  // phases), from the signs' own level function; 1 for a steady light.
  meanLevel(e, signs) {
    if (!e.source || !signs?.emitterLevel) return 1;
    let sum = 0;
    for (let i = 0; i < WASH.samples; i++) sum += signs.emitterLevel(e, 3.7 + i * 6.93, false);
    return sum / WASH.samples;
  }

  // One mesh from a soup, or from several end to end (a cell's walls, then
  // its facade parts: PartSoups, whose wash is added here from `lights`;
  // `wash` caches the lights near each wall). casts: a first floor's, the
  // shadows' casters.
  meshFrom(soup, casts, lights = [], wash = new Map()) {
    const g = new THREE.BufferGeometry();
    {
      const list = Array.isArray(soup) ? soup : [soup], all = concatSoups(list), a = all.arrays;
      let base = 0;
      for (const s of list) {
        if (lights.length) for (const [start, end, wall] of s.ranges) {
          if (!wall) continue;
          let near = wash.get(wall); if (near === undefined) wash.set(wall, near = lightsFor(wall, lights));
          if (!near) continue;
          for (let v = base + start; v < base + end; v++) {
            const nx = a.normal[v * 3], nz = a.normal[v * 3 + 2]; if (Math.abs(nx) + Math.abs(nz) < .5) continue;
            const w = washAt(a.position[v * 3], a.position[v * 3 + 1], a.position[v * 3 + 2], nx, nz, near, washOut);
            a.cityGlow[v * 3] += w[0]; a.cityGlow[v * 3 + 1] += w[1]; a.cityGlow[v * 3 + 2] += w[2];
          }
        }
        base += s.count;
      }
      for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3], ['cityCut', 1], ['cityGlow', 3], ['cityAt', 2]]) g.setAttribute(name, new THREE.BufferAttribute(a[name], size));
    }
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.material);
    mesh.castShadow = !!casts; mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    return mesh;
  }

  // One mesh of every shell's triangles (they are built in world space), for
  // the bright layer: positions and the cut stamp only.
  occluderMesh(soup) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(soup.view('position'), 3)); g.setAttribute('cityCut', new THREE.BufferAttribute(soup.view('cityCut'), 1));
    g.setAttribute('cityAt', new THREE.BufferAttribute(soup.view('cityAt'), 2));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.occluderMaterial);
    mesh.name = 'city-shell-occluders'; mesh.layers.set(BRIGHT_LAYER); mesh.castShadow = mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.raycast = () => {};
    return mesh;
  }

  // The shells' black twin for Quality's bright-only mirror: unlit black,
  // the same cut in its shaders.
  makeOccluderMaterial() {
    const m = new THREE.MeshBasicMaterial({ color: '#000000', fog: false });
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, cutShaderUniforms(this));
      shader.vertexShader = CUT_HEAD + shader.vertexShader.replace('#include <begin_vertex>', CUT_VERTEX);
      shader.fragmentShader = CUT_FRAGMENT_HEAD + shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + CUT_FRAGMENT);
    };
    m.customProgramCacheKey = () => 'lumen-city-shell-occluder-v5';
    return m;
  }

  makeMaterial() {
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1, metalness: 0 });
    // The table is the hub's cut texture (one texel a slot, read exactly with
    // texelFetch): 128 buildings and towers without spending vertex uniforms.
    // The wash (cityGlow) is light reaching the wall: emitted as the wall's
    // own colour times it, after the lighting (a wash, never a flat tint).
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, cutShaderUniforms(this));
      shader.vertexShader = CUT_HEAD + 'attribute vec3 cityGlow;\nvarying vec3 vCityGlow;\n' + shader.vertexShader.replace('#include <begin_vertex>', CUT_VERTEX + '\n        vCityGlow = cityGlow;');
      shader.fragmentShader = CUT_FRAGMENT_HEAD + 'varying vec3 vCityGlow;\n' + shader.fragmentShader
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + CUT_FRAGMENT)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vCityGlow * diffuseColor.rgb;');
    };
    m.customProgramCacheKey = () => 'lumen-city-shell-v9';
    return m;
  }

  // The cut for this frame (city-features.js calls it with the frame).
  update(frame) {
    const view = this.view, sim = frame.sim, cam = view.camera.position, cut = this.cut;
    const player = view.player?.visible !== false ? view.player?.position : null;
    // The building you are in: your room's; or, while you still stand on the
    // footprint of the one you were in (a doorway between two of its rooms,
    // the frame of its outer door), still that one and that room.
    const here = sim?.interior?.group ? this.slots.get(sim.interior.group) ?? -1 : -1, inside = cut.whereIs(here, player);
    const room = inside < 0 ? null : here >= 0 ? sim.interior : this.lastRoom;
    this.insideSlot = inside; this.lastRoom = room;
    if (room && this.roomState?.room !== room) this.roomState = roomView(room, buildingOpenings(room));
    cut.update(Math.min(frame.dt, .1), cam, player, frame.others, inside, room ? this.roomState : null);
    // Interiors: yours; and, outside, one within SHELLS.interiorReach of
    // one of whose outer doors you stand (the look in through the door).
    // Never another's. Where it is hidden, its doorways are plugged dark.
    const px = player?.x ?? 1e9, pz = player?.z ?? 1e9, reach = SHELLS.interiorReach * SHELLS.interiorReach;
    const list = this.interiorList;
    for (let n = 0; n < list.length; n++) {
      const entry = list[n], b = cut.bySlot.get(entry.slot);
      let show = b.mode === OPEN;
      if (!show && inside < 0) for (const d of entry.doors) if ((d.x - px) ** 2 + (d.z - pz) ** 2 < reach) { show = true; break; }
      entry.group.visible = show; b.interior = show;
    }
    // The uniforms and the table (row 0 x, y; row 1 x: world/city-cut.js pack).
    const data = this.texture?.image.data;
    for (const b of cut.buildings) { const row = this.table[b.slot]; row.x = b.hide; row.y = b.section || (b.beside ? 2 : 0); }
    if (cut.pack(this.cutUniforms, data, SHELLS.slots)) this.texture.needsUpdate = true;
  }
  // The shroud (render/vision.js, inside a room) greys what you cannot see
  // from your room; another building's outside is not that (owner,
  // 2026-09-30: "I should be able to see the exteriors completely of the
  // building I'm facing, but it's grayed out"). Its hull's faces (every
  // building but yours within SHELLS.shroudReach m of what the camera
  // looks at) go into `out` to be cleared from the shroud. Players are
  // never shown by it: the shroud only greys; who you see is
  // render/interior-visibility.js's (their shaders), unchanged.
  exteriorFaces(focus, out) {
    const r = SHELLS.shroudReach, fx = focus?.x ?? 0, fz = focus?.z ?? 0;
    for (const h of this.hulls) {
      const b = h.b;
      if (b.slot === this.insideSlot || b.x1 < fx - r || b.x0 > fx + r || b.z1 < fz - r || b.z0 > fz + r) continue;
      for (const f of h.faces) out.push(f);
    }
    return out;
  }
  // Warm: every interior shown for the warm-up's one draw (it shows hidden
  // things anyway); nothing else to do.
  warm() {}
}
// A solid's outline, turned by its angle (buildingWalls' convention).
export function solidOutline(s) {
  const a = s.angle || 0, c = Math.cos(a), n = Math.sin(a), hw = s.w / 2, hd = s.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [s.x + x * c + z * n, s.z - x * n + z * c]);
}
const washOut = [0, 0, 0];

// Which ends of which pieces are a building's (or tower's) convex corner:
// the point lies in or on only one footprint (a straight run between two
// rooms, or a party line, touches two). One of its two walls owns it (the
// one facing most to the south, the camera's side): its pilaster wraps it.
function markCorners(pieces, polys) {
  const boxes = polys.map(poly => { const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]); return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]; });
  const signs = polys.map(poly => { let area = 0; for (let k = 0; k < poly.length; k++) { const p = poly[k], q = poly[(k + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; } return Math.sign(area) || 1; });
  const touches = (x, z) => {
    let n = 0;
    for (let i = 0; i < polys.length; i++) {
      const b = boxes[i]; if (x < b[0] - .05 || x > b[1] + .05 || z < b[2] - .05 || z > b[3] + .05) continue;
      const poly = polys[i], sg = signs[i]; let inside = true;
      for (let k = 0; k < poly.length && inside; k++) { const p = poly[k], q = poly[(k + 1) % poly.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (sg * ((q[0] - p[0]) * (z - p[1]) - (q[1] - p[1]) * (x - p[0])) / l < -.05) inside = false; }
      if (inside) n++;
    }
    return n;
  };
  const ends = new Map();
  for (const rec of pieces) {
    if (rec.party || rec.hidden) continue;
    for (const [end, t] of [[0, rec.from], [1, rec.from + rec.len]]) {
      if (end === 0 ? t > 1e-4 : t < rec.edgeLen - 1e-4) continue; // (not at its edge's end)
      const x = rec.ax + rec.ux * t, z = rec.az + rec.uz * t, key = `${x.toFixed(2)},${z.toFixed(2)}`;
      let list = ends.get(key); if (!list) ends.set(key, list = { x, z, recs: [] });
      list.recs.push([rec, end]);
    }
  }
  for (const { x, z, recs } of ends.values()) {
    if (touches(x, z) !== 1) continue;
    let best = null; for (const r of recs) if (!best || r[0].oz * 2 + r[0].ox > best[0].oz * 2 + best[0].ox) best = r;
    best[0].corners[best[1]] = true;
    best[0].square = best[0].square || [false, false];
    best[0].square[best[1]] = recs.length === 2 && Math.abs(recs[0][0].ox * recs[1][0].ox + recs[0][0].oz * recs[1][0].oz) < .05;
  }
}

// The signs, screens and lit panels on the walls (maps/lumen-signs.js via
// map.citySigns): where each stands and how far round it parts keep clear.
function facadeSigns(map) {
  const out = [];
  let list = [];
  try { list = map.citySigns || []; } catch { list = []; }
  for (const g of list) {
    if (!g?.at || !['neon', 'screen', 'panel'].includes(g.kind)) continue;
    const f = g.facing || 0, big = g.kind === 'neon' ? (g.size || 1) : 0;
    const vertical = typeof g.shape === 'object' && g.shape?.vertical;
    const hw = g.kind === 'neon' ? (vertical ? .5 : big * .6) + .3 : (g.w || 1) / 2 + .3, hh = g.kind === 'neon' ? (vertical ? big / 2 : big * .6) + .3 : (g.h || .5) / 2 + .3;
    out.push({ x: g.at[0], y: g.at[1], z: g.at[2], nx: Math.sin(f), nz: Math.cos(f), hw, hh });
  }
  return out;
}

const roomOutline2 = room => room.quad ? room.quad : [[room.x - room.w / 2, room.z - room.d / 2], [room.x + room.w / 2, room.z - room.d / 2], [room.x + room.w / 2, room.z + room.d / 2], [room.x - room.w / 2, room.z + room.d / 2]];
export { roomOutline };
