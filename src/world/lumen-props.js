// Lumen's placeholder props (stage 2): the street's cars, wrecks and furniture
// as prop types with real-world sizes and honest cover heights, drawn as flat
// grey boxes. The footprints, heights and collision boxes here are the
// gameplay truth (maps/lumen-cover.js places them and tests/lumen-cover.test.js
// checks the layout against them); stage 4 replaces the grey models with real
// ones of the same size, so nothing below the model needs to change.
//
// Types are spread into map-kit.js PROP_TYPES, so this file must not import
// map-kit.js (a cycle). Every name starts `city` so nothing collides with
// another map's types. Format as PROP_TYPES: `w`, `d` (footprint, metres),
// `health` (null: solid scenery, drawn in the static batch; a number: breakable
// by that many hits), `collisionBoxes` [x, z, w, d, height] in the prop's
// local frame (local x runs along world (cos a, -sin a)), `blocksSight`,
// `lowTop` (rounds fly over anything under 0.74 m; a low box otherwise stops
// them at its own top), `walkOver` (ankle clutter the movement solver ignores).
//
// Heights: whatever a body hides behind is at least 1.1 m; cars are 1.4 m;
// knee-high pieces (planters, benches, kerbs, bollards) are `lowTop`.

// Which types stage 3/4 dress with a lit face a player can shoot out (a sign, a
// screen, an ad): design 20 keeps every such face 15 m or more from a base, so
// tests/lumen-cover.test.js keeps these types away from the bases. Anything near
// a base that must block sight uses cityHoarding or cityConstruction, which are
// never dressed as a sign or a screen.
export const LUMEN_SHOOTABLE_DRESS = Object.freeze(['cityScreenWall', 'cityAdPillar', 'cityIslandScreen', 'cityKiosk']);

const CAR = { health: null }; // (cars are solid cover; their glass breaks cosmetically, later)
const car = (w, d, h) => ({ w, d, ...CAR, look: 'car', collisionBoxes: [[0, 0, w, d, h]] });

export const LUMEN_PROP_TYPES = Object.freeze({
  // --- Vehicles (local x is the car's length, its nose at +x) ---
  cityCompact: car(3.6, 1.7, 1.4), // the city EV
  citySedan: car(4.6, 1.9, 1.4),
  citySuv: car(4.9, 2.0, 1.7), // the armoured SUV
  cityTaxi: car(4.5, 1.9, 1.4),
  citySports: car(4.4, 2.0, 1.2), // low: a 1.28 m sniper round clears it
  cityVan: { w: 5.2, d: 2.1, health: null, blocksSight: true, look: 'van', collisionBoxes: [[0, 0, 5.2, 2.1, 2.3]] },
  cityTruck: { w: 7.4, d: 2.5, health: null, blocksSight: true, look: 'van', collisionBoxes: [[0, 0, 7.4, 2.5, 3.1]] }, // (a box delivery truck: the tallest, longest thing on the street)
  // A crumpled car: shorter and shorter-cabined than a whole one.
  cityWreck: { w: 4.3, d: 1.9, health: null, look: 'wreck', collisionBoxes: [[0, 0, 4.1, 1.8, 1.3]] },
  // Three crumpled cars in one piece across the Boulevard's two westbound
  // lanes (z -7.3..-0.7 once placed at angle 0): two lying east-west and one
  // north-south between them, a pocket open to the west where the lane's fire
  // has burned out. One piece, so its boxes stay put.
  cityPileup: { w: 5.6, d: 6.6, health: null, look: 'wreck',
    collisionBoxes: [[-.7, -2.35, 4, 1.9, 1.3], [1.85, .45, 1.9, 4.4, 1.3], [-.85, 2.35, 3.9, 1.9, 1.3]] },
  cityMotorbike: { w: 2, d: .8, health: 5, look: 'bike', collisionBoxes: [[0, 0, 2, .7, .8]] }, // (breakable, low: a dash takes it)

  // --- Street furniture ---
  // The bus shelter: glass back and two end panels (frame solid for now; the
  // glass goes breakable later), open to the kerb side (+z). Its seat is a
  // shallow perch on the back glass, inside the back's collider: a bench box
  // of its own (.5 m, low) broke two layout rules (a knee-high box on a piece
  // rounds meet; a .95 m robot gap to the hoarding beside the Back Alley stop).
  cityShelter: { w: 4, d: 1.6, health: null, look: 'light', collisionBoxes: [[0, -.7, 3.9, .16, 2.4], [-1.92, 0, .16, 1.5, 2.4], [1.92, 0, .16, 1.5, 2.4]] },
  cityPlanter: { w: 1.6, d: .9, health: null, lowTop: true, look: 'dark', collisionBoxes: [[0, 0, 1.6, .9, .65]] },
  cityPlanterTall: { w: 2, d: 1.2, health: null, look: 'dark', collisionBoxes: [[0, 0, 2, 1.2, 1.2]] }, // (a concrete plant box a body hides behind)
  cityJersey: { w: 2, d: .6, health: null, look: 'light', collisionBoxes: [[0, 0, 2, .6, 1.2]] }, // (a tall crash barrier: a round does not fly over it)
  cityBollard: { w: .3, d: .3, health: null, lowTop: true, look: 'light', collisionBoxes: [[0, 0, .3, .3, .9]] },
  cityBench: { w: 1.8, d: .6, health: null, lowTop: true, look: 'dark', collisionBoxes: [[0, 0, 1.8, .55, .5]] },
  cityKiosk: { w: 2.4, d: 2.4, health: null, blocksSight: true, look: 'box', collisionBoxes: [[0, 0, 2.4, 2.4, 2.6]] },
  cityDumpster: { w: 2, d: 1.3, health: null, look: 'dumpster', collisionBoxes: [[0, 0, 2, 1.3, 1.4]] },
  cityUtilityBox: { w: 1, d: .6, health: null, look: 'box', collisionBoxes: [[0, 0, 1, .6, 1.3]] },
  cityAdPillar: { w: 1.2, d: 1.2, health: null, blocksSight: true, look: 'pillar', collisionBoxes: [[0, 0, 1.2, 1.2, 2.8]] },
  cityVending: { w: 1, d: .9, health: 8, look: 'box', collisionBoxes: [[0, 0, 1, .9, 1.9]] },
  cityTrashBags: { w: 1.2, d: .8, health: 4, walkBreak: true, look: 'dark', collisionBoxes: [[0, 0, 1.1, .75, .5]] },
  cityHydrant: { w: .4, d: .4, health: 10, lowTop: true, look: 'light', collisionBoxes: [[0, 0, .4, .4, .8]] },
  // A construction hoarding panel: a hard break in a long lane.
  cityConstruction: { w: 3.5, d: .5, health: null, blocksSight: true, look: 'light', collisionBoxes: [[0, 0, 3.5, .4, 2]] },
  // The long screen of a street: an unlit construction hoarding, plain boards
  // on posts. It is the piece that breaks a long line without adding a car, and
  // (unlike cityScreenWall) is never dressed as a screen or a sign, so it may
  // stand beside a base.
  cityHoarding: { w: 5, d: .4, health: null, blocksSight: true, look: 'light', collisionBoxes: [[0, 0, 5, .4, 2.6]] },
  // A signal pole down across a corner: the pole lies low (rounds fly over it),
  // its stump and the mast arm's root stand up at one end.
  cityFallenPole: { w: 8, d: .8, health: null, lowTop: true, look: 'dark', collisionBoxes: [[0, 0, 7.2, .35, .45], [-3.6, 0, .8, .8, 1.4]] },
  // The Crossroads' raised traffic island: a planter at each end of a kerbed
  // refuge (low: rounds fly over), the curved screen standing between them.
  cityIsland: { w: 7.6, d: 2.6, health: null, lowTop: true, look: 'dark', collisionBoxes: [[-2.85, 0, 1.9, 2.3, .7], [2.85, 0, 1.9, 2.3, .7]] },
  cityIslandScreen: { w: 3.6, d: .5, health: null, blocksSight: true, look: 'box', collisionBoxes: [[0, 0, 3.6, .4, 2.6]] },
  // A freestanding ad screen on two legs (the dark back to the street): a wall a body hides behind.
  cityScreenWall: { w: 5, d: .5, health: null, blocksSight: true, look: 'box', collisionBoxes: [[0, 0, 5, .4, 3]] },
  cityCheckpointBarrier: { w: 3.4, d: .8, health: null, look: 'light', collisionBoxes: [[0, 0, 3.4, .7, 1.1]] }, // (a half-set crash barrier)
  // A market stall: a counter at the front, a canvas back, open at the ends.
  cityStall: { w: 2.5, d: 1.5, health: null, look: 'stall', collisionBoxes: [[0, .42, 2.4, .6, 1.25], [0, -.65, 2.4, .14, 2.4]] }, // (the back frame carries the tarp at 2.1-2.5 m)
  cityChargePost: { w: .5, d: .4, health: 6, look: 'light', collisionBoxes: [[0, 0, .45, .35, 1.5]] },
  cityCone: { w: .4, d: .4, health: 3, walkOver: true, look: 'light', collisionBoxes: [[0, 0, .4, .4, .5]] },
});

// The three greys of the placeholder models (never a team colour or a tint).
const GREY = Object.freeze({ body: '#6b6f78', dark: '#585c64', light: '#7c808a' });

// A grey placeholder for one prop, built from its collision boxes so what you
// see is what stops you. `view` is the WorldView (view.box(x, y, z, w, h, d,
// colour, parent)), `p` the prop with its type merged in, `g` its group.
// Vehicles get a lower body and a darker cabin so a car reads as a car.
// Stage 4's real models register themselves here by type (world/lumen-vehicles.js,
// world/lumen-furniture.js, world/lumen-breakables.js): `make(view, p, g)` builds
// the prop into its group like makeLumenPlaceholder. A type with no model yet
// keeps its grey placeholder.
export const LUMEN_MODELS = new Map();
export function registerLumenModel(type, make) { LUMEN_MODELS.set(type, make); }
// What every model's group goes through once built (world/lumen-kit.js sets
// it to unflush: this file imports nothing, map-kit.js reads its types).
let modelFinish = null;
export function setLumenModelFinish(fn) { modelFinish = fn; }

export function makeLumenPlaceholder(view, p, g) {
  const model = LUMEN_MODELS.get(p.type);
  // (then no two of its parts' faces left in one plane: world/lumen-kit.js unflush)
  if (model) { const made = model(view, p, g); modelFinish?.(g); return made; }
  const type = LUMEN_PROP_TYPES[p.type], size = p.scale || 1;
  const colour = { light: GREY.light, dark: GREY.dark }[type.look] || GREY.body;
  for (const [x, z, w, d, h] of type.collisionBoxes.map(b => b.map(v => v * size))) {
    if (type.look === 'car' || type.look === 'wreck') {
      // (A wreck's cabin is shoved back and crushed low.)
      const bodyH = h * (type.look === 'car' ? .58 : .5);
      view.box(x, bodyH / 2, z, w, bodyH, d, GREY.body, g);
      const cabinL = w * (type.look === 'car' ? .5 : .42), cabinH = h - bodyH;
      view.box(x - w * (type.look === 'car' ? .06 : .14), bodyH + cabinH / 2, z, cabinL, cabinH, d * .82, GREY.dark, g);
    } else if (type.look === 'van') {
      // A tall box behind and a shorter, darker cab in front.
      const cab = w * .22;
      view.box(x - cab / 2, h / 2, z, w - cab, h, d, GREY.body, g);
      view.box(x + (w - cab) / 2, h * .32, z, cab, h * .64, d, GREY.body, g);
      view.box(x + (w - cab) / 2 - cab * .15, h * .5, z, cab * .7, h * .28, d * .9, GREY.dark, g);
    } else if (type.look === 'bike') {
      view.box(x, h * .3, z, w, h * .5, d * .5, GREY.dark, g);
      view.box(x - w * .1, h * .8, z, w * .4, h * .4, d * .8, GREY.body, g);
    } else if (type.look === 'dumpster') {
      view.box(x, h * .45, z, w, h * .9, d, GREY.body, g);
      view.box(x, h * .95, z, w * 1.02, h * .1, d * 1.02, GREY.light, g); // (the lid)
    } else if (type.look === 'stall') {
      view.box(x, h / 2, z, w, h, d, z > 0 ? GREY.light : GREY.dark, g);
    } else if (type.look === 'pillar') {
      view.box(x, h / 2, z, w, h, d, GREY.body, g);
      view.box(x, h * .62, z, w * 1.06, h * .55, d * .35, GREY.dark, g); // (the screen band)
    } else view.box(x, h / 2, z, w, h, d, colour, g);
  }
}
