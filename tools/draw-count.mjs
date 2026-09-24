// Draw calls per frame (split into shadow-pass and blended draws) and
// getBoundingClientRect calls per frame, per preset, over three seconds of
// Practice. Serve a build first (e.g. `npx vite preview --port 4173`), then:
//   node tools/draw-count.mjs 4173 balanced,quality
import {chromium} from 'playwright';
const port=process.argv[2];
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
 args:['--use-angle=swiftshader','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
for(const q of (process.argv[3]||'balanced').split(',')){
 const p=await b.newPage({viewport:{width:1280,height:760}});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{
  const proto=WebGL2RenderingContext.prototype;
  window.__d=0;window.__f=0;window.__rect=0;window.__shadow=0;window.__blend=0;
  // Which framebuffer is bound tells shadow-pass draws from camera-pass draws,
  // and the BLEND capability tells how many draws are paying for blending.
  let offscreen=false,blending=false;
  const bind=proto.bindFramebuffer;
  proto.bindFramebuffer=function(target,fb){offscreen=!!fb;return bind.call(this,target,fb);};
  const en=proto.enable,dis=proto.disable;
  proto.enable=function(cap){if(cap===this.BLEND)blending=true;return en.call(this,cap);};
  proto.disable=function(cap){if(cap===this.BLEND)blending=false;return dis.call(this,cap);};
  for(const k of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){
   const f=proto[k];proto[k]=function(...a){
    window.__d++;if(offscreen)window.__shadow++;if(blending)window.__blend++;
    return f.apply(this,a);};}
  const g=Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect=function(){window.__rect++;return g.call(this);};
  const raf=window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame=cb=>raf(t=>{window.__f++;cb(t);});
 });
 await p.goto(`http://localhost:${port}/`,{waitUntil:'networkidle'});
 await p.evaluate(q=>{try{localStorage.setItem('deadshift-settings',JSON.stringify({quality:q}))}catch{}},q);
 await p.reload({waitUntil:'networkidle'});
 for(let i=0;i<200;i++){await p.waitForTimeout(500);if(await p.evaluate(()=>!document.getElementById('loading-screen')))break;}
 await p.click('#gamemodes');await p.waitForTimeout(150);
 await p.click('#practice-mode');await p.waitForTimeout(150);
 await p.click('#start');await p.waitForTimeout(200);
 const w=await p.$('.weapon-choice');if(w)await w.click();
 await p.waitForTimeout(2500);
 const read=()=>p.evaluate(()=>[window.__d,window.__f,window.__rect,window.__shadow,window.__blend]);
 const a=await read();
 await p.waitForTimeout(3000);
 const c=await read();
 const f=c[1]-a[1],per=i=>f?((c[i]-a[i])/f).toFixed(0):'n/a';
 console.log(`${q.padEnd(11)} draws ${per(0).padStart(4)}  shadow ${per(3).padStart(4)}  blended ${per(4).padStart(3)}  rects ${f?((c[2]-a[2])/f).toFixed(2):'?'}  errors ${errors.length}${errors.length?': '+errors[0]:''}`);
 await p.close();
}
await b.close();
