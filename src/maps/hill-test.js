// Test Hill: the small proving ground for the hills system (stage 0 of
// Hollow Wick). Development only: ?map=hill-test, or Developer tools > World.
// A round hill with a crest to hide behind, a plateau with retaining walls
// and a ramp, a hollow to shoot across, a house on the plateau and a barn on
// a pad cut into the hill's flank, and targets above and below you.
import { building } from '../map-kit.js';

const house = (id, x, z, w, d, height, baseY, extra = {}) => ({ ...building(id, x, z, w, d, height, '', '#7d7a72', '#3a3632'), baseY, ...extra });

export const hillTest = {
 id: 'hill-test', name: 'Test Hill', width: 72, depth: 60,
 spawn: { x: 0, z: 6 }, palette: { ground: '#6e6a50', road: '#857a5c' },
 // A low dusk sun from the west-south-west (about 20 degrees up), as Hollow
 // Wick's: long hill shade east of every rise (render/map-look.js sunOffset).
 // Grey-white fog sheets gathering in the hollow, as Hollow Wick's
 // (render/fog-sheets.js).
 look: { warmth: .05, sunOffset: { x: -43, y: 17, z: 18 }, fog: { colour: '#c4c7c3', opacity: .34, lowBias: 1 } },
 // Ground colour layers (render/ground-layers.js): leaf litter by the dead
 // tree, stubble east of the start, a packed yard at the barn, and the
 // hollow's floor darker than damp.
 groundLayers: [
  { poly: [[-16, -4], [-7, -7], [-2, -1], [-5, 6], [-13, 7], [-17, 3]], colour: ['#8a6a3e', '#7a5a34', '#6e4a2c'], feather: 1.5, mix: .7, noise: .6 },
  { poly: [[12, 2], [28, 1], [30, 12], [13, 13]], colour: '#8a7a4e', feather: .8, mix: .85, noise: .3 },
  { poly: [[16, -23], [28, -23], [28, -12], [16, -12]], colour: '#857a5c', feather: .6, mix: .6, noise: .4 },
 ],
 terrainLook: { hollow: '#4a4f48', hollowBelow: -.8, hollowDepth: .6 },
 terrain: {
  bounds: [-52, -46, 52, 46],
  base: 0, noise: { cell: 9, amp: .12, seed: 11 },
  // The plateau (+2.5): walls on its east and south, gentle slopes north and
  // west (the walls fade out where those wrap round the corners), and a
  // walled ramp down through an opening in the south wall.
  levels: [{ id: 'plateau', h: 2.5, grade: .25, cliffs: [1, 2, 4], openings: [3],
   poly: [[-32, -24], [-12, -24], [-12, -10], [-18, -10], [-22, -10], [-32, -10]] }],
  // The ramp's side walls, from the opening down to where it meets the ground.
  edges: [{ points: [[-22.05, -10.2], [-22.05, -1.5]] }, { points: [[-17.95, -10.2], [-17.95, -1.5]] }],
  // The hill (+3.5 at the top): no side steeper than about 30%.
  knolls: [{ x: 14, z: -10, r: 18, h: 3.5 }],
  // The hollow (-1.6) across the south.
  carves: [{ line: [[-14, 20], [24, 20]], half: 3, floor: -1.6, grade: .22, reach: 12 }],
  paths: [{ points: [[-20, -10.5, 2.5], [-20, -1, 0]], width: 3.6, shoulder: .5 }],
 },
 buildings: [
  house('plateau-house', -25, -18, 6, 5, 2.8, 2.5, { doors: ['front', 'right'] }),
  // Cut into the hill's flank: the pad's banks run out over 5 m (so no bank
  // is steeper than an orb can climb; tests/terrain.test.js).
  house('flank-barn', 22, -18, 7, 5, 3.2, 1.3, { doors: ['front'], padBlend: 5 }),
 ],
 props: [
  { type: 'crate', x: 9, z: -2 }, { type: 'crate', x: 10.5, z: -3.2 },
  { type: 'barrel', x: -6, z: 12 }, { type: 'barrel', x: -4.8, z: 12.6 },
  { type: 'boulder', x: -3, z: -3 }, { type: 'hay', x: 18, z: 3 },
  { type: 'crate', x: 4, z: 18.5 }, { type: 'deadTree', x: -14, z: 6 },
 ],
 fences: [{ x: 10, z: 15.2, length: 10, axis: 'x' }],
 // At 6, 10, 14 and 20 m from the start, above and below it.
 targets: [
  { id: 'flat', x: 6, z: 6 }, { id: 'rise', x: 8, z: -2 }, { id: 'top', x: 14, z: -10 },
  { id: 'hollow', x: 4, z: 20 }, { id: 'plateau', x: -20, z: -15 }, { id: 'moving', x: -8, z: 10, moving: true, travel: 3 },
 ],
 // Ground detail (world/terrain-details.js): the default layer, with leaves
 // drifted thick and grass thinned down in the hollow.
 groundDetail: { regions: [{ poly: [[-16, 15], [26, 15], [26, 25], [-16, 25]], kinds: { leaves: 3, tufts: .5 } }] },
 zones: [], scenerySeed: 511,
};
