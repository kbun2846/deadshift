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
import { SPAWN_APART } from '../src/config/match.js';
import { interiorSpawns } from '../src/net/spawn-points.js';
import { mapColliders } from '../src/maps.js';

const map = maps.deadwater;
const createSim = m => new Simulation(m);

// A room with a host and `clients` joiners. `weapons` picks what each chooses
// (host first); null leaves that player on the weapon menu.
function room({ clients = 1, clock, weapons = [], mode = 'ffa', settings = { robots: 'off' } } = {}) {
 const net = createLoopback();
 const hostSim = createSim(map);
 let time = 0;
 const now = clock || (() => time);
 const host = new HostSession({ transport: net.host('ABCDE'), map, local: hostSim, createSim, now, name: 'Hosty', random: seeded(7), settings });
 const joined = [];
 for (let i = 0; i < clients; i++) {
  const sim = createSim(map);
  joined.push({ sim, session: new ClientSession({ transport: net.join('ABCDE'), map, local: sim, createSim, now, name: 'P' + i }) });
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
 // The host starts a round from the lobby; everyone is then on the weapon pick.
 if (mode) host.startRound(mode);
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
 assert.match(html, /id="online-name"/); assert.doesNotMatch(html, /password/i);
});

test('players join with a username and the room code alone, and names stay unique', () => {
 const r = room({ clients: 2 });
 assert.ok(r.joined[0].session.welcomed && r.joined[1].session.welcomed);
 assert.equal(r.host.remotes.size, 2);
 assert.equal([...r.host.remotes.values()][0].name, 'P0');
 const twin = new ClientSession({ transport: r.net.join('ABCDE'), map, local: createSim(map), createSim, now: () => 0, name: 'p0' });
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
test('the host shoots a joiner dead: damage, a kill-feed line, the scoreboard, and a respawn after the wait', () => {
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
 // Respawn: out for the wait (MATCH.respawn), then back in a building at full health.
 for (let i = 0; i < 60 * (MATCH.respawn - 1); i++) r.tick();
 assert.ok(c.session.mine.dead, 'still down before the wait is up');
 for (let i = 0; i < 60 * 1.5; i++) r.tick();
 assert.ok(!c.session.mine.dead && c.session.mine.present, 'back after the wait');
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

test('time in game stops while picking a weapon again, and the most used weapon wins the column', () => {
 const r = room({ weapons: ['static', 'rifle'] });
 const [c] = r.joined, seat = [...r.host.remotes.values()][0].seat;
 for (let i = 0; i < 120; i++) r.tick();
 r.host.arena.died(seat, null);
 c.session.pickAgain(); r.net.flush();
 for (let i = 0; i < 300; i++) r.tick();
 const row = r.host.scoreboard().find(b => b.name === 'P0');
 assert.ok(row.time >= 2 && row.time <= 3, 'only the ~2 seconds in the world count: ' + row.time);
 assert.ok(seat.picking, 'still on the weapon pick: the respawn waits for it');
 c.session.choose('shotgun'); r.net.flush();
 // The wait began at the death, 5 seconds ago: in just after it is up.
 for (let i = 0; i < 60 * (MATCH.respawn - 5) + 30; i++) r.tick();
 assert.equal(seat.weapon, 'shotgun'); assert.ok(seat.present && !seat.dead);
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

test('a joiner still loading is not dropped, and a stall on our own side is forgiven', () => {
 // Welcomed, then silent while building the world: longer than the normal timeout is fine.
 const net = createLoopback(); let time = 0; const now = () => time;
 const host = new HostSession({ transport: net.host('ABCDE'), map, local: createSim(map), createSim, now });
 const client = new ClientSession({ transport: net.join('ABCDE'), map, local: createSim(map), createSim, now, name: 'Slow' });
 net.flush();
 assert.ok(client.welcomed);
 for (let i = 0; i < (NETWORK.timeout + 2) * 60; i++) { time += 1 / 60; host.step(); }
 assert.equal(host.remotes.size, 1, 'kept while loading');
 // The joiner's own page froze for 14 s, with the host's snapshots queued behind it.
 time += 14; net.flush(); client.input({});
 assert.equal(client.ended, null, 'the client forgives its own freeze');
 // Now loaded and talking: a 10 s freeze of the host's own page is not the client's silence.
 net.flush(); time += 1 / 60; host.step(); net.flush();
 assert.ok([...host.remotes.values()][0].loaded);
 time += 10; host.step();
 assert.equal(host.remotes.size, 1, 'the host forgives its own freeze');
 for (let i = 0; i < (NETWORK.timeout + 1) * 60; i++) { time += 1 / 60; host.step(); }
 assert.equal(host.remotes.size, 0, 'real silence still times out');
});

test('developer overrides online are the host\'s only: joiners are forced off', () => {
 const r = room();
 r.hostSim.dev = { speed: 3, ammo: true };
 r.joined[0].sim.dev = { speed: 3 };
 r.tick([{ moveX: 1 }]);
 assert.deepEqual(r.hostSim.dev, { speed: 3, ammo: true }, 'the host keeps its dev tools');
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

// --- Lobby, match clock, map reset, ping --------------------------------------

test('everyone gets the lobby (players, colour slots, spawn setting) and a ping for each joiner', () => {
 const r = room({ clients: 2 });
 for (let i = 0; i < 90; i++) r.tick(); // pings go out once a second; lobby with the slow snapshots
 const lobby = r.host.lobby();
 assert.deepEqual(lobby.players.map(p => p.name), ['Hosty', 'P0', 'P1']);
 assert.deepEqual(lobby.players.map(p => p.slot), [0, 1, 2]);
 assert.ok(lobby.players.slice(1).every(p => Number.isFinite(p.ping)), 'a round trip for each joiner');
 assert.equal(lobby.spawnMode, 'random');
 const seen = r.joined[0].session.lobby();
 assert.deepEqual(seen.players.map(p => p.name), ['Hosty', 'P0', 'P1'], 'joiners see the room too');
 assert.ok(r.host.scoreboard().every(row => 'ping' in row && 'slot' in row), 'the scoreboard carries ping and colour');
 // Pongs alone do not keep a silent player in the room (tested by the timeout test);
 // they are dropped when malformed.
 assert.equal(readMessage({ t: 'pong', s: 'x' }), null);
 assert.deepEqual(readMessage({ t: 'ping', s: 1.5, extra: 1 }), { t: 'ping', s: 1.5 });
});

test('spawns are scattered, nobody within a screen of anyone else; nobody can spawn everyone together any more', () => {
 const r = room({ clients: 2 });
 assert.equal(r.host.setSpawnMode('nonsense'), false);
 assert.equal(r.host.setSpawnMode('together'), false, 'retired (owner, v0.9b)');
 for (const seat of r.host.arena.seats.values()) { r.host.arena.out(seat); }
 for (const seat of r.host.arena.seats.values()) r.host.arena.spawn(seat);
 const bodies = [...r.host.arena.seats.values()].map(s => s.sim.player);
 for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++)
  assert.ok(Math.hypot(bodies[i].x - bodies[j].x, bodies[i].z - bodies[j].z) >= SPAWN_APART, 'a screen apart');
 assert.equal(r.host.setSpawnMode('team'), true);
 for (let i = 0; i < 40; i++) r.tick();
 assert.equal(r.joined[0].session.lobby().spawnMode, 'team');
});

test('the host resets the map: every prop stands again, crops regrow, and every screen is told', () => {
 const r = room();
 const world = r.host.arena.world, prop = world.props.find(p => p.hp !== null);
 prop.hp = 0; world.colliders = world.colliders.filter(c => c.propId !== prop.id);
 world.crops[0].state = 'burnt';
 r.host.resetMap();
 r.tick();
 assert.equal(prop.hp, prop.health);
 assert.ok(world.colliders.some(c => c.propId === prop.id));
 assert.equal(world.crops[0].state, 'standing');
 const types = r.host.log.map(entry => entry.e.type);
 assert.ok(types.includes('propRestore') && types.includes('mapReset'));
 for (let i = 0; i < 10; i++) r.tick();
 const got = r.joined[0].session.drainEvents().map(entry => entry.e.type);
 assert.ok(got.includes('mapReset'), 'the joiner clears its debris too');
});

test('an ffa round lasts ten minutes, then the results, then everyone back in the lobby; the next round starts fresh', () => {
 const r = room();
 const arena = r.host.arena;
 assert.equal(MATCH.length, 600); assert.equal(MATCH.respawn, 12);
 assert.equal(r.host.match().phase, 'playing');
 arena.seats.get('host').stats.kills = 3;
 arena.clock = 1 / 60;
 r.tick(); r.tick();
 const over = r.host.match();
 assert.equal(over.phase, 'results');
 assert.equal(over.results.winner.name, 'Hosty');
 assert.equal(over.results.winner.kills, 3);
 // Nobody moves during the results.
 const before = { ...r.hostSim.player };
 for (let i = 0; i < 30; i++) r.tick({ host: { moveX: 1 } });
 assert.equal(r.hostSim.player.x, before.x);
 for (let i = 0; i < 20; i++) r.tick();
 assert.equal(r.joined[0].session.match().phase, 'results', 'joiners see the results');
 for (let i = 0; i < MATCH.results * 60; i++) r.tick();
 assert.equal(r.host.match().phase, 'lobby');
 assert.ok([...arena.seats.values()].every(s => !s.present), 'everyone out of the world');
 assert.ok(r.host.startRound('ffa'));
 const next = r.host.match();
 assert.equal(next.phase, 'playing'); assert.equal(next.number, 2);
 assert.ok(next.left > MATCH.length - 2);
 assert.equal(arena.seats.get('host').stats.kills, 0, 'scores reset');
 assert.ok([...arena.seats.values()].every(s => s.picking), 'everyone picks a weapon first');
});

// --- Rounds: lobby, weapon pick, modes, settings -----------------------------

test('a room opens in the lobby: nobody in the world, the host picks the mode and settings', () => {
 const r = room({ mode: null });
 assert.equal(r.host.match().phase, 'lobby');
 assert.ok([...r.host.arena.seats.values()].every(s => !s.present));
 assert.equal(r.host.choose('rifle'), false, 'no weapon pick in the lobby');
 assert.equal(r.host.setMode('2v2'), true, 'every mode is ready (v0.9b)');
 assert.equal(r.host.setMode('nope'), false);
 assert.equal(r.host.setMode('practice'), true);
 assert.equal(r.host.setSetting('health', 750), true);
 assert.equal(r.host.setSetting('health', 1), false);
 for (let i = 0; i < 40; i++) r.tick();
 const seen = r.joined[0].session.lobby();
 assert.equal(seen.mode, 'practice'); assert.equal(seen.settings.health, 750);
 assert.ok(r.host.startRound('practice'));
 assert.equal(r.host.setMode('ffa'), false, 'the mode is fixed once the round is on');
});

test('the weapon pick: GO goes in at once; at zero you go in with your pick, or a random weapon', () => {
 const r = room({ clients: 2, weapons: [null, null, null] });
 const [a, b] = r.joined, seats = [...r.host.remotes.values()].map(x => x.seat);
 assert.ok(seats.every(s => s.picking) && r.host.hostSeat.picking);
 r.host.choose('shotgun', true);
 assert.ok(r.host.hostSeat.present, 'GO: in now');
 a.session.choose('rifle', false); r.net.flush();
 for (let i = 0; i < 30; i++) r.tick();
 assert.ok(!seats[0].present && seats[0].picking.weapon === 'rifle', 'picked but waiting for GO or the timer');
 for (let i = 0; i < 10 * 60; i++) r.tick();
 assert.ok(seats[0].present && seats[0].weapon === 'rifle', 'the timer sends in the picked weapon');
 assert.ok(seats[1].present && ['static', 'rifle', 'shotgun'].includes(seats[1].weapon), 'nothing picked: a random weapon');
 assert.equal(b.session.me.present, true);
});

test('weapons change only after dying', () => {
 const r = room();
 const seat = [...r.host.remotes.values()][0].seat, [c] = r.joined;
 c.session.pickAgain(); c.session.choose('shotgun'); r.net.flush();
 for (let i = 0; i < 6; i++) r.tick();
 assert.equal(seat.weapon, 'static', 'alive: no change');
 r.host.arena.died(seat, null);
 c.session.pickAgain(); c.session.choose('shotgun'); r.net.flush();
 for (let i = 0; i < MATCH.respawn * 60 + 10; i++) r.tick();
 assert.equal(seat.weapon, 'shotgun'); assert.ok(seat.present && !seat.dead, 'back in after the respawn wait');
});

test('practice: the weapon can be changed any time; the player leaves the world while picking', () => {
 const r = room({ mode: 'practice' });
 const seat = [...r.host.remotes.values()][0].seat, [c] = r.joined;
 for (let i = 0; i < 6; i++) r.tick();
 assert.ok(seat.present && !seat.dead);
 c.session.pickAgain(); r.net.flush();
 for (let i = 0; i < 3; i++) r.tick();
 assert.ok(!seat.present && seat.picking, 'alive, yet picking: out of the world');
 c.session.choose('rifle'); r.net.flush();
 for (let i = 0; i < 6; i++) r.tick();
 assert.equal(seat.weapon, 'rifle'); assert.ok(seat.present && !seat.dead, 'GO: straight back in');
 c.session.choose('shotgun'); r.net.flush();
 for (let i = 0; i < 6; i++) r.tick();
 assert.equal(seat.weapon, 'shotgun', 'a pick without opening the pick first works too');
});

test('practice: the map targets are out and shared; players can hit each other but nothing counts; respawn is instant', () => {
 const r = room({ mode: 'practice' });
 const arena = r.host.arena, seat = [...r.host.remotes.values()][0].seat, [c] = r.joined;
 assert.ok(arena.targets.length > 0, 'targets out');
 for (let i = 0; i < 6; i++) r.tick();
 assert.equal(c.sim.targets.length, arena.targets.length, 'the joiner mirrors them');
 // A hit on a target's stand-in lands on the real target.
 const target = arena.targets[0], hp = target.hp;
 arena.before(r.host.hostSeat);
 r.hostSim.targets.find(t => t.id === target.id).hp -= 30;
 arena.after(r.host.hostSeat);
 assert.equal(target.hp, hp - 30);
 // Killing a player counts for nobody and has no wait.
 const host = arena.seats.get('host');
 seat.sim.damagePlayer(9999, 'host', false, false, null, 'gunshot'); arena.died(seat, host);
 assert.equal(host.stats.kills, 0); assert.equal(seat.stats.deaths, 0);
 assert.equal(seat.respawnIn, 0);
 for (let i = 0; i < 120; i++) r.tick();
 assert.ok(seat.dead, 'no automatic respawn in practice');
 c.session.respawnNow(); r.net.flush(); r.tick();
 assert.ok(seat.present && !seat.dead, 'RESPAWN: back at once');
 assert.equal(r.host.match().left, 0, 'no clock');
});

test('the kill limit ends an ffa round; the health setting is what everyone spawns with', () => {
 const r = room({ mode: null });
 r.host.setSetting('killLimit', 10); r.host.setSetting('health', 250);
 r.host.startRound('ffa'); r.host.choose('rifle'); r.net.flush();
 r.joined[0].session.choose('rifle'); r.net.flush();
 for (let i = 0; i < 6; i++) r.tick();
 assert.equal(r.hostSim.player.hp, 250); assert.equal(r.hostSim.player.maxHp, 250);
 r.host.arena.seats.get('host').stats.kills = 10;
 r.tick();
 assert.equal(r.host.match().phase, 'results');
});

test('nobody spawns inside the ground the weapon-pick camera shows; a mid-round joiner goes to the pick', async () => {
 const { pickArea, inPickArea } = await import('../src/render/pick-view.js');
 const r = room();
 const area = pickArea(map);
 assert.ok(r.host.arena.rooms.length > 3, 'plenty of rooms left');
 for (const roomSpots of r.host.arena.rooms) for (const p of roomSpots.points) assert.ok(!inPickArea(area, p.x, p.z));
 const net = r.net;
 const sim = createSim(map);
 const late = new ClientSession({ transport: net.join('ABCDE'), map, local: sim, createSim, now: () => r.time, name: 'Late' });
 net.flush(); r.tick();
 const seat = [...r.host.remotes.values()].find(x => x.name === 'Late').seat;
 assert.ok(seat.picking && !seat.present);
 for (let i = 0; i < 6; i++) r.tick();
 assert.ok(late.me.picking, 'the joiner knows it is picking');
});

test('from full health to dead in one hit reads "one shot" in the kill feed and on the death screen', async () => {
 const { feedLine } = await import('../src/ui/multiplayer-hud.js');
 for (const [first, expected] of [[0, true], [100, false]]) {
  const r = room(), arena = r.host.arena, seat = [...r.host.remotes.values()][0].seat, host = r.host.hostSeat;
  for (let i = 0; i < 3; i++) r.tick();
  const hitProxy = amount => { arena.before(host); const proxy = r.hostSim.targets.find(t => t.id === seat.id); proxy.hp -= amount; r.hostSim.events.push({ type: amount >= proxy.hp + amount ? 'kill' : 'hit', id: seat.id, damageType: 'gunshot' }); arena.after(host); };
  if (first) { hitProxy(first); arena.endTick(); }
  hitProxy(9999);
  const line = arena.endTick().find(l => l.victims.includes(seat.id));
  assert.equal(!!line?.oneShot, expected);
  assert.match(feedLine(line, 'x'), expected ? /one shot/ : /killed/);
 }
});

test('a Static stream on a slow link never outgrows one message, and the joiner catches up after', () => {
 const r = room();
 place(r, 'host', street.x, street.z); place(r, 0, street.x + 3, street.z);
 let biggest = 0;
 const send = r.host.transport.send.bind(r.host.transport);
 r.host.transport.send = (to, m) => { if (m.t === 'snapshot') biggest = Math.max(biggest, JSON.stringify(m).length); send(to, m); };
 // The joiner's acknowledgements do not arrive for two seconds (a bad patch).
 const receive = r.host.receive.bind(r.host);
 r.host.receive = () => {};
 for (let i = 0; i < 120; i++) r.tick({ host: { spray: true, aimX: 1, aimZ: 0 } });
 r.host.receive = receive;
 for (let i = 0; i < 90; i++) r.tick({ host: { spray: true, aimX: 1, aimZ: 0 } });
 assert.ok(biggest < 16300, 'largest snapshot ' + biggest + ' bytes');
 const got = r.joined[0].session.drainEvents().map(entry => entry.e);
 assert.ok(got.filter(e => e.type === 'sprayArc').length > 20, 'the stream reached the joiner');
 const arc = got.find(e => e.type === 'sprayArc');
 assert.equal(arc.paths.length, 9); assert.ok(Number.isFinite(arc.paths[0].b.x) && Number.isFinite(arc.paths[0].a.z));
 assert.ok(got.some(e => e.type === 'playerDamage'), 'and its damage');
});

test('syphon (FFA, on by default): a kill gives the killer back half the health they had lost', () => {
 const r = room();
 const arena = r.host.arena, host = arena.seats.get('host'), other = [...r.host.remotes.values()][0].seat;
 assert.equal(arena.settings.syphon, 'on');
 host.sim.player.hp = 200;
 arena.died(other, host);
 assert.equal(host.sim.player.hp, 200 + Math.floor((host.sim.player.maxHp - 200) * .5));
 assert.ok(host.sim.events.some(e => e.type === 'syphon'));
 arena.setSetting('syphon', 'off'); other.dead = false; host.sim.player.hp = 200;
 arena.died(other, host); assert.equal(host.sim.player.hp, 200);
});
