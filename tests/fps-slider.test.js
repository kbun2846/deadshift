import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FPS_STOPS,FPS_MIN,FPS_MAX,FPS_PULL,FPS_UNCAPPED_SLIDER,DEFAULT_SETTINGS,
 fpsToSlider,fpsFromSlider,fpsLabel,snapFps,validateSettings} from '../src/settings.js';

test('the ladder runs one to two forty, with uncapped one past the top',()=>{
 assert.equal(FPS_MIN,1);
 assert.equal(FPS_MAX,240);
 assert.equal(FPS_UNCAPPED_SLIDER,FPS_MAX+1);
 assert.equal(fpsFromSlider(FPS_MIN),1,'the bottom of the track is 1 FPS');
 assert.equal(fpsFromSlider(FPS_UNCAPPED_SLIDER),0,'and the top is uncapped');
});

test('the weighted stops are the rates people actually target',()=>{
 assert.deepEqual([...FPS_STOPS],[20,30,45,60,90,120,180,240]);
 assert.deepEqual([...FPS_STOPS].sort((a,b)=>a-b),[...FPS_STOPS],'and they ascend');
 for(const stop of FPS_STOPS)assert.ok(stop>=FPS_MIN&&stop<=FPS_MAX,`${stop} is off the track`);
});

test('the handle is pulled onto a stop from either side',()=>{
 for(const stop of FPS_STOPS){
  for(const offset of [-FPS_PULL,-1,0,1,FPS_PULL]){
   const at=stop+offset;
   if(at<FPS_MIN||at>FPS_MAX)continue;
   // Two stops can compete; the nearer one wins, which is all that matters.
   const nearest=FPS_STOPS.reduce((best,s)=>Math.abs(s-at)<Math.abs(best-at)?s:best);
   assert.equal(snapFps(at),nearest,`${at} should be pulled to ${nearest}`);
  }
 }
});

test('past the pull it keeps moving and settles anywhere',()=>{
 for(const free of [8,14,52,75,105,150,165,210]){
  assert.equal(snapFps(free),free,`${free} should be freely selectable`);
 }
 // Every rate outside a pull window stays exactly where it is put.
 let held=0;
 for(let at=FPS_MIN;at<=FPS_MAX;at++){
  const pulled=FPS_STOPS.some(stop=>Math.abs(at-stop)<=FPS_PULL);
  if(!pulled){assert.equal(snapFps(at),at,`${at} should not be pulled`);held++;}
 }
 assert.ok(held>150,`only ${held} of 240 rates are freely choosable`);
});

test('the pull is narrow enough to keep neighbouring stops separate',()=>{
 for(let i=1;i<FPS_STOPS.length;i++){
  const gap=FPS_STOPS[i]-FPS_STOPS[i-1];
  assert.ok(gap>FPS_PULL*2,`${FPS_STOPS[i-1]} and ${FPS_STOPS[i]} overlap their pulls`);
 }
});

test('uncapped sits at the very top and cannot be pulled off it',()=>{
 assert.equal(snapFps(FPS_UNCAPPED_SLIDER),FPS_UNCAPPED_SLIDER);
 assert.equal(fpsFromSlider(snapFps(FPS_UNCAPPED_SLIDER)),0);
 assert.equal(fpsLabel(0),'UNCAPPED');
 // 240 is a real cap and must stay distinct from uncapped.
 assert.equal(fpsFromSlider(FPS_MAX),240);
 assert.equal(fpsLabel(240),'240 FPS');
});

test('slider position and frame cap round-trip',()=>{
 for(const fps of [1,20,37,60,99,144,240,0]){
  assert.equal(fpsFromSlider(fpsToSlider(fps)),fps,`${fps} did not survive the round trip`);
 }
});

test('a nonsense stored setting falls back rather than breaking the slider',()=>{
 assert.equal(validateSettings({fps:'fast'}).fps,DEFAULT_SETTINGS.fps);
 assert.equal(validateSettings({fps:-30}).fps,DEFAULT_SETTINGS.fps);
 assert.equal(validateSettings({fps:9000}).fps,DEFAULT_SETTINGS.fps);
 assert.equal(validateSettings({fps:0}).fps,0,'uncapped is a real choice');
 // Any rate on the track now survives, not only the old seven.
 for(const fps of [24,37,75,144,200])assert.equal(validateSettings({fps}).fps,fps);
});

test('the markup is a continuous range with a prong for every stop',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const input=html.match(/<input id="fps-limit"[^>]*>/)[0];
 assert.ok(input.includes('type="range"'));
 assert.ok(input.includes(`min="${FPS_MIN}"`));
 assert.ok(input.includes(`max="${FPS_UNCAPPED_SLIDER}"`),'the track must reach uncapped');
 assert.ok(input.includes('step="1"'));
 assert.ok(html.includes('id="fps-limit-ticks"'),'the prongs need a host');
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.ok(main.includes('FPS_STOPS.map'),'one prong per stop, built from the same list');
 assert.ok(main.includes('snapFps('),'and the handle is weighted on input');
});

test('the prongs are drawn in the interface accent',()=>{
 const css=readFileSync(new URL('../src/menu-theme.css',import.meta.url),'utf8');
 const rule=css.slice(css.indexOf('.slider-ticks i{'));
 assert.ok(rule.slice(0,rule.indexOf('}')).includes('background:var(--ui-accent)'),'prongs should be pink');
});
