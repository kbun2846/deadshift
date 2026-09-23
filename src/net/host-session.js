// The host's side of an online game. The host is the authority: it runs the
// simulation for every player and tells the others what happened.
//
// Its own player is the ordinary local Simulation that main.js steps. Each
// joined player gets a Simulation of their own here, stepped once per tick
// with the inputs that player sent, in order. Every few ticks the host sends a
// snapshot of all players to everyone.
//
// Nothing in here touches the DOM, three.js or the wire directly, so it runs
// the same in tests (with the loopback transport) and, later, on a dedicated
// server (with a WebSocket transport and no local player).
import { NETWORK } from '../config/network.js';
import { PROTOCOL_VERSION, movementInput, playerState, readMessage } from './protocol.js';

const IDLE = Object.freeze(movementInput({}));
// Where joiners appear, relative to the map's spawn: around the host, not on them.
const SPAWN_OFFSETS = [[2.2, 0], [-2.2, 0], [0, 2.2], [0, -2.2], [2.2, 2.2], [-2.2, -2.2]];

export class HostSession {
 constructor({ transport, map, local, createSim, config = NETWORK, name = 'P1', now = () => performance.now() / 1000 }) {
  Object.assign(this, { transport, map, local, createSim, config, name, now });
  this.tick = 0; this.remotes = new Map(); this.ended = null; this.notices = []; this.removed = new Set();
  transport.onMessage = (from, data) => this.receive(from, data);
  transport.onLeave = id => this.remove(id, 'left');
  transport.onJoin = () => {};
 }

 get role() { return 'host'; }
 get playerCount() { return 1 + this.remotes.size; }

 receive(from, data) {
  const message = readMessage(data);
  if (!message) return;
  if (message.t === 'hello') return this.admit(from, message);
  const remote = this.remotes.get(from);
  if (!remote) return;
  remote.silent = 0; remote.heard = this.now();
  if (message.t === 'input') {
   // Inputs repeat across messages for safety; keep only the new ones, in order.
   for (const input of message.inputs) if (input.seq > remote.queuedSeq) { remote.queue.push(input); remote.queuedSeq = input.seq; }
   remote.queue.sort((a, b) => a.seq - b.seq);
   // A client that races ahead (or a flood) cannot build an endless backlog.
   if (remote.queue.length > 30) remote.queue.splice(0, remote.queue.length - 30);
  }
 }

 admit(id, hello) {
  if (this.remotes.has(id)) return;
  // Someone the host removed stays out for the rest of this room.
  if (this.removed.has(id)) return this.transport.send(id, { t: 'removed', reason: 'The host removed you from the game.' });
  if (hello.version !== PROTOCOL_VERSION) return this.transport.send(id, { t: 'full', reason: 'This game is running a different version. Reload the page on both devices.' });
  if (this.playerCount >= this.config.maxPlayers) return this.transport.send(id, { t: 'full', reason: 'That game is full.' });
  const used = new Set([...this.remotes.values()].map(r => r.slot));
  let slot = 0; while (used.has(slot)) slot++;
  const [dx, dz] = SPAWN_OFFSETS[slot % SPAWN_OFFSETS.length];
  const sim = this.createSim({ ...this.map, spawn: { x: this.map.spawn.x + dx, z: this.map.spawn.z + dz } });
  sim.weapon = ['static', 'rifle', 'shotgun'].includes(hello.weapon) ? hello.weapon : 'static';
  sim.player.stamina = sim.maxStamina;
  // Players never carry practice overrides online.
  sim.dev = { speed: 1 };
  sim.movePlayer?.(0, 0);
  // Named by seat for now; account names replace this later.
  const name = 'P' + (slot + 2);
  const remote = { id, sim, slot, name, queue: [], queuedSeq: 0, lastSeq: 0, last: IDLE, silent: 0, heard: this.now(), previous: { ...sim.player } };
  this.remotes.set(id, remote);
  this.transport.send(id, { t: 'welcome', id, tick: this.tick, map: this.map.id, players: this.states() });
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
  this.remotes.delete(id);
  this.local.otherPlayers = this.bodiesExcept('host');
  this.transport.broadcast({ t: 'leave', id });
  this.notices.push(remote.name + (why === 'timeout' ? ' lost connection' : why === 'removed' ? ' was removed' : ' left'));
 }

 // One 60 Hz tick, run right after the host's own player has stepped.
 step() {
  this.tick++;
  this.local.dev = { speed: 1 };
  for (const remote of [...this.remotes.values()]) {
   remote.previous = { ...remote.sim.player };
   // Everyone else as they stand right now, so players are solid to each other.
   remote.sim.otherPlayers = this.bodiesExcept(remote.id);
   // Normally one input per tick. A backlog (a burst after a network hiccup)
   // is worked off a few at a time rather than all at once.
   const runs = remote.queue.length > 6 ? Math.min(this.config.maxCatchUp, remote.queue.length - 3) : 1;
   for (let i = 0; i < runs; i++) {
    const input = remote.queue.shift();
    if (input) { remote.last = input; remote.lastSeq = input.seq; }
    // No input this tick: keep doing what they were doing for a moment (a late
    // packet), never repeating a dodge; a longer silence means stand still.
    remote.sim.step(input || (remote.silent < .25 ? { ...remote.last, dodge: false } : IDLE));
    remote.sim.drainEvents();
   }
   remote.silent += 1 / 60;
   // Real seconds, not ticks: a host running slow must not drop players early.
   if (this.now() - remote.heard > this.config.timeout) this.remove(remote.id, 'timeout');
  }
  // The host's own sim steps before this in main.js, so it meets the others
  // where they ended this tick.
  this.local.otherPlayers = this.bodiesExcept('host');
  if (this.tick % this.config.snapshotEvery === 0) this.transport.broadcast({ t: 'snapshot', tick: this.tick, players: this.states() });
 }

 // Where every player but `id` stands, as round bodies for collisions.
 bodiesExcept(id) {
  const bodies = id === 'host' ? [] : [body(this.local.player)];
  for (const r of this.remotes.values()) if (r.id !== id) bodies.push(body(r.sim.player));
  return bodies;
 }

 states() {
  return [
   { ...playerState('host', this.local.player, 0), name: this.name, weapon: this.local.weapon },
   ...[...this.remotes.values()].map(r => ({ ...playerState(r.id, r.sim.player, r.lastSeq), name: r.name, weapon: r.sim.weapon })),
  ];
 }

 // What the renderer draws for everyone but the host: the host steps these
 // sims on the same clock as its own, so they blend with the same alpha.
 others(alpha = 1) {
  return [...this.remotes.values()].map(r => blend(r.id, r.name, r.previous, r.sim.player, alpha));
 }

 drainNotices() { return this.notices.splice(0); }
 close() { this.transport.close(); this.remotes.clear(); }
}

const body = p => ({ x: p.x, z: p.z, hp: p.hp });

export function blend(id, name, a, b, alpha) {
 const angleA = Math.atan2(a.aimZ, a.aimX), angleB = Math.atan2(b.aimZ, b.aimX);
 const turn = Math.atan2(Math.sin(angleB - angleA), Math.cos(angleB - angleA)), angle = angleA + turn * alpha;
 return {
  id, name,
  x: a.x + (b.x - a.x) * alpha, z: a.z + (b.z - a.z) * alpha,
  vx: b.vx, vz: b.vz, aimX: Math.cos(angle), aimZ: Math.sin(angle), dodgeRemaining: b.dodgeRemaining || 0,
 };
}
