// Lumen's interiors, the east district (stage 4; design 5 rows 10-13 and
// 25-28, the bus and the checkpoint booth, 5c's clues, 6's civilian rules,
// 18b): the hotel, the cyberware showroom, the luxury tower, the corporate
// tower, the checkpoint booth, the flatiron electronics mall, the pachinko
// tower, the body-mod tower, the metro entrance and the bus. Every piece is
// data (the format and the base kinds: world/city-interiors.js's header); the
// rules are checked by tests/city-interiors.test.js. Rooms and doors:
// maps/lumen-buildings-east.js. World coordinates: x east, z south.
//
// Each building tells how it was left (design 5): the hotel's drinks still
// poured and the bags tagged and waiting; the luxury lobby's toppled luggage
// cart, the dead guest behind it, the lifts open on dark shafts; the corporate
// turnstiles blinking open and the presentation looping to empty chairs; the
// showroom's recalled port taped off on its plinth with the returned boxes
// piled by the counter (the clue); the flatiron's booths lit with nobody at the
// counters; the pachinko rows flashing over spilled balls; the one tattoo
// machine left running; the metro's shutter half down over the stairs with the
// crowd's belongings piled at the gates, the tally marks, and the one who
// reached under it; the checkpoint's booth left lit with its shield dropped.
//
// Nearly every kind here is data-made (EAST_KINDS, below the placements):
// its model is a list of parts in its own frame, made once (on first use: eastDistrict at the bottom) by the
// small builders at the bottom of this file. Only the basic fittings and the
// shared furniture (floors, ceiling lights and panels, screens, exit signs,
// extinguishers, stains, sofas, desks, office chairs, cabinets, shelves, the
// dead) come from world/city-interiors.js.

// --- Light colours (never a team colour: no amber, cyan or violet) ----------
const WARM = '#ffd9a8', COLD = '#e2eeff', ROSE = '#ff5a8c', RED = '#ff2a3a', LEMON = '#fcee0a';
const GREEN = '#6aff5a', BLUE = '#3d62ff', MAGENTA = '#ff2a66', PALE = '#cfe0ff', MINT = '#b8f0c8';
const DRY = '#2a1c1c'; // old blood, darkened by the days since (design 6: never fresh)

// A room's own floor (world/city-interiors.js 'floor': it fills the room).
const F = (room, pattern, col, col2, size) => ({ kind: 'floor', room, pattern, col, ...(col2 && { col2 }), ...(size && { size }) });

// A piece with its back to a quad room's edge (the kinds' `wall` placement
// takes rect rooms only). `edge` is [[ax, az], [bx, bz]] (the edge's two
// corners, from the building file), `at` metres along it from a, `depth` the
// piece's depth (its d, or its w when turned side-on by `side`: 90 / -90),
// `inward` the side the room is on (+1: to the edge's left looking from a to b
// in x-east z-south, i.e. the normal (az - bz, bx - ax)), `off` metres off the
// wall's inner face (.19 in from the edge's line).
function onEdge(kind, room, [[ax, az], [bx, bz]], at, depth, inward = 1, extra = {}) {
  const l = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / l, uz = (bz - az) / l;
  const nx = (az - bz) / l * inward, nz = (bx - ax) / l * inward, off = extra.off ?? .02;
  const inset = .19 + off + depth / 2, deg = Math.atan2(nx, nz) * 180 / Math.PI + (extra.side ?? 0);
  const { side, off: _o, ...rest } = extra;
  return { kind, room, x: +(ax + ux * at + nx * inset).toFixed(3), z: +(az + uz * at + nz * inset).toFixed(3), deg: +deg.toFixed(3), ...rest };
}
// A point `along` metres from a and `across` metres in from an edge (for
// free-standing pieces laid out along a slanted wall), and the edge's turn.
function edgePoint([[ax, az], [bx, bz]], along, across, inward = 1) {
  const l = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / l, uz = (bz - az) / l, nx = (az - bz) / l * inward, nz = (bx - ax) / l * inward;
  return { x: +(ax + ux * along + nx * across).toFixed(3), z: +(az + uz * along + nz * across).toFixed(3), deg: +(Math.atan2(nx, nz) * 180 / Math.PI).toFixed(3) };
}

// The civilian dead (design 6): everyday clothes in muted colours, bare
// arms, visible hair, no hats or long coats, never a team colour.
const GUEST = { skin: '#c08f6c', hair: '#1f1a17', cloth: '#6a6258', legs: '#2f3440', long: true };

// The slanted walls this district furnishes along (their corners, from maps/lumen-buildings-east.js).
const SHOW_FRONT = [[24.5, -10.5], [14, -16.2]], SHOW_EAST = [[24.5, -20], [24.5, -10.5]];
const PROW_N = [[34.94, 10.5], [38.5, 10.5]], PROW_CUT = [[38.5, 20.6], [33.02, 15.12]];
const WEDGE_SE = [[60, 30], [53.95, 36.05]], WEDGE_CUT = [[53.95, 36.05], [44, 26.1]];
const BUS_N = [[46.2, 1.15], [58, 3.66]], BUS_S = [[57.46, 6.2], [45.66, 3.69]], BUS_REAR = [[45.66, 3.69], [46.2, 1.15]];

// This district's data is made on first use, not when the module loads (see
// lumen-interiors-south.js): eastDistrict() at the bottom.
function buildInteriors() {
  return {
    // ------------------------------------------------------------------ hotel
    hotel: [
      F('lobby', 'checker', '#bdb5a7', '#8f877b', .8), F('bar', 'planks', '#4e3a2c', '#3e2e23', .18), F('corridor', 'carpet', '#5a2230', '#3a1620'),
      F('luggage', 'concrete', '#6a6660', '#5a5650'), F('kitchen', 'tiles', '#9aa0a2', '#7d8386', .3),
      // Lobby: the front desk facing the Avenue door (its key wall behind it), a seating
      // group under the chandelier, a brass bell cart parked by the desk with a guest's bags
      // still on it, a console of dead flowers; a keycard and a phone dropped on the way out.
      { kind: 'hotel-desk', room: 'lobby', x: 22.46, z: -31, deg: -90 },
      { kind: 'key-wall', room: 'lobby', wall: 'e', at: -31 },
      { kind: 'lobby-sofa', room: 'lobby', wall: 's', at: 15.12 },
      { kind: 'stone-table', room: 'lobby', x: 15.12, z: -27.9 },
      { kind: 'lobby-armchair', room: 'lobby', x: 16.15, z: -27.9, deg: -90 },
      { kind: 'bell-cart', room: 'lobby', wall: 's', at: 23.5 },
      { kind: 'flower-console', room: 'lobby', wall: 's', at: 20.3 },
      { kind: 'lobby-plant', room: 'lobby', x: 14.47, z: -35.52 },
      { kind: 'lobby-rug', room: 'lobby', x: 15.8, z: -27.6 },
      { kind: 'chandelier', room: 'lobby', x: 19.25, z: -31 },
      { kind: 'ceiling-panel', room: 'lobby', x: 19.2, z: -28.2, col: WARM, pool: false },
      { kind: 'ceiling-panel', room: 'lobby', x: 19.2, z: -33.8, col: WARM, pool: false },
      { kind: 'ceiling-light', room: 'lobby', x: 23.3, z: -31, deg: 90, col: WARM, pool: false },
      { kind: 'wall-screen', room: 'lobby', wall: 'w', at: -34.2, v: 0, col: ROSE, w: .9 },
      { kind: 'exit-sign', room: 'lobby', wall: 'w', at: -31 },
      { kind: 'keycard', room: 'lobby', x: 17.1, z: -30.4, deg: 25 },
      { kind: 'phone', room: 'lobby', x: 16.4, z: -31.9, deg: -40 },
      { kind: 'extinguisher', room: 'lobby', wall: 'n', at: 14.8 },
      // The bar: the long counter with the drinks still poured and the back bar lit, six
      // stools (a jacket left on one), two banquette corners, warm pendants.
      { kind: 'back-bar-hotel', room: 'bar', wall: 'e', at: -41.1 },
      { kind: 'hotel-bar', room: 'bar', x: 17.96, z: -41.1, deg: -90 },
      ...[-43.4, -42.5, -41.6, -39.8, -38.9].map(z => ({ kind: 'hotel-stool', room: 'bar', x: 17.2, z, deg: -90 })),
      { kind: 'stool-jacket', room: 'bar', x: 17.2, z: -40.7, deg: -90 },
      { kind: 'banquette', room: 'bar', wall: 'w', at: -44.2 },
      { kind: 'cocktail-table', room: 'bar', x: 15.1, z: -44.2 },
      { kind: 'banquette', room: 'bar', wall: 'w', at: -38.1 },
      { kind: 'cocktail-table', room: 'bar', x: 15.1, z: -38.1, v: 1 },
      { kind: 'pendant', room: 'bar', x: 17.9, z: -43.2 },
      { kind: 'pendant', room: 'bar', x: 17.9, z: -41.1 },
      { kind: 'pendant', room: 'bar', x: 17.9, z: -39.0 },
      { kind: 'ceiling-panel', room: 'bar', x: 15.6, z: -41, col: WARM, pool: false },
      { kind: 'neon-tube', room: 'bar', wall: 'w', at: -41, col: ROSE, w: 1.6, h: 2.7 },
      { kind: 'stain', room: 'bar', x: 16.5, z: -42.1, w: .5, d: .4, col: '#3a2418' },
      { kind: 'exit-sign', room: 'bar', wall: 'w', at: -42.4 },
      // The corridor to the kitchen: a room-service tray dropped, sconces, a fire point.
      { kind: 'sconce', room: 'corridor', wall: 'w', at: -38.5 },
      { kind: 'sconce', room: 'corridor', wall: 'e', at: -41 },
      { kind: 'sconce', room: 'corridor', wall: 'w', at: -43.5 },
      { kind: 'dropped-tray', room: 'corridor', x: 20.6, z: -42.1, deg: 20 },
      { kind: 'wall-art', room: 'corridor', wall: 'e', at: -38.2 },
      { kind: 'extinguisher', room: 'corridor', wall: 'e', at: -44.6 },
      { kind: 'ceiling-panel', room: 'corridor', x: 20.5, z: -40, col: WARM },
      { kind: 'ceiling-panel', room: 'corridor', x: 20.5, z: -43, col: WARM, pool: false },
      // The luggage room: racks of tagged cases waiting to be collected, a garment rail of
      // bagged suits, the tagging desk, a few cases set down on the floor.
      { kind: 'luggage-rack', room: 'luggage', wall: 'e', at: -44.59 },
      { kind: 'luggage-rack-b', room: 'luggage', wall: 'e', at: -42.14 },
      { kind: 'luggage-rack', room: 'luggage', wall: 'e', at: -39.69 },
      { kind: 'garment-rail', room: 'luggage', wall: 'w', at: -44.9 },
      { kind: 'tag-desk', room: 'luggage', wall: 'w', at: -40.5 },
      { kind: 'cases-down', room: 'luggage', x: 22.8, z: -42.6, deg: 15 },
      { kind: 'cases-down', room: 'luggage', x: 23.1, z: -37.9, deg: -70 },
      { kind: 'ceiling-panel', room: 'luggage', x: 23, z: -40.5, col: COLD },
      { kind: 'ceiling-panel', room: 'luggage', x: 23, z: -44, col: COLD, pool: false },
      // Kitchen: the line along the north wall (fridge, range under its hood with the pans
      // left on, counters, the combi ovens, the pot sink), a dry store and a speed rack,
      // the prep island mid-job, a pot dropped by the door, the heat lamps still on.
      { kind: 'kitchen-fridge', room: 'kitchen', x: 14.91, z: -52.44 },
      { kind: 'kitchen-range', room: 'kitchen', x: 16.51, z: -52.44 },
      { kind: 'steel-counter', room: 'kitchen', x: 18.41, z: -52.44 },
      { kind: 'combi-ovens', room: 'kitchen', x: 19.86, z: -52.44 },
      { kind: 'pot-sink', room: 'kitchen', x: 21.11, z: -52.44 },
      { kind: 'steel-counter-b', room: 'kitchen', x: 22.91, z: -52.44 },
      { kind: 'dry-store', room: 'kitchen', x: 14.435, z: -51.47, deg: 90 },
      { kind: 'speed-rack', room: 'kitchen', x: 14.52, z: -50.27, deg: 90 },
      { kind: 'prep-island', room: 'kitchen', x: 21.6, z: -49.3 },
      { kind: 'heat-pass', room: 'kitchen', wall: 's', at: 23.1 },
      { kind: 'pot-spill', room: 'kitchen', x: 18.7, z: -48.3, deg: 40 },
      { kind: 'kitchen-mat', room: 'kitchen', x: 18.4, z: -51.6 },
      { kind: 'ceiling-light', room: 'kitchen', x: 17.2, z: -50.2, col: COLD },
      { kind: 'ceiling-light', room: 'kitchen', x: 21.6, z: -50.2, col: COLD },
      { kind: 'extinguisher', room: 'kitchen', wall: 'e', at: -51.8 },
      { kind: 'exit-sign', room: 'kitchen', wall: 'e', at: -49.5 },
    ],

    // ------------------------------------------------------------------ luxury tower (L)
    'luxury-tower': [
      F('lobby', 'checker', '#34343b', '#27272d', 1.2), F('lounge', 'carpet', '#3d3a44', '#2a2830'), F('lift-bank', 'checker', '#34343b', '#27272d', 1.2),
      F('mail-room', 'tiles', '#5e5f66', '#4c4d54', .6), F('concierge', 'carpet', '#35394a', '#262a38'),
      // Lobby: stone-look panels, the water wall still running, two sofas over a black glass
      // table, the concierge podium; the luggage cart toppled in the rush for the lifts, a
      // guest dead behind it (old stains, a drag mark), a designer bag dropped, one shoe.
      { kind: 'water-wall', room: 'lobby', wall: 'w', at: -15.75 },
      { kind: 'stone-panels', room: 'lobby', wall: 'n', at: 31.5 },
      { kind: 'stone-panels', room: 'lobby', wall: 'e', at: -19.3 },
      { kind: 'stone-panels', room: 'lobby', wall: 'e', at: -12.2 },
      { kind: 'lux-sofa', room: 'lobby', x: 27.75, z: -13.4, deg: 180 },
      { kind: 'glass-table', room: 'lobby', x: 27.75, z: -14.85 },
      { kind: 'lux-sofa', room: 'lobby', x: 27.75, z: -16.3 },
      { kind: 'planter-long', room: 'lobby', wall: 's', at: 25.5 },
      { kind: 'concierge-podium', room: 'lobby', wall: 's', at: 35.6 },
      { kind: 'lux-sculpture', room: 'lobby', x: 37.44, z: -20.44 },
      { kind: 'toppled-cart', room: 'lobby', x: 34.4, z: -18.2, deg: 10 },
      { kind: 'body', room: 'lobby', x: 35.3, z: -19.75, deg: 200, pose: 'reach', look: GUEST },
      { kind: 'stain', room: 'lobby', x: 35.0, z: -18.9, w: 1.3, d: .5, deg: 70, col: DRY },
      { kind: 'drag-mark', room: 'lobby', x: 34.2, z: -16.9, deg: 25 },
      { kind: 'designer-bag', room: 'lobby', x: 30.3, z: -12.9, deg: 30 },
      { kind: 'lost-heel', room: 'lobby', x: 32.8, z: -16.5, deg: -35 },
      { kind: 'spilled-case', room: 'lobby', x: 33.1, z: -19.4, deg: -20 },
      { kind: 'lux-pendant', room: 'lobby', x: 28.5, z: -15.5 },
      { kind: 'lux-pendant', room: 'lobby', x: 33.8, z: -15.5 },
      { kind: 'ceiling-panel', room: 'lobby', x: 31.2, z: -12.6, col: WARM, pool: false },
      { kind: 'ceiling-panel', room: 'lobby', x: 31.2, z: -18.6, col: WARM, pool: false },
      { kind: 'exit-sign', room: 'lobby', wall: 's', at: 31 },
      // Lounge: the fireplace between two wing chairs, a sofa over a low table, the grand
      // piano with its bench, a bar cart of decanters, bookcases, floor lamps.
      { kind: 'fireplace', room: 'lounge', wall: 'w', at: -27.5 },
      { kind: 'glass-table', room: 'lounge', x: 25.25, z: -27.5, deg: 90 },
      { kind: 'lux-sofa', room: 'lounge', x: 26.3, z: -27.5, deg: -90 },
      { kind: 'wing-chair', room: 'lounge', wall: 'w', at: -24.55 },
      { kind: 'wing-chair', room: 'lounge', wall: 'w', at: -30.45 },
      { kind: 'grand-piano', room: 'lounge', x: 30.8, z: -25.5, deg: -90 },
      { kind: 'piano-bench', room: 'lounge', x: 29.68, z: -25.3, deg: -90 },
      { kind: 'bar-cart', room: 'lounge', wall: 'e', at: -28.6 },
      { kind: 'bookcase', room: 'lounge', wall: 'e', at: -32.99 },
      { kind: 'bookcase-b', room: 'lounge', wall: 'e', at: -31.34 },
      { kind: 'floor-lamp', room: 'lounge', x: 24.95, z: -22.9 },
      { kind: 'floor-lamp', room: 'lounge', x: 31.5, z: -22.3 },
      { kind: 'lounge-rug', room: 'lounge', x: 26.6, z: -27.5 },
      { kind: 'wall-art', room: 'lounge', wall: 'w', at: -32.4 },
      { kind: 'ceiling-panel', room: 'lounge', x: 28.2, z: -24.6, col: WARM },
      { kind: 'ceiling-panel', room: 'lounge', x: 28.2, z: -30.4, col: WARM },
      // The lift bank: four lifts standing open on dark shafts, their call panels lit.
      { kind: 'lift-doors', room: 'lift-bank', wall: 'w', at: -22.8 },
      { kind: 'lift-doors', room: 'lift-bank', wall: 'w', at: -25.4 },
      { kind: 'lift-doors', room: 'lift-bank', wall: 'e', at: -22.8 },
      { kind: 'lift-doors', room: 'lift-bank', wall: 'e', at: -25.4 },
      { kind: 'lift-bin', room: 'lift-bank', x: 32.42, z: -21.42 },
      { kind: 'phone', room: 'lift-bank', x: 34.3, z: -24.2, deg: 70 },
      { kind: 'designer-scarf', room: 'lift-bank', x: 35.7, z: -25.6, deg: -30 },
      { kind: 'ceiling-panel', room: 'lift-bank', x: 35, z: -24, col: WARM, pool: false },
      // Mail room: the brass boxes, the parcel lockers (lit), the sorting table, parcels
      // left where they were dropped.
      { kind: 'mailboxes', room: 'mail-room', wall: 'w', at: -30.0 },
      { kind: 'mailboxes', room: 'mail-room', wall: 'w', at: -32.45 },
      { kind: 'parcel-lockers', room: 'mail-room', x: 33.58, z: -33.54 },
      { kind: 'sort-table', room: 'mail-room', wall: 'n', at: 35.5 },
      { kind: 'parcel-pile', room: 'mail-room', x: 36.2, z: -31.9, deg: 20 },
      { kind: 'parcel-pile', room: 'mail-room', x: 33.4, z: -28.4, deg: -50 },
      { kind: 'ceiling-panel', room: 'mail-room', x: 35, z: -30.5, col: COLD },
      { kind: 'exit-sign', room: 'mail-room', wall: 'e', at: -30.5 },
      // Concierge back office: the camera desk still showing the lobby, a filing wall, the
      // valet key cabinet hanging open, a desk, a safe, the uniforms, the water cooler.
      { kind: 'cctv-desk', room: 'concierge', wall: 'w', at: -38.5 },
      { kind: 'office-chair', room: 'concierge', x: 25.9, z: -38.9, deg: 110 },
      { kind: 'cabinet', room: 'concierge', wall: 'w', at: -43.29, col: '#3a3f4c' },
      { kind: 'cabinet', room: 'concierge', wall: 'w', at: -42.27, col: '#3a3f4c' },
      { kind: 'valet-keys', room: 'concierge', wall: 'w', at: -35.6 },
      { kind: 'desk', room: 'concierge', wall: 'e', at: -39 },
      { kind: 'office-chair', room: 'concierge', x: 30.5, z: -38.7, deg: -120 },
      { kind: 'wall-safe', room: 'concierge', wall: 'e', at: -43.4 },
      { kind: 'uniform-rack', room: 'concierge', wall: 'e', at: -35.0 },
      { kind: 'water-cooler', room: 'concierge', wall: 'e', at: -40.3 },
      { kind: 'dropped-radio', room: 'concierge', x: 27.2, z: -40.8, deg: 30 },
      { kind: 'litter', room: 'concierge', x: 29.4, z: -41.2, v: 2 },
      { kind: 'ceiling-panel', room: 'concierge', x: 28.2, z: -36.6, col: COLD },
      { kind: 'ceiling-panel', room: 'concierge', x: 28.2, z: -41.4, col: COLD },
      { kind: 'exit-sign', room: 'concierge', wall: 'n', at: 28 },
    ],

    // ------------------------------------------------------------------ corporate tower
    'corporate-tower': [
      F('security', 'tiles', '#8d9298', '#71767d', .9), F('reception', 'tiles', '#9aa0a6', '#7c8288', .9), F('server-closet', 'grate', '#6b6f76', '#4e5258', .6),
      F('meeting', 'carpet', '#3c424c', '#2b3038'),
      // Security: the bag scanner with a bag still on the belt, the walk-through arch, the
      // guard's desk, and the speed-gate line stuck open, blinking, before the reception
      // doorway; lanyards and trays dropped as people pushed through.
      { kind: 'bag-scanner', room: 'security', x: 38.66, z: -43.2 },
      { kind: 'scan-arch', room: 'security', x: 40.0, z: -41.9 },
      { kind: 'guard-desk', room: 'security', wall: 'n', at: 39.3 },
      ...[-46.175, -44.475, -42.525, -40.825].map(z => ({ kind: 'speed-gate', room: 'security', x: 43.125, z })),
      { kind: 'tray-stack', room: 'security', x: 39.4, z: -44.9, deg: 10 },
      { kind: 'lanyards', room: 'security', x: 42.1, z: -43.1, deg: 30 },
      { kind: 'lanyards', room: 'security', x: 40.2, z: -45.4, deg: -70 },
      { kind: 'tipped-chair', room: 'security', x: 40.9, z: -46.2, deg: 150, col: '#3a3d44' },
      { kind: 'ceiling-panel', room: 'security', x: 40.2, z: -43.5, col: COLD },
      { kind: 'ceiling-panel', room: 'security', x: 43.4, z: -43.5, col: COLD, pool: false },
      { kind: 'exit-sign', room: 'security', wall: 's', at: 41.5 },
      // Reception: the desk (a chair tucked behind it) under the lit logo wall, a waiting
      // sofa, the tower's own model on its plinth, a long planter; the coffee someone dropped.
      { kind: 'corp-desk', room: 'reception', x: 52.95, z: -45.0 },
      { kind: 'booth-chair', room: 'reception', x: 52.6, z: -45.95, deg: 160 },
      { kind: 'logo-wall', room: 'reception', wall: 'n', at: 53.6 },
      { kind: 'sofa', room: 'reception', wall: 's', at: 46.65, col: '#4a5260' },
      { kind: 'glass-side-table', room: 'reception', x: 47.0, z: -41.36 },
      { kind: 'corp-plant', room: 'reception', x: 45.46, z: -40.46 },
      { kind: 'tower-model', room: 'reception', wall: 's', at: 53.8 },
      { kind: 'planter-long', room: 'reception', wall: 'n', at: 46.2 },
      { kind: 'coffee-spill', room: 'reception', x: 49.4, z: -43.0, deg: 30 },
      { kind: 'lanyards', room: 'reception', x: 51.6, z: -44.2, deg: 110 },
      { kind: 'wall-screen', room: 'reception', wall: 's', at: 52.3, v: 0, col: BLUE, w: 1.0 },
      { kind: 'ceiling-panel', room: 'reception', x: 48.0, z: -43.5, col: COLD },
      { kind: 'ceiling-panel', room: 'reception', x: 53.0, z: -43.5, col: COLD },
      { kind: 'exit-sign', room: 'reception', wall: 'e', at: -43.5 },
      // Server closet: two rows of racks blinking against the north wall, the cooling unit
      // and the battery cabinet, the network rack, cables under the grate, a laptop left.
      { kind: 'server-row', room: 'server-closet', x: 39.71, z: -52.29 },
      { kind: 'server-row-b', room: 'server-closet', x: 42.71, z: -52.29 },
      { kind: 'cooling-unit', room: 'server-closet', x: 38.61, z: -51.17 },
      { kind: 'battery-cabinet', room: 'server-closet', x: 38.61, z: -50.1 },
      { kind: 'network-rack', room: 'server-closet', wall: 'e', at: -50.9 },
      { kind: 'cable-tray', room: 'server-closet', x: 41.5, z: -51.2 },
      { kind: 'cable-run', room: 'server-closet', x: 41.2, z: -49.2, deg: 20, w: 2.4 },
      { kind: 'floor-laptop', room: 'server-closet', x: 42.4, z: -50.3, deg: -25 },
      { kind: 'ceiling-panel', room: 'server-closet', x: 41.5, z: -49.6, col: COLD },
      // The glass meeting room: the table of empty chairs (two pushed back), the laptops open,
      // the coffee spilled across it, the presentation looping on the wall, a credenza, a
      // whiteboard of shapes, a plant.
      { kind: 'meeting-table', room: 'meeting', x: 53.7, z: -50 },
      ...[52.4, 53.3, 54.2, 55.1].flatMap((x, i) => [
        { kind: 'office-chair', room: 'meeting', x, z: i === 2 ? -51.03 : -50.975, deg: i === 2 ? 15 : 0 },
        { kind: 'office-chair', room: 'meeting', x: i === 1 ? x + .05 : x, z: i === 1 ? -48.97 : -49.025, deg: 180 + (i === 1 ? -15 : 0) },
      ]),
      { kind: 'presentation', room: 'meeting', wall: 'w', at: -50 },
      { kind: 'credenza', room: 'meeting', wall: 'n', at: 46.11 },
      { kind: 'whiteboard', room: 'meeting', wall: 'n', at: 50.5 },
      { kind: 'corp-plant', room: 'meeting', x: 55.56, z: -47.44 },
      { kind: 'coffee-spill', room: 'meeting', x: 51.1, z: -48.4, deg: -50 },
      { kind: 'ceiling-panel', room: 'meeting', x: 53.7, z: -50, col: COLD },
      { kind: 'ceiling-panel', room: 'meeting', x: 48.2, z: -50, col: COLD },
    ],

    // ------------------------------------------------------------------ checkpoint booth
    // One small room with a door each end, so nothing in it may stand in the way: the
    // console and its monitor wall on the wall, everything else dropped on the floor.
    'checkpoint-booth': [
      F('booth', 'grate', '#565a60', '#43474d', .5),
      { kind: 'booth-console', room: 'booth', wall: 'e', at: -47.7 },
      { kind: 'booth-chair', room: 'booth', x: 8.45, z: -47.85, deg: 130 },
      { kind: 'riot-shield', room: 'booth', x: 8.4, z: -48.1, deg: 60 },
      { kind: 'thermal-scanner', room: 'booth', x: 8.95, z: -47.1, deg: -60 },
      { kind: 'trefoil-poster', room: 'booth', wall: 'w', at: -47.7 },
      { kind: 'casings', room: 'booth', x: 8.2, z: -46.95 },
      { kind: 'masks', room: 'booth', x: 9.2, z: -48.4 },
      { kind: 'booth-supplies', room: 'booth', x: 7.95, z: -46.95, deg: 15 },
      { kind: 'ceiling-panel', room: 'booth', x: 8.7, z: -47.7, col: COLD },
    ],
    // ------------------------------------------------------------------ cyberware showroom
    showroom: [
      F('showroom', 'tiles', '#a9adb3', '#8e9298', 1.0), F('fitting', 'tiles', '#c4c8cc', '#a6aab0', .6), F('consultation', 'carpet', '#4a5058', '#343a42'),
      // The showroom (the wedge): plinths of stylised arms and eye units along the storefront,
      // one knocked over; the outbreak's port alone on its plinth, taped off in lemon recall
      // tape; the glass wall cases; the counter with the returned boxes piled beside it.
      onEdge('arm-plinth', 'showroom', SHOW_FRONT, 1.2, .6, 1, { off: .05 }),
      onEdge('eye-plinth', 'showroom', SHOW_FRONT, 3.3, .6, 1, { off: .05 }),
      onEdge('hand-plinth', 'showroom', SHOW_FRONT, 8.9, .6, 1, { off: .05 }),
      onEdge('eye-plinth-b', 'showroom', SHOW_FRONT, 11.0, .6, 1, { off: .05 }),
      { kind: 'recall-plinth', room: 'showroom', x: 19.25, z: -18.47 },
      { kind: 'holo-arm', room: 'showroom', x: 22.9, z: -16.9 },
      onEdge('cyber-case', 'showroom', SHOW_EAST, 1.11, .45),
      onEdge('cyber-case-b', 'showroom', SHOW_EAST, 2.93, .45),
      onEdge('cyber-counter', 'showroom', SHOW_EAST, 5.05, .7),
      { kind: 'returned-boxes', room: 'showroom', x: 22.85, z: -14.3, deg: -15 },
      { kind: 'tipped-plinth', room: 'showroom', x: 18.3, z: -15.4, deg: -20 },
      { kind: 'port-box', room: 'showroom', x: 21.9, z: -15.5, deg: 40 },
      { kind: 'ceiling-panel', room: 'showroom', x: 17.3, z: -17.8, col: COLD },
      { kind: 'ceiling-panel', room: 'showroom', x: 19.25, z: -18.3, col: COLD },
      { kind: 'ceiling-panel', room: 'showroom', x: 22.6, z: -13.4, col: COLD },
      { kind: 'show-strip', room: 'showroom', x: 19.25, z: -19.72 },
      { kind: 'wall-screen', room: 'showroom', x: 14.25, z: -19.4, deg: 90, v: 4, col: MINT, w: .7 },
      { kind: 'exit-sign', room: 'showroom', x: 14.25, z: -18.1, deg: 90 },
      // Fitting room: the tall mirror, the calibration chair facing it, a rack of spare arms,
      // the bench with a box opened on it.
      { kind: 'fitting-mirror', room: 'fitting', wall: 'w', at: -23.5 },
      { kind: 'fitting-chair', room: 'fitting', x: 15.4, z: -23.5, deg: -90 },
      { kind: 'arm-rack', room: 'fitting', wall: 'e', at: -23.4 },
      { kind: 'fitting-bench', room: 'fitting', wall: 'n', at: 16.5 },
      { kind: 'port-box', room: 'fitting', x: 17.6, z: -24.4, deg: -30 },
      { kind: 'calib-tablet', room: 'fitting', x: 16.2, z: -22.6, deg: 60 },
      { kind: 'ceiling-panel', room: 'fitting', x: 16.5, z: -23.2, col: COLD },
      { kind: 'wall-screen', room: 'fitting', wall: 's', at: 18.2, v: 0, col: MINT, w: .8 },
      // Consultation: the reclined consultation chair under its scanner ring, the consultant's
      // desk and stool, the eye scan still on the wall screen, a cabinet of stock.
      { kind: 'consult-chair', room: 'consultation', x: 22.9, z: -24.8, deg: 90 },
      { kind: 'tech-stool', room: 'consultation', x: 21.45, z: -24.9 },
      { kind: 'desk', room: 'consultation', wall: 'w', at: -23.0 },
      { kind: 'office-chair', room: 'consultation', x: 20.2, z: -23.0, deg: -90 },
      { kind: 'cabinet', room: 'consultation', wall: 's', at: 19.7, col: '#d8dce0' },
      { kind: 'scan-screen', room: 'consultation', wall: 'e', at: -22.6 },
      { kind: 'port-box', room: 'consultation', x: 22.6, z: -21.9, deg: 10 },
      { kind: 'ceiling-panel', room: 'consultation', x: 21.75, z: -23, col: COLD },
    ],

    // ------------------------------------------------------------------ flatiron: electronics mall
    flatiron: [
      F('prow', 'tiles', '#3a3c44', '#2a2c33', .5), F('booth-1', 'checker', '#44464e', '#34363d', .4), F('booth-2', 'tiles', '#40424a', '#30323a', .4),
      F('booth-3', 'checker', '#3e3a44', '#2e2a34', .4), F('counters', 'grate', '#4a4c54', '#34363d', .3),
      // The prow vestibule: a phone case along the north wall, a stack of screens between the
      // booth doorways, the lit phone hologram overhead, hanging booth signs.
      onEdge('phone-case', 'prow', PROW_N, 1.95, .5),
      { kind: 'screen-stack', room: 'prow', x: 38.04, z: 15.5, deg: -90 },
      { kind: 'holo-phone', room: 'prow', x: 36.2, z: 14.4 },
      { kind: 'booth-sign', room: 'prow', x: 37.9, z: 13.0, deg: -90 },
      { kind: 'booth-sign', room: 'prow', x: 37.9, z: 18.0, deg: -90 },
      onEdge('wall-screen', 'prow', PROW_CUT, 6.6, .08, 1, { v: 0, col: MAGENTA, w: .9 }),
      { kind: 'litter', room: 'prow', x: 35.6, z: 16.2, v: 3 },
      { kind: 'ceiling-panel', room: 'prow', x: 36.4, z: 13.4, col: COLD },
      { kind: 'ceiling-panel', room: 'prow', x: 36.6, z: 17.3, col: COLD },
      // Booth 1 (phones): cases front and back, the lane between.
      { kind: 'phone-case', room: 'booth-1', wall: 'n', at: 39.875 },
      { kind: 'phone-tower', room: 'booth-1', wall: 's', at: 39.875 },
      { kind: 'booth-sign', room: 'booth-1', x: 39.9, z: 11.0 },
      { kind: 'ceiling-panel', room: 'booth-1', x: 39.9, z: 13, col: '#e8f0ff', pool: false },
      { kind: 'phone', room: 'booth-1', x: 40.3, z: 12.6, deg: 30 },
      // Booth 2 (repairs, on the Boulevard): the bench on the east wall, a stool, the parts wall.
      { kind: 'repair-bench', room: 'booth-2', wall: 'e', at: 13.0 },
      { kind: 'repair-stool', room: 'booth-2', x: 43.05, z: 13.3 },
      { kind: 'parts-wall', room: 'booth-2', wall: 'e', at: 13.0 },
      { kind: 'wall-screen', room: 'booth-2', wall: 'w', at: 15.0, v: 3, col: '#b4bcb4', w: .6 },
      { kind: 'box-pile', room: 'booth-2', x: 42.2, z: 12.9, deg: 20 },
      { kind: 'ceiling-panel', room: 'booth-2', x: 42.6, z: 13, col: COLD },
      // Booth 3: the kiosk with its roll shutter half down, a tall case in the tail.
      { kind: 'kiosk-shutter', room: 'booth-3', x: 39.875, z: 16.06 },
      { kind: 'tall-case', room: 'booth-3', x: 40.835, z: 21.6, deg: -90 },
      { kind: 'booth-sign', room: 'booth-3', x: 39.9, z: 16.2 },
      { kind: 'cable-bin', room: 'booth-3', x: 39.6, z: 20.3, deg: 30 },
      { kind: 'ceiling-panel', room: 'booth-3', x: 40.0, z: 18.6, col: ROSE, pool: false },
      // The repair counters along the Cut's east wall: gutted phones, a soldering iron still
      // glowing, magnifier lamps, screens; the parts wall opposite.
      { kind: 'repair-counter', room: 'counters', x: 43.49, z: 18.25, deg: -90 },
      { kind: 'repair-counter-b', room: 'counters', x: 43.49, z: 20.67, deg: -90 },
      { kind: 'parts-wall', room: 'counters', x: 41.53, z: 21.0, deg: 90 },
      { kind: 'wall-screen', room: 'counters', x: 41.48, z: 17.4, deg: 90, v: 0, col: ROSE, w: .8 },
      { kind: 'box-pile', room: 'counters', x: 42.2, z: 22.3, deg: -40 },
      { kind: 'cable-run', room: 'counters', x: 42.6, z: 19.6, deg: 80, w: 3 },
      { kind: 'ceiling-panel', room: 'counters', x: 42.6, z: 18.2, col: COLD },
      { kind: 'ceiling-panel', room: 'counters', x: 42.8, z: 21.6, col: COLD },
    ],

    // ------------------------------------------------------------------ pachinko tower
    pachinko: [
      F('hall', 'carpet', '#3a1a2a', '#26101c'), F('middle-hall', 'carpet', '#3a1a2a', '#26101c'), F('cash-counter', 'tiles', '#5a4a52', '#463a40', .6),
      F('high-roller', 'carpet', '#2a1a30', '#1a1020'), F('wedge-hall', 'carpet', '#3a1a2a', '#26101c'),
      // The front hall: machine rows flashing to nobody, their stools, balls spilled across the
      // carpet, crates of balls left by the seats.
      { kind: 'pachinko-wall-9', room: 'hall', x: 44.435, z: 15.25, deg: 90 },
      { kind: 'pachinko-stools-9', room: 'hall', x: 44.875, z: 15.25, deg: 90 },
      { kind: 'pachinko-stools-6', room: 'hall', x: 46.675, z: 15.25, deg: 90 },
      { kind: 'pachinko-double-6', room: 'hall', x: 47.34, z: 15.25, deg: 90 },
      { kind: 'pachinko-stools-6', room: 'hall', x: 48.005, z: 15.25, deg: 90 },
      { kind: 'pachinko-stools-27', room: 'hall', x: 50.675, z: 12.06, deg: 90 },
      { kind: 'pachinko-double-27', room: 'hall', x: 51.35, z: 12.06, deg: 90 },
      { kind: 'pachinko-stools-27', room: 'hall', x: 52.025, z: 12.06, deg: 90 },
      { kind: 'pachinko-stools-29', room: 'hall', x: 50.675, z: 18.34, deg: 90 },
      { kind: 'pachinko-double-29', room: 'hall', x: 51.35, z: 18.34, deg: 90 },
      { kind: 'pachinko-stools-29', room: 'hall', x: 52.025, z: 18.34, deg: 90 },
      { kind: 'ball-spill', room: 'hall', x: 49.2, z: 14.2, deg: 20 },
      { kind: 'ball-spill', room: 'hall', x: 45.8, z: 17.6, deg: -60 },
      { kind: 'ball-crates', room: 'hall', x: 45.8, z: 12.6 },
      { kind: 'ball-crates', room: 'hall', x: 50.3, z: 16.2, deg: 90 },
      { kind: 'neon-tube', room: 'hall', wall: 'n', at: 51.5, col: ROSE, w: 2.4, v: 1 },
      { kind: 'neon-tube', room: 'hall', wall: 's', at: 45.6, col: BLUE, w: 2.0 },
      { kind: 'ceiling-panel', room: 'hall', x: 45.8, z: 15.25, col: MAGENTA, pool: false },
      { kind: 'ceiling-panel', room: 'hall', x: 49.3, z: 12.4, col: WARM },
      { kind: 'ceiling-panel', room: 'hall', x: 49.3, z: 18.0, col: WARM },
      { kind: 'ceiling-panel', room: 'hall', x: 52.9, z: 15.2, col: MAGENTA, pool: false },
      { kind: 'exit-sign', room: 'hall', wall: 'n', at: 48 },
      // The middle hall: more rows, a wall of machines each side of the east doorway.
      { kind: 'pachinko-wall-57', room: 'middle-hall', x: 44.435, z: 23.05, deg: 90 },
      { kind: 'pachinko-stools-56', room: 'middle-hall', x: 44.875, z: 23.05, deg: 90 },
      { kind: 'pachinko-stools-28', room: 'middle-hall', x: 46.675, z: 23.05, deg: 90 },
      { kind: 'pachinko-double-29', room: 'middle-hall', x: 47.34, z: 23.05, deg: 90 },
      { kind: 'pachinko-stools-28', room: 'middle-hall', x: 48.005, z: 23.05, deg: 90 },
      { kind: 'pachinko-wall-33', room: 'middle-hall', x: 52.145, z: 20.435 },
      { kind: 'pachinko-stools-32', room: 'middle-hall', x: 52.145, z: 20.875 },
      { kind: 'pachinko-wall-33', room: 'middle-hall', x: 52.145, z: 25.665, deg: 180 },
      { kind: 'pachinko-stools-32', room: 'middle-hall', x: 52.145, z: 25.225, deg: 180 },
      { kind: 'ball-spill', room: 'middle-hall', x: 50.9, z: 23.4, deg: 110 },
      { kind: 'ball-crates', room: 'middle-hall', x: 45.8, z: 21.0, deg: 90 },
      { kind: 'ceiling-panel', room: 'middle-hall', x: 45.8, z: 23.05, col: MAGENTA, pool: false },
      { kind: 'ceiling-panel', room: 'middle-hall', x: 50.6, z: 23.05, col: WARM },
      { kind: 'ceiling-panel', room: 'middle-hall', x: 53.2, z: 23.0, col: MAGENTA, pool: false },
      // The cash counter, abandoned: the prize shelves behind it, the counting machines, the
      // drawer out, tokens on the floor, the jackpot screen still going.
      { kind: 'prize-shelf', room: 'cash-counter', wall: 'e', at: 11.71 },
      { kind: 'prize-shelf-b', room: 'cash-counter', wall: 'e', at: 13.73 },
      { kind: 'cash-counter', room: 'cash-counter', x: 58.55, z: 12.7, deg: -90 },
      { kind: 'ball-counter', room: 'cash-counter', wall: 'w', at: 11.01 },
      { kind: 'ball-counter', room: 'cash-counter', wall: 'w', at: 11.63 },
      { kind: 'prize-case', room: 'cash-counter', wall: 's', at: 59.04 },
      { kind: 'prize-case', room: 'cash-counter', wall: 's', at: 54.96 },
      { kind: 'token-spill', room: 'cash-counter', x: 57.4, z: 13.9, deg: 30 },
      { kind: 'wall-screen', room: 'cash-counter', wall: 'w', at: 17.5, v: 4, col: LEMON, w: 1.0 },
      { kind: 'ceiling-panel', room: 'cash-counter', x: 57.5, z: 12.9, col: WARM },
      { kind: 'ceiling-panel', room: 'cash-counter', x: 57, z: 17.2, col: WARM },
      { kind: 'exit-sign', room: 'cash-counter', wall: 'n', at: 57 },
      // The high-roller room: three big machines and their stools, a leather sofa over a low
      // table (a cup of balls tipped, the ashtray), a red neon.
      ...[54.66, 55.58, 56.5].map((x, i) => ({ kind: i === 1 ? 'vip-machine-b' : 'vip-machine', room: 'high-roller', wall: 's', at: x })),
      ...[54.66, 55.58, 56.5].map(x => ({ kind: 'vip-stool', room: 'high-roller', x, z: 24.73 })),
      { kind: 'vip-sofa', room: 'high-roller', wall: 'e', at: 23 },
      { kind: 'vip-table', room: 'high-roller', x: 58.55, z: 23, deg: -90 },
      { kind: 'ball-spill', room: 'high-roller', x: 57.6, z: 23.9, deg: 70 },
      { kind: 'neon-tube', room: 'high-roller', wall: 'n', at: 55.2, col: RED, w: 1.6 },
      { kind: 'ceiling-panel', room: 'high-roller', x: 57, z: 23, col: RED },
      // The wedge hall on the Cut: a long wall of machines on the north side and a shorter one
      // along the slant, the floor between left open.
      { kind: 'pachinko-wall-93', room: 'wedge-hall', x: 55.145, z: 26.535 },
      { kind: 'pachinko-stools-92', room: 'wedge-hall', x: 55.145, z: 26.975 },
      onEdge('pachinko-wall-5', 'wedge-hall', WEDGE_SE, 3.8, .45),
      onEdge('pachinko-stools-5', 'wedge-hall', WEDGE_SE, 3.8, .35, 1, { off: .51 }),
      { kind: 'ball-spill', room: 'wedge-hall', x: 53.5, z: 28.5, deg: -20 },
      { kind: 'ball-crates', room: 'wedge-hall', x: 48.3, z: 27.3 },
      { kind: 'ceiling-panel', room: 'wedge-hall', x: 51.5, z: 28.4, col: MAGENTA, pool: false },
      { kind: 'ceiling-panel', room: 'wedge-hall', x: 55.6, z: 30.2, col: WARM },
      { kind: 'exit-sign', room: 'wedge-hall', ...edgePoint(WEDGE_CUT, 7.0, .23) },
    ],
    // ------------------------------------------------------------------ body-mod tower
    'body-mod': [
      F('front-studio', 'checker', '#2a2a30', '#d8d4cc', .5), F('work-room-1', 'tiles', '#8a8e94', '#6e7278', .5), F('work-room-2', 'tiles', '#8a8e94', '#6e7278', .5),
      F('back-room', 'planks', '#4a4038', '#3a322c', .2),
      // Front studio: the counter under its wall of flash (pictograms only), a waiting couch,
      // a case of implants and jewellery, one chair with its cart, the autoclave bench.
      { kind: 'studio-couch', room: 'front-studio', wall: 'n', at: 15.11 },
      { kind: 'studio-counter', room: 'front-studio', wall: 'n', at: 17.05 },
      { kind: 'mod-display', room: 'front-studio', wall: 'n', at: 18.9 },
      { kind: 'tattoo-chair', room: 'front-studio', x: 20.85, z: 30.585, deg: 90 },
      { kind: 'needle-cart', room: 'front-studio', x: 20.3, z: 31.26 },
      { kind: 'autoclave-bench', room: 'front-studio', wall: 's', at: 18.0 },
      { kind: 'flash-wall', room: 'front-studio', wall: 'w', at: 31.05 },
      { kind: 'flash-wall-b', room: 'front-studio', wall: 'e', at: 31.05 },
      { kind: 'studio-neon', room: 'front-studio', wall: 's', at: 15.4 },
      { kind: 'ring-light', room: 'front-studio', x: 21.5, z: 35.5 },
      { kind: 'stencil-sheets', room: 'front-studio', x: 17.4, z: 32.4, deg: 20 },
      { kind: 'ceiling-panel', room: 'front-studio', x: 16.2, z: 33, col: MAGENTA, pool: false },
      { kind: 'ceiling-panel', room: 'front-studio', x: 19.8, z: 33, col: MAGENTA, pool: false },
      { kind: 'exit-sign', room: 'front-studio', wall: 'w', at: 33 },
      // Work room 1: the chair along the wall and its cart, the one machine still running.
      { kind: 'tattoo-chair-b', room: 'work-room-1', x: 14.54, z: 37.16 },
      { kind: 'needle-cart-live', room: 'work-room-1', x: 15.14, z: 37.83 },
      { kind: 'flash-wall-c', room: 'work-room-1', wall: 'w', at: 38.5 },
      { kind: 'gloves', room: 'work-room-1', x: 16.4, z: 39.3, deg: 40 },
      { kind: 'ceiling-panel', room: 'work-room-1', x: 16, z: 38.5, col: COLD },
      // Work room 2 (piercing and implants): the bed, a jewellery case, the sharps cabinet.
      { kind: 'piercing-bed', room: 'work-room-2', x: 21.44, z: 38.5 },
      { kind: 'jewel-case', room: 'work-room-2', wall: 'e', at: 36.71 },
      { kind: 'sharps-cabinet', room: 'work-room-2', wall: 'e', at: 40.29 },
      { kind: 'ink-shelf', room: 'work-room-2', wall: 'n', at: 20.0 },
      { kind: 'stain', room: 'work-room-2', x: 20.2, z: 38.9, w: .5, d: .4, col: '#3a2a2a' },
      { kind: 'ceiling-panel', room: 'work-room-2', x: 20, z: 38.5, col: COLD },
      // Back room: stock shelves, the ink rack, a mini fridge, the staff sofa, food left.
      { kind: 'shelf-unit', room: 'back-room', wall: 's', at: 14.81 },
      { kind: 'ink-rack', room: 'back-room', wall: 's', at: 16.03 },
      { kind: 'mini-fridge', room: 'back-room', wall: 's', at: 16.9 },
      { kind: 'sofa', room: 'back-room', wall: 's', at: 18.07, col: '#2a2a30' },
      { kind: 'takeout', room: 'back-room', x: 18.2, z: 42.2, deg: 30 },
      { kind: 'ceiling-panel', room: 'back-room', x: 17, z: 42.5, col: WARM },
      { kind: 'exit-sign', room: 'back-room', wall: 'e', at: 42.5 },
    ],

    // ------------------------------------------------------------------ metro entrance
    'metro-entrance': [
      F('ticket-hall', 'tiles', '#a8a49a', '#8a867c', .5), F('staff-booth', 'plain', '#6a6e74'), F('gates', 'tiles', '#a8a49a', '#8a867c', .5),
      // Ticket hall: two ticket machines, the pictogram map wall, a bench; the crowd's things
      // dropped in the rush to the gates, an umbrella, a stroller.
      { kind: 'ticket-machine', room: 'ticket-hall', wall: 'n', at: 26.0 },
      { kind: 'ticket-machine-b', room: 'ticket-hall', wall: 'n', at: 26.82 },
      { kind: 'metro-map', room: 'ticket-hall', wall: 'n', at: 31.3 },
      { kind: 'metro-bench', room: 'ticket-hall', wall: 'n', at: 30.6 },
      { kind: 'belongings', room: 'ticket-hall', x: 30.3, z: 47.2, deg: 10 },
      { kind: 'umbrella', room: 'ticket-hall', x: 27.1, z: 45.9, deg: 60 },
      { kind: 'stroller', room: 'ticket-hall', x: 31.1, z: 46.2, deg: -30 },
      { kind: 'lost-shoe', room: 'ticket-hall', x: 25.9, z: 46.4, deg: 20 },
      { kind: 'tactile-strip', room: 'ticket-hall', x: 28.5, z: 47.55 },
      { kind: 'ceiling-light', room: 'ticket-hall', x: 26.2, z: 46, col: COLD },
      { kind: 'ceiling-light', room: 'ticket-hall', x: 30.8, z: 46, col: COLD },
      { kind: 'exit-sign', room: 'ticket-hall', wall: 'n', at: 28.5 },
      // Staff booth: the desk with the radio still on and the camera screen, a locker, the
      // key box open, the chair tipped over.
      { kind: 'staff-desk', room: 'staff-booth', wall: 's', at: 24.91 },
      { kind: 'locker', room: 'staff-booth', wall: 's', at: 26.1, col: '#4a5a6a' },
      { kind: 'wall-screen', room: 'staff-booth', wall: 'w', at: 50.4, v: 2, col: '#b4bcb4', w: .8 },
      { kind: 'key-box', room: 'staff-booth', wall: 'w', at: 49.3 },
      { kind: 'tipped-chair', room: 'staff-booth', x: 25.1, z: 50.2, deg: 120, col: '#3a4a5a' },
      { kind: 'ceiling-panel', room: 'staff-booth', x: 25.5, z: 50, col: COLD },
      // The gates, blinking, before the shutter pulled half down over the stairs: belongings
      // piled against the wall, tally marks scratched beside the shutter, and the one who
      // reached under it (infected: the port at the neck, the blotching).
      { kind: 'fare-gate', room: 'gates', x: 29.3, z: 49.75 },
      { kind: 'fare-gate', room: 'gates', x: 29.3, z: 51.5 },
      { kind: 'metro-shutter', room: 'gates', wall: 'e', at: 50 },
      { kind: 'tally-marks', room: 'gates', wall: 's', at: 29.2 },
      { kind: 'belongings-b', room: 'gates', x: 28.1, z: 48.8, deg: -5 },
      { kind: 'body', room: 'gates', x: 28.9, z: 50.62, deg: 90, pose: 'reach', infected: true, look: { skin: '#9a6a4c', hair: '#2a211c', cloth: '#4f5d4a', legs: '#3b4250' } },
      { kind: 'ceiling-panel', room: 'gates', x: 28.4, z: 50, col: COLD },
    ],

    // ------------------------------------------------------------------ the bus
    // Its seats face the aisle along the north side and between the doors on the kerb side,
    // the rear bench across the back, the driver's cab at the front (east); the light strip
    // flickering, a bag left on a seat.
    bus: [
      { kind: 'floor', room: 'bus', pattern: 'grate', col: '#3a3d44', col2: '#30333a', size: .4 },
      onEdge('bus-rear-bench', 'bus', BUS_REAR, 1.3, .55),
      onEdge('bus-seats-3', 'bus', BUS_N, 1.55, .5),
      onEdge('bus-seats-3', 'bus', BUS_N, 3.05, .5),
      onEdge('bus-seats-2', 'bus', BUS_N, 10.15, .5),
      onEdge('bus-seats-3b', 'bus', BUS_S, 5.45, .5),
      onEdge('bus-cab', 'bus', BUS_N, 11.41, .79),
      { kind: 'bag-on-seat', room: 'bus', ...edgePoint(BUS_N, 2.7, .66) },
      { kind: 'bus-light', room: 'bus', ...edgePoint(BUS_N, 6.03, 1.3) },
      { kind: 'bus-rails', room: 'bus', ...edgePoint(BUS_N, 6.03, 1.3) },
      { kind: 'bus-edges', room: 'bus', ...edgePoint(BUS_N, 6.03, 1.3) },
      { kind: 'fold-seat', room: 'bus', ...edgePoint(BUS_N, 4.6, .4) },
      { kind: 'bus-screen', room: 'bus', ...edgePoint(BUS_N, 8.6, .4) },
      { kind: 'litter', room: 'bus', ...edgePoint(BUS_N, 7.2, 1.2), v: 2 },
    ],
  };
}

function buildKinds() {
  // --- The kinds (data-made: their parts in their own frame) --------------------
  // Part builders: m.box(x, y, z, w, h, d, colour, opts), m.cyl(x, y, z, r, h,
  // colour, opts), m.flat(x, y, z, w, d, colour, opts) (world/city-interiors.js's
  // header); `r` is the kind's own seeded random (the same on every load).
  function randomFor(text) { let s = 2166136261; for (const ch of text) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0; s ||= 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function kind(name, w, d, h, cls, note, build) {
    const parts = [], opt = o => o && Object.keys(o).length ? o : undefined;
    const m = {
      box(x, y, z, bw, bh, bd, col, o) { parts.push(['box', r3(x), r3(y), r3(z), r3(bw), r3(bh), r3(bd), col, ...(opt(o) ? [o] : [])]); return m; },
      cyl(x, y, z, r, ch, col, o) { parts.push(['cyl', r3(x), r3(y), r3(z), r3(r), r3(ch), col, ...(opt(o) ? [o] : [])]); return m; },
      flat(x, y, z, fw, fd, col, o) { parts.push(['flat', r3(x), r3(y), r3(z), r3(fw), r3(fd), col, ...(opt(o) ? [o] : [])]); return m; },
    };
    build(m, randomFor(name), { w, d, h });
    return [name, { w, d, h, cls, note, parts }];
  }
  const r3 = v => Math.round(v * 1000) / 1000;
  const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
  const shade = (hex, f) => { const v = parseInt(hex.slice(1), 16), c = k => Math.max(0, Math.min(255, Math.round((v >> k & 255) * f))); return '#' + [16, 8, 0].map(k => c(k).toString(16).padStart(2, '0')).join(''); };

  // Palettes.
  const STEEL = '#8a9099', STEEL_D = '#4c525b', DARK = '#23262c', BLACK = '#15171b', WHITE = '#d9dde2', CHROME = '#b6bcc4', GLASS = '#9fb4b8';
  const BRASS = '#9a8a5c', BRASS_D = '#6e6242', WALNUT = '#4a3426', WALNUT_L = '#6a4a34', CREAM = '#d6ccb8', LEATHER = '#3a2a24', STONE = '#8e8880', STONE_L = '#b3aca1', MARBLE_D = '#2e2d33';
  const CASES = ['#2c3a4c', '#6a2a2e', '#3c4a3a', '#1e1f24', '#7a6a58', '#4a4a6a', '#8a8f96', '#5a3a4a'];
  const DRINKS = ['#e0a0b0', '#d8d890', '#e8e8f0', '#b8423a', '#c8e0b0', '#e05a6a'];
  const S = 1.5; // a screen's glow
  const PACHI = [RED, ROSE, LEMON, GREEN, BLUE, MAGENTA, '#f2f2ff', '#ff6a9a']; // the pachinko machines' lamps
  const T = { fine: true };

  // A screen face on the +z side of a thin backing (no lettering: colour blocks and shapes).
  function screen(m, r, x, y, z, w, h, col, mode = 0) {
    m.box(x, y, z - .02, w + .04, h + .04, .03, BLACK);
    m.box(x, y + .0, z, w, h, .006, shade(col, .35), { glow: S });
    const f = z + .006, dot = (px, py, pw, ph, c, g = S * 1.2) => m.box(x + px * w, y + h / 2 + py * h - ph * h / 2, f, pw * w, ph * h, .004, c, { glow: g, fine: true });
    if (mode === 1) { // bar chart and a rising line
      for (let k = 0; k < 5; k++) { const bh = .2 + k * .12 + r() * .1; m.box(x - w * .35 + k * w * .12, y + h * .12, f, w * .08, h * bh, .004, k === 4 ? '#f2f2f2' : col, { glow: S * 1.3 }); }
      dot(.22, .1, .3, .04, '#f2f2f2'); dot(.22, -.15, .3, .04, shade(col, .8)); dot(.22, .3, .12, .12, col);
    } else if (mode === 2) { // camera views: four panes of street blocks
      for (let k = 0; k < 4; k++) { const px = k % 2 ? .25 : -.25, py = k < 2 ? .25 : -.25; dot(px, py, .46, .46, '#2a3440', .9); dot(px - .05, py - .12, .3, .08, '#4a5460', .9); dot(px + .1, py + .05, .08, .2, '#74747c', .9); }
    } else if (mode === 3) { // static
      for (let k = 0; k < 8; k++) dot((r() - .5) * .8, (r() - .5) * .8, .1 + r() * .3, .05, shade('#c8d0d8', .5 + r() * .6), 1);
    } else if (mode === 4) { // biohazard trefoil (the warning loop)
      dot(0, 0, .5, .8, '#1a0d10', .3);
      for (let k = 0; k < 3; k++) { const a = k * 2.094 + 1.571; dot(Math.cos(a) * .12, Math.sin(a) * .2, .14, .24, LEMON, 1.6); }
    } else { // an ad: a colour field, a round mark, a stripe
      dot(-.22, .0, .45, .8, col, S * 1.2); dot(.22, .15, .25, .35, '#f2f2f2'); dot(.22, -.25, .38, .08, shade(col, .8));
    }
  }
  // Little glyph-like marks (never letters): a row of short bars and dots.
  function glyphs(m, r, x, y, z, w, col, glow) {
    let cx = x - w / 2;
    while (cx < x + w / 2 - .02) { const gw = .015 + r() * .03; m.box(cx + gw / 2, y + (r() < .5 ? .01 : 0), z, gw, .012 + r() * .02, .004, col, { glow, fine: true }); cx += gw + .012; }
  }
  // A suitcase standing (or lying: flat) with a tag.
  function suitcase(m, r, x, y, z, w, h, d, col, o = {}) {
    m.box(x, y, z, w, h, d, col, o.ry ? { ry: o.ry } : undefined);
    if (!o.flat) { m.box(x, y + h, z, w * .35, .06, .03, BLACK, T); m.box(x + w / 2 + .005, y + h * .55, z, .01, .1, .04, o.tag || '#e8e2d4', T); }
    else m.box(x + w * .3, y + h, z + d * .2, .05, .01, .08, o.tag || '#e8e2d4', T);
  }

  const KIND_LIST = [
    // =================================================================== hotel
    kind('hotel-desk', 3.2, .8, 1.1, 'low', 'the front desk: fluted walnut front, stone top, a warm lit band, a bell, screens behind the counter', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h - .06, d, WALNUT);
      for (let k = 0; k < 13; k++) m.box(-w / 2 + .12 + k * (w - .24) / 12, .12, d / 2, .05, h - .3, .02, WALNUT_L);
      m.box(0, .04, d / 2 + .005, w - .1, .04, .02, WARM, { glow: 1.6 });
      m.box(0, h - .06, .04, w + .06, .06, d + .1, STONE_L);
      m.box(0, h - .2, -d / 2 + .15, w - .1, .04, .3, CREAM);
      for (const x of [-.9, .5]) { m.box(x, h - .16, -.15, .06, .18, .05, BLACK); m.box(x, h + .0, -.15, .44, .28, .03, BLACK, { rx: -.2 }); m.box(x, h + .02, -.13, .4, .24, .004, '#9fb8d8', { glow: S, rx: -.2 }); }
      m.cyl(.1, h, .12, .06, .05, BRASS, { sides: 8 }); m.cyl(.1, h + .05, .12, .012, .02, BRASS, { sides: 6, fine: true });
      m.box(1.2, h, .05, .1, .02, .14, BLACK, T); m.box(1.2, h + .02, .05, .08, .004, .12, '#6aff5a', { glow: 1.2, fine: true });
      m.box(-.3, h, .12, .21, .004, .28, '#e8e4d8', { ry: .2, fine: true });
    }),
    kind('key-wall', 2.4, .12, 2.5, 'walkOver', 'the key and pigeonhole wall behind the front desk', (m, r, { w, d }) => {
      const z = -d / 2 + .03;
      m.box(0, 1.1, z, w, 1.3, .05, WALNUT);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) {
        const x = -w / 2 + .15 + i * (w - .3) / 7, y = 1.18 + j * .24;
        m.box(x, y, z + .03, .22, .18, .03, shade(WALNUT, .7));
        if (r() < .45) m.box(x, y + .02, z + .05, .03, .1, .02, BRASS, T);
      }
      m.box(0, 2.45, z, w + .1, .06, .1, WALNUT_L);
    }),
    kind('lobby-sofa', 1.8, .8, .85, 'low', 'a low cream sofa on brass feet', (m, r, { w, d, h }) => {
      m.box(0, .08, 0, w, .28, d, CREAM); m.box(0, .36, .06, w - .28, .1, d - .22, shade(CREAM, 1.06));
      m.box(0, .36, -d / 2 + .1, w - .28, h - .36, .2, CREAM, { rx: -.1 });
      for (const s of [-1, 1]) { m.box(s * (w / 2 - .07), .08, 0, .14, .5, d, shade(CREAM, .9)); m.box(s * (w / 2 - .1), 0, 0, .05, .08, d - .15, BRASS); }
      m.box(-.45, .46, -.18, .38, .32, .12, '#7a5a4a', { rx: -.3, rz: .1 }); m.box(.5, .46, -.18, .38, .32, .12, '#4a5a6a', { rx: -.3, rz: -.1 });
    }),
    kind('stone-table', 1.2, .6, .42, 'low', 'a low stone coffee table, a tray of glasses, a book', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w - .2, h - .06, d - .15, shade(STONE, .8)); m.box(0, h - .06, 0, w, .06, d, STONE_L);
      m.box(-.3, h, 0, .3, .02, .22, BRASS); for (let k = 0; k < 3; k++) m.cyl(-.38 + k * .08, h + .02, .02 * k - .03, .025, .08, '#cfe3ea', { sides: 6, fine: true });
      m.box(.28, h, .02, .22, .03, .16, '#6a2a2e', { ry: .3 });
    }),
    kind('lobby-armchair', .8, .8, .85, 'low', 'a deep armchair', (m, r, { w, d, h }) => {
      m.box(0, .06, 0, w, .32, d, '#5a4638'); m.box(0, .38, .06, w - .24, .1, d - .2, '#6a5444');
      m.box(0, .38, -d / 2 + .09, w - .1, h - .38, .18, '#5a4638', { rx: -.12 });
      for (const s of [-1, 1]) m.box(s * (w / 2 - .06), .06, 0, .12, .52, d - .04, '#4e3c30');
      m.box(0, 0, 0, w - .1, .06, d - .1, BLACK);
    }),
    kind('bell-cart', 1.1, .6, 1.2, 'low', 'a brass bell cart under its arch, a guest\'s bags still on it, tagged', (m, r, { w, d, h }) => {
      m.box(0, .12, 0, w, .05, d, '#5a2a30'); for (const s of [-1, 1]) for (const t of [-1, 1]) m.cyl(s * (w / 2 - .08), 0, t * (d / 2 - .08), .05, .1, BLACK, { sides: 6 });
      for (const s of [-1, 1]) { m.cyl(s * (w / 2 - .04), .17, 0, .02, 1.65, BRASS, { sides: 6 }); }
      m.box(0, 1.8, 0, w - .04, .04, .04, BRASS); m.box(0, .95, -d / 2 + .03, w - .08, .03, .03, BRASS, T);
      suitcase(m, r, -.22, .17, .02, .42, .62, .26, '#2c3a4c', { tag: LEMON }); suitcase(m, r, .26, .17, .04, .36, .5, .22, '#6a2a2e', { tag: LEMON });
      m.box(0, .17 + .62, -.02, .5, .14, .3, '#5b4a3a'); m.box(.22, .17 + .5, .04, .3, .26, .18, '#1e1f24');
      m.box(-.1, .95, .1, .4, .06, .3, '#3a4a5a', { rz: .3 });
    }),
    kind('flower-console', 1.4, .4, .85, 'low', 'a console table, a tall vase of dead flowers, a bowl', (m, r, { w, d, h }) => {
      m.box(0, h - .05, 0, w, .05, d, WALNUT_L); for (const s of [-1, 1]) m.box(s * (w / 2 - .06), 0, 0, .05, h - .05, d - .06, BRASS_D);
      m.box(0, .12, 0, w - .14, .03, d - .1, WALNUT);
      m.cyl(-.3, h, 0, .09, .45, '#2a3a44', { sides: 8, top: .06 });
      for (let k = 0; k < 7; k++) m.box(-.3 + (r() - .5) * .12, h + .45, (r() - .5) * .1, .015, .25 + r() * .25, .015, '#5a5238', { rx: (r() - .5) * .8, rz: (r() - .5) * .8, fine: true });
      for (let k = 0; k < 5; k++) m.box(-.3 + (r() - .5) * .3, h + .72 + r() * .1, (r() - .5) * .2, .06, .03, .05, '#6a4a3a', { fine: true });
      for (let k = 0; k < 4; k++) m.flat(-.2 + r() * .6, h + .002, (r() - .5) * .25, .05, .03, '#6a4a3a', { ry: r() * 3, fine: true });
      m.cyl(.35, h, 0, .12, .06, CREAM, { sides: 8 });
    }),
    kind('lobby-plant', .5, .5, 1.2, 'low', 'a tall planter, a dead fig', (m, r, { w, h }) => {
      m.box(0, 0, 0, w - .04, .6, w - .04, MARBLE_D); m.box(0, .6, 0, w - .1, .02, w - .1, '#2a221c');
      for (let k = 0; k < 6; k++) m.box((r() - .5) * .15, .6, (r() - .5) * .15, .03, .5 + r() * .5, .03, '#4a3e2c', { rx: (r() - .5) * .5, rz: (r() - .5) * .5 });
      for (let k = 0; k < 9; k++) m.box((r() - .5) * .45, .95 + r() * .4, (r() - .5) * .45, .1, .02, .06, pick(r, ['#6a6238', '#5a5a34', '#7a6a40']), { ry: r() * 3, rz: (r() - .5) * .8, fine: true });
    }),
    kind('lobby-rug', 3.0, 2.2, .02, 'walkOver', 'a patterned rug under the seating', (m, r, { w, d }) => {
      m.flat(0, .03, 0, w, d, '#5a3a3a'); m.flat(0, .033, 0, w - .2, d - .2, '#7a5446'); m.flat(0, .036, 0, w - .6, d - .6, '#5a3a3a');
      for (let k = 0; k < 4; k++) m.flat(-.6 + k * .4, .039, 0, .12, .12, CREAM, { ry: .785 });
    }),
    kind('chandelier', 1.8, 1.8, 3.4, 'walkOver', 'a tiered ring chandelier under the ceiling (lit)', (m, r, { h }) => {
      m.box(0, h - .3, 0, .03, .3, .03, BRASS_D);
      for (const [rad, y] of [[.8, h - .7], [.5, h - .5], [.25, h - .38]]) {
        const n = Math.round(rad * 14);
        for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; m.box(Math.cos(a) * rad, y, Math.sin(a) * rad, .06, .16, .06, '#fff2dc', { glow: 2.2 }); }
        m.cyl(0, y + .14, 0, rad, .02, BRASS, { sides: 12 });
      }
    }),
    kind('keycard', .1, .07, .01, 'walkOver', 'a room keycard dropped', m => { m.box(0, 0, 0, .085, .004, .055, '#e8e2d4'); m.box(.02, .004, 0, .03, .002, .05, '#2c3a4c'); }),
    kind('hotel-bar', 6.0, .6, 1.1, 'low', 'the hotel bar counter: dark fluted front, a brass rail, a stone top, drinks still poured, a lit under-strip', (m, r, { w, d, h }) => {
      m.box(0, .1, 0, w, h - .16, d, '#2a1e1a');
      for (let k = 0; k < 30; k++) m.box(-w / 2 + .1 + k * (w - .2) / 29, .14, d / 2, .08, h - .3, .02, '#3a2a22');
      m.box(0, 0, -.02, w - .1, .1, d - .1, BLACK); m.box(0, .1, d / 2 + .01, w, .02, .02, ROSE, { glow: 1.4 });
      m.cyl(0, .2, d / 2 + .12, .025, w - .1, BRASS, { rz: Math.PI / 2, sides: 6 });
      m.box(0, h - .06, 0, w + .06, .06, d + .08, MARBLE_D, { top: '#3e3c44' });
      for (let k = 0; k < 14; k++) {
        const x = -w / 2 + .3 + r() * (w - .6), z = (r() - .4) * .3, c = pick(r, DRINKS);
        if (r() < .5) { m.cyl(x, h, z, .035, .12, '#cfe3ea', { sides: 6, fine: true }); m.cyl(x, h + .01, z, .03, .07, c, { sides: 6, fine: true }); }
        else { m.cyl(x, h, z, .012, .08, '#cfe3ea', { sides: 5, fine: true }); m.cyl(x, h + .08, z, .05, .05, c, { sides: 6, top: .06, fine: true }); }
      }
      for (const x of [-1.8, .3, 2.1]) { m.box(x, h, -.12, .12, .01, .12, '#1e1f24', T); m.cyl(x + .1, h, -.15, .06, .05, '#8a9a5a', { sides: 6 }); }
      m.cyl(1.2, h, -.18, .045, .22, CHROME, { sides: 8 });
    }),
    kind('back-bar-hotel', 6.0, .43, 2.1, 'cover', 'the back bar: a mirror, lit shelves of bottles, a till', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, .95, d, '#2a1e1a'); m.box(0, .95, -d / 2 + .04, w, h - .95, .06, '#3a4448', { glow: .12 });
      for (const y of [1.25, 1.6, 1.95]) {
        m.box(0, y - .03, -d / 2 + .16, w - .1, .03, .24, '#6a5040'); m.box(0, y - .045, -d / 2 + .27, w - .1, .015, .015, ROSE, { glow: 1.6 });
        let x = -w / 2 + .1;
        while (x < w / 2 - .1) { const bw = .06 + r() * .04, bh = .18 + r() * .14; m.cyl(x, y, -d / 2 + .15, bw / 2, bh, pick(r, ['#3a5a3a', '#6a3a2a', '#cfe3ea', '#5a2a3a', '#8a7a5a', '#2a3a5a']), { sides: 6, fine: y !== 1.6 }); x += bw + .02 + r() * .05; }
      }
      m.box(0, h - .08, 0, w, .08, d, '#2a1e1a'); m.box(-1.6, .95, .02, .4, .18, .3, '#2e3138'); m.box(-1.6, 1.13, -.02, .34, .16, .03, BLACK, { rx: -.3 });
      for (let k = 0; k < 6; k++) m.box(-w / 2 + .5 + k * .9, .95, .1, .2, .004, .14, '#e8e2d4', T);
    }),
    kind('hotel-stool', .42, .42, .95, 'low', 'a bar stool with a low back', (m, r, { w, h }) => {
      m.cyl(0, 0, 0, .17, .02, BRASS_D, { sides: 8 }); m.cyl(0, .02, 0, .025, .7, BRASS, { sides: 6 }); m.cyl(0, .3, 0, .15, .015, BRASS, { sides: 8, fine: true });
      m.cyl(0, .72, 0, .19, .07, '#5a2a2e', { sides: 8 }); m.box(0, .79, -.15, .32, .16, .04, '#5a2a2e', { rx: -.15 });
    }),
    kind('stool-jacket', .42, .42, .95, 'low', 'a bar stool with a jacket left over its back', (m, r) => {
      m.cyl(0, 0, 0, .17, .02, BRASS_D, { sides: 8 }); m.cyl(0, .02, 0, .025, .7, BRASS, { sides: 6 });
      m.cyl(0, .72, 0, .19, .07, '#5a2a2e', { sides: 8 }); m.box(0, .79, -.15, .32, .16, .04, '#5a2a2e', { rx: -.15 });
      const J = '#4a5a52';
      m.box(0, .72, -.2, .42, .26, .05, J, { rx: -.1 }); m.box(0, .5, -.24, .4, .3, .04, J, { rx: .15 });
      for (const s of [-1, 1]) m.box(s * .2, .38, -.2, .1, .42, .07, shade(J, .85), { rz: s * .2 });
      m.box(0, .96, -.17, .3, .04, .08, shade(J, .8));
    }),
    kind('banquette', 2.0, .55, .95, 'low', 'a buttoned wall banquette', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, .42, d, '#3a1e24'); m.box(0, .42, .04, w - .04, .06, d - .12, '#5a2a34');
      m.box(0, .45, -d / 2 + .08, w, h - .45, .16, '#5a2a34');
      for (let k = 0; k < 6; k++) m.box(-w / 2 + .2 + k * (w - .4) / 5, .7, -d / 2 + .165, .02, .02, .01, '#2a1218', T);
    }),
    kind('cocktail-table', .6, .6, .75, 'low', 'a small round marble table, two drinks, a candle', (m, r, { h }) => {
      m.cyl(0, h - .03, 0, .3, .03, '#d8d0c4', { sides: 10 }); m.cyl(0, .02, 0, .03, h - .05, BRASS, { sides: 6 }); m.cyl(0, 0, 0, .18, .02, BRASS_D, { sides: 8 });
      m.cyl(-.1, h, .05, .03, .1, '#cfe3ea', { sides: 6, fine: true }); m.cyl(-.1, h + .01, .05, .025, .05, pick(r, DRINKS), { sides: 6, fine: true });
      m.cyl(.1, h, -.06, .012, .09, '#cfe3ea', { sides: 5, fine: true }); m.cyl(.1, h + .09, -.06, .05, .05, pick(r, DRINKS), { sides: 6, top: .06, fine: true });
      m.cyl(.05, h, .12, .03, .05, '#e8e2d4', { sides: 6 }); m.box(.05, h + .05, .12, .01, .02, .01, '#fff2dc', { glow: 2, fine: true });
    }),
    kind('pendant', .4, .4, 3.4, 'walkOver', 'a pendant lamp over the bar (lit)', (m, r, { h }) => {
      m.box(0, h - 1.1, 0, .01, 1.1, .01, BLACK, T); m.cyl(0, h - 1.3, 0, .16, .2, '#2a1e1a', { sides: 8, top: .05 }); m.cyl(0, h - 1.32, 0, .12, .03, '#fff2dc', { sides: 8, glow: 2.4 });
    }),
    kind('sconce', .3, .12, 2.2, 'walkOver', 'a wall sconce (lit)', (m, r, { d }) => {
      const z = -d / 2 + .02; m.box(0, 1.7, z, .08, .2, .03, BRASS); m.box(0, 1.72, z + .06, .18, .18, .08, '#fff2dc', { glow: 1.8 });
      m.box(0, 1.6, z, .5, .5, .005, shade(WARM, .3), { glow: .5, fine: true });
    }),
    kind('dropped-tray', .8, .6, .06, 'walkOver', 'a room-service tray dropped: plates, a cloche rolled away, food and a spilled glass', (m, r) => {
      m.box(0, 0, 0, .5, .015, .36, CHROME, { ry: .3 }); m.cyl(-.1, .015, .05, .1, .015, '#eceeef', { sides: 10 });
      m.flat(.25, .04, .1, .3, .22, '#6a3a24', { ry: .6 }); m.flat(.3, .042, .05, .12, .08, '#9a6a3a', { ry: 1.2 });
      m.cyl(-.3, .08, -.18, .12, .1, CHROME, { rx: 1.4, sides: 8 }); m.cyl(.1, .02, -.2, .03, .1, '#cfe3ea', { rz: 1.57, sides: 6 });
      for (let k = 0; k < 5; k++) m.flat((r() - .5) * .7, .041, (r() - .5) * .5, .06, .04, pick(r, ['#b89a78', '#5a8a3a', '#e8e2d4']), { ry: r() * 3, fine: true });
    }),
    kind('wall-art', 1.2, .08, 2.2, 'walkOver', 'a framed abstract print (colour fields only)', (m, r, { w, d }) => {
      const z = -d / 2 + .02, c1 = pick(r, ['#8a4a4a', '#3a5a6a', '#6a6a3a', '#5a3a5a']);
      m.box(0, 1.2, z, w, .8, .03, BRASS_D); m.box(0, 1.24, z + .02, w - .1, .72, .005, '#d8d0c0');
      m.box(-.2, 1.34, z + .025, .5, .5, .004, c1); m.box(.25, 1.3, z + .025, .3, .3, .004, shade(c1, .6)); m.box(.1, 1.68, z + .025, .7, .06, .004, '#2a2a2e');
    }),
    kind('luggage-rack', 2.4, .5, 1.9, 'cover', 'heavy racking of guests\' cases, each tagged, waiting to be collected', (m, r, { w, d, h }) => {
      for (const s of [-1, 1]) for (const t of [-1, 1]) m.box(s * (w / 2 - .03), 0, t * (d / 2 - .03), .05, h, .05, STEEL_D);
      for (const y of [.1, .75, 1.4]) {
        m.box(0, y, 0, w - .02, .03, d - .02, STEEL);
        let x = -w / 2 + .08;
        while (x < w / 2 - .25) { const cw = .18 + r() * .22, ch = .35 + r() * .22; if (y + .03 + ch < h - .02) suitcase(m, r, x + cw / 2, y + .03, (r() - .5) * .06, cw, ch, d - .12, pick(r, CASES), { tag: pick(r, [LEMON, '#e8e2d4', '#e8e2d4']) }); x += cw + .03; }
      }
      m.box(0, h - .03, 0, w, .03, d, STEEL);
    }),
    kind('luggage-rack-b', 2.4, .5, 1.9, 'cover', 'racking with cases lying flat and a golf bag', (m, r, { w, d, h }) => {
      for (const s of [-1, 1]) for (const t of [-1, 1]) m.box(s * (w / 2 - .03), 0, t * (d / 2 - .03), .05, h, .05, STEEL_D);
      for (const y of [.1, .75, 1.4]) {
        m.box(0, y, 0, w - .02, .03, d - .02, STEEL);
        let x = -w / 2 + .1;
        while (x < w / 2 - .4) { const cw = .5 + r() * .25; suitcase(m, r, x + cw / 2, y + .03, 0, cw, .2, d - .1, pick(r, CASES), { flat: true, tag: LEMON }); if (r() < .6) suitcase(m, r, x + cw / 2, y + .23, 0, cw - .1, .16, d - .16, pick(r, CASES), { flat: true, tag: '#e8e2d4' }); x += cw + .05; }
      }
      m.cyl(w / 2 - .2, .13, 0, .1, .9, '#2a4a3a', { sides: 8 }); m.box(0, h - .03, 0, w, .03, d, STEEL);
    }),
    kind('garment-rail', 1.4, .5, 1.8, 'cover', 'a wheeled rail of bagged suits and dresses', (m, r, { w, d, h }) => {
      for (const s of [-1, 1]) { m.box(s * (w / 2 - .03), .05, 0, .03, h - .05, .03, CHROME); m.box(s * (w / 2 - .03), .02, 0, .05, .03, d - .04, CHROME); }
      m.box(0, h - .03, 0, w - .02, .03, .03, CHROME);
      for (let k = 0; k < 8; k++) { const x = -w / 2 + .12 + k * (w - .24) / 7; m.box(x, .45 + r() * .2, 0, .08, h - .75 - r() * .2, d - .08, pick(r, ['#2a2a30', '#3a3a44', '#dcd8d0', '#4a3a3a', '#1e2230'])); m.box(x, h - .15, 0, .01, .12, .01, CHROME, T); }
    }),
    kind('tag-desk', 1.2, .5, 1.0, 'low', 'the tagging desk: a tag printer, a roll of lemon tags, a ledger tablet', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h - .04, d, '#4a4e56'); m.box(0, h - .04, 0, w + .02, .04, d + .02, STEEL);
      m.box(-.3, h, 0, .26, .14, .22, '#2e3138'); m.box(-.3, h + .14, .08, .2, .004, .06, LEMON, T);
      for (let k = 0; k < 6; k++) m.box(.1 + r() * .35, h + .002 * k, (r() - .5) * .3, .06, .002, .1, k % 2 ? LEMON : '#e8e2d4', { ry: r() * 3, fine: true });
      m.box(.3, h, -.05, .22, .015, .28, BLACK); m.box(.3, h + .015, -.05, .19, .003, .24, '#9fb8d8', { glow: 1.2 });
    }),
    kind('cases-down', 1.0, .7, .3, 'walkOver', 'suitcases set down on the floor, tagged', (m, r) => {
      suitcase(m, r, -.2, 0, 0, .55, .22, .4, pick(r, CASES), { flat: true, tag: LEMON, ry: .1 });
      suitcase(m, r, .25, 0, .1, .45, .2, .35, pick(r, CASES), { flat: true, tag: LEMON, ry: -.3 });
      m.box(.3, 0, -.22, .25, .18, .18, '#5b4a3a');
    }),
    kind('kitchen-fridge', 1.4, .7, 2.0, 'cover', 'a double steel kitchen fridge', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h, d, '#a9b0b8'); m.box(0, .08, d / 2, .01, h - .2, .01, STEEL_D);
      for (const s of [-1, 1]) m.box(s * .08, h * .45, d / 2 + .01, .03, .5, .03, CHROME, T);
      m.box(.4, h - .25, d / 2 + .005, .16, .06, .005, '#6aff5a', { glow: 1.4 });
      m.box(0, h, 0, w - .1, .2, d - .1, '#8a7a5a', T);
    }),
    kind('kitchen-range', 1.8, .7, .92, 'low', 'a six-burner range, pans left on, two burners still lit, the hood above', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h - .04, d, '#9aa1a8'); m.box(0, .1, d / 2, w - .1, .5, .01, '#3a3d44');
      for (let k = 0; k < 6; k++) m.cyl(-w / 2 + .2 + k * (w - .4) / 5, .7, d / 2 + .01, .02, .02, BLACK, { rx: Math.PI / 2, sides: 6, fine: true });
      m.box(0, h - .04, 0, w, .04, d, '#1e2024');
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const x = -.55 + i * .55, z = -.14 + j * .3, lit = (i + j) % 3 === 0; m.cyl(x, h, z, .1, .015, lit ? BLUE : '#2e3138', { sides: 8, ...(lit ? { glow: 1.6 } : {}) }); }
      m.cyl(-.55, h + .015, -.14, .14, .1, '#3a3d44', { sides: 8 }); m.box(-.55, h + .07, -.35, .04, .03, .22, BLACK);
      m.cyl(.55, h + .015, .16, .16, .05, '#2e3138', { sides: 8 }); m.box(.55, h + .04, .4, .04, .03, .24, BLACK);
      m.cyl(0, h + .015, -.14, .13, .2, CHROME, { sides: 8 }); m.cyl(0, h + .21, -.14, .135, .02, STEEL_D, { sides: 8 });
      // the hood on the wall above
      m.box(0, 1.9, -d / 2 + .3, w + .1, .5, .6, '#b6bcc4'); m.box(0, 2.4, -d / 2 + .15, .4, 1.0, .3, '#9aa1a8');
      m.box(0, 1.88, -d / 2 + .3, w - .1, .02, .5, '#5a5e66', T);
    }),
    kind('steel-counter', 2.0, .7, .92, 'low', 'a steel prep counter: boards, a knife, vegetables mid-chop, a shelf of pans under', (m, r, { w, d, h }) => {
      m.box(0, h - .04, 0, w, .04, d, '#b6bcc4'); m.box(0, .15, 0, w - .06, .02, d - .06, '#9aa1a8');
      for (const s of [-1, 1]) for (const t of [-1, 1]) m.box(s * (w / 2 - .04), 0, t * (d / 2 - .04), .04, h - .04, .04, STEEL);
      for (let k = 0; k < 4; k++) m.cyl(-.7 + k * .45, .17, 0, .13, .12, pick(r, [STEEL_D, '#6a6e76']), { sides: 8 });
      m.box(-.4, h, .05, .5, .03, .34, '#d8c8a8'); m.box(-.35, h + .03, .15, .26, .012, .03, CHROME, T); m.box(-.2, h + .03, .15, .1, .02, .03, BLACK, T);
      for (let k = 0; k < 7; k++) m.box(-.55 + r() * .3, h + .03, -.05 + r() * .2, .05, .03, .05, pick(r, ['#c8574a', '#5a9a3a', '#e8d8a0']), { fine: true });
      m.box(.45, h, 0, .45, .08, .3, '#eceeef'); m.box(.45, h + .08, 0, .4, .004, .25, '#b8423a', T);
      m.box(0, h, -d / 2 + .02, w, .45, .03, '#c9ced4');
    }),
    kind('steel-counter-b', 2.0, .7, .92, 'low', 'a steel counter: the mixer, a bowl of dough, trays of plated starters', (m, r, { w, d, h }) => {
      m.box(0, h - .04, 0, w, .04, d, '#b6bcc4'); m.box(0, 0, 0, w - .06, h - .04, d - .06, '#9aa1a8');
      for (let k = 0; k < 2; k++) m.box(-w / 4 + k * w / 2, .1, d / 2 - .02, w / 2 - .06, h - .25, .01, '#8a9199');
      m.box(-.6, h, -.1, .3, .4, .35, '#e8e8ea'); m.box(-.6, h + .3, .05, .12, .12, .22, '#e8e8ea'); m.cyl(-.6, h, .1, .12, .14, CHROME, { sides: 8 });
      for (let i = 0; i < 2; i++) { m.box(.2 + i * .5, h, 0, .4, .02, .5, '#1e2024'); for (let k = 0; k < 6; k++) { m.cyl(.07 + i * .5 + (k % 3) * .13, h + .02, -.13 + Math.floor(k / 3) * .25, .05, .015, '#eceeef', { sides: 8, fine: true }); m.cyl(.07 + i * .5 + (k % 3) * .13, h + .035, -.13 + Math.floor(k / 3) * .25, .025, .02, pick(r, ['#5a9a3a', '#c8574a', '#e8d8a0']), { sides: 6, fine: true }); } }
      m.box(0, h, -d / 2 + .02, w, .45, .03, '#c9ced4');
    }),
    kind('combi-ovens', .9, .7, 1.9, 'cover', 'two combi ovens stacked on a stand, their panels lit', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, .3, d - .1, STEEL_D);
      for (const y of [.3, 1.1]) { m.box(0, y, 0, w, .78, d, '#a9b0b8'); m.box(-.08, y + .1, d / 2, w - .3, .58, .01, '#2a2d33'); m.box(-.08, y + .14, d / 2 + .005, w - .36, .5, .004, '#5a3a2a', { glow: .4 }); m.box(w / 2 - .1, y + .45, d / 2 + .005, .1, .14, .005, '#6aff5a', { glow: 1.4 }); }
    }),
    kind('pot-sink', 1.6, .7, .92, 'low', 'the pot sink, stacked with dirty pans, the tap running', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h - .2, d, '#9aa1a8'); m.box(0, h - .2, 0, w, .2, d, '#b6bcc4');
      for (const s of [-1, 1]) m.box(s * .36, h - .18, .03, .62, .19, .5, '#5a5e66');
      m.box(0, h, -d / 2 + .06, .04, .38, .04, CHROME); m.box(0, h + .34, -d / 2 + .16, .04, .04, .2, CHROME); m.box(0, h - .1, -d / 2 + .25, .015, .45, .015, PALE, { glow: .8, fine: true });
      for (let k = 0; k < 5; k++) m.cyl(-.4 + r() * .8, h - .1, (r() - .5) * .2, .1 + r() * .06, .08, pick(r, [STEEL_D, '#6a6e76', '#2e3138']), { sides: 8, rx: (r() - .5) * .6 });
      m.box(0, h, -d / 2 + .02, w, .45, .03, '#c9ced4');
    }),
    kind('dry-store', 1.2, .45, 1.9, 'cover', 'a dry-store rack: sacks, tins, boxed stock', (m, r, { w, d, h }) => {
      for (const s of [-1, 1]) for (const t of [-1, 1]) m.box(s * (w / 2 - .02), 0, t * (d / 2 - .02), .035, h, .035, CHROME);
      for (let k = 0; k < 5; k++) { const y = .1 + k * .42; m.box(0, y, 0, w, .02, d, '#a9b0b8'); if (k < 4) for (let x = -w / 2 + .1; x < w / 2 - .1; x += .18 + r() * .06) { if (k === 0) m.box(x + .06, y + .02, 0, .16, .3, d - .1, '#c8b890', { ry: (r() - .5) * .2 }); else m.cyl(x + .06, y + .02, 0, .05, .12 + r() * .1, pick(r, ['#c8574a', '#e8e2d4', '#5a9a3a', '#d8d880', '#3f6f8f']), { sides: 6, fine: k !== 2 }); } }
    }),
    kind('speed-rack', 1.2, .6, 1.8, 'cover', 'a speed rack of sheet trays (bread rolls, pastry)', (m, r, { w, d, h }) => {
      for (const s of [-1, 1]) for (const t of [-1, 1]) m.box(s * (w / 2 - .02), 0, t * (d / 2 - .02), .03, h, .03, CHROME);
      for (let k = 0; k < 11; k++) { const y = .15 + k * .15; m.box(0, y, 0, w - .06, .015, d - .04, '#a9b0b8'); if (r() < .6) for (let j = 0; j < 6; j++) m.box(-w / 2 + .15 + j * .18, y + .015, (r() - .5) * .3, .12, .06, .1, '#b89a78', { fine: k % 3 !== 0 }); }
    }),
    kind('prep-island', 2.4, 1.0, .92, 'low', 'the prep island mid-job: dough on the board, bowls, a tray of garnish, a scale', (m, r, { w, d, h }) => {
      m.box(0, h - .04, 0, w, .04, d, '#b6bcc4'); m.box(0, .12, 0, w - .06, .02, d - .06, '#9aa1a8');
      for (const s of [-1, 1]) for (const t of [-1, 1]) m.box(s * (w / 2 - .04), 0, t * (d / 2 - .04), .05, h - .04, .05, STEEL);
      for (let k = 0; k < 3; k++) m.box(-.7 + k * .7, .14, 0, .5, .25, .6, pick(r, ['#c8b890', '#e8e2d4', '#5a5e66']));
      m.box(-.6, h, 0, .7, .03, .5, '#c8a878'); m.cyl(-.6, h + .03, 0, .16, .06, '#e8dcc0', { sides: 8 });
      for (let k = 0; k < 4; k++) m.cyl(.1 + k * .22, h, -.25 + (k % 2) * .1, .09, .1, CHROME, { sides: 8, top: .11 });
      for (let k = 0; k < 4; k++) m.cyl(.1 + k * .22, h + .06, -.25 + (k % 2) * .1, .07, .03, pick(r, ['#5a9a3a', '#c8574a', '#e8d8a0', '#8a5a3a']), { sides: 6, fine: true });
      m.box(.7, h, .25, .5, .02, .3, '#1e2024'); m.box(.95, h, -.2, .2, .04, .2, '#eceeef'); m.box(.95, h + .04, -.2, .12, .004, .06, '#6aff5a', { glow: 1.2, fine: true });
    }),
    kind('heat-pass', 1.6, .3, 1.8, 'walkOver', 'the pass: a steel shelf under heat lamps still glowing, a plate waiting', (m, r, { w, d }) => {
      const z = -d / 2 + .12;
      m.box(0, 1.1, z, w, .04, .24, '#b6bcc4'); m.box(0, 1.65, z, w, .06, .2, STEEL_D);
      for (let k = 0; k < 3; k++) m.box(-.5 + k * .5, 1.6, z + .02, .12, .05, .12, RED, { glow: 1.6 });
      m.box(0, 1.14, z, w - .1, .005, .2, shade(RED, .35), { glow: .6, fine: true });
      m.cyl(.3, 1.14, z, .12, .02, '#eceeef', { sides: 8 }); m.cyl(.3, 1.16, z, .06, .03, '#8a5a3a', { sides: 6 });
      m.box(-.7, 1.3, z + .04, .04, .1, .01, '#e8e2d4', T); m.box(-.55, 1.3, z + .04, .04, .1, .01, '#e8e2d4', T);
    }),
    kind('pot-spill', 1.0, .8, .12, 'walkOver', 'a stockpot dropped by the door, soup across the tiles', (m, r) => {
      m.flat(0, .038, 0, .8, .55, '#6a4a24', { ry: .4 }); m.flat(.2, .04, -.1, .4, .35, '#7a5a2a', { ry: 1.1 }); m.flat(-.3, .039, .2, .25, .2, '#6a4a24', { ry: .2 });
      m.cyl(-.3, .17, -.1, .17, .34, STEEL_D, { rz: Math.PI / 2, ry: .5, sides: 10 });
      m.box(.35, 0, .25, .3, .02, .06, '#2a2d33', { ry: .7 });
    }),
    kind('kitchen-mat', 5.0, .6, .02, 'walkOver', 'anti-fatigue mats along the line', (m, r, { w, d }) => {
      m.flat(-1.3, .031, 0, 2.2, d, '#1e1f22'); m.flat(1.3, .031, 0, 2.2, d, '#1e1f22');
      for (let k = 0; k < 10; k++) m.flat(-2.3 + k * .5, .033, 0, .04, d - .1, '#2e3035', T);
    }),

    // ------------------------------------------------------------------ luxury tower
    kind('water-wall', 3.0, .5, .45, 'low', 'the water wall: a lit sheet of water down a stone wall into its trough (lit)', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h, d, MARBLE_D, { top: '#3e3c44' }); m.box(0, h - .04, .02, w - .1, .02, d - .14, '#c8d2e8', { glow: .7 });
      const z = -d / 2 + .04;
      m.box(0, h, z, w, 2.9, .06, '#3a3e48'); m.box(0, h + .05, z + .035, w - .2, 2.7, .01, '#d4dcf0', { glow: 1.1 });
      for (let k = 0; k < 16; k++) m.box(-w / 2 + .2 + r() * (w - .4), h + .1 + r() * 1.5, z + .042, .015, .6 + r() * .9, .004, '#e8f0ff', { glow: 1.6, fine: true });
      m.box(0, h + 2.75, z + .04, w - .1, .04, .06, BRASS);
    }),
    kind('stone-panels', 2.6, .06, 3.2, 'walkOver', 'stone-look wall panels with veins and brass joints', (m, r, { w, d, h }) => {
      const z = -d / 2 + .02;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) {
        const pw = w / 2 - .02, ph = .95, x = -w / 4 + i * w / 2, y = .08 + j * 1.0;
        m.box(x, y, z, pw, ph, .03, pick(r, [STONE, STONE_L, '#a39c92']));
        for (let k = 0; k < 2; k++) m.box(x + (r() - .5) * pw * .6, y + r() * ph * .7, z + .016, pw * (.3 + r() * .4), .01, .002, '#6a645c', { rz: (r() - .5) * .8, fine: true });
      }
      m.box(0, 0, z, w, .08, .04, BRASS_D);
    }),
    kind('lux-sofa', 2.2, .9, .8, 'low', 'a long leather sofa on a black plinth, bolster cushions', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w - .1, .08, d - .1, BLACK); m.box(0, .08, 0, w, .3, d, '#6a5a4c');
      m.box(0, .38, .06, w - .24, .1, d - .22, '#7a6a5a'); m.box(0, .38, -d / 2 + .1, w, h - .38, .2, '#6a5a4c');
      for (const s of [-1, 1]) m.box(s * (w / 2 - .06), .08, 0, .12, .5, d, '#5a4c40');
      m.cyl(-.7, .5, -.2, .09, .5, CREAM, { rz: Math.PI / 2, sides: 8 }); m.box(.5, .48, -.22, .4, .32, .12, '#2c3a4c', { rx: -.3 });
      for (let k = 0; k < 3; k++) m.box(-w / 3 + k * w / 3, .481, .06, .005, .005, d - .3, shade('#7a6a5a', .8), T);
    }),
    kind('glass-table', 1.3, .7, .4, 'low', 'a black glass coffee table on a brass frame, a sculpture bowl, magazines', (m, r, { w, d, h }) => {
      for (const s of [-1, 1]) for (const t of [-1, 1]) m.box(s * (w / 2 - .03), 0, t * (d / 2 - .03), .03, h - .02, .03, BRASS);
      m.box(0, .05, 0, w - .04, .02, d - .04, BRASS); m.box(0, h - .02, 0, w, .02, d, '#1e2024', { glow: .05 });
      m.cyl(-.3, h, 0, .14, .07, '#b3aca1', { sides: 8, top: .18 }); m.box(.3, h, .05, .24, .02, .3, '#8a3a4a', { ry: .2 }); m.box(.34, h + .02, .02, .22, .015, .28, '#e8e4d8', { ry: -.1 });
    }),
    kind('planter-long', 1.6, .5, .7, 'low', 'a long stone planter of dead ornamental grass', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h - .1, d, MARBLE_D); m.box(0, h - .1, 0, w - .06, .02, d - .06, '#2a221c');
      for (let k = 0; k < 22; k++) m.box(-w / 2 + .1 + r() * (w - .2), h - .1, (r() - .5) * (d - .15), .015, .2 + r() * .35, .015, pick(r, ['#7a6a40', '#6a5a38', '#8a7a4a']), { rx: (r() - .5) * .7, rz: (r() - .5) * .7, fine: k > 8 });
    }),
    kind('concierge-podium', 1.2, .6, 1.1, 'low', 'the concierge podium: a lit edge, a tablet, a bell, a card tray', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w - .1, h - .06, d - .1, '#2a2d33'); m.box(0, h - .06, 0, w, .06, d, BRASS);
      m.box(0, .05, d / 2 - .045, w - .14, .02, .01, WARM, { glow: 1.8 });
      m.box(-.2, h, 0, .3, .015, .22, BLACK); m.box(-.2, h + .015, 0, .27, .003, .19, '#9fb8d8', { glow: 1.2 }); m.cyl(.3, h, .05, .05, .04, BRASS, { sides: 8 });
    }),
    kind('lux-sculpture', .7, .7, 1.25, 'low', 'an abstract stone sculpture on a plinth (a spotlit ring)', (m, r, { w, h }) => {
      m.box(0, 0, 0, w - .1, .7, w - .1, '#d8d4cc'); m.box(0, .7, 0, .1, .1, .1, BLACK);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; m.box(Math.cos(a) * .18, .95 + Math.sin(a) * .18, 0, .1, .1, .08, STONE_L, { rz: a }); }
      m.flat(0, .038, 0, .9, .9, shade(WARM, .5), { glow: .25 });
    }),
    kind('toppled-cart', 1.8, 1.0, .75, 'low', 'the brass luggage cart knocked on its side, cases spilled round it', (m, r, { w, d }) => {
      // on its side: the deck stands up along -z, the arch lies along the floor toward +z
      m.box(0, 0, -d / 2 + .08, w, .6, .05, '#5a2a30', { rx: .05 });
      for (const s of [-1, 1]) { m.cyl(s * (w / 2 - .05), .03, 0, .02, d * .9, BRASS, { rx: Math.PI / 2, sides: 6 }); m.cyl(s * (w / 2 - .12), .5, -d / 2 + .02, .05, .1, BLACK, { rx: Math.PI / 2, sides: 6 }); }
      m.box(0, .02, d / 2 - .04, w - .06, .04, .04, BRASS);
      suitcase(m, r, -.4, 0, -.1, .6, .3, .45, '#6a2a2e', { flat: true, tag: LEMON, ry: .3 });
      suitcase(m, r, .35, 0, .12, .5, .28, .4, '#2c3a4c', { flat: true, tag: LEMON, ry: -.5 });
      m.box(.1, .28, -.1, .5, .2, .35, '#1e1f24', { ry: .8 });
    }),
    kind('spilled-case', .8, .6, .2, 'walkOver', 'a suitcase burst open: folded clothes, a wash bag', (m, r) => {
      m.box(-.18, 0, 0, .4, .12, .5, '#7a6a58', { ry: .1 }); m.box(.22, 0, 0, .4, .04, .5, '#7a6a58', { ry: -.05 });
      for (let k = 0; k < 6; k++) m.box((r() - .3) * .6, .04 + k * .01, (r() - .5) * .4, .22, .03, .16, pick(r, ['#dcd8d0', '#3a4a5a', '#8a3a4a', '#2a2a30']), { ry: r() * 3 });
    }),
    kind('drag-mark', 1.6, .4, .01, 'walkOver', 'an old smeared drag mark on the stone (darkened)', (m, r, { w }) => {
      for (let k = 0; k < 6; k++) m.flat(-w / 2 + .15 + k * .25, .037 + k * .0004, (r() - .5) * .08, .3, .14 - k * .012, shade(DRY, .9 + r() * .2), { ry: (r() - .5) * .2 });
      m.flat(w / 2 - .1, .04, .05, .12, .1, DRY, { ry: .6 });
    }),
    kind('designer-bag', .45, .35, .25, 'walkOver', 'a designer handbag dropped, its chain strap out, things spilled', (m, r) => {
      m.box(0, 0, 0, .34, .22, .12, '#d8c8b0', { rz: 1.45 }); m.box(0, .23, 0, .1, .02, .06, BRASS, T);
      for (let k = 0; k < 6; k++) m.box(.1 + k * .04, .005, .12 + Math.sin(k) * .04, .03, .01, .01, BRASS, T);
      m.box(-.12, 0, .12, .08, .015, .14, BLACK); m.box(-.1, .015, .12, .06, .003, .1, '#b8e8c8', { glow: 1.6 });
      m.cyl(.14, .02, -.1, .02, .09, '#8a2a3a', { rz: 1.57, sides: 6 });
    }),
    kind('lost-heel', .3, .12, .12, 'walkOver', 'one shoe: a high heel on its side', m => {
      m.box(0, 0, 0, .08, .03, .24, '#1e1f24', { rz: 1.3 }); m.box(.02, .02, -.1, .02, .1, .02, '#1e1f24', { rz: 1.3 }); m.box(0, .04, .06, .06, .03, .08, '#5a2a30', { rz: 1.3 });
    }),
    kind('lux-pendant', 1.2, 1.2, 3.4, 'walkOver', 'a cluster of glass globe pendants (lit)', (m, r, { h }) => {
      for (let k = 0; k < 7; k++) { const a = k * 2.4, rad = k ? .35 + r() * .15 : 0, y = h - .8 - r() * .5, x = Math.cos(a) * rad, z = Math.sin(a) * rad; m.box(x, y, z, .005, h - y, .005, BLACK, T); m.cyl(x, y - .12, z, .07, .14, '#fff2dc', { sides: 6, glow: 2.2 }); }
    }),
    kind('fireplace', 1.8, .3, 1.2, 'walkOver', 'an electric fireplace in a stone surround, its flames lit red and white', (m, r, { w, d }) => {
      const z = -d / 2 + .03;
      m.box(0, 0, z + .08, w + .2, .06, .3, MARBLE_D); m.box(0, .06, z, w, 1.1, .1, STONE_L); m.box(0, .3, z + .05, w - .4, .45, .02, BLACK);
      for (let k = 0; k < 9; k++) m.box(-.6 + k * .15, .32, z + .062, .08, .12 + r() * .22, .006, k % 3 ? RED : '#ffe8e0', { glow: 1.8 });
      m.box(0, .31, z + .062, w - .45, .03, .007, '#fff2e8', { glow: 2 });
      m.box(0, 1.16, z + .02, w + .2, .05, .18, STONE);
      m.cyl(-.6, 1.21, z + .05, .06, .25, '#2a3a44', { sides: 8 }); m.box(.5, 1.21, z + .03, .3, .2, .03, BRASS_D);
    }),
    kind('wing-chair', .8, .8, 1.1, 'low', 'a wing-back armchair', (m, r, { w, d, h }) => {
      m.box(0, .1, 0, w, .32, d, '#3a4a4a'); m.box(0, .42, .05, w - .2, .08, d - .2, '#4a5a5a');
      m.box(0, .42, -d / 2 + .08, w, h - .42, .16, '#3a4a4a', { rx: -.08 });
      for (const s of [-1, 1]) { m.box(s * (w / 2 - .06), .1, 0, .12, .5, d, '#344242'); m.box(s * (w / 2 - .06), .6, -d / 2 + .2, .1, .4, .24, '#3a4a4a'); }
      for (const s of [-1, 1]) for (const t of [-1, 1]) m.box(s * (w / 2 - .08), 0, t * (d / 2 - .08), .05, .1, .05, WALNUT, T);
    }),
    kind('grand-piano', 1.5, 1.8, 1.0, 'low', 'a black grand piano, its lid propped, a glass left on it', (m, r, { w, d, h }) => {
      for (const [x, z] of [[-.6, .6], [.6, .6], [0, -.7]]) m.box(x, 0, z, .1, .62, .1, BLACK);
      m.box(0, .62, .15, w, .3, d - .5, '#141518'); m.box(-.2, .62, -.62, w - .5, .3, .5, '#141518'); m.box(.3, .62, -.55, .7, .3, .3, '#141518', { ry: .7 });
      m.box(0, .72, d / 2 - .1, w, .08, .22, '#eceeef'); for (let k = 0; k < 14; k++) m.box(-w / 2 + .08 + k * .1, .8, d / 2 - .12, .04, .015, .12, BLACK, T);
      m.box(0, .92, .1, w - .05, .02, d - .5, '#1e2024', { rx: -.5 }); m.box(.5, .92, -.2, .02, .35, .02, BLACK);
      m.cyl(-.4, .92, .5, .03, .1, '#cfe3ea', { sides: 6, fine: true });
    }),
    kind('piano-bench', .9, .38, .5, 'low', 'the piano bench', (m, r, { w, d, h }) => { m.box(0, h - .08, 0, w, .08, d, '#141518'); m.box(0, h - .02, 0, w - .06, .03, d - .06, '#2a2226'); for (const s of [-1, 1]) m.box(s * (w / 2 - .05), 0, 0, .06, h - .08, d - .06, BLACK); }),
    kind('bar-cart', .8, .45, .9, 'low', 'a brass bar cart of crystal decanters', (m, r, { w, d, h }) => {
      for (const s of [-1, 1]) for (const t of [-1, 1]) m.box(s * (w / 2 - .02), 0, t * (d / 2 - .02), .02, h, .02, BRASS);
      for (const y of [.15, .6]) m.box(0, y, 0, w, .02, d, '#9fb4b8', { glow: .05 });
      for (let k = 0; k < 4; k++) { const x = -.28 + k * .19; m.cyl(x, .62, 0, .05, .16, '#cfe3ea', { sides: 6 }); m.cyl(x, .62, 0, .045, .09, pick(r, ['#8a4a2a', '#a07a5a', '#6a2a2a', '#e8e4d8']), { sides: 6 }); m.cyl(x, .78, 0, .02, .05, '#cfe3ea', { sides: 6, fine: true }); }
      m.cyl(0, .17, 0, .1, .15, CHROME, { sides: 8 }); m.cyl(0, h - .02, 0, .015, .02, BRASS, { sides: 6, fine: true });
    }),
    kind('bookcase', 1.6, .4, 2.2, 'cover', 'a walnut bookcase: books (plain spines), objects, a lamp', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h, d, WALNUT); m.box(0, .05, .02, w - .08, h - .1, d - .02, '#2a1e18');
      for (let k = 0; k < 5; k++) {
        const y = .08 + k * .42; m.box(0, y, .02, w - .08, .025, d - .04, WALNUT);
        let x = -w / 2 + .08;
        while (x < w / 2 - .1) { const bw = .03 + r() * .04, bh = .22 + r() * .12; if (r() < .85) m.box(x + bw / 2, y + .025, .02, bw, bh, d - .12, pick(r, ['#5a2a2a', '#2a3a4a', '#3a4a3a', '#6a5a3a', '#1e1f24', '#7a6a58']), { fine: k % 2 === 1 }); else { m.cyl(x + .08, y + .025, .02, .06, .18, pick(r, [CREAM, BRASS, '#3a4a5a']), { sides: 6 }); x += .12; } x += bw + .005; }
      }
    }),
    kind('bookcase-b', 1.6, .4, 2.2, 'cover', 'a walnut bookcase: fewer books, boxes, a globe', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h, d, WALNUT); m.box(0, .05, .02, w - .08, h - .1, d - .02, '#2a1e18');
      for (let k = 0; k < 5; k++) {
        const y = .08 + k * .42; m.box(0, y, .02, w - .08, .025, d - .04, WALNUT);
        if (k === 2) { m.cyl(-.3, y + .025, .02, .02, .1, BRASS, { sides: 6 }); m.cyl(-.3, y + .13, .02, .12, .2, '#3a5a6a', { sides: 8, top: .08 }); m.box(.3, y + .025, .02, .4, .15, d - .1, '#5a3a2a'); continue; }
        for (let x = -w / 2 + .1; x < w / 2 - .15; x += .06 + r() * .05) if (r() < .7) m.box(x, y + .025, .02, .04, .2 + r() * .14, d - .12, pick(r, ['#2a3a4a', '#5a4a3a', '#4a2a2a', '#dcd8d0']), { rz: r() < .1 ? .3 : 0, fine: k === 4 });
      }
    }),
    kind('floor-lamp', .4, .4, 1.7, 'walkOver', 'a slim floor lamp (lit shade)', (m, r) => { m.cyl(0, 0, 0, .15, .03, BRASS_D, { sides: 8 }); m.cyl(0, .03, 0, .015, 1.35, BRASS, { sides: 6 }); m.cyl(0, 1.35, 0, .17, .3, '#f4e8d0', { sides: 8, top: .12, glow: 1.2 }); }),
    kind('lounge-rug', 3.6, 3.0, .02, 'walkOver', 'a deep rug in front of the fire', (m, r, { w, d }) => { m.flat(0, .03, 0, w, d, '#6a5a50'); m.flat(0, .033, 0, w - .3, d - .3, '#8a7a6a'); m.flat(0, .036, 0, w - 1.2, d - 1.2, '#6a5a50'); }),
    kind('lift-doors', 1.6, .15, 2.7, 'walkOver', 'a lift standing open on its dark shaft: steel frame, the doors slid back, the call panel and arrow lit', (m, r, { w, d }) => {
      const z = -d / 2 + .02;
      m.box(0, 0, z, w, 2.55, .04, '#050507'); m.box(0, 0, z + .02, 1.0, 2.25, .01, '#020203');
      for (const s of [-1, 1]) { m.box(s * .62, 0, z + .03, .36, 2.3, .03, '#8a9099'); m.box(s * .78, 0, z + .02, .06, 2.4, .08, BRASS_D); }
      m.box(0, 2.3, z + .02, w, .12, .08, BRASS_D); m.box(0, 2.44, z + .03, .3, .1, .02, BLACK);
      m.box(-.05, 2.47, z + .045, .06, .05, .005, RED, { glow: 1.6 }); m.box(.05, 2.47, z + .045, .06, .05, .005, '#3a1a1a');
      m.box(w / 2 + .12, 1.0, z + .02, .1, .3, .02, BRASS); m.box(w / 2 + .12, 1.18, z + .035, .04, .04, .005, WARM, { glow: 1.8 }); m.box(w / 2 + .12, 1.08, z + .035, .04, .04, .005, '#5a5a5a');
      m.flat(0, .037, z + .25, 1.0, .4, '#08080a');
    }),
    kind('lift-bin', .4, .4, .9, 'low', 'a brushed steel bin and ashtray between the lifts', (m, r, { h }) => { m.cyl(0, 0, 0, .18, h - .05, '#8a9099', { sides: 10 }); m.cyl(0, h - .05, 0, .19, .05, '#1e2024', { sides: 10 }); m.cyl(0, h, 0, .1, .01, '#e8e4d8', { sides: 6, fine: true }); }),
    kind('designer-scarf', .7, .3, .02, 'walkOver', 'a silk scarf lost on the floor', m => { m.flat(0, .038, 0, .6, .2, '#8a2a3a', { ry: .2 }); m.flat(.2, .04, .05, .25, .12, '#e8d8a8', { ry: .9 }); m.flat(-.22, .039, -.04, .2, .1, '#2c3a4c', { ry: -.4 }); }),
    kind('mailboxes', 2.4, .35, 1.9, 'cover', 'a wall of brass mailboxes, a few doors hanging open, post jammed in some', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h, d, BRASS_D);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 7; j++) {
        const x = -w / 2 + .15 + i * (w - .3) / 7, y = .25 + j * .23;
        if (r() < .12) { m.box(x, y, d / 2 - .06, .22, .18, .01, '#1a1a1c'); m.box(x - .12, y, d / 2 + .08, .01, .18, .22, BRASS, { ry: .3 }); }
        else { m.box(x, y, d / 2, .26, .19, .01, BRASS); m.box(x, y + .06, d / 2 + .01, .08, .015, .005, BLACK, T); if (r() < .2) m.box(x, y + .18, d / 2, .18, .04, .04, '#e8e2d4', T); }
      }
    }),
    kind('parcel-lockers', 2.0, .5, 2.0, 'cover', 'a parcel locker bank with a lit panel (pictograms)', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h, d, '#3a4048');
      for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) { if (i === 1 && j >= 2 && j <= 3) continue; const x = -w / 2 + .25 + i * .5, y = .08 + j * .38; m.box(x, y, d / 2, .46, .34, .01, shade('#4a525c', .9 + (i + j) % 2 * .15)); m.box(x + .18, y + .15, d / 2 + .01, .02, .06, .01, CHROME, T); }
      m.box(-.25, .84, d / 2, .46, .64, .01, BLACK); m.box(-.25, 1.02, d / 2 + .005, .38, .3, .004, '#3d6aff', { glow: 1.3 }); m.box(-.25, .9, d / 2 + .005, .1, .06, .004, '#f2f2f2', { glow: 1.6 });
    }),
    kind('sort-table', 1.8, .8, .9, 'low', 'the post sorting table: trays of letters, parcels, a scanner', (m, r, { w, d, h }) => {
      m.box(0, h - .04, 0, w, .04, d, '#6a6e76'); for (const s of [-1, 1]) for (const t of [-1, 1]) m.box(s * (w / 2 - .04), 0, t * (d / 2 - .04), .04, h - .04, .04, STEEL_D);
      for (let k = 0; k < 3; k++) { m.box(-.55 + k * .38, h, -.15, .32, .1, .4, '#2a4a6a'); for (let j = 0; j < 5; j++) m.box(-.55 + k * .38, h + .02, -.3 + j * .07, .26, .08, .005, '#e8e2d4', T); }
      for (let k = 0; k < 3; k++) m.box(.5 + (r() - .5) * .3, h + k * .15, .1, .3 - k * .05, .15, .25, pick(r, ['#9a7b58', '#7d6246', '#a88a64']), { ry: r() * .5 });
      m.box(.0, h, .25, .1, .04, .16, '#1e1f24'); m.box(.0, h + .04, .25, .06, .002, .06, RED, { glow: 1.4 });
    }),
    kind('parcel-pile', .9, .7, .5, 'walkOver', 'parcels dropped in a heap', (m, r) => {
      for (let k = 0; k < 6; k++) { const s = .18 + r() * .2; m.box((r() - .5) * .6, k > 3 ? .22 : 0, (r() - .5) * .45, s, s * .7, s * .8, pick(r, ['#9a7b58', '#7d6246', '#a88a64', '#dcd8d0']), { ry: r() * 3 }); }
    }),
    kind('cctv-desk', 2.4, .8, .78, 'low', 'the camera desk: a keyboard, a radio base, the monitor wall above still showing the lobby', (m, r, { w, d, h }) => {
      m.box(0, h - .04, 0, w, .04, d, '#3a3f4c'); m.box(-w / 2 + .3, 0, 0, .5, h - .04, d - .04, '#2e323c'); m.box(w / 2 - .02, 0, 0, .04, h - .04, d, '#2e323c');
      m.box(0, h, .1, .46, .02, .16, BLACK, T); m.box(.8, h, -.2, .26, .1, .18, '#1e1f24'); m.box(.8, h + .1, -.2, .02, .22, .02, BLACK, T); m.box(.75, h + .1, -.15, .1, .01, .04, GREEN, { glow: 1.5, fine: true });
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) screen(m, r, -.75 + i * .75, 1.05 + j * .52, -d / 2 + .06, .68, .44, pick(r, ['#6a7a8a', '#5a6a5a']), j === 0 && i === 1 ? 3 : 2);
      m.cyl(-.3, h, .2, .04, .1, '#e8e2d4', { sides: 6, fine: true });
    }),
    kind('valet-keys', 1.0, .14, 2.0, 'walkOver', 'the valet key cabinet hanging open, most hooks empty', (m, r, { w, d }) => {
      const z = -d / 2 + .02;
      m.box(0, 1.1, z + .04, w - .1, .8, .08, '#2a2d33'); m.box(0, 1.14, z + .08, w - .18, .72, .005, '#3a3f4c');
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { const x = -.3 + i * .12, y = 1.25 + j * .16; m.box(x, y, z + .09, .012, .012, .03, CHROME, T); if (r() < .25) { m.box(x, y - .06, z + .1, .03, .06, .01, BLACK, T); m.box(x, y - .1, z + .1, .025, .02, .01, LEMON, T); } }
      m.box(-w / 2 - .02, 1.1, z + .38, .02, .8, w * .6, '#2a2d33', { ry: -.2 });
    }),
    kind('wall-safe', .6, .6, 1.0, 'low', 'a floor safe, its door ajar, papers and cash bands inside', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h, d, '#3a3d44'); m.box(0, .06, d / 2 - .02, w - .12, h - .12, .01, BLACK);
      m.box(-.05, .06, d / 2 + .15, .45, h - .12, .06, '#4a4e56', { ry: -1.0 }); m.cyl(-.05, .5, d / 2 + .25, .05, .03, CHROME, { rx: 1.57, sides: 8, fine: true });
      m.box(0, .3, d / 2 - .1, .3, .12, .2, '#e8e2d4'); m.box(0, .42, d / 2 - .1, .2, .04, .12, '#6a8a5a', T);
    }),
    kind('uniform-rack', 1.2, .5, 1.8, 'cover', 'a rail of spare concierge jackets (charcoal, brass buttons) and garment bags', (m, r, { w, d, h }) => {
      for (const s of [-1, 1]) { m.box(s * (w / 2 - .03), .05, 0, .03, h - .05, .03, CHROME); m.box(s * (w / 2 - .03), .02, 0, .05, .03, d - .04, CHROME); }
      m.box(0, h - .03, 0, w - .02, .03, .03, CHROME);
      for (let k = 0; k < 6; k++) { const x = -w / 2 + .15 + k * (w - .3) / 5, c = k === 4 ? '#dcd8d0' : '#2e3138'; m.box(x, .75, 0, .09, h - .9, d - .12, c); if (k !== 4) m.box(x + .05, 1.2, .08, .01, .01, .01, BRASS, T); }
    }),
    kind('water-cooler', .35, .35, 1.25, 'low', 'a water cooler, a stack of cups', (m, r, { w, h }) => {
      m.box(0, 0, 0, w, .9, w, '#e0e2e4'); m.cyl(0, .9, 0, .14, .35, '#a9c8e8', { sides: 8, glow: .15 }); m.box(0, .6, w / 2, .08, .06, .03, '#3d62ff', T); m.cyl(-.12, .9, .1, .03, .12, '#f0f0f0', { sides: 6, fine: true });
    }),
    kind('dropped-radio', .3, .2, .06, 'walkOver', 'a staff radio dropped, its light on', m => { m.box(0, 0, 0, .07, .04, .2, BLACK, { ry: .3 }); m.box(.03, .02, -.1, .012, .012, .1, BLACK, { ry: .3, fine: true }); m.box(0, .04, .03, .03, .004, .03, GREEN, { glow: 1.6 }); }),

    // ------------------------------------------------------------------ corporate tower
    kind('bag-scanner', .9, 2.4, 1.2, 'low', 'the bag scanner: conveyors, the lead-curtained tunnel, its screen, a bag stopped on the belt', (m, r, { w, d, h }) => {
      m.box(0, .6, 0, w - .1, .08, d, '#2e3138'); for (let k = 0; k < 12; k++) m.box(0, .68, -d / 2 + .1 + k * .2, w - .14, .01, .04, '#4c525b', T);
      for (const t of [-1, 1]) m.box(0, 0, t * (d / 2 - .2), w - .2, .6, .1, STEEL_D);
      m.box(0, .5, 0, w, h - .5, .9, '#c9ccd1'); m.box(0, .7, .451, w - .2, .38, .01, '#1e1f24');
      for (let k = 0; k < 6; k++) m.box(-.3 + k * .12, .7, .455, .1, .38, .005, '#3a3d44', T);
      m.box(0, h - .05, 0, w + .02, .05, .92, '#8a9099');
      m.box(0, .68, .8, .5, .3, .35, '#4a5a4a'); m.box(0, .98, .8, .2, .05, .04, BLACK, T);
      m.box(w / 2 - .1, h, -.8, .06, .3, .06, STEEL_D); m.box(w / 2 - .1, h + .25, -.8, .06, .3, .4, BLACK); m.box(w / 2 - .065, h + .27, -.8, .004, .26, .36, '#6a8aa8', { glow: 1.4 });
      m.box(w / 2 - .06, h + .3, -.8, .003, .1, .12, '#e8b0a0', { glow: 1.4, fine: true });
      m.box(-w / 2 + .1, h - .05, .45, .02, .1, .02, RED, { glow: 2 });
    }),
    kind('scan-arch', 1.0, .5, 2.2, 'walkOver', 'the walk-through detector arch (its top light blinking red)', (m, r, { w, d, h }) => {
      for (const s of [-1, 1]) m.box(s * (w / 2 - .06), 0, 0, .12, h - .15, d, '#c9ccd1');
      m.box(0, h - .15, 0, w, .15, d, '#c9ccd1'); m.box(0, h - .1, d / 2 + .005, .2, .05, .005, RED, { glow: 2 });
      for (const s of [-1, 1]) for (let k = 0; k < 5; k++) m.box(s * (w / 2 - .125), .4 + k * .3, 0, .005, .12, d - .1, k < 2 ? GREEN : '#2a3a2a', k < 2 ? { glow: 1.2, fine: true } : T);
      m.box(0, 0, 0, w - .24, .01, d, '#2a2d33');
    }),
    kind('guard-desk', 1.8, .7, 1.05, 'low', 'the guard\'s desk: raised front, monitors, a clipboard, a coffee', (m, r, { w, d, h }) => {
      m.box(0, 0, .1, w, h, .5, '#3a3f4c'); m.box(0, 0, -.2, w, .74, .3, '#2e323c'); m.box(0, .74, -.15, w, .03, .4, '#4a4e56');
      m.box(0, h, .1, w + .04, .03, .52, '#5a5e66');
      screen(m, r, -.4, .8, -.28, .5, .3, '#6a7a8a', 2); screen(m, r, .25, .8, -.28, .5, .3, '#6a7a8a', 2);
      m.box(.6, h + .03, .2, .22, .01, .3, '#e8e2d4', { ry: .2 }); m.cyl(-.7, h + .03, .15, .04, .1, '#e8e2d4', { sides: 6 });
    }),
    kind('speed-gate', .55, .25, 1.0, 'low', 'a speed-gate pedestal, its glass flaps stuck open, the lane lights blinking red and green', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h, d, '#c9ccd1', { top: '#2a2d33' }); m.box(0, h - .12, 0, w - .04, .04, d + .004, '#1e2024');
      m.box(-w / 4, h - .1, 0, .06, .02, d + .006, RED, { glow: 2 }); m.box(w / 4, h - .1, 0, .06, .02, d + .006, GREEN, { glow: 2 });
      for (const s of [-1, 1]) m.box(-w / 2 + .05, .5, s * (d / 2 + .12), .06, .4, .24, '#b4c8cc', { glow: .1, ry: s * 1.3 });
      m.box(0, h, 0, .12, .005, .12, '#2e3138', T); m.box(0, h + .005, 0, .06, .002, .06, BLUE, { glow: 1.4, fine: true });
    }),
    kind('tray-stack', .6, .45, .3, 'walkOver', 'grey scanner trays knocked off their stack', (m, r) => { for (let k = 0; k < 4; k++) m.box((r() - .5) * .2, k < 2 ? k * .08 : 0, (r() - .5) * .2 + (k > 1 ? .12 : 0), .5, .08, .36, '#5a5e66', { ry: (r() - .5) * .8 }); m.box(.05, .16, 0, .2, .02, .1, BLACK); }),
    kind('lanyards', .6, .4, .02, 'walkOver', 'dropped lanyards and passes (plain colour cards)', (m, r) => {
      for (let k = 0; k < 3; k++) { const x = (r() - .5) * .4, z = (r() - .5) * .25, c = pick(r, ['#c8574a', '#3f6f8f', '#e8e2d4', '#5a9a6a']); m.box(x, 0, z, .06, .004, .09, c, { ry: r() * 3 }); for (let j = 0; j < 5; j++) m.box(x + Math.cos(j + k) * .1, 0, z - .06 - j * .02, .02, .003, .04, c === '#e8e2d4' ? '#3a3f4c' : c, { ry: j, fine: true }); }
    }),
    kind('corp-desk', 2.6, .8, 1.1, 'low', 'the reception desk: white, a lit band, two screens, a visitor tablet', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h - .04, d, '#e0e2e4'); m.box(0, .1, d / 2 + .005, w - .1, .03, .01, BLUE, { glow: 1.6 });
      m.box(0, h - .04, .05, w + .04, .04, d + .12, '#f0f0f2'); m.box(0, .74, -d / 2 + .15, w - .1, .03, .3, '#c9ccd1');
      screen(m, r, -.6, .8, -d / 2 + .16, .42, .26, '#6a8aa8', 3); screen(m, r, .6, .8, -d / 2 + .16, .42, .26, BLUE, 1);
      m.box(0, h, .15, .24, .015, .18, BLACK); m.box(0, h + .015, .15, .21, .003, .15, '#9fb8d8', { glow: 1.3 });
    }),
    kind('logo-wall', 3.0, .08, 2.9, 'walkOver', 'the company\'s lit mark on a wall of slatted panels (a hexagon and a stroke, no lettering)', (m, r, { w, d }) => {
      const z = -d / 2 + .02;
      for (let k = 0; k < 14; k++) m.box(-w / 2 + .1 + k * (w - .2) / 13, .1, z, .12, 2.7, .04, pick(r, ['#c9ccd1', '#b6bcc4']));
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + .52; m.box(Math.cos(a) * .32, 1.75 + Math.sin(a) * .32, z + .04, .34, .06, .02, BLUE, { glow: 1.8, rz: a + 1.57 }); }
      m.box(0, 1.75, z + .04, .06, .4, .02, '#f2f4ff', { glow: 2, rz: .6 });
    }),
    kind('glass-side-table', .8, .5, .45, 'low', 'a glass side table with a spread of brochures', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w - .1, .02, d - .1, CHROME); m.box(0, .02, 0, .04, h - .04, .04, CHROME); m.box(0, h - .02, 0, w, .02, d, '#b4c8cc', { glow: .05 });
      for (let k = 0; k < 3; k++) m.box(-.2 + k * .2, h, (r() - .5) * .1, .15, .01, .2, pick(r, ['#3d62ff', '#e8e2d4', '#2a2d33']), { ry: (r() - .5) * .5 });
    }),
    kind('corp-plant', .5, .5, 1.25, 'low', 'a white planter, a dead ficus', (m, r, { w }) => {
      m.cyl(0, 0, 0, w / 2 - .02, .55, '#eceeef', { sides: 10 }); m.cyl(0, .55, 0, w / 2 - .05, .02, '#2a221c', { sides: 10 });
      m.box(0, .55, 0, .04, .5, .04, '#4a3e2c');
      for (let k = 0; k < 12; k++) m.box((r() - .5) * .4, .8 + r() * .4, (r() - .5) * .4, .08, .015, .05, pick(r, ['#6a6238', '#5a5a34', '#7a6a40']), { ry: r() * 3, rz: (r() - .5), fine: k > 4 });
    }),
    kind('tower-model', 1.2, 1.2, 1.2, 'low', 'an architect\'s model of the tower on a plinth under glass, its windows lit', (m, r, { w, d }) => {
      m.box(0, 0, 0, w, .8, d, '#eceeef'); m.box(0, .8, 0, w - .1, .02, d - .1, '#5a6a5a');
      m.box(-.1, .82, .05, .28, .38, .28, '#2c3a4c'); m.box(.22, .82, -.15, .2, .25, .2, '#3a4a5a'); m.box(-.25, .82, -.25, .16, .15, .3, '#4a5a6a');
      for (let k = 0; k < 6; k++) m.box(-.1, .86 + k * .055, .191, .22, .015, .004, PALE, { glow: 1.4, fine: true });
      m.box(0, .82, 0, w - .12, .38, d - .12, '#b4c8cc', { glow: .04 });
    }),
    kind('coffee-spill', .6, .5, .1, 'walkOver', 'a takeaway coffee dropped, the lid off, coffee across the floor', (m, r) => {
      m.flat(0, .038, 0, .5, .35, '#3a2418', { ry: .3 }); m.flat(.15, .039, .1, .25, .2, '#4a2e1c', { ry: 1 });
      m.cyl(-.15, .045, -.05, .045, .15, '#e8e2d4', { rz: 1.57, ry: .4, sides: 8 }); m.cyl(.05, .005, -.18, .05, .01, BLACK, { sides: 8 });
    }),
    kind('server-row', 3.0, 1.0, 2.1, 'cover', 'five server racks in a row, their lights blinking green, blue and red', (m, r, { w, d, h }) => serverRow(m, r, w, d, h, [GREEN, GREEN, BLUE, '#f2f2f2', RED])),
    kind('server-row-b', 3.0, 1.0, 2.1, 'cover', 'five racks, one door open on its blades, one alarm lamp red', (m, r, { w, d, h }) => { serverRow(m, r, w, d, h, [GREEN, BLUE, GREEN, LEMON, GREEN], 3); m.box(0, h, .3, .16, .08, .1, '#3a1a1a'); m.box(0, h + .08, .3, .12, .06, .08, RED, { glow: 2 }); }),
    kind('cooling-unit', .8, 1.2, 2.0, 'cover', 'the room\'s cooling unit, its panel lit', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h, d, '#d0d2d6'); for (let k = 0; k < 8; k++) m.box(w / 2, .2 + k * .2, 0, .01, .1, d - .2, '#9aa1a8', T);
      m.box(w / 2 + .005, 1.5, -.2, .005, .2, .3, '#1e1f24'); m.box(w / 2 + .008, 1.55, -.2, .004, .1, .2, GREEN, { glow: 1.6 });
    }),
    kind('battery-cabinet', .8, .9, 1.9, 'cover', 'the battery cabinet, its status lamps lit', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h, d, '#2a2d33'); m.box(w / 2, .1, 0, .01, h - .2, d - .1, '#3a3f4c');
      for (let k = 0; k < 4; k++) m.box(w / 2 + .006, 1.4 + k * .08, .2, .004, .04, .04, k === 3 ? LEMON : GREEN, { glow: 1.6 });
    }),
    kind('network-rack', .8, .6, 1.9, 'cover', 'an open network rack: patch panels and cable looms', (m, r, { w, d, h }) => {
      for (const s of [-1, 1]) for (const t of [-1, 1]) m.box(s * (w / 2 - .03), 0, t * (d / 2 - .03), .05, h, .05, BLACK);
      for (let k = 0; k < 9; k++) { const y = .2 + k * .18; m.box(0, y, d / 2 - .1, w - .1, .08, .12, '#2a2d33'); for (let j = 0; j < 8; j++) m.box(-w / 2 + .12 + j * .08, y + .03, d / 2 - .035, .03, .02, .01, pick(r, [GREEN, '#2e3138', '#2e3138', BLUE]), { glow: .9, fine: true }); m.box(0, y - .02, d / 2 + .02, w - .2, .03, .06, pick(r, ['#3f6f8f', LEMON, '#c8574a', '#e8e2d4']), T); }
    }),
    kind('cable-tray', 6.0, .3, 2.7, 'walkOver', 'a ladder tray of cable looms under the ceiling', (m, r, { w, d, h }) => {
      for (const t of [-1, 1]) m.box(0, h, t * (d / 2 - .02), w, .06, .02, '#6a6e76');
      for (let k = 0; k < 20; k++) m.box(-w / 2 + .15 + k * (w - .3) / 19, h, 0, .02, .02, d, '#6a6e76', T);
      for (let k = 0; k < 4; k++) m.box(0, h + .02, -.1 + k * .06, w - .1, .04, .04, pick(r, [BLACK, '#3f6f8f', LEMON, '#2a2d33']));
      for (const x of [-2.4, 0, 2.4]) m.box(x, h + .06, 0, .02, 3.6 - h - .06, .02, BLACK, T);
    }),
    kind('floor-laptop', .5, .4, .2, 'walkOver', 'a laptop left open on the floor, cabled into the racks', (m, r) => { m.box(0, 0, 0, .34, .02, .24, '#2a2d33'); m.box(0, .02, -.12, .34, .22, .015, '#2a2d33', { rx: -.3 }); m.box(0, .03, -.11, .3, .18, .004, '#6a8aa8', { rx: -.3, glow: 1.3 }); m.box(.15, .005, .15, .5, .012, .012, '#3f6f8f', { ry: .5 }); }),
    kind('meeting-table', 3.6, 1.3, .75, 'low', 'the glass meeting table: laptops open, notepads, cups, coffee spilled across it', (m, r, { w, d, h }) => {
      for (const x of [-w / 3, w / 3]) { m.box(x, 0, 0, .5, .03, .5, CHROME); m.box(x, .03, 0, .08, h - .06, .08, CHROME); }
      m.box(0, h - .03, 0, w, .03, d, '#a4b8bc', { glow: .05 }); m.box(0, h - .035, 0, w - .4, .004, .1, '#2a2d33');
      for (const [x, z, a] of [[-1.3, .32, 3.1], [-.4, -.32, 0], [.5, .34, 3.3], [1.35, -.3, .2]]) { m.box(x, h, z, .34, .015, .24, '#2a2d33', { ry: a }); m.box(x, h + .015, z - .11 * Math.cos(a), .32, .2, .01, '#2a2d33', { ry: a, rx: -.3 * Math.cos(a) }); m.box(x, h + .03, z - .105 * Math.cos(a), .28, .15, .004, '#6a8aa8', { ry: a, rx: -.3 * Math.cos(a), glow: 1.2 }); }
      for (let k = 0; k < 6; k++) m.cyl(-1.6 + k * .62, h, (k % 2 ? -.45 : .45), .04, .1, '#e8e2d4', { sides: 6, fine: true });
      m.flat(.1, h + .003, .05, .7, .35, '#3a2418', { ry: .3 }); m.cyl(.3, h + .04, .1, .04, .1, '#e8e2d4', { rz: 1.57, sides: 6 });
      for (let k = 0; k < 4; k++) m.box(-1.5 + k * .9, h, (r() - .5) * .3, .15, .006, .21, '#e8e4d8', { ry: r(), fine: true });
    }),
    kind('presentation', 2.8, .1, 2.6, 'walkOver', 'the presentation still looping on the wall screen: a bar chart, a line, a pie (lit)', (m, r, { w, d }) => {
      screen(m, r, 0, 1.0, -d / 2 + .06, w - .2, 1.4, BLUE, 1);
      const z = -d / 2 + .07; m.box(.75, 1.95, z, .3, .3, .004, '#f2f4ff', { glow: 1.6, fine: true }); m.box(.85, 2.05, z + .002, .16, .16, .004, LEMON, { glow: 1.6, fine: true });
      m.box(0, .95, -d / 2 + .05, .5, .05, .06, BLACK);
    }),
    kind('credenza', 1.8, .5, .8, 'low', 'a credenza: the coffee machine, cups, a jug of water', (m, r, { w, d, h }) => {
      m.box(0, .05, 0, w, h - .05, d, '#3a3f4c'); m.box(0, 0, 0, w - .1, .05, d - .1, BLACK); for (let k = 0; k < 3; k++) m.box(-w / 3 + k * w / 3, .1, d / 2, w / 3 - .04, h - .2, .01, '#454a58');
      m.box(-.5, h, 0, .3, .4, .35, '#1e1f24'); m.box(-.5, h + .3, .18, .1, .04, .004, GREEN, { glow: 1.5 }); m.cyl(-.5, h + .05, .12, .04, .08, '#e8e2d4', { sides: 6, fine: true });
      for (let k = 0; k < 6; k++) m.cyl(.1 + (k % 3) * .12, h + Math.floor(k / 3) * .08, -.05, .04, .08, '#e8e2d4', { sides: 6, fine: true });
      m.cyl(.6, h, 0, .07, .25, '#b4c8cc', { sides: 8 });
    }),
    kind('whiteboard', 1.8, .06, 2.1, 'walkOver', 'a whiteboard of boxes, arrows and a scribbled graph (no words)', (m, r, { w, d }) => {
      const z = -d / 2 + .02, y = 1.5; m.box(0, .9, z, w, 1.1, .03, '#f0f0f2'); m.box(0, .88, z + .02, w, .03, .06, CHROME);
      for (let k = 0; k < 3; k++) { const x = -.6 + k * .6; m.box(x, 1.55, z + .016, .36, .02, .003, '#2a4a8a'); m.box(x, 1.8, z + .016, .36, .02, .003, '#2a4a8a'); m.box(x - .17, 1.55, z + .016, .02, .27, .003, '#2a4a8a'); m.box(x + .17, 1.55, z + .016, .02, .27, .003, '#2a4a8a'); if (k < 2) m.box(x + .3, 1.67, z + .016, .22, .015, .003, '#b8423a'); }
      for (let k = 0; k < 6; k++) m.box(-.6 + k * .22, y - .4 + Math.sin(k * 1.3) * .08, z + .016, .24, .015, .003, '#2a2a2e', { rz: Math.cos(k * 1.3) * .5 });
    }),

    // ------------------------------------------------------------------ checkpoint booth
    kind('booth-console', 2.2, .5, 2.4, 'walkOver', 'the booth\'s console shelf and monitor wall (cameras, static, the biohazard loop), the radio still on', (m, r, { w, d }) => {
      const z = -d / 2;
      m.box(0, .74, z + .2, w, .04, .4, '#3a3f4c'); m.box(0, .5, z + .02, w, .24, .04, '#2e323c');
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) screen(m, r, -.7 + i * .7, 1.1 + j * .5, z + .06, .62, .42, '#6a7a8a', i === 1 && j === 1 ? 4 : i === 2 && j === 0 ? 3 : 2);
      m.box(.7, .78, z + .2, .22, .12, .12, '#1e1f24'); m.box(.7, .9, z + .16, .02, .2, .02, BLACK, T); m.box(.65, .9, z + .27, .06, .01, .01, GREEN, { glow: 1.8 });
      m.box(-.4, .78, z + .25, .44, .02, .16, BLACK, T); m.box(0, .78, z + .28, .2, .005, .28, '#e8e2d4', { ry: .3 });
      m.cyl(-.85, .78, z + .3, .04, .1, '#e8e2d4', { sides: 6, fine: true });
    }),
    kind('booth-chair', .55, .55, .95, 'walkOver', 'the guard\'s chair, rolled back and left turned', (m, r) => {
      for (let k = 0; k < 5; k++) m.box(0, .04, 0, .5, .03, .05, BLACK, { ry: k * 1.2566 });
      m.cyl(0, .07, 0, .03, .36, CHROME, { sides: 6 }); m.box(0, .43, 0, .48, .08, .46, '#2e3138'); m.box(0, .5, -.21, .44, .45, .06, '#2e3138', { rx: -.2 });
    }),
    kind('riot-shield', .7, 1.2, .1, 'walkOver', 'a riot shield dropped flat: dark, a clear window, a lemon stripe (no markings)', (m, r, { w, d }) => {
      m.box(0, 0, 0, w - .1, .04, d - .1, '#1e2228'); m.box(0, .04, -.25, w - .3, .005, .3, '#6a8088', { glow: .05 }); m.box(0, .04, .25, w - .12, .006, .06, LEMON);
      m.box(0, .04, 0, .12, .03, .2, BLACK);
    }),
    kind('thermal-scanner', .3, .2, .1, 'walkOver', 'a dropped thermal scanner: a boxy handheld, its screen still showing a heat blob', m => {
      m.box(0, 0, 0, .1, .06, .18, LEMON); m.box(0, .06, -.02, .08, .004, .1, '#2a1a3a'); m.box(0, .064, -.02, .04, .002, .05, '#ff5a3a', { glow: 1.5 }); m.box(0, 0, .12, .05, .05, .08, BLACK);
    }),
    kind('trefoil-poster', .7, .04, 2.0, 'walkOver', 'a biohazard trefoil notice taped to the wall (lemon and black, no words)', (m, r, { d }) => {
      const z = -d / 2 + .015; m.box(0, 1.2, z, .5, .6, .005, LEMON);
      m.box(0, 1.5, z + .006, .1, .1, .003, BLACK); for (let k = 0; k < 3; k++) { const a = k * 2.094 + 1.571; m.box(Math.cos(a) * .12, 1.5 + Math.sin(a) * .12, z + .006, .12, .12, .003, BLACK); }
      m.box(0, 1.28, z + .006, .4, .04, .003, BLACK); m.box(-.2, 1.78, z + .007, .1, .03, .003, '#d8d4c8', { rz: .5 });
    }),
    kind('casings', .8, .6, .02, 'walkOver', 'spent casings scattered on the grate', (m, r, { w, d }) => { for (let k = 0; k < 16; k++) m.cyl((r() - .5) * w, .045, (r() - .5) * d, .006, .03, '#9a8a5a', { rz: 1.57, ry: r() * 3, sides: 5, fine: k > 5 }); }),

    // =================================================================== cyberware showroom
    ...['arm-plinth', 'hand-plinth', 'eye-plinth', 'eye-plinth-b'].map(name => kind(name, .6, .6, 1.15, 'low', 'a white display plinth with a lit edge and a stylised ' + (name.startsWith('eye') ? 'set of eye units in a glass cube' : name.startsWith('hand') ? 'prosthetic hand' : 'prosthetic arm'), (m, r, { w, h }) => {
      plinth(m, w, .95);
      if (name.startsWith('eye')) eyes(m, r, .95, name.endsWith('-b'));
      else if (name.startsWith('hand')) prostheticHand(m, 0, .98, 0, name === 'hand-plinth' ? CHROME : '#e8eaec');
      else prostheticArm(m, .95, name === 'arm-plinth' ? [CHROME, BLACK, ROSE] : ['#e8eaec', '#3a3f4c', GREEN]);
    })),
    kind('recall-plinth', 1.4, 1.4, 1.15, 'low', 'the outbreak\'s port on its own plinth, recalled: four posts and lemon-and-black recall tape round it, a sick pale glow', (m, r, { w, h }) => {
      m.flat(0, .037, 0, w - .1, w - .1, '#1e1f24');
      for (let k = 0; k < 8; k++) m.flat(-w / 2 + .1 + k * (w - .2) / 7, .039, w / 2 - .12, .08, .12, k % 2 ? BLACK : LEMON, { ry: .785 });
      m.box(0, 0, 0, .6, .95, .6, '#e8eaec'); m.box(0, .95, 0, .62, .02, .62, '#c9ccd1');
      m.box(0, .97, 0, .3, .3, .3, '#b4c8cc', { glow: .08 }); m.box(0, .97, 0, .12, .04, .12, '#2a2d33');
      m.box(0, 1.01, 0, .05, .03, .03, '#b8d88a', { glow: .9 }); m.box(0, 1.01, .02, .015, .006, .05, '#7b8077'); m.box(-.03, 1.01, -.03, .02, .02, .004, '#b8d88a', { glow: 1.2, fine: true });
      for (const [x, z] of [[-.62, -.62], [.62, -.62], [.62, .62], [-.62, .62]]) { m.cyl(x, 0, z, .12, .03, BLACK, { sides: 8 }); m.cyl(x, .03, z, .025, .92, CHROME, { sides: 6 }); }
      const tape = (x0, z0, x1, z1) => { const n = 8, l = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0); for (let k = 0; k < n; k++) { const t = (k + .5) / n, sag = Math.sin(t * Math.PI) * .06; m.box(x0 + (x1 - x0) * t, .86 - sag, z0 + (z1 - z0) * t, l / n + .005, .07, .008, k % 2 ? BLACK : LEMON, { ry: -a }); } };
      tape(-.62, -.62, .62, -.62); tape(.62, -.62, .62, .62); tape(.62, .62, -.62, .62); tape(-.62, .62, -.62, -.2);
      for (let k = 0; k < 3; k++) m.box(-.62 + .05 * k, .7 - k * .12, .2 + k * .12, .14, .06, .008, k % 2 ? BLACK : LEMON, { ry: 1.57, rx: .8 });
    }),
    kind('holo-arm', .8, .8, 1.2, 'low', 'a projector plinth, a lit wireframe arm turning above it (pale green)', (m, r, { w }) => {
      m.cyl(0, 0, 0, .38, .7, '#2a2d33', { sides: 10 }); m.cyl(0, .7, 0, .34, .03, MINT, { sides: 10, glow: 1.4 });
      for (let k = 0; k < 6; k++) m.box(Math.cos(k) * .05, 1.0 + k * .12, Math.sin(k) * .05, .025, .14, .025, MINT, { glow: 1.6, rz: .3, fine: k % 2 === 1 });
      m.box(.08, 1.72, 0, .16, .04, .04, MINT, { glow: 1.6 }); for (let f = 0; f < 4; f++) m.box(.14 + f * .02, 1.76, (f - 1.5) * .03, .012, .09, .012, MINT, { glow: 1.6, fine: true });
      m.cyl(0, .73, 0, .3, 1.1, MINT, { sides: 8, top: .05, glow: .05, fine: true });
    }),
    kind('cyber-case', 1.8, .45, 2.1, 'cover', 'a lit glass wall case: eye units on stands, a row of hands', (m, r, { w, d, h }) => { wallCase(m, r, w, d, h, 'eyes'); }),
    kind('cyber-case-b', 1.8, .45, 2.1, 'cover', 'a lit glass wall case: arms on brackets, ports in trays', (m, r, { w, d, h }) => { wallCase(m, r, w, d, h, 'arms'); }),
    kind('cyber-counter', 2.4, .7, 1.05, 'low', 'the sales counter: glossy white, a lit band, a tablet and a card terminal, a tray of demo ports', (m, r, { w, d, h }) => {
      m.box(0, .06, 0, w, h - .1, d, '#eceef0'); m.box(0, 0, 0, w - .1, .06, d - .1, BLACK); m.box(0, .5, d / 2 + .003, w - .1, .04, .005, MINT, { glow: 1.6 });
      m.box(0, h - .04, 0, w + .03, .04, d + .03, '#f4f5f6');
      m.box(-.6, h, .05, .26, .014, .18, BLACK); m.box(-.6, h + .014, .05, .23, .003, .15, '#9fd8b8', { glow: 1.3 });
      m.box(.2, h, .1, .08, .03, .14, '#2a2d33'); m.box(.2, h + .03, .08, .06, .002, .04, GREEN, { glow: 1.5 });
      m.box(.7, h, 0, .4, .02, .26, '#2a2d33'); for (let k = 0; k < 6; k++) m.box(.56 + (k % 3) * .12, h + .02, -.05 + Math.floor(k / 3) * .1, .04, .02, .03, '#7b8077', T);
    }),
    kind('returned-boxes', .9, .7, .5, 'walkOver', 'the returned ports: identical white boxes (the port pictogram), return slips taped on, a few opened, piled by the counter', (m, r) => {
      for (let k = 0; k < 9; k++) { const x = (r() - .5) * .6, z = (r() - .5) * .45, y = k > 5 ? .16 : k > 2 ? .08 * (r() < .5 ? 1 : 0) : 0; portBox(m, x, y, z, r() * 3, k === 7); }
    }),
    kind('port-box', .3, .25, .1, 'walkOver', 'a single returned port box, opened', (m, r) => portBox(m, 0, 0, 0, .3, true)),
    kind('tipped-plinth', 1.2, .8, .6, 'walkOver', 'a display plinth knocked over, its arm thrown clear, glass cracked', (m, r) => {
      m.box(-.2, 0, 0, .95, .6, .6, '#e8eaec', { rz: 0 }); m.box(-.2, .3, .31, .9, .02, .002, MINT, { glow: 1.2 });
      m.box(.45, .02, .1, .12, .1, .42, CHROME, { ry: .6 }); m.box(.3, .02, -.2, .1, .1, .36, CHROME, { ry: -.3 }); m.cyl(.38, .07, -.02, .07, .05, BLACK, { sides: 6 });
      for (let k = 0; k < 6; k++) m.flat(.1 + r() * .5, .04, (r() - .5) * .6, .06, .04, '#cfe0e8', { ry: r() * 3, fine: true });
    }),
    kind('show-strip', 8.0, .08, 2.8, 'walkOver', 'a lit mint strip along the showroom\'s back wall and a band of pictogram panels', (m, r, { w, d }) => {
      const z = -d / 2 + .02; m.box(0, 2.6, z, w, .04, .03, MINT, { glow: 1.6 });
      for (let k = 0; k < 5; k++) { const x = -w / 2 + .8 + k * (w - 1.6) / 4; if (Math.abs(x + 2.75) < .9 || Math.abs(x - 2.75) < .9) continue; m.box(x, 1.7, z, .7, .7, .02, '#e8eaec'); m.box(x, 1.82, z + .012, .3, .3, .004, pick(r, [MINT, ROSE, '#9fb8d8']), { glow: 1.2 }); }
    }),
    kind('fitting-mirror', 1.2, .35, 2.1, 'cover', 'a tall three-leaf fitting mirror on a steel frame', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, .06, d, STEEL_D);
      for (const [x, a] of [[-.4, .4], [0, 0], [.4, -.4]]) { m.box(x, .06, -.02, .4, h - .1, .04, STEEL, { ry: a }); m.box(x, .1, .005, .34, h - .2, .01, '#c8d8e0', { ry: a, glow: .15 }); }
    }),
    kind('fitting-chair', .7, .7, 1.0, 'low', 'the calibration chair: a padded seat, an arm cradle and a clamp arm with a sensor head', (m, r, { w, d }) => {
      m.cyl(0, 0, 0, .3, .04, STEEL_D, { sides: 8 }); m.cyl(0, .04, 0, .05, .38, CHROME, { sides: 6 });
      m.box(0, .42, 0, .55, .1, .55, '#3a3f4c'); m.box(0, .52, -.26, .5, .45, .08, '#3a3f4c', { rx: -.12 });
      m.box(.32, .6, .05, .1, .06, .45, '#e8eaec'); m.box(.32, .52, -.1, .05, .1, .05, CHROME);
      m.box(-.32, .52, -.2, .04, .45, .04, CHROME); m.box(-.2, .95, -.1, .3, .04, .04, CHROME, { rz: -.3 }); m.box(-.05, .88, -.1, .1, .08, .1, '#2a2d33'); m.box(-.05, .88, -.05, .06, .02, .002, MINT, { glow: 1.6 });
    }),
    kind('arm-rack', 1.6, .35, 1.9, 'cover', 'a wall rack of spare prosthetic arms on hooks, bagged hands below', (m, r, { w, d, h }) => {
      m.box(0, 0, -d / 2 + .03, w, h, .06, '#c9ccd1'); m.box(0, 0, 0, w, .1, d, STEEL_D);
      for (let k = 0; k < 5; k++) { const x = -w / 2 + .2 + k * (w - .4) / 4; m.box(x, 1.7, -d / 2 + .1, .03, .03, .12, CHROME, T); prostheticArmHanging(m, x, 1.68, -d / 2 + .14, k % 2 ? CHROME : '#e8eaec'); }
      for (let k = 0; k < 4; k++) m.box(-w / 2 + .25 + k * .38, .1, 0, .3, .25, d - .08, '#dfe6ea', { glow: .05 });
    }),
    kind('fitting-bench', 1.6, .5, .5, 'low', 'a bench with an open box on it, tissue paper, an arm half unpacked', (m, r, { w, d, h }) => {
      m.box(0, h - .06, 0, w, .06, d, '#e8eaec'); for (const s of [-1, 1]) m.box(s * (w / 2 - .05), 0, 0, .06, h - .06, d - .06, STEEL_D);
      m.box(.3, h, 0, .6, .12, .4, '#f2f2f2'); m.box(.3, h + .12, -.25, .6, .01, .12, '#f2f2f2', { rx: -.9 }); m.box(.3, h + .1, .02, .5, .05, .3, '#f4e8ec');
      m.box(.28, h + .12, 0, .1, .06, .36, CHROME, T); m.box(-.4, h, .05, .2, .1, .14, '#2a2d33');
    }),
    kind('calib-tablet', .3, .2, .02, 'walkOver', 'a calibration tablet dropped face up, still showing the arm\'s joints', m => { m.box(0, 0, 0, .26, .012, .18, BLACK); m.box(0, .012, 0, .23, .002, .15, '#1e3a2a', { glow: 1 }); m.box(-.04, .014, 0, .12, .002, .02, MINT, { glow: 1.8 }); m.box(.05, .014, .03, .02, .002, .02, MINT, { glow: 1.8 }); }),
    kind('consult-chair', .8, 1.9, 1.1, 'low', 'the consultation chair: reclined white leather, arm rests, a scanner ring on an arm over the head', (m, r, { w, d }) => {
      m.box(0, 0, 0, .5, .12, .9, STEEL_D); m.cyl(0, .12, 0, .07, .3, CHROME, { sides: 6 });
      m.box(0, .42, .25, w - .1, .12, .9, '#e8eaec'); m.box(0, .5, -.45, w - .12, .1, .7, '#e8eaec', { rx: .45 }); m.box(0, .82, -.82, .3, .08, .22, '#dfe1e3', { rx: .45 });
      m.box(0, .3, .78, w - .2, .1, .4, '#e8eaec', { rx: -.5 });
      for (const s of [-1, 1]) m.box(s * (w / 2 - .05), .6, 0, .08, .05, .6, '#c9ccd1');
      m.box(.45, 0, -.9, .08, 1.5, .08, CHROME); m.box(.25, 1.5, -.9, .45, .06, .06, CHROME);
      m.cyl(0, 1.2, -.85, .2, .06, '#2a2d33', { sides: 12, rx: 1.1 }); m.cyl(0, 1.21, -.85, .16, .04, MINT, { sides: 12, rx: 1.1, glow: 1.2 });
    }),
    kind('tech-stool', .45, .45, .6, 'low', 'the consultant\'s wheeled stool', (m, r) => { for (let k = 0; k < 5; k++) m.box(0, .03, 0, .42, .03, .04, BLACK, { ry: k * 1.2566 }); m.cyl(0, .06, 0, .025, .44, CHROME, { sides: 6 }); m.cyl(0, .5, 0, .2, .08, '#e8eaec', { sides: 10 }); }),
    kind('scan-screen', 1.4, .08, 2.2, 'walkOver', 'the wall screen still showing an eye scan: rings, a pupil, readouts as bars (lit)', (m, r, { w, d }) => {
      const z = -d / 2 + .02; m.box(0, 1.1, z, w, .85, .03, BLACK); m.box(0, 1.13, z + .02, w - .06, .79, .004, '#0e2a22', { glow: 1 });
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; m.box(-.25 + Math.cos(a) * .25, 1.52 + Math.sin(a) * .25, z + .025, .12, .03, .003, MINT, { glow: 1.8, rz: a + 1.57 }); }
      m.box(-.25, 1.49, z + .026, .1, .1, .003, '#e8fff0', { glow: 2 });
      for (let k = 0; k < 5; k++) m.box(.35, 1.25 + k * .12, z + .025, .1 + r() * .3, .04, .003, k === 2 ? ROSE : MINT, { glow: 1.6 });
    }),

    // =================================================================== flatiron
    kind('phone-case', 2.3, .5, 1.0, 'low', 'a glass counter case of phones, screens lit (no text), a light under the glass', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, .6, d, '#1e1f24'); m.box(0, .6, 0, w, .02, d, '#8a9099');
      m.box(0, .62, 0, w - .04, .02, d - .04, '#eef4ff', { glow: .6 });
      for (let k = 0; k < 9; k++) { const x = -w / 2 + .15 + k * (w - .3) / 8; m.box(x, .64, 0, .1, .02, .18, BLACK); m.box(x, .66, 0, .085, .003, .16, pick(r, ['#4a6aff', ROSE, MINT, '#e8e8f0', LEMON]), { glow: 1.4 }); }
      for (const s of [-1, 1]) m.box(s * (w / 2 - .01), .62, 0, .02, h - .62, d, '#b4c8cc', { glow: .05 });
      m.box(0, h - .01, 0, w, .01, d, '#b4c8cc', { glow: .04 });
      m.box(0, .05, d / 2 + .005, w - .1, .03, .005, ROSE, { glow: 1.5 });
    }),
    kind('phone-tower', 2.3, .45, 2.0, 'cover', 'a tall lit wall case of phones and watches on glass shelves', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h, d, '#1e1f24'); m.box(0, .1, .04, w - .06, h - .2, d - .06, '#10131a');
      for (let k = 0; k < 5; k++) { const y = .3 + k * .33; m.box(0, y, .02, w - .1, .015, d - .1, '#cfe0ff', { glow: .5 }); for (let j = 0; j < 7; j++) { const x = -w / 2 + .2 + j * (w - .4) / 6; m.box(x, y + .015, .02, .09, .17, .02, BLACK, { rx: -.2 }); m.box(x, y + .025, .035, .075, .14, .003, pick(r, ['#4a6aff', ROSE, MINT, '#e8e8f0']), { rx: -.2, glow: 1.3, fine: k % 2 === 0 }); } }
      m.box(0, 0, d / 2, w, h, .01, '#b4c8cc', { glow: .04 }); m.box(0, h - .1, d / 2 + .005, w - .1, .04, .005, MINT, { glow: 1.6 });
    }),
    kind('screen-stack', 1.2, .5, 2.2, 'cover', 'a stack of display screens on a rack, each on its own loop', (m, r, { w, d, h }) => {
      m.box(0, 0, -.1, w, h, .25, '#1e1f24');
      const cols = [ROSE, BLUE, MINT, LEMON, MAGENTA, '#e8e8f0'];
      for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) screen(m, r, -.29 + i * .58, .1 + j * .52, .06, .52, .44, cols[(i + j * 2) % cols.length], (i + j) % 4 === 3 ? 3 : 0);
    }),
    kind('holo-phone', 1.0, 1.0, 3.0, 'walkOver', 'a giant hologram phone turning under the ceiling over a lit floor ring', (m, r) => {
      m.flat(0, .038, 0, .9, .9, '#2a2d33'); for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; m.flat(Math.cos(a) * .38, .04, Math.sin(a) * .38, .12, .04, ROSE, { ry: -a, glow: 1.6 }); }
      m.box(0, 2.0, 0, .5, .9, .06, ROSE, { glow: .5, ry: .5 }); m.box(0, 2.05, 0, .42, .76, .065, '#ffe0ea', { glow: 1.2, ry: .5, fine: true }); m.box(0, 2.95, 0, .02, .1, .02, BLACK);
    }),
    kind('booth-sign', 1.4, .2, 3.0, 'walkOver', 'a booth\'s hanging lit sign: glyph shapes and a pictogram (never letters)', (m, r, { w }) => {
      const c = pick(r, [ROSE, MINT, '#4a6aff', LEMON]);
      m.box(0, 2.55, 0, w - .2, .32, .08, '#1e1f24'); m.box(0, 2.58, .045, w - .3, .26, .004, shade(c, .4), { glow: 1.2 });
      glyphs(m, r, .1, 2.66, .05, w - .6, '#f2f2f2', 1.8); m.box(-w / 2 + .3, 2.62, .05, .14, .14, .004, c, { glow: 2 });
      for (const s of [-1, 1]) m.box(s * (w / 2 - .2), 2.87, 0, .01, .5, .01, BLACK, T);
    }),
    kind('repair-bench', 1.8, .5, .95, 'low', 'a repair bench: a mat, a gutted phone, a soldering station glowing, a magnifier lamp', (m, r, { w, d, h }) => { repairTop(m, r, w, d, h, 0); }),
    kind('repair-stool', .4, .4, .7, 'low', 'a tall shop stool', m => { m.cyl(0, 0, 0, .16, .02, STEEL_D, { sides: 6 }); m.cyl(0, .02, 0, .02, .6, CHROME, { sides: 6 }); m.cyl(0, .62, 0, .17, .06, '#2a2226', { sides: 8 }); }),
    kind('parts-wall', 1.8, .15, 2.4, 'walkOver', 'a wall of little parts drawers and hanging cables, a lit strip above', (m, r, { w, d }) => {
      const z = -d / 2 + .02; m.box(0, 1.1, z, w, 1.1, .08, '#2a2d33');
      for (let i = 0; i < 9; i++) for (let j = 0; j < 5; j++) m.box(-w / 2 + .12 + i * (w - .24) / 8, 1.18 + j * .2, z + .05, .15, .14, .02, pick(r, ['#4a5a8a', '#c8574a', '#d8d880', '#5a9a6a', '#e8e2d4']), T);
      for (let k = 0; k < 5; k++) m.box(-w / 2 + .3 + k * .3, 1.0, z + .07, .015, .5, .015, pick(r, [BLACK, '#3f6f8f', LEMON]), T);
      m.box(0, 2.25, z + .03, w, .03, .04, MINT, { glow: 1.6 });
    }),
    kind('box-pile', .8, .6, .4, 'walkOver', 'boxes of stock and packaging dropped', (m, r) => { for (let k = 0; k < 5; k++) { const s = .12 + r() * .15; m.box((r() - .5) * .5, k > 2 ? .12 : 0, (r() - .5) * .4, s * 1.5, s * .8, s, pick(r, ['#dcd8d0', '#9a7b58', '#2a2d33', '#4a5a8a']), { ry: r() * 3 }); } }),
    kind('kiosk-shutter', 2.3, .7, 1.0, 'low', 'a booth\'s counter kiosk, its roll shutter pulled half down, screens still lit behind', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h, d, '#2a2d33'); m.box(0, h, 0, w + .02, .03, d + .02, '#6a6e76');
      m.box(0, .1, d / 2 + .003, w - .1, .03, .005, MINT, { glow: 1.4 });
      for (let k = 0; k < 3; k++) screen(m, r, -.7 + k * .7, h + .5, -d / 2 + .1, .5, .35, pick(r, [ROSE, '#4a6aff', MINT]), k === 1 ? 3 : 0);
      m.box(0, 2.25, d / 2 - .05, w, .18, .18, '#4a4e56');
      for (let k = 0; k < 9; k++) m.box(0, 1.35 + k * .1, d / 2 - .02, w - .04, .085, .03, k % 2 ? '#8a9099' : '#9aa1a8');
      m.box(0, 1.33, d / 2 - .01, w - .02, .04, .05, '#5a5e66');
      for (const s of [-1, 1]) m.box(s * (w / 2 - .02), 1.0, d / 2 - .02, .04, 1.4, .06, '#4a4e56');
    }),
    kind('tall-case', 1.2, .45, 2.0, 'cover', 'a tall glass case of headsets, drones and parts', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, .15, d, '#1e1f24'); m.box(0, h - .1, 0, w, .1, d, '#1e1f24'); m.box(0, h - .12, .1, w - .1, .02, d - .2, '#eef4ff', { glow: 1.2 });
      for (let k = 0; k < 4; k++) { const y = .15 + k * .42; m.box(0, y, 0, w - .04, .015, d - .04, '#b4c8cc', { glow: .3 }); for (let j = 0; j < 3; j++) m.box(-.35 + j * .35, y + .015, 0, .22, .1 + r() * .1, .18, pick(r, ['#2a2d33', '#e8eaec', '#4a5a8a', '#6a2a2e'])); }
      m.box(0, .15, d / 2, w, h - .25, .01, '#b4c8cc', { glow: .04 });
    }),
    kind('cable-bin', .6, .5, .5, 'walkOver', 'a bin of tangled cables and chargers', (m, r) => { m.box(0, 0, 0, .5, .35, .4, '#3a4a5a'); for (let k = 0; k < 7; k++) m.box((r() - .5) * .4, .3 + r() * .1, (r() - .5) * .3, .3, .02, .02, pick(r, [BLACK, '#e8e8f0', LEMON, '#3f6f8f']), { ry: r() * 3, rz: (r() - .5) }); }),
    kind('repair-counter', 2.4, .6, .95, 'low', 'a repair counter: gutted phones on mats, a soldering iron glowing, a microscope, a parts tray', (m, r, { w, d, h }) => { repairTop(m, r, w, d, h, 1); }),
    kind('repair-counter-b', 2.4, .6, .95, 'low', 'a repair counter: a screen-press, a heat gun, a pile of cracked screens, a laptop', (m, r, { w, d, h }) => { repairTop(m, r, w, d, h, 2); }),

    // =================================================================== pachinko
    ...[['9', 9.08, 1], ['57', 5.68, 1], ['33', 3.29, 1], ['93', 9.28, 1], ['5', 5.0, 1], ['double-6', 6.3, 2], ['double-27', 2.7, 2], ['double-29', 2.9, 2]].map(([n, len, sides]) =>
      kind('pachinko-' + (sides === 1 ? 'wall-' : '') + n, len, sides === 1 ? .45 : .9, 1.85, 'cover', sides === 1 ? 'a wall bank of pachinko machines, lamps flashing, trays of balls' : 'a double-sided island of pachinko machines back to back, a lamp header on top', (m, r, { w, d, h }) => pachinkoBank(m, r, w, d, h, sides))),
    ...[['9', 9.0], ['6', 6.2], ['27', 2.6], ['29', 2.8], ['56', 5.6], ['28', 2.8], ['32', 3.2], ['92', 9.2], ['5', 4.9]].map(([n, len]) =>
      kind('pachinko-stools-' + n, len, .35, .6, 'low', 'a row of fixed round stools on their rail', (m, r, { w, d }) => {
        m.box(0, 0, 0, w, .03, .14, STEEL_D);
        const k = Math.max(1, Math.round(w / .74)), step = w / k;
        for (let i = 0; i < k; i++) { const x = -w / 2 + step * (i + .5); m.box(x, .03, 0, .05, .48, .05, CHROME); m.cyl(x, .51, 0, .16, .08, i % 5 === 2 ? '#3a1a2a' : '#5a2438', { sides: 6 }); }
      })),
    kind('ball-spill', 1.2, .8, .03, 'walkOver', 'silver balls spilled across the carpet from a tipped tray', (m, r, { w, d }) => {
      for (let k = 0; k < 30; k++) m.flat((r() - .5) * w, .04 + k * .0002, (r() - .5) * d * (1 - Math.abs(r() - .5)), .028, .028, k % 4 ? '#d8dce2' : '#f4f6f8', { glow: .15, ry: .785, fine: k > 12 });
      m.box(.35, 0, .1, .3, .08, .2, '#3a3f4c', { rz: 1.3, ry: .4 });
    }),
    kind('ball-crates', .5, .4, .7, 'walkOver', 'plastic crates of won balls stacked by a seat', (m, r) => { for (let k = 0; k < 3; k++) { m.box(0, k * .22, 0, .4, .2, .3, k === 1 ? '#c8574a' : '#3f6f8f', { ry: (r() - .5) * .2 }); m.box(0, k * .22 + .19, 0, .36, .015, .26, '#d8dce2', T); } }),
    kind('prize-shelf', 2.0, .45, 2.0, 'cover', 'lit prize shelves: plush toys, boxed gadgets, bottles', (m, r, { w, d, h }) => prizeShelf(m, r, w, d, h, 0)),
    kind('prize-shelf-b', 2.0, .45, 2.0, 'cover', 'lit prize shelves: snacks, boxes, a row of lucky cats', (m, r, { w, d, h }) => prizeShelf(m, r, w, d, h, 1)),
    kind('cash-counter', 3.0, .7, 1.05, 'low', 'the exchange counter: a ball counter, the till drawer out, token trays, a lit front', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h - .05, d, '#3a1a2a'); m.box(0, .1, d / 2 + .003, w - .1, .05, .005, ROSE, { glow: 1.8 }); m.box(0, .8, d / 2 + .003, w - .1, .02, .005, LEMON, { glow: 1.4 });
      m.box(0, h - .05, 0, w + .04, .05, d + .04, '#d8d0c4');
      m.box(-.9, h, -.05, .45, .3, .4, '#c9ccd1'); m.box(-.9, h + .3, -.05, .4, .02, .35, '#2a2d33'); m.box(-.9, h + .1, .16, .2, .08, .004, GREEN, { glow: 1.6 });
      m.box(.3, h - .15, .45, .5, .1, .35, '#2a2d33'); for (let k = 0; k < 4; k++) m.box(.14 + k * .11, h - .06, .45, .08, .01, .28, '#6a8a5a', T);
      for (let k = 0; k < 3; k++) m.box(.9 + (k - 1) * .2, h, 0, .16, .03, .3, '#2a2d33'); for (let k = 0; k < 8; k++) m.cyl(.7 + r() * .4, h + .03, (r() - .5) * .25, .02, .01, '#d8d488', { sides: 6, fine: true });
    }),
    kind('ball-counter', .6, .6, 1.1, 'low', 'a ball counting machine, its hopper and lit display', (m, r, { w, d, h }) => { m.box(0, 0, 0, w, .85, d, '#c9ccd1'); m.box(0, .85, -.05, w - .1, .25, d - .2, '#9aa1a8', { top: '#2a2d33' }); m.box(0, .6, d / 2 + .003, .3, .12, .005, GREEN, { glow: 1.6 }); for (let k = 0; k < 6; k++) m.box((r() - .5) * .3, 1.1, (r() - .5) * .25, .03, .03, .03, '#d8dce2', T); }),
    kind('prize-case', 1.5, .45, 1.9, 'cover', 'a lit glass case of the big prizes', (m, r, { w, d, h }) => { m.box(0, 0, 0, w, .5, d, '#3a1a2a'); m.box(0, .5, 0, w, h - .5, d, '#b4c8cc', { glow: .06 }); m.box(0, h - .05, 0, w, .05, d, '#3a1a2a'); m.box(0, h - .08, 0, w - .1, .02, d - .1, '#fff2f0', { glow: 1.6 }); for (let k = 0; k < 3; k++) m.box(-.45 + k * .45, .5, 0, .3, .3 + r() * .3, .25, pick(r, ['#e8e2d4', '#c8574a', '#4a5a8a', '#2a2d33'])); m.box(0, 1.2, 0, w - .06, .015, d - .06, '#cfe0ff', { glow: .4 }); for (let k = 0; k < 4; k++) m.box(-.5 + k * .33, 1.215, 0, .18, .2, .15, pick(r, ['#e8a0b0', '#d8d880', '#9fd8b8', '#e8e8f0'])); }),
    kind('token-spill', .8, .6, .02, 'walkOver', 'tokens and a cash tray tipped off the counter', (m, r) => { m.box(0, 0, 0, .35, .03, .25, '#2a2d33', { ry: .4, rz: .2 }); for (let k = 0; k < 16; k++) m.cyl((r() - .5) * .7, .036, (r() - .5) * .5, .02, .006, '#d8d488', { sides: 6, fine: k > 6 }); }),
    kind('vip-machine', .9, .7, 1.9, 'cover', 'a high-roller machine: bigger, a gilt frame, its screen lit', (m, r, { w, d, h }) => vipMachine(m, r, w, d, h, ROSE)),
    kind('vip-machine-b', .9, .7, 1.9, 'cover', 'a high-roller machine, its jackpot lamp stuck on', (m, r, { w, d, h }) => vipMachine(m, r, w, d, h, LEMON)),
    kind('vip-stool', .4, .4, .7, 'low', 'a padded high-roller stool', m => { m.cyl(0, 0, 0, .15, .03, BRASS_D, { sides: 8 }); m.cyl(0, .03, 0, .03, .5, BRASS, { sides: 6 }); m.cyl(0, .53, 0, .19, .12, '#5a1a24', { sides: 10 }); }),
    kind('vip-sofa', 2.2, .8, .85, 'low', 'a deep red leather sofa', (m, r, { w, d, h }) => { m.box(0, .08, 0, w, .3, d, '#4a1a24'); m.box(0, .38, .06, w - .26, .1, d - .2, '#5a2430'); m.box(0, .38, -d / 2 + .1, w, h - .38, .2, '#4a1a24', { rx: -.1 }); for (const s of [-1, 1]) m.box(s * (w / 2 - .07), .08, 0, .14, .52, d, '#3e141e'); for (let k = 0; k < 8; k++) m.box(-w / 2 + .3 + k * .23, .65, -d / 2 + .205, .02, .02, .01, '#2a0e14', T); }),
    kind('vip-table', 1.2, .7, .45, 'low', 'a low lacquered table: an ashtray, glasses, a cup of balls tipped, banded stacks of plain notes', (m, r, { w, d, h }) => { m.box(0, 0, 0, w - .1, h - .04, d - .1, '#1a0e14'); m.box(0, h - .04, 0, w, .04, d, '#2a1418', { top: '#3a1a20' }); m.cyl(-.35, h, 0, .08, .03, '#b4c8cc', { sides: 8 }); m.box(-.35, h + .03, .03, .08, .015, .015, '#c8a878', T); m.cyl(.1, h, .15, .03, .1, '#cfe3ea', { sides: 6, fine: true }); m.cyl(.3, h + .04, -.1, .05, .12, '#e8e2d4', { sides: 6, rz: 1.57 }); for (let k = 0; k < 7; k++) m.box(.3 + r() * .2, h, (r() - .5) * .3, .022, .022, .022, '#d8dce2', T); for (let k = 0; k < 3; k++) { m.box(-.05 + k * .03, h + k * .025, -.15, .16, .025, .08, '#7a8a6a'); m.box(-.05 + k * .03, h + k * .025 + .001, -.15, .03, .026, .082, '#e8e2d4', T); } }),

    kind('booth-supplies', .6, .5, .3, 'walkOver', 'the checkpoint\'s supplies kicked over: a case of masks, rolls of striped tape, zip ties, a flask', (m, r) => {
      m.box(-.1, 0, 0, .34, .14, .24, '#dfe6ea', { ry: .3 }); m.box(-.1, .14, -.1, .34, .01, .24, '#dfe6ea', { ry: .3, rx: -1 });
      for (let k = 0; k < 3; k++) { m.cyl(.15 + k * .08, .05, .1 - k * .1, .05, .05, LEMON, { rx: 1.57, ry: k, sides: 8 }); m.cyl(.15 + k * .08, .05, .1 - k * .1, .02, .052, BLACK, { rx: 1.57, ry: k, sides: 6, fine: true }); }
      for (let k = 0; k < 8; k++) m.box((r() - .5) * .5, .005, (r() - .5) * .4, .004, .004, .16, '#e8e8e8', { ry: r() * 3, fine: true });
      m.cyl(-.22, .04, .18, .04, .2, '#5a6a5a', { rz: 1.57, ry: .8, sides: 8 });
      for (let k = 0; k < 6; k++) m.flat((r() - .5) * .5, .04, (r() - .5) * .4, .14, .09, '#b8d0cc', { ry: r() * 3 });
    }),

    // =================================================================== body-mod
    ...[['tattoo-chair', .75], ['tattoo-chair-b', .66]].map(([n, cw]) => kind(n, cw, 1.9, 1.0, 'low', cw < .7 ? 'a narrow black tattoo chair folded flat as a bench, a paper sheet on it' : 'a black tattoo chair, reclined, arm rests out, a paper sheet on it', (m, r, { w, d }) => {
      m.box(0, 0, 0, .5, .08, .8, BLACK); m.cyl(0, .08, 0, .08, .35, CHROME, { sides: 6 });
      m.box(0, .43, .25, w - .1, .12, .85, '#1e1f24'); m.box(0, .5, -.45, w - .12, .12, .7, '#1e1f24', { rx: .5 }); m.box(0, .3, .78, w - .2, .1, .3, '#1e1f24', { rx: -.5 });
      m.box(0, .56, .15, w - .2, .005, .8, '#e8e8e8', T);
      for (const s of [-1, 1]) { m.box(s * (w / 2 - .05), .55, -.1, .1, .04, .5, '#1e1f24'); m.box(s * (w / 2 - .05), .42, -.1, .03, .13, .03, CHROME, T); }
      m.box(0, .82, -.8, .28, .07, .18, '#1e1f24', { rx: .5 });
    })),
    ...[['needle-cart', false], ['needle-cart-live', true]].map(([n, live]) => kind(n, .5, .45, 1.0, 'low', live ? 'the artist\'s cart: the one machine still running (its pilot lit), ink caps, gloves, the lamp on its arm' : 'the artist\'s cart: machines racked, ink caps in rows, wipes, the lamp on its arm', (m, r, { w, d }) => {
      m.box(0, 0, 0, w - .08, .02, d - .08, STEEL_D); for (const s of [-1, 1]) for (const t of [-1, 1]) m.cyl(s * (w / 2 - .06), .02, t * (d / 2 - .06), .015, .8, CHROME, { sides: 5 });
      m.box(0, .35, 0, w, .02, d, '#b6bcc4'); m.box(0, .82, 0, w, .03, d, '#b6bcc4'); m.box(0, .85, 0, w - .06, .004, d - .06, '#e8e8e8', T);
      for (let k = 0; k < 8; k++) m.cyl(-.18 + (k % 4) * .08, .85, .1 + Math.floor(k / 4) * .06, .015, .02, pick(r, [BLACK, '#b8423a', '#3f6f8f', '#5a9a3a', '#d8d880', '#e8e2d4']), { sides: 5, fine: true });
      m.box(.12, .85, -.08, .12, .04, .05, live ? '#3a3f4c' : '#6a6e76'); m.box(.12, .87, -.02, .02, .02, .08, CHROME, T);
      if (live) { m.box(.12, .89, -.08, .03, .012, .03, RED, { glow: 2.2 }); m.box(.12, .86, .03, .01, .01, .01, '#e8f0ff', { glow: 2, fine: true }); m.box(-.1, .85, -.1, .08, .06, .08, '#2a2d33'); m.box(-.1, .91, -.08, .05, .004, .03, GREEN, { glow: 1.8 }); }
      m.box(-.2, .85, -.15, .02, .7, .02, CHROME); m.box(-.05, 1.55, -.15, .3, .02, .02, CHROME, { rz: -.2 }); m.cyl(.1, 1.44, -.15, .09, .06, '#f4f4ff', { sides: 8, glow: 1.6 });
      m.box(0, .37, 0, .3, .12, .2, '#dfe6ea');
    })),
    ...[['flash-wall', 0, 3], ['flash-wall-b', 1, 3], ['flash-wall-c', 2, 4]].map(([n, v, cols4]) => kind(n, cols4 * .52, .06, 2.5, 'walkOver', 'a wall of flash sheets: pictograms only (hearts, stars, snakes, bolts, eyes, daggers as shapes)', (m, r, { w, d }) => {
      const z = -d / 2 + .015, cols = [['#c8243a', BLACK, '#2a6a3a'], [BLACK, '#2a4a8a', '#c8243a'], ['#8a2a3a', BLACK, '#c8c040']][v];
      for (let i = 0; i < cols4; i++) for (let j = 0; j < 3; j++) {
        const x = -w / 2 + .3 + i * (w - .6) / (cols4 - 1), y = 1.15 + j * .42;
        m.box(x, y, z, .38, .36, .004, '#ece6d6', { rz: (r() - .5) * .06 });
        const c = pick(r, cols), shape = (i + j + v) % 6, f = z + .004;
        if (shape === 0) { m.box(x - .04, y + .12, f, .09, .09, .003, c, { rz: .785 }); m.box(x + .04, y + .12, f, .09, .09, .003, c, { rz: .785 }); m.box(x, y + .07, f, .1, .1, .003, c, { rz: .785 }); }
        else if (shape === 1) { for (let k = 0; k < 5; k++) m.box(x, y + .1, f, .03, .2, .003, c, { rz: k * .628 }); }
        else if (shape === 2) { for (let k = 0; k < 5; k++) m.box(x - .12 + k * .06, y + .1 + (k % 2) * .06, f, .08, .03, .003, c, { rz: k % 2 ? -.6 : .6 }); }
        else if (shape === 3) { m.box(x, y + .15, f, .04, .12, .003, c, { rz: .4 }); m.box(x, y + .06, f, .04, .12, .003, c, { rz: -.4 }); m.box(x + .02, y + .11, f, .1, .03, .003, c); }
        else if (shape === 4) { m.box(x, y + .1, f, .2, .1, .003, c); m.box(x, y + .11, f + .001, .06, .06, .003, '#ece6d6'); m.box(x, y + .11, f + .002, .03, .03, .003, BLACK); }
        else { m.box(x, y + .06, f, .03, .2, .003, '#6a6a6a'); m.box(x, y + .12, f, .12, .03, .003, c); m.box(x, y + .21, f, .06, .06, .003, c, { rz: .785 }); }
      }
    })),
    kind('studio-couch', 1.8, .75, .8, 'low', 'a black vinyl waiting couch', (m, r, { w, d, h }) => { m.box(0, .1, 0, w, .3, d, '#15161a'); m.box(0, .4, .05, w - .2, .08, d - .2, '#1e1f24'); m.box(0, .4, -d / 2 + .09, w, h - .4, .18, '#15161a'); for (const s of [-1, 1]) m.box(s * (w / 2 - .06), .1, 0, .12, .45, d, '#101114'); for (const s of [-1, 1]) m.box(s * (w / 2 - .15), 0, 0, .05, .1, d - .1, CHROME); m.box(.4, .48, .05, .3, .02, .22, '#dcd8d0', { ry: .3 }); }),
    kind('studio-counter', 2.0, .6, 1.05, 'low', 'the studio counter: a tablet of designs, a card reader, a jar of lollipops, a candle', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h - .05, d, '#15161a'); m.box(0, .08, d / 2 + .004, w - .1, .03, .005, MAGENTA, { glow: 1.8 }); m.box(0, h - .05, 0, w + .03, .05, d + .03, '#3a3a40');
      m.box(-.5, h, 0, .26, .014, .2, BLACK); m.box(-.5, h + .014, 0, .23, .003, .17, '#e8a0c0', { glow: 1.2 }); m.box(.1, h, .1, .08, .03, .14, '#2a2d33');
      m.cyl(.6, h, 0, .07, .16, '#b4c8cc', { sides: 8 }); for (let k = 0; k < 5; k++) m.box(.6 + (r() - .5) * .08, h + .16, (r() - .5) * .08, .03, .03, .03, pick(r, ['#e8604a', '#e8d24a', '#5ae88a']), T);
      m.box(.35, h, -.12, .1, .12, .1, '#ece6d6'); m.box(.35, h + .12, -.12, .015, .03, .015, '#fff2dc', { glow: 2, fine: true });
    }),
    kind('mod-display', 1.6, .45, 2.0, 'cover', 'a lit case of subdermal implants, glow studs and jewellery on black velvet', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, .7, d, '#15161a'); m.box(0, h - .1, 0, w, .1, d, '#15161a'); m.box(0, h - .12, .05, w - .1, .02, d - .12, '#fff0f6', { glow: 1.4 });
      for (let k = 0; k < 3; k++) { const y = .7 + k * .38; m.box(0, y, 0, w - .04, .04, d - .04, '#2a1a24'); for (let j = 0; j < 10; j++) m.box(-w / 2 + .12 + j * .15, y + .04, (r() - .5) * .2, .05, .02, .05, pick(r, [CHROME, BRASS, ROSE, MINT, '#e8f0ff']), { glow: r() < .4 ? 1.6 : 0, fine: k === 1 }); }
      m.box(0, .7, d / 2, w, h - .8, .01, '#b4c8cc', { glow: .04 });
    }),
    kind('autoclave-bench', 1.4, .5, .95, 'low', 'the clean bench: the autoclave (its lamp on), glove boxes, a sharps bin, wrapped needles', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h - .04, d, '#c9ccd1'); m.box(0, h - .04, 0, w + .02, .04, d + .02, '#e8eaec');
      m.box(-.35, h, 0, .45, .3, .4, '#dfe1e3'); m.cyl(-.35, h + .15, .2, .1, .02, '#8a9099', { rx: 1.57, sides: 10 }); m.box(-.2, h + .25, .2, .06, .03, .005, GREEN, { glow: 1.8 });
      for (let k = 0; k < 3; k++) m.box(.15 + k * .16, h, -.1, .14, .08, .24, pick(r, ['#5a86b8', '#e8eaec', '#5a9a6a']));
      m.box(.55, h, .12, .14, .2, .14, '#c8243a'); m.box(.55, h + .2, .12, .1, .02, .1, LEMON);
    }),
    kind('ring-light', .5, .5, 1.9, 'walkOver', 'a ring light on its stand, still lit', m => { for (let k = 0; k < 3; k++) m.box(0, .02, 0, .5, .02, .03, BLACK, { ry: k * 2.094 }); m.box(0, .02, 0, .02, 1.5, .02, BLACK); for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; m.box(Math.cos(a) * .22, 1.72 + Math.sin(a) * .22, 0, .12, .03, .03, '#f4f4ff', { glow: 2, rz: a + 1.57 }); } }),
    kind('stencil-sheets', .6, .5, .01, 'walkOver', 'stencil sheets dropped (line pictograms)', (m, r) => { for (let k = 0; k < 3; k++) { const x = (r() - .5) * .3, z = (r() - .5) * .2, a = r() * 3; m.flat(x, .038 + k * .001, z, .21, .28, '#ece6d6', { ry: a }); m.flat(x, .0385 + k * .001, z, .1, .12, '#3a3a6a', { ry: a + .4 }); } }),
    kind('studio-neon', 1.4, .08, 2.6, 'walkOver', 'a neon snake coiled round a heart on the wall (lit)', (m, r, { d }) => {
      const z = -d / 2 + .04;
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 1.8; m.box(Math.cos(a) * .35, 1.9 + Math.sin(a) * .3, z, .2, .035, .035, GREEN, { glow: 2, rz: a + 1.57 }); }
      m.box(-.07, 1.95, z, .16, .16, .035, MAGENTA, { glow: 2, rz: .785 }); m.box(.07, 1.95, z, .16, .16, .035, MAGENTA, { glow: 2, rz: .785 }); m.box(0, 1.84, z, .16, .16, .035, MAGENTA, { glow: 2, rz: .785 });
    }),
    kind('gloves', .5, .4, .02, 'walkOver', 'black gloves pulled off and dropped, wipes', (m, r) => { for (let k = 0; k < 2; k++) m.flat(-.1 + k * .2, .038, (r() - .5) * .1, .1, .2, BLACK, { ry: r() * 3 }); for (let k = 0; k < 4; k++) m.flat((r() - .5) * .3, .039, (r() - .5) * .2, .12, .1, '#e8e8e8', { ry: r() * 3 }); }),
    kind('piercing-bed', .7, 1.9, .75, 'low', 'a padded piercing bed with a paper roll, a pillow', (m, r, { w, d, h }) => { m.box(0, 0, 0, w - .1, .5, d - .2, '#c9ccd1'); m.box(0, .5, 0, w, .2, d, '#2a2a30'); m.box(0, .7, .1, w - .1, .005, d - .3, '#e8e8e8'); m.box(0, .7, -d / 2 + .25, .4, .08, .25, '#dcd8d0'); m.cyl(0, .6, d / 2 - .06, .05, w - .1, '#e8e8e8', { rz: 1.57, sides: 6, fine: true }); }),
    kind('jewel-case', 1.0, .4, 1.5, 'cover', 'a glass cabinet of implant jewellery and sterile packs', (m, r, { w, d, h }) => { m.box(0, 0, 0, w, .5, d, '#dfe1e3'); m.box(0, .5, 0, w, h - .5, d, '#b4c8cc', { glow: .06 }); m.box(0, h - .03, 0, w, .03, d, '#dfe1e3'); for (let k = 0; k < 3; k++) { const y = .6 + k * .28; m.box(0, y, 0, w - .06, .015, d - .06, '#e8eaec'); for (let j = 0; j < 6; j++) m.box(-.4 + j * .16, y + .015, (r() - .5) * .15, .08, .03, .05, pick(r, [CHROME, BRASS, '#e8e8f0', ROSE]), { fine: true }); } }),
    kind('sharps-cabinet', 1.0, .4, 1.6, 'cover', 'a steel cabinet, a sharps bin on top, sterile wraps', (m, r, { w, d, h }) => { m.box(0, 0, 0, w, h - .2, d, '#b6bcc4'); m.box(0, .05, d / 2, .01, h - .3, .01, STEEL_D); m.box(.3, h - .2, 0, .25, .2, .2, '#c8243a'); m.box(.3, h, 0, .2, .02, .15, LEMON); m.box(-.2, h - .2, 0, .3, .08, .25, '#5a86b8'); }),
    kind('ink-shelf', 1.6, .15, 2.2, 'walkOver', 'a wall shelf of ink bottles in every colour', (m, r, { w, d }) => { const z = -d / 2 + .02; for (let k = 0; k < 2; k++) { const y = 1.4 + k * .4; m.box(0, y, z + .06, w, .02, .12, WALNUT_L); for (let j = 0; j < 14; j++) m.cyl(-w / 2 + .08 + j * .105, y + .02, z + .06, .025, .1, pick(r, [BLACK, '#c8243a', '#2a4a8a', '#2a6a3a', '#c8c040', '#8a2a3a', '#e8e8e8', '#6a4a2a']), { sides: 5, fine: k === 1 }); } }),
    kind('ink-rack', 1.2, .45, 1.9, 'cover', 'a steel rack of ink cases, needle boxes and gloves', (m, r, { w, d, h }) => { for (const s of [-1, 1]) for (const t of [-1, 1]) m.box(s * (w / 2 - .02), 0, t * (d / 2 - .02), .035, h, .035, STEEL_D); for (let k = 0; k < 5; k++) { const y = .1 + k * .44; m.box(0, y, 0, w, .02, d, STEEL); if (k < 4) for (let j = 0; j < 4; j++) m.box(-w / 2 + .17 + j * .29, y + .02, 0, .25, .12 + r() * .15, d - .1, pick(r, ['#15161a', '#e8e8e8', '#5a86b8', '#c8243a', '#9a7b58']), { fine: k === 3 }); } }),
    kind('mini-fridge', .5, .5, .85, 'low', 'a mini fridge, a lit display', (m, r, { w, d, h }) => { m.box(0, 0, 0, w, h, d, '#2a2a30'); m.box(0, .05, d / 2, w - .06, h - .1, .01, '#3a3a40'); m.box(.15, h - .1, d / 2 + .006, .08, .03, .005, '#4a6aff', { glow: 1.6 }); m.box(0, h, 0, .2, .12, .14, '#9a7b58', T); }),
    kind('takeout', .6, .5, .12, 'walkOver', 'takeout boxes and chopsticks left on the floor', (m, r) => { m.box(-.1, 0, 0, .16, .1, .14, '#ece6d6', { ry: .3 }); m.box(.12, 0, .08, .16, .1, .14, '#ece6d6', { ry: -.4 }); m.box(.14, .1, .08, .15, .02, .13, '#8a5a2a'); m.box(0, 0, -.15, .24, .01, .012, '#c8a878', { ry: .2 }); m.box(0, 0, -.13, .24, .01, .012, '#c8a878', { ry: .25 }); m.cyl(-.2, 0, .18, .04, .14, '#c8243a', { sides: 6 }); }),

    // =================================================================== metro entrance
    ...[['ticket-machine', ROSE], ['ticket-machine-b', MINT]].map(([n, c]) => kind(n, .8, .5, 1.8, 'cover', 'a ticket machine: its screen showing the line map (pictograms), a coin slot, a card pad lit', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h, d, '#3a4048'); m.box(0, h - .12, d / 2 + .003, w - .06, .08, .005, c, { glow: 1.8 });
      m.box(0, 1.05, d / 2, .56, .44, .02, BLACK); m.box(0, 1.08, d / 2 + .012, .5, .38, .004, '#1a2a3a', { glow: 1.1 });
      for (let k = 0; k < 3; k++) m.box(0, 1.14 + k * .1, d / 2 + .016, .42, .02, .003, pick(r, [ROSE, MINT, LEMON, '#4a6aff']), { glow: 1.8, rz: (k - 1) * .2, fine: k === 1 });
      m.box(-.2, .7, d / 2 + .01, .12, .1, .02, '#2a2d33'); m.box(.18, .72, d / 2 + .01, .12, .08, .02, BLACK); m.box(.18, .74, d / 2 + .022, .08, .04, .004, GREEN, { glow: 1.6 });
      m.box(0, .3, d / 2 + .01, .4, .12, .03, '#1e2024');
    })),
    kind('metro-map', 2.6, .08, 2.6, 'walkOver', 'the lit line map: coloured lines, station dots, a you-are-here mark (no names)', (m, r, { w, d }) => {
      const z = -d / 2 + .02; m.box(0, 1.1, z, w, 1.3, .04, '#1e2024'); m.box(0, 1.14, z + .025, w - .08, 1.22, .004, '#e8eef2', { glow: 1.0 });
      const lines = [[ROSE, .2, .3], [MINT, -.15, -.2], ['#4a6aff', .4, .1], [LEMON, -.35, .45]];
      for (const [c, y0, tilt] of lines) { m.box(0, 1.75 + y0, z + .03, w - .3, .035, .003, c, { rz: tilt * .3, glow: .6 }); for (let k = 0; k < 6; k++) { const x = -w / 2 + .3 + k * (w - .6) / 5; m.box(x, 1.75 + y0 + x * tilt * .3, z + .034, .05, .05, .003, '#f2f2f2', { glow: .8, fine: true }); } }
      m.box(.3, 1.6, z + .036, .08, .08, .003, RED, { glow: 1.8 });
    }),
    kind('metro-bench', 1.6, .45, .5, 'low', 'a steel perforated bench', (m, r, { w, d, h }) => { m.box(0, h - .05, 0, w, .05, d, '#8a9099'); for (let k = 0; k < 8; k++) m.box(-w / 2 + .1 + k * .2, h, 0, .05, .002, d - .1, '#5a5e66', T); for (const s of [-1, 1]) m.box(s * (w / 2 - .1), 0, 0, .06, h - .05, d - .06, STEEL_D); }),
    ...[['belongings', 0], ['belongings-b', 1]].map(([n, v]) => kind(n, 1.4, .9, .6, 'walkOver', 'belongings dropped in the crush: bags, a suitcase on its side, a backpack, a coat, a child\'s toy', (m, r) => {
      suitcase(m, r, -.35, 0, 0, .55, .22, .38, pick(r, CASES), { flat: true, tag: v ? LEMON : '#e8e2d4', ry: .3 });
      m.box(.2, 0, .1, .35, .22, .25, v ? '#3a4a3a' : '#6a2a2e', { ry: -.4 }); m.box(.2, .22, .1, .2, .05, .05, BLACK, T);
      m.box(.35, 0, -.25, .5, .05, .4, v ? '#5a4a3a' : '#2c3a4c', { ry: .8 }); m.box(-.05, .22, 0, .3, .2, .18, '#8a3a4a', { ry: 1 });
      m.box(-.5, 0, .32, .3, .12, .12, '#b8c050', { ry: .5 }); m.cyl(.55, .04, .3, .04, .25, '#1e1f24', { rz: 1.57, ry: .3, sides: 6 });
      for (let k = 0; k < 4; k++) m.flat((r() - .5) * 1.2, .04, (r() - .5) * .8, .15, .1, pick(r, ['#dcd8d0', '#a8b0b8']), { ry: r() * 3, fine: true });
    })),
    kind('umbrella', 1.0, 1.0, .35, 'walkOver', 'an umbrella dropped open on the floor', m => { for (let k = 0; k < 8; k++) m.box(Math.cos(k * .785) * .22, .13, Math.sin(k * .785) * .22, .45, .02, .2, k % 2 ? LEMON : '#1e1f24', { ry: -k * .785, rz: .35 }); m.cyl(0, 0, .2, .012, .5, BLACK, { rx: 1.3, sides: 5 }); m.box(0, .03, .42, .04, .04, .12, BLACK); }),
    kind('stroller', .6, 1.0, .9, 'walkOver', 'a child\'s stroller tipped on its side, a blanket half out', m => { m.box(0, 0, 0, .5, .3, .7, '#3a4a5a', { rz: 1.3 }); m.box(-.1, .1, -.3, .4, .02, .02, CHROME, { rz: 1.3 }); for (const [x, z] of [[.15, -.3], [.15, .3]]) m.cyl(x, .05, z, .1, .04, BLACK, { rz: 1.57, sides: 8 }); m.flat(.05, .04, .3, .4, .3, '#d8c0b0', { ry: .3 }); }),
    kind('lost-shoe', .3, .15, .1, 'walkOver', 'a lost sneaker', m => { m.box(0, 0, 0, .1, .07, .27, '#e8e8e8', { ry: .2 }); m.box(0, .07, -.04, .08, .03, .12, '#2c3a4c', { ry: .2 }); }),
    kind('tactile-strip', 3.0, .3, .01, 'walkOver', 'lemon tactile paving before the gates', (m, r, { w, d }) => { m.flat(0, .037, 0, w, d, '#c8bc20'); for (let k = 0; k < 14; k++) m.flat(-w / 2 + .1 + k * .215, .039, 0, .05, d - .06, '#a89c10', T); }),
    kind('staff-desk', 1.4, .6, .9, 'low', 'the staff desk: the radio base on (its light), a phone, a log tablet, a mug', (m, r, { w, d, h }) => {
      m.box(0, h - .04, 0, w, .04, d, '#4a4e56'); m.box(-w / 2 + .25, 0, 0, .45, h - .04, d - .04, '#3a3f4c'); m.box(w / 2 - .02, 0, 0, .04, h - .04, d, '#3a3f4c');
      m.box(.3, h, -.1, .28, .12, .2, '#1e1f24'); m.box(.3, h + .12, -.15, .02, .25, .02, BLACK, T); m.box(.22, h + .08, .005, .06, .02, .004, GREEN, { glow: 2 });
      m.box(-.2, h, .05, .2, .015, .26, BLACK); m.box(-.2, h + .015, .05, .17, .003, .22, '#9fb8d8', { glow: 1.2 }); m.cyl(.55, h, .15, .04, .1, '#c8243a', { sides: 6 });
    }),
    kind('key-box', .6, .1, 1.9, 'walkOver', 'a small key box hanging open', (m, r, { d }) => { const z = -d / 2 + .02; m.box(0, 1.3, z + .03, .5, .5, .06, '#5a5e66'); for (let k = 0; k < 6; k++) m.box(-.18 + (k % 3) * .18, 1.4 + Math.floor(k / 3) * .2, z + .065, .02, .06, .01, k < 2 ? BRASS : '#3a3a3a', T); m.box(.28, 1.3, z + .22, .02, .5, .4, '#5a5e66', { ry: -.3 }); }),
    kind('fare-gate', 1.0, .3, 1.0, 'low', 'a fare gate pedestal: its flaps retracted, the lane lamps blinking (a red cross, a green arrow)', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, h, d, '#c9ccd1', { top: '#3a3f4c' }); m.box(-w / 2 + .12, h - .08, 0, .14, .06, d + .01, BLACK);
      m.box(-w / 2 + .09, h - .07, d / 2 + .006, .03, .04, .004, RED, { glow: 2, rz: .785 }); m.box(-w / 2 + .09, h - .07, d / 2 + .006, .03, .04, .004, RED, { glow: 2, rz: -.785 });
      m.box(-w / 2 + .16, h - .07, -d / 2 - .006, .06, .02, .004, GREEN, { glow: 2 });
      m.box(0, h, 0, .2, .004, .14, '#2e3138'); m.box(0, h + .004, 0, .12, .002, .08, BLUE, { glow: 1.6, fine: true });
      m.box(w / 2 - .1, .5, 0, .16, .3, d, '#5a5e66');
    }),
    kind('metro-shutter', 3.4, .2, 2.6, 'walkOver', 'the roll shutter over the stairs, pulled half down and jammed; black below it, a smeared handprint (old, dark), the housing above', (m, r, { w, d, h }) => {
      const z = -d / 2 + .03;
      m.box(0, 2.3, z + .02, w, .28, .12, '#4a4e56'); for (const s of [-1, 1]) m.box(s * (w / 2 - .05), 0, z + .02, .1, 2.3, .1, '#3a3f4c');
      m.box(0, 0, z, w - .2, .5, .02, '#020203');
      for (let k = 0; k < 18; k++) m.box(0, .5 + k * .1, z + .03, w - .2, .085, .03, k % 2 ? '#8a9099' : '#9aa1a8');
      m.box(0, .48, z + .03, w - .18, .05, .05, '#5a5e66');
      m.box(.3, .9, z + .048, .16, .2, .003, DRY); for (let f = 0; f < 4; f++) m.box(.24 + f * .04, 1.06, z + .048, .025, .12, .003, DRY, { rz: (f - 1.5) * .15 }); m.box(.34, .7, z + .048, .05, .25, .003, shade(DRY, .9));
      m.box(-.9, .6, z + .048, .7, .5, .003, '#6a6e76', { rz: .1, fine: true });
    }),
    kind('tally-marks', 1.2, .06, 1.6, 'walkOver', 'tally marks scratched and chalked on the wall by the shutter: days counted, groups of five', (m, r, { w, d }) => {
      const z = -d / 2 + .015; let x = -w / 2 + .1, y = 1.35;
      for (let g = 0; g < 9; g++) { for (let k = 0; k < 4; k++) m.box(x + k * .035, y, z, .012, .14, .003, '#dcdad4', { rz: (r() - .5) * .1 }); m.box(x + .05, y, z + .001, .18, .012, .003, '#dcdad4', { rz: .6 }); x += .22; if (x > w / 2 - .2) { x = -w / 2 + .1; y -= .22; } }
    }),

    // =================================================================== the bus
    ...[['bus-seats-3', 3, '#2c3a5a'], ['bus-seats-3b', 3, '#2c4a4a'], ['bus-seats-2', 2, '#2c3a5a']].map(([n, k, col]) => kind(n, k * .5, .5, .95, 'low', 'bus seats facing the aisle: moulded shells in the fleet\'s fabric, a grab pole at the end', (m, r, { w, d, h }) => {
      m.box(0, 0, -.05, w - .04, .38, d - .2, '#3a3d44');
      for (let i = 0; i < k; i++) { const x = -w / 2 + .25 + i * .5; m.box(x, .38, .02, .44, .08, d - .1, col); m.box(x, .44, -d / 2 + .06, .44, .5, .07, col, { rx: -.1 }); m.box(x, .95, -d / 2 + .06, .3, .02, .06, '#1e2024', T); }
      m.cyl(w / 2 - .04, 0, d / 2 - .04, .02, 2.2, LEMON, { sides: 6 });
    })),
    kind('bus-rear-bench', 2.18, .55, .95, 'low', 'the bus\'s rear bench across the back', (m, r, { w, d, h }) => { m.box(0, 0, -.05, w, .38, d - .1, '#3a3d44'); m.box(0, .38, .02, w - .04, .08, d - .1, '#2c3a5a'); m.box(0, .44, -d / 2 + .06, w - .04, .55, .07, '#2c3a5a', { rx: -.1 }); for (let k = 0; k < 4; k++) m.box(-w / 2 + .27 + k * .545, .461, .02, .01, .003, d - .15, '#1e2a44', T); }),
    kind('bus-cab', .9, .79, 1.2, 'low', 'the driver\'s cab: the seat, the wheel, a lit dash of pictograms, a partition', (m, r, { w, d, h }) => {
      m.box(0, 0, 0, w, .45, d, '#2a2d33'); m.box(-.15, .45, .05, .45, .1, .45, '#1e1f24'); m.box(-.15, .55, -.2, .45, .55, .08, '#1e1f24', { rx: -.1 });
      m.box(.3, .45, 0, .25, .5, d - .04, '#3a3d44'); m.box(.3, .95, 0, .26, .03, d - .1, '#1e2024'); m.box(.3, .98, -.15, .2, .004, .2, '#4a6aff', { glow: 1.4 }); m.box(.3, .98, .12, .12, .004, .1, GREEN, { glow: 1.6 });
      m.cyl(.2, .9, 0, .16, .03, BLACK, { rz: 1.2, sides: 10 });
      m.box(-.43, .45, 0, .03, .75, d, '#b4c8cc', { glow: .05 });
    }),
    kind('bag-on-seat', .4, .3, .8, 'walkOver', 'a shoulder bag left on a seat', m => { m.box(0, .46, 0, .34, .24, .14, '#6a4a3a', { rz: .15 }); m.box(0, .7, 0, .3, .02, .02, '#3a2a22', T); m.box(.08, .5, .075, .1, .08, .01, '#5a3a2a'); }),
    kind('bus-light', 10.5, .2, 2.6, 'walkOver', 'the ceiling light strip down the bus, one section flickered dark', (m, r, { w }) => { for (let k = 0; k < 7; k++) { const x = -w / 2 + .75 + k * 1.5, dead = k === 4; m.box(x, 2.55, 0, 1.3, .03, .12, dead ? '#3a3f4c' : '#eef4ff', dead ? {} : { glow: 2.2 }); } m.box(0, 2.58, 0, w, .02, .2, '#5a5e66'); }),
    kind('bus-rails', 10.0, 1.2, 2.3, 'walkOver', 'overhead grab rails with hanging loops', (m, r, { w, d }) => { for (const s of [-1, 1]) { m.cyl(0, 1.95, s * .45, .018, w, LEMON, { rz: 1.57, sides: 6 }); for (let k = 0; k < 12; k++) { const x = -w / 2 + .4 + k * (w - .8) / 11; m.box(x, 1.78, s * .45, .01, .15, .01, '#1e2024', T); m.box(x, 1.72, s * .45, .08, .06, .015, '#1e2024', T); } } for (const x of [-3, 0, 3]) m.box(x, 1.97, 0, .02, .6, .02, '#6a6e76'); }),
    kind('bus-edges', 11.4, 2.1, .02, 'walkOver', 'the floor\'s lemon edge lines and the door wells', (m, r, { w, d }) => { m.flat(0, .037, -d / 2 + .06, w, .04, LEMON); m.flat(0, .037, d / 2 - .06, w, .04, LEMON); for (const x of [-1.96, 4.04]) m.flat(x, .038, d / 2 - .35, 1.5, .5, '#4a4e56'); }),
    kind('fold-seat', .9, .3, 1.2, 'walkOver', 'the wheelchair bay: a folded seat and a strap on the wall', m => { m.box(0, .6, -.1, .8, .5, .06, '#2c3a5a'); m.box(.2, .3, -.12, .05, .8, .02, '#1e2024'); }),
    kind('bus-screen', .8, .2, 2.4, 'walkOver', 'the route screen hanging over the aisle: a line of stop dots, one lit', (m, r) => { m.box(0, 2.2, 0, .02, .3, .02, BLACK); m.box(0, 1.95, 0, .7, .25, .06, BLACK); m.box(0, 1.97, .031, .64, .2, .004, '#1a2a3a', { glow: 1 }); m.box(0, 2.06, .034, .56, .02, .003, MINT, { glow: 1.6 }); for (let k = 0; k < 6; k++) m.box(-.25 + k * .1, 2.06, .036, .03, .03, .003, k === 3 ? RED : '#f2f2f2', { glow: 1.8 }); }),
  ];

  // A display plinth (white, a lit mint edge at its foot).
  function plinth(m, w, top) { m.box(0, 0, 0, w, top, w, '#e8eaec'); m.box(0, top - .05, 0, w + .02, .05, w + .02, MINT, { glow: 1.4 }); m.box(0, top, 0, w + .02, .02, w + .02, '#2a2d33'); m.box(0, .03, 0, w + .004, .02, w + .004, MINT, { glow: 1.2 }); }
  // A stylised prosthetic arm standing up from a stand at height y: upper arm, a lit elbow, forearm, a hand.
  function prostheticArm(m, y, [a, b, lit]) {
    m.box(0, y, 0, .12, .04, .12, BLACK); m.cyl(0, y + .04, 0, .02, .1, CHROME, { sides: 6 });
    m.box(0, y + .12, -.04, .1, .3, .1, a, { rx: .25 }); m.cyl(0, y + .43, .03, .06, .05, lit, { rx: 1.57, sides: 8, glow: 1.6 });
    m.box(0, y + .45, .1, .08, .08, .3, b, { rx: -.35 }); m.box(0, y + .52, .3, .06, .07, .1, a, { rx: -.35 });
    for (let f = 0; f < 4; f++) m.box(-.03 + f * .02, y + .56, .37, .012, .012, .07, a, { rx: -.6, fine: true });
  }
  function prostheticHand(m, x, y, z, col) {
    m.box(x, y, z, .12, .04, .12, BLACK); m.box(x, y + .04, z, .08, .06, .06, BLACK); m.box(x, y + .1, z, .1, .12, .04, col); m.box(x + .06, y + .12, z, .025, .06, .025, col, { rz: -.6 });
    for (let f = 0; f < 4; f++) m.box(x - .036 + f * .024, y + .22, z, .018, .1 - Math.abs(f - 1.5) * .02, .02, col);
    m.box(x, y + .15, z + .021, .06, .01, .002, MINT, { glow: 1.6, fine: true });
  }
  function prostheticArmHanging(m, x, y, z, col) { m.box(x, y - .35, z, .08, .34, .08, col); m.cyl(x, y - .42, z, .045, .06, BLACK, { sides: 6 }); m.box(x, y - .75, z, .065, .3, .065, col); m.box(x, y - .86, z, .07, .1, .03, col); }
  // Eye units: a glass cube over three stylised eyes (a lit iris each).
  function eyes(m, r, y, pair) {
    m.box(0, y, 0, .4, .02, .4, BLACK); m.box(0, y + .02, 0, .38, .34, .38, '#b4c8cc', { glow: .05 });
    const cols = pair ? [ROSE, ROSE] : [MINT, '#4a6aff', LEMON];
    cols.forEach((c, k) => { const x = (k - (cols.length - 1) / 2) * .12; m.cyl(x, y + .02, 0, .01, .1, CHROME, { sides: 5 }); m.box(x, y + .12, 0, .07, .07, .07, '#eceef0'); m.box(x, y + .14, .036, .035, .035, .004, c, { glow: 1.8 }); m.box(x, y + .15, .039, .012, .012, .003, BLACK, T); });
  }
  // A lit wall case of the showroom's stock.
  function wallCase(m, r, w, d, h, what) {
    m.box(0, 0, 0, w, .5, d, '#e8eaec'); m.box(0, h - .12, 0, w, .12, d, '#e8eaec'); m.box(0, h - .14, .05, w - .1, .02, d - .12, '#f0fff6', { glow: 1.4 });
    m.box(0, .5, -d / 2 + .02, w, h - .62, .03, '#dfe6ea', { glow: .06 });
    for (let k = 0; k < 3; k++) {
      const y = .55 + k * .45; m.box(0, y, 0, w - .04, .015, d - .04, '#cfe0e8', { glow: .25 });
      for (let j = 0; j < 4; j++) { const x = -w / 2 + .25 + j * (w - .5) / 3; if (what === 'eyes') { if (k === 1) prostheticHand(m, x, y + .015, 0, j % 2 ? CHROME : '#e8eaec'); else { m.cyl(x, y + .015, 0, .01, .08, CHROME, { sides: 5 }); m.box(x, y + .09, 0, .08, .08, .08, '#eceef0'); m.box(x, y + .11, .041, .04, .04, .004, pick(r, [MINT, ROSE, '#4a6aff']), { glow: 1.8, fine: true }); } } else { if (k === 2) { m.box(x, y + .015, 0, .2, .04, .14, '#2a2d33'); for (let q = 0; q < 3; q++) m.box(x - .06 + q * .06, y + .055, 0, .03, .02, .02, '#7b8077', T); } else { m.box(x, y + .06, 0, .06, .06, .3, j % 2 ? CHROME : '#3a3f4c', { rx: -.4 }); m.cyl(x, y + .015, -.08, .02, .06, BLACK, { sides: 5 }); } } }
    }
    m.box(0, .5, d / 2, w, h - .62, .01, '#b4c8cc', { glow: .04 });
  }
  // A port's product box: white, the port pictogram on its lid, a return slip.
  function portBox(m, x, y, z, ry, open) {
    m.box(x, y, z, .22, .08, .16, '#eceef0', { ry }); const c = Math.cos(ry), s = Math.sin(ry);
    if (open) m.box(x - s * .1, y + .08, z - c * .1, .22, .01, .16, '#eceef0', { ry, rx: -1.2 });
    else { m.box(x, y + .08, z, .06, .004, .06, '#7b8077', { ry }); m.box(x + c * .06, y + .08, z - s * .06, .06, .003, .04, LEMON, { ry, fine: true }); }
  }
  // A repair surface: v 0 a bench, 1 a counter with a microscope, 2 a counter with a press.
  function repairTop(m, r, w, d, h, v) {
    m.box(0, 0, 0, w, h - .04, d, '#2a2d33'); m.box(0, h - .04, 0, w + .02, .04, d + .02, '#6a6e76'); m.box(0, h, 0, w - .2, .005, d - .1, '#2a5a4a');
    m.box(0, .1, d / 2 + .003, w - .1, .02, .005, MINT, { glow: 1.2 });
    for (let k = 0; k < 4; k++) { const x = -w / 2 + .3 + r() * (w - .6); m.box(x, h + .005, (r() - .5) * .2, .08, .01, .16, BLACK, { ry: r() - .5 }); m.box(x + .05, h + .005, (r() - .5) * .2, .06, .005, .12, '#6a8a5a', { ry: r(), fine: true }); }
    m.box(-w / 2 + .25, h, -.1, .18, .08, .14, '#3a3f4c'); m.box(-w / 2 + .25, h + .08, -.05, .06, .002, .03, RED, { glow: 1.8 });
    m.box(-w / 2 + .45, h + .02, .0, .015, .015, .2, '#8a9099', { ry: .6 }); m.box(-w / 2 + .52, h + .02, .07, .012, .012, .04, '#ff4a3a', { ry: .6, glow: 2 });
    m.cyl(w / 2 - .25, h, -.12, .06, .02, BLACK, { sides: 6 }); m.box(w / 2 - .25, h + .02, -.12, .02, .45, .02, BLACK); m.box(w / 2 - .35, h + .45, -.05, .25, .02, .02, BLACK, { rz: .3 }); m.cyl(w / 2 - .45, h + .38, -.02, .08, .03, '#e8f0ff', { sides: 8, glow: 1.4 });
    if (v === 1) { m.box(0, h, -.1, .16, .04, .2, BLACK); m.box(0, h + .04, -.15, .04, .35, .04, '#c9ccd1'); m.box(0, h + .3, -.08, .06, .1, .12, '#c9ccd1', { rx: .5 }); }
    if (v === 2) { m.box(.1, h, -.1, .3, .2, .25, '#8a9099'); m.box(.1, h + .2, -.1, .2, .06, .2, '#2a2d33'); for (let k = 0; k < 4; k++) m.box(-.5 + k * .03, h + k * .012, .12, .08, .008, .16, '#9fb4b8', { ry: k * .3, fine: true }); m.box(.6, h, -.05, .3, .015, .22, '#2a2d33'); m.box(.6, h + .015, -.16, .3, .2, .01, '#2a2d33', { rx: -.3 }); m.box(.6, h + .03, -.15, .26, .15, .003, '#6a8aa8', { rx: -.3, glow: 1.3 }); }
    screen(m, r, 0, h + .6, -d / 2 + .06, .6, .38, pick(r, ['#6a8aa8', MINT]), v === 0 ? 3 : 2);
    m.box(0, h + .58, -d / 2 + .02, .05, .04, .04, BLACK);
  }
  // A bank of pachinko machines (one or two faces): cabinets, lit frames, playfields, lamps, trays.
  function pachinkoBank(m, r, w, d, h, sides) {
    const n = Math.max(1, Math.round(w / .74)), step = w / n;
    m.box(0, 0, 0, w, 1.62, d, '#2a1a24');
    m.box(0, 1.62, 0, w, .23, d, '#1e1218'); m.box(0, 1.8, 0, w + .02, .02, d + .02, '#d8d0c4');
    for (const side of sides === 2 ? [1, -1] : [1]) {
      const zf = side * d / 2, dir = side;
      m.box(0, 1.66, zf + dir * .005, w - .04, .06, .005, pick(r, [ROSE, MAGENTA, LEMON]), { glow: 1.6 });
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + step * (i + .5), c = pick(r, PACHI), face = zf + dir * .012;
        m.box(x, .72, face, step - .1, .86, .02, shade(c, .55), { glow: 1.0 });
        m.box(x, .82, face + dir * .006, step - .2, .62, .01, '#1a1a2a');
        m.box(x, 1.02, face + dir * .012, .2, .16, .006, pick(r, ['#e8f0ff', c, '#ffe0ea']), { glow: 1.8 });
        m.box(x, 1.5, face + dir * .015, step - .24, .08, .03, c, { glow: 2.0 });
        m.box(x, .58, zf + dir * .07, step - .16, .12, .14, CHROME);
        m.box(x, .66, zf + dir * .1, step - .24, .02, .06, '#d8dce2', { fine: true });
        m.box(x + step * .32, .5, zf + dir * .08, .05, .05, .1, '#2a2d33', { fine: true });
        m.box(x - .15, .92, face + dir * .014, .2, .04, .004, pick(r, ['#e8f0ff', LEMON, ROSE]), { glow: 1.6, fine: true });
      }
    }
  }
  // Lit prize shelves.
  function prizeShelf(m, r, w, d, h, v) {
    m.box(0, 0, -d / 2 + .03, w, h, .06, '#3a1a2a'); m.box(0, 0, 0, w, .08, d, '#3a1a2a');
    for (let k = 0; k < 4; k++) {
      const y = .15 + k * .45; m.box(0, y, .02, w - .04, .02, d - .06, '#e8e2d4'); m.box(0, y - .02, d / 2 - .02, w - .04, .015, .01, ROSE, { glow: 1.6 });
      let x = -w / 2 + .1;
      while (x < w / 2 - .15) { const bw = .14 + r() * .14, bh = .12 + r() * .2; if (v === 1 && k === 3) { m.box(x + .06, y + .02, 0, .12, .16, .1, '#f2f2f2'); m.box(x + .06, y + .18, 0, .1, .08, .09, '#f2f2f2'); m.box(x + .1, y + .12, .05, .03, .06, .02, '#c8574a', T); x += .2; continue; } m.box(x + bw / 2, y + .02, 0, bw, bh, d - .14, pick(r, v ? ['#d8d880', '#c8574a', '#e8e2d4', '#5a9a6a'] : ['#e8a0b0', '#9fd8b8', '#e8e8f0', '#4a5a8a', '#d8c8b0']), { fine: k === 1 }); x += bw + .03; }
    }
  }
  // A high-roller machine.
  function vipMachine(m, r, w, d, h, lamp) {
    m.box(0, 0, 0, w, h, d, '#1e1218'); m.box(0, .1, d / 2, w - .06, h - .2, .02, BRASS_D);
    m.box(0, .8, d / 2 + .02, w - .2, .9, .01, '#1a1a2a'); m.box(0, 1.1, d / 2 + .03, .4, .3, .005, '#ffe0ea', { glow: 1.6 });
    for (let k = 0; k < 6; k++) m.box(-.3 + k * .12, .9, d / 2 + .026, .05, .05, .004, pick(r, [ROSE, LEMON, '#e8f0ff']), { glow: 1.8, fine: true });
    m.box(0, h - .12, d / 2 - .1, w - .1, .14, .14, lamp, { glow: 2 }); m.box(0, .62, d / 2 + .1, w - .2, .12, .2, CHROME); m.box(w / 2 - .15, .55, d / 2 + .1, .06, .06, .12, BRASS, T);
  }

  // Server racks in a row (w across, d deep): mesh doors, blinking lights.
  function serverRow(m, r, w, d, h, leds, openAt = -1) {
    const n = 5, rw = w / n;
    for (let k = 0; k < n; k++) {
      const x = -w / 2 + rw * (k + .5);
      m.box(x, 0, 0, rw - .02, h, d, '#18191d');
      if (k === openAt) { m.box(x, .05, d / 2 - .06, rw - .08, h - .1, .01, '#0e0f12'); for (let j = 0; j < 10; j++) { m.box(x, .15 + j * .18, d / 2 - .08, rw - .12, .12, .04, '#2a2d33'); m.box(x - .15, .19 + j * .18, d / 2 - .055, .04, .02, .01, pick(r, leds), { glow: 1.8, fine: true }); } m.box(x + rw / 2 - .04, .05, d / 2 + .25, .02, h - .1, rw - .1, '#26282e', { ry: -1.2 }); continue; }
      m.box(x, .05, d / 2, rw - .08, h - .1, .01, '#2a2d33');
      for (let j = 0; j < 12; j++) { if (r() < .25) continue; m.box(x - rw * .3 + r() * .1, .2 + j * .15, d / 2 + .006, .025, .015, .004, pick(r, leds), { glow: 1.8, fine: j % 3 !== 0 }); }
      m.box(x, h - .1, d / 2 + .006, rw - .12, .03, .004, '#4a4e56');
    }
  }

  return Object.fromEntries(KIND_LIST);
}

let district;
/** The east district's `{ INTERIORS, KINDS }` (building id -> pieces; data-made kinds), made once on first call. */
export function eastDistrict() {
  return district ??= { INTERIORS: buildInteriors(), KINDS: buildKinds() };
}
