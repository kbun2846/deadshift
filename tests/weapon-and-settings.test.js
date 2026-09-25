import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, RULES, damagePerOrb, explosionFor, splashFalloff } from '../src/simulation.js';
import { VOLLEY_BOOST } from '../src/config/gameplay.js';
import { deadwater } from '../src/maps.js';
import { GRAPHICS, RenderBudget, validateSettings, DEFAULT_SETTINGS } from '../src/settings.js';

const empty = () => ({ width: 100, depth: 100, spawn: { x: 0, z: 0 }, buildings: [], props: [], fences: [], targets: [] });
const command = extra => ({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, ...extra });
const step = (sim, n, extra) => { for (let i = 0; i < n; i++) sim.step(command(extra)); };
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, a + ' ~= ' + b);

test('orbs surrounding a point meet exactly there and never form a separate projectile', () => {
  const sim = new Simulation(empty());
  for (let i = 0; i < 8; i++) {
    sim.seed(); const s = sim.shots.at(-1); s.x = Math.cos(i * Math.PI / 4) * (2 + i); s.z = Math.sin(i * Math.PI / 4) * (2 + i);
  }
  const originalIds = sim.shots.map(s => s.id);
  sim.launch(0, 0);
  const longest = sim.shots[0].travelDuration;
  for (const s of sim.shots) { close(s.x + s.vx * longest, 0); close(s.z + s.vz * longest, 0); }
  // Moving the aim afterwards must not redirect the captured shot.
  step(sim, 80, { aimPointX: 30, aimPointZ: 30 });
  assert.equal(sim.shots.length, 0); assert.equal(sim.serial, 8);
  const ends = sim.events.filter(e => e.type === 'trailEnd'); assert.equal(ends.length, 8);
  for (const end of ends) { close(end.x, 0); close(end.z, 0); assert.ok(originalIds.includes(end.id)); }
  assert.ok(!sim.events.some(e => e.type === 'fuse'));
});

test('orbs hit the same selected point inside a target', () => {
  const map = empty(); map.targets = [{ id: 'a', x: 4, z: 2 }];
  const sim = new Simulation(map);
  for (let i = 0; i < 4; i++) { sim.seed(); sim.shots.at(-1).z = i - 2; }
  sim.launch(4.1, 2.1); step(sim, 60);
  const ends = sim.events.filter(e => e.type === 'trailEnd');
  assert.equal(ends.length, 4);
  // They still meet at one point; that point now sits an overshoot past the aim.
  const reach = Math.hypot(4.1, 2.1), overshoot = RULES.launchOvershoot;
  const meetX = 4.1 + 4.1 / reach * overshoot, meetZ = 2.1 + 2.1 / reach * overshoot;
  for (const end of ends) { close(end.x, meetX); close(end.z, meetZ); }
  // Splash is measured to the target's edge: the blast is inside it, full strength.
  const splash = Math.round(explosionFor(4).damage * splashFalloff(0, explosionFor(4).radius, 4));
  close(sim.targets[0].hp, RULES.targetHealth - 4 * damagePerOrb(4) - splash);
});

test('one orb launches immediately and deals less damage per orb than a full volley', () => {
  const sim = new Simulation(empty()); sim.seed(); sim.launch(10, 0);
  assert.equal(sim.shots.length, 1); assert.equal(sim.shots[0].damage, damagePerOrb(1));
  close(12 * damagePerOrb(12)+explosionFor(12).damage,345*VOLLEY_BOOST);
  assert.equal(sim.ammo, 11);
});

test('active seeds reserve the supply, so waiting before launch cannot bank a second full volley', () => {
  const sim = new Simulation(empty()); step(sim, 120, { seed: true }); step(sim, 300);
  assert.equal(sim.seeds.length, 12); assert.equal(sim.ammo, 0);
  sim.launch(15, 0); step(sim, 60);
  assert.equal(sim.ammo, 0);
  step(sim, 30); assert.equal(sim.ammo, 1);
  step(sim, 500); assert.equal(sim.ammo, 12);
});

test('small volleys leave reserve ammunition immediately available', () => {
  const sim = new Simulation(empty()); sim.seed(); sim.seed(); sim.launch(10, 0);
  assert.equal(sim.ammo, 10);
  step(sim, 10, { seed: true }); assert.equal(sim.seeds.length, 1); assert.equal(sim.ammo, 9);
});

test('ammo never exceeds capacity while seeding, launching, expiring and refilling', () => {
  const sim = new Simulation(empty());
  for (let i = 0; i < 1800; i++) {
    sim.step(command({ seed: i % 300 < 180, launch: i % 191 === 0, aimPointX: 15, aimPointZ: 0 }));
    assert.ok(sim.ammo >= 0 && sim.ammo + sim.seeds.length <= RULES.maxSeeds);
  }
});

test('brushing the long range fence never teleports the player along it', () => {
  const sim = new Simulation(deadwater); sim.player.x = 10; sim.player.z = 19 - .12 - RULES.radius + 1e-9;
  for (let i = 0; i < 360; i++) {
    const x = sim.player.x, z = sim.player.z;
    sim.step(command({ moveX: i % 60 < 30 ? 1 : -1, moveZ: 1 }));
    assert.ok(Math.hypot(sim.player.x - x, sim.player.z - z) < .14, 'collision must only make a local correction');
    assert.ok(sim.player.z < 18.501, 'player stays north of the fence');
  }
});

test('fence corners allow sliding without crossing or long-distance correction', () => {
  const map = empty(); map.fences = [{ x: 0, z: 3, length: 16, axis: 'x' }];
  const sim = new Simulation(map); sim.player.x = 7.5; sim.player.z = 2.1;
  for (let i = 0; i < 150; i++) {
    const x = sim.player.x, z = sim.player.z; sim.step(command({ moveX: 1, moveZ: 1 }));
    assert.ok(Math.hypot(sim.player.x - x, sim.player.z - z) <= RULES.speed / 60 + .001);
  }
  assert.ok(sim.player.x > 8.5 && sim.player.z > 3);
});

test('render caps produce the requested frame count independently of simulation ticks', () => {
  for (const source of [60, 120, 144]) for (const cap of [1, 30, 45, 60, 90, 120, 0]) {
    const budget = new RenderBudget(cap); let renders = 0, elapsed = 0;
    for (let i = 0; i < source * 10; i++) { const dt = budget.tick(1 / source); if (dt) { renders++; elapsed += dt; } }
    assert.ok(Math.abs(renders - Math.min(source, cap || source) * 10) <= 1, source + '/' + cap + ': ' + renders);
    close(elapsed, 10, .04);
  }
});

test('graphics tiers change resolution, shadow work, texture detail and effect budgets', () => {
  assert.equal(validateSettings({controlHints:false}).controlHints,false);
  assert.deepEqual(validateSettings({quality:'potato',fps:1}),{quality:'potato',fps:1,motion:true,controlHints:true,mobileOpacity:.4,aimAssist:true,fullscreen:true,keyLock:true,vibration:true,volume:{...DEFAULT_SETTINGS.volume}});
  assert.equal(validateSettings({aimAssist:false}).aimAssist,false,'aim assist can be turned off');
  assert.ok(GRAPHICS.potato.scale < GRAPHICS.performance.scale);
  assert.equal(GRAPHICS.potato.motes, 0);
  assert.ok(GRAPHICS.potato.particleCap < GRAPHICS.performance.particleCap);
  assert.ok(GRAPHICS.performance.scale < GRAPHICS.balanced.scale);
  assert.equal(GRAPHICS.potato.shadows, 0);
  assert.ok(GRAPHICS.performance.shadows > 0 && GRAPHICS.performance.shadows < GRAPHICS.balanced.shadows);
  assert.ok(GRAPHICS.quality.shadows > GRAPHICS.balanced.shadows);
  // Multisampling is a context flag chosen once, so the lower tiers spend the
  // same budget on render scale instead.
  assert.equal(GRAPHICS.potato.antialias, false);
  assert.equal(GRAPHICS.performance.antialias, false);
  assert.ok(GRAPHICS.balanced.antialias && GRAPHICS.quality.antialias);
  assert.ok(GRAPHICS.performance.texture < GRAPHICS.balanced.texture && GRAPHICS.balanced.texture < GRAPHICS.quality.texture);
  assert.ok(GRAPHICS.performance.particleCap < GRAPHICS.quality.particleCap);
  assert.deepEqual(validateSettings({ quality: 'invalid', fps: 999, motion: false }), { quality: 'balanced', fps: 60, motion: false, controlHints: true, mobileOpacity: .4, aimAssist: true, fullscreen: true, keyLock: true, vibration: true, volume: {...DEFAULT_SETTINGS.volume} });
});

test('mobile opacity accepts saved presets and rejects invalid values',()=>{
 for(const opacity of [1,.7,.4])assert.equal(validateSettings({mobileOpacity:opacity}).mobileOpacity,opacity);
 for(const opacity of [null,0,-1,2,'invalid'])assert.equal(validateSettings({mobileOpacity:opacity}).mobileOpacity,.4);
});

test('first launch defaults to Performance on mobile and Balanced on PC, preserving saved choices',()=>{
 assert.equal(validateSettings({}, {mobile:true}).quality,'performance');
 assert.equal(validateSettings({}, {mobile:false}).quality,'balanced');
 assert.equal(validateSettings(null, {mobile:true}).quality,'performance');
 assert.equal(validateSettings({quality:'invalid'}, {mobile:true}).quality,'performance');
 for(const quality of Object.keys(GRAPHICS))for(const mobile of [true,false]){
  assert.equal(validateSettings({quality}, {mobile}).quality,quality);
 }
});

test('full screen while playing is a saved choice, on unless turned off', () => {
 assert.equal(validateSettings({}).fullscreen, true);
 assert.equal(validateSettings({ fullscreen: false }).fullscreen, false);
 assert.equal(validateSettings({ fullscreen: 'yes' }).fullscreen, true);
});

test('the phone page is set up as a game, not a document', async () => {
 const { readFileSync } = await import('node:fs');
 const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8'), css = readFileSync(new URL('../src/styles/menu-theme.css', import.meta.url), 'utf8');
 assert.match(html, /user-scalable=no/); assert.match(html, /rel="manifest"/); assert.match(html, /apple-mobile-web-app-capable/);
 const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
 assert.equal(manifest.display, 'fullscreen');
 assert.match(css, /#game\{position:fixed!important;inset:0/); assert.match(css, /overscroll-behavior:none/);
 const { viewWidth, viewHeight } = await import('../src/viewport.js');
 assert.ok(viewWidth() >= 1 && viewHeight() >= 1, 'falls back outside a page');
});
