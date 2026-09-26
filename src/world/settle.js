// Hills: a flat-based piece on a slope settles down to its lowest side
// instead of hanging off the slope (stage 4 audit: stone piles, boulders, a
// table tomb's plinth, cordwood and sacks floated up to 0.2 m on their downhill
// side, standing at the ground under their centre). The group drops by how
// much lower the ground is anywhere under its footprint (sampled at `reach` of
// its half extents: its corners, its edges' middles), so it is a little
// buried uphill rather than floating downhill. Nothing on a flat map.
export function settle(view, p, g, w, d, reach = .75) {
 const ground = view.ground; if (!ground || ground.flat || !(w > 0) || !(d > 0)) return 0;
 const a = p.angle || 0, c = Math.cos(a), s = Math.sin(a), y0 = ground.heightAt(p.x, p.z);
 let low = y0;
 for (const [u, v] of SAMPLES) {
  const lx = u * w / 2 * reach, lz = v * d / 2 * reach;
  low = Math.min(low, ground.heightAt(p.x + lx * c + lz * s, p.z - lx * s + lz * c));
 }
 const drop = y0 - low;
 if (drop > 1e-4) g.position.y -= drop;
 return drop;
}
const SAMPLES = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]];
