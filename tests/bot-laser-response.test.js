import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {RobotBrain} from '../src/bots/robot-brain.js';
import {NavGrid} from '../src/bots/nav-grid.js';
import {makeProfile} from '../src/bots/robot-profile.js';
import {laserThreatens,respondToLaser,sniperLineClear} from '../src/bots/laser-response.js';
const map={id:'laser-test',width:60,depth:60,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]};
const source=()=>({id:'sniper',x:14,z:.4,aimX:-1,aimZ:0,vx:0,vz:0,hp:500,maxHp:500,weapon:'sightline',visible:true,seen:0,sightline:{crouched:true,aiming:true,rifleAmmo:1,aimReach:20}});
function make(aggr=.1,colliders=[]){const sim=new Simulation(map);sim.weapon='rifle';sim.colliders=colliders;Object.assign(sim.player,{aimX:1,aimZ:0});const brain=new RobotBrain({sim,nav:new NavGrid(map,colliders),random:()=>.1,profile:makeProfile({skill:'normal',style:'balanced',random:()=>.5})});brain.pf.aggr=aggr;const enemy=source();brain.memory.set(enemy.id,enemy);return {sim,brain,enemy};}
function notice(brain){assert.equal(respondToLaser(brain),null);brain.time=brain.laserResponse.readyAt+.01;return respondToLaser(brain);}

test('laser warning requires a loaded visible scoped rifle, a beam reaching the bot, and unobstructed height',()=>{
 const {sim,enemy}=make();assert.equal(laserThreatens(sim,enemy),true);
 for(const patch of [{rifleAmmo:0},{aiming:false},{crouched:false},{rifleReload:2},{xLoading:true},{commit:.1},{aimBlocked:true},{aimReach:7}])assert.equal(laserThreatens(sim,{...enemy,sightline:{...enemy.sightline,...patch}}),false,JSON.stringify(patch));
 assert.equal(laserThreatens(sim,{...enemy,visible:false}),false);assert.equal(laserThreatens(sim,{...enemy,aimX:0,aimZ:1}),false);
 sim.colliders=[{x:7,z:0,w:1,d:4,height:3}];assert.equal(laserThreatens(sim,enemy),false);
 sim.colliders=[{x:7,z:0,w:1,d:4,height:.6},{x:9,z:0,w:1,d:4,height:3,destructible:true}];assert.equal(laserThreatens(sim,enemy),true);
 sim.ground={flat:false,heightAt:()=>0,drawnHeightAt:()=>0,deckAt:()=>-1};Object.assign(sim.player,{below:true});sim.ground.drawnHeightAt=x=>x<2?-3:0;assert.equal(laserThreatens(sim,enemy),false,'an elevated beam passing over the bot is no threat');
});

test('a normal bot takes time to notice, then sidesteps if no cover exists; it does not reroll each frame',()=>{
 const {brain,sim}=make(),response=notice(brain);assert.equal(response.kind,'evade');assert.ok(response.readyAt>=.18);assert.ok(Math.abs(response.goal.z)>2);
 const goal=response.goal,until=response.until;for(let i=0;i<10;i++){brain.time+=.05;const next=respondToLaser(brain);assert.equal(next.goal,goal);assert.equal(next.until,until);}
 assert.ok(brain.nav.walkable(sim.player.x,sim.player.z,goal.x,goal.z));brain.reset();assert.equal(brain.laserResponse,null);
});

test('cautious and wounded bots choose real solid cover; low or destructible props are not sniper cover',()=>{
 const wall={x:3,z:2,w:1,d:2,height:3};
 for(const [aggr,hp] of [[.1,500],[.95,100]]){const {brain,sim,enemy}=make(aggr,[wall]);sim.player.hp=hp;const response=notice(brain);assert.equal(response.kind,'cover');assert.equal(sniperLineClear(sim,enemy,response.goal.x,response.goal.z),false);assert.ok(brain.nav.path(0,0,response.goal.x,response.goal.z));}
 const {brain}=make(.1,[{...wall,destructible:true},{x:2,z:-2,w:1,d:2,height:.5}]);assert.equal(notice(brain).kind,'evade');
});

test('healthy aggressive bots charge diagonally but respect allies and treat Breach more cautiously',()=>{
 const {brain}=make(.95),response=notice(brain);assert.equal(response.kind,'charge');assert.ok(response.goal.x>2&&Math.abs(response.goal.z)>2);
 const hot=make(.95);hot.enemy.sightline.special=true;assert.equal(notice(hot.brain).kind,'evade');
 const ally=make(.95);ally.brain.leader={x:-9,z:0};const plan=notice(ally.brain);assert.ok(Math.hypot(plan.goal.x+9,plan.goal.z)<=12);
});

test('a beam from another observed enemy can interrupt an unrelated fight, while hidden shooters cannot',()=>{
 const {brain,enemy}=make(.95);brain.memory.set('near',{...source(),id:'near',weapon:'static',x:4,z:3,sightline:undefined});brain.targetId='near';brain.think({enemies:[]});assert.equal(brain.targetId,'near');
 brain.time=brain.laserResponse.readyAt+.01;brain.think({enemies:[]});assert.equal(brain.targetId,enemy.id);assert.equal(brain.mode,'charge');assert.ok(brain.goal);
 enemy.visible=false;brain.time+=.05;assert.equal(respondToLaser(brain),null);assert.equal(brain.laserResponse,null);
});

test('a complete brain moves out of the beam with normal inputs and spends real dodge stamina',()=>{
 const {brain,sim,enemy}=make(.95);let reacted=false,dodged=false;
 for(let i=0;i<100;i++){const input=brain.step(1/60,{enemies:[enemy]});if(brain.laserResponse?.kind)reacted=true;if(input.dodge)dodged=true;sim.step(input);sim.drainEvents();}
 assert.ok(reacted);assert.ok(dodged);assert.ok(sim.player.x>1);assert.ok(Math.abs(sim.player.z)>1);assert.ok(sim.player.stamina<sim.maxStamina);
});
