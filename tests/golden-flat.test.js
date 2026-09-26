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
export const GOLDEN = { static: '879383fe', rifle: '8432f5c1', shotgun: '11dafae', robots: '920a7170', hosted: 'dccd8ec1' };

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
    const host = new HostSession({ transport: net.host('ABCDE'), map, local: hostSim, createSim, now, name: 'Hosty', random: seeded(3), settings: { robots: 'off' } });
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
