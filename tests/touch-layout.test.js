import test from 'node:test';
import assert from 'node:assert/strict';
import {controlPosition,normalizedPosition,validateTouchLayout,validateTouchLayouts,touchOrientation} from '../src/touch-layout.js';

test('portrait and landscape keep independent saved controls',()=>{
 const layouts=validateTouchLayouts({portrait:{'touch-launch':{x:0,y:1,scale:1.2}},landscape:{'touch-launch':{x:.5,y:.7,hidden:true}}});
 assert.equal(touchOrientation({width:390,height:844}),'portrait');
 assert.equal(touchOrientation({width:844,height:390}),'landscape');
 assert.equal(layouts.portrait['touch-launch'].x,0);
 assert.equal(layouts.landscape['touch-launch'].x,.5);
 assert.equal(layouts.portrait['touch-launch'].hidden,false);
 assert.equal(layouts.landscape['touch-launch'].hidden,true);
 assert.deepEqual(validateTouchLayouts(null),{portrait:{},landscape:{},swapped:false});
 assert.equal(validateTouchLayouts({swapped:true}).swapped,true,'swap sides is saved');
 assert.equal(validateTouchLayouts({swapped:'yes'}).swapped,false);
});
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

test('putting one control back forgets only that control, so it rejoins the corner cluster',async()=>{
 const {withoutControl}=await import('../src/touch-layout.js');
 const saved={'touch-dodge':{x:.4,y:.5,scale:1.2,hidden:false},'touch-hex':{x:.1,y:.9,scale:1,hidden:false}};
 const next=withoutControl(saved,'touch-dodge');
 assert.equal(next['touch-dodge'],undefined);
 assert.deepEqual(next['touch-hex'],saved['touch-hex']);
 assert.ok(saved['touch-dodge'],'the saved layout it came from is left alone');
});
