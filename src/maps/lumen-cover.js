// Lumen's cover (stage 2): every prop on the streets, plazas and lots as plain
// data { type, x, z, angle } (angle in radians about y; a prop's local x runs
// along world (cos a, -sin a)), the types from world/lumen-props.js.
//
// Laid out against the rules of claude/lumen-design.md 3, 6 and 9, which
// tests/lumen-cover.test.js checks on the finished map:
//   - some solid cover 1.1 m or more within 8 m along every road;
//   - every line parallel to a road meets a hard break (a piece that stops
//     rounds at any height: 1.2 m or more, not knee-high, not breakable, or a
//     building) within 25 m, except the sniper lane's line (31 m);
//   - north-south rays across the Boulevard meet cover within 14 m;
//   - the Crossroads stays a plaza that reads as abandoned traffic: at most 22
//     solid pieces (vehicles angled along a road, a few jersey barriers, tall
//     planters at the corners, the island and its screen; never a hoarding, a
//     construction barrier or a screen wall), no unbroken line inside it longer
//     than 22 m, and a body can walk from its centre to each mouth in at most 1.3
//     times the straight line;
//   - 35 to 45 vehicles on the whole map, at most two box trucks, placed by the
//     density map below (thick where the city jammed, thin where it did not);
//     their bodies are most of the lanes' cover, so the hoardings and
//     construction barriers stay few in the streets (20 and 30 at most; the bases' screens in lumen-spawns.js are counted apart); a jersey barrier is a
//     tall crash barrier (1.2 m) that stops rounds, so it is a hard break too;
//   - the building-side 1.4 m of every sidewalk stays clear (robots and later
//     NPCs walk it, and the doors open onto it), except the one car nosed into the
//     laundromat's shopfront; every outer door's 2.4 m apron, the zebras, the
//     barricades' 1.5 m and the Back Alley stay clear too;
//   - no piece that stage 3 dresses as a lit sign or screen (world/lumen-props.js
//     LUMEN_SHOOTABLE_DRESS) within 15 m of a base (design 20): near the bases the
//     cover is hoardings, construction barriers, planters, boxes and dumpsters;
//   - gaps between solid pieces are under 0.7 m (shut) or at least 1.4 m (a robot
//     fits); no street is sealed.
// The scenes are placed by hand (the pileup, the taxi, the island, the shopfront
// car, the fallen pole, the checkpoint, the stalls, the bus shelter and the plazas
// and lots); the jams and parked rows were laid lane by lane nose to tail with a
// little jitter; the Crossroads' pieces were found by a search that breaks its
// longest lines with as few pieces as possible; the rest of the cover along the
// roads was filled in by a solver that adds the piece that fixes the most unmet
// rule at a time (vehicles, then the hoardings, crash barriers and street furniture the
// budgets allow), and pruned to what the rules need. Heights are the gameplay truth: stage 4 swaps the grey models for real
// ones of the same footprints.
//
// Clutter cut (owner, 2026-10-01: "remove some, maybe 20% of objects on the
// streets... some objects are perfectly vertical and difficult to see with
// camera so player just runs into them"): every bollard, three hydrants, two
// charging posts, doubled cones, bags and planters at busy corners, a vending
// machine and a utility box went (173 pieces, was 198); no car moved. New
// pieces keep tests/lumen-clutter.test.js: no thin upright collider (under
// 0.5 m across, 0.75 m or taller) without a reason, and the street-object
// budget.

// Where the cars are (design 6: "some areas more cars, some less"). Each zone is a
// polygon; the test counts the vehicles (not the pileup, bus or motorbikes) whose
// centre stands in it: a dense zone holds at least `min`, a medium one between
// `min` and `max`, a sparse one at most `max`. The zones do not overlap.
//   dense: the Boulevard's west half is an evacuation jam (stopped cars in the
//     eastbound lanes, nose to tail toward the metro), the Crossroads' arm mouths
//     have cars stopped at the stop lines, the Crossroads' own plaza holds up to 14
//     abandoned cars (the middle stays open), the Cut toward the metro is jammed with
//     cars angled across its lanes, and rows are parked along the garage frontage
//     and in the charging lot's bays;
//   medium: the Avenue and South Street;
//   sparse: Uptown's streets and plaza (none now: its one sports car stood on the rifle row's line), West Street's
//     north end, North Lane (the market stalls do the covering), and none in Back
//     Alley or Velvet Row's lane.
export const DENSITY_ZONES = Object.freeze([
  { id: 'jam-west', density: 'dense', poly: [[-61,-8],[-27,-8],[-27,8],[-61,8]], min: 7 },
  { id: 'mouth-west', density: 'dense', poly: [[-24,-8],[-12,-8],[-12,8],[-24,8]], min: 2 },
  { id: 'mouth-east', density: 'dense', poly: [[24,-8],[46,-8],[46,8],[24,8]], min: 2 },
  { id: 'mouth-north', density: 'dense', poly: [[1,-32],[11,-32],[11,-16],[1,-16]], min: 2 },
  { id: 'mouth-south', density: 'dense', poly: [[1,16],[11,16],[11,32],[1,32]], min: 2 },
  { id: 'cut-jam', density: 'dense', poly: [[27.9,10],[53.3,35.4],[43.4,45.3],[18,19.9]], min: 4 },
  { id: 'garage-frontage', density: 'dense', poly: [[-61,25],[-34,25],[-34,34],[-61,34]], min: 3 },
  { id: 'charging-lot', density: 'dense', poly: [[-24,36],[-2,36],[-2,54],[-24,54]], min: 3 },
  { id: 'crossroads', density: 'dense', poly: [[-12,-16],[24,-16],[24,16],[-12,16]], min: 6, max: 14 },
  { id: 'avenue-north', density: 'medium', poly: [[1,-56],[11,-56],[11,-32],[1,-32]], min: 1, max: 3 },
  { id: 'avenue-south', density: 'medium', poly: [[1,32],[11,32],[11,56],[1,56]], min: 1, max: 4 },
  { id: 'south-street', density: 'medium', poly: [[-34,25],[1,25],[1,35],[-34,35]], min: 1, max: 4 },
  { id: 'uptown', density: 'sparse', poly: [[24,-57],[62,-57],[62,-10],[24,-10]], max: 2 },
  { id: 'west-street-north', density: 'sparse', poly: [[-34,-56],[-26,-56],[-26,-30],[-34,-30]], max: 1 },
  { id: 'north-lane', density: 'sparse', poly: [[-26,-46],[1,-46],[1,-32],[-26,-32]], max: 0 },
  { id: 'back-alley', density: 'sparse', poly: [[-24,-26],[-2,-26],[-2,-21.5],[-24,-21.5]], max: 0 },
  { id: 'velvet-row-a', density: 'sparse', poly: [[-44,36],[-40,36],[-40,50],[-44,50]], max: 0 },
  { id: 'velvet-row-b', density: 'sparse', poly: [[-44,46],[-24,46],[-24,50],[-44,50]], max: 0 },
]);

// The one 30 m line: the Boulevard's second westbound lane, from the pileup's
// east face to the far barricade. Nothing stands within a metre of it.
export const SNIPER_LANE = Object.freeze({ from: [30, -3.5], to: [60, -3.5] });

// The car nosed into the laundromat's shopfront: the one piece allowed inside
// the 1.4 m of clear ground along a building (the test finds it by its spot).
export const SHOPFRONT_CAR = Object.freeze({ x: -22.9, z: 8.15 });

export const LUMEN_PROPS = [
  // --- The pileup (Boulevard, westbound lanes) (1)
  { type: 'cityPileup', x: 27.2, z: -4, angle: 0 },
  // --- The sniper lane's far end (beside the line, off it) (1)
  { type: 'cityJersey', x: 58, z: -1.6, angle: 0.524 },
  // --- The car in the laundromat's shopfront (1)
  { type: 'citySedan', x: -22.9, z: 8.15, angle: -1.571 },
  // --- The fallen signal pole, West Street x South Street (1)
  { type: 'cityFallenPole', x: -30.35, z: 29.75, angle: -0.785 },
  // --- The abandoned checkpoint (4)
  { type: 'cityCheckpointBarrier', x: 3.6, z: -44.6, angle: 0.35 },
  { type: 'cityCheckpointBarrier', x: 3.4, z: -51.4, angle: -0.3 },
  { type: 'cityCone', x: 5.8, z: -48.6, angle: 0 },
  { type: 'cityCone', x: 4.4, z: -47.4, angle: 0 },
  // --- Night market stalls on North Lane (5)
  { type: 'cityStall', x: -19.8, z: -39.3, angle: 0 },
  { type: 'cityStall', x: -15.9, z: -39.3, angle: 0 },
  { type: 'cityStall', x: -12, z: -39.3, angle: 0 },
  { type: 'cityStall', x: -8.1, z: -39.3, angle: 0 },
  { type: 'cityStall', x: -4.2, z: -39.3, angle: 0 },
  // --- The bus shelter (1)
  { type: 'cityShelter', x: 38.8, z: 7.5, angle: 3.142 },
  // --- Uptown plaza (base A) (5)
  { type: 'cityPlanterTall', x: 46.4, z: -17.2, angle: 0.357 },
  { type: 'cityConstruction', x: 47, z: -27.6, angle: 0.6 },
  { type: 'cityHoarding', x: 57.4, z: -28.8, angle: 1.571 },
  { type: 'cityUtilityBox', x: 41.5, z: -15.6, angle: 0.15 },
  { type: 'cityVending', x: 53.5, z: -13.2, angle: 0 },
  // --- The Stacks courtyard (base B) (3)
  { type: 'cityDumpster', x: -44.5, z: -28, angle: 0.359 },
  { type: 'cityDumpster', x: -41.5, z: -31.5, angle: 1.571 },
  { type: 'cityUtilityBox', x: -41.8, z: -24, angle: -0.125 },
  // --- The charging lot (base C) (8)
  { type: 'cityChargePost', x: -21.7, z: 41, angle: 1.571 },
  { type: 'cityChargePost', x: -21.7, z: 44.4, angle: 1.571 },
  { type: 'cityChargePost', x: -21.7, z: 46.6, angle: 1.571 },
  { type: 'cityCompact', x: -20.2, z: 44.9, angle: 1.571 },
  { type: 'cityCompact', x: -15.6, z: 39.6, angle: 0.15 },
  { type: 'cityDumpster', x: -3.4, z: 38.4, angle: 0.316 },
  { type: 'cityUtilityBox', x: -11.2, z: 36.9, angle: -0.157 },
  { type: 'cityCompact', x: -19.4, z: 50, angle: 0.03 },
  // --- Metro plaza (2)
  { type: 'cityAdPillar', x: 26.5, z: 37.5, angle: 0 },
  { type: 'cityPlanterTall', x: 18.6, z: 49, angle: 0.157 },
  // --- The evacuation jam (Boulevard west, eastbound lanes) (7)
  { type: 'citySedan', x: -56.7, z: 2, angle: -0.015 },
  { type: 'cityWreck', x: -52.03, z: 1.92, angle: 0.022 },
  { type: 'cityWreck', x: -47.5, z: 2, angle: -0.014 },
  { type: 'citySuv', x: -42.59, z: 2.05, angle: -0.002 },
  { type: 'citySedan', x: -35.91, z: 3.98, angle: 0.009 },
  { type: 'citySedan', x: -47.7, z: 4.1, angle: 0.027 },
  { type: 'cityCompact', x: -41.54, z: 4.12, angle: -0.047 },
  // --- Crossroads mouth, west (2)
  { type: 'citySuv', x: -20.85, z: 1.92, angle: 0.028 },
  { type: 'citySedan', x: -21, z: -2.13, angle: 3.128 },
  // --- Crossroads mouth, east (2)
  { type: 'citySedan', x: 27.3, z: 2.14, angle: 0.042 },
  { type: 'cityTaxi', x: 27.25, z: 5.86, angle: 0.04 },
  // --- Crossroads mouth, north (Avenue) (3)
  { type: 'citySedan', x: 9.82, z: -20.3, angle: -1.572 },
  { type: 'cityCompact', x: 4.76, z: -19.8, angle: 1.571 },
  { type: 'citySedan', x: 7.2, z: -21.2, angle: 1.6 },
  // --- Crossroads mouth, south (Avenue) (2)
  { type: 'citySuv', x: 9.85, z: 20.45, angle: -1.571 },
  { type: 'citySuv', x: 4.66, z: 20.45, angle: 1.598 },
  // --- The Cut jam (4)
  { type: 'citySuv', x: 29.41, z: 18.55, angle: -0.542 },
  { type: 'cityWreck', x: 32.41, z: 22.58, angle: -1.069 },
  { type: 'citySedan', x: 40.74, z: 34.73, angle: -0.944 },
  { type: 'citySedan', x: 41.39, z: 31.13, angle: -0.5 },
  // --- Parked row, garage frontage (South Street) (3)
  { type: 'citySuv', x: -56.05, z: 27.9, angle: -0.026 },
  { type: 'citySedan', x: -45.81, z: 27.79, angle: -0.038 },
  { type: 'cityCompact', x: -41.08, z: 27.92, angle: 0.021 },
  // --- Avenue, thinner (1)
  { type: 'citySuv', x: 7.25, z: -38, angle: -1.571 },
  // --- avenue-s (1)
  { type: 'cityWreck', x: 2.44, z: 35.15, angle: -1.598 },
  // --- South Street, thinner (1)
  { type: 'cityCompact', x: -12.2, z: 28.27, angle: -0.012 },
  // --- The Crossroads (hand-placed) (22)
  { type: 'cityTaxi', x: -10.5, z: -1.13, angle: 1.587 },
  { type: 'cityWreck', x: 9.6, z: 0.6, angle: 4.503 },
  { type: 'cityIsland', x: 6, z: -4.6, angle: 1.571 },
  { type: 'cityIslandScreen', x: 6, z: -4.6, angle: 1.571 },
  { type: 'cityJersey', x: 3.99, z: 8.25, angle: -8.379 },
  { type: 'citySedan', x: -0.65, z: 2.05, angle: -0.002 },
  { type: 'citySuv', x: 3.84, z: 3.35, angle: 0.523 },
  { type: 'citySedan', x: 8.89, z: 6.35, angle: -0.908 },
  { type: 'cityCompact', x: 12.34, z: 9.49, angle: -0.706 },
  { type: 'cityCompact', x: 21.41, z: 15.38, angle: -6.137 },
  { type: 'citySuv', x: 12.16, z: -11.57, angle: 1.262 },
  { type: 'cityTruck', x: 14.64, z: -6.85, angle: 0.409 },
  { type: 'cityJersey', x: 13.5, z: 0.01, angle: -0.261 },
  { type: 'cityCompact', x: 1.45, z: 10.3, angle: 1.264 },
  { type: 'cityWreck', x: -7.21, z: -7.66, angle: -1.042 },
  { type: 'cityCompact', x: 22.63, z: -8.44, angle: -0.265 },
  { type: 'citySedan', x: 14.01, z: 14.36, angle: -2.798 },
  { type: 'cityJersey', x: -1.65, z: 14.37, angle: 2.618 },
  { type: 'cityJersey', x: 12.98, z: 1.31, angle: 2.622 },
  { type: 'cityJersey', x: 18.33, z: -6.47, angle: 0.521 },
  { type: 'citySedan', x: -5.17, z: 0.02, angle: -0.705 },
  { type: 'cityJersey', x: -6.75, z: 0.88, angle: -0.364 },
  // --- Cover: The Boulevard (23)
  { type: 'cityHoarding', x: -30.34, z: -3.66, angle: 1.478 },
  { type: 'cityHoarding', x: -34.6, z: -7.25, angle: -1.571 },
  { type: 'cityHoarding', x: -39.56, z: -2.4, angle: 1.916 },
  { type: 'cityDumpster', x: -25.25, z: 7.85, angle: -0.204 },
  { type: 'cityConstruction', x: -29.13, z: 4.1, angle: 1.256 },
  { type: 'cityHoarding', x: 42.32, z: -9.3, angle: 1.787 },
  { type: 'cityHoarding', x: -34.35, z: 7.75, angle: -1.571 },
  { type: 'cityShelter', x: 45.25, z: -7.85, angle: 1.571 },
  { type: 'cityHoarding', x: 39.17, z: 0.17, angle: 1.693 },
  { type: 'cityHoarding', x: 41.29, z: 3.12, angle: 1.955 },
  { type: 'cityConstruction', x: -13.46, z: 4.98, angle: 0.884 },
  { type: 'cityPlanterTall', x: 34.75, z: 8.1, angle: 1.571 },
  { type: 'cityDumpster', x: -25.25, z: -7.85, angle: -0.228 },
  { type: 'cityJersey', x: -18.03, z: -7.76, angle: 0.897 },
  { type: 'cityKiosk', x: -50.75, z: 7.85, angle: 1.571 },
  { type: 'cityJersey', x: -13.38, z: -4.63, angle: 1.315 },
  { type: 'cityDumpster', x: -35.6, z: 6.25, angle: 0 },
  { type: 'cityJersey', x: -55.7, z: 6.5, angle: -0.092 },
  { type: 'cityJersey', x: 24.68, z: 3.64, angle: 1.658 },
  { type: 'cityJersey', x: -31.34, z: 6.4, angle: 0.09 },
  { type: 'cityJersey', x: -15.17, z: 1.98, angle: 1.366 },
  { type: 'cityScreenWall', x: 31.75, z: 7.85, angle: 1.571 },
  { type: 'cityPlanterTall', x: -17.75, z: 8.1, angle: -0.157 },
  // --- Cover: The Avenue (17)
  { type: 'cityConstruction', x: 2.98, z: -37.38, angle: 0.308 },
  { type: 'cityHoarding', x: 0.15, z: 42.25, angle: -1.571 },
  { type: 'cityHoarding', x: 6.47, z: 40.02, angle: 0.136 },
  { type: 'cityConstruction', x: 5.73, z: -32.95, angle: 0.123 },
  { type: 'cityHoarding', x: 6.69, z: 48.83, angle: -0.16 },
  { type: 'cityPlanterTall', x: 11.35, z: -34.25, angle: -0.157 },
  { type: 'cityConstruction', x: 3.85, z: 28.04, angle: 0.159 },
  { type: 'cityConstruction', x: 6.04, z: -28.13, angle: 0.14 },
  { type: 'cityJersey', x: 8.71, z: 47.12, angle: -0.168 },
  { type: 'cityJersey', x: 5, z:  -49.2, angle:  -0.9 },
  { type: 'cityJersey', x: 6.8, z: 27.25, angle: 0.244 },
  { type: 'cityPlanterTall', x: 11.35, z: 37.75, angle: 0.156 },
  { type: 'cityPlanterTall', x: 0.65, z: -25.25, angle: 0 },
  { type: 'cityJersey', x: 7.81, z: -16.79, angle: 0.314 },
  { type: 'cityJersey', x: 2.75, z: -36.18, angle: -0.3 },
  { type: 'cityJersey', x: 7.7, z: 44.61, angle: -0.218 },
  { type: 'cityJersey', x: 3.86, z: -17.25, angle: -0.342 },
  // --- Cover: West Street (10)
  { type: 'cityDumpster', x: -26.15, z: -23.75, angle: 0.25 },
  { type: 'cityDumpster', x: -33.85, z: -31.25, angle: -0.152 },
  { type: 'cityHoarding', x: -27.05, z: -50.2, angle: 1.417 },
  { type: 'cityHoarding', x: -29.4, z:  -34.6, angle:  -0.5 },
  { type: 'cityHoarding', x: -30.87, z: 21.24, angle: 0.331 },
  { type: 'cityConstruction', x: -30.26, z: -12.17, angle: -0.153 },
  { type: 'cityJersey', x: -27, z: -15.38, angle: 1.463 },
  { type: 'cityJersey', x: -27.65, z: -0.56, angle: 0.698 },
  { type: 'cityJersey', x: -30.85, z: 16.09, angle: 0.229 },
  { type: 'cityJersey', x: -33.49, z: -1.83, angle: 0.96 },
  // --- Cover: North Lane (4)
  { type: 'cityDumpster', x: -10.5, z: -32.15, angle: 0 },
  { type: 'cityHoarding', x: -22.25, z: -35.31, angle: 1.695 },
  { type: 'cityShelter', x: -25.9, z: -40.25, angle: 0 },
  { type: 'cityPlanterTall', x: 0.65, z: -40.25, angle: 0.149 },
  // --- Cover: South Street (12)
  { type: 'cityHoarding', x: -26.3, z:  32.4, angle:  0.4 },
  { type: 'cityDumpster', x: -26.75, z: 26.15, angle: 1.895 },
  { type: 'cityDumpster', x: -22.25, z: 33.85, angle: 1.222 },
  { type: 'cityPlanterTall', x: -0.1, z: 25.75, angle: 0 },
  { type: 'cityConstruction', x: -32.01, z: -15.66, angle: -0.297 },
  { type: 'cityPlanterTall', x: -41.75, z: 33.85, angle: 1.728 },
  { type: 'cityJersey', x: -6.94, z: 30.92, angle: 0.966 },
  { type: 'cityDumpster', x: -34.25, z: 26.15, angle: 1.571 },
  { type: 'cityScreenWall', x: -35.35, z: 30.25, angle: -1.571 },
  { type: 'cityJersey', x: -19.76, z: 30.78, angle: 1.914 },
  { type: 'cityPlanterTall', x: -10.25, z: 33.85, angle: 1.414 },
  { type: 'cityJersey', x: -18.5, z: 27, angle: 0.061 },
  // --- Cover: The Cut (3)
  { type: 'cityHoarding', x: 27.96, z: 10.63, angle: 0.785 },
  { type: 'cityShelter', x: 31.53, z: 30.39, angle: 0.785 },
  { type: 'cityPlanterTall', x: 38.39, z: 23.53, angle: -0.639 },
  // --- Street dressing (low or small: changes no rule) (24)
  { type: 'cityHydrant', x: 44.71, z: 8.44, angle: 3.142 },
  { type: 'cityHydrant', x: 38.51, z: 38.89, angle: -0.785 },
  { type: 'cityBench', x: 27.76, z: 26.57, angle: 2.592 },
  { type: 'cityBench', x: 20.13, z: 19.93, angle: -0.568 },
  { type: 'cityBench', x: 36.47, z: -7.35, angle: -0.158 },
  { type: 'cityBench', x: 49.8, z: -16.06, angle: -0.142 },
  { type: 'cityBench', x: 45, z: -19.93, angle: 1.899 },
  { type: 'cityPlanter', x: -34.2, z: 30.13, angle: -1.728 },
  { type: 'cityPlanter', x: 12.99, z: 18.33, angle: 1.414 },
  { type: 'cityPlanter', x: 40.77, z: -33.66, angle: 1.728 },
  { type: 'cityPlanter', x: 57.52, z: -32.49, angle: 1.728 },
  { type: 'cityVending', x: -25.1, z: -32.05, angle: 3.142 },
  { type: 'cityVending', x: -26.2, z: 19.65, angle: -1.571 },
  { type: 'cityTrashBags', x: 22.38, z: 21.82, angle: 2.356 },
  { type: 'cityTrashBags', x: -48.44, z: 34.06, angle: 3.142 },
  { type: 'cityTrashBags', x: -31.27, z: -44.02, angle: 1.001 },
  { type: 'cityMotorbike', x: -15.79, z: -34.2, angle: 0.715 },
  { type: 'cityMotorbike', x: -43.7, z: -5.53, angle: 2.563 },
  { type: 'cityMotorbike', x: -50.01, z: 34.17, angle: 0 },
  { type: 'cityCone', x: 25.8, z: -3.21, angle: 2.908 },
  { type: 'cityCone', x: -31.98, z: 26.69, angle: 3.953 },
  { type: 'cityJersey', x: -12.5, z: -32.9, angle: 1.466 },
  { type: 'cityCone', x: 4.97, z: 35.76, angle: 2.87 },
  { type: 'cityUtilityBox', x: -33.94, z: -23.83, angle: -1.728 },
];
