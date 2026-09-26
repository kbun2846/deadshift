// Trees as a map's data (stage 2 of Hollow Wick, the trees): the kinds, and
// the colliders their trunks, stumps and fallen logs make. Pure (no three.js):
// the simulation, robots and the view all read it. The models are in
// world/trees.js; a map lists its trees as `map.trees` = { trees: [{ x, z,
// kind, s (scale), yaw }], stumps: [{ x, z, s, yaw }], logs: [{ x, z,
// length, radius, yaw }], drifts: [{ x, z, s, yaw }] } (Hollow Wick's:
// maps/hollow-wick-trees.js).
//
// Gameplay: a trunk is cover (a box its own size, 2.4 m tall, so rounds,
// pellets and low grenades meet it); canopies never block anything. Stumps
// and fallen logs are low: bodies walk round them, and a round flying 0.74 m
// over the ground passes over one lower than that and meets one taller
// (`lowTop`: rifle.js roundMeets takes the box's own top, not the usual
// "low cover meets a round at its own height").

// trunk: base radius (m, before scale); the collider is a square that wide.
export const TREE_KINDS = Object.freeze({
 woods: { trunk: .36, leafy: true },   // the North and West Woods: leafy canopies
 apple: { trunk: .3 },                 // the old orchard: gnarled, low, bare-ish
 elm: { trunk: .4 },                   // village trees: tall, bare, a few clumps
 old: { trunk: .55 },                  // the old trees by the meetinghouse
 willow: { trunk: .42 },               // alders and willows on the stream banks
 maple: { trunk: .62 },                // the fork's big maple
});
export const TRUNK_HEIGHT = 2.4, STUMP_RADIUS = .34;

export const trunkRadius = t => TREE_KINDS[t.kind].trunk * t.s;

export function treeColliders(trees) {
 const colliders = [];
 if (!trees) return colliders;
 for (const t of trees.trees || []) {
  const w = trunkRadius(t) * 2;
  colliders.push({ x: t.x, z: t.z, w, d: w, height: TRUNK_HEIGHT, tree: true });
 }
 for (const s of trees.stumps || []) {
  const w = STUMP_RADIUS * 2 * s.s;
  colliders.push({ x: s.x, z: s.z, w, d: w, height: .5 * s.s, lowTop: true, tree: true });
 }
 for (const l of trees.logs || []) {
  // A rotated box along the log (the same shape as a rotated prop's).
  const c = Math.cos(l.yaw), s = Math.sin(l.yaw), w = l.length, d = l.radius * 2;
  colliders.push({ x: l.x, z: l.z, w: Math.abs(w * c) + Math.abs(d * s), d: Math.abs(w * s) + Math.abs(d * c), angle: l.yaw, localW: w, localD: d,
   height: l.radius * 2 * .9, lowTop: true, tree: true });
 }
 return colliders;
}
