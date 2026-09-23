import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {SHOTGUN,shotgunRange,shotgunSpread,shotgunRecoil} from '../src/shotgun.js';
const make=()=>{const s=new Simulation({width:80,depth:80,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]});s.weapon='shotgun';s.reset();return s;};
const ticks=(s,n,input={})=>{for(let i=0;i<n;i++)s.step({aimX:1,aimZ:0,...input});};

test('first inserted shell can fire and cancels the remaining reload for LMB, tap and E',()=>{
 for(const input of [{tapFire:true},{doubleShot:true},{fire:true}]){
  const s=make();s.shotgun.ammo=0;s.shotgun.spent=2;s.step({reload:true});
  ticks(s,60);s.step({tapFire:true});assert.equal(s.shotgun.ammo,0);assert.ok(s.shotgun.reload>0);
  ticks(s,49);assert.equal(s.shotgun.ammo,1);assert.ok(s.shotgun.reload>0);
  s.step(input);assert.equal(s.shotgun.reload,0);
  if(input.fire){assert.equal(s.shotgun.ammo,1);s.step({fire:false});}
  assert.equal(s.shotgun.ammo,0);assert.equal(s.shotgun.spent,1);
  ticks(s,180);assert.equal(s.shotgun.ammo,0);
  assert.equal(s.events.filter(e=>e.type==='shotgunShot').length,1);
  assert.equal(s.events.filter(e=>e.type==='shotgunReloaded').length,0);
  s.step({reload:true});assert.equal(s.events.at(-1).spent,1);
  ticks(s,170);assert.equal(s.shotgun.ammo,2);
 }
});
test('charge lock suppresses release, persists across shells, expires and resets',()=>{
 const s=make();assert.equal(s.maxStamina,1);ticks(s,120,{fire:true});s.step({fire:true,storeCharge:true});s.step({fire:false});assert.equal(s.shotgun.ammo,2);assert.equal(s.shotgun.charge,1);
 s.step({fire:true});s.step({fire:false});assert.equal(s.shotgun.ammo,1);assert.equal(s.events.find(e=>e.type==='shotgunShot').charge,1);
 ticks(s,920);assert.equal(s.shotgun.charge,0);assert.equal(s.shotgun.stored,false);s.reset();assert.equal(s.shotgun.ammo,2);
});
test('E keeps both charged shots close before applying the combined recoil launch',()=>{
 const s=make();ticks(s,120,{fire:true});s.step({fire:true,doubleShot:true,aimX:1,aimZ:0});ticks(s,12);const shots=s.events.filter(e=>e.type==='shotgunShot');assert.equal(shots.length,2);assert.ok(shots[0].charge> .999);assert.equal(shots[1].charge,shots[0].charge);const separation=shots[0].x-shots[1].x;assert.ok(separation>0&&separation<.4);assert.equal(s.shotgun.ammo,0);
 ticks(s,150);assert.ok(s.player.x<-4);s.step({reload:true});ticks(s,Math.ceil(SHOTGUN.reload*60)+1);assert.equal(s.shotgun.ammo,2);
});
test('release fires pellets, recoil exceeds a dash, charge lengthens cone without narrowing',()=>{
 const s=make();s.step({fire:true,aimX:1,aimZ:0});s.step({fire:false});assert.equal(s.shotgunPellets.length,12);ticks(s,120);assert.ok(s.player.x<-3.2);assert.ok(shotgunRange(1)>shotgunRange(0));assert.ok(shotgunSpread(true)<shotgunSpread(false));assert.equal(s.shotgunPellets.length,0);
});
test('damage feedback gives actual health lost and remaining health without bars',()=>{
 const s=make(),target={id:'enemy',x:2,z:0,hp:500,maxHp:500};s.hit(target,{owner:'local',damage:370,volley:1});const e=s.events.find(e=>e.type==='outgoingDamage');assert.equal(e.damage,370);assert.equal(e.hp,130);
});
test('first-shell point-blank pellet totals are 115 uncharged and 315 fully charged',t=>{
 t.mock.method(Math,'random',()=>.5);
 for(const charged of [false,true]){const s=make();if(charged)ticks(s,120,{fire:true});
 s.targets.push({id:'test',kind:'target',x:1.4,z:.2,baseX:1.4,hp:1000,maxHp:1000,flash:0,respawn:0});
 s.step(charged?{fire:false}:{tapFire:true});s.step({});assert.ok(Math.abs(1000-s.targets[0].hp-(charged?315:115))<1e-6);}
});
test('cover blocks pellets and stops recoil at walls',()=>{
 const s=make();s.colliders=[{x:-1,z:0,w:.2,d:8},{x:1.1,z:0,w:.2,d:8}];
 s.targets.push({id:'test',kind:'target',x:2,z:0,baseX:2,hp:1000,maxHp:1000,flash:0,respawn:0});
 s.step({tapFire:true});ticks(s,90);assert.equal(s.targets[0].hp,1000);assert.ok(s.player.x>-.9);
});

test('only the first loaded shell gets 15 bonus damage for LMB and E, restored by reload',()=>{
 const shellTotal=(s,volley)=>s.shotgunPellets.filter(p=>p.volley===volley).reduce((sum,p)=>sum+p.damage,0);
 for(const charge of [0,.5,1])for(const double of [false,true]){
  const s=make(),base=100+200*charge;
  s.shotgun.charge=charge;s.shotgun.stored=true;s.shotgun.hold=15;
  s.step(double?{doubleShot:true}:{tapFire:true});
  assert.ok(Math.abs(shellTotal(s,1)-(base+15))<1e-6);
  if(double)ticks(s,3);else{ticks(s,20);s.step({tapFire:true});}
  assert.ok(Math.abs(shellTotal(s,2)-base)<1e-6);
  ticks(s,20);s.step({reload:true});ticks(s,Math.ceil(SHOTGUN.reload*60)+1);s.step({tapFire:true});
  assert.ok(Math.abs(shellTotal(s,3)-115)<1e-6);
 }
});

test('right-click store preserves charge and narrowing without firing on LMB release',()=>{
 for(const releaseSameTick of [false,true]){
  const s=make();ticks(s,60,{fire:true});
  s.step({fire:!releaseSameTick,aiming:true,storeCharge:true});
  const charge=s.shotgun.charge;
  s.step({fire:false,aiming:true});
  assert.equal(s.shotgun.ammo,2);assert.equal(s.shotgun.stored,true);assert.equal(s.shotgun.charge,charge);assert.equal(s.shotgun.aiming,true);
  ticks(s,60,{aiming:true});assert.ok(s.shotgun.hold<14.1);assert.equal(s.events.filter(e=>e.type==='shotgunStored').length,1);
  s.step({fire:true,aiming:true});s.step({fire:false,aiming:true});
  assert.equal(s.shotgun.ammo,1);assert.equal(s.events.find(e=>e.type==='shotgunShot').charge,charge);
 }
 const s=make();s.step({aiming:true,storeCharge:true});assert.equal(s.shotgun.stored,false);
 ticks(s,60,{fire:true,aiming:true});assert.ok(s.shotgun.charge>.49);assert.equal(s.shotgun.stored,false);
});

test('second-shell fully charged close shots retain 230–280 weighting with rare perfect hits',t=>{
 let seed=7319;
 t.mock.method(Math,'random',()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;});
 let typical=0,perfect=0,total=0;
 for(let i=0;i<2000;i++){
  const s=make();s.targets=[{id:'test',kind:'target',x:1.96,z:.2,baseX:1.96,hp:1000,maxHp:1000,flash:0,respawn:0}];
  s.shotgun.ammo=1;s.shotgun.charge=1;s.shotgun.stored=true;s.shotgun.hold=15;
  s.step({tapFire:true,aiming:true,aimX:1,aimZ:0});ticks(s,3);
  const damage=1000-s.targets[0].hp;total+=damage;
  if(damage>=230&&damage<=280)typical++;
  if(Math.abs(damage-300)<1e-6)perfect++;
 }
 assert.ok(typical/2000>.8,`typical fraction: ${typical/2000}`);
 assert.ok(total/2000>245&&total/2000<260,`mean: ${total/2000}`);
 assert.ok(perfect>0&&perfect/2000<.02,`perfect fraction: ${perfect/2000}`);
});

test('E with one shell fires only once and reloading removes stored charge',()=>{
 const s=make();s.step({tapFire:true});ticks(s,20);s.events=[];s.step({doubleShot:true});ticks(s,20);assert.equal(s.events.filter(e=>e.type==='shotgunShot').length,1);
 s.step({reload:true});ticks(s,Math.ceil(SHOTGUN.reload*60)+1);ticks(s,120,{fire:true});s.step({fire:true,storeCharge:true});s.step({fire:false});s.step({tapFire:true});ticks(s,20);s.step({reload:true});assert.equal(s.shotgun.charge,0);assert.equal(s.shotgun.stored,false);
});

test('launch force scales progressively with a stronger final charge boost',()=>{
 assert.equal(shotgunRecoil(0),4.2);assert.ok(Math.abs(shotgunRecoil(1)-7.6)<1e-8);
 assert.ok(shotgunRecoil(1)-shotgunRecoil(.75)>shotgunRecoil(.5)-shotgunRecoil(.25));
 for(const charge of [0,.5,1]){const s=make();s.shotgun.charge=charge;s.shotgun.stored=true;s.shotgun.hold=15;s.step({tapFire:true});ticks(s,180);assert.ok(Math.abs(-s.player.x-shotgunRecoil(charge))<.01);}
});

test('buffed first-shell aimed midrange hits stay near 80-105; edge hits are much weaker',()=>{
 const random=Math.random;Math.random=()=>.5;
 try{const damageAt=distance=>{const s=make();s.targets=[{id:'t',kind:'target',x:.96+distance,z:.2,baseX:.96+distance,hp:1000,maxHp:1000,flash:0,respawn:0}];s.shotgun.charge=1;s.shotgun.stored=true;s.shotgun.hold=15;s.step({tapFire:true,aiming:true});ticks(s,30);return 1000-s.targets[0].hp;};
 assert.equal(damageAt(1),315);const middle=damageAt(4.5);assert.ok(middle>=80&&middle<=105,'midrange dealt '+middle);assert.ok(damageAt(8.5)<20);
 }finally{Math.random=random;}
});
test('charging and storing require a loaded shell; empty and reloading stay uncharged',()=>{
 const s=make();s.step({doubleShot:true});ticks(s,10);assert.equal(s.shotgun.ammo,0);s.events=[];
 ticks(s,60,{storeCharge:true});s.step({fire:false});
 assert.equal(s.shotgun.charge,0);assert.equal(s.shotgun.stored,false);assert.equal(s.shotgun.hold,0);assert.equal(s.events.some(e=>e.type==='shotgunStored'||e.type==='shotgunShot'),false);
 s.step({reload:true});ticks(s,60,{fire:true,storeCharge:true});assert.ok(s.shotgun.reload>0);assert.equal(s.shotgun.charge,0);
 ticks(s,Math.ceil(SHOTGUN.reload*60)+1);s.step({tapFire:true});ticks(s,20);assert.equal(s.shotgun.ammo,1);
 ticks(s,120,{fire:true});s.step({fire:true,storeCharge:true});assert.equal(s.shotgun.charge,1);assert.equal(s.shotgun.stored,true);
});
test('empty Ballast firing inputs reload normally without duplicating reloads',()=>{
 for(const input of [{fire:true},{tapFire:true},{doubleShot:true}]){
  const s=make();s.shotgun.ammo=1;s.step({tapFire:true});ticks(s,20);
  assert.equal(s.shotgun.ammo,0);assert.equal(s.shotgun.reload,0);
  s.step(input);assert.equal(s.shotgun.reload,SHOTGUN.reload);
  ticks(s,60,input);assert.equal(s.shotgun.ammo,0);assert.equal(s.shotgun.charge,0);
  assert.equal(s.events.filter(e=>e.type==='shotgunReload').length,1);
  ticks(s,110);assert.equal(s.shotgun.ammo,2);
 }
 const s=make();s.dev.ammo=true;s.shotgun.ammo=0;s.step({tapFire:true});
 assert.equal(s.shotgun.reload,0);assert.equal(s.stats.launched,1);
});
test('Ballast does not reload from holding or releasing fire after E empties both barrels',()=>{
 const s=make();ticks(s,120,{fire:true});s.step({fire:true,doubleShot:true});
 ticks(s,180,{fire:true});assert.equal(s.shotgun.ammo,0);assert.equal(s.shotgun.reload,0);
 assert.equal(s.events.filter(e=>e.type==='shotgunShot').length,2);
 s.step({tapFire:true});assert.equal(s.shotgun.reload,0);
 ticks(s,10);assert.equal(s.shotgun.reload,0);
 s.step({fire:true});assert.equal(s.shotgun.reload,SHOTGUN.reload);
 assert.equal(s.events.filter(e=>e.type==='shotgunReload').length,1);
});
test('double recoil begins lightly, kicks together after 50ms, and keeps single-shell E unchanged',()=>{
 for(const charge of [0,.5,1]){
  const s=make();s.shotgun.charge=charge;s.shotgun.stored=true;s.shotgun.hold=15;
  s.step({doubleShot:true});assert.ok(s.player.blastVX<0);const initial=-s.player.blastVX;
  ticks(s,2);assert.equal(s.events.filter(e=>e.type==='shotgunShot').length,1);assert.ok(s.player.x<0&&s.player.x>-.4);
  ticks(s,1);assert.equal(s.events.filter(e=>e.type==='shotgunShot').length,2);assert.ok(-s.player.blastVX>initial*8);
  ticks(s,180);assert.ok(-s.player.x>shotgunRecoil(charge)*1.3);assert.ok(-s.player.x<shotgunRecoil(charge)*1.4);
  const single=make();single.shotgun.ammo=1;single.shotgun.charge=charge;single.shotgun.stored=true;single.shotgun.hold=15;single.step({doubleShot:true});ticks(single,180);assert.ok(Math.abs(-single.player.x-shotgunRecoil(charge))<.01);
 }
});
