import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/simulation.js';
import {RobotBrain} from '../src/bots/robot-brain.js';
import {NavGrid} from '../src/bots/nav-grid.js';
import {makeProfile} from '../src/bots/robot-profile.js';
import {sniperSees,sniperClear,planSniper} from '../src/bots/sightline-tactics.js';
import {scopeActive} from '../src/weapons/sightline.js';
const map={id:'sniper-bot',width:90,depth:90,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]};
const enemy=(x=15,z=0)=>({id:'enemy',x,z,vx:0,vz:0,hp:500,maxHp:500,weapon:'rifle'});
function make(){const sim=new Simulation(map);sim.weapon='sightline';Object.assign(sim.player,{aimX:1,aimZ:0});const brain=new RobotBrain({sim,nav:new NavGrid(map,sim.colliders),random:()=>.5,profile:makeProfile({skill:'hard',style:'marksman',random:()=>.5})});brain.xAllowed=()=>false;return {sim,brain};}
function step(brain,enemies=[],extra={}){const input=brain.step(1/60,{enemies,...extra});brain.sim.step(input);return {input,events:brain.sim.drainEvents()};}

test('sniper plants to scan empty lanes, sweeps with pauses, then returns to travel',()=>{
 const {sim,brain}=make(),angles=[],modes=new Set();let shots=0;
 for(let i=0;i<1500;i++){const {events}=step(brain);modes.add(brain.sniper.mode);shots+=events.filter(e=>e.type==='sightlineShot').length;if(scopeActive(sim))angles.push(Math.atan2(sim.sightline.scopeZ,sim.sightline.scopeX));}
 assert.ok(modes.has('scan')&&modes.has('travel'));assert.ok(angles.length>120);assert.equal(shots,0);
 let moved=0,paused=0;for(let i=1;i<angles.length;i++){const change=Math.abs(Math.atan2(Math.sin(angles[i]-angles[i-1]),Math.cos(angles[i]-angles[i-1])));if(change>.0005&&change<.007)moved++;if(change<.0008)paused++;}
 assert.ok(moved>60,'gradual sweeps');assert.ok(paused>10,'pauses to inspect a lane');brain.reset();assert.equal(brain.sniper,null);
});

test('scoped perception has no rear proximity vision or tracking across its 45 degree boundary',()=>{
 const {sim,brain}=make();sim.sightline.crouched=true;sim.sightline.aiming=true;sim.sightline.scopeX=1;sim.sightline.scopeZ=0;sim.player.sightline={scopeX:1,scopeZ:0};
 assert.equal(sniperSees(sim,enemy(20,0)),true);assert.equal(sniperSees(sim,enemy(0,3)),false);assert.equal(sniperSees(sim,enemy(-2,0)),false);assert.equal(sniperSees(sim,enemy(15,8)),false);
 brain.time=1;brain.sense(1/60,{enemies:[enemy(15,0)]});brain.time+=1/60;brain.sense(1/60,{enemies:[enemy(12,12)]});const m=brain.memory.get('enemy');assert.equal(m.visible,false);assert.equal(m.x,15);assert.equal(m.z,0);
});

test('tracking waits for setup and scope, leads by commitment and flight, and fires a physical round',()=>{
 const {sim,brain}=make();let shotTime=0,scoped=false;const e=enemy(15,0);
 for(let i=0;i<400;i++){const {events}=step(brain,[e]);if(scopeActive(sim))scoped=true;if(events.some(v=>v.type==='sightlineShot'&&!v.pistol)){shotTime=sim.time;break;}}
 assert.ok(scoped);assert.ok(shotTime>1.33&&shotTime<5,`shot at ${shotTime}`);
 brain.aimError={x:0,z:0};brain.pf.shake=brain.pf.miss=0;brain.pf.lead=1;brain.sniper.mode='track';sim.sightline.crouched=true;brain.aim(1/60,{}, {...e,vx:0,vz:4,visible:true});
 assert.ok(Math.abs(brain.aimPoint.z-4*(15/114+.16))<.01,'accounts for the locked .16-second firing delay');
});

test('a lost sniper target triggers only a remembered lane scan, and close pressure returns Sidekick',()=>{
 const {sim,brain}=make();for(let i=0;i<110;i++)step(brain,[enemy()]);
 sim.sightline.rifleAmmo=1;sim.sightline.commit=0;const m=brain.memory.get('enemy');m.visible=false;m.seen=brain.time;brain.sniper.mode='track';brain.mode='hunt';planSniper(brain,1/60,m,{enemies:[]});assert.equal(brain.sniper.mode,'scan');
 const centre=brain.sniper.centre;planSniper(brain,1/60,m,{enemies:[enemy(35,-25)]});assert.equal(brain.sniper.centre,centre,'hidden live body never guides the scan');
 const close={...enemy(3,0),visible:true,seen:brain.time};planSniper(brain,1/60,close,{});const input={};brain.sightline(input,close,3,true,true);assert.equal(brain.sniper.want,false);assert.equal(input.sightlineStance,true);
});

test('snipers use passable low and breakable cover correctly but never shoot through a solid wall',()=>{
 const {sim,brain}=make();sim.colliders=[{x:6,z:0,w:1,d:2,height:.8},{x:9,z:0,w:1,d:2,height:2,destructible:true}];assert.equal(sniperClear(brain,15,0),true);
 sim.colliders=[...sim.colliders,{x:11,z:0,w:1,d:2,height:3}];assert.equal(sniperClear(brain,15,0),false);
});

test('interiors and crops prevent sniper scans, and an empty rifle is reloaded using normal stance inputs',()=>{
 const {sim,brain}=make();brain.time=20;planSniper(brain,1/60,null,{});brain.sniper.nextScan=0;sim.buildingAt=()=>({id:'room'});planSniper(brain,1/60,null,{});assert.equal(brain.sniper.want,false);
 sim.buildingAt=()=>null;brain.sniper.moveUntil=0;sim.sightline.rifleAmmo=0;brain.mode='patrol';let loaded=false;
 for(let i=0;i<400;i++){step(brain);if(sim.sightline.rifleAmmo===1){loaded=true;break;}}
 assert.ok(loaded,'completed full ordinary crouched reload');
});
