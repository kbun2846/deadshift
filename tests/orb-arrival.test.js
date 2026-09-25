import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,RULES,damagePerOrb,explosionFor,splashFalloff} from '../src/simulation.js';
import { VOLLEY_BOOST } from '../src/config/gameplay.js';

const empty=extra=>({width:80,depth:80,spawn:{x:0,z:0},buildings:[],props:[],fences:[],targets:[],...extra});
const run=(sim,frames=150)=>{for(let i=0;i<frames;i++)sim.step({});return sim;};
const spread=(sim,count,gap=.8,x=1)=>{
 for(let i=0;i<count;i++){sim.seed();const orb=sim.shots.at(-1);orb.x=x;orb.z=(i-(count-1)/2)*gap;}
 return sim;
};
const orbHits=sim=>sim.events.filter(e=>e.type==='outgoingDamage');

test('orbs converge an overshoot past the aim point, on the same ray',()=>{
 const sim=new Simulation(empty());
 sim.seed();sim.launch(9,12);
 const shot=sim.shots[0],reach=Math.hypot(9,12);
 assert.ok(Math.abs(shot.targetX-(9+9/reach*RULES.launchOvershoot))<1e-9);
 assert.ok(Math.abs(shot.targetZ-(12+12/reach*RULES.launchOvershoot))<1e-9);
 // The aim point is kept separately: it is what decides intent and blast centre.
 assert.equal(shot.focusX,9);assert.equal(shot.focusZ,12);
});

test('the overshoot never carries an orb into solid cover behind the target',()=>{
 const sim=new Simulation(empty({props:[{type:'boulder',x:7.7,z:0}]}));
 sim.seed();sim.launch(6,0);
 const shot=sim.shots[0];
 // Compare against the same shot with nothing behind it, so the assertion
 // proves the clamp rather than just happening to sit under a fixed bound.
 const free=new Simulation(empty());free.seed();free.launch(6,0);
 assert.ok(Math.abs(free.shots[0].targetX-(6+RULES.launchOvershoot))<1e-6,'an unobstructed shot takes the full overshoot');
 assert.ok(shot.targetX<free.shots[0].targetX-1e-6,`clamped to ${shot.targetX}, which is not short of ${free.shots[0].targetX}`);
 assert.ok(shot.targetX<6.5,'and stops outside the boulder face');
 assert.ok(shot.targetX>=6,'and never behind the aim point');
});

test('a launched orb breaks scenery and carries on through it',()=>{
 const sim=new Simulation(empty({targets:[{id:'a',x:12,z:0,maxHp:500}],props:[{type:'barrel',x:6,z:0}]}));
 sim.seed();sim.launch(12,0);run(sim);
 assert.equal(sim.props[0].hp,0,'the barrel should be cleared');
 assert.ok(sim.targets[0].hp<500,'and the orb should still reach the target');
 assert.ok(sim.events.some(e=>e.type==='propBreak'));
});

test('every breakable type falls to a single orb',()=>{
 for(const type of ['barrel','crate','cactus','sign','deadwood','hay']){
  const sim=new Simulation(empty({props:[{type,x:6,z:0}]}));
  assert.equal(sim.props[0].health,5,`${type} health`);
  sim.seed();sim.launch(12,0);run(sim);
  assert.equal(sim.props[0].hp,0,`${type} should break to one orb`);
 }
});

test('drifting orbs still respect scenery; only launched ones pass through',()=>{
 const sim=new Simulation(empty({props:[{type:'crate',x:2.4,z:0}]}));
 for(let i=0;i<40;i++)sim.step({moveX:0,moveZ:0,aimX:1,aimZ:0,seed:true});
 assert.equal(sim.props[0].hp,sim.props[0].health,'an unlaunched orb must not break cover');
});

test('a stray orb is worth one orb, whatever the volley behind it was',()=>{
 for(const count of [6,12]){
  // Aimed squarely at one target, with a second standing off the line that a
  // few orbs clip on their way in. The clipped one is never the intended one.
  const sim=new Simulation(empty({targets:[
   {id:'aimed',x:14,z:0,maxHp:5000},
   {id:'bystander',x:7,z:1.25,maxHp:5000},
  ]}));
  spread(sim,count,.9);
  sim.launch(14,0);run(sim);
  const strays=orbHits(sim).filter(e=>e.id==='bystander');
  assert.ok(strays.length>0,`volley of ${count} should have clipped the bystander`);
  for(const hit of strays)assert.ok(Math.abs(hit.damage-damagePerOrb(1))<1e-6,
   `stray from a volley of ${count} dealt ${hit.damage}, expected ${damagePerOrb(1)}`);
  const aimed=orbHits(sim).filter(e=>e.id==='aimed');
  assert.ok(aimed.length>0&&aimed[0].damage>damagePerOrb(1),'the aimed target still takes volley damage');
 }
});

test('a volley thrown just past a target converges on it instead of clipping it',()=>{
 const sim=new Simulation(empty({targets:[{id:'blocking',x:6,z:0,maxHp:5000}]}));
 spread(sim,8,.5);
 // Aimed just beyond the target (within RULES.interceptReach), at open ground.
 sim.launch(7,0);
 assert.ok(sim.shots.every(s=>Math.abs(s.focusX-6)<1e-6&&Math.abs(s.focusZ)<1e-6),
  'the volley should re-focus onto the target in its path');
 run(sim);
 const hits=orbHits(sim),blast=sim.events.find(e=>e.type==='explosion');
 assert.ok(blast,'it should detonate there rather than flying past');
 assert.ok(Math.abs(blast.x-6)<1e-6&&Math.abs(blast.z)<1e-6,'and detonate on the target');
 // The blast is the last entry; the rest are the orbs arriving together.
 const landed=hits.slice(0,-1);
 assert.ok(landed.length>1,'the orbs should arrive together for combined impact');
 assert.ok(landed.every(e=>Math.abs(e.damage-landed[0].damage)<1e-6),'all worth the same volley figure');
 assert.ok(landed[0].damage>damagePerOrb(1),'and worth more than a stray apiece');
});

test('the nearest crossing wins when two targets lie along the path',()=>{
 const sim=new Simulation(empty({targets:[
  {id:'far',x:12,z:0,maxHp:5000},
  {id:'near',x:5,z:0,maxHp:5000},
 ]}));
 spread(sim,6,.4);
 sim.launch(6,0);
 assert.ok(Math.abs(sim.shots[0].focusX-5)<1e-6,'it should stop at the first one it meets');
});

test('a target behind solid cover is never intercepted onto',()=>{
 const sim=new Simulation(empty({targets:[{id:'hidden',x:9,z:0,maxHp:5000}],props:[{type:'boulder',x:5,z:0}]}));
 spread(sim,6,.4);
 sim.launch(26,0);
 assert.ok(Math.abs(sim.shots[0].focusX-9)>1e-6,'cover must not be shot through by re-focusing');
});

test('a volley aimed directly at a target is left alone',()=>{
 const sim=new Simulation(empty({targets:[
  {id:'aimed',x:12,z:0,maxHp:5000},
  {id:'nearer',x:5,z:0,maxHp:5000},
 ]}));
 spread(sim,6,.4);
 sim.launch(12,0);
 assert.ok(Math.abs(sim.shots[0].focusX-12)<1e-6,'an explicit aim point is never overridden');
});

test('the volley is worth what lands, not what was fired',()=>{
 const sim=new Simulation(empty({targets:[{id:'a',x:12,z:0,maxHp:5000}],props:[{type:'well',x:7,z:0}]}));
 spread(sim,12);
 sim.launch(12,0);run(sim);
 const hits=orbHits(sim);
 const blast=hits.at(-1),landed=hits.length-1;
 assert.ok(landed>0&&landed<12,`the well should stop some but not all orbs, ${landed} landed`);
 for(const hit of hits.slice(0,landed))assert.ok(Math.abs(hit.damage-damagePerOrb(landed))<1e-6,
  `orb dealt ${hit.damage}, expected the ${landed}-orb value ${damagePerOrb(landed)}`);
 // The blast is sized off the same figure, so a half-blocked volley is halved end to end.
 assert.ok(Math.abs(blast.damage-explosionFor(landed).damage)<1,
  `blast was ${blast.damage}, expected about ${explosionFor(landed).damage}`);
 assert.ok(damagePerOrb(landed)<damagePerOrb(12),'a blocked volley must be worth less per orb');
});

test('an unobstructed volley is still worth its full launched value',()=>{
 const sim=new Simulation(empty({targets:[{id:'a',x:12,z:0,maxHp:5000}]}));
 spread(sim,12);
 sim.launch(12,0);run(sim);
 const hits=orbHits(sim);
 assert.equal(hits.length,13,'twelve orbs and one blast');
 // A full twelve carries its one shared roll, so allow exactly that band.
 const roll=10/12+1e-6;
 for(const hit of hits.slice(0,12))assert.ok(Math.abs(hit.damage-damagePerOrb(12))<=roll,
  `orb dealt ${hit.damage}, outside the roll around ${damagePerOrb(12)}`);
 const shared=hits[0].damage;
 for(const hit of hits.slice(0,12))assert.equal(hit.damage,shared,'one roll is shared by the whole volley');
 const total=hits.reduce((sum,hit)=>sum+hit.damage,0);
 const blast=explosionFor(12);
 const bump=Math.round(blast.damage*splashFalloff(0,blast.radius,12))-blast.damage;
 assert.ok(total>=335*VOLLEY_BOOST+bump-2&&total<=355*VOLLEY_BOOST+bump+2,`full volley totalled ${total}`);
});

test('a single orb never produces a blast',()=>{
 const sim=new Simulation(empty({targets:[{id:'a',x:8,z:0,maxHp:500}]}));
 sim.seed();sim.launch(8,0);run(sim);
 assert.equal(sim.events.filter(e=>e.type==='explosion').length,0);
 assert.equal(orbHits(sim).length,1);
});

test('an orb pays for what it breaks and carries on lighter',()=>{
 const sim=new Simulation(empty({props:[{type:'crate',x:4,z:0}],targets:[{id:'t',x:14,z:0,maxHp:500}]}));
 sim.seed();sim.launch(14,0);
 const budget=sim.shots[0].pierceBudget;
 assert.equal(budget,damagePerOrb(1)/VOLLEY_BOOST,'the budget starts at one orb (as it was before the volley boost)');
 run(sim);
 assert.equal(sim.props[0].hp,0,'a crate it can afford is cleared');
 assert.ok(sim.targets[0].hp<500,'and the orb keeps going');
});

test('a breakable it cannot pay for in full takes the remainder and stops it',()=>{
 const sim=new Simulation(empty({props:[{type:'crate',x:4,z:0},{type:'crate',x:8,z:0}],targets:[{id:'t',x:14,z:0,maxHp:500}]}));
 sim.seed();sim.launch(14,0);run(sim);
 const [first,second]=sim.props;
 const left=damagePerOrb(1)/VOLLEY_BOOST-first.health;
 assert.equal(first.hp,0,'the first is affordable and breaks');
 assert.ok(Math.abs(second.hp-(second.health-left))<1e-6,
  `the second should be left on ${second.health-left}, was ${second.hp}`);
 assert.ok(second.hp>0,'and must survive, having cost more than was left');
 assert.equal(sim.targets[0].hp,500,'the orb is stopped and never reaches the target');
});

test('the budget is spent nearest first, in the order the orb meets them',()=>{
 // The far crate is the one that should survive, whichever order the colliders
 // happen to be built in.
 const sim=new Simulation(empty({props:[{type:'crate',x:9,z:0},{type:'crate',x:3,z:0}]}));
 sim.seed();sim.launch(16,0);run(sim);
 const near=sim.props.find(p=>p.x===3),far=sim.props.find(p=>p.x===9);
 assert.equal(near.hp,0,'the near crate is paid for first');
 assert.ok(far.hp>0&&far.hp<far.health,'the far one takes only what was left');
});

test('the budget does not come out of what the target receives',()=>{
 const clear=new Simulation(empty({targets:[{id:'t',x:14,z:0,maxHp:500}]}));
 clear.seed();clear.launch(14,0);run(clear);
 const through=new Simulation(empty({props:[{type:'crate',x:4,z:0}],targets:[{id:'t',x:14,z:0,maxHp:500}]}));
 through.seed();through.launch(14,0);run(through);
 assert.equal(clear.targets[0].hp,through.targets[0].hp,
  'clearing scenery on the way must not reduce the damage delivered');
});

test('one orb can only ever clear one full crate',()=>{
 const sim=new Simulation(empty({props:[{type:'crate',x:3,z:0},{type:'crate',x:6,z:0},{type:'crate',x:9,z:0}]}));
 sim.seed();sim.launch(16,0);run(sim);
 assert.equal(sim.props.filter(p=>p.hp===0).length,1,'exactly one should be destroyed');
 assert.equal(sim.props.filter(p=>p.hp===p.health).length,1,'and the last should be untouched');
});

test('orbs parked around a target do not drag the volley onto it',()=>{
 // Place a ring of orbs about a target, walk away, then fire somewhere else
 // entirely. Every one of those orbs crosses the target on its way out, which
 // must not be mistaken for having aimed through it.
 const sim=new Simulation(empty({targets:[{id:'bystander',x:6,z:0,maxHp:500}]}));
 for(let i=0;i<8;i++){
  sim.seed();
  const orb=sim.shots.at(-1),angle=i/8*Math.PI*2;
  orb.x=6+Math.cos(angle)*1.1;orb.z=Math.sin(angle)*1.1;
 }
 sim.player.x=2;sim.player.z=-6;
 sim.launch(-14,-16);
 assert.ok(Math.abs(sim.shots[0].focusX+14)<1e-6&&Math.abs(sim.shots[0].focusZ+16)<1e-6,
  `the volley went to ${sim.shots[0].focusX.toFixed(2)}, ${sim.shots[0].focusZ.toFixed(2)} instead of the cursor`);
 run(sim);
 // An orb leaving the ring may still physically clip it, which is a stray and
 // worth one orb. What must not happen is the whole volley landing on it.
 const taken=500-sim.targets[0].hp;
 assert.ok(taken<=damagePerOrb(1)*3+1e-6,`the bystander took ${taken.toFixed(1)}, which is volley damage`);
 const blast=sim.events.find(e=>e.type==='explosion');
 assert.ok(blast,'the volley should still detonate where it was sent');
 assert.ok(Math.hypot(blast.x-(-14),blast.z-(-16))<1e-6,
  `it detonated at ${blast.x.toFixed(2)}, ${blast.z.toFixed(2)} rather than at the cursor`);
});

test('a target off the line of fire is never intercepted onto',()=>{
 const sim=new Simulation(empty({targets:[{id:'aside',x:8,z:6,maxHp:500}]}));
 spread(sim,6,.4);
 // Aimed straight down the x axis; the target sits well to one side of it.
 sim.launch(20,0);
 assert.ok(Math.abs(sim.shots[0].focusX-20)<1e-6,'an aim point beside a target must be respected');
});

test('a target behind the aim point is not intercepted onto either',()=>{
 const sim=new Simulation(empty({targets:[{id:'beyond',x:20,z:0,maxHp:500}]}));
 spread(sim,6,.4);
 // Deliberately short of it: the blast belongs where it was aimed.
 sim.launch(9,0);
 assert.ok(Math.abs(sim.shots[0].focusX-9)<1e-6,'only what stands in the way counts');
});

test('aimed well past a target, the volley goes where the cursor is (owner, v0.9b)',()=>{
 const sim=new Simulation(empty({targets:[{id:'blocking',x:6,z:0,maxHp:5000}]}));
 spread(sim,8,.5);
 sim.launch(26,0);
 assert.ok(sim.shots.every(s=>Math.abs(s.focusX-26)<1e-6),'no refocus onto a target far short of the cursor');
});

test('a target standing in the way is still intercepted onto',()=>{
 const sim=new Simulation(empty({targets:[{id:'blocking',x:7,z:.4,maxHp:5000}]}));
 spread(sim,8,.5);
 sim.launch(8,0);
 assert.ok(Math.abs(sim.shots[0].focusX-7)<1e-6,'the on-axis case must keep working');
});
