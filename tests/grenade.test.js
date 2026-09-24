import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {GRENADE,grenadeDamage} from '../src/weapons/grenade.js';
const make=()=>{const s=new Simulation({id:'test',width:120,depth:120,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]});s.weapon='rifle';return s;};
const tick=(s,input={},n=1)=>{for(let i=0;i<n;i++)s.step({aimX:1,aimZ:0,aimPointX:10,aimPointZ:0,...input});};
test('grenade has a wide full-damage center and bounded splash falloff',()=>{
 assert.equal(grenadeDamage(0),240);assert.equal(grenadeDamage(.7),240);
 assert.ok(grenadeDamage(2)>130&&grenadeDamage(2)<150);
 assert.equal(grenadeDamage(4),35);assert.equal(grenadeDamage(4.001),0);
});
test('Nominal grenade releases from the free hand, caps range and uses a 1.4-second fuse',()=>{
 const s=make();tick(s,{grenade:true,aimPointX:50});
 assert.equal(s.grenades.length,1);assert.ok(Math.abs(s.grenades[0].targetX-12)<1e-8);
 assert.ok(s.grenades[0].z<0);assert.equal(s.grenades[0].released,false);
 tick(s,{},10);assert.equal(s.events.filter(e=>e.type==='grenadeThrow').length,1);
 tick(s,{},83);assert.equal(s.grenades.length,1);
 tick(s);assert.equal(s.grenades.length,0);
 const blast=s.events.find(e=>e.type==='grenadeExplosion');assert.ok(Math.abs(blast.x-12)<1e-8);assert.equal(blast.radius,4);assert.equal(blast.count,12);
});
test('grenade cooldown lasts 25 seconds, resets, and has a separate developer override',()=>{
 const s=make();tick(s,{grenade:true});assert.equal(s.grenadeCooldown,25);
 tick(s,{grenade:true},1499);assert.equal(s.events.filter(e=>e.type==='grenadeWindup').length,1);
 tick(s,{grenade:true});assert.equal(s.events.filter(e=>e.type==='grenadeWindup').length,2);
 s.dev.grenadeCooldown=true;tick(s,{grenade:true});assert.equal(s.grenades.length,2);
 s.reset();assert.equal(s.grenades.length,0);assert.equal(s.grenadeCooldown,0);
 s.weapon='static';tick(s,{grenade:true});assert.equal(s.grenades.length,0);
});
test('grenade damages exposed targets and the player but solid cover blocks splash',()=>{
 const s=make();tick(s,{grenade:true});tick(s,{},70);
 s.targets=[{id:'open',x:10,z:0,hp:500,maxHp:500},{id:'covered',x:12,z:0,hp:500,maxHp:500}];
 s.player.x=10;s.player.z=1;s.colliders=[{x:11,z:0,w:.2,d:4,height:3}];
 tick(s,{},43);
 assert.equal(s.targets[0].hp,260);assert.equal(s.targets[1].hp,500);
 assert.equal(s.player.hp,500-grenadeDamage(1));
});
test('grenade flight stops at tall walls and clears low cover',()=>{
 for(const [height,blocked]of [[5,true],[.2,false]]){
  const s=make();s.colliders=[{x:4,z:0,w:.2,d:4,height}];tick(s,{grenade:true});tick(s,{},70);
  assert.equal(s.grenades[0].blocked,blocked);
  assert.ok(blocked?s.grenades[0].x<4:s.grenades[0].x===10);
 }
});
