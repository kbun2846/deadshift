import test from 'node:test';
import assert from 'node:assert/strict';
import {DamageFeedbackState,damageFeedbackSize,damageFeedbackScale,createDamageFeedback} from '../src/damage-feedback.js';
import {Simulation} from '../src/simulation.js';
test('damage popup follows rendered position and does not switch sides when turning',()=>{
 const previous=globalThis.document;
 const element=()=>({children:[],style:{},setAttribute(){},append(child){this.children.push(child);},remove(){}});
 globalThis.document={createElement:element};
 try{
  const parent=element();parent.clientWidth=1000;parent.clientHeight=700;
  const feedback=createDamageFeedback(parent),sim={time:1,player:{x:900,z:500,aimX:1,aimZ:0}};
  const view={player:{position:{x:400,z:300}},screenPoint:(x,z)=>({x,y:z})};
  feedback.add(20,1);feedback.update(sim,view);
  const popup=parent.children[0].children[0],left=parseFloat(popup.style.left);assert.ok(left<400);
  sim.player.x=950;sim.player.aimX=-1;feedback.update(sim,view);assert.equal(parseFloat(popup.style.left),left);
  view.player.position.x+=.5;feedback.update(sim,view);assert.equal(parseFloat(popup.style.left),left+.5);
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
test('each hit gets its own damage popup and independent three-second lifetime',()=>{
 const state=new DamageFeedbackState();state.add(100,1);
 const first={...state.items[0]};
 for(const time of [1.3,1.6,2.5])state.add(20,time);
 assert.deepEqual(state.items.map(item=>item.damage),[100,20,20,20]);
 assert.deepEqual(state.items[0],first);
 assert.equal(new Set(state.items.map(item=>item.id)).size,4);
 assert.equal(new Set(state.items.map(item=>item.position)).size,4);
 const snapshot=JSON.stringify(state.items);state.update(2.5);assert.equal(JSON.stringify(state.items),snapshot);
 state.update(3.99);assert.equal(state.items.length,4);state.update(4);assert.equal(state.items.length,3);
 state.update(5.49);assert.equal(state.items.length,1);state.update(5.5);assert.equal(state.items.length,0);
 state.add(20,6);assert.equal(state.items[0].damage,20);state.update(0);assert.equal(state.items.length,0);
});
test('damage text scales to each individual hit and has a restrained entry slam',()=>{
 assert.ok(damageFeedbackSize(200)>damageFeedbackSize(100));
 assert.ok(damageFeedbackSize(200)-damageFeedbackSize(100)<3);
 assert.equal(damageFeedbackSize(5000),26);
 assert.equal(damageFeedbackScale(0),1.26);assert.ok(damageFeedbackScale(.1)<1);assert.ok(Math.abs(damageFeedbackScale(.6)-1)<.001);
});
test('player damage feedback reports actual lost HP and ignores invulnerability',()=>{
 const sim=new Simulation({width:30,depth:30,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]});
 sim.player.hp=35;sim.damagePlayer(240,sim.player.id,false,true);
 assert.deepEqual(sim.events.filter(e=>e.type==='playerDamage'),[{type:'playerDamage',damage:35}]);
 sim.reset();sim.dev.invulnerable=true;sim.damagePlayer(240,sim.player.id,false,true);
 assert.equal(sim.events.filter(e=>e.type==='playerDamage').length,0);
});
