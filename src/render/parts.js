// A list of flat-coloured boxes, cylinders and stones, merged into ONE
// vertex-coloured geometry (one draw, one material): how a whole crossing, the
// dam and the mill wheel are built (s2-crossings). Each part records its role
// and world-space bounds so tests can check where things are without a GPU.
import * as THREE from 'three';
import { mergeTransformed } from './merge-transformed.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYLINDERS = new Map(), COLOURS = new Map();
const STONE = (() => { const g = new THREE.DodecahedronGeometry(1, 0); g.deleteAttribute('uv'); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); g.setIndex([...Array(g.attributes.position.count).keys()]); return g; })();
const cylinder = (segments, taper) => {
 const key = segments + ':' + taper;
 if (!CYLINDERS.has(key)) CYLINDERS.set(key, new THREE.CylinderGeometry(taper, 1, 1, segments));
 return CYLINDERS.get(key);
};
const colour = hex => { if (!COLOURS.has(hex)) COLOURS.set(hex, new THREE.Color(hex)); return COLOURS.get(hex); };
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _v = new THREE.Vector3();

export class Parts {
 // frame: an optional THREE.Matrix4 every part is placed through (a deck's
 // own axes); bounds are kept in world space.
 constructor(frame = null) { this.frame = frame; this.entries = []; this.list = []; }
 add(geometry, x, y, z, sx, sy, sz, hex, rot, role, shade = 1) {
  _e.set(rot?.x || 0, rot?.y || 0, rot?.z || 0, rot?.order || 'XYZ');
  const matrix = new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz));
  if (this.frame) matrix.premultiply(this.frame);
  const c = shade === 1 ? colour(hex) : colour(hex).clone().multiplyScalar(shade);
  this.entries.push({ geometry, matrix, color: c });
  // (Exact world bounds, from its own corners.)
  const box = new THREE.Box3(), at = geometry.attributes.position;
  for (let i = 0; i < at.count; i++) box.expandByPoint(_v.fromBufferAttribute(at, i).applyMatrix4(matrix));
  this.list.push({ role, box });
  return this;
 }
 // A box centred on (x, y, z), w across (x), h up, d along (z).
 box(x, y, z, w, h, d, hex, rot, role = 'box', shade) { return this.add(BOX, x, y, z, w, h, d, hex, rot, role, shade); }
 // A cylinder centred on (x, y, z) along its own y (rot turns it), radius r
 // (taper: its top's share of r), length len.
 cyl(x, y, z, r, len, hex, rot, role = 'cyl', segments = 8, taper = 1, shade) { return this.add(cylinder(segments, taper), x, y, z, r, len, r, hex, rot, role, shade); }
 // A low-poly stone (a dodecahedron) centred on (x, y, z), half sizes sx, sy, sz.
 stone(x, y, z, sx, sy, sz, hex, ry = 0, role = 'stone', shade) { return this.add(STONE, x, y, z, sx, sy, sz, hex, { y: ry, x: ry * .7 }, role, shade); }
 // A timber from point a to point b (world or frame coords), w x t in section.
 beam(ax, ay, az, bx, by, bz, w, t, hex, role = 'beam', shade) {
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  _v.set(bx - ax, by - ay, bz - az).normalize();
  _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _v);
  _e.setFromQuaternion(_q, 'XYZ');
  return this.box((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, w, t, len, hex, { x: _e.x, y: _e.y, z: _e.z }, role, shade);
 }
 geometry() { return this.entries.length ? mergeTransformed(this.entries) : null; }
 // One mesh of it all with its own material (vertex colours).
 mesh(options = {}) {
  const geometry = this.geometry();
  if (!geometry) return null;
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .95, metalness: 0, ...options });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.parts = this.list;
  return mesh;
 }
}
