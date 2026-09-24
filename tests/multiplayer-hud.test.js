import test from 'node:test';
import assert from 'node:assert/strict';
import { feedLine, scoreboardRows, formatTime } from '../src/ui/multiplayer-hud.js';

test('kill feed: killers and victims by name, pink for others and blue for you, several victims on one line', () => {
 const html = feedLine({ killer: 'a', killerName: 'Ann', victims: ['me', 'b'], victimNames: ['Me', 'Bo<b>'] }, 'me');
 assert.match(html, /<span class="feed-enemy">Ann<\/span> <span class="feed-verb">killed<\/span> <span class="feed-you">Me<\/span>, <span class="feed-enemy">Bo&lt;b&gt;<\/span>/);
 assert.match(feedLine({ killer: null, victims: ['me'], victimNames: ['Me'] }, 'me'), /feed-you">Me<\/span> <span class="feed-verb">died/);
});

test('scoreboard rows: rank, colour and name, kills, deaths, damage, time, most used weapon, ping; you in blue, away players dimmed', () => {
 const html = scoreboardRows([{ id: 'me', name: 'Me', kills: 3, deaths: 1, dealt: 1500, taken: 400, time: 125, weapon: 'rifle', present: true, slot: 0, ping: 0 },
  { id: 'x', name: 'X', kills: 0, deaths: 3, dealt: 10, taken: 1500, time: 5, weapon: 'shotgun', present: false, slot: 2, ping: 48.6 }], 'me');
 assert.match(html, /<tr class="board-you"><td>1<\/td><th scope="row"><i class="player-swatch" style="--swatch:#b9d98a"[^>]*><\/i>Me<\/th><td>3<\/td><td>1<\/td><td>1500<\/td><td>400<\/td><td>2:05<\/td><td>Nominal<\/td><td class="board-ping">0 ms<\/td><\/tr>/);
 assert.match(html, /class=" board-away"><td>2<\/td><th scope="row"><i class="player-swatch" style="--swatch:#8fd3e0"[^>]*><\/i>X<\/th>.*Ballast<\/td><td class="board-ping">49 ms/);
 assert.equal(formatTime(59.6), '1:00');
});
