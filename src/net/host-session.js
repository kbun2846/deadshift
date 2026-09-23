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
import { PROTOCOL_VERSION, playerInput, playerState, readMessage, loadout } from './protocol.js';
import { Arena } from './arena.js';
import { pack } from './projectiles.js';

// Seconds between our own ticks that count as us being frozen, not them.
const STALL = 1;

const IDLE = Object.freeze(playerInput({}));
// Events that other screens need to see. Everything else stays with its sim.
export const SHARED_EVENTS = new Set(['explosion', 'grenadeExplosion', 'propBreak', 'propHit', 'propRestore', 'impactMark', 'rifleImpact',
 'rifleShot', 'shotgunShot', 'launch', 'sprayArc', 'hexPulse', 'hexZap', 'hexFizzle', 'pointImpact', 'wall', 'trailEnd', 'hit', 'kill',
 'cropDust', 'cropAsh', 'dodge', 'seed', 'playerDeath', 'playerDamage', 'outgoingDamage', 'rifleReloaded', 'shotgunReload', 'grenadeThrow', 'sprayStart']);
// Events only kept for a few seconds: a client that has not caught up by then
// has missed them for good (it would be too late to show them anyway).
const EVENT_KEEP = 180;

export class HostSession {
 constructor({ transport, map, local, createSim, config = NETWORK, name = 'Host', now = () => performance.now() / 1000, random = Math.random }) {
  Object.assign(this, { transport, map, local, createSim, config, now });
  this.tick = 0; this.remotes = new Map(); this.ended = null; this.notices = []; this.removed = new Set();
  this.arena = new Arena({ map, createSim, random });
  this.hostSeat = this.arena.addSeat('host', name || 'Host', local);
  this.hostSeat.slot = 0;
  this.log = []; this.eventSeq = 0; this.localEvents = []; this.newFeed = [];
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
  remote.silent = 0; remote.heard = this.now(); remote.loaded = true;
  if (message.t === 'input') {
   remote.ack = Math.max(remote.ack, message.ack || 0);
   // Inputs repeat across messages for safety; keep only the new ones, in order.
   for (const input of message.inputs) if (input.seq > remote.queuedSeq) { remote.queue.push(input); remote.queuedSeq = input.seq; }
   remote.queue.sort((a, b) => a.seq - b.seq);
   // A client that races ahead (or a flood) cannot build an endless backlog.
   if (remote.queue.length > 30) remote.queue.splice(0, remote.queue.length - 30);
  }
  if (message.t === 'choose') this.arena.choose(from, message.weapon);
  if (message.t === 'menu') this.arena.leaveWorld(from);
 }

 admit(id, hello) {
  if (this.remotes.has(id)) return;
  // Someone the host removed stays out for the rest of this room.
  if (this.removed.has(id)) return this.transport.send(id, { t: 'removed', reason: 'The host removed you from the game.' });
  if (hello.version !== PROTOCOL_VERSION) return this.transport.send(id, { t: 'full', reason: 'This game is running a different version. Reload the page on both devices.' });
  if (this.playerCount >= this.config.maxPlayers) return this.transport.send(id, { t: 'full', reason: 'That game is full.' });
  const used = new Set([0, ...[...this.remotes.values()].map(r => r.slot)]);
  let slot = 1; while (used.has(slot)) slot++;
  // Names are unique in a room: a second "Sam" plays as "Sam 2".
  const taken = new Set([this.hostSeat.name, ...[...this.remotes.values()].map(r => r.seat.name)].map(n => n.toLowerCase()));
  let name = hello.name || 'Player ' + (slot + 1), suffix = 2;
  while (taken.has(name.toLowerCase())) name = (hello.name || 'Player') + ' ' + suffix++;
  const seat = this.arena.addSeat(id, name);
  seat.slot = slot;
  const remote = { id, seat, sim: seat.sim, slot, name, queue: [], queuedSeq: 0, lastSeq: 0, last: IDLE, silent: 0, heard: this.now(), ack: this.eventSeq, previous: { ...seat.sim.player } };
  this.remotes.set(id, remote);
  this.transport.send(id, { t: 'welcome', id, slot, name, tick: this.tick, map: this.map.id, players: this.states(), world: this.worldState() });
  this.notices.push(name + ' joined');
 }

 // The host takes a player out of the game. They are told why, and cannot
 // come back into this room.
 kick(id) {
  const remote = this.remotes.get(id);
  if (!remote) return false;
  this.removed.add(id);
  this.transport.send(id, { t: 'removed', reason: 'The host removed you from the game.' });
  this.remove(id, 'removed');
  return true;
 }

 // Who else is here, for the host's player list.
 players() { return [...this.remotes.values()].map(r => ({ id: r.id, name: r.name })); }

 remove(id, why) {
  const remote = this.remotes.get(id);
  if (!remote) return;
  this.remotes.delete(id); this.arena.removeSeat(id);
  this.transport.broadcast({ t: 'leave', id });
  this.notices.push(remote.name + (why === 'timeout' ? ' lost connection' : why === 'removed' ? ' was removed' : ' left'));
 }

 // The host's own weapon choice and trips to the weapon menu.
 choose(weapon) { this.arena.choose('host', weapon); }
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
  this.local.dev = { speed: 1 };
  this.arena.after(this.hostSeat);
  const hostMark = this.hostSeat.mark;
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
    const held = remote.silent < .25 ? { ...playerInput({ ...remote.last }), dodge: false, launch: false, tapFire: false, grenade: false, doubleShot: false, reload: false, hex: false, extendedReload: false, quickShot: false } : IDLE;
    remote.sim.dev = { speed: 1 };
    this.arena.stepSeat(remote.seat, input || held);
    this.record(remote.id, remote.sim.drainEvents());
   }
   remote.silent += 1 / 60;
   // Real seconds, not ticks: a host running slow must not drop players early.
   // A joiner still building the world (seconds on a phone) sends nothing yet.
   if (this.now() - remote.heard > (remote.loaded ? this.config.timeout : this.config.loadGrace)) this.remove(remote.id, 'timeout');
  }
  // The host's own events, including damage the others did to it just now
  // (main.js drains the sim after this).
  this.record('host', this.local.events.slice(hostMark));
  this.newFeed.push(...this.arena.endTick());
  this.record('world', this.arena.worldEvents || []);
  // Damage the others did to the host this tick lands in the host's own sim
  // after its step; main.js drains it with the rest.
  if (this.tick % this.config.snapshotEvery === 0) this.sendSnapshots();
 }

 // Keeps what other screens should see, numbered, for resending.
 record(by, events) {
  for (const e of events) {
   if (!SHARED_EVENTS.has(e.type)) continue;
   const entry = { s: ++this.eventSeq, by, tick: this.tick, e };
   this.log.push(entry);
   if (by !== 'host') this.localEvents.push(entry);
  }
  while (this.log.length && this.log[0].tick < this.tick - EVENT_KEEP) this.log.shift();
 }

 // What the host's own screen should show from everyone else this frame.
 drainRemoteEvents() { return this.localEvents.splice(0); }

 sendSnapshots() {
  const players = this.states(), proj = this.projectiles();
  const slow = this.tick % (this.config.snapshotEvery * 10) === 0;
  const feed = this.arena.feed.slice(-8), board = slow ? this.arena.scoreboard() : null, world = slow ? this.worldState() : undefined;
  for (const remote of this.remotes.values()) {
   const ev = this.log.filter(entry => entry.s > remote.ack).slice(0, 240);
   this.transport.send(remote.id, { t: 'snapshot', tick: this.tick, players, you: { ...loadout(remote.sim), life: remote.seat.life, present: remote.seat.present, dead: remote.seat.dead, respawnIn: remote.seat.respawnIn },
    proj, ev, feed, board, world });
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
  return { ...playerState(seat.id, seat.sim.player, lastSeq), name: seat.name, slot: seat.slot, weapon: seat.weapon, present: seat.present, dead: seat.dead, life: seat.life };
 }

 states() {
  return [this.seatState(this.hostSeat), ...[...this.remotes.values()].map(r => this.seatState(r.seat, r.lastSeq))];
 }

 // What the renderer draws for everyone but the host: the host steps these
 // sims on the same clock as its own, so they blend with the same alpha.
 others(alpha = 1) {
  return [...this.remotes.values()].filter(r => r.seat.present && !r.seat.dead)
   .map(r => ({ ...blend(r.id, r.name, r.previous, r.sim.player, alpha), weapon: r.seat.weapon, slot: r.slot }));
 }

 scoreboard() { return this.arena.scoreboard(); }
 feed() { return this.arena.feed; }
 drainFeed() { return this.newFeed.splice(0); }
 drainNotices() { return this.notices.splice(0); }
 close() { this.transport.close(); this.remotes.clear(); }
}

export function blend(id, name, a, b, alpha) {
 const angleA = Math.atan2(a.aimZ, a.aimX), angleB = Math.atan2(b.aimZ, b.aimX);
 const turn = Math.atan2(Math.sin(angleB - angleA), Math.cos(angleB - angleA)), angle = angleA + turn * alpha;
 return {
  id, name,
  x: a.x + (b.x - a.x) * alpha, z: a.z + (b.z - a.z) * alpha,
  vx: b.vx, vz: b.vz, aimX: Math.cos(angle), aimZ: Math.sin(angle), dodgeRemaining: b.dodgeRemaining || 0,
 };
}
