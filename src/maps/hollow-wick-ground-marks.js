// Hollow Wick's ground marks (stage 5, s5-ground): the map data that
// world/ground-marks.js turns into marks lying on the ground (wagon ruts,
// puddles, prints, spilled straw, chips, ash, grain, drifted leaves). Most of
// it is worked out from the map itself (every woodpile, chopping block,
// haystack, well, trough, barn and mill door, fieldstone wall and building
// corner); this file holds only what the map cannot say on its own: which
// roads carts used, where rock shows through them, where a cart turned in or
// a horse stood, and the one trail of bare feet.
//
// x east, z south, metres. Paths are named by their ids in hollow-wick.js
// terrain.paths; a plain [x, z] in a chain is a point of its own.

export const HW_GROUND_MARKS = {
 // Wagon ruts: a pair of wheel ruts (1.44 m apart, the gauge of a farm cart)
 // with the horse's trodden way between them. `chain`: the road as path ids
 // and points; `wear` 0..1 how deep and dark; `wander` how far the pair
 // strays off the path's centre line (m); `cell` the atlas strip ('ruts' deep
 // and wet, 'ruts-old' shallower, grassed on the crown); `puddles` how many
 // of its low points hold water (3 unless given). Each road fades in
 // and out over its first and last few metres, stops short of every deck and
 // breaks over the ledges below.
 ruts: [
  // The town street and down the terraced slope to the fork.
  { id: 'town-road', chain: ['main-east', 'main-slope'], wear: 1, wander: .3, cell: 'ruts', puddles: 5 },
  // From the fork down to the bridge, over it, and on up to the field.
  { id: 'bridge-road', chain: [[-4, -3.2], [-8.6, -1.6], 'sw-branch', 'bridge-south'], wear: .85, wander: .18, cell: 'ruts' },
  // The meeting road up Church Hill (the hearse's way too): less used.
  { id: 'meeting-road', chain: [[-5, -3.1], 'nw-branch'], wear: .7, wander: .16, cell: 'ruts-old' },
 ],
 // A second, older pair beside the first on the wide town street (other carts,
 // other years), only along part of it. `offset` m to the left of the road's
 // line; `from`/`to` m along the road.
 oldRuts: [{ road: 'town-road', offset: .55, from: 14, to: 33, wear: .36, cell: 'ruts-old' }],
 // Rock showing through the road where it was cut down a terrace edge or up
 // a bank: [x, z, across, along, heading (rad)]. The ruts break over them.
 ledges: [
  [9.1, -3.75, 2.6, 1.5, -1.57], [5.2, -8.15, 2.4, 1.4, -1.6], [-33.4, -17.6, 2.2, 1.6, -1.08], [-11.2, 29.8, 2.4, 1.3, 1.2],
 ],
 // Where carts turned off the road into a door (cubic curves: road, two
 // pulls, the threshold). The horse walked between the wheels.
 cartTracks: [
  // Into the barn's big west doors: off the street, down the strip between
  // the gully and the barn, and in.
  { id: 'barn', curve: [[41.5, -9.2], [45.4, -8.6], [44.6, -1.4], [46.2, -.1]], wear: .75 },
  // Across the town yard to the forge's open north side (a wheel to be tyred).
  { id: 'forge', curve: [[27.2, -9.6], [29.8, -8.2], [32.6, -4.2], [32.5, -.9]], wear: .6 },
 ],
 // Where a horse stood (churned mud and a ring of prints): [x, z, radius].
 // The smith's shoeing spot by the forge's east side, beside the barn door
 // where the cart was unloaded, and the tavern's front on the street. (The
 // troughs get theirs from the placement: the side they drank from.)
 trampled: [[35.8, 2.3, .85], [45.4, 1.6, .75], [26.6, -12.3, 1.1]],
 // The bare footprints: out of the body pile, down the bank and into the
 // stream. They never come out.
 barefoot: [[-43.7, 12.4], [-42.1, 12.9], [-40.5, 13.6], [-39.4, 14.6], [-38.9, 15.7], [-38.75, 16.7]],
 // The forge's ash heap (raked out behind the forge against the town's
 // retaining wall) and the cinders thrown out of its sides: [x, z, across,
 // along, heading].
 ash: [[31.2, 5.8, 2, 1.1, 0], [32.4, -.9, 1.8, 1.2, 3.14], [35.7, 3.3, 1.4, 1.1, 1.57]],
 // Grain spilled at the mill's east door (sacks went out that way to the
 // carts on the hollow path), and dribbled from a torn one carried off
 // north-east toward the path.
 grain: { building: 'mill', side: 'right', dribble: [[28.9, 12.4], [29.9, 11.3], [30.7, 10.1]] },
};
