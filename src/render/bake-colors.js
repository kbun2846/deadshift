import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// One draw instead of one per part: the plain-coloured meshes directly under
// `group` become a single mesh, each part's colour carried per vertex on one
// white material of the same kind (a material colour and a vertex colour light
// the same way, so the picture is identical). Child groups -- the parts that
// move, such as a shotgun's barrels or a shell -- are left in place; bake them
// separately. Used for the held weapon models, which were drawn one colour or
// one part at a time every frame they were held, and for roofs (one draw per
// shade of shingle before).
// `options.material`: use this material for the merged mesh (e.g. one shared by
// a roof's two merged meshes); otherwise a new one like the parts' is made
// with `options.settings`. `options.pick`: bake only the parts it accepts.
// Attributes every part has (uv for a bump map) are kept. Returns the merged
// mesh, or null when there was nothing to merge.
// A merged mesh whose first `userData.castCount` indices (vertices, if not
// indexed) are the parts that cast shadows: three calls these round its draw
// in the shadow pass (Object3D.onBeforeShadow/onAfterShadow), so the camera
// draws it whole, once, and the shadow map gets only the casters (v0.980a).
export function castOnly() { this.geometry.drawRange.count = this.userData.castCount; }
export function drawAll() { this.geometry.drawRange.count = Infinity; }
export function castersOnlyInShadow(mesh, castCount, total) {
  mesh.castShadow = castCount > 0;
  if (castCount > 0 && castCount < total) { mesh.userData.castCount = castCount; mesh.onBeforeShadow = castOnly; mesh.onAfterShadow = drawAll; }
  return mesh;
}

// `options.castersFirst`: bake the casting and the non-casting parts into
// one mesh, the casters first, drawn whole by the camera and only the
// casters' part in the shadow pass (a roof: its shingles never cast).
export function bakeColors(group, options = {}) {
  const parts = group.children.filter(child => child.isMesh && !child.children.length && !Array.isArray(child.material) && (!options.pick || options.pick(child)));
  if (parts.length < (options.material ? 1 : 2)) return null;
  if (options.castersFirst) parts.sort((a, b) => b.castShadow - a.castShadow);
  let castCount = 0, total = 0;
  const geometries = [], color = new THREE.Color();
  let kind = null;
  for (const mesh of parts) {
    kind ||= mesh.material;
    mesh.updateMatrix();
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    mesh.geometry.dispose();
    g.applyMatrix4(mesh.matrix);
    color.copy(mesh.material.color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    total += g.attributes.position.count; if (mesh.castShadow) castCount += g.attributes.position.count;
    geometries.push(g);
    group.remove(mesh);
  }
  const shared = Object.keys(geometries[0].attributes).filter(name => geometries.every(g => g.attributes[name]));
  for (const g of geometries) for (const name of Object.keys(g.attributes)) if (!shared.includes(name)) g.deleteAttribute(name);
  const material = options.material || new kind.constructor({ color: '#ffffff', vertexColors: true, flatShading: !!kind.flatShading, ...options.settings });
  const merged = new THREE.Mesh(mergeGeometries(geometries), material);
  geometries.forEach(g => g.dispose());
  merged.castShadow = parts.some(p => p.castShadow); merged.receiveShadow = parts.some(p => p.receiveShadow);
  if (options.castersFirst) castersOnlyInShadow(merged, castCount, total);
  group.add(merged);
  return merged;
}
