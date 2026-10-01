// The robots' engagement loop (bots/engagement.js; robot behaviour pass
// 2026-09-30, owner: "make bots a bit more dynamic. i was playing one who just
// kept chasing me without backing off or initiating").
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { maps } from '../src/maps.js';
import { BotMatch, abilitySpent, abilityBig } from '../src/bots/bot-match.js';
import { RobotBrain, STYLE } from '../src/bots/robot-brain.js';
import { NavGrid } from '../src/bots/nav-grid.js';
import { makeProfile } from '../src/bots/robot-profile.js';
import { peelBonus } from '../src/bots/squad.js';
import { judge, newEngagement, newSituation, persona, thresholds, THREAT, ENGAGE, ENGAGE_STATES } from '../src/bots/engagement.js';
import { ICHOR, RULES } from '../src/config/gameplay.js';

const seeded = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const pf = (skill = 'hard', style = 'balanced') => makeProfile({ skill, style, random: () => .5 });
// A fight in progress: seen at 10 m, both healthy, a rifle's band.
const fight = patch => Object.assign(newSituation(), { has: true, seen: true, fresh: true, d: 10, near: 8, far: 15, reach: 30, threat: 18, my: 1, their: 1, foes: 1 }, patch);
// Steps the loop `secs` seconds at the brain's think rate, the situation from `at(t)`.
function run(e, p, secs, at, from = 0, random = () => .5) { let t = from; for (; t < from + secs; t += .1) judge(e, at(t), p, t, random); return t; }

test('the states, and a fresh robot seeks until it knows of someone', () => {
 assert.deepEqual([...ENGAGE_STATES], ['seek', 'approach', 'engage', 'press', 'disengage', 'reset']);
 const e = newEngagement(() => .5);
 assert.equal(judge(e, newSituation(), pf(), 0, () => .5), 'seek');
 assert.equal(judge(e, fight({ d: 25 }), pf(), .1, () => .5), 'approach', 'out of its band: approach');
 assert.equal(judge(e, fight({ d: 12 }), pf(), .2, () => .5), 'engage', 'in its band: engage');
 assert.equal(judge(e, newSituation(), pf(), .3, () => .5), 'seek', 'nobody left: seek');
});

test('low health and just hit: it disengages (hurt), then resets out of sight', () => {
 const p = pf(), e = newEngagement(() => .5);
 run(e, p, 1, () => fight());
 assert.equal(e.state, 'engage');
 judge(e, fight({ my: .2, hurt: .3 }), p, 1.1, () => .5);
 assert.equal(e.state, 'disengage'); assert.equal(e.reason, 'hurt');
 // Out of their sight a moment: the reset (a breather, then round the side).
 run(e, p, 1.2, () => fight({ my: .2, hurt: 5, seen: false }), 1.2);
 assert.equal(e.state, 'reset');
 assert.equal(e.phase, 'hide');
});

test('reloading or empty with the enemy close: it backs off; far out of their reach it reloads where it is', () => {
 const p = pf();
 let e = newEngagement(() => .5); run(e, p, 1, () => fight());
 judge(e, fight({ empty: true, d: 9 }), p, 1.1, () => .5);
 assert.equal(e.state, 'disengage'); assert.equal(e.reason, 'reload');
 // Loaded again and still in sight: straight back in.
 run(e, p, 1, () => fight({ empty: false, d: 12 }), 1.2);
 assert.equal(e.state, 'engage');
 e = newEngagement(() => .5); run(e, p, 1, () => fight({ threat: 6.8, d: 14 }));
 judge(e, fight({ empty: true, threat: 6.8, d: 14 }), p, 1.1, () => .5);
 assert.notEqual(e.state, 'disengage', 'a Ballast 14 m off cannot punish a reload');
});

test('the target reloading (or its big ability just spent) is the moment to press', () => {
 const p = pf(), e = newEngagement(() => .5);
 run(e, p, 1, () => fight());
 assert.equal(e.state, 'engage');
 judge(e, fight({ theirReload: true }), p, 1.1, () => .5);
 assert.equal(e.state, 'press'); assert.equal(e.reason, 'edge');
 const e2 = newEngagement(() => .5); run(e2, p, 1, () => fight());
 judge(e2, fight({ theirSpent: true, their: .6, my: .9 }), p, 1.1, () => .5);
 assert.equal(e2.state, 'press', 'spent ability and a health lead');
 // Pressing ends when the edge is gone (below the lower threshold: hysteresis) or its time is up.
 const t = run(e, p, 1.5, () => fight({ theirReload: true }), 1.2);
 assert.equal(e.state, 'press', 'holds the press while the edge lasts');
 run(e, p, 1, () => fight(), t);
 assert.notEqual(e.state, 'press');
});

test('a small edge keeps a press going but does not start one (hysteresis)', () => {
 const p = pf(), th = thresholds(p), e = newEngagement(() => .5);
 assert.ok(th.pressOut < th.pressAt - .3);
 // An edge between the two thresholds: health lead worth (pressAt + pressOut) / 2.
 const lead = (th.pressAt + th.pressOut) / 2 / 1.2 - .2 / 1.2;   // (ability ready adds .2)
 const mid = () => fight({ my: 1, their: 1 - lead, ability: true });
 run(e, p, 1, mid);
 assert.equal(e.state, 'engage', 'not enough to start pressing');
 judge(e, fight({ theirReload: true }), p, 1.1, () => .5);
 assert.equal(e.state, 'press');
 run(e, p, 1.5, mid, 1.2);
 assert.equal(e.state, 'press', 'enough to keep pressing');
});

test('a chase that is not closing is given up for a reset, never followed forever', () => {
 for (const skill of ['easy', 'normal', 'hard']) {
  const p = pf(skill), e = newEngagement(() => .5), limit = thresholds(p).chase;
  // They keep 22 m off, out of its band, running as fast as it walks.
  let gaveUp = null;
  for (let t = 0; t < 20 && gaveUp == null; t += .1) { judge(e, fight({ d: 22 + Math.sin(t) * .3 }), p, t, () => .5); if (e.state === 'disengage') gaveUp = t; }
  assert.ok(gaveUp != null, skill + ': gave the chase up');
  assert.equal(e.reason, 'chase');
  assert.ok(gaveUp < limit + 1, `${skill}: within ${limit.toFixed(1)} s (${gaveUp.toFixed(1)})`);
 }
 // Easy robots over-chase (a mistake), hard ones give up soonest.
 assert.ok(thresholds(pf('easy')).chase > thresholds(pf('hard')).chase);
 // A chase that closes goes on.
 const e = newEngagement(() => .5);
 run(e, pf(), 5, t => fight({ d: 30 - t * 2.5 }));
 assert.ok(e.state === 'approach' || e.state === 'engage');
});

test('holding a band too long it takes the initiative: presses or goes round, never stands there', () => {
 for (const style of ['rusher', 'balanced', 'cautious', 'flanker', 'marksman']) {
  const p = pf('normal', style), e = newEngagement(() => .5);
  let left = null;
  run(e, p, .3, () => fight());
  for (let t = .3; t < 25 && left == null; t += .1) { judge(e, fight(), p, t, () => .5); if (e.state !== 'engage') left = e.state; }
  assert.ok(left === 'press' || left === 'reset', style + ': ' + left);
 }
});

test('after a reset, a calm spell: it does not back off again straight away for a lost trade', () => {
 const p = pf(), e = newEngagement(() => .5);
 run(e, p, 1, () => fight());
 e.taken = 80; judge(e, fight({ my: .7 }), p, 1.1, () => .5);
 assert.equal(e.state, 'disengage'); assert.equal(e.reason, 'trade');
 let t = run(e, p, 1, () => fight({ seen: false, my: .7 }), 1.2);
 assert.equal(e.state, 'reset');
 t = run(e, p, 2, () => fight({ my: .7 }), t);
 assert.equal(e.state, 'engage');
 e.taken = 80; e.dealt = 0; judge(e, fight({ my: .7 }), p, t, () => .5);
 assert.equal(e.state, 'engage', 'calm spell');
 assert.ok(e.calmUntil > t);
 // Hurt badly still counts in the calm spell.
 judge(e, fight({ my: .15, hurt: .2 }), p, t + .1, () => .5);
 assert.equal(e.state, 'disengage');
});

test('a blade within a dash of them is committed; a cautious gun backs out of a Ballast\'s reach', () => {
 const blade = pf('hard', 'balanced'), e = newEngagement(() => .5);
 run(e, blade, 1, () => fight({ d: 2, near: 1, far: 1.7, melee: true }));
 e.taken = 90; judge(e, fight({ d: 3, near: 1, far: 1.7, melee: true, my: .3 }), blade, 1.1, () => .5);
 assert.notEqual(e.state, 'disengage');
 const careful = pf('hard', 'cautious'), c = newEngagement(() => .5);
 run(c, careful, 1, () => fight({ d: 9, threat: THREAT.shotgun }));
 judge(c, fight({ d: 5, threat: THREAT.shotgun, inThreat: true }), careful, 1.1, () => .5);
 assert.equal(c.state, 'disengage'); assert.equal(c.reason, 'threat');
});

test('personalities and difficulty: from the profile, easy more patient than hard', () => {
 assert.equal(persona(pf('normal', 'rusher')), 'aggressive');
 assert.equal(persona(pf('normal', 'cautious')), 'cautious');
 assert.equal(persona(pf('normal', 'flanker')), 'flanker');
 assert.equal(persona(pf('normal', 'marksman')), 'sniper');
 assert.equal(persona(pf('normal', 'balanced')), 'balanced');
 const easy = thresholds(pf('easy')), hard = thresholds(pf('hard'));
 assert.ok(easy.pressAt > hard.pressAt, 'easy presses later');
 assert.ok(easy.trade > hard.trade, 'easy backs off later');
 assert.ok(thresholds(pf('hard', 'rusher')).pressAt < thresholds(pf('hard', 'cautious')).pressAt);
 // Two robots of the same kind do not switch on the same beat (randomized timers).
 const a = newEngagement(seeded(1)), b = newEngagement(seeded(2)), p = pf();
 const ra = seeded(3), rb = seeded(4); let diff = 0;
 for (let t = 0; t < 30; t += .1) { judge(a, fight(), p, t, ra); judge(b, fight(), p, t, rb); if (a.state !== b.state) diff++; }
 assert.ok(diff > 10);
});

test('each weapon has its band: Ballast under 5 m, Nominal 8-15, Static mid, Sightline longest, blades in reach', () => {
 const sim = new Simulation(maps.deadwater), nav = new NavGrid(maps.deadwater, sim.colliders);
 const brain = new RobotBrain({ sim, nav, random: () => .5, profile: pf('hard', 'balanced') });
 brain.pf.range = 1;
 const band = w => { sim.weapon = w; return brain.band(); };
 assert.ok(band('shotgun').far <= 5);
 assert.deepEqual([band('rifle').near, band('rifle').far], [8, 15]);
 assert.ok(band('static').near >= 5 && band('static').far <= 10.5, 'Static fights at mid range (volleys), not in its stream');
 for (const w of ['sidekick', 'omen']) assert.ok(band(w).near >= 5 && band(w).far <= 11, w + ' mid');
 const far = Object.keys(STYLE).map(w => [w, band(w).far]).sort((x, y) => y[1] - x[1]);
 assert.equal(far[0][0], 'sightline');
 for (const w of ['ichor', 'sheath']) assert.ok(band(w).far < 2.5, w);
 // Pressing pulls a short weapon right in, a sniper hardly at all.
 brain.eng.state = 'press';
 assert.ok(band('shotgun').far < STYLE.shotgun.far * .8);
 assert.ok(band('sightline').far > STYLE.sightline.far * .9);
 // Kiting a blade: out of its slash-and-dash, not out of its 17 m wave.
 assert.ok(THREAT.ichor < 7 && THREAT.ichor > ICHOR.range);
});

test('a teammate nearly dead: the enemy on top of them is the one to go for (peel)', () => {
 const friends = [{ x: 0, z: 0, hp: 20, maxHp: 100 }, { x: 30, z: 0, hp: 90, maxHp: 100 }];
 assert.ok(peelBonus({ x: 2, z: 0 }, friends) > 4);
 assert.equal(peelBonus({ x: 29, z: 0 }, friends), 0, 'a healthy teammate needs no peel');
 assert.equal(peelBonus({ x: 20, z: 20 }, friends), 0);
});

test('what anyone can see of a big ability: charged or going off, and just spent', () => {
 const sim = new Simulation(maps.deadwater); sim.weapon = 'ichor'; sim.reset();
 assert.equal(abilityBig(sim), false); assert.equal(abilitySpent(sim), false);
 sim.ichor.frenzy = 1; assert.equal(abilityBig(sim), true);
 sim.ichor.xCooldown = ICHOR.xCooldown - 1; assert.equal(abilitySpent(sim), true);
 sim.ichor.xCooldown = 10; assert.equal(abilitySpent(sim), false, 'long ago');
});

// Whole robots (BotMatch, Deadwater), seeded.
function duel(a, b, secs, seed, each) {
 const real = Math.random; Math.random = seeded(seed);
 try {
  const main = new Simulation(maps.deadwater); main.noTargets = true; main.reset(); main.targets = []; main.dev.ghost = true; main.dev.invulnerable = true; main.player.id = 'you';
  const bots = new BotMatch(maps.deadwater, { createSim: m => new Simulation(m), random: seeded(seed + 1) });
  bots.holdRespawns = true;
  const one = bots.spawn(main, a, { skill: 'hard', style: 'balanced' }), two = bots.spawn(main, b, { skill: 'hard', style: 'balanced' });
  one.sim.weapon = a; two.sim.weapon = b;
  const spot = main.map.spawn || { x: 0, z: 0 };
  bots.putAt(one, main, { x: spot.x - 6, z: spot.z }); bots.putAt(two, main, { x: spot.x + 6, z: spot.z });
  main.player.x = spot.x; main.player.z = spot.z + 40;
  for (let i = 0; i < secs * 60; i++) {
   bots.before(main); main.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0 }); bots.after(main); bots.step(main);
   each?.(bots.drain(), one, two);
   if (one.sim.player.hp <= 0 || two.sim.player.hp <= 0) break;
  }
  return { one, two };
 } finally { Math.random = real; }
}

test('a Static robot builds orb volleys and launches them (not only the stream)', () => {
 let volleys = 0, orbs = 0;
 for (const seed of [11, 12, 13]) duel('static', 'rifle', 25, seed, (events, one) => { for (const { e, slot } of events) if (e.type === 'launch' && slot === one.slot && e.count >= 4) { volleys++; orbs += e.count; } });
 assert.ok(volleys >= 2, 'volleys of four or more: ' + volleys);
});

test('an Ichor robot dashes in to close the gap and lands its blade', () => {
 let dashes = 0, cuts = 0;
 for (const seed of [21, 22, 23]) duel('ichor', 'omen', 25, seed, (events, one, two) => {
  for (const { e, slot } of events) if (slot === one.slot && e.type === 'hit' && e.id === two.id) cuts++;
  if (one.sim.player.dodgeRemaining > 0 && one.brain.dashedInAt === one.brain.time) dashes++;
 });
 assert.ok(dashes >= 1, 'dashed in');
 assert.ok(cuts >= 1, 'landed a cut');
});

test('against a player who backs off, a robot backs off and re-engages too: not a constant chase', () => {
 const real = Math.random; Math.random = seeded(5);
 try {
  const you = new Simulation(maps.deadwater); you.weapon = 'rifle'; you.noTargets = true; you.reset(); you.targets = []; you.player.id = 'you';
  const bots = new BotMatch(maps.deadwater, { createSim: m => new Simulation(m), random: seeded(6) });
  bots.enemyRange = [14, 20];
  const bot = bots.spawn(you, 'rifle', { team: 'red', skill: 'normal', style: 'balanced' });
  const hurt = you.damagePlayer.bind(you);
  you.damagePlayer = (...a) => { const r = hurt(...a); if (you.player.hp < 15 || you.player.dead) { you.player.hp = you.player.maxHp; you.player.dead = false; } return r; };
  const seen = {}; let longest = 0, run = 0, side = 1;
  for (let i = 0; i < 60 * 60; i++) {
   const p = you.player, b = bot.sim.player, dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz) || 1;
   if (i % 100 === 0) side = -side;
   const r = d < 8 ? -1 : d > 16 ? .7 : 0, mx = dx / d * r - dz / d * side, mz = dz / d * r + dx / d * side;
   const sees = d < 18 && you.canSeeTarget(b.x, b.z, .3);
   bots.before(you); you.step({ moveX: mx, moveZ: mz, aimX: dx / d, aimZ: dz / d, aimPointX: b.x, aimPointZ: b.z, fire: sees && i % 80 < 40 && you.rifle.ammo > 0, reload: you.rifle.ammo <= 0 }); bots.after(you); bots.step(you); bots.drain();
   const st = bot.brain.eng.state; seen[st] = (seen[st] || 0) + 1;
   run = st === 'approach' && bot.brain.memory.get('you')?.visible ? run + 1 : 0; longest = Math.max(longest, run);
  }
  for (const st of ['engage', 'press', 'disengage']) assert.ok(seen[st] > 0, 'went through ' + st + ': ' + JSON.stringify(seen));
  assert.ok(bot.brain.eng.counts.disengage + bot.brain.eng.counts.reset >= 2, 'backed off more than once');
  assert.ok(longest / 60 < 12, 'longest visible chase ' + (longest / 60).toFixed(1) + ' s');
 } finally { Math.random = real; }
});

// (Review 2026-09-30.) A press starts its own "not closing" clock: coming back
// in from a disengage or reset, it used to inherit the old approach's clock
// and turned straight back into a disengage (chase) on its next judge.
test('a press out of a reset gets its own chase clock (no instant give-up)', () => {
 const p = pf(), e = newEngagement(() => .5);
 // It closed to 16 m on its approach (the chase clock last set then)...
 run(e, p, 1, t => fight({ d: 22 - t * 6 }));
 assert.equal(e.state, 'approach');
 e.taken = 80; judge(e, fight({ d: 16, my: .7 }), p, 1.1, () => .5);
 assert.equal(e.state, 'disengage'); assert.equal(e.reason, 'trade');
 let t = run(e, p, 2, () => fight({ d: 22, my: .7, seen: false }), 1.2);
 assert.equal(e.state, 'reset');
 t = run(e, p, 1.2, () => fight({ d: 22, my: .7, seen: false, fresh: false }), t);
 const edge = () => fight({ d: 18, my: .7, their: .3, theirReload: true });
 judge(e, edge(), p, t, () => .5);
 assert.equal(e.state, 'press');
 for (let k = 1; k <= 5; k++) judge(e, edge(), p, t + k * .1, () => .5);
 assert.equal(e.state, 'press', `still pressing, not given up as a chase (${e.reason})`);
});

// Static backing off for its orbs does not come back in (or counter-press)
// until they are back: it would only step out again at once.
test('Static waiting for its orbs stays out until they are back', () => {
 const p = pf(), e = newEngagement(() => .5);
 run(e, p, 1, () => fight({ d: 8, near: 5.5, far: 10 }));
 judge(e, fight({ d: 8, near: 5.5, far: 10, recharging: true }), p, 1.1, () => .5);
 assert.equal(e.state, 'disengage'); assert.equal(e.reason, 'recharge');
 // A big edge while still recharging: no counter-press.
 const presses = e.counts.press;
 let t = run(e, p, 1, () => fight({ d: 9.5, near: 5.5, far: 10, recharging: true, their: .2, theirReload: true }), 1.2);
 assert.equal(e.counts.press, presses, 'no press it would back straight out of');
 // Orbs back: straight in.
 run(e, p, 1, () => fight({ d: 9.5, near: 5.5, far: 10 }), t);
 assert.ok(e.state === 'engage' || e.state === 'press', e.state);
});

// (Review 2026-09-30.) A chase is judged by how fast it closes, not by any
// progress at all: gaining a few centimetres a second on someone backing off
// is given up; closing properly goes on.
test('a chase gaining under the closing rate is given up; a real one goes on', () => {
 for (const skill of ['easy', 'normal', 'hard']) {
  const p = pf(skill), e = newEngagement(() => .5), limit = thresholds(p).chase;
  let gaveUp = null;
  for (let t = 0; t < 25 && gaveUp == null; t += .1) { judge(e, fight({ d: 24 - t * .3 }), p, t, () => .5); if (e.state === 'disengage') gaveUp = t; }
  assert.ok(gaveUp != null && e.reason === 'chase', `${skill}: a .3 m/s chase given up`);
  assert.ok(gaveUp < limit * 1.2 + 1, `${skill}: after about one window (${gaveUp.toFixed(1)} s, window ${limit.toFixed(1)})`);
  const f = newEngagement(() => .5);
  run(f, p, limit * 2.5, t => fight({ d: 30 - t * 1.2 }));
  assert.equal(f.state, 'approach', `${skill}: a 1.2 m/s chase goes on`);
 }
});
