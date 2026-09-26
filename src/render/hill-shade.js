// The hills' own shade: where the ground itself stands between a point and
// the sun (the terrain casts nothing in the shadow map; its tiles are too big
// and the sun's box too small to hold a long dusk shadow).
//
// Baked once at load over the drawn height grid, about a metre a texel: from
// each texel the ground is walked toward the sun, and the highest rise seen
// on the way (as a slope, height over distance) is compared with the sun's
// own slope. Close to it is a soft band, not a hard line, so a far crest
// throws a wider, softer edge than a near one (a real penumbra does the
// same); a light blur takes the texel steps out. 1 is full sun, 0 none.
//
// It only ever dims the sun's direct light, never the sky's (hillShadePatch):
// ground in a hill's shade keeps the ambient light, and a building's shadow
// falling into it does not darken it twice (the sun left is the smaller of
// the shadow map's and the hill's).
//
// Pure: heights in, arrays out, and shader text; the view makes textures.
// The terrain carries the shade in its colour texture's alpha (one read per
// pixel; ground-layers.js). Props and players can take the same shade later:
// a RedFormat texture of the bake's `data`, and `hillShadePatch` with its
// uniforms on their material (it reads the world position in its own
// varying; instanced meshes are handled), or `shadeSampler` for one value
// per object on the CPU.

// The sun's way from an offset (the sun's position from what it lights):
// the flat direction toward it and its rise per metre.
export function sunWay(offset) {
 const flat = Math.hypot(offset.x, offset.z) || 1;
 return { x: offset.x / flat, z: offset.z / flat, rise: offset.y / flat };
}

// A Ground's drawn heights (Int16 mm) as metres, for the bakes.
export function heightsOf(ground) {
 const heights = new Float32Array(ground.drawn.length);
 for (let i = 0; i < heights.length; i++) heights[i] = ground.drawn[i] * .001;
 return { heights, cols: ground.cols, rows: ground.rows, cell: .5, minX: ground.minX, minZ: ground.minZ };
}

// Bilinear over a height grid (metres), clamped to its edge.
export function sampler({ heights, cols, rows, cell, minX, minZ }) {
 const per = 1 / cell, lastC = cols - 1, lastR = rows - 1;
 return (x, z) => {
  let fx = (x - minX) * per, fz = (z - minZ) * per;
  if (!(fx > 0)) fx = 0; else if (fx > lastC) fx = lastC;
  if (!(fz > 0)) fz = 0; else if (fz > lastR) fz = lastR;
  let c = Math.floor(fx), r = Math.floor(fz);
  if (c >= lastC) c = lastC - 1; if (r >= lastR) r = lastR - 1;
  const tx = fx - c, tz = fz - r, i = r * cols + c;
  const a = heights[i], b = heights[i + 1], d = heights[i + cols], e = heights[i + cols + 1];
  const top = a + (b - a) * tx;
  return top + (d + (e - d) * tx - top) * tz;
 };
}

// `grid`: heightsOf(ground). `sunOffset`: { x, y, z }. Returns { shade
// (Float32Array 0..1), data (Uint8Array 0..255), width, height, originX,
// originZ, texel, ms }; texel (i, j) covers origin + [i, i + 1) * texel.
export function bakeHillShade(grid, sunOffset, { texel = 1, soft = .06, bias = .04, blur = 1, reach = 90 } = {}) {
 const start = now();
 const at = sampler(grid), { heights, cols, rows, cell, minX, minZ } = grid;
 const maxX = minX + (cols - 1) * cell, maxZ = minZ + (rows - 1) * cell;
 const width = Math.max(1, Math.ceil((maxX - minX) / texel)), height = Math.max(1, Math.ceil((maxZ - minZ) / texel));
 let top = -Infinity; for (let i = 0; i < heights.length; i++) if (heights[i] > top) top = heights[i];
 const sun = sunWay(sunOffset), low = sun.rise - soft, step = cell;
 const shade = new Float32Array(width * height);
 for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
  const x = minX + (i + .5) * texel, z = minZ + (j + .5) * texel, h = at(x, z) + bias;
  // Past this distance nothing on the map can rise into the soft band.
  const far = low > 0 ? Math.min(reach, (top - h) / low) : reach;
  let steepest = -Infinity;
  for (let d = step; d <= far; d += step) {
   const px = x + sun.x * d, pz = z + sun.z * d;
   if (px < minX || px > maxX || pz < minZ || pz > maxZ) break;
   const slope = (at(px, pz) - h) / d;
   if (slope > steepest) steepest = slope;
  }
  shade[j * width + i] = 1 - smooth(sun.rise - soft, sun.rise + soft, steepest);
 }
 for (let pass = 0; pass < blur; pass++) blurInPlace(shade, width, height);
 const data = new Uint8Array(shade.length);
 for (let k = 0; k < shade.length; k++) data[k] = Math.round(shade[k] * 255);
 return { shade, data, width, height, originX: minX, originZ: minZ, texel, ms: now() - start };
}

const now = () => globalThis.performance?.now?.() ?? Date.now();
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// One 1-2-1 pass each way (edges repeat).
function blurInPlace(values, width, height) {
 const line = new Float32Array(Math.max(width, height));
 for (let j = 0; j < height; j++) {
  const row = j * width;
  for (let i = 0; i < width; i++) line[i] = values[row + i];
  for (let i = 0; i < width; i++) values[row + i] = (line[Math.max(0, i - 1)] + 2 * line[i] + line[Math.min(width - 1, i + 1)]) * .25;
 }
 for (let i = 0; i < width; i++) {
  for (let j = 0; j < height; j++) line[j] = values[j * width + i];
  for (let j = 0; j < height; j++) values[j * width + i] = (line[Math.max(0, j - 1)] + 2 * line[j] + line[Math.min(height - 1, j + 1)]) * .25;
 }
}

// uv = (world.xz - box.xy) * box.zw, for a bake's texture.
export const boxOf = bake => [bake.originX, bake.originZ, 1 / (bake.width * bake.texel), 1 / (bake.height * bake.texel)];

// -- Shader patches ---------------------------------------------------------
// A material whose look is patched keeps its patches in
// material.userData.patches (each a function of the shader, with a `key`),
// all run in order by one onBeforeCompile; the program key names them, so a
// patched material has one program per preset and never shares one with an
// unpatched material. Other hooks (Extreme's surfaces, the interior clip) may
// wrap this onBeforeCompile later: they call it first, and the patches below
// leave every #include they look for in place.
export function addPatch(material, patch) {
 if (!material.userData.patches) {
  const patches = material.userData.patches = [];
  material.onBeforeCompile = (shader, renderer) => { for (const p of patches) p(shader, renderer); };
  material.customProgramCacheKey = () => 'look|' + patches.map(p => p.key).join('|');
 }
 if (!material.userData.patches.some(p => p.key === patch.key)) material.userData.patches.push(patch);
 material.needsUpdate = true;
 return material;
}

// The world position (x, z) in a varying, once per shader, for any patch.
export function addWorldXZ(shader) {
 if (shader.vertexShader.includes('vLookWorld')) return;
 shader.vertexShader = 'varying vec2 vLookWorld;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
 {
  vec4 lookPosition = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  lookPosition = instanceMatrix * lookPosition;
  #endif
  vLookWorld = (modelMatrix * lookPosition).xz;
 }`);
 shader.fragmentShader = 'varying vec2 vLookWorld;\n' + shader.fragmentShader;
}

// The sun's direct light takes min(shadow map, hill shade); nothing else
// changes. Done with two wrappers instead of editing three's lights chunk, so
// hooks that patch that chunk after this one (Extreme's cloud shadows) still
// find it as they expect: getDirectionalLightInfo reads the hill shade, and
// the shadow read for the sun (getShadow) takes the smaller of the two. With
// no shadow map (Potato) the hill shade is simply multiplied in.
const HILL_LIGHT = source => `
#if NUM_DIR_LIGHTS > 0
 float hillSunLeft = 1.0;
 void hillDirectionalLightInfo( const in DirectionalLight light, out IncidentLight lightOut ) {
  getDirectionalLightInfo( light, lightOut );
  hillSunLeft = ${source};
  #if !( defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0 )
  lightOut.color *= hillSunLeft;
  #endif
 }
 #define getDirectionalLightInfo hillDirectionalLightInfo
 #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
 float hillShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
  float sunLeft = hillSunLeft; hillSunLeft = 1.0;
  return min( getShadow( shadowMap, shadowMapSize, shadowIntensity, shadowBias, shadowRadius, shadowCoord ), sunLeft );
 }
 #define getShadow hillShadow
 #endif
#endif`;

// Where the sun left comes from: its own texture (`uniforms`: { hillShade:
// { value: texture of a bake's data, RedFormat }, hillShadeBox: { value:
// Vector4(...boxOf(bake)) } }, shared by every material that takes it), or,
// with `source`, a float a patch before this one has already worked out (the
// terrain reads it from its colour texture's alpha: one texture read, not two).
export function hillShadePatch(uniforms, { source } = {}) {
 const patch = shader => {
  addWorldXZ(shader);
  let fragment = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n'
   + HILL_LIGHT(source || 'texture2D( hillShade, ( vLookWorld - hillShadeBox.xy ) * hillShadeBox.zw ).r'));
  if (!source) { Object.assign(shader.uniforms, uniforms); fragment = 'uniform sampler2D hillShade; uniform vec4 hillShadeBox;\n' + fragment; }
  shader.fragmentShader = fragment;
 };
 patch.key = source ? 'hill-shade-' + source : 'hill-shade';
 return patch;
}

// A bake's shade at any point (bilinear between texel centres), 0..1.
export function shadeSampler(bake) {
 const { shade, width, height, originX, originZ, texel } = bake;
 return (x, z) => {
  const fx = Math.max(0, Math.min(width - 1, (x - originX) / texel - .5)), fz = Math.max(0, Math.min(height - 1, (z - originZ) / texel - .5));
  const c = Math.min(Math.max(0, width - 2), Math.floor(fx)), r = Math.min(Math.max(0, height - 2), Math.floor(fz)), tx = fx - c, tz = fz - r;
  const c1 = Math.min(width - 1, c + 1), r1 = Math.min(height - 1, r + 1);
  const a = shade[r * width + c], b = shade[r * width + c1], d = shade[r1 * width + c], e = shade[r1 * width + c1];
  const top = a + (b - a) * tx;
  return top + (d + (e - d) * tx - top) * tz;
 };
}
