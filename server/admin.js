// The owner's admin page and its API. Only for the owner and the people he
// gave a key (admins.js); with no key anywhere the whole thing is off.
// The page itself is admin-page.html (one self-contained file, no outside
// requests), served here.
//
//   GET  /admin                      the page (asks for your key, keeps it for the tab)
//   GET  /admin/api/state            overview, rooms with players, bans, maintenance, you
//        ?with=recent | log | owner  plus the player log (&tz= &open=days &q= &online=1 &limit=), the admin log, or the owner's tab
//   GET  /admin/api/player?id=&pid=  one player's sheet: live seat, this connection, this player id
//   POST /admin/api/kick             { code, id }                    out of that room (and kept out of it)
//   POST /admin/api/ban              { code, id } | { recent } | { target }, duration, reason
//   POST /admin/api/unban            { key }
//   POST /admin/api/announce         { text }                        an announcement card for every player
//   POST /admin/api/message          { code, text }                  a card for everyone in one room
//   POST /admin/api/whisper          { id, text }                    a private card for one player (connection id)
//   POST /admin/api/devticket        {}                              a one-time link to the game (gameUrl#devticket=...)
//   POST /admin/api/close            { code }                        everyone out (a listed room starts over)
//   POST /admin/api/maintenance      { on, text }                    refuse new rooms and joins
//  Owner only:
//   POST /admin/api/keys/add         { name }                        a named key, shown once
//   POST /admin/api/keys/remove      { name }
//   POST /admin/api/devcode          { code }                        the developer tools' code
//   POST /admin/api/restart          {}                              tell everyone, exit, systemd restarts
// (Messages reach a page as { t:'admin', kind, text }, or as a note on an
// older page: room.js Room.tell.)
// Every API call carries the header  Authorization: Bearer <key>. A wrong key
// counts against the address (admins.js locks it out after 10). Every action
// is logged (server log and DATA_DIR/admin-log.json) with who did it.
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { cleanRoomCode } from '../src/net/transport.js';
import { DEV_CODE_PATTERN } from './devcode.js';
import { Room } from './room.js';
import { keyOf } from './player-stats.js';

const PAGE = readFileSync(new URL('./admin-page.html', import.meta.url), 'utf8');
const PAGE_HEADERS = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" };
// Ban lengths the page offers, in seconds (0: for good).
export const BAN_LENGTHS = Object.freeze({ '1h': 3600, '1d': 86400, '7d': 7 * 86400, perm: 0 });
const BAN_NAMES = { '1h': '1 hour', '1d': '1 day', '7d': '7 days', perm: 'permanent' };
const PID = /^[A-Za-z0-9_-]{8,64}$/;
const OWNER_ONLY = new Set(['/admin/api/keys/add', '/admin/api/keys/remove', '/admin/api/devcode', '/admin/api/restart']);

// One line of plain text, at most `max` characters.
const line = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').trim().slice(0, max);

function json(res, status, body) {
 res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
 res.end(JSON.stringify(body));
}

function readBody(req, limit = 4096) {
 return new Promise((resolve, reject) => {
  let size = 0; const parts = [];
  req.on('data', chunk => { size += chunk.length; if (size > limit) { reject(new Error('Too big.')); req.resume(); } else parts.push(chunk); });
  req.on('end', () => {
   try { const body = parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}; if (!body || typeof body !== 'object' || Array.isArray(body)) throw 0; resolve(body); }
   catch { reject(new Error('Bad request.')); }
  });
  req.on('error', reject);
 });
}

const nameIn = (room, id) => room.session.lobby().players.find(p => p.id === id)?.name || '';

// The player sheet: everything the server knows about one connection and its
// player id. `conn` may be gone (they left): then only the player id's record.
function playerSheet(ctx, conn, pid) {
 const { playerStats, bans, recent } = ctx;
 const key = conn ? keyOf(conn) : pid;
 const live = conn && conn.room ? conn.room.playerState(conn) : null;
 if (conn) playerStats?.sample(conn);
 const name = (conn && conn.room && nameIn(conn.room, conn.id)) || conn?.name || playerStats?.player(key)?.names[0] || '';
 const ip = conn?.ip || recent?.list().find(e => e.pid === pid)?.ip || null;
 return {
  online: !!conn, id: conn?.id || null, pid: conn?.pid || pid || null, name, ip,
  connectedAt: conn?.track?.at ?? null,
  ...(live || { room: null, ping: null, seat: null }),
  pingAvg: conn ? playerStats?.pingAverage(conn) ?? null : null,
  connection: conn ? playerStats?.connectionTotals(conn) || null : null,
  player: key ? playerStats?.player(key) || null : null,
  bans: bans.active.filter(b => (b.pid && b.pid === (conn?.pid || pid)) || (b.ip && ip && b.ip === ip)),
 };
}

// Returns true if it answered the request.
export async function handleAdmin(req, res, ctx) {
 const { admins, rooms, bans, url, ip = '?', log = console } = ctx;
 if (!url.pathname.startsWith('/admin')) return false;
 if (!admins.enabled) { json(res, 404, { error: 'The admin page is off (no admin keys).' }); return true; }
 if (url.pathname === '/admin' || url.pathname === '/admin/') {
  if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { error: 'GET only.' }); return true; }
  res.writeHead(200, PAGE_HEADERS); res.end(req.method === 'HEAD' ? undefined : PAGE); return true;
 }
 if (admins.locked(ip)) { json(res, 429, { error: 'Too many wrong keys. Wait 10 minutes.' }); return true; }
 const who = admins.who(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''), ip);
 if (!who) { json(res, 401, { error: 'Wrong key.' }); return true; }
 const owner = who === 'owner';
 const did = (what, target = '') => { ctx.adminLog?.add(who, what, target); log.log(new Date().toISOString(), 'admin', who, what, target); };
 try {
  if (req.method === 'GET' && url.pathname === '/admin/api/player') {
   const id = line(url.searchParams.get('id'), 40), pid = line(url.searchParams.get('pid'), 64);
   const conn = id ? ctx.findConn?.(id) || null : null;
   if (!conn && !(pid && PID.test(pid) && ctx.playerStats?.player(pid))) { json(res, 404, { error: 'Nothing is known about that player.' }); return true; }
   json(res, 200, playerSheet(ctx, conn, conn ? conn.pid : pid)); return true;
  }
  if (req.method === 'GET' && url.pathname === '/admin/api/state') {
   const state = { you: who, owner, overview: ctx.overview?.() || null, rooms: rooms.adminState(), bans: bans.active, maintenance: ctx.maintenance?.state || { on: false } };
   const extra = url.searchParams.get('with');
   if (extra === 'recent') {
    // The player log by day and week (player-log.js grouped): today's visits,
    // the days the page has open, or every search match.
    const p = url.searchParams, limit = Math.min(5000, Math.max(50, Math.floor(Number(p.get('limit')) || 500)));
    const open = line(p.get('open'), 2000).split(',').filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 120);
    const log = ctx.recent?.grouped({ q: line(p.get('q'), 64), online: p.get('online') === '1', tz: Number(p.get('tz')) || 0, open, limit }) || { entries: [], days: [], weeks: [], more: 0 };
    // (`known`: the player sheet has something on them; it starts over with the server.)
    state.recent = log.entries.map(e => ({ ...e, known: !!(e.id || (e.pid && ctx.playerStats?.player(e.pid))) }));
    state.recentGroups = { today: log.today, thisWeek: log.thisWeek, days: log.days, weeks: log.weeks, searching: log.searching };
    state.recentMore = log.more;
    state.recentSummary = ctx.recent?.summary?.() || null;
   }
   if (extra === 'log') state.log = ctx.adminLog?.list() || [];
   if (extra === 'owner' && owner) { state.keys = admins.names(); state.devcode = ctx.devcode?.status() || { set: false }; }
   json(res, 200, state); return true;
  }
  if (req.method !== 'POST') { json(res, 405, { error: 'POST only.' }); return true; }
  if (OWNER_ONLY.has(url.pathname) && !owner) { json(res, 403, { error: 'Only the owner can do that.' }); return true; }
  const body = await readBody(req);
  const code = cleanRoomCode(line(body.code, 12)), room = code ? rooms.find(code) : null;
  const needRoom = () => { if (!room) { json(res, 404, { error: 'That room is gone.' }); return false; } return true; };
  switch (url.pathname) {
   case '/admin/api/kick': {
    if (!needRoom()) return true;
    const id = line(body.id, 40), name = nameIn(room, id);
    const conn = room.conns.get(id);
    const ok = room.kick(id);
    if (ok) { did('kick', (name || id) + ' from ' + room.code); if (conn) ctx.playerStats?.action(conn, 'kicked', { by: who, detail: 'from ' + room.code }); }
    json(res, ok ? 200 : 404, ok ? { ok } : { error: 'That player already left.' }); return true;
   }
   case '/admin/api/ban': {
    const duration = body.duration === undefined ? 'perm' : String(body.duration);
    if (!Object.hasOwn(BAN_LENGTHS, duration)) { json(res, 400, { error: 'Pick how long the ban lasts.' }); return true; }
    const reason = line(body.reason, 200);
    let target = null;
    if (body.id !== undefined) {
     // A player in a room now: their player id and address.
     const conn = room?.conns.get(line(body.id, 40));
     if (!conn) { json(res, 404, { error: 'That player is gone. Ban them from the players tab.' }); return true; }
     target = { pid: conn.pid, ip: conn.ip, name: nameIn(room, conn.id) || conn.name || '' };
    } else if (body.recent !== undefined) {
     // Someone from the player log (they may have left).
     const entry = ctx.recent?.find(line(body.recent, 20));
     if (!entry) { json(res, 404, { error: 'That entry is no longer in the list.' }); return true; }
     target = { pid: entry.pid, ip: entry.ip, name: entry.conn?.name || entry.name || '' };
    } else {
     // By hand: a player id or an address.
     const value = line(body.target, 64);
     if (isIP(value)) target = { pid: null, ip: value, name: '' };
     else if (PID.test(value)) target = { pid: value, ip: null, name: '' };
     else { json(res, 400, { error: 'That is neither a player id nor an address.' }); return true; }
    }
    const ban = bans.add({ ...target, reason, by: who, seconds: BAN_LENGTHS[duration] });
    // Out of every room they are in (one browser, one id: usually one room).
    let kicked = 0;
    for (const r of rooms.rooms.values()) for (const c of [...r.conns.values()]) {
     if ((ban.pid && c.pid === ban.pid) || (ban.ip && c.ip === ban.ip)) { c.ended = 'banned'; r.kick(c.id, 'You are banned from the Deadstab servers.'); kicked++; }
    }
    // (Kept on the player id's record for the player sheet, online or not.)
    if (ban.pid) ctx.playerStats?.action({ pid: ban.pid }, 'banned', { by: who, detail: [BAN_NAMES[duration], reason].filter(Boolean).join(' · ') });
    did('ban', [target.name || target.pid || target.ip, BAN_NAMES[duration], reason].filter(Boolean).join(' · '));
    json(res, 200, { ok: true, ban, kicked }); return true;
   }
   case '/admin/api/unban': {
    const key = line(body.key, 20), ban = bans.list.find(b => b.key === key);
    const ok = bans.remove(key);
    if (ok) did('unban', ban.name || ban.pid || ban.ip);
    json(res, ok ? 200 : 404, ok ? { ok } : { error: 'No such ban.' }); return true;
   }
   case '/admin/api/announce': {
    const text = line(body.text, 140);
    if (!text) { json(res, 400, { error: 'Write a message first.' }); return true; }
    const players = ctx.announce(text);
    did('announce', text);
    json(res, 200, { ok: true, players }); return true;
   }
   case '/admin/api/message': {
    if (!needRoom()) return true;
    const text = line(body.text, 140);
    if (!text) { json(res, 400, { error: 'Write a message first.' }); return true; }
    const players = room.message(text, 'room');
    did('message room', room.code + ': ' + text);
    json(res, 200, { ok: true, players }); return true;
   }
   case '/admin/api/whisper': {
    const text = line(body.text, 140);
    if (!text) { json(res, 400, { error: 'Write a message first.' }); return true; }
    const conn = ctx.findConn?.(line(body.id, 40));
    if (!conn || !conn.room || conn.generation !== conn.room.generation) { json(res, 404, { error: 'That player is not in a game now.' }); return true; }
    Room.tell(conn, 'private', text);
    const name = nameIn(conn.room, conn.id) || conn.name || conn.pid;
    ctx.playerStats?.action(conn, 'private message', { by: who, detail: text });
    did('message player', name + ' in ' + conn.room.code + ': ' + text);
    json(res, 200, { ok: true, name }); return true;
   }
   case '/admin/api/devticket': {
    // The GAME button: a one-time, short-lived ticket in the link's fragment
    // (never sent to the page's host), redeemed by the game page.
    const made = ctx.devcode.issueTicket(who);
    did('opened the game with dev tools');
    const base = ctx.gameUrl || 'https://deadstab.com/';
    json(res, 200, { ok: true, url: base.replace(/#.*$/, '') + '#devticket=' + made.ticket, expiresIn: made.expiresIn }); return true;
   }
   case '/admin/api/close': {
    if (!needRoom()) return true;
    const listed = room.isPublic, players = room.humanCount;
    rooms.closeRoom(room, listed ? 'An admin reset this room. Join again in a moment.' : 'An admin closed this room.');
    did(listed ? 'reset room' : 'close room', room.code + (room.name ? ' (' + room.name + ')' : ''));
    json(res, 200, { ok: true, players, listed }); return true;
   }
   case '/admin/api/maintenance': {
    if (typeof body.on !== 'boolean') { json(res, 400, { error: 'On or off?' }); return true; }
    const state = ctx.maintenance.set({ on: body.on, text: line(body.text, 140), by: who });
    did(state.on ? 'maintenance on' : 'maintenance off', state.on ? state.text : '');
    json(res, 200, { ok: true, maintenance: state }); return true;
   }
   case '/admin/api/keys/add': {
    const made = admins.add(line(body.name, 40));
    did('add admin key', made.name);
    json(res, 200, { ok: true, name: made.name, key: made.key }); return true;
   }
   case '/admin/api/keys/remove': {
    const name = line(body.name, 40), ok = admins.remove(name);
    if (ok) did('remove admin key', name);
    json(res, ok ? 200 : 404, ok ? { ok } : { error: 'Nobody has that name.' }); return true;
   }
   case '/admin/api/devcode': {
    const value = typeof body.code === 'string' ? body.code.trim() : '';
    if (!DEV_CODE_PATTERN.test(value)) { json(res, 400, { error: 'Use 4 to 32 letters or digits.' }); return true; }
    const status = await ctx.devcode.set(value, 'owner');
    ctx.adminLog?.add(who, 'dev code changed', '');
    log.log(new Date().toISOString(), 'dev code changed by owner');
    json(res, 200, { ok: true, devcode: status }); return true;
   }
   case '/admin/api/restart': {
    const ok = ctx.restart();
    if (ok) did('restart server');
    json(res, ok ? 200 : 409, ok ? { ok } : { error: 'Already restarting.' }); return true;
   }
  }
  json(res, 404, { error: 'No such call.' }); return true;
 } catch (error) { json(res, 400, { error: error.message || 'Bad request.' }); return true; }
}
