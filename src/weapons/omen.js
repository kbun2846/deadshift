// Curses belong to the caster, keyed by target id, not to disposable player
// proxies. Solo robots and the online arena both rebuild proxies each tick.
import { OMEN, TERRAIN } from '../config/gameplay.js';
import { collidersAlong } from '../world/collider-grid.js';
import { targetRadius } from '../target-radius.js';
import { roundOnGround, roundSees, roundMeets } from './rifle.js';
import { onScreenOf } from '../render/camera-framing.js';
export { OMEN };
export const omenDamage = distance => OMEN.damage + (OMEN.minDamage-OMEN.damage)*Math.max(0,Math.min(1,(distance-OMEN.fullRange)/(OMEN.falloff-OMEN.fullRange)));
export const omenBlastDamage = left => OMEN.blastDamage+(OMEN.lateDamage-OMEN.blastDamage)*Math.max(0,Math.min(1,1-left/OMEN.lateWindow));
// Keep E's five tick rolls and 31 blast rolls uniformly distributed after the
// 10% damage reduction. Roll on the damage authority; X has no random roll.
const curseRoll = variance => {
 const steps=Math.round(variance/OMEN.curseRollStep);
 return (Math.floor(Math.random()*(steps*2+1))-steps)*OMEN.curseRollStep;
};
export function resetOmen(sim, keepCooldown=false) {
 const old=sim.omen;
 sim.omen={ammo:OMEN.magazine,reload:0,cooldown:0,primed:false,primeLeft:0,primeCooldown:keepCooldown?old?.primeCooldown||0:0,
  volleyCooldown:keepCooldown?old?.volleyCooldown||0:0,volleyLeft:0,group:0,aiming:false,marks:[]};
 sim.omenBolts=[];
}
export const omenCurseLeft=sim=>sim.omen?.marks.find(m=>m.kind==='e')?.left||0;
function fade(sim,m){sim.events.push({type:'omenFade',x:m.x,z:m.z,below:m.below,kind:m.kind});}
export function clearOmen(sim) {
 if(!sim.omen)return;
 for(const m of sim.omen.marks)fade(sim,m);
 sim.omen.marks.length=0;sim.omen.primed=false;sim.omen.primeLeft=0;sim.omen.volleyLeft=0;
 // A dead caster cannot place a curse after the cancellation.
 sim.omenBolts.length=0;
}
function mark(sim,t,b) {
 if(t.friendly||t.hp<=0)return;
 const s=sim.omen,kind=b.kind;
 if(kind==='x'&&(b.group!==s.group||s.volleyLeft<=0))return;
 const existing=s.marks.find(m=>m.id===t.id);
 // Repeated diamonds do impact damage but never stack ticks or refresh time.
 if(existing)return;
 if(kind==='e')for(let i=s.marks.length-1;i>=0;i--)if(s.marks[i].kind==='e'){fade(sim,s.marks[i]);s.marks.splice(i,1);}
 const m={id:t.id,kind,group:kind==='x'?s.group:0,x:t.x,z:t.z,below:!!t.below,
  left:kind==='x'?s.volleyLeft:OMEN.curseDuration,duration:kind==='x'?OMEN.volleyDuration:OMEN.curseDuration,tick:0,beat:0};
 s.marks.push(m);sim.events.push({type:'omenMark',x:t.x,z:t.z,kind,below:m.below});
}
function splashDistance(sim,m,t){
 const distance=Math.hypot(t.x-m.x,t.z-m.z);
 if(sim.ground.flat)return distance;
 const source=sim.standY(m),dest=sim.standY(t);
 return sim.ground.sightClear(m.x,m.z,t.x,t.z,source,dest)?Math.hypot(distance,dest-source):Infinity;
}
function detonate(sim,kind,{segmentBox}) {
 const s=sim.omen,marks=s.marks.filter(m=>m.kind===kind&&m.left>1e-8),damage=new Map();
 for(const m of marks){
  const direct=sim.targets.find(t=>t.id===m.id&&t.hp>0);if(!direct)continue;
  const directDamage=omenBlastDamage(m.left)+(kind==='e'?curseRoll(OMEN.curseBlastVariance):0);
  sim.events.push({type:'omenBurst',kind,x:m.x,z:m.z,below:m.below,power:omenBlastDamage(m.left)/OMEN.lateDamage,radius:OMEN.blastRadius});
  for(const t of sim.targets){
   if(t.hp<=0||t.id===sim.player.id)continue;
   let hit;
   if(t.id===m.id)hit=directDamage;
   else{
    if(Math.hypot(t.x-m.x,t.z-m.z)>OMEN.blastRadius+targetRadius(t))continue;
    const d=splashDistance(sim,m,t);
    const edge=Math.max(0,d-targetRadius(t));
    if(edge>OMEN.blastRadius||sim.colliders.some(c=>!c.playerOnly&&!c.propId&&segmentBox(m.x,m.z,t.x,t.z,c)!==null))continue;
    hit=OMEN.splash+(OMEN.splashEdge-OMEN.splash)*edge/OMEN.blastRadius;
   }
   const old=damage.get(t.id);damage.set(t.id,{t,damage:Math.min(OMEN.blastCap,(old?.damage||0)+hit),x:m.x,z:m.z});
  }
 }
 const volley=++sim.volley;
 for(const {t,damage:amount,x,z} of damage.values())sim.hit(t,{owner:sim.player.id,volley,damage:amount,damageType:'omenBlast',blast:true,vx:t.x-x,vz:t.z-z});
 s.marks=s.marks.filter(m=>m.kind!==kind);
 if(kind==='x'){s.volleyLeft=0;sim.omenBolts=sim.omenBolts.filter(b=>b.kind!=='x');}
}
function launch(sim,kind,geo,target=null,index=0) {
 const p=sim.player,s=sim.omen;
 let angle=Math.atan2(p.aimZ,p.aimX);
 if(target)angle=Math.atan2(target.z-p.z,target.x-p.x)+(index-1)*.16;
 else angle+=(sim.dev.noSpread?0:(Math.random()-.5)*2*OMEN.spread);
 const mx=p.x+p.aimX*OMEN.muzzle-p.aimZ*OMEN.lateral,mz=p.z+p.aimZ*OMEN.muzzle+p.aimX*OMEN.lateral;
 const blocked=sim.colliders.some(c=>!c.playerOnly&&geo.segmentBox(p.x,p.z,mx,mz,c)!==null);
 const b={id:++sim.serial,kind,group:s.group,owner:p.id,x:blocked?p.x:mx,z:blocked?p.z:mz,dx:Math.cos(angle),dz:Math.sin(angle),travel:0,age:0,
  target:target?.id,speed:kind==='x'?OMEN.volleySpeed:OMEN.speed,below:!!p.below};
 // If a wall cuts the hand's reach, start behind it so the sweep catches it.
 if(kind!=='x')roundOnGround(sim,b,OMEN.range);
 else b.base=sim.standY();
 sim.omenBolts.push(b);
 sim.events.push({type:'omenShot',x:mx,z:mz,y:sim.standY()+TERRAIN.roundHeight,dx:b.dx,dz:b.dz,below:b.below,kind});
}
function volleyTargets(sim){
 const p=sim.player;
 return sim.targets.filter(t=>t.hp>0&&!t.friendly&&t.id!==p.id
  &&Math.hypot(t.x-p.x,t.z-p.z)<=OMEN.volleyRange
  &&onScreenOf(sim.viewAspect||16/9,t.x-p.x,t.z-p.z,sim.ground.flat?0:sim.standY(t)-sim.standY())
  &&sim.canSeeEntity(t.x,t.z,targetRadius(t))
  &&(sim.ground.flat||sim.ground.sightClear(p.x,p.z,t.x,t.z,sim.standY(),sim.standY(t))))
  .sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z));
}
export function stepOmen(sim,input,dt,geo){
 if(sim.predictOnly)return;
 const s=sim.omen,p=sim.player;
 s.primeCooldown=Math.max(0,s.primeCooldown-dt);s.volleyCooldown=Math.max(0,s.volleyCooldown-dt);
 if(p.dead||p.hp<=0){clearOmen(sim);return;}
 if(sim.dev.cooldowns||sim.dev.omenCooldowns)s.primeCooldown=s.volleyCooldown=0;
 // An unfired charge consumes its reserved round at the exact five-second
 // endpoint, before a same-tick shot can use it. Reloading never refreshes it.
 if(s.primed){
  s.primeLeft=Math.max(0,s.primeLeft-dt);
  if(s.primeLeft<=1e-8){
   s.primed=false;s.primeLeft=0;s.ammo=Math.max(0,s.ammo-1);s.primeCooldown=OMEN.primeCooldown;
   sim.events.push({type:'omenPrimeExpired',x:p.x,z:p.z,below:!!p.below});
  }
 }
 s.aiming=false;s.cooldown=Math.max(0,s.cooldown-dt);
 s.volleyLeft=Math.max(0,s.volleyLeft-dt);if(s.volleyLeft<1e-8)s.volleyLeft=0;
 // Tick at the endpoint, then expire BEFORE accepting a detonation press.
 for(let i=s.marks.length-1;i>=0;i--){
  const m=s.marks[i],t=sim.targets.find(t=>t.id===m.id&&t.hp>0);
  if(!t){fade(sim,m);s.marks.splice(i,1);continue;}
  const elapsed=Math.min(dt,m.left);
  m.x=t.x;m.z=t.z;m.below=!!t.below;m.tick+=elapsed;m.beat=(m.beat||0)+elapsed;m.left=Math.max(0,m.left-dt);
  while(m.tick+1e-8>=OMEN.tick){m.tick-=OMEN.tick;sim.hit(t,{owner:p.id,volley:'omen'+m.kind+m.group,damage:OMEN.tickDamage+(m.kind==='e'?curseRoll(OMEN.curseTickVariance):0),damageType:'omenCurse'});}
  if(m.left<=1e-8||t.hp<=0){fade(sim,m);s.marks.splice(i,1);continue;}
  // A separate one-second sound clock: damage still ticks every half second.
  while(m.beat+1e-8>=OMEN.curseBeat){m.beat-=OMEN.curseBeat;sim.events.push({type:'omenCurseBeat',id:m.id,kind:m.kind,x:m.x,z:m.z,below:m.below});}
 }
 // E is one action: prime a round, then rupture its landed curse. A press
 // before impact is not buffered and never refreshes or spends another prime.
 if(input.omenPrime){
  if(s.marks.some(m=>m.kind==='e'))detonate(sim,'e',geo);
  else if(!s.primed&&!sim.omenBolts.some(b=>b.kind==='e')&&s.primeCooldown<=1e-8&&s.ammo>0&&!s.reload){
   s.primed=true;s.primeLeft=OMEN.primeWindow;sim.events.push({type:'omenPrime',x:p.x,z:p.z,below:!!p.below});
  }
 }
 if(input.omenVolley){
  if(s.volleyLeft>1e-8)detonate(sim,'x',geo);
  else if(s.volleyCooldown<=1e-8&&!p.dodgeRemaining){
   const targets=volleyTargets(sim);
   if(targets.length){
    s.group++;s.volleyLeft=OMEN.volleyDuration;s.volleyCooldown=OMEN.volleyCooldown;
    for(let i=0;i<OMEN.volleyCount;i++)launch(sim,'x',geo,targets[i%Math.min(targets.length,OMEN.volleyCount)],i);
    sim.events.push({type:'omenVolley',x:p.x,z:p.z});
   }
  }
 }
 if(sim.dev.omenInstantReload&&s.reload>0){s.reload=0;s.ammo=OMEN.magazine;}
 if(s.reload>0){s.reload=Math.max(0,s.reload-dt);if(s.reload<=1e-8){s.ammo=OMEN.magazine;s.reload=0;sim.events.push({type:'omenReloaded'});}}
 else if(input.reload&&s.ammo<OMEN.magazine){s.reload=OMEN.reload;sim.events.push({type:'omenReload',x:p.x,z:p.z});}
 if(sim.dev.ammo)s.ammo=OMEN.magazine;
 if(input.fire&&!s.reload&&!p.dodgeRemaining&&s.cooldown<=1e-8){
  if(!s.ammo){s.reload=OMEN.reload;sim.events.push({type:'omenReload',x:p.x,z:p.z});}
  else{launch(sim,s.primed?'e':'base',geo);if(s.primed){s.primed=false;s.primeLeft=0;s.primeCooldown=OMEN.primeCooldown;}if(!sim.dev.ammo)s.ammo--;s.cooldown=OMEN.interval;sim.stats.launched++;}
 }
 for(const b of sim.omenBolts){
  b.age+=dt;
  if(b.kind==='x'){
   if(s.volleyLeft<=1e-8||b.group!==s.group){b.dead=true;continue;}
   const t=sim.targets.find(t=>t.id===b.target&&t.hp>0);
   if(t){
    const dx=t.x-b.x,dz=t.z-b.z;
    // A dodger can cross the flight line. Once passed, never loop back or reacquire.
    if(dx*b.dx+dz*b.dz<=0)b.target=null;
    else{const a=Math.atan2(b.dz,b.dx),want=Math.atan2(dz,dx),delta=Math.atan2(Math.sin(want-a),Math.cos(want-a));
     const turn=Math.max(-OMEN.volleyTurn*dt,Math.min(OMEN.volleyTurn*dt,delta));b.dx=Math.cos(a+turn);b.dz=Math.sin(a+turn);}
   }
  }
  const travel=Math.min(b.speed*dt,(b.stop??OMEN.range)-b.travel);
  if(b.kind==='x'&&!sim.ground.flat){
   b.flight=sim.ground.flight(b.x,b.z,b.dx,b.dz,travel,b.base);b.segment=true;
  }
  const endX=b.x+b.dx*travel,endZ=b.z+b.dz*travel;
  let first=1,target=null,prop=null,blocked=false;
  for(const c of collidersAlong(sim.colliders,b.x,b.z,endX,endZ,OMEN.radius)){
   if(c.playerOnly)continue;
   const at=geo.segmentBox(b.x,b.z,endX,endZ,c,OMEN.radius);
   if(at!==null&&at<=first&&roundMeets(sim,b,c,b.x+b.dx*travel*at,b.z+b.dz*travel*at,(b.segment?0:b.travel)+travel*at)){first=at;target=null;prop=sim.props.find(p=>p.id===c.propId);blocked=true;}
  }
  for(const t of sim.targets){
   if(t.hp<=0)continue;
   const at=geo.segmentCircle(b.x,b.z,endX,endZ,t.x,t.z,targetRadius(t)+OMEN.radius);
   if(at!==null&&at<first&&roundSees(sim,b,t,(b.segment?0:b.travel)+travel*at)){first=at;target=t;prop=null;blocked=true;}
  }
  if(b.segment&&b.flight.stop<travel){const at=b.flight.stop/travel;if(at<=first){first=at;target=prop=null;blocked=true;}}
  b.x+=b.dx*travel*first;b.z+=b.dz*travel*first;b.travel+=travel*first;
  if(b.segment)b.base=sim.ground.flightAt(b.flight,travel*first);
  b.y=(b.segment?b.base:b.flight?sim.ground.flightAt(b.flight,b.travel):0)+TERRAIN.roundHeight;
  if(blocked){
   const shot={owner:p.id,volley:++sim.volley,damage:b.kind==='e'?OMEN.primeDamage:b.kind==='x'?OMEN.volleyDamage:omenDamage(b.travel),damageType:'omenShot',bullet:true,vx:b.dx,vz:b.dz,x:b.x,z:b.z};
   if(target){const before=target.hp;sim.hit(target,shot);if(target.hp<before&&b.kind!=='base')mark(sim,target,b);}
   else if(prop)sim.hitProp(prop,shot);
   sim.events.push({type:'omenImpact',x:b.x,z:b.z,y:b.y,dx:b.dx,dz:b.dz,below:b.below,kind:b.kind});b.dead=true;
  }
  if(b.travel>=(b.stop??OMEN.range)-1e-8||(b.kind==='x'&&b.age>=OMEN.volleyLife))b.dead=true;
 }
 sim.omenBolts=sim.omenBolts.filter(b=>!b.dead);
}
