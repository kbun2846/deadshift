// Lumen: where players come in, and the practice targets (stage 2). Spread
// into the map by lumen.js; read by net/map-spawns.js and checked by
// tools/spawn-check.mjs lumen, tools/lumen-walk.mjs and tests/lumen-spawns.test.js.
//
//  - bases: three spawn areas round the Crossroads (design 16): A Uptown
//    plaza (NE), B the Stacks courtyard's mouth on West Street (NW), C the
//    charging lot off South Street (south-centre, by Velvet Row), at 331,
//    212 and 110 degrees round it (the layout allows no closer to 120
//    apart). Each 55 m's walk from the Crossroads' middle (54.9-55.9; the
//    plan's 45 m was drawn as a straight line, and walked round the cover
//    the three areas are 55), 3+ ways out, 8 points a body or two apart.
//    Base to base: A-B 102 m, A-C 102, B-C 86.
//  - teamBases: 2V2V2 uses all three. 2V2 and 3V3 use B and C, the fairest
//    pair measured (tools/lumen-walk.mjs): the same walk to the Crossroads,
//    and the east's landmarks nearer alike than any pair with A (A has the
//    bus 34 m and the flatiron 42 m away; B 102 and 89, C 80 and 60).
//  - BASE_SCREENS: unlit construction barriers and hoardings (never signs or
//    screens: nothing shootable within 15 m of a base, design 20) set round
//    the bases by a search that keeps door aprons, zebras, the gap rule and
//    the sniper lane clear, so no line out of a base runs longer than the
//    screen's east-west reach (20.5 m) and all but a dozen stop by 18 m (the
//    plan's number: B's mouth onto West Street and C's view down Velvet
//    Row's lane, which must stay open, are the long ones). Solid cover that
//    stops rounds counts, as a wall does (tools/spawn-check.mjs too).
//  - ffaSpawns: 24 points about 20 m apart over the whole map, each with
//    solid cover within 4.5 m; never in a building, on or by the sniper lane,
//    in a base or by the Back Alley body pile.
//  - noSpawn: the sniper lane (and its median), the body pile.
//  - targets: 16 (design 16), each clear of every collider and door apron,
//    a mover's whole track too, in sight of its standing spot:
//      long: a row of 4 boards across Uptown plaza at 10/14/18/22 m from a
//        spot (34, -37.5) by the corporate tower (the Boulevard's sidewalk,
//        the plan's place for it, is walled by its cover on that line);
//      mid: 2 boards and 2 dummies in the charging lot 6-10 m from base C;
//      close: 2 dummies and a board in the Stacks courtyard, 3-9 m from a
//        spot (-45, -25); one dummy inside the capsule hotel's reception (the
//        plan's parking-structure dummy is 30 m from any base);
//      moving: 2 boards sliding along South Street's south sidewalk (the
//        Avenue's sidewalk runs north-south, and a mover slides along x);
//      and a dummy on Uptown plaza and one on West Street's sidewalk.
//    All within 20 m of a base, facing the camera. (Stage 4 gives them the
//    city models: a board on a pop-up stand, a padded mannequin.)
const p = (x, z) => ({ x, z });
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
// A base's area: its points' bounds, 1.2 m out.
const around = pts => rect(Math.min(...pts.map(q => q.x)) - 1.2, Math.min(...pts.map(q => q.z)) - 1.2, Math.max(...pts.map(q => q.x)) + 1.2, Math.max(...pts.map(q => q.z)) + 1.2);

export const LUMEN_BASES = [
 // A, the plaza east of the luxury tower, north of the Boulevard; screened from the plaza's east side and the Boulevard.
 { id: 'A', name: 'Uptown plaza', x: 50, z: -24, poly: around([p(50, -24), p(48, -25), p(49, -22), p(51, -26), p(52, -23), p(47, -23), p(49, -27), p(51, -21)]),
  points: [p(50, -24), p(48, -25), p(49, -22), p(51, -26), p(52, -23), p(47, -23), p(49, -27), p(51, -21)] },
 // B, the courtyard's mouth on West Street, between the tenements' legs.
 { id: 'B', name: 'Stacks courtyard', x: -38, z: -27, poly: around([p(-38, -27), p(-40, -28), p(-39, -25), p(-37, -29), p(-36, -26), p(-41, -26), p(-39, -30), p(-37, -24)]),
  points: [p(-38, -27), p(-40, -28), p(-39, -25), p(-37, -29), p(-36, -26), p(-41, -26), p(-39, -30), p(-37, -24)] },
 // C, the charging lot off South Street, between Velvet Row and the Avenue.
 { id: 'C', name: 'Charging lot', x: -11.5, z: 48, poly: around([p(-11.5, 48), p(-13.5, 49), p(-11.5, 45.5), p(-11.5, 50.5), p(-14.5, 47), p(-13.5, 51.5), p(-13.5, 44), p(-16.5, 48)]),
  points: [p(-11.5, 48), p(-13.5, 49), p(-11.5, 45.5), p(-11.5, 50.5), p(-14.5, 47), p(-13.5, 51.5), p(-13.5, 44), p(-16.5, 48)] },
];
export const LUMEN_TEAM_BASES = { 2: ['B', 'C'], 3: ['A', 'B', 'C'] };

export const BASE_SCREENS = [
 { type: 'cityConstruction', x: -30.4, z: -20.4, angle: -2.06 },
 { type: 'cityConstruction', x: 52.68, z: -29.52, angle: -0.785 },
 { type: 'cityConstruction', x: 42.94, z: -27.76, angle: -5.236 },
 { type: 'cityConstruction', x: 45.65, z: -31.95, angle: -5.498 },
 { type: 'cityHoarding', x: -28.03, z: -30.77, angle: -1.571 },
 { type: 'cityHoarding', x: -30.03, z: -25.23, angle: -1.571 },
 { type: 'cityHoarding', x: -9.15, z: 41.05, angle: -0.785 },
 { type: 'cityConstruction', x: 3.46, z: 45.19, angle: -1.571 },
 { type: 'cityConstruction', x: -5.5, z: 41.5, angle: -1.08 },
];

export const LUMEN_FFA_SPAWNS = [
 p(6, 12),
 p(60, -55),
 p(-34, -53),
 p(-59, 34),
 p(59, 7),
 p(34, 54),
 p(12, -37),
 p(-37, -7),
 p(-21, 39),
 p(31, -9),
 p(36, 25),
 p(5, 53),
 p(-16, -32),
 p(40, -36),
 p(-59, 7),
 p(-11, -7),
 p(-26, 15),
 p(-42, 48),
 p(58, -15),
 p(10, -15),
 p(-1, 32),
 p(0, -53),
 p(60, -35),
 p(27, -51),
];

export const LUMEN_NO_SPAWN = [
 { id: 'sniper-lane', poly: rect(26, -7.5, 62, 2.5) },
 { id: 'body-pile', poly: rect(-18, -26, -6, -21.5) },
];

// The weapon pick looks down on the Crossroads (the flatiron's screen, the island).
export const LUMEN_PICK_VIEW = { x: 6, z: 2, height: 26 };

export const LUMEN_TARGET_SPOTS = [
 { id: 'rifle-row', x: 34, z: -37.5, targets: ['row-10', 'row-14', 'row-18', 'row-22'] },
 { id: 'lot', x: -12, z: 48, targets: ['lot-board-1', 'lot-board-2', 'lot-dummy-1', 'lot-dummy-2'] },
 { id: 'yard', x: -45, z: -25, targets: ['yard-dummy-1', 'yard-dummy-2', 'yard-board'] },
];
export const LUMEN_TARGETS = [
 { id: 'row-10', x: 44, z: -37.5 },
 { id: 'row-14', x: 48, z: -37.5 },
 { id: 'row-18', x: 52, z: -37 },
 { id: 'row-22', x: 56, z: -37.5 },
 { id: 'lot-board-1', x: -18.5, z: 46 },
 { id: 'lot-board-2', x: -19, z: 52 },
 { id: 'lot-dummy-1', kind: 'dummy', x: -13.5, z: 41 },
 { id: 'lot-dummy-2', kind: 'dummy', x: -9.5, z: 42.5 },
 { id: 'yard-dummy-1', kind: 'dummy', x: -48, z: -26 },
 { id: 'yard-dummy-2', kind: 'dummy', x: -47.5, z: -23 },
 { id: 'yard-board', x: -48, z: -33 },
 { id: 'capsule-dummy', kind: 'dummy', x: -28, z: 38.5 },
 { id: 'south-moving-1', x: -6, z: 34.3, moving: true, travel: 2.5 },
 { id: 'south-moving-2', x: -18, z: 34.8, moving: true, travel: 2.5 },
 { id: 'plaza-dummy', kind: 'dummy', x: 42, z: -30 },
 { id: 'west-dummy', kind: 'dummy', x: -34, z: -20 },
];

export const LUMEN_SPAWNS = { bases: LUMEN_BASES, teamBases: LUMEN_TEAM_BASES, ffaSpawns: LUMEN_FFA_SPAWNS, noSpawn: LUMEN_NO_SPAWN, pickView: LUMEN_PICK_VIEW, targets: LUMEN_TARGETS };
