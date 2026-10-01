// Deadwater must play exactly as it did before the hills system (owner's rule:
// a map without terrain is exactly flat and byte-identical). This replays
// fixed, seeded runs on Deadwater and hashes the WHOLE simulation state and
// every event's full payload on every tick: each weapon solo, a robot fight,
// and a hosted match over the loopback (host, a joiner and a robot).
//
// The hashes were recorded on v0.94a (f121a9f) before any hills code existed.
// If this fails, something changed on flat ground: find it, don't re-record.
// The only re-recordings allowed are owner-approved behaviour changes, noted
// below with the reason.
//   - robots and hosted: re-recorded after the owner-approved fix that stops
//     robots firing from just below the bottom edge of the screen (2026-09-25;
//     the hosted run has a robot in it). static, rifle and shotgun unchanged.
//   - all five: furniture made solid (owner, 2026-09-26): Deadwater's room
//     furniture became colliders (world/room-furniture.js), so the collider
//     list and every path through a room changed.
//   - robots: re-recorded (owner, 2026-09-26, v0.990a: "fix the robots
//     thing") after the shot-spot fix went onto every map: a robot that
//     reaches a spot it picked for a clear shot and still has none marks it
//     bad and looks again, instead of standing there (it was hills only).
//     static, rifle, shotgun and hosted unchanged. (v0.990a merge: robots
//     re-recorded once more with the weapon session's damage-arc fields and
//     indoor bot rules below in it: 299bae72.)
//   - robots and hosted: owner-requested directional damage arc (2026-09-26)
//     adds sourceDX/sourceDZ to playerDamage. Audited all five replays with
//     only those new fields omitted: every pre-change hash still matches.
//     Health, movement, death force and the three solo replays are unchanged.
//   - hosted only: owner-requested indoor bot perception/tactics (2026-09-27).
//     This replay spends 99 robot ticks in rail-freight-hall/supplies and 420
//     ticks remembering a witnessed room entry. Those rules intentionally change
//     this fight; all four other replay hashes and repeat determinism match.
// (v0.990a fixes: hosted re-recorded, a4dc5523 -> e448e157: a hex now stops
//     rounds from outside at its wall (Simulation.shieldStop, owner); the hosted
//     fight has a hex up with fire coming at it. The other four are unchanged.)
// (v0.999a: hosted re-recorded, e448e157 -> c4a91f57: the owner's hotspot-lag
//     fix ("do as much as u can to fix this"): packed inputs, the host's input
//     catch-up and remote smoothing, trimmed/rounded snapshots. Only the wire
//     and the joiner's replay moved; the four solo replays are unchanged.)
// (2026-09-29: all five re-recorded for the owner's "reduce nominals ammo in a
//     clip down to 20": every sim carries Nominal's magazine in its state.
//     Checked: with the magazine back at 28 all five old hashes still match.)
// (2026-09-29: all five re-recorded for the owner's "scale all damage taken and
//     given down to 100 health per player ... proportionally so it's just the
//     numbers that change": every health and damage number is a fifth of what
//     it was (config/gameplay.js HP_STEP, hpRound, hpRoll). Checked with a
//     replay harness on the old and new code (all eight weapons solo, three
//     robot battles, a hosted match): every position, tick and death matches
//     and every health/damage figure is the old one / 5 within 1e-6.)
// (2026-09-29: robots and hosted re-recorded again, 41a50a4a -> 8a9fa015 and
//     7bf3d4e9 -> 1587197d, for the owner's robot aim rebalance ("make it miss a
//     bit more ... make easy extra easy and make hard actually hard"): new skill
//     numbers, per-weapon aim (WEAPON_AIM), melee misjudgement, trigger rests,
//     Ichor's guard and Static's quick shot in robot-brain.js. The three solo
//     replays are unchanged.)
// (2026-09-29: hosted re-recorded, 1587197d -> 603debcc, for the owner's
//     syphon ("50 siphon off each kill" in FFA, 25 in the other modes, instead
//     of half the lost health; config/match.js syphonAmount). Checked: with the
//     old syphon formula put back the hosted replay gives 1587197d again.)
// (balance pass 2026-09-30, owner-requested ("rebalance every weapon's numbers
//     ... so balance is fair AND satisfying"): rifle, shotgun, robots and hosted
//     re-recorded, c2ba93c4 -> 6d1a877a, b1676071 -> 632d6dc5, 8a9fa015 ->
//     e57de5bc, 603debcc -> 9567daad: Nominal's and Ballast's numbers (and the
//     robots' weapons') changed, see BALANCE_PASS.md. static unchanged (its
//     replay never streams at range, and the orbs, volleys and hex are as
//     before).)
// (balance pass review, 2026-09-30: rifle and robots re-recorded again,
//     6d1a877a -> e851e5a3 and e57de5bc -> b044c4ab, for Nominal's aimed-in
//     cone .075 -> .06 (and Omen's late rupture / Ichor's Frenzy in the robot
//     fight). static, shotgun and hosted unchanged.)
// (robot behaviour pass 2026-09-30, owner-requested ("make bots a bit more
//     dynamic ... kept chasing me without backing off or initiating"): robots
//     and hosted re-recorded, b044c4ab -> 6ab720f6 and 9567daad -> de1d6b0, for
//     the robots' engagement loop (bots/engagement.js: approach, engage, press,
//     disengage, reset), new bands, Static volleys, blade dash-ins
//     (robot-brain.js). static, rifle and shotgun unchanged (no robots).)
// (review of the hex fix + robot pass, 2026-09-30: robots re-recorded,
//     6ab720f6 -> 1ed10911, for engagement.js: a press starts its own chase
//     clock (it inherited the last approach's and turned straight back into a
//     disengage), and Static waiting for its orbs does not come back in or
//     counter-press until they are back. Everything else unchanged.)
// (review follow-up, 2026-09-30: robots re-recorded, 1ed10911 -> 100c42d8:
//     chases judged by closing speed, jinks only when aimed at, blades dash in
//     at someone backing away, Static saves for its hex and waits nearer it,
//     its robots' aim no longer eased (WEAPON_AIM static 1). Hosted unchanged.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { maps } from '../src/maps.js';
import { BotMatch } from '../src/bots/bot-match.js';
import { createLoopback } from '../src/net/transport.js';
import { HostSession } from '../src/net/host-session.js';
import { ClientSession } from '../src/net/client-session.js';

// Recorded with Node 22.22 (V8 12.4.254). Math is deterministic within one engine build;
// a different Node major may need a re-record on untouched code, never on new code.
export const GOLDEN = { static: '17d0bb9e', rifle: 'e851e5a3', shotgun: '632d6dc5', robots: '100c42d8', hosted: 'de1d6b0' };

const map = maps.deadwater;
function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function withRandom(seed, run) { const real = Math.random; Math.random = seeded(seed); try { return run(); } finally { Math.random = real; } }
// FNV-1a over text; JSON keeps every double exactly. Maps and Sets become arrays.
function fnv(text, h) { for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
const replacer = (key, value) => value instanceof Map ? ['Map', ...value] : value instanceof Set ? ['Set', ...value] : typeof value === 'function' ? undefined : value;
const json = value => JSON.stringify(value, replacer);
function state(sim) {
  return json([sim.player, sim.time, sim.ammo, sim.stamina, sim.rechargeProgress, sim.rechargeWait, sim.seedCooldown, sim.hexCooldown,
    sim.targets.map(t => [t.id, t.x, t.z, t.hp, t.respawn, t.bulletHits]), sim.props.map(p => [p.id, p.hp]), sim.colliders.length,
    sim.shots, sim.seeds, sim.hexOrbs, sim.hexSpin, sim.spray, sim.rifle, sim.rifleBullets, sim.magazines, sim.shotgun, sim.shotgunPellets,
    sim.scatter, sim.scatterShells, sim.surge, sim.grenades, sim.grenadeCooldown, sim.crops]);
}
// A fixed dance: walk loops, turn, fire in bursts, dodge, use every ability.
function inputAt(i, sim, weapon) {
  const t = i / 60, p = sim.player, target = sim.targets.find(q => q.hp > 0) || { x: p.x + 6, z: p.z };
  const ax = target.x - p.x, az = target.z - p.z, d = Math.hypot(ax, az) || 1;
  const input = { moveX: Math.cos(t * .9), moveZ: Math.sin(t * 1.3), aimX: ax / d, aimZ: az / d, aimPointX: target.x, aimPointZ: target.z,
    fire: (i % 90) < 40, dodge: i % 120 === 60, aiming: (i % 300) > 200, reload: i % 420 === 400, autoRange: i % 700 > 600 };
  if (weapon === 'static') Object.assign(input, { fire: false, seed: (i % 200) < 90, launch: i % 200 === 120, launchPointX: target.x, launchPointZ: target.z, spray: (i % 600) > 540, hex: i % 700 === 350 || i % 700 === 420 });
  if (weapon === 'rifle') Object.assign(input, { grenade: i % 500 === 250, surge: i % 900 === 450 });
  if (weapon === 'shotgun') Object.assign(input, { fire: i % 50 === 10, doubleShot: i % 300 === 150, scatter: i % 800 === 400 || i % 800 === 590 });
  return input;
}
function runWeapon(weapon) {
  return withRandom(1234, () => {
    const sim = new Simulation(map); sim.weapon = weapon; sim.reset();
    let h = 0x811c9dc5;
    for (let i = 1; i <= 1800; i++) {
      sim.step(inputAt(i, sim, weapon));
      h = fnv(json(sim.drainEvents()), h); h = fnv(state(sim), h);
    }
    return h.toString(16);
  });
}
function runRobots() {
  return withRandom(99, () => {
    const you = new Simulation(map); you.weapon = 'rifle'; you.reset(); you.player.id = 'you';
    const bots = new BotMatch(map, { createSim: m => new Simulation(m), random: seeded(7) });
    bots.spawn(you, 'static'); bots.spawn(you, 'shotgun'); bots.spawn(you, 'rifle', { team: 'blue' });
    let h = 0x811c9dc5;
    for (let i = 1; i <= 1500; i++) {
      bots.before(you); you.step(inputAt(i, you, 'rifle')); bots.after(you); bots.step(you);
      h = fnv(json(you.drainEvents()), h); h = fnv(state(you), h);
      for (const b of bots.bots) h = fnv(json([b.id, b.alive, b.brain.mode, b.sim.player, b.sim.drainEvents()]), h);
    }
    return h.toString(16);
  });
}
// Aim at the nearest other body, walk a loop, fire in bursts, dodge now and then.
function duelInput(i, sim, others, weapon) {
  const p = sim.player, t = i / 60;
  let best = null, bestD = Infinity; for (const o of others) { const d = Math.hypot(o.x - p.x, o.z - p.z); if (d > .1 && d < bestD) { bestD = d; best = o; } }
  const tx = best ? best.x : p.x + 5, tz = best ? best.z : p.z, d = Math.hypot(tx - p.x, tz - p.z) || 1;
  return { moveX: Math.cos(t * 1.1), moveZ: Math.sin(t * .8), aimX: (tx - p.x) / d, aimZ: (tz - p.z) / d, aimPointX: tx, aimPointZ: tz,
    fire: weapon === 'shotgun' ? i % 45 === 5 : (i % 80) < 35, dodge: i % 150 === 75, reload: i % 500 === 480, grenade: weapon === 'rifle' && i % 400 === 200 };
}
function runHosted() {
  return withRandom(4321, () => {
    const net = createLoopback(), createSim = m => new Simulation(m), hostSim = createSim(map);
    let time = 0; const now = () => time;
    const host = new HostSession({ transport: net.host('ABCDE'), map, local: hostSim, createSim, now, name: 'Hosty', random: seeded(3), settings: { robots: 'off', storm: 'off' } }); // (the storm off: this replay is the flat rules; tests/storm.test.js has the storm)
    const joinSim = createSim(map), join = new ClientSession({ transport: net.join('ABCDE'), map, local: joinSim, createSim, now, name: 'P0' });
    net.flush();
    host.startRound('ffa'); host.addRobot(); host.choose('rifle'); net.flush(); if (join.welcomed) join.choose('shotgun'); net.flush();
    const bodies = () => [...host.arena.seats.values()].filter(s => s.sim.player.hp > 0).map(s => s.sim.player);
    let h = 0x811c9dc5;
    for (let i = 1; i <= 1500; i++) {
      time += 1 / 60;
      if (i === 30) {   // bring everyone together once they are in, so the match fights
        const spots = [[0, 0], [5, 1], [-4, 4]]; let k = 0;
        for (const seat of host.arena.seats.values()) { const [x, z] = spots[k++ % 3]; Object.assign(seat.sim.player, { x, z, vx: 0, vz: 0 }); if (seat.id !== 'host' && !seat.robot) Object.assign(joinSim.player, { x, z, vx: 0, vz: 0 }); }
      }
      hostSim.step(host.beforeLocal(duelInput(i, hostSim, bodies(), 'rifle')));
      joinSim.step(join.input(duelInput(i + 37, joinSim, bodies(), 'shotgun'))); h = fnv(json(joinSim.drainEvents()), h);
      net.flush(); host.step(); h = fnv(json(hostSim.drainEvents()), h); net.flush();
      h = fnv(state(hostSim), h); h = fnv(state(joinSim), h);
      for (const seat of host.arena.seats.values()) h = fnv(json([seat.id, seat.slot, seat.team, seat.sim.player, seat.dead, seat.stats]), h);
    }
    return h.toString(16);
  });
}

const RUNS = { static: () => runWeapon('static'), rifle: () => runWeapon('rifle'), shotgun: () => runWeapon('shotgun'), robots: runRobots, hosted: runHosted };
for (const [name, run] of Object.entries(RUNS)) {
  test(`Deadwater replays exactly as before the hills system: ${name}`, () => {
    const a = run(), b = run();
    assert.equal(a, b, 'the run repeats itself exactly');
    if (GOLDEN[name] === 'RECORD') { console.log(`GOLDEN ${name} ${a}`); return; }
    assert.equal(a, GOLDEN[name]);
  });
}
