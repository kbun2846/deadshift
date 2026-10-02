// The killcam (owner, 2026-10-02: "Do the killcam ... It should be brief
// after zooming into the dead player. It should not add much time to respawn
// time if applicable. It should make the death screen pop up after the kill
// cam is done."): killcam.js's timing, who gets one, the skip, its camera and
// its bars. The respawn itself is never touched (main.js respawns at the same
// moment as before); these hold the card inside the wait.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { killcamTiming, killerWorthShowing, createKillcamState, startKillcam, setKiller, seeKiller, stepKillcam, skipKillcam, killcamCamera, killcamBars, plaqueText, killcamShowing } from '../src/killcam.js';
import { KILLCAM } from '../src/config/death-flow.js';
import { DEATH_MENU_DELAY, RESPAWN_TIME } from '../src/ui/death-screen.js';
import { FFA_RESPAWN } from '../src/duel.js';
import { SETTINGS } from '../src/config/match.js';

const body = { x: 10, z: 4, directionX: 1, directionZ: 0 };
const killer = { id: 'robot-1', name: 'BOT 1', weapon: 'rifle', oneShot: false };
const run = (s, to, dt = 1 / 60) => { for (let t = s.age; t < to; t += dt) stepKillcam(s, t); stepKillcam(s, to); return s; };

test('brief: the zoom, then the killer, the card at about 2.8 s (was 2.6 s without one)', () => {
 const t = killcamTiming(Infinity);
 assert.equal(t.on, true);
 assert.equal(t.zoomEnd, KILLCAM.zoom); assert.ok(t.zoomEnd < 2.2, 'the zoom onto the body is quicker than the plain death shot');
 assert.ok(t.cardAt - t.zoomEnd >= 1.2 && t.cardAt - t.zoomEnd <= 2, 'about a second and a half on the killer');
 assert.ok(t.cardAt <= 2.85 && t.cardAt - DEATH_MENU_DELAY <= .25, 'the whole thing is brief: ' + t.cardAt);
});

test('never lengthens a respawn: the card always keeps its time inside every wait', () => {
 const waits = [RESPAWN_TIME, FFA_RESPAWN, ...SETTINGS.respawn.values, 4.5, 4, 3.8, 3, 2, 1];
 for (const wait of waits) {
  const t = killcamTiming(wait);
  if (t.on) {
   assert.ok(t.cardAt + KILLCAM.minCard <= wait + 1e-9, `wait ${wait}: the card is up ${wait - t.cardAt} s before the respawn`);
   assert.ok(t.camEnd - t.zoomEnd >= KILLCAM.least - 1e-9, 'never a sliver of a killcam');
  } else assert.equal(t.cardAt, DEATH_MENU_DELAY, `wait ${wait}: too short for one, the card as before`);
 }
 // Practice (5 s) and FFA (6 s) both get it, shortened if they must be.
 assert.equal(killcamTiming(RESPAWN_TIME).on, true); assert.equal(killcamTiming(FFA_RESPAWN).on, true);
 assert.ok(killcamTiming(4).camEnd - killcamTiming(4).zoomEnd < KILLCAM.follow, 'a 4 s wait shortens it');
 assert.equal(killcamTiming(3).on, false, 'a 3 s wait has no room for one');
});

test('main.js respawns on the same clock as before: the killcam only moves the card', () => {
 const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
 assert.ok(main.includes('if(deathElapsed>=wait)respawnPractice();'), 'practice and BOTS FFA respawn at their wait, killcam or not');
 assert.ok(main.includes('deathElapsed>=killcam.cardAt'), 'the card comes when the killcam is done');
 assert.ok(!/killcam[^\n]*respawnIn/.test(main), 'nothing of the killcam touches the online respawn');
});

test('no killcam without a killer: your own blast, the storm, fire', () => {
 assert.equal(killerWorthShowing(null), false);
 assert.equal(killerWorthShowing({ id: 'me' }, 'me'), false, 'yourself');
 assert.equal(killerWorthShowing({ id: null, storm: true }), false, 'the storm');
 assert.equal(killerWorthShowing({ id: 'p1' }, 'me'), true);
 const s = run(startKillcam(createKillcamState(), { body, hp0: .4, wait: 5 }), 1);
 assert.equal(s.on, false); assert.equal(s.cardAt, DEATH_MENU_DELAY, 'the plain death shot, the card as now');
 assert.equal(killcamCamera(s, { x: 0, z: 0, height: 29 }, { x: 1, z: 1, height: 20 }), null, 'the plain camera');
 const bars = killcamBars(s);
 assert.ok(!bars.you.show && !bars.killer.show && !bars.plaque, 'no bars, no plaque');
 assert.equal(skipKillcam(s), false, 'nothing to skip: the plain death screen comes as it always did');
});

test('online: the killer learned from the kill feed a moment later still gets one; too late does not', () => {
 const s = startKillcam(createKillcamState(), { body, hp0: 1, wait: 6 });
 stepKillcam(s, .05); setKiller(s, killer); run(s, .5);
 assert.equal(s.on, true); assert.equal(s.killer.name, 'BOT 1');
 const late = run(startKillcam(createKillcamState(), { body, wait: 6 }), KILLCAM.decide + .05);
 setKiller(late, killer); run(late, 1);
 assert.equal(late.on, false, 'decided already: no cut half way through the zoom');
});

test('skip: an attack key or a tap goes straight to the card (not in the first moment, not twice)', () => {
 const s = startKillcam(createKillcamState(), { body, hp0: .5, wait: 5, killer });
 run(s, .1); assert.equal(skipKillcam(s), false, 'the trigger finger was already down');
 run(s, 1.6); assert.equal(killcamShowing(s), true);
 assert.equal(skipKillcam(s), true);
 assert.ok(Math.abs(s.cardAt - 1.6) < .02, 'the card comes now'); assert.equal(killcamShowing(s), false);
 assert.equal(skipKillcam(s), false, 'once');
 // main.js: the skip opens the card, attack keys and E skip only before it.
 const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
 assert.ok(main.includes('if(!deathMenuOpen&&killcam.skipKey(e,gameCode))'));
});

test('the death card comes after the killcam: cardAt is where it ends', () => {
 const s = run(startKillcam(createKillcamState(), { body, hp0: .3, wait: 6, killer }), 2.7);
 assert.equal(killcamShowing(s), true);
 run(s, s.cardAt + .01);
 assert.equal(killcamShowing(s), false);
 assert.ok(!killcamBars(s).plaque, 'the plaque goes as the card comes');
});

test('the camera: the zoom onto the body, over to the killer (live), back to the body with the card', () => {
 const start = { x: 0, z: 0, height: 29 }, base = { x: 10.65, z: 4, height: 16 }, out = { x: 0, z: 0, height: 0 };
 const s = startKillcam(createKillcamState(), { body, hp0: .6, wait: Infinity, killer });
 run(s, .1); assert.equal(killcamCamera(s, start, base), null, 'undecided: the plain shot');
 run(s, KILLCAM.decide); const first = { ...killcamCamera(s, start, base, 16 / 9, out) };
 assert.ok(Math.hypot(first.x - base.x, first.z - base.z) < .5 && Math.abs(first.height - base.height) < .5, 'taken over without a jump');
 seeKiller(s, { x: 40, z: 4, hp: 64, maxHp: 100 });
 run(s, s.zoomEnd); const zoomed = { ...killcamCamera(s, start, base, 16 / 9, out) };
 assert.ok(Math.abs(zoomed.x - 10.65) < .05 && Math.abs(zoomed.height - 29 * .56) < .05, 'on the body, zoomed in');
 run(s, s.camEnd - .05); const onKiller = { ...killcamCamera(s, start, base, 16 / 9, out) };
 assert.ok(Math.abs(onKiller.x - 40) < .2, 'a far killer is followed where they are: ' + onKiller.x);
 seeKiller(s, { x: 44, z: 6, hp: 64, maxHp: 100 }); run(s, s.camEnd - .02);
 assert.ok(killcamCamera(s, start, base, 16 / 9, out).x > 43, 'live: they moved, the camera with them');
 run(s, s.camEnd + KILLCAM.back + .01);
 assert.equal(killcamCamera(s, start, base, 16 / 9, out), null, 'the card is up: the plain framing again');
});

test('a killer close by is framed with your body', () => {
 const start = { x: 0, z: 0, height: 29 }, base = { x: 10.65, z: 4, height: 16 };
 const s = startKillcam(createKillcamState(), { body, hp0: .6, wait: Infinity, killer });
 seeKiller(s, { x: 20, z: 8, hp: 50, maxHp: 100 });
 run(s, 2.6);
 const f = killcamCamera(s, start, base, 16 / 9);
 assert.ok(f.x > 11 && f.x < 20, 'between the two'); assert.ok(f.height >= 29 * .56 - 1e-9 && f.height <= 29 * 1.05 + 1e-9);
});

test('the bars: yours from your health before the hit to nothing, the killer\'s their health now', () => {
 const s = startKillcam(createKillcamState(), { body, hp0: .42, wait: 6, killer });
 run(s, KILLCAM.decide + .01);
 let bars = killcamBars(s);
 assert.ok(bars.you.show); assert.ok(Math.abs(bars.you.fill - .42) < .01, 'starts at the health you had');
 assert.equal(bars.you.x, body.x); assert.equal(bars.you.z, body.z);
 run(s, KILLCAM.drainDelay + KILLCAM.drain + .05); bars = killcamBars(s);
 assert.equal(bars.you.fill, 0, 'runs out');
 seeKiller(s, { x: 30, z: 2, hp: 37, maxHp: 100 }); run(s, s.zoomEnd + .1); bars = killcamBars(s);
 assert.ok(bars.killer.show); assert.ok(Math.abs(bars.killer.fill - .37) < 1e-9); assert.equal(bars.killer.x, 30);
 assert.ok(bars.plaque);
 seeKiller(s, null); bars = killcamBars(s);
 assert.equal(bars.killer.fill, 0, 'gone from sight (down): empty, at their last place'); assert.equal(bars.killer.x, 30);
});

test('the plaque: KILLED BY name · weapon (one shot by, from full health)', () => {
 assert.deepEqual(plaqueText(killer, id => ({ rifle: 'Nominal' })[id]), { by: 'killed by', name: 'BOT 1', weapon: 'Nominal' });
 assert.equal(plaqueText({ ...killer, oneShot: true }).by, 'one shot by');
 assert.equal(plaqueText(null), null);
});

test('media mode: the killcam joins a toggle and shows in both presets', async () => {
 const { MEDIA_ELEMENTS, MEDIA_PRESETS } = await import('../src/ui/media-mode.js');
 assert.ok(MEDIA_ELEMENTS.some(e => e.id === 'killcam'));
 assert.equal(MEDIA_PRESETS.clean.killcam, true); assert.equal(MEDIA_PRESETS.minimal.killcam, true);
 const hud = readFileSync(new URL('../src/ui/killcam-hud.js', import.meta.url), 'utf8');
 assert.ok(hud.includes("setAttribute('data-media', 'killcam')"));
});

test('a screen that hears of the death late (or runs slow) cuts the killcam, never the card', async () => {
 const { fitKillcam } = await import('../src/killcam.js');
 const s = startKillcam(createKillcamState(), { body, hp0: .5, wait: 6, killer });
 run(s, 1);
 fitKillcam(s, 2.5); // the host's countdown says 2.5 s to go
 assert.ok(Math.abs(s.cardAt - (1 + 2.5 - KILLCAM.minCard)) < 1e-9, 'the card keeps its time: ' + s.cardAt);
 fitKillcam(s, 1); assert.equal(s.cardAt, 1, 'no time left for it: the card now');
 const t = startKillcam(createKillcamState(), { body, wait: Infinity, killer }); run(t, 1);
 const was = t.cardAt; fitKillcam(t, Infinity); assert.equal(t.cardAt, was, 'no respawn of your own: nothing to fit');
});
