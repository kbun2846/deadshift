import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,RULES} from '../src/simulation.js';
const make=kind=>new Simulation({width:40,depth:40,spawn:{x:0,z:0},buildings:[],props:[],fences:[],targets:[{id:'t',kind,x:2,z:0}]});
for(const kind of [undefined,'dummy'])test(`${kind||'target'} blocks walking and dashing, disappears on death, returns on respawn`,()=>{
 const sim=make(kind),limit=RULES.radius+(kind==='dummy'?.42:.55);
 for(let i=0;i<60;i++)sim.step({moveX:1,moveZ:0,dodge:i===5});
 assert.ok(sim.player.x<=2-limit+1e-5);
 sim.targets[0].hp=0;sim.targets[0].respawn=10;sim.movePlayer(2,0);assert.ok(sim.player.x>2);
 sim.player.x=2;sim.player.z=0;sim.targets[0].respawn=.001;sim.step({});
 assert.ok(Math.hypot(sim.player.x-2,sim.player.z)>=limit-1e-5);
});
test('glancing movement slides around a dummy without a long correction',()=>{
 const sim=make('dummy');sim.player.z=.6;
 for(let i=0;i<90;i++){const x=sim.player.x,z=sim.player.z;sim.step({moveX:1});assert.ok(Math.hypot(sim.player.x-x,sim.player.z-z)<.15);}
 assert.ok(sim.player.x>3);
});
