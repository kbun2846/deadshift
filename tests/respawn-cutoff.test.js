// No respawns near the end of a match (owner, 2026-09-30: "players won't
// respawn again when 45 sec is left in game ... for 3v3 modes and 4v4 modes
// it should be 1 min left"). config/match.js NO_RESPAWN_LEFT / respawnsClosed
// / respawnFate, the online arena (net/arena.js noRespawns, sitOut,
// lastStanding), BOTS FFA (duel.js) and the clock's text (multiplayer-hud.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { NO_RESPAWN_LEFT, respawnCutoff, respawnsClosed, respawnFate, cutoffText, MODES } from '../src/config/match.js';
import { clockView } from '../src/ui/multiplayer-hud.js';
import { PROTOCOL_VERSION } from '../src/net/protocol.js';
import { sortStatsRows, statsTableHTML } from '../src/ui/stats-panel.js';
import { Simulation } from '../src/simulation.js';
import { maps } from '../src/maps.js';
import { BotMatch } from '../src/bots/bot-match.js';
import { createDuel, FFA_RESPAWN } from '../src/duel.js';
import { arena, people, bots, tick, playPoint, seeded } from './rules-harness.js';

// Run an arena's clock down to `left` seconds (whole seconds while far off:
// each tick burns the world, so fine steps over ten minutes are slow).
const runTo = (a, left, dt = 1 / 20) => {
 while (a.phase === 'playing' && a.clock - left > 2) a.endTick(1);
 while (a.phase === 'playing' && a.clock - dt >= left - 1e-9) a.endTick(dt);
};
const kill = (a, seat, by = null) => { seat.sim.player.hp = 0; a.died(seat, by); };

test('the cutoff table: FFA, 2V2, 2V2V2 45 s; 3V3 and 4V4 a minute; none in 1V1 or practice', () => {
 assert.deepEqual({ ...NO_RESPAWN_LEFT }, { ffa: 45, '2v2': 45, '2v2v2': 45, '3v3': 60, '4v4': 60 });
 assert.ok(Object.isFrozen(NO_RESPAWN_LEFT));
 const want = { ffa: 45, practice: 0, '1v1': 0, '2v2': 45, '2v2v2': 45, '3v3': 60, '4v4': 60 };
 for (const { id } of MODES) {
  const cut = want[id];
  assert.equal(respawnCutoff(id), cut, id);
  assert.equal(respawnsClosed(id, 600), false, id + ' early on');
  assert.equal(respawnsClosed(id, cut + .1), false, id + ' just before');
  assert.equal(respawnsClosed(id, cut), cut > 0, id + ' at the cutoff');
  assert.equal(respawnsClosed(id, 1), cut > 0, id + ' near the end');
  // No clock (the round modes' Infinity), or nonsense: never closed.
  for (const left of [Infinity, NaN, undefined, null]) assert.equal(respawnsClosed(id, left), false, id + ' ' + left);
 }
 assert.equal(respawnsClosed('nonsense', 10), false);
 assert.equal(cutoffText('ffa'), '45 seconds left');
 assert.equal(cutoffText('3v3'), '1 minute left');
 assert.equal(cutoffText('1v1'), '');
});

test('respawnFate: open, late (your wait ends past the cutoff), closed, or none', () => {
 assert.equal(respawnFate('ffa', 120, 6), 'open');
 assert.equal(respawnFate('ffa', 51.5, 6), 'open', 'back at 45.5 left');
 assert.equal(respawnFate('ffa', 50, 6), 'late', 'would be back at 44 left');
 assert.equal(respawnFate('ffa', 51, 6), 'late', 'exactly at the cutoff is too late');
 assert.equal(respawnFate('ffa', 45, 0), 'closed');
 assert.equal(respawnFate('ffa', 10, Infinity), 'closed');
 assert.equal(respawnFate('ffa', 100, Infinity), 'late', 'no wait that ends is a respawn that never comes');
 assert.equal(respawnFate('4v4', 70, 6), 'open'); assert.equal(respawnFate('4v4', 65, 6), 'late');
 for (const mode of ['1v1', 'practice']) assert.equal(respawnFate(mode, 10, 6), 'none', mode);
 assert.equal(respawnFate('2v2', Infinity, Infinity), 'none', 'a round mode has no clock');
});

test('FFA: a death whose countdown crosses the cutoff never comes back; one well before it does', () => {
 const a = arena({ mode: 'ffa', humans: 3, settings: { robots: 'off' } });
 const [host, early, late] = people(a);
 runTo(a, 60);
 kill(a, early, host);
 assert.equal(early.respawnIn, 6);
 tick(a, 6.2);
 assert.ok(early.present && !early.dead, 'down at 60 left, back at 54');
 runTo(a, 50);
 kill(a, late, host);
 assert.equal(a.noRespawns, false); assert.equal(late.respawnIn, 6, 'the usual wait while respawns are open');
 runTo(a, 44);
 assert.equal(a.noRespawns, true);
 assert.ok(late.dead, 'still down'); assert.equal(late.respawnIn, Infinity, 'its countdown closed at the cutoff');
 tick(a, 20);
 assert.ok(late.dead && !late.picking, 'never back');
 assert.equal(a.phase, 'playing', 'two still standing: the clock runs');
});

test('FFA: a death after the cutoff never comes back, and CHANGE WEAPON does not bring anyone in', () => {
 const a = arena({ mode: 'ffa', humans: 4, settings: { robots: 'off' } });
 const [host, x, y] = people(a);
 runTo(a, 40);
 kill(a, x, host);
 assert.equal(x.respawnIn, Infinity);
 // (The death card's CHANGE WEAPON is hidden in FFA; the host API still takes it.)
 assert.equal(a.pickAgain(x.id), false);
 assert.equal(x.picking, null, 'no pick after the cutoff');
 assert.equal(a.choose(x.id, 'shotgun'), false, 'a pick sent anyway is refused (it used to throw on the host)');
 tick(a, 15);
 assert.ok(x.dead && x.present, 'still down');
 kill(a, y, host);
 tick(a, 10);
 assert.ok(y.dead, 'a later death stays down too');
 assert.equal(a.phase, 'playing', 'host and one more standing');
});

test('FFA: a pick already open when respawns close is shut, and its seat stays down', () => {
 const a = arena({ mode: 'ffa', humans: 3, settings: { robots: 'off' } });
 const [host, x] = people(a);
 runTo(a, 47);
 kill(a, x, host); a.pickAgain(x.id);
 assert.ok(x.picking, 'picking again while respawns are open');
 runTo(a, 44);
 assert.equal(x.picking, null); assert.ok(x.dead); assert.equal(x.respawnIn, Infinity);
});

test('FFA: robots stay down after the cutoff too', () => {
 const a = arena({ mode: 'ffa', humans: 2 });
 const [host] = people(a), [r1, r2] = bots(a);
 assert.ok(r1 && r2, 'robots fill FFA to four');
 runTo(a, 48);
 kill(a, r1, host);
 runTo(a, 30);
 kill(a, r2, host);
 tick(a, 15);
 assert.ok(r1.dead && r2.dead, 'neither robot came back');
 assert.equal(r1.respawnIn, Infinity);
});

test('FFA: a player joining after the cutoff watches (no pick, no spawn); a robot added late the same', () => {
 const a = arena({ mode: 'ffa', humans: 3, settings: { robots: 'off' } });
 runTo(a, 30);
 const late = a.addSeat('late', 'Late');
 assert.equal(late.picking, null, 'no weapon pick');
 assert.ok(late.present && late.dead, 'down as far as every screen is concerned');
 assert.equal(late.respawnIn, Infinity); assert.equal(late.life, 0, 'never in the world');
 const bot = a.addRobot();
 assert.ok(bot && bot.dead && !bot.picking, 'a robot added late does not come in either');
 tick(a, 10);
 assert.ok(late.dead && bot.dead);
 assert.equal(a.living(null).length, 3, 'only the three who were playing');
 // Before the cutoff a joiner picks as ever.
 const b = arena({ mode: 'ffa', humans: 2, settings: { robots: 'off' } });
 runTo(b, 120);
 assert.ok(b.addSeat('early', 'Early').picking);
});

test('FFA at the edge: the death card\'s forecast (from the wire clock) is what the host does, to the tenth of a second', () => {
 // A 6 s wait from 51.1 left ends at 45.1 (back in); from 51.0 at 45.0 (too late).
 for (const [at, fate, back] of [[51.2, 'open', true], [51.1, 'open', true], [51.0, 'late', false], [50.95, 'late', false]]) {
  const a = arena({ mode: 'ffa', humans: 3, settings: { robots: 'off', storm: 'off' } });
  const [host, x] = people(a);
  runTo(a, at + 1, 1 / 60); a.clock = at;
  kill(a, x, host);
  const wire = JSON.parse(JSON.stringify(a.matchState()));
  assert.equal(respawnFate(wire.mode, wire.left, x.respawnIn), fate, 'at ' + at);
  tick(a, 8, 1 / 60);
  assert.equal(!x.dead, back, 'at ' + at + (back ? ': back in' : ': stays down'));
 }
});

test('FFA: a seat that joined after the cutoff gets no time in game (it was never in the world)', () => {
 const a = arena({ mode: 'ffa', humans: 3, settings: { robots: 'off', storm: 'off' } });
 runTo(a, 40);
 const late = a.addSeat('late', 'Late');
 tick(a, 10);
 const row = a.scoreboard().find(r => r.id === 'late');
 assert.equal(row.time, 0); assert.equal(row.weapon, null, 'no "null" weapon on the board');
 assert.ok(people(a)[0].stats.time > 40, 'the others still count theirs');
 assert.ok(late.dead && late.present);
});

test('a pick sent from the bench is refused, not a crash on the host (choose without an open pick)', () => {
 const a = arena({ mode: '1v1', humans: 2, settings: { robots: 'off' } });
 const bench = a.addSeat('p9', 'Benched');
 assert.equal(bench.bench, true);
 assert.doesNotThrow(() => assert.equal(a.choose(bench.id, 'rifle'), false));
 assert.equal(a.pickAgain(bench.id), false);
 assert.equal(bench.picking, null);
});

test('FFA: one left standing after the cutoff ends the match at once, results as usual', () => {
 const a = arena({ mode: 'ffa', humans: 3, settings: { robots: 'off' } });
 const [host, x, y] = people(a);
 host.stats.kills = 1; y.stats.kills = 3;
 runTo(a, 50);
 kill(a, x, host);
 runTo(a, 44);
 assert.equal(a.phase, 'playing', 'two standing');
 kill(a, host, y);
 a.endTick(1 / 20);
 assert.equal(a.phase, 'results', 'the last one standing: over');
 assert.ok(a.clock > 40, 'long before the clock ran out');
 assert.equal(a.results.winner.id, y.id, 'most kills wins, as ever');
 assert.ok(a.worldEvents.some(e => e.type === 'matchEnd'));
 // Everyone down at once: over too.
 const b = arena({ mode: 'ffa', humans: 2, settings: { robots: 'off' } });
 runTo(b, 40);
 for (const s of people(b)) kill(b, s);
 b.endTick(1 / 20);
 assert.equal(b.phase, 'results');
 // Before the cutoff one standing plays on (respawns bring people back).
 const c = arena({ mode: 'ffa', humans: 3, settings: { robots: 'off' } });
 runTo(c, 100);
 const [c0, c1, c2] = people(c); kill(c, c1, c0); kill(c, c2, c0);
 c.endTick(1 / 20);
 assert.equal(c.phase, 'playing');
 // A host alone (nobody else in the match) keeps the clock.
 const alone = arena({ mode: 'ffa', humans: 1, settings: { robots: 'off' } });
 runTo(alone, 20);
 assert.equal(alone.phase, 'playing');
 tick(alone, 21);
 assert.equal(alone.phase, 'results');
});

test('FFA ended early with one left standing: a tie on kills goes to the survivor (a clock end keeps fewer deaths, then the name)', () => {
 const setup = () => {
  const a = arena({ mode: 'ffa', humans: 3, settings: { robots: 'off', storm: 'off' } });
  const [host, x, y] = people(a);
  return { a, host, x, y };
 };
 // Hosty and Player 1 on 2 kills each; Hosty has fewer deaths, so ranks first as ever.
 const score = ({ host, x, y }) => { Object.assign(host.stats, { kills: 2, deaths: 0 }); Object.assign(x.stats, { kills: 2, deaths: 3 }); Object.assign(y.stats, { kills: 1, deaths: 0 }); };
 const early = setup();
 runTo(early.a, 40);
 kill(early.a, early.y, early.x); kill(early.a, early.host, early.x);
 score(early);
 early.a.endTick(1 / 20);
 assert.equal(early.a.phase, 'results');
 assert.equal(early.a.results.winner.id, early.x.id, 'the one standing takes the tie');
 assert.equal(early.a.results.board[0].id, early.x.id);
 // The end card's table (it ranks its rows itself) heads with them too.
 const wire = JSON.parse(JSON.stringify(early.a.results));
 assert.equal(wire.survivor, early.x.id);
 assert.equal(sortStatsRows(wire.board, wire.survivor)[0].id, early.x.id);
 assert.equal(sortStatsRows(wire.board)[0].id, early.host.id, '(without it: fewer deaths first)');
 assert.match(statsTableHTML(wire.board, { mode: 'ffa', final: true, first: wire.survivor }), /stats-gold[^]*?Player 1/);
 // Not tied: most kills still wins, standing or not.
 const beaten = setup();
 runTo(beaten.a, 40);
 kill(beaten.a, beaten.y, beaten.x); kill(beaten.a, beaten.host, beaten.x);
 score(beaten); beaten.host.stats.kills = 3;
 beaten.a.endTick(1 / 20);
 assert.equal(beaten.a.results.winner.id, beaten.host.id);
 assert.equal(sortStatsRows(beaten.a.results.board, beaten.a.results.survivor)[0].id, beaten.host.id, 'not tied: the table as ever');
 // The clock running out with the same scores: fewer deaths, as before.
 const clock = setup();
 runTo(clock.a, 0.5);
 score(clock);
 tick(clock.a, 1);
 assert.equal(clock.a.phase, 'results');
 assert.equal(clock.a.results.winner.id, clock.host.id);
 assert.equal(clock.a.results.survivor, undefined, 'a clock end names nobody');
});

test('a new match after the results opens respawns again (the clock is reset before the picks)', () => {
 const a = arena({ mode: 'ffa', humans: 2, settings: { robots: 'off' } });
 runTo(a, 10);
 assert.equal(a.noRespawns, true);
 // A mid-match restart from late on: everyone picks, nobody is sat out.
 assert.ok(a.startRound('ffa'));
 assert.equal(a.noRespawns, false);
 for (const s of people(a)) assert.ok(s.picking && !s.dead, s.id);
});

test('round modes are unchanged: no clock, so the cutoff never comes; everyone still comes back each round', () => {
 for (const mode of ['2v2', '2v2v2', '3v3', '4v4', '1v1']) {
  const a = arena({ mode, settings: { rounds: 0 } });
  assert.equal(a.clock, Infinity, mode);
  tick(a, 900, 1);
  assert.equal(a.noRespawns, false, mode + ' after fifteen minutes');
  const state = JSON.parse(JSON.stringify(a.matchState()));
  assert.equal(state.timed, false); assert.equal(respawnsClosed(state.mode, state.timed ? state.left : Infinity), false);
  const seat = people(a)[0];
  kill(a, seat);
  assert.equal(seat.respawnIn, Infinity, 'down until the round is over, as before');
  const side = [...a.seats.values()].find(s => a.sideOf(s) !== a.sideOf(seat));
  playPoint(a, a.sideOf(side));
  assert.ok(seat.present && !seat.dead, mode + ': back for the next round');
  // A late joiner still takes a robot's seat and picks (never sat out).
  if (mode !== '1v1') assert.ok(a.addSeat('late-' + mode, 'Late').picking, mode);
 }
});

test('protocol 24: builds with and without the cutoff do not mix (nothing new on the wire, but the rules differ)', () => {
 assert.ok(PROTOCOL_VERSION >= 24);
});

test('joiners see the same thing: the host\'s clock and mode on the wire give the host\'s answer', () => {
 const a = arena({ mode: 'ffa', humans: 2, settings: { robots: 'off' } });
 for (const left of [300, 46, 45.2, 45, 44.9, 12]) {
  runTo(a, left);
  const wire = JSON.parse(JSON.stringify(a.matchState()));
  assert.equal(respawnsClosed(wire.mode, wire.left), a.noRespawns, 'at ' + left);
 }
});

test('the match clock: round modes show the round, not a red 0:00; FFA shows NO RESPAWNS once they close', () => {
 const round = clockView({ phase: 'playing', mode: '3v3', timed: false, left: 0, elimination: true, round: 3, sides: [{ id: 'red', name: 'AMBER', colour: '#ffb020', points: 2 }, { id: 'blue', name: 'CYAN', colour: '#2ee6ff', points: 0 }] });
 assert.doesNotMatch(round.html, /0:00/);
 assert.match(round.html, /<span class="clock-round">round 3<\/span><span class="clock-teams">/);
 assert.equal(round.low, false, 'never red'); assert.equal(round.shown, true); assert.equal(round.closed, false);
 const open = clockView({ phase: 'playing', mode: 'ffa', timed: true, left: 46 });
 assert.equal(open.html, '0:46'); assert.equal(open.closed, false);
 const shut = clockView({ phase: 'playing', mode: 'ffa', timed: true, left: 44.2 });
 assert.equal(shut.html, '0:45<span class="clock-note">no respawns</span>'); assert.equal(shut.closed, true);
 assert.equal(clockView({ phase: 'playing', mode: 'ffa', timed: true, left: 20 }).low, true);
 assert.equal(clockView({ phase: 'results', mode: 'ffa', timed: false, left: 80 }).html, 'results');
 assert.equal(clockView({ phase: 'lobby', mode: 'ffa', timed: false, left: 0 }).shown, false);
 assert.equal(clockView({ phase: 'playing', mode: 'practice', timed: false, left: 0 }).shown, false);
});

// BOTS FFA (duel.js): the same rule, your respawn in main.js, the robots' through bots.holdRespawns.
const el = () => ({ hidden: false, className: '', innerHTML: '', textContent: '', classList: { add() {}, remove() {}, contains: () => true, toggle() {} }, setAttribute() {}, append() {}, querySelector: () => el(), focus() {} });
function botsFfa(seed = 4) {
 const map = maps['hollow-wick'], sim = new Simulation(map), match = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(seed) });
 const score = el(), duel = createDuel(score, { sim, bots: match, random: seeded(seed + 1) });
 duel.begin({ mode: 'ffa', length: 300 });
 return { sim, match, duel, score };
}
const withDocument = fn => { const previous = globalThis.document; globalThis.document = { createElement: el }; try { return fn(); } finally { globalThis.document = previous; } };

test('BOTS FFA: robots down before the cutoff whose wait crosses it stay down; the score line says NO RESPAWNS', () => withDocument(() => {
 const { sim, match, duel } = botsFfa();
 const [a, b] = match.bots;
 const run = (seconds, dt = .1) => { for (let t = 0; t < seconds - 1e-9; t += dt) { duel.frame(dt, true); match.step(sim, dt); } };
 while (duel.left > 50.05) duel.frame(.5, true);
 assert.equal(duel.noRespawns, false); assert.equal(match.holdRespawns, false);
 // A robot down at 50 left (its FFA_RESPAWN would end at 44).
 a.sim.player.hp = 0; a.sim.player.dead = true;
 run(.1);
 assert.equal(a.alive, false); assert.equal(a.respawnIn, FFA_RESPAWN, 'the usual wait while respawns are open');
 run(10);
 assert.ok(duel.noRespawns, 'closed at 45 left'); assert.equal(match.holdRespawns, true);
 assert.equal(a.alive, false, 'never came back');
 assert.match(duel.scoreElement.innerHTML, /LEFT · <span class="duel-no-respawn">NO RESPAWNS<\/span>/);
 // A robot down after the cutoff: the same.
 b.sim.player.hp = 0; b.sim.player.dead = true;
 run(8);
 assert.equal(b.alive, false);
 assert.ok(!duel.over, 'you and three robots still standing');
 // A restart opens them again.
 const id = duel.matchId;
 duel.reset();
 assert.equal(duel.noRespawns, false); assert.equal(match.holdRespawns, false); assert.equal(duel.matchId, id + 1);
}));

test('BOTS FFA: ended early with you the one standing, a tie on kills is yours (the end card\'s table too); at the clock it stays a draw', () => withDocument(() => {
 const { sim, match, duel } = botsFfa(13);
 while (duel.left > 44.5) duel.frame(.5, true);
 match.youStats.kills = 2; match.bots[0].stats.kills = 2;
 for (const bot of match.bots) bot.alive = false;
 duel.frame(.1, true);
 assert.ok(duel.finalBreak); assert.equal(duel.score.winner, 'you');
 // The end card's table: you first (a robot has fewer deaths).
 match.bots[0].stats.deaths = 0; match.youStats.deaths = 3;
 assert.equal(duel.outcome.survivor, 'you');
 assert.equal(sortStatsRows(match.statsRows(sim), duel.outcome.survivor)[0].id, 'you');
 assert.equal(sortStatsRows(match.statsRows(sim))[0].id, match.bots[0].id, '(without it: fewer deaths first)');
 // A robot left standing on the same kills as you (you down): the robot's.
 const second = botsFfa(15);
 while (second.duel.left > 44.5) second.duel.frame(.5, true);
 second.match.youStats.kills = 2; second.match.bots[0].stats.kills = 2;
 second.match.bots.slice(1).forEach(bot => { bot.alive = false; });
 second.duel.frame(.1, false);
 assert.equal(second.duel.score.winner, 'robot');
 second.match.youStats.deaths = 0; second.match.bots[0].stats.deaths = 3;
 assert.equal(sortStatsRows(second.match.statsRows(second.sim), second.duel.outcome.survivor)[0].id, second.match.bots[0].id);
 // The clock running out on a tie: a draw, as before.
 const third = botsFfa(17);
 third.match.youStats.kills = 2; third.match.bots[0].stats.kills = 2;
 while (!third.duel.finalBreak) third.duel.frame(.5, true);
 assert.ok(third.duel.left <= 0); assert.equal(third.duel.score.winner, 'draw');
 assert.equal(third.duel.outcome.survivor, null, 'a clock end names nobody');
}));

test('BOTS FFA: one left standing after the cutoff ends the match (results as usual); before it, it plays on', () => withDocument(() => {
 const { match, duel } = botsFfa(9);
 while (duel.left > 60) duel.frame(.5, true);
 for (const bot of match.bots) bot.alive = false;
 duel.frame(.5, true);
 assert.ok(!duel.over && !duel.finalBreak, 'respawns still open: everyone comes back');
 while (duel.left > 44.5 && !duel.finalBreak) duel.frame(.5, true);
 assert.ok(duel.left > 44 && duel.left <= 45, 'at the cutoff, not the clock: ' + duel.left);
 assert.ok(duel.finalBreak, 'only you standing once respawns close: the end card is coming');
 assert.equal(duel.score.winner, 'draw', 'nobody has a kill: a draw, as at the clock');
 // You down and one robot up: over as well.
 const second = botsFfa(11);
 while (second.duel.left > 44 && !second.duel.finalBreak) second.duel.frame(.5, true);
 assert.ok(!second.duel.finalBreak, 'six standing');
 second.match.bots.slice(1).forEach(bot => { bot.alive = false; });
 second.duel.frame(.1, false);
 assert.ok(second.duel.finalBreak);
}));
