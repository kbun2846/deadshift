import {ICHOR as I} from '../config/gameplay.js';
import {targetRadius} from '../target-radius.js';
// Where the raised sword is (owner, v0.990a: "the deflect on the katana only
// works when bullets are fired at the player's side the katana is held up,
// not on the parts behind where katana isn't"). In the block pose
// (ichor-motion.js ICHOR_BLOCK, measured on the drawn model) the blade runs
// from the hands at the right chest across the front of the body to its tip
// out past the left: [forward, right] m from the body's middle. A round is
// turned only if its path meets that blade (within `thick`) on its way in,
// from where it came up to the body's middle; one that comes at the back or
// the uncovered side goes through to the body. A timed cut's parry keeps its
// cone, and the round must meet the front half of the body (`front`, m).
export const ICHOR_GUARD_BLADE=Object.freeze({hands:[.25,.39],tip:[.63,-1.7],thick:.14,front:-.05,back:3});
// The round's way in: from `back` m before it meets the body to the point of
// its path nearest the body's middle. Its line passes the round's position
// (`x`, `z`) along its travel; without a position, through the middle.
function wayIn(target,shot,dx,dz){
 const px=shot.x??target.x,pz=shot.z??target.z,cx=target.x-px,cz=target.z-pz,tc=cx*dx+cz*dz,perp2=Math.max(0,cx*cx+cz*cz-tc*tc),R=targetRadius(target)+.05;
 const entry=perp2<R*R?tc-Math.sqrt(R*R-perp2):tc;
 return {ax:px+dx*(entry-ICHOR_GUARD_BLADE.back),az:pz+dz*(entry-ICHOR_GUARD_BLADE.back),bx:px+dx*tc,bz:pz+dz*tc,ex:px+dx*entry,ez:pz+dz*entry};
}
const pointSegment=(px,pz,ax,az,bx,bz)=>{const dx=bx-ax,dz=bz-az,l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((px-ax)*dx+(pz-az)*dz)/l)):0;return Math.hypot(px-ax-dx*t,pz-az-dz*t);};
const cross=(ax,az,bx,bz,cx,cz)=>(bx-ax)*(cz-az)-(bz-az)*(cx-ax);
export function segmentsDistance(ax,az,bx,bz,cx,cz,dx,dz){
 const d1=cross(ax,az,bx,bz,cx,cz),d2=cross(ax,az,bx,bz,dx,dz),d3=cross(cx,cz,dx,dz,ax,az),d4=cross(cx,cz,dx,dz,bx,bz);
 if(((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0)))return 0;
 return Math.min(pointSegment(ax,az,cx,cz,dx,dz),pointSegment(bx,bz,cx,cz,dx,dz),pointSegment(cx,cz,ax,az,bx,bz),pointSegment(dx,dz,ax,az,bx,bz));
}
// Does the round (travelling dx, dz) meet the raised blade of `target`
// facing fx, fz on its way in?
export function meetsGuardBlade(target,shot,dx,dz,fx,fz){
 const B=ICHOR_GUARD_BLADE,rx=-fz,rz=fx,w=wayIn(target,shot,dx,dz);
 const hx=target.x+fx*B.hands[0]+rx*B.hands[1],hz=target.z+fz*B.hands[0]+rz*B.hands[1],tx=target.x+fx*B.tip[0]+rx*B.tip[1],tz=target.z+fz*B.tip[0]+rz*B.tip[1];
 return segmentsDistance(w.ax,w.az,w.bx,w.bz,hx,hz,tx,tz)<=B.thick;
}
// Does it meet the front half of the body (a cut's parry)?
export function meetsFront(target,shot,dx,dz,fx,fz){const w=wayIn(target,shot,dx,dz);return (w.ex-target.x)*fx+(w.ez-target.z)*fz>=ICHOR_GUARD_BLADE.front;}
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
 {const f=Math.hypot(ax,az)||1;if(s.guarding?!meetsGuardBlade(target,shot,dx,dz,ax/f,az/f):!meetsFront(target,shot,dx,dz,ax/f,az/f))return null;}
 const guarding=!!s.guarding,damage=Math.max(0,shot.damage||0);if(!damage)return null;let blocked=damage;
 if(guarding){blocked=Math.min(damage,Math.max(0,s.guardStrength||0));if(!blocked){endIchorGuard(s,true);return null;}s.guardStrength-=blocked;s.guardShots++;s.guardFlash=.16;if(s.guardStrength<=1e-8)endIchorGuard(s,true);}
 else{s.parryCooldown=I.parryRecovery;s.parrySerial=s.serial;}
 // The spent ricochet leaves to a random side, always outward from the body.
 // It is visual only: a parry is a timed defence, never free reflected damage.
 const a=Math.atan2(-dz,-dx)+(random()<.5?-1:1)*(.62+random()*.72);
 return {type:'ichorDeflect',guard:guarding,blocked,id:target.id,x:shot.x??target.x-dx*.42,z:shot.z??target.z-dz*.42,dx:Math.cos(a),dz:Math.sin(a),range:3.5+random()*1.5,below:!!target.below};
}
