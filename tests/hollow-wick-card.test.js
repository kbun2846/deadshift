// s3-look: Hollow Wick's map card (maps.js `card`, maps/hollow-wick-card.js):
// a name, one short line and a picture; in the menus since v0.990a.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { maps, menuMaps, workMaps, soloMaps, multiplayerMaps } from '../src/maps.js';
import { isPlayable } from '../src/playable-area.js';
import { mapGridHTML } from '../src/ui/weapon-grid.js';

const hw = maps['hollow-wick'];

test('Hollow Wick has a card: name and a picture spot over the play area, no line over it (v0.992a)', () => {
 assert.equal(hw.name, 'Hollow Wick');
 const { line, thumbnail } = hw.card;
 assert.equal(line, undefined, 'owner, v0.992a: the line over the picture is gone');
 assert.ok(isPlayable(hw, thumbnail.x, thumbnail.z), 'the picture looks at the play area');
 assert.ok(thumbnail.height >= 30 && thumbnail.height <= 60);
});

// The picture: map-cards.js takes every src/assets/thumbnails/<id>.webp, so the
// card shows it as soon as `PORT=<dev port> node tools/capture-thumbnail.mjs
// hollow-wick` has written it (a todo until then).
const picture = new URL('../src/assets/thumbnails/hollow-wick.webp', import.meta.url);
test('Hollow Wick\'s card picture ships with the game', { todo: !existsSync(picture) && 'run tools/capture-thumbnail.mjs hollow-wick' }, () => {
 assert.ok(existsSync(picture) && statSync(picture).size > 5000);
 assert.match(readFileSync(new URL('../src/ui/map-cards.js', import.meta.url), 'utf8'), /import\.meta\.glob\('\.\.\/assets\/thumbnails\/\*\.webp'/);
});

test('the map picker names the map; the map is in the menus (v0.990a)', () => {
 const html = mapGridHTML({ label: 'map', maps: [maps.deadwater, hw], pressed: 'deadwater' });
 assert.ok(html.includes(`title="Hollow Wick" >`));
 assert.ok(html.includes(`title="${maps.deadwater.name}" >`), "Deadwater's tile as before");
 // Released (owner, v0.990a): the Practice map page, SOLO and the lobby,
 // from any map; no longer under Developer tools > World > Map in progress.
 assert.equal(hw.menu, true);
 assert.deepEqual(menuMaps().map(m => m.id), ['deadwater', 'hollow-wick']);
 assert.ok(!workMaps().includes(hw));
 assert.ok(soloMaps().includes(hw) && soloMaps(maps.deadwater).includes(hw), 'offered from any map');
 assert.ok(multiplayerMaps().includes(hw) && multiplayerMaps()[0] === maps.deadwater, 'in the lobby list; Deadwater still the default');
 assert.ok(hw.card.thumbnail.lift >= 1 && hw.card.thumbnail.lift <= 1.5, "the card's lift is gentle");
 assert.equal(maps.deadwater.card, undefined);
});
