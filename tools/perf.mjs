// Headless frame-cost probe: plays a scripted run on a preset and reports the
// main-thread cost of each frame (simulation + view.update + draw), split by
// phase, with p50/p95/max, plus draw calls, triangles and shader programs.
// SwiftShader draws on the CPU in another process, so this measures
// JavaScript and command submission, not GPU time; use it to compare
// before/after on the same machine. Dev server up, then:
//   node tools/perf.mjs [quality=extreme] [weapon=static] [map=deadwater] [x z]
//   node tools/perf.mjs --map hill-test --spot plateau --preset all
// --preset takes one preset, a comma list or "all"; --spot a named spot
// (tools/terrain-spots.mjs) or "x,z"; --port the dev server (5173); --weapon.
// With a spot the run starts there (a map's widest or densest view: on a map
// with hills, a summit looking into the hollow). The idle phase is spent
// standing on the spot, so its draw calls and triangles are the spot's.
import { chromium } from 'playwright';
import { parseArgs, resolveSpot, PRESETS } from './terrain-spots.mjs';
const { flags, rest } = parseArgs(process.argv.slice(2));
const [pq = 'extreme', pw = 'static', pmap = 'deadwater', sx, sz] = rest;
const mapId = flags.map || pmap, w = flags.weapon || pw, port = flags.port || process.env.PORT || 5173;
const qs = flags.preset === 'all' ? PRESETS : String(flags.preset || pq).split(',');
const spot = resolveSpot(mapId, flags.spot ?? (sx !== undefined ? `${sx},${sz}` : null));
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const summary = [];
for (const q of qs) {
const p = await b.newPage({ viewport: { width: +(process.env.W || 400), height: +(process.env.H || 250) } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(q => localStorage.setItem('deadshift-settings', JSON.stringify({ quality: q })), q);
await p.goto(`http://127.0.0.1:${port}/?play=1&weapon=${w}&map=${mapId}&capture=thumbnail`);
await p.waitForFunction(() => document.body.classList.contains('playing') && window.__capture, null, { timeout: 90000 });
// Teleport: the dev-only window.__capture handle (sim + view), then a camera cut.
if (spot) await p.evaluate(s => {
 const { sim, view } = window.__capture, pl = sim.player;
 Object.assign(pl, { x: s.x, z: s.z, vx: 0, vz: 0 });
 if (s.look) { const dx = s.look.x - s.x, dz = s.look.z - s.z, l = Math.hypot(dx, dz) || 1; pl.aimX = dx / l; pl.aimZ = dz / l; }
 view.cameraCut = true;
}, spot);
console.error('ready');
await p.evaluate(() => {
  const { view } = window.__capture, rec = window.__rec = { phase: 'idle', rows: [] };
  const wrap = (o, k, tag) => { const f = o[k].bind(o); o[k] = (...a) => { const t = performance.now(); const r = f(...a); rec.cur[tag] = (rec.cur[tag] || 0) + performance.now() - t; return r; }; };
  rec.cur = {};
  wrap(view, 'update', 'update'); wrap(view, 'drawFrame', 'draw');
  // Draw calls and triangles for the whole frame: every pass (shadow maps,
  // the scene, Extreme's post passes), not just the last render() call.
  const df = view.drawFrame; view.drawFrame = (...a) => {
   const info = view.renderer.info, keep = info.autoReset; info.reset(); info.autoReset = false;
   try { return df(...a); } finally { rec.cur.calls = info.render.calls; rec.cur.tris = info.render.triangles; info.autoReset = keep; }
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(t => { rec.cur = {}; const s = performance.now(); cb(t); rec.rows.push({ phase: rec.phase, total: performance.now() - s, ...rec.cur }); });
});
const cdp = process.env.PROFILE ? await p.context().newCDPSession(p) : null;
if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
const phase = n => (console.error(n), p.evaluate(n => { window.__rec.phase = n; }, n));
await p.waitForTimeout(2000);
await phase('idle'); await p.waitForTimeout(3000);
await phase('move+fire'); await p.keyboard.down('KeyW'); await p.keyboard.down('Space'); await p.waitForTimeout(3000); await p.keyboard.up('Space'); await p.keyboard.up('KeyW');
await phase('x-first'); await p.keyboard.press('KeyX'); await p.waitForTimeout(2500);
await phase('x-second'); await p.keyboard.press('KeyX'); await p.waitForTimeout(3000);
await phase('after'); await p.waitForTimeout(2000);
const rows = await p.evaluate(() => window.__rec.rows);
const programs = await p.evaluate(() => window.__capture.view.renderer.info.programs?.length ?? null);
if (cdp) {
  // Self time by function, top 30 (PROFILE=1).
  const { profile } = await cdp.send('Profiler.stop'), self = new Map(), dt = new Map();
  profile.samples.forEach((id, i) => dt.set(id, (dt.get(id) || 0) + (profile.timeDeltas[i] || 0)));
  let all = 0;
  for (const n of profile.nodes) { const t = dt.get(n.id) || 0; if (['(idle)', '(program)', '(garbage collector)'].includes(n.callFrame.functionName) && n.callFrame.functionName !== '(garbage collector)') continue; all += t; const f = n.callFrame, k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + t); }
  // Inclusive time of the game's own functions (not three.js internals).
  const byId = new Map(profile.nodes.map(n => [n.id, n])), incl = new Map();
  const total = n => { let t = dt.get(n.id) || 0; for (const c of n.children || []) t += total(byId.get(c)); n.total = t; return t; };
  total(profile.nodes[0]);
  for (const n of profile.nodes) { const f = n.callFrame; if (!f.url.includes('/src/')) continue; const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop().split('?')[0]}:${f.lineNumber + 1}`; incl.set(k, (incl.get(k) || 0) + n.total); }
  console.log('--- inclusive (game code)\n' + [...incl].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, t]) => `${(t / all * 100).toFixed(1).padStart(5)}% ${k}`).join('\n'));
  console.log('--- self');
  console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 45).map(([k, t]) => `${(t / all * 100).toFixed(1).padStart(5)}% ${k}`).join('\n'));
}
const stat = (a) => { a = a.slice().sort((x, y) => x - y); const at = f => a[Math.min(a.length - 1, Math.floor(a.length * f))] ?? 0; return `p50 ${at(.5).toFixed(1)} p95 ${at(.95).toFixed(1)} max ${(a.at(-1) ?? 0).toFixed(1)}`; };
for (const ph of ['idle', 'move+fire', 'x-first', 'x-second', 'after']) {
  const r = rows.filter(x => x.phase === ph);
  console.log(`${q.padEnd(11)} ${ph.padEnd(9)} n=${String(r.length).padStart(3)} total ${stat(r.map(x => x.total))} | update ${stat(r.map(x => x.update || 0))} | draw ${stat(r.map(x => x.draw || 0))}`);
}
const med = a => { a = a.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
// Only frames that drew count (the loop also runs frames it skips); the spot's
// numbers come from the idle phase, or every drawn frame when it had none
// (Extreme under SwiftShader can take seconds per frame).
const drawn = rows.filter(x => x.calls !== undefined), atSpot = drawn.filter(x => x.phase === 'idle'), idle = atSpot.length ? atSpot : drawn, all = drawn.map(x => x.total);
const one = { map: mapId, spot: spot?.name ?? 'spawn', preset: q, weapon: w, drawCalls: med(idle.map(x => x.calls)), triangles: med(idle.map(x => x.tris)), frameMs: +(med(all) ?? 0).toFixed(1), idleFrameMs: +(med(idle.map(x => x.total)) ?? 0).toFixed(1), programs, frames: drawn.length, spotFrames: atSpot.length, errors: errs.slice(0, 5) };
console.log(JSON.stringify(one)); summary.push(one);
await p.close();
}
if (summary.length > 1) console.table(summary.map(({ errors, ...r }) => ({ ...r, errors: errors.length })));
await b.close();
process.exitCode = summary.some(r => r.errors.length) ? 1 : 0;
