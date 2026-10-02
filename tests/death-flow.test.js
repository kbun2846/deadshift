// Task B (competitive overhaul, 2026-09-29): the death flow. The cards per
// mode, 1V1's aftermath (the killer's camera, the score held and turned over),
// and the causes of "sometimes the death menu doesn't show".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation } from '../src/simulation.js';
import { maps } from '../src/maps.js';
import { BotMatch } from '../src/bots/bot-match.js';
import { createDuel, DUEL_BREAK_1V1, AFTERMATH } from '../src/duel.js';
import { DEATH_BUTTONS, COUNTDOWN_MODES, DEATH_MENU_DELAY } from '../src/ui/death-screen.js';
import { killCamFrame, DEATH_ZOOM } from '../src/effects/death-view.js';
import { DUEL_BREAK } from '../src/net/arena.js';

const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const el = () => ({ hidden: false, className: '', innerHTML: '', textContent: '', classList: { add() {}, remove() {}, contains: () => true, toggle() {} }, setAttribute() {}, append() {}, querySelector: () => el(), focus() {} });
function withDuel(settings, body) {
 const previous = globalThis.document; globalThis.document = { createElement: el };
 try {
  const map = maps.deadwater, sim = new Simulation(map), bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(9) });
  const calls = { over: [], newRound: 0, pointWon: [] };
  const duel = createDuel(el(), { sim, bots, random: seeded(2), hooks: { over: o => calls.over.push(o), newRound: () => calls.newRound++, pointWon: s => calls.pointWon.push(s) } });
  duel.begin(settings);
  body({ duel, bots, sim, calls });
 } finally { globalThis.document = previous; }
}

test('each mode has its own buttons: no CHANGE WEAPON in counted modes, FORFEIT only where rounds are played', () => {
 assert.deepEqual(DEATH_BUTTONS.duel, ['death-forfeit', 'death-menu']);
 assert.deepEqual(DEATH_BUTTONS.team, ['death-stats', 'death-forfeit', 'death-menu']);
 assert.deepEqual(DEATH_BUTTONS.ffa, ['death-menu']);
 for (const mode of ['duel', 'team', 'ffa']) assert.ok(!DEATH_BUTTONS[mode].includes('death-change-weapon') && !DEATH_BUTTONS[mode].includes('death-respawn-now'), mode);
 // Practice (solo and online): CHANGE WEAPON gave way to the NEXT LIFE row
 // (2026-10-02, tests/death-card.test.js), in every card with a respawn.
 assert.deepEqual(DEATH_BUTTONS.practice, ['death-respawn-now', 'death-restart', 'death-menu']);
 assert.deepEqual(DEATH_BUTTONS['online-practice'], ['death-respawn-now', 'death-lobby', 'death-menu']);
 assert.deepEqual([...COUNTDOWN_MODES].sort(), ['ffa', 'practice']);
});

test('1V1 timing: a 3 s aftermath, the card a bit before it ends, both back together ~5.6 s after the kill', () => {
 assert.equal(AFTERMATH, 3);
 assert.ok(DEATH_MENU_DELAY < AFTERMATH && DEATH_MENU_DELAY > 2, 'the card pops up as the aftermath is about to end');
 assert.equal(DUEL_BREAK_1V1, DUEL_BREAK, 'SOLO and online agree');
 assert.ok(DUEL_BREAK - DEATH_MENU_DELAY >= 2 && DUEL_BREAK - DEATH_MENU_DELAY <= 3.2, '2-3 s of the death card');
});

test('a finished SOLO match left behind no longer holds practice\'s death screen (bug: "sometimes the death menu doesn\'t show")', () => {
 withDuel({ mode: '1v1', firstTo: 3 }, ({ duel, calls }) => {
  duel.forfeit();
  assert.equal(duel.over, true); assert.equal(duel.resultOpen, true);
  assert.equal(calls.over.length, 1); assert.equal(calls.over[0].winner, 'robot'); assert.equal(calls.over[0].forfeited, true);
  // Back to the menu (main.js returnToMenu: duel.stop, then reset, which is a
  // no-op once stopped): the old winner stayed and `over` gated the practice
  // death screen and its respawn for good.
  duel.stop(); duel.reset();
  assert.equal(duel.over, false); assert.equal(duel.resultOpen, false); assert.equal(duel.score.winner, null);
 });
});

test('1V1: the one who fell sees the top score keep the old number through the break and turn over as both come back; the winner sees theirs turn over at once', () => {
 // You take the round (owner, 2026-09-29: no stats panel for the winner; the
 // top score turns over right then).
 withDuel({ mode: '1v1', firstTo: 5 }, ({ duel, calls }) => {
  const bot = duel.bot;
  bot.alive = false; duel.frame(.016);
  assert.deepEqual(calls.pointWon, ['you']); assert.equal(duel.score.you, 1);
  assert.equal(duel.before, null, 'nothing held for the winner');
  assert.match(duel.scoreElement.innerHTML, /score-roll-old">0<\/i><i class="score-roll-new">1</, 'turned over at once');
 });
 // The robot takes it (you fell): held till both are back.
 withDuel({ mode: '1v1', firstTo: 5 }, ({ duel, calls }) => {
  duel.frame(.016, false);
  assert.deepEqual(calls.pointWon, ['robot']); assert.equal(duel.score.robot, 1);
  assert.deepEqual(duel.before, { you: 0, robot: 0 });
  assert.match(duel.scoreElement.innerHTML, /duel-robot"><b>0<\/b>/i, 'held at the old score during the break');
  assert.doesNotMatch(duel.scoreElement.innerHTML, /score-roll/);
  duel.frame(DUEL_BREAK_1V1 - 1); assert.equal(calls.newRound, 0);
  duel.frame(1.1); assert.equal(calls.newRound, 1, 'both back after DUEL_BREAK_1V1');
  assert.match(duel.scoreElement.innerHTML, /score-roll-old">0<\/i><i class="score-roll-new">1</);
  assert.equal(duel.before, null);
 });
 // Team modes: the top score moves at once (the big score flash plays there).
 withDuel({ mode: '2v2', firstTo: 5 }, ({ duel, bots }) => {
  for (const b of bots.bots.filter(b => b.team === 'red')) b.alive = false;
  duel.frame(.016); assert.equal(duel.before, null); assert.match(duel.scoreElement.innerHTML, /<b>1<\/b>/);
 });
});

test('the last kill of a 1V1 plays its aftermath, then the card; nothing is counted after (no new round under it)', () => {
 withDuel({ mode: '1v1', firstTo: 3 }, ({ duel, calls }) => {
  const bot = duel.bot;
  for (let round = 0; round < 2; round++) { bot.alive = false; duel.frame(.016); if (round < 1) { duel.frame(DUEL_BREAK_1V1 + .1); bot.alive = true; duel.frame(.016); } }
  assert.equal(duel.over, true); assert.ok(duel.finalBreak && Math.abs(duel.finalBreak.left - AFTERMATH) < .02);
  duel.frame(AFTERMATH - .1); assert.equal(calls.over.length, 0);
  duel.frame(.2); assert.equal(calls.over.length, 1); assert.deepEqual({ winner: calls.over[0].winner, you: calls.over[0].you }, { winner: 'you', you: 2 });
  const rounds = calls.newRound;
  for (let i = 0; i < 10; i++) duel.frame(1);
  assert.equal(calls.newRound, rounds, 'no round starts under the end card');
  assert.equal(calls.pointWon.length, 2, 'the last point is not scored again');
 });
});

test('the killer\'s camera eases onto the body and zooms in like your own death, allocating nothing', () => {
 const a = { x: 10, z: -4, fromX: 0, fromZ: 0, fromHeight: 29 }, out = { x: 0, z: 0, height: 0 };
 assert.equal(killCamFrame(a, 0, out), out);
 assert.deepEqual(out, { x: 0, z: 0, height: 29 });
 killCamFrame(a, DEATH_ZOOM / 2, out); assert.ok(out.x > 0 && out.x < 10 && out.height < 29 && out.height > 29 * .56);
 killCamFrame(a, DEATH_ZOOM + 3, out); assert.deepEqual({ x: out.x, z: out.z }, { x: 10, z: -4 }); assert.ok(Math.abs(out.height - 29 * .56) < 1e-9);
});

test('main.js: a respawn is taken before the frame is drawn; the tutorial alone hides CHANGE WEAPON', () => {
 const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
 const respawn = main.indexOf('online.frame({onRespawn:reviveOnline})'), draw = main.indexOf('view.update(drawn');
 assert.ok(respawn > 0 && draw > 0 && respawn < draw, 'online.frame runs before view.update');
 assert.equal(main.match(/online\.frame\(/g).length, 1);
 assert.doesNotMatch(main, /\$\('death-change-weapon'\)\.hidden=!online\.active/, 'the old line un-hid CHANGE WEAPON in every mode');
 // The card for a death whose event never arrived online.
 assert.match(main, /if\(!deathActive&&started&&m\?\.phase==='playing'&&me\?\.present&&me\.dead\)beginDeath\(\)/);
 // The camera cut redraws the shadows at the new place at once.
 assert.match(readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8'), /if \(cut\) this\.sun\.shadow\.needsUpdate = true;/);
});
