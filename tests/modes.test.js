// Multiplayer modes and robots (v0.9b): 1V1, 2V2, 2V2V2, 3V3 with sides,
// robots filling empty seats, + ROBOT, no friendly fire, team scores.
import test from 'node:test';
import assert from 'node:assert/strict';
import { maps } from '../src/maps.js';
import { Simulation } from '../src/simulation.js';
import { createLoopback } from '../src/net/transport.js';
import { HostSession } from '../src/net/host-session.js';
import { ClientSession } from '../src/net/client-session.js';
import { MODES, TEAMS } from '../src/config/match.js';
import { isRobotSlot } from '../src/bots/robot-model.js';

const map = maps.deadwater, createSim = m => new Simulation(m);
const seeded = seed => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };

function room({ clients = 0, settings = {} } = {}) {
 const net = createLoopback(), hostSim = createSim(map); let time = 0;
 const host = new HostSession({ transport: net.host('ABCDE'), map, local: hostSim, createSim, now: () => time, name: 'Hosty', random: seeded(3), settings });
 const joined = [];
 for (let i = 0; i < clients; i++) { const sim = createSim(map); joined.push({ sim, session: new ClientSession({ transport: net.join('ABCDE'), map, local: sim, createSim, now: () => time, name: 'P' + i }) }); }
 net.flush();
 const tick = () => {
  time += 1 / 60;
  hostSim.step(host.beforeLocal({}));
  joined.forEach(c => { c.sim.step(c.session.input({})); c.sim.drainEvents(); });
  net.flush(); host.step(); hostSim.drainEvents(); net.flush();
 };
 return { net, host, hostSim, joined, tick };
}

test('every mode can be started', () => {
 assert.ok(MODES.every(m => m.ready));
 for (const m of MODES) { const r = room(); assert.ok(r.host.startRound(m.id), m.id + ': ' + r.host.startError); }
});

test('robots fill the seats a mode needs, on sides dealt round-robin', () => {
 for (const [mode, size, teams] of [['1v1', 2, 0], ['2v2', 4, 2], ['2v2v2', 6, 3], ['3v3', 6, 2]]) {
  const r = room({ clients: 1 });
  assert.ok(r.host.startRound(mode));
  const seats = [...r.host.arena.seats.values()];
  assert.equal(seats.length, size, mode);
  assert.equal(seats.filter(s => s.robot).length, size - 2);
  assert.ok(seats.filter(s => s.robot).every(s => isRobotSlot(s.slot)), 'robots wear robot slots');
  if (teams) {
   for (const t of TEAMS.slice(0, teams)) assert.equal(seats.filter(s => s.team === t.id).length, size / teams, mode + ' ' + t.id);
   assert.notEqual(seats.find(s => s.id === 'host').team, seats.find(s => !s.robot && s.id !== 'host').team, 'the two players on different sides first');
  } else assert.ok(seats.every(s => s.team === null));
  // Robots go in at once with a weapon; they leave with the round.
  for (let i = 0; i < 3; i++) r.tick();
  assert.ok(seats.filter(s => s.robot).every(s => s.present && s.weapon));
  r.host.endRound();
  assert.equal([...r.host.arena.seats.values()].filter(s => s.robot).length, 0);
 }
});

test('FFA fills to four; with robots off a fixed-size mode refuses to start short', () => {
 const r = room();
 assert.ok(r.host.startRound('ffa'));
 assert.equal(r.host.arena.seats.size, 4);
 const off = room({ settings: { robots: 'off' } });
 assert.equal(off.host.startRound('2v2'), false);
 assert.match(off.host.startError, /needs 4/);
 assert.ok(off.host.addRobot() && off.host.addRobot() && off.host.addRobot());
 assert.ok(off.host.startRound('2v2'), '+ ROBOT fills it by hand');
 assert.ok(off.host.startRound('1v1'), 'spare robots step out'); assert.equal(off.host.arena.seats.size, 2);
 const crowd = room({ clients: 2 });
 assert.equal(crowd.host.startRound('1v1'), false, 'three players are too many for a 1V1');
 assert.match(crowd.host.startError, /for 2 players/);
});

test('no friendly fire: a teammate standing in the line of fire is not hurt', () => {
 const r = room({ settings: { robots: 'off' } });
 r.host.addRobot(); r.host.addRobot(); r.host.addRobot();
 assert.ok(r.host.startRound('2v2'));
 r.host.choose('rifle');
 for (let i = 0; i < 5; i++) r.tick();
 const arena = r.host.arena, me = r.host.hostSeat, mate = [...arena.seats.values()].find(s => s !== me && s.team === me.team);
 assert.ok(mate && mate.present);
 // Freeze the robots' own brains out of it: park everyone else far away.
 for (const s of arena.seats.values()) if (s !== me && s !== mate) Object.assign(s.sim.player, { x: -200, z: -200 });
 Object.assign(me.sim.player, { x: 0, z: 0, aimX: 1, aimZ: 0 }); Object.assign(mate.sim.player, { x: 3, z: 0 });
 const before = mate.sim.player.hp;
 me.sim.step(r.host.beforeLocal({ aimX: 1, aimZ: 0, aimPointX: 5, aimPointZ: 0, fire: true, tapFire: true }));
 r.host.step(); r.hostSim.drainEvents();
 assert.equal(mate.sim.player.hp, before);
 assert.ok(!arena.living(me).some(o => o === mate && arena.hostile(me, o)));
});

test('robots fight: in a 3V3 of robots and a host, damage is dealt and kills count for sides', () => {
 const r = room();
 assert.ok(r.host.startRound('3v3'));
 r.host.choose('rifle');
 for (let i = 0; i < 60 * 45; i++) r.tick();
 const board = r.host.arena.scoreboard(), dealt = board.reduce((n, row) => n + row.dealt, 0);
 assert.ok(dealt > 500, 'robots hurt each other (' + dealt + ')');
 const teams = r.host.arena.teamScores();
 assert.equal(teams.length, 2);
 assert.equal(teams.reduce((n, t) => n + t.kills, 0), board.reduce((n, row) => n + row.kills, 0));
});

test('a player joining a full team round takes a robot\'s seat and side', () => {
 const r = room();
 assert.ok(r.host.startRound('2v2'));
 const bots = [...r.host.arena.seats.values()].filter(s => s.robot);
 assert.equal(bots.length, 3);
 const sim = createSim(map); r.joined.push({ sim, session: new ClientSession({ transport: r.net.join('ABCDE'), map, local: sim, createSim, now: () => 0, name: 'Late' }) });
 r.net.flush();
 const seats = [...r.host.arena.seats.values()];
 assert.equal(seats.length, 4);
 assert.equal(seats.filter(s => s.robot).length, 2);
 const late = seats.find(s => s.name === 'Late');
 assert.ok(late.team && late.picking);
 // Everyone sees the robots in the snapshot, drawn as robots.
 for (let i = 0; i < 12; i++) r.tick();
 const lobby = r.host.lobby();
 assert.equal(lobby.players.filter(p => p.robot).length, 2);
});

test('results name the winning side', () => {
 const r = room({ settings: { killLimit: 10 } });
 assert.ok(r.host.startRound('2v2'));
 const arena = r.host.arena, red = [...arena.seats.values()].find(s => s.team === 'red');
 red.stats.kills = 10; arena.teamKills.set('red', 10);
 arena.endTick();
 assert.equal(arena.phase, 'results');
 assert.equal(arena.results.winner.team, 'red');
 assert.match(arena.results.winner.name, /AMBER/);
});

test('friendly fire (on by default): a teammate stands in your targets and takes half; off: not at all', () => {
 for (const ff of ['on', 'off']) {
  const r = room({ settings: { robots: 'off', friendlyFire: ff } });
  r.host.addRobot(); r.host.addRobot(); r.host.addRobot();
  assert.ok(r.host.startRound('2v2'));
  r.host.choose('rifle'); for (let i = 0; i < 4; i++) r.tick();
  const arena = r.host.arena, me = r.host.hostSeat, mate = [...arena.seats.values()].find(s => s !== me && s.team === me.team);
  arena.before(me);
  const entry = me.proxies.get(mate.id);
  if (ff === 'off') { assert.equal(entry, undefined); me.sim.targets = []; continue; }
  assert.ok(entry && entry.proxy.friendly, 'teammate is a friendly target');
  const before = mate.sim.player.hp; me.sim.hit(entry.proxy, { damage: 100, owner: me.id });
  arena.after(me);
  assert.ok(Math.abs(before - mate.sim.player.hp - 50) < 1e-6, 'half the damage');
  assert.equal(me.stats.dealt, 0, 'no credit for hurting a teammate');
 }
});

test('players pick their side in the lobby (full sides refuse); with "with team" each side spawns together, apart from the others', () => {
 const r = room({ clients: 2, settings: { robots: 'fill', spawnMode: 'team' } });
 const arena = r.host.arena, [a, b] = [...r.host.remotes.values()].map(x => x.seat);
 assert.ok(r.host.setMode('2v2'));
 assert.ok(r.joined[0].session.chooseTeam && true);
 assert.ok(arena.chooseTeam('host', 'blue'));
 assert.ok(arena.chooseTeam(a.id, 'blue'));
 assert.equal(arena.chooseTeam(b.id, 'blue'), false, 'blue is full');
 assert.ok(arena.chooseTeam(b.id, 'red'));
 assert.equal(arena.chooseTeam(b.id, 'gold'), false, 'no gold side in a 2V2');
 assert.ok(r.host.startRound('2v2'));
 assert.equal(arena.seats.get('host').team, 'blue'); assert.equal(a.team, 'blue'); assert.equal(b.team, 'red');
 for (const seat of arena.seats.values()) arena.spawn(seat);
 const bySide = side => [...arena.seats.values()].filter(s => s.team === side).map(s => s.sim.player);
 const [b1, b2] = bySide('blue'), [r1] = bySide('red');
 assert.ok(Math.hypot(b1.x - b2.x, b1.z - b2.z) < 12, 'teammates together');
 assert.ok(Math.hypot(b1.x - r1.x, b1.z - r1.z) > 12, 'apart from the other side');
});

test('a side keeps its kills when a player leaves or a robot steps aside; a refused restart changes nothing', () => {
 const r = room();
 assert.ok(r.host.startRound('2v2'));
 const arena = r.host.arena, bot = [...arena.seats.values()].find(s => s.robot && s.team);
 const victim = [...arena.seats.values()].find(s => s.team && s.team !== bot.team);
 victim.present = true; victim.dead = false; arena.died(victim, bot);
 const side = bot.team, before = arena.teamScores().find(t => t.id === side).kills;
 assert.equal(before, 1);
 arena.dropSeat(bot.id);
 assert.equal(arena.teamScores().find(t => t.id === side).kills, 1, 'still counted');
 assert.deepEqual(arena.leaves, [bot.id]);
 r.host.setSetting('robots', 'off');
 const seats = arena.seats.size;
 assert.equal(r.host.startRound('3v3'), false);
 assert.equal(arena.seats.size, seats, 'nothing removed by a refused start');
});

test('robot setups: TUNE changes one robot, APPLY TO ALL every robot and the ones added after; its weapon is used', () => {
 const r = room({ settings: { robots: 'off' } });
 const a = r.host.addRobot(), b = r.host.addRobot();
 assert.ok(r.host.tuneRobot(a.id, { weapon: 'shotgun', skill: 'perfect', aim: 'sharper', temper: 'calm' }));
 assert.deepEqual(a.robot.setup, { weapon: 'shotgun', skill: 'perfect', aim: 'sharper', temper: 'calm' });
 assert.equal(a.robot.brain.pf.skill, 'perfect'); assert.equal(a.robot.brain.aimScale, .7);
 assert.equal(b.robot.setup.skill, 'normal', 'the other robot is untouched');
 assert.ok(r.host.tuneRobot(a.id, { skill: 'nonsense' })); assert.equal(a.robot.setup.skill, 'perfect', 'bad values keep the old');
 r.host.tuneAllRobots({ weapon: 'rifle', skill: 'rookie', aim: 'sloppier', temper: 'aggressive' });
 for (const s of [a, b]) { assert.equal(s.robot.setup.weapon, 'rifle'); assert.equal(s.robot.brain.pf.skill, 'rookie'); }
 const c = r.host.addRobot(); assert.deepEqual(c.robot.setup, { weapon: 'rifle', skill: 'rookie', aim: 'sloppier', temper: 'aggressive' });
 assert.ok(r.host.lobby().players.find(p => p.id === c.id).setup, 'the lobby shows it');
 r.host.addRobot();
 assert.ok(r.host.startRound('2v2'));
 for (let i = 0; i < 3; i++) r.tick();
 assert.ok([a, b, c].every(s => s.weapon === 'rifle'));
 r.host.setSetting('robotSkill', 'hard');
 assert.ok([a, b, c].every(s => s.robot.setup.skill === 'hard'), 'robot skill sets every robot');
});
