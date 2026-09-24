import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {mergeTransformed} from '../src/render/merge-transformed.js';

let seed=3;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
const shapes=[()=>new THREE.BoxGeometry(rand()+.1,rand()+.1,rand()+.1),()=>new THREE.ConeGeometry(.2,rand()+.2,3),
 ()=>new THREE.SphereGeometry(.05,5,3),()=>new THREE.CylinderGeometry(.1,.2,.5,8),()=>new THREE.DodecahedronGeometry(.1)];
const randomMatrix=()=>new THREE.Matrix4().compose(new THREE.Vector3((rand()-.5)*80,rand()*3,(rand()-.5)*80),
 new THREE.Quaternion().setFromEuler(new THREE.Euler(rand()*6,rand()*6,rand()*6)),new THREE.Vector3(.3+rand()*2,.3+rand()*2,.3+rand()*2));

test('the direct merge matches clone, transform and mergeGeometries',()=>{
 for(const make of shapes)for(const count of [2,7,40]){
  const entries=Array.from({length:count},()=>({geometry:make(),matrix:randomMatrix()}));
  const reference=mergeGeometries(entries.map(({geometry,matrix})=>geometry.clone().applyMatrix4(matrix)));
  const merged=mergeTransformed(entries);
  assert.ok(merged,'handled');
  assert.deepEqual(Object.keys(merged.attributes).sort(),Object.keys(reference.attributes).sort());
  for(const name of Object.keys(reference.attributes)){
   const a=merged.attributes[name].array,b=reference.attributes[name].array;
   assert.equal(a.length,b.length,name+' length');
   for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<1e-5,`${name}[${i}] ${a[i]} vs ${b[i]}`);
  }
  assert.equal(!!merged.index,!!reference.index);
  if(reference.index)assert.deepEqual(Array.from(merged.index.array),Array.from(reference.index.array));
 }
});

test('it declines what it cannot merge, so the caller can fall back',()=>{
 const a=new THREE.BoxGeometry(),b=new THREE.BoxGeometry().toNonIndexed(),m=new THREE.Matrix4();
 assert.equal(mergeTransformed([{geometry:a,matrix:m},{geometry:b,matrix:m}]),null,'indexed with non-indexed');
 const c=new THREE.BoxGeometry();c.deleteAttribute('uv');
 assert.equal(mergeTransformed([{geometry:a,matrix:m},{geometry:c,matrix:m}]),null,'different attribute sets');
});
