import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GRAPHICS,renderPixelRatio,AdaptiveResolution,RenderBudget,validateSettings} from '../src/settings.js';
import {WorldView} from '../src/renderer.js';
import {GrenadeView} from '../src/grenade-view.js';

test('45 fps persists and adaptive resolution respects capped frame pacing',()=>{
 assert.equal(validateSettings({fps:45}).fps,45);
 for(const fps of [30,45,60]){
  const adaptive=new AdaptiveResolution(),budget=new RenderBudget(fps);
  for(let i=0;i<1200;i++)adaptive.sample(1/60,budget.tick(1/60)>0,'balanced',fps);
  assert.equal(adaptive.scale,1,'healthy cap '+fps);
 }
});

test('adaptive resolution lowers sustained overload, recovers slowly and leaves quality unchanged',()=>{
 const adaptive=new AdaptiveResolution();
 for(let i=0;i<360;i++)adaptive.sample(1/30,true,'performance',60);
 assert.ok(Math.abs(adaptive.scale-.7)<1e-6);
 const low=adaptive.scale;
 for(let i=0;i<240;i++)adaptive.sample(1/60,true,'performance',60);
 assert.equal(adaptive.scale,low,'brief recovery must not cause flicker');
 for(let i=0;i<360;i++)adaptive.sample(1/60,true,'performance',60);
 assert.ok(adaptive.scale>low&&adaptive.scale<1);
 assert.equal(adaptive.sample(1/30,true,'quality',60),1);
 adaptive.reset();assert.equal(adaptive.scale,1);
 // Extreme sheds at most a fifth of its resolution.
 const extreme=new AdaptiveResolution();
 for(let i=0;i<600;i++)extreme.sample(1/30,true,'extreme',60);
 assert.ok(Math.abs(extreme.scale-.8)<1e-6);
});

test('every graphics tier bounds pixel work on phones and large high-DPI monitors',()=>{
 for(const [w,h,dpr] of [[390,844,3],[844,390,3],[1920,1080,1],[3840,2160,2]]){
  let previous=0;
  for(const quality of Object.values(GRAPHICS)){
   const ratio=renderPixelRatio(quality,dpr,w,h);
   assert.ok(ratio>0&&ratio<=dpr);
   assert.ok(w*h*ratio*ratio<=quality.maxPixels+1);
   assert.ok(ratio>=previous);previous=ratio;
  }
 }
 assert.equal(renderPixelRatio(GRAPHICS.balanced,1,1280,720),1);
});

test('recycled particle instances lose previous dust tints and idle pools skip buffer uploads',()=>{
 const view=Object.create(WorldView.prototype);
 view.particleMaterials=[new THREE.MeshBasicMaterial()];
 view.particlePool=[new THREE.InstancedMesh(new THREE.BoxGeometry(),view.particleMaterials[0],240)];
 view.dummy=new THREE.Object3D();
 const particle=tint=>({life:1,maxLife:1,x:0,y:1,z:0,vx:0,vy:0,vz:0,material:0,size:1,angle:0,tint});
 view.particles=[particle(new THREE.Color('red'))];view.updateParticles(0);
 view.particles=[particle(null)];view.updateParticles(0);
 const color=new THREE.Color();view.particlePool[0].getColorAt(0,color);
 assert.equal(color.getHexString(),'ffffff');
 view.particles=[];const version=view.particlePool[0].instanceMatrix.version;
 view.updateParticles(.1);
 assert.equal(view.particlePool[0].count,0);
 assert.equal(view.particlePool[0].instanceMatrix.version,version);
});

test('grenade renderer does not hide Ballast supporting hand or show a held grenade on it',()=>{
 const view={scene:new THREE.Scene(),player:new THREE.Group(),rifleView:{pose:{offHand:new THREE.Group()}},qualityName:'potato'};
 const grenades=new GrenadeView(view);
 const sim={weapon:'shotgun',player:{aimX:1,aimZ:0},time:0,grenadeThrowTime:0,grenades:[]};
 grenades.update(sim);
 assert.equal(grenades.arm.visible,true);
 assert.equal(grenades.held.visible,false);
 assert.equal(grenades.rangeMarker.visible,false);
});
