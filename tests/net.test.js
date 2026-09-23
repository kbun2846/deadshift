import test from 'node:test';
import assert from 'node:assert/strict';
import { maps } from '../src/maps.js';
import { Simulation, RULES } from '../src/simulation.js';
import { NETWORK } from '../src/config/network.js';
import { createLoopback, makeRoomCode, cleanRoomCode } from '../src/net/transport.js';
import { HostSession } from '../src/net/host-session.js';
import { ClientSession } from '../src/net/client-session.js';
import { movementInput, readMessage, PROTOCOL_VERSION } from '../src/net/protocol.js';

const map = maps.deadwater;
const createSim = m => new Simulation(m);

function room({ clients = 1, clock } = {}) {
 const net = createLoopback();
 const hostSim = createSim(map);
 let time = 0;
 const now = clock || (() => time);
 const host = new HostSession({ transport: net.host('ABCDE'), map, local: hostSim, createSim, now });
 const joined = [];
 for (let i = 0; i < clients; i++) {
  const sim = createSim(map);
  joined.push({ sim, session: new ClientSession({ transport: net.join('ABCDE'), map, local: sim, createSim, now, name: 'P' + i }) });
 }
 net.flush();
 // One 60 Hz tick for everyone, with each client's raw input.
 const tick = (inputs = []) => {
  time += 1 / 60;
  hostSim.step(movementInput(inputs.host || {})); hostSim.drainEvents();
  joined.forEach((c, i) => { c.sim.step(c.session.input(inputs[i] || {})); c.sim.drainEvents(); });
  net.flush();
  host.step();
  net.flush();
 };
 return { net, host, hostSim, joined, tick, get time() { return time; } };
}

test('room codes are short, readable and forgiving to type', () => {
 const code = makeRoomCode();
 assert.equal(code.length, NETWORK.codeLength);
 assert.ok(!/[01IO]/.test(code));
 assert.equal(cleanRoomCode(' ab-cde '), 'ABCDE');
 assert.equal(cleanRoomCode('ABC'), null);
 assert.equal(cleanRoomCode('ABCD0'), null);
});

test('two players connect and each sees the other', () => {
 const r = room();
 const [c] = r.joined;
 assert.ok(c.session.welcomed);
 assert.equal(r.host.remotes.size, 1);
 for (let i = 0; i < 12; i++) r.tick();
 assert.equal(r.host.others().length, 1);
 const seen = c.session.others();
 assert.equal(seen.length, 1);
 assert.equal(seen[0].id, 'host');
 // Joiners appear beside the host, not on top of them.
 assert.ok(Math.hypot(c.sim.player.x - r.hostSim.player.x, c.sim.player.z - r.hostSim.player.z) > 1.5);
});

test('a client moves instantly and the host agrees where it ended up', () => {
 const r = room();
 const [c] = r.joined;
 const start = { x: c.sim.player.x, z: c.sim.player.z };
 r.tick([{ moveX: 1 }]);
 assert.ok(c.sim.player.x > start.x, 'prediction moves on the first tick');
 for (let i = 0; i < 90; i++) r.tick([{ moveX: 1 }]);
 for (let i = 0; i < 30; i++) r.tick();
 const hostView = r.host.remotes.values().next().value.sim.player;
 assert.ok(hostView.x - start.x > 5, 'host moved the client too');
 assert.ok(Math.hypot(hostView.x - c.sim.player.x, hostView.z - c.sim.player.z) < .05, 'prediction matches the authority');
 assert.ok(c.session.correction < .05);
});

test('the host sees the client move and the client sees the host move', () => {
 const r = room();
 const [c] = r.joined;
 const hostStart = r.hostSim.player.x;
 for (let i = 0; i < 60; i++) r.tick({ host: { moveZ: 1 }, 0: { moveX: -1 } });
 for (let i = 0; i < 20; i++) r.tick();
 const hostSeen = c.session.others().find(p => p.id === 'host');
 assert.ok(Math.abs(hostSeen.z - r.hostSim.player.z) < .2, 'client draws the host where the host is');
 assert.ok(r.hostSim.player.z - 3 > 0 || r.hostSim.player.x === hostStart);
 const clientSeen = r.host.others()[0];
 assert.ok(Math.abs(clientSeen.x - c.sim.player.x) < .05);
});

test('clients cannot send positions, damage or weapon use: only movement survives', () => {
 const read = readMessage({ t: 'input', inputs: [{ seq: 1, moveX: 50, moveZ: 0, fire: true, hex: true, x: 999, dodge: 1 }] });
 assert.deepEqual(Object.keys(read.inputs[0]).sort(), ['aimX', 'aimZ', 'dodge', 'moveX', 'moveZ', 'seq', 'smoothAim']);
 assert.equal(read.inputs[0].moveX, 1);
 assert.equal(readMessage({ t: 'input', inputs: 'nope' }), null);
 assert.equal(readMessage(null), null);
});

test('a lost input packet costs nothing: the next message repeats it', () => {
 const r = room();
 const [c] = r.joined;
 const send = c.session.transport.send;
 let dropped = 0;
 c.session.transport.send = (to, msg) => { if (msg.t === 'input' && dropped++ % 3 === 0) return; send(to, msg); };
 for (let i = 0; i < 60; i++) r.tick([{ moveX: 1 }]);
 c.session.transport.send = send;
 for (let i = 0; i < 20; i++) r.tick();
 const remote = r.host.remotes.values().next().value;
 // At most a tick or two of jitter buffer behind, never a growing backlog.
 assert.ok(c.session.seq - remote.lastSeq <= 2);
 assert.ok(Math.abs(remote.sim.player.x - c.sim.player.x) < .05);
});

test('prediction errors ease out; big ones snap', () => {
 const r = room();
 const [c] = r.joined;
 for (let i = 0; i < 6; i++) r.tick();
 const remote = r.host.remotes.values().next().value;
 c.sim.player.x += .5;
 r.tick(); r.tick(); r.tick();
 const gap = Math.abs(remote.sim.player.x - c.sim.player.x);
 assert.ok(gap > .1 && gap < .45, 'a small error is corrected gradually, not snapped');
 for (let i = 0; i < 40; i++) r.tick();
 assert.ok(c.session.correction < .01);
 c.sim.player.x += 5;
 for (let i = 0; i < 3; i++) r.tick();
 assert.ok(Math.abs(remote.sim.player.x - c.sim.player.x) < .05, 'a big error snaps');
});

test('the room fills up, turns away other versions and notices when players leave', () => {
 const r = room({ clients: NETWORK.maxPlayers - 1 });
 assert.equal(r.host.playerCount, NETWORK.maxPlayers);
 const extra = new ClientSession({ transport: r.net.join('ABCDE'), map, local: createSim(map), createSim, now: () => 0 });
 r.net.flush();
 assert.match(extra.ended, /full/);
 r.joined[0].session.transport.close(); r.net.flush();
 assert.equal(r.host.remotes.size, NETWORK.maxPlayers - 2);
 assert.ok(r.host.drainNotices().some(n => /left/.test(n)));
 const net = createLoopback(); const host = new HostSession({ transport: net.host('ABCDE'), map, local: createSim(map), createSim });
 const t = net.join('ABCDE'); let reply = null; t.onMessage = (_f, m) => { reply = m; };
 t.send('host', { t: 'hello', version: PROTOCOL_VERSION + 1 }); net.flush();
 assert.equal(reply.t, 'full'); assert.equal(host.remotes.size, 0);
});

test('a silent player times out; a vanished host ends the client game', () => {
 const r = room();
 const [c] = r.joined;
 c.session.input = () => movementInput({}); // stops sending
 for (let i = 0; i < Math.ceil(NETWORK.timeout * 60) + 2; i++) r.tick();
 assert.equal(r.host.remotes.size, 0);
 const r2 = room();
 r2.host.transport.close(); r2.net.flush();
 assert.match(r2.joined[0].session.ended, /host left/);
 // A host that just goes quiet (no goodbye) is noticed too.
 const r3 = room();
 r3.host.step = () => {};
 for (let i = 0; i < Math.ceil(NETWORK.timeout * 60) + 2; i++) r3.tick();
 assert.match(r3.joined[0].session.ended, /Lost connection/);
});

test('developer overrides are forced off for everyone online', () => {
 const r = room();
 r.hostSim.dev = { speed: 3, ammo: true };
 r.joined[0].sim.dev = { speed: 3 };
 r.tick([{ moveX: 1 }]);
 assert.deepEqual(r.hostSim.dev, { speed: 1 });
 for (const remote of r.host.remotes.values()) assert.deepEqual(remote.sim.dev, { speed: 1 });
 assert.deepEqual(r.joined[0].sim.dev, { speed: 1 });
 assert.ok(RULES.speed > 0);
});

test('players are solid to each other: walking into someone stops you at their edge, on host and joiner alike', () => {
 const { hostSim, joined, tick, host } = room();
 const client = joined[0];
 for (let i = 0; i < 20; i++) tick();
 // The joiner spawns 2.2 m east of the host; the host walks east into them.
 for (let i = 0; i < 90; i++) tick({ host: { moveX: 1, moveZ: 0 } });
 const guest = [...host.remotes.values()][0].sim.player;
 const gap = Math.hypot(guest.x - hostSim.player.x, guest.z - hostSim.player.z);
 assert.ok(gap >= RULES.radius * 2 - 1e-3, `host stopped at the joiner (gap ${gap.toFixed(3)})`);
 // And the joiner walking west into the host stops too, predicted and on the host.
 for (let i = 0; i < 90; i++) tick({ 0: { moveX: -1, moveZ: 0 } });
 const hostSide = Math.hypot(guest.x - hostSim.player.x, guest.z - hostSim.player.z);
 const predicted = Math.hypot(client.sim.player.x - hostSim.player.x, client.sim.player.z - hostSim.player.z);
 assert.ok(hostSide >= RULES.radius * 2 - 1e-3, `joiner stopped at the host on the host (gap ${hostSide.toFixed(3)})`);
 assert.ok(predicted >= RULES.radius * 2 - .15, `joiner's own prediction also stops (gap ${predicted.toFixed(3)})`);
});

test('offline play has no other players to bump into', () => {
 const sim = createSim(map);
 assert.deepEqual(sim.otherPlayers, []);
 const before = { ...sim.player };
 sim.step(movementInput({ moveX: 1, moveZ: 0 }));
 assert.ok(sim.player.x > before.x);
});
