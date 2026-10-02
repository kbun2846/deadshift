// Target lock with the arrow keys: picking the target the player means,
// switching cleanly, keeping it through short losses, and never locking for
// them (target-lock.js; owner 2026-10-01: "make aim with arrow keys easier
// and tracking desired target").
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTargetLock, TARGET_LOCK } from '../src/target-lock.js';

const player = { x: 0, z: 0 };
const tick = 1 / 60;
// Screen: 40 px a metre, you at (400, 300), x right, z down.
const at = (x, z) => ({ sx: 400 + x * 40, sy: 300 + z * 40 });
const board = (id, x, z, extra = {}) => ({ id, x, z, ...at(x, z), ...extra });
const robot = (id, x, z, extra = {}) => ({ id, x, z, vx: 0, vz: 0, mover: true, ...at(x, z), ...extra });
const me = { x: 400, y: 300 };
const keyPress = (time, cursor, extra = {}) => ({ cursor, origin: me, aim: { x: 0, z: 0 }, time, chord: true, ...extra });
const run = (lock, list, n, find = null, chase = null) => { for (let i = 0; i < n; i++) lock.update(list, player, tick, find, chase); };

test('from idle "that way" counts from you as well as from the aim dot, never one behind you', () => {
 // Aiming left: the dot is 7 m left of you. Right picks the nearest one on your right.
 const list = [board('right-near', 3, 0), board('right-far', 8, 0), board('left-of-dot', -9, 0)];
 const lock = createTargetLock();
 assert.equal(lock.press(list, 1, 0, keyPress(0, { x: 400 - 280, y: 300 })), 'locked');
 assert.equal(lock.id, 'right-near');
 // Aiming right, the dot past a target that stands between you and it: Left
 // is the one on your left, not the one between you and the dot.
 const between = [board('between', 2, 0), board('left', -6, 0)];
 const lock2 = createTargetLock();
 lock2.press(between, -1, 0, keyPress(0, { x: 400 + 280, y: 300 }));
 assert.equal(lock2.id, 'left');
 // Up with a target up and to the right of you, left of the dot.
 const lock3 = createTargetLock();
 lock3.press([board('up-right', 2, -1.5), board('far-up-left', -3, -8)], 0, -1, keyPress(0, { x: 400 + 280, y: 300 }));
 assert.equal(lock3.id, 'up-right');
});

test('a player or robot that way comes before practice targets; the one that just shot you before the rest', () => {
 const lock = createTargetLock();
 // The board straight ahead, the robot 40° off and farther: the robot.
 lock.press([board('board', 4, 0), robot('bot', 6, -5)], 1, 0, keyPress(0, me));
 assert.equal(lock.id, 'bot');
 // Two robots that way, the farther one just shot you.
 const lock2 = createTargetLock();
 lock2.press([robot('near', 4, -.5), robot('shooter', 6, .5, { threat: true })], 1, 0, keyPress(0, me));
 assert.equal(lock2.id, 'shooter');
 // With no enemy that way, practice targets as before.
 const lock3 = createTargetLock();
 lock3.press([board('board', 4, 0), robot('bot', -6, 0)], 1, 0, keyPress(0, me));
 assert.equal(lock3.id, 'board');
});

test('never into a building you are not in; one behind a fence only if nothing clear is that way', () => {
 const lock = createTargetLock();
 assert.equal(lock.press([robot('indoors', 4, 0, { inside: true })], 1, 0, keyPress(0, me)), 'none');
 assert.equal(lock.id, null, 'the press is not wasted on a lock that would let go at once');
 const lock2 = createTargetLock();
 lock2.press([robot('fenced', 4, 0, { blocked: true }), robot('clear', 5.5, .4)], 1, 0, keyPress(0, me));
 assert.equal(lock2.id, 'clear');
});

test('two arrows pressed together are one diagonal press, decided from where the first started', () => {
 const list = [board('right', 4, 0), board('down-right', 4, 4)];
 const lock = createTargetLock();
 assert.equal(lock.press(list, 1, 0, keyPress(10, me)), 'locked'); assert.equal(lock.id, 'right');
 assert.equal(lock.press(list, 0, 1, keyPress(10.04, { x: 500, y: 300 })), 'switched');
 assert.equal(lock.id, 'down-right', 'Right then Down 40 ms later: down-right');
 // Far apart in time they are two presses: Down from the right one.
 const lock2 = createTargetLock();
 lock2.press(list, 1, 0, keyPress(10, me));
 lock2.press(list, 0, 1, keyPress(10.5, { x: 560, y: 300 }));
 assert.equal(lock2.id, 'down-right', 'the next one down from the right one (a plain swap)');
 // A diagonal with nothing that way leaves the first press standing.
 const lock3 = createTargetLock();
 lock3.press([board('right', 4, 0)], 1, 0, keyPress(0, me));
 lock3.press([board('right', 4, 0)], 0, -1, keyPress(.03, me));
 assert.equal(lock3.id, 'right');
 // Locked on a board, Right (nothing further: let go) then Up a moment
 // later: the diagonal from the board picks the one up and to the right.
 const row = [board('a', 3, 0), board('b', 7, -3)];
 const lock4 = createTargetLock();
 lock4.press(row, 1, 0, keyPress(0, me)); assert.equal(lock4.id, 'a');
 assert.equal(lock4.press(row, 1, 0, keyPress(1, me)), 'switched'); assert.equal(lock4.id, 'b');
 assert.equal(lock4.press(row, 1, 0, keyPress(2, me)), 'released');
 assert.equal(lock4.press(row, 0, -1, keyPress(2.05, me)), 'none', 'nothing up-right of b: stays let go');
});

test('switching onto a moving target glides there (no snap) and the arrow that switched does not push a lead', () => {
 const a = robot('a', 4, 0), b = robot('b', 4, 5), list = [a, b];
 const lock = createTargetLock();
 lock.press(list, 1, 0, keyPress(0, me)); run(lock, list, 60, null, { nudgeX: 0, nudgeZ: 0 });
 assert.ok(Math.hypot(lock.point.x - 4, lock.point.z) < .05);
 assert.equal(lock.press(list, 0, 1, keyPress(2, { x: 560, y: 300 })), 'switched');
 const held = { nudgeX: 0, nudgeZ: 1 }; // Down is still held
 lock.update(list, player, tick, null, held);
 assert.ok(lock.point.z < 1, 'one tick later it is still on its way, not on b: ' + lock.point.z);
 run(lock, list, 40, null, held);
 assert.ok(Math.hypot(lock.point.x - 4, lock.point.z - 5) < .05, 'and arrives on b, not pushed past it by the held arrow');
 // Let go and press Down again: now it leads.
 run(lock, list, 2, null, { nudgeX: 0, nudgeZ: 0 });
 run(lock, list, 20, null, held);
 assert.ok(lock.point.z > 5.5, 'a fresh hold leads: ' + lock.point.z);
});

test('a walker is sat on, not trailed (the glide hands over to tracking while they move)', () => {
 const t = robot('walker', 6, 0), list = [t];
 const lock = createTargetLock();
 lock.press(list, 1, 0, keyPress(0, me));
 t.vz = 5;
 let worst = 0;
 for (let i = 0; i < 90; i++) {
  t.z += t.vz * tick; Object.assign(t, at(t.x, t.z));
  lock.update(list, player, tick, null, {});
  // Where they are after this tick (their reported position is a tick old).
  if (i > 30) worst = Math.max(worst, Math.hypot(lock.point.x - t.x, lock.point.z - (t.z + t.vz * tick)));
 }
 assert.equal(lock.phase, 'track');
 assert.ok(worst < .05, 'on a 5 m/s walker within 5 cm (it trailed by about .4 m before): ' + worst);
});

test('a short loss behind cover keeps the lock and never follows the hidden body; a long one lets go and picks the same one back up', () => {
 const t = robot('r', 6, 0), list = [t];
 const lock = createTargetLock(), find = () => t;
 lock.press(list, 1, 0, keyPress(0, me)); run(lock, list, 40, find, {});
 // Hidden (blocked) and walking down while hidden: the aim drifts on with
 // the motion it last saw (none), not after the hidden body.
 t.blocked = true;
 for (let i = 0; i < 30; i++) { t.z += 5 * tick; t.vz = 5; Object.assign(t, at(t.x, t.z)); lock.update([], player, tick, find, {}); }
 assert.equal(lock.id, 'r', 'half a second behind cover: still locked');
 assert.ok(Math.abs(lock.point.z) < .2, 'and the aim did not follow it behind the wall: ' + lock.point.z);
 run(lock, [], Math.ceil(TARGET_LOCK.blockedLimit * 60), find, {});
 assert.equal(lock.id, null); assert.equal(lock.remembered, 'r');
 // It shows again: the same one is taken back.
 t.blocked = false; run(lock, [t], 1, find, {});
 assert.equal(lock.id, 'r', 're-acquired when it reappears');
 // Not after aiming by hand, nor after the memory runs out.
 const lock2 = createTargetLock();
 lock2.press([t], 1, 0, keyPress(0, me)); t.inside = true; run(lock2, [], 1, () => t, {});
 assert.equal(lock2.id, null); assert.equal(lock2.remembered, 'r', 'into a building: let go at once, remembered');
 lock2.forget(); t.inside = false; run(lock2, [t], 5, () => t, {});
 assert.equal(lock2.id, null, 'aimed by hand since: not taken back');
 const lock3 = createTargetLock();
 lock3.press([t], 1, 0, keyPress(0, me)); t.inside = true; run(lock3, [], 1, () => t, {}); t.inside = false;
 run(lock3, [], Math.ceil(TARGET_LOCK.reacquire * 60) + 2, () => t, {}); run(lock3, [t], 5, () => t, {});
 assert.equal(lock3.id, null, 'gone too long: not taken back');
});

test('a step past the screen edge is kept for a moment; well off the screen lets go', () => {
 const t = robot('r', 6, 0), lock = createTargetLock();
 lock.press([t], 1, 0, keyPress(0, me));
 t.edge = true; run(lock, [], Math.floor(TARGET_LOCK.hold * 60) - 2, () => t, {});
 assert.equal(lock.id, 'r', 'at the edge: kept');
 run(lock, [], 4, () => t, {}); assert.equal(lock.id, null, 'too long at the edge'); assert.equal(lock.remembered, 'r');
 const lock2 = createTargetLock(); t.edge = false;
 lock2.press([t], 1, 0, keyPress(0, me)); t.offscreen = true; run(lock2, [], 1, () => t, {});
 assert.equal(lock2.id, null, 'well off the screen: at once');
});

test('a kill goes idle, for players and robots too: nobody is locked for you', () => {
 const a = robot('a', 4, 0), b = robot('b', 6, .2), lock = createTargetLock();
 lock.press([a, b], 1, 0, keyPress(0, me)); run(lock, [a, b], 10, null, {});
 const before = lock.ended;
 run(lock, [b], 30, () => null, {});
 assert.equal(lock.id, null); assert.equal(lock.remembered, null);
 assert.equal(lock.ended, before + 1, 'counted as ending by itself (main.js holds the facing lock off until you turn)');
});

test('on a player or robot an arrow with nobody that way leads them; the same arrow tapped twice lets go', () => {
 const t = robot('r', 4, 0), lock = createTargetLock();
 lock.press([t], 1, 0, keyPress(0, me)); run(lock, [t], 30, null, {});
 assert.equal(lock.press([t], 1, 0, keyPress(1, me, { keep: true })), 'kept');
 assert.equal(lock.press([t], 1, 0, keyPress(1.5, me, { keep: true })), 'kept', 'a slow second tap still leads');
 assert.equal(lock.press([t], 1, 0, keyPress(1.7, me, { keep: true })), 'released', 'a quick double tap lets go');
 assert.equal(lock.id, null);
 assert.equal(lock.ended, 0, 'let go by hand, not by itself');
});

test('quick taps flick between neighbours and back to the last one', () => {
 const list = [board('left', -3, 0), board('mid', 2, 0), board('right', 5, 0)];
 const lock = createTargetLock();
 lock.press(list, 1, 0, keyPress(0, me)); assert.equal(lock.id, 'mid');
 lock.press(list, 1, 0, keyPress(.2, me)); assert.equal(lock.id, 'right');
 lock.press(list, -1, 0, keyPress(.4, me)); assert.equal(lock.id, 'mid', 'Left from right: back to the one before');
 lock.press(list, -1, 0, keyPress(.6, me)); assert.equal(lock.id, 'left');
});
