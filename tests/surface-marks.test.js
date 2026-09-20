import test from 'node:test';
import assert from 'node:assert/strict';
import { SurfaceMarks } from '../src/surface-marks.js';

test('scorch queue spreads radial work over frames and clearing cancels pending work',()=>{
  const marks=Object.create(SurfaceMarks.prototype);
  let steps=0;
  Object.assign(marks,{jobs:[],currentJob:null,receiverCache:null,batches:new Map(),view:{scene:{updateMatrixWorld(){}}}});
  marks.explosion=function*(){for(let i=0;i<24;i++){steps++;yield;}};
  marks.enqueue('explosion',{x:1,z:2});
  assert.equal(steps,0);
  marks.flush(100);assert.equal(steps,3);
  marks.clear();marks.flush(100);assert.equal(steps,3);
});

test('cosmetic impact queue has a bounded backlog',()=>{
  const marks=Object.create(SurfaceMarks.prototype);marks.jobs=[];
  for(let i=0;i<1000;i++)marks.enqueue('bullet',{x:i});
  assert.equal(marks.jobs.length,192);
});
