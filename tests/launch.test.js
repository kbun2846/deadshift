// v0.996a (owner: "remove all this crap from the game url"): a launch keeps
// its settings in sessionStorage and loads the plain address.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readLaunch, setLaunch, launchTo, launchParams } from '../src/launch.js';

function browser(search = '') {
  const data = new Map(), replaced = [];
  globalThis.sessionStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
  globalThis.history = { replaceState: (a, b, url) => replaced.push(url) };
  const location = { pathname: '/deadshift/', search, hash: '', href: '' };
  globalThis.location = location;
  return { data, replaced, location };
}

test('a menu launch loads the plain address and starts; a reload goes to the menu on that map', () => {
  const b = browser();
  launchTo('map=hollow-wick&weapon=ichor&play=1&mode=duel&duel=3v3~0~on');
  assert.equal(b.location.href, '/deadshift/', 'no query in the address');
  b.location.search = '';
  const first = readLaunch(b.location);
  assert.equal(first.launched, true); assert.equal(first.params.get('duel'), '3v3~0~on'); assert.equal(first.params.get('map'), 'hollow-wick');
  const again = readLaunch(b.location);
  assert.equal(again.launched, false, 'a reload is not a launch');
  assert.equal(again.params.get('map'), 'hollow-wick'); assert.equal(again.params.get('play'), null);
});

test('an old link still works, and the address keeps only what is not the game\'s (a join code)', () => {
  const b = browser('?map=deadwater&weapon=rifle&play=1&join=ABCDE');
  b.data.set('deadshift.launch', '?map=deadwater&weapon=rifle&play=1&join=ABCDE');
  const r = readLaunch(b.location);
  assert.equal(r.launched, true); assert.equal(r.params.get('weapon'), 'rifle');
  assert.deepEqual(b.replaced.at(-1), '/deadshift/?join=ABCDE');
  assert.ok(!b.data.get('deadshift.launchQuery').includes('join'), 'join codes are never kept');
  setLaunch('map=deadwater&play=1&mode=duel'); assert.equal(launchParams().get('mode'), 'duel');
});
