// One room on the game server: a match that runs here, not in a player's
// browser. It is the same HostSession a player's page runs when it hosts
// (src/net/host-session.js), with no local player: every player joins it,
// and the server steps it 60 times a second.
//
// What the server adds on top:
//  - Connections (`conn`, see index.js): each is one player's WebSocket,
//    with an id the session uses as the player's id.
//  - A leader. Nobody hosts, so one player has the host's lobby controls:
//    mode, map, settings, START, robots (and, in a player-made room, REMOVE).
//    It is the player who made the room while they are in it, else whoever
//    has been in longest. Those controls arrive as `lead` messages.
//  - Moving to another map (the lobby's map picker): everyone is told to
//    reload onto it (HostSession.moveMap) and the room opens a fresh session
//    there with the same code, mode, settings and added robots. Connections
//    from before the move are stale: they are ignored until they close.
//  - The map vote (HostSession.startVoting): when it picks another map
//    (`pendingMove`), the room moves there as above and starts the round by
//    itself once everyone is back (or after WAIT_BACK seconds).
//  - Listed rooms (`isPublic`: the JOIN page's list, rooms.js): one map and
//    mode each, fixed. Nobody leads: a round starts by itself AUTO_START
//    seconds after the first player is in, robots always fill the seats, and
//    after a match the next one starts by itself (RESULTS_GAP). They go back
//    to a fresh match a while after the last player leaves. Players can't be
//    removed there except by the owner's admin page.
//  - A connection counts once the session has let it in (`admitted`, right
//    after its hello). One that never gets that far is closed after ADMIT
//    seconds, and never leads: silent sockets cannot hold a room full.
import { HostSession } from '../src/net/host-session.js';
import { Simulation } from '../src/simulation.js';
import { multiplayerMaps } from '../src/maps.js';
import { SETTINGS, modeById, defaultSettings, cleanSettings } from '../src/config/match.js';
import { PROTOCOL_VERSION } from '../src/net/protocol.js';
import { NETWORK } from '../src/config/network.js';

// A map a server room may be on: a released multiplayer map.
export const serverMap = id => multiplayerMaps().find(m => m.id === id) || null;
const createSim = map => new Simulation(map);
// A stale connection (from before a map move) is closed after this long.
const STALE = 15;
// Seconds a new connection has to be let in (its hello comes at once).
const ADMIT = 10;
// The leader's controls: at most this many a second, and a map reset or a
// restart at most once a second (each rebuilds the world: ~10 ms).
const LEADS_PER_SECOND = 8, HEAVY_GAP = 1;
// A map move (the picker's or the vote's) at most once every this many
// seconds per room: each builds a new world, and a leader reconnecting could
// otherwise move it every tick and stall every room on the server.
export const MOVE_GAP = 5;
// Listed rooms: seconds from the first player in to the round starting, and
// from a match's end to the next one (unless everyone presses READY first).
export const AUTO_START = 8, RESULTS_GAP = 15;
// After a vote moves the room: the round starts when everyone is back, or
// after this long.
const WAIT_BACK = 20;

export class Room {
 constructor({ code, name = null, isPublic = false, map, mode = 'ffa', settings = null, ownerPid = null, config, now = () => performance.now() / 1000 }) {
  Object.assign(this, { code, name, isPublic, config, now, ownerPid });
  this.home = { map, mode };
  // How many people fit: the listed room's mode's seats (1V1: 2), else 8.
  this.capacity = isPublic ? (modeById(mode)?.size || NETWORK.maxPlayers) : NETWORK.maxPlayers;
  this.conns = new Map(); this.generation = 0; this.leaderId = null; this.removedPids = new Set();
  this.emptySince = now(); this.createdAt = now();
  this.open(map, mode, settings);
  // Nobody has played in it yet: nothing to reset when it sits empty.
  this.fresh = true;
 }

 // A fresh match on `mapId` (the room's first, a reset, or a map move).
 open(mapId, mode, settings, robots = []) {
  const map = serverMap(mapId) || serverMap(this.home.map);
  this.mapId = map.id;
  const room = this, generation = this.generation;
  this.transport = {
   role: 'host', id: 'host', code: this.code,
   onMessage() {}, onJoin() {}, onLeave() {}, onError() {},
   send(to, message) { room.deliver(to, message); },
   broadcast(message) { for (const conn of room.conns.values()) if (conn.generation === generation) room.deliver(conn.id, message); },
   close() {},
  };
  const clean = cleanSettings(settings || {});
  // Listed rooms play the house rules: every developer row at its default,
  // and robots always fill the seats (owner: the robots switch "doesnt apply
  // to the server list").
  if (this.isPublic) { const base = defaultSettings(); for (const key of Object.keys(SETTINGS)) if (SETTINGS[key].dev) clean[key] = base[key]; clean.robots = 'fill'; }
  this.session = new HostSession({ transport: this.transport, map, local: null, createSim, now: this.now, settings: clean, mode: modeById(mode)?.id || 'ffa' });
  this.session.leader = this.leaderId;
  this.session.lobbyExtra = this.isPublic ? { listed: true, startsIn: null, capacity: this.capacity } : {};
  this.autoAt = null; this.resultsSince = null;
  for (const setup of robots) { const seat = this.session.addRobot(); if (seat) this.session.tuneRobot(seat.id, setup); }
 }

 // Back to the room's own map and mode (an always-open room, empty a while).
 reset() {
  this.generation++;
  this.open(this.home.map, this.home.mode, null);
  this.fresh = true;
 }

 get players() { return [...this.conns.values()].filter(c => c.generation === this.generation); }
 get humanCount() { return this.players.length; }

 // What the JOIN page's list shows.
 info() {
  const lobby = this.session.lobby(), robots = lobby.players.filter(p => p.robot).length;
  return { code: this.code, name: this.name, public: this.isPublic, map: this.mapId, mapName: serverMap(this.mapId)?.name || this.mapId, mode: this.session.arena.mode, modeName: modeById(this.session.arena.mode)?.name || '', phase: this.session.arena.phase, players: this.humanCount, robots, max: this.capacity };
 }

 // What a player's page needs to know about the room (sent on joining and
 // whenever the leader changes).
 roomMessage(conn) {
  return { t: 'room', code: this.code, name: this.name, public: this.isPublic, map: this.mapId, id: conn.id, lead: conn.id === this.leaderId };
 }

 // Can this player come in? (null: yes; else the reason.)
 refuse(conn) {
  if (this.removedPids.has(conn.pid)) return 'You were removed from this game.';
  if (this.humanCount >= this.capacity) return 'That game is full.';
  return null;
 }

 join(conn) {
  conn.generation = this.generation; conn.room = this; conn.joinedAt = this.now();
  this.conns.set(conn.id, conn);
  this.fresh = false; this.emptySince = null;
  this.transport.onJoin(conn.id);
  this.chooseLeader(true);
  conn.send(this.roomMessage(conn));
 }

 leave(conn) {
  if (!this.conns.has(conn.id)) return;
  this.conns.delete(conn.id);
  if (conn.generation === this.generation) this.transport.onLeave(conn.id);
  if (!this.humanCount && this.emptySince === null) this.emptySince = this.now();
  this.chooseLeader();
 }

 // The leader: the room's maker while they are here, else whoever has been
 // here longest. Everyone hears when it changes.
 chooseLeader(force = false) {
  // (A listed room has no leader: it runs itself.)
  const here = this.isPublic ? [] : this.players.filter(c => c.admitted).sort((a, b) => a.joinedAt - b.joinedAt);
  const next = (this.ownerPid && here.find(c => c.pid === this.ownerPid)) || here[0] || null, id = next?.id || null;
  if (id === this.leaderId && !force) return;
  const changed = id !== this.leaderId;
  this.leaderId = id; this.session.leader = id; this.session.lobbyDirty = true;
  if (changed) for (const conn of this.players) conn.send(this.roomMessage(conn));
 }

 deliver(to, message) {
  const conn = this.conns.get(to);
  if (!conn) return;
  // A backed-up link skips a snapshot rather than queueing it: the next one,
  // a twentieth of a second later, replaces it.
  if (message.t === 'snapshot' && conn.buffered() > this.config.backlogBytes) return;
  conn.send(message);
 }

 receive(conn, message) {
  if (conn.generation !== this.generation) return;
  if (message.t === 'lead') return this.lead(conn, message);
  // (The server speaks for the version: players on an older page are told to reload.)
  if (message.t === 'hello' && message.version !== PROTOCOL_VERSION) return conn.send({ t: 'full', reason: 'The game was just updated. Reload the page to play online.' });
  this.transport.onMessage(conn.id, message);
 }

 note(conn, text) { conn.send({ t: 'note', text: String(text) }); }

 // The leader's lobby controls (the host's, in a player-hosted room).
 lead(conn, m) {
  if (this.isPublic) return this.note(conn, 'This room starts by itself.');
  if (conn.id !== this.leaderId) return this.note(conn, 'Only the host can change that.');
  const t = this.now();
  if (t - (conn.leadWindow ?? -1) >= 1) { conn.leadWindow = t; conn.leads = 0; }
  if (++conn.leads > LEADS_PER_SECOND) return;
  if ((m.op === 'reset' || m.op === 'restart') && t - (this.heavyAt ?? -Infinity) < HEAVY_GAP) return;
  if (m.op === 'reset' || m.op === 'restart') this.heavyAt = t;
  const s = this.session, arena = s.arena;
  // A new START, mode or map from the leader replaces a vote's pending start.
  if (m.op === 'start' || m.op === 'mode' || m.op === 'map') this.pendingStart = null;
  switch (m.op) {
   case 'mode': s.setMode(String(m.mode)); break;
   case 'setting': {
    const key = String(m.key);
    if (!Object.hasOwn(SETTINGS, key)) break;
    if (this.isPublic && SETTINGS[key].dev) { this.note(conn, 'This room plays the house rules.'); break; }
    s.setSetting(key, m.value); break;
   }
   // START: the map vote first (practice starts at once: the host picks its map).
   case 'start': if (!s.startVoting(modeById(m.mode)?.id || arena.mode)) this.note(conn, s.startError || 'Cannot start.'); break;
   case 'vote': break;
   case 'end': s.endRound(); break;
   case 'reset': s.resetMap(); break;
   case 'restart': if (!s.restartMatch()) this.note(conn, s.startError || 'Cannot start.'); break;
   case 'robot': if (!s.addRobot()) this.note(conn, 'The room is full.'); break;
   case 'tune': s.tuneRobot(String(m.id), m.setup || {}); break;
   case 'tuneAll': s.tuneAllRobots(m.setup || {}); break;
   case 'kick': {
    const id = String(m.id);
    if (arena.seats.get(id)?.robot) { s.removeRobot(id); break; }
    // Players: only in a room a player made (the always-open ones are the owner's to police).
    if (this.isPublic) { this.note(conn, 'Only bots can be removed here.'); break; }
    const target = this.conns.get(id);
    if (!target || target === conn || !s.remotes.has(id)) break;
    this.removedPids.add(target.pid);
    s.kick(id);
    break;
   }
   case 'map': if (!this.canMove()) { this.note(conn, 'Wait a moment before moving the room again.'); break; } this.moveMap(String(m.map)); break;
   default: return;
  }
  s.lobbyDirty = true;
 }

 // The lobby's map picker: everyone reloads onto the new map and comes back
 // to the same code; the room keeps its mode, settings and added robots.
 // (`autoStart`: the vote's mode, started once everyone is back.)
 moveMap(id, { autoStart = null } = {}) {
  const map = serverMap(id), s = this.session;
  if (this.isPublic || !map || map.id === this.mapId || s.arena.phase !== 'lobby' || !this.canMove()) return false;
  this.movedAt = this.now();
  const expect = this.players.filter(c => c.admitted).length;
  const lobby = s.lobby(), robots = lobby.players.filter(p => p.robot && !p.auto).map(p => p.setup || {});
  s.moveMap(map.id);
  for (const conn of this.players) conn.staleAt = this.now();
  this.generation++;
  this.open(map.id, lobby.mode, lobby.settings, robots);
  this.pendingStart = autoStart ? { mode: autoStart, expect, until: this.now() + WAIT_BACK } : null;
  this.chooseLeader(true);
  return true;
 }

 canMove() { return this.now() - (this.movedAt ?? -Infinity) >= MOVE_GAP; }
 tellLeader(text) { const lead = this.conns.get(this.leaderId); if (lead) this.note(lead, text || 'Cannot start.'); }

 // The owner's admin page: take a player out (and keep them out of this room).
 kick(id) {
  const conn = this.conns.get(id);
  if (!conn) return false;
  this.removedPids.add(conn.pid);
  if (!this.session.kick(id)) conn.send({ t: 'removed', reason: 'You were removed from the game.' });
  conn.close(4001, 'removed');
  return true;
 }

 // One 60 Hz tick. An empty room does nothing (always-open rooms cost no
 // CPU while nobody plays).
 step() {
  const t = this.now();
  for (const conn of this.conns.values()) if (conn.generation !== this.generation && t - (conn.staleAt ?? t) > STALE) conn.close(4002, 'moved');
  // (Nobody in: a listed room's countdown starts over for the next player.)
  if (!this.humanCount) { if (this.autoAt != null || this.session.lobbyExtra.startsIn != null) { this.autoAt = null; this.session.lobbyExtra.startsIn = null; } return; }
  this.session.step();
  // Only a host page shows these; on the server they would pile up.
  this.session.drainNotices(); this.session.drainFeed();
  // Players the session let go (a timeout, a removal): their sockets go too.
  // A connection never let in (no hello, a wrong version) goes after ADMIT s.
  let admittedNow = false;
  for (const conn of this.players) {
   if (this.session.remotes.has(conn.id)) { if (!conn.admitted) { conn.admitted = true; admittedNow = true; } }
   else if (!conn.closing && (conn.admitted || t - conn.joinedAt > ADMIT)) { conn.closing = true; conn.close(4000, 'left'); }
  }
  if (admittedNow || (!this.leaderId && !this.isPublic)) this.chooseLeader();
  // The vote chose another map: move there, and start once everyone is back.
  // (Too soon after the last move: it waits here until it may.)
  const move = this.session.pendingMove;
  if (move && this.canMove()) {
   this.session.pendingMove = null;
   if (!this.moveMap(move.map, { autoStart: move.mode }) && !this.session.startRound(move.mode)) this.tellLeader(this.session.startError);
   return;
  }
  // A same-map vote that couldn't start the round: the leader is told why.
  if (this.session.voteError) { this.tellLeader(this.session.voteError); this.session.voteError = null; }
  const back = this.pendingStart;
  if (back && !this.session.ballot && (this.players.filter(c => c.admitted).length >= back.expect || t >= back.until)) {
   this.pendingStart = null;
   if (!this.session.startRound(back.mode)) this.tellLeader(this.session.startError);
  }
  if (this.isPublic) this.runItself(t);
 }

 // A listed room: the round starts AUTO_START s after someone is in, and the
 // next match RESULTS_GAP s after one ends.
 runItself(t) {
  const arena = this.session.arena, extra = this.session.lobbyExtra;
  const people = this.players.filter(c => c.admitted).length;
  if (arena.phase === 'lobby' && people) {
   this.autoAt ??= t + AUTO_START;
   const left = Math.max(0, Math.ceil(this.autoAt - t));
   if (extra.startsIn !== left) { extra.startsIn = left; this.session.lobbyDirty = true; }
   if (t >= this.autoAt) { this.autoAt = null; extra.startsIn = null; if (!this.session.startRound(this.home.mode)) this.autoAt = t + AUTO_START; }
  } else { this.autoAt = null; if (extra.startsIn != null) { extra.startsIn = null; this.session.lobbyDirty = true; } }
  if (arena.phase === 'results') { this.resultsSince ??= t; if (t - this.resultsSince > RESULTS_GAP) { this.resultsSince = null; if (!this.session.restartMatch()) this.session.endRound(); } }
  else this.resultsSince = null;
 }

 // For the owner's admin page.
 adminState() {
  const lobby = this.session.lobby(), byId = new Map(lobby.players.map(p => [p.id, p]));
  return { ...this.info(), leader: this.leaderId, players: this.players.map(c => ({ id: c.id, name: byId.get(c.id)?.name || '(joining)', pid: c.pid, ip: c.ip, ping: byId.get(c.id)?.ping ?? null, lead: c.id === this.leaderId, since: Math.round(this.now() - c.joinedAt) })) };
 }

 close() {
  for (const conn of this.conns.values()) conn.close(4004, 'room closed');
  this.conns.clear();
 }
}
