import test from 'node:test';
import assert from 'node:assert/strict';
import { maps, buildingContains } from '../src/maps.js';
import { Simulation, RULES } from '../src/simulation.js';
import { NETWORK } from '../src/config/network.js';
import { createLoopback, makeRoomCode, cleanRoomCode } from '../src/net/transport.js';
import { HostSession } from '../src/net/host-session.js';
import { ClientSession } from '../src/net/client-session.js';
import { movementInput, playerInput, readMessage, cleanName, PROTOCOL_VERSION } from '../src/net/protocol.js';
import { MATCH } from '../src/net/arena.js';
import { interiorSpawns } from '../src/net/spawn-points.js';
import { mapColliders } from '../src/maps.js';

const map = maps.deadwater;
const createSim = m => new Simulation(m);

// A room with a host and `clients` joiners. `weapons` picks what each chooses
// (host first); null leaves that player on the weapon menu.
function room({ clients = 1, clock, weapons = [], password = '', passwords = [] } = {}) {
 const net = createLoopback();
 const hostSim = createSim(map);
 let time = 0;
 const now = clock || (() => time);
 const host = new HostSession({ transport: net.host('ABCDE'), map, local: hostSim, createSim, now, name: 'Hosty', password, random: seeded(7) });
 const joined = [];
 for (let i = 0; i < clients; i++) {
  const sim = createSim(map);
  joined.push({ sim, session: new ClientSession({ transport: net.join('ABCDE'), map, local: sim, createSim, now, name: 'P' + i, password: passwords[i] ?? password }) });
 }
 net.flush();
 const tick = (inputs = []) => {
  time += 1 / 60;
  hostSim.step(host.beforeLocal(inputs.host || {}));
  joined.forEach((c, i) => { c.sim.step(c.session.input(inputs[i] || {})); c.sim.drainEvents(); });
  net.flush();
  host.step();
  // Like main.js: the host's own events are drained after the others ran.
  hostSim.drainEvents();
  net.flush();
 };
 const hostWeapon = weapons[0] === undefined ? 'static' : weapons[0];
 if (hostWeapon) host.choose(hostWeapon);
 joined.forEach((c, i) => { const w = weapons[i + 1] === undefined ? 'static' : weapons[i + 1]; if (w && c.session.welcomed) c.session.choose(w); });
 net.flush();
 for (let i = 0; i < 6; i++) tick();
 return { net, host, hostSim, joined, tick, get time() { return time; } };
}

function seeded(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

// Puts a player somewhere on both the host and (for joiners) their own screen.
function place(r, who, x, z) {
 const seat = who === 'host' ? r.host.hostSeat : [...r.host.remotes.values()][who].seat;
 Object.assign(seat.sim.player, { x, z, vx: 0, vz: 0 });
 if (who !== 'host') Object.assign(r.joined[who].sim.player, { x, z, vx: 0, vz: 0 });
}

const street = { x: map.spawn.x, z: map.spawn.z };

test('room codes are short, readable and forgiving to type', () => {
 const code = makeRoomCode();
 assert.equal(code.length, NETWORK.codeLength);
 assert.ok(!/[01IO]/.test(code));
 assert.equal(cleanRoomCode(' ab-cde '), 'ABCDE');
 assert.equal(cleanRoomCode('ABC'), null);
 assert.equal(cleanRoomCode('ABCD0'), null);
});

test('multiplayer is switched on and called Multiplayer in the game modes', async () => {
 assert.equal(NETWORK.enabled, true);
 const { readFileSync } = await import('node:fs');
 const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
 assert.match(html, /id="online-mode"[^>]*>MULTIPLAYER</);
 assert.match(html, /id="online-name"/); assert.match(html, /id="online-password"/);
});

test('players join with a username, need the password, and names stay unique', () => {
 const r = room({ clients: 2, password: 'hunter', passwords: ['hunter', 'nope'] });
 assert.ok(r.joined[0].session.welcomed);
 assert.match(r.joined[1].session.ended, /Wrong password/);
 assert.equal(r.host.remotes.size, 1);
 assert.equal([...r.host.remotes.values()][0].name, 'P0');
 const twin = new ClientSession({ transport: r.net.join('ABCDE'), map, local: createSim(map), createSim, now: () => 0, name: 'p0', password: 'hunter' });
 r.net.flush();
 assert.equal(twin.name, 'p0 2', 'a second P0 plays under its own name');
 assert.equal(cleanName('  <b>Sam</b>!! '), 'bSamb');
 assert.equal(cleanName(''), null);
});

test('nobody is in the world until they pick a weapon, and then they appear inside a building', () => {
 const r = room({ weapons: [null, null] });
 const [c] = r.joined;
 assert.equal(r.host.hostSeat.present, false);
 assert.equal(r.host.others().length, 0);
 r.host.choose('rifle'); c.session.choose('shotgun'); r.net.flush();
 for (let i = 0; i < 6; i++) r.tick();
 assert.ok(r.host.hostSeat.present && c.session.mine.present);
 assert.equal(r.hostSim.weapon, 'rifle');
 assert.equal([...r.host.remotes.values()][0].sim.weapon, 'shotgun');
 for (const p of [r.hostSim.player, c.sim.player]) assert.ok(map.buildings.some(b => buildingContains(b, p)), 'spawned indoors');
 assert.equal(r.hostSim.player.hp, MATCH.health);
 assert.equal(MATCH.health, 500);
});

test('every spawn point is inside a real room and clear of furniture', () => {
 const rooms = interiorSpawns(map, mapColliders(map));
 assert.ok(rooms.length >= 8);
 for (const room of rooms) {
  const b = map.buildings.find(x => x.id === room.id);
  for (const p of room.points) assert.ok(buildingContains(b, p));
 }
});

test('a client moves instantly and the host agrees where it ended up', () => {
 const r = room();
 const [c] = r.joined;
 place(r, 0, street.x, street.z); r.tick(); for (let i = 0; i < 6; i++) r.tick();
 const start = { x: c.sim.player.x, z: c.sim.player.z };
 r.tick([{ moveX: 1 }]);
 assert.ok(c.sim.player.x > start.x, 'prediction moves on the first tick');
 for (let i = 0; i < 60; i++) r.tick([{ moveX: 1 }]);
 for (let i = 0; i < 30; i++) r.tick();
 const hostView = [...r.host.remotes.values()][0].sim.player;
 assert.ok(hostView.x - start.x > 3, 'host moved the client too');
 assert.ok(Math.hypot(hostView.x - c.sim.player.x, hostView.z - c.sim.player.z) < .05, 'prediction matches the authority');
});

test('inputs are cleaned: presses stay presses, points stay on the map, nothing else gets through', () => {
 const read = readMessage({ t: 'input', inputs: [{ seq: 1, moveX: 50, fire: 'yes', aimPointX: 1e9, x: 999, hp: 1 }] });
 const input = read.inputs[0];
 assert.equal(input.moveX, 1); assert.equal(input.fire, true); assert.equal(input.aimPointX, undefined);
 assert.ok(!('x' in input) && !('hp' in input));
 assert.deepEqual(Object.keys(playerInput({})).sort(), Object.keys(input).filter(k => k !== 'seq').sort());
 assert.equal(readMessage({ t: 'input', inputs: 'nope' }), null);
});

// The core of the whole thing: weapons hit other players, and it all agrees.
test('the host shoots a joiner dead: damage, a kill-feed line, the scoreboard, and a respawn 5 seconds later', () => {
 const r = room({ weapons: ['rifle', 'static'] });
 const [c] = r.joined;
 place(r, 'host', street.x - 4, street.z); place(r, 0, street.x + 4, street.z);
 for (let i = 0; i < 3; i++) r.tick();
 let seenDeath = false, ownDamage = 0;
 for (let i = 0; i < 60 * 12 && !seenDeath; i++) {
  r.tick({ host: { fire: r.hostSim.rifle.ammo > 0, reload: r.hostSim.rifle.ammo === 0, aiming: true, aimX: 1, aimZ: 0, aimPointX: c.sim.player.x, aimPointZ: c.sim.player.z }, 0: {} });
  for (const { by, e } of c.session.drainEvents()) {
   if (by === c.session.id && e.type === 'playerDamage') ownDamage += e.damage;
   if (by === c.session.id && e.type === 'playerDeath') seenDeath = true;
   if (e.type === 'rifleReloaded') continue;
  }
 }
 assert.ok(seenDeath, 'the joiner is told they died');
 assert.ok(ownDamage >= 499, 'and felt every hit');
 const line = c.session.drainFeed().find(l => l.killer === 'host');
 assert.ok(line, 'kill feed names the killer');
 assert.deepEqual(line.victimNames, ['P0']);
 const board = r.host.scoreboard();
 assert.equal(board[0].name, 'Hosty'); assert.equal(board[0].kills, 1);
 const victim = board.find(b => b.name === 'P0');
 assert.equal(victim.deaths, 1); assert.ok(victim.taken >= 499); assert.ok(board[0].dealt >= 499);
 assert.equal(board[0].weapon, 'rifle');
 // Respawn: out for 5 seconds, then back in a building at full health.
 for (let i = 0; i < 60 * 4; i++) r.tick();
 assert.ok(c.session.mine.dead, 'still down before 5 seconds');
 for (let i = 0; i < 60 * 1.5; i++) r.tick();
 assert.ok(!c.session.mine.dead && c.session.mine.present, 'back after 5');
 assert.equal(c.sim.player.hp, 500);
 assert.ok(!c.sim.player.dead);
 assert.ok(map.buildings.some(b => buildingContains(b, c.sim.player)));
});

test('one blast that kills two players is one kill-feed line naming both', () => {
 const r = room({ clients: 2, weapons: ['static', 'static', 'static'] });
 const seats = [...r.host.remotes.values()].map(x => x.seat);
 for (const s of seats) s.sim.player.hp = 20;
 // Two victims side by side; the host's volley bursts between them.
 place(r, 'host', street.x - 5, street.z); place(r, 0, street.x + 3, street.z - .45); place(r, 1, street.x + 3, street.z + .45);
 for (let i = 0; i < 3; i++) r.tick();
 for (let i = 0; i < 40; i++) r.tick({ host: { seed: true, aimX: 1, aimZ: 0 } });
 r.tick({ host: { launch: true, aimX: 1, aimZ: 0, launchPointX: street.x + 3, launchPointZ: street.z } });
 for (let i = 0; i < 90; i++) r.tick();
 const line = r.host.feed().find(l => l.killer === 'host' && l.victims.length === 2);
 assert.ok(line, 'both deaths in one line: ' + JSON.stringify(r.host.feed()));
});

test('your own blast can kill you, and it counts as a death, not a kill', () => {
 const r = room({ clients: 1, weapons: ['static', null] });
 place(r, 'host', street.x, street.z);
 r.hostSim.player.hp = 5;
 for (let i = 0; i < 30; i++) r.tick({ host: { seed: true, aimX: 1, aimZ: 0 } });
 r.tick({ host: { launch: true, aimX: 1, aimZ: 0, launchPointX: street.x + .3, launchPointZ: street.z } });
 for (let i = 0; i < 60; i++) r.tick();
 const me = r.host.scoreboard().find(b => b.name === 'Hosty');
 assert.equal(me.deaths, 1); assert.equal(me.kills, 0);
 assert.ok(r.host.feed().some(l => l.killer === null && l.victimNames[0] === 'Hosty'));
});

test('time in game stops on the weapon menu, and the most used weapon wins the column', () => {
 const r = room({ weapons: ['static', 'rifle'] });
 const [c] = r.joined;
 for (let i = 0; i < 120; i++) r.tick();
 c.session.toMenu(); r.net.flush();
 for (let i = 0; i < 300; i++) r.tick();
 const row = r.host.scoreboard().find(b => b.name === 'P0');
 assert.ok(row.time >= 2 && row.time <= 3, 'only the ~2 seconds in the world count: ' + row.time);
 assert.equal(row.present, false);
 c.session.choose('shotgun'); r.net.flush();
 for (let i = 0; i < 60; i++) r.tick();
 assert.equal(r.host.scoreboard().find(b => b.name === 'P0').weapon, 'rifle');
});

test('props broken by one player are broken for everyone, joiners included', () => {
 const r = room();
 const [c] = r.joined;
 const prop = r.host.arena.world.props.find(p => p.hp > 0);
 const sim = [...r.host.remotes.values()][0].sim;
 r.host.arena.before([...r.host.remotes.values()][0].seat);
 sim.hitProp(prop, { damage: prop.hp, owner: sim.player.id, x: prop.x, z: prop.z });
 r.host.arena.after([...r.host.remotes.values()][0].seat);
 r.host.record(c.session.id, sim.drainEvents());
 assert.equal(r.hostSim.props.find(p => p.id === prop.id)?.hp ?? r.host.arena.world.props.find(p => p.id === prop.id).hp, 0);
 for (let i = 0; i < 6; i++) r.tick();
 assert.equal(c.sim.props.find(p => p.id === prop.id).hp, 0, 'the joiner sees it broken');
 assert.ok(!c.sim.colliders.some(b => b.propId === prop.id), 'and can walk through where it stood');
});

test('lost snapshots lose no events: they are resent until acknowledged', () => {
 const r = room({ weapons: ['rifle', 'static'] });
 const [c] = r.joined;
 const send = r.host.transport.send;
 let dropped = 0;
 r.host.transport.send = (to, msg) => { if (msg.t === 'snapshot' && dropped++ % 2 === 0) return; send(to, msg); };
 place(r, 'host', street.x - 4, street.z); place(r, 0, street.x + 4, street.z);
 let shots = 0;
 for (let i = 0; i < 60; i++) { r.tick({ host: { fire: true, aimX: 1, aimZ: 0 } }); shots += c.session.drainEvents().filter(x => x.e.type === 'rifleShot').length; }
 r.host.transport.send = send;
 for (let i = 0; i < 12; i++) { r.tick(); shots += c.session.drainEvents().filter(x => x.e.type === 'rifleShot').length; }
 const fired = r.host.log.filter(x => x.e.type === 'rifleShot').length;
 assert.equal(shots, fired);
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

test('players are solid to each other: walking into someone stops you at their edge', () => {
 const r = room();
 place(r, 'host', street.x - 2.2, street.z); place(r, 0, street.x, street.z);
 for (let i = 0; i < 6; i++) r.tick();
 for (let i = 0; i < 90; i++) r.tick({ host: { moveX: 1, moveZ: 0 } });
 const guest = [...r.host.remotes.values()][0].sim.player;
 const gap = Math.hypot(guest.x - r.hostSim.player.x, guest.z - r.hostSim.player.z);
 assert.ok(gap >= RULES.radius * 2 - 1e-3, `host stopped at the joiner (gap ${gap.toFixed(3)})`);
});

test('offline play has no other players to bump into and owns its own world', () => {
 const sim = createSim(map);
 assert.deepEqual(sim.otherPlayers, []);
 assert.equal(sim.worldAuthority, true);
 const before = { ...sim.player };
 sim.step(movementInput({ moveX: 1, moveZ: 0 }));
 assert.ok(sim.player.x > before.x);
});
