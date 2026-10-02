// The floating move stick's response (touch-controls.js stickSpeed /
// stickResponse, MOVE_STICK in config/controls.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { stickSpeed, stickResponse, MOVE_STICK, TOUCH_TAP } from '../src/ui/touch-controls.js';

const R = MOVE_STICK.size * MOVE_STICK.travel;

test('the stick is bigger, with a longer pull for full speed (owner: "slightly bigger", "move it a little bit more")', () => {
  assert.ok(MOVE_STICK.size > 124, 'wider than the old 124 px ring');
  assert.ok(R > 124 * .4, 'a longer pull than the old 50 px');
  assert.ok(R * MOVE_STICK.full > 124 * .4, 'full speed takes more of a push than before');
  assert.ok(MOVE_STICK.curve > 1.45, 'small pulls finer than before');
  assert.ok(MOVE_STICK.dead > 0 && MOVE_STICK.dead < MOVE_STICK.full && MOVE_STICK.full <= 1);
  assert.ok(R * MOVE_STICK.dead >= TOUCH_TAP.slop, 'a drag starts from a standstill');
  assert.ok(MOVE_STICK.smoothing <= .06, 'no added lag');
});

test('nothing inside the dead zone', () => {
  assert.equal(stickSpeed(0, R), 0);
  assert.equal(stickSpeed(R * MOVE_STICK.dead * .5, R), 0);
  assert.equal(stickSpeed(R * MOVE_STICK.dead, R), 0);
  assert.ok(stickSpeed(R * MOVE_STICK.dead + .5, R) > 0, 'and moving just past it');
  assert.deepEqual(stickResponse(1, -1, R), { x: 0, z: 0, speed: 0 });
});

test('speed only grows with the pull, small pulls creep, and full speed comes before the rim', () => {
  let last = -1;
  for (let px = 0; px <= R * 1.5; px += .25) {
    const s = stickSpeed(px, R);
    assert.ok(s >= last - 1e-12, `monotonic at ${px}px`); assert.ok(s >= 0 && s <= 1);
    last = s;
  }
  assert.equal(stickSpeed(R * MOVE_STICK.full, R), 1, 'full speed at MOVE_STICK.full of the pull');
  assert.equal(stickSpeed(R, R), 1, 'at the rim');
  assert.equal(stickSpeed(R * 3, R), 1, 'and past it');
  // Ease-in: halfway between the dead zone and full speed is well under half speed.
  const mid = R * (MOVE_STICK.dead + MOVE_STICK.full) / 2;
  assert.ok(stickSpeed(mid, R) < .4, 'a half push walks under half speed');
  // Finer than the old stick for the same small thumb movement (30 px).
  const old = px => { const t = Math.min(1, px / 49.6); return t < .16 ? 0 : ((t - .16) / .84) ** 1.45; };
  for (const px of [15, 20, 30, 40]) assert.ok(stickSpeed(px, R) < old(px), `${px}px is slower than before`);
});

test('the walk keeps the pull\'s exact direction', () => {
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 7) for (const k of [.3, .6, 1, 1.4]) {
    const dx = Math.cos(a) * R * k, dy = Math.sin(a) * R * k, out = stickResponse(dx, dy, R);
    assert.ok(Math.abs(Math.atan2(out.z, out.x) - Math.atan2(dy, dx)) < 1e-9 || Math.abs(Math.abs(Math.atan2(out.z, out.x) - Math.atan2(dy, dx)) - Math.PI * 2) < 1e-9);
    assert.ok(Math.abs(Math.hypot(out.x, out.z) - out.speed) < 1e-12);
  }
  const full = stickResponse(0, -R, R);
  assert.equal(full.x, 0); assert.equal(full.z, -1, 'straight up at full speed');
});
