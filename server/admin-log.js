// What admins did (kicks, bans, announcements, ...): the last few hundred
// actions with who, what, the target and when. Kept in
// DATA_DIR/admin-log.json for the admin page; the server log has them too.
import { dataFile, readJson, writeJson } from './json-file.js';

export class AdminLog {
 constructor(dir, { max = 200 } = {}) {
  this.max = max;
  this.file = dataFile(dir, 'admin-log.json');
  const saved = readJson(this.file, []);
  this.entries = Array.isArray(saved) ? saved.filter(e => e && e.at && e.what).slice(-max) : [];
 }

 add(who, what, target = '') {
  const entry = { at: new Date().toISOString(), who: String(who).slice(0, 24), what: String(what).slice(0, 60), target: String(target).slice(0, 200) };
  this.entries.push(entry);
  if (this.entries.length > this.max) this.entries.splice(0, this.entries.length - this.max);
  writeJson(this.file, this.entries);
  return entry;
 }

 // Newest first.
 list() { return [...this.entries].reverse(); }
}
