// Lumen stage 3: the steam vents (maps/lumen-vents.js) and the match clock
// they and the weather run on (Simulation.worldTime, the sessions'
// worldClock). Checks where the vents stand (design 20.6: streets and
// sidewalks, never at doorways, base exits, crosswalks or the sniper lane),
// that the schedule is a pure function of the clock, that a burst blocks
// sight exactly while it vents (for players and robots alike, never rounds),
// and that every screen in a room agrees on the clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { maps, mapColliders, buildingOpenings, buildingContains } from '../src/maps.js';
import { Simulation } from '../src/simulation.js';
import { ROADS } from '../src/maps/lumen-layout.js';
import { roadGeometry, groundMarkings, LUMEN_GROUND } from '../src/world/lumen-ground.js';
import { SNIPER_LANE } from '../src/maps/lumen-cover.js';
import { isPlayable } from '../src/playable-area.js';
import { LUMEN_VENTS, VENTS, ventPhase, ventOn, ventState, ventsBlockSight } from '../src/maps/lumen-vents.js';
import { rainAt, wetnessAt } from '../src/effects/rain.js';
import { CityFeatures } from '../src/render/city-features.js';
import { createLoopback } from '../src/net/transport.js';
import { HostSession } from '../src/net/host-session.js';
import { ClientSession } from '../src/net/client-session.js';

const map = maps.lumen;
const inPoly = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [ax, az] = poly[i], [bx, bz] = poly[j]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) c = !c; } return c; };
const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
const polyDist = (q, x, z) => inPoly(q, x, z) ? 0 : Math.min(...q.map((p, i) => segDist(x, z, ...p, ...q[(i + 1) % q.length])));

test('the map carries at most six vents, on its city block (in the fingerprint)', () => {
  assert.equal(map.city.vents, LUMEN_VENTS);
  assert.ok(LUMEN_VENTS.length >= 1 && LUMEN_VENTS.length <= 6);
  assert.equal(new Set(LUMEN_VENTS.map(v => v.id)).size, LUMEN_VENTS.length);
  assert.ok(Object.keys(map.city).includes('vents'), 'enumerable: host and joiners must agree on it');
});

test('every vent stands on a street or sidewalk, clear of doorways, bases, zebras, the sniper lane and colliders', () => {
  const doors = map.buildings.flatMap(b => buildingOpenings(b).map(o => ({ x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2, id: b.id })));
  const zebraColours = new Set([LUMEN_GROUND.crosswalk, ...LUMEN_GROUND.crosswalkFaded]);
  const zebras = groundMarkings().filter(m => zebraColours.has(m.colour)).map(m => m.quad);
  assert.ok(zebras.length > 50, 'found the crosswalk bars');
  const bases = map.bases.flatMap(b => b.points), colliders = mapColliders(map);
  for (const v of LUMEN_VENTS) {
    const on = ROADS.some(r => { const g = roadGeometry(r); return inPoly(g.road, v.x, v.z) || g.walks.some(w => inPoly(w, v.x, v.z)); });
    assert.ok(on, `${v.id} on a roadway or sidewalk`);
    assert.equal(v.kind === 'manhole' || v.kind === 'grate', true, `${v.id} kind`);
    assert.ok(isPlayable(map, v.x, v.z, VENTS.radius), `${v.id} inside the playable area`);
    assert.ok(![...map.buildings, ...map.solids].some(b => buildingContains(b, v)), `${v.id} not in a building or tower`);
    const door = Math.min(...doors.map(d => Math.hypot(d.x - v.x, d.z - v.z)));
    assert.ok(door >= VENTS.clear, `${v.id} ${door.toFixed(2)} m from a doorway`);
    // (Clear of the whole cloud too: nobody steps out of a door into it.)
    assert.ok(door >= VENTS.radius + 1.4, `${v.id} cloud off every doorway`);
    const zebra = Math.min(...zebras.map(q => polyDist(q, v.x, v.z)));
    assert.ok(zebra >= VENTS.clear, `${v.id} ${zebra.toFixed(2)} m from a zebra`);
    const base = Math.min(...bases.map(p => Math.hypot(p.x - v.x, p.z - v.z)));
    assert.ok(base >= VENTS.baseClear, `${v.id} ${base.toFixed(2)} m from a base point`);
    const lane = segDist(v.x, v.z, ...SNIPER_LANE.from, ...SNIPER_LANE.to);
    assert.ok(lane >= VENTS.clear + VENTS.radius, `${v.id} ${lane.toFixed(2)} m from the sniper lane`);
    const under = colliders.filter(c => Math.abs(c.x - v.x) < c.w / 2 + .5 && Math.abs(c.z - v.z) < c.d / 2 + .5);
    assert.equal(under.length, 0, `${v.id} cover open (${under.map(c => c.propId ?? c.id).join(', ')})`);
  }
  for (const a of LUMEN_VENTS) for (const b of LUMEN_VENTS) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 15, `${a.id} and ${b.id} apart`);
});

test('the schedule: each vent vents 4 s in every 40, staggered so no two vent at once', () => {
  const n = LUMEN_VENTS.length;
  for (let i = 0; i < n; i++) {
    let on = 0;
    for (let t = 0; t < VENTS.period; t += .05) if (ventOn(1000 + t, i, n)) on += .05;
    assert.ok(Math.abs(on - VENTS.duration) < .11, `vent ${i} vents ${on.toFixed(2)} s a period`);
    assert.equal(ventOn(123.4, i, n), ventOn(123.4 + VENTS.period * 7, i, n), 'periodic');
  }
  for (let t = 0; t < 400; t += .1) assert.ok(LUMEN_VENTS.filter((_, i) => ventOn(t, i, n)).length <= 1, `at most one at ${t.toFixed(1)}`);
  // The same clock, the same answer, from a fresh call (no state).
  const a = ventState(517.3, 2, n), b = ventState(517.3, 2, n, {});
  assert.deepEqual(a, b);
  assert.ok(ventPhase(-3, 0, n) >= 0 && ventPhase(-3, 0, n) < VENTS.period, 'negative clocks wrap');
  // The cloud: full during the burst (after its short build-up), thinning after, gone before the next.
  const start = t0 => { for (let t = t0; ; t += .01) if (ventOn(t, 1, n)) return t; };
  const s = start(0);
  assert.equal(ventState(s + 2, 1, n).strength, 1);
  assert.ok(ventState(s + VENTS.duration + .3, 1, n).strength > 0 && !ventState(s + VENTS.duration + .3, 1, n).venting, 'lingers a moment, sight already clear');
  assert.equal(ventState(s + VENTS.duration + VENTS.linger + .1, 1, n).strength, 0);
});

test('a burst blocks sight through its cylinder only while it vents, for players and robots', () => {
  const v = LUMEN_VENTS[0], n = LUMEN_VENTS.length;
  const on = (() => { for (let t = 0; ; t += .05) if (ventOn(t, 0, n) && ventState(t, 0, n).age > .5) return t; })(), off = on + 10;
  assert.ok(!ventOn(off, 0, n));
  const player = new Simulation(map);
  Object.assign(player.player, { x: v.x - 6, z: v.z, vx: 0, vz: 0 });
  // A robot's sim reads the page's clock (main.js links it): no clock of its own.
  const robot = Object.assign(new Simulation(map), { clockSource: player });
  Object.assign(robot.player, { x: v.x + 6, z: v.z + .4, vx: 0, vz: 0 });
  // The line across the vent is otherwise clear.
  player.worldClock = off;
  assert.equal(player.sightBlocked(v.x - 6, v.z, v.x + 6, v.z), false, 'nothing else on the line');
  assert.equal(player.sees(v.x + 6, v.z + .4, .3), true);
  assert.equal(robot.sees(v.x - 6, v.z, .3), true);
  player.worldClock = on;
  assert.equal(player.sightBlocked(v.x - 6, v.z, v.x + 6, v.z), true);
  assert.equal(player.sees(v.x + 6, v.z + .4, .3), false, 'the player cannot see through it');
  assert.equal(robot.sees(v.x - 6, v.z, .3), false, 'nor can the robot');
  // Past the cylinder's edge a line is clear; inside the steam you see nothing out.
  assert.equal(player.sightBlocked(v.x - 6, v.z + VENTS.radius + .1, v.x + 6, v.z + VENTS.radius + .1), false);
  assert.equal(player.sightBlocked(v.x, v.z + .5, v.x, v.z + 8), true);
  // Rounds and bodies are not stopped: the cloud is no collider.
  assert.equal(mapColliders(map).some(c => Math.hypot(c.x - v.x, c.z - v.z) < VENTS.radius), false);
  // Pure: the same answer from ventsBlockSight for the same clock.
  assert.equal(ventsBlockSight(LUMEN_VENTS, on, v.x - 6, v.z, v.x + 6, v.z), true);
  assert.equal(ventsBlockSight(LUMEN_VENTS, off, v.x - 6, v.z, v.x + 6, v.z), false);
});

test('other maps: no vents, sight unchanged', () => {
  const sim = new Simulation(maps.deadwater);
  assert.equal(maps.deadwater.city?.vents, undefined);
  sim.worldClock = 12;
  assert.equal(typeof sim.sightBlocked(0, 0, 1, 1), 'boolean');
});

test('the match clock: two sims with the same match time see the same weather', () => {
  const clock = CityFeatures.prototype.clock;
  const a = new Simulation(maps['city-test'] || map), b = new Simulation(maps['city-test'] || map);
  a.time = 3.2; b.time = 911.7; // their own clocks differ (a joiner arrived late)
  a.worldClock = b.worldClock = 187.25;
  assert.equal(clock.call(null, a), 187.25); assert.equal(clock.call(null, b), 187.25);
  for (const t of [0, 13, 60, 118, 125, 200, 239.9, 187.25, 5000]) {
    a.worldClock = b.worldClock = t;
    assert.equal(rainAt(clock.call(null, a)), rainAt(clock.call(null, b)));
    assert.equal(wetnessAt(clock.call(null, a)), wetnessAt(clock.call(null, b)));
  }
  // No shared clock: the sim's own time (SOLO, practice), or the page sim's (a robot).
  delete a.worldClock; assert.equal(clock.call(null, a), 3.2);
  const robot = Object.assign(new Simulation(map), { clockSource: a }); robot.time = 50;
  assert.equal(clock.call(null, robot), 3.2);
});

test('online, the host and a joiner share the clock with no new field on the wire', () => {
  const net = createLoopback(), m = maps.deadwater, createSim = mm => new Simulation(mm);
  let time = 100;
  const now = () => time;
  const hostSim = createSim(m), host = new HostSession({ transport: net.host('ABCDE'), map: m, local: hostSim, createSim, now, name: 'H', settings: { robots: 'off' } });
  const joinSim = createSim(m);
  assert.equal(ClientSession.prototype.worldClock.call({ clockOffset: null, now }), null, 'none before the host is heard');
  const join = new ClientSession({ transport: net.join('ABCDE'), map: m, local: joinSim, createSim, now, name: 'J' });
  net.flush();
  assert.ok(Math.abs(join.worldClock() - host.worldClock()) < .05, 'from the welcome on');
  host.startRound('ffa'); host.choose('static'); net.flush();
  for (let i = 0; i < 600; i++) { time += 1 / 60; hostSim.step(host.beforeLocal({})); joinSim.step(join.input({})); net.flush(); host.step(); hostSim.drainEvents(); net.flush(); }
  const h = host.worldClock(), j = join.worldClock();
  assert.ok(Math.abs(h - 10) < 1e-9, `host at tick 600: ${h}`);
  assert.ok(Math.abs(h - j) < .1, `joiner ${j} with host ${h}`);
  hostSim.worldClock = h; joinSim.worldClock = j;
  assert.ok(Math.abs(wetnessAt(hostSim.worldTime()) - wetnessAt(joinSim.worldTime())) < .01);
});
