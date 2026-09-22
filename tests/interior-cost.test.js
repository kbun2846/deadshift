import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldView} from '../src/renderer.js';
import {interiorCameraHeight} from '../src/camera-framing.js';
import {readFileSync} from 'node:fs';
import {MARK_BATCHES} from '../src/surface-marks.js';

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

test('the vision overlay backdrop pass gets cheaper on lower presets',()=>{
 const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 const rule=tier=>{
  const start=css.indexOf(`.interior-vision[data-quality=${tier}]{`);
  return start<0?null:css.slice(start,css.indexOf('}',start));
 };
 const blurRadius=body=>{
  const at=body.indexOf('blur(');
  return at<0?0:Number(body.slice(at+5,body.indexOf('px',at)));
 };
 const base=7; // the default .interior-vision rule
 assert.ok(css.includes('backdrop-filter:grayscale(.65) blur(7px)'),'the default rule should be unchanged');
 assert.ok(rule('potato').includes('backdrop-filter:none'),'Potato must drop the pass entirely');
 assert.equal(blurRadius(rule('performance')),0,'Performance keeps grayscale without a blur');
 const balanced=blurRadius(rule('balanced'));
 assert.ok(balanced>0&&balanced<base,`Balanced blurred ${balanced}px against a ${base}px default`);
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
 const source=readFileSync(new URL('../src/surface-marks.js',import.meta.url),'utf8');
 assert.ok(source.includes('while (batches.length > cap)'),'the oldest batch must actually be retired');
 assert.ok(source.includes('stale.geometry.dispose()'),'and its geometry released');
});
