// Hollow Wick's rooms (src/world/colonial-interiors.js): furniture you bump
// into, never a doorway blocked, never a body stuck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { deadwater, hollowWick, buildingPoint, mapColliders } from '../src/maps.js';
import { interiorCover } from '../src/world/detailed-interiors.js';
import { COLONIAL_STYLES, isColonial, colonialCover, roomCheck, roomFrame, doorZones, separation, SNUG, BODY, HALF_WALL } from '../src/world/colonial-interiors.js';

const SIDES = ['front', 'back', 'left', 'right'];
const DOOR_SETS = Array.from({ length: 15 }, (_, m) => SIDES.filter((_, i) => (m + 1) >> i & 1));
// One room of each shape the map asks for, with its real size (the pads).
const ROOMS = hollowWick.buildings.filter(isColonial);
const variants = b => DOOR_SETS.map(doors => ({ ...b, doors }));

test('every Hollow Wick style has a layout, and each pad room gets one', () => {
  assert.ok(ROOMS.length >= 10);
  for (const style of COLONIAL_STYLES) assert.ok(ROOMS.some(b => b.interiorStyle === style), style);
  // interiorCover dispatches here, and the map's colliders carry the pieces.
  for (const b of ROOMS) assert.deepEqual(interiorCover(b), colonialCover(b));
  const cover = mapColliders(hollowWick).filter(c => c.interiorCover);
  assert.equal(cover.length, ROOMS.reduce((n, b) => n + colonialCover(b).length, 0));
  assert.ok(cover.every(c => c.height > 0));
});

test('the big rooms are furnished whatever walls their doors are in', () => {
  const want = { 'colonial-tavern': ['hearth', 'barCage'], 'colonial-house': ['chimney', 'bed'], 'colonial-lit-house': ['chimney', 'litTable'],
    meetinghouse: ['pulpit', 'pew'], smithy: ['forge', 'anvil'], gristmill: ['hurst'], barn: ['stallBoard'] };
  for (const b of ROOMS) for (const v of variants(b)) {
    const kinds = colonialCover(v).map(p => p.kind);
    for (const k of want[b.interiorStyle] || []) assert.ok(kinds.includes(k), `${b.id} ${v.doors} has no ${k}`);
  }
});

test('pieces stand inside the walls, off each other, with heights, and doorways stay clear', () => {
  for (const b of ROOMS) for (const v of variants(b)) {
    const { W, D } = roomFrame(v), pieces = colonialCover(v), name = `${b.id} [${v.doors}]`;
    assert.ok(W === v.w / 2 - HALF_WALL && D === v.d / 2 - HALF_WALL);
    for (const p of pieces) {
      assert.ok(Number.isFinite(p.h) && p.h > 0 && p.h <= v.height, `${name} ${p.kind} height ${p.h}`);
      assert.ok(Math.abs(p.x) + p.w / 2 <= W + 1e-6 && Math.abs(p.z) + p.d / 2 <= D + 1e-6, `${name} ${p.kind} through a wall`);
      for (const zone of doorZones(v)) assert.ok(separation(zone, p) >= 0, `${name} ${p.kind} in the ${zone.side} doorway`);
      for (const q of pieces) if (q !== p) {
        const g = separation(p, q);
        assert.ok(g >= 0, `${name} ${p.kind} overlaps ${q.kind}`);
        assert.ok(!(g > SNUG[0] && g < SNUG[1]), `${name} ${p.kind}/${q.kind} gap ${g.toFixed(2)} is body-width`);
      }
    }
    // The doorway rule itself: 1.2 m in, the door's width plus 0.2 m a side.
    // (Each doorway its own width: the extra openings, the horse sheds' bays, have theirs.)
    const doors = roomFrame(v).doors;
    doorZones(v).forEach((zone, i) => assert.ok(Math.min(zone.w, zone.d) === 1.2 && Math.max(zone.w, zone.d) === doors[i].width + .4));
  }
});

test('every room is walkable: a 1.4 m walkway joins its doors and no floor is cut off', () => {
  // (Also with narrow period doors: the walkway is then as wide as the door lets it be.)
  for (const b of ROOMS) for (const v of [...variants(b), ...variants({ ...b, doorWidth: 1.4 })]) {
    const result = roomCheck(v, colonialCover(v));
    assert.ok(result.ok, `${b.id} [${v.doors}]: ${result.why}`);
  }
});

// --- walking it with the real simulation ---------------------------------
const STEP = .1;
function grid(b, pieces, r) {
  const { W, D } = roomFrame(b), nx = Math.round(2 * W / STEP), nz = Math.round(2 * D / STEP), open = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = -W + (i + .5) * STEP, z = -D + (j + .5) * STEP;
    open[j * nx + i] = Math.abs(x) <= W - r && Math.abs(z) <= D - r && pieces.every(p => separation(p, { x, z, w: 0, d: 0 }) >= r) ? 1 : 0;
  }
  const cell = (x, z) => { const i = Math.floor((x + W) / STEP), j = Math.floor((z + D) / STEP); return i >= 0 && j >= 0 && i < nx && j < nz ? j * nx + i : -1; };
  const at = k => [-W + (k % nx + .5) * STEP, -D + (Math.floor(k / nx) + .5) * STEP];
  const path = (from, to) => {
    const prev = new Int32Array(nx * nz).fill(-2); prev[from] = -1; const queue = [from];
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q]; if (k === to) break;
      const i = k % nx;
      for (const n of [i + 1 < nx ? k + 1 : -1, i > 0 ? k - 1 : -1, k + nx < nx * nz ? k + nx : -1, k - nx]) if (n >= 0 && open[n] && prev[n] === -2) { prev[n] = k; queue.push(n); }
    }
    if (prev[to] === -2) return null;
    const out = []; for (let k = to; k !== -1; k = prev[k]) out.push(at(k));
    return out.reverse();
  };
  const reach = from => { const seen = new Uint8Array(nx * nz), queue = [from]; seen[from] = 1;
    for (let q = 0; q < queue.length; q++) { const k = queue[q], i = k % nx; for (const n of [i + 1 < nx ? k + 1 : -1, i > 0 ? k - 1 : -1, k + nx < nx * nz ? k + nx : -1, k - nx]) if (n >= 0 && open[n] && !seen[n]) { seen[n] = 1; queue.push(n); } }
    return seen; };
  return { open, cell, at, path, reach };
}
function walk(sim, room, points, limit = 900) {
  const p = sim.player;
  for (const [lx, lz] of points.filter((_, i) => i % 4 === 3 || i === points.length - 1)) {
    const goal = buildingPoint(room, lx, lz);
    for (let n = 0; n < limit && Math.hypot(goal.x - p.x, goal.z - p.z) > .18; n++) {
      const dx = goal.x - p.x, dz = goal.z - p.z, len = Math.hypot(dx, dz), slow = Math.min(1, len / .6);
      sim.step({ moveX: dx / len * slow, moveZ: dz / len * slow, aimX: 1, aimZ: 0 });
    }
  }
  const goal = buildingPoint(room, ...points[points.length - 1]);
  return Math.hypot(goal.x - p.x, goal.z - p.z);
}
const outside = (v, side, out) => { const { W, D } = roomFrame(v); return side === 'front' ? [0, D + out] : side === 'back' ? [0, -D - out] : side === 'left' ? [-W - out, 0] : [W + out, 0]; };

test('a body walks in from every door and right round every piece without sticking', () => {
  for (const b of ROOMS) for (const doors of [b.doors, ['front'], ['left']]) {
    // (A window where a made-up door now stands goes: the barn's hay door is
    // a window over its front wall.)
    const room = { ...b, doors, x: 0, z: 0, baseY: undefined, windows: (b.windows || []).filter(w => !doors.includes(w.side) || Math.abs(w.offset) > (b.doorWidth + (w.width || 1)) / 2) };
    const pieces = colonialCover(room), g = grid(room, pieces, BODY + .02);
    const sim = new Simulation({ ...deadwater, buildings: [room], props: [], fences: [], targets: [], zones: [] });
    const start = side => { const [ox, oz] = outside(room, side, 1.2); Object.assign(sim.player, buildingPoint(room, ox, oz), { vx: 0, vz: 0 }); };
    const entry = side => g.cell(...outside(room, side, -BODY - .15));
    for (const side of doors) {
      // In through the door to the far side of the room.
      const from = entry(side), reach = g.reach(from), far = [...g.open.keys()].filter(k => reach[k]).sort((a, c) => { const [ax, az] = g.at(a), [cx, cz] = g.at(c), [sx, sz] = g.at(from); return Math.hypot(cx - sx, cz - sz) - Math.hypot(ax - sx, az - sz); })[0];
      assert.ok(g.open[from], `${b.id} [${doors}] ${side}: no room inside the door`);
      start(side);
      const route = g.path(from, far); assert.ok(route, `${b.id} [${doors}] ${side}: far side unreachable`);
      const miss = walk(sim, room, [outside(room, side, -.2), ...route]);
      assert.ok(miss < .3, `${b.id} [${doors}] in at ${side}: stuck ${miss.toFixed(2)} m short`);
    }
    // Round every piece: to the middle of each of its sides a body can reach.
    start(doors[0]);
    let from = entry(doors[0]);
    walk(sim, room, [outside(room, doors[0], -.2), g.at(from)]);
    for (const p of pieces) for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const tx = p.x + sx * (p.w / 2 + BODY + .12), tz = p.z + sz * (p.d / 2 + BODY + .12), to = g.cell(tx, tz);
      if (to < 0 || !g.open[to]) continue;
      const route = g.path(from, to); assert.ok(route, `${b.id} [${doors}] ${p.kind}: a side is walled in`);
      const miss = walk(sim, room, route);
      assert.ok(miss < .3, `${b.id} [${doors}] stuck by the ${p.kind} (${miss.toFixed(2)} m short)`);
      from = to;
    }
  }
});

test('nothing changes for rooms that are not Hollow Wick styles', () => {
  const room = { id: 'x', x: 0, z: 0, w: 12, d: 10, height: 3, doorWidth: 2.6, interiorStyle: 'workshop' };
  assert.equal(isColonial(room), false);
  assert.deepEqual(colonialCover(room), []);
  assert.ok(interiorCover(room).length > 0);
});
