// Nominal's Surge (X), replacing the extended magazine (v0.83).
//
// Press X (cooldown ready, alive, holding Nominal): a two-second power-up.
// Yellow beams race in over the ground toward you, kicking dust and breaking
// the breakables they cross near you, turning white as they close in; then
// the power lands and for five seconds you glow white:
//  - bullets do SURGE.damage (2x) and use no ammo, and the gun never reloads;
//  - you take SURGE.taken (85%) of any damage and move SURGE.speed (1.1x);
//  - a grenade thrown now carries GRENADE.surgeBonus (+100) instead of +50.
// When it ends the magazine is full (owner, v0.83), whatever happened, and the 50-second
// cooldown starts. Dying or respawning ends it (the cooldown still runs).
//
// Plain state on the sim (`sim.surge`), events for the screen:
// surgeCharge (power-up begins), surgeStart (the glow), surgeEnd.
// No DOM, no three.js.
import { SURGE } from '../config/gameplay.js';
export { SURGE };

export function resetSurge(sim, keepCooldown = false) {
 // A nova cut short (a death, a weapon change) still owes its cooldown.
 const cut = sim.surge && sim.surge.phase !== 'idle';
 const cooldown = keepCooldown ? (cut ? SURGE.cooldown : sim.surge?.cooldown || 0) : 0;
 sim.surge = { phase: 'idle', t: 0, cooldown, active: false };
}

export function surgeReady(sim) { return sim.weapon === 'rifle' && sim.surge.phase === 'idle' && sim.surge.cooldown <= 1e-8; }

// Called every tick (any weapon: the cooldown keeps running).
export function stepSurge(sim, input, dt, { breakAround } = {}) {
 const s = sim.surge, p = sim.player;
 // A joiner's own copy of the game only mirrors the host's nova (loadout):
 // it never advances it, breaks props or reports it (the host does).
 if (sim.predictOnly) return;
 if (sim.dev.cooldowns) s.cooldown = 0;
 s.cooldown = Math.max(0, s.cooldown - dt);
 if ((p.hp <= 0 || p.dead || sim.weapon !== 'rifle') && s.phase !== 'idle') { endSurge(sim, false); return; }
 if (s.phase === 'idle') {
  if (input.surge && surgeReady(sim) && p.hp > 0) {
   s.phase = 'charging'; s.t = 0; s.broke = false;
   sim.events.push({ type: 'surgeCharge', x: p.x, z: p.z, id: ++sim.serial });
  }
  return;
 }
 s.t += dt;
 if (s.phase === 'charging') {
  // The beams reach you just before the power lands: what they crossed breaks.
  if (!s.broke && s.t >= SURGE.charge * .8) { s.broke = true; breakAround?.(p.x, p.z, SURGE.breakRadius); }
  if (s.t >= SURGE.charge) {
   s.phase = 'active'; s.t = 0; s.active = true;
   // Loaded and never reloading while it lasts.
   const r = sim.rifle; r.reload = 0; r.ammo = r.capacity;
   sim.events.push({ type: 'surgeStart', x: p.x, z: p.z, duration: SURGE.duration });
  }
  return;
 }
 // (Developer tools: Endless Surge holds it at full.)
 if (s.phase === 'active' && sim.dev.endlessSurge) s.t = Math.min(s.t, SURGE.duration * .5);
 if (s.phase === 'active' && s.t >= SURGE.duration) endSurge(sim, true);
}

// Over: a full magazine (no reload) and the cooldown.
export function endSurge(sim, finished) {
 const s = sim.surge;
 if (s.phase === 'idle') return;
 s.phase = 'idle'; s.t = 0; s.active = false; s.cooldown = SURGE.cooldown;
 if (sim.rifle) { sim.rifle.ammo = sim.rifle.capacity; sim.rifle.reload = 0; }
 sim.events.push({ type: 'surgeEnd', x: sim.player.x, z: sim.player.z, finished });
}

// Fraction of the power-up done (0-1), or 1 while active: for the HUD and views.
export function surgeProgress(sim) {
 const s = sim.surge; if (!s) return 0;
 return s.phase === 'charging' ? Math.min(1, s.t / SURGE.charge) : s.phase === 'active' ? 1 : 0;
}
