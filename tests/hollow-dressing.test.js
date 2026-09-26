// Hollow Wick's static dressing (stage 5, s5-props: src/world/hollow-dressing.js,
// src/maps/hollow-wick-dressing.js): every piece is registered as solid
// scenery with honest collider heights, stands where the stage's placement
// rules allow (tests/hollow-dressing-rules.js: the breakables' rules, the
// detail pass's, and a few more), keeps what the other builders' tests hold
// (the stream, the trees, the breakables, the spawns), and builds as a few
// plain-coloured meshes that merge into the static batches (no new draws, no
// new materials, a modest triangle count).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { maps, groundFor, mapColliders } from '../src/maps.js';
import { PROP_TYPES, mapProps } from '../src/map-kit.js';
import { DRESSING_TYPES } from '../src/world/hollow-dressing.js';
import { HOLLOW_WICK_DRESSING } from '../src/maps/hollow-wick-dressing.js';
import { HOLLOW_BREAKABLES } from '../src/world/hollow-breakables.js';
import { placementProblems } from './hollow-breakables-rules.js';
import { dressingProblems, dressingContext, collidersOf, corners, gap, SET_PIECES } from './hollow-dressing-rules.js';
import { spotProblems } from '../src/maps/hollow-wick-tree-rules.js';
import { trunkRadius } from '../src/world/tree-kinds.js';
import { spawnProblem } from '../src/net/map-spawns.js';
import { roundMeets } from '../src/weapons/rifle.js';
import { shotClear } from '../src/bots/robot-brain.js';
import { TERRAIN } from '../src/config/gameplay.js';

const map = maps['hollow-wick'], ground = groundFor(map);
const pieces = HOLLOW_WICK_DRESSING;
// Walked over: small or lying things (no collider at all).
const LYING = ['slagHeap', 'harrow', 'scythe', 'tombLantern', 'eelPot', 'fireRing', 'deerCarcass'];

test('every dressing type is solid scenery with honest collider heights', () => {
  for (const [type, t] of Object.entries(DRESSING_TYPES)) {
    assert.equal(PROP_TYPES[type], t, `${type} is in PROP_TYPES`);
    assert.equal(t.health, null, `${type} never breaks`);
    assert.ok(t.w > 0 && t.d > 0 && Array.isArray(t.collisionBoxes), type);
    if (LYING.includes(type)) assert.deepEqual(t.collisionBoxes, [], `${type} is walked over`);
    else assert.ok(t.collisionBoxes.length >= 1, `${type} collides`);
    for (const [x, z, w, d, h] of t.collisionBoxes) {
      assert.ok(Number.isFinite(h) && h > 0 && h <= 2.6, `${type}: a height`);
      assert.ok(Math.abs(x) + w / 2 <= t.w / 2 + .01 && Math.abs(z) + d / 2 <= t.d / 2 + .01, `${type}: its box inside its footprint`);
    }
  }
  const height = type => DRESSING_TYPES[type].collisionBoxes[0][4];
  // Tall things stop rounds at their full height, low cover at its own.
  assert.ok(height('whippingPost') >= 2.4 && height('pillory') >= 1.9);
  assert.equal(height('hayWagon'), 1.5);
  assert.ok(height('stocks') < .74 && height('diggersBarrow') < .74 && height('washTub') < .74, 'low pieces: rounds fly over');
  for (const type of ['stocks', 'mountingBlock', 'plough', 'diggersBarrow', 'rowboat', 'washTub', 'cairn']) assert.equal(DRESSING_TYPES[type].lowTop, true, `${type}: lowTop (rifle.js roundMeets takes its own top)`);
  // The boat's box is its dry part only: the bow end (+x) to just past the
  // middle (the placement rules keep it out of the water).
  const [bx, , bw] = DRESSING_TYPES.rowboat.collisionBoxes[0];
  assert.ok(bx - bw / 2 >= -.5 && bx + bw / 2 <= DRESSING_TYPES.rowboat.w / 2 && bw < DRESSING_TYPES.rowboat.w * .62);
  // Hitching rails stop bodies, not rounds (a pole at waist height, open below).
  const rail = mapColliders(map).find(c => c.propId === 'hw-d-rail-tavern');
  assert.ok(rail.playerOnly && !rail.blocksSight && !rail.walkOver);
  // Nothing new blocks sight.
  assert.ok(!Object.values(DRESSING_TYPES).some(t => t.blocksSight));
});

test('the dressing is on Hollow Wick only, after the props that take their ids from their index, every id its own', () => {
  assert.ok(pieces.length >= 25, `${pieces.length} pieces`);
  const first = map.props.indexOf(pieces[0]);
  assert.ok(first >= 0 && pieces.every((p, i) => map.props[first + i] === p), 'spread in one run');
  // (A prop with no id is named by its index, prop-<i>: every one of them comes first, so none is renamed.)
  assert.ok(map.props.findLastIndex(p => !p.id) < first, 'after every prop named by its index');
  const ids = mapProps(map).map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  for (const p of pieces) assert.ok(DRESSING_TYPES[p.type] && p.id.startsWith('hw-d-'), p.id);
  // Every type is used.
  for (const type of Object.keys(DRESSING_TYPES)) assert.ok(pieces.some(p => p.type === type), `${type} placed`);
  for (const [id, other] of Object.entries(maps)) if (id !== 'hollow-wick') assert.ok(!other.props.some(p => DRESSING_TYPES[p.type]), id);
});

test('every piece keeps the placement rules', () => {
  const ctx = dressingContext(map), bad = [];
  for (const p of pieces) { const why = dressingProblems(map, ground, p, ctx); if (why.length) bad.push(`${p.id}: ${why.join('; ')}`); }
  assert.deepEqual(bad, []);
});

test('the rules catch what they should (a piece put wrong is refused)', () => {
  const ctx = dressingContext(map), stocks = pieces.find(p => p.type === 'stocks');
  const on = (p, what) => dressingProblems(map, ground, p, ctx).some(w => w.includes(what));
  assert.ok(on({ ...stocks, x: 24, z: -10 }, 'path'), 'on the main street');
  assert.ok(on({ ...stocks, id: 'probe', x: -20, z: 22, at: undefined }, 'stream'), 'in the stream');
  assert.ok(on({ ...stocks, id: 'probe', x: 24, z: -13.5, at: undefined }, 'door'), 'in the tavern\'s doorway');
  assert.ok(on({ ...stocks, id: 'probe', x: 30, z: -6, at: undefined }, 'spawn'), 'on base A\'s spawn points');
  const barrel = pieces.find(p => p.type === 'rainBarrel');
  assert.ok(on({ ...barrel, x: barrel.x + .22 }, 'walls'), 'cutting into its house');
  assert.ok(on({ ...barrel, x: barrel.x - .25 }, 'a gap'), 'a gap a body could jam in');
  const boat = pieces.find(p => p.type === 'rowboat');
  assert.ok(on({ ...boat, z: boat.z - 1.4 }, 'water'), 'its solid half in the stream');
});

test('the declared exceptions are few, and each is what it says', () => {
  const at = pieces.filter(p => p.at), bank = pieces.filter(p => p.bank), on = pieces.filter(p => p.on), by = pieces.filter(p => p.by);
  assert.ok(at.length <= 12 && bank.length <= 3 && on.length <= 3 && by.length <= 2);
  // At the water's edge: the boat and the eel pot; the boat's solid half dry.
  assert.deepEqual(bank.map(p => p.type).sort(), ['eelPot', 'rowboat']);
  for (const p of bank) for (const c of collidersOf(map, p)) {
    assert.ok(ground.bankDistance(c.x, c.z) >= 0, `${p.id}: its box's middle outside the banks`);
    assert.ok(corners(c).every(([x, z]) => !ground.wetAt(x, z)), `${p.id}: its box dry`);
  }
  // Leaning on / set on a prop: the lantern on a table tomb (at the slab's
  // height), the scythe on a fence panel.
  const lantern = pieces.find(p => p.type === 'tombLantern'), tomb = map.props.find(q => q.type === 'tableTomb' && q.x === lantern.on[0] && q.z === lantern.on[1]);
  assert.ok(tomb && Math.abs(lantern.lift - .8) < .03, 'on a full-height tomb\'s slab');
  const scythe = pieces.find(p => p.type === 'scythe');
  assert.ok(/^(splitRail|railFence)$/.test(map.props.find(q => q.x === scythe.on[0] && q.z === scythe.on[1])?.type), 'on a fence');
  for (const p of by) assert.ok(SET_PIECES[p.by], p.id);
});

test('what the other builders\' tests hold still holds', () => {
  const colliders = mapColliders(map), mine = colliders.filter(c => pieces.some(p => p.id === c.propId));
  // Nothing solid in the stream (tests/wading.test.js).
  assert.equal(mine.filter(c => ground.bankDistance(c.x, c.z) < 0 && !c.playerOnly).length, 0);
  // The trees keep their spot rules (tests/hollow-wick-trees.test.js) near every piece.
  const bare = { ...map, trees: null };
  const near = (x, z) => pieces.some(p => Math.hypot(p.x - x, p.z - z) < 7);
  for (const t of map.trees.trees) if (near(t.x, t.z)) assert.deepEqual(spotProblems(bare, ground, t.x, t.z, trunkRadius(t), t.kind === 'willow' ? { bank: .3, slope: .38 } : undefined).filter(w => w === 'solid'), [], `${t.kind} at ${t.x},${t.z}`);
  for (const s of map.trees.stumps) if (near(s.x, s.z)) assert.ok(!spotProblems(bare, ground, s.x, s.z, .4 * s.s).includes('solid'), `stump ${s.x},${s.z}`);
  // The breakables keep their rules with the dressing among them (tests/hollow-breakables.test.js).
  for (const p of map.props.filter(q => HOLLOW_BREAKABLES[q.type])) {
    const why = placementProblems(map, ground, p, map.props).filter(w => pieces.some(d => w === `overlaps ${d.type} at ${d.x},${d.z}`));
    assert.deepEqual(why, [], p.id);
  }
  // Every spawn point is still a fair place to come in (tests/hollow-wick-spawns.test.js).
  for (const pt of [...map.bases.flatMap(b => b.points), ...map.ffaSpawns]) assert.equal(spawnProblem(map, colliders, pt.x, pt.z), null, `${pt.x},${pt.z}`);
  // No two dressing pieces' colliders touch.
  for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) if (mine[i].propId !== mine[j].propId) assert.ok(gap(corners(mine[i]), corners(mine[j])) > .3, `${mine[i].propId} and ${mine[j].propId}`);
});

// A stand-in view (no canvas): the WorldView's own building methods on a bare object.
async function standInView() {
  const { WorldView } = await import('../src/render/renderer.js');
  const view = Object.create(WorldView.prototype);
  Object.assign(view, { materials: new Map(), static: new THREE.Group(), scene: new THREE.Scene(), roofs: [], map, ground, props: new Map(), propDetails: [], interiorVisibility: { applyEntity() {} } });
  view.scene.add(view.static);
  return view;
}

test('the models build: finite, plain colours only, few triangles, merged into the static batches', async () => {
  const view = await standInView();
  let triangles = 0;
  for (const p of mapProps(map).filter(q => DRESSING_TYPES[q.type])) {
    const before = view.static.children.length;
    view.makeProp(p);
    assert.equal(view.static.children.length, before + 1, `${p.id} under the static root (it never moves)`);
    const g = view.static.children.at(-1); g.updateMatrixWorld(true);
    let tris = 0;
    g.traverse(o => {
      if (!o.isMesh) return;
      assert.ok(o.matrixWorld.elements.every(Number.isFinite) && [...o.geometry.attributes.position.array].every(Number.isFinite), `${p.id}: finite`);
      // Plain view colours only: batch() bakes them into the shared vertex-coloured material.
      assert.ok(view.materialColors.get(o.material), `${p.id}: a plain colour (${o.material.type})`);
      assert.ok(!o.material.map && !o.material.transparent && !o.material.emissiveMap, `${p.id}: no texture, no blending`);
      assert.deepEqual(Object.keys(o.geometry.attributes).sort(), ['normal', 'position', 'uv'], `${p.id}: merges with the other statics`);
      tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    });
    assert.ok(tris < 1600, `${p.id}: ${tris} triangles`);
    triangles += tris;
    // Built to its collider's honest height (within a hand), off the ground's height there.
    const box = new THREE.Box3().setFromObject(g), top = box.max.y - view.gy(p.x, p.z), h = DRESSING_TYPES[p.type].collisionBoxes[0]?.[4];
    if (h && p.type !== 'rowboat') assert.ok(top > h - .15, `${p.id}: drawn to ${top.toFixed(2)} for a ${h} m box`);
  }
  assert.ok(triangles < 14000, `${triangles} triangles in all`);
  // Merged: a handful of meshes per 40 m cell (kinds of geometry x casting), never one per part.
  const count = () => { let n = 0; view.static.traverse(o => { if (o.isMesh) n++; }); return n; };
  const parts = count();
  view.batch(view.static);
  const merged = count(), cells = new Set(pieces.map(p => `${Math.floor(p.x / 40)},${Math.floor(p.z / 40)}`)).size;
  assert.ok(merged <= cells * 4 + 4, `${parts} parts merged into ${merged} meshes over ${cells} cells`);
});

test('no new draws: the dressing only joins static batches its cells already had', async () => {
  // batch() merges the static root per 40 m cell by kind (plain or timber
  // colours, indexed or not, attributes; casting or not no longer splits the
  // static root's batches, mergeCasters, v0.980a): a key the map did not have
  // before would be a new draw (and a new shadow draw).
  const keys = async withDressing => {
    const view = await standInView(), out = new Set();
    for (const b of map.buildings) view.makeBuilding(b);
    for (const p of mapProps(map)) if (p.health === null && (withDressing || !DRESSING_TYPES[p.type])) view.makeProp(p);
    view.shadowBySize(view.static, .34);
    view.static.updateMatrixWorld(true);
    view.static.traverse(o => {
      if (!o.isMesh || Array.isArray(o.material) || o.material.map) return;
      const baked = view.bakeKind(o); o.geometry.computeBoundingSphere();
      const c = o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
      out.add(`${Math.floor(c.x / 40)},${Math.floor(c.z / 40)} ${baked ? 'baked-' + baked : o.material.type + o.material.color?.getHexString() + o.material.emissive?.getHexString()} ${!!o.geometry.index} ${Object.keys(o.geometry.attributes).sort()}`);
    });
    return out;
  };
  const before = await keys(false), after = await keys(true);
  assert.deepEqual([...after].filter(k => !before.has(k)), [], 'batches the map did not have');
});

test('a level round flies over every knee-high piece (lowTop) on Hollow Wick, and robots count on it (v0.980a)', () => {
  // (stage 5 review: a round took the washtub, the digger's barrow, the
  // stocks and every chopping block, trough and headstone stump for 0.94 m
  // of cover, so a body standing behind a knee-high tub could not be hit.)
  const ground = groundFor(map), sim = { ground }, props = new Map(mapProps(map).map(p => [p.id, p]));
  const low = mapColliders(map).filter(c => c.propId !== undefined && !c.playerOnly && !c.walkOver && (c.height ?? 2) < TERRAIN.roundHeight);
  assert.ok(low.length >= 30);
  for (const c of low) {
    const type = props.get(c.propId).type;
    assert.equal(c.lowTop, true, `${c.propId} (${type}) is lower than a round and marked lowTop`);
    // Level rounds across it from four sides, each passing over its middle.
    let over = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const round = { flight: ground.flight(c.x - dx * 3, c.z - dz * 3, dx, dz, 8, ground.heightAt(c.x - dx * 3, c.z - dz * 3)) };
      if (!roundMeets(sim, round, c, c.x, c.z, 3)) over++;
    }
    assert.ok(over >= 3, `${c.propId} (${type}): a round flies over from ${over} of 4 sides`);
    // A robot's shot across it is not spoiled by it (bots/robot-brain.js shotClear).
    assert.ok(shotClear([c], c.x - 3, c.z, c.x + 3, c.z), `${c.propId}: robots shoot over it`);
  }
  // Waist-high cover still meets rounds and spoils a robot's shot.
  const pile = mapColliders(map).find(c => props.get(c.propId)?.type === 'stonePile');
  const round = { flight: ground.flight(pile.x - 3, pile.z, 1, 0, 8, ground.heightAt(pile.x - 3, pile.z)) };
  assert.equal(roundMeets(sim, round, pile, pile.x, pile.z, 3), true);
  assert.equal(shotClear([pile], pile.x - 3, pile.z, pile.x + 3, pile.z), false);
});
