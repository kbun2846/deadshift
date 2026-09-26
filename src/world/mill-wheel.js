// The gristmill's undershot waterwheel (Hollow Wick, stage 2, s2-crossings;
// data: maps/hollow-wick-crossings.js CROSSINGS.wheel). It stands in the
// stream off the mill's south wall and turns slowly with the current (its
// bottom going the way the water runs, west), water dripping off its paddles
// as they rise out. Wooden, unpainted, dark with wet: two rims, spokes,
// paddles between the rims, a hub and an axle running into the mill's wall.
// Round it, into the stream works' static mesh: the wall's stone bearing
// block, an outboard bearing post, and the race (two boards on stakes)
// guiding the water under it from a raised sluice gate upstream.
// Its collider boxes are CROSSINGS.solid (map-kit.js): the one thing in the
// water you cannot walk through.
import * as THREE from 'three';
import { Parts } from '../render/parts.js';

const RIM = '#4a443c', PADDLE = '#57524a', HUB = '#3b322c', POST = '#4f4a42', STONE = '#7f7b72', CAP = '#8b8a80', DROP = '#8c9898';
const DROPS = 14, GRAVITY = 9.8;

// The turning part's pieces, around its axle (local: axle along z).
export function wheelParts(wheel) {
 const { radius: r, width: w, paddles: n = 12 } = wheel, parts = new Parts();
 for (const side of [-1, 1]) {
  const z = side * (w / 2 - .04);
  // The rims: n straight felloes.
  const seg = 2 * r * Math.sin(Math.PI / n) + .02;
  for (let i = 0; i < n; i++) {
   const a = (i + .5) / n * Math.PI * 2, rr = r - .1;
   parts.box(Math.cos(a) * rr, Math.sin(a) * rr, z, seg, .14, .09, RIM, { z: a + Math.PI / 2 }, 'rim');
  }
  // Six spokes a side (three timbers through the hub).
  for (let i = 0; i < 3; i++) parts.box(0, 0, z, (r - .12) * 2, .1, .09, RIM, { z: i / 3 * Math.PI + (side > 0 ? 0 : Math.PI / 6) }, 'spoke', .95);
 }
 // The paddles: boards from the rims out a little past them, the width of
 // the wheel, each with a darker wet face.
 for (let i = 0; i < n; i++) {
  const a = i / n * Math.PI * 2, from = r * .62, to = r + .1, mid = (from + to) / 2;
  parts.box(Math.cos(a) * mid, Math.sin(a) * mid, 0, to - from, .05, w + .02, PADDLE, { z: a }, 'paddle', i % 2 ? 1 : .9);
 }
 // The hub and the axle (into the mill's wall, out to the bearing post).
 parts.cyl(0, 0, 0, .24, w + .14, HUB, { x: Math.PI / 2 }, 'hub', 8);
 parts.cyl(0, 0, (wheel.wall - .15 - wheel.z + w / 2 + .75) / 2, .1, w / 2 + .75 - (wheel.wall - .15 - wheel.z), HUB, { x: Math.PI / 2 }, 'axle', 8);
 return parts;
}

// The still pieces round it, into `parts` (world space).
export function wheelWorks(parts, ground, wheel) {
 const { x, z, width: w, axleY, wall, water } = wheel, out = z + w / 2 + .62;
 // The wall's bearing block: a stone pier on the bank by the foundation.
 const bank = ground.drawnHeightAt(x, wall + .25);
 parts.box(x, (bank - .2 + axleY - .12) / 2, wall + .25, .55, axleY - .12 - bank + .2, .4, STONE, null, 'bearing');
 parts.box(x, axleY - .08, wall + .25, .6, .08, .45, CAP, null, 'bearing');
 // The outboard bearing post, standing on the stream bed.
 const bed = ground.drawnHeightAt(x, out) - .25;
 parts.box(x, (bed + axleY - .14) / 2, out, .26, axleY - .14 - bed, .26, POST, null, 'bearing');
 parts.box(x, axleY - .13, out, .44, .12, .34, RIM, null, 'bearing');
 parts.box(x, axleY + .14, out, .44, .1, .34, RIM, null, 'bearing');
 // The race: two boards along the flow either side of the wheel, from the
 // sluice gate upstream to just past the wheel, held by stakes.
 const [east, west] = wheel.race || [x + r(wheel) + 2, x - r(wheel) - .3], len = east - west;
 for (const side of [-1, 1]) {
  const bz = z + side * (w / 2 + .12);
  let low = Infinity; for (let s = west; s <= east; s += .5) low = Math.min(low, ground.drawnHeightAt(s, bz));
  parts.box((east + west) / 2, (low - .15 + water + .16) / 2, bz, len, water + .16 - low + .15, .07, RIM, null, 'race', .9);
  for (let s = west + .3; s < east; s += 1.4) parts.box(s, water + .02, bz + side * .08, .1, .5, .1, POST, null, 'race');
 }
 // The sluice gate at the race's mouth: two uprights, a head beam, and the
 // gate board drawn up on its pole (so the water runs).
 for (const side of [-1, 1]) {
  const bz = z + side * (w / 2 + .2), foot = ground.drawnHeightAt(east, bz) - .2;
  parts.box(east, (foot + water + 1.25) / 2, bz, .16, water + 1.25 - foot, .16, POST, null, 'sluice');
 }
 parts.box(east, water + 1.3, z, .2, .14, w + .7, RIM, null, 'sluice');
 parts.box(east + .1, water + .62, z, .07, .42, w + .2, PADDLE, null, 'sluice');
 parts.box(east + .1, water + 1.1, z, .06, .95, .06, HUB, null, 'sluice');
}
const r = wheel => wheel.radius;

// Builds the wheel into the view (its still pieces into `works`): returns
// the state updateMillWheel turns.
export function buildMillWheel(view, ground, wheel, works) {
 if (!wheel) return null;
 if (works) wheelWorks(works, ground, wheel);
 const mesh = wheelParts(wheel).mesh();
 mesh.name = 'mill-wheel';
 mesh.position.set(wheel.x, wheel.axleY, wheel.z);
 view.scene.add(mesh);
 const state = { mesh, wheel, angle: 0, drops: null, t: 0 };
 // Drips off the paddles as they rise out of the race (not on Potato).
 if (view.initialQuality !== 'potato') {
  const drops = new THREE.InstancedMesh(new THREE.BoxGeometry(.035, .1, .035), new THREE.MeshStandardMaterial({ color: DROP, roughness: .3, metalness: 0 }), DROPS);
  drops.name = 'mill-drops'; drops.frustumCulled = false; drops.castShadow = false;
  state.drops = drops; state.drip = Array.from({ length: DROPS }, (_, i) => ({ x: 0, y: -9, z: 0, vy: 0, wait: i * .09 }));
  view.scene.add(drops);
 }
 updateMillWheel(state, 0);
 return state;
}

const _m = new THREE.Matrix4();
// Turns the wheel (bottom going west: the stream's flow) and moves the drips.
export function updateMillWheel(state, dt) {
 const { mesh, wheel } = state;
 state.angle -= dt * (wheel.turn ?? .45);
 mesh.rotation.z = state.angle; mesh.updateMatrix(); mesh.updateMatrixWorld();
 if (!state.drops) return;
 let seed = state.seed ?? 99; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
 for (let i = 0; i < state.drip.length; i++) {
  const d = state.drip[i];
  if (d.y < wheel.water) {
   d.wait -= dt;
   if (d.wait > 0) { _m.makeScale(0, 0, 0); state.drops.setMatrixAt(i, _m); continue; }
   // Off a paddle tip on the rising (west) side, low to high.
   const b = -.25 + rand() * 1.35, rr = wheel.radius + .05 - rand() * .35;
   d.x = wheel.x - Math.cos(b) * rr; d.y = wheel.axleY + Math.sin(b) * rr; d.z = wheel.z + (rand() - .5) * wheel.width; d.vy = 0; d.wait = rand() * .4;
   if (d.y < wheel.water + .05) d.y = wheel.water + .05;
  }
  d.vy -= GRAVITY * dt; d.y += d.vy * dt;
  _m.makeTranslation(d.x, d.y, d.z); state.drops.setMatrixAt(i, _m);
 }
 state.seed = seed;
 state.drops.instanceMatrix.needsUpdate = true;
}
