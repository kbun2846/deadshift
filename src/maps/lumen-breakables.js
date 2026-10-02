// Lumen's breakables and its three trees (stage 4, task lumen-breakables; design
// 8 and 9: "lots of obstacles and breakables", "exactly 3 trees"). Plain data:
// { type, x, z, angle } (angle in radians about y; a prop's local x runs along
// world (cos a, -sin a)), the types from world/lumen-breakables.js, spread into
// `lumen.props` by lumen.js after the cover and the bases' screens (ids `lb<n>`
// by position, so new ones go at the end). 41 and the trees: 117 until the
// owner's clutter cut (2026-10-01, AGENTS.md > Lumen) took most parking meters
// and mesh bins (thin posts a body ran into unseen) and the doubled stools,
// crates, chairs and scooters of the busiest corners (80 left); the second cut
// the same day ("the streets should be more empty") took the rest of the
// small seats, crates and bins scattered along the sidewalks and kept the
// readable groups (a cart, a locker, bins by a wall, a rack, a windbreak);
// every type still stands somewhere. More of the street breaks now from the
// set pieces (world/lumen-setpieces.js SETPIECE_BREAKS).
//
// Grouped the way a street collects them: bins and bags by a wall, crates and
// stools where the market sells, parcel lockers and terminals where people
// waited, scooters dumped in a bay, cable reels and water barriers at
// roadworks, meters along a kerb. Found by a search (scratch: place.mjs in the
// stage 4 notes) that tries each group along a building's face (1.4 m off it,
// the door apron's edge) or a kerb and keeps it only where every rule holds
// (tests/lumen-breakables.test.js checks them on the finished map):
//   - inside the outline, on no building, solid or other piece;
//   - 1.4 m off every building (the sidewalk's building-side strip), 2.4 m
//     clear in front of every outer door, off every zebra and the scramble's
//     stripes, 1.5 m from the barricades, 1 m from the sniper lane, nothing
//     in the Crossroads' plaza or Back Alley (its 1.8 m and the body pile);
//   - gaps to every solid piece and wall under 0.7 m (shut) or 1.4 m or more (a
//     robot fits); 1.6 m from a steam vent; 3.6 m from a base's middle (no hard
//     cover there), 1.15 m from any spawn point and 1 m from a practice
//     target (a mover's whole track), and no tall piece on a target's line
//     of sight from its standing spot.
// None counts as cover for tests/lumen-cover.test.js (breakables are
// destructible); the streets' cover stays the stage 2 pieces'.
import './../world/lumen-furniture.js'; // (registers the street furniture's models: the map needs them whichever module the renderer loads first)
import { propStream } from '../world/lumen-kit.js';
import { roadGeometry } from '../world/lumen-ground.js';
import { ROADS, CROSSROADS } from './lumen-layout.js';

const B = (type, x, z, angle) => ({ type, x, z, angle });

const PLACED = [
  // The three trees
  B('cityTreeUptown', 56, -25, 0),
  B('cityTreeStacks', -46, -28, 0),
  B('cityTreeMetro', 29, 37.5, 0),
  // Night Market and North Lane
  B('cityFoodCart', 0, -45.53, 1.571), // a stall
  B('cityRecycleBin', -4.74, -41, 0), B('cityTrashBags', -6.14, -41, 0.04), // bins
  // West Street
  B('cityCableReel', -34.1, -46.44, 1.673), // cable reels
  B('cityWaterBarrier', -34.05, -29.68, -1.534), // roadworks
  // North frontage
  B('cityWaterBarrier', 0.45, -20.45, -1.32), // roadworks
  // The Boulevard
  B('cityBikeRack', -53.75, -8.02, 0), // a bike rack and its bikes
  B('cityInfoTerminal', 52.18, 8.7, -3.141), // a terminal
  B('cityRecycleBin', -44.56, 8.5, -3.141), B('cityTrashBags', -43.16, 8.5, -3.116), // bins
  B('cityBicycle', 36.92, -8.65, 0.149), // a bike
  // Uptown
  B('cityParcelLocker', 39.85, -28.13, 1.571), B('cityDeliveryBox', 39.85, -26.93, 1.48), // a parcel locker
  B('cityParcelLocker', 47.87, -54.85, -3.141), B('cityDeliveryBox', 46.57, -54.9, -3.064), // a parcel locker
  B('cityInfoTerminal', 35.17, -35.8, -3.141), // a terminal
  B('cityScooter', 33.8, -40.1, 1.587), // a parked scooter
  B('cityShopGlass', 57.7, -52.34, 1.571), B('cityShopGlass', 57.7, -54.24, 1.571), // a glass windbreak
  B('cityShopGlass', 33.7, -41.51, 1.571), B('cityShopGlass', 33.7, -43.41, 1.571), // a glass windbreak
  B('cityBicycle', 52.87, -54.85, -3.139), // a bike
  B('cityFoodCart', 12, -27.2, -1.571), // a food cart
  // The Avenue, north
  B('cityParkingMeter', 11.43, -21.47, 1.571), // a meter
  // Garage and South Street
  B('cityWaterBarrier', -40.1, 34.05, -0.023), // roadworks
  B('cityScooterHeap', -48.21, 26.15, 0.011), // a scooter dump
  B('cityRecycleBin', -55.68, 34, -3.141), B('cityMeshBin', -56.93, 34.05, -3.125), // bins
  // South frontage and the Avenue, south
  B('cityWaterBarrier', -8.16, 25.95, -2.88), // roadworks
  B('cityParcelLocker', 21.2, 28.15, -3.141), // a parcel locker
  // Charging lot
  B('cityScooter', -0.2, 51.7, 1.557), // a parked scooter
  B('cityCableReel', -2.37, 43.1, -2.977), B('cityCrate', -1.07, 43.15, 3.078), // cable reels
  // Velvet Row
  B('cityPlasticChair', -26.13, 47.8, -0.056), // a chair
  B('cityCrate', -35.62, 48, -0.04), B('cityStool', -36.47, 48.05, 0.353), // a crate table and its seat
  // Metro Plaza
  B('cityParcelLocker', 12.15, 39.45, -1.571), // a parcel locker
  B('cityBikeRack', 44.69, 30.3, -0.785), // a bike rack and its bikes
  B('cityScooterHeap', 32.73, 41.85, -3.106), // a scooter dump
  B('cityFoodCart', 16.44, 46, 0), B('cityCrate', 17.94, 45.85, 0.006), // a stall
];

export const LUMEN_BREAKABLE_PROPS = Object.freeze(PLACED.map((p, i) => Object.freeze({ id: `lb${i}`, ...p })));

// Counts, for the tests and the notes.
export const LUMEN_BREAKABLE_COUNTS = Object.freeze(LUMEN_BREAKABLE_PROPS.reduce((n, p) => { n[p.type] = (n[p.type] || 0) + 1; return n; }, {}));

// --- The light the lit ones throw on the ground -------------------------------
// A vending machine's window, a charging post's ring, a terminal's screen, a
// locker's panel and the trees' lit planters each lay a small pool of their
// colour on the ground in front of them: the same kind of pool the signs' and
// lamps' are (maps/lumen-signs.js lumenLightPools -> world/lumen-ground.js
// groundShapes), a small dim one. `props` is the map's whole prop list (the
// stage 2 vending machines and charging posts are lit too); the models pick
// their glow colour from the prop's own seeded stream, so this reads the same
// pick. No pink or red pool falls on a roadway or in the Crossroads (the
// signs' rule).
const LIT = {
  // type: [rx, rz, strength, ahead, pick]  (pick: which colours the model chooses from, in its order)
  cityVending: { rx: 1.7, rz: 1.15, strength: .55, ahead: .95, tones: ['blue', 'pink', 'white', 'green', 'white'], salt: 0 },
  cityChargePost: { rx: 1.3, rz: 1, strength: .5, ahead: .55, tones: ['green', 'green', 'lemon', 'white'], salt: 0 },
  cityInfoTerminal: { rx: 1.2, rz: .95, strength: .5, ahead: .7, tones: ['blue'] },
  cityParcelLocker: { rx: 1.5, rz: 1.1, strength: .45, ahead: .8, tones: ['blue'] },
  cityTreeUptown: { rx: 2.6, rz: 2.6, strength: .55, ahead: 0, tones: ['white'] },
  cityTreeMetro: { rx: 2.4, rz: 2.4, strength: .4, ahead: 0, tones: ['white'] },
  cityTreeStacks: { rx: 2.2, rz: 2.2, strength: .3, ahead: 0, tones: ['lemon'] },
};
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
function onRoadway(x, z) {
  for (const r of ROADS) {
    const poly = roadGeometry(r).road; let inside = true, sign = 0;
    for (let i = 0; i < poly.length && inside; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (c !== 0) { if (!sign) sign = Math.sign(c); else if (Math.sign(c) !== sign) inside = false; }
    }
    if (inside) return true;
  }
  return false;
}
const inCrossroads = (x, z) => x > CROSSROADS.x0 && x < CROSSROADS.x1 && z > CROSSROADS.z0 && z < CROSSROADS.z1;

export function lumenFurnitureLights(props) {
  const pools = [];
  for (const p of props) {
    const spec = LIT[p.type]; if (!spec) continue;
    const a = p.angle || 0, sn = Math.sin(a), cs = Math.cos(a);
    // (a vending machine's and a charging post's colours are the model's first seeded pick)
    const tone = spec.tones.length > 1 ? spec.tones[Math.floor(propStream(p, spec.salt || 0)() * spec.tones.length) % spec.tones.length] : spec.tones[0];
    const x = p.x + sn * spec.ahead, z = p.z + cs * spec.ahead, angle = Math.atan2(-sn, cs);
    if (tone === 'pink' || tone === 'red') {
      const ax = Math.cos(angle), az = Math.sin(angle);
      if ([[x, z], [x + ax * spec.rx, z + az * spec.rx], [x - ax * spec.rx, z - az * spec.rx], [x - az * spec.rz, z + ax * spec.rz], [x + az * spec.rz, z - ax * spec.rz]].some(([px, pz]) => onRoadway(px, pz) || inCrossroads(px, pz))) continue;
    }
    pools.push({ x: r2(x), z: r2(z), rx: spec.rx, rz: spec.rz, angle: r3(angle) || 0, tone, strength: spec.strength });
  }
  return pools;
}

// (Every type placed is a breakable of world/lumen-breakables.js or one of the stage 2 ones.)
export const LUMEN_BREAKABLE_TYPES_PLACED = Object.freeze([...new Set(PLACED.map(p => p.type))]);
