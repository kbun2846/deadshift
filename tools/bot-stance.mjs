#!/usr/bin/env node
// How robots carry themselves in a fight: chasing, holding in cover, holding
// in the open, backing off; how often they start fights; how deadly they are;
// how FFA matches go (owner, 2026-10-01: "Tune the base bot from normal
// difficulty to be less aggressive, so it's not always chasing and initiating
// and should be in cover sometimes or in the open"). See tools/bot-stance-lib.mjs
// for the scenarios and what each number means.
//
//   node tools/bot-stance.mjs [--skill normal] [--maps deadwater,hollow-wick,lumen]
//        [--standins hold,patrol,hunter] [--weapons static,rifle,...] [--runs 1] [--secs 60]
//        [--ffa 2] [--ffa-length 300] [--seed 1] [--workers 2] [--json]
//
// --runs: stand-in runs per map x stand-in x weapon; --ffa: FFA matches per map (0: none).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cpus } from 'node:os';
import { MAPS, STANDINS, BOT_WEAPONS, CLASSES, standinRun, ffaRun, summarise } from './bot-stance-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
function parseArgs(argv) {
 const o = { skill: 'normal', maps: MAPS, standins: STANDINS, weapons: BOT_WEAPONS, runs: 1, secs: 60, ffa: 2, ffaLength: 300, seed: 1, workers: Math.min(4, cpus().length), json: false };
 for (let i = 0; i < argv.length; i++) {
  const a = argv[i], next = () => argv[++i];
  if (a === '--skill') o.skill = next();
  else if (a === '--maps') o.maps = next().split(',');
  else if (a === '--standins') o.standins = next().split(',');
  else if (a === '--weapons') o.weapons = next().split(',');
  else if (a === '--runs') o.runs = Number(next());
  else if (a === '--secs') o.secs = Number(next());
  else if (a === '--ffa') o.ffa = Number(next());
  else if (a === '--ffa-length') o.ffaLength = Number(next());
  else if (a === '--seed') o.seed = Number(next());
  else if (a === '--workers') o.workers = Math.max(1, Number(next()));
  else if (a === '--json') o.json = true;
  else { console.error('unknown argument ' + a); process.exit(2); }
 }
 return o;
}

if (!isMainThread) {
 const { jobs } = workerData;
 for (const job of jobs) parentPort.postMessage(job.kind === 'ffa' ? await ffaRun(job) : standinRun(job));
 parentPort.postMessage({ done: true });
} else {
 const cfg = parseArgs(process.argv.slice(2)), jobs = [];
 for (const map of cfg.maps) {
  for (const standin of cfg.standins) for (const weapon of cfg.weapons) for (let k = 0; k < cfg.runs; k++) jobs.push({ kind: 'standin', map, standin, weapon, skill: cfg.skill, seed: cfg.seed + k, secs: cfg.secs });
  for (let k = 0; k < cfg.ffa; k++) jobs.push({ kind: 'ffa', map, skill: cfg.skill, seed: cfg.seed + k, length: cfg.ffaLength });
 }
 // (The long FFA matches first, so the workers finish together.)
 jobs.sort((a, b) => (b.kind === 'ffa') - (a.kind === 'ffa'));
 const started = Date.now(), results = [], shares = Array.from({ length: cfg.workers }, () => []);
 jobs.forEach((j, i) => shares[i % cfg.workers].push(j));
 await Promise.all(shares.filter(s => s.length).map(share => new Promise((resolve, reject) => {
  const w = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: share } });
  w.on('message', m => { if (m.done) { w.terminate(); resolve(); } else { results.push(m); process.stderr.write(`\r${results.length}/${jobs.length}`); } });
  w.on('error', reject);
 })));
 process.stderr.write('\n');
 const wall = (Date.now() - started) / 1000;
 const f0 = v => Number.isFinite(v) ? v.toFixed(0) : '-', f1 = v => Number.isFinite(v) ? v.toFixed(1) : '-', f2 = v => Number.isFinite(v) ? v.toFixed(2) : '-';
 const pad = (s, n) => String(s).padStart(n), padR = (s, n) => String(s).padEnd(n);
 const lines = [`bot-stance: ${cfg.skill} robots (blend, shifting); stand-in runs ${cfg.runs} x ${cfg.secs} s per map x stand-in x weapon; FFA ${cfg.ffa} x ${cfg.ffaLength} s per map; ${wall.toFixed(0)} s wall`, ''];
 const head = padR('', 22) + CLASSES.map(c => pad(c + '%', 9)).join('') + pad('dist', 6) + pad('enc/m', 7) + pad('init/m', 7) + pad('init%', 6) + pad('press/m', 8) + pad('hold/m', 7) + pad('pDie/m', 7) + pad('rDie/m', 7) + pad('1stHit', 7) + '  states';
 lines.push('STAND-IN (one robot vs a scripted Nominal player; shares of the time it knows where they are)', head);
 const row = (label, s) => lines.push(padR(label, 22) + CLASSES.map(c => pad(f0(s.share[c]), 9)).join('') + pad(f1(s.meanDist), 6) + pad(f2(s.encountersPerMin), 7) + pad(f2(s.initiatedPerMin), 7) + pad(f0(s.initiatedShare), 6) + pad(f2(s.pressesPerMin), 8) + pad(f2(s.holdsPerMin), 7) + pad(f2(s.youDeathsPerMin), 7) + pad(f2(s.botDeathsPerMin), 7) + pad(f1(s.firstHit), 7)
  + '  ' + Object.entries(s.states).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${f0(v)}`).join(', '));
 const sr = results.filter(r => r.kind === 'standin'), out = { config: cfg, wallSeconds: wall, standin: {}, ffa: {} };
 for (const map of cfg.maps) for (const st of cfg.standins) { const s = summarise(sr.filter(r => r.map === map && r.standin === st)); out.standin[map + '/' + st] = s; row(map + ' / ' + st, s); }
 for (const map of cfg.maps) { const s = summarise(sr.filter(r => r.map === map)); out.standin[map] = s; row(map + ' (all)', s); }
 const all = summarise(sr); out.standin.all = all; row('ALL', all);
 lines.push('', 'Per weapon (all maps and stand-ins)', head);
 for (const w of cfg.weapons) { const s = summarise(sr.filter(r => r.weapon === w)); out.standin['weapon/' + w] = s; row(w, s); }
 const fr = results.filter(r => r.kind === 'ffa');
 if (fr.length) {
  lines.push('', 'FFA (BOTS FFA: five robots + a patrolling stand-in; storm and the 45 s respawn cutoff on)',
   padR('map', 14) + pad('ran s', 7) + pad('ended', 7) + pad('1stHit', 7) + pad('1stYou', 7) + pad('quiet', 7) + pad('kills/m', 8) + pad('stormMax', 9) + pad('press/m', 8) + pad('hold/m', 7) + CLASSES.map(c => pad(c + '%', 9)).join(''));
  for (const map of cfg.maps) {
   const rs = fr.filter(r => r.map === map); if (!rs.length) continue;
   const mean = f => rs.reduce((n, r) => n + (f(r) ?? NaN), 0) / rs.length, s = summarise(rs), mins = rs.reduce((n, r) => n + r.ran, 0) / 60;
   const o = { ran: mean(r => r.ran), ended: rs.filter(r => r.over).length, firstHit: mean(r => r.firstHit), firstYou: mean(r => r.firstYou), longestQuiet: Math.max(...rs.map(r => r.longestQuiet)), killsPerMin: rs.reduce((n, r) => n + r.kills + r.youDeaths, 0) / mins, stormMax: Math.max(...rs.flatMap(r => r.storm.map(x => x.max))), ...s };
   out.ffa[map] = o;
   lines.push(padR(map, 14) + pad(f0(o.ran), 7) + pad(o.ended + '/' + rs.length, 7) + pad(f1(o.firstHit), 7) + pad(f1(o.firstYou), 7) + pad(f1(o.longestQuiet), 7) + pad(f2(o.killsPerMin), 8) + pad(f1(o.stormMax), 9) + pad(f2(o.pressesPerMin), 8) + pad(f2(o.holdsPerMin), 7) + CLASSES.map(c => pad(f0(s.share[c]), 9)).join(''));
  }
 }
 lines.push('', 'closing/backing/cover/open: % of the time it knows where its target is (seen in the last 6 s): moving toward / away from them over 2 m/s, else in cover (no line from them, or its cover mode) or in the open.',
  'dist: mean distance while it sees them. enc/m: fights a minute (first damage after 4 s of none); init/m, init%: fights it started. press/m, hold/m: engagement presses and holds a minute.',
  'pDie/m: stand-in deaths a minute (how deadly the robot is); rDie/m: robot deaths. 1stHit: s to the first damage. FFA: ended = over before the clock (one left after the cutoff);',
  'quiet: the longest spell with no damage anywhere (s); kills/m: every kill a minute; stormMax: the longest any robot stood in the storm (s).');
 console.log(lines.join('\n'));
 const dir = join(HERE, 'out'); mkdirSync(dir, { recursive: true });
 const file = join(dir, `bot-stance-${cfg.skill}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
 writeFileSync(file, JSON.stringify(out, null, 1));
 console.log('\nJSON: ' + file);
}
