// The world's animals: Hollow Wick's goat (owner, 2026-09-29: "give the goat
// that lives in hollow wick gore and make its head drop in the pile of gore
// when its killed. it can be shot or killed with blades that pass through the
// fence").
//
// Pure (no three.js). One `Critters` per world: SOLO the game's own sim holds
// it (main.js), online the host's arena (net/arena.js) and every seat's sim
// on the host shares it; a joiner has none (it draws the host's goat from the
// match state and its death from the host's `kill` event).
//
//  - Its mind (world/goat-mind.js GoatMind) is stepped here, once a tick, by
//    whoever holds the world: grazing, looking about, staring at the nearest
//    player. The view draws that same mind (world/hollow-life.js).
//  - While it lives it is a target in every sim that holds these critters
//    (Simulation.step adds it for the length of a step: `critter: true`, kind
//    'goat'), so every weapon that hurts a target hurts it. The pen's hurdles
//    stop bodies only (hollow-life.js LIFE_TYPES: playerOnly), so shots and
//    blades reach it over and through them.
//  - It is never a player's target otherwise: no lock, no aim help, no kill
//    counted, no stats (Simulation).
//  - Dead, it stays dead until the world is reset (a new match, RESTART).
import { GoatMind, GOAT } from './world/goat-mind.js';
import { mapProps } from './maps.js';

export const CRITTER = Object.freeze({
 goatHealth: 30,    // of a player's 100: a few shots, one good cut
 step: 1 / 60,
});

// Where a pen-local point is in the world (the prop's frame: local x along
// (cos a, -sin a), as world/hollow-life.js frameOf).
const toWorld = (pen, lx, lz) => [pen.x + lx * pen.c + lz * pen.s, pen.z - lx * pen.s + lz * pen.c];

export class Critters {
 constructor(map) {
  this.goats = mapProps(map).filter(p => p.type === 'goatPen').map(p => {
   const pen = { x: p.x, z: p.z, angle: p.angle || 0, c: Math.cos(p.angle || 0), s: Math.sin(p.angle || 0) };
   // (The seed the view has always used for this pen's goat.)
   const seed = 1 + Math.round(Math.abs(p.x * 13 + p.z * 7));
   return { id: 'goat:' + p.id, penId: p.id, pen, seed, mind: new GoatMind(seed), dead: false, fell: null, proxy: null };
  });
  this.clock = { t: 0, dt: CRITTER.step };
  this.reset();
 }
 get any() { return this.goats.length > 0; }

 // Everyone alive again, where they started.
 reset() {
  for (const g of this.goats) {
   g.mind = new GoatMind(g.seed); g.dead = false; g.fell = null;
   g.proxy = { id: g.id, kind: 'goat', critter: true, hp: CRITTER.goatHealth, maxHp: CRITTER.goatHealth, respawn: 0, flash: 0, moving: false, x: 0, z: 0, baseX: 0, spawnX: 0, spawnZ: 0 };
   this.place(g);
  }
 }

 // Its body's middle in the world (the footprint's centre, a little ahead of
 // where it stands), and which way it faces (world yaw: the pen's turn plus its own).
 place(g) {
  const m = g.mind, ahead = (GOAT.front - GOAT.back) / 2, lx = m.x + Math.sin(m.heading) * ahead, lz = m.z + Math.cos(m.heading) * ahead;
  const [x, z] = toWorld(g.pen, lx, lz), p = g.proxy;
  p.x = p.baseX = p.spawnX = x; p.z = p.spawnZ = z;
 }
 where(g) { const [x, z] = toWorld(g.pen, g.mind.x, g.mind.z); return { x, z, heading: g.pen.angle + g.mind.heading }; }

 // One tick of the world (`dt` s): each living goat looks at the nearest of
 // `bodies` ({ x, z }), grazes, steps about.
 tick(dt, bodies = []) {
  this.clock.t += dt; this.clock.dt = dt;
  for (const g of this.goats) {
   this.settle(g);
   if (g.dead) continue;
   const seen = g.mind.player, here = this.where(g); seen.d = Infinity;
   for (const b of bodies) {
    if (!b) continue;
    const d = Math.hypot(b.x - here.x, b.z - here.z);
    if (d < seen.d) { seen.d = d; const ox = b.x - g.pen.x, oz = b.z - g.pen.z; seen.x = ox * g.pen.c - oz * g.pen.s; seen.z = ox * g.pen.s + oz * g.pen.c; }
   }
   g.mind.step(this.clock);
   this.place(g);
   g.proxy.flash = Math.max(0, g.proxy.flash - dt);
  }
 }

 // The living goats as targets for a sim's step (the same objects every
 // time: damage from any sim lands on the one goat).
 targets() {
  let out = null;
  for (const g of this.goats) { this.settle(g); if (!g.dead) (out ||= []).push(g.proxy); }
  return out;
 }
 // A goat whose health ran out is dead (noted once, with how it fell).
 settle(g) {
  if (g.dead || g.proxy.hp > 0) return;
  g.dead = true; g.fell = { x: g.proxy.x, z: g.proxy.z, ...this.where(g), time: this.clock.t };
 }
 // After a sim's step (Simulation.step): who died in it.
 after() { for (const g of this.goats) this.settle(g); }

 // For the wire (the match state): [x, z, heading, dead ? 1 : 0] each, in centimetres.
 state() {
  if (!this.goats.length) return null;
  const cm = v => Math.round(v * 100) / 100;
  return this.goats.map(g => { const w = this.where(g); return [cm(w.x), cm(w.z), cm(w.heading), g.dead ? 1 : 0]; });
 }
}

// A goat's place from the wire, in its pen's own frame (for a joiner's view,
// which steps its own mind for the neck, ears and tail).
export function penLocal(pen, x, z) {
 const c = Math.cos(pen.angle || 0), s = Math.sin(pen.angle || 0), ox = x - pen.x, oz = z - pen.z;
 return { x: ox * c - oz * s, z: ox * s + oz * c };
}
