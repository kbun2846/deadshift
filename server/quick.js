// QUICK PLAY's matchmaking on the game server (owner, 2026-10-01: "Make it so
// that it loads into an online multiplayer match if there's another person
// waiting for quickplay, if not just load the player into a bot fight").
//
// How it works (AGENTS.md > Multiplayer > Quick play):
//  - A page asks with its first message { t:'quick', pid, version, name }
//    on the ordinary /play socket. That socket never enters a room: it is a
//    matchmaking line only, and the page joins a match with a second socket
//    ({ t:'join', code }), exactly as a JOIN by code does.
//  - A quick room already going that still takes people (`joinable`: in its
//    lobby or the first QUICK.lateJoin seconds of a match, a seat free): the
//    page is told { t:'match', code, map, mode } at once and the line closes.
//  - Nobody's room, but someone is waiting: a new quick room is made (FFA on
//    a random map of the map vote's pool), the new page gets `match`, and so
//    does everyone waiting (an offer: their page is in its bot fight and asks
//    "PLAYER FOUND · JOIN?"). They stay in the queue until they take it,
//    leave, or the room stops taking people (then they are told { t:'queued' }
//    again and can be matched with the next one).
//  - Nobody at all: { t:'queued', waiting } and the page plays its bot fight
//    while it waits; the line stays open (the server drops it after
//    QUICK.maxWait, the page gives up sooner: src/quick-play.js).
// A quick room is a room like HOST's (server/room.js, `quick`) that runs
// itself like a listed one: no leader, the house rules, a countdown, the
// next match after the results. It is not on the JOIN list.
export const QUICK = Object.freeze({
 // The mode a quick room plays.
 mode: 'ffa',
 // A quick room still takes new quick players this many seconds into a match.
 lateJoin: 60,
 // A seat promised to a matched page is held this long for it to arrive
 // (a page on another map reloads first).
 hold: 25,
 // The server lets a waiting page go after this long (the page leaves sooner).
 maxWait: 600,
 // Quick play requests a minute from one address (re-queueing after every
 // match included; HOST's is 6 rooms a minute, but one address may be a
 // whole school pressing QUICK PLAY together).
 perMinutePerIp: 30,
 // At most this many quick rooms at once (beyond that, everyone plays bots).
 maxRooms: 30,
});

export class QuickQueue {
 constructor({ rooms, now = () => performance.now() / 1000, random = Math.random, settings = QUICK }) {
  Object.assign(this, { rooms, now, random, settings });
  // Waiting pages: connection id -> { conn, since, offered (a room code or null) }.
  this.waiting = new Map();
 }

 get size() { return this.waiting.size; }

 // Can a quick player (`pid`: this one) still be sent to this room?
 // (Not one the admin page removed them from.)
 joinable(room, pid = null) {
  if (!room?.quick || room.closed || !this.rooms.rooms.has(room.code)) return false;
  if (pid && room.removedPids.has(pid)) return false;
  if (room.humanCount + room.held(this.now()) >= room.capacity) return false;
  const phase = room.session.arena.phase;
  if (phase === 'lobby') return true;
  return phase === 'playing' && room.playingSince != null && this.now() - room.playingSince < this.settings.lateJoin;
 }

 // The quick room a new quick player goes to: the fullest one still taking people.
 open(pid = null) {
  let best = null;
  for (const room of this.rooms.rooms.values()) if (this.joinable(room, pid) && (!best || room.humanCount > best.humanCount)) best = room;
  return best;
 }

 // Tell a page where its match is (and hold its seat there).
 send(conn, room) {
  room.hold(conn.pid, this.now() + this.settings.hold);
  conn.send({ t: 'match', code: room.code, map: room.mapId, mode: room.session.arena.mode });
 }

 // A page's quick play request (bans, versions, maintenance and the rate
 // limit are checked before: index.js). Returns 'matched' or 'queued'.
 request(conn) {
  let room = this.open(conn.pid);
  const others = [...this.waiting.values()].filter(w => w.conn.pid !== conn.pid && !w.offered);
  if (!room && others.length) {
   const made = this.rooms.createQuick({ mode: this.settings.mode, random: this.random, max: this.settings.maxRooms });
   room = made.room || null;
  }
  if (room) {
   this.send(conn, room);
   // Everyone waiting (not yet offered a room) is offered this one, while seats last.
   this.offerAll(room);
   return 'matched';
  }
  this.waiting.set(conn.id, { conn, since: this.now(), offered: null });
  conn.send({ t: 'queued', waiting: this.waiting.size });
  return 'queued';
 }

 offerAll(room) {
  for (const w of this.waiting.values()) {
   if (w.offered || !this.joinable(room, w.conn.pid)) continue;
   w.offered = room.code; this.send(w.conn, room);
  }
 }

 // The page left the queue (took a match, went to the menu, closed).
 leave(conn) { this.waiting.delete(conn.id); }

 // Twice a second (rooms.js balance): pages waiting too long go; an offer
 // whose room stopped taking people is withdrawn (the page hears `queued`
 // and is matched with the next player); a quick room still taking people
 // is offered to anyone waiting without an offer.
 step() {
  const t = this.now();
  for (const [id, w] of this.waiting) {
   if (t - w.since > this.settings.maxWait) { this.waiting.delete(id); w.conn.close(4007, 'quick play wait over'); continue; }
   if (w.offered && !this.joinable(this.rooms.find(w.offered))) { w.offered = null; w.conn.send({ t: 'queued', waiting: this.waiting.size }); }
  }
  const room = this.open();
  if (room && [...this.waiting.values()].some(w => !w.offered)) this.offerAll(room);
 }

 // For the admin page: who is waiting, and for how long.
 adminState() {
  const t = this.now();
  return [...this.waiting.values()].map(w => ({ id: w.conn.id, name: w.conn.name || '', pid: w.conn.pid, ip: w.conn.ip, waiting: Math.round(t - w.since), offered: w.offered }));
 }
}
