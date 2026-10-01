// Lumen's buildings, north part (stage 2): each footprint of maps/lumen-layout.js
// FOOTPRINTS as rooms, doors and inner doorways (world/city-rooms.js), checked
// by tests/lumen-buildings.test.js. Stage 4 furnishes the rooms.
export const LUMEN_BUILDINGS_NORTH = [
  // The Stacks' U round the courtyard: a 2 m corridor runs up the west wing's
  // east side and along the arms' courtyard sides; four units line the wing's
  // west side, two the north arm, the washroom and the mail nook the south arm.
  // The notch (x -64..-60) is the sealed stairwell. All doors face the courtyard
  // (the only open ground any of its faces meets): the north arm's south face,
  // the wing's east face and the south arm's north face.
  { id: 'stacks-main', district: 'stacks', tall: true, height: 58, seed: 7001,
    rooms: [
      { id: 'corridor-w', rect: [-52, -50, -44, -16], followCamera: true },
      { id: 'unit-1', rect: [-60, -52, -44, -37] },
      { id: 'unit-2', rect: [-60, -52, -37, -30] },
      { id: 'unit-3', rect: [-60, -52, -30, -23] },
      { id: 'unit-4', rect: [-60, -52, -23, -16] },
      { id: 'corridor-n', rect: [-50, -40, -36, -34] },
      { id: 'unit-5', rect: [-50, -45, -44, -36] },
      { id: 'unit-6', rect: [-45, -40, -44, -36] },
      { id: 'corridor-s', rect: [-50, -40, -22, -20] },
      { id: 'washroom', rect: [-50, -45, -20, -16] },
      { id: 'mail-nook', rect: [-45, -40, -20, -16] },
    ],
    doors: [{ at: [-45, -34] }, { at: [-50, -28] }, { at: [-45, -22] }],
    links: [
      { at: [-50, -35] }, { at: [-50, -21] },
      { at: [-52, -40.5] }, { at: [-52, -33.5] }, { at: [-52, -26.5] }, { at: [-52, -19.5] },
      { at: [-47.5, -36] }, { at: [-42.5, -36] },
      { at: [-47.5, -20] }, { at: [-42.5, -20] },
    ],
    blocked: [[-64, -60, -44, -40]] },

  // Tenement A: the lobby on West Street (the mail-slot wall), the super's
  // caged office and the laundry behind it, and the back corridor (the leg)
  // out to the courtyard.
  { id: 'tenement-a', district: 'stacks', tall: true, height: 46, seed: 7002,
    rooms: [
      { id: 'lobby', rect: [-52, -36, -56, -44], followCamera: true },
      { id: 'supers-office', rect: [-64, -52, -56, -51] },
      { id: 'laundry', rect: [-64, -52, -51, -44] },
      { id: 'back-corridor', rect: [-40, -36, -44, -34] },
    ],
    doors: [{ at: [-36, -52] }, { at: [-36, -39] }, { at: [-38, -34] }],
    links: [{ at: [-52, -53.5] }, { at: [-52, -47.5] }, { at: [-38, -44] }] },

  // Tenement B: the dumpling shop on the Boulevard, its kitchen, the shrine
  // room behind a bead curtain; the leg is a back hall to the courtyard.
  { id: 'tenement-b', district: 'stacks', tall: true, height: 52, seed: 7003,
    rooms: [
      { id: 'shrine', rect: [-60, -54, -16, -10.5] },
      { id: 'kitchen', rect: [-54, -46, -16, -10.5] },
      { id: 'shop', rect: [-46, -36, -16, -10.5] },
      { id: 'back-hall', rect: [-40, -36, -22, -16] },
    ],
    doors: [{ at: [-41, -10.5] }, { at: [-36, -13.25] }, { at: [-38, -22] }],
    links: [{ at: [-54, -13.25] }, { at: [-46, -13.25] }, { at: [-38, -16] }] },

  // The Night Market's hall: stall rows (three wide openings on North Lane and a
  // West Street door), the cold room and the back office at the east end.
  { id: 'market-hall', district: 'night-market', low: true, height: 6, seed: 7004,
    rooms: [
      { id: 'hall', rect: [-24, -6, -53, -43], followCamera: true },
      { id: 'cold-room', rect: [-6, -2, -53, -47] },
      { id: 'office', rect: [-6, -2, -47, -43] },
    ],
    doors: [{ at: [-20, -43], width: 4 }, { at: [-14.25, -43], width: 3.5 }, { at: [-9, -43], width: 3 }, { at: [-24, -48] }],
    links: [{ at: [-6, -50] }, { at: [-6, -45] }] },

  // Stall storage shed: the storage bays run through from North Lane to Back
  // Alley; the partitioned sleeping corner is a small room at the east end.
  { id: 'stall-shed', district: 'night-market', low: true, height: 4, seed: 7005,
    rooms: [
      { id: 'storage', rect: [-24, -17, -30, -25.5] },
      { id: 'sleeping-corner', rect: [-17, -13, -30, -25.5] },
    ],
    doors: [{ at: [-21, -30] }, { at: [-21, -25.5] }, { at: [-24, -27.75] }],
    links: [{ at: [-17, -27.75] }] },

  // Lock-up: a short corridor through from North Lane to Back Alley, three units off it.
  { id: 'lock-up', district: 'north-frontage', low: true, height: 4, seed: 7006,
    rooms: [
      { id: 'unit-a', rect: [-13, -8.5, -30, -25.5] },
      { id: 'corridor', rect: [-8.5, -5.5, -30, -25.5] },
      { id: 'unit-b', rect: [-5.5, -2, -30, -27.75] },
      { id: 'unit-c', rect: [-5.5, -2, -27.75, -25.5] },
    ],
    doors: [{ at: [-7, -30] }, { at: [-7, -25.5] }],
    links: [{ at: [-8.5, -27.75] }, { at: [-5.5, -28.875] }, { at: [-5.5, -26.625] }] },

  // Convenience store: shop floor on the Boulevard, stockroom (back door to the alley) and toilet behind.
  { id: 'convenience', district: 'north-frontage', low: true, height: 5, seed: 7007,
    rooms: [
      { id: 'shop', rect: [-24, -18, -18, -10.5] },
      { id: 'stockroom', rect: [-24, -20.5, -22, -18] },
      { id: 'staff-toilet', rect: [-20.5, -18, -22, -18] },
    ],
    doors: [{ at: [-21, -10.5] }, { at: [-24, -14] }, { at: [-22.25, -22] }],
    links: [{ at: [-22.25, -18] }, { at: [-19.25, -18] }] },

  // Noodle bar: counter and booths on the Boulevard, the kitchen with the back door to the alley.
  { id: 'noodle-bar', district: 'north-frontage', tall: true, height: 50, seed: 7008,
    rooms: [
      { id: 'dining', rect: [-18, -12.5, -16, -10.5] },
      { id: 'kitchen', rect: [-18, -12.5, -22, -16] },
    ],
    doors: [{ at: [-15.25, -10.5] }, { at: [-15.25, -22] }],
    links: [{ at: [-15.25, -16] }] },

  // Pawn and repair: the caged counter in the wedge on the chamfer, a passage
  // to the safe room and the workshop (back door to the alley).
  { id: 'pawn', district: 'north-frontage', low: true, height: 5, seed: 7009,
    rooms: [
      { id: 'counter', quad: [[-12.5, -16], [-8, -16], [-8, -12.94], [-12.5, -10.5]] },
      { id: 'safe-room', rect: [-12.5, -10, -18.5, -16] },
      { id: 'passage', rect: [-10, -8, -18.5, -16] },
      { id: 'workshop', rect: [-12.5, -8, -22, -18.5] },
    ],
    doors: [{ at: [-10.25, -11.72] }, { at: [-10.5, -22] }],
    links: [{ at: [-9, -16] }, { at: [-9, -18.5] }, { at: [-10, -17.25] }] },

  // Arcade and VR parlour: the cabinet hall (with the prize counter) in the
  // wedge on the chamfer, the VR corridor behind it (back door to the alley).
  { id: 'arcade', district: 'north-frontage', tall: true, height: 56, seed: 7010,
    rooms: [
      { id: 'cabinet-hall', quad: [[-8, -19], [-2, -19], [-2, -16.2], [-8, -12.94]] },
      { id: 'vr-corridor', rect: [-8, -2, -22, -19] },
    ],
    doors: [{ at: [-5, -14.57] }, { at: [-2, -17.6] }, { at: [-5, -22] }],
    links: [{ at: [-5, -19] }] },
];
