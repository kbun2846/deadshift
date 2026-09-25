// Breakable props drawn in batches: all the prop parts that share a material,
// in the same patch of the map, are merged into one mesh, so a street of
// barrels and crates is a couple of draw calls rather than one or two per
// prop. Props were the biggest single source of draw calls. (Batching only
// identical shapes as instances was tried first: props vary too much for it
// to save anything.)
//
// Each prop keeps its own group and meshes, for bullet-mark rays and the
// decals parented to it; those meshes move to layer 1, which nothing draws,
// and the merged mesh stands in for them on screen and in the shadow pass.
// When a prop breaks, is restored, wobbles or grows back, sync(id) rewrites
// just its stretch of the merged vertex buffer from its group (a broken
// prop's vertices collapse to a point) and uploads only that range.
import * as THREE from 'three';
import { mergeTransformed } from './merge-transformed.js';

const CELL = 24;          // metres: patches, so a batch off screen is culled
const normalMatrix = new THREE.Matrix3(), v = new THREE.Vector3();

export class PropInstances {
 constructor(scene) { this.scene = scene; this.slots = new Map(); this.meshes = []; }

 // `props`: Map of prop id -> group (already built and batched).
 build(props) {
  const buckets = new Map();
  for (const [id, group] of props) {
   group.updateMatrixWorld(true);
   const cell = `${Math.floor(group.position.x / CELL)},${Math.floor(group.position.z / CELL)}`;
   group.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || o.userData.surfaceMark || !o.visible) return;
    const g = o.geometry;
    if (g.morphAttributes && Object.keys(g.morphAttributes).length) return;
    const key = `${cell}|${o.material.uuid}|${o.castShadow}|${o.receiveShadow}|${!!g.index}|${Object.keys(g.attributes).sort().join(',')}`;
    let b = buckets.get(key); if (!b) buckets.set(key, b = { material: o.material, castShadow: o.castShadow, receiveShadow: o.receiveShadow, parts: [] });
    b.parts.push({ id, mesh: o });
   });
  }
  let merged = 0;
  for (const b of buckets.values()) {
   if (b.parts.length < 2) continue;
   const geometry = mergeTransformed(b.parts.map(({ mesh }) => ({ geometry: mesh.geometry, matrix: mesh.matrixWorld })));
   if (!geometry) continue;
   geometry.computeBoundingSphere(); geometry.computeBoundingBox();
   for (const name of ['position', 'normal']) geometry.attributes[name]?.setUsage(THREE.DynamicDrawUsage);
   const batch = new THREE.Mesh(geometry, b.material);
   batch.castShadow = b.castShadow; batch.receiveShadow = b.receiveShadow; batch.userData.propBatch = true;
   batch.matrixAutoUpdate = false; batch.matrixWorldAutoUpdate = false; batch.updateMatrixWorld(true);
   let offset = 0;
   for (const { id, mesh } of b.parts) {
    const count = mesh.geometry.attributes.position.count;
    let slot = this.slots.get(id); if (!slot) this.slots.set(id, slot = []);
    slot.push({ batch, mesh, offset, count });
    mesh.layers.set(1);            // kept for rays and decals, not drawn
    offset += count;
   }
   this.scene.add(batch); this.meshes.push(batch); merged += b.parts.length;
  }
  return { batches: this.meshes.length, parts: merged };
 }

 // Rewrite a prop's stretch of its batches from its group (after it moved,
 // broke or came back).
 sync(id, group) {
  const slot = this.slots.get(id); if (!slot) return;
  const shown = group.visible;
  if (shown) group.updateMatrixWorld(true);
  for (const { batch, mesh, offset, count } of slot) {
   const pos = batch.geometry.attributes.position, nor = batch.geometry.attributes.normal;
   const src = mesh.geometry.attributes.position.array, srcN = mesh.geometry.attributes.normal?.array;
   const m = mesh.matrixWorld, dst = pos.array;
   if (shown) {
    for (let i = 0; i < count; i++) { v.fromArray(src, i * 3).applyMatrix4(m); v.toArray(dst, (offset + i) * 3); }
    if (nor && srcN) {
     normalMatrix.getNormalMatrix(m);
     for (let i = 0; i < count; i++) { v.fromArray(srcN, i * 3).applyMatrix3(normalMatrix).normalize(); v.toArray(nor.array, (offset + i) * 3); }
     nor.addUpdateRange(offset * 3, count * 3); nor.needsUpdate = true;
    }
   } else {
    // Collapsed onto one point: nothing to draw, nothing to shade.
    const x = dst[offset * 3], y = dst[offset * 3 + 1], z = dst[offset * 3 + 2];
    for (let i = 0; i < count; i++) { dst[(offset + i) * 3] = x; dst[(offset + i) * 3 + 1] = y; dst[(offset + i) * 3 + 2] = z; }
   }
   pos.addUpdateRange(offset * 3, count * 3); pos.needsUpdate = true;
  }
 }
}
