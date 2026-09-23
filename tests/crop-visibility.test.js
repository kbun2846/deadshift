import test from 'node:test';
import assert from 'node:assert/strict';
import { cropEntityVisible } from '../src/crops.js';
const section = () => ({ fieldId: 'farm', x: 0, z: 0, w: 10, d: 10, state: 'standing', visibility: 4.2 });
test('crop occupants and their health bars are hidden from outside, even at point blank range', () => {
  const s = section();
  assert.equal(cropEntityVisible([s], { x: 5.1, z: 0 }, { x: 4.9, z: 0 }), false);
  s.state = 'burning';
  assert.equal(cropEntityVisible([s], { x: 5.1, z: 0 }, { x: 4.9, z: 0 }), false);
  s.state = 'gone';
  assert.equal(cropEntityVisible([s], { x: 5.1, z: 0 }, { x: 4.9, z: 0 }), true);
});
test('inside crops only nearby entities in the same field are revealed', () => {
  const s = section(), viewer = { id: 'local', x: 0, z: 0 };
  assert.equal(cropEntityVisible([s], viewer, { x: 3, z: 0 }), true);
  assert.equal(cropEntityVisible([s], viewer, { x: 4.5, z: 0 }), false);
  assert.equal(cropEntityVisible([s], viewer, viewer), true);
  const other = { ...s, fieldId: 'other', x: 11 };
  assert.equal(cropEntityVisible([s, other], { x: 4.9, z: 0 }, { x: 6.1, z: 0 }), false);
});
test('standing in a cleared patch does not reveal occupants of intact crops', () => {
  const s = section(), cleared = { ...s, x: 10, state: 'gone' };
  assert.equal(cropEntityVisible([s, cleared], { x: 5.1, z: 0 }, { x: 4.9, z: 0 }), false);
});

import {cropImmersion} from '../src/crops.js';
test('crop edge masks stay field-only until the entire body enters, including cleared holes',()=>{
 const crops=[{fieldId:'f',x:0,z:0,w:10,d:10,state:'standing',visibility:5}];
 assert.equal(cropImmersion(crops,{x:5.2,z:0}).outerOpacity,0);
 assert.equal(cropImmersion(crops,{x:4.8,z:0}).full,false);
 assert.equal(cropImmersion(crops,{x:4,z:0}).full,true);
 assert.equal(cropImmersion(crops,{x:0,z:0}).outerOpacity,1);
 assert.equal(cropImmersion(crops,{x:6,z:0}),null);
 const entry=[5.379,5.2,5,4.8,4.5].map(x=>cropImmersion(crops,{x,z:0}).entryOpacity);
 assert.ok(entry[0]<.001);
 assert.ok(entry.every((v,i)=>i===0||v>=entry[i-1]));
 assert.ok(cropImmersion(crops,{x:4.619,z:0}).outerOpacity<.001);
 const split=[{fieldId:'f',x:-2.5,z:0,w:5,d:10,state:'standing',visibility:5},{fieldId:'f',x:2.5,z:0,w:5,d:10,state:'gone',visibility:5}];
 assert.equal(cropImmersion(split,{x:-.1,z:0}).outerOpacity,0);
 assert.equal(cropEntityVisible(crops,{x:4.8,z:0},{x:12,z:0}),true);
});
