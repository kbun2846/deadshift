import test from 'node:test';
import assert from 'node:assert/strict';
import { weaponChoices, weaponFromChoice, weaponGridHTML, registerWeaponImages } from '../src/ui/weapon-grid.js';
import { WEAPONS } from '../src/items.js';
import { ROBOT_OPTIONS } from '../src/ui/robot-options.js';
import { DEV_OPTIONS } from '../src/ui/dev-options.js';

test('weapon grids list random then every weapon in the registry, with pictures', () => {
 const choices = weaponChoices();
 assert.deepEqual(choices.map(c => c[2]), [null, ...WEAPONS.map(w => w.id)]);
 for (const [value, , id] of choices) assert.equal(weaponFromChoice(value), id);
 registerWeaponImages(Object.fromEntries(WEAPONS.map(w => [w.id, 'data:' + w.id])));
 const html = weaponGridHTML({ label: 'robot weapon', pressed: '2' });
 for (const w of WEAPONS) { assert.ok(html.includes('data:' + w.id)); assert.ok(html.includes('>' + w.name + '<')); }
 assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
 assert.ok(html.includes('data-choice="2" aria-pressed="true"'));
 assert.ok(html.includes('weapon-tile-random'));
 registerWeaponImages({});
});
test('every weapon-choosing menu uses the grid', () => {
 assert.equal(ROBOT_OPTIONS.weapon.grid, 'weapons');
 assert.equal(ROBOT_OPTIONS.weapon.names.length, WEAPONS.length + 1);
 const dev = DEV_OPTIONS.find(o => o.key === 'robotWeapon');
 assert.equal(dev.grid, 'weapons');
 assert.equal(dev.options.length, WEAPONS.length + 1);
});
