import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldView} from '../src/renderer.js';
import {deadwater,mapColliders,buildingPoint} from '../src/maps.js';
import {interiorCover} from '../src/detailed-interiors.js';
import {segmentBox} from '../src/simulation.js';
import {readFileSync} from 'node:fs';
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

test('the roof fade only re-enables the meshes that were built as casters',()=>{
 // Shingles are deliberately excluded from the shadow pass before the batch,
 // because castShadow is part of the merge key. The fade used to traverse the
 // whole roof group and switch every merged tile batch back on, undoing that
 // on the first frame and putting every shingle into the shadow map.
 const source=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
 const build=source.slice(source.indexOf('for (const layer of roof.children)'),source.indexOf('this.roofs.push('));
 assert.ok(build.includes('this.noShadows(tile)'),'tiles are still excluded before the batch');
 assert.ok(source.includes('this.roofs.push({ ...b, group: roof, casters,'),'the casters are captured at build time');
 const casters=source.indexOf('const casters = []');
 const batch=source.indexOf('this.batch(roof);');
 assert.ok(casters>batch,'the casters must be collected after the merge, not before');
 const fade=source.slice(source.indexOf('const castsShadow=roof.opacity>.5'),source.indexOf('const castsShadow=roof.opacity>.5')+320);
 assert.ok(fade.includes('for(const m of roof.casters)'),'the fade toggles only the recorded casters');
 assert.ok(!fade.includes('roof.group.traverse'),'the fade must not traverse the whole roof group');
});

test('shadowBySize only ever removes casters, never restores them',()=>{
 const view=Object.create(WorldView.prototype);
 const root=new THREE.Group();
 // The view's own mesh()/box() helpers create casters, so that is the state
 // shadowBySize is always handed in the real build.
 const caster=()=>{const m=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshStandardMaterial());m.castShadow=true;return m;};
 const big=caster();
 const small=new THREE.Mesh(new THREE.BoxGeometry(.05,.05,.05),new THREE.MeshStandardMaterial());small.castShadow=true;
 // Something an earlier pass deliberately excluded — interior furniture under a
 // closed roof, say — must stay excluded.
 const excluded=caster();
 excluded.castShadow=false;
 root.add(big,small,excluded);
 view.shadowBySize(root,.34);
 assert.equal(big.castShadow,true,'a readable silhouette keeps casting');
 assert.equal(small.castShadow,false,'sub-texel geometry stops casting');
 assert.equal(excluded.castShadow,false,'an explicit exclusion is not undone');
});
