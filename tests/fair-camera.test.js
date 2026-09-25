import test from 'node:test';
import assert from 'node:assert/strict';
import { fairFov } from '../src/render/camera-framing.js';

const extents = a => { const t = Math.tan(fairFov(a) * Math.PI / 360); return { h: t, w: t * a, area: t * t * a }; };
test('the view is fair on every screen shape: nobody sees further than a 16:9 screen, and most see as much ground', () => {
 const ref = extents(16 / 9);
 assert.ok(Math.abs(fairFov(16 / 9) - 40) < 1e-9, '16:9 keeps its 40 degrees');
 for (const a of [.45, .56, .75, 1, 4 / 3, 1.6, 16 / 9, 2.1, 21 / 9, 32 / 9]) {
  const e = extents(a);
  assert.ok(e.w <= ref.w + 1e-9 && e.h <= ref.w + 1e-9, a + ': reach capped at the 16:9 width');
  if (a >= .6 && a <= 16 / 9) assert.ok(Math.abs(e.area - ref.area) < 1e-6, a + ': same ground area');
 }
});
