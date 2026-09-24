import test from 'node:test';
import assert from 'node:assert/strict';
import { kickRifle, RIFLE } from '../src/weapons/rifle.js';

test('hip-fire recoil knocks the cone slightly, builds over a burst, stays capped', () => {
 const r = { sway: 0, kick: 0 };
 kickRifle(r, 1); const first = Math.abs(r.sway);
 assert.ok(first > 0 && first <= RIFLE.recoilKick, 'one shot is a small knock');
 for (let i = 0; i < 40; i++) kickRifle(r, i % 2 ? 1 : .9);
 assert.ok(Math.abs(r.sway) <= RIFLE.recoilMax + 1e-9, 'never past the cap');
 assert.equal(r.kick, 1, 'a long burst is at full build');
 assert.ok(RIFLE.recoilMax < RIFLE.hipSpread, 'the knock stays smaller than the spread itself');
 assert.ok(RIFLE.recoilSettleAim > RIFLE.recoilSettle, 'aimed in, it settles faster');
});
