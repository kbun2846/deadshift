// Robots in a solo game (spawned from the developer tools, for testing).
//
// Each robot is a player in every way that matters: its own Simulation (body,
// weapon, ammo, orbs, reloads, cooldowns, dodges: all the code a player
// uses), driven by a RobotBrain that produces the same input a player's
// hands do. The game joins them up the way the multiplayer host does
// (net/arena.js), without the network:
//  - One world. Every robot's sim is handed your sim's props, colliders and
//    crops before it steps, and whatever it breaks stays broken for you.
//  - Everyone else as targets. While your sim steps, each living robot stands
//    in its target list as a stand-in ("proxy", kind 'robot'), so your every
//    weapon hits robots with no weapon code changed; the health a proxy lost
//    is dealt to the robot's own sim afterwards (damagePlayer: its dodge, its
//    death). While a robot's sim steps, you (kind 'player') and the other
//    robots stand in its list the same way, and the practice targets too.
//  - Sides (`team`): 'ffa' robots fight everyone, 'red' robots are one team
//    against you and your allies, 'blue' robots are your allies. Only the
//    other side stands in anyone's target list, so shots, blasts and grenades
//    pass through friends (no friendly fire); friends still bump bodies
//    (otherPlayers). A team shares what its members see (callouts), and your
//    allies also know what you can see.
// Every robot in a game is a different make (robot-model.js ROBOT_SKINS: no
// two alike, allies included) and has its own skill and style
// (robot-profile.js); both are chosen once, at spawn, and kept through
// deaths and restarts for as long as the robot is in the game (the main
// menu or "remove all" clears them). The make is carried in the slot
// (ROBOT_SLOT / ALLY_SLOT + make + 1), so the body, its wreck and every
// event agree on it with nothing else to pass round.
// Robots come back a few seconds after dying, somewhere away from you.
// Their events (shots, hits, deaths) go to the screen the way another
// player's do (WorldView.netEvent), their projectiles are drawn with yours
// (net/projectiles.js), and their bodies are drawn by remote-players.js as
// robots (slots from ROBOT_SLOT up). No DOM, no three.js here.
import { RULES } from '../config/gameplay.js';
import { WEAPONS } from '../items.js';
import { pack, ProjectileMirror } from '../net/projectiles.js';
import { NavGrid } from './nav-grid.js';
import { RobotBrain } from './robot-brain.js';
import { ROBOT_SLOT, ALLY_SLOT, ROBOT_SKINS } from './robot-model.js';
import { makeProfile } from './robot-profile.js';

export const ROBOT_RESPAWN = 4;          // seconds
export const MAX_ROBOTS = 6;
export const TEAMS = Object.freeze(['ffa', 'red', 'blue']);   // blue: your side
export const hostile = (a, b) => a === 'ffa' || b === 'ffa' || a !== b;
const YOU_TEAM = 'blue';
const LOUD = new Set(['rifleShot', 'shotgunShot', 'launch', 'explosion', 'grenadeExplosion', 'sprayStart', 'hexPulse']);

export class BotMatch {
 constructor(map, { createSim, random = Math.random }) {
  Object.assign(this, { map, createSim, random });
  this.bots = []; this.serial = 0; this.out = []; this.noises = []; this.mirror = new ProjectileMirror(); this.nav = null;
  this.intel = new Map(); this.clock = 0; this.youHurtBy = null;
 }

 get active() { return this.bots.length > 0; }
 get count() { return this.bots.length; }

 // A robot with `weapon` (an id, or null for any) on `team` (TEAMS), with
 // `skill` and `style` (robot-profile.js ids, or null for any), at a spot
 // 10-18 m from you (an ally: 3-6 m) with a way to walk to you. Takes a make
 // no other robot in the game has. Returns it, or null at the limit.
 spawn(main, weapon = null, { team = 'ffa', skill = null, style = null } = {}) {
  if (this.bots.length >= MAX_ROBOTS) return null;
  this.nav ||= new NavGrid(this.map, main.colliders);
  this.nav.refresh(main.colliders);
  const n = ++this.serial, ally = team === YOU_TEAM, id = (ally ? 'ally-' : 'robot-') + n;
  // A make nobody in the game is wearing (picked at random from those left).
  const taken = new Set(this.bots.map(b => b.skin));
  const free = ROBOT_SKINS.map((_, i) => i).filter(i => !taken.has(i));
  const skin = free[Math.floor(this.random() * free.length)];
  const slot = (ally ? ALLY_SLOT : ROBOT_SLOT) + skin + 1;
  const profile = makeProfile({ skill, style, random: this.random });
  const sim = this.createSim(this.map);
  sim.worldAuthority = false; sim.dev = { speed: 1 }; sim.targets = []; sim.otherPlayers = [];
  sim.weapon = weapon || WEAPONS[Math.floor(this.random() * WEAPONS.length)].id;
  const bot = { id, slot, skin, team, profile, make: ROBOT_SKINS[skin].id, name: (ally ? 'ALLY ' : 'ROBOT ') + n, sim,
   brain: new RobotBrain({ sim, nav: this.nav, random: this.random, team, profile, slotIndex: this.bots.filter(b => b.team === team).length }), alive: true, respawnIn: 0, prev: null };
  this.place(bot, main, ...(ally ? [3, 6] : [10, 18]));
  this.bots.push(bot);
  return bot;
 }

 place(bot, main, near, far) {
  const at = this.spot(main.player, near, far) || this.map.spawn;
  bot.sim.respawn(at, bot.id); this.hand(bot.sim, main);
  bot.prev = { x: at.x, z: at.z }; bot.alive = true; bot.respawnIn = 0;
  bot.brain.reset();
 }

 // Where a robot comes back: allies near you, the others away from you.
 respawnAt(bot, main) { if (bot.team === YOU_TEAM) this.place(bot, main, 4, 9); else this.place(bot, main, 16, 30); }

 // An open spot between `near` and `far` metres from `from`, reachable on foot.
 spot(from, near, far) {
  const nav = this.nav;
  if (!nav) return null;
  // Open squares are cheap to test; the route (the costly part) only for
  // the few that pass, with a capped search.
  for (let k = 0, routes = 0; k < 80 && routes < 6; k++) {
   const a = this.random() * Math.PI * 2, d = near + this.random() * (far - near);
   const x = from.x + Math.cos(a) * d, z = from.z + Math.sin(a) * d, i = nav.cellOf(x, z);
   if (i < 0 || !nav.open[i] || nav.clearance[i] < 2) continue;
   routes++;
   const route = nav.path(x, z, from.x, from.z, 6000);
   const end = route?.[route.length - 1];
   if (end && Math.hypot(end.x - from.x, end.z - from.z) < 2) return { x, z };
  }
  return null;
 }

 clear() { this.bots = []; this.out = []; this.noises = []; this.mirror = new ProjectileMirror(); this.intel.clear(); this.youHurtBy = null; }

 hand(sim, main) { sim.props = main.props; sim.colliders = main.colliders; sim.crops = main.crops; }

 living() { return this.bots.filter(b => b.alive && b.sim.player.hp > 0); }
 // The robots against you (target lock, aim assist, your targets).
 foes() { return this.living().filter(b => hostile(b.team, YOU_TEAM)); }

 // --- around your sim's step ---------------------------------------------------------
 before(main) {
  this.proxies = null; if (!this.active) return;
  this.proxies = new Map();
  // Friends are bodies to bump into, not targets.
  this.youBodies = main.otherPlayers;
  main.otherPlayers = [...main.otherPlayers, ...this.living().filter(b => !hostile(b.team, YOU_TEAM)).map(b => ({ x: b.sim.player.x, z: b.sim.player.z, hp: b.sim.player.hp }))];
  for (const bot of this.foes()) {
   const p = bot.sim.player;
   const proxy = { id: bot.id, kind: 'robot', x: p.x, z: p.z, baseX: p.x, spawnX: p.x, spawnZ: p.z, hp: p.hp, maxHp: p.maxHp, respawn: 0, flash: 0, moving: false };
   this.proxies.set(bot.id, { proxy, before: p.hp, bot });
   main.targets.push(proxy);
  }
  this.mark = main.events.length;
 }

 after(main) {
  if (!this.proxies) return;
  main.otherPlayers = this.youBodies || [];
  const standIns = new Set([...this.proxies.values()].map(e => e.proxy));
  main.targets = main.targets.filter(t => !standIns.has(t));
  const events = main.events.slice(this.mark);
  this.listen(events);
  for (const { proxy, before, bot } of this.proxies.values()) this.deal(bot, before - proxy.hp, main.player.id, events);
  this.proxies = null;
 }

 // Damage a robot took from `owner` (the last hit report on it names the kind).
 deal(bot, lost, owner, events) {
  if (lost <= 0 || !bot.alive) return;
  const report = [...events].reverse().find(e => (e.type === 'kill' || e.type === 'hit') && e.id === bot.id) || {};
  const type = report.damageType || (report.electric ? 'electric' : 'gunshot');
  const impact = report.directionX || report.directionZ ? { x: report.directionX, z: report.directionZ } : null;
  bot.sim.damagePlayer(lost, owner, owner === 'crop-fire', false, impact, owner === 'crop-fire' ? 'fire' : type);
 }

 // Gunfire and blasts the robots can hear.
 listen(events) { for (const e of events) if (LOUD.has(e.type)) this.noises.push({ x: e.x ?? 0, z: e.z ?? 0 }); }

 // --- the robots' own ticks ----------------------------------------------------------------
 step(main, dt = RULES.step) {
  if (!this.active) return;
  const heard = this.noises.splice(0);
  // The tick's allowance for costly searches, shared by every robot.
  if (this.nav) this.nav.budget = { search: 2, path: 3 };
  const you = main.player, youHere = you.hp > 0 && !you.dead && !main.dev.ghost;
  const grenades = [main, ...this.bots.map(b => b.sim)].flatMap(s => s.grenades.filter(g => g.released).map(g => ({ x: g.targetX, z: g.targetZ })));
  for (const bot of this.bots) {
   const sim = bot.sim, p = sim.player;
   if (bot.alive && p.dead) {
    // Killed by someone else's step: its death is already in its events.
    const events = sim.events.splice(0), shooter = { x: p.x, z: p.z, aimX: p.aimX, aimZ: p.aimZ, vx: 0, vz: 0 };
    for (const e of events) { if (e.type === 'playerDeath') { e.weapon = sim.weapon; } this.out.push({ e, shooter, slot: bot.slot }); }
    bot.alive = false; bot.respawnIn = ROBOT_RESPAWN; continue;
   }
   if (!bot.alive) {
    bot.respawnIn -= dt;
    if (bot.respawnIn <= 0) this.respawnAt(bot, main);
    continue;
   }
   bot.prev = { x: p.x, z: p.z };
   this.hand(sim, main);
   // Everyone else, as stand-ins in this robot's world: the other side as
   // targets, everyone as bodies, friends (and you, to an ally) as friends.
   const proxies = new Map(), enemies = [], bodies = [], friends = [];
   if (youHere) {
    bodies.push(you);
    if (hostile(bot.team, YOU_TEAM)) {
     const proxy = { id: you.id, kind: 'player', x: you.x, z: you.z, baseX: you.x, spawnX: you.x, spawnZ: you.z, hp: you.hp, maxHp: you.maxHp, respawn: 0, flash: 0, moving: false };
     proxies.set(you.id, { proxy, before: you.hp, you: true });
     enemies.push({ id: you.id, x: you.x, z: you.z, vx: you.vx, vz: you.vz, hp: you.hp, maxHp: you.maxHp });
    } else friends.push({ id: you.id, leader: true, x: you.x, z: you.z, vx: you.vx, vz: you.vz, aimX: you.aimX, aimZ: you.aimZ, hp: you.hp, maxHp: you.maxHp, hurtBy: this.youHurtBy });
   }
   for (const other of this.living()) {
    if (other === bot) continue;
    const o = other.sim.player;
    bodies.push(o);
    if (!hostile(bot.team, other.team)) { friends.push({ id: other.id, x: o.x, z: o.z, vx: o.vx, vz: o.vz, aimX: o.aimX, aimZ: o.aimZ, hp: o.hp, maxHp: o.maxHp }); continue; }
    const proxy = { id: other.id, kind: 'robot', x: o.x, z: o.z, baseX: o.x, spawnX: o.x, spawnZ: o.z, hp: o.hp, maxHp: o.maxHp, respawn: 0, flash: 0, moving: false };
    proxies.set(other.id, { proxy, before: o.hp, bot: other });
    enemies.push({ id: other.id, x: o.x, z: o.z, vx: o.vx, vz: o.vz, hp: o.hp, maxHp: o.maxHp });
   }
   for (const t of main.targets) {
    if (t.hp <= 0) continue;
    const proxy = { ...t, moving: false, respawn: 0 };
    proxies.set(t.id, { proxy, before: t.hp, target: t });
   }
   sim.targets = [...proxies.values()].map(e => e.proxy);
   sim.otherPlayers = bodies.map(b => ({ x: b.x, z: b.z, hp: b.hp }));
   const intel = bot.team === 'ffa' ? null : this.intel.get(bot.team);
   const input = bot.brain.step(dt, { enemies, noises: heard, grenades, bodies, friends, intel });
   sim.step(input, dt);
   main.colliders = sim.colliders;   // what it broke stays broken
   // Everything since the last tick, including a death dealt to it by
   // someone else's step (damagePlayer reports it straight away).
   const events = sim.events.splice(0);
   // Pass on the damage it did.
   for (const entry of proxies.values()) {
    const lost = entry.before - entry.proxy.hp;
    if (entry.target) {
     const t = entry.target; t.flash = Math.max(t.flash || 0, entry.proxy.flash || 0);
     if (lost > 0 && t.hp > 0) { t.hp = Math.max(0, t.hp - lost); if (t.hp <= 0) t.respawn = RULES.targetRespawn; }
    } else if (entry.you) {
     if (lost > 0) {
      this.youHurtBy = { id: bot.id, at: this.clock };
      const report = [...events].reverse().find(e => (e.type === 'kill' || e.type === 'hit') && e.id === you.id) || {};
      main.damagePlayer(lost, bot.id, false, false, report.directionX || report.directionZ ? { x: report.directionX, z: report.directionZ } : null,
       report.damageType || (report.electric ? 'electric' : 'gunshot'));
     }
    } else this.deal(entry.bot, lost, bot.id, events);
   }
   sim.targets = [];
   this.listen(events);
   const shooter = { x: p.x, z: p.z, aimX: p.aimX, aimZ: p.aimZ, vx: p.vx, vz: p.vz };
   for (const e of events) {
    if (e.type === 'playerDeath') { bot.alive = false; bot.respawnIn = ROBOT_RESPAWN; e.weapon = sim.weapon; }
    this.out.push({ e, shooter, slot: bot.slot });
   }
   if (p.dead && bot.alive) { bot.alive = false; bot.respawnIn = ROBOT_RESPAWN; }
   // A robot killed by damage this tick falls on its next tick (Simulation.step).
  }
  this.share(main, youHere, dt);
 }

 // Callouts: what each team's members see now, for their teammates, a few
 // times a second. Your allies also get what you can see (who last hurt you
 // is noted as the damage is passed on).
 share(main, youHere, dt) {
  this.clock += dt;
  const you = main.player;
  if (this.clock - (this.sharedAt || 0) < .2) return;
  this.sharedAt = this.clock;
  for (const team of ['red', 'blue']) {
   const seen = new Map();
   for (const b of this.living()) {
    if (b.team !== team) continue;
    for (const m of b.brain.memory.values()) if (m.visible) seen.set(m.id, { id: m.id, x: m.x, z: m.z, vx: m.vx, vz: m.vz, by: b.id });
   }
   if (team === YOU_TEAM && youHere && this.bots.some(b => b.team === YOU_TEAM)) {
    for (const f of this.foes()) {
     const o = f.sim.player;
     if (!seen.has(f.id) && Math.hypot(o.x - you.x, o.z - you.z) < 26 && main.canSeeEntity(o.x, o.z, .3)) seen.set(f.id, { id: f.id, x: o.x, z: o.z, vx: o.vx, vz: o.vz, by: you.id });
    }
   }
   this.intel.set(team, seen);
  }
 }


 // Events for the screen since the last call: [{ e, shooter, slot }].
 drain() { return this.out.splice(0); }

 // Bodies to draw (remote-players.js), between ticks by `alpha`.
 others(alpha = 1) {
  return this.living().map(b => {
   const p = b.sim.player, prev = b.prev || p;
   return { id: b.id, slot: b.slot, robot: true, ally: b.team === YOU_TEAM, x: prev.x + (p.x - prev.x) * alpha, z: prev.z + (p.z - prev.z) * alpha, vx: p.vx, vz: p.vz,
    aimX: p.aimX, aimZ: p.aimZ, dodgeRemaining: p.dodgeRemaining, weapon: b.sim.weapon };
  });
 }

 // Their projectiles, for drawing with yours (net/projectiles.js drawSim).
 foreign(now) {
  const packed = {}; for (const b of this.bots) if (b.alive) packed[b.slot] = pack(b.sim);
  this.mirror.update(packed, now);
  return this.mirror.lists(now);
 }

 // For target lock and aim assist: living robots as targets.
 lockPool() { return this.foes().map(b => ({ id: b.id, kind: 'robot', x: b.sim.player.x, z: b.sim.player.z, hp: b.sim.player.hp, maxHp: b.sim.player.maxHp })); }
}
