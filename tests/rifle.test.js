import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {RIFLE,rifleDamage,rifleSpread,rifleShotError,rifleAim,rifleMuzzle,RIFLE_CONVERGE} from '../src/weapons/rifle.js';
import { RULES as FULL_RULES } from '../src/config/gameplay.js';
const FULL = FULL_RULES.targetHealth; // a practice target's full health
const M=RIFLE.magazine,X=RIFLE.extendedMagazine;
const make=(extra={})=>{const s=new Simulation({id:'test',width:120,depth:120,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[],...extra});s.weapon='rifle';return s;};
const tick=(s,input={},n=1)=>{for(let i=0;i<n;i++)s.step({aimX:1,aimZ:0,aimPointX:10,aimPointZ:0,...input});};
test('rifle fires once on tap, repeats at cadence, and stops at empty magazine',()=>{
 const s=make();tick(s,{fire:true});tick(s,{},30);assert.equal(s.rifle.ammo,M-1);
 tick(s,{fire:true},Math.ceil(M*RIFLE.interval*60)+20);assert.equal(s.rifle.ammo,0);assert.equal(s.stats.launched,M);
 assert.equal(s.events.filter(e=>e.type==='rifleShot').length,M);
 // Held fire: one shot now, then one every RIFLE.interval.
 const a=make();tick(a,{fire:true},60);assert.equal(a.stats.launched,Math.ceil(1/RIFLE.interval));
});
test('manual reload blocks firing for 1.8 seconds and magazines expire at 30 seconds',()=>{
 const s=make();tick(s,{reload:true});assert.equal(s.magazines.length,0);
 tick(s,{fire:true});tick(s,{reload:true});assert.equal(s.magazines.length,1);
 tick(s,{fire:true},107);assert.equal(s.rifle.ammo,M-1);assert.ok(s.rifle.reload>0);
 tick(s);assert.equal(s.rifle.ammo,M);assert.equal(s.rifle.reload,0);
 tick(s,{},1692);assert.equal(s.magazines.length,0);
});
test('rifle damage and accuracy improve predictably with range, stance and aim',()=>{
 assert.equal(rifleDamage(5),RIFLE.damage);assert.equal(rifleDamage(22),RIFLE.minDamage);assert.equal(rifleDamage(50),RIFLE.minDamage);
 assert.equal(rifleSpread(20),rifleSpread(.2));assert.ok(rifleSpread(10,7.2)>rifleSpread(10));
 assert.equal(rifleSpread(10,0,true),.054);assert.equal(rifleSpread(10),.105);
 const s=make({targets:[{id:'a',x:5,z:0}]});tick(s,{fire:true,aiming:true});assert.equal(s.targets[0].hp,FULL);tick(s,{},5);assert.equal(s.targets[0].hp,FULL-RIFLE.damage);
});
test('a clean shot passes through what the crosshair is over, from the muzzle',()=>{
 const old=Math.random;
 try{
  Math.random=()=>.5;
  for(const distance of [.01,.5,1,1.1,2,10,30]){
   const s=make();tick(s,{fire:true,aimPointX:distance});
   const b=s.rifleBullets[0],p=s.player;
   const muzzle=rifleMuzzle(p),aim=rifleAim(p,Math.max(0,distance));
   // Fired from the barrel, not the player's centre.
   assert.ok(Math.abs(b.x-muzzle.x)<1e-9&&Math.abs(b.z-muzzle.z)<1e-9,'the shot did not leave the muzzle');
   // And laid on the convergence point, so a zero-error shot goes through it.
   const t=(aim.targetX-b.x)/b.dx;
   assert.ok(Math.abs(b.z+b.dz*t-aim.targetZ)<1e-9,
    `at ${distance}m the shot passed ${(b.z+b.dz*t-aim.targetZ).toFixed(3)}m off the aim point`);
   assert.ok(Math.abs(Math.hypot(b.dx,b.dz)-1)<1e-9,'heading is a unit vector');
  }
 }finally{Math.random=old;}
});
test('cursor depth changes where the barrel is laid, never how tight the group is',()=>{
 const old=Math.random;
 try{
  const fire=distance=>{let n=0;Math.random=()=>n++%2?.25:.75;const s=make();tick(s,{fire:true,aimPointX:distance});
   const b=s.rifleBullets[0],aim=rifleAim(s.player,distance);
   return Math.atan2(b.dz,b.dx)-aim.angle;};
  // The error a given roll produces is angular and identical at any depth: a
  // close cursor buys no accuracy, it only points the barrel somewhere else.
  assert.ok(Math.abs(fire(.1)-fire(30))<1e-12,'a close cursor tightened the group');
 }finally{Math.random=old;}
});
test('the convergence floor keeps a cursor underfoot from raking the shot',()=>{
 const p={x:0,z:0,aimX:1,aimZ:0};
 const worst=Math.abs(rifleAim(p,0).angle);
 assert.ok(worst<.04,`a cursor on the player's own feet raked the barrel ${worst.toFixed(3)}rad`);
 assert.equal(rifleAim(p,2).angle,rifleAim(p,0).angle,'anything inside the floor is treated alike');
 assert.ok(Math.abs(rifleAim(p,40).angle)<worst,'and the rake shrinks as the aim point goes out');
});
test('shots favor both sides equally without widening bloom or excluding center shots',()=>{
 let centered=0,flanks=0,total=0,sum=0;
 for(let a=0;a<200;a++)for(let b=0;b<200;b++){
  const error=rifleShotError((a-b)/200);total++;sum+=error;
  assert.ok(Math.abs(error)<=1);
  if(Math.abs(error)<.2)centered++;
  if(Math.abs(error)>.5)flanks++;
 }
 assert.ok(Math.abs(sum)<1e-8);
 assert.ok(centered/total>.06&&centered/total<.10);
 assert.ok(flanks/total>.54&&flanks/total<.58);
 assert.equal(rifleShotError(0),0);assert.equal(rifleShotError(1),1);assert.equal(rifleShotError(-1),-1);
});
test('side-weighted shots keep a straight heading and the same spread at any cursor depth',()=>{
 const old=Math.random;
 try{
  const fireAt=distance=>{let n=0;Math.random=()=>n++%2?.25:.5;const s=make();tick(s,{fire:true,aimPointX:distance});return s;};
  const near=fireAt(.1),far=fireAt(30);
  const shot=near.rifleBullets[0],heading={dx:shot.dx,dz:shot.dz};
  // The roll lands the same angular error on the barrel either way.
  for(const [s,distance] of [[near,.1],[far,30]]){
   const b=s.rifleBullets[0];
   assert.ok(Math.abs(Math.atan2(b.dz,b.dx)-rifleAim(s.player,distance).angle-.105*.5)<1e-8);
  }
  // Once fired a bullet flies straight, and both carry the same speed: the
  // headings differ only because the barrels were laid on different points.
  tick(near,{},10);tick(far,{},10);
  assert.equal(shot.dx,heading.dx);assert.equal(shot.dz,heading.dz);
  assert.ok(Math.abs(shot.travel-far.rifleBullets[0].travel)<1e-9,'the two shots travelled different distances');
 }finally{Math.random=old;}
});
test('cover intercepts bullets and Static abilities do not activate for rifle',()=>{
 const s=make({targets:[{id:'a',x:5,z:0}],props:[{type:'crate',x:3,z:0}]});
 tick(s,{fire:true,seed:true,hex:true,spray:true});tick(s,{},5);assert.equal(s.targets[0].hp,FULL);assert.equal(s.props[0].hp,0);
 assert.equal(s.seeds.length,0);assert.equal(s.hexOrbs.length,0);assert.equal(s.spray.active,false);
});
test('shared ammo override supports rifle; Static orb override does not refill it',()=>{
 const s=make();s.dev.ammo=true;tick(s,{fire:true},300);
 assert.equal(s.rifle.ammo,RIFLE.magazine);assert.ok(s.stats.launched>M);
 s.dev={orbs:true};tick(s,{fire:true},200);assert.equal(s.rifle.ammo,0);
 s.dev={rifleInstantReload:true};tick(s,{reload:true});assert.equal(s.rifle.ammo,M);assert.equal(s.rifle.reload,0);
 s.dev={};tick(s,{fire:true},30);tick(s,{reload:true});assert.equal(s.rifle.reload,1.8);
});
test('empty rifle trigger starts one normal reload and held fire resumes afterwards',()=>{
 const s=make();s.rifle.ammo=1;
 tick(s,{fire:true});assert.equal(s.rifle.ammo,0);assert.equal(s.rifle.reload,0);
 tick(s,{fire:true},180);assert.equal(s.rifle.reload,0);assert.equal(s.magazines.length,0);
 tick(s);assert.equal(s.rifle.reload,0);
 tick(s,{fire:true});assert.equal(s.rifle.reload,RIFLE.reload);
 tick(s,{fire:true},108);assert.equal(s.rifle.ammo,M);
 assert.equal(s.magazines.length,1);assert.equal(s.events.filter(e=>e.type==='rifleReload').length,1);
 tick(s,{fire:true});assert.equal(s.rifle.ammo,M-1);assert.equal(s.stats.launched,2);
 s.rifle.ammo=0;s.rifle.capacity=X;s.rifle.extendedCooldown=30;
 tick(s);
 tick(s,{fire:true});tick(s,{},108);
 assert.equal(s.rifle.ammo,M);assert.equal(s.rifle.capacity,M);assert.ok(s.rifle.extendedCooldown>0);
});
test('rifle aiming slows walking smoothly without reducing dodge travel',()=>{
 const s=make();tick(s,{moveX:1},90);const normal=s.player.vx;
 tick(s,{moveX:1,aiming:true});assert.ok(s.player.vx<normal);assert.ok(s.player.vx>normal*RIFLE.aimMoveMultiplier);
 tick(s,{moveX:1,aiming:true},90);assert.ok(Math.abs(s.player.vx-normal*RIFLE.aimMoveMultiplier)<.001);
 tick(s,{moveX:1},90);assert.ok(Math.abs(s.player.vx-normal)<.001);
 const a=make(),b=make();tick(a,{moveX:1,dodge:true});tick(b,{moveX:1,dodge:true,aiming:true});
 tick(a,{moveX:1},10);tick(b,{moveX:1,aiming:true},10);assert.equal(a.player.x,b.player.x);
 // Aiming in is a whole-arsenal action now, so Static slows with the rest.
 const staticGun=make();staticGun.weapon='static';tick(staticGun,{moveX:1,aiming:true},90);
 assert.ok(Math.abs(staticGun.player.vx-normal*RIFLE.aimMoveMultiplier)<.001,
  `Static walked at ${staticGun.player.vx.toFixed(2)} while aiming`);
});
test('Nominal has three dodge charges and Static retains two',()=>{
 const s=make();s.reset();assert.equal(s.maxStamina,3);assert.equal(s.player.stamina,3);
 for(let i=0;i<3;i++){tick(s,{moveX:1,dodge:true});tick(s,{moveX:1},15);}
 assert.equal(s.events.filter(e=>e.type==='dodge').length,3);
 tick(s,{moveX:1,dodge:true});assert.equal(s.events.filter(e=>e.type==='dodge').length,3);
 tick(s,{},400);assert.equal(s.player.stamina,3);
 s.weapon='static';s.reset();assert.equal(s.maxStamina,2);assert.equal(s.player.stamina,2);
});
test('extended magazine loads its big mag, blocks firing during reload and is usable once per 60 seconds',()=>{
 const s=make();tick(s,{extendedReload:true,fire:true});
 assert.equal(s.rifle.reload,1.8);assert.equal(s.rifle.extendedCooldown,60);assert.equal(s.stats.launched,0);
 tick(s,{extendedReload:true,fire:true},107);assert.equal(s.rifle.ammo,M);assert.ok(s.rifle.reload>0);
 tick(s);assert.equal(s.rifle.ammo,X);assert.equal(s.rifle.capacity,X);assert.equal(s.magazines.length,1);
 tick(s,{extendedReload:true});assert.equal(s.rifle.reload,0);assert.equal(s.magazines.length,1);
 tick(s,{fire:true});assert.equal(s.rifle.ammo,X-1);
 tick(s,{reload:true});assert.equal(s.magazines.at(-1).extended,true);tick(s,{},108);
 assert.equal(s.rifle.capacity,M);assert.equal(s.rifle.ammo,M);
 const remainingTicks=Math.ceil(s.rifle.extendedCooldown*60);tick(s,{},remainingTicks);
 tick(s,{extendedReload:true});assert.equal(s.rifle.reload,1.8);assert.equal(s.rifle.extendedCooldown,60);
 s.reset();assert.equal(s.rifle.capacity,M);assert.equal(s.rifle.extendedCooldown,0);
});
test('extended magazine works with shared ammo and Nominal overrides without changing Static',()=>{
 const s=make();s.dev.ammo=true;tick(s,{extendedReload:true});tick(s,{},108);assert.equal(s.rifle.ammo,X);
 tick(s,{fire:true},60);assert.equal(s.rifle.ammo,X);
 s.dev.extendedCooldown=true;s.dev.rifleInstantReload=true;tick(s,{extendedReload:true});assert.equal(s.rifle.reload,0);assert.equal(s.rifle.ammo,X);
 s.weapon='static';s.reset();tick(s,{extendedReload:true});assert.equal(s.rifle.capacity,M);assert.equal(s.rifle.extendedCooldown,0);
});
