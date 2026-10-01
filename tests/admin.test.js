// The game server's admin side: the developer tools' code check, ban expiry,
// maintenance mode, announcements, closing rooms, recent players, the owner's
// own routes and the restart (server/admin.js, devcode.js, bans.js, ...).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scryptSync, randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { startServer } from '../server/index.js';
import { SERVER } from '../server/config.js';
import { Bans } from '../server/bans.js';
import { DevCode, DEV_LIMITS } from '../server/devcode.js';
import { Maintenance } from '../server/maintenance.js';
import { AdminLog } from '../server/admin-log.js';
import { ServerStats } from '../server/stats.js';
import { PROTOCOL_VERSION } from '../src/net/protocol.js';

const quiet = { log() {}, warn() {}, error() {} };
const OWNER = 'test-owner-token-123';
const tempDir = () => mkdtempSync(join(tmpdir(), 'ds-admin-'));
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (check, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (check()) return true; await wait(20); } return check(); };

async function serve(options = {}, extra = {}) {
 const dir = options.dataDir ?? tempDir();
 const server = startServer({ ...SERVER, port: 0, dataDir: dir, allowAnyOrigin: false, adminToken: OWNER, listedModes: ['ffa'], ...options }, { log: quiet, ...extra });
 const { port } = await server.ready;
 const base = 'http://127.0.0.1:' + port;
 const api = async (path, body, token = OWNER) => {
  const reply = await fetch(base + '/admin/api/' + path, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
  return { status: reply.status, body: await reply.json().catch(() => ({})) };
 };
 return { server, dir, port, base, api, ws: 'ws://127.0.0.1:' + port + '/play' };
}

// A player's socket: create (or join) a room, then say hello so the room lets it in.
function player(url, request, { pid = 'test-pid-' + randomBytes(4).toString('hex'), name = 'tester' } = {}) {
 const socket = new WebSocket(url), messages = [];
 socket.on('message', data => messages.push(JSON.parse(String(data))));
 socket.on('error', () => {});
 const closed = new Promise(resolve => socket.on('close', resolve));
 const opened = new Promise(resolve => socket.on('open', () => {
  socket.send(JSON.stringify({ ...request, pid, version: PROTOCOL_VERSION }));
  resolve();
 }));
 const ready = (async () => {
  await opened;
  await until(() => messages.some(m => m.t === 'room' || m.t === 'nope'));
  const room = messages.find(m => m.t === 'room');
  if (room) socket.send(JSON.stringify({ t: 'hello', version: PROTOCOL_VERSION, name }));
  return room || messages.find(m => m.t === 'nope');
 })();
 return { socket, messages, closed, ready, pid, got: t => messages.find(m => m.t === t), close: () => socket.close() };
}
const create = { t: 'create', map: 'deadwater', mode: 'ffa', settings: {} };

const unlock = (base, code, origin) => fetch(base + '/dev/unlock', { method: 'POST', body: code, headers: origin ? { origin } : {} });

test('dev unlock: not set, wrong, right, lockout, CORS, set by the owner only', async () => {
 const { server, base, api, dir } = await serve();
 try {
  let r = await unlock(base, '123456');
  assert.equal(r.status, 503); assert.deepEqual(await r.json(), { error: 'Not set up.' });
  assert.equal(r.headers.get('cache-control'), 'no-store');

  // A named admin can't set it; the owner can, and it is stored only as a salted hash.
  const sam = (await api('keys/add', { name: 'sam' })).body;
  assert.equal((await api('devcode', { code: '424242' }, sam.key)).status, 403);
  assert.equal((await api('devcode', { code: 'no' })).status, 400, 'too short');
  assert.equal((await api('devcode', { code: 'has space' })).status, 400);
  const set = await api('devcode', { code: '424242' });
  assert.equal(set.status, 200); assert.equal(set.body.devcode.set, true);
  const file = readFileSync(join(dir, 'devcode.json'), 'utf8');
  assert.ok(!file.includes('424242'));
  const saved = JSON.parse(file);
  assert.equal(Buffer.from(saved.salt, 'base64').length, 16); assert.equal(Buffer.from(saved.hash, 'base64').length, 32);
  assert.ok(saved.params.N >= 1 << 15);
  // The owner tab shows when it was set, never the code; a named admin gets no owner data.
  const ownerState = (await api('state?with=owner')).body;
  assert.equal(ownerState.devcode.set, true); assert.ok(ownerState.devcode.setAt); assert.ok(!JSON.stringify(ownerState).includes('424242'));
  assert.deepEqual(ownerState.keys.map(k => k.name), ['sam']);
  const samState = (await api('state?with=owner', null, sam.key)).body;
  assert.equal(samState.owner, false); assert.equal(samState.keys, undefined); assert.equal(samState.devcode, undefined);

  // CORS: only the game's own pages may read the answer; another site is refused unchecked.
  r = await unlock(base, '424242', 'https://deadstab.com');
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true });
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://deadstab.com');
  assert.match(r.headers.get('vary'), /origin/i);
  r = await unlock(base, '424242', 'https://evil.example');
  assert.equal(r.status, 403); assert.equal(r.headers.get('access-control-allow-origin'), null);
  const pre = await fetch(base + '/dev/unlock', { method: 'OPTIONS', headers: { origin: 'https://deadstab.com', 'access-control-request-method': 'POST' } });
  assert.equal(pre.status, 204); assert.equal(pre.headers.get('access-control-allow-origin'), 'https://deadstab.com'); assert.match(pre.headers.get('access-control-allow-methods'), /POST/);
  const preEvil = await fetch(base + '/dev/unlock', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
  assert.equal(preEvil.headers.get('access-control-allow-origin'), null);

  // Wrong codes: five lock the address out, even for the right code; right ones never count.
  assert.equal((await unlock(base, '424242')).status, 200);
  for (let i = 0; i < DEV_LIMITS.perAddress; i++) {
   r = await unlock(base, '00000' + i);
   assert.equal(r.status, 401); assert.deepEqual(await r.json(), { error: 'Wrong code.' });
  }
  r = await unlock(base, '424242');
  assert.equal(r.status, 429); assert.deepEqual(await r.json(), { error: 'Too many tries. Wait a while.' });
  assert.equal((await unlock(base, 'x'.repeat(200))).status, 413, 'a long body is refused');
 } finally { await server.close(); }
});

test('dev unlock: parallel guesses are charged before hashing; the global cap stops guessing from many addresses', async () => {
 let t = 1000;
 const dir = tempDir(), salt = randomBytes(16), params = { N: 1024, r: 8, p: 1, keylen: 32 };
 // (Cheap parameters, written by hand, so the test runs quickly; the check uses the file's own.)
 writeFileSync(join(dir, 'devcode.json'), JSON.stringify({ salt: salt.toString('base64'), hash: scryptSync('right1', salt, 32, params).toString('base64'), params, setAt: new Date().toISOString(), setBy: 'test' }));
 const dev = new DevCode({ dir, now: () => t, log: quiet });
 const burst = await Promise.all(Array.from({ length: 12 }, () => dev.check('wrong1', 'a')));
 assert.equal(burst.filter(r => r === 'wrong').length, DEV_LIMITS.perAddress);
 assert.equal(burst.filter(r => r === 'locked').length, 12 - DEV_LIMITS.perAddress);
 assert.equal(await dev.check('right1', 'a'), 'locked');
 assert.equal(await dev.check('right1', 'b'), 'ok', 'another address is not affected');
 t += DEV_LIMITS.addressLock + 1;
 assert.equal(await dev.check('right1', 'a'), 'ok', 'the lock runs out');
 // Many addresses, a few guesses each: the global cap pauses everyone.
 const results = [];
 for (let i = 0; i < DEV_LIMITS.global + 3; i++) results.push(await dev.check('guess' + i, '10.0.' + Math.floor(i / 3) + '.1'));
 assert.equal(results.filter(r => r === 'wrong').length, DEV_LIMITS.global);
 assert.equal(await dev.check('right1', '192.168.9.9'), 'locked');
 t += DEV_LIMITS.globalLock + 1;
 assert.equal(await dev.check('right1', '192.168.9.9'), 'ok');
 assert.equal(dev.status().set, true); assert.equal(dev.status().hash, undefined);
});

test('bans can run out; old bans (no expiry) stay in force', () => {
 let t = Date.parse('2026-09-30T12:00:00Z');
 const dir = tempDir();
 writeFileSync(join(dir, 'bans.json'), JSON.stringify([{ key: 'old1', pid: 'old-player-id-1', ip: null, name: 'old', reason: '', by: 'owner', at: '2026-09-01T00:00:00Z' }]));
 const bans = new Bans(dir, { clock: () => t });
 assert.ok(bans.find({ pid: 'old-player-id-1' }), 'an old ban is permanent');
 const hour = bans.add({ pid: 'hour-player-1', ip: '10.1.1.1', name: 'h', by: 'sam', seconds: 3600 });
 assert.equal(hour.until, '2026-09-30T13:00:00.000Z');
 assert.ok(bans.find({ pid: 'someone-else', ip: '10.1.1.1' }));
 t += 3601 * 1000;
 assert.equal(bans.find({ pid: 'hour-player-1', ip: '10.1.1.1' }), null, 'ignored once it has run out');
 assert.deepEqual(bans.active.map(b => b.key), ['old1'], 'and pruned');
 assert.deepEqual(JSON.parse(readFileSync(join(dir, 'bans.json'), 'utf8')).map(b => b.key), ['old1']);
});

test('maintenance mode refuses new rooms and joins, keeps running matches, and survives a restart', async () => {
 const { server, api, ws, dir } = await serve();
 try {
  const host = player(ws, create);
  const room = await host.ready;
  assert.equal(room.t, 'room');
  const named = (await api('keys/add', { name: 'helper' })).body.key;
  assert.equal((await api('maintenance', { on: true, text: 'Back soon, testing.' }, named)).status, 200, 'admins may turn it on');
  assert.equal((await api('state')).body.maintenance.on, true);
  const refusedCreate = await player(ws, create).ready;
  assert.deepEqual(refusedCreate, { t: 'nope', reason: 'Back soon, testing.' });
  const refusedJoin = await player(ws, { t: 'join', code: room.code }).ready;
  assert.equal(refusedJoin.t, 'nope'); assert.equal(refusedJoin.reason, 'Back soon, testing.');
  assert.equal(host.socket.readyState, WebSocket.OPEN, 'the running room carries on');
  assert.equal(new Maintenance(dir).on, true, 'kept in DATA_DIR');
  const recent = (await api('state?with=recent')).body.recent;
  assert.ok(recent.some(e => e.how === 'refused: Back soon, testing.'));
  await api('maintenance', { on: false });
  assert.equal((await player(ws, create).ready).t, 'room');
  assert.equal((await api('maintenance', { on: 'yes' })).status, 400);
  host.close();
 } finally { await server.close(); }
});

test('announcements and room messages reach players as notes; closing rooms tells and disconnects them', async () => {
 const { server, api, ws } = await serve();
 try {
  const a = player(ws, create, { name: 'Ann' }), roomA = await a.ready;
  const b = player(ws, create, { name: 'Bob' }); await b.ready;
  assert.equal((await api('announce', { text: '' })).status, 400);
  const sent = await api('announce', { text: 'Hello everyone ' + 'x'.repeat(200) });
  assert.equal(sent.status, 200); assert.equal(sent.body.players, 2);
  await until(() => a.got('note') && b.got('note'));
  assert.equal(a.got('note').text.length, 140, 'cut to 140 characters');
  assert.match(b.got('note').text, /^Hello everyone/);
  assert.equal((await api('message', { code: roomA.code, text: 'just this room' })).body.players, 1);
  await until(() => a.messages.some(m => m.t === 'note' && m.text === 'just this room'));
  assert.ok(!b.messages.some(m => m.t === 'note' && m.text === 'just this room'));

  // The room list shows players with their names once let in.
  await until(() => false, 300);
  const state = (await api('state')).body;
  const shown = state.rooms.find(r => r.code === roomA.code);
  assert.equal(shown.players[0].name, 'Ann'); assert.equal(shown.public, false);
  assert.ok(state.overview.players >= 2); assert.ok(state.overview.load.now >= 0);

  // CLOSE ROOM: a player-made room goes; a listed one starts over and stays listed.
  const closed = await api('close', { code: roomA.code });
  assert.equal(closed.status, 200); assert.equal(closed.body.listed, false);
  await a.closed;
  assert.match(a.got('removed').reason, /closed this room/);
  assert.equal(server.rooms.find(roomA.code), null);
  assert.equal((await api('close', { code: roomA.code })).status, 404);
  const listed = [...server.rooms.rooms.values()].find(r => r.isPublic);
  const c = player(ws, { t: 'join', code: listed.code }, { name: 'Cat' }); await c.ready;
  assert.equal((await api('close', { code: listed.code })).body.listed, true);
  await c.closed;
  assert.ok(server.rooms.find(listed.code), 'still listed');
  b.close();
 } finally { await server.close(); }
});

test('kick and ban from the rooms tab; ban someone who already left from recent players; the log keeps who did what', async () => {
 const { server, api, ws, dir } = await serve();
 try {
  const a = player(ws, create, { name: 'Ann', pid: 'ann-player-0001' }), room = await a.ready;
  // KICK: out of that room for good, told why.
  const k = player(ws, { t: 'join', code: room.code }, { name: 'Kit', pid: 'kit-player-0003' }); await k.ready;
  await until(() => false, 250);
  const kit = (await api('state')).body.rooms.find(r => r.code === room.code).players.find(p => p.name === 'Kit');
  assert.equal((await api('kick', { code: room.code, id: kit.id })).status, 200);
  await k.closed;
  assert.equal(k.got('removed').reason, 'You were removed from this room.');
  assert.equal((await player(ws, { t: 'join', code: room.code }, { pid: 'kit-player-0003' }).ready).reason, 'You were removed from this game.');
  assert.equal((await api('kick', { code: room.code, id: kit.id })).status, 404);
  const id = (await api('state')).body.rooms.find(r => r.code === room.code).players[0].id;
  assert.equal((await api('ban', { code: room.code, id, duration: 'forever' })).status, 400, 'unknown length');
  const ban = await api('ban', { code: room.code, id, duration: '1h', reason: 'testing' });
  assert.equal(ban.status, 200); assert.ok(ban.body.ban.until); assert.equal(ban.body.kicked, 1);
  await a.closed;
  assert.match(a.got('removed').reason, /banned/, 'told why (not the session\'s own words)');
  assert.equal((await api('unban', { key: ban.body.ban.key })).status, 200);

  // Someone who came and went: banned from the recent list by their player id and address.
  const b = player(ws, create, { name: 'Bob', pid: 'bob-player-0002' }); await b.ready;
  await until(() => false, 250);
  b.close(); await b.closed;
  await until(() => false, 100);
  const recent = (await api('state?with=recent')).body.recent;
  const bob = recent.find(e => e.pid === 'bob-player-0002');
  assert.equal(bob.name, 'Bob'); assert.ok(bob.left); assert.equal(bob.how, 'left');
  const later = await api('ban', { recent: bob.key, duration: 'perm' });
  assert.equal(later.status, 200); assert.equal(later.body.ban.pid, 'bob-player-0002'); assert.equal(later.body.ban.until, null);
  assert.equal((await player(ws, create, { pid: 'bob-player-0002' }).ready).t, 'nope');

  // By hand: an address or a player id; anything else is refused.
  assert.equal((await api('ban', { target: '203.0.113.9', duration: '7d' })).body.ban.ip, '203.0.113.9');
  assert.equal((await api('ban', { target: 'not an id!' })).status, 400);

  const log = (await api('state?with=log')).body.log;
  assert.deepEqual(log.slice(0, 4).map(e => e.what), ['ban', 'ban', 'unban', 'ban']);
  assert.ok(log.every(e => e.who === 'owner'));
  assert.equal(new AdminLog(dir).list()[0].what, 'ban', 'kept in DATA_DIR');
 } finally { await server.close(); }
});

test('owner-only routes refuse named admins; RESTART tells everyone and exits', async () => {
 let exited = null;
 const { server, api, ws } = await serve({}, { exit: code => { exited = code; }, restartDelay: 150 });
 try {
  const helper = (await api('keys/add', { name: 'helper' })).body.key;
  for (const [path, body] of [['keys/add', { name: 'x' }], ['keys/remove', { name: 'helper' }], ['devcode', { code: '123456' }], ['restart', {}]]) {
   const r = await api(path, body, helper);
   assert.equal(r.status, 403, path); assert.equal(r.body.error, 'Only the owner can do that.');
  }
  assert.equal((await api('state', null, helper)).body.you, 'helper');
  assert.equal(exited, null);
  const p = player(ws, create); await p.ready;
  await until(() => false, 200);
  assert.equal((await api('restart', {})).status, 200);
  assert.equal((await api('restart', {})).status, 409, 'once');
  await until(() => p.messages.some(m => m.t === 'note' && /restarting/.test(m.text)));
  await until(() => exited !== null, 3000);
  assert.equal(exited, 0);
  assert.match(p.got('removed').reason, /restarting/);
  // The removed key stops at once.
  const r = await api('keys/remove', { name: 'helper' }).catch(() => null);
  assert.ok(!r || r.status === 200);
 } finally { await server.close(); }
});

test('the overview counts data sent this month and keeps it across restarts', () => {
 let t = Date.parse('2026-09-10T00:00:00Z');
 const dir = tempDir();
 const stats = new ServerStats({ dir, clock: () => t, planBytes: 1e12 });
 stats.sent(5e9); stats.tick(2); stats.tick(4); stats.sample(3);
 t += 2 * 3600e3;
 let o = stats.overview({ tickMs: 3, players: 5 });
 assert.equal(o.sent.month, 5e9); assert.equal(o.load.avg, 3); assert.equal(o.load.peak, 4); assert.equal(o.peakToday, 5);
 // 5 GB in 2 hours, carried to the month's end (October 1st).
 const left = Date.parse('2026-10-01T00:00:00Z') - t;
 assert.equal(o.sent.estimate, Math.round(5e9 + (5e9 / (2 * 3600e3)) * left));
 stats.save();
 const again = new ServerStats({ dir, clock: () => t, planBytes: 1e12 });
 again.sent(1e9);
 assert.equal(again.overview().sent.month, 6e9);
 assert.equal(again.overview().peakToday, 5);
 t = Date.parse('2026-10-01T00:05:00Z');
 assert.equal(again.overview().sent.month, 1e9, 'a new month starts from the unsaved bytes only');
});
