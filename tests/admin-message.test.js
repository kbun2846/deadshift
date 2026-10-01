// The page's side of the admin page: its message cards (ui/admin-message.js),
// the socket collecting them (net/socket-transport.js), and the GAME button's
// one-time link (ui/dev-unlock.js takeDevTicket / redeemDevTicket / applyDevTicket).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanAdminMessage, messageLifetime, messageCardHTML, createMessageStack, cardTop, ADMIN_MESSAGE_LABELS, ADMIN_MESSAGE_TIME, ADMIN_MESSAGE_SHOWN } from '../src/ui/admin-message.js';
import { connectServer } from '../src/net/socket-transport.js';
import { takeDevTicket, redeemDevTicket, applyDevTicket, DEV_TICKET, TICKET_MESSAGES } from '../src/ui/dev-unlock.js';
import { PROTOCOL_VERSION } from '../src/net/protocol.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const TICKET = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';

test('a message card: only the three kinds, one line, at most 140 characters', () => {
 assert.deepEqual(cleanAdminMessage({ kind: 'global', text: '  hello\nthere  ' }), { kind: 'global', text: 'hello there' });
 assert.equal(cleanAdminMessage({ kind: 'private', text: 'x'.repeat(300) }).text.length, 140);
 assert.equal(cleanAdminMessage({ kind: 'shout', text: 'hi' }), null);
 assert.equal(cleanAdminMessage({ kind: 'room', text: '   ' }), null);
 assert.equal(cleanAdminMessage({ kind: '__proto__', text: 'x' }), null);
 assert.equal(cleanAdminMessage(null), null);
 assert.deepEqual(Object.values(ADMIN_MESSAGE_LABELS), ['announcement', 'message to the room', 'private message']);
});

test('a message card stays 6 to 10 seconds, longer for longer words', () => {
 assert.equal(messageLifetime('hi'), ADMIN_MESSAGE_TIME.min);
 assert.equal(messageLifetime('x'.repeat(140)), ADMIN_MESSAGE_TIME.max);
 assert.equal(ADMIN_MESSAGE_TIME.min, 6000); assert.equal(ADMIN_MESSAGE_TIME.max, 10000);
 const mid = messageLifetime('x'.repeat(60));
 assert.ok(mid > 6000 && mid < 10000, String(mid));
 assert.ok(messageLifetime('x'.repeat(61)) >= mid);
});

test('the card markup: lowercase label, the words escaped, the lifetime on its line', () => {
 const html = messageCardHTML({ kind: 'private', text: '<b>hi</b> & "you"' }, 7000);
 assert.match(html, /^<span class="admin-card-label">private message<\/span>/);
 assert.ok(html.includes('&lt;b&gt;hi&lt;/b&gt; &amp; &quot;you&quot;'));
 assert.ok(!html.includes('<b>'));
 assert.match(html, /animation-duration:7000ms/);
 assert.match(messageCardHTML({ kind: 'global', text: 'x' }), /announcement/);
 assert.match(messageCardHTML({ kind: 'room', text: 'x' }), /message to the room/);
});

test('the card stack: two at most (the oldest goes), each expires on time, a tap dismisses', () => {
 const stack = createMessageStack();
 assert.equal(ADMIN_MESSAGE_SHOWN, 2);
 assert.equal(stack.add({ kind: 'nope', text: 'x' }, 0), null);
 const first = stack.add({ kind: 'global', text: 'one' }, 0).item;
 const second = stack.add({ kind: 'room', text: 'two' }, 1000).item;
 assert.deepEqual(stack.items.map(i => i.text), ['one', 'two']);
 const third = stack.add({ kind: 'private', text: 'three' }, 2000);
 assert.deepEqual(third.dropped.map(i => i.id), [first.id], 'the oldest made room');
 assert.deepEqual(stack.items.map(i => i.text), ['two', 'three']);
 assert.equal(stack.next(), second.until);
 assert.deepEqual(stack.expire(second.until - 1), []);
 assert.deepEqual(stack.expire(second.until).map(i => i.text), ['two']);
 assert.equal(stack.dismiss(third.item.id), true);
 assert.equal(stack.dismiss(third.item.id), false);
 assert.deepEqual(stack.items, []); assert.equal(stack.next(), null);
 // A long one stays longer than a short one.
 const s2 = createMessageStack();
 const short = s2.add({ kind: 'global', text: 'ok' }, 0).item, long = s2.add({ kind: 'global', text: 'y'.repeat(140) }, 0).item;
 assert.ok(long.until > short.until);
 assert.deepEqual(s2.expire(6000).map(i => i.text), ['ok']);
 assert.deepEqual(s2.expire(10000).length, 1);
});

test('in a game the cards start under the health bar (and its storm line), never over it', () => {
 assert.equal(cardTop({ top: 46, bottom: 118, height: 72 }, 720), 130);
 assert.equal(cardTop({ top: 86, bottom: 160, height: 74 }, 844), 172, 'a phone: lower down');
 assert.equal(cardTop({ top: 0, bottom: 0, height: 0 }, 720), null, 'no health bar showing (menus, lobby): the stylesheet\'s place');
 assert.equal(cardTop(null, 720), null);
 assert.equal(cardTop({ top: 500, bottom: 560, height: 60 }, 720), null, 'not a top bar');
 const css = read('../src/styles/menu-theme.css');
 assert.match(css, /#game \.admin-messages\{[^}]*z-index:58/, 'above the lobby, death, vote and match-end screens (40-46)');
 assert.match(css, /#game \.admin-card\{[^}]*background:#232827;border:1px solid #ffffff14/);
});

// A stand-in browser WebSocket.
function fakeSocketClass() {
 const made = [];
 class FakeSocket {
  constructor(url) { this.url = url; this.readyState = 1; this.sent = []; this.bufferedAmount = 0; made.push(this); queueMicrotask(() => this.onopen?.()); }
  send(text) { this.sent.push(JSON.parse(text)); }
  close() { this.onclose?.(); }
  receive(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
 }
 return { FakeSocket, made };
}

test('the socket asks for cards and collects admin messages apart from the game\'s', async () => {
 const { FakeSocket, made } = fakeSocketClass();
 const pending = connectServer({ url: 'ws://x', request: { t: 'join', code: '12345' }, pid: 'pid-abcdefgh', WebSocketClass: FakeSocket });
 await new Promise(r => setTimeout(r, 0));
 const socket = made[0];
 assert.deepEqual(socket.sent[0], { t: 'join', code: '12345', pid: 'pid-abcdefgh', version: PROTOCOL_VERSION, cards: 1 });
 socket.receive({ t: 'room', code: '12345', id: 'c1', map: 'deadwater' });
 const transport = await pending;
 const seen = []; transport.onMessage = (_from, m) => seen.push(m);
 socket.receive({ t: 'admin', kind: 'global', text: 'hello', from: 'server' });
 socket.receive({ t: 'admin', kind: 'private', text: 'psst' });
 socket.receive({ t: 'note', text: 'a note' });
 socket.receive({ t: 'snapshot', tick: 1, players: [] });
 assert.deepEqual(transport.adminMessages, [{ kind: 'global', text: 'hello' }, { kind: 'private', text: 'psst' }]);
 assert.deepEqual(transport.notes, ['a note']);
 assert.deepEqual(seen.map(m => m.t), ['snapshot'], 'the session only sees the game');
 // The page drains them once a frame into the cards (online-play.js), and main.js wires the cards.
 assert.match(read('../src/online-play.js'), /transport\?\.adminMessages\?\.splice\(0\)/);
 assert.match(read('../src/main.js'), /adminCard:m=>adminMessages\.show\(m\)/);
});

// location / history stand-ins.
function page(hash, { search = '?quality=potato' } = {}) {
 const calls = [];
 return { calls, location: { pathname: '/', search, hash }, history: { state: { s: 1 }, replaceState(state, title, url) { calls.push({ state, url }); } } };
}

test('the GAME link: the ticket is read from the fragment and taken off the address at once', () => {
 let p = page('#devticket=' + TICKET);
 assert.ok(DEV_TICKET.test(TICKET));
 assert.equal(takeDevTicket(p.location, p.history), TICKET);
 assert.deepEqual(p.calls, [{ state: { s: 1 }, url: '/?quality=potato' }], 'the address without the fragment (query kept)');
 p = page('#a=1&devticket=' + TICKET + '&b=2');
 assert.equal(takeDevTicket(p.location, p.history), TICKET);
 assert.equal(p.calls[0].url, '/?quality=potato#a=1&b=2', 'other fragment parts stay');
 p = page('#devticket=short');
 assert.equal(takeDevTicket(p.location, p.history), '', 'malformed');
 assert.equal(p.calls.length, 1, 'still taken off the address');
 p = page('#somewhere');
 assert.equal(takeDevTicket(p.location, p.history), null);
 assert.equal(p.calls.length, 0, 'nothing to remove');
 assert.equal(takeDevTicket(page('').location, page('').history), null);
});

test('the GAME link: the request is `ticket:<ticket>` to /dev/unlock, a CORS simple request', async () => {
 let seen = null;
 const result = await redeemDevTicket(TICKET, { url: 'https://x/dev/unlock', fetchImpl: async (url, init) => { seen = { url, init }; return new Response('{"ok":true}', { status: 200 }); } });
 assert.equal(result.ok, true);
 assert.equal(seen.url, 'https://x/dev/unlock');
 assert.equal(seen.init.method, 'POST'); assert.equal(seen.init.body, 'ticket:' + TICKET);
 assert.equal(seen.init.headers, undefined); assert.equal(seen.init.cache, 'no-store');
 let called = false;
 assert.equal((await redeemDevTicket('nope', { fetchImpl: async () => { called = true; } })).ok, false);
 assert.equal(called, false, 'a malformed ticket is never sent');
});

test('the GAME link: success unlocks as a right code does; failure says so and stays locked', async () => {
 const run = async (hash, reply) => {
  const p = page(hash), log = { unlocked: 0, toasts: [], sent: [] };
  const fetchImpl = async (url, init) => { log.sent.push(init.body); return reply(); };
  const result = await applyDevTicket({ location: p.location, history: p.history, url: 'https://x/dev/unlock',
   redeem: (ticket, options) => redeemDevTicket(ticket, { ...options, fetchImpl }), unlock: () => log.unlocked++, toast: text => log.toasts.push(text) });
  return { result, log, p };
 };
 let r = await run('#devticket=' + TICKET, () => new Response('{"ok":true}', { status: 200 }));
 assert.equal(r.log.unlocked, 1); assert.deepEqual(r.log.toasts, []); assert.deepEqual(r.log.sent, ['ticket:' + TICKET]);
 assert.equal(r.p.calls.length, 1, 'removed from the address');
 r = await run('#devticket=' + TICKET, () => new Response('{"error":"That link has expired."}', { status: 401 }));
 assert.equal(r.log.unlocked, 0); assert.deepEqual(r.log.toasts, [TICKET_MESSAGES.wrong]);
 r = await run('#devticket=' + TICKET, () => new Response('{}', { status: 429 }));
 assert.deepEqual(r.log.toasts, [TICKET_MESSAGES.busy]); assert.equal(r.log.unlocked, 0);
 r = await run('#devticket=' + TICKET, () => { throw new TypeError('Failed to fetch'); });
 assert.deepEqual(r.log.toasts, [TICKET_MESSAGES.unreachable]); assert.equal(r.log.unlocked, 0);
 r = await run('#devticket=bad', () => { throw new Error('never sent'); });
 assert.deepEqual(r.log.sent, []); assert.deepEqual(r.log.toasts, [TICKET_MESSAGES.wrong]); assert.equal(r.log.unlocked, 0);
 r = await run('', () => { throw new Error('never sent'); });
 assert.equal(r.result, null); assert.deepEqual(r.log.toasts, []); assert.equal(r.log.unlocked, 0);
 // The page does it at startup, unlocking the way a right code does (a session token, the same toast).
 const wiring = read('../src/ui/dev-wiring.js');
 assert.match(wiring, /applyDevTicket\(\{/);
 assert.match(wiring, /unlock: \(\) => \{ if \(!devTools\.isUnlocked\(\)\) devTools\.unlock\(\); saveDevSession\(\); afterLoading\(unlocked\); \}/);
 assert.match(wiring, /const unlocked = \(\) => \{ toast\('DEV TOOLS UNLOCKED · O OPENS THE WINDOW', 2600\)/);
});
