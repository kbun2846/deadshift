// Deliberate sniper hands: travel, plant, sweep a lane, track, then move again.
// All decisions use sightings/memory and ordinary inputs, never hidden bodies.
import { BOT_SIGHTLINE as B, SIGHTLINE as S } from '../config/gameplay.js';
import { scopeActive, inSightCone, sightlineCanScope, sightlineRange } from '../weapons/sightline.js';
import { sightlineFlight, sightlineGuideEnd } from '../weapons/sightline-flight.js';
import { segmentBox } from '../simulation.js';
import { muzzleBearing } from '../aim-damping.js';
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));

export function sniperSees(sim,e) {
 if(!scopeActive(sim))return null;
 const p=sim.player,dx=e.x-p.x,dz=e.z-p.z,d=Math.hypot(dx,dz);
 return inSightCone(p,e.x,e.z)&&d<sightlineRange(sim.viewAspect||16/9,dx/(d||1),dz/(d||1),sim.standY())/1.1;
}
export function sniperClear(brain,x,z) {
 const sim=brain.sim,p=sim.player,d=Math.hypot(x-p.x,z-p.z),a=muzzleBearing(p.x,p.z,x,z,S.muzzleLateral);
 const reach=Math.max(.1,Math.sqrt(Math.max(0,d*d-S.muzzleLateral**2))-S.muzzleForward);
 const round=sightlineFlight(sim,p,Math.cos(a),Math.sin(a),reach,segmentBox,d);
 return sightlineGuideEnd(sim,round,segmentBox)>=reach-.35;
}

export function planSniper(brain,dt,target,world) {
 const sim=brain.sim;if(sim.weapon!=='sightline'){brain.sniper=null;return;}
 const p=sim.player,s=sim.sightline,now=brain.time;
 const n=brain.sniper ||= {mode:'travel',nextScan:now+B.travel+brain.random()*B.travelJitter,until:0,sector:0,steady:0};
 const visible=!!target?.visible,d=target?Math.hypot(target.x-p.x,target.z-p.z):Infinity;
 const danger=!!brain.laserResponse?.kind||visible&&d<B.sidekickRange||now-brain.hurtAt<.65||(world.grenades||[]).some(g=>Math.hypot(g.x-p.x,g.z-p.z)<6);
 const allowed=sightlineCanScope(sim),cover=brain.mode==='cover';
 const coverReached=cover&&(!brain.goal||Math.hypot(brain.goal.x-p.x,brain.goal.z-p.z)<1.3);
 const observed=target&&now-target.seen<B.lostWait&&!target.shelter;
 let mode='travel';
 if(s.xLoading)mode='load';
 else if(!danger&&allowed){
  if(!s.rifleAmmo&&(coverReached||!visible||brain.mode!=='cover'))mode='reload';
  else if(!cover&&visible&&d>=B.sidekickRange&&brain.openFire(target,d)&&sniperClear(brain,target.x,target.z))mode='track';
  else if(!cover&&!visible&&n.mode==='track'&&observed)mode='scan';
  else if(!cover&&!visible&&n.mode==='scan'&&now<n.until)mode='scan';
  else if(!cover&&!visible&&now>=n.nextScan)mode='scan';
 }
 // No rapid stance chatter after danger, an empty lane, or losing the target.
 if(!s.crouched&&now<(n.moveUntil||0)&&mode!=='load')mode='travel';
 if(mode==='scan'&&n.mode!=='scan'){
  const point=observed?target:brain.investigate||brain.path?.[0]||brain.goal;
  n.centre=point?Math.atan2(point.z-p.z,point.x-p.x):Math.atan2(p.aimZ,p.aimX);
  n.angle=Math.atan2(p.aimZ,p.aimX);n.sector=0;n.dwell=0;n.until=now+(observed?B.lostWait:B.scan+brain.random()*B.scanJitter);
 }
 if(mode==='travel'&&n.mode!=='travel'&&n.mode!=='load'){
  n.moveUntil=now+B.reposition;n.nextScan=now+B.travel+brain.random()*B.travelJitter;
 }
 n.mode=mode;n.want=mode==='track'||mode==='scan'||mode==='reload'||mode==='load'&&s.crouched;
 if(mode==='scan'){
  const offsets=[0,-.72,.65,-.25,.9],wanted=n.centre+offsets[n.sector%offsets.length],delta=wrap(wanted-n.angle);
  n.angle=wrap(n.angle+Math.max(-B.scanTurn*dt,Math.min(B.scanTurn*dt,delta)));
  if(Math.abs(delta)<.025&&Math.abs(wrap(wanted-Math.atan2(s.scopeZ??p.aimZ,s.scopeX??p.aimX)))<.045){n.dwell+=dt;if(n.dwell>B.dwell+brain.random()*.25){n.sector++;n.dwell=0;}}
 }
 if(!visible||n.id!==target.id){n.steady=0;n.id=target?.id;}
 if(n.want){brain.progress.stuck=0;brain.progress.at=now;brain.watch=null;}
}

export function sniperInput(brain,input,target,d,shoot,visible) {
 const sim=brain.sim,s=sim.sightline,n=brain.sniper;
 // Also support direct act() calls (tests): close Sidekick fights need no plan.
 const want=(n?!!n.want:s.crouched&&(!s.rifleAmmo||s.rifleReload>0))&&!input.dodge;
 input.sightlineStance=s.crouched!==want&&!s.commit;
 input.aiming=(want||visible)&&!s.rifleReload&&!s.pistolReload&&!s.aimBlocked&&!input.sightlineStance;
 if(want&&!input.dodge){input.moveX=input.moveZ=0;brain.smoothMove={x:0,z:0};}
 const rifle=s.crouched&&!input.sightlineStance;
 const steady=rifle&&visible&&scopeActive(sim)&&inSightCone(sim.player,target.x,target.z)&&shoot;
 if(n)n.steady=steady?n.steady+1/60:0;
 input.fire=shoot&&!s.trigger&&!s.xLoading&&s.cooldown<=0&&!input.sightlineStance&&(!rifle||s.setup<=0&&n?.steady>=B.settle+(1-brain.pf.tech)*B.settleSkill);
 input.reload=rifle?!s.rifleAmmo&&!s.rifleReload:!want&&!s.pistolAmmo&&!s.pistolReload;
 // Reload out of danger; use Breach when empty, or preparing an unseen lane.
 // Never replace a ready ordinary shot in a face-to-face duel just to load X.
 if(visible&&d>B.sidekickRange&&brain.xAllowed()&&!s.special&&!s.xLoading&&!s.pistolReload&&(!s.rifleAmmo||!s.crouched)&&!input.dodge){
  input.sightlineX=true;input.reload=input.fire=input.aiming=false;brain.usedX();
 }
}
