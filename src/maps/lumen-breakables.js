// Lumen's breakables and its three trees (stage 4, task lumen-breakables; design
// 8 and 9: "lots of obstacles and breakables", "exactly 3 trees"). Plain data:
// { type, x, z, angle } (angle in radians about y; a prop's local x runs along
// world (cos a, -sin a)), the types from world/lumen-breakables.js, spread into
// `lumen.props` by lumen.js after the cover and the bases' screens (ids `lb<n>`
// by position, so new ones go at the end).
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
  B('cityFoodCart', 0, -45.53, 1.571), B('cityCrate', -0.15, -47.03, 1.632), B('cityStool', -0.2, -44.23, 1.332), // a stall
  B('cityFoodCart', -10, -35.71, 1.63), // a stall
  B('cityCrate', -18.13, -32, 3.119), B('cityStool', -18.98, -32, 2.798), // a crate table and its seats
  B('cityCrate', -3.49, -32, 3.124), B('cityStool', -2.64, -32.05, -3.026), B('cityPlasticChair', -3.49, -32.85, -0.283), // a crate table and its seats
  B('cityRecycleBin', -4.74, -41, 0), B('cityTrashBags', -6.14, -41, 0.04), // bins
  // Stacks and West Street north
  B('cityCrate', -25.85, -49.96, -1.582), // crates
  B('cityPlasticChair', -25.8, -43.97, -1.398), B('cityPlasticChair', -25.85, -43.17, -1.503), // chairs
  B('cityCrate', -34.15, -16.26, 1.594), B('cityCrate', -34.15, -17.26, 1.484), // crates
  B('cityCrate', -34.15, -35.3, 1.549), B('cityCrate', -34.15, -36.3, 1.596), B('cityCrate', -33.5, -35.8, 1.524), // crates
  B('cityStool', -34, -42.18, 1.482), B('cityPlasticChair', -33.15, -41.33, -1.319), // a crate table and its seats
  B('cityStool', -34.25, -48.9, 1.629), // chairs
  B('cityPlasticChair', -40.02, -32.2, 0.209), // chairs
  B('cityCableReel', -34.1, -46.44, 1.673), B('cityCrate', -34.15, -45.14, 1.624), // cable reels
  B('cityWaterBarrier', -34.05, -29.68, -1.534), // roadworks
  B('cityMeshBin', -34.15, -18.45, 1.695), // a litter bin
  B('cityMeshBin', -25.85, -10.78, -1.578), // a litter bin
  // North frontage
  B('cityWaterBarrier', 0.45, -20.45, -1.32), B('cityCableReel', 0.35, -22.35, -1.397), // roadworks
  // The Boulevard
  B('cityScooter', -56.45, -8.7, -0.017), // a scooter
  B('cityCrate', -44.02, -8.5, 0.028), B('cityStool', -44.87, -8.45, -0.05), // a crate table and its seats
  B('cityRecycleBin', -49.07, -8.5, 0), B('cityMeshBin', -47.82, -8.55, -0.109), B('cityTrashBags', -50.47, -8.5, -0.033), // bins
  B('cityRecycleBin', -38.23, -8.5, 0), B('cityMeshBin', -36.98, -8.55, 0.003), // bins
  B('cityParkingMeter', 27.42, -7.43, -3.141), // meters
  B('cityParkingMeter', -33.93, -9.86, -1.571), B('cityParkingMeter', -33.93, -6.66, -1.571), // meters
  B('cityParkingMeter', -54.55, 7.43, 0), // meters
  B('cityBikeRack', -53.75, -8.02, 0), B('cityScooter', -52, -8.7, -0.016), // a bike rack and its bikes
  B('cityBikeRack', 34.66, -8.02, 0), // a bike rack and its bikes
  B('cityInfoTerminal', -41.6, 8.7, -3.141), // a terminal
  B('cityInfoTerminal', 52.18, 8.7, -3.141), B('cityMeshBin', 53.38, 8.7, -2.946), // a terminal
  B('cityRecycleBin', -44.56, 8.5, -3.141), B('cityTrashBags', -43.16, 8.5, -3.116), // bins
  B('cityMeshBin', 53.82, -7.6, -2.996), // a litter bin
  B('cityBicycle', 36.92, -8.65, 0.149), // a bike
  B('cityShopGlass', -13.46, 8.8, -3.141), B('cityShopGlass', -15.36, 8.8, -3.141), // a glass windbreak
  B('cityCrate', 39.88, 8.65, 3.098), // crates
  // Uptown
  B('cityParcelLocker', 39.85, -28.13, 1.571), B('cityDeliveryBox', 39.85, -26.93, 1.48), // a parcel locker
  B('cityParcelLocker', 47.87, -54.85, -3.141), B('cityDeliveryBox', 46.57, -54.9, -3.064), B('cityDeliveryBox', 49.07, -54.85, -3.121), // a parcel locker
  B('cityInfoTerminal', 35.17, -35.8, -3.141), B('cityMeshBin', 36.37, -35.8, 3.103), // a terminal
  B('cityBikeRack', 34.48, -38.35, 1.571), B('cityScooter', 33.8, -40.1, 1.587), // a bike rack and its bikes
  B('cityShopGlass', 57.7, -52.34, 1.571), B('cityShopGlass', 57.7, -54.24, 1.571), // a glass windbreak
  B('cityShopGlass', 33.7, -41.51, 1.571), B('cityShopGlass', 33.7, -43.41, 1.571), // a glass windbreak
  B('cityRecycleBin', 38.63, -38, 0), // bins
  B('cityBicycle', 52.87, -54.85, -3.139), // a bike
  B('cityFoodCart', 12, -27.2, -1.571), // a food cart
  // The Avenue, north
  B('cityParkingMeter', 11.43, -21.47, 1.571), B('cityParkingMeter', 11.43, -24.67, 1.571), // meters
  // Garage and South Street
  B('cityCableReel', -38.56, 34.1, 2.996), // cable reels
  B('cityCableReel', -49.88, 25.9, -0.142), // cable reels
  B('cityWaterBarrier', -40.1, 34.05, -0.023), // roadworks
  B('cityCrate', -34.15, 12.59, 1.532), B('cityCrate', -33.5, 12.09, 1.535), // crates
  B('cityScooterHeap', -48.21, 26.15, 0.011), // a scooter dump
  B('cityRecycleBin', -55.68, 34, -3.141), B('cityMeshBin', -56.93, 34.05, -3.125), // bins
  // South frontage and the Avenue, south
  B('cityWaterBarrier', -8.16, 25.95, -2.88), // roadworks
  B('cityParkingMeter', -33.93, 24.74, -1.571), // meters
  B('cityInfoTerminal', 16.26, 28.2, -3.141), B('cityMeshBin', 17.46, 28.2, -2.973), // a terminal
  B('cityParcelLocker', 21.2, 28.15, -3.141), B('cityDeliveryBox', 19.9, 28.1, -3.008), B('cityDeliveryBox', 22.4, 28.15, 3.096), // a parcel locker
  B('cityWaterBarrier', -25.95, 31.03, 1.568), // roadworks
  // Charging lot
  B('cityScooter', -3.75, 43.2, -3.102), // parked scooters
  B('cityScooter', -0.2, 51.7, 1.557), B('cityScooter', -0.15, 50.4, 1.787), // parked scooters
  B('cityCableReel', -2.37, 43.1, -2.977), B('cityCrate', -1.07, 43.15, 3.078), // cable reels
  B('cityScooterHeap', -21.85, 42.75, 1.717), B('cityScooter', -22.2, 41, 1.72), // a scooter dump
  // Velvet Row
  B('cityScooter', -25.22, 48.2, 2.944), // parked scooters
  B('cityPlasticChair', -31.9, 34.2, 3.042), B('cityPlasticChair', -32.7, 34.15, -3.025), // chairs
  B('cityPlasticChair', -26.13, 47.8, -0.056), // chairs
  B('cityCrate', -35.62, 48, -0.04), B('cityStool', -36.47, 48.05, 0.353), // a crate table and its seats
  B('cityStool', -31.75, 47.75, -0.207), B('cityPlasticChair', -32.55, 47.8, 0.073), // stools
  B('cityStool', -39.04, 48.25, 2.842), B('cityStool', -39.74, 48.25, -2.986), // stools
  B('cityScooter', -24.13, 34.2, -3.006), // parked scooters
  // Metro Plaza
  B('cityParcelLocker', 12.15, 39.45, -1.571), B('cityDeliveryBox', 12.1, 40.75, -1.614), // a parcel locker
  B('cityBikeRack', 44.69, 30.3, -0.785), // a bike rack and its bikes
  B('cityScooterHeap', 32.73, 41.85, -3.106), B('cityScooter', 34.38, 42.2, 2.665), // a scooter dump
  B('cityFoodCart', 16.44, 46, 0), B('cityCrate', 17.94, 45.85, 0.006), B('cityStool', 15.14, 45.8, -0.31), B('cityPlasticChair', 14.94, 46.55, -2.883), // a stall
  // Along West Street, the Avenue and South Street
  B('cityMeshBin', 11.6, 41.86, 1.458), // a litter bin
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
