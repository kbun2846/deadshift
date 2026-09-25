import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { SURGE, SCATTER } from '../src/config/gameplay.js';
import { xAbilityState } from '../src/ui/x-ability-state.js';
const make = w => { const s = new Simulation({ width: 80, depth: 80, spawn: { x: 0, z: 0 }, buildings: [], fences: [], props: [], targets: [] }); s.weapon = w; s.reset(); return s; };
const ticks = (s, n, input = {}) => { for (let i = 0; i < n; i++) s.step({ aimX: 1, aimZ: 0, ...input }); };

test('a nova cut short by death still owes its cooldown, and ends (surgeEnd)', () => {
 const s = make('rifle'); s.step({ aimX: 1, aimZ: 0, surge: true }); ticks(s, Math.ceil(SURGE.charge * 60) + 2); assert.equal(s.surge.phase, 'active');
 s.player.hp = 0; s.step({ aimX: 1, aimZ: 0 }); assert.equal(s.surge.phase, 'idle'); assert.ok(s.events.some(e => e.type === 'surgeEnd'));
 s.respawn({ x: 0, z: 0 }); assert.ok(s.surge.cooldown > SURGE.cooldown - 1);
});
test('a joiner\'s own copy mirrors the nova and blast but never runs them', () => {
 const s = make('rifle'); s.predictOnly = true; Object.assign(s.surge, { phase: 'charging', t: 1.9 });
 ticks(s, 30); assert.equal(s.surge.phase, 'charging'); assert.ok(!s.events.some(e => e.type === 'surgeStart' || e.type === 'propBreak'));
});
test('shells already fired keep flying after the shooter dies', () => {
 const s = make('shotgun'); s.step({ aimX: 1, aimZ: 0, scatter: true }); s.scatter.armedFor = SCATTER.prime; s.step({ aimX: 1, aimZ: 0, scatter: true });
 s.player.hp = 0; ticks(s, 90); assert.equal(s.scatterShells.length, 0); assert.equal(s.events.filter(e => e.type === 'scatterBurst').length, SCATTER.shells * SCATTER.split);
});
test('the dev damage multiplier cannot push a blast past its cap', () => {
 const s = make('shotgun'); s.dev.damageOut = 4; const t = { id: 't', kind: 'robot', x: 1.3, z: 0, baseX: 1.3, hp: 9000, maxHp: 9000, flash: 0, respawn: 0 }; s.targets.push(t);
 s.step({ aimX: 1, aimZ: 0, scatter: true }); s.scatter.armedFor = SCATTER.prime; s.step({ aimX: 1, aimZ: 0, scatter: true }); ticks(s, 90); assert.ok(9000 - t.hp <= SCATTER.max + 1e-6, 'dealt ' + (9000 - t.hp));
});
test('the hex reads as not ready without ten orbs in hand', () => {
 assert.equal(xAbilityState({ weapon: 'static', hexOrbs: [], hexSpin: null, hexCooldown: 0, ammo: 6 }), 'cooldown');
 assert.equal(xAbilityState({ weapon: 'static', hexOrbs: [], hexSpin: null, hexCooldown: 0, ammo: 12 }), 'ready');
});
