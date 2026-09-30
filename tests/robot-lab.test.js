// The robot lab (developer tools, owner 2026-09-30): robots placed on spots,
// rounds that put everyone back on their spots at full health, weapons fixed,
// random or every matchup in turn, and the numbers (bots/robot-lab.js,
// bots/lab-readout.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation } from '../src/simulation.js';
import { maps } from '../src/maps.js';
import { BotMatch } from '../src/bots/bot-match.js';
import { RobotLab, LAB, averages } from '../src/bots/robot-lab.js';
import { labReadout, weaponReadout } from '../src/bots/lab-readout.js';
import { WEAPONS } from '../src/items.js';

const map = maps.deadwater;
const seeded = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
const setup = (seed = 5, weapons) => {
 const you = new Simulation(map); you.dev = { speed: 1 };
 const bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(seed) });
 const lab = new RobotLab({ bots, random: seeded(seed + 1), ...(weapons ? { weapons: () => weapons } : {}) });
 return { you, bots, lab };
};
const s0 = map.spawn;
const ticks = (you, bots, lab, n) => { for (let i = 0; i < n; i++) { bots.step(you); lab.step(you, 1 / 60); } };

test('placing: spots land on open ground, get side numbers, and the lab holds at most 8', () => {
 const { you, lab } = setup();
 const a = lab.add(you, s0.x + 6, s0.z, { side: 'red', weapon: 'rifle' }).entry;
 const b = lab.add(you, s0.x - 6, s0.z, { side: 'blue', weapon: 'shotgun' }).entry;
 const f = lab.add(you, s0.x, s0.z + 6, { side: 'ffa' }).entry;
 assert.deepEqual([a.label, b.label, f.label], ['A1', 'B1', 'F1']);
 const nav = lab.bots.nav;
 for (const e of [a, b, f]) assert.ok(nav.isOpen(e.x, e.z), 'on open ground');
 assert.equal(lab.nearest(a.x + 1, a.z), a, 'a click near a spot picks it');
 assert.equal(lab.nearest(a.x + 9, a.z + 9), null);
 assert.match(lab.add(you, 1e5, 1e5).error, /open ground/);
 for (let i = lab.count; i < LAB.maxRobots; i++) assert.ok(lab.add(you, s0.x + i, s0.z + 3, { side: 'red' }).entry);
 assert.match(lab.add(you, s0.x, s0.z).error, /holds 8/);
 lab.remove(you, f.key);
 assert.equal(lab.count, LAB.maxRobots - 1);
});

test('START needs two sides; then one robot per spot, on its spot, at its health; you are only watching; other robots leave', () => {
 const { you, bots, lab } = setup();
 lab.add(you, s0.x + 6, s0.z, { side: 'red', weapon: 'rifle', health: 150 });
 assert.match(lab.start(you), /two sides/);
 lab.add(you, s0.x - 6, s0.z, { side: 'blue', weapon: 'shotgun' });
 const stray = bots.spawn(you, null, { team: 'ffa' });
 assert.equal(lab.start(you), null);
 assert.ok(!bots.bots.includes(stray), 'robots that are not the lab\'s leave');
 assert.equal(bots.count, 2);
 assert.ok(bots.youOut && bots.holdRespawns);
 for (const e of lab.entries) {
  const p = e.bot.sim.player;
  assert.ok(Math.hypot(p.x - e.x, p.z - e.z) < 1e-6, 'on its spot');
  assert.equal(p.hp, e.health); assert.equal(e.bot.sim.weapon, e.weapon);
 }
 // Facing the other side at the start.
 const [a, b] = lab.entries, pa = a.bot.sim.player;
 assert.ok(pa.aimX * (b.x - a.x) + pa.aimZ * (b.z - a.z) > 0);
 // You are not in their world: no stand-in of you among their targets.
 bots.before(you); assert.ok(!you.targets.some(t => t.kind === 'robot')); bots.after(you);
 lab.stop(you);
 assert.equal(bots.count, 0); assert.ok(!bots.youOut && !bots.holdRespawns);
});

test('a round ends when one side is left: a win and a loss, then everyone back on their spots at full health', () => {
 const { you, bots, lab } = setup(7);
 const a = lab.add(you, s0.x + 7, s0.z, { side: 'red', weapon: 'rifle' }).entry, b = lab.add(you, s0.x - 7, s0.z, { side: 'blue', weapon: 'shotgun' }).entry;
 lab.settings.gap = .5;
 lab.start(you);
 // A hurts B, then B goes down.
 bots.deal(b.bot, 30, a.bot.id, []);
 ticks(you, bots, lab, 30);
 bots.deal(b.bot, 500, a.bot.id, []);
 ticks(you, bots, lab, 3);
 assert.equal(lab.round, 1); assert.equal(lab.phase, 'between');
 assert.equal(lab.lastRound.winner, 'A'); assert.equal(lab.lastRound.reason, 'last standing');
 const sa = lab.robotStats(a.key), sb = lab.robotStats(b.key);
 assert.deepEqual([sa.wins, sa.kills, sb.losses, sb.deaths], [1, 1, 1, 1]);
 assert.ok(sa.dealt >= 99 && sb.taken >= 99, 'damage counted, never more than it had');
 assert.ok(sa.ttkCount === 1 && sa.ttkSum > .3, 'time to kill from the first hit');
 assert.equal(lab.weaponStats('rifle').wins, 1); assert.equal(lab.weaponStats('shotgun').losses, 1);
 assert.equal([...lab.stats.matchups.values()][0].key, 'rifle vs shotgun');
 // A moves off its spot; after the pause both are back, full health.
 a.bot.sim.player.x += 3;
 for (let i = 0; i < 60 && lab.phase !== 'fighting'; i++) ticks(you, bots, lab, 1);
 assert.equal(lab.phase, 'fighting');
 for (const e of [a, b]) { const p = e.bot.sim.player; assert.ok(e.bot.alive && p.hp === p.maxHp && Math.hypot(p.x - e.x, p.z - e.z) < 1e-6); }
 assert.match(lab.csv(), /^round,matchup,time_s,winner/);
 assert.match(lab.csv(), /\n1,,[\d.]+,A,last standing,A1,red,rifle,win/);
});

test('a robot killed in the other robot\'s turn still counts: its death, and the kill', () => {
 const { you, bots, lab } = setup(13);
 const a = lab.add(you, s0.x + 7, s0.z, { side: 'red' }).entry, b = lab.add(you, s0.x - 7, s0.z, { side: 'blue' }).entry;
 lab.start(you);
 ticks(you, bots, lab, 2);
 // B (stepping after A) takes A down within the tick: A only falls on its next tick.
 bots.deal(a.bot, 500, b.bot.id, []);
 lab.step(you, 1 / 60);
 assert.equal(lab.round, 1); assert.equal(lab.lastRound.winner, 'B');
 ticks(you, bots, lab, 3);
 const sa = lab.robotStats(a.key), sb = lab.robotStats(b.key);
 assert.deepEqual([sa.deaths, sb.kills, sa.losses, sb.wins], [1, 1, 1, 1], 'counted once');
});

test('time up: the side with more health left wins; equal health, or everyone down, is a draw', () => {
 const { you, bots, lab } = setup(8);
 const a = lab.add(you, s0.x + 7, s0.z, { side: 'red' }).entry, b = lab.add(you, s0.x - 7, s0.z, { side: 'blue' }).entry;
 lab.settings.timeLimit = .5; lab.start(you);
 you.dev.robotHoldFire = true; you.dev.robotFreeze = true;
 bots.deal(a.bot, 20, 'nobody', []);
 ticks(you, bots, lab, 40);
 assert.equal(lab.lastRound.winner, 'B'); assert.equal(lab.lastRound.reason, 'time');
 ticks(you, bots, lab, 120);
 assert.equal(lab.log[1]?.winner, null, 'equal health: a draw');
 const { you: y2, bots: b2, lab: l2 } = setup(9);
 const c = l2.add(y2, s0.x + 7, s0.z, { side: 'ffa' }).entry, d = l2.add(y2, s0.x - 7, s0.z, { side: 'ffa' }).entry;
 l2.start(y2);
 b2.deal(c.bot, 500, 'nobody', []); b2.deal(d.bot, 500, 'nobody', []);
 ticks(y2, b2, l2, 3);
 assert.equal(l2.lastRound.winner, null); assert.equal(l2.lastRound.reason, 'all down');
 assert.equal(l2.robotStats(c.key).draws, 1);
});

test('weapons each round: fixed stays, random changes, every matchup runs through every pair in turn', () => {
 const list = ['static', 'rifle', 'shotgun'];
 const { you, lab } = setup(10, list);
 const a = lab.add(you, s0.x + 7, s0.z, { side: 'red', weaponMode: 'matchup' }).entry, b = lab.add(you, s0.x - 7, s0.z, { side: 'blue', weaponMode: 'matchup' }).entry;
 const c = lab.add(you, s0.x, s0.z + 7, { side: 'blue', weaponMode: 'fixed', weapon: 'rifle' }).entry;
 const d = lab.add(you, s0.x, s0.z - 7, { side: 'red', weaponMode: 'random' }).entry;
 lab.matchups = lab.schedule(); lab.settings.repeat = 2;
 assert.equal(lab.matchupCount, 9); assert.equal(lab.cycleRounds, 18);
 const seen = new Set();
 for (let n = 0; n < 18; n++) { const w = lab.weaponsFor(n); seen.add(w[a.key] + '|' + w[b.key]); assert.equal(w[c.key], 'rifle'); assert.ok(list.includes(w[d.key])); }
 assert.equal(seen.size, 9, 'every pair');
 assert.deepEqual([lab.weaponsFor(0)[a.key], lab.weaponsFor(1)[a.key]], [lab.weaponsFor(1)[a.key], lab.weaponsFor(1)[a.key]], 'each pair twice in a row');
 assert.equal(lab.matchupAt(2).index, 2);
 lab.settings.rounds = 'cycle'; assert.equal(lab.roundLimit, 18);
 const random = new Set(Array.from({ length: 30 }, (_, n) => lab.weaponsFor(n)[d.key]));
 assert.ok(random.size > 1, 'random changes');
});

test('a real fight: the robots find each other, fight to the end, and it all adds up', () => {
 const { you, bots, lab } = setup(11);
 const a = lab.add(you, s0.x + 6, s0.z, { side: 'red', weapon: 'rifle' }).entry, b = lab.add(you, s0.x - 6, s0.z, { side: 'blue', weapon: 'rifle' }).entry;
 lab.settings.timeLimit = 0;
 lab.start(you);
 for (let i = 0; i < 60 * 60 && lab.round < 1; i++) ticks(you, bots, lab, 1);
 assert.equal(lab.round, 1, 'a round finished within a minute');
 const sa = lab.robotStats(a.key), sb = lab.robotStats(b.key);
 assert.ok(sa.attacks + sb.attacks > 5, 'shots fired');
 assert.ok(sa.hits + sb.hits > 3, 'shots landed');
 assert.ok(Math.abs(sa.dealt - sb.taken) < 1e-6 && Math.abs(sb.dealt - sa.taken) < 1e-6, 'what one dealt the other took');
 const avg = averages(lab.weaponStats('rifle'));
 assert.equal(lab.weaponStats('rifle').rounds, 2, 'both robots count toward their weapon');
 assert.ok(avg.hitsPerAttack > 0 && avg.dealtPerRound > 0);
});

test('the live readout: health, ammo, reload, abilities and the head, for every weapon', () => {
 const { you, bots, lab } = setup(12);
 const e = lab.add(you, s0.x + 6, s0.z, { side: 'red' }).entry; lab.add(you, s0.x - 6, s0.z, { side: 'blue' });
 lab.start(you);
 for (const w of WEAPONS) {
  e.bot.sim.weapon = w.id; bots.putAt(e.bot, you, { x: e.x, z: e.z });
  const r = labReadout(e.bot, id => lab.nameOf(id));
  assert.ok(r.alive && r.hp > 0 && r.abilities.length >= 1, w.id);
  for (const d of r.abilities) assert.ok(['ready', 'cooldown', 'charging', 'active', 'locked'].includes(d.state) && d.left >= 0, w.id + ' ' + d.name);
  assert.match(r.dodges, /^\d+\/\d+$/); assert.ok(r.mind.mode);
 }
 e.bot.sim.weapon = 'rifle'; bots.putAt(e.bot, you, { x: e.x, z: e.z });
 e.bot.sim.rifle.ammo = 3; e.bot.sim.grenadeCooldown = 7;
 const r = weaponReadout(e.bot.sim);
 assert.match(r.ammo, /^3\/\d+$/); assert.deepEqual(r.abilities[0], { name: 'grenade', state: 'cooldown', left: 7 });
});

test('the dev tools list the lab, and main.js wires it: steps, your inputs taken away, the camera, placing', () => {
 const options = readFileSync(new URL('../src/ui/dev-options.js', import.meta.url), 'utf8');
 assert.match(options, /key: 'robotLab'/);
 const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
 assert.match(main, /robotLab\.step\(sim, RULES\.step\)/);
 assert.match(main, /robotLab\.watched\(\)/);
 assert.match(main, /labPanel\.place/);
});

test('review fixes: huge matchup counts cost nothing; a lost side stops the run; freeze stops the clock; a skipped round counts for nothing; no kill for last round\'s hit', () => {
 // Eight matchup spots: 7^8 matchups, worked out per round, never listed.
 const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
 const { you, lab } = setup(20, list);
 for (let i = 0; i < 8; i++) lab.add(you, s0.x + (i % 4) * 3 - 5, s0.z + (i < 4 ? 6 : -6), { side: i < 4 ? 'red' : 'blue', weaponMode: 'matchup' });
 const t0 = performance.now(); lab.matchups = lab.schedule();
 assert.equal(lab.matchupCount, 7 ** 8);
 const far = lab.weaponsFor(7 ** 8 - 1);
 assert.ok(Object.values(far).every(w => w === 'g'), 'the last matchup: every spot on the last weapon');
 assert.ok(performance.now() - t0 < 50);

 const { you: y2, bots: b2, lab: l2 } = setup(21);
 const a = l2.add(y2, s0.x + 7, s0.z, { side: 'red' }).entry, b = l2.add(y2, s0.x - 7, s0.z, { side: 'blue' }).entry;
 l2.start(y2);
 // Freeze: the clock holds.
 y2.dev.freeze = true; ticks(y2, b2, l2, 30); assert.equal(l2.clock, 0); delete y2.dev.freeze;
 // A skipped round's numbers are dropped.
 b2.deal(b.bot, 40, a.bot.id, []); l2.skip(y2);
 b2.deal(b.bot, 500, a.bot.id, []); ticks(y2, b2, l2, 3);
 assert.equal(l2.round, 1); assert.ok(Math.abs(l2.robotStats(a.key).dealt - 100) < 1e-6, 'only the counted round');
 assert.equal(l2.lastRound.robots.find(r => r.key === a.key).dealt, 100);
 // Next round: B dies to fire with A's last hit a round old: no kill for A.
 for (let i = 0; i < 200 && l2.phase !== 'fighting'; i++) ticks(y2, b2, l2, 1);
 b2.deal(b.bot, 500, 'crop-fire', []); ticks(y2, b2, l2, 3);
 assert.equal(l2.robotStats(a.key).kills, 1, 'still just the one kill');
 // Taking a side away mid-run stops it.
 for (let i = 0; i < 200 && l2.phase !== 'fighting'; i++) ticks(y2, b2, l2, 1);
 l2.remove(y2, b.key);
 assert.ok(!l2.running && /one side/.test(l2.stoppedWhy));
 assert.ok(!y2.dev.ghost && !b2.youOut, 'your settings are back');
});
