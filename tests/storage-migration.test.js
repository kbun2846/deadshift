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
