#!/usr/bin/env node
// Lumen stage 5: places the street detail (world/lumen-detail.js types) and
// writes src/maps/lumen-detail.js (ids `ld<n>`, spread last into lumen.props).
// Seeded and deterministic for a given map: it reads the LIVE map (every
// other piece: the cover, the bases' screens, the breakables, the set pieces,
// the dead, the signs, the vents, the drains, the puddles) without this
// file's own pieces, so re-running it after the other stage-5 pieces land
// places round them. Then node --test tests/lumen-detail.test.js.
//   node tools/lumen-place-detail.mjs [--check] [--report]
// --check writes nothing and exits 1 if the file is stale (what it would
// write differs); --report prints the counts and what was refused and why.
//
// Where things go (claude/lumen-design.md 6, 18, 18b): drains on the water's
// storm drains, kerb inlets and litter drifts in the gutters, manholes and
// studs on the lanes, hatches, vents and butts on the sidewalks' kerb band,
// bike rails at the kerb, conduits, trays, meters, standpipes, grilles and
// image-only posters on the walls at street level (the faces the camera sees,
// off doorways and signs, under 3 m), bags, boxes, crates and pallets at the
// shop backs (the alley, the courtyard, the lots), belongings along the run
// to the metro, glass round the crashes, junk at the puddles; then a pass
// that fills every 38 x 26 m screen under 25 pieces (tools/detail-density.mjs).
// Readability: nothing on a crosswalk, a doorway's strip, the body pile's
// recess or a steam vent; nothing on the ground in a main sidewalk's
// building-side 1.4 m (the wall pieces are flat on the wall); the lanes get
// only the fittings, the crash glass and the stampede.
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { LUMEN_MODELS } from '../src/world/lumen-props.js';
import { stubView } from '../tests/lumen-stub-view.js';
import { maps, mapColliders, mapProps, PROP_TYPES, buildingContains, buildingOpenings } from '../src/maps.js';
import { ROOM_VIEW } from '../src/render/city-shells.js';
import { isPlayable } from '../src/playable-area.js';
import * as L from '../tests/lumen-place-lib.js';
import { ROADS, CROSSROADS, BACK_ALLEY, FOOTPRINTS, BASES, VELVET_LANE } from '../src/maps/lumen-layout.js';
import { roadGeometry, lumenPuddles } from '../src/world/lumen-ground.js';
import { LUMEN_VENTS } from '../src/maps/lumen-vents.js';
import { waterPlaces } from '../src/effects/lumen-water-places.js';
import { vehicleStops } from '../src/world/city-marks.js';
import { LUMEN_DETAIL_TYPES, LUMEN_DETAIL_INFO } from '../src/world/lumen-detail.js';

const OUT = new URL('../src/maps/lumen-detail.js', import.meta.url).pathname;
export const PLACE = Object.freeze({
  seed: 5831,
  apron: 1.4,          // the main sidewalks' building-side strip: no ground detail
  spacing: .25,        // m between any two pieces' footprints (this pass's)
  otherSpacing: .15,   // m from another pass's walk-over piece
  sameType: 3.5,       // m between two pieces of a type (centres), so the kinds mix
  pole: .25,           // m from a lamp or sign pole's foot
  vent: 1.1,           // m from a steam vent's centre (its cover is painted)
  drain: .7,           // m from a storm drain (only the grate stands on it)
  screen: 25,          // pieces a 38 x 26 m screen should hold
  signClear: 1.3,      // m along a wall from a sign, screen or neon under 4 m (a poster keeps off it)
  wallTop: 3,          // m: nothing on a wall above this (the facades' ground floor)
});

// ---------------------------------------------------------------------------
// The map as it stands without this file's pieces.
const full = maps.lumen;
export const isDetail = p => !!LUMEN_DETAIL_TYPES[p.type];
const base = { ...full, props: full.props.filter(p => !isDetail(p)) };
const types = LUMEN_DETAIL_TYPES, info = LUMEN_DETAIL_INFO;

const withBB = e => { e.bb = L.bounds(e.poly); return e; };
const near = (a, b, m) => a.bb.x1 + m >= b.bb.x0 && a.bb.x0 - m <= b.bb.x1 && a.bb.z1 + m >= b.bb.z0 && a.bb.z0 - m <= b.bb.z1;
export const footprintOf = q => { const t = types[q.type] || PROP_TYPES[q.type]; return withBB({ poly: L.boxPoly(q.x, q.z, t.w * (q.scale || 1), t.d * (q.scale || 1), q.angle || 0) }); };

// How high a piece's model reaches (m; its variant is seeded by the piece), built on a stand-in view.
const TOPS = new Map();
export function modelTop(q) {
  const key = `${q.type}@${q.x},${q.z}`;
  if (!TOPS.has(key)) {
    const g = new THREE.Group(); LUMEN_MODELS.get(q.type)(stubView(), { ...q }, g); g.updateMatrixWorld(true);
    TOPS.set(key, new THREE.Box3().setFromObject(g).max.y);
  }
  return TOPS.get(key);
}
// A wall piece on the outside of a room's camera-facing wall (the room's
// south face, its outward normal toward the camera): from inside that room
// the knee-wall view (render/city-shells.js ROOM_VIEW) drops the wall above
// knee height, and a piece taller than that would float over the knee wall.
// Such a wall takes only pieces under ROOM_VIEW.knee. (Local z points out of the wall.)
export function onRoomFace(q, d) {
  const nx = Math.sin(q.angle || 0), nz = Math.cos(q.angle || 0);
  if (nz <= .2) return null;
  const behind = { x: q.x - nx * (d / 2 + .45), z: q.z - nz * (d / 2 + .45) };
  return L.map.buildings.find(b => buildingContains(b, behind)) || null;
}

// A piece hung overhead (a cable span over a street: no collider, its lowest
// part well over a body): the ground under it is free. Found by building its
// model on a stand-in view once per type and spot.
const OVERHEAD = new Map();
function overhead(p) {
  if (isDetail(p) || !LUMEN_MODELS.get(p.type)) return false;
  const key = `${p.type}@${p.x},${p.z}`;
  if (!OVERHEAD.has(key)) {
    let low = 0;
    try { const g = new THREE.Group(); LUMEN_MODELS.get(p.type)(stubView(), { ...p }, g); g.updateMatrixWorld(true); low = new THREE.Box3().setFromObject(g).min.y; } catch { low = 0; }
    OVERHEAD.set(key, low > 1.2);
  }
  return OVERHEAD.get(key);
}

// Everything a detail piece must keep off, from the map as it is (built once per map).
export function obstacles(map = base) {
  // (The signs are a lazy, non-enumerable property of the map: a spread copy has none.)
  const signList = map.citySigns ?? full.citySigns;
  const props = mapProps(map), colliders = mapColliders(map);
  const withColliders = new Set(colliders.filter(c => c.propId !== undefined).map(c => c.propId));
  const solidProps = colliders.filter(c => c.propId !== undefined && !c.walkOver).map(c => withBB({ ...c, poly: L.boxPoly(c.x, c.z, c.localW ?? c.w, c.localD ?? c.d, c.angle || 0) }));
  // Walk-over pieces (with or without a box: the dead, set dressing, other detail) keep their footprint.
  const soft = props.filter(p => !withColliders.has(p.id) || colliders.some(c => c.propId === p.id && c.walkOver)).filter(p => !overhead(p)).map(p => withBB({ ...footprintOf(p), id: p.id, type: p.type }));
  const rooms = map.buildings.filter(b => !FOOTPRINTS.some(f => f.id === b.group)).map(b => withBB({ poly: b.quad || L.boxPoly(b.x, b.z, b.w, b.d, b.angle || 0), id: b.id }));
  const poles = signList.filter(s => s.kind === 'lamp' || ((s.kind === 'pole' || s.kind === 'signal' || s.kind === 'ped') && s.buildingId == null)).map(s => [s.at[0], s.at[2]]);
  const signs = signList.filter(s => s.buildingId != null && s.at[1] < 4.5).map(s => [s.at[0], s.at[2]]);
  const drains = waterPlaces(map).drains;
  return { props, solidProps, soft, rooms, poles, signs, drains, vents: LUMEN_VENTS.map(v => [v.x, v.z]) };
}

// Main sidewalks (a road's walk strips) and roadways, as polygons.
const WALKS = ROADS.flatMap(r => roadGeometry(r).walks.map(poly => withBB({ poly, road: r.id })));
const ROADWAYS = ROADS.map(r => withBB({ poly: roadGeometry(r).road, road: r.id }));
const inPoly = (poly, x, z) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [ax, az] = poly[j], [bx, bz] = poly[i]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside; } return inside; };
export const onMainWalk = (x, z) => WALKS.some(w => x >= w.bb.x0 && x <= w.bb.x1 && z >= w.bb.z0 && z <= w.bb.z1 && inPoly(w.poly, x, z));
export const onRoadway = (x, z) => ROADWAYS.some(w => x >= w.bb.x0 && x <= w.bb.x1 && z >= w.bb.z0 && z <= w.bb.z1 && inPoly(w.poly, x, z));
const inCrossroads = (x, z) => x > CROSSROADS.x0 && x < CROSSROADS.x1 && z > CROSSROADS.z0 && z < CROSSROADS.z1;

// ---------------------------------------------------------------------------
// The rules for one piece `q` against the map's obstacles `O` and the pieces
// already placed by this pass (`placed`, footprints). Returns the problems.
export function detailProblems(q, O, placed = []) {
  const t = types[q.type], I = info[q.type], out = [];
  if (!t || !I) return ['unknown type'];
  // (A door's lit frame, spot 'door': a wall piece that straddles its doorway, flat on the wall beside and over the opening.)
  const f = footprintOf(q), frame = I.spot === 'door', wall = I.spot === 'wall' || frame, solid = I.spot === 'rail';
  // Inside the outline (a wall piece: its front half; its back lies on the wall).
  const probe = wall ? f.poly.filter((_, i) => i >= 2) : f.poly;
  if (!isPlayable(L.map, q.x, q.z, wall ? 0 : .2) || probe.some(([x, z]) => !isPlayable(L.map, x, z, 0))) out.push('outside');
  for (const w of [...L.footprints, ...O.rooms]) if (near(f, w, 0) && L.penetration(f.poly, w.poly) > (wall ? .03 : .01)) { out.push(`on a building (${w.id})`); break; }
  for (const s of L.solids) if (near(f, s, s.kind === 'barricade' ? 1 : 0) && (s.kind === 'barricade' ? L.distance(f.poly, s.poly) < 1 : L.penetration(f.poly, s.poly) > (wall ? .03 : .01))) { out.push(`on a solid (${s.kind})`); break; }
  // (A storm grate is flush in the gutter: a car or a barrier may stand over it.)
  if (I.spot !== 'drain') for (const c of O.solidProps) if (near(f, c, 0) && L.penetration(f.poly, c.poly) > .01) { out.push(`on ${c.propId}`); break; }
  for (const s of O.soft) if (near(f, s, PLACE.otherSpacing) && L.distance(f.poly, s.poly) < PLACE.otherSpacing) { out.push(`on ${s.id} ${s.type}`); break; }
  for (const s of placed) if (s !== q && near(f, s.f, PLACE.spacing) && L.distance(f.poly, s.f.poly) < PLACE.spacing) { out.push(`beside ${s.type}`); break; }
  for (const s of placed) if (s !== q && s.type === q.type && Math.hypot(s.x - q.x, s.z - q.z) < (I.spot === 'drain' || I.spot === 'lane' ? 1 : PLACE.sameType)) { out.push('same type near'); break; }
  // Readability: doorways, crosswalks, the recess, vents, poles.
  if (!frame) for (const d of L.doors) if (near(f, d, 0) && L.penetration(f.poly, d.poly) > 0) { out.push(`in a doorway (${d.id})`); break; }
  for (const z of [...L.zebras, ...L.stripes]) if (near(f, z, 0) && L.penetration(f.poly, z.poly) > 0) { out.push('on a crosswalk'); break; }
  if (near(f, L.recess, .3) && L.distance(f.poly, L.recess.poly) < .3) out.push('in the body pile\'s recess');
  for (const [vx, vz] of O.vents) if (Math.hypot(vx - q.x, vz - q.z) < PLACE.vent + Math.max(t.w, t.d) / 2) { out.push('on a steam vent'); break; }
  if (I.spot !== 'drain') for (const d of O.drains) if (Math.hypot(d.x - q.x, d.z - q.z) < PLACE.drain + Math.max(t.w, t.d) / 2) { out.push('on a drain'); break; }
  for (const [px, pz] of O.poles) if (Math.abs(px - q.x) < 4 && Math.abs(pz - q.z) < 4 && L.distance(f.poly, L.boxPoly(px, pz, .02, .02)) < PLACE.pole) { out.push('at a pole'); break; }
  // The main sidewalks' building-side strip: only wall pieces (flat on the wall).
  if (!wall) for (const w of L.footprints) if (near(f, w, PLACE.apron) && L.distance(f.poly, w.poly) < PLACE.apron && f.poly.some(([x, z]) => onMainWalk(x, z))) { out.push('in a sidewalk\'s building-side 1.4 m'); break; }
  // Wall pieces: under the ground floor's top, off signs at street level.
  if (wall && !frame) for (const [sx, sz] of O.signs) if (Math.hypot(sx - q.x, sz - q.z) < PLACE.signClear + t.w / 2) { out.push('by a sign'); break; }
  if (wall) { const room = onRoomFace(q, t.d); if (room && modelTop(q) > ROOM_VIEW.knee + .01) out.push(`over a room's knee wall (${room.id})`); }
  // The one solid kind: the breakables' and cover rules.
  if (solid) out.push(...solidProblems(q, f, O, placed));
  return out;
}

function solidProblems(q, f, O, placed) {
  const out = [];
  if (inCrossroads(q.x, q.z) || L.penetration(f.poly, L.crossRect.poly) > 0) out.push('in the Crossroads');
  if (L.penetration(f.poly, L.lane.poly) > 0 || L.distance(f.poly, L.lane.poly) < 1) out.push('by the sniper lane');
  if (L.penetration(f.poly, L.alleyBox.poly) > 0) out.push('in Back Alley');
  for (const s of L.spawnPts) if (L.distance(f.poly, L.boxPoly(s.x, s.z, .02, .02)) < 1.5) { out.push('by a spawn point'); break; }
  for (const b of BASES) if (Math.hypot(b.x - q.x, b.z - q.z) < 7) { out.push('by a base'); break; }
  for (const tg of L.targetPts) if (Math.hypot(tg.x - q.x, tg.z - q.z) < 3 + (tg.travel || 0)) { out.push('by a target'); break; }
  for (const w of L.footprints) if (near(f, w, PLACE.apron) && L.distance(f.poly, w.poly) < PLACE.apron) { out.push('in the building-side 1.4 m'); break; }
  const walls = [...L.footprints, ...L.solids.filter(s => s.kind !== 'barricade')];
  const others = [...O.solidProps, ...placed.filter(p => info[p.type].spot === 'rail').map(p => p.f)];
  for (const o of [...others, ...walls]) {
    if (!near(f, o, 1.4)) continue;
    const g = L.distance(f.poly, o.poly); if (g > .7 && g < 1.4) { out.push(`gap ${g.toFixed(2)} m`); break; }
  }
  for (const [px, pz] of O.poles) if (L.distance(f.poly, L.boxPoly(px, pz, .02, .02)) < .3) { out.push('at a pole'); break; }
  return out;
}

// ---------------------------------------------------------------------------
// Where to try: samplers returning [x, z, angle] (angle: the piece's local x along the kerb or wall).
function seeded(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

// A road's line: origin, along (u), across (n), length, half width, sidewalk.
const LINES = ROADS.map(r => {
  if (r.axis === 'x') return { r, ox: r.from, oz: r.centre, ux: 1, uz: 0, nx: 0, nz: 1, len: r.to - r.from };
  if (r.axis === 'z') return { r, ox: r.centre, oz: r.from, ux: 0, uz: 1, nx: 1, nz: 0, len: r.to - r.from };
  const g = roadGeometry(r); return { r, ox: r.a[0], oz: r.a[1], ux: g.ux, uz: g.uz, nx: g.nx, nz: g.nz, len: Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) };
});
const TOTAL = LINES.reduce((s, l) => s + l.len, 0);
function pickLine(rand) { let u = rand() * TOTAL; for (const l of LINES) { if ((u -= l.len) <= 0) return l; } return LINES[0]; }
const angleOf = (ux, uz) => Math.atan2(-uz, ux); // a prop's local x along (ux, uz)
const at = (l, t, off) => [l.ox + l.ux * t + l.nx * off, l.oz + l.uz * t + l.nz * off];

// In the gutter: `inset` m in from the kerb; local -z toward the kerb.
function gutter(rand, d = .5) {
  const l = pickLine(rand), side = rand() < .5 ? -1 : 1, h = l.r.width / 2, off = side * (h - .12 - d / 2 - rand() * .25);
  const [x, z] = at(l, rand() * l.len, off);
  // local z = (sin a, cos a); point it away from the kerb (toward the road's centre: -side * n)
  const a = angleOf(l.ux, l.uz), lzx = Math.sin(a), lzz = Math.cos(a), toKerbDot = lzx * l.nx * side + lzz * l.nz * side;
  return [x, z, toKerbDot > 0 ? a + Math.PI : a];
}
// On a sidewalk's kerb band (past the building-side strip), along the kerb.
function kerb(rand, d = .5) {
  const l = pickLine(rand), side = rand() < .5 ? -1 : 1, h = l.r.width / 2, room = l.r.sidewalk - PLACE.apron - .25 - d;
  if (room <= 0) return null;
  const [x, z] = at(l, rand() * l.len, side * (h + .25 + d / 2 + rand() * room));
  return [x, z, angleOf(l.ux, l.uz) + (rand() < .5 ? 0 : Math.PI)];
}
// On a traffic lane (a manhole mid-lane, studs on a lane line).
function lane(rand) {
  const l = pickLine(rand), h = l.r.width / 2;
  const [x, z] = at(l, rand() * l.len, (rand() * 2 - 1) * (h - 1.2));
  return [x, z, angleOf(l.ux, l.uz)];
}
// Anywhere open: plazas, lots, the courtyard, sidewalks (the rules keep the strip).
function open(rand, box = [-64, 62, -57, 56]) {
  return [box[0] + rand() * (box[1] - box[0]), box[2] + rand() * (box[3] - box[2]), rand() * Math.PI * 2];
}

// Walls at street level: every footprint's outer edges (not shared with a
// neighbour), and the edge towers' inner faces, facing the camera's side
// (outward normal not north: nz > -0.2), where the ground in front is playable.
export function wallRuns(map = base) {
  const runs = [], polys = [...L.footprints.map(f => ({ poly: f.poly, id: f.id })), ...L.solids.filter(s => s.kind === 'solid' && !s.blockedIn).map(s => ({ poly: s.poly, id: 'ring' }))];
  for (const { poly, id } of polys) {
    const ccw = L.area(poly) > 0;
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], len = Math.hypot(bx - ax, bz - az); if (len < 1.2) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      // outward normal: to the right of a counter-clockwise edge in x-right z-down... test both and keep the one outside
      let nx = uz, nz = -ux; const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (inPoly(poly, mx + nx * .05, mz + nz * .05)) { nx = -nx; nz = -nz; }
      void ccw;
      if (nz < -.2) continue;
      // split into the stretches whose ground in front is open (not another building, playable)
      let start = null;
      for (let s = .3; s <= len - .3 + 1e-9; s += .3) {
        const x = ax + ux * s + nx * .3, z = az + uz * s + nz * .3;
        const ok = isPlayable(map, x, z, 0) && !L.footprints.some(f => inPoly(f.poly, x, z)) && !L.solids.some(so => so.kind !== 'barricade' && inPoly(so.poly, x, z));
        if (ok && start === null) start = s;
        if ((!ok || s + .3 > len - .3 + 1e-9) && start !== null) { const end = ok ? s : s - .3; if (end - start >= 1) runs.push({ id, ax: ax + ux * start, az: az + uz * start, ux, uz, nx, nz, len: end - start }); start = null; }
      }
    }
  }
  return runs;
}
function wallSpot(rand, runs, w, d, filter = () => true) {
  const list = runs.filter(filter); if (!list.length) return null;
  const total = list.reduce((s, r) => s + r.len, 0); let u = rand() * total, run = list[0];
  for (const r of list) { if ((u -= r.len) <= 0) { run = r; break; } }
  if (run.len < w + .2) return null;
  const s = w / 2 + .1 + rand() * (run.len - w - .2), off = d / 2 + .005;
  // local z points out of the wall: (sin a, cos a) = (nx, nz)
  return [run.ax + run.ux * s + run.nx * off, run.az + run.uz * s + run.nz * off, Math.atan2(run.nx, run.nz)];
}
// Velvet Row (stage 5 review: sparse and dark): its outer doors on the lane,
// on the faces the camera sees (outward normal not north), as
// [x, z, ux, uz, nx, nz, width] (u along the wall, n out into the lane).
export function velvetDoors(map = base) {
  const out = [];
  for (const b of map.buildings) for (const o of buildingOpenings(b)) {
    if (!o.outer) continue;
    const mx = (o.a.x + o.b.x) / 2, mz = (o.a.z + o.b.z) / 2;
    if (!VELVET_LANE.some(l => mx > l.x0 - .6 && mx < l.x1 + .6 && mz > l.z0 - .6 && mz < l.z1 + .6)) continue;
    const len = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) || 1, ux = (o.b.x - o.a.x) / len, uz = (o.b.z - o.a.z) / len;
    let nx = -uz, nz = ux; if (buildingContains(b, { x: mx + nx * .3, z: mz + nz * .3 })) { nx = -nx; nz = -nz; }
    if (nz < -.2) continue;
    out.push([mx, mz, ux, uz, nx, nz, o.width]);
  }
  return out;
}
// A door's frame on the wall round it; a strip `off` m beyond one of its edges.
const doorFrame = (door, d) => { const [x, z, , , nx, nz] = door; return [x + nx * (d / 2 + .005), z + nz * (d / 2 + .005), Math.atan2(nx, nz)]; };
const doorSide = (rand, door, d) => { const [x, z, ux, uz, nx, nz, w] = door, s = (rand() < .5 ? -1 : 1) * (w / 2 + .9 + rand() * .3); return [x + ux * s + nx * (d / 2 + .005), z + uz * s + nz * (d / 2 + .005), Math.atan2(nx, nz)]; };
// On the lane's ground within 1.2 m of its long walls (its middle stays clear), along the wall.
function velvetEdge(rand) {
  const l = VELVET_LANE[rand() < .5 ? 0 : 1], alongX = l.x1 - l.x0 > l.z1 - l.z0, side = rand() < .5 ? 0 : 1, inset = .4 + rand() * .7;
  if (alongX) return [l.x0 + .6 + rand() * (l.x1 - l.x0 - 1.2), side ? l.z1 - inset : l.z0 + inset, rand() * .3 - .15];
  return [side ? l.x1 - inset : l.x0 + inset, l.z0 + .6 + rand() * (l.z1 - l.z0 - 1.2), Math.PI / 2 + rand() * .3 - .15];
}

// At a shop's back: against a wall whose ground in front is not a main sidewalk or a road.
const backRun = r => { const x = r.ax + r.ux * r.len / 2 + r.nx * 1, z = r.az + r.uz * r.len / 2 + r.nz * 1; return !onMainWalk(x, z) && !onRoadway(x, z); };

// The run to the metro (design 6 "stampede signs", 18b Boulevard): three
// streams meeting at the Crossroads' south-east and down the metro plaza.
export const STAMPEDE = Object.freeze([
  Object.freeze([[-54, 5.5], [-40, 5.8], [-26, 6.2], [-14, 8], [-2, 9.6], [8, 12], [16, 15.5], [20, 21], [23, 29], [26, 36], [28.3, 42.6]]),
  Object.freeze([[7, -46], [7.4, -34], [8.2, -24], [9.5, -14], [11, -4], [13, 6], [16, 15.5]]),
  Object.freeze([[57, 8.6], [46, 9], [36, 9.5], [27, 11.5], [21, 16], [20, 21]]),
]);
function stampede(rand, spread = 2.6) {
  const path = STAMPEDE[rand() < .55 ? 0 : rand() < .5 ? 1 : 2];
  // Denser toward the metro: t skewed to the path's end.
  const lens = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1])), total = lens.reduce((a, b) => a + b, 0);
  let u = Math.pow(rand(), .8) * total, i = 0; while (i < lens.length - 1 && u > lens[i]) u -= lens[i++];
  const [ax, az] = path[i], [bx, bz] = path[i + 1], k = u / lens[i], ux = (bx - ax) / lens[i], uz = (bz - az) / lens[i], off = (rand() * 2 - 1) * spread;
  return [ax + (bx - ax) * k - uz * off, az + (bz - az) * k + ux * off, angleOf(ux, uz) + (rand() - .5) * .8];
}
function crash(rand, stops) {
  const list = stops.filter(s => s.kind === 'crash' || s.kind === 'taxi'); const v = list[Math.floor(rand() * list.length)];
  const a = rand() * Math.PI * 2, r = 2 + rand() * 1.8;
  return [v.x + Math.cos(a) * r, v.z + Math.sin(a) * r, rand() * Math.PI * 2];
}
function puddle(rand, puddles) {
  const p = puddles[Math.floor(rand() * puddles.length)], a = rand() * Math.PI * 2, c = Math.cos(p.angle || 0), s = Math.sin(p.angle || 0);
  const lx = Math.cos(a) * (p.rx + .25), lz = Math.sin(a) * (p.rz + .25);
  return [p.x + lx * c - lz * s, p.z + lx * s + lz * c, a];
}

// ---------------------------------------------------------------------------
// The recipe: how many of each type, by where they go (in order: the
// fittings first, then walls and backs, the scenes, then the litter; the
// screen fill last). The owner's clutter cut (2026-10-01: "too much clutter")
// took about a fifth of the ground litter: the stampede's belongings, the
// litter drifts (two mates a seed, was three), the shop backs' and the crashes'.
export const RECIPE = Object.freeze([
  ['cityDManholeRound', 5], ['cityDManholeSquare', 4], ['cityDManholeVent', 4], ['cityDHatch', 4], ['cityDValveLid', 4], ['cityDExhaustVent', 5],
  ['cityDStuds', 4], ['cityDStudsLemon', 3], ['cityDStudsRed', 3], ['cityDDrainKerb', 6],
  ['cityDBikeRailCut', 1], ['cityDBikeRail', 4],
  ['cityDConduit', 7], ['cityDCableTray', 4], ['cityDStandpipe', 4], ['cityDGasMeter', 5], ['cityDMeterBank', 3], ['cityDVentGrille', 4],
  ['cityDPoster', 6], ['cityDPosterRow', 4], ['cityDPosterTorn', 4], ['cityDStickers', 5], ['cityDPasteUp', 4],
  ['cityDBinBagSplit', 4], ['cityDBinBagFlat', 4], ['cityDBoxesFlat', 3], ['cityDBoxesWet', 3], ['cityDCrateTipped', 3], ['cityDBottleCrate', 3], ['cityDPallet', 2], ['cityDTarpScrap', 2], ['cityDCableCoil', 2],
  // (Stage 5 review: the smallest belongings read as 1-3 px specks from the camera: few of them; the
  // bags, cases and umbrellas carry the run.)
  ['cityDUmbrellaOpen', 6], ['cityDUmbrellaClosed', 7], ['cityDUmbrellaBroken', 4], ['cityDShoe', 2], ['cityDShoeHeel', 2], ['cityDShoeWork', 1], ['cityDPhone', 2], ['cityDPhoneCracked', 1],
  ['cityDBagBurst', 3], ['cityDBagBoxes', 2], ['cityDBackpack', 2], ['cityDHandbag', 2], ['cityDBriefcase', 2], ['cityDJacket', 2], ['cityDToy', 1], ['cityDGlasses', 1], ['cityDKeys', 1], ['cityDTickets', 2],
  ['cityDGlassFan', 5], ['cityDGlass', 5], ['cityDMedianDebris', 3],
  ['cityDPuddleJunk', 4], ['cityDPaperWet', 4], ['cityDFlierDrift', 5], ['cityDCanCrushed', 2],
  // Velvet Row's lit touches: a frame round each club door the camera sees, neon strips beside them, wet glints.
  ['cityDDoorGlow', 3], ['cityDNeonSide', 3], ['cityDPuddleGlint', 6],
  // The litter: each piece the seed of a cluster at a kerb or in a gutter (LITTER_CLUSTER), so it reads
  // as a drift of rubbish, not a scatter of specks.
  ['cityDCupSpill', 2], ['cityDBagTipped', 2], ['cityDPaper', 2], ['cityDFlier', 2], ['cityDCans', 2], ['cityDCup', 2], ['cityDButts', 2], ['cityDWrappers', 2], ['cityDNoodleBox', 2], ['cityDBottle', 2], ['cityDSignFallen', 2], ['cityDPipeStub', 2],
]);
// A litter cluster: round each litter seed, up to `mates` more small pieces
// `from`-`to` m off it along the kerb (its local x) and a little across.
export const LITTER_CLUSTER = Object.freeze({ mates: 2, from: .45, to: 1.1, across: .35,
  kinds: Object.freeze(['cityDPaper', 'cityDFlier', 'cityDCans', 'cityDCup', 'cityDButts', 'cityDWrappers', 'cityDBottle', 'cityDCanCrushed', 'cityDNoodleBox', 'cityDPaperWet']) });
// What the screen fill adds where a screen is sparse (small, anywhere open).
const FILL = Object.freeze(['cityDPaper', 'cityDFlier', 'cityDCans', 'cityDCup', 'cityDButts', 'cityDWrappers', 'cityDBottle', 'cityDPaperWet', 'cityDCanCrushed', 'cityDBagTipped', 'cityDValveLid', 'cityDHatch', 'cityDBinBagFlat', 'cityDBoxesFlat', 'cityDConduit', 'cityDGasMeter', 'cityDPoster', 'cityDStickers', 'cityDVentGrille']);

// ---------------------------------------------------------------------------
export function placeDetail(map = base) {
  const O = obstacles(map), rand = seeded(PLACE.seed), placed = [], refused = {};
  const runs = wallRuns(map), stops = vehicleStops(map.props), puddles = lumenPuddles(), doors = velvetDoors(map);
  const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
  const tryPut = (type, spot) => {
    if (!spot) return false;
    const q = { type, x: r2(spot[0]), z: r2(spot[1]), angle: r3(((spot[2] % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) };
    const bad = detailProblems(q, O, placed);
    if (bad.length) { const k = `${type}: ${bad[0].replace(/\(.*\)|[\d.]+ m|ld\d+|prop-\d+|lb\d+/g, '').trim()}`; refused[k] = (refused[k] || 0) + 1; return false; }
    q.f = footprintOf(q); placed.push(q); return true;
  };
  const sampler = (type) => {
    const t = types[type], I = info[type];
    switch (I.spot) {
      case 'gutter': return () => gutter(rand, t.d);
      case 'kerb': return () => kerb(rand, t.d);
      case 'rail': return () => kerb(rand, t.d);
      case 'lane': return () => lane(rand);
      case 'walk': return () => rand() < .5 ? kerb(rand, t.d) : open(rand);
      case 'wall': if (type === 'cityDNeonSide') return () => doors.length ? doorSide(rand, doors[Math.floor(rand() * doors.length)], t.d) : null;
        return () => wallSpot(rand, runs, t.w, t.d, r => !I.poster || r.id !== 'ring' || rand() < .5);
      case 'back': return () => wallSpot(rand, runs, t.w, t.d, backRun);
      case 'stampede': return () => stampede(rand);
      case 'litter': return () => rand() < .6 ? gutter(rand, t.d) : kerb(rand, t.d);
      case 'door': return () => doors.length ? doorFrame(doors[Math.floor(rand() * doors.length)], t.d) : null;
      case 'velvet': return () => velvetEdge(rand);
      case 'crash': return () => crash(rand, stops);
      case 'puddle': return () => puddle(rand, puddles);
      default: return () => rand() < .45 ? gutter(rand, t.d) : rand() < .6 ? kerb(rand, t.d) : open(rand);
    }
  };
  // A litter seed's mates (LITTER_CLUSTER), along the kerb both ways.
  const C = LITTER_CLUSTER, cluster = seed => {
    const c = Math.cos(seed.angle), s = Math.sin(seed.angle);
    for (let k = 0, put = 0; k < C.mates * 4 && put < C.mates; k++) {
      const along = (rand() < .5 ? -1 : 1) * (C.from + rand() * (C.to - C.from)), across = (rand() * 2 - 1) * C.across;
      // (local x runs along (cos a, -sin a), local z along (sin a, cos a))
      if (tryPut(C.kinds[Math.floor(rand() * C.kinds.length)], [seed.x + along * c + across * s, seed.z - along * s + across * c, seed.angle + (rand() - .5) * 1.2])) put++;
    }
  };
  // 1. The storm drains' grates: exactly on the water's drains, along the kerb.
  for (const d of O.drains) tryPut('cityDDrain', [d.x + d.nx * .03, d.z + d.nz * .03, angleOf(d.ux, d.uz) + (d.nx * Math.sin(angleOf(d.ux, d.uz)) + d.nz * Math.cos(angleOf(d.ux, d.uz)) > 0 ? Math.PI : 0)]);
  // 2. The recipe.
  for (const [type, count] of RECIPE) {
    const next = sampler(type);
    let n = 0; for (let tries = 0; n < count && tries < Math.max(info[type].spot === 'rail' ? 2000 : 300, count * 60); tries++) if (tryPut(type, next())) { n++; if (info[type].spot === 'litter') cluster(placed.at(-1)); }
  }
  // 3. The sparse screens (tools/detail-density.mjs's windows): small pieces until 25.
  const everything = () => [...mapProps(map).map(p => [p.x, p.z]), ...map.buildings.map(b => [b.x, b.z]), ...placed.map(p => [p.x, p.z])].filter(([x, z]) => isPlayable(map, x, z, 0));
  const xs = map.playableArea.map(p => p[0]), zs = map.playableArea.map(p => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  let pts = everything(), filled = 0;
  for (let cx = x0 + 19; cx <= x1 - 19 + 4; cx += 4) for (let cz = z0 + 13; cz <= z1 - 13 + 4; cz += 4) {
    if (!isPlayable(map, cx, cz, 0)) continue;
    let n = pts.filter(([x, z]) => Math.abs(x - cx) <= 19 && Math.abs(z - cz) <= 13).length;
    for (let tries = 0; n < PLACE.screen && tries < 400; tries++) {
      const type = FILL[Math.floor(rand() * FILL.length)], I = info[type], t = types[type];
      const spot = I.spot === 'wall' ? wallSpot(rand, runs, t.w, t.d, r => Math.abs(r.ax + r.ux * r.len / 2 - cx) < 19 && Math.abs(r.az + r.uz * r.len / 2 - cz) < 13)
        : I.spot === 'back' ? wallSpot(rand, runs, t.w, t.d, r => backRun(r) && Math.abs(r.ax + r.ux * r.len / 2 - cx) < 19 && Math.abs(r.az + r.uz * r.len / 2 - cz) < 13)
        : [cx + (rand() * 2 - 1) * 18, cz + (rand() * 2 - 1) * 12, rand() * Math.PI * 2];
      if (!spot || Math.abs(spot[0] - cx) > 19 || Math.abs(spot[1] - cz) > 13) continue;
      if (tryPut(type, spot)) { n++; filled++; pts.push([placed.at(-1).x, placed.at(-1).z]); }
    }
  }
  return { placed: placed.map(({ f, ...q }) => q), refused, filled };
}

export function fileText(placed) {
  const lines = placed.map((q, i) => `  { id: 'ld${i}', type: '${q.type}', x: ${q.x}, z: ${q.z}, angle: ${q.angle} },`);
  return `// Lumen stage 5: the street detail's placement (world/lumen-detail.js types),
// spread last into maps/lumen.js props. WRITTEN BY tools/lumen-place-detail.mjs:
// do not edit by hand; re-run it after moving any other piece (it places
// round everything else on the map), then node --test tests/lumen-detail.test.js.
// ${placed.length} pieces. No colliders but the bike rails' (the types say why).
export const LUMEN_DETAIL_PROPS = Object.freeze([
${lines.join('\n')}
].map(p => Object.freeze(p)));
`;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const t0 = performance.now(), { placed, refused, filled } = placeDetail(), text = fileText(placed);
  const counts = {}; for (const q of placed) counts[q.type] = (counts[q.type] || 0) + 1;
  if (process.argv.includes('--report')) {
    console.log(`${placed.length} pieces, ${Object.keys(counts).length} types, ${filled} by the screen fill (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
    const short = RECIPE.filter(([t, n]) => (counts[t] || 0) < n).map(([t, n]) => `${t} ${counts[t] || 0}/${n}`);
    if (short.length) console.log('short:', short.join(', '));
    console.log('refused:', Object.entries(refused).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${k} x${v}`).join('; '));
  }
  let old = ''; try { old = readFileSync(OUT, 'utf8'); } catch {}
  if (process.argv.includes('--check')) {
    if (old !== text) { console.error('src/maps/lumen-detail.js is stale: run node tools/lumen-place-detail.mjs'); process.exit(1); }
    console.log(`lumen-detail: up to date (${placed.length} pieces)`);
  } else { writeFileSync(OUT, text); console.log(`wrote ${OUT} (${placed.length} pieces, ${Object.keys(counts).length} types)`); }
}
