// Remembered choices (owner, 2026-10-02: "Do remember choices."): the last
// weapon, mode and Practice map, saved and read back, anything bad ignored.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LAST_WEAPON, LAST_MODE, LAST_MAP, MODE_BUTTONS, readLastWeapon, saveLastWeapon, readLastMode, saveLastMode, readLastMap, saveLastMap, mainMode } from '../src/ui/remembered-choices.js';
import { readDuelChoices } from '../src/ui/duel-menu.js';
import { MAINTENANCE } from '../src/weapon-maintenance.js';
import { WEAPONS, DEFAULT_WEAPON } from '../src/items.js';

const memory = (seed = {}) => { const data = new Map(Object.entries(seed)); return { data, getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) }; };
const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the last weapon, mode and map are saved and read back', () => {
 const s = memory();
 assert.equal(readLastWeapon(s), null); assert.equal(readLastMode(s), null); assert.equal(readLastMap(['deadwater'], s), null);
 assert.ok(saveLastWeapon('shotgun', s)); assert.equal(s.data.get(LAST_WEAPON), 'shotgun'); assert.equal(readLastWeapon(s), 'shotgun');
 assert.ok(saveLastMode('bots', s)); assert.equal(s.data.get(LAST_MODE), 'bots'); assert.equal(readLastMode(s), 'bots');
 assert.ok(saveLastMap('hollow-wick', s)); assert.equal(s.data.get(LAST_MAP), 'hollow-wick'); assert.equal(readLastMap(['deadwater', 'hollow-wick'], s), 'hollow-wick');
 // Every mode button on the gamemodes page has a name.
 assert.deepEqual(Object.values(MODE_BUTTONS).sort(), ['duel-mode', 'join-mode', 'online-host', 'practice-mode', 'tutorial-mode']);
 for (const id of Object.values(MODE_BUTTONS)) assert.match(read('../index.html'), new RegExp(`<button id="${id}"`));
});

test('bad or stale data is ignored, and blocked storage remembers nothing without failing', () => {
 const s = memory({ [LAST_WEAPON]: 'laser-cannon', [LAST_MODE]: 'battle-royale', [LAST_MAP]: 'atlantis' });
 assert.equal(readLastWeapon(s), null); assert.equal(readLastMode(s), null); assert.equal(readLastMap(['deadwater'], s), null);
 // A weapon under maintenance counts as none (it cannot be played).
 for (const id of MAINTENANCE) { s.setItem(LAST_WEAPON, id); assert.equal(readLastWeapon(s), null, id); }
 // Nonsense is never written.
 assert.equal(saveLastWeapon('nope', s), false); assert.equal(saveLastMode('nope', s), false); assert.equal(saveLastMap('tutorial', s), false); assert.equal(saveLastMap('', s), false);
 assert.equal(readLastWeapon(broken), null); assert.equal(readLastMode(broken), null); assert.equal(readLastMap(['deadwater'], broken), null);
 assert.equal(saveLastWeapon('static', broken), false); assert.equal(saveLastMode('bots', broken), false);
 assert.equal(readLastWeapon(null), null);
});

test('the gamemodes page\'s main action is the last mode used (if it is showing), else PRACTICE', () => {
 assert.equal(mainMode(null), 'practice');
 assert.equal(mainMode('bots'), 'bots');
 assert.equal(mainMode('join', mode => mode !== 'join'), 'practice', 'JOIN hidden (offline build)');
});

test('BOTS opens on the last weapon played until a weapon is picked there', () => {
 const s = memory({ [LAST_WEAPON]: 'ichor' });
 assert.equal(readDuelChoices(s).weapon, 'ichor');
 s.setItem('deadstab.duel', JSON.stringify({ weapon: 'rifle', mode: '2v2' }));
 assert.equal(readDuelChoices(s).weapon, 'rifle', 'its own pick wins');
 assert.equal(readDuelChoices(s).mode, '2v2', 'team size kept');
 s.setItem('deadstab.duel', JSON.stringify({ weapon: null }));
 assert.equal(readDuelChoices(s).weapon, null, 'random stays random');
 assert.equal(readDuelChoices(memory()).weapon, DEFAULT_WEAPON);
 // (The bots' difficulty still opens at normal every visit: owner, v0.990a.)
 s.setItem('deadstab.duel', JSON.stringify({ skill: 'hard' }));
 assert.equal(readDuelChoices(s).skill, 'normal');
});

test('the pages use them: menu marks and focuses, quick play and the online pick read the same key', () => {
 const menu = read('../src/ui/menu.js'), marks = read('../src/ui/remembered-menus.js'), quick = read('../src/quick-wiring.js'), pick = read('../src/ui/weapon-pick.js');
 assert.match(menu, /remembered\.focus\(name\);\};/);
 assert.match(menu, /card\.dataset\.weapon=weapon\.id;/);
 for (const page of ['modes', 'duel', 'maps', 'weapons']) assert.match(marks, new RegExp(`page === '${page}'`));
 assert.match(quick, /readLastWeapon\(\)/); assert.match(quick, /saveLastWeapon\(sim\.weapon\)/);
 assert.match(pick, /readLastWeapon\(\)/);
 // Nothing starts a game by itself.
 assert.doesNotMatch(marks, /\.click\(\)|start\(/);
 assert.ok(WEAPONS.length >= 3);
});
