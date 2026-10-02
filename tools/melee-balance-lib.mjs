// A blade against a gun robot (owner, 2026-10-01: "The bots, like when I'm
// using a melee weapon and they're using a ranged weapon, it's like a lot more
// difficult. I don't know how you're gonna fix that, but figure out a way to
// make it a little bit more balanced there."). Headless, seeded, the game's own
// machinery (Simulation + BotMatch + RobotBrain, BOTS 1V1's duel circle), like
// tools/bot-stance-lib.mjs. Used by tools/melee-balance.mjs (the report) and
// tests/robot-melee-balance.test.js.
//
// duelRun: BOTS 1V1 rounds, a scripted stand-in "player" (you) against one
// robot with BOTS defaults (normal, blend, shifting, hunch .6). Each round a
// new duel circle (duel-circle.js pickDuelCircle), you on its first spot and
// the robot on the second, both at full health; first death ends the round,
// nobody down by `cap` s is a draw. Stand-ins:
//   ichor / sheath  a competent blade player: knows where the robot is (a
//                   1V1 circle is small), walks in along a route, weaves
//                   across the robot's line while it is shot at, raises
//                   Ichor's guard against bullets from out of reach, closes
//                   the last metres with its dashes (two chained), swings in
//                   reach, and uses its kit: Ichor's blood wave (E) from 4-16
//                   m and Frenzy (X) in contact; Sheath's Gold Rush (E) from
//                   6-15 m and its draw-cut (X) down a clear line.
//   rifle           the ranged baseline: a Nominal player who walks in to
//                   about 11 m, weaves, fires bursts with a person's aim error.
// What is measured per round: who won, how long, the first time the blade got
// within its reach (`close`), its first landed hit (`firstHit`), the damage it
// took before that (`closing`), the robot's first hit, damage both ways, the
// robot's engagement states and how much of the time it backed off (pushed
// its stick away from them, or dodged away, within 9 m).
// crowdRun: the BOTS FFA (five gun robots, storm, respawns) with the stand-in
// in it; kills and deaths a minute (scratch comparisons, not in the report).
import { Simulation } from '../src/simulation.js';
import { maps } from '../src/maps.js';
import { BotMatch } from '../src/bots/bot-match.js';
import { RULES, ICHOR, SHEATH } from '../src/config/gameplay.js';
import { pickDuelCircle } from '../src/duel-circle.js';
import { segmentBox } from '../src/simulation.js';
import { sheathDrawCutLength } from '../src/weapons/sheath.js';
import { seeded, mix } from './bot-stance-lib.mjs';
import { offScreen } from '../src/bots/robot-brain.js';

export const MAPS = ['deadwater', 'hollow-wick', 'lumen'];
// The guns a BOTS robot can carry (Sightline is under maintenance).
export const GUNS = ['rifle', 'shotgun', 'static', 'sidekick', 'omen'];
export const STANDINS = ['ichor', 'sheath', 'rifle'];
const GUN_SET = new Set(['rifle', 'sidekick', 'sightline', 'omen']);
const reachOf = w => (w === 'ichor' ? ICHOR.range : SHEATH.range) + .3;

// The scripted player on `you` (its Simulation). Returns its input for a tick,
// given the robot (`foe`: its body, aim, weapon, whether it just fired) and
// the damage it just took (`hurt`). `sharp`: a stand-in with no human limits
// (always knows where the robot is, reacts on the tick, never misjudges a
// dash, always guards); otherwise it plays like a person (`HUMAN`): it knows
// where the robot is only while it is on its screen and in sight (or heard,
// roughly), else walks to where it last saw it (at first, where it came in);
// it takes a moment to react to a sighting and to being shot, misjudges a
// dash's distance now and then, does not always chain the second dash, and
// raises the guard most times it is shot at, not every time.
export const HUMAN = Object.freeze({ react: [.22, .4], dashError: .9, chain: .7, guard: .75, jink: .7, hear: 33, lag: 0, keys: false, dash: 1, flinch: 0, retreat: 0, plant: 0 });
// The stand-in's levels (`level`): sharp (no human limits), human (HUMAN: a
// competent player), casual (a player still learning the blade: slower, eight
// keys to walk and dash, guards a third of the time, misjudges dashes by up to
// 1.5 m, often skips the second, stops a moment when shot or swinging, backs
// off when low).
export const LEVELS = Object.freeze({ sharp: null, human: {}, casual: { react: [.35, .6], dashError: 1.5, chain: .4, guard: .35, jink: .4, keys: true, flinch: .4, retreat: .4, plant: .6 } });
function standin(kind, you, nav, rnd, { sharp = false, start = null, map = null, human = null } = {}) {
 const H = { ...HUMAN, ...human }, span = ([a, b]) => a + rnd() * (b - a);
 const s = { t: 0, side: 1, sideUntil: 0, path: null, pathAt: -9, goal: null, errX: 0, errZ: 0, errAt: -9, burst: 0, guardUntil: 0, hurtAt: -9, dashedAt: -9, chainAt: -9,
  know: start ? { x: start.x, z: start.z, vx: 0, vz: 0, at: -99, seen: false } : null, seenSince: -9, react: span(H.react), shotSince: -9, guardRoll: null, jinkRoll: true, dashSlop: 0, chainRoll: true };
 const walk = to => {
  const p = you.player;
  if (nav.walkable(p.x, p.z, to.x, to.z)) { s.path = null; const dx = to.x - p.x, dz = to.z - p.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }
  if (!s.path || !s.goal || Math.hypot(s.goal.x - to.x, s.goal.z - to.z) > 2 || s.t - s.pathAt > 1.5) { s.goal = { x: to.x, z: to.z }; s.pathAt = s.t; s.path = nav.path(p.x, p.z, to.x, to.z, 20000) || []; }
  while (s.path.length && Math.hypot(s.path[0].x - p.x, s.path[0].z - p.z) < .5) s.path.shift();
  while (s.path.length > 1 && nav.walkable(p.x, p.z, s.path[1].x, s.path[1].z)) s.path.shift();
  const w = s.path[0]; if (!w) return [0, 0];
  const dx = w.x - p.x, dz = w.z - p.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l];
 };
 const open = (mx, mz, far = 1.1) => { const p = you.player, l = Math.hypot(mx, mz) || 1; return nav.walkable(p.x, p.z, p.x + mx / l * far, p.z + mz / l * far); };
 return (dt, foe, hurt) => {
  s.t += dt;
  const p = you.player, input = { moveX: 0, moveZ: 0, aimX: p.aimX, aimZ: p.aimZ };
  if (!foe) return input;
  if (hurt > 0) { if (s.t - s.hurtAt > 1.2) { s.shotSince = s.t; if (!sharp && rnd() < H.flinch) s.flinchUntil = s.t + .3 + rnd() * .35; s.guardRoll = sharp || rnd() < H.guard; s.jinkRoll = sharp || rnd() < H.jink; } s.hurtAt = s.t; }
  // What it knows: on its screen and in sight (a person), or always (sharp).
  const seesNow = !foe.none && you.canSeeTarget(foe.x, foe.z, .3) && (sharp || !offScreen(foe.x, foe.z, p.x, p.z));
  if (seesNow || (sharp && !foe.none)) { if (!s.know?.seen) s.seenSince = s.t; s.know = { x: foe.x, z: foe.z, vx: foe.vx, vz: foe.vz, at: s.t, seen: true }; }
  else {
   if (s.know) s.know.seen = false;
   // (Heard: gunfire gives it roughly where.)
   if (foe.loud && Math.hypot(foe.x - p.x, foe.z - p.z) < H.hear && (!s.know || s.t - s.know.at > .5)) s.know = { x: foe.x + (rnd() - .5) * 4, z: foe.z + (rnd() - .5) * 4, vx: 0, vz: 0, at: s.t, seen: false };
  }
  // (Nobody known, or it got to where it last knew of them and they are not
  // there: on to somewhere else, as a person looks round; FFA.)
  if (map && !seesNow && !sharp && (!s.know || Math.hypot(s.know.x - p.x, s.know.z - p.z) < 2.5)) s.know = { ...wanderSpot(you, nav, rnd, map), vx: 0, vz: 0, at: -99, seen: false };
  const k = s.know; if (!k) return input;
  // (A person takes a moment to react to a sighting; sharp: none.)
  const sees = seesNow || (sharp && !foe.none), ready = sharp || (sees && s.t - s.seenSince > s.react);
  const tx = sees ? foe.x : k.x, tz = sees ? foe.z : k.z;
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
  // (A hand on a mouse follows a body `lag` s behind where it is.)
  if (H.lag > 0 && !sharp && sees) { (s.trail ||= []).push({ t: s.t, x: foe.x, z: foe.z }); while (s.trail.length > 1 && s.trail[1].t <= s.t - H.lag) s.trail.shift(); }
  if (sees) {
   const seenAt = H.lag > 0 && !sharp && s.trail?.length ? s.trail[0] : foe;
   if (s.t - s.errAt > .5) { s.errAt = s.t; const e = kind === 'rifle' ? 1.6 : .5; s.errX = (rnd() - .5) * e; s.errZ = (rnd() - .5) * e; }
   const m = kind === 'rifle' ? 1 : Math.min(1, d / 6), ax = seenAt.x + foe.vx * .08 + s.errX * m, az = seenAt.z + foe.vz * .08 + s.errZ * m, al = Math.hypot(ax - p.x, az - p.z) || 1;
   input.aimX = (ax - p.x) / al; input.aimZ = (az - p.z) / al; input.aimPointX = ax; input.aimPointZ = az;
  } else if (d > .5) { input.aimX = ux; input.aimZ = uz; }
  if (s.t > s.sideUntil) { s.side = rnd() < .5 ? -1 : 1; s.sideUntil = s.t + .45 + rnd() * .7; }
  const shot = s.t - s.hurtAt < 1.2, reacted = sharp || s.t - s.shotSince > s.react;
  const ba = Math.atan2(-dz, -dx) - Math.atan2(foe.aimZ ?? 0, foe.aimX ?? 1), aimedAt = sees && Math.abs(Math.atan2(Math.sin(ba), Math.cos(ba))) < .35;
  let mx, mz;
  if (kind === 'rifle') {
   // In to about 11 m, weaving; back off a step inside 7.
   const r = d > 12 ? 1 : d < 7 ? -.7 : 0;
   if (!sees || d > 18) [mx, mz] = walk({ x: tx, z: tz });
   else { mx = ux * r - uz * s.side * .9; mz = uz * r + ux * s.side * .9; if (!open(mx, mz)) { s.side = -s.side; mx = ux * r - uz * s.side * .9; mz = uz * r + ux * s.side * .9; } }
   const out = stormOut(you, walk); if (out) [mx, mz] = out;
   s.burst = (s.burst + dt) % 1.3;
   input.fire = ready && d < 20 && s.burst < .8 && you.rifle.ammo > 0;
   input.aiming = sees && d > 8;
   input.reload = you.rifle.ammo <= 0;
   const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
   input.moveX = mx; input.moveZ = mz;
   return input;
  }
  const reach = reachOf(kind);
  // Walking in: along a route, weaving across their line while they shoot at
  // it (a jink every half-second or so); straight in once close.
  [mx, mz] = sees && open(ux, uz, .8) ? [ux, uz] : walk({ x: tx, z: tz });
  if (sees && d > reach + 1 && d < 18 && ((shot && reacted && s.jinkRoll) || (sharp && aimedAt))) {
   const j = d > 6 ? .75 : .45, jx = mx - mz * s.side * j, jz = mz + mx * s.side * j;
   if (open(jx, jz)) { mx = jx; mz = jz; } else s.side = -s.side;
  }
  if (sees && d < reach - .6) { mx *= .2; mz *= .2; }
  // (A person shot out of nowhere stops a moment; one low on health, out of
  // reach, backs off a while to collect itself: nobody heals, so it only
  // gives them time.)
  if (!sharp && s.t < (s.flinchUntil ?? -1)) { mx *= .15; mz *= .15; }
  if (!sharp && H.retreat > 0 && p.hp < H.retreat * p.maxHp && !s.retreated && d > reach + 1.5) { s.retreated = true; s.backUntil = s.t + 1.5 + rnd() * 1.5; }
  if (!sharp && s.t < (s.backUntil ?? -1)) { const bx = -ux - uz * s.side * .5, bz = -uz + ux * s.side * .5; if (open(bx, bz)) { mx = bx; mz = bz; } else { mx = -uz * s.side; mz = ux * s.side; } }
  const out = stormOut(you, walk); if (out) [mx, mz] = out;
  const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  input.moveX = mx; input.moveZ = mz;
  // Dashes: the last metres in one or two (chained), once it has them in
  // sight. (A person misjudges the distance by up to `dashError` m.)
  const stam = Math.floor(p.stamina + 1e-6), dashFar = reach + RULES.dodgeDistance * stam - .3 + s.dashSlop;
  const sheathBusy = (kind === 'sheath' && you.sheath.x) || s.t < (s.backUntil ?? -1);
  if (ready && !sheathBusy && !p.dodgeRemaining && stam >= 1 && s.t - s.dashedAt > .3 && (sharp || H.dash >= 1 || rnd() < H.dash * dt * 6)) {
   const chain = s.t - s.chainAt < .5 && d > reach + .4 && s.chainRoll;
   if (chain || (d > reach + .5 && d < dashFar && (stam >= 2 || d < reach + RULES.dodgeDistance))) {
    const kk = s.side * .15; let ddx = ux - uz * kk, ddz = uz + ux * kk; const ll = Math.hypot(ddx, ddz); ddx /= ll; ddz /= ll;
    if (open(ddx, ddz, RULES.dodgeDistance)) {
     input.dodge = true; input.moveX = ddx; input.moveZ = ddz; s.dashedAt = s.t; s.chainAt = chain ? -9 : s.t;
     if (!chain) { s.chainRoll = sharp || rnd() < H.chain; s.dashSlop = sharp ? 0 : (rnd() * 2 - 1) * H.dashError; }
    }
   }
  }
  if (kind === 'ichor') {
   const c = you.ichor;
   // Guard: up against bullets from out of reach (released to cut, or to dash).
   const want = sees && GUN_SET.has(foe.weapon) && d > 3.2 && c.guardCooldown <= 0 && c.frenzy <= 0 && ((shot && reacted && s.guardRoll) || (sharp && aimedAt && foe.loud)) && !input.dodge;
   if (want) s.guardUntil = s.t + .5;
   input.ichorGuard = s.t < s.guardUntil && d > 3 && !input.dodge;
   if (!input.ichorGuard) {
    input.tapFire = sees && d < reach + .2 && c.cooldown <= 0;
    input.ichorX = ready && d < 3 && c.xCooldown <= 0 && p.hp > 25;
    input.ichorE = ready && d > 4 && d < 16 && c.eCooldown <= 0 && c.blood >= ICHOR.eBlood && p.hp > ICHOR.waveDamage * 2 && !input.dodge;
   }
  } else {
   const c = you.sheath;
   input.tapFire = sees && d < reach * (c.rush > 0 ? SHEATH.rushReach : 1) && c.cooldown <= 0 && !p.dodgeRemaining;
   input.sheathE = ready && !c.rush && c.eCooldown <= 0 && d > 6 && d < 15;
   if (ready && !c.x && c.xCooldown <= 0 && !p.dodgeRemaining && !input.dodge && d > 1.8 && d < SHEATH.xRange - SHEATH.xBackDist - .4) {
    const line = sheathDrawCutLength(you, p.x - input.aimX * SHEATH.xBackDist, p.z - input.aimZ * SHEATH.xBackDist, input.aimX, input.aimZ, segmentBox) - SHEATH.xBackDist;
    if (line >= d) input.sheathX = true;
   }
  }
  // (Swinging, a person tends to stop walking for a moment: `plant` of its walk kept.)
  if (!sharp && H.plant > 0 && kind !== 'rifle') { if (input.tapFire || input.sheathX) s.plantUntil = s.t + .3; if (s.t < (s.plantUntil ?? -1) && !input.dodge) { input.moveX *= 1 - H.plant; input.moveZ *= 1 - H.plant; } }
  // (Keys: eight ways to walk and dash, not a stick's any way.)
  if (H.keys && !sharp) { const q = (x, z) => { if (Math.hypot(x, z) < .3) return [0, 0]; const a = Math.round(Math.atan2(z, x) / (Math.PI / 4)) * Math.PI / 4; return [Math.cos(a), Math.sin(a)]; }; [input.moveX, input.moveZ] = q(input.moveX, input.moveZ); }
  return input;
 };
}

// Somewhere to look (FFA): an open spot 12-30 m off, inside the storm.
function wanderSpot(you, nav, rnd, map) {
 const p = you.player, c = you.storm;
 for (let k = 0; k < 40; k++) {
  const a = rnd() * Math.PI * 2, d = 12 + rnd() * 18, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
  if (c && Math.hypot(x - c.x, z - c.z) > c.r - 6) continue;
  if (Math.abs(x) > map.width / 2 - 4 || Math.abs(z) > map.depth / 2 - 4) continue;
  if (nav.isOpen(x, z) && nav.clearance[nav.cellOf(x, z)] >= 2) return { x, z };
 }
 return c ? { x: c.x, z: c.z } : { x: 0, z: 0 };
}
// Out of the storm first, as anyone would.
function stormOut(you, walk) { const c = you.storm, p = you.player; if (!c || Math.hypot(p.x - c.x, p.z - c.z) < c.r - 2.5) return null; return walk({ x: c.x, z: c.z }); }

// BOTS 1V1 rounds: a stand-in (`standin`: ichor, sheath, rifle) against one
// robot with `weapon`. Returns per-round numbers and pooled robot states.
export function duelRun({ map: mapId = 'deadwater', weapon = 'rifle', standin: kind = 'ichor', level = 'human', sharp = level === 'sharp', human = LEVELS[level] || null, skill = 'normal', style = 'blend', temper = 'shifting', seed = 1, rounds = 4, cap = 60, each = null } = {}) {
 const map = maps[mapId], dt = RULES.step, base = mix(seed, mapId.length * 31 + mapId.charCodeAt(0), GUNS.indexOf(weapon) + 3, STANDINS.indexOf(kind) + 7);
 const real = Math.random; Math.random = seeded(mix(base, 5));
 try {
  const you = new Simulation(map); you.weapon = kind; you.noTargets = true; you.reset(); you.targets = []; you.player.id = 'you';
  const rnd = seeded(mix(base, 9)), crnd = seeded(mix(base, 13));
  const bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(mix(base, 11)) });
  bots.holdRespawns = true;
  const bot = bots.spawn(you, weapon, { team: 'red', skill, style, temper });
  bot.brain.hunch = .6;
  const out = [], states = {}; let circle = null, backing = 0, near = 0;
  for (let r = 0; r < rounds; r++) {
   circle = pickDuelCircle(map, you.colliders, { random: crnd, avoid: circle });
   const [mine, theirs] = circle.spawns;
   you.respawn(mine); you.player.id = 'you'; you.boundary = circle;
   { const dx = theirs.x - mine.x, dz = theirs.z - mine.z, d = Math.hypot(dx, dz) || 1; you.player.aimX = dx / d; you.player.aimZ = dz / d; }
   if (bot.sim.weapon !== weapon) bot.sim.weapon = weapon;
   bots.putAt(bot, you, theirs); bot.sim.boundary = circle;
   const play = standin(kind, you, bots.nav, rnd, { sharp, start: theirs, human });
   const t0 = { dealt: bot.stats.taken, taken: bot.stats.dealt };
   const rec = { map: mapId, weapon, standin: kind, round: r, winner: 'draw', time: cap, close: null, firstHit: null, botFirstHit: null, closing: 0, dealt: 0, taken: 0, near: 0, backing: 0, dodges: 0 };
   let lastHp = you.player.hp, lastBot = bot.sim.player.hp, dodging = false;
   const ticks = Math.round(cap / dt);
   for (let i = 0; i < ticks; i++) {
    const t = i * dt, b = bot.sim.player;
    const foe = bot.alive && b.hp > 0 ? { x: b.x, z: b.z, vx: b.vx, vz: b.vz, aimX: b.aimX, aimZ: b.aimZ, weapon: bot.sim.weapon, loud: bots.loud.has(bot.id) } : null;
    const input = play(dt, foe, lastHp - you.player.hp > .01 ? lastHp - you.player.hp : 0);
    lastHp = you.player.hp;
    bots.before(you); you.step(input, dt); bots.after(you); bots.step(you, dt); bots.drain();
    each?.(t, bot, you, rec);
    const p = you.player, q = bot.sim.player, d = Math.hypot(q.x - p.x, q.z - p.z);
    const st = bot.brain.eng?.state; if (st) states[st] = (states[st] || 0) + 1;
    // (Backing off: what its hands push for, away from them (more than half a
    // stick), or a dodge away; not where blade hits knock it.)
    if (d < 9 && bot.alive) { rec.near++; const m = bot.brain.smoothMove, away = m ? ((q.x - p.x) * m.x + (q.z - p.z) * m.z) / (d || 1) : 0; if (away > .5 || (q.dodgeRemaining > 0 && ((q.x - p.x) * q.vx + (q.z - p.z) * q.vz) / (d || 1) > 4)) rec.backing++; }
    if (q.dodgeRemaining > 0 && !dodging) rec.dodges++; dodging = q.dodgeRemaining > 0;
    if (rec.close == null && kind !== 'rifle' && d <= reachOf(kind)) rec.close = t;
    if (q.hp < lastBot - .01 && rec.firstHit == null) rec.firstHit = t;
    lastBot = q.hp;
    if (p.hp < 100 - .01 && rec.botFirstHit == null) rec.botFirstHit = t;
    if (rec.firstHit == null) rec.closing = 100 - Math.max(0, p.hp);
    const youDown = p.hp <= 0 || p.dead, botDown = !bot.alive || q.hp <= 0;
    if (youDown || botDown) { rec.winner = youDown && botDown ? 'draw' : youDown ? 'bot' : 'you'; rec.time = t; break; }
   }
   rec.dealt = bot.stats.taken - t0.dealt; rec.taken = bot.stats.dealt - t0.taken;
   near += rec.near; backing += rec.backing;
   out.push(rec);
  }
  return { rounds: out, states, backing, near };
 } finally { Math.random = real; }
}

// Pools rounds into one summary (rates in %, times in s).
export function summarise(rounds) {
 const n = rounds.length || 1, mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
 const win = rounds.filter(r => r.winner === 'you').length, loss = rounds.filter(r => r.winner === 'bot').length;
 return {
  n: rounds.length, win: 100 * win / n, loss: 100 * loss / n, draw: 100 * (rounds.length - win - loss) / n,
  close: mean(rounds.filter(r => r.close != null).map(r => r.close)), closed: 100 * rounds.filter(r => r.close != null).length / n,
  firstHit: mean(rounds.filter(r => r.firstHit != null).map(r => r.firstHit)), hitAny: 100 * rounds.filter(r => r.firstHit != null).length / n,
  botFirstHit: mean(rounds.filter(r => r.botFirstHit != null).map(r => r.botFirstHit)),
  closing: mean(rounds.map(r => r.closing)), dealt: mean(rounds.map(r => r.dealt)), taken: mean(rounds.map(r => r.taken)),
  back: 100 * rounds.reduce((n, r) => n + r.backing, 0) / (rounds.reduce((n, r) => n + r.near, 0) || 1), dodges: mean(rounds.map(r => r.dodges)),
  time: mean(rounds.map(r => r.time)), ttkWin: mean(rounds.filter(r => r.winner === 'you').map(r => r.time)), ttkLoss: mean(rounds.filter(r => r.winner === 'bot').map(r => r.time)),
 };
}

// The BOTS FFA (five robots, storm, respawns) with the stand-in in it: how a
// blade fares in a crowd of guns against how a Nominal player fares. The
// robots carry `guns` in turn (null: the FFA's own random weapons). The
// stand-in goes for the nearest robot it can see (keeping to one while it
// can), else the last it knew of, else looks round; it never stays dead (a
// death tops it back up where it stands, counted).
export async function crowdRun({ map: mapId = 'deadwater', standin: kind = 'ichor', guns = GUNS, skill = 'normal', temper = 'shifting', seed = 1, length = 180, each = null } = {}) {
 const { createDuel } = await import('../src/duel.js');
 const map = maps[mapId], dt = RULES.step, base = mix(seed, 91, mapId.length, STANDINS.indexOf(kind) + 1);
 const el = () => ({ hidden: false, className: '', innerHTML: '', textContent: '', classList: { add() {}, remove() {}, contains: () => true, toggle() {} }, setAttribute() {}, append() {}, querySelector: () => el(), focus() {} });
 const real = Math.random, doc = globalThis.document; Math.random = seeded(mix(base, 5)); globalThis.document = { createElement: el };
 try {
  const you = new Simulation(map); you.weapon = kind; you.player.id = 'you';
  const bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(mix(base, 11)) });
  const duel = createDuel(el(), { sim: you, bots, random: seeded(mix(base, 13)) });
  you.reset(); duel.begin({ mode: 'ffa', length: Math.max(length, 300), skill, temper });
  if (guns) bots.bots.forEach((b, i) => { b.sim.weapon = guns[i % guns.length]; bots.putAt(b, you, { x: b.sim.player.x, z: b.sim.player.z }); });
  const at = bots.youSpot(you); if (at) { you.player.x = at.x; you.player.z = at.z; }
  const rnd = seeded(mix(base, 9)), play = standin(kind, you, bots.nav, rnd, { map });
  let deaths = 0; const hurtFn = you.damagePlayer.bind(you);
  you.damagePlayer = (...args) => { const got = hurtFn(...args); if (you.player.hp < 1 || you.player.dead) { deaths++; you.player.hp = you.player.maxHp; you.player.dead = false; } return got; };
  let foeBot = null, lastHp = you.player.hp, t = 0; const ticks = Math.round(length / dt);
  for (let i = 0; i < ticks && !duel.over; i++, t += dt) {
   const p = you.player;
   // Whom it goes for: the one it is on while it still sees it, else the nearest it sees.
   const seen = b => b.alive && b.sim.player.hp > 0 && you.canSeeTarget(b.sim.player.x, b.sim.player.z, .3) && !offScreen(b.sim.player.x, b.sim.player.z, p.x, p.z);
   if (!(foeBot && seen(foeBot))) { let best = null, bd = Infinity; for (const b of bots.bots) if (seen(b)) { const q = b.sim.player, d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = b; } } if (best) foeBot = best; else if (foeBot && !foeBot.alive) foeBot = null; }
   const b = foeBot?.sim.player;
   const foe = b ? { x: b.x, z: b.z, vx: b.vx, vz: b.vz, aimX: b.aimX, aimZ: b.aimZ, weapon: foeBot.sim.weapon, loud: bots.loud.has(foeBot.id) } : { x: p.x, z: p.z, vx: 0, vz: 0, aimX: 1, aimZ: 0, weapon: 'rifle', loud: false, none: true };
   const input = play(dt, foe, Math.max(0, lastHp - p.hp));
   bots.before(you); you.step(input, dt); bots.after(you); bots.step(you, dt); bots.drain();
   duel.frame(dt, true);
   lastHp = you.player.hp;
   each?.(t, bots, you);
  }
  const y = bots.youStats, mins = t / 60;
  return { map: mapId, standin: kind, seed, ran: t, kills: y.kills, deaths, dealt: y.dealt, taken: y.taken, killsPerMin: y.kills / mins, deathsPerMin: deaths / mins,
   botKills: bots.bots.reduce((n, b) => n + b.stats.kills, 0), botDeaths: bots.bots.reduce((n, b) => n + b.stats.deaths, 0) };
 } finally { Math.random = real; globalThis.document = doc; }
}
