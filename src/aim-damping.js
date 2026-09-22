// Two problems with aiming a point-tracked weapon, both worst near the body.
//
// Gain: the angular change per unit of cursor movement goes as 1/distance, so
// the same drag swings the character further the closer the cursor sits to it.
// Inside CLOSE_RANGE the cursor's own angular change is scaled by
// distance/radius, which cancels that term exactly — a drag near the body turns
// the character by what it would have turned at the cutoff. Rotation continues
// at every distance and the facing is never pulled toward the cursor, so
// nothing snaps on the way in or out.
//
// Rate: dragging across the character moves the bearing to the far side in one
// frame, and the character simply faces the other way with no turn at all. The
// facing is eased toward its target with a speed ceiling, so an ordinary
// adjustment still lands within a frame or two while a reversal reads as a
// brief turn. The ceiling is what shapes a large swing; the rate only softens
// the last degree so the turn settles instead of stopping dead.
//
// Nominal and Ballast only: Static aims by direction and never reads a point.
export const AIM_FEEL = Object.freeze({
 closeRange: 2,
 turnRate: 120,
 maxTurnSpeed: 18,
});

export const aimsByPoint = weapon => weapon === 'rifle' || weapon === 'shotgun';

const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export function createAimDamping(feel = AIM_FEEL) {
  const { closeRange, turnRate, maxTurnSpeed } = { ...AIM_FEEL, ...feel };
  // The close-range scaling is incremental, so it needs the cursor's previous
  // bearing. Null means "not inside last frame": re-entry adds no rotation.
  let previousBearing = null;
  return {
    reset() { previousBearing = null; },
    get engaged() { return previousBearing !== null; },
    apply(aim, player, dt = 1 / 60) {
      if (!aim) return aim;
      // view.aim omits the point when the ray misses the aim plane; fall back to
      // the raw delta so a missing point is measured rather than assumed distant.
      const pointX = Number.isFinite(aim.aimPointX) ? aim.aimPointX : player.x + aim.aimX;
      const pointZ = Number.isFinite(aim.aimPointZ) ? aim.aimPointZ : player.z + aim.aimZ;
      const dx = pointX - player.x, dz = pointZ - player.z;
      const distance = Math.hypot(dx, dz);
      const facing = Math.atan2(player.aimZ, player.aimX);
      const close = distance < closeRange;
      let desired;
      if (close) {
        const bearing = distance > 1e-9 ? Math.atan2(dz, dx) : previousBearing;
        const step = previousBearing === null || bearing === null ? 0
          : wrap(bearing - previousBearing) * (distance / closeRange);
        previousBearing = bearing;
        desired = facing + step;
      } else {
        previousBearing = null;
        desired = Math.atan2(dz, dx);
      }
      const error = wrap(desired - facing);
      const turn = Math.sign(error) * Math.min(Math.abs(error) * (1 - Math.exp(-turnRate * dt)), maxTurnSpeed * dt);
      const angle = facing + turn;
      const aimX = Math.cos(angle), aimZ = Math.sin(angle);
      // Keep the focus point on the facing the character actually has, so the
      // cone, the spread projection and the shot all agree during the turn. Its
      // depth is the cursor's, floored at the cutoff so it never collapses.
      const reach = Math.max(distance, closeRange);
      return { aimX, aimZ, aimPointX: player.x + aimX * reach, aimPointZ: player.z + aimZ * reach };
    },
  };
}
