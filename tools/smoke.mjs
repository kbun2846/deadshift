// Headless smoke check: plays a few seconds on each graphics preset (moving,
// shooting, secondary, dash, abilities, then three robots, an ally and an enemy-team robot) and prints any page errors or console
// errors/warnings, plus the JS heap. Run with the dev server up:
//   node tools/smoke.mjs
// Expect every "errs" list to be empty. Uses SwiftShader, so it says nothing
// about frame rate on a real GPU.
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const out=[];
for (const [q,w,map] of [['balanced','static','deadwater'],['extreme','rifle','deadwater'],['performance','shotgun','deadwater'],['potato','rifle','tutorial'],['quality','static','deadwater']]) {
 const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
 const errs=[]; p.on('pageerror',e=>errs.push('PE '+e.message)); p.on('console',m=>{if(['error','warning'].includes(m.type()))errs.push(m.type()+' '+m.text().slice(0,160))});
 await p.addInitScript(q=>localStorage.setItem('deadshift-settings',JSON.stringify({quality:q})),q);
 await p.goto(`http://127.0.0.1:5173/?play=1&weapon=${w}&map=${map}&capture=thumbnail`);
 await p.waitForFunction(()=>document.body.classList.contains('playing'),null,{timeout:60000});
 // shoot/move a bit
 await p.keyboard.down('KeyW'); await p.keyboard.down('Space'); await p.waitForTimeout(2500); await p.keyboard.up('Space'); await p.keyboard.up('KeyW');
 await p.keyboard.press('KeyE'); await p.waitForTimeout(2500);
 await p.keyboard.press('ControlLeft'); await p.keyboard.press('KeyX'); await p.keyboard.press('KeyC'); await p.waitForTimeout(1500);
 // Robots (dev tools): one of each weapon, fighting for a few seconds.
 await p.evaluate(() => { const sim = window.__bots && document.querySelector('#world') && window.__capture?.sim; if (!sim) return; for (const w of ['rifle', 'shotgun', 'static']) window.__bots.spawn(sim, w); window.__bots.spawn(sim, 'rifle', { team: 'blue' }); window.__bots.spawn(sim, 'static', { team: 'red' }); });
 await p.waitForTimeout(3000);
 const heap=await p.evaluate(()=>performance.memory?.usedJSHeapSize/1e6|0);
 out.push({q,w,map,heap,errs:[...new Set(errs)].slice(0,8)});
 await p.close();
}
console.log(JSON.stringify(out,null,1)); await b.close();
process.exitCode = out.some(o => o.errs.length) ? 1 : 0;
