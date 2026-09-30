// Task B (competitive overhaul, 2026-09-29): the end-of-match card
// (ui/match-end.js), its title lines, and the online READY / FORFEIT flow it
// drives (net/arena.js through HostSession).
import test from 'node:test';
import assert from 'node:assert/strict';
import { maps } from '../src/maps.js';
import { Simulation } from '../src/simulation.js';
import { createLoopback } from '../src/net/transport.js';
import { HostSession } from '../src/net/host-session.js';
import { onlineOutcome, soloOutcome, readyLabel } from '../src/ui/match-end.js';

const map = maps.deadwater, createSim = m => new Simulation(m);
const seeded = seed => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };
const plain = html => html.replace(/<[^>]+>/g, '');

test('the title says who won, as you see it', () => {
 const sides = [{ id: 'blue', team: true, name: 'CYAN', points: 3 }, { id: 'red', team: true, name: 'AMBER', points: 1 }];
 assert.equal(onlineOutcome({ winner: { team: 'blue', name: 'CYAN TEAM', points: 3 }, sides }, { myTeam: 'blue' }).title, 'your team wins');
 const theirs = onlineOutcome({ winner: { team: 'blue', name: 'CYAN TEAM', points: 3 }, sides }, { myTeam: 'red' });
 assert.equal(plain(theirs.title), 'cyan team wins'); assert.match(theirs.title, /color:#2ee6ff/, 'a side in its own colour');
 assert.equal(plain(theirs.detail), 'cyan 3 · amber 1');
 const duelSides = [{ id: 'host', team: false, name: 'Hosty', points: 2 }, { id: 'p1', team: false, name: 'Sam', points: 0 }];
 assert.equal(onlineOutcome({ winner: { id: 'host', name: 'Hosty' }, sides: duelSides }, { myId: 'host' }).title, 'you win');
 assert.equal(onlineOutcome({ winner: { id: 'host', name: 'Hosty' }, sides: duelSides }, { myId: 'p1' }).title, 'Hosty wins');
 assert.equal(onlineOutcome({ winner: null, draw: true, sides: duelSides }, { myId: 'p1' }).title, 'draw');
 assert.equal(onlineOutcome({ winner: { id: 'x', name: '<b>' }, board: [] }, {}).title, '&lt;b&gt; wins', 'names are escaped');
 // FORFEIT reads as such.
 assert.match(plain(onlineOutcome({ winner: { id: 'host', name: 'Hosty' }, sides: duelSides, forfeit: 'p1' }, { myId: 'p1' }).detail), /you forfeited$/);
 assert.match(plain(onlineOutcome({ winner: { team: 'blue', name: 'CYAN TEAM' }, sides, forfeit: 'red' }, { myTeam: 'blue' }).detail), /amber team forfeited$/);
 // SOLO.
 assert.equal(soloOutcome({ winner: 'you', you: 2, robot: 1 }).title, 'you win');
 assert.equal(soloOutcome({ winner: 'robot', team: true }).title, 'enemies win');
 assert.equal(plain(soloOutcome({ winner: 'robot', you: 0, robot: 0, forfeited: true }).detail), 'you 0 · 0 robot · you forfeited');
 assert.equal(readyLabel(1, 3), 'READY 1/3'); assert.equal(readyLabel(0, 1), 'READY');
});

function room(settings = { robots: 'off' }) {
 const net = createLoopback(); let time = 0;
 const host = new HostSession({ transport: net.host('ABCDE'), map, local: createSim(map), createSim, now: () => time, name: 'Hosty', random: seeded(3), settings });
 net.flush();
 return { host, net };
}

test('online 1V1: FORFEIT ends it at once for the other player; READY starts the next match (robots never hold it up)', () => {
 const { host } = room({ robots: 'off', rounds: 3 });
 host.addRobot();
 assert.ok(host.startRound('1v1'));
 host.choose('rifle');
 const arena = host.arena;
 for (let i = 0; i < 5; i++) arena.endTick();
 assert.ok(arena.forfeit('host', true));
 for (let i = 0; i < 3; i++) arena.endTick();
 const m = arena.matchState();
 assert.equal(m.phase, 'results'); assert.equal(m.results.forfeit, 'host');
 const seen = onlineOutcome(m.results, { myId: 'host' });
 assert.notEqual(seen.title, 'you win'); assert.match(plain(seen.detail), /you forfeited/);
 assert.deepEqual(m.ready, []);
 // The card's READY: the only person in the room, so the next match starts.
 assert.ok(arena.setReady('host', true));
 arena.endTick();
 assert.equal(arena.matchState().phase, 'playing', 'a new match, same settings');
 assert.equal(arena.matchState().mode, '1v1');
});

test('online team modes: FORFEIT votes are counted per side (alone with robots: yours decides)', () => {
 const net = createLoopback(); let time = 0;
 const host = new HostSession({ transport: net.host('ABCDE'), map, local: createSim(map), createSim, now: () => time, name: 'Hosty', random: seeded(3), settings: { robots: 'on' } });
 net.flush();
 assert.ok(host.startRound('2v2'));
 host.choose('rifle');
 const arena = host.arena;
 for (let i = 0; i < 5; i++) arena.endTick();
 // Alone with robots: your vote is the whole side's.
 const vote = arena.forfeit('host', true);
 assert.deepEqual(vote, { votes: 1, needed: 1 });
 assert.deepEqual(arena.matchState().forfeit, { [arena.seats.get('host').team]: ['host'] });
});
