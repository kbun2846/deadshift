import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateGameStorage} from '../src/storage-migration.js';

test('renaming preserves settings, controls, weapon tutorials and cached thumbnail without overwriting new saves',()=>{
 const suffixes=['settings','input','tutorial-complete-v2','tutorial-complete-v2-rifle','tutorial-complete-v2-shotgun','native-thumbnail'];
 const data=new Map(suffixes.map(s=>['dustshift-'+s,'saved-'+s]));
 data.set('deadshift-input','touch');data.set('dustshift-tutorial-complete','1');
 const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 migrateGameStorage(storage);migrateGameStorage(storage);
 for(const s of suffixes)assert.equal(data.get('deadshift-'+s),s==='input'?'touch':'saved-'+s);
 assert.equal(data.has('deadshift-tutorial-complete'),false);
});

test('unavailable browser storage does not block startup',()=>{
 assert.doesNotThrow(()=>migrateGameStorage({getItem(){throw Error('blocked');}}));
 assert.doesNotThrow(()=>migrateGameStorage({getItem:k=>k.startsWith('deadshift-')?null:'saved',setItem(){throw Error('full');}}));
});

// Owner, 2026-09-30: the game is deadstab now. Every save under deadshift-
// or deadshift. is carried across, a new save always wins.
test('deadshift saves carry over to deadstab, never over a newer save', () => {
 const data = new Map([['deadshift-settings', '{"quality":"extreme"}'], ['deadshift.keybinds', 'k'], ['deadshift-touch-layout-v2', 't'], ['deadshift.duel', 'old'], ['deadstab.duel', 'new'], ['something-else', 'x'], ['deadshiftless', 'y']]);
 const storage = { get length() { return data.size; }, key: i => [...data.keys()][i] ?? null, getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
 migrateGameStorage(storage); migrateGameStorage(storage);
 assert.equal(data.get('deadstab-settings'), '{"quality":"extreme"}');
 assert.equal(data.get('deadstab.keybinds'), 'k'); assert.equal(data.get('deadstab-touch-layout-v2'), 't');
 assert.equal(data.get('deadstab.duel'), 'new', 'the newer save wins');
 assert.ok(!data.has('deadstabless') && !data.has('deadstab-else'));
 assert.equal(data.get('deadshift-settings'), '{"quality":"extreme"}', 'old keys are left in place');
 // dustshift -> deadshift -> deadstab in one pass.
 const chain = new Map([['dustshift-settings', 'd']]);
 const s2 = { get length() { return chain.size; }, key: i => [...chain.keys()][i] ?? null, getItem: k => chain.get(k) ?? null, setItem: (k, v) => chain.set(k, v) };
 migrateGameStorage(s2); assert.equal(chain.get('deadstab-settings'), 'd');
});

test('the game reads only the new names; the loader carries the old ones across before the game starts', async () => {
 const { readFileSync } = await import('node:fs');
 const boot = readFileSync(new URL('../src/bootstrap.js', import.meta.url), 'utf8');
 assert.ok(boot.indexOf('migrateGameStorage(') > 0 && boot.indexOf('migrateGameStorage(') < boot.indexOf("import('./main.js')"));
});
