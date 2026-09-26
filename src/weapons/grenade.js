import { cropCircle } from '../crops.js';
import { collidersAlong } from '../world/collider-grid.js';
import { GRENADE } from '../config/gameplay.js';
import { blastReach } from './scatter.js';
export { GRENADE };
export const grenadeDamage=distance=>distance>GRENADE.radius?0:Math.round(GRENADE.edgeDamage+(GRENADE.damage-GRENADE.edgeDamage)*Math.max(0,1-Math.max(0,distance-GRENADE.coreRadius)/(GRENADE.radius-GRENADE.coreRadius))**1.4);
export function resetGrenades(sim){sim.grenades=[];sim.grenadeCooldown=0;sim.grenadeThrowTime=-10;}
export function stepGrenades(sim,input,dt,segmentBox){
 sim.grenadeCooldown=sim.dev.grenadeCooldown||sim.dev.cooldowns?0:Math.max(0,sim.grenadeCooldown-dt);
 const p=sim.player;
 if(sim.weapon==='rifle'&&input.grenade&&sim.grenadeCooldown<=1e-8&&p.hp>0&&!p.dodgeRemaining){
  const dx=p.aimPointX-p.x,dz=p.aimPointZ-p.z,distance=Math.hypot(dx,dz),scale=Math.min(1,GRENADE.range/(distance||1));
  const x=p.x+p.aimX*.35+p.aimZ*.3,z=p.z+p.aimZ*.35-p.aimX*.3;
  const targetX=Math.max(-sim.map.width/2+.2,Math.min(sim.map.width/2-.2,p.x+dx*scale));
  const targetZ=Math.max(-sim.map.depth/2+.2,Math.min(sim.map.depth/2-.2,p.z+dz*scale));
  const travel=Math.hypot(targetX-x,targetZ-z);
  // Two ids on purpose. `id` is serial identity, which the renderer keys its
 // model map by; `volley` comes from the shared volley counter, which is what
 // the one-shot bookkeeping and the merged damage numbers group on. Reusing
 // the serial for both let a grenade collide with an unrelated rifle bullet's
 // volley and be read as a single shot.
 // Hills: `y` is a world height, so it starts from the ground in hand.
 const ground=sim.ground,y=ground.flat?.85:ground.heightAt(x,z)+.85;
 sim.grenades.push({id:++sim.serial,volley:++sim.volley,x,z,y,startX:x,startZ:z,targetX,targetZ,age:0,flight:Math.min(.95,.32+travel*.04),arc:Math.min(3.1,1+travel*.15,sim.interior?Math.max(.3,sim.interior.height-1.2):4),released:false,blocked:false,bonus:sim.surge?.active?GRENADE.surgeBonus:GRENADE.bonus});
  sim.grenadeCooldown=GRENADE.cooldown;sim.grenadeThrowTime=sim.time;
  sim.events.push({type:'grenadeWindup',x:p.x,z:p.z});
 }
 const ground=sim.ground,flat=ground.flat;
 for(const g of sim.grenades){
  g.age+=dt;
  if(g.age<GRENADE.windup){g.x=p.x+p.aimX*.35+p.aimZ*.3;g.z=p.z+p.aimZ*.35-p.aimX*.3;g.startX=g.x;g.startZ=g.z;if(!flat)g.y=ground.heightAt(g.x,g.z)+.85;continue;}
  if(!g.released){g.released=true;sim.events.push({type:'grenadeThrow',id:g.id,x:g.x,z:g.z});}
  const age=g.age-GRENADE.windup;
  if(!g.blocked){
   const t=Math.min(1,age/g.flight),nx=g.startX+(g.targetX-g.startX)*t,nz=g.startZ+(g.targetZ-g.startZ)*t;
   // Hills: the same arc laid over the ground, from the ground it left to
   // the ground it lands on (g.startY, g.endY: fixed when it leaves the hand;
   // grenadeBase, below: lobbed off high ground it keeps that height until it
   // is past the edge, lobbed up onto high ground it is up by the time it gets
   // there, so it clears the lip it was thrown over instead of landing on it).
   if(!flat&&g.startY===undefined)grenadeBase(ground,g);
   const ny=.24+.61*(1-t)+4*g.arc*t*(1-t)+(flat?0:g.startY+(g.endY-g.startY)*Math.min(1,Math.max(0,(t-g.leave)/(g.arrive-g.leave))));
   let first=1;
   // (Hills: a box stands on the ground where the grenade meets it; the
   // retaining walls are the ground's own edge, so the ground test covers them.)
   for(const box of collidersAlong(sim.colliders,g.x,g.z,nx,nz,.2)){if(box.terrainEdge)continue;const hit=segmentBox(g.x,g.z,nx,nz,box,.11);if(hit!==null&&hit<first&&g.y+(ny-g.y)*hit<=(box.height??2)+.12+(flat?0:ground.heightAt(g.x+(nx-g.x)*hit,g.z+(nz-g.z)*hit)))first=hit;}
   // Into a rise of the ground on the way.
   if(!flat&&first===1&&t<1&&ny<ground.heightAt(nx,nz)+.12)first=.5;
   if(first<1){const safe=Math.max(0,first-.025);g.x+=(nx-g.x)*safe;g.z+=(nz-g.z)*safe;g.y+=(ny-g.y)*safe;g.blocked=true;g.fallY=g.y;g.blockAge=age;}
   else{g.x=nx;g.z=nz;g.y=ny;}
  }else g.y=Math.max(flat?.24:ground.heightAt(g.x,g.z)+.24,g.fallY-4.9*(age-g.blockAge)**2);
  if(age+1e-8<GRENADE.fuse)continue;
  const cover=[...sim.colliders];
  const damageAt=(victim,propId=null)=>{
   const base=grenadeDamage(blastReach(sim,g.x,g.z,victim,Math.hypot(victim.x-g.x,victim.z-g.z),0,GRENADE.radius)),damage=base?base+(g.bonus??GRENADE.bonus):0;
   return damage&&!cover.some(b=>!b.playerOnly&&b.propId!==propId&&segmentBox(g.x,g.z,victim.x,victim.z,b)!==null)?damage:0;
  };
  for(const target of sim.targets){const damage=target.hp>0?damageAt(target):0;if(damage)sim.hit(target,{damage,volley:g.volley,blast:true,vx:target.x-g.x,vz:target.z-g.z});}
  for(const prop of sim.props){const damage=prop.hp>0?damageAt(prop,prop.id):0;if(damage)sim.hitProp(prop,{damage,x:prop.x,z:prop.z,vx:prop.x-g.x,vz:prop.z-g.z});}
  const selfDamage=damageAt(p);if(selfDamage){sim.damagePlayer(selfDamage,p.id,false,true,{x:p.x-g.x,z:p.z-g.z},'explosion');sim.applyBlastKnockback(g.x,g.z,GRENADE.radius,2.8,GRENADE.coreRadius);}
  cropCircle(sim,g,GRENADE.radius,false,(a,b)=>!cover.some(c=>!c.playerOnly&&segmentBox(a.x,a.z,b.x,b.z,c)!==null));
  sim.volleyKills.delete(g.volley);g.dead=true;
  sim.events.push({type:'grenadeExplosion',id:g.id,x:g.x,z:g.z,radius:GRENADE.radius,count:12,damage:GRENADE.damage});
 }
 sim.grenades=sim.grenades.filter(g=>!g.dead);
}

// Hills: the share of a throw's way at which its arc's base leaves the
// thrower's height (`leave`: the last point still on ground as high as the
// hand's, when it is thrown down to lower ground) and reaches the landing
// point's (`arrive`: the first point on ground as high as that, when it is
// thrown up onto higher ground). A throw between level grounds: 0 and 1.
function grenadeBase(ground,g){
 g.startY=ground.heightAt(g.startX,g.startZ);g.endY=ground.heightAt(g.targetX,g.targetZ);g.leave=0;g.arrive=1;
 const dx=g.targetX-g.startX,dz=g.targetZ-g.startZ,n=Math.ceil(Math.hypot(dx,dz)/.25);
 if(g.endY<g.startY-.3){for(let k=1;k<n;k++)if(ground.heightAt(g.startX+dx*k/n,g.startZ+dz*k/n)>=g.startY-.05)g.leave=k/n;}
 else if(g.endY>g.startY+.3){for(let k=1;k<n;k++)if(ground.heightAt(g.startX+dx*k/n,g.startZ+dz*k/n)>=g.endY-.05){g.arrive=k/n;break;}}
}
