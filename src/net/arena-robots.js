// Robots in a multiplayer round (owner, v0.9b): a robot is a seat of the
// arena like any player, with its own Simulation, stepped by the host every
// tick with an input its RobotBrain makes (bots/robot-brain.js), exactly as a
// joiner's seat is stepped with the input that arrives over the wire. So the
// weapons, damage, deaths, respawns, kill feed and scoreboard need nothing new.
//
// The host adds them: robots "fill empty seats" (SETTINGS.robots) tops a
// round up to the mode's seats (MODES fillTo; FFA to four) with robots that
// leave when the round ends (`auto`), and + ROBOT in the lobby adds one that
// stays until removed. Each has a setup (weapon, skill, aim, temper: TUNE /
// APPLY TO ALL in the lobby, `tune` / `tuneAll`); always a blend of
// styles (bots/robot-profile.js). Each wears a make no
// other robot in the room has; its slot says so (ROBOT_SLOT + make + 1), so
// every screen draws it as a robot (remote-players.js).
//
// What a robot knows is what BotMatch gives solo robots: who it can see
// (its own sim decides), gunfire it hears (LOUD events from every seat this
// tick), what its team's robots see (shared a few times a second), the
// landing spots of live grenades, bodies to keep apart from. Teammates are
// friends (never targets); a robot on a side with a human keeps near the
// first one (`leader`), as solo allies keep near you.
import { NavGrid } from '../bots/nav-grid.js';
import { RobotBrain } from '../bots/robot-brain.js';
import { makeProfile, SKILL_LEVELS, TEMPERS } from '../bots/robot-profile.js';
import { WEAPONS } from '../items.js';
import { ROBOT_SLOT, ROBOT_SKINS } from '../bots/robot-model.js';
import { reloading, LOUD } from '../bots/bot-match.js';
import { modeById } from '../config/match.js';
import { Squads } from '../bots/squad.js';

// Each robot's setup (owner, v138): weapon (null: random each life), skill,
// aim and temper, like a SOLO robot. The host tunes one robot in the lobby
// (TUNE on its row) or gives every robot the same with APPLY TO ALL, which
// also becomes the setup of robots added after (+ ROBOT and fill).
export const ROBOT_AIMS = Object.freeze({ sharper: .7, even: 1, sloppier: 1.5 });
export const ROBOT_SETUP = Object.freeze({ weapon: null, skill: 'normal', aim: 'even', temper: 'shifting' });
export function cleanSetup(setup = {}, base = ROBOT_SETUP) {
 const ok = (v, list) => (list.includes(v) ? v : undefined);
 return {
  weapon: setup.weapon === null ? null : WEAPONS.some(w => w.id === setup.weapon) ? setup.weapon : base.weapon,
  skill: ok(setup.skill, SKILL_LEVELS) ?? base.skill,
  aim: ok(setup.aim, Object.keys(ROBOT_AIMS)) ?? base.aim,
  temper: ok(setup.temper, Object.keys(TEMPERS)) ?? base.temper,
 };
}

export class ArenaRobots {
 constructor(arena) {
  this.arena = arena; this.serial = 0; this.nav = null;
  this.noises = []; this.heard = []; this.loud = new Set(); this.loudNext = new Set(); this.intel = new Map(); this.sharedAt = -1;
  this.squads = new Squads(arena.random); this.hpSeen = new Map();
 }

 get seats() { return [...this.arena.seats.values()].filter(s => s.robot); }

 // A new robot seat. `auto`: added to fill a round (goes when it ends).
 add({ auto = false } = {}) {
  const arena = this.arena;
  const taken = new Set(this.seats.map(s => s.robot.skin));
  const free = ROBOT_SKINS.map((_, i) => i).filter(i => !taken.has(i));
  if (!free.length) return null;
  const skin = free[Math.floor(arena.random() * free.length)], n = ++this.serial;
  this.nav ||= new NavGrid(arena.map, arena.world.colliders);
  const setup = cleanSetup(arena.robotSetup), profile = this.profile(setup);
  const seat = arena.addSeat('bot-' + n, 'ROBOT ' + n, null, { robot: true });
  seat.slot = ROBOT_SLOT + skin + 1;
  seat.robot = { skin, auto, setup, profile, brain: new RobotBrain({ sim: seat.sim, nav: this.nav, random: arena.random, team: 'ffa', profile, slotIndex: n }) };
  seat.robot.brain.aimScale = ROBOT_AIMS[setup.aim];
  if (arena.phase === 'playing') { if (arena.teamMode) seat.team = arena.smallestTeam(modeById(arena.mode)); arena.startPick(seat); }
  return seat;
 }

 profile(setup) { return makeProfile({ skill: setup.skill, style: 'blend', temper: setup.temper, random: this.arena.random }); }

 // A robot's new setup (a fresh profile; a new weapon from its next life).
 tune(seat, setup) {
  if (!seat?.robot) return false;
  const next = cleanSetup(setup, seat.robot.setup), was = seat.robot.setup;
  seat.robot.setup = next;
  if (next.skill !== was.skill || next.temper !== was.temper) seat.robot.brain.pf = seat.robot.profile = this.profile(next);
  seat.robot.brain.aimScale = ROBOT_AIMS[next.aim];
  return true;
 }

 // APPLY TO ALL: every robot, and the robots still to come.
 tuneAll(setup) {
  const arena = this.arena; arena.robotSetup = cleanSetup(setup, arena.robotSetup);
  for (const seat of this.seats) this.tune(seat, arena.robotSetup);
  return true;
 }

 // Gunfire and blasts from any seat this tick (robots hear them next tick).
 hear(seatId, events) {
  for (const e of events) if (LOUD.has(e.type)) { this.noises.push({ x: e.x ?? 0, z: e.z ?? 0 }); this.loudNext.add(seatId); }
 }

 // Once per tick before the robots step: what they heard, the search
 // allowance, what each side's robots see.
 beginTick(time) {
  this.heard = this.noises.splice(0);
  this.loud = this.loudNext; this.loudNext = new Set();
  const views = this.seats.map(s => this.squadView(s)), people = new Set([...this.arena.seats.values()].filter(s => !s.robot && s.team).map(s => s.team));
  this.squads.update(views, time, people);
  // Who was hurt since last time (a teammate in a fight): health a second ago.
  if (time - (this.hpAt || -9) > 1) { this.hpAt = time; this.hpSeen = new Map([...this.arena.seats.values()].map(s => [s.id, s.sim.player.hp])); }
  if (this.nav) { this.nav.budget = { search: 2, path: 3 }; this.nav.refresh(this.arena.world.colliders); }
  if (time - this.sharedAt < .2) return;
  this.sharedAt = time; this.intel.clear();
  for (const seat of this.seats) {
   if (!seat.team || !seat.present || seat.dead) continue;
   const seen = this.intel.get(seat.team) || new Map();
   for (const m of seat.robot.brain.memory.values()) if (m.visible) seen.set(m.id, { id: m.id, x: m.x, z: m.z, vx: m.vx, vz: m.vz, by: seat.id });
   this.intel.set(seat.team, seen);
  }
 }

 // This tick's input for a robot seat (idle while out of the world).
 input(seat, dt) {
  const arena = this.arena, brain = seat.robot.brain;
  if (!seat.present || seat.dead || arena.phase !== 'playing') return null;
  brain.team = seat.team || 'ffa';
  const living = arena.living(seat), enemies = [], friends = [], bodies = [];
  const humanMate = seat.team ? living.find(o => !o.robot && o.team === seat.team) : null;
  // Roles and plans (bots/squad.js): who it keeps near, if anyone.
  const me = this.squadView(seat), lead = this.squads.leaderFor(me, !!humanMate), leader = lead === 'human' ? humanMate : lead ? arena.seats.get(lead) : null;
  for (const other of living) {
   const o = other.sim.player; bodies.push(o);
   if (!arena.hostile(seat, other)) { friends.push({ id: other.id, leader: other === leader, busy: this.loud.has(other.id) || (other.robot && other.robot.brain.mode === 'engage') || (other.sim.player.hp < (this.hpSeen.get(other.id) ?? o.hp)), x: o.x, z: o.z, vx: o.vx, vz: o.vz, aimX: o.aimX, aimZ: o.aimZ, hp: o.hp, maxHp: o.maxHp }); continue; }
   enemies.push({ id: other.id, human: !other.robot, aspect: other.aspect || 0, x: o.x, z: o.z, vx: o.vx, vz: o.vz, hp: o.hp, maxHp: o.maxHp, weapon: other.sim.weapon, aimX: o.aimX, aimZ: o.aimZ, loud: this.loud.has(other.id), reloading: reloading(other.sim) });
  }
  // Who is already after whom: a target others are on is less tempting.
  const targeting = new Map();
  for (const r of this.seats) { if (r === seat || !r.present || r.dead) continue; const t = r.robot.brain.targetId; if (t != null && r.robot.brain.memory.get(t)?.visible) targeting.set(t, (targeting.get(t) || 0) + 1); }
  const grenades = [...arena.seats.values()].flatMap(s => s.sim.grenades.filter(g => g.released).map(g => ({ x: g.targetX, z: g.targetZ })));
  const intel = seat.team ? this.intel.get(seat.team) || null : null;
  return brain.step(dt, { enemies, noises: this.heard, grenades, bodies, friends, intel, targeting, rally: this.squads.rally(me, friends) });
 }

 // What squad.js needs of a robot seat.
 squadView(seat) { return seat.squadView ||= { id: seat.id, get team() { return seat.team || 'ffa'; }, get brain() { return seat.robot.brain; }, get alive() { return seat.present && !seat.dead; }, sim: seat.sim }; }

 // Back in the world: a blank mind (like a solo robot's respawn).
 spawned(seat) { seat.robot?.brain.reset(); }
}
