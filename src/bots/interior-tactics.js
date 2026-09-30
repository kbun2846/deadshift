// A room is remembered from a sighting, never from a hidden body's live position.
import { buildingOpenings } from '../map-kit.js';
import { BOT_INTERIOR as B } from '../config/gameplay.js';

const entrances = new WeakMap();
function doors(building) {
 let list = entrances.get(building);
 if (!list) {
  list = buildingOpenings(building).filter(o => o.type === 'door').map(o => {
   const x=(o.a.x+o.b.x)/2,z=(o.a.z+o.b.z)/2,tx=o.b.x-o.a.x,tz=o.b.z-o.a.z,len=Math.hypot(tx,tz)||1;
   let nx=-tz/len,nz=tx/len;if(nx*(x-building.x)+nz*(z-building.z)<0){nx=-nx;nz=-nz;}
   return {x,z,nx,nz,width:o.width,buildingId:building.id};
  });
  entrances.set(building,list);
 }
 return list;
}

export function rememberRoom(brain,m) {
 if (!m.visible || brain.time-m.seen>.25) return;
 let entry=null,best=Infinity;
 for (const b of brain.sim.map.buildings) for (const door of doors(b)) {
  const dx=m.x-door.x,dz=m.z-door.z,d=Math.hypot(dx,dz);
  if (m.room===b.id) { if(d<best){entry=door;best=d;} continue; }
  if (m.room) continue;
  const outside=dx*door.nx+dz*door.nz,across=Math.abs(dx*door.nz-dz*door.nx),inward=-(m.vx*door.nx+m.vz*door.nz);
  // Saw motion into an opening immediately before losing sight. This is a
  // belief: turning back unseen can fool it. No hidden coordinates are read.
  if(outside>=-.1&&outside<.85&&across<door.width/2-.08&&inward>.35&&outside<inward*.35+.12&&d<best){entry=door;best=d;}
 }
 if(entry){m.shelter={...entry,at:brain.time};m.x=entry.x;m.z=entry.z;m.vx=m.vz=0;}
}

function openSpot(brain,x,z,roomId,inside) {
 const k=brain.nav.nearestOpen(x,z,3);if(k<0)return null;
 const spot=brain.nav.centre(k),room=brain.sim.buildingAt(spot.x,spot.z);
 return inside?room?.id===roomId?spot:null:!room?spot:null;
}

export function roomPlan(brain,target) {
 const entry=target?.shelter;
 if(!entry||target.visible||brain.time-entry.at>B.memory){brain.roomPlan=null;return null;}
 const p=brain.sim.player;
 let plan=brain.roomPlan;
 if(!plan||plan.id!==target.id||plan.at!==entry.at||brain.time>plan.until){
  const healthy=p.hp/(p.maxHp||100)>.4,loaded=!brain.outOfAmmo();
  const push=healthy&&loaded&&brain.random()<.15+brain.pf.aggr*.7;
  const kind=push?'push':brain.random()<.55?'hold':'probe';
  const offset=(brain.random()<.5?-1:1)*(kind==='hold'?1.5:.35);
  plan=brain.roomPlan={id:target.id,at:entry.at,kind,stage:0,until:brain.time+B.wait+brain.random()*B.waitJitter,
   outside:openSpot(brain,entry.x+entry.nx*2-entry.nz*offset,entry.z+entry.nz*2+entry.nx*offset,entry.buildingId,false),
   inside:openSpot(brain,entry.x-entry.nx*1.8,entry.z-entry.nz*1.8,entry.buildingId,true),
   aim:{x:entry.x-entry.nx*2.5,z:entry.z-entry.nz*2.5}};
 }
 if(plan.kind==='push'){
  const approach={x:entry.x+entry.nx*.8,z:entry.z+entry.nz*.8};
  if(Math.hypot(p.x-approach.x,p.z-approach.z)<1||brain.sim.interior?.id===entry.buildingId)plan.stage=1;
  plan.goal=plan.stage?plan.inside:approach;
  if(plan.stage&&plan.goal&&Math.hypot(p.x-plan.goal.x,p.z-plan.goal.z)<.8){brain.lose(target);brain.roomPlan=null;return null;}
 }else plan.goal=plan.outside;
 return plan;
}

const ATTACKS=['sheathE','sheathX','ichorE','ichorX','sidekickMine','sidekickX','fire','tapFire','doubleShot','launch','spray','grenade','hex','surge','scatter','sightlineX','omenPrime','omenVolley'];
const BLIND=['fire','launch'];
export function paceRoomFire(brain,input,target) {
 const blind=!target?.visible;
 const probing=blind&&brain.mode==='hunt'&&brain.roomPlan?.id===target?.id&&brain.roomPlan?.kind==='probe';
 // Generic hidden-target grenades are inappropriate here: no fresh room aim.
 if(blind&&(target?.shelter||brain.sim.interior||target&&brain.sim.buildingAt(target.x,target.z)))for(const key of ATTACKS)if(!probing||!BLIND.includes(key))input[key]=false;
 if(!brain.sim.interior&&!probing){brain.roomBurstUntil=0;return;}
 const now=brain.time;
 if(brain.roomBurstUntil&&now>=brain.roomBurstUntil){
  brain.roomBurstUntil=0;brain.roomPauseUntil=now+(probing?B.probePause:B.pause)+brain.random()*(probing?B.probeJitter:B.pauseJitter);
 }
 if(now<(brain.roomPauseUntil||0)){for(const key of ATTACKS)input[key]=false;return;}
 if(!brain.roomBurstUntil&&ATTACKS.some(key=>input[key]))brain.roomBurstUntil=now+(probing?B.probeBurst:B.burst);
}
