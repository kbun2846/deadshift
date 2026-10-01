// The developer tools' access code, checked here rather than in the game
// page (the page asks POST /dev/unlock and only learns yes or no).
//
// The code is kept only as a salted scrypt hash in DATA_DIR/devcode.json,
// set by the owner (admin page > owner, or `admin.sh devcode`). Wrong codes
// are rate limited per address and across all addresses, so guessing is
// slow even from many addresses; a right code never counts.
//
// Tickets: the admin page can also ask for a one-time ticket (admin.js
// /admin/api/devticket): random, kept only in memory, good once and for
// TICKET_SECONDS. It stands in for the code and does not need one to be set.
// A ticket that doesn't work counts against the same limits as a wrong code.
import { readFileSync, writeFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// N=2^15, r=8 needs 32 MiB; maxmem leaves room for OpenSSL's own overhead.
const PARAMS = Object.freeze({ N: 1 << 15, r: 8, p: 1, keylen: 32 });
const MAXMEM = 96 * 1024 * 1024;
export const DEV_CODE_PATTERN = /^[A-Za-z0-9]{4,32}$/;
// Wrong codes: per address, and across every address together.
export const TICKET_SECONDS = 60;
export const TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_TICKETS = 100;
export const DEV_LIMITS = Object.freeze({ perAddress: 5, addressWindow: 900, addressLock: 900, global: 30, globalWindow: 60, globalLock: 300 });

const hashOf = (code, salt, params) => new Promise((resolve, reject) => {
 scrypt(String(code), salt, params.keylen, { N: params.N, r: params.r, p: params.p, maxmem: MAXMEM }, (error, key) => (error ? reject(error) : resolve(key)));
});

export class DevCode {
 constructor({ dir = null, now = () => performance.now() / 1000, log = console } = {}) {
  Object.assign(this, { now, log });
  this.file = dir ? join(dir, 'devcode.json') : null;
  this.saved = null; this.seen = -1;
  this.misses = new Map(); this.globalMisses = []; this.globalUntil = 0;
  this.tickets = new Map();
 }

 // Re-read when the file changed (the command line can set it while the server runs).
 load() {
  if (!this.file) return this.saved;
  let stamp = 0; try { stamp = statSync(this.file).mtimeMs; } catch { this.saved = null; this.seen = 0; return null; }
  if (stamp === this.seen) return this.saved;
  this.seen = stamp;
  try {
   const s = JSON.parse(readFileSync(this.file, 'utf8'));
   this.saved = s && typeof s.salt === 'string' && typeof s.hash === 'string' && s.params?.N ? s : null;
  } catch { this.saved = null; }
  return this.saved;
 }

 // What the admin page may show: never the code or its hash.
 status() { const s = this.load(); return s ? { set: true, setAt: s.setAt || null, setBy: s.setBy || null } : { set: false }; }

 async set(code, by = 'owner') {
  if (!DEV_CODE_PATTERN.test(String(code))) throw new Error('The code must be 4 to 32 letters or digits.');
  if (!this.file) throw new Error('No data folder to keep it in.');
  const salt = randomBytes(16), params = { ...PARAMS };
  const hash = await hashOf(code, salt, params);
  mkdirSync(join(this.file, '..'), { recursive: true });
  const record = { salt: salt.toString('base64'), hash: hash.toString('base64'), params, setAt: new Date().toISOString(), setBy: String(by).slice(0, 40) };
  writeFileSync(this.file + '.tmp', JSON.stringify(record, null, 1), { mode: 0o600 });
  renameSync(this.file + '.tmp', this.file);
  this.seen = -1; this.misses.clear(); this.globalMisses = []; this.globalUntil = 0;
  return this.status();
 }

 locked(ip) {
  const t = this.now();
  return t < this.globalUntil || t < (this.misses.get(ip)?.until || 0);
 }

 // An attempt, charged up front: the address's entry and the time, or null
 // when it is already over a limit.
 charge(ip) {
  const t = this.now();
  if (this.locked(ip)) return null;
  let entry = this.misses.get(ip);
  if (!entry) { if (this.misses.size > 10000) this.prune(t); entry = { times: [], until: 0 }; this.misses.set(ip, entry); }
  entry.times = entry.times.filter(at => t - at < DEV_LIMITS.addressWindow);
  this.globalMisses = this.globalMisses.filter(at => t - at < DEV_LIMITS.globalWindow);
  if (entry.times.length >= DEV_LIMITS.perAddress || this.globalMisses.length >= DEV_LIMITS.global) return null;
  entry.times.push(t); this.globalMisses.push(t);
  return { entry, t };
 }
 // It was right: not counted after all.
 refund({ entry, t }) {
  const i = entry.times.indexOf(t); if (i >= 0) entry.times.splice(i, 1);
  const g = this.globalMisses.indexOf(t); if (g >= 0) this.globalMisses.splice(g, 1);
 }
 // It was wrong: lock the address (or everyone) once over the limit.
 missed({ entry }) {
  const after = this.now();
  if (entry.times.length >= DEV_LIMITS.perAddress) entry.until = after + DEV_LIMITS.addressLock;
  if (this.globalMisses.length >= DEV_LIMITS.global && after >= this.globalUntil) {
   this.globalUntil = after + DEV_LIMITS.globalLock;
   this.log.warn(new Date().toISOString(), 'dev unlock: many wrong codes from many addresses; paused for everyone');
  }
 }

 // 'unset' | 'locked' | 'wrong' | 'ok'. An attempt is charged before the
 // slow hash runs (so a burst of parallel guesses can't slip past the
 // limit) and refunded when it was right.
 async check(code, ip = '?') {
  const saved = this.load();
  if (!saved) return 'unset';
  const attempt = this.charge(ip);
  if (!attempt) return 'locked';
  let right = false;
  if (DEV_CODE_PATTERN.test(String(code))) {
   try {
    const want = Buffer.from(saved.hash, 'base64');
    const got = await hashOf(code, Buffer.from(saved.salt, 'base64'), saved.params);
    right = got.length === want.length && timingSafeEqual(got, want);
   } catch (error) { this.log.error('dev code check failed:', error.message); }
  }
  if (right) { this.refund(attempt); return 'ok'; }
  this.missed(attempt);
  return 'wrong';
 }

 // A one-time ticket for the admin page (`by`: who asked).
 issueTicket(by = '') {
  const t = this.now();
  for (const [ticket, entry] of this.tickets) if (t >= entry.until) this.tickets.delete(ticket);
  while (this.tickets.size >= MAX_TICKETS) this.tickets.delete(this.tickets.keys().next().value);
  const ticket = randomBytes(32).toString('base64url');
  this.tickets.set(ticket, { by: String(by).slice(0, 24), until: t + TICKET_SECONDS });
  return { ticket, expiresIn: TICKET_SECONDS };
 }

 // { result: 'locked' | 'wrong' | 'ok', by }: used up whether or not it worked in time.
 redeemTicket(ticket, ip = '?') {
  const attempt = this.charge(ip);
  if (!attempt) return { result: 'locked' };
  const entry = TICKET_PATTERN.test(String(ticket)) ? this.tickets.get(ticket) : null;
  if (entry) this.tickets.delete(ticket);
  if (entry && this.now() < entry.until) { this.refund(attempt); return { result: 'ok', by: entry.by }; }
  this.missed(attempt);
  return { result: 'wrong' };
 }

 prune(t = this.now()) {
  for (const [ip, e] of this.misses) if (t >= e.until && !e.times.some(at => t - at < DEV_LIMITS.addressWindow)) this.misses.delete(ip);
  if (this.misses.size > 10000) this.misses.clear();
 }
}

// POST /dev/unlock (body: the code as plain text, or `ticket:<ticket>`).
// Returns true if it answered.
export async function handleDevUnlock(req, res, { devcode, url, ip, config, log = console, adminLog = null }) {
 if (url.pathname !== '/dev/unlock') return false;
 const origin = req.headers.origin || '';
 const allowed = !!origin && (config.allowAnyOrigin || config.allowedOrigins.includes(origin));
 const headers = { 'content-type': 'application/json', 'cache-control': 'no-store', vary: 'origin', ...(allowed ? { 'access-control-allow-origin': origin } : {}) };
 const reply = (status, body) => { res.writeHead(status, headers); res.end(JSON.stringify(body)); };
 if (req.method === 'OPTIONS') {
  res.writeHead(204, { ...headers, ...(allowed ? { 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600' } : {}) });
  res.end(); return true;
 }
 if (req.method !== 'POST') { reply(405, { error: 'POST only.' }); return true; }
 // Another website's page: refused before anything is checked or counted,
 // so its visitors can't be used to guess from many addresses.
 if (origin && !allowed) { reply(403, { error: 'Not allowed.' }); return true; }
 let body;
 try { body = await readText(req, 64); } catch { reply(413, { error: 'Too long.' }); return true; }
 const text = body.trim();
 let result;
 if (text.startsWith('ticket:')) {
  const used = devcode.redeemTicket(text.slice(7), ip);
  result = used.result;
  if (result === 'ok') { log.log(new Date().toISOString(), 'dev ticket used from', ip, '(made by ' + used.by + ')'); adminLog?.add(used.by, 'dev ticket used', ip); }
 } else result = await devcode.check(text, ip);
 if (result === 'unset') reply(503, { error: 'Not set up.' });
 else if (result === 'locked') reply(429, { error: 'Too many tries. Wait a while.' });
 else if (result === 'wrong') reply(401, { error: text.startsWith('ticket:') ? 'That link has expired.' : 'Wrong code.' });
 else reply(200, { ok: true });
 return true;
}

function readText(req, limit) {
 return new Promise((resolve, reject) => {
  let size = 0; const parts = [];
  req.on('data', chunk => { size += chunk.length; if (size > limit) { reject(new Error('too big')); req.resume(); } else parts.push(chunk); });
  req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
  req.on('error', reject);
 });
}

// The command line (admins.js devcode): hidden typing on a terminal, or one
// line from a pipe.
export async function readCodeFromTerminal(input = process.stdin, output = process.stderr) {
 if (!input.isTTY) {
  const { createInterface } = await import('node:readline');
  const lines = createInterface({ input });
  for await (const line of lines) { lines.close(); return line.trim(); }
  return '';
 }
 const ask = question => new Promise((resolve, reject) => {
  output.write(question);
  let text = '';
  input.setRawMode(true); input.resume(); input.setEncoding('utf8');
  const done = (error, value) => { input.setRawMode(false); input.pause(); input.off('data', onData); output.write('\n'); error ? reject(error) : resolve(value); };
  const onData = chunk => {
   for (const ch of chunk) {
    if (ch === '\r' || ch === '\n') return done(null, text);
    if (ch === '\u0003') return done(new Error('Cancelled.'));
    if (ch === '\u007f' || ch === '\b') text = text.slice(0, -1);
    else if (ch >= ' ') text += ch;
   }
  };
  input.on('data', onData);
 });
 const first = (await ask('New developer tools code (4-32 letters or digits; nothing shows as you type): ')).trim();
 const again = (await ask('Type it again: ')).trim();
 if (first !== again) throw new Error('The two did not match. Nothing changed.');
 return first;
}
