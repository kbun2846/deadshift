// A joining player's side of a multiplayer game.
//
// Your own movement: predicted. Your inputs step your local Simulation straight
// away, so walking feels instant, and the same inputs go to the host. When the
// host's answer comes back it says where you really are as of the last input
// it ran. We take that, re-run the inputs it has not seen yet on a spare
// Simulation, and compare with where we predicted. Usually they match exactly
// (same code, same inputs). If not, small gaps are eased out and big ones snap.
//
// Your weapon: the host fires it. Your sim only walks; every shot, hit and
// explosion (yours included) arrives as a numbered event with the snapshots,
// and your ammo, reloads and health come back in `you`. That keeps one truth
// about who hit whom, at the cost of your own shots showing a round trip late.
//
// Everyone else: drawn a tenth of a second in the past, gliding between the
// two snapshots either side of that moment, so their movement stays smooth
// even though snapshots arrive only 20 times a second and not evenly.
import { NETWORK } from '../config/network.js';
import { PROTOCOL_VERSION, movementInput, playerInput, applyPlayerState, applyLoadout, readMessage, unpackEvent } from './protocol.js';
import { blend } from './host-session.js';
import { ProjectileMirror } from './projectiles.js';
import { mapColliders } from '../maps.js';

// Seconds between our own ticks that count as us being frozen, not them.
const STALL = 1;

export class ClientSession {
 constructor({ transport, map, local, createSim, config = NETWORK, now = () => performance.now() / 1000, name = 'Player' }) {
  Object.assign(this, { transport, map, local, config, now });
  this.scratch = createSim(map); this.scratch.worldAuthority = false; this.scratch.predictOnly = true;
  // Our own copy only predicts movement: the host runs the weapons and abilities.
  if (local) local.predictOnly = true;
  // The map's practice targets as built, for mirroring the host's (practice mode).
  this.targetBase = new Map(this.scratch.targets.map(t => [t.id, t])); this.scratch.targets = []; this.targetKey = '';
  this.id = null; this.slot = null; this.name = name; this.seq = 0; this.pending = []; this.snapshots = []; this.lastTick = -1;
  this.clockOffset = null; this.ended = null; this.notices = []; this.names = new Map();
  this.correction = 0; this.heard = now(); this.lastInput = this.heard;
  this.ack = 0; this.inbox = []; this.board = []; this.feedLines = []; this.feedSeen = 0;
  this.mine = { life: 0, present: false, dead: false, respawnIn: 0, picking: null, weapon: null };
  this.projectiles = new ProjectileMirror();
  transport.onMessage = (_from, data) => this.receive(data);
  transport.onLeave = () => { if (!this.ended) this.ended = 'The host left the game.'; };
  transport.send('host', { t: 'hello', version: PROTOCOL_VERSION, name });
 }

 get role() { return 'client'; }
 get welcomed() { return this.id !== null; }
 get playerCount() { return this.snapshots.at(-1)?.players.length || 1; }
 get me() { return { ...this.mine, name: this.name, id: this.id }; }

 receive(data) {
  const message = readMessage(data);
  if (!message) return;
  this.heard = this.now();
  if (message.t === 'full' || message.t === 'removed') { this.ended = String(message.reason || 'Could not join.'); return; }
  if (message.t === 'welcome') {
   this.id = String(message.id); this.slot = message.slot; if (message.name) this.name = String(message.name);
   // The host burns the crops; this sim only mirrors them (applyWorld).
   this.local.dev = { speed: 1 }; this.local.targets = []; this.local.player.id = this.id; this.local.worldAuthority = false;
   this.local.player.hp = 0; this.local.player.dead = true;
   this.accept({ tick: message.tick, players: message.players || [], world: message.world });
   return;
  }
  // The host measures our round trip: answer at once with its own clock.
  if (message.t === 'ping') { if (Number.isFinite(message.s)) this.transport.send('host', { t: 'pong', s: message.s }); return; }
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
  // Events, in order, each once, however many snapshots repeated them.
  for (const entry of (snapshot.ev || []).sort((a, b) => a.s - b.s)) if (entry.s > this.ack) {
   entry.e = unpackEvent(entry.e); this.inbox.push(entry); this.ack = entry.s;
   // Broken and rebuilt props change what you can walk through: applied at once.
   if (entry.e.type === 'propBreak' || entry.e.type === 'propRestore') this.setProp(entry.e.id, entry.e.type === 'propRestore');
  }
  if (snapshot.world) this.applyWorld(snapshot.world);
  if ('targets' in snapshot) this.applyTargets(snapshot.targets);
  for (const line of snapshot.feed || []) if (line.serial > this.feedSeen) { this.feedLines.push(line); this.feedSeen = line.serial; }
  if (snapshot.board) this.board = snapshot.board;
  if (snapshot.lobby) this.lobbyState = snapshot.lobby;
  if (snapshot.match) this.matchState = snapshot.match;
  this.projectiles.update(snapshot.proj, this.now());
  // Others as the host last reported them: what both our prediction and the
  // replay collide with, so the replay matches what the host ran.
  this.local.otherPlayers = snapshot.players.filter(p => p.id !== this.id && p.present && !p.dead).map(p => ({ x: p.x, z: p.z, hp: p.hp }));
  const me = snapshot.players.find(p => p.id === this.id);
  if (snapshot.you) this.own(snapshot.you, me);
  if (me && this.mine.present && !this.mine.dead) this.reconcile(me);
 }

 // The shared world as the host has it: which props are broken, how the crops
 // are burning. Sent now and then (and on joining), so nothing drifts.
 applyWorld(world) {
  const broken = new Set(world.broken || []);
  for (const prop of this.local.props) if (prop.hp !== null) prop.hp = broken.has(prop.id) ? 0 : (prop.hp > 0 ? prop.hp : prop.health);
  this.local.colliders = mapColliders(this.map).filter(c => !broken.has(c.propId));
  (world.crops || []).forEach(([state, burnAge, scorch], i) => { const c = this.local.crops[i]; if (c) Object.assign(c, { state, burnAge, scorch }); });
 }

 // Practice targets as the host has them. Your sim holds them (you walk into
 // them, the views draw them) but never moves or revives them itself.
 applyTargets(list) {
  if (!list) { if (this.local.targets.length) this.local.targets = []; this.targetKey = ''; return; }
  const key = list.map(t => t[0]).join(',');
  if (key !== this.targetKey) {
   this.targetKey = key;
   this.local.targets = list.map(([id]) => this.targetBase.get(id)).filter(Boolean).map(t => ({ ...t, moving: false, respawn: 0 }));
  }
  const byId = new Map(this.local.targets.map(t => [t.id, t]));
  for (const [id, x, z, hp, flash] of list) { const t = byId.get(id); if (t) Object.assign(t, { x, z, baseX: x, hp, flash }); }
 }

 setProp(id, standing) {
  const prop = this.local.props.find(p => p.id === id); if (!prop || prop.hp === null) return;
  prop.hp = standing ? prop.health : 0;
  this.local.colliders = this.local.colliders.filter(c => c.propId !== id);
  if (standing) this.local.colliders.push(...mapColliders(this.map).filter(c => c.propId === id));
 }

 // Your health, weapon state, life and whereabouts, as the host has them.
 own(you, me) {
  const newLife = you.life !== this.mine.life;
  this.mine = { life: you.life, present: !!you.present, dead: !!you.dead, respawnIn: you.respawnIn || 0, picking: you.picking || null, weapon: you.weapon || null };
  if (you.weapon) this.local.weapon = you.weapon;
  if (newLife && you.present && me) {
   // A new life: a fresh body where the host put it.
   this.local.respawn({ x: me.x, z: me.z }, this.id);
   this.pending = [];
  }
  applyLoadout(this.local, you);
  const p = this.local.player;
  if (me) { p.hp = me.hp; p.maxHp = me.maxHp; }
  // Dead or out of the world: the body stays down (and never plays a second,
  // local death: the host's playerDeath event is the one that counts).
  if (!you.present || you.dead) { p.hp = 0; p.dead = true; }
 }

 reconcile(state) {
  this.pending = this.pending.filter(input => input.seq > (state.lastSeq || 0));
  const replay = this.scratch, p = this.local.player;
  replay.weapon = this.local.weapon; replay.dev = { speed: 1 }; replay.surge = { ...this.local.surge }; replay.otherPlayers = this.local.otherPlayers;
  replay.props = this.local.props; replay.colliders = this.local.colliders; replay.crops = this.local.crops;
  applyPlayerState(replay.player, state); replay.player.hp = Math.max(1, state.hp || 1); replay.player.dead = false;
  for (const input of this.pending) { replay.step(movementInput(input)); replay.drainEvents(); }
  const r = replay.player, dx = r.x - p.x, dz = r.z - p.z, error = Math.hypot(dx, dz);
  this.correction = error;
  if (error > this.config.snapDistance) { p.x = r.x; p.z = r.z; }
  else if (error > 1e-4) { p.x += dx * this.config.correctionBlend; p.z += dz * this.config.correctionBlend; }
  for (const key of ['vx', 'vz', 'dodgeRemaining', 'dodgeX', 'dodgeZ', 'stamina', 'staminaWait', 'blastVX', 'blastVZ']) p[key] = r[key];
 }

 // Called once per tick with the full local input. Returns what the local
 // Simulation should run: movement only (the host fires), and nothing while
 // you are out of the world, dead, or not let in yet.
 input(raw) {
  // A stall on our side (loading the world, a hidden window) is not the host
  // going quiet: its snapshots are waiting in the queue. Forgive it.
  const t = this.now(), gap = this.lastInput === undefined ? 0 : t - this.lastInput; this.lastInput = t;
  if (gap > STALL) this.heard += Math.min(gap, Math.max(0, t - this.heard));
  if (this.welcomed && !this.ended && this.now() - this.heard > this.config.timeout) this.ended = 'Lost connection to the host.';
  if (!this.welcomed || this.ended) return movementInput({});
  this.local.dev = { speed: 1 };
  // Between matches (the results) everyone stands still, as on the host.
  const alive = this.mine.present && !this.mine.dead && this.match().phase === 'playing';
  const input = { seq: ++this.seq, ...(alive ? playerInput(raw) : playerInput({})) };
  this.pending.push(input);
  if (this.pending.length > 120) this.pending.shift();
  this.transport.send('host', { t: 'input', inputs: this.pending.slice(-this.config.inputRedundancy), ack: this.ack });
  return alive ? movementInput(input) : movementInput({});
 }

 // The weapon pick: picked (go false) or picked and in (go true).
 choose(weapon, go = true) { this.transport.send('host', { t: 'choose', weapon, go }); }
 // Team modes: the side you want (the host's lobby decides if there is room).
 chooseTeam(team) { this.transport.send('host', { t: 'team', team }); }
 pickAgain() { this.transport.send('host', { t: 'pick' }); }
 respawnNow() { this.transport.send('host', { t: 'respawn' }); }

 // Events that arrived since the last call: [{ s, by, e }].
 drainEvents() { return this.inbox.splice(0); }
 drainFeed() { return this.feedLines.splice(0); }
 scoreboard() { return this.board; }
 // The room as the host last reported it (players, pings, settings) and the
 // match clock. Joiners see these but cannot change them.
 lobby() { return this.lobbyState || { players: [], spawnMode: 'random' }; }
 match() { return this.matchState || { phase: 'playing', left: 0, number: 1, results: null }; }

 // Everyone's shots, to draw (see projectiles.js).
 foreignProjectiles(isEnemy = null) { return this.projectiles.lists(this.now(), isEnemy); }

 // Other players, placed where they were `interpolationDelay` seconds ago.
 others() {
  if (!this.snapshots.length || this.clockOffset === null) return [];
  const tick = (this.now() - this.clockOffset - this.config.interpolationDelay) * 60;
  let before = this.snapshots[0], after = null;
  for (const s of this.snapshots) { if (s.tick <= tick) before = s; else { after = s; break; } }
  const list = [];
  for (const a of before.players) {
   if (a.id === this.id || !a.present || a.dead) continue;
   const b = after?.players.find(p => p.id === a.id);
   const alpha = b ? Math.min(1, Math.max(0, (tick - before.tick) / (after.tick - before.tick))) : 1;
   list.push({ ...blend(a.id, this.names.get(a.id) || a.name || '', a, b || a, alpha), weapon: a.weapon, slot: a.slot, team: a.team, robot: !!a.robot, hp: a.hp, maxHp: a.maxHp });
  }
  return list;
 }

 // Where a player is right now (for placing their muzzle flashes).
 latest(id) { return this.snapshots.at(-1)?.players.find(p => p.id === id) || null; }

 drainNotices() { return this.notices.splice(0); }
 close() { this.ended ||= 'Left the game.'; this.transport.close(); }
}
