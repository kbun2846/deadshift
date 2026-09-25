import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CAMERA_NEAR} from '../src/render/renderer.js';
import {interiorCameraHeight} from '../src/render/camera-framing.js';
import {maps} from '../src/maps.js';

// Files by name, wherever they sit under src/.
const where={'renderer.js':'render/','dust-trail.js':'effects/','crop-view.js':'world/'};
const src=f=>readFileSync(new URL('../src/'+(where[f]||'')+f,import.meta.url),'utf8');

test('shader warm-up runs after the tier is applied, and again on a tier change',()=>{
 // The shadow-map type and bump maps are part of three's program cache key and
 // setQuality changes both. Warming first compiled everything for PCFSoft and
 // then Balanced switched to PCF, so every program compiled live -- eleven of
 // them the first time the player walked into a building.
 const r=src('renderer.js');
 const ctor=r.slice(r.indexOf('constructor('),r.indexOf('\n  setQuality('));
 // The load-time warm-up now runs from main.js once the view is built (so
 // after setQuality), awaited behind the loading screen.
 const quality=ctor.indexOf("this.setQuality(GRAPHICS[qualityName]");
 assert.ok(quality>0,'the tier is applied in the constructor');
 assert.ok(!ctor.includes('this.warmPrograms();'),'the constructor no longer warms by itself');
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.ok(main.indexOf('view.warmProgramsParallel()')>main.indexOf('new WorldView('),'main.js warms the built view');
 const setQuality=r.slice(r.indexOf('\n  setQuality('),r.indexOf('\n  reliefTexture('));
 assert.ok(/if \(this\.programsWarmed\) this\.warmPrograms\(\);/.test(setQuality),'a later preset change re-warms');
});

test('the effects light is dimmed, never hidden, during play',()=>{
 // The number of lights is compiled into every shader. Hiding this light when
 // it fell out of sight -- which stepping indoors does -- asked for a new
 // variant of every material on screen at once.
 const r=src('renderer.js');
 const render=r.slice(r.indexOf('\n  render() {'),r.indexOf('\n  updateVision('));
 assert.ok(!/fxLight\.visible\s*=/.test(render),'render() must not toggle the light\'s visibility');
 assert.ok(/fxLight\.intensity\s*=\s*seen \? this\.fxLightLevel : 0/.test(render),'it gates through intensity instead');
 const writes=[...r.matchAll(/this\.fxLight\.intensity\s*=/g)].length;
 assert.equal(writes,1,'every other write goes to the logical level');
});

test('instanced effects allocate per-instance colour before the warm-up',()=>{
 // Whether an instanced mesh has instance colour is part of its shader; a
 // buffer grown on the first setColorAt compiled a second program mid-game.
 for(const [file,pattern] of [['renderer.js',/mesh\.instanceColor = new THREE\.InstancedBufferAttribute/],
   ['dust-trail.js',/this\.mesh\.instanceColor = new THREE\.InstancedBufferAttribute/],
   ['crop-view.js',/this\.flames\.instanceColor = new THREE\.InstancedBufferAttribute/]])
  assert.ok(pattern.test(src(file)),`${file} allocates its colour buffer up front`);
});

test('the near plane is as far out as the closest camera allows',()=>{
 // Depth precision is spent in proportion to 1/near. At 0.1 almost all of it
 // went on empty space in front of the lens and far surfaces a few millimetres
 // apart flickered through each other -- on 16-bit depth buffers, 24cm apart.
 assert.ok(CAMERA_NEAR>=1,`near plane ${CAMERA_NEAR} wastes depth precision`);
 let lowest=Infinity;
 for(const b of maps.deadwater.buildings)for(const aspect of [.46,.75,1,1.33,1.78,2.2])
  lowest=Math.min(lowest,interiorCameraHeight(b,aspect));
 // The death camera pushes in to 56% of the camera's height. The tallest
 // static geometry is a roof ridge: walls top out at 3.3m and the ridge sits
 // 0.8m above that. Five metres leaves margin for anything taller added later.
 const tallest=5;
 const buildingTop=Math.max(...maps.deadwater.buildings.map(b=>b.height))+.8;
 assert.ok(buildingTop<=tallest,`a ${buildingTop.toFixed(1)}m roof is taller than this test allows for`);
 assert.ok(lowest*.56-tallest>CAMERA_NEAR,`near plane ${CAMERA_NEAR} would clip at a ${(lowest*.56).toFixed(1)} camera`);
});

test('a fading roof tells three its shader has to change',()=>{
 // three only re-picks a material's shader on needsUpdate; the opaque shader
 // forces alpha to 1, so flipping `transparent` alone left roofs solid indoors.
 const r=src('renderer.js');
 const fade=r.slice(r.indexOf('const blended = roof.opacity < .995'),r.indexOf('const castsShadow=roof.opacity>.5;'));
 assert.ok(/if \(roof\.blended !== blended\)/.test(fade),'only on an actual change');
 assert.ok(/m\.transparent = blended; m\.needsUpdate = true;/.test(fade),'with needsUpdate alongside the flag');
});
