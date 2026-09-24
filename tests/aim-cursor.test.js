import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceAimCursor,AIM_CURSOR} from '../src/ui/aim-cursor.js';
test('aim cursor slows while focused, stays bounded, and accelerates smoothly on release',()=>{
 const focused={x:0,y:0},hip={x:0,y:0},target={x:1000,y:200};
 advanceAimCursor(focused,target,1/60,true);advanceAimCursor(hip,target,1/60,false);
 assert.ok(focused.x<hip.x);assert.ok(Math.hypot(focused.x,focused.y)>10);assert.ok(Math.hypot(focused.x,focused.y)<=800/60+.00001);
 const before=focused.x;advanceAimCursor(focused,target,1/60,false);assert.ok(focused.x>before);assert.ok(focused.x<target.x);
 for(let i=0;i<300;i++)advanceAimCursor(focused,target,1/60,true);
 assert.equal(focused.x,target.x);assert.equal(focused.y,target.y);
});

test('hipfire reaches a mid-range target promptly while focused aim keeps its weight',()=>{
 const settle=(aiming,distance)=>{
  const cursor={x:0,y:0},target={x:distance,y:0};
  for(let frame=1;frame<=600;frame++){
   advanceAimCursor(cursor,target,1/60,aiming);
   if(distance-cursor.x<=distance*.05)return frame;
  }
  return Infinity;
 };
 // A typical flick onto a target across the viewport must not read as delayed.
 assert.ok(settle(false,400)<=6,`hipfire took ${settle(false,400)} frames`);
 assert.ok(settle(false,800)<=9,`hipfire took ${settle(false,800)} frames`);
 // Aiming down the sights stays deliberately heavy: the inertia is the trade.
 assert.ok(settle(true,400)>settle(false,400)*2);
 assert.equal(AIM_CURSOR.focused.rate,12);
 assert.equal(AIM_CURSOR.focused.maxSpeed,800);
});

test('Static carries more weight than the rifle but less than its sights',()=>{
 const settle=(weapon,aiming,distance)=>{
  const cursor={x:0,y:0},target={x:distance,y:0};
  for(let frame=1;frame<=600;frame++){
   advanceAimCursor(cursor,target,1/60,aiming,weapon);
   if(distance-cursor.x<=distance*.05)return frame;
  }
  return Infinity;
 };
 for(const distance of [200,400,800]){
  const rifle=settle('rifle',false,distance),still=settle('static',false,distance),sights=settle('rifle',true,distance);
  assert.ok(still>=rifle,`static should never beat the rifle at ${distance}px`);
  assert.ok(still<sights,`but never as heavy as the sights at ${distance}px`);
 }
 // Weight, not sludge: a normal sweep still lands inside a fifth of a second.
 // Only a hint of weight: a normal sweep lands close to hipfire.
 assert.ok(settle('static',false,400)<=8,`static took ${settle('static',false,400)} frames`);
 assert.ok(settle('static',false,800)-settle('rifle',false,800)<=3,'and never drags far behind it');
 // Aiming down sights ignores the weapon profile entirely.
 assert.equal(AIM_CURSOR.focused.rate,12);
 assert.ok(AIM_CURSOR.static.rate<AIM_CURSOR.hip.rate);
 assert.ok(AIM_CURSOR.static.maxSpeed<AIM_CURSOR.hip.maxSpeed);
});

test('an unknown weapon falls back to the loose profile',()=>{
 const named={x:0,y:0},fallback={x:0,y:0},target={x:500,y:0};
 advanceAimCursor(named,target,1/60,false,'shotgun');
 advanceAimCursor(fallback,target,1/60,false);
 assert.equal(named.x,fallback.x);
});
