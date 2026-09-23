// The weapon and map registries: the one place new weapons and maps are
// added. These checks keep every entry complete, so a new one that forgets a
// field fails here rather than in a menu or mid-match.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, DEFAULT_WEAPON, WEAPON_IDS, isWeapon, weaponOrDefault, usesTrigger } from '../src/items.js';
import { maps, DEFAULT_MAP, mapById, menuMaps, multiplayerMaps, supportsMode } from '../src/maps.js';
import { tutorialMapFor } from '../src/tutorial.js';
import { readMessage } from '../src/net/protocol.js';

test('every weapon entry is complete', () => {
 for (const w of WEAPONS) {
  assert.ok(['orbs', 'trigger'].includes(w.input), w.id + ' input scheme');
  assert.equal(typeof w.smoothCursor, 'boolean', w.id + ' smoothCursor');
  assert.ok(w.name && w.description && w.controls?.length && w.hints?.keyboard && w.hints?.touch, w.id + ' menu text');
  if (w.input === 'trigger') for (const slot of ['extended', 'grenade']) {
   const b = w.touchButtons?.[slot];
   assert.ok(b?.label && b.binding && b.key && b.aria, w.id + ' touch button ' + slot);
  }
 }
 assert.equal(new Set(WEAPON_IDS).size, WEAPON_IDS.length, 'ids are unique');
});

test('unknown weapons fall back to the default everywhere', () => {
 assert.equal(DEFAULT_WEAPON, WEAPONS[0].id);
 assert.equal(weaponOrDefault('laser'), DEFAULT_WEAPON);
 assert.equal(weaponOrDefault('shotgun'), 'shotgun');
 assert.ok(isWeapon('rifle') && !isWeapon(undefined));
 assert.ok(usesTrigger('rifle') && usesTrigger('shotgun') && !usesTrigger('static'));
 assert.equal(readMessage({ t: 'choose', weapon: 'laser' }).weapon, DEFAULT_WEAPON);
 assert.equal(tutorialMapFor('shotgun').targets[0].maxHp, 400, 'per-weapon tutorial tweaks come from items.js');
});

test('every map says where it can be played, and the menus read that', () => {
 for (const map of Object.values(maps)) {
  assert.ok(Array.isArray(map.modes) && map.modes.length, map.id + ' modes');
  assert.equal(typeof map.menu, 'boolean', map.id + ' menu');
  assert.ok(map.spawn && map.width && map.depth && map.name, map.id + ' basics');
 }
 assert.ok(maps[DEFAULT_MAP]);
 assert.equal(mapById('nowhere'), maps[DEFAULT_MAP]);
 assert.deepEqual(menuMaps().map(m => m.id), ['deadwater']);
 assert.ok(multiplayerMaps().length >= 1 && multiplayerMaps().every(m => supportsMode(m, 'multiplayer')));
 assert.ok(!supportsMode(maps['dry-creek'], 'multiplayer'));
});
