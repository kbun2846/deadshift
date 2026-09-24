import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WorldView } from '../src/render/renderer.js';
import { ROADSIDE_TYPES, makeRoadside } from '../src/world/roadside.js';
import { deadwater, buildingPoint, mapColliders } from '../src/maps.js';
import { interiorCameraHeight, CAMERA_TILT } from '../src/render/camera-framing.js';
import { InteriorVisibility } from '../src/render/interior-visibility.js';
import { Simulation } from '../src/simulation.js';

test('roadside landmarks and outdoor cover have finite geometry and solid cover pieces', () => {
  assert.equal(Object.keys(ROADSIDE_TYPES).length, 17);
  // The three cover-only pieces exist to be crouched behind, so their boxes
  // must genuinely be solid and must not be a single straight wall.
  for (const type of ['sandbags','plankBarricade','waterTank']) {
    const t = ROADSIDE_TYPES[type];
    assert.equal(t.health, null, `${type} must not be destructible`);
    assert.ok(t.collisionBoxes.length >= 1, type);
    assert.ok(t.collisionBoxes.every(([,,w,d]) => w > 0 && d > 0), type);
  }
  for (const type of ['sandbags','plankBarricade']) {
    const [a, b] = ROADSIDE_TYPES[type].collisionBoxes;
    assert.ok(Math.abs(a[1] - b[1]) > .2, `${type} should be a bent line, not a flat wall`);
  }
  const view = Object.create(WorldView.prototype); view.materials = new Map(); view.static = new THREE.Group();
  for (const type of Object.keys(ROADSIDE_TYPES)) {
    const group = new THREE.Group(); makeRoadside(view, { type }, group);
    assert.ok(group.children.length >= 5, type);
    group.traverse(o => { if(o.geometry) { assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite),type); o.geometry.dispose(); } });
    const p = deadwater.props.find(p => p.type === type); assert.ok(p,type);
    const boxes = mapColliders({...deadwater, buildings:[], fences:[], props:[p]});
    assert.ok(boxes.length > 1); assert.ok(boxes.every(b => !b.destructible && b.w > 0 && b.d > 0));
    if (type==='culvert' || type==='checkpoint') assert.ok(boxes.every(b => Math.abs(b.x)>b.w/2+3.8), 'road remains clear');
  }
});
test('interior camera fits every rotated room and its surroundings on landscape and portrait displays', () => {
  for (const room of deadwater.buildings.filter(b=>!b.followCamera)) for (const aspect of [.6,1,1.6,2.2]) {
    const height = interiorCameraHeight(room,aspect), camera = new THREE.PerspectiveCamera(40,aspect,.1,180);
    camera.position.set(room.x,height,room.z+height*CAMERA_TILT);camera.lookAt(room.x,0,room.z);camera.updateMatrixWorld();
    for(const x of [-room.w/2-1.6,room.w/2+1.6]) for(const z of [-room.d/2-1.6,room.d/2+1.6]) for(const y of [0,room.height]) {
      const p=buildingPoint(room,x,z), screen=new THREE.Vector3(p.x,y,p.z).project(camera);
      assert.ok(Math.abs(screen.x)<=.881 && Math.abs(screen.y)<=.881,room.id+' '+aspect);
    }
  }
});
test('dynamic concealment uploads door/window regions and clears when leaving the room', () => {
  const sim = new Simulation(deadwater), mask = new InteriorVisibility();
  mask.update(sim); assert.equal(mask.count.value,0);
  sim.player.x=-12;sim.player.z=-5;mask.update(sim);assert.equal(mask.count.value,4);
  sim.player.x=0;sim.player.z=7;mask.update(sim);assert.equal(mask.count.value,0);
});

test('outdoor cover hides entities behind it and reveals them around its open flank', () => {
  const sim = new Simulation({...deadwater,buildings:[],fences:[],targets:[],props:[{type:'stoneBoundary',x:0,z:0}],spawn:{x:0,z:4}});
  assert.equal(sim.canSeeEntity(0,-4),false);
  assert.equal(sim.canAimAt(0,-4),true,'aiming remains free; projectile collision intercepts the shot');
  sim.player.x=7;
  assert.equal(sim.canSeeEntity(7,-4),true);
});

test('a body edge remains visible when only the center sightline clips outdoor cover',()=>{
 const sim=new Simulation({...deadwater,buildings:[],props:[],fences:[],targets:[],spawn:{x:0,z:0}});
 sim.colliders=[{x:2,z:.13,w:.3,d:.3,blocksSight:true}];
 assert.equal(sim.canSeeEntity(4,0,0),false);
 assert.equal(sim.canSeeEntity(4,0,.5),true);
 sim.colliders[0].d=3;
 assert.equal(sim.canSeeEntity(4,0,.5),false);
});

test('entity concealment clips fragments without altering shared scenery materials',()=>{
 const mask=new InteriorVisibility(),material=new THREE.MeshStandardMaterial(),root=new THREE.Group();
 const body=new THREE.Mesh(new THREE.BoxGeometry(),material);root.add(body);mask.applyEntity(root);
 assert.notEqual(body.material,material);
 assert.ok(!material.customProgramCacheKey().includes('interior-conceal'));
 const shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'void main() {'};
 body.material.onBeforeCompile(shader);
 assert.ok(shader.fragmentShader.includes('if (!interiorVisible()) discard'));
 assert.equal(shader.uniforms.interiorPoints,mask.points);
 const sim=new Simulation({...deadwater,spawn:{x:-12,z:-5},props:[],targets:[]});
 assert.equal(sim.canSeeEntity(-30,-5),false);
 assert.equal(sim.canSeeEntity(-30,-5,.5,false),true,'renderer defers interior clipping to fragments');
});

test('entity shadows use the same fragment concealment as their visible bodies',()=>{
 const mask=new InteriorVisibility(),root=new THREE.Group();
 const body=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());body.castShadow=true;root.add(body);
 mask.applyEntity(root);
 for(const material of [body.material,body.customDepthMaterial,body.customDistanceMaterial]){
   assert.ok(material);
   const shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'void main() {'};
   material.onBeforeCompile(shader);
   assert.equal(shader.uniforms.interiorCount,mask.count);
   assert.equal(shader.uniforms.interiorPoints,mask.points);
   assert.ok(shader.fragmentShader.includes('if (!interiorVisible()) discard'));
 }
});

test('outdoor rendering does not conceal visible entities with ground-level sight rays',()=>{
 const mask=new InteriorVisibility(),sim=new Simulation({...deadwater,buildings:[],props:[],fences:[],targets:[]});
 sim.colliders=[{x:2,z:3,w:4,d:4,blocksSight:true}];
 const body=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());body.castShadow=true;
 mask.applyEntity(body);mask.update(sim);
 assert.equal(mask.count.value,0);
 for(const material of [body.material,body.customDepthMaterial]){
   const shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'void main() {'};material.onBeforeCompile(shader);
   assert.ok(!shader.fragmentShader.includes('coverVisible'));
   assert.equal(shader.uniforms.interiorCount.value,0);
 }
});
