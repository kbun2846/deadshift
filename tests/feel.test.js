// The feel pass (owner, 2026-10-01: "Make the kills feel amazing and do that
// for FFA too ... then do all the feel and feedback things"): hit marker
// tiers, kill / one-shot detection, streaks and shutdowns (offline and on the
// host's feed lines), hitstop and slow motion (only the round's last kill;
// never the simulation's clock online), the low-health warning, reload
// sounds, and the feel layer put together with stand-ins for the DOM, the
// view and the sound.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FEEL } from '../src/config/feel.js';
import { hitTier, hitWeight, killKind, markerKind, createHitBatch } from '../src/feel/hit-tiers.js';
import { createTimeFeel, createFinaleWatch } from '../src/feel/time-feel.js';
import { createLowHealth } from '../src/feel/low-health.js';
import { createStreaks, recordDeath, streakNews, streakCallout, isShutdown, STREAK_CALLOUTS } from '../src/streaks.js';
import { feedNote } from '../src/ui/multiplayer-hud.js';
import { reloadFamily, reloadDone } from '../src/audio-feel.js';
import { bannerText } from '../src/feel/streak-banner.js';
import { arena, people, tick } from './rules-harness.js';

// ---- stand-ins -----------------------------------------------------------
function fakeEl() {
 const el = { children: [], attrs: {}, q: {}, className: '', innerHTML: '', textContent: '', hidden: false,
  style: { setProperty(k, v) { this[k] = v; } },
  setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
  append(...c) { this.children.push(...c); }, querySelector(sel) { return (el.q[sel] ||= fakeEl()); } };
 return el;
}
function fakeSound() { const calls = []; const rec = name => (...args) => calls.push([name, ...args]); return { calls, tone: rec('tone'), impact: rec('impact'), noise: rec('noise'), ring: rec('ring'), whoosh: rec('whoosh') }; }
function fakeView() { return { scene: { add() {} }, screenPoint: (x, z) => ({ x: 100 + x * 10, y: 100 + z * 10 }), kick: { x: 0, z: 0 }, motion: true, timeScale: 1, player: { visible: true, position: { x: 0, y: 0, z: 0 } }, remotePlayers: [], remote: null }; }
function fakeHud() { return { notes: [], shown: false, addNote(html) { this.notes.push(html); }, set feedShown(on) { this.shown = on; }, renderFeed() {} }; }
async function feelKit() {
 globalThis.document = { createElement: () => fakeEl() };
 const { createFeel } = await import('../src/feel/feel-layer.js');
 const root = fakeEl(), host = fakeEl(), view = fakeView(), sound = fakeSound(), mpHud = fakeHud();
 const me = { id: 'local', x: 0, z: 0, hp: 100, maxHp: 100, dead: false };
 const feel = createFeel({ root, markerHost: host, view, sound, mpHud, player: () => me });
 const sim = { player: me };
 return { feel, root, host, view, sound, mpHud, me, sim };
}
const frameState = (sim, extra = {}) => ({ sim, online: null, bots: null, duel: null, started: true, paused: false, live: true, elapsed: 1, feedNow: 1, ...extra });

// ---- hit markers -------------------------------------------------------------
test('hit marker tiers: a tick for a graze, a hit, a big hit; weight inside the tier', () => {
 assert.equal(hitTier(3), 'tick');        // Nominal far out (4.3) and Static's stream ticks
 assert.equal(hitTier(4.9), 'tick');
 assert.equal(hitTier(6), 'hit');         // Nominal close, Ichor, Sidekick, Sheath
 assert.equal(hitTier(16), 'hit');
 assert.equal(hitTier(20), 'big');        // a fifth of a life and up
 assert.equal(hitTier(67), 'big');        // a Ballast shell
 assert.equal(hitTier(0), 'tick');
 assert.ok(hitWeight(15) > hitWeight(7));
 assert.ok(hitWeight(90) > hitWeight(25));
 for (const d of [0, 2, 6, 19, 20, 60, 500]) { const w = hitWeight(d); assert.ok(w >= 0 && w <= 1, String(d)); }
});

test('kill detection: players and robots get the kill feel (one-shots their own), targets only the X', () => {
 assert.equal(killKind({ type: 'kill', targetKind: 'player' }), 'kill');
 assert.equal(killKind({ type: 'kill', targetKind: 'robot', oneShot: true }), 'oneShot');
 assert.equal(killKind({ type: 'kill', targetKind: 'target' }), 'target');
 assert.equal(killKind({ type: 'kill' }), 'target');
 assert.equal(killKind({ type: 'hit', targetKind: 'player' }), null);
 assert.equal(markerKind(5, 'oneShot'), 'oneshot');
 assert.equal(markerKind(5, 'kill'), 'kill');
 assert.equal(markerKind(5, 'target'), 'kill');
 assert.equal(markerKind(30, null), 'big');
});

test('a frame\'s hits on one target are one marker: a Ballast shell\'s pellets add up to a big hit, a kill outranks them', () => {
 const batch = createHitBatch();
 for (let i = 0; i < 12; i++) batch.add({ type: 'hit', id: 'bot1', x: 1, z: 2, damage: 5.6 });
 batch.add({ type: 'hit', id: 'bot2', x: 4, z: 0, damage: 3 });
 batch.add({ type: 'outgoingDamage', id: 'bot2', damage: 99 });
 let list = batch.take();
 assert.equal(list.length, 2);
 assert.equal(markerKind(list[0].damage, list[0].kill), 'big');
 assert.equal(markerKind(list[1].damage, list[1].kill), 'tick');
 batch.add({ type: 'hit', id: 'bot1', x: 1, z: 2, damage: 30 });
 batch.add({ type: 'kill', id: 'bot1', x: 1, z: 2, damage: 10, targetKind: 'robot', oneShot: true });
 batch.add({ type: 'kill', id: 'bot1', x: 1, z: 2, damage: 0, targetKind: 'robot' });
 list = batch.take();
 assert.equal(list.length, 1);
 assert.equal(list[0].kill, 'oneShot', 'a one-shot is not demoted by a second kill report');
 assert.equal(batch.take().length, 0, 'taken: empty');
});

// ---- streaks -------------------------------------------------------------
test('streaks: kills since your last death; callouts at 3, 5 and 8; ending 3 or more is a shutdown', () => {
 assert.deepEqual({ ...STREAK_CALLOUTS }, { 3: 'spree', 5: 'rampage', 8: 'unstoppable' });
 assert.equal(streakCallout(3), 'spree'); assert.equal(streakCallout(4), null); assert.equal(streakCallout(8), 'unstoppable');
 assert.equal(isShutdown(2), false); assert.equal(isShutdown(3), true);
 const s = createStreaks();
 assert.deepEqual(recordDeath(s, 'b', 'a'), { streak: 1, ended: 0 });
 recordDeath(s, 'c', 'a');
 assert.deepEqual(recordDeath(s, 'd', 'a'), { streak: 3, ended: 0 });
 // a falls to the storm: its streak ends, nobody's grows.
 assert.deepEqual(recordDeath(s, 'a', null), { streak: 0, ended: 3 });
 assert.equal(s.count('a'), 0);
 for (const v of ['x', 'y', 'z', 'w']) recordDeath(s, v, 'b');
 assert.deepEqual(recordDeath(s, 'b', 'c'), { streak: 1, ended: 4 }, 'c ended b\'s 4');
 // Your own blast: no kill to your name.
 assert.deepEqual(recordDeath(s, 'c', 'c'), { streak: 0, ended: 1 });
});

test('streak news from a feed line: yours and others\', a multi-kill stepping over a callout, shutdowns', () => {
 assert.deepEqual(streakNews({ killer: 'me', killerName: 'Me', victims: ['b'], victimNames: ['B'], streak: 3 }, 'me').map(n => [n.kind, n.n, n.word, n.mine]), [['streak', 3, 'spree', true]]);
 assert.deepEqual(streakNews({ killer: 'me', victims: ['b'], victimNames: ['B'], streak: 4 }, 'me'), [], 'no callout at 4');
 assert.deepEqual(streakNews({ killer: 'o', killerName: 'O', victims: ['b', 'c'], victimNames: ['B', 'C'], streak: 4 }, 'me').map(n => [n.n, n.mine]), [[3, false]], '2 -> 4 passes 3');
 const shut = streakNews({ killer: 'me', killerName: 'Me', victims: ['b', 'c'], victimNames: ['B', 'C'], streak: 1, ended: 5, endedBy: 'c' }, 'me');
 assert.deepEqual(shut.map(n => [n.kind, n.victimName, n.n, n.mine]), [['shutdown', 'C', 5, true]]);
 assert.deepEqual(streakNews({ killer: null, victims: ['b'], victimNames: ['B'] }, 'me'), []);
 // The kill feed's lines and the banner's words.
 assert.match(feedNote({ kind: 'streak', killer: 'o', killerName: 'Olly', n: 5 }, 'me'), /Olly.*is on a 5 kill streak/);
 assert.match(feedNote(shut[0], 'me'), /feed-you">Me<.*ended.*C.*'s 5 kill streak/);
 assert.match(feedNote({ kind: 'streak', killer: 'o', killerName: '<b>', n: 3 }, 'me'), /&lt;b&gt;/, 'names escaped');
 assert.deepEqual(bannerText({ kind: 'streak', n: 3, word: 'spree' }), { small: '3 kill streak', big: 'spree' });
 assert.deepEqual(bannerText(shut[0]), { small: "ended C's 5 kill streak", big: 'shutdown' });
});

test('the online arena counts streaks: feed lines carry the killer\'s streak and the streak a victim lost', () => {
 const a = arena({ humans: 3, mode: 'ffa', settings: { robots: 'off', storm: 'off' } });
 const [host, p1, p2] = people(a);
 const kill = (victim, killer) => { victim.sim.player.hp = 0; a.died(victim, killer); tick(a, 1 / 20); };
 const respawnAll = () => tick(a, a.settings.respawn + .2);
 kill(p1, host); respawnAll(); kill(p1, host); respawnAll(); kill(p2, host);
 const third = a.feed[a.feed.length - 1];
 assert.equal(third.killer, host.id); assert.equal(third.streak, 3);
 assert.deepEqual(streakNews(third, host.id).map(n => n.word), ['spree']);
 respawnAll(); kill(host, p2);
 const shut = a.feed[a.feed.length - 1];
 assert.equal(shut.killer, p2.id); assert.equal(shut.streak, 1); assert.equal(shut.ended, 3); assert.equal(shut.endedBy, host.id);
 assert.deepEqual(streakNews(shut, p2.id).map(n => [n.kind, n.mine]), [['shutdown', true]]);
 // A new match starts everyone at nothing.
 a.startRound('ffa');
 assert.equal(a.streaks.count(p2.id), 0);
});

// ---- time ---------------------------------------------------------------
test('hitstop: ~40 ms of near-frozen visuals; online the simulation\'s clock is never touched', () => {
 assert.equal(FEEL.kill.hitstop, .04);
 const t = createTimeFeel();
 assert.equal(t.scale, 1);
 t.hitstop();
 assert.equal(t.scale, FEEL.frozen);
 assert.equal(t.simScale(true), 1, 'online: never');
 assert.equal(t.simScale(false), FEEL.frozen, 'solo: the visuals and the sim together');
 t.step(.03); assert.ok(t.stopped);
 t.step(.011); assert.equal(t.scale, 1);
});

test('slow motion: short (≤ 0.6 s real), eased back to full speed, and online only visual', () => {
 assert.ok(FEEL.slowmo.time <= .6);
 const t = createTimeFeel();
 t.slowmo();
 let last = 0, real = 0;
 const seen = [];
 while (t.slowing) {
  assert.equal(t.simScale(true), 1, 'online the clock stays 1 throughout');
  assert.equal(t.simScale(false), t.scale);
  seen.push(t.scale);
  t.step(1 / 60); real += 1 / 60;
  assert.ok(t.scale >= last - 1e-9 || real < FEEL.slowmo.time * FEEL.slowmo.hold + 1e-9, 'never slower again once easing back');
  last = t.scale;
 }
 assert.ok(real <= FEEL.slowmo.time + 1 / 60);
 assert.equal(Math.min(...seen), FEEL.slowmo.scale);
 assert.equal(t.scale, 1);
 // A kill during it: still frozen for its moment, never sped up.
 t.slowmo(); t.hitstop(); assert.equal(t.scale, FEEL.frozen);
 t.clear(); assert.equal(t.scale, 1);
});

test('slow motion only for the round\'s (or match\'s) last kill', () => {
 const w = createFinaleWatch(.75);
 assert.equal(w.death(10), false, 'an ordinary kill');
 assert.equal(w.ended(10.2), true, 'the round ended just after it: its last kill');
 assert.equal(w.ended(10.2), false, 'once');
 assert.equal(w.death(10.4), false, 'a later death does not replay it');
 // The round ending with no kill near it (FFA's clock running out).
 assert.equal(w.ended(40), false);
 // Seen the other way round: the end first, the death a moment later (a
 // robot falls on its next tick).
 assert.equal(w.ended(60), false);
 assert.equal(w.death(60.1), true);
 w.reset(); assert.equal(w.ended(1), false);
});

// ---- low health ------------------------------------------------------------
test('low health: pulses below 30% with a heartbeat that speeds up; fades with time; stops on a heal or a new life', () => {
 const lh = createLowHealth();
 const run = (seconds, hp, live = true) => { let beats = 0, max = 0, last = null; for (let t = 0; t < seconds; t += 1 / 60) { last = lh.step(1 / 60, hp, 100, live); if (last.beat) beats++; max = Math.max(max, last.level); } return { beats, max, last }; };
 assert.equal(run(2, 50).max, 0, 'no warning at half health');
 assert.equal(run(2, 31).beats, 0);
 const at25 = run(3, 25);
 assert.ok(at25.max > .5 && at25.beats >= 3, 'below 30%: the edge and a heartbeat');
 lh.reset();
 const at5 = run(3, 5);
 assert.ok(at5.beats > at25.beats, 'faster near empty');
 assert.ok(lh.state.interval < FEEL.lowHealth.slowBeat);
 // Sitting low: it eases down to its rest level.
 const early = at5.last.level;
 const later = run(10, 5).last.level;
 assert.ok(later < early * .6, 'fades with time');
 lh.hurt();
 assert.ok(run(.1, 5).last.level > later, 'strong again when hit');
 // Healed past the line: gone in a moment.
 assert.equal(run(1, 60).last.level, 0);
 // Death or a menu: at once.
 run(1, 10); assert.equal(lh.step(1 / 60, 10, 100, false).level, 0);
});

// ---- reload sounds -----------------------------------------------------------
test('each weapon family\'s reload finishing has its own sound', () => {
 const families = [['rifleReloaded', {}, 'rifle'], ['shotgunReloaded', {}, 'shotgun'], ['sidekickReloaded', {}, 'pistol'], ['sightlineReloaded', {}, 'pistol'], ['sightlineReloaded', { rifle: true }, 'sniper'], ['sightlineReloaded', { rifle: true, special: true }, 'breach'], ['omenReloaded', {}, 'omen']];
 const prints = new Set();
 for (const [type, extra, family] of families) {
  assert.equal(reloadFamily({ type, ...extra }), family, type);
  const s = fakeSound();
  assert.equal(reloadDone(s, family), true);
  assert.ok(s.calls.length >= 2 && s.calls.length <= 6, family + ': short');
  prints.add(JSON.stringify(s.calls));
 }
 assert.equal(prints.size, 6, 'six different sounds (Sidekick and Sightline\'s Sidekick share one)');
 assert.equal(reloadFamily({ type: 'rifleReload' }), null, 'starting a reload is not finishing one');
});

// ---- the feel layer put together ----------------------------------------------
test('feel layer: your kill of a robot freezes the visuals for a moment, kicks the view, plays the kill sound and marks the X', async () => {
 const { feel, view, sound, host, sim } = await feelKit();
 const e = { type: 'kill', targetKind: 'robot', id: 'bot1', x: 5, z: 0, damage: 30 };
 feel.event(e);
 assert.equal(e.felt, true, 'the old kill sound stands aside');
 assert.ok(sound.calls.length > 0);
 assert.equal(view.timeScale, FEEL.frozen);
 assert.ok(view.kick.x > 0 && Math.abs(view.kick.z) < 1e-9, 'kicked toward the kill');
 assert.equal(feel.simScale(true), 1, 'online: the clock untouched');
 feel.frame(1 / 60, frameState(sim));
 const shown = host.children.filter(c => c.attrs['data-play']);
 assert.equal(shown.length, 1);
 assert.equal(shown[0].attrs['data-kind'], 'kill');
 // A one-shot: its own marker.
 feel.event({ type: 'kill', targetKind: 'player', oneShot: true, id: 'p', x: 0, z: 5, damage: 100 });
 feel.frame(1 / 60, frameState(sim));
 assert.ok(host.children.some(c => c.attrs['data-kind'] === 'oneshot'));
 // A practice target: the X, but no freeze.
 feel.clear(); view.timeScale = 1;
 const board = { type: 'kill', targetKind: 'target', id: 't', x: 1, z: 1, damage: 50 };
 feel.event(board);
 assert.equal(board.felt, undefined); assert.equal(view.timeScale, 1);
 // Reduced motion (the game's own setting): no kick.
 view.motion = false; view.kick.x = 0; feel.event({ ...e }); assert.equal(view.kick.x, 0);
});

test('feel layer offline (BOTS FFA): your third kill calls a spree, ending a robot\'s streak a shutdown, robots\' streaks go in the feed', async () => {
 const { feel, root, mpHud, sim } = await feelKit();
 const banner = root.children.find(c => c.className === 'streak-banner');
 const bots = { deaths: [] }, duel = { active: true, ffa: true, matchId: 1, pointBreak: null, finalBreak: null, over: false };
 const state = () => frameState(sim, { bots, duel });
 const die = (victim, killer) => { bots.deaths.push({ victim, killer, victimName: victim === 'local' ? 'you' : victim.toUpperCase(), killerName: killer === 'local' ? 'you' : killer?.toUpperCase() }); feel.frame(1 / 60, state()); };
 feel.frame(1 / 60, state());
 assert.equal(mpHud.shown, true, 'BOTS FFA shows the feed');
 die('b1', 'local'); die('b2', 'local');
 assert.equal(banner.attrs['data-play'] ?? '', '');
 die('b3', 'local');
 assert.ok(banner.attrs['data-play'], 'the banner');
 assert.equal(banner.attrs['data-kind'], 'streak');
 assert.equal(banner.q.b.textContent, 'SPREE');
 assert.equal(bots.deaths.length, 0, 'the log is drained');
 // A robot's own spree: a feed line, no banner.
 for (const v of ['b1', 'b2', 'b3']) die(v, 'b4');
 assert.ok(mpHud.notes.some(n => /B4.*is on a 3 kill streak/.test(n)));
 // You end it: the shutdown banner.
 die('b4', 'local');
 assert.equal(banner.attrs['data-kind'], 'shutdown');
 assert.equal(banner.q.small.textContent, "ended B4's 3 kill streak");
 // You die: your streak (4) is over; a robot ending it shows in the feed.
 die('local', 'b2');
 assert.ok(mpHud.notes.some(n => /B2.*ended.*you.*'s 4 kill streak/.test(n)));
});

test('feel layer: slow motion on the round\'s last kill only, offline and online; online the sim clock stays 1', async () => {
 const { feel, view, sim } = await feelKit();
 // BOTS 2V2: a robot falls and the point is taken that frame.
 const bots = { deaths: [] }, duel = { active: true, ffa: false, matchId: 1, pointBreak: null, finalBreak: null, over: false };
 feel.frame(1 / 60, frameState(sim, { bots, duel }));
 bots.deaths.push({ victim: 'b1', killer: 'local', victimName: 'B1', killerName: 'you' });
 feel.frame(1 / 60, frameState(sim, { bots, duel }));
 assert.ok(!feel.time.slowing, 'an ordinary kill: no slow motion');
 bots.deaths.push({ victim: 'b2', killer: 'local', victimName: 'B2', killerName: 'you' });
 duel.pointBreak = { side: 'you', left: 5 };
 feel.frame(1 / 60, frameState(sim, { bots, duel }));
 assert.ok(feel.time.slowing, 'the round\'s last kill');
 assert.ok(view.timeScale < 1);
 assert.ok(feel.simScale(false) < 1, 'solo: the sim slows with it');
 for (let i = 0; i < 60; i++) feel.frame(1 / 60, frameState(sim, { bots, duel }));
 assert.equal(view.timeScale, 1, 'over in well under a second');

 // Online: the host's feed line and its round state (one more round played).
 feel.clear();
 let match = { number: 3, phase: 'playing', elimination: true, played: 1, mode: '2v2' };
 const online = { active: true, match: () => match };
 feel.frame(1 / 60, frameState(sim, { online }));
 feel.feed([{ killer: 'p2', killerName: 'P2', victims: ['p3'], victimNames: ['P3'], streak: 1 }], 'local', 1, '2v2');
 match = { ...match, played: 2, roundBreak: 5 };
 feel.frame(1 / 60, frameState(sim, { online }));
 assert.ok(feel.time.slowing);
 assert.ok(view.timeScale < 1, 'the visuals slow');
 assert.equal(feel.simScale(true), 1, 'the simulation\'s clock does not');
 // FFA's clock running out: no kill with it, no slow motion.
 feel.clear();
 match = { number: 4, phase: 'playing', mode: 'ffa', left: 1 };
 feel.frame(1 / 60, frameState(sim, { online }));
 for (let i = 0; i < 90; i++) feel.frame(1 / 60, frameState(sim, { online }));
 match = { number: 4, phase: 'results', mode: 'ffa' };
 feel.frame(1 / 60, frameState(sim, { online }));
 assert.ok(!feel.time.slowing);
});

test('feel layer: the low-health edge follows your health and the spawn shimmer shows on protected bodies', async () => {
 const { feel, root, view, me, sim } = await feelKit();
 const edge = root.children.find(c => c.className === 'low-health-edge');
 me.hp = 20;
 for (let i = 0; i < 30; i++) feel.frame(1 / 60, frameState(sim));
 assert.ok(Number(edge.style.opacity) > 0);
 me.hp = 100;
 for (let i = 0; i < 60; i++) feel.frame(1 / 60, frameState(sim));
 assert.equal(Number(edge.style.opacity), 0);
 me.guard = 1.2; view.remotePlayers = [{ id: 'r', x: 3, z: 3, guard: .1 }, { id: 's', x: 6, z: 6 }];
 feel.frame(1 / 60, frameState(sim));
 assert.equal(feel.shimmer.groups.filter(g => g.visible).length, 2, 'you and the protected robot, not the other');
 delete me.guard; view.remotePlayers = [];
 feel.frame(1 / 60, frameState(sim));
 assert.equal(feel.shimmer.groups.filter(g => g.visible).length, 0);
});
