import test from 'node:test';
import assert from 'node:assert/strict';
import {AIM_FEEL,aimsByPoint,createAimDamping} from '../src/aim-damping.js';
import {Simulation} from '../src/simulation.js';
import {maps} from '../src/maps.js';

const RANGE=AIM_FEEL.closeRange;
const player=(x,z,aimX,aimZ)=>({x,z,aimX,aimZ});
const at=(p,angle,distance)=>({aimX:Math.cos(angle)*distance,aimZ:Math.sin(angle)*distance,
 aimPointX:p.x+Math.cos(angle)*distance,aimPointZ:p.z+Math.sin(angle)*distance});
const facing=p=>Math.atan2(p.aimZ,p.aimX);
const settle=(damping,p,aim,frames=240)=>{
 for(let i=0;i<frames;i++){const r=damping.apply(aim(p),p,1/60);p.aimX=r.aimX;p.aimZ=r.aimZ;}
 return p;
};

test('only the point-aimed weapons are damped',()=>{
 assert.equal(aimsByPoint('rifle'),true);
 assert.equal(aimsByPoint('shotgun'),true);
 assert.equal(aimsByPoint('static'),false);
});

test('a cursor beyond the cutoff is followed exactly once the turn settles',()=>{
 const damping=createAimDamping(),p=player(0,0,1,0);
 settle(damping,p,q=>at(q,1.1,5));
 assert.ok(Math.abs(facing(p)-1.1)<1e-9);
 assert.equal(damping.engaged,false);
});

test('outside the cutoff the focus point keeps the cursor depth',()=>{
 const damping=createAimDamping(),p=player(0,0,Math.cos(.4),Math.sin(.4));
 const result=damping.apply(at(p,.4,6),p,1/60);
 assert.ok(Math.abs(Math.hypot(result.aimPointX,result.aimPointZ)-6)<1e-9);
});

test('rotation continues inside the cutoff rather than stopping',()=>{
 const damping=createAimDamping(),p=player(0,0,1,0);
 damping.apply(at(p,0,1),p,1/60);
 const result=damping.apply(at(p,.5,1),p,1/60);
 assert.ok(Math.abs(facing(result))>1e-6,'the character should have turned');
});

test('the same cursor sweep turns less the closer it is',()=>{
 const sweep=distance=>{
  const damping=createAimDamping(),p=player(0,0,1,0);
  damping.apply(at(p,0,distance),p,1/60);
  return Math.abs(facing(damping.apply(at(p,.4,distance),p,1/60)));
 };
 assert.ok(sweep(.4)<sweep(1),'0.4m should turn less than 1m');
 assert.ok(sweep(1)<sweep(RANGE*.999),'1m should turn less than the cutoff edge');
});

test('a still cursor inside the cutoff never drifts or snaps',()=>{
 const damping=createAimDamping(),p=player(0,0,0,1);
 settle(damping,p,()=>at(p,Math.PI,.5),120);
 assert.ok(Math.abs(p.aimX)<1e-9);
 assert.ok(Math.abs(p.aimZ-1)<1e-9);
});

test('entering the cutoff contributes no rotation on the first frame',()=>{
 const damping=createAimDamping(),p=player(0,0,1,0);
 damping.apply(at(p,0,5),p,1/60);
 const entry=damping.apply(at(p,2.5,.3),p,1/60);
 assert.ok(Math.abs(facing(entry))<1e-12,'crossing in must not jump the facing');
});

test('inside the cutoff the focus point is floored at the cutoff depth',()=>{
 const damping=createAimDamping(),p=player(3,-2,0,1);
 const result=damping.apply(at(p,1.3,.6),p,1/60);
 const distance=Math.hypot(result.aimPointX-p.x,result.aimPointZ-p.z);
 assert.ok(Math.abs(distance-RANGE)<1e-9);
});

test('a reversal is a brief turn, not an instant flip',()=>{
 const damping=createAimDamping(),p=player(0,0,1,0);
 const first=damping.apply(at(p,Math.PI,8),p,1/60);
 assert.ok(Math.abs(Math.atan2(first.aimZ,first.aimX))<Math.PI*.2,'must not arrive in one frame');
 let frames=1;
 for(;frames<200;frames++){
  const r=damping.apply(at(p,Math.PI,8),p,1/60);p.aimX=r.aimX;p.aimZ=r.aimZ;
  if(Math.abs(Math.atan2(p.aimZ,p.aimX))>Math.PI*.95)break;
 }
 // Brief enough to read as responsive, long enough to read as a turn.
 assert.ok(frames>=6&&frames<=15,`reversal took ${frames} frames`);
});

test('an ordinary adjustment still lands within a couple of frames',()=>{
 const damping=createAimDamping(),p=player(0,0,1,0);
 let frames=0;
 for(;frames<60;frames++){
  const r=damping.apply(at(p,.15,8),p,1/60);p.aimX=r.aimX;p.aimZ=r.aimZ;
  if(Math.abs(facing(p)-.15)<.0075)break;
 }
 assert.ok(frames<=3,`small adjustment took ${frames+1} frames`);
});

test('the turn ceiling is never exceeded on any single frame',()=>{
 const damping=createAimDamping(),p=player(0,0,1,0);
 const limit=AIM_FEEL.maxTurnSpeed/60+1e-9;
 for(let i=0;i<300;i++){
  const before=facing(p);
  const r=damping.apply(at(p,Math.sin(i*.9)*Math.PI,.3+((i*7)%40)/10),p,1/60);
  p.aimX=r.aimX;p.aimZ=r.aimZ;
  const step=Math.abs(Math.atan2(Math.sin(facing(p)-before),Math.cos(facing(p)-before)));
  assert.ok(step<=limit,`frame ${i} turned ${step}`);
 }
});

test('the simulation turns the character smoothly through a close sweep',()=>{
 const sim=new Simulation(maps.deadwater);
 sim.weapon='shotgun';
 const damping=createAimDamping();
 sim.player.aimX=1;sim.player.aimZ=0;
 let previous=facing(sim.player),biggest=0;
 for(let i=1;i<=90;i++){
  const aim=damping.apply(at(sim.player,i*.12,.5),sim.player,1/60);
  sim.step({moveX:0,moveZ:0,...aim,smoothAim:false});
  const now=facing(sim.player);
  biggest=Math.max(biggest,Math.abs(Math.atan2(Math.sin(now-previous),Math.cos(now-previous))));
  previous=now;
 }
 assert.ok(biggest<.12*(.5/RANGE)+1e-9,`largest single-frame turn was ${biggest}`);
 assert.ok(Math.abs(facing(sim.player))>1e-6,'the character still rotated');
});
