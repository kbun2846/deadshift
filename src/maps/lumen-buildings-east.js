// Lumen's buildings, east part (stage 2): each footprint of maps/lumen-layout.js
// FOOTPRINTS as rooms, doors and inner doorways (world/city-rooms.js), checked
// by tests/lumen-buildings.test.js. Stage 4 furnishes the rooms.
export const LUMEN_BUILDINGS_EAST = [
  // Hotel: lobby on the Avenue, bar / corridor / luggage room in a row behind it,
  // kitchen across the back with a service door to the plaza side (north of the tower).
  { id: 'hotel', district: 'uptown', tall: true, height: 52, seed: 9101,
    rooms: [
      { id: 'lobby', rect: [14, 24.5, -36, -26] },
      { id: 'bar', rect: [14, 19.5, -46, -36] },
      { id: 'corridor', rect: [19.5, 21.5, -46, -36] },
      { id: 'luggage', rect: [21.5, 24.5, -46, -36] },
      { id: 'kitchen', rect: [14, 24.5, -53, -46] },
    ],
    doors: [{ at: [14, -31], width: 2 }, { at: [14, -41] }, { at: [24.5, -49.5], width: 2 }],
    links: [
      { at: [16.75, -36] },                  // lobby - bar
      { at: [20.5, -36] },                   // lobby - corridor
      { at: [23, -36] },                     // lobby - luggage
      { at: [20.5, -46] },                   // corridor - kitchen
      { at: [17, -46] },                     // bar - kitchen (service pass)
    ] },

  // Cyberware showroom: the wedge is the showroom floor; fitting and consultation rooms behind it.
  { id: 'showroom', district: 'uptown', low: true, height: 6, seed: 9102,
    rooms: [
      { id: 'showroom', quad: [[14, -20], [24.5, -20], [24.5, -10.5], [14, -16.2]] },
      { id: 'fitting', rect: [14, 19, -26, -20] },
      { id: 'consultation', rect: [19, 24.5, -26, -20] },
    ],
    doors: [{ at: [19.25, -13.35], width: 2.4 }, { at: [14, -18.1] }],
    links: [{ at: [16.5, -20] }, { at: [22, -20] }] },

  // Luxury tower (L): lobby on the Boulevard, lounge / lift bank / mail room behind, concierge office in the L's arm.
  { id: 'luxury-tower', district: 'uptown', tall: true, height: 58, seed: 9103,
    rooms: [
      { id: 'lobby', rect: [24.5, 38, -21, -10.5] },
      { id: 'lounge', rect: [24.5, 32, -34, -21] },
      { id: 'lift-bank', rect: [32, 38, -27, -21] },
      { id: 'mail-room', rect: [32, 38, -34, -27] },
      { id: 'concierge', rect: [24.5, 32, -44, -34] },
    ],
    doors: [{ at: [31, -10.5], width: 2.4 }, { at: [38, -15.5], width: 2 }, { at: [38, -30.5] }, { at: [28, -44] }],
    links: [
      { at: [28, -21], width: 2 },           // lobby - lounge
      { at: [35, -21], width: 2 },           // lobby - lift bank
      { at: [35, -27] },                     // lift bank - mail room
      { at: [28, -34] },                     // lounge - concierge office
    ] },

  // Corporate tower: security turnstiles on the plaza, reception beside them, glass meeting room and server closet behind.
  { id: 'corporate-tower', district: 'uptown', tall: true, height: 62, seed: 9104,
    rooms: [
      { id: 'security', rect: [38, 45, -47, -40] },
      { id: 'reception', rect: [45, 56, -47, -40] },
      { id: 'server-closet', rect: [38, 45, -53, -47] },
      { id: 'meeting', rect: [45, 56, -53, -47] },
    ],
    doors: [{ at: [41.5, -40], width: 2 }, { at: [50.5, -40] }, { at: [56, -43.5] }],
    links: [
      { at: [45, -43.5], width: 1.6 },       // turnstiles: security - reception
      { at: [41.5, -47] },                   // security - server closet
      { at: [50.5, -47] },                   // reception - meeting room
    ] },

  // Checkpoint booth: one room, a door north and south.
  { id: 'checkpoint-booth', district: 'uptown', low: true, height: 3, seed: 9105,
    // (On the Avenue's roadway by its east lane, so the sidewalk stays clear.)
    rooms: [{ id: 'booth', rect: [7.4, 10, -49, -46.4] }],
    doors: [{ at: [8.7, -49], width: 1.4 }, { at: [8.7, -46.4], width: 1.4 }] },

  // Flatiron electronics mall. The wedge's prow is cut square to the wedge's
  // bisector, 5 m wide, facing the Crossroads (the giant screen goes on it):
  // a prow vestibule, two booths on the Boulevard, a back booth and the
  // repair counters along the Cut.
  { id: 'flatiron', district: 'flatiron', tall: true, height: 48, seed: 9106,
    rooms: [
      { id: 'prow', quad: [[34.94, 10.5], [38.5, 10.5], [38.5, 20.6], [33.02, 15.12]] },
      { id: 'booth-1', rect: [38.5, 41.25, 10.5, 15.5] },
      { id: 'booth-2', rect: [41.25, 44, 10.5, 15.5] },
      { id: 'booth-3', quad: [[38.5, 15.5], [41.25, 15.5], [41.25, 23.35], [38.5, 20.6]] },
      { id: 'counters', quad: [[41.25, 15.5], [44, 15.5], [44, 26.1], [41.25, 23.35]] },
    ],
    doors: [
      { at: [33.98, 12.81], width: 2 },      // the prow, facing the Crossroads
      { at: [42.625, 10.5] },                // the Boulevard, into booth 2
      { at: [35.76, 17.86], width: 2 },      // the Cut, into the prow
      { at: [42.625, 24.725] },              // the Cut, into the counters
    ],
    links: [
      { at: [38.5, 13] },                    // prow - booth 1
      { at: [38.5, 18] },                    // prow - booth 3
      { at: [41.25, 13] },                   // booth 1 - booth 2
      { at: [41.25, 19.5] },                 // booth 3 - counters
      { at: [42.625, 15.5] },                // booth 2 - counters
    ] },


  // Pachinko tower: machine rows front and middle, cash counter, wedge of more machines on the Cut, high-roller room at the back.
  { id: 'pachinko', district: 'flatiron', tall: true, height: 50, seed: 9107,
    rooms: [
      { id: 'hall', rect: [44, 54, 10.5, 20] },
      { id: 'middle-hall', rect: [44, 54, 20, 26.1] },
      { id: 'cash-counter', rect: [54, 60, 10.5, 20] },
      { id: 'high-roller', rect: [54, 60, 20, 26.1] },
      { id: 'wedge-hall', quad: [[44, 26.1], [60, 26.1], [60, 30], [53.95, 36.05]] },
    ],
    doors: [{ at: [48, 10.5], width: 2.4 }, { at: [57, 10.5] }, { at: [49, 31.075], width: 2 }],
    links: [
      { at: [49, 20], width: 2 },            // hall - middle hall
      { at: [54, 15] },                      // hall - cash counter
      { at: [54, 23] },                      // middle hall - high-roller
      { at: [49, 26.1], width: 2 },          // middle hall - wedge hall
      { at: [57, 20] },                      // cash counter - high-roller
    ] },

  // Body-mod tower: front studio on the Avenue, two work rooms, back room.
  { id: 'body-mod', district: 'metro', tall: true, height: 46, seed: 9108,
    rooms: [
      { id: 'front-studio', rect: [14, 22, 30, 36] },
      { id: 'work-room-1', rect: [14, 18, 36, 41] },
      { id: 'work-room-2', rect: [18, 22, 36, 41] },
      { id: 'back-room', rect: [14, 22, 41, 44] },
    ],
    doors: [{ at: [14, 33], width: 2 }, { at: [22, 33] }, { at: [22, 42.5] }],
    links: [
      { at: [16, 36] }, { at: [20, 36] },    // studio - work rooms
      { at: [18, 38.5] },                    // work room 1 - 2
      { at: [16, 41] }, { at: [20, 41] },    // work rooms - back room
    ] },

  // Metro entrance: ticket hall, gates, staff booth; the stairs down are sealed (shutter).
  { id: 'metro-entrance', district: 'metro', low: true, height: 4, seed: 9109,
    rooms: [
      { id: 'ticket-hall', rect: [24, 33, 44, 48] },
      { id: 'staff-booth', rect: [24, 27, 48, 52] },
      { id: 'gates', rect: [27, 30, 48, 52] },
    ],
    blocked: [[30, 33, 48, 52]],
    doors: [{ at: [28.5, 44], width: 1.8 }, { at: [24, 46] }, { at: [33, 46] }],
    links: [
      { at: [28.5, 48] },                    // hall - gates
      { at: [25.5, 48] },                    // hall - staff booth
      { at: [27, 50] },                      // staff booth - gates
    ] },

  // Bus: one room.
  { id: 'bus', district: 'boulevard', low: true, height: 3.2, seed: 9110,
    rooms: [{ id: 'bus', quad: [[46.2, 1.15], [58, 3.66], [57.46, 6.2], [45.66, 3.69]] }],
    // Both doors on the kerb side (south), toward its stop and the shelter.
    doors: [{ at: [49.64, 4.54], width: 1.6 }, { at: [55.51, 5.785], width: 1.6 }] },
];
