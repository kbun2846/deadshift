// Browser-to-browser transport over WebRTC, using PeerJS for the handshake.
// The host registers the room code with the signalling server; a joining
// browser asks for that code, the two swap connection details, and from then
// on messages go directly between them (or through a TURN relay when the
// networks refuse a direct line; see config/network.js).
//
// Data channels are opened unordered, so one late packet never holds up the
// ones behind it. The protocol copes: snapshots carry a tick and old ones are
// ignored, and inputs repeat so a lost one is resent in the next message.
// Two windows of the same browser skip WebRTC and use net/local-link.js.
import { NETWORK } from '../config/network.js';
import { listenLocal, knockLocal } from './local-link.js';

let peerLibrary = null;
// Loaded only when someone goes online, so single-player never downloads it.
const loadPeer = async () => (peerLibrary ||= (await import('peerjs')).Peer);

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

export async function hostRoom(code, { config = NETWORK, server } = {}) {
 const Peer = await loadPeer();
 const peer = new Peer(config.roomPrefix + code, peerOptions(config, server));
 const connections = new Map();
 const transport = {
  role: 'host', id: 'host', code,
  onMessage() {}, onJoin() {}, onLeave() {}, onError() {},
  send(to, message) { const c = connections.get(to); if (c?.open) c.send(message); },
  broadcast(message) { for (const c of connections.values()) if (c.open) c.send(message); },
  dropped(id) { if (connections.delete(id)) transport.onLeave(id); },
  close() { for (const c of connections.values()) c.close(); connections.clear(); local?.close(); peer.destroy(); },
  get peers() { return [...connections.keys()]; },
 };
 await new Promise((resolve, reject) => {
  peer.once('open', resolve);
  peer.once('error', error => reject(new Error(errorText(error))));
 });
 peer.on('error', error => transport.onError(new Error(errorText(error))));
 // Losing the signalling server does not end a running game; it only stops
 // new players joining until it comes back.
 peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
 // Other windows of this browser join over a BroadcastChannel (local-link.js).
 const local = listenLocal(code, {
  onOpen: (id, link) => { connections.set(id, link); transport.onJoin(id); },
  onData: (id, message) => transport.onMessage(id, message),
  onClose: id => transport.dropped(id),
 });
 peer.on('connection', connection => {
  const id = connection.peer;
  connection.on('open', () => { connections.set(id, connection); wire(transport, connection, id); transport.onJoin(id); });
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
  send(_to, message) { if (connection?.open) connection.send(message); },
  broadcast() {},
  dropped() { if (!transport.closed) { transport.closed = true; transport.onLeave('host'); } },
  close() { transport.closed = true; connection?.close(); peer.destroy(); },
 };
 let connection = null;
 try {
  await new Promise((resolve, reject) => {
   const timer = setTimeout(() => reject(new Error('The host did not answer. Check the code, keep the host\'s game open in front, and try again. Some networks block direct connections (see TURN in AGENTS.md).')), timeout);
   peer.once('error', error => { clearTimeout(timer); reject(new Error(errorText(error))); });
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
 return transport;
}
