import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ShotgunPressure} from '../src/weapons/shotgun-pressure.js';
import {Simulation} from '../src/simulation.js';
const make=()=>{const s=new Simulation({width:40,depth:40,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]});s.weapon='shotgun';s.reset();return s;};
test('a readied Scatter vents steam both ways with bounded quality budgets, and it clears once fired',()=>{
 for(const quality of ['potato','performance','balanced','quality']){
  const sim=make(),scene=new THREE.Scene(),gun=new THREE.Group();scene.add(gun);const fx=new ShotgunPressure(scene,gun);
  fx.update(sim,.1,quality);assert.equal(fx.mesh.count,0);assert.equal(fx.shake,0);
  sim.step({scatter:true});for(let i=0;i<120;i++)fx.update(sim,1/60,quality);
  assert.ok(fx.shake>.08);assert.ok(fx.mesh.count<=32);assert.ok(fx.puffs.some(p=>p.side===1&&p.vx>0));assert.ok(fx.puffs.some(p=>p.side===-1&&p.vx<0));
  sim.step({scatter:true});for(let i=0;i<90;i++)fx.update(sim,1/60,quality);assert.equal(fx.mesh.count,0);assert.ok(fx.shake<.001);
  fx.clear();assert.equal(fx.shake,0);assert.equal(fx.mesh.count,0);
 }
});
