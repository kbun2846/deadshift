import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,launchDistance,launchDuration,rangedOrbDamage,damagePerOrb,explosionFor,splashFalloff,ORB_VOLLEY_TOTALS,ORB_DAMAGE_MULTIPLIER} from '../src/simulation.js';
import { RULES as FULL_RULES, VOLLEY_BOOST } from '../src/config/gameplay.js';
const FULL = FULL_RULES.targetHealth; // a practice target's full health
const map={width:100,depth:100,spawn:{x:0,z:0},buildings:[],props:[],fences:[],targets:[]};
test('small volleys scale down proportionally and quick shot stays unchanged',()=>{
 for(let count=1;count<=3;count++){
  const oldBase=count===1?8:Math.round(8+16*((count-1)/11)**1.5);
  for(const distance of [0,6,12,18,24,40]){
   const oldDamage=Math.round(oldBase*(1+.2*Math.max(0,Math.min(1,(distance-6)/18))));
   assert.equal(rangedOrbDamage(damagePerOrb(count),distance),oldDamage*ORB_DAMAGE_MULTIPLIER);
  }
  // Damage is settled on arrival now, so an orb in flight carries only what a
  // stray is worth; the volley figure appears when it lands on its target.
  const sim=new Simulation({...map,targets:[{id:'a',x:5,z:0,maxHp:1000}]});
  for(let i=0;i<count;i++)sim.seed();
  sim.launch(5,0);
  assert.ok(sim.shots.every(s=>s.damage===damagePerOrb(1)),`volley of ${count} baked its damage in early`);
  for(let i=0;i<120;i++)sim.step({});
  const landed=sim.events.filter(e=>e.type==='outgoingDamage').slice(0,count);
  assert.equal(landed.length,count,`all ${count} orbs should reach the target`);
  for(const hit of landed)assert.ok(Math.abs(hit.damage-oldBase*ORB_DAMAGE_MULTIPLIER)<1e-6,
   `each landed orb of ${count} should be worth ${oldBase*ORB_DAMAGE_MULTIPLIER}, got ${hit.damage}`);
 }
 const quick=new Simulation(map);quick.launch(20,0,true);quick.step({});
 assert.equal(quick.shots[0].damage,6*VOLLEY_BOOST);
});
test('launch accelerates rapidly with a modest terminal speed and synchronized distance curve',()=>{
 const early=launchDistance(.05)/.05,late=(launchDistance(.5)-launchDistance(.45))/.05;
 assert.ok(early<late*.4&&late<64&&late>58,'leaves slow, lands fast');
 for(const d of [6,12,24,45])assert.ok(Math.abs(launchDistance(launchDuration(d))-d)<1e-5);
});
test('small volley sizes retain their capped range bonus',()=>{
 for(let n=1;n<=3;n++){
  const base=damagePerOrb(n);assert.equal(rangedOrbDamage(base,3),base);
  assert.equal(rangedOrbDamage(base,24),Math.round(base/ORB_DAMAGE_MULTIPLIER*1.2)*ORB_DAMAGE_MULTIPLIER);
  assert.equal(rangedOrbDamage(base,100),rangedOrbDamage(base,24));
 }
});
test('combined volley budgets ramp after three and full hits vary from 335 to 355',t=>{
 for(let count=4;count<=12;count++){
  assert.ok(Math.abs(damagePerOrb(count)*count+explosionFor(count).damage-ORB_VOLLEY_TOTALS[count])<1e-8);
  if(count>4)assert.ok(ORB_VOLLEY_TOTALS[count]>ORB_VOLLEY_TOTALS[count-1]);
 }
 for(const roll of [0,.5,1])for(const distance of [5,24]){
  t.mock.method(Math,'random',()=>roll);
  const sim=new Simulation({...map,targets:[{id:'center',x:distance,z:0,maxHp:1000}]});
  for(let i=0;i<12;i++)sim.seed();sim.launch(distance,0);
  // A full volley in flight is still only worth a stray apiece until it lands.
  assert.ok(sim.shots.every(s=>s.damage===damagePerOrb(1)));
  for(let i=0;i<120;i++)sim.step({});
  // The band rises by the heavy core the blast now adds at its centre.
  const bump=Math.round(explosionFor(12).damage*splashFalloff(0,explosionFor(12).radius,12))-explosionFor(12).damage;
  // (Volleys hit 1.75x as hard since v0.83; rounding moves it a few points.)
  const expected=(335+20*roll)*VOLLEY_BOOST+bump;
  assert.ok(Math.abs((1000-sim.targets[0].hp)-expected)<10,
   `dealt ${1000-sim.targets[0].hp}, expected ${expected}`);
  assert.ok(bump>0&&bump<explosionFor(12).damage*.1,'the increase should be slight');
  assert.ok(Math.abs(sim.events.find(e=>e.type==='explosion').damage-145*VOLLEY_BOOST)<1e-9);
  t.mock.restoreAll();
 }
});
test('aiming far past a nearby victim cannot grant the distance bonus',()=>{
 const sim=new Simulation({...map,targets:[{id:'near',x:3,z:0}]});sim.player.aimX=1;sim.player.aimZ=0;sim.seed();sim.launch(30,0);
 for(let i=0;i<120&&sim.targets[0].hp===FULL;i++)sim.step({});
 assert.equal(sim.targets[0].hp,FULL-damagePerOrb(1));
});
