// QUICK PLAY on the game server (server/quick.js): the queue, quick rooms
// (server/room.js `quick`), and the real server over WebSockets: two quick
// players matched into one room, a lone one told nobody is waiting, leaving
// the queue on disconnect, maintenance and bans, the admin page's view.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION } from '../src/net/protocol.js';
import { maps, multiplayerMaps } from '../src/maps.js';
import { Simulation } from '../src/simulation.js';
import { ClientSession } from '../src/net/client-session.js';
import { Rooms } from '../server/rooms.js';
import { QuickQueue, QUICK } from '../server/quick.js';
import { SERVER } from '../server/config.js';
import { startServer } from '../server/index.js';
import { connectServer } from '../src/net/socket-transport.js';
import { openQuickQueue } from '../src/net/quick-queue.js';

const config = { ...SERVER, dataDir: null, listedModes: [] };
const clock = (t = 100) => { const now = () => t; now.add = s => { t += s; }; return now; };
let serial = 0;
function fakeConn(pid = 'pid-' + (++serial) + '-abcdefgh') {
 return { id: 'q' + (++serial), pid, ip: '10.1.0.' + serial, sent: [], closed: null, send(m) { this.sent.push(JSON.parse(JSON.stringify(m))); }, close(code) { this.closed = code; }, buffered: () => 0, last(t) { return [...this.sent].reverse().find(m => m.t === t); } };
}
const quiet = { log() {}, warn() {}, error() {} };
const wait = ms => new Promise(r => setTimeout(r, ms));

test('the queue: a lone player waits; the next one makes a quick room and both are sent to it', () => {
 const now = clock(), rooms = new Rooms({ config, now }), queue = rooms.quick = new QuickQueue({ rooms, now, random: () => .99 });
 const a = fakeConn(), b = fakeConn();
 assert.equal(queue.request(a), 'queued');
 assert.deepEqual(a.last('queued'), { t: 'queued', waiting: 1 });
 assert.equal(rooms.quickCount, 0, 'no room for one player alone');
 assert.equal(queue.request(b), 'matched');
 const room = [...rooms.rooms.values()].find(r => r.quick);
 assert.ok(room, 'a quick room was made');
 assert.equal(b.last('match').code, room.code);
 assert.equal(a.last('match').code, room.code, 'the waiting player is offered the same room');
 // FFA on the last map of the vote's pool (random .99), run like a listed room.
 assert.equal(room.session.arena.mode, QUICK.mode);
 assert.equal(room.mapId, multiplayerMaps().at(-1).id);
 assert.equal(room.runsItself, true);
 assert.equal(room.session.lobbyExtra.listed, true);
 assert.equal(room.held(), 2, 'both seats held while they come');
 assert.ok(!rooms.list().some(r => r.code === room.code), 'not on the JOIN list');
 // A third quick player goes to the same room while it is in its lobby.
 const c = fakeConn();
 assert.equal(queue.request(c), 'matched');
 assert.equal(c.last('match').code, room.code);
 assert.equal(rooms.quickCount, 1);
 // The same browser (one player id) is never matched with itself.
 const d1 = fakeConn('same-pid-12345678'), d2 = fakeConn('same-pid-12345678');
 const rooms2 = new Rooms({ config, now }), q2 = rooms2.quick = new QuickQueue({ rooms: rooms2, now });
 assert.equal(q2.request(d1), 'queued');
 assert.equal(q2.request(d2), 'queued');
 assert.equal(rooms2.quickCount, 0);
});

test('quick rooms: no leader, seats held then released, late joiners only early in a match, offers withdrawn', () => {
 const now = clock(), rooms = new Rooms({ config, now }), queue = rooms.quick = new QuickQueue({ rooms, now });
 const a = fakeConn(), b = fakeConn();
 queue.request(a); queue.request(b);
 const room = rooms.find(b.last('match').code);
 // In: nobody leads, and lead controls are refused.
 room.join(b); room.receive(b, { t: 'hello', version: PROTOCOL_VERSION, name: 'Bea' }); room.step();
 assert.equal(room.leaderId, null);
 room.lead(b, { op: 'mode', mode: '1v1' });
 assert.match(b.last('note').text, /starts by itself/);
 assert.equal(b.last('room').quick, true, 'the room message says quick');
 assert.equal(room.held(), 1, "b's seat is no longer held; a's still is");
 now.add(QUICK.hold + 1);
 assert.equal(room.held(), 0, 'a held seat lapses');
 // The round starts by itself (AUTO_START), and a quick player may still come in early.
 for (let i = 0; i < 60 * 9; i++) { now.add(1 / 60); room.step(); }
 assert.equal(room.session.arena.phase, 'playing');
 assert.ok(queue.joinable(room));
 // `a` never took its offer: still waiting with it. Late in the match the
 // room stops taking people and the offer is withdrawn (`queued` again).
 a.sent.length = 0;
 now.add(QUICK.lateJoin + 1); queue.step();
 assert.equal(queue.joinable(room), false);
 assert.equal(a.last('queued')?.t, 'queued');
 assert.equal(queue.waiting.get(a.id).offered, null);
 // The next quick player makes a new room with `a`.
 const c = fakeConn();
 assert.equal(queue.request(c), 'matched');
 assert.notEqual(c.last('match').code, room.code);
 assert.equal(a.last('match').code, c.last('match').code);
 // Someone the admin page removed from a quick room is never sent back to it.
 const late = fakeConn();
 room.removedPids.add(late.pid);
 assert.equal(queue.joinable(room, late.pid), false);
 // Waiting too long: let go.
 const lone = new QuickQueue({ rooms: new Rooms({ config, now }), now }), d = fakeConn();
 lone.request(d); now.add(QUICK.maxWait + 1); lone.step();
 assert.equal(lone.size, 0); assert.equal(d.closed, 4007);
 // A full house of quick rooms: everyone waits (plays bots) instead.
 const few = new Rooms({ config, now }), q3 = few.quick = new QuickQueue({ rooms: few, now, settings: { ...QUICK, maxRooms: 0 } });
 q3.request(fakeConn()); assert.equal(q3.request(fakeConn()), 'queued');
});

// A raw matchmaking line: every message it hears, and when it closes.
function quickLine(url, { pid, name = 'Q', version = PROTOCOL_VERSION } = {}) {
 const ws = new WebSocket(url + '/play'), heard = [];
 const line = { ws, heard, closed: false, next: t => new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('no ' + t + ' (heard ' + JSON.stringify(heard) + ')')), 4000); const look = () => { const m = heard.find(x => x.t === t && !x.used); if (m) { m.used = true; clearTimeout(timer); resolve(m); } else setTimeout(look, 10); }; look(); }) };
 ws.on('open', () => ws.send(JSON.stringify({ t: 'quick', pid, name, version })));
 ws.on('message', d => heard.push(JSON.parse(d)));
 ws.on('close', () => { line.closed = true; });
 ws.on('error', () => {});
 return line;
}

test('the real server: two quick players meet in one room; a lone one waits; the queue forgets the gone; maintenance, bans and the admin page', async () => {
 const server = startServer({ ...config, port: 0, allowAnyOrigin: true, adminToken: 'test-admin-token' }, { log: quiet });
 try {
  const { port } = await server.ready, url = 'ws://127.0.0.1:' + port;
  const api = (path, body) => fetch('http://127.0.0.1:' + port + '/admin/api/' + path, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer test-admin-token' }, body: body ? JSON.stringify(body) : undefined }).then(r => r.json());
  // Alone: told nobody is waiting; the line stays open.
  const ann = quickLine(url, { pid: 'aaaaaaaa-quick-1', name: 'Ann' });
  assert.deepEqual((await ann.next('queued')).waiting, 1);
  assert.equal(server.quick.size, 1);
  let state = await api('state');
  assert.equal(state.quick.length, 1); assert.equal(state.quick[0].name, 'Ann');
  assert.equal(state.overview.quickWaiting, 1);
  // A second: both sent to one new room; the newcomer's line is done.
  const bob = quickLine(url, { pid: 'bbbbbbbb-quick-2', name: 'Bob' });
  const toBob = await bob.next('match'), toAnn = await ann.next('match');
  assert.equal(toBob.code, toAnn.code); assert.equal(toBob.mode, 'ffa');
  assert.ok(multiplayerMaps().some(m => m.id === toBob.map));
  for (let i = 0; i < 100 && !bob.closed; i++) await wait(10);
  assert.ok(bob.closed, "the newcomer's line closes once matched");
  // Both join it by code (Ann leaves the queue to take it).
  ann.ws.close();
  for (let i = 0; i < 100 && server.quick.size; i++) await wait(10);
  assert.equal(server.quick.size, 0, 'a closed line leaves the queue');
  const map = maps[toBob.map], createSim = m => new Simulation(m);
  const tb = await connectServer({ url, request: { t: 'join', code: toBob.code }, pid: 'bbbbbbbb-quick-2' });
  const ta = await connectServer({ url, request: { t: 'join', code: toAnn.code }, pid: 'aaaaaaaa-quick-1' });
  assert.equal(tb.room.quick, true); assert.equal(ta.room.lead, false);
  const a = new ClientSession({ transport: ta, map, local: createSim(map), createSim, name: 'Ann' });
  const b = new ClientSession({ transport: tb, map, local: createSim(map), createSim, name: 'Bob' });
  for (let i = 0; i < 80 && !(a.welcomed && b.welcomed); i++) { a.input({}); b.input({}); await wait(25); }
  assert.ok(a.welcomed && b.welcomed);
  // The admin page: the room, marked quick, with both players.
  state = await api('state');
  const room = state.rooms.find(r => r.code === toBob.code);
  assert.equal(room.quick, true); assert.equal(room.name, 'Quick play');
  assert.deepEqual(room.players.map(p => p.name).sort(), ['Ann', 'Bob']);
  // Maintenance: quick play is refused with its words (the page plays bots).
  server.maintenance.set({ on: true, text: 'Back soon.', by: 'test' });
  const shut = quickLine(url, { pid: 'cccccccc-quick-3' });
  assert.equal((await shut.next('nope')).reason, 'Back soon.');
  server.maintenance.set({ on: false, by: 'test' });
  // A banned player is refused.
  server.bans.add({ pid: 'dddddddd-quick-4', reason: 'test', by: 'test' });
  const banned = quickLine(url, { pid: 'dddddddd-quick-4' });
  assert.match((await banned.next('nope')).reason, /banned/);
  // An old page is told to reload.
  const old = quickLine(url, { pid: 'eeeeeeee-quick-5', version: PROTOCOL_VERSION - 1 });
  assert.match((await old.next('nope')).reason, /Reload/);
  // A newcomer now goes straight to the open quick room (in its lobby or early in its match).
  const cy = quickLine(url, { pid: 'ffffffff-quick-6' });
  assert.equal((await cy.next('match')).code, toBob.code);
  // The client's line (net/quick-queue.js) hears the same words.
  const heard = [];
  const line = openQuickQueue({ url, pid: 'gggggggg-quick-7', name: 'Gus', WebSocketClass: WebSocket, handlers: { onQueued: n => heard.push(['queued', n]), onMatch: m => heard.push(['match', m.code]), onEnd: r => heard.push(['end', r]) } });
  for (let i = 0; i < 200 && !heard.some(h => h[0] === 'match'); i++) await wait(10);
  assert.deepEqual(heard[0], ['match', toBob.code]);
  line.close();
  a.close(); b.close();
 } finally { await server.close(); }
});

test('the client line: no server means it ends at once (the page goes straight to its bot fight)', async () => {
 const ended = await new Promise(resolve => openQuickQueue({ url: 'ws://127.0.0.1:9', pid: 'hhhhhhhh-quick-8', WebSocketClass: WebSocket, handlers: { onEnd: resolve } }));
 assert.match(ended, /closed|reach/);
 const none = await new Promise(resolve => openQuickQueue({ url: 'ws://x', pid: 'p', WebSocketClass: null, handlers: { onEnd: resolve } }));
 assert.match(none, /cannot play online/);
});
