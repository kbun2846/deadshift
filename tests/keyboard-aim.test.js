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

import {keyboardAim} from '../src/keyboard-aim.js';
for(const horizontal of ['ArrowLeft','ArrowRight'])for(const vertical of ['ArrowUp','ArrowDown']){
 test(`${horizontal} + ${vertical} permits all weapons and abilities`,()=>{
  const keys=new Set([horizontal,vertical]);
  const aim=keyboardAim(keys);
  const command={moveX:0,moveZ:0,aimX:aim.x,aimZ:aim.z,smoothAim:true};
  const fresh=weapon=>{const s=make(weapon);for(let i=0;i<60;i++)s.step(command);return s;};
  assert.equal(aim.active,true);
  for(const key of ['KeyQ','KeyE','KeyX','KeyC','KeyR','Space','ShiftLeft']){
   keys.add(key);assert.deepEqual(keyboardAim(keys),aim);keys.delete(key);
  }
  let s=fresh('static');s.step({...command,launch:true,quickShot:true});assert.ok(s.shots.some(o=>o.launched));
  assert.ok(s.player.aimX*aim.x>0&&s.player.aimZ*aim.z>0);
  s=fresh('static');s.step({...command,seed:true});assert.equal(s.seeds.length,1);
  s=fresh('static');s.step({...command,hex:true});assert.ok(s.hexOrbs.length>0);
  s=fresh('static');s.step({...command,spray:true});assert.ok(s.spray.active);
  s=fresh('rifle');s.step({...command,fire:true,aiming:true});assert.equal(s.rifle.ammo,17);
  s.step({...command,grenade:true});assert.ok(s.grenades.length>0);
  s.step({...command,extendedReload:true});assert.ok(s.rifle.reload>0);
  s=fresh('shotgun');s.step({...command,fire:true});s.step({...command,fire:false});assert.equal(s.shotgun.ammo,1);
  s=fresh('shotgun');s.step({...command,fire:true});s.step({...command,fire:true,storeCharge:true});assert.ok(s.shotgun.stored);
  s.step({...command,doubleShot:true,aiming:true});for(let i=0;i<6;i++)s.step(command);assert.equal(s.shotgun.ammo,0);
  for(const weapon of ['static','rifle','shotgun']){s=fresh(weapon);s.step({...command,moveX:aim.x,moveZ:aim.z,dodge:true});assert.ok(s.player.dodgeRemaining>0);}
 });
}
