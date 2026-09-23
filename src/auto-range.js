// Aim assist for direction-only aim: how far out the aim reaches.
//
// Arrow keys, and walking on a phone, give the aim a direction but no
// distance. The assist never touches the direction -- that is the player's --
// and it never jumps the aim dot onto anything. It only picks what the aim
// line is pointing at and lets the reach slide out or in to that distance
// over a few tenths of a second (settle), so orbs, volleys and grenades land
// at a useful depth. Mouse aim is never assisted.
//
// Players come first: anything with kind 'player' outranks everything else.
// In practice and training the targets and dummies stand in for players.
// A lock is sticky, so sweeping across two targets side by side does not
// make the reach swing between them.
import { AUTO_RANGE } from './config/gameplay.js';
export { AUTO_RANGE };

export function autoRangeTarget(player, candidates, lockedId = null, mode = 'keyboard') {
 const { aimX, aimZ } = player, tan = Math.tan(AUTO_RANGE.halfAngle[mode] ?? AUTO_RANGE.halfAngle.keyboard);
 const fit = (c, slack) => {
  if (c.hp !== undefined && c.hp <= 0) return Infinity;
  const dx = c.x - player.x, dz = c.z - player.z, along = dx * aimX + dz * aimZ;
  if (along < AUTO_RANGE.min || along > AUTO_RANGE.max * slack) return Infinity;
  const allowed = Math.max(AUTO_RANGE.lateral, along * tan) * slack, lateral = Math.abs(dx * aimZ - dz * aimX);
  if (lateral > allowed) return Infinity;
  return lateral / allowed + .35 * along / AUTO_RANGE.max - (c.kind === 'player' ? AUTO_RANGE.playerBonus : 0);
 };
 if (lockedId !== null) {
  const held = candidates.find(c => c.id === lockedId);
  if (held && fit(held, AUTO_RANGE.keep) < Infinity) return held;
 }
 let best = null, score = Infinity;
 for (const c of candidates) { const s = fit(c, 1); if (s < score) { score = s; best = c; } }
 return best;
}

// How far along the aim line the target sits: the reach the assist settles to.
export function autoRangeDistance(player, target) {
 const along = (target.x - player.x) * player.aimX + (target.z - player.z) * player.aimZ;
 return Math.max(AUTO_RANGE.min, Math.min(AUTO_RANGE.max, along));
}
