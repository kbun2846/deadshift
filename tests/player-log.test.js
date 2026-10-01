import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlayerLog } from '../server/player-log.js';

// The admin page's player log (server/player-log.js): who came online and
// when, kept in DATA_DIR/player-log.jsonl across restarts (owner, 2026-10-01).
const DAY = 86400000, T0 = Date.UTC(2026, 9, 1, 12);
const quiet = { error() {} };
const dir = () => mkdtempSync(join(tmpdir(), 'ds-plog-'));
const conn = (pid, ip, extra = {}) => ({ id: 'c-' + pid, pid, ip, name: '', room: null, ...extra });

test('visits are kept across a restart: on, off, name, room and how it ended', () => {
 const d = dir(); let now = T0;
 const a = new PlayerLog({ dir: d, clock: () => now, log: quiet });
 const ann = conn('ann-player-0001', '1.2.3.4'), bob = conn('bob-player-0002', '5.6.7.8');
 const e1 = a.start(ann, '12345'); now += 1000;
 const e2 = a.start(bob); now += 60000;
 ann.name = 'Ann'; ann.room = { code: '12345' };
 a.end(e1, 'left'); now += 5000;
 bob.name = 'Bob';
 assert.deepEqual(a.list().map(e => [e.name, !!e.left]), [['Bob', false], ['Ann', true]], 'newest first; a live one shows its name now');
 assert.equal(a.list()[0].id, 'c-bob-player-0002', 'a live visit carries its connection for the player sheet');
 a.endAll('server restart');
 const b = new PlayerLog({ dir: d, clock: () => now, log: quiet });
 const [bobVisit, annVisit] = b.list();
 assert.deepEqual({ name: annVisit.name, at: annVisit.at, left: annVisit.left, room: annVisit.room, how: annVisit.how, pid: annVisit.pid, ip: annVisit.ip }, { name: 'Ann', at: T0, left: T0 + 61000, room: '12345', how: 'left', pid: 'ann-player-0001', ip: '1.2.3.4' });
 assert.equal(bobVisit.how, 'server restart'); assert.equal(bobVisit.name, 'Bob'); assert.equal(bobVisit.id, null);
 assert.ok(b.find(annVisit.key), 'a visit from before the restart can still be found (to ban)');
 assert.equal(readFileSync(join(d, 'player-log.jsonl'), 'utf8').trim().split('\n').length, 2, 'rewritten one line per visit on load');
 rmSync(d, { recursive: true });
});

test('a visit still open when the server died ends at the file\'s last write', () => {
 const d = dir(); let now = T0;
 const a = new PlayerLog({ dir: d, clock: () => now, log: quiet });
 a.start(conn('cat-player-0003', '9.9.9.9'));
 const file = join(d, 'player-log.jsonl');
 utimesSync(file, new Date(T0 + 30000), new Date(T0 + 30000));
 now = T0 + 3600000;
 const [e] = new PlayerLog({ dir: d, clock: () => now, log: quiet }).list();
 assert.equal(e.how, 'server stopped'); assert.equal(e.left, T0 + 30000);
 rmSync(d, { recursive: true });
});

test('old visits go after keepDays, the newest max are kept, and the file is rewritten as it grows', () => {
 const d = dir(); let now = T0;
 const a = new PlayerLog({ dir: d, max: 20, keepDays: 3, clock: () => now, log: quiet });
 for (let i = 0; i < 50; i++) { const e = a.start(conn('p-player-' + String(i).padStart(4, '0'), '1.1.1.1')); now += 1000; a.end(e, 'left'); }
 assert.equal(a.list().length, 20);
 assert.equal(a.list().at(-1).pid, 'p-player-0030', 'the oldest went first');
 const lines = readFileSync(join(d, 'player-log.jsonl'), 'utf8').trim().split('\n').length;
 assert.ok(lines <= 20 * 1.5 + 2, 'the file does not grow without end (' + lines + ' lines)');
 now += 4 * DAY;
 const live = a.start(conn('new-player-0001', '2.2.2.2'));
 const b = new PlayerLog({ dir: d, max: 20, keepDays: 3, clock: () => now, log: quiet });
 assert.deepEqual(b.list().map(e => e.pid), ['new-player-0001'], 'visits older than keepDays are dropped');
 assert.ok(live);
 rmSync(d, { recursive: true });
});

test('a page of the log: search, online only, a limit with how many more matched; and the counts', () => {
 let now = T0;
 const log = new PlayerLog({ clock: () => now });
 const people = [];
// (Six visits 6 hours apart; the first four last 10 minutes.)
 for (let i = 0; i < 6; i++) { const c = conn('id-player-000' + i, '10.0.0.' + i, { name: i % 2 ? 'Odd' + i : 'Even' + i }); const e = log.start(c, '1000' + i); people.push([c, e]); if (i < 4) { now += 600000; log.end(e, 'left'); now -= 600000; } now += DAY / 4; }
 const all = log.page({ limit: 4 });
 assert.equal(all.entries.length, 4); assert.equal(all.more, 2);
 assert.deepEqual(log.page({ q: 'odd' }).entries.map(e => e.name), ['Odd5', 'Odd3', 'Odd1']);
 assert.deepEqual(log.page({ q: '10.0.0.2' }).entries.map(e => e.name), ['Even2']);
 assert.deepEqual(log.page({ online: true }).entries.map(e => e.name), ['Odd5', 'Even4']);
 // A second visit by the same player id counts as one player.
 log.start(people[5][0]);
 const sum = log.summary();
 assert.equal(sum.online, 3); assert.equal(sum.total, 7);
 assert.equal(sum.week.players, 6); assert.equal(sum.week.visits, 7);
 assert.equal(sum.day.players, 4, 'ended in the last 24 hours (players 2 and 3) or still online (4 and 5)'); assert.equal(sum.day.visits, 5);
 assert.equal(sum.since, T0);
});

test('a damaged line in the file is skipped, not fatal', () => {
 const d = dir();
 writeFileSync(join(d, 'player-log.jsonl'), '{"k":"a","at":' + T0 + ',"pid":"ok-player-0001","left":' + (T0 + 5) + ',"how":"left"}\nnot json\n{"k":"b"}\n{"k":"zz","left":5}\n');
 const log = new PlayerLog({ dir: d, clock: () => T0 + DAY, log: quiet });
 assert.deepEqual(log.list().map(e => e.pid), ['ok-player-0001']);
 rmSync(d, { recursive: true });
});

test('by day and week for the drop-downs: counts for every day and week, visits for today, open days or a search', () => {
 // Thursday 2026-10-01 12:00 UTC; the viewer is 4 hours behind UTC.
 let now = T0; const log = new PlayerLog({ clock: () => now }), tz = -240;
 const at = (iso, pid, name, how = 'left') => { now = Date.parse(iso); const c = conn(pid, '10.0.0.1', { name }); const e = log.start(c); if (how) { now += 60000; log.end(e, how); } return e; };
 at('2026-09-20T15:00:00Z', 'a-player-0001', 'Ann');             // Sun Sep 20: the week of Sep 20
 at('2026-09-26T23:00:00Z', 'b-player-0002', 'Bob');             // Sat Sep 26, 7 pm there: still that week
 at('2026-09-27T03:00:00Z', 'a-player-0001', 'Ann');             // 11 pm Sat Sep 26 there, though Sunday in UTC
 at('2026-09-28T16:00:00Z', 'a-player-0001', 'Ann');             // Mon Sep 28: this week
 at('2026-10-01T02:00:00Z', 'c-player-0003', 'Cy');              // 10 pm Wed Sep 30 there
 at('2026-10-01T11:00:00Z', 'b-player-0002', 'Bob', null);        // today, online
 now = T0;
 const g = log.grouped({ tz });
 assert.equal(g.today, '2026-10-01'); assert.equal(g.thisWeek, '2026-09-27');
 assert.deepEqual(g.weeks.map(w => [w.week, w.visits, w.players, w.online]), [['2026-09-27', 3, 3, 1], ['2026-09-20', 3, 2, 0]]);
 assert.deepEqual(g.days.map(d => [d.day, d.visits]), [['2026-10-01', 1], ['2026-09-30', 1], ['2026-09-28', 1], ['2026-09-26', 2], ['2026-09-20', 1]]);
 assert.deepEqual(g.entries.map(e => [e.name, e.day]), [['Bob', '2026-10-01']], 'only today\'s visits until a day is opened');
 assert.deepEqual(log.grouped({ tz, open: ['2026-09-26'] }).entries.map(e => e.day), ['2026-10-01', '2026-09-26', '2026-09-26']);
 const found = log.grouped({ tz, q: 'ann', limit: 2 });
 assert.equal(found.searching, true); assert.deepEqual(found.entries.map(e => e.day), ['2026-09-28', '2026-09-26']); assert.equal(found.more, 1);
 assert.deepEqual(found.weeks.map(w => w.visits), [1, 2], 'a search counts only its matches');
});
