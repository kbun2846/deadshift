import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Simulation} from '../src/simulation.js';
import {DeathView} from '../src/effects/death-view.js';
import {shotgunPelletContact} from '../src/weapons/shotgun.js';
const make=()=>new Simulation({width:40,depth:40,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]});
test('every Ballast kill is the headless death, however the damage built up',()=>{
 for(const [first,delay,owner,expected]of [[500,0,'a',true],[300,.05,'a',true],[300,.6,'a',true],[300,.05,'b',true],[100,.05,'a',true]]){
  const s=make();if(first===100)s.player.hp=200;
  s.damagePlayer(first,'a',false,false,{x:1,z:0},'ballast');s.time+=delay;
  if(!s.player.dead)s.damagePlayer(s.player.hp,owner,false,false,{x:1,z:0},'ballast');
  assert.equal(s.events.find(e=>e.type==='playerDeath').damageType,expected?'ballastFatal':'ballast');
 }
 const s=make();s.damagePlayer(500,'a',false,false,{x:1,z:0},'gunshot');assert.equal(s.events.find(e=>e.type==='playerDeath').damageType,'gunshot');
});
test('headless knee death removes head, drops gun, splatters forward and cleans up',()=>{
 const scene=new THREE.Scene(),player=new THREE.Group(),gun=new THREE.Group(),geo=new THREE.BoxGeometry(.2,.2,.2),mat=new THREE.MeshBasicMaterial();
 const torso=new THREE.Mesh(geo,mat),head=new THREE.Mesh(geo,mat);head.userData.deathPart='head';player.add(torso,head,gun);gun.add(new THREE.Mesh(geo,mat));player.userData.gun=gun;scene.add(player);
 const fx=new DeathView({scene,player,qualityName:'balanced'});fx.start({x:0,z:0,aimX:1,aimZ:0,directionX:1,directionZ:0,damageType:'ballastFatal'});
 assert.equal(fx.corpse.body.children.filter(n=>n.isMesh).length,1);assert.equal(fx.gun.children.length,1);
 fx.update(1.5);assert.equal(fx.corpse.body.position.y,-.12);assert.equal(fx.corpse.blood.legs.children.length,4);assert.ok(fx.corpse.blood.fragments.every(p=>p.vx>0));assert.ok(fx.corpse.blood.pool.scale.x>1);assert.ok(fx.corpse.blood.streaks.every(s=>s.scale.y>0));
 fx.clear();assert.equal(scene.children.length,1);assert.equal(player.visible,true);geo.dispose();mat.dispose();
});
test('heavy close hits need a tighter center, with an independent point-blank contact chance',()=>{
 const b={x:0,z:0,dx:1,dz:0,travel:.3,range:9,charge:1,contactSample:.5};
 assert.equal(shotgunPelletContact(b,{x:1,z:0}),1);assert.equal(shotgunPelletContact(b,{x:1,z:.4}),.55);
 assert.equal(shotgunPelletContact({...b,contactSample:.95},{x:1,z:0}),.55);
 assert.equal(shotgunPelletContact({...b,travel:4},{x:4,z:.4}),1);
 assert.equal(shotgunPelletContact({...b,charge:0},{x:1,z:.4}),1);
});
