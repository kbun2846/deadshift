import test from 'node:test';
import assert from 'node:assert/strict';
import { Squads } from '../src/bots/squad.js';

const seeded = seed => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };
const bot = (id, team) => ({ id, team, alive: true, brain: {}, sim: { player: { x: 0, z: 0 } } });

test('roles mix escort / support / roam and change; sides sometimes group, usually split', () => {
 const squads = new Squads(seeded(3)), bots = [bot('a', 'blue'), bot('b', 'blue'), bot('c', 'red'), bot('d', 'red'), bot('e', 'red')];
 const roles = new Map(), plans = { group: 0, split: 0 };
 for (let t = 0; t < 3000; t += 1) {
  squads.update(bots, t, new Set(['blue']));
  for (const b of bots) roles.set(b.team + b.brain.role, (roles.get(b.team + b.brain.role) || 0) + 1);
  plans[squads.plan('red')]++;
 }
 assert.ok(roles.get('blueescort') && roles.get('bluesupport') && roles.get('blueroam'), 'all three roles on your side');
 assert.ok(!roles.get('redescort'), 'no escort on a side without a player');
 assert.ok(plans.group > 0 && plans.split > plans.group, 'grouping is a tactic, not the rule');
 // Grouped: everyone but the captain keeps near the captain.
 while (squads.plan('red') !== 'group') squads.update(bots, squads.sides.get('red').until + 1, new Set(['blue']));
 const captain = squads.sides.get('red').captain;
 for (const b of bots.filter(b => b.team === 'red' && b.id !== captain)) assert.equal(squads.leaderFor(b), captain);
});

test('a supporter goes to a teammate in a fight far off; a roamer only to one close by; an escort stays', () => {
 const squads = new Squads(seeded(5)), me = bot('a', 'blue'), friends = [{ x: 30, z: 0, busy: true }, { x: 5, z: 0, busy: false }];
 me.brain.role = 'support'; assert.deepEqual(squads.rally(me, friends), { x: 30, z: 0 });
 me.brain.role = 'roam'; assert.equal(squads.rally(me, friends), null);
 assert.deepEqual(squads.rally(me, [{ x: 10, z: 0, busy: true }]), { x: 10, z: 0 });
 me.brain.role = 'escort'; assert.equal(squads.rally(me, friends), null);
});
