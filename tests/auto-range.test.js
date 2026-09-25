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

test('assist slides the reach out and bends the aim toward the target, without snapping',()=>{
 const sim=new Simulation({width:80,depth:80,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[{id:'t',x:10,z:.4,kind:'target'}]});
 sim.step({aimX:1,aimZ:0,autoRange:'keyboard'});
 const p=sim.player,first=Math.hypot(p.aimPointX-p.x,p.aimPointZ-p.z);
 assert.equal(p.autoTargetId,'t');
 assert.ok(first<RULES.focusDistance+.3,'the reach drifts rather than snapping onto the target');
 for(let i=0;i<90;i++)sim.step({aimX:1,aimZ:0,autoRange:'keyboard'});
 assert.ok(Math.abs(Math.hypot(p.aimPointX-p.x,p.aimPointZ-p.z)-10)<.1,'it settles at the target distance');
 assert.ok(p.aimZ>0,'the aim leans toward the target');
 for(let i=0;i<90;i++)sim.step({aimX:0,aimZ:1,autoRange:'keyboard'});
 assert.equal(p.autoTargetId,null);
 assert.ok(Math.abs(Math.hypot(p.aimPointX-p.x,p.aimPointZ-p.z)-RULES.focusDistance)<.05,'back to the default reach with nothing ahead');
 sim.step({aimX:1,aimZ:0,autoRange:false});
 assert.equal(p.autoTargetId,null,'mouse aim is never assisted');
});

test('touch assist sticks to the target while strafing, and lets go when the player turns away',()=>{
 const target={id:'t',x:10,z:0,kind:'target'};
 const sim=new Simulation({width:80,depth:80,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[target]});
 const p=sim.player;
 for(let i=0;i<30;i++)sim.step({aimX:1,aimZ:.15,autoRange:'touch'});
 assert.equal(p.assistTargetId,'t','a rough aim picks it up');
 // Strafe sideways for a second with the thumb held still: the aim follows.
 for(let i=0;i<60;i++)sim.step({moveZ:1,aimX:1,aimZ:0,autoRange:'touch'});
 assert.equal(p.assistTargetId,'t','moving does not break the lock');
 const toTarget=Math.atan2(sim.targets[0].z-p.z,sim.targets[0].x-p.x),facing=Math.atan2(p.aimZ,p.aimX);
 const raw=0;
 assert.ok(Math.abs(facing-toTarget)<Math.abs(raw-toTarget)*.5,'the aim stays mostly on the target, not on the thumb');
 // Now turn the aim steadily away from it.
 let angle=0;for(let i=0;i<40;i++){angle+=.01;sim.step({aimX:Math.cos(angle),aimZ:Math.sin(angle),autoRange:'touch'});}
 assert.equal(p.assistTargetId,null,'turning away lets go');
 sim.step({aimX:Math.cos(angle),aimZ:Math.sin(angle),autoRange:'touch'});
 assert.equal(p.assistTargetId,null,'and it does not grab straight back');
});

test('players outrank props and dummies, and touch gets a slightly wider cone than keys',()=>{
 const dummy={id:'d',x:6,z:0,kind:'dummy'},enemy={id:'p',x:9,z:.9,kind:'player'};
 assert.equal(autoRangeTarget(player,[dummy,enemy]).id,'p');
 const offLine={id:'o',x:8,z:1.9};
 assert.equal(autoRangeTarget(player,[offLine],null,'keyboard'),null);
 assert.equal(autoRangeTarget(player,[offLine],null,'touch').id,'o');
});
