import {ICHOR as I} from '../config/gameplay.js';
// A host-only reference on collision proxies shares the recovery lock across
// simultaneous attackers. Clients never send a successful deflection.
export const ichorGuardFor=sim=>sim.weapon==='ichor'&&!sim.player.dead?{ichorGuard:sim.ichor}:{};
export function endIchorGuard(s,exhausted=false){s.guarding=false;if(exhausted)s.guardCooldown=I.guardCooldown;}
export function tryIchorDeflect(target,shot,random=Math.random){
 const s=target.ichorGuard;if(!s||target.hp<=0||!shot.bullet||shot.blast||shot.electric||shot.environmental)return null;
 const ordinary=[undefined,'gunshot','sidekickShot','sightlinePistol','sightlineShot'].includes(shot.damageType),omen=shot.damageType==='omenShot',pellet=shot.damageType==='ballast'&&shot.pellet;
 if(!ordinary&&!(s.guarding&&(omen||pellet)))return null;
 const age=(s.duration||.24)-s.swing,n=Math.hypot(shot.vx||0,shot.vz||0);
 if(n<1e-6)return null;
 if(!s.guarding&&(!(s.swing>0)||age<I.parryStart-1e-8||age>I.parryEnd+1e-8||s.parryCooldown>0||s.parrySerial===s.serial))return null;
 const dx=shot.vx/n,dz=shot.vz/n,ax=(s.guarding?s.guardX:s.cutX)??0,az=(s.guarding?s.guardZ:s.cutZ)??0;
 if(-dx*ax-dz*az<I.parryFacing)return null;
 const guarding=!!s.guarding,damage=Math.max(0,shot.damage||0);if(!damage)return null;let blocked=damage;
 if(guarding){blocked=Math.min(damage,Math.max(0,s.guardStrength||0));if(!blocked){endIchorGuard(s,true);return null;}s.guardStrength-=blocked;s.guardShots++;s.guardFlash=.16;if(s.guardStrength<=1e-8)endIchorGuard(s,true);}
 else{s.parryCooldown=I.parryRecovery;s.parrySerial=s.serial;}
 // The spent ricochet leaves to a random side, always outward from the body.
 // It is visual only: a parry is a timed defence, never free reflected damage.
 const a=Math.atan2(-dz,-dx)+(random()<.5?-1:1)*(.62+random()*.72);
 return {type:'ichorDeflect',guard:guarding,blocked,id:target.id,x:shot.x??target.x-dx*.42,z:shot.z??target.z-dz*.42,dx:Math.cos(a),dz:Math.sin(a),range:3.5+random()*1.5,below:!!target.below};
}
