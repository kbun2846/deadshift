// The storm (owner, 2026-09-29): a new circle each team round, closing
// steadily for two minutes onto a final zone that holds to the round's 2:30,
// then sudden death; FFA one slow close to a small final zone 45 s before the
// end. 15 health a second in quick bites; never in practice or 1V1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { maps, mapColliders } from '../src/maps.js';
import { isPlayable } from '../src/playable-area.js';
import { Simulation } from '../src/simulation.js';
import { STORM, STORM_ROUND, stormMode, stormPlan, stormAt, stormPhase, inStorm, stormState, readStormState, stormStart } from '../src/storm.js';
import { arena, people, tick, takePoint, breakOf } from './rules-harness.js';

const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('which modes: FFA and the team modes; never practice or 1V1', () => {
 for (const m of ['ffa', '2v2', '3v3', '4v4', '2v2v2']) assert.ok(stormMode(m), m);
 for (const m of ['practice', '1v1']) assert.ok(!stormMode(m), m);
 assert.equal(STORM_ROUND, 150, 'a team round is 2:30');
});

test('a round: the whole map at first, closing steadily for two minutes to a final zone inside the playable map, holding to 2:30, then closing to nothing', () => {
 for (const id of ['deadwater', 'hollow-wick']) {
  const map = maps[id], plan = stormPlan(map, mapColliders(map), { random: seeded(3) }), start = stormStart(map);
  // At first everything on the map is inside.
  const c0 = stormAt(plan, 0);
  for (const [x, z] of [[-map.width / 2, -map.depth / 2], [map.width / 2, map.depth / 2]]) assert.ok(!inStorm(c0, x, z), id + ': a corner is safe at the start');
  // Always shrinking, every circle inside the one before, to the final one at 2:00.
  let prev = c0;
  for (let t = 1; t <= STORM.close; t += 1) {
   const c = stormAt(plan, t);
   assert.ok(c.r < prev.r, 'shrinking');
   assert.ok(Math.hypot(c.x - prev.x, c.z - prev.z) + c.r <= prev.r + 1e-6, 'inside the one before');
   prev = c;
  }
  const fin = stormAt(plan, STORM.close);
  assert.ok(Math.abs(fin.r - plan.r1) < 1e-9 && Math.abs(fin.x - plan.x1) < 1e-9);
  for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; assert.ok(isPlayable(map, fin.x + Math.cos(a) * fin.r, fin.z + Math.sin(a) * fin.r, 1), id + ': the final zone is on the map'); }
  assert.deepEqual(stormAt(plan, 140), fin, 'it holds');
  assert.equal(stormPhase(plan, 60).phase, 'closing'); assert.equal(stormPhase(plan, 130).phase, 'final'); assert.equal(stormPhase(plan, 155).phase, 'sudden');
  assert.ok(Math.abs(stormPhase(plan, 130).left - 20) < 1e-9);
  assert.ok(stormAt(plan, 150 + STORM.sudden / 2).r < fin.r * .6, 'sudden death closes in');
  assert.equal(stormAt(plan, 150 + STORM.sudden + 1).r, 0, 'to nothing');
  assert.ok(start.r >= Math.hypot(map.width, map.depth) / 2);
 }
});

test('FFA: one slow close over the match, the small final zone 45 s before the end, then it stays', () => {
 const map = maps.deadwater, plan = stormPlan(map, mapColliders(map), { kind: 'ffa', length: 600, random: seeded(5) });
 assert.equal(plan.close, 600 - STORM.ffaHold); assert.equal(plan.r1, STORM.ffaFinal);
 assert.equal(stormPhase(plan, 560).phase, 'final'); assert.deepEqual(stormAt(plan, 599), stormAt(plan, 560));
 assert.deepEqual(readStormState(JSON.parse(JSON.stringify(stormState(plan)))).hold, Infinity);
});

test('the simulation: 15 a second in quick bites outside, nothing inside, marked as the storm\'s', () => {
 const sim = new Simulation(maps.deadwater); sim.respawn({ x: 0, z: 0 });
 sim.storm = { x: 60, z: 60, r: 4 };
 let bites = 0, total = 0;
 for (let i = 0; i < 60; i++) { sim.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0 }); for (const e of sim.drainEvents()) if (e.type === 'playerDamage') { assert.equal(e.storm, true); bites++; total += e.damage; } }
 assert.equal(bites, 20); assert.ok(Math.abs(total - STORM.damage) < 1e-9);
 sim.storm = { x: 0, z: 0, r: 20 }; const hp = sim.player.hp;
 for (let i = 0; i < 60; i++) sim.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0 });
 assert.equal(sim.player.hp, hp, 'safe inside');
});

test('online team round: the storm closes, holds, sudden death ends it; everyone gets the circle; the joiner is told', () => {
 const a = arena({ humans: 1, mode: '2v2' });
 assert.ok(a.stormPlan, 'a storm'); assert.ok(a.matchState().storm, 'in the match state');
 tick(a, 30);
 const c = a.storm; assert.ok(c.r < stormStart(a.map).r, 'closing');
 for (const s of a.seats.values()) { a.before(s); assert.deepEqual(s.sim.storm, c); a.after(s); }
 // A new storm each round.
 const first = a.stormPlan; takePoint(a, a.sideOf(people(a)[0])); tick(a, breakOf(a));
 assert.notEqual(a.stormPlan, first); assert.ok(a.stormClock < 1);
 // Practice and 1V1: none. The host's developer setting turns it off.
 for (const mode of ['practice', '1v1']) assert.equal(arena({ humans: 1, mode }).stormPlan, null, mode);
 assert.equal(arena({ humans: 1, mode: '2v2', settings: { storm: 'off' } }).stormPlan, null);
});

test('online FFA: the clock follows the match, and a respawn is always inside the safe circle', () => {
 const a = arena({ humans: 1, mode: 'ffa', settings: { roundLength: 300 } });
 assert.equal(a.stormPlan.kind, 'ffa');
 tick(a, 200);
 assert.ok(Math.abs(a.stormClock - (300 - a.clock)) < .05 && a.stormClock > 199, 'the match clock');
 const seat = people(a)[0];
 for (let k = 0; k < 8; k++) { a.spawn(seat); const p = seat.sim.player; assert.ok(!inStorm(a.storm, p.x, p.z), 'inside'); }
});
