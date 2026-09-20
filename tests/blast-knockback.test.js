import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,RULES} from '../src/simulation.js';
const make=()=>new Simulation({width:50,depth:50,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]});
const settle=sim=>{for(let i=0;i<120;i++)sim.step({});return Math.hypot(sim.player.x,sim.player.z);};
test('small orb blasts do not push; six to twelve orbs progressively increase knockback',()=>{
 let previous=0;
 for(const count of [2,3,4,5,6,8,10,12]){
  const sim=make();sim.explode({x:0,z:0,arrived:count},count);const distance=settle(sim);
  if(count<=5)assert.equal(distance,0);else{assert.ok(distance>previous);previous=distance;}
 }
 assert.ok(previous>2.1&&previous<2.3);
});
test('close grenade pushes about 2.8 metres, less than a dash, without costing stamina',()=>{
 const sim=make();sim.weapon='rifle';sim.reset();sim.step({grenade:true,aimX:1,aimZ:0,aimPointX:0,aimPointZ:0});
 const distance=settle(sim);assert.ok(distance>2.6&&distance<RULES.dodgeDistance);assert.equal(sim.player.stamina,3);
 assert.equal(sim.player.hp,260);
});
test('blast knockback falls off, is blocked by cover, respects walls and resets with spawn speed',()=>{
 const near=make(),far=make();near.explode({x:-.1,z:0,arrived:12},1);far.explode({x:-2.5,z:0,arrived:12},1);
 assert.ok(settle(near)>settle(far));
 const covered=make();covered.colliders.push({x:-.5,z:0,w:.1,d:4});covered.explode({x:-1,z:0,arrived:12},1);assert.equal(settle(covered),0);
 const wall=make();wall.colliders.push({x:1,z:0,w:.1,d:5});wall.applyBlastKnockback(-.1,0,4,2.8,.7);settle(wall);assert.ok(wall.player.x<=1-.05-RULES.radius+.001);
 wall.dev.speed=4;wall.reset();assert.equal(wall.dev.speed,1);assert.equal(wall.player.blastVX,0);assert.equal(wall.player.blastVZ,0);
});
