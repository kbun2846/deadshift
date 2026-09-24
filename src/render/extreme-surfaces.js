// Extreme's surface detail, added to the existing materials' shaders rather
// than as more geometry or bigger textures.
//
// Ground (terrain, lots, road): the 4 m sand tile repeats, and from this
// height a repeat reads as wallpaper. Two layers of slow world-space noise
// (every ~20 m and ~8 m) lighten sun-bleached stretches and darken packed
// earth, so no two patches match, and a scatter of small round pebbles adds
// grit at walking scale.
//
// Everything else that is plain-coloured or timber (buildings, roofs, props,
// the player, fences): dust settles on the lowest half-metre of every object
// in the ground's own colour, faint vertical weathering streaks run down
// walls, and upward faces get worn, sun-bleached patches. It ties objects into the ground they stand on instead of looking set
// on top of it.
//
// Cloud shadows (both kinds): big soft shadows of high cumulus drift across
// the whole map with the wind (east, the way the tumbleweeds roll), dimming
// only the sun's light, so shade under them stays shade and a building's own
// shadow reads through. A few noise reads per pixel; no geometry, no pass.
//
// Both are compiled only while Extreme is on (the EXTREME_SURFACE define),
// so every other preset runs exactly the shader it ran before.
import * as THREE from 'three';

const NOISE = `
 float exHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
 float exNoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(exHash(i), exHash(i + vec2(1.0, 0.0)), u.x), mix(exHash(i + vec2(0.0, 1.0)), exHash(i + vec2(1.0, 1.0)), u.x), u.y);
 }`;

// Seconds, advanced by the renderer while Extreme is on (tickExtremeSurfaces).
const CLOUD_TIME = { value: 0 };
export function tickExtremeSurfaces(seconds) { CLOUD_TIME.value = seconds % 3600; }

// How much of the sun a cloud takes (0..1) at a world point: two octaves,
// about 50 m across, drifting ~3.5 m/s east, a third of the sky covered.
const CLOUDS = `
 uniform float exTime;
 float exCloud(vec2 wp){
  vec2 p = (wp - vec2(exTime * 3.5, exTime * .6)) * .02;
  float n = exNoise(p) * .65 + exNoise(p * 2.3 + 11.0) * .35;
  return smoothstep(.5, .72, n) * .38;
 }`;
// After the sun's light (and its shadow map) is read, before it lights the surface.
const SUN_LINE = 'getDirectionalLightInfo( directionalLight, directLight );';
const lightsWithClouds = () => THREE.ShaderChunk.lights_fragment_begin.replace(SUN_LINE, SUN_LINE + '\n\t\tdirectLight.color *= exSunLeft;');

const GROUND = `
 #ifdef EXTREME_SURFACE
 {
  vec2 wp = vExWorld.xz;
  float macro = exNoise(wp * .05) * .6 + exNoise(wp * .13 + 17.0) * .4;
  vec3 tint = mix(vec3(.86, .83, .81), vec3(1.09, 1.06, 1.01), smoothstep(.15, .85, macro));
  tint *= mix(.95, 1.05, exNoise(wp * 1.1 + 3.0));
  // Pebbles and grit: one chance per 33 cm cell, placed off-centre in it,
  // each a few centimetres across so they still read from the camera.
  vec2 cell = floor(wp * 3.0), local = fract(wp * 3.0) - .5;
  float roll = exHash(cell);
  vec2 offset = vec2(exHash(cell + 7.1), exHash(cell + 3.7)) - .5;
  float size = .09 + .08 * exHash(cell + 1.3);
  float pebble = step(roll, .14) * (1.0 - smoothstep(size * .7, size, length(local - offset * .45)));
  tint *= 1.0 - pebble * mix(.16, .3, exHash(cell + 9.2));
  diffuseColor.rgb *= tint;
 }
 #endif`;

const WEATHERED = `
 #ifdef EXTREME_SURFACE
 {
  // The dust colour of the ground, in linear space.
  vec3 dust = vec3(.43, .29, .17);
  float low = 1.0 - smoothstep(.0, .55, vExWorld.y);
  float patchy = .65 + .35 * exNoise(vExWorld.xz * 2.3 + vExWorld.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, dust * (.8 + .4 * exNoise(vExWorld.xz * 6.0)), low * patchy * .38);
  // Weathering down vertical faces only.
  float upright = 1.0 - abs(vExNormal.y);
  float streak = exNoise(vec2((vExWorld.x + vExWorld.z) * 7.0, vExWorld.y * .6));
  diffuseColor.rgb *= 1.0 - upright * smoothstep(.55, .95, streak) * .09;
  diffuseColor.rgb *= mix(.975, 1.025, exNoise(vExWorld.xz * .35 + vExWorld.y * .2));
  // Tops (roofs, crate lids, boardwalks) are what this camera sees most:
  // worn, sun-bleached patches so no two roofs read as the same sheet.
  float top = max(vExNormal.y, 0.0);
  diffuseColor.rgb *= mix(1.0, .9 + .18 * exNoise(vExWorld.xz * 1.1 + 5.0), top * .7);
 }
 #endif`;

function install(material, fragment, kind) {
 if (material.userData.extremeSurface) return;
 material.userData.extremeSurface = true;
 const before = material.onBeforeCompile, key = material.customProgramCacheKey.bind(material);
 // Ground and surfaces share this hook's source text, which is what three
 // keys programs on by default; name the kind so they never share a program.
 material.customProgramCacheKey = () => key() + '|extreme-' + kind;
 material.onBeforeCompile = (shader, renderer) => {
  before?.call(material, shader, renderer);
  if (!('EXTREME_SURFACE' in (material.defines || {}))) return;
  shader.vertexShader = 'varying vec3 vExWorld;\nvarying vec3 vExNormal;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
   {
    vec4 exPosition = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
    exPosition = instanceMatrix * exPosition;
    #endif
    vExWorld = (modelMatrix * exPosition).xyz;
    vExNormal = normalize(mat3(modelMatrix) * objectNormal);
   }`);
  shader.uniforms.exTime = CLOUD_TIME;
  let fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + fragment);
  // Lit materials only (Lambert, Standard): the sun is dimmed under a cloud.
  if (fragmentShader.includes('#include <lights_fragment_begin>') && THREE.ShaderChunk.lights_fragment_begin.includes(SUN_LINE))
   fragmentShader = fragmentShader.replace('#include <lights_fragment_begin>', 'float exSunLeft = 1.0 - exCloud(vExWorld.xz);\n' + lightsWithClouds());
  shader.fragmentShader = 'varying vec3 vExWorld;\nvarying vec3 vExNormal;\n' + NOISE + '\n' + CLOUDS + '\n' + fragmentShader;
 };
}

// `ground` and `surfaces` are materials; `on` switches the detail in or out.
export function setExtremeSurfaces({ ground, surfaces }, on) {
 const apply = (material, fragment, kind) => {
  if (!material || material.isShaderMaterial) return;
  install(material, fragment, kind);
  material.defines ||= {};
  const has = 'EXTREME_SURFACE' in material.defines;
  if (on === has) return;
  if (on) material.defines.EXTREME_SURFACE = ''; else delete material.defines.EXTREME_SURFACE;
  material.needsUpdate = true;
 };
 for (const m of ground) apply(m, GROUND, 'ground');
 for (const m of surfaces) apply(m, WEATHERED, 'surface');
}
