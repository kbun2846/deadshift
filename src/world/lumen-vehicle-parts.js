// The building blocks of Lumen's vehicles (stage 4): a palette, and a small
// kit that builds chunky low-poly parts into a prop's group the way the rest
// of the world does (view.box / view.mesh, flat colours through
// view.material, so the static batcher bakes them into the shared vertex-
// coloured material and merges them per cell: a street of cars costs the same
// draws as a street of boxes).
//
// What the kit adds to view.box:
//   hull(points, colour)   any convex solid from 8 corners, flat-shaded: the
//                          bevelled, tapered, wedge-shaped parts of a body
//   loft(bottom, top, ..)  a rectangular solid whose top is a different size
//                          and place from its bottom (a cabin leaning in, a
//                          hood sloping to the nose)
//   strut(a, b, t)         a square rod from point to point (pillars, cracks)
//   wheel(...)             an octagonal (twelve-sided on Extreme) tyre and hub
// Every hull geometry has the same attributes and indexing as a BoxGeometry
// (position, normal, uv, indexed), so the batcher puts them in the same
// buckets: no extra draws.
import * as THREE from 'three';

// The vehicle palette (design 15): muted, no team colour anywhere near.
export const VEHICLE_COLOURS = Object.freeze({
  graphite: '#33363e', pearl: '#c9ccd0', deepRed: '#6e1f26', midnight: '#22304f', taxi: '#fcee0a',
  slate: '#4b515c', olive: '#4a4f45', steel: '#8a929c', dust: '#8b8474', wine: '#4a2430', petrol: '#26404a', black: '#15171b',
  // parts
  glass: '#0d1118', glassSheen: '#1c2431', crack: '#8e9aa8', tyre: '#141518', hub: '#5d626b', trim: '#1b1d22', interior: '#15171c', seat: '#3a3d45',
  soot: '#1a1a1c', scorch: '#2a211d', rubber: '#101114', rust: '#5e3d30', lemon: '#fcee0a',
});
export const COLOUR_LIST = Object.freeze(Object.values(VEHICLE_COLOURS));

const tmp = new THREE.Color();
const shades = new Map();
// A colour times a brightness, as the same hex string every time (so the
// view's per-colour materials stay few).
export function shade(hex, factor) {
  const key = hex + '|' + Math.round(factor * 100);
  let s = shades.get(key);
  if (!s) { tmp.set(hex).multiplyScalar(factor); s = '#' + tmp.getHexString(); shades.set(key, s); }
  return s;
}
export const pick = (list, r) => list[Math.min(list.length - 1, Math.floor(r * list.length))];
const mm = v => Math.round(v * 1000) / 1000;

// A convex solid from 8 corners: 0..3 the bottom ring, 4..7 the top ring,
// each going round the same way (a[i] under a[i + 4]). Flat normals, faces
// wound outward whichever way the corners were given.
const FACES = [[0, 3, 2, 1], [4, 5, 6, 7], [1, 2, 6, 5], [0, 4, 7, 3], [0, 1, 5, 4], [3, 7, 6, 2]];
export function hullGeometry(P) {
  const centre = [0, 0, 0];
  for (const p of P) for (let i = 0; i < 3; i++) centre[i] += p[i] / 8;
  const position = [], normal = [], uv = [], index = [];
  for (const face of FACES) {
    let v = face.map(i => P[i]);
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const d1 = sub(v[2], v[0]), d2 = sub(v[3], v[1]);
    let n = [d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0]];
    const mid = [(v[0][0] + v[1][0] + v[2][0] + v[3][0]) / 4 - centre[0], (v[0][1] + v[1][1] + v[2][1] + v[3][1]) / 4 - centre[1], (v[0][2] + v[1][2] + v[2][2] + v[3][2]) / 4 - centre[2]];
    if (n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2] < 0) { v = [v[0], v[3], v[2], v[1]]; n = [-n[0], -n[1], -n[2]]; }
    const len = Math.hypot(n[0], n[1], n[2]) || 1, base = position.length / 3;
    for (const p of v) { position.push(p[0], p[1], p[2]); normal.push(n[0] / len, n[1] / len, n[2] / len); }
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

const CYLINDERS = new Map(), STRUT = new Map();
const AXIS_Z = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3();

export class Parts {
  // view: the WorldView (or anything with box / mesh); g: the group to build
  // into; sides: the wheels' side count (a twelfth-sided tyre on Extreme).
  constructor(view, g, { sides } = {}) {
    this.view = view; this.g = g;
    this.sides = sides ?? (view.initialQuality === 'extreme' ? 12 : 8);
  }

  box(x, y, z, w, h, d, colour, parent = this.g) { return this.view.box(mm(x), mm(y), mm(z), mm(w), mm(h), mm(d), colour, parent); }
  // A box by its extents.
  slab(x0, x1, y0, y1, z0, z1, colour, parent = this.g) { return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, colour, parent); }

  hull(points, colour, parent = this.g) {
    const mesh = this.view.mesh(hullGeometry(points), colour, 0, 0, 0, parent);
    return mesh;
  }
  // A rectangular solid from a bottom rectangle to a top one. Each is
  // { x0, x1, z (half width, or [zLeft, zRight]), y }; the top's y may be
  // [rear, front] (the front edge at x1) for a sloping top.
  // `z` is the half width at x0, `zf` (default the same) at x1: a plan that
  // narrows toward the nose.
  loft(b, t, colour, parent = this.g) {
    const half = r => { const a = r.z, f = r.zf ?? a; return [Array.isArray(a) ? a : [-a, a], Array.isArray(f) ? f : [-f, f]]; };
    const [zb, zbf] = half(b), [zt, ztf] = half(t);
    const yt = Array.isArray(t.y) ? t.y : [t.y, t.y], yb = Array.isArray(b.y) ? b.y : [b.y, b.y];
    return this.hull([
      [b.x0, yb[0], zb[0]], [b.x1, yb[1], zbf[0]], [b.x1, yb[1], zbf[1]], [b.x0, yb[0], zb[1]],
      [t.x0, yt[0], zt[0]], [t.x1, yt[1], ztf[0]], [t.x1, yt[1], ztf[1]], [t.x0, yt[0], zt[1]],
    ], colour, parent);
  }
  // A square rod from a to b ([x, y, z]), t thick.
  strut(a, b, t, colour, parent = this.g) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (len < .001) return null;
    let template = STRUT.get('u');
    if (!template) { template = new THREE.BoxGeometry(1, 1, 1); template.userData.shared = true; template.computeBoundingSphere(); STRUT.set('u', template); }
    const mesh = this.view.mesh(template, colour, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, parent);
    dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    mesh.quaternion.setFromUnitVectors(AXIS_Z, dir);
    mesh.scale.set(t, t, len);
    return mesh;
  }
  // A flat disc (axis up): a wheel lying on its side.
  disc(x, y, z, radius, height, colour, parent = this.g) {
    const key = 'disc|' + radius + '|' + height + '|' + this.sides;
    let geometry = CYLINDERS.get(key);
    if (!geometry) { geometry = new THREE.CylinderGeometry(radius, radius, height, this.sides); geometry.userData.shared = true; geometry.computeBoundingSphere(); CYLINDERS.set(key, geometry); }
    return this.view.mesh(geometry, colour, x, y, z, parent);
  }
  // A tyre with its hub cap: axis along z, resting at height `y`, centred at
  // (x, z), the hub on the outward side (`side`: -1 or 1).
  wheel(x, y, z, radius, width, side, { tyre = VEHICLE_COLOURS.tyre, hub = VEHICLE_COLOURS.hub, parent = this.g } = {}) {
    const key = radius + '|' + width + '|' + this.sides;
    let geometry = CYLINDERS.get(key);
    if (!geometry) { geometry = new THREE.CylinderGeometry(radius, radius, width, this.sides); geometry.userData.shared = true; geometry.computeBoundingSphere(); CYLINDERS.set(key, geometry); }
    const tyreMesh = this.view.mesh(geometry, tyre, x, y, z, parent); tyreMesh.rotation.x = Math.PI / 2;
    const hubKey = 'hub|' + radius + '|' + this.sides;
    let cap = CYLINDERS.get(hubKey);
    if (!cap) { cap = new THREE.CylinderGeometry(radius * .58, radius * .58, .04, Math.max(6, this.sides - 2)); cap.userData.shared = true; cap.computeBoundingSphere(); CYLINDERS.set(hubKey, cap); }
    const hubMesh = this.view.mesh(cap, hub, x, y, z + side * (width / 2 + .004), parent); hubMesh.rotation.x = Math.PI / 2;
    return tyreMesh;
  }
}
