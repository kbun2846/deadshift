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

import {readFileSync} from 'node:fs';
import {DEV_CODE,DEV_OPTIONS,DEV_SECTIONS,BULK_KEYS,optionsFor} from '../src/dev-options.js';
import {maps} from '../src/maps.js';
import {WEAPONS} from '../src/items.js';
import {HostSession} from '../src/net/host-session.js';
import {ClientSession} from '../src/net/client-session.js';
import {createLoopback} from '../src/net/transport.js';

test('the tools open with Shift+P from the pause menu and code 1213, and are silent before that',()=>{
 assert.equal(DEV_CODE,'1213');
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.ok(/paused&&[^\n]*e\.code==='KeyP'&&e\.shiftKey/.test(main),'Shift+P while paused opens the code prompt');
 assert.ok(/\(e\.code==='KeyO'\|\|e\.code==='KeyP'\)[^\n]*devTools\.isUnlocked\(\)/.test(main),'P and O do nothing until unlocked');
 assert.ok(!main.includes('devDialog.show();else'),'plain P no longer asks for the code');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(/id="dev-open"[^>]*hidden/.test(html),'the settings entry starts hidden');
});

test('every option has a home section, a unique key and a short label; P only touches everyday overrides',()=>{
 const sections=new Set(DEV_SECTIONS.map(s=>s.id)),weaponIds=new Set(WEAPONS.map(w=>w.id));
 assert.equal(new Set(DEV_OPTIONS.map(o=>o.key)).size,DEV_OPTIONS.length);
 for(const o of DEV_OPTIONS){assert.ok(o.weapon?weaponIds.has(o.weapon):sections.has(o.section),o.key);assert.ok(o.label.length<32,o.key);}
 for(const risky of ['invulnerable','ghost','hideHud','oneHit','timeScale'])assert.ok(!BULK_KEYS.includes(risky),risky);
 assert.ok(optionsFor('window').some(o=>o.key==='spawnBird'&&o.kind==='action'),'spawn bird is an ordinary option row');
});

test('one-hit kills, frozen targets, respawn and rebuild work from sim.dev',()=>{
 const sim=new Simulation(maps.deadwater);
 const target=sim.targets.find(t=>!t.moving);sim.dev.oneHit=true;
 sim.hit(target,{damage:1,owner:sim.player.id});assert.equal(target.hp,0);
 assert.equal(sim.respawnTargets(),1);sim.step({});assert.equal(target.hp,target.maxHp);
 const runner=sim.targets.find(t=>t.moving);sim.dev.freezeTargets=true;const x=runner.x;
 for(let i=0;i<30;i++)sim.step({});assert.equal(runner.x,x);
 const prop=sim.props.find(p=>p.hp>0);sim.hitProp(prop,{damage:prop.hp,owner:sim.player.id,x:prop.x,z:prop.z});
 assert.equal(prop.hp,0);assert.ok(sim.restoreAllProps()>=1);assert.ok(prop.hp>0);
});

test('removing your own player: no body to bump, nothing hurts it',()=>{
 const sim=new Simulation(maps.deadwater);sim.dev.ghost=true;
 assert.equal(sim.damagePlayer(50,'fire',true),0);
 const target=sim.targets[0];sim.player.x=target.x;sim.player.z=target.z;sim.movePlayer(0,0);
 assert.equal(sim.player.x,target.x,'walks straight through a target');
});

test('the host can remove a joiner, who is told why and cannot come back',()=>{
 const net=createLoopback(),local=new Simulation(maps.deadwater),createSim=m=>new Simulation(m);let time=0;const now=()=>time;
 const host=new HostSession({transport:net.host('ABCDE'),map:maps.deadwater,local,createSim,now});
 const guest=new ClientSession({transport:net.join('ABCDE'),map:maps.deadwater,local:new Simulation(maps.deadwater),createSim,now});
 net.flush();const [joiner]=host.players();assert.ok(joiner);
 assert.equal(host.kick(joiner.id),true);net.flush();
 assert.equal(host.players().length,0);assert.match(guest.ended,/removed/);
 host.receive(joiner.id,{t:'hello',version:1,weapon:'static'});net.flush();assert.equal(host.players().length,0,'no way back in');
 assert.ok(host.drainNotices().some(n=>/was removed/.test(n)));
});

test('weapons live in one Weapons dropdown, one dropdown each, taken from the item registry',()=>{
 assert.ok(DEV_SECTIONS.some(s=>s.weapons),'dev tools have a Weapons group');
 for(const legacy of ['static','nominal','ballast'])assert.ok(!DEV_SECTIONS.some(s=>s.id===legacy),legacy+' is no longer a top-level section');
 for(const w of WEAPONS)assert.ok(Array.isArray(w.controls)&&w.controls.length,w.id+' brings its own control rows');
 const menu=readFileSync(new URL('../src/menu.js',import.meta.url),'utf8');
 assert.ok(/weapons-group[^\n]*WEAPONS\.map/.test(menu),'Settings > Controls builds its Weapons dropdown from the registry');
});
