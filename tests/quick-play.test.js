// QUICK PLAY on the page: the state machine (src/quick-play.js) and the bot
// that adapts (src/bots/adaptive-bot.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickPlay, QUICK_PLAY } from '../src/quick-play.js';
import { BotAdapter, ADAPT, snapshot, createAdaptiveWatch } from '../src/bots/adaptive-bot.js';
import { makeProfile } from '../src/bots/robot-profile.js';

// A seeded random (the same numbers every run).
const seeded = (seed = 7) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const normalBot = seed => makeProfile({ skill: 'normal', style: 'blend', temper: 'shifting', random: seeded(seed) });

// A quick play with everything it touches recorded; `line` is the open
// matchmaking line's handlers (the test plays the server).
function harness({ throwOnOpen = false, joinFails = false } = {}) {
 let t = 0;
 const log = [], h = { log, line: null, closed: 0, now: () => t, add: s => { t += s; } };
 h.quick = createQuickPlay({
  openQueue: handlers => { if (throwOnOpen) throw new Error('offline'); h.line = handlers; log.push('open'); return { close: () => { h.closed++; log.push('close'); } }; },
  botFight: () => log.push('bots'),
  leaveBotFight: () => log.push('leave-bots'),
  join: async match => { log.push('join ' + match.code); if (joinFails) throw new Error('That game is full.'); },
  prompt: { show: (m, s) => log.push('prompt ' + m.code + ' ' + s), hide: () => log.push('hide') },
  busy: on => log.push(on ? 'busy' : 'idle'),
  toast: text => log.push('toast ' + text),
  now: h.now, later: () => {},
 });
 return h;
}
const flush = () => new Promise(r => setTimeout(r, 0));

test('no server: straight to the bot fight (unreachable, refused, offline build, or no answer in time)', async () => {
 // The line closes before it answers (unreachable / refused).
 const a = harness();
 a.quick.begin();
 assert.equal(a.quick.state, 'connecting');
 a.line.onEnd('Could not reach the game server.');
 assert.equal(a.quick.state, 'bots');
 assert.ok(a.log.includes('bots'));
 assert.ok(a.log.includes('toast PLAYING A BOT · NO ONLINE MATCH RIGHT NOW'));
 // Refused (maintenance, an update): the server's words.
 const m = harness();
 m.quick.begin(); m.line.onEnd('Back soon.', true);
 assert.equal(m.quick.state, 'bots'); assert.ok(m.log.includes('toast BACK SOON.'));
 assert.equal(a.quick.searching, false, 'no line, no queue');
 // The line can't even open (multiplayer off, no WebSocket).
 const b = harness({ throwOnOpen: true });
 b.quick.begin();
 assert.equal(b.quick.state, 'bots');
 // No word within answerWait: the bot fight starts anyway, still listening.
 const c = harness();
 c.quick.begin();
 c.add(QUICK_PLAY.answerWait - .1); c.quick.tick();
 assert.equal(c.quick.state, 'connecting');
 c.add(.2); c.quick.tick();
 assert.equal(c.quick.state, 'bots');
 assert.equal(c.quick.searching, true);
 // The wheel is up only while connecting.
 assert.deepEqual(c.log.filter(x => x === 'busy' || x === 'idle'), ['busy', 'idle']);
});

test('nobody waiting: the bot fight, queued; a player found during it: the prompt; JOIN leaves the fight and joins', async () => {
 const h = harness();
 h.quick.begin();
 h.line.onQueued(1);
 assert.equal(h.quick.state, 'bots');
 assert.ok(h.log.some(x => x.startsWith('toast NOBODY WAITING')));
 assert.equal(h.quick.searching, true);
 h.add(30);
 h.line.onMatch({ code: '12345', map: 'deadwater', mode: 'ffa' });
 assert.equal(h.quick.offer.code, '12345');
 assert.ok(h.log.includes('prompt 12345 ' + QUICK_PLAY.promptSeconds));
 // A second offer while one is up doesn't stack.
 h.line.onMatch({ code: '99999', map: 'deadwater', mode: 'ffa' });
 assert.equal(h.quick.offer.code, '12345');
 assert.equal(h.quick.accept(), true);
 await flush();
 assert.deepEqual(h.log.slice(-6), ['leave-bots', 'hide', 'close', 'busy', 'join 12345', 'idle']);
 assert.equal(h.quick.state, 'online');
 assert.equal(h.quick.active, true);
});

test('ignoring the prompt keeps playing; a withdrawn offer hides it; the queue gives up after queueSeconds', () => {
 const h = harness();
 h.quick.begin(); h.line.onQueued(1);
 h.line.onMatch({ code: '11111', map: 'deadwater', mode: 'ffa' });
 h.add(QUICK_PLAY.promptSeconds + .1); h.quick.tick();
 assert.equal(h.quick.offer, null, 'it runs out');
 assert.equal(h.quick.state, 'bots');
 h.line.onMatch({ code: '22222', map: 'deadwater', mode: 'ffa' });
 h.quick.ignore();
 assert.equal(h.quick.offer, null); assert.equal(h.quick.state, 'bots');
 h.line.onMatch({ code: '33333', map: 'deadwater', mode: 'ffa' });
 h.line.onQueued(1);
 assert.equal(h.quick.offer, null, 'the server withdrew it');
 assert.equal(h.quick.accept(), false, 'nothing to accept');
 h.add(QUICK_PLAY.queueSeconds); h.quick.tick();
 assert.equal(h.closed, 1, 'the line closes after queueSeconds');
 assert.equal(h.quick.state, 'bots', 'the bot fight goes on');
 // The menu: everything stops; a late word from an old line is ignored.
 const old = h.line;
 h.quick.stop();
 assert.equal(h.quick.state, 'idle');
 old.onMatch({ code: '44444', map: 'deadwater', mode: 'ffa' });
 assert.equal(h.quick.offer, null);
});

test('someone already waiting: straight online; a failed join falls back to a bot fight and looks again', async () => {
 const h = harness();
 h.quick.begin();
 h.line.onMatch({ code: '55555', map: 'deadwater', mode: 'ffa' });
 await flush();
 assert.equal(h.quick.state, 'online');
 assert.ok(!h.log.includes('bots'));
 // The server closing the newcomer's line after `match` changes nothing.
 h.line.onEnd('The game server closed the connection.');
 assert.equal(h.quick.state, 'online');
 const f = harness({ joinFails: true });
 f.quick.begin();
 f.line.onMatch({ code: '66666', map: 'deadwater', mode: 'ffa' });
 await flush();
 assert.ok(f.log.includes('toast THAT GAME IS FULL.'));
 assert.equal(f.quick.state, 'bots', 'a bot fight, still looking');
 assert.ok(f.log.includes('bots')); assert.equal(f.quick.searching, true);
 // The same room offered again comes as the prompt, not another automatic join.
 f.line.onMatch({ code: '66666', map: 'deadwater', mode: 'ffa' });
 assert.equal(f.quick.offer.code, '66666');
 // A page reloaded into its bot fight opens only the line.
 const r = harness();
 r.quick.begin({ inBots: true });
 assert.equal(r.quick.state, 'bots'); assert.ok(r.log.includes('open')); assert.ok(!r.log.includes('bots'));
});

test('the adapting bot: bounded to ±15%, leaning toward close rounds, and deterministic', () => {
 const base = snapshot(normalBot(3));
 // You win every round, dealing far more: the bot sharpens, never past the bound.
 const up = new BotAdapter();
 for (let i = 0; i < 40; i++) up.round('you', 100, 20);
 assert.ok(up.edge > .5 && up.edge <= 1);
 const sharp = up.apply(normalBot(3), base);
 assert.ok(sharp.aim < base.aim && sharp.aim >= base.aim * (1 - ADAPT.max) - 1e-9);
 assert.ok(sharp.reaction[0] < base.reaction[0] && sharp.reaction[0] >= base.reaction[0] * (1 - ADAPT.max) - 1e-9);
 assert.ok(sharp.settle >= base.settle * (1 - ADAPT.max) - 1e-9);
 assert.ok(sharp.dodge > base.dodge && sharp.dodge <= Math.min(1, base.dodge * (1 + ADAPT.max)) + 1e-9);
 assert.ok(sharp.hold < base.hold && sharp.hold >= base.hold * (1 - ADAPT.max) - 1e-9);
 assert.ok(sharp.base.aggr > base.moodAggr && sharp.base.aggr <= base.moodAggr + ADAPT.boldness + 1e-9);
 // You lose every round: it eases off, within the bound the other way.
 const down = new BotAdapter();
 for (let i = 0; i < 40; i++) down.round('robot', 10, 100);
 assert.ok(down.edge < -.5);
 const easy = down.apply(normalBot(3), base);
 assert.ok(easy.aim > base.aim && easy.aim <= base.aim * (1 + ADAPT.max) + 1e-9);
 assert.ok(easy.dodge < base.dodge && easy.dodge >= base.dodge * (1 - ADAPT.max) - 1e-9);
 assert.ok(easy.hold > base.hold);
 // Even rounds: it stays where it was made.
 const even = new BotAdapter();
 for (let i = 0; i < 10; i++) even.round(i % 2 ? 'you' : 'robot', 50, 50);
 assert.ok(Math.abs(even.edge) < .1);
 // One lucky round barely moves it (subtle), and the edge walks, never jumps.
 const one = new BotAdapter(); one.round('you', 60, 40);
 assert.ok(one.edge > 0 && one.edge < .2);
 // Never the health, damage, speed or weapon: only the skill numbers above.
 const pf = normalBot(5), before = { ...pf }, b5 = snapshot(pf);
 up.apply(pf, b5);
 for (const key of Object.keys(before)) if (!['aim', 'settle', 'reaction', 'dodge', 'hold', 'aggr', 'base', 'hurtAt', 'coverRest', 'hunt', 'openReload'].includes(key)) assert.deepEqual(pf[key], before[key], key);
 // Deterministic: the same rounds (and the same seeded robot) give the same numbers.
 const run = () => { const a = new BotAdapter(); for (const [w, d, t] of [['you', 80, 30], ['robot', 20, 90], ['you', 70, 60], [null, 40, 40]]) a.round(w, d, t); return a.apply(normalBot(11), snapshot(normalBot(11))); };
 assert.deepEqual(run(), run());
 // A reset forgets the session.
 up.reset(); assert.equal(up.edge, 0);
});

test('the adaptive watch: rounds from the duel go to the adapter; the bot is retuned as each round starts', () => {
 const profile = normalBot(9), bot = { profile };
 const duel = { active: true, config: { mode: '1v1' }, bot, matchId: 1, round: 1, score: { played: 0, you: 0, robot: 0 } };
 const bots = { youStats: { dealt: 0, taken: 0 } };
 const watch = createAdaptiveWatch(), base = snapshot(profile);
 watch.frame(duel, bots);
 assert.equal(watch.edge, 0); assert.equal(profile.aim, base.aim);
 // Round 1: you take it, 100 dealt to 25 taken.
 bots.youStats = { dealt: 100, taken: 25 }; duel.score = { played: 1, you: 1, robot: 0 };
 watch.frame(duel, bots);
 assert.ok(watch.edge > 0);
 assert.equal(profile.aim, base.aim, 'not mid-break: only as the next round starts');
 duel.round = 2; watch.frame(duel, bots);
 assert.ok(profile.aim < base.aim, 'sharper for round 2');
 // A new match keeps the session's edge; BOTS games outside quick play are not watched (main.js).
 const edge = watch.edge;
 duel.matchId = 2; duel.round = 1; duel.score = { played: 0, you: 0, robot: 0 }; bots.youStats = { dealt: 0, taken: 0 };
 watch.frame(duel, bots);
 assert.equal(watch.edge, edge);
 // Not a 1V1 (or no duel): nothing.
 watch.frame({ active: false }, bots);
});
