// Lumen stage 3: the signs, screens, street lamps and traffic lights
// (maps/lumen-signs.js) and the light pools under them (lumen-ground.js
// poolShapes). Checks claude/lumen-design.md sections 8, 12, 13, 15, 19, 20
// against the finished list.
//
// LUMEN_SIGNS_REPORT=1 node --test tests/lumen-signs.test.js  prints the measured numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { register } from 'node:module';
import * as THREE from 'three';

if (!existsSync(new URL('../src/render/city-shells.js', import.meta.url))) {
  register('data:text/javascript,' + encodeURIComponent(`export async function resolve(specifier, context, next) {
    if (specifier === './city-shells.js') return { url: 'data:text/javascript,export class CityShells { constructor() {} }', shortCircuit: true };
    return next(specifier, context);
  }`));
}
const { maps, mapColliders, mapHash, buildingOpenings } = await import('../src/maps.js');
const { lumenFurnitureLights } = await import('../src/maps/lumen-breakables.js');
const { lumenVehiclePools } = await import('../src/maps/lumen-vehicle-lights.js');
const LS = await import('../src/maps/lumen-signs.js');
const { LUMEN_DETAIL_TYPES, LUMEN_DETAIL_INFO } = await import('../src/world/lumen-detail.js');
const { lumenSigns, lumenLightPools, LUMEN_SIGN_RULES, POOL_TONES, LAMP_POOL } = LS;
const { ROADS, CROSSROADS, FOOTPRINTS } = await import('../src/maps/lumen-layout.js');
const { intersections, roadGeometry, groundShapes, groundMarkings, poolShapes, POOL_TINTS, POOL_BLEND } = await import('../src/world/lumen-ground.js');
const { GLOW_PROFILE } = await import('../src/world/city-ground.js');
const { POOLS: F_POOLS } = await import('../tools/contrast-lib.mjs');
const { CityFeatures } = await import('../src/render/city-features.js');
const { WARNING_LOOP, SCREEN_MODES, NEON, NEON_OUTLINE } = await import('../src/render/city-signs.js');
const { LUMEN_PROPS } = await import('../src/maps/lumen-cover.js');

const map = maps.lumen, list = map.citySigns, R = LUMEN_SIGN_RULES;
const REPORT = !!process.env.LUMEN_SIGNS_REPORT;
const say = (...a) => { if (REPORT) console.log(...a); };

// --- Geometry ---------------------------------------------------------------
const segDistance = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
};
const inConvex = (poly, x, z) => { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]); if (c * s < 0) return false; if (c) s = Math.sign(c); } return true; };
const inPoly = (poly, x, z) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > z) !== (poly[j][1] > z) && x < (poly[j][0] - poly[i][0]) * (z - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) inside = !inside; return inside; };
// Distance to the nearest building footprint (each a union of [x0, x1, z0, z1] rectangles).
const footprintDistance = (x, z) => {
  let d = Infinity;
  for (const f of FOOTPRINTS) {
    for (const [x0, x1, z0, z1] of f.parts || []) d = Math.min(d, Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)));
    for (const q of f.quads || []) { const ring = q.length === 4 && Array.isArray(q[0]) ? q : q.poly; if (!ring) continue; d = inPoly(ring, x, z) ? 0 : Math.min(d, ...ring.map((a, i) => { const b = ring[(i + 1) % ring.length]; return segDistance(x, z, a[0], a[1], b[0], b[1]); })); }
  }
  return d;
};

const half = p => p.kind === 'neon' ? (p.size ?? 1) / 2 + R.neonMargin : p.kind === 'screen' ? p.h / 2 + R.bezel : p.kind === 'panel' ? p.h / 2 : 0;
const isBig = p => p.kind === 'screen' && (p.w * p.h >= 6 || p.mode === 'centrepiece');
// (The neon outline signs, owner 2026-09-30, are decoration that lights
// nothing: they are not in the light mix or its failing tubes; their own test is below.)
const screens = list.filter(p => p.kind === 'screen'), neons = list.filter(p => p.kind === 'neon' && !p.outline), outlines = list.filter(p => p.outline);
const lamps = list.filter(p => p.kind === 'lamp');
const signalHeads = list.filter(p => p.kind === 'signal'), pedHeads = list.filter(p => p.kind === 'ped');
const junctionOf = p => p.id.startsWith('crossroads') ? 'crossroads' : p.id.split('-').slice(0, 2).join('-');

// --- The list ---------------------------------------------------------------
test('lumen signs: plain seeded data, the same on every call, out of the map fingerprint', () => {
  const again = lumenSigns();
  assert.deepEqual(again, list);
  assert.equal(JSON.stringify(again), JSON.stringify(list));
  assert.ok(list.length > 300 && list.length < 700, `${list.length} pieces`);
  assert.ok(!Object.keys(map).includes('citySigns'), 'not enumerable: not in the fingerprint');
  assert.equal(mapHash(map), mapHash(map));
  const ids = list.map(p => p.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const p of list) {
    assert.ok(['lamp', 'pole', 'signal', 'ped', 'neon', 'screen', 'panel'].includes(p.kind), p.kind);
    assert.ok(p.at?.length === 3 && p.at.every(Number.isFinite), `${p.id} at`);
    for (const v of p.at) assert.equal(v, Math.round(v * 100) / 100, `${p.id} is rounded`);
  }
  // Plain data: JSON-safe.
  assert.deepEqual(JSON.parse(JSON.stringify(list)), list);
});

test('lumen signs: the pieces on buildings carry a valid buildingId (resolved to a cut slot by addList)', () => {
  const known = new Set(map.cityBuildings.map(b => b.id));
  let on = 0;
  for (const p of list) if (p.buildingId != null) { on++; assert.ok(known.has(p.buildingId), `${p.id}: ${p.buildingId}`); }
  assert.ok(on > 200, `${on} pieces on buildings`);
  // Street furniture has none.
  for (const p of list) if (p.kind === 'lamp' || p.kind === 'signal' || p.kind === 'ped') assert.equal(p.buildingId, undefined, p.id);
});

test('lumen signs: about 12 big screens (the flatiron prow the centrepiece) and about 40 small ones', () => {
  const big = screens.filter(isBig), small = screens.filter(p => !isBig(p));
  say('big', big.length, 'small', small.length);
  assert.ok(big.length >= 11 && big.length <= 15, `${big.length} big screens`);
  assert.ok(small.length >= 35 && small.length <= 52, `${small.length} small screens`);
  const centre = screens.filter(p => p.mode === 'centrepiece');
  assert.equal(centre.length, 1);
  const c = centre[0];
  assert.equal(c.buildingId, 'flatiron');
  // On the 5 m prow face, (33.02, 15.12)-(34.94, 10.5).
  assert.ok(segDistance(c.at[0], c.at[2], 33.02, 15.12, 34.94, 10.5) < .6, `at ${c.at}`);
  assert.ok(c.w * c.h >= 25 && c.at[1] > 8, 'the biggest screen, high');
  for (const b of big) assert.ok(b.w * b.h <= c.w * c.h);
  // Kinds of screen: towers, banners, the island's, rooftop boards, the pillars, the kiosks and shelters.
  assert.ok(screens.some(p => p.id === 'island-e') && screens.some(p => p.id === 'island-w'), 'the island screen');
  assert.ok(screens.filter(p => p.mount === 'free' && p.breakable === false).length >= 3, 'rooftop boards');
  assert.ok(screens.some(p => p.id.startsWith('pillar')) && screens.some(p => p.id.startsWith('kiosk')) && screens.some(p => p.id.startsWith('shelter')));
  assert.ok(big.filter(p => p.h >= p.w * 2).length >= 2, 'tall banners');
  // Some screens loop the warning pictograms; some are broken (frozen, glitch-torn, cracked).
  const warn = screens.filter(p => p.mode === 'warning');
  assert.ok(warn.length >= 3 && SCREEN_MODES.warning != null && WARNING_LOOP.length === 3, `${warn.length} warning screens`);
  for (const m of ['frozen', 'glitch', 'cracked']) assert.ok(screens.some(p => p.mode === m), m);
  for (const p of screens) assert.ok(SCREEN_MODES[p.mode] != null, `${p.id}: ${p.mode}`);
  assert.ok(new Set(screens.map(p => p.mode)).size >= 8, 'a good range of content');
});

// --- Street lamps -------------------------------------------------------------
test('lumen signs: lamps every 16-18 m on the main roads, sparser on side streets; LED white, sodium in the west', () => {
  assert.ok(lamps.length >= 38 && lamps.length <= 60, `${lamps.length} lamps`);
  const junctions = [...intersections().map(j => [j.x0, j.x1, j.z0, j.z1]), [CROSSROADS.x0, CROSSROADS.x1, CROSSROADS.z0, CROSSROADS.z1]];
  const along = (road, sideSign) => {
    const h = road.width / 2 + R.poleFromKerb;
    const mine = lamps.filter(l => road.axis === 'x' ? Math.abs(l.at[2] - (road.centre + sideSign * h)) < .3 : Math.abs(l.at[0] - (road.centre + sideSign * h)) < .3);
    return mine.map(l => road.axis === 'x' ? l.at[0] : l.at[2]).sort((a, b) => a - b);
  };
  const spans = [];
  for (const id of ['boulevard', 'avenue']) {
    const road = ROADS.find(r => r.id === id);
    for (const side of [-1, 1]) {
      const t = along(road, side);
      assert.ok(t.length >= 4, `${id} side ${side}: ${t.length} lamps`);
      for (let i = 1; i < t.length; i++) {
        // (a crossing road or the Crossroads between two lamps is a break in the line)
        const crossing = junctions.some(([x0, x1, z0, z1]) => road.axis === 'x' ? t[i - 1] < x1 && t[i] > x0 && z1 > road.centre - road.width && z0 < road.centre + road.width : t[i - 1] < z1 && t[i] > z0 && x1 > road.centre - road.width && x0 < road.centre + road.width);
        if (!crossing) spans.push(t[i] - t[i - 1]);
      }
    }
  }
  say('lamp spans', spans.map(s => s.toFixed(1)).join(' '));
  assert.ok(spans.length >= 4);
  spans.sort((a, b) => a - b);
  const median = spans[Math.floor(spans.length / 2)];
  assert.ok(median >= 15.5 && median <= 18.5, `median span ${median}`);
  for (const s of spans) assert.ok(s >= 10 && s <= 22, `a span of ${s} m`);
  // Side streets are sparser: fewer lamps per metre than the Boulevard.
  const perMetre = (id, side) => {
    const road = ROADS.find(r => r.id === id), h = road.width / 2 + R.poleFromKerb;
    const n = lamps.filter(l => road.axis === 'x' ? Math.abs(l.at[2] - (road.centre + side * h)) < .3 : Math.abs(l.at[0] - (road.centre + side * h)) < .3).length;
    return n / (road.to - road.from);
  };
  const main = (perMetre('boulevard', -1) + perMetre('boulevard', 1)) / 2, side = (perMetre('south-street', -1) + perMetre('south-street', 1) + perMetre('north-lane', -1) + perMetre('north-lane', 1)) / 4;
  say('lamps per metre', main, side);
  assert.ok(side < main, `side streets ${side} vs the Boulevard ${main}`);
  // Colour: sodium only in the industrial west (garage, West Street's south, South Street's west end), cold LED elsewhere.
  assert.ok(lamps.filter(l => l.colour === 'sodium').length >= 4);
  for (const l of lamps) assert.ok(l.colour === 'sodium' ? l.at[0] <= -24 && l.at[2] >= 8 : l.colour === 'coldWhite', `${l.id} ${l.colour} at ${l.at}`);
  // The failing ones: one flickers, one is dead, one sparks (and can be shot: the spark plays on it).
  assert.equal(lamps.filter(l => l.mode === 'flicker').length, 1);
  assert.equal(lamps.filter(l => l.mode === 'dead').length, 1);
  const sparking = lamps.filter(l => l.spark > 0);
  assert.equal(sparking.length, 1);
  assert.notEqual(sparking[0].breakable, false);
  // Lamps are otherwise not shootable (visuals; their poles have no colliders).
  for (const l of lamps) if (!l.spark) assert.equal(l.breakable, false, l.id);
});

test('lumen signs: poles never stand on a zebra, in a door apron, in the building-side 1.4 m of a sidewalk or in a prop', () => {
  const standing = list.filter(p => (p.kind === 'lamp' || (p.kind === 'pole' && p.buildingId == null && !/gantry/.test(p.id))));
  assert.ok(standing.length >= 70, `${standing.length} standing poles`);
  // Zebra bars (the paint's quads) and the apron of every outer door (its width + 1.4 m, 2.4 m out).
  const zebras = groundMarkings().filter(m => m.quad && m.y === .013).map(m => m.quad);
  assert.ok(zebras.length > 40, `${zebras.length} zebra bars`);
  const aprons = [];
  for (const b of map.buildings) for (const o of buildingOpenings(b)) if (o.outer) {
    const mx = (o.a.x + o.b.x) / 2, mz = (o.a.z + o.b.z) / 2, len = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) || 1, ux = (o.b.x - o.a.x) / len, uz = (o.b.z - o.a.z) / len;
    let nx = -uz, nz = ux; if ((mx + nx - b.x) ** 2 + (mz + nz - b.z) ** 2 < (mx - b.x) ** 2 + (mz - b.z) ** 2) { nx = -nx; nz = -nz; }
    const w = o.width + 1.4, out = 2.4;
    aprons.push({ id: b.id, poly: [[mx - ux * w / 2, mz - uz * w / 2], [mx + ux * w / 2, mz + uz * w / 2], [mx + ux * w / 2 + nx * out, mz + uz * w / 2 + nz * out], [mx - ux * w / 2 + nx * out, mz - uz * w / 2 + nz * out]] });
  }
  const solids = mapColliders(map).filter(c => c.propId && !c.walkOver);
  const inBox = (c, x, z) => { const a = c.angle || 0, dx = x - c.x, dz = z - c.z, lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a); return Math.abs(lx) <= (c.localW ?? c.w) / 2 && Math.abs(lz) <= (c.localD ?? c.d) / 2; };
  const bad = [];
  for (const p of standing) {
    const [x, , z] = p.at;
    if (zebras.some(q => inConvex(q, x, z))) bad.push(`${p.id} on a zebra`);
    if (aprons.some(a => inConvex(a.poly, x, z))) bad.push(`${p.id} in a door apron`);
    if (footprintDistance(x, z) < 1.4 - .01) bad.push(`${p.id} in the building-side 1.4 m (${footprintDistance(x, z).toFixed(2)})`);
    if (solids.some(c => inBox(c, x, z))) bad.push(`${p.id} in a prop`);
  }
  assert.deepEqual(bad, []);
});

// --- Traffic lights ---------------------------------------------------------
test('lumen signs: traffic lights at the five signalled junctions and the Crossroads (one blinks, one is dead with a fallen pole)', () => {
  const JUNCTIONS = intersections();
  assert.equal(JUNCTIONS.length, 5);
  const by = new Map();
  for (const h of signalHeads) { const j = junctionOf(h); by.set(j, [...(by.get(j) || []), h]); }
  for (const j of JUNCTIONS) assert.ok((by.get(j.id) || []).length >= 2, `${j.id}: ${(by.get(j.id) || []).length} heads`);
  for (const j of JUNCTIONS) {
    const states = new Set(by.get(j.id).map(h => h.state ?? 'normal'));
    assert.equal(states.size, 1, `${j.id} is coherent`);
    assert.equal([...states][0], j.signals, `${j.id} state`);
  }
  assert.equal(JUNCTIONS.filter(j => j.signals === 'blink').length, 1);
  assert.equal(JUNCTIONS.filter(j => j.signals === 'dead').length, 1);
  const dead = JUNCTIONS.find(j => j.signals === 'dead');
  assert.ok(LUMEN_PROPS.some(p => p.type === 'cityFallenPole' && p.x > dead.x0 - 5 && p.x < dead.x1 + 5 && p.z > dead.z0 - 5 && p.z < dead.z1 + 5), 'the fallen pole lies at the dead junction');
  // Heads: each approach a coherent group (group 0 east-west traffic, 1 north-south; the Cut's traffic is group 1).
  for (const [j, heads] of by) {
    for (const h of heads) assert.ok(h.group === 0 || h.group === 1, h.id);
    for (const h of heads) if (h.id.startsWith(j) && /-(W|E)-head|-(w|e)-head/.test(h.id)) assert.equal(h.group, 0, h.id);
    assert.equal(new Set(heads.map(h => h.phaseOffset)).size, 1, `${j} shares a phase`);
  }
  assert.ok(new Set([...by.values()].map(h => h[0].phaseOffset)).size >= 3, 'the junctions are not in step');
  // The Crossroads has the most; a gantry over the island carries heads; masts at the mouths.
  const crossroads = by.get('crossroads');
  for (const [j, heads] of by) if (j !== 'crossroads') assert.ok(crossroads.length > heads.length, `${j}: ${heads.length} >= the Crossroads' ${crossroads.length}`);
  assert.ok(crossroads.length >= 12);
  const gantry = list.filter(p => p.kind === 'pole' && /gantry/.test(p.id));
  assert.ok(gantry.length >= 2 && gantry.some(p => p.arm > 4), 'a gantry beam');
  for (const g of gantry) assert.ok(g.at[0] > 4 && g.at[0] < 8 && g.at[2] > -9 && g.at[2] < 0, `gantry ${g.id} over the island`);
  assert.ok(crossroads.filter(h => h.id.includes('gantry')).length >= 4 && crossroads.filter(h => !h.id.includes('gantry')).length >= 8);
  for (const h of signalHeads) assert.ok(h.at[1] > 4.5 && h.at[1] < 7, `${h.id} hangs high`);
  for (const h of signalHeads) if (h.state === 'dead') assert.equal(h.emitter, false);
  say('signal heads', Object.fromEntries([...by].map(([j, h]) => [j, h.length])));
});

test('lumen signs: pedestrian heads only at the ends of crosswalks that exist', () => {
  const C = CROSSROADS, blvd = ROADS.find(r => r.id === 'boulevard'), ave = ROADS.find(r => r.id === 'avenue');
  const walks = [];
  for (const j of intersections()) for (const cw of j.crosswalks) walks.push({ owner: j.id, ...cw });
  for (const cw of [
    { x0: C.x0, x1: C.x0 + 3, z0: -blvd.width / 2, z1: blvd.width / 2, across: 'z' }, { x0: C.x1 - 3, x1: C.x1, z0: -blvd.width / 2, z1: blvd.width / 2, across: 'z' },
    { x0: ave.centre - ave.width / 2, x1: ave.centre + ave.width / 2, z0: C.z0, z1: C.z0 + 3, across: 'x' }, { x0: ave.centre - ave.width / 2, x1: ave.centre + ave.width / 2, z0: C.z1 - 3, z1: C.z1, across: 'x' },
  ]) walks.push({ owner: 'crossroads', ...cw });
  const near = (h, cw) => {
    // at one end of the crosswalk, on the kerb beside it
    const [x, , z] = h.at;
    if (cw.across === 'x') return x > cw.x0 - 1.6 && x < cw.x1 + 1.6 && z > cw.z0 - 1.2 && z < cw.z1 + 1.2 && (Math.abs(x - cw.x0) < 1.6 || Math.abs(x - cw.x1) < 1.6);
    return z > cw.z0 - 1.6 && z < cw.z1 + 1.6 && x > cw.x0 - 1.2 && x < cw.x1 + 1.2 && (Math.abs(z - cw.z0) < 1.6 || Math.abs(z - cw.z1) < 1.6);
  };
  const per = new Map();
  for (const h of pedHeads) {
    const owner = junctionOf(h);
    assert.ok(walks.filter(w => w.owner === owner).some(cw => near(h, cw)), `${h.id} at ${h.at} is not at the end of a crosswalk`);
    per.set(owner, (per.get(owner) || 0) + 1);
  }
  // Two heads per crosswalk (one at each end); none where there is no crosswalk (the dead junction has none).
  for (const j of intersections()) assert.ok((per.get(j.id) || 0) <= 2 * j.crosswalks.length, `${j.id}: ${per.get(j.id)} ped heads for ${j.crosswalks.length} crosswalks`);
  assert.equal(per.get('south-west') || 0, 0);
  assert.equal(per.get('crossroads'), 8);
  assert.ok(pedHeads.every(h => h.at[1] < 4));
});

// --- Neon, the light mix ----------------------------------------------------------------
test('lumen signs: the light mix is about 45% white and utility light, 35% neon, 20% screens (within 8 points)', () => {
  const WHITE = new Set(['warmWhite', 'coldWhite', 'sodium', 'roseWhite']);
  const count = { white: 0, neon: 0, screen: 0 };
  for (const p of list) {
    if (p.outline) continue;
    if (p.kind === 'lamp') count.white++;
    else if (p.kind === 'screen') count.screen++;
    else if (p.kind === 'neon') count.neon++;
    else if (p.kind === 'panel') count[WHITE.has(p.colour ?? 'warmWhite') ? 'white' : 'neon']++;
  }
  const total = count.white + count.neon + count.screen, share = k => count[k] / total * 100;
  say('mix', count, Object.fromEntries(Object.keys(count).map(k => [k, share(k).toFixed(1)])));
  assert.ok(Math.abs(share('white') - 45) <= 8, `white ${share('white').toFixed(1)}%`);
  assert.ok(Math.abs(share('neon') - 35) <= 8, `neon ${share('neon').toFixed(1)}%`);
  assert.ok(Math.abs(share('screen') - 20) <= 8, `screens ${share('screen').toFixed(1)}%`);
  // Of the neon, about one in five flickers; some tubes are half dead, some blink, a few pulse (Velvet Row).
  const modes = { flicker: 0, blink: 0, pulse: 0, 'dead-segment': 0, steady: 0 };
  for (const p of neons) modes[p.mode ?? 'steady']++;
  say('neon modes', modes);
  const failing = modes.flicker + modes['dead-segment'];
  assert.ok(failing / neons.length >= .15 && failing / neons.length <= .32, `${failing} of ${neons.length} neon failing`);
  assert.ok(modes.flicker / neons.length >= .12 && modes.flicker / neons.length <= .25, `${modes.flicker} flicker`);
  assert.ok(modes['dead-segment'] >= 2 && modes.blink >= 2 && modes.pulse >= 3);
  for (const p of neons) assert.ok([undefined, 'steady', 'flicker', 'blink', 'pulse', 'dead-segment'].includes(p.mode), p.id);
});

test('lumen signs: only palette colours, none of the team hues (Amber, Cyan, Violet stay the players)', () => {
  const colours = new Set();
  for (const p of list) { if (p.colour) colours.add(p.colour); for (const c of p.palette || []) colours.add(c); }
  say('colours', [...colours].join(' '));
  for (const c of colours) assert.ok(NEON[c], `${c} is a palette colour`);
  for (const c of colours) {
    const o = {}; new THREE.Color(NEON[c]).getHSL(o);
    const deg = o.h * 360;
    if (o.s < .35 || o.l < .12) continue;
    assert.ok(!(deg > 172 && deg < 198), `${c} is cyan (${deg.toFixed(0)})`);
    assert.ok(!(deg > 262 && deg < 290 && o.s > .6), `${c} is violet (${deg.toFixed(0)})`);
  }
});

// --- The neon outline signs (owner, 2026-09-30) -----------------------------------------------
test('lumen signs: pink and electric-blue neon outlines (pictograms and invented words) on every district\'s walls, lighting nothing', () => {
  const { OUTLINES } = LS;
  assert.ok(outlines.length >= 60, `${outlines.length} outlines`);
  const byArea = {};
  for (const p of outlines) {
    assert.equal(p.kind, 'neon'); assert.ok(['pink', 'blue'].includes(p.colour), p.id);
    assert.equal(p.emitter, false, `${p.id} is no light`); assert.equal(p.glow, true); assert.equal(p.breakable, false); assert.equal(p.backing, false);
    assert.equal(p.intensity, NEON_OUTLINE.intensity);
    assert.ok(p.buildingId && map.cityBuildings.some(b => b.id === p.buildingId), p.id);
    // A pictogram (never one that reads as a letter or digit) or a word of the invented script.
    if (typeof p.shape === 'string') assert.ok(OUTLINES.pictograms.includes(p.shape) && !['ring', 'cross', 'bar', 'vbar', 'frame'].includes(p.shape), p.shape);
    else assert.ok(p.shape.glyphs >= 3 && p.shape.glyphs <= 6, p.id);
    byArea[p.area] ??= { pink: 0, blue: 0 }; byArea[p.area][p.colour]++;
  }
  say('outlines', outlines.length, byArea);
  // Every district has some, and its lead colour leads.
  for (const [area, lead] of Object.entries(OUTLINES.lead)) {
    if (!byArea[area]) { assert.ok(['charging', 'night-market', 'garage'].includes(area), `${area} has none`); continue; }
    const other = lead === 'pink' ? 'blue' : 'pink';
    if (byArea[area][lead] + byArea[area][other] >= 5) assert.ok(byArea[area][lead] > byArea[area][other], `${area}: ${lead} leads`);
  }
  // At street level and up the tall buildings.
  assert.ok(outlines.filter(p => p.at[1] < 5).length >= 35 && outlines.filter(p => p.at[1] > 7).length >= 15);
  // The street detail's wall widths the outlines keep off are world/lumen-detail.js's own.
  for (const [type, w] of Object.entries(OUTLINES.detailWalls)) assert.equal(LUMEN_DETAIL_TYPES[type]?.w, w, type);
  for (const [type, info] of Object.entries(LUMEN_DETAIL_INFO)) if (info.spot === 'wall' || info.spot === 'door') assert.ok(type in OUTLINES.detailWalls, `${type} missing from OUTLINES.detailWalls`);
  // No light: no ground pool under any of them.
  const pools = lumenLightPools(outlines);
  assert.equal(pools.length, 0);
  // Off every doorway at street level, and clear of the other pieces on their wall.
  const others = list.filter(p => !p.outline && p.buildingId && p.at && p.kind !== 'pole');
  for (const p of outlines) for (const o of others) {
    if (o.buildingId !== p.buildingId) continue;
    const d = Math.hypot(o.at[0] - p.at[0], o.at[2] - p.at[2]), dy = Math.abs(o.at[1] - p.at[1]);
    assert.ok(!(d < .3 && dy < .3), `${p.id} on top of ${o.id}`);
  }
});

test('lumen signs: an outline is tubes and a thin halo card, never an emitter (no light-pool light, no wash, no pool card)', () => {
  const view = { scene: new THREE.Scene(), static: new THREE.Group(), box: () => new THREE.Group(), qualityName: 'balanced', camera: new THREE.PerspectiveCamera(), focus: new THREE.Vector3() };
  const city = new CityFeatures(view, { ...map, citySigns: outlines, cityVehicleLights: [], city: { signs: true } }), signs = city.signs;
  assert.equal(signs.emitters.length, 0); assert.equal(city.emitters.length, 0);
  assert.equal(signs.counts.halos, outlines.length); assert.equal(signs.counts.pools, 0);
  assert.equal(signs.counts.signs, 0, 'none breakable');
  // (bare tubes, no back faces, simplified: about a hundred triangles a sign)
  assert.ok(signs.counts.signTriangles > outlines.length * 40 && signs.counts.signTriangles < outlines.length * 200, `${signs.counts.signTriangles} triangles`);
});

// --- Shootable ---------------------------------------------------------------------------
test('lumen signs: a piece breaks only if a round can reach it, and never within 15 m of a base or 2 m of a doorway', () => {
  const shootable = list.filter(p => ['neon', 'screen', 'panel'].includes(p.kind) && p.breakable !== false);
  say('shootable', shootable.length, 'of', list.filter(p => ['neon', 'screen', 'panel'].includes(p.kind)).length);
  assert.ok(shootable.length >= 30, `${shootable.length} shootable`);
  const points = map.bases.flatMap(b => b.points.map(q => [q.x, q.z]));
  const doors = [];
  for (const b of map.buildings) for (const o of buildingOpenings(b)) if (o.outer) doors.push(o);
  const bad = [];
  for (const p of shootable) {
    const [x, y, z] = p.at;
    if (y - half(p) >= 2.4 + 1e-6) bad.push(`${p.id}: lowest edge ${(y - half(p)).toFixed(2)}`);
    const nearBase = Math.min(...points.map(([bx, bz]) => Math.hypot(x - bx, z - bz)));
    if (nearBase < 15) bad.push(`${p.id}: ${nearBase.toFixed(1)} m from a base`);
    const rx = Math.cos(p.facing || 0), rz = -Math.sin(p.facing || 0), w = p.kind === 'screen' || p.kind === 'panel' ? p.w / 2 : 0;
    for (const o of doors) {
      // the sign's own span along the wall against the doorway's opening
      const d = Math.min(...[-1, -.5, 0, .5, 1].map(k => segDistance(x + rx * w * k, z + rz * w * k, o.a.x, o.a.z, o.b.x, o.b.z)));
      if (d < 2 - .02) bad.push(`${p.id}: ${d.toFixed(2)} m from a doorway (${o.type})`);
    }
  }
  assert.deepEqual(bad, []);
  // The signal heads and poles are fixed; the boards on roofs too.
  for (const p of list) if (['signal', 'ped', 'pole'].includes(p.kind)) assert.notEqual(p.breakable, true, p.id);
  for (const p of screens) if (p.mount === 'free' && p.buildingId && p.at[1] > 5) assert.equal(p.breakable, false, p.id);
});

test('lumen signs: a round along the wall breaks what it meets, once, and reports where (onShot, onBreak)', () => {
  const view = () => ({ scene: new THREE.Scene(), static: new THREE.Group(), box: () => new THREE.Group(), qualityName: 'balanced', camera: new THREE.PerspectiveCamera(), focus: new THREE.Vector3() });
  const signs = new CityFeatures(view(), { ...map, citySigns: list, city: { signs: true } }).signs;
  assert.ok(signs.counts.signs >= 30 && signs.counts.signs <= 90, `${signs.counts.signs} break slots`); // (one per shootable piece, the sparking lamp and the signals; the rest are fixed)
  const broke = [];
  signs.onBreak = (x, z, piece) => broke.push([x, z, piece.kind]);
  // A round that never goes near a sign breaks nothing.
  signs.onShot(-500, -500, -480, -480);
  assert.equal(broke.length, 0);
  const targets = list.filter(p => (p.kind === 'neon' || p.kind === 'screen') && p.breakable !== false);
  assert.ok(targets.length >= 25);
  // Through each shootable piece, at a rifle round's height, from 6 m out to half a metre behind the wall.
  let hit = 0;
  const first = targets[0];
  for (const p of targets) {
    const nx = Math.sin(p.facing), nz = Math.cos(p.facing);
    signs.onShot(p.at[0] + nx * 6, p.at[2] + nz * 6, p.at[0] - nx * .5, p.at[2] - nz * .5, .76);
    if (broke.some(([x, z]) => Math.hypot(x - p.at[0], z - p.at[2]) < 1.8)) hit++;
  }
  say('shot', hit, 'of', targets.length);
  assert.ok(hit >= targets.length * .9, `${hit} of ${targets.length} broke`);
  // A second round through the same piece does not break it again.
  const n = broke.length;
  signs.onShot(first.at[0] + Math.sin(first.facing) * 6, first.at[2] + Math.cos(first.facing) * 6, first.at[0], first.at[2], first.at[1]);
  assert.equal(broke.length, n);
  // Too low, too high, or off to the side: a miss. A fixed piece stays.
  const fresh = new CityFeatures(view(), { ...map, citySigns: list, city: { signs: true } }).signs;
  const seen = []; fresh.onBreak = (x, z) => seen.push([x, z]);
  const other = targets[targets.length - 1], ox = Math.sin(other.facing), oz = Math.cos(other.facing);
  fresh.onShot(other.at[0] + ox * 6, other.at[2] + oz * 6, other.at[0], other.at[2], 30);
  fresh.onShot(other.at[0] + ox * 6 + oz * 40, other.at[2] + oz * 6 - ox * 40, other.at[0] + oz * 40, other.at[2] - ox * 40, other.at[1]);
  assert.equal(seen.length, 0, 'a round over the piece or beside it misses');
  // The rounds fly at 0.7 to 1.3 m (renderer CITY_ROUNDS), below the signs: they break them all the same.
  for (const y of [.72, .9, 1.28]) {
    const one = new CityFeatures(view(), { ...map, citySigns: list, city: { signs: true } }).signs, got = [];
    one.onBreak = (x, z) => got.push([x, z]);
    one.onShot(other.at[0] + ox * 6, other.at[2] + oz * 6, other.at[0], other.at[2], y);
    assert.ok(got.some(([x, z]) => Math.hypot(x - other.at[0], z - other.at[2]) < 1.8), `a round at ${y} m breaks it`);
  }
  const fixed = list.find(p => p.breakable === false && p.kind === 'neon');
  fresh.onShot(fixed.at[0] + Math.sin(fixed.facing) * 6, fixed.at[2] + Math.cos(fixed.facing) * 6, fixed.at[0], fixed.at[2], fixed.at[1]);
  assert.ok(!seen.some(([x, z]) => Math.hypot(x - fixed.at[0], z - fixed.at[2]) < .5), 'a fixed piece stays');
  // No allocation per call: the shot is a loop over a typed table.
  assert.ok(ArrayBuffer.isView(signs.shotBoxes));
});

test('lumen signs: the sparking lamp and tube spark by themselves (onSpark) and come back', () => {
  const view = { scene: new THREE.Scene(), static: new THREE.Group(), box: () => new THREE.Group(), qualityName: 'balanced', camera: new THREE.PerspectiveCamera(), focus: new THREE.Vector3() };
  const city = new CityFeatures(view, { ...map, citySigns: list, city: { signs: true } }), signs = city.signs;
  assert.equal(signs.sparks.length, list.filter(p => p.spark > 0 && p.breakable !== false).length);
  assert.ok(signs.sparks.length >= 1);
  const sparked = [];
  signs.onSpark = (x, y, z) => sparked.push([x, y, z]);
  for (let t = 0; t < 200; t += 0.5) { city.uniforms.time.value = t; signs.update({ clock: t }); }
  assert.ok(sparked.length >= 2, `${sparked.length} sparks in 200 s`);
  for (const [x, y, z] of sparked) assert.ok(Number.isFinite(x + y + z));
});

// --- Light pools ---------------------------------------------------------------------------
test('lumen signs: light pools under the lamps, steady neon and screens, baked into the ground; pink and red off the roads', () => {
  const pools = lumenLightPools(list);
  const tones = {};
  for (const p of pools) tones[p.tone] = (tones[p.tone] || 0) + 1;
  say('pools', pools.length, tones);
  assert.ok(pools.length >= 60 && pools.length <= 200, `${pools.length} pools`);
  assert.deepEqual(lumenLightPools(list), pools);
  // The contrast rule's tints (tools/contrast-lib.mjs POOLS: albedo to paint with the normal blend), and nothing else.
  assert.deepEqual({ ...POOL_TINTS }, { ...POOL_TONES });
  assert.deepEqual({ ...POOL_TINTS }, Object.fromEntries(Object.entries(F_POOLS).filter(([, v]) => v)));
  assert.equal(POOL_BLEND, 'source-over');
  for (const p of pools) assert.ok(POOL_TINTS[p.tone], p.tone);
  // Fight areas are mostly white, blue, lemon and green.
  const cool = pools.filter(p => !['pink', 'red'].includes(p.tone)).length;
  assert.ok(cool / pools.length > .8, `${cool} of ${pools.length} not pink or red`);
  // Every lamp that shines steadily has one; a flickering or dead lamp none (the pool cards follow it).
  const steady = lamps.filter(l => !l.mode);
  assert.ok(steady.length > 30);
  for (const l of steady) assert.ok(pools.some(p => Math.hypot(p.x - l.at[0], p.z - l.at[2]) < 3 && p.rx === LAMP_POOL.rx), `${l.id} has a pool`);
  // Pink and red: no part on a roadway or in the Crossroads.
  const roads = ROADS.map(r => roadGeometry(r).road), C = CROSSROADS;
  const onRoad = (x, z) => roads.some(r => inPoly(r, x, z)) || (x > C.x0 && x < C.x1 && z > C.z0 && z < C.z1);
  for (const p of pools.filter(q => q.tone === 'pink' || q.tone === 'red')) {
    const ax = Math.cos(p.angle), az = Math.sin(p.angle);
    for (const [x, z] of [[p.x, p.z], [p.x + ax * p.rx, p.z + az * p.rx], [p.x - ax * p.rx, p.z - az * p.rx], [p.x - az * p.rz, p.z + ax * p.rz], [p.x + az * p.rz, p.z - ax * p.rz]]) assert.ok(!onRoad(x, z), `a ${p.tone} pool at ${p.x},${p.z} reaches the road`);
  }
  // The ground paints them: one soft glow each (a radial falloff, normal blend, no polygon), appended after the wear.
  const shapes = groundShapes(pools), plain = groundShapes();
  assert.equal(shapes.length, plain.length + pools.length);
  assert.deepEqual(shapes.slice(0, plain.length), plain);
  for (const s of shapes.slice(plain.length)) { assert.ok(!s.blend && !s.poly && !s.blur); assert.ok(s.alpha > 0 && s.alpha <= 1); assert.ok(s.glow.rx >= s.glow.rz * .5 && s.glow.rz > 1 && s.glow.rx < 9, 'an oval of a sane size'); }
  assert.deepEqual(poolShapes([]), []);
  // The falloff: 1 at the centre, 0 with no slope at the rim, never rising, smooth (no step over 12% between stops).
  assert.equal(GLOW_PROFILE[0][1], 1); assert.equal(GLOW_PROFILE.at(-1)[1], 0); assert.equal(GLOW_PROFILE.at(-1)[0], 1);
  for (let i = 1; i < GLOW_PROFILE.length; i++) { const step = GLOW_PROFILE[i - 1][1] - GLOW_PROFILE[i][1]; assert.ok(step >= 0 && step < .27, `step ${i}: ${step}`); assert.ok(GLOW_PROFILE[i][0] > GLOW_PROFILE[i - 1][0]); }
  // The map's own ground carries them, and stays out of the fingerprint.
  assert.equal(map.city.ground.shapes.length, plain.length + pools.length + lumenFurnitureLights(map.props).length + lumenVehiclePools(LUMEN_PROPS).length + LS.lumenDoors().length); // (+ the street furniture's glows and the headlight cones, stage 4; + a threshold at every outer doorway, 2026-09-30)
  assert.ok(!Object.keys(map.city).includes('ground'));
});
