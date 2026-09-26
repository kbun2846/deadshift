import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_LOOK, mapLook, warmColor } from '../src/render/map-look.js';
import { maps } from '../src/maps.js';
import { tutorialMap } from '../src/tutorial.js';

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const warmthOf = hex => { const [r, , b] = rgb(hex); return r - b; };

test('a map with no look block is lit exactly as before', () => {
  const look = mapLook({ id: 'blank' });
  for (const key of ['sky', 'bounce', 'sun', 'haze', 'skyIntensity', 'sunIntensity']) assert.equal(look[key], BASE_LOOK[key]);
});

test('warmth pushes light and haze toward amber without much change in brightness', () => {
  for (const hex of [BASE_LOOK.sky, BASE_LOOK.bounce, BASE_LOOK.sun, BASE_LOOK.haze]) {
    const warm = warmColor(hex, .15);
    assert.ok(warmthOf(warm) > warmthOf(hex), `${hex} should get warmer`);
    const sum = c => rgb(c).reduce((a, b) => a + b, 0);
    assert.ok(sum(warm) > sum(hex) * .9, `${hex} should keep most of its brightness`);
  }
  assert.equal(warmColor('#123456', 0), '#123456');
});

test('every shipped map is a bit warmer than the base light, and a map can override any of it', () => {
  // (A map that sets its own sun and haze colours has its own light: Hollow
  // Wick's overcast dusk is meant a little cooler.)
  for (const map of [...Object.values(maps), tutorialMap].filter(m => !m.look?.sun || !m.look?.haze)) {
    const look = mapLook(map);
    assert.ok(warmthOf(look.sun) > warmthOf(BASE_LOOK.sun), `${map.id} sun`);
    assert.ok(warmthOf(look.haze) > warmthOf(BASE_LOOK.haze), `${map.id} haze`);
  }
  assert.equal(mapLook({ look: { sunIntensity: 1.8 } }).sunIntensity, 1.8);
});
