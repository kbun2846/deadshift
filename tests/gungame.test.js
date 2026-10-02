// Gun Game (2026-10-01, owner: "Add the Gun Game as a multiplayer mode";
// "each kill moves you to the next weapon, first through all of them wins"):
// the ladder, progression, the blade's demotion, the win, no weapon pick,
// respawns on the ladder's weapon, robots changing weapons, the clock's end,
// the scoreboard and results, the HUD's pure parts, and a real game server
// room with two sockets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { maps } from '../src/maps.js';
import { Simulation } from '../src/simulation.js';
import { createLoopback } from '../src/net/transport.js';
import { HostSession } from '../src/net/host-session.js';
import { ClientSession } from '../src/net/client-session.js';
import { PROTOCOL_VERSION } from '../src/net/protocol.js';
import { MODES, GUNGAME, SETTINGS, ROUNDED, COUNTED, FREE_FOR_ALL, syphonAmount, respawnsClosed, modeById } from '../src/config/match.js';
import { eliminationMode } from '../src/net/arena.js';
import { WEAPONS } from '../src/items.js';
import { MAINTENANCE, setMaintenanceLifted } from '../src/weapon-maintenance.js';
import { gunLadder, ladderWeapon, afterKill, afterDeath, gunStandings, isMelee, ladderText } from '../src/gungame.js';
import { gunHudView, gunCue, gunLineHTML } from '../src/ui/gungame-hud.js';
import { statsTableHTML, sortStatsRows } from '../src/ui/stats-panel.js';
import { onlineOutcome } from '../src/ui/match-end.js';
import { stormMode } from '../src/storm.js';

const map = maps.deadwater, createSim = m => new Simulation(m);
const seeded = seed => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };

function room({ clients = 0, settings = { robots: 'off' }, start = true } = {}) {
 const net = createLoopback(), hostSim = createSim(map); let time = 0;
 const host = new HostSession({ transport: net.host('ABCDE'), map, local: hostSim, createSim, now: () => time, name: 'Hosty', random: seeded(5), settings });
 const joined = [];
 for (let i = 0; i < clients; i++) { const sim = createSim(map); joined.push({ sim, session: new ClientSession({ transport: net.join('ABCDE'), map, local: sim, createSim, now: () => time, name: 'P' + i }) }); }
 net.flush();
 const tick = (n = 1) => {
  for (let k = 0; k < n; k++) {
   time += 1 / 60;
   hostSim.step(host.beforeLocal({}));
   joined.forEach(c => { c.sim.step(c.session.input({})); c.sim.drainEvents(); });
   net.flush(); host.step(); hostSim.drainEvents(); net.flush();
  }
 };
 if (start) { assert.ok(host.startRound('gungame'), host.startError); tick(3); }
 return { net, host, hostSim, joined, tick, arena: host.arena };
}
// A seat brought down by `by` (null: nobody), as transferDamage does.
const kill = (arena, seat, by) => { seat.sim.player.hp = 0; arena.died(seat, by); };
const ladder = () => gunLadder();

test('the mode: GUN GAME is a ready, counted, everyone-for-themselves mode with FFA\'s clock, respawn and storm', () => {
 const entry = modeById('gungame');
 assert.equal(entry.name, 'GUN GAME'); assert.ok(entry.ready); assert.equal(entry.teams, 0); assert.equal(entry.fillTo, 4);
 assert.ok(MODES.some(m => m.id === 'gungame'));
 assert.ok(COUNTED.includes('gungame') && FREE_FOR_ALL.includes('gungame') && !ROUNDED.includes('gungame'));
 assert.equal(eliminationMode('gungame'), false);
 for (const key of ['roundLength', 'respawn', 'storm', 'robots']) assert.ok(SETTINGS[key].modes.includes('gungame'), key);
 for (const key of ['rounds', 'killLimit', 'spawnMode']) assert.ok(!SETTINGS[key].modes.includes('gungame'), key);
 assert.ok(stormMode('gungame'));
 assert.equal(syphonAmount('gungame', 30, 100), 50);
 assert.equal(respawnsClosed('gungame', 10), false, 'no respawn cutoff: the ladder decides it');
 assert.equal(PROTOCOL_VERSION, 28);
});

test('the ladder: every registered weapon once, easiest first, the blades last; maintenance and new weapons', () => {
 const ids = WEAPONS.map(w => w.id);
 setMaintenanceLifted(true);
 try {
  const all = ladder();
  assert.deepEqual([...all].sort(), [...ids].sort(), 'every weapon, once');
  assert.deepEqual(all, [...GUNGAME.ladder]);
  assert.equal(all[0], 'rifle');
  assert.ok(isMelee(all.at(-1)) && isMelee(all.at(-2)), 'ends on the blades: a melee finish');
  assert.equal(all.at(-1), 'sheath');
 } finally { setMaintenanceLifted(false); }
 // Under maintenance: skipped (nobody may hold it).
 const live = ladder();
 for (const id of MAINTENANCE) assert.ok(!live.includes(id), id);
 assert.equal(live.length, ids.length - MAINTENANCE.length);
 // A weapon not in the configured order joins before the blades.
 const grown = gunLadder({ weapons: [...ids, 'newgun'], playable: () => true });
 assert.equal(grown.indexOf('newgun'), grown.indexOf('ichor') - 1);
 assert.equal(grown.at(-1), 'sheath');
 assert.equal(ladderWeapon(live, -3), live[0]); assert.equal(ladderWeapon(live, 99), live.at(-1));
 assert.equal(ladderText(3, 8), '4/8');
});

test('the rules on their own: a kill moves up one; the last weapon wins only with it in hand; a blade kill demotes', () => {
 const L = ['a', 'b', 'c'];
 assert.deepEqual(afterKill(L, 0, 'a'), { level: 1, won: false, moved: true });
 assert.deepEqual(afterKill(L, 1, 'b'), { level: 2, won: false, moved: true });
 assert.deepEqual(afterKill(L, 2, 'c'), { level: 2, won: true, moved: false });
 assert.deepEqual(afterKill(L, 2, 'b'), { level: 2, won: false, moved: false }, 'same tick as the swap: made with the old weapon');
 assert.equal(afterDeath(3, 'sheath'), 2); assert.equal(afterDeath(3, 'ichor'), 2);
 assert.equal(afterDeath(0, 'sheath'), 0, 'never below the first weapon');
 assert.equal(afterDeath(3, 'rifle'), 3); assert.equal(afterDeath(3, null), 3, 'the storm or your own blast costs nothing');
 assert.equal(afterDeath(3, 'sheath', { demotes: false }), 3, 'the config switch turns it off');
 assert.equal(GUNGAME.meleeDemotes, true);
});

test('no weapon pick: everyone (robots too) goes in on the first weapon; CHANGE WEAPON and picks are refused', () => {
 const r = room({ clients: 1, settings: { robots: 'fill' } });
 const { arena } = r, first = arena.ladder[0];
 assert.equal(arena.seats.size, 4, 'bots fill to four as in FFA');
 for (const seat of arena.seats.values()) { assert.ok(seat.present && !seat.dead, seat.id); assert.equal(seat.weapon, first); assert.equal(seat.sim.weapon, first); assert.equal(seat.picking, null); assert.equal(seat.gun, 0); }
 const joiner = r.joined[0].session;
 assert.equal(joiner.me.picking, null, 'the joiner never sees a pick');
 assert.equal(joiner.me.weapon, first); assert.equal(r.joined[0].sim.weapon, first);
 assert.equal(r.host.choose('sheath'), false); assert.equal(r.host.pickAgain(), false);
 joiner.choose('sheath'); joiner.pickAgain(); r.tick(3);
 assert.equal(joiner.me.weapon, first, 'a pick sent anyway changes nothing');
 const m = joiner.match();
 assert.equal(m.mode, 'gungame'); assert.equal(m.timed, true); assert.equal(m.killLimit, 0);
 assert.deepEqual(m.gun.ladder, arena.ladder);
 assert.ok(Object.values(m.gun.levels).every(v => v === 0) && Object.keys(m.gun.levels).length === 4);
 assert.ok(arena.stormPlan && arena.stormPlan.kind === 'ffa', 'the storm, as in FFA');
});

test('a kill moves the killer up one weapon at once, swapped in place, fully loaded; the joiner\'s screen follows', () => {
 const r = room({ clients: 1 });
 const { arena } = r, host = r.host.hostSeat, joinerSeat = [...r.host.remotes.values()][0].seat, L = arena.ladder;
 const at = { x: r.hostSim.player.x, z: r.hostSim.player.z }; r.hostSim.player.hp = 37; r.hostSim.rifle.ammo = 3;
 kill(arena, joinerSeat, host);
 assert.equal(host.gun, 1); assert.equal(host.weapon, L[1]); assert.equal(r.hostSim.weapon, L[1], 'the host\'s own sim swapped');
 assert.equal(r.hostSim.player.x, at.x); assert.equal(r.hostSim.player.z, at.z);
 assert.ok(r.hostSim.player.hp > 37, 'syphon still pays out (and the body is the same one)');
 assert.equal(r.hostSim.rifle.ammo, r.hostSim.rifle.capacity, 'everything of the old weapon reset');
 assert.equal(r.hostSim.player.stamina, r.hostSim.maxStamina);
 assert.equal(host.stats.kills, 1);
 // The other way round: the joiner's kill shows on its own screen without a respawn.
 joinerSeat.dead = false; joinerSeat.present = true; joinerSeat.sim.player.hp = 100; joinerSeat.sim.player.dead = false;
 r.tick(6);
 const life = r.joined[0].session.me.life;
 kill(arena, host, joinerSeat);
 r.tick(6);
 const me = r.joined[0].session.me;
 assert.equal(me.life, life, 'the same life');
 assert.equal(me.weapon, L[1]); assert.equal(r.joined[0].sim.weapon, L[1], 'the joiner\'s own sim swapped too');
 assert.equal(r.joined[0].session.match().gun.levels[r.joined[0].session.id], 1);
});

test('a blade kill knocks the victim back one weapon (from their next life); a gun kill does not', () => {
 const r = room({ clients: 1 });
 const { arena } = r, host = r.host.hostSeat, other = [...r.host.remotes.values()][0].seat, L = arena.ladder;
 other.gun = 3; host.gun = L.indexOf('ichor'); host.weapon = 'ichor'; host.held = 'ichor';
 kill(arena, other, host);
 assert.equal(other.gun, 2, 'demoted');
 assert.equal(host.gun, L.indexOf('ichor') + 1);
 other.dead = false; other.gun = 3; host.held = 'rifle';
 kill(arena, other, host);
 assert.equal(other.gun, 3, 'a gun kill keeps the victim\'s place');
});

test('a dead seat comes back on the weapon it has reached; demoted while down, it comes back on the lower one', () => {
 const r = room({ clients: 1, settings: { robots: 'off', respawn: 6 } });
 const { arena } = r, host = r.host.hostSeat, other = [...r.host.remotes.values()][0].seat, L = arena.ladder;
 other.gun = 2; host.gun = L.indexOf('sheath') - 1; host.held = host.weapon = L[host.gun];
 const melee = isMelee(host.held);
 kill(arena, other, host);
 assert.ok(other.dead && other.respawnIn > 5, 'FFA\'s respawn wait');
 r.tick(60 * 6 + 10);
 assert.ok(other.present && !other.dead, 'back');
 const want = melee ? 1 : 2;
 assert.equal(other.gun, want); assert.equal(other.weapon, L[want]); assert.equal(other.sim.weapon, L[want]);
 assert.equal(r.joined[0].session.me.weapon, L[want]);
});

test('a kill with the last weapon wins at once; two kills on the swap\'s tick do not', () => {
 const r = room({ clients: 2 });
 const { arena } = r, host = r.host.hostSeat, [a, b] = [...r.host.remotes.values()].map(x => x.seat), L = arena.ladder, last = L.length - 1;
 // One short of the end: two kills land on one tick, both made with the weapon the tick began with.
 host.gun = last - 1; host.weapon = L[last - 1]; r.hostSim.swapWeapon(host.weapon);
 arena.before(host);
 kill(arena, a, host); kill(arena, b, host);
 assert.equal(host.gun, last); assert.equal(arena.gunWinner, null, 'the second kill was not made with the last weapon');
 r.tick(2);
 assert.equal(arena.phase, 'playing');
 // Next tick, the last weapon in hand: the kill wins.
 a.dead = false; a.present = true; a.sim.player.hp = 100; a.sim.player.dead = false;
 arena.before(host);
 assert.equal(host.held, L[last]);
 kill(arena, a, host);
 assert.equal(arena.gunWinner, 'host');
 r.tick(2);
 assert.equal(arena.phase, 'results');
 const res = arena.results;
 assert.equal(res.winner.id, 'host'); assert.equal(res.gungame.finished, 'host'); assert.deepEqual(res.gungame.ladder, L);
 assert.equal(res.board[0].id, 'host'); assert.equal(res.board[0].finished, true);
 assert.ok(res.board.every(row => Number.isFinite(row.gun) && row.of === L.length));
 const seen = r.joined[0].session.match();
 assert.equal(seen.phase, 'results'); assert.equal(seen.results.gungame.finished, 'host');
 // The end card: who won and how; the table ranks by the ladder.
 const out = onlineOutcome(seen.results, { myId: r.joined[0].session.id });
 assert.match(out.title, /Hosty wins/); assert.match(out.detail, new RegExp('through all ' + L.length + ' weapons'));
 const html = statsTableHTML(seen.results.board, { mode: 'gungame', final: true });
 assert.match(html, new RegExp('>' + L.length + '/' + L.length + '<')); assert.match(html, /finished/); assert.match(html, /stats-gold/);
 // READY: a new match, everyone back on the first weapon.
 arena.setReady('host'); for (const x of r.host.remotes.keys()) arena.setReady(x);
 r.tick(3);
 assert.equal(arena.phase, 'playing'); assert.ok([...arena.seats.values()].every(s => s.gun === 0 && s.weapon === L[0]));
});

test('the clock running out: the furthest along wins (then kills); level at the top is a draw', () => {
 const r = room({ clients: 1 });
 const { arena } = r, host = r.host.hostSeat, other = [...r.host.remotes.values()][0].seat;
 host.gun = 2; other.gun = 4; host.stats.kills = 9; other.stats.kills = 4;
 arena.clock = .01; r.tick(2);
 assert.equal(arena.phase, 'results');
 assert.equal(arena.results.winner.id, other.id, 'furthest along, not most kills');
 assert.equal(arena.results.gungame.finished, null);
 assert.match(onlineOutcome(arena.results).detail, /time up/);
 const tie = room({ clients: 1 });
 const h2 = tie.host.hostSeat, o2 = [...tie.host.remotes.values()][0].seat;
 h2.gun = o2.gun = 3; h2.stats.kills = o2.stats.kills = 3;
 tie.arena.clock = .01; tie.tick(2);
 assert.equal(tie.arena.results.winner, null); assert.equal(tie.arena.results.draw, true);
 // No respawn cutoff near the end: a death at 20 s left still comes back.
 const late = room({ clients: 1, settings: { robots: 'off', respawn: 6 } });
 const o3 = [...late.host.remotes.values()][0].seat;
 late.arena.clock = 20; kill(late.arena, o3, late.host.hostSeat);
 assert.equal(late.arena.noRespawns, false);
 late.tick(60 * 6 + 5);
 assert.ok(o3.present && !o3.dead);
});

test('robots use whatever weapon they are on: a robot\'s kill swaps its weapon and it keeps fighting', () => {
 const r = room({ settings: { robots: 'fill' } });
 const { arena } = r, L = arena.ladder, bots = [...arena.seats.values()].filter(s => s.robot);
 assert.equal(bots.length, 3);
 const [bot, victim] = bots;
 assert.equal(bot.sim.weapon, L[0]);
 let retooled = 0; const was = bot.robot.brain.retool.bind(bot.robot.brain); bot.robot.brain.retool = () => { retooled++; was(); };
 kill(arena, victim, bot);
 assert.equal(bot.gun, 1); assert.equal(bot.sim.weapon, L[1]); assert.equal(retooled, 1, 'its plans for the old weapon go');
 // Climb it a few more; it keeps stepping (and firing) on each one.
 for (let k = 2; k < L.length; k++) {
  victim.dead = false; victim.present = true; victim.sim.player.hp = 100; victim.sim.player.dead = false;
  kill(arena, victim, bot);
  assert.equal(bot.sim.weapon, L[k], 'level ' + k);
  r.tick(20);
 }
 assert.equal(arena.phase, 'playing');
 // A late robot (+ BOT mid-match) comes in on the lowest weapon anyone holds.
 for (const s of arena.seats.values()) if (s !== bot) s.gun = Math.max(s.gun, 2);
 const added = r.host.addRobot(); r.tick(2);
 assert.equal(added.gun, 2); assert.equal(added.sim.weapon, L[2]);
});

test('a robots-only gun game plays itself: kills happen and robots climb the ladder', () => {
 const r = room({ start: false, settings: { robots: 'fill', storm: 'off' } });
 for (let i = 0; i < 3; i++) r.host.addRobot();
 assert.ok(r.host.startRound('gungame'));
 const arena = r.arena;
 // The host idles somewhere out of the way (the robots find each other).
 r.tick(60 * 75);
 const seats = [...arena.seats.values()], kills = seats.reduce((n, s) => n + s.stats.kills, 0);
 assert.ok(kills > 0, 'some kills in 75 s');
 const top = Math.max(...seats.map(s => s.gun));
 assert.ok(top >= 1, 'someone climbed');
 for (const s of seats) if (s.present && !s.dead) assert.equal(s.sim.weapon, arena.ladder[s.gun], s.id + ' holds its level\'s weapon');
});

test('scoreboard and results rows: the ladder ranks them; the panel shows "4/8" and kills on the line', () => {
 const rows = [
  { id: 'a', name: 'Ann', kills: 9, deaths: 1, gun: 2, of: 8 },
  { id: 'b', name: 'Bob', kills: 3, deaths: 2, gun: 5, of: 8 },
  { id: 'c', name: 'Cid', kills: 6, deaths: 0, gun: 5, of: 8 },
 ];
 assert.deepEqual(gunStandings(rows).map(r => r.id), ['c', 'b', 'a']);
 assert.deepEqual(gunStandings(rows, 'a').map(r => r.id), ['a', 'c', 'b'], 'the finisher heads it');
 assert.deepEqual(sortStatsRows(rows).map(r => r.id), ['c', 'b', 'a']);
 const html = statsTableHTML(rows, { mode: 'gungame', final: false, myId: 'b' });
 assert.match(html, />6\/8</); assert.match(html, /weapon/); assert.match(html, /<i>6<\/i> kills/);
 // Not a gun game: kills as ever.
 assert.match(statsTableHTML([{ id: 'x', name: 'X', kills: 4, deaths: 0 }], { mode: 'ffa' }), /<b>4<\/b><\/span><small>kills/);
});

test('the HUD: the ladder line and the cue, from the match state alone', () => {
 const gun = { ladder: ['rifle', 'sidekick', 'sheath'], levels: { me: 1, you: 2 } };
 const v = gunHudView(gun, 'me', 'o1');
 assert.equal(v.step, '2/3'); assert.equal(v.name, 'Sidekick'); assert.equal(v.next, 'Sheath'); assert.equal(v.last, false); assert.equal(v.leader, 2);
 const html = gunLineHTML(v);
 assert.match(html, /weapon <\/i><b>2\/3<\/b>/); assert.match(html, /next <b>Sheath<\/b>/);
 assert.equal((html.match(/<i class="done/g) || []).length, 1); assert.equal((html.match(/class="here/g) || []).length, 1); assert.match(html, /lead/);
 const end = gunHudView({ ...gun, levels: { me: 2 } }, 'me', 'o1');
 assert.equal(end.last, true); assert.equal(end.next, null); assert.match(gunLineHTML(end), /a kill wins/);
 assert.equal(gunCue(v, end), 'up'); assert.equal(gunCue(end, v), 'down'); assert.equal(gunCue(v, v), null);
 assert.equal(gunCue(v, { ...end, key: 'o2' }), null, 'a new match is no cue');
 assert.equal(gunHudView(null, 'me'), null); assert.equal(gunHudView(gun, 'nobody'), null);
});

test('the real game server: a Gun Game room with two sockets, robots filling, the ladder over the wire, a win', async () => {
 const { startServer } = await import('../server/index.js');
 const { connectServer } = await import('../src/net/socket-transport.js');
 const { SERVER } = await import('../server/config.js');
 const quiet = { log() {}, warn() {}, error() {} };
 const server = startServer({ ...SERVER, dataDir: null, listedModes: [], port: 0, allowAnyOrigin: false, adminToken: 'gun-admin-token' }, { log: quiet });
 try {
  const { port } = await server.ready, url = 'ws://127.0.0.1:' + port;
  const made = await connectServer({ url, request: { t: 'create', map: 'deadwater', mode: 'gungame', settings: {} }, pid: 'gungame-aaaa-1111' });
  const a = new ClientSession({ transport: made, map, local: createSim(map), createSim, name: 'Ann' });
  const joined = await connectServer({ url, request: { t: 'join', code: made.room.code }, pid: 'gungame-bbbb-2222' });
  const b = new ClientSession({ transport: joined, map, local: createSim(map), createSim, name: 'Bob' });
  const wait = ms => new Promise(res => setTimeout(res, ms));
  const pump = async (until, tries = 80) => { for (let i = 0; i < tries && !until(); i++) { a.local.step(a.input({})); b.local.step(b.input({})); await wait(25); } return until(); };
  assert.ok(await pump(() => a.welcomed && b.welcomed && made.room.lead));
  const room = server.rooms.find(made.room.code), arena = room.session.arena;
  assert.equal(arena.mode, 'gungame', 'the room was made in Gun Game');
  // START: the map vote (when there is more than one map), both on this map.
  made.lead('start', { mode: 'gungame' });
  await pump(() => !!a.voteNow() || a.match().phase === 'playing');
  if (a.voteNow()) { a.vote('deadwater'); b.vote('deadwater'); }
  assert.ok(await pump(() => a.match().phase === 'playing' && a.me.present && b.me.present, 160), 'in the world');
  const L = a.match().gun.ladder;
  assert.deepEqual(L, gunLadder());
  assert.equal(a.me.picking, null); assert.equal(a.me.weapon, L[0]); assert.equal(b.me.weapon, L[0]);
  assert.equal(arena.seats.size, 4, 'two players and two robots');
  assert.ok([...arena.seats.values()].filter(s => s.robot).every(s => s.weapon === L[0]));
  // (The robots step out now, so only the test's own kills move the ladder.)
  for (const s of [...arena.seats.values()].filter(x => x.robot)) room.session.removeRobot(s.id);
  // The admin page names the mode.
  const state = await (await fetch('http://127.0.0.1:' + port + '/admin/api/state', { headers: { authorization: 'Bearer gun-admin-token' } })).json();
  assert.equal(state.rooms.find(r => r.code === made.room.code).modeName, 'GUN GAME');
  // Ann kills Bob: her weapon changes in place, on her screen too.
  const ann = arena.seats.get(a.id), bob = arena.seats.get(b.id), life = a.me.life;
  kill(arena, bob, ann);
  assert.ok(await pump(() => a.me.weapon === L[1]));
  assert.equal(a.me.life, life); assert.equal(a.local.weapon, L[1]); assert.equal(a.match().gun.levels[a.id], 1);
  // Bob asks for a weapon anyway: refused.
  b.choose('sheath'); b.pickAgain();
  // Ann on the last weapon, a kill: she wins.
  bob.dead = false; bob.present = true; bob.sim.player.hp = 100; bob.sim.player.dead = false; bob.respawnIn = 0;
  ann.gun = L.length - 1; ann.weapon = L.at(-1); ann.sim.swapWeapon(ann.weapon); ann.held = ann.weapon;
  // (Between ticks: the loop's before() sets `held` from the sim, the last weapon now.)
  kill(arena, bob, ann);
  assert.ok(await pump(() => a.match().phase === 'results'));
  const res = a.match().results;
  assert.equal(res.winner.id, a.id); assert.equal(res.gungame.finished, a.id);
  assert.equal(res.board[0].id, a.id);
  assert.ok(res.board.every(row => row.of === L.length));
  a.close(); b.close();
 } finally { await server.close(); }
});

// BOTS (duel.js): you and five robots on the ladder.
const el = () => ({ hidden: false, className: '', innerHTML: '', textContent: '', classList: { add() {}, remove() {}, contains: () => true, toggle() {} }, setAttribute() {}, append() {}, querySelector: () => el(), focus() {} });
async function solo() {
 const { BotMatch } = await import('../src/bots/bot-match.js');
 const { createDuel, DUEL_MODES } = await import('../src/duel.js');
 const sim = createSim(map), bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(4) });
 const given = [], cards = [];
 const duel = createDuel(el(), { sim, bots, random: seeded(5), hooks: { gunWeapon: (w, now) => { given.push([w, now]); if (now) sim.swapWeapon(w); else sim.nextWeapon = w; }, over: o => cards.push(o) } });
 return { sim, bots, duel, given, cards, DUEL_MODES };
}

test('BOTS Gun Game: five robots and you on the first weapon; your kill swaps yours; a robot\'s swaps its own; a blade demotes', async () => {
 const previous = globalThis.document; globalThis.document = { createElement: el };
 try {
  const { sim, bots, duel, given, DUEL_MODES } = await solo();
  assert.deepEqual(DUEL_MODES.gungame, { name: 'GUN GAME', allies: 0, enemies: 5, ffa: true, gungame: true });
  sim.weapon = 'sheath'; sim.respawn({ x: 0, z: 0 });
  duel.begin({ mode: 'gungame', length: 300 });
  const L = duel.gunState().ladder;
  assert.equal(bots.bots.length, 5);
  assert.ok(bots.bots.every(b => b.sim.weapon === L[0]), 'robots on the first weapon');
  assert.equal(sim.weapon, L[0], 'yours too, whatever the menu had'); assert.deepEqual(given.at(-1), [L[0], true]);
  assert.equal(duel.noRespawns, false);
  const [r1, r2] = bots.bots;
  // You kill a robot: the next weapon now.
  bots.onKill(null, r1);
  assert.equal(sim.weapon, L[1]); assert.equal(duel.gunState().levels.you, 1);
  // A robot kills another: its weapon swaps in place.
  bots.onKill(r2, r1);
  assert.equal(r2.sim.weapon, L[1]); assert.equal(duel.gunState().levels[r2.id], 1);
  // A blade kill on you knocks you back (from your next life).
  sim.player.dead = true; sim.player.hp = 0;
  const blade = bots.bots[2];
  // (It climbs to the first blade.)
  for (let i = 0; i < L.indexOf('ichor'); i++) { bots.clock += 1; bots.onKill(blade, r1); }
  assert.equal(blade.sim.weapon, 'ichor');
  bots.clock += 1; bots.onKill(blade, null);
  assert.equal(duel.gunState().levels.you, 0); assert.deepEqual(given.at(-1), [L[0], false], 'from your next life');
  // A robot knocked back while down comes back on the lower weapon.
  r2.alive = false; r2.sim.player.dead = true; r2.sim.player.hp = 0;
  bots.clock += 1; bots.onKill(blade, r2);
  assert.equal(duel.gunState().levels[r2.id], 0); assert.equal(r2.sim.weapon, L[1], 'not while down');
  bots.respawnAt(r2, sim);
  assert.equal(r2.sim.weapon, L[0]); assert.ok(r2.alive);
  // The stats rows carry the ladder.
  const rows = bots.statsRows(sim);
  assert.ok(rows.every(r => r.of === L.length && Number.isFinite(r.gun)));
  duel.stop();
 } finally { globalThis.document = previous; }
});

test('BOTS Gun Game: a kill with the last weapon ends it (the card says so); the clock: furthest along; restart puts everyone back', async () => {
 const previous = globalThis.document; globalThis.document = { createElement: el };
 try {
  const { sim, bots, duel, cards } = await solo();
  duel.begin({ mode: 'gungame', length: 300 });
  const L = duel.gunState().ladder, [a, b] = bots.bots;
  for (let i = 0; i < L.length - 1; i++) { bots.clock += 1; bots.onKill(a, b); }
  assert.equal(a.sim.weapon, L.at(-1)); assert.equal(duel.over, false, 'on the last weapon, not yet won');
  // Two kills on one tick: the second was not made with the last weapon.
  bots.onKill(a, b); duel.frame(.016);
  assert.equal(duel.over, false, 'the kill on the swap\'s tick does not win');
  bots.clock += 1; bots.onKill(a, b);
  duel.frame(.016);
  assert.equal(duel.over, true); assert.equal(duel.score.winner, 'robot');
  duel.frame(2);
  assert.equal(cards.length, 1); assert.equal(cards[0].gungame.finished, a.id); assert.equal(cards[0].robot, L.length);
  const { soloOutcome } = await import('../src/ui/match-end.js');
  assert.match(soloOutcome(cards[0]).detail, new RegExp('through all ' + L.length));
  const rows = bots.statsRows(sim);
  assert.equal(statsTableHTML(rows, { mode: 'gungame', final: true }).indexOf(a.name) < statsTableHTML(rows, { mode: 'gungame', final: true }).indexOf('YOU'), true, 'the finisher first');
  // Restart: everyone back on the first weapon.
  duel.reset();
  assert.ok(bots.bots.every(x => x.sim.weapon === L[0])); assert.equal(sim.weapon, L[0]);
  assert.ok(Object.values(duel.gunState().levels).every(v => v === 0));
  // The clock: you two up, the best robot one: you win.
  bots.clock += 1; bots.onKill(null, a); bots.clock += 1; bots.onKill(null, a); bots.clock += 1; bots.onKill(b, a);
  duel.frame(301);
  assert.equal(duel.score.winner, 'you');
  duel.stop();
  assert.equal(duel.gunState(), null); assert.equal(bots.rowExtra, null);
 } finally { globalThis.document = previous; }
});
