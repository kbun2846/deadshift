// The game server's transport: one WebSocket to the dedicated server
// (server/index.js), shaped like peer-transport.js's joiner end, so
// ClientSession runs on it unchanged. On the server everyone is a joiner.
//
// Before the game's own messages, the socket says which room it wants:
//   { t:'join', code, pid, version }            a room code (or an always-open room's)
//   { t:'create', map, mode, settings, pid, version }   HOST: a new room
// and the server answers { t:'room', code, name, public, map, id, lead } or
// { t:'nope', reason }. After that:
//   - `room` messages update `transport.room` (the leader can change);
//   - `note` messages (a refused START, say) wait in `transport.notes`;
//   - `transport.lead(op, fields)` sends the leader's lobby controls
//     (server/room.js lead);
//   - everything else goes to the session as if from 'host'.
//
// A WebSocket is ordered and reliable (TCP), so nothing is lost; a lost
// packet only delays the ones behind it. While the socket is backed up,
// inputs are dropped rather than queued: each one repeats the last ten.
import { PROTOCOL_VERSION } from './protocol.js';

// Bytes waiting to go out past which an input is skipped.
const BACKED_UP = 64 * 1024;

// `url`: the server's address (wss://play.deadstab.com); `request`: the join
// or create message above (without pid and version: added here).
export function connectServer({ url, request, pid, timeout = 8000, WebSocketClass = globalThis.WebSocket }) {
 return new Promise((resolve, reject) => {
  if (!WebSocketClass) { reject(new Error('This browser cannot play online.')); return; }
  let socket, settled = false;
  const fail = text => { if (settled) return; settled = true; clearTimeout(timer); try { socket?.close(); } catch {} reject(new Error(text)); };
  const timer = setTimeout(() => fail('The game server did not answer. Check your connection and try again.'), timeout);
  try { socket = new WebSocketClass(String(url).replace(/\/+$/, '') + '/play'); }
  catch { fail('Could not reach the game server.'); return; }
  const transport = {
   role: 'client', id: null, code: null, room: null, notes: [], server: true,
   lostText: 'Lost connection to the game server.',
   onMessage() {}, onJoin() {}, onLeave() {}, onError() {},
   send(_to, message) {
    if (socket.readyState !== 1) return false;
    if (message?.t === 'input' && socket.bufferedAmount > BACKED_UP) return false;
    socket.send(JSON.stringify(message)); return true;
   },
   broadcast() {},
   lead(op, fields = {}) { return transport.send('host', { ...fields, t: 'lead', op }); },
   close() { transport.closed = true; try { socket.close(1000, 'left'); } catch {} },
  };
  socket.onopen = () => socket.send(JSON.stringify({ ...request, pid, version: PROTOCOL_VERSION }));
  socket.onerror = () => fail('Could not reach the game server. Check your connection and try again.');
  socket.onclose = () => {
   if (!settled) { fail('The game server closed the connection.'); return; }
   // Called through a local, not as transport.onLeave(...): Vite's build drops a
   // direct call to a method that is empty in this literal (the session sets
   // the real one later), and the page then never hears the socket close.
   // tools/check-build.mjs fails the deploy if it happens again (v0.1.1).
   if (!transport.closed) { transport.closed = true; const leave = transport.onLeave; leave.call(transport, 'host'); }
  };
  socket.onmessage = event => {
   let message; try { message = JSON.parse(event.data); } catch { return; }
   if (!message || typeof message !== 'object') return;
   if (!settled) {
    if (message.t === 'nope') { fail(String(message.reason || 'Could not join.')); return; }
    if (message.t !== 'room') return;
    settled = true; clearTimeout(timer);
   }
   if (message.t === 'room') {
    transport.room = { code: String(message.code || ''), name: message.name ? String(message.name) : null, public: !!message.public, map: String(message.map || ''), id: String(message.id || ''), lead: !!message.lead };
    transport.code = transport.room.code;
    if (!transport.resolved) { transport.resolved = true; resolve(transport); }
    return;
   }
   if (message.t === 'note') { transport.notes.push(String(message.text || '')); return; }
   if (message.t === 'nope') { transport.notes.push(String(message.reason || '')); return; }
   // (Through a local for the same reason: a direct call was dropped from the
   // build, so no message after 'room' reached the game; v0.1.1.)
   const handler = transport.onMessage; handler.call(transport, 'host', message);
  };
 });
}

// The JOIN page's list of always-open rooms (the server's /rooms), or null
// when the server cannot be reached.
export async function fetchRooms(url, { timeout = 5000, fetchImpl = globalThis.fetch } = {}) {
 const http = String(url).replace(/^ws(s?):/, 'http$1:').replace(/\/+$/, '');
 const abort = new AbortController(), timer = setTimeout(() => abort.abort(), timeout);
 try {
  const reply = await fetchImpl(http + '/rooms', { signal: abort.signal, cache: 'no-store' });
  if (!reply.ok) return null;
  const body = await reply.json();
  return { version: body.version, rooms: Array.isArray(body.rooms) ? body.rooms : [] };
 } catch { return null; }
 finally { clearTimeout(timer); }
}
