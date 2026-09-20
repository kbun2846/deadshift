import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,launchDistance,launchDuration,rangedOrbDamage,damagePerOrb} from '../src/simulation.js';
const map={width:100,depth:100,spawn:{x:0,z:0},buildings:[],props:[],fences:[],targets:[]};
test('all 1–12 orb volleys deal exactly 16 percent more direct damage at every range',()=>{
 for(let count=1;count<=12;count++){
  const oldBase=count===1?8:Math.round(8+16*((count-1)/11)**1.5);
  const sim=new Simulation(map);for(let i=0;i<count;i++)sim.seed();sim.launch(20,0);
  assert.ok(sim.shots.every(s=>s.damage===oldBase*1.16));
  for(const distance of [0,6,12,18,24,40]){
   const oldDamage=Math.round(oldBase*(1+.2*Math.max(0,Math.min(1,(distance-6)/18))));
   assert.equal(rangedOrbDamage(damagePerOrb(count),distance),oldDamage*1.16);
  }
 }
 const quick=new Simulation(map);quick.launch(20,0,true);quick.step({});
 assert.equal(quick.shots[0].damage,6);
});
test('launch accelerates rapidly with a modest terminal speed and synchronized distance curve',()=>{
 const early=launchDistance(.05)/.05,late=(launchDistance(.5)-launchDistance(.45))/.05;
 assert.ok(early<late&&late<38&&late>35);
 for(const d of [6,12,24,45])assert.ok(Math.abs(launchDistance(launchDuration(d))-d)<1e-5);
});
test('all volley sizes gain at most twenty percent ranged damage and retain close damage',()=>{
 for(let n=1;n<=12;n++){
  const base=damagePerOrb(n);assert.equal(rangedOrbDamage(base,3),base);
  assert.equal(rangedOrbDamage(base,24),Math.round(base/1.16*1.2)*1.16);
  assert.equal(rangedOrbDamage(base,100),rangedOrbDamage(base,24));
 }
});
test('aiming far past a nearby victim cannot grant the distance bonus',()=>{
 const sim=new Simulation({...map,targets:[{id:'near',x:3,z:0}]});sim.player.aimX=1;sim.player.aimZ=0;sim.seed();sim.launch(30,0);
 for(let i=0;i<120&&sim.targets[0].hp===100;i++)sim.step({});
 assert.equal(sim.targets[0].hp,100-damagePerOrb(1));
});
