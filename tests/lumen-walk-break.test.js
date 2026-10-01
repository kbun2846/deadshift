// Lumen: light street things break when a body walks into them (owner,
// 2026-09-30: "walking through (weaker) breakable objects breaks them
// automatically"). A prop type flagged `walkBreak` (crates, stools, chairs,
// bags, bikes, scooters, litter bins; cones and other walk-over clutter
// always did) comes apart under a player's or a robot's stride on a city map;
// heavy furniture (vending machines, hydrants, lockers) still stops a body;
// and a map without a `city` block behaves exactly as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { PROP_TYPES } from '../src/map-kit.js';
import * as L from './lumen-place-lib.js';

const WEAK = ['cityCrate', 'cityDeliveryBox', 'cityStool', 'cityPlasticChair', 'cityMeshBin', 'cityBicycle', 'cityScooter', 'cityTrashBags', 'cityCone'];
const HEAVY = ['cityVending', 'cityHydrant', 'cityParcelLocker', 'cityChargePost', 'cityRecycleBin', 'cityCableReel', 'cityWaterBarrier', 'cityFoodCart', 'cityParkingMeter', 'cityInfoTerminal', 'cityMotorbike', 'cityScooterHeap', 'cityBikeRack'];

// Walk the sim's body at the prop from 1.2 m away along +x (then +z, -x, -z
// until one approach is playable) for up to 2 s, the way a held key does.
function walkInto(sim, prop) {
  for (const [ax, az] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const p = sim.player;
    p.x = prop.x + ax * 1.2; p.z = prop.z + az * 1.2; p.vx = p.vz = 0;
    for (let i = 0; i < 40; i++) { sim.movePlayer(-ax * .05, -az * .05); }
    const live = sim.props.find(q => q.id === prop.id);
    if (live.hp === 0 || Math.hypot(p.x - prop.x, p.z - prop.z) < 0.55) return live;
  }
  return sim.props.find(q => q.id === prop.id);
}

test('the flagged types are the light ones, and only those', () => {
  for (const t of WEAK) assert.ok(PROP_TYPES[t].walkBreak || PROP_TYPES[t].walkOver, `${t} is not flagged`);
  for (const t of HEAVY) assert.ok(!PROP_TYPES[t].walkBreak && !PROP_TYPES[t].walkOver, `${t} must stay solid`);
  for (const [t, def] of Object.entries(PROP_TYPES)) if (def.walkBreak) assert.ok(def.health !== null && def.health <= 5, `${t} is flagged but not weak`);
});

test('a player walking into each light piece breaks it (event sent, collider gone); a heavy piece stops them', () => {
  const sim = new Simulation(L.map, 'static');
  const seen = new Set();
  for (const type of [...WEAK, ...HEAVY]) {
    const prop = sim.props.find(p => p.type === type);
    if (!prop) continue; seen.add(type);
    sim.events.length = 0;
    const live = walkInto(sim, prop);
    if (WEAK.includes(type)) {
      assert.equal(live.hp, 0, `${type} survived a walk into it`);
      assert.ok(sim.events.some(e => e.type === 'propBreak' && e.id === prop.id), `${type} sent no break event`);
      assert.ok(!sim.colliders.some(c => c.propId === prop.id), `${type} still collides`);
    } else {
      assert.ok(live.hp > 0, `${type} broke under a walk`);
      assert.ok(sim.colliders.some(c => c.propId === prop.id), `${type} lost its collider`);
    }
  }
  for (const t of ['cityCrate', 'cityStool', 'cityPlasticChair', 'cityTrashBags', 'cityVending']) assert.ok(seen.has(t), `no ${t} on the map`);
});

test('a robot (its own Simulation over the shared props and colliders) breaks one too', () => {
  const host = new Simulation(L.map, 'static'), robot = new Simulation(L.map, 'static');
  robot.props = host.props; robot.colliders = host.colliders; // (BotMatch.hand)
  const crate = host.props.find(p => p.type === 'cityCrate'), vending = host.props.find(p => p.type === 'cityVending');
  walkInto(robot, crate);
  assert.equal(host.props.find(p => p.id === crate.id).hp, 0, 'the robot walked through a crate');
  assert.ok(robot.events.some(e => e.type === 'propBreak' && e.id === crate.id));
  robot.props = host.props;
  walkInto(robot, vending);
  assert.ok(host.props.find(p => p.id === vending.id).hp > 0, 'a robot broke a vending machine by walking');
});

test('a map without a city block is unchanged: a solid breakable stops a walking body', () => {
  const base = { ...L.map, city: undefined };
  const sim = new Simulation(base, 'static');
  const crate = sim.props.find(p => p.type === 'cityCrate');
  walkInto(sim, crate);
  assert.ok(sim.props.find(p => p.id === crate.id).hp > 0, 'a non-city map broke a crate by walking');
});
