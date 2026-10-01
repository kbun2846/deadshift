// How a robot carries itself in a fight (owner, 2026-10-01: "Tune the base bot
// from normal difficulty to be less aggressive, so it's not always chasing and
// initiating and should be in cover sometimes or in the open"). Headless,
// seeded, the game's own machinery (Simulation + BotMatch + RobotBrain, and
// for FFA the BOTS page's own match code, duel.js createDuel). Used by
// tools/bot-stance.mjs (the report) and tests/robot-stance.test.js.
//
// Two scenarios:
//  - standinRun: one robot (BOTS defaults: normal, blend, shifting) against a
//    scripted stand-in "player" with Nominal on Deadwater, Hollow Wick or
//    Lumen. The stand-in never stays dead (a death tops it back up where it
//    stands) and the robot comes back 16-34 m off after its own, so the fight
//    keeps going. Stand-ins:
//      hold    keeps to the spot it started on, weaving a step either way
//      patrol  walks a round of open spots, fights whoever it meets, walks on
//      hunter  always knows where the robot is and walks at it (a pushy
//              player: the robot must answer, not hide)
//  - ffaRun: the BOTS FFA (five robots and the stand-in, a patrol, for the
//    match's length): the storm, the respawn cutoff, how soon fights start.
//
// What is measured, per tick, from the robot's side, while it knows where its
// target is (seen in the last CONTACT s; otherwise it is roaming):
//    closing   its velocity toward them > MOVING m/s (chasing, hunting, pushing)
//    backing   its velocity away from them > MOVING m/s
//    cover     neither, and they have no line to it (behind something), or the
//              brain is in its cover mode
//    open      neither, and they have a line to it: holding or strafing in the open
// Encounters: a fight starts at the first damage either way after QUIET s of
// none; whoever dealt it initiated it. Plus the brain's engagement states and
// modes (% of ticks), presses, mean distance while it sees them, deaths.
import { Simulation } from '../src/simulation.js';
import { maps } from '../src/maps.js';
import { BotMatch } from '../src/bots/bot-match.js';
import { shotClear } from '../src/bots/robot-brain.js';
import { RULES } from '../src/config/gameplay.js';
import { openSpot } from '../src/net/spawn-points.js';

export const MAPS = ['deadwater', 'hollow-wick', 'lumen'];
export const STANDINS = ['hold', 'patrol', 'hunter'];
// The weapons a BOTS robot can be given (Sightline is under maintenance).
export const BOT_WEAPONS = ['static', 'rifle', 'shotgun', 'omen', 'sidekick', 'ichor', 'sheath'];
export const CLASSES = ['closing', 'backing', 'cover', 'open'];
const CONTACT = 6, MOVING = 2, QUIET = 4;

export function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const mix = (...n) => n.reduce((h, v) => Math.imul(h ^ (v >>> 0), 2654435761) >>> 0, 0x9E3779B9);

// The watcher of one robot: `see(dt, bot, them, sim)` each tick it is alive.
export function watcher() {
 const w = { ticks: 0, contact: 0, cls: { closing: 0, backing: 0, cover: 0, open: 0 }, by: {}, states: {}, modes: {}, distSum: 0, distN: 0, dt: 0 };
 w.see = (dt, bot, them, sim) => {
  w.ticks++; w.dt = dt;
  const brain = bot.brain, me = bot.sim.player;
  const st = brain.eng?.state; if (st) w.states[st] = (w.states[st] || 0) + 1;
  w.modes[brain.mode] = (w.modes[brain.mode] || 0) + 1;
  if (!them) return;
  const m = brain.memory.get(them.id);
  if (!m || brain.time - m.seen > CONTACT) return;
  w.contact++;
  const dx = them.x - me.x, dz = them.z - me.z, d = Math.hypot(dx, dz) || 1, toward = (me.vx * dx + me.vz * dz) / d;
  if (m.visible) { w.distSum += d; w.distN++; }
  let c;
  if (toward > MOVING) c = 'closing';
  else if (toward < -MOVING) c = 'backing';
  else c = brain.mode === 'cover' || !shotClear(sim.colliders, them.x, them.z, me.x, me.z, .04, sim.ground) ? 'cover' : 'open';
  w.cls[c]++;
  const k = c + ' ' + (st || '-') + '/' + brain.mode; w.by[k] = (w.by[k] || 0) + 1;
 };
 return w;
}

// A scripted stand-in player on `you` (its Simulation). `kind`: hold, patrol,
// hunter. Returns its input for a tick, given the robot it faces (or null).
function standin(kind, you, nav, rnd, map) {
 const s = { kind, anchor: { x: you.player.x, z: you.player.z }, side: 1, sideUntil: 0, path: null, goal: null, goalAt: -99, errX: 0, errZ: 0, burst: 0, seenAt: -99, t: 0, tick: 0, lastX: 0, lastZ: 0 };
 const pickGoal = () => {
  for (let k = 0; k < 40; k++) {
   const a = rnd() * Math.PI * 2, d = 15 + rnd() * 25, x = you.player.x + Math.cos(a) * d, z = you.player.z + Math.sin(a) * d;
   const c = you.storm; if (c && Math.hypot(x - c.x, z - c.z) > c.r - 6) continue;
   if (Math.abs(x) > map.width / 2 - 4 || Math.abs(z) > map.depth / 2 - 4) continue;
   if (nav.isOpen(x, z) && nav.clearance[nav.cellOf(x, z)] >= 2) return { x, z };
  }
  const c = you.storm; return c ? { x: c.x, z: c.z } : { x: 0, z: 0 };
 };
 const walk = to => {
  const p = you.player;
  if (!s.path || !s.goal || Math.hypot(s.goal.x - to.x, s.goal.z - to.z) > 3 || s.t - s.goalAt > 3) { s.goal = { x: to.x, z: to.z }; s.goalAt = s.t; s.path = nav.path(p.x, p.z, to.x, to.z, 20000) || []; }
  while (s.path.length && Math.hypot(s.path[0].x - p.x, s.path[0].z - p.z) < .5) s.path.shift();
  while (s.path.length > 1 && nav.walkable(p.x, p.z, s.path[1].x, s.path[1].z)) s.path.shift();
  const w = s.path[0]; if (!w) return [0, 0];
  const dx = w.x - p.x, dz = w.z - p.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l];
 };
 // (Out of the storm first, as anyone would.)
 const stormOut = () => { const c = you.storm, p = you.player; if (!c || Math.hypot(p.x - c.x, p.z - c.z) < c.r - 2.5) return null; return walk({ x: c.x, z: c.z }); };
 return (dt, foe) => {
  s.t += dt; s.tick++;
  const p = you.player, input = { moveX: 0, moveZ: 0, aimX: p.aimX, aimZ: p.aimZ };
  const alive = foe && foe.hp > 0, dx = alive ? foe.x - p.x : 0, dz = alive ? foe.z - p.z : 0, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
  const sees = alive && d < 18 && you.canSeeTarget(foe.x, foe.z, .3);
  if (sees) { s.seenAt = s.t; s.lastX = foe.x; s.lastZ = foe.z; }
  if (s.t > s.sideUntil) { s.side = rnd() < .5 ? -1 : 1; s.sideUntil = s.t + 1 + rnd() * 1.8; }
  let mx = 0, mz = 0;
  const fighting = s.t - s.seenAt < 2;
  const strafe = (k = .9) => { const r = d < 6 ? -.8 : 0; mx = ux * r - uz * s.side * k; mz = uz * r + ux * s.side * k; };
  if (kind === 'hold') {
   // A step either way of its spot, back to it when it drifts.
   const ax = s.anchor.x - p.x, az = s.anchor.z - p.z, ad = Math.hypot(ax, az);
   if (ad > 2.5) [mx, mz] = walk(s.anchor); else if (alive && fighting) strafe(.55); else { mx = -az * s.side * .3; mz = ax * s.side * .3; }
  } else if (kind === 'patrol') {
   if (alive && fighting) strafe();
   else { if (!s.goal || Math.hypot(s.goal.x - p.x, s.goal.z - p.z) < 2 || s.t - s.goalAt > 14) { s.goal = null; s.path = null; s.goalAt = s.t; s.patrolTo = pickGoal(); } [mx, mz] = walk(s.patrolTo || pickGoal()); }
  } else {
   // Hunter: walks at the robot until it can see it inside 12 m, then fights.
   if (alive && sees && d < 12) strafe(); else if (alive) [mx, mz] = walk(foe);
  }
  const out = stormOut(); if (out) [mx, mz] = out;
  if (mx || mz) { const l = Math.hypot(mx, mz) || 1; if (!nav.walkable(p.x, p.z, p.x + mx / l * 1.1, p.z + mz / l * 1.1)) { s.side = -s.side; if (kind !== 'hunter' && !(kind === 'patrol' && !fighting)) { mx = -mx * .3; mz = -mz * .3; } } }
  const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  input.moveX = mx; input.moveZ = mz;
  if (s.tick % 30 === 0) { s.errX = (rnd() - .5) * 1.6; s.errZ = (rnd() - .5) * 1.6; }
  s.burst = (s.burst + dt) % 1.4;
  if (sees) { input.aimX = ux; input.aimZ = uz; input.aimPointX = foe.x + s.errX; input.aimPointZ = foe.z + s.errZ; }
  else if (mx || mz) { const l2 = Math.hypot(mx, mz); input.aimX = mx / l2; input.aimZ = mz / l2; }
  input.fire = sees && s.burst < .8 && you.rifle.ammo > 0;
  input.reload = you.rifle.ammo <= 0;
  return input;
 };
}

// The player never stays dead: a death tops it back up where it stands.
function immortal(you) {
 let deaths = 0; const hurt = you.damagePlayer.bind(you);
 you.damagePlayer = (...args) => { const got = hurt(...args); if (you.player.hp < 12 || you.player.dead) { deaths++; you.player.hp = you.player.maxHp; you.player.dead = false; } return got; };
 return () => deaths;
}

// One robot against a stand-in. Returns plain numbers (see the header).
// `each(t, bot, you)`: called every tick after the step (tests look in).
export function standinRun({ map: mapId = 'deadwater', weapon = 'rifle', skill = 'normal', style = 'blend', temper = 'shifting', standin: kind = 'patrol', seed = 1, secs = 60, each = null } = {}) {
 const map = maps[mapId], dt = RULES.step, base = mix(seed, mapId.length, BOT_WEAPONS.indexOf(weapon) + 1, STANDINS.indexOf(kind) + 1);
 const real = Math.random; Math.random = seeded(mix(base, 5));
 try {
  const you = new Simulation(map); you.weapon = 'rifle'; you.noTargets = true; you.reset(); you.targets = []; you.player.id = 'you';
  const rnd = seeded(mix(base, 9));
  const start = openSpot(map, you.colliders, { random: rnd, tries: 600, margin: 6 }) || map.spawn || { x: 0, z: 0 };
  you.player.x = start.x; you.player.z = start.z;
  const bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(mix(base, 11)) });
  bots.enemyRange = [16, 34];
  const bot = bots.spawn(you, weapon, { team: 'red', skill, style, temper });
  if (bot.sim.weapon !== weapon) { bot.sim.weapon = weapon; bots.putAt(bot, you, { x: bot.sim.player.x, z: bot.sim.player.z }); }
  bot.brain.hunch = .6;     // (duel.js: a BOTS robot)
  const deaths = immortal(you), play = standin(kind, you, bots.nav, rnd, map), w = watcher();
  let dealt = 0, taken = 0, lastHit = -99, firstSeen = null, firstHit = null; const encounters = [];
  const ticks = Math.round(secs / dt);
  for (let i = 0; i < ticks; i++) {
   const t = i * dt, b = bot.sim.player, alive = bot.alive && b.hp > 0;
   const input = play(dt, alive ? { x: b.x, z: b.z, hp: b.hp } : null);
   bots.before(you); you.step(input, dt); bots.after(you); bots.step(you, dt); bots.drain();
   each?.(t, bot, you);
   if (bot.alive && bot.sim.player.hp > 0) {
    w.see(dt, bot, { id: 'you', x: you.player.x, z: you.player.z }, you);
    if (firstSeen == null && bot.brain.memory.get('you')?.visible) firstSeen = t;
   }
   const d1 = bot.stats.dealt - dealt, d2 = bot.stats.taken - taken;
   if (d1 > 0 || d2 > 0) {
    if (t - lastHit > QUIET) encounters.push({ at: t, by: d1 > 0 && !(d2 > 0) ? 'bot' : d2 > 0 && !(d1 > 0) ? 'you' : 'both' });
    if (firstHit == null) firstHit = t;
    lastHit = t; dealt = bot.stats.dealt; taken = bot.stats.taken;
   }
  }
  const { see, ...watch } = w;
  return { kind: 'standin', map: mapId, weapon, skill, standin: kind, seed, secs, watch, encounters, presses: bot.brain.eng.counts.press, holds: bot.brain.eng.counts.hold || 0,
   youDeaths: deaths(), botDeaths: bot.stats.deaths, dealt: bot.stats.dealt, taken: bot.stats.taken, firstSeen, firstHit, persona: bot.profile.label };
 } finally { Math.random = real; }
}

// The BOTS FFA: five robots (BOTS defaults unless given) and a patrolling
// stand-in, for `length` s of match clock (or until it ends). Needs a
// document stub (the score line): one is lent for the run.
export async function ffaRun({ map: mapId = 'deadwater', skill = 'normal', temper = 'shifting', seed = 1, length = 300, each = null } = {}) {
 const { createDuel } = await import('../src/duel.js');
 const map = maps[mapId], dt = RULES.step, base = mix(seed, 77, mapId.length);
 const el = () => ({ hidden: false, className: '', innerHTML: '', textContent: '', classList: { add() {}, remove() {}, contains: () => true, toggle() {} }, setAttribute() {}, append() {}, querySelector: () => el(), focus() {} });
 const real = Math.random, doc = globalThis.document; Math.random = seeded(mix(base, 5)); globalThis.document = { createElement: el };
 try {
  const you = new Simulation(map); you.weapon = 'rifle'; you.player.id = 'you';
  const bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(mix(base, 11)) });
  const duel = createDuel(el(), { sim: you, bots, random: seeded(mix(base, 13)) });
  you.reset(); duel.begin({ mode: 'ffa', length, skill, temper });
  const at = bots.youSpot(you) || openSpot(map, you.colliders, { random: seeded(mix(base, 3)), others: bots.bots.map(b => b.sim.player), space: 20, tries: 600 });
  if (at) { you.player.x = at.x; you.player.z = at.z; }
  const rnd = seeded(mix(base, 9)), deaths = immortal(you), play = standin('patrol', you, bots.nav, rnd, map);
  const ws = new Map(bots.bots.map(b => [b, watcher()]));
  const hp = new Map(); let firstHit = null, firstYou = null, lastHit = 0, longestQuiet = 0, kills = 0, t = 0;
  const outside = new Map(bots.bots.map(b => [b, { now: 0, max: 0, total: 0 }]));
  const ticks = Math.round(length / dt);
  for (let i = 0; i < ticks && !duel.over; i++, t += dt) {
   // The stand-in faces whoever is nearest of the living robots.
   const p = you.player; let foe = null, fd = Infinity;
   for (const b of bots.bots) if (b.alive && b.sim.player.hp > 0) { const q = b.sim.player, d = Math.hypot(q.x - p.x, q.z - p.z); if (d < fd) { fd = d; foe = q; } }
   const input = play(dt, foe ? { x: foe.x, z: foe.z, hp: foe.hp } : null);
   bots.before(you); you.step(input, dt); bots.after(you); bots.step(you, dt); bots.drain();
   duel.frame(dt, true);
   each?.(t, bots, you, duel);
   // Damage anywhere (a robot's health down, or the stand-in's).
   let hit = false;
   for (const b of bots.bots) {
    const q = b.sim.player, was = hp.get(b) ?? q.hp;
    if (b.alive && q.hp < was - .01) hit = true;
    hp.set(b, q.hp);
    if (b.alive && q.hp > 0) {
     const tid = b.brain.targetId, tp = tid === 'you' ? p : bots.bots.find(o => o.id === tid && o.alive)?.sim.player;
     ws.get(b).see(dt, b, tp ? { id: tid, x: tp.x, z: tp.z } : null, b.sim);
     const c = you.storm, o = outside.get(b);
     if (c && Math.hypot(q.x - c.x, q.z - c.z) > c.r) { o.now += dt; o.total += dt; o.max = Math.max(o.max, o.now); } else o.now = 0;
    }
   }
   const youHp = hp.get('you') ?? p.hp; if (p.hp < youHp - .01) { hit = true; if (firstYou == null) firstYou = t; } hp.set('you', p.hp);
   if (hit) { if (firstHit == null) firstHit = t; longestQuiet = Math.max(longestQuiet, t - lastHit); lastHit = t; }
  }
  longestQuiet = Math.max(longestQuiet, t - lastHit);
  kills = bots.bots.reduce((n, b) => n + b.stats.kills, 0) + (bots.youStats?.kills || 0);
  return { kind: 'ffa', map: mapId, skill, seed, length, ran: t, over: duel.over, left: duel.left, firstHit, firstYou, longestQuiet, kills, robotDeaths: bots.bots.reduce((n, b) => n + b.stats.deaths, 0), youDeaths: deaths(),
   storm: [...outside.values()].map(o => ({ max: o.max, total: o.total })), watch: [...ws.values()].map(({ see, ...rest }) => rest), presses: bots.bots.reduce((n, b) => n + b.brain.eng.counts.press, 0), holds: bots.bots.reduce((n, b) => n + (b.brain.eng.counts.hold || 0), 0) };
 } finally { Math.random = real; globalThis.document = doc; }
}

// Pools watchers and runs into one summary (shares in %, rates per minute).
export function summarise(runs) {
 const s = { ticks: 0, contact: 0, cls: { closing: 0, backing: 0, cover: 0, open: 0 }, states: {}, modes: {}, distSum: 0, distN: 0, dt: RULES.step, minutes: 0, encounters: 0, byBot: 0, byYou: 0, presses: 0, holds: 0, youDeaths: 0, botDeaths: 0, firstHit: [], firstSeen: [] };
 for (const r of runs) {
  const list = r.kind === 'ffa' ? r.watch : [r.watch];
  for (const w of list) {
   s.ticks += w.ticks; s.contact += w.contact; s.distSum += w.distSum; s.distN += w.distN;
   for (const k in w.cls) s.cls[k] += w.cls[k];
   for (const k in w.states) s.states[k] = (s.states[k] || 0) + w.states[k];
   for (const k in w.modes) s.modes[k] = (s.modes[k] || 0) + w.modes[k];
  }
  s.minutes += (r.kind === 'ffa' ? r.ran : r.secs) / 60;
  s.presses += r.presses || 0; s.holds += r.holds || 0; s.youDeaths += r.youDeaths || 0; s.botDeaths += r.botDeaths ?? r.robotDeaths ?? 0;
  if (r.encounters) { s.encounters += r.encounters.length; s.byBot += r.encounters.filter(e => e.by === 'bot').length; s.byYou += r.encounters.filter(e => e.by === 'you').length; }
  if (r.firstHit != null) s.firstHit.push(r.firstHit); if (r.firstSeen != null) s.firstSeen.push(r.firstSeen);
 }
 const pc = (n, of) => 100 * n / (of || 1), mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
 return {
  minutes: s.minutes,
  contactPct: pc(s.contact, s.ticks),
  // Shares of the time it knows where its target is.
  share: Object.fromEntries(CLASSES.map(k => [k, pc(s.cls[k], s.contact)])),
  states: Object.fromEntries(Object.entries(s.states).map(([k, v]) => [k, pc(v, s.ticks)])),
  modes: Object.fromEntries(Object.entries(s.modes).map(([k, v]) => [k, pc(v, s.ticks)])),
  meanDist: s.distN ? s.distSum / s.distN : NaN,
  encountersPerMin: s.encounters / (s.minutes || 1), initiatedPerMin: s.byBot / (s.minutes || 1), initiatedShare: pc(s.byBot, s.encounters),
  pressesPerMin: s.presses / (s.minutes || 1), holdsPerMin: s.holds / (s.minutes || 1),
  youDeathsPerMin: s.youDeaths / (s.minutes || 1), botDeathsPerMin: s.botDeaths / (s.minutes || 1),
  firstHit: mean(s.firstHit), firstSeen: mean(s.firstSeen),
 };
}
