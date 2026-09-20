import { cropCircle } from './crops.js';
export const GRENADE=Object.freeze({range:12,fuse:1.4,windup:.18,cooldown:25,radius:4,coreRadius:.7,damage:240,edgeDamage:35});
export const grenadeDamage=distance=>distance>GRENADE.radius?0:Math.round(GRENADE.edgeDamage+(GRENADE.damage-GRENADE.edgeDamage)*Math.max(0,1-Math.max(0,distance-GRENADE.coreRadius)/(GRENADE.radius-GRENADE.coreRadius))**1.4);
export function resetGrenades(sim){sim.grenades=[];sim.grenadeCooldown=0;sim.grenadeThrowTime=-10;}
export function stepGrenades(sim,input,dt,segmentBox){
 sim.grenadeCooldown=sim.dev.grenadeCooldown?0:Math.max(0,sim.grenadeCooldown-dt);
 const p=sim.player;
 if(sim.weapon==='rifle'&&input.grenade&&sim.grenadeCooldown<=1e-8&&p.hp>0&&!p.dodgeRemaining){
  const dx=p.aimPointX-p.x,dz=p.aimPointZ-p.z,distance=Math.hypot(dx,dz),scale=Math.min(1,GRENADE.range/(distance||1));
  const x=p.x+p.aimX*.35+p.aimZ*.3,z=p.z+p.aimZ*.35-p.aimX*.3;
  const targetX=Math.max(-sim.map.width/2+.2,Math.min(sim.map.width/2-.2,p.x+dx*scale));
  const targetZ=Math.max(-sim.map.depth/2+.2,Math.min(sim.map.depth/2-.2,p.z+dz*scale));
  const travel=Math.hypot(targetX-x,targetZ-z);
  sim.grenades.push({id:++sim.serial,x,z,y:.85,startX:x,startZ:z,targetX,targetZ,age:0,flight:Math.min(.95,.32+travel*.04),arc:Math.min(3.1,1+travel*.15,sim.interior?Math.max(.3,sim.interior.height-1.2):4),released:false,blocked:false});
  sim.grenadeCooldown=GRENADE.cooldown;sim.grenadeThrowTime=sim.time;
  sim.events.push({type:'grenadeWindup',x:p.x,z:p.z});
 }
 for(const g of sim.grenades){
  g.age+=dt;
  if(g.age<GRENADE.windup){g.x=p.x+p.aimX*.35+p.aimZ*.3;g.z=p.z+p.aimZ*.35-p.aimX*.3;g.startX=g.x;g.startZ=g.z;continue;}
  if(!g.released){g.released=true;sim.events.push({type:'grenadeThrow',id:g.id,x:g.x,z:g.z});}
  const age=g.age-GRENADE.windup;
  if(!g.blocked){
   const t=Math.min(1,age/g.flight),nx=g.startX+(g.targetX-g.startX)*t,nz=g.startZ+(g.targetZ-g.startZ)*t;
   const ny=.24+.61*(1-t)+4*g.arc*t*(1-t);
   let first=1;
   for(const box of sim.colliders){const hit=segmentBox(g.x,g.z,nx,nz,box,.11);if(hit!==null&&hit<first&&g.y+(ny-g.y)*hit<=(box.height??2)+.12)first=hit;}
   if(first<1){const safe=Math.max(0,first-.025);g.x+=(nx-g.x)*safe;g.z+=(nz-g.z)*safe;g.y+=(ny-g.y)*safe;g.blocked=true;g.fallY=g.y;g.blockAge=age;}
   else{g.x=nx;g.z=nz;g.y=ny;}
  }else g.y=Math.max(.24,g.fallY-4.9*(age-g.blockAge)**2);
  if(age+1e-8<GRENADE.fuse)continue;
  const cover=[...sim.colliders];
  const damageAt=(victim,propId=null)=>{
   const damage=grenadeDamage(Math.hypot(victim.x-g.x,victim.z-g.z));
   return damage&&!cover.some(b=>!b.playerOnly&&b.propId!==propId&&segmentBox(g.x,g.z,victim.x,victim.z,b)!==null)?damage:0;
  };
  for(const target of sim.targets){const damage=target.hp>0?damageAt(target):0;if(damage)sim.hit(target,{damage,volley:g.id,vx:target.x-g.x,vz:target.z-g.z});}
  for(const prop of sim.props){const damage=prop.hp>0?damageAt(prop,prop.id):0;if(damage)sim.hitProp(prop,{damage,x:prop.x,z:prop.z,vx:prop.x-g.x,vz:prop.z-g.z});}
  const selfDamage=damageAt(p);if(selfDamage){sim.damagePlayer(selfDamage,p.id,false,true,{x:p.x-g.x,z:p.z-g.z},'explosion');sim.applyBlastKnockback(g.x,g.z,GRENADE.radius,2.8,GRENADE.coreRadius);}
  cropCircle(sim,g,GRENADE.radius,false,(a,b)=>!cover.some(c=>!c.playerOnly&&segmentBox(a.x,a.z,b.x,b.z,c)!==null));
  sim.volleyKills.delete(g.id);g.dead=true;
  sim.events.push({type:'grenadeExplosion',id:g.id,x:g.x,z:g.z,radius:GRENADE.radius,count:12,damage:GRENADE.damage});
 }
 sim.grenades=sim.grenades.filter(g=>!g.dead);
}
