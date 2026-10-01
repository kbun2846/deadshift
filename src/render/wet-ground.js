// Lumen's wet ground (lumen-design.md sections 10, 11, 15): the street's
// material, darkened and made glossy by the rain's wetness, with standing
// puddles that stay wet between showers, never wet under a roof, and on
// Quality and Extreme the planar mirror (ground-mirror.js) mixed in.
//
// One MeshStandardMaterial for the whole city ground: its colours are the
// ground builder's vertex colours; `color` stays white. Everything the rain
// changes is a uniform shared through `city.uniforms` (wetness, the masks, the
// mirror), so a shower never builds a shader. What differs by preset is a
// define (CITY_GLOSS, CITY_MIRROR), set in setQuality, before the warm-up.
//
// The mirror contract (ground-mirror.js relies on these names exactly):
//   mirrorMap      sampler2D, the mirror pass's colour (linear); null binds a
//                  1x1 black texture, so the program never changes
//   mirrorMatrix   mat4, world -> the mirror texture, projective: the shader
//                  samples at (m * vec4(world, 1)).xy / .w, so the matrix
//                  includes the 0.5 bias (as three's Reflector textureMatrix)
//   mirrorStrength float, 0 = no mirror pass this frame (skipped in the shader)
import * as THREE from 'three';

export const WET_GROUND = Object.freeze({
  dry: '#2c2f36',       // dry asphalt: the colour the darkening is measured from
  wet: '#24272e',       // wet asphalt (section 15)
  puddle: '#1e2129',    // standing water (section 15)
  roughness: Object.freeze({
    dry: 1,             // the material's own roughness
    wet: .55,           // wet asphalt, Balanced and up
    puddle: .15,        // standing water, Balanced and up
    dull: .85,          // Performance and Potato: a dull sheen only, cheap
  }),
  puddleDry: .75,       // how wet standing water reads between showers (1 = as in rain)
  mirror: Object.freeze({ wet: .35, puddle: .85, blurTexels: .75 }), // mirror mixed in by wetness x this x mirrorStrength
});

// The defines per preset. Extreme is Quality plus, never minus.
export const WET_GROUND_DEFINES = Object.freeze({
  potato: Object.freeze({}),
  performance: Object.freeze({}),
  balanced: Object.freeze({ CITY_GLOSS: '' }),
  quality: Object.freeze({ CITY_GLOSS: '', CITY_MIRROR: '' }),
  extreme: Object.freeze({ CITY_GLOSS: '', CITY_MIRROR: '' }),
});

export const WET_GROUND_KEY = 'lumen-wet-ground-v1';

// Bound in place of a missing texture (a mask before the rain has made it, or
// no mirror pass), so every frame uses the same program.
let black = null;
export function blackTexture() {
  if (!black) { black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat); black.needsUpdate = true; }
  return black;
}
// A uniform that reads a shared one, black while it is null.
const orBlack = source => ({ get value() { return source.value || blackTexture(); }, set value(v) { source.value = v; } });

const VERTEX_HEAD = 'varying vec3 vCityWorld;\n';
const VERTEX_BODY = `#include <project_vertex>
  vec4 cityWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    cityWorld = instanceMatrix * cityWorld;
  #endif
  vCityWorld = (modelMatrix * cityWorld).xyz;`;

const FRAGMENT_HEAD = `
varying vec3 vCityWorld;
uniform float wetness;
uniform sampler2D roofMask;
uniform sampler2D puddleMask;
uniform vec4 maskBounds;
uniform vec3 wetTint;
uniform vec3 puddleTint;
uniform sampler2D mirrorMap;
uniform mat4 mirrorMatrix;
uniform float mirrorStrength;
uniform float mirrorSrgb; // Quality's mirror holds display (sRGB) values: brought back to linear
`;

// After the vertex colours: how wet this spot is, and the darkening.
const FRAGMENT_WET = `#include <color_fragment>
  vec2 cityMaskUv = (vCityWorld.xz - maskBounds.xy) / (maskBounds.zw - maskBounds.xy);
  float cityWet = wetness * (1.0 - texture2D(roofMask, cityMaskUv).r); // a room's floor never gets wet
  float cityPool = texture2D(puddleMask, cityMaskUv).r * mix(${WET_GROUND.puddleDry.toFixed(3)}, 1.0, wetness); // standing water, even between showers
  float cityWater = max(cityWet, cityPool);
  diffuseColor.rgb *= mix(mix(vec3(1.0), wetTint, cityWet), puddleTint, cityPool);`;

const r = WET_GROUND.roughness;
const FRAGMENT_ROUGHNESS = `#include <roughnessmap_fragment>
  #ifdef CITY_GLOSS
    roughnessFactor = mix(roughnessFactor, ${r.wet.toFixed(3)}, cityWet);
    roughnessFactor = mix(roughnessFactor, ${r.puddle.toFixed(3)}, cityPool);
  #else
    roughnessFactor = mix(roughnessFactor, ${r.dull.toFixed(3)}, cityWater);
  #endif`;

// The mirror is added to the lit colour rather than mixed over it: Quality's
// mirror holds only the bright layer (black everywhere else), and a mix would
// blacken the wet street wherever no sign is reflected. The wet darkening
// above already stands for the light the water takes away.
const m = WET_GROUND.mirror;
const FRAGMENT_MIRROR = `#ifdef CITY_MIRROR
  if (mirrorStrength > 0.0) {
    vec4 cityMirrorAt = mirrorMatrix * vec4(vCityWorld, 1.0);
    vec2 cityMirrorUv = cityMirrorAt.xy / cityMirrorAt.w;
    vec2 cityTexel = ${m.blurTexels.toFixed(2)} / vec2(textureSize(mirrorMap, 0));
    vec3 citySharp = texture2D(mirrorMap, cityMirrorUv).rgb;
    vec3 cityBlurred = (citySharp
      + texture2D(mirrorMap, cityMirrorUv + vec2(cityTexel.x, cityTexel.y)).rgb
      + texture2D(mirrorMap, cityMirrorUv + vec2(-cityTexel.x, cityTexel.y)).rgb
      + texture2D(mirrorMap, cityMirrorUv + vec2(cityTexel.x, -cityTexel.y)).rgb
      + texture2D(mirrorMap, cityMirrorUv - cityTexel).rgb) * 0.2;
    // Sharp in the puddles, blurred on wet asphalt.
    vec3 cityReflection = mix(cityBlurred, citySharp, cityPool);
    cityReflection = mix(cityReflection, cityReflection * cityReflection, mirrorSrgb);
    outgoingLight += cityReflection * cityWater * mix(${m.wet.toFixed(3)}, ${m.puddle.toFixed(3)}, cityPool) * mirrorStrength;
  }
#endif
#include <opaque_fragment>`;

// Linear-space ratio of two colours: what the vertex colour is multiplied by.
const ratio = (to, from) => { const a = new THREE.Color(to), b = new THREE.Color(from); return new THREE.Vector3(a.r / b.r, a.g / b.g, a.b / b.b); };

export function wetGroundMaterial(city, { color = WET_GROUND.dry, wetColor = WET_GROUND.wet, puddleColor = WET_GROUND.puddle, quality = 'balanced' } = {}) {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: WET_GROUND.roughness.dry, metalness: 0 });
  const u = city.uniforms;
  const uniforms = {
    wetness: u.wetness, maskBounds: u.maskBounds, mirrorMatrix: u.mirrorMatrix, mirrorStrength: u.mirrorStrength, mirrorSrgb: u.mirrorSrgb ||= { value: 0 },
    roofMask: orBlack(u.roofMask), puddleMask: orBlack(u.puddleMask), mirrorMap: orBlack(u.mirrorMap),
    wetTint: { value: ratio(wetColor, color) }, puddleTint: { value: ratio(puddleColor, color) },
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace('#include <project_vertex>', VERTEX_BODY);
    shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader
      .replace('#include <color_fragment>', FRAGMENT_WET)
      .replace('#include <roughnessmap_fragment>', FRAGMENT_ROUGHNESS)
      .replace('#include <opaque_fragment>', FRAGMENT_MIRROR);
  };
  material.customProgramCacheKey = () => WET_GROUND_KEY;
  material.userData.wetUniforms = uniforms;
  // The preset's defines. MeshStandardMaterial's own STANDARD define stays.
  material.userData.setQuality = name => {
    const want = WET_GROUND_DEFINES[name] ?? WET_GROUND_DEFINES.balanced;
    const defines = { STANDARD: '', ...want };
    const same = material.defines && Object.keys(defines).length === Object.keys(material.defines).length && Object.keys(defines).every(k => k in material.defines);
    material.userData.quality = name;
    if (same) return;
    material.defines = defines; material.needsUpdate = true;
  };
  material.userData.setQuality(quality);
  (city.wetGroundMaterials ||= []).push(material);
  return material;
}
