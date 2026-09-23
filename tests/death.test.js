import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Simulation} from '../src/simulation.js';
import {DeathView,bloodPoolPattern} from '../src/death-view.js';
import {DEATH_MENU_DELAY} from '../src/death-screen.js';
const make=()=>new Simulation({width:40,depth:40,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]});
test('distinct lethal damage types drop the gun and preserve a fallen corpse without explosion scatter',()=>{
 for(const damageType of ['electric','fire','gunshot','unknown']){
  const player=new THREE.Group(),gun=new THREE.Group(),geometry=new THREE.BoxGeometry(.3,1,.3),material=new THREE.MeshBasicMaterial();
  player.add(new THREE.Mesh(geometry,material));gun.add(new THREE.Mesh(geometry,material));player.add(gun);player.userData.gun=gun;
  player.position.set(2,0,3);player.rotation.y=.7;
  const scene=new THREE.Scene();scene.add(player);const fx=new DeathView({player,scene,qualityName:'balanced'});
  let borrowedDisposed=false;geometry.addEventListener('dispose',()=>{borrowedDisposed=true;});
  fx.start({damageType,x:2,z:3,aimX:0,aimZ:1,directionX:1,directionZ:0});
  assert.ok(fx.corpse);assert.equal(fx.pool,null);assert.equal(fx.gun.children.length,1);
  assert.equal(fx.corpse.direction.x,1);assert.equal(fx.corpse.direction.z,0);
  fx.update(2);assert.equal(fx.gun.position.y,.12);
  if(damageType==='fire'){assert.equal(fx.corpse.body.visible,false);assert.ok(fx.corpse.skeleton.children.length>10);}
  if(damageType==='electric')assert.equal(fx.corpse.charMaterial.color.getHexString(),'272522');
  if(damageType==='gunshot')assert.equal(fx.corpse.reaction.headWound,true);
  fx.clear();assert.equal(scene.children.length,1);assert.equal(borrowedDisposed,false);assert.equal(player.visible,true);
  geometry.dispose();material.dispose();
 }
});
test('fatal projectiles and blasts preserve the direction away from their impact',()=>{
 const bullet=make();bullet.player.hp=1;
 bullet.hitPlayerProjectile(-2,0,2,0,{owner:'other',damage:20});
 const shotDeath=bullet.events.find(e=>e.type==='playerDeath');assert.equal(shotDeath.directionX,1);assert.equal(shotDeath.directionZ,0);
 const orb=make();orb.player.hp=1;orb.explode({x:0,z:1,arrived:12},1);
 const orbDeath=orb.events.find(e=>e.type==='playerDeath');assert.equal(orbDeath.directionX,0);assert.equal(orbDeath.directionZ,-1);
 const grenade=make();grenade.weapon='rifle';grenade.player.hp=1;
 grenade.step({grenade:true,aimX:-1,aimZ:0,aimPointX:-1,aimPointZ:0});
 for(let i=0;i<110&&!grenade.player.dead;i++)grenade.step({});
 const grenadeDeath=grenade.events.find(e=>e.type==='playerDeath');assert.ok(grenadeDeath.directionX>.99);assert.ok(Math.abs(grenadeDeath.directionZ)<.01);
 const fire=make();fire.damagePlayer(500,'crop-fire',true);
 assert.equal(fire.events.find(e=>e.type==='playerDeath').directionX,0);
});
test('lethal overkill emits one death, stops movement and attacks, and reset restores the player',()=>{
 const sim=make();sim.player.hp=15;sim.damagePlayer(240,sim.player.id,false,true);
 assert.equal(sim.player.hp,0);assert.equal(sim.player.dead,true);assert.equal(sim.events.filter(e=>e.type==='playerDeath').length,1);
 sim.damagePlayer(99,'other');sim.step({moveX:1,seed:true,launch:true,spray:true,hex:true});
 assert.equal(sim.events.filter(e=>e.type==='playerDeath').length,1);assert.equal(sim.player.x,0);assert.equal(sim.shots.length,0);assert.equal(sim.hexOrbs.length,0);
 sim.reset();assert.equal(sim.player.dead,false);assert.equal(sim.player.hp,500);
 sim.player.hp=-.1;sim.step({});assert.equal(sim.player.hp,0);assert.equal(sim.player.dead,true);
});
test('five distinct pool profiles remain compact and the menu waits four seconds',()=>{
 const patterns=Array.from({length:5},(_,i)=>bloodPoolPattern(i));
 assert.equal(new Set(patterns.map(p=>JSON.stringify(p))).size,5);
 for(const p of patterns){assert.ok(p.width*1.6>1);assert.ok(p.lobes.every(l=>Math.hypot(l.x,l.z)+l.size<1.5));}
 assert.equal(DEATH_MENU_DELAY,4);
});
test('death drops a visible gun, spreads blood, lands particles and cleans resources on restart',()=>{
 const player=new THREE.Group(),gun=new THREE.Group(),material=new THREE.MeshBasicMaterial();
 const geometry=new THREE.BoxGeometry(.1,.1,.6);gun.add(new THREE.Mesh(geometry,material));gun.position.y=.8;player.add(gun);player.userData.gun=gun;
 const scene=new THREE.Scene();scene.add(player);const fx=new DeathView({player,scene,qualityName:'balanced'});
 fx.start({damageType:'explosion',x:0,z:0,aimX:1,aimZ:0});assert.equal(player.visible,false);assert.equal(fx.gun.children.length,1);
 fx.update(2);assert.ok(fx.pool.scale.x>1.5);assert.equal(fx.gun.position.y,.12);assert.equal(fx.drops.count,52);
 for(const [x,z]of [[1,0],[-1,0],[0,1],[0,-1]]){
  fx.start({damageType:'explosion',x:0,z:0,aimX:1,aimZ:0,directionX:x,directionZ:z});fx.update(2);
  assert.equal(fx.bones.children.filter(piece=>piece.userData.bone).length,8);
  assert.deepEqual(fx.bones.children.filter(piece=>piece.userData.remain).map(piece=>piece.userData.remain),['brain','intestines','hand']);
  assert.ok(fx.boneParticles.every(p=>p.vx*x+p.vz*z>0));
  assert.ok(fx.boneParticles.every(p=>Math.abs(p.model.position.y-p.floor)<1e-8));
  const mid=fx.cameraFrame();assert.ok(mid.height<29&&mid.height>29*.56);
  fx.update(2);const end=fx.cameraFrame();assert.ok(end.height<mid.height);assert.ok(end.x*x+end.z*z>.6);
  assert.ok(fx.particles.every(p=>p.vx*x+p.vz*z>0),'every drop travels away from the impact');
  fx.pool.updateMatrixWorld(true);
  const center=fx.pool.children[0].getWorldPosition(new THREE.Vector3());
  assert.ok(center.x*x+center.z*z>.5,'pool spreads away from the impact');
  const bounds=new THREE.Box3().setFromObject(fx.pool),axis=x?'x':'z',sign=x||z;
  assert.ok(sign>0?bounds.max[axis]>Math.abs(bounds.min[axis]):Math.abs(bounds.min[axis])>bounds.max[axis]);
 }
 fx.clear();assert.equal(player.visible,true);assert.equal(scene.children.length,1);assert.equal(fx.active,false);
 geometry.dispose();material.dispose();
});


test('every player death leaves blood on the floor: your own and other players online', async () => {
 const { readFileSync } = await import('node:fs');
 const { SPLAT_CAP } = await import('../src/blood-splatter.js');
 const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
 assert.ok(/e\.type==='playerDeath'\)\{this\.blood\.add\(/.test(renderer), 'your death splats');
 assert.ok(/e\.type === 'playerDeath'\) \{ this\.blood\.add\(/.test(renderer), 'other players\' deaths splat too');
 for (const [preset, cap] of Object.entries(SPLAT_CAP)) assert.ok(cap >= 6 && cap <= 20, preset);
 assert.ok(SPLAT_CAP.potato <= SPLAT_CAP.extreme, 'cheaper presets keep fewer');
});
