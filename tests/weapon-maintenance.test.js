// Weapons under maintenance (owner, 2026-09-29: "disable the sniper weapon by
// putting a maintenance sticker over it in all spots, make a disable
// maintenance option in dev tools"): the sniper keeps its place with a
// sticker, nobody gets it (you, at random, robots, online), and the
// developer tools' switch lifts it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS } from '../src/items.js';
import { MAINTENANCE, underMaintenance, playableWeapons, randomPlayableWeapon, playableOr, setMaintenanceLifted, maintenanceLifted } from '../src/weapon-maintenance.js';
import { weaponGridHTML } from '../src/ui/weapon-grid.js';
import { DEV_OPTIONS } from '../src/ui/dev-options.js';
import { maps } from '../src/maps.js';
import { Simulation } from '../src/simulation.js';
import { BotMatch } from '../src/bots/bot-match.js';
import { arena, people, bots } from './rules-harness.js';

const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('the sniper (Sightline) is under maintenance: never picked at random, refused by name', () => {
 assert.deepEqual(MAINTENANCE, ['sightline']); assert.ok(WEAPONS.some(w => w.id === 'sightline'), 'still in the registry');
 assert.equal(maintenanceLifted(), false);
 assert.equal(underMaintenance('sightline'), true); assert.equal(underMaintenance('rifle'), false);
 assert.ok(!playableWeapons().some(w => w.id === 'sightline')); assert.equal(playableWeapons().length, WEAPONS.length - 1);
 const random = seeded(3); for (let i = 0; i < 2000; i++) assert.notEqual(randomPlayableWeapon(random), 'sightline');
 assert.equal(playableOr('sightline'), 'static'); assert.equal(playableOr('sightline', null), null); assert.equal(playableOr('shotgun'), 'shotgun');
});

test('the developer tools\' switch lifts it (and puts it back)', () => {
 const option = DEV_OPTIONS.find(o => o.key === 'maintenanceOff');
 assert.ok(option && option.kind === 'toggle' && !option.bulk, 'a switch of its own, not in the P set');
 setMaintenanceLifted(true);
 try {
  assert.equal(underMaintenance('sightline'), false); assert.equal(playableWeapons().length, WEAPONS.length);
  assert.equal(playableOr('sightline'), 'sightline');
 } finally { setMaintenanceLifted(false); }
 assert.equal(underMaintenance('sightline'), true);
});

test('every weapon grid shows it with the sticker, marked so the click is refused', () => {
 const html = weaponGridHTML({ label: 'Weapon' });
 const tile = html.split('<button').find(t => t.includes('data-maintenance="sightline"'));
 assert.ok(tile, 'the tile is there'); assert.match(tile, /maintenance-sticker/); assert.match(tile, /maintenance-tile/);
 assert.equal((html.match(/maintenance-sticker/g) || []).length, MAINTENANCE.length, 'no other tile has one');
});

test('robots never get it: SOLO spawns (even when asked by name) and online seats', () => {
 const map = maps.deadwater, sim = new Simulation(map), match = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(4) });
 sim.respawn(map.spawn);
 for (let i = 0; i < 7; i++) { const b = match.spawn(sim, i === 0 ? 'sightline' : null); assert.notEqual(b.sim.weapon, 'sightline'); }
 for (let k = 0; k < 6; k++) {
  const a = arena({ humans: 1, mode: '4v4' });
  for (const s of bots(a)) assert.notEqual(s.weapon, 'sightline');
 }
});

test('online: the host refuses it from a player (a random weapon instead)', () => {
 const a = arena({ humans: 2 });
 assert.ok(a.startRound('ffa'), a.startError);
 for (const s of people(a)) a.choose(s.id, 'sightline');
 for (const s of people(a)) { assert.ok(s.weapon, 'in with a weapon'); assert.notEqual(s.weapon, 'sightline'); }
});
