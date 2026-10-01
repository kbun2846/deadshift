// Lumen stage 5: the dead and the stampede (world/lumen-bodies.js models,
// maps/lumen-bodies.js placement; claude/lumen-design.md 5c, 6, 14b). Built in
// node on the stand-in view (tests/lumen-stub-view.js) and measured: every type
// has a model inside its collider, the Back Alley pile sits in the box the rats
// and pigeons work round (effects/lumen-life-rules.js BODY_PILE) with a collider
// shaped to the heap and the alley 1.8 m clear, the dead keep off the fight
// lanes and the spawns, the colours keep off the team colours and the players'
// blood, a civilian never wears a hat or a long coat, and the placement keeps
// the map's rules (tests/lumen-place-lib.js) against the live map.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PROP_TYPES } from '../src/maps.js';
import { LUMEN_MODELS } from '../src/world/lumen-props.js';
import { LUMEN_BODY_TYPES, LUMEN_BODY_WALL_PIECES, BODY_LOOK, BODY_MODELS, PILE_BOXES, standingCivilian } from '../src/world/lumen-bodies.js';
import { LUMEN_BODY_PROPS, PILEUP_DRIVER, PILE_AT } from '../src/maps/lumen-bodies.js';
import { LUMEN_PROPS } from '../src/maps/lumen-cover.js';
import { PILEUP } from '../src/maps/lumen-vehicle-lights.js';
import { BODY_PILE } from '../src/effects/lumen-life-rules.js';
import { litMaterial } from '../src/world/lumen-glow.js';
import { deltaBytes, hexToBytes, luma } from '../tools/contrast-lib.mjs';
import { litOnScreen, lab, deltaE2000, hexRgb } from '../src/render/look-contrast.js';
import { stubView, buildModel, countGroup } from './lumen-stub-view.js';
import { acrossPiece } from './lumen-rounds-lib.js';
import * as L from './lumen-place-lib.js';
import { LUMEN_VENTS } from '../src/maps/lumen-vents.js';
import { waterPlaces } from '../src/effects/lumen-water-places.js';

const TYPES = Object.keys(LUMEN_BODY_TYPES);
const DEAD = ['cityBodyDriver', 'cityBodyCoat', 'cityBodyPile'];
const TEAM = { amber: '#ffb020', cyan: '#2ee6ff', violet: '#b77bff' };
const PLAYER_BLOOD = '#8c1c2a';
const f2 = v => v.toFixed(2);
const build = (name, extra = {}) => buildModel(stubView(), LUMEN_MODELS, PROP_TYPES, name, { x: 3.5, z: -7.25, ...extra }).g;

// Every vertex of a model (its own frame), with the mesh it came from.
function eachVertex(g, fn) {
  const v = new THREE.Vector3();
  g.updateMatrixWorld(true);
  g.traverse(o => { if (!o.isMesh) return; const pos = o.geometry.attributes.position; for (let i = 0; i < pos.count; i++) fn(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld), o); });
}
// Every colour a model uses (materials' and lit parts' vertex colours), as sRGB hex.
function colours(g) {
  const out = new Set(), c = new THREE.Color();
  g.traverse(o => {
    if (!o.isMesh) return;
    if (o.material.color && !o.material.vertexColors) out.add('#' + o.material.color.getHexString());
    const a = o.geometry.attributes.color;
    if (a) for (let i = 0; i < a.count; i++) { c.setRGB(a.getX(i), a.getY(i), a.getZ(i)); out.add('#' + c.getHexString()); }
  });
  return out;
}

test('every body and stampede type is registered, has a real model and keeps the prop format', () => {
  assert.ok(TYPES.length >= 15, `${TYPES.length} types`);
  for (const name of TYPES) {
    const t = PROP_TYPES[name];
    assert.ok(t, `${name} is in PROP_TYPES`);
    assert.ok(name.startsWith('city'), `${name} starts with city`);
    assert.equal(typeof LUMEN_MODELS.get(name), 'function', `${name} has a model`);
    assert.equal(LUMEN_MODELS.get(name), BODY_MODELS[name]);
    assert.equal(t.health, null, `${name} is scenery (merged into the static batch)`);
    // Walk-over clutter has no collider: a round on a flat map meets every collider it crosses
    // (weapons/rifle.js roundMeets), so a walk-over box would stop rounds (the next placement test fires them).
    if (t.walkOver) assert.deepEqual(t.collisionBoxes, [], `${name} is walk-over but has a collider`);
    else assert.ok(t.collisionBoxes?.length, `${name} has collision boxes`);
  }
  for (const p of LUMEN_BODY_PROPS) assert.ok(LUMEN_BODY_TYPES[p.type], `${p.id} ${p.type}`);
  assert.equal(new Set(LUMEN_BODY_PROPS.map(p => p.id)).size, LUMEN_BODY_PROPS.length, 'ids are unique');
});

test('models stay inside their colliders: walk-over pieces low, the solid ones inside their boxes', () => {
  const bad = [];
  for (const name of TYPES) {
    if (name === 'cityBodyDriver') continue; // (inside the car's box: the next test)
    const t = LUMEN_BODY_TYPES[name], g = build(name);
    let worst = 0, where = null, low = Infinity, high = 0;
    eachVertex(g, (v, o) => {
      low = Math.min(low, v.y); high = Math.max(high, v.y);
      // (The pile's smear is painted on the wall's face behind it: the wall is its collider.)
      if (name === 'cityBodyPile' && o.geometry.type === 'PlaneGeometry' && v.z < -.6 && v.y < 1.8) return;
      let d = Infinity;
      for (const [bx, bz, bw, bd, bh] of t.walkOver ? [[0, 0, t.w, t.d, .36]] : t.collisionBoxes) d = Math.min(d, Math.max(Math.abs(v.x - bx) - bw / 2, Math.abs(v.z - bz) - bd / 2, v.y - (t.walkOver ? .36 : bh), 0));
      if (d > worst) { worst = d; where = [v.x, v.y, v.z].map(f2).join(','); }
    });
    if (worst > .101) bad.push(`${name}: ${f2(worst)} m outside at ${where}`);
    if (low < -.1) bad.push(`${name}: ${f2(low)} m under the ground`);
    if (t.walkOver && high > .36) bad.push(`${name}: walk-over but ${f2(high)} m high`);
  }
  assert.deepEqual(bad, []);
});

test('the pileup driver is inside the smouldering car and hangs out of its window (visible from above)', () => {
  // The car: maps/lumen-cover.js's cityPileup, world/lumen-vehicles.js buildPileup's smouldering one.
  const pile = LUMEN_PROPS.find(p => p.type === 'cityPileup'), car = PILEUP.cars.find(c => c.smoulders);
  const a = pile.angle || 0, c = Math.cos(a), s = Math.sin(a);
  assert.ok(Math.abs(pile.x + car.x * c + car.z * s - PILEUP_DRIVER.x) < .01 && Math.abs(pile.z - car.x * s + car.z * c - PILEUP_DRIVER.z) < .01, 'the driver is on the smouldering car');
  assert.equal(car.d > car.w && car.nose < 0, true, 'the car lies north-south, nose north');
  assert.ok(Math.abs(PILEUP_DRIVER.angle - Math.PI / 2) < 1e-6, 'the driver shares its heading');
  const p = LUMEN_BODY_PROPS.find(q => q.type === 'cityBodyDriver');
  assert.deepEqual([p.x, p.z, p.angle], [PILEUP_DRIVER.x, PILEUP_DRIVER.z, PILEUP_DRIVER.angle]);
  const half = Math.min(car.w, car.d) / 2, len = Math.max(car.w, car.d) / 2, g = build('cityBodyDriver');
  let out = 0, beyondDoor = 0, low = Infinity;
  eachVertex(g, v => { if (Math.abs(v.x) > len + .1 || Math.abs(v.z) > half + .1 || v.y > 1.3) out++; if (v.z < -half + .1 && v.y > .3) beyondDoor++; low = Math.min(low, v.y); });
  assert.equal(out, 0, `${out} vertices outside the car's box`);
  assert.ok(beyondDoor > 50, `only ${beyondDoor} vertices out past the driver's door`);
  assert.ok(low > -.1, `${f2(low)} under the ground`);
});

test('the Back Alley pile: in BODY_PILE, a collider of several boxes hugging the heap, the alley 1.8 m clear', () => {
  const P = BODY_PILE, cols = L.mapColliders(L.map).filter(c => c.propId === 'lx3');
  assert.equal(LUMEN_BODY_PROPS.find(p => p.id === 'lx3').type, 'cityBodyPile');
  assert.ok(cols.length >= 3 && cols.length === PILE_BOXES.length, `${cols.length} boxes`);
  for (const c of cols) for (const [x, z] of L.boxPoly(c.x, c.z, c.localW, c.localD, c.angle)) assert.ok(x >= P.x0 - 1e-6 && x <= P.x1 + 1e-6 && z >= P.z0 - 1e-6 && z <= P.z1 + 1e-6, `a pile box corner ${f2(x)},${f2(z)} outside BODY_PILE`);
  // The model too (its footprint), within BODY_PILE.
  const g = build('cityBodyPile', { x: PILE_AT.x, z: PILE_AT.z });
  eachVertex(g, v => { const x = PILE_AT.x + v.x, z = PILE_AT.z + v.z; assert.ok(x > P.x0 - .1 && x < P.x1 + .1 && z > P.z0 - .1 && z < P.z1 + .1, `the pile's model at ${f2(x)},${f2(z)}`); });
  // Hugging: not one box round it all, each box filled by the heap to near its height, and a body
  // walking at the heap meets it (a 0.25 m grid over the heap's drawn footprint is mostly inside the boxes).
  const x0 = Math.min(...PILE_BOXES.map(b => b[0] - b[2] / 2)), x1 = Math.max(...PILE_BOXES.map(b => b[0] + b[2] / 2)), z0 = Math.min(...PILE_BOXES.map(b => b[1] - b[3] / 2)), z1 = Math.max(...PILE_BOXES.map(b => b[1] + b[3] / 2));
  let cells = 0, covered = 0;
  for (let x = x0 + .025; x < x1; x += .05) for (let z = z0 + .025; z < z1; z += .05) { cells++; if (PILE_BOXES.some(([bx, bz, bw, bd]) => Math.abs(x - bx) <= bw / 2 && Math.abs(z - bz) <= bd / 2)) covered++; }
  assert.ok(covered / cells < .85, `the boxes cover ${Math.round(covered / cells * 100)}% of the rectangle round them (one box, not a heap)`);
  const tall = [...PILE_BOXES].sort((a, b) => b[4] - a[4]);
  assert.ok(tall[0][4] - tall[tall.length - 1][4] >= .4, 'a peak and low tails');
  for (const [bx, bz, bw, bd, bh] of PILE_BOXES) {
    let top = 0; eachVertex(g, v => { if (Math.abs(v.x - bx) < bw / 2 && Math.abs(v.z - bz) < bd / 2) top = Math.max(top, v.y); });
    assert.ok(top > bh * .7, `box at ${bx}: the heap reaches ${f2(top)} of ${bh}`);
  }
  const drawn = new Set(); eachVertex(g, (v, o) => { if (v.y > .1 && o.geometry.type === 'BoxGeometry') drawn.add(`${Math.round(v.x * 4)},${Math.round(v.z * 4)}`); });
  let inBoxes = 0; for (const k of drawn) { const [i, j] = k.split(',').map(Number), x = i / 4, z = j / 4; if (PILE_BOXES.some(([bx, bz, bw, bd]) => Math.abs(x - bx) <= bw / 2 + .13 && Math.abs(z - bz) <= bd / 2 + .13)) inBoxes++; }
  assert.ok(inBoxes / drawn.size > .95, `${inBoxes} of ${drawn.size} drawn cells over the collider`);
  // The alley: 1.8 m from the pile's colliders to the wall across (the pawn shop's and the noodle bar's
  // colliders, their faces), all along the pile, and no door's apron under a pile box.
  const across = L.mapColliders(L.map).filter(c => c.wall && Math.abs(c.z + 22) < .3 && c.x + c.w / 2 > P.x0 - 1 && c.x - c.w / 2 < P.x1 + 1);
  assert.ok(across.length, 'the alley\'s south walls');
  for (let x = P.x0; x <= P.x1; x += .1) {
    const pileZ = Math.max(...cols.map(c => L.boxPoly(c.x, c.z, c.localW, c.localD, c.angle)).filter(poly => poly.some(q => q[0] <= x) && poly.some(q => q[0] >= x)).flatMap(poly => poly.map(q => q[1])), -99);
    const wallZ = Math.min(...across.filter(c => c.x - c.w / 2 <= x && c.x + c.w / 2 >= x).map(c => c.z - c.d / 2), -22);
    assert.ok(wallZ - pileZ >= 1.8, `x ${f2(x)}: ${f2(wallZ - pileZ)} m clear`);
  }
  for (const c of cols) for (const d of L.doors) assert.ok(!(L.penetration(L.boxPoly(c.x, c.z, c.localW, c.localD, c.angle), d.poly) > .01), `a pile box on ${d.id}'s apron`);
  // Two of them show the infection (the port at the neck, blotches): the pile's colours hold both ports.
  const used = colours(g);
  assert.ok(used.has(BODY_LOOK.port) && used.has(BODY_LOOK.portDead) && used.has(BODY_LOOK.blotch), 'the infected: a pale port, a dead port, blotches');
});

test('the dead keep off the fight lanes and 3 m from every spawn point; the crosswalk body lies beside the taxi', () => {
  const dead = LUMEN_BODY_PROPS.filter(p => DEAD.includes(p.type));
  assert.equal(dead.length, 3, 'the three outdoor dead (the other two of the design\'s five are indoors)');
  const byId = new Map(L.mapProps(L.map).map(p => [p.id, p]));
  const polys = L.piecePolys(L.map).filter(c => DEAD.includes(byId.get(c.propId)?.type));
  const taxi = L.mapProps(L.map).find(p => p.type === 'cityTaxi' && Math.abs(p.x + 10.5) < 1 && Math.abs(p.z + 1.13) < 1);
  assert.ok(taxi, 'the Crossroads taxi');
  for (const c of polys) {
    const p = byId.get(c.propId);
    assert.equal(L.penetration(c.poly, L.lane.poly) > 0, false, `${p.id} on the sniper lane`);
    for (const s of L.spawnPts) assert.ok(L.distance(c.poly, L.boxPoly(s.x, s.z, .02, .02)) >= 3, `${p.id} within 3 m of a spawn point`);
    for (const t of L.targetPts) assert.ok(L.distance(c.poly, L.boxPoly(t.x, t.z, .02, .02)) >= 3, `${p.id} within 3 m of a target`);
    const onZebra = [...L.zebras, ...L.stripes].some(z => L.penetration(c.poly, z.poly) > .01);
    if (p.type === 'cityBodyCoat') assert.ok(Math.hypot(p.x - taxi.x, p.z - taxi.z) < 3, 'the crosswalk body is beside the taxi');
    else assert.ok(!onZebra, `${p.id} on a crosswalk`);
  }
  // The crosswalk one keeps off its walking line all it can: most of it off the zebra.
  const coat = polys.find(c => byId.get(c.propId).type === 'cityBodyCoat'), arm = L.zebras.find(z => L.penetration(coat.poly, z.poly) > .01);
  if (arm) { const overlap = L.penetration(coat.poly, arm.poly); assert.ok(overlap < .5, `${f2(overlap)} m on the zebra`); }
});

test('colours: no team colour (plain and lit by the night), no fresh blood; old blood darker than the players\'', () => {
  const look = L.map.look, bad = [];
  const teams = Object.entries(TEAM).map(([k, h]) => [k, lab(hexRgb(h))]);
  const seen = new Set();
  for (const name of TYPES) for (const at of [{ x: 3.5, z: -7.25 }, { x: -21.25, z: 40.5 }, { x: 44.75, z: -30.5 }]) for (const hex of colours(build(name, at))) seen.add(hex);
  // (lit parts: the lit material's colours are colour x strength; measured as they are)
  for (const hex of seen) {
    for (const [k, ref] of Object.entries(TEAM)) { const d = deltaBytes(hexToBytes(hex), hexToBytes(ref)); if (d < 15) bad.push(`${hex} is ${d.toFixed(1)} from ${k}`); }
    for (const gain of [1, .45]) {
      const shown = litOnScreen(hex, { ...look, skyIntensity: look.skyIntensity * gain, sunIntensity: look.sunIntensity * gain });
      for (const [k, t] of teams) { const d = deltaE2000(lab(shown), t); if (d < 15) bad.push(`${hex} lit x${gain} is ${d.toFixed(1)} from ${k}`); }
    }
    const b = deltaBytes(hexToBytes(hex), hexToBytes(PLAYER_BLOOD)); if (b < 12) bad.push(`${hex} is ${b.toFixed(1)} from the players' blood`);
  }
  assert.deepEqual(bad, []);
  assert.ok(seen.size > 40, `${seen.size} colours`);
  // The old blood: dried, near black and brown, 12+ from the players' blood and darker than it.
  for (const k of ['dried', 'driedDark', 'driedEdge', 'wound']) {
    const hex = BODY_LOOK[k], d = deltaBytes(hexToBytes(hex), hexToBytes(PLAYER_BLOOD));
    assert.ok(d >= 12, `${k} ${hex} is ${d.toFixed(1)} from the players' blood`);
    assert.ok(luma(hexToBytes(hex)) < luma(hexToBytes(PLAYER_BLOOD)), `${k} ${hex} is not darker than the players' blood`);
    assert.ok(seen.has(hex), `${k} is used`);
  }
  // The infection's colours (design 5c) and the city's lit set only for what glows.
  assert.equal(BODY_LOOK.blotch, '#6f7f5a'); assert.equal(BODY_LOOK.port, '#b8d88a');
});

test('a civilian never wears a hat or a long coat, shows hair, a bare face and hands; outfits vary', () => {
  const tops = new Set(), bottoms = new Set(), skins = new Set();
  for (let i = 0; i < 60; i++) {
    const view = stubView(), g = new THREE.Group(), out = standingCivilian(view, g, { type: 'test', x: i * 1.7, z: i * .3 });
    tops.add(out.top); bottoms.add(out.bottom); skins.add(out.skin);
    assert.ok(['tee', 'hoodie', 'shirt', 'puffer', 'jacket'].includes(out.top), out.top);
    assert.ok(['jeans', 'trousers', 'skirt'].includes(out.bottom), out.bottom);
    let top = 0; eachVertex(g, v => { top = Math.max(top, v.y); });
    let hairTop = 0, topColBelowHips = 0, wideUp = 0, skinUp = 0, skinHands = 0;
    const topCol = new THREE.Color(out.topCol).getHexString(), hair = new THREE.Color(out.hair).getHexString(), skin = new THREE.Color(out.skin).getHexString();
    eachVertex(g, (v, o) => {
      const hex = o.material.color.getHexString();
      if (hex === hair) hairTop = Math.max(hairTop, v.y);
      if (hex === topCol && v.y < .85) topColBelowHips++;
      if (v.y > top - .12 && Math.abs(v.x) > .11) wideUp++; // (a brim: anything wider than the head up there)
      if (hex === skin && v.y > 1.5) skinUp++;
      if (hex === skin && v.y < 1.2 && Math.abs(v.x) > .2) skinHands++;
    });
    assert.ok(Math.abs(hairTop - top) < .01, 'the hair is the highest thing (no hat)');
    assert.equal(wideUp, 0, 'nothing wider than the head over it');
    assert.equal(topColBelowHips, 0, `${out.top} reaches below the hips (a long coat)`);
    assert.ok(skinUp > 0 && skinHands > 0, 'a bare face and bare hands');
  }
  assert.ok(tops.size >= 4 && bottoms.size === 3 && skins.size >= 4, `${tops.size} tops, ${bottoms.size} bottoms, ${skins.size} skin tones`);
});

test('placement: the map\'s rules (outline, buildings, doors, crosswalks, the sniper lane, vents, drains, gaps, spawns, poles) against the live map', () => {
  const mine = new Set(LUMEN_BODY_PROPS.map(p => p.id)), byId = new Map(L.mapProps(L.map).map(p => [p.id, p]));
  const all = L.piecePolys(L.map), pieces = all.filter(c => mine.has(c.propId)), bad = [];
  assert.ok(pieces.length >= LUMEN_BODY_PROPS.length, `${pieces.length} colliders and walk-over footprints`);
  const name = c => { const p = byId.get(c.propId); return `${p.id} ${p.type} (${p.x.toFixed(1)},${p.z.toFixed(1)})`; };
  const near = (a, b, m) => a.bb.x1 + m >= b.bb.x0 && a.bb.x0 - m <= b.bb.x1 && a.bb.z1 + m >= b.bb.z0 && a.bb.z0 - m <= b.bb.z1;
  const walls = [...L.footprints, ...L.solids.filter(s => s.kind !== 'barricade')];
  // A doorway's own strip: the opening and 0.6 m out (walk-over clutter never lies there).
  const strips = L.doors.map(d => { const [a, b, c, e] = d.poly, k = .6 / 2.4; return { poly: [a, b, [b[0] + (c[0] - b[0]) * k, b[1] + (c[1] - b[1]) * k], [a[0] + (e[0] - a[0]) * k, a[1] + (e[1] - a[1]) * k]] }; });
  const drains = waterPlaces(L.map).drains, myColliders = L.mapColliders(L.map).filter(c => mine.has(c.propId));
  // The steam vents stay open (tests/lumen-vents.test.js: no collider's box within .5 m of one); the storm drains uncovered.
  for (const v of LUMEN_VENTS) for (const c of myColliders) if (Math.abs(c.x - v.x) < c.w / 2 + .5 && Math.abs(c.z - v.z) < c.d / 2 + .5) bad.push(`${c.propId} on ${v.id}`);
  for (const c of pieces) {
    const p = byId.get(c.propId), t = LUMEN_BODY_TYPES[p.type], wallPiece = LUMEN_BODY_WALL_PIECES.includes(p.type);
    c.bb ||= L.bounds(c.poly);
    for (const d of drains) if (p.type !== 'cityBodyPile' && L.distance(c.poly, L.boxPoly(d.x, d.z, .02, .02)) < .5) bad.push(`${name(c)} on a drain`);
    if (c.poly.some(([x, z]) => !L.isPlayable(L.map, x, z, 0))) bad.push(`${name(c)} outside the outline`);
    for (const w of [...L.footprints, ...L.solids]) if (near(c, w, 0) && L.penetration(c.poly, w.poly) > .02) bad.push(`${name(c)} overlaps ${w.id ?? w.kind}`);
    for (const s of L.solids) if (s.kind === 'barricade' && near(c, s, 1.5) && L.distance(c.poly, s.poly) < 1.5) bad.push(`${name(c)} at a barricade`);
    if (L.penetration(c.poly, L.lane.poly) > 0) bad.push(`${name(c)} on the sniper lane`);
    const inAlley = L.penetration(c.poly, L.alleyBox.poly) > 0;
    // The sidewalks' building-side 1.4 m stays clear (NPCs later): the pile and the door stand on their walls by design, Back Alley's marks lie on its floor.
    if (!wallPiece && !inAlley) for (const f of L.footprints) if (near(c, f, 1.4) && L.distance(c.poly, f.poly) < 1.4 - 1e-6) bad.push(`${name(c)} ${L.distance(c.poly, f.poly).toFixed(2)} m from ${f.id}`);
    if (p.type !== 'cityBodyCoat') for (const z of [...L.zebras, ...L.stripes]) if (near(c, z, 0) && L.penetration(c.poly, z.poly) > .01) bad.push(`${name(c)} on a crosswalk`);
    if (t.walkOver) {
      for (const d of strips) if (L.penetration(c.poly, d.poly) > .01) bad.push(`${name(c)} on a doorway`);
      // Lying against solid pieces is fine, under them is not.
      for (const o of all) if (o.propId !== c.propId && !o.walkOver && near(c, o, 0) && L.penetration(c.poly, o.poly) > .15 && !(p.type === 'cityBodyDriver' && byId.get(o.propId).type === 'cityPileup')) bad.push(`${name(c)} under ${byId.get(o.propId).type} ${o.propId}`);
      for (const s of L.spawnPts) if (L.distance(c.poly, L.boxPoly(s.x, s.z, .02, .02)) < 1) bad.push(`${name(c)} within 1 m of a spawn point`);
      continue;
    }
    // Solid pieces: the breakables' rules.
    for (const o of all) if (o.propId !== c.propId && !o.walkOver && near(c, o, 0) && L.penetration(c.poly, o.poly) > .02) bad.push(`${name(c)} overlaps ${byId.get(o.propId).type} ${o.propId}`);
    for (const d of L.doors) if (L.penetration(c.poly, d.poly) > .01) bad.push(`${name(c)} blocks a door of ${d.id}`);
    for (const s of L.spawnPts) if (L.distance(c.poly, L.boxPoly(s.x, s.z, .02, .02)) < 1) bad.push(`${name(c)} within 1 m of a spawn point`);
    for (const b of L.BASES) if (L.distance(c.poly, L.boxPoly(b.x, b.z, .02, .02)) < 3.5) bad.push(`${name(c)} in the middle of base ${b.id}`);
    if (near(c, L.crossRect, 0) && L.penetration(c.poly, L.crossRect.poly) > 0) bad.push(`${name(c)} in the Crossroads`);
    for (const o of [...all.filter(x => x.propId !== c.propId && !x.walkOver), ...walls]) {
      if (!near(c, o, 1.4) || o.propId === c.propId) continue;
      const g = L.distance(c.poly, o.poly); if (g > .705 && g < 1.395) bad.push(`${name(c)} and ${o.propId ? byId.get(o.propId).type + ' ' + o.propId : o.id ?? o.kind}: gap ${g.toFixed(2)} m`);
    }
    for (const s of L.map.citySigns || []) {
      if (!(s.kind === 'lamp' || (s.kind === 'pole' && s.buildingId == null && !/gantry/.test(s.id)))) continue;
      if (Math.abs(c.x - s.at[0]) < 4 && Math.abs(c.z - s.at[2]) < 4 && L.distance(c.poly, L.boxPoly(s.at[0], s.at[2], .02, .02)) < .3) bad.push(`${name(c)} at ${s.id}`);
    }
  }
  assert.deepEqual(bad, []);
  // The revolving door stands on the luxury tower's face beside its east doorway, never in it.
  const door = pieces.find(c => byId.get(c.propId).type === 'cityRevolvingDoor');
  const tower = L.footprints.filter(f => f.id === 'luxury-tower');
  assert.ok(Math.min(...tower.map(f => L.distance(door.poly, f.poly))) < .25, 'the revolving door is on the tower');
});

test('rounds fly over every walk-over piece: a real round fired across each in the Simulation passes it', () => {
  const bad = [], unclear = [];
  for (const p of L.mapProps(L.map).filter(q => LUMEN_BODY_PROPS.some(b => b.id === q.id) && q.walkOver)) {
    // (The pileup's driver lies inside the smouldering car's box: the car is what stops a round there.)
    if (p.type === 'cityBodyDriver') continue;
    const tries = acrossPiece(L.map, p);
    if (!tries.length) unclear.push(`${p.id} ${p.type}`);
    for (const r of tries) if (r.withIt < r.centre || Math.abs(r.withIt - r.without) > 1e-6) bad.push(`${p.id} ${p.type}: stopped at ${f2(r.withIt)} m (${f2(r.without)} m without it)`);
  }
  assert.deepEqual(unclear, [], 'a walk-over piece no round can be fired across');
  assert.deepEqual(bad, []);
});

test('the stampede runs toward the metro: its belongings lie along the Boulevard, the Crossroads and the Cut, and pile up at the metro', () => {
  const kinds = ['citySuitcase', 'cityStroller', 'cityBackpack', 'cityDuffel', 'cityJacketDropped', 'cityShoeLost', 'cityShelterPanel', 'cityAdPillarDown'];
  const along = LUMEN_BODY_PROPS.filter(p => kinds.includes(p.type));
  assert.ok(along.length >= 14, `${along.length} belongings`);
  for (const k of kinds) assert.ok(along.some(p => p.type === k), `no ${k}`);
  // Nearer the metro, more of them: the east half (x > 0) holds more than the west.
  assert.ok(along.filter(p => p.x > 0).length > along.filter(p => p.x < 0).length);
  const metro = L.footprints.find(f => f.id === 'metro-entrance'), heap = LUMEN_BODY_PROPS.find(p => p.type === 'cityBelongingsHeap');
  assert.ok(L.distance(L.boxPoly(heap.x, heap.z, 1.8, 1, heap.angle), metro.poly) < 4, 'the heap is at the metro');
  // The checkpoint's leavings round stage 2's barriers at the Avenue's north end.
  const barriers = LUMEN_PROPS.filter(p => p.type === 'cityCheckpointBarrier');
  for (const p of LUMEN_BODY_PROPS.filter(q => /Checkpoint|Casings|Trefoil/.test(q.type))) assert.ok(barriers.some(b => Math.hypot(b.x - p.x, b.z - p.z) < 6), `${p.id} far from the checkpoint`);
});

test('cheap: a few thousand triangles, no shadow from the lying dead, one lit material, the same every load', () => {
  let total = 0;
  for (const name of TYPES) {
    const g = build(name), { triangles } = countGroup(g);
    total += triangles * LUMEN_BODY_PROPS.filter(p => p.type === name).length;
    assert.ok(triangles < (name === 'cityBodyPile' ? 5000 : 800), `${name}: ${triangles} triangles`);
    if (DEAD.includes(name)) g.traverse(o => { if (o.isMesh) assert.equal(o.castShadow, false, `${name} casts a shadow`); });
    // Lit parts are the city's one lit material (world/lumen-glow.js).
    const view = stubView(), g2 = buildModel(view, LUMEN_MODELS, PROP_TYPES, name, { x: 3.5, z: -7.25 }).g;
    g2.traverse(o => { if (o.isMesh && o.material.vertexColors) assert.equal(o.material, litMaterial(view), `${name}: a vertex-coloured material that is not the lit one`); });
  }
  assert.ok(total < 20000, `${total} triangles on the whole map`);
  // Seeded: the same model from the same spot, a different one from another.
  const sig = g => { const a = []; eachVertex(g, v => a.push(Math.round(v.x * 1000), Math.round(v.y * 1000))); return a.join(','); };
  for (const name of DEAD) assert.equal(sig(build(name)), sig(build(name)), `${name} is not the same twice`);
  assert.notEqual(sig(build('cityBodyCoat')), sig(build('cityBodyCoat', { x: 9.5, z: 2 })), 'the same body at two spots');
});
