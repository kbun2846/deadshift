// Who may use the admin page (admin.js): the owner, and the people he gives
// a key to (owner, 2026-09-30: "admin page should be secure to me only and
// who i share with").
//
//  - The owner's key is ADMIN_TOKEN (/etc/deadstab.env, made by install.sh).
//  - Everyone else gets their own named key, made and taken back on the VPS:
//      bash /opt/deadstab/server/deploy/admin.sh add sam      (prints Sam's key once)
//      bash /opt/deadstab/server/deploy/admin.sh list
//      bash /opt/deadstab/server/deploy/admin.sh remove sam
//    Keys are kept only as SHA-256 fingerprints (DATA_DIR/admins.json), so
//    the file never holds a usable key. A removed key stops working at once.
//  - Every admin action is logged with the name that did it.
//
// Keys are 32 random bytes: too long to guess. On top of that an address
// that gets a key wrong 10 times in 10 minutes is shut out for 10 minutes.
import { readFileSync, writeFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const fingerprint = key => createHash('sha256').update(String(key)).digest('hex');
const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const cleanAdminName = name => String(name || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
const TRIES = 10, WINDOW = 600;

export class Admins {
 constructor({ dir = null, ownerToken = '', now = () => performance.now() / 1000 } = {}) {
  Object.assign(this, { now, owner: ownerToken ? fingerprint(ownerToken) : null });
  this.file = dir ? join(dir, 'admins.json') : null;
  this.list = []; this.seen = -1; this.misses = new Map();
  this.load();
 }

 // Read again whenever the file changed (the command line adds and removes).
 load() {
  if (!this.file) return;
  let stamp = 0; try { stamp = statSync(this.file).mtimeMs; } catch { this.list = []; this.seen = 0; return; }
  if (stamp === this.seen) return;
  this.seen = stamp;
  try { const saved = JSON.parse(readFileSync(this.file, 'utf8')); this.list = Array.isArray(saved) ? saved.filter(a => a && a.name && a.hash) : []; } catch { this.list = []; }
 }

 // Is there anyone who can sign in at all? (With nobody, the page is off.)
 get enabled() { this.load(); return !!this.owner || this.list.length > 0; }

 // An address that keeps getting the key wrong waits.
 locked(ip) { const m = this.misses.get(ip); return !!m && m.count >= TRIES && this.now() - m.first < WINDOW; }

 // The name that key belongs to ('owner' for ADMIN_TOKEN), or null.
 who(key, ip = '?') {
  this.load();
  if (this.locked(ip)) return null;
  const hash = fingerprint(key);
  let name = null;
  if (key && this.owner && same(hash, this.owner)) name = 'owner';
  for (const admin of this.list) if (key && same(hash, admin.hash)) name = admin.name;
  if (name) { this.misses.delete(ip); return name; }
  const m = this.misses.get(ip), t = this.now();
  if (!m || t - m.first >= WINDOW) this.misses.set(ip, { first: t, count: 1 }); else m.count++;
  if (this.misses.size > 5000) this.misses.clear();
  return null;
 }

 add(name) {
  this.load();
  const clean = cleanAdminName(name);
  if (!clean || clean === 'owner') throw new Error('Pick a name of letters, numbers, - or _ (not "owner").');
  if (this.list.some(a => a.name === clean)) throw new Error(clean + ' already has a key. Remove it first to make a new one.');
  const key = randomBytes(32).toString('base64url');
  this.list.push({ name: clean, hash: fingerprint(key), added: new Date().toISOString() });
  this.save();
  return { name: clean, key };
 }

 remove(name) {
  this.load();
  const clean = cleanAdminName(name), before = this.list.length;
  this.list = this.list.filter(a => a.name !== clean);
  if (this.list.length !== before) this.save();
  return this.list.length !== before;
 }

 save() {
  if (!this.file) return;
  mkdirSync(join(this.file, '..'), { recursive: true });
  writeFileSync(this.file + '.tmp', JSON.stringify(this.list, null, 1), { mode: 0o600 });
  renameSync(this.file + '.tmp', this.file);
  this.seen = -1;
 }
}

// The command line (server/deploy/admin.sh runs this as the server's user).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const { SERVER } = await import('./config.js');
 const admins = new Admins({ dir: SERVER.dataDir, ownerToken: SERVER.adminToken });
 const [command, name] = process.argv.slice(2);
 try {
  if (command === 'add' && name) {
   const made = admins.add(name);
   console.log('Admin key for ' + made.name + ' (shown only now; send it to them privately):\n\n  ' + made.key + '\n\nThey paste it at https://play.deadstab.com/admin. Take it back any time: admin.sh remove ' + made.name);
  } else if (command === 'remove' && name) {
   console.log(admins.remove(name) ? 'Removed ' + cleanAdminName(name) + '. Their key no longer works.' : 'Nobody called ' + cleanAdminName(name) + '.');
  } else if (command === 'list') {
   console.log('owner (ADMIN_TOKEN)' + (admins.owner ? '' : ': not set'));
   for (const a of admins.list) console.log(a.name + '  (since ' + a.added.slice(0, 10) + ')');
  } else {
   console.log('Usage: admin.sh add <name> | remove <name> | list');
   process.exitCode = 1;
  }
 } catch (error) { console.error(error.message); process.exitCode = 1; }
}
