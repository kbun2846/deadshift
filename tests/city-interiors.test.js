// Lumen's interiors (stage 4; world/city-interiors.js, the data in
// maps/lumen-interiors-*.js, the models in render/city-interior-models.js):
// the catalogue, the rules in every furnished room (doorways, walkways, gaps,
// pockets, overlaps), the colliders, robots routing into every room by every
// door, the models (one mesh a building on the shells' material, uncut,
// within the triangle budget, never a team colour), and the stories (the
// clinic's dead, every interior its own).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { maps, mapColliders, buildingContains } from '../src/maps.js';
import { CITY_PIECES, CITY_CLASSES, CITY_ROOM_RULES, cityPieces, cityRoomCover, roomProblems, roomDoorways } from '../src/world/city-interiors.js';
import { interiorCover } from '../src/world/detailed-interiors.js';
import { LUMEN_INTERIORS, lumenInteriorDistricts } from '../src/maps/lumen-interiors.js';
import { LUMEN_BUILDINGS_SOUTH } from '../src/maps/lumen-buildings-south.js';
import { CITY_MODELS, INTERIOR_LOOK, interiorStats } from '../src/render/city-interior-models.js';
import { CITY_SYSTEMS } from '../src/render/city-registry.js';
import { CityShells } from '../src/render/city-shells.js';
import { NavGrid } from '../src/bots/nav-grid.js';
import { deltaBytes } from '../tools/contrast-lib.mjs';

const map = maps.lumen, R = CITY_ROOM_RULES;
const roomsOf = id => map.buildings.filter(b => b.group === id);
const FURNISHED = Object.keys(LUMEN_INTERIORS);

test('city interiors: the catalogue: sizes, classes (cover >= 1.3 m, low under it) and a model for every kind', () => {
  assert.ok(Object.keys(CITY_PIECES).length >= 100, `${Object.keys(CITY_PIECES).length} kinds`);
  for (const [kind, k] of Object.entries(CITY_PIECES)) {
    assert.ok(CITY_CLASSES.includes(k.cls), `${kind}: class ${k.cls}`);
    assert.ok(k.w > 0 && k.d > 0 && k.h > 0, `${kind}: size`);
    if (k.cls === 'cover') assert.ok(k.h >= R.coverMin, `${kind}: cover ${k.h} m`);
    if (k.cls === 'low') assert.ok(k.h < R.coverMin, `${kind}: low ${k.h} m`);
    assert.ok(CITY_MODELS[kind] || k.parts, `${kind} has no model`);
  }
});

test('city interiors: the index: every building once, a Lumen building, every piece in one of its rooms', () => {
  const seen = new Set();
  for (const d of lumenInteriorDistricts()) for (const id of Object.keys(d)) { assert.ok(!seen.has(id), `${id} is in two district files`); seen.add(id); }
  for (const id of FURNISHED) {
    const rooms = roomsOf(id);
    assert.ok(rooms.length, `${id} is not a Lumen building`);
    const pieces = cityPieces(id, rooms);
    assert.equal(pieces.length, LUMEN_INTERIORS[id].length, `${id}: every piece resolves`);
    for (const p of pieces) assert.ok(rooms.some(r => r.id === p.room), `${id} ${p.kind}`);
  }
});

test('city interiors: the south district is furnished, every room of it, richly', () => {
  for (const spec of LUMEN_BUILDINGS_SOUTH) {
    const rooms = roomsOf(spec.id), pieces = cityPieces(spec.id, rooms);
    assert.ok(pieces.length >= 15, `${spec.id}: ${pieces.length} pieces`);
    for (const r of rooms) assert.ok(pieces.filter(p => p.room === r.id).length >= 2, `${r.id} is bare`);
    assert.ok(pieces.some(p => p.cls !== 'walkOver'), `${spec.id} has nothing solid`);
  }
});

test('city interiors: every furnished room keeps the rules (doorways clear, walkways, no body-wide gaps, no pockets, no overlaps)', () => {
  const problems = [];
  for (const id of FURNISHED) { const rooms = roomsOf(id), pieces = cityPieces(id, rooms); for (const r of rooms) problems.push(...roomProblems(r, pieces)); }
  assert.deepEqual(problems, []);
});

test('city interiors: the rules catch what they should (a piece in a doorway, a body-wide gap, a pocket)', () => {
  const room = roomsOf('bar').find(r => r.room === 'pool-room'), pieces = cityPieces('bar', roomsOf('bar'));
  const extra = (list) => [...pieces, ...list.map((p, i) => ({ index: 900 + i, room: room.id, cls: 'cover', h: 1.5, ...p, poly: [[p.x - p.w / 2, p.z - p.d / 2], [p.x + p.w / 2, p.z - p.d / 2], [p.x + p.w / 2, p.z + p.d / 2], [p.x - p.w / 2, p.z + p.d / 2]] }))];
  const door = roomDoorways(room).find(d => d.outer);
  assert.ok(roomProblems(room, extra([{ kind: 'test', x: door.mx + .5, z: door.mz, w: .5, d: .5 }])).some(s => s.includes('stands in the door')));
  // a crate 1 m off the north wall, away from everything else
  assert.ok(roomProblems(room, extra([{ kind: 'test', x: -38.8, z: 41.19 + 1 + .25, w: .5, d: .5 }])).some(s => s.includes('gap to the wall')));
  // a box walling off the room's south-west corner
  assert.ok(roomProblems(room, extra([{ kind: 'test', x: -38.5, z: 44.5, w: .4, d: 2.6 }, { kind: 'test', x: -39.3, z: 44.0, w: 1.2, d: .4 }])).some(s => s.includes('cut off') || s.includes('gap')));
});

test('city interiors: every solid piece is a collider at its footprint and drawn height (cover stops rounds; low does not)', () => {
  const colliders = mapColliders(map).filter(c => c.interiorCover && c.buildingId && map.buildings.find(b => b.id === c.buildingId)?.style === 'city-room');
  let want = 0;
  for (const id of FURNISHED) for (const r of roomsOf(id)) {
    const cover = cityRoomCover(r);
    assert.deepEqual(interiorCover(r), cover);
    want += cover.length;
    for (const p of cover) {
      const hit = colliders.find(c => c.buildingId === r.id && Math.abs(c.x - (r.x + p.x)) < 1e-6 && Math.abs(c.z - (r.z + p.z)) < 1e-6 && Math.abs(c.height - p.h) < 1e-6);
      assert.ok(hit, `${r.id} ${p.kind}: no collider`);
      // (a quarter-turned piece is exact; any other turn is its box round the footprint until map-kit reads `angle`)
      assert.ok(hit.w >= p.w - 1e-6 && hit.d >= p.d - 1e-6, `${r.id} ${p.kind}: collider smaller than the piece`);
      assert.equal(p.cover, CITY_PIECES[p.kind].cls === 'cover');
    }
  }
  assert.equal(colliders.length, want);
});

test('city interiors: the furniture takes no doorway and no room\'s middle from the robots (bots/nav-grid.js)', () => {
  // Every doorway a robot gets through empty (a short way in from just
  // outside it) it gets through furnished, and on to the room's middle; every
  // furnished room keeps an open square by its middle. (Inner doorways of 1.2 to
  // 1.4 m only pass where the nav grid's 0.5 m squares line up with them: a
  // layout matter, reported, not the furniture's.)
  const all = mapColliders(map), empty = new NavGrid(map, all.filter(c => !c.interiorCover)), full = new NavGrid(map, all), lost = [];
  const reach = (nav, ax, az, bx, bz) => {
    const goal = nav.nearestOpen(bx, bz, 2); if (goal < 0) return null;
    const g = nav.centre(goal), path = nav.path(ax, az, g.x, g.z);
    if (!path?.length) return null;
    const end = path[path.length - 1]; if (Math.hypot(end.x - g.x, end.z - g.z) > .05) return null;
    let len = Math.hypot(path[0].x - ax, path[0].z - az); for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    return len;
  };
  let through = 0;
  for (const id of FURNISHED) for (const r of roomsOf(id)) {
    const cx = r.quad ? r.quad.reduce((s, p) => s + p[0], 0) / 4 : r.x, cz = r.quad ? r.quad.reduce((s, p) => s + p[1], 0) / 4 : r.z;
    const hub = full.nearestOpen(cx, cz, 2);
    if (hub < 0 || !buildingContains(r, full.centre(hub))) { lost.push(`${r.id}: no open square by its middle`); continue; }
    for (const d of roomDoorways(r)) {
      const ax = d.mx - d.nx * .75, az = d.mz - d.nz * .75, bx = d.mx + d.nx * .75, bz = d.mz + d.nz * .75;
      const was = reach(empty, ax, az, bx, bz);
      if (was === null || was > 3) continue;
      through++;
      const now = reach(full, ax, az, bx, bz);
      if (now === null || now > 3) lost.push(`${r.id}: the furniture shuts the ${d.outer ? 'door' : 'doorway from ' + d.into} at ${d.mx.toFixed(2)}, ${d.mz.toFixed(2)}`);
      else if (reach(full, bx, bz, cx, cz) === null) lost.push(`${r.id}: no way from its doorway at ${d.mx.toFixed(2)}, ${d.mz.toFixed(2)} to its middle`);
    }
  }
  assert.deepEqual(lost, []);
  assert.ok(through >= 20, `${through} doorways passable`);
});

// The models, built without WebGL with the shells (as city-shells.test.js).
const built = (() => {
  const view = { scene: new THREE.Scene() }, city = { uniforms: { cutTexture: { value: null } }, cutTexture: null };
  const shells = new CityShells(view, map, city);
  return { shells, view };
})();
const meshesOf = id => built.shells.interiors.get(id).group.children.filter(m => m.name.startsWith('interior-'));

test('city interiors: one mesh a building (plus its fine detail) on the shells\' material, never cut, within the budget', () => {
  for (const id of FURNISHED) {
    const meshes = meshesOf(id);
    assert.ok(meshes.length >= 1 && meshes.length <= 2, `${id}: ${meshes.length} meshes`);
    let tris = 0;
    for (const m of meshes) {
      assert.equal(m.material, built.shells.material, `${id}: its own material`);
      const cut = m.geometry.attributes.cityCut.array;
      // (0: the cut never moves it; a building's slot, role 0 or not, is squashed flat when you enter)
      for (let i = 0; i < cut.length; i++) if (cut[i] !== -1) assert.fail(`${id}: a vertex stamped ${cut[i]}, not -1 (never cut, never dropped by the room view)`);
      tris += m.geometry.attributes.position.count / 3;
      assert.equal(m.castShadow, false);
    }
    const cap = id === 'club' || id === 'clinic' ? 25000 : 15000;
    assert.ok(tris <= cap, `${id}: ${tris} triangles (cap ${cap})`);
    assert.ok(tris >= 1500, `${id}: only ${tris} triangles`);
  }
  assert.ok(interiorStats.buildings >= FURNISHED.length);
});

test('city interiors: no team colour anywhere in them, lit or not (15 CIEDE2000 from Amber, Cyan, Violet)', () => {
  const team = ['#ffb020', '#2ee6ff', '#b77bff'].map(h => { const v = parseInt(h.slice(1), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; });
  const seen = new Set(), c = new THREE.Color();
  for (const id of FURNISHED) for (const m of meshesOf(id)) {
    const col = m.geometry.attributes.color.array, glow = m.geometry.attributes.cityGlow.array;
    for (let i = 0; i < col.length; i += 3) {
      // what shows: the colour, and a lit part's colour plus its glow (the shader adds glow x colour), clamped
      const key = [col[i], col[i + 1], col[i + 2], glow[i], glow[i + 1], glow[i + 2]].map(v => v.toFixed(3)).join();
      if (seen.has(key)) continue; seen.add(key);
      for (const lit of [false, true]) {
        if (lit && !(glow[i] || glow[i + 1] || glow[i + 2])) continue;
        const k = j => lit ? 1 + glow[i + j] : 1;
        c.setRGB(Math.min(1, col[i] * k(0)), Math.min(1, col[i + 1] * k(1)), Math.min(1, col[i + 2] * k(2)));
        const bytes = [c.r, c.g, c.b].map(v => Math.round((v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055) * 255));
        for (const t of team) assert.ok(deltaBytes(bytes, t) >= 15, `${id}: colour ${bytes} is ${deltaBytes(bytes, t).toFixed(1)} from a team colour`);
      }
    }
  }
});

test('city interiors: the fine detail shows from Balanced up (setQuality only)', () => {
  const make = CITY_SYSTEMS.find(e => e[0] === 'interiors')[1], sys = make(built.view, map, { shells: built.shells });
  const fine = FURNISHED.map(id => meshesOf(id).find(m => m.name.startsWith('interior-detail'))).filter(Boolean);
  assert.ok(fine.length >= 8);
  for (const q of ['potato', 'performance', 'balanced', 'quality', 'extreme']) { sys.setQuality(q); for (const m of fine) assert.equal(m.visible, INTERIOR_LOOK.fineFrom.includes(q), q); }
});

test('the clinic: its four infected dead where 5b puts them, each on its bed or chair; the rest clean', () => {
  const pieces = cityPieces('clinic', roomsOf('clinic')), dead = pieces.filter(p => p.kind === 'body');
  assert.equal(dead.length, 4);
  assert.ok(dead.every(p => p.params.infected));
  const where = dead.map(p => `${p.roomId}:${p.params.pose}`).sort();
  assert.deepEqual(where, ['recovery:sheet', 'recovery:sheet', 'surgery:strapped', 'ward:reach']);
  for (const b of dead.filter(p => p.params.pose !== 'reach')) {
    const under = pieces.find(q => (q.kind === 'bed' || q.kind === 'surgical-chair') && Math.hypot(q.x - b.x, q.z - b.z) < .05 && q.deg === b.deg);
    assert.ok(under, `the ${b.params.pose} body is on nothing`);
  }
  // the one on the ward's floor reaches for the airlock (the doorway to the hall, east)
  const reach = dead.find(p => p.params.pose === 'reach'), airlock = pieces.find(p => p.kind === 'airlock-plastic');
  assert.ok(airlock.x > reach.x && Math.abs(reach.deg - 90) < 1e-9, 'reaching east, toward the airlock');
  assert.ok(pieces.filter(p => p.roomId === 'waiting').every(p => p.kind !== 'body' && p.kind !== 'stain'), 'the front stays clean');
});

test('every interior is its own: no two buildings with the same pieces, and each tells its story', () => {
  const sig = id => cityPieces(id, roomsOf(id)).map(p => p.kind).sort().join();
  assert.equal(new Set(FURNISHED.map(sig)).size, FURNISHED.length);
  const has = (id, ...kinds) => { const k = new Set(cityPieces(id, roomsOf(id)).map(p => p.kind)); for (const x of kinds) assert.ok(k.has(x), `${id} has no ${x}`); };
  has('laundromat', 'washer', 'folding-table', 'cot', 'hot-plate');
  has('clinic', 'surgical-chair', 'tool-arms', 'bed', 'airlock-plastic', 'isolation-tent', 'air-scrubber', 'floor-strip');
  has('pharmacy', 'cage-gate', 'dispensary-shelf', 'bottles', 'gondola');
  has('ev-garage', 'car-lift', 'tyre-stack', 'diagnostic-cart', 'charge-cable');
  has('fab-workshop', 'welding-station', 'sheet-rack', 'cut-sheets', 'paint-stand', 'respirator');
  has('parking', 'micro-car', 'barrier-arm', 'ticket-desk');
  has('charging-office', 'snack-shelf', 'coffee-counter', 'fridge');
  has('club', 'dance-tiles', 'bar-counter', 'vip-booth', 'dj-desk', 'velvet-rope', 'toilet-stall');
  has('bar', 'pool-table', 'jukebox', 'bar-counter');
  has('capsule-hotel', 'capsule-pods', 'side-pods', 'shoes', 'shoe-lockers');
  has('karaoke', 'karaoke-sofa', 'karaoke-table', 'jammed-door', 'wall-screen');
  // the pharmacy: one medicine stripped, its bottles scattered, the other shelves stocked
  const ph = cityPieces('pharmacy', roomsOf('pharmacy')), stripped = ph.filter(p => p.kind === 'dispensary-shelf' && p.params.v === 1);
  assert.equal(stripped.length, 1);
  assert.ok(ph.filter(p => p.kind === 'bottles').every(p => p.params.col === stripped[0].params.col));
  // the karaoke box's four rooms each laid out differently
  const ka = cityPieces('karaoke', roomsOf('karaoke'));
  const rooms = ['room-1', 'room-2', 'room-3', 'room-4'].map(r => ka.filter(p => p.roomId === r && p.cls !== 'walkOver').map(p => `${p.kind}@${p.deg}`).sort().join());
  assert.equal(new Set(rooms).size, 4);
});
