import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, explosionFor, splashFalloff, SPLASH, segmentBox, RULES } from '../src/simulation.js';
import { deadwater, mapColliders, PROP_TYPES } from '../src/maps.js';
import { RULES as FULL_RULES } from '../src/config/gameplay.js';
const FULL = FULL_RULES.targetHealth; // a practice target's full health

const map = extra => ({ width: 100, depth: 100, spawn: { x: 0, z: 0 }, buildings: [], props: [], fences: [], targets: [], ...extra });
const step = (sim, n, input = {}) => { for (let i = 0; i < n; i++) sim.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, ...input }); };
const volley = (sim, count, x = 6, z = 0) => { for (let i = 0; i < count; i++) sim.seed(); sim.launch(x, z); step(sim, 40); };

test('small props break at their configured health from launched hits, removing its collider and preserving impact direction', () => {
  for (const type of ['crate', 'barrel', 'cactus', 'sign', 'hay', 'deadwood']) {
    const sim = new Simulation(map({ props: [{ type, x: 4, z: 0, label: 'TEST' }] }));
    volley(sim, type === 'cactus' ? 1 : 2, 4, 0);
    assert.equal(sim.props[0].hp, 0, type); assert.equal(sim.colliders.length, 0);
    const breaks = sim.events.filter(e => e.type === 'propBreak'); assert.equal(breaks.length, 1);
    assert.ok(breaks[0].directionX > 0); assert.ok(Number.isFinite(breaks[0].directionZ));
    step(sim, 60, { moveX: 1 }); assert.ok(sim.player.x > 4.7, 'destroyed cover must be walkable');
    sim.reset(); assert.equal(sim.props[0].hp, PROP_TYPES[type].health); assert.equal(sim.colliders.length, 1);
  }
});

test('drifting orbs dissipate against props and targets without damaging them', () => {
  for (const type of ['crate', 'barrel', 'cactus']) {
    const sim = new Simulation(map({ props: [{ type, x: 3, z: 0 }] }));
    sim.seed(); step(sim, 220);
    assert.equal(sim.shots.length, 0); assert.equal(sim.props[0].hp, PROP_TYPES[type].health);
    assert.ok(!sim.events.some(e => e.type === 'propBreak'));
  }
  const sim = new Simulation(map({ targets: [{ id: 'a', x: 3, z: 0 }] }));
  sim.seed(); step(sim, 220); assert.equal(sim.shots.length, 0); assert.equal(sim.targets[0].hp, FULL);
});

test('fences and permanent fixtures survive full volleys', () => {
  for (const type of ['well', 'tower', 'cart']) {
    const sim = new Simulation(map({ props: [{ type, x: 4, z: 0 }] }));
    volley(sim, 12, 8, 0);
    assert.equal(sim.props[0].hp, null); assert.equal(sim.colliders.length, 1);
    assert.ok(!sim.events.some(e => e.type === 'propBreak' || e.type === 'explosion'));
  }
});

test('one orb has no explosion; two through twelve produce one increasingly sized blast at the captured point', () => {
  let previousRadius = 0, previousDamage = 0;
  for (let n = 1; n <= 12; n++) {
    const sim = new Simulation(map()); volley(sim, n, 6, 2);
    const blasts = sim.events.filter(e => e.type === 'explosion');
    assert.equal(blasts.length, n === 1 ? 0 : 1);
    if (n === 1) { assert.equal(explosionFor(1), null); continue; }
    assert.equal(blasts[0].x, 6); assert.equal(blasts[0].z, 2); assert.equal(blasts[0].count, n);
    const blast = explosionFor(n);
    assert.ok(blast.radius > previousRadius && blast.damage > previousDamage);
    previousRadius = blast.radius; previousDamage = blast.damage;
    assert.equal(sim.volleys.size, 0);
  }
  assert.equal(previousRadius, 2.7 * 1.12);
});

test('orb blasts increase strongly after three and reach 145 without changing radius',()=>{
 assert.equal(explosionFor(1),null);
 for(let count=2;count<=12;count++){
  const power=(count-2)/10,blast=explosionFor(count);
  if(count<=3)assert.ok(Math.abs(blast.damage-(6+power*54)*1.15*(145/200))<1e-8);
  else assert.ok(blast.damage>(6+power*54)*1.15);
  assert.equal(blast.radius,(.55+power*2.15)*(count===12?1.12:1));
 }
 assert.equal(explosionFor(12).damage,145);
});

test('oversized developer volleys scale splash radius and damage with matching visual event',()=>{
 const normal=explosionFor(12),large=explosionFor(48);
 assert.equal(large.radius,normal.radius*2);assert.equal(large.damage,normal.damage*2);
 const sim=new Simulation(map({targets:[{id:'near',x:0,z:1,maxHp:500},{id:'far',x:0,z:5,maxHp:500},{id:'outside',x:0,z:7,maxHp:500}]}));
 sim.explode({x:0,z:0,arrived:48},1);
 assert.ok(sim.targets[0].hp<sim.targets[1].hp);assert.ok(sim.targets[1].hp<500);assert.equal(sim.targets[2].hp,500);
 const event=sim.events.find(e=>e.type==='explosion');assert.equal(event.radius,large.radius);assert.equal(event.damage,large.damage);
});

test('splash damage falls off and cannot reach outside its radius', () => {
  const sim = new Simulation(map({ targets: [
    { id: 'near', x: 6, z: .85 }, { id: 'far', x: 6, z: 2.3 }, { id: 'outside', x: 6, z: 3.2 },
  ] }));
  volley(sim, 12);
  assert.ok(sim.targets[0].hp < sim.targets[1].hp && sim.targets[1].hp < FULL);
  assert.equal(sim.targets[2].hp, FULL);
});

test('solid cover blocks splash damage and intercepted orbs cannot explode beyond it', () => {
  const sim = new Simulation(map({ fences: [{ x: 6.7, z: 0, length: 4, axis: 'z' }], targets: [{ id: 'covered', x: 7.4, z: 0 }] }));
  volley(sim, 12); assert.equal(sim.targets[0].hp, FULL);
  const blocked = new Simulation(map({ fences: [{ x: 3, z: 0, length: 8, axis: 'z' }] }));
  volley(blocked, 12); assert.ok(!blocked.events.some(e => e.type === 'explosion'));
});

test('only arriving orbs contribute to explosion size', () => {
  const sim = new Simulation(map({ fences: [{ x: 3, z: 0, length: 8, axis: 'z' }] }));
  sim.seed(); sim.seed(); sim.shots[1].x = 6; sim.shots[1].z = 2;
  sim.seed(); sim.shots[2].x = 6; sim.shots[2].z = -2;
  sim.launch(6, 0); step(sim, 40);
  const blast = sim.events.find(e => e.type === 'explosion');
  assert.equal(blast.count, 2); assert.equal(blast.radius, .55);
});

test('splash breaks nearby props with an outward impulse', () => {
  const sim = new Simulation(map({ props: [{ type: 'barrel', x: 6, z: 1.5 }] }));
  volley(sim, 12);
  assert.equal(sim.props[0].hp, 0);
  const e = sim.events.find(e => e.type === 'propBreak'); assert.equal(e.directionX, 0); assert.ok(e.directionZ > 0);
});

test('stationary refilling uses the increased rate after the same launch delay', () => {
  const still = new Simulation(map()), moving = new Simulation(map());
  for (const sim of [still, moving]) { for (let i = 0; i < 12; i++) sim.seed(); sim.launch(20, 0); }
  step(still, 60); step(moving, 60, { moveZ: 1 });
  assert.equal(still.ammo, 0); assert.equal(moving.ammo, 0);
  assert.ok(Math.abs(still.rechargeProgress / moving.rechargeProgress - RULES.stationaryRecharge) < 1e-6);
  step(still, 12); step(moving, 12, { moveZ: 1 });
  assert.equal(still.ammo, 1); assert.equal(moving.ammo, 0);
  step(still, 600); assert.equal(still.ammo, 12);
});

test('both saloon and supplies doors are open while the intervening walls still collide', () => {
  const colliders = mapColliders(deadwater);
  for (const [ax, az, bx, bz] of [[-5, -5, -9, -5], [-12, -12, -12, -8], [12, -1, 12, -4], [6, -7, 10, -7]]) {
    assert.ok(!colliders.some(b => segmentBox(ax, az, bx, bz, b, RULES.radius) !== null), `door ${ax},${az}`);
  }
  assert.ok(colliders.some(b => segmentBox(-5, -8, -9, -8, b) !== null));
});

test('volleys aimed at permanent structures converge and explode on the near face', () => {
  const sim = new Simulation(map({ props: [{ type: 'boulder', x: 6, z: 0 }], targets:[{id:'behind',x:9,z:0}] }));
  volley(sim, 6);
  const blast=sim.events.find(e=>e.type==='explosion');
  assert.ok(blast);assert.equal(blast.count,6);assert.ok(blast.x<6);
  assert.equal(sim.targets[0].hp,FULL);
});

test('stone arch opening is walkable while its pillars remain solid',()=>{
  const sim=new Simulation(map({props:[{type:'ruinedArch',x:0,z:3,angle:0}]}));
  sim.movePlayer(0,6);assert.ok(sim.player.z>5.9);
  sim.player.x=1.4;sim.player.z=0;sim.movePlayer(0,6);assert.ok(sim.player.z<3);
});

test('quick shot creates and immediately launches one orb, spending one ammo',()=>{
 const sim=new Simulation(map());sim.launch(6,0,true);
 assert.equal(sim.seeds.length,0);assert.equal(sim.shots.length,1);assert.equal(sim.shots[0].launched,true);assert.equal(sim.ammo,11);
 sim.launch(6,0,true);assert.equal(sim.shots.length,1,'fire interval prevents rapid retrigger');
 step(sim,40);assert.ok(!sim.events.some(e=>e.type==='explosion'),'single orb has no explosion');
});
test('quick shot dry fires without ammo and regular launch commands still need placed orbs',()=>{
 const sim=new Simulation(map());sim.ammo=0;sim.launch(6,0,true);assert.equal(sim.shots.length,0);assert.ok(sim.events.some(e=>e.type==='cock'));
 sim.ammo=12;sim.launch(6,0);assert.equal(sim.shots.length,0);
});

test('splash lands a little harder at the core and the rim than it used to',()=>{
 // The shape the curve replaced: full at the centre, a quarter at the rim.
 const previous=(distance,radius)=>1-.75*distance/radius;
 for(const count of [4,8,12]){
  const {radius}=explosionFor(count);
  for(const fraction of [0,.25,.5,.75,1]){
   const distance=radius*fraction;
   const now=splashFalloff(distance,radius,count),before=previous(distance,radius);
   assert.ok(now>=before,`${count} orbs at ${fraction*100}% fell from ${before} to ${now}`);
   assert.ok(now<=before*1.25+1e-9,`${count} orbs at ${fraction*100}% rose too far, ${before} to ${now}`);
  }
 }
});

test('the core bonus belongs to heavy volleys, the rim bonus to all of them',()=>{
 const {radius}=explosionFor(12);
 // A small volley gains nothing at its centre.
 assert.ok(Math.abs(splashFalloff(0,radius,4)-1)<1e-9,'four orbs should still land flat at the core');
 assert.ok(splashFalloff(0,radius,12)>splashFalloff(0,radius,8),'and a full volley more than a partial one');
 assert.ok(splashFalloff(0,radius,8)>splashFalloff(0,radius,4));
 // The rim is lifted whatever the size.
 for(const count of [2,4,8,12])assert.ok(splashFalloff(radius,radius,count)>=SPLASH.edge-1e-9);
});

test('splash still stops dead at the blast boundary',()=>{
 const {radius}=explosionFor(12);
 assert.equal(splashFalloff(radius*1.001,radius,12),0);
 assert.equal(splashFalloff(5,0,12),0,'a blast with no radius reaches nothing');
});
