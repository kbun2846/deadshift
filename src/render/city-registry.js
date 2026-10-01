// Lumen's city systems' registry and render layers: a leaf module (no
// imports), so the systems and the hub can import each other's names in any
// order without an import cycle catching a value before it is set.
export const BRIGHT_LAYER = 3; // what Quality's mirror reflects: neon, screens, lamps, car and signal lights
export const GROUND_LAYER = 4; // the ground and what lies flat on it: never drawn into the mirror
// flag in map.city -> maker, in registration order (render/city-systems.js).
export const CITY_SYSTEMS = [];
export function registerCitySystem(flag, make) { const at = CITY_SYSTEMS.findIndex(e => e[0] === flag); if (at >= 0) CITY_SYSTEMS[at] = [flag, make]; else CITY_SYSTEMS.push([flag, make]); }
// The furnished interiors (stage 4, render/city-interior-models.js registers
// `build(shells, spec, rooms, group)`): the shells call it for each building
// after its floors, adding the rooms' furniture to the building's interior
// group (shown only when you are inside or by a doorway).
export const CITY_INTERIORS = { build: null };
export function registerCityInteriors(build) { CITY_INTERIORS.build = build; }
