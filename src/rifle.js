// Baseline conventional weapon: metres, seconds, damage per bullet.
export const RIFLE=Object.freeze({interval:.18,magazine:18,extendedMagazine:36,extendedCooldown:60,reload:1.8,damage:20,minDamage:14,effectiveRange:10,falloffEnd:22,maxRange:55,magazineLife:30,bulletSpeed:90,aimMoveMultiplier:.55,maxStamina:3});
export const rifleDamage=distance=>RIFLE.damage-(RIFLE.damage-RIFLE.minDamage)*Math.max(0,Math.min(1,(distance-RIFLE.effectiveRange)/(RIFLE.falloffEnd-RIFLE.effectiveRange)));
export function rifleSpread(distance,speed=0,aiming=false){
 // Angular error is independent of cursor depth. The HUD projects this cone
 // at the cursor; a close cursor cannot tighten shots that keep travelling.
 return (aiming?.054:.105)*(1+.7*Math.min(1,speed/7.2));
}
export function rifleShotError(sample){
 // Shift the old center-heavy sample toward both flanks of the SAME cone.
 // Pick the angle once: bullets stay straight, and separation grows with travel,
 // regardless of where along that path the cursor happens to be.
 return Math.sign(sample)*Math.sqrt(Math.abs(sample));
}
export function resetRifle(sim){sim.rifle={ammo:RIFLE.magazine,capacity:RIFLE.magazine,reloadCapacity:RIFLE.magazine,extendedCooldown:0,cooldown:0,reload:0,aiming:false,triggerHeld:false,burst:0};sim.magazines=[];sim.rifleBullets=[];}
export function stepRifle(sim,input,dt,{segmentBox,segmentCircle}){
 const r=sim.rifle,p=sim.player;
 r.extendedCooldown=sim.dev.extendedCooldown?0:Math.max(0,r.extendedCooldown-dt);
 const finishReload=()=>{r.reload=0;r.capacity=r.reloadCapacity;r.ammo=r.capacity;sim.events.push({type:'rifleReloaded',extended:r.capacity===RIFLE.extendedMagazine});};
 if(input.fire&&!r.triggerHeld)r.burst=0;r.triggerHeld=!!input.fire;
 // Swept collision runs for each travelled segment, even while reloading.
 for(const bullet of sim.rifleBullets){
  const travel=Math.min(RIFLE.bulletSpeed*dt,RIFLE.maxRange-bullet.travel);
  const ex=bullet.x+bullet.dx*travel,ez=bullet.z+bullet.dz*travel;
  let first=1,target=null,prop=null;
  for(const b of sim.colliders){if(b.playerOnly)continue;const t=segmentBox(bullet.x,bullet.z,ex,ez,b,.025);if(t!==null&&t<=first){first=t;target=null;prop=sim.props.find(v=>v.id===b.propId);}}
  for(const t of sim.targets){if(t.hp<=0)continue;const hit=segmentCircle(bullet.x,bullet.z,ex,ez,t.x,t.z,(t.kind==='dummy'?.42:.55)+.025);if(hit!==null&&hit<first){first=hit;target=t;prop=null;}}
  bullet.x+=(ex-bullet.x)*first;bullet.z+=(ez-bullet.z)*first;bullet.travel+=travel*first;
  if(first<1||target||prop){
   const shot={damage:rifleDamage(bullet.travel),owner:p.id,volley:bullet.id,x:bullet.x,z:bullet.z,vx:bullet.dx,vz:bullet.dz};
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
 if(r.reload>0){r.reload=Math.max(0,r.reload-dt);if(r.reload<1e-8)finishReload();return;}
 const extended=input.extendedReload&&r.extendedCooldown<=1e-8;
 if(p.hp>0&&(extended||input.reload&&(r.ammo<r.capacity||r.capacity>RIFLE.magazine))){
  r.reloadCapacity=extended?RIFLE.extendedMagazine:RIFLE.magazine;
  if(extended)r.extendedCooldown=RIFLE.extendedCooldown;
  r.reload=RIFLE.reload;
  sim.magazines.push({id:++sim.serial,x:p.x-p.aimZ*.3,z:p.z+p.aimX*.3,angle:Math.atan2(p.aimX,p.aimZ),age:0,extended:r.capacity===RIFLE.extendedMagazine});
  if(sim.dev.rifleInstantReload)finishReload();
  sim.events.push({type:'rifleReload'});return;
 }
 if(!input.fire||r.cooldown>1e-8||p.hp<=0||p.dodgeRemaining>0)return;
 r.cooldown=RIFLE.interval+Math.min(0,r.cooldown);
 if(!r.ammo){sim.events.push({type:'cock'});return;}
 if(!sim.dev.ammo)r.ammo--;sim.stats.launched++;
 const distance=Math.hypot(p.aimPointX-p.x,p.aimPointZ-p.z);
 const spread=rifleSpread(distance,Math.hypot(p.vx,p.vz),r.aiming);
 const x=p.x+p.aimX*.96-p.aimZ*.27,z=p.z+p.aimZ*.96+p.aimX*.27;
 const angle=Math.atan2(p.aimZ,p.aimX)+rifleShotError(Math.random()-Math.random())*spread;
 const dx=Math.cos(angle),dz=Math.sin(angle);
 // Include the player-to-muzzle segment so the barrel cannot shoot through cover.
 const blocked=sim.colliders.some(b=>!b.playerOnly&&segmentBox(p.x,p.z,x,z,b)!==null);
 const id=++sim.volley;
 sim.rifleBullets.push({id,x:blocked?p.x:x,z:blocked?p.z:z,dx,dz,travel:0,aimed:r.aiming});
 sim.events.push({type:'rifleShot',x,z,id,burstIndex:++r.burst});
}
