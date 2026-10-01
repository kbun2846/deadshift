// The storm (and 1V1's duel circle) on the M map (src/ui/overhead-zones.js,
// overhead-map.js overheadMapLive). Owner, 2026-10-01: "also map isnt showing
// the storm in some gamemodes/servers". Two causes: Lumen's map
// (overhead-city.js) never drew the storm layer, and the open map was drawn
// once, when it opened, so online (where the match runs on under it) the
// storm closed in the world and stood still on the map, and a storm or duel
// circle that began after it opened (a new round) never appeared. The world
// and the map now read one state: main.js stepStormScreen's overheadZones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { maps, mapColliders } from '../src/maps.js';
import { Simulation } from '../src/simulation.js';
import { stormPlan, stormAt, STORM } from '../src/storm.js';
import { circleState } from '../src/duel-circle.js';
import { createLoopback } from '../src/net/transport.js';
import { HostSession } from '../src/net/host-session.js';
import { ClientSession } from '../src/net/client-session.js';
import { BotMatch } from '../src/bots/bot-match.js';
import { createDuel } from '../src/duel.js';
import { overheadMapSVG, overheadMapLive } from '../src/ui/overhead-map.js';
import { overheadZones, zonesSVG, NO_ZONES, LIVE_LAYER_ID } from '../src/ui/overhead-zones.js';
import { arena, tick, takePoint, breakOf, people, seeded } from './rules-harness.js';
import { Arena } from '../src/net/arena.js';

const MAPS = ['deadwater', 'hollow-wick', 'lumen'];
// Deadwater's drawing reads the road profile off the view; the others need nothing.
const VIEW = { roadProfile: [{ z: -124, left: -4, right: 4 }, { z: 124, left: 51, right: 59 }] };
const r2 = v => Math.round(v * 100) / 100;
// What the map shows: the storm's edge, its final zone, the duel circle.
const drawn = svg => {
 const ring = (stroke, extra = '') => { const m = svg.match(new RegExp(`<circle cx="([-\\d.]+)" cy="([-\\d.]+)" r="([\\d.]+)" fill="none" stroke="${stroke}"${extra}`)); return m ? { x: +m[1], z: +m[2], r: +m[3] } : null; };
 return { storm: ring('#ff4a3d'), final: ring('#ffe2d6'), duel: ring('#d0243a'), wash: svg.includes('fill="#b3121f"'), dim: svg.includes('<path fill="#000" opacity=".28"') };
};
const same = (a, b, tol = .011) => !!a && !!b && Math.abs(a.x - b.x) < tol && Math.abs(a.z - b.z) < tol && Math.abs(a.r - b.r) < tol;
const arenaOn = (id, mode, settings = {}) => {
 const a = new Arena({ map: maps[id], createSim: m => new Simulation(m), random: seeded(3), settings });
 a.addSeat('host', 'Hosty'); assert.ok(a.startRound(mode), a.startError); for (const s of people(a)) a.choose(s.id, 'rifle'); tick(a, .5);
 return a;
};

test('every map draws the storm: the red outside, its edge and the dashed final zone (Lumen drew none)', () => {
 for (const id of MAPS) {
  const map = maps[id], plan = stormPlan(map, mapColliders(map), { kind: 'round', random: seeded(5) });
  for (const t of [0, 40, STORM.close + 5, STORM.close + STORM.hold + 10]) {
   const zones = overheadZones({ plan, t }, null), d = drawn(overheadMapSVG(map, VIEW, { x: 1, z: 2 }, zones));
   assert.ok(same(d.storm, stormAt(plan, t)), `${id} at ${t} s: the storm's edge where the world has it`);
   assert.ok(same(d.final, { x: plan.x1, z: plan.z1, r: plan.r1 }), `${id}: the final zone`);
   assert.ok(d.wash, `${id}: the red outside`);
   assert.equal(d.duel, null, id);
  }
  // 1V1's duel circle, the same way.
  const circle = { x: 4, z: -6, r: 21 }, d = drawn(overheadMapSVG(map, VIEW, null, overheadZones(null, circle)));
  assert.ok(same(d.duel, circle) && d.dim, `${id}: the duel circle`);
  assert.equal(d.storm, null, id);
  // Nothing at all: no storm, no circle (practice, the tutorial, the menus).
  const none = drawn(overheadMapSVG(map, VIEW, null));
  assert.ok(!none.storm && !none.duel && !none.wash && !none.dim, `${id}: nothing to show`);
 }
});

test('the look is the map\'s storm look (unchanged): red wash at .32, a 1.1 red edge, the final zone dashed; the duel circle dimmed outside', () => {
 const svg = zonesSVG({ storm: { x: 1, z: 2, r: 30 }, final: { x: 3, z: 4, r: 12 }, duel: null });
 assert.ok(svg.includes('<path fill="#b3121f" opacity=".32" fill-rule="evenodd" d="M-9999 -9999H9999V9999H-9999Z M-29 2a30 30 0 1 0 60 0a30 30 0 1 0 -60 0Z"/>'));
 assert.ok(svg.includes('<circle cx="1" cy="2" r="30" fill="none" stroke="#ff4a3d" stroke-width="1.1"/>'));
 assert.ok(svg.includes('<circle cx="3" cy="4" r="12" fill="none" stroke="#ffe2d6" stroke-width=".7" stroke-dasharray="2.4 1.6" opacity=".85"/>'));
 assert.equal(zonesSVG(NO_ZONES), '');
 // On top of every map's drawing, under nothing but you.
 for (const id of MAPS) {
  const svg2 = overheadMapSVG(maps[id], VIEW, { x: 1, z: 2 }, overheadZones({ plan: stormPlan(maps[id], [], { random: seeded(2) }), t: 30 }, null));
  const live = svg2.indexOf(`<g id="${LIVE_LAYER_ID}">`);
  assert.ok(live > 0 && svg2.indexOf('stroke="#ff4a3d"') > live && svg2.lastIndexOf('r="1.65"') > svg2.indexOf('stroke="#ff4a3d"'), id);
  assert.ok(/<\/g>\s*<\/svg>$/.test(svg2), id);
 }
});

test('the server and a peer-to-peer host: every storm mode on the map as the arena has it; 1V1 its circle; practice nothing', () => {
 for (const id of MAPS) for (const mode of ['ffa', '2v2', '3v3', '4v4', '2v2v2', '1v1', 'practice']) {
  const a = arenaOn(id, mode); tick(a, 20);
  // (HostSession.stormNow and online.match().circle, as main.js reads them.)
  const zones = overheadZones(a.stormPlan ? { plan: a.stormPlan, t: a.stormClock } : null, a.matchState().circle);
  const d = drawn(overheadMapSVG(maps[id], VIEW, null, zones));
  if (mode === '1v1') { assert.ok(same(d.duel, a.duelCircle, .02), `${id} 1v1`); assert.equal(d.storm, null); continue; }
  if (mode === 'practice') { assert.deepEqual(zones, NO_ZONES); continue; }
  assert.ok(a.storm, `${id} ${mode}: a storm in the world`);
  assert.ok(same(d.storm, a.storm), `${id} ${mode}: on the map where the world has it`);
 }
});

test('a joiner on the game server (no local host) and a peer-to-peer joiner: the storm on the map from the match state, live, a new one each round', () => {
 for (const [id, dedicated] of [['deadwater', true], ['lumen', true], ['hollow-wick', false]]) {
  const map = maps[id], createSim = m => new Simulation(m), net = createLoopback(); let time = 0;
  const hostSim = dedicated ? null : createSim(map);
  const host = new HostSession({ transport: net.host('ABCDE'), map, local: hostSim, createSim, now: () => time, name: 'Hosty', random: seeded(3) });
  const sim = createSim(map), client = new ClientSession({ transport: net.join('ABCDE'), map, local: sim, createSim, now: () => time, name: 'P0' });
  const step = n => { for (let i = 0; i < n; i++) { time += 1 / 60; if (hostSim) hostSim.step(host.beforeLocal({})); sim.step(client.input({})); sim.drainEvents(); net.flush(); host.step(); hostSim?.drainEvents(); net.flush(); } };
  step(5); assert.ok(client.welcomed, id);
  assert.ok(host.startRound('2v2'), host.startError); client.choose('rifle'); step(30);
  const root = fakeRoot(), live = overheadMapLive(root);
  const zonesNow = () => overheadZones(client.stormNow(), client.match()?.circle);
  // Opened now, kept open while the match runs on.
  live.draw(map, VIEW, sim.player, zonesNow());
  const first = drawn(root.innerHTML).storm;
  assert.ok(same(first, host.arena.storm, .6), `${id}: the joiner's map has the host's storm`);
  step(60 * 8);
  live.refresh(sim.player, zonesNow());
  const later = drawn(root.innerHTML).storm;
  assert.ok(later.r < first.r - 5, `${id}: still open 8 s on, the storm has closed in on the map too (${first.r} -> ${later.r})`);
  assert.ok(same(later, host.arena.storm, .6), `${id}: as the host has it`);
  // The next round: a new storm (from the whole map again), on the open map.
  const plan = host.arena.stormPlan; takePoint(host.arena, host.arena.sideOf(people(host.arena)[0])); step(60 * (breakOf(host.arena) + .5));
  assert.notEqual(host.arena.stormPlan, plan, 'a new round, a new storm');
  live.refresh(sim.player, zonesNow());
  assert.ok(same(drawn(root.innerHTML).storm, host.arena.storm, .6), `${id}: the new round's storm on the open map`);
  assert.ok(same(drawn(root.innerHTML).final, { x: host.arena.stormPlan.x1, z: host.arena.stormPlan.z1, r: host.arena.stormPlan.r1 }, .02), `${id}: and its final zone`);
 }
});

test('SOLO against robots: FFA and the team modes show duel.js\'s storm; 1V1 its circle', () => {
 const el = () => ({ hidden: false, className: '', innerHTML: '', textContent: '', classList: { add() {}, remove() {}, contains: () => true, toggle() {} }, setAttribute() {}, append() {}, querySelector: () => el(), focus() {} });
 const previous = globalThis.document; globalThis.document = { createElement: el };
 try {
  for (const id of ['deadwater', 'lumen']) for (const mode of ['ffa', '2v2', '1v1']) {
   const map = maps[id], sim = new Simulation(map), bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(9) });
   const duel = createDuel(el(), { sim, bots, random: seeded(2) });
   duel.begin({ mode, firstTo: 3, length: 300 });
   if (mode === '1v1') duel.placeDuel();
   const zones = overheadZones(duel.stormNow(), duel.circle), d = drawn(overheadMapSVG(map, VIEW, sim.player, zones));
   if (mode === '1v1') { assert.ok(same(d.duel, duel.circle), `${id} 1v1: the circle`); assert.equal(d.storm, null); }
   else { assert.ok(duel.storm, `${id} ${mode}: a storm`); assert.ok(same(d.storm, duel.storm), `${id} ${mode}: on the map`); }
   duel.stop();
  }
 } finally { globalThis.document = previous; }
});

// A stand-in for #overhead-image: innerHTML, and the live layer found in it.
function fakeRoot() {
 const root = { html: '' };
 const layer = { set innerHTML(v) { const at = root.html.indexOf(`<g id="${LIVE_LAYER_ID}">`) + `<g id="${LIVE_LAYER_ID}">`.length, end = root.html.lastIndexOf('</g>'); root.html = root.html.slice(0, at) + v + root.html.slice(end); } };
 return Object.defineProperties(root, {
  innerHTML: { get() { return root.html; }, set(v) { root.html = v; } },
  querySelector: { value: sel => (sel === '#' + LIVE_LAYER_ID && root.html.includes(`<g id="${LIVE_LAYER_ID}">`) ? layer : null) },
 });
}

test('the open map is live: opened before the storm (or between rounds) it shows it when it comes; it follows it; it redraws only on a change', () => {
 for (const id of MAPS) {
  const map = maps[id], root = fakeRoot(), live = overheadMapLive(root), plan = stormPlan(map, [], { random: seeded(7) });
  live.draw(map, VIEW, { x: 0, z: 0 }, NO_ZONES);
  assert.equal(drawn(root.innerHTML).storm, null, 'nothing yet');
  const body = root.innerHTML.slice(0, root.innerHTML.indexOf(`<g id="${LIVE_LAYER_ID}">`));
  assert.equal(live.refresh({ x: 0, z: 0 }, overheadZones({ plan, t: 10 }, null)), true);
  assert.ok(same(drawn(root.innerHTML).storm, stormAt(plan, 10)), `${id}: the storm, once it starts`);
  assert.equal(live.refresh({ x: 0, z: 0 }, overheadZones({ plan, t: 10 }, null)), false, 'no change, no redraw');
  live.refresh({ x: 3, z: 1 }, overheadZones({ plan, t: 60 }, null));
  assert.ok(same(drawn(root.innerHTML).storm, stormAt(plan, 60)), `${id}: and follows it`);
  assert.ok(root.innerHTML.includes('cx="3" cy="1" r="1.65"'), 'and you');
  assert.ok(root.innerHTML.startsWith(body), 'the rest of the map untouched');
  // 1V1's next circle.
  live.refresh({ x: 3, z: 1 }, overheadZones(null, circleState({ x: 5, z: 5, r: 20 })));
  const d = drawn(root.innerHTML); assert.ok(same(d.duel, { x: 5, z: 5, r: 20 }) && !d.storm, `${id}: the duel circle`);
  // (Lumen's live dot in the city's own colours.)
  if (id === 'lumen') assert.ok(root.innerHTML.includes('r="1.65" fill="#c7efff"'));
 }
});

test('main.js: the world and the map read one storm state, and the open map is refreshed every frame', () => {
 const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
 assert.match(src, /mapZones=overheadZones\(now,duelCircle\)/, 'stepStormScreen makes the one state');
 assert.match(src, /view\.setStorm\(circle,tension,mapZones\.final\)/, 'the world draws it');
 assert.match(src, /const circle=mapZones\.storm/, 'the world\'s circle is the map\'s');
 assert.match(src, /view\.setDuelCircle\(duelCircle\)/);
 assert.match(src, /stepStormScreen\(dt,duelCircle\)/);
 assert.match(src, /if\(mapOpen\)overheadMap\.refresh\(sim\.player,mapZones\)/, 'live while open');
 assert.ok(!/overheadMapSVG\(map,view,sim\.player\)/.test(src), 'never drawn without the zones');
 assert.ok(!/stormView\??\.circle|duelCircleView\??\.circle/.test(readFileSync(new URL('../src/ui/overhead-hills.js', import.meta.url), 'utf8')), 'the map no longer reads the renderer');
});
