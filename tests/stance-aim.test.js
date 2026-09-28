// v0.990a: Sightline's stance aimed without a mouse (weapons/stance-aim.js).
// The move stick or WASD / the arrows steer the laser's end at a set speed:
// fine at a small push, quick at a full one, slower scoped, slowed (a little)
// over a body at a small push only. v0.992a: quicker to answer; with aim
// assist, side to side only, it follows half a target's sideways movement and
// drifts toward it while pushed; a swipe's pick is glided onto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStanceAim, stepStanceAim, resetStanceAim, glideTo, STANCE_AIM } from '../src/weapons/stance-aim.js';

const dt = 1 / 60, player = { x: 0, z: 0, aimX: 1, aimZ: 0 };
const run = (state, seconds, opts) => { for (let t = 0; t < seconds - 1e-9; t += dt) stepStanceAim(state, { player, dt, ...opts }); return state; };

test('stance aim: starts out along the aim, or at the point aimed at', () => {
  const a = stepStanceAim(createStanceAim(), { player, dt });
  assert.equal(a.x, STANCE_AIM.start); assert.equal(a.z, 0);
  const b = stepStanceAim(createStanceAim(), { player: { ...player, aimPointX: 0, aimPointZ: 30 }, dt });
  assert.equal(b.x, 0); assert.equal(b.z, 30);
  // A point close by is pushed out to where a rifle shot makes sense.
  const c = stepStanceAim(createStanceAim(), { player: { ...player, aimPointX: 3, aimPointZ: 0 }, dt });
  assert.ok(Math.abs(c.x - STANCE_AIM.start) < 1e-9);
});

test('stance aim: still without a push, full speed after the ramp', () => {
  const s = run(createStanceAim(), 1, {});
  assert.equal(s.x, STANCE_AIM.start); assert.equal(s.z, 0);
  run(s, STANCE_AIM.ramp, { pushZ: 1 });
  const z = s.z; run(s, 1, { pushZ: 1 });
  assert.ok(Math.abs(s.z - z - STANCE_AIM.speed) < .05, `${(s.z - z).toFixed(2)} m in a second at a full push`);
});

test('stance aim: faster than a running player at a full push, scoped too', () => {
  const s = run(createStanceAim(), STANCE_AIM.ramp, { pushZ: 1, scoped: true });
  const z = s.z; run(s, 1, { pushZ: 1, scoped: true });
  assert.ok(s.z - z > 7.2, 'scoped full push outruns a 7.2 m/s runner');
  assert.ok(s.z - z < STANCE_AIM.speed, 'scoped is slower than unscoped');
});

test('stance aim: a small push is fine work', () => {
  const small = run(createStanceAim(), 1, { pushZ: .2 }), full = run(createStanceAim(), 1, { pushZ: 1 });
  assert.ok(small.z < full.z * .25, `${small.z.toFixed(2)} m vs ${full.z.toFixed(2)} m`);
  // A tapped key (a tenth of a second) moves well under a metre.
  const tap = run(createStanceAim(), .1, { pushX: 1, digital: true });
  assert.ok(tap.x - STANCE_AIM.start < 1 && tap.x > STANCE_AIM.start);
});

test('stance aim: friction over a body at a small push only, and no pull', () => {
  const body = [{ x: STANCE_AIM.start, z: 0 }];
  const free = run(createStanceAim(), .25, { pushZ: .3 }), over = run(createStanceAim(), .25, { pushZ: .3, bodies: body });
  assert.ok(over.z < free.z * .8, 'slower over a body at a small push');
  assert.equal(over.x, STANCE_AIM.start, 'never pulled sideways toward the body');
  const fullFree = run(createStanceAim(), .1, { pushZ: 1 }), fullOver = run(createStanceAim(), .1, { pushZ: 1, bodies: body });
  assert.ok(Math.abs(fullOver.z - fullFree.z) < 1e-9, 'a full push is not slowed');
  // Still, with a body right beside the point: nothing moves it.
  const still = run(createStanceAim(), 1, { bodies: [{ x: STANCE_AIM.start + .4, z: .3 }] });
  assert.equal(still.x, STANCE_AIM.start); assert.equal(still.z, 0);
});

test('stance aim: never closer than the minimum, and a reset starts over', () => {
  const s = run(createStanceAim(), 3, { pushX: -1 });
  assert.ok(Math.hypot(s.x, s.z) >= STANCE_AIM.min - 1e-9);
  resetStanceAim(s); assert.equal(s.on, false);
  stepStanceAim(s, { player: { ...player, aimX: 0, aimZ: 1 }, dt });
  assert.ok(Math.abs(s.z - STANCE_AIM.start) < 1e-9);
});

test('stance aim: answers at once (v0.992a)', () => {
  // Most of full speed from the first step, all of it a tenth of a second on.
  const s = run(createStanceAim(), dt, { pushZ: 1 });
  assert.ok(s.z / dt >= STANCE_AIM.speed * STANCE_AIM.floor - 1e-6);
  const t = run(createStanceAim(), .1, { pushZ: 1 }), z = t.z; run(t, dt, { pushZ: 1 });
  assert.ok(Math.abs((t.z - z) / dt - STANCE_AIM.speed) < 1e-6);
});

// A runner 20 m out, crossing at 6 m/s; the laser on him.
const runner = (z = 0) => ({ id: 'r', x: 20, z, vx: 0, vz: 6 });
const onRunner = () => { const s = createStanceAim(); stepStanceAim(s, { player: { ...player, aimPointX: 20, aimPointZ: 0 }, dt }); return s; };

test('stance aim assist: follows half of a target\'s sideways movement, never its range', () => {
  const s = onRunner();
  let b = runner();
  for (let i = 0; i < 30; i++) { stepStanceAim(s, { player, bodies: [b], assist: true, dt }); b = { ...b, z: b.z + b.vz * dt }; }
  const theirs = Math.atan2(b.z, b.x), mine = Math.atan2(s.z, s.x);
  assert.ok(Math.abs(mine / theirs - STANCE_AIM.assistTrack) < .05, `followed ${(mine / theirs).toFixed(2)} of it`);
  assert.ok(Math.abs(Math.hypot(s.x, s.z) - 20) < 1e-6, 'the range is untouched');
  // Assist off: it stays where it was.
  const off = onRunner(); b = runner();
  for (let i = 0; i < 30; i++) { stepStanceAim(off, { player, bodies: [b], dt }); b = { ...b, z: b.z + b.vz * dt }; }
  assert.equal(off.z, 0);
});

test('stance aim assist: drifts toward a target only while pushed, and only within reach of it', () => {
  const standing = { id: 's', x: 20, z: 1.2, vx: 0, vz: 0 };
  const idle = onRunner(); run(idle, .5, { bodies: [standing], assist: true });
  assert.equal(idle.z, 0, 'no push: no drift onto a standing target');
  // Pushing out (range), the drift brings the line onto it sideways.
  const pushed = onRunner(); run(pushed, 1.2, { pushX: .6, bodies: [standing], assist: true });
  const line = Math.atan2(pushed.z, pushed.x), target = Math.atan2(1.2, 20);
  assert.ok(Math.abs(line - target) < .01, 'settled on its line');
  // Out of reach (3 m to the side at 20 m): nothing.
  const far = onRunner(); run(far, .5, { pushX: .3, bodies: [{ id: 'f', x: 20, z: 3, vx: 0, vz: 0 }], assist: true });
  assert.ok(Math.abs(far.z) < 1e-9);
});

test('stance aim: a swipe\'s pick is glided onto, then only helped like any other', () => {
  const s = onRunner(), b = { id: 'p', x: 28, z: -9, vx: 0, vz: 0 };
  glideTo(s, 'p'); run(s, .25, { bodies: [b], assist: true });
  assert.ok(Math.hypot(s.x - b.x, s.z - b.z) < .1, 'on it');
  assert.equal(s.gliding, 0);
  // Gone from sight: the pick is dropped.
  glideTo(s, 'p'); run(s, dt, { bodies: [], assist: true });
  assert.equal(s.gliding, 0);
});
