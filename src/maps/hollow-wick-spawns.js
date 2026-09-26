// Hollow Wick: where players come in (stage 2, task s2-spawns). Spread into
// the map by hollow-wick.js; read by net/map-spawns.js (online rounds, SOLO
// vs robots, solo practice) and checked by tools/spawn-check.mjs and
// tests/hollow-wick-spawns.test.js.
//
//  - bases: the three spawn areas (design notes, "Gameplay rules"): A the town
//    yard, B the graveyard foot, C the south bank. Each is a small polygon and
//    8 points on open, level ground a body or two apart. Team modes always use
//    them, whatever the spawns setting: 2V2 and 3V3 put the two sides at A and
//    C (B is ~35 m from the summit, A and C ~72 m: B would take the high ground
//    first), 2V2V2 uses all three (`teamBases`).
//  - ffaSpawns: 20 authored points for FFA, 1V1, practice and scattered SOLO,
//    spread over the map (yards, lanes, the green, the fork, the south
//    terrace, the field's strips, the woods' edges). A player comes in at one
//    at least SPAWN_APART (26 m) from everyone alive, hidden from them by the
//    ground where it can be; failing that, a sampled open spot.
//  - noSpawn: never a spawn here (the summit, the meetinghouse, the graveyard's
//    ranks, the bridge and every deck with its landings). Water, decks, steep
//    ground, buildings and anything within 1 m of a collider are refused by
//    the rules themselves (net/map-spawns.js spawnProblem).
//  - pickView: the weapon-pick camera looks down on the stubble south of the
//    fence, outside the map, so it never rules out a spawn (bases are exempt
//    from the pick rule in any case).
//  - targets: the practice targets (design notes: on the green and the slope
//    at 6, 10, 14 and 20 m from a natural standing spot, one 2.5 m higher and
//    one 2.5 m lower than you).
//
// Points are kept clear of BUILDING_PADS (3 m), the woods' dense middle, the
// graveyard's ranks and the set-piece marks (hollow-wick-layout-data.md
// MARKS, 3 m), so the builders adding buildings, trees, graves and props
// around them do not bury them; the rules drop any point a collider comes
// within 1 m of, and tests/hollow-wick-spawns.test.js names it.
const deg = Math.PI / 180;
const mm = v => Math.round(v * 1000) / 1000;
const O = [-44, -22.5];                  // Church Hill: the meetinghouse
const at = (r, a) => [mm(O[0] + r * Math.cos(a * deg)), mm(O[1] - r * Math.sin(a * deg))];
const ellipse = (cx, cz, rx, rz, n = 16) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return [mm(cx + rx * Math.cos(a)), mm(cz + rz * Math.sin(a))]; });
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const p = (x, z) => ({ x, z });

export const HW_BASES = [
 // A, the town yard: east of the yard wall (x 27.4) that screens it from the
 // green, north of the smithy, the main street along its north side.
 { id: 'A', name: 'town yard', x: 30, z: -4.5, poly: [[28.6, -11], [38.2, -11], [38.2, -4.2], [28.6, -4.2]],
  // (Its south row off the main street's 4 m road, z -8 and up: stage 4 audit.)
  points: [p(30, -6), p(32, -5.5), p(34, -6), p(36, -5.5), p(30.8, -7.5), p(33, -7.6), p(35, -7.6), p(37, -7.5)] },
 // B, the graveyard foot: the strip between the horse sheds (which screen it
 // from the summit) and the North Woods' south-west edge.
 { id: 'B', name: 'graveyard foot', x: -30, z: -41.5, poly: [[-34.5, -48.2], [-26.5, -48.2], [-26.3, -41], [-28.6, -40.6], [-34.5, -46]],
  points: [p(-33, -47.2), p(-30.5, -47.3), p(-28, -47), p(-31.5, -45.3), p(-29, -45.2), p(-29.5, -42.7), p(-31, -43.5), p(-27.5, -42)] },
 // C, the south bank: the south-west terrace's lip (the c-lip wall along z
 // 29.5 and the c-side wall at x -24.5 screen it), east of the farm.
 { id: 'C', name: 'south bank', x: -30.2, z: 33.4, poly: [[-36.5, 30.8], [-26.2, 30.8], [-26.2, 38.8], [-34, 38.8], [-36.5, 34.5]],
  points: [p(-33, 31.5), p(-30.5, 31.5), p(-35.5, 32.5), p(-33, 34), p(-30.5, 34.5), p(-28, 34.5), p(-31.5, 37), p(-28.5, 37.5)] },
];
// Which bases the sides use, by the number of sides (TEAMS order: AMBER,
// CYAN, VIOLET).
export const HW_TEAM_BASES = { 2: ['A', 'C'], 3: ['A', 'B', 'C'] };

export const HW_FFA_SPAWNS = [
 p(-8, 2),       // the fork, under the maple
 p(-14, -26),    // below the hanging tree's rise
 p(-17, -43),    // the back trail at the woods' edge
 p(3, -47),      // the ridge, where the woods track leaves the trail
 p(-45, -52),    // the North Woods' west edge
 p(-56, -32),    // behind Church Hill, north-west corner
 p(-52, -10),    // the West Woods' edge by the knoll
 p(-34, 9),      // the west bank above the hollow
 p(13, -14),     // the north lane's town end
 p(17, 3),       // the green, by the well
 p(40, -12),     // the town street's east end
 p(28.3, -42),     // behind the lit house, up the back lane
 p(51, -43),     // the town's north-east yards (behind the back lane)
 p(33, 14),      // the hollow path past the mill
 p(27.3, 32.7),      // the field's west strips, by the cart
 p(51, 43),      // the field's south-east corner
 p(5, 45),       // the field's south edge
 p(-5, 33),      // the footpath south of the bridge
 p(-23, 45),     // the south-west terrace
 p(-49.5, 45),     // the south-west terrace's far corner
];

// Never a spawn here (polygons; tested with insidePoly).
export const HW_NO_SPAWN = [
 { id: 'summit', poly: ellipse(O[0], O[1], 11.5, 10) },
 { id: 'meetinghouse', poly: rect(-51.5, -28, -36.5, -17) },
 // The graveyard's ranks (t3 and up): only the foot terrace below them is open.
 { id: 'graves', poly: [O.slice(), ...[-82, -60, -40, -20, 0, 20, 40, 60, 74].map(a => at(23, a))] },
 // The covered bridge with its wings and landings; the log, the footbridge
 // and the mill dam with theirs.
 { id: 'bridge', poly: rect(-17.5, 14, -9.5, 32) },
 { id: 'log', poly: [[-33, 14.5], [-29.5, 14.5], [-30.8, 28.2], [-34.5, 28.2]] },
 { id: 'footbridge', poly: rect(39, 17, 43, 29.5) },
 { id: 'dam', poly: rect(12, 13, 16, 27) },
];

export const HW_PICK_VIEW = { x: 0, z: 64, height: 24 };

// Practice targets, each group seen from a natural standing spot
// (HW_TARGET_SPOTS; the test checks distance, height and sight):
//  - the green's west edge, where the main path comes up into the town
//    (12, -3.8, +5): the green at 6 m, down the slope at 10 m, the fork's
//    edge 2 m below at 14 m, the north lane 2.5 m below at 20 m.
//  - Church Hill's south-west foot (-42, 2, +4): level at 6 m, the west bank
//    2.9 m below at 10 m, the hill's south flank 2.6 m above at 14.5 m.
// And one mover on the fork.
export const HW_TARGET_SPOTS = [
 { id: 'green', x: 12, z: -3.8, targets: ['green-6', 'slope-10', 'fork-14', 'lane-20'] },
 { id: 'hill-foot', x: -42, z: 2, targets: ['foot-6', 'bank-10', 'flank-14'] },
];
export const HW_TARGETS = [
 { id: 'green-6', x: 17.5, z: -6.5 },
 { id: 'slope-10', x: 3, z: -7.6 },
 { id: 'fork-14', x: -1.5, z: -7 },
 { id: 'lane-20', x: -5.3, z: -13.8 },
 { id: 'foot-6', x: -42, z: -4 },
 { id: 'bank-10', x: -39.9, z: 11.8 },
 { id: 'flank-14', x: -43.6, z: -12.4 },
 { id: 'fork-moving', x: -14, z: -6, moving: true, travel: 3 },
];

export const HW_SPAWNS = { bases: HW_BASES, teamBases: HW_TEAM_BASES, ffaSpawns: HW_FFA_SPAWNS, noSpawn: HW_NO_SPAWN, pickView: HW_PICK_VIEW, targets: HW_TARGETS };
