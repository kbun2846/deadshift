import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {SCATTER} from '../src/weapons/scatter.js';
const make=()=>{const s=new Simulation({width:80,depth:80,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]});s.weapon='shotgun';s.reset();return s;};
const ticks=(s,n,input={})=>{for(let i=0;i<n;i++)s.step({aimX:1,aimZ:0,...input});};
const dummy=(x,z=0)=>({id:'t'+x+','+z,kind:'robot',x,z,baseX:x,hp:5000,maxHp:5000,flash:0,respawn:0});

test('Scatter: X readies it, X again fires five big red shells; 40 s cooldown; no shells used',()=>{
 const s=make();s.step({scatter:true});assert.equal(s.scatter.armed,true);assert.equal(s.scatterShells.length,0);
 assert.ok(s.events.some(e=>e.type==='scatterArm'));
 ticks(s,30);assert.equal(s.scatter.armed,true,'stays readied');
 s.step({scatter:true});assert.equal(s.scatterShells.length,SCATTER.shells);assert.equal(s.scatter.armed,false);
 assert.equal(s.scatter.cooldown,SCATTER.cooldown);assert.equal(SCATTER.cooldown,40);assert.equal(s.shotgun.ammo,2);
 s.step({scatter:true});assert.equal(s.scatter.armed,false,'cannot ready it again during the cooldown');
});
test('each big shell splits into four that each end in a little explosion',()=>{
 const s=make();s.step({scatter:true});s.step({scatter:true});ticks(s,90);
 assert.equal(s.events.filter(e=>e.type==='scatterSplit').length,SCATTER.shells);
 assert.equal(s.events.filter(e=>e.type==='scatterBurst').length,SCATTER.shells*SCATTER.split);
 assert.equal(s.scatterShells.length,0);
});
test('damage: moderate from big shells, decent from the small ones, stacking splash, capped',()=>{
 // Point blank, all five big shells land: capped.
 const near=make(),t=dummy(1.3);near.targets.push(t);near.step({scatter:true});near.step({scatter:true});ticks(near,90);
 assert.equal(5000-t.hp,SCATTER.max);assert.ok(SCATTER.max>=420&&SCATTER.max<=480);
 // One big shell into a body at mid-range: it bursts in them (~150-180).
 const mid=make(),m=dummy(4.5);mid.targets.push(m);mid.step({scatter:true});mid.step({scatter:true});ticks(mid,90);
 assert.ok(5000-m.hp>=120&&5000-m.hp<=250,'mid-range '+(5000-m.hp));
 // Where the small shells come down: several small hits and bursts.
 const far=make(),f=dummy(8.5);far.targets.push(f);far.step({scatter:true});far.step({scatter:true});ticks(far,90);
 assert.ok(5000-f.hp>30,'far '+(5000-f.hp));
 // Explosions splash someone standing beside the burst too.
 assert.ok(far.events.some(e=>e.type==='scatterBurst'));
});
test('walls shelter from the little explosions, and a readied Scatter is dropped when you come back',()=>{
 const s=make();s.colliders=[{x:3,z:0,w:.3,d:20}];const t=dummy(4.2);s.targets.push(t);
 s.step({scatter:true});s.step({scatter:true});ticks(s,90);assert.equal(t.hp,5000);
 const d=make();d.step({scatter:true});d.respawn({x:0,z:0});assert.equal(d.scatter.armed,false,'a respawn drops it');
});
