// Lumen's road-end barricades (stage 1; drawn here, collide as `map.solids`
// with `barricade: true`, world/lumen-edge.js). Each closes a road where it
// leaves the map: a solid line of water-filled barriers (alternating dull red
// and white, their seams overlapping: no gap), striped caution boards on
// stands carrying pictograms only (a warning triangle, a raised hand), and
// behind it, outside the playable area, a stopped truck with its hazards
// dark. Built into the view's static scenery (merged with it); low-poly,
// flat, no lettering.
import * as THREE from 'three';

export const BARRICADE_LOOK = Object.freeze({
  barrier: ['#7e2a2f', '#b9bcc2'], barrierLength: 1.9, stripe: ['#fcee0a', '#26282d'], board: '#2b2e34', pictogram: '#e6e8ec',
  truck: { cab: '#4a4f58', box: '#6a6e75', glass: '#14171d', wheel: '#15171b' },
});

export function buildBarricades(view, map) {
  const L = BARRICADE_LOOK;
  for (const s of map.solids || []) {
    if (!s.barricade) continue;
    const root = new THREE.Group(); root.position.set(s.x, 0, s.z);
    // local frame: x along the barricade, z toward the outside (away from play)
    const along = Math.max(s.w, s.d), across = Math.min(s.w, s.d);
    root.rotation.y = s.angle !== undefined ? s.angle : s.w >= s.d ? 0 : Math.PI / 2;
    // which way local +z points in the world, and so which side is outside
    const r = root.rotation.y, [ox, oz] = s.out || [0, 1], outward = Math.sign(ox * Math.sin(r) + oz * Math.cos(r)) || 1;
    view.static.add(root);
    const box = (x, y, z, w, h, d, colour) => { const m = view.box(x, y, z, w, h, d, colour, root); return m; };
    // water-filled barriers: tapered blocks (a wide foot, a narrow top) end to end
    const n = Math.ceil(along / L.barrierLength), len = along / n;
    for (let i = 0; i < n; i++) {
      // (every other block 4 mm fuller: the 4 cm where two overlap had their
      // faces in one plane, red and white flickering through each other)
      const x = -along / 2 + len * (i + .5), colour = L.barrier[i % 2], hair = (i % 2) * .004;
      box(x, .3, 0, len + .04, .6 + hair, across + hair, colour);
      box(x, .82, 0, len - .12, .46, across * .62 + hair, colour);
      box(x, 1.1, 0, len - .3, .12, across * .45 + hair, colour); // the filler cap
    }
    // caution boards on stands, a little behind the barriers, every ~4 m
    const boards = Math.max(2, Math.round(along / 4.2));
    for (let i = 0; i < boards; i++) {
      const x = -along / 2 + along * (i + .5) / boards, z = outward * (across / 2 + .35);
      for (const lx of [-.7, .7]) box(x + lx, .75, z, .08, 1.5, .08, '#3a3d44');
      // stripes: diagonal-looking steps of lemon and graphite
      for (let k = 0; k < 6; k++) box(x - .6 + k * .24, 1.28, z, .24, .34, .06, L.stripe[k % 2]);
      // a board with a pictogram above it: a warning triangle or a raised hand
      box(x, 1.82, z, .8, .62, .05, L.board);
      if (i % 2 === 0) pictogramTriangle(box, x, 1.82, z - outward * .03, L.pictogram);
      else pictogramHand(box, x, 1.82, z - outward * .03, L.pictogram);
    }
    // the stopped truck behind (outside the play area)
    const tz = outward * (across / 2 + 5.5), T = L.truck;
    box(0, 1.9, tz, 6.2, 2.9, 2.5, T.box);
    box(-4, 1.35, tz, 2, 1.9, 2.4, T.cab); box(-4.71, 1.75, tz, .6, .8, 2.2, T.glass); // (the glass 1 cm proud of the cab's face, not in its plane)
    for (const wx of [-4.2, -1.2, 2.2]) for (const wz of [-1.1, 1.1]) box(wx, .45, tz + wz, .9, .9, .35, T.wheel);
  }
}

// A warning triangle: three bars and a dot (no mark that reads as a letter).
function pictogramTriangle(box, x, y, z, colour) {
  const g = box(x, y - .16, z, .5, .06, .02, colour); void g;
  const a = box(x - .13, y + .02, z, .06, .44, .02, colour); a.rotation.z = -.52;
  const b = box(x + .13, y + .02, z, .06, .44, .02, colour); b.rotation.z = .52;
  box(x, y - .05, z, .08, .08, .02, colour);
}
// A raised hand: a palm and four fingers and a thumb.
function pictogramHand(box, x, y, z, colour) {
  box(x, y - .08, z, .22, .2, .02, colour);
  for (let f = 0; f < 4; f++) box(x - .09 + f * .06, y + .08, z, .04, .16 + (f === 1 || f === 2 ? .04 : 0), .02, colour);
  const t = box(x + .15, y - .06, z, .04, .12, .02, colour); t.rotation.z = -.6;
}
