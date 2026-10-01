// Normal robots hold their ground some of the time (owner, 2026-10-01: "Tune
// the base bot from normal difficulty to be less aggressive, so it's not always
// chasing and initiating and should be in cover sometimes or in the open"):
// engagement.js HOLD, robot-profile.js NORMAL_HOLD / COVER_LEAN, the brain's
// `watch` mode. Easy and hard (and the rest) are exactly as before.
// Measured whole with tools/bot-stance.mjs (tools/bot-stance-lib.mjs, used here).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { maps } from '../src/maps.js';
import { BotMatch } from '../src/bots/bot-match.js';
import { makeProfile, SKILL_LEVELS, NORMAL_HOLD } from '../src/bots/robot-profile.js';
import { judge, newEngagement, newSituation, thresholds, HOLD } from '../src/bots/engagement.js';
import { standinRun, summarise, seeded } from '../tools/bot-stance-lib.mjs';

const pf = (skill = 'normal', style = 'balanced') => makeProfile({ skill, style, random: () => .5 });
// A fight in progress: seen at 10 m, both healthy, a rifle's band, against a Static (threat 8).
const fight = patch => Object.assign(newSituation(), { has: true, seen: true, fresh: true, d: 10, near: 8, far: 15, reach: 30, threat: 8, my: 1, their: 1, foes: 1 }, patch);
const run = (e, p, secs, at, from = 0, random = () => .5) => { let t = from; for (; t < from + secs - 1e-9; t += .1) judge(e, at(t), p, t, random); return t; };
// Into a hold: first sight of them out of its band (a normal robot, random .5: it holds).
function holding(patch = {}, p = pf()) {
 const e = newEngagement(() => .5);
 judge(e, fight({ d: 22, ...patch }), p, 0, () => .5);
 assert.equal(e.state, 'hold');
 return e;
}

test('only normal holds; each normal robot its own keenness and lean to cover; the others press as before', () => {
 for (const skill of SKILL_LEVELS) {
  const p = pf(skill), th = thresholds(p);
  if (skill === 'normal') { assert.ok(th.hold > 0 && p.hold === NORMAL_HOLD); assert.ok(p.coverLean >= 0 && p.coverLean <= 1); continue; }
  assert.equal(th.hold, 0, skill); assert.equal(p.hold, undefined, skill); assert.equal(p.coverLean, undefined, skill);
  const a = p.aggr, tech = p.tech;
  assert.equal(th.pressAt, .95 - a * .6 + (1 - tech) * .35, skill + ': press threshold as before');
 }
 // Personality: blends and moods give every normal robot its own numbers.
 const r = seeded(9), list = Array.from({ length: 24 }, () => makeProfile({ skill: 'normal', style: 'blend', temper: 'shifting', random: r }));
 const spread = f => Math.max(...list.map(f)) - Math.min(...list.map(f));
 assert.ok(spread(p => thresholds(p).hold) > .2, 'keenness to hold varies');
 assert.ok(spread(p => p.coverLean) > .25, 'cover or open varies');
 // Bolder (a rusher, or fired up) holds less, and a normal robot wants more edge before it presses.
 assert.ok(thresholds(pf('normal', 'rusher')).hold < thresholds(pf('normal', 'cautious')).hold);
 assert.ok(pf('normal', 'cautious').coverLean > pf('normal', 'rusher').coverLean);
 const n = pf(), base = .95 - n.aggr * .6 + (1 - n.tech) * .35;
 assert.ok(thresholds(n).pressAt > base + .1);
});

test('easy and hard never hold, whatever the fight', () => {
 for (const skill of ['rookie', 'easy', 'hard', 'expert']) {
  const p = pf(skill), e = newEngagement(seeded(3)), r = seeded(4), seen = {};
  for (let t = 0; t < 120; t += .1) {
   const d = 6 + 20 * (.5 + .5 * Math.sin(t * .37)), s = fight({ d, seen: Math.sin(t * .9) > -.6, theirReload: Math.sin(t * 1.3) > .8, hurt: (t % 7) < .3 ? .1 : 9, my: 1 - (t % 40) / 60 });
   seen[judge(e, s, p, t, r)] = 1;
  }
  assert.equal(seen.hold, undefined, skill);
  assert.equal(e.counts.hold, 0);
 }
});

test('a normal robot holds where it would go after them: in cover or in the open, peeking, for a while', () => {
 const p = pf(), th = thresholds(p);
 // Seen out of its band: it lets them come. A rifle against a Static: in the
 // open (its lean, random .5, is to the open); outranged out here: in cover.
 let e = holding();
 assert.equal(e.stance, 'open'); assert.equal(e.phase, null);
 e = holding({ threat: 18 });
 assert.equal(e.stance, 'cover', 'outranged out here: behind cover');
 // Short weapons and blades only ever hold in cover.
 assert.equal(holding({ near: 2, far: 4.8, reach: 7.5 }).stance, 'cover');
 assert.equal(holding({ near: 1, far: 1.7, reach: 17, melee: true }).stance, 'cover');
 // Behind cover it waits, peeks, waits...
 e = holding({ threat: 18 });
 const phases = new Set(); let t = 0;
 for (; t < 30 && e.state === 'hold'; t += .1) { judge(e, fight({ d: 22, threat: 18, seen: e.phase === 'peek' }), p, t, () => .5); if (e.state === 'hold') phases.add(e.phase); }
 assert.deepEqual([...phases].sort(), ['peek', 'wait']);
 // ...and then goes after them again: never a hold for good.
 assert.notEqual(e.state, 'hold');
 assert.ok(t <= HOLD.for[1] * th.holdLen + .5, 'held ' + t.toFixed(1) + ' s');
 // Not another hold straight away.
 assert.ok(e.holdAgain > t);
});

test('holding, it answers being shot, takes its moment, and fights when they come', () => {
 const p = pf();
 // Behind cover and hit, not seeing them (flanked): it goes to find them.
 let e = holding({ threat: 18 });
 run(e, p, .5, () => fight({ d: 22, threat: 18, seen: false }), .1);
 judge(e, fight({ d: 22, threat: 18, seen: false, hurt: .05 }), p, .7, () => .5);
 assert.equal(e.state, 'approach'); assert.equal(e.reason, 'shot');
 // Behind cover and hit while seeing them in its band: it fights back.
 e = holding({ threat: 18 });
 run(e, p, .5, () => fight({ d: 22, threat: 18, seen: false }), .1);
 judge(e, fight({ d: 12, threat: 18, hurt: .05 }), p, .7, () => .5);
 assert.equal(e.state, 'engage');
 // In the open, shot from out of its reach: into cover, still holding.
 e = holding();
 run(e, p, .5, () => fight({ d: 22 }), .1);
 judge(e, fight({ d: 22, hurt: .05 }), p, .7, () => .5);
 assert.equal(e.state, 'hold'); assert.equal(e.stance, 'cover');
 // In the open in its band and trading: it holds its ground and shoots back.
 e = holding();
 run(e, p, .5, () => fight({ d: 14 }), .1);
 judge(e, fight({ d: 14, hurt: .05 }), p, .7, () => .5);
 assert.equal(e.state, 'hold');
 // Their reload with them hurt: its moment to press.
 e = holding();
 judge(e, fight({ d: 14, theirReload: true, their: .3 }), p, 1, () => .5);
 assert.equal(e.state, 'press');
 // They walk up to it: the fight is on.
 e = holding();
 judge(e, fight({ d: 6 }), p, .5, () => .5);
 assert.equal(e.state, 'engage');
 // Hurt badly: it backs off as ever.
 e = holding();
 judge(e, fight({ d: 14, my: .1, hurt: .1 }), p, .5, () => .5);
 assert.equal(e.state, 'disengage'); assert.equal(e.reason, 'hurt');
 // The storm closing on it: no holding there.
 e = holding();
 judge(e, fight({ d: 22, stormNear: true }), p, .5, () => .5);
 assert.equal(e.state, 'approach');
 const f = newEngagement(() => .5);
 judge(f, fight({ d: 22, stormNear: true }), p, 0, () => .5);
 assert.equal(f.state, 'approach', 'never starts a hold by the storm');
});

// Whole robots: the BOTS default (normal, blend, shifting) against a scripted
// Nominal player on each map, seeded (tools/bot-stance-lib.mjs). The big
// picture (tools/bot-stance.mjs, 126 runs and 9 FFA matches): chasing 34% of
// the time -> 28%, in cover 27% -> 35%, in the open 26% -> 23%, presses 4.0 ->
// 2.6 a minute, the player's deaths 2.1 -> 1.7 a minute.
test('normal robots: less chasing and pressing, more time holding in cover and in the open; shot while holding, they answer', () => {
 const runs = [], shots = [];
 for (const [map, weapon, standin] of [['deadwater', 'static', 'hold'], ['hollow-wick', 'omen', 'patrol'], ['lumen', 'sidekick', 'hunter']]) {
  let hp = null, pending = null;
  runs.push(standinRun({ map, weapon, standin, seed: 2, secs: 22, each: (t, bot) => {
   const b = bot.sim.player, eng = bot.brain.eng;
   if (!bot.alive || b.hp <= 0) { hp = null; pending = null; return; }
   // Hit while holding: within 2 s it shoots back, or is out of the hold.
   if (hp != null && b.hp < hp - .01 && eng.state === 'hold' && !pending) pending = { t, dealt: bot.stats.dealt };
   hp = b.hp;
   if (pending) {
    const target = bot.brain.memory.get('you'), answered = eng.state !== 'hold' || bot.stats.dealt > pending.dealt || (bot.brain.mode === 'engage' && target?.visible);
    if (answered || t - pending.t > 2) { shots.push(answered); pending = null; }
   }
  } }));
 }
 const s = summarise(runs), chase = (s.states.approach || 0) + (s.states.press || 0);
 const show = JSON.stringify({ share: s.share, chase, hold: s.states.hold, press: s.pressesPerMin });
 assert.ok(s.share.closing < 28, 'chasing ' + show);
 assert.ok(chase < 20, 'approaching or pressing ' + show);
 assert.ok(s.pressesPerMin < 3, 'presses ' + show);
 assert.ok(s.share.cover > 30, 'holding in cover ' + show);
 assert.ok(s.share.open > 18, 'holding in the open ' + show);
 assert.ok(s.states.hold > 10, 'holds ' + show);
 assert.ok(s.youDeathsPerMin > .5, 'still a real fight ' + show);
 assert.ok(shots.length >= 2, 'shot while holding: ' + shots.length);
 assert.ok(shots.every(Boolean), 'always answered: ' + shots);
});

// Easy and hard are untouched: the same seeded fights as before this change
// (recorded on v0.1.7), number for number.
test('easy and hard robots fight exactly as before', () => {
 const want = {
  easy: { cls: { closing: 112, backing: 174, cover: 222, open: 683 }, states: { seek: 14, approach: 38, engage: 686, disengage: 199, press: 263 }, dealt: 71.79, taken: 17.92 },
  hard: { cls: { closing: 188, backing: 220, cover: 293, open: 286 }, states: { seek: 219, approach: 22, disengage: 585, engage: 93, reset: 173, press: 108 }, dealt: 7.2, taken: 53.64 },
 };
 for (const [skill, map, weapon] of [['easy', 'deadwater', 'rifle'], ['hard', 'hollow-wick', 'static']]) {
  const r = standinRun({ map, weapon, standin: 'hunter', skill, secs: 20, seed: 7 }), w = want[skill];
  for (const k in w.cls) assert.ok(Math.abs(r.watch.cls[k] - w.cls[k]) <= Math.max(3, w.cls[k] * .03), `${skill} ${k}: ${r.watch.cls[k]} (was ${w.cls[k]})`);
  for (const k in w.states) assert.ok(Math.abs((r.watch.states[k] || 0) - w.states[k]) <= Math.max(3, w.states[k] * .03), `${skill} ${k}: ${r.watch.states[k]} (was ${w.states[k]})`);
  assert.equal(r.watch.states.hold, undefined, skill + ' never holds');
  assert.ok(Math.abs(r.dealt - w.dealt) <= Math.max(1, w.dealt * .03) && Math.abs(r.taken - w.taken) <= Math.max(1, w.taken * .03), `${skill} damage ${r.dealt}/${r.taken}`);
 }
});

// A normal robot told to hold, out in the storm: it walks out of it (the
// storm wins over any hold), and holds nowhere near its edge.
test('a holding normal robot still leaves the storm', () => {
 const real = Math.random; Math.random = seeded(31);
 try {
  const map = maps.deadwater, you = new Simulation(map); you.weapon = 'rifle'; you.noTargets = true; you.reset(); you.targets = []; you.player.id = 'you';
  const bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(32) });
  bots.enemyRange = [16, 22];
  const bot = bots.spawn(you, 'rifle', { team: 'red', skill: 'normal', style: 'blend', temper: 'shifting' }), b = bot.sim.player, p = you.player;
  const storm = { x: p.x, z: p.z, r: Math.hypot(b.x - p.x, b.z - p.z) - 5 };
  you.storm = bot.sim.storm = storm;
  const eng = bot.brain.eng; Object.assign(eng, { state: 'hold', stance: 'open', phase: null, until: 1e9, since: 0 });
  let inside = null, heldNearEdge = 0;
  for (let i = 0; i < 6 * 60; i++) {
   bots.before(you); you.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0 }, 1 / 60); bots.after(you); bots.step(you, 1 / 60); bots.drain();
   const d = Math.hypot(b.x - storm.x, b.z - storm.z);
   if (inside == null && d < storm.r - 1) inside = i / 60;
   if (eng.state === 'hold' && d > storm.r - 2) heldNearEdge += 1 / 60;
  }
  assert.ok(inside != null && inside < 4, 'out of the storm in ' + inside);
  assert.ok(heldNearEdge < .3, 'held by the storm\'s edge ' + heldNearEdge.toFixed(2) + ' s');
 } finally { Math.random = real; }
});
