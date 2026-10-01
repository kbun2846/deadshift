// Lit parts on Lumen's props (stage 4): head and tail light bars, a vending
// machine's glowing front, a charge post's ring, a kiosk's screen edge. One
// unlit vertex-coloured material per view (built with the first lit part at
// load, so the warm-up compiles it: nothing new in play); each part is a box
// whose colour attribute carries its colour x strength (above 1 blooms on
// Extreme). The static batcher merges lit parts per cell by this material
// (renderer.js batch: a vertex-coloured mesh is never re-baked), so a street
// of cars costs one draw per cell for all their lights. Lit parts sit on the
// bright layer too, so Quality's mirror reflects them in the wet road.
// Colours: never Amber #ffb020, Cyan #2ee6ff or Violet #b77bff (tail red,
// cold white, lemon #fcee0a hazards, the city's pinks and blues are fine).
import * as THREE from 'three';
import { BRIGHT_LAYER } from '../render/city-registry.js';

const MATERIALS = new WeakMap();
export function litMaterial(view) {
  let m = MATERIALS.get(view);
  if (!m) { m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true }); m.name = 'lumen-lit-part'; MATERIALS.set(view, m); }
  return m;
}

const tmp = new THREE.Color();
// A lit box in the prop's group `g` (local metres, like view.box): `colour`
// any THREE colour value, `strength` its brightness (1 = its own colour).
export function litBox(view, g, x, y, z, w, h, d, colour, strength = 1) {
  const geometry = new THREE.BoxGeometry(w, h, d), n = geometry.attributes.position.count, a = new Float32Array(n * 3);
  tmp.set(colour).multiplyScalar(strength);
  for (let i = 0; i < n; i++) { a[i * 3] = tmp.r; a[i * 3 + 1] = tmp.g; a[i * 3 + 2] = tmp.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(a, 3));
  const mesh = new THREE.Mesh(geometry, litMaterial(view));
  mesh.position.set(x, y, z); mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.layers.enable(BRIGHT_LAYER);
  g.add(mesh);
  return mesh;
}
