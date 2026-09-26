// Headless smoke check: plays a few seconds on each graphics preset (moving,
// shooting, secondary, dash, abilities, then three robots, an ally and an enemy-team robot) and prints any page errors or console
// errors/warnings, plus the JS heap. Run with the dev server up:
//   node tools/smoke.mjs                  the usual mix of presets and maps
//   node tools/smoke.mjs --map hill-test  that map on all five presets
//   node tools/smoke.mjs --walk [--map hill-test] [--spot plateau]
// Walk mode (terrain maps): holds movement keys along a square and a diagonal
// from the map's walk spot (or --spot; tools/terrain-spots.mjs), switching through
// all five presets as it goes, and fails on a page or console error, a NaN
// position, the player drawn below the ground, or a leg where they did not
// move (stuck). --port picks the dev server (5173).
// Expect every "errs" list to be empty. Uses SwiftShader, so it says nothing
// about frame rate on a real GPU.
import { chromium } from 'playwright';
import { parseArgs, resolveSpot, judgeWalk, PRESETS, SPOTS } from './terrain-spots.mjs';
// (A loaded machine loads slowly: SMOKE_TIMEOUT seconds, default 240.)
const LOAD_TIMEOUT = (+process.env.SMOKE_TIMEOUT || 240) * 1000;
const { flags } = parseArgs(process.argv.slice(2));
const port = flags.port || process.env.PORT || 5173, base = `http://127.0.0.1:${port}`;
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const out=[];
if (flags.walk) { await walk(flags.map || 'hill-test'); process.exit(process.exitCode); }
// (Test Hill: the hills system, on the lowest and highest presets.)
const WEAPONS = ['static', 'rifle', 'shotgun'];
const runs = flags.map ? PRESETS.map((q, i) => [q, WEAPONS[i % 3], flags.map]) : [['balanced','static','deadwater'],['extreme','rifle','deadwater'],['performance','shotgun','deadwater'],['potato','rifle','tutorial'],['quality','static','deadwater'],['potato','shotgun','hill-test'],['extreme','static','hill-test']];
for (const [q,w,map] of runs) {
 const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
 const errs=[]; p.on('pageerror',e=>errs.push('PE '+e.message)); p.on('console',m=>{if(['error','warning'].includes(m.type()))errs.push(m.type()+' '+m.text().slice(0,160))});
 await p.addInitScript(q=>localStorage.setItem('deadshift-settings',JSON.stringify({quality:q})),q);
 await p.goto(`${base}/?play=1&weapon=${w}&map=${map}&capture=thumbnail`);
 await p.waitForFunction(()=>document.body.classList.contains('playing'),null,{timeout:LOAD_TIMEOUT});
 // shoot/move a bit
 await p.keyboard.down('KeyW'); await p.keyboard.down('Space'); await p.waitForTimeout(2500); await p.keyboard.up('Space'); await p.keyboard.up('KeyW');
 await p.keyboard.press('KeyE'); await p.waitForTimeout(2500);
 await p.keyboard.press('KeyQ'); await p.keyboard.press('KeyX'); await p.keyboard.press('KeyC'); await p.waitForTimeout(1500);
 // Robots (dev tools): one of each weapon, fighting for a few seconds.
 await p.evaluate(() => { const sim = window.__bots && document.querySelector('#world') && window.__capture?.sim; if (!sim) return; for (const w of ['rifle', 'shotgun', 'static']) window.__bots.spawn(sim, w); window.__bots.spawn(sim, 'rifle', { team: 'blue' }); window.__bots.spawn(sim, 'static', { team: 'red' }); });
 await p.waitForTimeout(3000);
 const heap=await p.evaluate(()=>performance.memory?.usedJSHeapSize/1e6|0);
 out.push({q,w,map,heap,errs:[...new Set(errs)].slice(0,8)});
 await p.close();
}
console.log(JSON.stringify(out,null,1)); await b.close();
process.exitCode = out.some(o => o.errs.length) ? 1 : 0;

// Walk mode: one page, a scripted route, every preset along the way.
async function walk(map) {
 // Start from the map's "walk" (or "start") spot: practice spawns at random,
 // and the route must stay clear of props and walls.
 const spot = resolveSpot(map, flags.spot ?? ['walk', 'start'].find(k => SPOTS[map]?.[k]) ?? null);
 const p = await b.newPage({ viewport: { width: 640, height: 400 } });
 const errs = [], warns = [];
 p.on('pageerror', e => errs.push('PE ' + e.message));
 p.on('console', m => { if (m.type() === 'error') errs.push('error ' + m.text().slice(0, 160)); else if (m.type() === 'warning') warns.push(m.text().slice(0, 160)); });
 await p.addInitScript(q => localStorage.setItem('deadshift-settings', JSON.stringify({ quality: q })), PRESETS[0]);
 await p.goto(`${base}/?play=1&weapon=static&map=${map}&capture=thumbnail`);
 await p.waitForFunction(() => document.body.classList.contains('playing') && window.__capture, null, { timeout: LOAD_TIMEOUT });
 if (spot) await p.evaluate(s => { const { sim, view } = window.__capture; Object.assign(sim.player, { x: s.x, z: s.z, vx: 0, vz: 0 }); view.cameraCut = true; }, spot);
 // Sample every frame: where the sim has you, where the view draws you, the ground there.
 await p.evaluate(() => {
  const { sim, view } = window.__capture, t0 = performance.now(), rec = window.__walk = [];
  const tick = () => { const pl = sim.player, y = view.player?.position.y;
   rec.push({ t: Math.round(performance.now() - t0), x: pl.x, z: pl.z, y: y ?? 0, ground: sim.ground.heightAt(pl.x, pl.z) });
   requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
 });
 const pos = () => p.evaluate(() => { const pl = window.__capture.sim.player; return { x: pl.x, z: pl.z }; });
 const preset = q => p.evaluate(q => { const s = document.getElementById('graphics-preset'); s.value = q; s.dispatchEvent(new Event('change')); }, q);
 // Legs are timed in game seconds, not wall seconds: SwiftShader can take
 // seconds per frame (longer right after a preset change), so a wall-clock
 // hold would read as "stuck" on a slow box.
 const hold = +(flags.hold || 1.2), legs = [], shown = [PRESETS[0]];
 const simTime = () => p.evaluate(() => window.__capture.sim.time);
 const waitSim = async dt => { const t = await simTime(); await p.waitForFunction(([t, dt]) => window.__capture.sim.time >= t + dt, [t, dt], { timeout: 120000, polling: 50 }); };
 const route = [['north', ['KeyW']], ['east', ['KeyD']], ['south', ['KeyS']], ['west', ['KeyA']], ['diagonal NW', ['KeyW', 'KeyA']], ['diagonal SE', ['KeyS', 'KeyD']]];
 await waitSim(.5);
 for (const [i, [name, keys]] of route.entries()) {
  // A new preset at the start of each leg after the first, until all five have run.
  if (i > 0 && i < PRESETS.length) { await preset(PRESETS[i]); shown.push(PRESETS[i]); await waitSim(.3); }
  const from = await pos();
  for (const k of keys) await p.keyboard.down(k);
  await waitSim(hold);
  for (const k of keys) await p.keyboard.up(k);
  await waitSim(.3);
  legs.push({ name, from, to: await pos() });
 }
 const samples = await p.evaluate(() => window.__walk);
 const quality = await p.evaluate(() => window.__capture.view.qualityName);
 const problems = [...new Set(errs)].slice(0, 8).concat(judgeWalk(samples, legs));
 const r = samples.map(s => s.y - s.ground).filter(Number.isFinite);
 const summary = { mode: 'walk', map, simSeconds: +(await simTime()).toFixed(2), spot: spot?.name ?? 'spawn', presets: shown, endPreset: quality, frames: samples.length,
  legs: legs.map(l => ({ name: l.name, from: [+l.from.x.toFixed(1), +l.from.z.toFixed(1)], to: [+l.to.x.toFixed(1), +l.to.z.toFixed(1)], moved: +Math.hypot(l.to.x - l.from.x, l.to.z - l.from.z).toFixed(2) })),
  heightAboveGround: { min: +Math.min(...r).toFixed(3), max: +Math.max(...r).toFixed(3) },
  end: legs.at(-1)?.to, warnings: [...new Set(warns)].slice(0, 5), problems, ok: problems.length === 0 };
 console.log(JSON.stringify(summary, null, 1));
 await b.close();
 process.exitCode = summary.ok ? 0 : 1;
}
