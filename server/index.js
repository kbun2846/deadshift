// The Deadstab game server: matches run here, so no player's browser has to
// host (AGENTS.md > Multiplayer > The game server).
//
//   node server/index.js          (or: pnpm server)
//
// It speaks plain HTTP and WebSocket on 127.0.0.1:8787 by default; on the VPS
// Caddy sits in front and adds HTTPS (server/deploy/SETUP.md), so players
// connect to wss://play.deadstab.com/play.
//
//   GET  /rooms     the always-open rooms, for the JOIN page's list
//   GET  /health    is it up, and how busy
//   POST /dev/unlock  the developer tools' check (devcode.js)
//   WS   /play      a player: first message { t:'join', code, pid } or
//                   { t:'create', map, mode, settings, pid }, answered with
//                   { t:'room', ... } or { t:'nope', reason }; then the game's
//                   own messages (src/net/protocol.js) and the leader's
//                   { t:'lead', op, ... } controls (room.js).
//   /admin          the owner's page (admin.js), with ADMIN_TOKEN set
//
// One process, one 60 Hz loop stepping every room. A full 4V4 room with
// robots costs about 2-3 ms a tick on a laptop core, so a small VPS runs
// several at once; empty rooms cost nothing.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { SERVER } from './config.js';
import { Rooms } from './rooms.js';
import { Bans } from './bans.js';
import { handleAdmin } from './admin.js';
import { Admins } from './admins.js';
import { DevCode, handleDevUnlock } from './devcode.js';
import { Maintenance } from './maintenance.js';
import { AdminLog } from './admin-log.js';
import { RecentPlayers } from './recent-players.js';
import { PlayerStats } from './player-stats.js';
import { ServerStats, readVersion, SAMPLE_SECONDS } from './stats.js';
import { PROTOCOL_VERSION } from '../src/net/protocol.js';
import { cleanRoomCode } from '../src/net/transport.js';

const TICK = 1000 / 60;
const now = () => performance.now() / 1000;
// A browser's player id (src/net/player-id.js): random letters, never trusted
// for anything but telling players apart (bans, the room's maker).
const cleanPid = pid => (typeof pid === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(pid) ? pid : 'anon-' + randomBytes(9).toString('base64url'));
// A request's path. (new URL throws on some odd paths, '//a:99999/x': that
// must never take the server down.)
const pathOf = req => { try { return new URL(req.url, 'http://x'); } catch { return null; } };
// What one WebSocket message costs on the wire: the text plus its frame header.
const frameBytes = text => { const n = Buffer.byteLength(text); return n + (n < 126 ? 2 : n < 65536 ? 4 : 10); };
const REPO_DIR = new URL('..', import.meta.url).pathname;

// `exit`: how a restart from the admin page ends the process (systemd starts
// it again); tests pass their own. `restartDelay`: ms between telling
// everyone and going down.

export function startServer(config = SERVER, { log = console, exit = code => process.exit(code), restartDelay = 3000 } = {}) {
 const rooms = new Rooms({ config, now });
 const bans = new Bans(config.dataDir);
 const admins = new Admins({ dir: config.dataDir, ownerToken: config.adminToken, now });
 const devcode = new DevCode({ dir: config.dataDir, now, log });
 const maintenance = new Maintenance(config.dataDir);
 const adminLog = new AdminLog(config.dataDir);
 const recent = new RecentPlayers();
 const playerStats = new PlayerStats();
 const stats = new ServerStats({ dir: config.dataDir, planBytes: config.monthlyTransferBytes, version: readVersion(REPO_DIR) });
 let serial = 0, tickMs = 0;
 const conns = new Set(), perIp = new Map(), creates = new Map(), connects = new Map();
 const load = () => ({ tickMs: Math.round(tickMs * 100) / 100, players: conns.size, rooms: rooms.rooms.size, maintenance: maintenance.on });
 // Players in a room (a connection still choosing one isn't playing yet).
 const online = () => { let n = 0; for (const c of conns) if (c.room) n++; return n; };
 const overview = () => stats.overview({ tickMs, players: online(), rooms: rooms.rooms.size, activeRooms: [...rooms.rooms.values()].filter(r => r.humanCount).length });

 const http = createServer(async (req, res) => {
  const url = pathOf(req);
  if (!url) { res.writeHead(400); res.end(); return; }
  try {
   if (await handleDevUnlock(req, res, { devcode, url, ip: addressOf(req), config, log, adminLog })) return;
   if (await handleAdmin(req, res, { admins, rooms, bans, devcode, maintenance, adminLog, recent, playerStats, findConn, overview, announce, restart, gameUrl: config.gameUrl || 'https://deadstab.com/', url, ip: addressOf(req), log })) return;
   if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET' }); res.end(); return; }
   if (req.method === 'GET' && url.pathname === '/rooms') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ version: PROTOCOL_VERSION, rooms: rooms.list() })); return;
   }
   if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, version: PROTOCOL_VERSION, ...load() })); return;
   }
   res.writeHead(url.pathname === '/' ? 200 : 404, { 'content-type': 'text/plain' });
   res.end(url.pathname === '/' ? 'Deadstab game server\n' : 'Not found\n');
  } catch (error) { log.error(error); try { res.writeHead(500); res.end(); } catch {} }
 });

 const wss = new WebSocketServer({ noServer: true, maxPayload: config.maxMessageBytes, perMessageDeflate: false });
 const addressOf = req => (config.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';

 http.on('upgrade', (req, socket, head) => {
  const url = pathOf(req), ip = addressOf(req), origin = req.headers.origin || '';
  const refuse = (status, text) => { socket.write('HTTP/1.1 ' + status + ' ' + text + '\r\nConnection: close\r\n\r\n'); socket.destroy(); };
  if (url?.pathname !== '/play') return refuse(404, 'Not Found');
  if (!config.allowAnyOrigin && origin && !config.allowedOrigins.includes(origin)) return refuse(403, 'Forbidden');
  if (conns.size >= config.maxConnections || (perIp.get(ip) || 0) >= config.maxConnectionsPerIp) return refuse(503, 'Busy');
  const t = now(), recent = (connects.get(ip) || []).filter(at => t - at < 60);
  if (recent.length >= config.connectsPerMinutePerIp) return refuse(429, 'Too Many Requests');
  recent.push(t); connects.set(ip, recent);
  wss.handleUpgrade(req, socket, head, ws => connect(ws, ip));
 });

 function connect(ws, ip) {
  const conn = {
   id: 'c' + (++serial).toString(36) + randomBytes(3).toString('hex'), ip, pid: null, room: null, generation: -1,
   send(message) { if (ws.readyState !== 1) return; const text = JSON.stringify(message); ws.send(text); stats.sent(frameBytes(text)); },
   // (`ended`: how it ended, for the admin page's recent players.)
   close(code = 1000, reason = '') { conn.ended ??= reason || 'closed'; try { ws.close(code, reason); } catch {} },
   buffered: () => ws.bufferedAmount,
   window: now(), count: 0,
  };
  conns.add(conn); perIp.set(ip, (perIp.get(ip) || 0) + 1); ws.conn = conn;
  const hello = setTimeout(() => { if (!conn.room) conn.close(4005, 'no room asked for'); }, config.helloTimeout * 1000);
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data, binary) => {
   // Too many messages: dropped (a real page sends ~60 a second).
   const t = now(); if (t - conn.window >= 1) { conn.window = t; conn.count = 0; }
   if (++conn.count > config.maxMessagesPerSecond || binary) return;
   let message; try { message = JSON.parse(data.toString('utf8')); } catch { return; }
   if (!message || typeof message !== 'object' || typeof message.t !== 'string') return;
   // A message that trips the game's code costs that player their
   // connection, never the server (every other room carries on).
   try {
    if (conn.room) { conn.room.receive(conn, message); return; }
    clearTimeout(hello);
    enter(conn, message);
   } catch (error) { log.error(new Date().toISOString(), 'message from', conn.ip, 'failed:', error); conn.close(1011, 'error'); }
  });
  ws.on('close', () => {
   clearTimeout(hello); conns.delete(conn);
   recent.end(conn.entry, conn.ended || 'left');
   try { playerStats.end(conn); } catch (error) { log.error('player stats failed:', error); }
   const left = (perIp.get(ip) || 1) - 1; if (left > 0) perIp.set(ip, left); else perIp.delete(ip);
   try { conn.room?.leave(conn); } catch (error) { log.error('leave failed:', error); }
  });
  ws.on('error', () => {});
 }

 // The first message: which room (a code, or HOST's new one).
 function enter(conn, message) {
  const nope = reason => { conn.ended = 'refused: ' + reason; conn.send({ t: 'nope', reason }); conn.close(4003, 'refused'); };
  conn.pid = cleanPid(message.pid);
  // (A page that shows the admin page's messages as cards says so: `cards`.)
  conn.cards = message.cards === 1;
  conn.entry = recent.start(conn, message.t === 'join' ? cleanRoomCode(message.code) || '' : '');
  playerStats.connect(conn);
  if (bans.find(conn)) return nope('You are banned from the Deadstab servers.');
  if (message.version !== undefined && message.version !== PROTOCOL_VERSION) return nope('The game was just updated. Reload the page to play online.');
  let room = null;
  if (message.t === 'join') {
   if (!cleanRoomCode(message.code)) return nope('Room codes are 5 numbers.');
   room = rooms.find(message.code);
   if (!room) return nope('No game with that code. Check the code, or ask for a new one.');
   // Maintenance: no joins, except players coming back after their room's map move.
   if (maintenance.on && !room.expects(conn.pid)) return nope(maintenance.text);
  } else if (message.t === 'create') {
   if (maintenance.on) return nope(maintenance.text);
   const t = now(), recent = (creates.get(conn.ip) || []).filter(at => t - at < 60);
   if (recent.length >= config.createsPerMinutePerIp) return nope('Too many new rooms at once. Wait a minute and try again.');
   creates.set(conn.ip, [...recent, t]);
   const made = rooms.create({ map: message.map, mode: message.mode, settings: message.settings, pid: conn.pid });
   if (made.error) return nope(made.error);
   room = made.room;
   log.log(new Date().toISOString(), 'room', room.code, 'made on', room.mapId);
  } else return nope('Unknown request.');
  const why = room.refuse(conn);
  if (why) return nope(why);
  room.join(conn);
  playerStats.joined(conn, room);
  stats.players(online());
 }

 // The admin page's announcement: a card (or, on an older page, a toast) on every player's page.
 function announce(text) { let n = 0; for (const room of rooms.rooms.values()) n += room.message(text, 'global'); return n; }
 // A connection by its id (the admin page's private messages and player sheet).
 function findConn(id) { for (const conn of conns) if (conn.id === id) return conn; return null; }

 // The admin page's RESTART SERVER: everyone is told, then the process ends
 // and systemd (Restart=always) starts it again.
 let restarting = null;
 function restart() {
  if (restarting) return false;
  announce('The server is restarting in a few seconds.');
  restarting = setTimeout(async () => { try { await close('The server is restarting. Join again in a moment.'); } finally { exit(0); } }, restartDelay);
  return true;
 }

 // The loop: 60 ticks a second, catching up at most a few after a hiccup
 // rather than racing through a long backlog.
 let next = performance.now(), timer = null, running = true;
 const loop = () => {
  if (!running) return;
  const start = performance.now();
  let steps = 0;
  while (performance.now() >= next && steps < 4) {
   const a = performance.now();
   rooms.step();
   // (The admin page's player numbers: a look at every seat twice a second.)
   if (++loop.ticks % 30 === 0) { try { playerStats.sampleRooms(rooms.rooms.values()); } catch (error) { log.error('player stats failed:', error); } }
   const took = performance.now() - a;
   tickMs += (took - tickMs) * .02; stats.tick(took);
   next += TICK; steps++;
  }
  if (performance.now() - next > 250) next = performance.now();
  timer = setTimeout(loop, Math.max(0, next - performance.now()));
  if (start - (loop.warned || 0) > 10000 && tickMs > TICK * .7) { loop.warned = start; log.warn('Busy: a tick takes', tickMs.toFixed(1), 'ms of', TICK.toFixed(1)); }
 };
 loop.ticks = 0;
 loop();
 // Dead sockets (a phone that lost signal) are noticed within 30 s.
 // (And the HOST rate limit forgets addresses that have gone quiet.)
 const heartbeat = setInterval(() => {
  for (const ws of wss.clients) { if (ws.isAlive === false) { if (ws.conn) ws.conn.ended ??= 'lost connection'; ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch {} }
  const t = now(); for (const list of [creates, connects]) for (const [ip, times] of list) if (!times.some(at => t - at < 60)) list.delete(ip);
 }, 15000);
 // The admin page's overview: a load sample every 10 s, the month's data counter saved every minute.
 const sampler = setInterval(() => stats.sample(online()), SAMPLE_SECONDS * 1000);
 const saver = setInterval(() => stats.save(), 60000);

 const ready = new Promise(resolve => http.listen(config.port, config.host, () => resolve(http.address())));
 ready.then(address => log.log(new Date().toISOString(), 'Deadstab server on', address.address + ':' + address.port, '· protocol', PROTOCOL_VERSION, '·', rooms.rooms.size, 'always-open rooms', ...(admins.enabled ? ['· admin page on'] : []), ...(maintenance.on ? ['· MAINTENANCE MODE ON'] : [])));

 let closing = null;
 function close(reason = 'The server is restarting. Join again in a moment.') {
  closing ??= (async () => {
   running = false; clearTimeout(timer); clearInterval(heartbeat); clearInterval(sampler); clearInterval(saver);
   stats.save();
   for (const conn of conns) { conn.send({ t: 'removed', reason }); conn.close(1012, 'server restart'); }
   await new Promise(r => setTimeout(r, 100));
   wss.close(); await new Promise(r => http.close(() => r()));
  })();
  return closing;
 }
 return { http, wss, rooms, bans, devcode, maintenance, adminLog, recent, playerStats, findConn, stats, ready, close, load, announce, restart: () => restart(), cancelRestart: () => { clearTimeout(restarting); restarting = null; } };
}

// Run directly (not imported by a test): start, and stop cleanly on SIGTERM
// (systemd restart) so players are told rather than just cut off.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const server = startServer();
 const stop = async () => { await server.close(); process.exit(0); };
 process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
