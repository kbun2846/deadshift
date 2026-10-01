// Lumen's flicker detector (2026-09-30; owner: "some of these things flicker
// and jitter with their textures as I move"). Headless: walks the player
// slowly (0.75 m/s, a frame every 0.05 s) along each spot with the game's own
// loop stopped, the weather dry and every effect clock frozen; renders each
// frame again into its own target (colour + 24-bit depth, tools/flicker-page.js),
// reprojects each frame onto the next through the two cameras and flags
// pixels where the same surface (the depth agrees) changed colour sharply:
// z-fighting (two faces in one plane), shadow crawl, sub-pixel aliasing.
// Prints flagged pixels per spot and the clusters by object and place (a
// raycast at a flagged pixel; two hits at one depth = two faces in one plane;
// "none": a vertex shader moved it, the cut), and saves frame pairs and masks
// (magenta) for frames that flicker (SAVEALL=1: every frame).
//   node tools/flicker-check.mjs <preset> <outdir> [spots=all] [frames=24] [speed=.75]
// env: PORT (dev server, 5173), CLOCK (weather clock, 230 = dry), W, H (800 x 500),
// THR (colour jump, 48 of 255), FREEZESHADOW=1 (the sun's map kept from the
// first frame: tells shadow crawl from the rest), WALKS (JSON: more spots,
// name: [x, z, dirX, dirZ]). Inside a room the camera holds still: 0 there.
// The city camera (world/city-camera.js) is made afresh at each spot, so a
// spot's numbers do not depend on the one before.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const [preset = 'quality', outdir = 'flicker-out', spotArg = 'all', framesArg = '24', speedArg = '.75'] = process.argv.slice(2);
const PORT = process.env.PORT || 5173, W = +(process.env.W || 800), H = +(process.env.H || 500), CLOCK = +(process.env.CLOCK ?? 230);
const STEP = .05, FRAMES = +framesArg, SPEED = +speedArg;
// Spots: [x, z, dirX, dirZ] -- the walk's start and heading.
export const WALKS = {
  'cut-ne': [36, 19.9, .707, .707],            // the Cut's NE sidewalk under the flatiron / pachinko (the owner's screenshot)
  'cut-mid': [38, 30, .707, .707],
  'cut-across': [42, 34, .707, -.707],
  'boulevard-east-n': [34, -8.6, 1, 0],       // the Boulevard's north sidewalk under the luxury tower
  'boulevard-east-s': [40, 2, 1, 0],
  'uptown-plaza': [46, -24, 0, 1],
  crossroads: [6, 4, 1, 0],
  'crossroads-diag': [2, 8, .7, -.7],
  'stacks-courtyard': [-42, -26, 1, 0],
  'velvet-row': [-42, 44, 1, 0],
  'night-market': [-13, -44, 1, 0],
  'back-alley': [-13, -22.7, 0, 1],
  'metro-plaza': [26, 40, 1, 0],
  club: [-55, 46, 1, 0],
  hotel: [17, -40, 0, 1],
  'charging-lot': [-14, 44, 1, 0],
};
const extra = JSON.parse(process.env.WALKS || '{}'); Object.assign(WALKS, extra);
const spots = spotArg === 'all' ? Object.keys(WALKS) : spotArg.split(',');
mkdirSync(outdir, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: W, height: H } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(q => localStorage.setItem('deadstab-settings', JSON.stringify({ quality: q, qualityAuto: false })), preset);
await p.goto(`http://127.0.0.1:${PORT}/?play=1&weapon=static&map=lumen&capture=thumbnail`);
await p.waitForFunction(() => document.body.classList.contains('playing') && window.__capture, null, { timeout: 900000 });
await p.waitForTimeout(3000);
await p.addScriptTag({ content: readFileSync(new URL('./flicker-page.js', import.meta.url), 'utf8') });
await p.evaluate(o => window.__flickSetup(o), { width: W, height: H, ghost: true, threshold: +(process.env.THR || 48), freezeShadow: !!process.env.FREEZESHADOW });
const summary = {};
for (const spot of spots) {
  const [x0, z0, dx, dz] = WALKS[spot];
  // Settle: a few frames at the start (camera cut, shadows, the cut's fades).
  const res = await p.evaluate(async ({ x0, z0, dx, dz, FRAMES, STEP, SPEED, CLOCK, spot, saveAll }) => {
    const F = window.__flick, T = 100;
    window.__capture.view.cityCamera = undefined; for (let i = 0; i < 10; i++) F.frame(x0, z0, T, CLOCK); F.settled = true;
    let prev = F.frame(x0, z0, T, CLOCK), total = 0, pairs = [], agg = new Map();
    const shots = [];
    for (let k = 1; k <= FRAMES; k++) {
      const s = k * STEP * SPEED, cur = F.frame(x0 + dx * s, z0 + dz * s, T, CLOCK);
      const { mask, n } = F.compare(prev, cur); total += n; pairs.push(n);
      const cl = F.clusters(mask, 3);
      for (const c of cl.slice(0, 12)) {
        const px = Math.round(c.x), py = Math.round(c.y);
        // probe the cluster's own pixels (the centroid may fall between)
        const k0 = c.pts[(c.pts.length / 2) | 0], pr = F.probe(cur, k0 % F.W, (k0 / F.W) | 0);
        const key = (pr?.hits?.length ? pr.hits.slice(0, 2).map(h => h.name.replace(/<Scene$/, '').replace(/<Group/g, '')).join(' | ') : 'none') + ' @' + (pr ? pr.at.map(v => Math.round(v * 2) / 2).join(',') : '?');
        const e = agg.get(key) || { key, px: 0, clusters: 0, sample: pr, where: [px, py, k] }; e.px += c.n; e.clusters++; agg.set(key, e);
      }
      if (saveAll || k === 1 || n > 30) shots.push({ k, n, a: await F.png(prev), b: await F.png(cur), m: await F.png(cur, mask) });
      prev = cur;
    }
    return { total, pairs, agg: [...agg.values()].sort((p, q) => q.px - p.px), shots: shots.slice(0, 6) };
  }, { x0, z0, dx, dz, FRAMES, STEP, SPEED, CLOCK, spot, saveAll: !!process.env.SAVEALL });
  summary[spot] = { total: res.total, pairs: res.pairs, top: res.agg.slice(0, 15) };
  for (const s of res.shots) for (const t of ['a', 'b', 'm']) writeFileSync(`${outdir}/${spot}-${String(s.k).padStart(2, '0')}-${t}.png`, Buffer.from(s[t].split(',')[1], 'base64'));
  console.log(`${preset} ${spot}: ${res.total} px over ${FRAMES} pairs (max ${Math.max(...res.pairs)})`);
  for (const e of res.agg.slice(0, 10)) console.log(`   ${e.px}px/${e.clusters}cl  ${e.key}  @${e.where}  ${JSON.stringify(e.sample?.hits?.slice(0, 3).map(h => [h.d, h.inst, h.mat, h.po, h.face]))} at ${e.sample?.at}`);
}
writeFileSync(`${outdir}/summary-${preset}.json`, JSON.stringify(summary, null, 1));
if (errs.length) console.log('errors', errs.slice(0, 5));
await b.close();
