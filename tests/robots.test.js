import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { maps } from '../src/maps.js';
import { NavGrid } from '../src/bots/nav-grid.js';
import { BotMatch } from '../src/bots/bot-match.js';
import { RobotBrain, shotClear } from '../src/bots/robot-brain.js';
import { isPlayable } from '../src/playable-area.js';
import { targetRadius } from '../src/target-radius.js';

const map = maps.deadwater;
let seed = 7; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test('the walking grid matches the playable area, and a broken prop updates it exactly as a rebuild would', () => {
 const sim = new Simulation(map), nav = new NavGrid(map, sim.colliders);
 for (let i = 0; i < nav.open.length; i += 97) if (nav.open[i]) { const c = nav.centre(i); assert.ok(isPlayable(map, c.x, c.z, nav.radius), 'open square outside the playable area'); }
 const prop = sim.props.find(p => p.health !== null);
 sim.colliders = sim.colliders.filter(c => c.propId !== prop.id);
 nav.refresh(sim.colliders);
 const fresh = new NavGrid(map, sim.colliders);
 assert.deepEqual([...nav.open], [...fresh.open]);
 assert.deepEqual([...nav.clearance], [...fresh.clearance]);
});

test('paths are walkable end to end and pulled tight', () => {
 const sim = new Simulation(map), nav = new NavGrid(map, sim.colliders);
 let found = 0;
 for (let k = 0; k < 12; k++) {
  const a = { x: (random() - .5) * 60, z: (random() - .5) * 60 }, b = { x: (random() - .5) * 60, z: (random() - .5) * 60 };
  if (!nav.isOpen(a.x, a.z) || !nav.isOpen(b.x, b.z)) continue;
  const path = nav.path(a.x, a.z, b.x, b.z); if (!path) continue; found++;
  let from = a; for (const p of path) { assert.ok(nav.walkable(from.x, from.z, p.x, p.z), 'a leg of the path crosses a wall'); from = p; }
  // Pulled tight: no waypoint can be skipped.
  for (let i = 0; i + 2 < path.length; i++) assert.ok(!nav.walkable(path[i].x, path[i].z, path[i + 2].x, path[i + 2].z));
 }
 assert.ok(found > 3);
});

test('robots are hit like players, never bleed-kind targets, and pass damage both ways', () => {
 assert.equal(targetRadius({ kind: 'robot' }), targetRadius({ kind: 'player' }));
 const you = new Simulation(map); you.weapon = 'rifle'; you.player.id = 'you';
 const bots = new BotMatch(map, { createSim: m => new Simulation(m), random });
 const bot = bots.spawn(you, 'rifle');
 assert.ok(bot, 'a robot spawns');
 // Stand the robot right in front of you and shoot it.
 bot.sim.player.x = you.player.x + 3; bot.sim.player.z = you.player.z; bot.sim.player.vx = bot.sim.player.vz = 0;
 const hp = bot.sim.player.hp;
 for (let i = 0; i < 40; i++) {
  bots.before(you);
  const proxy = you.targets.find(t => t.id === bot.id);
  assert.equal(proxy.kind, 'robot');
  you.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, aimPointX: bot.sim.player.x, aimPointZ: bot.sim.player.z, fire: true });
  bots.after(you);
  assert.ok(!you.targets.some(t => t.id === bot.id), 'the stand-in leaves your targets after the step');
 }
 assert.ok(bot.sim.player.hp < hp, 'your bullets hurt the robot');
 const events = you.drainEvents?.() || you.events;
 assert.ok(events.some(e => e.type === 'hit' && e.targetKind === 'robot'), 'hits on it are robot hits (sparks, not blood)');
});

test('a robot left to itself moves, aims and fights with its weapon', () => {
 for (const weapon of ['rifle', 'shotgun', 'static']) {
  const you = new Simulation(map); you.player.id = 'you'; you.dev.invulnerable = true;
  const bots = new BotMatch(map, { createSim: m => new Simulation(m), random });
  const bot = bots.spawn(you, weapon);
  const start = { x: bot.sim.player.x, z: bot.sim.player.z };
  let fired = 0;
  for (let i = 0; i < 60 * 12; i++) {
   bots.before(you); you.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0 }); bots.after(you); bots.step(you);
   for (const { e } of bots.drain()) if (['rifleShot', 'shotgunShot', 'launch', 'sprayStart', 'seed', 'hexDeploy'].includes(e.type)) fired++;
  }
  const moved = Math.hypot(bot.sim.player.x - start.x, bot.sim.player.z - start.z);
  assert.ok(moved > 2 || fired > 0, weapon + ': the robot did something');
  assert.ok(fired > 0, weapon + ': the robot used its weapon');
 }
});

test('a clear shot is blocked by walls', () => {
 const sim = new Simulation(map), wall = sim.colliders.find(c => !c.playerOnly && c.w > 3 && c.d < 1);
 assert.equal(shotClear(sim.colliders, wall.x, wall.z - 2, wall.x, wall.z + 2), false);
});

test('robots spend most of a fight fighting, not hiding, and never crash with nothing to aim at', () => {
 const you = new Simulation(map); you.player.id = 'you'; you.dev.invulnerable = true;
 const bots = new BotMatch(map, { createSim: m => new Simulation(m), random });
 const list = ['rifle', 'shotgun', 'static', 'rifle'].map(w => bots.spawn(you, w));
 const modes = new Map(list.map(b => [b, {}]));
 for (let i = 0; i < 60 * 40; i++) {
  bots.before(you); you.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0 }); bots.after(you); bots.step(you); bots.drain();
  for (const b of list) { const m = modes.get(b), k = b.brain.mode; m[k] = (m[k] || 0) + 1; }
 }
 for (const [b, m] of modes) {
  const total = Object.values(m).reduce((a, n) => a + n, 0);
  assert.ok((m.cover || 0) / total < .6, b.sim.weapon + ' hid ' + Math.round((m.cover || 0) / total * 100) + '% of the time');
 }
});

test('allies are on your side: never your targets, never hurt you, and keep near you as you walk', () => {
 const you = new Simulation(map); you.player.id = 'you';
 const bots = new BotMatch(map, { createSim: m => new Simulation(m), random });
 const ally = bots.spawn(you, 'rifle', { team: 'blue' });
 assert.ok(ally.slot >= 1000 && ally.id.startsWith('ally-'));
 bots.before(you);
 assert.ok(!you.targets.some(t => t.id === ally.id), 'an ally is not something your shots hit');
 assert.ok(you.otherPlayers.length > 0, 'but it is a body you bump into');
 bots.after(you);
 assert.equal(bots.lockPool().length, 0, 'target lock never picks an ally');
 const hp = you.player.hp, far = [];
 for (let i = 0; i < 60 * 20; i++) {
  const t = i / 60, a = t * .25;
  bots.before(you); you.step({ moveX: Math.cos(a) * .6, moveZ: Math.sin(a) * .6, aimX: Math.cos(a), aimZ: Math.sin(a) }); bots.after(you); bots.step(you); bots.drain();
  if (i > 300) far.push(Math.hypot(ally.sim.player.x - you.player.x, ally.sim.player.z - you.player.z));
 }
 far.sort((a, b) => a - b);
 assert.equal(you.player.hp, hp, 'an ally never hurts you');
 assert.ok(far[far.length >> 1] < 7, 'median distance ' + far[far.length >> 1].toFixed(1) + ' m');
});

test('an ally fights enemy robots, and a dead enemy is forgotten (no chasing ghosts)', () => {
 const you = new Simulation(map); you.player.id = 'you'; you.dev.invulnerable = true;
 const bots = new BotMatch(map, { createSim: m => new Simulation(m), random });
 const ally = bots.spawn(you, 'rifle', { team: 'blue' }), foe = bots.spawn(you, 'rifle', { team: 'red' });
 let allyHitFoe = 0, ghost = 0, deadFor = 0;
 for (let i = 0; i < 60 * 30; i++) {
  bots.before(you); you.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0 }); bots.after(you); bots.step(you);
  for (const { e, slot } of bots.drain()) if (slot === ally.slot && e.type === 'hit' && e.id === foe.id) allyHitFoe++;
  // (The tick it dies in, the ally has already stepped.)
  deadFor = foe.alive ? 0 : deadFor + 1;
  if (deadFor > 1 && ally.brain.memory.has(foe.id)) ghost++;
 }
 assert.ok(allyHitFoe > 0, 'the ally shot the enemy');
 assert.equal(ghost, 0, 'nothing remembered about an enemy that is not there');
});

test('no two robots in a game share a make, each keeps its make for the session, and never an ally-green visor', async () => {
 const { skinOf, ROBOT_SKINS, ALLY_COLOURS } = await import('../src/bots/robot-model.js');
 const you = new Simulation(map); you.player.id = 'you';
 const bots = new BotMatch(map, { createSim: m => new Simulation(m), random });
 const list = ['rifle', 'shotgun', 'static', 'rifle', 'shotgun', 'static'].map((w, k) => bots.spawn(you, w, { team: k % 2 ? 'blue' : 'ffa' }));
 assert.equal(new Set(list.map(b => b.make)).size, list.length, 'all different makes');
 for (const b of list) assert.equal(skinOf(b.slot).id, b.make, 'the slot carries the make');
 const before = list.map(b => b.make);
 for (const b of list) { b.sim.damagePlayer(9999, 'dev'); }
 for (let i = 0; i < 60 * 6; i++) { bots.before(you); you.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0 }); bots.after(you); bots.step(you); bots.drain(); }
 for (const b of list) bots.respawnAt(b, you);
 assert.deepEqual(list.map(b => b.make), before, 'deaths and restarts keep each make');
 // One leaves: its make is free for the next, still no repeats.
 bots.bots.splice(0, 1);
 const next = bots.spawn(you, 'rifle');
 assert.equal(new Set(bots.bots.map(b => b.make)).size, bots.bots.length);
 assert.ok(next);
 for (const k of ROBOT_SKINS) assert.notEqual(k.eye, ALLY_COLOURS.eye);
});

test('robots have their own skill and style: as asked, or at random, and never two quite alike', async () => {
 const { makeProfile, SKILLS, STYLES } = await import('../src/bots/robot-profile.js');
 const a = makeProfile({ skill: 'hard', style: 'rusher', random }), b = makeProfile({ skill: 'hard', style: 'rusher', random });
 assert.equal(a.label, 'hard rusher');
 assert.notEqual(a.aim, b.aim, 'a personal jitter');
 const easy = makeProfile({ skill: 'easy', style: 'cautious', random });
 assert.ok(easy.aim > a.aim && easy.reaction[0] > a.reaction[0] && easy.shake > a.shake, 'easy hands are worse');
 assert.ok(easy.hurtAt > a.hurtAt && easy.range > a.range, 'a cautious robot hides sooner and keeps further off than a rusher');
 const seen = new Set(); for (let k = 0; k < 60; k++) { const p = makeProfile({ random }); assert.ok(SKILLS[p.skill] && STYLES[p.style]); seen.add(p.style); }
 assert.equal(seen.size, Object.keys(STYLES).length, 'random covers every style');
 const you = new Simulation(map); you.player.id = 'you';
 const bots = new BotMatch(map, { createSim: m => new Simulation(m), random });
 const bot = bots.spawn(you, 'rifle', { skill: 'easy', style: 'marksman' });
 assert.equal(bot.profile.label, 'easy marksman'); assert.equal(bot.brain.pf, bot.profile);
});
