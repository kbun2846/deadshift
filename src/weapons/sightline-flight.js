// Sightline's shot and public guide share one straight, elevated flight path.
// Low cover can be cleared; rising ground and tall cover still stop the shot.
import { SIGHTLINE as S, TERRAIN } from '../config/gameplay.js';
import { collidersAlong } from '../world/collider-grid.js';

export const sightlineY=(sim,round,distance=round.travel||0)=>
 (round.baseY||0)+S.roundHeight+(round.flight?.slope||0)*distance;

function elevationSlope(sim,p,x,z,dx,dz,range,aimDistance,baseY){
 const ground=sim.ground;if(ground.flat)return 0;
 const aim=Math.max(.1,Math.min(range,Math.sqrt(Math.max(0,aimDistance*aimDistance-S.muzzleLateral*S.muzzleLateral))-((x-p.x)*dx+(z-p.z)*dz)));
 const tx=x+dx*aim,tz=z+dz*aim,deck=ground.deckAt(tx,tz);
 const targetY=p.below&&deck===ground.deckAt(p.x,p.z)?ground.drawnHeightAt(tx,tz):ground.heightAt(tx,tz);
 return (targetY-baseY)/aim;
}
// All corners of a bloom band use one firing plane. Sampling the floor under
// each corner independently twisted the red quadrilateral at bridge edges.
export function sightlineAimPlane(sim,p,sniper){
 const forward=sniper?S.muzzleForward:.75,lateral=sniper?S.muzzleLateral:.22,x=p.x+p.aimX*forward-p.aimZ*lateral,z=p.z+p.aimZ*forward+p.aimX*lateral;
 const baseY=p.below?sim.ground.drawnHeightAt(p.x,p.z):sim.ground.heightAt(p.x,p.z);
 const distance=p.aimReach??(Math.hypot(p.aimPointX-p.x,p.aimPointZ-p.z)||25);
 const slope=sniper?elevationSlope(sim,p,x,z,p.aimX,p.aimZ,Infinity,distance,baseY):0;
 return {x,z,forward,angle:Math.atan2(p.aimZ,p.aimX),height:(px,pz)=>baseY+(sniper?S.roundHeight:TERRAIN.roundHeight)+slope*((px-x)*p.aimX+(pz-z)*p.aimZ)};
}

// (v0.999a, owner: "make sniper fire through ... all obstacles in game ...
// trees and walls and fences but ... not buildings and building walls".) The
// rifle's round, its laser and the robots' reading of it meet only a
// building's walls (`wall`, map-kit.js buildingWalls) and breakables (which it
// cuts through, damaging them, as before); trees, fences, fieldstone walls,
// rocks, graves, carts, furniture: passed. The ground and a hex still stop it.
export function sightlineMeets(sim,round,box,x,z,distance){
 if(box.playerOnly||!(box.wall||box.destructible||box.propId&&sim.props?.some(p=>p.id===box.propId&&p.hp!=null)))return false;
 const height=box.height??2;
 if(height>1.5)return true;
 const base=sim.ground.heightAt(x,z),y=sightlineY(sim,round,distance);
 return y>=base-.2&&y<=base+height+.035;
}
export function sightlineSees(sim,round,target,distance){
 const feet=target.below?sim.ground.drawnHeightAt(target.x,target.z):sim.ground.heightAt(target.x,target.z),y=sightlineY(sim,round,distance);
 return y>=feet-.1&&y<=feet+TERRAIN.bodyTop;
}
export function sightlineFlight(sim,p,dx,dz,range,segmentBox,aimDistance=p.aimReach??25){
 const ground=sim.ground,baseY=p.below?ground.drawnHeightAt(p.x,p.z):ground.heightAt(p.x,p.z);
 let x=p.x+dx*S.muzzleForward-dz*S.muzzleLateral,z=p.z+dz*S.muzzleForward+dx*S.muzzleLateral;
 const probe={baseY};
 for(const box of collidersAlong(sim.colliders,p.x,p.z,x,z)){
  const at=box.playerOnly?null:segmentBox(p.x,p.z,x,z,box,.035);
  if(at!==null&&sightlineMeets(sim,probe,box,p.x+(x-p.x)*at,p.z+(z-p.z)*at,0)){x=p.x;z=p.z;break;}
 }
 const round={x,z,dx,dz,range,baseY,below:!!p.below,ox:p.x,oz:p.z};
 if(!ground.flat){
  if(p.below)round.oy=baseY;
  // A shooter under a bridge aims along its lower level while still under it.
  const slope=elevationSlope(sim,p,x,z,dx,dz,range,aimDistance,baseY);round.flight={slope,stop:Infinity};
  let last=0,previous=ground.drawnHeightAt(x,z)-baseY-S.roundHeight;
  for(let d=0;d<=range+.25;d+=.25){
   const at=Math.min(range,d),px=x+dx*at,pz=z+dz*at,y=baseY+S.roundHeight+slope*at;
   const k=ground.deckAt(px,pz),deckY=k>=0?ground.decks[k].h:-Infinity;
   const into=ground.drawnHeightAt(px,pz)-y;
   if(into>0){round.stop=d?last+(at-last)*Math.max(0,-previous/(into-previous)):0;break;}
   if(k>=0&&Math.abs(y-deckY)<.09){round.stop=at;break;}
   previous=into;last=at;if(at===range)break;
  }
  round.flight.stop=round.stop??Infinity;
 }
 round.y=sightlineY(sim,round,0);return round;
}
// Breakable props are skipped: the actual round pierces them as well.
export function sightlineGuideEnd(sim,round,segmentBox){
 let distance=Math.min(round.range,round.stop??Infinity);
 const ex=round.x+round.dx*distance,ez=round.z+round.dz*distance;
 for(const box of collidersAlong(sim.colliders,round.x,round.z,ex,ez)){
  if(box.playerOnly||!box.wall)continue;
  const at=segmentBox(round.x,round.z,ex,ez,box,.035);
  if(at===null)continue;
  const d=at*Math.min(round.range,round.stop??Infinity);
  if(d<distance&&sightlineMeets(sim,round,box,round.x+round.dx*d,round.z+round.dz*d,d))distance=d;
 }
 return distance;
}
