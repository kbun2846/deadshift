// The game server (server/): HostSession with no local player, rooms with a
// leader, the always-open rooms, player-made rooms, and the real WebSocket
// server with the client's transport (net/socket-transport.js) on top.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HostSession } from '../src/net/host-session.js';
import { ClientSession } from '../src/net/client-session.js';
import { createLoopback } from '../src/net/transport.js';
import { PROTOCOL_VERSION } from '../src/net/protocol.js';
import { Simulation } from '../src/simulation.js';
import { maps, multiplayerMaps } from '../src/maps.js';
import { playerId } from '../src/net/player-id.js';
import { Room, AUTO_START, MOVE_GAP } from '../server/room.js';
import { VOTE } from '../src/net/host-session.js';
import { Rooms } from '../server/rooms.js';
import { SERVER } from '../server/config.js';
import { Admins } from '../server/admins.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server/index.js';
import { connectServer, fetchRooms } from '../src/net/socket-transport.js';

const map = maps.deadwater, createSim = m => new Simulation(m);
const config = { ...SERVER, dataDir: null };
// (The Rooms tests that don't look at the list make none.)
const bare = { ...config, listedModes: [] };
const clock = (t = 100) => { const now = () => t; now.add = s => { t += s; }; return now; };
// A stand-in for a player's socket: what the room sent it, and whether it was closed.
let serial = 0;
function fakeConn(pid = 'pid-' + (++serial) + '-abcdefgh') {
 return { id: 'c' + (++serial), pid, ip: '10.0.0.' + serial, sent: [], closed: null, send(m) { this.sent.push(JSON.parse(JSON.stringify(m))); }, close(code) { this.closed = code; }, buffered: () => 0, last(t) { return [...this.sent].reverse().find(m => m.t === t); } };
}
const hello = (room, conn, name) => room.receive(conn, { t: 'hello', version: PROTOCOL_VERSION, name });
const steps = (room, n) => { for (let i = 0; i < n; i++) room.step(); };
const letIn = (room, ...pairs) => { for (const [conn, name] of pairs) { room.join(conn); hello(room, conn, name); } room.step(); };

test('a HostSession with no local player: no host seat, slots from 0, one whole tick per step', () => {
 const net = createLoopback();
 const host = new HostSession({ transport: net.host('ABCDE'), map, local: null, createSim, settings: { robots: 'off' } });
 assert.equal(host.dedicated, true);
 assert.equal(host.playerCount, 0);
 const client = new ClientSession({ transport: net.join('ABCDE'), map, local: createSim(map), createSim, name: 'Sam' });
 net.flush();
 for (let i = 0; i < 5; i++) { client.input({}); host.step(); net.flush(); }
 assert.ok(client.welcomed);
 assert.equal(client.slot, 0);
 assert.equal(host.playerCount, 1);
 assert.deepEqual(host.lobby().players.map(p => p.name), ['Sam']);
 assert.equal(host.states().length, 1);
 // The leader (server/room.js) wears the host tag.
 host.leader = client.id;
 assert.equal(host.lobby().players[0].host, true);
 // Nothing piles up for a host screen that does not exist.
 assert.ok(host.startRound('practice'));
 client.choose('rifle'); net.flush();
 for (let i = 0; i < 60; i++) { client.input({ fire: true, aimX: 1 }); host.step(); net.flush(); }
 assert.equal(host.localEvents.length, 0);
});

test('a room: its maker leads, controls from anyone else are refused, the leader passes on', () => {
 const now = clock();
 const room = new Room({ code: 'ROOMA', map: 'deadwater', mode: 'ffa', ownerPid: 'owner-pid-1234', config, now });
 const guest = fakeConn(), owner = fakeConn('owner-pid-1234');
 room.join(guest); room.join(owner);
 assert.equal(room.leaderId, null, 'nobody leads before being let in');
 hello(room, guest, 'Guest'); hello(room, owner, 'Owner');
 room.step();
 assert.equal(room.leaderId, owner.id, 'the maker leads even after someone else came first');
 assert.equal(owner.last('room').lead, true);
 assert.equal(guest.last('room').lead, false);
 room.receive(guest, { t: 'lead', op: 'mode', mode: '2v2' });
 assert.equal(room.session.arena.mode, 'ffa');
 assert.match(guest.last('note').text, /host/);
 room.receive(owner, { t: 'lead', op: 'mode', mode: '2v2' });
 assert.equal(room.session.arena.mode, '2v2');
 room.leave(owner);
 assert.equal(room.leaderId, guest.id);
 assert.equal(guest.last('room').lead, true);
});

test('START opens the map vote; this map winning starts the round, with robots filling the seats', () => {
 const now = clock();
 const room = new Room({ code: '11111', map: 'deadwater', mode: 'ffa', config, now });
 const a = fakeConn(), b = fakeConn(); letIn(room, [a, 'Ann'], [b, 'Bob']);
 room.receive(a, { t: 'lead', op: 'mode', mode: '3v3' });
 room.receive(a, { t: 'lead', op: 'start' });
 assert.equal(room.session.arena.phase, 'lobby', 'not yet: the vote first');
 steps(room, 3); // snapshots go out every 3rd tick
 assert.deepEqual(b.last('snapshot').vote.maps.map(m => m.id), multiplayerMaps().map(m => m.id)); // every multiplayer map is on the ballot
 room.receive(a, { t: 'vote', map: 'deadwater' });
 room.receive(b, { t: 'vote', map: 'nowhere' });
 steps(room, 3);
 const shown = b.last('snapshot').vote.maps.find(m => m.id === 'deadwater');
 assert.deepEqual([shown.votes, shown.names], [1, ['Ann']], 'the count and who voted');
 room.receive(b, { t: 'vote', map: 'deadwater' });
 steps(room, Math.ceil(VOTE.settle * 60) + 2);
 assert.equal(room.session.arena.phase, 'playing', 'everyone voted: it closed early');
 assert.equal([...room.session.arena.seats.values()].filter(s => s.robot).length, 4);
 assert.equal(b.last('snapshot').vote, null);
});

test('a tie is a coin toss; practice skips the vote; a mode that cannot start is refused before it', () => {
 const picks = new Set();
 for (const seed of [0.1, 0.9]) {
  const room = new Room({ code: '22222', map: 'deadwater', mode: 'ffa', config, now: clock() });
  const a = fakeConn(), b = fakeConn(); letIn(room, [a, 'Ann'], [b, 'Bob']);
  room.session.random = () => seed;
  room.receive(a, { t: 'lead', op: 'start' });
  room.receive(a, { t: 'vote', map: 'deadwater' }); room.receive(b, { t: 'vote', map: 'hollow-wick' });
  steps(room, Math.ceil(VOTE.settle * 60) + 2);
  picks.add(room.session.lastVote?.map ?? room.mapId);
 }
 assert.deepEqual([...picks].sort(), ['deadwater', 'hollow-wick'], 'either map, by the toss');
 const room = new Room({ code: '33333', map: 'deadwater', mode: 'practice', config, now: clock() });
 const a = fakeConn(); letIn(room, [a, 'Ann']);
 room.receive(a, { t: 'lead', op: 'start', mode: 'practice' });
 assert.equal(room.session.arena.phase, 'playing', 'practice: the host picked the map');
 const off = new Room({ code: '44444', map: 'deadwater', mode: '2v2', settings: { robots: 'off' }, config, now: clock() });
 const c = fakeConn(); letIn(off, [c, 'Cat']);
 off.receive(c, { t: 'lead', op: 'start', mode: '2v2' });
 assert.equal(off.session.ballot, null);
 assert.match(c.last('note').text, /needs 4 players/, 'robots off: refused at START, not after the vote');
});

test('the vote picking another map moves the room there and starts once everyone is back', () => {
 const now = clock();
 const room = new Room({ code: '55555', map: 'deadwater', mode: 'ffa', ownerPid: 'lead-pid-9999', config, now });
 const a = fakeConn('lead-pid-9999'), b = fakeConn(); letIn(room, [a, 'Ann'], [b, 'Bob']);
 room.receive(a, { t: 'lead', op: 'start', mode: '2v2' });
 room.receive(a, { t: 'vote', map: 'hollow-wick' }); room.receive(b, { t: 'vote', map: 'hollow-wick' });
 steps(room, Math.ceil(VOTE.settle * 60) + 2);
 assert.equal(b.last('moveMap').map, 'hollow-wick');
 assert.equal(room.mapId, 'hollow-wick');
 assert.equal(room.session.arena.phase, 'lobby', 'waiting for everyone to come back');
 const a2 = fakeConn('lead-pid-9999'); letIn(room, [a2, 'Ann']);
 assert.equal(room.session.arena.phase, 'lobby');
 const b2 = fakeConn(); letIn(room, [b2, 'Bob']); room.step();
 assert.equal(room.session.arena.phase, 'playing');
 assert.equal(room.session.arena.mode, '2v2');
});

test('a listed room runs itself: no host, its own map and mode, robots fill, a countdown, fresh when empty', () => {
 const now = clock();
 const room = new Room({ code: '66666', name: 'Deadwater Outpost 2V2', isPublic: true, map: 'deadwater', mode: '2v2', settings: { robots: 'off', health: 150 }, config, now });
 assert.equal(room.capacity, 4, "a 2V2 room holds its mode's seats");
 assert.equal(room.session.arena.settings.robots, 'fill', 'listed rooms always fill');
 assert.equal(room.session.arena.settings.health, 100, 'house rules');
 const a = fakeConn(), b = fakeConn(); letIn(room, [a, 'Ann'], [b, 'Bob']);
 assert.equal(room.leaderId, null, 'nobody leads');
 room.receive(a, { t: 'lead', op: 'mode', mode: 'ffa' });
 assert.match(a.last('note').text, /by itself/);
 room.receive(a, { t: 'lead', op: 'kick', id: b.id });
 assert.ok(room.session.remotes.has(b.id));
 room.step();
 assert.equal(room.session.lobby().startsIn, AUTO_START, 'the countdown shows in the lobby');
 now.add(AUTO_START + .1); room.step();
 assert.equal(room.session.arena.phase, 'playing');
 assert.equal(room.session.arena.mode, '2v2');
 assert.equal([...room.session.arena.seats.values()].filter(s => s.robot).length, 2);
 room.leave(a); room.leave(b);
 const rooms = new Rooms({ config: bare, now });
 rooms.rooms.set(room.code, room);
 now.add(config.publicReset + 1); rooms.step();
 assert.equal(room.session.arena.phase, 'lobby', 'a fresh match for the next players');
 assert.equal(room.refuse(fakeConn()), null);
});

test('review fixes: an emptied lobby stops the countdown; new rooms are fresh; moves are spaced out; a failed vote start is told; a new START drops the old auto-start', () => {
 const now = clock();
 // A listed room: Ann leaves mid-countdown; Bob, later, gets a whole one.
 const listed = new Room({ code: '77777', isPublic: true, map: 'deadwater', mode: 'ffa', config, now });
 assert.equal(listed.fresh, true, 'nobody has played in a new room: nothing to reset');
 const a = fakeConn(); letIn(listed, [a, 'Ann']); room3(listed);
 now.add(3); listed.step(); listed.leave(a); listed.step();
 assert.equal(listed.session.lobby().startsIn ?? null, null, 'the countdown stops when the lobby empties');
 now.add(10);
 const b = fakeConn(); letIn(listed, [b, 'Bob']);
 assert.equal(listed.session.arena.phase, 'lobby', 'not started the moment Bob is in');
 assert.equal(listed.session.lobby().startsIn, AUTO_START);
 // A player's room: two moves within MOVE_GAP; the second is refused with a note.
 const room = new Room({ code: '88888', map: 'deadwater', mode: 'ffa', ownerPid: 'own-pid-12345678', config, now });
 const c = fakeConn('own-pid-12345678'); letIn(room, [c, 'Cy']);
 room.receive(c, { t: 'lead', op: 'map', map: 'hollow-wick' });
 assert.equal(room.mapId, 'hollow-wick');
 const c2 = fakeConn('own-pid-12345678'); letIn(room, [c2, 'Cy']);
 room.receive(c2, { t: 'lead', op: 'map', map: 'deadwater' });
 assert.equal(room.mapId, 'hollow-wick', 'too soon');
 assert.match(c2.last('note').text, /moment/);
 now.add(MOVE_GAP); room.receive(c2, { t: 'lead', op: 'map', map: 'deadwater' });
 assert.equal(room.mapId, 'deadwater', 'fine after MOVE_GAP');
 // A same-map vote whose round can't start (1V1 with three players): the leader is told.
 const c3 = fakeConn('own-pid-12345678'), d = fakeConn(), e = fakeConn(); letIn(room, [c3, 'Cy'], [d, 'Di'], [e, 'Ed']);
 room.session.random = () => 0;
 room.receive(c3, { t: 'lead', op: 'start', mode: '1v1' });
 if (room.session.ballot) {
  for (const conn of [c3, d, e]) room.receive(conn, { t: 'vote', map: 'deadwater' });
  steps(room, Math.ceil(VOTE.settle * 60) + 2);
  assert.equal(room.session.arena.phase, 'lobby');
  assert.ok(c3.last('note'), 'the leader hears why');
 } else assert.ok(c3.last('note'), 'refused before the vote, with a note');
 // A pending auto-start is dropped by a new START.
 room.pendingStart = { mode: 'ffa', expect: 9, until: now() + 20 };
 room.receive(c3, { t: 'lead', op: 'start', mode: 'ffa' });
 assert.equal(room.pendingStart, null);
});
const room3 = room => { room.step(); room.step(); };

test('the list: every map in every listed mode; another room opens when one fills', () => {
 const now = clock();
 const rooms = new Rooms({ config, now });
 const list = rooms.list();
 assert.equal(list.length, multiplayerMaps().length * config.listedModes.length);
 for (const mode of config.listedModes) for (const mapId of ['deadwater', 'hollow-wick']) assert.ok(list.some(r => r.map === mapId && r.mode === mode), mapId + ' ' + mode);
 assert.ok(list.every(r => /^[0-9]{5}$/.test(r.code) && r.players === 0));
 const duel = [...rooms.rooms.values()].find(r => r.isPublic && r.home.mode === '1v1' && r.mapId === 'deadwater');
 letIn(duel, [fakeConn(), 'A'], [fakeConn(), 'B']);
 assert.equal(duel.refuse(fakeConn()), 'That game is full.');
 for (let i = 0; i < 30; i++) rooms.step();
 const duels = rooms.list().filter(r => r.mode === '1v1' && r.map === 'deadwater');
 assert.equal(duels.length, 2, 'a second 1V1 on Deadwater opened');
});

test('a player-made room: REMOVE keeps that player out; it closes when left empty', () => {
 const now = clock();
 const rooms = new Rooms({ config: bare, now });
 const { room } = rooms.create({ map: 'deadwater', mode: 'ffa', settings: {}, pid: 'maker-pid-123' });
 assert.ok(room && /^[0-9]{5}$/.test(room.code), 'five digits');
 assert.ok(!rooms.list().some(r => r.code === room.code), 'not on the list: only its code gets in');
 const maker = fakeConn('maker-pid-123'), pest = fakeConn('pest-pid-1234');
 letIn(room, [maker, 'Maker'], [pest, 'Pest']);
 room.receive(maker, { t: 'lead', op: 'kick', id: pest.id });
 assert.ok(!room.session.remotes.has(pest.id));
 room.step();
 assert.equal(pest.closed, 4000, 'its socket is closed');
 room.leave(pest);
 assert.equal(room.refuse(fakeConn('pest-pid-1234')), 'You were removed from this game.');
 room.leave(maker);
 now.add(config.privateIdle + 1); rooms.step();
 assert.equal(rooms.find(room.code), null);
});

test('moving a room to another map keeps its code, leader, mode and added robots', () => {
 const now = clock();
 const room = new Room({ code: '77777', map: 'deadwater', mode: '2v2', ownerPid: 'lead-pid-1234', config, now });
 const lead = fakeConn('lead-pid-1234'), other = fakeConn();
 letIn(room, [lead, 'Lead'], [other, 'Other']);
 room.receive(lead, { t: 'lead', op: 'robot' });
 room.receive(lead, { t: 'lead', op: 'map', map: 'hollow-wick' });
 assert.equal(other.last('moveMap').map, 'hollow-wick', 'everyone is told to follow');
 assert.equal(room.mapId, 'hollow-wick');
 assert.equal(room.session.arena.mode, '2v2');
 assert.equal([...room.session.arena.seats.values()].filter(s => s.robot).length, 1);
 // The old sockets are stale: ignored, then closed.
 room.receive(other, { t: 'lead', op: 'mode', mode: 'ffa' });
 assert.equal(room.session.arena.mode, '2v2');
 const back = fakeConn('lead-pid-1234');
 letIn(room, [back, 'Lead']);
 assert.equal(room.leaderId, back.id, 'the maker leads again after the reload');
 now.add(20); room.step();
 assert.equal(other.closed, 4002);
 // Unknown or unreleased maps are refused.
 assert.equal(room.moveMap('dry-creek'), false);
});

test('untrusted leader messages: odd setting names, a flood of controls; silent sockets are closed', () => {
 const now = clock();
 const room = new Room({ code: '88888', map: 'deadwater', config, now });
 const a = fakeConn(); letIn(room, [a, 'Ann']);
 for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) room.receive(a, { t: 'lead', op: 'setting', key, value: 1 });
 for (const setup of [null, 5, 'x', [], { skill: {} }]) { room.receive(a, { t: 'lead', op: 'robot' }); room.receive(a, { t: 'lead', op: 'tuneAll', setup }); }
 assert.equal(room.session.arena.settings.constructor, Object, 'nothing was written');
 // At most LEADS_PER_SECOND a second get through.
 room.receive(a, { t: 'lead', op: 'mode', mode: 'ffa' });
 now.add(1.1);
 for (let i = 0; i < 20; i++) room.receive(a, { t: 'lead', op: 'mode', mode: i % 2 ? 'ffa' : 'practice' });
 assert.equal(room.session.arena.mode, 'ffa', 'the flood stopped after 8');
 // A socket that never says hello: never leads, and is closed.
 const silent = fakeConn(); room.join(silent);
 room.leave(a); room.step();
 assert.equal(room.leaderId, null);
 now.add(11); room.step();
 assert.equal(silent.closed, 4000);
 // Join and leave lines are not kept on the server.
 assert.equal(room.session.notices.length, 0);
});

test('rooms refuse a ninth player', () => {
 const room = new Room({ code: 'FULLA', map: 'deadwater', config, now: clock() });
 for (let i = 0; i < 8; i++) room.join(fakeConn());
 assert.equal(room.refuse(fakeConn()), 'That game is full.');
});

test('the player id is kept, and looks like one', () => {
 const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
 const id = playerId(storage);
 assert.match(id, /^[a-f0-9]{32}$/);
 assert.equal(playerId(storage), id);
});

test('the real server: the list, HOST, JOIN by code, the leader, bans, versions, origins and the admin API', async () => {
 const quiet = { log() {}, warn() {}, error() {} };
 const server = startServer({ ...config, port: 0, allowAnyOrigin: false, adminToken: 'test-admin-token' }, { log: quiet });
 try {
  const { port } = await server.ready, url = 'ws://127.0.0.1:' + port;
  // An odd path is refused, and the server stays up.
  const odd = await new Promise(resolve => { import('node:net').then(({ connect }) => { const socket = connect(port, '127.0.0.1', () => socket.write('GET //a:99999/rooms HTTP/1.1\r\nHost: x\r\n\r\n')); socket.on('data', d => { resolve(String(d).split(' ')[1]); socket.destroy(); }); socket.on('error', () => resolve('error')); }); });
  assert.equal(odd, '400');
  const list = await fetchRooms(url);
  assert.equal(list.version, PROTOCOL_VERSION);
  const listed = list.rooms.find(r => r.map === 'deadwater' && r.mode === 'ffa');
  assert.ok(listed?.public);
  const made = await connectServer({ url, request: { t: 'create', map: 'deadwater', mode: 'ffa', settings: {} }, pid: 'aaaaaaaa-1111' });
  const a = new ClientSession({ transport: made, map, local: createSim(map), createSim, name: 'Ann' });
  const joined = await connectServer({ url, request: { t: 'join', code: made.room.code }, pid: 'bbbbbbbb-2222' });
  const b = new ClientSession({ transport: joined, map, local: createSim(map), createSim, name: 'Bob' });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 40 && !(a.welcomed && b.welcomed); i++) { a.input({}); b.input({}); await wait(25); }
  assert.ok(a.welcomed && b.welcomed);
  for (let i = 0; i < 20 && !made.room.lead; i++) { a.input({}); b.input({}); await wait(25); }
  assert.equal(made.room.lead, true, 'the maker leads once let in');
  assert.equal(joined.room.lead, false);
  made.lead('start', { mode: 'practice' });
  for (let i = 0; i < 40 && a.match().phase !== 'playing'; i++) { a.input({}); b.input({}); await wait(25); }
  assert.equal(a.match().phase, 'playing');
  await assert.rejects(connectServer({ url, request: { t: 'join', code: '00000' }, pid: 'cccccccc-3333' }), /No game with that code/);
  // A page from before an update is told to reload.
  const { WebSocket } = await import('ws');
  const old = await new Promise(resolve => { const ws = new WebSocket(url + '/play'); ws.on('open', () => ws.send(JSON.stringify({ t: 'join', code: listed.code, pid: 'dddddddd-4444', version: PROTOCOL_VERSION - 1 }))); ws.on('message', d => resolve(JSON.parse(d))); ws.on('error', () => {}); });
  assert.equal(old.t, 'nope'); assert.match(old.reason, /Reload/);
  // Another website's page is turned away (browsers send their page's origin).
  const refused = await new Promise(resolve => { const ws = new WebSocket(url + '/play', { origin: 'https://evil.example' }); ws.on('unexpected-response', (_q, res) => resolve(res.statusCode)); ws.on('open', () => resolve(101)); ws.on('error', () => {}); });
  assert.equal(refused, 403);
  // The admin API: a wrong token is refused; the right one sees the room and can ban.
  const api = (path, body, token = 'test-admin-token') => fetch('http://127.0.0.1:' + port + '/admin/api/' + path, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
  assert.equal((await api('state', null, 'wrong')).status, 401);
  const state = await (await api('state')).json();
  const room = state.rooms.find(r => r.code === made.room.code);
  assert.deepEqual(room.players.map(p => p.name).sort(), ['Ann', 'Bob']);
  const bob = room.players.find(p => p.name === 'Bob');
  assert.equal((await (await api('ban', { code: room.code, id: bob.id, reason: 'test' })).json()).ok, true);
  for (let i = 0; i < 40 && !b.ended; i++) { a.input({}); b.input({}); await wait(25); }
  assert.ok(b.ended);
  await assert.rejects(connectServer({ url, request: { t: 'join', code: listed.code }, pid: 'bbbbbbbb-2222' }), /banned/);
  a.close();
 } finally { await server.close(); }
});

test('admin keys: the owner and named people; removed keys stop at once; wrong keys lock an address out', () => {
 let t = 0;
 const dir = mkdtempSync(join(tmpdir(), 'ds-admins-')), now = () => t;
 const admins = new Admins({ dir, ownerToken: 'owner-key-123', now });
 assert.equal(admins.who('owner-key-123', 'a'), 'owner');
 const sam = admins.add('Sam');
 assert.equal(sam.name, 'sam');
 assert.equal(new Admins({ dir, now }).who(sam.key, 'b'), 'sam', 'the key works from the file, which keeps only its fingerprint');
 assert.throws(() => admins.add('sam'));
 assert.throws(() => admins.add('owner'));
 admins.remove('sam');
 assert.equal(admins.who(sam.key, 'c'), null);
 for (let i = 0; i < 10; i++) admins.who('guess', 'd');
 assert.equal(admins.who('owner-key-123', 'd'), null, 'locked out, even with the right key');
 t += 601;
 assert.equal(admins.who('owner-key-123', 'd'), 'owner');
 assert.equal(new Admins({ now }).enabled, false, 'no keys: the page is off');
});

test('the room list is null when the server cannot be reached', async () => {
 assert.equal(await fetchRooms('ws://127.0.0.1:9', { timeout: 500 }), null);
});
