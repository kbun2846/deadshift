// The light each doorway throws onto the street (owner, 2026-10-01: "Make
// the doorways and entrances on Lumen a little bit more prominent so you can
// tell where you can enter"). The shapes and which doorways get one are
// world/city-entrances.js's (the rooms' outer openings: what the colliders
// use); the doorway's lit header over it is the facades' (city-facades.js
// DOORWAY.strip), in the same colour (doorwayLight).
//
// One mesh for the whole map (four corners a doorway, about 85), one draw on
// every preset, one small unlit additive program: no light, no shadow,
// nothing per frame on the CPU. Like the signs' light pools (city-signs.js
// POOLS) it lies on the ground layer only (the wet mirror never draws it),
// brightens on the wet street and never under a roof (the rain's roof mask),
// and dims with the power sag. It lies on open street outside the walls, so
// the shells' cut never touches it: your own building's doorways keep their
// light while you are inside, and a doorway's light stays when its building
// is cut away above you. The shroud (vision.js, a page overlay) covers it
// like the street it lies on.
import * as THREE from 'three';
import { GROUND_LAYER, registerCitySystem } from './city-registry.js';
import { doorwayLight } from './city-facades.js';
import { ENTRANCE, entranceSpills, spillCorners } from '../world/city-entrances.js';

export const ENTRANCE_LIGHT = Object.freeze({
  lift: .03,        // m over the street (the light pools' .035 lie over it)
  fan: .2,          // the fan's light at the wall (linear, added)...
  hold: .25,        // ...held to this share of its length (a little less on), then fading out to its far end;
  holdAway: .25,    // more for a doorway facing away from the camera (its first metres are under its roof's edge on screen)
  sill: .42,        // the sill line's, across the opening's width
  wet: .12,         // added to the fan at full wetness (the sill: half of it)
  desaturate: .3,   // of the way to the light's own grey (a tint of the doorway's light, not a disc of paint)
  sagDim: .18,      // the power sag's dip (city-signs.js SIGN.sagDim's)
});
export const ENTRANCE_KEY = 'lumen-entrance-light';

const f = v => (Number.isInteger(v) ? v.toFixed(1) : String(v));
const VERTEX = `
attribute vec3 colour;
attribute vec2 local;   // s along the wall from the doorway's middle, t out from the wall's line (m)
attribute vec4 shape;   // t0, length, hw0, hw1
attribute vec2 door;     // the opening's half width, and how much of the fan's length its light holds level
uniform vec4 maskBounds;
varying vec3 vColour;
varying vec2 vLocal;
varying vec4 vShape;
varying float vHalf;
varying float vHold;
varying vec2 vMaskUv;
void main() {
  vColour = colour; vLocal = local; vShape = shape; vHalf = door.x; vHold = door.y;
  vMaskUv = (position.xz - maskBounds.xy) / (maskBounds.zw - maskBounds.xy);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAGMENT = `
uniform float wetness;
uniform float sag;
uniform sampler2D roofMask;
varying vec3 vColour;
varying vec2 vLocal;
varying vec4 vShape;
varying float vHalf;
varying float vHold;
varying vec2 vMaskUv;
void main() {
  float t = vLocal.y - vShape.x, v = clamp(t / vShape.y, 0.0, 1.0), s = abs(vLocal.x);
  float hw = mix(vShape.z, vShape.w, v);
  // The fan: full across its middle, soft to its sides; level over its first
  // part (a north door's shows only past its roof's edge), then fading out to its end.
  float side = 1.0 - smoothstep(mix(vHalf * 0.7, hw * 0.5, v), hw, s);
  float fan = side * (1.0 - smoothstep(vHold, 1.0, v)) * (1.0 - 0.35 * v);
  // The sill: a crisp bright line along the threshold, the opening's width.
  float sill = (1.0 - smoothstep(${f(ENTRANCE.sill * .6)}, ${f(ENTRANCE.sill)}, t)) * (1.0 - smoothstep(vHalf - 0.06, vHalf + 0.04, s));
  float wet = wetness * (1.0 - texture2D(roofMask, vMaskUv).r);
  float level = (fan * (${f(ENTRANCE_LIGHT.fan)} + ${f(ENTRANCE_LIGHT.wet)} * wet) + sill * (${f(ENTRANCE_LIGHT.sill)} + ${f(ENTRANCE_LIGHT.wet * .5)} * wet)) * (1.0 - ${f(ENTRANCE_LIGHT.sagDim)} * sag);
  if (level < 0.002) discard;
  gl_FragColor = vec4(vColour * level, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// The mesh's attributes for these spills ({ colour: '#rrggbb' } each): pure
// arrays, for the tests.
export function entranceGeometryData(spills) {
  const n = spills.length, position = new Float32Array(n * 12), colour = new Float32Array(n * 12), local = new Float32Array(n * 8), shape = new Float32Array(n * 16), door = new Float32Array(n * 8), index = [];
  const c = new THREE.Color(), D = ENTRANCE_LIGHT;
  spills.forEach((p, i) => {
    c.set(p.colour); const grey = .2126 * c.r + .7152 * c.g + .0722 * c.b; c.r += (grey - c.r) * D.desaturate; c.g += (grey - c.g) * D.desaturate; c.b += (grey - c.b) * D.desaturate;
    const corners = spillCorners(p), locals = [[-p.hw0, p.t0], [p.hw0, p.t0], [p.hw1, p.t1], [-p.hw1, p.t1]];
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      position.set([corners[k][0], D.lift, corners[k][1]], v * 3);
      colour.set([c.r, c.g, c.b], v * 3);
      local.set(locals[k], v * 2);
      shape.set([p.t0, p.t1 - p.t0, p.hw0, p.hw1], v * 4);
      door.set([p.half, D.hold + D.holdAway * Math.max(0, -p.nz)], v * 2);
    }
    // (wound to face up, +y)
    const [a, b] = [corners[0], corners[1]], [, , q] = corners, up = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) < 0;
    const o = i * 4;
    index.push(...(up ? [o, o + 1, o + 2, o, o + 2, o + 3] : [o, o + 2, o + 1, o, o + 3, o + 2]));
  });
  return { position, colour, local, shape, door, index };
}

export class CityEntrances {
  constructor(view, map, city) {
    this.view = view; this.city = city;
    const looks = city.shells?.looks;
    this.spills = entranceSpills(map).map(p => ({ ...p, colour: doorwayLight(looks?.get(p.building)) }));
    const data = entranceGeometryData(this.spills), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
    g.setAttribute('colour', new THREE.BufferAttribute(data.colour, 3));
    g.setAttribute('local', new THREE.BufferAttribute(data.local, 2));
    g.setAttribute('shape', new THREE.BufferAttribute(data.shape, 4));
    g.setAttribute('door', new THREE.BufferAttribute(data.door, 2));
    g.setIndex(data.index); g.computeBoundingSphere();
    // The roof mask: the rain's (city.uniforms.roofMask, set when it is made), else none.
    const u = city.uniforms, black = this.black = new THREE.DataTexture(new Uint8Array(4), 1, 1); black.needsUpdate = true;
    const roofSource = u.roofMask || { value: null };
    this.material = new THREE.ShaderMaterial({
      uniforms: { wetness: u.wetness || { value: 0 }, sag: u.sag || { value: 0 }, maskBounds: u.maskBounds || { value: new THREE.Vector4(-1, -1, 1, 1) }, roofMask: { get value() { return roofSource.value || black; }, set value(v) { roofSource.value = v; } } },
      vertexShader: VERTEX, fragmentShader: FRAGMENT, fog: false, lights: false,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.material.customProgramCacheKey = () => ENTRANCE_KEY; this.material.name = ENTRANCE_KEY;
    const mesh = this.mesh = new THREE.Mesh(g, this.material);
    mesh.name = 'lumen-entrance-light'; mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;
    // Over the street, its paint and the light pools (renderOrder 2), under the halos (4).
    mesh.renderOrder = 2.5; mesh.layers.set(GROUND_LAYER);
    view.scene?.add(mesh);
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.material.dispose(); this.black.dispose(); }
}

registerCitySystem('entrances', (view, map, city) => (map.city?.entrances ?? map.id === 'lumen') ? new CityEntrances(view, map, city) : null);
