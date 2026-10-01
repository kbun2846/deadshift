// Lumen's contrast rule, measured on screen (lumen-design.md section 15):
// "measured on screen after light, haze, wetness and grade, in white, blue,
// lemon, green, pink and red pools and in shade, dry and wet. Blood and the
// team colours CIEDE2000 >= 15 against every ground, player coats >= 8."
//
// It loads the map headless (SwiftShader) on each preset, lays small flat
// swatches (blood, the three team colours lit as hats and unlit as rings, the
// six coats: tools/contrast-lib.mjs SWATCHES) on the ground, screenshots it,
// and compares each swatch's rendered colour with the rendered ground round
// it. Everything between the light and the pixel is the game's own: the look,
// the wet-ground material, the rain clock's wetness, fog, tone mapping, the
// preset's mirror and post passes. The browser half is tools/contrast-stage.mjs
// (Vite serves it into the running game; it needs the dev server).
//
//   lab   (default) the world is hidden; the ground's texture is painted with
//         one ground colour at a time and a row of test light pools (bare,
//         white, blue, lemon, green, pink, red, sodium), each with the whole
//         swatch set on it, on the map's biggest open rectangle. Rows: ground
//         x pool x clock x moon/shade. The pools are painted with the map's
//         own tints and blend (--tints map), the design's table (design) or
//         the tints the rule needs (recommended: tools/contrast-lib.mjs POOLS,
//         normal blend at full strength). Use it to tune a look or a palette.
//   real  (--spots) nothing is hidden: the swatches lie on the nearest clear
//         patch of open ground to each named spot (a spot in tools/terrain-
//         spots.mjs, or x,z), on the real ground, lamps, pools, signs and
//         reflections, in the real frame. Swatches hidden behind something are
//         left out (the runner tries other patches until all 15 can be seen).
//         Judged on the 5th percentile of the ground round each swatch (the
//         ring holds props and walls too). Use it after a stage changes what
//         is on the ground: the light pools, the signs, the mirror, the props.
//
// The weather clock is set for each row: `dry` (ground dry), `wet` (soaked, the
// rain just stopped, no streaks) and `rain` (heavy rain). `sun` is the moon on
// open ground, `shade` the hemisphere only (the moon's intensity set to 0).
//
// Usage (dev server up: the lead's 5791, or your own, --port):
//   node tools/contrast-check.mjs [--port 5806] [--preset all|potato,balanced]
//        [--clock dry,wet] [--light sun,shade] [--grounds base|area|paint|all|id,id]
//        [--pools all|none,white,...] [--tints map|design|recommended|'{"red":"#3b1011"}']
//        [--blend normal|map]   (normal: pools at full strength with normal blending)
//        [--spots all|crossroads,back-alley,x,z]   (real mode)
//        [--look current,baseline|'{"sky":"#c8ccd8",...}'|@file.json]   (other looks: the fields of a
//             map's `look`, plus Extreme's `bloom` { strength, radius, threshold }; several in one page load)
//        [--eval "js run in the page first"]   (try a renderer setting without editing it)
//        [--json out.json] [--png dir] [--verbose] [--no-floor] [--w 1280 --h 720]
// Exit code 1 when any swatch is under its floor (blood and the team colours
// 15, coats 8), any bare ground reads darker on screen than GROUND_FLOOR (#12141a) (Back
// Alley's own grounds 65% of it; --no-floor turns that off), a swatch could not
// be measured, or a preset failed to load. A fail lists the preset, ground,
// pool, clock and light it happened in. One page load takes minutes under
// SwiftShader (Extreme most): give it a quiet machine and few frames.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { maps } from '../src/maps.js';
import { buildingContains } from '../src/map-kit.js';
import { isPlayable } from '../src/playable-area.js';
import { SPOTS, parseArgs } from './terrain-spots.mjs';
import { LUMEN_PROP_TYPES } from '../src/world/lumen-props.js';
import { SWATCHES, POOLS, DESIGN_POOLS, GROUNDS, GROUND_FLOOR, DARK_GROUNDS as DARKS, DARK_FLOOR_SHARE, FLOOR_EXEMPT, contrastAgainst, bytesToHex, hexToBytes, luma, fails, worstBySwatch, table } from './contrast-lib.mjs';

const PRESETS = ['potato', 'performance', 'balanced', 'quality', 'extreme'];
// The weather clock (s into the 240 s cycle, rain.js RAIN): 230 is dry (the
// ground has dried since the rain stopped at 120), 124 is wet without rain
// streaks (soaked, the rain just stopped), 80 is heavy rain (streaks on top).
const CLOCKS = { dry: 230, wet: 124, rain: 80 };

const { flags } = parseArgs(process.argv.slice(2), ['verbose', 'no-floor']);
const port = flags.port || process.env.PORT || 5806, mapId = flags.map || 'lumen', map = maps[mapId];
const presets = !flags.preset || flags.preset === 'all' ? PRESETS : String(flags.preset).split(',');
const clockNames = String(flags.clock || 'dry,wet').split(',');
const lights = String(flags.light || 'sun,shade').split(',');
const W = +(flags.w || process.env.W || 1280), H = +(flags.h || process.env.H || 720);
const grounds = (() => {
  const g = String(flags.grounds || 'base');
  if (g === 'all') return GROUNDS;
  if (['base', 'area', 'paint'].includes(g)) return GROUNDS.filter(x => x.set === g);
  return g.split(',').map(id => GROUNDS.find(x => x.id === id) || (() => { throw new Error(`unknown ground ${id}`); })());
})();
// --tints map (default: what the map's ground code screens over the ground) |
// design (the design's table) | recommended (contrast-lib POOLS, normal blend) | '{"red":"#3b1011"}' (overrides on the map's).
const tintsArg = String(flags.tints || 'map');
const poolNames = !flags.pools || flags.pools === 'all' ? Object.keys(POOLS) : String(flags.pools).split(',');
// --look: what to measure. `current` (the default) is the map's own look;
// `baseline` the stage-1 look Lumen started stage 3 with; `@file.json` a file
// of { name: look } (a look = the fields of a map's `look`: sky, bounce,
// skyIntensity, sun, sunIntensity, haze, fogNear, fogFar, exposure, grade);
// a JSON object is one look called `custom`. Comma-separate to compare several
// in one page load (they are applied in place: lights, fog, exposure, grade).
const NAMED_LOOKS = { current: null, baseline: { sky: '#a8abb8', bounce: '#2c2e36', skyIntensity: 7, sun: '#9fb0cf', sunIntensity: 2.4, haze: '#141828', fogNear: 62, fogFar: 150, exposure: 1 } };
const looks = String(flags.look || 'current').split(/,(?![^{]*})/).flatMap(part => {
  part = part.trim();
  if (part in NAMED_LOOKS) return [{ name: part, look: NAMED_LOOKS[part] }];
  if (part.startsWith('@')) return Object.entries(JSON.parse(fs.readFileSync(part.slice(1), 'utf8'))).map(([name, look]) => ({ name, look }));
  return [{ name: 'custom', look: JSON.parse(part) }];
});
const real = flags.spots ? (flags.spots === true || flags.spots === 'all' ? Object.keys(SPOTS[mapId]).filter(k => !['start', 'walk'].includes(k)) : String(flags.spots).split(',')) : null;

// ---------------------------------------------------------------------------
// The lab's stage: the biggest open rectangle of the map (no room, no tower
// mass, no standing puddle: the rain's masks leave it dry-able and wet-able
// like open street), nearest the middle. The cells of the pool row are laid
// on it in two rows of four.
const PITCH_X = 8.6, PITCH_Z = 8.6, HALF_X = 17, HALF_Z = 9;
function findStage() {
  const free = (x, z) => {
    if (!isPlayable(map, x, z)) return false;
    for (const b of map.buildings) if (buildingContains(b, { x, z })) return false;
    for (const s of map.solids) { const c = Math.cos(s.angle || 0), sn = Math.sin(s.angle || 0), dx = x - s.x, dz = z - s.z; if (Math.abs(dx * c - dz * sn) < s.w / 2 + 1 && Math.abs(dx * sn + dz * c) < s.d / 2 + 1) return false; }
    for (const p of map.city?.puddles || []) if (Math.hypot(x - p.x, z - p.z) < Math.max(p.rx, p.rz) + 2) return false;
    return true;
  };
  let best = null;
  for (let x = -60; x <= 60; x += 2) for (let z = -55; z <= 55; z += 2) {
    let ok = true;
    for (let dx = -HALF_X; dx <= HALF_X && ok; dx += 3) for (let dz = -HALF_Z; dz <= HALF_Z; dz += 3) if (!free(x + dx, z + dz)) { ok = false; break; }
    if (ok) { const d = Math.hypot(x - map.spawn.x, z - map.spawn.z); if (!best || d < best.d) best = { x, z, d }; }
  }
  if (!best) throw new Error(`no open ${2 * HALF_X} x ${2 * HALF_Z} m rectangle on ${mapId} for the lab stage`);
  return best;
}

// Real spots: the swatches need a clear patch of open ground, so each spot
// is moved to the nearest patches (within 24 m) with no room, tower, prop or
// barricade on it, and the player (the camera) stands there. The first one
// where every swatch can be seen from the camera is used (a tall building
// in front hides the ground behind it).
const PROP_R = Object.fromEntries(Object.entries(LUMEN_PROP_TYPES).map(([k, v]) => [k, Math.hypot(v.w || 1, v.d || 1) / 2 + .7]));
function findClearings(spot, hx = 3.8, hz = 2.6, want = 6) {
  const free = (x, z) => {
    if (!isPlayable(map, x, z)) return false;
    for (const b of map.buildings) if (buildingContains(b, { x, z })) return false;
    for (const s of map.solids) { const c = Math.cos(s.angle || 0), sn = Math.sin(s.angle || 0), dx = x - s.x, dz = z - s.z; if (Math.abs(dx * c - dz * sn) < s.w / 2 + .6 && Math.abs(dx * sn + dz * c) < s.d / 2 + .6) return false; }
    for (const p of map.props || []) if (Math.hypot(x - p.x, z - p.z) < (PROP_R[p.type] ?? 2)) return false;
    return true;
  };
  const found = [];
  for (let r = 0; r <= 24 && found.length < want; r += 1.5) for (let a = 0; a < (r ? 24 : 1) && found.length < want; a++) {
    const x = spot.x + Math.cos(a / 24 * Math.PI * 2) * r, z = spot.z + Math.sin(a / 24 * Math.PI * 2) * r;
    let ok = true;
    for (let dx = -hx; dx <= hx && ok; dx += 1) for (let dz = -hz; dz <= hz; dz += 1) if (!free(x + dx, z + dz)) { ok = false; break; }
    const at = { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 };
    if (ok && !found.some(f => Math.hypot(f.x - at.x, f.z - at.z) < 4)) found.push(at);
  }
  return found.length ? found : [spot];
}

const swatchDefs = SWATCHES.map(s => ({ colour: s.colour, lit: s.lit }));
const cellCentres = (stage, n) => Array.from({ length: n }, (_, i) => ({ x: stage.x + ((i % 4) - 1.5) * PITCH_X, z: stage.z + (Math.floor(i / 4) - .5) * PITCH_Z }));

// ---------------------------------------------------------------------------
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const rows = [], lookInfo = {}, groundRows = [];
const png = flags.png && flags.png !== true ? String(flags.png) : null;
if (png) fs.mkdirSync(png, { recursive: true });
const log = (...a) => console.error(...a);

const keys = [];
async function runPreset(presetName) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  // Other people edit the source while the dev server is up; Vite's hot-reload
  // socket would reload the page under the measurement. It gets a dead stand-in.
  await page.addInitScript(() => {
    const Real = window.WebSocket, dead = { send() {}, close() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
    window.WebSocket = function (url, protocols) { return String(protocols).includes('vite-hmr') ? dead : new Real(url, protocols); };
    Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  });
  await page.addInitScript(q => localStorage.setItem('deadstab-settings', JSON.stringify({ quality: q, qualityAuto: false })), presetName);
  await page.goto(`http://127.0.0.1:${port}/?play=1&weapon=rifle&map=${mapId}&capture=thumbnail`);
  await page.waitForFunction(() => document.body.classList.contains('playing') && window.__capture, null, { timeout: 300000 });
  await page.evaluate(async (lab) => { const m = await import('/tools/contrast-stage.mjs'); window.__stage = new m.Stage(window.__capture, { lab }); window.__stage.prepare(); }, !real);
  // --eval "js": run in the page before measuring (to try a renderer setting
  // without editing the renderer: --eval "window.__capture.view.post.bloom.threshold = .5").
  if (flags.eval && flags.eval !== true) await page.evaluate(code => (0, eval)(code), String(flags.eval));

  // One measured frame: returns the sampled swatches of every cell.
  let preset = presetName;
  async function shoot(label, sun, clock) {
    await page.evaluate(([c, s]) => window.__stage.condition({ clock: c, sun: s }), [clock, sun]);
    await page.evaluate(() => window.__stage.settle(8));
    const boxes = await page.evaluate(() => window.__stage.measure());
    const shot = await page.screenshot({ type: 'png', timeout: 180000 }); // Extreme's frame is slow on a busy machine
    if (png) fs.writeFileSync(path.join(png, `${preset.replace(/\//g, "-")}-${label}.png`), shot);
    return page.evaluate(([b64, b]) => window.__stage.sample(b64, b), [shot.toString('base64'), boxes]);
  }
  let visible = null; // real spots: which swatches can be seen
  const push = (cellName, ground, pool, clockName, light, sampled, cellIndex) => {
    SWATCHES.forEach((sw, index) => {
      const s = sampled[cellIndex * SWATCHES.length + index];
      if (!s?.mean || s.ring.length < 8 || (visible && !visible[cellIndex * SWATCHES.length + index])) { rows.push({ preset, ground, pool, clock: clockName, light, swatch: sw.id, need: sw.need, missing: true }); return; }
      const c = contrastAgainst(s.mean, s.ring);
      rows.push({ preset, ground, pool, clock: clockName, light, swatch: sw.id, need: sw.need, worst: c.worst, p5: c.p5, median: c.median, groundRgb: c.ground.map(Math.round), swatchRgb: s.mean.map(Math.round) });
      if (index === 0) groundRows.push({ preset, ground, pool, clock: clockName, light, rgb: c.ground.map(Math.round) });
    });
  };

  for (const L of looks) {
    preset = looks.length > 1 || L.name !== 'current' ? `${presetName}/${L.name}` : presetName; keys.push(preset);
    await page.evaluate(o => window.__stage.applyLook(o), L.look);
    lookInfo[preset] = await page.evaluate(() => window.__stage.info());
    if (!real) {
      const stage = findStage(), centres = cellCentres(stage, poolNames.length);
      const mapPools = await page.evaluate(() => window.__stage.mapPools());
      const tints = tintsArg === 'design' ? DESIGN_POOLS : tintsArg === 'recommended' ? POOLS : { ...mapPools.tints, ...(tintsArg.startsWith('{') ? JSON.parse(tintsArg) : {}) };
      // The recommended tints are for normal blending at full strength; the others use the map's own.
      const normal = tintsArg === 'recommended' || flags.blend === 'normal';
      const paint = { blend: normal ? 'source-over' : mapPools.blend, alphas: normal ? [1, 1, 1] : mapPools.alphas.length === 3 ? mapPools.alphas : [.3, .38, .46] };
      lookInfo[preset].tints = tints; lookInfo[preset].blend = paint.blend;
      await page.evaluate(([c, defs]) => window.__stage.place(defs, c), [centres, swatchDefs]);
      await page.evaluate(s => window.__stage.focusOn(s.x, s.z), stage);
      const rect = { x0: stage.x - HALF_X - 4, x1: stage.x + HALF_X + 4, z0: stage.z - HALF_Z - 4, z1: stage.z + HALF_Z + 4 };
      for (const ground of grounds) {
        await page.evaluate(([r, g, cells, o]) => window.__stage.paintStage(r, g, cells, o), [rect, ground.colour, centres.map((c, i) => ({ x: c.x, z: c.z, colour: tints[poolNames[i]] ?? null })), paint]);
        for (const clockName of clockNames) for (const light of lights) {
          const sampled = await shoot(`${ground.id}-${clockName}-${light}`, light === 'sun', CLOCKS[clockName]);
          poolNames.forEach((pool, i) => push(pool, ground.id, pool, clockName, light, sampled, i));
          log(`${preset} ${ground.id} ${clockName} ${light}`);
        }
      }
    } else {
      for (const name of real) {
        const named = SPOTS[mapId][name] || (() => { const m = name.split(/[\s,]+/).map(Number); return { x: m[0], z: m[1] }; })();
        let spot = null;
        for (const candidate of findClearings(named)) {
          await page.evaluate(([defs, s]) => { window.__stage.place(defs, [{ x: s.x, z: s.z }]); window.__stage.focusOn(s.x, s.z); }, [swatchDefs, candidate]);
          // Which swatches can be seen from the camera: paint them magenta and count.
          await page.evaluate(() => { window.__stage.magenta(true); window.__stage.condition({ clock: 230, sun: true }); });
          await page.evaluate(() => window.__stage.settle(6));
          const boxes = await page.evaluate(() => window.__stage.measure().map(({ x0, x1, y0, y1 }) => ({ x0, x1, y0, y1 })));
          const visShot = await page.screenshot({ type: 'png', timeout: 180000 });
          const fractions = await page.evaluate(([b64, b]) => window.__stage.visible(b64, b), [visShot.toString('base64'), boxes]);
          await page.evaluate(() => window.__stage.magenta(false));
          const seen = fractions.map(f => f >= .8), count = seen.filter(Boolean).length;
          if (!spot || count > spot.count) { spot = { ...candidate, count, seen }; }
          if (count === seen.length) break;
        }
        // Back to the best patch found.
        await page.evaluate(([defs, s]) => { window.__stage.place(defs, [{ x: s.x, z: s.z }]); window.__stage.focusOn(s.x, s.z); }, [swatchDefs, spot]);
        visible = spot.seen;
        log(`${name}: swatches at ${spot.x}, ${spot.z}` + (spot.count < spot.seen.length ? ` (${spot.seen.length - spot.count} of ${spot.seen.length} hidden)` : ''));
      for (const clockName of clockNames) for (const light of lights) {
          const sampled = await shoot(`${name}-${clockName}-${light}`, light === 'sun', CLOCKS[clockName]);
          push(name, name, 'real', clockName, light, sampled, 0);
          log(`${preset} ${name} ${clockName} ${light}`);
        }
      }
    }
  }
  if (errors.length) log(`${presetName}: page errors: ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
  await page.close();
}

const started = Date.now();
const measuredRows = () => rows.filter(r => !r.missing);
const label = r => `${r.ground}/${r.pool}/${r.clock}/${r.light}`;
function presetTable(preset) {
  const mine = measuredRows().filter(r => r.preset === preset), worst = worstBySwatch(mine, !!real);
  const cols = [];
  for (const c of clockNames) for (const l of lights) cols.push([c, l]);
  const head = ['swatch', 'need', ...cols.map(([c, l]) => `${c}/${l}`), 'worst at'];
  const body = SWATCHES.map(sw => {
    const cells = cols.map(([c, l]) => { const v = Math.min(...mine.filter(r => r.swatch === sw.id && r.clock === c && r.light === l).map(r => real ? r.p5 : r.worst)); return Number.isFinite(v) ? v.toFixed(1) + (v < sw.need ? '!' : ' ') : '-'; });
    const w = worst.get(sw.id);
    return [sw.label, sw.need, ...cells, w ? w.at : ''];
  });
  return `\n== ${preset} ==\n` + table([head, ...body]);
}
const save = () => { if (flags.json && flags.json !== true) fs.writeFileSync(String(flags.json), JSON.stringify({ when: new Date().toISOString(), mode: real ? 'real' : 'lab', look: lookInfo, rows: measuredRows(), ground: groundRows }, null, 1)); };
console.log(`Lumen contrast (${real ? 'real spots' : 'lab stage'}), CIEDE2000 on screen, worst case per swatch; floors: blood and team colours 15, coats 8`);
for (const presetName of presets) {
  const had = keys.length;
  try { await runPreset(presetName); } catch (e) { console.log(`\n${presetName}: FAILED to measure: ${String(e.message).split('\n')[0]}`); process.exitCode = 1; }
  for (const key of keys.slice(had)) console.log(presetTable(key));
  save();
}
await browser.close();

// ---------------------------------------------------------------------------
// The verdict.
const measured = measuredRows(), missing = rows.filter(r => r.missing);

// The ground on screen (the bare cell of each ground; the design's floor is
// GROUND_FLOOR for the ground in general; Back Alley's own darker grounds may sit
// a shade under, `DARK_OK` of it).
const floorLuma = luma(hexToBytes(GROUND_FLOOR)), DARK_OK = DARK_FLOOR_SHARE, DARK_GROUNDS = new Set(DARKS);
const conditions = [];
for (const c of clockNames) for (const l of lights) conditions.push([c, l]);
console.log(`\nGround on screen, bare (mean of the ground round the swatches; floor ${GROUND_FLOOR}, ${DARK_OK * 100}% for ${[...DARK_GROUNDS].join('/')}):`);
for (const preset of keys) {
  const mine = groundRows.filter(r => r.preset === preset && (r.pool === 'none' || r.pool === 'real'));
  if (!mine.length) continue;
  const names = [...new Set(mine.map(r => r.ground))];
  const cell = (g, c, l) => { const r = mine.find(x => x.ground === g && x.clock === c && x.light === l); return r ? bytesToHex(r.rgb) + (luma(r.rgb) < floorLuma * (DARK_GROUNDS.has(g) ? DARK_OK : 1) ? '!' : ' ') : '-'; };
  console.log(`  ${preset}\n` + table([['ground', ...conditions.map(([c, l]) => `${c}/${l}`)], ...names.map(g => [g, ...conditions.map(([c, l]) => cell(g, c, l))])]).replace(/^/gm, '    '));
}
if (!real) {
  console.log('\nThe test pools on screen (asphalt, ' + conditions[0].join('/') + '): ' + keys.map(preset => {
    const mine = groundRows.filter(r => r.preset === preset && r.ground === 'asphalt' && r.clock === conditions[0][0] && r.light === conditions[0][1]);
    return mine.length ? `\n  ${preset.padEnd(12)}` + mine.map(r => `${r.pool} ${bytesToHex(r.rgb)}`).join('  ') : '';
  }).join(''));
} else console.log('  (real spots: the ground round a swatch may include props and walls; judged on the 5th percentile)');

const bad = fails(measured, !!real);
const dark = flags['no-floor'] || real ? [] : groundRows.filter(r => r.pool === 'none' && !FLOOR_EXEMPT.includes(r.ground) && luma(r.rgb) < floorLuma * (DARK_GROUNDS.has(r.ground) ? DARK_OK : 1));
console.log(`\n${measured.length} swatch readings in ${((Date.now() - started) / 1000).toFixed(0)} s; ${missing.length} off screen or hidden`);
if (flags.verbose) for (const r of measured) console.log(`${r.preset} ${label(r)} ${r.swatch} worst ${r.worst.toFixed(1)} p5 ${r.p5.toFixed(1)} swatch ${bytesToHex(r.swatchRgb)} ground ${bytesToHex(r.groundRgb)}`);
if (missing.length) console.log(`  off screen or hidden: ${missing.length} (first: ${missing.slice(0, 3).map(r => `${r.preset} ${label(r)} ${r.swatch}`).join(', ')})`);
if (bad.length) {
  console.log(`\nFAIL: ${bad.length} readings under their floor`);
  const byKey = new Map();
  for (const r of bad) { const k = `${r.preset} ${r.swatch}`; if (!byKey.has(k) || (real ? r.p5 : r.worst) < byKey.get(k).v) byKey.set(k, { v: real ? r.p5 : r.worst, at: label(r), need: r.need, n: 0 }); byKey.get(k).n++; }
  for (const [k, v] of byKey) console.log(`  ${k}: ${v.v.toFixed(1)} < ${v.need} at ${v.at} (${v.n} readings)`);
}
if (dark.length) console.log(`\nFAIL: ${dark.length} bare ground readings darker than ${GROUND_FLOOR}: ${[...new Set(dark.map(r => `${r.preset} ${r.ground}/${r.clock}/${r.light} ${bytesToHex(r.rgb)}`))].slice(0, 8).join(', ')}`);
save();
if (!process.exitCode && !bad.length && !dark.length && !missing.length) console.log('\nPASS');
process.exit(process.exitCode || bad.length || dark.length || missing.length ? 1 : 0);
