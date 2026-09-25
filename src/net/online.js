// Starts an online game: picks the transport named in config/network.js and
// puts the right session on top of it. This is the only file that knows which
// transport exists; switching to a dedicated server adds a branch here.
import { NETWORK } from '../config/network.js';
import { HostSession } from './host-session.js';
import { ClientSession } from './client-session.js';

export async function goOnline({ role, code, map, local, createSim, name, server, settings, mode, config = NETWORK }) {
 if (config.transport !== 'peerjs') throw new Error('Transport "' + config.transport + '" is not built yet (see AGENTS.md).');
 const { hostRoom, joinRoom } = await import('./peer-transport.js');
 if (role === 'host') return new HostSession({ transport: await hostRoom(code, { config, server }), map, local, createSim, config, name, settings, mode });
 return new ClientSession({ transport: await joinRoom(code, { config, server }), map, local, createSim, config, name });
}
