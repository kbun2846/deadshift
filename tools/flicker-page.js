// Injected by tools/flicker-check.mjs into the game page (dev server, ?capture=thumbnail). Drives the
// view by hand (the game's RAF loop is stopped), renders each frame into our
// own target (colour + 24-bit depth), and compares consecutive frames by
// reprojecting through the known cameras. Static scenery that changes colour
// where the depth says it is the same surface = flicker.
window.__flickSetup = async function (opts) {
  const { view, sim } = window.__capture;
  const url = performance.getEntriesByType('resource').map(r => r.name).find(n => /deps\/three\.js/.test(n));
  const THREE = await import(url);
  window.__THREE = THREE;
  // Stop the game's loop: the next frame it asks for never comes.
  window.requestAnimationFrame = () => 0;
  await new Promise(r => setTimeout(r, 200));
  const W = opts.width, H = opts.height, renderer = view.renderer;
  const depthTexture = new THREE.DepthTexture(W, H); depthTexture.type = THREE.UnsignedIntType;
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthTexture, depthBuffer: true, samples: 0 });
  const decodeRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, depthBuffer: false });
  const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadMat = new THREE.ShaderMaterial({ uniforms: { tDepth: { value: depthTexture } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: 'uniform sampler2D tDepth; varying vec2 vUv; void main(){ gl_FragColor=vec4(texture2D(tDepth,vUv).r,0.,0.,1.); }' });
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat));
  const cam = new THREE.PerspectiveCamera(); // a copy of the view's camera per frame
  const half = new Uint16Array(W * H * 4), dep = new Float32Array(W * H * 4);
  // half float -> float table
  const HT = new Float32Array(65536);
  for (let h = 0; h < 65536; h++) { const s = h >> 15 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023; HT[h] = e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15); }
  const exposure = renderer.toneMappingExposure;
  // ACES-ish to sRGB bytes (only for comparing and saving; not the exact output).
  const toByte = v => { v *= exposure; const a = (v * (2.51 * v + .03)) / (v * (2.43 * v + .59) + .14); const c = Math.max(0, Math.min(1, a)); return 255 * (c <= .0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - .055); };
  const LUT = new Uint8Array(65536); for (let h = 0; h < 65536; h++) LUT[h] = Math.round(toByte(Math.max(0, HT[h]) || 0));
  const state = window.__flick = { THREE, W, H, rt, frames: [], opts };
  sim.dev.ghost = !!opts.ghost;
  state.frame = function (x, z, elapsed, clock) {
    const p = sim.player; p.x = x; p.z = z; p.vx = 0; p.vz = 0;
    if (clock !== undefined) sim.worldClock = clock;
    view.cameraCut = true;
    if (!opts.freezeShadow) view.sun.shadow.needsUpdate = true; else if (state.settled) { view.sun.shadow.autoUpdate = false; view.sun.shadow.needsUpdate = false; }
    view.update(sim, opts.dt ?? 1e-4, true, elapsed, p, 1);
    view.render();
    // Our own copy of the frame: the same scene and camera into our target.
    cam.copy(view.camera); cam.aspect = W / H; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    view.chunkCull?.cull(cam);
    const prevTarget = renderer.getRenderTarget(), prevXR = renderer.xr.enabled;
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(view.scene, cam);
    view.chunkCull?.restore();
    renderer.setRenderTarget(decodeRT); renderer.render(quadScene, quadCam);
    renderer.setRenderTarget(prevTarget);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, half);
    renderer.readRenderTargetPixels(decodeRT, 0, 0, W, H, dep);
    const rgb = new Uint8Array(W * H * 3), depth = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) { rgb[i * 3] = LUT[half[i * 4]]; rgb[i * 3 + 1] = LUT[half[i * 4 + 1]]; rgb[i * 3 + 2] = LUT[half[i * 4 + 2]]; depth[i] = dep[i * 4]; }
    const f = { rgb, depth, proj: cam.projectionMatrix.clone(), projInv: cam.projectionMatrixInverse.clone(), world: cam.matrixWorld.clone(), worldInv: cam.matrixWorldInverse.clone(), camPos: cam.position.clone(), x, z };
    return f;
  };
  // Pixel (row 0 = bottom, GL order) -> world point from the depth buffer.
  const v = new THREE.Vector3();
  state.worldAt = function (f, px, py, out) {
    const d = f.depth[py * W + px];
    if (d >= 1) return null;
    v.set((px + .5) / W * 2 - 1, (py + .5) / H * 2 - 1, d * 2 - 1).applyMatrix4(f.projInv).applyMatrix4(f.world);
    return out.copy(v);
  };
  // Compare frame a (earlier) and b: returns a mask (1 = flicker) and the count.
  const P = new THREE.Vector3(), Q = new THREE.Vector3(), vb = new THREE.Vector3();
  state.compare = function (a, b, thr = opts.threshold ?? 48) {
    const mask = new Uint8Array(W * H); let n = 0;
    const viewDepth = (f, d) => { vb.set(0, 0, d * 2 - 1).applyMatrix4(f.projInv); return -vb.z; };
    for (let py = 2; py < H - 2; py++) for (let px = 2; px < W - 2; px++) {
      const i = py * W + px, db = b.depth[i]; if (db >= 1) continue;
      P.set((px + .5) / W * 2 - 1, (py + .5) / H * 2 - 1, db * 2 - 1).applyMatrix4(b.projInv).applyMatrix4(b.world);
      Q.copy(P).applyMatrix4(a.worldInv); const zExpect = -Q.z; Q.applyMatrix4(a.proj);
      const ax = Math.round((Q.x + 1) / 2 * W - .5), ay = Math.round((Q.y + 1) / 2 * H - .5);
      if (ax < 1 || ay < 1 || ax >= W - 1 || ay >= H - 1) continue;
      // Same surface? the depth there (3x3) must match where the point should be.
      let dz = Infinity;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const j = (ay + oy) * W + ax + ox; dz = Math.min(dz, Math.abs(viewDepth(a, a.depth[j]) - zExpect)); }
      if (dz > .02 + zExpect * .0005) continue;
      // Colour: does any pixel near there in a carry this colour?
      const r = b.rgb[i * 3], g = b.rgb[i * 3 + 1], bl = b.rgb[i * 3 + 2];
      let best = 1e9;
      for (let oy = -1; oy <= 1 && best > thr; oy++) for (let ox = -1; ox <= 1; ox++) { const j = ((ay + oy) * W + ax + ox) * 3; const d = Math.max(Math.abs(a.rgb[j] - r), Math.abs(a.rgb[j + 1] - g), Math.abs(a.rgb[j + 2] - bl)); if (d < best) best = d; }
      if (best > thr) { mask[i] = 1; n++; }
    }
    return { mask, n };
  };
  // Clusters of flagged pixels (8-connected, after a 1px dilation), largest first.
  state.clusters = function (mask, min = 4) {
    const seen = new Uint8Array(W * H), out = [];
    for (let i = 0; i < W * H; i++) {
      if (!mask[i] || seen[i]) continue;
      const stack = [i]; seen[i] = 1; let cnt = 0, sx = 0, sy = 0; const pts = [];
      while (stack.length) {
        const k = stack.pop(), kx = k % W, ky = (k / W) | 0; cnt++; sx += kx; sy += ky; if (pts.length < 64) pts.push(k);
        for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) { const nx = kx + ox, ny = ky + oy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (mask[j] && !seen[j]) { seen[j] = 1; stack.push(j); } }
      }
      if (cnt >= min) out.push({ n: cnt, x: sx / cnt, y: sy / cnt, pts });
    }
    return out.sort((p, q) => q.n - p.n);
  };
  // What is at a pixel: raycast from the frame's camera; hits within 10 cm of the depth buffer's point.
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), W3 = new THREE.Vector3();
  const nameOf = o => { const c = []; while (o && c.length < 5) { c.push((o.name || o.type) + (o.isInstancedMesh ? '[I]' : '')); o = o.parent; } return c.join('<'); };
  state.probe = function (f, px, py) {
    const at = state.worldAt(f, px, py, W3); if (!at) return null;
    cam.projectionMatrix.copy(f.proj); cam.projectionMatrixInverse.copy(f.projInv); cam.matrixWorld.copy(f.world); cam.matrixWorldInverse.copy(f.worldInv); cam.position.copy(f.camPos);
    ndc.set((px + .5) / W * 2 - 1, (py + .5) / H * 2 - 1); ray.setFromCamera(ndc, cam);
    ray.layers.enableAll();
    const d0 = at.distanceTo(f.camPos);
    const hits = ray.intersectObject(view.scene, true).filter(h => { if (Math.abs(h.distance - d0) >= .12 || !h.object.layers.test(f.layers || view.camera.layers)) return false; let o = h.object; while (o) { if (!o.visible) return false; o = o.parent; } return true; });
    return { at: [at.x, at.y, at.z].map(v => +v.toFixed(3)), hits: hits.slice(0, 6).map(h => ({ d: +(h.distance - d0).toFixed(4), name: nameOf(h.object), inst: h.instanceId, mat: h.object.material?.type + (h.object.material?.name ? ':' + h.object.material.name : ''), po: !!h.object.material?.polygonOffset, face: h.face ? [h.face.normal.x, h.face.normal.y, h.face.normal.z].map(v => +v.toFixed(2)) : null })) };
  };
  state.png = async function (f, mask) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d'); const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = (y * W + x), d = ((H - 1 - y) * W + x) * 4; if (mask && mask[s]) { img.data[d] = 255; img.data[d + 1] = 0; img.data[d + 2] = 255; } else { img.data[d] = f.rgb[s * 3]; img.data[d + 1] = f.rgb[s * 3 + 1]; img.data[d + 2] = f.rgb[s * 3 + 2]; } img.data[d + 3] = 255; }
    ctx.putImageData(img, 0, 0); return c.toDataURL('image/png');
  };
  return { W, H, url };
};
