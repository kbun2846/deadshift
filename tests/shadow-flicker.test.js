// Moving shadows on the lower presets (2026-09-30, owner: "shadows are still
// flickering often ... lower end devices ... mostly happens when player is
// moving"). The shadow map used to be drawn only at the preset's shadowFPS
// (24 a second on Performance) while bodies move every frame, so a moving
// thing's shadow trailed it by 0, 1 or 2 frames and snapped back. Now the
// preset's rate paces only the still things (shadow-cache.js shadowTick);
// the moving things are drawn on every frame they change, in the same box.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ShadowCache, SHADOW_CACHE, shadowTick } from '../src/render/shadow-cache.js';
import { settleShadowBox, shadowBoxOver, shadowFrame } from '../src/render/shadow-snap.js';
import { FLAT } from '../src/world/heightfield.js';

const SUN = { x: -24, y: 40, z: -18 };
const view = { height: 29, tilt: .62, fov: 40, aspect: 16 / 9, near: 2 };

function fakeView(size = 768) {
  const frame = shadowFrame(SUN, view);
  const sun = new THREE.DirectionalLight(); sun.shadow.camera.up.set(frame.up.x, frame.up.y, frame.up.z);
  const scene = new THREE.Scene();
  const v = { sun, scene, sunOffset: SUN, sunBasis: frame.basis, quality: { shadows: size }, shadowBox: null,
    camera: new THREE.PerspectiveCamera(),
    renderer: { shadowMap: { enabled: true, render() {} }, capabilities: { maxTextureSize: 8192 } } };
  v.fit = (x, z) => { v.shadowBox = settleShadowBox(v.shadowBox, shadowBoxOver(view, SUN, frame.basis, FLAT, x, 0, z)); };
  return v;
}

// The renderer's per-frame loop, as renderer.js runs it: ticks refit and
// follow, frames in between ask only for the moving things.
function run(fps, seconds, rate, cached, jitter = () => 0) {
  let clock = 0, full = 0, moving = 0, frames = 0;
  for (let t = 0; t < seconds; t += 1 / fps) {
    const tick = shadowTick(clock, 1 / fps + jitter(frames), rate, false, cached);
    clock = tick.clock; frames++;
    if (tick.full) full++; if (tick.moving) moving++;
    assert.ok(!(tick.full && tick.moving));
  }
  return { full, moving, frames };
}

test('with the kept map every frame draws the moving things: the rate paces only the still things', () => {
  for (const [fps, rate] of [[60, 24], [60, 30], [30, 24], [45, 16], [144, 30]]) {
    const r = run(fps, 10, rate, true);
    assert.equal(r.full + r.moving, r.frames, `${fps} fps at ${rate}: a body and its shadow are drawn on the same frame`);
    assert.ok(Math.abs(r.full - Math.min(fps, rate) * 10) <= Math.min(fps, rate) * 10 * .15 + 1, `${fps} fps: about ${rate} ticks a second (${r.full / 10})`);
  }
});

test('three\'s own redraw (Extreme) at 60 a second does not skip frames on a wobbling 60 Hz clock', () => {
  let seed = 7; const wobble = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - .5) * .0016; };
  const r = run(60, 10, 60, false, wobble);
  assert.equal(r.full, r.frames);
  assert.equal(r.moving, 0);
  // A faster screen still gets its 60.
  const fast = run(120, 10, 60, false);
  assert.ok(Math.abs(fast.full - 600) <= 2);
});

test('a forced redraw (a cut, a preset change) is a tick; no rate is a tick every frame', () => {
  assert.deepEqual(shadowTick(0, .001, 24, true, true).full, true);
  assert.deepEqual(shadowTick(0, 1 / 60, 0, false, true), { full: true, moving: false, clock: 0 });
});

test('between ticks the region, and so the box the scene samples, is the one the map was drawn for', () => {
  const v = fakeView(), cache = new ShadowCache(v); cache.active = true;
  const cam = v.sun.shadow.camera;
  const snap = () => [cam.left, cam.right, cam.bottom, cam.top, cam.near, cam.far, v.sun.position.x, v.sun.position.y, v.sun.position.z].join();
  let clock = 0, x = 0, region = null, texel = null, drawnFor = null;
  for (let i = 0; i < 240; i++) {
    x += 5.5 / 60;
    const tick = shadowTick(clock, 1 / 60, 24, i === 0, true); clock = tick.clock;
    if (tick.full) {
      v.fit(x, 7); cache.follow(x, 0, 7);
      // The box's size never changes while walking on flat ground...
      const t = [cache.region.tx, cache.region.ty].join();
      if (texel) assert.equal(t, texel); texel = t;
      // ...and the region always starts on a whole texel from the world's origin.
      const r = cache.region;
      assert.ok(Math.abs(r.a0 / r.tx - Math.round(r.a0 / r.tx)) < 1e-6 && Math.abs(r.b0 / r.ty - Math.round(r.b0 / r.ty)) < 1e-6);
      drawnFor = snap(); region = cache.region;
    } else {
      cache.movingOnly = true;
      // Nothing moves the sun or the shadow camera between ticks.
      assert.equal(snap(), drawnFor); assert.equal(cache.region, region);
    }
  }
});

test('an in-between frame draws only when something drawn as moving has changed', () => {
  const v = fakeView(), cache = new ShadowCache(v); cache.active = true;
  v.fit(0, 0); cache.follow(0, 0, 0); cache.rebuild = false;
  let updates = 0; cache.update = () => { updates++; v.sun.shadow.needsUpdate = false; cache.movingOnly = false; };
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1)); body.castShadow = true; v.scene.add(body); body.updateMatrixWorld();
  cache.drawn = new Set([body]); cache.movers(true);
  const frame = () => { cache.movingOnly = true; v.sun.shadow.needsUpdate = true; v.renderer.shadowMap.render([v.sun], v.scene, v.camera); };
  frame();
  assert.equal(updates, 0); assert.equal(cache.stats.skipped, 1); assert.equal(v.sun.shadow.needsUpdate, false);
  body.position.x += .09; body.updateMatrixWorld(); frame();
  assert.equal(updates, 1, 'moved: drawn again this frame');
  cache.movers(true); body.visible = false; frame();
  assert.equal(updates, 2, 'hidden: its shadow is taken away this frame');
  body.visible = true; cache.movers(true); v.scene.remove(body); frame();
  assert.equal(updates, 3, 'removed from the scene');
  // A tick always draws (the still things are watched then).
  cache.movers(true); cache.movingOnly = false; v.sun.shadow.needsUpdate = true; v.renderer.shadowMap.render([v.sun], v.scene, v.camera);
  assert.equal(updates, 4);
});

test('something that never stops moving stays with the moving things across a full redraw', () => {
  const v = fakeView(), cache = new ShadowCache(v); cache.active = true;
  v.fit(0, 0); cache.follow(0, 0, 0);
  const wheel = new THREE.Mesh(new THREE.BoxGeometry(4, 4, .5)); wheel.castShadow = true; v.scene.add(wheel); wheel.updateMatrixWorld();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); crate.castShadow = true; crate.position.set(3, 0, 3); v.scene.add(crate); crate.updateMatrixWorld();
  cache.classify(v.scene);
  assert.deepEqual(cache.stillRoot.children, [wheel, crate]);
  // The wheel turns: seen changed, it is drawn with the moving things.
  wheel.rotation.z += .1; wheel.updateMatrixWorld();
  cache.watch(v.scene);
  assert.deepEqual(cache.stillRoot.children, [crate]);
  // A full redraw (the region moved on) used to take it as still again, find
  // it changed on the next update and redraw everything again, every update.
  cache.classify(v.scene);
  assert.deepEqual(cache.stillRoot.children, [crate]);
  wheel.rotation.z += .1; wheel.updateMatrixWorld();
  assert.notEqual(cache.watch(v.scene), false);
  assert.equal(cache.patches.length, 0, 'no patch, no redraw');
  // Once it has been still for `calm` it is kept again.
  cache.restless.set(wheel, performance.now() / 1000 - SHADOW_CACHE.calm - .1);
  cache.classify(v.scene);
  assert.deepEqual(cache.stillRoot.children, [wheel, crate]);
});

test('the renderer moves the sun only on a tick and asks for the moving things in between', () => {
  const src = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('const tick=shadowTick('), src.indexOf('const fy = this.focus.y, snapped'));
  assert.match(block, /if\(tick\.moving\)\{shadowCache\.movingOnly=true;this\.sun\.shadow\.needsUpdate=true;\}/);
  const full = block.slice(block.indexOf('if(tick.full){'));
  assert.ok(full.includes('this.fitShadow(fx, fz)') && full.includes('this.shadowCache.follow(fx, this.focus.y, fz)') && full.includes('this.sun.position.set('));
  assert.equal((src.match(/shadowCache\.follow\(/g) || []).length, 1);
  assert.equal((src.match(/this\.fitShadow\(/g) || []).length, 1);
});
