import test from 'node:test';
import assert from 'node:assert/strict';
import {boxIndex} from '../src/box-index.js';
import {inside} from '../src/simulation.js';
import {maps,mapColliders} from '../src/maps.js';

test('the collider index answers exactly as a full scan does, on the real map',()=>{
 const map=maps.deadwater,boxes=mapColliders(map),index=boxIndex(boxes);
 assert.ok(boxes.some(b=>b.angle&&b.localW!==undefined),'the map has rotated colliders to exercise');
 let seed=11;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
 let hits=0;
 for(let i=0;i<40000;i++){
  const x=(rand()-.5)*(map.width+10),z=(rand()-.5)*(map.depth+10);
  const padding=[0,.15,.3,1,2.2,3.3][i%6];
  const test=b=>inside({x,z},b,padding);
  const expected=boxes.some(test);if(expected)hits++;
  assert.equal(index.some(x,z,padding,test),expected,`disagreed at ${x.toFixed(2)},${z.toFixed(2)} padding ${padding}`);
 }
 assert.ok(hits>1000,'the sample lands inside colliders often enough to mean something');
});

test('it also matches the axis-aligned margin test the path grid uses',()=>{
 const map=maps.deadwater,boxes=mapColliders(map).filter(c=>!c.buildingId),index=boxIndex(boxes);
 for(let x=-map.width/2;x<=map.width/2;x+=.73)for(let z=-map.depth/2;z<=map.depth/2;z+=.91){
  const test=c=>Math.abs(x-c.x)<c.w/2+1.05&&Math.abs(z-c.z)<c.d/2+1.05;
  assert.equal(index.some(x,z,1.05,test),boxes.some(test));
 }
});
