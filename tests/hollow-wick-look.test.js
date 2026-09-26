// s3-look: Hollow Wick's dusk look (render/map-look.js, the map's `look`) and
// its contrast rules (render/look-contrast.js). AGENTS.md > Hollow Wick's dusk look.
import test from 'node:test';
import assert from 'node:assert/strict';
import { maps, groundFor } from '../src/maps.js';
import { isPlayable } from '../src/playable-area.js';
import { BASE_LOOK, mapLook, warmColor } from '../src/render/map-look.js';
import { bakeGroundLayers } from '../src/render/ground-layers.js';
import { bakeHillShade, heightsOf } from '../src/render/hill-shade.js';
import * as C from '../src/render/look-contrast.js';
import { TEAMS } from '../src/config/match.js';
import { PLAYER_COLOURS } from '../src/remote-players.js';

const hw = maps['hollow-wick'], look = mapLook(hw);
// The look before stage 3 (a plain, bright daylight grey), for the brightness check.
const BEFORE = mapLook({ look: { sky: '#eceae2', bounce: '#8e8a78', sun: '#f2d4a8', sunIntensity: 2.3, haze: '#9c9892', sunOffset: { x: -43, y: 17, z: 18 } }, palette: { ground: '#625840' } });

// Every ground texel (1 m) of the playable area once: its colour (linear) and
// the sun the hills leave it. Not under the decks, not in the channel.
const texels = (() => {
 const ground = groundFor(hw), grid = heightsOf(ground), shade = bakeHillShade(grid, look.sunOffset), bake = bakeGroundLayers(grid, hw, 1, { shade });
 const out = [];
 for (let j = 0; j < bake.height; j++) for (let i = 0; i < bake.width; i++) {
  const x = bake.originX + i + .5, z = bake.originZ + j + .5;
  if (!isPlayable(hw, x, z) || ground.deckAt(x, z) >= 0 || ground.bankDistance(x, z) < 0) continue;
  const k = (j * bake.width + i) * 4;
  out.push({ x, z, linear: [0, 1, 2].map(c => C.toLinear(bake.data[k + c] / 255)), sun: bake.data[k + 3] / 255 });
 }
 return out;
})();

test('Hollow Wick is lit as an overcast dusk from the palette, Deadwater as before', () => {
 const lin = C.hexLinear, ratio = (a, b) => lin(a).map((c, i) => c / lin(b)[i]);
 // The sky light is the overcast #8a8a86, brighter (the same colour in linear light).
 const r = ratio(look.sky, '#8a8a86'); for (const v of r) assert.ok(Math.abs(v / r[0] - 1) < .03, 'sky is the overcast colour');
 // The low WSW sun, through the dusk glow: between #d9a070 and #b58a66, warm.
 const [sr, sg, sb] = C.hexRgb(look.sun);
 assert.ok(sr > sg && sg > sb && look.sun !== '#d9a070', 'a warm sun, glow mixed in');
 assert.ok(look.sunOffset.y / Math.hypot(look.sunOffset.x, look.sunOffset.z) < .4, 'a low sun');
 assert.ok(look.sunOffset.x < 0 && look.sunOffset.z > 0 && -look.sunOffset.x > look.sunOffset.z, 'from the west-south-west');
 assert.ok(look.sunIntensity < BASE_LOOK.sunIntensity, 'a weak sun');
 assert.equal(look.haze, '#9c9892');
 assert.ok(look.fogNear < 40 && look.fogFar > 100, 'the haze starts inside the view (camera about 31 m away)');
 // Unlit effects keep their colours: the default exposure.
 assert.equal(look.exposure, BASE_LOOK.exposure);
 assert.ok(look.grade && look.grade.saturation < 1, "Extreme's grade: duller");
 // Deadwater and the other maps: exactly as before stage 3.
 for (const map of Object.values(maps).filter(m => m !== hw)) {
  const l = mapLook(map);
  assert.deepEqual([l.exposure, l.fogNear, l.fogFar, l.glow, l.grade], [.98, 70, 130, null, null], map.id);
 }
 assert.equal(mapLook(maps.deadwater).sun, warmColor(BASE_LOOK.sun, maps.deadwater.look.warmth), 'no glow on Deadwater');
});

test('the dusk comes from the light, not darker ground: the ground is as bright on screen as before', () => {
 const mean = l => texels.reduce((sum, t) => sum + C.luminance(C.litOnScreen(t.linear, l, t.sun)), 0) / texels.length;
 const now = mean(look), before = mean(BEFORE);
 assert.ok(now > before * .92 && now < before * 1.15, `ground luminance ${now.toFixed(4)} vs ${before.toFixed(4)}`);
 // Shade is soft (overcast): shaded ground keeps most of the light.
 const g = C.groundLight(look, 0), s = C.groundLight(look, 1);
 assert.ok(g[1] / s[1] > .6, 'shade keeps over 60% of the light');
});

test('blood, the team colours and player coats stand out on every Hollow Wick ground, in sun and shade', () => {
 const things = [
  ['blood (a splat: unlit)', '#8c1c2a', 'unlit', C.READABLE.accent],
  ['blood (gore: lit)', '#8c1c2a', 'lit', C.READABLE.accent],
  ...TEAMS.flatMap(t => [[t.name + ' hat', t.hat, 'lit', C.READABLE.accent], [t.name + ' ring', t.ring, 'lit', C.READABLE.accent]]),
  ...PLAYER_COLOURS.map((p, i) => [`coat ${i} ${p.coat}`, p.coat, 'lit', C.READABLE.coat]),
 ];
 const worst = [];
 for (const [name, hex, kind, need] of things) {
  let low = Infinity, at = null;
  for (const t of texels) for (const sun of [t.sun, 0]) {
   const d = C.difference(kind === 'unlit' ? C.unlitOnScreen(hex, look) : C.litOnScreen(hex, look, sun), C.litOnScreen(t.linear, look, sun));
   if (d < low) { low = d; at = t; }
  }
  worst.push(`${name}: ${low.toFixed(1)}`);
  assert.ok(low >= need, `${name} is only ${low.toFixed(1)} from the ground at (${at.x}, ${at.z}); needs ${need}`);
 }
});

test('the contrast maths: CIEDE2000 reference pairs and the tone map', () => {
 // Sharma, Wu and Dalal (2005), pairs 1 and 7.
 assert.ok(Math.abs(C.deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]) - 2.0425) < 1e-3);
 assert.ok(Math.abs(C.deltaE2000([50, 0, 0], [50, -1, 2]) - 2.3669) < 1e-3);
 assert.equal(C.difference([.3, .3, .3], [.3, .3, .3]), 0);
 // ACES keeps black black and never passes white.
 assert.deepEqual(C.acesFilmic([0, 0, 0]).map(v => Math.round(v * 1e4)), [0, 0, 0]);
 for (const v of C.acesFilmic([50, 50, 50])) assert.ok(v <= 1);
});
