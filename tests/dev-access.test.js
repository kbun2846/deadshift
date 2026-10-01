import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTapCounter, installVersionTaps, TAP_RUN, TAP_WINDOW } from '../src/ui/version-taps.js';
import { restoreDevSession, saveDevSession, clearDevSession, navigationType, DEV_SESSION_KEY } from '../src/ui/dev-session.js';
import { requestUnlock, unlockUrl, UNLOCK_MESSAGES } from '../src/ui/dev-unlock.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the tap counter: a full run inside the window opens, on its last press only', () => {
 const c = createTapCounter();
 for (let i = 0; i < TAP_RUN - 1; i++) assert.equal(c.press(true, i * 500), false, 'press ' + (i + 1));
 assert.equal(c.press(true, (TAP_RUN - 1) * 500), true, 'the last press opens');
 assert.equal(c.count, 0, 'and the run starts over');
 assert.equal(c.press(true, 9000), false, 'one more press is the start of a new run');
});

test('the tap counter: one press short does nothing; a press that does not qualify clears the run', () => {
 const c = createTapCounter();
 for (let i = 0; i < TAP_RUN - 1; i++) c.press(true, i * 100);
 assert.equal(c.count, TAP_RUN - 1);
 assert.equal(c.press(false, 500), false);
 assert.equal(c.count, 0, 'cleared');
 for (let i = 0; i < TAP_RUN - 1; i++) assert.equal(c.press(true, 600 + i * 100), false);
 assert.equal(c.press(true, 600 + TAP_RUN * 100), true, 'a fresh run after the reset still works');
});

test('the tap counter: presses older than the window drop out', () => {
 const c = createTapCounter();
 c.press(true, 0);
 for (let i = 1; i < TAP_RUN - 1; i++) c.press(true, 1000 + i);
 assert.equal(c.press(true, TAP_WINDOW + 500), false, 'the first press has expired, so this is one short');
 assert.equal(c.press(true, TAP_WINDOW + 600), true, 'one more inside the window completes it');
 const slow = createTapCounter();
 for (let i = 0; i < TAP_RUN * 2; i++) assert.equal(slow.press(true, i * TAP_WINDOW), false, 'presses spaced a window apart never add up');
});

// A stand-in for the page: EventTargets for the window and the element.
function page() {
 const win = new EventTarget(), el = new EventTarget();
 const fire = (target, type, props) => { const e = Object.assign(new Event(type, { cancelable: true }), props); target.dispatchEvent(e); return e; };
 return { win, el, fire };
}

test('the version listener: mouse presses', () => {
 const { win, el, fire } = page();
 let opened = 0, t = 0;
 installVersionTaps([el], { win, open: () => opened++, now: () => t += 100 });
 const press = shiftKey => { fire(win, 'pointerdown', { pointerType: 'mouse', pointerId: 1 }); return fire(el, 'pointerdown', { pointerType: 'mouse', pointerId: 1, button: 0, shiftKey }); };
 for (let i = 0; i < TAP_RUN; i++) assert.equal(press(false).defaultPrevented, true, 'no focus change or selection');
 assert.equal(opened, 0);
 for (let i = 0; i < TAP_RUN - 1; i++) press(true);
 assert.equal(opened, 0, 'one short');
 press(false); press(true);
 assert.equal(opened, 0, 'reset');
 for (let i = 0; i < TAP_RUN - 1; i++) press(true);
 assert.equal(opened, 1);
});

test('the version listener: touch presses', () => {
 const { win, el, fire } = page();
 let opened = 0, t = 0;
 installVersionTaps([el], { win, open: () => opened++, now: () => t += 100 });
 const tap = id => { fire(win, 'pointerdown', { pointerType: 'touch', pointerId: id }); fire(el, 'pointerdown', { pointerType: 'touch', pointerId: id }); fire(win, 'pointerup', { pointerType: 'touch', pointerId: id }); };
 for (let i = 0; i < TAP_RUN; i++) tap(10 + i);
 assert.equal(opened, 0);
 fire(win, 'pointerdown', { pointerType: 'touch', pointerId: 1 });
 for (let i = 0; i < TAP_RUN; i++) tap(20 + i);
 assert.equal(opened, 1);
 fire(win, 'pointerup', { pointerType: 'touch', pointerId: 1 });
 for (let i = 0; i < TAP_RUN; i++) tap(30 + i);
 assert.equal(opened, 1);
 // (A lost pointerup is forgotten once no touch is left.)
 fire(win, 'pointerdown', { pointerType: 'touch', pointerId: 2 });
 fire(win, 'touchend', { touches: [] });
 for (let i = 0; i < TAP_RUN; i++) tap(40 + i);
 assert.equal(opened, 1);
});

test('the version listener does nothing while disabled', () => {
 const { win, el, fire } = page();
 let opened = 0, t = 0;
 installVersionTaps([el], { win, open: () => opened++, enabled: () => false, now: () => t += 100 });
 for (let i = 0; i < TAP_RUN * 2; i++) fire(el, 'pointerdown', { pointerType: 'mouse', pointerId: 1, button: 0, shiftKey: true });
 assert.equal(opened, 0);
});

function memoryStorage() {
 const map = new Map();
 return { getItem: k => map.has(k) ? map.get(k) : null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), map };
}

test('the unlock lasts for page loads in the tab and is dropped by a reload', () => {
 const storage = memoryStorage();
 assert.equal(restoreDevSession(storage, 'navigate'), false, 'nothing saved: locked');
 saveDevSession(storage);
 const token = storage.getItem(DEV_SESSION_KEY);
 assert.match(token, /^[0-9a-f]{32}$/, 'a random token');
 saveDevSession(storage);
 assert.notEqual(storage.getItem(DEV_SESSION_KEY), token, 'a new one each unlock');
 assert.equal(restoreDevSession(storage, 'navigate'), true, 'location.href / launchTo: still unlocked');
 assert.equal(restoreDevSession(storage, 'back_forward'), true, 'back and forward too');
 assert.equal(restoreDevSession(storage, 'reload'), false, 'a reload locks');
 assert.equal(storage.getItem(DEV_SESSION_KEY), null, 'and forgets');
 assert.equal(restoreDevSession(storage, 'navigate'), false, 'so the next page load stays locked');
 saveDevSession(storage); clearDevSession(storage);
 assert.equal(restoreDevSession(storage, 'navigate'), false, 'locking clears it');
 storage.setItem(DEV_SESSION_KEY, 'yes');
 assert.equal(restoreDevSession(storage, 'navigate'), false, 'only a token counts');
 assert.equal(restoreDevSession(null, 'navigate'), false, 'no storage: locked');
 const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
 assert.equal(restoreDevSession(throwing, 'reload'), false);
 assert.doesNotThrow(() => { saveDevSession(throwing); clearDevSession(throwing); });
 assert.equal(navigationType({ getEntriesByType: () => [{ type: 'reload' }] }), 'reload');
 assert.equal(navigationType({ getEntriesByType: () => [] }), 'navigate');
 assert.equal(navigationType(undefined), 'navigate');
});

test('the stored token is not made from the code', () => {
 const src = read('../src/ui/dev-wiring.js');
 assert.match(src, /if \(ok\) \{ devTools\.unlock\(\); saveDevSession\(\); \}/, 'saved with no argument: just a random token');
 assert.match(read('../src/ui/dev-session.js'), /crypto\.getRandomValues/);
});

test('the unlock request: the server URL and the shape of the request', async () => {
 assert.equal(unlockUrl('wss://play.deadstab.com'), 'https://play.deadstab.com/dev/unlock');
 assert.equal(unlockUrl('ws://127.0.0.1:8787/'), 'http://127.0.0.1:8787/dev/unlock');
 assert.equal(unlockUrl(), 'https://play.deadstab.com/dev/unlock', 'the game server by default');
 let seen = null;
 await requestUnlock(' 1234 ', { url: 'https://x/dev/unlock', fetchImpl: async (url, init) => { seen = { url, init }; return new Response('{"ok":true}', { status: 200 }); } });
 assert.equal(seen.url, 'https://x/dev/unlock');
 assert.equal(seen.init.method, 'POST');
 assert.equal(seen.init.body, '1234', 'the raw code, trimmed');
 assert.equal(seen.init.cache, 'no-store');
 assert.equal(seen.init.headers, undefined, 'no headers: a CORS simple request');
});

test('the unlock request: each answer gets its message', async () => {
 const reply = (status, body = '{}') => async () => new Response(body, { status });
 const cases = [
  [reply(200, '{"ok":true}'), true, ''],
  [reply(200, '{"ok":false}'), false, UNLOCK_MESSAGES.wrong],
  [reply(401, '{"ok":false}'), false, 'incorrect code'],
  [reply(429, '{"ok":false}'), false, 'too many tries · wait a while'],
  [reply(503, '{"ok":false}'), false, 'not set up yet'],
  [reply(404, 'not found'), false, 'not set up yet'],
  [reply(500, 'oops'), false, "can't reach the server"],
  [reply(200, '<html>'), false, "can't reach the server"],
  [async () => { throw new TypeError('Failed to fetch'); }, false, "can't reach the server"],
 ];
 for (const [fetchImpl, ok, message] of cases) {
  const result = await requestUnlock('1234', { url: 'https://x/dev/unlock', fetchImpl });
  assert.equal(result.ok, ok, message); assert.equal(result.message, message);
 }
 let called = false;
 const empty = await requestUnlock('   ', { fetchImpl: async () => { called = true; } });
 assert.equal(empty.ok, false); assert.equal(empty.message, 'incorrect code'); assert.equal(called, false, 'nothing sent for an empty box');
 const slow = await requestUnlock('1234', { url: 'https://x', timeout: 20, fetchImpl: (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))) });
 assert.equal(slow.message, "can't reach the server", 'a server that never answers times out');
});

test('the development-build shortcut is only in development builds', async () => {
 // The request itself never says yes without the server.
 const offline = await requestUnlock('anything', { fetchImpl: async () => { throw new TypeError('offline'); } });
 assert.equal(offline.ok, false);
 assert.doesNotMatch(read('../src/ui/dev-unlock.js'), /import\.meta\.env/);
 // The one place that accepts a code without the server is behind the literal
 // import.meta.env.DEV, which Vite turns into false (and drops) in `pnpm build`.
 const wiring = read('../src/ui/dev-wiring.js');
 const bypass = wiring.split('\n').filter(line => /result\.reason === 'unreachable'/.test(line));
 assert.equal(bypass.length, 1);
 assert.match(bypass[0], /^\s*if \(import\.meta\.env\.DEV && result\.reason === 'unreachable' && String\(code\)\.trim\(\)\) ok = true;$/);
 assert.match(read('../src/main.js'), /server:\(\)=>import\.meta\.env\.DEV\?params\.get\('server'\):null/, 'the ?server= override is a development build\'s only');
});
