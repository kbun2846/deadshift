// v0.990a (owner): the multiplayer map is chosen when hosting and can be
// changed from the lobby. A joiner on another of our maps is sent to the
// room's map (it reloads there and joins again) instead of being turned away;
// the host moving the room tells everyone where to go.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { maps } from '../src/maps.js';
import { createLoopback } from '../src/net/transport.js';
import { HostSession } from '../src/net/host-session.js';
import { ClientSession } from '../src/net/client-session.js';
import { readMessage } from '../src/net/protocol.js';

const createSim = m => new Simulation(m), now = () => 0;

test('a joiner on another map is sent to the room\'s map, not turned away', () => {
 const net = createLoopback();
 new HostSession({ transport: net.host('ABCDE'), map: maps['hollow-wick'], local: createSim(maps['hollow-wick']), createSim, now });
 const guest = new ClientSession({ transport: net.join('ABCDE'), map: maps.deadwater, local: createSim(maps.deadwater), createSim, now });
 net.flush();
 assert.equal(guest.moveTo, 'hollow-wick');
 assert.ok(!guest.ended, 'not an error');
 assert.equal(guest.welcomed, false, 'and not seated here');
});

test('the host moving the room tells its players; only our multiplayer maps are followed', () => {
 const net = createLoopback();
 const host = new HostSession({ transport: net.host('ABCDE'), map: maps.deadwater, local: createSim(maps.deadwater), createSim, now });
 const guest = new ClientSession({ transport: net.join('ABCDE'), map: maps.deadwater, local: createSim(maps.deadwater), createSim, now });
 net.flush();
 assert.equal(guest.welcomed, true);
 host.moveMap('hollow-wick'); net.flush();
 assert.equal(guest.moveTo, 'hollow-wick');
 const other = new ClientSession({ transport: net.join('ABCDE'), map: maps.deadwater, local: createSim(maps.deadwater), createSim, now });
 net.flush();
 other.receive({ t: 'moveMap', map: 'nowhere' }); other.receive({ t: 'moveMap', map: 'hill-test' }); other.receive({ t: 'moveMap', map: '__proto__' });
 assert.equal(other.moveTo, undefined, 'unknown, practice-only or odd ids are ignored');
 assert.deepEqual(readMessage({ t: 'moveMap', map: 'hollow-wick' }), { t: 'moveMap', map: 'hollow-wick' });
 assert.equal(readMessage({ t: 'moveMap', map: 7 }), null);
});
