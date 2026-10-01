// render/ground-mirror.js (Lumen stage 0): the wet street's reflection by
// preset. The mirror matrix and the virtual camera (three's Reflector maths
// for the plane y = 0), the modes and targets per preset, the pass's state
// handling, Balanced's streak cards following the emitters, and no per-frame
// allocation. No WebGL: the pass is checked against a stand-in renderer.
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
const { GroundMirror, GROUND_LAYER, MIRROR, STREAKS, reflectCamera, mirrorState, pickStreakEmitters, streakGeometry } = await import('../src/render/ground-mirror.js');
const { BRIGHT_LAYER, CITY_SYSTEMS } = await import('../src/render/city-features.js');

// The game's camera: 29 m up, tilted (camera-framing.js), 40 degree field.
function gameCamera(x = 3, z = 5, aspect = 16 / 9) {
  const camera = new THREE.PerspectiveCamera(40, aspect, .5, 180);
  camera.position.set(x, 29, z + 29 * 11.5 / 33); camera.lookAt(x, 0, z);
  camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  camera.layers.enable(GROUND_LAYER);
  return camera;
}

function fakeCity() {
  return {
    emitters: [],
    uniforms: {
      wetness: { value: 1 }, puddleMask: { value: null }, roofMask: { value: null }, maskBounds: { value: new THREE.Vector4(-1, -1, 1, 1) },
      mirrorMap: { value: null }, mirrorMatrix: { value: new THREE.Matrix4() }, mirrorStrength: { value: 0 },
    },
  };
}

// Records what the pass does to the renderer.
function fakeRenderer(width = 1600, height = 900) {
  const clear = new THREE.Color('#141828');
  const r = {
    target: null, clearAlpha: 1, autoClear: true, renders: [],
    shadowMap: { autoUpdate: true, needsUpdate: true }, xr: { enabled: false },
    info: { render: { calls: 0, triangles: 0 } },
    state: { buffers: { depth: { setMask() {} } } },
    getDrawingBufferSize: v => v.set(width, height),
    getRenderTarget: () => r.target, setRenderTarget: t => { r.target = t; },
    getClearColor: c => c.copy(clear), getClearAlpha: () => r.clearAlpha,
    setClearColor: (c, a) => { clear.set(c); r.clearAlpha = a; },
    clear() {},
    render(scene, camera) {
      r.renders.push({ target: r.target, mask: camera.layers.mask, clear: clear.getHex(), background: scene.background, shadowAuto: r.shadowMap.autoUpdate, shadowNeeds: r.shadowMap.needsUpdate, camera });
      r.info.render.calls = 7; r.info.render.triangles = 1234;
    },
    clearColour: clear,
  };
  return r;
}

function fakeView(quality = 'extreme') {
  const scene = new THREE.Scene(), camera = gameCamera();
  const sun = new THREE.DirectionalLight(), hemi = new THREE.HemisphereLight(); scene.add(sun, hemi);
  return { scene, camera, qualityName: quality, focus: new THREE.Vector3() };
}

const texcoord = (matrix, p) => { const v = new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(matrix); return new THREE.Vector2(v.x / v.w, v.y / v.w); };

test('registered as the city system "mirror"', () => {
  assert.ok(CITY_SYSTEMS.some(([flag]) => flag === 'mirror'));
  assert.notEqual(GROUND_LAYER, BRIGHT_LAYER); assert.notEqual(GROUND_LAYER, 0); assert.notEqual(GROUND_LAYER, 1);
});

test('the virtual camera is the real one reflected in the street', () => {
  for (const [x, z] of [[0, 0], [3, 5], [-20, 14]]) {
    const camera = gameCamera(x, z), mirror = mirrorState();
    assert.ok(reflectCamera(camera, mirror));
    const real = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld), virtual = new THREE.Vector3().setFromMatrixPosition(mirror.camera.matrixWorld);
    assert.ok(virtual.distanceTo(new THREE.Vector3(real.x, -real.y, real.z)) < 1e-6, 'eye reflected');
    const look = new THREE.Vector3(), mirrored = new THREE.Vector3();
    camera.getWorldDirection(look); mirror.camera.getWorldDirection(mirrored);
    assert.ok(mirrored.distanceTo(new THREE.Vector3(look.x, -look.y, look.z)) < 1e-6, 'view direction reflected');
    // A proper camera (no mirroring in its matrix), so triangles keep their winding.
    assert.ok(mirror.camera.matrixWorld.determinant() > 0);
    // Same field of view and aspect: the x and y rows of the projection are untouched by the oblique plane.
    const a = camera.projectionMatrix.elements, b = mirror.camera.projectionMatrix.elements;
    for (const i of [0, 4, 8, 12, 1, 5, 9, 13, 3, 7, 11, 15]) assert.ok(Math.abs(a[i] - b[i]) < 1e-9, `projection element ${i}`);
  }
  // A camera at or under the street has nothing to reflect.
  const low = new THREE.PerspectiveCamera(); low.position.set(0, -1, 0); low.updateMatrixWorld();
  assert.equal(reflectCamera(low, mirrorState()), false);
});

test('the mirror matrix: a street point samples the reflection of what stands over it', () => {
  const camera = gameCamera(3, 5), mirror = mirrorState();
  reflectCamera(camera, mirror);
  const eye = camera.position;
  // Signs and lamps at various heights round the view.
  for (const light of [new THREE.Vector3(3, 5, -4), new THREE.Vector3(-6, 8, 2), new THREE.Vector3(10, 2.5, 9), new THREE.Vector3(3.2, 12, 1)]) {
    // Where the camera sees the light's reflection: the line from the eye to
    // the light mirrored under the street meets y = 0 there.
    const below = new THREE.Vector3(light.x, -light.y, light.z), t = eye.y / (eye.y - below.y);
    const ground = eye.clone().lerp(below, t);
    assert.ok(Math.abs(ground.y) < 1e-9);
    // The ground's lookup there must land where the virtual camera drew the light.
    const uv = texcoord(mirror.matrix, ground);
    const plain = mirror.camera.clone(); plain.projectionMatrix.copy(camera.projectionMatrix);
    const drawn = light.clone().project(plain);
    assert.ok(Math.abs(uv.x - (drawn.x * .5 + .5)) < 1e-6 && Math.abs(uv.y - (drawn.y * .5 + .5)) < 1e-6, `light at ${light.toArray()}`);
  }
  // Every street point on screen maps inside the mirror texture.
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0], [.5, -.7]]) {
    ray.setFromCamera(new THREE.Vector2(sx * .98, sy * .98), camera);
    assert.ok(ray.ray.intersectPlane(plane, hit));
    const uv = texcoord(mirror.matrix, hit);
    assert.ok(uv.x > 0 && uv.x < 1 && uv.y > 0 && uv.y < 1, `screen ${sx},${sy} -> ${uv.toArray()}`);
    // Left and right swap in a mirror seen from above, top and bottom do not.
    if (sx) assert.ok(Math.sign(uv.x - .5) === -Math.sign(sx), 'flipped left to right');
  }
  // With the 0.5 bias: the screen centre's street point is the texture's centre.
  ray.setFromCamera(new THREE.Vector2(0, 0), camera); ray.ray.intersectPlane(plane, hit);
  const centre = texcoord(mirror.matrix, hit);
  assert.ok(Math.abs(centre.x - .5) < 1e-6 && Math.abs(centre.y - .5) < 1e-6);
});

test('the oblique near plane cuts everything under the street out of the reflection', () => {
  const camera = gameCamera(0, 0), mirror = mirrorState();
  reflectCamera(camera, mirror);
  const clip = p => new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(mirror.camera.matrixWorldInverse).applyMatrix4(mirror.camera.projectionMatrix);
  for (const [x, z] of [[0, 0], [4, -6], [-8, 5]]) {
    const above = clip(new THREE.Vector3(x, 1.5, z)), under = clip(new THREE.Vector3(x, -.5, z)), on = clip(new THREE.Vector3(x, 1e-4, z));
    assert.ok(above.z > -above.w && above.z < above.w, 'a sign above the street is drawn');
    assert.ok(on.z > -on.w, 'the street line itself is kept');
    assert.ok(under.z < -under.w, 'anything under the street is clipped');
  }
});

test('modes, targets and uniforms per preset', () => {
  const view = fakeView('potato'), city = fakeCity(), mirror = new GroundMirror(view, {}, city);
  const expect = {
    potato: { mode: 'none', target: false, strength: 0, streaks: false },
    performance: { mode: 'none', target: false, strength: 0, streaks: false },
    balanced: { mode: 'streaks', target: false, strength: 0, streaks: true },
    quality: { mode: 'bright', target: true, strength: MIRROR.strength.bright, streaks: false },
    extreme: { mode: 'full', target: true, strength: 1, streaks: false },
  };
  for (const name of ['potato', 'extreme', 'balanced', 'quality', 'performance', 'extreme', 'quality', 'potato', 'balanced']) {
    mirror.setQuality(name);
    const want = expect[name];
    assert.equal(mirror.mode, want.mode, name);
    assert.equal(!!mirror.target, want.target, name);
    assert.equal(city.uniforms.mirrorStrength.value, want.strength, name);
    assert.equal(city.uniforms.mirrorMap.value, want.target ? mirror.target.texture : null, name);
    assert.equal(mirror.streaks.parent === view.scene, want.streaks, name);
    if (want.target) {
      // Flagged as an output, like the main pass on that preset (no second program per material).
      assert.equal(mirror.target.isXRRenderTarget, true);
      if (name === 'extreme') { assert.equal(mirror.target.texture.colorSpace, THREE.LinearSRGBColorSpace); assert.equal(mirror.target.texture.type, THREE.HalfFloatType); assert.equal(city.uniforms.mirrorSrgb.value, 0); }
      else { assert.equal(mirror.target.texture.colorSpace, THREE.SRGBColorSpace); assert.equal(mirror.target.texture.internalFormat, 'RGBA8'); assert.equal(city.uniforms.mirrorSrgb.value, 1); }
    }
  }
  // Every other preset's buffers go with it.
  mirror.setQuality('extreme'); const extremeTarget = mirror.target; let disposed = false; extremeTarget.addEventListener('dispose', () => { disposed = true; });
  mirror.setQuality('performance'); assert.ok(disposed); assert.equal(mirror.target, null);
  mirror.dispose(); assert.equal(city.uniforms.mirrorStrength.value, 0); assert.equal(city.uniforms.mirrorMap.value, null);
});

test('the pass: size, layers, shadows, clear colour, and everything put back', () => {
  const view = fakeView('extreme'), city = fakeCity(), mirror = new GroundMirror(view, {}, city), renderer = fakeRenderer(1600, 900);
  const previous = { name: 'crisp' }; renderer.target = previous;
  // Extreme: half size, everything the main camera sees except the ground.
  mirror.beforeRender(renderer, view.scene, view.camera);
  let pass = renderer.renders.at(-1);
  assert.equal(pass.target, mirror.target); assert.equal(mirror.target.width, 800); assert.equal(mirror.target.height, 450);
  assert.equal(pass.mask & (1 << GROUND_LAYER), 0, 'the ground is not drawn into its own mirror');
  assert.ok(pass.mask & 1, 'the lit scene is');
  assert.equal(pass.shadowAuto, false); assert.equal(pass.shadowNeeds, false);
  assert.equal(renderer.shadowMap.autoUpdate, true); assert.equal(renderer.shadowMap.needsUpdate, true, 'the main pass still refreshes the shadows it was due to');
  assert.equal(renderer.target, previous);
  assert.equal(pass.clear, new THREE.Color('#141828').getHex(), 'Extreme reflects the haze');
  assert.ok(city.uniforms.mirrorMatrix.value.equals(mirror.mirror.matrix));
  assert.deepEqual([mirror.stats.calls, mirror.stats.triangles], [7, 1234]);
  // Quality: a quarter size, the bright layer alone, on black; the lights join that layer.
  mirror.setQuality('quality');
  mirror.beforeRender(renderer, view.scene, view.camera);
  pass = renderer.renders.at(-1);
  assert.equal(mirror.target.width, 400); assert.equal(mirror.target.height, 225);
  assert.equal(pass.mask, 1 << BRIGHT_LAYER); assert.equal(pass.clear, 0);
  assert.equal(renderer.clearColour.getHex(), new THREE.Color('#141828').getHex(), 'clear colour restored');
  view.scene.traverse(o => { if (o.isLight) assert.ok(o.layers.isEnabled(BRIGHT_LAYER) && o.layers.isEnabled(0), 'lights lit both passes'); });
  // The drawing buffer changes (adaptive resolution): the target follows.
  const small = fakeRenderer(1000, 600); mirror.beforeRender(small, view.scene, view.camera);
  assert.deepEqual([mirror.target.width, mirror.target.height], [250, 150]);
  // Balanced and below: no pass at all.
  for (const name of ['balanced', 'performance', 'potato']) {
    mirror.setQuality(name); const before = renderer.renders.length;
    mirror.beforeRender(renderer, view.scene, view.camera); mirror.warm(renderer);
    assert.equal(renderer.renders.length, before, name);
  }
  // warm(): one pass, clipped to a pixel, scissor put back.
  mirror.setQuality('extreme'); const before = renderer.renders.length;
  mirror.warm(renderer);
  assert.equal(renderer.renders.length, before + 1); assert.equal(mirror.target.scissorTest, false);
});

test('streak cards follow the emitters: brightest first, capped, rebuilt when the list grows', () => {
  const view = fakeView('balanced'), city = fakeCity(), mirror = new GroundMirror(view, {}, city);
  assert.equal(mirror.streaks.count, 0);
  mirror.update({}); assert.equal(mirror.streaks.visible, false, 'no emitters, no draw');
  const colours = ['#ff2d8a', '#fcee0a', '#3d6bff', '#2bff8a', '#e6f0ff'];
  for (let i = 0; i < 5; i++) city.emitters.push({ x: i * 4, y: 4, z: -3, colour: colours[i], intensity: 1 + i * .2, reach: 6 });
  city.emitters.push({ x: 0, y: .1, z: 0, colour: '#ffffff', intensity: 9, reach: 6 }); // a ground-level glow: no streak
  mirror.update({});
  assert.equal(mirror.streaks.count, 5); assert.equal(mirror.streaks.visible, true);
  // The instance data: foot, width, height, tail.
  const m = new THREE.Matrix4(); mirror.streaks.getMatrixAt(0, m); const e = m.elements;
  assert.deepEqual([e[12], Math.fround(e[13]), e[14]], [16, Math.fround(STREAKS.lift), -3], 'the brightest first');
  assert.equal(e[5], 4); assert.ok(e[0] >= STREAKS.width[0] && e[0] <= STREAKS.width[1]); assert.ok(e[10] >= STREAKS.tail[0] && e[10] <= STREAKS.tail[1]);
  // Dry street: nothing drawn.
  city.uniforms.wetness.value = 0; mirror.update({}); assert.equal(mirror.streaks.visible, false);
  city.uniforms.wetness.value = .6;
  // Many emitters: the cap holds, and it is the brightest that get cards.
  for (let i = 0; i < 200; i++) city.emitters.push({ x: i, y: 3, z: 10, colour: '#ff3040', intensity: i === 150 ? 50 : .5, reach: 4 });
  mirror.update({});
  assert.equal(mirror.streaks.count, STREAKS.max);
  mirror.streaks.getMatrixAt(0, m); assert.equal(m.elements[12], 150);
  // Unchanged list: no rebuild.
  mirror.streaks.instanceMatrix.version = 0; mirror.update({}); assert.equal(mirror.streaks.instanceMatrix.version, 0);
  // Only on Balanced: Quality and Extreme have the mirror.
  mirror.setQuality('quality'); assert.equal(mirror.streaks.parent, null); assert.equal(mirror.streaks.visible, false);
  mirror.setQuality('balanced'); assert.equal(mirror.streaks.parent, view.scene); assert.equal(mirror.streaks.count, STREAKS.max);
  // Flat on the street: never in a mirror pass, never hit by a ray.
  assert.equal(mirror.streaks.layers.mask, 1 << GROUND_LAYER);
  assert.deepEqual(pickStreakEmitters([], 4), []);
});

test('the card: black at the edges and ends, brightest near the start', () => {
  const g = streakGeometry(8, .25), pos = g.attributes.position, col = g.attributes.color;
  let peak = 0, peakAt = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), s = pos.getY(i), c = col.getX(i);
    if (x !== 0 || s === 0 || s === 1) assert.equal(c, 0);
    if (c > peak) { peak = c; peakAt = s; }
  }
  assert.equal(peak, 1); assert.equal(peakAt, .25);
  assert.equal(g.index.count, 8 * 2 * 6);
  // Laid on the street as the vertex shader does (across = left of the way it
  // runs), every triangle faces up, towards the camera: none back-face culled.
  for (const angle of [0, 1, 2.5, 4]) {
    const dir = new THREE.Vector2(Math.cos(angle), Math.sin(angle)), across = new THREE.Vector2(-dir.y, dir.x);
    const at = i => { const x = pos.getX(i), s = pos.getY(i), along = -1 + s * 5; return new THREE.Vector3(dir.x * along + across.x * x, 0, dir.y * along + across.y * x); };
    for (let t = 0; t < g.index.count; t += 3) {
      const [a, b, c] = [0, 1, 2].map(k => at(g.index.getX(t + k)));
      assert.ok(new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).y > 0, `triangle ${t / 3} at angle ${angle}`);
    }
  }
});

test('nothing allocated per frame: the same objects every frame, no clones', () => {
  const view = fakeView('extreme'), city = fakeCity(), mirror = new GroundMirror(view, {}, city), renderer = fakeRenderer();
  const keep = [mirror.target, mirror.mirror.camera, mirror.mirror.matrix, city.uniforms.mirrorMatrix.value, mirror.bufferSize];
  const spied = [THREE.Vector3, THREE.Vector4, THREE.Matrix4, THREE.Quaternion, THREE.Color, THREE.Plane, THREE.Euler].map(C => [C.prototype, C.prototype.clone]);
  let clones = 0;
  for (const [proto, clone] of spied) proto.clone = function () { clones++; return clone.call(this); };
  try {
    for (let i = 0; i < 200; i++) {
      view.camera.position.x += .1; view.camera.updateMatrixWorld();
      mirror.update({}); mirror.beforeRender(renderer, view.scene, view.camera);
    }
    mirror.setQuality('balanced');
    for (let i = 0; i < 50; i++) mirror.update({});
  } finally { for (const [proto, clone] of spied) proto.clone = clone; }
  assert.equal(clones, 0);
  assert.equal(keep[0], renderer.renders.at(-1).target);
  assert.equal(renderer.renders.at(-1).camera, keep[1]);
  assert.equal(mirror.mirror.matrix, keep[2]); assert.equal(city.uniforms.mirrorMatrix.value, keep[3]); assert.equal(mirror.bufferSize, keep[4]);
});
