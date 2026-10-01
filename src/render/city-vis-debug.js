// Lumen's visibility ID render (dev only: tools/lumen-visaudit-gpu.mjs loads
// it into a dev page opened with ?visdebug; nothing in the game imports it).
// It draws the view as it is now into an 8-bit target where each pixel says
// what it shows: red = the building's cut slot (0: none), green = its class:
//   1 the ground (anything at ground level that is not a building)
//   2 a building's shell (a wall, a storey, a roof, their facade parts)
//   3 a section cap (the dark top the cut shows: world/city-cut.js rule 2)
//   4 an interior (floors and furniture: drawn only where the rule allows)
//   5 a doorway's plug
//   6 anything else standing (a car, a lamp, a prop: it hides what is behind it)
//   7 a building's shell above its first floor (a storey, a roof, their parts)
// The shells are drawn with their own cut (the same vertex and fragment
// shader: SHELL_GLSL), so the ID render is the real frame's geometry.
// Transparent and custom-shader effects (signs, glows, rain) are left out:
// they hide nothing. classify() compares the frame with the CPU caster
// (tools/lumen-visaudit-lib.mjs castRay) pixel by pixel.
import * as THREE from 'three';
import { SHELL_GLSL } from './city-shells.js';
import { CUT, CUT_ROLE } from '../world/city-cut.js';

export const VIS_CLASS = Object.freeze({ none: 0, ground: 1, shell: 2, section: 3, interior: 4, plug: 5, other: 6, upper: 7 });
const WORLD_VERTEX = `
  { vec4 visP = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    visP = instanceMatrix * visP;
  #endif
  #ifdef USE_BATCHING
    visP = batchingMatrix * visP;
  #endif
    vVisWorld = (modelMatrix * visP).xyz; }`;

// The shells' ID material (interior: its meshes are an interior's).
function shellMaterial(shells, side, interior) {
  const m = new THREE.MeshBasicMaterial({ color: '#ffffff', side, fog: false });
  const slot = { value: 0 };
  m.userData.visSlot = slot;
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { cityCutMap: shells.city.uniforms.cutTexture, ...shells.cutUniforms, visSlot: slot });
    shader.vertexShader = SHELL_GLSL.head + 'varying vec2 vVisId;\n' + shader.vertexShader.replace('#include <begin_vertex>', SHELL_GLSL.vertex + '\n        vVisId = vec2(citySlot, cityRole);');
    const cls = interior ? `${VIS_CLASS.interior}.0` : `vCityInfo.z < -.5 ? ${VIS_CLASS.interior}.0 : abs(vVisId.y - ${CUT_ROLE.section}.0) < .5 ? ${VIS_CLASS.section}.0 : abs(vVisId.y - ${CUT_ROLE.plug}.0) < .5 ? ${VIS_CLASS.plug}.0 : vCityWorld.y > vCityInfo.x + ${CUT.above.toFixed(3)} ? ${VIS_CLASS.upper}.0 : ${VIS_CLASS.shell}.0`;
    shader.fragmentShader = SHELL_GLSL.fragmentHead + 'uniform float visSlot;\nvarying vec2 vVisId;\n' + shader.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + SHELL_GLSL.fragment)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n  gl_FragColor = vec4(${interior ? 'visSlot' : 'floor(vVisId.x + .5)'} / 255.0, (${cls}) / 255.0, 0.0, 1.0);`);
  };
  m.customProgramCacheKey = () => `city-vis-id-shell-${side}-${interior ? 1 : 0}`; // (a building's slot is a uniform: one program a kind)
  return m;
}
// Everything else: the ground (at ground level) or something standing; an
// interior's (its building's slot in red: visSlot).
function plainMaterial(side, interior) {
  const m = new THREE.MeshBasicMaterial({ color: '#ffffff', side, fog: false });
  const slot = { value: 0 };
  m.onBeforeCompile = shader => {
    shader.uniforms.visSlot = slot;
    shader.vertexShader = 'varying vec3 vVisWorld;\n' + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + WORLD_VERTEX);
    shader.fragmentShader = 'uniform float visSlot;\nvarying vec3 vVisWorld;\n' + shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
  gl_FragColor = vec4(${interior ? 'visSlot / 255.0' : '0.0'}, (${interior ? `${VIS_CLASS.interior}.0` : `vVisWorld.y < .06 ? ${VIS_CLASS.ground}.0 : ${VIS_CLASS.other}.0`}) / 255.0, 0.0, 1.0);`);
  };
  m.userData.visSlot = slot;
  m.customProgramCacheKey = () => `city-vis-id-plain-${side}-${interior ? 1 : 0}`;
  return m;
}

export class CityVisDebug {
  constructor(view) {
    this.view = view; this.shells = view.city.shells;
    const sides = [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide];
    this.mats = {};
    for (const s of sides) for (const inner of [0, 1]) { this.mats[`shell${s}${inner}`] = shellMaterial(this.shells, s, inner); this.mats[`plain${s}${inner}`] = plainMaterial(s, inner); }
    this.target = null; this.data = null;
    // Everything under an interior group is an interior (floors, furniture),
    // drawn with its building's slot (one material per building and side).
    this.interiorGroups = new Map(this.shells.interiorList.map(e => [e.group, e.slot]));
    this.interiorMats = new Map();
  }
  interiorSlot(o) { for (let p = o; p; p = p.parent) if (this.interiorGroups.has(p)) return this.interiorGroups.get(p); return 0; }
  interiorMaterial(slot, side, shell) {
    const key = `${slot}:${side}:${shell ? 1 : 0}`;
    let m = this.interiorMats.get(key);
    if (!m) { m = shell ? shellMaterial(this.shells, side, true) : plainMaterial(side, true); if (m.userData.visSlot) m.userData.visSlot.value = slot; this.interiorMats.set(key, m); }
    return m;
  }

  // Draw the view into the ID target; returns { data (RGBA bytes, bottom row first), w, h }.
  render(w, h) {
    const view = this.view, r = view.renderer, scene = view.scene, cam = view.camera;
    if (!this.target || this.target.width !== w || this.target.height !== h) {
      this.target?.dispose();
      this.target = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      this.data = new Uint8Array(w * h * 4);
    }
    const swapped = [], hidden = [], shellMat = this.shells.material;
    scene.traverse(o => {
      if (!o.visible) return;
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      const m = o.material, one = Array.isArray(m) ? m[0] : m;
      if (!one || !o.isMesh || !o.layers.test(cam.layers)) { hidden.push(o); o.visible = false; return; }
      const onShells = one === shellMat;
      const solid = !one.transparent && one.blending === THREE.NormalBlending && one.depthWrite !== false && one.colorWrite !== false && !(one.isShaderMaterial && !onShells);
      if (!solid) { hidden.push(o); o.visible = false; return; }
      swapped.push(o, m);
      const inner = this.interiorSlot(o), side = one.side ?? THREE.FrontSide;
      o.material = inner ? this.interiorMaterial(inner, side, onShells) : this.mats[`${onShells ? 'shell' : 'plain'}${side}0`];
    });
    const background = scene.background, fog = scene.fog, auto = r.shadowMap.autoUpdate, clear = r.getClearColor(new THREE.Color()), alpha = r.getClearAlpha(), rt = r.getRenderTarget();
    scene.background = null; scene.fog = null; r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.target); r.setClearColor(0x000000, 0); r.clear(true, true, true);
    r.render(scene, cam);
    r.readRenderTargetPixels(this.target, 0, 0, w, h, this.data);
    r.setRenderTarget(rt); r.setClearColor(clear, alpha); r.shadowMap.autoUpdate = auto; scene.background = background; scene.fog = fog;
    for (let i = 0; i < swapped.length; i += 2) swapped[i].material = swapped[i + 1];
    for (const o of hidden) o.visible = true;
    return { data: this.data, w, h };
  }

  // Compare a frame with the CPU caster (`lib`: tools/lumen-visaudit-lib.mjs,
  // `model` its auditModel): each pixel whose 3 x 3 neighbourhood is one
  // thing on the GPU, against the caster's ray through the pixel's middle and
  // four neighbours `spread` px off (a wall has thickness, a facade depth: the
  // caster's thin outline is allowed that slack). Counts:
  //   seeThrough  the GPU shows the ground where every ray says a building
//   fromInside  the same through a building the camera is in or coming into
//               (rule 5: its walls face away; expected, counted apart)
  //   missingCut  the GPU shows a building where every ray says open ground in K
  //   interior    the GPU shows an interior where the caster allows none
  //   section     the GPU shows a section cap where every ray says something else
  // With `image`, an RGBA picture (top row first): buildings grey by slot,
  // section caps dark red, interiors magenta, the ground green, others dark,
  // mismatches white.
  classify(frame, lib, model, spread = 2, image = null) {
    const { data, w, h } = frame, cam = this.view.camera, out = { pixels: 0, compared: 0, seeThrough: 0, fromInside: 0, missingCut: 0, interior: 0, section: 0, where: [] };
    const inv = new THREE.Matrix4().copy(cam.projectionMatrixInverse), world = cam.matrixWorld, v = new THREE.Vector3(), o = new THREE.Vector3().setFromMatrixPosition(world);
    const hit = {}, cast = (px, py) => {
      v.set((px + .5) / w * 2 - 1, (py + .5) / h * 2 - 1, .5).applyMatrix4(inv).applyMatrix4(world).sub(o);
      lib.castRay(model, v.x, v.y, v.z, Infinity, hit);
      const k = hit.kind;
      return { k, slot: hit.slot, inK: hit.inK, cls: k === 'ground' || k === 'sky' ? 1 : k === 'section' ? 3 : k === 'peek' || k === 'interior' ? 4 : k === 'plug' ? 5 : 2 };
    };
    const at = (x, y) => (y * w + x) * 4;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = at(x, y), slot = data[i], cls = data[i + 1];
      out.pixels++;
      let bad = '';
      let uniform = true;
      for (let dy = -1; dy <= 1 && uniform; dy++) for (let dx = -1; dx <= 1; dx++) { const j = at(x + dx, y + dy); if (data[j] !== slot || data[j + 1] !== cls) { uniform = false; break; } }
      if (uniform && cls && cls !== VIS_CLASS.other && cls !== VIS_CLASS.shell) {
        out.compared++;
        // (the middle ray first; the four neighbours only where it disagrees)
        const rays = [cast(x, y)];
        const every = f => { if (!rays.every(f)) return false; if (rays.length === 1) rays.push(cast(x - spread, y), cast(x + spread, y), cast(x, y - spread), cast(x, y + spread)); return rays.every(f); };
        const own = model.cut.bySlot.get(model.cut.inside)?.mode === 'open' ? model.cut.inside : -1;
        // (out through a building the camera is in or coming into: its walls
        // face away from the camera, rule 5; counted apart, not a fault)
        if (cls === VIS_CLASS.ground && every(r => r.cls === 2 || r.cls === 3)) bad = rays.every(r => (model.cut.bySlot.get(r.slot)?.near ?? 0) > .001) ? 'fromInside' : 'seeThrough';
        else if (cls === VIS_CLASS.upper && every(r => r.cls === 1 && r.inK)) bad = 'missingCut';
        // (an interior: yours always; another's only where a ray peeks in through its doorway)
        else if (cls === VIS_CLASS.interior && slot !== own && every(r => !(r.k === 'peek' && r.slot === slot))) bad = 'interior';
        else if (cls === VIS_CLASS.section && every(r => r.cls !== 3)) bad = 'section';
        if (bad) { out[bad]++; if (out.where.length < 12 && bad !== 'fromInside') out.where.push(`${bad} px ${x},${h - 1 - y} gpu slot ${slot} cls ${cls} cpu ${rays[0].k} slot ${rays[0].slot}`); }
      }
      if (image) {
        const j = ((h - 1 - y) * w + x) * 4;
        const c = bad ? [255, 255, 255] : cls === 1 ? [40, 150, 60] : cls === 2 || cls === 7 ? [70 + (slot * 37) % 120, 70 + (slot * 53) % 120, 90 + (slot * 71) % 120] : cls === 3 ? [120, 20, 20] : cls === 4 ? [255, 0, 255] : cls === 5 ? [30, 30, 90] : cls === 6 ? [30, 30, 30] : [0, 0, 0];
        image[j] = c[0]; image[j + 1] = c[1]; image[j + 2] = c[2]; image[j + 3] = 255;
      }
    }
    return out;
  }
}
