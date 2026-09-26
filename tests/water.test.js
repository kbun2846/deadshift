// The stream's water (render/water-mesh.js), its field (effects/water-field.js)
// and what moves on it (effects/water-effects.js): the ladder per preset, the
// ford's shallow pebble bed, splashes instead of dust, a spout, wading
// (keyed on the ground being under the water's surface, not on the ford),
// blood spreading and drifting downstream, and nothing at all on a map
// without water.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { Simulation } from '../src/simulation.js';
import { maps, groundFor } from '../src/maps.js';
import { WaterField, waterDepth, swellAt, FLOW } from '../src/effects/water-field.js';
import { buildWaterMesh, WATER_LOOK, WATER_OPACITY } from '../src/render/water-mesh.js';
import { CROSSINGS } from '../src/maps/hollow-wick-crossings.js';
import { WATER_DETAIL } from '../src/effects/water-effects.js';

const PRESETS = ['potato', 'performance', 'balanced', 'quality', 'extreme'];
const wick = maps['hollow-wick'], ground = groundFor(wick), field = new WaterField(ground, wick.terrain);
// The ford's middle, deep water west of the bridge, the bridge's deck, the
// north bank, below the weir (the stream flows west: the mill dam at x 14
// holds the pond east of it at 0, the tail water west of it at -0.3) and the
// mill pond above it.
const FORD = [-2, 21.2], DEEP = [-24, 21.6], DECK = [-14, 22], BANK = [-14, 14], BELOW_WEIR = [8, 20.5], POND = [30, 22.4];

function view(quality = 'balanced', map = wick) {
 const v = { scene: new THREE.Scene(), map, ground: groundFor(map), qualityName: quality, look: { sky: '#eceae2' }, focus: new THREE.Vector3(FORD[0], 0, FORD[1]), remotePlayers: [], player: { visible: true } };
 v.group = buildWaterMesh(v, v.ground, map);
 return v;
}
const still = (x, z) => ({ player: { x, z, vx: 0, vz: 0, dodgeRemaining: 0 }, grenades: [] });
const run = (v, sim, seconds, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) v.waterFX.update(sim, dt, t); };

test('the field: shallow at the ford, deep in the channel, dry on a deck and the bank; it flows west, fastest mid-stream', () => {
 const ford = field.sample(...FORD), deep = field.sample(...DEEP), deck = field.sample(...DECK);
 assert.ok(ford.depth > .12 && ford.depth < .3, `ford ${ford.depth}`);
 assert.ok(deep.depth > .35, `deep ${deep.depth}`);
 assert.ok(deck.depth < 0, 'a bridge deck is dry');
 assert.ok(!field.wet(...BANK) && field.sample(0, 0) === null);
 assert.ok(deep.dx < -.9, 'downstream is west');
 const mid = field.pointAt(deep.channel, deep.along, 0), edge = field.pointAt(deep.channel, deep.along, deep.water - .3);
 assert.ok(mid.speed > edge.speed * 1.5, `${mid.speed} vs ${edge.speed} at the bank`);
 assert.ok(mid.speed > FLOW.speed * .6 && mid.speed < FLOW.speed * 2);
 // The weir: the water stands lower west of the dam (downstream).
 assert.equal(field.sample(...BELOW_WEIR).level, -.3); assert.equal(deep.level, -.3); assert.equal(field.sample(...POND).level, 0);
 // It quickens over the last metres before the drop (upstream: east of it).
 const before = field.sample(15.5, 20.5), well = field.sample(24, 20.5);
 assert.ok(before && well && before.speed > well.speed * 1.1, `${before?.speed} vs ${well?.speed}`);
 // The swell is flat at the banks and small everywhere.
 for (let i = 0; i < 200; i++) { const h = swellAt(i * .37, (i % 21) / 10 - 1, i * .11); assert.ok(Math.abs(h) <= .0221); }
 assert.equal(swellAt(3, 1, 2), 0);
});

test('the field\'s depth: over the ground you would stand on, as the simulation reads it; nothing on a flat map', () => {
 // (Wading itself, the slowdown and the current, is the simulation's:
 // config/gameplay.js WADE, tests/wading.test.js.)
 assert.ok(Math.abs(waterDepth(ground, wick.terrain, ...FORD) - field.depthAt(...FORD)) < 1e-9);
 assert.ok(waterDepth(ground, wick.terrain, ...DEEP) > .35 && waterDepth(ground, wick.terrain, ...DECK) <= 0 && waterDepth(ground, wick.terrain, ...BANK) === 0);
 const flat = groundFor(maps.deadwater);
 for (let i = 0; i < 50; i++) assert.equal(waterDepth(flat, maps.deadwater.terrain, i * 3 - 70, i * 2 - 50), 0);
});

test('the water mesh: a denser ribbon with depth and flow per vertex, see-through, the ford tinted toward its pebbles, rings round the stones', () => {
 const v = view(), water = v.group.children.find(c => c.name.startsWith('water:stream'));
 assert.ok(water.geometry.attributes.water && water.geometry.attributes.position.count > 5000);
 assert.equal(water.material.customProgramCacheKey(), 'water-surface');
 // See-through on every preset (owner, 2026-09-26), drawn first of the see-through things.
 assert.ok(water.material.transparent && water.material.opacity === WATER_OPACITY && WATER_OPACITY < 1 && !water.material.depthWrite && water.renderOrder < 0);
 // The bands slide west (the flow is signed per vertex) and the swell rolls that way.
 const speeds = water.geometry.attributes.water; let west = 0; for (let i = 0; i < speeds.count; i++) if (speeds.getY(i) < 0) west++;
 assert.ok(west > speeds.count * .9, 'the flow is west'); assert.equal(water.material.userData.water.waterDir.value, -1);
 // The ford's vertices are closer to the pebble colour than deep water's.
 const pos = water.geometry.attributes.position, colour = water.geometry.attributes.color, depth = water.geometry.attributes.water, pebble = new THREE.Color('#5a605a');
 let fordGap = 0, deepGap = 0, fordN = 0, deepN = 0;
 for (let i = 0; i < pos.count; i++) {
  const d = depth.getX(i), gap = Math.abs(colour.getX(i) - pebble.r) + Math.abs(colour.getY(i) - pebble.g) + Math.abs(colour.getZ(i) - pebble.b);
  if (Math.abs(pos.getX(i) + 2) < 2 && d > .1 && d < .25) { fordGap += gap; fordN++; }
  if (d > .7) { deepGap += gap; deepN++; }
 }
 assert.ok(fordN > 10 && deepN > 100 && fordGap / fordN < deepGap / deepN * .6, `ford ${fordGap / fordN} deep ${deepGap / deepN}`);
 // The stones in the stream are the crossings' (render/crossing-decks.js):
 // the effects ring and foam round each; no second set of rocks.
 const rocks = v.waterFX.emitters.filter(e => e.kind === 'rock');
 assert.equal(rocks.length, CROSSINGS.stones.length);
 for (const r of rocks) assert.ok(CROSSINGS.stones.some(([x, z]) => x === r.x && z === r.z));
 assert.ok(!v.group.children.some(c => c.name === 'water:rocks'));
 // The weir churns in a line at the dam's downstream foot.
 const weir = v.waterFX.emitters.filter(e => e.kind === 'weir');
 assert.ok(weir.length >= 3 && weir.every(e => e.x < 13.2 && e.x > 11.5), `weir ${weir.map(e => e.x)}`);
});

test('no water, nothing made: a flat map gets no water mesh and no water effects', () => {
 const v = view('extreme', maps.deadwater);
 assert.equal(v.group, null); assert.equal(v.waterFX, undefined);
 assert.equal(v.scene.children.length, 0);
});

test('the ladder: every pool is in the scene before the warm-up; Extreme never less than Quality; one program for every preset', () => {
 const v = view('potato');
 for (const mesh of v.waterFX.meshes) assert.ok(v.scene.children.includes(mesh), mesh.name);
 for (const key of Object.keys(WATER_DETAIL.quality)) assert.ok(WATER_DETAIL.extreme[key] >= WATER_DETAIL.quality[key], key);
 for (const key of Object.keys(WATER_LOOK.quality)) if (typeof WATER_LOOK.quality[key] === 'number') assert.ok(WATER_LOOK.extreme[key] >= WATER_LOOK.quality[key], key);
 // Each rung has at least what the one below has.
 for (let i = 1; i < PRESETS.length; i++) for (const key of Object.keys(WATER_DETAIL.potato)) assert.ok(WATER_DETAIL[PRESETS[i]][key] >= WATER_DETAIL[PRESETS[i - 1]][key], `${PRESETS[i]} ${key}`);
 const material = v.waterMaterial, keys = new Set();
 const surface = v.group.children.find(c => c.name.startsWith('water:stream')), triangles = {};
 for (const q of PRESETS) {
  v.qualityName = q; run(v, still(...BANK), .1); keys.add(material.customProgramCacheKey());
  assert.equal(material.userData.water.waterWave.value, q === 'extreme' ? 1 : 0);
  triangles[q] = surface.geometry.index.count / 3;
 }
 assert.equal(keys.size, 1, 'a preset change links no new water program');
 // Phones draw the fewest triangles; Extreme's swell the most.
 assert.ok(triangles.potato === triangles.performance && triangles.performance < triangles.balanced / 1.8 && triangles.quality < triangles.extreme / 1.8, JSON.stringify(triangles));
 assert.ok(triangles.performance < 3500, `${triangles.performance} triangles on a phone`);
 // Potato: still water with a few streaks, nothing else.
 v.qualityName = 'potato'; run(v, still(...BANK), 2);
 const pools = v.waterFX.pools;
 assert.ok(pools.streaks.items.length > 0 && pools.streaks.items.length <= WATER_DETAIL.potato.streaks);
 assert.equal(pools.floaters.items.length, 0);
 v.qualityName = 'balanced'; run(v, still(...BANK), 2);
 assert.ok(pools.floaters.items.some(f => f.leaf), 'floating leaves from Balanced');
 // Leaves: litter browns and canopy yellows and oranges, never red.
 for (const f of pools.floaters.items) if (f.leaf) assert.ok(f.colour.g / f.colour.r > .3, 'not red');
});

test('shots and blasts in the water splash instead of kicking up dust; a grenade throws up a spout', () => {
 for (const q of PRESETS) {
  const v = view(q), fx = v.waterFX;
  const handled = fx.event({ type: 'rifleImpact', x: DEEP[0], z: DEEP[1], ground: true });
  assert.equal(handled, q !== 'potato', `${q}: the dust is replaced where there is a splash to show`);
  assert.equal(fx.event({ type: 'rifleImpact', x: BANK[0], z: BANK[1], ground: true }), false, 'dry ground keeps its dust');
  if (q !== 'potato') assert.ok(fx.pools.drops.items.length > 0 && fx.pools.rings.items.length > 0);
 }
 const v = view('quality'), fx = v.waterFX, sounds = [];
 fx.onSound = kind => sounds.push(kind);
 assert.equal(fx.event({ type: 'grenadeExplosion', x: DEEP[0], z: DEEP[1], radius: 3.2, count: 12 }), false, 'the blast itself still plays');
 const up = fx.pools.drops.items.filter(d => d.vy > 5).length;
 assert.ok(up > 20, `a spout: ${up} drops thrown high`);
 assert.ok(fx.pools.patches.items.some(p => p.colour.r > .3), 'white churn left on the water');
 assert.ok(sounds.includes('spout'));
 fx.event({ type: 'explosion', x: DEEP[0] + 4, z: DEEP[1], radius: 2.6, count: 8 });
 assert.ok(fx.pools.rings.items.length >= 5);
 // Spray, not dust, is what a step or a blast kicks up in the water.
 assert.ok(fx.sprayColour(...FORD) && fx.sprayColour(...DEEP));
 assert.equal(fx.sprayColour(...BANK), null); assert.equal(fx.sprayColour(...DECK), null);
 // Drops fall back into the water and are gone.
 run(v, still(...BANK), 3);
 assert.equal(fx.pools.drops.items.length, 0);
});

test('wading: any body where the ground is under the water ripples and splashes, you, other players and robots alike', () => {
 const v = view('balanced'), fx = v.waterFX, sounds = [];
 fx.onSound = (kind, x, z) => sounds.push([kind, x, z]);
 const moving = { player: { x: FORD[0], z: FORD[1], vx: 3, vz: 0, dodgeRemaining: 0 }, grenades: [] };
 run(v, moving, 1.2);
 assert.ok(sounds.filter(s => s[0] === 'wadeStep').length >= 3, 'wet footsteps');
 assert.ok(fx.pools.rings.items.some(r => Math.hypot(r.x - FORD[0], r.z - FORD[1]) < 1));
 // A dodge in the water throws a bigger splash.
 moving.player.dodgeRemaining = .2; run(v, moving, .05);
 assert.ok(sounds.some(s => s[0] === 'wadeDodge'));
 // A robot in deep water (should the stream be made wadeable) and one on the bridge.
 sounds.length = 0;
 v.remotePlayers = [{ id: 'r1', robot: true, x: DEEP[0], z: DEEP[1], vx: 0, vz: 2.5 }, { id: 'r2', robot: true, x: DECK[0], z: DECK[1], vx: 3, vz: 0 }];
 run(v, still(...BANK), 1);
 assert.ok(sounds.some(s => s[0] === 'wadeStep' && s[1] === DEEP[0]));
 assert.ok(!sounds.some(s => s[1] === DECK[0]), 'nobody wades on a bridge');
 // Online players carry no velocity: worked out from where they were.
 sounds.length = 0; v.remotePlayers = [{ id: 'p', x: DEEP[0], z: DEEP[1] }];
 for (let i = 0; i < 30; i++) { v.remotePlayers[0].x += .1; fx.update(still(...BANK), 1 / 30, i / 30); }
 assert.ok(sounds.some(s => s[0] === 'wadeStep'));
});

test('blood in the water spreads thin; Quality and up it drifts downstream; a body in the stream bleeds into it', () => {
 for (const q of ['balanced', 'quality']) {
  const v = view(q), fx = v.waterFX;
  fx.blood(DEEP[0], DEEP[1] - 1.5, 0, 1, 2);
  const patches = fx.pools.patches.items.filter(p => p.colour.r < .3 && p.colour.r > p.colour.g);
  assert.ok(patches.length > 0, `${q}: blood on the water`);
  const x0 = patches.map(p => p.x);
  run(v, still(...BANK), 4);
  const moved = patches.map((p, i) => p.x - x0[i]);
  if (q === 'quality') assert.ok(Math.max(...moved) < -.6, `drifted ${moved} (downstream is west)`);
  else assert.ok(Math.max(...moved.map(Math.abs)) < 1e-9, 'Balanced: spreads where it lands');
 }
 const v = view('quality'), fx = v.waterFX;
 fx.blood(BANK[0], BANK[1], 0, -1, 2);
 assert.equal(fx.pools.patches.items.length, 0, 'blood on dry ground is the ground\'s (blood-drops.js)');
 fx.event({ type: 'playerDeath', x: DEEP[0], z: DEEP[1], directionX: 1, directionZ: 0 });
 run(v, still(...BANK), 6);
 const trail = fx.pools.patches.items.filter(p => p.x < DEEP[0] - .5);
 assert.ok(trail.length >= 5, `a red trail downstream (${trail.length})`);
 fx.event({ type: 'mapReset' });
 assert.equal(fx.pools.patches.items.length, 0); assert.equal(fx.sources.length, 0);
});

test('later stages: a waterwheel drips, the body pile tints the water, a body drifts until the shallows', () => {
 const v = view('quality'), fx = v.waterFX;
 const wheel = fx.addSource('wheel', 22, 19.5, { width: 1.4, height: 2 }), pile = fx.addSource('pile', -44, 17, { width: 2 });
 run(v, still(...BANK), 1.5);
 assert.ok(fx.pools.patches.items.some(p => p.colour.r > p.colour.g), 'the pile\'s reddish drift');
 fx.removeSource(wheel); fx.removeSource(pile);
 assert.equal(fx.sources.length, 0);
 const body = { x: DEEP[0], z: DEEP[1] };
 let moved = 0; for (let i = 0; i < 60; i++) moved += fx.driftBody(body, 1 / 10);
 assert.ok(moved > .5 && body.x < DEEP[0], 'carried west, downstream');
 const wader = { x: FORD[0], z: FORD[1] };
 assert.equal(fx.driftBody(wader, 1), 0, 'the ford is too shallow to carry a body');
});

// ---- The hooks in renderer.js: they hold the wiring in place.
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the view hands the stream its events, blood, dust colour and frames', () => {
 const renderer = source('../src/render/renderer.js');
 for (const hook of ['waterFX?.event(e)', 'waterFX?.blood(', 'waterFX?.sprayColour(', 'waterFX?.update(', 'waterFX?.death(', 'waterFX?.clear()']) assert.ok(renderer.includes(hook), hook);
});
