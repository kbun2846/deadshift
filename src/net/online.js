// Starts an online game: picks the transport and puts the right session on
// top of it. This is the only file that knows which transports exist.
//
// `via`:
//  'server' (the default since the game server, 2026-09-30): the game runs on
//           the dedicated server (server/). Everyone is a joiner there, HOST
//           included: `request` is { t:'join', code } or { t:'create', map,
//           mode, settings } (net/socket-transport.js).
//  'p2p':   the old browser-to-browser game (PeerJS); one player hosts.
//           Developer tools only now.
import { NETWORK } from '../config/network.js';
import { HostSession } from './host-session.js';
import { ClientSession } from './client-session.js';
import { playerId } from './player-id.js';

export async function goOnline({ role, via = 'server', request = null, code, map, local, createSim, name, server, settings, mode, config = NETWORK }) {
 if (via === 'server') {
  const { connectServer } = await import('./socket-transport.js');
  const transport = await connectServer({ url: server || config.gameServer, request, pid: playerId() });
  return new ClientSession({ transport, map, local, createSim, config, name });
 }
 if (config.transport !== 'peerjs') throw new Error('Transport "' + config.transport + '" is not built yet (see AGENTS.md).');
 const { hostRoom, joinRoom } = await import('./peer-transport.js');
 if (role === 'host') return new HostSession({ transport: await hostRoom(code, { config, server }), map, local, createSim, config, name, settings, mode });
 return new ClientSession({ transport: await joinRoom(code, { config, server }), map, local, createSim, config, name });
}
