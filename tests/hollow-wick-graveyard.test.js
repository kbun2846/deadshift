// Hollow Wick's burying ground and fieldstone walls (task s2-graveyard):
// the layout rules (src/maps/hollow-wick-graveyard.js, written by
// tools/graveyard-layout.mjs) and the gameplay of its pieces.
import test from 'node:test';
import assert from 'node:assert/strict';
import { maps, groundFor } from '../src/maps.js';
import { mapColliders, mapProps, PROP_TYPES } from '../src/map-kit.js';
import { Simulation } from '../src/simulation.js';
import { GRAVE_TYPES } from '../src/world/graveyard.js';
import { GRAVEYARD_PROPS, FIELD_WALLS, GRAVE_SLOTS, GRAVEYARD_MARKS } from '../src/maps/hollow-wick-graveyard.js';
import { BUILDING_PADS, BASES } from '../src/maps/hollow-wick.js';
import { insidePoly } from '../src/world/heightfield.js';

const map = maps['hollow-wick'], ground = groundFor(map);
const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz; let t = L ? ((x - a[0]) * dx + (z - a[1]) * dz) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
const pathClearance = (x, z) => { let best = Infinity; for (const p of map.terrain.paths) for (let i = 1; i < p.points.length; i++) best = Math.min(best, segDist(x, z, p.points[i - 1], p.points[i]) - p.width / 2 - p.shoulder); return best; };
const slope = (x, z) => { const g = ground.gradientAt(x, z); return Math.hypot(g.x, g.z); };
// The points of a turned box (corners, edge middles, centre).
const samples = (x, z, w, d, a = 0) => { const c = Math.cos(a), s = Math.sin(a), out = []; for (const u of [-.5, 0, .5]) for (const v of [-.5, 0, .5]) out.push([x + u * w * c + v * d * s, z - u * w * s + v * d * c]); return out; };
const footprint = p => { const t = PROP_TYPES[p.type]; return p.type === 'grave' ? [p.len ?? 1.7, .76] : [t.w * (p.scale || 1), t.d * (p.scale || 1)]; };
const SET_PIECES = ['openGrave', 'freshMound', 'graveSkeleton'];
const nearSkeleton = p => Math.hypot(p.x - GRAVEYARD_MARKS.skeleton[0], p.z - GRAVEYARD_MARKS.skeleton[1]) < 1.2;

test('the graveyard and its walls are on Hollow Wick, and only there', () => {
 for (const p of [...GRAVEYARD_PROPS, ...FIELD_WALLS]) assert.ok(PROP_TYPES[p.type], p.type);
 assert.equal(map.props.filter(p => GRAVE_TYPES[p.type]).length, GRAVEYARD_PROPS.length + FIELD_WALLS.length);
 for (const [id, other] of Object.entries(maps)) if (id !== 'hollow-wick') assert.ok(!other.props.some(p => GRAVE_TYPES[p.type]), id);
});

test('graves: counts, and every grave slot has what stands on it', () => {
 const count = type => GRAVEYARD_PROPS.filter(p => p.type === type).length;
 // (Its size is set by the terrain: see AGENTS.md > Hollow Wick graveyard.)
 assert.ok(GRAVE_SLOTS.length >= 30, `${GRAVE_SLOTS.length} graves`);
 assert.equal(count('headstone') + count('fallenStone'), count('headstoneStump'), 'every headstone and fallen stone has its stump');
 assert.ok(count('headstone') >= 15 && count('tableTomb') >= 6 && count('fallenStone') >= 1);
 for (const t of ['openGrave', 'graveSkeleton']) assert.equal(count(t), 1, t);
 assert.ok(count('freshMound') >= 1);
 // Headstones stand at the west end of their grave, facing east.
 for (const h of GRAVEYARD_PROPS.filter(p => p.type === 'headstone')) {
  assert.ok(GRAVEYARD_PROPS.some(g => g.type === 'grave' && Math.abs(g.z - h.z) < .01 && Math.abs(g.x - .78 - h.x) < .02), `grave east of ${h.x},${h.z}`);
  assert.ok(Math.abs(h.angle) < .1, 'faces east');
 }
 // No iron, obelisks, mausoleums or lettering: only these kinds.
 assert.deepEqual([...new Set(GRAVEYARD_PROPS.map(p => p.type.replace(/\d$/, '')))].sort(),
  ['bigStone', 'fallenStone', 'fieldWall', 'freshMound', 'grave', 'graveSkeleton', 'headstone', 'headstoneStump', 'openGrave', 'tableTomb'].filter(t => GRAVEYARD_PROPS.some(p => p.type.replace(/\d$/, '') === t)).sort());
});

test('graves stand in north-south ranks at least 2.5 m apart, graves along a rank clear of each other', () => {
 for (let i = 0; i < GRAVE_SLOTS.length; i++) for (let j = i + 1; j < GRAVE_SLOTS.length; j++) {
  const [a, b] = [GRAVE_SLOTS[i], GRAVE_SLOTS[j]];
  assert.ok(Math.abs(a[0] - b[0]) >= 2.5 - 1e-6 || Math.abs(a[1] - b[1]) >= 1.2 - 1e-6, `${a} and ${b}`);
 }
});

test('the aisles, every other path and the bank faces are clear', () => {
 for (const p of GRAVEYARD_PROPS) {
  const [w, d] = footprint(p), opts = SET_PIECES.includes(p.type) || nearSkeleton(p);
  for (const [x, z] of samples(p.x, p.z, w, d, p.angle || 0)) {
   // (The skeleton's stone stands at the edge of aisle-22's shoulder.)
   assert.ok(pathClearance(x, z) >= (opts ? -.56 : -1e-6), `${p.type} at ${p.x},${p.z} on a path`);
   assert.ok(slope(x, z) <= (opts ? .41 : .3 + 1e-6), `${p.type} at ${p.x},${p.z} on a slope ${slope(x, z).toFixed(2)}`);
  }
 }
 for (const w of FIELD_WALLS) for (const [x, z] of samples(w.x, w.z, PROP_TYPES[w.type].w, .55, w.angle)) {
  assert.ok(pathClearance(x, z) >= .15 - 1e-6, `wall ${w.group} at ${w.x},${w.z} across a path`);
  assert.ok(slope(x, z) <= .35 + 1e-6 && ground.bankDistance(x, z) >= 1, `wall ${w.group} at ${w.x},${w.z}`);
 }
 // Nothing on a building pad, nor within 2 m of base B's centre.
 for (const p of [...GRAVEYARD_PROPS, ...FIELD_WALLS]) {
  assert.ok(!BUILDING_PADS.some(b => { const a = b.angle || 0, c = Math.cos(a), s = Math.sin(a), dx = p.x - b.x, dz = p.z - b.z; return Math.abs(dx * c - dz * s) < b.w / 2 && Math.abs(dx * s + dz * c) < b.d / 2; }), `${p.type} at ${p.x},${p.z} on a pad`);
  for (const base of Object.values(BASES)) assert.ok(Math.hypot(p.x - base[0], p.z - base[1]) > 2, `${p.type} at base ${base}`);
 }
});

test('colliders carry their heights; dressing has none', () => {
 const colliders = mapColliders(map), props = mapProps(map);
 const heightOf = type => { const p = props.find(q => q.type === type); return colliders.filter(c => c.propId === p.id).map(c => c.height); };
 assert.deepEqual(heightOf('headstone'), [.9]);
 assert.deepEqual(heightOf('tableTomb'), [.8]);
 assert.deepEqual(heightOf('headstoneStump'), [.35]);
 for (const t of ['fieldWall2', 'fieldWall3', 'fieldWall4', 'fieldWall5', 'fieldWall6']) if (props.some(p => p.type === t)) assert.deepEqual(heightOf(t), [1]);
 for (const t of ['grave', 'fallenStone', 'freshMound', 'openGrave', 'graveSkeleton']) assert.deepEqual(heightOf(t), [], t);
 // Breakable headstones; everything else solid.
 assert.equal(GRAVE_TYPES.headstone.health, 5);
 for (const [t, spec] of Object.entries(GRAVE_TYPES)) if (t !== 'headstone') assert.equal(spec.health, null, t);
});

test('a headstone breaks like a crate and leaves its stump as low cover', () => {
 const sim = new Simulation(map); sim.reset();
 const stone = sim.props.find(p => p.type === 'headstone');
 const stump = sim.props.find(p => p.type === 'headstoneStump' && p.x === stone.x && p.z === stone.z);
 assert.ok(stump);
 sim.hitProp(stone, { damage: 3, x: stone.x, z: stone.z });
 assert.ok(sim.colliders.some(c => c.propId === stone.id), 'still standing');
 sim.hitProp(stone, { damage: 3, x: stone.x, z: stone.z });
 assert.ok(!sim.colliders.some(c => c.propId === stone.id), 'broken');
 assert.ok(sim.colliders.some(c => c.propId === stump.id && !c.destructible && c.height === .35), 'its stump stays');
 assert.ok(sim.drainEvents().some(e => e.type === 'propBreak' && e.propType === 'headstone'));
 sim.restoreProp(stone.id);
 assert.ok(sim.colliders.some(c => c.propId === stone.id), 'restored');
});

test('about 40% of the graveyard cover is solid; hard cover near every standing spot on the treads', () => {
 const solidTypes = t => ['tableTomb', 'bigStone'].includes(t) || /^fieldWall\d$/.test(t) || t === 'railPlot';
 const solid = GRAVEYARD_PROPS.filter(p => solidTypes(p.type)).length, breakable = GRAVEYARD_PROPS.filter(p => p.type === 'headstone').length;
 const share = solid / (solid + breakable);
 assert.ok(share >= .38 && share <= .55, `solid share ${share.toFixed(2)}`);
 // Hard cover: table tombs, big stones, walls, rail posts and the buildings
 // on the hill.
 const hard = mapColliders(map).filter(c => { const p = map.props.find((q, i) => (q.id || 'prop-' + i) === c.propId); return p ? solidTypes(p.type) || p.type === 'bigStone' : false; });
 const pads = BUILDING_PADS.filter(b => ['meetinghouse', 'tomb', 'hearse-house', 'horse-sheds'].includes(b.id));
 const boxDist = (x, z, b, a = b.angle || 0, w = b.localW ?? b.w, d = b.localD ?? b.d) => { const c = Math.cos(a), s = Math.sin(a), dx = x - b.x, dz = z - b.z; return Math.hypot(Math.max(0, Math.abs(dx * c - dz * s) - w / 2), Math.max(0, Math.abs(dx * s + dz * c) - d / 2)); };
 const levels = ['foot', 't3', 't2', 't1'].map(id => map.terrain.levels.find(l => l.id === id)), summit = map.terrain.levels.find(l => l.id === 'summit');
 let worst = { d: 0 }, worstAll = { d: 0 };
 for (let x = -44; x <= -16; x += .5) for (let z = -50; z <= 8; z += .5) {
  if (!levels.some(l => insidePoly(x, z, l.poly)) || insidePoly(x, z, summit.poly)) continue;
  if (Math.hypot(x - BASES.B[0], z - BASES.B[1]) < 4) continue;
  let d = Infinity; for (const c of hard) d = Math.min(d, boxDist(x, z, c)); for (const b of pads) d = Math.min(d, boxDist(x, z, b));
  if (d > worstAll.d) worstAll = { x, z, d };
  // The treads: the level ground off the aisles (a metre across at least),
  // where the graves are.
  const tread = samples(x, z, 1, 1).every(([px, pz]) => slope(px, pz) <= .3 && pathClearance(px, pz) >= 0 && levels.some(l => insidePoly(px, pz, l.poly)) && !BUILDING_PADS.some(b => Math.abs(px - b.x) < b.w / 2 + .5 && Math.abs(pz - b.z) < b.d / 2 + .5));
  if (tread && d > worst.d) worst = { x, z, d };
 }
 assert.ok(worst.d <= 3.5, `tread spot ${worst.x},${worst.z} is ${worst.d.toFixed(2)} m from hard cover`);
 // (Banks and aisles: reported by tools/graveyard-layout.mjs; the terrain
 // leaves no room for cover on them.)
 assert.ok(worstAll.d <= 5.2, `${worstAll.x},${worstAll.z} is ${worstAll.d.toFixed(2)} m from hard cover`);
});
