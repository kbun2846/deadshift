import { RIFLE, RIFLE_MUZZLE, RIFLE_CONVERGE, RULES, SURGE, TERRAIN } from '../config/gameplay.js';
import { collidersAlong } from '../world/collider-grid.js';
import { targetRadius } from '../target-radius.js';
export { RIFLE, RIFLE_MUZZLE, RIFLE_CONVERGE };
export const rifleDamage=distance=>RIFLE.damage-(RIFLE.damage-RIFLE.minDamage)*Math.max(0,Math.min(1,(distance-RIFLE.effectiveRange)/(RIFLE.falloffEnd-RIFLE.effectiveRange)));
export function rifleSpread(distance,speed=0,aiming=false,surging=false){
 // Angular error is independent of cursor depth. The HUD projects this cone
 // at the cursor; a close cursor cannot tighten shots that keep travelling.
 return (aiming?RIFLE.aimSpread:RIFLE.hipSpread)*(1+RIFLE.movingSpread*Math.min(1,speed/RULES.speed))*(surging?SURGE.spread:1);
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
 // Parallel to the facing from the muzzle: the aim already turns the body so
 // this line meets the cursor (aim-damping.js muzzleBearing).
 const targetX=x+p.aimX*reach,targetZ=z+p.aimZ*reach;
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
export function kickRifle(r,sample,scale=1){
 r.kick=Math.min(1,(r.kick||0)+RIFLE.recoilBuild);
 r.sway=Math.max(-RIFLE.recoilMax,Math.min(RIFLE.recoilMax,(r.sway||0)+(sample*2-1)*RIFLE.recoilKick*scale*(.5+r.kick)));
}
// ---- Rounds on hills (shared by the rifle, Ballast's pellets and Scatter) ----
// Nothing here runs on a flat map: a round there never gets a `flight`, so
// every test below passes straight through and Deadwater is untouched.
// At fire time a round works out its flight over the ground (`flight`,
// world/heightfield.js: it follows the ground, over every slope a body can
// walk, owner 2026-09-26) from the ground its shooter stands on, and where
// the ground stops it (`stop`, metres along its path: a retaining wall's
// face, a rise too steep to climb). `ox`, `oz`: where its shooter stood (the
// view starts its own copy of the flight from there on a mirrored round).
// (A shooter wading under a deck fires from the ground there: `oy`.)
export function roundOnGround(sim,round,range,ox=sim.player.x,oz=sim.player.z){
 if(sim.ground.flat)return round;
 round.ox=ox;round.oz=oz;
 const oy=ox===sim.player.x&&oz===sim.player.z?sim.ownGround?.():undefined;if(oy!==undefined)round.oy=oy;
 const f=round.flight=sim.ground.flight(round.x,round.z,round.dx,round.dz,range,oy??sim.ground.heightAt(ox,oz),Math.hypot(round.x-ox,round.z-oz));
 if(f.stop<range)round.stop=f.stop;
 return round;
}
// Hills: the round's own height where it meets something `s` m along its path.
const roundY=(sim,round,s)=>sim.ground.flightAt(round.flight,s)+TERRAIN.roundHeight;
// (A caller with no `s` gets the point's own distance along the path.)
const along=(round,x,z)=>Math.max(0,(x-round.flight.x)*round.flight.dx+(z-round.flight.z)*round.flight.dz);
// A body is hit when the round passes it between its feet and head: a body
// on the ground it flies over, not one close under a ledge it is coming
// down from, nor one under a deck it flies over (or on one it flies under).
export function roundSees(sim,round,t,s=round.flight&&along(round,t.x,t.z)){
 if(round.flight===undefined)return true;
 const y=roundY(sim,round,s),feet=t.below?sim.ground.drawnHeightAt(t.x,t.z):sim.ground.heightAt(t.x,t.z);
 return y>=feet-.1&&y<=feet+TERRAIN.bodyTop;
}
// Walls and buildings always meet it; low cover only at its own height (a
// round coming down off a ledge flies over a crate below it).
export function roundMeets(sim,round,box,x,z,s=round.flight&&along(round,x,z)){
 if(round.flight===undefined||(box.height??2)>1.5)return true;
 const y=roundY(sim,round,s),base=sim.ground.heightAt(x,z);
 // s2-trees: a stump or fallen log (lowTop) meets it only below its own top.
 return y>=base-.2&&y<=base+(box.lowTop?box.height:Math.max(box.height??2,TERRAIN.roundHeight+.2));
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
 // Hills (roundOnGround, above): a round meets what it passes at its own
 // height, and ends in the ground where the ground stops it (`stop`).
 for(const bullet of sim.rifleBullets){
  const end=bullet.stop??RIFLE.maxRange;
  const travel=Math.min(RIFLE.bulletSpeed*dt,end-bullet.travel);
  const ex=bullet.x+bullet.dx*travel,ez=bullet.z+bullet.dz*travel;
  let first=1,target=null,prop=null;
  for(const b of collidersAlong(sim.colliders,bullet.x,bullet.z,ex,ez,.1)){if(b.playerOnly)continue;const t=segmentBox(bullet.x,bullet.z,ex,ez,b,.025);if(t!==null&&t<=first&&roundMeets(sim,bullet,b,bullet.x+(ex-bullet.x)*t,bullet.z+(ez-bullet.z)*t,bullet.travel+travel*t)){first=t;target=null;prop=sim.props.find(v=>v.id===b.propId);}}
  for(const t of sim.targets){if(t.hp<=0)continue;const hit=segmentCircle(bullet.x,bullet.z,ex,ez,t.x,t.z,targetRadius(t)+.025);if(hit!==null&&hit<first&&roundSees(sim,bullet,t,bullet.travel+travel*hit)){first=hit;target=t;prop=null;}}
  bullet.x+=(ex-bullet.x)*first;bullet.z+=(ez-bullet.z)*first;bullet.travel+=travel*first;
  if(first<1||target||prop){
   const shot={bullet:true,damage:rifleDamage(bullet.travel)*(bullet.surge?SURGE.damage:1),owner:p.id,volley:bullet.id,x:bullet.x,z:bullet.z,vx:bullet.dx,vz:bullet.dz};
   if(target){sim.hit(target,shot);sim.events.push({type:'rifleHit',id:bullet.id,aimed:bullet.aimed});}else if(prop)sim.hitProp(prop,shot);
   sim.volleyKills.delete(shot.volley);
   sim.events.push({type:'impactMark',x:bullet.x,z:bullet.z,vx:bullet.dx,vz:bullet.dz});
   sim.events.push({type:'rifleImpact',x:bullet.x,z:bullet.z});bullet.dead=true;
  }else if(bullet.stop!==undefined&&bullet.travel>=end-1e-8){
   // Into the ground (a retaining wall's face, a rise too steep to climb).
   sim.events.push({type:'impactMark',x:bullet.x,z:bullet.z,vx:bullet.dx,vz:bullet.dz,ground:true});
   sim.events.push({type:'rifleImpact',x:bullet.x,z:bullet.z,ground:true});
  }
  if(bullet.travel>=end-1e-8)bullet.dead=true;
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
 const spread=sim.dev.noSpread?0:rifleSpread(distance,Math.hypot(p.vx,p.vz),r.aiming,surging);
 // The barrel is laid on the convergence point rather than run parallel to the
 // player. Fired parallel, every bullet passed a fixed offset to one side of
 // the crosshair no matter how tight the spread was — which is what made even
 // aimed shots look like they were leaving the guide.
 const aim=rifleAim(p,distance);
 const x=aim.x,z=aim.z;
 // The cone is where the last shots knocked it (the HUD draws it there too),
 // then this shot kicks it again, from the hip only.
 const angle=aim.angle+(r.sway||0)+rifleShotError(Math.random()-Math.random())*spread;
 if(!r.aiming&&!sim.dev.noRecoil)kickRifle(r,Math.random(),surging?SURGE.spread:1);
 const dx=Math.cos(angle),dz=Math.sin(angle);
 // Include the player-to-muzzle segment so the barrel cannot shoot through cover.
 const blocked=sim.colliders.some(b=>!b.playerOnly&&segmentBox(p.x,p.z,x,z,b)!==null);
 const id=++sim.volley;
 const bullet={id,x:blocked?p.x:x,z:blocked?p.z:z,dx,dz,travel:0,aimed:r.aiming,surge:surging};
 roundOnGround(sim,bullet,RIFLE.maxRange);
 sim.rifleBullets.push(bullet);
 sim.events.push({type:'rifleShot',x,z,id,burstIndex:++r.burst,surge:surging||undefined});
}
