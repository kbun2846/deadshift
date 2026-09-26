// Hollow Wick's crossings and mill wheel (stage 2, s2-crossings): the deck
// models sit exactly at their decks' heights and never run into the banks,
// nothing along a deck's long sides stops you stepping off it into the water
// (owner, 2026-09-26: no rails, no colliders), each crossing is one mesh so
// the see-through fade under it covers all of it, and the stones, dam and
// wheel keep out of the ford's lane and from under the decks.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { maps, groundFor, mapColliders } from '../src/maps.js';
import { buildCrossingDecks, updateCrossingDecks, deckFrame, CURB } from '../src/render/crossing-decks.js';
import { CROSSINGS } from '../src/maps/hollow-wick-crossings.js';

const map = maps['hollow-wick'], ground = groundFor(map), decks = map.terrain.decks;
function build(quality = 'performance') {
 const view = { scene: new THREE.Scene(), ground, initialQuality: quality };
 buildCrossingDecks(view, ground, map);
 return view;
}
const view = build();
const meshOf = id => view.deckMeshes.find(d => decks[d.index].id === id).mesh;

test('every deck is built, as one mesh, and each has its look', () => {
 assert.equal(view.deckMeshes.length, decks.length);
 for (const deck of decks) {
  const mesh = meshOf(deck.id);
  assert.ok(CROSSINGS.decks[deck.id], `${deck.id}: no look`);
  // (Everything named for this deck is this one mesh.)
  assert.equal(view.scene.children.filter(o => o.name === 'deck:' + deck.id).length, 1);
  assert.ok(mesh.castShadow && mesh.material.transparent);
 }
});

test('the walk surface is exactly at the deck height, and never into the banks', () => {
 for (const deck of decks) {
  const parts = meshOf(deck.id).userData.parts, walk = parts.filter(p => p.role === 'plank' || p.role === 'trunk');
  const top = Math.max(...walk.map(p => p.box.max.y));
  assert.ok(Math.abs(top - deck.h) < .005, `${deck.id}: top ${top.toFixed(3)} for h ${deck.h}`);
  // Nothing else of the deck but curbs, moss, kingposts (ends) and the root
  // plate (beside the log's end) rises over it.
  for (const p of parts) if (!['curb', 'moss', 'kingpost', 'root'].includes(p.role)) assert.ok(p.box.max.y < deck.h + .005, `${deck.id}: a ${p.role} at ${p.box.max.y.toFixed(3)}`);
  // The walk surface runs over ground under its top all the way.
  const f = deckFrame(deck, ground);
  for (let s = f.s0 + .05; s < f.s1 - .05; s += .25) for (const k of [-.45, 0, .45]) assert.ok(f.floor(f.width * k, s) < deck.h, `${deck.id}: bank over the top at ${s.toFixed(2)}`);
  // Its ends reach the banks (within a step of the top).
  for (const s of [f.s0, f.s1]) assert.ok(f.floor(0, s + Math.sign(s) * .15) > deck.h - .45, `${deck.id}: end at ${s.toFixed(2)} short of the bank`);
 }
});

test('nothing blocks stepping off the long sides', () => {
 // No colliders anywhere along or near a deck.
 for (const c of mapColliders(map)) for (let k = 0; k < decks.length; k++) {
  for (const [dx, dz] of [[0, 0], [.8, 0], [-.8, 0], [0, .8], [0, -.8]]) assert.notEqual(ground.deckAt(c.x + dx, c.z + dz), k, `a collider by deck ${decks[k].id}`);
 }
 // Along the sides (a metre past each, away from the ends) nothing rises
 // more than a curb over the top.
 for (const deck of decks) {
  const f = deckFrame(deck, ground), parts = meshOf(deck.id).userData.parts;
  for (const p of parts) {
   const c = p.box.getCenter(new THREE.Vector3()), dx = c.x - f.cx, dz = c.z - f.cz;
   const s = dx * f.ux + dz * f.uz, a = Math.abs(dx * f.uz - dz * f.ux);
   if (s < f.s0 + 1.8 || s > f.s1 - 1.8 || a > f.width / 2 + 1) continue;
   assert.ok(p.box.max.y <= deck.h + CURB + .02, `${deck.id}: a ${p.role} ${p.box.max.y.toFixed(2)} high along its side at s ${s.toFixed(1)}`);
  }
 }
});

test('the deck you wade under fades, all of it, and comes back', () => {
 const v = build();
 const bridge = v.deckMeshes.find(d => decks[d.index].id === 'bridge');
 const sim = { player: { x: -14, z: 22, below: true } };
 assert.equal(ground.deckAt(-14, 22), bridge.index);
 for (let i = 0; i < 20; i++) updateCrossingDecks(v, sim, .05);
 for (const d of v.deckMeshes) assert.equal(d.mesh.material.opacity, d === bridge ? .22 : 1);
 // (No other mesh of the bridge left opaque: it is the only one near it.)
 const under = new THREE.Box3(new THREE.Vector3(-15.5, -.2, 17.5), new THREE.Vector3(-12.5, 1.3, 27));
 const near = v.scene.children.filter(o => o.isMesh && (o.userData.parts ? o.userData.parts.some(p => p.box.intersectsBox(under)) : new THREE.Box3().setFromObject(o).intersectsBox(under)));
 assert.deepEqual(near.map(o => o.name), ['deck:bridge']);
 sim.player.below = false;
 for (let i = 0; i < 20; i++) updateCrossingDecks(v, sim, .05);
 assert.ok(v.deckMeshes.every(d => d.mesh.material.opacity === 1 && d.mesh.material.depthWrite));
});

test('stones, dam and wheel: in the water, out of the ford lane and from under the decks', () => {
 for (const [x, z, s] of CROSSINGS.stones) {
  assert.ok(ground.bankDistance(x, z) < 0, `stone at ${x},${z} not in the stream`);
  assert.ok(Math.abs(x + 2) > 4, `stone at ${x},${z} in the ford's lane`);
  for (let a = -1.5; a <= 1.5; a += .5) for (let b = -1.5; b <= 1.5; b += .5) assert.equal(ground.deckAt(x + a, z + b), -1, `stone at ${x},${z} by a deck`);
  // Its top shows over the water, a little.
  const top = ground.drawnHeightAt(x, z) + s * .95, water = ground.waterAt(x, z);
  assert.ok(top > water && top < water + .3, `stone at ${x},${z}: top ${top.toFixed(2)}, water ${water}`);
 }
 const works = view.streamWorks.userData.parts;
 for (const p of works) {
  const c = p.box.getCenter(new THREE.Vector3());
  assert.equal(ground.deckAt(c.x, c.z), -1, `a ${p.role} under a deck`);
  assert.ok(Math.abs(c.x + 2) > 3.5 || c.z < 12, `a ${p.role} in the ford`);
 }
 // The wheel: its paddles dip into the water but clear the bed as it turns.
 const w = CROSSINGS.wheel;
 assert.ok(w.axleY - w.radius - .1 < w.water, 'the paddles reach the water');
 for (let a = -w.radius; a <= w.radius; a += .25) for (const dz of [-w.width / 2, w.width / 2]) {
  const low = w.axleY - Math.sqrt(Math.max(0, (w.radius + .1) ** 2 - a * a));
  assert.ok(low > ground.drawnHeightAt(w.x + a, w.z + dz), `the wheel into the bed at x ${(w.x + a).toFixed(2)}`);
 }
 // It turns with the flow (its bottom going west), and drips on all but Potato.
 const wheel = view.millWheel, before = wheel.mesh.rotation.z;
 updateCrossingDecks(view, { player: { x: 0, z: 0 } }, .5);
 assert.ok(wheel.mesh.rotation.z < before);
 assert.ok(wheel.drops && !build('potato').millWheel.drops);
 // No draws piling up: the decks, the wheel, its drips, the works, and the
 // spill when a timber dam has one (Hollow Wick's dam is the terrain's stone
 // one: no crib, no spill).
 assert.equal(view.scene.children.length, decks.length + 3 + (CROSSINGS.dam ? 1 : 0));
});
