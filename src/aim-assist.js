// Aim assist, for every aim that is not a mouse: arrow keys, walking to aim,
// and a finger on a phone. The mouse never gets it.
//
// Two helpers, one lock:
//  - Range (auto-range.js): the aim reaches out to what it points at, so
//    orbs, volleys and grenades land at a useful depth.
//  - Stick: once the aim roughly points at a target (inside the acquire cone),
//    the aim bends toward it by `pull`, and keeps bending toward it as the
//    player or the target moves, so strafing does not drag the aim off.
//
// Letting go is the player's call. Movement never breaks a lock (only the
// wide `hold` angle or the target dying does), but turning the aim away from
// the target does: every degree the player's own input turns away from it
// adds to `resist`, the pull fades as resist builds, and at `release` degrees
// the lock lets go. That target is then left alone for `cooldown` seconds
// unless the aim comes straight back onto it.
//
// Levels (config/gameplay.js AIM_ASSIST): touch is the strongest, keyboard a
// lighter version, mouse none. Players can turn it off on touch in
// Settings > Mobile (settings.aimAssist). Online the host runs this with the
// joiner's own input, so it is the same for everyone.
import { AIM_ASSIST } from './config/gameplay.js';
import { autoRangeTarget } from './auto-range.js';

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const alive = t => t && !(t.hp !== undefined && t.hp <= 0);

// The aim direction to use this tick. `raw` is the angle the player's own
// input asks for; the result is that angle bent toward the locked target.
// Updates player.assistTargetId and the lock state on `player`.
export function assistAim(player, targets, rawAngle, mode) {
 const level = AIM_ASSIST[mode];
 if (!level) { clearAssist(player); return rawAngle; }
 const state = player.assist ||= { id: null, resist: 0, lastRaw: rawAngle, ignoreId: null, ignoreFor: 0 };
 const turned = wrap(rawAngle - state.lastRaw);
 state.lastRaw = rawAngle;
 state.ignoreFor = Math.max(0, state.ignoreFor - 1 / 60);
 if (!state.ignoreFor) state.ignoreId = null;
 let target = state.id !== null ? targets.find(t => t.id === state.id) : null;
 if (target) {
  const toTarget = Math.atan2(target.z - player.z, target.x - player.x);
  const error = wrap(toTarget - rawAngle), distance = Math.hypot(target.x - player.x, target.z - player.z);
  // Turning the input further from the target is the player pulling away.
  if (turned * error < 0) state.resist += Math.abs(turned); else state.resist = Math.max(0, state.resist - Math.abs(turned) * .5);
  if (!alive(target) || distance > level.maxRange || Math.abs(error) > level.hold || state.resist > level.release) {
   if (state.resist > level.release) { state.ignoreId = target.id; state.ignoreFor = level.cooldown; }
   target = null;
  }
 }
 if (!target) {
  state.resist = 0;
  const probe = { x: player.x, z: player.z, aimX: Math.cos(rawAngle), aimZ: Math.sin(rawAngle) };
  const candidates = state.ignoreId === null ? targets : targets.filter(t => t.id !== state.ignoreId || tightlyOn(probe, t, level));
  target = autoRangeTarget(probe, candidates, null, mode);
 }
 state.id = target ? target.id : null;
 player.assistTargetId = state.id;
 if (!target) return rawAngle;
 const toTarget = Math.atan2(target.z - player.z, target.x - player.x);
 const strength = level.pull * Math.max(0, 1 - state.resist / level.release);
 return rawAngle + wrap(toTarget - rawAngle) * strength;
}

// Straight back onto a target the player just pulled away from.
function tightlyOn(probe, t, level) {
 const toTarget = Math.atan2(t.z - probe.z, t.x - probe.x);
 return Math.abs(wrap(toTarget - Math.atan2(probe.aimZ, probe.aimX))) < level.reacquire;
}

export function clearAssist(player) {
 if (player.assist) player.assist.id = null;
 player.assistTargetId = null;
}
