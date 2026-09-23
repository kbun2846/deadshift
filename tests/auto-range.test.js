import test from 'node:test';
import assert from 'node:assert/strict';
import {autoRangeTarget,AUTO_RANGE} from '../src/auto-range.js';
import {Simulation,RULES} from '../src/simulation.js';

const player={x:0,z:0,aimX:1,aimZ:0};
test('auto-range picks what the aim points at, and nothing outside a narrow cone',()=>{
 const near={id:'a',x:5,z:.1},far={id:'b',x:11,z:0},wide={id:'c',x:4,z:3};
 assert.equal(autoRangeTarget(player,[far,near,wide]).id,'a','nearly on the line and nearer wins');
 assert.equal(autoRangeTarget(player,[{id:'n',x:5,z:.8},far]).id,'b','dead on the line beats a near one off to the side');
 assert.equal(autoRangeTarget(player,[wide]),null,'40 degrees off is not "pointing at"');
 assert.equal(autoRangeTarget(player,[{id:'d',x:-5,z:0}]),null,'never behind');
 assert.equal(autoRangeTarget(player,[{id:'e',x:AUTO_RANGE.max+2,z:0}]),null,'not beyond range');
 assert.equal(autoRangeTarget(player,[{id:'f',x:5,z:0,hp:0}]),null,'not a broken target');
});

test('a lock holds while two targets sit side by side, so the aim point does not flicker',()=>{
 const left={id:'l',x:8,z:-.9},right={id:'r',x:8,z:.9};
 const first=autoRangeTarget({...player,aimZ:-.08,aimX:Math.sqrt(1-.0064)},[left,right]);
 assert.equal(first.id,'l');
 assert.equal(autoRangeTarget({...player,aimZ:.02,aimX:Math.sqrt(1-.0004)},[left,right],'l').id,'l','a small drift keeps the lock');
});

test('assist only slides the reach out to the target, never moves the aim line, and never jumps',()=>{
 const sim=new Simulation({width:80,depth:80,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[{id:'t',x:10,z:.4,kind:'target'}]});
 sim.step({aimX:1,aimZ:0,autoRange:'keyboard'});
 const p=sim.player,first=Math.hypot(p.aimPointX-p.x,p.aimPointZ-p.z);
 assert.equal(p.autoTargetId,'t');
 assert.ok(first<RULES.focusDistance+.3,'it drifts rather than snapping onto the target');
 assert.ok(Math.abs(p.aimPointZ-p.z)<1e-9,'the dot stays on the line the player aimed');
 for(let i=0;i<90;i++)sim.step({aimX:1,aimZ:0,autoRange:'keyboard'});
 assert.ok(Math.abs(p.aimPointX-p.x-10)<.05,'it settles at the target distance');
 for(let i=0;i<90;i++)sim.step({aimX:0,aimZ:1,autoRange:'keyboard'});
 assert.equal(p.autoTargetId,null);
 assert.ok(Math.abs(Math.hypot(p.aimPointX-p.x,p.aimPointZ-p.z)-RULES.focusDistance)<.05,'back to the default reach with nothing ahead');
 sim.step({aimX:1,aimZ:0,autoRange:false});
 assert.equal(p.autoTargetId,null,'mouse aim is never assisted');
});

test('players outrank props and dummies, and touch gets a slightly wider cone than keys',()=>{
 const dummy={id:'d',x:6,z:0,kind:'dummy'},enemy={id:'p',x:9,z:.9,kind:'player'};
 assert.equal(autoRangeTarget(player,[dummy,enemy]).id,'p');
 const offLine={id:'o',x:8,z:1.9};
 assert.equal(autoRangeTarget(player,[offLine],null,'keyboard'),null);
 assert.equal(autoRangeTarget(player,[offLine],null,'touch').id,'o');
});
