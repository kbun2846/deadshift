import {ichorGuardFor} from '../weapons/ichor-deflect.js';
import { clearOmen } from '../weapons/omen.js';
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
//      1v1, 2v2, 2v2v2, 3v3 (v0.999a, owner: "after two players on a team
//                die, everyone respawns ... until last team or last man
//                standing, and whoever the last man's team is gets the
//                point"): elimination. Nobody comes back on their own; when
//                one side (1v1: one player) is left standing it scores a
//                point, and after ROUND_BREAK everyone comes back at full
//                health at fresh spawns. The match ends at the clock or the
//                score limit (in points).
//      practice: the map's targets are out; players can still hit each other
//                but nothing is counted; no respawn wait (RESPAWN on the
//                death screen), no clock; the weapon can be changed any time
//                (pause menu), leaving the world while picking.
//  - 'results' (ffa): the standings for RESULTS seconds, then back to 'lobby'.
// Nobody spawns inside the ground the weapon-pick camera shows (pick-view.js).
// Nothing here touches the DOM, three.js or the network.
import { interiorSpawns, pickSpawn, openSpot, openAt } from './spawn-points.js';
// s2-spawns: authored bases and FFA points (Hollow Wick).
import { hasAuthoredSpawns, teamBase, baseSpot, ffaSpot, furthestSpot } from './map-spawns.js';
import { stepCrops } from '../crops.js';
import { segmentBox } from '../simulation.js';
import { RULES, HP_STEP } from '../config/gameplay.js';
import { stormMode, stormPlan, stormAt, stormState, stormStart, stormSafeSpot } from '../storm.js';
import { Critters } from '../critters.js';
import { weaponOrDefault, WEAPONS } from '../items.js';
import { playableOr, randomPlayableWeapon } from '../weapon-maintenance.js';
import { mapColliders } from '../maps.js';
import { pickArea, inPickArea } from '../render/pick-view.js';
import { pickDuelCircle, circleState } from '../duel-circle.js';

import { MODES, SETTINGS, defaultSettings, cleanSettings, PICK, RESULTS, TEAMS, modeById, SPAWN_APART, MAX_SEATS, roundsDecided, syphonAmount } from '../config/match.js';
import { ArenaRobots, ROBOT_SETUP } from './arena-robots.js';
export { MODES, SETTINGS, defaultSettings, cleanSettings, PICK, RESULTS, TEAMS };
// Kept for older callers and tests: the defaults.
export const MATCH = Object.freeze({ respawn: SETTINGS.respawn.default, health: SETTINGS.health.default, length: SETTINGS.roundLength.default, results: RESULTS });
export const SPAWN_MODES = SETTINGS.spawnMode.values;
// Friendly fire (owner, v0.9b): a teammate's shot does half.
export const FRIENDLY_SHARE = .5;
// Elimination modes: seconds between the last kill of a point and everyone
// coming back (the fall is seen, and the dead see who won it).
export const ROUND_BREAK = 5; // (owner: "a short bit more time in between respawns")
// 1V1 (owner, 2026-09-29): a solid 3 s of aftermath, then 2-3 s of the death
// card (the killer: the stats panel with the score turning over), then both
// are back, about 5.5-6 s after the kill.
export const DUEL_BREAK = 5.6;
// The end-of-match card (owner, 2026-09-29): everyone READY starts the next
// match under the same settings; nobody deciding for this long, the lobby.
export const READY_WAIT = 90;
// Every counted mode but FFA is played by elimination.
export const eliminationMode = mode => mode !== 'ffa' && mode !== 'practice' && !!modeById(mode);
const IDLE = Object.freeze({ moveX: 0, moveZ: 0, aimX: 0, aimZ: 0 });
const newStats = () => ({ kills: 0, deaths: 0, dealt: 0, taken: 0, time: 0, weaponTime: {} });

export class Arena {
 constructor({ map, createSim, random = Math.random, settings }) {
  Object.assign(this, { map, createSim, random });
  // The world sim: owns crop burning and prop flashes, has no living player.
  this.worldSim = createSim(map);
  this.worldSim.player.hp = 0; this.worldSim.player.dead = true; this.worldSim.targets = [];
  this.world = { props: this.worldSim.props, colliders: this.worldSim.colliders, crops: this.worldSim.crops };
  // The world's animals (critters.js: Hollow Wick's goat): stepped here once
  // a tick, a target in every seat's sim, sent to the joiners in the match state.
  { const critters = new Critters(map); this.critters = critters.any ? critters : null; }
  this.noSpawn = pickArea(map);
  this.rooms = interiorSpawns(map, this.world.colliders)
   .map(room => ({ ...room, points: room.points.filter(p => !inPickArea(this.noSpawn, p.x, p.z)) })).filter(room => room.points.length);
  this.seats = new Map(); this.time = 0;
  this.feed = []; this.feedSerial = 0; this.pendingKills = new Map();
  this.settings = cleanSettings(settings); this.togetherRoom = null;
  this.mode = 'ffa'; this.mapId = map.id; this.targets = [];
  this.phase = 'lobby'; this.clock = 0; this.resultsLeft = 0; this.results = null; this.matchNumber = 0;
  this.pendingEvents = [];
  // Robot seats (arena-robots.js), each side's building this round, and why
  // the last START was refused (for the host's screen).
  this.robotSetup = { ...ROBOT_SETUP, skill: this.settings.robotSkill || ROBOT_SETUP.skill };
  this.robots = new ArenaRobots(this); this.teamRooms = new Map(); this.startError = null; this.teamKills = new Map(); this.leaves = [];
  this.points = new Map(); this.roundBreak = 0; this.roundWinner = null;
  // Rounds (startRound sets them again): rounds played, whether the match is decided, the side that forfeited, who is READY.
  this.played = 0; this.decided = false; this.forfeited = null; this.ready = new Set();
 }

 // A player joins. `sim` is the host's own (main.js) sim for the host seat.
 // Mid-round they go straight to the weapon pick.
 // Mid-round, in a mode with a fixed number of seats: a robot filling a seat
 // steps aside for them (they take its side); with no seat free they sit out
 // on the bench until the next round.
 addSeat(id, name, sim = null, { robot = false } = {}) {
  sim ||= this.createSim(this.map);
  sim.worldAuthority = false; sim.targets = []; sim.otherPlayers = []; sim.dev = { speed: 1 }; sim.critters = this.critters;
  sim.player.id = id; sim.player.hp = 0; sim.player.dead = true;
  const seat = { id, name, sim, present: false, dead: false, respawnIn: 0, life: 0, weapon: null, picking: null,
   stats: newStats(), proxies: null, mark: 0, team: null, robot: null, bench: false };
  this.seats.set(id, seat);
  if (this.phase === 'playing' && !robot) {
   const entry = modeById(this.mode);
   if (entry?.size && this.seats.size > entry.size) {
    const stand = [...this.seats.values()].find(s => s.robot?.auto) || [...this.seats.values()].find(s => s.robot);
    if (stand) { seat.team = stand.team; this.dropSeat(stand.id); } else seat.bench = true;
   } else if (entry?.teams) seat.team = this.smallestTeam(entry);
   if (!seat.bench) this.startPick(seat);
  }
  return seat;
 }

 // A player leaving mid-round in a fixed-size mode, with robots on fill: a
 // robot takes their seat and side.
 // A seat taken out by the rules (a robot stepping aside, spare robots): the
 // host tells everyone (`leaves`, drained by HostSession).
 dropSeat(id) { if (this.seats.delete(id)) this.leaves.push(id); }

 removeSeat(id) {
  const seat = this.seats.get(id); this.seats.delete(id);
  const entry = modeById(this.mode);
  if (seat && !seat.robot && !seat.bench && this.phase === 'playing' && entry?.size) {
   const bench = [...this.seats.values()].find(s => s.bench);
   if (bench) { bench.bench = false; bench.team = seat.team; this.startPick(bench); }
   else if (this.settings.robots === 'fill') { const bot = this.robots.add({ auto: true }); if (bot) bot.team = seat.team; }
   // (Their teammates may all have voted FORFEIT already: nobody left to wait for.)
   if (seat.team) this.checkForfeit(seat.team);
  }
 }

 // + ROBOT in the lobby (or the host's tools): a robot that stays until removed.
 addRobot() { return this.seats.size < MAX_SEATS ? this.robots.add() : null; }
 removeRobot(id) { const seat = this.seats.get(id); if (!seat?.robot) return false; this.seats.delete(id); return true; }

 // Every mode but practice keeps score.
 get counting() { return this.mode !== 'practice'; }
 get elimination() { return eliminationMode(this.mode); }
 get teamMode() { return !!modeById(this.mode)?.teams; }
 // Whether a can hurt b: not themselves, and not a teammate.
 hostile(a, b) { return a !== b && (!a.team || a.team !== b.team); }
 smallestTeam(entry) {
  const count = id => [...this.seats.values()].filter(s => s.team === id).length;
  return TEAMS.slice(0, entry.teams).map(t => t.id).sort((x, y) => count(x) - count(y))[0];
 }

 // --- Host controls (lobby) -------------------------------------------------

 setSetting(key, value) {
  // (Own keys only: a message naming 'constructor' or '__proto__' must not reach .values.)
  if (!Object.hasOwn(SETTINGS, key) || !SETTINGS[key].values.includes(value)) return false;
  this.settings[key] = value;
  if (key === 'spawnMode') this.togetherRoom = null;
  // Robot skill: every robot's (like APPLY TO ALL for the skill alone).
  if (key === 'robotSkill') this.robots.tuneAll({ ...this.robotSetup, skill: value });
  return true;
 }
 setSpawnMode(mode) { return this.setSetting('spawnMode', mode); }

 // Team modes (owner, v0.9b): each player picks a side in the lobby (full
 // sides refuse more); null: no preference. Kept for the next rounds;
 // startRound deals the rest.
 chooseTeam(id, team) {
  const seat = this.seats.get(id), entry = modeById(this.mode);
  if (!seat || seat.robot || this.phase !== 'lobby') return false;
  if (team === null) { seat.wantTeam = null; return true; }
  if (!entry?.teams || !TEAMS.slice(0, entry.teams).some(t => t.id === team)) return false;
  const taken = [...this.seats.values()].filter(s => s !== seat && !s.robot && s.wantTeam === team).length;
  if (taken >= entry.per) return false;
  seat.wantTeam = team; return true;
 }
 // Who wants which side, as the lobby shows it (only in team modes).
 wantedTeam(seat) { const entry = modeById(this.mode); return entry?.teams && TEAMS.slice(0, entry.teams).some(t => t.id === seat.wantTeam) ? seat.wantTeam : null; }
 // The mode for the next round, chosen in the lobby (everyone sees it).
 setMode(mode) {
  if (this.phase !== 'lobby' || !modeById(mode)?.ready) return false;
  this.mode = mode; return true;
 }

 // A round of `mode` from the lobby (or restarted mid-round): a fresh map and
 // scores, and everyone to the weapon pick.
 //
 // Seats: robots added to fill the last round go; with robots on "fill" the
 // empty seats the mode needs (FFA: up to four) get new ones. A mode with a
 // fixed number of seats refuses to start with too many players, or too few
 // with robots off (`startError` says which). Sides are dealt round-robin,
 // players first (host, then as they joined), then robots.
 // Why START would be refused, without changing anything (null: it would
 // start). The map vote (host-session.js) asks before voting, so a round that
 // cannot start is refused at once, not after the vote. (The same first checks
 // as startRound.)
 startProblem(mode = this.mode) {
  const entry = modeById(mode);
  if (!entry?.ready) return 'Cannot start.';
  const humans = [...this.seats.values()].filter(s => !s.robot).length, kept = [...this.seats.values()].filter(s => !s.robot?.auto).length;
  if (entry.size && humans > entry.size) return entry.name + ' is for ' + entry.size + ' players';
  const fill = this.settings.robots === 'fill' && entry.fillTo ? Math.max(0, Math.min(MAX_SEATS, entry.fillTo) - kept) : 0;
  if (entry.size && Math.min(kept, entry.size) + fill < entry.size) return entry.name + ' needs ' + entry.size + ' players: add bots, or set bots to fill';
  return null;
 }

 startRound(mode = this.mode) {
  const entry = modeById(mode);
  if (!entry?.ready) return false;
  this.startError = null;
  // Every check first, so a refused START (a mid-round restart included)
  // leaves the seats as they were.
  const humans = [...this.seats.values()].filter(s => !s.robot).length, kept = [...this.seats.values()].filter(s => !s.robot?.auto).length;
  if (entry.size && humans > entry.size) { this.startError = entry.name + ' is for ' + entry.size + ' players'; return false; }
  const fill = this.settings.robots === 'fill' && entry.fillTo ? Math.max(0, Math.min(MAX_SEATS, entry.fillTo) - kept) : 0;
  if (entry.size && Math.min(kept, entry.size) + fill < entry.size) { this.startError = entry.name + ' needs ' + entry.size + ' players: add bots, or set bots to fill'; return false; }
  for (const seat of [...this.seats.values()]) if (seat.robot?.auto) this.dropSeat(seat.id);
  if (entry.size) while (this.seats.size > entry.size) { const bot = [...this.seats.values()].reverse().find(s => s.robot); if (!bot) break; this.dropSeat(bot.id); }
  if (this.settings.robots === 'fill' && entry.fillTo) while (this.seats.size < entry.fillTo && this.robots.add({ auto: true }));
  if (entry.size && this.seats.size < entry.size) { this.startError = entry.name + ' needs ' + entry.size + ' players: add bots, or set bots to fill'; return false; }
  // Sides: players who picked one first (while it has room), then the rest
  // of the players, then robots, each to the side with the fewest.
  for (const seat of this.seats.values()) { seat.team = null; seat.bench = false; }
  if (entry.teams) {
   const sides = TEAMS.slice(0, entry.teams).map(t => t.id), count = id => [...this.seats.values()].filter(s => s.team === id).length;
   const people = [...this.seats.values()].filter(s => !s.robot), bots = [...this.seats.values()].filter(s => s.robot);
   for (const seat of people) if (sides.includes(seat.wantTeam) && count(seat.wantTeam) < entry.per) seat.team = seat.wantTeam;
   for (const seat of [...people, ...bots]) if (!seat.team) seat.team = [...sides].sort((a, b) => count(a) - count(b))[0];
  }
  this.teamRooms.clear(); this.teamKills = new Map(); this.points = new Map(); this.roundBreak = 0; this.roundWinner = null; this.round = 1; this.played = 0; this.decided = false; this.forfeited = null; this.ready = new Set();
  for (const seat of this.seats.values()) seat.forfeit = false;
  this.mode = mode;
  this.resetWorld();
  this.feed = []; this.pendingKills.clear(); this.togetherRoom = null;
  this.targets = mode === 'practice' ? this.createSim(this.map).targets : [];
  // 1V1: the duel circle, a new place each round (duel-circle.js); none otherwise.
  this.duelCircle = mode === '1v1' ? this.newDuelCircle() : null;
  this.stormPlan = null; this.stormPlan = this.newStorm(); this.setStormClock(0);
  for (const seat of this.seats.values()) { seat.stats = newStats(); this.out(seat); this.startPick(seat); }
  // (Round modes have no match clock: ROUNDS ends them. FFA: the length.)
  this.phase = 'playing'; this.clock = eliminationMode(mode) ? Infinity : this.settings.roundLength; this.resultsLeft = 0; this.results = null; this.matchNumber++;
  this.pendingEvents.push({ type: 'matchStart', number: this.matchNumber, mode });
  return true;
 }
 newMatch() { return this.startRound(this.mode); }

 // Back to the lobby: everyone out of the world, the targets put away.
 endRound() {
  for (const seat of [...this.seats.values()]) { if (seat.robot?.auto) { this.seats.delete(seat.id); continue; } this.out(seat); seat.picking = null; seat.bench = false; }
  this.phase = 'lobby'; this.results = null; this.targets = []; this.duelCircle = null; this.stormPlan = null; this.setStormClock(0);
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
  for (const seat of this.seats.values()) {clearOmen(seat.sim);this.handWorld(seat.sim);}
  this.handWorld(this.worldSim);
  if (this.targets.length) this.targets = fresh.targets;
  this.critters?.reset();
  this.pendingEvents.push({ type: 'mapReset' });
 }

 // --- Players in and out of the world ----------------------------------------

 startPick(seat, keep = null) {
  if (seat.bench) return;
  // A robot picks at once: its setup's weapon, or one at random.
  if (seat.robot) { seat.picking = { left: 0, weapon: playableOr(seat.robot.setup?.weapon, null) || randomPlayableWeapon(this.random), go: true }; return; }
  seat.picking = { left: PICK.time, weapon: keep, go: false };
 }

 // A weapon picked (or changed) on the pick screen; `go` sends them in now.
 choose(id, weapon, go = true) {
  const seat = this.seats.get(id); if (!seat || this.phase !== 'playing') return false;
  if (!seat.picking) {
   // FFA: only after dying (the death screen's CHANGE WEAPON). Practice: any
   // time (the pause menu's CHANGE WEAPON), out of the world while picking.
   if (seat.present && !seat.dead) { if (this.mode !== 'practice') return false; this.out(seat); }
   this.startPick(seat);
  }
  // (A weapon under maintenance is refused: a random one instead.)
  seat.picking.weapon = playableOr(weaponOrDefault(weapon), null);
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

 // FORFEIT (owner, 2026-09-29), round modes only. 1V1: the other player
 // wins at once. Team modes: a vote; when every player on the side (robots
 // do not vote) has voted, the side forfeits and the match ends with it last.
 // Pressing again takes the vote back. Returns the side's votes and needed.
 forfeit(id, on = true) {
  const seat = this.seats.get(id);
  if (!seat || seat.robot || seat.bench || this.phase !== 'playing' || !this.elimination || this.decided) return null;
  seat.forfeit = !!on;
  return this.checkForfeit(this.sideOf(seat));
 }
 // A side whose every human has voted forfeits (looked at with each vote, and
 // when a teammate leaves: the ones still here may all have voted already).
 checkForfeit(side) {
  if (this.phase !== 'playing' || !this.elimination || this.decided) return null;
  const mates = [...this.seats.values()].filter(s => !s.robot && !s.bench && this.sideOf(s) === side);
  const votes = mates.filter(s => s.forfeit).length;
  if (mates.length && votes >= mates.length) {
   this.forfeited = side; this.decided = true; this.roundBreak = 0;
   this.pendingEvents.push({ type: 'forfeit', side, number: this.matchNumber });
  }
  return { votes, needed: mates.length };
 }
 // Each side's forfeit votes so far (only sides with any): { side: [ids] }.
 forfeitVotes() {
  const out = {};
  for (const s of this.seats.values()) if (s.forfeit && !s.robot) (out[this.sideOf(s)] ||= []).push(s.id);
  return out;
 }
 // READY on the end-of-match card (again: not ready).
 setReady(id, on = true) {
  const seat = this.seats.get(id);
  if (!seat || seat.robot || this.phase !== 'results') return false;
  if (on) this.ready.add(id); else this.ready.delete(id);
  return true;
 }

 // In the world once the pick is done and any respawn wait is over.
 tryEnter(seat) {
  const pick = seat.picking; if (!pick) return;
  const done = pick.go || pick.left <= 0;
  // (Elimination: a pick made while down is kept for when everyone comes
  // back; its time running out closes it like GO, back to spectating.)
  if (done && seat.dead && seat.respawnIn > 0) { if (this.elimination) pick.go = true; return; }
  if (!done) return;
  seat.weapon = playableOr(pick.weapon, null) || randomPlayableWeapon(this.random);
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

 // A spot inside the safe circle as it will be in a few seconds (STORM.spawnAhead),
 // open for a body and away from the pick area, as far from everyone as it finds.
 stormSpawn(others) {
  return stormSafeSpot(this.stormPlan, this.stormClock, { map: this.map, colliders: this.world.colliders, others, random: this.random, apart: SPAWN_APART, ok: (x, z) => !inPickArea(this.noSpawn, x, z) });
 }

 spawn(seat) {
  const others = [...this.seats.values()].filter(s => s !== seat && s.present && !s.dead).map(s => s.sim.player);
  // 1V1: one of the circle's two spots each, the first seat the first spot.
  const circle = this.duelCircle;
  if (circle) { const sides = [...this.seats.values()].filter(s => !s.bench), i = Math.max(0, sides.indexOf(seat)) % 2; return this.enter(seat, circle.spawns[i]); }
  // FFA with the storm closing: always inside the safe circle (owner: "new
  // player respawn in safe area"), well in from its edge and as far from
  // everyone as it can.
  if (this.storm && !this.elimination && this.storm.r < stormStart(this.map).r - 1) {
   // (The usual spots first, a room when it can, while they are safe.)
   const ahead = stormAt(this.stormPlan, this.stormClock + 6), safe = p => p && Math.hypot(p.x - ahead.x, p.z - ahead.z) < ahead.r - 3;
   for (let k = 0; k < 6; k++) { const at = hasAuthoredSpawns(this.map) ? this.authoredSpawn(seat, others) : pickSpawn(this.rooms, others, this.random, SPAWN_APART, true) || pickSpawn(this.rooms, others, this.random, 8); if (safe(at)) return this.enter(seat, at); }
   const at = this.stormSpawn(others); if (at) return this.enter(seat, at);
  }
  // s2-spawns: a map with bases and FFA points (net/map-spawns.js).
  if (hasAuthoredSpawns(this.map)) return this.enter(seat, this.authoredSpawn(seat, others));
  // Scattered (owner, v0.9b): nobody within SPAWN_APART (about a screen) of
  // anyone else, in a room or failing that in the open. "With my team" (team
  // modes): each side in its own building (picked per round, a different one
  // each while there are enough), a body apart.
  const withTeam = seat.team && this.settings.spawnMode === 'team' && this.rooms.length;
  if (!withTeam) {
   const at = pickSpawn(this.rooms, others, this.random, SPAWN_APART, true)
    || this.openOutside(others)
    || pickSpawn(this.rooms, others, this.random, 8) || this.map.spawn;
   return this.enter(seat, at);
  }
  let rooms = this.rooms, gap = 6;
  if (withTeam) {
   if (!this.teamRooms.has(seat.team)) {
    const used = new Set(this.teamRooms.values()), free = this.rooms.filter(r => !used.has(r));
    const pool = free.length ? free : this.rooms;
    this.teamRooms.set(seat.team, pool[Math.floor(this.random() * pool.length)]);
   }
   rooms = [this.teamRooms.get(seat.team)]; gap = 1.6;
  }
  const at = pickSpawn(rooms, others, this.random, gap) || pickSpawn(this.rooms, others, this.random, 1.6) || this.map.spawn;
  this.enter(seat, at);
 }

 // s2-spawns. Team modes: the side's base (whatever the spawns setting; the
 // bases are exempt from the pick-view rule). Everyone else: an FFA point a
 // screen from everyone alive (hidden from them where it can be), else an
 // open spot that far, else the point furthest from everyone.
 authoredSpawn(seat, others) {
  const entry = modeById(this.mode), colliders = this.world.colliders;
  if (seat.team && entry?.teams && this.map.bases?.length) {
   const base = teamBase(this.map, seat.team, TEAMS.slice(0, entry.teams).map(t => t.id));
   // (Not in sight of a living enemy while another point will do: map-spawns.js.)
   const enemies = [...this.seats.values()].filter(s => s !== seat && s.present && !s.dead && s.sim.player.hp > 0 && this.hostile(seat, s)).map(s => s.sim.player);
   if (base) return baseSpot(this.map, colliders, base, { others, enemies, random: this.random });
  }
  const skip = (x, z) => inPickArea(this.noSpawn, x, z);
  // (The last few FFA points used sit out a turn: map-spawns.js ffaSpot.)
  const at = ffaSpot(this.map, colliders, { others, random: this.random, space: SPAWN_APART, skip, recent: this.recentSpawns ||= [] });
  if (at) { this.recentSpawns.push(at); if (this.recentSpawns.length > 3) this.recentSpawns.shift(); return at; }
  return this.openOutside(others) || furthestSpot(this.map, colliders, others) || this.map.spawn;
 }

 // An open spot a screen from everyone, never in the weapon-pick view's ground.
 openOutside(others) {
  for (let i = 0; i < 12; i++) {
   const at = openSpot(this.map, this.world.colliders, { random: this.random, others, space: SPAWN_APART, tries: 200 });
   if (!at) return null;
   if (!inPickArea(this.noSpawn, at.x, at.z)) return at;
  }
  return null;
 }

 enter(seat, at) {
  seat.sim.weapon = seat.weapon || weaponOrDefault(null);
  seat.sim.respawn(at, seat.id);
  seat.sim.player.hp = seat.sim.player.maxHp = this.settings.health;
  // The host's own sim keeps its developer settings (host-only dev tools).
  if (seat.id !== 'host') seat.sim.dev = { speed: 1 };
  this.handWorld(seat.sim);
  seat.present = true; seat.dead = false; seat.respawnIn = 0; seat.picking = null; seat.life++;
  this.robots.spawned(seat);
 }

 living(except) { return [...this.seats.values()].filter(s => s !== except && s.present && !s.dead && s.sim.player.hp > 0); }

 handWorld(sim) { sim.critters = sim === this.worldSim ? null : this.critters; sim.props = this.world.props; sim.colliders = this.world.colliders; sim.crops = this.world.crops; sim.boundary = this.duelCircle || null; sim.storm = this.storm || null; }
 // The storm (storm.js): a new plan for this round / match (FFA: one over the
 // whole match), from the arena's random; none in practice, 1V1 or when the
 // host's developer setting turns it off.
 newStorm() {
  if (!stormMode(this.mode) || this.settings.storm === 'off') return null;
  return stormPlan(this.map, this.world.colliders, { kind: this.elimination ? 'round' : 'ffa', length: this.settings.roundLength, random: this.random, avoid: this.stormPlan ? { x: this.stormPlan.x1, z: this.stormPlan.z1 } : null });
 }
 setStormClock(t) { this.stormClock = t; this.storm = this.stormPlan ? stormAt(this.stormPlan, t) : null; }
 // The 1V1 duel circle for the next round: anywhere whole on the map, not
 // where the last one was, its two spots clear of the weapon pick's view.
 newDuelCircle() { return pickDuelCircle(this.map, this.world.colliders, { random: this.random, skip: (x, z) => inPickArea(this.noSpawn, x, z), avoid: this.duelCircle }); }

 // Living seats and every hex shield, once per tick (before() runs once per
 // seat per tick; this was worked out again for each).
 tickShared() {
  if (this.shared?.time !== this.time) {
   const living = this.living(null);
   this.shared = { time: this.time, living, shields: living.map(s => s.sim.hexShield()).filter(Boolean) };
  }
  return this.shared;
 }

 // Right before a seat's sim steps.
 before(seat) {
  const sim = seat.sim; sim.viewAspect=seat.aspect||16/9;
  this.handWorld(sim);
  seat.proxies = new Map();
  // Every hex in the round shields whoever is inside it from outside fire
  // (worked out once a tick, shared by every seat: `tickShared`).
  const shared = this.tickShared();
  sim.shields = shared.shields;
  sim.player.team = seat.team;
  const living = shared.living.filter(s => s !== seat && s.present && !s.dead && s.sim.player.hp > 0);
  // The other sides only: teammates are never hit (no friendly fire, owner
  // 2026-09-29: "make friendly fire not count anymore at all").
  const players = living.filter(other => this.hostile(seat, other)).map(other => {
   const p = other.sim.player;
   const friend = !this.hostile(seat, other);
   const proxy = { ...ichorGuardFor(other.sim), id: other.id, kind: other.robot ? 'robot' : 'player', team: other.team, friendly: friend, share: friend ? FRIENDLY_SHARE : 1, x: p.x, z: p.z, baseX: p.x, spawnX: p.x, spawnZ: p.z, hp: p.hp, maxHp: p.maxHp, respawn: 0, flash: 0, moving: false, ...(p.below ? { below: true } : {}) };
   seat.proxies.set(other.id, { proxy, before: p.hp, seat: other, x0: p.x, z0: p.z });
   return proxy;
  });
  // Practice targets: stand-ins too, so this sim never moves or revives them.
  const targets = this.targets.filter(t => t.hp > 0).map(t => {
   const proxy = { ...t, moving: false, respawn: 0 };
   seat.proxies.set(t.id, { proxy, before: t.hp, target: t });
   return proxy;
  });
  sim.targets = [...players, ...targets];
  sim.otherPlayers = living.map(o => ({ x: o.sim.player.x, z: o.sim.player.z, hp: o.sim.player.hp }));
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
  for (const { proxy, before, seat: victim, target, x0, z0 } of proxies.values()) {
   let lost = before - proxy.hp;
   // Pushed out of the attacker's hex: the real body moves too.
   if (victim && x0 !== undefined && !victim.dead && (proxy.x !== x0 || proxy.z !== z0)) { const vp = victim.sim.player; vp.x += proxy.x - x0; vp.z += proxy.z - z0; }
   if (target) {
    target.flash = Math.max(target.flash || 0, proxy.flash || 0);
    if (lost > 0 && target.hp > 0) { target.hp = Math.max(0, target.hp - lost); if (target.hp <= 0) target.respawn = RULES.targetRespawn; }
    continue;
   }
   if (lost <= 0 || victim.dead) continue;
   // A teammate's shot (friendly fire on): halved already in the attacker's
   // sim (the proxy's `share`, Simulation.hit); never a kill to their name.
   const friendly = !!attacker && attacker !== victim && !this.hostile(attacker, victim);
   const report = [...events].reverse().find(e => (e.type === 'kill' || e.type === 'hit') && e.id === victim.id) || {};
   const damageType = report.damageType || (report.electric ? 'electric' : 'gunshot');
   const impact = { x: report.directionX || 0, z: report.directionZ || 0 };
   const owner = attacker ? attacker.id : 'crop-fire';
   const vp = victim.sim.player, hpBefore = vp.hp;
   // damagePlayer applies the victim's own dodge reduction; fire is environmental.
   const dealt = victim.sim.damagePlayer(lost, owner, !attacker, false, impact.x || impact.z ? impact : null, attacker ? damageType : 'fire', attacker?.sim.player);
   if (this.counting) {
    victim.stats.taken += dealt;
    if (attacker && attacker !== victim && !friendly) attacker.stats.dealt += dealt;
   }
   // One shot: from full health to dead in one hit (this tick's damage from
   // this attacker, or one volley the sim already calls a one-shot).
   if (hpBefore > 0 && vp.hp <= 0) this.died(victim, friendly ? null : attacker, attacker ? damageType : 'fire', !friendly && !!attacker && (hpBefore >= vp.maxHp - 1e-6 || !!report.oneShot));
  }
 }

 // Syphon (host setting): the killer, if still standing, gets health back:
 // 50 in FFA, 25 in the other modes, up to full (config/match.js
 // syphonAmount). The `syphon` event draws their +N.
 syphon(killer) {
  if (this.settings.syphon !== 'on') return;
  const p = killer.sim?.player; if (!p || p.dead || !(p.hp > 0)) return;
  const amount = syphonAmount(this.mode, p.hp, p.maxHp, HP_STEP);
  if (amount < HP_STEP - 1e-9) return;
  p.hp = Math.min(p.maxHp, p.hp + amount); killer.sim.events.push({ type: 'syphon', amount, x: p.x, z: p.z });
 }

 died(victim, killer, damageType = null, oneShot = false) {
  if (victim.dead) return;
  victim.dead = true;
  // Practice: no wait, nothing counted; RESPAWN on the death screen.
  // (Elimination: never on their own; everyone comes back together, newPoint.)
  victim.respawnIn = this.elimination ? Infinity : this.counting ? this.settings.respawn : 0;
  if (!this.counting) return;
  victim.stats.deaths++;
  if (killer && killer !== victim) {
   killer.stats.kills++;
   // The side's tally lives on the round, not on the seats (a seat that
   // leaves mid-round takes its kills with it otherwise).
   if (killer.team) this.teamKills.set(killer.team, (this.teamKills.get(killer.team) || 0) + 1);
   this.syphon(killer);
   // Everyone this attacker killed in this tick is one kill-feed line.
   // One-shots get a line of their own ("X one shot Y").
   const key = killer.id + (oneShot ? '|one' : ''), list = this.pendingKills.get(key) || [];
   list.push(victim.id); this.pendingKills.set(key, list);
  } else {
   this.pushFeed({ killer: null, victims: [victim.id], weapon: victim.weapon, ...(victim.sim.lastDamageType === 'storm' ? { storm: true } : null) });
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
  const timed = this.counting && !this.elimination;
  const left = this.phase === 'playing' ? (timed ? this.clock : 0) : this.phase === 'results' ? this.resultsLeft : 0;
  return { phase: this.phase, mode: this.mode, map: this.mapId, left: Math.max(0, Math.round(left * 10) / 10), number: this.matchNumber, timed,
   killLimit: timed ? this.settings.killLimit : 0, results: this.results, teams: this.phase === 'playing' ? this.teamScores() : null,
   ...(this.phase === 'results' ? { ready: [...(this.ready || [])] } : {}),
   ...(this.duelCircle && this.phase === 'playing' ? { circle: circleState(this.duelCircle) } : {}),
   ...(this.stormPlan && this.phase === 'playing' ? { storm: stormState(this.stormPlan), stormT: Math.round(this.stormClock * 20) / 20 } : {}),
   ...(this.elimination ? { elimination: true, rounds: this.settings.rounds, played: this.played || 0, sides: this.phase === 'playing' ? this.sideScores() : null, roundBreak: Math.round(this.roundBreak * 10) / 10, roundWinner: this.roundWinner, round: this.round || 1, forfeit: this.forfeitVotes() } : {}) };
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
  this.critters?.tick(dt, this.living(null).map(s => s.sim.player));
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
  if (this.phase === 'playing' && this.elimination) this.stepElimination(dt);
  // The storm's clock: a team round's own (still between rounds), FFA the
  // match's (from its length and time left).
  if (this.phase === 'playing' && this.stormPlan) this.setStormClock(this.elimination ? this.stormClock + (this.roundBreak > 0 ? 0 : dt) : this.settings.roundLength - Math.max(0, this.clock - dt));
  const lines = [];
  for (const [key, victims] of this.pendingKills) { const [killer, one] = key.split('|'); lines.push(this.pushFeed({ killer, victims, oneShot: one === 'one', weapon: this.seats.get(killer)?.weapon })); }
  this.pendingKills.clear();
  // The round clock (ffa). At zero, or at the kill limit: the standings for a
  // few seconds (everyone stands still), then the lobby.
  if (this.phase === 'playing' && this.counting) {
   this.clock -= dt;
   // Team modes: a side's kills together.
   const teams = this.teamScores();
   const sides = this.elimination ? this.sideScores() : null;
   const leader = sides ? Math.max(0, ...sides.map(t => t.points)) : teams ? Math.max(0, ...teams.map(t => t.kills)) : Math.max(0, ...[...this.seats.values()].map(s => s.stats.kills));
   if (this.clock <= 0 || this.matchOver || (!this.elimination && this.settings.killLimit && leader >= this.settings.killLimit)) {
    const board = this.scoreboard();
    this.phase = 'results'; this.resultsLeft = READY_WAIT; this.ready = new Set();
    const topTeam = teams && teams[0].kills > 0 && (teams.length < 2 || teams[0].kills > teams[1].kills) ? teams[0] : null;
    // (A side that forfeited is last whatever its points: FORFEIT.)
    if (sides && this.forfeited) sides.sort((a, b) => (a.id === this.forfeited) - (b.id === this.forfeited) || b.points - a.points);
    const topSide = sides && (sides[0].points > 0 || this.forfeited) && (sides.length < 2 || sides[0].points > sides[1].points || (this.forfeited && sides[1].id === this.forfeited)) ? sides[0] : null;
    this.results = sides
     ? { winner: topSide ? (topSide.team ? { team: topSide.id, name: topSide.name + ' TEAM', points: topSide.points } : { id: topSide.id, name: topSide.name, points: topSide.points }) : null, board, teams, sides, points: true, draw: !!sides[0]?.points && !topSide, ...(this.forfeited ? { forfeit: this.forfeited } : {}) }
     : teams
     ? { winner: topTeam ? { team: topTeam.id, name: topTeam.name + ' TEAM', kills: topTeam.kills } : null, board, teams, draw: !!teams[0]?.kills && !topTeam }
     : { winner: board[0] && board[0].kills > 0 ? { id: board[0].id, name: board[0].name, kills: board[0].kills } : null, board };
    this.worldEvents.push({ type: 'matchEnd', number: this.matchNumber });
   }
  } else if (this.phase === 'results') {
   // The end-of-match card: everyone READY (robots always are) starts the
   // next match at once, same mode and settings; nobody deciding for
   // READY_WAIT seconds, back to the lobby.
   this.resultsLeft -= dt;
   const people = [...this.seats.values()].filter(s => !s.robot);
   if (people.length && people.every(s => this.ready.has(s.id))) { if (!this.startRound(this.mode)) this.endRound(); this.worldEvents.push(...this.pendingEvents.splice(0)); }
   else if (this.resultsLeft <= 0) { this.endRound(); this.worldEvents.push(...this.pendingEvents.splice(0)); }
  }
  return lines;
 }

 // Elimination: the sides still in it (1v1: each player a side). Seats on
 // the bench are out of it; a seat picking its first weapon of the match (not
 // dead) counts as standing, so nothing is decided during the opening pick.
 sideOf(seat) { return seat.team || seat.id; }
 stepElimination(dt) {
  if (this.roundBreak > 0) {
   this.roundBreak -= dt;
   // The deciding point: no new round, the card goes up (endTick sees `decided`).
   if (this.roundBreak <= 0) { this.roundBreak = 0; if (!this.decided) this.newPoint(); }
   return;
  }
  if (this.decided) return;
  const seats = [...this.seats.values()].filter(s => !s.bench), all = new Set(seats.map(s => this.sideOf(s)));
  if (all.size < 2) return;
  const standing = new Set(seats.filter(s => !s.dead && (s.picking || (s.present && s.sim.player.hp > 0))).map(s => this.sideOf(s)));
  if (standing.size > 1) return;
  // One side left (or, both falling in the same tick, none): its point.
  const winner = standing.size ? [...standing][0] : null;
  if (winner) this.points.set(winner, (this.points.get(winner) || 0) + 1);
  this.played = (this.played || 0) + 1;
  // ROUNDS: over once nobody can catch the leader (sideScores has every side).
  this.decided = roundsDecided(this.sideScores().map(s => s.points), this.played, this.settings.rounds);
  this.roundWinner = winner; this.roundBreak = this.mode === '1v1' ? DUEL_BREAK : ROUND_BREAK;
  this.pendingEvents.push({ type: 'pointWon', side: winner, number: this.matchNumber });
 }
 // After the last point's break the match is over (endTick puts up the card).
 get matchOver() { return this.decided && !(this.roundBreak > 0); }
 // Everyone back at full health at fresh spawns, the survivors too (a pick
 // still open is taken as it stands, or the last weapon).
 newPoint() {
  this.roundBreak = 0; this.roundWinner = null; this.teamRooms.clear(); this.round = (this.round || 1) + 1;
  if (this.mode === '1v1') this.duelCircle = this.newDuelCircle();
  // A new storm each round (its clock from nothing).
  if (this.stormPlan) { this.stormPlan = this.newStorm(); this.setStormClock(0); }
  const seats = [...this.seats.values()].filter(s => !s.bench);
  for (const seat of seats) { seat.present = false; seat.dead = false; seat.respawnIn = 0; }
  for (const seat of seats) {
   if (seat.picking) { seat.weapon = playableOr(seat.picking.weapon, null) || playableOr(seat.weapon, null) || randomPlayableWeapon(this.random); seat.picking = null; }
   this.spawn(seat);
  }
  this.pendingEvents.push({ type: 'pointStart', number: this.matchNumber });
 }
 // Elimination: each side's points, best first (1v1: each player's).
 sideScores() {
  const entry = modeById(this.mode);
  if (entry?.teams) return TEAMS.slice(0, entry.teams).map(t => ({ id: t.id, team: true, name: t.name, colour: t.colour, points: this.points.get(t.id) || 0 })).sort((a, b) => b.points - a.points);
  return [...this.seats.values()].filter(s => !s.bench).map(s => ({ id: s.id, team: false, name: s.name, points: this.points.get(s.id) || 0 })).sort((a, b) => b.points - a.points);
 }

 // Team modes: each side's kills, best first (null otherwise).
 teamScores() {
  const entry = modeById(this.mode); if (!entry?.teams) return null;
  return TEAMS.slice(0, entry.teams).map(t => ({ id: t.id, name: t.name, colour: t.colour,
   kills: this.teamKills?.get(t.id) || 0 })).sort((a, b) => b.kills - a.kills);
 }

 // Ranked by kills, then fewer deaths.
 scoreboard() {
  return [...this.seats.values()].map(s => {
   const used = Object.entries(s.stats.weaponTime).sort((a, b) => b[1] - a[1])[0]?.[0] || s.weapon || null;
   return { id: s.id, name: s.name, kills: s.stats.kills, deaths: s.stats.deaths, dealt: Math.round(s.stats.dealt), taken: Math.round(s.stats.taken),
    time: Math.round(s.stats.time), weapon: used, present: s.present, team: s.team, robot: !!s.robot };
  }).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name));
 }
}
