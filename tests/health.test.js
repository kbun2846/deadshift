import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, RULES, explosionFor, splashFalloff } from '../src/simulation.js';
import {deadwater} from '../src/maps.js';
const make = () => new Simulation({ width: 50, depth: 50, spawn: { x: 0, z: 0 }, buildings: [], fences: [],
  props: [{ type: 'crate', x: 8, z: 8 }, { type: 'barrel', x: 10, z: 8 }, { type: 'cactus', x: 12, z: 8 }],
  targets: [{ id: 'target', x: 5, z: 0 }, { id: 'dummy', kind: 'dummy', x: 5, z: 3 }] });

test('middle Deadwater spawn target has 500 health on spawn, respawn and restart',()=>{
 const sim=new Simulation(deadwater),target=sim.targets.find(t=>t.id==='range-b');
 assert.equal(target.hp,500);assert.equal(target.maxHp,500);
 assert.equal(sim.targets.find(t=>t.id==='range-a').hp,100);
 assert.equal(sim.targets.find(t=>t.id==='range-c').hp,100);
 sim.hit(target,{damage:250,volley:1});assert.equal(target.hp,250);
 sim.hit(target,{damage:250,volley:2});assert.equal(target.hp,0);
 for(let i=0;i<280;i++)sim.step({});assert.equal(target.hp,500);
 sim.reset();assert.equal(sim.targets.find(t=>t.id==='range-b').hp,500);
});

test('health values are explicit for players, targets, dummies and breakable cover', () => {
  const sim = make(); assert.equal(sim.player.hp, 500); assert.equal(sim.player.maxHp, 500);
  assert.deepEqual(sim.targets.map(t => [t.hp, t.maxHp]), [[100, 100], [75, 75]]);
  // Breakable cover shares one low value so a single orb clears it in passing.
  assert.deepEqual(sim.props.map(p => p.hp), [5, 5, 5]);
});
test('dummy takes damage, breaks once with its own effect event, and respawns at 75', () => {
  const sim = make(), dummy = sim.targets[1];
  sim.hit(dummy, { damage: 74, owner: 'local', volley: 1 }); assert.equal(dummy.hp, 1);
  sim.hit(dummy, { damage: 8, owner: 'local', volley: 1 }); sim.hit(dummy, { damage: 8, owner: 'local', volley: 1 });
  assert.equal(dummy.hp, 0); assert.equal(sim.events.filter(e => e.type === 'kill' && e.targetKind === 'dummy').length, 1);
  for (let i = 0; i < 280; i++) sim.step({});
  assert.equal(dummy.hp, 75); assert.equal(dummy.maxHp, 75);
});
test('player rejects direct self-owned shots and tracks external damage without negative health', () => {
  const sim = make(); assert.equal(sim.damagePlayer(999, 'local'), 0); assert.equal(sim.player.hp, 500);
  assert.equal(sim.damagePlayer(120, 'opponent'), 120); assert.equal(sim.player.hp, 380);
  assert.equal(sim.damagePlayer(999, 'opponent'), 380); assert.equal(sim.player.hp, 0);
  sim.reset(); sim.explode({ x: 0, z: 0, arrived: 12 }, 1);
  // A heavy volley lands slightly harder at the centre than its flat blast figure.
  const centre = Math.round(explosionFor(12).damage * splashFalloff(0, explosionFor(12).radius, 12));
  assert.equal(sim.player.hp, RULES.playerHealth - centre);
  assert.ok(centre > explosionFor(12).damage, 'the heavy core should add something');
  assert.ok(centre < explosionFor(12).damage * 1.1, 'but barely');
});
test('own orb explosions respect falloff, cover, blast boundaries and invulnerability',()=>{
 const blast=explosionFor(12);
 const at=distance=>Math.round(blast.damage*splashFalloff(distance,blast.radius,12));
 const center=make();center.explode({x:0,z:0,arrived:12},1);assert.equal(center.player.hp,500-at(0));
 const edge=make();edge.explode({x:2,z:0,arrived:12},1);
 assert.equal(edge.player.hp,500-at(2));
 assert.ok(edge.player.hp>center.player.hp&&edge.player.hp<500,'the rim must still hurt less than the centre');
 const outside=make();outside.explode({x:4,z:0,arrived:12},1);assert.equal(outside.player.hp,500);
 const blocked=make();blocked.colliders.push({x:1,z:0,w:.2,d:4});blocked.explode({x:2,z:0,arrived:12},1);assert.equal(blocked.player.hp,500);
 const dev=make();dev.dev.invulnerable=true;dev.explode({x:0,z:0,arrived:12},1);assert.equal(dev.player.hp,500);
 const single=make();single.explode({x:0,z:0,arrived:1},1);assert.equal(single.player.hp,500);
});
test('Static hex and lightning remain safe for their owner',()=>{
 const sim=make();sim.hex();sim.stepHex(RULES.hexFormationTime);sim.hex();
 for(let i=0;i<240;i++)sim.step({spray:true,aimX:1,aimZ:0});
 assert.equal(sim.player.hp,500);
});
test('health is separate from splash, which falls off for both targets and dummies', () => {
  const sim = make(); sim.targets = [
    { ...sim.targets[1], id: 'near', x: 0, z: .2 }, { ...sim.targets[1], id: 'far', x: 0, z: 2.5 },
  ]; sim.explode({ x: 0, z: 0, arrived: 12 }, 1);
  assert.ok(sim.targets[0].hp < sim.targets[1].hp); assert.ok(sim.targets.every(t => t.maxHp === 75 && t.hp < 75));
});
