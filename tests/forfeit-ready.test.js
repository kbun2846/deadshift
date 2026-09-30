// FORFEIT and READY (owner, 2026-09-29), and 4V4:
// - FORFEIT in a round mode: 1V1 at once, a team mode when every human on the
//   side has voted (robots do not vote; pressing again takes the vote back);
//   the side that forfeited is last in the results.
// - READY on the end-of-match card: every human ready starts the next match
//   under the same settings; nobody deciding for READY_WAIT seconds: lobby.
// - 4V4: two sides of four, eight seats.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK } from '../src/config/network.js';
import { createLoopback } from '../src/net/transport.js';
import { HostSession } from '../src/net/host-session.js';
import { ClientSession } from '../src/net/client-session.js';
import { readMessage, PROTOCOL_VERSION } from '../src/net/protocol.js';
import { READY_WAIT } from '../src/net/arena.js';
import { PLAYER_COLOURS, playerColour } from '../src/remote-players.js';
import { arena, start, people, bots, tick, takePoint, playPoint, breakOf, map, createSim, seeded } from './rules-harness.js';

// Two humans on one side (red), the rest robots, playing `mode`.
function twoOnRed(mode = '2v2', settings = {}) {
 const a = arena({ humans: 2, settings });
 a.setMode(mode);
 assert.ok(a.chooseTeam('host', 'red') && a.chooseTeam('p1', 'red'));
 return start(a, mode);
}

test('protocol 20: forfeit and ready messages read {t, on}, on defaults to true, junk is dropped', () => {
 assert.ok(PROTOCOL_VERSION >= 20, 'forfeit and ready came in with 20 (21: the duel circle)');
 assert.deepEqual(readMessage({ t: 'forfeit' }), { t: 'forfeit', on: true });
 assert.deepEqual(readMessage({ t: 'forfeit', on: true }), { t: 'forfeit', on: true });
 assert.deepEqual(readMessage({ t: 'forfeit', on: false }), { t: 'forfeit', on: false });
 assert.deepEqual(readMessage({ t: 'ready' }), { t: 'ready', on: true });
 assert.deepEqual(readMessage({ t: 'ready', on: false }), { t: 'ready', on: false });
 assert.deepEqual(readMessage({ t: 'ready', on: 'nope', extra: 1 }), { t: 'ready', on: true }, 'only false unticks');
 for (const junk of [null, undefined, 5, 'forfeit', [], { t: 5 }, { on: true }, {}]) assert.equal(readMessage(junk), null, JSON.stringify(junk));
});

// --- FORFEIT ------------------------------------------------------------------

test('1V1 forfeit is immediate: the other player wins, the forfeiting side is last', () => {
 const a = arena({ mode: '1v1', settings: { rounds: 5 } });
 const [me] = people(a), [bot] = bots(a);
 playPoint(a, me.id);   // I am ahead 1-0 and still give up
 assert.deepEqual(a.forfeit('host'), { votes: 1, needed: 1 });
 assert.equal(a.forfeited, 'host'); assert.equal(a.decided, true);
 assert.equal(a.matchState().forfeit.host[0], 'host');
 a.endTick(1 / 20);
 assert.equal(a.phase, 'results');
 assert.equal(a.results.forfeit, 'host');
 assert.equal(a.results.winner.id, bot.id, 'the other player wins whatever the points');
 assert.equal(a.results.sides[a.results.sides.length - 1].id, 'host', 'the forfeiting side is ranked last');
 assert.ok(a.worldEvents.some(e => e.type === 'forfeit' && e.side === 'host'), 'a forfeit event goes out');
});

test('forfeit at 0-0 in 1V1: the winner has no points and still wins', () => {
 const a = arena({ mode: '1v1' });
 const [bot] = bots(a);
 a.forfeit('host'); a.endTick(1 / 20);
 assert.equal(a.phase, 'results'); assert.equal(a.results.winner.id, bot.id); assert.equal(a.results.winner.points, 0);
 assert.equal(a.results.draw, false);
});

test('a forfeit during a point break ends the match at once (no next round)', () => {
 const a = arena({ mode: '1v1', settings: { rounds: 10 } });
 takePoint(a, 'host'); assert.ok(a.roundBreak > 0);
 a.forfeit('host'); assert.equal(a.roundBreak, 0);
 a.endTick(1 / 20);
 assert.equal(a.phase, 'results'); assert.equal(a.round, 1, 'no new round was dealt');
});

test('2V2 with two humans on a side: both must vote; a vote can be taken back', () => {
 const a = twoOnRed();
 assert.deepEqual(a.forfeit('host'), { votes: 1, needed: 2 });
 assert.equal(a.decided, false); assert.equal(a.forfeited, null);
 assert.deepEqual(a.forfeitVotes(), { red: ['host'] }); assert.deepEqual(a.matchState().forfeit, { red: ['host'] });
 a.forfeit('host', false);
 assert.deepEqual(a.forfeitVotes(), {}); assert.equal(a.forfeit('p1').votes, 1, 'their vote alone is one of two');
 assert.equal(a.decided, false);
 a.forfeit('host');
 assert.equal(a.forfeited, 'red'); assert.equal(a.decided, true);
 // Once it went through, a vote cannot be taken back.
 assert.equal(a.forfeit('host', false), null); assert.equal(a.forfeited, 'red');
 tick(a, .2);
 assert.equal(a.phase, 'results'); assert.equal(a.results.forfeit, 'red');
 assert.equal(a.results.winner.team, 'blue');
 assert.equal(a.results.sides.at(-1).id, 'red');
});

test('a robot teammate never blocks a forfeit, and robots cannot vote', () => {
 const a = arena({ mode: '2v2' });
 const me = people(a)[0], mate = bots(a).find(s => s.team === me.team);
 assert.ok(mate, 'a robot on my side');
 assert.equal(a.forfeit(mate.id), null, 'robots do not vote');
 assert.deepEqual(a.forfeit('host'), { votes: 1, needed: 1 });
 assert.equal(a.forfeited, me.team);
 tick(a, .2);
 assert.equal(a.results.winner.team, me.team === 'red' ? 'blue' : 'red');
});

test('humans on opposite sides: each side votes for itself alone', () => {
 const a = arena({ humans: 2 });
 a.setMode('2v2'); a.chooseTeam('host', 'red'); a.chooseTeam('p1', 'blue'); start(a, '2v2');
 assert.deepEqual(a.forfeit('p1'), { votes: 1, needed: 1 });
 assert.equal(a.forfeited, 'blue');
 tick(a, .2);
 assert.equal(a.results.winner.team, 'red');
});

test('4V4 forfeit: all four humans of a side must vote, the robots need not', () => {
 const a = arena({ humans: 5 });
 a.setMode('4v4');
 ['host', 'p1', 'p2', 'p3'].forEach(id => assert.ok(a.chooseTeam(id, 'red')));
 a.chooseTeam('p4', 'blue');
 start(a, '4v4');
 for (const id of ['host', 'p1', 'p2']) { assert.equal(a.forfeit(id).needed, 4); assert.equal(a.decided, false); }
 a.forfeit('p3'); assert.equal(a.forfeited, 'red');
 assert.equal(bots(a).length, 3);
});

test('a forfeit after the match is decided (or outside a round mode, or in the results) is ignored', () => {
 const a = arena({ mode: '1v1', settings: { rounds: 3 } });
 playPoint(a, 'host'); takePoint(a, 'host');
 assert.equal(a.decided, true);
 assert.equal(a.forfeit('host'), null, 'decided: too late'); assert.equal(a.forfeited, null);
 tick(a, breakOf(a));
 assert.equal(a.phase, 'results'); assert.equal(a.results.winner.id, 'host', 'the winner is still the winner');
 assert.equal(a.forfeit('host'), null, 'not in the results'); assert.equal(a.results.forfeit, undefined);
 const ffa = arena({ mode: 'ffa' });
 assert.equal(ffa.forfeit('host'), null, 'FFA: not a round mode'); assert.equal(ffa.decided, false);
 const practice = arena({ mode: 'practice' });
 assert.equal(practice.forfeit('host'), null);
 const lobby = arena();
 assert.equal(lobby.forfeit('host'), null, 'not in the lobby');
 assert.equal(lobby.forfeit('nobody'), null, 'not a seat');
});

test('a forfeit vote survives a teammate leaving: the ones left who all voted go through', () => {
 const a = twoOnRed();
 a.forfeit('p1');
 assert.equal(a.decided, false);
 a.removeSeat('host');   // the one who had not voted goes
 assert.equal(a.forfeited, 'red', 'nobody left to wait for');
 a.endTick(1 / 20);
 assert.equal(a.phase, 'results');
 // A joiner mid-round is one more vote needed.
 const b = twoOnRed();
 b.forfeit('host');
 b.removeSeat('p1');
 assert.equal(b.decided, true, 'the only human left had voted');
 const c = twoOnRed();
 c.forfeit('host'); c.addSeat('late', 'Late');   // takes a robot's seat, maybe on red
 c.forfeit('p1');
 const late = c.seats.get('late');
 assert.equal(c.decided, late.team !== 'red', 'a joiner on red still has to vote');
});

test('3 sides: the forfeiting side is last, the others ranked by points', () => {
 const a = arena({ mode: '2v2v2', settings: { rounds: 10 } });
 const me = people(a)[0];
 playPoint(a, 'gold'); playPoint(a, me.team === 'gold' ? 'red' : 'gold');
 a.forfeit('host');
 a.endTick(1 / 20);
 assert.equal(a.results.sides.at(-1).id, me.team);
 assert.equal(a.results.forfeit, me.team);
 assert.equal(a.results.sides.length, 3);
});

// --- READY --------------------------------------------------------------------

// A 1V1 played to its end (2-0 of 3): the results card is up.
function finished(humans = 1, settings = {}, mode = '1v1') {
 const a = arena({ humans, settings: { rounds: 3, robots: humans > 1 ? 'off' : 'fill', ...settings } });
 start(a, mode);
 const side = a.sideOf(a.seats.get('host'));
 playPoint(a, side); takePoint(a, side); tick(a, breakOf(a));
 assert.equal(a.phase, 'results');
 return a;
}

test('READY: every human ready starts a new match of the same mode at once; robots do not need to be', () => {
 const a = finished();
 assert.ok(a.matchState().left > READY_WAIT - 1 && a.matchState().left <= READY_WAIT); assert.deepEqual(a.matchState().ready, []);
 const number = a.matchNumber;
 assert.equal(a.setReady('bot-1'), false, 'robots do not ready up');
 tick(a, 5); assert.equal(a.phase, 'results', 'robots being ready by default is not a start');
 assert.equal(a.setReady('host'), true);
 assert.deepEqual(a.matchState().ready, ['host']);
 tick(a, 1 / 20);
 assert.equal(a.phase, 'playing'); assert.equal(a.mode, '1v1'); assert.equal(a.matchNumber, number + 1);
 assert.equal(a.settings.rounds, 3, 'same settings');
 assert.equal(a.points.size, 0); assert.equal(a.played, 0); assert.equal(a.decided, false); assert.equal(a.round, 1);
 assert.deepEqual(a.matchState().sides.map(s => s.points), [0, 0], 'scores reset');
 assert.equal(a.results, null); assert.equal(a.clock, Infinity);
 assert.ok(people(a).every(s => s.picking), 'everyone picks a weapon first');
 assert.equal(a.matchState().ready, undefined);
 assert.ok(a.worldEvents.some(e => e.type === 'matchStart' && e.number === number + 1), 'a matchStart event goes out');
});

test('READY: one human not ready keeps the results up; taking it back works', () => {
 const a = finished(2, {}, '1v1');
 assert.equal(people(a).length, 2);
 a.setReady('host'); tick(a, 10);
 assert.equal(a.phase, 'results', 'p1 has not pressed READY');
 a.setReady('host', false); a.setReady('p1');
 tick(a, 2); assert.equal(a.phase, 'results');
 assert.deepEqual(a.matchState().ready, ['p1']);
 a.setReady('host');
 tick(a, .1);
 assert.equal(a.phase, 'playing'); assert.equal(a.matchNumber, 2);
});

test('READY: a player who leaves while the others are ready lets the next match start', () => {
 const a = finished(2, { robots: 'fill' }, '2v2');
 assert.equal(a.phase, 'results');
 a.setReady('host'); tick(a, 1); assert.equal(a.phase, 'results');
 a.removeSeat('p1');
 tick(a, .2);
 assert.equal(a.phase, 'playing', 'nobody left to wait for');
 assert.equal(a.matchNumber, 2);
});

test('READY: nobody deciding for READY_WAIT seconds sends everyone to the lobby', () => {
 const a = finished(1, {}, '1v1');
 tick(a, READY_WAIT - 2, 1); assert.equal(a.phase, 'results');
 assert.ok(a.matchState().left < 3);
 tick(a, 3, 1);
 assert.equal(a.phase, 'lobby'); assert.equal(a.results, null);
 assert.ok(people(a).every(s => !s.present), 'everyone out of the world');
 assert.equal(bots(a).length, 0, 'the robots that filled the match go');
});

test('READY: refused outside the results card', () => {
 const a = arena();
 assert.equal(a.setReady('host'), false, 'lobby');
 start(a, '1v1');
 assert.equal(a.setReady('host'), false, 'playing');
 assert.equal(a.setReady('nobody'), false, 'not a seat');
 takePoint(a, 'host'); assert.equal(a.setReady('host'), false, 'between rounds');
 tick(a, .1); assert.ok(a.matchState().ready === undefined);
});

test('READY in FFA restarts FFA; a start that cannot happen (a seat left with robots off) falls back to the lobby', () => {
 const ffa = arena({ mode: 'ffa', settings: { roundLength: 300 } });
 tick(ffa, 302, 1); assert.equal(ffa.phase, 'results');
 ffa.setReady('host'); tick(ffa, .1);
 assert.equal(ffa.phase, 'playing'); assert.equal(ffa.mode, 'ffa'); assert.equal(ffa.matchState().timed, true);
 assert.ok(ffa.matchState().left > 298);
 const a = finished(2, { robots: 'off' }, '1v1');
 a.setReady('host'); a.removeSeat('p1');   // robots are off: a 1V1 with one player cannot start
 tick(a, .2);
 assert.equal(a.phase, 'lobby');
 assert.ok(a.startError);
});

// --- 4V4 ----------------------------------------------------------------------

test('4V4 starts with robots filling to eight seats, four a side', () => {
 const a = arena({ mode: '4v4' });
 assert.equal(a.seats.size, 8); assert.equal(bots(a).length, 7);
 const sides = a.matchState().sides;
 assert.equal(sides.length, 2);
 for (const id of ['red', 'blue']) assert.equal([...a.seats.values()].filter(s => s.team === id).length, 4, id);
 assert.ok([...a.seats.values()].every(s => s.present), 'all eight spawned');
 assert.equal(a.matchState().timed, false);
 // Everyone in the world is apart from everyone else.
 const ps = [...a.seats.values()].map(s => s.sim.player);
 assert.equal(new Set(ps.map(p => Math.round(p.x) + ',' + Math.round(p.z))).size, 8, 'eight different places');
});

test('4V4: addRobot allows up to eight seats, then refuses; with robots off it needs all eight', () => {
 const a = arena({ humans: 1, settings: { robots: 'off' } });
 for (let i = 0; i < 7; i++) assert.ok(a.addRobot(), 'robot ' + (i + 1));
 assert.equal(a.seats.size, 8); assert.equal(a.addRobot(), null, 'a ninth seat is refused');
 assert.ok(a.startRound('4v4'), a.startError); assert.equal(a.seats.size, 8);
 const b = arena({ humans: 1, settings: { robots: 'off' } });
 for (let i = 0; i < 5; i++) b.addRobot();
 assert.equal(b.startRound('4v4'), false); assert.match(b.startError, /4V4 needs 8 players/);
});

test('4V4 with eight humans has no robots; a ninth is refused; players pick sides of at most four', () => {
 const a = arena({ humans: 8 });
 a.setMode('4v4');
 for (let i = 0; i < 4; i++) assert.ok(a.chooseTeam(i ? 'p' + i : 'host', 'red'));
 assert.equal(a.chooseTeam('p4', 'red'), false, 'a full side refuses');
 assert.ok(a.startRound('4v4'), a.startError);
 assert.equal(bots(a).length, 0);
 for (const id of ['red', 'blue']) assert.equal([...a.seats.values()].filter(s => s.team === id).length, 4);
 const nine = arena({ humans: 9 });
 assert.equal(nine.startRound('4v4'), false); assert.match(nine.startError, /4V4 is for 8 players/);
});

test('4V4: a joiner takes a robot\'s seat and side; a leaver is replaced by a robot on their side', () => {
 const a = arena({ mode: '4v4' });
 a.addSeat('late', 'Late');
 assert.equal(a.seats.size, 8); assert.equal(bots(a).length, 6);
 for (const id of ['red', 'blue']) assert.equal([...a.seats.values()].filter(s => s.team === id).length, 4, id + ' after the joiner');
 const side = a.seats.get('late').team;
 a.removeSeat('late');
 assert.equal(a.seats.size, 8); assert.equal(bots(a).length, 7);
 assert.equal([...a.seats.values()].filter(s => s.team === side).length, 4, 'the robot took the side');
 // With eight humans in, a ninth joiner sits out on the bench, and is not a forfeit voter.
 const full = arena({ humans: 8 }); full.startRound('4v4');
 full.addSeat('spare', 'Spare');
 assert.equal(full.seats.get('spare').bench, true);
 assert.equal(full.forfeit('spare'), null);
});

test('4V4 over the network: the room takes eight players and turns the ninth away', () => {
 assert.equal(NETWORK.maxPlayers, 8);
 const net = createLoopback(), hostSim = createSim(map); let time = 0;
 const host = new HostSession({ transport: net.host('ABCDE'), map, local: hostSim, createSim, now: () => time, name: 'Hosty', random: seeded(3) });
 assert.ok(host.startRound('4v4')); assert.equal(host.arena.seats.size, 8);
 const joined = [];
 for (let i = 0; i < 7; i++) { const sim = createSim(map); joined.push(new ClientSession({ transport: net.join('ABCDE'), map, local: sim, createSim, now: () => time, name: 'P' + i })); }
 net.flush();
 assert.equal(host.playerCount, 8); assert.equal(host.arena.seats.size, 8);
 assert.equal([...host.arena.seats.values()].filter(s => s.robot).length, 0, 'the robots made room');
 for (const id of ['red', 'blue']) assert.equal([...host.arena.seats.values()].filter(s => s.team === id).length, 4);
 const ninth = new ClientSession({ transport: net.join('ABCDE'), map, local: createSim(map), createSim, now: () => time, name: 'Late' });
 net.flush();
 assert.match(ninth.ended, /full/); assert.equal(host.playerCount, 8);
 // + ROBOT in a lobby of eight is refused too.
 host.endRound(); assert.equal(host.addRobot(), null);
});

test('over the wire: a joiner\'s FORFEIT and READY reach the arena; the host\'s own methods too', () => {
 const net = createLoopback(); let time = 0;
 const host = new HostSession({ transport: net.host('ABCDE'), map, local: createSim(map), createSim, now: () => time, name: 'Hosty', random: seeded(3), settings: { rounds: 3 } });
 const sim = createSim(map), client = new ClientSession({ transport: net.join('ABCDE'), map, local: sim, createSim, now: () => time, name: 'Joe' });
 net.flush();
 assert.ok(host.startRound('1v1')); net.flush();
 const arena = host.arena, joe = [...arena.seats.values()].find(s => s.name === 'Joe');
 client.forfeit(); net.flush();
 assert.equal(arena.forfeited, joe.id, '1V1: the joiner forfeits at once');
 for (let i = 0; i < 3; i++) { time += 1 / 60; host.step(); net.flush(); }
 assert.equal(host.match().phase, 'results');
 assert.equal(client.match().results.forfeit, joe.id, 'the joiner sees who forfeited');
 client.setReady(); net.flush();
 assert.deepEqual(host.match().ready, [joe.id]);
 for (let i = 0; i < 3; i++) { time += 1 / 60; host.step(); net.flush(); }
 assert.equal(host.match().phase, 'results', 'the host is not ready');
 client.setReady(false); net.flush(); assert.deepEqual(host.match().ready, []);
 client.setReady(); host.setReady(); net.flush();
 for (let i = 0; i < 3; i++) { time += 1 / 60; host.step(); net.flush(); }
 assert.equal(host.match().phase, 'playing'); assert.equal(host.match().number, 2);
 assert.deepEqual(host.forfeit(), { votes: 1, needed: 1 }, 'the host forfeits by method too');
});

test('eight players, eight colours: apart from each other and from the side colours; slots still wrap', () => {
 assert.ok(PLAYER_COLOURS.length >= 8, 'a colourway for each of the eight seats');
 const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)), gap = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
 const swatches = PLAYER_COLOURS.map(p => p.swatch);
 for (let i = 0; i < swatches.length; i++) for (let j = i + 1; j < swatches.length; j++) assert.ok(gap(swatches[i], swatches[j]) > 50, `swatch ${i} and ${j} are apart`);
 for (const team of ['#ffb020', '#2ee6ff', '#b77bff', '#6cff3c']) for (const [i, swatch] of swatches.slice(6).entries()) assert.ok(gap(swatch, team) > 80, `colour ${i + 7} is not the side colour ${team}`);
 for (const p of PLAYER_COLOURS) for (const key of ['coat', 'arm', 'band', 'collar', 'ring', 'swatch']) assert.match(p[key], /^#[0-9a-f]{6}$/i);
 assert.equal(playerColour(0), PLAYER_COLOURS[0]); assert.equal(playerColour(7), PLAYER_COLOURS[7]);
 assert.equal(playerColour(PLAYER_COLOURS.length), PLAYER_COLOURS[0], 'wraps'); assert.equal(playerColour(-1), PLAYER_COLOURS.at(-1));
});
