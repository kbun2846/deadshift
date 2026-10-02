// The living menu (owner, 2026-10-02: "Loading straight into a lobby-like
// main menu with a looping background match behind the menu"): who may run
// it, the match itself (attract-mode.js), and its life on the page
// (attract-wiring.js): after the menu shows, gone the moment a game starts,
// never on Potato or a low-end device, and off for a while where it ran slow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AttractMatch, ATTRACT, attractAllowed, attractSpots, attractSpot } from '../src/attract-mode.js';
import { installAttract, readAttractStore, ATTRACT_KEY, SLOW, THINK_BUDGET } from '../src/attract-wiring.js';
import { mapById } from '../src/maps.js';
import { tutorialMapFor } from '../src/tutorial.js';
import { Simulation } from '../src/simulation.js';

const seeded = (seed = 11) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const memory = (seed = {}) => { const data = new Map(Object.entries(seed)); return { data, getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) }; };
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
// A stand-in for the renderer: records what the match hands it.
function fakeView() {
 const v = { updates: 0, events: 0, resets: 0, cuts: 0, restored: [], scale: 1, remotePlayers: null, lastSim: null,
  update(sim) { v.updates++; v.lastSim = sim; }, netEvent(e) { v.events++; if (e.type === 'propRestore') v.restored.push(e); }, event() { v.events++; },
  reset(sim) { v.resets++; v.resetWith = sim; v.remotePlayers = []; }, cutCamera() { v.cuts++; }, setResolutionScale(s) { v.scale = s; }, gpuBusy: () => false };
 return v;
}
// A capable device (the test machine's own may have few cores).
const device = () => ({ memory: 8, cores: 8, reducedMotion: false });
const classes = () => { const set = new Set(); return { set, classList: { toggle: (c, on) => (on ? set.add(c) : set.delete(c)) } }; };

test('who runs it: never on Potato, in software, on small devices, with reduced motion, or on the tutorial range', () => {
 const map = mapById('deadwater');
 assert.equal(attractAllowed({ map, quality: 'performance' }).ok, true);
 assert.equal(attractAllowed({ map, quality: 'balanced', memory: 4, cores: 4 }).ok, true);
 for (const [why, env] of [['potato preset', { quality: 'potato' }], ['software drawing', { software: true }], ['little memory', { memory: 2 }], ['few cores', { cores: 2 }], ['reduced motion', { reducedMotion: true }], ['ran slow here', { slowUntil: Date.now() + 1000 }]]) {
  const r = attractAllowed({ map, quality: 'performance', ...env });
  assert.equal(r.ok, false, why); assert.equal(r.why, why);
 }
 assert.equal(attractAllowed({ map, slowUntil: Date.now() - 1000 }).ok, true, 'the slow mark wears off');
 assert.equal(attractAllowed({ map: tutorialMapFor('static') }).ok, false);
 assert.equal(attractAllowed({ map: null }).ok, false);
 assert.equal(attractAllowed({ map, quality: 'potato', force: 'on' }).ok, true, 'a development build may force it');
 assert.equal(attractAllowed({ map, force: 'off' }).ok, false);
});

test('each page load opens on the next of the map\'s good-looking spots', () => {
 for (const id of ['deadwater', 'hollow-wick', 'lumen']) {
  const map = mapById(id), spots = attractSpots(map);
  assert.ok(spots.length >= 2, id);
  for (const s of spots) assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z));
  assert.deepEqual(attractSpot(map, 0), spots[0]); assert.deepEqual(attractSpot(map, 1), spots[1 % spots.length]);
  assert.deepEqual(attractSpot(map, spots.length), spots[0]);
 }
});

test('the match: bots fight and fall and come back near the camera, nothing touches the page\'s own sim', () => {
 const map = mapById('deadwater'), page = new Simulation(map), pageBefore = JSON.stringify(page.player);
 const m = new AttractMatch({ map, random: seeded(), bots: ATTRACT.bots }).start();
 assert.equal(m.bots.count, ATTRACT.bots); assert.equal(m.bots.youOut, true);
 assert.equal(m.sim.dev.ghost, true); assert.equal(m.sim.targets.length, 0);
 let deaths = 0, events = 0;
 const view = fakeView();
 for (let i = 0; i < 60 * 40; i++) { const out = m.step(1 / 60); events += out.length; deaths += out.filter(o => o.e.type === 'playerDeath' || o.e.type === 'kill').length; m.feed(view, out); }
 assert.ok(deaths >= 2, 'they fight to the death (' + deaths + ')');
 assert.ok(m.bots.living().length >= 1);
 // The camera (the ghost) stays near its spot.
 assert.ok(Math.hypot(m.sim.player.x - m.spot.x, m.sim.player.z - m.spot.z) <= ATTRACT.leash + ATTRACT.drift + .5);
 assert.equal(m.sim.player.hp, m.sim.player.maxHp, 'the ghost is never hurt');
 assert.ok(view.events > 0);
 m.draw(view, 1 / 30);
 assert.equal(view.updates, 1); assert.equal(view.remotePlayers.length, m.bots.living().length);
 // A long frame never makes it step a pile of ticks at once.
 const ticks = []; const tick = m.tick.bind(m); m.tick = out => { ticks.push(1); tick(out); };
 m.step(2); assert.ok(ticks.length <= ATTRACT.maxSteps);
 assert.equal(JSON.stringify(page.player), pageBefore, 'the page\'s sim untouched');
});

test('stop frees everything and puts the view back on the page\'s sim', () => {
 const map = mapById('hollow-wick'), page = new Simulation(map);
 const m = new AttractMatch({ map, random: seeded(3) }).start();
 for (let i = 0; i < 600; i++) m.step(1 / 60);
 // A prop broken in the match stands again on the view afterwards.
 const prop = m.sim.props.find(p => p.hp !== null); prop.hp = 0;
 const view = fakeView();
 assert.equal(m.stop(view, page), true);
 assert.equal(m.active, false); assert.equal(m.sim, null); assert.equal(m.bots, null);
 assert.equal(view.resets, 1); assert.equal(view.resetWith, page); assert.ok(view.cuts >= 1);
 assert.deepEqual(view.remotePlayers, []);
 assert.ok(view.restored.some(e => e.id === prop.id && e.quiet), 'the broken prop comes back, quietly');
 assert.equal(m.stop(view, page), false, 'a second stop is nothing');
 assert.deepEqual(m.step(1), []);
});

test('on the page: it starts only after the menu shows, stops the moment a game starts, and frees its state', async () => {
 const map = mapById('deadwater'), page = new Simulation(map), view = fakeView(), body = classes(), store = memory();
 let blocked = false;
 const a = installAttract({ map, view, sim: page, blocked: () => blocked, quality: () => 'performance', body, storage: store, random: seeded(5), device });
 assert.equal(a.active, false, 'nothing at first paint');
 a.frame(1 / 60); assert.equal(a.active, false);
 a.schedule(0); assert.equal(a.active, false, 'not at once');
 await new Promise(r => setTimeout(r, 5));
 assert.equal(a.active, true);
 assert.equal(view.scale, ATTRACT.scale, 'drawn at a share of the preset\'s size');
 assert.equal(readAttractStore(store).turn, 1, 'the next spot next load');
 // Drawn at most ATTRACT.fps: 60 display frames, about 30 drawn.
 for (let i = 0; i < 60; i++) a.frame(1 / 60);
 assert.ok(view.updates >= 25 && view.updates <= 31, 'drawn ' + view.updates);
 assert.ok(body.set.has('attract-live'));
 // A game starts.
 blocked = true; a.stop();
 assert.equal(a.active, false); assert.equal(a.match, null);
 assert.ok(!body.set.has('attract-live'));
 assert.equal(view.resets, 1); assert.equal(view.scale, 1);
 const drawn = view.updates; a.frame(1 / 60); assert.equal(view.updates, drawn, 'nothing more drawn');
 // Back to the menu: it comes back.
 blocked = false; a.schedule(0); await new Promise(r => setTimeout(r, 5));
 assert.equal(a.active, true);
 // Something else takes the screen (online lobby, layout editor): it goes by itself.
 blocked = true; a.frame(1 / 60); assert.equal(a.active, false);
 // ...and comes back once it lets go (a JOIN that went nowhere).
 blocked = false; a.frame(1 / 60); await new Promise(r => setTimeout(r, 900));
 assert.equal(a.active, true);
 blocked = true; a.frame(1 / 60); assert.equal(a.active, false);
 // A scheduled start that a game beat is dropped.
 blocked = false; a.schedule(0); a.stop(); await new Promise(r => setTimeout(r, 5));
 assert.equal(a.active, false);
});

test('never on Potato or a low-end device; a slow device is left alone for a week', async () => {
 const map = mapById('deadwater'), view = fakeView();
 const potato = installAttract({ map, view, sim: new Simulation(map), blocked: () => false, quality: () => 'potato', body: classes(), storage: memory(), device });
 potato.schedule(0); await new Promise(r => setTimeout(r, 5)); assert.equal(potato.active, false);
 const soft = installAttract({ map, view, sim: new Simulation(map), blocked: () => false, quality: () => 'performance', tier: { tier: 'performance', why: 'software drawing' }, body: classes(), storage: memory(), device });
 soft.schedule(0); await new Promise(r => setTimeout(r, 5)); assert.equal(soft.active, false);
 // A small device, or reduced motion asked for: not at all.
 for (const d of [{ memory: 2, cores: 8 }, { memory: 8, cores: 2 }, { memory: 8, cores: 8, reducedMotion: true }]) {
  const small = installAttract({ map, view, sim: new Simulation(map), blocked: () => false, quality: () => 'performance', body: classes(), storage: memory(), device: () => d });
  small.schedule(0); await new Promise(r => setTimeout(r, 5)); assert.equal(small.active, false, JSON.stringify(d));
 }
 // Switched to Potato while it runs: it stops.
 let quality = 'performance';
 const live = installAttract({ map, view: fakeView(), sim: new Simulation(map), blocked: () => false, quality: () => quality, body: classes(), storage: memory(), random: seeded(9), device });
 live.schedule(0); await new Promise(r => setTimeout(r, 5)); assert.equal(live.active, true);
 quality = 'potato'; live.frame(1 / 60); assert.equal(live.active, false);
 // Too slow on screen once settled: it stops and is not tried again for SLOW.days.
 const store = memory();
 const slow = installAttract({ map, view: fakeView(), sim: new Simulation(map), blocked: () => false, quality: () => 'performance', body: classes(), storage: store, random: seeded(2), device });
 slow.schedule(0); await new Promise(r => setTimeout(r, 5));
 for (let t = 0; t < SLOW.settle + SLOW.window + .5 && slow.active; t += .1) slow.frame(.1);
 assert.equal(slow.active, false);
 const until = readAttractStore(store).slowUntil;
 assert.ok(until > Date.now() + (SLOW.days - .1) * 864e5);
 slow.schedule(0); await new Promise(r => setTimeout(r, 5)); assert.equal(slow.active, false);
 // Bad saved data is ignored.
 assert.deepEqual(readAttractStore(memory({ [ATTRACT_KEY]: 'nope' })), { turn: 0, slowUntil: 0 });
 assert.deepEqual(readAttractStore(memory({ [ATTRACT_KEY]: '{"turn":-3,"slowUntil":"x"}' })), { turn: 0, slowUntil: 0 });
});

test('too costly to think about: one bot fewer, never under two', async () => {
 const map = mapById('deadwater');
 const m = new AttractMatch({ map, random: seeded(4), bots: 4 }).start();
 assert.equal(m.shed(), true); assert.equal(m.bots.count, 3);
 m.shed(); assert.equal(m.bots.count, 2);
 assert.equal(m.shed(), false); assert.equal(m.bots.count, 2);
 // On the page: stepping over THINK_BUDGET for its window sheds one.
 const a = installAttract({ map, view: fakeView(), sim: new Simulation(map), blocked: () => false, quality: () => 'performance', body: classes(), storage: memory(), random: seeded(6), device, force: 'on' });
 a.schedule(0); await new Promise(r => setTimeout(r, 5));
 const before = a.match.bots.count, step = a.match.step.bind(a.match);
 a.match.step = dt => { const until = performance.now() + THINK_BUDGET.msPerSecond * dt * 1.6; while (performance.now() < until); return step(dt); };
 for (let t = 0; t < THINK_BUDGET.window + .15; t += .1) a.frame(.1);
 assert.equal(a.match.bots.count, before - 1);
 a.stop();
});

test('main.js: scheduled when the menu shows, stopped first thing in start(), drawn only when no game runs', () => {
 const main = read('../src/main.js');
 assert.match(main, /async function start\(weapon=sim\.weapon,course\) \{\n  if \(started\) return;\n  attract\.stop\(\);/);
 assert.match(main, /\$\('gamemodes'\)\.focus\(\);\n  attract\.schedule\(\);/);
 assert.match(main, /\} else attract\.frame\(dt\);/);
 assert.match(main, /blocked:\(\)=>started\|\|online\.active\|\|layoutPreview\|\|lobbyScreen\.open/);
 assert.match(main, /function openLayoutPreview\(\)\{\n attract\.stop\(\);/);
 // Nothing of it is heard: the match never touches the sound.
 assert.doesNotMatch(read('../src/attract-mode.js') + read('../src/attract-wiring.js'), /\bsound\.\w+\(|Soundscape/);
});
