// A stand-in WorldView for building Lumen's prop models in node without WebGL
// (tests/lumen-furniture.test.js, tests/lumen-breakables.test.js): the pieces
// of the view a model uses (renderer.js material/mesh/box/cylinder, the baked
// plain material), on real three.js objects, so the built group can be
// measured (Box3) and counted.
import * as THREE from 'three';

export function stubView() {
  const materials = new Map(), baked = new Map();
  const view = {
    materials, qualityName: 'balanced', initialQuality: 'balanced', built: 0,
    material(color) { if (!materials.has(color)) { const m = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 }); materials.set(color, m); } return materials.get(color); },
    mesh(geometry, color, x, y, z, parent) {
      const m = new THREE.Mesh(geometry, typeof color === 'string' ? view.material(color) : color);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); view.built++; return m;
    },
    box(x, y, z, w, h, d, color, parent) { return view.mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z, parent); },
    cylinder(x, y, z, radius, height, color, parent, segments = 10, top = radius) {
      if (view.initialQuality === 'extreme' && segments >= 6) segments = Math.min(40, segments * 2);
      return view.mesh(new THREE.CylinderGeometry(top, radius, height, segments), color, x, y, z, parent);
    },
    bakedMaterial(kind) { if (!baked.has(kind)) baked.set(kind, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, vertexColors: true })); return baked.get(kind); },
  };
  return view;
}

// Builds prop `type` (data merged as mapProps does) into a fresh group at the origin.
export function buildModel(view, LUMEN_MODELS, PROP_TYPES, type, extra = {}) {
  const p = { ...PROP_TYPES[type], type, x: 10.5, z: -7.25, angle: 0, ...extra };
  const g = new THREE.Group();
  const make = LUMEN_MODELS.get(type);
  if (!make) throw new Error(`no model for ${type}`);
  make(view, p, g);
  return { p, g };
}

// Triangles and meshes under a group.
export function countGroup(g) {
  let triangles = 0, meshes = 0;
  g.traverse(o => { if (o.isMesh) { meshes++; const geo = o.geometry; triangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3; } });
  return { triangles, meshes };
}
