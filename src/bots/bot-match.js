import {ichorGuardFor} from '../weapons/ichor-deflect.js';
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
// Robots come in and come back a few seconds after dying somewhere well away
// from you (20 m or more; allies beside you), so they have to find you.
// Nobody is told where you are: a robot sees and hears like a player would
// (robot-brain.js), drifts toward you now and then, and is steered off a
// target others are already on, so a crowd of robots fights each other as
// much as you, and rarely all piles on you at once (`targeting`).
// The developer tools' robot settings (sim.dev.robot*) are read here each tick.
// Their events (shots, hits, deaths) go to the screen the way another
// player's do (WorldView.netEvent), their projectiles are drawn with yours
// (net/projectiles.js), and their bodies are drawn by remote-players.js as
// robots (slots from ROBOT_SLOT up). No DOM, no three.js here.
import { RULES, SCATTER, SURGE, OMEN, SIGHTLINE, SIDEKICK, ICHOR, SHEATH } from '../config/gameplay.js';
import { WEAPONS } from '../items.js';
import { playableOr, randomPlayableWeapon } from '../weapon-maintenance.js';
import { pack, ProjectileMirror } from '../net/projectiles.js';
import { NavGrid } from './nav-grid.js';
import { RobotBrain } from './robot-brain.js';
import { ROBOT_SLOT, ALLY_SLOT, ROBOT_SKINS, isAllySlot } from './robot-model.js';
import { makeProfile } from './robot-profile.js';
import { openSpot } from '../net/spawn-points.js';
// s2-spawns: authored bases and FFA points (Hollow Wick).
import { hasAuthoredSpawns, baseSpot, ffaSpot, spawnProblem } from '../net/map-spawns.js';
import { SIDE_COLOURS } from '../config/match.js';
import { Squads } from './squad.js';

export const ROBOT_RESPAWN = 4;          // seconds
export const MAX_ROBOTS = 8; // (SOLO 4V4: three allies and four enemies, 2026-09-29)
export const TEAMS = Object.freeze(['ffa', 'red', 'blue']);   // blue: your side
export const hostile = (a, b) => a === 'ffa' || b === 'ffa' || a !== b;
const YOU_TEAM = 'blue';
const STAT_CREDIT = 10;   // seconds a hit still counts as the kill (stats)
// What anyone can see of a gun: being reloaded, or empty.
export const reloading = sim => sim.weapon==='sidekick'?!sim.sidekick.active&&(sim.sidekick.reload>0||sim.sidekick.ammo<=0):sim.weapon==='sightline'?sim.sightline.crouched?sim.sightline.rifleReload>0||!sim.sightline.rifleAmmo:sim.sightline.pistolReload>0||!sim.sightline.pistolAmmo: sim.weapon==='omen'?sim.omen.reload>0||sim.omen.ammo<=0: sim.weapon === 'rifle' ? sim.rifle.reload > 0 || sim.rifle.ammo <= 0 : sim.weapon === 'shotgun' ? sim.shotgun.reload > 0 || sim.shotgun.ammo <= 0 : sim.ammo + sim.seeds.length < 2;
// What anyone watching can tell of someone's big (X) ability (robot behaviour
// pass 2026-09-30, robot-brain.js / engagement.js): `abilityBig`, it is going
// off or charged right now (a readied Scatter, Surge, Frenzy, a draw-cut or
// Gold Rush, Sidekick's partner, Omen's covenant): dodge it; `abilitySpent`,
// it went off in the last few seconds: the moment to press. (Static's hex is
// left out: tests/hex.test.js territory.)
const SPENT_FOR = 6;
const X_LEFT = { shotgun: s => s.scatter?.cooldown ?? 0, rifle: s => s.surge?.cooldown ?? 0, omen: s => s.omen.volleyCooldown, sightline: s => s.sightline.xCooldown, sidekick: s => s.sidekick.xCooldown, ichor: s => s.ichor.xCooldown, sheath: s => s.sheath.xCooldown };
const X_FULL = { shotgun: SCATTER.cooldown, rifle: SURGE.cooldown, omen: OMEN.volleyCooldown, sightline: SIGHTLINE.xCooldown, sidekick: SIDEKICK.xCooldown, ichor: ICHOR.xCooldown, sheath: SHEATH.xCooldown };
export const abilityBig = sim => sim.weapon === 'shotgun' ? !!sim.scatter?.armed : sim.weapon === 'rifle' ? !!sim.surge?.active : sim.weapon === 'ichor' ? sim.ichor.frenzy > 0
 : sim.weapon === 'sheath' ? !!sim.sheath.x || sim.sheath.rush > 0 : sim.weapon === 'sidekick' ? sim.sidekick.active > 0 : sim.weapon === 'omen' ? sim.omen.volleyLeft > 0 : false;
export const abilitySpent = sim => { const f = X_LEFT[sim.weapon]; return !!f && f(sim) > X_FULL[sim.weapon] - SPENT_FOR; };
export const LOUD = new Set(['sidekickShot','sidekickRush','sightlineShot','omenShot','omenVolley','omenBurst','rifleShot', 'shotgunShot', 'launch', 'explosion', 'grenadeExplosion', 'sprayStart', 'hexPulse', 'scatterFire', 'scatterBurst']);

export class BotMatch {
 constructor(map, { createSim, random = Math.random }) {
  Object.assign(this, { map, createSim, random });
  this.bots = []; this.serial = 0; this.out = []; this.noises = []; this.mirror = new ProjectileMirror(); this.nav = null;
  // Where enemies come in and come back, metres from you (1V1 brings it in).
  this.enemyRange = [22, 60];
  // Friendly fire (VS ROBOTS team modes): 0 off, else the share a teammate takes (.5).
  this.friendlyFire = 0;
  // Roles and side plans (squad.js): not everyone glued to one body.
  this.squads = new Squads(random);
  // Scattered spawns (VS ROBOTS, owner v0.9b): every robot, allies too, comes
  // in at least this far from you and every other robot (0: the usual spots).
  this.apart = 0;
  // VS ROBOTS "with my team": your robots come in beside you and the enemies
  // beside each other, each side far from the other.
  this.teamSpawn = false;
  // SOLO team modes (duel.js): on a map with bases, each side at its base
  // (your side at teamBases[2][0], the enemies at [1]), whatever the spawns
  // setting (s2-spawns).
  this.baseSpawn = false;
  this.intel = new Map(); this.clock = 0; this.youHurtBy = null; this.loud = new Set(); this.loudNext = new Set();
  // The shape of your screen (width / height; main.js keeps it current): no
  // robot fires on you from off it (robot-brain.js offScreen). 0: unknown.
  this.viewAspect = 0;
  // SOLO stats (stats-panel.js): per robot `bot.stats`, yours in `youStats`
  // ({ kills, deaths, dealt, taken }); a kill goes to whoever last hurt the
  // victim within STAT_CREDIT seconds. Plain numbers, nothing made per tick.
  this.youStats = { kills: 0, deaths: 0, dealt: 0, taken: 0 }; this.youDown = false; this.youId = 'you';
  // Robot lab (robot-lab.js): you only watch (not a target, a body or anyone's
  // leader), and what the robots do is reported to it: onDamage(ownerId,
  // victim, took), onEvent(bot, e), onFell(victim, killerId).
  this.youOut = false; this.onDamage = null; this.onEvent = null; this.onFell = null;
 }

 get active() { return this.bots.length > 0; }
 get count() { return this.bots.length; }

 // A robot with `weapon` (an id, or null for any) on `team` (TEAMS), with
 // `skill` and `style` (robot-profile.js ids, or null for any), at a spot
 // 10-18 m from you (an ally: 3-6 m) with a way to walk to you. Takes a make
 // no other robot in the game has. Returns it, or null at the limit.
 // `temper` (robot-profile.js TEMPERS): a mood that shifts; `aim`: its own
 // aim scale on top of the dev one (1V1's robot aim: sharper .7, sloppier 1.5).
 spawn(main, weapon = null, { team = 'ffa', skill = null, style = null, temper = null, aim = 1, human = false } = {}) {
  if (this.bots.length >= MAX_ROBOTS) return null;
  this.nav ||= new NavGrid(this.map, main.colliders);
  this.nav.refresh(main.colliders);
  const n = ++this.serial, ally = team === YOU_TEAM, id = (ally ? 'ally-' : 'robot-') + n;
  // A make nobody in the game is wearing (picked at random from those left).
  const taken = new Set(this.bots.map(b => b.skin));
  const free = ROBOT_SKINS.map((_, i) => i).filter(i => !taken.has(i));
  const skin = free[Math.floor(this.random() * free.length)];
  const slot = human ? 10 + Array.from({length:6},(_,i)=>i).find(i=>!this.bots.some(b=>b.slot===10+i)) : (ally ? ALLY_SLOT : ROBOT_SLOT) + skin + 1;
  const profile = makeProfile({ skill, style, temper, random: this.random });
  const sim = this.createSim(this.map);
  sim.worldAuthority = false; sim.dev = { speed: 1 }; sim.targets = []; sim.otherPlayers = [];
  sim.weapon = playableOr(weapon, null) || randomPlayableWeapon(this.random); // (not a weapon under maintenance: weapon-maintenance.js)
  const bot = { id, slot, skin, team, profile, aim, human, make: human?'human':ROBOT_SKINS[skin].id, name: (human?'PLAYER BOT ':ally ? 'ALLY ' : 'BOT ') + n, sim,
   brain: new RobotBrain({ sim, nav: this.nav, random: this.random, team, profile, slotIndex: this.bots.filter(b => b.team === team).length }), alive: true, respawnIn: 0, prev: null, stats: { kills: 0, deaths: 0, dealt: 0, taken: 0 }, lastHitBy: null, lastHitAt: 0 };
  this.place(bot, main, ...(ally ? [3, 6] : this.enemyRange));
  this.bots.push(bot);
  return bot;
 }

 place(bot, main, near, far) {
  const others = [...(main.player.hp > 0 && !main.player.dead ? [main.player] : []), ...this.living().filter(b => b !== bot).map(b => b.sim.player)];
  // s2-spawns: a map with bases and FFA points.
  const authored = this.authoredSpot(bot.team, main, others);
  if (authored) { this.putAt(bot, main, authored); return; }
  if (this.teamSpawn && this.placeWithTeam(bot, main)) return;
  const scattered = this.apart && (openSpot(this.map, main.colliders, { random: this.random, others, space: this.apart, tries: 600 }) || openSpot(this.map, main.colliders, { random: this.random, others, space: this.apart * .6, tries: 400 }));
  const at = scattered || this.spot(main.player, near, far, main.colliders) || (near > 10 && openSpot(this.map, main.colliders, { random: this.random, others: [main.player], space: near })) || this.map.spawn;
  bot.sim.respawn(at, bot.id); bot.sim.player.team = bot.team; this.hand(bot.sim, main);
  const hp = main.dev?.robotHealth; if (hp) bot.sim.player.hp = bot.sim.player.maxHp = hp;
  bot.prev = { x: at.x, z: at.z }; bot.alive = true; bot.respawnIn = 0;
  bot.brain.reset();
 }

 // s2-spawns. On a map with authored spawns (net/map-spawns.js), in SOLO:
 // a team game puts each side at its base; scattered, an FFA point `apart`
 // from everyone alive. Null: the usual spots (dev-tool robots, other maps).
 authoredSpot(team, main, others) {
  if (!hasAuthoredSpawns(this.map) || !this.apart) return null;
  if (this.baseSpawn && this.map.bases?.length) {
   const ids = this.map.teamBases?.[2] || [], id = ids[team === YOU_TEAM ? 0 : 1], base = this.map.bases.find(b => b.id === id);
   // (Not in sight of a living enemy while another point will do: map-spawns.js.)
   const enemies = [...(team !== YOU_TEAM && main.player.hp > 0 && !main.player.dead ? [main.player] : []), ...this.living().filter(b => b.team !== team).map(b => b.sim.player)];
   if (base) return baseSpot(this.map, main.colliders, base, { others, enemies, random: this.random });
  }
  // (The last few FFA points used sit out a turn: map-spawns.js ffaSpot.)
  const at = ffaSpot(this.map, main.colliders, { others, random: this.random, space: this.apart, recent: this.recentSpawns ||= [] });
  if (at) { this.recentSpawns.push(at); if (this.recentSpawns.length > 3) this.recentSpawns.shift(); }
  return at;
 }
 // You, at the start of a SOLO game and after a death (main.js): your base or
 // an FFA point, as the robots. Null on other maps.
 youSpot(main) { return this.authoredSpot(YOU_TEAM, main, this.living().map(b => b.sim.player)); }
 putAt(bot, main, at) {
  bot.sim.respawn(at, bot.id); bot.sim.player.team = bot.team; this.hand(bot.sim, main);
  const hp = main.dev?.robotHealth; if (hp) bot.sim.player.hp = bot.sim.player.maxHp = hp;
  bot.prev = { x: at.x, z: at.z }; bot.alive = true; bot.respawnIn = 0;
  bot.brain.reset();
 }

 // With my team: an ally beside you (or another ally), an enemy beside a
 // living teammate, or, the first of its side, a screen away from yours.
 placeWithTeam(bot, main) {
  const you = main.player.hp > 0 && !main.player.dead ? main.player : null;
  const mates = this.living().filter(b => b !== bot && b.team === bot.team).map(b => b.sim.player);
  const anchor = bot.team === YOU_TEAM ? you || mates[0] : mates[0];
  const foes = [...(bot.team !== YOU_TEAM && you ? [you] : []), ...this.living().filter(b => b !== bot && b.team !== bot.team).map(b => b.sim.player)];
  // Beside its side, but never on top of the other side (a mate in a close fight).
  const far = Math.max(this.apart, 26) * .6, clear = p => foes.every(f => Math.hypot(f.x - p.x, f.z - p.z) >= far);
  let at = null;
  for (let i = 0; anchor && i < 4 && !at; i++) { const s = this.spot(anchor, 2.5, 6, main.colliders); if (s && clear(s)) at = s; }
  if (!at) {
   at = openSpot(this.map, main.colliders, { random: this.random, others: foes, space: Math.max(this.apart, 26), tries: 600 });
  }
  if (!at) return false;
  bot.sim.respawn(at, bot.id); bot.sim.player.team = bot.team; this.hand(bot.sim, main);
  const hp = main.dev?.robotHealth; if (hp) bot.sim.player.hp = bot.sim.player.maxHp = hp;
  bot.prev = { x: at.x, z: at.z }; bot.alive = true; bot.respawnIn = 0;
  bot.brain.reset();
  return true;
 }

 // Where a robot comes back: allies near you, the others away from you.
 respawnAt(bot, main) { const safe = this.respawnSpot?.(bot, main); if (safe) return this.putAt(bot, main, safe); if (bot.team === YOU_TEAM) this.place(bot, main, 4, 9); else this.place(bot, main, ...this.enemyRange); }

 // An open spot between `near` and `far` metres from `from`, reachable on foot.
 spot(from, near, far, colliders = null) {
  const nav = this.nav;
  if (!nav) return null;
  // (Hills maps: the spawn rules too, not only an open nav square: stage 4
  // audit, dev-tool robots came in in the water, on steep banks, in the
  // graveyard and once in the tavern.)
  const rules = colliders && this.map.terrain ? (x, z) => !spawnProblem(this.map, colliders, x, z) : () => true;
  // Open squares are cheap to test; the route (the costly part) only for
  // the few that pass, with a capped search.
  for (let k = 0, routes = 0; k < 120 && routes < 6; k++) {
   const a = this.random() * Math.PI * 2, d = near + this.random() * (far - near);
   const x = from.x + Math.cos(a) * d, z = from.z + Math.sin(a) * d, i = nav.cellOf(x, z);
   if (i < 0 || !nav.open[i] || nav.clearance[i] < 2 || !rules(x, z)) continue;
   // Not on top of another robot either (an ally's spot is next to you anyway).
   if (near > 10 && this.living().some(b => Math.hypot(b.sim.player.x - x, b.sim.player.z - z) < 12)) continue;
   routes++;
   const route = nav.path(x, z, from.x, from.z, 20000);
   const end = route?.[route.length - 1];
   if (end && Math.hypot(end.x - from.x, end.z - from.z) < 2) return { x, z };
  }
  return null;
 }

// Developer tools: hurt or destroy every robot (dev-wiring.js).
 hurtAll(amount) { let n = 0; for (const b of this.living()) { b.sim.damagePlayer(amount, 'dev', false, false, null, 'gunshot'); n++; } return n; }
 destroyAll() { return this.hurtAll(1e6); }

 // One robot leaves (the robot lab).
 remove(bot) { const before = this.bots.length; this.bots = this.bots.filter(b => b !== bot); this.intel.forEach(seen => seen.delete(bot.id)); return this.bots.length < before; }

 clear() { this.youOut = false; this.onDamage = this.onEvent = this.onFell = null; this.onKill = null; this.respawnSpot = null; this.respawnWait = null; this.squads?.clear(); this.enemyRange = [22, 60]; this.friendlyFire = 0; this.apart = 0; this.teamSpawn = false; this.baseSpawn = false; this.bots = []; this.out = []; this.noises = []; this.mirror = new ProjectileMirror(); this.intel.clear(); this.youHurtBy = null; this.resetStats(); }

 // A new SOLO match: everyone's numbers back to nothing.
 resetStats() { for (const b of this.bots) { const s = b.stats; s.kills = s.deaths = s.dealt = s.taken = 0; b.lastHitBy = null; } const y = this.youStats; y.kills = y.deaths = y.dealt = y.taken = 0; }

 byId(id) { for (const b of this.bots) if (b.id === id) return b; return null; }

 // A robot went down (once per death): its death, and the kill to whoever last hurt it.
 fell(bot) {
  bot.stats.deaths++;
  this.onFell?.(bot, bot.lastHitBy && this.clock - bot.lastHitAt < STAT_CREDIT ? bot.lastHitBy : null);
  if (bot.lastHitBy && this.clock - bot.lastHitAt < STAT_CREDIT) this.credit(bot.lastHitBy, bot.team);
  bot.lastHitBy = null;
 }
 // A kill for `id` ('you' or a robot) if it is against the victim's side.
 credit(id, team) {
  const killer = id === this.youId ? null : this.byId(id), side = killer ? killer.team : YOU_TEAM;
  if (!hostile(side, team)) return;
  (killer ? killer.stats : this.youStats).kills++;
  // (SOLO FFA's syphon: duel.js. `killer`: the robot, or null for you.)
  this.onKill?.(killer);
 }

 // Rows for the stats panel (ui/stats-panel.js), in its shape.
 statsRows(main, youName = 'YOU') {
  const team = this.bots.some(b => b.team !== 'ffa') ? YOU_TEAM : null, y = this.youStats;
  return [{ id: 'you', name: youName, slot: main.slot ?? 0, team, robot: false, kills: y.kills, deaths: y.deaths, dealt: Math.round(y.dealt), taken: Math.round(y.taken), weapon: main.weapon, present: true },
   ...this.bots.map(b => ({ id: b.id, name: b.name, slot: b.slot, team: b.team === 'ffa' ? null : b.team, robot: !b.human, kills: b.stats.kills, deaths: b.stats.deaths, dealt: Math.round(b.stats.dealt), taken: Math.round(b.stats.taken), weapon: b.sim.weapon, present: true }))];
 }

 // Every living hex (yours and the robots'), into one list kept from tick to tick.
 gatherShields(main) {
  const list = this.shields ||= []; list.length = 0;
  const own = main.hexShield(); if (own) list.push(own);
  for (const b of this.bots) if (b.alive && b.sim.player.hp > 0) { const sh = b.sim.hexShield(); if (sh) list.push(sh); }
  return list;
 }

 hand(sim, main) { sim.props = main.props; sim.colliders = main.colliders; sim.crops = main.crops; }

 living() { return this.bots.filter(b => b.alive && b.sim.player.hp > 0); }
 // The robots against you (target lock, aim assist, your targets).
 foes() { return this.living().filter(b => hostile(b.team, YOU_TEAM)); }

 // --- around your sim's step ---------------------------------------------------------
 before(main) {
  // With allies about, you are on their side (your hex lets them in).
  main.player.team = this.bots.some(b => b.team === YOU_TEAM) ? YOU_TEAM : undefined;
  // Every hex in the game, for every sim (Simulation.hexShield / shieldedFrom).
  main.shields = this.gatherShields(main);
  this.youId = main.player.id;
  this.proxies = null; if (!this.active || this.youOut) return;
  this.proxies = new Map();
  // Friends are bodies to bump into, not targets.
  this.youBodies = main.otherPlayers;
  main.otherPlayers = [...main.otherPlayers, ...this.living().filter(b => !hostile(b.team, YOU_TEAM)).map(b => ({ x: b.sim.player.x, z: b.sim.player.z, hp: b.sim.player.hp }))];
  // Friendly fire on: your allies stand in your targets too, taking `friendlyFire` of it.
  for (const bot of this.living()) {
   const foe = hostile(bot.team, YOU_TEAM); if (!foe && !this.friendlyFire) continue;
   const p = bot.sim.player;
   const proxy = { ...ichorGuardFor(bot.sim), id: bot.id, kind: bot.human?'player':'robot', team: bot.team, friendly: !foe, share: foe ? 1 : this.friendlyFire, x: p.x, z: p.z, baseX: p.x, spawnX: p.x, spawnZ: p.z, hp: p.hp, maxHp: p.maxHp, respawn: 0, flash: 0, moving: false, ...(p.below ? { below: true } : {}) };
   this.proxies.set(bot.id, { proxy, before: p.hp, bot, scale: 1 });
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
  this.listen(events, main.player.id);
  for (const { proxy, before, bot, scale = 1 } of this.proxies.values()) {
   // Pushed out of your hex: the robot's body moves too.
   if (proxy.x !== proxy.spawnX || proxy.z !== proxy.spawnZ) { const o = bot.sim.player; o.x += proxy.x - proxy.spawnX; o.z += proxy.z - proxy.spawnZ; }
   this.deal(bot, (before - proxy.hp) * scale, main.player.id, events);
  }
  this.proxies = null;
 }

 // Damage a robot took from `owner` (the last hit report on it names the kind).
 deal(bot, lost, owner, events) {
  if (lost <= 0 || !bot.alive) return;
  // (Stats: what it really lost, never more than it had left.)
  { const took = Math.min(lost, Math.max(0, bot.sim.player.hp)), from = owner === this.youId ? this.youStats : this.byId(owner)?.stats;
   bot.stats.taken += took; if (from && from !== bot.stats) { from.dealt += took; bot.lastHitBy = owner; bot.lastHitAt = this.clock; }
   this.onDamage?.(owner, bot, took); }
  const report = [...events].reverse().find(e => (e.type === 'kill' || e.type === 'hit') && e.id === bot.id) || {};
  const type = report.damageType || (report.electric ? 'electric' : 'gunshot');
  const impact = report.directionX || report.directionZ ? { x: report.directionX, z: report.directionZ } : null;
  bot.sim.damagePlayer(lost, owner, owner === 'crop-fire', false, impact, owner === 'crop-fire' ? 'fire' : type);
 }

 // Gunfire and blasts the robots can hear.
 listen(events, who = null) { for (const e of events) if (LOUD.has(e.type)) { this.noises.push({ x: e.x ?? 0, z: e.z ?? 0 }); if (who) this.loudNext.add(who); } }

 // --- the robots' own ticks ----------------------------------------------------------------
 step(main, dt = RULES.step) {
  if (!this.active) return;
  // Dev "freeze game": robots and everything they fired hold still.
  if (main.dev?.freeze) { this.noises.length = 0; return; }
  const heard = this.noises.splice(0);
  // Who fired since the last tick (a robot sees a gun go off at it).
  this.loud = this.loudNext || new Set(); this.loudNext = new Set();
  // The tick's allowance for costly searches, shared by every robot.
  if (this.nav) this.nav.budget = { search: 2, path: 3 };
  // (Hex fix, 2026-09-30: again after your step, so a hex you just threw
  // already keeps the robots out on this tick.)
  this.gatherShields(main);
  const you = main.player, youHere = you.hp > 0 && !you.dead && !main.dev.ghost && !this.youOut;
  // (Stats: your death, once, to whoever hurt you in the last few seconds.)
  this.youId = you.id;
  if (you.dead && !this.youDown) { this.youDown = true; this.youStats.deaths++; const by = this.youHurtBy; if (by && this.clock - by.at < STAT_CREDIT) this.credit(by.id, YOU_TEAM); } else if (!you.dead) this.youDown = false;
  const dev = main.dev || {}, passive = !!dev.robotPassive;
  // Who is already after whom: a target others are on is less tempting.
  const targeting = new Map();
  for (const b of this.living()) { const t = b.brain.targetId; if (t != null && b.brain.memory.get(t)?.visible) targeting.set(t, (targeting.get(t) || 0) + 1); }
  const grenades = [main, ...this.bots.map(b => b.sim)].flatMap(s => s.grenades.filter(g => g.released).map(g => ({ x: g.targetX, z: g.targetZ })));
  this.squads.update(this.bots, this.clock, new Set([YOU_TEAM]));
  for (const bot of this.bots) {
   const sim = bot.sim, p = sim.player;
   const lead = this.squads.leaderFor(bot, youHere && bot.team === YOU_TEAM);
   if (bot.alive && p.dead) {
    // Killed by someone else's step: its death is already in its events.
    const events = sim.events.splice(0), shooter = { x: p.x, z: p.z, aimX: p.aimX, aimZ: p.aimZ, vx: 0, vz: 0 };
    for (const e of events) { if (e.type === 'playerDeath') { e.weapon = sim.weapon; } this.out.push({ e, shooter, slot: bot.slot }); this.onEvent?.(bot, e); }
    bot.alive = false; bot.respawnIn = this.respawnWait ?? ROBOT_RESPAWN; this.fell(bot); continue;
   }
   if (!bot.alive) {
    // (SOLO 1V1/2V2/3V3, v0.999a: nobody comes back until a side is out, duel.js.)
    if (dev.robotStayDead || this.holdRespawns) continue;
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
    if (hostile(bot.team, YOU_TEAM) && !passive) {
     const proxy = { ...ichorGuardFor(main), id: you.id, kind: 'player', team: main.player.team, x: you.x, z: you.z, baseX: you.x, spawnX: you.x, spawnZ: you.z, hp: you.hp, maxHp: you.maxHp, respawn: 0, flash: 0, moving: false, ...(you.below ? { below: true } : {}) };
     proxies.set(you.id, { proxy, before: you.hp, you: true });
     enemies.push({ id: you.id, human: true, aspect: this.viewAspect || 0, x: you.x, z: you.z, vx: you.vx, vz: you.vz, hp: you.hp, maxHp: you.maxHp, weapon: main.weapon, ...(you.sightline?{sightline:you.sightline,below:!!you.below}:{}), aimX: you.aimX, aimZ: you.aimZ, loud: this.loud.has(you.id), reloading: reloading(main), spent: abilitySpent(main), big: abilityBig(main) });
    } else if (!hostile(bot.team, YOU_TEAM)) {
     friends.push({ id: you.id, leader: lead === 'human', busy: (this.youHurtBy && this.clock - this.youHurtBy.at < 3) || this.loud.has(you.id), x: you.x, z: you.z, vx: you.vx, vz: you.vz, aimX: you.aimX, aimZ: you.aimZ, hp: you.hp, maxHp: you.maxHp, hurtBy: this.youHurtBy });
     if (this.friendlyFire) proxies.set(you.id, { proxy: { ...ichorGuardFor(main), id: you.id, kind: 'player', team: YOU_TEAM, friendly: true, share: this.friendlyFire, x: you.x, z: you.z, baseX: you.x, spawnX: you.x, spawnZ: you.z, hp: you.hp, maxHp: you.maxHp, respawn: 0, flash: 0, moving: false, ...(you.below ? { below: true } : {}) }, before: you.hp, you: true, scale: 1 });
    }
   }
   for (const other of this.living()) {
    if (other === bot) continue;
    const o = other.sim.player;
    bodies.push(o);
    if (!hostile(bot.team, other.team)) {
     friends.push({ id: other.id, leader: other.id === lead, busy: this.loud.has(other.id) || other.brain.mode === 'engage', x: o.x, z: o.z, vx: o.vx, vz: o.vz, aimX: o.aimX, aimZ: o.aimZ, hp: o.hp, maxHp: o.maxHp });
     if (this.friendlyFire) proxies.set(other.id, { proxy: { ...ichorGuardFor(other.sim), id: other.id, kind: other.human?'player':'robot', team: other.team, friendly: true, share: this.friendlyFire, x: o.x, z: o.z, baseX: o.x, spawnX: o.x, spawnZ: o.z, hp: o.hp, maxHp: o.maxHp, respawn: 0, flash: 0, moving: false, ...(o.below ? { below: true } : {}) }, before: o.hp, bot: other, scale: 1 });
     continue;
    }
    const proxy = { ...ichorGuardFor(other.sim), id: other.id, kind: other.human?'player':'robot', team: other.team, x: o.x, z: o.z, baseX: o.x, spawnX: o.x, spawnZ: o.z, hp: o.hp, maxHp: o.maxHp, respawn: 0, flash: 0, moving: false, ...(o.below ? { below: true } : {}) };
    proxies.set(other.id, { proxy, before: o.hp, bot: other });
    enemies.push({ id: other.id, x: o.x, z: o.z, vx: o.vx, vz: o.vz, hp: o.hp, maxHp: o.maxHp, weapon: other.sim.weapon, ...(o.sightline?{sightline:o.sightline,below:!!o.below}:{}), aimX: o.aimX, aimZ: o.aimZ, loud: this.loud.has(other.id), reloading: reloading(other.sim), spent: abilitySpent(other.sim), big: abilityBig(other.sim) });
   }
   for (const t of main.targets) {
    if (t.hp <= 0) continue;
    const proxy = { ...t, moving: false, respawn: 0 };
    proxies.set(t.id, { proxy, before: t.hp, target: t });
   }
   sim.targets = [...proxies.values()].map(e => e.proxy);
   sim.shields = this.shields || [];
   sim.otherPlayers = bodies.map(b => ({ x: b.x, z: b.z, hp: b.hp }));
   const intel = bot.team === 'ffa' ? null : this.intel.get(bot.team);
   bot.brain.aimScale = (dev.robotAim || 1) * (bot.aim || 1);
   // Others on each target, not counting this robot itself.
   const mine = bot.brain.targetId, others = new Map(targeting); if (mine != null && others.has(mine)) others.set(mine, others.get(mine) - 1);
   const input = bot.brain.step(dt, { enemies, noises: heard, grenades, bodies, friends, intel, targeting: others, seeAll: !!dev.robotSeeAll, rally: this.squads.rally(bot, friends) });
   if (dev.robotHoldFire) { input.sheathE = input.sheathX = input.ichorE = input.ichorX = input.sidekickMine = input.sidekickX = input.sightlineX = input.omenPrime = input.omenVolley = input.fire = input.tapFire = input.launch = input.spray = input.hex = input.grenade = input.doubleShot = input.surge = input.scatter = false; }
   if (dev.robotFreeze) { input.moveX = input.moveZ = 0; input.dodge = false; }
   sim.viewAspect=this.viewAspect||16/9;
   sim.step(input, dt);
   main.colliders = sim.colliders;   // what it broke stays broken
   // Everything since the last tick, including a death dealt to it by
   // someone else's step (damagePlayer reports it straight away).
   const events = sim.events.splice(0);
   // Pass on the damage it did.
   for (const entry of proxies.values()) {
    const lost = (entry.before - entry.proxy.hp) * (entry.scale ?? 1);
    // Pushed out of this robot's hex: the real body moves too.
    const moved = entry.proxy.x - entry.proxy.spawnX, movedZ = entry.proxy.z - entry.proxy.spawnZ;
    if ((moved || movedZ) && !entry.target) { const body = entry.you ? main.player : entry.bot?.sim.player; if (body) { body.x += moved; body.z += movedZ; } }
    if (entry.target) {
     const t = entry.target; t.flash = Math.max(t.flash || 0, entry.proxy.flash || 0);
     if (lost > 0 && t.hp > 0) { t.hp = Math.max(0, t.hp - lost); if (t.hp <= 0) t.respawn = RULES.targetRespawn; }
    } else if (entry.you) {
     if (lost > 0) {
      this.youHurtBy = { id: bot.id, at: this.clock };
      { const took = Math.min(lost, Math.max(0, you.hp)); this.youStats.taken += took; bot.stats.dealt += took; }
      const report = [...events].reverse().find(e => (e.type === 'kill' || e.type === 'hit') && e.id === you.id) || {};
      main.damagePlayer(lost, bot.id, false, false, report.directionX || report.directionZ ? { x: report.directionX, z: report.directionZ } : null,
       report.damageType || (report.electric ? 'electric' : 'gunshot'), p);
     }
    } else this.deal(entry.bot, lost, bot.id, events);
   }
   sim.targets = [];
   this.listen(events, bot.id);
   const shooter = { x: p.x, z: p.z, aimX: p.aimX, aimZ: p.aimZ, vx: p.vx, vz: p.vz };
   for (const e of events) {
    if (e.type === 'playerDeath') { if (bot.alive) this.fell(bot); bot.alive = false; bot.respawnIn = this.respawnWait ?? ROBOT_RESPAWN; e.weapon = sim.weapon; }
    this.out.push({ e, shooter, slot: bot.slot }); this.onEvent?.(bot, e);
   }
   if (p.dead && bot.alive) { bot.alive = false; bot.respawnIn = this.respawnWait ?? ROBOT_RESPAWN; this.fell(bot); }
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
     if (!seen.has(f.id) && Math.hypot(o.x - you.x, o.z - you.z) < 26 && main.canSeeTarget(o.x, o.z, .3)) seen.set(f.id, { id: f.id, x: o.x, z: o.z, vx: o.vx, vz: o.vz, by: you.id });
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
   const k = alpha;
   return { id: b.id, slot: b.slot, robot: !b.human, ...this.sideOf(b), hp: b.sim.player.hp, maxHp: b.sim.player.maxHp, ally: b.team === YOU_TEAM, x: prev.x + (p.x - prev.x) * k, z: prev.z + (p.z - prev.z) * k, vx: p.vx, vz: p.vz,
    aimX: p.aimX, aimZ: p.aimZ, dodgeRemaining: p.dodgeRemaining, weapon: b.sim.weapon, ...(p.ichor?{ichor:{...p.ichor}}:{}),...(p.sidekick?{sidekick:{...p.sidekick}}:{}), ...(p.sightline?{sightline:{...p.sightline}}:{}),...(p.sheath?{sheath:{...p.sheath}}:{}), ...(p.below ? { below: true } : {}) };
  });
 }

 // Team games: the robot's side (its team id: cyan yours, amber theirs),
 // with the ring to match.
 sideOf(b) {
  const side = b.team === YOU_TEAM || this.bots.some(o => o.team === YOU_TEAM) ? b.team : null;
  return SIDE_COLOURS[side] ? { side, ring: SIDE_COLOURS[side].ring } : {};
 }

 // Their projectiles, for drawing with yours (net/projectiles.js drawSim).
 foreign(now) {
  // Repacked once per robot tick, not every drawn frame.
  if (this.packedAt !== this.clock) { this.packedAt = this.clock; const packed = {}; for (const b of this.bots) if (b.alive) packed[b.slot] = pack(b.sim); this.mirror.update(packed, now); }
  return this.mirror.lists(now, slot => this.bots.find(b=>b.slot===slot)?.team !== YOU_TEAM);
 }

 // For target lock and aim assist: living robots as targets.
 lockPool() { return this.foes().map(b => { const p = b.sim.player; return { id: b.id, kind: b.human?'player':'robot', x: p.x, z: p.z, vx: p.vx, vz: p.vz, dodgeRemaining: p.dodgeRemaining || 0, hp: p.hp, maxHp: p.maxHp }; }); }
}
