import { ICHOR as I, TERRAIN } from '../config/gameplay.js';
import {endIchorGuard} from './ichor-deflect.js';
import { targetRadius } from '../target-radius.js';
import { ichorCutForce,ichorCutArc,ichorSpin,ichorCoverMeets } from './ichor-cut.js';
export { I as ICHOR };
// Varied, authored sequences: diagonal cuts, reverse sweeps and whole-body spins.
export const ICHOR_NORMAL=[0,7,1,8,3,2,9,4,1,0,8,5];
export const ICHOR_COMBOS=[[0,7,1,8,3,4,9,2,7,0,1,5],[8,1,7,2,4,9,0,3,2,7,1,5],[2,9,0,4,7,1,8,3,7,2,0,5]];
export const ichorEndSide=variant=>[0,2,4,6,7,8].includes(variant)?1:-1;
export function nextIchorCut(s){
 const side=s.serial?ichorEndSide(s.variant):-1,start=s.normalIndex||0;
 for(let i=0;i<ICHOR_NORMAL.length;i++){const at=(start+i)%ICHOR_NORMAL.length,v=ICHOR_NORMAL[at];if((v%2?1:-1)===side){s.normalIndex=(at+1)%ICHOR_NORMAL.length;return v;}}
 return side>0?1:0;
}
export function resetIchor(sim,keep=false){const old=sim.ichor;sim.ichor={guarding:false,guardHeld:false,guardShots:0,guardStrength:keep?old?.guardStrength||0:0,guardFlash:0,guardCooldown:keep?old?.guardCooldown||0:0,blood:0,lastGain:0,normalIndex:0,parryCooldown:0,parrySerial:-1,chain:0,chainAt:-10,chainVolley:-1,cooldown:0,eCooldown:keep?old?.eCooldown||0:0,xCooldown:keep?old?.xCooldown||0:0,trigger:false,swing:0,variant:0,serial:0,contact:false,frenzy:0,index:0,dashWindow:0,power:0,combo:0,trail:false};sim.ichorWaves=[];sim.ichorBleeds=[];sim.ichorTrails=[];delete sim.player?.ichor;}
export const ichorDamage=blood=>I.damage+(I.maxDamage-I.damage)*Math.max(0,Math.min(1,blood/I.meterMax));
export function ichorOnTrail(sim){const p=sim.player;return sim.weapon==='ichor'&&(sim.ichorTrails||[]).some(t=>t.life>0&&Math.hypot(p.x-t.x,p.z-t.z)<t.r&&Math.abs(sim.standY()-t.y)<.65);}
function start(sim,variant,power,frenzy=false){const s=sim.ichor,p=sim.player;s.swing=frenzy?I.frenzyInterval:I.interval;s.duration=s.swing;s.variant=variant;s.serial++;s.contact=false;s.power=power;s.cutFrenzy=frenzy;s.cutX=p.aimX;s.cutZ=p.aimZ;s.volley=++sim.volley;sim.events.push({type:'ichorSwing',x:p.x,z:p.z,dx:s.cutX,dz:s.cutZ,variant,power,frenzy,beat:frenzy?s.index-1:0,finisher:frenzy&&s.index===I.hits,serial:s.serial,duration:s.duration,below:!!p.below});}
export function ichorBloodGain(type,random=Math.random){const wave=type==='ichorWave';return (wave?I.waveGain:I.gain)+(random()*2-1)*(wave?I.waveGainRoll:I.gainRoll);}
function hit(sim,t,damage,dx,dz,type,power,volley){const before=t.hp;sim.hit(t,{owner:sim.player.id,damage,damageType:type,vx:dx,vz:dz,volley,bloodLevel:power});if(t.hp>=before)return;
 const s=sim.ichor;
 // Only a new successful attack advances the chain; hitting several people
 // with the same cut never multiplies the streak again.
 if(s.chainVolley!==volley){s.chain=sim.time-s.chainAt<=I.chainWindow?Math.min(4,s.chain+1):1;s.chainAt=sim.time;s.chainVolley=volley;}
 const chainBonus=Math.min(I.chainMax,Math.max(0,s.chain-1)*I.chainStep);
 s.blood=Math.min(I.meterMax,s.blood+ichorBloodGain(type)*(1+chainBonus));s.lastGain=sim.time;
 if(t.kind==='player'&&t.hp>0&&power>=.999){let mark=sim.ichorBleeds.find(m=>m.id===t.id);if(!mark){mark={id:t.id,tick:0};sim.ichorBleeds.push(mark);}Object.assign(mark,{left:I.bleedDuration,hp:t.hp});}
}
// Knee-high bases are solid for feet, but cannot shield the stone above them.
// Keep full walls and ordinary cover blocking; only authored low tops are passed.
function contact(sim,geo){const s=sim.ichor,p=sim.player,spin=ichorSpin(s.variant),dash=s.variant===6,reach=I.range+(spin?.25:dash?I.dashReach:0),arc=ichorCutArc(s.variant);
 const open=t=>Math.abs(sim.standY(t)-sim.standY())<1.2&&!sim.colliders.some(c=>{if(c.playerOnly||c.propId===t.id)return false;const k=geo.segmentBox(p.x,p.z,t.x,t.z,c);return k!==null&&ichorCoverMeets(sim,c,p.x+(t.x-p.x)*k,p.z+(t.z-p.z)*k,sim.standY()+.72+(sim.standY(t)-sim.standY())*k);});
 const inCut=t=>{const dx=t.x-p.x,dz=t.z-p.z,d=Math.hypot(dx,dz),r=targetRadius(t);return d<=reach+r&&(d<.5||spin||Math.acos(Math.max(-1,Math.min(1,(dx*s.cutX+dz*s.cutZ)/(d||1))))<=arc/2+Math.asin(Math.min(1,r/(d||1))))&&open(t);};
 const victims=sim.targets.filter(t=>t.hp>0&&!t.friendly&&inCut(t)).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z));
 const damage=s.cutFrenzy?(I.frenzyDamage+(I.frenzyMax-I.frenzyDamage)*s.power)/I.hits:ichorDamage(s.power*100)*(dash?I.dashDamage:1);
 const force=t=>ichorCutForce(s.variant,s.cutX,s.cutZ,t.x-p.x,t.z-p.z);
 victims.forEach((t,i)=>{const f=force(t);hit(sim,t,damage*(s.cutFrenzy&&i>0?I.splash:1),f.x,f.z,s.cutFrenzy?'ichorFrenzy':'ichorSlash',s.power,s.volley);});
 // Resolve every prop against the same cover before breaking any of it.
 // Destroying the front crate must not let this same cut hit through it.
 const props=sim.props.filter(prop=>prop.hp>0&&inCut(prop));
 for(const prop of props){const f=force(prop);sim.hitProp(prop,{damage,damageType:'ichorSlash',x:prop.x,z:prop.z,vx:f.x,vz:f.z});}sim.volleyKills.delete(s.volley);
}
export function stepIchor(sim,input,dt,geo){if(sim.predictOnly)return;const s=sim.ichor,p=sim.player;
 for(const t of sim.ichorTrails)t.life-=dt;sim.ichorTrails=sim.ichorTrails.filter(t=>t.life>0);
 for(const m of sim.ichorBleeds){m.left-=dt;const t=sim.targets.find(t=>t.id===m.id);if(!t||t.hp<=0||t.hp>m.hp+.01){m.left=0;continue;}m.hp=t.hp;m.tick-=dt;if(m.tick<=0){m.tick=.16;const trail={x:t.x,z:t.z,y:sim.standY(t),r:.72,life:I.trailLife};sim.ichorTrails.push(trail);if(sim.ichorTrails.length>I.trailCap)sim.ichorTrails.shift();sim.events.push({type:'ichorDrip',id:t.id,x:t.x,z:t.z,below:!!t.below});}}
 sim.ichorBleeds=sim.ichorBleeds.filter(m=>m.left>0);s.trail=ichorOnTrail(sim);
 for(const k of ['cooldown','eCooldown','xCooldown'])s[k]=sim.dev.cooldowns&&k!=='cooldown'?0:Math.max(0,s[k]-dt*(k!=='cooldown'&&s.blood>=I.meterMax?I.fullRecharge:1));
 s.parryCooldown=Math.max(0,(s.parryCooldown||0)-dt);
 s.guardCooldown=sim.dev.cooldowns?0:Math.max(0,(s.guardCooldown||0)-dt);s.guardFlash=Math.max(0,(s.guardFlash||0)-dt);
 const guardHeld=!!input.ichorGuard;
 if(s.guarding&&(!guardHeld||input.ichorE||input.ichorX||p.dead||p.hp<=0))endIchorGuard(s);
 if(guardHeld&&!s.guardHeld&&s.guardCooldown<=1e-8&&!input.ichorE&&!input.ichorX&&!p.dead&&p.hp>0){s.guarding=true;if(!(s.guardStrength>0)){s.guardShots=0;s.guardStrength=I.guardCapacity-I.guardRoll+Math.floor(Math.random()*(I.guardRoll*2+1));}s.swing=s.frenzy=0;s.contact=true;sim.events.push({type:'ichorGuardStart',x:p.x,z:p.z});}
 s.guardHeld=guardHeld;if(s.guarding){s.guardX=p.aimX;s.guardZ=p.aimZ;}

 const press=!!input.tapFire||!!input.fire;s.trigger=!!input.fire;
 s.dashWindow=p.dodgeRemaining>0?I.dashGrace:Math.max(0,(s.dashWindow||0)-dt);
 const speed=Math.hypot(p.vx,p.vz);s.moving=Math.min(1,speed/5);s.moveSide=(-p.vx*p.aimZ+p.vz*p.aimX)/(speed||1);s.moveForward=(p.vx*p.aimX+p.vz*p.aimZ)/(speed||1);
 if(p.dead||p.hp<=0){s.frenzy=s.swing=0;sim.ichorBleeds=[];delete p.ichor;}
 else{
  if(s.blood>I.regenThreshold&&!s.frenzy&&!(input.ichorX&&s.xCooldown<=1e-8))p.hp=Math.min(p.maxHp,p.hp+I.regen*dt);
  if(s.frenzy>0){const spent=Math.min(dt,s.frenzy);s.frenzy=Math.max(0,s.frenzy-dt);if(s.frenzy<1e-8)s.frenzy=0;const cost=Math.min(p.hp-1,I.healthDrain*spent);if(cost>0&&!sim.dev.invulnerable){p.hp-=cost;sim.events.push({type:'playerDamage',damage:cost,damageType:'ichorCost'});}if(!s.frenzy)p.hp=Math.round(p.hp*1e6)/1e6;if(p.hp<=1)s.frenzy=s.swing=0;}
  if(s.swing>0){s.swing=Math.max(0,s.swing-dt);if(s.swing<1e-8)s.swing=0;if(!s.contact&&s.duration-s.swing>=I.contact){s.contact=true;contact(sim,geo);}}
  if(!s.frenzy&&sim.time-s.lastGain>I.decayDelay)s.blood=Math.max(0,s.blood-I.decay*dt);
  if(!s.guarding&&(!p.dodgeRemaining||s.frenzy>0||press)){
   if(!p.dodgeRemaining&&input.ichorX&&s.xCooldown<=1e-8&&!s.frenzy&&p.hp>1){s.frenzy=I.hits*I.frenzyInterval;s.index=0;s.combo=(s.combo+1)%ICHOR_COMBOS.length;s.frenzyPower=s.blood/100;s.swing=0;s.xCooldown=I.xCooldown;sim.events.push({type:'ichorFrenzyStart',x:p.x,z:p.z,below:!!p.below,power:s.frenzyPower});}
   if(s.frenzy>0&&s.swing<=1e-8&&s.index<I.hits)start(sim,ICHOR_COMBOS[s.combo][s.index++],s.frenzyPower,true);
   else if(!s.frenzy&&!s.swing&&!p.dodgeRemaining&&input.ichorE&&s.eCooldown<=1e-8&&s.blood>=I.eBlood){s.eCooldown=I.eCooldown;start(sim,3,s.blood/100);s.contact=true;s.cooldown=I.interval;sim.ichorWaves.push({id:++sim.serial,volley:++sim.volley,x:p.x,z:p.z,y:sim.standY()+.72,dx:p.aimX,dz:p.aimZ,travel:0,power:s.blood/100,damage:I.waveDamage-I.waveRoll+Math.floor(Math.random()*(I.waveRoll*2+1)),hit:[],below:!!p.below});sim.events.push({type:'ichorWave',x:p.x,z:p.z,dx:p.aimX,dz:p.aimZ});}
   else if(!s.frenzy&&!s.swing&&press&&s.cooldown<=1e-8){start(sim,s.dashWindow>0?6:nextIchorCut(s),s.blood/100);s.cooldown=I.interval;}
  }
  p.ichor={guarding:s.guarding,guardFlash:s.guardFlash,blood:s.blood,swing:s.swing,duration:s.duration||I.interval,variant:s.variant,serial:s.serial,frenzy:s.frenzy,trail:s.trail,moving:s.moving,moveSide:s.moveSide,moveForward:s.moveForward};
 }
 for(const w of sim.ichorWaves){const length=Math.min(I.waveSpeed*dt,I.waveRange-w.travel),ex=w.x+w.dx*length,ez=w.z+w.dz*length,r=.5+(w.travel/I.waveRange)*1.7;let at=1,blocker=null;
  for(const c of sim.colliders){if(c.playerOnly)continue;const t=geo.segmentBox(w.x,w.z,ex,ez,c,.12);if(t!==null&&t<=at&&ichorCoverMeets(sim,c,w.x+w.dx*length*t,w.z+w.dz*length*t,w.y)){at=t;blocker=c;}}
  for(const t of sim.targets){if(t.hp<=0||t.friendly||w.hit.includes(t.id)||Math.abs(sim.standY(t)+.72-w.y)>1.3)continue;const k=geo.segmentCircle(w.x,w.z,ex,ez,t.x,t.z,r+targetRadius(t));if(k!==null&&k<=at&&!sim.colliders.some(c=>{if(c.playerOnly)return false;const k=geo.segmentBox(w.x,w.z,t.x,t.z,c);return k!==null&&ichorCoverMeets(sim,c,w.x+(t.x-w.x)*k,w.z+(t.z-w.z)*k,w.y);})){w.hit.push(t.id);hit(sim,t,w.damage,w.dx,w.dz,'ichorWave',w.power,w.volley);}}
  if(blocker?.propId){const prop=sim.props.find(p=>p.id===blocker.propId);if(prop)sim.hitProp(prop,{damage:w.damage,damageType:'ichorWave',x:w.x+w.dx*length*at,z:w.z+w.dz*length*at,vx:w.dx,vz:w.dz});}
  w.x+=w.dx*length*at;w.z+=w.dz*length*at;w.travel+=length*at;
  if(w.travel-(w.trailAt||0)>=.55){w.trailAt=w.travel;sim.ichorTrails.push({x:w.x,z:w.z,y:sim.standY(w),r:.65,life:I.trailLife});if(sim.ichorTrails.length>I.trailCap)sim.ichorTrails.shift();}
  if(at<1||w.travel>=I.waveRange-1e-8||sim.ground.drawnHeightAt(w.x,w.z)>w.y+.3){w.dead=true;sim.volleyKills.delete(w.volley);}
 }
 sim.ichorWaves=sim.ichorWaves.filter(w=>!w.dead);
}
