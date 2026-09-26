import * as THREE from 'three';

// Merges geometries into one, each moved by its own matrix, without making a
// transformed copy of each first.
//
// batch() used to clone every source geometry, apply its matrix to the clone,
// hand the clones to three's mergeGeometries and throw them away. Ground
// detail alone is around ten thousand tiny geometries, so that was ten
// thousand throwaway copies of every attribute, and a large share of the whole
// load went on allocating and collecting them. This writes each vertex once,
// straight into the merged buffers, and produces what the clone-and-merge path
// did: positions through the matrix, normals through its normal matrix and
// renormalised, everything else copied, indices offset in order.
//
// Entries may carry a `color` ({r,g,b}): the merge then writes it into a
// per-vertex colour attribute, which is how many flat-coloured materials
// become one draw. Sources must not already have their own colours.
//
// Entries may also carry a `stamp` (four numbers) when the call names one
// (`{ stamp: '<attribute>' }`): the merge writes it into that per-vertex
// attribute, so each vertex keeps what it came from (world/trees.js: its tree).
//
// Returns null for anything it does not handle -- mismatched attributes,
// interleaved or non-float data, morph targets -- and the caller falls back.
export function mergeTransformed(entries, { stamp = null } = {}) {
  if (!entries.length) return null;
  const first = entries[0].geometry;
  const names = Object.keys(first.attributes);
  const indexed = first.index !== null;
  const colored = entries.every(e => e.color) && !names.includes('color');
  if (entries.some(e => e.color) && !colored) return null;
  let vertices = 0, indices = 0;
  for (const { geometry } of entries) {
    if (geometry.index !== null !== indexed) return null;
    if (Object.keys(geometry.morphAttributes).length) return null;
    const keys = Object.keys(geometry.attributes);
    if (keys.length !== names.length) return null;
    for (const name of names) {
      const a = geometry.attributes[name], b = first.attributes[name];
      if (!a || a.isInterleavedBufferAttribute || !(a.array instanceof Float32Array)) return null;
      if (a.itemSize !== b.itemSize || a.normalized !== b.normalized) return null;
    }
    vertices += geometry.attributes.position.count;
    if (indexed) indices += geometry.index.count;
  }
  const out = {};
  for (const name of names) out[name] = new Float32Array(vertices * first.attributes[name].itemSize);
  const colors = colored ? new Float32Array(vertices * 3) : null;
  const stamps = stamp && entries.every(e => e.stamp?.length === 4) ? new Float32Array(vertices * 4) : null;
  const index = indexed ? (vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)) : null;

  const normalMatrix = new THREE.Matrix3();
  let vertexOffset = 0, indexOffset = 0;
  for (const { geometry, matrix, color, stamp: mark } of entries) {
    const e = matrix.elements, count = geometry.attributes.position.count;
    normalMatrix.getNormalMatrix(matrix);
    const n = normalMatrix.elements;
    for (const name of names) {
      const source = geometry.attributes[name], size = source.itemSize, src = source.array, dst = out[name];
      const base = vertexOffset * size;
      if (name === 'position' && size === 3) {
        for (let i = 0; i < count; i++) {
          const x = src[i * 3], y = src[i * 3 + 1], z = src[i * 3 + 2];
          const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
          dst[base + i * 3] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
          dst[base + i * 3 + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
          dst[base + i * 3 + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
        }
      } else if (name === 'normal' && size === 3) {
        for (let i = 0; i < count; i++) {
          const x = src[i * 3], y = src[i * 3 + 1], z = src[i * 3 + 2];
          let nx = n[0] * x + n[3] * y + n[6] * z, ny = n[1] * x + n[4] * y + n[7] * z, nz = n[2] * x + n[5] * y + n[8] * z;
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
          if (len > 0) { nx /= len; ny /= len; nz /= len; }
          dst[base + i * 3] = nx; dst[base + i * 3 + 1] = ny; dst[base + i * 3 + 2] = nz;
        }
      } else if (name === 'tangent') {
        return null;
      } else {
        dst.set(src.subarray(0, count * size), base);
      }
    }
    if (colors) for (let i = 0; i < count; i++) { const at = (vertexOffset + i) * 3; colors[at] = color.r; colors[at + 1] = color.g; colors[at + 2] = color.b; }
    if (stamps) for (let i = 0; i < count; i++) stamps.set(mark, (vertexOffset + i) * 4);
    if (indexed) {
      const src = geometry.index.array;
      for (let i = 0; i < geometry.index.count; i++) index[indexOffset + i] = src[i] + vertexOffset;
      indexOffset += geometry.index.count;
    }
    vertexOffset += count;
  }
  const merged = new THREE.BufferGeometry();
  for (const name of names) merged.setAttribute(name, new THREE.BufferAttribute(out[name], first.attributes[name].itemSize, first.attributes[name].normalized));
  if (colors) merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (stamps) merged.setAttribute(stamp, new THREE.BufferAttribute(stamps, 4));
  if (index) merged.setIndex(new THREE.BufferAttribute(index, 1));
  return merged;
}
