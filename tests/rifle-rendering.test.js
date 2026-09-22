import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {RifleView} from '../src/rifle-view.js';
import {makeRifle} from '../src/rifle-model.js';
import {RIFLE_QUALITY,CASING_CAPACITY} from '../src/rifle-quality.js';
const setup=()=>{
 const gun=new THREE.Group(),sim={time:0,weapon:'rifle',rifle:{aiming:false},player:{x:0,z:0,aimX:1,aimZ:0},rifleBullets:[],magazines:[],canSeeEntity:()=>true};
 const body=new THREE.Group();body.add(gun);
 const host={player:{userData:{gun,body}},scene:new THREE.Scene(),qualityName:'balanced',lastSim:sim};
 return {view:new RifleView(host),host,sim};
};
test('casings remain batched and expire at 30 simulation seconds even with sparse renders',()=>{
 const {view,sim}=setup();
 for(let i=0;i<160;i++)view.shot();
 view.update(sim);assert.equal(view.casings.count,160);assert.equal(view.casings.instanceMatrix.count,CASING_CAPACITY);
 sim.time=29.99;view.update(sim);assert.equal(view.casings.count,160);
 sim.time=30;view.update(sim);assert.equal(view.casings.count,0);assert.equal(view.effects.length,0);
 assert.equal(view.view.scene.children.filter(o=>o===view.casings).length,1);
});
test('both hands track rifle grips; off hand releases to throw and re-grips afterwards',()=>{
 const {view,sim,host}=setup();sim.grenadeThrowTime=-10;view.update(sim);
 const grip=()=>new THREE.Vector3(0,-.065,-.20).applyMatrix4(view.gun.matrix);
 assert.ok(view.pose.offHand.position.distanceTo(grip())<1e-8);
 sim.rifle.aiming=true;sim.time=.10;view.update(sim);
 assert.ok(host.player.userData.body.rotation.x<0);assert.ok(view.gun.position.y>.74);
 assert.ok(view.pose.offHand.position.distanceTo(grip())<1e-8);
 sim.grenadeThrowTime=sim.time;sim.time+=.1;view.update(sim);
 assert.ok(view.pose.offHand.position.distanceTo(grip())>.3);
 sim.time+=.55;view.update(sim);assert.ok(view.pose.offHand.position.distanceTo(grip())<1e-8);
 sim.weapon='static';view.update(sim);assert.equal(view.pose.root.visible,false);
});
test('all presets keep projectiles and casings while scaling model and cosmetic budgets',()=>{
 const {view,host,sim}=setup();let previous=0,previousDetail=-1;
 sim.rifleBullets=[{id:1,x:3,z:0,dx:1,dz:0,travel:3}];view.shot();
 const sceneCount=host.scene.children.length;
 for(const [name,q]of Object.entries(RIFLE_QUALITY)){
  host.qualityName=name;view.update(sim);
  assert.equal(view.casings.count,1);assert.equal(view.bullets.count,1);assert.equal(view.trails.count,q.trail?1:0);
  assert.equal(view.casings.geometry.parameters.radialSegments,q.radialSegments);
  assert.equal(host.scene.children.length,sceneCount);
  const model=makeRifle(q.detail),triangles=model.children.reduce((sum,o)=>sum+o.geometry.index.count/3,0);
  // The ladder never goes down, and buys more geometry whenever the detail
  // level actually rises. Tiers that share a detail level — Extreme sits on
  // Quality's budget for now — share the model.
  if(q.detail>previousDetail)assert.ok(triangles>previous,`${name} did not add geometry`);
  else assert.equal(triangles,previous,`${name} should share the previous model`);
  previous=triangles;previousDetail=q.detail;assert.ok(model.children.length<=15);
  assert.equal(view.bullets.geometry.type,'LatheGeometry');
 }
});
