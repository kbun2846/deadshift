// Furniture inside buildings is solid, and no doorway is blocked (owner,
// 2026-09-26: "make Deadwater furniture solid; make sure it won't block much
// of the gameplay; some doors are blocked by furniture in Deadwater, fix
// that"). world/room-furniture.js places every piece and is the list both the
// renderer and mapColliders read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { maps, buildingOpenings, buildingContains, buildingPoint, mapColliders } from '../src/maps.js';
import { Simulation } from '../src/simulation.js';
import { NavGrid } from '../src/bots/nav-grid.js';
import { interiorSpawns } from '../src/net/spawn-points.js';
import { roomFurniture, solidFurniture, doorZones, hasPocket, FURNITURE, WALKWAY } from '../src/world/room-furniture.js';
import { isColonial } from '../src/world/colonial-interiors.js';

const MAPS = ['deadwater', 'dry-creek', 'hill-test', 'hollow-wick'].map(id => maps[id]);
const rooms = () => MAPS.flatMap(map => map.buildings.map(b => ({ map, b })));
// Hollow Wick's colonial rooms lay themselves out round a centre chimney, with
// their own walkway and no-pocket rules (tests/colonial-interiors.test.js):
// the door-to-centre lanes here are for the rooms room-furniture.js lays out.
const laidOut = b => !isColonial(b);
const boxOf = p => ({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2 });
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const doorsOf = b => buildingOpenings(b).filter(o => o.type === 'door').map(o => ({ side: o.side, x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 }));

test('nothing solid stands in a doorway or across the walkway from a door to the centre', () => {
  for (const { map, b } of rooms().filter(r => laidOut(r.b))) for (const zone of doorZones(b)) {
    assert.ok(zone.lane.x1 - zone.lane.x0 >= WALKWAY - 1e-9 || zone.lane.z1 - zone.lane.z0 >= WALKWAY - 1e-9);
    for (const p of solidFurniture(b)) {
      assert.ok(!overlaps(boxOf(p), zone.strip), `${map.id} ${b.id}: ${p.kind} at ${p.x}, ${p.z} is inside the ${zone.side} doorway`);
      for (const lane of [zone.lane, zone.along].filter(Boolean)) assert.ok(!overlaps(boxOf(p), lane), `${map.id} ${b.id}: ${p.kind} at ${p.x}, ${p.z} crosses the walkway from the ${zone.side} door`);
    }
  }
});

test('the doors furniture used to block are clear', () => {
  // Before: the back counter across the sheriff's and the boarding house's
  // back doors, the farmhouse's stove in its left doorway, and Test Hill's
  // plateau house counter and stool in its right doorway.
  const find = (map, id) => maps[map].buildings.find(b => b.id === id);
  for (const [map, id, side] of [['deadwater', 'sheriff', 'back'], ['deadwater', 'boarding-house', 'back'], ['deadwater', 'farmhouse', 'left'], ['hill-test', 'plateau-house', 'right']]) {
    const b = find(map, id), zone = doorZones(b).find(z => z.side === side);
    assert.ok(zone, `${id} has a ${side} door`);
    assert.ok(solidFurniture(b).every(p => !overlaps(boxOf(p), zone.strip) && !overlaps(boxOf(p), zone.lane)), `${id} ${side}`);
  }
  // The sheriff's counter is now two pieces, either side of the back door.
  assert.equal(roomFurniture(find('deadwater', 'sheriff')).filter(p => p.kind === 'counter').length, 2);
});

test('a body walks from every door to the room centre and on to every other door', () => {
  for (const map of MAPS) {
    if (!map.buildings.length) continue;
    const sim = new Simulation({ ...map, targets: [] });
    const walk = (from, to) => {
      Object.assign(sim.player, { x: from.x, z: from.z, vx: 0, vz: 0 });
      for (let i = 0; i < 600; i++) {
        const dx = to.x - sim.player.x, dz = to.z - sim.player.z, d = Math.hypot(dx, dz);
        if (d < .2) return true;
        sim.step({ moveX: dx / d, moveZ: dz / d, aimX: 1, aimZ: 0 });
      }
      return false;
    };
    for (const b of map.buildings.filter(laidOut)) {
      const doors = doorsOf(b), centre = { x: b.x, z: b.z };
      for (const a of doors) {
        assert.ok(walk(a, centre), `${map.id} ${b.id}: ${a.side} door to the centre (stuck at ${sim.player.x.toFixed(2)}, ${sim.player.z.toFixed(2)})`);
        for (const c of doors) if (c !== a) assert.ok(walk(centre, c), `${map.id} ${b.id}: centre to the ${c.side} door`);
      }
    }
  }
});

test('no pockets: every bit of floor a robot fits on is reachable from a door, and so is every spawn', () => {
  for (const map of MAPS) {
    if (!map.buildings.length) continue;
    const colliders = mapColliders(map), nav = new NavGrid(map, colliders), spawns = interiorSpawns(map, colliders);
    for (const b of map.buildings) {
      const [door] = doorsOf(b), reach = nav.flood(door.x, door.z, 80);
      // (Colonial rooms keep a player-sized body's reach, checked on a finer
      // grid in tests/colonial-interiors.test.js; the robots' half-metre
      // squares can shut a narrow way round a piece there.)
      if (laidOut(b)) for (let i = 0; i < nav.open.length; i++) if (nav.open[i] && buildingContains(b, nav.centre(i)))
        assert.ok(reach.has(i), `${map.id} ${b.id}: open floor at ${JSON.stringify(nav.centre(i))} cannot be reached`);
      // (A spawn's own square can be shut by the grid's rounding; the square
      // next to it is where a robot would stand.)
      if (laidOut(b)) for (const p of spawns.find(r => r.id === b.id)?.points || [])
        assert.ok(reach.has(nav.nearestOpen(p.x, p.z)), `${map.id} ${b.id}: spawn ${p.x}, ${p.z} cannot be reached`);
      if (!b.cargo && laidOut(b)) assert.equal(hasPocket(b, solidFurniture(b).map(boxOf)), false, `${map.id} ${b.id}`);
    }
    // Rooms still have somewhere to spawn.
    // (Colonial rooms: Hollow Wick spawns at its authored bases and points.)
    for (const b of map.buildings.filter(laidOut)) if (b.w >= 6 && b.d >= 6 && !b.cargo) assert.ok(spawns.find(r => r.id === b.id)?.points.length >= 8, `${map.id} ${b.id} spawns`);
  }
});

test('robots route through the saloon and the workshop', () => {
  const map = maps.deadwater, nav = new NavGrid(map, mapColliders(map));
  const lengthOf = (from, path) => { let length = 0, prev = from; for (const p of path) { length += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; } return length; };
  for (const id of ['saloon', 'workshop', 'sheriff', 'boarding-house']) {
    const b = map.buildings.find(q => q.id === id), doors = buildingOpenings(b).filter(o => o.type === 'door');
    // A step outside a door (a quarter of the way again from the centre).
    const out = o => { const m = { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 }; return { side: o.side, x: m.x + (m.x - b.x) * .25, z: m.z + (m.z - b.z) * .25 }; };
    for (const from of doors.map(out)) {
      // In through each door to the middle of the room, by a direct way.
      const path = nav.path(from.x, from.z, b.x, b.z), end = path?.at(-1);
      assert.ok(end && Math.hypot(end.x - b.x, end.z - b.z) < .5, `${id}: in by the ${from.side} door`);
      assert.ok(lengthOf(from, path) < Math.hypot(b.x - from.x, b.z - from.z) * 1.4 + 1, `${id}: in by the ${from.side} door directly`);
      // Out through each opposite door: the way goes through the room.
      for (const to of doors.map(out)) {
        const opposite = { front: 'back', back: 'front', left: 'right', right: 'left' }[from.side] === to.side;
        if (!opposite) continue;
        const through = nav.path(from.x, from.z, to.x, to.z);
        assert.ok(through && Math.hypot(through.at(-1).x - to.x, through.at(-1).z - to.z) < .5, `${id}: ${from.side} to ${to.side}`);
        let inside = false, prev = from;
        for (const p of through) { for (let t = 0; t <= 1; t += .1) inside ||= buildingContains(b, { x: prev.x + (p.x - prev.x) * t, z: prev.z + (p.z - prev.z) * t }); prev = p; }
        assert.ok(inside && lengthOf(from, through) < Math.hypot(to.x - from.x, to.z - from.z) * 1.3 + 1, `${id}: ${from.side} to ${to.side} goes straight through the room`);
      }
    }
  }
});

test('every piece of furniture has a collider of its footprint and height; clutter stays walk-over', () => {
  for (const { map, b } of rooms()) {
    const colliders = mapColliders({ ...map, buildings: [b], props: [], fences: [], terrain: undefined }).filter(c => c.buildingId === b.id && (c.furniture || c.interiorCover));
    const solid = solidFurniture(b);
    assert.equal(colliders.length, solid.length, `${map.id} ${b.id}`);
    solid.forEach((p, i) => {
      const c = colliders[i], at = buildingPoint(b, p.x, p.z);
      assert.ok(Math.abs(c.x - at.x) < 1e-9 && Math.abs(c.z - at.z) < 1e-9 && c.localW === p.w && c.localD === p.d, `${b.id} ${p.kind} footprint`);
      assert.ok(c.height > 0 && c.height === p.h, `${b.id} ${p.kind} height`);
      assert.ok(!c.walkOver, `${b.id} ${p.kind} is solid`);
      // Plain rooms' furniture stops bodies but not rounds; styled cover stops both.
      assert.equal(!!c.playerOnly, !p.cover, `${b.id} ${p.kind} rounds`);
    });
    for (const p of roomFurniture(b)) {
      if (!FURNITURE[p.kind].walkOver) assert.ok(p.h >= .5, `${b.id} ${p.kind} has a height`);
      else assert.ok(!solid.includes(p), `${b.id} ${p.kind} is walk-over clutter`);
    }
  }
  // A building with its own construction (`style`) lays out its own room.
  assert.deepEqual(roomFurniture({ id: 'x', x: 0, z: 0, w: 8, d: 8, height: 3, doorWidth: 2.4, style: 'colonial' }), []);
  // An extra doorway along a side (`openings`) is kept clear as well.
  const extra = { id: 'y', x: 0, z: 0, w: 12, d: 8, height: 3, doorWidth: 2.4, doors: ['front'], openings: [{ side: 'back', offset: 3.5, width: 2.4 }] };
  const back = doorZones(extra).find(z => z.side === 'back');
  assert.ok(back.along && roomFurniture(extra).every(p => p.walkOver || (!overlaps(boxOf(p), back.strip) && !overlaps(boxOf(p), back.lane) && !overlaps(boxOf(p), back.along))));
  assert.equal(hasPocket(extra, solidFurniture(extra).map(boxOf)), false);
  // Kinds: counters, stoves, shelves are there somewhere, heights as drawn.
  const kinds = new Set(maps.deadwater.buildings.flatMap(b => roomFurniture(b).map(p => p.kind)));
  for (const kind of ['counter', 'stool', 'stove', 'range', 'woodpile', 'sacks', 'wheel', 'shelf', 'brokenChair', 'litter']) assert.ok(kinds.has(kind), kind);
  // Deadwater's floor clutter props stay walk-over.
  const props = mapColliders(maps.deadwater).filter(c => c.propId && ['pot', 'pottedPlant', 'brokenChair'].includes(maps.deadwater.props[+c.propId.slice(5)]?.type));
  assert.ok(props.length > 20 && props.every(c => c.walkOver));
});

test('one list: the renderer draws the furniture from the list the colliders come from', () => {
  const details = readFileSync(new URL('../src/world/interior-details.js', import.meta.url), 'utf8');
  const build = readFileSync(new URL('../src/render/world-build.js', import.meta.url), 'utf8');
  assert.match(details, /roomLayout\(b\)/);
  for (const kind of ['counter', 'stool', 'litter', 'brokenChair', 'shelf', 'range']) assert.match(details, new RegExp(`'${kind}'`), kind);
  // makeBuilding no longer draws its own counter and stools.
  assert.doesNotMatch(build, /b\.z - b\.d \/ 2 \+ 1\.1, b\.w - /);
});
