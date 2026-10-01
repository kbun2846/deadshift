// Robots and the other side's hex (Static's X; owner, 2026-09-30: "a bot was
// chasing me and i did the static x ability and the bot was able to get
// through and start attacking me").
//
// The rules keep an enemy out of a hex and refuse everything it does from
// outside to whoever is inside (Simulation.keepOutOfHexes / shieldedFrom).
// This is what a robot makes of that, kept in one place so robot-brain.js
// only calls it:
//  - hexTargetCost(brain, m): someone inside an enemy hex is a poor target
//    while there is anyone else to fight (added to think()'s score).
//  - hexAware(brain, input, target): once a tick after the robot has decided
//    (step()): it does not walk or dodge into the hex, backs off to a ring
//    out of reach of its spinning sides (a skilled robot further, out of the
//    zaps), strafes round it waiting the hex out with its aim kept on the
//    target, and holds its fire (and its abilities) while its target is
//    inside, or while its line of fire would only end on the wall.
// Reads `sim.shields` (every hex in the game, handed round by BotMatch and
// the arena). Nothing is made per tick.
import { RULES } from '../config/gameplay.js';
import { insideShield, shieldEntry, shieldFriend, shieldRadius } from '../simulation.js';

// Everything a robot might press that would only spend itself on the wall.
// How far in from the duel circle's edge a robot stays (robot-brain.js
// ROBOT_EDGE; the storm's, one more, as its escapeStorm starts there).
const EDGE = 1.6;
const HELD = ['fire', 'tapFire', 'launch', 'spray', 'grenade', 'doubleShot', 'scatter', 'surge', 'ichorE', 'ichorX', 'sheathE', 'sheathX', 'sidekickMine', 'sidekickX', 'sightlineX', 'omenPrime', 'omenVolley'];

// The enemy hex (not the robot's own, not its side's) that (x, z) is in,
// `pad` metres out from its circle, or null.
export function enemyHexAt(sim, x, z, pad = 0) {
 const list = sim.shields; if (!list?.length) return null;
 const p = sim.player;
 for (const sh of list) {
  if (shieldFriend(sh, p)) continue;
  if (Math.hypot(x - sh.x, z - sh.z) <= shieldRadius(sh) + pad) return sh;
 }
 return null;
}

// Added to a target's score in think(): inside an enemy hex, it cannot be hurt.
export function hexTargetCost(brain, m) {
 return enemyHexAt(brain.sim, m.x, m.z, .2) ? 20 : 0;
}

// How far out from a hex's circle this robot waits: clear of the body push
// (hexBody), and a skilled one clear of the spinning sides' zaps (hexReach).
// (Review 2026-09-30: the hex still bites the less skilled. Easy and normal
// robots wait a little inside the spinning sides' reach, so a corner passing
// zaps them now and then; a hard one (tech 1) waits clear of it.)
export const hexStandoff = brain => RULES.hexBody + .35 + (RULES.hexReach - .1) * .8 * Math.max(0, Math.min(1, brain.pf?.tech ?? .5));

// Nothing of the step outward when `p` is within `edge` of circle `c`'s rim.
function keepIn(input, p, c, edge) {
 if (!c) return;
 const sx = p.x - c.x, sz = p.z - c.z, sd = Math.hypot(sx, sz) || 1e-6;
 if (sd < c.r - edge) return;
 const out = (input.moveX * sx + input.moveZ * sz) / sd;
 if (out > 0) { input.moveX -= sx / sd * out; input.moveZ -= sz / sd * out; }
}

export function hexAware(brain, input, target) {
 const sim = brain.sim, p = sim.player, list = sim.shields;
 if (!list?.length || p.hp <= 0 || p.dead) return;
 const shelter = target && (target.visible || brain.time - target.seen < 1.5) ? enemyHexAt(sim, target.x, target.z, .2) : null;
 const off = hexStandoff(brain);
 let steered = false;
 for (const sh of list) {
  if (shieldFriend(sh, p)) continue;
  const R = shieldRadius(sh), dx = p.x - sh.x, dz = p.z - sh.z, d = Math.hypot(dx, dz) || 1e-6;
  // Only a hex it is near (or the one its target is in) changes how it moves.
  // (Still spreading: kept ahead of where it will be in a moment.)
  const ring = R + off + (sh.grow || 0) * .4;
  if (d > ring + 2.5 && sh !== shelter) continue;
  const nx = dx / d, nz = dz / d;
  let mx = input.moveX || 0, mz = input.moveZ || 0;
  const inward = -(mx * nx + mz * nz);
  // Never a step in toward it: what was meant for the wall goes round it.
  if (inward > 0) { mx += nx * inward; mz += nz * inward; }
  if (d < ring) {
   // Too close: back off to the ring, still weaving round it.
   const back = Math.min(1, (ring - d) / .8);
   mx += nx * back; mz += nz * back;
  } else if (sh === shelter && d < ring + 2.5) {
   // Waiting it out: hold near the ring (a step in if well out), across its face.
   mx -= nx * Math.min(.6, (d - ring) / 2.5);
  }
  if (sh === shelter && d < ring + 2.5) { mx += -nz * brain.strafe * .55; mz += nx * brain.strafe * .55; }
  const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  input.moveX = mx; input.moveZ = mz;
  // A dodge in toward it is turned along it.
  if (input.dodge && -((input.moveX) * nx + (input.moveZ) * nz) > .2) { input.moveX = -nz * brain.strafe; input.moveZ = nx * brain.strafe; }
  steered = true;
 }
 // Backing off never takes it out into the storm, or into the duel circle's
 // fog wall (review 2026-09-30: a hex thrown near the storm's edge held hard
 // robots in the storm, a quarter of the time, to keep out of its zaps): near
 // either edge, nothing of the step goes outward (the storm hurts more).
 if (steered) { keepIn(input, p, sim.storm, EDGE + 1); keepIn(input, p, sim.boundary, EDGE); }
 // Held off the wall on purpose is not stuck (robot-brain.js move's re-plan and dodge).
 if (steered) { const pr = brain.progress; pr.stuck = 0; pr.x = p.x; pr.z = p.z; pr.at = brain.time; }
 // No fire into a hex from outside it: at someone sheltering in one, or down
 // a line that would end on its wall. (Its own hex, already out, it may still pulse.)
 // (Inside it itself, a robot of the other side is still refused: shieldedFrom.)
 let hold = !!shelter;
 if (!hold && brain.aimPoint) {
  const ax = p.x, az = p.z, bx = brain.aimPoint.x, bz = brain.aimPoint.z;
  for (const sh of list) if (!shieldFriend(sh, p) && !insideShield(sh, ax, az) && shieldEntry(sh, ax, az, bx, bz) !== null) { hold = true; break; }
 }
 if (hold) {
  for (const k of HELD) if (input[k]) input[k] = false;
  if (!sim.hexOrbs.length) input.hex = false;
  brain.hexHeld = brain.time;
 }
}
