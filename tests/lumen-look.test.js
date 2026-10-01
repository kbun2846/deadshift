// Lumen's night look (src/maps/lumen.js `look`, lumen-design.md sections 12 and
// 15) and the contrast rule's maths (tools/contrast-lib.mjs, the on-screen
// checker tools/contrast-check.mjs). AGENTS.md > Lumen > the night look.
//
// The real rule is measured on screen by the tool (light, haze, wetness, the
// grade, every pool); this file holds what can be held without a browser: the
// CIEDE2000 formula against the published test data, the look's colours being
// the design's family, and the look-contrast model's dry reading of the bare
// grounds in moonlight and in shade.
import test from 'node:test';
import assert from 'node:assert/strict';
import { maps } from '../src/maps.js';
import { mapLook } from '../src/render/map-look.js';
import * as C from '../src/render/look-contrast.js';
import { TEAMS } from '../src/config/match.js';
import { PLAYER_COLOURS } from '../src/remote-players.js';
import { WET_GROUND } from '../src/render/wet-ground.js';
import { SWATCHES, POOLS, DESIGN_POOLS, POOL_READS, GROUNDS, GROUND_FLOOR, DARK_GROUNDS, FLOOR_EXEMPT, DARK_FLOOR_SHARE, READABLE, deltaBytes, hexToBytes, contrastAgainst, fails, worstBySwatch, luma } from '../tools/contrast-lib.mjs';

const lumen = maps.lumen, look = mapLook(lumen);
const dE = (a, b) => C.difference(C.hexRgb(a), C.hexRgb(b));

// Sharma, Wu and Dalal (2005), "The CIEDE2000 colour-difference formula:
// implementation notes, supplementary test data, and mathematical
// observations", table 1: [L1, a1, b1, L2, a2, b2, dE00].
const SHARMA = [
  [50.0000, 2.6772, -79.7751, 50.0000, 0.0000, -82.7485, 2.0425],
  [50.0000, 3.1571, -77.2803, 50.0000, 0.0000, -82.7485, 2.8615],
  [50.0000, 2.8361, -74.0200, 50.0000, 0.0000, -82.7485, 3.4412],
  [50.0000, -1.3802, -84.2814, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, -1.1848, -84.8006, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, -0.9009, -85.5211, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, 0.0000, 0.0000, 50.0000, -1.0000, 2.0000, 2.3669],
  [50.0000, -1.0000, 2.0000, 50.0000, 0.0000, 0.0000, 2.3669],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0009, 7.1792],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0010, 7.1792],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0011, 7.2195],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0012, 7.2195],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0009, -2.4900, 4.8045],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0010, -2.4900, 4.8045],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0011, -2.4900, 4.7461],
  [50.0000, 2.5000, 0.0000, 50.0000, 0.0000, -2.5000, 4.3065],
  [50.0000, 2.5000, 0.0000, 73.0000, 25.0000, -18.0000, 27.1492],
  [50.0000, 2.5000, 0.0000, 61.0000, -5.0000, 29.0000, 22.8977],
  [50.0000, 2.5000, 0.0000, 56.0000, -27.0000, -3.0000, 31.9030],
  [50.0000, 2.5000, 0.0000, 58.0000, 24.0000, 15.0000, 19.4535],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.1736, 0.5854, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.2972, 0.0000, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 1.8634, 0.5757, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.2592, 0.3350, 1.0000],
  [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
  [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.2630],
  [61.2901, 3.7196, -5.3901, 61.4292, 2.2480, -4.9620, 1.8731],
  [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
  [22.7233, 20.0904, -46.6940, 23.0331, 14.9730, -42.5619, 2.0373],
  [36.4612, 47.8580, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
  [90.8027, -2.0831, 1.4410, 91.1528, -1.6435, 0.0447, 1.4441],
  [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
  [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377],
];

test('CIEDE2000 matches the published test data (Sharma et al. 2005, 33 pairs)', () => {
  SHARMA.forEach(([L1, a1, b1, L2, a2, b2, expected], i) => {
    const got = C.deltaE2000([L1, a1, b1], [L2, a2, b2]), back = C.deltaE2000([L2, a2, b2], [L1, a1, b1]);
    assert.ok(Math.abs(got - expected) < 1e-4, `pair ${i + 1}: ${got.toFixed(4)} vs ${expected}`);
    assert.ok(Math.abs(back - expected) < 1e-4, `pair ${i + 1} reversed: ${back.toFixed(4)} vs ${expected}`);
  });
});

test('the byte-level difference used by the checker is CIEDE2000 of the sRGB colours', () => {
  assert.equal(deltaBytes([40, 44, 56], [40, 44, 56]), 0);
  // A dark red on a dark red-brown differs in hue more than in luminance.
  assert.ok(deltaBytes(hexToBytes('#8c1c2a'), hexToBytes('#6a2426')) > 5);
  assert.ok(Math.abs(deltaBytes([200, 30, 30], [30, 30, 200]) - C.difference([200 / 255, 30 / 255, 30 / 255], [30 / 255, 30 / 255, 200 / 255])) < 1e-9);
});

test('the swatch list is blood, the three team colours (hat and ring) and the six coats, with the rule\'s floors', () => {
  assert.equal(READABLE.accent, 15); assert.equal(READABLE.coat, 8);
  const byId = Object.fromEntries(SWATCHES.map(s => [s.id, s]));
  assert.equal(byId.blood.colour, '#8c1c2a'); assert.equal(byId.blood.lit, false);
  for (const t of TEAMS) {
    assert.equal(byId[`${t.name.toLowerCase()}-lit`].colour, t.colour); assert.equal(byId[`${t.name.toLowerCase()}-lit`].need, 15);
    assert.equal(byId[`${t.name.toLowerCase()}-ring`].lit, false);
  }
  PLAYER_COLOURS.forEach((c, i) => { assert.equal(byId[`coat-${i}`].colour, c.coat); assert.equal(byId[`coat-${i}`].need, 8); });
  // (15 when there were eight coats; the coats are PLAYER_COLOURS, so the count follows them.)
  assert.equal(SWATCHES.length, 3 + 2 * TEAMS.length + PLAYER_COLOURS.length); // blood (3 looks), each team lit and unlit, each coat
});

test('the judge: the closest ground sample decides, the mean is reported', () => {
  const swatch = [140, 28, 42], ground = [[30, 36, 52], [30, 36, 52], [120, 30, 40]];
  const c = contrastAgainst(swatch, ground);
  assert.ok(c.worst < 6 && c.worst > 0, 'the near-blood sample is the worst');
  assert.ok(c.p5 <= c.median);
  assert.deepEqual(c.ground.map(Math.round), [60, 34, 48]);
  const rows = [{ swatch: 'blood', need: 15, worst: 9, p5: 20, ground: 'a', pool: 'red', clock: 'dry', light: 'sun' }, { swatch: 'blood', need: 15, worst: 30, p5: 30, ground: 'a', pool: 'none', clock: 'dry', light: 'sun' }, { swatch: 'coat-4', need: 8, worst: 8.6, p5: 8.6, ground: 'a', pool: 'lemon', clock: 'dry', light: 'sun' }];
  assert.equal(fails(rows).length, 1); assert.equal(fails(rows, true).length, 0);
  assert.equal(worstBySwatch(rows).get('blood').at, 'a/red/dry/sun');
});

test('the pools and grounds are the design\'s table; no pool is a team colour', () => {
  assert.equal(DESIGN_POOLS.white, '#9aa0aa'); assert.equal(DESIGN_POOLS.blue, '#2a3670');
  assert.deepEqual(Object.keys(POOLS), Object.keys(DESIGN_POOLS));
  for (const [name, colour] of Object.entries(POOLS)) {
    if (!colour) continue;
    for (const t of TEAMS) assert.ok(dE(colour, t.colour) > 15, `${name} pool ${colour} is too near ${t.name}`);
  }
  // (the owner's darker night, 2026-09-30: sidewalks #474a52 -> #40434a, the
  // floor #1c1f26 -> #12141a; the grounds are world/lumen-ground.js's own)
  assert.equal(GROUNDS.find(g => g.id === 'asphalt').colour, '#2c2f36');
  assert.equal(GROUNDS.find(g => g.id === 'concrete').colour, '#40434a');
  assert.equal(GROUND_FLOOR, '#12141a');
});

test('Lumen\'s look is night: a cool, low moon from the west-south-west and a cool lifted hemisphere', () => {
  const l = lumen.look;
  // The moon: low (well under 45 degrees), from the west (x < 0), a little south (z > 0).
  const { x, y, z } = l.sunOffset, flat = Math.hypot(x, z);
  assert.ok(x < 0 && z > 0 && Math.abs(z) < Math.abs(x), 'west-south-west');
  assert.ok(Math.atan2(y, flat) * 180 / Math.PI < 45, 'low');
  const cool = hex => { const [r, , b] = C.hexRgb(hex); return b > r * 1.02; };
  for (const key of ['sky', 'sun', 'haze']) assert.ok(cool(l[key]), `${key} ${l[key]} is a cool colour`);
  assert.ok(cool(l.bounce) || C.hexRgb(l.bounce).every(c => Math.abs(c - C.hexRgb(l.bounce)[0]) < .06), 'the ground bounce is cool or neutral');
  assert.ok(l.exposure > 0 && l.exposure <= 1.4);
});

test('the look\'s colours are the design\'s family (section 15) and none is a team colour', () => {
  const l = lumen.look;
  // The design's night colours: the look keeps their hue and darkness family.
  // Light colours can be scaled in linear light (a brighter intensity), so the
  // check is on hue and the ratio of blue to red, not on the exact value.
  const hue = hex => { const [r, g, b] = C.hexRgb(hex), max = Math.max(r, g, b), min = Math.min(r, g, b); if (max === min) return 0; const d = max - min; const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
  const near = (a, b, deg) => Math.min(Math.abs(hue(a) - hue(b)), 360 - Math.abs(hue(a) - hue(b))) <= deg;
  assert.ok(near(l.sky, '#26304e', 35), `hemisphere sky ${l.sky} keeps the design's blue (#26304e)`);
  assert.ok(near(l.sun, '#8fa3c8', 25), `moon ${l.sun} keeps the design's cool blue-grey (#8fa3c8)`);
  assert.ok(near(l.haze, '#141828', 30) || dE(l.haze, '#141828') < 8, `haze ${l.haze} is the design's #141828`);
  assert.ok(dE(l.haze, '#141828') < 8, 'haze is the design\'s distance haze');
  for (const [key, colour] of [['sky', l.sky], ['bounce', l.bounce], ['sun', l.sun], ['haze', l.haze], ['fog', l.fog?.colour]]) {
    if (!colour) continue;
    for (const t of TEAMS) {
      // A light colour's brightness is its intensity, so only its hue could read as a team colour.
      assert.ok(!near(colour, t.colour, 12) || C.difference(C.hexRgb(colour), C.hexRgb(t.colour)) > 30, `${key} ${colour} is not near ${t.name}`);
    }
  }
});

// The look-contrast model (albedo x light, ACES, sRGB) of the bare grounds: a
// first line before the on-screen tool (which also has fog, gloss, the mirror,
// the pools, the grade). Moon: the moon on open ground; shade: the hemisphere
// only; wet: the ground darkened as the wet-ground shader does (WET_GROUND).
const BARE = GROUNDS.filter(g => g.set !== 'paint');
const wetTint = C.hexLinear(WET_GROUND.wet).map((v, i) => v / C.hexLinear(WET_GROUND.dry)[i]);
const onScreen = (albedoHex, sunLeft, wet) => {
  const e = C.groundLight(look, sunLeft), lin = C.hexLinear(albedoHex).map((a, i) => a * (wet ? wetTint[i] : 1) * e[i] / Math.PI);
  return C.acesFilmic(lin, look.exposure ?? 1).map(C.toSrgb);
};
test('the bare ground never reads darker than the floor (GROUND_FLOOR), dry or wet, nor like day', () => {
  const floor = luma(C.hexRgb(GROUND_FLOOR).map(c => c * 255));
  for (const wet of [false, true]) for (const sunLeft of [1, 0]) for (const g of BARE.filter(x => !FLOOR_EXEMPT.includes(x.id))) {
    const shown = onScreen(g.colour, sunLeft, wet).map(c => c * 255);
    // Back Alley's own grounds are the darkest by design: a shade under the floor, never black.
    const need = DARK_GROUNDS.includes(g.id) ? floor * DARK_FLOOR_SHARE : floor;
    assert.ok(luma(shown) >= need, `${g.id} ${wet ? 'wet' : 'dry'} ${sunLeft ? 'in moonlight' : 'in shade'} reads ${C.rgbHex(shown.map(c => c / 255))}, darker than the floor`);
    assert.ok(luma(shown) < luma([140, 146, 160]), `${g.id} reads like dusk, not night: ${C.rgbHex(shown.map(c => c / 255))}`);
  }
});

test('blood, the team colours and the coats clear their floors on every bare ground, in moonlight and in shade, dry and wet (model)', () => {
  const bad = [];
  for (const wet of [false, true]) for (const sunLeft of [1, 0]) for (const g of BARE) {
    const ground = onScreen(g.colour, sunLeft, wet);
    for (const s of SWATCHES) {
      const shown = s.lit ? C.litOnScreen(s.colour, look, sunLeft) : C.unlitOnScreen(s.colour, look);
      const d = C.difference(shown, ground);
      if (d < s.need) bad.push(`${s.id} on ${g.id} ${sunLeft ? 'moon' : 'shade'} ${wet ? 'wet' : 'dry'}: ${d.toFixed(1)} < ${s.need}`);
    }
  }
  assert.deepEqual(bad, []);
});

// The pools: the tints to paint (POOLS) read as the design's pool colours
// (POOL_READS) under this look, and blood, the team colours and the coats clear
// their floors on each pool in the moon and in shade, dry and wet (the wet
// ground darkens by WET_GROUND.wet / dry, pools included, wet-ground.js).
test('the pools to paint read as the design\'s pool colours on screen', () => {
  for (const name of Object.keys(POOLS)) {
    if (!POOLS[name]) continue;
    const shown = onScreen(POOLS[name], 1, false);
    assert.ok(C.difference(shown, C.hexRgb(POOL_READS[name])) < 5, `${name} pool paints ${POOLS[name]} and reads ${C.rgbHex(shown)}, wanted ${POOL_READS[name]}`);
  }
});
test('blood, the team colours and the coats clear their floors on every pool, in the moon and in shade, dry and wet (model)', () => {
  const bad = [];
  for (const [name, tint] of Object.entries(POOLS)) {
    if (!tint) continue;
    for (const sunLeft of [1, 0]) for (const wet of [false, true]) {
      const ground = onScreen(tint, sunLeft, wet);
      for (const s of SWATCHES) {
        const shown = s.lit ? C.litOnScreen(s.colour, look, sunLeft) : C.unlitOnScreen(s.colour, look), d = C.difference(shown, ground);
        if (d < s.need) bad.push(`${s.id} on the ${name} pool ${sunLeft ? 'moon' : 'shade'} ${wet ? 'wet' : 'dry'}: ${d.toFixed(1)} < ${s.need}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
