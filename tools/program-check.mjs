// Missed shader warm-ups: loads a preset, then plays the costly moments (two
// Static X presses, orb blasts) and lists every shader program linked after
// load, with the object that needed it. Each one is a hitch a player feels
// (tens of ms on Windows' D3D compiler). Expect none. Dev server up, then:
//   node tools/program-check.mjs [quality=extreme] [weapon=static] [map=deadwater] [port=5173]
// On a map with hills it also walks the player through the map's named
// spots (tools/terrain-spots.mjs) and into its stream, and breaks a few props.
import { chromium } from 'playwright';
const [q = 'extreme', w = 'static', map = 'deadwater', port = '5173'] = process.argv.slice(2);
const { SPOTS } = await import('./terrain-spots.mjs');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 640, height: 400 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(q => localStorage.setItem('deadshift-settings', JSON.stringify({ quality: q })), q);
await p.goto(`http://127.0.0.1:${port}/?play=1&weapon=${w}&map=${map}&capture=thumbnail`);
await p.waitForFunction(() => document.body.classList.contains('playing') && window.__capture, null, { timeout: 90000 });
await p.waitForTimeout(q === 'extreme' ? 8000 : 3000); // Extreme's passes load late
await p.evaluate(() => {
  const r = window.__capture.view.renderer, link = WebGL2RenderingContext.prototype.linkProgram, draw = r.renderBufferDirect;
  window.__linked = []; let pending = false;
  WebGL2RenderingContext.prototype.linkProgram = function (...a) { pending = true; return link.apply(this, a); };
  r.renderBufferDirect = function (camera, scene, geometry, material, object) {
    const out = draw.apply(this, arguments);
    if (pending) { pending = false; let o = object, chain = []; while (o) { chain.push(o.type + (o.name ? ':' + o.name : '')); o = o.parent; }
      window.__linked.push(`${material.type} on ${chain.join(' < ')} (${Object.keys(geometry.attributes).join('/')}${object.isInstancedMesh ? ', instanced' : ''})`); }
    return out;
  };
});
const blast = dx => p.evaluate(dx => { const { view, sim } = window.__capture; view.explosion({ type: 'explosion', x: sim.player.x + dx, z: sim.player.z, radius: 3, count: 10 }); }, dx);
await blast(3); await p.waitForTimeout(500);
await p.keyboard.press('KeyX'); await p.waitForTimeout(2500); await p.keyboard.press('KeyX'); await p.waitForTimeout(2500);
await blast(-3); await p.waitForTimeout(1500);
// Hills: every named spot, the stream (wading, a splash, drips on the way
// out) and a few broken props.
for (const spot of Object.values(SPOTS[map] || {})) {
  await p.evaluate(s => { const { sim, view } = window.__capture; Object.assign(sim.player, { x: s.x, z: s.z, vx: 0, vz: 0 }); view.cameraCut = true; }, spot);
  await p.waitForTimeout(1500);
}
const water = await p.evaluate(() => { const { sim, map } = window.__capture, g = sim.ground, w = map.terrain?.water?.[0]; if (!w) return null; for (const [x, z] of w.points) if (g.waterDepthAt?.(x, z) > .15) return { x, z }; return null; });
if (water) {
  await p.evaluate(s => { const { sim, view } = window.__capture; Object.assign(sim.player, { x: s.x, z: s.z, vx: 0, vz: 0 }); view.cameraCut = true; view.event?.({ type: 'rifleImpact', x: s.x + 1, z: s.z, stopped: true }); }, water);
  await p.keyboard.down('KeyW'); await p.waitForTimeout(2500); await p.keyboard.up('KeyW'); await p.waitForTimeout(2500);
}
await p.evaluate(() => { const { sim } = window.__capture; let n = 0; for (const prop of sim.props || []) if (prop.hp > 0 && n < 12 && Math.hypot(prop.x - sim.player.x, prop.z - sim.player.z) < 60) { sim.hitProp(prop, { damage: 99, x: prop.x, z: prop.z, vx: 1, vz: 0 }); n++; } });
await p.waitForTimeout(2000);
const linked = await p.evaluate(() => window.__linked);
console.log(`${q}/${w}: ${linked.length} program(s) linked during play`); for (const l of linked) console.log('  ' + l);
if (errs.length) console.log('errors', errs);
await b.close(); process.exitCode = linked.length ? 1 : 0;
