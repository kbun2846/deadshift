// The browser half of tools/contrast-check.mjs: imported into the running game
// (Vite serves it, so it shares the game's three.js) to lay flat test swatches
// on the ground, paint test light pools into the ground's own texture, and
// read the rendered screen. Dev only: it needs window.__capture (?capture=
// thumbnail). Not part of the game.
//
// Two ways to use it:
//   lab   the world is hidden (lights and the ground stay) and the ground's
//         texture is painted with a chosen ground colour and a row of light
//         pools. The wet-ground material, the rain's wetness, fog, tone
//         mapping, the preset's mirror and post passes are all the game's own.
//   real  nothing is hidden: swatches are laid at a spot on the map, on
//         whatever the ground, lamps and signs make there.
import * as THREE from 'three';
import { groundBounds } from '/src/world/city-ground.js';
import { wetnessAt } from '/src/effects/rain.js';

const SWATCH_SIZE = .6;        // m, the square's side
const PITCH = 1.05;            // m between swatch centres
const COLUMNS = 5;
const LIFT = .03;              // m above the ground (markings sit at .012)
// Ground samples for a swatch: rings of points at these distances (Chebyshev,
// from its centre) in metres, every ~.1 m round; clear of the swatch's edge
// (.3) and of its neighbours' (at .75).
const RING = [.42, .5, .58];
const RING_STEP = .1;
const INNER = .15;             // m: the part of the swatch that is averaged

export class Stage {
  constructor(capture, options = {}) {
    this.view = capture.view; this.sim = capture.sim; this.map = capture.map;
    this.lab = options.lab !== false;
    this.sunIntensity = this.view.look.sunIntensity;
    this.keepers = new Set();
    this.group = new THREE.Group(); this.group.name = 'contrast-stage';
    this.view.scene.add(this.group);
    this.ground = this.view.scene.getObjectByName('city-ground');
    this.installed = false;
    const l = this.view.look;
    this.original = { sky: l.sky, bounce: l.bounce, skyIntensity: l.skyIntensity, sun: l.sun, sunIntensity: l.sunIntensity, haze: l.haze, fogNear: l.fogNear, fogFar: l.fogFar, exposure: l.exposure, grade: l.grade ? { ...l.grade } : null };
    this.gradeOriginal = null; this.bloomOriginal = null;
  }

  // Hide the HUD and the player; in lab mode also keep every world object
  // but the ground and the lights hidden, every frame (the game shows them
  // again as it culls and updates).
  prepare() {
    const canvas = this.view.renderer.domElement;
    for (const el of document.querySelectorAll('body *')) if (el !== canvas && !el.contains(canvas)) el.style.visibility = 'hidden';
    if (this.installed) return;
    this.installed = true;
    const view = this.view, scene = view.scene, stage = this;
    const keep = o => {
      if (o.isLight || o === stage.group || o === stage.ground || o.isCamera) return true;
      // A group holding lights stays: hiding it would change the light count
      // and rebuild every shader.
      let holds = stage.keepers.has(o.uuid) ? 1 : 0;
      if (!holds) { o.traverse(x => { if (x.isLight) holds = 2; }); if (holds === 2) stage.keepers.add(o.uuid); }
      return holds > 0;
    };
    const drawFrame = view.drawFrame.bind(view);
    view.drawFrame = (...args) => {
      if (view.player) view.player.visible = false;
      if (stage.lab) for (const o of scene.children) if (!keep(o)) o.visible = false;
      return drawFrame(...args);
    };
    if (this.lab && this.ground) for (const child of this.ground.children.slice(1)) child.visible = false; // markings
  }

  // Try another look without editing the map: the same fields as a map's
  // `look` (sky, bounce, skyIntensity, sun, sunIntensity, haze, fogNear,
  // fogFar, exposure, grade, and Extreme's bloom: { strength, radius, threshold }). Sets the lights, fog, exposure and (Extreme)
  // the grade pass in place. The sun's direction is left alone.
  applyLook(o) {
    const v = this.view;
    // The grade pass's own defaults are kept the first time, so `current` can come back.
    if (v.post?.grade && !this.gradeOriginal) this.gradeOriginal = Object.fromEntries(Object.keys(v.post.grade.uniforms).filter(k => k !== 'tDiffuse').map(k => [k, v.post.grade.uniforms[k].value]));
    if (v.post?.bloom && !this.bloomOriginal) this.bloomOriginal = { strength: v.post.bloom.strength, radius: v.post.bloom.radius, threshold: v.post.bloom.threshold };
    if (!o) o = { ...this.original, grade: this.gradeOriginal, bloom: this.bloomOriginal };
    else o = { ...o, grade: this.gradeOriginal ? { ...this.gradeOriginal, ...(o.grade || {}) } : o.grade, bloom: this.bloomOriginal ? { ...this.bloomOriginal, ...(o.bloom || {}) } : o.bloom };
    const hemi = v.scene.children.find(c => c.isHemisphereLight);
    Object.assign(v.look, o);
    if (o.sky) hemi.color.set(o.sky);
    if (o.bounce) hemi.groundColor.set(o.bounce);
    if (o.skyIntensity != null) hemi.intensity = o.skyIntensity;
    if (o.sun) v.sun.color.set(o.sun);
    if (o.sunIntensity != null) { v.sun.intensity = o.sunIntensity; this.sunIntensity = o.sunIntensity; }
    if (o.exposure != null) v.renderer.toneMappingExposure = o.exposure;
    if (o.haze) { v.scene.fog.color.set(o.haze); v.renderer.setClearColor(o.haze); }
    if (o.fogNear != null) v.scene.fog.near = o.fogNear;
    if (o.fogFar != null) v.scene.fog.far = o.fogFar;
    if (o.bloom && v.post?.bloom) for (const k of ['strength', 'radius', 'threshold']) if (o.bloom[k] != null) v.post.bloom[k] = o.bloom[k];
    if (o.grade && v.post?.grade) for (const [k, val] of Object.entries(o.grade)) if (v.post.grade.uniforms[k]) v.post.grade.uniforms[k].value = val;
    return v.look;
  }

  // The ground's own paint texture, kept so each stage starts from the original.
  paintTarget() {
    const mesh = this.ground?.children[0], texture = mesh?.material.map, canvas = texture?.image;
    if (!canvas) throw new Error('the ground has no paint texture');
    if (!this.backup) { this.backup = document.createElement('canvas'); this.backup.width = canvas.width; this.backup.height = canvas.height; this.backup.getContext('2d').drawImage(canvas, 0, 0); }
    return { canvas, texture };
  }

  // Lab: fill the stage rectangle with a ground colour and paint a pool under
  // each cell the way the map paints its own (world/lumen-ground.js
  // poolShapes: the tint screened over the ground in three rings whose alphas
  // add up to the full tint at the centre). Here the rings are flat discs
  // wide enough to hold the whole swatch set, so every swatch lies in the
  // full-strength centre, the worst case. cells: [{ x, z, colour|null }].
  paintStage(rect, ground, cells, { blend = 'screen', alphas = [.3, .38, .46] } = {}) {
    const rings = [[4.2, alphas[0]], [3.8, alphas[1]], [3.4, alphas[2]]];
    const { canvas, texture } = this.paintTarget(), ctx = canvas.getContext('2d');
    const [x0, z0, x1, z1] = groundBounds(this.map), sx = canvas.width / (x1 - x0), sz = canvas.height / (z1 - z0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.backup, 0, 0);
    ctx.fillStyle = ground; ctx.fillRect((rect.x0 - x0) * sx, (rect.z0 - z0) * sz, (rect.x1 - rect.x0) * sx, (rect.z1 - rect.z0) * sz);
    ctx.globalCompositeOperation = blend;
    for (const c of cells) {
      if (!c.colour) continue;
      ctx.fillStyle = c.colour;
      for (const [radius, alpha] of rings) { ctx.globalAlpha = alpha; ctx.beginPath(); ctx.arc((c.x - x0) * sx, (c.z - z0) * sz, radius * sx, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    texture.needsUpdate = true;
  }

  // How the map paints its pools: the tints per tone, the blend of the rings
  // and their alphas (world/lumen-ground.js POOL_TINTS, POOL_RINGS, poolShapes).
  async mapPools() {
    const m = await import('/src/world/lumen-ground.js');
    // (A pool is a radial glow of the tint in the normal blend, full strength at its centre; the lab's flat discs stand for that centre.)
    return { tints: { ...m.POOL_TINTS }, blend: m.POOL_BLEND || 'source-over', alphas: [1, 1, 1] };
  }

  // Lay the swatches: `defs` = [{ colour, lit }] laid COLUMNS across, in the
  // grid round each centre in `centres` [{ x, z }]. Returns the flat list of
  // { cell, index, x, z } in world metres.
  place(defs, centres) {
    if (this.lit) { this.group.remove(this.lit, this.unlit); this.lit.dispose(); this.unlit.dispose(); }
    const geometry = new THREE.PlaneGeometry(SWATCH_SIZE, SWATCH_SIZE).rotateX(-Math.PI / 2);
    // Coats and hats are the game's MeshStandardMaterial (roughness 1); blood
    // splats and rings are MeshBasicMaterial. White; the colour is per instance.
    const litMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
    const unlitMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const perCell = defs.length, total = perCell * centres.length;
    this.lit = new THREE.InstancedMesh(geometry, litMaterial, total); this.unlit = new THREE.InstancedMesh(geometry, unlitMaterial, total);
    for (const mesh of [this.lit, this.unlit]) { mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 2; mesh.receiveShadow = true; }
    const m = new THREE.Matrix4(), c = new THREE.Color(), list = [], rows = Math.ceil(perCell / COLUMNS);
    let nl = 0, nu = 0;
    centres.forEach((centre, cell) => defs.forEach((d, index) => {
      const x = centre.x + ((index % COLUMNS) - (COLUMNS - 1) / 2) * PITCH, z = centre.z + (Math.floor(index / COLUMNS) - (rows - 1) / 2) * PITCH;
      m.makeTranslation(x, this.groundHeight(x, z) + LIFT, z); c.set(d.colour);
      if (d.lit) { this.lit.setMatrixAt(nl, m); this.lit.setColorAt(nl++, c); } else { this.unlit.setMatrixAt(nu, m); this.unlit.setColorAt(nu++, c); }
      list.push({ cell, index, x, z });
    }));
    this.lit.count = nl; this.unlit.count = nu;
    for (const mesh of [this.lit, this.unlit]) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; this.group.add(mesh); }
    this.list = list;
    return list;
  }

  groundHeight() { return 0; } // Lumen's ground is flat

  // Put the player (the camera's focus) at a spot and cut the camera there.
  focusOn(x, z) {
    Object.assign(this.sim.player, { x, z, vx: 0, vz: 0 }); this.view.cameraCut = true;
  }

  // The weather clock (a wet clock: s into the 240 s cycle) and the moon.
  condition({ clock, sun }) {
    this.sim.worldClock = clock;
    this.view.sun.intensity = sun ? this.sunIntensity : 0;
    this.expectedWetness = wetnessAt(clock);
  }

  // Resolve after `frames` more frames, once the wetness has caught up.
  settle(frames = 6, timeout = 30000) {
    const uniforms = this.view.city?.uniforms, start = performance.now();
    return new Promise(resolve => {
      let n = 0;
      const tick = () => {
        n++;
        const wet = uniforms ? uniforms.wetness.value : this.expectedWetness;
        if ((n >= frames && Math.abs(wet - this.expectedWetness) < .02) || performance.now() - start > timeout) resolve({ frames: n, wetness: wet });
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  // Which swatches can be seen: paint them all magenta, and count how much of
  // each one's inner box is magenta in a screenshot (a roof, a wall's top or a
  // car in front of it covers it, and then its "reading" would be of that).
  // Lit swatches keep their shading, so the test is on hue, not on 255,0,255.
  magenta(on) {
    const c = new THREE.Color('#ff00ff'), original = this.originalColours ||= [];
    for (const mesh of [this.lit, this.unlit]) {
      if (!mesh.instanceColor) continue;
      const a = mesh.instanceColor.array;
      if (on) { original.push(new Float32Array(a)); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } }
      else { a.set(original.shift()); }
      mesh.instanceColor.needsUpdate = true;
    }
    if (!on) original.length = 0;
  }
  async visible(png64, boxes) {
    const bytes = Uint8Array.from(atob(png64), c => c.charCodeAt(0)), bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bitmap, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return boxes.map(s => {
      const xa = Math.max(0, Math.round(s.x0)), xb = Math.min(width - 1, Math.round(s.x1)), ya = Math.max(0, Math.round(s.y0)), yb = Math.min(height - 1, Math.round(s.y1));
      let n = 0, m = 0;
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { const k = (y * width + x) * 4, r = data[k], g = data[k + 1], b = data[k + 2]; n++; if (r > 70 && b > 70 && g < Math.min(r, b) * .45) m++; }
      return n ? m / n : 0;
    });
  }

  // Pixel boxes and ground sample points for each swatch, from the camera.
  measure() {
    const camera = this.view.camera, canvas = this.view.renderer.domElement, rect = canvas.getBoundingClientRect(), v = new THREE.Vector3();
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    const px = (x, y, z) => { v.set(x, y, z).project(camera); return [rect.left + (v.x + 1) / 2 * rect.width, rect.top + (1 - v.y) / 2 * rect.height]; };
    return this.list.map((s, k) => {
      const y = this.groundHeight(s.x, s.z) + LIFT;
      const box = [[-INNER, -INNER], [INNER, -INNER], [INNER, INNER], [-INNER, INNER]].map(([dx, dz]) => px(s.x + dx, y, s.z + dz));
      const xs = box.map(p => p[0]), ys = box.map(p => p[1]);
      const ring = [];
      for (const d of RING) {
        const steps = Math.max(8, Math.round(8 * d / RING_STEP));
        for (let i = 0; i < steps; i++) {
          const t = i / steps * 4, side = Math.floor(t), f = t - side; // walk the square ring's four sides
          const dx = side === 0 ? -d + 2 * d * f : side === 1 ? d : side === 2 ? d - 2 * d * f : -d;
          const dz = side === 0 ? -d : side === 1 ? -d + 2 * d * f : side === 2 ? d : d - 2 * d * f;
          ring.push(px(s.x + dx, this.groundHeight(s.x + dx, s.z + dz), s.z + dz));
        }
      }
      return { cell: s.cell, index: s.index, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), ring };
    });
  }

  // Decode a screenshot (PNG bytes as base64) and average the swatch boxes and
  // the 3x3 blocks at each ground sample. Returns [{ mean, ring: [[r,g,b]] }].
  async sample(png64, boxes) {
    const bytes = Uint8Array.from(atob(png64), c => c.charCodeAt(0)), bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bitmap, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const block = (cx, cy, hx, hy) => {
      const xa = Math.max(0, Math.round(cx - hx)), xb = Math.min(width - 1, Math.round(cx + hx)), ya = Math.max(0, Math.round(cy - hy)), yb = Math.min(height - 1, Math.round(cy + hy));
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { const k = (y * width + x) * 4; r += data[k]; g += data[k + 1]; b += data[k + 2]; n++; }
      return n ? [r / n, g / n, b / n] : null;
    };
    return boxes.map(s => {
      const onScreen = s.x0 > 2 && s.y0 > 2 && s.x1 < width - 2 && s.y1 < height - 2;
      return { onScreen, mean: onScreen ? block((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (s.x1 - s.x0) / 2, (s.y1 - s.y0) / 2) : null, ring: onScreen ? s.ring.map(p => block(p[0], p[1], 1, 1)).filter(Boolean) : [] };
    });
  }

  info() {
    const v = this.view;
    return { preset: v.qualityName, look: { sky: v.look.sky, bounce: v.look.bounce, skyIntensity: v.look.skyIntensity, sun: v.look.sun, sunIntensity: v.look.sunIntensity, haze: v.look.haze, exposure: v.look.exposure, fogNear: v.look.fogNear, fogFar: v.look.fogFar, grade: v.look.grade || null }, size: [innerWidth, innerHeight], post: !!v.post };
  }
}
