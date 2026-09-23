import test from 'node:test';
import assert from 'node:assert/strict';
import {approachPaths,pathRadius} from '../src/approach-paths.js';
import {deadwater,buildingContains,localOpenings} from '../src/maps.js';
const bend=(z,b)=>{const t=Math.max(0,Math.min(1,(z-b.start)/(b.end-b.start)));return b.offset*t*t*(3-2*t);};
const road=(x,z)=>Math.abs(x-bend(z,deadwater.roadBend)-bend(z,deadwater.farmBend))<3.4||(x<=2&&x>=-91&&z>-27&&z<-23.5);
test('every house approach reaches a road without crossing any house footprint',()=>{
 const paths=approachPaths(deadwater,road);assert.equal(paths.length,deadwater.buildings.filter(b=>!b.cargo).flatMap(localOpenings).filter(o=>o.type==='door').length);
 for(const path of paths){
  assert.ok(path.points.length>1,path.id+' has no road approach');
  const end=path.points.at(-1);assert.ok(road(end.x,end.z),path.id+' disconnected');
  for(const p of path.points)assert.ok(!deadwater.buildings.some(b=>buildingContains(b,p)),path.id+' crosses building');
 }
 assert.ok(pathRadius(0,40)>pathRadius(15,40));assert.ok(pathRadius(39,40)>pathRadius(15,40));
});

test('boxcars do not generate dirt access paths',()=>{
 const paths=approachPaths(deadwater,road);
 assert.ok(deadwater.buildings.filter(b=>b.cargo).every(b=>!paths.some(p=>p.buildingId===b.id)));
});

// onApproach is bucketed into a grid for speed; it must give exactly the
// answers the straightforward scan did, for every padding terrain generation uses.
test('the indexed approach lookup agrees with a full scan everywhere',async()=>{
 const {onApproach,pathRadius}=await import('../src/approach-paths.js');
 const scan=(paths,x,z,padding=0)=>paths.some(({points})=>points.some((p,i)=>Math.hypot(x-p.x,z-p.z)<pathRadius(i,points.length)+padding));
 let seed=7;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
 const paths=[];
 for(let n=0;n<14;n++){
  const points=[];let x=(rand()-.5)*120,z=(rand()-.5)*100;
  for(let i=0;i<20+Math.floor(rand()*60);i++){x+=(rand()-.5)*.8;z+=.4;points.push({x,z});}
  paths.push({points});
 }
 let hits=0;
 for(let i=0;i<20000;i++){
  const x=(rand()-.5)*130,z=(rand()-.5)*120,padding=[0,.15,1,2.8][i%4];
  const expected=scan(paths,x,z,padding);if(expected)hits++;
  assert.equal(onApproach(paths,x,z,padding),expected,`disagreed at ${x.toFixed(3)},${z.toFixed(3)} padding ${padding}`);
 }
 assert.ok(hits>500,'the sample actually exercises points on the paths');
});
