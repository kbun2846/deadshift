import { BALLAST_FATAL_WINDOW, BALLAST_FATAL_FRACTION } from '../config/gameplay.js';
export { BALLAST_FATAL_WINDOW, BALLAST_FATAL_FRACTION };
// Track actual damage from this attacker's shotgun, never unrelated damage.
export function recordBallastDamage(victim,damage,time,owner){
 const recent=victim.hp>=victim.maxHp?[]:(victim.ballastDamage||[]);
 victim.ballastDamage=recent.filter(hit=>time-hit.time<=BALLAST_FATAL_WINDOW&&time>=hit.time);
 victim.ballastDamage.push({damage:Math.min(victim.hp,damage),time,owner});
 return victim.ballastDamage.filter(hit=>hit.owner===owner).reduce((sum,hit)=>sum+hit.damage,0)>=victim.maxHp*BALLAST_FATAL_FRACTION;
}
