#!/usr/bin/env node
// Robot 1V1 weapon matrix: how the eight weapons fare against each other when
// two robots of the same skill fight to the first kill. Headless, no browser,
// fixed 60 Hz steps, fully seeded (same arguments, same numbers).
//
//   node tools/duel-matrix.mjs [--rounds N] [--distance duel|close|mid|far]
//        [--skill hard] [--style balanced|blend|<style>] [--temper none|shifting|calm|aggressive]
//        [--cap 90] [--seed 1] [--weapons static,rifle,...] [--workers 2] [--quiet]
//
// How a round is played (the game's own machinery, no new game rules):
//  - One world sim (Deadwater, no practice targets) whose player is removed
//    (dev "ghost"), stepped like SOLO steps your sim; the two robots are
//    BotMatch robots (src/bots/bot-match.js): each its own Simulation driven
//    by RobotBrain, with every ability, dodge and reload the game's robots use.
//    Both are 'ffa' robots, so each is the other's only enemy.
//  - 1V1's rules: the duel circle (duel-circle.js pickDuelCircle, sim.boundary)
//    and its two spawns (--distance duel, the default); the robots' 1V1 hunch
//    (duel.js: brain.hunch .6); nobody respawns (holdRespawns).
//    --distance close/mid/far instead starts them ~5/12/22 m apart on a line
//    through a spot in the same circle, facing each other.
//  - Round k uses the same seed for every matchup (same circle, same spots),
//    and odd rounds swap the two robots' sides, so position bias cancels.
//  - First death ends it. Both down on the same tick, or nobody down by the
//    cap (sim seconds), is a draw.
// Each ordered pair (A, B) plays N rounds; the matrix pools (A, B) and (B, A).
//
// Damage split: every hit a robot lands on the other (its sim's hit(), wrapped
// here per instance: no game file changes) is labelled primary / E / X / C by
// the weapon's own state at that moment (e.g. Nominal bullets during Nova count
// as X, Static's stream as C, Sidekick shots during its X as X).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cpus } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ALL = ['static', 'rifle', 'shotgun', 'omen', 'sightline', 'sidekick', 'ichor', 'sheath'];
const DISTANCES = { close: 5, mid: 12, far: 22 };

function parseArgs(argv) {
 const o = { rounds: 20, distance: 'duel', skill: 'hard', style: 'balanced', temper: 'none', cap: 90, seed: 1, weapons: ALL, workers: Math.min(4, cpus().length), quiet: false };
 for (let i = 0; i < argv.length; i++) {
  const a = argv[i], next = () => argv[++i];
  if (a === '--rounds' || a === '-n') o.rounds = Number(next());
  else if (a === '--distance') o.distance = next();
  else if (a === '--skill') o.skill = next();
  else if (a === '--style') o.style = next();
  else if (a === '--temper') o.temper = next();
  else if (a === '--cap') o.cap = Number(next());
  else if (a === '--seed') o.seed = Number(next());
  else if (a === '--weapons') o.weapons = next().split(',');
  else if (a === '--workers') o.workers = Math.max(1, Number(next()));
  else if (a === '--quiet') o.quiet = true;
  else if (/^\d+$/.test(a)) o.rounds = Number(a);
  else { console.error('unknown argument ' + a); process.exit(2); }
 }
 if (o.distance !== 'duel' && !DISTANCES[o.distance]) { console.error('--distance: duel, close, mid or far'); process.exit(2); }
 return o;
}

// mulberry32-style generator (as tests/golden-flat.test.js).
function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mix = (...n) => n.reduce((h, v) => Math.imul(h ^ (v >>> 0), 2654435761) >>> 0, 0x9E3779B9);

// ---------------------------------------------------------------------------------------------
// One round (runs inside a worker or the main thread).
async function loadGame() {
 const [{ Simulation }, { maps }, { BotMatch }, { RULES, OMEN }, { pickDuelCircle }, { openAt }, wm] = await Promise.all([
  import('../src/simulation.js'), import('../src/maps.js'), import('../src/bots/bot-match.js'), import('../src/config/gameplay.js'),
  import('../src/duel-circle.js'), import('../src/net/spawn-points.js'), import('../src/weapon-maintenance.js')]);
 // Sightline is under maintenance (robots never get it in the game); lift it
 // for this page only, as the developer tools' switch does.
 wm.setMaintenanceLifted(true);
 return { Simulation, maps, BotMatch, RULES, OMEN, pickDuelCircle, openAt };
}

// Which part of the kit a landed hit came from, from the shooter's sim state.
function label(sim, weapon, target, shot, G) {
 const t = shot.damageType;
 switch (weapon) {
  case 'static':
   if (shot.launched || shot.blast) return 'P';                      // orb volleys / quick shot (E places the orbs)
   if (shot.electric && sim.spray?.active && shot.volley === sim.spray.volley) return 'C';   // lightning stream
   return 'X';                                                        // hex edge / pulse
  case 'rifle':
   if (shot.bullet) return sim.surge?.active ? 'X' : 'P';            // Nova bullets count as X
   return 'E';                                                        // grenade
  case 'shotgun':
   return String(shot.volley).startsWith('scatter') ? 'X' : 'P';     // (E double shot is ballast pellets too: in P)
  case 'omen': {
   if (t === 'omenCurse') return String(shot.volley).startsWith('omenx') ? 'X' : 'E';
   if (t === 'omenBlast') { const m = sim.omen.marks.find(q => q.id === target.id); return m?.kind === 'x' ? 'X' : 'E'; }
   const b = sim.omenBolts.find(q => q.x === shot.x && q.z === shot.z);
   return b?.kind === 'e' ? 'E' : b?.kind === 'x' ? 'X' : 'P';
  }
  case 'sightline':
   if (t === 'sightlinePistol') return 'P';                          // standing Sidekick
   if (t === 'sightlineShot') return 'E';                            // crouched rifle (E stance)
   return 'X';                                                        // Breach blast / muzzle
  case 'sidekick':
   if (t === 'sidekickMine') return 'E';
   return sim.sidekick.active > 0 ? 'X' : 'P';
  case 'ichor':
   return t === 'ichorWave' ? 'E' : t === 'ichorFrenzy' ? 'X' : 'P';
  case 'sheath':
   if (t === 'bladeDraw') return 'X';
   return sim.sheath.rush > 0 ? 'E' : 'P';                           // slashes during Gold Rush count as E
 }
 return 'P';
}

function playRound(G, { a, b, k, cfg }) {
 const { Simulation, maps, BotMatch, RULES, pickDuelCircle, openAt } = G;
 const map = maps.deadwater, dt = RULES.step;
 const roundSeed = mix(cfg.seed, cfg.distance === 'duel' ? 0 : DISTANCES[cfg.distance], Math.floor(k / 2));
 const real = Math.random; Math.random = seeded(mix(roundSeed, 17, k));
 try {
  const main = new Simulation(map);
  main.noTargets = true; main.reset(); main.targets = [];
  main.dev.ghost = true; main.dev.invulnerable = true; main.player.id = 'you';
  const random = seeded(mix(roundSeed, 29, k));
  const bots = new BotMatch(map, { createSim: m => new Simulation(m), random });
  bots.holdRespawns = true; bots.friendlyFire = 0;
  // The circle and its spots: the same for round 2j and 2j+1 (seeded by j).
  const place = seeded(roundSeed);
  const circle = pickDuelCircle(map, main.colliders, { random: place });
  let spots = circle.spawns;
  if (cfg.distance !== 'duel') {
   const sep = DISTANCES[cfg.distance]; spots = null;
   for (let tries = 0; tries < 400 && !spots; tries++) {
    const ang = place() * Math.PI * 2, rr = Math.max(0, circle.r - 2 - sep / 2) * Math.sqrt(place());
    const cx = circle.x + Math.cos(ang) * rr, cz = circle.z + Math.sin(ang) * rr, dir = place() * Math.PI * 2;
    const one = { x: cx + Math.cos(dir) * sep / 2, z: cz + Math.sin(dir) * sep / 2 }, two = { x: cx - Math.cos(dir) * sep / 2, z: cz - Math.sin(dir) * sep / 2 };
    if (openAt(map, main.colliders, one.x, one.z, 1) && openAt(map, main.colliders, two.x, two.z, 1)) spots = [one, two];
   }
   if (!spots) spots = circle.spawns;
  }
  // The ghost stands at the circle's centre (it is in nobody's world).
  main.player.x = circle.x; main.player.z = circle.z;
  const swap = k % 2 === 1, at = swap ? [spots[1], spots[0]] : [spots[0], spots[1]];
  const opts = { team: 'ffa', skill: cfg.skill, style: cfg.style, temper: cfg.temper === 'none' ? null : cfg.temper, aim: 1 };
  const one = bots.spawn(main, a, opts), two = bots.spawn(main, b, opts);
  const pair = [one, two], weapons = [a, b];
  const dmg = [{ P: 0, E: 0, X: 0, C: 0 }, { P: 0, E: 0, X: 0, C: 0 }], self = [0, 0], selfKill = [false, false];
  let firstHit = [null, null], hits = [0, 0];
  pair.forEach((bot, i) => {
   // Weapons under maintenance fall back to a random one in spawn(): set it back.
   if (bot.sim.weapon !== weapons[i]) bot.sim.weapon = weapons[i];
   bots.putAt(bot, main, at[i]);
   bot.sim.boundary = circle; bot.brain.hunch = .6;
   const other = pair[1 - i], p = bot.sim.player, q = at[1 - i], dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz) || 1;
   p.aimX = dx / d; p.aimZ = dz / d;
   const sim = bot.sim, hit = sim.hit.bind(sim);
   sim.hit = (target, shot) => {
    const before = target.hp; hit(target, shot);
    const lost = before - target.hp;
    if (lost > 0 && target.id === other.id) { dmg[i][label(sim, weapons[i], target, shot, G)] += lost; hits[i]++; if (firstHit[i] == null) firstHit[i] = sim.time; }
   };
   const hurt = sim.damagePlayer.bind(sim);
   // Self-inflicted (own blasts): counted, and whether it was the killing blow.
   sim.damagePlayer = (damage, owner, ...rest) => {
    const before = sim.player.hp, got = hurt(damage, owner, ...rest);
    if (owner === sim.player.id) { self[i] += Math.max(0, before - sim.player.hp); if (before > 0 && sim.player.hp <= 0) selfKill[i] = true; }
    return got;
   };
  });
  main.boundary = circle;
  const idle = { moveX: 0, moveZ: 0, aimX: 1, aimZ: 0 };
  const ticks = Math.round(cfg.cap / dt);
  let tick = 0, result = null;
  for (; tick < ticks; tick++) {
   bots.before(main); main.step(idle, dt); bots.after(main); bots.step(main, dt);
   // (Ichor's health costs come off directly, not through damagePlayer: its events.)
   for (const { e, slot } of bots.drain()) if (e.type === 'playerDamage' && e.damageType === 'ichorCost') { const i = slot === one.slot ? 0 : slot === two.slot ? 1 : -1; if (i >= 0) self[i] += e.damage || 0; }
   const down = pair.map(bt => bt.sim.player.dead || bt.sim.player.hp <= 0);
   if (down[0] || down[1]) { result = down[0] && down[1] ? 'draw' : down[0] ? 'b' : 'a'; tick++; break; }
  }
  const time = tick * dt;
  if (!result) result = 'timeout';
  const hp = pair.map(bt => bt.sim.player.hp);
  const brains = pair.map(bt => bt.brain);
  return {
   a, b, k, result, time, swap,
   dealt: dmg, self, selfKill, hits, firstHit,
   hpLeft: hp.map(h => Math.max(0, h)),
   stuck: brains.map(br => br.stuckTotal || 0),
   sep: Math.hypot(at[0].x - at[1].x, at[0].z - at[1].z),
  };
 } finally { Math.random = real; }
}

// ---------------------------------------------------------------------------------------------
if (!isMainThread) {
 const G = await loadGame();
 const { jobs, cfg } = workerData;
 for (const job of jobs) parentPort.postMessage(playRound(G, { ...job, cfg }));
 parentPort.postMessage({ done: true });
} else {
 const cfg = parseArgs(process.argv.slice(2));
 const W = cfg.weapons;
 const jobs = [];
 for (const a of W) for (const b of W) for (let k = 0; k < cfg.rounds; k++) jobs.push({ a, b, k });
 const started = Date.now();
 const results = [];
 const shares = Array.from({ length: cfg.workers }, () => []);
 jobs.forEach((j, i) => shares[i % cfg.workers].push(j));
 const progress = () => { if (!cfg.quiet && process.stderr.isTTY !== undefined) process.stderr.write(`\r${results.length}/${jobs.length} rounds, ${((Date.now() - started) / 1000).toFixed(0)} s`); };
 await Promise.all(shares.filter(s => s.length).map(share => new Promise((resolve, reject) => {
  const w = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: share, cfg } });
  w.on('message', m => { if (m.done) { w.terminate(); resolve(); } else { results.push(m); if (results.length % 16 === 0) progress(); } });
  w.on('error', reject);
 })));
 if (!cfg.quiet) process.stderr.write('\n');
 const wall = (Date.now() - started) / 1000;
 results.sort((x, y) => W.indexOf(x.a) - W.indexOf(y.a) || W.indexOf(x.b) - W.indexOf(y.b) || x.k - y.k);

 // --- tallies -------------------------------------------------------------------------------
 const cell = () => ({ w: 0, l: 0, d: 0 });
 const M = Object.fromEntries(W.map(r => [r, Object.fromEntries(W.map(c => [c, cell()]))]));
 const per = Object.fromEntries(W.map(w => [w, { rounds: 0, w: 0, l: 0, d: 0, timeouts: 0, winTime: 0, ttk: 0, ttkN: 0, len: 0, dealt: { P: 0, E: 0, X: 0, C: 0 }, self: 0, selfKills: 0, stuck: 0 }]));
 let draws = 0, timeouts = 0, simTime = 0;
 const add = (dst, src) => { for (const k of Object.keys(src)) dst[k] += src[k]; };
 for (const r of results) {
  simTime += r.time;
  const sides = [r.a, r.b];
  if (r.result === 'draw' || r.result === 'timeout') { draws++; if (r.result === 'timeout') timeouts++; }
  for (let i = 0; i < 2; i++) {
   const me = sides[i], them = sides[1 - i], s = per[me];
   const won = (r.result === 'a' && i === 0) || (r.result === 'b' && i === 1), lost = (r.result === 'a' && i === 1) || (r.result === 'b' && i === 0);
   // Per-weapon figures: against other weapons only (mirrors are in the matrix's diagonal).
   if (me !== them) {
    s.rounds++; s.len += r.time; add(s.dealt, r.dealt[i]); s.self += r.self[i]; s.stuck += r.stuck[i];
    if (won) { s.w++; s.winTime += r.time; if (r.firstHit[i] != null) { s.ttk += r.time - r.firstHit[i]; s.ttkN++; } }
    else if (lost) { s.l++; if (r.selfKill[i]) s.selfKills++; }
    else { s.d++; if (r.result === 'timeout') s.timeouts++; }
   }
   // Matrix: a mirror match is one cell; its two sides are the same weapon (count once from side 0).
   if (me === them && i === 1) continue;
   const c = M[me][them];
   if (me === them) { c.w += r.result === 'a' ? 1 : 0; c.l += r.result === 'b' ? 1 : 0; c.d += (r.result === 'draw' || r.result === 'timeout') ? 1 : 0; }
   else if (won) c.w++; else if (lost) c.l++; else c.d++;
  }
 }
 const pct = (x, n) => n ? (100 * x / n) : NaN;
 const score = c => pct(c.w + c.d / 2, c.w + c.l + c.d);

 // --- print ---------------------------------------------------------------------------------
 const NAME = { static: 'Static', rifle: 'Nominal', shotgun: 'Ballast', omen: 'Omen', sightline: 'Sightline', sidekick: 'Sidekick', ichor: 'Ichor', sheath: 'Sheath' };
 const pad = (s, n) => String(s).padStart(n), padR = (s, n) => String(s).padEnd(n);
 const f0 = v => Number.isFinite(v) ? v.toFixed(0) : '-', f1 = v => Number.isFinite(v) ? v.toFixed(1) : '-';
 const lines = [];
 lines.push(`duel-matrix: Deadwater, ${cfg.skill} robots (${cfg.style}${cfg.temper !== 'none' ? ', ' + cfg.temper : ''}), spawns: ${cfg.distance === 'duel' ? '1V1 duel circle' : cfg.distance + ' (' + DISTANCES[cfg.distance] + ' m)'}, ${cfg.rounds} rounds per ordered pair, cap ${cfg.cap} s, seed ${cfg.seed}`);
 lines.push(`${results.length} rounds, ${f0(simTime)} s of sim time in ${wall.toFixed(1)} s wall (${cfg.workers} worker${cfg.workers > 1 ? 's' : ''}); draws ${draws} (of which timeouts ${timeouts})`);
 lines.push('');
 lines.push('Win % of ROW vs COLUMN (draws count half; each off-diagonal cell pools ' + (2 * cfg.rounds) + ' rounds)');
 lines.push(padR('', 10) + W.map(w => pad(NAME[w].slice(0, 8), 9)).join('') + pad('overall', 9));
 for (const r of W) {
  const all = cell(); for (const c of W) if (c !== r) { all.w += M[r][c].w; all.l += M[r][c].l; all.d += M[r][c].d; }
  lines.push(padR(NAME[r], 10) + W.map(c => pad(f0(score(M[r][c])), 9)).join('') + pad(f0(score(all)), 9));
 }
 lines.push('');
 lines.push('Per weapon, against the other seven (mirror matches excluded; times in sim seconds)');
 lines.push(padR('weapon', 10) + pad('win%', 6) + pad('W-L-D', 11) + pad('TTK', 6) + pad('winT', 6) + pad('len', 6) + pad('prim%', 7) + pad('E%', 6) + pad('X%', 6) + pad('C%', 6) + pad('selfDmg', 8) + pad('selfKO', 7) + pad('TO', 4));
 const perNoMirror = {};
 for (const w of W) {
  const all = cell(); for (const c of W) if (c !== w) { all.w += M[w][c].w; all.l += M[w][c].l; all.d += M[w][c].d; }
  const s = per[w], tot = s.dealt.P + s.dealt.E + s.dealt.X + s.dealt.C;
  perNoMirror[w] = { winPct: score(all), ...all, ttk: s.ttkN ? s.ttk / s.ttkN : null, winTime: s.w ? s.winTime / s.w : null, roundLength: s.len / s.rounds,
   damageShare: Object.fromEntries(Object.entries(s.dealt).map(([k, v]) => [k, tot ? v / tot : 0])), damageDealt: s.dealt, selfDamage: s.self, selfKills: s.selfKills, timeouts: s.timeouts, rounds: s.rounds, stuckChecks: s.stuck };
  const q = perNoMirror[w];
  lines.push(padR(NAME[w], 10) + pad(f0(q.winPct), 6) + pad(`${all.w}-${all.l}-${all.d}`, 11) + pad(f1(q.ttk), 6) + pad(f1(q.winTime), 6) + pad(f1(q.roundLength), 6)
   + pad(f0(100 * q.damageShare.P), 7) + pad(f0(100 * q.damageShare.E), 6) + pad(f0(100 * q.damageShare.X), 6) + pad(f0(100 * q.damageShare.C), 6) + pad(f0(s.self), 8) + pad(s.selfKills, 7) + pad(s.timeouts, 4));
 }
 lines.push('');
 lines.push('TTK: first hit landed -> kill, in rounds it won. winT: round start -> kill, in rounds it won. len: mean round length, all its rounds.');
 lines.push('prim/E/X/C: share of damage it landed on the enemy (see header of tools/duel-matrix.mjs for what counts as which).');
 lines.push('selfDmg: total damage it did to itself (blasts, Ichor costs); selfKO: losses to its own blast. TO: timeouts.');
 console.log(lines.join('\n'));

 const outDir = join(HERE, 'out'); mkdirSync(outDir, { recursive: true });
 const stamp = new Date().toISOString().replace(/[:.]/g, '-');
 const file = join(outDir, `duel-matrix-${stamp}.json`);
 writeFileSync(file, JSON.stringify({ config: cfg, wallSeconds: wall, simSeconds: simTime, draws, timeouts,
  matrix: Object.fromEntries(W.map(r => [r, Object.fromEntries(W.map(c => [c, { ...M[r][c], winPct: score(M[r][c]) }]))])),
  weapons: perNoMirror, rounds: results }, null, 1));
 console.log('\nJSON: ' + file);
}
