// 1V1's duel circle (owner, 2026-09-29): a close-range circle, a new place each
// round, always whole on the map, both players inside on opposite sides, and
// nobody walks out of it. Online (the host picks it, joiners get it) and SOLO.
import test from 'node:test';
import assert from 'node:assert/strict';
import { maps } from '../src/maps.js';
import { Simulation } from '../src/simulation.js';
import { isPlayable } from '../src/playable-area.js';
import { openAt } from '../src/net/spawn-points.js';
import { pickDuelCircle, duelCircleRadius, confineToCircle, circleState, circleFits, openShare, DUEL_CIRCLE } from '../src/duel-circle.js';
import { createLoopback } from '../src/net/transport.js';
import { HostSession } from '../src/net/host-session.js';
import { ClientSession } from '../src/net/client-session.js';
import { BotMatch } from '../src/bots/bot-match.js';
import { createDuel } from '../src/duel.js';
import { mapColliders } from '../src/maps.js';
import { RULES } from '../src/config/gameplay.js';
import { arena, start, takePoint, tick, breakOf, people } from './rules-harness.js';

const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('the radius is a close-range box, a little over a quarter of the map across (owner: slightly bigger)', () => {
 const dw = maps.deadwater, r = duelCircleRadius(dw), size = (dw.width + dw.depth) / 2;
 assert.ok(r * 2 >= size / 4 && r * 2 <= size * .28, 'Deadwater: ' + r);
 for (const map of Object.values(maps).filter(m => m.width && m.depth)) {
  const radius = duelCircleRadius(map);
  assert.ok(radius >= DUEL_CIRCLE.minR && radius <= DUEL_CIRCLE.maxR, map.id);
 }
});

test('a circle is always whole inside the map\'s playable outline (never over its fences), with two open spots on opposite sides, well apart', () => {
 for (const id of ['deadwater', 'hollow-wick']) {
  const map = maps[id]; if (!map) continue;
  const colliders = mapColliders(map), random = seeded(11);
  let last = null;
  for (let i = 0; i < 12; i++) {
   const c = pickDuelCircle(map, colliders, { random, avoid: last });
   assert.ok(Math.abs(c.x) + c.r <= map.width / 2 - DUEL_CIRCLE.border + 1e-6 && Math.abs(c.z) + c.r <= map.depth / 2 - DUEL_CIRCLE.border + 1e-6, id + ': whole on the map');
   assert.ok(isPlayable(map, c.x, c.z, 1), id + ': the centre is playable');
   for (let i = 0; i < 180; i++) { const a = i / 180 * Math.PI * 2; assert.ok(isPlayable(map, c.x + Math.cos(a) * c.r, c.z + Math.sin(a) * c.r, 1), id + ': the edge inside the outline'); }
   assert.ok(circleFits(map, c.x, c.z, c.r)); assert.ok(c.r >= DUEL_CIRCLE.minR * .75);
   const [a, b] = c.spawns;
   for (const p of [a, b]) {
    assert.ok(Math.hypot(p.x - c.x, p.z - c.z) <= c.r * DUEL_CIRCLE.spawnAt[1] + 1e-6, id + ': a spot inside');
    assert.ok(openAt(map, colliders, p.x, p.z, 1), id + ': an open spot');
   }
   assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= c.r * DUEL_CIRCLE.spawnAt[0] * 2 - 1e-6, id + ': well apart');
   assert.ok(Math.abs((a.x + b.x) / 2 - c.x) < 1e-6 && Math.abs((a.z + b.z) / 2 - c.z) < 1e-6, id + ': opposite sides');
   last = c;
  }
  // The same random, the same circle (the host and SOLO pick their own).
  const one = pickDuelCircle(map, colliders, { random: seeded(5) }), two = pickDuelCircle(map, colliders, { random: seeded(5) });
  assert.deepEqual(one, two);
 }
});

test('a circle leaves room to fight: most of its floor free of walls, towers and cover', () => {
 for (const id of ['deadwater', 'hollow-wick', 'lumen']) {
  const map = maps[id]; if (!map) continue;
  const colliders = mapColliders(map), random = seeded(21); let last = null;
  for (let i = 0; i < 12; i++) {
   const c = pickDuelCircle(map, colliders, { random, avoid: last }); last = c;
   assert.ok(openShare(map, colliders, c.x, c.z, c.r) >= DUEL_CIRCLE.open, id + ': room to fight');
  }
 }
 // A circle over a solid block is mostly closed.
 const map = maps.deadwater, block = [{ x: 0, z: 0, w: 30, d: 30 }];
 assert.ok(openShare(map, block, 0, 0, 16) < .2);
});

test('the body is kept inside (its whole radius) and loses its speed outward, not along the edge', () => {
 const c = { x: 10, z: -4, r: 20 }, p = { x: 40, z: -4, vx: 5, vz: 3 };
 assert.equal(confineToCircle(p, c, .5), true);
 assert.ok(Math.abs(Math.hypot(p.x - c.x, p.z - c.z) - 19.5) < 1e-9);
 assert.equal(p.vx, 0); assert.equal(p.vz, 3);
 const inside = { x: 12, z: -4, vx: 1, vz: 0 };
 assert.equal(confineToCircle(inside, c, .5), false); assert.equal(inside.x, 12);
 assert.equal(confineToCircle(inside, null), false);
 assert.deepEqual(circleState({ x: 1.23456, z: -2.34567, r: 26.0001, spawns: [] }), { x: 1.23, z: -2.35, r: 26 });
});

test('a Simulation with a boundary never walks out of it (and one without is unchanged)', () => {
 const map = maps.deadwater, sim = new Simulation(map), c = { x: 0, z: 30, r: 12 };
 sim.respawn({ x: 0, z: 30 }); sim.boundary = c;
 for (let i = 0; i < 300; i++) sim.step({ moveX: 1, moveZ: 0, aimX: 1, aimZ: 0 });
 assert.ok(Math.hypot(sim.player.x - c.x, sim.player.z - c.z) <= c.r - RULES.radius + 1e-6, 'stopped at the edge');
 const free = new Simulation(map); free.respawn({ x: 0, z: 30 });
 for (let i = 0; i < 300; i++) free.step({ moveX: 1, moveZ: 0, aimX: 1, aimZ: 0 });
 assert.ok(free.player.x > 12, 'no boundary: walks on');
});

test('online 1V1: a circle each round, both on its spots, every sim confined, the match state carries it; other modes none', () => {
 const a = arena({ humans: 1, mode: '1v1' });
 const c = a.duelCircle; assert.ok(c, 'a circle');
 const seats = [...a.seats.values()];
 assert.equal(seats.length, 2);
 for (const s of seats) assert.equal(s.sim.boundary, c, 'every sim confined');
 const spots = seats.map(s => ({ x: s.sim.player.x, z: s.sim.player.z }));
 for (const p of spots) assert.ok(c.spawns.some(q => Math.hypot(q.x - p.x, q.z - p.z) < .01), 'on a spot');
 assert.ok(Math.hypot(spots[0].x - spots[1].x, spots[0].z - spots[1].z) > 1, 'different spots');
 assert.deepEqual(a.matchState().circle, circleState(c));
 // The next round: a new place.
 takePoint(a, a.sideOf(people(a)[0])); tick(a, breakOf(a));
 assert.notDeepEqual(a.duelCircle, c); assert.equal(people(a)[0].sim.boundary, a.duelCircle);
 // 2V2, FFA, practice: no circle, nobody confined.
 for (const mode of ['2v2', 'ffa', 'practice']) {
  const b = arena({ humans: 1, mode });
  assert.equal(b.duelCircle, null, mode); assert.equal(b.matchState().circle, undefined, mode);
  assert.ok([...b.seats.values()].every(s => !s.sim.boundary), mode);
 }
});

test('a joiner gets the circle and confines its own body (prediction) to it', () => {
 const map = maps.deadwater, createSim = m => new Simulation(m), net = createLoopback(), hostSim = createSim(map); let time = 0;
 const host = new HostSession({ transport: net.host('ABCDE'), map, local: hostSim, createSim, now: () => time, name: 'Hosty', random: seeded(3), settings: { robots: 'off' } });
 const sim = createSim(map), client = new ClientSession({ transport: net.join('ABCDE'), map, local: sim, createSim, now: () => time, name: 'P0' });
 net.flush();
 const tickOnce = () => { time += 1 / 60; hostSim.step(host.beforeLocal({})); sim.step(client.input({})); sim.drainEvents(); net.flush(); host.step(); hostSim.drainEvents(); net.flush(); };
 assert.ok(host.startRound('1v1'), host.startError);
 for (let i = 0; i < 10; i++) tickOnce();
 const c = host.arena.duelCircle;
 assert.deepEqual(client.match().circle, circleState(c));
 assert.deepEqual(sim.boundary, circleState(c));
});

test('SOLO 1V1: you and the robot on the circle\'s two spots, facing each other, both confined; a new circle each placing; none in 2V2', () => {
 const el = () => ({ hidden: false, className: '', innerHTML: '', textContent: '', classList: { add() {}, remove() {}, contains: () => true, toggle() {} }, setAttribute() {}, append() {}, querySelector: () => el(), focus() {} });
 const previous = globalThis.document; globalThis.document = { createElement: el };
 try {
  const map = maps.deadwater, sim = new Simulation(map), bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(9) });
  const duel = createDuel(el(), { sim, bots, random: seeded(2) });
  duel.begin({ mode: '1v1', firstTo: 3 });
  assert.equal(duel.placeDuel(), true);
  const c = duel.circle, [mine, theirs] = c.spawns, bot = duel.bot.sim.player;
  assert.ok(Math.hypot(sim.player.x - mine.x, sim.player.z - mine.z) < .01 && Math.hypot(bot.x - theirs.x, bot.z - theirs.z) < .01);
  assert.equal(sim.boundary, c); assert.equal(duel.bot.sim.boundary, c);
  assert.ok(sim.player.aimX * (theirs.x - mine.x) + sim.player.aimZ * (theirs.z - mine.z) > 0, 'facing the robot');
  duel.placeDuel(); assert.notEqual(duel.circle, c, 'a new circle');
  duel.stop(); assert.equal(sim.boundary, null); assert.equal(duel.circle, null);
  duel.begin({ mode: '2v2', firstTo: 3 });
  assert.equal(duel.placeDuel(), false); assert.equal(sim.boundary, null);
  duel.stop();
 } finally { globalThis.document = previous; }
});

test('robots keep their goals and routes inside the duel circle (not grinding along its wall)', () => {
 const el = () => ({ hidden: false, className: '', innerHTML: '', textContent: '', classList: { add() {}, remove() {}, contains: () => true, toggle() {} }, setAttribute() {}, append() {}, querySelector: () => el(), focus() {} });
 const previous = globalThis.document; globalThis.document = { createElement: el };
 try {
  const map = maps.deadwater, sim = new Simulation(map), bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(4) });
  const duel = createDuel(el(), { sim, bots, random: seeded(8) });
  duel.begin({ mode: '1v1', firstTo: 3 }); duel.placeDuel();
  const c = duel.circle, bot = duel.bot, brain = bot.brain;
  // A goal and a route far outside are brought in.
  const out = brain.inside({ x: c.x + c.r * 3, z: c.z, chase: true });
  assert.ok(Math.hypot(out.x - c.x, out.z - c.z) <= c.r - 1.5 && out.chase, 'brought in, kept its flags');
  const inner = { x: c.x + 1, z: c.z };
  assert.equal(brain.inside(inner), inner, 'a spot inside is left alone');
  // You out of the way (no fight): it patrols; every goal and waypoint stays inside.
  sim.dev = { ghost: true }; let edgeTicks = 0, goals = 0;
  for (let i = 0; i < 900; i++) {
   bots.step(sim);
   const g = brain.goal; if (g) { goals++; assert.ok(Math.hypot(g.x - c.x, g.z - c.z) <= c.r - 1.5 + 1e-6, 'goal inside'); }
   for (const w of brain.path || []) assert.ok(Math.hypot(w.x - c.x, w.z - c.z) <= c.r - 1.5 + 1e-6, 'route inside');
   const p = bot.sim.player; if (Math.hypot(p.x - c.x, p.z - c.z) > c.r - .6) edgeTicks++;
  }
  assert.ok(goals > 0, 'it went somewhere');
  assert.ok(edgeTicks < 120, 'hardly ever pressed against the wall: ' + edgeTicks);
 } finally { globalThis.document = previous; }
});
