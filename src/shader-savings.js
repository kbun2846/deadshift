import * as THREE from 'three';

// Two patches to three.js's shader source, both leaving the picture as it was.
//
// 1. Cheaper soft shadows, same picture.
//
// three.js 0.180 filters shadows by hand: every pixel of every surface that
// receives shadows reads the shadow map 17 times (PCF, Performance and
// Balanced) or 16 times (PCF Soft, Quality and Extreme), and the ground covers
// the whole screen. Nearly every pixel is either fully lit or fully shadowed,
// so this reads a few probe taps first (the corners of the filter and its
// middle), and only when they disagree -- a shadow's soft edge -- reads the
// rest. The probe taps are reused in the full filter, so an edge costs what it
// did before and the result there is exactly what three.js computed. The only
// difference: a shadow detail smaller than the filter that falls between the
// probe taps (a few texels) is missed; nothing in the scene is that thin.
//
// 2. The effects light costs nothing while it is dark. The one point light
// (muzzle flashes, blasts; view.fxLight) always stays in the scene, because the
// number of lights is compiled into every shader and adding or removing it
// would rebuild them all mid-fight. It is dark nearly all the time, yet every
// pixel still worked out its lighting: about 8% of a Balanced frame. Its
// lighting is now skipped while its colour (colour x intensity) is black. The
// test reads a uniform, so every pixel takes the same way and the branch is
// free on a GPU.
//
// Applied once, at import, before any shader is compiled. Re-check on a
// three.js upgrade: if three's code changes, the patch throws in development
// and leaves three's own version in place in a build.

const tap = offset => `texture2DCompare( shadowMap, shadowCoord.xy${offset ? ` + vec2( ${offset} )` : ''}, shadowCoord.z )`;

const PCF_OLD = /shadow = \(\s*texture2DCompare\( shadowMap, shadowCoord\.xy \+ vec2\( dx0, dy0 \)[\s\S]*?\) \* \( 1\.0 \/ 17\.0 \);/;
const PCF_NEW = `float probe = ${tap('dx0, dy0')} + ${tap('dx1, dy0')} + ${tap('dx0, dy1')} + ${tap('dx1, dy1')} + ${tap('')};
			if ( probe == 0.0 || probe == 5.0 ) shadow = probe * 0.2;
			else shadow = ( probe +
				${['0.0, dy0', 'dx2, dy2', '0.0, dy2', 'dx3, dy2', 'dx0, 0.0', 'dx2, 0.0', 'dx3, 0.0', 'dx1, 0.0', 'dx2, dy3', '0.0, dy3', 'dx3, dy3', '0.0, dy1'].map(tap).join(' +\n\t\t\t\t')}
			) * ( 1.0 / 17.0 );`;

const soft = offset => `texture2DCompare( shadowMap, uv${offset ? ` + ${offset}` : ''}, shadowCoord.z )`;
const PCF_SOFT_OLD = /shadow = \(\s*texture2DCompare\( shadowMap, uv, shadowCoord\.z \) \+[\s\S]*?\) \* \( 1\.0 \/ 9\.0 \);/;
const PCF_SOFT_NEW = `float s00 = ${soft('')}, s10 = ${soft('vec2( dx, 0.0 )')}, s01 = ${soft('vec2( 0.0, dy )')}, s11 = ${soft('texelSize')};
			float cA = ${soft('vec2( -dx, -dy )')}, cB = ${soft('vec2( 2.0 * dx, -dy )')};
			float cC = ${soft('vec2( -dx, 2.0 * dy )')}, cD = ${soft('vec2( 2.0 * dx, 2.0 * dy )')};
			float probe = s00 + s10 + s01 + s11 + cA + cB + cC + cD;
			if ( probe == 0.0 || probe == 8.0 ) shadow = probe * 0.125;
			else shadow = ( s00 + s10 + s01 + s11 +
				mix( ${soft('vec2( -dx, 0.0 )')}, ${soft('vec2( 2.0 * dx, 0.0 )')}, f.x ) +
				mix( ${soft('vec2( -dx, dy )')}, ${soft('vec2( 2.0 * dx, dy )')}, f.x ) +
				mix( ${soft('vec2( 0.0, -dy )')}, ${soft('vec2( 0.0, 2.0 * dy )')}, f.y ) +
				mix( ${soft('vec2( dx, -dy )')}, ${soft('vec2( dx, 2.0 * dy )')}, f.y ) +
				mix( mix( cA, cB, f.x ), mix( cC, cD, f.x ), f.y )
			) * ( 1.0 / 9.0 );`;

const POINT_BLOCK = /(for \( int i = 0; i < NUM_POINT_LIGHTS; i \+\+ \) \{\s*pointLight = pointLights\[ i \];)([\s\S]*?RE_Direct\( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight \);)/;
export function patchLightsChunk(source) {
  if (!POINT_BLOCK.test(source)) return null;
  return source.replace(POINT_BLOCK, (all, head, body) => `${head}\n\t\tif ( pointLight.color.r + pointLight.color.g + pointLight.color.b > 0.0 ) {${body}\n\t\t}`);
}

export function patchShadowChunk(source) {
  if (!PCF_OLD.test(source) || !PCF_SOFT_OLD.test(source)) return null;
  return source.replace(PCF_OLD, PCF_NEW).replace(PCF_SOFT_OLD, PCF_SOFT_NEW);
}

// Three's own versions, kept for comparison tests. Idempotent: a second copy of
// this module (a dev server reload) finds the chunks already patched.
const kept = globalThis.__deadshiftShaderChunks ||= { original: {}, patched: {} };
export const ORIGINAL_CHUNKS = kept.original, PATCHED_CHUNKS = kept.patched;
for (const [chunk, patch] of [['shadowmap_pars_fragment', patchShadowChunk], ['lights_fragment_begin', patchLightsChunk]]) {
  if (kept.patched[chunk] && THREE.ShaderChunk[chunk] === kept.patched[chunk]) continue;
  const patched = patch(THREE.ShaderChunk[chunk]);
  if (patched) { kept.original[chunk] = THREE.ShaderChunk[chunk]; THREE.ShaderChunk[chunk] = kept.patched[chunk] = patched; }
  else if (import.meta.env?.DEV) throw new Error(`shader-savings: three.js ${chunk} changed; update the patch`);
}
