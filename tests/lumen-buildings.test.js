// Lumen's buildings (stage 2): every footprint of the layout built as rooms
// that tile it, every building entered by 2+ doors on different walls onto
// open ground, every room reached through its doorways, and a body walking
// in from each door to every room with the simulation's own movement.
// (maps/lumen-buildings-*.js, world/city-rooms.js.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { maps, mapColliders, buildingContains } from '../src/maps.js';
import { isPlayable } from '../src/playable-area.js';
import { Simulation, inside } from '../src/simulation.js';
import { FOOTPRINTS } from '../src/maps/lumen-layout.js';
import { LUMEN_BUILDINGS } from '../src/maps/lumen.js';
import { cityRooms, roomOutline, wallAt } from '../src/world/city-rooms.js';
import { roadGeometry } from '../src/world/lumen-ground.js';
import { ROADS } from '../src/maps/lumen-layout.js';

const map = maps.lumen;
const area = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };
const rectPts = ([x0, x1, z0, z1]) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const footprintPolys = f => [...(f.parts || []).map(rectPts), ...(f.quads || [])];
function pointIn(poly, x, z) { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]); if (Math.abs(c) < 1e-9) continue; if (!s) s = Math.sign(c); else if (Math.sign(c) !== s) return false; } return true; }
const built = id => LUMEN_BUILDINGS.find(b => b.id === id);
const done = FOOTPRINTS.filter(f => built(f.id));

test('lumen buildings: specs exist only for footprints, each once', () => {
  const ids = LUMEN_BUILDINGS.map(b => b.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate building ids');
  for (const id of ids) assert.ok(FOOTPRINTS.some(f => f.id === id), `${id} has no footprint`);
});

test('lumen buildings: every footprint is built (stage 2 complete)', { skip: done.length < FOOTPRINTS.length && 'in progress' }, () => {
  assert.equal(done.length, FOOTPRINTS.length);
});

for (const f of done) {
  test(`lumen building ${f.id}: rooms tile the footprint, no overlaps`, () => {
    const b = built(f.id), polys = footprintPolys(f), blocked = (b.blocked || []).map(rectPts);
    const want = polys.reduce((s, p) => s + area(p), 0), got = b.rooms.reduce((s, r) => s + area(roomOutline(r)), 0) + blocked.reduce((s, p) => s + area(p), 0);
    assert.ok(Math.abs(want - got) < .05, `rooms cover ${got.toFixed(2)} m² of ${want.toFixed(2)}`);
    // every room corner inside (or on) the footprint; every room's middle inside
    for (const r of b.rooms) {
      const o = roomOutline(r), cx = o.reduce((s, p) => s + p[0], 0) / o.length, cz = o.reduce((s, p) => s + p[1], 0) / o.length;
      assert.ok(polys.some(p => pointIn(p, cx, cz)), `${r.id} lies outside`);
      for (const [x, z] of o) assert.ok(polys.some(p => pointIn(p, x + (cx - x) * 1e-3, z + (cz - z) * 1e-3)), `${r.id} corner ${x},${z} outside`);
    }
    // no two rooms (or a room and a blocked part) overlap: sample each room's inside
    const all = [...b.rooms.map(r => ({ id: r.id, o: roomOutline(r) })), ...blocked.map((o, i) => ({ id: 'blocked-' + i, o }))];
    for (const a of all) { const xs = a.o.map(p => p[0]), zs = a.o.map(p => p[1]);
      for (let x = Math.min(...xs) + .15; x < Math.max(...xs); x += .5) for (let z = Math.min(...zs) + .15; z < Math.max(...zs); z += .5) {
        if (!pointIn(a.o, x, z)) continue;
        for (const c of all) if (c !== a && pointIn(c.o, x, z)) assert.fail(`${a.id} and ${c.id} overlap at ${x.toFixed(2)},${z.toFixed(2)}`);
      } }
  });

  test(`lumen building ${f.id}: doors, doorways and heights`, () => {
    const b = built(f.id);
    assert.ok(b.tall ? b.height >= 44 : b.height >= 3 && b.height <= 11, 'height');
    const rooms = cityRooms(b); // throws on a door not on a wall, a partial shared side...
    const outer = rooms.flatMap(r => r.openings.filter(o => o.outer).map(o => ({ r, o })));
    assert.ok(outer.length >= 2, 'at least two outer doors');
    // on at least two different walls (different outward directions)
    const dirs = new Set(outer.map(({ r, o }) => o.side ?? `e${o.edge}` + (r.quad ? JSON.stringify(r.quad[o.edge]) : '')));
    // (The bus: both its doors on the kerb side, as a bus has them.)
    assert.ok(dirs.size >= 2 || f.id === 'bus', 'doors on two different walls');
    for (const { o } of outer) assert.ok(o.width >= 1.4, 'outer doors at least 1.4 m');
    for (const r of rooms) for (const o of r.openings) if (o.into) assert.ok(o.width >= 1.2, `${r.id}: inner doorway ${o.width} m`);
    for (const r of b.rooms) if (r.rect) { const [x0, x1, z0, z1] = r.rect; assert.ok(Math.min(x1 - x0, z1 - z0) >= 1.4, `${r.id} is narrower than a hallway (1.4 m)`); }
    // every room reached from an outer door through the inner doorways
    const seen = new Set(outer.map(({ r }) => r.id)), queue = [...seen];
    while (queue.length) { const id = queue.shift(), r = rooms.find(x => x.id === id); for (const o of r.openings) if (o.into && !seen.has(o.into)) { seen.add(o.into); queue.push(o.into); } }
    assert.equal(seen.size, rooms.length, `rooms not reached: ${rooms.filter(r => !seen.has(r.id)).map(r => r.id)}`);
  });
}

// What stands outside each outer door: open, playable ground a body can stand on.
const colliders = mapColliders(map);
const standable = (x, z) => isPlayable(map, x, z, .38) && !map.buildings.some(b => buildingContains(b, { x, z })) && !colliders.some(c => !c.walkOver && !c.playerOnly && inside({ x, z }, c, .38));
for (const f of done) test(`lumen building ${f.id}: each outer door opens onto open ground`, () => {
  const rooms = map.buildings.filter(r => r.group === f.id);
  for (const r of rooms) for (const o of r.openings) if (o.outer) {
    const e = doorFrame(r, o);
    assert.ok(standable(e.x + e.nx * 1.2, e.z + e.nz * 1.2), `${r.id} door at ${e.x.toFixed(2)},${e.z.toFixed(2)} opens onto nothing a body can stand on`);
  }
});

// A door's middle and its outward normal.
function doorFrame(r, o) {
  const outline = roomOutline(r.quad ? { quad: r.quad } : { rect: [r.x - r.w / 2, r.x + r.w / 2, r.z - r.d / 2, r.z + r.d / 2] });
  const cx = outline.reduce((s, p) => s + p[0], 0) / 4, cz = outline.reduce((s, p) => s + p[1], 0) / 4;
  let a, b;
  if (r.quad) { a = r.quad[o.edge]; b = r.quad[(o.edge + 1) % 4]; }
  else { const x0 = r.x - r.w / 2, x1 = r.x + r.w / 2, z0 = r.z - r.d / 2, z1 = r.z + r.d / 2; [a, b] = { back: [[x0, z0], [x1, z0]], front: [[x0, z1], [x1, z1]], left: [[x0, z0], [x0, z1]], right: [[x1, z0], [x1, z1]] }[o.side]; }
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, mx = (a[0] + b[0]) / 2 + ux * o.offset, mz = (a[1] + b[1]) / 2 + uz * o.offset;
  let nx = -uz, nz = ux; if ((mx + nx - cx) ** 2 + (mz + nz - cz) ** 2 < (mx - cx) ** 2 + (mz - cz) ** 2) { nx = -nx; nz = -nz; }
  return { x: mx, z: mz, nx, nz };
}

test('lumen buildings: none stands on a road, a sidewalk or another building', () => {
  const corridors = ROADS.flatMap(r => { const g = roadGeometry(r); return [g.road, ...g.walks]; });
  for (const r of map.buildings) {
    const o = r.quad || [[r.x - r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z + r.d / 2], [r.x - r.w / 2, r.z + r.d / 2]];
    const cx = o.reduce((s, p) => s + p[0], 0) / 4, cz = o.reduce((s, p) => s + p[1], 0) / 4;
    if (r.group === 'bus' || r.group === 'checkpoint-booth') continue; // (they stand on the road and the sidewalk by design)
    for (const [x, z] of [[cx, cz], ...o.map(([x, z]) => [x + (cx - x) * .08, z + (cz - z) * .08])]) {
      assert.ok(!corridors.some(p => pointIn(p, x, z)), `${r.id} on a road or sidewalk at ${x.toFixed(1)},${z.toFixed(1)}`);
      assert.ok(isPlayable(map, x, z, 0), `${r.id} outside the map at ${x.toFixed(1)},${z.toFixed(1)}`);
    }
  }
});

// The strongest check: a body walks in from outside each building's first
// outer door and on through the doorways to every room.
for (const f of done) test(`lumen building ${f.id}: a body walks from its door to every room`, () => {
  const rooms = map.buildings.filter(r => r.group === f.id);
  const doorOf = (r, o) => doorFrame(r, o);
  const start = rooms.flatMap(r => r.openings.filter(o => o.outer).map(o => ({ r, e: doorOf(r, o) })))[0];
  // shortest route through the doorway graph from the start room
  const prev = new Map([[start.r.id, null]]), queue = [start.r];
  while (queue.length) { const r = queue.shift(); for (const o of r.openings) if (o.into && !prev.has(o.into)) { prev.set(o.into, { from: r, o }); queue.push(rooms.find(x => x.id === o.into)); } }
  for (const target of rooms) {
    const sim = new Simulation(map, 'static');
    Object.assign(sim.player, { x: start.e.x + start.e.nx * 1.3, z: start.e.z + start.e.nz * 1.3, vx: 0, vz: 0 });
    const path = [];
    for (let id = target.id; prev.get(id); id = prev.get(id).from.id) { const { from, o } = prev.get(id), e = doorOf(from, o); path.unshift([e.x - e.nx * .9, e.z - e.nz * .9], [e.x, e.z], [e.x + e.nx * .9, e.z + e.nz * .9]); }
    const inner = [start.e.x - start.e.nx * .9, start.e.z - start.e.nz * .9];
    const steps = [[start.e.x, start.e.z], inner, ...path, [target.x, target.z]];
    for (const [x, z] of steps) for (let i = 0; i < 240; i++) {
      const dx = x - sim.player.x, dz = z - sim.player.z, l = Math.hypot(dx, dz); if (l < .25) break;
      sim.step({ moveX: dx / l, moveZ: dz / l, aimX: 1, aimZ: 0 });
    }
    // In the target room (or within a body of its middle if furniture fills it).
    assert.ok(sim.interior?.id === target.id || Math.hypot(sim.player.x - target.x, sim.player.z - target.z) < 1.2, `could not walk to ${target.id} (ended in ${sim.interior?.id ?? 'the street'} at ${sim.player.x.toFixed(2)},${sim.player.z.toFixed(2)})`);
  }
});
