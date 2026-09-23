// Two windows of the same browser on the same computer talk through a
// BroadcastChannel instead of WebRTC. It needs no server, no STUN and no
// network at all, so testing multiplayer in two windows always connects, even
// where WebRTC between two windows fails (privacy extensions that hide local
// addresses, VPNs, strict firewalls). peer-transport.js tries this first when
// joining and listens on it while hosting; players on other devices still come
// in over WebRTC.
//
// Messages on the channel: { kind: 'knock' | 'welcome' | 'data' | 'bye', from,
// to, body }. Bodies are JSON strings, so a message arrives exactly as it would
// over the WebRTC data channel (serialization: 'json').

const channelName = code => 'deadshift-room-' + code;
const supported = () => typeof BroadcastChannel !== 'undefined';

// While hosting: let windows of this browser join room `code`.
export function listenLocal(code, { onOpen, onData, onClose }) {
 if (!supported()) return null;
 const channel = new BroadcastChannel(channelName(code));
 const links = new Map();
 const post = message => { try { channel.postMessage(message); } catch {} };
 const drop = id => { const link = links.get(id); if (!link) return; link.open = false; links.delete(id); onClose(id); };
 channel.onmessage = ({ data }) => {
  if (!data || data.to !== 'host' || typeof data.from !== 'string') return;
  if (data.kind === 'knock') {
   if (!links.has(data.from)) {
    const id = data.from, link = {
     open: true,
     send: message => { if (link.open) post({ kind: 'data', from: 'host', to: id, body: JSON.stringify(message) }); },
     close: () => { if (!link.open) return; post({ kind: 'bye', from: 'host', to: id }); drop(id); },
    };
    links.set(id, link); onOpen(id, link);
   }
   post({ kind: 'welcome', from: 'host', to: data.from });
  } else if (data.kind === 'data' && links.has(data.from)) {
   try { onData(data.from, JSON.parse(data.body)); } catch {}
  } else if (data.kind === 'bye') drop(data.from);
 };
 const closeAll = () => { for (const id of [...links.keys()]) { post({ kind: 'bye', from: 'host', to: id }); drop(id); } };
 globalThis.addEventListener?.('pagehide', closeAll);
 return { close() { closeAll(); globalThis.removeEventListener?.('pagehide', closeAll); channel.close(); } };
}

// While joining: is room `code` hosted in another window of this browser?
// Resolves to a link, or null after `wait` ms with no answer.
export function knockLocal(code, { wait = 500 } = {}) {
 if (!supported()) return Promise.resolve(null);
 const id = 'local-' + Math.random().toString(36).slice(2, 10);
 const channel = new BroadcastChannel(channelName(code));
 const post = message => { try { channel.postMessage(message); } catch {} };
 const link = {
  id, open: false,
  onData() {}, onClose() {},
  send(message) { if (link.open) post({ kind: 'data', from: id, to: 'host', body: JSON.stringify(message) }); },
  close() { if (link.open) post({ kind: 'bye', from: id, to: 'host' }); link.open = false; globalThis.removeEventListener?.('pagehide', leave); channel.close(); },
 };
 const leave = () => link.close();
 return new Promise(resolve => {
  const timer = setTimeout(() => { channel.close(); resolve(null); }, wait);
  channel.onmessage = ({ data }) => {
   if (!data || data.to !== id || data.from !== 'host') return;
   if (data.kind === 'welcome' && !link.open) { clearTimeout(timer); link.open = true; globalThis.addEventListener?.('pagehide', leave); resolve(link); }
   else if (data.kind === 'data') { try { link.onData(JSON.parse(data.body)); } catch {} }
   else if (data.kind === 'bye' && link.open) { link.open = false; channel.close(); link.onClose(); }
  };
  post({ kind: 'knock', from: id, to: 'host' });
 });
}
