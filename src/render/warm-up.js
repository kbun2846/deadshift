// The shader warm-up: every program the game can need is compiled (and drawn
// once, clipped to a pixel) while loading, so nothing is built mid-fight.
// Methods of WorldView (renderer.js); `this` is the view.
import * as THREE from 'three';
import { DeathView } from '../effects/death-view.js';
import { charMaterial } from '../effects/gore.js';
import { isDemanding } from '../settings.js';
import { BloodDrops } from '../effects/blood-drops.js';

export const WarmUp = {
  // Compile every program the scene will need, including the blended variant
  // of each roof material, before gameplay starts.
  // One tiny stand-in per material the view holds that no visible object is
  // using yet, plus the kinds of material a blast and a thrown grenade create
  // on the spot, each also in its indoor-clipped variant (see warmPrograms).
  warmRack() {
    const rack = new THREE.Group(), used = new Set(), found = new Set(), seen = new Set();
    this.scene.traverse(o => { for (const m of [].concat(o.material || [])) used.add(m); }); // hidden ones too: the warm draw shows them
    const skip = new Set(['scene', 'renderer', 'camera', 'lastSim', 'map', 'view', 'parent', 'sim']);
    const visit = (value, depth) => {
      if (!value || typeof value !== 'object' || seen.has(value) || depth > 3) return;
      seen.add(value);
      // Shadow-pass materials (depth, distance) are not drawn as surfaces.
      if (value.isMaterial) { if (!used.has(value) && !value.isMeshDistanceMaterial && !value.isMeshDepthMaterial) found.add(value); return; }
      if (value.isObject3D || value.isTexture || value.isBufferGeometry || ArrayBuffer.isView(value) || value instanceof Node) return;
      if (value instanceof Map || value instanceof Set) { for (const v of value.values()) visit(v, depth + 1); return; }
      if (Array.isArray(value)) { if (value.length <= 64) for (const v of value) visit(v, depth + 1); return; }
      for (const key of Object.keys(value)) if (!skip.has(key)) visit(value[key], depth + 1);
    };
    visit(this, 0);
    const Smoke = isDemanding(this.qualityName) ? THREE.MeshStandardMaterial : THREE.MeshBasicMaterial;
    const adHoc = [
      new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      new Smoke({ transparent: true, depthWrite: false }),
      new THREE.MeshLambertMaterial({ flatShading: true }),
      new THREE.MeshLambertMaterial(),
    ];
    const geometry = this.warmGeometry ||= new THREE.BoxGeometry(.01, .01, .01);
    const add = (material, clone) => {
      const object = material.isLineBasicMaterial ? new THREE.LineSegments(geometry, material)
        : material.isPointsMaterial ? new THREE.Points(geometry, material)
        : material.isSpriteMaterial ? new THREE.Sprite(material) : new THREE.Mesh(geometry, material);
      object.frustumCulled = false; object.userData.warmClone = clone; rack.add(object);
      return object;
    };
    // A shader that samples a render target can't be cloned (three drops the
    // texture and warns); those are full-screen passes, never indoors, so
    // they skip the indoor copy.
    const samplesTarget = m => m.isShaderMaterial && Object.values(m.uniforms || {}).some(u => u?.value?.isRenderTargetTexture);
    for (const material of [...found, ...adHoc]) {
      add(material, adHoc.includes(material));
      if (samplesTarget(material)) continue;
      const indoor = add(material.clone(), true);
      this.interiorVisibility.apply(indoor);
    }
    return rack;
  },

  // The warm-up, run straight through (a preset change mid-game).
  warmPrograms() { for (const step of this.warmSteps()) void step; },

  // At load: the same, but each time it is about to compile it first hands
  // the whole scene to the driver to compile in parallel (three's
  // compileAsync, KHR_parallel_shader_compile) and waits without blocking, so
  // the loading screen keeps moving and the compiles overlap; the ordinary
  // compile and draw that follow then find every program ready. Where the
  // extension is missing compileAsync just resolves, and it costs as before.
  async warmProgramsParallel() {
    const parallel = !!this.renderer.compileAsync && this.renderer.extensions.has('KHR_parallel_shader_compile');
    for (const step of this.warmSteps()) {
      void step;
      if (parallel) try { await this.renderer.compileAsync(this.scene, this.camera); } catch { /* the sync compile still runs */ }
    }
  },

  *warmSteps() {
    // Blood drops are made on a first bleed; made now, so that bleed (a robot
    // or another player shooting you) builds no shader mid-fight.
    (this.drops ||= new BloodDrops(this)).ensure();
    // Everything drawFrame gives the indoor-clipped shader, given it now.
    for (const group of this.particlePool || []) this.interiorVisibility.apply(group);
    for (const object of this.electric?.arcs.objects || []) this.interiorVisibility.apply(object);
    for (const object of this.electric?.pulseParts?.() || []) this.interiorVisibility.apply(object);
    // The detail-effect pools sit hidden until something happens, and compile
    // only compiles what is visible: shown for the warm-up, so the first
    // grenade or gunshot does not stop the game for a second to build shaders.
    const fxMeshes = [...(this.fx?.meshes || []), this.orbBeams?.mesh, this.scatterView?.mesh].filter(Boolean);
    for (const mesh of fxMeshes) { this.interiorVisibility.apply(mesh); mesh.visible = true; }
    // On Extreme the scene is drawn into the composer's (linear) render target,
    // not the (sRGB) canvas, and the output colour space is part of every
    // shader: warming for the canvas left each effect to rebuild on first use.
    const target = this.post && this.qualityName === 'extreme' ? this.post.composer.readBuffer : null;
    // Drawn once, not only compiled: a shader's first draw is where the driver
    // is made to finish it (and where the shadow pass builds its depth
    // variants), so that happens here, while loading, instead of on the first
    // shot. The next frame draws over it.
    const compile = function* () {
      const previous = this.renderer.getRenderTarget();
      // For that one draw everything in the scene is shown, hidden things too
      // (a pooled effect waiting for its first use, the grenade in the hand),
      // and nothing is culled, but the draw is clipped to a single pixel.
      const restore = [];
      // Lights keep their state: how many there are is part of every shader.
      this.scene.traverse(o => { if (o.isLight) return; restore.push(o, o.visible, o.frustumCulled); o.visible = true; o.frustumCulled = false; });
      try {
        this.renderer.setRenderTarget(target);
        yield 'compile';
        this.renderer.compile(this.scene, this.camera);
        this.renderer.setScissorTest(true); this.renderer.setScissor(0, 0, 1, 1);
        this.drawEmpty = true; this.renderer.render(this.scene, this.camera);
        // Extreme's AO draws the scene again with its normals material, whose
        // variants (instanced or not, and so on) follow each object: an effect
        // pool first drawn mid-fight built one there (the first Static X).
        const ao = this.post?.ao;
        if (ao?.normalMaterial && ao.normalRenderTarget) {
          this.renderer.setRenderTarget(ao.normalRenderTarget); this.scene.overrideMaterial = ao.normalMaterial;
          // With the pass's own exclusions (it hides the lights, lines and
          // points for its draw, and the light count is in every program key).
          ao._overrideVisibility();
          try { this.renderer.render(this.scene, this.camera); }
          finally { this.scene.overrideMaterial = null; ao._restoreVisibility(); }
        }
      }
      catch (error) { if (import.meta.env?.DEV) console.warn("warm-up", error); /* A warm-up failure is not a reason to refuse to start. */ }
      finally {
        this.drawEmpty = false; this.renderer.setScissorTest(false); this.renderer.setRenderTarget(previous);
        for (let i = 0; i < restore.length; i += 3) { restore[i].visible = restore[i + 1]; restore[i].frustumCulled = restore[i + 2]; }
      }
    }.bind(this);
    // Materials that only reach the screen once something happens (an orb's
    // trail and arcs, a grenade in flight, a blast's ring, fire and smoke, a
    // scorch mark) each needed a shader built mid-fight: a visible hitch on
    // the first orb, the first grenade, the first blast. A rack of tiny
    // stand-ins carrying each of them is compiled with the scene and removed.
    // A death of every kind (body, scatter, skeleton, headless), staged for the
    // warm-up and cleared after: the first real death used to build shaders
    // mid-game (on Extreme the AO pass's normals variant for its pieces). The
    // rack below finds their materials here and keeps stand-ins, so their
    // programs outlive the staging.
    const at = this.map.spawn || { x: 0, z: 0 };
    this.player.updateMatrixWorld(true);
    const sceneBefore = new Set(this.scene.children);
    this.warmDeaths = ['gunshot', 'explosion', 'fire', 'ballastFatal', 'electric'].map(damageType => {
      const d = new DeathView(this);
      try { d.start({ type: 'playerDeath', x: at.x, z: at.z, directionX: 1, directionZ: 0, aimX: 1, aimZ: 0, damageType }); for (const t of [.3, 1, 2.5, 4]) d.update(t - (d.age || 0)); } catch { /* staging only */ }
      return d;
    });
    // Burnt bodies' cracked-char material, both ways (fading or not).
    this.warmCharred ||= [charMaterial(false), charMaterial(true)];
    const rack = this.warmRack();
    // The staged deaths' materials in their indoor-clipped form too (a body
    // under a roof, or seen from indoors), as the rack does for everything else.
    const deathKinds = new Set();
    for (const o of this.scene.children) if (!sceneBefore.has(o)) o.traverse(m => { if (m.isMesh) for (const mat of [].concat(m.material || [])) deathKinds.add(mat); });
    for (const mat of deathKinds) {
      const clone = mat.clone(), mesh = new THREE.Mesh(this.warmGeometry, clone);
      mesh.frustumCulled = false; mesh.userData.warmClone = true; rack.add(mesh); this.interiorVisibility.apply(mesh);
    }
    // The pooled Static X pulse parts, built and drawn now, not on the first pulse.
    const pulses = [...(this.electric?.prewarm?.() || []), ...this.prewarmBlasts()];
    for (const mesh of pulses) { this.interiorVisibility.apply(mesh); rack.add(mesh); }
    this.scene.add(rack);
    yield* compile();
    this.scene.remove(rack);
    for (const mesh of pulses) rack.remove(mesh);
    // Their materials are kept (not disposed with the staging): disposing the
    // last user of a program destroys it, and the first real death would
    // build it again.
    const deathMaterials = new Set();
    for (const o of this.scene.children) if (!sceneBefore.has(o)) o.traverse(m => { for (const mat of [].concat(m.material || [])) deathMaterials.add(mat); });
    for (const m of deathMaterials) { m.userData.keepDispose = m.dispose; m.dispose = () => {}; }
    for (const d of this.warmDeaths) d.clear();
    for (const m of deathMaterials) { m.dispose = m.userData.keepDispose; delete m.userData.keepDispose; }
    this.warmDeathMaterials = [...deathMaterials];
    this.warmDeaths = null; this.player.visible = true;
    // The stand-ins' materials are kept (not disposed): disposing the last
    // user of a program destroys it, and the real effect would build it again.
    for (const old of this.warmKept || []) old.dispose();
    this.warmKept = rack.children.filter(c => c.userData.warmClone).map(c => c.material);
    for (const mesh of fxMeshes) mesh.visible = mesh.count > 0;
    const roofMaterials = this.roofs.flatMap(r => r.materials);
    if (!roofMaterials.length) return;
    for (const m of roofMaterials) m.transparent = true;
    yield* compile();
    // Put them back and have three re-pick the opaque shader, rather than leave
    // them holding the transparent one the second compile just attached.
    for (const m of roofMaterials) { m.transparent = false; m.needsUpdate = true; }
    for (const roof of this.roofs) roof.blended = false;
  },

  // Two kits built (and drawn by the warm-up) before play; their meshes.
  prewarmBlasts() {
    const kits = [this.takeBlastKit(), this.takeBlastKit()];
    for (const kit of kits) for (let i = 0; i < 2; i++) kit.puffs[i] ||= { mesh: new THREE.Mesh(this.smokeGeo, kit.materials[i]), flame: new THREE.Mesh(this.smokeGeo, kit.materials[i + 2]) };
    this.blastKits.push(...kits);
    return kits.flatMap(kit => [kit.ring, kit.core, ...kit.puffs.flatMap(p => [p.mesh, p.flame])]);
  },
};
