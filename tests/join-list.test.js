// The JOIN page's list of open games (owner, 2026-09-30): every map and mode,
// filtered by a preferred map and mode, sorted by players either way; a row is
// the map's picture, then the mode and players, then the MAP NAME in capitals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickRooms, SORTS, filterName } from '../src/ui/join-rooms.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const order = { mapOrder: ['deadwater', 'hollow-wick'], modeOrder: ['ffa', '1v1', '2v2', '3v3', '4v4', '2v2v2'] };
const rooms = [
 { code: '10001', map: 'deadwater', mode: 'ffa', players: 3, max: 8 },
 { code: '10002', map: 'hollow-wick', mode: 'ffa', players: 0, max: 8 },
 { code: '10003', map: 'deadwater', mode: '1v1', players: 1, max: 2 },
 { code: '10004', map: 'hollow-wick', mode: '2v2', players: 3, max: 4 },
 { code: '10005', map: 'deadwater', mode: '2v2', players: 0, max: 4 },
];
const codes = list => list.map(r => r.code);

test('the list shows every room, fewest players first, then by map and mode', () => {
 assert.deepEqual(codes(pickRooms(rooms, {}, order)), ['10005', '10002', '10003', '10001', '10004']);
});

test('most players first reverses the count; ties keep map then mode order', () => {
 assert.deepEqual(codes(pickRooms(rooms, { sort: 'most' }, order)), ['10001', '10004', '10003', '10005', '10002']);
 assert.deepEqual(SORTS.map(s => s.id), ['fewest', 'most']);
});

test('a preferred map and a preferred mode narrow the list, together or alone', () => {
 assert.deepEqual(codes(pickRooms(rooms, { map: 'deadwater' }, order)), ['10005', '10003', '10001']);
 assert.deepEqual(codes(pickRooms(rooms, { mode: '2v2' }, order)), ['10005', '10004']);
 assert.deepEqual(codes(pickRooms(rooms, { map: 'hollow-wick', mode: '1v1' }, order)), []);
 assert.deepEqual(pickRooms(null), []);
});

test('a row: map picture left, mode and players/seats middle, MAP NAME in capitals right; clicking joins by code over the game server', () => {
 const page = read('../src/ui/join-list.js');
 assert.match(page, /join-room-art[^]*join-room-mid[^]*join-room-map/);
 assert.match(page, /\(r\.players \|\| 0\) \+ '\/' \+ \(r\.max \|\| 8\)/);
 assert.match(page, /String\(mapName\)\.toUpperCase\(\)/);
 assert.match(page, /plain-text/, 'rows keep their own type sizes (not fitted like menu buttons)');
 const menu = read('../src/ui/menu.js');
 assert.match(menu, /createJoinList\(/);
 assert.match(menu, /join:code=>[^]*?go\(\{role:'join',code,\.\.\.who\(\),via:'server'\}\)/);
 assert.match(menu, /if\(name==='join'\)joinList\?\.start\(\);else joinList\?\.stop\(\);/, 'it refreshes only while the JOIN page is open');
 assert.match(read('../src/online-play.js'), /async rooms\(\) \{ const \{ fetchRooms \} = await import\(.\.\/net\/socket-transport\.js.\); return fetchRooms\(serverUrl\); \}/);
});

test('the filters read like the rest of the menus: short labels, one lettering for all three rows, modes four over three', () => {
 assert.deepEqual(SORTS.map(s => s.name), ['FEWEST', 'MOST']);
 assert.equal(filterName('Deadwater Outpost'), 'Deadwater'); assert.equal(filterName('Hollow Wick'), 'Hollow Wick');
 assert.match(read('../src/ui/join-list.js'), /class="round-settings join-filters" data-fit-group/);
 assert.match(read('../src/ui/button-typography.js'), /button\.closest\('\[data-fit-group\]'\)\|\|button\.parentElement/);
 const css = read('../src/styles/menu-theme.css');
 assert.match(css, /\.join-filter\[data-filter=mode\] \.round-choices>button\.choice-button\{grid-column:span 3\}/);
 assert.match(css, /\.join-filter\[data-filter=mode\] \.round-choices>button\.choice-button:nth-child\(n\+5\)\{grid-column:span 4/);
});
