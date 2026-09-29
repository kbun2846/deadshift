// The wire (v0.999a, owner: joiners on a phone hotspot lagged, rubber-banded
// and answered slowly): packed inputs, the FAST channel and its dropping
// when backed up, and the interpolation delay that follows the link.
import test from 'node:test';
import assert from 'node:assert/strict';
import { packInput, unpackInput, playerInput, readMessage, INPUT_FLAGS, playerState, applyPlayerState } from '../src/net/protocol.js';
import { sendOn, FAST_TYPES, CONGESTED } from '../src/net/peer-transport.js';
import { interpolationDelayFor } from '../src/net/client-session.js';
import { NETWORK } from '../src/config/network.js';

test('an input packs to a short array and reads back the same, cleaned', () => {
 const raw = { seq: 42, ...playerInput({ moveX: .70710678, moveZ: -.70710678, aimX: .123456, aimZ: .99, fire: true, sheathX: true, dodge: true, aimPointX: 12.3456, aimPointZ: -4.5, autoRange: 'touch' }) };
 const packed = packInput(raw);
 assert.ok(Array.isArray(packed) && JSON.stringify(packed).length < 70, JSON.stringify(packed));
 const back = readMessage({ t: 'input', inputs: [packed], ack: 0 }).inputs[0];
 assert.equal(back.seq, 42);
 for (const k of INPUT_FLAGS) assert.equal(back[k], !!raw[k], k);
 assert.ok(Math.abs(back.moveX - raw.moveX) < 1e-3 && Math.abs(back.aimZ - raw.aimZ) < 1e-3);
 assert.equal(back.aimPointX, 12.35); assert.equal(back.autoRange, 'touch');
 const idle = packInput({ seq: 1, ...playerInput({}) });
 assert.deepEqual(idle, [1, 0, 0, 0, 0, 0], 'an idle one is six numbers');
 assert.equal(unpackInput(idle).fire, undefined);
 // Old-style objects still read.
 assert.equal(readMessage({ t: 'input', inputs: [{ seq: 3, fire: true }] }).inputs[0].fire, true);
 assert.ok(NETWORK.inputRedundancy >= 10, 'a sixth of a second of inputs in every message');
});

test('snapshots, inputs and pings take the FAST channel, are dropped (not queued) while it is backed up, and the rest stay reliable', () => {
 const channel = (bufferedAmount = 0, bufferSize = 0) => ({ open: true, sent: [], bufferSize, dataChannel: { bufferedAmount }, send(m) { this.sent.push(m.t); } });
 const main = channel(), fast = channel();
 for (const t of ['snapshot', 'input', 'ping', 'pong', 'welcome', 'choose', 'leave']) sendOn(main, fast, { t });
 assert.deepEqual(fast.sent, ['snapshot', 'input', 'ping', 'pong']);
 assert.deepEqual(main.sent, ['welcome', 'choose', 'leave']);
 assert.deepEqual([...FAST_TYPES].sort(), ['input', 'ping', 'pong', 'snapshot']);
 const full = channel(CONGESTED + 1), queued = channel(0, 3);
 assert.equal(sendOn(main, full, { t: 'snapshot' }), false, 'dropped while backed up');
 assert.equal(sendOn(main, queued, { t: 'input' }), false, 'or while PeerJS holds any');
 assert.equal(sendOn(full, null, { t: 'welcome' }), true, 'a reliable message always goes');
 const solo = channel();
 sendOn(solo, null, { t: 'snapshot' }); sendOn(solo, { open: false }, { t: 'input' });
 assert.deepEqual(solo.sent, ['snapshot', 'input'], 'no FAST line: all on the one');
});

test('the interpolation delay follows the link: steady keeps the base, jittery goes further back, capped', () => {
 assert.equal(interpolationDelayFor([], NETWORK), NETWORK.interpolationDelay);
 assert.equal(interpolationDelayFor(Array(40).fill(.005), NETWORK), NETWORK.interpolationDelay, 'a steady link');
 const jittery = Array.from({ length: 40 }, (_, i) => (i % 5 === 0 ? .15 : .02));
 const d = interpolationDelayFor(jittery, NETWORK);
 assert.ok(d > .2 && d <= NETWORK.maxInterpolationDelay, d);
 assert.equal(interpolationDelayFor(Array(40).fill(2), NETWORK), NETWORK.maxInterpolationDelay, 'capped');
});

test('player states leave motion out at zero, and read it back as zero', () => {
 const s = playerState('a', { x: 1, z: 2, vx: 0, vz: 0, aimX: 1, aimZ: 0, stamina: 2, dodgeRemaining: 0, dodgeX: 0, dodgeZ: 0, staminaWait: 0, blastVX: 0, blastVZ: 0, hp: 500, maxHp: 500 });
 for (const k of ['vx', 'vz', 'dodgeRemaining', 'blastVX', 'staminaWait']) assert.ok(!(k in s), k);
 const p = { vx: 3, dodgeRemaining: .2, blastVX: 4 };
 applyPlayerState(p, s);
 assert.equal(p.vx, 0); assert.equal(p.dodgeRemaining, 0); assert.equal(p.blastVX, 0); assert.equal(p.x, 1);
});
