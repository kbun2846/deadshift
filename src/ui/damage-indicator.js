import {createDirectionalIndicator, FIRE_INDICATOR} from './fire-indicator.js';

export const DAMAGE_INDICATOR = Object.freeze({
 ...FIRE_INDICATOR, instant: true, inset: 24, width: 7.5, spread: 1,
 hold: .16, fade: 2, floor: .75, jitter: .4, softness: .22, color: '255,48,64',
 surroundSegments: 8, surroundCoverage: .62, surroundPeriod: .72,
});

export function damageScreenAngle(event, view) {
 const dx = event.sourceDX, dz = event.sourceDZ;
 if (!Number.isFinite(dx) || !Number.isFinite(dz) || Math.hypot(dx, dz) < 1e-6) return null;
 const p = view.player.position, me = view.screenPoint(p.x, p.z);
 // Project at the player's height: a nearby hill or bridge must not turn the
 // incoming direction upward/downward on screen.
 const lift = view.gy ? view.gy(p.x, p.z) - view.gy(p.x + dx, p.z + dz) : 0;
 const from = view.screenPoint(p.x + dx, p.z + dz, .72 + lift);
 return Math.atan2(from.y - me.y, from.x - me.x);
}

export function createDamageIndicator(parent) {
 const indicator = createDirectionalIndicator(parent, DAMAGE_INDICATOR, 'damage-indicator');
 return {
  ...indicator,
  hit(event, view) {
   if (!(event.damage > 0)) return;
   const angle = damageScreenAngle(event, view);
   if (angle === null) indicator.surround(.44);
   else indicator.add(angle, Math.min(1, event.damage / 60));
  },
 };
}
