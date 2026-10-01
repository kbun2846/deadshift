// Lumen's walk grid (stage 2): where a body (radius .38) can stand on a
// 0.25 m grid, from the map's own colliders, and how far it walks from a
// point to anywhere (8-way Dijkstra). Shared by tools/lumen-walk.mjs and
// tests/lumen-spawns.test.js. No DOM, no three.js.
import { mapColliders } from '../src/maps.js';
import { isPlayable } from '../src/playable-area.js';
import { inside } from '../src/simulation.js';

export function walkGrid(map) {
  const colliders = mapColliders(map).filter(c => !c.walkOver);
  const G = .25, X0 = -72, Z0 = -64, NX = Math.round(144 / G), NZ = Math.round(128 / G), R = .38;
  const free = new Uint8Array(NX * NZ);
  // colliders bucketed by 4 m cells (what can touch a body there)
  const B = 4, buckets = new Map(), key = (bx, bz) => bx * 1000 + bz;
  for (const c of colliders) for (let bx = Math.floor((c.x - c.w / 2 - R) / B); bx <= Math.floor((c.x + c.w / 2 + R) / B); bx++) for (let bz = Math.floor((c.z - c.d / 2 - R) / B); bz <= Math.floor((c.z + c.d / 2 + R) / B); bz++) { const k = key(bx, bz); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(c); }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = X0 + (i + .5) * G, z = Z0 + (j + .5) * G;
    if (!isPlayable(map, x, z, R)) continue;
    let ok = true;
    for (const c of buckets.get(key(Math.floor(x / B), Math.floor(z / B))) || []) { if (Math.abs(x - c.x) > c.w / 2 + R + .01 || Math.abs(z - c.z) > c.d / 2 + R + .01) continue; if (inside({ x, z }, c, R)) { ok = false; break; } }
    free[j * NX + i] = ok ? 1 : 0;
  }
  const cell = (x, z) => [Math.floor((x - X0) / G), Math.floor((z - Z0) / G)];
  function walk(x, z) {
    const dist = new Float64Array(NX * NZ).fill(Infinity), [si, sj] = cell(x, z);
    // (a start that falls in a blocked cell steps to the nearest free one)
    let start = sj * NX + si;
    if (!free[start]) { let best = Infinity; for (let dj = -8; dj <= 8; dj++) for (let di = -8; di <= 8; di++) { const k = (sj + dj) * NX + si + di; if (free[k] && di * di + dj * dj < best) { best = di * di + dj * dj; start = k; } } }
    dist[start] = 0;
    // A bucketed Dijkstra (steps are 1 or sqrt 2 cells).
    const heap = [[0, start]];
    const push = (d, k) => { heap.push([d, k]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
      const [d, k] = pop(); if (d > dist[k]) continue;
      const i = k % NX, j = (k / NX) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ) continue;
        const n = jj * NX + ii; if (!free[n]) continue;
        if (di && dj && (!free[j * NX + ii] || !free[jj * NX + i])) continue;
        const nd = d + (di && dj ? Math.SQRT2 : 1) * G; if (nd < dist[n]) { dist[n] = nd; push(nd, n); }
      }
    }
    return dist;
  }
  const at = (dist, x, z) => { const [i, j] = cell(x, z); let best = Infinity; for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) best = Math.min(best, dist[(j + dj) * NX + i + di] ?? Infinity); return best; };
  return { free, walk, at, cell, G, X0, Z0, NX, NZ };
}
