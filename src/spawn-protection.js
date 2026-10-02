// Spawn protection (owner, 2026-10-01: "... and the spawn protection";
// approved: about 1.5 s that ends early if you shoot, attack or use an
// ability). Gameplay, so it lives with the rules and is shared by the online
// arena, the robots and every screen:
// - `player.guard`: seconds of protection left. Only present while it runs
//   (deleted at 0), so a sim that never respawns carries nothing new.
// - Granted by whoever brings a body back after a death: net/arena.js
//   `enter` (every mode but the elimination ones), bots/bot-match.js (a robot
//   back after its wait) and main.js (your practice / BOTS FFA respawn).
// - Simulation.step counts it down and ends it the moment any attack or
//   ability is pressed (ATTACK_PRESSES).
// - While it runs: Simulation.hit ignores a shot at a proxy carrying `guard`
//   (a `guardBlock` event instead of a hit) and damagePlayer takes nothing
//   but the world's own damage (the storm, fire).
// - Seen by everyone: the player state carries `guard` (protocol.js), every
//   screen draws a shimmer round the body (render/spawn-shimmer.js).
import { SPAWN_PROTECTION } from './config/gameplay.js';

// Every press that fires a weapon or uses an ability. Moving, aiming in,
// dodging, reloading, Ichor's guard and Sightline's stance do not count.
export const ATTACK_PRESSES = Object.freeze(['fire', 'tapFire', 'quickShot', 'launch', 'seed', 'spray', 'hex', 'grenade', 'surge', 'scatter', 'doubleShot',
 'sheathE', 'sheathX', 'ichorE', 'ichorX', 'sidekickMine', 'sidekickX', 'sightlineX', 'omenPrime', 'omenVolley']);

export function grantSpawnGuard(player, seconds = SPAWN_PROTECTION.time) {
 if (!player || player.dead || !(seconds > 0)) return;
 player.guard = seconds;
}
export const guarded = player => !!player && player.guard > 0 && !player.dead;
export const attacking = input => { if (!input) return false; for (const key of ATTACK_PRESSES) if (input[key]) return true; return false; };

// One tick: an attack ends it now, otherwise it runs down. Returns true on
// the tick it ends.
export function stepSpawnGuard(player, input, dt) {
 if (!(player?.guard > 0)) { if (player && 'guard' in player) delete player.guard; return false; }
 player.guard = attacking(input) ? 0 : Math.max(0, player.guard - dt);
 if (player.guard <= 1e-9) { delete player.guard; return true; }
 return false;
}
// What a stand-in (a proxy in someone else's targets) carries.
export const guardFlag = player => (guarded(player) ? { guard: true } : null);
