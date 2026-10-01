// What the server knows about each player while it runs, for the admin
// page's player sheet (in memory only; a restart starts it over).
//
// Two levels:
//  - a connection (one page load): when it came, the rooms it joined, the
//    matches it played and its kills / deaths / damage added up;
//  - a player id (src/net/player-id.js, one browser): every connection of
//    that id since the server started, the names it used, its recent rooms
//    and what admins did to it (kicks, bans, messages).
// Records are keyed by the player id only through `keyOf`, so accounts can
// replace the key later without touching the rest.
//
// A seat's match numbers live in `seat.stats` (net/arena.js), a fresh object
// every match. A connection keeps a reference to the one it last saw: once
// the arena swaps it out (a new match, a map move), the old object's numbers
// are final and are added to the totals.
const ZERO = () => ({ kills: 0, deaths: 0, dealt: 0, taken: 0 });
const add = (into, s) => { if (!s) return into; into.kills += s.kills || 0; into.deaths += s.deaths || 0; into.dealt += s.dealt || 0; into.taken += s.taken || 0; return into; };
const rounded = s => ({ kills: s.kills, deaths: s.deaths, dealt: Math.round(s.dealt), taken: Math.round(s.taken) });
const RECENT_ROOMS = 8, ACTIONS = 20, NAMES = 6;

export const keyOf = conn => conn.pid || conn.id;

export class PlayerStats {
 constructor({ clock = () => Date.now(), max = 5000 } = {}) {
  Object.assign(this, { clock, max });
  this.players = new Map();
 }

 record(key) {
  let p = this.players.get(key);
  if (!p) {
   if (this.players.size >= this.max) this.prune();
   p = { key, firstSeen: this.clock(), lastSeen: this.clock(), connects: 0, roomsJoined: 0, matches: 0, done: ZERO(), names: [], recentRooms: [], actions: [], live: new Set() };
   this.players.set(key, p);
  }
  return p;
 }

 // The oldest records of players not online go first.
 prune() {
  const gone = [...this.players.values()].filter(p => !p.live.size).sort((a, b) => a.lastSeen - b.lastSeen);
  for (const p of gone.slice(0, Math.max(1, Math.ceil(this.max / 10)))) this.players.delete(p.key);
 }

 // A connection said who it is (its first message).
 connect(conn) {
  const p = this.record(keyOf(conn));
  p.connects++; p.lastSeen = this.clock(); p.live.add(conn);
  conn.track = { at: this.clock(), roomsJoined: 0, matches: new Set(), done: ZERO(), ref: null, pingSum: 0, pingCount: 0, pingAt: 0 };
 }

 // It got into a room.
 joined(conn, room) {
  const p = this.record(keyOf(conn)), t = conn.track; if (!t) return;
  t.roomsJoined++; p.roomsJoined++;
  p.recentRooms.unshift({ code: room.code, name: room.name || null, map: room.mapId, mode: room.session?.arena.mode || null, at: this.clock() });
  p.recentRooms.length = Math.min(p.recentRooms.length, RECENT_ROOMS);
 }

 // Looks at a connection's seat: a new match's stats object, the name, the ping.
 sample(conn, room = conn.room) {
  const t = conn.track; if (!t || !room) return;
  const session = room.session, seat = conn.generation === room.generation ? session.arena.seats.get(conn.id) : null;
  if (seat) {
   if (seat.stats !== t.ref) { add(t.done, t.ref); t.ref = seat.stats; }
   const arena = session.arena;
   if (arena.matchNumber > 0 && (arena.phase === 'playing' || arena.phase === 'results') && !seat.bench) {
    const key = room.code + ':' + room.generation + ':' + arena.matchNumber;
    if (!t.matches.has(key)) { t.matches.add(key); this.record(keyOf(conn)).matches++; }
   }
  }
  const remote = conn.generation === room.generation ? session.remotes.get(conn.id) : null;
  if (remote?.name) this.named(conn, remote.name);
  const now = this.clock();
  if (remote && remote.ping !== null && now - t.pingAt >= 1000) { t.pingAt = now; t.pingSum += remote.ping; t.pingCount++; }
 }

 named(conn, name) {
  const p = this.record(keyOf(conn));
  if (p.names[0] === name) return;
  p.names = [name, ...p.names.filter(n => n !== name)].slice(0, NAMES);
 }

 sampleRooms(rooms) { for (const room of rooms) for (const conn of room.conns.values()) this.sample(conn, room); }

 // The connection closed: its numbers go into the player's totals.
 end(conn) {
  const t = conn.track; if (!t || t.ended) return;
  if (conn.room) this.sample(conn);
  t.ended = true; add(t.done, t.ref); t.ref = null;
  const p = this.record(keyOf(conn));
  add(p.done, t.done); p.live.delete(conn); p.lastSeen = this.clock();
 }

 // An admin did something to this player (kick, ban, a private message).
 action(conn, what, { by = '', detail = '' } = {}) {
  const p = this.record(keyOf(conn));
  p.actions.unshift({ at: this.clock(), what: String(what), by: String(by).slice(0, 24), detail: String(detail).slice(0, 200), room: conn.room?.code || null });
  p.actions.length = Math.min(p.actions.length, ACTIONS);
 }

 // This connection's totals: its finished matches plus the one going on.
 connectionTotals(conn) {
  const t = conn.track; if (!t) return null;
  return { roomsJoined: t.roomsJoined, matches: t.matches.size, ...rounded(add(add(ZERO(), t.done), t.ended ? null : t.ref)) };
 }

 // Everything kept for a player id (live connections included).
 player(key) {
  const p = this.players.get(key); if (!p) return null;
  const total = add(ZERO(), p.done);
  for (const conn of p.live) { const t = conn.track; if (t) add(add(total, t.done), t.ref); }
  return { key, firstSeen: p.firstSeen, lastSeen: p.live.size ? this.clock() : p.lastSeen, online: p.live.size, connects: p.connects, roomsJoined: p.roomsJoined, matches: p.matches, ...rounded(total), names: [...p.names], recentRooms: p.recentRooms.map(r => ({ ...r })), actions: p.actions.map(a => ({ ...a })) };
 }

 pingAverage(conn) { const t = conn.track; return t?.pingCount ? Math.round(t.pingSum / t.pingCount) : null; }
}
