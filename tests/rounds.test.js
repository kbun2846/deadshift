// Rounds (owner, 2026-09-29: "3 rounds, whoever has most wins"): the
// roundsDecided rule, and the arena playing it: no match clock in the round
// modes, the deciding point still gets its break before the card, draws count
// as played, sudden death after a tie, endless never ends; FFA keeps its
// clock and its (now six second) respawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { roundsDecided, MODES, ROUNDED, COUNTED, SETTINGS, PLAIN_SETTINGS, MAX_SEATS, cleanSettings, defaultSettings } from '../src/config/match.js';
import { DUEL_BREAK, ROUND_BREAK, MATCH } from '../src/net/arena.js';
import { arena, start, people, bots, tick, takePoint, playPoint, breakOf } from './rules-harness.js';

test('roundsDecided: over when the leader leads by more than the rounds left, or every round is played and someone leads', () => {
 const table = [
  // wins, played, total, decided, why
  [[2, 0], 2, 3, true, '3 rounds, 2-0 after 2'],
  [[1, 1], 2, 3, false, '3 rounds, 1-1 after 2: one to play'],
  [[1, 0], 1, 3, false, '3 rounds, 1-0 after 1'],
  [[2, 1], 3, 3, true, '3 rounds, 2-1 after 3'],
  [[1, 1], 3, 3, false, '3 rounds, 1-1 after 3 with a draw round: sudden death plays on'],
  [[2, 2], 4, 3, false, 'still level in sudden death'],
  [[2, 1], 4, 3, true, 'sudden death: the first to lead wins'],
  [[3, 0], 3, 5, true, '5 rounds, 3-0 after 3'],
  [[2, 0], 2, 5, false, '5 rounds, 2-0 after 2: can still be caught'],
  [[3, 2], 5, 5, true, '5 rounds, 3-2 after 5'],
  [[3, 2], 4, 5, false, '5 rounds, 3-2 after 4 (one left, the trailer could level)'],
  [[3, 1], 4, 5, true, '5 rounds, 3-1 after 4 (one left, a two-point lead)'],
  [[6, 0], 6, 10, true, '10 rounds, 6-0 after 6'],
  [[5, 0], 5, 10, false, '10 rounds, 5-0 after 5: five left'],
  [[0, 0], 1, 3, false, 'a draw round decides nothing'],
  [[0, 0], 3, 3, false, 'nobody scored: level, plays on'],
  [[1000, 0], 1000, 0, false, 'endless (0) never ends'],
  [[0, 0], 0, 0, false, 'endless, nothing played'],
  [[2, 0, 0], 2, 3, true, '2V2V2, 3 rounds, 2-0-0 after 2'],
  [[1, 1, 0], 2, 3, false, '2V2V2: two sides level on top'],
  [[1, 1, 1], 3, 3, false, '2V2V2: all three level after 3: plays on'],
  [[2, 1, 0], 3, 3, true, '2V2V2: 2-1-0 after all three'],
  [[2, 1, 0], 2, 3, false, '2V2V2: 2-1-0 after 2 (one round left, second could level)'],
  [[3, 1, 1], 4, 5, true, '2V2V2, 5 rounds, 3-1-1 after 4'],
  [[1, 2, 0], 3, 3, true, 'the order of the list does not matter'],
 ];
 for (const [wins, played, total, want, why] of table) assert.equal(roundsDecided(wins, played, total), want, why);
});

test('the modes and settings the rounds are built on', () => {
 const four = MODES.find(m => m.id === '4v4');
 assert.deepEqual([four.teams, four.per, four.size, four.fillTo, four.ready], [2, 4, 8, 8, true]);
 assert.equal(MAX_SEATS, 8);
 assert.deepEqual(ROUNDED, ['1v1', '2v2', '2v2v2', '3v3', '4v4']);
 assert.ok(!ROUNDED.includes('ffa') && !ROUNDED.includes('practice') && COUNTED.includes('ffa'));
 assert.deepEqual(SETTINGS.rounds.values, [3, 5, 10, 0]); assert.equal(SETTINGS.rounds.default, 5); assert.deepEqual(SETTINGS.rounds.modes, ROUNDED);
 assert.equal(SETTINGS.rounds.names[3], '∞', 'endless is the infinity sign');
 assert.deepEqual(SETTINGS.roundLength.values, [300, 600]); assert.equal(SETTINGS.roundLength.default, 600); assert.deepEqual(SETTINGS.roundLength.modes, ['ffa']);
 assert.deepEqual(PLAIN_SETTINGS, ['rounds', 'roundLength', 'robots'], 'rounds, the FFA match length and the robots ON/OFF switch show without the developer tools');
 assert.deepEqual([SETTINGS.robots.values, SETTINGS.robots.names, SETTINGS.robots.default], [['fill', 'off'], ['ON', 'OFF'], 'fill'], 'robots fill the seats unless the host turns them OFF');
 assert.ok(!SETTINGS.rounds.dev && !SETTINGS.roundLength.dev);
 assert.deepEqual([SETTINGS.killLimit.default, SETTINGS.killLimit.dev, SETTINGS.killLimit.modes], [0, true, ['ffa']], 'a kill limit is FFA only, and off');
 assert.deepEqual([SETTINGS.respawn.default, SETTINGS.respawn.values, SETTINGS.respawn.modes], [6, [6, 8, 12, 16], ['ffa']]);
 for (const key of Object.keys(SETTINGS)) if (!PLAIN_SETTINGS.includes(key)) assert.equal(SETTINGS[key].dev, true, key + ' is a developer setting');
 assert.equal(cleanSettings({ rounds: 7 }).rounds, 5, 'a value not in the list falls back'); assert.equal(cleanSettings({ rounds: 0 }).rounds, 0);
 assert.equal(cleanSettings({ roundLength: 123 }).roundLength, 600);
 assert.deepEqual(cleanSettings(), defaultSettings());
});

test('1V1 over 3 rounds: 2-0 ends only after the deciding point\'s break, and the card is not up before it', () => {
 const a = arena({ mode: '1v1', settings: { rounds: 3 } });
 const [me] = people(a), [bot] = bots(a);
 assert.equal(a.settings.rounds, 3); assert.equal(a.matchState().rounds, 3);
 takePoint(a, me.id);
 assert.equal(a.points.get(me.id), 1); assert.equal(a.matchState().played, 1); assert.equal(a.decided, false);
 assert.ok(a.roundBreak > DUEL_BREAK - .1, 'a 1V1 break is ' + DUEL_BREAK + ' s');
 tick(a, breakOf(a));
 assert.equal(a.matchState().round, 2); assert.ok(me.present && !me.dead && bot.present && !bot.dead, 'both back');
 takePoint(a, me.id);
 assert.equal(a.matchState().played, 2); assert.equal(a.decided, true, 'nobody can catch up');
 assert.equal(a.phase, 'playing'); assert.equal(a.matchState().results, null);
 // Right up to the end of the break: still no card.
 tick(a, DUEL_BREAK - .5);
 assert.equal(a.phase, 'playing', 'the deciding point still gets its break');
 assert.equal(a.matchState().results, null); assert.ok(bot.dead, 'the fall is still on show');
 tick(a, .7);
 assert.equal(a.phase, 'results');
 assert.equal(a.results.winner.id, me.id); assert.equal(a.results.winner.points, 2);
 assert.equal(a.results.sides[0].id, me.id); assert.equal(a.results.sides[1].points, 0);
 assert.equal(a.matchState().round, 2, 'no third round was dealt');
 assert.equal(a.results.forfeit, undefined);
});

test('a draw round is played but scores nothing; 1-1 after three plays on (sudden death) until someone leads', () => {
 const a = arena({ mode: '1v1', settings: { rounds: 3 } });
 const [me] = people(a), [bot] = bots(a);
 playPoint(a, me.id);
 playPoint(a, null);
 let state = a.matchState();
 assert.equal(state.played, 2, 'a draw counts as played'); assert.deepEqual(state.sides.map(s => s.points).sort(), [0, 1]);
 assert.equal(state.roundWinner, null); assert.equal(a.phase, 'playing');
 assert.equal(state.round, 3);
 playPoint(a, bot.id);
 state = a.matchState();
 assert.equal(state.played, 3); assert.deepEqual(state.sides.map(s => s.points), [1, 1]);
 assert.equal(a.phase, 'playing', 'level after the last round: it plays on'); assert.equal(a.decided, false);
 playPoint(a, null);
 assert.equal(a.phase, 'playing', 'a drawn sudden-death round changes nothing'); assert.equal(a.matchState().played, 4);
 takePoint(a, bot.id);
 assert.equal(a.decided, true); assert.equal(a.matchState().played, 5);
 tick(a, breakOf(a));
 assert.equal(a.phase, 'results'); assert.equal(a.results.winner.id, bot.id);
});

test('a draw round is a round played: it uses one up, so a lead can become uncatchable with it', () => {
 const a = arena({ mode: '1v1', settings: { rounds: 3 } });
 const [me] = people(a);
 playPoint(a, me.id);
 playPoint(a, me.id);
 assert.equal(a.phase, 'results');
 const b = arena({ mode: '1v1', settings: { rounds: 5 } });
 const [you] = people(b);
 playPoint(b, you.id); playPoint(b, you.id); playPoint(b, null);
 assert.equal(b.phase, 'playing', '2-0 with a draw after 3 of 5: two left, not over');
 playPoint(b, you.id);
 assert.equal(b.phase, 'results', '3-0 after 4 of 5 (one left): over');
});

test('5 rounds: 3-0 ends it; 10 rounds: not before 6; endless (0) never ends', () => {
 const five = arena({ mode: '2v2', settings: { rounds: 5 } });
 for (let i = 0; i < 2; i++) playPoint(five, 'red');
 assert.equal(five.phase, 'playing');
 takePoint(five, 'red'); assert.equal(five.decided, true); tick(five, breakOf(five));
 assert.equal(five.phase, 'results'); assert.equal(five.results.winner.team, 'red'); assert.equal(five.results.winner.points, 3);
 const ten = arena({ mode: '2v2', settings: { rounds: 10 } });
 for (let i = 0; i < 5; i++) playPoint(ten, 'blue');
 assert.equal(ten.phase, 'playing', '5-0 with five to play');
 takePoint(ten, 'blue'); assert.equal(ten.decided, true);
 const endless = arena({ mode: '2v2', settings: { rounds: 0 } });
 for (let i = 0; i < 12; i++) playPoint(endless, i % 3 ? 'red' : 'blue');
 assert.equal(endless.phase, 'playing'); assert.equal(endless.decided, false); assert.equal(endless.matchState().played, 12);
 assert.equal(endless.matchState().rounds, 0);
});

test('2V2V2: three sides, decided by the leader against the second best', () => {
 const a = arena({ mode: '2v2v2', settings: { rounds: 3 } });
 assert.equal(a.matchState().sides.length, 3);
 playPoint(a, 'red'); playPoint(a, 'blue');
 assert.equal(a.phase, 'playing', '1-1-0 after two');
 playPoint(a, 'gold');
 assert.equal(a.phase, 'playing', '1-1-1 after three: plays on'); assert.equal(a.matchState().played, 3);
 takePoint(a, 'gold'); assert.equal(a.decided, true);
 tick(a, breakOf(a));
 assert.equal(a.phase, 'results'); assert.equal(a.results.winner.team, 'gold'); assert.equal(a.results.winner.points, 2);
 const b = arena({ mode: '2v2v2', settings: { rounds: 3 } });
 playPoint(b, 'red'); takePoint(b, 'red');
 assert.equal(b.decided, true, '2-0-0 after two of three');
});

test('round modes have no match clock: it never times out, `timed` is false and `left` stays 0', () => {
 for (const mode of ['1v1', '2v2', '4v4']) {
  const a = arena({ mode, settings: { rounds: 0 } });
  assert.equal(a.clock, Infinity, mode);
  const state = a.matchState();
  assert.equal(state.timed, false); assert.equal(state.left, 0); assert.equal(state.killLimit, 0);
  tick(a, 900, 1);
  assert.equal(a.phase, 'playing', mode + ' is still going after fifteen minutes');
  assert.equal(a.matchState().left, 0);
 }
});

test('a kill limit does not end a round mode (it is FFA only)', () => {
 const a = arena({ mode: '2v2', settings: { rounds: 3, killLimit: 10 } });
 const red = [...a.seats.values()].find(s => s.team === 'red');
 red.stats.kills = 30; a.teamKills.set('red', 30);
 tick(a, 2);
 assert.equal(a.phase, 'playing'); assert.equal(a.matchState().killLimit, 0);
});

test('FFA still runs on its clock: 5 or 10 minutes, then the results; a kill limit only when set', () => {
 assert.equal(MATCH.length, 600);
 const long = arena({ mode: 'ffa' });
 const state = long.matchState();
 assert.equal(state.timed, true); assert.ok(state.left > 599 && state.left <= 600); assert.equal(state.killLimit, 0);
 assert.equal(state.elimination, undefined, 'FFA is not played in rounds');
 tick(long, 590, 1);
 assert.equal(long.phase, 'playing');
 tick(long, 12, 1);
 assert.equal(long.phase, 'results', 'ten minutes');
 const short = arena({ mode: 'ffa', settings: { roundLength: 300 } });
 tick(short, 290, 1); assert.equal(short.phase, 'playing');
 tick(short, 12, 1); assert.equal(short.phase, 'results', 'five minutes');
 // No kill limit by default: forty kills change nothing.
 const none = arena({ mode: 'ffa' });
 const [host] = people(none); host.stats.kills = 40; tick(none, 2);
 assert.equal(none.phase, 'playing');
 // Set (a developer setting), it ends the match at the limit.
 const limited = arena({ mode: 'ffa', settings: { killLimit: 10 } });
 people(limited)[0].stats.kills = 10; tick(limited, 1);
 assert.equal(limited.phase, 'results'); assert.equal(limited.results.winner.kills, 10);
});

test('FFA respawn wait is 6 s by default, and the round modes never respawn on their own', () => {
 const a = arena({ mode: 'ffa', humans: 2 });
 const [me, other] = people(a);
 other.sim.player.hp = 0; a.died(other, me);
 assert.equal(other.respawnIn, 6); assert.equal(MATCH.respawn, 6);
 tick(a, 5); assert.ok(other.dead, 'still down at five seconds');
 tick(a, 1.5); assert.ok(!other.dead && other.present, 'back after six');
 const slow = arena({ mode: 'ffa', humans: 2, settings: { respawn: 12 } });
 const [x, y] = people(slow); y.sim.player.hp = 0; slow.died(y, x);
 assert.equal(y.respawnIn, 12);
 const team = arena({ mode: '2v2' });
 const t = people(team)[0]; t.sim.player.hp = 0; team.died(t, null);
 assert.equal(t.respawnIn, Infinity); tick(team, 30); assert.ok(t.dead, 'a team round waits for the point');
});

test('a point cannot start a new round once the match is decided (newPoint is not reached)', () => {
 const a = arena({ mode: '2v2', settings: { rounds: 3 } });
 playPoint(a, 'red'); takePoint(a, 'red');
 assert.equal(a.decided, true);
 const round = a.matchState().round;
 tick(a, breakOf(a) + 1);
 assert.equal(a.phase, 'results'); assert.equal(a.round, round);
 // (a fall during the deciding break counts for nothing more)
 const b = arena({ mode: '2v2', settings: { rounds: 3 } });
 playPoint(b, 'red'); takePoint(b, 'red');
 const played = b.played; tick(b, 1);
 for (const s of b.seats.values()) if (s.team === 'red' && !s.dead) { s.sim.player.hp = 0; b.died(s, null); }
 tick(b, 1);
 assert.equal(b.played, played, 'no extra round while the break runs'); assert.equal(b.points.get('red'), 2);
});

test('a joiner mid-match sees the rules in the match state; 4V4 too', () => {
 const a = arena({ mode: '4v4', settings: { rounds: 5 } });
 a.addSeat('late', 'Late');
 const state = a.matchState();
 assert.deepEqual([state.rounds, state.played, state.timed, state.elimination, state.round], [5, 0, false, true, 1]);
 assert.deepEqual(state.forfeit, {});
 assert.equal(JSON.parse(JSON.stringify(state)).timed, false, 'it survives the wire');
 assert.equal(a.seats.size, 8);
 assert.ok(a.seats.get('late').picking, 'took a robot\'s seat and picks a weapon');
});
