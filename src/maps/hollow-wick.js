// Hollow Wick: a New England village about 1790-1820, late autumn at dusk
// (the owner's brief: claude/hollow-wick-master-prompt.md; the design and
// the layout: claude/hollow-wick-design.md, hollow-wick-plan.md,
// hollow-wick-layout-data.md). Being built in stages (AGENTS.md > Adding a
// map); until it is finished it is reached only from Developer tools >
// World (or ?map=hollow-wick).
//
// Stage 1: the ground. The whole terrain (town plateau +5, the terraced slope,
// the fork +3, Church Hill +7 with its graveyard terraces, the ridge and the
// North Woods' knolls, the stream hollow, the south bank terrace +3.5 and the
// scarecrow field +1.5), the stream with its five crossings, the irregular
// fence, and pads where the buildings will stand. Buildings, trees, walls and
// props come in stage 2 (grey placeholders first).
//
// x east, z south, metres; heights above the stream (the water stands at 0
// above the mill dam and at -0.3 below it). The fence runs about x -65..56,
// z -66..50; the ground and the stream run on past it.
import { roundPlayableOutline } from '../playable-area.js';
import { HOLLOW_WICK_TREES } from './hollow-wick-trees.js'; // stage 2 trees (s2-trees)
import { CROSSINGS } from './hollow-wick-crossings.js'; // s2-crossings
// s2-spawns: bases, FFA points, no-spawn areas, the pick view, practice targets.
import { HW_SPAWNS } from './hollow-wick-spawns.js';
import { GRAVEYARD_PROPS, FIELD_WALLS } from './hollow-wick-graveyard.js'; // s2-graveyard
import { HW_PROPS, HW_CROPS, HW_GROUND_LAYERS } from './hollow-wick-props.js'; // (s2-props)
import { hollowWickBuildings, hollowWickBuildingProps } from './hollow-wick-buildings.js'; // s2-buildings
import { HOLLOW_WICK_BREAKABLES } from './hollow-wick-breakables.js'; // s2-breakables
import { HOLLOW_WICK_DETAIL } from './hollow-wick-detail.js'; // stage 5 detail (tools/place-detail.mjs)

const deg = Math.PI / 180;
// Worked-out points are kept to the millimetre, so the map's numbers (and its
// fingerprint, maps.js mapHash) never depend on a browser's last bit of cos/sin.
const mm = v => Math.round(v * 1000) / 1000;
// Church Hill: the meetinghouse stands at O.
const O = [-44, -22.5];
// A point `r` from O at `a` degrees (north-up: 0 east, 90 north).
const at = (r, a) => [mm(O[0] + r * Math.cos(a * deg)), mm(O[1] - r * Math.sin(a * deg))];
// A graveyard terrace: a slice round O whose front is straight fieldstone runs
// with kinks (a burying ground of the period, not a curved "rural cemetery").
const terrace = (radii, a0, a1) => [O.slice(), ...radii.map((r, i) => at(r, a0 + (a1 - a0) * i / (radii.length - 1)))];
const front = n => Array.from({ length: n }, (_, i) => i + 1); // a terrace's run segments
const ellipse = (cx, cz, rx, rz, n = 16) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return [mm(cx + rx * Math.cos(a)), mm(cz + rz * Math.sin(a))]; });
const GY = [-80, 72]; // the graveyard's sector round O (north-up degrees)

// The stream: x, z, half width, bed. Bent about 2 m south past the mill so
// the walk between the mill and the water is 3 m wide. It flows west (right
// to left on screen). Wadeable everywhere inside the fence (owner,
// 2026-09-26), a little deeper here and shallower there: knee-deep riffles
// by the ford, deeper pools by the log, under the bridge and below the dam,
// the mill pond above it; past the fence it deepens.
// (Owner, 2026-09-26: no sudden narrowing. Widths and beds change slowly:
// the mill pond is upstream of the dam, east of x 14, the widest water.)
export const STREAM = [
 [-95, 15, 3.2, -1.6], [-70, 16.2, 3.0, -1.4], [-56, 17.2, 2.8, -.9], [-46, 18.4, 2.7, -.8], [-36, 20.2, 2.7, -.82],
 [-26, 21.8, 2.7, -.8], [-16, 22.4, 2.7, -.82], [-6, 21.6, 2.8, -.76], [4, 20.2, 2.9, -.8], [12, 20.0, 3.0, -.84],
 [18, 21.8, 3.0, -.72], [26, 22.6, 3.1, -.7], [34, 22.8, 2.9, -.62], [44, 23.4, 2.8, -.58], [56, 23, 2.8, -.66],
 [70, 22, 3.0, -1.3], [95, 21, 3.2, -1.6],
];

// Where the buildings will stand (stage 2): each gets a flat pad at its
// height now, so the ground is final. h: the pad's height (the building's baseY).
export const BUILDING_PADS = [
 { id: 'tavern', x: 24, z: -19, w: 12, d: 9, h: 5 },
 { id: 'saltbox', x: 38.5, z: -19.5, w: 9, d: 7, h: 5, angle: .06 },
 { id: 'cape', x: 50.5, z: -18.5, w: 9, d: 7, h: 5, angle: -.04 },
 { id: 'gambrel', x: 13, z: -24, w: 9, d: 7.5, h: 5, angle: .06 }, // (s2-buildings: was 5.1; its pad's margin ran 0.1 m up into the tavern's corner, 0.3 m away)
 { id: 'lit-cape', x: 30, z: -33, w: 8, d: 7, h: 5, angle: -.08 },
 { id: 'saltbox-2', x: 46, z: -33, w: 9, d: 7, h: 5, angle: .05 },
 { id: 'smithy', x: 26, z: 2, w: 8, d: 6, h: 5 },
 { id: 'forge', x: 32.5, z: 2.5, w: 4.5, d: 4.5, h: 5 },
 // (Turned end-on to the path, clear of the east gully.)
 { id: 'barn', x: 51, z: 0, w: 8, d: 12, h: 5 },
 // (The mill's south wall stands at the water's edge: a tight pad.)
 { id: 'mill', x: 22, z: 13.5, w: 9, d: 6.5, h: 1, margin: .5, blend: 1.5 },
 { id: 'meetinghouse', x: -44, z: -22.5, w: 13, d: 9, h: 7 },
 { id: 'horse-sheds', x: -33.7, z: -39.1, w: 12, d: 3, h: 4.25, angle: mm(-Math.PI / 4) },
 { id: 'tomb', x: -23.6, z: -28.4, w: 4, d: 3.5, h: 4.2, angle: -.3 },
 { id: 'hearse-house', x: -25.5, z: -7.5, w: 4, d: 3, h: 3.9 },
 { id: 'farm', x: -42, z: 41, w: 8, d: 7, h: 3.5 },
 { id: 'woodshed', x: -19, z: 38.5, w: 5, d: 4, h: 3.5 },
];

// The bases (stage 2 makes them spawn areas): A town yard, B graveyard foot,
// C south bank. 2V2/3V3 play A vs C; 2V2V2 uses all three.
export const BASES = { A: [30, -4.5], B: [-30, -41.5], C: [-30.2, 33.4] };
export const FORK = [-10, -2];
// The woods (stage 3 grows them): the North Woods on the ridge, the West
// Woods on Church Hill's west flank.
export const WOODS = [
 { id: 'north-woods', poly: [[-34, -44], [-26, -47], [-20, -43], [-10, -41.5], [-4, -46.5], [8, -46.5], [18, -46], [21, -52], [10, -63], [-6, -66], [-24, -66], [-40, -61], [-46, -52]] },
 { id: 'west-woods', poly: [[-66, -24], [-56, -26], [-52, -14], [-50, -2], [-46, 6], [-40, 13], [-50, 15], [-60, 14], [-66, 6]] },
];

// (The point at 38.4 is where the east gully's west wall meets the town's
// edge: the edge's wall starts there.)
const town = [[9, -85], [95, -85], [95, 9.5], [47, 9.5], [40, 8.5], [38.25, 8.33], [30, 7.5], [20, 7], [13, 6], [9, 3], [9, -16]];
const summit = ellipse(O[0], O[1], 10, 8.5);

export const hollowWick = {
 id: 'hollow-wick', name: 'Hollow Wick', width: 132, depth: 134,
 // The fence: irregular, following the land. North round the North Woods,
 // west round the West Woods; it stops at each bank where the stream leaves
 // (the stream flows on past it, deepening, so it reads as impassable).
 // (Rounded like Deadwater's, then kept to the millimetre.)
 playableArea: roundPlayableOutline([
  [-50, -52], [-40, -60], [-24, -65], [-6, -66], [10, -62], [20, -52], [56, -50], [56, 50],
  [-54, 50], [-58, 30], [-64, 12], [-65, -8], [-60, -30], [-58, -44],
 ]).map(p => p.map(mm)),
 spawn: { x: -10, z: -2 },
 // s3-look: a touch warmer than #625840, away from the olive coat (#5c5f3a; tests/hollow-wick-look.test.js).
 palette: { ground: '#665840', road: '#786c51' },
 // The low dusk sun from the west-south-west, about 20 degrees up (long hill
 // shade east of every rise). (Stage 3 makes the rest of the dusk: overcast,
 // fog, the grade.)
 // No vultures, swifts or finches: crows only (stage 3).
 birds: false,
 // Grey-white fog sheets, thickest over the stream hollow (render/fog-sheets.js).
 // s3-look: the dusk (render/map-look.js; AGENTS.md > Hollow Wick's dusk look). Overcast sky light
 // (the overcast's #8a8a86 at the brightness the ground needs to stay readable: #e7e7e1 is the same
 // colour x 3.15 in linear light), the low weak WSW sun (#d9a070) through the west's dusk glow
 // (#b58a66), fog-grey haze (#9c9892) that starts inside the view, and Extreme's grade duller and
 // cooler in the shade. Exposure stays at the default, so unlit effects keep their colours.
 look: { sky: '#e7e7e1', skyIntensity: 2.32, bounce: '#807a6d', sun: '#d9a070', glow: '#b58a66', glowMix: .3, sunIntensity: 2.1, haze: '#9c9892', fogNear: 34, fogFar: 120,
  grade: { warmth: .03, shade: .06, contrast: .06, saturation: .9 },
  sunOffset: { x: -43, y: 17, z: 18 }, fog: { colour: '#b9b6ae', opacity: .38, lowBias: .7 } },
 // The ground's colours (render/ground-layers.js): damp low ground in the
 // stream hollow, darker still by the water; earthier banks.
 terrainLook: { bank: '#544a37', damp: '#4b4333', dampBelow: 1.45, dampDepth: .6, dampMix: .55, hollow: '#40443c', hollowBelow: .95, hollowDepth: .7, hollowMix: .6,
  wallFace: '#6a665c', wallCap: '#8b8a80', wallDark: '#5f5c56' },
 groundLayers: [
  // Dry grass up on the ridge and the town's worn yards.
  // (s3-look: #746649, was #6c6247: lighter, away from the olive coat.)
  { poly: [[-40, -85], [9, -85], [9, -33], [0, -30], [-10, -31], [-18, -38], [-26, -46], [-36, -50]], colour: '#746649', feather: 4, mix: .35, noise: .5 },
  { poly: town, colour: '#746649', feather: 2, mix: .45, noise: .45 },
  // The burying ground's short turf, over Church Hill's east side.
  { poly: terrace([26, 26.5, 25.5, 26.5, 26, 25.5, 26], GY[0] + 6, GY[1] - 6), colour: '#625a42', feather: 2.5, mix: .5, noise: .3 }, // (s3-look: was #5a5840, too near the olive coat)
  // Straw stubble in the scarecrow field.
  { poly: [[-12, 27.5], [95, 29.5], [95, 85], [-12, 85]], colour: '#7d6d45', feather: 2, mix: .75, noise: .35 },
  // Leaf litter deep in the woods (litter browns only: never red on the ground).
  ...WOODS.map(w => ({ poly: w.poly, colour: ['#8a6a3e', '#7a5a34', '#6e4a2c'], feather: 3, mix: .65, noise: .5 })),
  ...HW_GROUND_LAYERS, // (s2-props: the body pile's reddish ground)
  // The mill dam's top: a walk of weathered stone, not the stream bed's mud
  // (it reads as a walkway across the water, not a strip of water).
  { poly: [[13.2, 14.4], [14.8, 14.4], [14.8, 25.4], [13.2, 25.4]], colour: '#7b7466', feather: .15, mix: 1, noise: .25 },
 ],
 terrain: {
  bounds: [-96, -80, 86, 80],
  base: 1.25, floorMin: -1,
  // Nowhere open is steeper than this (terrain-bake.js lowers what is): bodies
  // and orbs agree (TERRAIN.orbRise 0.8).
  maxSlope: .78,
  noise: { cell: 7, amp: .12, seed: 11 },
  // The stream hollow.
  carves: [{ line: STREAM.map(p => [p[0], p[1]]), half: 6.5, floor: .85, grade: .2, reach: 25 }],
  levels: [
   { id: 'field', h: 1.5, poly: [[-12, 27.5], [95, 29.5], [95, 85], [-12, 85]], grade: .15 },
   { id: 'sw-terrace', h: 3.5, poly: [[-95, 28.5], [-26, 28.5], [-17, 30], [-12, 35], [-11, 85], [-95, 85]], grade: .24, cliffs: [0] },
   { id: 'fork', h: 3.0, poly: [[-22, -10], [1, -12], [1, 6], [-10, 10], [-20, 6]], grade: .22 },
   // The fork's south lip: a raised bank 1.2 m above the fork, steeper on its
   // south face and where the south-west branch cuts through it, so the
   // hollow is hidden from the fork's centre.
   { id: 'lip-west', h: 4.2, poly: [[-20.91, 7.51], [-11.8, 9.18], [-11.98, 10.16], [-21.09, 8.49]], grade: .28, banks: [1, 2] },
   { id: 'lip-east', h: 4.1, poly: [[-5.95, 9.2], [-2.1, 7.53], [-1.7, 8.45], [-5.55, 10.12]], grade: .28, banks: [2, 3] },
   // The terraced slope from the town down to the fork: earth banks on its
   // west faces and along its south end over the hollow (owner, 2026-09-26:
   // far fewer walls). (Their east sides are under the next level up: steep,
   // so they never spill round a corner.)
   { id: 'slope-1', h: 3.7, poly: [[1, -15], [5, -15], [5, 5.5], [1, 6]], grade: .25, banks: [2, 3], openings: [1] },
   { id: 'slope-2', h: 4.35, poly: [[5, -16], [9, -16], [9, 4], [5, 5]], grade: .25, banks: [2, 3], openings: [1] },
   // The town's edge: banks, except the stone wall behind the mill and the
   // forge (no room for a bank between the town, the path and the mill).
   { id: 'town', h: 5.0, poly: town, grade: .2, cliffs: [5, 6, 7], openings: [4], banks: [2, 3, 8, 9] },
   { id: 'ridge', h: 5.5, poly: [[-40, -85], [9, -85], [9, -33], [0, -30], [-10, -31], [-18, -38], [-26, -46], [-36, -50]], grade: .22 },
   // Church Hill: a dome, terraced on its graveyard side in straight runs.
   { id: 'foot', h: 4.2, poly: terrace([26, 26.5, 25.5, 26.5, 26, 25.5, 26], GY[0] + 6, GY[1] - 6), grade: .2 },
   // (Turf banks between the terraces.)
   { id: 't3', h: 4.9, poly: terrace([21.5, 22.4, 20.8, 21.9, 21, 22.2], GY[0], GY[1]), grade: .25, banks: front(5) },
   { id: 't2', h: 5.6, poly: terrace([17, 17.8, 16.4, 17.5, 16.6, 17.4], GY[0], GY[1]), grade: .25, banks: front(5) },
   { id: 't1', h: 6.3, poly: terrace([12.5, 13.2, 12, 12.9, 12.2, 12.8], GY[0], GY[1]), grade: .25, banks: front(5) },
   // (Its segments facing the graveyard are 0.7 m banks down to t1.)
   { id: 'summit', h: 7.0, poly: summit, grade: .25, banks: [0, 1, 2, 13, 14, 15] },
   // The mill dam: an earth dam across the stream, its walk on top.
   // The mill dam: stone faces across the stream (walls), laid over the
   // channel (overWater), its ends on the banks: you walk along its top.
   // (Its ends meet the banks steeply, so they don't fan out into the water.)
   { id: 'dam', h: .75, poly: [[13.2, 14.4], [14.8, 14.4], [14.8, 25.4], [13.2, 25.4]], grade: 1.2, cliffs: [1, 3], overWater: true },
  ],
  // Knolls in the woods: deliberate crests for reverse-slope play.
  knolls: [{ x: -14, z: -52, r: 5, h: 1.4 }, { x: 0, z: -56, r: 4.5, h: 1.2 }, { x: -24, z: -56, r: 4, h: 1.5 }, { x: -52, z: -2, r: 4, h: 1.2 }],
  // Worn tracks only on the main road (the town street, down the slope to
  // the fork, on to the bridge and the field, and up to the meetinghouse);
  // every other path only shapes the ground (colourMix 0; owner, 2026-09-26).
  paths: [
   { id: 'main-east', points: [[58, -9, 5], [44, -9.5, 5], [31, -10, 5], [22, -9.8, 5], [16, -8, 5], [12, -4, 5]], width: 4, shoulder: 1 },
   // Down the terraced slope: a gap in each wall, staggered, so the path bends at every terrace.
   { id: 'main-slope', points: [[12, -4, 5], [10, -3.7, 5], [8, -3.7, 4.35], [6.8, -6.5, 4.35], [6, -8.2, 4.35], [4, -8.2, 3.7], [2.8, -6, 3.7], [2, -3.7, 3.7], [0, -3.5, 3.0], [-10, -2, 3.0]], width: 3.2, shoulder: 1 },
   { id: 'north-lane', points: [[-4, -9, 3.1], [3, -14, 4.0], [10, -17, 5.0], [16, -14, 5.0]], width: 2.4, shoulder: 1.5, colourMix: 0 },
   { id: 'sw-branch', points: [[-9.5, 4, 3.0], [-8.7, 9.9, 2.55], [-11.8, 13.4, 1.85], [-12, 16.2, 1.4], [-14, 17.6, 1.25]], width: 3, shoulder: .9 },
   // Past lip-east's end: from the fork's south-east corner down to the ford.
   { id: 'lip-ramp', points: [[-.5, 6.2, 3.0], [.4, 10.3, 2.0], [-.3, 14.6, .85]], width: 3, shoulder: 2.5, colourMix: 0 },
   { id: 'bridge-south', points: [[-14, 26.2, 1.25], [-14, 28.4, 1.35], [-8.8, 30.5, 1.55], [-8.5, 34, 1.6]], width: 3, shoulder: 1.5 },
   { id: 'terrace-ramp', points: [[-14, 28.2, 1.35], [-18, 29.6, 2.0], [-23, 31.4, 3.0], [-26.5, 32.4, 3.5]], width: 3, shoulder: 1.5, colourMix: 0 },
   { id: 'nw-branch', points: [[-10, -2, 3.0], [-15, -6, 3.4], [...at(26.5, -24), 4.15], [...at(8.5, -24), 7.0]], width: 2.4, shoulder: .8 },
   { id: 'aisle-40', points: [[...at(26.5, 40), 4.15], [...at(8.5, 40), 7.0]], width: 2, shoulder: .6, colourMix: 0 },
   { id: 'aisle-22', points: [[...at(26.5, 22), 4.15], [...at(8.5, 22), 7.0]], width: 2, shoulder: .6, colourMix: 0 },
   { id: 'aisle-2', points: [[...at(26.5, -2), 4.15], [...at(8.5, -2), 7.0]], width: 2, shoulder: .6, colourMix: 0 },
   { id: 'aisle-56', points: [[...at(26.5, -56), 4.15], [...at(8.5, -56), 7.0]], width: 2, shoulder: .6, colourMix: 0 },
   { id: 'west-flank', points: [[-50, -17, 6.6], [-52, -6, 4.6], [-49, 4, 2.6], [-42, 12, 1.1], [-34, 16.6, .95], [-31.5, 17.5, .9]], width: 3, shoulder: 2, colourMix: 0 },
   { id: 'south-shelf', points: [[-32.5, 26.3, .9], [-26, 26.2, .9], [-20, 26.8, 1.1], [-15, 26.4, 1.25]], width: 2.6, shoulder: .6, colourMix: 0 },
   { id: 'hollow-path', points: [[-2, 15.5, .8], [6, 14.5, .85], [13, 13.8, .8], [17, 9.6, .95], [27.5, 9.5, 1.0], [33, 13.5, 1.0], [36.5, 17.8, 1.0]], width: 3, shoulder: 1.5, colourMix: 0 },
   { id: 'field-north', points: [[14, 25.5, .75], [13.5, 28.5, 1.5], [10, 34, 1.5]], width: 2.6, shoulder: 1.5, colourMix: 0 },
   // The east gully: a walled cutting down through the town's south edge
   // (from beside the main path) to the hollow and the footbridge.
   { id: 'gully', points: [[41, -6, 5.0], [41, -1, 3.95], [40.8, 4, 2.9], [40.4, 8.6, 1.9], [39.8, 12, 1.35], [39.5, 15, 1.05], [40.2, 17.5, .9], [40.5, 19.4, .8]], width: 3.6, shoulder: .4, colourMix: 0 },
   { id: 'east-field', points: [[41, 27, .8], [41, 30, 1.5]], width: 2.2, shoulder: 1.5, colourMix: 0 },
   { id: 'back-trail', points: [[12, -31, 5.2], [5, -37, 5.5], [-4, -43, 5.6], [-12, -46, 5.6], [-19, -46.5, 5.3], [-24, -44, 4.6]], width: 2.4, shoulder: 1.5, colourMix: 0 },
   { id: 'woods-track', points: [[-4, -43, 5.6], [-2, -50, 5.8], [6, -57, 5.8], [14, -52, 5.6], [16, -44, 5.4]], width: 2, shoulder: 1.2, colourMix: 0 },
   { id: 'back-lane', points: [[12, -31, 5.2], [20, -31, 5.1], [22.5, -27.2, 5.0], [58, -27, 5.0]], width: 2.4, shoulder: 1, colourMix: 0 },
  ],
  // The gully's side walls, from where it leaves the town's level ground.
  // (Down past the foot of the town's bank, so the bank beside the gully
  // does not wrap round a wall's end.) And the mill's foundation along the
  // water's edge (its wheel and race are on its south wall; stage 2).
  // (Each wall stands where the gully's shoulder ends, so the town beside it
  // is untouched: 2.2 m either side of the lane's line.)
  edges: [{ points: [[38.8, -5.5], [38.6, 4], [38.18, 8.9], [37.58, 12.2]] }, { points: [[43.2, -5.5], [43, 4], [42.58, 8.9], [41.98, 12.2]] },
   { points: [[15.8, 17.25], [26.9, 17.25]] }],
  // The stream's channel (its banks rise to the ground beside them).
  // `surface`: where the water stands: 0 upstream of the mill dam at x 14
  // (the mill pond), -0.3 below it; `flow` -1: it runs toward -x (west).
  water: [{ id: 'stream', points: STREAM, bank: 2.2, surface: { up: 0, down: -.3, damX: 14, flow: -1 } }],
  // The ford: a pebbled shallow a hand deep.
  // (A shallow riffle the stream's full width: water over it everywhere.)
  fords: [{ points: [[-2, 15.5, .75], [-2, 17.6, -.34], [-2, 18.6, -.42], [-2, 21.3, -.45], [-2, 23.9, -.42], [-2, 24.9, -.34], [-2, 27.5, 1.3]], width: 5, shoulder: 2 }],
  // Walk surfaces over the water: their ends land on the banks, you can step
  // off their sides into the stream, and wade under them (heightfield.js
  // decks; stage 2 builds them).
  decks: [
   // (Each end runs on until the bank is within a hand of its top, so you
   // walk onto it there: tests/wading.test.js.)
   { id: 'bridge', h: 1.25, poly: [[-15.5, 16.4], [-12.5, 16.4], [-12.5, 28.1], [-15.5, 28.1]] },
   { id: 'log', h: .9, poly: [[-32.0, 15.75], [-30.6, 15.75], [-31.9, 27.0], [-33.3, 27.0]] },
   { id: 'footbridge', h: .8, poly: [[40.1, 18.5], [41.9, 18.5], [41.9, 27.9], [40.1, 27.9]] },
  ],
  // (The buildings' pads come from the buildings themselves: baseY,
  // padMargin, padBlend; s2-buildings.)
 },
 // Ground detail (world/terrain-details.js): dry grass and stalks thick in the
 // hollow and the field, packed yards in the town, leaf litter and twigs deep
 // in the woods (the last region holding a point wins).
 groundDetail: {
  density: .9,
  regions: [
   { poly: [[-90, 8], [90, 14], [90, 32], [-90, 26]], kinds: { tufts: 1.3, stalks: 1.6, leaves: 1.1 } },
   { poly: [[-12, 29], [95, 31], [95, 85], [-12, 85]], kinds: { tufts: 1.5, stalks: 2.4, leaves: .3, twigs: .5 } },
   { poly: town, density: .45, kinds: { stones: .6, leaves: .6 } },
   ...WOODS.map(w => ({ poly: w.poly, kinds: { leaves: 3, twigs: 2.2, tufts: .35, stalks: .5 } })),
  ],
 },
 buildings: hollowWickBuildings(BUILDING_PADS) /* s2-buildings */, props: [...GRAVEYARD_PROPS, ...FIELD_WALLS /* s2-graveyard */, ...HW_PROPS /* s2-props */, ...hollowWickBuildingProps(BUILDING_PADS) /* s2-buildings */, ...HOLLOW_WICK_BREAKABLES /* s2-breakables: pumpkins, cider, apples, grain, coops, skeps, crocks, lanterns, cordwood, barrows */, ...HOLLOW_WICK_DETAIL /* stage 5: the sparse screens' fieldstone, boulders, blocks */], fences: [], crops: HW_CROPS, // (s2-props)
 // s2-spawns: bases, teamBases, ffaSpawns, noSpawn, pickView and targets.
 ...HW_SPAWNS,
 // s2-crossings: the crossings' and mill wheel's looks (render/crossing-decks.js).
 crossings: CROSSINGS,
 // Stage 2 trees (s2-trees): the woods, orchard, village trees, stumps, logs (world/tree-kinds.js, world/trees.js).
 trees: HOLLOW_WICK_TREES,
 // s3-leaves: the woods' leaf carpet, falling and kicked leaves (world/leaf-carpet.js, effects/leaf-fx.js).
 leafLitter: { woods: WOODS },
 zones: [], scenerySeed: 1790,
};
