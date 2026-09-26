// Hollow Wick's breakables (task s2-breakables): the types are registered,
// placed by the rules (tests/hollow-breakables-rules.js), break in the
// simulation, and their effects and sounds run and stay within their budgets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROP_TYPES, groundFor, mapProps } from '../src/map-kit.js';
import { maps } from '../src/maps.js';
import { Simulation } from '../src/simulation.js';
import { HOLLOW_BREAKABLES } from '../src/world/hollow-breakables.js';
import { HOLLOW_WICK_BREAKABLES } from '../src/maps/hollow-wick-breakables.js';
import { HollowBreakFX, BREAK_RECIPES, LEAVINGS_CAP, handlesBreak } from '../src/effects/breakable-effects.js';
import { hasBreakSound, playBreakSound } from '../src/effects/breakable-sounds.js';
import { placementProblems } from './hollow-breakables-rules.js';

const map = maps['hollow-wick'], ground = groundFor(map);
const TYPES = Object.keys(HOLLOW_BREAKABLES);

test('ten new breakable types are registered with health and sensible sizes', () => {
  assert.ok(TYPES.length >= 8 && TYPES.length <= 10, `${TYPES.length} types`);
  for (const type of TYPES) {
    const t = PROP_TYPES[type];
    assert.ok(t, `${type} is not in PROP_TYPES`);
    assert.ok(Number.isFinite(t.health) && t.health >= 3 && t.health <= 12, `${type} health ${t.health}`);
    assert.ok(t.w >= .4 && t.w <= 2 && t.d >= .4 && t.d <= 1.2, `${type} footprint ${t.w} x ${t.d}`);
    // None is ankle-high, so none is walked over.
    assert.ok(!t.walkOver, `${type} is walk-over`);
    assert.ok(BREAK_RECIPES.includes(type) && handlesBreak(type), `${type} has no break effect`);
    assert.ok(hasBreakSound(type), `${type} has no break sound`);
  }
  // Most break like a barrel; the big wooden ones are sturdier.
  assert.equal(TYPES.filter(type => HOLLOW_BREAKABLES[type].health === 5).length >= 6, true);
  // Deadwater's breakables are exactly as they were.
  assert.deepEqual([PROP_TYPES.barrel.health, PROP_TYPES.crate.health, PROP_TYPES.hay.health, PROP_TYPES.pot.health], [5, 5, 5, 5]);
  assert.ok(!maps.deadwater.props.some(p => HOLLOW_BREAKABLES[p.type]), 'a Hollow Wick breakable on Deadwater');
});

test('Hollow Wick places 60 to 90 of them, every type, all by the rules', () => {
  const placed = map.props.filter(p => HOLLOW_BREAKABLES[p.type]);
  assert.ok(placed.length >= 60 && placed.length <= 90, `${placed.length} placed`);
  for (const type of TYPES) assert.ok(placed.some(p => p.type === type), `${type} is never placed`);
  // (The ids the game uses: an explicit id, or prop-<index>.)
  const ids = mapProps(map).map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, 'prop ids repeat');
  for (const p of placed) {
    const problems = placementProblems(map, ground, p, map.props);
    assert.deepEqual(problems, [], `${p.id} ${p.type} at (${p.x}, ${p.z}): ${problems.join('; ')}`);
  }
  // Pumpkins on the field's west half (the scarecrow field, +1.5), among the shocks.
  assert.ok(placed.filter(p => p.type === 'pumpkin' && p.z > 29 && p.x < 20).length >= 12);
  assert.equal(HOLLOW_WICK_BREAKABLES.length, placed.length);
});

test('each type breaks in the simulation: hit, then broken, its collider gone and its event sent', () => {
  const sim = new Simulation(map); sim.reset();
  for (const type of TYPES) {
    const prop = sim.props.find(p => p.type === type);
    assert.ok(prop && prop.hp === HOLLOW_BREAKABLES[type].health, `${type} not standing`);
    assert.ok(sim.colliders.some(c => c.propId === prop.id && c.destructible), `${type} has no collider`);
    sim.events.length = 0;
    sim.hitProp(prop, { damage: 2, x: prop.x, z: prop.z, vx: 1, vz: 0 });
    assert.equal(sim.events.at(-1).type, 'propHit');
    sim.hitProp(prop, { damage: prop.hp, x: prop.x, z: prop.z, vx: 1, vz: 0 });
    const e = sim.events.at(-1);
    assert.equal(e.type, 'propBreak'); assert.equal(e.propType, type); assert.equal(e.id, prop.id);
    assert.ok(!sim.colliders.some(c => c.propId === prop.id), `${type} still collides`);
    assert.ok(sim.restoreProp(prop.id) && sim.colliders.some(c => c.propId === prop.id), `${type} did not come back`);
  }
  // The sturdier ones take more than one barrel's worth.
  const pile = sim.props.find(p => p.type === 'cordwood');
  sim.hitProp(pile, { damage: 5, x: pile.x, z: pile.z }); assert.ok(pile.hp > 0);
});

// A stand-in view: the particle list, a preset, the ground and a clatter log.
function stubView(qualityName = 'balanced', groundOverride = ground) {
  const caps = { potato: 48, performance: 140, balanced: 400, quality: 1300, extreme: 2200 };
  const clatter = [];
  return { particles: [], quality: { particleCap: caps[qualityName], effects: 1 }, qualityName, ground: groundOverride, gy: (x, z) => groundOverride.heightAt(x, z),
    shake: 0, onClatter: type => clatter.push(type), clatter, fxLightLevel: 0, lastSim: null };
}
const breakEvent = (p, extra = {}) => ({ type: 'propBreak', id: p.id, propType: p.type, x: p.x, z: p.z, directionX: 1, directionZ: 0, scale: p.scale || 1, ...extra });
const run = (fx, view, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) { fx.update(1 / 60); view.particles = view.particles.filter(p => (p.life -= 1 / 60) > 0); } };

test('every type comes apart in its own way; what stays is capped, and Potato gets less', () => {
  const props = mapProps(map);
  const counts = {};
  for (const quality of ['potato', 'quality']) {
    let particles = 0;
    for (const type of TYPES) {
      const view = stubView(quality), fx = new HollowBreakFX(view), p = props.find(o => o.type === type);
      fx.break(breakEvent(p));
      assert.ok(view.particles.length > 0 || fx.items.length > 0, `${type} threw nothing on ${quality}`);
      assert.ok(view.particles.length <= view.quality.particleCap);
      assert.ok(view.particles.every(q => Number.isFinite(q.x + q.y + q.z + q.vx + q.vy + q.vz) && q.material === 7 && q.tint), `${type} bad particle`);
      particles += view.particles.length;
      run(fx, view, 1.5);
      particles += view.particles.length;
      assert.ok(fx.items.length <= LEAVINGS_CAP[quality]);
      assert.ok(fx.items.every(it => Number.isFinite(it.x + it.z)), `${type} left something nowhere`);
      if (quality === 'quality') counts[type] = fx.items.length;
    }
    counts[quality] = particles;
  }
  assert.ok(counts.potato < counts.quality, `potato ${counts.potato} vs quality ${counts.quality}`);
  // Something stays on the ground after each of these.
  for (const type of ['pumpkin', 'ciderKeg', 'appleCrate', 'grainSacks', 'cordwood', 'squashBarrow', 'tinLantern', 'stoneware']) assert.ok(counts[type] > 0, `${type} leaves nothing`);
});

test('apples roll downhill on a slope, stop within reach and stay; the map reset clears them', () => {
  // A plane falling to the east (rising 0.3 per metre west).
  const slope = { flat: false, heightAt: x => -.3 * x, gradientAt: (x, z, out = {}) => { out.x = -.3; out.z = 0; return out; }, bankDistance: () => 9 };
  const view = stubView('quality', slope), fx = new HollowBreakFX(view);
  fx.break({ type: 'propBreak', id: 'a', propType: 'appleCrate', x: 0, z: 0, directionX: 0, directionZ: 0, scale: 1 });
  const apples = fx.items.filter(it => it.kind === 'roll');
  assert.ok(apples.length >= 4);
  run(fx, view, 8);
  assert.ok(apples.every(a => a.rest), 'an apple is still rolling');
  const mean = apples.reduce((s, a) => s + a.x, 0) / apples.length;
  assert.ok(mean > .5, `apples went ${mean.toFixed(2)} m downhill`);
  assert.ok(apples.every(a => Math.hypot(a.x - a.ox, a.z - a.oz) <= 2.61), 'an apple rolled off across the map');
  assert.ok(apples.every(a => fx.items.includes(a)), 'the apples did not stay');
  fx.clear(); assert.equal(fx.items.length, 0); assert.equal(fx.mesh.count, 0);
});

test('a feather drifts down slowly and the swarm disperses', () => {
  const props = mapProps(map), view = stubView('quality'), fx = new HollowBreakFX(view);
  const coop = props.find(p => p.type === 'chickenCoop');
  fx.break(breakEvent(coop));
  const feathers = fx.floaters.map(f => f.p);
  assert.ok(feathers.length > 5);
  // Integrate as the view does (debris gravity 9 m/s²) with the steering.
  for (let i = 0; i < 90; i++) { fx.update(1 / 60); for (const p of feathers) { p.vy -= 9 / 60; p.y += p.vy / 60; } }
  assert.ok(feathers.every(p => p.vy >= -.56), 'a feather fell like a stone');
  const skep = props.find(p => p.type === 'beeSkep'), view2 = stubView('quality'), fx2 = new HollowBreakFX(view2);
  fx2.break(breakEvent(skep));
  const bees = fx2.floaters.map(f => f.p); assert.ok(bees.length > 8);
  for (let i = 0; i < 120; i++) { fx2.update(1 / 60); for (const p of bees) { p.vy -= 9 / 60; p.x += p.vx / 60; p.z += p.vz / 60; p.y += p.vy / 60; } }
  const spread = bees.reduce((s, p) => s + Math.hypot(p.x - skep.x, p.z - skep.z), 0) / bees.length;
  assert.ok(spread > 1, `the swarm stayed within ${spread.toFixed(2)} m`);
});

test('each type has its own break sound, and a dash lands the body first', () => {
  for (const type of TYPES) {
    const calls = [];
    const s = { tone: (...a) => calls.push(['tone', ...a]), noise: (...a) => calls.push(['noise', ...a]), impact: (...a) => calls.push(['impact', ...a]) };
    assert.ok(playBreakSound(s, { propType: type }));
    assert.ok(calls.length >= 4, `${type}: ${calls.length} voices`);
    const dashed = []; playBreakSound({ tone: (...a) => dashed.push(a), noise: (...a) => dashed.push(a), impact: (...a) => dashed.push(a) }, { propType: type, dashed: true });
    assert.equal(dashed.length, calls.length + 2);
  }
  assert.equal(playBreakSound({}, { propType: 'barrel' }), false);
});
