// The admin page's overview numbers: how long ticks take (now, the last
// minute, and a sample every 10 s for the last 15 minutes), the busiest
// moment today, and how much the server has sent to players, including a
// running total for this calendar month (UTC) kept in DATA_DIR/traffic.json
// so a restart doesn't lose it, against the VPS plan's monthly allowance.
//
// "Sent" counts the WebSocket messages the game sends (payload plus frame
// header). TLS adds a few percent on top, so the provider's figure runs a
// little higher.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dataFile, readJson, writeJson } from './json-file.js';

export const SAMPLE_SECONDS = 10;
const KEEP = 90; // 15 minutes of samples

const monthKey = t => new Date(t).toISOString().slice(0, 7);
const dayKey = t => new Date(t).toISOString().slice(0, 10);
const monthBounds = t => { const d = new Date(t), start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); return { start, end: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) }; };

// The commit the server runs (read once at startup). The service user doesn't
// own the checkout, so git is told the folder is safe for this one call.
export function readVersion(repoDir) {
 try {
  const out = execFileSync('git', ['-c', 'safe.directory=*', 'log', '-1', '--format=%h%x09%s%x09%cI'], { cwd: repoDir, timeout: 3000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const [commit, subject, date] = out.split('\t');
  if (commit) return { commit, subject: subject || '', date: date || null };
 } catch {}
 try { return { commit: null, subject: 'v' + JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version, date: null }; } catch { return null; }
}

export class ServerStats {
 constructor({ dir = null, clock = () => Date.now(), planBytes = 1e12, version = null } = {}) {
  Object.assign(this, { clock, planBytes, version });
  this.file = dataFile(dir, 'traffic.json');
  this.samples = []; this.acc = { sum: 0, count: 0, peak: 0 }; this.windowBytes = 0;
  this.total = 0; this.unsaved = 0;
  const t = clock(), saved = readJson(this.file, null);
  this.month = saved?.month === monthKey(t) ? { month: saved.month, bytes: +saved.bytes || 0, since: +saved.since || t } : { month: monthKey(t), bytes: 0, since: t };
  this.today = saved?.day === dayKey(t) ? { day: saved.day, peak: +saved.peak || 0 } : { day: dayKey(t), peak: 0 };
 }

 // Every tick's cost (ms).
 tick(ms) { const a = this.acc; a.sum += ms; a.count++; if (ms > a.peak) a.peak = ms; }

 // Bytes going out to a player.
 sent(bytes) { this.total += bytes; this.unsaved += bytes; this.windowBytes += bytes; }

 players(count) {
  const t = this.clock();
  if (this.today.day !== dayKey(t)) this.today = { day: dayKey(t), peak: 0 };
  if (count > this.today.peak) this.today.peak = count;
 }

 // Every SAMPLE_SECONDS: one point for the sparkline.
 sample(players) {
  const a = this.acc;
  this.samples.push({ t: this.clock(), avg: a.count ? a.sum / a.count : 0, peak: a.peak, sum: a.sum, count: a.count, players, bytes: this.windowBytes });
  if (this.samples.length > KEEP) this.samples.shift();
  this.acc = { sum: 0, count: 0, peak: 0 }; this.windowBytes = 0;
  this.players(players);
 }

 // The month's counter (and today's peak) to disk: every minute, and on the way down.
 save() {
  const t = this.clock();
  if (this.month.month !== monthKey(t)) this.month = { month: monthKey(t), bytes: 0, since: t };
  this.month.bytes += this.unsaved; this.unsaved = 0;
  writeJson(this.file, { month: this.month.month, bytes: this.month.bytes, since: this.month.since, day: this.today.day, peak: this.today.peak });
 }

 overview({ tickMs = 0, players = 0, rooms = 0, activeRooms = 0 } = {}) {
  const t = this.clock(), last = [...this.samples.slice(-6), { ...this.acc, bytes: this.windowBytes }];
  const sum = last.reduce((s, x) => s + x.sum, 0), count = last.reduce((s, x) => s + x.count, 0);
  const spanSeconds = Math.min(60, Math.max(1, this.samples.slice(-6).length * SAMPLE_SECONDS));
  const recentBytes = this.samples.slice(-6).reduce((s, x) => s + x.bytes, 0);
  const monthBytes = (this.month.month === monthKey(t) ? this.month.bytes : 0) + this.unsaved;
  const { end } = monthBounds(t), since = this.month.month === monthKey(t) ? this.month.since : t;
  // The month so far, plus the rate since counting began this month carried
  // to the month's end (no guess for the first hour).
  const counted = t - since, estimate = counted >= 3600e3 ? Math.round(monthBytes + (monthBytes / counted) * (end - t)) : null;
  this.players(players);
  return {
   players, rooms, activeRooms,
   load: { now: round2(tickMs), avg: round2(count ? sum / count : 0), peak: round2(Math.max(0, ...last.map(x => x.peak))) },
   samples: this.samples.map(s => ({ t: s.t, avg: round2(s.avg), peak: round2(s.peak), players: s.players })),
   peakToday: this.today.peak, day: this.today.day,
   uptime: Math.round(process.uptime()), rss: process.memoryUsage().rss,
   version: this.version,
   sent: { total: this.total, rate: Math.round(recentBytes / spanSeconds), month: monthBytes, monthKey: monthKey(t), monthSince: new Date(since).toISOString(), estimate, plan: this.planBytes },
  };
 }
}

const round2 = n => Math.round(n * 100) / 100;
