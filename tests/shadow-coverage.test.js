// The sun's shadow map covers what the camera sees, on every screen shape,
// on flat ground and on hills, with Deadwater's high sun and Hollow Wick's low
// one (render/shadow-snap.js: shadowFrame, fitShadowBox, shadowBoxOver,
// settleShadowBox). It used to be a fixed 42 x 30 m box that stopped short of
// the screen's edge (owner, 2026-09-26: "shadows near the edge of the screen
// sometimes turn off too early").
//
// Each check casts rays through the screen (edges included) into the ground,
// collects every point a ray passes within `receivers` metres above the ground
// (the ground itself, and roofs and walls standing on it), and asks that each
// is inside the box across the light, that the box is deep enough behind it,
// and that a caster up to `casters` metres over the highest ground on the line
// to the sun is not cut by the near plane.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lightBasis, shadowFrame, fitShadowBox, shadowBoxOver, settleShadowBox, SHADOW_FIT } from '../src/render/shadow-snap.js';
import { fairFov, CAMERA_TILT, OUTDOOR_CAMERA_HEIGHT } from '../src/render/camera-framing.js';
import { groundFor } from '../src/map-kit.js';
import { FLAT } from '../src/world/heightfield.js';
import { maps } from '../src/maps.js';
import { SPOTS } from '../tools/terrain-spots.mjs';

const DEADWATER_SUN = { x: -24, y: 40, z: -18 }, WICK_SUN = { x: -43, y: 17, z: 18 };
// 16:9, 21:9 (1920 x 820), a phone upright (9:19.5, 390 x 844) and on its side.
const SCREENS = { '16:9': 16 / 9, '21:9': 1920 / 820, 'phone upright': 390 / 844, 'phone sideways': 844 / 390 };
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const viewFor = (aspect, height = OUTDOOR_CAMERA_HEIGHT) => ({ height, tilt: CAMERA_TILT, fov: fairFov(aspect), aspect, near: 2 });

// Points (world) that the camera at `focus` sees within `receivers` metres
// above the ground: rays through a grid over the whole screen, marched in
// half metres down to the ground.
function seen(view, ground, focus, rows = 25) {
  const len = Math.hypot(1, view.tilt), tan = Math.tan(view.fov * Math.PI / 360), side = tan * view.aspect;
  const eye = { x: focus.x, y: focus.y + view.height, z: focus.z + view.height * view.tilt }, out = [];
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= rows; j++) {
    const u = i / rows * 2 - 1, v = j / rows * 2 - 1;
    const d = { x: u * side, y: (-1 + v * tan * view.tilt) / len, z: (-view.tilt - v * tan) / len }, dl = Math.hypot(d.x, d.y, d.z);
    for (let t = view.near; t < 400; t += .5) {
      const p = { x: eye.x + d.x / dl * t, y: eye.y + d.y / dl * t, z: eye.z + d.z / dl * t }, g = ground.heightAt(p.x, p.z);
      if (p.y < g) { out.push({ x: p.x, y: g, z: p.z }); break; }
      if (p.y - g <= SHADOW_FIT.receivers) out.push(p);
    }
  }
  return out;
}

// What of the view the box (target at `at`, the sun `sunOffset` from it)
// misses: how far outside the box across the light, past its far plane, or
// short of a caster's top at its near plane (metres; 0 = all covered).
function misses(box, basis, sunOffset, at, points, casterTop) {
  const length = Math.hypot(sunOffset.x, sunOffset.y, sunOffset.z), sun = { x: sunOffset.x / length, y: sunOffset.y / length, z: sunOffset.z / length };
  let across = 0, deep = 0, near = 0;
  for (const w of points) {
    const p = { x: w.x - at.x, y: w.y - at.y, z: w.z - at.z }, a = dot(p, basis.x), b = dot(p, basis.y), toward = dot(p, sun);
    across = Math.max(across, box.left - a, a - box.right, box.bottom - b, b - box.top);
    deep = Math.max(deep, length - toward - box.far);
    const top = toward + Math.max(0, casterTop - w.y) / sun.y;
    near = Math.max(near, box.near - (length - top));
  }
  return { across, deep, near };
}

function check(label, sunOffset, ground, focus, aspect, height) {
  const view = viewFor(aspect, height), frame = shadowFrame(sunOffset, viewFor(aspect));
  const box = settleShadowBox(null, shadowBoxOver(view, sunOffset, frame.basis, ground, focus.x, focus.y, focus.z));
  const casterTop = ground.maxY + SHADOW_FIT.casters;
  // Covered where it was fitted, and still covered after the view has moved
  // on up to a metre before the next shadow update (the margin's job).
  for (const [dx, dz] of [[0, 0], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]]) {
    const moved = { x: focus.x + dx, y: focus.y, z: focus.z + dz };
    const m = misses(box, frame.basis, sunOffset, focus, seen(view, ground, moved), casterTop);
    assert.ok(m.across <= 0 && m.deep <= 0 && m.near <= 0, `${label}: shadows cut off ${JSON.stringify(m)} (box ${JSON.stringify(box)})`);
  }
  return { box, frame };
}

const side = box => Math.max(box.right - box.left, box.top - box.bottom);

test('the old fixed 42 x 30 m box missed part of a plain 16:9 screen on Deadwater', () => {
  // The bug, kept as a check that the brute force here can see it.
  const view = viewFor(16 / 9), basis = lightBasis({ x: -DEADWATER_SUN.x, y: -DEADWATER_SUN.y, z: -DEADWATER_SUN.z });
  const old = { left: -21, right: 21, bottom: -15, top: 15, near: 20, far: 82 };
  const m = misses(old, basis, DEADWATER_SUN, { x: 0, y: 0, z: 0 }, seen(view, FLAT, { x: 0, y: 0, z: 0 }), SHADOW_FIT.casters);
  assert.ok(m.across > 3, `the old box should miss the north-west corner by metres: ${JSON.stringify(m)}`);
});

test('flat ground: every screen shape, both suns, fully covered and about as sharp as before', () => {
  for (const [name, sun] of [['Deadwater sun', DEADWATER_SUN], ['Hollow Wick sun', WICK_SUN]]) for (const [shape, aspect] of Object.entries(SCREENS)) {
    const { box } = check(`${name}, ${shape}, flat`, sun, FLAT, { x: 0, y: 0, z: 0 }, aspect);
    // The old box's long side was 42 m: the texels are about that size still
    // (a phone upright under the low sun sees a longer strip of ground).
    assert.ok(side(box) <= (name === 'Deadwater sun' ? 48 : 54), `${name}, ${shape}: box ${side(box)} m`);
  }
  // Deadwater at 16:9 is no bigger across than before, and the rolled box is
  // smaller than the old one by area even though it covers the whole screen.
  const { box } = check('Deadwater 16:9', DEADWATER_SUN, FLAT, { x: 0, y: 0, z: 0 }, 16 / 9);
  assert.ok(side(box) <= 44 && (box.right - box.left) * (box.top - box.bottom) < 42 * 30, JSON.stringify(box));
});

test('hills: Hollow Wick at its named spots, every screen shape, both suns', () => {
  const ground = groundFor(maps['hollow-wick']);
  assert.ok(!ground.flat && ground.maxY - ground.minY > 4, 'Hollow Wick has real hills');
  for (const [spotName, spot] of Object.entries(SPOTS['hollow-wick'])) {
    const focus = { x: spot.x, y: ground.heightAt(spot.x, spot.z), z: spot.z };
    for (const [name, sun] of [['Hollow Wick sun', WICK_SUN], ['Deadwater sun', DEADWATER_SUN]]) for (const [shape, aspect] of Object.entries(SCREENS)) {
      const { box } = check(`${spotName}, ${name}, ${shape}`, sun, ground, focus, aspect);
      assert.ok(side(box) <= 64, `${spotName}, ${name}, ${shape}: box ${side(box)} m`);
    }
  }
});

test('a lower camera (a room, the death camera) gets a smaller, sharper box; the pick view a bigger one', () => {
  const room = check('room camera', DEADWATER_SUN, FLAT, { x: 0, y: 0, z: 0 }, 16 / 9, 16).box;
  const outdoor = check('outdoor camera', DEADWATER_SUN, FLAT, { x: 0, y: 0, z: 0 }, 16 / 9).box;
  const pick = check('pick camera', DEADWATER_SUN, FLAT, { x: 0, y: 0, z: 0 }, 16 / 9, 44).box;
  assert.ok(side(room) < side(outdoor) && side(outdoor) < side(pick) && side(pick) <= SHADOW_FIT.maxSide);
});

test('the box holds still: flat ground never changes it, a walk over the hills rarely does', () => {
  const view = viewFor(16 / 9), frame = shadowFrame(DEADWATER_SUN, view);
  let box = null, changes = 0;
  for (let i = 0; i < 400; i++) {
    const next = settleShadowBox(box, shadowBoxOver(view, DEADWATER_SUN, frame.basis, FLAT, i * .37, 0, -i * .21));
    if (box && next !== box) changes++;
    box = next;
  }
  assert.equal(changes, 0, 'flat ground: one box for good');
  // Hollow Wick: walk spot to spot (with the camera's height lagging the
  // ground as the renderer's does), about a tenth of a metre a shadow update.
  const ground = groundFor(maps['hollow-wick']), spots = Object.values(SPOTS['hollow-wick']), wick = shadowFrame(WICK_SUN, view);
  let y = ground.heightAt(spots[0].x, spots[0].z), walked = 0; box = null; changes = 0;
  for (let k = 1; k < spots.length; k++) {
    const a = spots[k - 1], b = spots[k], steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .1);
    for (let i = 1; i <= steps; i++) {
      const x = a.x + (b.x - a.x) * i / steps, z = a.z + (b.z - a.z) * i / steps;
      y += (ground.heightAt(x, z) - y) * .15; walked += .1;
      const next = settleShadowBox(box, shadowBoxOver(view, WICK_SUN, wick.basis, ground, x, y, z), SHADOW_FIT, SHADOW_FIT.slack);
      if (box && next !== box) changes++;
      box = next;
    }
  }
  // (Without the slack it changed 27 times on this walk; with it, 2 on the
  // stage-1 ground and 6 on stage 2's, whose walk spot moved to the field's
  // east end.)
  assert.ok(changes <= walked / 45, `${changes} box changes over ${Math.round(walked)} m`);
});

test('settling: edges on whole metres, grows at once, shrinks only when far too big', () => {
  const needed = { left: -10.2, right: 9.1, bottom: -7.9, top: 8.4, near: 11.3, far: 60.2 };
  const box = settleShadowBox(null, needed);
  assert.deepEqual(box, { left: -11, right: 10, bottom: -8, top: 9, near: 10, far: 62 });
  assert.equal(settleShadowBox(box, { ...needed, right: 9.9 }), box, 'still holds: unchanged');
  assert.equal(settleShadowBox(box, { ...needed, left: -9, right: 8 }), box, 'a little too big: unchanged');
  assert.equal(settleShadowBox(box, { ...needed, right: 10.4 }).right, 11, 'grows at once');
  const shrunk = settleShadowBox(box, { left: -6, right: 6, bottom: -5, top: 5, near: 11.3, far: 60.2 });
  assert.ok(shrunk !== box && shrunk.right === 6 && shrunk.near === 10, 'far too big: shrinks (depth kept)');
  // On hills a box that has to change takes some slack, so it holds for a while.
  const roomy = settleShadowBox(box, { ...needed, right: 10.4 }, SHADOW_FIT, 1);
  assert.deepEqual(roomy, { left: -12, right: 12, bottom: -9, top: 10, near: 10, far: 62 });
  assert.equal(settleShadowBox(roomy, { ...needed, right: 10.9 }, SHADOW_FIT, 1), roomy);
  const capped = settleShadowBox(null, { left: -500, right: 500, bottom: -500, top: 500, near: 0, far: 90 });
  assert.equal(capped.right - capped.left, SHADOW_FIT.maxSide);
});

test('the rolled light frame is what three.js builds from the up vector it is given', () => {
  for (const sun of [DEADWATER_SUN, WICK_SUN]) for (const aspect of Object.values(SCREENS)) {
    const frame = shadowFrame(sun, viewFor(aspect)), again = lightBasis({ x: -sun.x, y: -sun.y, z: -sun.z }, frame.up);
    for (const axis of ['x', 'y']) for (const c of ['x', 'y', 'z'])
      assert.ok(Math.abs(again[axis][c] - frame.basis[axis][c]) < 1e-9, `${axis}.${c}`);
    assert.ok(Math.abs(dot(frame.basis.x, frame.basis.y)) < 1e-9 && Math.abs(dot(frame.basis.x, sun)) < 1e-9 && Math.abs(dot(frame.basis.y, sun)) < 1e-9);
  }
});

test('the depth bias stays a few millimetres whatever the box depth', () => {
  // renderer.js fitShadow: bias = -SHADOW_FIT.bias / (far - near), the old
  // -0.00008 over Deadwater's old 62 m depth.
  assert.ok(Math.abs(SHADOW_FIT.bias / 62 - .00008) < .000001);
});

test('the renderer fits the box before snapping to its texels, and rolls it with the screen', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const fit = src.indexOf('this.fitShadow(fx, fz)'), snap = src.indexOf('snapShadowFocus({ x: fx');
  assert.ok(fit > 0 && snap > fit, 'fitShadow runs right before the texel snap');
  assert.match(src, /cam\.up\.set\(frame\.up\.x, frame\.up\.y, frame\.up\.z\)/);
  assert.match(src, /this\.sun\.shadow\.bias = -SHADOW_FIT\.bias \/ \(box\.far - box\.near\)/);
  assert.match(src, /cam\.updateProjectionMatrix\(\)/);
});
