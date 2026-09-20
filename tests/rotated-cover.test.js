import test from 'node:test';
import assert from 'node:assert/strict';
import {inside,segmentBox,Simulation} from '../src/simulation.js';
import {deadwater,mapProps} from '../src/maps.js';
const angle=.47,c=Math.cos(angle),s=Math.sin(angle);
const rotate=(x,z)=>({x:x*c+z*s,z:-x*s+z*c});
const box={x:0,z:0,w:6*c+.4*s,d:6*s+.4*c,localW:6,localD:.4,angle};
test('angled cover uses its true thin outline for shots and occupancy',()=>{
 assert.equal(inside(rotate(0,.7),box),false);
 assert.equal(inside(rotate(2,0),box),true);
 const a=rotate(0,2),b=rotate(0,-2);
 assert.ok(Math.abs(segmentBox(a.x,a.z,b.x,b.z,box)-.45)<1e-9);
 const u=rotate(-2,.7),v=rotate(2,.7);
 assert.equal(segmentBox(u.x,u.z,v.x,v.z,box),null);
});
test('movement slides along a rotated wall without crossing or teleporting',()=>{
 const sim=new Simulation({...deadwater,buildings:[],props:[],fences:[],targets:[],spawn:rotate(0,1)});sim.colliders=[box];
 for(let i=0;i<90;i++){
  const prev={...sim.player};sim.step({moveX:c-s,moveZ:-s-c});
  assert.ok(Math.hypot(sim.player.x-prev.x,sim.player.z-prev.z)<.2);
  const x=sim.player.x*c-sim.player.z*s,z=sim.player.x*s+sim.player.z*c;
  assert.ok(Math.hypot(Math.max(0,Math.abs(x)-3),Math.max(0,Math.abs(z)-.2))>=.379);
 }
});
test('prop rotations are stable and retain both aligned and diagonal placements',()=>{
 const a=mapProps(deadwater),b=mapProps(deadwater);assert.deepEqual(a,b);
 assert.ok(a.some(p=>p.type==='crate'&&p.angle===0));assert.ok(a.some(p=>p.type==='crate'&&Math.abs(p.angle)>.1));
});
