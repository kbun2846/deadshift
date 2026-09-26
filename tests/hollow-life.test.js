// Hollow Wick's life (stage 5, s5-life; src/world/hollow-life.js, placed by
// src/maps/hollow-wick-life.js): the goat in its pen, the washing line, the
// stick effigies, the loose shutters, the tavern's sign and the lit house's
// chimney smoke. Every piece keeps the placement rules; the solid parts have
// honest heights and nobody is spawned in the pen; the goat's mind (grazing,
// looking, flicks, steps, the stare) keeps it in its pen; the swinging and
// turning stay in bounds; and built in a view it is one mesh per part of the
// map, rewritten without allocating.
import test from 'node:test';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import vm from 'node:vm';
import { maps, groundFor, mapColliders } from '../src/maps.js';
import { PROP_TYPES, mapProps } from '../src/map-kit.js';
import { LIFE_TYPES, PEN_INSIDE, GOAT, GoatMind, stepShutter, stepSign, SHUTTER, lifeOf, effigyPose, smokePuff, SMOKE, LIFE_DETAIL, gustAt, windAt } from '../src/world/hollow-life.js';
import { HW_LIFE, LOOSE_SHUTTERS, SMOKING_CHIMNEYS } from '../src/maps/hollow-wick-life.js';
import { lifeRules } from './hollow-life-rules.js';
import { spawnProblem } from '../src/net/map-spawns.js';
import { trunkRadius } from '../src/world/tree-kinds.js';

const map = maps['hollow-wick'], ground = groundFor(map);
const props = mapProps(map).filter(p => LIFE_TYPES[p.type]);
const colliders = mapColliders(map);
const boxDistance = (x, z, c) => { const a = c.angle || 0, cs = Math.cos(a), sn = Math.sin(a), dx = x - c.x, dz = z - c.z; const lx = Math.abs(dx * cs - dz * sn) - (c.localW ?? c.w) / 2, lz = Math.abs(dx * sn + dz * cs) - (c.localD ?? c.d) / 2; return Math.hypot(Math.max(0, lx), Math.max(0, lz)); };
const segDist = (x, z, [ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(ax + dx * t - x, az + dz * t - z); };
const lineDist = (x, z, pts) => Math.min(...pts.slice(1).map((p, i) => segDist(x, z, pts[i], p)));

test('the types are registered: the pen and the washing posts are solid at honest heights, the rest has no collider', () => {
 for (const [type, t] of Object.entries(LIFE_TYPES)) { assert.equal(PROP_TYPES[type], t); assert.equal(t.health, null, type); }
 const of = type => colliders.filter(c => props.some(p => p.id === c.propId && p.type === type));
 const pen = of('goatPen'), posts = of('laundryLine');
 assert.equal(pen.length, 4, 'four hurdles');
 // Low cover (under 1.5 m): a round meets it only at its own height.
 for (const c of pen) assert.ok(c.height === .95 && !c.blocksSight && !c.walkOver && !c.playerOnly);
 assert.equal(posts.length, 2); for (const c of posts) assert.ok(c.height > 1.8 && c.w < .2);
 assert.equal(of('effigy').length, 0, 'the effigies are cosmetic');
 assert.ok(props.filter(p => p.type === 'effigy').length >= 4 && props.filter(p => p.type === 'effigy').length <= 6);
 assert.equal(props.filter(p => p.type === 'goatPen').length, 1);
});

test('every piece keeps the placement rules (doorways, paths, spawns, bases, targets, trunks, slopes, set pieces)', () => {
 const problems = lifeRules(map, ground, new Set(HW_LIFE.map(p => p.id)));
 for (const p of HW_LIFE) assert.deepEqual(problems(p, HW_LIFE), [], p.id);
 // Out of the stream, inside the fence, unique ids.
 assert.equal(new Set(HW_LIFE.map(p => p.id)).size, HW_LIFE.length);
 for (const p of props) assert.ok(!ground.wetAt(p.x, p.z) && ground.bankDistance(p.x, p.z) > .5, p.id);
 // The trees keep their room (tests/hollow-wick-trees.test.js: nothing solid within a trunk's radius + 0.9 m).
 const mine = colliders.filter(c => props.some(p => p.id === c.propId));
 for (const t of map.trees.trees) for (const c of mine) assert.ok(boxDistance(t.x, t.z, c) >= trunkRadius(t) + .9, `${c.propId} by the tree at ${t.x},${t.z}`);
});

test('nobody is spawned inside the goat pen: every spot in it is within 1 m of a hurdle', () => {
 const pen = props.find(p => p.type === 'goatPen'), c = Math.cos(pen.angle), s = Math.sin(pen.angle);
 for (let lx = -PEN_INSIDE.hx + .05; lx < PEN_INSIDE.hx; lx += .1) for (let lz = -PEN_INSIDE.hz + .05; lz < PEN_INSIDE.hz; lz += .1) {
  const x = pen.x + lx * c + lz * s, z = pen.z - lx * s + lz * c;
  assert.ok(spawnProblem(map, colliders, x, z), `a spawn could land at ${lx.toFixed(2)},${lz.toFixed(2)} in the pen`);
 }
});

test('the effigies hang along the woods track, off its walking lane, each from a real tree within a limb\'s reach, clear of heads', () => {
 const track = map.terrain.paths.find(p => p.id === 'woods-track');
 for (const e of props.filter(p => p.type === 'effigy')) {
  const tree = map.trees.trees.find(t => t.x === e.tree[0] && t.z === e.tree[1]);
  assert.ok(tree, `${e.id} hangs from a tree that stands there`);
  const limb = Math.hypot(e.x - tree.x, e.z - tree.z);
  assert.ok(limb > 1.2 && limb < 2.6, `${e.id}'s limb is ${limb.toFixed(2)} m`);
  const off = lineDist(e.x, e.z, track.points.map(p => [p[0], p[1]]));
  assert.ok(off >= 1.6 && off <= 3, `${e.id} ${off.toFixed(2)} m off the track`);
  for (const t of map.trees.trees) if (t !== tree) assert.ok(Math.hypot(t.x - e.x, t.z - e.z) > trunkRadius(t) + .8, `${e.id} in another trunk`);
  // Its feet hang at a head's height or above (the string, the figure about 1.32 x its scale).
  assert.ok(e.hang - e.string - 1.32 * e.scale > 1.55, `${e.id} hangs too low`);
 }
});

test('the loose shutters and the smoke are flagged on real windows and chimneys', () => {
 const byId = new Map(map.buildings.map(b => [b.id, b]));
 assert.ok(LOOSE_SHUTTERS.length >= 2 && LOOSE_SHUTTERS.length <= 3);
 for (const [id, side, offset, hinge] of LOOSE_SHUTTERS) {
  const w = byId.get(id)?.windows.find(o => o.side === side && o.offset === offset);
  assert.ok(w && !w.boarded && !w.lit && w.loose === hinge, `${id} ${side} ${offset}`);
  assert.ok(byId.get(id).interiorStyle === 'colonial-house', 'on houses');
 }
 assert.equal(map.buildings.flatMap(b => b.windows || []).filter(w => w.loose).length, LOOSE_SHUTTERS.length);
 for (const [id, k] of SMOKING_CHIMNEYS) assert.equal(byId.get(id).chimneys[k].smoke, true);
 assert.equal(byId.get('lit-cape').interiorStyle, 'colonial-lit-house', 'someone is home');
 assert.equal(map.buildings.flatMap(b => b.chimneys || []).filter(c => c.smoke).length, SMOKING_CHIMNEYS.length);
 assert.ok(byId.get('tavern').features.includes('tavern-sign'));
});

// The goat's footprint is inside the pen (less its margin).
const inPen = mind => mind.corners().every(([x, z]) => Math.abs(x) <= PEN_INSIDE.hx - GOAT.margin + 1e-6 && Math.abs(z) <= PEN_INSIDE.hz - GOAT.margin + 1e-6);
// One step of the goat's mind with the nearest player at (px, pz), `d` off (Infinity: nobody).
const TICK = { t: 0, dt: 1 / 60 };
const think = (mind, px = 0, pz = 0, d = Infinity) => { Object.assign(mind.player, { x: px, z: pz, d }); mind.step(TICK); };

test('the goat grazes, looks about, flicks an ear and its tail and takes a step or two, inside its pen', () => {
 const mind = new GoatMind(7), states = new Set();
 let ears = 0, tails = 0, moved = 0, grazing = 0, x = mind.x, z = mind.z, wasEar = false, wasTail = false;
 for (let t = 0; t < 180; t += 1 / 60) {
  think(mind);
  states.add(mind.state);
  const ear = mind.earL > .3 || mind.earR > .3, tail = Math.abs(mind.tail) > .3;
  if (ear && !wasEar) ears++; if (tail && !wasTail) tails++; wasEar = ear; wasTail = tail;
  moved += Math.hypot(mind.x - x, mind.z - z); x = mind.x; z = mind.z;
  if (mind.neckBend > 1.5) grazing += 1 / 60;
  assert.ok(inPen(mind), `out of its pen at ${mind.x.toFixed(2)},${mind.z.toFixed(2)} facing ${mind.heading.toFixed(2)}`);
 }
 assert.deepEqual([...states].sort(), ['graze', 'look', 'step']);
 assert.ok(ears >= 15 && tails >= 10, `${ears} ear flicks, ${tails} tail flicks`);
 assert.ok(moved > 1 && moved < 30, `walked ${moved.toFixed(1)} m`);
 assert.ok(grazing > 40, `head down ${grazing.toFixed(0)} s of 180`);
});

test('a player within 14 m: it stops, turns its head, then its body, to stare while they stay; then goes back to grazing', () => {
 const mind = new GoatMind(3);
 for (let t = 0; t < 5; t += 1 / 60) think(mind);
 const player = [4, 8], bearing = () => Math.atan2(player[0] - mind.x, player[1] - mind.z), off = a => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
 const heading0 = mind.heading;
 for (let t = 0; t < .5; t += 1 / 60) think(mind, player[0], player[1], 9);
 assert.equal(mind.state, 'stare');
 assert.ok(off(mind.heading - heading0) < .01, 'the body waits');
 assert.ok(off(mind.heading + mind.neckYaw - bearing()) < off(heading0 - bearing()) - .3 || off(heading0 - bearing()) < .3, 'the head turns first');
 for (let t = 0; t < 4; t += 1 / 60) { think(mind, player[0], player[1], 9); assert.ok(inPen(mind)); }
 assert.ok(off(mind.heading - bearing()) < .12, `the body faces them (${off(mind.heading - bearing()).toFixed(2)} rad off)`);
 assert.ok(mind.neckBend < 0 && Math.abs(mind.neckYaw) < .15 && mind.perk > .9, 'head up, ears pricked, looking straight at them');
 // Between 14 and 16 m it keeps staring; past 16 m it lets go after a moment.
 for (let t = 0; t < 3; t += 1 / 60) think(mind, player[0], player[1], 15);
 assert.equal(mind.state, 'stare');
 for (let t = 0; t < 2; t += 1 / 60) think(mind, 30, 30, 40);
 assert.notEqual(mind.state, 'stare');
 const seen = new Set(); for (let t = 0; t < 60; t += 1 / 60) { think(mind); seen.add(mind.state); }
 assert.ok(seen.has('graze'));
 // Whoever is nearest: it turns to a player walking round the pen, and never leaves it.
 for (let t = 0; t < 120; t += 1 / 60) { const a = t * .4; think(mind, Math.cos(a) * 6, Math.sin(a) * 6, 6); assert.ok(inPen(mind)); }
 const a = 120 * .4;
 assert.ok(off(mind.heading + mind.neckYaw - Math.atan2(Math.cos(a) * 6 - mind.x, Math.sin(a) * 6 - mind.z)) < .5, 'it follows them round');
});

test('the shutters swing from the wall to nearly shut and bang back now and then; the sign swings gently; the effigies turn slowly', () => {
 for (let k = 0; k < 3; k++) {
  const s = { angle: SHUTTER.rest, speed: 0, phase: k * 4.1, x: k * 20 }; let most = 0, bangs = 0, last = s.angle;
  for (let t = 0; t < 240; t += 1 / 60) {
   stepShutter(s, { t, dt: 1 / 60 }); const a = s.angle;
   assert.ok(a >= 0 && a <= SHUTTER.max && Number.isFinite(a));
   most = Math.max(most, a); if (a === 0 && last > 0) bangs++; last = a;
  }
  assert.ok(most > 1.2, `a gust swings it well out (${most.toFixed(2)})`);
  assert.ok(bangs >= 2, `it bangs against the wall (${bangs})`);
 }
 const sign = { angle: 0, speed: 0, phase: 1.3, x: 20 }; let most = 0;
 for (let t = 0; t < 240; t += 1 / 60) { stepSign(sign, { t, dt: 1 / 60 }); const a = sign.angle; assert.ok(Math.abs(a) < .35); most = Math.max(most, Math.abs(a)); }
 assert.ok(most > .03, 'it moves');
 // A big frame step (a hitch) never throws it out.
 const s = { angle: SHUTTER.rest, speed: 0, phase: 0 }; stepShutter(s, { t: 3, dt: .1 }); assert.ok(s.angle >= 0 && s.angle <= SHUTTER.max);
 const pose = (seed, t) => effigyPose({ seed, yaw: 0, tx: 0, tz: 0 }, { t, dt: 0 });
 for (const seed of [3, 41, 77]) {
  const a = pose(seed, 10), b = pose(seed, 10.1), c = pose(seed, 30);
  assert.ok(Math.abs(b.yaw - a.yaw) / .1 < 1.2, 'turning slowly');
  assert.ok(Math.abs(c.yaw - a.yaw) > .05 && Math.abs(a.tx) < .06 && Math.abs(a.tz) < .06);
 }
 // The air: its gusts start and end smoothly (no jump at a gust's window).
 for (let s2 = 0; s2 < 200; s2 += .01) assert.ok(Math.abs(gustAt(s2 + .01) - gustAt(s2)) < .05 && windAt(s2) > 0);
});

test('the smoke rises from the flue, leans east, grows and fades; none on Potato, fewer on Performance', () => {
 const n = 16;
 const puff = (i, count, t) => smokePuff(i, count, { t, x: 0, y: 0, z: 0, size: 0, alpha: 0 });
 for (let t = 0; t < 60; t += .37) for (let i = 0; i < n; i++) {
  const p = puff(i, n, t);
  assert.ok(p.alpha >= 0 && p.alpha <= SMOKE.alpha && p.y >= -.01 && p.y < 7 && p.x > -.1 && p.x < 8 && Math.abs(p.z) < .4 && p.size > .2 && p.size < 2.2);
 }
 // Older puffs are higher, further east and bigger (the plume leans east).
 const young = puff(0, 1, .5), old = puff(0, 1, 5);
 assert.ok(old.y > young.y + 1 && old.x > young.x + .8 && old.size > young.size);
 assert.equal(LIFE_DETAIL.potato.smoke, 0);
 assert.ok(LIFE_DETAIL.performance.smoke < LIFE_DETAIL.balanced.smoke && LIFE_DETAIL.balanced.smoke <= LIFE_DETAIL.extreme.smoke);
 assert.ok(LIFE_DETAIL.potato.step > LIFE_DETAIL.performance.step && LIFE_DETAIL.performance.step > LIFE_DETAIL.balanced.step);
});

test('the shutters and the sign step once to each time, whoever steps them first, and note their bangs and turns for the soundscape', () => {
 const s = { angle: SHUTTER.rest, speed: 0, phase: 4.1, x: 20, z: 0, t: -Infinity, bang: 0, bangAt: -Infinity };
 let bangs = 0, heard = -Infinity;
 for (let t = 0; t < 120; t += 1 / 60) {
  stepShutter(s, { t, dt: 1 / 60 }); const a = s.angle, v = s.speed;
  stepShutter(s, { t, dt: 1 / 60 }); // the second caller in a frame: nothing moves
  assert.equal(s.angle, a); assert.equal(s.speed, v);
  if (s.bangAt !== heard) { heard = s.bangAt; bangs++; assert.equal(s.bangAt, t); assert.ok(s.bang > SHUTTER.knock); }
 }
 assert.ok(bangs >= 8, `${bangs} bangs in two minutes`);
 const sign = { angle: 0, speed: 0, phase: 1.3, x: 20, z: 0, t: -Infinity, turn: 0, turnAt: -Infinity };
 let turns = 0, wide = 0, seen = -Infinity;
 for (let t = 0; t < 120; t += 1 / 60) { stepSign(sign, { t, dt: 1 / 60 }); if (sign.turnAt !== seen) { seen = sign.turnAt; turns++; if (sign.turn > .03) wide++; } }
 assert.ok(turns > 30 && wide >= 3 && wide < turns / 2, `${turns} turns, ${wide} wide`);
 // The life's stir (the soundscape's step) moves only those within reach, to the time given.
 const life = lifeOf({}), near = { ...s, x: 5, z: 5, t: 10 }, far = { ...s, x: 90, z: 0, t: 10 };
 life.shutters.push(near, far); life.stir(10.5, 0, 0, 45);
 assert.equal(near.t, 10.5); assert.equal(far.t, 10);
});

test('built in a view: one mesh per part of the map in the static material, the static parts merged, rewritten without allocating', async () => {
 const THREE = await import('three');
 const { WorldView } = await import('../src/render/renderer.js');
 const view = Object.create(WorldView.prototype);
 Object.assign(view, { materials: new Map(), static: new THREE.Group(), scene: new THREE.Scene(), roofs: [], map, ground, props: new Map(), propDetails: [], qualityName: 'balanced' });
 view.scene.add(view.static);
 for (const b of map.buildings) view.makeBuilding(b);
 for (const p of props) view.makeProp(p);
 const life = view.hollowLife, regions = [...life.regions.entries()];
 assert.deepEqual(regions.map(([name]) => name).sort(), ['farm', 'town', 'woods']);
 const pieces = name => life.regions.get(name).pieces.length;
 assert.equal(pieces('town'), 3, 'the sign and two shutters'); assert.equal(pieces('farm'), 6, 'the goat, four linens, a shutter'); assert.equal(pieces('woods'), 2 * props.filter(p => p.type === 'effigy').length, 'each effigy and its limb');
 assert.equal(life.goats.length, 1); assert.equal(life.signs.length, 1); assert.equal(life.shutters.length, 3); assert.equal(life.linens.length, 4);
 for (const [, r] of regions) {
  assert.equal(r.mesh.material, view.bakedMaterial('plain'), 'the static scenery\'s material: nothing new to compile');
  assert.ok(r.mesh.castShadow && r.mesh.parent === view.scene && r.mesh.geometry.boundingSphere.radius < 30);
 }
 // The smoke: one instanced draw after the roofs' fade, at the lit house's flue.
 const lit = map.buildings.find(b => b.id === 'lit-cape'), flue = life.smoke.sources[0];
 assert.ok(life.smoke.mesh.isInstancedMesh && life.smoke.mesh.renderOrder > 51);
 assert.ok(Math.hypot(flue.x - lit.x, flue.z - lit.z) < 1 && flue.y > lit.baseY + lit.height + 2.5 && flue.y < lit.baseY + 7.5, `flue at ${flue.toArray()}`);
 // Its roof lifting (you inside) takes the smoke with it; half lifted, half the smoke (stage 5 review).
 {
  const roof = view.roofs.find(r => r.id === 'lit-cape'), cam = new THREE.PerspectiveCamera();
  life.smoke.update(cam, 50); const full = life.smoke.mesh.count, alpha = [...life.smoke.alpha.array.slice(0, full)];
  assert.ok(full > 0);
  roof.opacity = .5; life.smoke.update(cam, 50);
  assert.equal(life.smoke.mesh.count, full); for (let i = 0; i < full; i++) assert.ok(Math.abs(life.smoke.alpha.array[i] - alpha[i] * .5) < 1e-6);
  roof.opacity = 0; life.smoke.update(cam, 50); assert.equal(life.smoke.mesh.count, 0);
  roof.opacity = 1;
 }
 // Nothing that moves is left in the static root (it would be merged and never move).
 view.static.traverse(o => assert.ok(!o.userData.lifeSwing && !o.userData.lifeShutter, 'a marked part left behind'));
 // Frames: finite, the linens above the ground, the goat inside the pen.
 const camera = new THREE.PerspectiveCamera();
 let t = 100;
 const frame = () => { t += 1 / 60; for (const [, r] of regions) r.update(true, t); life.smoke.update(camera, t); };
 for (let k = 0; k < 600; k++) frame();
 for (const [, r] of regions) assert.ok(r.pos.every(Number.isFinite) && r.nrm.every(Number.isFinite));
 const line = props.find(p => p.type === 'laundryLine');
 for (const cloth of life.linens) assert.ok(cloth.lowest > .45, `a linen drags on the ground (${cloth.lowest.toFixed(2)})`);
 assert.ok(view.gy(line.x, line.z) > 3, 'the washing stands on the terrace');
 assert.ok(inPen(life.goats[0].mind));
 // No allocation per frame: the heap barely grows over a thousand frames
 // (a Matrix4 per piece per frame would be megabytes).
 // (Measured after the code has warmed up: the first frames of freshly
 // compiled code box numbers until it is optimised.)
 v8.setFlagsFromString('--expose-gc'); const gc = vm.runInNewContext('gc');
 for (let k = 0; k < 6000; k++) frame();
 gc(); const before = process.memoryUsage().heapUsed;
 for (let k = 0; k < 1000; k++) frame();
 const grown = process.memoryUsage().heapUsed - before;
 assert.ok(grown < 600 * 1024, `the heap grew ${(grown / 1024).toFixed(0)} KB over 1000 frames`);
 // Potato: no smoke; the moving meshes are rewritten at most 20 times a second.
 view.qualityName = 'potato';
 life.smoke.update(camera, t); assert.equal(life.smoke.mesh.count, 0);
 const farm = life.regions.get('farm'); farm.update(true, t);
 assert.equal(farm.update(false, t + .02), false); assert.equal(farm.update(false, t + .06), true);
});
