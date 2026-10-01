#!/usr/bin/env node
// How robots FIGHT, not only whether they win (owner, 2026-09-30: "make bots a
// bit more dynamic. i was playing one who just kept chasing me without backing
// off or initiating"). Headless, seeded, the game's own machinery (BotMatch +
// RobotBrain + Simulation), like tools/duel-matrix.mjs.
//
//   node tools/bot-behaviour.mjs [--rounds 6] [--cap 60] [--player-runs 3] [--player-cap 75]
//        [--skill hard] [--player-skill normal] [--weapons static,rifle,...] [--seed 1] [--workers 2] [--json]
//
// Two scenarios per weapon:
//  - duel: that weapon's robot against each of the other seven in turn (hard
//    robots, 1V1 duel circle, first kill ends a round), --rounds per weapon.
//  - player: that weapon's robot (--player-skill, normal by default: what the
//    owner plays) against a scripted 'player' with Nominal who strafes, backs
//    off when the robot is near, walks in when it is far, and shoots it when it
//    can see it. The player never stays dead (a 'death' tops it back up), and
//    the robot comes back 14-22 m off after its own death, so the fight keeps
//    going for --player-cap seconds.
//
// Measured from what anyone watching could see (so it works on any brain,
// before and after the engagement loop), per tick of the robot's own sim:
//  - seek     it has not seen its enemy for 2 s or more
//  - lost     seen within 2 s, not now (it broke line of sight, or they did)
//  - closing  sees it, its own velocity toward them > 2 m/s
//  - backing  sees it, its own velocity away from them > 2 m/s
//  - holding  sees it, neither (strafing, planted, peeking)
// Events: a *disengage* is a backing spell of 0.6 s or more, or a break of
// sight while moving away; a *re-engage* is seeing them again after 1 s or more
// out of sight, or closing again after a backing spell. A *chase* is a closing
// spell; `futile` is closing while the gap still grows (they run, it follows).
// When the brain has an engagement state (`brain.eng.state`), its share of time
// in each state is printed too.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cpus } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ALL = ['static', 'rifle', 'shotgun', 'omen', 'sightline', 'sidekick', 'ichor', 'sheath'];
const NAME = { static: 'Static', rifle: 'Nominal', shotgun: 'Ballast', omen: 'Omen', sightline: 'Sightline', sidekick: 'Sidekick', ichor: 'Ichor', sheath: 'Sheath' };

function parseArgs(argv) {
 const o = { rounds: 6, cap: 60, playerRuns: 3, playerCap: 75, skill: 'hard', playerSkill: 'normal', seed: 1, weapons: ALL, workers: Math.min(4, cpus().length), json: false };
 for (let i = 0; i < argv.length; i++) {
  const a = argv[i], next = () => argv[++i];
  if (a === '--rounds') o.rounds = Number(next());
  else if (a === '--cap') o.cap = Number(next());
  else if (a === '--player-runs') o.playerRuns = Number(next());
  else if (a === '--player-cap') o.playerCap = Number(next());
  else if (a === '--skill') o.skill = next();
  else if (a === '--player-skill') o.playerSkill = next();
  else if (a === '--seed') o.seed = Number(next());
  else if (a === '--weapons') o.weapons = next().split(',');
  else if (a === '--workers') o.workers = Math.max(1, Number(next()));
  else if (a === '--json') o.json = true;
  else { console.error('unknown argument ' + a); process.exit(2); }
 }
 return o;
}
function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mix = (...n) => n.reduce((h, v) => Math.imul(h ^ (v >>> 0), 2654435761) >>> 0, 0x9E3779B9);

async function loadGame() {
 const [{ Simulation }, { maps }, { BotMatch }, { RULES }, { pickDuelCircle }, wm] = await Promise.all([
  import('../src/simulation.js'), import('../src/maps.js'), import('../src/bots/bot-match.js'), import('../src/config/gameplay.js'),
  import('../src/duel-circle.js'), import('../src/weapon-maintenance.js')]);
 wm.setMaintenanceLifted(true);
 return { Simulation, maps, BotMatch, RULES, pickDuelCircle };
}

// The watcher: one per observed robot. `see()` each tick.
function watcher() {
 const w = { ticks: 0, cls: { seek: 0, lost: 0, closing: 0, backing: 0, holding: 0 }, states: {}, disengages: 0, reengages: 0, chases: 0, chaseTime: 0, longestChase: 0, futile: 0,
  distSum: 0, distN: 0, lastSeen: -99, t: 0, prevCls: null, backRun: 0, closeRun: 0, outRun: 0, wasBacking: false, lastGap: null, dt: 0 };
 w.see = (dt, brain, me, them) => {
  w.t += dt; w.ticks++; w.dt = dt;
  const st = brain.eng?.state; if (st) w.states[st] = (w.states[st] || 0) + 1;
  const m = them ? brain.memory.get(them.id) : null, visible = !!(m && m.visible);
  let c;
  const dx = them ? them.x - me.x : 0, dz = them ? them.z - me.z : 0, d = Math.hypot(dx, dz) || 1;
  const own = (me.vx * dx + me.vz * dz) / d;      // + toward them
  if (visible) {
   w.lastSeen = w.t; w.distSum += d; w.distN++;
   c = own > 2 ? 'closing' : own < -2 ? 'backing' : 'holding';
  } else c = w.t - w.lastSeen < 2 ? 'lost' : 'seek';
  w.cls[c]++;
  // Spells.
  if (c === 'backing') { w.backRun += dt; if (w.backRun >= .6 && !w.wasBacking) { w.disengages++; w.wasBacking = true; } }
  else if (c !== 'lost') { if (w.wasBacking && c === 'closing') w.reengages++; if (c === 'closing' || c === 'holding') { w.backRun = 0; if (c === 'closing') w.wasBacking = false; } }
  if (c === 'lost' && w.prevCls && w.prevCls !== 'lost' && w.prevCls !== 'seek' && own < -1.5 && !w.wasBacking) { w.disengages++; w.wasBacking = true; }
  if (!visible) w.outRun += dt; else { if (w.outRun >= 1 && w.prevCls != null) w.reengages++; w.outRun = 0; }
  if (c === 'closing') {
   w.closeRun += dt; w.chaseTime += dt;
   if (w.lastGap != null && d > w.lastGap + 1e-4) w.futile += dt;
  } else if (w.closeRun > 0) { w.chases++; w.longestChase = Math.max(w.longestChase, w.closeRun); w.closeRun = 0; }
  w.lastGap = visible ? d : null; w.prevCls = c;
 };
 w.done = () => { if (w.closeRun > 0) { w.chases++; w.longestChase = Math.max(w.longestChase, w.closeRun); } const { see, done, ...plain } = w; return plain; };
 return w;
}

// Duel: robot `a` against robot `b`, hard, 1V1 circle; watches `a` (and `b`).
function duel(G, { a, b, k, cfg }) {
 const { Simulation, maps, BotMatch, RULES, pickDuelCircle } = G;
 const map = maps.deadwater, dt = RULES.step, roundSeed = mix(cfg.seed, 101, k);
 const real = Math.random; Math.random = seeded(mix(roundSeed, 17, k));
 try {
  const main = new Simulation(map); main.noTargets = true; main.reset(); main.targets = []; main.dev.ghost = true; main.dev.invulnerable = true; main.player.id = 'you';
  const bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(mix(roundSeed, 29, k)) });
  bots.holdRespawns = true;
  const circle = pickDuelCircle(map, main.colliders, { random: seeded(roundSeed) });
  main.player.x = circle.x; main.player.z = circle.z;
  const at = k % 2 ? [circle.spawns[1], circle.spawns[0]] : circle.spawns;
  const opts = { team: 'ffa', skill: cfg.skill, style: 'balanced', aim: 1 };
  const one = bots.spawn(main, a, opts), two = bots.spawn(main, b, opts), pair = [one, two], ws = [a, b];
  pair.forEach((bot, i) => { if (bot.sim.weapon !== ws[i]) bot.sim.weapon = ws[i]; bots.putAt(bot, main, at[i]); bot.sim.boundary = circle; bot.brain.hunch = .6; });
  main.boundary = circle;
  const wa = watcher(), wb = watcher(), idle = { moveX: 0, moveZ: 0, aimX: 1, aimZ: 0 };
  let result = 'timeout', tick = 0;
  for (; tick < cfg.cap / dt; tick++) {
   bots.before(main); main.step(idle, dt); bots.after(main); bots.step(main, dt); bots.drain();
   const pa = one.sim.player, pb = two.sim.player;
   if (pa.hp > 0 && pb.hp > 0) { wa.see(dt, one.brain, pa, { id: two.id, x: pb.x, z: pb.z }); wb.see(dt, two.brain, pb, { id: one.id, x: pa.x, z: pa.z }); }
   const down = pair.map(bt => bt.sim.player.dead || bt.sim.player.hp <= 0);
   if (down[0] || down[1]) { result = down[0] && down[1] ? 'draw' : down[0] ? 'b' : 'a'; break; }
  }
  return { kind: 'duel', a, b, k, result, time: tick * dt, watch: [wa.done(), wb.done()] };
 } finally { Math.random = real; }
}

// Player: a scripted Nominal player against one robot of `a`.
function versusPlayer(G, { a, k, cfg }) {
 const { Simulation, maps, BotMatch, RULES } = G;
 const map = maps.deadwater, dt = RULES.step, seed = mix(cfg.seed, 202, k, a.length);
 const real = Math.random; Math.random = seeded(mix(seed, 5));
 try {
  const you = new Simulation(map); you.weapon = 'rifle'; you.noTargets = true; you.reset(); you.targets = []; you.player.id = 'you';
  const rnd = seeded(mix(seed, 9));
  const bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(mix(seed, 11)) });
  bots.enemyRange = [14, 22];
  const bot = bots.spawn(you, a, { team: 'red', skill: cfg.playerSkill, style: 'blend', temper: 'shifting' });
  if (bot.sim.weapon !== a) { bot.sim.weapon = a; bots.putAt(bot, you, { x: bot.sim.player.x, z: bot.sim.player.z }); }
  // The player never stays dead: a death tops it back up where it stands.
  let deaths = 0; const hurt = you.damagePlayer.bind(you);
  you.damagePlayer = (...args) => { const got = hurt(...args); if (you.player.hp < 12 || you.player.dead) { deaths++; you.player.hp = you.player.maxHp; you.player.dead = false; } return got; };
  const w = watcher(), nav = bots.nav;
  let side = 1, sideUntil = 0, burst = 0, t = 0, errX = 0, errZ = 0;
  for (let i = 0; i < cfg.playerCap / dt; i++, t += dt) {
   const p = you.player, b = bot.sim.player, alive = bot.alive && b.hp > 0;
   const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
   if (t > sideUntil) { side = rnd() < .5 ? -1 : 1; sideUntil = t + 1.2 + rnd() * 2; }
   const radial = !alive ? 0 : d < 7 ? -1 : d > 16 ? .8 : (rnd() < .02 ? (rnd() - .5) : 0);
   let mx = ux * radial - uz * side * .9, mz = uz * radial + ux * side * .9;
   const l = Math.hypot(mx, mz) || 1; mx /= l; mz /= l;
   if (!nav.walkable(p.x, p.z, p.x + mx * 1.2, p.z + mz * 1.2)) { side = -side; sideUntil = t + .8; mx = ux * radial - uz * side * .9; mz = uz * radial + ux * side * .9; const l2 = Math.hypot(mx, mz) || 1; mx /= l2; mz /= l2; if (!nav.walkable(p.x, p.z, p.x + mx * 1.2, p.z + mz * 1.2)) { mx = -mx; mz = -mz; } }
   const sees = alive && d < 20 && you.canSeeTarget(b.x, b.z, .3);
   if (i % 30 === 0) { errX = (rnd() - .5) * 1.6; errZ = (rnd() - .5) * 1.6; }
   burst = (burst + dt) % 1.4;
   const input = { moveX: mx, moveZ: mz, aimX: ux, aimZ: uz, aimPointX: b.x + errX, aimPointZ: b.z + errZ, fire: sees && burst < .8 && you.rifle.ammo > 0, reload: you.rifle.ammo <= 0 };
   bots.before(you); you.step(input, dt); bots.after(you); bots.step(you, dt); bots.drain();
   if (bot.alive && bot.sim.player.hp > 0) w.see(dt, bot.brain, bot.sim.player, { id: 'you', x: p.x, z: p.z });
  }
  return { kind: 'player', a, k, deaths, robotDeaths: bot.stats.deaths, dealt: bot.stats.dealt, time: cfg.playerCap, watch: [w.done()] };
 } finally { Math.random = real; }
}

function summarise(list) {
 const s = { ticks: 0, dt: 0, cls: { seek: 0, lost: 0, closing: 0, backing: 0, holding: 0 }, states: {}, disengages: 0, reengages: 0, chases: 0, chaseTime: 0, longestChase: 0, futile: 0, distSum: 0, distN: 0 };
 for (const w of list) {
  s.ticks += w.ticks; s.dt = w.dt || s.dt;
  for (const k in w.cls) s.cls[k] += w.cls[k];
  for (const k in w.states) s.states[k] = (s.states[k] || 0) + w.states[k];
  for (const k of ['disengages', 'reengages', 'chases', 'chaseTime', 'futile', 'distSum', 'distN']) s[k] += w[k];
  s.longestChase = Math.max(s.longestChase, w.longestChase);
 }
 const min = s.ticks * s.dt / 60 || 1, pc = n => 100 * n / (s.ticks || 1);
 return {
  minutes: min, pct: Object.fromEntries(Object.entries(s.cls).map(([k, v]) => [k, pc(v)])),
  states: Object.fromEntries(Object.entries(s.states).map(([k, v]) => [k, pc(v)])),
  disengagesPerMin: s.disengages / min, reengagesPerMin: s.reengages / min, meanDist: s.distN ? s.distSum / s.distN : NaN,
  closeToBack: (s.cls.closing + 1) / (s.cls.backing + 1), meanChase: s.chases ? s.chaseTime / s.chases : 0, longestChase: s.longestChase, futilePerMin: s.futile / min,
 };
}

if (!isMainThread) {
 const G = await loadGame();
 const { jobs, cfg } = workerData;
 for (const job of jobs) parentPort.postMessage(job.kind === 'duel' ? duel(G, { ...job, cfg }) : versusPlayer(G, { ...job, cfg }));
 parentPort.postMessage({ done: true });
} else {
 const cfg = parseArgs(process.argv.slice(2)), W = cfg.weapons;
 const jobs = [];
 for (const a of W) {
  const foes = ALL.filter(x => x !== a);
  for (let k = 0; k < cfg.rounds; k++) jobs.push({ kind: 'duel', a, b: foes[k % foes.length], k });
  for (let k = 0; k < cfg.playerRuns; k++) jobs.push({ kind: 'player', a, k });
 }
 const started = Date.now(), results = [];
 const shares = Array.from({ length: cfg.workers }, () => []);
 jobs.forEach((j, i) => shares[i % cfg.workers].push(j));
 await Promise.all(shares.filter(s => s.length).map(share => new Promise((resolve, reject) => {
  const w = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: share, cfg } });
  w.on('message', m => { if (m.done) { w.terminate(); resolve(); } else results.push(m); });
  w.on('error', reject);
 })));
 const wall = (Date.now() - started) / 1000;
 const out = { config: cfg, wallSeconds: wall, duel: {}, player: {} };
 for (const a of W) {
  out.duel[a] = summarise(results.filter(r => r.kind === 'duel' && r.a === a).map(r => r.watch[0]));
  const pr = results.filter(r => r.kind === 'player' && r.a === a);
  out.player[a] = { ...summarise(pr.map(r => r.watch[0])), playerDeaths: pr.reduce((n, r) => n + r.deaths, 0), robotDeaths: pr.reduce((n, r) => n + r.robotDeaths, 0) };
 }
 const f0 = v => Number.isFinite(v) ? v.toFixed(0) : '-', f1 = v => Number.isFinite(v) ? v.toFixed(1) : '-';
 const pad = (s, n) => String(s).padStart(n), padR = (s, n) => String(s).padEnd(n);
 const lines = [`bot-behaviour: Deadwater; duel = ${cfg.skill} robot vs each other weapon (${cfg.rounds} rounds, cap ${cfg.cap} s); player = ${cfg.playerSkill} robot vs a scripted strafing/retreating Nominal player (${cfg.playerRuns} x ${cfg.playerCap} s); ${wall.toFixed(0)} s wall`];
 const table = (title, rows, extra) => {
  lines.push('', title);
  lines.push(padR('weapon', 10) + pad('seek%', 6) + pad('lost%', 6) + pad('close%', 7) + pad('hold%', 6) + pad('back%', 6) + pad('dis/m', 6) + pad('re/m', 6) + pad('dist', 6) + pad('c:b', 6) + pad('chase', 6) + pad('maxCh', 6) + pad('futl/m', 7) + (extra ? pad('pDie', 5) + pad('rDie', 5) : '') + '  states');
  for (const a of W) {
   const r = rows[a], st = Object.entries(r.states).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${f0(v)}`).join(', ');
   lines.push(padR(NAME[a], 10) + pad(f0(r.pct.seek), 6) + pad(f0(r.pct.lost), 6) + pad(f0(r.pct.closing), 7) + pad(f0(r.pct.holding), 6) + pad(f0(r.pct.backing), 6) + pad(f1(r.disengagesPerMin), 6) + pad(f1(r.reengagesPerMin), 6) + pad(f1(r.meanDist), 6) + pad(f1(r.closeToBack), 6) + pad(f1(r.meanChase), 6) + pad(f1(r.longestChase), 6) + pad(f1(r.futilePerMin), 7) + (extra ? pad(r.playerDeaths, 5) + pad(r.robotDeaths, 5) : '') + '  ' + (st || '-'));
  }
 };
 table('DUEL (robot vs robot, hard)', out.duel, false);
 table('PLAYER (robot vs scripted strafing / retreating player)', out.player, true);
 lines.push('', 'seek/lost/close/hold/back: % of ticks (see header). dis/m, re/m: disengages and re-engages per minute. dist: mean distance while it sees them.',
  'c:b: closing time over backing time. chase: mean closing spell (s); maxCh: longest. futl/m: seconds per minute spent closing while the gap still grew.',
  'pDie / rDie: scripted player top-ups (deaths) and robot deaths. states: the brain\'s own engagement states (% of ticks), when it has them.');
 console.log(lines.join('\n'));
 const outDir = join(HERE, 'out'); mkdirSync(outDir, { recursive: true });
 const file = join(outDir, `bot-behaviour-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
 writeFileSync(file, JSON.stringify(out, null, 1));
 console.log('\nJSON: ' + file);
}
