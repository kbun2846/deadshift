import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { maps } from '../src/maps.js';
import { BotMatch } from '../src/bots/bot-match.js';

// SOLO stats (stats-panel.js): kills, deaths, damage dealt and taken for you
// and every robot, kept by BotMatch.
const map = maps.deadwater;
let seed = 11; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const tick = (you, bots, input = { moveX: 0, moveZ: 0, aimX: 1, aimZ: 0 }) => { bots.before(you); you.step(input); bots.after(you); bots.step(you); bots.drain(); };
const world = () => { const you = new Simulation(map); you.weapon = 'rifle'; you.reset(); you.player.id = 'you'; const bots = new BotMatch(map, { createSim: m => new Simulation(m), random }); return { you, bots }; };

test('shooting a robot counts your damage dealt and its damage taken, then your kill and its death', () => {
 const { you, bots } = world();
 const bot = bots.spawn(you, 'rifle', { team: 'red' });
 bot.sim.player.x = you.player.x + 3; bot.sim.player.z = you.player.z; bot.sim.player.vx = bot.sim.player.vz = 0;
 bots.holdRespawns = true;
 for (let i = 0; i < 1200 && bot.stats.deaths === 0; i++) { bot.sim.player.x = you.player.x + 3; bot.sim.player.z = you.player.z; tick(you, bots, { moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, aimPointX: bot.sim.player.x, aimPointZ: bot.sim.player.z, fire: you.rifle.ammo > 0, reload: you.rifle.ammo <= 0 }); } // (a 20-round magazine since 2026-09-29: it reloads)
 assert.equal(bot.stats.deaths, 1, 'the robot fell once');
 assert.equal(bots.youStats.kills, 1, 'you get the kill');
 assert.ok(bots.youStats.dealt > 0 && bot.stats.taken > 0);
 assert.ok(Math.abs(bots.youStats.dealt - bot.stats.taken) < 1e-6, 'what you dealt is what it took');
 const before = JSON.stringify(bots.youStats);
 for (let i = 0; i < 120; i++) tick(you, bots);
 assert.equal(bot.stats.deaths, 1, 'a fallen robot is counted once');
 assert.equal(JSON.stringify(bots.youStats), before, 'nothing more is credited to you');
});

test('robots hurt you and kill you: their damage dealt, your damage taken, your death and their kill', () => {
 const { you, bots } = world();
 const bot = bots.spawn(you, 'rifle', { team: 'red' });
 for (let i = 0; i < 60 * 90 && !bots.youStats.deaths; i++) tick(you, bots);
 assert.equal(bots.youStats.deaths, 1, 'you died once');
 assert.equal(bot.stats.kills, 1, 'the robot that hurt you gets the kill');
 assert.ok(bots.youStats.taken > 0 && bot.stats.dealt > 0);
 assert.ok(Math.abs(bots.youStats.taken - bot.stats.dealt) < 1e-6);
 for (let i = 0; i < 60 * 3; i++) tick(you, bots);
 assert.equal(bots.youStats.deaths, 1, 'lying dead is not another death');
});

test('robots fighting each other: the kill goes to the last robot that hurt the victim, never to a friend', () => {
 const { you, bots } = world(); you.dev.invulnerable = true;
 const a = bots.spawn(you, 'rifle', { team: 'red' }), b = bots.spawn(you, 'rifle', { team: 'blue' });
 bots.holdRespawns = true;
 b.lastHitBy = a.id; b.lastHitAt = bots.clock; b.sim.damagePlayer(9999, a.id);
 tick(you, bots);
 assert.equal(b.stats.deaths, 1); assert.equal(a.stats.kills, 1);
 // A friend's hit is no kill.
 const c = bots.spawn(you, 'rifle', { team: 'blue' });
 c.lastHitBy = b.id; c.lastHitAt = bots.clock; c.sim.damagePlayer(9999, b.id);
 tick(you, bots);
 assert.equal(c.stats.deaths, 1); assert.equal(b.stats.kills, 0, 'no credit for a friend');
 // An old hit no longer counts (a fall, fire).
 const d = bots.spawn(you, 'rifle', { team: 'red' });
 d.lastHitBy = b.id; d.lastHitAt = bots.clock - 60; d.sim.damagePlayer(9999, 'dev');
 tick(you, bots);
 assert.equal(d.stats.deaths, 1); assert.equal(b.stats.kills, 0, 'nor for a hit long ago');
});

test('resetStats and clear zero everything; statsRows has the panel shape', () => {
 const { you, bots } = world();
 const bot = bots.spawn(you, 'rifle', { team: 'red' }), ally = bots.spawn(you, 'shotgun', { team: 'blue' });
 bot.stats.kills = 3; bot.stats.deaths = 2; bot.stats.dealt = 250.4; bot.stats.taken = 10; bots.youStats.kills = 5;
 const rows = bots.statsRows(you, 'Aadharsa');
 assert.equal(rows.length, 3);
 assert.deepEqual(rows[0], { id: 'you', name: 'Aadharsa', slot: 0, team: 'blue', robot: false, kills: 5, deaths: 0, dealt: 0, taken: 0, weapon: 'rifle', present: true });
 assert.equal(rows[1].id, bot.id); assert.equal(rows[1].team, 'red'); assert.equal(rows[1].robot, true); assert.equal(rows[1].dealt, 250); assert.equal(rows[1].kills, 3); assert.equal(rows[1].slot, bot.slot); assert.equal(rows[1].name, bot.name);
 assert.equal(rows[2].team, 'blue');
 assert.equal(bots.statsRows(you)[0].name, 'YOU');
 bots.resetStats();
 assert.deepEqual(bots.statsRows(you).map(r => [r.kills, r.deaths, r.dealt, r.taken]), [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
 bot.stats.kills = 1; bots.youStats.deaths = 4; bots.clear();
 assert.equal(bots.youStats.deaths, 0); assert.equal(bots.statsRows(you).length, 1);
 // An FFA robot game has no sides on the rows.
 const f = bots.spawn(you, 'rifle', { team: 'ffa' });
 assert.equal(bots.statsRows(you)[0].team, null); assert.equal(bots.statsRows(you)[1].team, null); assert.equal(f.stats.kills, 0);
});
