// render/city-signs.js and render/glyph-atlas.js (Lumen stage 0): the sign,
// screen and traffic-light materials, their builders and the invented script.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { register } from 'node:module';
import * as THREE from 'three';

// city-features.js imports the tall shells (another stage-0 system); until
// that file lands, stand in an empty class so this module can load on its own.
if (!existsSync(new URL('../src/render/city-shells.js', import.meta.url))) {
  register('data:text/javascript,' + encodeURIComponent(`export async function resolve(specifier, context, next) {
    if (specifier === './city-shells.js') return { url: 'data:text/javascript,export class CityShells { constructor() {} }', shortCircuit: true };
    return next(specifier, context);
  }`));
}
const S = await import('../src/render/city-signs.js');
const A = await import('../src/render/glyph-atlas.js');
const { CityFeatures, BRIGHT_LAYER } = await import('../src/render/city-features.js');
const { cityTest } = await import('../src/maps/city-test.js');
const { SIGN, SCREEN, TRAFFIC, TRAFFIC_LAMPS, SIGNAL_STATES, SIGN_MODES, NEON, trafficPhase, trafficLevel, signModeLevel, breakLevel, sagAt, POWER_SAG, lumenHash } = S;

// A city (the hub) with only the signs: the test map as city-test gives it.
function makeCity(map = cityTest, quality = 'balanced') {
  const scene = new THREE.Scene(), view = { scene, qualityName: quality, camera: new THREE.PerspectiveCamera(), focus: new THREE.Vector3() };
  const city = new CityFeatures(view, { ...map, city: { signs: map.city?.signs ?? true } });
  return { city, view, scene, signs: city.signs };
}

// ---------------------------------------------------------------------------
// Traffic.

test('a signal cycles green 12 s, yellow 3 s, red the rest, and cross directions never both go', () => {
  assert.equal(TRAFFIC.cycle, 2 * (TRAFFIC.green + TRAFFIC.yellow + TRAFFIC.clearance));
  const seen = { green: 0, yellow: 0, red: 0 }, dt = .01;
  for (let t = 0; t < TRAFFIC.cycle; t += dt) seen[trafficPhase(t).light] += dt;
  assert.ok(Math.abs(seen.green - 12) < .05 && Math.abs(seen.yellow - 3) < .05 && Math.abs(seen.red - (TRAFFIC.cycle - 15)) < .05, JSON.stringify(seen));
  for (const offset of [0, 3.3, 17]) for (let t = -40; t < 200; t += .05) {
    const a = trafficPhase(t, { phaseOffset: offset, group: 0 }), b = trafficPhase(t, { phaseOffset: offset, group: 1 });
    assert.ok(a.light === 'red' || b.light === 'red', `both directions go at ${t}: ${a.light} / ${b.light}`);
    // The shader's per-lamp function agrees with the phase: exactly one lamp lit.
    const lit = ['red', 'yellow', 'green'].filter(l => trafficLevel(TRAFFIC_LAMPS[l], offset, 0, 0, t) === 1);
    assert.deepEqual(lit, [a.light]);
    // Pedestrians walk only in their own green; the hand shows whenever they don't.
    if (a.walk === 'walk') assert.equal(a.light, 'green');
    assert.equal(trafficLevel(TRAFFIC_LAMPS.walk, offset, 0, 0, t) + (a.walk === 'stop' ? trafficLevel(TRAFFIC_LAMPS.stop, offset, 0, 0, t) : 1) >= 1, true);
  }
  // `next` counts down to the change.
  const p = trafficPhase(5); assert.equal(p.light, 'green'); assert.ok(Math.abs(p.next - 7) < 1e-9);
});

test('yellow is lemon, never amber; blink and dead states', () => {
  assert.equal(TRAFFIC.colours.yellow.toLowerCase(), '#fcee0a');
  assert.equal(TRAFFIC.colours.hazard.toLowerCase(), '#fcee0a');
  let on = 0, n = 0;
  for (let t = 0; t < 60; t += .01, n++) {
    for (const l of ['yellow', 'green', 'walk', 'stop']) assert.equal(trafficLevel(TRAFFIC_LAMPS[l], 0, 0, SIGNAL_STATES.blink, t), 0);
    on += trafficLevel(TRAFFIC_LAMPS.red, 0, 0, SIGNAL_STATES.blink, t);
    for (const l of Object.values(TRAFFIC_LAMPS)) assert.equal(trafficLevel(l, 0, 0, SIGNAL_STATES.dead, t), 0);
  }
  assert.ok(Math.abs(on / n - TRAFFIC.blinkDuty) < .02);
  assert.ok(1 / TRAFFIC.blink <= 2 && 1 / TRAFFIC.hazard <= 2 && 1 / TRAFFIC.flash <= 2, 'every blink at most 2 Hz');
  assert.equal(trafficPhase(3, { state: 'dead' }).light, 'off');
});

// ---------------------------------------------------------------------------
// Signs: flashing, not strobing.

// The most on->off->on cycles in any one-second window, sampled at 1 kHz.
function worstFlashRate(level, from = 0, to = 300) {
  const edges = []; let last = level(from) > .5;
  for (let t = from; t < to; t += .001) { const now = level(t) > .5; if (now !== last) { edges.push(t); last = now; } }
  let worst = 0;
  for (let i = 0, j = 0; i < edges.length; i++) { while (edges[i] - edges[j] > 1) j++; worst = Math.max(worst, (i - j + 1) / 2); }
  return worst;
}

test('no sign mode flashes 3 times a second or more; a failing tube does flicker', () => {
  for (const seed of [0, .13, .5, .77, .999]) {
    for (const mode of ['flicker', 'blink', 'pulse', 'dead']) {
      const rate = worstFlashRate(t => signModeLevel(SIGN_MODES[mode], seed, t));
      assert.ok(rate < 3, `${mode} seed ${seed}: ${rate} flashes a second`);
    }
  }
  // Over five minutes a flickering tube goes out, and is mostly lit.
  let out = 0, n = 0;
  for (let t = 0; t < 300; t += .01, n++) if (signModeLevel(SIGN_MODES.flicker, .31, t) === 0) out++;
  assert.ok(out > 0 && out / n < .15, `out ${(out / n * 100).toFixed(1)}% of the time`);
  assert.equal(signModeLevel(SIGN_MODES.steady, .4, 12.3), 1);
});

test('a shot sign sparks three times, stays dark, relights; the break never strobes', () => {
  const shot = 10, back = shot + SIGN.restoreAfter;
  assert.equal(breakLevel(-1, -1, 50), 1);
  assert.equal(breakLevel(shot, back, 9.9), 1);
  let flashes = 0, last = 0;
  for (let t = shot; t < shot + 3; t += .001) { const l = breakLevel(shot, back, t) > 0 ? 1 : 0; if (l && !last) flashes++; last = l; }
  assert.equal(flashes, SIGN.spark.flickers);
  assert.equal(breakLevel(shot, back, shot + 5), 0);
  assert.equal(breakLevel(shot, back, back + 1), 1);
  assert.ok(worstFlashRate(t => breakLevel(shot, back, t), shot - 1, back + 2) < 3);
  // Dark until restored.
  assert.equal(breakLevel(shot, shot, shot + 500), 0);
});

test('the hash is exact 32-bit PCG (the GPU computes the same values)', () => {
  assert.equal(lumenHash(0, 0, 0), lumenHash(0, 0, 0));
  const values = new Set(); for (let i = 0; i < 1000; i++) { const v = lumenHash(i, 7, 3); assert.ok(v >= 0 && v < 1); values.add(v); }
  assert.equal(values.size, 1000);
  // Negative inputs wrap like GLSL's uint(int(x)).
  assert.ok(lumenHash(-5, 1, 2) >= 0);
});

test('the power sag is 1-2 s every few minutes and never flashes', () => {
  let len = 0, peak = 0;
  for (let t = 0; t < POWER_SAG.period; t += .01) { const s = sagAt(t); if (s > .02) len += .01; peak = Math.max(peak, s); }
  assert.ok(len > 1 && len < 2, `${len} s`); assert.ok(peak > .95 && peak <= 1);
  assert.ok(worstFlashRate(t => sagAt(t) > .5 ? 1 : 0, 0, 400) < 1);
  assert.equal(sagAt(POWER_SAG.at + 1), sagAt(POWER_SAG.at + 1 + POWER_SAG.period));
});

// ---------------------------------------------------------------------------
// The atlas and the invented script.

test('the atlas builds deterministically at its size, with every glyph and pictogram', () => {
  const a = A.buildGlyphAtlas();
  assert.equal(a.size, 256); assert.equal(a.data.length, 256 * 256);
  assert.equal(a.glyphCount, A.GLYPH_COUNT); assert.equal(A.GLYPH_COUNT, 64);
  for (const name of ['can', 'bowl', 'heart', 'bolt', 'arrow-right', 'arrow-up', 'walk', 'hand', 'warning', 'biohazard', 'no-port', 'note', 'cocktail', 'lips']) assert.ok(A.PICTOGRAMS[name], name);
  // Same bytes again (a fresh generation of one glyph and one pictogram).
  const g = A.rasterShape(A.glyphShape(5)), again = A.rasterShape(A.glyphShape(5));
  assert.deepEqual(g, again);
  // Every glyph cell and every pictogram cell has ink; the crack strip too.
  const cellInk = (x0, y0, size) => { let s = 0; for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) s += a.data[y * 256 + x]; return s; };
  for (let i = 0; i < A.GLYPH_COUNT; i++) assert.ok(cellInk((i % 16) * 16, Math.floor(i / 16) * 16, 16) > 2000, `glyph ${i} empty`);
  A.PICTOGRAM_NAMES.forEach((n, i) => assert.ok(cellInk((i % 8) * 32, 64 + Math.floor(i / 8) * 32, 32) > 20000, `${n} empty`));
  assert.ok(cellInk(0, 192, 64) + cellInk(64, 192, 64) + cellInk(128, 192, 64) > 10000);
  // A texture over it: R8, mipmapped.
  const tex = A.glyphAtlasTexture();
  assert.equal(tex.format, THREE.RedFormat); assert.equal(tex.image.width, 256); assert.equal(tex.generateMipmaps, true);
  const r = A.pictogramRect('walk'); assert.ok(r.u1 > r.u0 && r.v1 > r.v0 && r.v0 >= 64 / 256);
});

// 5 x 7 capitals, digits and the two-piece symbols, for the likeness check.
const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'], D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'], F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'], H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'], J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'], L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'], N: ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'], P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'], R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'], T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'], V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'], X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'], Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], 1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], 3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], 5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], 7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], 9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  i: ['00100', '00000', '01100', '00100', '00100', '00100', '01110'], j: ['00010', '00000', '00110', '00010', '00010', '10010', '01100'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'], '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'], ';': ['00000', '01100', '01100', '00000', '01100', '00100', '01000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'], '%': ['11000', '11001', '00010', '00100', '01000', '10011', '00011'],
};
const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
// The character at the glyph box's size (14 x 14), nearest sampled, centred,
// strokes a little thicker than a pixel (the glyphs' own weight).
function renderChar(rows, n = 14) {
  const out = new Uint8Array(n * n), h = n, w = Math.round(n * 5 / 7), x0 = Math.floor((n - w) / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[Math.min(6, Math.floor(y / h * 7))][Math.min(4, Math.floor(x / w * 5))] === '1') out[y * n + x0 + x] = 255;
  return out;
}
// Dice likeness of two binary rasters, best over small shifts.
function likeness(a, b, n = 14) {
  let best = 0;
  for (let sy = -2; sy <= 2; sy++) for (let sx = -2; sx <= 2; sx++) {
    let both = 0, ca = 0, cb = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const va = a[y * n + x] >= 128, xx = x + sx, yy = y + sy, vb = xx >= 0 && yy >= 0 && xx < n && yy < n && b[yy * n + xx] >= 128;
      if (va) ca++; if (vb) cb++; if (va && vb) both++;
    }
    best = Math.max(best, 2 * both / Math.max(1, ca + cb));
  }
  return best;
}

test('the invented glyphs follow the rule and look like no letter or digit', () => {
  const inner = A.ATLAS.glyphCell - 2 * A.ATLAS.glyphPad, keys = new Set();
  // The rule's premise: every capital and digit is one piece.
  for (const c of LATIN) assert.equal(A.componentCount(renderChar(FONT[c], inner), inner, inner), 1, c);
  let worst = { score: 0 };
  for (let i = 0; i < A.GLYPH_COUNT; i++) {
    const prims = A.glyphShape(i), raster = A.rasterShape(prims, inner);
    // (a) at least two separate pieces; (b) a solid or closed anchor.
    assert.ok(A.componentCount(raster, inner, inner) >= 2, `glyph ${i} is one piece`);
    assert.ok(prims.some(p => p.kind === 'disc' || p.kind === 'poly' || p.kind === 'ring'), `glyph ${i} has no anchor`);
    keys.add([...raster].map(v => v >= 128 ? 1 : 0).join(''));
    for (const [c, rows] of Object.entries(FONT)) {
      const score = likeness(raster, renderChar(rows, inner));
      if (score > worst.score) worst = { score, glyph: i, c };
    }
  }
  assert.equal(keys.size, A.GLYPH_COUNT, 'every glyph distinct');
  // The yardstick: how alike two DIFFERENT characters are on this measure.
  // Each capital or digit against its nearest other one scores from about
  // .64 (Y and 9) to .94 (D and O), the middle about .8. A crude overlap
  // score of solid shapes against strokes never reaches zero, so the check is
  // relative: every glyph is further from every character than a typical
  // character is from its nearest neighbour, with a clear margin.
  const nearest = [...LATIN].map(a => Math.max(...[...LATIN].filter(b => b !== a).map(b => likeness(renderChar(FONT[a], inner), renderChar(FONT[b], inner))))).sort((x, y) => x - y);
  const typical = nearest[Math.floor(nearest.length / 2)];
  assert.ok(worst.score < Math.min(.72, typical - .08), `glyph ${worst.glyph} looks like "${worst.c}" (${worst.score.toFixed(2)}; characters' nearest-neighbour median ${typical.toFixed(2)})`);
});

// ---------------------------------------------------------------------------
// Colours.

const lab = hex => {
  const c = new THREE.Color(hex), f = t => t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const X = (c.r * .4124 + c.g * .3576 + c.b * .1805) / .95047, Y = c.r * .2126 + c.g * .7152 + c.b * .0722, Z = (c.r * .0193 + c.g * .1192 + c.b * .9505) / 1.08883;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const deltaE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

test('no light, sign or screen colour is near a team colour', () => {
  const team = ['#ffb020', '#2ee6ff', '#b77bff'];
  const colours = [...Object.values(NEON), ...Object.values(TRAFFIC.colours), SIGN.backingColour, SIGN.housingColour];
  for (const c of colours) for (const t of team) assert.ok(deltaE(c, t) > 25, `${c} is ${deltaE(c, t).toFixed(1)} from team ${t}`);
  // And what the demo actually built: every emitter.
  const { city } = makeCity();
  for (const e of city.emitters) for (const t of team) assert.ok(deltaE('#' + e.colour.getHexString(), t) > 25, `${e.kind} emitter ${e.colour.getHexString()}`);
});

// ---------------------------------------------------------------------------
// The system.

test('the demo builds merged meshes with every attribute, on the bright layer', () => {
  const { city, scene, signs } = makeCity();
  assert.ok(signs, 'the signs system is made for city.signs');
  const names = ['lumen-signs', 'lumen-screens', 'lumen-traffics', 'lumen-halos', 'lumen-pools'];
  for (const name of names) assert.equal(scene.children.filter(o => o.name === name).length, 1, name);
  for (const [kind, attributes] of Object.entries(S.ATTRIBUTES)) {
    const g = signs.meshes[kind].geometry, n = g.attributes.position.count;
    assert.ok(n > 3, `${kind} has geometry`);
    for (const a of attributes) { assert.ok(g.attributes[a], `${kind}.${a}`); assert.equal(g.attributes[a].count, n, `${kind}.${a} count`); }
    assert.equal(g.index.count % 3, 0);
    const mesh = signs.meshes[kind];
    assert.ok(mesh.layers.isEnabled(0) && mesh.layers.isEnabled(BRIGHT_LAYER), `${kind} on layers 0 and bright`);
  }
  // Two screens: 4 face vertices each.
  assert.equal(signs.meshes.screen.geometry.attributes.position.count, 8);
  // Screen modes as asked.
  const modes = new Set(signs.meshes.screen.geometry.attributes.mode.array);
  assert.ok(modes.has(S.SCREEN_MODES.glyphs) && modes.has(S.SCREEN_MODES.centrepiece));
  // Sign modes: flicker, blink, dead segments, steady and the dark backing.
  const signModes = new Set(signs.meshes.sign.geometry.attributes.mode.array);
  for (const m of ['steady', 'flicker', 'blink', 'dead', 'backing']) assert.ok(signModes.has(SIGN_MODES[m]), m);
  // HDR: lit tubes above 1.
  assert.ok(Math.max(...signs.meshes.sign.geometry.attributes.intensity.array) > 1);
  // Budget: the demo is small.
  const tris = Object.values(signs.counts).length && signs.counts.signTriangles + signs.counts.screenTriangles + signs.counts.trafficTriangles;
  assert.ok(tris < 6000, `${tris} triangles`);
});

test('emitters are registered for the light pool with levels that follow the shaders', () => {
  const { city, signs } = makeCity();
  assert.equal(city.emitters.length, signs.emitters.length);
  const kinds = city.emitters.map(e => e.kind);
  for (const k of ['neon', 'screen', 'signal', 'ped', 'lamp']) assert.ok(kinds.includes(k), k);
  assert.equal(kinds.filter(k => k === 'lamp').length, 3);
  assert.equal(kinds.filter(k => k === 'signal').length, 6);  // two heads x three lamps
  for (const e of city.emitters) {
    for (const k of ['x', 'y', 'z', 'intensity', 'reach']) assert.ok(Number.isFinite(e[k]), `${e.kind}.${k}`);
    // As the light pool reads them: a number and a flag.
    assert.ok(e.colour.isColor && e.id != null && typeof e.level === 'number' && typeof e.broken === 'boolean');
  }
  // A signal lamp's emitter level is its phase (read now, or at a time).
  const green = city.emitters.find(e => e.kind === 'signal' && e.source[1] === TRAFFIC_LAMPS.green && e.source[3] === 0);
  assert.equal(signs.emitterLevel(green, 1), 1); assert.equal(signs.emitterLevel(green, 20), 0);
  // (in play a signal runs on the weather clock, like the chirps: stage 3 review)
  signs.shared.signalClock.value = 1; assert.equal(green.level, 1);
  signs.shared.signalClock.value = 20; assert.equal(green.level, 0);
  // The level leaves the sag to the light pool; emitterLevel can add it.
  signs.shared.signalClock.value = 1; city.uniforms.sag.value = 1;
  assert.equal(green.level, 1); assert.ok(signs.emitterLevel(green, 1) < 1);
  city.uniforms.sag.value = 0;
  // Cards: halos for all bright emitters; ground pools for the changing ones only.
  assert.equal(signs.meshes.halo.geometry.instanceCount, city.emitters.filter(e => e.halo > 0).length);
  assert.equal(signs.meshes.pool.geometry.instanceCount, city.emitters.filter(e => e.changing).length);
  assert.ok(city.emitters.filter(e => e.changing).every(e => e.kind === 'signal' || e.source[1] !== SIGN_MODES.steady));
});

test('the break table is a float texture, one texel (shot, back) per id; break and restore', () => {
  const { signs } = makeCity();
  const texture = signs.materials.sign.uniforms.signBreaks.value, table = texture.image.data;
  assert.ok(texture.isDataTexture); assert.equal(texture.type, THREE.FloatType); assert.equal(texture.format, THREE.RGBAFormat);
  assert.equal(texture.image.width, SIGN.slots); assert.equal(texture.image.height, 1); assert.ok(SIGN.slots >= 1024);
  assert.equal(texture.magFilter, THREE.NearestFilter);
  assert.equal(table.length, SIGN.slots * 4);
  assert.ok(table.every(v => v === -1), 'nothing shot at the start');
  const version = texture.version;
  // The same table object in every material that reads it.
  for (const m of ['screen', 'traffic', 'halo', 'pool']) assert.equal(signs.materials[m].uniforms.signBreaks, signs.materials.sign.uniforms.signBreaks);
  const id = 1, piece = signs.breakSign(id, 100);
  assert.ok(piece && piece.centre.length === 3);
  // id 1 is texel 1: (shot, back, -, -); uploaded on the change, not per frame.
  assert.deepEqual([...table.slice(4, 6)], [100, 100 + SIGN.restoreAfter]);
  assert.ok(texture.version > version);
  const settled = texture.version; signs.update({ clock: 0 }); signs.update({ clock: 1 });
  assert.equal(texture.version, settled, 'no upload without a change');
  assert.equal(signs.isBroken(id, 101), true);
  assert.equal(signs.breakSign(id, 101), null, 'already out');
  assert.equal(signs.isBroken(id, 100 + SIGN.restoreAfter + .01), false, 'back by itself');
  signs.breakSign(3, 50);
  assert.deepEqual([...table.slice(12, 14)], [50, 80]); // id 3: texel 3
  assert.equal(signs.restoreSign(3, 60), true);
  assert.equal(table[13], 60); assert.equal(signs.isBroken(3, 60.1), false);
  // Every id up to the table's size can break.
  for (let i = 0; i < 40; i++) signs.addNeon('ring', { at: [0, 3, -2] });
  assert.ok(signs.pieces.length > 40);
  // The emitter goes dark with it.
  const e = signs.emitters.find(x => x.signId === 1);
  signs.breakSign(1, 200); assert.equal(signs.emitterLevel(e, 205), 0);
  signs.city.uniforms.time.value = 205; assert.equal(e.level, 0); assert.equal(e.broken, true);
  // The centrepiece never breaks (its face carries id 0); a shot at a wall
  // finds the sign on it.
  const g = signs.meshes.screen.geometry, modes = g.attributes.mode.array, ids = g.attributes.signId.array;
  for (let i = 0; i < modes.length; i++) if (modes[i] === S.SCREEN_MODES.centrepiece) assert.equal(ids[i], 0);
  assert.equal(signs.breakSign(0, 10), null);
  const neon = signs.pieces[2];
  assert.equal(signs.signNear(neon.centre[0], neon.centre[2], .5, 0), 2);
  assert.equal(signs.signNear(0, 15, .5, 0), 0);
});

test('materials: one each, stable cache keys, the shared uniforms, and quality', () => {
  const a = makeCity(cityTest, 'potato'), b = makeCity(cityTest, 'extreme');
  for (const kind of ['sign', 'screen', 'traffic', 'halo', 'pool']) {
    const ma = a.signs.materials[kind], mb = b.signs.materials[kind];
    assert.ok(ma.isShaderMaterial);
    assert.equal(ma.customProgramCacheKey(), mb.customProgramCacheKey());
    assert.equal(ma.customProgramCacheKey(), S.MATERIAL_KEYS[kind]);
    assert.equal(ma.vertexShader, mb.vertexShader); assert.equal(ma.fragmentShader, mb.fragmentShader);
    assert.equal(ma.uniforms.time, a.city.uniforms.time, 'the hub\'s time');
    assert.equal(ma.uniforms.sag, a.city.uniforms.sag, 'the hub\'s sag');
  }
  // One sign mesh, one screen mesh, one traffic mesh per map: every piece in them.
  assert.equal(a.scene.children.filter(o => o.material === a.signs.materials.sign).length, 1);
  // Potato: no halos, no pools; Extreme: both, halos smaller than Balanced's.
  assert.equal(a.signs.meshes.halo.visible, false); assert.equal(a.signs.meshes.pool.visible, false);
  assert.equal(b.signs.meshes.halo.visible, true); assert.equal(b.signs.meshes.pool.visible, true);
  b.signs.setQuality('balanced'); const full = b.signs.shared.haloScale.value; b.signs.setQuality('extreme');
  assert.ok(b.signs.shared.haloScale.value < full);
  // The warm-up shows the cards on any preset; the next update restores.
  a.signs.warm(); assert.equal(a.signs.meshes.halo.visible, true);
  a.signs.update({ clock: 0 }); assert.equal(a.signs.meshes.halo.visible, false);
  // The sag follows the weather clock.
  a.signs.update({ clock: POWER_SAG.at + .5 }); assert.ok(a.city.uniforms.sag.value > .5);
  // The shaders are well-formed enough to have their parts.
  assert.match(a.signs.materials.screen.fragmentShader, /textureGrad/);
  assert.match(a.signs.materials.sign.vertexShader, /texelFetch\(signBreaks/);
  for (const kind of ['sign', 'screen', 'traffic', 'halo']) assert.match(a.signs.materials[kind].vertexShader, /cutAway\(/, kind);
});

test('a map without city.signs gets no signs; a map list builds instead of the demo', () => {
  const scene = new THREE.Scene(), view = { scene, qualityName: 'balanced' };
  const none = new CityFeatures(view, { ...cityTest, city: { signs: false } });
  assert.equal(none.signs, undefined);
  assert.equal(scene.children.filter(o => o.name?.startsWith('lumen-s')).length, 0);
  const list = [{ kind: 'neon', shape: 'heart', at: [0, 4, -2], colour: 'rose', mode: 'pulse' }, { kind: 'screen', at: [4, 5, -2], mode: 'loading' }, { kind: 'lamp', at: [0, 0, 4.6], facing: Math.PI }];
  const withList = new CityFeatures({ scene: new THREE.Scene(), qualityName: 'balanced' }, { ...cityTest, citySigns: list, city: { signs: true } });
  assert.equal(withList.signs.counts.signs, 3);
  assert.equal(withList.emitters.length, 3);
  // Adding after finish rebuilds on the next update, same materials.
  const before = withList.signs.meshes.sign.geometry.attributes.position.count, material = withList.signs.meshes.sign.material;
  withList.signs.addNeon({ glyphs: 3 }, { at: [8, 4, -2] });
  withList.signs.update({ clock: 0 });
  assert.ok(withList.signs.meshes.sign.geometry.attributes.position.count > before);
  assert.equal(withList.signs.meshes.sign.material, material);
});

test('pieces on a cut building drop above its first floor; the pools stay on the ground layer', () => {
  const { city, signs } = makeCity();
  // The pools: the ground layer only (never the mirror's bright layer).
  const pools = signs.meshes.pool;
  assert.ok(pools.layers.isEnabled(4) && !pools.layers.isEnabled(0) && !pools.layers.isEnabled(BRIGHT_LAYER));
  // The demo's facade signs carry their buildings' slots; the street pieces 0.
  const slots = city.shells.slots, cut = signs.meshes.sign.geometry.attributes.cut;
  assert.ok(slots.get('l-tower') > 0);
  const used = new Set(); for (let i = 0; i < cut.count; i++) used.add(cut.getX(i));
  assert.ok(used.has(slots.get('l-tower')) && used.has(slots.get('wedge')) && used.has(0));
  for (const kind of ['screen', 'traffic']) assert.ok(signs.meshes[kind].geometry.attributes.cut, kind);
  assert.ok(signs.meshes.halo.geometry.attributes.cardCut);
  // A builder's building option: the slot and the piece's centre height.
  signs.addNeon('heart', { at: [0, 6, -2], building: 7 });
  signs.finish();
  const c = signs.meshes.sign.geometry.attributes.cut, last = c.count - 1;
  assert.deepEqual([c.getX(last), c.getY(last)], [7, 6]);
  // The shells' cut table: slot 7 cut with its first floor at 4 m. The light
  // on the storey above goes out for the light pool; a street light does not.
  const data = new Float32Array(64 * 4); data[7 * 4] = 1; data[7 * 4 + 2] = 4;
  city.cutTexture = new THREE.DataTexture(data, 64, 1, THREE.RGBAFormat, THREE.FloatType);
  signs.update({ clock: 0 });
  assert.equal(signs.materials.sign.uniforms.cityCut.value, city.cutTexture, 'the hub\'s cut table, once it exists');
  city.uniforms.time.value = 1;
  const heart = signs.emitters[signs.emitters.length - 1], lamp = signs.emitters.find(e => e.kind === 'lamp' && e.source[1] === 0);
  assert.equal(heart.level, 0); assert.ok(lamp.level > 0);
  data[7 * 4 + 2] = 8; assert.ok(heart.level > 0, 'below the first floor it stays');
});
