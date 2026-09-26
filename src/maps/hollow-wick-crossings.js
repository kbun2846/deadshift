// Hollow Wick's crossings and mill wheel (stage 2, s2-crossings): the looks of
// what stands over and in the stream. The decks themselves (where you walk,
// their heights) stay in hollow-wick.js terrain.decks; this is only what the
// view builds round them (render/crossing-decks.js, world/mill-wheel.js).
// Nothing here has a collider but the mill wheel's (`solid`): the water has
// none (owner, 2026-09-26: wade anywhere, step off a deck's side into the
// stream), but a turning wheel you walk through is a bug.
export const CROSSINGS = {
 // Each deck's look, by its id: 'bridge' an open timber bridge on stone
 // abutments, 'log' a fallen trunk, 'footbridge' planks on trestles.
 decks: {
  bridge: { kind: 'bridge', stringers: 4, kingposts: true },
  // The root plate lies on the south bank (the tree fell north across the
  // stream), tipped to the east of the log's end so the end stays walkable.
  log: { kind: 'log', radius: .55, rootEnd: 1, rootSide: 1 },
  footbridge: { kind: 'footbridge', planks: 3, trestles: 2 },
 },
 // The mill dam: a timber crib across the stream whose downstream (west)
 // face stands where the water drops (x 14, water-mesh.js), its top a hand
 // over the mill pond (0), a sheet of water spilling over it to the tail
 // water (-0.3), and rubble at its foot. z0..z1 runs into both banks.
 // (Now the terrain's own stone dam, a walk across the stream: its faces
 // are the retaining walls. The timber crib is kept for a map that wants one.)
 dam: null,
 // The gristmill's undershot wheel on the mill's south wall (the mill's
 // foundation edge runs along z 17.25): turning slowly with the stream
 // (bottom going west), its axle into the wall, an outboard bearing post,
 // and a race of boards guiding the water under it from a sluice gate.
 wheel: { x: 22, z: 19.5, wall: 17.25, radius: 1.45, width: .7, axleY: 1.42, paddles: 12, turn: .45, water: 0, race: [25.4, 20.1] },
 // The one thing in the water you cannot walk through: the wheel with its
 // axle to the wall and its bearing post, and the race's sluice gate
 // (map-kit.js mapColliders: `streamWorks` boxes; shots meet them too).
 solid: [
  { x: 22, z: 18.95, w: 3, d: 3.3, height: 2.9 },
  { x: 24.5, z: 19.5, w: 2, d: 1.2, height: 1.4 },
 ],
 // Stones in the stream (x, z, size): shallow spots, clear of the ford's
 // lane (x -2), the decks, the dam and the wheel (tests/hollow-wick-crossings).
 stones: [
  [-53.3, 20.3, .34], [-45.9, 20.2, .4], [-36.7, 22.8, .3], [-28.6, 22.3, .54], [-21.8, 20.5, .42],
  [-9.6, 19.8, .3], [5, 22.9, .38], [7.5, 17.6, .3], [10.6, 23.1, .34], [24.7, 25.3, .6],
  [32.3, 20, .57], [34.3, 25, .56], [48.2, 25.9, .38], [54.4, 19.8, .32],
 ],
};
