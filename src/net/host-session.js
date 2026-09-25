// The host's side of a multiplayer game. The host is the authority: it runs
// every player's simulation in one shared world (net/arena.js) and tells
// each joiner what happened.
//
// The host's own player is the ordinary local Simulation that main.js steps:
// main.js calls beforeLocal() and then steps it, and step() then runs
// everyone else, the world and the match clock, and sends snapshots.
//
// Nothing in here touches the DOM, three.js or the wire directly, so it runs
// the same in tests (with the loopback transport) and, later, on a dedicated
// server (with a WebSocket transport and no local player).
import { NETWORK } from '../config/network.js';
import { PROTOCOL_VERSION, playerInput, playerState, readMessage, loadout, packEvent } from './protocol.js';
import { Arena, SPAWN_MODES, SETTINGS } from './arena.js';
import { pack } from './projectiles.js';

// Seconds between our own ticks that count as us being frozen, not them.
const STALL = 1;

const IDLE = Object.freeze(playerInput({}));
// Events that other screens need to see. Everything else stays with its sim.
export const SHARED_EVENTS = new Set(['explosion', 'grenadeExplosion', 'propBreak', 'propHit', 'propRestore', 'impactMark', 'rifleImpact',
 'rifleShot', 'shotgunShot', 'launch', 'sprayArc', 'hexPulse', 'hexZap', 'hexFizzle', 'pointImpact', 'wall', 'trailEnd', 'hit', 'kill',
 'cropDust', 'cropAsh', 'syphon', 'surgeCharge', 'surgeStart', 'surgeEnd', 'scatterArm', 'scatterPrimed', 'scatterFire', 'scatterSplit', 'scatterHit', 'scatterBurst', 'dodge', 'seed', 'playerDeath', 'playerDamage', 'outgoingDamage', 'rifleReloaded', 'shotgunReload', 'grenadeThrow', 'sprayStart',
 'hexBlock', 'mapReset', 'matchStart', 'matchEnd', 'roundEnd', 'respawn']);
// Seconds between pings to each joiner (their round trip shows in the lobby
// and on the scoreboard).
const PING_EVERY = 1;
// Events only kept for a few seconds: a client that has not caught up by then
// has missed them for good (it would be too late to show them anyway).
const EVENT_KEEP = 180;
// Bytes a snapshot may use (a data-channel message tops out near 16 KB;
// over that it is refused and lost). Events that do not fit wait for the
// next snapshot.
export const WIRE_BUDGET = 15000;
// Events that come every tick while something keeps going (a Static
// stream's damage, its arcs): one per snapshot is plenty, so repeats before
// a snapshot goes out are folded into the waiting one. Before, a stream
// sent ~180 events a second, the unacknowledged backlog outgrew one message
// on a real connection, every snapshot after that was refused, and the
// other players' games froze.
function foldKey(by, e) {
 if (e.type === 'sprayArc') return by + '|arc';
 if (e.type === 'playerDamage') return by + '|pd';
 if (e.type === 'outgoingDamage') return by + '|od|' + e.id + '|' + e.volley;
 if (e.type === 'hit' && e.electric) return by + '|hit|' + e.id + '|' + e.volley;
 return null;
}

export class HostSession {
 constructor({ transport, map, local, createSim, config = NETWORK, name = 'Host', now = () => performance.now() / 1000, random = Math.random, settings, mode = null }) {
  Object.assign(this, { transport, map, local, createSim, config, now });
  this.tick = 0; this.remotes = new Map(); this.ended = null; this.notices = []; this.removed = new Set();
  this.arena = new Arena({ map, createSim, random, settings });
  this.hostSeat = this.arena.addSeat('host', name || 'Host', local);
  this.hostSeat.slot = 0;
  // The mode picked on the host setup page (the lobby can change it).
  if (mode) this.arena.setMode(mode);
  this.log = []; this.eventSeq = 0; this.localEvents = []; this.newFeed = []; this.folds = new Map(); this.sentTick = -1;
  transport.onMessage = (from, data) => this.receive(from, data);
  transport.onLeave = id => this.remove(id, 'left');
  transport.onJoin = () => {};
 }

 get role() { return 'host'; }
 get playerCount() { return 1 + this.remotes.size; }
 get id() { return 'host'; }
 get me() { return this.hostSeat; }

 receive(from, data) {
  const message = readMessage(data);
  if (!message) return;
  if (message.t === 'hello') return this.admit(from, message);
  const remote = this.remotes.get(from);
  if (!remote) return;
  if (message.t === 'pong') {
   // Round trip in milliseconds, smoothed so one slow packet doesn't jump it.
   // A pong alone does not count as being heard: a page that stopped playing
   // (a frozen tab) still answers pings, and must still time out.
   const rtt = Math.max(0, (this.now() - message.s) * 1000);
   remote.ping = remote.ping === null ? rtt : remote.ping + (rtt - remote.ping) * .3;
   return;
  }
  remote.silent = 0; remote.heard = this.now(); remote.loaded = true;
  if (message.t === 'input') {
   remote.ack = Math.max(remote.ack, message.ack || 0);
   // Inputs repeat across messages for safety; keep only the new ones, in order.
   for (const input of message.inputs) if (input.seq > remote.queuedSeq) { remote.queue.push(input); remote.queuedSeq = input.seq; }
   remote.queue.sort((a, b) => a.seq - b.seq);
   // A client that races ahead (or a flood) cannot build an endless backlog.
   if (remote.queue.length > 30) remote.queue.splice(0, remote.queue.length - 30);
  }
  if (message.t === 'choose') this.arena.choose(from, message.weapon, message.go);
  if (message.t === 'pick') this.arena.pickAgain(from);
  if (message.t === 'respawn') this.arena.respawnNow(from);
  if (message.t === 'team') this.arena.chooseTeam(from, message.team);
 }

 admit(id, hello) {
  if (this.remotes.has(id)) return;
  // Someone the host removed stays out for the rest of this room.
  if (this.removed.has(id)) return this.transport.send(id, { t: 'removed', reason: 'The host removed you from the game.' });
  if (hello.version !== PROTOCOL_VERSION) return this.transport.send(id, { t: 'full', reason: 'This game is running a different version. Reload the page on both devices.' });
  if (this.playerCount >= this.config.maxPlayers) return this.transport.send(id, { t: 'full', reason: 'That game is full.' });
  // Robots make room for a player (one filling a seat first).
  if (this.arena.seats.size >= this.config.maxPlayers) { const bot = this.robotSeats().find(s => s.robot.auto) || this.robotSeats()[0]; if (bot) this.removeRobot(bot.id); }
  const used = new Set([0, ...[...this.remotes.values()].map(r => r.slot)]);
  let slot = 1; while (used.has(slot)) slot++;
  // Names are unique in a room: a second "Sam" plays as "Sam 2".
  const taken = new Set([this.hostSeat.name, ...[...this.remotes.values()].map(r => r.seat.name)].map(n => n.toLowerCase()));
  let name = hello.name || 'Player ' + (slot + 1), suffix = 2;
  while (taken.has(name.toLowerCase())) name = (hello.name || 'Player') + ' ' + suffix++;
  const seat = this.arena.addSeat(id, name);
  seat.slot = slot;
  const remote = { id, seat, sim: seat.sim, slot, name, ping: null, pingAt: 0, queue: [], queuedSeq: 0, lastSeq: 0, last: IDLE, silent: 0, heard: this.now(), ack: this.eventSeq, previous: { ...seat.sim.player } };
  this.remotes.set(id, remote);
  this.transport.send(id, { t: 'welcome', id, slot, name, tick: this.tick, map: this.map.id, players: this.states(), world: this.worldState() });
  this.notices.push(name + ' joined');
 }

 // The host takes a player out of the game. They are told why, and cannot
 // come back into this room.
 kick(id) {
  if (this.arena.seats.get(id)?.robot) { this.removeRobot(id); return true; }
  const remote = this.remotes.get(id);
  if (!remote) return false;
  this.removed.add(id);
  this.transport.send(id, { t: 'removed', reason: 'The host removed you from the game.' });
  this.remove(id, 'removed');
  return true;
 }

 // The side to show in the lobby: the one picked while in the lobby, the
 // one dealt during a round.
 shownTeam(seat) { return this.arena.phase === 'lobby' ? this.arena.wantedTeam(seat) : seat.team; }

 // Robots (arena-robots.js): the host's + ROBOT and REMOVE.
 robotSeats() { return [...this.arena.seats.values()].filter(s => s.robot); }
 addRobot() {
  if (this.arena.seats.size >= this.config.maxPlayers) return null;
  const seat = this.arena.addRobot(); if (seat) { seat.previous = { ...seat.sim.player }; this.notices.push(seat.name + ' joined'); }
  return seat;
 }
 // TUNE (one robot's weapon, skill, aim, temper) and APPLY TO ALL (every
 // robot, and the ones added after).
 tuneRobot(id, setup) { return this.arena.robots.tune(this.arena.seats.get(id), setup); }
 tuneAllRobots(setup) { return this.arena.robots.tuneAll(setup); }
 removeRobot(id) { const seat = this.arena.seats.get(id); if (!this.arena.removeRobot(id)) return false; this.transport.broadcast({ t: 'leave', id }); this.notices.push(seat.name + ' left'); return true; }

 // Who else is here, for the host's player list.
 players() { return [...this.remotes.values()].map(r => ({ id: r.id, name: r.name })); }

 // Everyone in the room, for the lobby (all players see it; only the host's
 // screen shows the controls): name, slot (their colour), round trip, host.
 lobby() {
  const ping = r => (r.ping === null ? null : Math.round(r.ping));
  return {
   players: [{ id: 'host', name: this.hostSeat.name, slot: 0, ping: 0, host: true, present: this.hostSeat.present, team: this.shownTeam(this.hostSeat) },
    ...[...this.remotes.values()].map(r => ({ id: r.id, name: r.name, slot: r.slot, ping: ping(r), host: false, present: r.seat.present, team: this.shownTeam(r.seat) })),
    ...this.robotSeats().map(s => ({ id: s.id, name: s.name, slot: s.slot, ping: null, host: false, robot: true, auto: !!s.robot.auto, setup: { ...s.robot.setup }, present: s.present, team: this.arena.phase === 'lobby' ? null : s.team }))],
   spawnMode: this.arena.settings.spawnMode, settings: { ...this.arena.settings }, robotSetup: { ...this.arena.robotSetup }, mode: this.arena.mode, map: this.arena.mapId, phase: this.arena.phase,
  };
 }

 // Host lobby controls.
 setSpawnMode(mode) { return SPAWN_MODES.includes(mode) && this.arena.setSpawnMode(mode); }
 // Robots unticked in the lobby (v147): the robots already added go too.
 setSetting(key, value) {
  const ok = !!SETTINGS[key] && this.arena.setSetting(key, value);
  if (ok && key === 'robots' && value === 'off' && this.arena.phase === 'lobby') for (const seat of this.robotSeats()) this.removeRobot(seat.id);
  return ok;
 }
 resetMap() { this.arena.resetWorld(); }
 setMode(mode) { return this.arena.setMode(mode); }
 startRound(mode) { return this.arena.startRound(mode); }
 get startError() { return this.arena.startError; }
 endRound() { this.arena.endRound(); }
 restartMatch() { return this.arena.newMatch(); }
 match() { return this.arena.matchState(); }

 remove(id, why) {
  const remote = this.remotes.get(id);
  if (!remote) return;
  this.remotes.delete(id); this.arena.removeSeat(id);
  this.transport.broadcast({ t: 'leave', id });
  this.notices.push(remote.name + (why === 'timeout' ? ' lost connection' : why === 'removed' ? ' was removed' : ' left'));
 }

 // The host's own weapon pick (go: into the world now), picking again after
 // dying, and practice's instant respawn.
 choose(weapon, go = true) { return this.arena.choose('host', weapon, go); }
 pickAgain() { return this.arena.pickAgain('host'); }
 respawnNow() { return this.arena.respawnNow('host'); }
 chooseTeam(team) { return this.arena.chooseTeam('host', team); }
 toMenu() { this.arena.leaveWorld('host'); }

 // Called by main.js right before it steps the host's own sim this tick,
 // with the host's raw input; returns what that sim should run.
 beforeLocal(raw) {
  this.arena.before(this.hostSeat);
  return this.arena.inputFor(this.hostSeat, playerInput(raw));
 }

 // One 60 Hz tick, run right after the host's own player has stepped.
 step() {
  this.tick++;
  // A stall on our side (the page busy loading, a hidden window) is not the
  // others going quiet: their messages are waiting in the queue. Forgive it.
  const t = this.now(), gap = this.lastStep === undefined ? 0 : t - this.lastStep; this.lastStep = t;
  if (gap > STALL) for (const remote of this.remotes.values()) remote.heard += Math.min(gap, Math.max(0, t - remote.heard));
  // The host's own sim keeps its dev settings: dev tools are host-only online.
  this.arena.after(this.hostSeat);
  const hostMark = this.hostSeat.mark;
  this.arena.robots.hear('host', this.local.events.slice(hostMark));
  for (const remote of [...this.remotes.values()]) {
   remote.previous = { ...remote.sim.player };
   // Normally one input per tick. A backlog (a burst after a network hiccup)
   // is worked off a few at a time rather than all at once.
   const runs = remote.queue.length > 6 ? Math.min(this.config.maxCatchUp, remote.queue.length - 3) : 1;
   for (let i = 0; i < runs; i++) {
    const input = remote.queue.shift();
    if (input) { remote.last = input; remote.lastSeq = input.seq; }
    // No input this tick: keep walking the way they were for a moment (a late
    // packet), never repeating a press; a longer silence means stand still.
    const held = remote.silent < .25 ? { ...playerInput({ ...remote.last }), dodge: false, launch: false, tapFire: false, grenade: false, doubleShot: false, reload: false, hex: false, surge: false, scatter: false, quickShot: false } : IDLE;
    remote.sim.dev = { speed: 1 };
    this.arena.stepSeat(remote.seat, input || held);
    const events = remote.sim.drainEvents();
    this.arena.robots.hear(remote.id, events);
    this.record(remote.id, events);
   }
   remote.silent += 1 / 60;
   if (t - remote.pingAt >= PING_EVERY) { remote.pingAt = t; this.transport.send(remote.id, { t: 'ping', s: t }); }
   // Real seconds, not ticks: a host running slow must not drop players early.
   // A joiner still building the world (seconds on a phone) sends nothing yet.
   if (this.now() - remote.heard > (remote.loaded ? this.config.timeout : this.config.loadGrace)) this.remove(remote.id, 'timeout');
  }
  // Robots: each its brain's input, stepped like a joiner's seat.
  const robots = this.robotSeats();
  if (robots.length) {
   this.arena.robots.beginTick(this.arena.time);
   for (const seat of robots) {
    seat.previous = { ...seat.sim.player };
    const input = this.arena.robots.input(seat, 1 / 60) || IDLE;
    seat.sim.dev = { speed: 1 };
    this.arena.stepSeat(seat, input);
    const events = seat.sim.drainEvents();
    this.arena.robots.hear(seat.id, events);
    this.record(seat.id, events);
   }
  }
  // The host's own events, including damage the others did to it just now
  // (main.js drains the sim after this).
  this.record('host', this.local.events.slice(hostMark));
  this.newFeed.push(...this.arena.endTick());
  // Seats the rules took out (a robot stepping aside, spare robots): everyone is told.
  for (const id of this.arena.leaves.splice(0)) this.transport.broadcast({ t: 'leave', id });
  this.record('world', this.arena.worldEvents || []);
  // Damage the others did to the host this tick lands in the host's own sim
  // after its step; main.js drains it with the rest.
  if (this.tick % this.config.snapshotEvery === 0) this.sendSnapshots();
 }

 // Keeps what other screens should see, numbered, for resending.
 // The host's own screen gets every event as it happened; the wire gets
 // them packed (protocol.js packEvent) and folded (foldKey).
 record(by, events) {
  for (const e of events) {
   if (!SHARED_EVENTS.has(e.type)) continue;
   const s = ++this.eventSeq;
   if (by !== 'host') this.localEvents.push({ s, by, tick: this.tick, e });
   const key = foldKey(by, e), waiting = key && this.folds.get(key);
   if (waiting && waiting.tick > this.sentTick) {
    if (e.type === 'sprayArc') waiting.e = packEvent(e);
    else { const damage = waiting.e.damage + (e.damage || 0); waiting.e = packEvent({ ...e, damage }); }
    continue;
   }
   const entry = { s, by, tick: this.tick, e: packEvent(e) };
   this.log.push(entry);
   if (key) this.folds.set(key, entry);
  }
  while (this.log.length && this.log[0].tick < this.tick - EVENT_KEEP) this.log.shift();
 }

 // What the host's own screen should show from everyone else this frame.
 drainRemoteEvents() { return this.localEvents.splice(0); }

 sendSnapshots() {
  const players = this.states(), proj = this.projectiles();
  const slow = this.tick % (this.config.snapshotEvery * 10) === 0;
  const feed = this.arena.feed.slice(-8), board = slow ? this.scoreboard() : null, world = slow ? this.worldState() : undefined;
  const match = this.match(), lobby = slow ? this.lobby() : undefined;
  // Practice targets move and break: every snapshot, compact.
  const targets = this.arena.targets.length ? this.arena.targets.map(t => [t.id, Math.round(t.x * 100) / 100, Math.round(t.z * 100) / 100, Math.round(t.hp), Math.round((t.flash || 0) * 100) / 100]) : null;
  this.sentTick = this.tick; this.folds.clear();
  for (const remote of this.remotes.values()) {
   const snapshot = { t: 'snapshot', tick: this.tick, players, you: { ...loadout(remote.sim), life: remote.seat.life, present: remote.seat.present, dead: remote.seat.dead, respawnIn: remote.seat.respawnIn,
     weapon: remote.seat.weapon, picking: pickState(remote.seat.picking) },
    proj, ev: [], feed, board, world, match, lobby, targets };
   // As many waiting events, oldest first, as fit the message (WIRE_BUDGET).
   // (One too big for any message is skipped, not left to block the rest.)
   const space = WIRE_BUDGET - JSON.stringify(snapshot).length;
   let room = space;
   for (const entry of this.log) {
    if (entry.s <= remote.ack) continue;
    const size = entry.bytes ??= JSON.stringify(entry).length + 1;
    if (size > space) continue;
    if (size > room || snapshot.ev.length >= 240) break;
    snapshot.ev.push(entry); room -= size;
   }
   this.transport.send(remote.id, snapshot);
  }
 }

 // Broken props and crop fires, for joiners to match.
 worldState() {
  const w = this.arena.world;
  return { broken: w.props.filter(p => p.hp === 0).map(p => p.id), crops: w.crops.map(c => [c.state, Math.round((c.burnAge || 0) * 100) / 100, c.scorch || 0]) };
 }

 projectiles() {
  const out = {};
  for (const seat of this.arena.seats.values()) if (seat.present) out[seat.slot] = pack(seat.sim);
  return out;
 }

 // The host draws remote players' shots from their sims directly.
 remoteProjectiles() {
  const out = {};
  for (const seat of this.arena.seats.values()) if (seat.present && seat !== this.hostSeat) out[seat.slot] = pack(seat.sim);
  return out;
 }

 seatState(seat, lastSeq = 0) {
  return { ...playerState(seat.id, seat.sim.player, lastSeq), name: seat.name, slot: seat.slot, weapon: seat.weapon, present: seat.present, dead: seat.dead, life: seat.life, team: seat.team, robot: seat.robot ? 1 : 0 };
 }

 states() {
  return [this.seatState(this.hostSeat), ...[...this.remotes.values()].map(r => this.seatState(r.seat, r.lastSeq)), ...this.robotSeats().map(s => this.seatState(s))];
 }

 // What the renderer draws for everyone but the host: the host steps these
 // sims on the same clock as its own, so they blend with the same alpha.
 others(alpha = 1) {
  const list = [...this.remotes.values()].filter(r => r.seat.present && !r.seat.dead)
   .map(r => ({ ...blend(r.id, r.name, r.previous, r.sim.player, alpha), weapon: r.seat.weapon, slot: r.slot, team: r.seat.team, hp: r.sim.player.hp, maxHp: r.sim.player.maxHp }));
  for (const s of this.robotSeats()) if (s.present && !s.dead) list.push({ ...blend(s.id, s.name, s.previous || s.sim.player, s.sim.player, alpha), weapon: s.weapon, slot: s.slot, team: s.team, robot: true, hp: s.sim.player.hp, maxHp: s.sim.player.maxHp });
  return list;
 }

 // The arena's standings plus each player's round trip.
 scoreboard() {
  const pings = new Map(this.lobby().players.map(p => [p.id, p.ping]));
  return this.arena.scoreboard().map(row => ({ ...row, ping: pings.get(row.id) ?? null, slot: this.arena.seats.get(row.id)?.slot ?? 0 }));
 }
 feed() { return this.arena.feed; }
 drainFeed() { return this.newFeed.splice(0); }
 drainNotices() { return this.notices.splice(0); }
 close() { this.transport.close(); this.remotes.clear(); }
}

// A player's weapon pick as the screens need it: seconds left, what is picked.
export const pickState = picking => (picking ? { left: Math.max(0, Math.round(picking.left * 10) / 10), weapon: picking.weapon, go: !!picking.go } : null);

export function blend(id, name, a, b, alpha) {
 const angleA = Math.atan2(a.aimZ, a.aimX), angleB = Math.atan2(b.aimZ, b.aimX);
 const turn = Math.atan2(Math.sin(angleB - angleA), Math.cos(angleB - angleA)), angle = angleA + turn * alpha;
 return {
  id, name,
  x: a.x + (b.x - a.x) * alpha, z: a.z + (b.z - a.z) * alpha,
  vx: b.vx, vz: b.vz, aimX: Math.cos(angle), aimZ: Math.sin(angle), dodgeRemaining: b.dodgeRemaining || 0,
 };
}
