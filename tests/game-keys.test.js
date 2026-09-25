import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_KEYS } from '../src/config/controls.js';
import { WEAPONS } from '../src/items.js';

test('Space shoots, E is the secondary key everywhere the controls are described', () => {
 assert.equal(GAME_KEYS.shoot, 'Space'); assert.equal(GAME_KEYS.secondary, 'KeyE'); assert.equal(GAME_KEYS.dodge, 'ControlLeft');
 for (const w of WEAPONS) {
  const keys = w.hints.keyboard.map(([k]) => k);
  assert.ok(keys.includes('LMB / SPACE'), w.id + ': LMB / SPACE shoots');
  for (const b of Object.values(w.touchButtons || {})) if (b.binding === 'E') assert.equal(b.key, GAME_KEYS.secondary);
 }
});

test('locked on a player: accurate and smooth, drifts off on a dodge or behind a wall, glides back, disengages indoors or off screen', async () => {
 const { createTargetLock, TARGET_LOCK } = await import('../src/target-lock.js');
 const setup = () => { const lock = createTargetLock(), t = { id: 'p', mover: true, x: 5, z: 0, vx: 0, vz: 0, sx: 500, sy: 300 }; lock.acquire(t, { x: 3, z: 0 }); return { lock, t }; };
 const tick = (lock, t, n, move = () => {}) => { for (let i = 0; i < n; i++) { move(t); lock.update([t], { x: 0, z: 0 }, 1 / 60, () => t, {}); } };
 const off = (lock, t) => Math.hypot(lock.point.x - t.x, lock.point.z - t.z);
 // A runner is sat on, not chased from behind.
 { const { lock, t } = setup(); tick(lock, t, 30); t.vz = 7; tick(lock, t, 60, t => { t.z += 7 / 60; }); assert.ok(off(lock, t) < .3, 'on a runner: ' + off(lock, t)); assert.equal(lock.phase, 'track'); }
 // A dodge: the aim drifts on, then after a moment glides back on.
 { const { lock, t } = setup(); tick(lock, t, 30); t.vz = 4; tick(lock, t, 10, t => { t.z += 4 / 60; });
   t.dodging = true; tick(lock, t, 14, t => { t.x += 14.6 / 60; }); assert.ok(off(lock, t) > 1, 'a dodge pulls ahead'); assert.equal(lock.phase, 'drift');
   t.dodging = false; t.vz = 0; tick(lock, t, Math.round(TARGET_LOCK.relockDelay * 60) - 2); assert.equal(lock.phase, 'wait');
   tick(lock, t, 40); assert.ok(off(lock, t) < .1, 'back on after a moment'); }
 // Behind a wall: drift; too long and it lets go.
 { const { lock, t } = setup(); tick(lock, t, 30); t.blocked = true; tick(lock, t, 10); assert.equal(lock.phase, 'drift');
   t.blocked = false; tick(lock, t, 40); assert.equal(lock.phase, 'track');
   t.blocked = true; tick(lock, t, Math.ceil(TARGET_LOCK.blockedLimit * 60) + 2); assert.equal(lock.id, null); }
 // Indoors (a building you are not in) or off the screen: let go at once.
 for (const flag of ['inside', 'offscreen']) { const { lock, t } = setup(); tick(lock, t, 5); t[flag] = true; tick(lock, t, 1); assert.equal(lock.id, null, flag); }
 // Held arrows still lead by hand.
 { const { lock, t } = setup(); tick(lock, t, 30); for (let i = 0; i < 30; i++) lock.update([t], { x: 0, z: 0 }, 1 / 60, () => t, { nudgeX: 1, nudgeZ: 0 }); assert.ok(lock.point.x > t.x + .5); }
});
