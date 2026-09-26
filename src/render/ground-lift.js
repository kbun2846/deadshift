// Hills (world/heightfield.js), for the drawing side: the ground's height
// under (x, z) as a view sees it. 0 on a flat map, and 0 for a view with no
// ground at all (the tests' stand-in views), so every effect can add it
// without asking which kind of map it is on.
export const groundY = (view, x, z) => view?.ground && !view.ground.flat ? view.ground.heightAt(x, z) : 0;
// The floor under something that may lie under a deck (a body that died
// wading under a bridge: `below`): the drawn ground there, not the deck's top.
export const floorY = (view, x, z, below) => view?.ground && !view.ground.flat ? (below ? view.ground.drawnHeightAt(x, z) : view.ground.heightAt(x, z)) : 0;
// Does this view stand on hills (else every height is exactly as it was)?
export const hilly = view => !!view?.ground && !view.ground.flat;
// Hills: a height that follows the ground under something flying on (a
// Ballast pellet's spent ghost) but climbs and drops no steeper than 1:1, so
// crossing a retaining wall's edge it glides down to the lower level instead
// of jumping. `s` { x, z, h, rise } is its own state, kept by its view from
// frame to frame; returns s.h. (Rounds themselves fly by roundFlight, below.)
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
// A flying round's flight over the ground (world/heightfield.js flight; its
// height `s` m along its path is view.ground.flightAt(f, s)): the
// simulation's own when the round carries one (on the host), else worked out
// once from where it set off (`fromX`, `fromZ`, over `fromGround`: a mirrored
// round) and kept in `cache` (a WeakMap by round), again when its object now
// carries another round (the network reuses them).
export function roundFlight(view, cache, b, fromX, fromZ, fromGround, range, lead = 0) {
 if (b.flight) return b.flight;
 let f = cache.get(b);
 if (!f || f.dx !== b.dx || f.dz !== b.dz || Math.abs(f.x - fromX) > .3 || Math.abs(f.z - fromZ) > .3) { f = view.ground.flight(fromX, fromZ, b.dx, b.dz, range, fromGround, lead); cache.set(b, f); }
 return f;
}
// How steeply a flight climbs `s` m along it (a round's tilt).
export const flightRise = (ground, f, s) => (ground.flightAt(f, s + .25) - ground.flightAt(f, s - .25)) / .5;
// (The old call, for any code still using it: a round's height over the
// ground and its tilt where it is now, from its flight: { h, rise }.)
export function roundGlide(view, cache, b, fromX, fromZ, fromGround, range = 80) {
 const f = roundFlight(view, cache, b, fromX, fromZ, fromGround, range), s = Math.max(0, (b.x - f.x) * f.dx + (b.z - f.z) * f.dz);
 return { h: view.ground.flightAt(f, s), rise: flightRise(view.ground, f, s) };
}
