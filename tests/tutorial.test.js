import test from 'node:test';
import assert from 'node:assert/strict';
import {Tutorial,tutorialMap,tutorialMapFor,lessons} from '../src/tutorial.js';
import {Simulation} from '../src/simulation.js';

test('Ballast tutorial targets and dummies have 400 health including respawns without changing other tutorials',()=>{
 const sim=new Simulation(tutorialMapFor('shotgun'));
 assert.ok(sim.targets.every(t=>t.hp===400&&t.maxHp===400));
 for(const target of sim.targets)sim.hit(target,{damage:500,volley:1});
 for(let i=0;i<280;i++)sim.step({});
 assert.ok(sim.targets.every(t=>t.hp===400));
 sim.reset();assert.ok(sim.targets.every(t=>t.hp===400));
 for(const weapon of ['static','rifle'])assert.deepEqual(new Simulation(tutorialMapFor(weapon)).targets.map(t=>t.hp),[100,75,100,75,100]);
});
test('tutorial requires begin, repeated successes and explicit continue',()=>{
 const t=new Tutorial(),state={spray:{active:false}};
 t.update({x:0,z:0});t.update({x:20,z:0});assert.equal(t.count,0);
 t.begin();t.update({x:0,z:0});t.update({x:10,z:0});assert.equal(t.count,5);assert.equal(t.index,0);
 assert.ok(t.advance());assert.equal(t.index,1);assert.equal(t.active,false);
 t.event({type:'dodge'},state);assert.equal(t.count,0);t.begin();
 for(let i=0;i<5;i++)t.event({type:'dodge'},state);
 assert.equal(t.index,1);assert.ok(t.ready);t.advance();t.begin();
 for(let i=0;i<5;i++)t.event({type:'seed'},state);
 t.advance();t.begin();
 for(let i=0;i<5;i++)t.event({type:'hit',volley:1},state);
 assert.equal(t.count,1);assert.equal(t.advance(),false);
 for(let i=2;i<=5;i++)t.event({type:'hit',volley:i},state);
 t.advance();t.begin();state.spray.active=true;
 for(let i=0;i<5;i++)t.event({type:'hit',volley:10+i},state);
 t.advance();t.begin();
 for(let i=0;i<5;i++)t.event({type:'hexPulse'},state);
 t.advance();t.begin();t.event({type:'mapOpened'},state);
 assert.ok(!t.complete);t.advance();assert.ok(t.complete);assert.equal(t.index,lessons.length);
});
test('tutorial has an enclosed clear small map with lined-up live targets',()=>{
 assert.equal(tutorialMap.buildings.length,0);assert.equal(tutorialMap.props.length,0);
 assert.equal(tutorialMap.fences.length,4);assert.equal(new Set(tutorialMap.targets.map(t=>t.z)).size,1);
 assert.equal(new Simulation(tutorialMap).targets.length,5);
});
test('Nominal tutorial requires taps, held fire, aimed hits and completed reloads',()=>{
 const t=new Tutorial('rifle'),sim={};
 const events=[{type:'dodge'},{type:'rifleShot',burstIndex:1},{type:'rifleShot',burstIndex:2},{type:'rifleHit',aimed:true},{type:'rifleReloaded'},{type:'grenadeExplosion'},{type:'rifleReloaded',extended:true},{type:'mapOpened'}];
 t.begin();t.update({x:0,z:0});t.update({x:10,z:0});t.advance();
 for(const event of events){
  t.event(event,sim);assert.equal(t.count,0);t.begin();
  if(t.index===2)t.event({type:'rifleShot',burstIndex:2},sim);
  if(t.index===3)t.event({type:'rifleShot',burstIndex:1},sim);
  if(t.index===4)t.event({type:'rifleHit',aimed:false},sim);
  if(t.index===5)t.event({type:'rifleReload'},sim);
  assert.equal(t.count,0);
  for(let i=0;i<t.goal;i++)t.event({...event,id:i},sim);
  assert.equal(t.ready,true);assert.equal(t.complete,false);assert.equal(t.advance(),true);
 }
 assert.equal(t.complete,true);
});
