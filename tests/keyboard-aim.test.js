import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,RULES} from '../src/simulation.js';
import {RIFLE} from '../src/config/gameplay.js';
const make=weapon=>{const sim=new Simulation({width:80,depth:80,spawn:{x:0,z:0},buildings:[],fences:[],props:[],targets:[]});sim.weapon=weapon;sim.reset();return sim;};
test('arrow aim eases identically for every weapon, including focused fire',()=>{
 const traces=[];
 for(const weapon of ['static','rifle','shotgun'])for(const aiming of [false,true]){
  const sim=make(weapon),angles=[];
  for(let i=0;i<60;i++){sim.step({aimX:0,aimZ:-1,smoothAim:true,aiming});angles.push(Math.atan2(sim.player.aimZ,sim.player.aimX));}
  assert.ok(angles[0]<0&&angles[0]>-Math.PI/20,'the turn eases in rather than jumping');
  assert.ok(Math.abs(angles[4]+Math.PI/2)>.5,'a quarter turn is not over in a few frames');
  assert.ok(Math.abs(angles[20]+Math.PI/2)<.02,'but it arrives within about a third of a second');
  assert.ok(angles.every((a,i)=>a>=-Math.PI/2-1e-12&&(i===0||a<=angles[i-1])),'never overshoots and never turns back');
  traces.push(angles);
 }
 for(const trace of traces)assert.deepEqual(trace,traces[0]);
});
test('digital aim takes the short arc across angle wrap and remains valid on reversal',()=>{
 const sim=make('rifle');sim.player.aimX=Math.cos(3.1);sim.player.aimZ=Math.sin(3.1);
 sim.step({aimX:Math.cos(-3.1),aimZ:Math.sin(-3.1),smoothAim:true});
 assert.ok(sim.player.aimX<-.99);
 sim.player.aimX=1;sim.player.aimZ=0;for(let i=0;i<6;i++)sim.step({aimX:-1,aimZ:0,smoothAim:true});
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
  for(const key of ['KeyQ','KeyE','KeyX','KeyC','KeyR','Space','ControlLeft','ShiftLeft']){
   keys.add(key);assert.deepEqual(keyboardAim(keys),aim);keys.delete(key);
  }
  let s=fresh('static');s.step({...command,launch:true,quickShot:true});assert.ok(s.shots.some(o=>o.launched));
  assert.ok(s.player.aimX*aim.x>0&&s.player.aimZ*aim.z>0);
  s=fresh('static');s.step({...command,seed:true});assert.equal(s.seeds.length,1);
  s=fresh('static');s.step({...command,hex:true});assert.ok(s.hexOrbs.length>0);
  s=fresh('static');s.step({...command,spray:true});assert.ok(s.spray.active);
  s=fresh('rifle');s.step({...command,fire:true,aiming:true});assert.equal(s.rifle.ammo,RIFLE.magazine-1);
  s.step({...command,grenade:true});assert.ok(s.grenades.length>0);
  s.step({...command,surge:true});assert.equal(s.surge.phase,'charging');
  s=fresh('shotgun');s.step({...command,fire:true});assert.equal(s.shotgun.ammo,1,'a press fires');
  s=fresh('shotgun');s.step({...command,doubleShot:true,aiming:true});for(let i=0;i<6;i++)s.step(command);assert.equal(s.shotgun.ammo,0);
  s=fresh('shotgun');s.step({...command,scatter:true});assert.ok(s.scatter.armed);s.step(command);s.scatter.armedFor=3;s.step({...command,scatter:true});assert.equal(s.scatterShells.length,5);
  for(const weapon of ['static','rifle','shotgun']){s=fresh(weapon);s.step({...command,moveX:aim.x,moveZ:aim.z,dodge:true});assert.ok(s.player.dodgeRemaining>0);}
 });
}

test('Ballast on the keyboard: Space or the left button fires, E is the double, Shift only aims',async()=>{
 const {ballastInput}=await import('../src/weapons/rifle-input.js');
 const none=new Set();
 assert.deepEqual(ballastInput(false,new Set(['Space']),none),{fire:true});
 assert.deepEqual(ballastInput(false,none,new Set(['Space'])),{fire:true},'a tap of Space pulls the trigger');
 assert.equal(ballastInput(false,new Set(['KeyE']),none).fire,false,'E is the double shot, not the trigger');
 assert.equal(ballastInput(true,none,none).fire,true,'left button fires');
 assert.deepEqual(ballastInput(false,new Set(['ShiftLeft']),none),{fire:false},'Shift aims in, nothing else');
});

test('a tap part way through a turn leaves the aim in between: taps give the angles between the keys',()=>{
 const sim=make('static');
 for(let i=0;i<6;i++)sim.step({aimX:0,aimZ:-1,smoothAim:true});
 for(let i=0;i<30;i++)sim.step({});
 const angle=Math.atan2(sim.player.aimZ,sim.player.aimX);
 assert.ok(angle<-.05&&angle>-Math.PI/2+.1,`stopped part way at ${angle}`);
});

test('a dodge pressed just before the last one ends still happens (input buffer)', () => {
 // (Ballast: the only weapon with two dodges.)
 const sim = make('shotgun');
 sim.step({ moveX: 1, dodge: true });
 const first = sim.events.filter(e => e.type === 'dodge').length;
 const ticks = Math.round(RULES.dodgeDuration * 60);
 for (let i = 0; i < ticks - 3; i++) sim.step({ moveX: 1 });
 sim.step({ moveX: 1, dodge: true }); // pressed ~3 ticks early
 for (let i = 0; i < 6; i++) sim.step({ moveX: 1 });
 assert.equal(sim.events.filter(e => e.type === 'dodge').length, first + 1, 'the early press was kept');
 const late = make('shotgun');
 late.step({ moveX: 1, dodge: true });
 for (let i = 0; i < ticks - Math.round(RULES.dodgeBuffer * 60) - 6; i++) late.step({ moveX: 1 });
 late.step({ moveX: 1, dodge: true }); // far too early: dropped
 for (let i = 0; i < 20; i++) late.step({ moveX: 1 });
 assert.equal(late.events.filter(e => e.type === 'dodge').length, 1);
});
