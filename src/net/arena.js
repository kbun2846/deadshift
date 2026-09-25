// The multiplayer rules on the host: rounds of a mode in one shared world.
//
// Every player keeps their own Simulation (their body, weapon, ammo, orbs,
// reloads and cooldowns: all the code that already works for one player).
// What makes it one game is that those sims share the world and see each
// other:
//
//  - One world. Before a player's sim is stepped it is handed the shared
//    props, colliders and crops, and afterwards whatever it changed is kept
//    (a prop it broke is broken for everyone). Only the arena burns crops,
//    fades prop flashes and runs practice targets, once per tick.
//  - Everyone else as targets. While a player's sim steps, the other living
//    players (and in practice the map's targets) stand in its target list as
//    stand-ins ("proxies"). Every weapon already knows how to hit targets, so
//    orbs, bullets, pellets, grenades, blasts, the stream and the hex all hit
//    players with no weapon code changed. Afterwards the health a proxy lost
//    is dealt to the real player's sim through damagePlayer (dodge reduction,
//    the right death) or to the real target.
//  - Solid bodies. The others are also passed as otherPlayers, so bodies
//    block each other (see Simulation.movePlayer).
//
// The round, as the host runs it (phase):
//  - 'lobby': nobody is in the world. The host picks the mode and the map and
//    changes the settings; everyone sees the lobby screen.
//  - 'playing': a round of the mode. Each player first picks a weapon
//    (`picking`, PICK.time seconds; GO sends them in at once; at zero they go
//    in with what they picked, or a random weapon). They pick again only after
//    dying (CHANGE WEAPON on the death screen).
//      ffa:      kills count; the round ends when the clock runs out or someone
//                reaches the kill limit. Respawn after the respawn setting.
//      practice: the map's targets are out; players can still hit each other
//                but nothing is counted; no respawn wait (RESPAWN on the
//                death screen), no clock; the weapon can be changed any time
//                (pause menu), leaving the world while picking.
//  - 'results' (ffa): the standings for RESULTS seconds, then back to 'lobby'.
// Nobody spawns inside the ground the weapon-pick camera shows (pick-view.js).
// Nothing here touches the DOM, three.js or the network.
import { interiorSpawns, pickSpawn } from './spawn-points.js';
import { stepCrops } from '../crops.js';
import { segmentBox } from '../simulation.js';
import { RULES } from '../config/gameplay.js';
import { weaponOrDefault, WEAPONS } from '../items.js';
import { mapColliders } from '../maps.js';
import { pickArea, inPickArea } from '../render/pick-view.js';

import { MODES, SETTINGS, defaultSettings, cleanSettings, PICK, RESULTS } from '../config/match.js';
export { MODES, SETTINGS, defaultSettings, cleanSettings, PICK, RESULTS };
// Kept for older callers and tests: the defaults.
export const MATCH = Object.freeze({ respawn: SETTINGS.respawn.default, health: SETTINGS.health.default, length: SETTINGS.roundLength.default, results: RESULTS });
export const SPAWN_MODES = SETTINGS.spawnMode.values;
export const SYPHON_SHARE = .5;
const IDLE = Object.freeze({ moveX: 0, moveZ: 0, aimX: 0, aimZ: 0 });
const newStats = () => ({ kills: 0, deaths: 0, dealt: 0, taken: 0, time: 0, weaponTime: {} });

export class Arena {
 constructor({ map, createSim, random = Math.random, settings }) {
  Object.assign(this, { map, createSim, random });
  // The world sim: owns crop burning and prop flashes, has no living player.
  this.worldSim = createSim(map);
  this.worldSim.player.hp = 0; this.worldSim.player.dead = true; this.worldSim.targets = [];
  this.world = { props: this.worldSim.props, colliders: this.worldSim.colliders, crops: this.worldSim.crops };
  this.noSpawn = pickArea(map);
  this.rooms = interiorSpawns(map, this.world.colliders)
   .map(room => ({ ...room, points: room.points.filter(p => !inPickArea(this.noSpawn, p.x, p.z)) })).filter(room => room.points.length);
  this.seats = new Map(); this.time = 0;
  this.feed = []; this.feedSerial = 0; this.pendingKills = new Map();
  this.settings = cleanSettings(settings); this.togetherRoom = null;
  this.mode = 'ffa'; this.mapId = map.id; this.targets = [];
  this.phase = 'lobby'; this.clock = 0; this.resultsLeft = 0; this.results = null; this.matchNumber = 0;
  this.pendingEvents = [];
 }

 // A player joins. `sim` is the host's own (main.js) sim for the host seat.
 // Mid-round they go straight to the weapon pick.
 addSeat(id, name, sim = null) {
  sim ||= this.createSim(this.map);
  sim.worldAuthority = false; sim.targets = []; sim.otherPlayers = []; sim.dev = { speed: 1 };
  sim.player.id = id; sim.player.hp = 0; sim.player.dead = true;
  const seat = { id, name, sim, present: false, dead: false, respawnIn: 0, life: 0, weapon: null, picking: null,
   stats: newStats(), proxies: null, mark: 0 };
  this.seats.set(id, seat);
  if (this.phase === 'playing') this.startPick(seat);
  return seat;
 }

 removeSeat(id) { this.seats.delete(id); }

 get counting() { return this.mode === 'ffa'; }

 // --- Host controls (lobby) -------------------------------------------------

 setSetting(key, value) {
  if (!SETTINGS[key] || !SETTINGS[key].values.includes(value)) return false;
  this.settings[key] = value;
  if (key === 'spawnMode') this.togetherRoom = null;
  return true;
 }
 setSpawnMode(mode) { return this.setSetting('spawnMode', mode); }
 // The mode for the next round, chosen in the lobby (everyone sees it).
 setMode(mode) {
  if (this.phase !== 'lobby' || !MODES.find(m => m.id === mode)?.ready) return false;
  this.mode = mode; return true;
 }

 // A round of `mode` from the lobby (or restarted mid-round): a fresh map and
 // scores, and everyone to the weapon pick.
 startRound(mode = this.mode) {
  const entry = MODES.find(m => m.id === mode);
  if (!entry?.ready) return false;
  this.mode = mode;
  this.resetWorld();
  this.feed = []; this.pendingKills.clear(); this.togetherRoom = null;
  this.targets = mode === 'practice' ? this.createSim(this.map).targets : [];
  for (const seat of this.seats.values()) { seat.stats = newStats(); this.out(seat); this.startPick(seat); }
  this.phase = 'playing'; this.clock = this.settings.roundLength; this.resultsLeft = 0; this.results = null; this.matchNumber++;
  this.pendingEvents.push({ type: 'matchStart', number: this.matchNumber, mode });
  return true;
 }
 newMatch() { return this.startRound(this.mode); }

 // Back to the lobby: everyone out of the world, the targets put away.
 endRound() {
  for (const seat of this.seats.values()) { this.out(seat); seat.picking = null; }
  this.phase = 'lobby'; this.results = null; this.targets = [];
  this.pendingEvents.push({ type: 'roundEnd', number: this.matchNumber });
 }

 // The world as it was when the room opened: every prop standing, every crop
 // grown. Queues the events that tell every screen (propRestore for each
 // broken prop, then mapReset for blood, scorch marks and bodies).
 resetWorld() {
  const fresh = this.createSim(this.map), world = this.world;
  for (const prop of world.props) {
   if (prop.hp === null) continue;
   if (prop.hp <= 0) this.pendingEvents.push({ type: 'propRestore', id: prop.id, x: prop.x, z: prop.z, quiet: true });
   prop.hp = prop.health; prop.flash = 0;
  }
  world.colliders = mapColliders(this.map);
  world.crops.forEach((crop, i) => { const clean = fresh.crops[i]; if (clean) { for (const key of Object.keys(crop)) delete crop[key]; Object.assign(crop, clean); } });
  for (const seat of this.seats.values()) this.handWorld(seat.sim);
  this.handWorld(this.worldSim);
  if (this.targets.length) this.targets = fresh.targets;
  this.pendingEvents.push({ type: 'mapReset' });
 }

 // --- Players in and out of the world ----------------------------------------

 startPick(seat, keep = null) { seat.picking = { left: PICK.time, weapon: keep, go: false }; }

 // A weapon picked (or changed) on the pick screen; `go` sends them in now.
 choose(id, weapon, go = true) {
  const seat = this.seats.get(id); if (!seat || this.phase !== 'playing') return false;
  if (!seat.picking) {
   // FFA: only after dying (the death screen's CHANGE WEAPON). Practice: any
   // time (the pause menu's CHANGE WEAPON), out of the world while picking.
   if (seat.present && !seat.dead) { if (this.mode !== 'practice') return false; this.out(seat); }
   this.startPick(seat);
  }
  seat.picking.weapon = weaponOrDefault(weapon);
  if (go) seat.picking.go = true;
  this.tryEnter(seat);
  return true;
 }

 // Open the weapon pick again. FFA: only when dead (the respawn then waits for
 // it). Practice: any time; a living player leaves the world while picking.
 pickAgain(id) {
  const seat = this.seats.get(id);
  if (!seat || this.phase !== 'playing') return false;
  const alive = seat.present && !seat.dead;
  if (alive && this.mode !== 'practice') return false;
  if (alive) this.out(seat);
  if (!seat.picking) this.startPick(seat, seat.weapon);
  return true;
 }

 // Practice: back in at once with the same weapon.
 respawnNow(id) {
  const seat = this.seats.get(id);
  if (!seat || this.phase !== 'playing' || this.mode !== 'practice' || !seat.dead || seat.picking) return false;
  this.spawn(seat); return true;
 }

 // In the world once the pick is done and any respawn wait is over.
 tryEnter(seat) {
  const pick = seat.picking; if (!pick) return;
  const done = pick.go || pick.left <= 0;
  if (!done || (seat.dead && seat.respawnIn > 0)) return;
  seat.weapon = pick.weapon || WEAPONS[Math.floor(this.random() * WEAPONS.length)].id;
  seat.picking = null;
  this.spawn(seat);
 }

 // Old protocol: back to the menu. Now only the pick after a death does that.
 leaveWorld(id) { const seat = this.seats.get(id); if (seat) this.out(seat); }

 out(seat) {
  seat.present = false; seat.dead = false; seat.respawnIn = 0;
  seat.sim.respawn({ x: this.map.spawn.x, z: this.map.spawn.z }, seat.id);
  seat.sim.player.hp = 0; seat.sim.player.dead = true;
 }

 spawn(seat) {
  const others = [...this.seats.values()].filter(s => s !== seat && s.present && !s.dead).map(s => s.sim.player);
  // Together: everyone in one building (picked once per round), a body apart.
  const together = this.settings.spawnMode === 'together' && this.rooms.length;
  if (together) this.togetherRoom ||= this.rooms[Math.floor(this.random() * this.rooms.length)];
  const at = pickSpawn(together ? [this.togetherRoom] : this.rooms, others, this.random, together ? 1.6 : 6) || this.map.spawn;
  seat.sim.weapon = seat.weapon || weaponOrDefault(null);
  seat.sim.respawn(at, seat.id);
  seat.sim.player.hp = seat.sim.player.maxHp = this.settings.health;
  // The host's own sim keeps its developer settings (host-only dev tools).
  if (seat.id !== 'host') seat.sim.dev = { speed: 1 };
  this.handWorld(seat.sim);
  seat.present = true; seat.dead = false; seat.respawnIn = 0; seat.picking = null; seat.life++;
 }

 living(except) { return [...this.seats.values()].filter(s => s !== except && s.present && !s.dead && s.sim.player.hp > 0); }

 handWorld(sim) { sim.props = this.world.props; sim.colliders = this.world.colliders; sim.crops = this.world.crops; }

 // Right before a seat's sim steps.
 before(seat) {
  const sim = seat.sim;
  this.handWorld(sim);
  seat.proxies = new Map();
  const players = this.living(seat).map(other => {
   const p = other.sim.player;
   const proxy = { id: other.id, kind: 'player', x: p.x, z: p.z, baseX: p.x, spawnX: p.x, spawnZ: p.z, hp: p.hp, maxHp: p.maxHp, respawn: 0, flash: 0, moving: false };
   seat.proxies.set(other.id, { proxy, before: p.hp, seat: other });
   return proxy;
  });
  // Practice targets: stand-ins too, so this sim never moves or revives them.
  const targets = this.targets.filter(t => t.hp > 0).map(t => {
   const proxy = { ...t, moving: false, respawn: 0 };
   seat.proxies.set(t.id, { proxy, before: t.hp, target: t });
   return proxy;
  });
  sim.targets = [...players, ...targets];
  sim.otherPlayers = this.living(seat).map(o => ({ x: o.sim.player.x, z: o.sim.player.z, hp: o.sim.player.hp }));
  seat.mark = sim.events.length;
 }

 // Right after it stepped: keep its world changes, pass on the damage it did.
 after(seat) {
  const sim = seat.sim, events = sim.events.slice(seat.mark);
  this.world.colliders = sim.colliders;
  if (this.counting) for (const e of events) if (e.type === 'playerDamage') { seat.stats.taken += e.damage; }
  this.transferDamage(seat, seat.proxies, events);
  sim.targets = []; seat.proxies = null;
  // Their own blast, fire or fall: a death with nobody to credit.
  if (seat.present && !seat.dead && sim.player.hp <= 0) this.died(seat, null);
 }

 transferDamage(attacker, proxies, events) {
  if (!proxies) return;
  for (const { proxy, before, seat: victim, target } of proxies.values()) {
   const lost = before - proxy.hp;
   if (target) {
    target.flash = Math.max(target.flash || 0, proxy.flash || 0);
    if (lost > 0 && target.hp > 0) { target.hp = Math.max(0, target.hp - lost); if (target.hp <= 0) target.respawn = RULES.targetRespawn; }
    continue;
   }
   if (lost <= 0 || victim.dead) continue;
   const report = [...events].reverse().find(e => (e.type === 'kill' || e.type === 'hit') && e.id === victim.id) || {};
   const damageType = report.damageType || (report.electric ? 'electric' : 'gunshot');
   const impact = { x: report.directionX || 0, z: report.directionZ || 0 };
   const owner = attacker ? attacker.id : 'crop-fire';
   const vp = victim.sim.player, hpBefore = vp.hp;
   // damagePlayer applies the victim's own dodge reduction; fire is environmental.
   const dealt = victim.sim.damagePlayer(lost, owner, !attacker, false, impact.x || impact.z ? impact : null, attacker ? damageType : 'fire');
   if (this.counting) {
    victim.stats.taken += dealt;
    if (attacker && attacker !== victim) attacker.stats.dealt += dealt;
   }
   // One shot: from full health to dead in one hit (this tick's damage from
   // this attacker, or one volley the sim already calls a one-shot).
   if (hpBefore > 0 && vp.hp <= 0) this.died(victim, attacker, attacker ? damageType : 'fire', !!attacker && (hpBefore >= vp.maxHp - 1e-6 || !!report.oneShot));
  }
 }

 // Syphon (host setting, FFA): the killer, if still standing, gets back half
 // the health they had lost. The `syphon` event draws their +N.
 syphon(killer) {
  if (this.settings.syphon !== 'on') return;
  const p = killer.sim?.player; if (!p || p.dead || !(p.hp > 0)) return;
  const amount = Math.floor((p.maxHp - p.hp) * SYPHON_SHARE);
  if (amount < 1) return;
  p.hp += amount; killer.sim.events.push({ type: 'syphon', amount, x: p.x, z: p.z });
 }

 died(victim, killer, damageType = null, oneShot = false) {
  if (victim.dead) return;
  victim.dead = true;
  // Practice: no wait, nothing counted; RESPAWN on the death screen.
  victim.respawnIn = this.counting ? this.settings.respawn : 0;
  if (!this.counting) return;
  victim.stats.deaths++;
  if (killer && killer !== victim) {
   killer.stats.kills++;
   this.syphon(killer);
   // Everyone this attacker killed in this tick is one kill-feed line.
   // One-shots get a line of their own ("X one shot Y").
   const key = killer.id + (oneShot ? '|one' : ''), list = this.pendingKills.get(key) || [];
   list.push(victim.id); this.pendingKills.set(key, list);
  } else {
   this.pushFeed({ killer: null, victims: [victim.id], weapon: victim.weapon });
  }
 }

 pushFeed(entry) {
  const named = { ...entry, serial: ++this.feedSerial, killerName: entry.killer ? this.seats.get(entry.killer)?.name : null,
   victimNames: entry.victims.map(id => this.seats.get(id)?.name || '?') };
  this.feed.push(named); if (this.feed.length > 40) this.feed.shift();
  return named;
 }

 // A seat that is not in the world, or is dead, still steps (their sim keeps
 // ticking harmlessly) but with idle hands.
 inputFor(seat, input) { return seat.present && !seat.dead && this.phase === 'playing' ? input : IDLE; }

 // Step one remote seat for this tick.
 stepSeat(seat, input) {
  this.before(seat);
  seat.sim.step(this.inputFor(seat, input));
  this.after(seat);
 }

 // What every screen shows of the round: phase, mode, time left (or the
 // results), and the round number.
 matchState() {
  const left = this.phase === 'playing' ? (this.counting ? this.clock : 0) : this.phase === 'results' ? this.resultsLeft : 0;
  return { phase: this.phase, mode: this.mode, map: this.mapId, left: Math.max(0, Math.round(left * 10) / 10), number: this.matchNumber,
   killLimit: this.counting ? this.settings.killLimit : 0, results: this.results };
 }

 // Once per tick, after every seat has stepped: the world, targets, respawns,
 // picks, clocks, and the kill feed for this tick.
 endTick(dt = RULES.step) {
  this.time += dt;
  const world = this.worldSim;
  // Crops burn once per tick for everyone. The world sim holds every living
  // player as a proxy, so fire reaches them; its own player is long dead.
  this.handWorld(world);
  const proxies = new Map();
  world.targets = this.living(null).map(s => {
   const p = s.sim.player, proxy = { id: s.id, kind: 'player', x: p.x, z: p.z, hp: p.hp, maxHp: p.maxHp, respawn: 0, flash: 0 };
   proxies.set(s.id, { proxy, before: p.hp, seat: s }); return proxy;
  });
  const mark = world.events.length;
  stepCrops(world, dt, (a, b) => !world.colliders.some(c => !c.playerOnly && segmentBox(a.x, a.z, b.x, b.z, c) !== null));
  for (const prop of world.props) prop.flash = Math.max(0, prop.flash - dt);
  this.transferDamage(null, proxies, world.events.slice(mark));
  world.targets = [];
  // Practice targets: flashes fade, the broken come back, the movers sway.
  for (const t of this.targets) {
   t.flash = Math.max(0, (t.flash || 0) - dt);
   if (t.respawn > 0) { t.respawn -= dt; if (t.respawn <= 0) { t.hp = t.maxHp; t.x = t.baseX = t.spawnX; t.z = t.spawnZ; world.events.push({ type: 'respawn', x: t.x, z: t.z }); } }
   if (t.moving && t.hp > 0) t.x = t.baseX + Math.sin(this.time * .72) * t.travel;
  }
  this.worldEvents = [...world.events.splice(0), ...this.pendingEvents.splice(0)];
  for (const seat of this.seats.values()) {
   if (seat.picking && this.phase === 'playing') { seat.picking.left -= dt; }
   if (!seat.present && !seat.picking) continue;
   // Time in game: in the world, not while picking a weapon.
   if (seat.present && !seat.picking) {
    seat.stats.time += dt;
    seat.stats.weaponTime[seat.weapon] = (seat.stats.weaponTime[seat.weapon] || 0) + dt;
   }
   if (seat.dead && seat.respawnIn > 0) seat.respawnIn = Math.max(0, seat.respawnIn - dt);
   if (this.phase !== 'playing') continue;
   if (seat.picking) this.tryEnter(seat);
   // FFA: back in after the wait with the same weapon (unless picking again).
   else if (seat.dead && this.counting && seat.respawnIn <= 0) this.spawn(seat);
  }
  const lines = [];
  for (const [key, victims] of this.pendingKills) { const [killer, one] = key.split('|'); lines.push(this.pushFeed({ killer, victims, oneShot: one === 'one', weapon: this.seats.get(killer)?.weapon })); }
  this.pendingKills.clear();
  // The round clock (ffa). At zero, or at the kill limit: the standings for a
  // few seconds (everyone stands still), then the lobby.
  if (this.phase === 'playing' && this.counting) {
   this.clock -= dt;
   const leader = Math.max(0, ...[...this.seats.values()].map(s => s.stats.kills));
   if (this.clock <= 0 || (this.settings.killLimit && leader >= this.settings.killLimit)) {
    const board = this.scoreboard();
    this.phase = 'results'; this.resultsLeft = RESULTS;
    this.results = { winner: board[0] && board[0].kills > 0 ? { id: board[0].id, name: board[0].name, kills: board[0].kills } : null, board };
    this.worldEvents.push({ type: 'matchEnd', number: this.matchNumber });
   }
  } else if (this.phase === 'results') {
   this.resultsLeft -= dt;
   if (this.resultsLeft <= 0) { this.endRound(); this.worldEvents.push(...this.pendingEvents.splice(0)); }
  }
  return lines;
 }

 // Ranked by kills, then fewer deaths.
 scoreboard() {
  return [...this.seats.values()].map(s => {
   const used = Object.entries(s.stats.weaponTime).sort((a, b) => b[1] - a[1])[0]?.[0] || s.weapon || null;
   return { id: s.id, name: s.name, kills: s.stats.kills, deaths: s.stats.deaths, dealt: Math.round(s.stats.dealt), taken: Math.round(s.stats.taken),
    time: Math.round(s.stats.time), weapon: used, present: s.present };
  }).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name));
 }
}
