// Hollow Wick's rooms (src/world/colonial-interiors.js): furniture you bump
// into, never a doorway blocked, never a body stuck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { deadwater, hollowWick, buildingPoint, mapColliders } from '../src/maps.js';
import { localOpenings, buildingContains } from '../src/map-kit.js';
import { NavGrid } from '../src/bots/nav-grid.js';
import { RIFLE_MUZZLE } from '../src/config/gameplay.js';
import { interiorCover } from '../src/world/detailed-interiors.js';
import { COLONIAL_STYLES, isColonial, colonialCover, roomCheck, roomFrame, doorZones, windowZones, flueOf, separation, SNUG, BODY, HALF_WALL, WINDOW_CLEAR, WINDOW_REACH } from '../src/world/colonial-interiors.js';

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

// Each house's story (SPECS `variant`) and the piece that tells it.
const STORY = { 'laying-out': ['chimney', 'coffinChairs'], weaver: ['chimney', 'loom'], kitchen: ['chimney', 'doughTrough'],
  nursery: ['chimney', 'cradle'], parlour: ['chimney', 'longTable'], farm: ['chimney', 'cellarHatch'] };

test('the big rooms are furnished whatever walls their doors are in', () => {
  const want = { 'colonial-tavern': ['hearth', 'barCage'], meetinghouse: ['pulpit', 'pew'], smithy: ['forge', 'anvil'], gristmill: ['hurst'], barn: ['stallBoard'], 'horse-sheds': ['stallBoard'] };
  for (const b of ROOMS) for (const v of variants(b)) {
    const kinds = colonialCover(v).map(p => p.kind);
    for (const k of (b.variant ? STORY[b.variant] : want[b.interiorStyle]) || []) assert.ok(kinds.includes(k), `${b.id} ${v.doors} has no ${k}`);
  }
});

test('no room stands empty: every one places three pieces or more', () => {
  // (Stage 4's horse sheds placed none, the hearse house one: every spot
  // was in a doorway.)
  for (const b of ROOMS) {
    const pieces = colonialCover(b);
    assert.ok(pieces.length >= 3, `${b.id} places ${pieces.length}: ${pieces.map(p => p.kind)}`);
  }
  const kinds = id => colonialCover(ROOMS.find(b => b.id === id)).map(p => p.kind);
  assert.ok(kinds('horse-sheds').filter(k => k === 'stallBoard').length === 3 && kinds('horse-sheds').filter(k => k === 'manger').length === 3 && kinds('horse-sheds').includes('chaise'), 'the horse sheds: three stalls, three mangers, the chaise');
  assert.ok(kinds('hearse-house').includes('bier'), 'the hearse house has its bier');
  assert.equal(kinds('woodshed').filter(k => k === 'woodpile').length, 2, 'the woodshed has both its stacks');
});

test('every house tells its own story', () => {
  const houses = ROOMS.filter(b => b.interiorStyle === 'colonial-house' || b.interiorStyle === 'colonial-lit-house');
  assert.equal(houses.length, 6);
  assert.deepEqual(houses.map(b => b.variant).sort(), Object.keys(STORY).sort());
  assert.equal(houses.find(b => b.interiorStyle === 'colonial-lit-house').variant, 'laying-out', 'the lit house is the one keeping watch');
  // No two alike: not the same pieces, and never the same piece in the same spot.
  const signature = b => colonialCover(b).map(p => p.kind).sort().join();
  assert.equal(new Set(houses.map(signature)).size, 6);
  for (const a of houses) for (const b of houses) if (a !== b) for (const p of colonialCover(a)) if (p.kind !== 'chimney')
    assert.ok(!colonialCover(b).some(q => q.kind === p.kind && Math.hypot(q.x - p.x, q.z - p.z) < .3), `${a.id} and ${b.id} both have a ${p.kind} at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`);
});

test("a hearth or forge stands under its chimney's stack", () => {
  // Each chimney listed `over` a piece is stood over that piece's flue (and a
  // house's centre chimney over its chimney piece), so the smoke has
  // somewhere to go: the tavern's hearth, the smithy's forge.
  for (const b of ROOMS) for (const c of b.chimneys || []) {
    const alongX = b.roof.axis !== 'z', x = alongX ? c.at : c.across || 0, z = alongX ? c.across || 0 : -c.at;
    if (c.over) {
      const flue = flueOf(b, c.over);
      assert.ok(flue && Math.hypot(flue.x - x, flue.z - z) < .35, `${b.id}: its stack is not over the ${c.over}`);
    } else if (b.variant) {
      const p = colonialCover(b).find(q => q.kind === 'chimney');
      assert.ok(p && Math.abs(x - p.x) + c.w / 2 <= p.w / 2 + 1e-6 && Math.abs(z - p.z) <= p.d / 2, `${b.id}: the stack is off the chimney`);
    }
  }
  for (const id of ['tavern', 'smithy']) assert.ok(ROOMS.find(b => b.id === id).chimneys.some(c => c.over), id);
});

test('pieces stand inside the walls, off each other, with heights, and doorways stay clear', () => {
  for (const b of ROOMS) for (const v of variants(b)) {
    const { W, D } = roomFrame(v), pieces = colonialCover(v), name = `${b.id} [${v.doors}]`;
    assert.ok(W === v.w / 2 - HALF_WALL && D === v.d / 2 - HALF_WALL);
    for (const p of pieces) {
      assert.ok(Number.isFinite(p.h) && p.h > 0 && p.h <= v.height, `${name} ${p.kind} height ${p.h}`);
      assert.ok(Math.abs(p.x) + p.w / 2 <= W + 1e-6 && Math.abs(p.z) + p.d / 2 <= D + 1e-6, `${name} ${p.kind} through a wall`);
      for (const zone of doorZones(v)) assert.ok(separation(zone, p) >= 0, `${name} ${p.kind} in the ${zone.side} doorway`);
      for (const zone of windowZones(v)) assert.ok(separation(zone, p) >= 0, `${name} ${p.kind} in front of the ${zone.side} window`);
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
    // And inside every open window (not boarded, not a fallen wall): a strip
    // its width plus 0.2 m, 0.9 m deep, and down its middle to 1.35 m.
    const open = (v.windows || []).filter(w => !w.boarded && !w.collapsed);
    assert.equal(windowZones(v).length, 2 * open.length);
    windowZones(v).forEach((zone, i) => {
      const w = open[i >> 1], deep = i % 2 ? WINDOW_REACH : WINDOW_CLEAR, wide = i % 2 ? .4 : (w.width || 1) + .2;
      assert.ok(Math.abs(Math.min(zone.w, zone.d) - Math.min(deep, wide)) < 1e-9 && Math.abs(Math.max(zone.w, zone.d) - Math.max(deep, wide)) < 1e-9, `${name} window ${w.side}@${w.offset}`);
    });
  }
});

test('a round fired straight in through every open window flies 1.5 m past the wall line', () => {
  // (Stage 4: furniture stood against about 19 open windows, so a round fired
  // through one stopped at the sill while sight went on in.) The rifle's round
  // leaves the muzzle (RIFLE_MUZZLE ahead and to the side of the body) and
  // flies parallel to the facing: the shooter stands 1.5 m out, placed so that
  // line is the window's middle, clear of the yards' fences.
  const sim = new Simulation(hollowWick); sim.weapon = 'rifle'; sim.reset(); sim.targets = [];
  Object.assign(sim.dev ||= {}, { noSpread: true, noRecoil: true, ammo: true });
  let shots = 0;
  for (const b of ROOMS) for (const o of localOpenings(b).filter(o => o.type === 'window' && !o.collapsed)) {
    const across = o.side === 'front' || o.side === 'back', sign = o.side === 'back' || o.side === 'left' ? -1 : 1;
    const at = out => across ? buildingPoint(b, o.offset, sign * (b.d / 2 + out)) : buildingPoint(b, sign * (b.w / 2 + out), o.offset);
    const wall = at(0), outer = at(1), ix = wall.x - outer.x, iz = wall.z - outer.z;
    // (Where something outside stands in the shooter's way, a piece of the
    // stage 5 dressing like the stocks under the meetinghouse's window, the
    // shooter stands further out on the same line: the window counts as
    // shootable if a round gets in from one of these.)
    let depth = -Infinity;
    for (const out of [1.5, 2.5, 3.5]) {
      const from = at(out), x = from.x + iz * RIFLE_MUZZLE.lateral, z = from.z - ix * RIFLE_MUZZLE.lateral;
      sim.rifleBullets = []; sim.drainEvents();
      let hit = null;
      for (let i = 0; i < 50 && !hit; i++) {
        Object.assign(sim.player, { x, z, vx: 0, vz: 0, aimX: ix, aimZ: iz });
        sim.step({ aimX: ix, aimZ: iz, aimPointX: wall.x + ix * 4, aimPointZ: wall.z + iz * 4, fire: i === 3 });
        hit = sim.drainEvents().find(e => e.type === 'rifleImpact') || null;
      }
      depth = Math.max(depth, hit ? (hit.x - wall.x) * ix + (hit.z - wall.z) * iz : Infinity);
      if (depth >= 1.5) break;
    }
    assert.ok(depth >= 1.5, `${b.id} ${o.side} window at ${o.offset}: the round stops ${depth.toFixed(2)} m past the wall line`);
    shots++;
  }
  assert.ok(shots >= 40, `${shots} windows`);
});

test("robots reach all of every room's open floor on the nav grid", () => {
  // The robots' own squares (bots/nav-grid.js, 0.5 m, open where a body of
  // RULES.radius + 0.08 fits), built from the map's colliders: every open
  // square inside a room is reached walking in from each of its doorways.
  // (Stage 4: 10 squares of the lit cape and 9 behind the meetinghouse's
  // back pews could not be.)
  const nav = new NavGrid(hollowWick, mapColliders(hollowWick));
  for (const b of ROOMS) {
    const inside = [];
    for (let i = 0; i < nav.open.length; i++) if (nav.open[i] && buildingContains(b, nav.centre(i))) inside.push(i);
    assert.ok(inside.length > 8, `${b.id}: ${inside.length} open squares`);
    for (const o of localOpenings(b).filter(o => o.type === 'door' && o.width >= 1.4)) {
      const [lx, lz] = o.side === 'front' ? [o.offset, b.d / 2 + 2.5] : o.side === 'back' ? [o.offset, -b.d / 2 - 2.5] : o.side === 'left' ? [-b.w / 2 - 2.5, o.offset] : [b.w / 2 + 2.5, o.offset];
      const p = buildingPoint(b, lx, lz), reach = nav.flood(p.x, p.z, 50), lost = inside.filter(i => !reach.has(i));
      assert.equal(lost.length, 0, `${b.id}: ${lost.length} open squares cannot be reached from the ${o.side} doorway at ${o.offset}`);
    }
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
// (Every doorway: the named doors and the extra openings, each at its offset.)
const outside = (v, door, out) => { const { W, D } = roomFrame(v), o = door.offset || 0; return door.side === 'front' ? [o, D + out] : door.side === 'back' ? [o, -D - out] : door.side === 'left' ? [-W - out, o] : [W + out, o]; };

test('a body walks in from every door and right round every piece without sticking', () => {
  for (const b of ROOMS) for (const doors of [b.doors, ['front'], ['left']]) {
    // (A window where a made-up door now stands goes: the barn's hay door is
    // a window over its front wall.)
    const room = { ...b, doors, x: 0, z: 0, baseY: undefined, windows: (b.windows || []).filter(w => !doors.includes(w.side) || Math.abs(w.offset) > (b.doorWidth + (w.width || 1)) / 2) };
    const pieces = colonialCover(room), g = grid(room, pieces, BODY + .02);
    const sim = new Simulation({ ...deadwater, buildings: [room], props: [], fences: [], targets: [], zones: [] });
    const ways = roomFrame(room).doors;
    const start = door => { const [ox, oz] = outside(room, door, 1.2); Object.assign(sim.player, buildingPoint(room, ox, oz), { vx: 0, vz: 0 }); };
    const entry = door => g.cell(...outside(room, door, -BODY - .15));
    for (const door of ways) {
      // In through the door to the far side of the room.
      const side = door.side + (door.offset ? '@' + door.offset : '');
      const from = entry(door), reach = g.reach(from), far = [...g.open.keys()].filter(k => reach[k]).sort((a, c) => { const [ax, az] = g.at(a), [cx, cz] = g.at(c), [sx, sz] = g.at(from); return Math.hypot(cx - sx, cz - sz) - Math.hypot(ax - sx, az - sz); })[0];
      assert.ok(g.open[from], `${b.id} [${doors}] ${side}: no room inside the door`);
      start(door);
      const route = g.path(from, far); assert.ok(route, `${b.id} [${doors}] ${side}: far side unreachable`);
      const miss = walk(sim, room, [outside(room, door, -.2), ...route]);
      assert.ok(miss < .3, `${b.id} [${doors}] in at ${side}: stuck ${miss.toFixed(2)} m short`);
    }
    // Round every piece: to the middle of each of its sides a body can reach.
    start(ways[0]);
    let from = entry(ways[0]);
    walk(sim, room, [outside(room, ways[0], -.2), g.at(from)]);
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
