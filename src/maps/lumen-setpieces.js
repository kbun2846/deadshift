// Lumen stage 5: the districts' set pieces (design 18b). Plain data { type, x, z, angle } (angle in radians about y; a
// prop's local x runs along world (cos a, -sin a)), the 54 types from world/lumen-setpieces.js, spread into
// `lumen.props` by lumen.js after the cover, the base screens and the breakables (ids `ls<n>` by position, so new
// ones go at the end). 102 pieces.
//
// Placed by a search (scratch: place.mjs in the stage 5 notes) that tries each wish near the spot the district's
// story wants it and keeps the nearest spot where every rule holds (tests/lumen-setpieces.test.js checks them on the
// finished map, next to the stage 2 cover rules):
//   - inside the outline; on no building, solid or other piece; 1.4 m off every building (the sidewalk's
//     building-side strip), 2.4 m clear in front of every outer door, off every zebra and the scramble's stripes,
//     1.5 m from the barricades, 1 m from the sniper lane, nothing in the Crossroads' plaza or Back Alley's 1.8 m;
//   - gaps to every solid piece and wall under 0.7 m (shut) or 1.4 m or more (a robot fits); 1.6 m from a steam vent;
//     3.6 m from a base's middle (no hard cover there), 1.15 m from any spawn and 1 m from a practice target;
//   - hung pieces (cable spans, bead curtains) have no collider: the spans cross a street or the courtyard 3.6 m up
//     (over anything, rounds pass under them), the curtains hang in a doorway's side 0.4 m off the wall.
// None counts as cover for tests/lumen-cover.test.js (the cover stays stage 2's); knee-high ones are `lowTop` (rounds
// pass over), the flat ones `walkOver`.
import './../world/lumen-setpieces.js'; // (registers the models: the map needs them whichever module the renderer loads first)

const P = (type, x, z, angle) => ({ type, x, z, angle });

const PLACED = [
  // The Boulevard: roadworks and the median
  P('cityRoadPit', -46, -4.4, 0.2), P('cityConeLine', -30, 5.4, -0.5), P('cityConeLine', 39.75, 3.6, -0.45), P('cityMedianPlanter', -50, 0, 0),
  P('cityMedianPlanter', -16.5, 0.5, 0), P('cityMedianPlanter', 34, 0, 0), P('cityMedianPlanter', -41, 0, 0), P('cityStopFlag', 42.5, 7.95, 0),
  P('cityStopFlag', 48.6, -8.4, 0),
  // Uptown: the plaza, the valets and the banners
  P('cityDryFountain', 49.25, -33, 0), P('citySculptBollard', 41, -13.3, 0), P('citySculptBollard', 42.9, -13.3, 0), P('citySculptBollard', 44.8, -13.3, 0),
  P('citySculptBollard', 58.3, -13.6, 0), P('citySculptBollard', 57.55, -16.5, 0), P('cityValetPodium', 12.1, -35.35, -1.571), P('cityValetPodium', 33.35, -8.4, 0),
  P('cityCameraPole', 41.85, -35.9, 0), P('cityCameraPole', 58.3, -12.85, 0), P('cityCameraPole', 39.7, -12, 0), P('cityPaverInlay', 44, -15.5, 1.571),
  P('cityPaverInlay', 53.5, -35.5, 0), P('cityPaverInlay', 44.5, -22.5, 1.571), P('cityBannerPole', 40.6, -21.25, 0), P('cityBannerPole', 40.3, -26.75, 0),
  P('cityBannerPole', 57, -38.6, 0),
  // The Stacks: the courtyard, its lines and its shrine
  P('cityDryingRack', -43.15, -24.6, 1.571), P('cityDryingRack', -33.2, -39.5, 1.571), P('cityCrateTable', -48, -30.6, 0), P('cityCrateTable', -33.3, -42.25, 0),
  P('cityCableSpanLong', -44, -28, 1.571), P('cityCableSpanLong', -30, -47, 0), P('cityCableSpanLong', -30, -18, 0), P('cityCableSpanShort', -20, -23.75, 1.571),
  P('cityCableSpanShort', -13, -23.75, 1.571), P('cityCableSpanShort', -6, -23.75, 1.571), P('cityJunctionBox', -34.75, -29.75, 1.571),
  P('cityJunctionBox', -27.1, -38.75, -1.571), P('cityDishPost', -48.25, -24.35, 0), P('cityDishPost', -45.75, -31.25, 0), P('cityShrineNiche', -45.25, -30.75, 1.571),
  P('cityBagSpill', -43.2, -30, 0), P('cityBagSpill', -32.5, -29.5, 0), P('cityScooterFrame', -40.45, -31.2, 1.571), P('cityWaterDrum', -47.1, -24.6, 0),
  // The Night Market: stalls and their goods
  P('cityTarpCanopy', -17.5, -35.95, 0), P('cityTarpCanopy', -6.4, -35.4, 0), P('cityProduceStack', -18, -36.6, 0), P('cityProduceStack', -8.85, -36.8, 0),
  P('cityProduceStack', -13.85, -37.7, 0), P('cityFishTank', -3.75, -36.75, 0), P('cityMeatRail', -17.5, -34.5, 0), P('cityGasBottles', -1.1, -40.8, 0),
  P('cityGasBottles', -21.5, -36.6, 0), P('cityPriceBoard', -19.75, -36.8, 0), P('cityPriceBoard', -5.25, -36.8, 0), P('cityMarketScale', -12.85, -37.7, 0),
  P('cityLanternPole', -23.1, -38.1, 0), P('cityLanternPole', -2.15, -36.4, 0), P('cityLanternPole', -12, -33.4, 0), P('cityBulbString', -14.25, -33.45, 0),
  P('cityBulbString', -5, -34.6, 0),
  // Velvet Row: the doors and the pavement after dark
  P('cityRopeStanchions', -49.6, 33.2, 0), P('cityDoormanPodium', -56.9, 33.4, 3.142), P('cityHeartStand', -51.6, 33.4, 3.142),
  P('cityBeadCurtain', -37.7, 35.58, 3.142), P('cityBeadCurtain', -34.3, 35.58, 3.142), P('cityBeadCurtain', -29.7, 49.58, 3.142),
  P('cityBeadCurtain', -43.58, 44.45, 1.571), P('cityBeadCurtain', -26.3, 35.58, 3.142), P('cityHighHeel', -47, 34, 0), P('cityHighHeel', -31, 34.35, 0),
  P('cityGlitterSpill', -50.5, 32.15, 0), P('cityGlitterSpill', -33.5, 33.5, 0.5), P('cityGlitterSpill', -42, 46, 1.571), P('cityDrinksCooler', -40.35, 33.35, 3.142),
  P('cityKaraokeMat', -33.85, 48, 0),
  // Garage and Charging: the workshop yard and the charge bays
  P('cityTyreStack', -56.5, 29.55, 0), P('cityTyreStack', -42.25, 26.15, 0), P('cityOilDrums', -49, 27.4, 0), P('cityCarOnStands', -50, 29.5, 0),
  P('cityEngineBlock', -52.5, 27.4, 1.571), P('cityCreeperBoard', -43.75, 26.25, 1.571), P('cityHazardPost', -58.6, 8.7, 0), P('cityHazardPost', -52.4, 8.7, 0),
  P('cityHazardPost', -34.2, 20, 0), P('cityHazardPost', -33.7, 13, 0), P('cityFastCharger', -16.5, 52.5, 3.142), P('cityFastCharger', 0.5, 50.25, 1.571),
  P('cityPlugCable', -21.3, 44.4, 1.571), P('cityToolCart', -51.05, 27.3, 0.3), P('cityCarLift', -40, 30.75, 0), P('citySpillKit', -54.85, 25.9, 1.571),
  P('citySpillKit', -5.25, 39.75, 0),
  // Flatiron and Metro Plaza: the station forecourt
  P('cityMetroMap', 32.75, 41.05, 3.142), P('cityTicketMachine', 25.75, 42, 1.571), P('cityTicketMachine', 35.75, 44.5, -1.571),
  P('cityTurnstileBank', 32.05, 39.05, 3.142), P('cityCommBooth', 19.25, 47.25, 1.571), P('cityCommBooth', 45.6, 7.55, 3.142), P('cityQueueCorral', 36.25, 48.25, 0.4),
  P('cityLitLedge', 29, 12.1, 1.18),
];

export const LUMEN_SETPIECE_PROPS = Object.freeze(PLACED.map((p, i) => Object.freeze({ id: `ls${i}`, ...p })));
