// The death card's NEXT LIFE row and countdown (owner, 2026-10-02: "Show the
// respawn countdown, sure. Allow for weapon swaps at each respawn."): the
// host's rules for the next life's weapon (net/arena.js chooseNext), the wire
// (protocol.js), a real host and joiner over the loopback, and the card's
// markup (ui/death-screen.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arena, people, bots, tick, start, map, createSim, seeded } from './rules-harness.js';
import { readMessage, PROTOCOL_VERSION } from '../src/net/protocol.js';
import { createLoopback } from '../src/net/transport.js';
import { HostSession } from '../src/net/host-session.js';
import { ClientSession } from '../src/net/client-session.js';
import { WEAPONS } from '../src/items.js';
import { MAINTENANCE, setMaintenanceLifted } from '../src/weapon-maintenance.js';
import { nextRowHTML, respawnCountText, DEATH_BUTTONS } from '../src/ui/death-screen.js';

const kill = (a, seat, by = null) => { seat.sim.player.hp = 0; a.died(seat, by); };
const runTo = (a, left, dt = 1 / 20) => {
 while (a.phase === 'playing' && a.clock - left > 2) a.endTick(1);
 while (a.phase === 'playing' && a.clock - dt >= left - 1e-9) a.endTick(dt);
};

test('FFA: picked while down, in hand at the respawn, and the wait is the same', () => {
 const a = arena({ mode: 'ffa', humans: 3, settings: { robots: 'off' } });
 const [host, x, y] = people(a);
 kill(a, x, host); kill(a, y, host);
 assert.equal(a.chooseNext(x.id, 'omen'), true);
 assert.equal(x.next, 'omen'); assert.equal(x.respawnIn, a.settings.respawn, 'the wait is untouched');
 assert.equal(x.picking, null, 'no pick opens: the death card stays');
 tick(a, a.settings.respawn - .3);
 assert.ok(x.dead && y.dead, 'both still down');
 tick(a, .5);
 assert.ok(x.present && !x.dead && y.present && !y.dead, 'both back on the same clock');
 assert.equal(x.weapon, 'omen'); assert.equal(x.sim.weapon, 'omen'); assert.equal(y.weapon, 'rifle', 'no pick: the same weapon');
 assert.equal(x.next, null, 'used up');
 // A second death: the last weapon again unless picked anew.
 kill(a, x, host); tick(a, a.settings.respawn + .2);
 assert.equal(x.weapon, 'omen');
 kill(a, x, host); a.chooseNext(x.id, 'sheath'); a.chooseNext(x.id, 'ichor'); tick(a, a.settings.respawn + .2);
 assert.equal(x.weapon, 'ichor', 'the last pick stands');
});

test('refused: alive, Gun Game, the round modes, after the cutoff, with a pick open, robots, maintenance, nonsense', () => {
 const a = arena({ mode: 'ffa', humans: 3 });
 const [host, x, y] = people(a);
 assert.equal(a.chooseNext(x.id, 'omen'), false, 'alive: the weapon changes only between lives');
 kill(a, x, host);
 for (const bad of ['bazooka', '', null, undefined, '__proto__', 'constructor']) assert.equal(a.chooseNext(x.id, bad), false, String(bad));
 for (const id of MAINTENANCE) assert.equal(a.chooseNext(x.id, id), false, id + ' is under maintenance');
 const robot = bots(a)[0]; if (robot) { kill(a, robot, host); assert.equal(a.chooseNext(robot.id, 'omen'), false, 'robots pick their own'); }
 // A pick open (CHANGE WEAPON's old way): the pick decides.
 kill(a, y, host); a.pickAgain(y.id);
 assert.equal(a.chooseNext(y.id, 'omen'), false);
 // After the cutoff nobody comes back: nothing to pick for.
 runTo(a, 40); kill(a, host, null);
 assert.equal(a.noRespawns, true); assert.equal(a.chooseNext(host.id, 'omen'), false);
 // Gun Game: the ladder decides.
 const g = arena({ mode: 'gungame', humans: 2, settings: { robots: 'off' } });
 const [gh, gx] = people(g); kill(g, gx, gh);
 assert.equal(g.chooseNext(gx.id, 'sheath'), false);
 gx.next = 'sheath'; tick(g, g.settings.respawn + .2);
 assert.notEqual(gx.weapon, 'sheath', 'even a stray next is ignored: the ladder\'s weapon');
 // Round modes: nobody comes back alone; the match's pick stands.
 for (const mode of ['1v1', '2v2']) {
  const r = arena({ mode, humans: 2, settings: { robots: 'fill' } });
  const [rh] = people(r); kill(r, rh, null);
  assert.equal(r.chooseNext(rh.id, 'omen'), false, mode);
 }
});

test('practice online: picked while down, in hand on RESPAWN', () => {
 const a = arena({ mode: 'practice', humans: 2 });
 const [, x] = people(a);
 kill(a, x, null);
 assert.equal(a.chooseNext(x.id, 'sidekick'), true);
 assert.equal(a.respawnNow(x.id), true);
 assert.equal(x.weapon, 'sidekick'); assert.ok(x.present && !x.dead);
});

test('a new match forgets a pick it never used', () => {
 const a = arena({ mode: 'ffa', humans: 2, settings: { robots: 'off' } });
 const [host, x] = people(a);
 kill(a, x, host); a.chooseNext(x.id, 'omen');
 assert.ok(a.startRound('ffa'));
 assert.equal(x.next, null);
});

test('maintenance lifted: the weapon may be picked again', () => {
 const a = arena({ mode: 'ffa', humans: 2, settings: { robots: 'off' } });
 const [host, x] = people(a);
 kill(a, x, host);
 setMaintenanceLifted(true);
 try { assert.equal(a.chooseNext(x.id, MAINTENANCE[0]), true); } finally { setMaintenanceLifted(false); }
});

test('the wire: { t: choose, next: true } (protocol 28, no bump); a junk weapon is read as nothing', () => {
 assert.equal(PROTOCOL_VERSION, 28);
 assert.deepEqual(readMessage({ t: 'choose', weapon: 'omen', next: true }), { t: 'choose', next: true, weapon: 'omen' });
 assert.deepEqual(readMessage({ t: 'choose', weapon: 'nope', next: true }), { t: 'choose', next: true, weapon: null });
 assert.deepEqual(readMessage({ t: 'choose', weapon: 'omen' }), { t: 'choose', weapon: 'omen', go: true }, 'the old pick unchanged');
 assert.equal(readMessage({ t: 'choose', weapon: 'omen', next: 'yes' }).next, undefined, 'only a real true');
});

test('host and joiner: the joiner picks on its death card, the host records it (you.next), the joiner comes back with it', () => {
 const net = createLoopback(); let time = 0; const now = () => time;
 const hostSim = createSim(map);
 const host = new HostSession({ transport: net.host('ABCDE'), map, local: hostSim, createSim, now, name: 'Hosty', random: seeded(7), settings: { robots: 'off' } });
 const sim = createSim(map), c = new ClientSession({ transport: net.join('ABCDE'), map, local: sim, createSim, now, name: 'P0' });
 net.flush();
 const step = () => { time += 1 / 60; hostSim.step(host.beforeLocal({})); sim.step(c.input({})); sim.drainEvents(); net.flush(); host.step(); hostSim.drainEvents(); net.flush(); };
 host.startRound('ffa'); host.choose('static'); c.choose('rifle'); net.flush();
 for (let i = 0; i < 10; i++) step();
 const seat = [...host.remotes.values()][0].seat;
 assert.ok(seat.present && !seat.dead);
 // Alive: refused by the host.
 c.chooseNext('omen'); net.flush(); step();
 assert.equal(seat.next ?? null, null);
 host.arena.died(seat, host.arena.seats.get('host'));
 for (let i = 0; i < 6; i++) step();
 c.chooseNext('omen'); net.flush();
 for (let i = 0; i < 6; i++) step();
 assert.equal(seat.next, 'omen');
 assert.equal(c.me.next, 'omen', 'the joiner sees the host\'s record');
 for (let i = 0; i < 60 * host.arena.settings.respawn; i++) step();
 assert.ok(seat.present && !seat.dead); assert.equal(seat.weapon, 'omen');
 assert.equal(sim.weapon, 'omen', 'the joiner\'s own sim comes back with it');
 // The host's own seat too.
 host.arena.died(host.arena.seats.get('host'), seat);
 assert.equal(host.chooseNext('sheath'), true);
});

test('the card: CHANGE WEAPON gave way to the NEXT LIFE row; one tile per weapon, keys 1-8, stickers kept', () => {
 for (const mode of ['practice', 'online-practice', 'ffa', 'duel', 'team']) assert.ok(!DEATH_BUTTONS[mode].includes('death-change-weapon'), mode);
 const html = nextRowHTML();
 for (const [i, w] of WEAPONS.entries()) {
  assert.ok(html.includes(`data-weapon="${w.id}"`), w.id);
  if (i < 9) assert.ok(html.includes(`<kbd class="death-next-key">${i + 1}</kbd>`), 'key ' + (i + 1));
 }
 for (const id of MAINTENANCE) assert.ok(html.includes(`data-maintenance="${id}"`), id + ' keeps its sticker');
 assert.equal((html.match(/role="radio"/g) || []).length, WEAPONS.length);
 assert.equal(respawnCountText(4.2), '5'); assert.equal(respawnCountText(3.9), '4'); assert.equal(respawnCountText(0), 'now');
 const src = readFileSync(new URL('../src/ui/death-screen.js', import.meta.url), 'utf8');
 assert.ok(src.includes('<span class="death-respawn-label">respawn in</span>'), 'RESPAWN IN');
});

test('main.js: the row in every card with a respawn of your own, the ladder in Gun Game, none in the rounds, the tutorial or past the cutoff', () => {
 const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
 const view = main.slice(main.indexOf('function nextLifeView(){'), main.indexOf('function pickNextLife('));
 assert.ok(view.includes("if(!['practice','online-practice','ffa'].includes(mode)||map.training)return null;"));
 assert.ok(view.includes("['late','closed'].includes(myRespawnFate())"), 'not once respawns close');
 assert.ok(view.includes('const gun=gunNow();if(gun)return {ladder:'), 'Gun Game: the ladder\'s weapon');
 const pick = main.slice(main.indexOf('function pickNextLife('), main.indexOf('// Your part of the end card'));
 assert.ok(pick.includes('online.chooseNext(weapon)') && pick.includes('else nextWeapon=weapon'), 'online through the host, solo and BOTS on the next respawn');
 // Solo practice and BOTS FFA put nextWeapon in hand as they respawn.
 const respawn = main.slice(main.indexOf('function respawnPractice(){'), main.indexOf('function syncOnlineScreens'));
 assert.ok(respawn.includes('if(nextWeapon){sim.weapon=weaponOrDefault(nextWeapon);nextWeapon=null;'));
});
