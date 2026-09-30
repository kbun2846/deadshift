import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {Simulation} from '../src/simulation.js';import {tryIchorDeflect,ichorGuardFor} from '../src/weapons/ichor-deflect.js';import {makeIchor,poseIchor} from '../src/weapons/ichor-model.js';import {RiflePose} from '../src/weapons/rifle-pose.js';import {weaponGuarding,weaponAiming} from '../src/weapons/rifle-input.js';import {playerInput,playerState,loadout,applyLoadout} from '../src/net/protocol.js';
const map={id:'ichor-guard-test',width:40,depth:40,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]};
const make=()=>{const s=new Simulation(map);s.weapon='ichor';s.player.id='defender';return s;};
const run=(s,n=1,input={})=>{for(let i=0;i<n;i++)s.step({aimX:-1,aimZ:0,...input});};
const bullet={owner:'shooter',bullet:true,damage:5,damageType:'gunshot',vx:1,vz:0};
const proxy=s=>({...s.player,kind:'player',...ichorGuardFor(s)});
const raised=()=>{const s=make();run(s,1,{ichorGuard:true});s.ichor.guardStrength=10;return s;};
const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} ≉ ${b}`);

test('holding RMB or Shift raises the sword without enabling aim-in, blocks attacks and serializes its pose',()=>{
 assert.equal(weaponGuarding('ichor',true,new Set()),true);assert.equal(weaponGuarding('ichor',false,new Set(['ShiftLeft'])),true);assert.equal(weaponGuarding('rifle',true,new Set()),false);assert.equal(weaponAiming('ichor',true,new Set(['ShiftLeft'])),false);
 const s=raised();run(s,30,{ichorGuard:true,fire:true});assert.equal(s.ichor.guarding,true);assert.equal(s.ichor.serial,0);assert.equal(s.ichor.guardCooldown,0);assert.equal(playerInput({ichorGuard:1}).ichorGuard,true);assert.equal(playerState('defender',s.player).ichor.guarding,true);const other=make();applyLoadout(other,loadout(s));assert.equal(other.ichor.guarding,true);
});
test('each fresh guard charge rolls 8–12 capacity once; smaller bullets spend it and a large shot breaks through',t=>{
 for(const [roll,expected]of [[0,8],[.5,10],[.9999,12]]){t.mock.method(Math,'random',()=>roll);const s=make();run(s,1,{ichorGuard:true});assert.equal(s.ichor.guardStrength,expected);run(s,600,{ichorGuard:true});assert.equal(s.ichor.guardStrength,expected);assert.equal(s.ichor.guarding,true);assert.equal(s.ichor.guardCooldown,0);t.mock.restoreAll();}
 const d=raised(),s=new Simulation(map);s.player.id='shooter';const target=proxy(d);s.hit(target,{...bullet,damage:4});assert.equal(target.hp,100);assert.equal(d.ichor.guardStrength,6);s.hit(target,{...bullet,damage:16});assert.equal(target.hp,90);assert.equal(d.ichor.guardStrength,0);assert.equal(d.ichor.guarding,false);assert.equal(d.ichor.guardCooldown,20);assert.deepEqual(s.drainEvents().filter(e=>e.type==='ichorDeflect').map(e=>e.blocked),[4,6]);
});
test('only guard exhaustion starts twenty seconds, held input cannot re-arm, full blood does not speed this cooldown',()=>{
 const s=raised(),t=proxy(s);for(let i=0;i<4;i++)tryIchorDeflect(t,bullet,()=>0);assert.equal(s.ichor.guarding,false);assert.equal(s.ichor.guardCooldown,20);s.ichor.blood=100;run(s,60,{ichorGuard:true});assert.ok(Math.abs(s.ichor.guardCooldown-19)<1e-7);run(s,1140,{ichorGuard:true});assert.equal(s.ichor.guarding,false);run(s);run(s,1,{ichorGuard:true});assert.equal(s.ichor.guarding,true);run(s);assert.equal(s.ichor.guardCooldown,0);run(s,1,{ichorGuard:true});assert.equal(s.ichor.guarding,true);
});
test('Omen spends the shared damage capacity; curses, blasts, electricity and back shots bypass it',()=>{
 const s=raised(),t=proxy(s);for(const shot of [{...bullet,damageType:'omenCurse'},{...bullet,damageType:'omenBlast',blast:true},{...bullet,damageType:'sightlineBreach',blast:true},{...bullet,electric:true},{...bullet,vx:-1}])assert.equal(tryIchorDeflect(t,shot),null);assert.equal(s.ichor.guardShots,0);
 const shot={...bullet,damageType:'omenShot'};assert.ok(tryIchorDeflect(t,shot));assert.ok(tryIchorDeflect(t,shot));assert.equal(tryIchorDeflect(t,shot),null);assert.equal(s.ichor.guardCooldown,20);
});
test('a deflected primed Omen projectile never applies its curse',()=>{
 const defender=raised(),attacker=new Simulation(map);attacker.weapon='omen';attacker.player.id='shooter';defender.player.x=3;defender.player.z=.27;const t=proxy(defender);attacker.targets=[t];run(attacker,1,{aimX:1,omenPrime:true});run(attacker,1,{aimX:1,fire:true});run(attacker,30,{aimX:1});assert.equal(t.hp,100);assert.equal(attacker.omen.marks.length,0);assert.equal(defender.ichor.guardShots,1);assert.equal(attacker.drainEvents().filter(e=>e.type==='ichorDeflect').length,1);
});
test('Ballast catches individual pellets and leaves the remainder of the same shell damaging',()=>{
 const defender=raised();defender.player.x=1.6;const t=proxy(defender),s=new Simulation(map);s.weapon='shotgun';s.player.id='shooter';s.targets=[t];s.shotgunPellets=Array.from({length:8},()=>({x:.9,z:0,dx:1,dz:0,forwardX:1,forwardZ:0,travel:0,range:12,damage:4,volley:1,contactSample:0}));run(s,1,{aimX:1});const catches=s.drainEvents().filter(e=>e.type==='ichorDeflect').length;assert.equal(catches,3);near(100-t.hp,32-10);assert.equal(defender.ichor.guardShots,3);assert.equal(defender.ichor.guardCooldown,20);
});
test('multiple collision proxies share one guard budget, and regular blocked shots produce no damage credit',()=>{
 const d=raised(),a=proxy(d),b=proxy(d),s=new Simulation(map);s.player.id='shooter';for(const t of [a,b])s.hit(t,bullet);assert.equal(a.hp,100);assert.equal(b.hp,100);assert.equal(d.ichor.guardShots,2);assert.equal(s.stats.hits,0);assert.equal(s.drainEvents().filter(e=>e.type==='outgoingDamage').length,0);
});
test('E and X lower the guard; raising it can cancel a cut or Frenzy without refunding X',()=>{
 for(const key of ['ichorE','ichorX']){const s=raised();s.ichor.blood=100;run(s,1,{ichorGuard:true,[key]:true});assert.equal(s.ichor.guarding,false);assert.equal(s.ichor.guardCooldown,0);assert.ok(key==='ichorE'?s.ichorWaves.length:s.ichor.frenzy>0);}
 const s=make();run(s,1,{ichorX:true});run(s,1,{ichorGuard:true});assert.equal(s.ichor.frenzy,0);assert.equal(s.ichor.swing,0);assert.ok(s.ichor.xCooldown>49);s.resetWorld();assert.equal(s.ichor.guarding,false);run(s,1,{ichorGuard:true});s.killPlayer(null,'gunshot');assert.equal(s.ichor.guarding,false);assert.equal(s.ichor.guardCooldown,0);
});
test('blade blood is flush with both steel faces at every fill level and high guard keeps hands attached',()=>{
 const root=new THREE.Group(),body=new THREE.Group(),gun=new THREE.Group(),model=makeIchor();root.add(body);body.add(gun);gun.add(model);gun.position.set(.27,.74,-.46);root.userData={body,gun};const arms=new RiflePose(root),s=raised();
 for(const blood of [5,40,100]){for(let i=0;i<60;i++)poseIchor(model,{...s.ichor,blood},i/60);const blade=model.getObjectByName('ichor-blade'),coat=model.getObjectByName('ichor-blood-channel'),a=coat.geometry.getAttribute('position');assert.equal(coat.position.length(),0);assert.deepEqual(coat.scale.toArray(),[1,1,1]);for(let i=0;i<coat.geometry.drawRange.count;i++){assert.ok(Math.abs(a.getY(i)-.026)<1e-7||Math.abs(a.getY(i)+.008)<1e-7);assert.ok(a.getX(i)>=-.058&&a.getX(i)<=.048);assert.ok(a.getZ(i)<-.16&&a.getZ(i)>-1.63);}arms.update(s,0,0,0);blade.updateMatrix();for(const arm of arms.arms){const expected=new THREE.Vector3(0,0,arm.side<0?.19:.025).applyMatrix4(blade.matrix).applyMatrix4(gun.matrix);assert.ok(arm.target.distanceTo(expected)<.01);assert.ok(arm.upper.scale.y<=.331&&arm.lower.scale.y<=.351);}}
});
test('normal cuts, Frenzy and E break gravestones above low stumps, but walls still protect breakables',()=>{
 for(const action of ['fire','ichorX','ichorE'])for(const wall of [false,true]){const s=new Simulation({...map,props:[{id:'stump',type:'headstoneStump',x:1.6,z:0},{id:'stone',type:'headstone',x:1.6,z:0},{id:'crate',type:'crate',x:0,z:1.5}]});s.weapon='ichor';s.ichor.blood=100;if(wall)s.colliders.push({x:.8,z:0,w:.2,d:3,height:2});run(s,1,{aimX:1,[action]:true});run(s,16,{aimX:1});assert.equal(s.props.find(p=>p.id==='stone').hp,wall?1:0);assert.equal(s.props.find(p=>p.id==='stump').hp,null);}
 const s=new Simulation({...map,props:[{type:'crate',x:1.6,z:0},{type:'barrel',x:0,z:1.7}]});s.weapon='ichor';s.ichor.blood=100;run(s,60,{aimX:1,fire:true});assert.equal(s.props[0].hp,0);run(s,60,{aimX:0,aimZ:1,fire:true});assert.equal(s.props[1].hp,0);
});

import {makeGunStains} from '../src/effects/blood-wading.js';
test('soaking an animated katana reuses its flush coating and never makes floating gun patches',()=>{
 const gun=new THREE.Group(),model=makeIchor();gun.add(model);const coat=model.getObjectByName('ichor-blood-channel'),count=gun.children.length,stains=makeGunStains(gun,'ichor');stains.set(1);
 for(const variant of [0,1,4,8]){poseIchor(model,{blood:0,swing:.1,duration:.24,variant,serial:variant+1},variant);assert.equal(coat.visible,true);assert.equal(coat.parent.name,'ichor-blade');assert.equal(coat.geometry.drawRange.count,156);assert.equal(gun.children.length,count);}
 stains.set(0);poseIchor(model,{blood:0},10);assert.equal(coat.visible,false);stains.set(1);stains.dispose();poseIchor(model,{blood:0},11);assert.equal(coat.visible,false);assert.equal(gun.children.length,count);
});
test('a rotated solid cart protects people and breakables from normal cuts and Frenzy',()=>{
 for(const frenzy of [false,true]){const s=new Simulation({...map,props:[{id:'cart',type:'oxCart',x:1.45,z:0,angle:Math.PI/2},{id:'crate',type:'crate',x:2.65,z:0}]});s.weapon='ichor';s.ichor.blood=100;const t={id:'victim',kind:'player',x:2.65,z:0,hp:400,maxHp:400};s.targets=[t];run(s,1,{aimX:1,aimZ:0,...(frenzy?{ichorX:true}:{tapFire:true})});run(s,frenzy?145:16,{aimX:1,aimZ:0});assert.equal(t.hp,400);assert.equal(s.props.find(p=>p.id==='crate').hp,1);}
});
test('breaking front cover does not damage a second breakable through it on the same cut',()=>{
 const s=new Simulation({...map,props:[{id:'front',type:'crate',x:1,z:0,angle:0},{id:'back',type:'crate',x:2.4,z:0,angle:0}]});s.weapon='ichor';s.ichor.blood=100;run(s,1,{aimX:1,tapFire:true});run(s,16,{aimX:1});assert.equal(s.props[0].hp,0);assert.equal(s.props[1].hp,1);run(s,1,{aimX:1,tapFire:true});run(s,16,{aimX:1});assert.equal(s.props[1].hp,0);
});

test('holding guard has no time limit, slows walking ten percent, and releasing preserves the same remaining charge',()=>{
 const normal=make(),guard=make();run(normal,120,{moveX:1});run(guard,120,{moveX:1,ichorGuard:true});assert.ok(Math.abs(guard.player.vx/normal.player.vx-.9)<1e-7);assert.equal(guard.ichor.guardCooldown,0);run(guard,1800,{ichorGuard:true});assert.equal(guard.ichor.guarding,true);const strength=guard.ichor.guardStrength;run(guard);assert.equal(guard.ichor.guardCooldown,0);run(guard,60);assert.equal(guard.ichor.guardCooldown,0);assert.equal(guard.ichor.guardStrength,strength);
});
test('direct player projectile path applies only the damage left after guard absorption',()=>{
 const s=raised();s.hitPlayerProjectile(-2,0,2,0,{...bullet,damage:20});assert.equal(s.player.hp,90);assert.equal(s.ichor.guardCooldown,20);assert.equal(s.ichor.guardStrength,0);
});

test('releasing and re-raising never rerolls or refills a partly spent charge; only exhaustion starts cooldown',()=>{
 const s=raised();tryIchorDeflect(proxy(s),{...bullet,damage:3.4});near(s.ichor.guardStrength,6.6);
 for(let i=0;i<5;i++){run(s);assert.equal(s.ichor.guardCooldown,0);run(s,1,{ichorGuard:true});near(s.ichor.guardStrength,6.6);assert.equal(s.ichor.guarding,true);}
 const restored=make();applyLoadout(restored,loadout(s));near(restored.ichor.guardStrength,6.6);
 tryIchorDeflect(proxy(s),{...bullet,damage:6.6});assert.equal(s.ichor.guardCooldown,20);run(s);run(s,1,{ichorGuard:true});assert.equal(s.ichor.guarding,false);run(s,1200);run(s,1,{ichorGuard:true});assert.ok(s.ichor.guardStrength>=8&&s.ichor.guardStrength<=12);assert.equal(s.ichor.guarding,true);
});
