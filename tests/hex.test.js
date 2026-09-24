import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, RULES, hexPower, hexPulseDamageAt, damagePerOrb } from '../src/simulation.js';
import { RULES as FULL_RULES } from '../src/config/gameplay.js';
const FULL = FULL_RULES.targetHealth; // a practice target's full health
const make = (targets = [], buildings = []) => new Simulation({ width: 80, depth: 80, spawn: { x: 0, z: 0 }, buildings, targets, props: [], fences: [] });
const tick = sim => sim.step({});

test('hex pulse stages, falloff and zaps receive another 40 percent damage',()=>{
 for(const distance of [0,.2,1,3,6,12]){
  const maturity=Math.min(1,distance/6),power=hexPower(distance),oldDamage=Math.round(10+140*maturity*maturity);
  assert.equal(power.damage,Math.round(oldDamage*159.6)/100);
  assert.equal(power.zapDamage,Math.round(Math.round(6+14*maturity)*159.6)/100);
  for(const depth of [0,.25,.5,1]){
   const oldHit=Math.round(oldDamage*(.25+.75*(1-depth)**2));
   assert.equal(hexPulseDamageAt(power,power.radius*depth),Math.round(oldHit*159.6)/100);
  }
 }
 assert.equal(RULES.hexPulseDamage,239.4);assert.equal(RULES.hexEdgeDamage,31.92);
});

test('second X is ignored during formation and requires a fresh press after the delay',()=>{
 const sim=make();sim.dev.cooldowns=true;sim.hex();sim.drainEvents();
 sim.hex();assert.equal(sim.hexSpin,null);assert.equal(sim.hexOrbs.length,6);
 for(let i=0;i<32;i++){tick(sim);sim.hex();assert.equal(sim.hexSpin,null);}
 tick(sim);assert.equal(sim.hexSpin,null);
 sim.hex();assert.ok(sim.hexSpin);assert.equal(sim.hexOrbs.length,0);
 assert.equal(sim.drainEvents().filter(e=>e.type==='hexPulse').length,1);
});
test('hex costs ten ammo and reserves the spent supply, then releases capacity', () => {
  const sim = make(); sim.hex(); assert.equal(sim.ammo, 2); assert.equal(sim.hexOrbs.length, 6);
  for (let i = 0; i < 90; i++) tick(sim);
  assert.equal(sim.ammo, 2); assert.equal(sim.hexOrbs.length, 6);
  sim.launch(4, 0); assert.equal(sim.hexOrbs.length, 6);
  sim.hex(); assert.equal(sim.hexOrbs.length, 0);
  for (let i = 0; i < 100; i++) tick(sim);
  assert.ok(sim.ammo > 0);
});
test('hex requires ten available ammo and preserves regular orbs', () => {
  const sim = make(); sim.seed(); sim.seed(); sim.seed(); sim.hex(); assert.equal(sim.hexOrbs.length, 0); assert.equal(sim.ammo, 9);
});
test('hex pulses strike once before rotating edge zaps and do not damage deep center', () => {
  const sim = make([{ id: 'pulse', x: 4.5, z: 0 }, { id: 'edge', x: 3, z: Math.sqrt(3) }, { id: 'center', x: 0, z: 0 }]);
  sim.hex(); for (const orb of sim.hexOrbs) { orb.age = RULES.hexFormationTime; orb.x = Math.cos(orb.index * Math.PI / 3) * 4; orb.z = Math.sin(orb.index * Math.PI / 3) * 4; }
  sim.hex(); assert.ok(sim.targets[0].hp < sim.targets[1].hp); assert.equal(sim.targets[1].hp, FULL); assert.equal(sim.targets[2].hp, FULL);
  const pulse = sim.events.find(e => e.type === 'hexPulse'); assert.equal(pulse.edges.length, 6); assert.equal(pulse.strands.length, 0);
  assert.ok(!sim.events.some(e => e.type === 'explosion'));
});
test('hex orbs expire electrically at range without damage and reset clears them', () => {
  const sim = make(); sim.hex(); for (let i = 0; i < 330; i++) tick(sim);
  assert.equal(sim.hexOrbs.length, 0); assert.equal(sim.events.filter(e => e.type === 'hexFizzle').length, 6);
  sim.reset(); sim.hex(); sim.reset(); assert.equal(sim.hexOrbs.length, 0);
});
test('missing vertices do not create replacement edges across the hexagon', () => {
  const sim = make(); sim.hex(); sim.hexOrbs.splice(0, 1); for (let i = 0; i < 60; i++) tick(sim); sim.hex();
  assert.equal(sim.events.find(e => e.type === 'hexPulse').edges.length, 4);
});

test('caster stays within all six expanding sides and is released by detonation', () => {
  for (let direction = 0; direction < 12; direction++) {
    const sim = make(); sim.hex(); const angle = direction * Math.PI / 6;
    for (let i = 0; i < 170; i++) {
      sim.step({ moveX: Math.cos(angle), moveZ: Math.sin(angle) });
      assert.ok(sim.withinHex(sim.player.x, sim.player.z));
    }
    assert.ok(Math.hypot(sim.player.x, sim.player.z) > 3, 'caster can move within the expanding area');
    const before = { ...sim.player }; sim.hex();
    for (let i = 0; i < 60; i++) sim.step({ moveX: Math.cos(angle), moveZ: Math.sin(angle) });
    assert.ok(Math.hypot(sim.player.x - before.x, sim.player.z - before.z) > 5);
  }
});

test('remaining vertices keep the caster contained; final dissipation releases them', () => {
  const sim = make(); sim.hex(); sim.hexOrbs.splice(0, 5);
  for (let i = 0; i < 100; i++) sim.step({ moveX: 0, moveZ: 1 });
  assert.ok(sim.withinHex(sim.player.x, sim.player.z));
  for (let i = 0; i < 330; i++) sim.step({ moveX: 0, moveZ: 1 });
  assert.equal(sim.hexOrbs.length, 0); assert.ok(sim.player.z > RULES.hexRange);
});

test('short zaps reach beyond pulse splash from vertices and edge midpoints, but not far targets', () => {
  const sim = make([{ id: 'vertex', x: 8, z: 0 }, { id: 'edge', x: 6.232, z: 3.598 }, { id: 'far', x: 9, z: 0 }]);
  sim.hex(); for (const orb of sim.hexOrbs) { orb.age = RULES.hexFormationTime; orb.x = Math.cos(orb.index * Math.PI / 3) * 6; orb.z = Math.sin(orb.index * Math.PI / 3) * 6; }
  sim.hex(); sim.stepHexSpin(0); assert.ok(Math.abs(sim.targets[0].hp-(FULL-2*RULES.hexEdgeDamage))<1e-8); assert.equal(sim.targets[1].hp, FULL-RULES.hexEdgeDamage); assert.equal(sim.targets[2].hp, FULL);
  const pulse = sim.events.find(e => e.type === 'hexPulse');
  const edgeZap = sim.events.find(e => e.type === 'hexZap' && e.b.x === 6.232);
  assert.ok(edgeZap); assert.ok(Math.hypot(edgeZap.a.x - 4.5, edgeZap.a.z - 2.598) < .01);
});

test('hex edge connections and nearby zaps pass through scenery walls', () => {
  const sim = make([{ id: 'behind', x: 8, z: 0, maxHp: 100 }]); sim.hex(); // light, so the zaps finish it
  for (const orb of sim.hexOrbs) { orb.age = RULES.hexFormationTime; orb.x = Math.cos(orb.index * Math.PI / 3) * 6; orb.z = Math.sin(orb.index * Math.PI / 3) * 6; }
  sim.colliders.push({ x: 7, z: 0, w: .2, d: 5 }); sim.hex(); for (let i = 0; i < 60; i++) tick(sim);
  assert.equal(sim.targets[0].hp, 0);
});

test('expanding hex destroys breakable scenery without spending its orbs on walls',()=>{
 const sim=new Simulation({width:80,depth:80,spawn:{x:0,z:0},buildings:[],fences:[],targets:[],props:[{type:'barrel',x:-1.2,z:0}]});
 sim.colliders.push({x:0,z:0,w:6,d:.2});sim.hex();
 for(let i=0;i<40;i++)sim.stepHex(RULES.step);
 assert.equal(sim.props[0].hp,0);assert.equal(sim.hexOrbs.length,6);
 assert.equal(sim.events.filter(e=>e.type==='hexFizzle').length,0);
});

test('expansion pushes nearby victims outward smoothly without contact damage', () => {
  const sim = make([{ id: 'near', x: .8, z: 0 }, { id: 'other', x: -.8, z: 0 }]); sim.hex();
  for (let i = 0; i < 90; i++) {
    const previous = sim.targets.map(t => t.x); tick(sim);
    sim.targets.forEach((t, j) => assert.ok(Math.abs(t.x - previous[j]) <= RULES.hexSpeed * 1.8 * RULES.step + .0001));
  }
  assert.ok(sim.targets[0].x > 3.8); assert.ok(sim.targets[1].x < -3.8);
  assert.ok(sim.targets.every(t => t.hp === FULL)); assert.equal(sim.hexOrbs.length, 6);
});

test('push respects walls and distant victims remain untouched', () => {
  const sim = make([{ id: 'near', x: 1, z: 0 }, { id: 'far', x: 15, z: 0 }]);
  sim.colliders.push({ x: 2.5, z: 0, w: .2, d: 4 }); sim.hex();
  for (let i = 0; i < 120; i++) tick(sim);
  assert.ok(sim.targets[0].x <= 2.5 - .1 - .66 + .001); assert.equal(sim.targets[1].x, 15);
});

test('pulse radius, damage and zap reach grow to a bounded ranged maximum', () => {
  const close = hexPower(.2), middle = hexPower(3), far = hexPower(6);
  assert.ok(close.radius < middle.radius && middle.radius < far.radius);
  assert.ok(close.damage < middle.damage && middle.damage < far.damage);
  assert.ok(close.reach < middle.reach && middle.reach < far.reach);
  assert.deepEqual(hexPower(20), far);
  for (const distance of [.2, 6]) {
    const sim = make([{ id: 'victim', x: distance + .15, z: 0 }]); sim.hex();
    for (const orb of sim.hexOrbs) { orb.age = RULES.hexFormationTime; orb.x = Math.cos(orb.index * Math.PI / 3) * distance; orb.z = Math.sin(orb.index * Math.PI / 3) * distance; }
    sim.hex(); const damage = FULL - sim.targets[0].hp;
    assert.ok(distance < 1 ? damage <= 19 : damage >= 64);
    assert.equal(sim.events.find(e => e.type === 'hexPulse').nodes[0].power.radius, hexPower(distance).radius);
  }
});

test('ten-ammo cast can coexist with two regular orbs without exceeding capacity', () => {
  const sim = make(); sim.seed(); sim.seed(); sim.hex();
  assert.equal(sim.hexOrbs.length, 6); assert.equal(sim.seeds.length, 2); assert.equal(sim.ammo, 0);
  for (let i = 0; i < 90; i++) tick(sim);
  assert.equal(sim.ammo, 0); sim.hexOrbs.splice(0, 1);
  for (let i = 0; i < 60; i++) tick(sim);
  assert.ok(sim.ammo + sim.seeds.length + Math.ceil(sim.hexOrbs.length * RULES.hexCost / 6) <= 12);
});

test('six overlapping pulses apply once; normal orbs and per-side zaps remain independent', () => {
  const sim = make([{ id: 'victim', x: 0, z: 0 }]); sim.targets[0].hp = 500;
  sim.hex(); sim.hexOrbs.forEach(o=>o.age=RULES.hexFormationTime); sim.hex();
  const power = hexPower(0);
  assert.equal(sim.targets[0].hp, 500 - power.damage);
  assert.equal(sim.events.find(e => e.type === 'hexPulse').strands.length, 0);
  assert.equal(sim.events.filter(e => e.type === 'hit').length, 1);
  sim.seed(); sim.launch(0, 0);
  for (let i = 0; i < 20; i++) tick(sim);
  assert.ok(Math.abs(sim.targets[0].hp-(500 - power.damage - 6 * RULES.hexEdgeDamage - damagePerOrb(1)))<1e-8);
});

test('accurate mature hex pulses deal hefty damage with steep falloff before the rotating zaps', () => {
  const power = hexPower(6);
  assert.equal(hexPulseDamageAt(power, 0), 239.4);
  assert.equal(hexPulseDamageAt(power, power.radius / 2), 105.34);
  assert.equal(hexPulseDamageAt(power, power.radius), 60.65);
  assert.equal(hexPulseDamageAt(power, power.radius + .01), 0);
  for (const distance of [0, power.radius / 2, power.radius]) {
    const sim = make([{ id: 'victim', x: 6 + distance, z: 0 }]);
    sim.targets[0].hp = sim.targets[0].maxHp = 500;
    sim.hex();
    for (const orb of sim.hexOrbs) { orb.age = RULES.hexFormationTime; orb.x = Math.cos(orb.index * Math.PI / 3) * 6; orb.z = Math.sin(orb.index * Math.PI / 3) * 6; }
    sim.hex();
    assert.equal(sim.targets[0].hp, 500 - hexPulseDamageAt(power, distance));
    assert.equal(sim.events.filter(e => e.type === 'hit').length, 1);
  }
  assert.equal(hexPower(0).damage, 15.96);
  assert.ok(hexPower(1).damage < 23.94, 'early detonation remains weak');
});

test('hex rotates clockwise once around its frozen center and ends after one second', () => {
  const sim = make(); sim.hex();
  for (let i = 0; i < 150; i++) tick(sim);
  sim.hex(); const spin = sim.hexSpin, start={...spin.nodes[0]};
  sim.player.x = 20; sim.stepHexSpin(.25);
  const a = spin.edges.find(e => e.index === 0).a;
  assert.ok(Math.abs(a.x+start.z) < 1e-6); assert.ok(Math.abs(a.z-start.x) < 1e-6);
  assert.equal(spin.originX, 0); assert.equal(spin.originZ, 0);
  sim.stepHexSpin(.75); assert.equal(sim.hexSpin, null);
  assert.ok(Math.abs(spin.edges[0].a.x - start.x) < 1e-6);
  assert.ok(Math.abs(spin.edges[0].a.z - start.z) < 1e-6);
});

test('each rotating side deals exactly one 31.92-damage zap to each nearby victim', () => {
  const sim = make([{ id: 'near', x: 8, z: 0 }, { id: 'far', x: 10, z: 0 }]);
  sim.targets.forEach(t => { t.hp = t.maxHp = 500; }); sim.hex();
  for (const orb of sim.hexOrbs) { orb.age = RULES.hexFormationTime; orb.x = Math.cos(orb.index * Math.PI / 3) * 6; orb.z = Math.sin(orb.index * Math.PI / 3) * 6; }
  sim.hex(); assert.equal(sim.targets[0].hp, 500);
  for (let i = 0; i < 180; i++) tick(sim);
  assert.ok(Math.abs(sim.targets[0].hp-(500-6*RULES.hexEdgeDamage))<1e-8); assert.equal(sim.targets[1].hp, 500);
  const zaps = sim.events.filter(e => e.type === 'hexZap');
  assert.equal(zaps.length, 6); assert.equal(new Set(zaps.map(e => e.side)).size, 6);
});

test('30-second cooldown starts on cast, permits detonation, and blocks recasting until ready', () => {
  const sim = make(); sim.hex(); assert.equal(sim.hexCooldown, 30);
  for (let i = 0; i < 60; i++) tick(sim);
  sim.hex(); assert.ok(sim.hexSpin); const spin = sim.hexSpin; sim.hex(); assert.equal(sim.hexSpin, spin);
  for (let i = 0; i < 1739; i++) tick(sim);
  assert.ok(sim.hexCooldown > 0); sim.hex(); assert.equal(sim.hexOrbs.length, 0); assert.equal(sim.ammo, 12);
  tick(sim); assert.equal(sim.hexCooldown, 0); sim.hex(); assert.equal(sim.hexOrbs.length, 6);
  sim.reset(); assert.equal(sim.hexCooldown, 0); assert.equal(sim.hexSpin, null);
  sim.ammo = 9; sim.hex(); assert.equal(sim.hexCooldown, 0);
});


