import test from 'node:test';import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';import {ICHOR,ichorOnTrail} from '../src/weapons/ichor.js';import {BotMatch} from '../src/bots/bot-match.js';import {maps} from '../src/maps.js';import {playerInput,loadout,applyLoadout,playerState} from '../src/net/protocol.js';import {deathReaction} from '../src/effects/death-reactions.js';
const map={id:'ichor-test',width:70,depth:70,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]};
const make=(blood=0)=>{const s=new Simulation(map);s.weapon='ichor';s.player.id='you';s.ichor.blood=blood;return s;};
const target=(kind='player',x=1.6,z=0)=>({id:'victim',kind,x,z,baseX:x,spawnX:x,spawnZ:z,hp:400,maxHp:400,flash:0,respawn:0});
const near=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<eps,`${a} ≉ ${b}`);
const run=(s,n,input={})=>{for(let i=0;i<n;i++)s.step({aimX:1,aimZ:0,...input});};
test('base slash contact is delayed, tap lands once, and holding repeats the same forms',()=>{
 for(const blood of [0,100]){const s=make(blood),t=target();s.targets=[t];run(s,1,{fire:true});assert.equal(t.hp,400);run(s,3);assert.equal(t.hp,400);run(s,40);near(t.hp,400-(blood?17:6));assert.equal(s.drainEvents().filter(e=>e.type==='ichorSwing').length,1);}
 const held=make(),tapped=make();for(let i=0;i<120;i++){run(held,1,{fire:true});run(tapped,1,{tapFire:i%15===0});}
 const forms=s=>s.drainEvents().filter(e=>e.type==='ichorSwing').map(e=>e.variant);assert.deepEqual(forms(held),forms(tapped));assert.equal(held.ichor.blood,0);
 const count=held.ichor.serial;run(held,60);assert.equal(held.ichor.serial,count);
});
test('Frenzy lands twelve timed hits across 2.4 seconds, snapshots damage, costs 16 and never heals',()=>{for(const blood of [0,100]){const s=make(blood),t=target();s.targets=[t];run(s,1,{ichorX:true});assert.equal(t.hp,400);let ticks=0;while(s.ichor.frenzy&&ticks++<180){const hp=s.player.hp;run(s,1);assert.ok(s.player.hp<=hp+1e-7,'no healing during Frenzy');}assert.ok(ticks>=143&&ticks<=145);const ev=s.drainEvents();assert.equal(ev.filter(e=>e.type==='ichorSwing').length,12);assert.equal(ev.filter(e=>e.type==='hit').length,12);near(400-t.hp,blood?ICHOR.frenzyMax:ICHOR.frenzyDamage);/* 66 / 180 since the 2026-09-30 balance pass (36 / 108) */assert.ok(Math.abs(s.player.hp-84)<.01,s.player.hp);assert.ok(s.ichor.blood>blood||blood===100);assert.ok(s.ichor.xCooldown>47);}});
test('Frenzy has light collateral, never heals and stops at .2 health (the old one-point floor)',()=>{const s=make(100),a=target(),b={...target('player',1.6,.2),id:'other'};s.targets=[a,b];run(s,1,{ichorX:true});run(s,145);near(400-a.hp,ICHOR.frenzyMax);assert.ok(400-b.hp<=ICHOR.frenzyMax*ICHOR.splash+.01);const low=make();low.player.hp=.6;run(low,1,{ichorX:true});run(low,20);near(low.player.hp,.2);assert.equal(low.ichor.frenzy,0);});
test('cuts respect solid cover, height and friends',()=>{for(const mode of ['wall','height','ally']){const s=make(100),t=target();s.targets=[t];if(mode==='wall')s.colliders=[{x:.8,z:0,w:.2,d:3}];if(mode==='height'){const stand=s.standY.bind(s);s.standY=p=>p===t?4:stand(p);}if(mode==='ally')t.friendly=true;run(s,1,{fire:true});run(s,30);assert.equal(t.hp,400,mode);}});
test('E is a growing travelling wave, one roll per target, never a hitscan or repeated tick',()=>{const s=make(50),t=target('player',8);s.targets=[t];run(s,1,{ichorE:true});assert.equal(t.hp,400);assert.equal(s.ichorWaves.length,1);run(s,80);assert.ok(400-t.hp>=ICHOR.waveDamage-ICHOR.waveRoll-1e-9&&400-t.hp<=ICHOR.waveDamage+ICHOR.waveRoll+1e-9);assert.equal(s.drainEvents().filter(e=>e.type==='hit').length,1);assert.equal(s.ichorWaves.length,0);assert.ok(s.ichor.eCooldown>4);});
test('max blood leaves a cosmetic human trail, robots never drip, no DOT',()=>{for(const kind of ['player','robot']){const s=make(100),t=target(kind);s.targets=[t];run(s,1,{fire:true});run(s,30);const hp=t.hp;assert.equal(s.ichorBleeds.length,kind==='player'?1:0);run(s,120);assert.equal(t.hp,hp);if(kind==='player'){assert.ok(s.ichorTrails.length);s.player.x=t.x;assert.ok(ichorOnTrail(s));}else assert.equal(s.ichorTrails.length,0);run(s,1200);assert.equal(s.ichorBleeds.length,0);}});
test('blood builds only on hits, decays after idle, death and map reset clean active attacks',()=>{const s=make();run(s,1,{fire:true});run(s,30);assert.equal(s.ichor.blood,0);s.ichor.blood=60;run(s,600);assert.ok(s.ichor.blood<60);run(s,1,{ichorE:true});s.killPlayer(null,'ichorSlash');assert.equal(s.ichorWaves.length,0);assert.equal(s.player.ichor,undefined);s.resetWorld();assert.equal(s.ichorTrails.length,0);});
test('Ichor has two slightly slower dashes, no aiming/reloading, serializable loadout and explicit deaths',()=>{const s=make();assert.equal(s.maxStamina,2);assert.ok(s.staminaRate<1);run(s,1,{reload:true,aiming:true});assert.equal(s.ichor.reload,undefined);assert.equal(playerInput({ichorX:1,ichorE:1}).ichorX,true);const other=make();s.ichor.blood=73;applyLoadout(other,loadout(s));assert.equal(other.ichor.blood,73);assert.ok(playerState('you',s.player).ichor);for(const type of ['ichorSlash','ichorWave','ichorFrenzy'])assert.deepEqual(deathReaction(type),{mode:'scatter',organs:true});});
test('human practice bots use player damage and avatar slots, ordinary robots remain metal',()=>{const s=new Simulation(maps.deadwater);s.player.id='you';const bots=new BotMatch(maps.deadwater,{createSim:m=>new Simulation(m),random:()=>.3});const human=bots.spawn(s,'ichor',{human:true}),robot=bots.spawn(s,'rifle');assert.ok(human.slot<100);assert.ok(robot.slot>=100);bots.before(s);assert.equal(s.targets.find(t=>t.id===human.id).kind,'player');assert.equal(s.targets.find(t=>t.id===robot.id).kind,'robot');const t=s.targets.find(t=>t.id===human.id);s.hit(t,{owner:'you',damage:t.hp,damageType:'ichorSlash',vx:1});bots.after(s);bots.step(s);const death=bots.drain().find(e=>e.e.type==='playerDeath'&&e.slot===human.slot);assert.equal(death.e.damageType,'ichorSlash');assert.equal(death.e.weapon,'ichor');assert.equal(bots.others()[0].robot,true);});

import * as THREE from 'three';import {makeIchor,poseIchor} from '../src/weapons/ichor-model.js';import {IchorView} from '../src/weapons/ichor-view.js';import {RiflePose} from '../src/weapons/rifle-pose.js';import {DeathView} from '../src/effects/death-view.js';import {GoreBurst} from '../src/effects/gore.js';import {Arena} from '../src/net/arena.js';import {ProjectileMirror,pack,drawSim} from '../src/net/projectiles.js';
test('katana grip stays within natural arm lengths during every cut and spin',()=>{const p=new THREE.Group(),body=new THREE.Group(),gun=new THREE.Group(),blade=makeIchor();gun.position.set(.27,.74,-.46);gun.add(blade);body.add(gun);p.add(body);p.userData={body,gun};const arms=new RiflePose(p),s=make();for(let variant=0;variant<10;variant++)for(let i=0;i<10;i++){const state={variant,duration:.3,swing:.3-i*.03};poseIchor(blade,state,1);arms.update(s,0,0,0);for(const a of arms.arms){assert.ok(a.upper.scale.y<=.33001);assert.ok(a.lower.scale.y<=.35001);}}});
test('Ichor deaths carry organs, keep the dropped blade and dispose all temporary geometry',()=>{for(const type of ['ichorSlash','ichorWave','ichorFrenzy']){const p=new THREE.Group(),gun=makeIchor();p.add(gun);p.userData.gun=gun;p.add(new THREE.Mesh(new THREE.BoxGeometry(.3,1,.3),new THREE.MeshLambertMaterial()));const scene=new THREE.Scene();scene.add(p);const death=new DeathView({player:p,scene,qualityName:'performance'});death.start({damageType:type,x:0,z:0,aimX:1,aimZ:0,directionX:1,directionZ:0});assert.ok(death.gun.children.length);assert.ok(death.gore.organBank);death.update(3);death.clear();assert.equal(scene.children.length,1);assert.ok(p.visible);}});
test('colored robot sparks exist on Potato and effect reset clears their instances',()=>{const s=make(),p=new THREE.Group();p.userData={gun:new THREE.Group(),body:new THREE.Group()};p.add(p.userData.gun);const view={player:p,scene:new THREE.Scene(),qualityName:'potato',ground:s.ground,gy:()=>0,lastSim:s,rifleView:{pose:{update(){}}},burst(){},remotePlayers:[]};const fx=new IchorView(view);fx.hit({type:'hit',targetKind:'robot',x:2,z:0,damageType:'ichorSlash',directionX:1,bloodLevel:1});assert.ok(fx.sparks.length>=6);assert.equal(new Set(fx.sparks.map(s=>s.color.getHexString())).size,2);fx.update(s,.05);assert.ok(fx.lines.count);fx.clear();assert.ok(fx.meshes.every(m=>m.count===0));assert.equal(fx.sparks.length,0);});
test('Ichor wave mirror keeps unique IDs and host-applied deaths preserve their type',()=>{const s=make(50);run(s,1,{ichorE:true});const mirror=new ProjectileMirror();mirror.update({0:pack(s),1:pack(s)},0);const foreign=mirror.lists(.01);assert.equal(foreign.ichorWaves.length,2);assert.equal(new Set(foreign.ichorWaves.map(w=>w.id)).size,2);assert.equal(drawSim(s,foreign).ichorWaves.length,3);
 const a=new Arena({map,createSim:m=>new Simulation(m),settings:{robots:'off'}}),one=a.addSeat('one','One'),two=a.addSeat('two','Two');for(const [i,seat]of [one,two].entries()){seat.present=true;seat.sim.respawn({x:i*1.6,z:0},seat.id);seat.sim.weapon='ichor';}two.sim.player.hp=4;
 for(let i=0;i<12;i++){a.before(one);one.sim.step({aimX:1,aimZ:0,fire:i===0});a.after(one);}assert.equal(two.sim.player.dead,true);assert.equal(two.sim.events.find(e=>e.type==='playerDeath').damageType,'ichorSlash');
});

// Check the delivered hit events: these are consumed by blood, gore and remote players.
test('every base attack is a cross-body slash and opposite sweeps reverse blood direction',()=>{
 for(const [index,previous,sign]of [[0,1,-1],[1,0,1],[2,0,1],[3,1,-1]]){const s=make();Object.assign(s.ichor,{serial:1,normalIndex:index,variant:previous});s.targets=[target()];run(s,1,{fire:true});run(s,6);const hit=s.drainEvents().find(e=>e.type==='hit');assert.ok(hit.directionZ*sign>.9);assert.ok(hit.directionX>0&&hit.directionX<.3);}
 const spin=make();spin.targets=[target('player',1.6,0),{...target('player',-1.6,0),id:'behind'}];run(spin,1,{ichorX:true});run(spin,100);const hits=spin.drainEvents().filter(e=>e.type==='hit'&&Math.abs(e.directionX)<.01);assert.ok(hits.some(e=>e.directionZ>.99));assert.ok(hits.some(e=>e.directionZ<-.99));
});
test('slash ribbons stay finite and capped, then fully disappear on expiry and reset',()=>{
 const s=make(),p=new THREE.Group();p.userData={gun:new THREE.Group(),body:new THREE.Group()};p.add(p.userData.gun);
 const view={player:p,scene:new THREE.Scene(),qualityName:'potato',ground:s.ground,gy:()=>0,lastSim:s,rifleView:{pose:{update(){}}},remotePlayers:[]};const fx=new IchorView(view);
 for(let i=0;i<30;i++)fx.event({type:'ichorSwing',x:0,z:0,dx:1,dz:0,variant:i%6,power:1,duration:.2});
 fx.update(s,.1);const g=fx.ribbons.geometry;assert.ok(g.drawRange.count>0);assert.ok(g.drawRange.count<=g.attributes.position.count);
 for(const n of g.attributes.position.array.subarray(0,g.drawRange.count*3))assert.ok(Number.isFinite(n));
 fx.update(s,.4);assert.equal(g.drawRange.count,0);assert.equal(fx.ribbons.visible,false);
 fx.event({type:'ichorSwing',x:0,z:0,dx:1,dz:0,variant:0,power:0,duration:.3});fx.update(s,.1);assert.ok(g.drawRange.count>0);fx.clear();assert.equal(g.drawRange.count,0);
});

test('dash slash works during a dodge or the short landing window, adds 15 percent, then expires',()=>{
 for(const grace of [0,.1,.4]){const s=make(),t=target();s.targets=[t];s.player.dodgeRemaining=.01;run(s,1);run(s,Math.round(grace*60));s.player.x=0;s.player.z=0;s.player.vx=s.player.vz=0;run(s,1,{fire:true});run(s,8);assert.equal(s.ichor.variant,grace<.24?6:0);assert.ok(Math.abs((400-t.hp)-(grace<.24?6.9:6))<.001);}
 const mid=make();mid.player.stamina=2;run(mid,1,{dodge:true,moveX:1,fire:true});assert.equal(mid.ichor.variant,6);assert.ok(mid.player.dodgeRemaining>0);
});
test('full blood speeds only E/X recharge, grants five percent movement and stacks with passive trails',()=>{
 const full=make(100),empty=make();for(const s of [full,empty]){s.ichor.eCooldown=24;s.ichor.xCooldown=50;s.ichor.cooldown=1;}run(full,30,{moveZ:1});run(empty,30,{moveZ:1});assert.ok(Math.abs(full.ichor.eCooldown-23.4)<1e-7);assert.ok(Math.abs(full.ichor.xCooldown-49.4)<1e-7);assert.equal(full.ichor.cooldown,empty.ichor.cooldown);assert.ok(Math.abs(full.player.z/empty.player.z-1.05)<.001);
 full.ichor.blood=99;const before=full.ichor.eCooldown;run(full,30);assert.ok(Math.abs(before-full.ichor.eCooldown-.5)<1e-7);
 const wave=make(50);run(wave,1,{ichorE:true});run(wave,30);assert.ok(wave.ichorTrails.length>0);const trail=wave.ichorTrails[0];wave.player.x=trail.x;wave.player.z=trail.z;assert.equal(ichorOnTrail(wave),true);
});
test('Frenzy follows WASD faster without forcing movement when no direction is held',()=>{
 const fast=make(),walk=make();run(fast,1,{ichorX:true});run(fast,45,{moveZ:-1});run(walk,45,{moveZ:-1});assert.ok(fast.player.z<walk.player.z*1.2);assert.ok(Math.abs(fast.player.x)<.01);const still=make();run(still,1,{ichorX:true});run(still,90);assert.ok(Math.hypot(still.player.x,still.player.z)<.01);
});
test('both palms stay on the grip through movement, reversals, spins and dash cuts',()=>{
 const p=new THREE.Group(),body=new THREE.Group(),gun=new THREE.Group(),blade=makeIchor();gun.position.set(.27,.74,-.46);gun.add(blade);body.add(gun);p.add(body);p.userData={body,gun};const arms=new RiflePose(p),s=make();let time=0,serial=0;
 for(const variant of [0,1,2,3,4,5,6,7,8,9])for(let i=0;i<24;i++){time+=1/120;const state={variant,serial,duration:.2,swing:.2-i/120,moving:1,moveSide:.7,moveForward:-.7};poseIchor(blade,state,time);arms.update(s,0,0,0);const model=blade.getObjectByName('ichor-blade');model.updateMatrix();for(const a of arms.arms){const expected=new THREE.Vector3(0,0,a.side<0?.19:.025).applyMatrix4(model.matrix).applyMatrix4(gun.matrix);assert.ok(a.target.distanceTo(expected)<.01,'hands must not detach to satisfy reach');assert.ok(a.upper.scale.y<=.33001);assert.ok(a.lower.scale.y<=.35001);}if(i===23)serial++;}
});


test('blood arc spray stays on its bridge level, is bounded, expires and clears',()=>{
 const s=make(),p=new THREE.Group();p.userData={gun:new THREE.Group(),body:new THREE.Group()};p.add(p.userData.gun);
 const view={player:p,scene:new THREE.Scene(),qualityName:'potato',ground:{flat:false,heightAt:()=>4,drawnHeightAt:()=>0},lastSim:s,rifleView:{pose:{update(){}}},remotePlayers:[]},fx=new IchorView(view);
 fx.bloodSpray(0,0,.7,1,0,180,true);assert.equal(fx.bloodMotes.length,128);assert.ok(fx.bloodMotes.every(m=>m.below));fx.update(s,.1);
 const matrix=new THREE.Matrix4();fx.lines.getMatrixAt(0,matrix);assert.ok(matrix.elements[13]<2,'under-bridge droplets must not jump onto the deck');
 fx.update(s,1);assert.equal(fx.bloodMotes.length,0);assert.equal(fx.lines.count,0);fx.bloodSpray(0,0,.7,1,0,3);fx.clear();assert.equal(fx.bloodMotes.length,0);assert.equal(fx.waveTrail.size,0);
});


import {ichorBloodGain} from '../src/weapons/ichor.js';
test('blood gain varies within slower bounds, requires contact and caps at full',()=>{
 for(const [type,low,mid,high]of [['ichorSlash',6.5,7.5,8.5],['ichorFrenzy',6.5,7.5,8.5],['ichorWave',11.5,13,14.5]]){
  assert.equal(ichorBloodGain(type,()=>0),low);assert.equal(ichorBloodGain(type,()=>.5),mid);assert.equal(ichorBloodGain(type,()=>1),high);
 }
 const s=make(),t=target();s.targets=[t];run(s,1,{fire:true});assert.equal(s.ichor.blood,0);run(s,8);assert.ok(s.ichor.blood>=6.5&&s.ichor.blood<=8.5);
 const full=make(99);full.targets=[target()];run(full,1,{fire:true});run(full,8);assert.equal(full.ichor.blood,100);
});
