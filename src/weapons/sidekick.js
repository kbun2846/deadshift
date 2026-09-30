import { SIDEKICK as S, TERRAIN, hpRoll, hpRound } from '../config/gameplay.js';
import { collidersAlong } from '../world/collider-grid.js';
import { targetRadius } from '../target-radius.js';
import { roundOnGround, roundMeets, roundSees } from './rifle.js';
import { pistolSpread } from './sightline.js';
import { cropCircle } from '../crops.js';
export { S as SIDEKICK };
// ± spread in fifths of a point (gameplay.js hpRoll; whole points at 500 health).
const roll=(base,spread)=>hpRoll(base,spread);
export function resetSidekick(sim,keep=false){
 const old=sim.sidekick;
 sim.sidekick={ammo:S.magazine,offAmmo:0,reload:0,cooldown:0,trigger:false,aiming:false,active:0,summon:0,xCooldown:keep?old?.xCooldown||0:0,mineCooldown:keep?old?.mineCooldown||0:0,mineCharges:keep?(old?.mineCharges??S.mineLimit):S.mineLimit,hand:0,shotClock:0};
 sim.sidekickRounds=[];sim.sidekickMines=[];delete sim.player?.sidekick;
}
export function stepSidekickMobility(sim,input,dt){
 const s=sim.sidekick;
 if(sim.weapon!=='sidekick'){delete sim.player.sidekick;return;}
 if(sim.player.dead||sim.player.hp<=0){s.active=s.summon=0;delete sim.player.sidekick;return;}
 s.xCooldown=sim.dev.cooldowns?0:Math.max(0,s.xCooldown-dt);
 if(s.summon>0){s.summon=Math.max(0,s.summon-dt);if(s.summon<1e-8){s.summon=0;s.active=S.duration;}}
 else s.active=Math.max(0,s.active-dt);
 if(!s.active&&!s.summon)s.offAmmo=0;
 if(input.sidekickX&&!s.active&&!s.summon&&s.xCooldown<=1e-8&&!sim.player.dodgeRemaining){
  s.summon=S.summon;s.offAmmo=S.magazine;s.reload=0;s.hand=0;s.xCooldown=S.xCooldown;
  if(!sim.predictOnly)sim.events.push({type:'sidekickRush',x:sim.player.x,z:sim.player.z});
 }
 sim.player.sidekick={active:s.active,summon:s.summon,reload:s.reload,hand:s.hand,shotClock:s.shotClock};
}
export const mineDamage=(distance,damage=S.mineDamage)=>distance>S.mineRadius?0:distance<=S.mineCore?damage:hpRound(damage*(1-.8*(distance-S.mineCore)/(S.mineRadius-S.mineCore)));
export function stepSidekickMines(sim,dt,segmentBox){
 if(sim.predictOnly)return;
 for(const mine of sim.sidekickMines){
  mine.age+=dt;if(mine.age<S.mineArm)continue;
  const open=t=>Math.abs(sim.standY(t)-mine.y)<.8&&!sim.colliders.some(c=>!c.playerOnly&&segmentBox(mine.x,mine.z,t.x,t.z,c)!==null);
  const victim=sim.targets.find(t=>t.hp>0&&!t.friendly&&t.id!==mine.owner&&Math.hypot(t.x-mine.x,t.z-mine.z)<=S.mineTrigger&&open(t));
  if(!victim)continue;
  const damage=roll(S.mineDamage,S.mineRoll),cover=[...sim.colliders];
  const amount=(t,propId=null)=>{
   const reach=Math.hypot(t.x-mine.x,t.z-mine.z,sim.standY(t)-mine.y);
   if(!sim.ground.flat&&!sim.ground.sightClear(mine.x,mine.z,t.x,t.z,mine.y,sim.standY(t)))return 0;
   return cover.some(c=>!c.playerOnly&&c.propId!==propId&&segmentBox(mine.x,mine.z,t.x,t.z,c)!==null)?0:mineDamage(reach,damage);
  };
  for(const t of sim.targets){if(t.hp<=0||t.friendly)continue;const hit=amount(t);if(hit)sim.hit(t,{owner:mine.owner,volley:mine.volley,damage:hit,damageType:'sidekickMine',blast:true,vx:t.x-mine.x,vz:t.z-mine.z,x:mine.x,z:mine.z});}
  for(const prop of sim.props){if(!(prop.hp>0))continue;const hit=amount(prop,prop.id);if(hit)sim.hitProp(prop,{damage:hit,damageType:'sidekickMine',blast:true,x:prop.x,z:prop.z,vx:prop.x-mine.x,vz:prop.z-mine.z});}
  cropCircle(sim,mine,S.mineRadius,false,(a,b)=>!cover.some(c=>!c.playerOnly&&segmentBox(a.x,a.z,b.x,b.z,c)!==null));
  sim.events.push({type:'grenadeExplosion',id:mine.id,x:mine.x,z:mine.z,below:mine.below,radius:S.mineRadius,count:12,damage,damageType:'sidekickMine'});mine.dead=true;sim.volleyKills.delete(mine.volley);
 }
 sim.sidekickMines=sim.sidekickMines.filter(m=>!m.dead);
}
function shoot(sim,hand,geo){
 const s=sim.sidekick,p=sim.player,side=hand?-.27:.27;
 const reach=Math.hypot(p.aimPointX-p.x,p.aimPointZ-p.z)||10,spread=sim.dev.noSpread?0:pistolSpread(reach,Math.hypot(p.vx,p.vz),s.aiming);
 let x=p.x+p.aimX*.79-p.aimZ*side,z=p.z+p.aimZ*.79+p.aimX*side;
 if(sim.colliders.some(c=>!c.playerOnly&&geo.segmentBox(p.x,p.z,x,z,c)!==null)){x=p.x;z=p.z;}
 // Both hands converge on the same aim ray; switching hands never shifts the cursor.
 const angle=Math.atan2(p.aimZ,p.aimX)+(hand?Math.atan2(.54,Math.max(2,reach)):0)+(Math.random()*2-1)*spread;
 const b={id:++sim.serial,volley:++sim.volley,x,z,y:sim.standY()+TERRAIN.roundHeight,dx:Math.cos(angle),dz:Math.sin(angle),travel:0,range:S.range,damage:roll(S.damage,S.damageRoll),below:!!p.below};
 roundOnGround(sim,b,S.range);sim.sidekickRounds.push(b);sim.stats.launched++;s.shotClock++;
 // Rush borrows unlimited rounds; the original magazine is kept for its return.
 if(!sim.dev.ammo&&s.active<=0)s.ammo--;
 sim.events.push({type:'sidekickShot',x,z,y:b.y,dx:b.dx,dz:b.dz,hand,dual:s.active>0,below:b.below});
}
export function stepSidekick(sim,input,dt,geo){
 if(sim.predictOnly)return;
 const s=sim.sidekick,p=sim.player;s.mineCount=sim.sidekickMines.length;s.aiming=!!input.aiming;
 s.cooldown=Math.max(0,s.cooldown-dt);s.mineCooldown=sim.dev.cooldowns?0:Math.max(0,s.mineCooldown-dt);
 if(s.mineCharges===0&&s.mineCooldown<=1e-8){s.mineCharges=S.mineLimit;s.mineCooldown=0;}
 const pressed=!!input.tapFire||!!input.fire&&!s.trigger;s.trigger=!!input.fire;
 if(p.dead||p.hp<=0){s.active=s.summon=s.reload=0;delete p.sidekick;}
 else{
  if(input.sidekickMine&&s.mineCharges>0&&s.mineCooldown<=1e-8&&!p.dodgeRemaining){
   // Start the next pair only when a new mine is placed, not when it refills.
   if(s.mineCharges===S.mineLimit){for(const old of sim.sidekickMines)sim.volleyKills.delete(old.volley);sim.sidekickMines=[];}
   sim.sidekickMines.push({id:++sim.serial,volley:++sim.volley,owner:p.id,x:p.x,z:p.z,y:sim.standY(),below:!!p.below,age:0});
   s.mineCharges--;if(s.mineCharges===0)s.mineCooldown=S.mineCooldown;sim.events.push({type:'sidekickMine',x:p.x,z:p.z});
  }
  if(s.reload>0){s.reload=Math.max(0,s.reload-dt);if(s.reload<1e-8){s.reload=0;s.ammo=S.magazine;s.offAmmo=s.active?S.magazine:0;sim.events.push({type:'sidekickReloaded'});}}
  const rushing=s.active>0,fire=rushing?(input.fire||input.tapFire):pressed;
  if(!s.reload&&!s.summon&&!p.dodgeRemaining){
   if(!rushing&&(input.reload||fire&&s.ammo===0)&&s.ammo<S.magazine){s.reload=S.reload;sim.events.push({type:'sidekickReload',x:p.x,z:p.z});}
   else if(fire&&(rushing||s.ammo>0)&&s.cooldown<=1e-8){const hand=rushing?s.hand:0;shoot(sim,hand,geo);s.hand=s.active?1-hand:0;s.cooldown=S.interval/(s.active?S.fireRate:1);}
  }
  s.mineCount=sim.sidekickMines.length;
  p.sidekick={active:s.active,summon:s.summon,reload:s.reload,hand:s.hand,shotClock:s.shotClock};
 }
 for(const b of sim.sidekickRounds){
  const length=Math.max(0,Math.min(S.speed*dt,(b.stop??S.range)-b.travel)),ex=b.x+b.dx*length,ez=b.z+b.dz*length;
  let at=1,target=null,prop=null,blocked=false;
  for(const c of collidersAlong(sim.colliders,b.x,b.z,ex,ez,.035)){if(c.playerOnly)continue;const t=geo.segmentBox(b.x,b.z,ex,ez,c,.025);if(t!==null&&t<=at&&roundMeets(sim,b,c,b.x+b.dx*length*t,b.z+b.dz*length*t,b.travel+length*t)){at=t;blocked=true;prop=sim.props.find(v=>v.id===c.propId);}}
  for(const t of sim.targets){if(t.hp<=0)continue;const hit=geo.segmentCircle(b.x,b.z,ex,ez,t.x,t.z,targetRadius(t)+.025);if(hit!==null&&hit<at&&roundSees(sim,b,t,b.travel+length*hit)){at=hit;target=t;prop=null;blocked=true;}}
  {const wall=sim.shieldStop(b.x,b.z,ex,ez);if(wall!==null&&wall<at){at=wall;target=prop=null;blocked=true;sim.events.push({type:'hexBlock',x:b.x+b.dx*length*wall,z:b.z+b.dz*length*wall,wall:true});}} // (v0.990a: a hex's wall stops it)
  b.x+=b.dx*length*at;b.z+=b.dz*length*at;b.travel+=length*at;b.y=(b.flight?sim.ground.flightAt(b.flight,b.travel):0)+TERRAIN.roundHeight;
  const shot={owner:p.id,volley:b.volley,damage:b.damage,damageType:'sidekickShot',bullet:true,vx:b.dx,vz:b.dz,x:b.x,z:b.z};
  if(target)sim.hit(target,shot);if(prop)sim.hitProp(prop,shot);
  if(blocked||b.travel>=(b.stop??S.range)-1e-8){b.dead=true;sim.events.push({type:'sidekickImpact',x:b.x,z:b.z,below:b.below});}
 }
 sim.sidekickRounds=sim.sidekickRounds.filter(b=>!b.dead);
}
