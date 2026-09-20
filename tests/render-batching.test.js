import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldView} from '../src/renderer.js';
import {deadwater,mapColliders,buildingPoint} from '../src/maps.js';
import {interiorCover} from '../src/detailed-interiors.js';
import {segmentBox} from '../src/simulation.js';
test('spatial batches preserve all triangles and world bounds while separating distant detail',()=>{
 const view=Object.create(WorldView.prototype),root=new THREE.Group(),mat=new THREE.MeshStandardMaterial();
 for(const x of [0,1,100,101]){const m=new THREE.Mesh(new THREE.BoxGeometry(1,2,3),mat);m.position.set(x,1,0);m.castShadow=true;root.add(m);}
 root.updateMatrixWorld(true);const before=new THREE.Box3().setFromObject(root);
 view.batch(root);root.updateMatrixWorld(true);
 assert.equal(root.children.length,2);
 assert.equal(root.children.reduce((n,m)=>n+m.geometry.index.count/3,0),48);
 assert.ok(new THREE.Box3().setFromObject(root).equals(before));
 assert.ok(root.children.every(m=>m.geometry.boundingSphere.radius<3&&m.castShadow));
});
test('expanded interiors have real rotated cover and a clear passage to the storage room',()=>{
 for(const b of deadwater.buildings.filter(b=>['workshop','depot'].includes(b.interiorStyle))){
  assert.ok(b.w*b.d>=168);
  const cover=mapColliders({...deadwater,buildings:[b],props:[],fences:[]}).filter(c=>c.interiorCover);
  assert.equal(cover.length,interiorCover(b).length);
  const start=buildingPoint(b,0,0),end=buildingPoint(b,0,-b.d/2+1);
  assert.ok(!cover.some(c=>segmentBox(start.x,start.z,end.x,end.z,c,.35)!==null));
  const a=buildingPoint(b,-2.7,2),z=buildingPoint(b,-2.7,-1);
  assert.ok(cover.some(c=>segmentBox(a.x,a.z,z.x,z.z,c)!==null));
 }
});
