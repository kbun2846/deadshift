// The admin page's GAME button (one-time developer tools tickets), its
// messages to players (announcement, room, private: { t:'admin' } cards, notes
// for older pages) and the player sheet's numbers (server/player-stats.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { startServer } from '../server/index.js';
import { SERVER } from '../server/config.js';
import { DevCode, DEV_LIMITS, TICKET_SECONDS } from '../server/devcode.js';
import { PlayerStats } from '../server/player-stats.js';
import { Room } from '../server/room.js';
import { PROTOCOL_VERSION } from '../src/net/protocol.js';

const quiet = { log() {}, warn() {}, error() {} };
const OWNER = 'test-owner-token-456';
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (check, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (check()) return true; await wait(20); } return check(); };

async function serve(options = {}) {
 const dir = mkdtempSync(join(tmpdir(), 'ds-admin2-'));
 const server = startServer({ ...SERVER, port: 0, dataDir: dir, allowAnyOrigin: false, adminToken: OWNER, listedModes: ['ffa'], gameUrl: 'https://game.example/', ...options }, { log: quiet });
 const { port } = await server.ready;
 const base = 'http://127.0.0.1:' + port;
 const api = async (path, body, token = OWNER) => {
  const reply = await fetch(base + '/admin/api/' + path, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
  return { status: reply.status, body: await reply.json().catch(() => ({})) };
 };
 return { server, base, api, ws: 'ws://127.0.0.1:' + port + '/play' };
}
const unlock = (base, body, origin) => fetch(base + '/dev/unlock', { method: 'POST', body, headers: origin ? { origin } : {} });
const ticketOf = url => new URL(url).hash.replace('#devticket=', '');

// A player's socket; `cards`: a page that shows the admin messages as cards.
function player(url, request, { pid = 'test-pid-' + randomBytes(4).toString('hex'), name = 'tester', cards = true } = {}) {
 const socket = new WebSocket(url), messages = [];
 socket.on('message', data => messages.push(JSON.parse(String(data))));
 socket.on('error', () => {});
 const closed = new Promise(resolve => socket.on('close', resolve));
 const opened = new Promise(resolve => socket.on('open', () => { socket.send(JSON.stringify({ ...request, pid, version: PROTOCOL_VERSION, ...(cards ? { cards: 1 } : {}) })); resolve(); }));
 const ready = (async () => {
  await opened;
  await until(() => messages.some(m => m.t === 'room' || m.t === 'nope'));
  const room = messages.find(m => m.t === 'room');
  if (room) socket.send(JSON.stringify({ t: 'hello', version: PROTOCOL_VERSION, name }));
  return room;
 })();
 return { socket, messages, closed, ready, pid, admin: kind => messages.filter(m => m.t === 'admin' && m.kind === kind), notes: () => messages.filter(m => m.t === 'note'), close: () => socket.close() };
}
const create = { t: 'create', map: 'deadwater', mode: 'ffa', settings: { robots: 'off' } };

test('GAME: a one-time ticket for the owner and named admins, good without a code, used once, logged', async () => {
 const { server, base, api } = await serve();
 try {
  assert.equal((await api('devticket', {}, 'nope')).status, 401);
  const made = await api('devticket', {});
  assert.equal(made.status, 200);
  assert.match(made.body.url, /^https:\/\/game\.example\/#devticket=[A-Za-z0-9_-]{43}$/, 'the game page, the ticket in the fragment');
  assert.equal(made.body.expiresIn, TICKET_SECONDS);
  // No developer tools code was ever set: a code is refused, the ticket works, once.
  assert.equal((await unlock(base, '123456')).status, 503);
  const ticket = ticketOf(made.body.url);
  // Another website's page can't use (or burn) it.
  assert.equal((await unlock(base, 'ticket:' + ticket, 'https://evil.example')).status, 403);
  const used = await unlock(base, 'ticket:' + ticket, 'https://deadstab.com');
  assert.equal(used.status, 200); assert.deepEqual(await used.json(), { ok: true });
  assert.equal(used.headers.get('access-control-allow-origin'), 'https://deadstab.com');
  assert.equal((await unlock(base, 'ticket:' + ticket)).status, 401, 'never twice');
  // A named admin may open the game too; the log says who.
  const sam = (await api('keys/add', { name: 'sam' })).body;
  const theirs = await api('devticket', {}, sam.key);
  assert.equal(theirs.status, 200);
  assert.equal((await unlock(base, 'ticket:' + ticketOf(theirs.body.url))).status, 200);
  const log = (await api('state?with=log')).body.log;
  assert.ok(log.some(e => e.who === 'owner' && e.what === 'opened the game with dev tools'));
  assert.ok(log.some(e => e.who === 'sam' && e.what === 'opened the game with dev tools'));
  assert.equal(log.filter(e => e.what === 'dev ticket used').map(e => e.who).sort().join(), 'owner,sam');
 } finally { await server.close(); }
});

test('GAME tickets run out, and bad tickets count against the same limits as wrong codes', async () => {
 let t = 1000;
 const dev = new DevCode({ dir: mkdtempSync(join(tmpdir(), 'ds-ticket-')), now: () => t, log: quiet });
 await dev.set('424242', 'owner');
 const { ticket } = dev.issueTicket('owner');
 t += TICKET_SECONDS + 1;
 assert.equal(dev.redeemTicket(ticket, '1.1.1.1').result, 'wrong', 'expired');
 // Bad tickets from one address lock it out, a good one included.
 const fresh = dev.issueTicket('owner').ticket;
 for (let i = 1; i < DEV_LIMITS.perAddress; i++) assert.equal(dev.redeemTicket('x'.repeat(43), '2.2.2.2').result, 'wrong');
 assert.equal(dev.redeemTicket('garbage', '2.2.2.2').result, 'wrong');
 assert.equal(dev.redeemTicket(fresh, '2.2.2.2').result, 'locked');
 assert.equal(await dev.check('424242', '2.2.2.2'), 'locked', 'the right code too: one limit for codes and tickets');
 assert.equal(dev.redeemTicket(fresh, '3.3.3.3').result, 'ok', 'another address, the same unused ticket');
 // A right ticket is never counted.
 for (let i = 0; i < DEV_LIMITS.perAddress + 2; i++) assert.equal(dev.redeemTicket(dev.issueTicket('owner').ticket, '4.4.4.4').result, 'ok');
 // Over the server: the sixth bad ticket from one address gets 429.
 const { server, base } = await serve();
 try {
  const codes = [];
  for (let i = 0; i < DEV_LIMITS.perAddress + 1; i++) codes.push((await unlock(base, 'ticket:' + 'y'.repeat(43))).status);
  assert.deepEqual(codes, [...Array(DEV_LIMITS.perAddress).fill(401), 429]);
 } finally { await server.close(); }
});

test('messages: an announcement reaches everyone, a room message its room, a private one its player; older pages get notes', async () => {
 const { server, api, ws } = await serve();
 try {
  const a = player(ws, create, { name: 'Ann' }), room = await a.ready;
  const c = player(ws, { t: 'join', code: room.code }, { name: 'Cat' }); await c.ready;
  const old = player(ws, create, { name: 'Old', cards: false }); await old.ready;
  await until(() => server.rooms.find(room.code).players.every(p => p.admitted), 2000);
  assert.equal((await api('announce', { text: 'Restarting soon ' + 'x'.repeat(200) })).body.players, 3);
  await until(() => a.admin('global').length && c.admin('global').length && old.notes().length);
  assert.deepEqual(Object.keys(a.admin('global')[0]).sort(), ['from', 'kind', 't', 'text']);
  assert.equal(a.admin('global')[0].from, 'server');
  assert.equal(a.admin('global')[0].text.length, 140, 'cut to 140 characters');
  assert.match(old.notes()[0].text, /^Restarting soon/, 'an older page: a note (a toast)');
  assert.equal(old.messages.filter(m => m.t === 'admin').length, 0);

  assert.equal((await api('message', { code: room.code, text: 'this room only' })).body.players, 2);
  await until(() => a.admin('room').length && c.admin('room').length);
  assert.equal(a.admin('room')[0].text, 'this room only');
  await wait(100);
  assert.ok(!old.notes().some(n => n.text === 'this room only'));

  // Private: one player, by their connection id.
  const state = (await api('state')).body, cat = state.rooms.find(r => r.code === room.code).players.find(p => p.name === 'Cat');
  assert.equal((await api('whisper', { id: cat.id, text: '' })).status, 400);
  assert.equal((await api('whisper', { id: 'c-nobody', text: 'hi' })).status, 404);
  const sent = await api('whisper', { id: cat.id, text: 'just for you' });
  assert.equal(sent.status, 200); assert.equal(sent.body.name, 'Cat');
  await until(() => c.admin('private').length);
  assert.equal(c.admin('private')[0].text, 'just for you');
  await wait(100);
  assert.equal(a.admin('private').length, 0, 'nobody else');
  const log = (await api('state?with=log')).body.log;
  assert.ok(log.some(e => e.what === 'message player' && /^Cat in \d{5}: just for you$/.test(e.target)));
  assert.ok(log.some(e => e.what === 'message room'));
  assert.ok(log.some(e => e.what === 'announce'));
  for (const p of [a, c, old]) p.close();
 } finally { await server.close(); }
});

// A stand-in for a player's socket (as tests/game-server.test.js).
let serial = 0;
const fakeConn = pid => ({ id: 'c' + (++serial), pid, ip: '10.1.0.' + serial, sent: [], send(m) { this.sent.push(m); }, close() {}, buffered: () => 0 });
const steps = (room, n) => { for (let i = 0; i < n; i++) room.step(); };

test('player stats: kills and deaths from the arena add up across matches, per connection and per player id', () => {
 let t = 100; const now = () => t;
 const room = new Room({ code: '77777', map: 'deadwater', mode: 'ffa', settings: { robots: 'off' }, config: { ...SERVER, dataDir: null }, now });
 let ms = 1e6; const stats = new PlayerStats({ clock: () => ms });
 const a = fakeConn('pid-ann-12345678'), b = fakeConn('pid-bob-12345678');
 for (const [conn, name] of [[a, 'Ann'], [b, 'Bob']]) { stats.connect(conn); room.join(conn); stats.joined(conn, room); room.receive(conn, { t: 'hello', version: PROTOCOL_VERSION, name }); }
 steps(room, 2); stats.sampleRooms([room]);
 const arena = room.session.arena;
 const play = () => { for (const conn of [a, b]) room.receive(conn, { t: 'choose', weapon: 'rifle' }); steps(room, 20); stats.sampleRooms([room]); };
 assert.ok(room.session.startRound('ffa')); play();
 assert.ok(arena.seats.get(a.id).present && arena.seats.get(b.id).present, 'both in the match');
 arena.died(arena.seats.get(b.id), arena.seats.get(a.id)); steps(room, 2); ms += 1500; stats.sampleRooms([room]);
 assert.deepEqual(stats.connectionTotals(a), { roomsJoined: 1, matches: 1, kills: 1, deaths: 0, dealt: 0, taken: 0 });
 // The seat's own numbers, as the player sheet shows them.
 const sheet = room.playerState(a);
 assert.equal(sheet.seat.kills, 1); assert.equal(sheet.seat.alive, true); assert.equal(sheet.seat.weapon, 'rifle');
 assert.equal(sheet.room.phase, 'playing'); assert.equal(sheet.seat.rank, 1); assert.equal(room.playerState(b).seat.alive, false);
 // A new match: a fresh stats object on the seat; the first one's numbers are kept.
 assert.ok(room.session.restartMatch()); play();
 assert.equal(arena.seats.get(a.id).stats.kills, 0, 'the seat starts over');
 arena.died(arena.seats.get(a.id), arena.seats.get(b.id)); steps(room, 2); stats.sampleRooms([room]);
 assert.deepEqual(stats.connectionTotals(a), { roomsJoined: 1, matches: 2, kills: 1, deaths: 1, dealt: 0, taken: 0 });
 assert.equal(stats.connectionTotals(b).kills, 1);
 // Ann leaves and comes back (same browser): the player id keeps everything.
 stats.end(a); room.leave(a);
 let ann = stats.player('pid-ann-12345678');
 assert.deepEqual([ann.connects, ann.online, ann.kills, ann.deaths, ann.matches, ann.roomsJoined], [1, 0, 1, 1, 2, 1]);
 assert.deepEqual(ann.names, ['Ann']); assert.equal(ann.recentRooms[0].code, '77777');
 const again = fakeConn('pid-ann-12345678');
 stats.connect(again); room.join(again); stats.joined(again, room); room.receive(again, { t: 'hello', version: PROTOCOL_VERSION, name: 'Ann' });
 steps(room, 20); stats.sampleRooms([room]);
 stats.action(again, 'kicked', { by: 'owner', detail: 'from 77777' });
 ann = stats.player('pid-ann-12345678');
 assert.deepEqual([ann.connects, ann.online, ann.kills, ann.roomsJoined], [2, 1, 1, 2]);
 assert.equal(ann.actions[0].what, 'kicked'); assert.equal(ann.actions[0].room, '77777');
 assert.equal(stats.connectionTotals(again).kills, 0, 'a new connection starts at nothing');
});

test('the player sheet over the API: live seat, connection, player id; the online list carries kills and ping', async () => {
 const { server, api, ws } = await serve();
 try {
  const a = player(ws, create, { name: 'Ann', pid: 'sheet-pid-aaaaaaaa' }), room = await a.ready;
  const b = player(ws, { t: 'join', code: room.code }, { name: 'Bob' }); await b.ready;
  const live = server.rooms.find(room.code);
  await until(() => live.players.every(p => p.admitted), 2000);
  const arena = live.session.arena;
  assert.ok(live.session.startRound('ffa'));
  a.socket.send(JSON.stringify({ t: 'choose', weapon: 'rifle' })); b.socket.send(JSON.stringify({ t: 'choose', weapon: 'shotgun' }));
  await until(() => [...arena.seats.values()].every(s => s.present), 3000);
  const ann = live.players.find(c => c.pid === 'sheet-pid-aaaaaaaa'), bob = live.players.find(c => c !== ann);
  arena.died(arena.seats.get(bob.id), arena.seats.get(ann.id));
  const state = (await api('state')).body, row = state.rooms.find(r => r.code === room.code).players.find(p => p.id === ann.id);
  assert.equal(row.kills, 1); assert.equal(row.deaths, 0); assert.equal(row.alive, true); assert.equal(row.weapon, 'rifle'); assert.ok(row.connectedAt > 0);
  const sheet = (await api('player?id=' + ann.id + '&pid=' + ann.pid)).body;
  assert.equal(sheet.online, true); assert.equal(sheet.name, 'Ann'); assert.equal(sheet.pid, 'sheet-pid-aaaaaaaa');
  assert.equal(sheet.room.code, room.code); assert.match(sheet.room.mapName, /^Deadwater/); assert.equal(sheet.room.phase, 'playing');
  assert.equal(sheet.seat.kills, 1); assert.equal(sheet.seat.hp, sheet.seat.maxHp);
  assert.equal(sheet.connection.kills, 1); assert.equal(sheet.connection.roomsJoined, 1);
  assert.equal(sheet.player.connects, 1); assert.equal(sheet.player.kills, 1);
  assert.equal((await api('player?id=nobody')).status, 404);
  // Kicked: the sheet keeps it on the player id, and still answers once they left.
  assert.equal((await api('kick', { code: room.code, id: ann.id })).status, 200);
  await a.closed;
  await until(() => !server.findConn(ann.id), 2000);
  const after = (await api('player?id=' + ann.id + '&pid=' + ann.pid)).body;
  assert.equal(after.online, false); assert.equal(after.player.kills, 1); assert.equal(after.player.online, 0);
  assert.equal(after.player.actions[0].what, 'kicked'); assert.equal(after.player.actions[0].by, 'owner');
  b.close();
 } finally { await server.close(); }
});
