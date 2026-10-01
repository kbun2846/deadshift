// City Test: Lumen's engine proving ground (stage 0; dev only, ?map=city-test
// or Developer tools > World > Map in progress). A short street with an
// L-shaped tall building of three rooms, a two-room wedge, a low shop with
// its roof, a sealed tower wall and a barricade: every new city system in
// one small place (AGENTS.md > Lumen > Stage 0).
import { cityBuildings } from '../world/city-rooms.js';

export const CITY_TEST_BUILDINGS = [
  { id: 'l-tower', tall: true, height: 60, seed: 11, district: 'boulevard',
    rooms: [{ id: 'hall', rect: [-24, -12, -20, -8] }, { id: 'office', rect: [-12, -4, -20, -14] }, { id: 'store', rect: [-24, -16, -8, -2] }],
    doors: [{ at: [-24, -14] }, { at: [-20, -2] }, { at: [-8, -14] }],
    links: [{ at: [-12, -17] }, { at: [-20, -8] }] },
  { id: 'wedge', tall: true, height: 60, seed: 12, district: 'flatiron',
    rooms: [{ id: 'prow', quad: [[2, -20], [12, -20], [12, -10], [8, -10]] }, { id: 'back', quad: [[12, -20], [22, -20], [22, -10], [12, -10]] }],
    doors: [{ at: [5, -15] }, { at: [17, -10] }], links: [{ at: [12, -15] }] },
  { id: 'low-shop', low: true, height: 5, seed: 13, district: 'garage',
    rooms: [{ id: 'shop', rect: [14, 24, 4, 12] }], doors: [{ at: [14, 8] }, { at: [19, 12] }] },
];

export const cityTest = {
  id: 'city-test', name: 'City Test', width: 64, depth: 56,
  spawn: { x: 0, z: 0 }, palette: { ground: '#2c2f36', road: '#2c2f36' },
  city: { ground: true, rain: true, mirror: true, signs: true, lights: true },
  ambient: 'none', birds: false,
  look: { sky: '#26304e', bounce: '#14161f', sun: '#8fa3c8', haze: '#141828' },
  playableArea: [[-30, -24], [30, -24], [30, 20], [-30, 20]],
  cityBuildings: CITY_TEST_BUILDINGS,
  buildings: cityBuildings(CITY_TEST_BUILDINGS),
  solids: [{ id: 'ring-n', x: 0, z: -26, w: 64, d: 4, height: 60 }, { id: 'ring-s', x: 0, z: 22, w: 64, d: 4, height: 60 }],
  props: [], fences: [], zones: [], scenerySeed: 7,
  targets: [{ id: 'a', x: -6, z: 4 }, { id: 'b', x: 6, z: 4, kind: 'dummy' }],
};
