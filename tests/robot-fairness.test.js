import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { maps } from '../src/maps.js';
import { BotMatch } from '../src/bots/bot-match.js';
import { SKILLS } from '../src/bots/robot-profile.js';
import { PLATES } from '../src/bots/robot-wear.js';
import { openSpot } from '../src/net/spawn-points.js';
import { isPlayable } from '../src/playable-area.js';

const map = maps.deadwater;
const seeded = s => () => (s = (s * 16807) % 2147483647) / 2147483647;

test('robots come in well away from you and apart from each other', () => {
 const you = new Simulation(map), bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(3) });
 for (let i = 0; i < 4; i++) bots.spawn(you, null, { team: 'ffa' });
 for (const b of bots.bots) assert.ok(Math.hypot(b.sim.player.x - you.player.x, b.sim.player.z - you.player.z) >= 20, 'an enemy robot spawned close to you');
 const ally = bots.spawn(you, null, { team: 'blue' });
 assert.ok(Math.hypot(ally.sim.player.x - you.player.x, ally.sim.player.z - you.player.z) < 8, 'an ally comes in beside you');
});

test('nobody is a dead shot: every skill misses now and then, the best rarely', () => {
 assert.ok(SKILLS.easy.miss > SKILLS.normal.miss && SKILLS.normal.miss > SKILLS.hard.miss && SKILLS.hard.miss > 0);
});

test('a robot does not see what is behind it past a few metres', () => {
 const you = new Simulation(map), bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(9) });
 const bot = bots.spawn(you, 'rifle', { team: 'ffa' });
 // Stand it 16 m away, facing away from you, in the open.
 const p = bot.sim.player; p.x = you.player.x + 16; p.z = you.player.z; p.aimX = 1; p.aimZ = 0; bot.brain.aimAngle = 0;
 bot.brain.sense(1 / 60, { enemies: [{ id: you.player.id, human: true, x: you.player.x, z: you.player.z, vx: 0, vz: 0, hp: 500, maxHp: 500 }], noises: [] });
 assert.equal(bot.brain.memory.get(you.player.id)?.visible, false);
});

test('a target others are already on is less tempting', () => {
 const you = new Simulation(map), bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(4) });
 const bot = bots.spawn(you, 'rifle', { team: 'ffa' }), brain = bot.brain, p = bot.sim.player;
 brain.memory.set('a', { id: 'a', human: true, x: p.x + 8, z: p.z, vx: 0, vz: 0, seen: 0, visible: true, hp: 500, maxHp: 500 });
 brain.memory.set('b', { id: 'b', x: p.x + 10, z: p.z, vx: 0, vz: 0, seen: 0, visible: true, hp: 500, maxHp: 500 });
 brain.think({ enemies: [], targeting: new Map() });
 assert.equal(brain.targetId, 'a', 'the nearer one, with nobody else on it');
 brain.targetId = null; brain.think({ enemies: [], targeting: new Map([['a', 2]]) });
 assert.equal(brain.targetId, 'b', 'two others on you: it takes the other robot');
});

test('practice spawns: a random open spot in the playable area', () => {
 const sim = new Simulation(map), random = seeded(21), spots = [];
 for (let i = 0; i < 20; i++) { const s = openSpot(map, sim.colliders, { random }); assert.ok(s && isPlayable(map, s.x, s.z, 1)); spots.push(s); }
 assert.ok(new Set(spots.map(s => Math.round(s.x / 10) + ',' + Math.round(s.z / 10))).size > 10, 'spread over the map');
});

test('robot armour comes off in order as health falls', () => {
 const marks = PLATES.map(p => p.below);
 assert.deepEqual([...marks].sort((a, b) => b - a), marks);
 assert.ok(marks[0] < 1 && marks.at(-1) > 0);
});
