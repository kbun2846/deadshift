// effects/rain.js and render/wet-ground.js (Lumen stage 0): the shared rain
// schedule and wetness as pure functions of the weather clock, the roof and
// puddle masks, the GPU streaks and rings, and the wet ground's shader patch.
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
const { RAIN, RAIN_LOOK, RAIN_MASK, rainAt, wetnessAt, wetnessLinear, rainPhase, maskBounds, maskTexel, maskValue, buildRoofMask, buildPuddleMask,
  seededPuddles, roofShapes, shapeBox, RainSystem, streakGeometry, rainTime, streakFalls, ringLives } = await import('../src/effects/rain.js');
const { wetGroundMaterial, WET_GROUND_DEFINES, WET_GROUND_KEY, blackTexture } = await import('../src/render/wet-ground.js');
const { CityFeatures, CITY_SYSTEMS } = await import('../src/render/city-features.js');
const { cityTest } = await import('../src/maps/city-test.js');
const { buildingContains } = await import('../src/map-kit.js');

// The largest step allowed between clock and clock + 0.01 s: the steepest a
// smooth ramp gets (1.5 / its length) over 0.01 s, with a little slack.
const stepLimit = spec => .01 * 1.5 / Math.min(spec.ramp, spec.wetIn, spec.dryOut) * 1.01;

test('rain and wetness are deterministic, stay in 0..1 and never jump', () => {
  for (const spec of [RAIN, { ...RAIN, offset: 77 }, { ...RAIN, dryOut: 200 }, { ...RAIN, period: 100, on: 70, ramp: 5, wetIn: 60, dryOut: 40 }]) {
    const EPS = stepLimit(spec);
    let lastRain = rainAt(-1000, spec), lastWet = wetnessAt(-1000, spec);
    for (let clock = -1000; clock < 1000; clock += .01) {
      const rain = rainAt(clock, spec), wet = wetnessAt(clock, spec);
      assert.ok(rain >= 0 && rain <= 1 && wet >= 0 && wet <= 1, `out of range at ${clock}`);
      assert.ok(Math.abs(rain - lastRain) < EPS, `rain jumps at ${clock.toFixed(2)}: ${lastRain} -> ${rain}`);
      assert.ok(Math.abs(wet - lastWet) < EPS, `wetness jumps at ${clock.toFixed(2)}: ${lastWet} -> ${wet}`);
      lastRain = rain; lastWet = wet;
    }
    // The same clock, the same answer: a joiner computes what the host sees.
    assert.equal(wetnessAt(1234.567, spec), wetnessAt(1234.567, { ...spec }));
  }
});

test('the schedule: 2 min of rain eased in and out over 12 s, then 2 min dry, repeating', () => {
  assert.equal(rainAt(0), 0);
  assert.ok(rainAt(6) > .3 && rainAt(6) < .7, 'half way up the ramp');
  assert.equal(rainAt(12), 1); assert.equal(rainAt(60), 1); assert.equal(rainAt(108), 1);
  assert.ok(rainAt(114) > .3 && rainAt(114) < .7, 'half way down');
  assert.equal(rainAt(120), 0); assert.equal(rainAt(200), 0);
  for (const clock of [3, 50, 119, 150, 239]) {
    assert.equal(rainAt(clock + RAIN.period * 7), rainAt(clock));
    assert.ok(Math.abs(wetnessAt(clock + RAIN.period * 7) - wetnessAt(clock)) < 1e-12, 'the long-run cycle repeats');
  }
  // The offset starts the cycle part way through.
  assert.equal(rainAt(0, { ...RAIN, offset: 60 }), 1);
  assert.equal(rainPhase(-10), 230);
});

test('wetness lags the rain: soaked ~30 s after it starts, dry ~90 s after it stops', () => {
  assert.equal(wetnessAt(0), 0, 'dry when the rain begins (Lumen dries fully between showers)');
  assert.ok(wetnessAt(12) < rainAt(12) - .5, 'the rain is full before the ground is wet');
  assert.ok(wetnessAt(25) > .3 && wetnessAt(25) < .9, `soaking at 25 s (${wetnessAt(25)})`);
  assert.equal(wetnessAt(45), 1, 'soaked by 45 s (30 s of full rain after the ramp)');
  assert.equal(wetnessAt(120), 1, 'still soaked as the rain stops');
  assert.ok(wetnessAt(130) > .9 && rainAt(130) === 0, 'wet after the rain stops');
  assert.ok(wetnessAt(165) > .2 && wetnessAt(165) < .8, 'half dry after 45 s');
  assert.equal(wetnessAt(210), 0, 'dry 90 s after');
  // Wetness only rises while it rains and only falls while it does not.
  for (let clock = 0; clock < 240; clock += .5) {
    const d = wetnessLinear(clock + .5) - wetnessLinear(clock);
    if (rainAt(clock + .25) > 0) assert.ok(d >= 0, `drying in the rain at ${clock}`); else assert.ok(d <= 0, `wetting in the dry at ${clock}`);
  }
});

test('a short dry spell leaves the ground damp when the next rain comes, still continuous across the cycle', () => {
  const spec = { ...RAIN, dryOut: 200 };
  const start = wetnessLinear(0, spec);
  assert.ok(Math.abs(start - (1 - 120 / 200)) < 1e-9, `damp at the cycle start: ${start}`);
  assert.ok(Math.abs(wetnessLinear(239.9999, spec) - start) < 1e-5, 'the end of one cycle meets the start of the next');
  // A drizzle too light to soak the ground in one shower: never wetter than it gets.
  const drizzle = { ...RAIN, wetIn: 500 };
  assert.ok(wetnessLinear(119.9, drizzle) < .25 && wetnessLinear(0, drizzle) === 0);
});

// ---------------------------------------------------------------------------

test('the mask box: the playable box plus the margin, whole half-metre texels, rows a multiple of 4', () => {
  const b = maskBounds(cityTest);
  assert.equal(b.texel, .5);
  assert.ok(b.x0 <= -30 - RAIN_MASK.margin && b.x1 >= 30 + RAIN_MASK.margin && b.z0 <= -24 - RAIN_MASK.margin && b.z1 >= 20 + RAIN_MASK.margin);
  assert.equal(b.width % 4, 0);
  assert.equal((b.x1 - b.x0) / b.texel, b.width); assert.equal((b.z1 - b.z0) / b.texel, b.height);
  // The texel helper agrees with the shaders' uv = (xz - x0z0) / size, sampled at the texel's centre.
  for (const [x, z] of [[0, 0], [-29.9, 19.9], [12.3, -7.7]]) {
    const u = (x - b.x0) / (b.x1 - b.x0), v = (z - b.z0) / (b.z1 - b.z0);
    assert.equal(maskTexel(b, x, z), Math.floor(v * b.height) * b.width + Math.floor(u * b.width));
  }
  // Clamped at the edges, as ClampToEdge wrapping does.
  assert.equal(maskTexel(b, -1e4, -1e4), 0);
  assert.equal(maskTexel(b, 1e4, 1e4), b.width * b.height - 1);
  // A huge map gets coarser texels, never a bigger texture.
  const big = maskBounds({ width: 4000, depth: 3000 });
  assert.ok(big.width <= RAIN_MASK.maxTexels + 4 && big.height <= RAIN_MASK.maxTexels && big.texel > .5);
});

test('the roof mask covers every room (rects and wedge quads), tower mass and canopy, and nothing outside', () => {
  const map = { ...cityTest, city: { ...cityTest.city, canopies: [{ x: 0, z: 10, w: 4, d: 2, angle: .3 }, { quad: [[-4, 14], [0, 14], [0, 16], [-5, 16]] }] } };
  const b = maskBounds(map), roof = buildRoofMask(map, b), shapes = roofShapes(map);
  assert.equal(shapes.length, map.buildings.length + map.solids.length + 2);
  assert.ok(map.buildings.some(r => r.quad), 'the test map has a wedge room');
  // The mask errs dry (stage 3, owner: interiors never get wet): a texel is
  // covered when a roof reaches within a texel of its centre, so every texel
  // whose centre is under a roof is covered, and so is the whole bilinear
  // neighbourhood of every point inside; a texel no roof comes near stays open.
  let inside = 0;
  const near = (x, z, r) => shapes.some(s => [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]].some(([dx, dz]) => buildingContains(s, { x: x + dx, z: z + dz })));
  for (let j = 0; j < b.height; j++) for (let i = 0; i < b.width; i++) {
    const point = { x: b.x0 + (i + .5) * b.texel, z: b.z0 + (j + .5) * b.texel };
    const covered = shapes.some(s => buildingContains(s, point)), value = roof[j * b.width + i];
    if (covered) assert.equal(value, 255, `texel at ${point.x}, ${point.z}`);
    else if (!near(point.x, point.z, b.texel * 1.5)) assert.equal(value, 0, `open texel at ${point.x}, ${point.z}`);
    inside += covered;
  }
  // Inside every room, right up to its walls, the GPU's blended mask reads a
  // full roof: nothing wet or raining can show indoors.
  const bilinear = (x, z) => { const u = (x - b.x0) / b.texel - .5, v = (z - b.z0) / b.texel - .5, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const at = (ii, jj) => roof[Math.min(b.height - 1, Math.max(0, jj)) * b.width + Math.min(b.width - 1, Math.max(0, ii))] / 255;
    return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv; };
  for (const room of map.buildings) {
    const [x0, z0, x1, z1] = shapeBox(room);
    for (let x = x0 + .01; x < x1; x += .13) for (let z = z0 + .01; z < z1; z += .13) if (buildingContains(room, { x, z })) assert.ok(bilinear(x, z) > .999, `${room.id} dry at ${x.toFixed(2)}, ${z.toFixed(2)}`);
  }
  assert.ok(inside > 1000, 'the rooms, towers and canopies cover a good part of the box');
  // Spot checks: the street is open; the shop, the wedge's prow and a canopy are covered.
  assert.equal(maskValue(roof, b, 0, 0), 0);
  assert.equal(maskValue(roof, b, 19, 8), 1);
  assert.equal(maskValue(roof, b, 10, -18), 1);
  assert.equal(maskValue(roof, b, 0, 10), 1);
  assert.equal(maskValue(roof, b, 0, -26), 1, 'the sealed tower ring');
});

test('seeded puddles lie on open ground, the same every load; the puddle mask is soft-edged and dry under roofs', () => {
  const puddles = seededPuddles(cityTest);
  assert.deepEqual(seededPuddles(cityTest), puddles, 'deterministic');
  assert.ok(puddles.length >= 5, `${puddles.length} puddles`);
  const shapes = roofShapes(cityTest);
  for (const p of puddles) {
    assert.ok(!shapes.some(s => buildingContains(s, p)), 'not under a roof');
    assert.ok(p.x > -30 && p.x < 30 && p.z > -24 && p.z < 20, 'in the playable box');
  }
  const b = maskBounds(cityTest), roof = buildRoofMask(cityTest, b), pool = buildPuddleMask(puddles, b, roof);
  for (const p of puddles) {
    assert.equal(maskValue(pool, b, p.x, p.z), 1, 'full water at the centre');
    assert.equal(maskValue(pool, b, p.x + Math.cos(p.angle) * p.rx * 1.3, p.z + Math.sin(p.angle) * p.rx * 1.3), 0, 'dry past the rim');
  }
  const values = new Set(pool); assert.ok(values.size > 10, 'soft edges, not a hard cut');
  // A puddle listed under a roof stays dry there.
  const under = buildPuddleMask([{ x: 19, z: 11, rx: 4, rz: 4, angle: 0 }], b, roof);
  assert.equal(maskValue(under, b, 19, 10), 0, 'inside the shop (z 4..12) it is dry');
  assert.ok(maskValue(under, b, 19, 13) > .9, 'just outside the shop it is water');
});

// ---------------------------------------------------------------------------

function fakeView(quality = 'balanced') {
  return { scene: new THREE.Scene(), focus: new THREE.Vector3(3, 0, -2), qualityName: quality, remote: null, player: null, camera: new THREE.PerspectiveCamera() };
}
const cityFor = () => ({ uniforms: {
  time: { value: 0 }, wetness: { value: 0 }, rain: { value: 0 }, sag: { value: 0 },
  puddleMask: { value: null }, roofMask: { value: null }, maskBounds: { value: new THREE.Vector4(-1, -1, 1, 1) },
  mirrorMap: { value: null }, mirrorMatrix: { value: new THREE.Matrix4() }, mirrorStrength: { value: 0 } } });
const frame = (clock, focus = new THREE.Vector3()) => ({ clock, dt: 1 / 60, elapsed: clock, focus });

test('the rain system: masks on the shared uniforms, one streak mesh and one ring pool in the scene, counts by preset and rain', () => {
  assert.ok(CITY_SYSTEMS.some(([flag]) => flag === 'rain'), 'registered under map.city.rain');
  const view = fakeView(), city = cityFor(), rain = new RainSystem(view, cityTest, city);
  const u = city.uniforms, b = rain.bounds;
  assert.deepEqual(u.maskBounds.value.toArray(), [b.x0, b.z0, b.x1, b.z1]);
  for (const texture of [u.roofMask.value, u.puddleMask.value]) {
    assert.equal(texture.format, THREE.RedFormat); assert.equal(texture.type, THREE.UnsignedByteType);
    assert.equal(texture.image.width, b.width); assert.equal(texture.unpackAlignment, 1);
  }
  const meshes = view.scene.children;
  assert.equal(meshes.length, 2);
  for (const mesh of meshes) { assert.equal(mesh.frustumCulled, false); assert.equal(mesh.material.depthWrite, false); assert.equal(mesh.material.blending, THREE.AdditiveBlending); assert.equal(mesh.material.side, THREE.DoubleSide, 'a camera-facing streak winds either way'); }
  assert.ok(rain.rings.isInstancedMesh);
  assert.equal(rain.streaks.geometry.index.count, 3000 * 6, 'built at Extreme\'s count');
  assert.equal(rain.rings.instanceMatrix.count, 500);

  // Full rain on Balanced: 900 streaks, 150 rings.
  rain.update(frame(60, new THREE.Vector3(5, 0, 7)));
  assert.equal(u.rain.value, 1); assert.equal(u.wetness.value, 1);
  assert.equal(rain.streaks.geometry.drawRange.count, 900 * 6); assert.equal(rain.rings.count, 150);
  assert.deepEqual(rain.focus.toArray(), [5, 0, 7], 'the box follows the focus');
  assert.equal(rain.streaks.material.uniforms.focus.value, rain.focus);
  // Half way up the ramp: about half of them.
  rain.update(frame(6));
  assert.ok(Math.abs(rain.streaks.geometry.drawRange.count / 6 - 900 * u.rain.value) <= 1);
  // Dry: nothing drawn.
  rain.update(frame(180));
  assert.equal(rain.streaks.visible, false); assert.equal(rain.rings.visible, false); assert.ok(u.wetness.value > 0, 'still wet');
  for (const [name, streaks, rings] of [['potato', 0, 0], ['performance', 350, 60], ['quality', 1800, 300], ['extreme', 3000, 500]]) {
    rain.setQuality(name); rain.update(frame(60));
    assert.equal(rain.streaks.geometry.drawRange.count, streaks * 6, name); assert.equal(rain.rings.count, rings, name);
    assert.equal(rain.streaks.visible, streaks > 0); assert.equal(rain.rings.visible, rings > 0);
  }
  // Warm-up: everything drawn once at full size, then back.
  rain.setQuality('potato'); rain.warm();
  assert.equal(rain.streaks.visible, true); assert.equal(rain.streaks.geometry.drawRange.count, 18000); assert.equal(rain.rings.count, 500);
  rain.update(frame(60)); assert.equal(rain.streaks.visible, false);
  // The same materials all along: a preset or a shower builds nothing.
  assert.equal(view.scene.children[0].material, rain.streaks.material);
  assert.equal(rain.streaks.material.customProgramCacheKey(), 'lumen-rain-streaks');
  // The masks from the system's side (footsteps and sound later).
  assert.equal(rain.roofAt(19, 8), 1); assert.equal(rain.roofAt(0, 0), 0);
  rain.dispose(); assert.equal(view.scene.children.length, 0); assert.equal(u.roofMask.value, null);
});

test('the streak and ring shaders share the city uniforms, skip under roofs and never allocate per frame', () => {
  const city = cityFor(), rain = new RainSystem(fakeView(), cityTest, city);
  const s = rain.streaks.material, r = rain.rings.material;
  for (const material of [s, r]) {
    assert.equal(material.uniforms.time, rain.time, "the rain's own wrapped clock");
    assert.equal(material.uniforms.roofMask, city.uniforms.roofMask);
    assert.equal(material.uniforms.maskBounds, city.uniforms.maskBounds);
    assert.match(material.vertexShader, /if \(rainRoofAt\(xz\) > 0\.50\)|if \(texture2D\(roofMask, uv\)\.r > 0\.50\)/);
    assert.match(material.vertexShader, /mod\(xz - focus\.xz \+ rainBox\.xz, size\)/, 'wrapped round the focus on the GPU');
  }
  assert.match(s.fragmentShader, /if \(rainRoofAt\(vWorldXz\) > 0\.50\) discard;/);
  assert.equal(r.uniforms.puddleMask, city.uniforms.puddleMask);
  // Update reuses everything it touches.
  const before = [rain.streaks.geometry.drawRange, rain.focus, city.uniforms.rain];
  rain.update(frame(30)); rain.update(frame(31));
  assert.deepEqual([rain.streaks.geometry.drawRange, rain.focus, city.uniforms.rain], before);
  // Each streak's four corners share one seed.
  const g = streakGeometry(4), seed = g.getAttribute('seed');
  for (let k = 1; k < 4; k++) assert.equal(seed.getX(k), seed.getX(0));
  assert.notEqual(seed.getX(4), seed.getX(0));
});

test('the hub makes the rain for a city map with rain on, and not with it off', () => {
  const view = { ...fakeView(), map: cityTest };
  const on = new CityFeatures(view, cityTest);
  assert.ok(on.rain instanceof RainSystem);
  const off = new CityFeatures({ ...fakeView(), map: cityTest }, { ...cityTest, city: { ...cityTest.city, rain: false } });
  assert.equal(off.rain, undefined);
  // A map may start its cycle part way through.
  const offset = new RainSystem(fakeView(), { ...cityTest, city: { ...cityTest.city, rain: { offset: 60 } } }, cityFor());
  assert.equal(offset.spec.offset, 60); assert.equal(offset.spec.period, RAIN.period);
});

// ---------------------------------------------------------------------------

function compile(material) {
  const source = THREE.ShaderLib.standard;
  const shader = { uniforms: THREE.UniformsUtils.clone(source.uniforms), vertexShader: source.vertexShader, fragmentShader: source.fragmentShader };
  material.onBeforeCompile(shader); return shader;
}

test('the wet ground: a vertex-coloured standard material, a stable key, the defines per preset', () => {
  const city = cityFor(), material = wetGroundMaterial(city);
  assert.ok(material.isMeshStandardMaterial && material.vertexColors);
  assert.equal(material.color.getHexString(), 'ffffff');
  assert.equal(material.customProgramCacheKey(), WET_GROUND_KEY);
  assert.deepEqual(city.wetGroundMaterials, [material]);
  const expected = { potato: [], performance: [], balanced: ['CITY_GLOSS'], quality: ['CITY_GLOSS', 'CITY_MIRROR'], extreme: ['CITY_GLOSS', 'CITY_MIRROR'] };
  for (const [name, defines] of Object.entries(expected)) {
    const version = material.version;
    material.userData.setQuality(name);
    assert.deepEqual(Object.keys(material.defines).sort(), ['STANDARD', ...defines].sort(), name);
    assert.deepEqual(Object.keys(WET_GROUND_DEFINES[name]).sort(), defines.sort());
    assert.equal(material.customProgramCacheKey(), WET_GROUND_KEY);
    material.userData.setQuality(name);
    assert.ok(material.version <= version + 1, 'the same preset twice does not rebuild');
  }
  material.userData.setQuality('performance'); const v = material.version;
  material.userData.setQuality('quality'); assert.ok(material.version > v, 'a new define marks the material for a rebuild');
  // Starts at the preset it is given; the rain's setQuality sets them all.
  assert.deepEqual(Object.keys(wetGroundMaterial(city, { quality: 'extreme' }).defines).sort(), ['CITY_GLOSS', 'CITY_MIRROR', 'STANDARD']);
  const rain = new RainSystem(fakeView('potato'), cityTest, city);
  for (const m of city.wetGroundMaterials) assert.deepEqual(Object.keys(m.defines), ['STANDARD']);
  rain.setQuality('quality');
  for (const m of city.wetGroundMaterials) assert.ok('CITY_MIRROR' in m.defines);
});

test('the wet ground\'s shader patch: wetness, masks and the mirror on the real standard shader', () => {
  const city = cityFor(), material = wetGroundMaterial(city), shader = compile(material);
  // Every uniform shared with the city (the same objects, so no copy goes stale).
  for (const name of ['wetness', 'maskBounds', 'mirrorMatrix', 'mirrorStrength']) assert.equal(shader.uniforms[name], city.uniforms[name], name);
  for (const name of ['wetness', 'roofMask', 'puddleMask', 'maskBounds', 'mirrorMap', 'mirrorMatrix', 'mirrorStrength', 'wetTint', 'puddleTint'])
    assert.match(shader.fragmentShader, new RegExp(`uniform \\w+ ${name};`), name);
  // Null textures bind black (the program never changes); a set texture is read live.
  assert.equal(shader.uniforms.mirrorMap.value, blackTexture());
  assert.equal(shader.uniforms.roofMask.value, blackTexture());
  const target = new THREE.Texture(); city.uniforms.mirrorMap.value = target;
  assert.equal(shader.uniforms.mirrorMap.value, target);
  new RainSystem(fakeView(), cityTest, city);
  assert.equal(shader.uniforms.roofMask.value, city.uniforms.roofMask.value);
  // The replacements happened, each once, and the includes they hang off survive.
  assert.match(shader.vertexShader, /vCityWorld = \(modelMatrix \* cityWorld\)\.xyz;/);
  assert.match(shader.vertexShader, /#include <project_vertex>/);
  assert.match(shader.fragmentShader, /#include <color_fragment>\s+vec2 cityMaskUv/);
  assert.match(shader.fragmentShader, /float cityWet = wetness \* \(1\.0 - texture2D\(roofMask, cityMaskUv\)\.r\);/);
  assert.match(shader.fragmentShader, /diffuseColor\.rgb \*= mix\(mix\(vec3\(1\.0\), wetTint, cityWet\), puddleTint, cityPool\);/);
  assert.match(shader.fragmentShader, /#ifdef CITY_GLOSS\s+roughnessFactor = mix\(roughnessFactor, 0\.550, cityWet\);\s+roughnessFactor = mix\(roughnessFactor, 0\.150, cityPool\);\s+#else\s+roughnessFactor = mix\(roughnessFactor, 0\.850, cityWater\);/);
  assert.match(shader.fragmentShader, /#ifdef CITY_MIRROR\s+if \(mirrorStrength > 0\.0\) \{\s+vec4 cityMirrorAt = mirrorMatrix \* vec4\(vCityWorld, 1\.0\);\s+vec2 cityMirrorUv = cityMirrorAt\.xy \/ cityMirrorAt\.w;/);
  assert.match(shader.fragmentShader, /mix\(0\.350, 0\.850, cityPool\) \* mirrorStrength;[\s\S]*#include <opaque_fragment>/);
  assert.doesNotMatch(shader.fragmentShader, /transmission = |clearcoat = /);
  // The darkening: wet asphalt #2c2f36 -> #24272e, puddles -> #1e2129 (linear ratios).
  const dry = new THREE.Color('#2c2f36'), wet = dry.clone().multiply(new THREE.Color().setRGB(...shader.uniforms.wetTint.value.toArray()));
  assert.equal(wet.getHexString(), '24272e');
  const pool = dry.clone().multiply(new THREE.Color().setRGB(...shader.uniforms.puddleTint.value.toArray()));
  assert.equal(pool.getHexString(), '1e2129');
});

test("the shaders' clock wraps without a seam: every streak and ring is where it was", () => {
  // The vertex shaders' sums, in JS: a streak's height and the cycle its spot
  // is seeded by; a ring's life and its cycle.
  const H = RAIN_LOOK.height, P = RAIN_LOOK.wrap;
  const streak = (time, seedZ, seedW) => { const n = streakFalls(seedW), travel = seedZ * H + time * n * H / P, cycle = Math.floor(travel / H); return { y: H - (travel - cycle * H), spot: ((cycle % n) + n) % n }; };
  const ring = (time, seedZ, seedW) => { const m = ringLives(seedW), t = time * m / P + seedZ, cycle = Math.floor(t); return { life: t - cycle, spot: ((cycle % m) + m) % m }; };
  for (const [z, w] of [[.1, 0], [.37, .5], [.93, 1], [.5, .77]]) {
    const a = streak(P - 1e-6, z, w), b = streak(rainTime(P + 1e-6), z, w);
    assert.ok(Math.abs(a.y - b.y) < 1e-3 && a.spot === b.spot, `streak ${z},${w}: ${JSON.stringify([a, b])}`);
    const c = ring(P - 1e-6, z, w), d = ring(rainTime(P + 1e-6), z, w);
    assert.ok(Math.abs(c.life - d.life) < 1e-3 && c.spot === d.spot, `ring ${z},${w}: ${JSON.stringify([c, d])}`);
  }
  // Speeds and lives stay within a whisker of the look's (jitter kept).
  for (const w of [0, .5, 1]) {
    assert.ok(Math.abs(streakFalls(w) * H / P / (RAIN_LOOK.fallSpeed * (.85 + .3 * w)) - 1) < .005);
    assert.ok(ringLives(w) > P / (RAIN_LOOK.ringLife * 1.2) - 1 && ringLives(w) < P / (RAIN_LOOK.ringLife * .8) + 1);
  }
  assert.equal(rainTime(P * 3 + 2.5), 2.5); assert.equal(rainTime(7), 7);
  // The system feeds its shaders the wrapped time, never the raw one.
  const city = cityFor(), rain = new RainSystem(fakeView(), cityTest, city);
  rain.update({ ...frame(30), elapsed: P * 5 + 12.25 });
  assert.equal(rain.time.value, 12.25);
});

test('Lumen: every room and tower reads a full roof right up to its walls (interiors never get wet)', async () => {
  const { maps } = await import('../src/maps.js');
  const map = maps.lumen, b = maskBounds(map), roof = buildRoofMask(map, b);
  const bilinear = (x, z) => { const u = (x - b.x0) / b.texel - .5, v = (z - b.z0) / b.texel - .5, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const at = (ii, jj) => roof[Math.min(b.height - 1, Math.max(0, jj)) * b.width + Math.min(b.width - 1, Math.max(0, ii))] / 255;
    return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv; };
  let checked = 0;
  for (const room of [...map.buildings, ...map.solids]) {
    const [x0, z0, x1, z1] = shapeBox(room);
    for (let x = x0 + .01; x < x1; x += .17) for (let z = z0 + .01; z < z1; z += .17) if (buildingContains(room, { x, z })) {
      assert.ok(bilinear(x, z) > .999, `${room.id} dry at ${x.toFixed(2)}, ${z.toFixed(2)}`); checked++;
    }
  }
  assert.ok(checked > 10000);
  // The puddles never reach under a roof either.
  const pools = buildPuddleMask(map.city.puddles, b, roof);
  for (let k = 0; k < pools.length; k++) if (pools[k]) assert.equal(roof[k], 0);
});
