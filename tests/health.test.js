import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, RULES, explosionFor, splashFalloff } from '../src/simulation.js';
import {deadwater} from '../src/maps.js';
import { hpRound } from '../src/config/gameplay.js';
const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-9,`${msg??''} ${a} vs ${b}`);
const make = () => new Simulation({ width: 50, depth: 50, spawn: { x: 0, z: 0 }, buildings: [], fences: [],
  props: [{ type: 'crate', x: 8, z: 8 }, { type: 'barrel', x: 10, z: 8 }, { type: 'cactus', x: 12, z: 8 }],
  targets: [{ id: 'target', x: 5, z: 0 }, { id: 'dummy', kind: 'dummy', x: 5, z: 3 }] });

test('every practice target has 50 health and every dummy 60, on spawn, respawn and restart',()=>{
 const sim=new Simulation(deadwater),target=sim.targets.find(t=>t.id==='range-b');
 for(const t of sim.targets)assert.deepEqual([t.hp,t.maxHp],t.kind==='dummy'?[60,60]:[50,50],t.id);
 sim.hit(target,{damage:25,volley:1});assert.equal(target.hp,25);
 sim.hit(target,{damage:25,volley:2});assert.equal(target.hp,0);
 for(let i=0;i<280;i++)sim.step({});assert.equal(target.hp,50);
 sim.reset();assert.equal(sim.targets.find(t=>t.id==='range-b').hp,50);
});
test('the tutorial keeps its lighter targets',async()=>{
 const {tutorialMapFor}=await import('../src/tutorial.js');const sim=new Simulation(tutorialMapFor('rifle'));
 assert.deepEqual(sim.targets.map(t=>t.maxHp),[20,15,20,15,20]);
});

test('solo target health refills boards and dummies, without healing them on unrelated dev changes',()=>{
 const sim=make(),board=sim.targets[0];
 sim.hit(board,{damage:10,damageType:'gunshot'});
 sim.dev.targetHealth=200;sim.syncTargetHealth();
 assert.deepEqual(sim.targets.map(t=>[t.hp,t.maxHp]),[[200,200],[200,200]]);
 assert.equal(board.bulletHits,0);
 sim.hit(board,{damage:7.2});sim.syncTargetHealth();
 near(board.hp,192.8,'syncing another control must not refill a damaged target');
 for(const hp of [20,50,100]){
  sim.dev.targetHealth=hp;sim.syncTargetHealth();
  assert.ok(sim.targets.every(t=>t.hp===hp&&t.maxHp===hp));
 }
 assert.equal(sim.player.maxHp,100);
 assert.deepEqual(sim.props.map(p=>p.hp),[1,1,1]);
});

test('target health survives target respawns and map resets but Normal and clearing overrides restore defaults',()=>{
 const sim=make(),board=sim.targets[0];
 sim.hit(board,{damage:50});const wait=board.respawn;
 sim.dev.targetHealth=200;sim.syncTargetHealth();
 assert.deepEqual([board.hp,board.maxHp,board.respawn],[0,200,wait],'do not resurrect a downed target');
 sim.respawnTargets();sim.step({});assert.equal(board.hp,200);
 sim.resetWorld();assert.ok(sim.targets.every(t=>t.hp===200&&t.maxHp===200));
 sim.reset();assert.ok(sim.targets.every(t=>t.hp===200&&t.maxHp===200));
 sim.dev.targetHealth=0;sim.syncTargetHealth();
 assert.deepEqual(sim.targets.map(t=>[t.hp,t.maxHp]),[[50,50],[60,60]]);
 sim.dev.targetHealth=100;sim.syncTargetHealth();
 sim.dev={speed:1};sim.syncTargetHealth();
 assert.deepEqual(sim.targets.map(t=>[t.hp,t.maxHp]),[[50,50],[60,60]],'dev reset and lock clear the override');
});

test('Normal restores authored tutorial health and invalid target overrides cannot create immortal targets',async()=>{
 const {tutorialMapFor}=await import('../src/tutorial.js');const sim=new Simulation(tutorialMapFor('rifle'));
 const normal=sim.targets.map(t=>t.maxHp);
 sim.dev.targetHealth=200;sim.syncTargetHealth();assert.ok(sim.targets.every(t=>t.hp===200));
 for(const value of [0,undefined,NaN,Infinity,-1]){
  sim.dev.targetHealth=value;sim.syncTargetHealth();
  assert.deepEqual(sim.targets.map(t=>t.hp),normal);
  assert.deepEqual(sim.practiceTargets().map(t=>t.maxHp),normal);
 }
});

test('target health ignores robot and player proxies and is not applied by online or prediction sims',()=>{
 const sim=make();
 const robot={id:'target',kind:'robot',hp:30,maxHp:100};
 const player={id:'dummy',kind:'player',hp:40,maxHp:100};
 sim.targets.push(robot,player);sim.dev.targetHealth=200;sim.syncTargetHealth();
 assert.deepEqual([robot.hp,robot.maxHp,player.hp,player.maxHp],[30,100,40,100]);
 for(const flag of ['worldAuthority','predictOnly']){
  const online=make();online[flag]=flag==='predictOnly';online.dev.targetHealth=200;
  online.syncTargetHealth();
  assert.deepEqual(online.targets.map(t=>[t.hp,t.maxHp]),[[50,50],[60,60]]);
  assert.deepEqual(online.practiceTargets().map(t=>t.maxHp),[50,60]);
 }
});

test('health values are explicit for players, targets, dummies and breakable cover', () => {
  const sim = make(); assert.equal(sim.player.hp, 100); assert.equal(sim.player.maxHp, 100);
  assert.deepEqual(sim.targets.map(t => [t.hp, t.maxHp]), [[50, 50], [60, 60]]);
  // Breakable cover shares one low value so a single orb clears it in passing.
  assert.deepEqual(sim.props.map(p => p.hp), [1, 1, 1]);
});
test('dummy takes damage, breaks once with its own effect event, and respawns at 60', () => {
  const sim = make(), dummy = sim.targets[1];
  sim.hit(dummy, { damage: 59.8, owner: 'local', volley: 1 }); near(dummy.hp, .2);
  sim.hit(dummy, { damage: 1.6, owner: 'local', volley: 1 }); sim.hit(dummy, { damage: 1.6, owner: 'local', volley: 1 });
  assert.equal(dummy.hp, 0); assert.equal(sim.events.filter(e => e.type === 'kill' && e.targetKind === 'dummy').length, 1);
  for (let i = 0; i < 280; i++) sim.step({});
  assert.equal(dummy.hp, 60); assert.equal(dummy.maxHp, 60);
});
test('player rejects direct self-owned shots and tracks external damage without negative health', () => {
  const sim = make(); assert.equal(sim.damagePlayer(199.8, 'local'), 0); assert.equal(sim.player.hp, 100);
  assert.equal(sim.damagePlayer(24, 'opponent'), 24); assert.equal(sim.player.hp, 76);
  assert.equal(sim.damagePlayer(199.8, 'opponent'), 76); assert.equal(sim.player.hp, 0);
  sim.reset(); sim.explode({ x: 0, z: 0, arrived: 12 }, 1);
  // A heavy volley lands slightly harder at the centre than its flat blast figure.
  const centre = hpRound(explosionFor(12).damage * splashFalloff(0, explosionFor(12).radius, 12));
  near(sim.player.hp, RULES.playerHealth - centre);
  assert.ok(centre > explosionFor(12).damage, 'the heavy core should add something');
  assert.ok(centre < explosionFor(12).damage * 1.1, 'but barely');
});
test('own orb explosions respect falloff, cover, blast boundaries and invulnerability',()=>{
 const blast=explosionFor(12);
 // Splash is measured to the edge of the body (RULES.radius).
 const at=distance=>hpRound(blast.damage*splashFalloff(Math.max(0,distance-RULES.radius),blast.radius,12));
 const center=make();center.explode({x:0,z:0,arrived:12},1);near(center.player.hp,100-at(0));
 const edge=make();edge.explode({x:2,z:0,arrived:12},1);
 near(edge.player.hp,100-at(2));
 assert.ok(edge.player.hp>center.player.hp&&edge.player.hp<100,'the rim must still hurt less than the centre');
 const outside=make();outside.explode({x:4,z:0,arrived:12},1);assert.equal(outside.player.hp,100);
 const blocked=make();blocked.colliders.push({x:1,z:0,w:.2,d:4});blocked.explode({x:2,z:0,arrived:12},1);assert.equal(blocked.player.hp,100);
 const dev=make();dev.dev.invulnerable=true;dev.explode({x:0,z:0,arrived:12},1);assert.equal(dev.player.hp,100);
 const single=make();single.explode({x:0,z:0,arrived:1},1);assert.equal(single.player.hp,100);
});
test('Static hex and lightning remain safe for their owner',()=>{
 const sim=make();sim.hex();sim.stepHex(RULES.hexFormationTime);sim.hex();
 for(let i=0;i<240;i++)sim.step({spray:true,aimX:1,aimZ:0});
 assert.equal(sim.player.hp,100);
});
test('health is separate from splash, which falls off for both targets and dummies', () => {
  const sim = make(); sim.targets = [
    { ...sim.targets[1], id: 'near', x: 0, z: .2 }, { ...sim.targets[1], id: 'far', x: 0, z: 2.5 },
  ]; sim.explode({ x: 0, z: 0, arrived: 12 }, 1);
  assert.ok(sim.targets[0].hp < sim.targets[1].hp); assert.ok(sim.targets.every(t => t.maxHp === 60 && t.hp < 60));
});
