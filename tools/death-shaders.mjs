// Shaders built at a first death: dies once of each kind on a preset and
// prints how many programs were linked by it. Expect 0. Dev server up.
//   node tools/death-shaders.mjs [quality=extreme]
import { chromium } from 'playwright';
const q = process.argv[2] || 'extreme';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const type of ['gunshot', 'explosion', 'fire', 'ballastFatal', 'electric']) {
 const p = await b.newPage({ viewport: { width: 900, height: 560 } });
 await p.addInitScript(q => localStorage.setItem('deadshift-settings', JSON.stringify({ quality: q })), q);
 await p.goto('http://127.0.0.1:5173/?play=1&weapon=rifle&map=deadwater&capture=thumbnail'); await p.waitForFunction(() => document.body.classList.contains('playing'), null, { timeout: 180000 });
 await p.waitForTimeout(1000);
 const count = () => p.evaluate(() => window.__capture.view.renderer.info.programs.length);
 const before = await count();
 await p.evaluate(t => window.__capture.sim.damagePlayer(9999, 'dev', false, false, { x: 1, z: 0 }, t), type);
 await p.waitForTimeout(3500);
 console.log(q, type, 'programs linked by the death:', (await count()) - before);
 await p.close();
}
await b.close();
