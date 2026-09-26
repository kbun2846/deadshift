// Roofs and tree limbs never hide a character standing outside under them
// (stage 4 audit: the meetinghouse's portico pediment and the stoops' hoods hid
// the hat of anyone standing there, your own and, worse, an opponent's; an
// eave or a tall roof does the same to someone by a wall; and the trees' limbs,
// merged into the scenery, hid a body north of a trunk, the fork maple's most
// of all, since only the leaf clumps thin out). Like the canopies' fade
// (world/trees.js), every character the view draws who is OUTSIDE every
// building opens a dithered hole round the point that stands between the
// camera and their head (on the line from the head to the camera: the camera
// looks down from the south, so a point `rise` m above the head hides what is
// about `rise` x CAMERA_TILT m north of it mid-screen, more toward the top). A
// character inside a building is under its own roof by design (you see into
// rooms only through doors), so they open nothing. One shared list per view,
// updated once a frame from the first faded mesh drawn.
import * as THREE from 'three';
import { buildingContains } from '../map-kit.js';

export const ROOF_FADE = Object.freeze({ slots: 8, head: 1.6, inner: .5, outer: 1.05, strength: .92 });
// Tree limbs: wider (a crown's limbs spread), and only above the body's
// shoulders, so a trunk's foot stays solid cover to the eye as it is to rounds.
export const LIMB_FADE = Object.freeze({ inner: 1.1, outer: 2.4, strength: .9, above: 1.4 });
// Colonial walls (the shell of each building: walls, clapboard, trim, sashes):
// the same hole, but only from the waist up and only on the camera's side of
// the body (owner, stage 5 review: someone against a north wall was hidden
// by the wall itself, a head shorter than it; the wall behind someone
// standing in front of it stays whole). Renderer 'wall' batches.
export const WALL_FADE = Object.freeze({ above: .9, ahead: true });

// The shared list: { fade: vec4[] (x, z, feet y, on), count: { value } (how
// many slots are in use: they fill from the first), update() }.
export function roofFade(view) {
 if (view.roofFade) return view.roofFade;
 const fade = Array.from({ length: ROOF_FADE.slots }, () => new THREE.Vector4()), count = { value: 0 };
 let frame = -1;
 const update = () => {
  const f = view.renderer?.info?.render?.frame; if (f !== undefined && f === frame) return; frame = f ?? -1;
  n = 0;
  if (view.player && view.player.visible !== false) add(view.player.position);
  view.remote?.avatars?.forEach(addAvatar);
  for (let i = n; i < ROOF_FADE.slots; i++) fade[i].w = 0;
  count.value = n;
 };
 // (Made once: nothing here allocates per frame. A character in an open shed,
 // the forge, the horse sheds or the woodshed, is outdoors (stage 5 review:
 // a robot under the forge's roof was hidden from you by it).)
 let n = 0;
 const add = p => {
  if (n >= ROOF_FADE.slots) return;
  const buildings = view.map?.buildings;
  if (buildings) for (let i = 0; i < buildings.length; i++) { const b = buildings[i]; if (!b.open && buildingContains(b, p)) return; }
  fade[n++].set(p.x, p.z, p.y, 1);
 };
 const addAvatar = a => { if (a.root?.visible && a.root.parent) add(a.root.position); };
 return (view.roofFade = { fade, count, update });
}

// Patch a material with the fade: `inner`/`outer` the hole's soft edge (m),
// `above` how far over a character's feet a fragment must be to fade (0: any).
export function ditherFade(view, material, { key, inner = ROOF_FADE.inner, outer = ROOF_FADE.outer, strength = ROOF_FADE.strength, above = 0, ahead = false }) {
 const { fade, count } = roofFade(view), S = ROOF_FADE.slots, f = v => v.toFixed(4);
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
   .replace('#include <common>', `#include <common>\nuniform vec4 roofFade[${S}];\nuniform int roofFadeCount;\nvarying vec3 vRoofWorld;`)
   .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
 if (roofFadeCount > 0) {
  // (Only the slots in use: nearly always one or two of the eight.)
  float roofOpen = 0.0;
  for (int i = 0; i < ${S}; i++) {
   if (i >= roofFadeCount) break;
   vec4 c = roofFade[i];
   if (c.w <= 0.0 || vRoofWorld.y < c.z + ${f(above)}) continue;
   // The point on the line from the head to this view's camera at this
   // fragment's height (stage 5 review, owner: a fixed tilt was right only at
   // the middle of the screen; toward its top the camera looks in lower, the
   // hole fell short and someone under a north eave stayed hidden).
   float headY = c.z + ${f(ROOF_FADE.head)}, rise = max(0.0, vRoofWorld.y - headY);
   vec2 toCamera = (cameraPosition.xz - c.xy) / max(cameraPosition.y - headY, 1.0);
   float away = length(vRoofWorld.xz - (c.xy + toCamera * rise));${ahead ? `
   if (dot(vRoofWorld.xz - c.xy, cameraPosition.xz - c.xy) < -0.3) continue; // (behind the body, as the camera sees it)` : ''}
   roofOpen = max(roofOpen, 1.0 - smoothstep(${f(inner)}, ${f(outer)}, away));
  }
  if (roofOpen > 0.0 && fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) < roofOpen * ${f(strength)}) discard;
 }`);
 };
 material.customProgramCacheKey = () => (beforeKey ? beforeKey() + '|' : '') + key;
}

// A colonial roof's material (one program for every colonial roof).
export function fadeRoofMaterial(view, material) { ditherFade(view, material, { key: 'colonial-roof-fade' }); }

// Each faded mesh brings the list up to date before it is drawn (once a frame).
export function fadeRoofMeshes(view, root) {
 const { update } = roofFade(view);
 root.traverse(m => {
  if (!m.isMesh || m.userData.roofPrepass) return;
  // (No wrapper unless the mesh has a hook of its own: the wrapper's rest
  // arguments were an array a mesh a frame.)
  const before = m.onBeforeRender;
  m.onBeforeRender = before === THREE.Object3D.prototype.onBeforeRender ? update : function (renderer, scene, camera, geometry, material, group) { update(); before.call(this, renderer, scene, camera, geometry, material, group); };
 });
}
