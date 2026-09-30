import test from 'node:test';
import assert from 'node:assert/strict';
import { weaponChoices, weaponFromChoice, weaponGridHTML, registerWeaponImages } from '../src/ui/weapon-grid.js';
import { WEAPONS } from '../src/items.js';
import { ROBOT_OPTIONS } from '../src/ui/robot-options.js';
import { DEV_OPTIONS } from '../src/ui/dev-options.js';
import { readFileSync } from 'node:fs';

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

// (Owner, 2026-09-29: map tiles showed only a strip of their picture.) The
// picture box is a plain block and its <img> covers all of it, absolutely
// placed, so its size never comes from an auto grid row; a map without a
// picture keeps the same tile with a plain slate picture area.
test('map tiles: the picture fills the tile picture area (cover, centred); no picture keeps the tile', async () => {
 const { mapGridHTML, registerMapImages } = await import('../src/ui/weapon-grid.js');
 registerMapImages({ deadwater: 'data:deadwater' });
 const html = mapGridHTML({ label: 'map', maps: [{ id: 'deadwater', name: 'Deadwater Outpost' }, { id: 'lumen', name: 'Lumen' }], pressed: 'deadwater' });
 assert.match(html, /class="weapon-tile plain-text map-tile" data-choice="deadwater"[^>]*><span class="weapon-tile-picture"><img src="data:deadwater"[^>]*><\/span><span class="weapon-tile-name">Deadwater Outpost<\/span>/);
 // The map with no picture: the same tile, an empty picture area (no text in it).
 assert.match(html, /data-choice="lumen"[^>]*><span class="weapon-tile-picture"><\/span><span class="weapon-tile-name">Lumen<\/span>/);
 assert.ok(html.includes('weapon-tile-soon'));
 registerMapImages({});
 const css = readFileSync(new URL('../src/styles/menu-theme.css', import.meta.url), 'utf8');
 const rule = selector => { const at = css.indexOf(selector + '{'); assert.ok(at >= 0, selector); return css.slice(at, css.indexOf('}', at)); };
 const box = rule('#game .weapon-grid .weapon-tile-picture');
 assert.match(box, /position:absolute/); assert.match(box, /display:block/); assert.doesNotMatch(box, /display:grid/);
 const img = rule('#game .weapon-grid .weapon-tile-picture>img');
 for (const part of [/position:absolute/, /inset:0/, /width:100%/, /height:100%/]) assert.match(img, part);
 const mapBox = rule('#game .weapon-grid.map-grid .map-tile .weapon-tile-picture');
 assert.match(mapBox, /overflow:hidden/); assert.match(mapBox, /background:#1c2120/);
 const mapImg = rule('#game .weapon-grid.map-grid .map-tile .weapon-tile-picture>img');
 assert.match(mapImg, /object-fit:cover/); assert.match(mapImg, /object-position:50% 50%/);
 // Tile sizes unchanged.
 assert.match(rule('#game .weapon-grid.map-grid button.weapon-tile'), /height:104px/);
 // The dropdown's own thumbnail: the same fill, cover for any map.
 assert.match(rule('#game .picker .picker-thumb>img'), /position:absolute;inset:0/);
 assert.match(rule('#game .picker .picker-thumb.picker-thumb-map>img'), /object-fit:cover/);
});
