import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ShotgunPressure} from '../src/shotgun-pressure.js';
import {Simulation} from '../src/simulation.js';
const make=()=>{const s=new Simulation({width:40,depth:40,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]});s.weapon='shotgun';s.reset();return s;};
test('E at full live charge fires both charged barrels without Q or an extra release shot',()=>{
 for(const unlimited of [false,true]){
  const sim=make();sim.dev.ammo=unlimited;
  for(let i=0;i<119;i++)sim.step({fire:true});
  assert.equal(sim.shotgun.stored,false);
  sim.step({fire:true,doubleShot:true});for(let i=0;i<20;i++)sim.step({fire:true});sim.step({fire:false});
  const shots=sim.events.filter(e=>e.type==='shotgunShot');assert.equal(shots.length,2);assert.ok(shots.every(e=>e.charge===1));assert.equal(sim.events.some(e=>e.type==='shotgunStored'),false);
 }
});
test('full-charge steam vents both ways with bounded quality budgets and clears after discharge',()=>{
 for(const quality of ['potato','performance','balanced','quality']){
  const sim=make(),scene=new THREE.Scene(),gun=new THREE.Group();scene.add(gun);const fx=new ShotgunPressure(scene,gun);
  sim.shotgun.charge=.9;fx.update(sim,.1,quality);assert.equal(fx.mesh.count,0);assert.equal(fx.shake,0);
  sim.shotgun.charge=1;for(let i=0;i<120;i++)fx.update(sim,1/60,quality);
  assert.ok(fx.shake>.08);assert.ok(fx.mesh.count<=32);assert.ok(fx.puffs.some(p=>p.side===1&&p.vx>0));assert.ok(fx.puffs.some(p=>p.side===-1&&p.vx<0));
  sim.shotgun.stored=true;fx.update(sim,.1,quality);assert.ok(fx.mesh.count>0);
  sim.shotgun.ammo=0;for(let i=0;i<60;i++)fx.update(sim,1/60,quality);assert.equal(fx.mesh.count,0);assert.ok(fx.shake<.001);
  fx.clear();assert.equal(fx.shake,0);assert.equal(fx.mesh.count,0);
 }
});
