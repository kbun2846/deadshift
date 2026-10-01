// Lumen stage 5: where the dead and the stampede's leavings lie (design 5c, 6;
// the types and models are world/lumen-bodies.js). Spread into maps/lumen.js
// `props` after the set pieces and before the street detail. Placed by hand
// for the story, checked by tests/lumen-bodies.test.js against the placement
// rules (tests/lumen-place-lib.js) and the live map:
//   - the dead away from the fight lanes (the sniper lane, the crosswalks'
//     walking lines: only the Crossroads one beside the taxi, as the design
//     says) and 3 m from every spawn point;
//   - the pile inside effects/lumen-life-rules.js BODY_PILE (the rats and the
//     pigeons work round that box), Back Alley 1.8 m clear beside it;
//   - the stampede's belongings on the way to the metro (the Boulevard, the
//     Crossroads, the Cut, the metro plaza), off the crosswalks, the doors'
//     aprons and the sidewalks' building-side 1.4 m; the small litter along
//     the same way is world/lumen-detail.js's;
//   - the checkpoint's leavings round stage 2's half-set barriers at the
//     Avenue's north end (the booth holds the shield, the scanner, the poster).
// Ids `lx*`, so the rest of the map's ids never shift.
import '../world/lumen-bodies.js'; // (registers the models: the map needs them whichever module the renderer loads first)

const PI = Math.PI;
const piece = (id, type, x, z, angle = 0, extra) => Object.freeze({ id: `lx${id}`, type, x, z, angle, ...extra });

// The smouldering car of the pileup (maps/lumen-cover.js's cityPileup at (27.2, -4), angle 0;
// its car at local (1.85, .45) lies north-south, nose north: world/lumen-vehicles.js buildPileup).
export const PILEUP_DRIVER = Object.freeze({ x: 29.05, z: -3.55, angle: PI / 2 });
// The body pile: its box is BODY_PILE (x -14.4..-9.6, z -26..-23.9); the wall's face at z -25.31.
export const PILE_AT = Object.freeze({ x: -12, z: -24.65, angle: 0 });

export const LUMEN_BODY_PROPS = Object.freeze([
  // --- The dead (3 outside; the other three of the five, and the clinic's four, are indoors)
  piece(1, 'cityBodyDriver', PILEUP_DRIVER.x, PILEUP_DRIVER.z, PILEUP_DRIVER.angle),
  piece(2, 'cityBodyCoat', -8.85, -2.0, .15),                 // on the Crossroads' west crosswalk, beside the taxi
  piece(3, 'cityBodyPile', PILE_AT.x, PILE_AT.z, PILE_AT.angle),
  // --- Old blood: drag marks up the alley to the pile from both ends (the pools at its foot are the pile's own:
  // loose marks there would stand on the rats' spots round it); the pileup's pocket
  piece(6, 'cityDragMarks', -6.9, -23.75, PI + .05),           // (drawn from the alley's east mouth to the pile)
  piece(7, 'cityDragMarks', -16.4, -24.05, -.04),              // (and from the west)
  piece(8, 'cityBloodDried', 27.25, -3.88, .3, { v: 1 }),      // under the driver's window
  // --- The stampede, toward the metro (west to east along the Boulevard, over the Crossroads, down the Cut)
  piece(10, 'citySuitcase', -35.22, 8.59, .3),
  piece(11, 'cityBackpack', -27.5, 5.2, 1.1),
  piece(12, 'cityJacketDropped', -19.53, 7.47, .5),
  piece(13, 'cityShoeLost', -16.2, 6.4, .9),
  piece(14, 'cityDuffel', -6, 5.5, 2.4),
  piece(15, 'cityShoeLost', .5, 9, .2, { v: 1 }),
  piece(16, 'cityStroller', 16.25, 11.93, .7),
  piece(17, 'cityBackpack', 22.26, 13.94, -.4),
  piece(18, 'citySuitcase', 28.5, 22, .8),
  piece(19, 'cityShoeLost', 33, 27.5, 1.4),
  piece(20, 'cityShelterPanel', 33.93, 28.02, .9),            // the Cut shelter's end glass, trampled (the shelter at (31.53, 30.39))
  piece(21, 'cityAdPillarDown', 34.2, 35.1, -PI / 4),         // toppled along the Cut's sidewalk by the crowd (clear of the Cut's vent)
  piece(22, 'cityDuffel', 36.5, 33.5, .6),
  piece(23, 'cityJacketDropped', 27, 34, -.3),
  piece(24, 'cityStroller', 25.2, 40.3, 2.2),
  piece(25, 'cityShoeLost', 23.75, 36.5, 0),
  piece(26, 'cityBelongingsHeap', 30.72, 40.92, .05),         // dropped in a heap before the metro's doors
  // --- Uptown: the luxury tower's revolving door, jammed, beside the lobby's east doorway (on the facade, x 38)
  piece(30, 'cityRevolvingDoor', 38.69, -19.3, PI / 2),
  // --- The abandoned checkpoint (the Avenue's north end)
  piece(40, 'cityCheckpointTape', 4.3, -46, .2),
  piece(41, 'cityCheckpointTape', 2, -49.3, -1.2),
  piece(42, 'cityCasings', 6.2, -44.6, 0),
  piece(43, 'cityCasings', 6.08, -51.08, .5),
  piece(44, 'cityTrefoilSign', 2.7, -43.33, .4),
  piece(45, 'cityTrefoilSign', 6, -52.4, -.6),
]);
