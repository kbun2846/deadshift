// The visibility audit's pure part (tools/lumen-visaudit-lib.mjs): its CPU
// caster follows the cut's rule (world/city-cut.js) through the analytic
// city, so it catches a rule that would cut too little (a storey in front of
// K), too much (a building beside you), or show a first floor's inside; and
// the whole of Lumen, audited at a coarse step, breaks none of the rule's
// promises (tools/lumen-visaudit.mjs runs it finer).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CityCut, CUT, cutBuilding, roomView } from '../src/world/city-cut.js';
import { castRay, blockedAt, auditView, viewRays } from '../tools/lumen-visaudit-lib.mjs';
import { runAudit } from '../tools/lumen-visaudit.mjs';

const square = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
// A block between the camera and you (a door on its south face), a shop to
// the west you can go into.
function world() {
  const block = cutBuilding(1, [square(-10, 10, -.5, 3.5)], 40, 3.6), shop = cutBuilding(2, [square(-30, -20, -10, 0)], 5, 3.6);
  const cut = new CityCut([block, shop]);
  const model = { cut, doorHeight: 2.5, wall: .2, entries: [{ b: block, doors: [{ ax: -1, az: 3.5, bx: 1, bz: 3.5 }] }, { b: shop, doors: [] }] };
  return { cut, model, block, shop };
}
const settle = (cut, eye, you, inside = -1, room = null) => { for (let i = 0; i < 10; i++) cut.update(.05, eye, you, [], inside, room); };
const toward = (model, gx, gy, gz, hit = {}) => { const e = model.cut.eye; return castRay(model, gx - e.x, gy - e.y, gz - e.z, Infinity, hit); };

test('lumen visaudit: the caster follows the rule: K cut, the section cap, the knee, doorways', () => {
  const { cut, model, block } = world();
  settle(cut, { x: 0, y: 29, z: 8.1 + 10 }, { x: 0, z: 8 + 10 }); // (you south of the block: it is behind you)
  settle(cut, { x: 0, y: 29, z: 8.1 }, { x: 0, z: -2 });
  // You on the street north of the block: your waist and head are seen (its storeys cut), your feet too.
  for (const h of [0, .9, 1.7]) assert.equal(blockedAt(model, 0, h, -2), null, `your ${h} m`);
  // Open ground 8 m from you behind the block (out of K): its storey stops the ray.
  assert.equal(toward(model, 8, 0, -2).kind, 'upper');
  // Just north of its north face, 3 m from you: in K, the block's section cap stops the ray (never its inside).
  const h = toward(model, 3, 0, -1);
  assert.equal(h.inK, true); assert.equal(h.kind, 'section'); assert.equal(h.slot, block.slot);
  // Through its south doorway (you by it, the camera south of it): a plug
  // while its interior is hidden, the interior when shown.
  settle(cut, { x: 0, y: 29, z: 18 }, { x: 0, z: 8 });
  assert.equal(toward(model, 0, 1, 3).kind, 'plug');
  block.interior = true; assert.equal(toward(model, 0, 1, 3).kind, 'peek'); block.interior = false;
  // Pressed against its north face: the line to your chest goes through the see-through first floor.
  settle(cut, { x: 0, y: 29, z: 9.1 }, { x: 0, z: -1 });
  assert.equal(blockedAt(model, 0, 1.2, -1), null);
  assert.equal(cut.fadeKnee(0, -1.8), CUT.knee);
});

test('lumen visaudit: auditView counts what breaks the rule: a storey in front of K (a), a first floor\'s inside (b), a building beside you cut (d)', () => {
  const { cut, model } = world();
  settle(cut, { x: 0, y: 29, z: 8.1 }, { x: 0, z: -2 });
  const rays = viewRays(cut.eye, 0, 0, -2, 40, 16 / 9, 48, 27);
  const ok = auditView(model, rays, { x: 0, z: -2 });
  assert.ok(ok.rays > 1000 && ok.inK > 20);
  assert.deepEqual([ok.a, ok.b, ok.c, ok.d], [0, 0, 0, 0], ok.examples.join('; '));
  // A rule that forgets the mask (the see-through first floor over a
  // footprint): standing against the block's north face, (b).
  settle(cut, { x: 0, y: 29, z: 9.1 }, { x: 0, z: -1 });
  const open = cut.openGround; cut.openGround = () => true;
  const bad = auditView(model, viewRays(cut.eye, 0, 0, -1, 40, 16 / 9, 96, 54), { x: 0, z: -1 });
  cut.openGround = open;
  assert.ok(bad.b > 0, 'a first floor\'s inside seen');
  // A rule with K round the wrong place: a storey stops rays that land by you (a).
  settle(cut, { x: 0, y: 29, z: 8.1 }, { x: 0, z: -2 });
  const inK = cut.inK; cut.inK = () => false;
  const hit = {}, e = cut.eye; castRay(model, 3 - e.x, -e.y, .7 - e.z, Infinity, hit);
  cut.inK = inK;
  assert.notEqual(hit.kind, 'section');
  // Beside you: a building in your row cut in your row is (d).
  const beside = cutBuilding(3, [square(2, 5, -6, 2)], 40, 3.6), cut2 = new CityCut([beside]);
  const model2 = { cut: cut2, doorHeight: 2.5, wall: .2, entries: [{ b: beside, doors: [] }] };
  settle(cut2, { x: -6, y: 29, z: 8.1 }, { x: 0, z: -2 });
  cut2.inK = () => true; cut2.kept = () => false; // (a rule that cuts everything in the way, beside you too)
  const r = auditView(model2, viewRays(cut2.eye, -6, 0, -2, 40, 16 / 9, 48, 27), { x: 0, z: -2 });
  assert.ok(r.d > 0);
});

test('lumen visaudit: inside, your room\'s floor is seen, your building\'s walls still stop what is outside them', () => {
  const { cut, model, shop } = world();
  const room = { x: -25, z: -5, w: 10, d: 10 }, rv = roomView(room, [{ outer: true, a: { x: -26, z: -.1 }, b: { x: -24, z: -.1 } }]);
  settle(cut, { x: -25, y: 16, z: .6 }, { x: -25, z: -5 }, shop.slot, rv);
  for (let x = -29.5; x <= -20.5; x += 1) for (let z = -9.5; z <= -.5; z += 1) assert.equal(blockedAt(model, x, .015, z), null, `floor ${x},${z}`);
  // Out through the shop's west wall, low: its wall.
  const hit = {}; castRay(model, -31 - cut.eye.x, .5 - cut.eye.y, -9 - cut.eye.z, Infinity, hit);
  assert.ok(hit.kind === 'first' || hit.kind === 'ground');
});

test('lumen visaudit: all of Lumen (coarse): no storey in front of K, no first floor\'s inside, no see-through, nothing beside you cut; you and your room\'s floor always seen', () => {
  const r = runAudit({ step: 8, cols: 20, rows: 12 });
  assert.ok(r.views > 700 && r.rays > 150000 && r.inK > 10000, `${r.views} views, ${r.rays} rays, ${r.inK} in K`);
  assert.ok(r.youPoints > 500 && r.floorPoints > 100000);
  assert.deepEqual({ a: r.a, b: r.b, c: r.c, d: r.d, hiddenYou: r.hiddenYou, hiddenFloor: r.hiddenFloor }, { a: 0, b: 0, c: 0, d: 0, hiddenYou: 0, hiddenFloor: 0 }, r.examples.slice(0, 6).join('\n'));
});
