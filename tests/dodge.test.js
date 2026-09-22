import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, RULES } from '../src/simulation.js';
const make = () => new Simulation({ width: 60, depth: 60, spawn: { x: 0, z: 0 }, buildings: [], props: [], fences: [], targets: [] });
const finish = sim => { for (let i = 0; i < 15; i++) sim.step({}); };

test('dodge moves a modest fixed distance, with equal cardinal and diagonal travel', () => {
  for (const [moveX, moveZ] of [[1, 0], [1, 1], [0, -1]]) {
    const sim = make(); sim.step({ moveX, moveZ, dodge: true }); finish(sim);
    assert.ok(Math.abs(Math.hypot(sim.player.x, sim.player.z) - RULES.dodgeDistance) < .01);
    assert.equal(sim.player.dodgeRemaining, 0);
  }
});
test('two dodges consume stamina, third is blocked, and it replenishes over time', () => {
  const sim = make();
  for (let i = 0; i < 2; i++) { sim.step({ moveX: 1, dodge: true }); finish(sim); }
  assert.equal(sim.player.stamina, 0);
  sim.step({ moveX: 1, dodge: true }); assert.equal(sim.events.filter(e => e.type === 'dodge').length, 2);
  for (let i = 0; i < 150; i++) sim.step({});
  assert.ok(sim.player.stamina >= 1); sim.step({ moveZ: 1, dodge: true });
  assert.equal(sim.events.filter(e => e.type === 'dodge').length, 3);
  sim.reset(); assert.equal(sim.player.stamina, 2);
});
test('a standing dodge rolls the way the player faces, and the direction is captured', () => {
  const sim = make();
  // Facing along -z, standing still: the roll goes where the player is looking
  // rather than being swallowed.
  sim.step({ aimX: 0, aimZ: -1 });
  const facingX = sim.player.aimX, facingZ = sim.player.aimZ;
  sim.step({ aimX: 0, aimZ: -1, dodge: true });
  assert.equal(sim.player.stamina, 1);
  assert.ok(Math.abs(sim.player.dodgeX - facingX) < 1e-9 && Math.abs(sim.player.dodgeZ - facingZ) < 1e-9,
    `rolled ${sim.player.dodgeX},${sim.player.dodgeZ} while facing ${facingX},${facingZ}`);
});
test('a moving dodge follows the movement, and is captured rather than steered', () => {
  const sim = make();
  sim.step({ moveX: 1, aimX: 0, aimZ: -1, dodge: true });
  sim.step({ moveZ: -1 }); assert.equal(sim.player.dodgeX, 1); assert.equal(sim.player.dodgeZ, 0);
});
test('dodge respects walls and the expanding hex boundary', () => {
  const sim = make(); sim.colliders.push({ x: 1.5, z: 0, w: .2, d: 8 });
  sim.step({ moveX: 1, dodge: true }); finish(sim); assert.ok(sim.player.x <= 1.5 - .1 - RULES.radius + .001);
  sim.reset(); sim.hex(); sim.step({ moveX: 1, dodge: true });
  for (let i = 0; i < 15; i++) { sim.step({}); assert.ok(sim.withinHex(sim.player.x, sim.player.z)); }
});
test('dodge shrinks the attack hitbox and reduces damage, without granting invulnerability', () => {
  const sim = make(); sim.step({ moveX: 1, dodge: true });
  assert.equal(sim.playerHitRadius, RULES.dodgeHitRadius);
  const p = sim.player;
  assert.equal(sim.hitPlayerProjectile(p.x - 2, p.z + .28, p.x + 2, p.z + .28, { damage: 100, owner: 'enemy' }), 0);
  assert.equal(sim.hitPlayerProjectile(p.x - 2, p.z, p.x + 2, p.z, { damage: 100, owner: 'enemy' }), 50);
  assert.equal(sim.damagePlayer(100, 'local'), 0);
  finish(sim); assert.equal(sim.playerHitRadius, RULES.radius); assert.equal(sim.damagePlayer(100, 'enemy'), 100);
});

test('Nominal refills dodges faster while standing still',()=>{
 const fill=moving=>{
  const sim=make();
  sim.weapon='rifle';
  sim.player.stamina=0;sim.player.staminaWait=0;
  for(let i=0;i<900;i++){
   sim.step({moveX:moving?1:0,moveZ:0,aimX:1,aimZ:0});
   if(sim.player.stamina>=1)return i+1;
  }
  return Infinity;
 };
 const still=fill(false),walking=fill(true);
 assert.ok(still<walking,`still ${still} frames vs walking ${walking}`);
 // A bonus, not a different weapon: keep it inside a third.
 assert.ok(walking/still<1.5,`bonus was ${(walking/still).toFixed(2)}x`);
});

test('the stationary dodge bonus is Nominal only',()=>{
 for(const weapon of ['static','shotgun']){
  const sim=make();
  sim.weapon=weapon;
  sim.player.vx=sim.player.vz=0;
  assert.equal(sim.staminaRate,1,weapon);
 }
 const rifle=make();
 rifle.weapon='rifle';rifle.player.vx=rifle.player.vz=0;
 assert.ok(rifle.staminaRate>1);
 rifle.player.vx=5;
 assert.equal(rifle.staminaRate,1);
});
