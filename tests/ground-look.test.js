// The look of the ground on terrain maps: the draped colour layers
// (ground-layers.js), the hill shade that dims only the sun (hill-shade.js),
// the per-map sun (map-look.js) and the terrain mesh that uses them.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { maps, groundFor } from '../src/maps.js';
import { bakeGroundLayers, GROUND_TEXEL, linear, frameFor } from '../src/render/ground-layers.js';
import { bakeHillShade, heightsOf, addPatch, hillShadePatch, sunWay } from '../src/render/hill-shade.js';
import { BASE_LOOK, mapLook, sunLean, shadowDepth } from '../src/render/map-look.js';
import { buildTerrainMesh } from '../src/render/terrain-mesh.js';
import { setExtremeSurfaces } from '../src/render/extreme-surfaces.js';

const map = maps['hill-test'], ground = groundFor(map), grid = heightsOf(ground);
const byte = c => Math.round(255 * (c <= .0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - .055));
const srgb = hex => linear(hex).map(byte);
function texelAt(bake, x, z) {
 const i = Math.floor((x - bake.originX) / bake.texel), j = Math.floor((z - bake.originZ) / bake.texel), k = (j * bake.width + i) * 4;
 return [bake.data[k], bake.data[k + 1], bake.data[k + 2]];
}
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// A made-up map the size of Hollow Wick (172 x 160 m): rolling ground, a
// dozen layers and paths, for the texel budget and the bake's cost.
function bigMap() {
 const cols = 345, rows = 321, heights = new Float32Array(cols * rows);
 for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) heights[r * cols + c] = 3 * Math.sin(c / 37) * Math.cos(r / 29) + (r > 200 ? -1.5 : 0);
 const ring = (x, z, radius, n = 24) => Array.from({ length: n }, (_, k) => [x + radius * Math.cos(k / n * 6.283) * (1 + .2 * Math.sin(k * 3)), z + radius * Math.sin(k / n * 6.283)]);
 const groundLayers = Array.from({ length: 12 }, (_, k) => ({ poly: ring(-60 + (k % 4) * 40, -50 + Math.floor(k / 4) * 45, 12 + k), colour: k % 3 ? '#8a7a4e' : ['#8a6a3e', '#7a5a34', '#6e4a2c'], feather: 1.5, noise: .5 }));
 const paths = Array.from({ length: 10 }, (_, k) => ({ points: [[-80, -70 + k * 15], [-20, -60 + k * 14], [30, -75 + k * 16], [80, -65 + k * 15]], width: 3 }));
 return { grid: { heights, cols, rows, cell: .5, minX: -86, minZ: -80 }, map: { palette: { ground: '#6e6a50', road: '#857a5c' }, terrainLook: { hollow: '#4a4f48', hollowBelow: -1 }, terrain: { paths }, groundLayers } };
}

test('ground layers: base, layers, paths, damp and hollow land where the map puts them', () => {
 const bake = bakeGroundLayers(grid, map, .25);
 const ground = srgb(map.palette.ground), road = srgb(map.palette.road);
 // The ramp's middle is path; open flat ground far from everything is the ground colour (give or take the slow variation).
 const ramp = texelAt(bake, -20, -4);
 assert.ok(distance(ramp, road) < distance(ramp, ground), `ramp ${ramp} reads as path`);
 const open = texelAt(bake, 36, -34);
 assert.ok(distance(open, ground) < 14, `open ground ${open} near ${ground}`);
 // Every layer shows at its centre, and not outside its reach.
 for (const layer of map.groundLayers) {
  const cx = layer.poly.reduce((s, p) => s + p[0], 0) / layer.poly.length, cz = layer.poly.reduce((s, p) => s + p[1], 0) / layer.poly.length;
  const at = texelAt(bake, cx, cz), want = srgb([].concat(layer.colour)[0]);
  assert.ok(distance(at, want) < distance(at, ground) + 6 || distance(at, ground) > 10, `layer at ${cx},${cz}: ${at}`);
 }
 // The hollow's floor (-1.6) is darker and greener-grey than the flat.
 const floor = texelAt(bake, 5, 20), sum = c => c[0] + c[1] + c[2];
 assert.ok(sum(floor) < sum(ground) - 30, `hollow floor ${floor} darker than ${ground}`);
});

test('path edges are soft but crisp: under 1.5 m from path to ground, at every preset texel', () => {
 for (const texel of new Set(Object.values(GROUND_TEXEL))) {
  const bake = bakeGroundLayers(grid, map, texel), road = srgb(map.palette.road), ground = texelAt(bake, -26, -4);
  // Across the ramp (x from -20 outward, at z -4): the share of path colour.
  const share = x => { const c = texelAt(bake, x, -4); return Math.max(0, Math.min(1, (c[0] - ground[0]) / (road[0] - ground[0]))); };
  let inner = null, outer = null;
  for (let x = -20; x > -26; x -= texel / 2) { const s = share(x); if (inner === null && s < .8) inner = x; if (s < .2) { outer = x; break; } }
  assert.ok(inner !== null && outer !== null, `texel ${texel}: the path fades out`);
  assert.ok(inner - outer < 1.5 && inner - outer > texel / 2, `texel ${texel}: edge ${(inner - outer).toFixed(2)} m wide`);
 }
});

test('the texel budget and the bake cost on a 172 x 160 m map', () => {
 const { grid: big, map: bm } = bigMap();
 for (const [preset, texel] of Object.entries(GROUND_TEXEL)) {
  const frame = frameFor(big, texel);
  assert.ok(frame.width * frame.height < 1e6, `${preset}: ${frame.width} x ${frame.height}`);
 }
 bakeGroundLayers(big, bm, .5); // (warm the JIT, as the game's own first bake is)
 const bake = bakeGroundLayers(big, bm, .25), shade = bakeHillShade(big, { x: -43, y: 17, z: 18 });
 console.log(`  172 x 160 m: ground layers at .25 m (${bake.width} x ${bake.height}) ${bake.ms.toFixed(0)} ms ${JSON.stringify(Object.fromEntries(Object.entries(bake.steps).map(([k, v]) => [k, Math.round(v)])))}; hill shade (${shade.width} x ${shade.height}) ${shade.ms.toFixed(0)} ms`);
 const test = bakeGroundLayers(grid, map, .25), testShade = bakeHillShade(grid, mapLook(map).sunOffset);
 console.log(`  Test Hill: ground layers at .25 m ${test.ms.toFixed(0)} ms, hill shade ${testShade.ms.toFixed(0)} ms`);
 // Generous: a slow phone is several times slower than this box.
 assert.ok(bake.ms < 1500 && shade.ms < 1500);
});

// A ridge 3 m high running north-south at x = 0 on flat ground.
function ridge() {
 const cols = 161, rows = 81, heights = new Float32Array(cols * rows);
 for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = -40 + c * .5; heights[r * cols + c] = Math.max(0, 3 - Math.abs(x) * 1.5); }
 return { heights, cols, rows, cell: .5, minX: -40, minZ: -20 };
}
const shadeAt = (bake, x, z) => bake.shade[Math.floor((z - bake.originZ) / bake.texel) * bake.width + Math.floor((x - bake.originX) / bake.texel)];

test('hill shade: behind a crest, from a low sun, softly; nothing on open ground', () => {
 // A low sun from the west (20 degrees): the ridge's shade runs about 3 / tan(20) = 8 m east of it.
 const low = bakeHillShade(ridge(), { x: -47, y: 17.1, z: 0 });
 assert.ok(shadeAt(low, -10, 0) > .97, 'lit up-sun');
 assert.ok(shadeAt(low, 4, 0) < .1, 'shaded just behind the crest');
 assert.ok(shadeAt(low, 30, 0) > .97, 'lit far behind it');
 // Soft: some texels between full shade and full sun at the shade's far end.
 const row = []; for (let x = 2; x < 16; x += 1) row.push(shadeAt(low, x + .5, 0));
 assert.ok(row.filter(v => v > .1 && v < .9).length >= 2, `a soft edge: ${row.map(v => v.toFixed(2))}`);
 // Deadwater's high sun: only a short shade right behind the ridge.
 const high = bakeHillShade(ridge(), BASE_LOOK.sunOffset);
 assert.ok(shadeAt(high, 8, 0) > .97 && shadeAt(high, -8, 0) > .97);
 // Flat ground is in full sun everywhere.
 const flat = { ...ridge(), heights: new Float32Array(161 * 81) };
 assert.ok(bakeHillShade(flat, { x: -47, y: 17.1, z: 0 }).shade.every(v => v > .999));
 // Test Hill's west-south-west dusk sun leaves the plateau's east foot in shade.
 const hill = bakeHillShade(grid, mapLook(map).sunOffset);
 assert.ok(shadeAt(hill, -10.5, -17) < .5, `plateau's east foot: ${shadeAt(hill, -10.5, -17)}`);
});

test('per-map sun: Deadwater keeps its sun, blob lean and shadow box exactly', () => {
 assert.deepEqual({ ...mapLook(maps.deadwater).sunOffset }, { x: -24, y: 40, z: -18 });
 assert.deepEqual({ ...mapLook({}).sunOffset }, { x: -24, y: 40, z: -18 });
 assert.deepEqual(sunLean(BASE_LOOK.sunOffset), { x: .6, z: .45 });
 assert.deepEqual(shadowDepth(BASE_LOOK.sunOffset), { near: 20, far: 82 });
 // A low sun reaches further toward the sun, so tall things up-sun still cast into view.
 const low = mapLook(map).sunOffset, depth = shadowDepth(low), length = Math.hypot(low.x, low.y, low.z);
 assert.ok(length - depth.near > 40 && depth.far === length + 32, JSON.stringify(depth));
 const way = sunWay(low);
 assert.ok(Math.abs(Math.atan(way.rise) * 180 / Math.PI - 20) < 1.5, 'Test Hill: a sun about 20 degrees up');
 assert.ok(way.x < -.8 && way.z > .2, 'from the west-south-west');
});

// A shader with every #include the patches and their neighbours look for.
function fakeShader() {
 return { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
}

test('terrain mesh: one patched material, no vertex colours, textures baked at load', () => {
 const view = { sunOffset: mapLook(map).sunOffset, groundMaterials: new Set(), initialQuality: 'balanced' };
 const group = buildTerrainMesh(view, ground, map, .02);
 const material = view.terrainMaterial;
 assert.ok(group.children.length > 0 && group.children.every(t => t.material === material && !t.geometry.attributes.color));
 assert.equal(material.vertexColors, false);
 assert.deepEqual(material.userData.patches.map(p => p.key), ['ground-layers', 'hill-shade-groundSunLeft']);
 const key = material.customProgramCacheKey();
 assert.equal(key, 'look|ground-layers|hill-shade-groundSunLeft');
 assert.equal(view.groundLook.texel, GROUND_TEXEL.balanced);
 assert.ok(view.groundLook.colour.image.width > 0 && view.groundLook.shade.shade.length > 0);
 // The hill shade rides in the colour texture's alpha: the plateau's east foot is in it.
 const { image } = view.groundLook.colour, box = view.groundLook.uniforms.groundLookBox.value;
 const alphaAt = (x, z) => image.data[(Math.floor((z - box.y) * box.w * image.height) * image.width + Math.floor((x - box.x) * box.z * image.width)) * 4 + 3];
 assert.ok(alphaAt(-10.5, -17) < 128 && alphaAt(36, -34) === 255, `alpha ${alphaAt(-10.5, -17)} / ${alphaAt(36, -34)}`);
 // The patched shader keeps every #include later hooks look for (Extreme's
 // clouds replace lights_fragment_begin and look for its sun line).
 const shader = fakeShader();
 material.onBeforeCompile(shader);
 for (const include of ['#include <begin_vertex>', '#include <color_fragment>', '#include <lights_fragment_begin>', '#include <shadowmap_pars_fragment>', '#include <map_fragment>'])
  assert.ok((include === '#include <begin_vertex>' ? shader.vertexShader : shader.fragmentShader).includes(include), include);
 assert.ok(shader.uniforms.groundLook && !shader.uniforms.hillShade);
 assert.match(shader.fragmentShader, /hillSunLeft = groundSunLeft;/);
 assert.equal(shader.fragmentShader.match(/texture2D\( groundLook/g).length, 1);
 assert.equal(shader.vertexShader.match(/varying vec2 vLookWorld/g).length, 1);
 assert.equal(shader.fragmentShader.match(/varying vec2 vLookWorld/g).length, 1);
 assert.match(shader.fragmentShader, /#define getShadow hillShadow/);
 assert.match(shader.fragmentShader, /#define getDirectionalLightInfo hillDirectionalLightInfo/);
 // A finer preset rebuilds the tiles with the same material and a finer texture; a coarser one keeps it.
 view.qualityName = 'quality';
 buildTerrainMesh(view, ground, map, .01);
 assert.equal(view.terrainMaterial, material);
 assert.equal(view.groundLook.texel, GROUND_TEXEL.quality);
 assert.equal(material.customProgramCacheKey(), key);
 view.qualityName = 'potato';
 buildTerrainMesh(view, ground, map, .01);
 assert.equal(view.groundLook.texel, GROUND_TEXEL.quality);
});

test('patches chain: one onBeforeCompile, each patch once, a stable program key', () => {
 const material = new THREE.MeshStandardMaterial(), uniforms = { hillShade: { value: null }, hillShadeBox: { value: new THREE.Vector4() } };
 addPatch(material, hillShadePatch(uniforms)); addPatch(material, hillShadePatch(uniforms));
 assert.equal(material.userData.patches.length, 1);
 const later = shader => { shader.fragmentShader += '\n// later'; }; later.key = 'later';
 addPatch(material, later);
 const shader = fakeShader(); material.onBeforeCompile(shader);
 assert.ok(shader.fragmentShader.endsWith('// later') && shader.fragmentShader.includes('hillShadow'));
 assert.equal(material.customProgramCacheKey(), 'look|hill-shade|later');
});

test("Extreme's surfaces and cloud shadows still hook into the patched terrain shader", () => {
 const view = { sunOffset: mapLook(map).sunOffset, groundMaterials: new Set(), initialQuality: 'extreme' };
 buildTerrainMesh(view, ground, map, .01);
 const material = view.terrainMaterial;
 setExtremeSurfaces({ ground: [material], surfaces: [] }, true);
 const shader = fakeShader(); material.onBeforeCompile(shader);
 assert.match(shader.fragmentShader, /directLight\.color \*= exSunLeft;/, 'cloud shadows dim the sun');
 assert.match(shader.fragmentShader, /#define getDirectionalLightInfo hillDirectionalLightInfo/, 'and so does the hill');
 assert.match(shader.fragmentShader, /diffuseColor\.rgb \*= tint;/, 'ground variation');
 assert.match(material.customProgramCacheKey(), /^look\|ground-layers\|hill-shade-groundSunLeft\|extreme-ground$/);
 setExtremeSurfaces({ ground: [material], surfaces: [] }, false);
});
