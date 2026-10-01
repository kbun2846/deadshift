// Lumen's buildings, south part (stage 2): each footprint of maps/lumen-layout.js
// FOOTPRINTS as rooms, doors and inner doorways (world/city-rooms.js), checked
// by tests/lumen-buildings.test.js. Stage 4 furnishes the rooms.
export const LUMEN_BUILDINGS_SOUTH = [
  // South frontage. Machine hall on the Boulevard, the owner's room behind it.
  // (The clinic took the old back room's strip, x -16..-13: stage 2 review.)
  { id: 'laundromat', district: 'south-frontage', low: true, height: 5, seed: 8101,
    rooms: [{ id: 'machine-hall', rect: [-24, -19, 10.5, 15] }, { id: 'back-room', rect: [-19, -16, 10.5, 15] }],
    doors: [{ at: [-20.4, 10.5] }, { at: [-24, 12.75] }],
    links: [{ at: [-19, 12.75] }] },

  // The clinic (design 5b). A 1.5 m hall runs front to back through the middle:
  // the waiting room (South Street front door, West Street side door) and the
  // isolation ward (behind the plastic airlock: the hazard-taped doorway off
  // the hall; its back door on West Street, 1.4 m, jammed half open) on its
  // west; the surgery and the recovery room (three beds) on its east; the
  // supply closet behind recovery and the staff washroom behind that (the
  // strip that reaches the Boulevard, x -16..-13).
  { id: 'clinic', district: 'south-frontage', low: true, height: 5, seed: 8102,
    rooms: [
      { id: 'waiting', rect: [-24, -19.5, 19.5, 24] },
      { id: 'ward', rect: [-24, -19.5, 15, 19.5] },
      { id: 'hall', rect: [-19.5, -18, 15, 24] },
      { id: 'surgery', rect: [-18, -13, 19.5, 24] },
      { id: 'recovery', rect: [-18, -13, 15, 19.5] },
      { id: 'supply', rect: [-16, -13, 12.75, 15] },
      { id: 'washroom', rect: [-16, -13, 10.5, 12.75] },
    ],
    doors: [{ at: [-21, 24] }, { at: [-24, 21.75] }, { at: [-24, 16.5], width: 1.4 }],
    links: [
      { at: [-19.5, 21.75] },                 // waiting <-> hall
      { at: [-19.5, 17.25] },                 // hall <-> ward (the plastic airlock)
      { at: [-18, 21.75] },                   // hall <-> surgery
      { at: [-18, 17.25] },                   // hall <-> recovery
      { at: [-15.5, 19.5] },                  // surgery <-> recovery
      { at: [-14.5, 15], width: 1.2 },        // recovery <-> supply closet
      { at: [-14.5, 12.75], width: 1.2 },     // supply closet <-> staff washroom
    ] },

  // The shop floor is the wedge on the Crossroads; the counter floor behind it takes the
  // Avenue door; the caged dispensary and the stockroom (delivery door on South Street) at the back.
  { id: 'pharmacy', district: 'south-frontage', tall: true, height: 52, seed: 8103,
    rooms: [
      { id: 'shop', quad: [[-13, 10.5], [-12.5, 10.5], [-2, 16.2], [-13, 16.2]] },
      { id: 'counter', rect: [-13, -2, 16.2, 19.7] },
      { id: 'dispensary', rect: [-13, -8, 19.7, 24] },
      { id: 'stockroom', rect: [-8, -2, 19.7, 24] },
    ],
    doors: [{ at: [-7.25, 13.35], width: 2.4 }, { at: [-2, 18] }, { at: [-5, 24] }],
    links: [{ at: [-7.5, 16.2], width: 3 }, { at: [-10.5, 19.7] }, { at: [-5, 19.7] }, { at: [-8, 22] }] },

  // Garage and Charging. The bay door is 3.5 m on the Boulevard; parts room and office behind the bay.
  { id: 'ev-garage', district: 'garage', low: true, height: 7, seed: 8104,
    rooms: [{ id: 'service-bay', rect: [-60, -51, 10.5, 19] }, { id: 'parts', rect: [-60, -55, 19, 24] }, { id: 'office', rect: [-55, -51, 19, 24] }],
    doors: [{ at: [-55.5, 10.5], width: 3.5 }, { at: [-57.5, 24] }, { at: [-53, 24] }],
    links: [{ at: [-57.5, 19] }, { at: [-53, 19] }] },

  { id: 'fab-workshop', district: 'garage', low: true, height: 6, seed: 8105,
    rooms: [{ id: 'workshop', rect: [-51, -44, 10.5, 18.5] }, { id: 'paint-booth', rect: [-51, -47.5, 18.5, 24] }, { id: 'tool-store', rect: [-47.5, -44, 18.5, 24] }],
    doors: [{ at: [-47.5, 10.5], width: 2.4 }, { at: [-45.75, 24] }],
    links: [{ at: [-49.25, 18.5] }, { at: [-45.75, 18.5] }] },

  // An open level: the level room (5 x 13.5) has wide openings on West Street, the Boulevard and
  // South Street; the west strip holds the ticket booth, a side bay and the sealed stairwell.
  { id: 'parking', district: 'garage', low: true, height: 4, seed: 8106,
    rooms: [
      { id: 'level', rect: [-41, -36, 10.5, 24] },
      { id: 'ticket-booth', rect: [-44, -41, 10.5, 14] },
      { id: 'west-bays', rect: [-44, -41, 14, 20.5] },
    ],
    blocked: [[-44, -41, 20.5, 24]],
    doors: [{ at: [-36, 16.5], width: 5 }, { at: [-38.5, 10.5], width: 4 }, { at: [-38.5, 24], width: 4 }],
    links: [{ at: [-41, 17.25], width: 4 }, { at: [-41, 12.25] }] },

  { id: 'charging-office', district: 'charging', low: true, height: 4, seed: 8107,
    rooms: [{ id: 'shop', rect: [-10, -2, 45, 50] }, { id: 'restroom', rect: [-10, -6.5, 50, 53] }, { id: 'stock', rect: [-6.5, -2, 50, 53] }],
    doors: [{ at: [-10, 47.5] }, { at: [-2, 47.5] }],
    links: [{ at: [-8.25, 50] }, { at: [-4.25, 50] }] },

  // Velvet Row. Foyer on South Street (and the lane), dance floor behind it with the bar and the
  // VIP room on its east side, the DJ booth on its south wall, the staff corridor off the floor's
  // south side to two restrooms and a staff room.
  { id: 'club', district: 'velvet-row', low: true, height: 7, seed: 8108,
    rooms: [
      { id: 'foyer', rect: [-62, -44, 36, 40], followCamera: true },
      { id: 'dance-floor', rect: [-62, -49, 40, 51] },
      { id: 'bar', rect: [-49, -44, 40, 45.5] },
      { id: 'vip', rect: [-49, -44, 45.5, 51] },
      { id: 'dj-booth', rect: [-62, -56, 51, 56] },
      { id: 'staff-corridor', rect: [-56, -49, 51, 53] },
      { id: 'restroom-a', rect: [-56, -52.5, 53, 56] },
      { id: 'restroom-b', rect: [-52.5, -49, 53, 56] },
      { id: 'staff-room', rect: [-49, -44, 51, 56] },
    ],
    doors: [{ at: [-53, 36], width: 2.4 }, { at: [-44, 38] }, { at: [-44, 42.75] }],
    links: [
      { at: [-55, 40], width: 3 }, { at: [-46.5, 40] },                 // foyer -> dance floor, bar
      { at: [-49, 42.75], width: 2.5 }, { at: [-49, 48.25], width: 2.5 }, // dance floor <-> bar, VIP
      { at: [-46.5, 45.5] },                                           // bar <-> VIP
      { at: [-59, 51] },                                               // dance floor <-> DJ booth
      { at: [-52.5, 51] },                                             // dance floor <-> staff corridor
      { at: [-54.25, 53] }, { at: [-50.75, 53] },                      // corridor <-> restrooms
      { at: [-49, 52] },                                               // corridor <-> staff room
    ] },

  { id: 'bar', district: 'velvet-row', low: true, height: 5, seed: 8109,
    rooms: [{ id: 'bar-room', rect: [-40, -32, 36, 41] }, { id: 'pool-room', rect: [-40, -32, 41, 46] }],
    doors: [{ at: [-36, 36] }, { at: [-40, 43.5] }],
    links: [{ at: [-36, 41], width: 2 }] },

  { id: 'capsule-hotel', district: 'velvet-row', tall: true, height: 58, seed: 8110,
    rooms: [
      { id: 'reception', rect: [-32, -24, 36, 40] },
      { id: 'pods-a', rect: [-32, -28, 40, 46] },
      { id: 'pods-b', rect: [-28, -24, 40, 43.5] },
      { id: 'washroom', rect: [-28, -24, 43.5, 46] },
    ],
    doors: [{ at: [-28, 36] }, { at: [-24, 38] }, { at: [-30, 46] }],
    links: [{ at: [-30, 40] }, { at: [-26, 40] }, { at: [-28, 41.75] }, { at: [-26, 43.5] }] },

  { id: 'karaoke', district: 'velvet-row', low: true, height: 5, seed: 8111,
    rooms: [
      { id: 'front-desk', rect: [-32, -24, 50, 56] },
      { id: 'corridor', rect: [-44, -32, 50, 52] },
      { id: 'room-1', rect: [-44, -41, 52, 56] },
      { id: 'room-2', rect: [-41, -38, 52, 56] },
      { id: 'room-3', rect: [-38, -35, 52, 56] },
      { id: 'room-4', rect: [-35, -32, 52, 56] },
    ],
    doors: [{ at: [-28, 50] }, { at: [-24, 51.5] }],
    links: [{ at: [-32, 51], width: 1.2 }, { at: [-42.5, 52] }, { at: [-39.5, 52] }, { at: [-36.5, 52] }, { at: [-33.5, 52] }] },
];
