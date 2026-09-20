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
