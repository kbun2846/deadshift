import test from 'node:test';
import assert from 'node:assert/strict';
import {bindRifleMouse,weaponAiming} from '../src/rifle-input.js';

test('Nominal keyboard aim and pointer aim release independently',()=>{
 const keys=new Set(['ShiftLeft']);
 assert.equal(weaponAiming('rifle',false,keys),true);
 assert.equal(weaponAiming('shotgun',false,keys),false);
 assert.equal(weaponAiming('static',false,keys),false);
 keys.clear();assert.equal(weaponAiming('rifle',true,keys),true);
 assert.equal(weaponAiming('rifle',false,keys),false);
 keys.add('ShiftRight');assert.equal(weaponAiming('rifle',false,keys),true);
});
test('aim and fire work in either mouse-button order and release independently',()=>{
 const surface=new EventTarget(),windowTarget=new EventTarget();let state,shots=0,enabled=true;
 bindRifleMouse(surface,windowTarget,{enabled:()=>enabled,state:(fire,aim)=>{state={fire,aim};},fire:()=>shots++,aim:()=>{}});
 const send=(target,type,button,buttons)=>{const e=new Event(type,{cancelable:true});Object.assign(e,{button,buttons,clientX:10,clientY:20});target.dispatchEvent(e);};
 send(surface,'mousedown',2,2);assert.deepEqual(state,{fire:false,aim:true});
 send(surface,'mousedown',0,3);assert.deepEqual(state,{fire:true,aim:true});assert.equal(shots,1);
 send(windowTarget,'mouseup',0,2);assert.deepEqual(state,{fire:false,aim:true});
 send(windowTarget,'mouseup',2,0);assert.deepEqual(state,{fire:false,aim:false});
 send(surface,'mousedown',0,1);send(surface,'mousedown',2,3);assert.deepEqual(state,{fire:true,aim:true});
 send(windowTarget,'mouseup',2,1);assert.deepEqual(state,{fire:true,aim:false});assert.equal(shots,2);
 enabled=false;send(windowTarget,'mouseup',0,0);assert.deepEqual(state,{fire:false,aim:false});
});

test('right click requests charge storage once on press while preserving aim state',()=>{
 const surface=new EventTarget(),windowTarget=new EventTarget();let stores=0,state,enabled=true;
 bindRifleMouse(surface,windowTarget,{enabled:()=>enabled,state:(fire,aim)=>{state={fire,aim};},fire:()=>{},aim:()=>{},store:()=>stores++});
 const send=(target,type,button,buttons)=>{const e=new Event(type,{cancelable:true});Object.assign(e,{button,buttons});target.dispatchEvent(e);};
 send(surface,'mousedown',0,1);assert.equal(stores,0);
 send(surface,'mousedown',2,3);assert.equal(stores,1);assert.deepEqual(state,{fire:true,aim:true});
 send(windowTarget,'mouseup',2,1);assert.equal(stores,1);
 enabled=false;send(surface,'mousedown',2,3);assert.equal(stores,1);
});
