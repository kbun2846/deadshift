// A visible loaded laser is a warning, not knowledge of the shooter's next shot.
// Responses follow observed aim, have a reaction delay, and use normal nav/dodges.
import { BOT_LASER as B, SIGHTLINE as S, RULES } from '../config/gameplay.js';
import { sightlineCanScope, sightlineRange } from '../weapons/sightline.js';
import { sightlineFlight, sightlineGuideEnd, sightlineSees } from '../weapons/sightline-flight.js';
import { muzzleBearing } from '../aim-damping.js';
import { segmentBox } from '../simulation.js';

// Cover must stop the sniper round: crates and low rocks do not count.
export function sniperLineClear(sim,source,x,z) {
 const d=Math.hypot(x-source.x,z-source.z),a=muzzleBearing(source.x,source.z,x,z,S.muzzleLateral);
 const reach=Math.max(.1,Math.sqrt(Math.max(0,d*d-S.muzzleLateral**2))-S.muzzleForward);
 const ray=sightlineFlight(sim,source,Math.cos(a),Math.sin(a),reach,segmentBox,d);
 return sightlineGuideEnd(sim,ray,segmentBox)>=reach-.1;
}

export function laserThreatens(sim,enemy) {
 const s=enemy?.sightline,p=sim.player;
 if(!enemy?.visible||enemy.weapon!=='sightline'||!s?.crouched||!s.aiming||!s.rifleAmmo||s.rifleReload||s.pistolReload||s.xLoading||s.commit||s.aimBlocked||!sightlineCanScope(sim,enemy))return false;
 const dx=enemy.aimX,dz=enemy.aimZ;if(!Number.isFinite(dx)||!Number.isFinite(dz))return false;
 const mx=enemy.x+dx*S.muzzleForward-dz*S.muzzleLateral,mz=enemy.z+dz*S.muzzleForward+dx*S.muzzleLateral;
 const rx=p.x-mx,rz=p.z-mz,along=rx*dx+rz*dz;
 if(along<0||Math.abs(rx*dz-rz*dx)>(s.special?B.hotWidth:B.width))return false;
 const cursor=s.aimReach??enemy.aimReach??25,base=enemy.below?sim.ground.drawnHeightAt(enemy.x,enemy.z):sim.ground.heightAt(enemy.x,enemy.z);
 const range=Math.min(sightlineRange(sim.viewAspect||16/9,dx,dz,base),Math.max(.05,Math.sqrt(Math.max(0,cursor*cursor-S.muzzleLateral**2))-S.muzzleForward));
 if(along>range+.4)return false;
 const ray=sightlineFlight(sim,enemy,dx,dz,range,segmentBox,cursor);
 const distance=(p.x-ray.x)*dx+(p.z-ray.z)*dz;
 return sightlineGuideEnd(sim,ray,segmentBox)>=distance-.4&&sightlineSees(sim,ray,p,distance);
}

function sideStep(brain,source,side,forward=0) {
 const p=brain.sim.player,dx=source.x-p.x,dz=source.z-p.z,d=Math.hypot(dx,dz)||1;
 for(const sign of [side,-side])for(const across of [B.step,1.2]){
  const x=p.x+dx/d*forward-dz/d*across*sign,z=p.z+dz/d*forward+dx/d*across*sign;
  const cell=brain.nav.nearestOpen(x,z,2);if(cell<0)continue;const goal=brain.nav.centre(cell);
  if(Math.hypot(goal.x-p.x,goal.z-p.z)<.7||!brain.nav.walkable(p.x,p.z,goal.x,goal.z))continue;
  if(brain.leader&&Math.hypot(goal.x-brain.leader.x,goal.z-brain.leader.z)>12)continue;
  return goal;
 }
 return null;
}

export function respondToLaser(brain) {
 const p=brain.sim.player,now=brain.time;
 let source=null,best=Infinity;
 for(const m of brain.memory.values()){
  if(!laserThreatens(brain.sim,m))continue;
  const score=Math.hypot(m.x-p.x,m.z-p.z)-(m.sightline.special?6:0);
  if(score<best){source=m;best=score;}
 }
 let response=brain.laserResponse;
 if(!source){
  // Finish the first sidestep, without tracking unseen movement.
  if(response?.kind&&now-response.lastSeen<B.linger&&brain.memory.get(response.id)?.visible)return response;
  brain.laserResponse=null;return null;
 }
 if(!response||response.id!==source.id){
  const delay=Math.max(B.reactionMin,Math.min(B.reactionMax,brain.pf.reaction[0]+B.notice+brain.random()*.12));
  response=brain.laserResponse={id:source.id,readyAt:now+delay,lastSeen:now,until:0};
 }
 response.lastSeen=now;
 if(now<response.readyAt)return null;
 if(response.kind&&now<response.until)return response;
 const d=Math.hypot(source.x-p.x,source.z-p.z),healthy=p.hp/(p.maxHp||500)>.55,loaded=!brain.outOfAmmo();
 const side=brain.random()<.5?-1:1;
 const bold=healthy&&loaded&&brain.pf.aggr>.5&&brain.sim.weapon!=='sightline'&&d<B.chargeRange&&!source.sightline.special;
 const charge=bold&&brain.random()<brain.pf.aggr*.85;
 let kind='cover',goal=null;
 if(charge){goal=sideStep(brain,source,side,Math.min(5,Math.max(0,d-3)));if(goal)kind='charge';}
 if(!goal){
  if(!brain.afford('search'))return null;
  goal=brain.findCover(source);
 }
 if(!goal){kind=bold?'charge':'evade';goal=sideStep(brain,source,side,bold?Math.min(4,Math.max(0,d-3)):0);}
 if(!goal){kind='evade';goal=sideStep(brain,source,side);}
 if(!goal){brain.laserResponse=null;return null;}
 Object.assign(response,{kind,goal,until:now+B.hold+brain.random()*B.holdJitter});
 // One purposeful diagonal/cross-beam dodge, not a dice roll every frame.
 const escape=sideStep(brain,source,side,kind==='charge'?1.6:0);
 if(escape&&p.stamina>=RULES.dodgeStaminaCost&&now-(brain.dodgedAt??-9)>B.dodgeGap&&brain.random()<.25+brain.pf.tech*.6){
  const dx=escape.x-p.x,dz=escape.z-p.z,len=Math.hypot(dx,dz);brain.wantDodge={x:dx/len,z:dz/len};brain.dodgedAt=now;
 }
 return response;
}
