// Lumen stage 3 (engine): the city's ground effects and readability look
// (render/city-features.js CITY_LOOK, cityLook, wetAt), the steam vents' clouds
// (effects/steam-vents.js) and their covers (world/city-ground.js
// ventCovers), built without WebGL.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { maps } from '../src/maps.js';
import { CITY_LOOK, cityLook } from '../src/render/city-features.js';
import { SteamVents, STEAM } from '../src/effects/steam-vents.js';
import { ventCovers, VENT_COVER } from '../src/world/city-ground.js';
import { LUMEN_VENTS, VENTS, ventState } from '../src/maps/lumen-vents.js';

test('the city look: only for a city map; a map can override any part through its look', () => {
  assert.equal(cityLook(maps.deadwater), null);
  assert.equal(cityLook(maps['hollow-wick'] || maps.deadwater), null);
  const lumen = cityLook(maps.lumen);
  assert.equal(lumen.dust.colour, CITY_LOOK.dust.colour);
  assert.equal(lumen.footprint.colour, '#16181d'); assert.equal(lumen.footprint.opacity, .4); assert.equal(lumen.footprint.life, 4);
  assert.equal(lumen.readable.bloodRim, '#c23a48');
  // Deadwater-style dust ({ tint, mix }) is not a city dust: ignored.
  const custom = cityLook({ city: {}, look: { dust: { tint: '#ffffff', mix: .3 }, footprint: { life: 6 }, readable: false } });
  assert.equal(custom.dust.colour, CITY_LOOK.dust.colour); assert.equal(custom.footprint.life, 6); assert.equal(custom.footprint.colour, CITY_LOOK.footprint.colour);
  assert.equal(custom.readable, null);
  assert.equal(cityLook({ city: {}, look: { dust: { colour: '#445566' } } }).dust.colour, '#445566');
  // Dry grit and the wet spray are neutral greys, lighter when wet, never sand.
  const dry = new THREE.Color(CITY_LOOK.dust.colour), wet = new THREE.Color(CITY_LOOK.dust.wet);
  assert.ok(wet.getHSL({}).l > dry.getHSL({}).l);
  for (const c of [dry, wet]) assert.ok(c.b >= c.r, 'cool, not sandy');
  assert.ok(CITY_LOOK.dust.wetLife < 1 && CITY_LOOK.dust.wetCount < 1);
});

test('the vents\' covers: a disc and rim per manhole, a plate and bars per grate, just over the markings', () => {
  const covers = ventCovers(LUMEN_VENTS);
  const manholes = LUMEN_VENTS.filter(v => v.kind === 'manhole').length, grates = LUMEN_VENTS.length - manholes;
  assert.equal(covers.length, manholes * VENT_COVER.sides * 2 + grates * 7);
  for (const c of covers) { assert.equal(c.quad.length, 4); assert.ok(c.y >= .014 && c.y < .02); }
  assert.deepEqual(ventCovers(undefined), []);
});

const fakeCity = () => ({ uniforms: { time: { value: 0 } } });
function fakeView(quality = 'balanced') { return { scene: new THREE.Scene(), qualityName: quality, focus: new THREE.Vector3() }; }

test('the steam: one instanced draw, puffs per preset, the burst dense, the wisp faint, nothing allocated', () => {
  const view = fakeView('quality'), steam = new SteamVents(view, maps.lumen, fakeCity());
  assert.equal(view.scene.children.length, 1);
  assert.equal(steam.mesh.material.customProgramCacheKey(), 'lumen-steam-v1');
  const v = LUMEN_VENTS[0], n = LUMEN_VENTS.length;
  const burst = (() => { for (let t = 0; ; t += .05) if (ventState(t, 0, n).venting && ventState(t, 0, n).age > 1) return t; })();
  view.focus.set(v.x, 0, v.z);
  const frame = clock => ({ clock, dt: 1 / 60, elapsed: clock, focus: view.focus });
  const matrix = steam.mesh.instanceMatrix.array, alpha = steam.alpha.array;
  steam.update(frame(burst));
  assert.equal(steam.mesh.count, n * STEAM.puffs.quality); assert.ok(steam.mesh.visible);
  const mine = Array.from(alpha.slice(0, STEAM.puffs.quality));
  const dense = mine.reduce((s, a) => s + a, 0);
  // Every puff of the burst sits round the vent, within the blocking cylinder's reach.
  for (let k = 0; k < STEAM.puffs.quality; k++) assert.ok(Math.hypot(matrix[k * 16 + 12] - v.x, matrix[k * 16 + 14] - v.z) < VENTS.radius + 1.3);
  const quiet = burst + VENTS.duration + VENTS.linger + 5;
  steam.update(frame(quiet));
  const wisp = Array.from(alpha.slice(0, STEAM.puffs.quality)).reduce((s, a) => s + a, 0);
  assert.ok(wisp < dense * .2, `the wisp (${wisp.toFixed(2)}) is faint beside the burst (${dense.toFixed(2)})`);
  // The same buffers every frame.
  const before = [steam.mesh.instanceMatrix, steam.alpha, steam.state];
  for (let k = 0; k < 10; k++) steam.update(frame(burst + k / 60));
  assert.deepEqual([steam.mesh.instanceMatrix, steam.alpha, steam.state], before);
  // Presets: fewer puffs below, every preset shows the burst (it blocks sight for everyone).
  steam.setQuality('potato'); steam.update(frame(burst)); assert.equal(steam.mesh.count, n * STEAM.puffs.potato); assert.ok(STEAM.puffs.potato > 0);
  // Far from every vent: nothing drawn.
  view.focus.set(500, 0, 500); steam.update(frame(burst)); assert.equal(steam.mesh.visible, false);
  // The warm-up draws the whole pool once.
  steam.warm(); assert.ok(steam.mesh.visible && steam.mesh.count === steam.mesh.instanceMatrix.count);
  steam.dispose(); assert.equal(view.scene.children.length, 0);
});
