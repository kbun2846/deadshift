// Maps are plain data. Coordinates are metres: x east, z south, y height.
import { ROADSIDE_TYPES } from './roadside.js';
import { addRailDepot, RAIL_TYPES } from './rail-depot.js';
import { interiorCover } from './detailed-interiors.js';
import {roundPlayableOutline} from './playable-area.js';
// A building's roof footprint is independent of its physical wall colliders.
const building = (id, x, z, w, d, height, label, color, roofColor) => ({
  id, x, z, w, d, height, label, color, roofColor, doorWidth: 2.6,
});

export const deadwater = {
  id: 'deadwater', name: 'Deadwater Outpost', width: 224, depth: 248,
  // Follow the developed districts, leaving scenery beyond the playable edge.
  playableArea:roundPlayableOutline([[-30,-124],[112,-124],[112,-17],[46,-17],[46,35],[68,56],[110,61],[110,124],[23,124],[23,101],[-15,76],[-88,76],[-112,-5],[-112,-66],[-88,-97],[-31,-85]]),
  roadBend: { start: 22, end: 46, offset: 15 },
  farmBend: { start: 48, end: 92, offset: 40 },
  sideRoads: [{ points: [[2,-27.6],[-19,-27.3],[-40,-28.2],[-65,-27.6],[-91,-28.5],[-92,-23.4],[-66,-22.7],[-41,-23.1],[-19,-22.5],[2,-22.6]] }],
  crops: [{ id: 'dry-corn', x: 78, z: 100, w: 30, d: 28, visibility: 5 }],
  spawn: { x: 0, z: 7 }, palette: { ground: '#776044', road: '#94764f' }, look: { warmth: .15 },
  buildings: [
    { ...building('saloon', -12, -5, 10, 10, 2.9, 'SALOON', '#b58f70', '#687269'), angle: Math.PI / 2, doors: ['front', 'right'], windows: [{ side: 'front', offset: 3, width: 1.65 }] },
    { ...building('supplies', 12, -7, 8, 9, 2.7, 'SUPPLIES', '#c4ae8c', '#a37154'), doors: ['front', 'left'] },
    building('sheriff', -13, 17, 8, 7, 2.6, 'SHERIFF', '#cbb58f', '#77786b'),
    { ...building('freight', -19, -36, 11, 9, 3, '', '#ad9273', '#777d70'), doors: ['front', 'right'], windows: [{ side: 'left', offset: -1.5, width: 1.5 }] },
    { ...building('boarding-house', 17, -34, 9, 11, 3.1, '', '#a08a70', '#8b745c'), angle: -Math.PI / 2, doors: ['front', 'back'], windows: [{ side: 'right', offset: 2.5, width: 1.6 }] },
    { ...building('abandoned-store', -43, -18, 9, 8, 2.65, '', '#95836b', '#747768'), angle: Math.PI / 2, abandoned: true, doors: ['front'], windows: [{ side: 'front', offset: -2.8, width: 1.4, boarded: true }, { side: 'back', offset: 1.8, width: 1.5, boarded: true }] },
    { ...building('old-house', -43, 9, 8, 8, 2.5, '', '#a48c72', '#8d7c65'), abandoned: true, doors: ['front'], windows: [{ side: 'left', offset: 1.7, width: 1.5, boarded: true }, { side: 'back', offset: -1.8, width: 1.4, boarded: true }] },
    { ...building('workshop', -30, 38, 14, 12, 2.8, '', '#a58d70', '#6e7971'), interiorStyle:'workshop', angle: Math.PI / 2, doors: ['front', 'back'], windows: [{ side: 'left', offset: 2.2, width: 1.6 }] },
    { ...building('south-store', -6, 45, 8, 8, 2.7, '', '#b5a080', '#8a7967'), angle: Math.PI / 2, doors: ['front', 'right'], windows: [{ side: 'back', offset: 1.8, width: 1.5, boarded: true }] },
    { ...building('farmhouse', 75, 76, 9, 8, 2.7, '', '#c0ac89', '#7b826d'), doors: ['front', 'left'], windows: [{ side: 'right', offset: -1.8, width: 1.5 }] },
    { ...building('barn', -60, 50, 12, 8, 3.1, '', '#9e8064', '#777c70'), angle: Math.PI, doors: ['front', 'right'], windows: [{ side: 'left', offset: 1.5, width: 1.7 }] },
    { ...building('west-mercantile', -75, -40, 10, 8, 2.9, '', '#af9474', '#788174'), doors: ['front','right'], windows: [{side:'front',offset:-3.1,width:1.4}] },
    { ...building('west-homestead', -86, -11, 9, 8, 2.6, '', '#b19c7c', '#88765f'), angle: Math.PI, doors:['front'], windows:[{side:'right',offset:1.5,width:1.4,boarded:true}], abandoned:true },
    { ...building('west-depot', -98, -26, 14, 13, 2.8, '', '#998369', '#797c6b'), interiorStyle:'depot', angle: Math.PI/2, doors:['front','right'], windows:[{side:'left',offset:1.5,width:1.5},{side:'back',offset:3,width:1.4,boarded:true}] },
  ],
  props: [
    { type: 'tower', x: -24, z: -17 },
    { type: 'well', x: 0, z: -11 },
    { type: 'cart', x: -5, z: 14, angle: .15 },
    { type: 'barrel', x: -6, z: 1.5 }, { type: 'barrel', x: -5.8, z: 3 },
    { type: 'barrel', x: 7, z: -1 }, { type: 'barrel', x: 6, z: -2.4 },
    { type: 'crate', x: 16, z: -.8 }, { type: 'crate', x: 17.5, z: -.8 },
    { type: 'crate', x: -18, z: 2 }, { type: 'crate', x: -18, z: 3.5 },
    { type: 'hay', x: 21, z: 14 }, { type: 'hay', x: 21, z: 16 },
    { type: 'sign', x: 4.5, z: 1.8, label: 'THE RANGE →' },
    // Deliveries stay beside the supply porch, keeping its doorway clear.
    { type: 'crate', x: 18, z: -4 }, { type: 'crate', x: 19.5, z: -4 },
    { type: 'barrel', x: 18.5, z: -6 }, { type: 'barrel', x: 19.7, z: -6.2 },
    // Saloon and sheriff stores create optional flanking cover off the street.
    { type: 'barrel', x: -18.7, z: -5.5 }, { type: 'barrel', x: -18.7, z: -7 },
    { type: 'crate', x: -7, z: -11.5 }, { type: 'crate', x: -8.5, z: -11.5 },
    { type: 'barrel', x: -8.4, z: 19 }, { type: 'crate', x: -7, z: 20.2 },
    // Range cover sits to the side of firing lanes, never in front of targets.
    { type: 'crate', x: 6.2, z: 11.8 }, { type: 'barrel', x: 7.6, z: 12.6 },
    { type: 'crate', x: 18.8, z: 9.5 }, { type: 'barrel', x: 19.8, z: 8 },
    { type: 'sign', x: -4.7, z: 11, label: 'SHERIFF', direction: -1, angle: -.15 },
    { type: 'sign', x: 4.8, z: -14, label: 'WATER', direction: -1, angle: .15 },
    { type: 'sign', x: 15.6, z: 19.3, label: 'RANGE', direction: 1, angle: -.2 },
    { type: 'cactus', x: -22, z: 6, scale: 1.1 }, { type: 'cactus', x: -23.8, z: 7.8, scale: .65 },
    { type: 'cactus', x: 26, z: -5, scale: 1.15 }, { type: 'cactus', x: 27.4, z: -3.4, scale: .7 },
    { type: 'cactus', x: 25, z: 20 }, { type: 'cactus', x: -22, z: 23, scale: 1.2 },
    { type: 'cactus', x: 6, z: -24, scale: .9 }, { type: 'cactus', x: -26, z: -9 },
    { type: 'cactus', x: 20, z: -23 }, { type: 'cactus', x: -8, z: 27, scale: .8 },
    { type: 'cactus', x: 24, z: 1, scale: .8 },
    { type: 'cactus', x: -9.5, z: 5.8, scale: .8 }, { type: 'cactus', x: -11.3, z: 7.2, scale: .5 },
    { type: 'cactus', x: -20.5, z: 12, scale: .85 }, { type: 'cactus', x: -28, z: 19, scale: 1.1 },
    { type: 'cactus', x: -29.8, z: 20.6, scale: .6 }, { type: 'cactus', x: -18, z: -16, scale: .75 },
    { type: 'cactus', x: -8, z: -21, scale: 1 }, { type: 'cactus', x: -6.4, z: -22.5, scale: .55 },
    { type: 'cactus', x: 10, z: -18, scale: .65 }, { type: 'cactus', x: 23, z: -15, scale: 1.1 },
    { type: 'cactus', x: 25, z: -16.2, scale: .6 }, { type: 'cactus', x: 29, z: 10, scale: 1.2 },
    { type: 'cactus', x: 30.8, z: 11.8, scale: .65 }, { type: 'cactus', x: 10, z: 24, scale: .85 },
    { type: 'cactus', x: 12, z: 25, scale: .5 }, { type: 'cactus', x: -19, z: 27, scale: .7 },
    { type: 'deadwood', x: -16.5, z: 8.5, angle: .4 }, { type: 'deadwood', x: 26, z: 15, angle: -1 },
    { type: 'deadwood', x: 16, z: -19, angle: .8 }, { type: 'deadwood', x: -7, z: 24, angle: -.2 },
    { type: 'barrel', x: -23, z: -13 }, { type: 'crate', x: -21.5, z: -12.5 },
    { type: 'hay', x: 18.5, z: 22.5 },
    { type: 'brokenWagon', x: 8, z: 35, angle: -.35 },
    { type: 'windmill', x: 96, z: 81 }, { type: 'trough', x: 92, z: 84 },
    { type: 'well', x: 86, z: 76 },
    { type: 'hay', x: -69, z: 48 }, { type: 'hay', x: -69, z: 53 },
    { type: 'barrel', x: 81, z: 74 }, { type: 'crate', x: 69, z: 73 },
    { type: 'crate', x: -52, z: 50 }, { type: 'barrel', x: -67, z: 45 },
    // Open country landmarks: remnants of the old water and freight routes.
    { type: 'cistern', x: -68, z: -73 }, { type: 'ruinedArch', x: 53, z: -70 },
    { type: 'brokenWagon', x: 28, z: 67, angle: .9 },
    { type: 'cistern', x: -53, z: 98 },
    { type: 'telegraph', x: 7, z: -61 }, { type: 'telegraph', x: 7, z: -85 },
    { type: 'telegraph', x: 7, z: -109 }, { type: 'telegraph', x: 32, z: 59 },
    { type: 'freightWreck', x: -8, z: -53 },
    // Open side turned toward the street rather than up the map: the road runs
    // west of it here, so the shelter leans that way.
    { type: 'coachStop', x: 10, z: -76, angle: -1.15 },
    { type: 'loadingPlatform', x: -10, z: -96 },
    { type: 'wateringStation', x: 46, z: 111 },
    { type: 'culvert', x: 0, z: -112 },
    { type: 'fallenPole', x: 28, z: 57 },
    { type: 'oreSite', x: 29, z: 78 },
    { type: 'checkpoint', x: 0, z: -64 },
    { type: 'repairStation', x: 40, z: 66 },
    { type: 'graveyard', x: -11, z: -119 },
    { type: 'well', x: -65, z: -16 }, { type: 'tower', x: -103, z: -43 },
    { type: 'cart', x: -66, z: -34, angle: .15 },
    { type: 'barrel', x: -68, z: -39 }, { type:'crate',x:-82,z:-40 },
    { type: 'crate', x: -92, z: -7 }, { type:'barrel',x:-92,z:-9 },
    { type: 'telegraph', x: -53, z: -30.5 }, { type: 'telegraph', x: -77, z: -30.5 },
    // Sparse shelter follows old drainage lines and rocky outcrops, leaving broad gaps.
    ...[[-55,-66],[-60,-47],[48,-57],[77,-36],[-73,71],[32,82],[89,44]].map(([x,z]) => ({ type: 'boulder', x, z })),
    // Old yard boundaries, freight lay-bys and drainage rock interrupt long shots.
    // Staggered groups have open flanks; none close the main road or doorways.
    ...[[-29,0],[-30,20],[30,-14],[-56,-16],[-66,-5],[-48,48],[43,86],[18,-50],[-16,-84]].map(([x,z])=>({type:'stoneBoundary',x,z})),
    ...[[-31,-33],[-38,29],[-54,58],[-60,-34],[27,27],[67,67],[-10,-72]].map(([x,z])=>({type:'timberStack',x,z})),
    ...[[36,5],[-57,13],[44,40],[-24,60],[-43,-52],[-78,-56],[18,-98],[42,101],[-80,37]].map(([x,z])=>({type:'rockRidge',x,z})),
    ...[[29,-30],[-26,10],[-52,-32],[-70,-19],[7,-48],[20,54],[-14,-105]].map(([x,z])=>({type:'freightScreen',x,z})),
    ...[[-62,-60],[-85,-34],[58,-52],[-70,78],[33,88]].map(([x,z]) => ({ type: 'deadTree', x, z })),
    ...[[-65,-57],[61,-49],[-73,82],[36,91]].map(([x,z]) => ({ type: 'stump', x, z })),
    ...[[-77,-79],[-85,-65],[60,-79],[71,-59],[-71,92],[-80,100],[33,76],[19,57],[94,61],[-29,-100],[80,-10],[-88,15],[-60,73]].flatMap(([x,z], i) => [
      { type: 'cactus', x, z, scale: .8 + i % 3 * .2 },
      { type: 'cactus', x: x + 1.9, z: z + 1.2, scale: .55 },
      { type: 'deadwood', x: x - 2.3, z: z + 3, angle: i * .7 },
    ]),
    { type: 'cart', x: -26, z: -29, angle: -.1 },
    { type: 'crate', x: -12, z: -34 }, { type: 'crate', x: -12, z: -32.5 },
    { type: 'barrel', x: 24, z: -30 }, { type: 'barrel', x: 24, z: -32 },
    { type: 'deadwood', x: -36, z: -23, angle: .9 }, { type: 'crate', x: -49, z: -14 },
    { type: 'barrel', x: -37, z: 13 }, { type: 'deadwood', x: -49, z: 15, angle: -.5 },
    { type: 'crate', x: -24, z: 44 }, { type: 'barrel', x: -36, z: 34 },
    { type: 'sign', x: 17, z: 28, direction: 1 },
    { type: 'cactus', x: -47, z: -39, scale: 1.3 }, { type: 'cactus', x: -45, z: -40, scale: .6 },
    { type: 'cactus', x: -31, z: -43 }, { type: 'cactus', x: 30, z: -42, scale: 1.2 },
    { type: 'cactus', x: 45, z: -21 }, { type: 'cactus', x: 47, z: -20, scale: .65 },
    { type: 'cactus', x: -49, z: 35, scale: 1.2 }, { type: 'cactus', x: -47, z: 37, scale: .7 },
    { type: 'cactus', x: 25, z: 49 }, { type: 'deadwood', x: -14, z: 32, angle: 1.1 },
    // Freight left in the open country between the districts, and cactus stands
    // on the dry ground between them. Placed off the road corridor, clear of
    // buildings, fences, targets and every existing prop, and inside the
    // playable outline, so they add cover to cross rather than walls to route
    // around. All of it is breakable: five health, one orb clears it.
    { type: 'crate', x: -44, z: -8 }, { type: 'barrel', x: -43.5, z: -5.4 }, { type: 'crate', x: -45.9, z: -6.8 },
    { type: 'crate', x: -62, z: 20 }, { type: 'crate', x: -64.4, z: 19.1 }, { type: 'barrel', x: -63.5, z: 21.3 },
    { type: 'crate', x: -59.7, z: 20.2 }, { type: 'crate', x: -30, z: -58 }, { type: 'crate', x: -31.1, z: -60.2 },
    { type: 'barrel', x: -27.8, z: -58.3 }, { type: 'crate', x: -29.1, z: -56.1 }, { type: 'barrel', x: 38, z: 20 },
    { type: 'barrel', x: 36.5, z: 18.8 }, { type: 'barrel', x: 39.5, z: 17.8 }, { type: 'crate', x: 37.9, z: 22.2 },
    { type: 'crate', x: -96, z: 4 }, { type: 'crate', x: -98.4, z: 3.5 }, { type: 'crate', x: -93.7, z: 3 },
    { type: 'crate', x: -96, z: 6.6 }, { type: 'barrel', x: 46, z: 92 }, { type: 'crate', x: 43.6, z: 91.3 },
    { type: 'barrel', x: 44.7, z: 93.4 }, { type: 'barrel', x: 56, z: 72 }, { type: 'barrel', x: 57.9, z: 72.1 },
    { type: 'crate', x: -90, z: 44 }, { type: 'barrel', x: -88.8, z: 45.6 }, { type: 'crate', x: -91.5, z: 42.7 },
    { type: 'barrel', x: -87.5, z: 43.5 }, { type: 'crate', x: -80, z: 10 }, { type: 'crate', x: -79.2, z: 8 },
    { type: 'barrel', x: -77.7, z: 10.4 }, { type: 'crate', x: -36, z: -70 }, { type: 'crate', x: -36.6, z: -68.1 },
    { type: 'crate', x: 66, z: -24 }, { type: 'barrel', x: 68.4, z: -25.1 }, { type: 'barrel', x: 6, z: 80 },
    { type: 'barrel', x: 7.9, z: 81.6 }, { type: 'barrel', x: 7.6, z: 78.9 }, { type: 'cactus', x: -16, z: -46, scale: 1.1 },
    { type: 'cactus', x: -18.3, z: -46.4, scale: 0.7 }, { type: 'cactus', x: 34, z: 36, scale: 1.3 }, { type: 'cactus', x: 30.7, z: 35, scale: 0.6 },
    { type: 'cactus', x: -64, z: 68, scale: 0.9 }, { type: 'cactus', x: -60.6, z: 68.9, scale: 0.6 }, { type: 'cactus', x: -46, z: -84, scale: 1.2 },
    { type: 'cactus', x: -48.5, z: -82.3, scale: 0.6 }, { type: 'cactus', x: -46.8, z: -80.7, scale: 0.8 }, { type: 'cactus', x: 82, z: -28, scale: 1.2 },
    { type: 'cactus', x: 78.9, z: -27.1, scale: 0.8 }, { type: 'cactus', x: -100, z: 20, scale: 0.9 }, { type: 'cactus', x: -97, z: 18.8, scale: 0.7 },
    { type: 'cactus', x: -4, z: 58, scale: 1.1 }, { type: 'cactus', x: -5, z: 60.5, scale: 0.5 }, { type: 'cactus', x: -2.4, z: 54.7, scale: 0.6 },
    { type: 'cactus', x: 40, z: -24, scale: 1.3 }, { type: 'cactus', x: 37.2, z: -25.4, scale: 0.8 }, { type: 'cactus', x: 28, z: 84, scale: 1.1 },
    { type: 'cactus', x: 25.8, z: 84.8, scale: 0.7 }, { type: 'cactus', x: 78, z: -62, scale: 1 }, { type: 'cactus', x: 80.2, z: -61.3, scale: 0.5 },
    { type: 'cactus', x: -68, z: 36, scale: 1.1 }, { type: 'cactus', x: -64.7, z: 37.3, scale: 0.8 }, { type: 'cactus', x: -68.4, z: 33.4, scale: 0.6 },
    { type: 'cactus', x: -22, z: -70, scale: 0.9 }, { type: 'cactus', x: -19.6, z: -71.5, scale: 0.7 }, { type: 'cactus', x: -25.5, z: -69.9, scale: 0.5 },
    { type: 'cactus', x: 18, z: 70, scale: 1 }, { type: 'cactus', x: 20.4, z: 68.4, scale: 0.6 }, { type: 'cactus', x: 19, z: 72, scale: 0.8 },
    { type: 'cactus', x: -30, z: -14, scale: 1.2 }, { type: 'cactus', x: -32.7, z: -13.5, scale: 0.6 }, { type: 'cactus', x: -94, z: 32, scale: 0.9 },
    { type: 'cactus', x: -91.9, z: 33.5, scale: 0.7 }, { type: 'cactus', x: 46, z: 48, scale: 1.2 }, { type: 'cactus', x: 43.2, z: 50.4, scale: 0.6 },
    { type: 'cactus', x: 46.8, z: 44.7, scale: 0.6 }, { type: 'cactus', x: -104, z: -14, scale: 1.1 }, { type: 'cactus', x: -106.4, z: -13.9, scale: 0.7 },
    { type: 'cactus', x: -48, z: -8, scale: 1 }, { type: 'cactus', x: -50.4, z: -8.2, scale: 0.7 }, { type: 'cactus', x: -26, z: -88, scale: 1.1 },
    { type: 'cactus', x: -27.9, z: -90.7, scale: 0.6 }, { type: 'cactus', x: -29.1, z: -87.1, scale: 0.7 }, { type: 'cactus', x: -98, z: -40, scale: 0.9 },
    { type: 'cactus', x: -95.3, z: -40.3, scale: 0.7 }, { type: 'cactus', x: -97, z: -37.5, scale: 0.8 }, { type: 'cactus', x: 36, z: 104, scale: 1.1 },
    { type: 'cactus', x: 35.4, z: 100.8, scale: 0.7 }, { type: 'cactus', x: 96, z: 74, scale: 1 }, { type: 'cactus', x: 97.5, z: 76.1, scale: 0.8 },
    // A second pass on the town fringe, so the extra cover is met in normal
    // play rather than only out in open country.
    { type: 'crate', x: -54, z: 4 }, { type: 'barrel', x: -53.4, z: 6.4 }, { type: 'crate', x: -44, z: 66 },
    { type: 'crate', x: -42.9, z: 67.7 }, { type: 'crate', x: -44.7, z: 64.2 }, { type: 'barrel', x: -42, z: 64.5 },
    { type: 'crate', x: -12, z: -66 }, { type: 'crate', x: -11.8, z: -68 }, { type: 'crate', x: -9.5, z: -65 },
    { type: 'barrel', x: -24, z: -4 }, { type: 'crate', x: -26.1, z: -3.9 }, { type: 'barrel', x: -7.5, z: 32.1 },
    { type: 'barrel', x: -9.5, z: 33.3 }, { type: 'cactus', x: 29.4, z: 18.9, scale: 1 }, { type: 'cactus', x: 30.6, z: 21, scale: 0.6 },
    { type: 'crate', x: -10.1, z: -16.3 }, { type: 'crate', x: -11.5, z: -18.1 }, { type: 'cactus', x: 30.7, z: -18.8, scale: 1 },
    { type: 'cactus', x: 28.5, z: -19.8, scale: 0.6 }, { type: 'crate', x: -30.5, z: 6.9 }, { type: 'barrel', x: -28.5, z: 5.5 },
    { type: 'barrel', x: 30, z: 2 }, { type: 'crate', x: 27.9, z: 0.6 }, { type: 'cactus', x: -17.7, z: 38.1, scale: 1.1 },
    { type: 'cactus', x: -17.4, z: 40.5, scale: 0.8 }, { type: 'cactus', x: 33.6, z: -4, scale: 1 }, { type: 'cactus', x: 31.2, z: -4, scale: 0.6 },
    { type: 'cactus', x: 27.8, z: -24, scale: 1 }, { type: 'cactus', x: 30.2, z: -23.5, scale: 0.7 }, { type: 'cactus', x: -38.3, z: 19.6, scale: 0.8 },
    { type: 'cactus', x: -40.7, z: 19.9, scale: 0.8 }, { type: 'barrel', x: 37.7, z: 28.6 }, { type: 'barrel', x: 39.7, z: 29.7 },
    { type: 'barrel', x: 36, z: 27.7 },
    // Hard cover and open-country dressing. The cover pieces are bent or
    // broken lines rather than straight walls, angled per instance, and spaced
    // so every one of them can be flanked; none is destructible, so a fight
    // cannot delete the cover it is being fought around.
    { type: 'sandbags', x: 22.7, z: -10.5, angle: 0.3 }, { type: 'sandbags', x: -52, z: 20.5, angle: -0.7 },
    { type: 'sandbags', x: 34.3, z: 14.6, angle: -0.1 }, { type: 'sandbags', x: -22, z: 52, angle: 0.1 },
    { type: 'sandbags', x: 62, z: -30, angle: 1.1 }, { type: 'sandbags', x: -73.8, z: -50.1, angle: 0.9 },
    { type: 'sandbags', x: 52, z: 64, angle: -0.2 }, { type: 'sandbags', x: 30, z: 96, angle: -1.1 },
    { type: 'sandbags', x: -96.7, z: 11.6, angle: -0.7 }, { type: 'sandbags', x: -20.4, z: -100.3, angle: -0.7 },
    { type: 'sandbags', x: -72.1, z: -63.7, angle: -1 }, { type: 'sandbags', x: 8, z: 72, angle: -0.7 },
    { type: 'sandbags', x: -88, z: 54, angle: -1.2 }, { type: 'plankBarricade', x: -40.1, z: -38, angle: -0.3 },
    { type: 'plankBarricade', x: 38, z: -4, angle: 0.2 }, { type: 'plankBarricade', x: -44.4, z: 41.9, angle: 0.7 },
    { type: 'plankBarricade', x: 26.8, z: 33.2, angle: -0.6 }, { type: 'plankBarricade', x: -69.8, z: -10.5, angle: -0.6 },
    { type: 'plankBarricade', x: -3.4, z: 73, angle: 0.8 }, { type: 'plankBarricade', x: -38, z: -74, angle: 1.3 },
    { type: 'plankBarricade', x: 89.7, z: -22.6, angle: -1.1 }, { type: 'plankBarricade', x: -58, z: 62, angle: -0.7 },
    { type: 'plankBarricade', x: 81.2, z: 66.1, angle: -1.1 }, { type: 'plankBarricade', x: -100, z: -8, angle: 0.7 },
    { type: 'plankBarricade', x: 29.1, z: -101.2, angle: 0.7 }, { type: 'plankBarricade', x: -76, z: 26, angle: 1.2 },
    { type: 'plankBarricade', x: 27.4, z: -35.9, angle: 0.2 }, { type: 'plankBarricade', x: -40.7, z: -44.2, angle: 0.9 },
    { type: 'waterTank', x: -59.6, z: -1.4 }, { type: 'waterTank', x: 33.6, z: -22.5 },
    { type: 'waterTank', x: -26, z: 69.2 }, { type: 'waterTank', x: -86.8, z: 38.7 },
    { type: 'waterTank', x: 38.6, z: 52.2 }, { type: 'waterTank', x: -63.8, z: -51.2 },
    { type: 'waterTank', x: -13.7, z: -77.1 }, { type: 'waterTank', x: 99.7, z: 64.7 },
    { type: 'waterTank', x: -95.9, z: -13 }, { type: 'stoneBoundary', x: -74.8, z: 44.7, angle: 0.7 },
    { type: 'stoneBoundary', x: 52, z: -23.3, angle: -0.5 }, { type: 'stoneBoundary', x: -18, z: -62, angle: 0.7 },
    { type: 'stoneBoundary', x: -60.1, z: -82, angle: 0.3 }, { type: 'timberStack', x: -35.9, z: 50.5, angle: -0.1 },
    { type: 'timberStack', x: -86.9, z: 7.1, angle: -0.6 }, { type: 'rockRidge', x: -71.1, z: 62.1, angle: -0.7 },
    { type: 'rockRidge', x: -53.6, z: -41, angle: -0.1 }, { type: 'freightScreen', x: -17.6, z: -51.2, angle: 0.1 },
    { type: 'freightScreen', x: -90, z: -54, angle: -0.1 }, { type: 'freightScreen', x: 73, z: -64.8, angle: 1.3 },
    { type: 'freightScreen', x: 18, z: 80, angle: 1 }, { type: 'freightScreen', x: 100.5, z: -54.7, angle: -0.3 },
    { type: 'boulder', x: -48, z: -62 }, { type: 'boulder', x: 45.7, z: -29.8 },
    { type: 'boulder', x: -16, z: 49.2 }, { type: 'boulder', x: 73.7, z: 64 },
    { type: 'boulder', x: -60, z: 32 }, { type: 'boulder', x: -24, z: -92 },
    { type: 'boulder', x: 86, z: -32 }, { type: 'boulder', x: 58.7, z: 77.1 },
    { type: 'boulder', x: -85.2, z: 59.9 }, { type: 'boulder', x: 13.3, z: -22.7 },
    { type: 'boulder', x: -39.2, z: 69.1 }, { type: 'deadTree', x: 30, z: 40 },
    { type: 'deadTree', x: -73.2, z: 54.7 }, { type: 'deadTree', x: 67.6, z: -43 },
    { type: 'deadTree', x: -17.5, z: 70.9 }, { type: 'deadTree', x: -87.6, z: 19.5 },
    { type: 'deadTree', x: 54.2, z: 76.4 }, { type: 'deadTree', x: -54.9, z: -74.9 },
    { type: 'stump', x: 32, z: 44 }, { type: 'stump', x: -64.4, z: 59.3 },
    { type: 'stump', x: 55.9, z: -29.4 }, { type: 'stump', x: -11, z: 74.3 },
    { type: 'stump', x: -88, z: 24 }, { type: 'deadwood', x: -30, z: -52 },
    { type: 'deadwood', x: 41.4, z: 20.6 }, { type: 'deadwood', x: -59.2, z: -8.5 },
    { type: 'deadwood', x: 54, z: 54 }, { type: 'deadwood', x: 16.7, z: 63.7 },
    { type: 'deadwood', x: -82.6, z: 48.9 }, { type: 'deadwood', x: 76, z: -24 },
    { type: 'hay', x: -53.7, z: -10.2 }, { type: 'hay', x: 64.8, z: 62.6 },
    { type: 'hay', x: -89.6, z: -44.9 }, { type: 'hay', x: 6, z: 56 },
    { type: 'cart', x: -32.6, z: 13.5 }, { type: 'cart', x: -74, z: 34 },
    { type: 'cart', x: -16, z: 62 }, { type: 'well', x: -58, z: -56 },
    { type: 'well', x: 39.5, z: 91 }, { type: 'well', x: -30, z: -84 },
    { type: 'telegraph', x: -46, z: -36 }, { type: 'telegraph', x: -45.3, z: -57.1 },
    { type: 'telegraph', x: -46, z: -68 }, { type: 'telegraph', x: 42, z: 62 },
    { type: 'telegraph', x: 48.9, z: 72.7 }, { type: 'telegraph', x: 42, z: 94 },
    // Floor clutter: a pot or two against an interior wall, a chair that lost
    // a leg, and a few pieces beside the front steps. Walked over rather than
    // collided with, breakable like everything else, and kept deliberately
    // sparse — two or three a building, never across a doorway lane.
    { type: 'pottedPlant', x: -16.1, z: -6.1 }, { type: 'pot', x: -7.8, z: -2.1 }, { type: 'pot', x: -5.9, z: -6.7 },
    { type: 'pot', x: -5.9, z: -0.7 }, { type: 'pottedPlant', x: 10.9, z: -10.6 }, { type: 'brokenChair', x: 9.7, z: -10.6 },
    { type: 'brokenChair', x: 14.2, z: -10.6 }, { type: 'pottedPlant', x: -12.4, z: 19.7 }, { type: 'pottedPlant', x: -20.7, z: -39.6 },
    { type: 'brokenChair', x: -21.3, z: -32.3 }, { type: 'pot', x: -15.6, z: -30.4 }, { type: 'pot', x: -23, z: -30.1 },
    { type: 'pot', x: 12.5, z: -36.9 }, { type: 'pot', x: 21.5, z: -30.8 }, { type: 'pottedPlant', x: 21.8, z: -36.8 },
    { type: 'pot', x: 10, z: -32.8 }, { type: 'pot', x: 10.5, z: -31.3 }, { type: 'brokenChair', x: -39.7, z: -15.5 },
    { type: 'brokenChair', x: -40.9, z: 12.3 }, { type: 'pot', x: -41.6, z: 14.6 }, { type: 'pottedPlant', x: -24.8, z: 32.9 },
    { type: 'pottedPlant', x: -23, z: 41.7 }, { type: 'pottedPlant', x: -22.6, z: 43.6 }, { type: 'pot', x: -2.8, z: 42.6 },
    { type: 'pot', x: -1, z: 48.5 }, { type: 'pot', x: 71.9, z: 72.9 }, { type: 'pottedPlant', x: 78.2, z: 79.2 },
    { type: 'brokenChair', x: 77.1, z: 72.9 }, { type: 'pot', x: 72, z: 80.8 }, { type: 'pot', x: 73.3, z: 80.8 },
    { type: 'pottedPlant', x: -62.7, z: 47 }, { type: 'brokenChair', x: -77.1, z: -43.1 }, { type: 'pot', x: -75.7, z: -43.1 },
    { type: 'brokenChair', x: -77.4, z: -34.7 }, { type: 'brokenChair', x: -87.8, z: -8 }, { type: 'brokenChair', x: -88.2, z: -14.3 },
    { type: 'pot', x: -82.8, z: -16 }, { type: 'brokenChair', x: -92.3, z: -30.3 }, { type: 'brokenChair', x: -90.2, z: -28.8 },
    { type: 'brokenChair', x: 37.5, z: -107.6 }, { type: 'pot', x: 41.8, z: -39.1 }, { type: 'pottedPlant', x: 43.2, z: -55.4 },
    { type: 'pottedPlant', x: 52.3, z: -38.7 }, { type: 'pot', x: 45.9, z: -37.1 }, { type: 'pot', x: 83.5, z: -81.1 },
    { type: 'pot', x: 86.9, z: -80.7 }, { type: 'pot', x: 99, z: -72.4 },
  ],
  fences: [
    // A connected range enclosure, open to the street with a south exit.
    { x: 23, z: 9, length: 20, axis: 'z' },
    { x: 10, z: 19, length: 8, axis: 'x' },
    { x: 20, z: 19, length: 6, axis: 'x' },
    { x: 21.5, z: -1, length: 3, axis: 'x' },
    // Water-tower service yard: two joined sides, entrance facing the well.
    { x: -27, z: -16, length: 10, axis: 'z' },
    { x: -20.5, z: -21, length: 13, axis: 'x' },
    // Farm gates on all approaches; the crop field remains walkable cover.
    { x: 61, z: 96, length: 14, axis: 'z' }, { x: 61, z: 112, length: 5, axis: 'z' },
    { x: 95, z: 101, length: 23, axis: 'z' },
    { x: 79, z: 116, length: 20, axis: 'x' },
    { x: -25, z: -43, length: 12, axis: 'x' },
  ],
  targets: [
    { id: 'range-a', x: 8, z: 5 }, { id: 'range-b', x: 12, z: 5, maxHp: 500 },
    { id: 'range-c', x: 16, z: 5 },
    { id: 'runner', x: 12, z: 11, moving: true, travel: 4 },
    { id: 'saloon-target', x: -12, z: -6 },
    { id: 'north-target', x: 3, z: -19 },
    { id: 'freight-target', x: -19, z: -36 }, { id: 'boarding-target', x: 17, z: -34 },
    { id: 'ghost-target', x: -43, z: -18 }, { id: 'west-target', x: -43, z: 9 },
    { id: 'workshop-target', x: -30, z: 38 }, { id: 'farm-target', x: 75, z: 76 },
    { id: 'crop-target', x: 78, z: 100 }, { id: 'barn-target', x: -60, z: 50 },
    { id: 'bend-target', x: 19, z: 37 },
    { id: 'dummy-range', kind: 'dummy', x: 17, z: 13 },
    { id: 'dummy-well', kind: 'dummy', x: 6, z: -12 },
    { id: 'dummy-freight', kind: 'dummy', x: -10, z: -28 },
    { id: 'dummy-north', kind: 'dummy', x: 8, z: -43 },
    { id: 'dummy-west', kind: 'dummy', x: -34, z: -6 },
    { id: 'dummy-workshop', kind: 'dummy', x: -22, z: 30 },
    { id: 'dummy-farm', kind: 'dummy', x: 72, z: 93 },
    { id: 'dummy-barn', kind: 'dummy', x: -54, z: 43 },
    { id: 'dummy-cistern', kind: 'dummy', x: -64, z: -69 },
    { id: 'dummy-arch', kind: 'dummy', x: 59, z: -70 },
    { id:'west-mercantile-target',x:-75,z:-40 }, { id:'west-depot-target',x:-98,z:-26 },
    { id:'dummy-west-well',kind:'dummy',x:-61,z:-16 },
    { id: 'dummy-south', kind: 'dummy', x: 21, z: 47 },
  ],
  zones: [
    { name: 'THE RANGE', x: 13, z: 9, w: 18, d: 17, sub: 'SET YOUR SHOTS · FIND YOUR ANGLE' },
    { name: 'MAIN STREET', x: 0, z: 0, w: 8, d: 50, sub: 'DEADWATER OUTPOST' },
  ],
  scenerySeed: 187,
};

// A second, smaller layout exercises the same loader. Open ?map=dry-creek.
export const dryCreek = {
  id: 'dry-creek', name: 'Dry Creek', width: 40, depth: 36,
  spawn: { x: 0, z: 5 }, palette: { ground: '#776044', road: '#94764f' }, look: { warmth: .15 },
  buildings: [building('depot', -8, -6, 8, 8, 2.6, 'DEPOT', '#c5a079', '#6b776b')],
  props: [{ type: 'barrel', x: 5, z: 0 }, { type: 'crate', x: 9, z: -5 },
    { type: 'cactus', x: -15, z: 5 }, { type: 'cactus', x: 15, z: -10, scale: .8 },
    { type: 'sign', x: 4.6, z: 5, label: 'DEPOT', direction: -1 }],
  fences: [{ x: 14, z: 2, length: 12, axis: 'z' }],
  targets: [{ id: 'a', x: 5, z: -6 }, { id: 'b', x: 9, z: 2 }, { id: 'c', x: 5, z: 8, moving: true, travel: 3 }],
  zones: [], scenerySeed: 364,
};

addRailDepot(deadwater);
export const maps = { deadwater, 'dry-creek': dryCreek };

// Settlement foundations stay road-facing, with a few slightly skewed old plots.
for(const b of deadwater.buildings) {
  const degrees={'boarding-house':-3,'abandoned-store':4,'old-house':-5, barn:3,'west-homestead':-4,'west-mercantile':2.5};
  b.angle=(b.angle||0)+(degrees[b.id]||0)*Math.PI/180;
}

export const PROP_TYPES = Object.freeze({
  ...ROADSIDE_TYPES, ...RAIL_TYPES,
  // Breakable scenery shares one low health so a single orb clears it on the way
  // through. They are dressing and light cover, never a damage sponge that eats
  // a volley meant for something behind them.
  barrel: { w: 1, d: 1, health: 5 }, crate: { w: 1.25, d: 1.25, health: 5 },
  cactus: { w: 1.5, d: .55, health: 5 }, sign: { w: 2.2, d: .4, health: 5 },
  deadwood: { w: 1.2, d: .7, health: 5 },
  // Ankle-height floor clutter. Breakable and shootable like the rest, but
  // `walkOver` keeps it out of the movement solver: a pot that snags the player
  // in a two-metre gap between a counter and a wall is a bug, not detail. A
  // dash still takes them, and a stray round still finds them.
  pot: { w: .52, d: .52, health: 5, walkOver: true },
  pottedPlant: { w: .58, d: .58, health: 5, walkOver: true },
  brokenChair: { w: .78, d: .78, health: 5, walkOver: true },
  hay: { w: 1.6, d: 1.25, health: 5 }, well: { w: 2, d: 2, health: null },
  tower: { w: 3.2, d: 3.2, health: null }, cart: { w: 2.5, d: 1.5, health: null },
  brokenWagon: { w: 3.5, d: 2.2, health: null }, windmill: { w: 2.6, d: 2.6, health: null }, trough: { w: 2.8, d: 1, health: null },
  cistern: { w: 4.2, d: 4.2, health: null }, ruinedArch: { w: 4, d: 1.3, health: null, collisionBoxes: [[-1.4,0,.88,1.15],[1.4,0,.88,1.15]] }, telegraph: { w: .4, d: .4, health: null },
  boulder: { w: 3, d: 2.5, health: null }, deadTree: { w: .9, d: .9, health: null }, stump: { w: .9, d: .9, health: null },
});

// Some crates were already coming apart before the player got here. Purely
// dressing: the footprint, the health and the cover are identical to a whole
// crate, so nothing about a fight changes — only how much of the crate is
// still standing. Derived from the crate's own position so the same ones are
// always the broken ones, run to run, and overridable per prop with `broken`.
export const BROKEN_CRATE_SHARE = .26;
export function crateIsBroken(p, i) {
  if (p.broken !== undefined) return !!p.broken;
  if (p.type !== 'crate') return false;
  const seed = Math.sin(p.x * 34.771 + p.z * 91.443 + i * 7.13) * 21817.531;
  return seed - Math.floor(seed) < BROKEN_CRATE_SHARE;
}

export function mapProps(map) {
  return map.props.map((p, i) => ({ ...PROP_TYPES[p.type], ...p, angle: propAngle(p,i), id: p.id || 'prop-' + i,
    broken: crateIsBroken(p, i),
    w: PROP_TYPES[p.type].w * (p.scale || 1), d: PROP_TYPES[p.type].d * (p.scale || 1) }));
}

// Anything that has to stay square to something man-made keeps a heading of
// zero: road-spanning pieces end up lying across the carriageway otherwise,
// and rolling stock ends up off its own rails.
const ROAD_ALIGNED = ['checkpoint','culvert','telegraph','sign','fallenPole','locomotive','boxcar','railBuffer'];
function propAngle(p,i) {
  if(p.angle!==undefined)return p.angle;
  if(ROAD_ALIGNED.includes(p.type))return 0;
  const seed=Math.sin(p.x*12.9898+p.z*78.233+i)*43758.5453,unit=seed-Math.floor(seed);
  if(['cactus','barrel','boulder','deadTree','stump','deadwood'].includes(p.type))return unit*Math.PI*2;
  if(['crate','hay','cart','freightScreen','timberStack','rockRidge'].includes(p.type))return (unit-.5)*1.15;
  if(['stoneBoundary','freightWreck','repairStation','oreSite'].includes(p.type))return (unit-.5)*.55;
  // Built structures were put up facing whatever mattered at the time, not due
  // north. A modest spread is enough: the `i%4===0` shortcut that used to sit
  // at the top of this function pinned a quarter of every prop on the map to
  // exactly zero, which is why so much of it looked laid out on a grid.
  if(['pot','pottedPlant','brokenChair'].includes(p.type))return unit*Math.PI*2;
  if(['coachStop','loadingPlatform','wateringStation','waterTank','graveyard','well','trough','cistern','brokenWagon','windmill','ruinedArch','tower','oreSite','repairStation','sandbags','plankBarricade'].includes(p.type))return (unit-.5)*.7;
  return 0;
}

export function buildingWalls(b) {
  const walls = [];
  const c = Math.cos(b.angle || 0), s = Math.sin(b.angle || 0);
  for (const side of ['front', 'back', 'left', 'right']) {
    const horizontal = side === 'front' || side === 'back', sign = side === 'back' || side === 'left' ? -1 : 1;
    const span = horizontal ? b.w : b.d, across = sign * (horizontal ? b.d : b.w) / 2;
    const openings = localOpenings(b).filter(o => o.side === side).sort((a, b) => a.offset - b.offset);
    const pieces = []; let cursor = -span / 2;
    for (const opening of openings) {
      const left = opening.offset - opening.width / 2, right = opening.offset + opening.width / 2;
      if (left > cursor) pieces.push({ from: cursor, to: left });
      if (opening.type === 'window') pieces.push({ from: left, to: right, playerOnly: true });
      cursor = right;
    }
    if (cursor < span / 2) pieces.push({ from: cursor, to: span / 2 });
    for (const piece of pieces) {
      const along = (piece.from + piece.to) / 2, length = piece.to - piece.from;
      const x = horizontal ? along : across, z = horizontal ? across : along;
      const w = horizontal ? length : .38, d = horizontal ? .38 : length;
      walls.push({ x: b.x + x * c + z * s, z: b.z - x * s + z * c,
        w: Math.abs(w * c) + Math.abs(d * s), d: Math.abs(w * s) + Math.abs(d * c),
        angle:b.angle||0,localW:w,localD:d,
        height: piece.playerOnly ? .5 : b.height, playerOnly: !!piece.playerOnly, buildingId: b.id });
    }
  }
  return walls;
}

export function localOpenings(b) {
  return [...(b.doors || ['front']).map(side => ({ side, offset: 0, width: b.doorWidth, type: 'door' })),
    ...(b.windows || []).filter(w => !w.boarded).map(w => ({ ...w, type: 'window' }))];
}

export function buildingPoint(b, x, z) {
  const c = Math.cos(b.angle || 0), s = Math.sin(b.angle || 0);
  return { x: b.x + x * c + z * s, z: b.z - x * s + z * c };
}

export function buildingContains(b, point) {
  const c = Math.cos(b.angle || 0), s = Math.sin(b.angle || 0), x = point.x - b.x, z = point.z - b.z;
  return Math.abs(x * c - z * s) < b.w / 2 && Math.abs(x * s + z * c) < b.d / 2;
}

export function buildingOpenings(b) {
  return localOpenings(b).map(o => {
    const horizontal = o.side === 'front' || o.side === 'back', sign = o.side === 'back' || o.side === 'left' ? -1 : 1;
    const across = sign * (horizontal ? b.d : b.w) / 2;
    const edge = along => buildingPoint(b, horizontal ? along : across, horizontal ? across : along);
    return { ...o, a: edge(o.offset - o.width / 2 + .1), b: edge(o.offset + o.width / 2 - .1) };
  });
}

export function mapColliders(map) {
  const colliders = map.buildings.flatMap(buildingWalls);
  for(const b of map.buildings)for(const p of interiorCover(b)) {
    const point=buildingPoint(b,p.x,p.z),c=Math.abs(Math.cos(b.angle||0)),s=Math.abs(Math.sin(b.angle||0));
    colliders.push({x:point.x,z:point.z,w:p.w*c+p.d*s,d:p.w*s+p.d*c,angle:b.angle||0,localW:p.w,localD:p.d,height:p.h,interiorCover:true,buildingId:b.id});
  }
  for (const p of mapProps(map)) {
    // A box list scales with the prop that owns it, exactly as w/d already do;
    // otherwise a scaled prop is drawn at one size and collides at another.
    const size = p.scale || 1;
    const pieces = p.collisionBoxes ? p.collisionBoxes.map(([bx,bz,bw,bd]) => [bx*size,bz*size,bw*size,bd*size]) : [[0,0,p.w,p.d]];
    const c=Math.cos(p.angle||0),s=Math.sin(p.angle||0);
    for (const [x,z,w,d] of pieces) colliders.push({ x: p.x+x*c+z*s, z:p.z-x*s+z*c, w:Math.abs(w*c)+Math.abs(d*s),d:Math.abs(w*s)+Math.abs(d*c),angle:p.angle||0,localW:w,localD:d,height: p.walkOver ? .5 : 1.2, blocksSight: !!p.blocksSight, walkOver: !!p.walkOver, propId: p.id, destructible: p.health !== null });
  }
  for (const f of map.fences) colliders.push({ x: f.x, z: f.z, w: f.axis === 'x' ? f.length : .24, d: f.axis === 'z' ? f.length : .24, height: 1.1 });
  return colliders;
}
