// Hex fix + smaller hex (owner, 2026-09-30: "a bot was chasing me and i did
// the static x ability and the bot was able to get through and start
// attacking me. also, make the final size of the static x ability a bit
// smaller of a hexagon").
//
// For the hex's whole life (spreading, full, holding, pulsed and spinning)
// the other side cannot get in (walking, dodging, dashing, the Draw-cut,
// knockback: every substep of movement is kept out, not only where it ends)
// and nothing they do hurts whoever is inside; robots understand it
// (src/bots/hex-aware.js); and its full size is 10 m (was 12).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, RULES, insideShield, shieldRadius } from '../src/simulation.js';
import { BotMatch } from '../src/bots/bot-match.js';
import { Arena } from '../src/net/arena.js';
import { hexShieldsFrom, pack } from '../src/net/projectiles.js';
import { hexStandoff } from '../src/bots/hex-aware.js';
import { readFileSync } from 'node:fs';
import { PROTOCOL_VERSION } from '../src/net/protocol.js';

const empty = extra => ({ id: 'hex-test', width: 120, depth: 120, spawn: { x: 0, z: 0 }, buildings: [], props: [], fences: [], targets: [], ...extra });
// The hex's circle, straight from its orbs (or its spinning nodes).
const hexRadius = sim => {
 const o = sim.hexOrbs[0]; if (o) return Math.hypot(o.x - o.originX, o.z - o.originZ);
 const s = sim.hexSpin; if (s) return Math.max(...s.nodes.map(n => Math.hypot(n.x - s.originX, n.z - s.originZ)));
 return null;
};
const caster = (map = empty()) => { const s = new Simulation(map); s.player.id = 'caster'; s.weapon = 'static'; s.ammo = RULES.maxSeeds; s.targets = []; return s; };
// A hex spread `ticks` into its life, held there (the caster not stepped again).
const heldHex = ticks => { const c = caster(); c.hex(); for (let i = 0; i < ticks; i++) c.step({}); return c; };
const enemyAt = (x, z, weapon = 'rifle', shields = []) => { const s = new Simulation(empty({ spawn: { x, z } })); s.player.id = 'enemy'; s.weapon = weapon; s.targets = []; s.shields = shields; return s; };

test('a chasing robot never gets into the hex, whatever it carries, and never hurts you while it is up', () => {
 for (const weapon of ['ichor', 'sheath', 'shotgun', 'static']) for (const [throwAt, pulse] of [[2.5, false], [5, true]]) {
  let seed = 11; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const you = caster(); you.player.id = 'you'; you.dev.cooldowns = true;
  const bots = new BotMatch(empty(), { createSim: m => new Simulation(m), random });
  const bot = bots.spawn(you, weapon); bot.sim.player.x = 14; bot.sim.player.z = 0;
  let thrown = false, t = 0, pulsed = false, alive = 0;
  for (let i = 0; i < 60 * 6 && you.player.hp > 0; i++) {
   const d = Math.hypot(bot.sim.player.x - you.player.x, bot.sim.player.z - you.player.z);
   let hex = !thrown && (d < throwAt || i === 120);
   if (hex) { thrown = true; you.ammo = RULES.maxSeeds; }
   if (thrown) t += 1 / 60;
   if (pulse && thrown && !pulsed && t > 1.6 && you.hexOrbs.length) { hex = true; pulsed = true; }
   const hp = you.player.hp;
   bots.before(you); you.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, hex }); bots.after(you); bots.step(you); bots.drain();
   const R = hexRadius(you); if (R === null || !thrown) continue;
   alive++;
   const o = you.hexOrbs[0] || you.hexSpin;
   const gap = Math.hypot(bot.sim.player.x - o.originX, bot.sim.player.z - o.originZ) - R;
   assert.ok(gap > 0, `${weapon} (${pulse ? 'pulsed' : 'held'}): the robot got in, ${gap.toFixed(2)} m inside at ${t.toFixed(2)} s`);
   assert.equal(you.player.hp, hp, `${weapon} (${pulse ? 'pulsed' : 'held'}): hurt through the hex at ${t.toFixed(2)} s`);
  }
  assert.ok(thrown && alive > 60, `${weapon}: the hex was up (${alive} ticks)`);
 }
});

test('no way in: walking, a dodge, Gold Rush, the Draw-cut, an Ichor dash and knockback all stop outside its wall (every phase)', () => {
 // Spreading (1 s in), full and holding (4 s in), and spinning after the pulse.
 const phases = [['spreading', heldHex(60)], ['holding', heldHex(240)]];
 { const c = heldHex(150); c.hex(); c.stepHexSpin(.3); phases.push(['spinning', c]); }
 for (const [phase, c] of phases) {
  const sh = c.hexShield(), R = hexRadius(c);
  assert.ok(sh && Math.abs(shieldRadius(sh) - R) < 1e-6, `${phase}: the shield is the hex's circle`);
  const keep = R + RULES.hexBody - 1e-6;
  const moves = {
   walk: s => ({ moveX: -1, moveZ: 0, aimX: -1, aimZ: 0 }),
   dodge: (s, i) => ({ moveX: -1, moveZ: 0, aimX: -1, aimZ: 0, dodge: i % 20 === 0 }),
   rush: (s, i) => ({ moveX: -1, moveZ: 0, aimX: -1, aimZ: 0, sheathE: i === 0 }),
   drawCut: (s, i) => ({ moveX: -1, moveZ: 0, aimX: -1, aimZ: 0, aimPointX: 0, aimPointZ: 0, sheathX: i === 2 }),
   ichorDash: (s, i) => ({ moveX: -1, moveZ: 0, aimX: -1, aimZ: 0, dodge: i === 0, tapFire: i === 3 }),
  };
  for (const [name, input] of Object.entries(moves)) {
   const weapon = name === 'rush' || name === 'drawCut' ? 'sheath' : name === 'ichorDash' ? 'ichor' : 'rifle';
   const e = enemyAt(R + 1.2, .3, weapon, [sh]);
   e.dev.stamina = true;
   for (let i = 0; i < 90; i++) {
    const x0 = e.player.x, z0 = e.player.z;
    e.step(input(e, i));
    // Swept, not only where it ends: the whole step stays clear of the circle.
    for (let k = 1; k <= 8; k++) { const x = x0 + (e.player.x - x0) * k / 8, z = z0 + (e.player.z - z0) * k / 8; assert.ok(Math.hypot(x - sh.x, z - sh.z) >= keep - .02, `${phase}/${name}: through the wall at tick ${i}`); }
    assert.ok(Math.hypot(e.player.x - sh.x, e.player.z - sh.z) >= keep, `${phase}/${name}: inside at tick ${i}`);
   }
  }
  // Knockback (a Ballast shot's launch, a blast) straight at it.
  const k = enemyAt(R + 1, 0, 'shotgun', [sh]); k.player.blastVX = -80; k.player.ballastLaunch = true;
  for (let i = 0; i < 30; i++) { k.step({}); assert.ok(Math.hypot(k.player.x - sh.x, k.player.z - sh.z) >= keep, `${phase}/knockback`); }
 }
});

test('teammates walk in; the caster keeps its own rule (held inside while it spreads, free once it is pulsed); an enemy caught inside goes no deeper', () => {
 const c = heldHex(150); c.player.team = 'blue'; const sh = c.hexShield(), R = hexRadius(c);
 const mate = enemyAt(R + 1, 0, 'rifle', [sh]); mate.player.team = 'blue';
 for (let i = 0; i < 60; i++) mate.step({ moveX: -1, moveZ: 0 });
 assert.ok(Math.hypot(mate.player.x, mate.player.z) < R - 2, 'a teammate walks right in');
 // The caster: confined while it spreads (tests/hex.test.js), out after the pulse.
 const own = heldHex(150); own.shields = [own.hexShield()];
 for (let i = 0; i < 60; i++) own.step({ moveX: 1, moveZ: 0 });
 assert.ok(own.withinHex(own.player.x, own.player.z), 'held inside its own spreading hex');
 own.hex(); own.shields = [own.hexShield()];
 for (let i = 0; i < 40; i++) own.step({ moveX: 1, moveZ: 0 });
 assert.ok(own.player.x > hexRadius(own), 'walks out of its own pulsed hex');
 // An enemy already inside (it was there when the hex grew over it): no step deeper in.
 const caught = enemyAt(R - 2, 0, 'rifle', [sh]);
 for (let i = 0; i < 60; i++) { const before = Math.hypot(caught.player.x, caught.player.z); caught.step({ moveX: -1, moveZ: 0 }); assert.ok(Math.hypot(caught.player.x, caught.player.z) >= before - 1e-6); }
});

test('the spreading hex pushes an enemy out to its circle and keeps up with it', () => {
 const c = caster(); c.player.team = 'blue'; c.hex();
 const foe = { id: 'f', kind: 'robot', team: 'red', x: 1, z: .4, hp: 100, maxHp: 100 };
 c.targets = [foe];
 for (let i = 0; i < 60 * 3; i++) {
  c.step({});
  const R = hexRadius(c); if (R === null) break;
  assert.ok(Math.hypot(foe.x, foe.z) >= R + RULES.hexBody - RULES.hexSpeed * 1.8 / 60 - 1e-6, 'held out as it spreads');
 }
});

test('nothing from the other side lands inside: melee at the wall, an enemy caught inside, blasts centred outside, a muzzle past the wall', () => {
 const c = heldHex(240); const sh = c.hexShield(), R = hexRadius(c);
 const inside = () => ({ id: 'caster', kind: 'player', team: null, x: R * Math.cos(Math.PI / 6) - .5, z: 0, hp: 100, maxHp: 100 });
 // A Sheath slash from just outside the wall, at someone right behind it.
 const blade = enemyAt(R + RULES.hexBody, 0, 'sheath', [sh]); const t1 = inside(); blade.targets = [t1];
 for (let i = 0; i < 40; i++) blade.step({ aimX: -1, aimZ: 0, aimPointX: t1.x, aimPointZ: 0, tapFire: i % 10 === 0 });
 assert.equal(t1.hp, 100, 'a slash from outside is refused');
 // An enemy caught inside it (pushed out, or pinned against a wall): still refused.
 const pinned = enemyAt(R - 2, 0, 'rifle', [sh]); const t2 = inside(); t2.x = R - 5; pinned.targets = [t2];
 pinned.hit(t2, { owner: 'enemy', damage: 30 });
 assert.equal(t2.hp, 100, 'the other side is refused from inside too');
 const friend = new Simulation(empty({ spawn: { x: 1, z: 0 } })); friend.player.id = 'caster'; friend.shields = [sh];
 const t3 = { ...inside(), id: 'dummy' }; friend.hit(t3, { owner: 'caster', damage: 30 });
 assert.equal(t3.hp, 70, 'its own side, inside, still lands');
 // A grenade thrown from outside that bursts outside, its splash over the wall.
 const nade = enemyAt(R + 6, 0, 'rifle', [sh]); const t4 = inside(); t4.x = R - 1; nade.targets = [t4];
 for (let i = 0; i < 120; i++) nade.step({ aimX: -1, aimZ: 0, aimPointX: R + 1.2, aimPointZ: 0, grenade: i === 0 });
 assert.ok(nade.drainEvents().some(e => e.type === 'grenadeExplosion'), 'it went off');
 assert.equal(t4.hp, 100, 'the splash does not pass the wall');
 // A round that starts past the wall (the muzzle of someone standing at it) stops there.
 const at = enemyAt(R + .3, 0, 'rifle', [sh]);
 assert.equal(at.shieldStop(R - .5, 0, 0, 0), 0);
});

test('BotMatch: a hex thrown this tick already keeps the robots out on this tick', () => {
 const you = caster(); you.player.id = 'you';
 const bots = new BotMatch(empty(), { createSim: m => new Simulation(m), random: () => .4 });
 const bot = bots.spawn(you, 'ichor'); bot.sim.player.x = 3;
 bots.before(you); you.step({ hex: true }); bots.after(you); bots.step(you);
 assert.ok(you.hexOrbs.length, 'thrown');
 assert.ok(bot.sim.shields.some(s => s.owner === 'you'), 'the robot knew of it on the same tick');
});

test('online (the host): a joiner charging your hex stays out and does you no harm', () => {
 const map = empty();
 const a = new Arena({ map, createSim: m => new Simulation(m), settings: { robots: 'off' } });
 const one = a.addSeat('one', 'One'), two = a.addSeat('two', 'Two');
 one.present = two.present = true; one.sim.respawn({ x: 0, z: 0 }, 'one'); two.sim.respawn({ x: 6, z: 0 }, 'two');
 one.weapon = one.sim.weapon = 'static'; one.sim.ammo = RULES.maxSeeds; two.weapon = two.sim.weapon = 'ichor';
 a.phase = 'playing';
 for (let i = 0; i < 60 * 4; i++) {
  a.stepSeat(one, { hex: i === 0, aimX: 1, aimZ: 0 });
  a.stepSeat(two, { moveX: -1, moveZ: 0, aimX: -1, aimZ: 0, aimPointX: 0, aimPointZ: 0, tapFire: i % 12 === 0, dodge: i % 45 === 5 });
  a.endTick();
  const R = hexRadius(one.sim); if (R === null) continue;
  assert.ok(Math.hypot(two.sim.player.x, two.sim.player.z) > R, `in at ${i}`);
 }
 assert.equal(one.sim.player.hp, one.sim.player.maxHp, 'no harm');
});

test("a joiner's own prediction knows the other players' hexes (nothing new on the wire)", () => {
 const c = heldHex(120); c.player.team = 'red';
 const proj = { 3: pack(c) }, players = [{ id: 'caster', slot: 3, team: 'red', present: true }, { id: 'me', slot: 4, team: 'blue', present: true }];
 const list = hexShieldsFrom(proj, players, 'me');
 assert.equal(list.length, 1);
 assert.ok(Math.abs(shieldRadius(list[0]) - hexRadius(c)) < .02 && list[0].owner === 'caster' && list[0].team === 'red');
 assert.equal(hexShieldsFrom(proj, players, 'caster').length, 0, 'your own hex is not in your way');
 const me = enemyAt(hexRadius(c) + 1, 0, 'rifle', list); me.player.id = 'me'; me.player.team = 'blue';
 for (let i = 0; i < 40; i++) me.step({ moveX: -1, moveZ: 0 });
 assert.ok(Math.hypot(me.player.x, me.player.z) >= hexRadius(c) + RULES.hexBody - .03);
});

test('robots understand the hex: no shots wasted into it, off its wall, and someone else to fight if there is one', () => {
 for (const weapon of ['rifle', 'shotgun', 'ichor', 'static']) {
  let seed = 5; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const you = caster(); you.player.id = 'you'; you.dev.cooldowns = true;
  const bots = new BotMatch(empty(), { createSim: m => new Simulation(m), random });
  const bot = bots.spawn(you, weapon, { skill: 'hard' }); bot.sim.player.x = 9; bot.sim.player.z = 1;
  let ticks = 0, hugging = 0, wasted = 0;
  for (let i = 0; i < 60 * 5; i++) {
   bots.before(you); you.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, hex: i === 20 }); bots.after(you); bots.step(you);
   const events = bots.drain();
   const R = hexRadius(you); if (R === null || i < 90) continue;
   ticks++;
   const o = you.hexOrbs[0] || you.hexSpin, d = Math.hypot(bot.sim.player.x - o.originX, bot.sim.player.z - o.originZ);
   if (d < R + RULES.hexBody + .25) hugging++;
   wasted += events.filter(({ e }) => ['rifleShot', 'shotgunShot', 'launch', 'sprayStart', 'grenadeThrow', 'ichorSlash', 'ichorWave'].includes(e.type)).length;
  }
  assert.ok(ticks > 100, weapon);
  assert.equal(wasted, 0, `${weapon}: fired into the hex`);
  assert.ok(hugging < ticks * .25, `${weapon}: hugged the wall ${hugging}/${ticks}`);
 }
 // With someone else to fight outside it, a robot turns to them.
 let seed = 9; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
 const you = caster(); you.player.id = 'you';
 const bots = new BotMatch(empty(), { createSim: m => new Simulation(m), random });
 const a = bots.spawn(you, 'rifle', { skill: 'hard' }), b = bots.spawn(you, 'rifle', { skill: 'hard' });
 a.sim.player.x = 7; a.sim.player.z = 0; b.sim.player.x = 12; b.sim.player.z = 6;
 let onOther = 0, n = 0;
 for (let i = 0; i < 60 * 4; i++) {
  bots.before(you); you.step({ aimX: 1, aimZ: 0, hex: i === 0 }); bots.after(you); bots.step(you); bots.drain();
  if (i > 90 && hexRadius(you) !== null) { n++; if (a.brain.targetId === b.id) onOther++; }
 }
 assert.ok(n > 60 && onOther > n * .7, `turned to the robot outside the hex ${onOther}/${n}`);
});

test('the hex is smaller (10 m, was 12) and forms in the same time; every view and robot reads the one number', () => {
 assert.equal(RULES.hexRange, 10);
 assert.ok(Math.abs(RULES.hexRange / RULES.hexSpeed - 12 / 3.6) < .01, 'the same 3.33 s to full size');
 const c = heldHex(Math.ceil(RULES.hexRange / RULES.hexSpeed * 60) + 10);
 assert.ok(Math.abs(hexRadius(c) - 10) < 1e-6, 'full size is 10 m');
 assert.ok(Math.abs(shieldRadius(c.hexShield()) - 10) < 1e-6, 'and so is its shield');
 assert.ok(insideShield(c.hexShield(), 9.9, 0) && !insideShield(c.hexShield(), 10.1, 0));
 // The views, HUD and robots read RULES.hexRange, never a size of their own.
 for (const file of ['src/effects/electric-effects.js', 'src/ui/aim-overlay.js', 'src/ui/ability-hud.js', 'src/bots/robot-brain.js'])
  assert.match(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), /RULES\.hexRange/, file);
 assert.ok(hexStandoff({ pf: { tech: 1 } }) > RULES.hexReach, 'a skilled robot waits out of reach of the zaps');
 // Joiners predict the keep-out and draw the outline from these numbers: older builds kept out.
 assert.ok(PROTOCOL_VERSION >= 26);
});

// (Review 2026-09-30.) Someone else's knockback: a Ballast shell's shove on
// a third player standing just outside a hex never puts them inside it (the
// shove still lands where there is no hex, and on the hex's own side).
test("a Ballast shove from outside never knocks someone into another side's hex", () => {
 const c = heldHex(240), sh = c.hexShield(), R = hexRadius(c);
 const shove = (team, shields) => {
  const a = enemyAt(R + 3.5, 0, 'shotgun', shields); a.player.team = 'red';
  const b = { id: 'b', kind: 'player', team, x: R + .7, z: 0, hp: 100, maxHp: 100 }; a.targets = [b];
  for (let i = 0; i < 40; i++) a.step({ aimX: -1, aimZ: 0, aimPointX: 0, aimPointZ: 0, fire: i === 2, tapFire: i === 2, aiming: true });
  assert.ok(b.hp < 100, 'the shell landed');
  return b.x;
 };
 assert.ok(shove('blue', [sh]) >= R + RULES.hexBody - 1e-6, 'stopped at the keep-out ring');
 assert.ok(shove('blue', []) < R, 'with no hex there, the shove carries on');
 const ours = { ...sh, team: 'blue' };
 assert.ok(shove('blue', [ours]) < R, 'into a hex of their own side it may');
});

// (Review 2026-09-30.) A robot caught between an enemy hex and the storm's
// edge keeps out of the storm (and out of the hex): waiting out of the zaps'
// reach is never worth standing in the storm.
test('a robot squeezed between a hex and the storm stays out of the storm', () => {
 for (const weapon of ['rifle', 'shotgun', 'omen']) {
  let seed = 3; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const you = caster(empty({ spawn: { x: 9, z: 0 } })); you.player.id = 'you'; you.dev.cooldowns = true;
  const storm = { x: 0, z: 0, r: 22 }; you.storm = storm;
  const bots = new BotMatch(empty(), { createSim: m => new Simulation(m), random });
  const bot = bots.spawn(you, weapon, { skill: 'hard' }); bot.sim.player.x = 17; bot.sim.player.z = 3; bot.sim.storm = storm;
  let out = 0;
  for (let i = 0; i < 60 * 5; i++) {
   if (i > 20 && !you.hexOrbs.length && !you.hexSpin) you.ammo = RULES.maxSeeds;
   bots.before(you); you.step({ aimX: 1, aimZ: 0, hex: i === 5 || (i > 20 && !you.hexOrbs.length && !you.hexSpin) }); bots.after(you); bots.step(you); bots.drain();
   if (i > 60 && Math.hypot(bot.sim.player.x, bot.sim.player.z) > storm.r) out++;
   const R = hexRadius(you);
   if (R !== null) { const o = you.hexOrbs[0] || you.hexSpin; assert.ok(Math.hypot(bot.sim.player.x - o.originX, bot.sim.player.z - o.originZ) > R, `${weapon}: into the hex`); }
  }
  assert.equal(out, 0, `${weapon}: ticks in the storm`);
 }
});

// (Review 2026-09-30.) A pulsed hex spins on for a second with no orbs on the
// wire: a joiner's prediction keeps it (its last size) for that second, so the
// host does not have to pull the joiner back out; a hex that simply fades, or
// whose caster goes down, leaves nothing behind.
test("a joiner's prediction keeps a pulsed hex's second of spin (and nothing after a fade)", () => {
 const players = [{ id: 'caster', slot: 3, team: 'red', present: true }, { id: 'me', slot: 4, team: 'blue', present: true }];
 const c = heldHex(120), memo = new Map(), out = [];
 const R = hexRadius(c);
 hexShieldsFrom({ 3: pack(c) }, players, 'me', out, memo, 10);
 assert.equal(out.length, 1);
 c.hex(); assert.ok(c.hexSpin && !c.hexOrbs.length, 'pulsed');
 hexShieldsFrom({ 3: pack(c) }, players, 'me', out, memo, 10.05);
 assert.equal(out.length, 1, 'kept through the spin');
 assert.ok(Math.abs(shieldRadius(out[0]) - R) < .05);
 // The predicted body stays out while it spins, as the host keeps it out.
 const me = enemyAt(R + 1, 0, 'rifle', out); me.player.id = 'me'; me.player.team = 'blue';
 for (let i = 0; i < 40; i++) me.step({ moveX: -1, moveZ: 0 });
 assert.ok(Math.hypot(me.player.x, me.player.z) >= R + RULES.hexBody - .03, 'held out');
 hexShieldsFrom({ 3: pack(c) }, players, 'me', out, memo, 10.05 + RULES.hexSpinDuration + .01);
 assert.equal(out.length, 0, 'gone once the spin is over');
 // Faded at the end of its linger: no phantom spin.
 const f = heldHex(Math.ceil((RULES.hexRange / RULES.hexSpeed + RULES.hexLinger) * 60) - 3), m2 = new Map();
 hexShieldsFrom({ 3: pack(f) }, players, 'me', out, m2, 20); assert.equal(out.length, 1);
 for (let i = 0; i < 6; i++) f.step({});
 assert.equal(f.hexOrbs.length, 0, 'faded');
 hexShieldsFrom({ 3: pack(f) }, players, 'me', out, m2, 20.1); assert.equal(out.length, 0, 'a faded hex leaves nothing');
 // Its caster down: nothing either.
 const d = heldHex(120), m3 = new Map();
 hexShieldsFrom({ 3: pack(d) }, players, 'me', out, m3, 30); d.hex();
 hexShieldsFrom({ 3: pack(d) }, [{ ...players[0], dead: true }, players[1]], 'me', out, m3, 30.05);
 assert.equal(out.length, 0, 'a downed caster leaves nothing');
});
