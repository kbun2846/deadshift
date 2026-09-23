// The one door between the game and the network. Sessions (host-session.js,
// client-session.js) only ever use this shape, so the wire underneath can be
// PeerJS today and a WebSocket to a dedicated server later.
//
// A transport is an object with:
//   role        'host' or 'client'
//   id          this end's id ('host' for the host)
//   code        the room code
//   send(to, message)   to one peer (a client always sends to 'host')
//   broadcast(message)  host only: to every connected client
//   onMessage(from, message), onJoin(peerId), onLeave(peerId), onError(error)
//               callbacks the session sets
//   close()
//
// Messages are plain JSON-safe objects (see protocol.js).
import { NETWORK } from '../config/network.js';

export function makeRoomCode(random = Math.random, config = NETWORK) {
 let code = '';
 for (let i = 0; i < config.codeLength; i++) code += config.codeAlphabet[Math.floor(random() * config.codeAlphabet.length)];
 return code;
}

// Typed codes forgive case, spaces and dashes. The alphabet has no O, 0, I or
// 1, so there is no look-alike to guess between.
export function cleanRoomCode(text, config = NETWORK) {
 const code = String(text || '').toUpperCase().replace(/[\s-]/g, '');
 const valid = [...code].every(c => config.codeAlphabet.includes(c));
 return valid && code.length === config.codeLength ? code : null;
}

const endpoint = (role, id, code) => ({ role, id, code, onMessage() {}, onJoin() {}, onLeave() {}, onError() {} });

// An in-memory network for tests: nothing leaves the process and messages
// wait in a queue until flush(), so a test decides exactly when they land.
// JSON round-trips each message, as the real wire does.
export function createLoopback() {
 const queue = [];
 let host = null, serial = 0;
 const clients = new Map();
 const deliver = (target, from, message) => queue.push(() => target.onMessage(from, JSON.parse(JSON.stringify(message))));
 return {
  host(code = 'TEST1') {
   host = endpoint('host', 'host', code);
   host.send = (to, message) => { const c = clients.get(to); if (c) deliver(c, 'host', message); };
   host.broadcast = message => { for (const c of clients.values()) deliver(c, 'host', message); };
   host.close = () => { for (const id of [...clients.keys()]) this.drop(id); host = null; };
   return host;
  },
  join(code = 'TEST1') {
   if (!host || host.code !== code) throw new Error('No room ' + code);
   const id = 'peer' + (++serial), client = endpoint('client', id, code);
   client.send = (_to, message) => { if (host) deliver(host, id, message); };
   client.broadcast = () => {};
   client.close = () => this.drop(id);
   clients.set(id, client);
   const room = host; queue.push(() => room.onJoin(id));
   return client;
  },
  drop(id) {
   const client = clients.get(id); if (!client) return;
   clients.delete(id);
   if (host) { const room = host; queue.push(() => room.onLeave(id)); }
   queue.push(() => client.onLeave('host'));
  },
  flush() { let n = 0; while (queue.length && n++ < 10000) queue.shift()(); },
  get pending() { return queue.length; },
 };
}
