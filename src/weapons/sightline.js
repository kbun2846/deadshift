// Two magazines, one stance. Only E enters the crouch; X never equips a
// firing stance. Projectiles outlive their shooter, pending shots do not.
import { SIGHTLINE as S, TERRAIN, RULES } from '../config/gameplay.js';
import { collidersAlong } from '../world/collider-grid.js';
import { targetRadius } from '../target-radius.js';
import { roundOnGround, roundSees, roundMeets } from './rifle.js';
import { cropCircle,cropAt } from '../crops.js';
import { sightlineFlight,sightlineY,sightlineMeets,sightlineSees } from './sightline-flight.js';
import { fairFov, CAMERA_TILT, OUTDOOR_CAMERA_HEIGHT } from '../render/camera-framing.js';
export { S as SIGHTLINE };
export function resetSightline(sim,keep=false){
 const cooldown=keep?sim.sightline?.xCooldown||0:0;
 sim.sightline={crouched:false,aiming:false,pistolAmmo:S.pistolMagazine,rifleAmmo:1,pistolReload:0,rifleReload:0,xLoading:false,special:false,xCooldown:cooldown,cooldown:0,commit:0,trigger:false,aimBlocked:false,turnVelocity:0,setup:0};
 delete sim.player?.sightline;
 sim.sightlineRounds=[];sim.sightlinePending=null;
}
export const sightlineCanScope=(sim,p=sim.player)=>!sim.buildingAt(p.x,p.z)&&!cropAt(sim.crops||[],p);
export const scopeActive=sim=>sim.weapon==='sightline'&&sim.sightline?.crouched&&sim.sightline.aiming&&!sim.sightline.rifleReload&&!sim.sightline.aimBlocked&&!sim.player.dead&&sightlineCanScope(sim);
export const scopeFacing=p=>({x:p.sightline?.scopeX??p.aimX,z:p.sightline?.scopeZ??p.aimZ});
export function inSightCone(p,x,z){const dx=x-p.x,dz=z-p.z,d=Math.hypot(dx,dz),f=scopeFacing(p);return d<.6||(dx*f.x+dz*f.z)>=d*Math.cos(S.cone*Math.PI/360);}
export const sightlineElevation=elevation=>1+Math.min(S.scopeElevationMax,Math.max(0,elevation||0)*S.scopeElevationRate);
export function sightlineTurn(s,delta,dt){
 const wanted=Math.max(-S.turnRate,Math.min(S.turnRate,delta*4)),step=S.turnAcceleration*dt;
 s.turnVelocity=(s.turnVelocity||0)+Math.max(-step,Math.min(step,wanted-(s.turnVelocity||0)));
 const turn=s.turnVelocity*dt;
 if(turn*delta<0)return 0;
 if(Math.abs(turn)>Math.abs(delta)){s.turnVelocity=0;return delta;}return turn;
}
export function stepSightlineScope(sim,dt){
 if(sim.weapon!=='sightline')return;
 const s=sim.sightline,p=sim.player;
 if(!scopeActive(sim)||!Number.isFinite(s.scopeX)){s.scopeX=p.aimX;s.scopeZ=p.aimZ;s.turnVelocity=0;}
 else{
  const current=Math.atan2(s.scopeZ,s.scopeX),wanted=Math.atan2(p.aimZ,p.aimX),delta=Math.atan2(Math.sin(wanted-current),Math.cos(wanted-current));
  const angle=current+sightlineTurn(s,delta,dt);s.scopeX=Math.cos(angle);s.scopeZ=Math.sin(angle);
 }
 Object.assign(p.sightline,{scopeX:s.scopeX,scopeZ:s.scopeZ,aimReach:p.aimReach});
}
const TILT_LENGTH=Math.hypot(1,CAMERA_TILT),LOOK=OUTDOOR_CAMERA_HEIGHT*TILT_LENGTH*TILT_LENGTH;
let edgeAspect=0,edgeTan=0;
function scopeEdge(aspect,dx,dz){
 const a=Math.max(.2,aspect||16/9);
 if(a!==edgeAspect){edgeAspect=a;edgeTan=Math.tan(fairFov(a)*Math.PI/360);}
 // Intersect the ground ray with the camera's sides and ends directly.
 // This is the same tilted frustum as onScreenOf, without a per-frame search.
 const side=TILT_LENGTH*Math.abs(dx)+CAMERA_TILT*dz*edgeTan*a,end=Math.abs(dz)+CAMERA_TILT*dz*edgeTan;
 return Math.min(side>0?LOOK*edgeTan*a/side:Infinity,end>0?LOOK*edgeTan/end:Infinity);
}
export function sightlineCamera(aspect,dx,dz,elevation=0){
 const scale=S.scopeScale*sightlineElevation(elevation);
 return {scale,lead:scopeEdge(aspect,-dx,-dz)*scale*S.scopeLeadShare};
}
export function sightlineRange(aspect,dx,dz,elevation=0){
 const frame=sightlineCamera(aspect,dx,dz,elevation);
 return (scopeEdge(aspect,dx,dz)*frame.scale+frame.lead)*1.1;
}
export function pistolSpread(distance,speed=0,aiming=false){return (aiming?.022:.046)+Math.min(1,distance/S.pistolRange)**2*.085+Math.min(1,speed/5)*.025;}
export function prepareSightline(sim,input){
 if(sim.weapon!=='sightline')return input;
 const s=sim.sightline,p=sim.player;
 // E crouches or stands at any time, moving or not, loaded or not (v0.999a,
 // owner: "player should be able to crouch with E whenever, even when moving
 // ... even when gun is unreloaded"). The rifle's reload no longer ends on
 // standing or moving: it carries on standing, in the hands, as a Breach load
 // does (owner: "reload sniper while moving same way as when x ability
 // reloads (no gold effects)"). (It was: moving stood you up and ended it, v0.992a.)
 if(input.sightlineStance&&!p.dodgeRemaining&&!s.commit){s.crouched=!s.crouched;s.setup=s.crouched?S.setupDuration:0;s.turnVelocity=0;sim.events.push({type:'sightlineStance',x:p.x,z:p.z,crouched:s.crouched});}
 s.setup=Math.max(0,(s.setup||0)-RULES.step);
 // A reload takes the aim down while it runs (the rifle's in the stance; the
 // Sidekick's, or the holstered Sidekick during a standing Breach load,
 // standing) and gives it back by itself when it is done (v0.992a, owner:
 // the laser was sometimes missing; a held aim had to be let go and pressed
 // again after every reload, and the Sidekick's reload blocked the rifle's scope).
 s.aimBlocked=s.crouched?s.rifleReload>0:(s.pistolReload>0||s.rifleReload>0);
 s.aiming=!!input.aiming&&!s.aimBlocked&&(!s.crouched||sightlineCanScope(sim));
 p.sightline={rifleAmmo:s.rifleAmmo,crouched:s.crouched,aiming:s.aiming,special:s.special,xLoading:s.xLoading,rifleReload:s.rifleReload,pistolReload:s.pistolReload,aimBlocked:s.aimBlocked,commit:s.commit,setup:s.setup};
 if(s.crouched){p.vx=p.vz=0;p.dodgeQueued=0;return {...input,moveX:0,moveZ:0,dodge:false};}
 return input;
}
export const sightlineSplash=d=>d>S.blastRadius?0:d<=S.blastCore?S.blastDamage-(S.blastDamage-250)*Math.max(0,d)/S.blastCore:250+(S.blastEdge-250)*(d-S.blastCore)/(S.blastRadius-S.blastCore);
function impact(sim,b,t,geo){
 const shot={owner:sim.player.id,volley:b.volley,damage:b.damage,damageType:b.pistol?'sightlinePistol':'sightlineShot',bullet:true,vx:b.dx,vz:b.dz,x:b.x,z:b.z};
 if(!b.special){if(t)sim.hit(t,shot);sim.events.push({type:'sightlineImpact',x:b.x,z:b.z,y:b.y,pistol:b.pistol,below:b.below});return;}
 const cover=[...sim.colliders];
 const damageAt=(v,propId=null)=>{
  let d=Math.hypot(v.x-b.x,v.z-b.z);
  if(!sim.ground.flat){const from=(b.y??S.roundHeight)-S.roundHeight,to=sim.standY(v);d=sim.ground.sightClear(b.x,b.z,v.x,v.z,from,to)?Math.hypot(d,to-from):Infinity;}
  return cover.some(c=>!c.playerOnly&&c.propId!==propId&&geo.segmentBox(b.x,b.z,v.x,v.z,c)!==null)?0:sightlineSplash(d);
 };
 for(const v of sim.targets){if(v.hp<=0)continue;const damage=v===t?b.damage+S.blastDamage:damageAt(v);if(damage)sim.hit(v,{...shot,damage,bullet:false,blast:true,damageType:'sightlineBlast',vx:v.x-b.x,vz:v.z-b.z});}
 for(const prop of sim.props){const damage=prop.hp>0?damageAt(prop,prop.id):0;if(damage)sim.hitProp(prop,{...shot,damage,blast:true,damageType:'sightlineBlast'});}
 cropCircle(sim,b,S.blastRadius,false,(a,v)=>!cover.some(c=>!c.playerOnly&&geo.segmentBox(a.x,a.z,v.x,v.z,c)!==null));
 sim.events.push({type:'grenadeExplosion',id:b.id,x:b.x,z:b.z,below:b.below,radius:S.blastRadius,count:16,damage:S.blastDamage,damageType:'sightlineBlast'});
}
function launch(sim,b,geo){
 const p=sim.player,muzzle=b.pistol?.75:1.81;
 let mx=p.x+b.dx*muzzle-b.dz*.22,mz=p.z+b.dz*muzzle+b.dx*.22;
 if(!b.pistol){Object.assign(b,sightlineFlight(sim,p,b.dx,b.dz,b.range,geo.segmentBox,b.aimDistance));mx=b.x;mz=b.z;}
 else{
 const blocked=sim.colliders.some(c=>!c.playerOnly&&geo.segmentBox(p.x,p.z,mx,mz,c)!==null);
 b.x=blocked?p.x:mx;b.z=blocked?p.z:mz;b.below=!!p.below;b.y=sim.standY()+TERRAIN.roundHeight;
 roundOnGround(sim,b,b.range);
 }
 sim.sightlineRounds.push(b);sim.stats.launched++;
 if(b.special){
  // The small muzzle blast hits nearby opponents/cover, never its owner.
  for(const t of sim.targets){const d=Math.hypot(t.x-mx,t.z-mz);if(t.hp<=0||d>S.muzzleRadius||sim.colliders.some(c=>!c.playerOnly&&geo.segmentBox(mx,mz,t.x,t.z,c)!==null)||(!sim.ground.flat&&!sim.ground.sightClear(mx,mz,t.x,t.z,b.y-S.roundHeight,sim.standY(t))))continue;
   const damage=S.muzzleDamage*(1-d/S.muzzleRadius);if(damage>0)sim.hit(t,{owner:p.id,volley:b.volley,damage,damageType:'sightlineBlast',blast:true,vx:t.x-mx,vz:t.z-mz,x:mx,z:mz});
  }
 }
 sim.events.push({type:'sightlineShot',x:mx,z:mz,y:b.y,dx:b.dx,dz:b.dz,pistol:b.pistol,special:b.special,below:b.below,hearingScale:b.pistol?1:S.hearingScale});
}
function reload(sim,rifle,special=false){
 const s=sim.sightline;s.aimBlocked=true;s.aiming=false;
 if(rifle){s.rifleReload=S.reload;s.rifleAmmo=0;s.xLoading=special;}else{s.pistolReload=S.pistolReload;}
 sim.events.push({type:'sightlineReload',x:sim.player.x,z:sim.player.z,rifle,special});
}
export function stepSightline(sim,input,dt,geo){
 if(sim.predictOnly)return;
 const s=sim.sightline,p=sim.player;
 s.xCooldown=sim.dev.cooldowns?0:Math.max(0,s.xCooldown-dt);s.cooldown=Math.max(0,s.cooldown-dt);
 const pressed=(!!input.fire&&!s.trigger)||!!input.tapFire;s.trigger=!!input.fire;
 if(p.dead||p.hp<=0){s.commit=0;s.setup=0;sim.sightlinePending=null;s.special=s.xLoading=s.crouched=false;s.rifleReload=s.pistolReload=0;}
 else{
  if(s.pistolReload>0){s.pistolReload=Math.max(0,s.pistolReload-dt);if(s.pistolReload<1e-8){s.pistolReload=0;s.pistolAmmo=S.pistolMagazine;sim.events.push({type:'sightlineReloaded'});}}
  if(s.rifleReload>0){s.rifleReload=Math.max(0,s.rifleReload-dt);if(s.rifleReload<1e-8){s.rifleReload=0;s.rifleAmmo=1;s.special=s.xLoading;s.xLoading=false;sim.events.push({type:'sightlineReloaded',rifle:true,special:s.special});}}
  if(s.commit>0){s.commit=Math.max(0,s.commit-dt);if(s.commit<1e-8&&sim.sightlinePending){launch(sim,sim.sightlinePending,geo);sim.sightlinePending=null;s.commit=0;}}
  else if(!p.dodgeRemaining){
   if(input.sightlineX&&!s.special&&!s.xLoading&&!s.pistolReload&&s.xCooldown<=1e-8)reload(sim,true,true);
   const rifle=s.crouched;
   // In the stance an empty rifle reloads itself: once its round is away, or
   // on crouching again with it empty (v0.992a, owner: an empty rifle showed
   // no laser until FIRE was pressed again to reload it). Standing up or
   // moving ends it (prepareSightline); there is no laser until it is loaded.
   if(rifle&&s.rifleAmmo<=0&&!s.rifleReload&&!s.special&&!s.xLoading)reload(sim,true);
   // (Standing, a rifle reload holds the hands as a Breach load does: no Sidekick shots meanwhile.)
   const loading=!!s.rifleReload||!!s.pistolReload&&!rifle;
   const fire=pressed||(input.sightlineX&&s.special&&rifle);
   const ammo=rifle?s.rifleAmmo:s.pistolAmmo;
   // Standing, R loads an empty rifle first (then the Sidekick), on the move.
   if(!loading&&input.reload&&!rifle&&s.rifleAmmo<=0&&!s.special)reload(sim,true);
   else if(!loading&&(input.reload||fire&&!ammo)&&(!rifle||!s.special)&&ammo<(rifle?1:S.pistolMagazine))reload(sim,rifle);
   else if(fire&&!loading&&ammo>0&&(!rifle||s.setup<=1e-8)&&s.cooldown<=1e-8){
    const reach=Math.hypot(p.aimPointX-p.x,p.aimPointZ-p.z)||10;
    const spread=sim.dev.noSpread?0:rifle?(s.aiming?0:S.hipSpread):pistolSpread(reach,Math.hypot(p.vx,p.vz),s.aiming);
    const angle=Math.atan2(p.aimZ,p.aimX)+(Math.random()*2-1)*spread,dx=Math.cos(angle),dz=Math.sin(angle);
    const max=rifle?sightlineRange(sim.viewAspect||16/9,dx,dz,sim.standY()):S.pistolRange;
    // Breach is placed at the chosen point; ordinary aimed rounds keep their
    // long sniper reach. Both still stop at an earlier body or solid cover.
    const b={id:++sim.serial,volley:++sim.volley,dx,dz,travel:0,aimDistance:reach,range:rifle&&(!s.aiming||s.special)?Math.min(max,Math.max(.1,Math.sqrt(Math.max(0,reach*reach-S.muzzleLateral*S.muzzleLateral))-S.muzzleForward)):max,pistol:!rifle,special:rifle&&s.special,damage:rifle?S.damageMin+Math.floor(Math.random()*(S.damageMax-S.damageMin+1)):S.pistolDamage-S.pistolDamageRoll+Math.floor(Math.random()*(S.pistolDamageRoll*2+1)),pierced:[]};
    if(rifle){if(!sim.dev.ammo)s.rifleAmmo--;s.commit=S.commit;sim.sightlinePending=b;if(s.special){s.special=false;s.xCooldown=S.xCooldown;}}
    else{if(!sim.dev.ammo)s.pistolAmmo--;launch(sim,b,geo);}
    s.cooldown=rifle?S.commit:S.pistolInterval;
   }
  }
 }
 for(const b of sim.sightlineRounds){
  const step=Math.max(0,Math.min((b.pistol?S.pistolSpeed:S.speed)*dt,(b.stop??b.range)-b.travel)),ex=b.x+b.dx*step,ez=b.z+b.dz*step;
  const hits=[];
  for(const c of collidersAlong(sim.colliders,b.x,b.z,ex,ez,.035)){
   if(c.playerOnly||b.pierced.includes(c.propId))continue;const at=geo.segmentBox(b.x,b.z,ex,ez,c,.035);
   if(at!==null&&(b.pistol?roundMeets:sightlineMeets)(sim,b,c,b.x+b.dx*step*at,b.z+b.dz*step*at,b.travel+step*at))hits.push({at,prop:sim.props.find(v=>v.id===c.propId)});
  }
  for(const t of sim.targets){if(t.hp<=0)continue;const at=geo.segmentCircle(b.x,b.z,ex,ez,t.x,t.z,targetRadius(t)+.035);if(at!==null&&(b.pistol?roundSees:sightlineSees)(sim,b,t,b.travel+step*at))hits.push({at,t});}
  {const wall=sim.shieldStop(b.x,b.z,ex,ez);if(wall!==null)hits.push({at:wall,hex:true});} // (v0.990a: a hex's wall stops it)
  hits.sort((a,v)=>a.at-v.at);let first=1,target=null,blocked=false;
  for(const h of hits){
   if(h.hex){first=h.at;target=null;blocked=true;sim.events.push({type:'hexBlock',x:b.x+b.dx*step*h.at,z:b.z+b.dz*step*h.at,wall:true});break;}
   if(h.prop&&h.prop.hp!==null&&!b.pistol){if(b.pierced.includes(h.prop.id))continue;b.pierced.push(h.prop.id);sim.hitProp(h.prop,{damage:b.damage,volley:b.volley,damageType:'sightlineShot',bullet:true,vx:b.dx,vz:b.dz,x:b.x+b.dx*step*h.at,z:b.z+b.dz*step*h.at});continue;}
   first=h.at;target=h.t;blocked=true;if(h.prop)sim.hitProp(h.prop,{damage:b.damage,volley:b.volley,damageType:'sightlinePistol',bullet:true,vx:b.dx,vz:b.dz});break;
  }
  b.x+=b.dx*step*first;b.z+=b.dz*step*first;b.travel+=step*first;b.y=b.pistol?(b.flight?sim.ground.flightAt(b.flight,b.travel):0)+TERRAIN.roundHeight:sightlineY(sim,b);
  if(blocked||b.travel>=(b.stop??b.range)-1e-8){if(blocked&&!target){b.x-=b.dx*.05;b.z-=b.dz*.05;}impact(sim,b,target,geo);b.dead=true;}
 }
 p.sightline={rifleAmmo:s.rifleAmmo,crouched:s.crouched,aiming:s.aiming,special:s.special,xLoading:s.xLoading,rifleReload:s.rifleReload,pistolReload:s.pistolReload,aimBlocked:s.aimBlocked,commit:s.commit,setup:s.setup,aimReach:p.aimReach,scopeX:s.scopeX,scopeZ:s.scopeZ};
 sim.sightlineRounds=sim.sightlineRounds.filter(b=>!b.dead);
}
