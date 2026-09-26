// Frozen frames of a map on every graphics preset, for before/after pixel
// comparisons (the hills system must leave Deadwater's picture untouched).
// Run with the dev server up:
//   node tools/flat-frames.mjs <outDir> [mapId]          writes <outDir>/<preset>-<spot>.png
//   node tools/flat-frames.mjs <outDir> [mapId] <refDir> also compares with refDir
// Each frame is posed and drawn inside one evaluate with everything that moves
// hidden (player, effects, birds, dust, tumbleweeds, motes) and time fixed, so
// two runs of the same code draw the same pixels.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const [outDir = '/tmp/flat-frames', mapId = 'deadwater', refDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const SPOTS = { deadwater: [{ x: 0, z: 0, height: 29 }, { x: -30, z: 38, height: 29 }, { x: 75, z: 80, height: 29 }], 'hill-test': [{ x: 0, z: 0, height: 29 }] };
const spots = SPOTS[mapId] || [{ x: 0, z: 0, height: 29 }];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = [];
for (const quality of ['potato', 'performance', 'balanced', 'quality', 'extreme']) {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
  await page.addInitScript(q => {
    localStorage.setItem('deadshift-settings', JSON.stringify({ quality: q, fps: 1, motion: false }));
    // Seeded, so noise textures and scattered scenery come out the same every load.
    let seed = 20260925; Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  }, quality);
  await page.goto(`http://127.0.0.1:5173/?play=1&map=${mapId}&weapon=rifle&capture=thumbnail`);
  await page.waitForFunction(() => window.__capture && document.body.classList.contains('playing'), null, { timeout: 90000 });
  if (quality === 'extreme') await page.waitForFunction(() => !!window.__capture.view.post, null, { timeout: 90000 });
  await page.waitForTimeout(4000);
  for (let i = 0; i < spots.length; i++) {
    const dataUrl = await page.evaluate(spot => {
      const { view, sim } = window.__capture;
      sim.dev = { ...sim.dev, ghost: true };
      view.birds?.clear?.();
      const hide = [view.player, view.motes, view.blobShadows?.moverMesh, ...view.targets.values(), ...(view.tumbleweeds || []), ...(view.fx?.meshes || []), ...(view.particlePool || []), ...(view.dustWisps || []).map(w => w.mesh || w)];
      for (const o of hide) if (o && 'visible' in o) o.visible = false;
      view.setPickView(spot);
      for (let k = 0; k < 3; k++) { view.sun.shadow.needsUpdate = true; view.update(sim, 1 / 60, false, 0, sim.player, 1); }
      for (const o of hide) if (o && 'visible' in o) o.visible = false;
      view.sun.shadow.needsUpdate = true; view.drawFrame();
      return view.renderer.domElement.toDataURL('image/png');
    }, spots[i]);
    const info = await page.evaluate(() => {
      const r = window.__capture.view.renderer, keys = (r.info.programs || []).map(p => p.cacheKey).sort();
      let h = 0x811c9dc5; for (const k of keys) for (let j = 0; j < k.length; j++) { h ^= k.charCodeAt(j); h = Math.imul(h, 16777619) >>> 0; }
      return { programs: keys.length, programHash: h.toString(16), calls: r.info.render.calls, triangles: r.info.render.triangles };
    });
    writeFileSync(`${outDir}/${quality}-${i}.json`, JSON.stringify(info));
    const file = `${outDir}/${quality}-${i}.png`;
    writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    if (refDir && existsSync(`${refDir}/${quality}-${i}.png`)) {
      const same = Buffer.compare(readFileSync(file), readFileSync(`${refDir}/${quality}-${i}.png`)) === 0;
      const ref = existsSync(`${refDir}/${quality}-${i}.json`) ? JSON.parse(readFileSync(`${refDir}/${quality}-${i}.json`, 'utf8')) : null;
      report.push({ quality, spot: i, same, programsSame: ref ? ref.programHash === info.programHash : null, calls: info.calls, refCalls: ref?.calls });
    }
  }
  await page.close();
}
await browser.close();
// Draw counts are informational: the shadow pass varies run to run.
if (refDir) { console.log(JSON.stringify(report)); process.exitCode = report.every(r => r.same && r.programsSame !== false) ? 0 : 1; }
else console.log('wrote', outDir);
