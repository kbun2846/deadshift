// The player log: every connection that asked for a room, with when it came
// online and went off, name, player id, address, room and how it ended, for
// the admin page's players tab. A player who already left can still be
// banned from here.
//
// Kept in DATA_DIR/player-log.jsonl so it survives restarts and updates: a
// line when someone comes online, another when they go, and now and then the
// file is rewritten with one line per visit. Visits older than `keepDays`, or
// past the newest `max`, are dropped. A visit still open when the server
// stopped without a clean shutdown ends at the file's last write.
import { readFileSync, appendFileSync, writeFileSync, renameSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { dataFile } from './json-file.js';

const DAY = 86400000;
const FIELDS = ['k', 'at', 'left', 'name', 'pid', 'ip', 'room', 'how'];
const clean = e => { const out = {}; for (const f of FIELDS) if (e[f] !== undefined && e[f] !== null && e[f] !== '') out[f] = e[f]; return out; };

export class PlayerLog {
 constructor({ dir = null, max = 5000, keepDays = 90, clock = () => Date.now(), log = console } = {}) {
  Object.assign(this, { max, keepDays, clock, log });
  this.file = dataFile(dir, 'player-log.jsonl');
  this.entries = []; this.serial = 0; this.lines = 0;
  this.load();
 }

 load() {
  if (!this.file) return;
  let text = '', mtime = this.clock();
  try { text = readFileSync(this.file, 'utf8'); mtime = statSync(this.file).mtimeMs; } catch { return; }
  const byKey = new Map();
  for (const raw of text.split('\n')) {
   if (!raw.trim()) continue;
   let line; try { line = JSON.parse(raw); } catch { continue; }
   if (!line || typeof line.k !== 'string') continue;
   const entry = byKey.get(line.k);
   if (entry) Object.assign(entry, line);
   else if (Number.isFinite(line.at)) byKey.set(line.k, { name: '', pid: null, ip: '', room: '', how: '', left: null, ...line });
  }
  for (const e of byKey.values()) if (!e.left) { e.left = Math.max(e.at, Math.round(mtime)); e.how = 'server stopped'; }
  this.entries = [...byKey.values()].sort((a, b) => a.at - b.at);
  this.trim(); this.compact();
 }

 // Drops visits past the newest `max` or older than `keepDays` (never one still online).
 trim() {
  const oldest = this.clock() - this.keepDays * DAY;
  let drop = 0;
  while (drop < this.entries.length && (this.entries.length - drop > this.max || (this.entries[drop].at < oldest && this.entries[drop].left))) drop++;
  if (drop) this.entries.splice(0, drop);
 }

 append(line) {
  if (!this.file) return;
  try { mkdirSync(dirname(this.file), { recursive: true }); appendFileSync(this.file, JSON.stringify(line) + '\n', { mode: 0o640 }); this.lines++; }
  catch (error) { this.log.error?.('Could not save the player log:', error.message); }
  if (this.lines > this.max * 1.5) { this.trim(); this.compact(); }
 }

 // One line per visit, written to a spare file and swapped in.
 compact() {
  if (!this.file) return;
  try {
   mkdirSync(dirname(this.file), { recursive: true });
   const text = this.entries.map(e => JSON.stringify(clean({ ...e, conn: undefined, name: e.conn?.name || e.name }))).join('\n');
   writeFileSync(this.file + '.tmp', text ? text + '\n' : '', { mode: 0o640 });
   renameSync(this.file + '.tmp', this.file);
   this.lines = this.entries.length;
  } catch (error) { this.log.error?.('Could not save the player log:', error.message); }
 }

 // A connection's first message arrived (`room`: its code, if it asked for one).
 start(conn, room = '') {
  const at = this.clock();
  const entry = { k: at.toString(36) + '-' + (++this.serial).toString(36), at, left: null, name: '', pid: conn.pid || null, ip: conn.ip || '', room: String(room || ''), how: '', conn };
  this.entries.push(entry);
  this.append(clean({ ...entry, conn: undefined }));
  if (this.entries.length > this.max) this.trim();
  return entry;
 }

 end(entry, how) {
  if (!entry || entry.left) return;
  entry.left = this.clock(); entry.how = String(how || 'left');
  entry.name = entry.conn?.name || entry.name; entry.room = entry.conn?.room?.code || entry.room;
  entry.conn = null;
  this.append(clean({ k: entry.k, left: entry.left, how: entry.how, name: entry.name, room: entry.room }));
 }

 // Everyone still online goes off (a clean shutdown).
 endAll(how = 'server restart') { for (const e of this.entries) if (!e.left) this.end(e, how); }

 find(key) { return this.entries.find(e => e.k === key) || null; }

 // Newest first, without the live connection objects (`id`: the live
 // connection's, for the player sheet).
 list() { return this.page().entries; }

 // `q` searches name, player id, address, room and how it ended; `online`
 // keeps only those online now; `limit` caps the list (`more`: how many
 // older ones matched too).
 page({ q = '', limit = Infinity, online = false } = {}) {
  const query = String(q).trim().toLowerCase(), entries = [];
  let matched = 0;
  for (let i = this.entries.length - 1; i >= 0; i--) {
   const { conn, k, ...e } = this.entries[i];
   const item = { ...e, key: k, name: conn?.name || e.name, room: conn?.room?.code || e.room, id: conn?.id || null };
   if (online && item.left) continue;
   if (query && ![item.name, item.pid, item.ip, item.room, item.how].some(f => String(f ?? '').toLowerCase().includes(query))) continue;
   if (++matched <= limit) entries.push(item);
  }
  return { entries, more: matched - entries.length };
 }

 // The log by day and week for the tab's drop-downs. `tz`: the page's offset
 // from UTC in minutes (days are the viewer's days; weeks start on Sunday).
 // Every day and week that has a matching visit comes with its counts (visits,
 // different players, online now); the visits themselves only for today and
 // the days in `open`, or, while searching (`q` / `online`), every match up
 // to `limit` (`more`: how many past it).
 grouped({ q = '', online = false, tz = 0, open = [], limit = 500 } = {}) {
  const shift = Math.max(-840, Math.min(840, Math.round(Number(tz) || 0))) * 60000;
  const dayOf = t => new Date(t + shift).toISOString().slice(0, 10);
  const weekOf = day => { const d = new Date(day + 'T00:00:00Z'); return new Date(d - d.getUTCDay() * DAY).toISOString().slice(0, 10); };
  const today = dayOf(this.clock()), searching = !!(String(q).trim() || online);
  const wanted = new Set([today, ...[].concat(open).map(String)]);
  const days = new Map(), weeks = new Map(), entries = [];
  const count = (map, key, e, extra) => {
   let g = map.get(key);
   if (!g) map.set(key, g = { ...extra, visits: 0, players: new Set(), online: 0 });
   g.visits++; g.players.add(e.pid || e.ip); if (!e.left) g.online++;
   return g;
  };
  let more = 0;
  for (const e of this.page({ q, online }).entries) {
   const day = dayOf(e.at), week = weekOf(day);
   count(days, day, e, { day, week }); count(weeks, week, e, { week });
   if (searching ? entries.length < limit : wanted.has(day) && entries.length < 5000) entries.push({ ...e, day });
   else if (searching) more++;
  }
  const out = g => ({ ...g, players: g.players.size });
  return { today, thisWeek: weekOf(today), days: [...days.values()].map(out), weeks: [...weeks.values()].map(out), entries, more, searching };
 }

 // Counts for the tab's header: online now, players and visits in the last
 // 24 hours and 7 days (players: different player ids), and how far back it goes.
 summary() {
  const now = this.clock(), day = new Set(), week = new Set();
  let online = 0, visitsDay = 0, visitsWeek = 0;
  for (const e of this.entries) {
   if (!e.left) online++;
   const end = e.left || now, who = e.pid || e.ip;
   if (end >= now - 7 * DAY) { visitsWeek++; week.add(who); if (end >= now - DAY) { visitsDay++; day.add(who); } }
  }
  return { online, day: { players: day.size, visits: visitsDay }, week: { players: week.size, visits: visitsWeek }, total: this.entries.length, since: this.entries[0]?.at ?? null, keepDays: this.keepDays, max: this.max };
 }
}
