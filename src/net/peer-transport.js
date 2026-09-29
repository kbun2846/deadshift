// Browser-to-browser transport over WebRTC, using PeerJS for the handshake.
// The host registers the room code with the signalling server; a joining
// browser asks for that code, the two swap connection details, and from then
// on messages go directly between them (or through a TURN relay when the
// networks refuse a direct line; see config/network.js).
//
// Data channels are opened unordered, so one late packet never holds up the
// ones behind it. The protocol copes: snapshots carry a tick and old ones are
// ignored, and inputs repeat so a lost one is resent in the next message.
// Since v0.999a snapshots, inputs and pings go on a second, never-resent
// channel (FAST, below).
// Two windows of the same browser skip WebRTC and use net/local-link.js.
import { NETWORK } from '../config/network.js';
import { listenLocal, knockLocal } from './local-link.js';

let peerLibrary = null;
// Loaded only when someone goes online, so single-player never downloads it.
const loadPeer = async () => { fastChannels(); return (peerLibrary ||= (await import('peerjs')).Peer); };

// (v0.999a, owner: joiners on a phone hotspot had high ping, rubber-banded and
// answered slowly.) The one channel was unordered but still *reliable*: every
// lost packet was sent again and everything behind it waited in the send
// buffer (PeerJS queues up to 8 MB), so on a lossy link the delay only grew.
// Now each joiner opens a second connection, FAST, that never resends
// (maxRetransmits 0) and carries what the next message replaces anyway:
// snapshots, inputs (each repeats the last ten), pings. Everything else stays
// on the reliable one. And a FAST-kind message is dropped, not queued, while
// its channel is backed up (CONGESTED bytes waiting, or PeerJS holding any):
// the next one, a sixtieth or twentieth of a second later, says it better.
export const FAST_LABEL = 'ds-fast-';
export const FAST_TYPES = new Set(['snapshot', 'input', 'ping', 'pong']);
export const CONGESTED = 24000;
function fastChannels() {
 const P = globalThis.RTCPeerConnection?.prototype; if (!P || P.__deadshiftFast) return;
 const make = P.createDataChannel;
 P.createDataChannel = function (label, options) {
  return make.call(this, label, String(label).startsWith(FAST_LABEL) ? { ...options, ordered: false, maxRetransmits: 0 } : options);
 };
 P.__deadshiftFast = true;
}
export const congested = c => !!c && ((c.bufferSize || 0) > 0 || (c.dataChannel?.bufferedAmount || 0) > CONGESTED);
// Sends `message` on the right one of a peer's two connections (`fast` may
// be missing or closed: then all goes on `main`), or drops it (a FAST kind on
// a backed-up channel). Returns true if sent.
export function sendOn(main, fast, message) {
 const quick = FAST_TYPES.has(message?.t), c = quick && fast?.open ? fast : main;
 if (!c?.open || (quick && congested(c))) return false;
 c.send(message); return true;
}

function peerOptions(config, override) {
 const options = { config: { iceServers: config.iceServers }, debug: 1 };
 const server = override || config.peerServer;
 if (server) {
  const [host, port] = String(server).split(':');
  Object.assign(options, { host, port: Number(port) || 9000, path: '/', secure: false, key: 'peerjs' });
 }
 return options;
}

const errorText = error => {
 const type = error?.type || '';
 if (type === 'unavailable-id') return 'That room code is already in use. Try hosting again.';
 if (type === 'peer-unavailable') return 'No game with that code. Check the code and that the host is still in the room.';
 if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') return 'Could not reach the matchmaking server. Check your connection.';
 if (type === 'browser-incompatible') return 'This browser cannot play online (it needs WebRTC).';
 return error?.message || 'Connection failed.';
};

function wire(transport, connection, id) {
 connection.on('data', data => transport.onMessage(id, data));
 connection.on('close', () => transport.dropped(id));
 connection.on('error', () => transport.dropped(id));
 // Browsers only report a vanished peer when the underlying link times out.
 connection.peerConnection?.addEventListener?.('iceconnectionstatechange', () => {
  const state = connection.peerConnection.iceConnectionState;
  if (state === 'failed' || state === 'closed') transport.dropped(id);
 });
}

export async function hostRoom(code, { config = NETWORK, server, openWait = 8000 } = {}) {
 const Peer = await loadPeer();
 const peer = new Peer(config.roomPrefix + code, peerOptions(config, server));
 const connections = new Map(), fast = new Map();
 const transport = {
  role: 'host', id: 'host', code,
  onMessage() {}, onJoin() {}, onLeave() {}, onError() {},
  send(to, message) { sendOn(connections.get(to), fast.get(to), message); },
  broadcast(message) { for (const [id, c] of connections) sendOn(c, fast.get(id), message); },
  dropped(id) { fast.get(id)?.close(); fast.delete(id); if (connections.delete(id)) transport.onLeave(id); },
  close() { for (const c of [...connections.values(), ...fast.values()]) c.close(); connections.clear(); fast.clear(); local?.close(); if (!peer.destroyed) peer.destroy(); },
  get peers() { return [...connections.keys()]; },
  // (Whose FAST connection is open: the lobby's diagnostics, tests.)
  get fastPeers() { return [...fast.keys()].filter(id => fast.get(id)?.open); },
 };
 // No matchmaking server (offline, a blocked network, a page that may not
 // reach it): the room still opens, for the host alone and for other windows
 // of this browser (local-link.js). `transport.offline` says so; the host can
 // play every mode by themselves. Any other error (a taken code) still fails.
 const reached = await new Promise(resolve => {
  const timer = setTimeout(() => resolve('timeout'), openWait);
  peer.once('open', () => { clearTimeout(timer); resolve('open'); });
  peer.once('error', error => { clearTimeout(timer); resolve(error); });
 });
 if (reached !== 'open') {
  const unreachable = reached === 'timeout' || ['network', 'server-error', 'socket-error', 'socket-closed'].includes(reached?.type);
  peer.destroy();
  if (!unreachable) throw Object.assign(new Error(errorText(reached)), { type: reached?.type });
  transport.offline = true;
 } else {
  peer.on('error', error => transport.onError(new Error(errorText(error))));
  // Losing the signalling server does not end a running game; it only stops
  // new players joining until it comes back.
  peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
  peer.on('connection', connection => {
   const id = connection.peer;
   // A joiner's FAST connection: only a second way in for its messages.
   if (String(connection.label || '').startsWith(FAST_LABEL)) {
    connection.on('open', () => { fast.get(id)?.close(); fast.set(id, connection); connection.on('data', data => transport.onMessage(id, data)); });
    connection.on('close', () => { if (fast.get(id) === connection) fast.delete(id); });
    return;
   }
   connection.on('open', () => { connections.set(id, connection); wire(transport, connection, id); transport.onJoin(id); });
  });
 }
 // Other windows of this browser join over a BroadcastChannel (local-link.js).
 const local = listenLocal(code, {
  onOpen: (id, link) => { connections.set(id, link); transport.onJoin(id); },
  onData: (id, message) => transport.onMessage(id, message),
  onClose: id => transport.dropped(id),
 });
 return transport;
}

export async function joinRoom(code, { config = NETWORK, server, timeout = 15000 } = {}) {
 // Hosted in another window of this browser? Then no WebRTC needed.
 const nearby = await knockLocal(code);
 if (nearby) {
  const transport = {
   role: 'client', id: nearby.id, code,
   onMessage() {}, onJoin() {}, onLeave() {}, onError() {},
   send(_to, message) { nearby.send(message); },
   broadcast() {},
   close() { transport.closed = true; nearby.close(); },
  };
  nearby.onData = message => transport.onMessage('host', message);
  nearby.onClose = () => { if (!transport.closed) { transport.closed = true; transport.onLeave('host'); } };
  return transport;
 }
 const Peer = await loadPeer();
 const peer = new Peer(peerOptions(config, server));
 const transport = {
  role: 'client', id: null, code,
  onMessage() {}, onJoin() {}, onLeave() {}, onError() {},
  send(_to, message) { sendOn(connection, quick, message); },
  broadcast() {},
  dropped() { if (!transport.closed) { transport.closed = true; transport.onLeave('host'); } },
  close() { transport.closed = true; quick?.close(); connection?.close(); peer.destroy(); },
  get fast() { return !!quick?.open; },
 };
 let connection = null, quick = null;
 try {
  await new Promise((resolve, reject) => {
   const timer = setTimeout(() => reject(new Error('The host did not answer. Check the code, keep the host\'s game open in front, and try again. Some networks block direct connections (see TURN in AGENTS.md).')), timeout);
   peer.once('error', error => { clearTimeout(timer); reject(Object.assign(new Error(errorText(error)), { type: error?.type })); });
   peer.once('open', id => {
    transport.id = id;
    connection = peer.connect(config.roomPrefix + code, { reliable: false, serialization: 'json' });
    connection.once('open', () => { clearTimeout(timer); resolve(); });
    connection.once('error', error => { clearTimeout(timer); reject(new Error(errorText(error))); });
   });
  });
 } catch (error) { peer.destroy(); throw error; }
 wire(transport, connection, 'host');
 peer.on('error', error => transport.onError(new Error(errorText(error))));
 // The FAST connection (see fastChannels). Until it opens, or if it never
 // does (a network that allows one line only), everything uses the first.
 try {
  const f = peer.connect(config.roomPrefix + code, { label: FAST_LABEL + transport.id, reliable: false, serialization: 'json' });
  f.on('open', () => { if (transport.closed) f.close(); else quick = f; });
  f.on('data', data => transport.onMessage('host', data));
  f.on('close', () => { if (quick === f) quick = null; });
  f.on('error', () => { if (quick === f) quick = null; });
 } catch { /* the reliable connection carries everything */ }
 return transport;
}
