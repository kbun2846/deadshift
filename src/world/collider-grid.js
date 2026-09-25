// A broad phase for the map's colliders (v148, owner: "fix lag"): the map has
// ~830 boxes and every body, bullet, orb and pellet used to test every one of
// them every step. A uniform grid (CELL metres) built once per colliders array
// (rebuilt when the array is swapped or its length changes: props break by
// filtering, come back by pushing) answers "which boxes could touch this
// rectangle", in the array's own order so results match a full scan.
const CELL = 4;
const GRIDS = new WeakMap();

function build(colliders) {
 const cells = new Map();
 colliders.forEach((c, i) => {
  const x0 = Math.floor((c.x - c.w / 2) / CELL), x1 = Math.floor((c.x + c.w / 2) / CELL);
  const z0 = Math.floor((c.z - c.d / 2) / CELL), z1 = Math.floor((c.z + c.d / 2) / CELL);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
   const k = x * 4096 + z; let list = cells.get(k);
   if (!list) cells.set(k, list = []);
   list.push(i);
  }
 });
 const g = { n: colliders.length, cells, mark: new Uint32Array(colliders.length), stamp: 0 };
 GRIDS.set(colliders, g);
 return g;
}

// The colliders that may overlap [x0, x1] x [z0, z1], in array order.
export function nearColliders(colliders, x0, z0, x1, z1) {
 let g = GRIDS.get(colliders);
 if (!g || g.n !== colliders.length) g = build(colliders);
 if (++g.stamp === 0xffffffff) { g.mark.fill(0); g.stamp = 1; }
 const out = [], s = g.stamp;
 const cx0 = Math.floor(Math.min(x0, x1) / CELL), cx1 = Math.floor(Math.max(x0, x1) / CELL);
 const cz0 = Math.floor(Math.min(z0, z1) / CELL), cz1 = Math.floor(Math.max(z0, z1) / CELL);
 // A very long query (a far bullet) is cheaper as a full scan.
 if ((cx1 - cx0 + 1) * (cz1 - cz0 + 1) > 64) return colliders;
 for (let x = cx0; x <= cx1; x++) for (let z = cz0; z <= cz1; z++) {
  const list = g.cells.get(x * 4096 + z); if (!list) continue;
  for (const i of list) if (g.mark[i] !== s) { g.mark[i] = s; out.push(i); }
 }
 out.sort((a, b) => a - b);
 for (let k = 0; k < out.length; k++) out[k] = colliders[out[k]];
 return out;
}
// Along a segment, padded.
export const collidersAlong = (colliders, ax, az, bx, bz, pad = 0) => nearColliders(colliders, Math.min(ax, bx) - pad, Math.min(az, bz) - pad, Math.max(ax, bx) + pad, Math.max(az, bz) + pad);
