// Hills (world/heightfield.js), for the drawing side: the ground's height
// under (x, z) as a view sees it. 0 on a flat map, and 0 for a view with no
// ground at all (the tests' stand-in views), so every effect can add it
// without asking which kind of map it is on.
export const groundY = (view, x, z) => view?.ground && !view.ground.flat ? view.ground.heightAt(x, z) : 0;
// Does this view stand on hills (else every height is exactly as it was)?
export const hilly = view => !!view?.ground && !view.ground.flat;
// Hills: the ground a flying round is drawn over. It follows the ground under
// the round but climbs and drops no steeper than 1:1, so a round crossing a
// retaining wall's edge glides down to the lower level (or runs into the
// wall's face and is hidden by it) instead of jumping. `s` { x, z, h, rise }
// is the round's own state, kept by its view from frame to frame; returns s.h.
export function glide(view, s, x, z) {
 const dx = x - s.x, dz = z - s.z, length = Math.hypot(dx, dz);
 if (length > 1e-9) {
  const n = Math.ceil(length / .5), step = length / n;
  for (let i = 1; i <= n; i++) {
   const g = view.ground.heightAt(s.x + dx * i / n, s.z + dz * i / n), h = Math.max(s.h - step, Math.min(s.h + step, g));
   s.rise = (h - s.h) / step; s.h = h;
  }
  s.x = x; s.z = z;
 }
 return s.h;
}
// A round's glide state, kept in `states` (a WeakMap by round). Started at
// (fromX, fromZ) over `fromGround` (where it set off, the ground its shooter
// stood on) when the round is new, or when its object now carries another
// round (the network reuses them): anything off the line it was following.
export function roundGlide(view, states, b, fromX, fromZ, fromGround) {
 let s = states.get(b);
 if (!s || Math.abs((b.x - s.x) * b.dz - (b.z - s.z) * b.dx) > .3 || (b.x - s.x) * b.dx + (b.z - s.z) * b.dz < -3) {
  s = { x: fromX, z: fromZ, h: fromGround, rise: 0 }; states.set(b, s);
 }
 glide(view, s, b.x, b.z);
 return s;
}
