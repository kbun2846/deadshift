import test from 'node:test';
import assert from 'node:assert/strict';
import {deadwater,buildingPoint} from '../src/maps.js';
import {isPlayable,playableOutline} from '../src/playable-area.js';
import {Simulation,RULES} from '../src/simulation.js';
import {overheadMapSVG} from '../src/ui/overhead-map.js';

test('Deadwater excludes empty districts while preserving buildings, routes and targets',()=>{
 for(const [x,z] of [[85,15],[-90,95],[-98,-108],[0,110]])assert.equal(isPlayable(deadwater,x,z),false);
 for(const b of deadwater.buildings)for(const x of [-b.w/2,b.w/2])for(const z of [-b.d/2,b.d/2]){
  const p=buildingPoint(b,x,z);assert.ok(isPlayable(deadwater,p.x,p.z,7),b.id+' needs building clearance');
 }
 for(const target of deadwater.targets)assert.ok(isPlayable(deadwater,target.x,target.z,3),target.id);
 for(const road of deadwater.sideRoads)for(const [x,z] of road.points)assert.ok(isPlayable(deadwater,x,z,4),'road clearance');
 for(let z=-114;z<115;z++){
  const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  const x=15*smooth((z-22)/24)+40*smooth((z-48)/44);
  assert.ok(isPlayable(deadwater,x,z,8),'main road at '+z);
 }
 assert.ok(isPlayable(deadwater,deadwater.spawn.x,deadwater.spawn.z,RULES.radius));
});
test('perimeter bends are gradual rather than sharp corners',()=>{
 const points=deadwater.playableArea;
 for(let i=0;i<points.length;i++){
  const a=points[(i+points.length-1)%points.length],b=points[i],c=points[(i+1)%points.length];
  const ax=b[0]-a[0],az=b[1]-a[1],bx=c[0]-b[0],bz=c[1]-b[1];
  const angle=Math.acos(Math.max(-1,Math.min(1,(ax*bx+az*bz)/(Math.hypot(ax,az)*Math.hypot(bx,bz)))));
  assert.ok(angle<.25,'sharp corner at '+i);
 }
});

test('fast movement cannot cross any segment of the concave perimeter',()=>{
 const sim=new Simulation(deadwater);sim.colliders=[];sim.targets=[];
 const polygon=playableOutline(deadwater);
 for(let i=0;i<polygon.length;i++){
  const [ax,az]=polygon[i],[bx,bz]=polygon[(i+1)%polygon.length],length=Math.hypot(bx-ax,bz-az);
  const nx=-(bz-az)/length,nz=(bx-ax)/length;
  sim.player.x=(ax+bx)/2+nx*2;sim.player.z=(az+bz)/2+nz*2;
  assert.ok(isPlayable(deadwater,sim.player.x,sim.player.z,RULES.radius),'start '+i);
  sim.movePlayer(-nx*30,-nz*30);
  assert.ok(isPlayable(deadwater,sim.player.x,sim.player.z,RULES.radius),'edge '+i);
 }
});

test('overhead outline clips map details to playable ground with a transparent exterior',()=>{
 const svg=overheadMapSVG(deadwater,{roadProfile:[{z:-124,left:-4,right:4},{z:124,left:51,right:59}]},null);
 assert.ok(svg.includes(deadwater.playableArea.map(p=>p.join(',')).join(' ')));
 assert.ok(svg.includes('clip-path="url(#overhead-playable)"'));
 assert.ok(!svg.includes('fill="#141817"'));
 const simple={width:20,depth:30};assert.equal(isPlayable(simple,0,0),true);assert.equal(isPlayable(simple,10,0,.38),false);
});
