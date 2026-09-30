import * as THREE from 'three';

// Matte surfaces lit for less, same picture (v0.999a, owner: "double FPS ...
// looks mostly similar when I load in"; below Extreme).
//
// Nearly every surface in the game is a MeshStandardMaterial with roughness 1
// and metalness 0 (sand, wood, walls, roofs' boards, props: ~1800 meshes on
// Deadwater), yet each pixel of them ran three's full physical lighting: the
// screen-space derivatives that roughen an edge, a GGX highlight with two
// square roots, and a multiple-scattering energy term. At roughness 1 all of
// that has a closed form, so a material marked MATTE_SURFACE gets it:
//
//  - Roughness is 1 whatever the derivatives say (three clamps it to 1), so
//    they are not taken.
//  - The direct highlight: GGX's D is 1/pi at roughness 1 and Smith's
//    visibility 0.5 / (NL + NV); only the Fresnel term (Schlick, f0 0.04) is
//    left to work out. Diffuse is Lambert, as it always was.
//  - Indirect specular: with no environment map three hands it zero light
//    (radiance and iblIrradiance are both 0), so everything it computed was
//    multiplied by zero. It is skipped (kept when a map is there): that part
//    on every standard material without one (NO_ENV_SPECULAR; the roofs'
//    .88 roughness keeps its GGX highlight but loses this dead work too).
//
// The result is three's own sum up to float rounding: one 8-bit step at most,
// nowhere visible. Extreme keeps three's shader untouched (pixel-identical
// rule). Glossy, metal, mapped-roughness, physical or env-mapped materials
// are never marked. Applied at import, before any shader is compiled; in
// development it throws if three's code no longer matches.

const ROUGHNESS = /vec3 dxy = max\( abs\( dFdx\( nonPerturbedNormal \) \), abs\( dFdy\( nonPerturbedNormal \) \) \);\s*float geometryRoughness = max\( max\( dxy\.x, dxy\.y \), dxy\.z \);\s*material\.roughness = max\( roughnessFactor, 0\.0525 \);[^\n]*\s*material\.roughness \+= geometryRoughness;\s*material\.roughness = min\( material\.roughness, 1\.0 \);/;
const SPECULAR = /material\.specularColor = mix\( vec3\( 0\.04 \), diffuseColor\.rgb, metalnessFactor \);\s*material\.specularF90 = 1\.0;/;

export function patchPhysicalFragment(source) {
  if (!ROUGHNESS.test(source) || !SPECULAR.test(source)) return null;
  return source
    .replace(ROUGHNESS, all => `#ifdef MATTE_SURFACE
material.roughness = 1.0;
#else
${all}
#endif`)
    .replace(SPECULAR, all => `#ifdef MATTE_SURFACE
material.specularColor = vec3( 0.04 );
material.specularF90 = 1.0;
#else
${all}
#endif`);
}

const DEFINES = /#define RE_IndirectSpecular\s+RE_IndirectSpecular_Physical/;
const MATTE = `
#ifdef MATTE_SURFACE
void RE_Direct_Matte( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	vec3 halfDir = normalize( directLight.direction + geometryViewDir );
	float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
	float dotVH = saturate( dot( geometryViewDir, halfDir ) );
	// BRDF_GGX at roughness 1: D = 1 / pi, V = 0.5 / ( NL + NV ).
	reflectedLight.directSpecular += irradiance * F_Schlick( material.specularColor, material.specularF90, dotVH ) * ( 0.5 / max( dotNL + dotNV, EPSILON ) * RECIPROCAL_PI );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#undef RE_Direct
#define RE_Direct RE_Direct_Matte
#endif
#if defined( NO_ENV_SPECULAR ) && ! defined( USE_ENVMAP )
void RE_IndirectSpecular_Matte( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {}
#undef RE_IndirectSpecular
#define RE_IndirectSpecular RE_IndirectSpecular_Matte
#endif`;

export function patchPhysicalPars(source) {
  if (!DEFINES.test(source)) return null;
  return source.replace(DEFINES, all => all + MATTE);
}

const kept = globalThis.__deadstabMatteChunks ||= { original: {}, patched: {} };
export const ORIGINAL_MATTE_CHUNKS = kept.original, PATCHED_MATTE_CHUNKS = kept.patched;
for (const [chunk, patch] of [['lights_physical_fragment', patchPhysicalFragment], ['lights_physical_pars_fragment', patchPhysicalPars]]) {
  if (kept.patched[chunk] && THREE.ShaderChunk[chunk] === kept.patched[chunk]) continue;
  const patched = patch(THREE.ShaderChunk[chunk]);
  if (patched) { kept.original[chunk] = THREE.ShaderChunk[chunk]; THREE.ShaderChunk[chunk] = kept.patched[chunk] = patched; }
  else if (import.meta.env?.DEV) throw new Error(`matte-lighting: three.js ${chunk} changed; update the patch`);
}

// Whether a material's lighting is exactly the matte case.
export const isMatte = m => !!m && !!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial && m.roughness === 1 && m.metalness === 0
  && !m.roughnessMap && !m.metalnessMap && !m.envMap && !m.userData.keepPhysical;

// Whether its indirect specular is dead work (no environment map).
export const isUnlitByEnv = m => !!m && !!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial && !m.envMap && !m.userData.keepPhysical;

// Marks (or unmarks) a material; true when its program has to change.
export function setMatte(material, on) {
  let changed = false;
  for (const [name, want] of [['MATTE_SURFACE', !!on && isMatte(material)], ['NO_ENV_SPECULAR', !!on && isUnlitByEnv(material)]]) {
    const has = !!material.defines && name in material.defines;
    if (want === has) continue;
    if (want) (material.defines ||= {})[name] = '';
    else delete material.defines[name];
    changed = true;
  }
  if (changed) material.needsUpdate = true;
  return changed;
}
