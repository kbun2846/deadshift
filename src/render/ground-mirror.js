// Lumen's wet-ground mirror (lumen-design.md sections 11, 12, 15, 17): what
// the wet street reflects, by preset.
//
//   Extreme      a planar mirror of the whole lit scene in the ground plane,
//                drawn every frame at half the drawing buffer's size
//   Quality      the same pass, bright layer only (neon, screens, lamps, car
//                and signal lights, player rings) at a quarter size, on black
//   Balanced     no pass: baked reflection streak cards under the brightest
//                emitters, one instanced draw, faded by wetness
//   Performance, Potato   nothing (the wet ground only darkens and dulls)
//
// The pass does not draw anything itself. The ground's material
// (wet-ground.js) samples `city.uniforms.mirrorMap` at `mirrorMatrix * world`
// and adds it to its lit colour by wetness, puddles and `mirrorStrength`; this
// system only fills those three uniforms. On a flat map a planar mirror is
// exact: the scene seen from the camera reflected in y = 0 is what a still
// puddle shows.
//
// LAYERS. The ground is the mirror, so the pass must not draw it, nor
// anything lying flat on it (marks, decals, the streak cards, splash rings):
// they would show up as a copy of the street under the street. Anything flat
// on the ground calls `object.layers.set(GROUND_LAYER)`. It must be `set`,
// not `enable`: an object that keeps layer 0 is still seen by the mirror's
// camera. The main camera enables GROUND_LAYER (the lead's hook in
// renderer.js), so the screen still shows all of it. Note that three's
// shadow cameras and Raycasters look at layer 0 by default: a ground mesh on
// GROUND_LAYER alone casts no shadow and is not hit by rays unless they
// enable the layer too.
//
// SHADER PROGRAMS. A program's key includes the output colour space and tone
// mapping, which three takes from the render target: an ordinary target gets
// linear output and no tone mapping, so the first mirror draw would have built
// a second program for every material in view. The mirror's target is
// flagged `isXRRenderTarget` (as crisp-output.js and extreme-post.js do) so
// three treats it as an output, and its colour space is whatever the main
// pass draws with on that preset:
//   Quality  the main pass draws into crisp-output's sRGB-flagged RGBA8 target
//            (or the canvas, same key): the mirror is sRGB-flagged RGBA8, tone
//            mapped and sRGB encoded exactly like the screen. Its bytes are
//            display values; `city.uniforms.mirrorSrgb` is 1 so the ground can
//            bring them back to linear (see the report: c * c is plenty).
//   Extreme  the main pass draws into the composer's linear-flagged half-float
//            target: the mirror is the same (linear, half float, tone mapped
//            per material), so it reuses those programs, and neon drawn with
//            toneMapped: false keeps its over-1 brightness in the reflection,
//            which the composer's bloom then picks up from the ground.
// `warm(renderer)` draws the pass once inside the warm-up (everything shown),
// so anything the pass still needs is built at load.
//
// LIGHTS. three only counts a light that shares a layer with the camera, and
// the light count is in every program key. Quality's camera sees only
// BRIGHT_LAYER, so every light in the scene gets BRIGHT_LAYER enabled (once
// per preset, before the first pass and in warm()): the pass is lit exactly
// as the screen is, with the same programs. Nothing on the screen changes
// (the lights keep layer 0).
//
// SHADOWS. The pass never draws the shadow map: autoUpdate and needsUpdate are
// held false for the pass and restored, so a shadow refresh the main pass is
// due still happens there.
import * as THREE from 'three';
import { BRIGHT_LAYER, registerCitySystem } from './city-registry.js';
import { blackTexture } from './wet-ground.js';

// Everything lying flat on the street (the ground itself, marks, decals,
// streak cards). Layer 1 is prop-instances.js's ray-only layer, 3 BRIGHT_LAYER.
import { GROUND_LAYER } from './city-registry.js';
export { GROUND_LAYER };

export const MIRROR = Object.freeze({
  // What each preset reflects (section 11). Extreme is Quality plus.
  modes: Object.freeze({ potato: 'none', performance: 'none', balanced: 'streaks', quality: 'bright', extreme: 'full' }),
  // The pass's size as a share of the drawing buffer, per side (half: a quarter
  // of the pixels). The ground blurs wet asphalt over a few texels anyway.
  scale: Object.freeze({ bright: .25, full: .5 }),
  // How strongly the ground adds the reflection (wet-ground.js scales it by
  // wetness and puddles too). Quality's bright-only image is a touch softer.
  strength: Object.freeze({ bright: .8, full: 1 }),
  minSize: 8,     // px, the smallest target side (a tiny window)
  clipBias: 0,    // three's Reflector default: nothing drawn sits on the plane (the ground is excluded)
});

// Balanced's baked streaks: a real wet street stretches each light's
// reflection into a streak running from under the light towards the viewer.
// Where the light's own reflection lands is exact: for a light h up and a
// camera H up and D away along the ground, D * h / (H + h) from the light's
// foot towards the camera. The streak runs from a little behind that point
// to `tail` past it. All of that is worked out in the vertex shader from the
// camera's position, so the CPU does nothing per frame.
export const STREAKS = Object.freeze({
  max: 48,               // cards: the brightest emitters get them, the rest none
  minHeight: .6,         // m: a light nearer the ground than this reflects as a pool, not a streak
  width: Object.freeze([.35, 1.1]),  // m across at the widest, from a small light to a big one
  widthPerReach: .07,    // m of width per m of the emitter's reach
  tail: Object.freeze([1.5, 7]),     // m the streak runs on past the reflection point
  tailPerReach: .45,
  behind: .35,           // share of the tail that also runs back towards the light
  peak: .22,             // where along the card it is brightest (0 start .. 1 end)
  gain: .5,              // colour x intensity x this is what one card adds
  intensityCap: 3,       // an emitter brighter than this counts as this
  wet: .55,              // how strongly wet asphalt shows a streak ..
  puddle: 1.3,           // .. and standing water
  lift: .025,            // m above the street (under the rain's rings at .03)
  segments: 8,           // rows along the card: the brightness profile is in vertex colours
  renderOrder: 2,
});

export const STREAK_KEY = 'lumen-mirror-streaks-v1';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// The virtual camera and the matrix the ground samples with, for the real
// camera `camera` (its matrixWorld current). Follows three's Reflector
// (examples/jsm/objects/Reflector.js) for a mirror at y = 0 facing up,
// including its oblique near plane (Lengyel), so nothing below the street is
// drawn into the reflection. Writes into `mirror.camera` and `mirror.matrix`;
// allocates nothing. Returns false when the camera is at or below the street
// (there is nothing to reflect).
export function reflectCamera(camera, mirror, clipBias = MIRROR.clipBias) {
  const { camera: virtual, matrix, scratch: s } = mirror;
  s.cameraPosition.setFromMatrixPosition(camera.matrixWorld);
  if (s.cameraPosition.y <= 0) return false;
  s.rotation.extractRotation(camera.matrixWorld);
  // The eye, reflected.
  virtual.position.set(s.cameraPosition.x, -s.cameraPosition.y, s.cameraPosition.z);
  // What it looks at (a point one metre ahead), reflected.
  s.lookAt.set(0, 0, -1).applyMatrix4(s.rotation).add(s.cameraPosition);
  s.target.set(s.lookAt.x, -s.lookAt.y, s.lookAt.z);
  // Its up, reflected. lookAt then builds an ordinary (right-handed) camera,
  // so triangles keep their winding; the picture is flipped left to right,
  // which the projective lookup below accounts for.
  virtual.up.set(0, 1, 0).applyMatrix4(s.rotation);
  virtual.up.y = -virtual.up.y;
  virtual.lookAt(s.target);
  virtual.near = camera.near; virtual.far = camera.far; // far: WebGLBackground reads it
  virtual.updateMatrixWorld();
  virtual.projectionMatrix.copy(camera.projectionMatrix);
  // World -> mirror texture: bias x projection x view (the ground is at the
  // origin, so no model matrix). Taken before the near plane is bent: the
  // oblique change only touches depth, never where a point lands.
  matrix.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1);
  matrix.multiply(virtual.projectionMatrix).multiply(virtual.matrixWorldInverse);
  // The near plane moved onto the street (in the virtual camera's space).
  s.plane.set(s.up, 0).applyMatrix4(virtual.matrixWorldInverse);
  s.clip.set(s.plane.normal.x, s.plane.normal.y, s.plane.normal.z, s.plane.constant);
  const e = virtual.projectionMatrix.elements;
  s.q.set((Math.sign(s.clip.x) + e[8]) / e[0], (Math.sign(s.clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
  s.clip.multiplyScalar(2 / s.clip.dot(s.q));
  e[2] = s.clip.x; e[6] = s.clip.y; e[10] = s.clip.z + 1 - clipBias; e[14] = s.clip.w;
  virtual.projectionMatrixInverse.copy(virtual.projectionMatrix).invert();
  return true;
}

// Everything reflectCamera works with, made once.
export function mirrorState() {
  return {
    camera: new THREE.PerspectiveCamera(),
    matrix: new THREE.Matrix4(),
    scratch: {
      cameraPosition: new THREE.Vector3(), rotation: new THREE.Matrix4(), lookAt: new THREE.Vector3(), target: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0), plane: new THREE.Plane(), clip: new THREE.Vector4(), q: new THREE.Vector4(),
    },
  };
}

// The pass's render target for a mode (1 x 1 until the first frame sizes it).
export function mirrorTarget(mode) {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: mode === 'full' ? THREE.HalfFloatType : THREE.UnsignedByteType,
    depthBuffer: true, stencilBuffer: false, generateMipmaps: false, samples: 0,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });
  // Drawn like the main pass on that preset (see the top of the file).
  target.isXRRenderTarget = true;
  if (mode === 'full') target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  else { target.texture.colorSpace = THREE.SRGBColorSpace; target.texture.internalFormat = 'RGBA8'; }
  target.texture.name = 'lumen-mirror';
  return target;
}

// One card: rows along the streak (y 0 start .. 1 end), three columns across
// (x -1 edge, 0 middle, 1 edge). The brightness profile lives in the vertex
// colours: black at both edges and both ends, brightest at `peak` along.
export function streakGeometry(segments = STREAKS.segments, peak = STREAKS.peak) {
  const positions = [], colours = [], index = [];
  for (let row = 0; row <= segments; row++) {
    const s = row / segments;
    const glow = s <= peak ? Math.sin(s / peak * Math.PI / 2) : Math.pow(1 - (s - peak) / (1 - peak), 1.6);
    for (const x of [-1, 0, 1]) { positions.push(x, s, 0); const c = x === 0 ? glow : 0; colours.push(c, c, c); }
  }
  for (let row = 0; row < segments; row++) {
    const a = row * 3;
    // Wound so the card faces up once the shader lays it on the street (its
    // across axis is to the left of the way it runs, which mirrors it).
    for (let col = 0; col < 2; col++) { const i = a + col; index.push(i, i + 1, i + 3, i + 1, i + 4, i + 3); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(index);
  return geometry;
}

// The card material: additive, lit by nothing. Each instance's matrix carries
// its data rather than a transform: column 3 the light's foot (x, lift, z),
// [0].x the width, [1].y the light's height, [2].z the tail. The vertex shader
// lays the card on the street from there towards the camera.
const S = STREAKS;
const STREAK_VERTEX = `#include <project_vertex>
  vec3 cityFoot = instanceMatrix[3].xyz;
  float cityWidth = instanceMatrix[0].x, cityHeight = instanceMatrix[1].y, cityTail = instanceMatrix[2].z;
  vec2 cityToEye = cameraPosition.xz - cityFoot.xz;
  float cityDistance = length(cityToEye);
  vec2 cityAlong = cityDistance > 0.001 ? cityToEye / cityDistance : vec2(0.0, 1.0);
  vec2 cityAcross = vec2(-cityAlong.y, cityAlong.x);
  // Where the light's reflection lands, then the streak round it.
  float cityHit = cityDistance * cityHeight / max(cameraPosition.y + cityHeight, 0.001);
  float cityAt = cityHit + mix(-${S.behind.toFixed(3)}, 1.0, position.y) * cityTail;
  vec2 cityXZ = cityFoot.xz + cityAlong * cityAt + cityAcross * position.x * cityWidth * 0.5;
  vCityStreakXZ = cityXZ;
  mvPosition = viewMatrix * vec4(cityXZ.x, cityFoot.y, cityXZ.y, 1.0);
  gl_Position = projectionMatrix * mvPosition;`;

const STREAK_FRAGMENT = `
  vec2 cityMaskUv = (vCityStreakXZ - maskBounds.xy) / (maskBounds.zw - maskBounds.xy);
  float cityPool = texture2D(puddleMask, cityMaskUv).r;
  float cityOpen = 1.0 - texture2D(roofMask, cityMaskUv).r; // no wet street under a roof
  diffuseColor.a *= wetness * cityOpen * mix(${S.wet.toFixed(3)}, ${S.puddle.toFixed(3)}, cityPool);
#include <opaque_fragment>`;

// A uniform that reads a shared one, black while it is null (wet-ground.js's
// pattern): the program never changes whether or not the rain made its masks.
const orBlack = source => ({ get value() { return source.value || blackTexture(); }, set value(v) { source.value = v; } });

export function streakMaterial(city) {
  const material = new THREE.MeshBasicMaterial({
    color: '#ffffff', vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false,
  });
  const u = city.uniforms;
  const uniforms = { wetness: u.wetness, maskBounds: u.maskBounds, roofMask: orBlack(u.roofMask), puddleMask: orBlack(u.puddleMask) };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    // project_vertex computes mvPosition from the instance matrix; the
    // replacement overwrites it (and gl_Position) from the card's own maths.
    shader.vertexShader = 'varying vec2 vCityStreakXZ;\n' + shader.vertexShader.replace('#include <project_vertex>', STREAK_VERTEX);
    shader.fragmentShader = 'varying vec2 vCityStreakXZ;\nuniform float wetness;\nuniform sampler2D roofMask;\nuniform sampler2D puddleMask;\nuniform vec4 maskBounds;\n'
      + shader.fragmentShader.replace('#include <opaque_fragment>', STREAK_FRAGMENT);
  };
  material.customProgramCacheKey = () => STREAK_KEY;
  return material;
}

// The emitters that get a card: tall enough, brightest first, at most `max`.
// `order` is reused between calls.
export function pickStreakEmitters(emitters, max = STREAKS.max, order = []) {
  order.length = 0;
  for (const e of emitters) if (e && (e.y ?? 0) >= STREAKS.minHeight && (e.intensity ?? 1) > 0) order.push(e);
  order.sort((a, b) => (b.intensity ?? 1) * Math.sqrt(b.reach ?? 1) - (a.intensity ?? 1) * Math.sqrt(a.reach ?? 1));
  if (order.length > max) order.length = max;
  return order;
}

export class GroundMirror {
  constructor(view, map, city) {
    this.view = view; this.map = map; this.city = city;
    this.mode = 'none'; this.target = null;
    this.mirror = mirrorState();
    this.mirror.camera.name = 'lumen-mirror-camera';
    this.bufferSize = new THREE.Vector2();
    this.clearColour = new THREE.Color();
    this.stats = { calls: 0, triangles: 0, width: 0, height: 0 }; // the last pass's own cost (the main pass's info.autoReset wipes it)
    this.lightsTagged = false;
    // The shared uniforms this system fills (city-features.js declares the
    // first three). mirrorSrgb: 1 when the mirror holds display (sRGB) bytes.
    city.uniforms.mirrorSrgb ||= { value: 0 };

    // Balanced's cards: one instanced mesh at full size, made now; it joins
    // the scene only on Balanced (setQuality, before the warm-up).
    this.streaks = new THREE.InstancedMesh(streakGeometry(), streakMaterial(city), STREAKS.max);
    this.streaks.name = 'lumen-mirror-streaks';
    this.streaks.frustumCulled = false;   // the cards are placed in the shader; the instance matrices are data
    this.streaks.raycast = () => {};      // .. so no ray may test them as geometry
    this.streaks.renderOrder = STREAKS.renderOrder;
    this.streaks.layers.set(GROUND_LAYER);
    // The colour attribute exists from the start: it is in the program key.
    this.streaks.setColorAt(0, this.clearColour.setRGB(0, 0, 0));
    this.streaks.count = 0; this.streaks.visible = false;
    this.order = []; this.emitterCount = -1;
    this.matrix = new THREE.Matrix4(); this.colour = new THREE.Color();
    this.setQuality(view.qualityName || 'balanced');
  }

  setQuality(name) {
    const mode = MIRROR.modes[name] ?? 'none', u = this.city.uniforms;
    this.quality = name; this.lightsTagged = false;
    if (mode !== this.mode) {
      this.target?.dispose(); this.target = null;
      if (mode === 'bright' || mode === 'full') this.target = mirrorTarget(mode);
      this.mode = mode;
    }
    const pass = !!this.target;
    u.mirrorMap.value = pass ? this.target.texture : null; // null: the ground binds its 1 x 1 black
    u.mirrorStrength.value = pass ? MIRROR.strength[mode] : 0;
    u.mirrorSrgb.value = mode === 'bright' ? 1 : 0;
    // The virtual camera's layers: Quality the bright layer alone; Extreme
    // whatever the main camera sees, less the ground (set each frame).
    this.mirror.camera.layers.set(BRIGHT_LAYER);
    // The cards only on Balanced (the mirror replaces them above it).
    const scene = this.view.scene;
    if (mode === 'streaks') { if (scene && this.streaks.parent !== scene) scene.add(this.streaks); this.emitterCount = -1; this.refreshStreaks(); }
    else { this.streaks.removeFromParent(); this.streaks.visible = false; }
  }

  // Cards for the brightest emitters. Rebuilt only when the list's length
  // changes (the signs register theirs at build time).
  refreshStreaks() {
    const emitters = this.city.emitters || [];
    if (emitters.length === this.emitterCount) return false;
    this.emitterCount = emitters.length;
    const picked = pickStreakEmitters(emitters, STREAKS.max, this.order), m = this.matrix.elements;
    for (let i = 0; i < picked.length; i++) {
      const e = picked[i], reach = e.reach ?? 6;
      this.matrix.identity();
      m[0] = clamp(STREAKS.width[0] + reach * STREAKS.widthPerReach, STREAKS.width[0], STREAKS.width[1]);
      m[5] = e.y;
      m[10] = clamp(reach * STREAKS.tailPerReach, STREAKS.tail[0], STREAKS.tail[1]);
      m[12] = e.x; m[13] = STREAKS.lift; m[14] = e.z;
      this.streaks.setMatrixAt(i, this.matrix);
      this.colour.set(e.colour ?? '#ffffff').multiplyScalar(Math.min(e.intensity ?? 1, STREAKS.intensityCap) * STREAKS.gain);
      this.streaks.setColorAt(i, this.colour);
    }
    this.streaks.count = picked.length;
    this.streaks.instanceMatrix.needsUpdate = true;
    if (this.streaks.instanceColor) this.streaks.instanceColor.needsUpdate = true;
    return true;
  }

  update() {
    if (this.mode !== 'streaks') return;
    this.refreshStreaks();
    this.streaks.visible = this.streaks.count > 0 && this.city.uniforms.wetness.value > .005;
  }

  // Quality's camera sees only the bright layer; the lights join it so the
  // pass is lit (and keyed) exactly like the screen. Once per preset.
  tagLights(scene) {
    this.lightsTagged = true;
    scene.traverse(o => { if (o.isLight) o.layers.enable(BRIGHT_LAYER); });
  }

  // The pass, into the target, with the virtual camera. drawFrame calls it
  // (through city.beforeRender) before the scene is drawn; allocates nothing.
  beforeRender(renderer, scene, camera) {
    if (!this.target || !renderer || !scene || !camera) return;
    this.resize(renderer);
    camera.updateMatrixWorld();
    const mirror = this.mirror;
    if (!reflectCamera(camera, mirror)) return;
    mirror.camera.layers.mask = this.mode === 'full' ? camera.layers.mask & ~(1 << GROUND_LAYER) : 1 << BRIGHT_LAYER;
    if (this.mode === 'bright' && !this.lightsTagged) this.tagLights(scene);
    this.city.uniforms.mirrorMatrix.value.copy(mirror.matrix);
    this.draw(renderer, scene);
  }

  draw(renderer, scene) {
    const previous = renderer.getRenderTarget(), shadows = renderer.shadowMap;
    const autoUpdate = shadows.autoUpdate, needsUpdate = shadows.needsUpdate, xr = renderer.xr?.enabled;
    const bright = this.mode === 'bright';
    let clearAlpha = 1, background = null;
    if (bright) {
      // On black: only the bright things show, and the ground adds nothing elsewhere.
      renderer.getClearColor(this.clearColour); clearAlpha = renderer.getClearAlpha();
      background = scene.background; scene.background = null;
      renderer.setClearColor(0x000000, 1);
    }
    shadows.autoUpdate = false; shadows.needsUpdate = false;
    if (renderer.xr) renderer.xr.enabled = false;
    this.drawing = true; // (shadow-cache.js leaves the shadow map alone while this is set)
    try {
      renderer.setRenderTarget(this.target);
      renderer.state?.buffers?.depth?.setMask(true); // so the depth clears (three #18897)
      if (renderer.autoClear === false) renderer.clear();
      // The pass's own cost: three resets its counts at the start of each
      // render when autoReset is on; with it off (tools/perf.mjs counts the
      // whole frame) they run on, so the pass's share is the difference.
      const info = renderer.info?.render, calls = info?.calls ?? 0, triangles = info?.triangles ?? 0;
      renderer.render(scene, this.mirror.camera);
      if (info) { const whole = renderer.info.autoReset !== false; this.stats.calls = whole ? info.calls : info.calls - calls; this.stats.triangles = whole ? info.triangles : info.triangles - triangles; }
    } finally {
      shadows.autoUpdate = autoUpdate; shadows.needsUpdate = needsUpdate;
      if (renderer.xr) renderer.xr.enabled = xr;
      if (bright) { renderer.setClearColor(this.clearColour, clearAlpha); scene.background = background; }
      renderer.setRenderTarget(previous);
      this.drawing = false;
    }
  }

  // The target follows the drawing buffer (the preset's pixel ratio and any
  // adaptive scaling): half or a quarter of it per side.
  resize(renderer) {
    const size = renderer.getDrawingBufferSize(this.bufferSize), scale = MIRROR.scale[this.mode] ?? .5;
    const w = Math.max(MIRROR.minSize, Math.round(size.x * scale)), h = Math.max(MIRROR.minSize, Math.round(size.y * scale));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    this.stats.width = w; this.stats.height = h;
  }

  // Inside the warm-up's draw (everything shown, nothing culled): the pass
  // once, clipped to a pixel, so its first real frame builds nothing.
  warm(renderer) {
    if (!this.target) return;
    const { scene, camera } = this.view;
    if (!scene || !camera) return;
    this.tagLights(scene);
    this.resize(renderer);
    camera.updateMatrixWorld();
    if (!reflectCamera(camera, this.mirror)) this.mirror.camera.copy(camera, false);
    this.mirror.camera.layers.mask = this.mode === 'full' ? camera.layers.mask & ~(1 << GROUND_LAYER) : 1 << BRIGHT_LAYER;
    const t = this.target, scissorTest = t.scissorTest;
    t.scissor.set(0, 0, 1, 1); t.scissorTest = true;
    try { this.draw(renderer, scene); }
    finally { t.scissorTest = scissorTest; t.scissor.set(0, 0, t.width, t.height); }
  }

  dispose() {
    const u = this.city.uniforms;
    if (this.target && u.mirrorMap.value === this.target.texture) u.mirrorMap.value = null;
    u.mirrorStrength.value = 0; u.mirrorSrgb.value = 0;
    this.target?.dispose(); this.target = null; this.mode = 'none';
    this.streaks.removeFromParent(); this.streaks.geometry.dispose(); this.streaks.material.dispose(); this.streaks.dispose?.();
  }
}

registerCitySystem('mirror', (view, map, city) => new GroundMirror(view, map, city));
