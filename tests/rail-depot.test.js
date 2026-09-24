import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {deadwater,buildingPoint,buildingOpenings,mapColliders,mapProps} from '../src/maps.js';
import {inside,Simulation} from '../src/simulation.js';
import {WorldView} from '../src/render/renderer.js';
import {makeRailways,makeRailProp,RAIL_TYPES,railUnion} from '../src/world/rail-depot.js';
import {interiorCameraHeight} from '../src/render/camera-framing.js';

test('depot targets are clear of scenery and the cargo cars only expose their one entrance',()=>{
  const colliders=mapColliders(deadwater);
  for(const target of deadwater.targets.filter(t=>/^(station-|freight-hall-|rail-|cargo-)/.test(t.id)))
    assert.ok(!colliders.some(c=>inside(target,c,.45)),target.id+' is inside cover');
  for(const b of deadwater.buildings.filter(b=>b.cargo)){
    assert.equal(buildingOpenings(b).length,b.id==='open-car-d'?2:1);
    const sim=new Simulation({...deadwater,spawn:{x:b.x,z:b.z},targets:[]});
    for(const o of buildingOpenings(b)){
      const x=(o.a.x+o.b.x)/2,z=(o.a.z+o.b.z)/2,dx=x-b.x,dz=z-b.z,length=Math.hypot(dx,dz);
      assert.equal(sim.canAimAt(x+dx/length,z+dz/length),true,b.id+' '+o.side);
    }
    const blocked=buildingPoint(b,0,b.doors.includes('front')?-b.d:b.d);
    assert.equal(sim.canAimAt(blocked.x,blocked.z),false);

  }
});
test('large depot interiors use close follow framing, small rooms retain fitted framing',()=>{
  for(const b of deadwater.buildings.filter(b=>b.followCamera)){
    assert.ok(b.w*b.d>400);
    assert.ok(interiorCameraHeight(b,1.6)<interiorCameraHeight({...b,followCamera:false},1.6));
  }
});
test('rail geometry is finite and permanent train cover has physical collision',()=>{
  const view=Object.create(WorldView.prototype);view.materials=new Map();view.static=new THREE.Group();view.map=deadwater;
  makeRailways(view);
  for(const p of mapProps(deadwater).filter(p=>RAIL_TYPES[p.type])){
    const g=new THREE.Group();makeRailProp(view,p,g);view.static.add(g);
    assert.ok(mapColliders({...deadwater,buildings:[],props:[p],fences:[]}).every(c=>!c.destructible));
  }
  view.static.traverse(o=>{if(o.geometry)assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite));});
  assert.ok(deadwater.railways[0][0][1]<-deadwater.depth/2);
  assert.ok(deadwater.railways[0].at(-1)[0]>deadwater.width/2);
});

test('unioned rail junction faces do not overlap',()=>{
 const rects=railUnion([{x:0,z:0,w:.15,d:5,angle:0},{x:0,z:0,w:.15,d:5,angle:.6}],.045);
 for(let i=0;i<rects.length;i++)for(let j=0;j<i;j++){
   const a=rects[i],b=rects[j];assert.ok(Math.abs(a.x-b.x)>=(a.w+b.w)/2-1e-8||Math.abs(a.z-b.z)>=(a.d+b.d)/2-1e-8);
 }
});
