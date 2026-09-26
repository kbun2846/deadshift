// A robot's mind: what it knows, what it wants, and the input it hands its
// Simulation each tick. It plays through exactly the input a player's hands
// produce (move, aim point, fire, aim in, reload, dodge, the weapon's other
// actions), so it moves, shoots and uses every weapon the way players do,
// under the same rules, cooldowns and ammo.
//
// What makes it clever (not harder: it misses like a person does):
//  - Senses. It sees what a player standing there could see (the bot's own
//    Simulation.canSeeEntity: roofs, walls, windows), hears gunfire and
//    blasts nearby, and feels where a hit came from. It remembers where
//    everyone was last seen and which way they were going.
//  - Plans. Real walking routes (nav-grid.js: A* over the map, kept off the
//    walls, pulled tight), re-planned when the target moves or the way gets
//    blocked; unstuck by re-planning, sidestepping, or a dodge through clutter.
//  - Fights. It keeps the range its weapon wants, strafes (switching sides at
//    uneven intervals), leads moving targets by the projectile's travel time,
//    and only fires with a clear line. When hurt, reloading or out of ammo it
//    falls back to cover it picked by walking distance (a spot the enemy
//    cannot shoot), then comes back out. It chases to the last place it saw
//    you, predicts where you went, searches around, and throws a grenade
//    over the cover you hid behind.
//  - Aims like a hand. A short reaction before the first shot, an error that
//    settles while it tracks, grows when the target jinks, and a turn speed
//    it cannot exceed. Hunting, it keeps its gun on the corner they went
//    round, so it reacts faster when they come back out.
//  - Thinks round corners. No clear shot: it walks to the nearest spot that
//    has one at its weapon's range (round the side of their cover) instead of
//    straight at them. Two on it and hurt: it falls back.
//  - Never loops. A goal that gets no nearer for a few seconds is dropped
//    (hunt gives up and searches, patrol picks somewhere else), and anyone who
//    has left the game (dead) is forgotten at once.
//  - Plays in a team (`team`, `world.friends`, `world.intel`): never shoots
//    through a friend or grenades near one, and hears teammates' callouts.
//    An ally of yours (a friend marked `leader`) keeps a place beside you
//    watching its flank, steps out of your line of fire, fights near you
//    rather than chasing across the map, goes first for whoever is hurting
//    you, and stands between you and them when you are nearly dead.
// Nothing here touches the DOM or three.js.
import { RULES, RIFLE, SHOTGUN, GRENADE, SCATTER, WADE, TERRAIN } from '../config/gameplay.js';
import { collidersAlong } from '../world/collider-grid.js';
import { segmentBox } from '../simulation.js';
import { makeProfile, stepMood } from './robot-profile.js';
import { muzzleBearing, muzzleLateral } from '../aim-damping.js';
import { onScreenOf } from '../render/camera-framing.js';

const TAU = Math.PI * 2;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// How each weapon likes to fight.
export const STYLE = Object.freeze({
 rifle: { near: 6.5, far: 14, speed: RIFLE.bulletSpeed, reach: 30 },
 shotgun: { near: 2.2, far: 5.2, speed: 85, reach: 7.5 },
 static: { near: 3.5, far: 9, speed: 30, reach: 16 },
});
// What it can see: about what a player's screen shows ahead of where it faces
// (SIGHT), and only close by behind it (SIGHT_NEAR). Nobody tells it where you
// are: it has to see you, hear you, or be hit.
export const SIGHT = 22, SIGHT_NEAR = 12, SIGHT_CONE = 1.4;   // metres, radians either side
// A player's screen reaches about this far each way from them (the camera
// shows ~38 x 26 m): no robot fires on a player from beyond it (v146).
export const OFFSCREEN_X = 17.5, OFFSCREEN_Z = 11.5;
// The camera sits south of the player looking north, so a screen shows much
// less ground to the south (10.5 m on 16:9, 8.8 m on a wide phone) than to the
// north (13.6 m). The box used to be symmetric, so a robot could open fire from
// 10.5-11.5 m south, just below the bottom edge. South now keeps the same ~2 m
// margin inside the screen as the other sides (owner, 2026-09-25).
export const OFFSCREEN_SOUTH = 8.5;
// Is a robot at (x, z) off the screen of someone standing at (tx, tz)?
// `dy` (hills): how much higher the robot's ground is than theirs. The
// camera looks down from the south at about 70 degrees, so higher ground
// leaves the top of the screen sooner (0.82 m sooner per metre up, 16:9) and
// the sides a little sooner (it is nearer the camera); the bottom barely
// changes. On flat ground (dy 0) the box is exactly as it was.
// `aspect` (owner, 2026-09-25): the shape of that player's screen, when it is
// known (you in solo; online, each joiner sends theirs with its inputs). A
// phone, a tablet or an ultrawide shows less than the box (a 19.5:9 phone
// 10.8 m north, portrait under 10 m to the sides), so the robot also checks
// the real screen (camera-framing.js onScreenOf): half a metre inside its
// sides and 2 m inside its top and bottom, the box's own margins on 16:9,
// where on flat ground it never tightens the box (on hills, with the robot
// higher, it trims a sliver off the box's south corners). Robots fighting robots, and every test,
// pass no aspect: the box alone, exactly as before.
export const OFFSCREEN_SIDE_MARGIN = .5, OFFSCREEN_END_MARGIN = 2;
export const offScreen = (x, z, tx, tz, margin = 0, dy = 0, aspect = 0) => (dy === 0
  ? Math.abs(x - tx) > OFFSCREEN_X - margin || z - tz > OFFSCREEN_SOUTH - margin || tz - z > OFFSCREEN_Z - margin
  : Math.abs(x - tx) > (OFFSCREEN_X - margin) * (1 - .03 * dy) || z - tz > OFFSCREEN_SOUTH - margin || tz - z > OFFSCREEN_Z - margin - .82 * dy)
  || (aspect > 0 && !onScreenOf(aspect, x - tx, z - tz, dy, OFFSCREEN_SIDE_MARGIN + margin, OFFSCREEN_END_MARGIN + margin));
// Gunfire and blasts: always heard within HEAR_SURE, less and less often
// out to HEAR (like the sound falloff players get, audio.js HEARING).
const HEAR_SURE = 11, HEAR = 33;

// Is the straight line from a to b free of anything a shot would hit? On
// hills (`ground`, the sim's), also not over a crest: a shot at someone the
// ground hides ends in the ground, so a reverse slope is cover.
export function shotClear(colliders, ax, az, bx, bz, pad = .04, ground = null) {
 const x0 = Math.min(ax, bx) - 1, x1 = Math.max(ax, bx) + 1, z0 = Math.min(az, bz) - 1, z1 = Math.max(az, bz) + 1;
 for (const c of collidersAlong(colliders, ax, az, bx, bz, 1)) {
  if (c.playerOnly) continue;
  // (Hills: a stump, log or low piece marked lowTop that a round flies over,
  // rifle.js roundMeets, is no cover: v0.980a. None on Deadwater.)
  if (c.lowTop && (c.height ?? 2) < TERRAIN.roundHeight) continue;
  if (c.x + c.w / 2 < x0 || c.x - c.w / 2 > x1 || c.z + c.d / 2 < z0 || c.z - c.d / 2 > z1) continue;
  if (segmentBox(ax, az, bx, bz, c, pad) !== null) return false;
 }
 // Hills: and a round from a gets to b over the ground (heightfield.js
 // flight): a retaining wall or a rise too steep for it is cover; a crest a
 // round flies over is not (robots' eyes are `sees`, apart from this).
 return !ground || ground.flat || ground.flightReaches(ax, az, bx, bz);
}

export class RobotBrain {
 constructor({ sim, nav, random = Math.random, team = 'ffa', slotIndex = 0, profile = null }) {
  Object.assign(this, { sim, nav, random, team, slotIndex });
  // Skill and style (robot-profile.js): how good, how bold, how it plays.
  this.pf = profile || makeProfile({ skill: 'normal', style: 'balanced', random });
  this.friends = []; this.leader = null;
  this.memory = new Map();      // id -> { x, z, vx, vz, seen (time), visible, hp }
  this.targetId = null; this.mode = 'patrol';
  this.path = null; this.pathGoal = null; this.pathAt = -9; this.goal = null;
  this.strafe = 1; this.strafeUntil = 0; this.thinkClock = 0; this.time = 0;
  this.aimAngle = null; this.aimError = { x: 0, z: 0 }; this.acquiredAt = -9; this.readyAt = 0;
  this.progress = { x: 0, z: 0, at: 0, stuck: 0 }; this.hp = null; this.hurtFrom = null; this.hurtAt = -9;
  this.burstUntil = 0; this.pauseUntil = 0; this.hexAt = -9; this.coverUntil = 0; this.lookAround = 0;
  this.debug = { mode: 'patrol', path: null };
 }

 // Back to a blank mind (a respawn).
 reset() {
  this.memory.clear(); this.path = null; this.goal = null; this.hp = null; this.targetId = null; this.investigate = null;
  this.mode = this.leader ? 'follow' : 'patrol'; this.watch = null; this.shotSpot = null; this.coverUntil = 0; this.aimAngle = null;
 }

 // One tick. `world`: { enemies: [{ id, x, z, vx, vz, hp, maxHp }], noises:
 // [{ x, z }] (gunfire and blasts this tick), grenades: [{ x, z }] (landing
 // spots of live grenades), bodies: [{ x, z }] (everyone else, to keep apart) }.
 step(dt, world) {
  const sim = this.sim, p = sim.player;
  this.time += dt;
  const input = { moveX: 0, moveZ: 0, aimX: p.aimX, aimZ: p.aimZ };
  if (p.hp <= 0 || p.dead) return input;
  this.nav.refresh(sim.colliders);
  this.friends = world.friends || []; this.leader = this.friends.find(f => f.leader) || null;
  this.lastWorld = world;
  this.sense(dt, world);
  // A tempered robot's mood moves with the fight (robot-profile.js).
  if (this.pf.temper) { const t = this.targetId != null ? this.memory.get(this.targetId) : null; stepMood(this.pf, dt, { own: p.hp / (p.maxHp || RULES.playerHealth), their: t ? (t.hp ?? RULES.playerHealth) / (t.maxHp || RULES.playerHealth) : null, random: this.random }); }
  this.thinkClock -= dt;
  if (this.thinkClock <= 0) { this.thinkClock = .1 + this.random() * .04; this.think(world); }
  const target = this.targetId != null ? this.memory.get(this.targetId) : null;
  this.move(dt, input, world, target);
  this.aim(dt, input, target);
  this.act(dt, input, target, world);
  this.debug.mode = this.mode; this.debug.path = this.path;
  return input;
 }

 // --- senses -------------------------------------------------------------------
 sense(dt, world) {
  const p = this.sim.player;
  // Anyone no longer in the game (dead, waiting to come back) is forgotten:
  // no chasing, aiming at or hiding from a ghost.
  if (this.memory.size) {
   for (const id of this.memory.keys()) if (!world.enemies.some(e => e.id === id)) { this.memory.delete(id); if (this.targetId === id) this.targetId = null; }
  }
  for (const e of world.enemies) {
   const d = Math.hypot(e.x - p.x, e.z - p.z);
   const facing = this.aimAngle ?? Math.atan2(p.aimZ, p.aimX);
   const inView = d < SIGHT_NEAR || (d < SIGHT && Math.abs(wrap(Math.atan2(e.z - p.z, e.x - p.x) - facing)) < SIGHT_CONE);
   const visible = e.hp > 0 && inView && this.sim.sees(e.x, e.z, .3);
   let m = this.memory.get(e.id);
   if (!m) { m = { x: e.x, z: e.z, vx: 0, vz: 0, seen: -99, visible: false, hp: e.hp }; this.memory.set(e.id, m); }
   if (e.hp <= 0) { this.memory.delete(e.id); if (this.targetId === e.id) this.targetId = null; continue; }
   if (visible) {
    // A new sighting takes a moment to react to; less where it was already
    // aiming (pre-aimed at the corner they went round).
    if (!m.visible && this.time - m.seen > .6) {
     const preAimed = this.aimAngle != null && Math.abs(wrap(Math.atan2(e.z - p.z, e.x - p.x) - this.aimAngle)) < .3;
     this.reaction = null; // each sighting its own reaction time
     this.acquiredAt = this.time - (preAimed ? .12 : 0); this.aimError = this.newError(d, preAimed ? .6 : 1);
    }
    // Velocity smoothed from what it sees.
    m.vx += ((e.vx || 0) - m.vx) * .35; m.vz += ((e.vz || 0) - m.vz) * .35;
    m.x = e.x; m.z = e.z; m.seen = this.time; m.hp = e.hp; m.maxHp = e.maxHp;
    m.weapon = e.weapon || m.weapon; m.aimX = e.aimX ?? m.aimX; m.aimZ = e.aimZ ?? m.aimZ; m.loud = !!e.loud; m.reloading = !!e.reloading;
   }
   m.visible = visible; m.id = e.id; m.human = !!e.human; m.aspect = e.aspect || 0;
   // (Developer tools: "robots know where everyone is".)
   if (world.seeAll && !visible && e.hp > 0) { m.x = e.x; m.z = e.z; m.vx = e.vx || 0; m.vz = e.vz || 0; m.seen = this.time - .3; m.hp = e.hp; m.maxHp = e.maxHp; }
  }
  // Callouts: what teammates (and, for an ally, you) can see right now.
  if (world.intel) {
   for (const e of world.enemies) {
    const c = world.intel.get(e.id), m = this.memory.get(e.id);
    if (!c || !m || m.visible || e.hp <= 0) continue;
    if (this.time - m.seen > .3) { m.x = c.x; m.z = c.z; m.vx = c.vx; m.vz = c.vz; m.seen = this.time - .3; m.hp = e.hp; m.maxHp = e.maxHp; m.told = true; }
   }
  }
  // Heard: gunfire, blasts. Known roughly (a couple of metres off).
  for (const n of world.noises || []) {
   const nd = Math.hypot(n.x - p.x, n.z - p.z);
   if (nd > HEAR || (nd > HEAR_SURE && this.random() > (HEAR - nd) / (HEAR - HEAR_SURE) * .6)) continue;
   if (!this.targetId || !this.memory.get(this.targetId)?.visible) this.investigate = { x: n.x + (this.random() - .5) * 3, z: n.z + (this.random() - .5) * 3, at: this.time };
  }
  // Hurt: from which way, and remember it.
  if (this.hp != null && p.hp < this.hp - .5) {
   this.hurtAt = this.time; this.lastHurt = this.hp - p.hp;
   const seen = [...this.memory.values()].filter(m => m.visible);
   if (!seen.length && this.memory.size) {
    // Turn toward whoever it last knew about.
    const guess = [...this.memory.values()].sort((a, b) => b.seen - a.seen)[0];
    this.investigate = { x: guess.x, z: guess.z, at: this.time };
   }
  }
  this.hp = p.hp;
 }

 // The weapon's range band, as this robot likes it (closer for a rusher,
 // further for a marksman).
 band() {
  const s = STYLE[this.sim.weapon] || STYLE.static, r = this.pf.range;
  const b = { ...s, near: s.near * r, far: Math.min(s.reach, s.far * r) };
  // The plan for this fight (tactic(), below) bends the band: pushing in,
  // or keeping out of the reach of a shorter-ranged enemy.
  const plan = this.fight;
  if (plan?.kind === 'push') { b.near *= .75; b.far = Math.max(b.near + 1.5, b.far * .8); }
  else if (plan?.kind === 'kite' && plan.keep) { b.near = Math.max(b.near, plan.keep); b.far = Math.min(s.reach, Math.max(b.far, b.near + 2.5)); }
  return b;
 }

 // --- the plan for a fight ------------------------------------------------------------
 // How it means to fight whoever it is facing, from the circumstances: health
 // on both sides, whose weapon reaches further, whether it is loaded and its
 // ability is ready, how many it faces. One of:
 //  push    it has the edge: close in and press (abilities, grenades);
 //  kite    it outranges them: hold them at the edge of their reach;
 //  close   they outrange it: get in, round the side, through cover;
 //  fall    it is losing: back to cover, reload, come out on its terms;
 //  trade   even: the ordinary fight.
 // Worked out again every couple of seconds, and only as well as the robot
 // plays (`tech`: an easy robot often just fights, a hard one reads the fight
 // every time), with a little mood of its own so no two fights go the same.
 tactic(target, visibleCount) {
  const sim = this.sim, p = sim.player, pf = this.pf;
  if (!target) { this.fight = null; return; }
  const seize = target.reloading && this.fight?.kind !== 'push' && this.random() < pf.tech * .3;
  if (this.fight && this.time < this.fight.until && this.fight.id === target.id && !seize) return;
  const until = this.time + 1.8 + this.random() * 1.4;
  if (this.random() > pf.tech) { this.fight = { kind: 'trade', id: target.id, until }; return; }
  const mine = STYLE[sim.weapon] || STYLE.static, theirs = STYLE[target.weapon] || STYLE.static;
  const my = p.hp / (p.maxHp || RULES.playerHealth), their = (target.hp ?? 500) / (target.maxHp || RULES.playerHealth);
  const loaded = !this.outOfAmmo(), ability = this.abilityReady();
  let edge = (my - their) * 1.3 + (loaded ? .15 : -.5) + (ability ? .25 : 0) - Math.max(0, visibleCount - 1) * .45 + (pf.aggr - .5) * .6 + (this.random() - .5) * .3;
  // An ally near you fights with you, not alone.
  if (this.leader) edge += .15;
  // They are reloading or empty: the moment to go at them.
  if (target.reloading && target.visible) edge += .6;
  const reach = mine.far - theirs.far;
  let kind = 'trade', keep = 0;
  if (edge < -.4) kind = 'fall';
  else if (reach > 2.5 && edge < .6) { kind = 'kite'; keep = theirs.reach + 1.2; }
  else if (reach < -2.5) kind = 'close';
  else if (edge > .35) kind = 'push';
  this.fight = { kind, keep, id: target.id, until, edge };
 }

 // Is its weapon's ability there to use (Static's hex, Nominal's Surge,
 // Ballast's Scatter)?
 abilityReady() {
  const sim = this.sim;
  if (sim.weapon === 'rifle') return sim.surge?.phase === 'idle' && sim.surge.cooldown <= 0;
  if (sim.weapon === 'shotgun') return !!sim.scatter && sim.scatter.cooldown <= 0;
  return sim.hexCooldown <= 0 && sim.ammo >= RULES.hexCost;
 }

 newError(d, scale) {
  const a = this.random() * TAU, size = (.35 + d * .06) * scale * this.pf.aim * (this.aimScale || 1) * (.6 + this.random() * .8);
  return { x: Math.cos(a) * size, z: Math.sin(a) * size };
 }

 // --- decisions (about ten times a second) --------------------------------------
 think(world) {
  const sim = this.sim, p = sim.player, lead = this.leader;
  // The target: the visible enemy that is nearest and weakest, else the
  // freshest memory. An ally also minds whoever is near you, and most of
  // all whoever just hurt you.
  let best = null, bestScore = Infinity, visibleCount = 0;
  for (const m of this.memory.values()) {
   const d = Math.hypot(m.x - p.x, m.z - p.z), age = this.time - m.seen;
   if (age > 12) continue;
   if (m.visible) visibleCount++;
   let score = d + (m.visible ? 0 : 12 + age * 2) + (m.hp / (m.maxHp || 500)) * 4 + (m.id === this.targetId ? -3 : 0);
   // Someone others are already fighting is less tempting (more so you: a
   // crowd rarely all comes for the one player), unless it is right here.
   const on = world.targeting?.get(m.id) || 0;
   if (on && d > 5) score += on * (m.human ? 9 : 6);
   if (lead) {
    score -= Math.max(0, 9 - Math.hypot(m.x - lead.x, m.z - lead.z)) * .5;
    if (lead.hurtBy === m.id) score -= 6;
   }
   if (score < bestScore) { bestScore = score; best = m; }
  }
  this.targetId = best ? best.id : null;
  // Nothing to fight here: a teammate in a fight nearby (squad.js `rally`)
  // is where to go (help them), unless an investigation is fresher.
  if (!best && world.rally && !(this.investigate && this.time - this.investigate.at < 2)) this.investigate = { x: world.rally.x + (this.random() - .5) * 4, z: world.rally.z + (this.random() - .5) * 4, at: this.time };
  this.tactic(best && this.time - best.seen < 3 ? best : null, visibleCount);
  const style = this.band(), pf = this.pf;
  const hpShare = p.hp / (p.maxHp || RULES.playerHealth);
  const empty = this.outOfAmmo();
  const known = best, seen = best?.visible;
  const prev = this.mode;
  const fromLead = lead ? Math.hypot(lead.x - p.x, lead.z - p.z) : 0;
  // Near enough to you (an ally) to go after something there.
  const leashed = spot => !lead || Math.hypot(spot.x - lead.x, spot.z - lead.z) < 16;
  // Fall back for a moment: reloading or empty with the enemy just seen,
  // hurt badly and just hit, or hurt and facing two at once. Cover is a
  // breather, not a home (nobody heals): back out once loaded, or after a
  // few seconds.
  const hurt = this.time - this.hurtAt < 2.5;
  const fresh = known && this.time - known.seen < 1.5;
  // (A bold robot reloads in the open when the enemy is far enough off.)
  const openReload = known && Math.hypot(known.x - p.x, known.z - p.z) > pf.openReload;
  const why = fresh && empty && !openReload ? 'reload'
   : known && this.time - known.seen < 4 && hurt && (hpShare < pf.hurtAt || (visibleCount >= 2 && hpShare < pf.hurtAt + .25)) ? 'hurt'
   // Losing the fight (the plan says fall back): cover now, before it is too late.
   : known && fresh && this.fight?.kind === 'fall' && hpShare < .75 ? 'hurt' : null;
  const inCover = !!known && prev === 'cover' && (this.coverWhy === 'reload' ? empty && this.time - this.coverFrom < 6 : this.time < this.coverUntil);
  const lowLead = lead && lead.hp / (lead.maxHp || RULES.playerHealth) < .35;
  // (Hurt cover is rarer: nobody heals, so hiding only buys a moment.)
  if (inCover || (why && this.time - (this.coverEnded || -9) > (why === 'hurt' ? pf.coverRest : 1.5))) { this.mode = 'cover'; if (!inCover) this.coverWhy = why; }
  // Stand between you and whoever is on you, when you are nearly dead.
  else if (seen && lowLead && hpShare > .5 && Math.hypot(known.x - lead.x, known.z - lead.z) < 14) this.mode = 'guard';
  // An ally does not chase a fight away from you: it falls back to you,
  // shooting as it goes.
  else if (lead && fromLead > (seen ? 18 : 14)) this.mode = 'follow';
  else if (seen) this.mode = 'engage';
  else if (known && this.time - known.seen < pf.hunt && leashed(known)) this.mode = 'hunt';
  else if (this.investigate && this.time - this.investigate.at < 10 && leashed(this.investigate)) this.mode = 'investigate';
  else this.mode = lead ? 'follow' : 'patrol';
  if (prev === 'cover' && this.mode !== 'cover') this.coverEnded = this.time;
  if (this.mode === 'cover') {
   if (prev !== 'cover') { this.coverFrom = this.time; this.coverUntil = this.time + (this.coverWhy === 'hurt' ? 1.5 : 2.5) + this.random() * 1.2; }
   if (prev !== 'cover' || !this.goal || this.time - this.pathAt > 1.5) {
    // (Searches are shared out between robots: a few per tick, so a crowd
    // deciding at once does not stall a frame. None left: decide next tick.)
    if (!this.afford('search')) { if (prev !== 'cover') { this.mode = prev; this.thinkClock = .02; return; } }
    else this.goal = (known && this.findCover(known)) || null;
   }
   // Nowhere to hide: fight instead.
   if (!this.goal) { this.mode = seen ? 'engage' : known ? 'hunt' : lead ? 'follow' : 'patrol'; this.coverEnded = this.time; }
  }
  if (this.mode === 'cover') {
  } else if (this.mode === 'guard') {
   const dx = known.x - lead.x, dz = known.z - lead.z, d = Math.hypot(dx, dz) || 1;
   const spot = { x: lead.x + dx / d * Math.min(2.4, d * .5), z: lead.z + dz / d * Math.min(2.4, d * .5) };
   this.goal = Math.hypot(spot.x - p.x, spot.z - p.z) > 1 ? spot : null;
  } else if (this.mode === 'engage') {
   const d = Math.hypot(known.x - p.x, known.z - p.z);
   if (!shotClear(sim.colliders, p.x, p.z, known.x, known.z, .04, sim.ground)) {
    // No clear shot from here: the nearest place that has one, at a range
    // the weapon likes (round the side of their cover), else toward them.
    // (Stage 4 audit: a spot whose centre had a line, reached, where the
    // robot's own standing place had none, held it there a minute doing
    // nothing. Arrived and still blocked: that spot is no good for a while,
    // look again. Hills maps only, so Deadwater replays exactly as before:
    // tests/golden-flat.test.js.)
    if (!sim.ground.flat && this.shotSpot && Math.hypot(this.shotSpot.x - p.x, this.shotSpot.z - p.z) < .6) { this.markBadSpot(this.shotSpot); this.shotSpot = null; this.shotSpotAt = -1e9; }
    const s = this.shotSpot;
    if ((!s || this.time - this.shotSpotAt > 1.2 || Math.hypot(s.forX - known.x, s.forZ - known.z) > 2.5) && this.afford('search')) {
     const found = this.findShotSpot(known, style);
     this.shotSpot = found ? { ...found, forX: known.x, forZ: known.z } : null; this.shotSpotAt = this.time;
    }
    this.goal = this.shotSpot ? { x: this.shotSpot.x, z: this.shotSpot.z } : { x: known.x, z: known.z, chase: true };
   } else { this.shotSpot = null; this.goal = d > style.far ? { x: known.x, z: known.z, chase: true } : null; }
   // An ally chases no further than a few steps from you.
   if (lead && this.goal && Math.hypot(this.goal.x - lead.x, this.goal.z - lead.z) > 12) {
    const gx = this.goal.x - lead.x, gz = this.goal.z - lead.z, gl = Math.hypot(gx, gz);
    this.goal = { x: lead.x + gx / gl * 10, z: lead.z + gz / gl * 10, chase: true };
   }
  } else if (this.mode === 'hunt') {
   // Where they probably went: the last sighting, carried on along their
   // heading for a moment.
   const age = Math.min(1.6, this.time - known.seen);
   this.goal = { x: known.x + known.vx * age, z: known.z + known.vz * age };
   // There, or can see there and they are not: search round about.
   const gd = Math.hypot(this.goal.x - p.x, this.goal.z - p.z);
   if (gd < 1.2 || (gd < 7 && this.time - known.seen > 1 && sim.sees(this.goal.x, this.goal.z, .3))) this.lose(known);
  } else if (this.mode === 'investigate') {
   this.goal = this.investigate;
   if (Math.hypot(this.goal.x - p.x, this.goal.z - p.z) < 1.5) this.investigate = null;
  } else if (this.mode === 'follow') {
   // Keeps its place until you have moved on (not every turn of your aim),
   // or its place is in front of your gun.
   const from = this.followFrom, spot = this.followSpot(lead);
   const keep = this.goal?.follow && from && Math.hypot(lead.x - from.x, lead.z - from.z) < 2.5 && fromLead < 6 && !this.inLine(lead, this.goal.x, this.goal.z);
   if (!keep) { this.goal = spot; this.followFrom = { x: lead.x, z: lead.z }; }
  } else {
   if (!this.goal || this.goal.chase || this.goal.follow || Math.hypot(this.goal.x - p.x, this.goal.z - p.z) < 1.5 || this.time - this.pathAt > 20) this.goal = this.wanderSpot(world);
  }
  this.watchGoal();
  // Re-plan when the goal moved or the route is old.
  if (this.goal) {
   const moved = !this.pathGoal || Math.hypot(this.goal.x - this.pathGoal.x, this.goal.z - this.pathGoal.z) > 1.5;
   // (Not more than a few times a second: a long route costs a few ms.)
   if ((moved && this.time - this.pathAt > .4) || !this.path || this.time - this.pathAt > 2.5) this.plan(this.goal);
  } else this.path = null;
  // Strafe side: switches at uneven intervals.
  if (this.time > this.strafeUntil) { this.strafe = this.random() < .5 ? -1 : 1; this.strafeUntil = this.time + (1.3 + this.random() * 2.2) * this.pf.strafeTime; }   // v146: longer, calmer weaves
 }

 // Gave up on where they went: search round the last sighting.
 lose(known) {
  this.investigate = { x: known.x + (this.random() - .5) * 10, z: known.z + (this.random() - .5) * 10, at: this.time };
  this.memory.delete(known.id); if (this.targetId === known.id) this.targetId = null;
 }

 // Loops and dead ends: walking toward a goal that gets no nearer for a few
 // seconds (behind something it cannot get round, or a spot it cannot
 // reach) means drop it and do something else.
 watchGoal() {
  const g = this.goal, p = this.sim.player, w = this.watch;
  if (!g || this.mode === 'engage' || this.mode === 'guard') { this.watch = null; return; }
  const d = Math.hypot(g.x - p.x, g.z - p.z);
  if (d < 1.6 && this.mode === 'follow') { this.watch = null; this.followNudge = 0; return; }
  if (!w || Math.hypot(g.x - w.x, g.z - w.z) > 3 || w.mode !== this.mode) { this.watch = { x: g.x, z: g.z, best: d, at: this.time, mode: this.mode }; return; }
  if (d < w.best - .5) { w.best = d; w.at = this.time; return; }
  if (this.time - w.at < 3.5) return;
  this.watch = null; this.gaveUp = (this.gaveUp || 0) + 1;
  const known = this.targetId != null ? this.memory.get(this.targetId) : null;
  if (this.mode === 'hunt' && known) this.lose(known);
  else if (this.mode === 'investigate') this.investigate = null;
  else if (this.mode === 'cover') { this.coverEnded = this.time; this.coverUntil = 0; }
  else if (this.mode === 'follow') this.followNudge = (this.followNudge || 0) + 1;
  this.goal = this.mode === 'patrol' ? this.wanderSpot(this.lastWorld) : null; this.path = null;
 }

 // Shared per-tick allowance for the costly work (BotMatch refills
 // `nav.budget` each tick; a robot on its own has no limit).
 afford(kind) {
  const b = this.nav.budget;
  if (!b) return true;
  if (b[kind] <= 0) { this.thinkClock = Math.min(this.thinkClock, .02); return false; }
  b[kind]--; return true;
 }

 plan(goal) {
  if (!this.afford('path')) return;
  const p = this.sim.player;
  this.path = this.nav.path(p.x, p.z, goal.x, goal.z, 20000) || null;
  this.pathGoal = { x: goal.x, z: goal.z }; this.pathAt = this.time;
 }

 outOfAmmo() {
  const sim = this.sim;
  if (sim.weapon === 'rifle') return sim.rifle.reload > 0 || sim.rifle.ammo <= 0;
  if (sim.weapon === 'shotgun') return sim.shotgun.reload > 0 || sim.shotgun.ammo <= 0;
  return sim.ammo + sim.seeds.length < 2;
 }

 // Somewhere else worth walking to: an open spot 12-40 m away, in the map.
 // Now and then (a third of the time) it heads roughly toward someone it
 // does not know about, a hunch rather than knowledge: somewhere within
 // ~12 m of them, you a little more often than the other robots. (`hunch`:
 // how often; a 1V1 raises it, two players looking for each other.)
 wanderSpot(world = null) {
  const p = this.sim.player, pool = (world?.enemies || []).filter(e => e.hp > 0);
  if (pool.length && this.random() < (this.hunch ?? .34)) {
   const weights = pool.map(e => e.human ? 1.6 : 1), total = weights.reduce((a, b) => a + b, 0);
   let r = this.random() * total, pick = pool[0];
   for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { pick = pool[i]; break; } }
   for (let k = 0; k < 12; k++) {
    const a = this.random() * TAU, d = 4 + this.random() * 12, x = pick.x + Math.cos(a) * d, z = pick.z + Math.sin(a) * d;
    // No nearer than it already is would be pointless; only a step toward them.
    if (this.nav.isOpen(x, z) && this.nav.clearance[this.nav.cellOf(x, z)] >= 2) {
     const far = Math.hypot(x - p.x, z - p.z);
     // Not the whole way in one go: part of the way there.
     const t = far > 30 ? 30 / far : 1;
     const gx = p.x + (x - p.x) * t, gz = p.z + (z - p.z) * t;
     if (this.nav.isOpen(gx, gz) && this.nav.clearance[this.nav.cellOf(gx, gz)] >= 2) return { x: gx, z: gz };
    }
   }
  }
  for (let k = 0; k < 24; k++) {
   const a = this.random() * TAU, d = 12 + this.random() * 28, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
   // Drift back toward the middle of the map rather than the edges.
   const pull = .25, gx = x * (1 - pull), gz = z * (1 - pull);
   if (this.nav.isOpen(gx, gz) && this.nav.clearance[this.nav.cellOf(gx, gz)] >= 2) return { x: gx, z: gz };
  }
  return { x: p.x + (this.random() - .5) * 6, z: p.z + (this.random() - .5) * 6 };
 }

 // A shot spot that let it down (reached, and no line from where it stood):
 // passed over for a few seconds (findShotSpot).
 markBadSpot(c) { (this.badSpots ||= new Map()).set(`${Math.round(c.x * 4)},${Math.round(c.z * 4)}`, this.time + 4); }
 isBadSpot(c) { const b = this.badSpots; if (!b?.size) return false; const k = `${Math.round(c.x * 4)},${Math.round(c.z * 4)}`, until = b.get(k); if (until === undefined) return false; if (until < this.time) { b.delete(k); return false; } return true; }
 // Hills: a place in the stream (wet) costs more the deeper it is, and one
 // under a deck in the water is no place to stand and fight (stage 4 audit:
 // robots hid and fought from under the bridge). Infinity: skip it.
 wetCost(c) {
  const g = this.sim.ground; if (!g || g.flat) return 0;
  const k = g.decks?.length ? g.deckAt(c.x, c.z) : -1, floor = g.drawnHeightAt(c.x, c.z);
  if (k >= 0 && g.decks[k].h - floor > WADE.step) return Infinity;
  const depth = g.waterDepthAt(c.x, c.z, floor);
  return depth > 0 ? 3 * Math.min(1, depth / WADE.depth) : 0;
 }

 // Cover from `enemy`: the nearest spot by walking distance that the enemy
 // cannot shoot, not too close to them, preferring a little room round it.
 findCover(enemy) {
  const p = this.sim.player, nav = this.nav, reach = nav.flood(p.x, p.z, 12);
  let best = null, bestScore = Infinity;
  // The flood hands squares back nearest first, so once the walk alone costs
  // more than the best spot found, nothing later can beat it.
  for (const [i, walk] of reach) {
   if (walk - .9 >= bestScore) break;
   if (nav.clearance[i] < 2) continue;
   // Every other row and column: a spot a quarter-metre off is as good.
   const col = i % nav.cols, row = (i - col) / nav.cols; if ((col | row) & 1) continue;
   const c = nav.centre(i), fromEnemy = Math.hypot(c.x - enemy.x, c.z - enemy.z);
   if (fromEnemy < 4) continue;
   // An ally hides near you, not across the map.
   if (this.leader && Math.hypot(c.x - this.leader.x, c.z - this.leader.z) > 12) continue;
   const score = walk + Math.max(0, 9 - fromEnemy) * 1.5 - Math.min(3, nav.clearance[i]) * .3 + this.wetCost(c);
   if (score >= bestScore) continue;
   if (shotClear(this.sim.colliders, enemy.x, enemy.z, c.x, c.z, .3, this.sim.ground)) continue;
   bestScore = score; best = c;
  }
  return best;
 }

 // A place to shoot `enemy` from: the nearest by walking distance with a
 // clear line to them, at a range the weapon likes. Same flood as cover.
 findShotSpot(enemy, style) {
  const p = this.sim.player, nav = this.nav, reach = nav.flood(p.x, p.z, 12), lead = this.leader, hills = !this.sim.ground?.flat;
  const mid = (style.near + style.far) / 2;
  let best = null, bestScore = Infinity;
  for (const [i, walk] of reach) {
   if (walk - this.pf.flank * 3 >= bestScore) break;
   if (nav.clearance[i] < 2) continue;
   const col = i % nav.cols, row = (i - col) / nav.cols; if ((col | row) & 1) continue;
   const c = nav.centre(i), d = Math.hypot(c.x - enemy.x, c.z - enemy.z);
   if (d > style.reach || d < style.near * .6) continue;
   if (lead && Math.hypot(c.x - lead.x, c.z - lead.z) > 12) continue;
   // (Hills: not where it stands now, nor a spot that just let it down.)
   if (hills && (Math.hypot(c.x - p.x, c.z - p.z) < .6 || this.isBadSpot(c))) continue;
   // A flanker wants an angle on them, not the same line it was on.
   let score = walk + Math.abs(d - mid) * .35 + this.wetCost(c);
   const flank = this.fight?.kind === 'close' ? Math.max(this.pf.flank, .7) : this.pf.flank;
   if (flank) {
    const ax = p.x - enemy.x, az = p.z - enemy.z, bx = c.x - enemy.x, bz = c.z - enemy.z;
    const sin = Math.abs(ax * bz - az * bx) / ((Math.hypot(ax, az) * d) || 1);
    score -= flank * sin * 3;
   }
   if (score >= bestScore) continue;
   // An ally keeps out of your line of fire.
   if (lead && this.inLine(lead, c.x, c.z)) continue;
   if (!shotClear(this.sim.colliders, c.x, c.z, enemy.x, enemy.z, .1, this.sim.ground)) continue;
   // (Hills: a clear line from anywhere it may stop: it arrives within 0.35 m.)
   if (hills && ![[.3, 0], [-.3, 0], [0, .3], [0, -.3]].every(([ox, oz]) => shotClear(this.sim.colliders, c.x + ox, c.z + oz, enemy.x, enemy.z, .1, this.sim.ground))) continue;
   bestScore = score; best = c;
  }
  return best;
 }

 // An ally's place round you: behind and to one side (each ally its own
 // side), a few metres off, turning with where you face.
 followSpot(lead) {
  const sides = [-1, 1, -.5, .5, 0], off = sides[this.slotIndex % sides.length] + (this.followNudge || 0) * .7;
  const facing = Math.atan2(lead.aimZ || 0, lead.aimX || 1), a = facing + Math.PI + off, r = 3.2 + (this.slotIndex >= 2 ? 1.4 : 0);
  return { x: lead.x + Math.cos(a) * r, z: lead.z + Math.sin(a) * r, follow: true };
 }

 // Is (x, z) in front of `who`'s gun, where they would shoot through it?
 inLine(who, x, z, reach = 14, width = 1.3) {
  const ax = who.aimX || 0, az = who.aimZ || 0, len = Math.hypot(ax, az); if (len < .1) return false;
  const dx = x - who.x, dz = z - who.z, along = (dx * ax + dz * az) / len;
  return along > .5 && along < reach && Math.abs(dx * az - dz * ax) / len < width;
 }

 // Would a shot from here to (x, z) pass through a friend?
 friendInWay(x, z) {
  const p = this.sim.player, dx = x - p.x, dz = z - p.z, len = Math.hypot(dx, dz) || 1;
  for (const f of this.friends) {
   const fx = f.x - p.x, fz = f.z - p.z, along = (fx * dx + fz * dz) / len;
   if (along > 0 && along < len + .5 && Math.abs(fx * dz - fz * dx) / len < .75) return true;
  }
  return false;
 }

 // --- moving (every tick) ----------------------------------------------------------
 move(dt, input, world, target) {
  const sim = this.sim, p = sim.player, style = this.band(), weave = this.pf.strafe;
  let mx = 0, mz = 0;
  const follow = () => {
   if (!this.path || !this.path.length) return false;
   // Skip ahead when a later waypoint is already in a straight line.
   while (this.path.length > 1 && this.nav.walkable(p.x, p.z, this.path[1].x, this.path[1].z)) this.path.shift();
   const w = this.path[0], dx = w.x - p.x, dz = w.z - p.z, d = Math.hypot(dx, dz);
   if (d < .35) { this.path.shift(); return this.path.length > 0 || false; }
   mx = dx / d; mz = dz / d;
   if (this.path.length === 1 && d < 1.2) { mx *= d / 1.2; mz *= d / 1.2; } // arrive
   return true;
  };
  if ((this.mode === 'engage' || this.mode === 'guard') && target?.visible && !this.goal) {
   // In range with a clear line: hold the band, strafe across the line.
   const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
   let radial = d > style.far ? 1 : d < style.near ? -1 : (d - (style.near + style.far) / 2) / (style.far - style.near) * .6;
   // Off a player's screen it may not shoot (openFire), so it closes in.
   if (offScreen(p.x, p.z, target.x, target.z, 1, this.rise(target), target.aspect)) radial = 1;
   mx = ux * radial - uz * this.strafe * weave; mz = uz * radial + ux * this.strafe * weave;
   // Would that step leave open ground? Try the other side, then just the radial.
   // (A walk check, not just the end square: thin walls sit between squares.)
   const clear = (x, z) => { const l = Math.hypot(x, z) || 1; return this.nav.walkable(p.x, p.z, p.x + x / l * .9, p.z + z / l * .9); };
   if (!clear(mx, mz)) {
    this.strafe *= -1; this.strafeUntil = this.time + .6; mx = ux * radial - uz * this.strafe * weave; mz = uz * radial + ux * this.strafe * weave;
    if (!clear(mx, mz)) { mx = ux * radial; mz = uz * radial; if (!clear(mx, mz)) { mx = 0; mz = 0; } }
   }
   // Guarding: stay close to you, whatever the weapon's range.
   if (this.mode === 'guard') { mx *= .5; mz *= .5; }
   // An ally fights near you: drawn back as it drifts past 8 m.
   const lead = this.leader;
   if (lead) {
    const lx = lead.x - p.x, lz = lead.z - p.z, ld = Math.hypot(lx, lz);
    if (ld > 8) { const pull = Math.min(1, (ld - 8) / 6); mx += lx / ld * pull; mz += lz / ld * pull; }
   }
   // Nominal aims in to hit at range, which slows it: stand steadier there.
   if (sim.weapon === 'rifle' && d > 9) { mx *= this.pf.steady; mz *= this.pf.steady; }
   // A skilled rifleman plants its feet for a burst (moving widens the
   // spread by up to 70%) and moves between bursts, unless it sees a gun
   // lined up on it, when it keeps moving.
   if (sim.weapon === 'rifle' && d > 6 && this.burstUntil && !this.threatened(target, world)) { const k = 1 - this.pf.tech * .85; mx *= k; mz *= k; }
  } else if (!follow()) {
   mx = 0; mz = 0;
   if (this.mode === 'patrol' || this.mode === 'investigate') this.thinkClock = 0;
  }
  // An ally steps out of your line of fire.
  const lead = this.leader;
  if (lead && this.mode !== 'cover' && this.inLine(lead, p.x, p.z, 12, 1.2)) {
   const ax = lead.aimX, az = lead.aimZ, side = (p.x - lead.x) * az - (p.z - lead.z) * ax >= 0 ? 1 : -1;
   mx += az * side * 1.2; mz += -ax * side * 1.2;
  }
  // Out of the way of a grenade about to land.
  for (const g of world.grenades || []) {
   const dx = p.x - g.x, dz = p.z - g.z, d = Math.hypot(dx, dz);
   if (d < GRENADE.radius + 1) { mx += dx / (d || 1) * 1.6; mz += dz / (d || 1) * 1.6; this.wantDodge = { x: dx / (d || 1), z: dz / (d || 1) }; }
  }
  // Keep a body's width from everyone else.
  for (const b of world.bodies || []) {
   const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz);
   if (d > .01 && d < 1.3) { mx += dx / d * (1.3 - d) * 1.2; mz += dz / d * (1.3 - d) * 1.2; }
  }
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  // Eased (owner, v146: natural, not jittery): the stick moves toward what
  // it wants instead of snapping every think, so turns and strafe switches
  // round off like a player's thumb.
  const ease = 1 - Math.exp(-dt * 6), sm = this.smoothMove ||= { x: 0, z: 0 };
  sm.x += (mx - sm.x) * ease; sm.z += (mz - sm.z) * ease;
  mx = sm.x; mz = sm.z;
  input.moveX = mx; input.moveZ = mz;
  // Stuck: meant to move, barely did. Re-plan; then sidestep; then dodge.
  const pr = this.progress;
  if (this.time - pr.at > .35) {
   const moved = Math.hypot(p.x - pr.x, p.z - pr.z), meant = Math.hypot(mx, mz) > .4;
   pr.stuck = meant && moved < .12 && !p.dodgeRemaining ? pr.stuck + 1 : 0;
   if (pr.stuck) this.stuckTotal = (this.stuckTotal || 0) + 1;
   // Holding a band: the other way. Walking: a new route, then another way
   // round, then a dodge (which also breaks clutter).
   if (pr.stuck === 1 && !this.goal) { this.strafe *= -1; this.strafeUntil = this.time + .6; }
   if (pr.stuck === 2 && this.goal) this.plan(this.goal);
   if (pr.stuck === 4) { this.strafe *= -1; this.path = null; this.goal = this.mode === 'patrol' ? this.wanderSpot(world) : this.goal; }
   if (pr.stuck >= 6) { this.wantDodge = { x: -mz || 1, z: mx }; pr.stuck = 0; }
   pr.x = p.x; pr.z = p.z; pr.at = this.time;
  }
 }

 // --- aiming (every tick) --------------------------------------------------------------
 aim(dt, input, target) {
  const sim = this.sim, p = sim.player, style = STYLE[sim.weapon] || STYLE.static;
  let tx, tz;
  // Hunting, it keeps its gun on where they went (the corner they rounded).
  if (target && (target.visible || this.time - target.seen < 1.5 || this.mode === 'hunt')) {
   const d = Math.hypot(target.x - p.x, target.z - p.z);
   // Lead by the projectile's flight time (and a little of the robot's own
   // reaction), aim error settling as it tracks.
   const lead = (d / style.speed + .04) * this.pf.lead;
   const age = target.visible ? 0 : Math.min(.8, this.time - target.seen);
   tx = target.x + target.vx * (lead + age); tz = target.z + target.vz * (lead + age);
   const settle = Math.exp(-dt / this.pf.settle);
   this.aimError.x *= settle; this.aimError.z *= settle;
   // A target changing direction throws the aim off again.
   const jink = Math.hypot(target.vx - (this.lastVX ?? target.vx), target.vz - (this.lastVZ ?? target.vz));
   if (jink > 2.5) { const e = this.newError(d, .5); this.aimError.x += e.x; this.aimError.z += e.z; }
   this.lastVX = target.vx; this.lastVZ = target.vz;
   // Now and then a shot goes wide: the hand pulls off to one side for a
   // moment (settles like any aim error). Often for an easy robot, rarely
   // for a hard one (profile `miss`: the chance each half-second or so).
   this.missClock = (this.missClock ?? .5) - dt;
   if (target.visible && this.missClock <= 0) {
    this.missClock = .45 + this.random() * .35;
    if (this.random() < this.pf.miss * Math.min(2, this.aimScale || 1)) {
     const side = this.random() < .5 ? -1 : 1, ux = (target.x - p.x) / (d || 1), uz = (target.z - p.z) / (d || 1), size = (.75 + this.random() * .6) * (1 + d * .02);
     this.aimError.x += -uz * side * size; this.aimError.z += ux * side * size;
    }
   }
   tx += this.aimError.x; tz += this.aimError.z;
   // The hand's own wobble (bigger on a worse robot), never settled out.
   this.wob = (this.wob || this.random() * 9) + dt * 2.3;
   const shake = this.pf.shake * (this.aimScale || 1) * (.15 + d * .035);
   tx += Math.sin(this.wob * 1.3) * shake; tz += Math.cos(this.wob * .9 + 1) * shake;
   this.aimPoint = { x: tx, z: tz, d };
  } else {
   // Looking where it walks, glancing about now and then.
   const w = this.path?.[0] || this.investigate;
   this.lookAround -= dt;
   if (this.lookAround <= 0) { this.lookAround = 1.2 + this.random() * 2.5; this.glance = (this.random() - .5) * 1.6; }
   const lead = this.leader, beside = lead && this.mode === 'follow' && Math.hypot(lead.x - p.x, lead.z - p.z) < 6;
   // An ally at your side watches a flank (its side of you), not your back.
   const flank = beside ? Math.atan2(lead.aimZ || 0, lead.aimX || 1) + ([-1, 1, -.5, .5, 0][this.slotIndex % 5] || 1) * 1.2 : null;
   const heading = flank != null ? flank + (this.glance || 0) * .4
    : w ? Math.atan2(w.z - p.z, w.x - p.x) + (this.glance || 0) * .5 : Math.atan2(p.aimZ, p.aimX) + (this.glance || 0) * dt;
   tx = p.x + Math.cos(heading) * 6; tz = p.z + Math.sin(heading) * 6; this.aimPoint = null;
  }
  // A hand, not a snap: the turn is limited and eases in.
  // Like a player's mouse aim: the barrel's line through the point, not the body's.
  const want = muzzleBearing(p.x, p.z, tx, tz, muzzleLateral(this.sim.weapon));
  if (this.aimAngle == null) this.aimAngle = Math.atan2(p.aimZ, p.aimX);
  const delta = wrap(want - this.aimAngle), max = (target?.visible ? this.pf.turn : this.pf.turn * .45) * dt;
  this.aimAngle = wrap(this.aimAngle + clamp(delta * Math.min(1, dt * 14), -max, max));
  input.aimX = Math.cos(this.aimAngle); input.aimZ = Math.sin(this.aimAngle);
  const reach = Math.max(1.2, Math.hypot(tx - p.x, tz - p.z));
  input.aimPointX = p.x + input.aimX * reach; input.aimPointZ = p.z + input.aimZ * reach;
  this.aimOff = Math.abs(delta);
 }

 // --- the weapon -------------------------------------------------------------------------
 act(dt, input, target, world) {
  const sim = this.sim, p = sim.player, t = this.time;
  const visible = target?.visible;
  const d = target ? Math.hypot(target.x - p.x, target.z - p.z) : Infinity;
  const lined = visible && this.aimPoint && shotClear(sim.colliders, p.x, p.z, this.aimPoint.x, this.aimPoint.z, .04, sim.ground) && !(this.friends.length && this.friendInWay(this.aimPoint.x, this.aimPoint.z));
  const ready = t - this.acquiredAt > (this.reaction ??= this.pf.reaction[0] + this.random() * (this.pf.reaction[1] - this.pf.reaction[0]));
  const onTarget = this.aimOff < (Math.atan2(.5, Math.max(1, d)) + .03) * this.pf.trigger;
  const open = this.openFire(target, d);
  this.holding = !!target && visible && !open;
  const shoot = visible && lined && ready && onTarget && open;
  // Dodge: a grenade at its feet, stuck, or just hit hard with stamina to spare.
  if (this.wantDodge) {
   input.dodge = true; input.moveX = this.wantDodge.x; input.moveZ = this.wantDodge.z; this.wantDodge = null;
  } else if (p.stamina >= RULES.dodgeStaminaCost && t - (this.dodgedAt ?? -9) > 1.2 && target && this.threatened(target, world) && this.random() < this.pf.tech * .5) {
   // It saw them line up on it and fire: out of the way, across their line.
   const dx = target.x - p.x, dz = target.z - p.z, dd = Math.hypot(dx, dz) || 1, side = this.nav.walkable(p.x, p.z, p.x - dz / dd * 2.5 * this.strafe, p.z + dx / dd * 2.5 * this.strafe) ? this.strafe : -this.strafe;
   input.dodge = true; input.moveX = -dz / dd * side; input.moveZ = dx / dd * side; this.dodgedAt = t;
  } else if (t - this.hurtAt < .05 && (this.lastHurt || 0) > 18 && p.stamina >= RULES.dodgeStaminaCost && this.random() < this.pf.dodge && target) {
   const dx = target.x - p.x, dz = target.z - p.z, dd = Math.hypot(dx, dz) || 1;
   input.dodge = true; input.moveX = -dz / dd * this.strafe; input.moveZ = dx / dd * this.strafe;
  }
  // Closing on a longer gun (owner, v146, from robot-vs-robot trials: Ballast
  // and Static robots were picked off walking in): a dash in at an angle,
  // now and then, when it means to close and still has a dodge in hand.
  else if (visible && sim.weapon !== 'rifle' && target.weapon === 'rifle' && d > this.band().far + 1 && d < 15 && p.stamina >= RULES.dodgeStaminaCost * 2 && t - (this.dodgedAt ?? -9) > 1.4 && this.random() < this.pf.tech * .05) {
   const ux = (target.x - p.x) / d, uz = (target.z - p.z) / d, mx = ux * .8 - uz * .6 * this.strafe, mz = uz * .8 + ux * .6 * this.strafe;
   if (this.nav.walkable(p.x, p.z, p.x + mx * 3, p.z + mz * 3)) { input.dodge = true; input.moveX = mx; input.moveZ = mz; this.dodgedAt = t; }
  }
  if (sim.weapon === 'rifle') this.rifle(input, target, d, shoot, visible);
  else if (sim.weapon === 'shotgun') this.shotgun(input, target, d, shoot, visible);
  else this.staticGun(input, target, d, shoot, visible, lined);
 }

 // How much higher its ground is than `who`'s (0 on flat maps).
 rise(who) {
  const g = this.sim.ground, p = this.sim.player;
  return g.flat ? 0 : g.heightAt(p.x, p.z) - g.heightAt(who.x, who.z);
 }

 // May it open fire on `target` (owner, v146)? Never on a player from off
 // their screen (they cannot see it). An easier robot (pf.patience) mostly
 // waits to be noticed: their aim swings its way, they hurt it, or they come
 // close; but it also starts fights itself a few seconds after spotting them.
 // Once open, it stays open a while. Robots fighting robots never wait (but
 // keep to the same screen rule).
 openFire(target, d) {
  if (!target) return true;
  const p = this.sim.player, t = this.time;
  // (Robots on robots too, so no side wins fights from beyond a screen.)
  if (offScreen(p.x, p.z, target.x, target.z, 0, this.rise(target), target.aspect)) return false;
  if (!target.human) return true;
  const k = this.pf.patience || 0;
  if (!k) return true;
  const e = this.engage ||= new Map();
  let s = e.get(target.id);
  if (!s || (!target.visible && t - target.seen > 3)) { s = { until: -9, initAt: null }; e.set(target.id, s); }
  if (target.visible && s.initAt == null) s.initAt = t + (1 + this.random() * 3.5) * (.5 + k);
  const aimedAt = target.aimX != null && Math.abs(wrap(Math.atan2(p.z - target.z, p.x - target.x) - Math.atan2(target.aimZ, target.aimX))) < .5;
  if (aimedAt || t - this.hurtAt < 4 || d < 6.5 - k * 1.5 || (s.initAt != null && t >= s.initAt)) s.until = t + 6;
  return t < s.until;
 }

 // X abilities a bit rarer (owner, v146): once ready, it waits a while
 // before using it (longer for easier robots, xRate).
 // (Counted from the first moment it could use it in a fight.)
 xAllowed() {
  if (this.holding || !this.abilityReady()) { if (!this.holding) this.readySince = null; return false; }
  this.readySince ??= this.time; this.xWait ??= this.newXWait();
  return this.time - this.readySince >= this.xWait;
 }
 usedX() { this.readySince = null; this.xWait = this.newXWait(); }
 newXWait() { return (4 + this.random() * 12) * (1.4 - (this.pf.xRate ?? 1)); }

 // Is `target` aiming at it and firing, within its weapon's reach?
 threatened(target, world) {
  if (!target.visible || target.aimX == null) return false;
  const p = this.sim.player, dx = p.x - target.x, dz = p.z - target.z, d = Math.hypot(dx, dz) || 1;
  if (d > (STYLE[target.weapon]?.reach || 16)) return false;
  const off = Math.abs(wrap(Math.atan2(dz, dx) - Math.atan2(target.aimZ, target.aimX)));
  return off < Math.atan2(.9, d) + .05 && (target.loud || (world.noises || []).some(n => Math.hypot(n.x - target.x, n.z - target.z) < 1.5));
 }

 rifle(input, target, d, shoot, visible) {
  const sim = this.sim, r = sim.rifle, t = this.time;
  // Aimed in at range, where the spread matters (a skilled robot from 6 m).
  input.aiming = visible && d > 8 - this.pf.tech * 2;
  if (r.reload <= 0 && r.ammo <= 0 && !sim.surge?.active) { input.reload = true; return; }
  // Surge when it will count: a fight it means to win (pushing, or two on
  // it), in range, the enemy with plenty of health left to take. A skilled
  // robot waits for that moment; an easy one fires it off whenever.
  if (visible && d < 16 && sim.surge?.phase === 'idle' && sim.surge.cooldown <= 0) {
   const worth = this.fight?.kind === 'push' || this.fight?.kind === 'fall' || (target.hp ?? 500) / (target.maxHp || 500) > .45;
   if (this.xAllowed() && this.random() < (worth ? .01 + this.pf.tech * .05 : .02 * (1 - this.pf.tech)) * this.pf.xRate) { input.surge = true; this.usedX(); }
  }
  // Surging: a grenade now does +100 (a skilled robot knows it).
  if (sim.surge?.active && visible && !this.holding && sim.grenadeCooldown <= 0 && d > 4 && d < GRENADE.range && this.random() < this.pf.tech * .04 && !this.friends.some(f => Math.hypot(f.x - target.x, f.z - target.z) < GRENADE.radius + 1.5)) {
   input.grenade = true; input.aimPointX = target.x + target.vx * .6; input.aimPointZ = target.z + target.vz * .6;
  }
  // A top-up between fights.
  if (!visible && r.reload <= 0 && r.ammo < r.capacity * .5 && (!target || t - target.seen > 2)) { input.reload = true; return; }
  // Short bursts at range (recoil), a steady stream up close.
  if (shoot && t >= this.pauseUntil) {
   input.fire = true;
   if (!this.burstUntil) this.burstUntil = t + (d > 11 ? (.3 + this.random() * .35) * this.pf.burst : 1.2);
   if (t > this.burstUntil) { this.burstUntil = 0; this.pauseUntil = t + (d > 11 ? .12 + this.random() * .2 : .05); input.fire = false; }
  } else this.burstUntil = 0;
  // A grenade over the cover they are behind, or at someone standing still.
  if (sim.grenadeCooldown <= 0 && target && !sim.player.dodgeRemaining && !this.holding) {
   const hidden = !visible && t - target.seen > .7 && t - target.seen < 5;
   const still = visible && Math.hypot(target.vx, target.vz) < 1 && this.random() < .01 * this.pf.grenade;
   const friendNear = this.friends.some(f => Math.hypot(f.x - target.x, f.z - target.z) < GRENADE.radius + 1.5);
   if ((hidden || still) && d > 4 && d < GRENADE.range && !friendNear) {
    const aimAt = Math.atan2(target.z - sim.player.z, target.x - sim.player.x);
    if (Math.abs(wrap(aimAt - this.aimAngle)) < .25) { input.grenade = true; input.aimPointX = target.x; input.aimPointZ = target.z; }
    else { this.aimAngle = wrap(this.aimAngle + clamp(wrap(aimAt - this.aimAngle), -.2, .2)); }
   }
  }
 }

 shotgun(input, target, d, shoot, visible) {
  const sim = this.sim, s = sim.shotgun, sc = sim.scatter;
  // Scatter: readied when a fight is on at its range, fired once on target
  // (a readied one is never wasted: out of the fight, it still goes off at
  // the next sighting).
  if (sc) {
   if (sc.armed && shoot && d < SCATTER.reach) { input.scatter = true; return; }
   // Best a few metres off, where a big shell bursts in the body (a skilled
   // robot waits for that range; an easy one fires from anywhere).
   const sweet = d > 3.5 && d < 8.5, anywhere = d > 2.5 && d < SCATTER.reach - 1;
   if (!sc.armed && visible && this.xAllowed() && sc.cooldown <= 0 && (sweet || (anywhere && this.random() > this.pf.tech)) && this.random() < (.025 + this.pf.tech * .03) * this.pf.xRate) { input.scatter = true; this.usedX(); }
  }
  // Riding the recoil: a skilled robot a bit out of reach turns its back
  // and fires, and the launch throws it at them (when the way is clear).
  const p = sim.player;
  if (visible && !this.holding && s.ammo > 0 && s.reload <= 0 && d > SHOTGUN.range + .5 && d < SHOTGUN.range + 6 && this.time - (this.jumpedAt ?? -9) > 3 && this.fight?.kind !== 'fall' && this.random() < this.pf.tech * .05) {
   const ux = (target.x - p.x) / d, uz = (target.z - p.z) / d;
   if (this.nav.walkable(p.x, p.z, p.x + ux * 4, p.z + uz * 4)) {
    input.aimX = -ux; input.aimZ = -uz; input.aimPointX = p.x - ux * 3; input.aimPointZ = p.z - uz * 3; input.tapFire = true; this.pressed = true; this.jumpedAt = this.time; this.aimAngle = Math.atan2(-uz, -ux); return;
   }
  }
  if (s.reload <= 0 && s.ammo <= 0) { input.reload = true; return; }
  if (!visible && s.reload <= 0 && s.ammo < 2 && (!target || this.time - target.seen > 2)) { input.reload = true; return; }
  // Both barrels up close.
  if (shoot && d < 3.2 && s.ammo === 2 && !s.pending) { input.doubleShot = true; return; }
  // One press, one shell (no charging): aimed in past 4 m, fired inside the
  // range when on target, a tick's release between presses.
  input.aiming = visible && d > 4;
  const press = shoot && d < SHOTGUN.range * .8 && !this.pressed;   // v141: a fifth at the red's edge, so closer
  input.fire = press; this.pressed = press;
 }

 staticGun(input, target, d, shoot, visible, lined) {
  const sim = this.sim, t = this.time, seeds = sim.launchableSeeds ? sim.launchableSeeds().length : sim.seeds.length;
  // The hex: out when they are close, pulsed as its ring reaches them.
  if (sim.hexOrbs.length) {
   const o = sim.hexOrbs[0], ring = Math.hypot(o.x - o.originX, o.z - o.originZ);
   const from = target ? Math.hypot(target.x - o.originX, target.z - o.originZ) : 0;
   if (o.age > RULES.hexFormationTime && (!target || Math.abs(ring - from) < .9 || ring > from + 1.5 || ring > RULES.hexRange - .5)) input.hex = true;
   return;
  }
  // The hex when they are close enough for its ring to reach them before
  // they get out (a skilled robot waits for 3-7 m and for them to be coming
  // on or cornered; an easy one throws it out at anything near).
  const hexNow = sim.hexCooldown <= 0 && sim.ammo >= RULES.hexCost && t - this.hexAt > 3 && visible && d > 2 && d < 7;
  if (hexNow) {
   const closing = target && ((target.x - sim.player.x) * target.vx + (target.z - sim.player.z) * target.vz) < 0;
   const good = closing || this.fight?.kind === 'push' || Math.hypot(target.vx, target.vz) < 1.5;
   if (this.xAllowed() && this.random() < (good ? .02 + this.pf.tech * .05 : .04 * (1 - this.pf.tech)) * this.pf.xRate) { input.hex = true; this.hexAt = t; this.usedX(); return; }
  }
  // The stream up close.
  if (visible && lined && !this.holding && d < RULES.sprayRange - 1.5 && sim.ammo >= 2 && this.aimOff < .35) { input.spray = true; return; }
  // Orbs: a skilled robot builds a bigger volley before letting go (more
  // orbs hit much harder), and keeps enough in hand for the hex when it is
  // nearly ready; an easy one fires off small ones.
  const volley = Math.round(3 + this.pf.tech * 4 + (d > 9 ? 1 : 0));
  const hurry = d < 5 || (target && t - this.hurtAt < 1);
  // (Three orbs hit for barely a third of four: a skilled robot never lets go of fewer than four.)
  if (shoot && d < STYLE.static.reach && (seeds >= volley || (hurry && seeds >= (this.pf.tech > .5 ? 4 : 3)))) {
   input.launch = true; input.launchPointX = this.aimPoint.x; input.launchPointZ = this.aimPoint.z; return;
  }
  const saveForHex = this.pf.tech > .5 && sim.hexCooldown < 4 && sim.ammo <= RULES.hexCost;
  const wantSeeds = visible ? Math.max(4, volley) : 7;
  if (seeds < wantSeeds && sim.ammo > 0 && sim.seedCooldown <= 0 && !saveForHex) input.seed = true;
 }
}

