// The last few hundred connections that asked for a room, for the admin
// page's players tab (in memory only): when they came and went, name,
// player id, address, room and how it ended. A player who already left can
// still be banned from here.
export class RecentPlayers {
 constructor({ max = 300, clock = () => Date.now() } = {}) {
  Object.assign(this, { max, clock });
  this.entries = []; this.serial = 0;
 }

 // A connection's first message arrived (`room`: its code, if it asked for one).
 start(conn, room = '') {
  const entry = { key: 'r' + (++this.serial).toString(36), at: this.clock(), left: null, name: '', pid: conn.pid, ip: conn.ip, room: String(room || ''), how: '', conn };
  this.entries.push(entry);
  if (this.entries.length > this.max) this.entries.splice(0, this.entries.length - this.max);
  return entry;
 }

 end(entry, how) {
  if (!entry || entry.left) return;
  entry.left = this.clock(); entry.how = String(how || 'left');
  entry.name = entry.conn?.name || entry.name; entry.room = entry.conn?.room?.code || entry.room;
  entry.conn = null;
 }

 find(key) { return this.entries.find(e => e.key === key) || null; }

 // Newest first, without the live connection objects.
 list() {
  return this.entries.map(({ conn, ...e }) => ({ ...e, name: conn?.name || e.name, room: conn?.room?.code || e.room })).reverse();
 }
}
