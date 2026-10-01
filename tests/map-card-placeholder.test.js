// Lumen stage 4: a map with no picture yet keeps the map-pick tile and the
// Practice card exactly as the others' (same size, same name styling) and a
// plain slate picture area with no text. Lumen stays out of the menus.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { maps, menuMaps, workMaps } from '../src/maps.js';
import { mapGridHTML, registerMapImages } from '../src/ui/weapon-grid.js';

const css = readFileSync(new URL('../src/styles/menu-theme.css', import.meta.url), 'utf8');
const menu = readFileSync(new URL('../src/ui/menu.js', import.meta.url), 'utf8');
const rule = selector => { const at = css.indexOf(selector + '{'); assert.ok(at >= 0, selector); return css.slice(at, css.indexOf('}', at)); };

test('a tile with no picture is the picture tile with an empty picture area', () => {
  registerMapImages({ deadwater: 'data:d', 'hollow-wick': 'data:h' });
  try {
    const html = mapGridHTML({ label: 'map', maps: [maps.deadwater, maps['hollow-wick'], maps.lumen], pressed: 'deadwater' });
    const tiles = html.match(/<button[^>]*map-tile[^>]*>.*?<\/button>/gs);
    assert.equal(tiles.length, 3);
    // Strip what is allowed to differ: the map's id, name and picture.
    const shape = (tile, map) => tile.replaceAll(map.id, 'ID').replaceAll(map.name, 'NAME').replace(/<img[^>]*>/, '').replace(/aria-pressed="\w+"/, '');
    assert.equal(shape(tiles[2], maps.lumen), shape(tiles[0], maps.deadwater), 'same markup and classes as Deadwater\'s');
    assert.equal(shape(tiles[2], maps.lumen), shape(tiles[1], maps['hollow-wick']), 'and as Hollow Wick\'s');
    // No text but the name; the picture area holds nothing.
    assert.match(tiles[2], /<span class="weapon-tile-picture"><\/span><span class="weapon-tile-name">Lumen<\/span>/);
  } finally { registerMapImages({}); }
});

test('the tile\'s size and name styling do not depend on the picture', () => {
  // Every size and the name's type come from rules on the tile, never on an <img>.
  assert.match(rule('#game .weapon-grid.map-grid button.weapon-tile'), /height:104px/);
  assert.match(rule('#game .weapon-grid button.weapon-tile'), /position:relative/);
  const picture = rule('#game .weapon-grid.map-grid .map-tile .weapon-tile-picture');
  assert.match(picture, /inset:0 0 21px/); assert.match(picture, /background:#1c2120/); // the slate panel, sized by the box
  assert.match(picture, /overflow:hidden/);
  assert.doesNotMatch(rule('#game .weapon-grid .weapon-tile-name'), /img/);
  assert.match(rule('#game .weapon-grid .weapon-tile-name'), /font:800 10px/);
});

test('the Practice card with no picture keeps its size, its name and the same slate', () => {
  // Size: the thumbnail box has a fixed aspect ratio, whatever it holds.
  assert.match(rule('#game .map-options .map-choice .map-thumbnail'), /aspect-ratio:230\/285/);
  assert.match(rule('#game .map-options .map-choice .map-thumbnail:empty'), /background:#1c2120/);
  // The name is stretched SVG text made from the map's name for every card, picture or none.
  assert.match(menu, /card\.innerHTML=`<span class="map-thumbnail"><\/span><small class="map-mode">Practice<\/small><span class="map-caption"><strong>\$\{stretched\(first\)\}\$\{stretched\(second\)\}<\/strong><\/span>`/);
  // A card the owner has not given a picture is not filled with a live render either.
  assert.match(menu, /if\(CARD_IMAGES\[map\.id\]\|\|map\.card\?\.placeholder\)return;/);
});

test('Lumen: released with its card picture (owner, 2026-10-01): the shipped thumbnail, no placeholder', () => {
  assert.equal(maps.lumen.menu, true);
  assert.ok(menuMaps().includes(maps.lumen) && !workMaps().includes(maps.lumen));
  assert.equal(maps.lumen.card.placeholder, undefined);
  assert.ok(maps.lumen.card.thumbnail.lift >= 1 && maps.lumen.card.thumbnail.lift <= 1.5);
  assert.ok(existsSync(new URL('../src/assets/thumbnails/lumen.webp', import.meta.url)));
});
