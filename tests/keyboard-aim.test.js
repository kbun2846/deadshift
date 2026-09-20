import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,RULES} from '../src/simulation.js';
const make=weapon=>{const sim=new Simulation({width:80,depth:80,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]});sim.weapon=weapon;sim.reset();return sim;};
test('arrow aim eases identically for every weapon, including focused fire',()=>{
 const traces=[];
 for(const weapon of ['static','rifle','shotgun'])for(const aiming of [false,true]){
  const sim=make(weapon),angles=[];
  for(let i=0;i<24;i++){sim.step({aimX:0,aimZ:-1,smoothAim:true,aiming});angles.push(Math.atan2(sim.player.aimZ,sim.player.aimX));}
  assert.ok(angles[0]<0&&angles[0]>-Math.PI/4);
  assert.ok(Math.abs(angles[17]+Math.PI/2)<.025);
  assert.ok(angles.every((a,i)=>a>=-Math.PI/2&&(i===0||a<angles[i-1])));
  traces.push(angles);
 }
 for(const trace of traces)assert.deepEqual(trace,traces[0]);
});
test('digital aim takes the short arc across angle wrap and remains valid on reversal',()=>{
 const sim=make('rifle');sim.player.aimX=Math.cos(3.1);sim.player.aimZ=Math.sin(3.1);
 sim.step({aimX:Math.cos(-3.1),aimZ:Math.sin(-3.1),smoothAim:true});
 assert.ok(sim.player.aimX<-.99);
 sim.player.aimX=1;sim.player.aimZ=0;sim.step({aimX:-1,aimZ:0,smoothAim:true});
 assert.ok(sim.player.aimX>-1&&Math.abs(sim.player.aimZ)>.1);
 assert.ok(Math.abs(Math.hypot(sim.player.aimX,sim.player.aimZ)-1)<1e-10);
});
test('mouse aim keeps its response and Static stream retains its turn limit',()=>{
 const sim=make('static');sim.step({aimX:0,aimZ:1});assert.ok(Math.abs(sim.player.aimZ-1)<1e-10);
 sim.player.aimX=1;sim.player.aimZ=0;sim.spray.active=true;
 sim.step({aimX:-1,aimZ:0,smoothAim:true,spray:true});
 assert.ok(Math.abs(Math.atan2(sim.player.aimZ,sim.player.aimX))<=RULES.sprayTurnRate*RULES.step+1e-10);
});
