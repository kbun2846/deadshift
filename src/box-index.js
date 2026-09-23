// A coarse grid over a fixed list of boxes, so "does any of these boxes pass
// this test near (x, z)?" only visits the boxes that could possibly pass.
//
// Terrain generation asks exactly that tens of thousands of times -- every
// candidate tuft of grass, sand mark and worn patch is checked against every
// collider on the map -- and a full scan per question was a large share of the
// load. `some` returns exactly what `boxes.some(test)` would, provided `test`
// can only pass for a box within `reach` of the point on each axis: callers
// pass the padding their test uses, and the index widens it to cover boxes
// that are rotated.

const cellKey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

// Half-extents that contain the box however it is described: rotated boxes
// carry local dimensions, and their world footprint fits within the circle
// through their corners.
function halfExtents(box) {
  if (box.angle && box.localW !== undefined) {
    const r = Math.hypot(box.localW, box.localD) / 2;
    return [Math.max(r, (box.w || 0) / 2), Math.max(r, (box.d || 0) / 2)];
  }
  return [(box.w || 0) / 2, (box.d || 0) / 2];
}

export function boxIndex(boxes, cell = 4) {
  const cells = new Map();
  boxes.forEach((box, i) => {
    const [hx, hz] = halfExtents(box);
    for (let cx = Math.floor((box.x - hx) / cell); cx <= Math.floor((box.x + hx) / cell); cx++)
      for (let cz = Math.floor((box.z - hz) / cell); cz <= Math.floor((box.z + hz) / cell); cz++) {
        const key = cellKey(cx, cz);
        let bucket = cells.get(key); if (!bucket) cells.set(key, bucket = []);
        bucket.push(i);
      }
  });
  const seen = new Uint32Array(boxes.length);
  let stamp = 0;
  return {
    // `padding` is the padding the test applies. A rotated box can pass up to
    // padding * sqrt(2) away along an axis, so the search is widened to match.
    some(x, z, padding, test) {
      // Called the array way, some(test) would quietly search nowhere and
      // answer false. Fail loudly instead.
      if (typeof test !== 'function' || !Number.isFinite(x) || !Number.isFinite(z)) throw new TypeError('boxIndex.some(x, z, padding, test)');
      if (++stamp === 0xffffffff) { seen.fill(0); stamp = 1; }
      const reach = Math.max(0, padding) * 1.5;
      for (let cx = Math.floor((x - reach) / cell); cx <= Math.floor((x + reach) / cell); cx++)
        for (let cz = Math.floor((z - reach) / cell); cz <= Math.floor((z + reach) / cell); cz++) {
          const bucket = cells.get(cellKey(cx, cz)); if (!bucket) continue;
          for (const i of bucket) {
            if (seen[i] === stamp) continue;
            seen[i] = stamp;
            if (test(boxes[i])) return true;
          }
        }
      return false;
    },
  };
}
