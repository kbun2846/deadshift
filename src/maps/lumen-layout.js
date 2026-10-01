// Lumen's layout (stage 0 plan; stage 1 builds the ground from it, stage 2
// settles it). Plain data, metres: x east, z south. The map's core is
// x -68..68, z -60..60; the edge ring of sealed towers stands inside that,
// and the playable area is the ring's inner face (steps in and out).
// See claude/lumen-design.md (sections 1-3b) and AGENTS.md > Lumen.

// Roads: roadway rectangles (or the Cut's quad), each with its sidewalk width.
// `axis` x runs east-west. The Crossroads is its own paved plaza.
export const ROADS = Object.freeze([
  { id: 'boulevard', axis: 'x', centre: 0, width: 14, sidewalk: 3.5, from: -72, to: 72, median: 2 },
  { id: 'avenue', axis: 'z', centre: 6, width: 10, sidewalk: 3, from: -64, to: 64 },
  { id: 'west-street', axis: 'z', centre: -30, width: 7, sidewalk: 2.5, from: -64, to: 33.5 }, // ends at South Street (a T)
  { id: 'north-lane', axis: 'x', centre: -36, width: 7, sidewalk: 2.5, from: -26.5, to: 1 },
  { id: 'south-street', axis: 'x', centre: 30, width: 7, sidewalk: 2.5, from: -72, to: 1 },
  // The Cut: from the Crossroads' south-east corner to the chamfered corner.
  { id: 'the-cut', axis: 'diagonal', a: [24, 16], b: [60, 52], width: 9, sidewalk: 2.5 },
]);

// The Crossroads: the five-way plaza where the Boulevard, the Avenue's two
// arms and the Cut meet (about 36 x 32 m; its corners notch the blocks).
export const CROSSROADS = Object.freeze({ x0: -12, x1: 24, z0: -16, z1: 16, centre: [6, 0] });

// Back Alley: the one through-alley, in the North frontage block.
export const BACK_ALLEY = Object.freeze({ x0: -24, x1: -2, z0: -25.5, z1: -22 });

// Velvet Row's red-light lane: in from South Street, turning east to the
// charging lot (never a dead end).
export const VELVET_LANE = Object.freeze([
  { x0: -44, x1: -40, z0: 36, z1: 50 }, { x0: -44, x1: -24, z0: 46, z1: 50 },
]);

// The playable outline: the edge ring's inner face. It steps in and out, the
// Stacks push a notch out to the north-west, Uptown's plaza bulges north-east
// and the south-east corner is chamfered across the Cut.
export const OUTLINE = Object.freeze([
  [-64, -56], [-24, -56], [-24, -53], [-2, -53], [-2, -56], [14, -56], [14, -53], [40, -53], [40, -57], [62, -57],
  [62, -30], [60, -30], [60, -12], [62, -12], [62, 12], [60, 12], [60, 30],
  [34, 56], [-2, 56], [-2, 53], [-24, 53], [-24, 56], [-62, 56],
  [-62, 22], [-60, 22], [-60, 12], [-62, 12], [-62, -12], [-60, -12], [-60, -40], [-64, -40],
]);

// Where each road leaves the map: a line of barricades across it.
export const BARRICADES = Object.freeze([
  { road: 'boulevard', x: -61.1, z: 0, axis: 'z', length: 24 }, // (the whole opening in the ring, kerb to kerb and the steps beside)
  { road: 'boulevard', x: 61.1, z: 0, axis: 'z', length: 24 },
  { road: 'avenue', x: 6, z: -55.1, axis: 'x', length: 16 },
  { road: 'avenue', x: 6, z: 55.1, axis: 'x', length: 16 },
  { road: 'west-street', x: -30, z: -55.1, axis: 'x', length: 12 },
  { road: 'south-street', x: -61.1, z: 30, axis: 'z', length: 12 },
  // The Cut leaves through the chamfer (60, 30)-(34, 56), square to it:
  // across it, 0.9 m in from where its centreline (z = x - 8) meets it.
  { road: 'the-cut', x: 48.364, z: 40.364, axis: 'diagonal', length: 17 },
]);

// Districts (light identities; 60% lead, 40% shared city light).
export const DISTRICTS = Object.freeze([
  { id: 'stacks', box: [-68, -36, -60, -10.5], lead: ['#6fd46a', '#ffd9a0'] },
  { id: 'night-market', box: [-24, -2, -60, -42], lead: ['#fff1d6', '#e8322a'] },
  { id: 'north-frontage', box: [-24, -2, -30, -10.5], lead: ['#ff2d8a', '#fff1d6'] },
  { id: 'uptown', box: [14, 68, -60, -10.5], lead: ['#e6f0ff', '#3558f0'] },
  { id: 'boulevard', box: [-68, 68, -10.5, 10.5], lead: ['#ff2d8a', '#fff1d6'] },
  { id: 'garage', box: [-68, -36, 10.5, 24], lead: ['#ffcf8a', '#fcee0a'] },
  { id: 'south-frontage', box: [-24, -2, 10.5, 24], lead: ['#e6f0ff', '#ff3040'] },
  { id: 'velvet-row', box: [-68, -24, 36, 60], lead: ['#ff2a3c', '#ff5fa8'] },
  { id: 'charging', box: [-24, -2, 36, 60], lead: ['#ffcf8a', '#2bff8a'] },
  { id: 'flatiron', box: [28, 68, 10.5, 50], lead: ['#fcee0a', '#3d6bff'] },
  { id: 'metro', box: [14, 48, 16, 60], lead: ['#fcee0a', '#d8f0e0'] },
]);

// The three bases (about 120 degrees apart round the Crossroads).
export const BASES = Object.freeze([
  { id: 'A', name: 'Uptown plaza', x: 50, z: -24 },
  { id: 'B', name: 'Stacks courtyard', x: -38, z: -27 },
  { id: 'C', name: 'Charging lot', x: -11.5, z: 48 },
]);

// The Crossroads' corners: the four blocks round it are cut on the diagonal
// (a chamfered five-way plaza), each corner building a wedge (quad) room.
export const PLAZA_CHAMFERS = Object.freeze({
  nw: [[-12.5, -10.5], [-2, -16.2]], sw: [[-12.5, 10.5], [-2, 16.2]], ne: [[14, -16.2], [24.5, -10.5]],
});

// Every playable building's footprint (stage 2 settles them): the outer
// shape as joined rects [x0, x1, z0, z1] and/or convex quads, its height
// (tall: a 60 m shell; low: its eave), the walls its outer doors may use
// (`doorsOn`: which street, alley, lane, courtyard or plaza each faces) and
// the rooms the design gives it (claude/lumen-design.md section 5). The
// room layouts themselves are in maps/lumen-buildings-*.js.
export const FOOTPRINTS = Object.freeze([
  // The Stacks (NW): the U round the courtyard (x -50..-36, z -34..-22, open east onto West Street)
  { id: 'stacks-main', district: 'stacks', tall: true, parts: [[-60, -50, -44, -16], [-50, -40, -44, -34], [-50, -40, -22, -16], [-64, -60, -44, -40]],
    doorsOn: ['the courtyard only (x -50..-40, z -34..-22): three doors on three different faces (the north arm\'s south face, the west wing\'s east face, the south arm\'s north face)', 'the notch part x -64..-60 is the blocked stairwell (sealed)'],
    rooms: 'a long corridor (>= 1.4 m) along the U with 6 tiny units off it, a shared washroom, a mail nook, a blocked stairwell (the notch: a solid, not a room)' },
  { id: 'tenement-a', district: 'stacks', tall: true, parts: [[-64, -36, -56, -44], [-40, -36, -44, -34]],
    doorsOn: ['West Street (x -36: the lobby, and the leg\'s east face)', 'the courtyard (z -34, the leg\'s south face)'],
    rooms: 'lobby with a wall of mail slots, the super\'s caged office, a laundry room, a back corridor (the leg) to the courtyard' },
  { id: 'tenement-b', district: 'stacks', tall: true, parts: [[-60, -36, -16, -10.5], [-40, -36, -22, -16]],
    doorsOn: ['the Boulevard (z -10.5)', 'West Street (x -36)', 'the courtyard (z -22, the leg\'s north face)'],
    rooms: 'dumpling shop front and counter, a kitchen, a small shrine room behind a bead curtain' },
  // Night Market (N)
  { id: 'market-hall', district: 'night-market', low: 6, parts: [[-24, -2, -53, -43]],
    doorsOn: ['North Lane (z -43; three wide openings, the stalls spill out)', 'West Street (x -24)'],
    rooms: 'the main hall of stall rows, a walk-in cold room, a back office' },
  // North row (on Back Alley's north side; through from North Lane to the alley)
  { id: 'stall-shed', district: 'night-market', low: 4, parts: [[-24, -13, -30, -25.5]],
    doorsOn: ['North Lane (z -30)', 'Back Alley (z -25.5)', 'West Street (x -24)'],
    rooms: 'one room (storage bays) with a partitioned sleeping corner' },
  { id: 'lock-up', district: 'north-frontage', low: 4, parts: [[-13, -2, -30, -25.5]],
    doorsOn: ['North Lane (z -30)', 'Back Alley (z -25.5)'],
    rooms: 'rented lock-up units off a short corridor (someone\'s stash, a workbench)' },
  // North frontage (on the Boulevard; back doors on Back Alley; the corner two are wedges on the Crossroads' chamfer)
  { id: 'convenience', district: 'north-frontage', low: 5, parts: [[-24, -18, -22, -10.5]],
    doorsOn: ['the Boulevard (z -10.5)', 'Back Alley (z -22)', 'West Street (x -24)'],
    rooms: 'shop floor with aisles, a stockroom, a staff toilet' },
  { id: 'noodle-bar', district: 'north-frontage', tall: true, parts: [[-18, -12.5, -22, -10.5]],
    doorsOn: ['the Boulevard (z -10.5)', 'Back Alley (z -22)'],
    rooms: 'counter and booths, a kitchen, the back door to the alley' },
  { id: 'pawn', district: 'north-frontage', low: 5, quads: [[[-12.5, -22], [-8, -22], [-8, -12.94], [-12.5, -10.5]]],
    doorsOn: ['the Crossroads (the chamfer edge (-8,-12.94)-(-12.5,-10.5))', 'Back Alley (z -22)'],
    rooms: 'a caged front counter, a workshop, a small safe room' },
  { id: 'arcade', district: 'north-frontage', tall: true, quads: [[[-8, -22], [-2, -22], [-2, -16.2], [-8, -12.94]]],
    doorsOn: ['the Crossroads (the chamfer edge)', 'Back Alley (z -22)', 'the Avenue (x -2)'],
    rooms: 'the cabinet hall, a corridor of 3 VR booths, a prize counter' },
  // South frontage (the clinic on South Street)
  { id: 'laundromat', district: 'south-frontage', low: 5, parts: [[-24, -16, 10.5, 15]],
    doorsOn: ['the Boulevard (z 10.5)', 'West Street (x -24)'], rooms: 'the machine hall, the owner\'s back room' },
  { id: 'clinic', district: 'south-frontage', low: 5, parts: [[-24, -13, 15, 24], [-16, -13, 10.5, 15]],
    doorsOn: ['South Street (z 24: the front, the waiting room)', 'West Street (x -24: a side door, and the isolation ward\'s back door, jammed half open)'],
    rooms: 'waiting room, surgery, recovery room, the isolation ward behind a plastic airlock, a supply closet, a staff washroom; a hallway >= 1.4 m (design 5b)' },
  { id: 'pharmacy', district: 'south-frontage', tall: true, parts: [[-13, -2, 16.2, 24]], quads: [[[-13, 10.5], [-12.5, 10.5], [-2, 16.2], [-13, 16.2]]],
    doorsOn: ['the Crossroads (the chamfer edge (-12.5,10.5)-(-2,16.2))', 'the Avenue (x -2)', 'South Street (z 24)'],
    rooms: 'the shop floor (the wedge), a caged dispensary, a stockroom' },
  // Garage and Charging (SW)
  { id: 'ev-garage', district: 'garage', low: 7, parts: [[-60, -51, 10.5, 24]],
    doorsOn: ['the Boulevard (z 10.5: a wide bay door, 3.5 m)', 'South Street (z 24)'], rooms: 'the service bay, a parts room, an office' },
  { id: 'fab-workshop', district: 'garage', low: 6, parts: [[-51, -44, 10.5, 24]],
    doorsOn: ['the Boulevard (z 10.5)', 'South Street (z 24)'], rooms: 'the workshop floor, a paint booth, a tool store' },
  { id: 'parking', district: 'garage', low: 4, parts: [[-44, -36, 10.5, 24]],
    doorsOn: ['the Boulevard (z 10.5)', 'West Street (x -36: wide open bays, open sides)', 'South Street (z 24)'],
    rooms: 'an open level of pillars (one big room, wide openings), a ticket booth, a blocked stairwell' },
  { id: 'charging-office', district: 'charging', low: 4, parts: [[-10, -2, 45, 53]],
    doorsOn: ['the charging lot (x -10)', 'the Avenue (x -2)'], rooms: 'a small shop, a restroom' },
  // Velvet Row (south of South Street; its lane: x -44..-40 from z 36 to 50, then z 46..50 east to the charging lot)
  { id: 'club', district: 'velvet-row', low: 7, parts: [[-62, -44, 36, 56]],
    doorsOn: ['South Street (z 36)', 'the lane (x -44)'],
    rooms: 'dance floor, a bar, a VIP booth room, a DJ booth, a staff corridor, restrooms' },
  { id: 'bar', district: 'velvet-row', low: 5, parts: [[-40, -32, 36, 46]],
    doorsOn: ['South Street (z 36)', 'the lane (x -40 or z 46)'], rooms: 'the bar room, a back room with a pool table' },
  { id: 'capsule-hotel', district: 'velvet-row', tall: true, parts: [[-32, -24, 36, 46]],
    doorsOn: ['South Street (z 36)', 'the charging lot (x -24)', 'the lane (z 46)'],
    rooms: 'reception, two corridors of stacked pods, a shared washroom' },
  { id: 'karaoke', district: 'velvet-row', low: 5, parts: [[-44, -24, 50, 56]],
    doorsOn: ['the lane (z 50)', 'the charging lot (x -24)'], rooms: 'a front desk, a corridor of 4 private rooms' },
  // Uptown (NE)
  { id: 'hotel', district: 'uptown', tall: true, parts: [[14, 24.5, -53, -26]],
    doorsOn: ['the Avenue (x 14: the lobby and the bar)', 'the service yard north of the luxury tower (the kitchen\'s east face, z -53..-44)'], rooms: 'lobby, a bar, a luggage room, a corridor to the kitchen' },
  { id: 'showroom', district: 'uptown', low: 6, parts: [[14, 24.5, -26, -20]], quads: [[[14, -20], [24.5, -20], [24.5, -10.5], [14, -16.2]]],
    doorsOn: ['the Crossroads (the chamfer edge (24.5,-10.5)-(14,-16.2))', 'the Avenue (x 14)'],
    rooms: 'the showroom (the wedge), a fitting room, a private consultation room' },
  { id: 'luxury-tower', district: 'uptown', tall: true, parts: [[24.5, 38, -34, -10.5], [24.5, 32, -44, -34]],
    doorsOn: ['the Boulevard (z -10.5)', 'Uptown plaza (x 38)', 'the plaza north (z -44)'],
    rooms: 'lobby, a lounge, the lift bank, the concierge\'s back office, a mail room (L-shaped)' },
  { id: 'corporate-tower', district: 'uptown', tall: true, parts: [[38, 56, -53, -40]],
    doorsOn: ['Uptown plaza (z -40)', 'the east side (x 56)'], rooms: 'security turnstiles, reception, a glass meeting room, a server closet' },
  { id: 'checkpoint-booth', district: 'uptown', low: 3, parts: [[7.4, 10, -49, -46.4]],
    doorsOn: ['north (z -49)', 'south (z -46.4)' /* on the Avenue\'s roadway, the sidewalk kept clear */], rooms: 'one room: a monitor wall, an abandoned chair, a radio' },
  // Flatiron (the wedge between the Boulevard and the Cut) and its neighbour
  { id: 'flatiron', district: 'flatiron', tall: true, quads: [[[34.94, 10.5], [44, 10.5], [44, 26.1], [33.02, 15.12]]],
    doorsOn: ['the prow (edge (33.02,15.12)-(34.94,10.5), square to the wedge, facing the Crossroads)', 'the Boulevard (z 10.5)', 'the Cut (the diagonal edge)'],
    rooms: 'a maze of small booths in the wedge, repair counters (electronics mall)' },
  { id: 'pachinko', district: 'flatiron', tall: true, parts: [[44, 60, 10.5, 26.1]], quads: [[[44, 26.1], [60, 26.1], [60, 30], [53.95, 36.05]]],
    doorsOn: ['the Boulevard (z 10.5)', 'the Cut (the diagonal edge (53.95,36.05)-(44,26.1))'],
    rooms: 'machine rows, a cash counter, a high-roller back room' },
  // Metro Plaza (between the Avenue and the Cut)
  { id: 'body-mod', district: 'metro', tall: true, parts: [[14, 22, 30, 44]],
    doorsOn: ['the Avenue (x 14)', 'the metro plaza (x 22)'], rooms: 'front studio, two work rooms, a back room' },
  { id: 'metro-entrance', district: 'metro', low: 4, parts: [[24, 33, 44, 52]],
    doorsOn: ['the metro plaza (z 44 and x 24)', 'the east (x 33)'],
    rooms: 'ticket hall, the gates, a staff booth; the stairs down behind a half-closed shutter (blocked: a solid)' },
  // The bus: stopped at an angle across the Boulevard's two eastbound lanes (a room of its own, two doors)
  { id: 'bus', district: 'boulevard', low: 3.2, quads: [[[46.2, 1.15], [58.0, 3.66], [57.46, 6.2], [45.66, 3.69]]],
    doorsOn: ['its kerb side (the south long edge, toward the stop): two doors'], rooms: 'one room: seats, handrails, a bag on a seat' },
]);


// (The plan's footprints as the sketch and the puddle rules read them.)
export const BUILDING_PLAN = Object.freeze(FOOTPRINTS.map(f => ({ id: f.id, tall: !!f.tall, low: f.low, parts: f.parts || [], quads: f.quads || [] })));
