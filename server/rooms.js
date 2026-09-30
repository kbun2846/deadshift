// Every room on the server: the listed ones (the JOIN page's list: one for
// every map and mode, config.js listedModes) and the ones players make with
// HOST (only joinable by their code). Finds a room by its code, makes new
// ones (with a fresh code), steps them all each tick, keeps a listed room
// with space for every kind, and closes player-made rooms that sit empty.
import { randomInt } from 'node:crypto';
import { Room, serverMap } from './room.js';
import { makeRoomCode, cleanRoomCode } from '../src/net/transport.js';
import { modeById } from '../src/config/match.js';
import { multiplayerMaps } from '../src/maps.js';

export class Rooms {
 constructor({ config, now = () => performance.now() / 1000 }) {
  Object.assign(this, { config, now });
  this.rooms = new Map();
  // Every kind of listed room: each released multiplayer map in each listed mode.
  this.kinds = multiplayerMaps().flatMap(map => (config.listedModes || []).filter(mode => modeById(mode)?.ready).map(mode => ({ map: map.id, mode })));
  for (const kind of this.kinds) this.openListed(kind);
 }

 find(code) { const clean = cleanRoomCode(code); return clean ? this.rooms.get(clean) || null : null; }

 get privateCount() { return [...this.rooms.values()].filter(r => !r.isPublic).length; }

 // A code no room has.
 newCode() {
  for (let i = 0; i < 200; i++) { const c = makeRoomCode(() => randomInt(1 << 30) / (1 << 30)); if (!this.rooms.has(c)) return c; }
  return null;
 }

 openListed(kind) {
  const code = this.newCode(); if (!code) return null;
  const room = new Room({ code, name: (serverMap(kind.map)?.name || kind.map) + ' ' + (modeById(kind.mode)?.name || kind.mode), isPublic: true, map: kind.map, mode: kind.mode, config: this.config, now: this.now });
  room.kind = kind;
  this.rooms.set(code, room);
  return room;
 }

 // HOST: a new room with its own code, only joinable by that code; its maker leads it.
 create({ map, mode, settings, pid }) {
  if (this.privateCount >= this.config.maxPrivateRooms) return { error: 'The servers are full right now. Try again in a few minutes.' };
  if (!serverMap(map)) return { error: 'That map is not on the servers yet.' };
  const code = this.newCode();
  if (!code) return { error: 'Could not make a room. Try again.' };
  const room = new Room({ code, map, mode: modeById(mode)?.id || 'ffa', settings, ownerPid: pid, config: this.config, now: this.now });
  this.rooms.set(code, room);
  return { room };
 }

 // One tick for every room, then the housekeeping.
 step() {
  const t = this.now();
  for (const room of [...this.rooms.values()]) {
   try { room.step(); }
   catch (error) { console.error('Room', room.code, 'failed a tick:', error); this.crashed(room); continue; }
   if (room.humanCount || room.emptySince === null) continue;
   const empty = t - room.emptySince;
   if (room.isPublic) { if (!room.fresh && empty > this.config.publicReset) room.reset(); }
   else if (empty > this.config.privateIdle) { room.close(); this.rooms.delete(room.code); }
  }
  // Every kind of listed room keeps one with space; spare empty ones close.
  if (this.tickCount = (this.tickCount || 0) + 1, this.tickCount % 30 === 0) this.balance(t);
 }

 balance(t) {
  for (const kind of this.kinds) {
   const same = [...this.rooms.values()].filter(r => r.kind === kind), open = same.filter(r => r.humanCount < r.capacity);
   if (!open.length && same.length < this.config.listedPerKind) this.openListed(kind);
   // Spare: empty a while, beyond the one room of this kind that has space.
   const spare = open.filter(r => !r.humanCount && r.emptySince !== null && t - r.emptySince > this.config.publicReset);
   for (const room of spare.slice(open.length === spare.length ? 1 : 0)) { room.close(); this.rooms.delete(room.code); }
  }
 }

 // A room whose tick threw: its players are sent away, and it starts over
 // (a listed room) or closes (a player-made one), so one bad match never
 // stops the rest.
 crashed(room) {
  for (const conn of room.conns.values()) { conn.send({ t: 'removed', reason: 'The game hit an error and was closed. Join again.' }); }
  room.close();
  if (room.isPublic) { room.emptySince = this.now(); room.reset(); } else this.rooms.delete(room.code);
 }

 // The JOIN page's list: every listed room.
 list() { return [...this.rooms.values()].filter(r => r.isPublic).map(r => r.info()); }

 adminState() { return [...this.rooms.values()].map(r => r.adminState()); }
}
