// QUICK PLAY's matchmaking line to the game server (server/quick.js): one
// WebSocket to /play whose first message is { t:'quick', pid, version, name }.
// It never carries a game; it only hears where a match is:
//   { t:'match', code, map, mode }   a room to join (with a second socket,
//                                    the ordinary JOIN by code)
//   { t:'queued', waiting }          nobody to play yet (or an offer was
//                                    withdrawn): keep waiting
//   { t:'nope', reason }             refused (maintenance, a ban, an old page)
// `handlers`: onQueued(waiting), onMatch({ code, map, mode }), onEnd(reason,
// refused) (the line closed or never opened; `reason` says why; `refused`:
// the server said no, and `reason` is its words).
// Returns { close() }.
import { PROTOCOL_VERSION } from './protocol.js';

export function openQuickQueue({ url, pid, name, handlers = {}, WebSocketClass = globalThis.WebSocket }) {
 let socket = null, ended = false, refusal = '';
 const end = (reason, refused = false) => { if (ended) return; ended = true; handlers.onEnd?.(reason, refused); };
 const line = { close() { if (ended) return; ended = true; try { socket?.close(1000, 'left'); } catch {} }, get open() { return !ended; } };
 if (!WebSocketClass) { queueMicrotask(() => end('This browser cannot play online.')); return line; }
 try { socket = new WebSocketClass(String(url).replace(/\/+$/, '') + '/play'); }
 catch { queueMicrotask(() => end('Could not reach the game server.')); return line; }
 socket.onopen = () => { try { socket.send(JSON.stringify({ t: 'quick', pid, name, version: PROTOCOL_VERSION, cards: 1 })); } catch {} };
 socket.onerror = () => {};
 socket.onclose = () => end(refusal || 'The game server closed the connection.', !!refusal);
 socket.onmessage = event => {
  if (ended) return;
  let message; try { message = JSON.parse(event.data); } catch { return; }
  if (!message || typeof message !== 'object') return;
  if (message.t === 'queued') handlers.onQueued?.(Number(message.waiting) || 0);
  else if (message.t === 'match' && message.code) handlers.onMatch?.({ code: String(message.code), map: String(message.map || ''), mode: String(message.mode || 'ffa') });
  else if (message.t === 'nope') refusal = String(message.reason || 'Could not play online.');
 };
 return line;
}
