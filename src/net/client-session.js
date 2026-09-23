// A joining player's side of an online game.
//
// Your own player: predicted. Your inputs step your local Simulation straight
// away, so moving feels instant, and the same inputs go to the host. When the
// host's answer comes back it says where you really are as of the last input
// it ran. We take that, re-run the inputs it has not seen yet on a spare
// Simulation, and compare with where we predicted. Usually they match exactly
// (same code, same inputs). If not, small gaps are eased out and big ones snap.
//
// Everyone else: drawn a tenth of a second in the past, gliding between the
// two snapshots either side of that moment, so their movement stays smooth
// even though snapshots arrive only 20 times a second and not evenly.
import { NETWORK } from '../config/network.js';
import { PROTOCOL_VERSION, movementInput, applyPlayerState, readMessage } from './protocol.js';
import { blend } from './host-session.js';

export class ClientSession {
 constructor({ transport, map, local, createSim, config = NETWORK, now = () => performance.now() / 1000, name = 'Player' }) {
  Object.assign(this, { transport, map, local, config, now });
  this.scratch = createSim(map);
  this.id = null; this.seq = 0; this.pending = []; this.snapshots = []; this.lastTick = -1;
  this.clockOffset = null; this.ended = null; this.notices = []; this.names = new Map();
  this.correction = 0; this.heard = now();
  transport.onMessage = (_from, data) => this.receive(data);
  transport.onLeave = () => { if (!this.ended) this.ended = 'The host left the game.'; };
  transport.send('host', { t: 'hello', version: PROTOCOL_VERSION, name, weapon: local.weapon });
 }

 get role() { return 'client'; }
 get welcomed() { return this.id !== null; }
 get playerCount() { return this.snapshots.at(-1)?.players.length || 1; }

 receive(data) {
  const message = readMessage(data);
  if (!message) return;
  this.heard = this.now();
  if (message.t === 'full' || message.t === 'removed') { this.ended = String(message.reason || 'Could not join.'); return; }
  if (message.t === 'welcome') {
   this.id = String(message.id);
   const me = message.players?.find(p => p.id === this.id);
   if (me) applyPlayerState(this.local.player, me);
   this.local.dev = { speed: 1 };
   this.accept({ tick: message.tick, players: message.players || [] });
   return;
  }
  if (message.t === 'leave') { this.snapshots.forEach(s => { s.players = s.players.filter(p => p.id !== message.id); }); this.local.otherPlayers = []; return; }
  if (message.t === 'snapshot' && this.welcomed) this.accept(message);
 }

 accept(snapshot) {
  if (snapshot.tick <= this.lastTick) return; // unordered channel: late ones are stale
  this.lastTick = snapshot.tick;
  // Map the host's tick clock onto ours. The smallest gap seen is the best
  // guess (least delayed packet); it relaxes slowly in case the link improves.
  const offset = this.now() - snapshot.tick / 60;
  this.clockOffset = this.clockOffset === null || offset < this.clockOffset ? offset : this.clockOffset + (offset - this.clockOffset) * .02;
  this.snapshots.push(snapshot);
  while (this.snapshots.length > 30) this.snapshots.shift();
  for (const p of snapshot.players) if (p.name) this.names.set(p.id, String(p.name).slice(0, 16));
  // Others as the host last reported them: what both our prediction and the
  // replay collide with, so the replay matches what the host ran.
  this.local.otherPlayers = snapshot.players.filter(p => p.id !== this.id).map(p => ({ x: p.x, z: p.z, hp: p.hp }));
  const me = snapshot.players.find(p => p.id === this.id);
  if (me) this.reconcile(me);
 }

 reconcile(state) {
  this.pending = this.pending.filter(input => input.seq > (state.lastSeq || 0));
  const replay = this.scratch, p = this.local.player;
  replay.weapon = this.local.weapon; replay.dev = { speed: 1 }; replay.otherPlayers = this.local.otherPlayers;
  applyPlayerState(replay.player, state);
  for (const input of this.pending) { replay.step(input); replay.drainEvents(); }
  const r = replay.player, dx = r.x - p.x, dz = r.z - p.z, error = Math.hypot(dx, dz);
  this.correction = error;
  if (error > this.config.snapDistance) { p.x = r.x; p.z = r.z; }
  else if (error > 1e-4) { p.x += dx * this.config.correctionBlend; p.z += dz * this.config.correctionBlend; }
  for (const key of ['vx', 'vz', 'dodgeRemaining', 'dodgeX', 'dodgeZ', 'stamina', 'staminaWait', 'blastVX', 'blastVZ']) p[key] = r[key];
 }

 // Called once per tick with the full local input. Returns what the local
 // Simulation should run: only movement online, and nothing until the host
 // has let us in.
 input(raw) {
  if (this.welcomed && !this.ended && this.now() - this.heard > this.config.timeout) this.ended = 'Lost connection to the host.';
  if (!this.welcomed || this.ended) return movementInput({});
  this.local.dev = { speed: 1 };
  const input = { seq: ++this.seq, ...movementInput(raw) };
  this.pending.push(input);
  if (this.pending.length > 120) this.pending.shift();
  this.transport.send('host', { t: 'input', inputs: this.pending.slice(-this.config.inputRedundancy) });
  return input;
 }

 // Other players, placed where they were `interpolationDelay` seconds ago.
 others() {
  if (!this.snapshots.length || this.clockOffset === null) return [];
  const tick = (this.now() - this.clockOffset - this.config.interpolationDelay) * 60;
  let before = this.snapshots[0], after = null;
  for (const s of this.snapshots) { if (s.tick <= tick) before = s; else { after = s; break; } }
  const list = [];
  for (const a of before.players) {
   if (a.id === this.id) continue;
   const b = after?.players.find(p => p.id === a.id);
   const alpha = b ? Math.min(1, Math.max(0, (tick - before.tick) / (after.tick - before.tick))) : 1;
   list.push(blend(a.id, this.names.get(a.id) || '', a, b || a, alpha));
  }
  return list;
 }

 drainNotices() { return this.notices.splice(0); }
 close() { this.ended ||= 'Left the game.'; this.transport.close(); }
}
