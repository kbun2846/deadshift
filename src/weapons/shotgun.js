import { SHOTGUN } from '../config/gameplay.js';
import { targetRadius } from '../target-radius.js';
export { SHOTGUN };
// Ballast: two shells, one press fires one (no charging since v0.83), E fires
// both. The range and the pellets' fall-off are the same for every shot.
export const shotgunDamage=(firstShell=false)=>SHOTGUN.shellDamage+(firstShell?SHOTGUN.firstShellBonus:0);
export function shotgunPelletContact(b,target){
 if(b.travel>b.range*.15)return 1;
 // Up close pellets mix full and glancing contacts, so a centred double is
 // usually a little short of the full 600, and perfect ones stay rare.
 const contact=b.contactSample<.8?1:.55;
 const radius=targetRadius(target);
 const offCenter=Math.abs((target.x-b.x)*b.dz-(target.z-b.z)*b.dx);
 return contact*(offCenter<=radius*.55?1:.55);
}
// Pellet power by how far it has flown (0-1 of the range): full near the
// muzzle, gentler than before through the middle (owner: mid-range hits
// should count), then tailing off.
export function shotgunFalloff(distance,range){
 const depth=Math.max(0,Math.min(1,distance/range));
 if(depth<=.15)return 1;
 if(depth<=.6)return 1-(depth-.15)/.45*.25;
 return .75-(depth-.6)/.4*.5;
}
export const shotgunSpread=aiming=>aiming?SHOTGUN.aimSpread:SHOTGUN.spread;
export const shotgunReloadRounds=remaining=>SHOTGUN.shells*Math.max(0,Math.min(1,((1-remaining/SHOTGUN.reload)-.3)/.7));
// The gun's pressure glow (shotgun-pressure.js): now Scatter readied.
export const shotgunPressurized=sim=>sim.weapon==='shotgun'&&!sim.player.dead&&sim.player.hp>0&&!!sim.scatter?.armed;
export function resetShotgun(sim){sim.shotgun={ammo:2,trigger:false,suppress:false,reload:0,cooldown:0,pending:0,aiming:false,spent:0};sim.shotgunPellets=[];}
export function stepShotgun(sim,input,dt,{segmentBox,segmentCircle}){
 const s=sim.shotgun,p=sim.player;
 const pressed=(input.fire&&!s.trigger)||input.tapFire;
 // Only a new press on an already empty gun can request a reload.
 const emptyTrigger=!sim.dev.ammo&&s.ammo<=0&&(pressed||input.doubleShot);
 s.aiming=!!input.aiming;s.cooldown=Math.max(0,s.cooldown-dt);
 // Pellets travel visibly; one damage result per shell/target per step.
 const hits=new Map();
 for(const b of sim.shotgunPellets){
  const travel=Math.min(85*dt,b.range-b.travel),ex=b.x+b.dx*travel,ez=b.z+b.dz*travel;
  let first=1,target=null,prop=null,blocked=false;
  for(const c of sim.colliders){if(c.playerOnly)continue;const t=segmentBox(b.x,b.z,ex,ez,c,.025);if(t!==null&&t<=first){first=t;target=null;prop=sim.props.find(v=>v.id===c.propId);blocked=true;}}
  for(const t of sim.targets){if(t.hp<=0)continue;const f=segmentCircle(b.x,b.z,ex,ez,t.x,t.z,targetRadius(t));if(f!==null&&f<first){first=f;target=t;prop=null;blocked=true;}}
  b.x+=(ex-b.x)*first;b.z+=(ez-b.z)*first;b.travel+=travel*first;
  if(blocked){
   const damage=b.damage*shotgunFalloff(b.travel,b.range);
   if(target){const contact=shotgunPelletContact(b,target);if(contact>0){const key=b.volley+':'+target.id,hit=hits.get(key)||{target,damage:0,vx:b.forwardX,vz:b.forwardZ,volley:b.volley};hit.damage+=damage*contact;hits.set(key,hit);}}
   else if(prop)sim.hitProp(prop,{damage,owner:p.id,volley:b.volley,x:b.x,z:b.z,vx:b.dx,vz:b.dz});
   sim.events.push({type:'rifleImpact',x:b.x,z:b.z});b.dead=true;
  }
  if(b.travel>=b.range-1e-8)b.dead=true;
 }
 for(const h of hits.values()){
  sim.hit(h.target,{...h,owner:p.id,damageType:'ballast',bullet:true});
  const push=1*Math.min(1,h.damage/shotgunDamage());
  let fraction=1;
  for(const c of sim.colliders){const f=segmentBox(h.target.x,h.target.z,h.target.x+h.vx*push,h.target.z+h.vz*push,c,.5);if(f!==null)fraction=Math.min(fraction,Math.max(0,f-.01));}
  const x=Math.max(-sim.map.width/2+.6,Math.min(sim.map.width/2-.6,h.target.x+h.vx*push*fraction)),z=Math.max(-sim.map.depth/2+.6,Math.min(sim.map.depth/2-.6,h.target.z+h.vz*push*fraction));
  h.target.baseX+=x-h.target.x;h.target.x=x;h.target.z=z;
 }
 sim.shotgunPellets=sim.shotgunPellets.filter(b=>!b.dead);
 const fire=(recoilScale=1)=>{
  if(s.ammo<=0)return;
  const shellDamage=shotgunDamage(s.ammo===SHOTGUN.shells);
  s.ammo--;s.spent++;sim.stats.launched++;s.cooldown=sim.dev.shotgunRapid?0:SHOTGUN.interval;
  const volley=++sim.volley,range=SHOTGUN.range,spread=shotgunSpread(s.aiming);
  const x=p.x+p.aimX*.96-p.aimZ*.20,z=p.z+p.aimZ*.96+p.aimX*.20;
  const blocked=sim.colliders.some(c=>!c.playerOnly&&segmentBox(p.x,p.z,x,z,c)!==null);
  for(let i=0;i<SHOTGUN.pellets;i++){
   const angle=Math.atan2(p.aimZ,p.aimX)+((i+Math.random())/SHOTGUN.pellets*2-1)*spread;
   sim.shotgunPellets.push({x:blocked?p.x:x,z:blocked?p.z:z,dx:Math.cos(angle),dz:Math.sin(angle),forwardX:p.aimX,forwardZ:p.aimZ,travel:0,range,damage:shellDamage/SHOTGUN.pellets,damageType:'ballast',contactSample:Math.random(),volley});
  }
  const kick=sim.dev.noKnockback?0:SHOTGUN.recoil*recoilScale;p.blastVX=-p.aimX*kick*SHOTGUN.launchScale;p.blastVZ=-p.aimZ*kick*SHOTGUN.launchScale;p.ballastLaunch=true;
  // `charge`: how big the flash, smoke, sound and shake are (one size now).
  sim.events.push({type:'shotgunShot',x,z,charge:SHOTGUN.look,id:volley});
 };
 let interruptedReload=false;
 if(s.reload>0){
  if(sim.dev.shotgunInstantReload)s.reload=dt;
  s.reload=Math.max(0,s.reload-dt);
  if(s.reload<=SHOTGUN.reload*.8)s.spent=0;
  // A shell becomes usable when its yellow HUD slot finishes filling.
  s.ammo=Math.max(s.ammo,Math.floor(shotgunReloadRounds(s.reload)+1e-8));
  if(s.reload<1e-8){s.reload=0;s.ammo=2;s.spent=0;sim.events.push({type:'shotgunReloaded'});}
  else if(s.ammo>0&&(pressed||input.doubleShot)){
   s.reload=0;s.suppress=false;interruptedReload=true;
  }else{s.trigger=!!input.fire;return;}
 }
 if(s.pending>0){s.pending=Math.max(0,s.pending-dt);if(s.pending<1e-8){s.pending=0;fire(SHOTGUN.doubleRecoilScale);}}
 if((input.reload||emptyTrigger)&&s.ammo<2&&!s.pending&&!interruptedReload&&p.hp>0){s.reload=SHOTGUN.reload;s.suppress=!!input.fire;sim.events.push({type:'shotgunReload',spent:s.spent,live:s.ammo});s.trigger=!!input.fire;return;}
 if(sim.dev.ammo&&!s.ammo&&!s.pending){s.ammo=2;s.spent=0;}
 if(s.ammo<=0){s.trigger=!!input.fire;s.suppress=false;return;}
 const suppressed=s.suppress;
 if(!input.fire)s.suppress=false;
 if(input.doubleShot&&s.cooldown<=1e-8&&s.ammo&&!s.pending){
  const both=s.ammo===2;
  // Begin moving immediately, but save the main combined kick for barrel two.
  fire(both?SHOTGUN.doubleRecoilLead:1);if(both){s.pending=SHOTGUN.doubleDelay;sim.events.push({type:'shotgunDouble'});}
  s.suppress=!!input.fire;
 }else if(!suppressed&&!s.pending&&s.cooldown<=1e-8&&s.ammo&&pressed)fire();
 s.trigger=!!input.fire;
}
