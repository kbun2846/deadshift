// Lumen's visibility audit on the GPU (AGENTS.md > Lumen > "What the camera
// can and can't see"): the real frame's geometry, checked pixel by pixel
// against the CPU caster (tools/lumen-visaudit-lib.mjs). Loads Lumen on a
// dev server with ?visdebug (render/city-shells.js exposes
// render/city-vis-debug.js), holds the game's loop, and at each spot puts
// you there, lets the camera settle, draws the ID render and classifies it
// (CityVisDebug.classify): see-through, a storey left standing in front of
// K, an interior shown that the rule never shows, a section cap where none
// should be. Views from a building the camera is in or coming into are
// counted apart (fromInside: its walls face away). Dev server up, then:
//   node tools/lumen-visaudit-gpu.mjs [--port 5173] [--preset performance] [--spots name:x,z;...] [--out dir]
// Exits non-zero on any mismatch.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const port = arg('port', '5173'), preset = arg('preset', 'performance'), out = arg('out', '');
// Outdoors (roads, by tall buildings, the courtyard) and inside (rooms).
const DEFAULT_SPOTS = 'avenue-n:-0.5,-36;avenue-s:12.5,20;arcade:-0.5,-20;pharmacy-north:-7,9.5;boulevard:40,2;velvet-row:-42,44;metro:26,40;uptown:46,-24;'
  + 'stacks-courtyard:-42,-26;night-market:-13,-44;charging-lot:-14,44;back-alley:-13,-22.7;hotel-lobby:19.25,-31;stacks-unit-2:-56,-33.5;market-hall:-14,-47;'
  + 'karaoke:-42.5,54;club:-55,45;luxury-lobby:31,-15;flatiron:38,18;clinic:-21,21';
const spots = arg('spots', DEFAULT_SPOTS).split(';').filter(Boolean).map(s => { const [name, at] = s.split(':'); const [x, z] = at.split(',').map(Number); return { name, x, z }; });
if (out) mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
await page.addInitScript(q => localStorage.setItem('deadstab-settings', JSON.stringify({ quality: q, qualityAuto: false })), preset);
await page.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); window.__hold = false; window.requestAnimationFrame = cb => raf(t => { if (window.__hold) window.__held = cb; else cb(t); }); });
await page.goto(`http://127.0.0.1:${port}/?play=1&weapon=rifle&map=lumen&capture=thumbnail&visdebug`);
await page.waitForFunction(() => document.body.classList.contains('playing') && window.__capture && window.__cityVisDebug, null, { timeout: (+process.env.PERF_TIMEOUT || 900) * 1000 });
await page.evaluate(async () => {
  for (let i = 0; i < 600 && (window.__capture.view.holdRender || i < 20); i++) await new Promise(r => setTimeout(r, 100));
  window.__hold = true;
  const lib = await import('/tools/lumen-visaudit-lib.mjs'), { sim, view, map } = window.__capture;
  window.__audit = { lib, dbg: new window.__cityVisDebug.CityVisDebug(view), model: lib.auditModel(view.city.shells, map), t: 100 };
});
let bad = 0;
const rows = [];
for (const s of spots) {
  const r = await page.evaluate(({ x, z, image }) => {
    const { sim, view } = window.__capture, a = window.__audit;
    Object.assign(sim.player, { x, z }); view.cameraCut = true;
    for (let i = 0; i < 60; i++) { const prev = { x: sim.player.x, z: sim.player.z }; Object.assign(sim.player, { x, z, vx: 0, vz: 0, hp: 9999, health: 9999 }); a.t += 1 / 30; view.update(sim, 1 / 30, true, a.t, prev, 1); }
    const f = a.dbg.render(480, 270), img = image ? new Uint8ClampedArray(480 * 270 * 4) : null;
    const c = a.dbg.classify(f, a.lib, a.model, 2, img);
    if (img) { const cv = document.createElement('canvas'); cv.width = 480; cv.height = 270; cv.getContext('2d').putImageData(new ImageData(img, 480, 270), 0, 0); c.image = cv.toDataURL('image/png'); }
    c.room = sim.interior?.id ?? null;
    return c;
  }, { x: s.x, z: s.z, image: !!out });
  if (r.image) { writeFileSync(`${out}/${s.name}-id.png`, Buffer.from(r.image.split(',')[1], 'base64')); delete r.image; }
  const n = r.seeThrough + r.missingCut + r.interior + r.section;
  bad += n;
  rows.push({ spot: s.name, room: r.room || '-', compared: r.compared, seeThrough: r.seeThrough, missingCut: r.missingCut, interior: r.interior, section: r.section, fromInside: r.fromInside });
  if (n) console.log(s.name, r.where.slice(0, 4).join(' | '));
}
console.table(rows);
await browser.close();
process.exit(bad ? 1 : 0);
