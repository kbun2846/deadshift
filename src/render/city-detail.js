// Lumen stage 5: the street detail's preset tiers (world/lumen-detail.js).
// A detail model tags its finer parts with a tier (userData.lumenDetailTier:
// 1 Performance, 2 Balanced, 3 Quality, 4 Extreme) and registers its group
// here (claimDetail). When the hub is built (after every prop, before the
// static batch: renderer.js), this system takes the tagged parts out of the
// props' groups, so the static batch merges only the untagged (tier 0) parts,
// every preset's, and merges the rest into ONE mesh per cell (CITY_DETAIL.cell:
// the whole map) per preset step and material: step s holds every part of
// tier 1..s, so a preset shows exactly one step and draws two meshes (the static batch's
// 'plain' vertex-coloured material and the lit-part material,
// world/lumen-glow.js). Both materials already draw the map, so nothing new is
// compiled: the steps are in the scene from load (hidden ones too, for the
// warm-up) and setQuality only flips `visible`. No shadows (ankle clutter),
// no bright layer (the mirror skips it), nothing per frame.
import * as THREE from 'three';
import { registerCitySystem } from './city-registry.js';
import { litMaterial } from '../world/lumen-glow.js';

export const CITY_DETAIL = Object.freeze({
  // One cell over the whole map: a step is ONE mesh per material, two draws
  // wherever you stand. Cells cull by their bounding sphere, and a 48 m
  // cell's sphere (34 m) reached into view from both sides of the Crossroads:
  // 6 draws there on Performance (measured) for about 4k triangles saved;
  // the whole map's step 1 is 11k triangles, step 4 25k, within the budget.
  cell: 192,
  origin: Object.freeze([-96, -96]),
  steps: Object.freeze({ potato: 0, performance: 1, balanced: 2, quality: 3, extreme: 4 }),
  top: 4,
});

// view -> the detail props' groups (world/lumen-detail.js builder()).
export const DETAIL_GROUPS = new WeakMap();
export function claimDetail(view, g) {
  let list = DETAIL_GROUPS.get(view);
  if (!list) DETAIL_GROUPS.set(view, list = []);
  list.push(g);
}

// A part baked once into world space: non-indexed position, normal and
// colour arrays (a lit part keeps its own colour attribute, colour x
// strength; a plain part takes its material's colour, linear, as renderer.js
// batch bakes it). The steps then only copy these (a part is in up to four).
export function bakePart({ geometry, matrix, colour }) {
  const pos = geometry.attributes.position.array, nor = geometry.attributes.normal.array, col = geometry.attributes.color?.array, index = geometry.index?.array;
  const n = index ? index.length : pos.length / 3, e = matrix.elements, m = NORMAL.getNormalMatrix(matrix).elements;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
  for (let k = 0, o = 0; k < n; k++, o += 3) {
    const i = (index ? index[k] : k) * 3, x = pos[i], y = pos[i + 1], z = pos[i + 2];
    P[o] = e[0] * x + e[4] * y + e[8] * z + e[12]; P[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; P[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    const a = nor[i], b = nor[i + 1], c = nor[i + 2];
    let nx = m[0] * a + m[3] * b + m[6] * c, ny = m[1] * a + m[4] * b + m[7] * c, nz = m[2] * a + m[5] * b + m[8] * c;
    const len = Math.hypot(nx, ny, nz) || 1; N[o] = nx / len; N[o + 1] = ny / len; N[o + 2] = nz / len;
    if (colour) { C[o] = colour.r; C[o + 1] = colour.g; C[o + 2] = colour.b; }
    else if (col) { C[o] = col[i]; C[o + 1] = col[i + 1]; C[o + 2] = col[i + 2]; }
    else C[o] = C[o + 1] = C[o + 2] = 1;
  }
  return { P, N, C };
}
const NORMAL = new THREE.Matrix3();
// Joins baked parts into one geometry.
export function mergeParts(parts) {
  const baked = parts.map(p => p.P ? p : bakePart(p));
  let count = 0; for (const b of baked) count += b.P.length;
  const position = new Float32Array(count), normal = new Float32Array(count), color = new Float32Array(count);
  let o = 0; for (const b of baked) { position.set(b.P, o); normal.set(b.N, o); color.set(b.C, o); o += b.P.length; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  g.computeBoundingSphere();
  return g;
}

export class CityDetail {
  constructor(view, groups) {
    const t0 = performance.now();
    this.view = view;
    const lit = litMaterial(view), plain = view.bakedMaterial('plain'), S = CITY_DETAIL;
    // 1. Take every tagged part out of its prop's group (world matrix kept).
    const parts = [];
    for (const g of groups) {
      g.updateMatrixWorld(true);
      const tagged = g.children.filter(o => o.isMesh && o.userData.lumenDetailTier);
      for (const m of tagged) {
        const isLit = m.material === lit;
        parts.push({ tier: m.userData.lumenDetailTier, lit: isLit, x: m.matrixWorld.elements[12], z: m.matrixWorld.elements[14], geometry: m.geometry, ...bakePart({ geometry: m.geometry, matrix: m.matrixWorld, colour: isLit ? null : m.material.color }) });
        m.removeFromParent();
      }
    }
    this.parts = parts.length;
    // 2. One group per step; in each, a mesh per cell and material.
    this.root = new THREE.Group(); this.root.name = 'city-detail'; this.root.matrixAutoUpdate = false;
    this.steps = [null];
    this.meshes = 0;
    for (let s = 1; s <= S.top; s++) {
      const step = new THREE.Group(); step.name = `city-detail-step-${s}`; step.matrixAutoUpdate = false;
      const cells = new Map();
      for (const p of parts) {
        if (p.tier > s) continue;
        const key = `${Math.floor((p.x - S.origin[0]) / S.cell)},${Math.floor((p.z - S.origin[1]) / S.cell)},${p.lit ? 'lit' : 'plain'}`;
        let list = cells.get(key); if (!list) cells.set(key, list = []);
        list.push(p);
      }
      for (const [key, list] of cells) {
        const mesh = new THREE.Mesh(mergeParts(list), key.endsWith('lit') ? lit : plain);
        mesh.castShadow = false; mesh.receiveShadow = !key.endsWith('lit'); mesh.matrixAutoUpdate = false; mesh.name = `city-detail-${s}-${key}`;
        step.add(mesh); this.meshes++;
      }
      this.steps.push(step); this.root.add(step);
    }
    // (The source geometries: shared box templates stay, the rest are the parts' own.)
    for (const p of parts) if (!p.geometry.userData.shared) p.geometry.dispose();
    view.scene.add(this.root);
    this.ms = performance.now() - t0; // (what the merge cost at load: tools and the report)
    this.setQuality(view.qualityName || view.initialQuality || 'balanced');
  }
  // Show the preset's step (Potato: none; its parts are the static batch's).
  setQuality(name) {
    const step = CITY_DETAIL.steps[name] ?? CITY_DETAIL.steps.balanced;
    this.step = step;
    for (let s = 1; s < this.steps.length; s++) this.steps[s].visible = s === step;
  }
  // What a step draws (tests, tools): meshes and triangles.
  stats(step = this.step) {
    let meshes = 0, triangles = 0;
    this.steps[step]?.traverse(o => { if (o.isMesh) { meshes++; triangles += o.geometry.attributes.position.count / 3; } });
    return { meshes, triangles };
  }
  dispose() {
    this.root.removeFromParent();
    this.root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  }
}

registerCitySystem('detail', view => {
  const groups = DETAIL_GROUPS.get(view);
  return groups?.length ? new CityDetail(view, groups) : null;
});
