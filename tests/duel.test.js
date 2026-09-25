import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { maps } from '../src/maps.js';
import { BotMatch } from '../src/bots/bot-match.js';
import { makeProfile, stepMood, applyMood, SKILLS, SKILL_LEVELS, TEMPERS, moodName } from '../src/bots/robot-profile.js';
import { duelParam, readDuel, DuelScore, DUEL_DEFAULTS, createDuel, DUEL_ENEMY_RANGE } from '../src/duel.js';
import { readDuelChoices, DUEL_ROWS } from '../src/ui/duel-menu.js';

const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('VS ROBOTS choices survive the URL and bad values fall back', () => {
 const cfg = { ...DUEL_DEFAULTS, mode: '3v3', botWeapon: 'shotgun', skill: 'expert', aim: 'sharper', temper: 'calm', firstTo: 10, friendlyFire: 'off', allyWeapon: 'rifle', allySkill: 'rookie', allyAim: 'sloppier', allyTemper: 'aggressive' };
 assert.deepEqual(readDuel(duelParam(cfg)), cfg);
 assert.deepEqual(readDuel(duelParam({ ...cfg, botWeapon: null })), { ...cfg, botWeapon: null });
 // The v132 dotted form is still read (as a 1V1).
 assert.deepEqual(readDuel('shotgun.expert.sharper.calm.10'), { ...DUEL_DEFAULTS, botWeapon: 'shotgun', skill: 'expert', aim: 'sharper', temper: 'calm', firstTo: 10 });
 assert.deepEqual(readDuel('laser.godlike.x.y.7'), { ...DUEL_DEFAULTS });
 assert.equal(readDuel(null), null);
});

test('first to N ends it once, endless never does', () => {
 const s = new DuelScore(3);
 assert.equal(s.point('you'), null); s.point('robot'); s.point('you');
 assert.equal(s.point('you'), 'you'); assert.equal(s.point('robot'), 'you'); assert.equal(s.robot, 1);
 const e = new DuelScore(0); for (let i = 0; i < 50; i++) e.point('robot'); assert.equal(e.winner, null);
});

test('skill runs rookie to perfect, each better than the last', () => {
 assert.deepEqual(SKILL_LEVELS, ['rookie', 'easy', 'normal', 'hard', 'expert', 'perfect']);
 for (let i = 1; i < SKILL_LEVELS.length; i++) {
  const a = SKILLS[SKILL_LEVELS[i - 1]], b = SKILLS[SKILL_LEVELS[i]];
  assert.ok(b.aim < a.aim && b.miss < a.miss && b.reaction[0] < a.reaction[0] && b.tech >= a.tech && b.turn > a.turn, SKILL_LEVELS[i]);
 }
 assert.ok(SKILLS.expert.miss > 0, 'nobody is a dead shot');
});

test('a blend mixes styles; a temper gives a mood that shifts and leans the style', () => {
 const random = seeded(3);
 const blend = makeProfile({ skill: 'normal', style: 'blend', random });
 assert.equal(blend.style, 'blend'); assert.ok(Object.keys(blend.blend).length >= 2);
 assert.ok(Math.abs(Object.values(blend.blend).reduce((a, b) => a + b, 0) - 1) < .03);
 assert.equal(blend.temper, undefined, 'no temper, no mood');
 const pf = makeProfile({ skill: 'normal', style: 'blend', temper: 'shifting', random });
 const moods = [];
 for (let t = 0; t < 240; t += .1) { stepMood(pf, .1, { own: 1, their: null, random }); moods.push(pf.mood); }
 assert.ok(Math.max(...moods) - Math.min(...moods) > .5, 'it shifts over four minutes');
 // Fired up is bolder, closer, hides later than calm.
 pf.mood = .9; applyMood(pf); const hot = { aggr: pf.aggr, range: pf.range, hurtAt: pf.hurtAt };
 pf.mood = -.9; applyMood(pf);
 assert.ok(hot.aggr > pf.aggr && hot.range < pf.range && hot.hurtAt > 0 && hot.hurtAt < pf.hurtAt);
 assert.equal(moodName(.8), 'aggressive'); assert.equal(moodName(-.8), 'calm');
 // Calm rests calmer than aggressive on average; being hurt cools it.
 const mean = temper => { const p = makeProfile({ temper, style: 'blend', random: seeded(11) }); let sum = 0; for (let i = 0; i < 3000; i++) { stepMood(p, .1, { random: seeded(i + 1) }); sum += p.mood; } return sum / 3000; };
 assert.ok(mean('calm') < mean('aggressive'));
 const hurt = makeProfile({ temper: 'aggressive', style: 'blend', random: seeded(5) });
 for (let i = 0; i < 100; i++) stepMood(hurt, .1, { own: .05, random: () => .5 });
 assert.ok(hurt.mood < TEMPERS.aggressive.centre);
});

test('a 1V1 has one robot as asked, no targets, and scores both ways', () => {
 const el = () => ({ hidden: false, className: '', innerHTML: '', textContent: '', classList: { add() {}, remove() {}, contains: () => true, toggle() {} }, setAttribute() {}, append() {}, querySelector: () => el(), focus() {} });
 const previous = globalThis.document; globalThis.document = { createElement: el };
 try {
  const map = maps.deadwater, sim = new Simulation(map), bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(9) });
  const duel = createDuel(el(), { sim, bots, random: seeded(2) });
  const bot = duel.begin({ botWeapon: 'rifle', skill: 'hard', aim: 'sharper', temper: 'aggressive', firstTo: 2 });
  assert.equal(bots.count, 1); assert.equal(bot.sim.weapon, 'rifle'); assert.equal(bot.profile.skill, 'hard'); assert.equal(bot.profile.temper, 'aggressive'); assert.equal(bot.profile.style, 'blend');
  assert.equal(bot.aim, .7); assert.deepEqual(bots.enemyRange, [...DUEL_ENEMY_RANGE]);
  assert.equal(sim.targets.length, 0); sim.reset(); assert.equal(sim.targets.length, 0, 'targets stay away on restart');
  const d = Math.hypot(bot.sim.player.x - sim.player.x, bot.sim.player.z - sim.player.z); assert.ok(d >= DUEL_ENEMY_RANGE[0] - 1, 'comes in away from you');
  bot.alive = false; duel.frame(.016); assert.equal(duel.score.you, 1);
  bot.alive = true; duel.frame(.016);
  assert.equal(duel.playerDied(), false); assert.equal(duel.score.robot, 1);
  bot.alive = false; duel.frame(.016); assert.equal(duel.over, true); assert.equal(duel.score.winner, 'you');
  duel.reset(); assert.equal(duel.score.you, 0); assert.equal(duel.over, false);
  duel.stop(); sim.reset(); assert.ok(sim.targets.length > 0, 'targets back after leaving'); assert.deepEqual(bots.enemyRange, [22, 60]);
 } finally { globalThis.document = previous; }
});

test('the 1V1 page remembers sane choices only', () => {
 const store = v => ({ getItem: () => v, setItem() {} });
 assert.equal(readDuelChoices(store('{"weapon":"shotgun","botWeapon":"static","skill":"rookie","firstTo":3}')).skill, 'rookie');
 const bad = readDuelChoices(store('{"weapon":"x","skill":"god","firstTo":99,"aim":"??"}'));
 assert.equal(bad.skill, 'normal'); assert.equal(bad.firstTo, 5); assert.equal(bad.aim, 'even'); assert.equal(bad.botWeapon, null);
 assert.deepEqual(readDuelChoices(store('not json')).temper, 'shifting');
 for (const r of DUEL_ROWS) for (const [v] of r.choices) if (!['firstTo', 'spawn', 'friendlyFire'].includes(r.key)) assert.ok(r.notes[v], r.key + ' ' + v + ' has a note');
 assert.ok(Object.values(DUEL_ROWS.find(r => r.key === 'skill').notes).every(n => n.split(/[ ,]+/).filter(Boolean).length === 2), 'two words a skill');
});

test('VS ROBOTS 2V2 / 3V3: your robots and theirs as asked, friendly fire at half, points for each side', () => {
 const el = () => ({ hidden: false, className: '', innerHTML: '', textContent: '', classList: { add() {}, remove() {}, contains: () => true, toggle() {} }, setAttribute() {}, append() {}, querySelector: () => el(), focus() {} });
 const previous = globalThis.document; globalThis.document = { createElement: el };
 try {
  for (const [mode, allies, enemies] of [['2v2', 1, 2], ['3v3', 2, 3]]) {
   const map = maps.deadwater, sim = new Simulation(map), bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(4) });
   const duel = createDuel(el(), { sim, bots, random: seeded(5) });
   duel.begin({ mode, firstTo: 3, friendlyFire: 'on', botWeapon: 'shotgun', skill: 'hard', allyWeapon: 'rifle', allySkill: 'rookie', allyTemper: 'calm' });
   const blue = bots.bots.filter(b => b.team === 'blue'), red = bots.bots.filter(b => b.team === 'red');
   assert.equal(blue.length, allies); assert.equal(red.length, enemies);
   assert.ok(blue.every(b => b.sim.weapon === 'rifle' && b.profile.skill === 'rookie' && b.profile.temper === 'calm'));
   assert.ok(red.every(b => b.sim.weapon === 'shotgun' && b.profile.skill === 'hard'));
   assert.equal(bots.friendlyFire, .5);
   blue[0].alive = false; duel.frame(.016); assert.equal(duel.score.robot, 1, 'your robot down: their point');
   red[0].alive = false; duel.frame(.016); assert.equal(duel.score.you, 1, 'an enemy down: yours');
   duel.stop(); assert.equal(bots.friendlyFire, 0);
  }
 } finally { globalThis.document = previous; }
});
