import test from 'node:test';
import assert from 'node:assert/strict';
import { setText, setStyle, setAttr } from '../src/ui/dom-writes.js';
import { buzz } from '../src/ui/haptics.js';
import { snapToEdges, EDGE_SNAP } from '../src/ui/touch-layout.js';

test('cached DOM writes skip repeats and still write changes', () => {
 let texts = 0, attrs = 0, props = 0;
 const el = { set textContent(v) { texts++; }, style: { setProperty() { props++; } }, setAttribute() { attrs++; } };
 setText(el, 'a'); setText(el, 'a'); setText(el, 'b'); assert.equal(texts, 2);
 setAttr(el, 'd', 'M0'); setAttr(el, 'd', 'M0'); assert.equal(attrs, 1);
 setStyle(el, '--fill', '1%'); setStyle(el, '--fill', '1%'); setStyle(el, '--fill', '2%'); assert.equal(props, 2);
 setStyle(el, 'left', '0px'); setStyle(el, 'left', '0px'); assert.equal(el.style.left, '0px');
});

test('haptics only buzz on touch, when enabled, and not faster than every 120 ms', () => {
 const calls = []; Object.defineProperty(navigator, 'vibrate', { value: p => { calls.push(p); return true; }, configurable: true, writable: true });
 try {
  assert.equal(buzz(10, { enabled: false }), false); assert.equal(buzz(10, { touch: false }), false);
  assert.equal(buzz(10), true); assert.equal(buzz(10), false, 'throttled'); assert.deepEqual(calls, [10]);
 } finally { delete navigator.vibrate; }
});

test('a dragged touch control settles on a screen edge when close to it', () => {
 assert.deepEqual(snapToEdges({ x: EDGE_SNAP / 2, y: .5, scale: 1 }), { x: 0, y: .5, scale: 1 });
 assert.deepEqual(snapToEdges({ x: .5, y: 1 - EDGE_SNAP / 2 }), { x: .5, y: 1 });
 assert.deepEqual(snapToEdges({ x: .2, y: .3 }), { x: .2, y: .3 });
});
