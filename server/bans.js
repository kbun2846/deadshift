// Players the owner has banned, kept in a small JSON file so bans survive a
// restart. A ban names a player id (the random id each browser keeps,
// src/net/player-id.js), an address, or both; either one matching keeps the
// connection out.
//
// There are no accounts yet, so a determined player can clear their browser
// (new id) or change networks (new address). Banning both covers most cases.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export class Bans {
 constructor(dir) {
  this.file = dir ? join(dir, 'bans.json') : null;
  this.list = [];
  if (!this.file) return;
  try { mkdirSync(dir, { recursive: true }); } catch {}
  try { const saved = JSON.parse(readFileSync(this.file, 'utf8')); if (Array.isArray(saved)) this.list = saved.filter(b => b && (b.pid || b.ip)); } catch {}
 }

 // The ban that keeps this player out, or null.
 find({ pid, ip }) {
  return this.list.find(b => (b.pid && b.pid === pid) || (b.ip && b.ip === ip)) || null;
 }

 add({ pid = null, ip = null, name = '', reason = '', by = '' }) {
  if (!pid && !ip) return null;
  const ban = { key: Math.random().toString(36).slice(2, 10), pid: pid || null, ip: ip || null, name: String(name).slice(0, 32), reason: String(reason).slice(0, 200), by: String(by).slice(0, 24), at: new Date().toISOString() };
  this.list.push(ban); this.save();
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
