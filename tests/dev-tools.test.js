import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,RULES} from '../src/simulation.js';
import {toggleDevOverrides} from '../src/dev-tools.js';
const make=()=>new Simulation({width:1000,depth:1000,spawn:{x:0,z:0},buildings:[],props:[],targets:[],fences:[]});
test('P disables a mixed set of overrides, then enables every current weapon override',()=>{
 const keys=['speed','ammo','orbs','cooldowns','stamina','invulnerable','teleport','rifleInstantReload','grenadeCooldown'];
 const dev={ammo:true,speed:2};assert.equal(toggleDevOverrides(dev,keys),false);
 assert.equal(dev.speed,1);for(const key of keys.filter(k=>k!=='speed'&&k!=='invulnerable'))assert.equal(dev[key],false);
 assert.equal(toggleDevOverrides(dev,keys),true);assert.equal(dev.speed,1);
 for(const key of keys.filter(k=>k!=='speed'&&k!=='invulnerable'))assert.equal(dev[key],true);
 assert.equal(dev.invulnerable,undefined);
 dev.invulnerable=true;toggleDevOverrides(dev,keys);assert.equal(dev.invulnerable,true);
});
test('practice orb override bypasses supply and capacity without changing normal rules',()=>{
 const sim=make();sim.dev.orbs=true;
 for(let i=0;i<30;i++){sim.player.z=i;sim.seed();}
 assert.equal(sim.seeds.length,30);assert.equal(sim.ammo,12);
 sim.dev={};sim.seed();assert.equal(sim.seeds.length,30);
});
test('practice invulnerability, cooldown and movement overrides can be disabled',()=>{
 const sim=make();sim.dev={invulnerable:true,cooldowns:true,speed:4,stamina:true};
 assert.equal(sim.damagePlayer(10,'fire',true),0);
 sim.hex();assert.equal(sim.hexCooldown,0);sim.stepHex(RULES.hexFormationTime);sim.hex();
 for(let i=0;i<60;i++)sim.step({moveX:1});
 assert.ok(sim.player.vx>RULES.speed*3);assert.equal(sim.player.stamina,2);
 sim.dev={};assert.equal(sim.damagePlayer(10,'fire',true),10);
});
