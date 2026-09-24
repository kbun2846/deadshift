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

test('locked on a player, the aim chases: a walker is kept up with, a dodge pulls ahead, arrows lead', async () => {
 const { createTargetLock, TARGET_LOCK } = await import('../src/target-lock.js');
 const run = (speed, seconds, nudgeX = 0) => {
  const lock = createTargetLock(), player = { x: 0, z: 0 };
  const t = { id: 'p', x: 5, z: 0, sx: 500, sy: 300 };
  lock.select([t], { x: 0, y: 300 }, 1, 0, { x: 5, z: 0 });
  for (let i = 0; i < 30; i++) lock.update([t], player, 1 / 60, null, {});
  for (let i = 0; i < seconds * 60; i++) { t.z += speed / 60; lock.update([t], player, 1 / 60, null, { nudgeX: 0, nudgeZ: nudgeX }); }
  return Math.hypot(lock.point.x - t.x, lock.point.z - t.z);
 };
 assert.ok(run(4, 1) < .05, 'a walker is kept up with');
 assert.ok(run(14.6, .24) > .5, 'a dodge pulls ahead');
 assert.ok(run(7.2, 1, 1) < run(7.2, 1), 'leading with the arrow closes the gap');
 assert.ok(TARGET_LOCK.chaseSpeed < 7.2);
});
