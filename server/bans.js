// Players the owner has banned, kept in a small JSON file so bans survive a
// restart. A ban names a player id (the random id each browser keeps,
// src/net/player-id.js), an address, or both; either one matching keeps the
// connection out.
//
// A ban can run out (`until`, an ISO time; null or missing: for good, which
// is what every ban from before expiry existed is). Run-out bans are ignored
// at once and dropped from the file the next time it is written.
//
// There are no accounts yet, so a determined player can clear their browser
// (new id) or change networks (new address). Banning both covers most cases.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export class Bans {
 constructor(dir, { clock = () => Date.now() } = {}) {
  this.clock = clock;
  this.file = dir ? join(dir, 'bans.json') : null;
  this.list = [];
  if (!this.file) return;
  try { mkdirSync(dir, { recursive: true }); } catch {}
  try { const saved = JSON.parse(readFileSync(this.file, 'utf8')); if (Array.isArray(saved)) this.list = saved.filter(b => b && (b.pid || b.ip)); } catch {}
  for (const ban of this.list) ban.key ||= randomBytes(4).toString('hex');
 }

 expired(ban, t = this.clock()) { return !!ban.until && Date.parse(ban.until) <= t; }

 // Drop bans that have run out (saved only when something went).
 prune() {
  const t = this.clock(), before = this.list.length;
  this.list = this.list.filter(b => !this.expired(b, t));
  if (this.list.length !== before) this.save();
  return this.list;
 }

 // The bans still in force (for the admin page).
 get active() { return this.prune(); }

 // The ban that keeps this player out, or null.
 find({ pid, ip }) {
  const t = this.clock();
  return this.list.find(b => !this.expired(b, t) && ((b.pid && b.pid === pid) || (b.ip && b.ip === ip))) || null;
 }

 // `seconds`: how long it lasts (0 or missing: for good).
 add({ pid = null, ip = null, name = '', reason = '', by = '', seconds = 0 }) {
  if (!pid && !ip) return null;
  const until = seconds > 0 ? new Date(this.clock() + seconds * 1000).toISOString() : null;
  const ban = { key: randomBytes(4).toString('hex'), pid: pid || null, ip: ip || null, name: String(name).slice(0, 32), reason: String(reason).slice(0, 200), by: String(by).slice(0, 24), at: new Date(this.clock()).toISOString(), until };
  this.list.push(ban); this.prune(); this.save();
  return ban;
 }

 remove(key) {
  const before = this.list.length;
  this.list = this.list.filter(b => b.key !== key);
  if (this.list.length !== before) this.save();
  return this.list.length !== before;
 }

 // Written to a spare file, then swapped in: a crash mid-write never leaves
 // half a list.
 save() {
  if (!this.file) return;
  try { writeFileSync(this.file + '.tmp', JSON.stringify(this.list, null, 1)); renameSync(this.file + '.tmp', this.file); }
  catch (error) { console.error('Could not save bans:', error.message); }
 }
}
