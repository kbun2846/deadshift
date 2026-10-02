// The first-time weapon tips (owner, 2026-10-02: "A first-time hint card for
// each weapon: three lines on how it works, shown the first time you pick
// it."): the lines (weapon-tips.js) and when the card shows (weapon-hint-card.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WEAPON_TIPS, weaponTips } from '../src/weapon-tips.js';
import { createTipMemory, createTipTracker, tipMarkup, TIP_CARD, TIPS_KEY } from '../src/ui/weapon-hint-card.js';
import { WEAPONS } from '../src/items.js';
import { KEY_ACTIONS, keyName } from '../src/config/keybinds.js';

const memory = (seed = {}) => { const data = new Map(Object.entries(seed)); return { data, getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) }; };
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const live = (weapon, extra = {}) => ({ started: true, live: true, weapon, surface: 'keyboard', ...extra });
// Runs the tracker for `seconds` in 1/60 s frames; returns the last view.
const run = (tracker, seconds, ctx) => { let view = null; for (let t = 0; t < seconds - 1e-9; t += 1 / 60) view = tracker.frame(1 / 60, ctx); return view; };

test('every weapon has three short lines for a keyboard and three for touch', () => {
 const keys = new Set([...KEY_ACTIONS.map(a => keyName(a.key)), 'LMB', 'RMB']);
 for (const w of WEAPONS) {
  for (const surface of ['keyboard', 'touch']) {
   const lines = weaponTips(w.id, surface);
   assert.ok(Array.isArray(lines) && lines.length === 3, `${w.id} ${surface}`);
   for (const line of lines) {
    assert.ok(line.length <= 72, `${w.id}: "${line}" is short`);
    // Lowercase plain copy: only keycaps and touch button names are capitals.
    const words = line.replace(/\[[^\]]+\]/g, '');
    for (const word of words.match(/[A-Z][A-Z-]+/g) || []) assert.ok(surface === 'touch', `${w.id} keyboard line has no capitals but keycaps: ${word}`);
    // No numbers that go stale when a weapon is tuned.
    assert.doesNotMatch(words, /\d/, `${w.id}: "${line}"`);
    for (const [, key] of line.matchAll(/\[([^\]]+)\]/g)) assert.ok(keys.has(key), `${w.id}: [${key}] is a real key`);
    if (surface === 'touch') assert.doesNotMatch(line, /\[/, 'touch names buttons, not keys');
   }
  }
  // Touch lines name the weapon's own buttons as they appear (items.js touchButtons).
  const labels = Object.values(w.touchButtons || {}).map(b => b.label).filter(Boolean);
  const touch = weaponTips(w.id, 'touch').join(' ');
  for (const label of labels) assert.ok(touch.includes(label), `${w.id} touch tips name ${label}`);
 }
 assert.deepEqual(Object.keys(WEAPON_TIPS).sort(), WEAPONS.map(w => w.id).sort(), 'no tips for weapons that are gone');
 assert.equal(weaponTips('nope', 'keyboard'), null);
});

test('keycaps show the key, plain text is escaped', () => {
 assert.equal(tipMarkup('hold [E] to place <orbs>'), 'hold <kbd>E</kbd> to place &lt;orbs&gt;');
 assert.equal(tipMarkup('[SPACE] or [LMB]'), '<kbd>SPACE</kbd> or <kbd>LMB</kbd>');
 assert.equal(tipMarkup('NADE throws a grenade'), '<b class="weapon-hint-button">NADE</b> throws a grenade');
});

test('a tip shows a moment after a weapon is first in hand, runs its time, and never again', () => {
 const store = memory(), mem = createTipMemory(store), tips = createTipTracker({ memory: mem });
 assert.equal(run(tips, TIP_CARD.delay * .5, live('rifle')), null, 'not at once');
 const view = run(tips, TIP_CARD.delay * .6, live('rifle'));
 assert.equal(view.weapon, 'rifle'); assert.deepEqual(view.lines, weaponTips('rifle', 'keyboard')); assert.ok(view.left > .9);
 assert.equal(mem.seen('rifle', 'keyboard'), false, 'not counted until it has been read');
 assert.equal(run(tips, TIP_CARD.show, live('rifle')), null, 'gone after its time');
 assert.equal(mem.seen('rifle', 'keyboard'), true);
 assert.deepEqual(JSON.parse(store.data.get(TIPS_KEY)), { keyboard: ['rifle'], touch: [] });
 // A new page, the same browser: not again for that weapon.
 const again = createTipTracker({ memory: createTipMemory(store) });
 assert.equal(run(again, 3, live('rifle')), null);
 // Another weapon has its own.
 assert.equal(run(again, 2, live('shotgun')).weapon, 'shotgun');
});

test('per input: touch lines for touch, and a touch player gets its own first time', () => {
 const mem = createTipMemory(memory({ [TIPS_KEY]: JSON.stringify({ keyboard: ['static'], touch: [] }) }));
 const tips = createTipTracker({ memory: mem });
 const view = run(tips, 2, live('static', { surface: 'touch' }));
 assert.deepEqual(view.lines, weaponTips('static', 'touch'));
 assert.notDeepEqual(view.lines, weaponTips('static', 'keyboard'));
 // Switching to keys mid-card shows the keyboard lines for the same tip.
 assert.deepEqual(tips.frame(1 / 60, live('static')).lines, weaponTips('static', 'keyboard'));
});

test('dismissed is seen; cut short it comes back next time; paused or dead it waits', () => {
 const mem = createTipMemory(memory()), tips = createTipTracker({ memory: mem });
 run(tips, 2, live('omen'));
 tips.dismiss();
 assert.equal(mem.seen('omen', 'keyboard'), true);
 assert.equal(run(tips, 3, live('omen')), null);
 // Cut short (a weapon change) before it could be read: shown again on a later page.
 run(tips, 1.2, live('sheath'));
 assert.ok(tips.card);
 tips.frame(1 / 60, live('ichor'));
 assert.equal(mem.seen('sheath', 'keyboard'), false);
 assert.equal(run(createTipTracker({ memory: mem }), 2, live('sheath')).weapon, 'sheath');
 // ...but not twice on one page.
 const page = createTipTracker({ memory: createTipMemory(memory()) });
 run(page, 1.2, live('sheath')); page.frame(1 / 60, live('ichor'));
 assert.equal(run(page, 2, live('sheath')), null);
 // Up long enough before it was cut short: that counts.
 const m2 = createTipMemory(memory()), t2 = createTipTracker({ memory: m2 });
 run(t2, TIP_CARD.delay + TIP_CARD.settle + .1, live('sidekick'));
 t2.frame(1 / 60, { started: false });
 assert.equal(m2.seen('sidekick', 'keyboard'), true);
 // Paused or dead: hidden, the clock held, back where it was.
 const m3 = createTipMemory(memory()), t3 = createTipTracker({ memory: m3 });
 const before = run(t3, 2, live('rifle')).left;
 assert.equal(run(t3, 30, live('rifle', { live: false })), null);
 assert.ok(t3.card, 'still waiting');
 assert.ok(Math.abs(t3.frame(1 / 60, live('rifle')).left - before) < .01);
});

test('no tip in the tutorial; Gun Game counts a tip seen the moment it shows', () => {
 const mem = createTipMemory(memory()), tips = createTipTracker({ memory: mem });
 assert.equal(run(tips, 3, live('rifle', { tutorial: true })), null);
 assert.equal(mem.seen('rifle', 'keyboard'), false);
 const view = run(tips, 1, live('shotgun', { gunGame: true }));
 assert.equal(view.weapon, 'shotgun');
 assert.equal(mem.seen('shotgun', 'keyboard'), true, 'at once');
 // The ladder moves on a kill later: the next weapon's tip, and the old one never again.
 tips.frame(1 / 60, live('omen', { gunGame: true }));
 assert.equal(run(tips, 1, live('omen', { gunGame: true })).weapon, 'omen');
 const fresh = createTipTracker({ memory: mem });
 assert.equal(run(fresh, 2, live('shotgun', { gunGame: true })), null);
});

test('bad saved data is ignored; SHOW AGAIN forgets every tip', () => {
 for (const raw of ['not json', '[]', '{"keyboard":"static"}', '{"keyboard":[3,null,"laser"],"touch":{}}']) {
  const mem = createTipMemory(memory({ [TIPS_KEY]: raw }));
  assert.equal(mem.count, 0, raw);
 }
 const throwing = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
 const mem = createTipMemory(throwing);
 mem.mark('rifle', 'keyboard'); assert.equal(mem.seen('rifle', 'keyboard'), true, 'kept for the page');
 const store = memory(), m2 = createTipMemory(store), tips = createTipTracker({ memory: m2 });
 m2.mark('rifle', 'keyboard'); m2.mark('static', 'touch');
 m2.reset(); tips.reset();
 assert.equal(m2.count, 0); assert.equal(store.data.has(TIPS_KEY), false);
 assert.equal(run(tips, 2, live('rifle')).weapon, 'rifle');
});

test('the card: hidden by media mode with the notices, never takes the pointer but its X, wired in main.js', () => {
 const card = read('../src/ui/weapon-hint-card.js'), css = read('../src/styles/weapon-hints.css'), main = read('../src/main.js');
 assert.match(card, /root\.dataset\.media = 'notices'/);
 assert.match(css, /\.weapon-hint\{[^}]*pointer-events:none/);
 assert.match(css, /\.weapon-hint-close\{[^}]*pointer-events:auto/);
 assert.match(main, /weaponHints\.frame\(dt,\{started,live:started&&running&&!paused&&!deathActive/);
 assert.match(main, /tutorial:!!tutorial,gunGame:!!gunNow\(\)/);
 assert.match(main, /installTipReset\(\$\('settings-controls'\)/);
});
