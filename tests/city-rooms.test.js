// Lumen's rooms (world/city-rooms.js): buildings of several rooms and wedge
// (quad) rooms, shared walls built once, sight only through doorways.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { maps, mapColliders, buildingContains, buildingWalls, mapHash } from '../src/maps.js';
import { cityRooms, contact, sameRoomGroup } from '../src/world/city-rooms.js';
import { interiorPolygons } from '../src/render/vision-polygons.js';

const map = maps['city-test'];
const room = id => map.buildings.find(b => b.id === id);
const simAt = (x, z) => { const sim = new Simulation(map, 'static'); Object.assign(sim.player, { x, z, vx: 0, vz: 0 }); return sim; };

test('city rooms: every room is a building entry of its group, with no default front door', () => {
  assert.equal(map.buildings.length, 6);
  for (const b of map.buildings) { assert.ok(b.group); assert.deepEqual(b.doors, []); assert.equal(b.style, 'city-room'); }
  assert.ok(sameRoomGroup(room('l-tower/hall'), room('l-tower/office')));
  assert.ok(!sameRoomGroup(room('l-tower/hall'), room('wedge/prow')));
  assert.ok(!sameRoomGroup(room('l-tower/hall'), null));
  assert.ok(sameRoomGroup(null, null));
});

test('city rooms: the map fingerprint still works (no loops in map data)', () => {
  assert.match(mapHash(map), /^[0-9a-f]{8}$/);
});

test('city rooms: a wall two rooms share collides once', () => {
  const walls = mapColliders(map).filter(c => c.wall && c.buildingId?.startsWith('l-tower'));
  // hall: left (2 pieces round the door), back, right (2 round the link), front (2 round the link) = 7
  // office: back, right, front (2 round its door); left shared = 4. store: left, right, front (2); back shared = 4.
  assert.equal(walls.length, 15);
  for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++) {
    const a = walls[i], b = walls[j];
    const overlap = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2) > .4 && Math.min(a.z + a.d / 2, b.z + b.d / 2) - Math.max(a.z - a.d / 2, b.z - b.d / 2) > .4;
    assert.ok(!overlap, `walls ${i} and ${j} overlap`);
  }
});

test('city rooms: wedge (quad) rooms contain, wall and open like rectangles', () => {
  const prow = room('wedge/prow');
  assert.ok(buildingContains(prow, { x: 8, z: -15 }));
  assert.ok(!buildingContains(prow, { x: 3, z: -11 })); // outside the diagonal
  const walls = buildingWalls(prow);
  assert.equal(walls.length, 6); // 4 edges, the outer door and the link each split one
  const diag = walls.filter(w => w.angle && Math.abs(Math.abs(w.angle) % (Math.PI / 2)) > .1);
  assert.equal(diag.length, 2);
});

test('city rooms: authoring errors are caught', () => {
  assert.throws(() => cityRooms({ id: 'x', tall: true, rooms: [{ id: 'a', rect: [0, 4, 0, 4] }], doors: [{ at: [2, 2] }] }), /outer door/);
  assert.throws(() => cityRooms({ id: 'x', tall: true, rooms: [{ id: 'a', rect: [0, 4, 0, 4] }, { id: 'b', rect: [4, 8, 2, 6] }] }), /part of a side/);
  assert.ok(contact({ rect: [0, 4, 0, 4] }, { rect: [4, 8, 0, 2] }));
});

test('city rooms: sight goes through inner doorways, never through a third room or a wall', () => {
  const sim = simAt(-14, -17); // in the hall, level with the link to the office
  assert.equal(sim.interior.id, 'l-tower/hall');
  assert.ok(sim.canAimAt(-8, -17), 'office through the link');
  assert.ok(!sim.canAimAt(-8, -14.4), 'office past the link, through the wall'); // (the link is 1.6 m since stage 4: city-rooms.js CITY_LINK)
  const sim2 = simAt(-20, -12); // hall, above the link to the store
  assert.ok(sim2.canAimAt(-20, -4), 'store through the link');
  assert.ok(!sim2.canAimAt(-20, 3), 'the street beyond the store: not through two rooms');
  assert.ok(sim2.canSeeTarget(-20, -4), 'a target in the next room of the same building');
  const sim3 = simAt(-8, -16); // office, near its street door
  assert.ok(sim3.canAimAt(-8, 0), 'out of its own door');
  assert.ok(!sim3.canAimAt(-2, -16), 'through its solid side wall');
});

test('city rooms: the cone through an inner doorway stops in the next room', () => {
  const polys = interiorPolygons(room('l-tower/hall'), { x: -18, z: -17 });
  const office = room('l-tower/office');
  const cone = polys.slice(1).find(p => p.some(q => q.x > -11));
  assert.ok(cone);
  for (const q of cone) assert.ok(q.x <= office.x + office.w / 2 + 1e-6 && q.z >= office.z - office.d / 2 - 1e-6 && q.z <= office.z + office.d / 2 + 1e-6, `cone corner ${q.x},${q.z} outside the office`);
});

test('city rooms: a body walks from room to room and out through the doorways', () => {
  const sim = simAt(-18, -17);
  const walk = (x, z, steps = 200) => { for (let i = 0; i < steps; i++) { const dx = x - sim.player.x, dz = z - sim.player.z, l = Math.hypot(dx, dz); if (l < .3) break; sim.step({ moveX: dx / l, moveZ: dz / l, aimX: 1, aimZ: 0 }); } };
  walk(-13.5, -17); walk(-8, -17);
  assert.equal(sim.interior?.id, 'l-tower/office');
  walk(-8, -12); walk(-8, -8);
  assert.equal(sim.interior, null);
  const w = simAt(8, -15);
  const walkW = (x, z) => { for (let i = 0; i < 200; i++) { const dx = x - w.player.x, dz = z - w.player.z, l = Math.hypot(dx, dz); if (l < .3) break; w.step({ moveX: dx / l, moveZ: dz / l, aimX: 1, aimZ: 0 }); } };
  walkW(11, -15); walkW(16, -15);
  assert.equal(w.interior?.id, 'wedge/back');
  walkW(17, -12); walkW(17, -7);
  assert.equal(w.interior, null);
});

test('city rooms: the view through an inner doorway covers every point of the next room the sight rules see', () => {
  const sim = simAt(-17, -15.5), hall = room('l-tower/hall'), office = room('l-tower/office');
  const polys = interiorPolygons(hall, sim.player).slice(1);
  const insideQuad = (q, x, z) => { let pos = true, neg = true; for (let j = 0; j < 4; j++) { const a = q[j], b = q[(j + 1) % 4], c = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x); pos &&= c >= -1e-3; neg &&= c <= 1e-3; } return pos || neg; };
  let seen = 0, missed = 0;
  for (let x = office.x - office.w / 2 + .3; x < office.x + office.w / 2 - .3; x += .25) for (let z = office.z - office.d / 2 + .3; z < office.z + office.d / 2 - .3; z += .25) {
    if (!sim.canAimAt(x, z)) continue; seen++;
    if (!polys.some(q => insideQuad(q, x, z))) missed++;
  }
  // (The cones keep the doorway's ends .1 m in, as every door's always has:
  // a sliver along the wedge's edges stays grey. The far corner must show.)
  assert.ok(seen > 50); assert.ok(missed <= seen * .06, `${missed} of ${seen}`);
  assert.ok(sim.canAimAt(-4.5, -19.5) && polys.some(q => insideQuad(q, -4.5, -19.5)), 'the far corner between the rays');
});
