// s3-look: Hollow Wick's map card (maps.js `card`, maps/hollow-wick-card.js):
// a name, one short line and a picture, and still dev-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { maps, menuMaps, workMaps, soloMaps, multiplayerMaps } from '../src/maps.js';
import { isPlayable } from '../src/playable-area.js';
import { mapGridHTML } from '../src/ui/weapon-grid.js';

const hw = maps['hollow-wick'];

test('Hollow Wick has a card: name, one short line, a picture spot over the play area', () => {
 assert.equal(hw.name, 'Hollow Wick');
 const { line, thumbnail } = hw.card;
 assert.ok(typeof line === 'string' && line.length > 10 && line.length <= 60, 'one short line');
 assert.ok(!/[!]|halloween|ghost|zombie|spooky/i.test(line), 'quiet, not cartoonish');
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

test('the map picker shows the line; the map stays dev-only', () => {
 const html = mapGridHTML({ label: 'map', maps: [maps.deadwater, hw], pressed: 'deadwater' });
 assert.ok(html.includes(`title="Hollow Wick: ${hw.card.line}"`));
 assert.ok(html.includes(`title="${maps.deadwater.name}" >`), "Deadwater's tile as before");
 // Dev only (Developer tools > World > Map in progress) until the owner says otherwise.
 assert.equal(hw.menu, false);
 assert.ok(!menuMaps().includes(hw));
 assert.ok(workMaps().includes(hw));
 assert.ok(!soloMaps().includes(hw) && soloMaps(hw).includes(hw), 'offered only once it is loaded');
 assert.ok(!multiplayerMaps().includes(hw));
 assert.equal(maps.deadwater.card, undefined);
});
