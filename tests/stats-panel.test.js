import test from 'node:test';
import assert from 'node:assert/strict';
import { sortStatsRows, statsTableHTML } from '../src/ui/stats-panel.js';

const row = (id, name, kills, deaths = 0, dealt = 0, extra = {}) => ({ id, name, kills, deaths, dealt, taken: 0, slot: 0, present: true, ...extra });
const rows = list => [...list.matchAll(/<li class="([^"]*)"[^>]*>/g)].map(m => m[1]);

test('stats rows: most kills first, then fewer deaths, then more damage dealt, then name', () => {
 const sorted = sortStatsRows([row('a', 'Zed', 3, 2, 100), row('b', 'Amy', 5, 9), row('c', 'Bo', 3, 1, 50), row('d', 'Cy', 3, 1, 900), row('e', 'Al', 3, 1, 900), row('f', 'bea', 3, 1, 900)]);
 assert.deepEqual(sorted.map(r => r.id), ['b', 'e', 'f', 'd', 'c', 'a']);
 const input = [row('x', 'X', 0), row('y', 'Y', 1)];
 assert.deepEqual(sortStatsRows(input).map(r => r.id), ['y', 'x']);
 assert.equal(input[0].id, 'x', 'the input is not reordered');
 assert.deepEqual(sortStatsRows(null), []);
});

test('team games: every row carries its side colour (stripe and tint), one list ranked by kills, never grouped', () => {
 const html = statsTableHTML([row('a', 'A', 2, 0, 0, { team: 'red' }), row('b', 'B', 7, 0, 0, { team: 'blue' }), row('c', 'C', 4, 0, 0, { team: 'gold' }), row('d', 'D', 3, 0, 0, { team: 'red' })], { myId: 'a', mode: '2v2v2' });
 assert.match(html, /data-team="blue"[^>]*>.*?<b>7<\/b>/s);
 assert.deepEqual([...html.matchAll(/data-team="(\w+)"/g)].map(m => m[1]), ['blue', 'gold', 'red', 'red']);
 assert.ok(html.includes('--team:#ffb020;--tint:#ffb02026'), 'red is Amber');
 assert.ok(html.includes('--team:#2ee6ff'), 'blue is Cyan');
 assert.ok(html.includes('--team:#b77bff'), 'gold is Violet');
 assert.equal(rows(html).every(c => c.includes('stats-team')), true);
 assert.ok(!/stats-(gold|silver)/.test(html));
 // No team: no stripe.
 assert.ok(!statsTableHTML([row('a', 'A', 1)], {}).includes('--team'));
});

test('FFA match over: gold and silver on rows one and two only, and only when final', () => {
 const list = [row('a', 'A', 1), row('b', 'B', 5), row('c', 'C', 3), row('d', 'D', 0)];
 const final = rows(statsTableHTML(list, { mode: 'ffa', final: true }));
 assert.ok(final[0].includes('stats-gold') && final[1].includes('stats-silver'));
 assert.ok(!/stats-(gold|silver)/.test(final[2] + final[3]));
 assert.ok(!/stats-(gold|silver)/.test(statsTableHTML(list, { mode: 'ffa', final: false })), 'not before the end');
 assert.ok(!/stats-(gold|silver)/.test(statsTableHTML(list, { mode: '2v2', final: true })), 'not in a side game');
 assert.ok(!/stats-(gold|silver)/.test(statsTableHTML(list.map(r => ({ ...r, team: 'blue' })), { final: true })), 'nor when rows have sides');
 assert.ok(!/stats-(gold|silver)/.test(statsTableHTML(list, { mode: 'practice', final: true })));
});

test('your row is marked, bots tagged, away players dimmed; unknown numbers are left out', () => {
 const html = statsTableHTML([row('me', 'Me', 4, 1, 800, { time: 125, weapon: 'rifle', ping: 48.6 }), row('r1', 'ROBOT 1', 2, 3, 100, { robot: true }), row('x', 'X', 0, 0, 0, { present: false, ping: 20 })], { myId: 'me' });
 const [mine, robot, away] = html.split('<li ').slice(1);
 assert.ok(mine.includes('stats-you') && mine.includes('feed-you">Me<'));
 assert.ok(!robot.includes('stats-you') && !robot.includes('feed-you'));
 assert.ok(robot.includes('<span class="stats-robot">bot</span>') && !mine.includes('stats-robot'));
 assert.ok(away.includes('stats-away'));
 assert.ok(mine.includes('2:05') && mine.includes('Nominal') && mine.includes('49</i> ms'), 'time, weapon, ping for a human');
 assert.ok(!robot.includes(' ms') && !/\d:\d\d/.test(robot), 'no ping or time for a robot without them');
 assert.ok(!away.includes(' ms'), 'no ping for someone who left');
 assert.ok(mine.includes('1</i> death<') && robot.includes('3</i> deaths'));
});

test('names are escaped', () => {
 const html = statsTableHTML([row('a', '<img src=x onerror=alert(1)>"&\'', 1)], {});
 assert.ok(!html.includes('<img'));
 assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;&quot;&amp;&#39;'));
});
