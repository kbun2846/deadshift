// Gun robots against a person with a blade (owner, 2026-10-01: "The bots, like
// when I'm using a melee weapon and they're using a ranged weapon, it's like a
// lot more difficult ... make it a little bit more balanced there"):
// robot-brain.js VS_BLADE (bladeSlack, bladeNerve, the dash shock). Measured
// whole with tools/melee-balance.mjs (tools/melee-balance-lib.mjs, used here).
import test from 'node:test';
import assert from 'node:assert/strict';
import { RobotBrain, VS_BLADE } from '../src/bots/robot-brain.js';
import { makeProfile, SKILL_LEVELS } from '../src/bots/robot-profile.js';
import { duelRun, summarise } from '../tools/melee-balance-lib.mjs';

const slackOf = (skill, weapon = 'rifle', target = { human: true, weapon: 'ichor' }) =>
 RobotBrain.prototype.bladeSlack.call({ sim: { weapon }, pf: makeProfile({ skill, style: 'balanced', random: () => .5 }) }, target);

test('only a gun robot facing a person with a blade is caught out, easy most, normal about half, hard and up not at all', () => {
 const s = Object.fromEntries(SKILL_LEVELS.map(k => [k, slackOf(k)]));
 assert.ok(s.rookie >= s.easy && s.easy > .9, JSON.stringify(s));
 assert.ok(s.normal > .4 && s.normal < .6, JSON.stringify(s));
 for (const k of ['hard', 'expert', 'perfect']) assert.equal(s[k], 0, k);
 assert.ok(slackOf('normal', 'shotgun', { human: true, weapon: 'sheath' }) > .4, 'Ballast against Sheath too');
 assert.equal(slackOf('normal', 'rifle', { human: false, weapon: 'ichor' }), 0, 'a robot with a blade: as before');
 assert.equal(slackOf('normal', 'rifle', { human: true, weapon: 'rifle' }), 0, 'a person with a gun: as before');
 assert.equal(slackOf('normal', 'ichor', { human: true, weapon: 'sheath' }), 0, 'a blade against a blade: as before');
 assert.equal(slackOf('easy', 'rifle', null), 0);
});

// Unchanged: hard and expert against a blade, and normal against a person
// with a gun, play the same seeded rounds as before this change (recorded on
// the build before it), number for number.
test('hard robots against a blade, and any robot against a gun, fight exactly as before', () => {
 const want = {
  hard: [{ w: 'bot', t: 11.883, d: 13.76, k: 162.83 }],
  // (Re-recorded 2026-10-01 after Lumen's emptier streets moved its cover: was t 8.017, d 100.)
  expert: [{ w: 'you', t: 6.267, d: 107.6, k: 84 }],
  gun: [{ w: 'you', t: 21.25, d: 103, k: 52.37 }],
 };
 const got = {
  hard: duelRun({ map: 'deadwater', weapon: 'shotgun', standin: 'ichor', skill: 'hard', rounds: 1, seed: 3 }),
  expert: duelRun({ map: 'lumen', weapon: 'rifle', standin: 'sheath', skill: 'expert', rounds: 1, seed: 3 }),
  gun: duelRun({ map: 'hollow-wick', weapon: 'static', standin: 'rifle', rounds: 1, seed: 3 }),
 };
 for (const k in want) {
  const r = got[k].rounds.map(x => ({ w: x.winner, t: +x.time.toFixed(3), d: +x.dealt.toFixed(2), k: +x.taken.toFixed(2) }));
  assert.deepEqual(r, want[k], k);
 }
});

// The whole picture (tools/melee-balance.mjs, 30 rounds a cell, human-level
// stand-ins): normal robots backed off from a blade 50-57% of the time it was
// within 9 m, now 44-46% (easy 57-59% -> 26-27%, hard unchanged); a blade
// takes a little less on the way in and Ballast stops being a near-certain
// loss. Here a small seeded sample: easy backs off least, then normal, then
// hard; a dash at a robot holds its trigger; normal robots still win some.
test('against a blade: easy backs off least, hard most; a dash at it holds its trigger; normal still wins some', () => {
 const out = {};
 for (const skill of ['easy', 'normal', 'hard']) {
  const rs = []; let flinches = 0, shotsInFlinch = 0;
  for (const weapon of ['rifle', 'shotgun']) for (const map of ['deadwater', 'hollow-wick']) {
   let ammo = null, seen = -1;
   rs.push(...duelRun({ map, weapon, standin: 'ichor', skill, rounds: 2, seed: 5, each: (t, bot) => {
    const b = bot.brain; if (b.dashWait !== seen && b.dashWait > b.time) { flinches++; seen = b.dashWait; }
    const a = weapon === 'rifle' ? bot.sim.rifle.ammo : bot.sim.shotgun.ammo;
    if (ammo != null && a < ammo && b.time < (b.dashWait ?? -1)) shotsInFlinch++;
    ammo = a;
   } }).rounds);
  }
  out[skill] = { ...summarise(rs), flinches, shotsInFlinch };
 }
 const show = JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, s]) => [k, { win: s.win, back: +s.back.toFixed(1), flinches: s.flinches, shots: s.shotsInFlinch }])));
 assert.ok(out.easy.back < out.normal.back - 5 && out.normal.back < out.hard.back - 5, 'backing off ' + show);
 assert.equal(out.hard.flinches, 0, 'hard: no dash shock ' + show);
 assert.ok(out.normal.flinches >= 5 && out.easy.flinches >= 5, 'dashes seen ' + show);
 assert.ok(out.normal.shotsInFlinch <= out.normal.flinches * .1, 'holds its trigger after a dash ' + show);
 assert.ok(out.normal.loss > 15, 'normal still wins some rounds ' + show);
 assert.ok(out.normal.win >= out.hard.win, 'normal no harder than hard ' + show);
 assert.ok(VS_BLADE.backSlow < 1 && VS_BLADE.stand < 1, 'never all the way');
});
