import { RIFLE, RIFLE_MUZZLE, RIFLE_CONVERGE, RULES, SURGE } from '../config/gameplay.js';
import { targetRadius } from '../target-radius.js';
export { RIFLE, RIFLE_MUZZLE, RIFLE_CONVERGE };
export const rifleDamage=distance=>RIFLE.damage-(RIFLE.damage-RIFLE.minDamage)*Math.max(0,Math.min(1,(distance-RIFLE.effectiveRange)/(RIFLE.falloffEnd-RIFLE.effectiveRange)));
export function rifleSpread(distance,speed=0,aiming=false){
 // Angular error is independent of cursor depth. The HUD projects this cone
 // at the cursor; a close cursor cannot tighten shots that keep travelling.
 return (aiming?RIFLE.aimSpread:RIFLE.hipSpread)*(1+RIFLE.movingSpread*Math.min(1,speed/RULES.speed));
}
export const rifleMuzzle=p=>({
 x:p.x+p.aimX*RIFLE_MUZZLE.forward-p.aimZ*RIFLE_MUZZLE.lateral,
 z:p.z+p.aimZ*RIFLE_MUZZLE.forward+p.aimX*RIFLE_MUZZLE.lateral,
});
// The one piece of geometry the shot and the guide must agree on: where the
// barrel sits, which way it is laid, and how far the convergence point is from
// the muzzle. Spread is angular about this ray, so the guide drawn from it is
// exactly the band the bullets fall in.
export function rifleAim(p,aimDistance){
 const reach=Math.max(Number.isFinite(aimDistance)?aimDistance:RIFLE_CONVERGE,RIFLE_CONVERGE);
 const {x,z}=rifleMuzzle(p);
 const targetX=p.x+p.aimX*reach,targetZ=p.z+p.aimZ*reach;
 const dx=targetX-x,dz=targetZ-z,range=Math.hypot(dx,dz)||1e-6;
 return {x,z,targetX,targetZ,range,angle:Math.atan2(dz,dx)};
}
export function rifleShotError(sample){
 // Shift the old center-heavy sample toward both flanks of the SAME cone.
 // Pick the angle once: bullets stay straight, and separation grows with travel,
 // regardless of where along that path the cursor happens to be.
 return Math.sign(sample)*Math.sqrt(Math.abs(sample));
}
// One shot's recoil: a random knock off line, larger as a burst builds.
export function kickRifle(r,sample){
 r.kick=Math.min(1,(r.kick||0)+RIFLE.recoilBuild);
 r.sway=Math.max(-RIFLE.recoilMax,Math.min(RIFLE.recoilMax,(r.sway||0)+(sample*2-1)*RIFLE.recoilKick*(.5+r.kick)));
}
export function resetRifle(sim){sim.rifle={ammo:RIFLE.magazine,capacity:RIFLE.magazine,reloadCapacity:RIFLE.magazine,cooldown:0,reload:0,aiming:false,triggerHeld:false,burst:0,sway:0,kick:0};sim.magazines=[];sim.rifleBullets=[];}
export function stepRifle(sim,input,dt,{segmentBox,segmentCircle}){
 const r=sim.rifle,p=sim.player;
 // Surge (surge.js): 2x bullets, no ammo used, no reloading.
 const surging=!!sim.surge?.active;
 const finishReload=()=>{r.reload=0;r.capacity=r.reloadCapacity;r.ammo=r.capacity;sim.events.push({type:'rifleReloaded'});};
 const firePressed=input.fire&&!r.triggerHeld;
 if(firePressed)r.burst=0;r.triggerHeld=!!input.fire;
 // Swept collision runs for each travelled segment, even while reloading.
 for(const bullet of sim.rifleBullets){
  const travel=Math.min(RIFLE.bulletSpeed*dt,RIFLE.maxRange-bullet.travel);
  const ex=bullet.x+bullet.dx*travel,ez=bullet.z+bullet.dz*travel;
  let first=1,target=null,prop=null;
  for(const b of sim.colliders){if(b.playerOnly)continue;const t=segmentBox(bullet.x,bullet.z,ex,ez,b,.025);if(t!==null&&t<=first){first=t;target=null;prop=sim.props.find(v=>v.id===b.propId);}}
  for(const t of sim.targets){if(t.hp<=0)continue;const hit=segmentCircle(bullet.x,bullet.z,ex,ez,t.x,t.z,targetRadius(t)+.025);if(hit!==null&&hit<first){first=hit;target=t;prop=null;}}
  bullet.x+=(ex-bullet.x)*first;bullet.z+=(ez-bullet.z)*first;bullet.travel+=travel*first;
  if(first<1||target||prop){
   const shot={bullet:true,damage:rifleDamage(bullet.travel)*(bullet.surge?SURGE.damage:1),owner:p.id,volley:bullet.id,x:bullet.x,z:bullet.z,vx:bullet.dx,vz:bullet.dz};
   if(target){sim.hit(target,shot);sim.events.push({type:'rifleHit',id:bullet.id,aimed:bullet.aimed});}else if(prop)sim.hitProp(prop,shot);
   sim.volleyKills.delete(shot.volley);
   sim.events.push({type:'impactMark',x:bullet.x,z:bullet.z,vx:bullet.dx,vz:bullet.dz});
   sim.events.push({type:'rifleImpact',x:bullet.x,z:bullet.z});bullet.dead=true;
  }
  if(bullet.travel>=RIFLE.maxRange-1e-8)bullet.dead=true;
 }
 sim.rifleBullets=sim.rifleBullets.filter(b=>!b.dead);
 if(sim.dev.ammo&&!r.reload)r.ammo=r.capacity;
 if(sim.dev.rifleInstantReload&&r.reload>0)finishReload();
 sim.magazines=sim.magazines.filter(m=>(m.age+=dt)<RIFLE.magazineLife-1e-8);
 r.cooldown=Math.max(-dt,r.cooldown-dt);r.aiming=!!input.aiming;
 // Recoil settles back toward the true line (fast when aimed in).
 const settle=Math.exp(-dt*(r.aiming?RIFLE.recoilSettleAim:RIFLE.recoilSettle));
 r.sway=(r.sway||0)*settle;r.kick=(r.kick||0)*settle;
 if(r.reload>0){r.reload=Math.max(0,r.reload-dt);if(r.reload<1e-8)finishReload();return;}
 if(surging)r.ammo=r.capacity;
 const emptyTrigger=firePressed&&r.ammo<=0;
 if(p.hp>0&&!surging&&(emptyTrigger||input.reload&&r.ammo<r.capacity)){
  r.reloadCapacity=RIFLE.magazine;
  r.reload=RIFLE.reload;
  sim.magazines.push({id:++sim.serial,x:p.x-p.aimZ*.3,z:p.z+p.aimX*.3,angle:Math.atan2(p.aimX,p.aimZ),age:0});
  if(sim.dev.rifleInstantReload)finishReload();
  sim.events.push({type:'rifleReload'});return;
 }
 if(!input.fire||r.cooldown>1e-8||p.hp<=0||p.dodgeRemaining>0)return;
 r.cooldown=RIFLE.interval*(sim.dev.rapidFire?.5:1)+Math.min(0,r.cooldown);
 if(!r.ammo){sim.events.push({type:'cock'});return;}
 if(!sim.dev.ammo&&!surging)r.ammo--;sim.stats.launched++;
 const distance=Math.hypot(p.aimPointX-p.x,p.aimPointZ-p.z);
 const spread=sim.dev.noSpread?0:rifleSpread(distance,Math.hypot(p.vx,p.vz),r.aiming);
 // The barrel is laid on the convergence point rather than run parallel to the
 // player. Fired parallel, every bullet passed a fixed offset to one side of
 // the crosshair no matter how tight the spread was — which is what made even
 // aimed shots look like they were leaving the guide.
 const aim=rifleAim(p,distance);
 const x=aim.x,z=aim.z;
 // The cone is where the last shots knocked it (the HUD draws it there too),
 // then this shot kicks it again, from the hip only.
 const angle=aim.angle+(r.sway||0)+rifleShotError(Math.random()-Math.random())*spread;
 if(!r.aiming&&!sim.dev.noRecoil)kickRifle(r,Math.random());
 const dx=Math.cos(angle),dz=Math.sin(angle);
 // Include the player-to-muzzle segment so the barrel cannot shoot through cover.
 const blocked=sim.colliders.some(b=>!b.playerOnly&&segmentBox(p.x,p.z,x,z,b)!==null);
 const id=++sim.volley;
 sim.rifleBullets.push({id,x:blocked?p.x:x,z:blocked?p.z:z,dx,dz,travel:0,aimed:r.aiming,surge:surging});
 sim.events.push({type:'rifleShot',x,z,id,burstIndex:++r.burst,surge:surging||undefined});
}
