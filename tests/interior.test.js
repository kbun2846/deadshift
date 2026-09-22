import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, RULES } from '../src/simulation.js';
import { deadwater, dryCreek, buildingOpenings, buildingContains, buildingPoint } from '../src/maps.js';

const step = (sim, n, extra = {}) => { for (let i = 0; i < n; i++) sim.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, ...extra }); };

test('every room supports clear outward aim through each doorway', () => {
  for (const map of [deadwater, dryCreek]) for (const room of map.buildings) {
    const sim = new Simulation(map); sim.player.x = room.x; sim.player.z = room.z;
    assert.equal(sim.roofId, room.id);
    for (const opening of buildingOpenings(room)) {
      const x = (opening.a.x + opening.b.x) / 2, z = (opening.a.z + opening.b.z) / 2;
      assert.equal(sim.canAimAt(x + (x - room.x) * .5, z + (z - room.z) * .5), true, room.id + ' ' + opening.side);
    }
  }
});

test('gray-area launches converge on the near wall rather than exploding at the remote click', () => {
  const sim = new Simulation({...deadwater,props:[],targets:[]}); sim.player.x = -12; sim.player.z = -5;
  sim.seed(); sim.seed(); const ammo = sim.ammo;
  assert.equal(sim.canAimAt(-22, -5), false);
  sim.launch(-22, -5);
  assert.ok(sim.shots.every(s=>s.launched)); assert.equal(sim.ammo, ammo);
  assert.equal(sim.volley, 1); assert.ok(sim.rechargeWait>0);
  step(sim,90);
  assert.ok(sim.events.some(e=>e.type==='wall'&&e.launched));
  assert.ok(sim.events.some(e=>e.type==='explosion'&&e.x>-17&&e.x<-16));
  assert.ok(sim.events.filter(e=>e.type==='trailEnd').every(e=>e.x>-17));
  assert.equal(sim.canAimAt(-11, -4), true);
});

test('splash is blocked by walls but crosses an open doorway, including angled buildings',()=>{
  for(const angle of [0,.31,Math.PI/2]) {
    const room={id:'room',x:0,z:0,w:8,d:8,height:3,doorWidth:2.6,doors:['front'],angle};
    const target=(id,x,z)=>({id,...buildingPoint(room,x,z)});
    const sim=new Simulation({...deadwater,buildings:[room],props:[],fences:[],targets:[target('inside',0,3),target('outside',0,5),target('behind-jamb',2,3)]});
    const doorway=buildingPoint(room,0,4);
    sim.explode({...doorway,arrived:12},1);
    assert.ok(sim.targets[0].hp<100&&sim.targets[1].hp<100,'doorway blast reaches both sides');
    // Same distance and radius, but now the ray must cross intact wall.
    const shielded=new Simulation({...deadwater,buildings:[room],props:[],fences:[],targets:[target('blocked',2.5,3.2)]});
    const outside=buildingPoint(room,2.5,4.7);
    shielded.explode({...outside,arrived:12},1);
    assert.equal(shielded.targets[0].hp,100,'solid wall stops splash');
  }
});

test('the road-facing saloon window passes bullets but blocks walking', () => {
  const sim = new Simulation(deadwater); sim.player.x = -9; sim.player.z = -8;
  assert.equal(sim.canAimAt(-4, -8), true);
  sim.seed(); sim.launch(-4, -8); step(sim, 35);
  const end = sim.events.find(e => e.type === 'trailEnd');
  // The orb passes through the aim point and stops an overshoot beyond it, on
  // the same ray: the window does not stop it and nothing clamps it short.
  assert.ok(Math.abs(end.x - (-4 + RULES.launchOvershoot)) < 1e-6 && Math.abs(end.z + 8) < 1e-6,
    `orb ended at ${end.x.toFixed(3)}, ${end.z.toFixed(3)}`);
  step(sim, 90, { moveX: 1 }); assert.ok(sim.player.x <= -7 - .19 - RULES.radius + .001);
  assert.equal(sim.roofId, 'saloon');
});

test('moving inside changes which exterior positions are reachable through openings', () => {
  const sim = new Simulation(deadwater); sim.player.x = -12; sim.player.z = -5;
  assert.equal(sim.canAimAt(-3, -5), true);
  sim.player.z = -9; assert.equal(sim.canAimAt(-3, -5), false);
  sim.player.x = 0; sim.player.z = 7;
  assert.equal(sim.roofId, null); assert.equal(sim.canAimAt(-22, -5), true);
});

test('rotated rectangular interior membership uses local building coordinates', () => {
  const b = { x: 0, z: 0, w: 4, d: 10, angle: Math.PI / 2 };
  assert.equal(buildingContains(b, { x: 4, z: 0 }), true);
  assert.equal(buildingContains(b, { x: 0, z: 4 }), false);
});

test('spread orbs converge together on an angled wall and splash cannot reach the other side',()=>{
 const room={id:'angled',x:0,z:0,w:8,d:8,height:3,doorWidth:2.6,doors:['front'],angle:.27};
 const hidden=buildingPoint(room,-4.8,1);
 const sim=new Simulation({...deadwater,spawn:{x:0,z:0},buildings:[room],props:[],fences:[],targets:[{id:'hidden',...hidden}]});
 for(const [x,z] of [[0,-1],[1,0],[0,1]]){sim.seed();Object.assign(sim.shots.at(-1),buildingPoint(room,x,z));}
 const click=buildingPoint(room,-12,2);sim.launch(click.x,click.z);
 const goal={x:sim.shots[0].targetX,z:sim.shots[0].targetZ};
 assert.ok(sim.shots.every(s=>s.wallFocus&&s.targetX===goal.x&&s.targetZ===goal.z));
 step(sim,90);
 const ends=sim.events.filter(e=>e.type==='trailEnd');assert.equal(ends.length,3);
 assert.ok(ends.every(e=>Math.hypot(e.x-goal.x,e.z-goal.z)<1e-6));
 assert.equal(sim.targets[0].hp,100);
 assert.ok(sim.events.some(e=>e.type==='explosion'&&e.count===3));
});

