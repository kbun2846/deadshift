import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { cropSegments, affectCrop, stepCrops } from '../src/crops.js';
import { deadwater, mapColliders, mapProps, PROP_TYPES, BROKEN_CRATE_SHARE, crateIsBroken } from '../src/maps.js';
const map = { width: 80, depth: 80, spawn: { x: -10, z: 0 }, buildings: [], props: [], targets: [], fences: [], crops: [{ id: 'test', x: 0, z: 0, w: 14, d: 16, visibility: 4.2 }] };
const clear = () => true;
test('56 varied crop sections tile the field exactly and have reciprocal neighbors', () => {
  const crops = cropSegments(map);
  assert.equal(crops.length, 56);
  assert.ok(Math.abs(crops.reduce((n, s) => n + s.w * s.d, 0) - 224) < 1e-8);
  assert.ok(new Set(crops.map(s => s.w.toFixed(2))).size > 10);
  for (const s of crops) for (const id of s.neighbors) assert.ok(crops.find(n => n.id === id).neighbors.includes(s.id));
});
test('each section burns eight seconds from its own ignition; spread is staged and reset restores it', () => {
  const sim = new Simulation(map), first = sim.crops[0]; affectCrop(sim, first);
  for (let i = 0; i < 20; i++) stepCrops(sim, 1 / 60, clear);
  assert.equal(sim.crops.filter(s => s.state === 'burning').length, 1);
  for (let i = 20; i < 479; i++) stepCrops(sim, 1 / 60, clear);
  assert.equal(first.state, 'burning'); assert.ok(sim.crops.some(s => s.burnAge < 2 && s.state === 'burning'));
  stepCrops(sim, 1 / 60, clear); assert.equal(first.state, 'gone');
  for (let i = 0; i < 1800; i++) stepCrops(sim, 1 / 60, clear);
  assert.ok(sim.crops.every(s => s.state === 'gone'));
  sim.reset(); assert.ok(sim.crops.every(s => s.state === 'standing' && !s.charred));
});
test('C ignites crops only after windup, and cover blocks ignition', () => {
  for (const blocked of [false, true]) {
    const sim = new Simulation(map);
    if (blocked) sim.colliders.push({ x: -8.5, z: 0, w: .3, d: 30 });
    const input = { spray: true, aimX: 1, aimZ: 0 };
    for (let i = 0; i < 10; i++) sim.step(input);
    assert.ok(sim.crops.every(s => s.state === 'standing'));
    for (let i = 0; i < 10; i++) sim.step(input);
    assert.equal(sim.crops.some(s => s.state === 'burning'), !blocked);
  }
});
test('explosions ignite touched sections, single orbs do not, cover blocks both fire and spread', () => {
  const sim = new Simulation(map);
  sim.explode({ x: -8, z: 0, arrived: 1 }, 1); assert.ok(sim.crops.every(s => s.state === 'standing'));
  sim.explode({ x: -8, z: 0, arrived: 12 }, 2); assert.ok(sim.crops.some(s => s.state === 'burning'));
  const count = sim.crops.filter(s => s.state === 'burning').length;
  for (let i = 0; i < 60; i++) stepCrops(sim, 1 / 60, () => false);
  assert.equal(sim.crops.filter(s => s.state === 'burning').length, count);
  sim.reset(); sim.colliders.push({ x: -7.5, z: 0, w: .3, d: 30 });
  sim.explode({ x: -8, z: 0, arrived: 12 }, 3); assert.ok(sim.crops.every(s => s.state === 'standing'));
});
test('hex pulses and rotating edges destroy crops as dust without fire; burning crops extinguish', () => {
  const sim = new Simulation(map); sim.player.x = 0; sim.hex();
  for (const n of sim.hexOrbs) { n.age=1; n.x += n.vx; n.z += n.vz; }
  sim.hex(); sim.stepHexSpin(.1);
  assert.ok(sim.crops.some(s => s.state === 'gone'));
  assert.ok(sim.crops.every(s => s.state !== 'burning'));
  assert.ok(sim.events.some(e => e.type === 'cropDust'));
  const s = sim.crops.find(s => s.state === 'standing'); affectCrop(sim, s); affectCrop(sim, s, true);
  assert.equal(s.state, 'gone'); assert.equal(s.burnAge, 0);
});
test('remote farm has only one nearby house and sparse solid cover across the expanded land', () => {
  assert.ok(deadwater.width * deadwater.depth > 128 * 114 * 3.5);
  const f = deadwater.crops[0]; assert.ok(Math.hypot(f.x, f.z) > 120);
  assert.deepEqual(deadwater.buildings.filter(b => Math.hypot(b.x - f.x, b.z - f.z) < 40).map(b => b.id), ['farmhouse']);
  const props = deadwater.props.filter(p => ['deadTree', 'stump', 'boulder'].includes(p.type));
  // Natural cover is a minority of the map's solid cover — the built pieces
  // carry most of it — and every one of these is a real non-destructible box.
  const cover = deadwater.props.filter(p => PROP_TYPES[p.type].health === null);
  assert.ok(props.length > 10, `only ${props.length} natural cover props`);
  assert.ok(props.length < cover.length * .45, `${props.length} of ${cover.length} cover props are natural`);
  const colliders = mapColliders(deadwater);
  for (const p of props) assert.ok(colliders.some(c => c.x === p.x && c.z === p.z && !c.destructible));
  // Nothing within the farm's own field, so the crops stay walkable cover.
  const field = deadwater.crops[0];
  for (const p of cover) assert.ok(Math.abs(p.x - field.x) > field.w / 2 || Math.abs(p.z - field.z) > field.d / 2,
    `${p.type} at ${p.x},${p.z} sits inside the crop field`);
});


test('fire deals exactly 25 health per second to the player and targets, including self-lit fire and dodging', () => {
  const sim = new Simulation(map), s = sim.crops[0];
  sim.player.x = s.x; sim.player.z = s.z; sim.player.dodgeRemaining = 1;
  sim.targets = [{ id: 'fire-target', x: s.x, z: s.z, hp: 100, maxHp: 100, flash: 0 }];
  affectCrop(sim, s);
  for (let i = 0; i < 60; i++) stepCrops(sim, 1 / 60, () => false);
  assert.ok(Math.abs(sim.player.hp - 475) < 1e-8);
  assert.ok(Math.abs(sim.targets[0].hp - 75) < 1e-8);
  sim.player.x = -30; sim.targets[0].z = 30;
  stepCrops(sim, 1, () => false);
  assert.ok(Math.abs(sim.player.hp - 475) < 1e-8);
  assert.ok(Math.abs(sim.targets[0].hp - 75) < 1e-8);
});

test('burning boundaries do not stack damage and only remaining fire time causes damage', () => {
  const sim = new Simulation(map), a = sim.crops[0], b = sim.crops[1];
  sim.player.x = a.x + a.w / 2; sim.player.z = a.z;
  affectCrop(sim, a); affectCrop(sim, b);
  stepCrops(sim, .25, () => false);
  assert.equal(sim.player.hp, 493.75);
  a.burnAge = b.burnAge = 7.9;
  stepCrops(sim, .5, () => false);
  assert.ok(Math.abs(sim.player.hp - 491.25) < 1e-8);
  const hp = sim.player.hp; stepCrops(sim, 1, () => false); assert.equal(sim.player.hp, hp);
});

test('fire kills fragile dummies once, scorch grows gradually, and electricity preserves existing scorch', () => {
  const sim = new Simulation(map), s = sim.crops[0];
  const dummy = { id: 'dummy', kind: 'dummy', x: s.x, z: s.z, hp: 5, maxHp: 75, flash: 0 };
  sim.targets = [dummy]; affectCrop(sim, s);
  stepCrops(sim, .5, () => false); assert.equal(dummy.hp, 0); assert.ok(dummy.respawn > 0);
  assert.equal(sim.events.filter(e => e.type === 'kill').length, 1);
  stepCrops(sim, .5, () => false); assert.equal(sim.events.filter(e => e.type === 'kill').length, 1);
  assert.ok(s.scorch > 0 && s.scorch < .2);
  const scorch = s.scorch; affectCrop(sim, s, true); assert.equal(s.scorch, scorch);
  assert.equal(sim.stats.bestVolley, 0);
});


test('broken crates are a stable minority, and only crates are ever broken',()=>{
 const props=mapProps(deadwater);
 const crates=props.filter(p=>p.type==='crate');
 const broken=crates.filter(p=>p.broken);
 assert.ok(broken.length>0,'some crates should already have given way');
 assert.ok(broken.length<crates.length*.45,`${broken.length} of ${crates.length} crates are broken`);
 assert.ok(Math.abs(broken.length/crates.length-BROKEN_CRATE_SHARE)<.18,
  `${(broken.length/crates.length*100).toFixed(0)}% broken against a ${BROKEN_CRATE_SHARE*100}% target`);
 assert.equal(props.filter(p=>p.type!=='crate'&&p.broken).length,0,'nothing but a crate can be broken');
 // Derived from position, so the same crates are broken on every run.
 assert.deepEqual(mapProps(deadwater).filter(p=>p.broken).map(p=>p.id),broken.map(p=>p.id));
 // And it stays purely cosmetic: same footprint, same health, same cover.
 for(const p of broken){
  assert.equal(p.health,PROP_TYPES.crate.health);
  assert.equal(p.w,PROP_TYPES.crate.w);assert.equal(p.d,PROP_TYPES.crate.d);
 }
 // Overridable per prop, both ways.
 assert.equal(crateIsBroken({type:'crate',x:0,z:0,broken:true},0),true);
 assert.equal(crateIsBroken({type:'crate',x:0,z:0,broken:false},0),false);
 assert.equal(crateIsBroken({type:'barrel',x:0,z:0},0),false);
});
