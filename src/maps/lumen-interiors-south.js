// Lumen's interiors, the south district (stage 4; design 5 rows 14-24 and 5b):
// the laundromat, the clinic (ground zero), the pharmacy, the EV garage, the
// fabrication workshop, the parking structure, the charging office, the club,
// the bar, the capsule hotel and the karaoke box. Every piece is data (the
// format and the kinds: world/city-interiors.js's header); the rules are
// checked by tests/city-interiors.test.js. Rooms and doors:
// maps/lumen-buildings-south.js. World coordinates: x east, z south.
//
// Each building tells how it was left (design 5): the laundromat's one
// machine still spinning; the clinic's dead (the surgical chair, two beds, the
// ward's floor) and its clean front; the pharmacy's forced cage with one
// medicine gone; the garage's car stopped mid-lift; the club's lit floor over
// nobody; the bar's game left mid-shot; the capsule hotel's slippers still
// lined up; the karaoke rooms' screens looping to empty sofas.

// Light colours (never a team colour): cold clinic white, the ward's sick
// green, the emergency red, the pods' pink, a warm bulb, the club's magenta.
const COLD = '#d8ecff', SICK = '#b9d98f', RED = '#ff2a3a', PINK = '#ff5a8c', WARM = '#ffd9a8', MAGENTA = '#ff2a66', GREEN = '#8aff4a', BLUE = '#3d62ff', LEMON = '#fcee0a';
const MEDICINE = '#e8604a'; // the stripped medicine's colour (the pharmacy)
// A room's own floor (world/city-interiors.js 'floor': it fills the room).
const F = (room, pattern, col, col2, size) => ({ kind: 'floor', room, pattern, col, ...(col2 && { col2 }), ...(size && { size }) });

// The district's data is built the first time it is asked for (southDistrict):
// the placements are thousands of objects, and evaluating them when maps.js is
// imported cost every page load, whichever map it played. Same for the other
// two district files.
function buildInteriors() {
  return {
    // ------------------------------------------------------------------ laundromat
    laundromat: [
      F('machine-hall', 'checker', '#979ba0', '#6c7177', .45), F('back-room', 'planks', '#5e4c3c'),
      // Machine hall: six washers along the south wall, the second from the east still
      // spinning, one open with wet washing spilling; two dryer stacks by the front door,
      // a folding table of half-folded clothes, a cart.
      ...[0, 1, 2, 3, 4, 5].map(i => ({ kind: 'washer', room: 'machine-hall', wall: 's', at: -23.46 + i * .7, v: i === 4 ? 2 : i === 1 ? 1 : 0 })),
      { kind: 'dryer-stack', room: 'machine-hall', wall: 'n', at: -23.42 },
      { kind: 'dryer-stack', room: 'machine-hall', wall: 'n', at: -22.65 },
      { kind: 'laundry-cart', room: 'machine-hall', x: -21.9, z: 11.18 },
      { kind: 'folding-table', room: 'machine-hall', x: -21.5, z: 13.74, d: .6 },
      { kind: 'litter', room: 'machine-hall', x: -22.9, z: 13.2, v: 4 },
      { kind: 'dropped-jacket', room: 'machine-hall', x: -23.1, z: 12.2, deg: 30, col: '#5b6b7a' },
      { kind: 'wall-screen', room: 'machine-hall', wall: 'e', at: 14.2, v: 3, col: '#b4bcb4' },
      { kind: 'ceiling-light', room: 'machine-hall', x: -21.5, z: 12.0, col: '#e8f1ff' },
      { kind: 'ceiling-light', room: 'machine-hall', x: -21.5, z: 13.9, col: '#e8f1ff' },
      { kind: 'outlet', room: 'machine-hall', wall: 'w', at: 14.3 },
      // The owner's back room: a cot, a hot plate, a shelf of the shop's stock and his things.
      { kind: 'cot', room: 'back-room', wall: 'e', at: 13.85, deg: 90 },
      { kind: 'hot-plate', room: 'back-room', wall: 'n', at: -17.0 },
      { kind: 'shelf-unit', room: 'back-room', wall: 's', at: -18.2 },
      { kind: 'ceiling-light', room: 'back-room', x: -17.5, z: 12.4, col: WARM },
      { kind: 'shoes', room: 'back-room', x: -18.2, z: 13.8, deg: -20, col: '#3b3f46' },
      { kind: 'litter', room: 'back-room', x: -17.9, z: 11.5, v: 2 },
    ],

    // ------------------------------------------------------------------ the clinic (5b)
    clinic: [
      F('waiting', 'tiles', '#9da3a8', '#82888e', .6), F('hall', 'tiles', '#9da3a8', '#82888e', .6), F('surgery', 'tiles', '#a7adb2', '#899096', .4),
      F('recovery', 'tiles', '#9aa1a4', '#80878a', .5), F('ward', 'tiles', '#8a9483', '#6e7866', .5), F('supply', 'concrete', '#6e7278'), F('washroom', 'checker', '#9ea3a7', '#7a8084', .3),
      // Waiting room: moulded chairs (some knocked over), the reception window looping the
      // biohazard pictogram, the take-a-number post, a dropped jacket, a handbag, a phone
      // lit face up, masks, the sanitiser station knocked off the wall.
      { kind: 'waiting-chairs', room: 'waiting', wall: 'n', at: -22.75 },
      { kind: 'waiting-chairs', room: 'waiting', wall: 's', at: -23.05, w: 1.5, v: 1 },
      { kind: 'reception-desk', room: 'waiting', wall: 'n', at: -20.6 },
      { kind: 'wall-screen', room: 'waiting', wall: 'n', at: -20.6, v: 1, col: '#f25060', w: .8 },
      { kind: 'number-post', room: 'waiting', x: -22.05, z: 20.95 },
      { kind: 'tipped-chair', room: 'waiting', x: -22.4, z: 22.2, deg: 70, col: '#8a9a8e' },
      { kind: 'tipped-chair', room: 'waiting', x: -20.7, z: 21.3, deg: -140, col: '#8a9a8e' },
      { kind: 'dropped-jacket', room: 'waiting', x: -21.3, z: 22.9, deg: -25, col: '#6a5a4c' },
      { kind: 'handbag', room: 'waiting', x: -23.3, z: 21.1, deg: 40 },
      { kind: 'phone', room: 'waiting', x: -21.9, z: 22.35, deg: 15 },
      { kind: 'masks', room: 'waiting', x: -22.8, z: 21.6 },
      { kind: 'sanitiser', room: 'waiting', x: -19.95, z: 23.3, deg: 20 },
      { kind: 'ceiling-panel', room: 'waiting', x: -22.6, z: 21.0, col: COLD },
      { kind: 'ceiling-panel', room: 'waiting', x: -20.9, z: 22.6, col: COLD },
      { kind: 'extinguisher', room: 'waiting', wall: 'w', at: 23.4 },
      { kind: 'exit-sign', room: 'waiting', wall: 's', at: -21.0 },
      // The hall: red emergency strips down both sides, cold panels.
      { kind: 'floor-strip', room: 'hall', x: -19.24, z: 19.5, deg: 90, w: 8.4, col: RED },
      { kind: 'floor-strip', room: 'hall', x: -18.26, z: 19.5, deg: 90, w: 8.4, col: RED },
      { kind: 'ceiling-panel', room: 'hall', x: -18.75, z: 17.3, col: COLD },
      { kind: 'ceiling-panel', room: 'hall', x: -18.75, z: 21.7, col: COLD },
      { kind: 'masks', room: 'hall', x: -18.8, z: 19.6, deg: 60 },
      // Surgery: the chair with its tool arms frozen mid-reach over the strapped patient,
      // the instrument tray across the floor, a dish of extracted ports, the cracked monitor's
      // flat line, cabinets, a cold flickering light.
      { kind: 'surgical-chair', room: 'surgery', x: -14.6, z: 23.3, deg: 90 },
      { kind: 'body', room: 'surgery', x: -14.6, z: 23.3, deg: 90, pose: 'strapped', infected: true, look: { skin: '#b08a6e', hair: '#2a211c', cloth: '#a3aca6', gown: true } },
      { kind: 'tool-arms', room: 'surgery', x: -14.5, z: 23.0 },
      { kind: 'surgical-light', room: 'surgery', x: -15.1, z: 22.7 },
      { kind: 'monitor-stand', room: 'surgery', wall: 'e', at: 22.35 },
      { kind: 'instrument-cart', room: 'surgery', x: -16.0, z: 23.12 },
      { kind: 'instrument-tray', room: 'surgery', x: -15.9, z: 21.7, deg: 25 },
      { kind: 'port-dish', room: 'surgery', x: -16.9, z: 22.2 },
      { kind: 'cabinet', room: 'surgery', wall: 'n', at: -17.3, col: '#c9d2d8' },
      { kind: 'cabinet', room: 'surgery', wall: 'n', at: -13.7, col: '#c9d2d8' },
      { kind: 'ceiling-panel', room: 'surgery', x: -16.4, z: 20.9, col: COLD },
      { kind: 'stain', room: 'surgery', x: -15.2, z: 22.3, w: .9, d: .6, col: '#3a2a24' },
      // Recovery: two beds with the dead under sheets (an arm and the blotching showing), IV
      // stands knocked over, a drip bag split, a sheet dragged toward the hall.
      { kind: 'bed', room: 'recovery', wall: 'n', at: -16.8, deg: -90, off: 0 },
      { kind: 'body', room: 'recovery', x: -16.8, z: 15.665, deg: -90, pose: 'sheet', infected: true, look: { skin: '#6b4a36', hair: '#15110e', gown: true } },
      { kind: 'bed', room: 'recovery', wall: 'e', at: 18.2, deg: 90 },
      { kind: 'body', room: 'recovery', x: -13.685, z: 18.2, deg: 0, pose: 'sheet', infected: true, look: { skin: '#d9b39a', hair: '#8a6a4a', gown: true } },
      { kind: 'iv-stand', room: 'recovery', x: -15.6, z: 15.9, v: 1, deg: 200 },
      { kind: 'iv-stand', room: 'recovery', x: -14.9, z: 17.1, deg: 10 },
      { kind: 'dragged-sheet', room: 'recovery', x: -16.9, z: 17.4, deg: -70 },
      { kind: 'ceiling-panel', room: 'recovery', x: -15.5, z: 17.25, col: COLD },
      { kind: 'stain', room: 'recovery', x: -15.3, z: 16.3, w: .5, d: .4, col: '#3f4a33' },
      // The isolation ward, behind the torn plastic airlock: a bed in its sheeting tent and
      // one in the open under a hung curtain, an infected body on the floor reaching for the
      // airlock, overflowing hazard bins, a slumped hazmat suit, the scrubber humming.
      { kind: 'airlock-plastic', room: 'ward', x: -19.86, z: 17.25, deg: 90 },
      { kind: 'isolation-tent', room: 'ward', wall: 's', at: -22.68, deg: 90, w: 1.3, d: 2.25 },
      { kind: 'bed', room: 'ward', wall: 'n', at: -21.38, deg: -90, v: 1, off: 0 },
      { kind: 'neon-tube', room: 'ward', wall: 'n', at: -21.38, col: SICK, h: 2.9 },
      { kind: 'body', room: 'ward', x: -20.9, z: 17.4, deg: 90, pose: 'reach', infected: true, look: { skin: '#8c6a52', hair: '#3a2c22', gown: true } },
      ...[0, 1, 2].map(i => ({ kind: 'bin', room: 'ward', wall: 's', at: -21.27 + i * .6, v: 1 })),
      { kind: 'air-scrubber', room: 'ward', wall: 'n', at: -20.0, w: .56, d: .5 },
      { kind: 'hazmat-suit', room: 'ward', x: -22.7, z: 17.0, deg: 100 },
      { kind: 'stain', room: 'ward', x: -21.3, z: 17.6, w: 1.0, d: .7, col: '#39402e' },
      { kind: 'ceiling-panel', room: 'ward', x: -21.8, z: 16.4, col: SICK },
      { kind: 'floor-strip', room: 'ward', x: -21.75, z: 18.05, w: 1.6, col: RED },
      // Supply closet: shelves stripped, boxes torn, a dropped crate of vials.
      { kind: 'wire-shelf', room: 'supply', wall: 'w', at: 13.875, w: 1.85, d: .2, off: 0, v: 1 },
      { kind: 'wire-shelf', room: 'supply', wall: 'e', at: 13.875, w: 1.85, d: .2, off: 0, v: 0 },
      { kind: 'vial-crate', room: 'supply', x: -14.6, z: 13.6, deg: 20 },
      { kind: 'litter', room: 'supply', x: -14.3, z: 14.3, v: 3 },
      { kind: 'ceiling-panel', room: 'supply', x: -14.5, z: 13.9, col: COLD },
      // Staff washroom: a sink running under a cracked mirror, a toilet, scrubs dumped.
      { kind: 'toilet', room: 'washroom', wall: 'w', at: 10.94 },
      { kind: 'sink', room: 'washroom', wall: 'n', at: -14.15, v: 1 },
      { kind: 'scrubs', room: 'washroom', x: -15.3, z: 11.9, deg: 35 },
      { kind: 'ceiling-panel', room: 'washroom', x: -14.5, z: 11.6, col: COLD },
    ],

    // ------------------------------------------------------------------ pharmacy
    pharmacy: [
      F('shop', 'tiles', '#a2a6aa', '#878c91', .6), F('counter', 'tiles', '#a2a6aa', '#878c91', .6), F('dispensary', 'plain', '#8f959b'), F('stockroom', 'concrete', '#63676d'),
      // Shop floor (the wedge): the aisles untouched, a fridge humming, baskets.
      { kind: 'gondola', room: 'shop', x: -12.35, z: 12.45, deg: 90, w: 2.1 },
      { kind: 'gondola', room: 'shop', x: -12.35, z: 14.8, deg: 90 },
      { kind: 'fridge', room: 'shop', x: -11.3, z: 15.66, deg: 180 },
      { kind: 'fridge', room: 'shop', x: -10.4, z: 15.66, deg: 180, v: 1 },
      { kind: 'ceiling-light', room: 'shop', x: -11.2, z: 14.0, deg: 90, col: COLD },
      { kind: 'ceiling-light', room: 'shop', x: -8.4, z: 15.0, col: COLD },
      { kind: 'litter', room: 'shop', x: -8.9, z: 15.3, v: 2 },
      // The counter floor: the dispensing counter, the shelf behind, the phone ringing.
      { kind: 'pharmacy-counter', room: 'counter', x: -11.1, z: 17.35 },
      { kind: 'shelf-unit', room: 'counter', wall: 's', at: -7.5, w: 1.6 },
      { kind: 'shelf-unit', room: 'counter', wall: 'n', at: -4.6 },
      { kind: 'bottles', room: 'counter', x: -10.4, z: 18.6, col: MEDICINE },
      { kind: 'ceiling-light', room: 'counter', x: -9.0, z: 17.9, col: COLD },
      { kind: 'ceiling-light', room: 'counter', x: -4.6, z: 17.9, col: COLD },
      // The caged dispensary: the gate forced, one medicine stripped bare and its bottles
      // scattered toward the door; every other shelf untouched.
      { kind: 'cage-gate', room: 'dispensary', x: -11.95, z: 20.0 },
      { kind: 'dispensary-shelf', room: 'dispensary', wall: 'w', at: 20.9 },
      { kind: 'dispensary-shelf', room: 'dispensary', wall: 'w', at: 22.8, v: 1, col: MEDICINE },
      { kind: 'dispensary-shelf', room: 'dispensary', wall: 's', at: -11.5 },
      { kind: 'dispensary-shelf', room: 'dispensary', wall: 's', at: -9.6 },
      { kind: 'pill-counter', room: 'dispensary', wall: 'e', at: 20.375, w: .95 },
      { kind: 'bottles', room: 'dispensary', x: -11.2, z: 22.6, col: MEDICINE, deg: 40 },
      { kind: 'bottles', room: 'dispensary', x: -10.4, z: 21.3, col: MEDICINE, deg: -30 },
      { kind: 'ceiling-light', room: 'dispensary', x: -10.5, z: 21.9, col: COLD },
      // Stockroom: shelves and pallets of boxes, the delivery door.
      { kind: 'shelf-unit', room: 'stockroom', wall: 'e', at: 20.6 },
      { kind: 'shelf-unit', room: 'stockroom', wall: 'e', at: 21.9 },
      { kind: 'shelf-unit', room: 'stockroom', wall: 'e', at: 23.2 },
      { kind: 'box-stack', room: 'stockroom', wall: 'n', at: -7.3 },
      { kind: 'box-stack', room: 'stockroom', wall: 's', at: -7.3, d: .65 },
      { kind: 'litter', room: 'stockroom', x: -5.8, z: 21.9, v: 2 },
      { kind: 'ceiling-light', room: 'stockroom', x: -5.0, z: 21.85, col: WARM },
    ],

    // ------------------------------------------------------------------ EV service garage
    'ev-garage': [
      F('service-bay', 'concrete', '#55595f', '#44484e'), F('parts', 'concrete', '#5a5e64'), F('office', 'tiles', '#6c6862', '#5a5650', .5),
      // Service bay: the car stopped half-way up the lift, the diagnostic cart scrolling, the
      // charger's cable coiled across the floor to it, tyres stacked, a bench, a drum.
      { kind: 'car-lift', room: 'service-bay', x: -58.4, z: 14.7 },
      { kind: 'diagnostic-cart', room: 'service-bay', wall: 'w', at: 11.3 },
      ...[0, 1, 2].map(i => ({ kind: 'tyre-stack', room: 'service-bay', wall: 'e', at: 11.05 + i * .72, v: 4 - i })),
      { kind: 'wall-charger', room: 'service-bay', wall: 'e', at: 13.25 },
      { kind: 'charge-cable', room: 'service-bay', x: -53.1, z: 13.6, deg: 15 },
      { kind: 'workbench', room: 'service-bay', wall: 'e', at: 14.95 },
      { kind: 'drum', room: 'service-bay', wall: 'e', at: 16.4, col: '#4a5a6a' },
      { kind: 'stain', room: 'service-bay', x: -58.2, z: 13.2, w: 1.4, d: 1.0, col: '#15171b' },
      { kind: 'ceiling-light', room: 'service-bay', x: -55.5, z: 13.0, col: COLD },
      { kind: 'ceiling-light', room: 'service-bay', x: -55.5, z: 16.6, col: COLD },
      { kind: 'extinguisher', room: 'service-bay', wall: 'w', at: 18.3 },
      // Parts room: racking of boxed parts, a drive unit on its pallet.
      { kind: 'parts-shelf', room: 'parts', wall: 'w', at: 20.0 },
      { kind: 'parts-shelf', room: 'parts', wall: 'w', at: 21.7 },
      { kind: 'parts-shelf', room: 'parts', wall: 'w', at: 23.2, w: 1.2 },
      { kind: 'parts-shelf', room: 'parts', wall: 'e', at: 20.0 },
      { kind: 'parts-shelf', room: 'parts', wall: 'e', at: 21.7 },
      { kind: 'parts-shelf', room: 'parts', wall: 'e', at: 23.2, w: 1.2 },
      { kind: 'engine-block', room: 'parts', x: -58.75, z: 21.25, deg: 90, w: 1.0 },
      { kind: 'ceiling-light', room: 'parts', x: -57.5, z: 21.5, col: WARM },
      // Office: a desk with the job screen still up, a filing cabinet, a shelf.
      { kind: 'desk', room: 'office', wall: 'w', at: 21.5 },
      { kind: 'office-chair', room: 'office', x: -54.52, z: 20.45 },
      { kind: 'cabinet', room: 'office', wall: 'e', at: 21.1, col: '#5c6570' },
      { kind: 'shelf-unit', room: 'office', wall: 'e', at: 22.8, w: 1.0 },
      { kind: 'ceiling-light', room: 'office', x: -53.0, z: 21.5, col: WARM },
    ],

    // ------------------------------------------------------------------ fabrication workshop
    'fab-workshop': [
      F('workshop', 'concrete', '#56585d', '#46484d'), F('paint-booth', 'grate', '#7c7f86', '#55585e'), F('tool-store', 'concrete', '#5e6066'),
      // Workshop floor: the welding station still lit, a rack of sheets, cut sheet metal on
      // the floor, benches, a pillar drill.
      { kind: 'welding-station', room: 'workshop', wall: 'w', at: 13.1 },
      { kind: 'workbench', room: 'workshop', wall: 'w', at: 15.6, v: 1 },
      { kind: 'sheet-rack', room: 'workshop', wall: 'e', at: 12.1 },
      { kind: 'workbench', room: 'workshop', wall: 'e', at: 14.3, v: 2 },
      { kind: 'drill-press', room: 'workshop', wall: 'e', at: 15.7 },
      { kind: 'cut-sheets', room: 'workshop', x: -47.8, z: 15.6, deg: 12 },
      { kind: 'ceiling-light', room: 'workshop', x: -47.5, z: 12.8, col: COLD },
      { kind: 'ceiling-light', room: 'workshop', x: -47.5, z: 16.2, col: COLD },
      { kind: 'extinguisher', room: 'workshop', wall: 'e', at: 17.5 },
      // Paint booth: the half-painted panel on its stand, the extractor wall, drums, the
      // respirator dropped.
      { kind: 'paint-extractor', room: 'paint-booth', wall: 's', at: -49.25 },
      { kind: 'paint-stand', room: 'paint-booth', wall: 'w', at: 21.9 },
      { kind: 'drum', room: 'paint-booth', wall: 'e', at: 20.35, off: 0, col: '#6e3c4a' },
      { kind: 'drum', room: 'paint-booth', wall: 'e', at: 21.05, off: 0, col: '#3f5d4c' },
      { kind: 'respirator', room: 'paint-booth', x: -49.0, z: 21.6 },
      { kind: 'stain', room: 'paint-booth', x: -49.6, z: 22.4, w: 1.2, d: 1.0, col: '#4a3d5c' },
      { kind: 'ceiling-light', room: 'paint-booth', x: -49.25, z: 21.25, col: '#f0f4ff' },
      // Tool store: cabinets and racks down both walls.
      { kind: 'tool-cabinet', room: 'tool-store', wall: 'w', at: 19.3, d: .45, off: 0 },
      { kind: 'wire-shelf', room: 'tool-store', wall: 'w', at: 20.6, v: 2, off: 0 },
      { kind: 'tool-cabinet', room: 'tool-store', wall: 'w', at: 21.9, d: .45, off: 0 },
      { kind: 'box-stack', room: 'tool-store', wall: 'w', at: 23.2, w: 1.2, d: .45, off: 0 },
      { kind: 'shelf-unit', room: 'tool-store', wall: 'e', at: 19.3, off: 0 },
      { kind: 'shelf-unit', room: 'tool-store', wall: 'e', at: 20.6, off: 0 },
      { kind: 'drum', room: 'tool-store', wall: 'e', at: 21.6, col: '#5a4a3a' },
      { kind: 'ceiling-light', room: 'tool-store', x: -45.75, z: 21.25, col: WARM },
    ],

    // ------------------------------------------------------------------ parking structure
    parking: [
      F('level', 'concrete', '#50535a', '#40434a'), F('west-bays', 'concrete', '#50535a', '#40434a'), F('ticket-booth', 'tiles', '#6a6e74', '#585c62', .4),
      // Ground level: a small car parked, its alarm light blinking; a pillar; the barrier
      // arm snapped off its post by the north entry.
      { kind: 'micro-car', room: 'level', x: -39.23, z: 20.7, deg: 90, v: 1, col: '#3c4f66' },
      { kind: 'pillar', room: 'level', x: -40.56, z: 13.85 },
      { kind: 'barrier-post', room: 'level', x: -36.45, z: 12.3 },
      { kind: 'barrier-arm', room: 'level', x: -37.6, z: 12.9, deg: -25 },
      { kind: 'stain', room: 'level', x: -38.8, z: 17.2, w: 1.6, d: 1.1, col: '#141619' },
      { kind: 'bay-lines', room: 'level', x: -38.95, z: 20.7, deg: 90, w: 2.0, d: 3.6 },
      { kind: 'wheel-stop', room: 'level', x: -40.55, z: 20.7, deg: 90 },
      { kind: 'cone', room: 'level', x: -36.6, z: 21.4 },
      { kind: 'cone', room: 'level', x: -37.1, z: 23.2, v: 1, deg: 60 },
      { kind: 'cable-run', room: 'level', x: -40.7, z: 17.3, deg: 90, w: 5 },
      { kind: 'alarm-light', room: 'level', wall: 'e', at: 21.5 },
      { kind: 'ceiling-light', room: 'level', x: -38.5, z: 13.0, col: COLD },
      { kind: 'ceiling-light', room: 'level', x: -38.5, z: 17.3, col: COLD },
      { kind: 'ceiling-light', room: 'level', x: -38.5, z: 21.6, col: COLD },
      // West bays: two motorbikes, a heap of scooters.
      { kind: 'motorbike', room: 'west-bays', wall: 'w', at: 15.5, deg: -90 },
      { kind: 'motorbike', room: 'west-bays', wall: 'w', at: 19.2, deg: -90 },
      { kind: 'litter', room: 'west-bays', x: -42.6, z: 19.6, v: 2 },
      { kind: 'bay-lines', room: 'west-bays', x: -43.0, z: 17.35, w: 1.3, d: 5.6 },
      { kind: 'scooter-heap', room: 'west-bays', x: -43.1, z: 17.35, deg: 90 },
      { kind: 'ceiling-light', room: 'west-bays', x: -42.5, z: 17.2, col: COLD },
      // Ticket booth: the desk of screens, the radio, an abandoned chair.
      { kind: 'ticket-desk', room: 'ticket-booth', wall: 'w', at: 11.4 },
      { kind: 'tipped-chair', room: 'ticket-booth', x: -42.9, z: 12.9, deg: 200, col: '#44474e' },
      { kind: 'pay-machine', room: 'ticket-booth', wall: 'e', at: 13.6, w: .4, off: 0 },
      { kind: 'wall-screen', room: 'ticket-booth', wall: 'n', at: -42.2, v: 3, col: '#b4bcb4', w: .8 },
      { kind: 'ceiling-panel', room: 'ticket-booth', x: -42.5, z: 12.25, col: WARM },
    ],

    // ------------------------------------------------------------------ charging station office
    'charging-office': [
      F('shop', 'tiles', '#969ba0', '#7c8186', .5), F('restroom', 'checker', '#969ba0', '#71777c', .3), F('stock', 'concrete', '#5e6268'),
      // Small shop: snacks and cables for sale, the counter with its till, the coffee
      // machine dripping, drinks fridges.
      { kind: 'snack-shelf', room: 'shop', wall: 'n', at: -8.65, w: 2.3 },
      { kind: 'counter', room: 'shop', wall: 'n', at: -6.4, v: 1 },
      { kind: 'coffee-counter', room: 'shop', wall: 'n', at: -4.6 },
      { kind: 'snack-shelf', room: 'shop', wall: 'n', at: -3.0 },
      { kind: 'fridge', room: 'shop', wall: 's', at: -6.7 },
      { kind: 'fridge', room: 'shop', wall: 's', at: -5.8, v: 1 },
      { kind: 'litter', room: 'shop', x: -6.0, z: 48.3, v: 3 },
      { kind: 'ceiling-light', room: 'shop', x: -7.6, z: 47.5, col: COLD },
      { kind: 'ceiling-light', room: 'shop', x: -4.4, z: 47.5, col: COLD },
      { kind: 'wall-screen', room: 'shop', wall: 's', at: -3.0, v: 4, col: GREEN, w: .8 },
      { kind: 'cable-run', room: 'shop', x: -8.9, z: 46.3, deg: 20, w: 1.2 },
      { kind: 'phone', room: 'shop', x: -7.3, z: 48.9, deg: -60 },
      { kind: 'extinguisher', room: 'shop', wall: 'w', at: 49.3 },
      // Restroom and stock.
      { kind: 'toilet', room: 'restroom', wall: 's', at: -7.9 },
      { kind: 'sink', room: 'restroom', wall: 'e', at: 52.05 },
      { kind: 'ceiling-panel', room: 'restroom', x: -8.25, z: 51.5, col: COLD },
      { kind: 'box-stack', room: 'stock', wall: 's', at: -5.8 },
      { kind: 'box-stack', room: 'stock', wall: 's', at: -4.7 },
      { kind: 'shelf-unit', room: 'stock', wall: 'e', at: 51.4 },
      { kind: 'ceiling-panel', room: 'stock', x: -4.25, z: 51.5, col: WARM },
      { kind: 'litter', room: 'stock', x: -5.3, z: 51.3, v: 2 },
      { kind: 'ceiling-panel', room: 'restroom', x: -9.2, z: 50.9, col: COLD, pool: false },
    ],

    // ------------------------------------------------------------------ club
    club: [
      F('foyer', 'carpet', '#3e1c2e', '#24121c'), F('dance-floor', 'plain', '#141418'), F('bar', 'tiles', '#2a2430', '#1c1822', .5), F('vip', 'carpet', '#4a1a32', '#2a0e1c'),
      F('dj-booth', 'plain', '#18181e'), F('staff-corridor', 'concrete', '#4a4c52'), F('restroom-a', 'checker', '#3a3a44', '#26262e', .35), F('restroom-b', 'checker', '#3a3a44', '#26262e', .35), F('staff-room', 'planks', '#4a4038'),
      // Foyer: the cloakroom (coats still hanging), the ticket counter, sofas, the velvet
      // rope down by the door.
      { kind: 'coat-rail', room: 'foyer', wall: 'w', at: 37.2 },
      { kind: 'cloak-counter', room: 'foyer', x: -59.6, z: 37.19, deg: 90, w: 2.0 },
      { kind: 'counter', room: 'foyer', wall: 'n', at: -55.6, col: '#2a2330' },
      { kind: 'sofa', room: 'foyer', wall: 'n', at: -49.6, col: '#5a2438' },
      { kind: 'sofa', room: 'foyer', wall: 'n', at: -47.7, col: '#5a2438' },
      { kind: 'velvet-rope', room: 'foyer', x: -52.9, z: 38.3, deg: 10 },
      { kind: 'neon-tube', room: 'foyer', wall: 's', at: -59.5, col: MAGENTA, v: 1 },
      { kind: 'neon-tube', room: 'foyer', wall: 'n', at: -45.6, col: PINK },
      { kind: 'ceiling-panel', room: 'foyer', x: -57.5, z: 38.0, col: MAGENTA },
      { kind: 'ceiling-panel', room: 'foyer', x: -48.5, z: 38.0, col: MAGENTA },
      { kind: 'glasses', room: 'foyer', x: -50.4, z: 38.6, deg: 30 },
      // Dance floor: the lit tiles over an empty floor, speaker stacks in the corners, high
      // tables, glasses everywhere, a lost shoe.
      { kind: 'dance-tiles', room: 'dance-floor', x: -55.5, z: 45.5, w: 6.4, d: 6.4 },
      { kind: 'light-rig', room: 'dance-floor', x: -55.5, z: 45.5, w: 5.4, d: 5.4 },
      { kind: 'speaker-stack', room: 'dance-floor', x: -61.3, z: 40.6 },
      { kind: 'speaker-stack', room: 'dance-floor', x: -51.7, z: 40.6 },
      { kind: 'speaker-stack', room: 'dance-floor', x: -61.3, z: 50.4 },
      { kind: 'speaker-stack', room: 'dance-floor', x: -49.7, z: 50.4 },
      { kind: 'high-table', room: 'dance-floor', x: -61.1, z: 43.4 },
      { kind: 'high-table', room: 'dance-floor', x: -61.1, z: 47.4 },
      { kind: 'high-table', room: 'dance-floor', x: -55.5, z: 50.4 },
      { kind: 'glasses', room: 'dance-floor', x: -57.0, z: 44.0, deg: 20 },
      { kind: 'glasses', room: 'dance-floor', x: -53.6, z: 47.2, deg: -50 },
      { kind: 'glasses', room: 'dance-floor', x: -59.2, z: 48.4, deg: 80 },
      { kind: 'shoes', room: 'dance-floor', x: -54.2, z: 43.1, deg: 35, v: 0, col: '#7a1f3a' },
      { kind: 'ceiling-panel', room: 'dance-floor', x: -58.5, z: 43.0, col: BLUE },
      { kind: 'ceiling-panel', room: 'dance-floor', x: -52.5, z: 43.0, col: MAGENTA },
      { kind: 'ceiling-panel', room: 'dance-floor', x: -58.5, z: 48.0, col: MAGENTA },
      { kind: 'ceiling-panel', room: 'dance-floor', x: -52.5, z: 48.0, col: BLUE },
      { kind: 'neon-tube', room: 'dance-floor', wall: 'w', at: 45.5, col: MAGENTA, w: 2.4, v: 1 },
      // Bar: counters in the corners, lit bottle shelves, glasses everywhere.
      { kind: 'bar-counter', room: 'bar', wall: 'n', at: -48.225, w: 1.15 },
      { kind: 'bar-counter', room: 'bar', wall: 's', at: -48.225, w: 1.15 },
      { kind: 'back-bar', room: 'bar', wall: 'e', at: 40.87, w: 1.3 },
      { kind: 'back-bar', room: 'bar', wall: 'e', at: 44.62, w: 1.3 },
      { kind: 'glasses', room: 'bar', x: -46.6, z: 42.2, deg: 10 },
      { kind: 'stain', room: 'bar', x: -46.0, z: 43.2, w: .8, d: .6, col: '#2a1c24' },
      { kind: 'ceiling-panel', room: 'bar', x: -46.5, z: 42.75, col: WARM },
      // VIP room: a padded booth, a sofa, a side table.
      { kind: 'vip-booth', room: 'vip', wall: 'e', at: 48.2, col: '#4a1d33' },
      { kind: 'sofa', room: 'vip', wall: 's', at: -47.95, w: 1.7, col: '#4a1d33' },
      { kind: 'glasses', room: 'vip', x: -47.3, z: 48.6, deg: 45 },
      { kind: 'ceiling-panel', room: 'vip', x: -46.5, z: 48.2, col: PINK },
      // DJ booth: the desk (decks still lit), speakers, a crate of records.
      { kind: 'dj-desk', room: 'dj-booth', x: -59.0, z: 53.7, deg: 180 },
      { kind: 'speaker-stack', room: 'dj-booth', x: -61.3, z: 51.6 },
      { kind: 'crate', room: 'dj-booth', x: -56.55, z: 55.5 },
      { kind: 'wall-screen', room: 'dj-booth', wall: 's', at: -59.0, v: 4, col: MAGENTA },
      { kind: 'ceiling-panel', room: 'dj-booth', x: -59.0, z: 54.6, col: BLUE },
      // Staff corridor.
      { kind: 'cable-run', room: 'staff-corridor', x: -54.8, z: 52.7, w: 1.6 },
      { kind: 'ceiling-panel', room: 'staff-corridor', x: -54.2, z: 52.0, col: COLD },
      { kind: 'ceiling-panel', room: 'staff-corridor', x: -50.8, z: 52.0, col: COLD },
      { kind: 'exit-sign', room: 'staff-corridor', wall: 'n', at: -54.8 },
      // Restrooms: stalls and sinks, each laid out its own way.
      { kind: 'toilet-stall', room: 'restroom-a', wall: 's', at: -55.3, d: 1.2, off: 0 },
      { kind: 'toilet-stall', room: 'restroom-a', wall: 's', at: -54.2, d: 1.2, off: 0, v: 1 },
      { kind: 'sink', room: 'restroom-a', wall: 'e', at: 55.05 },
      { kind: 'ceiling-panel', room: 'restroom-a', x: -54.25, z: 54.3, col: PINK },
      { kind: 'toilet-stall', room: 'restroom-b', wall: 'w', at: 55.1, w: 1.0 },
      { kind: 'sink', room: 'restroom-b', wall: 's', at: -50.4, w: .8 },
      { kind: 'sink', room: 'restroom-b', wall: 's', at: -49.575, w: .75 },
      { kind: 'glasses', room: 'restroom-b', x: -50.9, z: 54.3, deg: 70 },
      { kind: 'ceiling-panel', room: 'restroom-b', x: -50.75, z: 54.3, col: PINK },
      // Staff room: lockers, a table, a sofa.
      { kind: 'locker', room: 'staff-room', wall: 'n', at: -46.95 },
      { kind: 'locker', room: 'staff-room', wall: 'n', at: -45.95, v: 1 },
      { kind: 'locker', room: 'staff-room', wall: 'n', at: -44.95 },
      { kind: 'sofa', room: 'staff-room', wall: 's', at: -47.9, col: '#3c3a42' },
      { kind: 'table', room: 'staff-room', x: -46.3, z: 54.9 },
      { kind: 'ceiling-panel', room: 'staff-room', x: -46.5, z: 53.5, col: WARM },
    ],

    // ------------------------------------------------------------------ bar
    bar: [
      F('bar-room', 'planks', '#5a4232'), F('pool-room', 'carpet', '#3a2226', '#24141a'),
      // Bar room: the counter and its stools, the back bar, three booths down the west wall,
      // a glass on its side.
      { kind: 'bar-counter', room: 'bar-room', x: -34.34, z: 38.95, deg: -90, w: 2.7 },
      { kind: 'back-bar', room: 'bar-room', wall: 'e', at: 38.95, w: 2.4, d: .4 },
      ...[0, 1, 2].map(i => ({ kind: 'stool', room: 'bar-room', x: -34.95, z: 38.2 + i * .5 })),
      ...[0, 1, 2].map(i => ({ kind: 'booth', room: 'bar-room', wall: 'w', at: 36.95 + i * 1.53, deg: -90, w: 1.5 })),
      { kind: 'glasses', room: 'bar-room', x: -35.6, z: 39.0, deg: 20 },
      { kind: 'ceiling-light', room: 'bar-room', x: -37.0, z: 38.5, deg: 90, col: WARM },
      { kind: 'neon-tube', room: 'bar-room', wall: 'n', at: -33.2, col: MAGENTA, w: 1.4 },
      { kind: 'wall-screen', room: 'bar-room', wall: 'w', at: 36.7, v: 0, col: GREEN, w: .8 },
      { kind: 'dropped-jacket', room: 'bar-room', x: -35.9, z: 37.9, deg: 70, col: '#4a3a52' },
      { kind: 'glasses', room: 'bar-room', x: -37.6, z: 40.2, deg: -40 },
      { kind: 'stain', room: 'bar-room', x: -35.3, z: 39.1, w: .6, d: .5, col: '#2a1c1c' },
      { kind: 'litter', room: 'bar-room', x: -36.8, z: 37.2, v: 2 },
      { kind: 'ceiling-light', room: 'bar-room', x: -34.3, z: 38.9, deg: 90, col: WARM, pool: false },
      // Pool room: the table mid-game, the jukebox still playing, cues on the wall.
      { kind: 'pool-table', room: 'pool-room', x: -33.7, z: 43.65, deg: 90 },
      { kind: 'jukebox', room: 'pool-room', wall: 's', at: -39.4 },
      { kind: 'cue-rack', room: 'pool-room', wall: 'n', at: -33.2 },
      { kind: 'high-table', room: 'pool-room', x: -37.25, z: 45.3 },
      { kind: 'stool', room: 'pool-room', x: -36.55, z: 45.5 },
      { kind: 'ceiling-light', room: 'pool-room', x: -33.7, z: 43.65, col: WARM },
      { kind: 'phone', room: 'pool-room', x: -36.3, z: 44.9, deg: 30 },
      { kind: 'glasses', room: 'pool-room', x: -35.6, z: 42.8, deg: 60 },
      { kind: 'neon-tube', room: 'pool-room', wall: 'e', at: 42.2, col: RED, w: 1.2 },
    ],

    // ------------------------------------------------------------------ capsule hotel
    'capsule-hotel': [
      F('reception', 'planks', '#72644f', '#615442'), F('pods-a', 'carpet', '#3a3040', '#261e2c'), F('pods-b', 'carpet', '#3a3040', '#261e2c'), F('washroom', 'tiles', '#8f9696', '#737a7a', .4),
      // Reception: the counter, shoe lockers with the slippers still lined up beneath.
      { kind: 'counter', room: 'reception', x: -30.51, z: 37.9, w: 2.6, col: '#d9d4cc' },
      { kind: 'shoe-lockers', room: 'reception', wall: 'n', at: -25.3, w: 2.2 },
      { kind: 'shoes', room: 'reception', x: -25.3, z: 36.95, w: 2.0, v: 5, col: '#e9e4dc' },
      { kind: 'wall-screen', room: 'reception', wall: 'n', at: -30.5, v: 0, col: PINK },
      { kind: 'potted-plant', room: 'reception', x: -31.45, z: 39.45 },
      { kind: 'ceiling-panel', room: 'reception', x: -29.5, z: 38.0, col: WARM },
      { kind: 'ceiling-panel', room: 'reception', x: -26.5, z: 38.0, col: WARM },
      // Pod corridors: stacked pink-lit pods, one curtain half open with a bag inside.
      ...[0, 1, 2].map(i => ({ kind: 'capsule-pods', room: 'pods-a', x: -30.81, z: 42.08 + i * .96, deg: 90, w: .96, v: i === 1 ? 1 : 0 })),
      { kind: 'shoes', room: 'pods-a', x: -29.55, z: 43.0, deg: 90, w: 2.4, v: 4, col: '#e9e4dc' },
      { kind: 'ceiling-panel', room: 'pods-a', x: -29.0, z: 42.0, col: PINK },
      { kind: 'ceiling-panel', room: 'pods-a', x: -29.0, z: 44.3, col: PINK },
      { kind: 'side-pods', room: 'pods-b', wall: 'e', at: 41.75, w: 3.1, d: .66, off: 0 },
      { kind: 'ceiling-panel', room: 'pods-b', x: -26.0, z: 41.75, col: PINK },
      { kind: 'shoes', room: 'pods-b', x: -25.6, z: 42.6, deg: 90, w: 1.2, v: 2, col: '#e9e4dc' },
      { kind: 'handbag', room: 'pods-a', x: -29.4, z: 44.9, deg: 20 },
      { kind: 'scrubs', room: 'washroom', x: -26.4, z: 44.5, deg: 30, col: '#d8d4cc' },
      { kind: 'wall-screen', room: 'pods-a', wall: 'e', at: 44.4, v: 0, col: PINK, w: .7 },
      // Shared washroom: two cubicles and the basins between them.
      { kind: 'shower-stall', room: 'washroom', wall: 'w', at: 44.75, w: 2.1, d: .7, off: 0 },
      { kind: 'shower-stall', room: 'washroom', wall: 'e', at: 44.75, w: 2.1, d: .7, off: 0 },
      { kind: 'sink', room: 'washroom', wall: 's', at: -26.0, w: 1.8 },
      { kind: 'ceiling-panel', room: 'washroom', x: -26.0, z: 44.6, col: COLD },
    ],

    // ------------------------------------------------------------------ karaoke box
    karaoke: [
      F('front-desk', 'carpet', '#2c2236', '#1a1422'), F('corridor', 'carpet', '#221c2a', '#141018'),
      F('room-1', 'carpet', '#3a1a2a', '#240e1a'), F('room-2', 'carpet', '#1a2634', '#0e161e'), F('room-3', 'carpet', '#2e3420', '#1a2012'), F('room-4', 'carpet', '#3a2a1a', '#22180e'),
      // Front desk: the desk with its mics and songbook tablets, waiting sofa, drinks
      // fridges, the mic cabinet.
      { kind: 'counter', room: 'front-desk', x: -28.0, z: 54.1, w: 2.4, col: '#2b2438' },
      { kind: 'sofa', room: 'front-desk', wall: 'w', at: 53.2, col: '#3a2c52' },
      { kind: 'fridge', room: 'front-desk', wall: 'e', at: 53.4 },
      { kind: 'fridge', room: 'front-desk', wall: 'e', at: 54.3 },
      { kind: 'cabinet', room: 'front-desk', wall: 'e', at: 55.3, col: '#2e2a36' },
      { kind: 'wall-screen', room: 'front-desk', wall: 's', at: -28.0, v: 4, col: GREEN },
      { kind: 'neon-tube', room: 'front-desk', wall: 'n', at: -30.4, col: MAGENTA, v: 1 },
      { kind: 'ceiling-panel', room: 'front-desk', x: -28.0, z: 52.5, col: PINK },
      // The corridor of rooms.
      { kind: 'floor-strip', room: 'corridor', x: -38.0, z: 51.75, w: 11.2, col: MAGENTA },
      { kind: 'ceiling-panel', room: 'corridor', x: -41.0, z: 51.0, col: PINK },
      { kind: 'ceiling-panel', room: 'corridor', x: -35.0, z: 51.0, col: PINK },
      { kind: 'mic', room: 'corridor', x: -37.2, z: 50.8, deg: 40 },
      // Room 1: a sofa across the back, the table of drinks, the screen looping.
      { kind: 'karaoke-sofa', room: 'room-1', wall: 's', at: -42.5, w: 2.62, col: '#5a2a44' },
      { kind: 'karaoke-table', room: 'room-1', x: -42.5, z: 54.62, w: 1.4 },
      { kind: 'wall-screen', room: 'room-1', wall: 'e', at: 54.0, v: 0, col: PINK, w: .9 },
      { kind: 'mic', room: 'room-1', x: -42.9, z: 53.9, deg: 60 },
      { kind: 'ceiling-panel', room: 'room-1', x: -42.5, z: 54.3, col: MAGENTA },
      // Room 2: two sofas facing across a narrow table.
      { kind: 'karaoke-sofa', room: 'room-2', wall: 'w', at: 55.0, w: 1.6, col: '#2a3a5a' },
      { kind: 'karaoke-sofa', room: 'room-2', wall: 'e', at: 55.0, w: 1.6, col: '#2a3a5a' },
      { kind: 'karaoke-table', room: 'room-2', x: -39.5, z: 54.9, deg: 90, w: 1.4, v: 1 },
      { kind: 'wall-screen', room: 'room-2', wall: 's', at: -39.5, v: 4, col: GREEN, w: .9 },
      { kind: 'mic', room: 'room-2', x: -39.2, z: 53.4, deg: -20 },
      { kind: 'ceiling-panel', room: 'room-2', x: -39.5, z: 54.3, col: BLUE },
      // Room 3: the door jammed open, an L-sofa, stools.
      { kind: 'jammed-door', room: 'room-3', x: -37.3, z: 52.9, deg: 90 },
      { kind: 'karaoke-sofa', room: 'room-3', wall: 'e', at: 54.7, w: 2.2, v: 1, col: '#4a3a2a' },
      { kind: 'karaoke-table', room: 'room-3', x: -36.55, z: 55.35, w: .9, d: .5 },
      { kind: 'stool', room: 'room-3', x: -37.5, z: 55.4 },
      { kind: 'wall-screen', room: 'room-3', wall: 'w', at: 54.6, v: 0, col: MAGENTA, w: .9 },
      { kind: 'glasses', room: 'room-3', x: -36.9, z: 54.0, deg: 30 },
      { kind: 'ceiling-panel', room: 'room-3', x: -36.5, z: 54.3, col: PINK },
      // Room 4: the party over: the table knocked over, a mic on the floor, a stool.
      { kind: 'karaoke-sofa', room: 'room-4', wall: 's', at: -33.6, w: 2.2, col: '#2a4a3a' },
      { kind: 'tipped-chair', room: 'room-4', x: -33.3, z: 54.1, deg: 120, col: '#3a3a44' },
      { kind: 'mic', room: 'room-4', x: -34.0, z: 53.8, deg: 150 },
      { kind: 'glasses', room: 'room-4', x: -33.5, z: 54.7, deg: -30 },
      { kind: 'wall-screen', room: 'room-4', wall: 'w', at: 54.4, v: 3, col: '#b4bcb4', w: .9 },
      { kind: 'ceiling-panel', room: 'room-4', x: -33.5, z: 54.3, col: GREEN },
    ],
  };
}

// No data-made kinds yet: the south district's kinds are coded
// (world/city-interiors.js SOUTH_PIECES, render/city-interior-models.js).
let district;
/** The south district's `{ INTERIORS, KINDS }` (building id -> pieces; data-made kinds), made once on first call. */
export function southDistrict() {
  return district ??= { INTERIORS: buildInteriors(), KINDS: {} };
}
