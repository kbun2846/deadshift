// Frozen frames of a terrain map on every graphics preset, with each preset's
// frame cost and shader program count, for before/after looks at the ground.
// Run with a dev server up (any port):
//   node tools/terrain-frames.mjs <outDir> [mapId] [port] [presets,comma,separated]
// writes <outDir>/<preset>-<spot>.png and <outDir>/report.json.
// Frames are posed as tools/flat-frames.mjs poses them (everything that moves
// hidden, the camera cut to each spot). The frame cost is the mean of a few
// forced draws with a 1-pixel read-back after each, so compare presets and
// runs against each other only (SwiftShader here is very slow).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [outDir = '/tmp/terrain-frames', mapId = 'hill-test', port = '5173', only] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const SPOTS = {
 'hill-test': [{ x: 0, z: 6, height: 29 }, { x: -20, z: -8, height: 29 }, { x: 4, z: 18, height: 29 }, { x: 20, z: -12, height: 29 }],
};
const spots = SPOTS[mapId] || [{ x: 0, z: 0, height: 29 }];
const presets = only ? only.split(',') : ['potato', 'performance', 'balanced', 'quality', 'extreme'];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = [];
for (const quality of presets) {
 const page = await browser.newPage({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 });
 const errors = [];
 page.on('pageerror', e => errors.push(e.message));
 page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
 await page.addInitScript(q => {
  localStorage.setItem('deadshift-settings', JSON.stringify({ quality: q, fps: 1, motion: false }));
  let seed = 20260925; Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
 }, quality);
 await page.goto(`http://127.0.0.1:${port}/?play=1&map=${mapId}&weapon=rifle&capture=thumbnail`);
 await page.waitForFunction(() => window.__capture && document.body.classList.contains('playing'), null, { timeout: 180000 });
 if (quality === 'extreme') await page.waitForFunction(() => !!window.__capture.view.post, null, { timeout: 180000 });
 await page.waitForTimeout(4000);
 const loaded = await page.evaluate(() => window.__capture.view.renderer.info.programs.length);
 const frames = [];
 for (let i = 0; i < spots.length; i++) {
  const shot = await page.evaluate(spot => {
   const { view, sim } = window.__capture;
   sim.dev = { ...sim.dev, ghost: true };
   view.birds?.clear?.();
   const hide = [view.player, view.motes, view.blobShadows?.moverMesh, ...view.targets.values(), ...(view.tumbleweeds || []), ...(view.fx?.meshes || []), ...(view.particlePool || []), ...(view.dustWisps || []).map(w => w.mesh || w)];
   for (const o of hide) if (o && 'visible' in o) o.visible = false;
   view.setPickView(spot);
   for (let k = 0; k < 3; k++) { view.sun.shadow.needsUpdate = true; view.update(sim, 1 / 60, false, 0, sim.player, 1); }
   for (const o of hide) if (o && 'visible' in o) o.visible = false;
   view.sun.shadow.needsUpdate = true; view.drawFrame();
   const url = view.renderer.domElement.toDataURL('image/png');
   // Frame cost: forced draws, each finished with a 1-pixel read.
   const gl = view.renderer.getContext(), px = new Uint8Array(4), times = [];
   for (let k = 0; k < 5; k++) {
    const t0 = performance.now(); view.sun.shadow.needsUpdate = true; view.drawFrame();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); times.push(performance.now() - t0);
   }
   times.sort((a, b) => a - b);
   return { url, ms: times[2], calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles };
  }, spots[i]);
  writeFileSync(`${outDir}/${quality}-${i}.png`, Buffer.from(shot.url.split(',')[1], 'base64'));
  frames.push({ spot: i, ms: +shot.ms.toFixed(1), calls: shot.calls, triangles: shot.triangles });
 }
 const info = await page.evaluate(() => {
  const view = window.__capture.view, m = view.terrainMaterial;
  return { programs: view.renderer.info.programs.length, terrainPrograms: (view.renderer.info.programs || []).filter(p => /ground-layers/.test(p.cacheKey)).length, bake: view.groundLook?.timing || null, hasLook: !!m?.userData.patches };
 });
 report.push({ quality, loaded, ...info, linkedAfterLoad: info.programs - loaded, frames, errors: errors.slice(0, 5) });
 console.log(JSON.stringify(report.at(-1)));
 await page.close();
}
await browser.close();
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 1));
