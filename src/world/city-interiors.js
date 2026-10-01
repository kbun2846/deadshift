// City interiors (Lumen stage 4): each city building's furniture, what it
// is, where it stands, how solid it is, and the rules every room keeps.
//
// One list per building, read by both sides of the game (as Deadwater's
// world/room-furniture.js and Hollow Wick's world/colonial-interiors.js):
//  - map-kit.js mapColliders turns every piece that is not walk-over clutter
//    into a collider of its footprint and drawn height (through
//    detailed-interiors.js interiorCover -> cityRoomCover(room) below);
//  - render/city-interior-models.js draws every piece from the same list,
//    merged into one mesh per building (and one of fine detail from Balanced).
// So nothing is drawn that a body walks through, and there is no second list.
//
// AUTHORING (the district files, maps/lumen-interiors-<district>.js; the
// index maps/lumen-interiors.js merges them, and builds them on first use,
// not at import): each exports southDistrict() (or east, north) returning
//   { INTERIORS: { '<building id>': [ piece, ... ], ... },
//     KINDS: { '<kind>': { w, d, h, cls, parts }, ... } }   (KINDS: data-made kinds, or {})
// A piece is a plain object, in world coordinates (x east, z south, metres):
//   { kind, room, x, z, deg }             free-standing: its footprint's centre and turn
//   { kind, room, wall, at, off }         against a wall: wall 'n' | 's' | 'e' | 'w' of the
//                                         room (a rect room), `at` its centre along the wall
//                                         (x for n/s, z for e/w), `off` metres off the wall's
//                                         inner face (default .02); its back is to the wall
//                                         (add deg: 90 or -90 to stand it side-on: a bed's
//                                         long side along the wall; then w is its depth)
//   ...plus any of: w, d, h (override the kind's size: counters and shelves come in lengths),
//   col (a colour the model uses for its main body), v (a variant number the model reads),
//   and whatever else that kind's model reads (listed with the kind below).
// `room` is the room's id in the building (e.g. 'machine-hall'); it may be left out for a
// free-standing piece (the room holding (x, z) is taken). `deg` turns the piece about its
// centre: 0 = its front (+z in its own frame) faces south, 90 east, 180 north, -90 west
// (three.js rotation.y). w is its width (its own x), d its depth (its own z), h its height.
//
// Classes (CITY_PIECES[kind].cls):
//   'cover'    tall (>= 1.3 m: shelves, fridges, lockers, pod stacks, cabinets, parked cars):
//              stops bodies, robots and rounds.
//   'low'      waist high (< 1.3 m: tables, counters, beds, sofas, chairs, desks): stops
//              bodies and robots; rounds fly over it (playerOnly, as Deadwater's furniture).
//   'walkOver' clutter, the dead, things on the floor or on the walls: no collider.
// A data-made kind (district file) lists its model as parts in its own frame (origin at
// its footprint's centre on the floor, +z its front, y up; `y` is a part's bottom):
//   ['box', x, y, z, w, h, d, colour, opts?]   opts: { glow, rx, ry, rz, fine }
//   ['cyl', x, y, z, r, h, colour, opts?]      opts: { sides (default 8), glow, rx, rz, fine }
//   ['flat', x, y, z, w, d, colour, opts?]     a flat upward quad (stains, mats, papers)
// `glow` (a number, or [r, g, b]) makes that part lit: it glows its own colour times glow
// (render/city-shells.js cityGlow). `fine` puts it in the fine-detail mesh (Balanced up).
// Colours are hex strings; never the team colours (Amber #ffb020, Cyan #2ee6ff, Violet
// #b77bff, nor anything within 15 CIEDE2000 of them); no lettering, pictograms only.
//
// THE RULES (checked by roomProblems below; tests/city-interiors.test.js runs them for
// every building with pieces, and a robot route into every room by every door):
//  - every piece inside its room's walls (the wall's inner face, .19 m in);
//  - every doorway (outer doors and inner doorways) keeps a strip clear inside it: its
//    width plus .3 m each side, 1.5 m deep (DOOR_MARGIN, DOOR_DEPTH);
//  - a 1.3 m walkway (WALKWAY) joins every doorway of a room to the room's centre (to
//    within 1 m: the spawn test walks to each room's centre) and so to every other door; a
//    room too narrow for it even empty (the clinic's 1.5 m hall) needs a robot's body through;
//  - no gap between two solid pieces, or a piece and a wall, is 0.7 m or wider but under
//    1.4 m (GAP_SHUT, GAP_OPEN): bodies jam in a gap near their width;
//  - no pockets: all floor a POCKET_BODY-round body fits on is reached from a door (a
//    POCKET_CELL flood);
//  - no two solid pieces overlap (walk-over clutter may lie on or under what it belongs to).
// Run `node --test tests/city-interiors.test.js`: each failure names the building, the
// room, the rule, the piece's kind and where it stands.
import { buildingOpenings, buildingWalls } from '../map-kit.js';
import { lumenInteriors, lumenKinds } from '../maps/lumen-interiors.js';
import { lazyRecord } from './lazy-record.js';

export const CITY_ROOM_RULES = Object.freeze({
  wall: .19,          // half a wall's thickness (walls are .38 m, centred on the room's outline)
  doorMargin: .3,     // a doorway's clear strip: its width plus this each side...
  doorDepth: 1.5,     // ...this deep in from the wall's line
  walkway: 1.3,       // the walkway's width
  robot: .46,         // a robot's body on its nav grid (RULES.radius .38 + .08): the narrow rooms' walkway
  centreReach: 1.0,   // the walkway comes this close to the room's centre
  gapShut: .7,        // a gap under this is too narrow to enter...
  gapOpen: 1.4,       // ...one this wide or more is a way through; none in between
  pocketBody: .4,     // every spot a body this round (radius) fits on is reached from a door...
  pocketCell: .2,     // ...flooded on a grid this fine
  walkCell: .1,       // the walkway's flood grid
  coverMin: 1.3,      // cover is at least this tall (a sniper round flies at 1.28 m); low is under it
});

// The catalogue: every kind's footprint (w across, d deep), drawn height h and class.
// The models are render/city-interior-models.js CITY_MODELS[kind] (code), or a data-made
// kind's `parts`. Kinds marked `lit` glow somewhere (fridges, screens, pods, fittings).
// Params a model reads are listed after the size.
const K = (w, d, h, cls, extra) => Object.freeze({ w, d, h, cls, ...extra });
const BASE_PIECES = {
  // --- Basic fittings (shared by every building, recoloured and varied) ---
  floor: K(1, 1, .01, 'walkOver', { fill: true, note: "the room's own floor, filling it (give only kind and room): pattern 'tiles' | 'checker' | 'planks' | 'concrete' | 'carpet' | 'plain'; col, col2 (lines, the second tile, the border); size (a tile, m)" }),
  'ceiling-light': K(1.2, .3, 3.4, 'walkOver', { lit: true, note: 'a lit strip fitting hung under the ceiling, a soft pool of its light on the floor under it (pool: false for none); col = its light (cold white default)' }),
  'ceiling-panel': K(.6, .6, 3.45, 'walkOver', { lit: true, note: 'a square lit panel and its pool of light on the floor; col' }),
  'wall-screen': K(1.1, .08, 1.9, 'walkOver', { lit: true, note: 'a screen on a wall (its bottom at 1.2 m): v picks the loop pictogram (0 ad, 1 biohazard, 2 flat line, 3 static, 4 music); col = its glow' }),
  'exit-sign': K(.4, .08, 2.6, 'walkOver', { lit: true, note: 'the running-figure exit pictogram over a door (on a wall)' }),
  extinguisher: K(.22, .22, .7, 'walkOver', { note: 'on its wall bracket; v 1 = lying on the floor' }),
  outlet: K(.14, .04, .45, 'walkOver', { note: 'a wall socket with a cable tail' }),
  'floor-strip': K(1.2, .08, .02, 'walkOver', { lit: true, note: 'a lit emergency strip on the floor; col (red default)' }),
  'neon-tube': K(1.2, .06, 2.4, 'walkOver', { lit: true, note: 'a neon tube along a wall at 2.4 m; col; v 1 = a zigzag' }),
  'cable-run': K(2, .1, .03, 'walkOver', { note: 'cables along the floor' }),
  'stain': K(1, 1, .01, 'walkOver', { note: 'an old dark stain on the floor; col' }),
  litter: K(1, 1, .05, 'walkOver', { note: 'scattered paper, cups and wrappers (seeded); v = how many' }),
  // --- Shared furniture (any building) ---
  'shelf-unit': K(1.2, .45, 1.9, 'cover', { note: 'a steel shelving unit of boxes and stock; v 1 = stripped bare' }),
  'wire-shelf': K(1.2, .4, 1.9, 'cover', { note: 'a wire rack: v 0 medical boxes, 1 stripped (torn boxes), 2 tools' }),
  locker: K(.9, .5, 1.9, 'cover', { note: 'a bank of two lockers; v 1 = one door open' }),
  cabinet: K(1.0, .45, 1.9, 'cover', { note: 'a tall steel cabinet; col' }),
  fridge: K(.8, .7, 1.95, 'cover', { lit: true, note: 'a glass-door drinks fridge lit inside; v 1 = its door open' }),
  'box-stack': K(1.0, .8, 1.4, 'cover', { note: 'cardboard boxes stacked on a pallet' }),
  table: K(1.2, .8, .75, 'low', { note: 'a plain table; col; things on it are its own clutter' }),
  'round-table': K(.8, .8, .75, 'low', { note: 'a small round table' }),
  'high-table': K(.7, .7, 1.05, 'low', { note: 'a bar-height round table with glasses' }),
  chair: K(.45, .45, .85, 'low', { note: 'a moulded chair; col' }),
  stool: K(.4, .4, .75, 'low', { note: 'a bar stool (chrome, padded top)' }),
  sofa: K(1.8, .8, .8, 'low', { note: 'a low sofa; col' }),
  desk: K(1.3, .7, .76, 'low', { lit: true, note: 'a desk with a lit screen; v 1 = a papers desk, no screen' }),
  'office-chair': K(.55, .55, .95, 'low', { note: 'a swivel chair' }),
  counter: K(2, .6, 1.0, 'low', { note: 'a shop counter; col; v 1 = a till on it (open, empty)' }),
  bench: K(1.6, .45, .5, 'low', { note: 'a plain bench' }),
  bed: K(.95, 2.0, .6, 'low', { note: 'a hospital bed (its head at -z, back to the wall with wall: ...); v 1 = torn restraints, sheet dragged' }),
  cot: K(.75, 1.9, .45, 'low', { note: 'a folding cot with a blanket' }),
  sink: K(.9, .5, .9, 'low', { note: 'a sink on a cabinet with a mirror above; v 1 = the mirror cracked, water running' }),
  toilet: K(.45, .7, .8, 'low', { note: 'a toilet' }),
  'toilet-stall': K(1.0, 1.4, 1.9, 'cover', { note: 'a stall with its toilet (open to +z); v 1 = its door hanging' }),
  bin: K(.45, .45, .75, 'low', { note: 'a pedal bin; v 1 = hazard bin, overflowing' }),
  crate: K(.7, .6, .6, 'low', { note: 'a plastic crate' }),
  drum: K(.6, .6, .9, 'low', { note: 'an oil drum; col' }),
  'potted-plant': K(.5, .5, 1.1, 'low', { note: 'a dead plant in a tall pot' }),
  'vending-snacks': K(.9, .8, 1.85, 'cover', { lit: true, note: 'a lit snack machine' }),
  // --- The dead and the lost (walk-over; colliders only where their bed or chair has one) ---
  body: K(.6, 1.8, .35, 'walkOver', { note: 'a civilian or patient: pose "sheet" (on a bed under a sheet, one arm showing), "strapped" (in the surgical chair), "reach" (prone, an arm out to +z), "slump" (sat against a wall, to +z); infected: true (blotches, veins, the port at the neck); look: { skin, hair, cloth, gown: true }' }),
  'dropped-jacket': K(.6, .5, .08, 'walkOver', { note: 'a jacket on the floor; col' }),
  handbag: K(.35, .2, .25, 'walkOver', { note: 'a handbag on its side, things spilling' }),
  phone: K(.08, .16, .02, 'walkOver', { lit: true, note: 'a phone face up, its screen lit (no text)' }),
  masks: K(.6, .5, .02, 'walkOver', { note: 'dropped surgical masks' }),
  'tipped-chair': K(.5, .8, .45, 'walkOver', { note: 'a moulded chair on its back; col' }),
  shoes: K(.5, .3, .1, 'walkOver', { note: 'a pair of slippers or shoes; v = how many pairs in a row; col' }),
  bottles: K(.8, .6, .05, 'walkOver', { note: 'pill bottles scattered; col = their colour' }),
  glasses: K(.6, .4, .12, 'walkOver', { note: 'glasses on the floor, some broken' }),
};

// The south district's own kinds (their models are coded in render/city-interior-models.js).
const SOUTH_PIECES = {
  // laundromat
  washer: K(.7, .7, .95, 'low', { note: 'a front-loading washer; v 1 = door open, wet clothes spilling, 2 = drum lit (spinning)' }),
  'dryer-stack': K(.75, .75, 1.85, 'cover', { note: 'two dryers stacked' }),
  'folding-table': K(1.6, .7, .85, 'low', { note: 'folding table with clothes piles and a basket' }),
  'laundry-cart': K(.6, .9, .9, 'low', { note: 'a wheeled wire cart, a bag of washing' }),
  'change-machine': K(.5, .4, 1.5, 'cover', { lit: true, note: 'a coin changer, lit panel' }),
  'hot-plate': K(.8, .5, .8, 'low', { note: 'a small table with a hot plate, a pot and a kettle' }),
  // clinic
  'reception-desk': K(1.8, .7, 1.05, 'low', { lit: true, note: 'the reception window: counter, a screen looping the biohazard pictogram' }),
  'number-post': K(.3, .3, 1.1, 'low', { lit: true, note: 'the take-a-number post, its lit number block (a glyph)' }),
  'waiting-chairs': K(1.9, .5, .8, 'low', { note: 'a row of four moulded chairs on a beam; v 1 = one knocked off' }),
  'surgical-chair': K(.8, 2.0, 1.0, 'low', { note: 'the reclined surgical chair, straps' }),
  'tool-arms': K(1.2, 1.2, 3.3, 'walkOver', { lit: true, note: 'robotic tool arms hanging from a ceiling ring, frozen mid-reach (no floor footprint)' }),
  'instrument-cart': K(.6, .45, .9, 'low', { note: 'a steel instrument trolley' }),
  'monitor-stand': K(.5, .5, 1.6, 'cover', { lit: true, note: 'a cracked monitor on a pole showing a flat line' }),
  'instrument-tray': K(.9, .7, .05, 'walkOver', { note: 'instruments spilled across the floor, the tray upside down' }),
  'port-dish': K(.3, .3, .06, 'walkOver', { note: 'a steel dish of extracted neck ports' }),
  'surgical-light': K(.9, .9, 3.2, 'walkOver', { lit: true, note: 'a round surgical lamp on its arm (cold blue-white)' }),
  'iv-stand': K(.5, .5, 1.8, 'walkOver', { note: 'an IV stand; v 1 = knocked over, the bag split' }),
  'dragged-sheet': K(.9, 1.6, .04, 'walkOver', { note: 'a sheet dragged across the floor' }),
  'isolation-tent': K(1.3, 2.3, 2.0, 'cover', { note: 'plastic sheeting on a frame round a bed (open to +z)' }),
  'air-scrubber': K(.6, .5, 1.0, 'low', { lit: true, note: 'a portable air scrubber, its light on' }),
  'hazmat-suit': K(.7, 1.3, .3, 'walkOver', { note: 'a slumped empty hazmat suit' }),
  'airlock-plastic': K(1.6, .3, 2.4, 'walkOver', { note: 'torn plastic sheets and ripped hazard tape hanging in a doorway (along its own x)' }),
  'sanitiser': K(.3, .3, .1, 'walkOver', { note: 'a sanitiser station knocked off the wall' }),
  'vial-crate': K(.6, .45, .12, 'walkOver', { note: 'a dropped crate of vials, some rolled out' }),
  scrubs: K(.6, .5, .08, 'walkOver', { note: 'scrubs dumped on the floor' }),
  // pharmacy
  gondola: K(2.4, .9, 1.5, 'cover', { note: 'a double-sided shop shelf of boxes and bottles' }),
  'pharmacy-counter': K(3, .7, 1.05, 'low', { lit: true, note: 'the dispensing counter: a screen, a till, a bag rail' }),
  'dispensary-shelf': K(1.6, .4, 1.9, 'cover', { note: 'medicine shelves; v 1 = the stripped one (one colour gone); col = the stripped medicine' }),
  'cage-gate': K(1.2, .1, 2.2, 'walkOver', { note: 'the dispensary cage gate forced open against the wall' }),
  'pill-counter': K(1.4, .6, .9, 'low', { note: 'a work counter, pill trays, a label printer' }),
  // garage and workshop
  'car-lift': K(2.8, 5, 2.2, 'cover', { note: 'a two-post lift with a car half raised' }),
  'tyre-stack': K(.7, .7, 1.0, 'low', { note: 'tyres stacked; v = how many (1-4)' }),
  'diagnostic-cart': K(.7, .55, 1.45, 'cover', { lit: true, note: 'a wheeled diagnostic station, its screen scrolling' }),
  'wall-charger': K(.6, .35, 1.6, 'cover', { lit: true, note: 'a charger unit on the wall, its lamp lit' }),
  'charge-cable': K(1.6, 1.2, .05, 'walkOver', { note: 'a charging cable coiled across the floor' }),
  workbench: K(2, .8, .9, 'low', { note: 'a steel workbench, a vice, tools; v 1 = paint tins, 2 = electronics' }),
  'engine-block': K(1.1, .9, .85, 'low', { note: 'an electric drive unit on a pallet' }),
  'parts-shelf': K(1.6, .5, 1.9, 'cover', { note: 'heavy racking of boxed parts' }),
  'welding-station': K(1.8, .9, 1.0, 'low', { lit: true, note: 'a welding bench, welder unit, gas bottles, the work glowing' }),
  'sheet-rack': K(2.2, .6, 1.8, 'cover', { note: 'a rack of standing metal sheets' }),
  'cut-sheets': K(1.6, 1.2, .06, 'walkOver', { note: 'cut sheet metal on the floor' }),
  'drill-press': K(.6, .6, 1.7, 'cover', { note: 'a pillar drill' }),
  'paint-stand': K(1.8, .6, 1.6, 'cover', { note: 'a half-painted panel on a stand' }),
  'paint-extractor': K(1.6, .5, 2.2, 'cover', { note: 'the paint booth extractor wall (filters)' }),
  respirator: K(.3, .3, .1, 'walkOver', { note: 'a dropped respirator' }),
  'tool-cabinet': K(1.2, .5, 1.4, 'cover', { note: 'a roller tool cabinet with a pegboard top' }),
  // parking
  'micro-car': K(1.6, 3.1, 1.45, 'cover', { lit: true, note: 'a small city car parked (nose to +z); col; v 1 = its alarm light blinking' }),
  motorbike: K(.7, 2.0, 1.0, 'low', { note: 'a motorbike on its stand' }),
  pillar: K(.5, .5, 3.6, 'cover', { note: 'a concrete pillar with hazard stripes' }),
  'barrier-post': K(.5, .4, 1.1, 'low', { lit: true, note: 'a barrier arm post; its arm snapped (see barrier-arm)' }),
  'barrier-arm': K(2.6, .2, .12, 'walkOver', { note: 'the snapped striped arm on the floor' }),
  'ticket-desk': K(1.4, .6, 1.0, 'low', { lit: true, note: 'the booth desk: screens, a radio' }),
  'pay-machine': K(.5, .4, 1.5, 'cover', { lit: true, note: 'a parking pay station, its screen lit' }),
  'bay-lines': K(2.2, 4.8, .01, 'walkOver', { note: 'a parking bay painted on the floor (worn lines, a pictogram); w, d' }),
  'wheel-stop': K(1.4, .2, .1, 'walkOver', { note: 'a concrete wheel stop' }),
  cone: K(.4, .4, .6, 'walkOver', { note: 'a traffic cone; v 1 = knocked over' }),
  'alarm-light': K(.2, .12, 2.5, 'walkOver', { lit: true, note: 'a red alarm beacon on a wall' }),
  'scooter-heap': K(1.2, .8, .6, 'walkOver', { note: 'e-scooters dropped in a heap' }),
  // charging office
  'snack-shelf': K(1.6, .5, 1.4, 'cover', { note: 'snacks and cables for sale' }),
  'coffee-counter': K(1.4, .6, 1.0, 'low', { note: 'a counter with a coffee machine dripping' }),
  // club
  'dance-tiles': K(6, 6, .03, 'walkOver', { lit: true, note: 'a floor of lit tiles (glowing squares); w, d' }),
  'light-rig': K(4, 4, 3.3, 'walkOver', { lit: true, note: 'a square lighting truss hung over a dance floor, coloured spots on it; w, d' }),
  'speaker-stack': K(1.0, .8, 1.8, 'cover', { note: 'a stack of big speakers' }),
  'bar-counter': K(3, .7, 1.1, 'low', { lit: true, note: 'a bar counter, lit front strip, bottles and glasses on top' }),
  'back-bar': K(2.4, .45, 2.0, 'cover', { lit: true, note: 'lit shelves of bottles behind a bar' }),
  'vip-booth': K(2.2, 1.6, .95, 'low', { note: 'a U-shaped padded booth round a table (open to +z); col' }),
  'dj-desk': K(2.0, .8, 1.1, 'low', { lit: true, note: 'the DJ desk: decks, mixer, lit controls, a laptop' }),
  'velvet-rope': K(2.4, .4, .9, 'walkOver', { note: 'stanchions knocked over, the rope down' }),
  'cloak-counter': K(2.4, .6, 1.05, 'low', { note: 'the cloakroom counter, a rail of coats behind' }),
  'coat-rail': K(1.8, .5, 1.7, 'cover', { note: 'a rail of left coats' }),
  // bar
  'pool-table': K(1.3, 2.4, .85, 'low', { note: 'a pool table, balls mid-game, a cue across it' }),
  jukebox: K(.8, .55, 1.5, 'cover', { lit: true, note: 'a lit jukebox (music playing)' }),
  booth: K(1.6, 1.4, 1.0, 'low', { note: 'a two-bench booth with its table (along its own x)' }),
  'cue-rack': K(.8, .08, 1.6, 'walkOver', { note: 'cues on a wall rack' }),
  // capsule hotel
  'capsule-pods': K(1.05, 2.0, 2.2, 'cover', { lit: true, note: 'two capsules stacked, open end to +z, pink-lit; v 1 = the lower curtain half open with a bag inside' }),
  'side-pods': K(1.9, .84, 2.1, 'cover', { lit: true, note: 'sleeper pods stacked two high, lengthwise along a wall (w), open along their front (+z) under curtains' }),
  'shoe-lockers': K(1.6, .4, 1.4, 'cover', { note: 'a wall of small shoe lockers' }),
  'shower-stall': K(.9, .9, 2.0, 'cover', { note: 'a shower cubicle' }),
  // karaoke
  'karaoke-sofa': K(2.2, .75, .8, 'low', { note: 'a karaoke room sofa (L if v 1); col' }),
  'karaoke-table': K(1.0, .5, .45, 'low', { note: 'a low table: drinks, a songbook tablet (lit), a mic; v 1 = tipped drinks' }),
  mic: K(.3, .1, .05, 'walkOver', { note: 'a dropped microphone' }),
  'jammed-door': K(.9, .1, 2.1, 'walkOver', { note: 'a door leaf jammed open against the wall' }),
};

// The whole catalogue: the kinds above and the district files' data-made kinds.
// Made on first use (the district files are built then, not when maps.js is
// imported: maps/lumen-interiors.js), so this is a lazy read-only record.
export const CITY_PIECES = lazyRecord(() => Object.freeze({ ...BASE_PIECES, ...SOUTH_PIECES, ...Object.fromEntries(Object.entries(lumenKinds()).map(([k, v]) => [k, Object.freeze({ ...v })])) }));
export const CITY_CLASSES = Object.freeze(['cover', 'low', 'walkOver']);

// --- Resolving a building's list -------------------------------------------
const WALL_DEG = { n: 0, s: 180, e: -90, w: 90 };
const resolved = new Map(); // building id -> the resolved pieces (rooms are fixed per map)

// A building's pieces with their rooms, world positions, sizes and footprints.
// `rooms` are the building's map.buildings entries (world/city-rooms.js).
export function cityPieces(buildingId, rooms) {
  const list = lumenInteriors()[buildingId];
  if (!list?.length || !rooms?.length) return [];
  const key = buildingId + '|' + rooms.map(r => r.id).join();
  let out = resolved.get(key);
  if (out) return out;
  const byId = new Map(rooms.map(r => [r.room, r]));
  // (A building of another map with the same id: its rooms are not these.)
  if (list.some(p => p.room && !byId.has(p.room))) { resolved.set(key, []); return []; }
  out = list.map((p, index) => resolvePiece(buildingId, p, index, byId, rooms));
  resolved.set(key, out);
  return out;
}

function resolvePiece(buildingId, p, index, byId, rooms) {
  const spec = CITY_PIECES[p.kind];
  if (!spec) throw new Error(`city interiors: ${buildingId} piece ${index} is an unknown kind '${p.kind}'`);
  let w = p.w ?? spec.w, d = p.d ?? spec.d, h = p.h ?? spec.h;
  let x = p.x, z = p.z, deg = p.deg ?? 0, room = p.room ? byId.get(p.room) : null;
  if (spec.fill) {
    // (A room's floor: it fills the room to its walls' inner faces.)
    if (!room) throw new Error(`city interiors: ${buildingId} ${p.kind}: a floor needs its room`);
    const inner = insetPoly(roomPoly(room), CITY_ROOM_RULES.wall), xs = inner.map(q => q[0]), zs = inner.map(q => q[1]);
    x = (Math.min(...xs) + Math.max(...xs)) / 2; z = (Math.min(...zs) + Math.max(...zs)) / 2; w = Math.max(...xs) - Math.min(...xs); d = Math.max(...zs) - Math.min(...zs); deg = 0;
  }
  if (p.wall) {
    if (!room || room.quad) throw new Error(`city interiors: ${buildingId} ${p.kind}: a wall piece needs its rect room`);
    // (An extra quarter turn, `deg: 90` or `-90`, stands it side-on to the
    // wall: its w is then its depth from the wall, e.g. a bed along a wall.)
    const W = CITY_ROOM_RULES.wall, off = p.off ?? .02, x0 = room.x - room.w / 2, x1 = room.x + room.w / 2, z0 = room.z - room.d / 2, z1 = room.z + room.d / 2;
    deg = WALL_DEG[p.wall] + (p.deg ?? 0);
    const depth = Math.abs(Math.sin((p.deg ?? 0) * Math.PI / 180)) > .5 ? w : d;
    if (p.wall === 'n') { x = p.at; z = z0 + W + off + depth / 2; }
    else if (p.wall === 's') { x = p.at; z = z1 - W - off - depth / 2; }
    else if (p.wall === 'w') { z = p.at; x = x0 + W + off + depth / 2; }
    else if (p.wall === 'e') { z = p.at; x = x1 - W - off - depth / 2; }
    else throw new Error(`city interiors: ${buildingId} ${p.kind}: wall '${p.wall}'?`);
  }
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error(`city interiors: ${buildingId} ${p.kind}: no position`);
  if (!room) room = rooms.find(r => roomHas(r, x, z));
  if (!room) throw new Error(`city interiors: ${buildingId} ${p.kind} at ${x}, ${z} is in none of its rooms`);
  const angle = deg * Math.PI / 180, inner = insetPoly(roomPoly(room), CITY_ROOM_RULES.wall);
  return { index, kind: p.kind, cls: spec.cls, room: room.id, roomId: room.room, x, z, deg, angle, w, d, h, spec, params: p, inner,
    poly: spec.fill ? inner.map(q => [q[0], q[1]]) : boxPoly(x, z, w, d, angle) };
}

// A piece's footprint corners (world), turned by `angle` (rotation.y: a local
// (lx, lz) lands at x + lx cos + lz sin, z - lx sin + lz cos).
export function boxPoly(x, z, w, d, angle) {
  const c = Math.cos(angle), s = Math.sin(angle), hw = w / 2, hd = d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]);
}

// A convex outline moved in by `by` (each edge along its inward normal).
export function insetPoly(poly, by) {
  const n = poly.length, cx = poly.reduce((s, p) => s + p[0], 0) / n, cz = poly.reduce((s, p) => s + p[1], 0) / n, lines = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % n], l = Math.hypot(bx - ax, bz - az);
    let nx = -(bz - az) / l, nz = (bx - ax) / l; if ((cx - ax) * nx + (cz - az) * nz < 0) { nx = -nx; nz = -nz; }
    lines.push([ax + nx * by, az + nz * by, (bx - ax) / l, (bz - az) / l]);
  }
  return lines.map((L, i) => {
    const M = lines[(i + n - 1) % n], det = L[2] * M[3] - L[3] * M[2];
    if (Math.abs(det) < 1e-9) return [L[0], L[1]];
    const t = ((M[0] - L[0]) * M[3] - (M[1] - L[1]) * M[2]) / det;
    return [L[0] + L[2] * t, L[1] + L[3] * t];
  });
}

const roomHas = (r, x, z) => {
  const poly = roomPoly(r);
  return pointInConvex(poly, x, z, 0);
};
export const roomPoly = r => r.quad ? r.quad.map(p => [p[0], p[1]]) : [[r.x - r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z + r.d / 2], [r.x - r.w / 2, r.z + r.d / 2]];

// --- The colliders (map-kit.js mapColliders, via interiorCover) -------------
// A room's solid pieces in the room's own frame (its centre; rooms are never
// turned). A piece turned by a quarter turn swaps its w and d; any other turn
// is given as its box round the turned footprint (w, d) plus `angle`, `localW`
// and `localD` (the collider the lead's map-kit hook makes exact).
const covers = new WeakMap();
export function cityRoomCover(room) {
  let out = covers.get(room);
  if (out) return out;
  const siblings = room.siblings ? [...room.siblings.values()] : [room];
  out = cityPieces(room.group, siblings).filter(p => p.room === room.id && p.cls !== 'walkOver').map(p => {
    const quarter = Math.round(p.deg / 90), square = Math.abs(p.deg - quarter * 90) < 1e-6, swap = square && (quarter & 1);
    const piece = { kind: p.kind, x: p.x - room.x, z: p.z - room.z, w: swap ? p.d : p.w, d: swap ? p.w : p.d, h: p.h, cover: p.cls === 'cover', city: true };
    if (!square) {
      const c = Math.abs(Math.cos(p.angle)), s = Math.abs(Math.sin(p.angle));
      Object.assign(piece, { w: p.w * c + p.d * s, d: p.w * s + p.d * c, angle: p.angle, localW: p.w, localD: p.d });
    }
    return piece;
  });
  covers.set(room, out);
  return out;
}

// --- The rules -------------------------------------------------------------
// Convex polygon helpers (points [x, z]).
function pointInConvex(poly, x, z, inset) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    const cross = (bx - ax) * (z - az) - (bz - az) * (x - ax);
    if (!sign) sign = Math.sign((bx - ax) * (poly[(i + 2) % poly.length][1] - az) - (bz - az) * (poly[(i + 2) % poly.length][0] - ax));
    const dist = cross * sign / Math.hypot(bx - ax, bz - az);
    if (dist < inset - 1e-9) return false;
  }
  return true;
}
function segDist(px, pz, ax, az, bx, bz, near) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-12;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  if (near) { near[0] = ax + dx * t; near[1] = az + dz * t; }
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
// Do two convex polygons overlap by more than `eps` (separating axes)?
export function polysOverlap(p, q, eps = .005) {
  for (const poly of [p, q]) for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], l = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / l, nz = (bx - ax) / l;
    let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
    for (const [x, z] of p) { const v = x * nx + z * nz; p0 = Math.min(p0, v); p1 = Math.max(p1, v); }
    for (const [x, z] of q) { const v = x * nx + z * nz; q0 = Math.min(q0, v); q1 = Math.max(q1, v); }
    if (p1 <= q0 + eps || q1 <= p0 + eps) return false;
  }
  return true;
}
// The distance between two convex polygons (0 when they touch or overlap);
// `pair`, if given, gets the two nearest points [x0, z0, x1, z1].
export function polyDistance(p, q, pair) {
  if (polysOverlap(p, q, -1e-9)) return 0;
  let best = Infinity; const near = [0, 0];
  for (const [a, b] of [[p, q], [q, p]]) for (const [x, z] of a) for (let i = 0; i < b.length; i++) {
    const [ax, az] = b[i], [bx, bz] = b[(i + 1) % b.length], d = segDist(x, z, ax, az, bx, bz, near);
    if (d < best) { best = d; if (pair) { pair[0] = x; pair[1] = z; pair[2] = near[0]; pair[3] = near[1]; } }
  }
  return best;
}
// Is the gap between the nearest points of two footprints narrowed by a
// third (a piece or a wall standing in or beside it: nearer its middle than
// half the gap)? Then the body-wide slot is not there to jam in.
function gapFilled(pair, others) {
  const x = (pair[0] + pair[2]) / 2, z = (pair[1] + pair[3]) / 2, half = Math.hypot(pair[2] - pair[0], pair[3] - pair[1]) / 2 - .02;
  return others.some(o => pointPolyDistance(o, x, z) < half);
}
// Distance from a point to a convex polygon (0 inside).
function pointPolyDistance(poly, x, z) {
  if (pointInConvex(poly, x, z, 0)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) { const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length]; best = Math.min(best, segDist(x, z, ax, az, bx, bz)); }
  return best;
}
const colliderPoly = c => boxPoly(c.x, c.z, c.localW ?? c.w, c.localD ?? c.d, c.localW !== undefined ? (c.angle || 0) : 0);

// Each doorway of a room: its middle on the wall line, the wall's direction
// (u) and the way in (n), its width, the clear strip inside it.
export function roomDoorways(room) {
  const poly = roomPoly(room), cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const R = CITY_ROOM_RULES;
  return buildingOpenings(room).map(o => {
    const mx = (o.a.x + o.b.x) / 2, mz = (o.a.z + o.b.z) / 2, l = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z) || 1, ux = (o.b.x - o.a.x) / l, uz = (o.b.z - o.a.z) / l;
    let nx = -uz, nz = ux; if ((cx - mx) * nx + (cz - mz) * nz < 0) { nx = -nx; nz = -nz; }
    const half = o.width / 2 + R.doorMargin, depth = R.doorDepth;
    const strip = [[mx - ux * half, mz - uz * half], [mx + ux * half, mz + uz * half], [mx + ux * half + nx * depth, mz + uz * half + nz * depth], [mx - ux * half + nx * depth, mz - uz * half + nz * depth]];
    return { mx, mz, ux, uz, nx, nz, width: o.width, outer: !!o.outer, into: o.into, strip };
  });
}

// A flood over the room's floor for a round body of radius r: which cells it
// can stand on (inside the walls' faces, clear of the solid footprints), and
// which of them it reaches from the given starts.
function floorGrid(room, solids, r, cell) {
  const poly = roomPoly(room), R = CITY_ROOM_RULES;
  const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]), x0 = Math.min(...xs), z0 = Math.min(...zs);
  const cols = Math.ceil((Math.max(...xs) - x0) / cell), rows = Math.ceil((Math.max(...zs) - z0) / cell);
  const free = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = x0 + (i + .5) * cell, z = z0 + (j + .5) * cell;
    if (!pointInConvex(poly, x, z, R.wall + r)) continue;
    if (solids.some(s => pointPolyDistance(s, x, z) < r)) continue;
    free[j * cols + i] = 1;
  }
  const at = (x, z) => { const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell); return i < 0 || j < 0 || i >= cols || j >= rows ? -1 : j * cols + i; };
  const centre = k => [x0 + (k % cols + .5) * cell, z0 + (Math.floor(k / cols) + .5) * cell];
  function flood(starts) {
    const seen = new Uint8Array(cols * rows), queue = [];
    for (const k of starts) if (k >= 0 && free[k] && !seen[k]) { seen[k] = 1; queue.push(k); }
    while (queue.length) {
      const k = queue.pop(), i = k % cols, j = (k / cols) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
        const n = jj * cols + ii; if (!free[n] || seen[n]) continue;
        if (di && dj && (!free[j * cols + ii] || !free[jj * cols + i])) continue;
        seen[n] = 1; queue.push(n);
      }
    }
    return seen;
  }
  // The free cell nearest a point (within `reach`), or -1.
  function near(x, z, reach) {
    let best = -1, bd = reach;
    const k0 = at(x, z); if (k0 >= 0 && free[k0]) return k0;
    const n = Math.ceil(reach / cell), i0 = Math.floor((x - x0) / cell), j0 = Math.floor((z - z0) / cell);
    for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
      const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= cols || j >= rows || !free[j * cols + i]) continue;
      const [cx, cz] = centre(j * cols + i), d = Math.hypot(cx - x, cz - z); if (d <= bd) { bd = d; best = j * cols + i; }
    }
    return best;
  }
  return { free, flood, at, near, centre, cols, rows };
}

// Everything wrong with one room's pieces: [] when it keeps every rule.
// `pieces` are the building's resolved pieces (cityPieces).
export function roomProblems(room, pieces) {
  const R = CITY_ROOM_RULES, out = [], mine = pieces.filter(p => p.room === room.id), solid = mine.filter(p => p.cls !== 'walkOver');
  const name = p => `${p.kind}#${p.index} at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`;
  const poly = roomPoly(room), doors = roomDoorways(room);
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  for (const p of mine) {
    if (!p.poly.every(([x, z]) => pointInConvex(poly, x, z, R.wall - .001))) out.push(`${name(p)} pokes through the wall`);
    if (p.cls === 'cover' && p.h < R.coverMin) out.push(`${name(p)} is cover under ${R.coverMin} m`);
    if (p.cls === 'low' && p.h >= R.coverMin) out.push(`${name(p)} is low but ${p.h} m tall`);
  }
  for (const p of solid) for (const d of doors) if (polysOverlap(p.poly, d.strip)) out.push(`${name(p)} stands in the ${d.outer ? 'door' : 'doorway to ' + d.into} at ${d.mx.toFixed(2)}, ${d.mz.toFixed(2)}`);
  // Gaps: between two pieces, or a piece and a wall, where nothing else
  // stands in between.
  const walls = buildingWalls(room).map(colliderPoly), pair = [0, 0, 0, 0];
  const bad = g => g >= R.gapShut - 1e-6 && g < R.gapOpen - 1e-6;
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
    const a = solid[i], b = solid[j];
    if (polysOverlap(a.poly, b.poly)) { out.push(`${name(a)} overlaps ${name(b)}`); continue; }
    const g = polyDistance(a.poly, b.poly, pair);
    if (bad(g) && !gapFilled(pair, [...solid.filter(q => q !== a && q !== b).map(q => q.poly), ...walls])) out.push(`${name(a)} and ${name(b)}: a ${g.toFixed(2)} m gap`);
  }
  for (const p of solid) for (const w of walls) {
    const g = polyDistance(p.poly, w, pair);
    if (bad(g) && !gapFilled(pair, [...solid.filter(q => q !== p).map(q => q.poly), ...walls.filter(q => q !== w)])) { out.push(`${name(p)}: a ${g.toFixed(2)} m gap to the wall`); break; }
  }
  // The walkway: a 1.3 m body (or, where the empty room cannot carry one, a
  // robot's) from every doorway to the centre and so to every other doorway.
  const polys = solid.map(p => p.poly);
  for (const r of [R.walkway / 2, R.robot]) {
    const empty = floorGrid(room, [], r, R.walkCell), full = floorGrid(room, polys, r, R.walkCell);
    const startOf = (g, d) => g.near(d.mx + d.nx * (R.wall + r + .02), d.mz + d.nz * (R.wall + r + .02), .3);
    // Which doorways and the centre the empty room joins with this body, and
    // are they still joined with the furniture in?
    const eStarts = doors.map(d => startOf(empty, d)), eCentre = empty.near(cx, cz, R.centreReach);
    if (eStarts.some(k => k < 0) || eCentre < 0) continue; // (too narrow for this body even empty: the next, smaller)
    const eSeen = empty.flood([eStarts[0]]);
    if (!eStarts.every(k => eSeen[k]) || !eSeen[eCentre]) continue;
    const starts = doors.map(d => startOf(full, d));
    doors.forEach((d, i) => { if (starts[i] < 0) out.push(`the ${d.outer ? 'door' : 'doorway to ' + d.into} at ${d.mx.toFixed(2)}, ${d.mz.toFixed(2)} has no ${(2 * r).toFixed(2)} m walkway in`); });
    if (starts.some(k => k < 0)) break;
    const seen = full.flood([starts[0]]), centre = full.near(cx, cz, R.centreReach);
    if (centre < 0 || !seen[centre]) out.push(`no ${(2 * r).toFixed(2)} m walkway reaches the room's centre`);
    doors.forEach((d, i) => { if (!seen[starts[i]]) out.push(`no ${(2 * r).toFixed(2)} m walkway joins the ${d.outer ? 'door' : 'doorway to ' + d.into} at ${d.mx.toFixed(2)}, ${d.mz.toFixed(2)}`); });
    break;
  }
  // No pockets: all the floor a body fits on is reached from the doorways.
  const floor = floorGrid(room, polys, R.pocketBody, R.pocketCell);
  const seen = floor.flood(doors.map(d => floor.near(d.mx + d.nx * (R.wall + R.pocketBody + .02), d.mz + d.nz * (R.wall + R.pocketBody + .02), .4)));
  let lost = 0, where = null;
  for (let k = 0; k < floor.free.length; k++) if (floor.free[k] && !seen[k]) { lost++; where ||= floor.centre(k); }
  if (lost) out.push(`${lost} cells of floor a body fits on are cut off (first at ${where[0].toFixed(2)}, ${where[1].toFixed(2)})`);
  return out.map(s => `${room.id}: ${s}`);
}
