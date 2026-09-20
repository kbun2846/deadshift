import test from 'node:test';
import assert from 'node:assert/strict';
import {controlPosition,normalizedPosition,validateTouchLayout} from '../src/touch-layout.js';
test('controls stay below the reserved quarter and inside portrait and landscape screens',()=>{
 for(const viewport of [{width:390,height:844},{width:844,height:390}])for(const size of [{width:96,height:96},{width:128,height:88}]){
  const top=controlPosition({x:-2,y:-2},size,viewport),bottom=controlPosition({x:2,y:2},size,viewport);
  assert.ok(top.x>=0);assert.ok(top.y>=viewport.height*.25);
  assert.ok(bottom.x+size.width<=viewport.width);assert.ok(bottom.y+size.height<=viewport.height);
  const p={x:.32,y:.73};const pixels=controlPosition(p,size,viewport),restored=normalizedPosition(pixels,size,viewport);
  assert.ok(Math.abs(restored.x-p.x)<1e-8);assert.ok(Math.abs(restored.y-p.y)<1e-8);
 }
});
test('saved layouts validate coordinates and retain shared action positions',()=>{
 assert.deepEqual(validateTouchLayout(null),{});
 assert.deepEqual(validateTouchLayout({'touch-launch':{x:2,y:-1},'touch-place':{x:.8,y:.9,scale:3,hidden:true},'touch-hex':{x:'bad',y:1},other:{x:0,y:0}}),{'touch-place':{x:.8,y:.9,scale:2,hidden:true},'touch-launch':{x:1,y:0,scale:1,hidden:false}});
});
