// The stream's water (a map's terrain `water` channels, world/heightfield.js):
// one flat ribbon per channel, lying in its bed at the height the water
// stands (`surface`: `up` upstream of the dam at x `damX`, `down` below it
// (`flow` 1 east, -1 west),
// with a short drop at the dam). Dark and a little glossy, so it takes a dull
// sheen from the sky; lighter toward the banks. It runs out under the banks
// (the ground hides what is above the waterline) and on past the fence to
// the edge of the ground.
//
// uv: x metres along the channel, y -1..1 across it (for the flow's streaks
// and foam later: stage 3's water ladder). Built once at load; one draw.
import * as THREE from 'three';

const DARK = new THREE.Color('#232a2c'), LIGHT = new THREE.Color('#3f4a4a');

// `view`: the WorldView (for its ground materials); returns a group or null.
export function buildWaterMesh(view, ground, map) {
 const channels = map.terrain?.water || [];
 if (!channels.length) return null;
 const group = new THREE.Group(); group.name = 'water';
 const material = view.waterMaterial ||= new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .32, metalness: 0,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
 for (const w of channels) {
  const surface = w.surface || { up: w.level ?? 0, down: w.level ?? 0, damX: Infinity };
  // (Upstream of the dam is `up`: west of it for a stream flowing east,
  // flow 1, east of it for one flowing west, flow -1; world/heightfield.js.)
  const levelAt = x => (x - (surface.damX ?? Infinity)) * (surface.flow ?? 1) < 0 ? surface.up : surface.down;
  // Sections every metre along the channel's line, inside the ground's grid.
  const sections = [];
  let run = 0;
  for (let i = 1; i < w.points.length; i++) {
   const a = w.points[i - 1], b = w.points[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(length));
   const nx = -(b[1] - a[1]) / length, nz = (b[0] - a[0]) / length;
   for (let k = i === 1 ? 0 : 1; k <= n; k++) {
    const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    const half = (a[2] ?? w.half) + ((b[2] ?? w.half) - (a[2] ?? w.half)) * t, reach = half + (w.bank ?? 1) + .3;
    if (x < ground.minX - 2 || x > ground.maxX + 2) continue;
    const y = levelAt(x), s = { x, z, nx, nz, reach, y, along: run + length * t };
    // The dam: the same place twice, once at each level (a short drop).
    const last = sections[sections.length - 1];
    if (last && last.y !== y) sections.push({ ...s, y: last.y, along: s.along - .01 });
    sections.push(s);
   }
   run += length;
  }
  if (sections.length < 2) continue;
  // Ease the normals between neighbours so bends do not pinch.
  for (let i = 0; i < sections.length; i++) {
   const p = sections[Math.max(0, i - 1)], q = sections[Math.min(sections.length - 1, i + 1)];
   const nx = p.nx + q.nx, nz = p.nz + q.nz, l = Math.hypot(nx, nz) || 1;
   sections[i].mx = nx / l; sections[i].mz = nz / l;
  }
  const ACROSS = [-1, -.6, 0, .6, 1], cols = ACROSS.length, count = sections.length * cols;
  const position = new Float32Array(count * 3), colour = new Float32Array(count * 3), uv = new Float32Array(count * 2), normal = new Float32Array(count * 3);
  const c = new THREE.Color();
  sections.forEach((s, i) => ACROSS.forEach((v, j) => {
   const k = i * cols + j;
   position[k * 3] = s.x + s.mx * s.reach * v; position[k * 3 + 1] = s.y; position[k * 3 + 2] = s.z + s.mz * s.reach * v;
   normal[k * 3 + 1] = 1;
   c.copy(DARK).lerp(LIGHT, Math.abs(v) ** 2 * .8);
   colour[k * 3] = c.r; colour[k * 3 + 1] = c.g; colour[k * 3 + 2] = c.b;
   uv[k * 2] = s.along; uv[k * 2 + 1] = v;
  }));
  const index = [];
  for (let i = 1; i < sections.length; i++) for (let j = 1; j < cols; j++) {
   const a = (i - 1) * cols + j - 1, b = (i - 1) * cols + j, d = i * cols + j - 1, e = i * cols + j;
   // Counter-clockwise seen from above (j runs toward the right bank).
   index.push(a, b, d, b, e, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeBoundingSphere(); geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'water:' + (w.id || 'channel');
  mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  group.add(mesh);
 }
 return group.children.length ? group : null;
}
