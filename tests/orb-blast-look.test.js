import test from 'node:test';
import assert from 'node:assert/strict';
import { orbBlastScale } from '../src/effects/effects-detail.js';

test('orb blasts look bigger with every orb: small at 2-3, medium 4-7, full size around 10', () => {
  for (let n = 3; n <= 16; n++) assert.ok(orbBlastScale(n) > orbBlastScale(n - 1), `${n} orbs should look bigger than ${n - 1}`);
  assert.ok(orbBlastScale(2) <= .35 && orbBlastScale(3) < .45, 'two or three orbs are a small pop');
  for (let n = 4; n <= 7; n++) assert.ok(orbBlastScale(n) >= .45 && orbBlastScale(n) < .8, `${n} orbs is medium`);
  assert.ok(Math.abs(orbBlastScale(10) - 1) < 1e-9, 'ten orbs is the full-size blast');
  assert.ok(orbBlastScale(9) > .85 && orbBlastScale(11) < 1.15);
  assert.equal(orbBlastScale(40), orbBlastScale(16), 'huge volleys stop growing');
});
