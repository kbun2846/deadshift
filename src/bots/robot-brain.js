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
import { RULES, RIFLE, SHOTGUN, GRENADE, SCATTER, WADE, TERRAIN, OMEN, SIGHTLINE, ICHOR, SHEATH } from '../config/gameplay.js';
import { sheathDrawCutLength } from '../weapons/sheath.js';
import { collidersAlong } from '../world/collider-grid.js';
import { segmentBox } from '../simulation.js';
import { cropEntityVisible } from '../crops.js';
import { makeProfile, stepMood } from './robot-profile.js';
import { muzzleBearing, muzzleLateral } from '../aim-damping.js';
import { onScreenOf } from '../render/camera-framing.js';
import { rememberRoom,roomPlan,paceRoomFire } from './interior-tactics.js';
import { sniperSees,sniperClear,planSniper,sniperInput } from './sightline-tactics.js';
import { respondToLaser,sniperLineClear } from './laser-response.js';
import { hexAware, hexTargetCost } from './hex-aware.js';
import { newEngagement, newSituation, judge, THREAT, MELEE } from './engagement.js';
import { peelBonus } from './squad.js';
import { sameRoomGroup } from '../world/city-rooms.js'; // Lumen: rooms of one building

const TAU = Math.PI * 2;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// How each weapon likes to fight.
// How hard each weapon is to aim, for a robot as for a person (owner,
// 2026-09-29: "weapons like omen shouldnt be hitting so regularly because its
// hard to hit with as a real person too"): scales the aim error, the wobble and
// the pulled shots on top of the skill (less so for a hard robot: profile
// `feel`). Omen's slow diamonds are the hardest to land, then Sightline's
// rifle. Static's volleys land where they are thrown and its aim error
// already costs it most, so it is eased (.8) to stay fair.
// (Review 2026-09-30: Static .8 -> 1, not eased: its robots throw volleys now
// (engagement pass) and were the whole of the robots' rise in how often
// they killed a player; with it, normal and hard sit near the old numbers.)
export const WEAPON_AIM = Object.freeze({ omen: 1.7, sightline: 1.35, static: 1, sidekick: 1.05, rifle: 1, shotgun: 1, ichor: 1, sheath: 1 });
// A misjudged melee swing (profile `whiff`, robot-brain meleeSwing): started
// `early` m out of reach (a range), or cut `wide` of the target (radians past
// half the swing's arc) for `wideFor` s; after one it takes `recover` s (a
// range) to read the distance again before the next swing.
// Weapons whose bullets Ichor's guard stops (not blasts, pellets or orbs).
const GUN_WEAPONS = new Set(['rifle', 'sidekick', 'sightline', 'omen']);
export const MELEE_WHIFF = Object.freeze({ early: [.7, 1.6], wide: .35, wideFor: .32, recover: [.25, .6] });
// A gun robot against a person with a blade (owner, 2026-10-01: "The bots, like
// when I'm using a melee weapon and they're using a ranged weapon, it's like a
// lot more difficult ... make it a little bit more balanced there"). A person
// with a gun is caught out by a blade the same ways: slow to start backing off
// when it comes in, not walking backwards at full tilt while shooting, now and
// then standing its ground instead, losing its aim (and holding the trigger a
// beat) when the blade dashes at it, and only now and then dodging clear. How
// much of that it shows is its `slack` (bladeSlack): (`top` - tech) / `span`,
// 0-1: easy all of it, normal about half, hard and up none (they read a blade
// as before). Only against a person (`human`; robots fighting robots, and
// every robot whose slack is 0, draw no extra random numbers: as before).
//  dash      their speed over this (m/s) is a dash (walking 7.2, Gold Rush ~10.4)
//  shock     the aim error a dash at it throws in (× slack; newError scale)
//  shockIn   only a dash within this (m)
//  wait      s it holds the trigger after one (× slack × 2)
//  inside    a blade within its THREAT + this (m) has come in on it (bladeNerve)
//  again     s out of that before another coming-in counts as new
//  backDelay s before it starts backing off as they come in (× slack × 2)
//  stand     the chance (× slack) it stands its ground instead, for `standFor` s
//  backSlow  how much of its backing-off speed it loses (× slack) while they are within `near` m
//  breakAway how much less often it dodges clear of them (× slack)
export const VS_BLADE = Object.freeze({ top: .9, span: .8, dash: 11.5, shock: 1.6, shockIn: 10, wait: [.12, .3], inside: 1.5, again: 1, backDelay: [.25, .55], stand: .5, standFor: [1.2, 2.4], backSlow: .55, near: 8, breakAway: .8 });
// Each weapon's band (near-far, metres: where it holds a fight, engagement.js
// `engage`), its projectile's speed (for leading) and its longest reach.
// (Robot behaviour pass 2026-09-30, owner-requested: Nominal holds 8-15 m
// (was 6.5-14), inside its 10 m full damage to the 22 m falloff end; Ballast
// under 5 m (2.2-5.2), where its shells are whole; Static at mid range, 5.5-10
// (was 3.5-9), where it builds and launches volleys, streaming only when
// someone is on top of it.)
export const STYLE = Object.freeze({
 ichor:{near:1,far:1.7,speed:ICHOR.waveSpeed,reach:ICHOR.waveRange},
 sheath:{near:1.2,far:2.1,speed:60,reach:SHEATH.xRange},
 sidekick:{near:5,far:10,speed:65,reach:22},
 sightline:{near:12,far:19,speed:SIGHTLINE.speed,reach:32},
 omen: {near:6,far:11,speed:30,reach:22},
 rifle: { near: 8, far: 15, speed: RIFLE.bulletSpeed, reach: 30 },
 shotgun: { near: 2, far: 4.8, speed: 85, reach: 7.5 },
 static: { near: 5.5, far: 10, speed: 30, reach: 16 },
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

// How far inside the duel circle's edge a robot's goals and routes stay (m).
const ROBOT_EDGE = 1.6;
// How far in from the storm's edge a robot keeps its goals (m): it closes.
const STORM_EDGE = 4;

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
  // The engagement loop (engagement.js) and the situation it reads, filled
  // in place each think.
  this.eng = newEngagement(random); this.sit = newSituation(); this.weaveAmp = 1;
  this.debug = { mode: 'patrol', path: null };
 }

 // Back to a blank mind (a respawn).
 reset() {
  this.memory.clear(); this.path = null; this.goal = null; this.hp = null; this.targetId = null; this.investigate = null;
  this.mode = this.leader ? 'follow' : 'patrol'; this.watch = null; this.shotSpot = null; this.peekSpot = null; this.coverUntil = 0; this.aimAngle = null;
  this.roomPlan=null;this.roomBurstUntil=this.roomPauseUntil=0;this.sniper=null;this.laserResponse=null;
  const counts = this.eng?.counts; this.eng = newEngagement(this.random); if (counts) this.eng.counts = counts; this.backoff = false; this.approach = null; this.flankSpot = null;
 }

 // A new weapon in hand mid-fight (Gun Game: Simulation.swapWeapon): what it
 // knows of the others stays, every plan made for the old weapon's range and
 // tricks goes (it reads the weapon afresh each tick from here).
 retool() {
  this.path = null; this.goal = null; this.watch = null; this.shotSpot = null; this.peekSpot = null; this.coverUntil = 0;
  this.roomPlan = null; this.roomBurstUntil = this.roomPauseUntil = 0; this.sniper = null; this.laserResponse = null;
  this.backoff = false; this.approach = null; this.flankSpot = null; this.burstUntil = 0;
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
  planSniper(this,dt,target,world);
  if(!this.sniper?.want)this.move(dt, input, world, target);
  this.escapeStorm(input);
  this.aim(dt, input, target);
  this.act(dt, input, target, world);
  hexAware(this, input, target); // (hex-aware.js: the other side's hex)
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
   const inView = sniperSees(this.sim,e) ?? (d < SIGHT_NEAR || (d < SIGHT && Math.abs(wrap(Math.atan2(e.z - p.z, e.x - p.x) - facing)) < SIGHT_CONE));
   const room=this.sim.buildingAt(e.x,e.z),sameRoom=!room||sameRoomGroup(room,this.sim.interior);
   // (v0.990a, owner: nobody sees someone in a crop field from outside it;
   // in the same field, only close by: crops.js cropEntityVisible.)
   const visible = e.hp > 0 && inView && sameRoom && this.sim.sees(e.x, e.z, .3) && cropEntityVisible(this.sim.crops || [], p, e);
   let m = this.memory.get(e.id);
   if (!m) { m = { x: p.x, z: p.z, vx: 0, vz: 0, seen: -99, visible: false, hp: RULES.playerHealth }; this.memory.set(e.id, m); }
   if (e.hp <= 0) { this.memory.delete(e.id); if (this.targetId === e.id) this.targetId = null; continue; }
   if (!visible) rememberRoom(this,m);
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
    // (A dash seen starting: VS_BLADE, aim.)
    const raw = Math.hypot(e.vx || 0, e.vz || 0); if (raw > VS_BLADE.dash && !(m.raw > VS_BLADE.dash)) m.dashAt = this.time; m.raw = raw;
    // (What it sees its enemy lose while it fights them: the trades, engagement.js.)
    if (e.id === this.targetId && m.visible && e.hp < m.hp) this.eng.dealt += m.hp - e.hp;
    m.x = e.x; m.z = e.z; m.seen = this.time; m.hp = e.hp; m.maxHp = e.maxHp;
    m.room=room?.id||null;delete m.shelter;
    m.weapon = e.weapon || m.weapon; m.sightline=e.sightline?{...e.sightline}:undefined;m.below=!!e.below; m.aimX = e.aimX ?? m.aimX; m.aimZ = e.aimZ ?? m.aimZ; m.loud = !!e.loud; m.reloading = !!e.reloading; m.spent = !!e.spent; m.big = !!e.big;
   }
   m.visible = visible; m.id = e.id; m.human = !!e.human; m.aspect = e.aspect || 0;
   // (Developer tools: "robots know where everyone is".)
   if (world.seeAll && sameRoom && !visible && e.hp > 0) { m.x = e.x; m.z = e.z; m.vx = e.vx || 0; m.vz = e.vz || 0; m.seen = this.time - .3; m.hp = e.hp; m.maxHp = e.maxHp; }
  }
  // Callouts: what teammates (and, for an ally, you) can see right now.
  if (world.intel) {
   for (const e of world.enemies) {
    const c = world.intel.get(e.id), m = this.memory.get(e.id);
    if (!c || !m || m.visible || e.hp <= 0) continue;
    const room=this.sim.buildingAt(c.x,c.z);if(room&&!sameRoomGroup(room,this.sim.interior))continue;
    if (this.time - m.seen > .3) { m.x = c.x; m.z = c.z; m.vx = c.vx; m.vz = c.vz; m.seen = this.time - .3; m.hp = c.hp??m.hp; m.maxHp = c.maxHp??m.maxHp; m.told = true; m.room=room?.id||null;delete m.shelter; }
   }
  }
  // Heard: gunfire, blasts. Known roughly (a couple of metres off).
  for (const n of world.noises || []) {
   const nd = Math.hypot(n.x - p.x, n.z - p.z);
   if (nd > HEAR || (nd > HEAR_SURE && this.random() > (HEAR - nd) / (HEAR - HEAR_SURE) * .6)) continue;
   if (!this.targetId || !this.memory.get(this.targetId)?.visible) this.investigate = { x: n.x + (this.random() - .5) * 3, z: n.z + (this.random() - .5) * 3, at: this.time };
  }
  // Hurt: from which way, and remember it.
  if (this.hp != null && p.hp < this.hp - .1) {
   this.hurtAt = this.time; this.lastHurt = this.hp - p.hp; this.eng.taken += this.lastHurt;
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
  const plan = this.fight, st = this.eng.state;
  // Pressing (engagement.js): in close and committed.
  // (The longer its reach, the less it gives up: a sniper presses from where
  // it is, a blade or Ballast all the way in.)
  if (st === 'press') { const k = s.far > 15 ? .95 : s.far > 8 ? .8 : .62; b.near *= k; b.far = Math.max(b.near + 1.2, b.far * (k + .1)); }
  else if (plan?.kind === 'push') { b.near *= .75; b.far = Math.max(b.near + 1.5, b.far * .8); }
  else if (plan?.kind === 'kite' && plan.keep) { b.near = Math.max(b.near, plan.keep); b.far = Math.min(s.reach, Math.max(b.far, b.near + 2.5)); }
  // Backing off with nowhere to hide: out past their threat, still fighting.
  // (Static stepping back to let its orbs come back: just out past its band.)
  if (this.backoff && (st === 'disengage' || st === 'reset')) {
   const t = this.targetId != null ? this.memory.get(this.targetId) : null;
   b.near = this.eng.reason === 'recharge' ? b.far : Math.max(b.far, (THREAT[t?.weapon] ?? 8) + 2); b.far = Math.min(s.reach + 4, b.near + 3);
  }
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
  const my = p.hp / (p.maxHp || RULES.playerHealth), their = (target.hp ?? RULES.playerHealth) / (target.maxHp || RULES.playerHealth);
  const loaded = !this.outOfAmmo(), ability = this.abilityReady();
  let edge = (my - their) * 1.3 + (loaded ? .15 : -.5) + (ability ? .25 : 0) - Math.max(0, visibleCount - 1) * .45 + (pf.aggr - .5) * .6 + (this.random() - .5) * .3;
  // An ally near you fights with you, not alone.
  if (this.leader) edge += .15;
  // They are reloading or empty: the moment to go at them.
  if (target.reloading && target.visible) edge += .6;
  const reach = mine.far - theirs.far;
  let kind = 'trade', keep = 0;
  if (edge < -.4) kind = 'fall';
  // (Kiting keeps out of their main threat, not their occasional long
  // ability: Ichor's wave reaches 17 m, but its blade is what to keep off.
  // Robot behaviour pass 2026-09-30: it kept 18 m off Ichor before, which
  // Ichor could never close.)
  else if (reach > 2.5 && edge < .6) { kind = 'kite'; keep = (THREAT[target.weapon] ?? theirs.reach) + 1.2; }
  else if (reach < -2.5) kind = 'close';
  else if (edge > .35) kind = 'push';
  this.fight = { kind, keep, id: target.id, until, edge };
 }

 // Is its weapon's ability there to use (Static's hex, Nominal's Surge,
 // Ballast's Scatter)?
 abilityReady() {
  const sim = this.sim;
  if(sim.weapon==='sheath')return sim.sheath.xCooldown<=0&&!sim.sheath.x;
  if(sim.weapon==='ichor')return sim.ichor.xCooldown<=0&&!sim.ichor.frenzy&&sim.player.hp>20;
  if(sim.weapon==='sidekick')return sim.sidekick.xCooldown<=0&&!sim.sidekick.active&&!sim.sidekick.summon;
  if(sim.weapon==='sightline')return !sim.sightline.special&&!sim.sightline.xLoading&&sim.sightline.xCooldown<=0;
  if(sim.weapon==='omen')return sim.omen.volleyCooldown<=0;
  if (sim.weapon === 'rifle') return sim.surge?.phase === 'idle' && sim.surge.cooldown <= 0;
  if (sim.weapon === 'shotgun') return !!sim.scatter && sim.scatter.cooldown <= 0;
  return sim.hexCooldown <= 0 && sim.ammo >= RULES.hexCost;
 }

 // The aim's scale: the 1V1 page's / dev tools' aim and how hard the weapon is to aim.
 hand() { return (this.aimScale || 1) * (1 + ((WEAPON_AIM[this.sim.weapon] ?? 1) - 1) * (this.pf.feel ?? 1)); }

 // A blade come within a dash or so of it (their THREAT + `inside`): once per
 // time they come in (out again `again` s and it is a new one), it takes a
 // moment before it starts backing off, or now and then stands its ground a
 // while (VS_BLADE). Whether it is holding still (`bladeBack.hold`); read
 // each think (situation) and by move.
 bladeNerve(known, d, threat) {
  const slack = known?.visible && d < threat + VS_BLADE.inside ? this.bladeSlack(known) : 0;
  if (slack > 0) {
   let bk = this.bladeBack;
   if (!bk || this.time - bk.at > VS_BLADE.again) {
    const delay = slack * 2 * (VS_BLADE.backDelay[0] + this.random() * (VS_BLADE.backDelay[1] - VS_BLADE.backDelay[0]));
    const stand = this.random() < slack * VS_BLADE.stand ? VS_BLADE.standFor[0] + this.random() * (VS_BLADE.standFor[1] - VS_BLADE.standFor[0]) : 0;
    bk = this.bladeBack = { hold: this.time + Math.max(delay, stand) };
   }
   bk.at = this.time;
  }
  return this.time < (this.bladeBack?.hold ?? 0);
 }

 // How much a gun robot is caught out by `target`'s blade (VS_BLADE): 0 (not a
 // person with a blade, or it carries one itself, or a skill that reads a
 // blade well) to 1.
 bladeSlack(target) {
  if (!target?.human || !MELEE.has(target.weapon) || MELEE.has(this.sim.weapon)) return 0;
  return clamp((VS_BLADE.top - (this.pf.tech ?? .5)) / VS_BLADE.span, 0, 1);
 }

 // Whether to swing a melee weapon now (Ichor, Sheath). Most swings wait for
 // `reach`; a misjudged one (profile `whiff`, rolled once per swing) goes
 // early, a step or more out of reach, or is cut wide of the target (the
 // blade flicked off line for a moment). A person misreads reach and timing
 // the same way (owner, 2026-09-29: robots should miss more with melee).
 meleeSwing(input, shoot, d, reach, ready, arc) {
  if (!shoot || !ready || this.time < (this.swingWait ?? -1)) return false;
  const plan = this.swingPlan ??= this.random() < this.pf.whiff
   ? (this.random() < .5 ? { kind: 'early', extra: MELEE_WHIFF.early[0] + this.random() * (MELEE_WHIFF.early[1] - MELEE_WHIFF.early[0]) } : { kind: 'wide', side: this.random() < .5 ? -1 : 1 })
   : { kind: 'clean' };
  if (d >= reach + (plan.kind === 'early' ? plan.extra : 0)) return false;
  if (plan.kind === 'wide') {
   const angle = plan.side * (arc / 2 + MELEE_WHIFF.wide);
   this.meleeWide = { angle, until: this.time + MELEE_WHIFF.wideFor };
   if (this.aimAngle != null) {
    this.aimAngle = wrap(this.aimAngle + angle); const p = this.sim.player;
    input.aimX = Math.cos(this.aimAngle); input.aimZ = Math.sin(this.aimAngle); input.aimPointX = p.x + input.aimX * 2; input.aimPointZ = p.z + input.aimZ * 2;
   }
  }
  if (plan.kind !== 'clean') this.swingWait = this.time + MELEE_WHIFF.recover[0] + this.random() * (MELEE_WHIFF.recover[1] - MELEE_WHIFF.recover[0]);
  this.swingPlan = null;
  return true;
 }

 newError(d, scale) {
  const a = this.random() * TAU, size = (.35 + d * .06) * scale * this.pf.aim * this.hand() * (.6 + this.random() * .8);
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
   let score = d + (m.visible ? 0 : 12 + age * 2) + (m.hp / (m.maxHp || RULES.playerHealth)) * 4 + (m.id === this.targetId ? -3 : 0);
   score += hexTargetCost(this, m); // (hex-aware.js: sheltering in an enemy hex)
   // Someone others are already fighting is less tempting (more so you: a
   // crowd rarely all comes for the one player), unless it is right here.
   const on = world.targeting?.get(m.id) || 0;
   if (on && d > 5) score += on * (m.human ? 9 : 6);
   if (lead) {
    score -= Math.max(0, 9 - Math.hypot(m.x - lead.x, m.z - lead.z)) * .5;
    if (lead.hurtBy === m.id) score -= 6;
   }
   // Peel for a teammate who is nearly dead (squad.js).
   if (this.friends.length) score -= peelBonus(m, this.friends);
   if (score < bestScore) { bestScore = score; best = m; }
  }
  const laser=respondToLaser(this);
  if(laser)best=this.memory.get(laser.id)||best;
  this.targetId = best ? best.id : null;
  // Nothing to fight here: a teammate in a fight nearby (squad.js `rally`)
  // is where to go (help them), unless an investigation is fresher.
  if (!best && world.rally && !(this.investigate && this.time - this.investigate.at < 2)) this.investigate = { x: world.rally.x + (this.random() - .5) * 4, z: world.rally.z + (this.random() - .5) * 4, at: this.time };
  this.tactic(best && this.time - best.seen < 3 ? best : null, visibleCount);
  const style = this.band(), pf = this.pf;
  const hpShare = p.hp / (p.maxHp || RULES.playerHealth);
  const empty = this.outOfAmmo();
  const known = best, seen = best?.visible;
  if(seen||!known||this.roomPlan?.id!==known.id)this.roomPlan=null;
  const prev = this.mode;
  const fromLead = lead ? Math.hypot(lead.x - p.x, lead.z - p.z) : 0;
  // Near enough to you (an ally) to go after something there.
  const leashed = spot => !lead || Math.hypot(spot.x - lead.x, spot.z - lead.z) < 16;
  // What stage of a fight this is (engagement.js): seek, approach, engage,
  // press, disengage, reset. It falls back to cover when reloading or empty
  // with the enemy just seen, hurt badly and just hit, losing the trades, a
  // chase not closing, two on it; cover is a breather, not a home (nobody
  // heals): out once loaded, then back in from another side.
  const fresh = known && this.time - known.seen < 1.5;
  // (A bold robot reloads in the open when the enemy is far enough off.)
  const openReload = known && Math.hypot(known.x - p.x, known.z - p.z) > pf.openReload;
  const eng = this.eng, was = eng.state;
  judge(eng, this.situation(known, visibleCount, fresh, empty, openReload, hpShare), pf, this.time, this.random);
  if (eng.state !== was) this.entered(eng.state, known);
  // (Holding its ground, engagement.js HOLD: behind cover between peeks, or
  // where it stands, its gun on where they were.)
  const holding = !!known && eng.state === 'hold';
  const hide = !!known && !this.backoff && eng.reason !== 'recharge' && (eng.state === 'disengage' || (eng.state === 'reset' && eng.phase === 'hide') || (holding && eng.phase === 'wait'));
  const lowLead = lead && lead.hp / (lead.maxHp || RULES.playerHealth) < .35;
  if(laser){this.mode=laser.kind;if(laser.kind==='cover'){this.coverWhy='laser';this.coverUntil=laser.until;}}
  else if (hide) { this.mode = 'cover'; this.coverWhy = eng.reason; }
  // Stand between you and whoever is on you, when you are nearly dead.
  else if (seen && lowLead && hpShare > .5 && Math.hypot(known.x - lead.x, known.z - lead.z) < 14) this.mode = 'guard';
  // An ally does not chase a fight away from you: it falls back to you,
  // shooting as it goes.
  else if (lead && fromLead > (seen ? 18 : 14)) this.mode = 'follow';
  // Coming back from a reset: round to a new angle.
  else if (known && eng.state === 'reset' && eng.phase === 'flank' && this.flankSpot !== false && leashed(known)) this.mode = 'flank';
  else if (seen) this.mode = 'engage';
  else if (holding) this.mode = 'watch';
  else if (known && this.time - known.seen < pf.hunt && leashed(known)) this.mode = 'hunt';
  else if (this.investigate && this.time - this.investigate.at < 10 && leashed(this.investigate)) this.mode = 'investigate';
  else this.mode = lead ? 'follow' : 'patrol';
  if (prev === 'cover' && this.mode !== 'cover') this.coverEnded = eng.coverEnded = this.time;
  if (this.mode === 'cover'&&!laser) {
   if (prev !== 'cover') this.coverFrom = this.time;
   // (Looked for again when the enemy has moved: a spot hidden from where
   // they stood a moment ago is still hidden from where they stand now.)
   const cf = this.coverFor, moved = !cf || !known || Math.hypot(known.x - cf.x, known.z - cf.z) > 2;
   if (prev !== 'cover' || !this.goal || (this.time - this.pathAt > 1.5 && moved)) {
    // (Searches are shared out between robots: a few per tick, so a crowd
    // deciding at once does not stall a frame. None left: decide next tick.)
    if (!this.afford('search')) { if (prev !== 'cover') { this.mode = prev; this.thinkClock = .02; return; } }
    else {
     this.goal = (known && this.findCover(known)) || null;
     if (known) { const c = this.coverFor ||= { x: 0, z: 0 }; c.x = known.x; c.z = known.z; }
    }
   }
   // Nowhere to hide: back off in the open, still fighting (a reset goes
   // straight round instead).
   if (!this.goal) {
    this.coverEnded = eng.coverEnded = this.time;
    if (eng.state === 'reset') { eng.phase = 'flank'; this.mode = 'flank'; }
    // (Holding with no cover about: it holds in the open instead.)
    else if (holding) { eng.stance = eng.reason = 'open'; eng.phase = null; this.mode = seen ? 'engage' : 'watch'; }
    else { this.backoff = true; this.mode = seen ? 'engage' : known ? 'hunt' : lead ? 'follow' : 'patrol'; }
   }
  }
  if(laser){this.goal=laser.goal;}
  else if (this.mode === 'cover') {
  } else if (this.mode === 'guard') {
   const dx = known.x - lead.x, dz = known.z - lead.z, d = Math.hypot(dx, dz) || 1;
   const spot = { x: lead.x + dx / d * Math.min(2.4, d * .5), z: lead.z + dz / d * Math.min(2.4, d * .5) };
   this.goal = Math.hypot(spot.x - p.x, spot.z - p.z) > 1 ? spot : null;
  } else if (this.mode === 'flank') {
   // A spot with a line on them from a new angle (away from the line it
   // backed off along), found once per reset. Reached: the reset is over.
   // (A blade: a hidden spot a dash from them, to spring from.)
   if (this.flankSpot == null && this.afford('search')) this.flankSpot = (MELEE.has(sim.weapon) ? this.findCover(known, true) : this.findShotSpot(known, style, eng.fromAngle)) || false;
   if (this.flankSpot) {
    this.goal = { x: this.flankSpot.x, z: this.flankSpot.z };
    if (Math.hypot(this.flankSpot.x - p.x, this.flankSpot.z - p.z) < 1.2) eng.until = this.time;
   } else { this.goal = { x: known.x, z: known.z, chase: true }; if (this.flankSpot === false) eng.until = this.time; }
  } else if (this.mode === 'watch') {
   // Holding (engagement.js HOLD), out of their sight: where it stands, its
   // gun on where they were; peeking (cover stance), out to the nearest spot
   // with a line on them, found once per peek, no nearer them than it is.
   if (eng.phase !== 'peek') this.goal = null;
   else {
    if (this.peekAt !== eng.phaseAt) { this.peekAt = eng.phaseAt; this.peekSpot = null; }
    if (this.peekSpot == null && this.afford('search')) this.peekSpot = this.findShotSpot(known, this.holdBand(style, Math.hypot(known.x - p.x, known.z - p.z))) || false;
    this.goal = this.peekSpot ? { x: this.peekSpot.x, z: this.peekSpot.z } : null;
   }
  } else if (this.mode === 'engage') {
   const d = Math.hypot(known.x - p.x, known.z - p.z);
   if (!(sim.weapon==='sightline'?sniperClear(this,known.x,known.z):shotClear(sim.colliders, p.x, p.z, known.x, known.z, .04, sim.ground))) {
    // No clear shot from here: the nearest place that has one, at a range
    // the weapon likes (round the side of their cover), else toward them.
    // (Stage 4 audit: a spot whose centre had a line, reached, where the
    // robot's own standing place had none, held it there a minute doing
    // nothing. Arrived and still blocked: that spot is no good for a while,
    // look again. On every map since v0.990a (owner: "fix the robots
    // thing"; it was hills only, and tests/golden-flat.test.js re-recorded).)
    if (this.shotSpot && Math.hypot(this.shotSpot.x - p.x, this.shotSpot.z - p.z) < .6) { this.markBadSpot(this.shotSpot); this.shotSpot = null; this.shotSpotAt = -1e9; }
    const s = this.shotSpot;
    if ((!s || this.time - this.shotSpotAt > 1.2 || Math.hypot(s.forX - known.x, s.forZ - known.z) > 2.5) && this.afford('search')) {
     // (Holding: a line from about here, not a step nearer them.)
     const found = this.findShotSpot(known, holding ? this.holdBand(style, d) : style);
     this.shotSpot = found ? { ...found, forX: known.x, forZ: known.z } : null; this.shotSpotAt = this.time;
    }
    this.goal = this.shotSpot ? { x: this.shotSpot.x, z: this.shotSpot.z } : holding ? null : { x: known.x, z: known.z, chase: true };
   // (Holding: it lets them come, never walks in after them.)
   } else { this.shotSpot = null; this.goal = d > style.far && !holding ? this.approachSpot(known, style, d) : null; }
   // An ally chases no further than a few steps from you.
   if (lead && this.goal && Math.hypot(this.goal.x - lead.x, this.goal.z - lead.z) > 12) {
    const gx = this.goal.x - lead.x, gz = this.goal.z - lead.z, gl = Math.hypot(gx, gz);
    this.goal = { x: lead.x + gx / gl * 10, z: lead.z + gz / gl * 10, chase: true };
   }
  } else if (this.mode === 'hunt') {
   const room=roomPlan(this,known);
   if(room)this.goal=room.goal;
   else if(this.targetId!==null){
   // Where they probably went: the last sighting, carried on along their
   // heading for a moment.
   const age = Math.min(1.6, this.time - known.seen);
   this.goal = { x: known.x + known.vx * age, z: known.z + known.vz * age };
   // There, or can see there and they are not: search round about.
   const gd = Math.hypot(this.goal.x - p.x, this.goal.z - p.z);
   if (gd < 1.2 || (gd < 7 && this.time - known.seen > 1 && sim.sees(this.goal.x, this.goal.z, .3))) this.lose(known);
   }
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
  // (1V1's duel circle: never a goal outside it.)
  if (this.goal) this.goal = this.inside(this.goal);
  this.watchGoal();
  // Re-plan when the goal moved or the route is old.
  if (this.goal) {
   const moved = !this.pathGoal || Math.hypot(this.goal.x - this.pathGoal.x, this.goal.z - this.pathGoal.z) > 1.5;
   // (Not more than a few times a second: a long route costs a few ms.)
   if ((moved && this.time - this.pathAt > .4) || !this.path || this.time - this.pathAt > 2.5) this.plan(this.goal);
  } else this.path = null;
  // Strafe side: switches at uneven intervals, each weave its own width; a
  // skilled robot now and then jukes (a quick switch back).
  if (this.time > this.strafeUntil) {
   this.strafe = this.random() < .5 ? -1 : 1; this.strafeUntil = this.time + (1.3 + this.random() * 2.2) * this.pf.strafeTime;   // v146: longer, calmer weaves
   this.weaveAmp = .6 + this.random() * .55;
   if (this.random() < this.pf.tech * .22) this.strafeUntil = this.time + .3 + this.random() * .35;
  }
 }

 // The band a holding robot (engagement.js HOLD) looks for a line from: about
 // as far as it is now (`d`), so a shot or peek spot is a step aside, not in.
 holdBand(style, d) { return { ...style, near: Math.min(style.near, Math.max(1, d - 3)), far: Math.max(style.far, d + 1), reach: Math.max(style.reach, d + 2) }; }

 // Fills the situation the engagement loop reads (engagement.js), in place.
 situation(known, visibleCount, fresh, empty, openReload, hpShare) {
  const s = this.sit, p = this.sim.player, pf = this.pf, base = STYLE[this.sim.weapon] || STYLE.static;
  s.leader = !!this.leader; s.seen = !!known?.visible; s.fresh = !!fresh;
  s.has = !!known && (s.seen || this.time - known.seen < Math.min(pf.hunt ?? 8, 6));
  if (!known) return s;
  s.d = Math.hypot(known.x - p.x, known.z - p.z);
  s.near = base.near * pf.range; s.far = Math.min(base.reach, base.far * pf.range); s.reach = base.reach;
  s.threat = THREAT[known.weapon] ?? 8; s.melee = MELEE.has(this.sim.weapon);
  s.inThreat = !s.melee && s.near > s.threat && s.d < s.threat + 1;
  // (A blade come in on it, VS_BLADE: not backing off for it yet.)
  if (this.bladeNerve(known, s.d, s.threat) && s.inThreat) s.inThreat = false;
  s.my = hpShare; s.their = (known.hp ?? RULES.playerHealth) / (known.maxHp || RULES.playerHealth);
  s.empty = empty;
  // (How near they must be for a reload to send it back: Static's orbs come
  // back on their own as it weaves, so only when someone is close.)
  s.reloadFrom = this.sim.weapon === 'static' ? 9 : 0;
  s.recharging = this.sim.weapon === 'static' && this.sim.ammo + this.sim.seeds.length < (pf.tech > .5 ? 4 : 3);
  s.openReload = !!openReload; s.ability = this.abilityReady();
  s.theirReload = !!known.reloading; s.theirSpent = !!known.spent;
  s.foes = visibleCount; s.hurt = this.time - this.hurtAt; s.fall = this.fight?.kind === 'fall';
  // (Near the storm's closing edge: no place to hold, engagement.js HOLD.)
  const c = this.sim.storm; s.stormNear = !!c && Math.hypot(p.x - c.x, p.z - c.z) > c.r - ROBOT_EDGE - STORM_EDGE - 3;
  // Its side close by, and (team games) whether its target has anyone of its own near.
  let mates = 0;
  for (const f of this.friends) if (f.hp > 0 && Math.hypot(f.x - p.x, f.z - p.z) < 14) mates++;
  s.mates = mates;
  let alone = this.team !== 'ffa';
  if (alone) for (const m of this.memory.values()) if (m !== known && m.visible && Math.hypot(m.x - known.x, m.z - known.z) < 9) { alone = false; break; }
  s.isolated = alone;
  return s;
 }

 // A new stage of the fight (engagement.js): what changes with it.
 entered(state, known) {
  const p = this.sim.player;
  if (state === 'disengage' || state === 'reset' || state === 'seek' || state === 'hold') this.backoff = state === 'disengage' && this.eng.reason === 'recharge';
  if (state === 'reset') {
   // The line it backed off along: it comes back from another.
   this.flankSpot = null;
   this.eng.fromAngle = known ? Math.atan2(p.z - known.z, p.x - known.x) : null;
  }
  if (state === 'approach' || state === 'press') this.approach = null;
 }

 // Is `who` aiming its way (within `tol` rad of the line to it)?
 aimedAt(who, tol = .45) { const p = this.sim.player; return who.aimX != null && Math.abs(wrap(Math.atan2(p.z - who.z, p.x - who.x) - Math.atan2(who.aimZ, who.aimX))) < tol; }

 // Does `known`'s weapon reach well past its own band?
 outranged(known, style) { return (STYLE[known.weapon]?.far ?? 10) > style.far + 2; }

 // Where to walk to close in on `known` from `d` m: not straight at them but
 // on an angle, a point beside their line at about its band, the side
 // swapping every few seconds (a zigzag at walking scale; a melee robot
 // swings wider, a pressing one comes nearly straight).
 approachSpot(known, style, d) {
  const p = this.sim.player, e = this.eng;
  let a = this.approach;
  if (!a || this.time > a.until || a.id !== known.id) {
   const press = e.state === 'press';
   if (this.random() < .7) e.side = -e.side;
   // (Outranged, every second in the open costs: nearly straight in, jinking
   // (move()). Outranging them, it has time to come round the side.)
   const phi = (press ? .22 : this.outranged(known, style) ? .2 : .4 + this.pf.flank * .35) * (.7 + this.random() * .6);
   a = this.approach = { id: known.id, phi, until: this.time + 1.4 + this.random() * 1.6 };
  }
  const bx = p.x - known.x, bz = p.z - known.z, bd = Math.hypot(bx, bz) || 1;
  const ang = Math.atan2(bz, bx) + e.side * a.phi, r = Math.max(style.far * .8, Math.min(bd - 3, bd * .7));
  const x = known.x + Math.cos(ang) * r, z = known.z + Math.sin(ang) * r, i = this.nav.cellOf(x, z);
  if (i >= 0 && this.nav.open[i] && this.nav.clearance[i] >= 2) return { x, z, chase: true };
  return { x: known.x, z: known.z, chase: true };
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
  if(this.mode==='hunt'&&this.roomPlan&&this.roomPlan.kind!=='push'&&d<1.4){this.watch=null;return;}
  if (d < 1.6 && this.mode === 'follow') { this.watch = null; this.followNudge = 0; return; }
  if (!w || Math.hypot(g.x - w.x, g.z - w.z) > 3 || w.mode !== this.mode) { this.watch = { x: g.x, z: g.z, best: d, at: this.time, mode: this.mode }; return; }
  if (d < w.best - .5) { w.best = d; w.at = this.time; return; }
  if (this.time - w.at < 3.5) return;
  this.watch = null; this.gaveUp = (this.gaveUp || 0) + 1;
  const known = this.targetId != null ? this.memory.get(this.targetId) : null;
  if (this.mode === 'hunt' && known) this.lose(known);
  else if (this.mode === 'investigate') this.investigate = null;
  else if (this.mode === 'cover') { this.coverEnded = this.eng.coverEnded = this.time; this.coverUntil = 0; if (this.eng.state === 'reset') this.eng.phase = 'flank'; else if (this.eng.state === 'hold') { this.eng.stance = this.eng.reason = 'open'; this.eng.phase = null; } else this.backoff = true; }
  else if (this.mode === 'watch') this.peekSpot = false;
  else if (this.mode === 'flank') { this.flankSpot = false; this.eng.until = this.time; }
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
  // (1V1's duel circle: a route round something that swings outside the
  // circle is walked along its inside edge instead of into the wall.)
  if (this.path && (this.sim.boundary || this.sim.storm)) this.path = this.path.map(w => this.inside(w));
  this.pathGoal = { x: goal.x, z: goal.z }; this.pathAt = this.time;
 }

 // 1V1's duel circle (duel-circle.js, `sim.boundary`, owner 2026-09-29): a
 // spot outside it is brought in along the line to the centre, a body and a
 // step inside the edge; the same spot when there is no circle or it is in.
 inside(spot) {
  if (!spot) return spot;
  // The storm too (storm.js, `sim.storm`): kept a few metres in from its
  // edge, which is closing, so a robot never picks a spot in it and walks
  // back in when caught out.
  return this.within(this.within(spot, this.sim.boundary, ROBOT_EDGE), this.sim.storm, ROBOT_EDGE + STORM_EDGE);
 }
 // Caught in the storm, or at its closing edge: out of it first, whatever
 // else it meant to do (it keeps aiming and firing on the way). Straight in
 // when it can, else along a route to the nearest safe spot.
 escapeStorm(input) {
  const c = this.sim.storm, p = this.sim.player;
  if (!c || Math.hypot(p.x - c.x, p.z - c.z) < c.r - ROBOT_EDGE - 1) { this.stormPath = null; return; }
  const to = this.within({ x: p.x, z: p.z }, c, ROBOT_EDGE + STORM_EDGE);
  let aim = to;
  if (!this.nav.walkable(p.x, p.z, to.x, to.z)) {
   if ((!this.stormPath || !this.stormPath.length || this.time - (this.stormPathAt ?? -9) > 1) && this.afford('path')) { this.stormPath = this.nav.path(p.x, p.z, to.x, to.z, 20000) || null; this.stormPathAt = this.time; }
   while (this.stormPath?.length && Math.hypot(this.stormPath[0].x - p.x, this.stormPath[0].z - p.z) < .5) this.stormPath.shift();
   aim = this.stormPath?.[0] || { x: c.x, z: c.z };
  }
  const dx = aim.x - p.x, dz = aim.z - p.z, l = Math.hypot(dx, dz);
  if (l > 1e-6) { input.moveX = dx / l; input.moveZ = dz / l; }
 }
 within(spot, c, edge) {
  if (!c) return spot;
  const dx = spot.x - c.x, dz = spot.z - c.z, d = Math.hypot(dx, dz), room = Math.max(0, c.r - edge);
  if (d <= room) return spot;
  const k = room / (d || 1);
  return { ...spot, x: c.x + dx * k, z: c.z + dz * k };
 }

 outOfAmmo() {
  const sim = this.sim;
  if(sim.weapon==='ichor'||sim.weapon==='sheath')return false;
  if(sim.weapon==='sidekick')return !sim.sidekick.active&&(sim.sidekick.reload>0||sim.sidekick.ammo<=0);
  if(sim.weapon==='sightline')return sim.sightline.crouched?sim.sightline.rifleReload>0||!sim.sightline.rifleAmmo:sim.sightline.pistolReload>0||!sim.sightline.pistolAmmo;
  if(sim.weapon==='omen')return sim.omen.reload>0||sim.omen.ammo<=0;
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
  const p = this.sim.player, pool = (world?.enemies || []).filter(e => e.hp > 0 && !this.sim.buildingAt(e.x,e.z));
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
 // `ambush` (a blade coming back from a reset, robot behaviour pass
 // 2026-09-30): a hidden spot a dash or so from them, to spring from.
 findCover(enemy, ambush = false) {
  const p = this.sim.player, nav = this.nav, reach = nav.flood(p.x, p.z, 12), k = ambush ? .6 : 1;
  let best = null, bestScore = Infinity;
  // The flood hands squares back nearest first, so once the walk alone costs
  // more than the best spot found, nothing later can beat it.
  for (const [i, walk] of reach) {
   if (walk * k - .9 >= bestScore) break;
   if (nav.clearance[i] < 2) continue;
   // Every other row and column: a spot a quarter-metre off is as good.
   const col = i % nav.cols, row = (i - col) / nav.cols; if ((col | row) & 1) continue;
   const c = nav.centre(i), fromEnemy = Math.hypot(c.x - enemy.x, c.z - enemy.z);
   if (fromEnemy < (ambush ? 3.5 : 4)) continue;
   // An ally hides near you, not across the map.
   if (this.leader && Math.hypot(c.x - this.leader.x, c.z - this.leader.z) > 12) continue;
   const score = (ambush ? walk * k + Math.abs(fromEnemy - 5.5) * 1.2 : walk + Math.max(0, 9 - fromEnemy) * 1.5) - Math.min(3, nav.clearance[i]) * .3 + this.wetCost(c);
   if (score >= bestScore) continue;
   if (enemy.weapon==='sightline'?sniperLineClear(this.sim,enemy,c.x,c.z):shotClear(this.sim.colliders, enemy.x, enemy.z, c.x, c.z, .3, this.sim.ground)) continue;
   bestScore = score; best = c;
  }
  return best;
 }

 // A place to shoot `enemy` from: the nearest by walking distance with a
 // clear line to them, at a range the weapon likes. Same flood as cover.
 // `avoid` (a reset, engagement.js): the bearing from them it backed off
 // along; spots near that line cost more, so it comes back from another side.
 findShotSpot(enemy, style, avoid = null) {
  const p = this.sim.player, nav = this.nav, reach = nav.flood(p.x, p.z, 12), lead = this.leader, hills = !this.sim.ground?.flat;
  const mid = (style.near + style.far) / 2;
  const flank = avoid != null ? Math.max(this.pf.flank, this.eng.th.flank ?? .55) : this.fight?.kind === 'close' ? Math.max(this.pf.flank, .7) : this.pf.flank;
  let best = null, bestScore = Infinity;
  for (const [i, walk] of reach) {
   if (walk - flank * 3 >= bestScore) break;
   if (nav.clearance[i] < 2) continue;
   const col = i % nav.cols, row = (i - col) / nav.cols; if ((col | row) & 1) continue;
   const c = nav.centre(i), d = Math.hypot(c.x - enemy.x, c.z - enemy.z);
   if (d > style.reach || d < style.near * .6) continue;
   if (lead && Math.hypot(c.x - lead.x, c.z - lead.z) > 12) continue;
   // (Hills: not where it stands now, nor a spot that just let it down.)
   if (hills && (Math.hypot(c.x - p.x, c.z - p.z) < .6 || this.isBadSpot(c))) continue;
   // A flanker wants an angle on them, not the same line it was on.
   let score = walk + Math.abs(d - mid) * .35 + this.wetCost(c);
   if (avoid != null) { const off = Math.abs(wrap(Math.atan2(c.z - enemy.z, c.x - enemy.x) - avoid)); if (off < .9) score += (.9 - off) * 5; }
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
   // (Holding, engagement.js HOLD: out past its band it waits for them, weaving where it stands.)
   let radial = d > style.far ? (this.eng.state === 'hold' ? 0 : 1) : d < style.near ? -1 : (d - (style.near + style.far) / 2) / (style.far - style.near) * .6;
   // Inside its band it peeks: drifts in and out a little as it weaves
   // (robot behaviour pass 2026-09-30), each weave its own width.
   if (d >= style.near && d <= style.far) radial += Math.sin(this.time * 1.9 + this.slotIndex * 2.1) * .22 * (.4 + this.pf.tech * .6);
   // Off a player's screen it may not shoot (openFire), so it closes in.
   if (offScreen(p.x, p.z, target.x, target.z, 1, this.rise(target), target.aspect)) radial = 1;
   // A blade come in on it (VS_BLADE, bladeNerve): it stands where it is a
   // moment before it starts backing off, or a while when it stands its ground.
   if (radial < 0 && this.time < (this.bladeBack?.hold ?? 0)) radial = 0;
   const wv = weave * this.weaveAmp;
   mx = ux * radial - uz * this.strafe * wv; mz = uz * radial + ux * this.strafe * wv;
   // Would that step leave open ground? Try the other side, then just the radial.
   // (A walk check, not just the end square: thin walls sit between squares.)
   const clear = (x, z) => { const l = Math.hypot(x, z) || 1; return this.nav.walkable(p.x, p.z, p.x + x / l * .9, p.z + z / l * .9); };
   if (!clear(mx, mz)) {
    this.strafe *= -1; this.strafeUntil = this.time + .6; mx = ux * radial - uz * this.strafe * wv; mz = uz * radial + ux * this.strafe * wv;
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
  } else if (target?.visible && this.mode === 'engage' && this.outranged(target, style)) {
   // Closing on a longer weapon that can see it, it jinks side to side (a
   // straight walk in is easy to hit; each jink throws their aim off).
   // (Review 2026-09-30: only while they are aiming at it or lined up to
   // fire; otherwise straight in. Jinking at someone backing off with their
   // aim elsewhere only let them get away.)
   const d = Math.hypot(target.x - p.x, target.z - p.z);
   if (d < 14 && (this.aimedAt(target) || this.threatened(target, world))) {
    if (this.time > (this.jinkUntil ?? -1)) { this.jink = -(this.jink || 1); this.jinkUntil = this.time + .4 + this.random() * .45; }
    const k = .5 * this.jink, jx = mx - mz * k, jz = mz + mx * k, l = Math.hypot(jx, jz) || 1;
    if (this.nav.walkable(p.x, p.z, p.x + jx / l * .9, p.z + jz / l * .9)) { mx = jx / l; mz = jz / l; }
   }
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
  // Backing off from a blade close by (VS_BLADE): not at full tilt.
  if (target?.visible && (mx || mz)) {
   const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz) || 1, along = (mx * dx + mz * dz) / d;
   if (along < 0 && d < VS_BLADE.near) { const k = this.bladeSlack(target) * VS_BLADE.backSlow; if (k > 0) { mx -= dx / d * along * k; mz -= dz / d * along * k; } }
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
  const room=this.mode==='hunt'&&this.roomPlan?.id===target?.id?this.roomPlan:null;
  if(this.sniper?.mode==='scan'){tx=p.x+Math.cos(this.sniper.angle)*24;tz=p.z+Math.sin(this.sniper.angle)*24;this.aimPoint=null;}
  else if(room){tx=room.aim.x;tz=room.aim.z;this.aimPoint={x:tx,z:tz,d:Math.hypot(tx-p.x,tz-p.z)};}
  else if (target && (target.visible || this.time - target.seen < 1.5 || this.mode === 'hunt' || this.mode === 'watch')) {
   const d = Math.hypot(target.x - p.x, target.z - p.z);
   // Lead by the projectile's flight time (and a little of the robot's own
   // reaction), aim error settling as it tracks.
   const speed=sim.weapon==='sightline'&&!sim.sightline.crouched?SIGHTLINE.pistolSpeed:style.speed;
   const lead = (d / speed + (sim.weapon==='sightline'&&sim.sightline.crouched?SIGHTLINE.commit:.04)) * this.pf.lead;
   const age = target.visible ? 0 : Math.min(.8, this.time - target.seen);
   tx = target.x + target.vx * (lead + age); tz = target.z + target.vz * (lead + age);
   const settle = Math.exp(-dt / this.pf.settle);
   this.aimError.x *= settle; this.aimError.z *= settle;
   // A target changing direction throws the aim off again.
   const jink = Math.hypot(target.vx - (this.lastVX ?? target.vx), target.vz - (this.lastVZ ?? target.vz));
   if (jink > 2.5) { const e = this.newError(d, .5); this.aimError.x += e.x; this.aimError.z += e.z; }
   this.lastVX = target.vx; this.lastVZ = target.vz;
   // A blade dashing close by (VS_BLADE): its aim thrown off, and a beat
   // before it pulls the trigger again (a person re-finds them too).
   if (target.dashAt != null && target.dashAt > (this.dashSeen ?? -9)) {
    this.dashSeen = target.dashAt;
    const slack = d < VS_BLADE.shockIn ? this.bladeSlack(target) : 0;
    if (slack > 0) {
     const e = this.newError(d, VS_BLADE.shock * slack); this.aimError.x += e.x; this.aimError.z += e.z;
     this.dashWait = this.time + slack * 2 * (VS_BLADE.wait[0] + this.random() * (VS_BLADE.wait[1] - VS_BLADE.wait[0]));
    }
   }
   // Now and then a shot goes wide: the hand pulls off to one side for a
   // moment (settles like any aim error). Often for an easy robot, rarely
   // for a hard one (profile `miss`: the chance each half-second or so).
   this.missClock = (this.missClock ?? .5) - dt;
   if (target.visible && this.missClock <= 0) {
    this.missClock = .45 + this.random() * .35;
    if (this.random() < Math.min(.95, this.pf.miss * Math.min(2.2, this.hand()))) {
     const side = this.random() < .5 ? -1 : 1, ux = (target.x - p.x) / (d || 1), uz = (target.z - p.z) / (d || 1), size = (.75 + this.random() * .6) * (1 + d * .02);
     this.aimError.x += -uz * side * size; this.aimError.z += ux * side * size;
    }
   }
   tx += this.aimError.x; tz += this.aimError.z;
   // The hand's own wobble (bigger on a worse robot), never settled out.
   this.wob = (this.wob || this.random() * 9) + dt * 2.3;
   const shake = this.pf.shake * this.hand() * (.15 + d * .035);
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
  let want = muzzleBearing(p.x, p.z, tx, tz, muzzleLateral(this.sim.weapon,this.sim.sightline?.crouched));
  // (A melee swing cut wide: meleeSwing.)
  if (this.meleeWide && this.time < this.meleeWide.until) want = wrap(want + this.meleeWide.angle); else this.meleeWide = null;
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
  const probe=!visible&&this.mode==='hunt'&&this.roomPlan?.id===target?.id&&this.roomPlan?.kind==='probe';
  const lined = (visible||probe) && this.aimPoint && (sim.weapon==='sightline'&&sim.sightline.crouched?sniperClear(this,this.aimPoint.x,this.aimPoint.z):shotClear(sim.colliders, p.x, p.z, this.aimPoint.x, this.aimPoint.z, .04, sim.ground)) && !(this.friends.length && this.friendInWay(this.aimPoint.x, this.aimPoint.z));
  const ready = t - this.acquiredAt > (this.reaction ??= this.pf.reaction[0] + this.random() * (this.pf.reaction[1] - this.pf.reaction[0]));
  // (A blade's cut is wide: Ichor's arc is 2.9 rad, Sheath's about 2. Within
  // a third of it the swing lands; the gun rule, a body's width at its range,
  // left a blade that had just dashed in holding its swing while it turned.)
  const onTarget = MELEE.has(sim.weapon) ? this.aimOff < (sim.weapon === 'ichor' ? ICHOR.arc : 2) * .3 * Math.min(1.2, this.pf.trigger)
   : this.aimOff < (Math.atan2(.5, Math.max(1, d)) + .03) * this.pf.trigger;
  const open = this.openFire(target, d);
  this.holding = !!target && visible && !open;
  let shoot = (visible||probe) && lined && ready && onTarget && open;
  // (A blade just dashed at it: VS_BLADE.)
  if (t < (this.dashWait ?? -1)) shoot = false;
  // An easier robot rests its trigger now and then (profile `rest`): after
  // every ~1.6 s of firing, a pause while it re-aims, as a person hesitates.
  // (Not Static: its fire is placing orbs, already paced by the orbs.)
  if (this.pf.rest > 0 && sim.weapon !== 'static') {
   if (t < (this.restUntil ?? -1)) shoot = false;
   else if (shoot && (this.fireClock = (this.fireClock || 0) + dt) > 1.6) { this.fireClock = 0; this.restUntil = t + this.pf.rest * (.6 + this.random() * .8); }
  }
  // Dodge: a grenade at its feet, stuck, or just hit hard with stamina to spare.
  if (this.wantDodge) {
   input.dodge = true; input.moveX = this.wantDodge.x; input.moveZ = this.wantDodge.z; this.wantDodge = null;
  // (A blade keeps a dash in hand for closing in: dashIn.)
  } else if (p.stamina >= RULES.dodgeStaminaCost * (MELEE.has(sim.weapon) ? 2 : 1) && t - (this.dodgedAt ?? -9) > 1.2 && target && this.threatened(target, world) && !(target.weapon==='sightline'&&target.sightline?.aiming) && this.random() < this.pf.tech * .5) {
   // It saw them line up on it and fire: out of the way, across their line.
   const dx = target.x - p.x, dz = target.z - p.z, dd = Math.hypot(dx, dz) || 1, side = this.nav.walkable(p.x, p.z, p.x - dz / dd * 2.5 * this.strafe, p.z + dx / dd * 2.5 * this.strafe) ? this.strafe : -this.strafe;
   input.dodge = true; input.moveX = -dz / dd * side; input.moveZ = dx / dd * side; this.dodgedAt = t;
  } else if (t - this.hurtAt < .05 && (this.lastHurt || 0) > 3.6 && p.stamina >= RULES.dodgeStaminaCost * (MELEE.has(sim.weapon) ? 2 : 1) && this.random() < this.pf.dodge && target) {
   const dx = target.x - p.x, dz = target.z - p.z, dd = Math.hypot(dx, dz) || 1;
   input.dodge = true; input.moveX = -dz / dd * this.strafe; input.moveZ = dx / dd * this.strafe;
  }
  // A big ability coming (a charged Scatter, a Frenzy, a draw-cut, Surge...):
  // out of the way, across its line.
  else if (visible && target.big && d < (THREAT[target.weapon] ?? 8) + 3 && p.stamina >= RULES.dodgeStaminaCost && t - (this.dodgedAt ?? -9) > 1.2 && this.random() < this.pf.tech * .08) {
   const dx = target.x - p.x, dz = target.z - p.z, dd = Math.hypot(dx, dz) || 1, side = this.nav.walkable(p.x, p.z, p.x - dz / dd * 2.5 * this.strafe, p.z + dx / dd * 2.5 * this.strafe) ? this.strafe : -this.strafe;
   input.dodge = true; input.moveX = -dz / dd * side; input.moveZ = dx / dd * side; this.dodgedAt = t;
  }
  else if (this.dashIn(input, target, d, visible)) { /* a blade's gap-closer */ }
  else if (this.breakAway(input, target, d, visible)) { /* backing off: a dodge breaks the chase */ }
  // Closing on a longer gun (owner, v146, from robot-vs-robot trials: Ballast
  // and Static robots were picked off walking in): a dash in at an angle,
  // now and then, when it means to close and still has a dodge in hand.
  else if (visible && sim.weapon !== 'rifle' && target.weapon === 'rifle' && d > this.band().far + 1 && d < 15 && p.stamina >= RULES.dodgeStaminaCost * 2 && t - (this.dodgedAt ?? -9) > 1.4 && this.random() < this.pf.tech * .05) {
   const ux = (target.x - p.x) / d, uz = (target.z - p.z) / d, mx = ux * .8 - uz * .6 * this.strafe, mz = uz * .8 + ux * .6 * this.strafe;
   if (this.nav.walkable(p.x, p.z, p.x + mx * 3, p.z + mz * 3)) { input.dodge = true; input.moveX = mx; input.moveZ = mz; this.dodgedAt = t; }
  }
  if (sim.weapon === 'rifle') this.rifle(input, target, d, shoot, visible);
  else if (sim.weapon === 'shotgun') this.shotgun(input, target, d, shoot, visible);
  else if(sim.weapon==='ichor'){input.aiming=false;input.tapFire=this.meleeSwing(input,shoot,d,2.5,sim.ichor.cooldown<=0,ICHOR.arc);input.ichorE=shoot&&d>3&&d<16&&sim.ichor.eCooldown<=0&&sim.ichor.blood>=ICHOR.eBlood&&sim.player.hp>ICHOR.waveDamage*2;/* (v0.990a: the wave costs half its hit in health) *//* Frenzy (faster, every slash heals): in contact, sooner once it is trading blows (robot behaviour pass 2026-09-30) */if(shoot&&d<3.2&&this.xAllowed(sim.ichor.blood>0||sim.player.hp<70?.2:1)){input.ichorX=true;this.usedX();}if(this.ichorGuard(target,d,visible,world)){input.ichorGuard=true;input.tapFire=input.ichorE=input.ichorX=false;}}
  else if(sim.weapon==='sheath')this.sheath(input,target,d,shoot,visible);
  else if(sim.weapon==='sidekick')this.sidekick(input,target,d,shoot,visible);
  else if(sim.weapon==='sightline')this.sightline(input,target,d,shoot,visible);
  else if(sim.weapon==='omen')this.omen(input,target,d,shoot,visible);
  else this.staticGun(input, target, d, shoot, visible, lined);
  paceRoomFire(this,input,target);
 }

 // A blade's gap-closer (robot behaviour pass 2026-09-30): from a dodge or two
 // out of reach, dash in at a slight angle, at a good moment (pressing, they
 // are reloading or spent, their aim is off it) or now and then; the second
 // dash of a pair follows the first. Its slash right after a dash lands
 // harder (Ichor), and a dash takes half damage.
 dashIn(input, target, d, visible) {
  const sim = this.sim, p = sim.player, t = this.time;
  if (!visible || !MELEE.has(sim.weapon) || p.dodgeRemaining > 0 || p.stamina < RULES.dodgeStaminaCost || t - (this.dodgedAt ?? -9) < .3) return false;
  if (sim.weapon === 'sheath' && sim.sheath.x) return false;
  const reach = sim.weapon === 'ichor' ? ICHOR.range : SHEATH.range, far = reach + RULES.dodgeDistance * Math.floor(p.stamina + 1e-6) - .4;
  if (d < reach + .6 || d > far || !this.openFire(target, d)) return false;
  const chain = t - (this.dashedInAt ?? -9) < .45;
  if (!chain) {
   const aimOff = target.aimX == null || Math.abs(wrap(Math.atan2(p.z - target.z, p.x - target.x) - Math.atan2(target.aimZ, target.aimX))) > .6;
   // (Review 2026-09-30: someone backing away from it is a good moment too:
   // walking, a blade never gains on them.)
   const away = ((target.x - p.x) * target.vx + (target.z - p.z) * target.vz) / (d || 1) > 2.5;
   const good = this.eng.state === 'press' || target.reloading || target.spent || aimOff || away;
   if (this.random() >= (good ? .06 + this.pf.tech * .14 : .012 + this.pf.tech * .03)) return false;
  }
  const ux = (target.x + target.vx * .2 - p.x) / d, uz = (target.z + target.vz * .2 - p.z) / d, k = this.eng.side * .28;
  let mx = ux - uz * k, mz = uz + ux * k; const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l;
  if (!this.dashable(mx, mz)) return false;
  input.dodge = true; input.moveX = mx; input.moveZ = mz; this.dodgedAt = t; this.dashedInAt = chain ? -9 : t;
  return true;
 }

 // Backing off from someone closing on it (engagement.js disengage): a dodge
 // away on a diagonal breaks their chase (a skilled robot, now and then).
 breakAway(input, target, d, visible) {
  const p = this.sim.player, t = this.time;
  if (!visible || this.eng.state !== 'disengage' || p.stamina < RULES.dodgeStaminaCost || t - (this.dodgedAt ?? -9) < 1.5 || d > (THREAT[target.weapon] ?? 8) + 2) return false;
  const closing = ((p.x - target.x) * target.vx + (p.z - target.z) * target.vz) / (d || 1) > 2.5;
  if (!closing || this.random() >= this.pf.tech * .06 * (1 - this.bladeSlack(target) * VS_BLADE.breakAway)) return false;
  const ux = (p.x - target.x) / (d || 1), uz = (p.z - target.z) / (d || 1), mx = ux * .8 - uz * .6 * this.strafe, mz = uz * .8 + ux * .6 * this.strafe;
  if (!this.dashable(mx, mz)) return false;
  input.dodge = true; input.moveX = mx; input.moveZ = mz; this.dodgedAt = t;
  return true;
 }

 // A dodge along (mx, mz) lands on open ground, inside the duel circle and
 // clear of the storm's edge (robots keep to the safe zone).
 dashable(mx, mz) {
  const p = this.sim.player, x = p.x + mx * RULES.dodgeDistance, z = p.z + mz * RULES.dodgeDistance, c = this.sim.storm, b = this.sim.boundary;
  if (c && Math.hypot(x - c.x, z - c.z) > c.r - ROBOT_EDGE - 1) return false;
  if (b && Math.hypot(x - b.x, z - b.z) > b.r - ROBOT_EDGE) return false;
  return this.nav.walkable(p.x, p.z, x, z);
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
  // (Pressing, engagement.js: it has taken the initiative.)
  if (aimedAt || t - this.hurtAt < 4 || d < 6.5 - k * 1.5 || (s.initAt != null && t >= s.initAt) || (target.visible && this.eng.state === 'press')) s.until = t + 6;
  return t < s.until;
 }

 // X abilities a bit rarer (owner, v146): once ready, it waits a while
 // before using it (longer for easier robots, xRate).
 // (Counted from the first moment it could use it in a fight.)
 // Sheath: slash in reach (never pressed mid-dash; the rules would hold it
 // anyway), Gold Rush to close on someone far off or to get away when low,
 // the Draw-cut down a clear line within its reach, at once when it would
 // finish them.
 sheath(input,target,d,shoot,visible){
  const sim=this.sim,s=sim.sheath,p=sim.player,dashing=p.dodgeRemaining>0;
  input.aiming=false;
  input.tapFire=this.meleeSwing(input,shoot,d,SHEATH.range*(s.rush>0?SHEATH.rushReach:1)+.3,!dashing&&s.cooldown<=0,2);
  // (Gold Rush to close from 6-15 m while it means to fight, not backing off;
  // or to get away when low.)
  const st=this.eng.state,closing=st==='approach'||st==='press'||st==='engage';
  input.sheathE=!!target&&!s.rush&&s.eCooldown<=0&&((visible&&closing&&this.openFire(target,d)&&d>6&&d<15)||(p.hp<p.maxHp*.3&&visible&&d<7));
  // (The line starts where the hop back ends: its reach from here is
  // xRange - xBackDist.)
  if(shoot&&!dashing&&!s.x&&s.xCooldown<=0&&d>1.6&&d<SHEATH.xRange-SHEATH.xBackDist-.3){
   // (The line's wall check only once it would go: it walks every collider.)
   const finish=target.hp!=null&&target.hp<=SHEATH.xDamage-SHEATH.xRoll;
   if((finish||this.xAllowed())&&sheathDrawCutLength(sim,p.x-p.aimX*SHEATH.xBackDist,p.z-p.aimZ*SHEATH.xBackDist,p.aimX,p.aimZ,segmentBox)-SHEATH.xBackDist>=d-.2){input.sheathX=true;this.usedX();}
  }
 }
 // `soon` (0-1): a moment that calls for it cuts the wait (Ichor's Frenzy in
 // contact; pressing, engagement.js, halves it).
 xAllowed(soon = 1) {
  if (this.holding || !this.abilityReady()) { if (!this.holding) this.readySince = null; return false; }
  this.readySince ??= this.time; this.xWait ??= this.newXWait();
  // (Pressing: its ability now, not in a while.)
  return this.time - this.readySince >= this.xWait * Math.min(soon, this.eng.state === 'press' ? .5 : 1);
 }
 usedX() { this.readySince = null; this.xWait = this.newXWait(); }
 newXWait() { return (4 + this.random() * 12) * (1.4 - (this.pf.xRate ?? 1)); }

 // Is `target` aiming at it and firing, within its weapon's reach?
 // Ichor's guard (hold: the blade across its front soaks up bullets,
 // ICHOR.guardCapacity): raised while someone shoots at it with a gun from
 // beyond its reach and it closes in; lowered to cut once in reach, when it
 // breaks (its cooldown) or after a second or two. How readily it thinks of
 // it: its game sense (profile tech; an easy robot hardly ever).
 ichorGuard(target, d, visible, world) {
  const s = this.sim.ichor, t = this.time;
  if (!target || !visible || s.frenzy > 0 || s.guardCooldown > 0 || d < 2.8 || !GUN_WEAPONS.has(target.weapon)) { this.guardUntil = 0; return false; }
  if (!(this.guardUntil > t) && t >= (this.guardNext ?? 0) && this.threatened(target, world)) {
   if (this.random() < this.pf.tech * .8) this.guardUntil = t + 1 + this.random() * 1.5;
   this.guardNext = t + 1.2;
  }
  return this.guardUntil > t;
 }

 threatened(target, world) {
  if (!target.visible || target.aimX == null) return false;
  const p = this.sim.player, dx = p.x - target.x, dz = p.z - target.z, d = Math.hypot(dx, dz) || 1;
  if (d > (STYLE[target.weapon]?.reach || 16)) return false;
  const off = Math.abs(wrap(Math.atan2(dz, dx) - Math.atan2(target.aimZ, target.aimX)));
  return off < Math.atan2(.9, d) + .05 && (target.weapon==='sightline'&&target.sightline?.crouched&&target.sightline?.aiming&&target.sightline?.rifleAmmo>0&&this.laserResponse?.id===target.id&&!!this.laserResponse.kind&&this.time>=this.laserResponse.readyAt || target.loud || (world.noises || []).some(n => Math.hypot(n.x - target.x, n.z - target.z) < 1.5));
 }

 sidekick(input,target,d,shoot,visible){
  const s=this.sim.sidekick;input.aiming=visible&&d>8&&!s.active;
  input.fire=!!s.active&&shoot;input.tapFire=shoot&&!s.active&&s.cooldown<=0;
  input.reload=!s.active&&!s.summon&&!s.reload&&(s.ammo<=0||!visible&&s.ammo<6);
  input.sidekickMine=visible&&d<9&&s.mineCharges>0&&s.mineCooldown<=0&&this.sim.sidekickMines.every(m=>Math.hypot(m.x-this.sim.player.x,m.z-this.sim.player.z)>3);
  if(shoot&&d<16&&this.xAllowed()){input.sidekickX=true;this.usedX();}
 }
 sightline(input,target,d,shoot,visible){
  sniperInput(this,input,target,d,shoot,visible);
 }
 omen(input,target,d,shoot,visible){
  const s=this.sim.omen;
  input.fire=shoot;input.aiming=visible&&d>7;
  input.reload=!s.reload&&(s.ammo<=0||!visible&&s.ammo<OMEN.magazine);
  const curse=s.marks.find(m=>m.kind==='e');
  input.omenPrime=curse?curse.left<.35+(1-this.pf.tech)*.5:shoot&&!s.primed&&s.primeCooldown<=0;
  if(s.volleyLeft>0)input.omenVolley=s.volleyLeft<.45&&s.marks.some(m=>m.kind==='x');
  else if(shoot&&this.xAllowed()){input.omenVolley=true;this.usedX();}
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
   const worth = this.fight?.kind === 'push' || this.fight?.kind === 'fall' || (target.hp ?? RULES.playerHealth) / (target.maxHp || RULES.playerHealth) > .45;
   if (this.xAllowed() && this.random() < (worth ? .01 + this.pf.tech * .05 : .02 * (1 - this.pf.tech)) * this.pf.xRate) { input.surge = true; this.usedX(); }
  }
  // Surging: a grenade now does +20 more (a skilled robot knows it).
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
  const press = shoot && d < SHOTGUN.range * .8 && !this.pressed;   // v141: .8 of the red, when its edge kept a fifth; kept after the 2026-09-30 balance pass (SHOTGUN.edge .65)
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
  // (Review 2026-09-30: out to 10 m, its band's far edge, once it has been
  // saving for it (hexWant, below): it fights from 5.5-10 m now.)
  const hexNow = sim.hexCooldown <= 0 && sim.ammo >= RULES.hexCost && t - this.hexAt > 3 && visible && d > 2 && d < (this.hexWant != null ? 10 : 7);
  if (hexNow) {
   const closing = target && ((target.x - sim.player.x) * target.vx + (target.z - sim.player.z) * target.vz) < 0;
   const good = closing || this.fight?.kind === 'push' || Math.hypot(target.vx, target.vz) < 1.5;
   if (this.xAllowed() && this.random() < (good ? .02 + this.pf.tech * .05 : .04 * (1 - this.pf.tech)) * this.pf.xRate) { input.hex = true; this.hexAt = t; this.usedX(); return; }
  }
  // Robot behaviour pass 2026-09-30 (owner-requested): the Static robot
  // streamed nearly every fight (its band reached into the stream's 6.5 m) and
  // hardly ever let a volley go. Now it fights at mid range, placing orbs and
  // launching volleys; a volley in hand goes first when someone closes in, and
  // the stream is for someone on top of it (or rushing it with its orbs spent).
  const closing = target && ((target.x - sim.player.x) * target.vx + (target.z - sim.player.z) * target.vz) < -d * 2;
  // Orbs: a skilled robot builds a bigger volley before letting go (more orbs
  // hit much harder: five for 38, six for 50), an easy one fires off small ones.
  const volley = Math.round(4 + this.pf.tech * 2 + (d > 10 ? 1 : 0));
  const hurry = d < 5.5 || closing || (target && t - this.hurtAt < 1) || this.eng.state === 'press' || target?.reloading;
  // (Three orbs hit for barely a third of four: a skilled robot never lets go of fewer than four.)
  // (Past 12.5 m a volley is easy to step out of: a skilled robot lets one go
  // from there only at someone standing still or reloading.)
  const inReach = d < 12.5 || (d < STYLE.static.reach && (this.pf.tech < .5 || target?.reloading || Math.hypot(target?.vx || 0, target?.vz || 0) < 1.5));
  if (shoot && inReach && (seeds >= volley || (hurry && seeds >= (this.pf.tech > .5 ? 4 : 3)))) {
   input.launch = true; input.launchPointX = this.aimPoint.x; input.launchPointZ = this.aimPoint.z; return;
  }
  // The stream: someone on top of it, or rushing in with its orbs spent.
  // Against a blade or Ballast (whose whole game is getting close) it fights
  // as it always did: its bar kept for the stream and the hex (below).
  const short = !!target && (THREAT[target.weapon] ?? 9) <= RULES.sprayRange;
  if (visible && lined && !this.holding && !(t < (this.dashWait ?? -1)) && (d < 4.5 || (short && d < RULES.sprayRange - 1.5) || (closing && d < RULES.sprayRange - 1.5 && seeds < 3)) && sim.ammo >= 2 && this.aimOff < .35) { input.spray = true; return; }
  // A quick shot (Static's press with no orbs placed: one orb at once) to
  // finish someone nearly dead, by a robot that knows the game.
  if (shoot && !seeds && sim.ammo > 0 && sim.seedCooldown <= 0 && this.pf.tech >= .4 && target?.hp != null && target.hp <= 4 && d < 14) {
   input.launch = true; input.quickShot = true; input.launchPointX = this.aimPoint.x; input.launchPointZ = this.aimPoint.z; return;
  }
  // (Keeping the hex's orbs in hand only when someone is near enough to hex:
  // robot behaviour pass 2026-09-30. It used to hold 10 of its 12 whenever the
  // hex was ready, so a skilled Static robot placed two orbs and no more,
  // never had a volley, and only streamed.)
  // (Review 2026-09-30: and once the hex has been ready a while (half its X
  // wait) with them in its band, any robot but an easy one keeps the orbs
  // back for it: volleys all the time left it never
  // holding ten, so it hardly ever hexed, 4 times in 42 hard duels, none at
  // normal.)
  // (Not xAllowed: that needs the ten orbs already in hand.)
  // (Not a hard robot: against robots that wait clear of the zaps, a hex cost
  // it its volleys, Static 15% -> 9% of hard duels. It keeps its own rule.)
  if (sim.hexCooldown > 0 || this.pf.tech < .3 || this.pf.tech > .75) this.hexWant = null; else if (visible && d < 10) this.hexWant ??= t;
  const hexSoon = this.hexWant != null && t - this.hexWant >= (this.xWait ??= this.newXWait()) * .5;
  const saveForHex = sim.ammo <= RULES.hexCost && ((this.pf.tech > .5 && sim.hexCooldown < 4 && (short || (visible && d < 8))) || hexSoon);
  const wantSeeds = visible ? Math.max(4, volley) : 7;
  if (seeds < wantSeeds && sim.ammo > 0 && sim.seedCooldown <= 0 && !saveForHex) input.seed = true;
 }
}
