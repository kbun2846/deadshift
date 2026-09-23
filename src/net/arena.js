// The multiplayer rules on the host: free-for-all in one shared world.
//
// Every player keeps their own Simulation (their body, weapon, ammo, orbs,
// reloads and cooldowns: all the code that already works for one player).
// What makes it one game is that those sims share the world and see each
// other:
//
//  - One world. Before a player's sim is stepped it is handed the shared
//    props, colliders and crops, and afterwards whatever it changed is kept
//    (a prop it broke is broken for everyone). Only the arena burns crops and
//    fades prop flashes, once per tick, on a world sim nobody plays in.
//  - Everyone else as targets. While a player's sim steps, the other living
//    players stand in its target list as stand-ins ("proxies") of kind
//    'player'. Every weapon already knows how to hit targets, so orbs,
//    bullets, pellets, grenades, blasts, the stream and the hex all hit
//    players with no weapon code changed. Afterwards the health a proxy lost
//    is dealt to the real player's sim through damagePlayer, which applies
//    dodge reduction and plays the right death (the kill event carries the
//    damage type and direction).
//  - Solid bodies. The others are also passed as otherPlayers, so bodies
//    block each other (see Simulation.movePlayer).
//
// It also runs the match: deaths, 5 second respawns in a random building,
// the kill feed (several kills from one shot are one line) and the
// scoreboard (kills, deaths, damage dealt and taken, time in game, most
// used weapon). Nothing here touches the DOM, three.js or the network.
import { interiorSpawns, pickSpawn } from './spawn-points.js';
import { stepCrops } from '../crops.js';
import { segmentBox } from '../simulation.js';
import { RULES } from '../config/gameplay.js';

export const MATCH = Object.freeze({ respawn: 5, health: 500 });
const IDLE = Object.freeze({ moveX: 0, moveZ: 0, aimX: 0, aimZ: 0 });

export class Arena {
 constructor({ map, createSim, random = Math.random }) {
  Object.assign(this, { map, createSim, random });
  // The world sim: owns crop burning and prop flashes, has no living player.
  this.worldSim = createSim(map);
  this.worldSim.player.hp = 0; this.worldSim.player.dead = true; this.worldSim.targets = [];
  this.world = { props: this.worldSim.props, colliders: this.worldSim.colliders, crops: this.worldSim.crops };
  this.rooms = interiorSpawns(map, this.world.colliders);
  this.seats = new Map(); this.time = 0;
  this.feed = []; this.feedSerial = 0; this.pendingKills = new Map();
 }

 // A player joins. `sim` is the host's own (main.js) sim for the host seat.
 addSeat(id, name, sim = null) {
  sim ||= this.createSim(this.map);
  sim.worldAuthority = false; sim.targets = []; sim.otherPlayers = []; sim.dev = { speed: 1 };
  sim.player.id = id; sim.player.hp = 0; sim.player.dead = true;
  const seat = { id, name, sim, present: false, dead: false, respawnIn: 0, life: 0, weapon: null,
   stats: { kills: 0, deaths: 0, dealt: 0, taken: 0, time: 0, weaponTime: {} }, proxies: null, mark: 0 };
  this.seats.set(id, seat);
  return seat;
 }

 removeSeat(id) { this.seats.delete(id); }

 // Weapon picked (first time, after dying, or changing mid-game): into the world.
 choose(id, weapon) {
  const seat = this.seats.get(id); if (!seat) return false;
  seat.weapon = ['static', 'rifle', 'shotgun'].includes(weapon) ? weapon : 'static';
  this.spawn(seat);
  return true;
 }

 // Back to the weapon menu: out of the world until they choose again. Their
 // orbs and grenades go with them.
 leaveWorld(id) {
  const seat = this.seats.get(id); if (!seat) return;
  seat.present = false; seat.dead = false; seat.respawnIn = 0;
  seat.sim.respawn({ x: this.map.spawn.x, z: this.map.spawn.z }, seat.id);
  seat.sim.player.hp = 0; seat.sim.player.dead = true;
 }

 spawn(seat) {
  const others = [...this.seats.values()].filter(s => s !== seat && s.present && !s.dead).map(s => s.sim.player);
  const at = pickSpawn(this.rooms, others, this.random) || this.map.spawn;
  seat.sim.weapon = seat.weapon;
  seat.sim.respawn(at, seat.id);
  seat.sim.player.hp = seat.sim.player.maxHp = MATCH.health;
  seat.sim.dev = { speed: 1 };
  this.handWorld(seat.sim);
  seat.present = true; seat.dead = false; seat.respawnIn = 0; seat.life++;
 }

 living(except) { return [...this.seats.values()].filter(s => s !== except && s.present && !s.dead && s.sim.player.hp > 0); }

 handWorld(sim) { sim.props = this.world.props; sim.colliders = this.world.colliders; sim.crops = this.world.crops; }

 // Right before a seat's sim steps.
 before(seat) {
  const sim = seat.sim;
  this.handWorld(sim);
  seat.proxies = new Map();
  sim.targets = this.living(seat).map(other => {
   const p = other.sim.player;
   const proxy = { id: other.id, kind: 'player', x: p.x, z: p.z, baseX: p.x, spawnX: p.x, spawnZ: p.z, hp: p.hp, maxHp: p.maxHp, respawn: 0, flash: 0, moving: false };
   seat.proxies.set(other.id, { proxy, before: p.hp, seat: other });
   return proxy;
  });
  sim.otherPlayers = this.living(seat).map(o => ({ x: o.sim.player.x, z: o.sim.player.z, hp: o.sim.player.hp }));
  seat.mark = sim.events.length;
 }

 // Right after it stepped: keep its world changes, pass on the damage it did.
 after(seat) {
  const sim = seat.sim, events = sim.events.slice(seat.mark);
  this.world.colliders = sim.colliders;
  for (const e of events) if (e.type === 'playerDamage') { seat.stats.taken += e.damage; }
  this.transferDamage(seat, seat.proxies, events);
  sim.targets = []; seat.proxies = null;
  // Their own blast, fire or fall: a death with nobody to credit.
  if (seat.present && !seat.dead && sim.player.hp <= 0) this.died(seat, null);
 }

 transferDamage(attacker, proxies, events) {
  if (!proxies) return;
  for (const { proxy, before, seat: victim } of proxies.values()) {
   const lost = before - proxy.hp;
   if (lost <= 0 || victim.dead) continue;
   const report = [...events].reverse().find(e => (e.type === 'kill' || e.type === 'hit') && e.id === victim.id) || {};
   const damageType = report.damageType || (report.electric ? 'electric' : 'gunshot');
   const impact = { x: report.directionX || 0, z: report.directionZ || 0 };
   const owner = attacker ? attacker.id : 'crop-fire';
   const vp = victim.sim.player, hpBefore = vp.hp;
   // damagePlayer applies the victim's own dodge reduction; fire is environmental.
   const dealt = victim.sim.damagePlayer(lost, owner, !attacker, false, impact.x || impact.z ? impact : null, attacker ? damageType : 'fire');
   victim.stats.taken += dealt;
   if (attacker && attacker !== victim) attacker.stats.dealt += dealt;
   if (hpBefore > 0 && vp.hp <= 0) this.died(victim, attacker, attacker ? damageType : 'fire');
  }
 }

 died(victim, killer) {
  if (victim.dead) return;
  victim.dead = true; victim.respawnIn = MATCH.respawn; victim.stats.deaths++;
  if (killer && killer !== victim) {
   killer.stats.kills++;
   // Everyone this attacker killed in this tick is one kill-feed line.
   const list = this.pendingKills.get(killer.id) || [];
   list.push(victim.id); this.pendingKills.set(killer.id, list);
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
 inputFor(seat, input) { return seat.present && !seat.dead ? input : IDLE; }

 // Step one remote seat for this tick.
 stepSeat(seat, input) {
  this.before(seat);
  seat.sim.step(this.inputFor(seat, input));
  this.after(seat);
 }

 // Once per tick, after every seat has stepped: the world, respawns, clocks,
 // and the kill feed for this tick.
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
  this.worldEvents = world.events.splice(0);
  for (const seat of this.seats.values()) {
   if (!seat.present) continue;
   seat.stats.time += dt;
   seat.stats.weaponTime[seat.weapon] = (seat.stats.weaponTime[seat.weapon] || 0) + dt;
   if (seat.dead) { seat.respawnIn -= dt; if (seat.respawnIn <= 0) this.spawn(seat); }
  }
  const lines = [];
  for (const [killer, victims] of this.pendingKills) lines.push(this.pushFeed({ killer, victims, weapon: this.seats.get(killer)?.weapon }));
  this.pendingKills.clear();
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
