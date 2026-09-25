import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldView} from '../src/render/renderer.js';
import {interiorCameraHeight} from '../src/render/camera-framing.js';
import {readFileSync} from 'node:fs';
import {MARK_BATCHES} from '../src/effects/surface-marks.js';

// Both behaviours under test are pure functions of view state, so they are
// driven directly rather than through a live WebGL context.
const room=id=>({id,x:0,z:0,w:12,d:10,height:3,doors:['front'],windows:[]});

test('the room camera fit is memoised per room and aspect',()=>{
 const view={camera:{aspect:1.6},roomFit:null};
 const fit=WorldView.prototype.roomHeight;
 const a=room('saloon');
 const first=fit.call(view,a),stored=view.roomFit;
 assert.equal(fit.call(view,a),first);
 assert.equal(view.roomFit,stored,'same room and aspect must reuse the fit');
 assert.equal(first,interiorCameraHeight(a,1.6),'the memo must not change the result');
 view.camera.aspect=.75;
 fit.call(view,a);
 assert.notEqual(view.roomFit,stored,'a new aspect recomputes');
 const before=view.roomFit;
 fit.call(view,room('barn'));
 assert.notEqual(view.roomFit,before,'a new room recomputes');
});

test('the interior mask rebuild is capped rather than running every frame',()=>{
 // Mirrors updateVision's gate: a fresh key still redraws, but only once the
 // clock has elapsed, and sub-pixel drift is quantised out of the key entirely.
 const quantise=(value,step)=>Math.round(value/step);
 const key=(x,z)=>[quantise(x,.05),quantise(z,.05)].join(',');
 assert.equal(key(3,4),key(3.004,4.004),'sub-centimetre drift must not rebuild');
 assert.notEqual(key(3,4),key(3.2,4),'real movement must rebuild');

 let clock=0,effectTime=0,rebuilds=0,lastKey=null;
 const frame=(x,z)=>{
  effectTime+=1/60;
  const now=key(x,z);
  if(lastKey===now)return;
  if(clock>effectTime&&lastKey)return;
  clock=effectTime+.05;lastKey=now;rebuilds++;
 };
 // One second of continuous movement across a room.
 for(let i=0;i<60;i++)frame(i*.08,0);
 assert.ok(rebuilds<=21,`rebuilt ${rebuilds} times in a second`);
 assert.ok(rebuilds>=18,`should still track the player, only rebuilt ${rebuilds}`);
});

test('the interior shroud costs less the lower the preset goes',()=>{
 const css=readFileSync(new URL('../src/styles/style.css',import.meta.url),'utf8');
 const rule=tier=>{
  const start=css.indexOf(`.interior-vision[data-quality=${tier}]{`);
  return start<0?null:css.slice(start,css.indexOf('}',start));
 };
 // A backdrop blur is a whole-viewport backdrop read and filter on every
 // composited frame -- the most expensive thing that can sit over a tiler.
 // The shroud is painted into a canvas now, so no tier needs one at all.
 const shroudRules=[...css.matchAll(/\.interior-vision[^{]*\{([^}]*)\}/g)].map(m=>m[1]);
 assert.ok(shroudRules.length>=3,'the shroud still has per-tier rules');
 // No tier may carry a backdrop filter. It is clipped by the element's mask and
 // not by what the element paints, so with the mask gone it drained the room the
 // player is standing in along with the world outside -- and a backdrop read is
 // a whole-viewport pass on every composited frame besides.
 for(const body of shroudRules)
  assert.ok(!/backdrop-filter:\s*(?!none)/.test(body),`the shroud must not filter its backdrop: ${body.slice(0,70)}`);
 for(const tier of ['potato','performance'])
  assert.ok(rule(tier).includes('backdrop-filter:none'),`${tier} must drop the backdrop pass entirely`);
 // And the painted buffer itself has to get coarser, not just the filter.
 const renderer=['renderer','world-build','warm-up','vision'].map(f=>readFileSync(new URL('../src/render/'+f+'.js',import.meta.url),'utf8')).join('\n') /* WorldView and its method files */;
 const table=renderer.slice(renderer.indexOf('const VISION_STEP'),renderer.indexOf('const VISION_REPAINT'));
 const step=tier=>Number(table.match(new RegExp(tier+':\\s*(\\d+)'))[1]);
 assert.ok(step('potato')>step('performance'),'Potato paints coarser than Performance');
 assert.ok(step('performance')>step('balanced'),'Performance paints coarser than Balanced');
 assert.ok(step('balanced')>=step('quality'),'Balanced is no finer than Quality');
 assert.ok(step('quality')>=4,'even Quality stays well below the viewport');
});

test('the shroud never goes back to an asynchronously decoded mask',()=>{
 // A `mask-image` data URI decodes off the main thread, so the shroud painted
 // itself unmasked for a frame every time one swapped. That was the flicker.
 const renderer=['renderer','world-build','warm-up','vision'].map(f=>readFileSync(new URL('../src/render/'+f+'.js',import.meta.url),'utf8')).join('\n') /* WorldView and its method files */;
 assert.ok(!/visionOverlay\.style\.maskImage/.test(renderer),'no mask-image on the shroud');
 assert.ok(!/image\/svg\+xml.*interiorPolygons/s.test(renderer)||!/feMorphology/.test(renderer.slice(renderer.indexOf('paintVision'))),
  'no SVG filter chain rebuilt for the interior shroud');
 assert.ok(/paintVision\s*\(/.test(renderer),'it is painted into a canvas instead');
});

test('soot is a rolling window, not a permanent record',()=>{
 // Every mark is a blended, ground-coplanar draw with depthWrite off, and the
 // ground is the whole screen from this camera. Unbounded growth is a
 // fill-rate leak that only appears after a long session.
 for(const [preset,cap] of Object.entries(MARK_BATCHES)){
  assert.ok(Number.isInteger(cap)&&cap>=1,`${preset} cap ${cap}`);
  assert.ok(cap<=4,`${preset} allows ${cap} stacked blended layers`);
 }
 assert.ok(MARK_BATCHES.performance<=MARK_BATCHES.balanced,'phones must not allow more layers than desktops');
 assert.ok(MARK_BATCHES.balanced<=MARK_BATCHES.quality);
 const source=readFileSync(new URL('../src/effects/surface-marks.js',import.meta.url),'utf8');
 assert.ok(source.includes('while (batches.length > cap)'),'the oldest batch must actually be retired');
 assert.ok(source.includes('stale.geometry.dispose()'),'and its geometry released');
});
