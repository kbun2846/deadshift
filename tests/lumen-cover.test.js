// Lumen stage 2: the placeholder props and where they stand (world/lumen-props.js,
// maps/lumen-cover.js). Checks the cover rules of claude/lumen-design.md
// sections 3, 6 and 9 against the finished map: cover along every road, hard
// breaks in every long line, the Crossroads' mid-range, clearances for doors,
// crossings, barricades, robots and the alley, and no piece on another.
//
// LUMEN_COVER_REPORT=1 node --test tests/lumen-cover.test.js  prints every
// violation (the assertions show only the first few) and the measured numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { maps, mapColliders, mapProps, PROP_TYPES, buildingOpenings } from '../src/maps.js';
import { isPlayable } from '../src/playable-area.js';
import { ROADS, CROSSROADS, BACK_ALLEY, FOOTPRINTS, BASES, BARRICADES } from '../src/maps/lumen-layout.js';
import { roadGeometry, groundMarkings, intersections, LUMEN_GROUND } from '../src/world/lumen-ground.js';
import { LUMEN_PROPS, SNIPER_LANE, SHOPFRONT_CAR, DENSITY_ZONES } from '../src/maps/lumen-cover.js';
import { BASE_SCREENS } from '../src/maps/lumen-spawns.js';
import { walkGrid } from '../tools/lumen-walk-lib.mjs';
import { LUMEN_PROP_TYPES, LUMEN_SHOOTABLE_DRESS, LUMEN_MODELS, makeLumenPlaceholder } from '../src/world/lumen-props.js';
import { LUMEN_BREAKABLES } from '../src/world/lumen-breakables.js';
import { LUMEN_BREAKABLE_PROPS } from '../src/maps/lumen-breakables.js';
import { LUMEN_DETAIL_TYPES } from '../src/world/lumen-detail.js';
import { LUMEN_BODY_TYPES, LUMEN_BODY_WALL_PIECES } from '../src/world/lumen-bodies.js';
import { LUMEN_SETPIECE_TYPES } from '../src/world/lumen-setpieces.js';
import { LUMEN_SETPIECE_PROPS } from '../src/maps/lumen-setpieces.js';
import { LUMEN_BODY_PROPS } from '../src/maps/lumen-bodies.js';
import { LUMEN_DETAIL_PROPS } from '../src/maps/lumen-detail.js';

const map = maps.lumen;
// The vehicles the count rule (design 6) is about: cars, vans, SUVs, wrecks and trucks (not the pileup, the bus or motorbikes).
const VEHICLES = new Set(['cityCompact', 'citySedan', 'citySuv', 'cityTaxi', 'citySports', 'cityVan', 'cityTruck', 'cityWreck']);
const REPORT = !!process.env.LUMEN_COVER_REPORT;

// The rules' numbers (claude/lumen-design.md 3, 9; the brief).
const RULES = Object.freeze({
  coverHeight: 1.1, // a body hides behind it
  coverEvery: 8, // along a road, some cover at most this far apart (edge to edge)
  breakHeight: 1.2, // a piece a round meets at any height it flies
  hardBreak: 25, // a line parallel to a road meets a break within this
  sniperReach: 31, // ... except within `sniperBand` of the sniper lane
  sniperBand: 1,
  lineStep: 1.5, startStep: 2, // lines every 1.5 m across the corridor, started every 2 m along it
  // The Crossroads (design 2, 6): no unbroken line inside it longer than 22 m, a plaza (at most 22 solid pieces, at most
  // 14 of them vehicles, the typical open ray from a grid point at least 6 m) rather than a car park, and it reads as
  // abandoned traffic, not a construction site: no hoardings, construction barriers or screen walls in it.
  crossroadsRay: 22, gridStep: 2,
  crossroadsPieces: 22, crossroadsMedian: 6, crossroadsVehicles: 14, crossroadsHeadingTol: 30, crossroadsPlanterFromCorner: 9,
  walkRatio: 1.3, // walking from the Crossroads' centre to a point just inside each mouth: at most this times the straight line
  // Vehicles on the whole map (cars, vans, SUVs, wrecks, trucks; not the pileup, the bus, motorbikes): many, but placed by
  // the density map (see DENSITY_ZONES in lumen-cover.js), and the lanes' other cover is not a construction site.
  vehiclesMin: 35, vehicles: 45, trucks: 2, hoardings: 20, hoardingsAndBarriers: 30,
  shootableFromBase: 15, // no piece dressed as a sign or a screen within this of a base (design 20)
  northSouth: 14, northSouthStep: 2, // N-S rays across the Boulevard meet cover within this
  doorClear: 2.4, // in front of an outer door
  gapLow: .7, gapHigh: 1.4, // gaps between solid pieces: under 0.7 (closed) or at least 1.4 (robots)
  barricadeClear: 1.5,
  apron: 1.4, // the building-side strip of a sidewalk stays clear
  alleyClear: 1.8,
  baseHardFree: 3.5, baseCoverNear: 3, baseCoverFar: 8.5, baseCoverPieces: 2, // spawn areas
});

// --- Geometry (convex polygons as [[x, z], ...]) ----------------------------
// A prop's box in its own frame: local x runs along world (cos a, -sin a).
const boxPoly = (x, z, w, d, a = 0) => {
  const c = Math.cos(a), s = Math.sin(a), hw = w / 2, hd = d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]);
};
const colliderPoly = c => boxPoly(c.x, c.z, c.localW ?? c.w, c.localD ?? c.d, c.angle || 0);
const bounds = poly => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of poly) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  return { x0, x1, z0, z1 };
};
const area = poly => poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
// Penetration depth of two convex polygons (positive: they overlap).
function penetration(P, Q) {
  let least = Infinity;
  for (const poly of [P, Q]) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], nx = -(b[1] - a[1]), nz = b[0] - a[0], len = Math.hypot(nx, nz) || 1;
    let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
    for (const [x, z] of P) { const v = (x * nx + z * nz) / len; if (v < p0) p0 = v; if (v > p1) p1 = v; }
    for (const [x, z] of Q) { const v = (x * nx + z * nz) / len; if (v < q0) q0 = v; if (v > q1) q1 = v; }
    least = Math.min(least, Math.min(p1, q1) - Math.max(p0, q0));
  }
  return least;
}
function pointSegment(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2)) : 0;
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}
// Distance between two convex polygons (0 when they overlap or touch).
function distance(P, Q) {
  if (penetration(P, Q) > 1e-9) return 0;
  let best = Infinity;
  for (const [A, B] of [[P, Q], [Q, P]]) for (const [x, z] of A) for (let i = 0; i < B.length; i++) best = Math.min(best, pointSegment(x, z, B[i], B[(i + 1) % B.length]));
  return best;
}
const pointIn = (poly, x, z) => { const s = Math.sign(area(poly)) || 1; return poly.every((a, i) => { const b = poly[(i + 1) % poly.length]; return s * ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0])) >= -1e-9; }); };
// First distance along the ray (ox, oz) + t (dx, dz) (unit) at which it is inside the convex polygon, or null.
function rayPoly(ox, oz, dx, dz, poly, sign) {
  let t0 = 0, t1 = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ex = b[0] - a[0], ez = b[1] - a[1];
    const f0 = sign * (ex * (oz - a[1]) - ez * (ox - a[0])), df = sign * (ex * dz - ez * dx);
    if (Math.abs(df) < 1e-12) { if (f0 < 0) return null; continue; }
    const t = -f0 / df;
    if (df > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return t0;
}

// --- The map's pieces --------------------------------------------------------
const colliders = mapColliders(map);
const propColliders = colliders.filter(c => c.propId !== undefined).map(c => ({ ...c, poly: colliderPoly(c) }));
const propsById = new Map(mapProps(map).map(p => [p.id, p]));
const footprintPolys = FOOTPRINTS.flatMap(f => [...(f.parts || []).map(([x0, x1, z0, z1]) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]), ...(f.quads || [])]
  .map(poly => ({ poly, height: f.tall ? 60 : f.low, id: f.id, kind: 'building' })));
const solidColliders = colliders.filter(c => c.solid !== undefined && c.propId === undefined).map(c => ({ ...c, poly: colliderPoly(c), kind: c.barricade ? 'barricade' : 'solid' }));
const wallColliders = colliders.filter(c => c.wall && c.solid === undefined).map(c => ({ ...c, poly: colliderPoly(c), kind: 'wall' }));
for (const list of [propColliders, solidColliders, wallColliders, footprintPolys]) for (const e of list) { e.bb = bounds(e.poly); e.sign = Math.sign(area(e.poly)) || 1; }

// What stops a round at any height it flies (design 3: the hard breaks).
const stopsRounds = e => e.kind ? (e.height ?? 60) >= RULES.breakHeight : !e.destructible && !e.walkOver && !e.playerOnly && !e.lowTop && e.height >= RULES.breakHeight;
// What a body hides behind (rule 1, 4): solid, not breakable, tall enough.
const isCover = e => e.kind ? (e.height ?? 60) >= RULES.coverHeight : !e.destructible && !e.walkOver && !e.playerOnly && e.height >= RULES.coverHeight;
const breakers = [...propColliders, ...solidColliders, ...wallColliders, ...footprintPolys].filter(stopsRounds);
const coverers = [...propColliders, ...solidColliders, ...footprintPolys].filter(isCover);

// The first thing in `set` a ray meets, as a distance (Infinity: nothing).
function firstHit(ox, oz, dx, dz, set, limit = Infinity) {
  let best = Infinity;
  for (const e of set) {
    // quick reject by the box the ray could reach
    const bb = e.bb, ex = ox + dx * Math.min(best, limit), ez = oz + dz * Math.min(best, limit);
    if (Math.max(ox, ex) < bb.x0 || Math.min(ox, ex) > bb.x1 || Math.max(oz, ez) < bb.z0 || Math.min(oz, ez) > bb.z1) continue;
    const t = rayPoly(ox, oz, dx, dz, e.poly, e.sign);
    if (t !== null && t < best) best = t;
  }
  return best;
}

// Is the point within the door apron (1.4 m) of a building?
const nearBuilding = (x, z) => { const pt = boxPoly(x, z, .02, .02); return footprintPolys.some(f => x > f.bb.x0 - RULES.apron && x < f.bb.x1 + RULES.apron && z > f.bb.z0 - RULES.apron && z < f.bb.z1 + RULES.apron && distance(pt, f.poly) < RULES.apron); };

// A list of violations: silent when empty, the first few in the message.
const REPORTED = [];
function none(name, list, shown = 8) {
  if (REPORT && list.length) console.log(`--- ${name}: ${list.length}\n${list.map(v => '  ' + v).join('\n')}`);
  REPORTED.push([name, list.length]);
  assert.equal(list.length, 0, `${name}: ${list.length} violations, e.g.\n  ${list.slice(0, shown).join('\n  ')}`);
}
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
const NUMBERS = {};

// A road's frame: unit vectors along (u) and across (n), an origin on its
// centreline, the range of `t` along it inside the playable area, and the
// corridor's half-width (roadway and sidewalks).
function roadFrame(r) {
  const half = r.width / 2 + r.sidewalk;
  if (r.axis === 'x') return { r, half, ux: 1, uz: 0, nx: 0, nz: 1, ox: 0, oz: r.centre, t0: r.from, t1: r.to };
  if (r.axis === 'z') return { r, half, ux: 0, uz: 1, nx: 1, nz: 0, ox: r.centre, oz: 0, t0: r.from, t1: r.to };
  const g = roadGeometry(r), b = BARRICADES.find(q => q.road === r.id);
  return { r, half, ux: g.ux, uz: g.uz, nx: g.nx, nz: g.nz, ox: g.a[0], oz: g.a[1], t0: 0, t1: (b.x - g.a[0]) * g.ux + (b.z - g.a[1]) * g.uz };
}
const frames = ROADS.map(roadFrame);
// A road ends where its barricade stands (its inner face): what lies beyond is
// haze, not ground anyone reaches.
for (const F of frames) for (const b of BARRICADES.filter(q => q.road === F.r.id)) {
  const bt = (b.x - F.ox) * F.ux + (b.z - F.oz) * F.uz, thick = .35;
  if (bt < (F.t0 + F.t1) / 2) F.t0 = Math.max(F.t0, bt + thick); else F.t1 = Math.min(F.t1, bt - thick);
}
const at = (F, t, s) => [F.ox + F.ux * t + F.nx * s, F.oz + F.uz * t + F.nz * s];
// The corridor as a polygon, for finding which pieces stand in a road.
const corridor = F => [at(F, F.t0, -F.half), at(F, F.t1, -F.half), at(F, F.t1, F.half), at(F, F.t0, F.half)];

// ---------------------------------------------------------------------------
test('lumen cover: every type is a city type with real sizes, and every piece names one with an explicit angle', () => {
  const names = Object.keys(LUMEN_PROP_TYPES);
  assert.ok(names.length >= 25, `${names.length} types`);
  for (const [name, t] of Object.entries(LUMEN_PROP_TYPES)) {
    assert.ok(name.startsWith('city'), name);
    assert.equal(PROP_TYPES[name], t, `${name} is in PROP_TYPES`);
    assert.ok(t.w > 0 && t.d > 0 && Array.isArray(t.collisionBoxes) && t.collisionBoxes.length, `${name} sizes`);
    for (const [x, z, w, d, h] of t.collisionBoxes) assert.ok(w > 0 && d > 0 && h > 0 && Math.abs(x) + w / 2 <= t.w / 2 + .01 && Math.abs(z) + d / 2 <= t.d / 2 + .01, `${name} box ${[x, z, w, d, h]} outside ${t.w} x ${t.d}`);
    // knee-high pieces are lowTop, cover is at least chest height
    for (const [, , , , h] of t.collisionBoxes) if (h < .7) assert.ok(t.lowTop || t.walkOver || t.health !== null, `${name}: a ${h} m box that rounds would meet`);
  }
  for (const name of ['cityCompact', 'citySedan', 'citySuv', 'cityVan', 'cityTaxi', 'citySports', 'cityWreck', 'cityPileup', 'cityMotorbike', 'cityShelter', 'cityPlanter', 'cityJersey', 'cityBollard', 'cityBench', 'cityKiosk',
    'cityDumpster', 'cityUtilityBox', 'cityAdPillar', 'cityVending', 'cityTrashBags', 'cityHydrant', 'cityConstruction', 'cityHoarding', 'cityFallenPole', 'cityIsland', 'cityCheckpointBarrier', 'cityStall', 'cityChargePost', 'cityCone'])
    assert.ok(LUMEN_PROP_TYPES[name], name);
  for (const car of ['cityCompact', 'citySedan', 'citySuv', 'cityTaxi']) assert.ok(LUMEN_PROP_TYPES[car].collisionBoxes[0][4] >= 1.4, `${car} is cover height`);
  assert.equal(LUMEN_PROP_TYPES.cityVan.blocksSight, true);
  // the hoarding: 5 x 0.4 m, 2.6 m tall, blocks sight, and is never one of the types dressed as a sign or a screen
  const h = LUMEN_PROP_TYPES.cityHoarding;
  assert.deepEqual([h.w, h.d, h.collisionBoxes[0][4], h.blocksSight, h.health], [5, .4, 2.6, true, null]);
  assert.ok(LUMEN_SHOOTABLE_DRESS.length >= 3 && LUMEN_SHOOTABLE_DRESS.every(n => LUMEN_PROP_TYPES[n]) && !LUMEN_SHOOTABLE_DRESS.includes('cityHoarding') && !LUMEN_SHOOTABLE_DRESS.includes('cityConstruction'));
  assert.ok(LUMEN_PROPS.length >= 80 && LUMEN_PROPS.length <= 220, `${LUMEN_PROPS.length} pieces`);
  for (const p of map.props) {
    assert.ok(PROP_TYPES[p.type] && (LUMEN_PROP_TYPES[p.type] || LUMEN_BREAKABLES[p.type] || LUMEN_DETAIL_TYPES[p.type] || LUMEN_BODY_TYPES[p.type] || LUMEN_SETPIECE_TYPES[p.type]), `unknown type ${p.type}`);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.angle), `${p.type} at ${p.x},${p.z} needs an explicit angle`);
  }
  // (the map's props: these, then the bases' sight screens, maps/lumen-spawns.js, then stage 4-5's)
  assert.deepEqual(map.props, [...LUMEN_PROPS, ...BASE_SCREENS, ...LUMEN_BREAKABLE_PROPS, ...LUMEN_SETPIECE_PROPS, ...LUMEN_BODY_PROPS, ...LUMEN_DETAIL_PROPS]);
});

test('lumen cover: every type has a flat grey placeholder made of a few boxes that match its collision boxes', () => {
  const GREYS = new Set(['#6b6f78', '#585c64', '#7c808a']);
  for (const [name, t] of Object.entries(LUMEN_PROP_TYPES)) {
    if (LUMEN_MODELS.has(name)) continue; // (a type with a real model, stage 4, is held by its own tests: tests/lumen-furniture.test.js)
    const boxes = [], view = { box: (x, y, z, w, h, d, colour) => { boxes.push({ x, y, z, w, h, d, colour }); return {}; } };
    makeLumenPlaceholder(view, { type: name, ...t }, {});
    assert.ok(boxes.length >= 1 && boxes.length <= 3 * t.collisionBoxes.length, `${name}: ${boxes.length} boxes`);
    for (const b of boxes) {
      assert.ok(GREYS.has(b.colour), `${name}: ${b.colour} is not one of the greys`);
      assert.ok(b.w > 0 && b.h > 0 && b.d > 0 && b.y - b.h / 2 >= -1e-9, `${name}: a box below the ground`);
    }
    // the model reaches the collision height and stays inside the footprint
    const top = Math.max(...boxes.map(b => b.y + b.h / 2)), height = Math.max(...t.collisionBoxes.map(b => b[4]));
    assert.ok(Math.abs(top - height) < .12, `${name}: model ${top.toFixed(2)} m, collision ${height} m`);
    for (const b of boxes) assert.ok(Math.abs(b.x) + b.w / 2 <= t.w / 2 + .1 && Math.abs(b.z) + b.d / 2 <= t.d / 2 + .1, `${name}: a box outside its footprint`);
  }
});

test('lumen cover: everything stands inside the playable outline', () => {
  const bad = [];
  for (const c of propColliders) {
    const id = `${c.propId} ${propsById.get(c.propId).type} at ${f1(c.x)},${f1(c.z)}`;
    if (!isPlayable(map, c.x, c.z, .3)) bad.push(id + ' (centre)');
    else if (c.poly.some(([x, z]) => !isPlayable(map, x, z, 0))) bad.push(id + ' (corner outside)');
  }
  none('outside the outline', bad);
});

test('lumen cover: no piece overlaps a building, a solid or another piece; nothing sits on the spawn', () => {
  const bad = [];
  const pieces = propColliders;
  for (const c of pieces) {
    const p = propsById.get(c.propId);
    for (const w of [...footprintPolys, ...solidColliders]) {
      if (c.bb.x1 < w.bb.x0 || c.bb.x0 > w.bb.x1 || c.bb.z1 < w.bb.z0 || c.bb.z0 > w.bb.z1) continue;
      if (penetration(c.poly, w.poly) > .02) bad.push(`${p.id} ${p.type} at ${f1(p.x)},${f1(p.z)} overlaps ${w.id ?? w.kind}`);
    }
  }
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
    const a = pieces[i], b = pieces[j];
    if (a.propId === b.propId || a.bb.x1 < b.bb.x0 || a.bb.x0 > b.bb.x1 || a.bb.z1 < b.bb.z0 || a.bb.z0 > b.bb.z1) continue;
    if (a.walkOver || b.walkOver) continue;
    if (penetration(a.poly, b.poly) > .02) { const p = propsById.get(a.propId), q = propsById.get(b.propId); bad.push(`${p.id} ${p.type} (${f1(p.x)},${f1(p.z)}) overlaps ${q.id} ${q.type} (${f1(q.x)},${f1(q.z)})`); }
  }
  for (const c of pieces) if (!c.walkOver && Math.hypot(c.x - map.spawn.x, c.z - map.spawn.z) < 1.5 + Math.max(c.w, c.d) / 2) bad.push(`${c.propId} on the spawn`);
  none('overlaps', bad);
});

test('lumen cover: rule 1, cover at most 8 m apart along every road', () => {
  const bad = []; NUMBERS.coverGap = {};
  for (const F of frames) {
    const poly = corridor(F);
    // each piece's extent along the road (its corners projected on it), for pieces standing in the corridor
    const spans = [...coverers, ...solidColliders.filter(e => e.barricade)].filter(e => penetration(e.poly, poly) > 0 && (e.kind ? e.kind !== 'solid' : true))
      .map(e => { const ts = e.poly.map(([x, z]) => (x - F.ox) * F.ux + (z - F.oz) * F.uz); return [Math.min(...ts), Math.max(...ts)]; }).sort((a, b) => a[0] - b[0]);
    let reach = F.t0, worst = 0, at0 = F.t0;
    // (Walking the centreline: the road's own ends are barricades or junctions, which are cover too.)
    for (const [a, b] of spans) {
      if (a > reach && a - reach > worst) { worst = a - reach; at0 = reach; }
      reach = Math.max(reach, b);
    }
    if (F.t1 - reach > worst) { worst = F.t1 - reach; at0 = reach; }
    NUMBERS.coverGap[F.r.id] = worst;
    if (worst > RULES.coverEvery) bad.push(`${F.r.id}: ${f1(worst)} m without cover from t=${f1(at0)} (${at(F, at0, 0).map(f1)})`);
  }
  none('cover gaps', bad);
});

test('lumen cover: rule 2, every line along a road meets a hard break within 25 m (the sniper lane within 31)', () => {
  const bad = []; NUMBERS.longest = {};
  const sniperZ = SNIPER_LANE.from[1];
  for (const F of frames) {
    let longest = 0;
    // Lines every 1.5 m from the road's centreline, except the building-side
    // 1.4 m of each sidewalk: that is the doors' apron and stays clear (design 9),
    // so nothing may stand there to break a line, and it is not sampled.
    const lines = [];
    for (let k = -Math.floor((F.half - RULES.apron) / RULES.lineStep); k <= Math.floor((F.half - RULES.apron) / RULES.lineStep); k++) lines.push(k * RULES.lineStep);
    for (const s of lines) {
      const sniper = F.r.id === 'boulevard' && Math.abs(s - (sniperZ - F.oz)) <= RULES.sniperBand;
      const limit = sniper ? RULES.sniperReach : RULES.hardBreak;
      let worst = 0, worstT = 0;
      for (let t = F.t0; t <= F.t1 + 1e-9; t += RULES.startStep) {
        const [x, z] = at(F, t, s);
        if (!isPlayable(map, x, z, .4) || nearBuilding(x, z)) continue; // (not behind a barricade, not on a door's apron)
        for (const dir of [1, -1]) {
          const d = firstHit(x, z, F.ux * dir, F.uz * dir, breakers, 80);
          if (d > worst) { worst = d; worstT = t; }
        }
      }
      if (!sniper) longest = Math.max(longest, worst);
      if (worst > limit) bad.push(`${F.r.id} line ${f1(s)} m across: ${f1(worst)} m unbroken from t=${f1(worstT)} (${at(F, worstT, s).map(f1)})`);
      if (sniper) NUMBERS.sniperLine = Math.max(NUMBERS.sniperLine || 0, worst);
    }
    NUMBERS.longest[F.r.id] = longest;
  }
  none('long lines', bad, 12);
});

test('lumen cover: rule 3, the Crossroads has no unbroken line longer than 22 m inside it, 22 solid pieces at most (abandoned traffic, no hoardings) and a median open ray of 6 m or more', () => {
  const C = CROSSROADS, bad = []; let longest = 0;
  const dirs = Array.from({ length: 16 }, (_, k) => [Math.cos(k * Math.PI / 8), Math.sin(k * Math.PI / 8)]);
  // (Grid points a body could stand on: not in a building's 1.4 m, not inside a solid piece.)
  const solidCols = propColliders.filter(c => !c.walkOver);
  const lengths = [];
  for (let x = C.x0 + 1; x < C.x1; x += RULES.gridStep) for (let z = C.z0 + 1; z < C.z1; z += RULES.gridStep) {
    if (!isPlayable(map, x, z, 0) || nearBuilding(x, z)) continue;
    const pt = boxPoly(x, z, .02, .02);
    if (solidCols.some(e => e.bb.x0 < x && e.bb.x1 > x && e.bb.z0 < z && e.bb.z1 > z && penetration(e.poly, pt) > 0)) continue;
    for (const [dx, dz] of dirs) {
      // the ray leaves the rect at ...
      const exit = Math.min(dx > 1e-9 ? (C.x1 - x) / dx : dx < -1e-9 ? (C.x0 - x) / dx : Infinity, dz > 1e-9 ? (C.z1 - z) / dz : dz < -1e-9 ? (C.z0 - z) / dz : Infinity);
      const len = Math.min(exit, firstHit(x, z, dx, dz, breakers, exit));
      lengths.push(len);
      if (len > longest) longest = len;
      if (len > RULES.crossroadsRay) bad.push(`from ${f1(x)},${f1(z)} toward ${f1(Math.atan2(dz, dx) * 180 / Math.PI)} deg: ${f1(len)} m`);
    }
  }
  NUMBERS.crossroads = longest;
  none('Crossroads lines', bad, 12);
  // It stays a five-way plaza with mid-range fights, not a car park (design 6): few pieces, long typical sightlines.
  lengths.sort((a, b) => a - b);
  NUMBERS.crossroadsMedian = lengths[lengths.length >> 1]; NUMBERS.crossroadsRays = lengths.length;
  assert.ok(NUMBERS.crossroadsMedian >= RULES.crossroadsMedian, `median open ray ${f1(NUMBERS.crossroadsMedian)} m (${RULES.crossroadsMedian} m at least)`);
  const inRect = propColliders.filter(c => !c.walkOver && penetration(c.poly, boxPoly((C.x0 + C.x1) / 2, (C.z0 + C.z1) / 2, C.x1 - C.x0, C.z1 - C.z0)) > .01);
  const pieces = [...new Set(inRect.map(c => c.propId))];
  NUMBERS.crossroadsPieces = pieces.length;
  NUMBERS.crossroadsVehicles = pieces.filter(id => VEHICLES.has(propsById.get(id).type)).length;
  assert.ok(pieces.length <= RULES.crossroadsPieces, `${pieces.length} solid pieces in the Crossroads (${RULES.crossroadsPieces} at most): ${pieces.map(id => propsById.get(id).type).join(', ')}`);
  // What may stand in it: the island and its screen, vehicles (one box truck at most) angled along a road, jersey barriers and
  // tall planters at the corners; never a hoarding, a construction barrier or a screen wall.
  const ALLOWED = new Set(['cityIsland', 'cityIslandScreen', 'cityJersey', 'cityPlanterTall', ...VEHICLES]);
  const rectPoly = boxPoly((C.x0 + C.x1) / 2, (C.z0 + C.z1) / 2, C.x1 - C.x0, C.z1 - C.z0);
  const inside = [...new Set(propColliders.filter(c => !c.walkOver && penetration(c.poly, rectPoly) > .01).map(c => c.propId))].map(id => propsById.get(id));
  const wrong = inside.filter(p => !ALLOWED.has(p.type)).map(p => `${p.type} at ${f1(p.x)},${f1(p.z)}`);
  none('pieces that do not belong in the Crossroads', wrong);
  const veh = inside.filter(p => VEHICLES.has(p.type));
  assert.ok(veh.length <= RULES.crossroadsVehicles, `${veh.length} vehicles in the Crossroads (${RULES.crossroadsVehicles} at most)`);
  assert.ok(veh.filter(p => p.type === 'cityTruck').length <= 1, 'one box truck at most in the Crossroads');
  // (headings along the Boulevard, the Avenue or the Cut, give or take 30 degrees: stopped mid-crossing or queued at a mouth)
  const roadAngles = [0, 90, -45], turn = (a, b) => { const d = Math.abs((((a - b) % 180) + 180) % 180); return Math.min(d, 180 - d); };
  const crooked = veh.filter(p => !roadAngles.some(r => turn(p.angle * 180 / Math.PI, r) <= RULES.crossroadsHeadingTol + .01)).map(p => `${p.type} at ${f1(p.x)},${f1(p.z)} heading ${f1(p.angle * 180 / Math.PI)} deg`);
  none('vehicles not angled along a road', crooked);
  const corners = [[C.x0, C.z0], [C.x1, C.z0], [C.x0, C.z1], [C.x1, C.z1]];
  const planters = inside.filter(p => p.type === 'cityPlanterTall' && Math.min(...corners.map(([cx, cz]) => Math.hypot(p.x - cx, p.z - cz))) > RULES.crossroadsPlanterFromCorner).map(p => `planter at ${f1(p.x)},${f1(p.z)}`);
  none('tall planters away from the corners', planters);
});

test('lumen cover: walking from the Crossroads centre to each mouth is at most 1.3 times the straight line', () => {
  // (0.25 m grid, radius .38: the same walk as tools/lumen-walk-lib.mjs.) The centre stays open and the middle is not boxed in.
  const grid = walkGrid(map), from = grid.walk(CROSSROADS.centre[0], CROSSROADS.centre[1]), bad = [], out = {};
  const mouths = [['W', -11, 3], ['E', 23, -3], ['N', 6, -15], ['S', 6, 15], ['Cut', 22, 14]];
  for (const [name, x, z] of mouths) {
    const straight = Math.hypot(x - CROSSROADS.centre[0], z - CROSSROADS.centre[1]), walked = grid.at(from, x, z);
    out[name] = +(walked / straight).toFixed(2);
    if (!(walked <= RULES.walkRatio * straight)) bad.push(`${name} mouth (${x},${z}): walked ${f1(walked)} m for ${f1(straight)} m straight (${(walked / straight).toFixed(2)} x)`);
  }
  NUMBERS.walkRatios = out;
  none('walks to the mouths', bad);
});

test('lumen cover: 35 to 45 vehicles (two box trucks at most), hoardings and barriers kept few, and no sign or screen type within 15 m of a base', () => {
  const vehicles = map.props.filter(p => VEHICLES.has(p.type));
  NUMBERS.vehicles = vehicles.length; NUMBERS.trucks = vehicles.filter(p => p.type === 'cityTruck').length;
  assert.ok(vehicles.length >= RULES.vehiclesMin && vehicles.length <= RULES.vehicles, `${vehicles.length} vehicles (${RULES.vehiclesMin} to ${RULES.vehicles})`);
  assert.ok(NUMBERS.trucks <= RULES.trucks, `${NUMBERS.trucks} box trucks (${RULES.trucks} at most)`);
  // (The lanes' cover is cars first; a hoarding or a construction barrier is the exception, not a construction site.)
  // (The streets' pieces; the bases' sight screens, maps/lumen-spawns.js, are counted apart: 10 at most.)
  NUMBERS.hoardings = LUMEN_PROPS.filter(p => p.type === 'cityHoarding').length;
  NUMBERS.hoardingsAndBarriers = NUMBERS.hoardings + LUMEN_PROPS.filter(p => p.type === 'cityConstruction').length;
  assert.ok(BASE_SCREENS.length <= 10, `${BASE_SCREENS.length} base screens (10 at most)`);
  assert.ok(NUMBERS.hoardings <= RULES.hoardings, `${NUMBERS.hoardings} hoardings (${RULES.hoardings} at most)`);
  assert.ok(NUMBERS.hoardingsAndBarriers <= RULES.hoardingsAndBarriers, `${NUMBERS.hoardingsAndBarriers} hoardings and construction barriers (${RULES.hoardingsAndBarriers} at most)`);
  // (Every A/B/C sight screen is a hoarding or a construction barrier: stage 3 dresses the other types as lit signs and screens a player can shoot.)
  const bad = [];
  for (const p of map.props) if (LUMEN_SHOOTABLE_DRESS.includes(p.type)) for (const b of BASES) {
    const d = Math.hypot(p.x - b.x, p.z - b.z);
    if (d < RULES.shootableFromBase) bad.push(`${p.type} at ${f1(p.x)},${f1(p.z)} is ${f1(d)} m from base ${b.id}`);
  }
  none('sign and screen types near a base', bad);
});

test('lumen cover: the density map, vehicles thick where the city jammed and thin where it did not', () => {
  // DENSITY_ZONES (maps/lumen-cover.js) names the zones: dense ones (the evacuation jam on the Boulevard's west half, the
  // Crossroads' arm mouths, the Cut, the garage frontage and the charging lot) hold at least `min` vehicles; medium ones
  // (the Avenue, South Street) between `min` and `max`; sparse ones (Uptown, West Street's north end, North Lane) at most
  // `max`, and Back Alley and Velvet Row's lane none.
  const inPoly = (poly, x, z) => poly.every((a, i) => { const b = poly[(i + 1) % poly.length]; return Math.sign(area(poly)) * ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0])) >= -1e-9; });
  const vehicles = map.props.filter(p => VEHICLES.has(p.type)), bad = [], counts = {};
  const ids = new Set(DENSITY_ZONES.map(z => z.id));
  assert.equal(ids.size, DENSITY_ZONES.length, 'zone ids are unique');
  for (const kind of ['dense', 'medium', 'sparse']) assert.ok(DENSITY_ZONES.some(z => z.density === kind), `a ${kind} zone exists`);
  for (const z of DENSITY_ZONES) {
    counts[z.id] = vehicles.filter(p => inPoly(z.poly, p.x, p.z)).length;
    if (z.min !== undefined && counts[z.id] < z.min) bad.push(`${z.id} (${z.density}) has ${counts[z.id]} vehicles, ${z.min} at least`);
    if (z.max !== undefined && counts[z.id] > z.max) bad.push(`${z.id} (${z.density}) has ${counts[z.id]} vehicles, ${z.max} at most`);
    if (z.density === 'dense' && z.min === undefined) bad.push(`${z.id}: a dense zone names its minimum`);
    if (z.density === 'sparse' && z.max === undefined) bad.push(`${z.id}: a sparse zone names its maximum`);
  }
  NUMBERS.zones = counts;
  none('density zones', bad);
  // zones do not overlap, so no vehicle is counted for two
  for (const p of vehicles) assert.ok(DENSITY_ZONES.filter(z => inPoly(z.poly, p.x, p.z)).length <= 1, `${p.type} at ${p.x},${p.z} is in two zones`);
  // the dense zones hold most of the city's cars, and their vehicles per 100 m2 are at least twice the medium zones', which
  // in turn beat the sparse zones'
  const sum = kind => DENSITY_ZONES.filter(z => z.density === kind).reduce((n, z) => n + counts[z.id], 0);
  const per100 = kind => 100 * sum(kind) / DENSITY_ZONES.filter(z => z.density === kind).reduce((m, z) => m + Math.abs(area(z.poly)), 0);
  NUMBERS.vehiclesByDensity = { dense: sum('dense'), medium: sum('medium'), sparse: sum('sparse') };
  NUMBERS.vehiclesPer100m2 = { dense: +per100('dense').toFixed(2), medium: +per100('medium').toFixed(2), sparse: +per100('sparse').toFixed(2) };
  assert.ok(sum('dense') >= vehicles.length * .6, `the dense zones hold ${sum('dense')} of ${vehicles.length} vehicles (60% at least)`);
  assert.ok(per100('dense') >= 2 * per100('medium') && per100('medium') > per100('sparse'), `vehicles per 100 m2: dense ${per100('dense').toFixed(2)}, medium ${per100('medium').toFixed(2)}, sparse ${per100('sparse').toFixed(2)}`);
});

test('lumen cover: the building-side 1.4 m of every sidewalk stays clear (the shopfront car aside), and the bus shelter leaves the bus doors 1.4 m', () => {
  // NPCs walk that strip later, and the doors open onto it.
  const bad = [];
  for (const c of propColliders) {
    const p = propsById.get(c.propId);
    if (p.x === SHOPFRONT_CAR.x && p.z === SHOPFRONT_CAR.z) continue;
    // (Stage 5: the body pile and the revolving door stand on their walls by design; Back Alley's floor marks are not a sidewalk.)
    if (LUMEN_BODY_WALL_PIECES.includes(p.type) || (c.walkOver && c.bb.z0 < BACK_ALLEY.z1 && c.bb.z1 > BACK_ALLEY.z0 && c.bb.x0 < BACK_ALLEY.x1 && c.bb.x1 > BACK_ALLEY.x0)) continue;
    for (const f of footprintPolys) {
      if (c.bb.x1 + RULES.apron < f.bb.x0 || c.bb.x0 - RULES.apron > f.bb.x1 || c.bb.z1 + RULES.apron < f.bb.z0 || c.bb.z0 - RULES.apron > f.bb.z1) continue;
      const d = distance(c.poly, f.poly);
      if (d < RULES.apron - 1e-6) bad.push(`${p.type} at ${f1(p.x)},${f1(p.z)} is ${d.toFixed(2)} m from ${f.id}`);
    }
  }
  none('building-side strip', bad);
  // the shopfront car is the one exception, and it really is at the laundromat
  const shop = propColliders.filter(c => c.x === SHOPFRONT_CAR.x && c.z === SHOPFRONT_CAR.z);
  assert.ok(shop.length && shop.every(c => propsById.get(c.propId).type === 'citySedan') && footprintPolys.some(f => f.id === 'laundromat' && distance(shop[0].poly, f.poly) < RULES.apron), 'the shopfront car stands at the laundromat');
  const bus = map.buildings.filter(b => b.id.startsWith('bus')), shelters = propColliders.filter(c => propsById.get(c.propId).type === 'cityShelter'), doorBad = [];
  assert.ok(bus.length && shelters.length, 'the bus and a shelter exist');
  for (const room of bus) for (const o of buildingOpenings(room)) if (o.outer) for (const c of shelters) {
    const d = distance(c.poly, [[o.a.x, o.a.z], [o.b.x, o.b.z], [o.b.x + 1e-3, o.b.z + 1e-3]]);
    if (d < RULES.apron) doorBad.push(`shelter ${d.toFixed(2)} m from a bus door at ${f1(o.a.x)},${f1(o.a.z)}`);
  }
  none('bus doors', doorBad);
});

test('lumen cover: rule 4, north-south rays across the Boulevard meet cover within 14 m', () => {
  const blvd = ROADS.find(r => r.id === 'boulevard'), north = blvd.centre - blvd.width / 2 - blvd.sidewalk, bad = [];
  const ave = ROADS.find(r => r.id === 'avenue'), west = ROADS.find(r => r.id === 'west-street'), cut = ROADS.find(r => r.axis === 'diagonal');
  // Where the ray runs straight on down a street: the Avenue, West Street, the Cut's mouth.
  const exempt = [[ave.centre - ave.width / 2 - ave.sidewalk, ave.centre + ave.width / 2 + ave.sidewalk], [west.centre - west.width / 2 - west.sidewalk, west.centre + west.width / 2 + west.sidewalk], [cut.a[0], cut.a[0] + 6]];
  let longest = 0;
  // (Odd columns: the barricades stand at x = +-61.1 and nothing may be within 1.5 m of them, so a column
  // at x = +-60 could never have cover; x = +-59 can.)
  for (let x = -59; x <= 59; x += RULES.northSouthStep) {
    if (exempt.some(([a, b]) => x >= a && x <= b)) continue;
    const d = firstHit(x, north, 0, 1, coverers, 40);
    longest = Math.max(longest, Math.min(d, 40));
    if (d > RULES.northSouth) bad.push(`x ${x}: ${f1(d)} m from the north line`);
  }
  NUMBERS.northSouth = longest;
  none('north-south rays', bad, 12);
});

test('lumen cover: the sniper lane is 30 m, clear of everything, with cover at both ends', () => {
  const [x0, z0] = SNIPER_LANE.from, [x1, z1] = SNIPER_LANE.to;
  assert.equal(z0, z1); assert.ok(x1 - x0 >= 29.5 && x1 - x0 <= 31, `${x1 - x0} m`);
  const lane = boxPoly((x0 + x1) / 2, z0, x1 - x0 - .1, 2 * RULES.sniperBand);
  const bad = propColliders.filter(c => !c.walkOver && penetration(c.poly, lane) > 0).map(c => `${c.propId} ${propsById.get(c.propId).type} on the lane`);
  none('sniper lane', bad);
  // the ends: the lane starts at cover (the pileup) and ends at a barricade; cover on either side of the far end
  const start = firstHit(x0 + .05, z0, -1, 0, breakers, 6), end = firstHit(x1, z0, 1, 0, breakers, 6);
  assert.ok(start < 1.5, `the pileup ${f1(start)} m behind the lane's start`);
  assert.ok(end < 2, `a barricade ${f1(end)} m past the lane's end`);
  const nearEnd = propColliders.filter(c => isCover(c) && Math.abs(c.x - x1) < 5 && Math.abs(c.z - z0) < 6 && Math.abs(c.z - z0) > RULES.sniperBand + .5);
  assert.ok(nearEnd.length >= 1, 'cover beside the far end of the lane');
  const nearStart = propColliders.filter(c => isCover(c) && Math.abs(c.x - x0) < 6 && Math.abs(c.z - z0) < 6);
  assert.ok(nearStart.length >= 1, 'cover at the near end of the lane');
  NUMBERS.sniperLane = x1 - x0;
});

test('lumen cover: nothing on a zebra (except the taxi), nothing in front of a door, nothing at a barricade', () => {
  const bad = [];
  // Zebra crossings: each junction's, the Crossroads' four arms, and the scramble's diagonal stripes.
  const C = CROSSROADS, blvd = ROADS.find(r => r.id === 'boulevard'), ave = ROADS.find(r => r.id === 'avenue');
  const rects = [...intersections().flatMap(j => j.crosswalks),
    { x0: C.x0, x1: C.x0 + 3, z0: -blvd.width / 2, z1: blvd.width / 2 }, { x0: C.x1 - 3, x1: C.x1, z0: -blvd.width / 2, z1: blvd.width / 2 },
    { x0: ave.centre - ave.width / 2, x1: ave.centre + ave.width / 2, z0: C.z0, z1: C.z0 + 3 }, { x0: ave.centre - ave.width / 2, x1: ave.centre + ave.width / 2, z0: C.z1 - 3, z1: C.z1 }]
    .map(r => [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]]);
  const stripes = groundMarkings().filter(m => m.colour === LUMEN_GROUND.crosswalk).map(m => m.quad);
  // The scramble's two diagonals run corner to corner along the Crossroads' longest sightlines (every 45 degree
  // ray from a point on them stays on them), so rule 3 can only hold if a few vehicles stand on the stripes:
  // a wreck at their crossing and the odd truck or car. Nothing else, and never on an arm or a junction zebra.
  const onScramble = [];
  for (const c of propColliders) {
    const p = propsById.get(c.propId);
    if (p.type === 'cityTaxi' || p.type === 'cityBodyCoat') continue; // (design 6: the taxi stopped mid-crossing, the body beside it)
    if (rects.some(z => penetration(c.poly, z) > .01)) bad.push(`${p.id} ${p.type} at ${f1(p.x)},${f1(p.z)} is on a zebra`);
    else if (stripes.some(z => penetration(c.poly, z) > .01) && !onScramble.includes(p.id)) onScramble.push(p.id);
  }
  for (const id of onScramble) { const p = propsById.get(id); if (!/^city(Wreck|Sedan|Compact|Suv|Van|Truck|Sports)$/.test(p.type)) bad.push(`${p.id} ${p.type} at ${f1(p.x)},${f1(p.z)} is on the scramble (vehicles only)`); }
  if (onScramble.length > 6) bad.push(`${onScramble.length} pieces on the scramble's stripes (6 at most)`);
  NUMBERS.onScramble = onScramble.length;
  none('zebras', bad);

  const doors = [];
  for (const b of map.buildings) for (const o of buildingOpenings(b)) if (o.outer) {
    const mx = (o.a.x + o.b.x) / 2, mz = (o.a.z + o.b.z) / 2, len = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) || 1, ux = (o.b.x - o.a.x) / len, uz = (o.b.z - o.a.z) / len;
    let nx = -uz, nz = ux; if ((mx + nx - b.x) ** 2 + (mz + nz - b.z) ** 2 < (mx - b.x) ** 2 + (mz - b.z) ** 2) { nx = -nx; nz = -nz; }
    // the doorway's width plus .7 m each side, 2.4 m out
    const w = o.width + 1.4, out = RULES.doorClear;
    doors.push({ id: b.id, poly: [[mx - ux * w / 2, mz - uz * w / 2], [mx + ux * w / 2, mz + uz * w / 2], [mx + ux * w / 2 + nx * out, mz + uz * w / 2 + nz * out], [mx - ux * w / 2 + nx * out, mz - uz * w / 2 + nz * out]] });
  }
  NUMBERS.outerDoors = doors.length;
  for (const c of propColliders) if (!c.walkOver) for (const d of doors) if (penetration(c.poly, d.poly) > .01) bad.push(`${c.propId} ${propsById.get(c.propId).type} at ${f1(c.x)},${f1(c.z)} blocks a door of ${d.id}`);
  none('doors and zebras', bad);

  const fences = solidColliders.filter(s => s.barricade).map(s => `${s.solid}: ${propColliders.filter(c => distance(c.poly, s.poly) < RULES.barricadeClear).map(c => c.propId).join(',')}`).filter(t => !t.endsWith(': '));
  none('barricades', fences);
});

test('lumen cover: gaps between solid pieces and walls are under 0.7 m or at least 1.4 m (robots)', () => {
  const bad = [], solids = propColliders.filter(c => !c.walkOver);
  const walls = [...footprintPolys, ...solidColliders.filter(s => !s.barricade)];
  const near = (a, b, m) => a.bb.x1 + m >= b.bb.x0 && a.bb.x0 - m <= b.bb.x1 && a.bb.z1 + m >= b.bb.z0 && a.bb.z0 - m <= b.bb.z1;
  const gap = (g) => g > RULES.gapLow + .005 && g < RULES.gapHigh - .005;
  for (let i = 0; i < solids.length; i++) {
    const a = solids[i], p = propsById.get(a.propId);
    for (let j = i + 1; j < solids.length; j++) {
      const b = solids[j]; if (a.propId === b.propId || !near(a, b, RULES.gapHigh)) continue;
      const g = distance(a.poly, b.poly); if (gap(g)) bad.push(`${p.id} ${p.type} (${f1(p.x)},${f1(p.z)}) and ${b.propId} ${propsById.get(b.propId).type}: ${g.toFixed(2)} m`);
    }
    for (const w of walls) { if (!near(a, w, RULES.gapHigh)) continue; const g = distance(a.poly, w.poly); if (gap(g)) bad.push(`${p.id} ${p.type} (${f1(p.x)},${f1(p.z)}) and ${w.id ?? w.kind}: ${g.toFixed(2)} m`); }
  }
  none('gaps', bad, 12);
});

test('lumen cover: Back Alley keeps 1.8 m clear along its length and its north wall free at x -14..-10', () => {
  const A = BACK_ALLEY, bad = [];
  let narrowest = Infinity;
  for (let x = A.x0; x <= A.x1 + 1e-9; x += .25) {
    const blocked = propColliders.filter(c => !c.walkOver && c.bb.x0 <= x && c.bb.x1 >= x && c.bb.z1 > A.z0 && c.bb.z0 < A.z1)
      .map(c => { const zs = c.poly.map(p => p[1]); return [Math.max(A.z0, Math.min(...zs)), Math.min(A.z1, Math.max(...zs))]; }).sort((a, b) => a[0] - b[0]);
    let free = 0, from = A.z0;
    for (const [a, b] of blocked) { free = Math.max(free, a - from); from = Math.max(from, b); }
    free = Math.max(free, A.z1 - from); narrowest = Math.min(narrowest, free);
    if (free < RULES.alleyClear) bad.push(`x ${x}: ${f1(free)} m clear`);
  }
  NUMBERS.alleyClear = narrowest;
  const recess = boxPoly(-12, A.z0 + .6, 5, 1.2);
  for (const c of propColliders) if (!c.walkOver && propsById.get(c.propId).type !== 'cityBodyPile' && penetration(c.poly, recess) > 0) bad.push(`${c.propId} ${propsById.get(c.propId).type} in the body pile's recess`);
  none('Back Alley', bad);
});

test('lumen cover: spawn areas have no hard cover in the middle and cover within 8 m', () => {
  const bad = [];
  for (const b of BASES) {
    const centre = boxPoly(b.x, b.z, .02, .02);
    const inner = propColliders.filter(c => !c.walkOver && c.height >= .5 && distance(c.poly, centre) < RULES.baseHardFree);
    for (const c of inner) bad.push(`base ${b.id}: ${c.propId} ${propsById.get(c.propId).type} ${f1(distance(c.poly, centre))} m from the middle`);
    const ring = [...propColliders, ...footprintPolys].filter(c => isCover(c) && distance(c.poly, centre) >= RULES.baseCoverNear && distance(c.poly, centre) <= RULES.baseCoverFar);
    if (ring.length < RULES.baseCoverPieces) bad.push(`base ${b.id}: only ${ring.length} pieces of cover ${RULES.baseCoverNear}-${RULES.baseCoverFar} m away`);
    NUMBERS['base' + b.id] = ring.length;
  }
  none('spawn areas', bad);
});

test('lumen cover: the props never seal a street: every base and every road end is reachable on foot', () => {
  // A 0.5 m grid of ground a body (radius .45) can stand on; flood from the Avenue north of the Crossroads.
  const W = 260, H = 236, cell = .5, x0 = -65, z0 = -59, r = .45;
  const blocked = new Uint8Array(W * H);
  const solids = [...propColliders.filter(c => !c.walkOver), ...footprintPolys, ...solidColliders];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + (i + .5) * cell, z = z0 + (j + .5) * cell;
    if (!isPlayable(map, x, z, r)) { blocked[j * W + i] = 1; continue; }
    const pt = boxPoly(x, z, .01, .01);
    for (const e of solids) if (x > e.bb.x0 - r && x < e.bb.x1 + r && z > e.bb.z0 - r && z < e.bb.z1 + r && distance(pt, e.poly) < r) { blocked[j * W + i] = 1; break; }
  }
  const idx = (x, z) => Math.floor((z - z0) / cell) * W + Math.floor((x - x0) / cell);
  const seen = new Uint8Array(W * H), stack = [idx(2.7, -25)]; seen[stack[0]] = 1;
  assert.ok(!blocked[stack[0]]);
  while (stack.length) {
    const c = stack.pop(), i = c % W, j = (c - i) / W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue; const n = nj * W + ni; if (!seen[n] && !blocked[n]) { seen[n] = 1; stack.push(n); } }
  }
  const bad = [];
  const targets = [...BASES.map(b => [`base ${b.id}`, b.x, b.z]), ['Boulevard west end', -58, 0], ['Boulevard east end', 58, 0], ['Avenue north end', 6, -52], ['Avenue south end', 6, 52], ['West Street north end', -30, -52],
    ['South Street west end', -54, 30], ['Crossroads spawn', map.spawn.x, map.spawn.z], ['Back Alley west', -23, -23.8], ['Back Alley east', -3, -23.8], ['Velvet Row lane', -42, 44], ['charging lot', -17, 43], ['Cut end', 44, 36.5]];
  for (const [name, x, z] of targets) if (blocked[idx(x, z)] || !seen[idx(x, z)]) bad.push(`${name} at ${x},${z} is ${blocked[idx(x, z)] ? 'inside something' : 'cut off'}`);
  none('reachability', bad);
});

test('lumen cover: the numbers', () => {
  const counts = {};
  for (const p of LUMEN_PROPS) counts[p.type] = (counts[p.type] || 0) + 1;
  if (REPORT) console.log(JSON.stringify({ pieces: LUMEN_PROPS.length, types: Object.keys(LUMEN_PROP_TYPES).length, counts, ...NUMBERS }, null, 1));
  assert.ok(true);
});
