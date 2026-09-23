import test from 'node:test';
import assert from 'node:assert/strict';
import { listenLocal, knockLocal } from '../src/net/local-link.js';

const settle = () => new Promise(r => setTimeout(r, 30));

test('two windows of one browser connect over the local channel and trade JSON messages', async () => {
 const joined = [], got = [], left = [];
 const host = listenLocal('ZZZZ9', { onOpen: (id, link) => joined.push({ id, link }), onData: (id, m) => got.push([id, m]), onClose: id => left.push(id) });
 const link = await knockLocal('ZZZZ9');
 assert.ok(link, 'the knock was answered');
 await settle();
 assert.equal(joined.length, 1);
 const heard = []; link.onData = m => heard.push(m);
 link.send({ t: 'hello', name: 'Sam', skip: undefined });
 joined[0].link.send({ t: 'welcome', n: 1 });
 await settle();
 assert.deepEqual(got, [[link.id, { t: 'hello', name: 'Sam' }]], 'arrives JSON round-tripped, like the WebRTC channel');
 assert.deepEqual(heard, [{ t: 'welcome', n: 1 }]);
 link.close(); await settle();
 assert.deepEqual(left, [link.id]);
 host.close();
});

test('a knock with no host in this browser gives up quickly', async () => {
 assert.equal(await knockLocal('NOONE', { wait: 50 }), null);
});
