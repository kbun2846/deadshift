// The match summary that celebrates you (owner, 2026-10-02: "Do 4": your
// kills, best streak, damage, accuracy and favourite weapon after each match,
// plus one highlight, "3 ONE SHOTS!", "LONGEST LIFE 2:14"): match-summary.js
// counting, the highlight's rules, the watch that follows the match, and the
// card's markup (ui/summary-card.js) on the end card (ui/match-end.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMatchTracker, pickHighlight, favouriteWeapon, createSummaryWatch, ATTACK_EVENTS, clockText } from '../src/match-summary.js';
import { summaryCardHTML, accuracyText } from '../src/ui/summary-card.js';
import { SUMMARY } from '../src/config/death-flow.js';

const shot = { type: 'rifleShot' }, hit = (d = 6) => ({ type: 'hit', targetKind: 'player', damage: d });
const kill = (one = false, kind = 'player') => ({ type: 'kill', targetKind: kind, damage: 10, oneShot: one });

test('accuracy: an attack hits when a hit on a body follows it in time; hits never outnumber attacks', () => {
 const t = createMatchTracker();
 for (let i = 0; i < 4; i++) { t.event(shot, 'rifle'); t.frame(.1, true, 'rifle'); }
 t.event(hit(), 'rifle'); t.frame(1 / 60, true, 'rifle');
 t.event(hit(), 'rifle'); t.event(hit(), 'rifle'); t.frame(1 / 60, true, 'rifle'); // (pellets on one frame: one hit)
 assert.equal(t.state.attacks, 4); assert.equal(t.state.hits, 2);
 // A hit with nothing to answer (a stream, a burn): not counted.
 for (let i = 0; i < 10; i++) { t.event(hit(1), 'static'); t.frame(1 / 60, true, 'static'); }
 assert.equal(t.state.hits, 4, 'two shots were still waiting; the rest answer nothing');
 for (let i = 0; i < 10; i++) { t.event(hit(1), 'static'); t.frame(1 / 60, true, 'static'); }
 assert.ok(t.state.hits <= t.state.attacks);
 // Too late to answer an old miss.
 t.event(shot, 'rifle'); t.frame(SUMMARY.window + .5, true, 'rifle'); t.event(hit(), 'rifle');
 assert.equal(t.state.hits, 4);
 // Hits on practice boards are not hits on anyone.
 t.event(shot, 'rifle'); t.event({ type: 'hit', targetKind: 'target', damage: 5 }, 'rifle');
 assert.equal(t.state.hits, 4);
 for (const e of ['rifleShot', 'shotgunShot', 'launch', 'sidekickShot', 'sightlineShot', 'omenShot', 'ichorSwing', 'sheathSwing', 'grenadeThrow']) assert.ok(ATTACK_EVENTS.has(e), e);
 assert.ok(!ATTACK_EVENTS.has('sprayArc'), 'the stream is a beam, not counted');
});

test('kills, streaks, one-shots, lives and the favourite weapon', () => {
 const t = createMatchTracker();
 t.frame(30, true, 'rifle');
 t.event(shot, 'rifle'); t.event(kill(true), 'rifle'); t.event(shot, 'rifle'); t.event(kill(), 'rifle');
 t.event({ type: 'playerDeath' }); t.frame(5, false, 'rifle');
 t.frame(134, true, 'shotgun');
 for (let i = 0; i < 3; i++) { t.event({ type: 'shotgunShot' }, 'shotgun'); t.event(kill(i > 0), 'shotgun'); t.frame(.1, true, 'shotgun'); }
 const s = t.summary();
 assert.equal(s.kills, 5); assert.equal(s.deaths, 1); assert.equal(s.bestStreak, 3, 'two, a death, then three');
 assert.equal(s.oneShots, 3); assert.equal(s.favourite, 'shotgun', 'most kills');
 assert.ok(Math.abs(s.longestLife - 134.3) < .01);
 assert.equal(favouriteWeapon({ a: 1, b: 1 }, { a: 5, b: 9 }), 'b', 'a tie on kills: more time in hand');
 assert.equal(favouriteWeapon({}, { a: 5, b: 9 }), 'b', 'no kills: most time');
 assert.equal(favouriteWeapon({}, {}), null);
 // A robot's kill counts as a kill too; a practice board's does not.
 const r = createMatchTracker(); r.event(kill(false, 'robot'), 'rifle'); r.event(kill(false, 'target'), 'rifle');
 assert.equal(r.summary().kills, 1);
});

test('the end card\'s row wins over local counts (the table and the card never disagree)', () => {
 const t = createMatchTracker();
 t.event(kill(), 'rifle'); t.event(hit(40), 'rifle');
 const s = t.summary({ row: { id: 'me', kills: 7, deaths: 2, dealt: 612.4 }, rows: [{ id: 'me', dealt: 612.4 }, { id: 'b', dealt: 300 }] });
 assert.equal(s.kills, 7); assert.equal(s.deaths, 2); assert.equal(s.damage, 612);
 assert.equal(s.topDamage, true, 'the most damage of anyone');
});

test('one highlight, the strongest: one-shots, a comeback, shutdowns, a streak, top damage, accuracy, a long life', () => {
 const base = { kills: 0, deaths: 0, damage: 0, bestStreak: 0, attacks: 0, hits: 0, accuracy: null, oneShots: 0, shutdowns: 0, longestLife: 0, deficit: 0, won: false, rounds: false, topDamage: false };
 const pick = more => pickHighlight({ ...base, ...more });
 assert.equal(pick({ oneShots: 3, kills: 5, bestStreak: 3 }).text, '3 ONE SHOTS!');
 assert.equal(pick({ longestLife: 134, kills: 1 }).text, 'LONGEST LIFE 2:14');
 assert.equal(pick({ won: true, rounds: true, deficit: 2, oneShots: 2 }).text, 'COMEBACK FROM 2 DOWN', 'a comeback beats a couple of one-shots');
 assert.equal(pick({ won: false, rounds: true, deficit: 4 }), null, 'no comeback without the win (and nothing else here)');
 assert.equal(pick({ won: true, deficit: 3 }).text, 'COMEBACK FROM 3 KILLS DOWN', 'FFA: kills behind the leader');
 assert.equal(pick({ shutdowns: 1, bestStreak: 3 }).text, 'SHUTDOWN!');
 assert.equal(pick({ shutdowns: 2 }).text, '2 SHUTDOWNS!');
 assert.equal(pick({ bestStreak: 5, kills: 6 }).text, '5 KILL STREAK');
 assert.equal(pick({ topDamage: true, damage: 412, kills: 2 }).text, 'TOP DAMAGE · 412');
 assert.equal(pick({ oneShots: 1 }).text, 'ONE SHOT!');
 assert.equal(pick({ attacks: 40, hits: 30, accuracy: .75 }).text, '75% ACCURACY');
 assert.equal(pick({ attacks: 5, hits: 5, accuracy: 1 }), null, 'too few attacks to brag about');
 assert.equal(pick({ kills: 1, longestLife: 20 }).text, 'FIRST BLOOD');
 assert.equal(pick({ kills: 2, longestLife: 20 }).text, '2 KILLS');
 assert.equal(pick({ damage: 37, longestLife: 20 }).text, '37 DAMAGE DEALT', 'something to say');
 assert.equal(pick({ longestLife: 20 }).text, 'LONGEST LIFE 0:20');
 assert.equal(pick({ longestLife: 2 }), null, 'nothing worth naming: no highlight (not "LONGEST LIFE 0:02")');
 assert.equal(clockText(134), '2:14'); assert.equal(clockText(59.6), '1:00');
});

test('the watch: one tracker per match (online the match number, BOTS its id), frozen once shown', () => {
 const online = { active: false }, duel = { active: true, matchId: 1, over: false, ffa: true, score: { you: 0, robot: 0 } };
 const bots = { youStats: { kills: 0 }, bots: [{ stats: { kills: 4 } }] }, sim = { weapon: 'rifle' };
 const w = createSummaryWatch({ online, duel, bots, sim });
 w.frame(1, true); w.event({ type: 'rifleShot' }); w.event(kill());
 for (let i = 0; i < 20; i++) w.frame(.1, true);
 assert.equal(w.tracker.state.deficit, 4, 'four kills behind the top bot');
 const first = w.card({ rows: [{ id: 'you', kills: 1, deaths: 0, dealt: 10 }], myId: 'you', won: true });
 assert.equal(first.kills, 1);
 w.event(kill()); assert.equal(w.card({ rows: [], myId: 'you' }), first, 'frozen: the card does not change under you');
 duel.matchId = 2; w.frame(.1, true);
 assert.equal(w.tracker.state.kills, 0, 'a new match, a fresh count');
 // Plain practice (no match): nothing counted.
 duel.active = false; w.event(kill()); assert.equal(w.tracker.state.kills, 0);
 // Online: by match number, counting only while playing.
 const on = { active: true, myId: 'me', myTeam: null, match: () => ({ phase: 'playing', number: 7, elimination: true, sides: [{ id: 'me', points: 0 }, { id: 'p2', points: 2 }] }), scoreboard: () => [] };
 const w2 = createSummaryWatch({ online: on, duel, bots, sim });
 for (let i = 0; i < 10; i++) w2.frame(.1, true);
 assert.equal(w2.tracker.key, 'o7'); assert.equal(w2.tracker.state.deficit, 2);
});

test('the card: the highlight and all six numbers, the favourite\'s name; the end card has its slot', () => {
 const html = summaryCardHTML({ kills: 7, deaths: 2, bestStreak: 4, damage: 612, accuracy: .4567, favourite: 'shotgun', highlight: { id: 'oneShots', text: '3 ONE SHOTS!' } });
 for (const part of ['3 ONE SHOTS!', '>7<', '>2<', '>4<', '>612<', '46%', 'Ballast', 'your match']) assert.ok(html.includes(part), part);
 assert.equal(summaryCardHTML(null), '');
 assert.equal(accuracyText(null), '—');
 assert.ok(summaryCardHTML({ kills: '<b>', deaths: 0, bestStreak: 0, damage: 0, accuracy: null, favourite: null, highlight: { id: 'x', text: '<i>' } }).includes('&lt;b&gt;'), 'escaped');
 const end = readFileSync(new URL('../src/ui/match-end.js', import.meta.url), 'utf8');
 assert.ok(end.includes('<div class="match-end-you"></div>') && end.includes("put('you', '.match-end-you', summary || '')"));
 const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
 assert.equal((main.match(/summary:summaryHTML\(/g) || []).length, 2, 'both end cards: SOLO (BOTS, quick play\'s bot fight, Gun Game) and online (every mode, quick rooms)');
});
