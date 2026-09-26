// Hollow Wick's spawns (s2-spawns): bases, FFA points and no-spawn areas are
// valid on the real ground and the map's colliders; team modes use the right
// bases; FFA points are spread and a screen apart when it counts; robots can
// walk from every base to the others and the summit; the practice targets
// stand where the design notes put them; and a 2V2 of robots runs a minute.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { maps, mapColliders, groundFor, multiplayerMaps, soloMaps, workMaps, menuMaps, supportsMode } from '../src/maps.js';
import { Arena } from '../src/net/arena.js';
import { spawnProblem, teamBase, ffaSpot, baseSpot, inNoSpawn } from '../src/net/map-spawns.js';
import { openSpot } from '../src/net/spawn-points.js';
import { NavGrid } from '../src/bots/nav-grid.js';
import { BotMatch } from '../src/bots/bot-match.js';
import { SPAWN_APART, TEAMS } from '../src/config/match.js';
import { insidePoly } from '../src/world/heightfield.js';
import { HW_TARGET_SPOTS } from '../src/maps/hollow-wick-spawns.js';
import { pickArea, inPickArea } from '../src/render/pick-view.js';

const map = maps['hollow-wick'], ground = groundFor(map), colliders = mapColliders(map), createSim = m => new Simulation(m);
const seeded = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('every base point and FFA point is a fair place to come in', () => {
 const bad = [];
 for (const base of map.bases) {
  assert.ok(base.points.length >= 6 && base.points.length <= 8, base.id + ': 6-8 points');
  for (const pt of base.points) {
   const why = spawnProblem(map, colliders, pt.x, pt.z); if (why) bad.push(`${base.id} (${pt.x}, ${pt.z}): ${why}`);
   assert.ok(insidePoly(pt.x, pt.z, base.poly), `${base.id} (${pt.x}, ${pt.z}) is inside its polygon`);
   assert.ok(d(pt, base) <= 8, `${base.id} (${pt.x}, ${pt.z}) is near the base`);
  }
  for (let i = 0; i < base.points.length; i++) for (let j = i + 1; j < base.points.length; j++) assert.ok(d(base.points[i], base.points[j]) >= 1.6, base.id + ': points a body apart');
 }
 for (const pt of map.ffaSpawns) { const why = spawnProblem(map, colliders, pt.x, pt.z); if (why) bad.push(`ffa (${pt.x}, ${pt.z}): ${why}`); }
 assert.deepEqual(bad, []);
});

test('nothing spawns in water, on a deck, on steep ground or in a no-spawn area', () => {
 for (const pt of [...map.ffaSpawns, ...map.bases.flatMap(b => b.points)]) {
  assert.ok(ground.bankDistance(pt.x, pt.z) >= 0 && !ground.wetAt(pt.x, pt.z), 'dry');
  assert.equal(ground.deckAt(pt.x, pt.z), -1, 'not on a deck');
  assert.ok(!inNoSpawn(map, pt.x, pt.z), 'not in a no-spawn area');
  const g = ground.gradientAt(pt.x, pt.z); assert.ok(Math.hypot(g.x, g.z) <= .3, 'level enough');
 }
 // The rules refuse them too.
 assert.equal(spawnProblem(map, colliders, -14, 22), 'water');
 assert.equal(spawnProblem(map, colliders, -44, -22.5), 'noSpawn');
 // Sampled open spots (the fallback, solo practice) keep the same rules.
 const random = seeded(5);
 for (let i = 0; i < 60; i++) { const s = openSpot(map, colliders, { random }); assert.ok(s); assert.equal(spawnProblem(map, colliders, s.x, s.z), null); }
});

test('FFA points: about 20, spread over the map, most a screen from most others', () => {
 const pts = map.ffaSpawns;
 assert.ok(pts.length >= 18 && pts.length <= 24);
 let min = Infinity; for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) min = Math.min(min, d(pts[i], pts[j]));
 assert.ok(min >= 15, 'no two points closer than 15 m (was ' + min.toFixed(1) + ')');
 for (const p of pts) assert.ok(pts.filter(q => d(p, q) >= SPAWN_APART).length >= pts.length * .7, `(${p.x}, ${p.z}): most points are a screen away`);
 // Every quarter of the map has some.
 for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) assert.ok(pts.filter(p => Math.sign(p.x) === sx && Math.sign(p.z) === sz).length >= 3);
 // None in the weapon-pick view's ground (it looks outside the fence).
 const area = pickArea(map);
 for (const p of [...pts, ...map.bases.flatMap(b => b.points)]) assert.ok(!inPickArea(area, p.x, p.z));
});

test('ffaSpot: a screen from everyone, hidden by the ground when it can be', () => {
 const random = seeded(8);
 const others = [{ x: -10, z: -2 }, { x: 30, z: -5 }];
 for (let i = 0; i < 20; i++) {
  const s = ffaSpot(map, colliders, { others, random, space: SPAWN_APART });
  assert.ok(s && others.every(o => d(o, s) >= SPAWN_APART));
 }
 // Crowded everywhere: null, so the caller samples an open spot.
 assert.equal(ffaSpot(map, colliders, { others: map.ffaSpawns, space: 5 }), null);
});

test('team modes: 2V2 and 3V3 at A and C, 2V2V2 at A, B and C', () => {
 const two = TEAMS.slice(0, 2).map(t => t.id), three = TEAMS.map(t => t.id);
 assert.deepEqual(two.map(t => teamBase(map, t, two).id), ['A', 'C']);
 assert.deepEqual(three.map(t => teamBase(map, t, three).id), ['A', 'B', 'C']);
 for (const [mode, count, bases] of [['2v2', 4, ['A', 'C']], ['3v3', 6, ['A', 'C']], ['2v2v2', 6, ['A', 'B', 'C']]]) {
  const arena = new Arena({ map, createSim, random: seeded(11) });
  arena.setMode(mode); assert.ok(arena.startRound(mode), mode + ' starts with robots filling');
  for (let i = 0; i < 3; i++) arena.endTick();
  const seats = [...arena.seats.values()];
  assert.equal(seats.length, count);
  for (const seat of seats) {
   assert.ok(seat.present, seat.id + ' is in');
   const sides = TEAMS.slice(0, bases.length).map(t => t.id), want = map.bases.find(b => b.id === bases[sides.indexOf(seat.team)]);
   assert.ok(d(seat.sim.player, want) <= 8, `${mode}: ${seat.team} at base ${want.id}`);
  }
  // Teammates a body apart.
  for (const a of seats) for (const b of seats) if (a !== b && a.team === b.team) assert.ok(d(a.sim.player, b.sim.player) >= 1.5);
 }
});

test('FFA: everyone comes in at a scattered point, a screen apart', () => {
 const arena = new Arena({ map, createSim, random: seeded(4) });
 assert.ok(arena.startRound('ffa'));
 for (let i = 0; i < 3; i++) arena.endTick();
 const seats = [...arena.seats.values()];
 assert.equal(seats.length, 4);
 for (const a of seats) for (const b of seats) if (a !== b) assert.ok(d(a.sim.player, b.sim.player) >= SPAWN_APART, 'a screen apart');
 for (const s of seats) assert.equal(spawnProblem(map, arena.world.colliders, s.sim.player.x, s.sim.player.z), null);
});

test('robots can walk from every base to the others and to the summit', () => {
 const nav = new NavGrid(map, colliders), summit = { x: -44, z: -22.5 };
 const reach = (a, b) => { const route = nav.path(a.x, a.z, b.x, b.z, 400000); const end = route?.at(-1); return !!end && d(end, b) < 2; };
 for (const a of map.bases) {
  assert.ok(reach(a, summit), a.id + ' to the summit');
  for (const b of map.bases) if (a !== b) assert.ok(reach(a, b), a.id + ' to ' + b.id);
 }
 // Across the fallen log: open squares all along it.
 for (let z = 16.5; z <= 26.5; z += 1) { const x = -31.3 - (z - 15.75) / 11.25 * 1.3; assert.ok(nav.isOpen(x, z), 'the log at z ' + z); }
 // Along the mill dam's top (stage 4 audit: 1.6 m between its wall faces left no square a robot fits in).
 for (let z = 16.25; z <= 24.75; z += .5) assert.ok(nav.isOpen(13.75, z) || nav.isOpen(14.25, z), 'the dam at z ' + z);
});

test('practice targets: 6, 10, 14 and 20 m from the green, one 2.5 m above and one below a standing spot', () => {
 const byId = new Map(map.targets.map(t => [t.id, t]));
 let above = false, below = false;
 for (const spot of HW_TARGET_SPOTS) {
  assert.equal(spawnProblem(map, colliders, spot.x, spot.z), null, spot.id + ' is a natural place to stand');
  const h = ground.heightAt(spot.x, spot.z);
  for (const id of spot.targets) {
   const t = byId.get(id); assert.ok(t, id);
   assert.ok(ground.sightClear(spot.x, spot.z, t.x, t.z), id + ' in sight');
   const dh = ground.heightAt(t.x, t.z) - h; if (dh >= 2.5) above = true; if (dh <= -2.5) below = true;
  }
 }
 const green = HW_TARGET_SPOTS[0];
 const ranges = green.targets.map(id => Math.round(d(byId.get(id), green)));
 assert.deepEqual(ranges, [6, 10, 14, 20]);
 assert.ok(above && below);
 for (const t of map.targets) { assert.ok(ground.bankDistance(t.x, t.z) >= 0, t.id + ' dry'); assert.equal(ground.deckAt(t.x, t.z), -1); }
});

test('Hollow Wick is playable in every mode but offered only where it is loaded', () => {
 assert.ok(supportsMode(map, 'multiplayer') && supportsMode(map, 'practice'));
 assert.ok(!menuMaps().includes(map) && workMaps().includes(map));
 assert.ok(!multiplayerMaps().includes(map), 'not in the lobby list from another map');
 assert.ok(multiplayerMaps(map).includes(map) && multiplayerMaps(maps.deadwater).every(m => m.menu));
 assert.ok(!soloMaps(maps.deadwater).includes(map) && soloMaps(map).includes(map));
 assert.equal(multiplayerMaps()[0].id, 'deadwater', 'the default multiplayer map is unchanged');
});

test('SOLO on Hollow Wick: 2V2 sides at their bases, 1V1 scattered', () => {
 const you = createSim(map), bots = new BotMatch(map, { createSim, random: seeded(6) });
 bots.apart = SPAWN_APART; bots.baseSpawn = true;
 const ally = bots.spawn(you, null, { team: 'blue' });
 const foes = [bots.spawn(you, null, { team: 'red' }), bots.spawn(you, null, { team: 'red' })];
 const [A, C] = ['A', 'C'].map(id => map.bases.find(b => b.id === id));
 assert.ok(d(ally.sim.player, A) <= 8 && foes.every(f => d(f.sim.player, C) <= 8));
 const at = bots.youSpot(you); assert.ok(at && d(at, A) <= 8, 'you at A');
 const solo = new BotMatch(map, { createSim, random: seeded(7) }); solo.apart = SPAWN_APART;
 const bot = solo.spawn(you, null, { team: 'red' });
 assert.ok(map.ffaSpawns.some(p => d(p, bot.sim.player) < .01), 'a 1V1 robot comes in at an FFA point');
 const me = solo.youSpot(you); assert.ok(me && d(me, bot.sim.player) >= SPAWN_APART);
 assert.equal(baseSpot(map, colliders, A, { others: A.points }).x !== undefined, true, 'a crowded base still gives a spot');
});

test('a 2V2 of robots on Hollow Wick runs 60 simulated seconds: they move and fight', () => {
 const arena = new Arena({ map, createSim, random: seeded(21) });
 arena.setMode('2v2'); assert.ok(arena.startRound('2v2'));
 const IDLE = { moveX: 0, moveZ: 0, aimX: 0, aimZ: 0 };
 const start = new Map(), travelled = new Map(), seen = new Set();
 let shots = 0, damage = 0;
 for (let tick = 0; tick < 60 * 60; tick++) {
  arena.robots.beginTick(arena.time);
  for (const seat of arena.robots.seats) {
   const before = { x: seat.sim.player.x, z: seat.sim.player.z };
   const input = arena.robots.input(seat, 1 / 60) || IDLE;
   seat.sim.dev = { speed: 1 };
   arena.stepSeat(seat, input);
   const events = seat.sim.drainEvents();
   arena.robots.hear(seat.id, events);
   for (const e of events) { if (/Shot|launch|scatterFire|sprayStart/.test(e.type)) shots++; if (e.type === 'hit' || e.type === 'kill') damage++; }
   const p = seat.sim.player;
   for (const v of [p.x, p.z, p.hp]) assert.ok(Number.isFinite(v), 'finite state');
   if (seat.present && !seat.dead) {
    if (!start.has(seat.id)) start.set(seat.id, before);
    travelled.set(seat.id, Math.max(travelled.get(seat.id) || 0, d(p, start.get(seat.id))));
    assert.equal(ground.deckAt(p.x, p.z) >= 0 || ground.heightAt(p.x, p.z) > -2, true);
    seen.add(seat.id);
   }
  }
  arena.endTick();
 }
 assert.equal(seen.size, 4, 'all four came in');
 for (const [id, far] of travelled) assert.ok(far > 8, id + ' moved (' + far.toFixed(1) + ' m)');
 const stats = [...arena.seats.values()].reduce((a, s) => a + s.stats.dealt, 0);
 assert.ok(shots > 0, 'they fired');
 assert.ok(stats > 0 || damage > 0, 'someone was hurt');
});

test('stage 4 audit: a respawn at a base keeps out of a living enemy\'s sight; FFA respawns spread out', async () => {
 const { exposedTo, BASE_SAFE } = await import('../src/net/map-spawns.js');
 const map = maps['hollow-wick'], colliders = mapColliders(map), A = map.bases.find(b => b.id === 'A');
 // Base A's points are off the main street's road.
 const road = map.terrain.paths.find(p => p.id === 'main-east');
 const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz; let t = L ? ((x - a[0]) * dx + (z - a[1]) * dz) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
 for (const pt of A.points) assert.ok(road.points.slice(1).every((q, i) => segDist(pt.x, pt.z, road.points[i], q) >= road.width / 2), `A point ${pt.x},${pt.z} on the road`);
 // An enemy standing in the base: never a point in their sight while another will do.
 let random = 0; const seq = () => (random = (random * 9301 + 49297) % 233280) / 233280;
 for (const enemy of [{ x: 33, z: -7 }, { x: 26, z: -12 }, { x: 40, z: -15 }]) {
  for (let k = 0; k < 40; k++) {
   const at = baseSpot(map, colliders, A, { enemies: [enemy], random: seq });
   const anySafe = A.points.some(pt => !exposedTo(map, colliders, enemy, pt.x, pt.z)) || map.ffaSpawns.some(pt => Math.hypot(pt.x - A.x, pt.z - A.z) < 30 && !exposedTo(map, colliders, enemy, pt.x, pt.z));
   if (anySafe) assert.ok(!exposedTo(map, colliders, enemy, at.x, at.z), `respawn at ${at.x},${at.z} in sight of ${enemy.x},${enemy.z}`);
  }
 }
 assert.ok(exposedTo(map, colliders, { x: 33, z: -7 }, 34, -6) && BASE_SAFE >= 10);
 // FFA: the last points used sit out, so respawns do not all come in at one hidden point.
 const recent = [], counts = new Map(); random = 7;
 for (let k = 0; k < 60; k++) {
  const at = ffaSpot(map, colliders, { others: [{ x: 0, z: 0 }], random: seq, space: 26, recent });
  assert.ok(at && !recent.some(r => r.x === at.x && r.z === at.z));
  recent.push(at); if (recent.length > 3) recent.shift();
  counts.set(`${at.x},${at.z}`, (counts.get(`${at.x},${at.z}`) || 0) + 1);
 }
 assert.ok(Math.max(...counts.values()) <= 15, `one point took ${Math.max(...counts.values())} of 60`);
});
