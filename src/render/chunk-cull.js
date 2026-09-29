import * as THREE from 'three';

// Culling the still world a chunk at a time (v0.999a, owner: "double FPS").
//
// three.js decides what to draw by walking every object in the scene each
// frame and testing each mesh's bounding sphere against the camera. The
// scenery roots (the static buildings and props, ground cover, Quality's
// street dressing: over 1600 objects on Deadwater, many of them empty groups
// left behind by batch()) were walked and tested in full every frame, though
// the camera sees one small part of the map.
//
// Now each of those roots' children is put into a chunk (a plain group, at
// the root's own transform, so no world matrix changes) by where it stands,
// CHUNK_SIZE metres a side, and each chunk keeps a sphere round every mesh
// under it (the same spheres three tests). Before each frame is drawn, a
// chunk the camera cannot see is hidden, so three skips its whole subtree;
// right after, every chunk is shown again, so anything else that draws the
// scene (a capture, the warm-up, another camera) sees all of it.
//
// It never changes what is drawn: a chunk is hidden only when none of its
// meshes' spheres reach the view, which is exactly when three would have
// culled every one of them. Shadows: three draws the sun's shadow map inside
// the same render, after the camera's list is made, so the shadow pass is
// wrapped: every chunk is shown for it (shadow-cache.js redraws its kept
// region from the same roots and must see all of it), except when three's
// own every-update path runs (Extreme), where a chunk is shown only if its
// sphere reaches the shadow camera's box, again exactly three's own test.
export const CHUNK_SIZE = 32;

const sphere = new THREE.Sphere(), frustum = new THREE.Frustum(), projection = new THREE.Matrix4();

export class ChunkCull {
 constructor(view) {
  this.view = view; this.chunks = []; this.hidden = false; this.roots = new Map();
  const shadowMap = view.renderer.shadowMap, inner = shadowMap.render;
  shadowMap.render = (lights, scene, camera) => {
   if (!this.hidden) return inner.call(shadowMap, lights, scene, camera);
   this.forShadows(lights);
   try { return inner.call(shadowMap, lights, scene, camera); }
   finally { this.forCamera(); }
  };
 }

 // Puts a frozen root's children into chunks (once per root object; a root
 // rebuilt later, e.g. ground cover made again for a higher preset, is new).
 adopt(root) {
  if (!root || this.roots.has(root)) return;
  root.updateMatrixWorld(true);
  const cells = new Map(), kept = [], size = CHUNK_SIZE;
  for (const child of root.children) {
   const bound = this.bound(child);
   // Nothing to test (no meshes), or something three never culls: left as is.
   if (!bound) { kept.push(child); continue; }
   const key = Math.floor(bound.center.x / size) + ',' + Math.floor(bound.center.z / size);
   let cell = cells.get(key); if (!cell) cells.set(key, cell = []);
   cell.push({ child, bound });
  }
  const chunks = [];
  for (const members of cells.values()) {
   if (members.length < 2) { kept.push(members[0].child); continue; }
   const group = new THREE.Group(); group.name = 'chunk';
   // At the root's own transform: its children's world matrices are unchanged.
   group.matrixAutoUpdate = false; group.matrixWorldAutoUpdate = false; group.matrixWorld.copy(root.matrixWorld);
   group.children = members.map(m => m.child); for (const m of members) m.child.parent = group;
   group.parent = root;
   const spheres = members.flatMap(m => m.bound.spheres);
   chunks.push({ group, root, spheres, box: new THREE.Box3().setFromPoints(spheres.flatMap(s => [s.center.clone().subScalar(s.radius), s.center.clone().addScalar(s.radius)])) });
   kept.push(group);
  }
  root.children = kept;
  this.roots.set(root, chunks);
  this.chunks = [...this.roots.values()].flat();
 }

 // A root no longer in use (removed from the scene): forgotten.
 drop(root) { if (this.roots.delete(root)) this.chunks = [...this.roots.values()].flat(); }

 // The world spheres of every mesh under `object` that three would test, and
 // their centre; null if any is never culled (frustumCulled off, a sprite or
 // something without bounds), so its chunk would have to be always drawn.
 bound(object) {
  const spheres = []; let never = false;
  object.traverse(o => {
   // (A light under a hidden chunk would drop out of every shader's light count.)
   if (o.isLight || o.isLOD) { never = true; return; }
   if (never || !(o.isMesh || o.isLine || o.isPoints || o.isSprite)) return;
   if (!o.frustumCulled || o.isSprite || o.isInstancedMesh || o.isSkinnedMesh || !o.geometry) { never = true; return; }
   if (o.geometry.boundingSphere === null) o.geometry.computeBoundingSphere();
   const s = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld);
   if (!Number.isFinite(s.radius)) { never = true; return; }
   spheres.push(s);
  });
  if (never || !spheres.length) return null;
  const center = new THREE.Vector3(); for (const s of spheres) center.add(s.center); center.divideScalar(spheres.length);
  return { spheres, center };
 }

 // Whether any of a chunk's spheres meets the frustum (a quick box test first).
 meets(chunk, f) {
  if (!f.intersectsBox(chunk.box)) return false;
  for (const s of chunk.spheres) if (f.intersectsSphere(s)) return true;
  return false;
 }

 // Before the frame's render: hide what `camera` cannot see.
 cull(camera) {
  if (!this.chunks.length) return;
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem, camera.reversedDepth);
  for (const c of this.chunks) c.seen = this.meets(c, frustum);
  this.hidden = true; this.forCamera();
 }

 forCamera() { for (const c of this.chunks) c.group.visible = c.seen; }

 // The shadow pass: everything, or (three's own redraw of one sun) what its box reaches.
 forShadows(lights) {
  const view = this.view, sun = view.sun;
  if (view.shadowCache?.active || lights.length !== 1 || lights[0] !== sun || !sun.shadow?.camera?.isOrthographicCamera) { for (const c of this.chunks) c.group.visible = true; return; }
  sun.updateMatrixWorld(); sun.target.updateMatrixWorld(); sun.shadow.updateMatrices(sun);
  const f = sun.shadow.getFrustum();
  for (const c of this.chunks) c.group.visible = c.seen || this.meets(c, f);
 }

 // After the frame's render: everything shown again.
 restore() {
  if (!this.hidden) return;
  for (const c of this.chunks) c.group.visible = true;
  this.hidden = false;
 }
}
