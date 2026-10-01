// v0.990a (owner): Ichor's blade cuts the crops down, and its raised guard
// turns only rounds that meet the blade (the side it is held up on), never
// ones that come at the body behind it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { tryIchorDeflect, ichorGuardFor, meetsGuardBlade, ICHOR_GUARD_BLADE } from '../src/weapons/ichor-deflect.js';
import { ichorSweepMeets } from '../src/weapons/ichor-cut.js';
import { cropCutMeets } from '../src/crops.js';

const field = { id: 'ichor-field-test', width: 60, depth: 60, spawn: { x: 0, z: 0 }, buildings: [], fences: [], props: [], targets: [], crops: [{ id: 'f', x: 0, z: 0, w: 21, d: 20, visibility: 5 }] };
const make = map => { const s = new Simulation(map); s.weapon = 'ichor'; s.player.id = 'cutter'; return s; };
const run = (s, n = 1, input = {}) => { for (let i = 0; i < n; i++) s.step({ aimX: 1, aimZ: 0, ...input }); };
const tileAt = (s, x, z) => s.crops.find(c => Math.abs(x - c.x) <= c.w / 2 && Math.abs(z - c.z) <= c.d / 2);

// (v0.999a) A cut is the blade's shape, not whole tiles: the stalks inside it
// (and a little past it) fall; the tiles stay standing.
const cutsOf = s => (s.drainEvents?.() || s.events).filter(e => e.type === 'cropCut');
const cutAt = (cuts, x, z) => cuts.some(c => cropCutMeets(c, x, z));
test('a slash cuts the stalks its sweep reaches, and nothing behind or beyond it', () => {
  const s = make(field);
  s.drainEvents?.();
  run(s, 12, { fire: true, tapFire: true });
  const cuts = cutsOf(s);
  assert.ok(cuts.length >= 1 && cuts.every(e => e.dx > .9 && e.kind === 'arc'), 'cropCut events, the sweep thrown along the cut');
  assert.ok(cutAt(cuts, .3, 0) && cutAt(cuts, 1.8, 0) && cutAt(cuts, 1.2, .8), 'at your feet and in front, within reach');
  assert.ok(!cutAt(cuts, -3, 0), 'behind you');
  assert.ok(!cutAt(cuts, 8, 0) && !cutAt(cuts, 3.6, 0), 'beyond the blade');
  assert.ok(s.crops.every(c => c.state === 'standing'), 'no tile is taken away');
});

test('a burning tile burns on; the sweep test covers a tile anywhere in the arc', () => {
  const s = make(field), t = tileAt(s, 1.8, 0);
  t.state = 'burning';
  run(s, 12, { fire: true, tapFire: true });
  assert.equal(t.state, 'burning');
  const tile = { x: 0, z: -1.9, w: .6, d: .6 };
  assert.equal(ichorSweepMeets(0, 0, 1, 0, 2.15, 2.9, tile), true, 'off to the side, inside a wide arc');
  assert.equal(ichorSweepMeets(0, 0, 1, 0, 2.15, 1.85, tile), false, 'outside a short one');
  assert.equal(ichorSweepMeets(0, 0, 1, 0, 2.15, Math.PI * 2, { x: -1.5, z: 0, w: .6, d: .6 }), true, 'a spin reaches behind');
});

test('the blood wave mows a path through the field', () => {
  const s = make(field);
  s.ichor.blood = 100; s.drainEvents?.(); s.events.length = 0;
  run(s, 60, { ichorE: true });
  const cuts = cutsOf(s);
  assert.ok(cuts.length && cuts.every(e => e.kind === 'line'));
  assert.ok(cutAt(cuts, 7, 0), 'down its path');
  assert.ok(!cutAt(cuts, 7, 8), 'not beside it');
});

const plain = { id: 'ichor-side-test', width: 40, depth: 40, spawn: { x: 0, z: 0 }, buildings: [], fences: [], props: [], targets: [] };
const raised = () => { const s = make(plain); run(s, 1, { ichorGuard: true }); s.ichor.guardStrength = 50; return s; };
// A round travelling (dx, dz) whose path passes (x, z): facing east, right is +z.
const round = (dx, dz, x = 0, z = 0) => { const n = Math.hypot(dx, dz); return { owner: 'shooter', bullet: true, damage: 1, damageType: 'gunshot', vx: dx / n, vz: dz / n, x, z }; };

test('the guard turns only rounds that meet its blade: the front, never the back', () => {
  const s = raised(), t = () => ({ ...s.player, kind: 'player', ...ichorGuardFor(s) });
  assert.ok(tryIchorDeflect(t(), round(-1, 0, .4, 0)), 'straight at the front');
  assert.ok(tryIchorDeflect(t(), round(-1, 0, .4, .3)), 'at the front of the right shoulder (the hands are there)');
  assert.ok(tryIchorDeflect(t(), round(-1, -.6, .4, -.25)), 'from the front-left, across the blade');
  assert.equal(tryIchorDeflect(t(), round(1, 0, -.4, 0)), null, 'from behind');
  // From the front-right (50 degrees: inside the old facing cone), its path
  // clipping the back of the right side: no blade there, it hits.
  assert.equal(tryIchorDeflect(t(), round(-Math.cos(.87), -Math.sin(.87), -.25, .35)), null, 'at the back of the right side');
  assert.ok(tryIchorDeflect(t(), round(-Math.cos(.87), -Math.sin(.87), 0, 0)), 'the same angle at the middle meets the hands and blade');
  assert.equal(tryIchorDeflect(t(), round(0, -1, 0, .4)), null, 'from the right side');
  // The blade itself, as measured on the model: in front, the hands right, the tip out left.
  const B = ICHOR_GUARD_BLADE;
  assert.ok(B.hands[0] > 0 && B.tip[0] > 0 && B.hands[1] > 0 && B.tip[1] < -1, 'across the front, right chest to past the left');
  assert.equal(meetsGuardBlade({ x: 0, z: 0, kind: 'player' }, round(1, 0, -.4, 0), 1, 0, 1, 0), false);
});

test("the wave costs its wielder half of one hit's damage as it leaves the blade, with a splash; it never kills", t => {
  t.mock.method(Math, 'random', () => .5);
  const s = make(plain);
  s.ichor.blood = 100; s.drainEvents?.();
  const before = s.player.hp;
  run(s, 1, { ichorE: true });
  const events = s.drainEvents?.() || s.events, wave = events.find(e => e.type === 'ichorWave'), paid = events.find(e => e.type === 'playerDamage' && e.damageType === 'ichorCost');
  const hitDamage = s.ichorWaves[0].damage;
  // (Balance pass 2026-09-30: an 18 wave (14) at .4 of it (.5): still ~7 health.)
  assert.equal(hitDamage, 18, 'the hit itself is its normal damage');
  assert.ok(Math.abs(wave.cost - 7.2) < 1e-9); assert.ok(Math.abs(paid.damage - 7.2) < 1e-9);
  assert.ok(Math.abs(s.player.hp - (before - 7.2)) < 1e-9);
  const low = make(plain); low.ichor.blood = 100; low.player.hp = 4; run(low, 1, { ichorE: true });
  assert.ok(Math.abs(low.player.hp - .2) < 1e-9, 'down to .2 health, never dead: ' + low.player.hp);
  const dev = make(plain); dev.ichor.blood = 100; dev.dev = { ...dev.dev, invulnerable: true }; const hp = dev.player.hp; run(dev, 1, { ichorE: true });
  assert.equal(dev.player.hp, hp, 'invulnerable (developer tools): no cost');
});
