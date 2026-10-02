#!/usr/bin/env node
// A blade against gun robots (owner, 2026-10-01: "The bots, like when I'm
// using a melee weapon and they're using a ranged weapon, it's like a lot more
// difficult ... make it a little bit more balanced there"). BOTS 1V1 rounds of
// a scripted stand-in player against one BOTS-default robot (normal, blend,
// shifting) per gun; see tools/melee-balance-lib.mjs for the stand-ins and what
// each number means.
//
//   node tools/melee-balance.mjs [--standins ichor,sheath,rifle] [--guns rifle,shotgun,...]
//        [--maps deadwater,hollow-wick,lumen] [--level human|sharp|casual] [--skill normal]
//        [--rounds 6] [--seed 1] [--cap 60] [--workers 2] [--json]
//
// --rounds: rounds per map x stand-in x gun (a new duel circle each).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cpus } from 'node:os';
import { MAPS, GUNS, STANDINS, duelRun, summarise } from './melee-balance-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
function parseArgs(argv) {
 const o = { standins: STANDINS, guns: GUNS, maps: MAPS, level: 'human', skill: 'normal', rounds: 6, seed: 1, cap: 60, workers: Math.min(4, cpus().length), json: false };
 for (let i = 0; i < argv.length; i++) {
  const a = argv[i], next = () => argv[++i];
  if (a === '--standins') o.standins = next().split(',');
  else if (a === '--guns') o.guns = next().split(',');
  else if (a === '--maps') o.maps = next().split(',');
  else if (a === '--level') o.level = next();
  else if (a === '--skill') o.skill = next();
  else if (a === '--rounds') o.rounds = Number(next());
  else if (a === '--seed') o.seed = Number(next());
  else if (a === '--cap') o.cap = Number(next());
  else if (a === '--workers') o.workers = Math.max(1, Number(next()));
  else if (a === '--json') o.json = true;
  else { console.error('unknown argument ' + a); process.exit(2); }
 }
 return o;
}

if (!isMainThread) {
 for (const job of workerData.jobs) parentPort.postMessage(duelRun(job).rounds);
 parentPort.postMessage({ done: true });
} else {
 const cfg = parseArgs(process.argv.slice(2)), jobs = [];
 for (const standin of cfg.standins) for (const weapon of cfg.guns) for (const map of cfg.maps) jobs.push({ standin, weapon, map, level: cfg.level, skill: cfg.skill, rounds: cfg.rounds, seed: cfg.seed, cap: cfg.cap });
 const started = Date.now(), rounds = [], shares = Array.from({ length: cfg.workers }, () => []);
 jobs.forEach((j, i) => shares[i % cfg.workers].push(j));
 let done = 0;
 await Promise.all(shares.filter(s => s.length).map(share => new Promise((resolve, reject) => {
  const w = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: share } });
  w.on('message', m => { if (m.done) { w.terminate(); resolve(); } else { rounds.push(...m); process.stderr.write(`\r${++done}/${jobs.length}`); } });
  w.on('error', reject);
 })));
 process.stderr.write('\n');
 const f0 = v => (Number.isFinite(v) ? v.toFixed(0) : '-'), f1 = v => (Number.isFinite(v) ? v.toFixed(1) : '-');
 const pad = (s, n) => String(s).padStart(n), padR = (s, n) => String(s).padEnd(n);
 const lines = [`melee-balance: ${cfg.level} stand-ins vs one ${cfg.skill} robot (blend, shifting), BOTS 1V1 duel circle; ${cfg.rounds} rounds per map x stand-in x gun; ${((Date.now() - started) / 1000).toFixed(0)} s wall`, ''];
 const head = padR('', 20) + pad('n', 5) + pad('win%', 6) + pad('loss%', 6) + pad('close', 7) + pad('1stHit', 7) + pad('botHit', 7) + pad('closing', 8) + pad('dealt', 6) + pad('taken', 6) + pad('time', 6) + pad('back%', 6) + pad('dodge', 6);
 lines.push(head);
 const out = { config: cfg, rows: {} };
 const row = (label, rs) => { const s = summarise(rs); out.rows[label] = s; lines.push(padR(label, 20) + pad(s.n, 5) + pad(f0(s.win), 6) + pad(f0(s.loss), 6) + pad(f1(s.close), 7) + pad(f1(s.firstHit), 7) + pad(f1(s.botFirstHit), 7) + pad(f1(s.closing), 8) + pad(f0(s.dealt), 6) + pad(f0(s.taken), 6) + pad(f1(s.time), 6) + pad(f0(s.back), 6) + pad(f1(s.dodges), 6)); };
 for (const st of cfg.standins) {
  for (const g of cfg.guns) row(st + ' vs ' + g, rounds.filter(r => r.standin === st && r.weapon === g));
  row(st + ' (all guns)', rounds.filter(r => r.standin === st));
  lines.push('');
 }
 lines.push('win/loss: % of rounds the stand-in / the robot won (the rest: both down, or nobody by the cap). close: s to the blade first within its reach;',
  '1stHit: s to the stand-in\'s first hit on the robot; botHit: the robot\'s first hit on it; closing: damage the stand-in took before its first hit;',
  'dealt/taken: the stand-in\'s damage a round; time: s a round; back%: of the time within 9 m, the robot pushing away from it (over half a stick) or dodging away; dodge: robot dodges a round.');
 console.log(lines.join('\n'));
 const dir = join(HERE, 'out'); mkdirSync(dir, { recursive: true });
 const file = join(dir, `melee-balance-${cfg.level}-${cfg.skill}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
 writeFileSync(file, JSON.stringify(cfg.json ? { ...out, rounds } : out, null, 1));
 console.log('\nJSON: ' + file);
}
