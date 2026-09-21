import test from 'node:test';
import assert from 'node:assert/strict';
import {bindTouchAction} from '../src/touch-action.js';
const control=()=>{const e=new EventTarget();e.setPointerCapture=()=>{};return e;};
const send=(element,type,pointerId,extra={})=>{
 const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId,pointerType:'touch',isPrimary:false,button:0,...extra});element.dispatchEvent(event);return event;
};

test('secondary touches activate every action independently while move and aim stay held',()=>{
 const move=control(),aim=control();let moving=false,aiming=false;
 bindTouchAction(move,{press:()=>moving=true,release:()=>moving=false});
 bindTouchAction(aim,{press:()=>aiming=true,release:()=>aiming=false});
 send(move,'pointerdown',1,{isPrimary:true});send(aim,'pointerdown',2);
 for(const name of ['fire','launch','place','stream','focus','reload','dodge','pulse','grenade','double','extend','store']){
  const button=control();let presses=0,held=false;
  bindTouchAction(button,{press:()=>{presses++;held=true;},release:()=>held=false});
  assert.ok(send(button,'pointerdown',3).defaultPrevented);
  assert.equal(presses,1,name);assert.ok(held&&moving&&aiming);
  send(button,'pointerup',2);assert.ok(held,'another finger cannot release '+name);
  send(button,'pointerup',3);assert.equal(held,false);assert.ok(moving&&aiming);
  send(button,'click',3,{detail:1});assert.equal(presses,1,'no duplicate click');
 }
 send(move,'pointerup',1);assert.ok(aiming);send(aim,'pointerup',2);assert.equal(aiming,false);
});

test('cancellation, pause reset and accessibility activation leave no held action',()=>{
 const button=control();let held=false,enabled=true,presses=0;
 const reset=bindTouchAction(button,{enabled:()=>enabled,press:()=>{held=true;presses++;},release:()=>held=false});
 send(button,'pointerdown',1);send(button,'pointercancel',1);assert.equal(held,false);
 send(button,'pointerdown',2);reset();assert.equal(held,false);
 send(button,'pointerdown',3);send(button,'lostpointercapture',3);assert.equal(held,false);
 enabled=false;send(button,'pointerdown',4);assert.equal(presses,3);
 enabled=true;send(button,'click',0,{detail:0,pointerType:''});assert.equal(presses,4);assert.equal(held,false);
 send(button,'pointerdown',5,{pointerType:'mouse',button:2});assert.equal(presses,4);
});
