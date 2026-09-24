import test from 'node:test';
import assert from 'node:assert/strict';

test('the screen size is cached until something resizes', async () => {
 const box = { isConnected: true, clientWidth: 100, clientHeight: 50 }, handlers = {};
 let reads = 0;
 const counted = { isConnected: true, get clientWidth() { reads++; return box.clientWidth; }, get clientHeight() { return box.clientHeight; } };
 globalThis.document = { getElementById: () => counted };
 globalThis.addEventListener = (name, fn) => { handlers[name] = fn; };
 globalThis.ResizeObserver = class { constructor(fn) { handlers.observer = fn; } observe() {} };
 const { viewWidth, viewHeight } = await import('../src/viewport.js?cache-test');
 assert.equal(viewWidth(), 100); assert.equal(viewHeight(), 50);
 const before = reads; for (let i = 0; i < 20; i++) viewWidth();
 assert.equal(reads - before, 0, 'no re-measure per call');
 box.clientWidth = 300; box.clientHeight = 200;
 assert.equal(viewWidth(), 100, 'still cached');
 handlers.resize(); assert.equal(viewWidth(), 300); assert.equal(viewHeight(), 200);
 box.clientWidth = 320; handlers.observer(); assert.equal(viewWidth(), 320);
 delete globalThis.document; delete globalThis.addEventListener; delete globalThis.ResizeObserver;
});
