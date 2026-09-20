import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
const make=props=>{const sim=new Simulation({width:40,depth:40,spawn:{x:0,z:0},buildings:[],fences:[],props,targets:[]});sim.weapon='shotgun';sim.reset();return sim;};
const step=(s,n,input={})=>{for(let i=0;i<n;i++)s.step(input);};
test('Ballast launch smashes crates, barrels and rotated cacti without losing travel',()=>{
 const s=make([{id:'a',type:'crate',x:-1.7,z:0,angle:.35},{id:'b',type:'barrel',x:-3.5,z:0},{id:'c',type:'cactus',x:-5.4,z:0,angle:Math.PI/2}]);
 s.shotgun.charge=1;s.shotgun.stored=true;s.shotgun.hold=15;s.step({tapFire:true});step(s,120);
 assert.ok(s.props.every(p=>p.hp===0));assert.equal(s.events.filter(e=>e.type==='propBreak').length,3);assert.ok(s.player.x<-7.5);assert.equal(s.player.hp,500);assert.equal(s.player.ballastLaunch,false);
 assert.ok(s.colliders.every(c=>!c.propId));s.reset();assert.ok(s.props.every(p=>p.hp>0));assert.equal(s.player.ballastLaunch,false);
});
test('walking, native dodging and ordinary blast knockback do not smash props',()=>{
 for(const mode of ['walk','dodge','blast']){const s=make([{type:'crate',x:-1.7,z:0}]);
 if(mode==='blast')s.applyBlastKnockback(1,0,4,2.8);else s.step({moveX:-1,dodge:mode==='dodge'});
 step(s,80,mode==='blast'?{}:{moveX:-1});assert.ok(s.props[0].hp>0);}
});
test('solid barriers stop launch and protect props behind them',()=>{
 const s=make([{type:'crate',x:-2.5,z:0}]);s.colliders.unshift({x:-1.1,z:0,w:.2,d:8});
 s.shotgun.charge=1;s.shotgun.stored=true;s.shotgun.hold=15;s.step({tapFire:true});step(s,120);
 assert.ok(s.props[0].hp>0);assert.ok(s.player.x>-.8);
});
