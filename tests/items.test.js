import test from 'node:test';
import assert from 'node:assert/strict';
import {ITEMS,WEAPONS,SKINS,ITEM_KIND,item,weapon,ownedItems,STARTER_ITEMS} from '../src/items.js';
import * as gameplay from '../src/config/gameplay.js';
import {WEAPON_UI} from '../src/ui/weapon-hud.js';
import {COURSE_NAMES} from '../src/tutorial.js';

test('every item has a unique id, and weapons and skins stay separate',()=>{
 assert.equal(new Set(ITEMS.map(i=>i.id)).size,ITEMS.length);
 assert.deepEqual(WEAPONS.map(w=>w.id),['static','rifle','shotgun']);
 assert.ok(WEAPONS.every(w=>w.kind===ITEM_KIND.WEAPON&&gameplay[w.stats]),'each weapon points at its tuning block');
 assert.ok(SKINS.every(s=>s.kind===ITEM_KIND.SKIN&&weapon(s.appliesTo)&&!('stats' in s)),'skins are visual only');
 assert.equal(item('nope'),null);assert.equal(weapon('static.default'),null);
});

test('ownership comes from the authority and unknown ids are dropped',()=>{
 assert.deepEqual([...ownedItems()].sort(),[...STARTER_ITEMS].sort());
 assert.deepEqual([...ownedItems(['static','hacked-gold-skin'])],['static']);
 assert.deepEqual([...ownedItems('not a list')].sort(),[...STARTER_ITEMS].sort());
});

test('menus, HUD and tutorial read their weapon names from the registry',()=>{
 for(const w of WEAPONS){
  assert.equal(WEAPON_UI[w.id].name,w.name);assert.equal(WEAPON_UI[w.id].capacity,w.capacity);
  assert.equal(COURSE_NAMES[w.id],w.name.toLowerCase());
 }
});
