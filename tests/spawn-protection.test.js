// Spawn protection (owner, 2026-10-01: "... and the spawn protection";
// approved: about 1.5 s that ends early if you shoot, attack or use an
// ability). spawn-protection.js, Simulation (step, hit, damagePlayer), the
// online arena (granted on every way back in but an elimination round's,
// blocks a joiner's shots, carried on the wire), BotMatch (robots back after
// their wait).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPAWN_PROTECTION } from '../src/config/gameplay.js';
import { ATTACK_PRESSES, grantSpawnGuard, stepSpawnGuard, guarded, guardFlag, attacking } from '../src/spawn-protection.js';
import { Simulation } from '../src/simulation.js';
import { maps } from '../src/maps.js';
import { BotMatch } from '../src/bots/bot-match.js';
import { playerState, PROTOCOL_VERSION } from '../src/net/protocol.js';
import { blend, SHARED_EVENTS } from '../src/net/host-session.js';
import { arena, people, tick } from './rules-harness.js';

const map = maps.deadwater;

test('1.5 seconds, in config with the owner quote', () => {
 assert.equal(SPAWN_PROTECTION.time, 1.5);
 assert.ok(Object.isFrozen(SPAWN_PROTECTION));
});

test('it runs down over its time and is gone (no field left) when it ends', () => {
 const p = { hp: 100, dead: false };
 grantSpawnGuard(p);
 assert.equal(p.guard, 1.5); assert.ok(guarded(p));
 let ticks = 0, ended = false;
 while (!ended && ticks < 200) { ended = stepSpawnGuard(p, { moveX: 1, aiming: true, dodge: true, reload: true, ichorGuard: true, sightlineStance: true }, 1 / 60); ticks++; }
 assert.equal(ticks, 90, 'moving, aiming, dodging, reloading, guarding and the stance never end it: 90 ticks at 60 Hz');
 assert.equal('guard' in p, false); assert.equal(guarded(p), false);
 assert.equal(guardFlag(p), null);
});

test('any attack or ability press ends it at once, for every weapon', () => {
 for (const key of ATTACK_PRESSES) {
  const p = { hp: 100 }; grantSpawnGuard(p);
  assert.ok(attacking({ [key]: true }), key);
  assert.equal(stepSpawnGuard(p, { [key]: true }, 1 / 60), true, key);
  assert.equal(p.guard, undefined, key);
 }
 // Every weapon's own presses are in the list.
 for (const key of ['fire', 'launch', 'seed', 'spray', 'hex', 'grenade', 'surge', 'scatter', 'doubleShot', 'sheathE', 'sheathX', 'ichorE', 'ichorX', 'sidekickMine', 'sidekickX', 'sightlineX', 'omenPrime', 'omenVolley']) assert.ok(ATTACK_PRESSES.includes(key), key);
 // Not on a dead body; nothing for nothing.
 const dead = { dead: true }; grantSpawnGuard(dead); assert.equal(dead.guard, undefined);
 const p = { hp: 100 }; grantSpawnGuard(p, 0); assert.equal(p.guard, undefined);
});

test('the sim: a protected stand-in takes no shots (guardBlock instead), the world still hurts', () => {
 const sim = new Simulation(map); sim.reset();
 const target = { id: 'foe', kind: 'player', x: 3, z: 0, hp: 100, maxHp: 100, guard: true };
 sim.hit(target, { damage: 30, owner: sim.player.id, volley: 1 });
 assert.equal(target.hp, 100);
 const events = sim.drainEvents();
 assert.ok(events.some(e => e.type === 'guardBlock' && e.id === 'foe'));
 assert.ok(!events.some(e => e.type === 'hit' || e.type === 'outgoingDamage'), 'no hit marker, no damage number');
 sim.hit(target, { damage: 5, owner: 'crop-fire', environmental: true });
 assert.equal(target.hp, 95, 'fire still burns');
 delete target.guard;
 sim.hit(target, { damage: 30, owner: sim.player.id, volley: 2 });
 assert.equal(target.hp, 65, 'unprotected: the shot lands');
});

test('the sim: your own protected body takes nothing from others, but the storm and your own blast get through', () => {
 const sim = new Simulation(map); sim.reset();
 grantSpawnGuard(sim.player);
 assert.equal(sim.damagePlayer(40, 'someone', false, false, { x: 1, z: 0 }, 'gunshot'), 0);
 assert.equal(sim.player.hp, 100);
 assert.ok(sim.damagePlayer(2, 'storm', true, false, null, 'storm') > 0, 'the storm');
 assert.ok(sim.damagePlayer(5, sim.player.id, false, true, { x: 1, z: 0 }, 'explosion') > 0, 'your own blast');
 // Firing ends it, then shots land.
 sim.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, fire: true });
 assert.equal(sim.player.guard, undefined);
 assert.ok(sim.damagePlayer(10, 'someone', false, false, { x: 1, z: 0 }, 'gunshot') > 0);
 // A death clears it; a respawn starts clean (only a grant gives it).
 grantSpawnGuard(sim.player); sim.killPlayer();
 assert.equal(sim.player.guard, undefined);
 sim.respawn({ x: 0, z: 0 });
 assert.equal(sim.player.guard, undefined);
});

test('online FFA: back in after a death with protection; shots at it do nothing until it attacks or the time is up', () => {
 const a = arena({ humans: 2, mode: 'ffa', settings: { robots: 'off', storm: 'off' } });
 const [host, p1] = people(a);
 assert.ok(host.sim.player.guard > 0, 'the first way in is protected too in FFA');
 // A death and the respawn wait.
 host.sim.player.hp = 0; a.died(host, p1);
 tick(a, a.settings.respawn + .2);
 assert.ok(!host.dead, 'back in');
 assert.equal(host.sim.player.guard, SPAWN_PROTECTION.time);
 // p1 shoots at host's stand-in: blocked.
 a.before(p1);
 const proxy = p1.sim.targets.find(t => t.id === host.id);
 assert.equal(proxy.guard, true);
 p1.sim.hit(proxy, { damage: 50, owner: p1.id, volley: 9 });
 a.after(p1);
 assert.equal(host.sim.player.hp, a.settings.health);
 // Its own attack ends it.
 a.stepSeat(host, { fire: true, aimX: 1, aimZ: 0 });
 assert.equal(host.sim.player.guard, undefined);
});

test('elimination rounds: nobody is protected (everyone comes in together)', () => {
 const a = arena({ humans: 2, mode: '1v1', settings: { robots: 'off' } });
 for (const s of people(a)) assert.equal(s.sim.player.guard, undefined, s.id);
});

test('the wire: player states carry `guard` only while it runs, blend passes it on, guardBlock is shared, protocol 28', () => {
 assert.ok(PROTOCOL_VERSION >= 28);
 const p = { x: 1, z: 2, aimX: 1, aimZ: 0, stamina: 1, hp: 100, maxHp: 100 };
 assert.equal('guard' in playerState('a', p), false);
 p.guard = 1.234567;
 assert.equal(playerState('a', p).guard, 1.23);
 const drawn = blend('a', 'A', { ...p }, { ...p, guard: .8 }, .5);
 assert.equal(drawn.guard, .8);
 assert.equal('guard' in blend('a', 'A', p, { ...p, guard: 0 }, .5), false);
 for (const type of ['guardBlock', 'shotgunReloaded', 'omenReloaded']) assert.ok(SHARED_EVENTS.has(type), type);
});

test('BotMatch: a robot back after its wait is protected; your shots at it are blocked; drawn with its shimmer', () => {
 const you = new Simulation(map); you.reset(); you.weapon = 'rifle';
 const bots = new BotMatch(map, { createSim: m => new Simulation(m), random: () => .5 });
 const bot = bots.spawn(you, 'rifle');
 bot.sim.player.hp = 0; bot.sim.killPlayer();
 const tickAll = () => { bots.before(you); you.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0 }); bots.after(you); bots.step(you); };
 tickAll();
 assert.equal(bot.alive, false, 'down');
 for (let i = 0; i < 60 * 6 && !bot.alive; i++) tickAll();
 assert.ok(bot.alive, 'it came back');
 assert.ok(bot.sim.player.guard > 0, 'protected');
 assert.ok(bots.others().find(o => o.id === bot.id).guard > 0, 'drawn protected');
 bots.before(you);
 const proxy = you.targets.find(t => t.id === bot.id);
 assert.equal(proxy.guard, true);
 you.hit(proxy, { damage: 50, owner: you.player.id, volley: 3 });
 bots.after(you);
 assert.equal(bot.sim.player.hp, bot.sim.player.maxHp);
 // Its death went into the log the feel layer reads.
 assert.ok(bots.deaths.some(d => d.victim === bot.id));
});
