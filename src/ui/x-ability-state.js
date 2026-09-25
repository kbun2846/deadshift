// What the X ability is doing, for the colour of its dial and touch button:
//   'cooldown'  recharging, can't be used      (subtle red)
//   'ready'     press X                        (pink)
//   'charging'  powering up / expanding        (yellow): Nominal's Surge
//               charge, Static's hex orbs forming and spreading out
//   'active'    in use                         (blue): Surge running,
//               Static's pulsed hex spinning
// Ballast's Scatter: readied (the red cone) is 'charging', its shells in the
// air 'active'.
import { RULES } from '../config/gameplay.js';
export const X_STATES = Object.freeze(['cooldown', 'ready', 'charging', 'active']);

export function xAbilityState(sim) {
 if (sim.weapon === 'rifle') {
  const s = sim.surge; if (!s) return 'ready';
  if (s.phase === 'charging') return 'charging';
  if (s.phase === 'active') return 'active';
  return s.cooldown > 1e-8 ? 'cooldown' : 'ready';
 }
 if (sim.weapon === 'shotgun') {
  const s = sim.scatter; if (!s) return 'ready';
  if (s.armed) return 'charging';
  if (sim.scatterShells?.length) return 'active';
  return s.cooldown > 1e-8 ? 'cooldown' : 'ready';
 }
 if (sim.hexSpin) return 'active';
 if (sim.hexOrbs?.length) return 'charging';
 // Not enough orbs in hand for it is as good as recharging (the sim would refuse).
 return sim.hexCooldown > 1e-8 || (sim.ammo ?? RULES.hexCost) < RULES.hexCost ? 'cooldown' : 'ready';
}
