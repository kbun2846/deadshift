// Roofs, walls and trees never hide a character standing outside under or
// behind them (stage 4 audit: the meetinghouse's portico pediment and the
// stoops' hoods hid the hat of anyone standing there, your own and, worse, an
// opponent's; an eave or a tall roof does the same to someone by a wall; the
// trees' limbs, merged into the scenery, hid a body north of a trunk). Every
// character the view draws who is OUTSIDE every building (an open shed counts
// as outdoors) opens a see-through patch round the point that stands between
// the camera and their head (on the line from the head to the camera: the
// camera looks down from the south, so a point `rise` m above the head hides
// what is about `rise` x CAMERA_TILT m north of it mid-screen, more toward the
// top). A character inside a building is under its own roof by design (you
// see into rooms only through doors), so they open nothing. One shared list
// per view, updated once a frame.
//
// The patch is smooth, not dithered (v0.985a, owner: "I don't like the noise
// under trees or under the edges of roofs"). The faded surface is drawn twice:
//  - its own opaque material leaves the patch out altogether (a clean cut, so
//    the depth test and everything under it work as before);
//  - a blended copy of the mesh (`fadeOverlay`: the same geometry, a child of
//    the mesh, its own transparent material) draws only the patch, at the
//    opacity the fade leaves, after everything opaque.
// A copy is shown only on frames when someone is near its mesh (`prepareFades`,
// before each render), so the extra draws come only where a patch is open.
//
// Trees (`treeFade`, world/trees.js): standing under a tree's crown, or behind
// it from the camera, fades that whole tree: its leaf clumps to CANOPY, its
// limbs as far as LIMBS from TREE_FADE.to up, easing back to solid down to
// TREE_FADE.from over its foot, so the branches fade into the trunk and the
// trunk stays solid cover. Each vertex (limbs) or clump (leaves) carries its
// tree: `treeAt` (trunk x, z, crown radius, ground y at the trunk).
import * as THREE from 'three';
import { buildingContains } from '../map-kit.js';

export const ROOF_FADE = Object.freeze({ slots: 8, head: 1.6, inner: .5, outer: 1.05, strength: .92, cut: .004, reach: 8 });
// Colonial walls (the shell of each building: walls, clapboard, trim, sashes):
// the same patch, but only from the waist up and only on the camera's side of
// the body (owner, stage 5 review: someone against a north wall was hidden
// by the wall itself, a head shorter than it; the wall behind someone
// standing in front of it stays whole). Renderer 'wall' batches.
export const WALL_FADE = Object.freeze({ above: .9, ahead: true });
// Whole trees (owner, v0.985a): how see-through the leaves and the limbs go,
// and where a limb eases back to solid (m over the ground at the trunk); the
// crown's edge is soft over `edge` m inside it to `out` m outside it.
export const TREE_FADE = Object.freeze({ canopy: .85, limbs: .8, from: 1.6, to: 4.2, edge: 1, out: .5 });

const f = v => v.toFixed(4);

// The shared list: { fade: vec4[] (x, z, feet y, on), count: { value } (how
// many slots are in use: they fill from the first), update() (once a frame:
// a mesh's onBeforeRender), refresh() (now), overlays }.
export function roofFade(view) {
 if (view.roofFade) return view.roofFade;
 const fade = Array.from({ length: ROOF_FADE.slots }, () => new THREE.Vector4()), count = { value: 0 };
 let frame = -1, n = 0;
 // (Made once: nothing here allocates per frame.)
 const add = p => {
  if (n >= ROOF_FADE.slots) return;
  const buildings = view.map?.buildings;
  if (buildings) for (let i = 0; i < buildings.length; i++) { const b = buildings[i]; if (!b.open && buildingContains(b, p)) return; }
  fade[n++].set(p.x, p.z, p.y, 1);
 };
 const addAvatar = a => { if (a.root?.visible && a.root.parent) add(a.root.position); };
 const refresh = () => {
  n = 0;
  if (view.player && view.player.visible !== false) add(view.player.position);
  view.remote?.avatars?.forEach(addAvatar);
  for (let i = n; i < ROOF_FADE.slots; i++) fade[i].w = 0;
  count.value = n;
 };
 const update = () => {
  const now = view.renderer?.info?.render?.frame; if (now !== undefined && now === frame) return; frame = now ?? -1;
  refresh();
 };
 return (view.roofFade = { fade, count, update, refresh, overlays: [] });
}

// Before each render (renderer.js drawFrame): the list as it stands, and each
// blended copy shown only if a patch can fall on its mesh. For a roof or a
// building's shell (`near: 'line'`): the line from someone's head toward the
// camera, as high as the mesh reaches, passes within the patch's reach of the
// mesh's bounds. For the trees' copies (`near: 'sphere'`): someone within
// `reach` m of the mesh's bounding sphere (a crown fades whole).
export function prepareFades(view) {
 const r = view.roofFade; if (!r) return;
 r.refresh();
 const n = r.count.value, eye = view.camera?.position;
 for (let k = 0; k < r.overlays.length; k++) {
  const e = r.overlays[k];
  let show = false;
  if (n > 0 && !(e.skip && e.skip())) {
   if (e.near === 'line' && eye) {
    const box = e.box || (e.box = worldBox(e.base)), pad = ROOF_FADE.outer + .1;
    for (let i = 0; i < n && !show; i++) {
     const c = r.fade[i], headY = c.z + ROOF_FADE.head, rise = Math.max(0, box.max.y - headY), down = Math.max(1, eye.y - headY);
     const bx = c.x + (eye.x - c.x) / down * rise, bz = c.y + (eye.z - c.y) / down * rise;
     show = segmentNearBox(c.x, c.y, bx, bz, box, pad);
    }
   } else if (e.near === 'trees' && eye) {
    // Its trees (x, z, crown radius, ground): one faded if someone stands
    // under its crown or behind it, on the line toward the camera.
    const t = e.trees || (e.trees = treesOf(e.base));
    for (let i = 0; i < n && !show; i++) {
     const c = r.fade[i], headY = c.z + ROOF_FADE.head, down = Math.max(1, eye.y - headY);
     for (let j = 0; j < t.length; j += 4) {
      const rise = Math.max(0, t[j + 3] + TREE_TOP - headY), bx = c.x + (eye.x - c.x) / down * rise, bz = c.y + (eye.z - c.y) / down * rise;
      const reach = t[j + 2] + TREE_FADE.out + .2;
      if (segmentPointDistance2(c.x, c.y, bx, bz, t[j], t[j + 1]) < reach * reach) { show = true; break; }
     }
    }
   } else {
    const s = e.sphere || (e.sphere = worldSphere(e.base)), reach = s.radius + ROOF_FADE.reach, far = reach * reach;
    for (let i = 0; i < n; i++) { const c = r.fade[i], dx = c.x - s.center.x, dz = c.y - s.center.z; if (dx * dx + dz * dz < far) { show = true; break; } }
   }
  }
  if (e.mesh.visible !== show) e.mesh.visible = show;
 }
}
// (No tree reaches higher than this over the ground at its trunk.)
const TREE_TOP = 12;
function segmentPointDistance2(ax, az, bx, bz, px, pz) {
 const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz, t = l > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l)) : 0;
 const x = ax + dx * t - px, z = az + dz * t - pz;
 return x * x + z * z;
}
// The trees a mesh carries (its `treeAt` attribute, each tree once), as
// x, z, radius, ground quads; none without a radius.
function treesOf(mesh) {
 const a = mesh.geometry.attributes.treeAt, seen = new Set(), out = [];
 if (!a) return new Float32Array(0);
 for (let i = 0; i < a.count; i++) {
  const r = a.getZ(i); if (!(r > 0)) continue;
  const key = `${a.getX(i)},${a.getY(i)}`; if (seen.has(key)) continue;
  seen.add(key); out.push(a.getX(i), a.getY(i), r, a.getW(i));
 }
 return new Float32Array(out);
}
function worldSphere(mesh) {
 mesh.updateWorldMatrix(true, false);
 if (mesh.isInstancedMesh) { if (!mesh.boundingSphere) mesh.computeBoundingSphere(); return mesh.boundingSphere.clone().applyMatrix4(mesh.matrixWorld); }
 if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
 return mesh.geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
}
function worldBox(mesh) {
 mesh.updateWorldMatrix(true, false);
 if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
 return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
}
// Does the segment (ax, az)-(bx, bz) pass within `pad` of the box (x and z)?
// (Liang-Barsky against the grown box; no closures: it runs every frame.)
export function segmentNearBox(ax, az, bx, bz, box, pad) {
 const dx = bx - ax, dz = bz - az, x0 = box.min.x - pad, x1 = box.max.x + pad, z0 = box.min.z - pad, z1 = box.max.z + pad;
 let t0 = 0, t1 = 1;
 for (let side = 0; side < 4; side++) {
  const p = side === 0 ? -dx : side === 1 ? dx : side === 2 ? -dz : dz;
  const q = side === 0 ? ax - x0 : side === 1 ? x1 - ax : side === 2 ? az - z0 : z1 - az;
  if (p === 0) { if (q < 0) return false; continue; }
  const t = q / p;
  if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
 }
 return t0 <= t1;
}

// A blended copy for the patch, as a child of `base`: the same geometry (and,
// for an instanced mesh, the same instances), `material` (made transparent
// here), hidden until prepareFades shows it. `skip()`: true while the copy
// must stay hidden anyway (a roof fading as a whole, you inside it). `near`:
// how prepareFades judges it ('line': roofs and shells; 'sphere': trees).
export function fadeOverlay(view, base, material, skip = null, near = 'sphere') {
 const mesh = base.isInstancedMesh ? new THREE.InstancedMesh(base.geometry, material, base.count) : new THREE.Mesh(base.geometry, material);
 if (base.isInstancedMesh) { mesh.instanceMatrix = base.instanceMatrix; mesh.instanceColor = base.instanceColor; mesh.boundingSphere = base.boundingSphere; }
 mesh.castShadow = false; mesh.receiveShadow = base.receiveShadow; mesh.frustumCulled = base.frustumCulled;
 mesh.matrixAutoUpdate = false;
 base.add(mesh);
 return registerOverlay(view, mesh, { base, skip, near });
}
// A mesh that is itself a blended copy (a building's shell, merged on its own:
// world/colonial-buildings.js), hidden until prepareFades shows it.
export function registerOverlay(view, mesh, { base = mesh, skip = null, near = 'line' } = {}) {
 overlayMaterial(mesh.material);
 mesh.castShadow = false; mesh.visible = false; mesh.userData.fadeOverlay = true;
 roofFade(view).overlays.push({ mesh, base, skip, near, sphere: null, box: null });
 return mesh;
}
// The copy's material: transparent, writing no depth (what is under it is
// already drawn), and never casting.
function overlayMaterial(material) { material.transparent = true; material.depthWrite = false; return material; }

// The shared uniforms and the patch's loop: `roofOpen` 0..1 at this fragment.
const HOLE_UNIFORMS = S => `uniform vec4 roofFade[${S}];\nuniform int roofFadeCount;`;
function holeLoop({ inner, outer, above, ahead }) {
 return `float roofOpen = 0.0;
 if (roofFadeCount > 0) {
  // (Only the slots in use: nearly always one or two of the eight.)
  for (int i = 0; i < ${ROOF_FADE.slots}; i++) {
   if (i >= roofFadeCount) break;
   vec4 c = roofFade[i];
   if (c.w <= 0.0 || vRoofWorld.y < c.z + ${f(above)}) continue;
   // The point on the line from the head to this view's camera at this
   // fragment's height (stage 5 review, owner: a fixed tilt was right only at
   // the middle of the screen; toward its top the camera looks in lower, the
   // patch fell short and someone under a north eave stayed hidden).
   float headY = c.z + ${f(ROOF_FADE.head)}, rise = max(0.0, vRoofWorld.y - headY);
   vec2 toCamera = (cameraPosition.xz - c.xy) / max(cameraPosition.y - headY, 1.0);
   float away = length(vRoofWorld.xz - (c.xy + toCamera * rise));${ahead ? `
   if (dot(vRoofWorld.xz - c.xy, cameraPosition.xz - c.xy) < -0.3) continue; // (behind the body, as the camera sees it)` : ''}
   roofOpen = max(roofOpen, 1.0 - smoothstep(${f(inner)}, ${f(outer)}, away));
  }
 }`;
}
// The cut (opaque: leave the patch out) or the patch (blended copy: only it,
// at the opacity the fade leaves).
const cutOrPatch = (open, strength, overlay) => overlay
 ? `if (${open} <= ${f(ROOF_FADE.cut)}) discard;\n diffuseColor.a *= 1.0 - ${open} * ${f(strength)};`
 : `if (${open} > ${f(ROOF_FADE.cut)}) discard;`;

// Patch a material with the fade: `inner`/`outer` the patch's soft edge (m),
// `above` how far over a character's feet a fragment must be to fade (0: any),
// `ahead` only fragments on the camera's side of the body, `overlay` the
// blended copy's variant. (The name is the old one: it dithered until v0.985a.)
export function ditherFade(view, material, { key, inner = ROOF_FADE.inner, outer = ROOF_FADE.outer, strength = ROOF_FADE.strength, above = 0, ahead = false, overlay = false }) {
 const { fade, count } = roofFade(view);
 if (overlay) overlayMaterial(material);
 const before = material.onBeforeCompile, beforeKey = material.customProgramCacheKey?.bind(material);
 material.onBeforeCompile = (shader, renderer) => {
  before?.call(material, shader, renderer);
  shader.uniforms.roofFade = { value: fade }; shader.uniforms.roofFadeCount = count;
  shader.vertexShader = shader.vertexShader
   .replace('#include <common>', '#include <common>\nvarying vec3 vRoofWorld;')
   .replace('#include <begin_vertex>', `#include <begin_vertex>
 #ifdef USE_INSTANCING
  vRoofWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
 #else
  vRoofWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
 #endif`);
  shader.fragmentShader = shader.fragmentShader
   .replace('#include <common>', `#include <common>\n${HOLE_UNIFORMS(ROOF_FADE.slots)}\nvarying vec3 vRoofWorld;`)
   .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
 ${holeLoop({ inner, outer, above, ahead })}
 ${cutOrPatch('roofOpen', strength, overlay)}`);
 };
 material.customProgramCacheKey = () => (beforeKey ? beforeKey() + '|' : '') + key + (overlay ? '|overlay' : '');
}

// A colonial roof's material (one program for every colonial roof), and the
// one blended material all their copies share.
export function fadeRoofMaterial(view, material) { ditherFade(view, material, { key: 'colonial-roof-fade' }); }
export function roofOverlayMaterial(view) {
 if (view.roofOverlay) return view.roofOverlay;
 const material = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1 });
 ditherFade(view, material, { key: 'colonial-roof-fade', overlay: true });
 return (view.roofOverlay = material);
}

// Each faded mesh brings the list up to date before it is drawn (once a
// frame), and gets its blended copy (`overlay`: the copies' material; `skip`
// as fadeOverlay's). `meshes`: a root to walk or a list.
export function fadeRoofMeshes(view, meshes, overlay = null, skip = null) {
 const { update } = roofFade(view), list = [];
 if (Array.isArray(meshes)) list.push(...meshes); else meshes.traverse(m => list.push(m));
 for (const m of list) {
  if (!m.isMesh || m.userData.roofPrepass || m.userData.fadeOverlay) continue;
  // (No wrapper unless the mesh has a hook of its own: the wrapper's rest
  // arguments were an array a mesh a frame.)
  const before = m.onBeforeRender;
  m.onBeforeRender = before === THREE.Object3D.prototype.onBeforeRender ? update : function (renderer, scene, camera, geometry, material, group) { update(); before.call(this, renderer, scene, camera, geometry, material, group); };
  if (overlay) fadeOverlay(view, m, overlay, skip, 'line');
 }
}

// The trees' fade (world/trees.js): `instanced` the leaf clumps (each clump's
// tree from its instance's `treeAt`; the whole clump fades together, worked
// out per vertex; a clump that fades is dropped from the opaque draw by its
// vertices, so the opaque pass keeps its early depth test), else the limbs
// (per fragment, easing to solid toward the trunk's foot).
export function treeFade(view, material, { key, instanced = false, strength, overlay = false }) {
 const { fade, count } = roofFade(view), S = ROOF_FADE.slots;
 if (overlay) overlayMaterial(material);
 // How far `t`'s tree is faded for the characters in the list, seen from a
 // point `h` m up (the clump's middle, the fragment): standing under its
 // crown, or behind it on the line to the camera.
 const under = `float treeUnder(vec4 t, float h) {
  float under = 0.0;
  if (t.z <= 0.0 || roofFadeCount <= 0) return 0.0;
  for (int i = 0; i < ${S}; i++) {
   if (i >= roofFadeCount) break;
   vec4 c = roofFade[i]; if (c.w <= 0.0) continue;
   float headY = c.z + ${f(ROOF_FADE.head)};
   vec2 toCamera = (cameraPosition.xz - c.xy) / max(cameraPosition.y - headY, 1.0);
   float d = min(length(c.xy - t.xy), length(c.xy + toCamera * max(0.0, h - headY) - t.xy));
   under = max(under, 1.0 - smoothstep(t.z - ${f(TREE_FADE.edge)}, t.z + ${f(TREE_FADE.out)}, d));
  }
  return under;
 }`;
 const before = material.onBeforeCompile, beforeKey = material.customProgramCacheKey?.bind(material);
 material.onBeforeCompile = (shader, renderer) => {
  before?.call(material, shader, renderer);
  shader.uniforms.roofFade = { value: fade }; shader.uniforms.roofFadeCount = count;
  if (instanced) {
   shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${HOLE_UNIFORMS(S)}\nattribute vec4 treeAt;\nvarying float vTreeFade;\n${under}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
 float treeGone = treeUnder(treeAt, (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).y) * ${f(strength)};
 vTreeFade = treeGone;`)
    // (Dropped from this draw: placed outside the view, so it makes no fragments.)
    .replace('#include <project_vertex>', `#include <project_vertex>
 if (${overlay ? `treeGone <= ${f(ROOF_FADE.cut)}` : `treeGone > ${f(ROOF_FADE.cut)}`}) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);`);
   shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vTreeFade;')
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>${overlay ? '\n diffuseColor.a *= 1.0 - vTreeFade;' : ''}`);
  } else {
   // (The blended copy drops every tree nobody can be fading by its
   // vertices, a whole tree at once: nobody's line toward the camera, as
   // high as a tree grows, comes within its crown. Only faded trees reach
   // the rasterizer.)
   const far = overlay ? `
 bool treeFar(vec4 t) {
  if (t.z <= 0.0 || roofFadeCount <= 0) return true;
  for (int i = 0; i < ${S}; i++) {
   if (i >= roofFadeCount) break;
   vec4 c = roofFade[i]; if (c.w <= 0.0) continue;
   float headY = c.z + ${f(ROOF_FADE.head)};
   vec2 toCamera = (cameraPosition.xz - c.xy) / max(cameraPosition.y - headY, 1.0);
   vec2 ab = toCamera * max(0.0, t.w + ${f(TREE_TOP)} - headY);
   float l = dot(ab, ab), k = l > 0.0 ? clamp(dot(t.xy - c.xy, ab) / l, 0.0, 1.0) : 0.0;
   if (length(c.xy + ab * k - t.xy) < t.z + ${f(TREE_FADE.out + .1)}) return false;
  }
  return true;
 }` : '';
   shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nattribute vec4 treeAt;\nvarying vec4 vTreeAt;\nvarying vec3 vRoofWorld;${overlay ? `\n${HOLE_UNIFORMS(S)}${far}` : ''}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
 vTreeAt = treeAt;
 vRoofWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`)
    .replace('#include <project_vertex>', `#include <project_vertex>${overlay ? '\n if (treeFar(treeAt)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);' : ''}`);
   shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${HOLE_UNIFORMS(S)}\nvarying vec4 vTreeAt;\nvarying vec3 vRoofWorld;\n${under}`)
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
 float treeGone = 0.0;
 if (roofFadeCount > 0 && vTreeAt.z > 0.0) treeGone = treeUnder(vTreeAt, vRoofWorld.y) * smoothstep(vTreeAt.w + ${f(TREE_FADE.from)}, vTreeAt.w + ${f(TREE_FADE.to)}, vRoofWorld.y);
 ${cutOrPatch('treeGone', strength, overlay)}`);
  }
 };
 material.customProgramCacheKey = () => (beforeKey ? beforeKey() + '|' : '') + key + (overlay ? '|overlay' : '');
}
