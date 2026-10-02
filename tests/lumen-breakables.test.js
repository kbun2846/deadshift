// Lumen stage 4: the breakables, the three trees and the city's practice targets
// (world/lumen-breakables.js, maps/lumen-breakables.js, effects/lumen-breaks.js,
// effects/lumen-break-sounds.js, world/lumen-targets.js). The types are what the
// design says (18 or more that come apart, health 3-12, exactly three trees), the
// placement keeps the cover rules, each breaks in the simulation and comes apart in
// its own way within the effect caps, the hydrant's jet blocks sight for six
// seconds and then stops, every break has its own sound, and nothing is the
// Amber, Cyan or Violet of a team.
//
// The map is the lumen map with the placed pieces added if the hook has not
// (so the file holds before and after maps/lumen.js takes them); the `hooks` test
// says which of the one-line hooks are still to be made.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { PROP_TYPES, groundFor } from '../src/map-kit.js';
import { Simulation } from '../src/simulation.js';
import { createLoopback } from '../src/net/transport.js';
import { HostSession } from '../src/net/host-session.js';
import { ClientSession } from '../src/net/client-session.js';
import { LUMEN_PROP_TYPES, LUMEN_MODELS } from '../src/world/lumen-props.js';
import { LUMEN_BREAKABLES, LUMEN_BREAK_TYPES, LUMEN_TREES, JET, jetStart, jetOn, jetsBlockSight } from '../src/world/lumen-breakables.js';
import { LUMEN_BREAKABLE_PROPS, LUMEN_BREAKABLE_COUNTS, lumenFurnitureLights } from '../src/maps/lumen-breakables.js';
import { LumenBreakFX, LUMEN_BREAK_RECIPES, handlesLumenBreak, makeBreakFX, BREAK_GLOW } from '../src/effects/lumen-breaks.js';
import { LEAVINGS_CAP } from '../src/effects/breakable-effects.js';
import { hasLumenBreakSound, playLumenBreakSound, LUMEN_BREAK_SOUND_TYPES } from '../src/effects/lumen-break-sounds.js';
import { makeCityTarget } from '../src/world/lumen-targets.js';
import { makeTargetDamage } from '../src/effects/target-damage.js';
import { deltaBytes, hexToBytes } from '../tools/contrast-lib.mjs';
import { acesFilmic, deltaE2000, hexLinear, hexRgb, lab, toSrgb } from '../src/render/look-contrast.js';
import { stubView, countGroup } from './lumen-stub-view.js';
import * as L from './lumen-place-lib.js';

const root = new URL('..', import.meta.url).pathname;
const source = file => fs.readFileSync(root + file, 'utf8');
const hooked = LUMEN_BREAKABLE_PROPS.every(q => L.map.props.some(p => p.id === q.id)) ? L.map : { ...L.map, props: [...L.map.props, ...LUMEN_BREAKABLE_PROPS] };
const NEW_TYPES = Object.keys(LUMEN_BREAKABLES).filter(t => LUMEN_BREAKABLES[t].health !== null);
const STAGE2 = ['cityVending', 'cityTrashBags', 'cityHydrant', 'cityChargePost', 'cityCone'];
const healthOf = t => PROP_TYPES[t]?.health;

test('types: 18 or more come apart with health 3-12, each with a model, a break effect and a sound; exactly three trees', () => {
  assert.ok(LUMEN_BREAK_TYPES.length >= 18, `${LUMEN_BREAK_TYPES.length} breakable types`);
  assert.equal(new Set(LUMEN_BREAK_TYPES).size, LUMEN_BREAK_TYPES.length);
  for (const t of STAGE2) assert.ok(LUMEN_BREAK_TYPES.includes(t) && LUMEN_PROP_TYPES[t], `${t} (stage 2) is a break type`);
  for (const t of LUMEN_BREAK_TYPES) {
    const h = healthOf(t);
    assert.ok(PROP_TYPES[t], `${t} is in PROP_TYPES`);
    assert.ok(Number.isInteger(h) && h >= 3 && h <= 12, `${t} health ${h}`);
    assert.equal(typeof LUMEN_MODELS.get(t), 'function', `${t} has a model`);
    assert.ok(LUMEN_BREAK_RECIPES.includes(t) && handlesLumenBreak(t), `${t} has a break effect`);
    assert.ok(hasLumenBreakSound(t) && LUMEN_BREAK_SOUND_TYPES.includes(t), `${t} has a break sound`);
    // No sight hole in the cover: a breakable's collider has a height, and only the low ones are lowTop.
    const boxes = PROP_TYPES[t].collisionBoxes; assert.ok(boxes?.length, `${t} has no collision boxes`);
  }
  // Trees: solid props with a trunk collider, exactly three, no break effect.
  assert.equal(LUMEN_TREES.length, 3, `${LUMEN_TREES}`);
  for (const t of LUMEN_TREES) {
    assert.equal(PROP_TYPES[t].health, null, `${t} breaks`);
    assert.ok(PROP_TYPES[t].collisionBoxes.some(b => b[2] <= .6 && b[3] <= .6 && b[4] >= 3), `${t} has no trunk collider`);
    assert.ok(!handlesLumenBreak(t) && !hasLumenBreakSound(t));
    assert.equal(typeof LUMEN_MODELS.get(t), 'function');
  }
  assert.equal(LUMEN_BREAKABLE_PROPS.filter(p => LUMEN_TREES.includes(p.type)).length, 3, 'three trees placed');
  // Types that fly to bits are not walked over (the cone aside).
  for (const t of LUMEN_BREAK_TYPES) if (t !== 'cityCone') assert.ok(!PROP_TYPES[t].walkOver, `${t} is walk-over`);
});

// (117 placed at stage 4; the owner's clutter cuts, 2026-10-01, left 80, then 41, while thirteen set piece types
// started to break: tests/lumen-setpieces.test.js. The quarters count every breakable on the map.)
test('placement: 35 to 140 breakables, every new type placed, the map\'s breakables spread over the districts', () => {
  const placed = LUMEN_BREAKABLE_PROPS.filter(p => !LUMEN_TREES.includes(p.type));
  assert.ok(placed.length >= 35 && placed.length <= 140, `${placed.length} placed`);
  assert.equal(Object.values(LUMEN_BREAKABLE_COUNTS).reduce((s, n) => s + n, 0), LUMEN_BREAKABLE_PROPS.length);
  for (const t of NEW_TYPES) assert.ok(placed.some(p => p.type === t), `${t} is never placed`);
  for (const t of STAGE2) assert.ok(hooked.props.some(p => p.type === t), `${t} (stage 2) stands somewhere`);
  const ids = L.mapProps(hooked).map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, 'prop ids repeat');
  for (const p of LUMEN_BREAKABLE_PROPS) assert.ok(Number.isFinite(p.x + p.z + p.angle), `${p.id} has no angle`);
  // Every quarter of the map has some, and no single spot hoards them.
  const breaking = hooked.props.filter(p => Number.isInteger(PROP_TYPES[p.type].health));
  for (const [name, f] of [['west', p => p.x < 0], ['east', p => p.x >= 0], ['north', p => p.z < 0], ['south', p => p.z >= 0]]) assert.ok(breaking.filter(f).length >= 25, `${name}: ${breaking.filter(f).length}`);
  for (let cx = -80; cx < 80; cx += 20) for (let cz = -60; cz < 60; cz += 20) assert.ok(placed.filter(p => p.x >= cx && p.x < cx + 20 && p.z >= cz && p.z < cz + 20).length <= 22, `a 20 m cell at ${cx},${cz} is crowded`);
  // The trees are at the three named places.
  const at = t => LUMEN_BREAKABLE_PROPS.find(p => p.type === t);
  assert.ok(Math.hypot(at('cityTreeUptown').x - 56, at('cityTreeUptown').z + 25) < 4);
  assert.ok(Math.hypot(at('cityTreeStacks').x + 46, at('cityTreeStacks').z + 28) < 4);
  assert.ok(Math.hypot(at('cityTreeMetro').x - 29, at('cityTreeMetro').z - 37.5) < 4);
});

test('placement rules for the new pieces: inside the outline, no overlap, 2.4 m from outer doors, off zebras, 1 m from the sniper lane, gaps under 0.7 or 1.4 and over, the alley kept, spawns legal', () => {
  const mine = new Set(LUMEN_BREAKABLE_PROPS.map(p => p.id));
  const all = L.propPolys(hooked), pieces = all.filter(c => mine.has(c.propId)), byId = new Map(L.mapProps(hooked).map(p => [p.id, p]));
  assert.ok(pieces.length >= 40, `${pieces.length} colliders`); // (120 before the owner's clutter cuts, 2026-10-01; 81, then 46)
  const bad = [], f1 = v => v.toFixed(1), name = c => { const p = byId.get(c.propId); return `${p.id} ${p.type} (${f1(p.x)},${f1(p.z)})`; };
  const near = (a, b, m) => a.bb.x1 + m >= b.bb.x0 && a.bb.x0 - m <= b.bb.x1 && a.bb.z1 + m >= b.bb.z0 && a.bb.z0 - m <= b.bb.z1;
  const walls = [...L.footprints, ...L.solids.filter(s => s.kind !== 'barricade')];
  for (const c of pieces) {
    if (!L.isPlayable(L.map, c.x, c.z, .3) || c.poly.some(([x, z]) => !L.isPlayable(L.map, x, z, 0))) bad.push(`${name(c)} outside the outline`);
    for (const w of [...L.footprints, ...L.solids]) if (near(c, w, 0) && L.penetration(c.poly, w.poly) > .02) bad.push(`${name(c)} overlaps ${w.id ?? w.kind}`);
    for (const o of all) if (o.propId !== c.propId && near(c, o, 0) && !o.walkOver && !c.walkOver && L.penetration(c.poly, o.poly) > .02) bad.push(`${name(c)} overlaps ${byId.get(o.propId).type} ${o.propId}`);
    if (!c.walkOver) {
      for (const d of L.doors) if (L.penetration(c.poly, d.poly) > .01) bad.push(`${name(c)} blocks a door of ${d.id}`);
      for (const z of [...L.zebras, ...L.stripes]) if (near(c, z, 0) && L.penetration(c.poly, z.poly) > .01) bad.push(`${name(c)} on a zebra`);
      if (L.penetration(c.poly, L.lane.poly) > 0) bad.push(`${name(c)} on the sniper lane`);
      if (L.penetration(c.poly, L.recess.poly) > 0) bad.push(`${name(c)} in the body pile's recess`);
      if (Math.hypot(c.x - L.map.spawn.x, c.z - L.map.spawn.z) < 1.5 + Math.max(c.w, c.d) / 2) bad.push(`${name(c)} on the spawn`);
      for (const s of L.spawnPts) if (L.distance(c.poly, L.boxPoly(s.x, s.z, .02, .02)) < 1) bad.push(`${name(c)} within 1 m of a spawn point`);
      for (const b of L.BASES) if (c.height >= .5 && L.distance(c.poly, L.boxPoly(b.x, b.z, .02, .02)) < 3.5) bad.push(`${name(c)} in the middle of base ${b.id}`);
      for (const s of L.solids) if (s.kind === 'barricade' && near(c, s, 1.5) && L.distance(c.poly, s.poly) < 1.5) bad.push(`${name(c)} at a barricade`);
      if (near(c, L.crossRect, 0) && L.penetration(c.poly, L.crossRect.poly) > 0 && !LUMEN_TREES.includes(byId.get(c.propId).type)) bad.push(`${name(c)} in the Crossroads`);
      // gaps to every other solid piece and every wall: closed or wide enough for a robot
      for (const o of [...all.filter(x => x.propId !== c.propId && !x.walkOver), ...walls]) {
        if (!near(c, o, 1.4)) continue;
        const g = L.distance(c.poly, o.poly); if (g > .705 && g < 1.395) bad.push(`${name(c)} and ${o.propId ? byId.get(o.propId).type + ' ' + o.propId : o.id ?? o.kind}: gap ${g.toFixed(2)} m`);
      }
    }
  }
  // Lamp and sign poles (visuals with no collider) stand clear of every new piece by 0.3 m.
  for (const s of L.map.citySigns || []) {
    if (!(s.kind === 'lamp' || (s.kind === 'pole' && s.buildingId == null && !/gantry/.test(s.id)))) continue;
    const pole = L.boxPoly(s.at[0], s.at[2], .02, .02);
    for (const c of pieces) if (!c.walkOver && Math.abs(c.x - s.at[0]) < 3 && Math.abs(c.z - s.at[2]) < 3 && L.distance(c.poly, pole) < .3) bad.push(`${name(c)} is ${L.distance(c.poly, pole).toFixed(2)} m from ${s.id}`);
  }
  // Back Alley keeps 1.8 m clear (this counts every solid piece, ours included).
  const A = L.BACK_ALLEY; let narrowest = Infinity;
  for (let x = A.x0; x <= A.x1 + 1e-9; x += .25) {
    const blocked = all.filter(c => !c.walkOver && c.bb.x0 <= x && c.bb.x1 >= x && c.bb.z1 > A.z0 && c.bb.z0 < A.z1).map(c => { const zs = c.poly.map(p => p[1]); return [Math.max(A.z0, Math.min(...zs)), Math.min(A.z1, Math.max(...zs))]; }).sort((a, b) => a[0] - b[0]);
    let free = 0, from = A.z0; for (const [a, b] of blocked) { free = Math.max(free, a - from); from = Math.max(from, b); }
    narrowest = Math.min(narrowest, Math.max(free, A.z1 - from));
  }
  assert.ok(narrowest >= 1.8, `Back Alley ${narrowest.toFixed(2)} m clear`);
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} problems`);
});

test('each type breaks in the simulation: hit, then broken, its collider gone and its event sent; restored, it stands again', () => {
  const sim = new Simulation(hooked); sim.reset();
  for (const type of LUMEN_BREAK_TYPES) {
    const prop = sim.props.find(p => p.type === type);
    assert.ok(prop && prop.hp === healthOf(type), `${type} is not standing`);
    assert.ok(sim.colliders.some(c => c.propId === prop.id && c.destructible), `${type} has no collider`);
    sim.events.length = 0;
    sim.hitProp(prop, { damage: 1, x: prop.x, z: prop.z, vx: 1, vz: 0 });
    assert.equal(sim.events.at(-1).type, 'propHit');
    sim.hitProp(prop, { damage: prop.hp, x: prop.x, z: prop.z, vx: 1, vz: 0 });
    const e = sim.events.at(-1);
    assert.equal(e.type, 'propBreak'); assert.equal(e.propType, type); assert.equal(e.id, prop.id);
    assert.ok(!sim.colliders.some(c => c.propId === prop.id), `${type} still collides`);
    assert.ok(sim.restoreProp(prop.id) && sim.colliders.some(c => c.propId === prop.id), `${type} did not come back`);
  }
  // A locker takes twelve, a mesh bin five; the trees do not break.
  const locker = sim.props.find(p => p.type === 'cityParcelLocker'); sim.hitProp(locker, { damage: 11, x: locker.x, z: locker.z }); assert.equal(locker.hp, 1);
  for (const t of LUMEN_TREES) { const tree = sim.props.find(p => p.type === t); sim.hitProp(tree, { damage: 99, x: tree.x, z: tree.z }); assert.equal(tree.hp, null); assert.ok(sim.colliders.some(c => c.propId === tree.id)); }
  // Reset puts every one back and says so.
  const some = sim.props.filter(p => LUMEN_BREAK_TYPES.includes(p.type)).slice(0, 8);
  for (const p of some) sim.hitProp(p, { damage: 99, x: p.x, z: p.z });
  sim.events.length = 0; sim.resetWorld?.();
  assert.ok(some.every(p => p.hp === healthOf(p.type)), 'a reset left something broken');
});

// ---- the effect, on stand-in views ----------------------------------------------
const ground = groundFor(L.map);
const CAPS = { potato: 48, performance: 140, balanced: 400, quality: 1300, extreme: 2200 };
function fxView(qualityName, sim) {
  const clatter = [];
  return { particles: [], quality: { particleCap: CAPS[qualityName], effects: 1 }, qualityName, ground, gy: (x, z) => ground.heightAt(x, z), shake: 0, onClatter: t => clatter.push(t), clatter,
    fxLightLevel: 0, lastSim: sim || null, map: { city: true }, scene: new THREE.Scene() };
}
const breakEvent = (p, extra = {}) => ({ type: 'propBreak', id: p.id, propType: p.type, x: p.x, z: p.z, directionX: 1, directionZ: 0, scale: 1, ...extra });
const run = (fx, view, seconds, step = 1 / 60) => { for (let t = 0; t < seconds; t += step) { fx.update(step); view.particles = view.particles.filter(q => (q.life -= step) > 0); } };

test('every type comes apart in its own way; what stays is capped; Potato throws less than Quality', () => {
  const props = L.mapProps(hooked), totals = { potato: 0, quality: 0 }, left = {};
  for (const quality of ['potato', 'quality']) {
    for (const type of LUMEN_BREAK_TYPES) {
      const view = fxView(quality), fx = makeBreakFX(view), p = props.find(o => o.type === type);
      assert.ok(fx instanceof LumenBreakFX);
      fx.break(breakEvent(p));
      assert.ok(view.particles.length > 0 || fx.items.length > 0, `${type} threw nothing on ${quality}`);
      assert.ok(view.particles.length <= view.quality.particleCap, `${type}: ${view.particles.length} particles`);
      assert.ok(view.particles.every(q => Number.isFinite(q.x + q.y + q.z + q.vx + q.vy + q.vz) && q.material === 7 && q.tint), `${type} has a bad particle`);
      totals[quality] += view.particles.length;
      run(fx, view, 2);
      totals[quality] += view.particles.length;
      assert.ok(fx.items.length <= LEAVINGS_CAP[quality], `${type}: ${fx.items.length} leavings`);
      assert.ok(fx.items.every(it => Number.isFinite(it.x + it.z)), `${type} left something nowhere`);
      if (quality === 'quality') left[type] = fx.items.length;
      fx.dispose();
    }
  }
  assert.ok(totals.potato < totals.quality, `potato ${totals.potato} vs quality ${totals.quality}`);
  // Something stays on the ground after nearly all of them (until the map resets).
  const bare = LUMEN_BREAK_TYPES.filter(t => !left[t]);
  assert.ok(bare.length <= 2, `nothing left by ${bare}`);
  // Two of the same type, or two types, are never the same debris: the recipes are not one shape.
  assert.equal(new Set(LUMEN_BREAK_RECIPES).size, LUMEN_BREAK_RECIPES.length);
});

test('the leavings stay until the map resets, and clear() takes them all', () => {
  const props = L.mapProps(hooked), view = fxView('quality'), fx = makeBreakFX(view);
  for (const type of ['cityCrate', 'cityStool', 'cityCableReel', 'cityFoodCart']) fx.break(breakEvent(props.find(o => o.type === type)));
  run(fx, view, 3); const n = fx.items.length; assert.ok(n > 0);
  run(fx, view, 60); assert.equal(fx.items.length, n, 'leavings faded');
  fx.clear(); assert.equal(fx.items.length, 0); assert.equal(fx.mesh.count, 0); assert.equal(fx.jets.length, 0);
});

test('the hydrant: a jet of spray for six seconds that ends, then a puddle; a restore stops it', () => {
  const props = L.mapProps(hooked), hydrant = props.find(p => p.type === 'cityHydrant');
  assert.deepEqual([JET.duration, JET.types[0]], [6, 'cityHydrant']);
  for (const quality of ['potato', 'quality']) {
    const view = fxView(quality), fx = makeBreakFX(view);
    fx.break(breakEvent(hydrant));
    assert.equal(fx.jets.length, 1);
    fx.update(1 / 60); fx.update(1 / 60);
    assert.ok(fx.mist.mesh.visible && fx.mist.mesh.count > 0, `no mist on ${quality}`);
    run(fx, view, 3); assert.ok(fx.mist.mesh.visible, 'mist gone at 3 s');
    run(fx, view, 3.3); assert.ok(fx.jets.length === 1 || fx.mist.mesh.visible, 'the jet ended too early');
    run(fx, view, JET.linger + .5); assert.equal(fx.jets.length, 0, 'the jet never ended'); assert.equal(fx.mist.mesh.visible, false);
    assert.ok(fx.items.length > 0, 'no puddle');
    // (mist puffs are a fixed pool: potato 6 a jet at most)
    assert.ok(fx.mist.mesh.instanceMatrix.count >= fx.mist.puffs * 4);
  }
  const view = fxView('balanced'), fx = makeBreakFX(view);
  fx.break(breakEvent(hydrant)); run(fx, view, 2); assert.equal(fx.jets.length, 1);
  fx.restore({ id: hydrant.id }); assert.equal(fx.jets.length, 0); assert.equal(fx.mist.mesh.visible, false);
  // Four jets at once, the oldest gives way.
  const view2 = fxView('balanced'), fx2 = makeBreakFX(view2);
  for (let i = 0; i < 6; i++) fx2.break(breakEvent(hydrant, { id: 'h' + i }));
  assert.equal(fx2.jets.length, 4);
});

test('the jet blocks sight while it sprays (pure functions of the shared clock), and nothing else', () => {
  const prop = { id: 'h', type: 'cityHydrant', x: 10, z: 5, hp: 0 }, sim = { time: 100, worldTime() { return this.clock; }, clock: 40 };
  assert.equal(jetStart(sim, prop), true); assert.equal(sim.jets.length, 1); assert.equal(sim.jets[0].at, 40, 'stamped on the world clock');
  assert.equal(jetStart(sim, { ...prop, type: 'cityCrate' }), false);
  const across = () => jetsBlockSight(sim, 4, 5, 16, 5), past = () => jetsBlockSight(sim, 4, 8, 16, 8), inside = () => jetsBlockSight(sim, 10, 5.5, 10.5, 5.5);
  assert.equal(across(), true); assert.equal(inside(), true, 'an eye in the spray is blind'); assert.equal(past(), false, 'a line 3 m aside is clear');
  sim.clock = 40 + JET.duration - .01; assert.equal(across(), true);
  sim.clock = 40 + JET.duration + .01; assert.equal(across(), false, 'six seconds and it stops');
  sim.clock = 41; prop.hp = 3; assert.equal(across(), false, 'a restored hydrant does not spray');
  prop.hp = 0; assert.equal(across(), true);
  assert.equal(jetOn(sim.jets[0], 39), false, 'before the break');
  // A second break of the same prop replaces its jet (no pile-up).
  jetStart(sim, prop); assert.equal(sim.jets.length, 1);
  // Without a world clock the sim's own time is used.
  const plain = { time: 7 }; jetStart(plain, prop); assert.equal(plain.jets[0].at, 7);
});

// Online: a joiner's jet runs on the host's clock, from when the hydrant
// broke there, not from when the news arrived (a link 100 ms late here, and
// the snapshot's own wait), so both screens lose sight through it together.
test('online, a joiner\'s jet starts when the host\'s did (the break\'s tick, not the news\' arrival)', () => {
  const net = createLoopback(), m = hooked, createSim = mm => new Simulation(mm);
  let time = 100;
  const now = () => time;
  const hostSim = createSim(m), host = new HostSession({ transport: net.host('ABCDE'), map: m, local: hostSim, createSim, now, name: 'H', settings: { robots: 'off' } });
  const joinSim = createSim(m), join = new ClientSession({ transport: net.join('ABCDE'), map: m, local: joinSim, createSim, now, name: 'J' });
  net.flush(); host.startRound('ffa'); host.choose('static'); net.flush();
  // One tick as main.js runs it: the shared clock set, both sims stepped, the host's tick.
  const tick = (deliver, act) => {
    time += 1 / 60;
    hostSim.worldClock = host.worldClock(); const j = join.worldClock(); if (j !== null) joinSim.worldClock = j;
    hostSim.step(host.beforeLocal({})); act?.(); joinSim.step(join.input({}));
    if (deliver) net.flush(); host.step(); hostSim.drainEvents(); if (deliver) net.flush();
  };
  for (let i = 0; i < 120; i++) tick(true); // (the joiner's clock mapping settles on the prompt packets)
  const id = hostSim.props.find(p => p.type === 'cityHydrant').id;
  // The break, then six ticks (100 ms) with nothing delivered.
  tick(false, () => hostSim.hitProp(hostSim.props.find(p => p.id === id), { damage: 99, x: 0, z: 0, vx: 1, vz: 0 }));
  for (let i = 0; i < 5; i++) tick(false);
  for (let i = 0; i < 6; i++) tick(true);
  const hostJet = hostSim.jets?.find(q => q.prop.id === id), joinJet = joinSim.jets?.find(q => q.prop.id === id);
  assert.ok(hostJet && joinJet, 'a jet on both screens');
  assert.ok(Math.abs(joinJet.at - hostJet.at) < 1e-6, `joiner's jet at ${joinJet.at}, the host's at ${hostJet.at}`);
  // And it ends on both at the same shared time (the joiner's clock tracks the host's within a few ms).
  assert.ok(Math.abs(join.worldClock() - host.worldClock()) < .02, `clocks ${join.worldClock()} / ${host.worldClock()}`);
  assert.equal(jetOn(joinJet, hostJet.at + JET.duration - .01), true); assert.equal(jetOn(joinJet, hostJet.at + JET.duration + .01), false);
});

test('sounds: each type has its own voices, a dash adds the body, the hydrant hisses for its jet', () => {
  const record = () => { const calls = []; const s = new Proxy({}, { get: (_, k) => (...a) => { calls.push([k, ...a]); } }); return { s, calls }; };
  const sigs = new Set();
  for (const type of LUMEN_BREAK_TYPES) {
    const { s, calls } = record();
    assert.ok(playLumenBreakSound(s, { propType: type }), `${type} has no sound`);
    assert.ok(calls.length >= 4, `${type}: ${calls.length} voices`);
    sigs.add(JSON.stringify(calls.map(c => [c[0], c[1] > 1 ? Math.round(c[1]) : c[1]]).slice(0, 6)));
    const dashed = record(); playLumenBreakSound(dashed.s, { propType: type, dashed: true });
    assert.equal(dashed.calls.length, calls.length + 2, `${type}: a dash adds two voices`);
    for (const c of calls) for (const v of c.slice(1)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${type}: ${c[0]} has a bad number`);
  }
  assert.ok(sigs.size >= LUMEN_BREAK_TYPES.length * .8, `${sigs.size} distinct sounds for ${LUMEN_BREAK_TYPES.length} types`);
  assert.equal(playLumenBreakSound(record().s, { propType: 'barrel' }), false);
  assert.equal(playLumenBreakSound(record().s, { propType: 'cityTreeMetro' }), false);
  const { s, calls } = record(); playLumenBreakSound(s, { propType: 'cityHydrant' });
  assert.ok(calls.some(c => c[0] === 'whoosh' && c[1] >= 5), 'no long hiss for the jet');
});

test('cost: a break costs under 0.2 ms a frame while it runs, and the pools are fixed', () => {
  const props = L.mapProps(hooked), view = fxView('extreme'), fx = makeBreakFX(view);
  const list = ['cityHydrant', 'cityVending', 'cityScooterHeap', 'cityFoodCart', 'cityShopGlass', 'cityCrate', 'cityBikeRack', 'cityMeshBin'];
  for (const type of list) fx.break(breakEvent(props.find(o => o.type === type)));
  for (let i = 0; i < 60; i++) fx.update(1 / 60); // warm
  const t0 = performance.now(); let frames = 0;
  for (let i = 0; i < 300; i++) { fx.update(1 / 60); frames++; }
  const ms = (performance.now() - t0) / frames;
  assert.ok(ms < .2, `${ms.toFixed(3)} ms per active frame`);
  assert.ok(fx.mesh.count <= LEAVINGS_CAP.extreme);
  const meshes = view.scene.children.filter(o => o.isInstancedMesh).length; run(fx, view, 1); assert.equal(view.scene.children.filter(o => o.isInstancedMesh).length, meshes, 'a mesh was added while running');
});

test('the colours in the breakables, the furniture and the effects are never near Amber, Cyan or Violet', () => {
  const team = { amber: '#ffb020', cyan: '#2ee6ff', violet: '#b77bff' }, bad = [];
  for (const file of ['src/effects/lumen-breaks.js', 'src/effects/lumen-break-sounds.js', 'src/world/lumen-breakables.js', 'src/world/lumen-furniture.js', 'src/world/lumen-kit.js', 'src/world/lumen-targets.js', 'src/maps/lumen-breakables.js']) {
    for (const m of source(file).matchAll(/'(#[0-9a-fA-F]{6})'/g)) for (const [k, ref] of Object.entries(team)) { const d = deltaBytes(hexToBytes(m[1]), hexToBytes(ref)); if (d < 15) bad.push(`${file}: ${m[1]} is ${d.toFixed(1)} from ${k}`); }
  }
  assert.deepEqual(bad, []);
});

// What glows is seen brighter than written: DetailFX multiplies a spark's or an
// ember's ramp colour by its glow (in linear light, added over the dark street,
// then tone mapped), and an orange that is 15 away as written can be 6 away on
// screen. So every ramp is sampled along its length (41 points) and measured
// at x1 and at its glow multiplier, clamped and through ACES; the fx light's
// flame colour at x1 and x1.2. 17: the rule's 15 and a little for bloom.
test('what glows (spark and ember ramps, flashes, the fx light) stays 17+ from Amber, Cyan and Violet on screen, at its glow', () => {
  const teams = [['amber', '#ffb020'], ['cyan', '#2ee6ff'], ['violet', '#b77bff']].map(([k, h]) => [k, lab(hexRgb(h))]), close = [];
  const measure = (label, stops, gains) => {
    const lin = stops.map(hexLinear), n = 40;
    for (let s = 0; s <= n; s++) {
      const f = s / n * (lin.length - 1), i = Math.min(lin.length - 2, Math.floor(f)), u = f - i;
      const col = lin.length === 1 ? lin[0] : lin[i].map((q, j) => q + (lin[i + 1][j] - q) * u);
      for (const g of gains) for (const shown of [col.map(q => Math.min(1, q * g)).map(toSrgb), acesFilmic(col.map(q => q * g), 1).map(toSrgb)]) {
        for (const [k, t] of teams) { const d = deltaE2000(lab(shown), t); if (d < 17) close.push(`${label} at ${(s / n).toFixed(2)} x${g}: ${d.toFixed(1)} from ${k}`); }
        if (lin.length === 1) break;
      }
      if (lin.length === 1) break;
    }
  };
  for (const k of ['ember', 'hotSparks', 'coolSparks', 'whiteSparks']) measure(k, BREAK_GLOW[k].stops, [1, BREAK_GLOW[k].glow]);
  for (const hex of [...BREAK_GLOW.flashes, BREAK_GLOW.gasFlash]) measure(`flash ${hex}`, [hex], [1, BREAK_GLOW.glow]);
  measure(`flame ${BREAK_GLOW.flame}`, [BREAK_GLOW.flame], [1, 1.2]);
  assert.deepEqual(close.slice(0, 8), [], `${close.length} glowing colours too near a team colour`);
  // Every glowing colour in the recipes is one of these: no ramp or flash written inline.
  const src = source('src/effects/lumen-breaks.js');
  assert.doesNotMatch(src, /stops:\s*\[/, 'a ramp written inline (put it in BREAK_GLOW)');
  for (const m of src.matchAll(/flash\(fx,[^;]*?'(#[0-9a-fA-F]{6})'/g)) assert.ok(BREAK_GLOW.flashes.includes(m[1]), `flash ${m[1]} is not in BREAK_GLOW.flashes`);
  assert.doesNotMatch(src, /fxLight\.color\.set\('#/, 'the fx light set to an inline colour');
});

test('the lights: furniture lights are ground pools in the city tones, none pink or red on a roadway', () => {
  const lights = lumenFurnitureLights(hooked.props);
  assert.ok(Array.isArray(lights) && lights.length > 0);
  for (const l of lights) {
    assert.ok(Number.isFinite(l.x + l.z + l.rx + l.rz + l.strength), 'a bad pool');
    assert.ok(['white', 'blue', 'lemon', 'green', 'pink', 'red', 'sodium'].includes(l.tone), l.tone);
  }
});

// ---- the practice targets -----------------------------------------------------
test('city targets: a boxy board on a steel pop-up stand and a padded mannequin on a weighted base, in the space the damage is drawn in', () => {
  const view = stubView(), batched = []; view.batch = g => batched.push(g);
  for (const [moving, kind] of [[false, 'board'], [true, 'board'], [false, 'dummy'], [true, 'dummy']]) {
    const g = makeCityTarget(view, moving, kind), board = g.userData.board;
    assert.ok(board && board.parent === g, `${kind}: no board group`);
    assert.equal(batched.at(-1), board, 'the board is batched into a draw');
    const n = countGroup(g); assert.ok(n.triangles > 100 && n.triangles < 1500, `${kind}: ${n.triangles} triangles`);
    const box = new THREE.Box3().setFromObject(g);
    assert.ok(box.min.y > -.02 && box.max.y < 2, `${kind}: height ${box.max.y}`);
    assert.ok(box.max.x - box.min.x < 1.4 && box.max.z - box.min.z < 1.2, `${kind}: footprint`);
    const colours = new Set(); g.traverse(o => { if (o.isMesh) colours.add(o.material.color.getHexString()); });
    assert.ok(colours.size >= 4, `${kind}: ${colours.size} colours`);
    for (const c of colours) for (const ref of ['#ffb020', '#2ee6ff', '#b77bff']) assert.ok(deltaBytes(hexToBytes('#' + c), hexToBytes(ref)) >= 15, `${kind}: #${c} near a team colour`);
    if (kind === 'board') {
      const face = board.children.find(o => o.isGroup);
      assert.ok(face && face.position.y === 1 && Math.abs(face.rotation.x - .6) < 1e-9, 'the face is 1 m up, tipped .6');
    } else {
      const at = y => board.children.some(o => o.isMesh && Math.abs(o.position.y - y) < .02);
      assert.ok(at(1.04) && at(1.58) && at(1.2), 'torso 1.04, head 1.58, arms 1.2');
    }
  }
  // Static and moving boards differ (the moving one is green).
  const hex = (moving) => { const g = makeCityTarget(view, moving, 'board'), s = new Set(); g.traverse(o => { if (o.isMesh) s.add(o.material.color.getHexString()); }); return [...s].sort().join(); };
  assert.notEqual(hex(true), hex(false));
  // The damage stages, holes and tears attach and show on these as on the wooden ones.
  for (const kind of ['board', 'dummy']) for (const q of ['balanced', 'quality', 'extreme']) {
    const g = makeCityTarget(view, false, kind), d = makeTargetDamage(g.userData.board, kind, 't1', q);
    assert.ok(d, `${kind} ${q}: no damage`);
  }
});

// ---- the hooks (the lead's files) --------------------------------------------------
test('hooks: the shared files take the map, the effects, the sounds, the jets and the city targets', () => {
  const need = [
    ['src/maps/lumen.js', /\.\.\.LUMEN_BREAKABLE_PROPS/, 'props: [...LUMEN_PROPS, ...BASE_SCREENS, ...LUMEN_BREAKABLE_PROPS, ...]'],
    ['src/maps/lumen.js', /lumenFurnitureLights/, 'groundShapes([... , ...lumenFurnitureLights(lumen.props)])'],
    ['src/render/renderer.js', /handlesLumenBreak/, 'breakProp: handlesLumenBreak -> makeBreakFX(this).break(e)'],
    ['src/render/renderer.js', /hollowBreaks\??\.restore/, 'propRestore: this.hollowBreaks?.restore?.(e)'],
    ['src/render/warm-up.js', /handlesLumenBreak|makeBreakFX/, 'warm-up builds the break effect on a map with these props'],
    ['src/audio.js', /playLumenBreakSound/, 'audio.js propBreak: playLumenBreakSound'],
    ['src/simulation.js', /jetStart\(this, prop\)/, 'hitProp: jetStart(this, prop) after prop.hp === 0'],
    ['src/simulation.js', /jetsBlockSight\(this,/, 'sightBlocked: jetsBlockSight(this, ax, az, bx, bz)'],
    ['src/net/client-session.js', /jetStart\(/, 'setProp: jetStart(this.local, prop) on a break'],
    ['src/render/world-build.js', /makeCityTarget/, 'makeTarget: if (this.map.city) return makeCityTarget(this, moving, kind)'],
  ];
  const missing = need.filter(([file, re]) => !re.test(source(file))).map(([file, , what]) => `${file}: ${what}`);
  assert.deepEqual(missing, [], 'hooks still to be made');
});
