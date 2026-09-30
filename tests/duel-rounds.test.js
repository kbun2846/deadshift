// VS ROBOTS under the rounds rules (owner, 2026-09-29): DuelScore counts
// rounds (draws too) and ends by roundsDecided; forfeit; the URL keeps
// rounds 0/3/5/10 and the new 4V4 mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { maps } from '../src/maps.js';
import { BotMatch } from '../src/bots/bot-match.js';
import { duelParam, readDuel, DuelScore, DuelScore as Score, DUEL_DEFAULTS, DUEL_MODES, DUEL_ROUNDS, DUEL_BREAK_1V1, DUEL_ROUND_BREAK, createDuel } from '../src/duel.js';

const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('DuelScore: 3 rounds, 2-0 is over after two; 1-1 is not', () => {
 const two = new DuelScore(3);
 assert.equal(two.point('you'), null); assert.equal(two.played, 1);
 assert.equal(two.point('you'), 'you'); assert.equal(two.played, 2); assert.equal(two.winner, 'you');
 assert.equal(two.point('robot'), 'you', 'once over it stays over'); assert.equal(two.robot, 0); assert.equal(two.played, 2);
 const level = new DuelScore(3);
 level.point('you'); assert.equal(level.point('robot'), null, '1-1 after two: one to play');
 assert.equal(level.point('robot'), 'robot'); assert.equal(level.played, 3);
});

test('DuelScore: a draw round is played and scores nothing; a tie after the last plays on', () => {
 const s = new DuelScore(3);
 s.point('you'); s.point(null);
 assert.deepEqual([s.you, s.robot, s.played, s.winner], [1, 0, 2, null]);
 assert.equal(s.point('robot'), null, '1-1 after three (one a draw): sudden death'); assert.equal(s.played, 3);
 assert.equal(s.point(null), null, 'a drawn sudden-death round changes nothing'); assert.equal(s.played, 4);
 assert.equal(s.point('you'), 'you'); assert.equal(s.played, 5); assert.equal(s.you, 2);
 s.reset(); assert.deepEqual([s.you, s.robot, s.played, s.winner], [0, 0, 0, null]);
});

test('DuelScore: 5 rounds 3-0 is over, 10 rounds not before 6-0, endless never', () => {
 const five = new DuelScore(5); five.point('robot'); five.point('robot'); assert.equal(five.winner, null); five.point('robot'); assert.equal(five.winner, 'robot');
 const ten = new DuelScore(10); for (let i = 0; i < 5; i++) ten.point('you'); assert.equal(ten.winner, null); ten.point('you'); assert.equal(ten.winner, 'you');
 const endless = new DuelScore(0); for (let i = 0; i < 40; i++) endless.point(i % 5 ? 'you' : null); assert.equal(endless.winner, null); assert.equal(endless.played, 40);
 assert.equal(new DuelScore().rounds, 5, 'five by default'); assert.equal(new DuelScore(3).firstTo, 3, 'firstTo still reads the rounds');
});

test('DuelScore: forfeit gives the other side the match, once', () => {
 const s = new DuelScore(5);
 assert.equal(s.forfeit('you'), 'robot'); assert.equal(s.winner, 'robot');
 assert.equal(s.point('you'), 'robot', 'a point after the end changes nothing');
 const t = new DuelScore(5); t.point('you'); t.point('you');
 assert.equal(t.forfeit('robot'), 'you'); assert.equal(new DuelScore(3).forfeit(), 'robot', 'you by default');
 const done = new DuelScore(3); done.point('you'); done.point('you');
 assert.equal(done.forfeit('you'), 'you', 'too late: the win stands');
});

test('the rounds and the 4V4 mode survive the URL; the old first-to values are still read; bad values fall back', () => {
 assert.deepEqual([...DUEL_ROUNDS], [3, 5, 10, 0]);
 for (const firstTo of [0, 3, 5, 10]) for (const mode of ['1v1', '2v2', '3v3', '4v4']) {
  const cfg = { ...DUEL_DEFAULTS, mode, firstTo, botWeapon: 'rifle', friendlyFire: 'off' };
  assert.deepEqual(readDuel(duelParam(cfg)), cfg, mode + ' rounds ' + firstTo);
 }
 assert.equal(readDuel('4v4~0~on~random~normal~even~shifting~random~normal~even~shifting~scattered').mode, '4v4');
 assert.equal(readDuel('4v4~0~on~random~normal~even~shifting~random~normal~even~shifting~scattered').firstTo, 0);
 assert.equal(readDuel('1v1~7~on').firstTo, DUEL_DEFAULTS.firstTo, 'seven rounds is not a choice');
 assert.equal(readDuel('5v5~3~on').mode, DUEL_DEFAULTS.mode);
 assert.deepEqual(DUEL_MODES['4v4'], { name: '4V4', allies: 3, enemies: 4 });
 assert.equal(Score, DuelScore);
});

const el = () => ({ hidden: false, className: '', innerHTML: '', textContent: '', classList: { add() {}, remove() {}, contains: () => true, toggle() {} }, setAttribute() {}, append() {}, querySelector: () => el(), focus() {} });

test('VS ROBOTS 4V4: three robots with you against four, a draw is a played round, forfeit ends it', () => {
 const previous = globalThis.document; globalThis.document = { createElement: el };
 try {
  const map = maps.deadwater, sim = new Simulation(map), bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(4) });
  const wins = []; let cards = 0;
  const duel = createDuel(el(), { sim, bots, random: seeded(5), hooks: { pointWon: side => wins.push(side), over: () => { cards++; } } });
  duel.begin({ mode: '4v4', firstTo: 3 });
  assert.equal(bots.bots.filter(b => b.team === 'blue').length, 3); assert.equal(bots.bots.filter(b => b.team === 'red').length, 4);
  const red = bots.bots.filter(b => b.team === 'red'), blue = bots.bots.filter(b => b.team === 'blue');
  // Everyone down together: a draw, played, nobody's point; the break is the team modes' one.
  for (const b of bots.bots) b.alive = false;
  duel.frame(.016, false);
  assert.equal(duel.score.played, 1); assert.equal(duel.score.you, 0); assert.equal(duel.score.robot, 0); assert.deepEqual(wins, [null]);
  assert.ok(Math.abs(duel.pointBreak.left - DUEL_ROUND_BREAK) < .1); assert.equal(duel.pointBreak.side, null);
  duel.frame(DUEL_ROUND_BREAK);
  for (const b of bots.bots) b.alive = true;
  // Their side out: your point, again: 2-0 after two of three is not over (a draw used a round: 1 left).
  for (const b of red) b.alive = false; duel.frame(.016); assert.equal(duel.score.you, 1); duel.frame(DUEL_ROUND_BREAK);
  for (const b of red) b.alive = true;
  for (const b of red) b.alive = false; duel.frame(.016);
  assert.equal(duel.score.you, 2); assert.equal(duel.score.played, 3);
  assert.equal(duel.over, true, '2-0 after three rounds, one of them a draw');
  duel.frame(2); assert.equal(cards, 1);
  duel.reset(); assert.equal(duel.score.played, 0); assert.equal(duel.over, false);
  // FORFEIT: the enemies take the match and the card goes up at once.
  duel.forfeit();
  assert.equal(duel.score.winner, 'robot'); assert.equal(duel.over, true); assert.equal(duel.resultOpen === true || cards === 2, true);
  assert.equal(cards, 2);
  assert.equal(blue.length, 3);
  duel.stop();
 } finally { globalThis.document = previous; }
});

test('VS ROBOTS 1V1: a break of 5.6 s, the team modes\' five', () => {
 assert.equal(DUEL_BREAK_1V1, 5.6); assert.equal(DUEL_ROUND_BREAK, 5);
 const previous = globalThis.document; globalThis.document = { createElement: el };
 try {
  const map = maps.deadwater, sim = new Simulation(map), bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(9) });
  const duel = createDuel(el(), { sim, bots, random: seeded(2) });
  const bot = duel.begin({ firstTo: 5 });
  bot.alive = false; duel.frame(.016);
  assert.ok(Math.abs(duel.pointBreak.left - DUEL_BREAK_1V1) < .1);
  duel.frame(DUEL_ROUND_BREAK); assert.ok(duel.pointBreak, 'five seconds is not enough in a 1V1');
  duel.frame(.7); assert.equal(duel.pointBreak, null);
  duel.stop();
 } finally { globalThis.document = previous; }
});

// Owner, 2026-09-29: "the game stops at 9 in the scoreboard and ui points
// because it doesn't count the last point won": the deciding point shows at
// once on the top score and its segments (1V1 held it for a break that never comes).
test('VS ROBOTS: the deciding point shows on the top score at once (1V1 and team modes)', () => {
 const previous = globalThis.document; globalThis.document = { createElement: el };
 try {
  for (const mode of ['1v1', '2v2']) {
   const map = maps.deadwater, sim = new Simulation(map), bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(4) });
   let top = null; const parent = { ...el(), append: e => { top = e; } };
   const duel = createDuel(parent, { sim, bots, random: seeded(5) });
   duel.begin({ mode, firstTo: 3 });
   const red = bots.bots.filter(b => b.team === 'red'), shown = () => [...top.innerHTML.matchAll(/<b>(.*?)<\/b>/g)][0][1], pips = () => (top.innerHTML.match(/class="won"/g) || []).length;
   for (const b of red) b.alive = false; duel.frame(.016); duel.frame(10); for (const b of red) b.alive = true; duel.frame(.016);
   for (const b of red) b.alive = false; duel.frame(.016);
   assert.equal(duel.over, true, mode);
   assert.match(shown(), /2/, mode + ': the 2 is on the top score'); assert.doesNotMatch(shown().replace(/.*<i>|<\/i>.*/g, ''), /^1$/, mode);
   assert.equal(pips(), 2, mode + ': both segments filled');
   duel.stop();
  }
 } finally { globalThis.document = previous; }
});
