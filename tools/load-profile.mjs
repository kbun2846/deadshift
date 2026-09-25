// Where load time goes: plays into a game with the CPU slowed (a weak laptop
// or phone) and prints the heaviest functions by self time during load, and
// the total until the first playable frame. Dev server up.
//   node tools/load-profile.mjs [quality=performance] [cpuSlowdown=4]
import { chromium } from 'playwright';
const q = process.argv[2] || 'performance', slow = +(process.argv[3] || 4);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
await p.addInitScript(q => localStorage.setItem('deadshift-settings', JSON.stringify({ quality: q })), q);
const cdp = await p.context().newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start');
const t0 = Date.now();
await p.goto('http://127.0.0.1:5173/?play=1&weapon=rifle&map=deadwater&autostart=1');
await p.waitForFunction(() => document.body.classList.contains('playing'), null, { timeout: 180000 });
const total = Date.now() - t0;
const { profile } = await cdp.send('Profiler.stop');
const byId = new Map(profile.nodes.map(n => [n.id, n])), self = new Map(), parent = new Map();
for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const inclusive = new Map();
profile.samples.forEach((id, i) => {
 const dt = profile.timeDeltas[i] || 0, n = byId.get(id), k = f => `${f.callFrame.functionName || '(anon)'} ${f.callFrame.url.split('/').pop().split('?')[0]}:${f.callFrame.lineNumber + 1}`;
 self.set(k(n), (self.get(k(n)) || 0) + dt);
 const seen = new Set(); for (let cur = id; cur != null; cur = parent.get(cur)) { const key = k(byId.get(cur)); if (seen.has(key)) continue; seen.add(key); inclusive.set(key, (inclusive.get(key) || 0) + dt); }
});
const top = (m, n) => [...m].filter(([k]) => !k.startsWith('(')).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`).join('\n');
console.log(`load to playable: ${total} ms (${q}, CPU x${slow})`);
console.log('--- self time\n' + top(self, 20));
console.log('--- inclusive (our code)\n' + top(new Map([...inclusive].filter(([k]) => /\.js:/.test(k) && !/chunk-|three/.test(k))), 30));
await b.close();
