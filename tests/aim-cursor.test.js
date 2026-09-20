import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceAimCursor} from '../src/aim-cursor.js';
test('aim cursor slows while focused, stays bounded, and accelerates smoothly on release',()=>{
 const focused={x:0,y:0},hip={x:0,y:0},target={x:1000,y:200};
 advanceAimCursor(focused,target,1/60,true);advanceAimCursor(hip,target,1/60,false);
 assert.ok(focused.x<hip.x);assert.ok(Math.hypot(focused.x,focused.y)>10);assert.ok(Math.hypot(focused.x,focused.y)<=800/60+.00001);
 const before=focused.x;advanceAimCursor(focused,target,1/60,false);assert.ok(focused.x>before);assert.ok(focused.x<target.x);
 for(let i=0;i<300;i++)advanceAimCursor(focused,target,1/60,true);
 assert.equal(focused.x,target.x);assert.equal(focused.y,target.y);
});
