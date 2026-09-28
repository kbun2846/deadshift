import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Simulation} from '../src/simulation.js';
import {RobotBrain} from '../src/bots/robot-brain.js';
import {NavGrid} from '../src/bots/nav-grid.js';
import {roomPlan} from '../src/bots/interior-tactics.js';
import {makeProfile} from '../src/bots/robot-profile.js';
import {roomShowsEntity} from '../src/render/vision-polygons.js';
import {roofFade} from '../src/world/roof-fade.js';
import {maps} from '../src/maps.js';
const building={id:'room',x:0,z:0,w:8,d:8,height:3,doorWidth:2.4,doors:['front']};
const map={id:'bot-interior-test',width:60,depth:60,spawn:{x:0,z:10},buildings:[building],props:[],fences:[],targets:[]};
const enemy=(x=0,z=2)=>({id:'enemy',x,z,vx:0,vz:-5,hp:500,maxHp:500,weapon:'rifle'});
function make(variant=map){const sim=new Simulation(variant);sim.weapon='rifle';Object.assign(sim.player,{aimX:0,aimZ:-1});const brain=new RobotBrain({sim,nav:new NavGrid(variant,sim.colliders),random:()=>.5,profile:makeProfile({skill:'normal',style:'balanced',random:()=>.5})});return {sim,brain};}
function observe(brain,e,extra={}){brain.time+=1/60;brain.sense(1/60,{enemies:[e],...extra});return brain.memory.get(e.id);}
function entry(brain){observe(brain,enemy(0,4.2));return observe(brain,enemy(0,3.8));}

test('an unseen indoor player does not create a location or building memory, including see-all and callouts',()=>{
 const {sim,brain}=make(),e=enemy();const m=observe(brain,e,{seeAll:true,intel:new Map([[e.id,{...e,by:'friend'}]])});
 assert.equal(m.visible,false);assert.equal(m.seen,-99);assert.equal(m.shelter,undefined);assert.equal(m.x,sim.player.x);assert.equal(m.z,sim.player.z);
 brain.think({enemies:[e]});assert.equal(brain.targetId,null);assert.equal(brain.mode,'patrol');
});

test('watching a doorway entry remembers only the entrance, never hidden movement',()=>{
 const {brain}=make();const m=entry(brain);assert.equal(m.shelter.buildingId,'room');assert.equal(m.visible,false);assert.equal(m.x,0);assert.equal(m.z,4);
 const snapshot={...m,shelter:{...m.shelter}};
 for(const [x,z] of [[2,1],[-2,-2],[3,3]])observe(brain,enemy(x,z),{intel:new Map([['enemy',{...enemy(x,z),by:'friend'}]])});
 assert.deepEqual(m,snapshot,'fresh hidden coordinates and callouts cannot move the remembered position');
});

test('disappearing elsewhere or moving alongside a door does not invent a room entry',()=>{
 for(const [x,vz] of [[3,-5],[0,0]]){const {brain}=make();observe(brain,{...enemy(x,4.2),vz});const m=observe(brain,enemy(2,1));assert.equal(m.shelter,undefined);}
});

test('same-room sight reacquires normally; an observed exit clears building memory',()=>{
 const {sim,brain}=make(),m=entry(brain);Object.assign(sim.player,{x:0,z:3});observe(brain,enemy(1,1));assert.equal(m.visible,true);assert.equal(m.x,1);assert.equal(m.room,'room');assert.equal(m.shelter,undefined);
 Object.assign(sim.player,{x:0,z:8});observe(brain,enemy(0,4.8));assert.equal(m.visible,true);assert.equal(m.room,null);assert.equal(m.shelter,undefined);
});

test('entry plans can push, wait, or probe and expire without new sightings',()=>{
 for(const [kind,aggr,rolls] of [['push',1,[0,.5]],['hold',0,[.9,.1,.5]],['probe',0,[.9,.9,.5]]]){
  const {sim,brain}=make(),m=entry(brain);brain.pf.aggr=aggr;brain.random=()=>rolls.shift()??.5;brain.mode='hunt';brain.targetId=m.id;
  const plan=roomPlan(brain,m);assert.equal(plan.kind,kind);assert.ok(plan.goal);assert.ok(brain.nav.path(sim.player.x,sim.player.z,plan.goal.x,plan.goal.z));
  if(kind==='push'){Object.assign(sim.player,{x:0,z:4.7});const next=roomPlan(brain,m);assert.equal(sim.buildingAt(next.goal.x,next.goal.z)?.id,'room');}
  else assert.equal(sim.buildingAt(plan.goal.x,plan.goal.z),null);
  brain.time+=11;assert.equal(roomPlan(brain,m),null);brain.reset();assert.equal(brain.roomPlan,null);
 }
});

test('probing aims at the entrance lane and has long pauses, with no blind abilities',()=>{
 const {sim,brain}=make(),m=entry(brain);Object.assign(sim.player,{x:0,z:6.5});brain.pf.aggr=0;brain.random=()=>.9;brain.targetId=m.id;brain.mode='hunt';roomPlan(brain,m);brain.acquiredAt=-20;brain.xAllowed=()=>false;
 let fired=0;const points=[];
 for(let i=0;i<300;i++){brain.time+=1/60;const input={};brain.aim(1/60,input,m);brain.aimOff=0;brain.act(1/60,input,m,{noises:[]});if(input.fire)fired++;points.push([brain.aimPoint.x,brain.aimPoint.z]);assert.ok(!input.grenade&&!input.surge);}
 assert.ok(fired>0&&fired<35,'occasional blind shots, not sustained tracking');assert.ok(points.every(p=>p[0]===0&&p[1]===1.5));
});

test('indoor firing has fewer attack frames for every loadout, while outdoor fights retain cadence',()=>{
 for(const weapon of ['rifle','shotgun','static','omen','sightline']){
  const count=inside=>{const {sim,brain}=make({...map,buildings:inside?[building]:[]});Object.assign(sim.player,{x:-2,z:0});sim.weapon=weapon;sim.dev.ammo=true;brain.xAllowed=()=>false;brain.acquiredAt=-20;const target={...enemy(2,0),vx:0,vz:0,visible:true,seen:0};let frames=0;
   for(let i=0;i<600;i++){Object.assign(sim.player,{x:-2,z:0,vx:0,vz:0});brain.time=i/60;brain.aimPoint={x:2,z:0};brain.aimOff=0;const input={aimX:1,aimZ:0,aimPointX:2,aimPointZ:0};brain.act(1/60,input,target,{noises:[]});if(input.fire||input.spray||input.launch||input.doubleShot)frames++;sim.step(input);}
   return frames;};
  const outdoors=count(false),indoors=count(true);assert.ok(indoors>0,weapon+' still fights');assert.ok(indoors<outdoors*.75,`${weapon}: ${indoors} indoors / ${outdoors} outdoors`);
 }
});

test('the south woodshed hides its occupant and cannot open a position-revealing roof patch',()=>{
 const sim=new Simulation(maps['hollow-wick']),shed=sim.map.buildings.find(b=>b.id==='woodshed');assert.ok(shed?.open);
 const target={x:shed.x,z:shed.z};Object.assign(sim.player,{x:shed.x+8,z:shed.z+8});assert.equal(roomShowsEntity(sim,target),false);
 const player=new THREE.Group(),root=new THREE.Group(),scene=new THREE.Group();player.position.set(sim.player.x,0,sim.player.z);root.position.set(target.x,shed.baseY||0,target.z);scene.add(root);
 const view={player,map:sim.map,remote:{avatars:new Map([['enemy',{root}]])}};const fade=roofFade(view);fade.refresh();assert.equal(fade.count.value,1,'only the outdoor observer opens a patch');
 Object.assign(sim.player,target);assert.equal(roomShowsEntity(sim,target),true,'entering yourself reveals the occupant');
 assert.equal(roomShowsEntity(sim,{x:shed.x+8,z:shed.z+8}),true,'outside bodies retain normal visibility rules');
});
