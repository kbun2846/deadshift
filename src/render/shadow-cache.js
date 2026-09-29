import * as THREE from 'three';
import { snapShadowFocus, SHADOW_FIT } from './shadow-snap.js';

// The sun's shadow map, kept instead of redrawn (v0.999a, owner: "double FPS
// ... looks mostly similar when I load in"; Performance, Balanced, Quality).
//
// The sun never moves, and nearly everything that throws a shadow never does
// either, yet every shadow update (24-30 a second) cleared the map and drew
// every building, wall, tree, rock and prop into it again. Now:
//
//  - The map covers a *region*: the box the view needs (shadowBoxOver, as
//    before) plus MARGIN metres all round, at exactly the same texel size, on
//    a texel grid fixed to the world (whole texels from the world's origin
//    across the light). The region is drawn in full only when the view's box
//    leaves it (a few metres of walking), the texel size or the screen shape
//    changes, or the preset does.
//  - What stands still is drawn only then, and its picture of the map is
//    kept in a second texture (`pristine`, colour only).
//  - Each shadow update puts the pristine picture back only where something
//    moving was drawn last time (a texel copy, depth included), then draws
//    the moving things (players, robots, targets, grenades, a wobbling prop,
//    a falling stalk, anything not known to be still) on top, depth tested.
//  - Anything counted as still is watched (its transforms, geometry and
//    instance versions, visibility, whether it casts): when it changes it is
//    drawn with the moving things until it has been still for CALM seconds,
//    and the pristine picture is redrawn under where it was and where it
//    comes to rest (a patch: only that rectangle, only what is still).
//
// The receiving shaders are unchanged: one map, the same filter, the same
// texel size, the same few millimetres of depth bias. A texel is the same
// patch of ground from one region to the next, so a region redraw is not
// seen (no crawl, no pop). Extreme keeps three's own every-frame redraw.
//
// Hooked in through three's own shadow pass (renderer.shadowMap.render is
// wrapped): the region's static and patch draws, and the moving things, are
// three drawing the scene (or part of it) into the map as it always did, so
// every caster keeps its depth material, side, alpha test, interior clip
// and cast-only draw range (bake-colors.js castersOnlyInShadow).

export const SHADOW_CACHE = Object.freeze({
  margin: 3,        // m of region round the view's box: redrawn in full about every 3 m walked
  calm: 1,          // s a changed still thing is drawn with the moving ones before it is kept again
  maxRects: 48,     // moving things' rectangles put back per update before it puts back the lot
  maxPatches: 12,   // patches per update before the region is simply redrawn
  maxInstances: 512,// an instanced caster with more is counted as covering the whole region
});

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const sphere = new THREE.Sphere(), matrix = new THREE.Matrix4(), instanceMatrix = new THREE.Matrix4();

// Casters of an object tree: what three's shadow pass would draw.
const isCaster = o => (o.isMesh || o.isLine || o.isPoints) && o.castShadow;
function hasCaster(root, layers) { let found = false; root.traverse(o => { if (!found && isCaster(o) && o.layers.test(layers)) found = true; }); return found; }

export class ShadowCache {
  constructor(view) {
    this.view = view; this.active = false; this.region = null; this.pristine = null;
    this.roots = []; this.dirty = []; this.dirtyAll = false; this.rebuild = true;
    this.drawn = new Set(); this.pending = []; this.propRects = new WeakMap(); this.patches = [];
    this.stats = { updates: 0, rebuilds: 0, patches: 0, restored: 0 }; // (for the headless tools)
    const renderer = view.renderer, shadowMap = renderer.shadowMap, base = shadowMap.render;
    this.base = (lights, scene, camera) => base.call(shadowMap, lights, scene, camera);
    shadowMap.render = (lights, scene, camera) => {
      if (!this.active || !this.region || lights.length !== 1 || lights[0] !== view.sun || shadowMap.enabled === false) return this.base(lights, scene, camera);
      const shadow = view.sun.shadow;
      if (!shadow.needsUpdate && !shadow.autoUpdate) return;
      this.update(scene, camera);
    };
    // Putting the kept picture back: one draw of up to maxRects quads, the
    // pristine texels copied as they are and their depth written from them
    // (texture copies of depth are slow or missing on some drivers; a draw
    // works everywhere). It goes through three's shadow pass as a caster whose
    // depth material is this copy (ShaderMaterial, written straight in clip space).
    const quads = new THREE.BufferGeometry();
    quads.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SHADOW_CACHE.maxRects * 18), 3).setUsage(THREE.DynamicDrawUsage));
    quads.setDrawRange(0, 0);
    this.copy = new THREE.ShaderMaterial({
      uniforms: { pristine: { value: null } },
      vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: `#include <packing>
uniform sampler2D pristine;
void main() {
 vec4 kept = texelFetch( pristine, ivec2( gl_FragCoord.xy ), 0 );
 gl_FragColor = kept;
 gl_FragDepth = unpackRGBAToDepth( kept );
}`,
      depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth,
    });
    this.restorer = new THREE.Mesh(quads, new THREE.MeshBasicMaterial({ shadowSide: THREE.DoubleSide }));
    Object.assign(this.restorer, { castShadow: true, frustumCulled: false, matrixAutoUpdate: false, matrixWorldAutoUpdate: false, customDepthMaterial: this.copy });
    this.restorer.userData.shadowCache = true;
    // Stand-in roots for three's pass (children lists only; nothing is reparented).
    this.restoreRoot = new THREE.Object3D(); this.restoreRoot.children = [this.restorer];
    this.stillRoot = new THREE.Object3D(); this.stillRoot.children = [];
  }

  // Performance, Balanced, Quality (setQuality). Off: three's own path, as
  // before (Extreme, Potato's none).
  setEnabled(on) {
    if (this.active === on) { this.reset(); return; }
    this.active = on; this.reset();
    if (!on) {
      this.pristine?.dispose(); this.pristine = null;
      this.view.sun.shadow.getViewport(0).set(0, 0, 1, 1);
    }
  }

  // Everything drawn again at the next update (a preset change, a lost
  // context, the warm-up).
  reset() { this.region = null; this.rebuild = true; this.dirty.length = 0; this.dirtyAll = false; this.pending = []; }

  // Replaces the sun's placement each shadow update (renderer.js, right after
  // fitShadow): the region's camera, moved only when the view's box leaves it.
  follow(fx, fy, fz) {
    const view = this.view, box = view.shadowBox, size = view.quality?.shadows;
    if (!box || !size) return;
    const basis = view.sunBasis, off = view.sunOffset, length = Math.hypot(off.x, off.y, off.z);
    const sun = { x: off.x / length, y: off.y / length, z: off.z / length };
    const tx = (box.right - box.left) / size, ty = (box.top - box.bottom) / size;
    // The focus snapped to whole texels, as before (shadow-snap.js).
    const focus = snapShadowFocus({ x: fx, y: fy, z: fz }, basis, tx, ty);
    const fa = dot(focus, basis.x), fb = dot(focus, basis.y), fu = dot(focus, sun);
    // What the view needs, across the map (a, b) and along the light (u =
    // height toward the sun; the box's near/far are distances from the sun).
    const need = { a0: fa + box.left, a1: fa + box.right, b0: fb + box.bottom, b1: fb + box.top, u0: fu + length - box.far, u1: fu + length - box.near };
    let r = this.region;
    const fits = r && r.tx === tx && r.ty === ty && r.basis === basis && r.bx === basis.x.x && r.by === basis.y.x && r.size === size
      && r.a0 <= need.a0 && r.a1 >= need.a1 && r.b0 <= need.b0 && r.b1 >= need.b1 && r.u0 <= need.u0 && r.u1 >= need.u1;
    if (!fits) {
      const margin = SHADOW_CACHE.margin, max = Math.min(view.renderer.capabilities.maxTextureSize, 8192);
      // Whole texels from the world's origin, so a texel is the same patch of
      // ground in every region.
      const span = (lo, hi, t) => {
        let m = Math.ceil(margin / t), i0 = Math.floor(lo / t) - m, i1 = Math.ceil(hi / t) + m;
        while (i1 - i0 > max && m > 0) { m = Math.max(0, m - 16); i0 = Math.floor(lo / t) - m; i1 = Math.ceil(hi / t) + m; }
        return [i0, i1 - i0];
      };
      const [ia, nx] = span(need.a0, need.a1, tx), [ib, ny] = span(need.b0, need.b1, ty);
      // Along the light: the region reaches the margin further toward and
      // away from the sun (the view's box on flat ground moves with the focus).
      const slack = margin * Math.hypot(sun.x, sun.z) + SHADOW_FIT.depthStep;
      const ka = Math.round(fa / tx), kb = Math.round(fb / ty);
      r = this.region = { tx, ty, basis, bx: basis.x.x, by: basis.y.x, size, nx, ny,
        a0: ia * tx, a1: (ia + nx) * tx, b0: ib * ty, b1: (ib + ny) * ty, u0: need.u0 - slack, u1: need.u1 + slack,
        anchor: focus, left: (ia - ka) * tx, bottom: (ib - kb) * ty, near: length - (need.u1 + slack - fu), far: length - (need.u0 - slack - fu) };
      this.rebuild = true; this.stats.why = 'region';
    }
    const at = r.anchor;
    view.sun.position.set(at.x + off.x, at.y + off.y, at.z + off.z);
    view.sun.target.position.set(at.x, at.y, at.z);
    this.frame(r.left, r.left + r.nx * tx, r.bottom, r.bottom + r.ny * ty);
    // The same few millimetres of depth bias whatever the depth.
    view.sun.shadow.bias = -SHADOW_FIT.bias / (r.far - r.near);
    const mapSize = view.sun.shadow.mapSize;
    if (mapSize.x !== r.nx || mapSize.y !== r.ny) {
      view.sun.shadow.map?.dispose(); view.sun.shadow.map = null; mapSize.set(r.nx, r.ny);
    }
  }

  // The shadow camera over part (or all) of the region.
  frame(left, right, bottom, top) {
    const cam = this.view.sun.shadow.camera, r = this.region;
    if (cam.left === left && cam.right === right && cam.bottom === bottom && cam.top === top && cam.near === r.near && cam.far === r.far) return;
    Object.assign(cam, { left, right, bottom, top, near: r.near, far: r.far }); cam.updateProjectionMatrix();
  }

  // One shadow update, inside three's render (matrices are current).
  update(scene, camera) {
    const view = this.view, renderer = view.renderer, shadow = view.sun.shadow, r = this.region;
    const clear = renderer.clear, previous = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), level = renderer.getActiveMipmapLevel();
    let mode = 'all', scissor = null;
    renderer.clear = (...args) => {
      if (mode === 'none') return;
      if (mode === 'rect') { renderer.state.setScissorTest(true); renderer.state.scissor(scissor); }
      clear.apply(renderer, args);
      if (mode === 'rect') renderer.state.setScissorTest(false);
    };
    try {
      const warm = view.drawEmpty; this.stats.updates++;
      if (!shadow.map || shadow.map.width !== r.nx || shadow.map.height !== r.ny) this.rebuild = true;
      if (!this.rebuild) this.rebuild = !this.watch(scene);
      if (this.rebuild) {
        this.classify(scene); this.stats.rebuilds++;
        mode = 'all'; this.drawStill();
        this.keep(null);
        this.dirty.length = 0; this.dirtyAll = false; this.rebuild = false;
      } else if (this.patches.length) {
        mode = 'rect'; scissor = new THREE.Vector4(); this.stats.patches += this.patches.length;
        for (const p of this.patches) { scissor.set(p[0], p[1], p[2], p[3]); this.drawStill(p); }
        this.keep(this.patches);
      }
      // Put back what the moving things covered last time...
      mode = 'none';
      this.restore(warm);
      // ...and draw them where they are now.
      this.drawMoving(scene, camera);
      // The warm-up shows everything, hidden things too: drawn again after it.
      if (warm) this.rebuild = true;
    } finally {
      renderer.clear = clear;
      shadow.getViewport(0).set(0, 0, 1, 1);
      this.frame(r.left, r.left + r.nx * r.tx, r.bottom, r.bottom + r.ny * r.ty);
      shadow.updateMatrices(view.sun);
      shadow.needsUpdate = false;
      renderer.setRenderTarget(previous, face, level);
    }
  }

  // Which of the scene's top-level things are still: those that throw a
  // shadow, except the players, targets and robots (their shadows are clipped
  // indoors by interior-visibility.js, which changes with every step you
  // take: customDepthMaterial) and anything skinned. The scenery roots built
  // once and frozen (frozen-transforms.js) are trusted; the rest are watched.
  classify(scene) {
    const view = this.view, trusted = new Set([view.static, view.groundDetails, view.extraGroundDetails, view.qualityDetails, view.performanceDetails].filter(Boolean));
    const roofs = new Set((view.roofs || []).map(roof => roof.group));
    // A breakable prop's parts are drawn in its cell's merged batch
    // (prop-instances.js), whose bounds are the whole 24 m cell: watched as
    // one thing, a single crate's wobble would redraw the cell. Everything
    // that moves, hides or restores a prop calls propInstances.sync, so the
    // batches are trusted and each sync patches just that prop's rectangle
    // (where it was and where it is).
    const props = view.propInstances;
    if (props && !props.shadowCache) {
      const sync = props.sync;
      props.sync = (id, group) => { sync.call(props, id, group); this.propMoved(group); };
      props.shadowCache = this;
    }
    this.propRects = new WeakMap(); this.pending = [];
    this.roots = [];
    for (const root of scene.children) {
      if (root.isLight || root === view.player || root.userData.shadowCache) continue;
      if (!roofs.has(root) && !hasCaster(root, view.camera.layers)) continue;
      let moving = false;
      root.traverse(o => { if (o.customDepthMaterial || o.customDistanceMaterial || o.isSkinnedMesh) moving = true; });
      if (moving) continue;
      const entry = { root, trusted: trusted.has(root) || !!root.userData.propBatch, children: root.children.length, sig: [], still: true, since: 0, rect: null };
      if (!entry.trusted) { this.signature(entry, true); entry.rect = this.bounds(root); }
      this.roots.push(entry);
    }
    this.stillRoot.children = this.roots.filter(e => e.still).map(e => e.root);
  }

  // A watched thing's state as numbers (compared in place, no allocation once
  // it has its length). `fill`: write it instead of comparing. Returns true
  // when it changed.
  signature(entry, fill = false) {
    const sig = entry.sig; let i = 0, changed = false;
    const put = value => { if (fill || i >= sig.length) { sig[i] = value; if (!fill) changed = true; } else if (sig[i] !== value) { sig[i] = value; changed = true; } i++; };
    const root = entry.root;
    put(root.parent === this.view.scene ? 1 : 0);
    const walk = (o, shown) => {
      shown = shown && o.visible;
      if (o.isMesh || o.isLine || o.isPoints) {
        put(shown ? 1 : 0); put(o.castShadow ? 1 : 0); put(o.layers.mask);
        const g = o.geometry, position = g?.attributes.position;
        put(g ? g.id : -1); put(position ? position.version : -1); put(g?.index ? g.index.version : -1);
        put(g ? g.drawRange.start : 0); put(g ? g.drawRange.count : 0);
        put(o.material?.visible === false ? 0 : 1);
        if (o.isInstancedMesh) { put(o.count); put(o.instanceMatrix.version); }
        const e = o.matrixWorld.elements; for (let k = 0; k < 16; k++) put(e[k]);
      }
      for (const child of o.children) walk(child, shown);
    };
    walk(root, true);
    if (i !== sig.length) { sig.length = i; changed = !fill; }
    return changed;
  }

  // A prop moved, broke, came back or was cleared (propInstances.sync).
  propMoved(group) {
    if (!this.active || !this.region || this.rebuild) return;
    let rect = null;
    group.traverse(o => { if (isCaster(o)) rect = this.unite(rect, this.rectOf(o)); });
    const was = this.propRects.get(group);
    if (rect) this.propRects.set(group, rect);
    rect = this.unite(was, rect);
    if (rect) this.pending.push(rect);
  }

  // Checks the watched things (each update). Collects the patches: where a
  // still thing that changed was, and where a thing that has come to rest
  // now is. Returns false when the region should rather be drawn again.
  watch(scene) {
    const now = performance.now() / 1000, patches = this.patches = this.pending.splice(0);
    let changedStill = false;
    for (const entry of this.roots) {
      if (entry.trusted) { if (entry.root.children.length !== entry.children || entry.root.parent !== scene) return this.why('trusted ' + (entry.root.name || entry.root.type)); continue; }
      const changed = this.signature(entry);
      if (entry.still) {
        if (!changed) continue;
        // Drawn with the moving things from now on; the kept picture loses it.
        entry.still = false; entry.since = now; changedStill = true;
        if (entry.rect) patches.push(entry.rect);
      } else if (changed) entry.since = now;
      else if (now - entry.since >= SHADOW_CACHE.calm && entry.root.parent === scene) {
        // At rest again: kept, and the kept picture gains it where it is.
        entry.still = true; changedStill = true;
        entry.rect = this.bounds(entry.root);
        if (entry.rect) patches.push(entry.rect);
      }
    }
    if (changedStill) {
      this.roots = this.roots.filter(e => e.still || e.root.parent === scene);
      this.stillRoot.children = this.roots.filter(e => e.still).map(e => e.root);
    }
    // Overlapping patches drawn as one.
    for (let i = 0; i < patches.length; i++) for (let j = i + 1; j < patches.length; j++) {
      const a = patches[i], b = patches[j];
      if (a[0] <= b[0] + b[2] && b[0] <= a[0] + a[2] && a[1] <= b[1] + b[3] && b[1] <= a[1] + a[3]) { patches[i] = this.unite(a, b); patches.splice(j, 1); j = i; }
    }
    if (patches.length > SHADOW_CACHE.maxPatches) return this.why('patches');
    const r = this.region; let area = 0;
    for (const p of patches) area += p[2] * p[3];
    return area < r.nx * r.ny * .4 || this.why('area');
  }

  why(reason) { this.stats.why = reason; return false; }

  // The rectangle (texels: x, y, width, height) an object tree's casters can
  // touch in the region, from their bounding spheres; null if none.
  bounds(root) {
    let box = null;
    root.traverse(o => { if (isCaster(o)) box = this.unite(box, this.rectOf(o)); });
    return box;
  }

  unite(a, b) {
    if (!b) return a; if (!a) return b;
    const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]);
    return [x0, y0, Math.max(a[0] + a[2], b[0] + b[2]) - x0, Math.max(a[1] + a[3], b[1] + b[3]) - y0];
  }

  // An object's rectangle in the region, or 'all' when it cannot be bounded.
  rectOf(o) {
    const g = o.geometry; if (!g) return this.whole();
    if (o.isInstancedMesh) {
      if (o.count > SHADOW_CACHE.maxInstances) return this.whole();
      if (!g.boundingSphere) g.computeBoundingSphere();
      let box = null;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, instanceMatrix); matrix.multiplyMatrices(o.matrixWorld, instanceMatrix);
        sphere.copy(g.boundingSphere).applyMatrix4(matrix); box = this.unite(box, this.rectFor(sphere));
      }
      return box;
    }
    if (o.isSkinnedMesh || g.morphAttributes?.position?.length) return this.whole();
    // Geometry rewritten as it moves (its stored bounds would be stale); a
    // prop batch's bounds already hold every place its props can be.
    if (!g.boundingSphere || (g.attributes.position?.usage === THREE.DynamicDrawUsage && !o.userData.propBatch)) g.computeBoundingSphere();
    if (!g.boundingSphere || !Number.isFinite(g.boundingSphere.radius)) return this.whole();
    sphere.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
    return this.rectFor(sphere);
  }

  whole() { const r = this.region; return [0, 0, r.nx, r.ny]; }

  // A world sphere's square in the region's texels, a texel wider all round,
  // clipped to the region; null when it misses.
  rectFor(s) {
    const r = this.region, basis = r.basis;
    const a = dot(s.center, basis.x), b = dot(s.center, basis.y);
    const x0 = Math.max(0, Math.floor((a - s.radius - r.a0) / r.tx) - 1), x1 = Math.min(r.nx, Math.ceil((a + s.radius - r.a0) / r.tx) + 1);
    const y0 = Math.max(0, Math.floor((b - s.radius - r.b0) / r.ty) - 1), y1 = Math.min(r.ny, Math.ceil((b + s.radius - r.b0) / r.ty) + 1);
    return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
  }

  // Draws the still things into the map: the whole region (cleared first),
  // or one patch of it (`rect`, texels; that rectangle cleared and drawn,
  // the camera narrowed to it so only what touches it is drawn).
  drawStill(rect = null) {
    const view = this.view, shadow = view.sun.shadow, r = this.region;
    if (rect) {
      shadow.getViewport(0).set(rect[0] / r.nx, rect[1] / r.ny, rect[2] / r.nx, rect[3] / r.ny);
      this.frame(r.left + rect[0] * r.tx, r.left + (rect[0] + rect[2]) * r.tx, r.bottom + rect[1] * r.ty, r.bottom + (rect[1] + rect[3]) * r.ty);
    } else {
      shadow.getViewport(0).set(0, 0, 1, 1);
      this.frame(r.left, r.left + r.nx * r.tx, r.bottom, r.bottom + r.ny * r.ty);
    }
    shadow.needsUpdate = true;
    this.base([view.sun], this.stillRoot, view.camera);
  }

  // Copies the map (the still things only, just drawn) into the kept texture:
  // all of it, or the patches.
  keep(rects) {
    const view = this.view, renderer = view.renderer, gl = renderer.getContext(), r = this.region, map = view.sun.shadow.map;
    if (!this.pristine || this.pristine.width !== r.nx || this.pristine.height !== r.ny) {
      this.pristine?.dispose();
      this.pristine = new THREE.WebGLRenderTarget(r.nx, r.ny, { depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
      this.copy.uniforms.pristine.value = this.pristine.texture;
    }
    if (renderer.properties.get(this.pristine.texture).__webglTexture === undefined) renderer.initRenderTarget(this.pristine);
    renderer.setRenderTarget(map);
    renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, renderer.properties.get(map).__webglFramebuffer);
    renderer.state.bindTexture(gl.TEXTURE_2D, renderer.properties.get(this.pristine.texture).__webglTexture);
    for (const [x, y, w, h] of rects || [[0, 0, r.nx, r.ny]]) gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, x, y, x, y, w, h);
    renderer.state.unbindTexture();
    renderer.state.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  }

  // Puts the kept picture back where the moving things were drawn last time.
  restore(warm) {
    const r = this.region, rects = this.dirtyAll || this.dirty.length > SHADOW_CACHE.maxRects ? [this.whole()] : this.dirty;
    if (!rects.length && !warm) return;
    const position = this.restorer.geometry.attributes.position, p = position.array;
    let n = 0;
    for (const [x, y, w, h] of rects) {
      const x0 = x / r.nx * 2 - 1, x1 = (x + w) / r.nx * 2 - 1, y0 = y / r.ny * 2 - 1, y1 = (y + h) / r.ny * 2 - 1;
      p.set([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0], n * 18); n++;
    }
    position.needsUpdate = true; position.clearUpdateRanges(); position.addUpdateRange(0, n * 18);
    this.restorer.geometry.setDrawRange(0, n * 6); this.stats.restored += n;
    const shadow = this.view.sun.shadow; shadow.needsUpdate = true;
    this.base([this.view.sun], this.restoreRoot, this.view.camera);
  }

  // The moving things (everything but the still roots, hidden for the draw),
  // over the whole region, depth tested against the kept picture; where each
  // was drawn is noted for the next update.
  drawMoving(scene, camera) {
    const view = this.view, renderer = view.renderer, shadow = view.sun.shadow, drawn = this.drawn;
    const hidden = this.stillRoot.children, was = hidden.map(o => o.visible);
    const draw = renderer.renderBufferDirect;
    drawn.clear();
    renderer.renderBufferDirect = function (cam, s, geometry, material, object) { drawn.add(object); return draw.apply(this, arguments); };
    try {
      for (const o of hidden) o.visible = false;
      shadow.needsUpdate = true;
      this.base([view.sun], scene, camera);
    } finally {
      renderer.renderBufferDirect = draw;
      hidden.forEach((o, i) => { o.visible = was[i]; });
    }
    this.dirty.length = 0; this.dirtyAll = false;
    for (const o of drawn) {
      const rect = this.rectOf(o);
      if (!rect) continue;
      if (rect[2] === this.region.nx && rect[3] === this.region.ny) { this.dirtyAll = true; break; }
      this.dirty.push(rect);
    }
  }

  dispose() { this.pristine?.dispose(); this.pristine = null; this.restorer.geometry.dispose(); this.copy.dispose(); }
}
