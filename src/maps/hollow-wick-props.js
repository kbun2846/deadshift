// Hollow Wick's open ground (stage 2, the props builder): the scarecrow
// field's stalks and shocks, farm and yard pieces, fences, stones, reeds, the
// orchard, and the set pieces. Plain data, spread into hollow-wick.js (props,
// crops, groundLayers); the models are src/world/hollow-props.js. Positions
// start from the layout's MARKS (hw-docs/hollow-wick-layout-data.md), moved
// where the baked ground or the paths needed it; tests/hollow-wick-props.test.js
// checks every one against the ground (on it, off path centre lines, out of
// the water, doorways and spawn areas).
//
// x east, z south, metres. `angle`: the prop's heading (its local x runs
// along (cos a, -sin a)); `face(a, b)` turns a prop's front (+z) from a toward b.
const mm = v => Math.round(v * 1000) / 1000;
const face = ([ax, az], [bx, bz]) => mm(Math.atan2(bx - ax, bz - az));
const along = ([ax, az], [bx, bz]) => mm(Math.atan2(-(bz - az), bx - ax));

// A fence along a polyline, split into panels of about 3 m (each a prop with
// its own collider), leaving `gaps` ([from, to] metres along the run) open.
// Every panel draws the post at its start; the last one before a gap or the
// end draws its end post too. Split-rail (worm) panels zigzag.
function fence(type, id, points, gaps = []) {
 const out = []; let at = 0, n = 0;
 for (let i = 0; i < points.length - 1; i++) {
  const a = points[i], b = points[i + 1], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  // Solid stretches of this leg (the gaps cut out).
  let pieces = [[0, length]];
  for (const [g0, g1] of gaps) pieces = pieces.flatMap(([s, e]) => { const c0 = g0 - at, c1 = g1 - at; if (c1 <= s || c0 >= e) return [[s, e]]; return [[s, Math.max(s, c0)], [Math.min(e, c1), e]].filter(([x, y]) => y - x > .5); });
  for (const [s, e] of pieces) {
   const count = Math.max(1, Math.round((e - s) / 3)), span = (e - s) / count;
   for (let k = 0; k < count; k++) {
    const t = (s + (k + .5) * span) / length;
    out.push({ type, id: `${id}-${n}`, x: mm(a[0] + (b[0] - a[0]) * t), z: mm(a[1] + (b[1] - a[1]) * t), angle: along(a, b), span: mm(span),
     ...(k === count - 1 ? { end: true } : {}), ...(type === 'splitRail' && n % 2 ? { flip: true } : {}),
     collisionBoxes: [[0, 0, mm(span), type === 'splitRail' ? .6 : .24, 1.1]] });
    n++;
   }
  }
  at += length;
 }
 return out;
}

// The east half of the field: patches of dead standing stalks about 6 x 8 m
// with 2 m mown lanes (crops.js, world/crop-view.js). None within 11 m of a
// crossing exit (the dam's south end, the footbridge; the bridge and the ford
// are far west), none within 3 m of a footpath.
export const HW_CROPS = [
 { id: 'stalks-a', x: 27, z: 35, w: 6, d: 8 },
 { id: 'stalks-b', x: 27, z: 45, w: 6, d: 8 },
 { id: 'stalks-c', x: 35, z: 45, w: 6, d: 8 },
 { id: 'stalks-d', x: 43, z: 45, w: 6, d: 8 },
 { id: 'stalks-e', x: 50.5, z: 41, w: 5, d: 8 },
].map(f => ({ ...f, visibility: 4.5, rows: 3, cols: 2, stalk: '#9a8a5c', bed: '#6e6444' }));

// Where you cross the stream: stalk patches keep 11 m from each.
export const CROSSING_EXITS = [[-14, 28.1], [-14, 16.4], [-2, 27.5], [-2, 15.5], [14, 25.4], [14, 14.4], [41, 27.9], [41, 18.5], [-32.6, 27], [-31.3, 15.75]];

// The west half, cut and stood in shocks: irregular rows.
const SHOCKS = [[2, 31.5], [6.2, 31], [-2, 37], [3.5, 36.6], [8.2, 37.4], [18.5, 37], [6, 41.6], [11, 42.4], [16, 41.8], [20.5, 42.6],
 [4.5, 46.6], [9.5, 47.4], [15, 46.8], [19.5, 47.6]];

// Reeds on the banks (never in the water): they screen, they don't block.
const REEDS = [[-10.4, 17.4], [-11, 25.6], [-8.4, 17.85], [-8.4, 25.75], [-5.8, 17.1], [-23.4, 18.05], [-20.8, 18.25], [-29, 24.95], [-26.4, 17.6], [45, 27.7], [47.6, 27.45]];

// The orchard behind the rear houses and its trees (gaps where trees died).
const ORCHARD = [[27, -42], [32.5, -41.6], [38, -42.2], [48.5, -41.8], [29.5, -44], [35, -44.2], [40.5, -43.8], [46, -44.1], [50.4, -44.3], [27.5, -46.2], [38, -46.4], [43.5, -46.1]];

// The drag trail: from the main path, across the lane and the back trail,
// into the North Woods, stopping dead.
export const DRAG_TRAIL = [[13, -9.9], [11.4, -12.8], [10, -15.5], [8.2, -18.6], [6.5, -22], [6.2, -28.5], [6, -36], [6.6, -42.5], [8, -49.5]];

export const HW_PROPS = [
 // --- The scarecrow field ---
 ...SHOCKS.map(([x, z], i) => ({ type: 'cornShock', id: `shock-${i}`, x, z })),
 { type: 'scarecrow', id: 'scarecrow-dam', x: 16.5, z: 30, angle: face([16.5, 30], [14, 20]) },
 { type: 'scarecrow', id: 'scarecrow-path', x: -3.5, z: 33.2, angle: face([-3.5, 33.2], [-8.6, 32]) },
 { type: 'emptyCross', id: 'empty-cross', x: 40, z: 34, angle: .15 },
 { type: 'oxCart', id: 'cart', x: 22, z: 33, angle: -.35 },
 { type: 'cornCrib', id: 'crib', x: .2, z: 44.6, angle: .12 },
 { type: 'skeletonSickle', id: 'skeleton-field', x: 14, z: 38, angle: .4 },
 { type: 'stonePile', id: 'field-stones-1', x: 33, z: 31.5, angle: .3 },
 { type: 'stonePile', id: 'field-stones-2', x: 13, z: 45, angle: 1.2 },
 { type: 'fieldBoulder', id: 'field-boulder', x: 47.5, z: 34, angle: 2.1 },
 { type: 'fieldWall', id: 'field-wall-1', x: 52, z: 31.5, angle: .25 },
 { type: 'fieldWall', id: 'field-wall-2', x: 31, z: 40, angle: 0 },
 { type: 'fieldWall', id: 'field-wall-3', x: -3, z: 39.8, angle: -.1 },
 // The field's west edge, where the terrace comes down to it.
 ...fence('splitRail', 'field-west', [[-10.6, 37], [-10.3, 42.5], [-10, 48.8]], [[5.2, 7.6]]),
 // --- The south terrace: the farm, its yard and pasture, the woodshed ---
 { type: 'haystack', id: 'haystack', x: -36, z: 46.2 },
 { type: 'woodpile', id: 'woodpile-farm', x: -48.8, z: 38.6, angle: mm(Math.PI / 2) },
 { type: 'choppingBlock', id: 'block-farm', x: -47.6, z: 36.6 },
 { type: 'woodpile', id: 'woodpile-shed', x: -19.2, z: 43.4, angle: .05 },
 { type: 'waterTrough', id: 'trough-farm', x: -52.2, z: 44, angle: mm(Math.PI / 2) },
 { type: 'stonePile', id: 'terrace-stones', x: -34, z: 39.5, angle: .8 },
 { type: 'fieldWall', id: 'terrace-wall-1', x: -26, z: 45.5, angle: .4 },
 { type: 'fieldBoulder', id: 'terrace-boulder', x: -18, z: 47, angle: .6 },
 ...fence('railFence', 'farm-yard', [[-47.2, 46.2], [-40, 46.2], [-38.6, 46.2]], [[3.6, 6.8]]),
 ...fence('splitRail', 'pasture', [[-56.2, 33.4], [-50.8, 33.4], [-50.8, 48.2]], [[11.4, 14]]),
 // --- The fork ---
 { type: 'markerStone', id: 'fork-marker', x: -7.5, z: -4.6, angle: .2 },
 { type: 'stonePile', id: 'fork-stones', x: -16.4, z: 2.4, angle: .4 },
 { type: 'fieldBoulder', id: 'fork-boulder', x: -4.6, z: 4.8, angle: 1.1 },
 { type: 'fieldWall', id: 'fork-wall', x: -13.4, z: -10.4, angle: .12 },
 { type: 'fieldWall', id: 'fork-wall-west', x: -19.6, z: -3.4, angle: 1.45 },
 { type: 'stonePile', id: 'fork-stones-2', x: -6.4, z: -7.6, angle: 2 },
 { type: 'fieldBoulder', id: 'fork-boulder-2', x: -14.6, z: 4.2, angle: .3 },
 // --- The green and the town's yards ---
 { type: 'wellSweep', id: 'well', x: 19.6, z: -2.6, angle: 2.64 },
 { type: 'waterTrough', id: 'trough-green', x: 21.6, z: -5.2, angle: -.2 },
 { type: 'woodpile', id: 'woodpile-lane', x: 14.2, z: -.6, angle: .1 },
 { type: 'choppingBlock', id: 'block-lane', x: 16.3, z: -1.5 },
 { type: 'woodpile', id: 'woodpile-gambrel', x: 19.6, z: -27.8, angle: mm(Math.PI / 2) },
 { type: 'woodpile', id: 'woodpile-lit', x: 23.2, z: -35.6, angle: mm(Math.PI / 2) },
 { type: 'woodpile', id: 'woodpile-saltbox', x: 53.4, z: -35.2, angle: mm(Math.PI / 2) },
 ...fence('railFence', 'front-yards', [[33.6, -13.2], [55, -13.2]], [[3.4, 6.4], [14.8, 19]]),
 ...fence('railFence', 'orchard', [[23, -39.4], [52.4, -39.4], [52.4, -47.2], [23, -47.2], [23, -39.4]], [[5.6, 8.4], [21.6, 24.4], [45.5, 48.5], [69.6, 72.2]]),
 ...ORCHARD.map(([x, z], i) => ({ type: 'orchardTree', id: `apple-${i}`, x, z })),
 // --- The stream's banks ---
 ...REEDS.map(([x, z], i) => ({ type: 'reeds', id: `reeds-${i}`, x, z, angle: mm(Math.sin(i * 7.1) * .25) })),
 // --- Set pieces ---
 { type: 'hangingTree', id: 'hanging-tree', x: -4, z: -24, angle: .35 },
 { type: 'dragTrail', id: 'drag-trail', x: DRAG_TRAIL[0][0], z: DRAG_TRAIL[0][1], angle: 0, points: DRAG_TRAIL },
 { type: 'bodyPile', id: 'body-pile', x: -45.8, z: 14.6, angle: -.08 },
 { type: 'skeletonLeaves', id: 'skeleton-woods', x: -9, z: -55, angle: -.7 },
 { type: 'rockingChair', id: 'rocking-chair', x: 15.1, z: -19.3, angle: 0, stoop: true },
];

// The ground round the body pile, tinted slightly reddish (ground-layers.js).
export const HW_GROUND_LAYERS = [
 { poly: [[-50, 12.2], [-41.5, 12.4], [-40.5, 16.8], [-50.5, 16.6]], colour: '#5e3f33', feather: 1.6, mix: .45, noise: .5 },
];
