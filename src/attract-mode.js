// The living menu (owner, 2026-10-02: "Loading straight into a lobby-like
// main menu with a looping background match behind the menu, so the game
// looks alive the moment the page opens."). Behind the title and the menu
// pages a few bots fight on the map this page has loaded, the camera drifting
// slowly over them, dimmed under the menu (styles/attract.css). No DOM here:
// attract-wiring.js decides when it runs and draws it; this is the match.
//
// How it works. Its own Simulation (`sim`, the "you" of this match: a ghost
// nobody sees, hits or follows, BotMatch.youOut) and its own BotMatch, so the
// page's real sim and bots are never touched. The bots are ordinary robots
// (free for all, Normal, random weapons and makes), told where everyone is
// (`robotSeeAll`, as the robot lab does) so they keep finding each other, and
// they come back near the camera when they fall. The ghost is the camera: it
// eases toward the fight, never more than ATTRACT.leash from the spot the
// match opened on, with a slow drift on top. Each page load opens on the next
// of the map's good-looking spots (attractSpots: the weapon pick's view, the
// map card's picture, the spawn). Every ATTRACT.resetEvery seconds the world is
// put back (broken props, blood, bodies) so it never ends up a wreck.
//
// It steps at the game's fixed rate (the bots are tuned to it) and the view
// draws it through the renderer the page already has (WorldView.update with
// this sim and the bots' bodies and shots, as a BOTS game draws). Nothing is
// heard: its events go to the view, never to the sound. `stop(view, sim)`
// frees everything and puts the view back on the real sim (view.reset).
import { Simulation, RULES } from './simulation.js';
import { BotMatch } from './bots/bot-match.js';
import { drawSim } from './net/projectiles.js';

export const ATTRACT = Object.freeze({
 bots: 4, phoneBots: 3,   // bots fighting (fewer on a phone: their thinking is the cost)
 fps: 30,                 // drawn frames a second, at most
 scale: .8, phoneScale: .62, // share of the preset's own drawing size (crisp-output.js setScale): fewer pixels, a softer look under the menu
 leash: 14,               // m the camera may follow the fight away from its spot
 drift: 3.2,              // m: the slow drift's radius
 driftLap: 64,            // s for one lap of it
 follow: .45,             // 1/s: how quickly the camera point eases toward where it wants to be
 range: [5, 12],          // m from the camera where bots come in
 resetEvery: 150,         // s between world resets
 maxSteps: 4,             // fixed steps at most per frame (a long frame never spirals)
});

// Whether this device and page should run it, and why not. Off on Potato,
// drawn in software, on 2 GB or less or 2 cores or fewer, with reduced motion
// asked for, on the tutorial's range, or after it ran slow here (`slowUntil`,
// attract-wiring.js). `force` (a development build's ?attract=on) skips the
// device checks.
export function attractAllowed({ map = null, quality = 'balanced', software = false, memory = 0, cores = 0, reducedMotion = false, slowUntil = 0, now = Date.now(), force = null } = {}) {
 if (force === 'off') return { ok: false, why: 'switched off' };
 if (!map || map.training) return { ok: false, why: 'no match on this map' };
 if (force === 'on') return { ok: true, why: 'forced' };
 if (quality === 'potato') return { ok: false, why: 'potato preset' };
 if (software) return { ok: false, why: 'software drawing' };
 if (memory && memory <= 2) return { ok: false, why: 'little memory' };
 if (cores && cores <= 2) return { ok: false, why: 'few cores' };
 if (reducedMotion) return { ok: false, why: 'reduced motion' };
 if (slowUntil && now < slowUntil) return { ok: false, why: 'ran slow here' };
 return { ok: true, why: '' };
}

// The map's good-looking spots, in order: the weapon pick's view, the map
// card's picture spot, the spawn (net/pick-view.js picks the same way).
export function attractSpots(map) {
 const spots = [];
 for (const s of [map?.pickView, map?.card?.thumbnail, map?.thumbnail, map?.spawn]) {
  if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
  if (spots.some(o => Math.hypot(o.x - s.x, o.z - s.z) < 8)) continue;
  spots.push({ x: s.x, z: s.z });
 }
 return spots.length ? spots : [{ x: 0, z: 0 }];
}
// The spot for this page load: `turn` counts loads (attract-wiring.js keeps it).
export const attractSpot = (map, turn = 0) => { const spots = attractSpots(map); return spots[((Math.floor(turn) % spots.length) + spots.length) % spots.length]; };

export class AttractMatch {
 // `createSim(map)`: a Simulation (tests may hand in their own).
 constructor({ map, spot = attractSpot(map), bots = ATTRACT.bots, random = Math.random, createSim = m => new Simulation(m) }) {
  Object.assign(this, { map, spot, count: bots, random, createSim });
  this.sim = null; this.bots = null; this.clock = 0; this.accumulator = 0; this.sinceReset = 0; this.previous = null; this.aim = { x: spot.x, z: spot.z };
 }
 get active() { return !!this.sim; }

 start() {
  if (this.sim) return this;
  const sim = this.createSim(this.map);
  // The ghost: no body, no targets, nothing can hurt it; the bots know where
  // everyone is. (No practice targets: this is a match, not the range.)
  sim.noTargets = true; sim.targets = [];
  sim.dev = { ...sim.dev, ghost: true, invulnerable: true, robotSeeAll: true };
  sim.player.x = this.spot.x; sim.player.z = this.spot.z; sim.player.vx = sim.player.vz = 0;
  const clockSim = sim;
  const bots = new BotMatch(this.map, { createSim: m => Object.assign(this.createSim(m), { clockSource: clockSim }), random: this.random });
  bots.youOut = true; bots.enemyRange = [...ATTRACT.range];
  // Fallen bots come back near the camera (the ghost), not across the map.
  bots.respawnSpot = (bot, main) => bots.spot(main.player, ATTRACT.range[0], ATTRACT.range[1], main.colliders);
  for (let i = 0; i < this.count; i++) bots.spawn(sim, null, { team: 'ffa', skill: 'normal' });
  Object.assign(this, { sim, bots, clock: 0, accumulator: 0, sinceReset: 0, previous: { ...sim.player }, aim: { x: this.spot.x, z: this.spot.z } });
  return this;
 }

 // Where the camera wants to be: toward the living bots' middle (held within
 // the leash of the spot), plus the slow drift.
 cameraGoal() {
  const living = this.bots.living();
  let x = this.spot.x, z = this.spot.z;
  if (living.length) {
   let cx = 0, cz = 0; for (const b of living) { cx += b.sim.player.x; cz += b.sim.player.z; }
   cx /= living.length; cz /= living.length;
   const dx = cx - this.spot.x, dz = cz - this.spot.z, d = Math.hypot(dx, dz), k = d > ATTRACT.leash ? ATTRACT.leash / d : 1;
   x += dx * k; z += dz * k;
  }
  const a = this.clock / ATTRACT.driftLap * Math.PI * 2;
  return { x: x + Math.cos(a) * ATTRACT.drift, z: z + Math.sin(a * 2) * ATTRACT.drift * .5 };
 }

 // One fixed step: the bots think and fight, the ghost glides.
 tick(out) {
  const { sim, bots } = this, dt = RULES.step;
  this.previous = { ...sim.player };
  const goal = this.cameraGoal(), k = 1 - Math.exp(-ATTRACT.follow * dt);
  this.aim.x += (goal.x - this.aim.x) * k; this.aim.z += (goal.z - this.aim.z) * k;
  bots.before(sim);
  sim.step({ moveX: 0, moveZ: 0, aimX: sim.player.aimX || 1, aimZ: sim.player.aimZ || 0 });
  bots.after(sim); bots.step(sim, dt);
  // (Placed, not walked: a ghost goes through walls, and the camera must not wobble.)
  Object.assign(sim.player, { x: this.aim.x, z: this.aim.z, vx: 0, vz: 0 });
  for (const e of sim.drainEvents()) out.push({ e, own: true });
  for (const item of bots.drain()) out.push(item);
  this.clock += dt; this.sinceReset += dt;
  if (this.sinceReset >= ATTRACT.resetEvery) { this.sinceReset = 0; sim.resetWorld(); for (const e of sim.drainEvents()) out.push({ e, own: true }); }
 }

 // One bot fewer (never under two): a fallen one first, else the last. For a
 // device where their thinking costs too much (attract-wiring.js).
 shed() {
  if (!this.bots || this.bots.count <= 2) return false;
  const bot = this.bots.bots.find(b => !b.alive) || this.bots.bots[this.bots.bots.length - 1];
  return this.bots.remove(bot);
 }

 // Steps for `dt` seconds of real time; returns the events for the view.
 step(dt) {
  const out = [];
  if (!this.sim) return out;
  this.accumulator = Math.min(this.accumulator + Math.max(0, dt), RULES.step * ATTRACT.maxSteps);
  while (this.accumulator >= RULES.step) { this.accumulator -= RULES.step; this.tick(out); }
  return out;
 }

 // Hands the events to the view (never to the sound).
 feed(view, events) {
  for (const item of events) {
   try {
    if (!item.own) view.netEvent(item.e, item.shooter, item.slot);
    else if (item.e.type === 'mapReset' || item.e.type === 'propRestore') view.netEvent(item.e, null, 0);
    else view.event(item.e);
   } catch (error) { console.warn('Menu match effect skipped:', error); }
  }
 }

 // One drawn frame of it (`renderDelta`: seconds since the last drawn one).
 draw(view, renderDelta) {
  if (!this.sim) return;
  const alpha = this.accumulator / RULES.step;
  view.remotePlayers = this.bots.others(alpha);
  view.update(drawSim(this.sim, this.bots.foreign(this.clock)), renderDelta, true, this.clock, this.previous || this.sim.player, alpha);
 }

 // Everything goes; the view is put back on the page's real sim. The props
 // this match broke stand again (quietly), blood, bodies and effects go.
 stop(view, mainSim) {
  if (!this.sim) return false;
  const { sim, bots } = this;
  try {
   bots.clear();
   sim.resetWorld();
   if (view) {
    for (const e of sim.drainEvents()) if (e.type === 'propRestore') view.netEvent({ ...e, quiet: true }, null, 0);
    view.remotePlayers = [];
    if (mainSim) view.reset(mainSim);
    view.cutCamera?.();
   }
  } finally {
   this.sim = null; this.bots = null; this.previous = null; this.accumulator = 0;
  }
  return true;
 }
}
