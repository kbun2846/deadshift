// Lumen: a deserted cyberpunk city at night (AGENTS.md > Lumen; the plan is
// the project docs claude/lumen-master-prompt.md and claude/lumen-design.md).
// Built in stages. Stage 1: the ground (roads, sidewalks, kerbs, markings,
// the Crossroads, Back Alley, the districts' ground), the irregular outline,
// the ring of sealed towers and the road-end barricades. Stage 2: every
// playable building as rooms, doors and doorways (grey shells at their
// heights; maps/lumen-buildings-*.js), the cover and wrecks as grey
// placeholders (maps/lumen-cover.js), the bases, FFA points and practice
// targets (maps/lumen-spawns.js). Every city system (render/city-features.js)
// runs here: rain, the wet mirror, signs, the light pool. In progress: not
// in the menus.
import { OUTLINE, CROSSROADS } from './lumen-layout.js';
import { groundShapes, groundMarkings, lumenPuddles } from '../world/lumen-ground.js';
import { edgeTowers, barricades } from '../world/lumen-edge.js';
import { cityBuildings } from '../world/city-rooms.js';
import { LUMEN_BUILDINGS_NORTH } from './lumen-buildings-north.js';
import { LUMEN_BUILDINGS_SOUTH } from './lumen-buildings-south.js';
import { LUMEN_BUILDINGS_EAST } from './lumen-buildings-east.js';
import { LUMEN_PROPS } from './lumen-cover.js';
import { LUMEN_BREAKABLE_PROPS, lumenFurnitureLights } from './lumen-breakables.js'; // stage 4 D
import { LUMEN_SETPIECE_PROPS } from './lumen-setpieces.js'; // stage 5: the districts' set pieces
import { LUMEN_BODY_PROPS } from './lumen-bodies.js'; // stage 5: the dead and the stampede
import { LUMEN_DETAIL_PROPS } from './lumen-detail.js'; // stage 5: street detail (placed last, round everything else)
import { lumenSigns, lumenLightPools, lumenDoors } from './lumen-signs.js';
import { lumenVehicleLights, lumenVehiclePools } from './lumen-vehicle-lights.js'; // stage 4 C: the cars' and bus's lights
import { LUMEN_SPAWNS, BASE_SCREENS } from './lumen-spawns.js';
import { LUMEN_VENTS } from './lumen-vents.js';

// Every playable building (stage 2): rooms, doors, inner doorways.
export const LUMEN_BUILDINGS = [...LUMEN_BUILDINGS_NORTH, ...LUMEN_BUILDINGS_SOUTH, ...LUMEN_BUILDINGS_EAST];
// A building's blocked parts (a stairwell, the metro's stairs): solid to
// everything, drawn as part of its shell (render/city-shells.js).
const blockedSolids = LUMEN_BUILDINGS.flatMap(b => (b.blocked || []).map(([x0, x1, z0, z1], i) => ({ id: `${b.id}-blocked-${i}`, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, height: b.tall ? 60 : b.height, shell: false, blockedIn: b.id })));

// A property made on first read, then a plain data property (see `buildings`).
const settle = (key, make) => {
  const value = make();
  Object.defineProperty(lumen, key, { value, enumerable: true, writable: true, configurable: true });
  return value;
};

export const lumen = {
  id: 'lumen', name: 'Lumen', width: 136, depth: 120,
  spawn: { x: CROSSROADS.centre[0], z: CROSSROADS.centre[1] + 12 },
  palette: { ground: '#2c2f36', road: '#2c2f36' },
  city: { rain: true, mirror: true, signs: true, lights: true, water: true, life: true, wrecks: true, holograms: true, lightLife: true, interiorLife: true, vents: LUMEN_VENTS }, // (vents: gameplay sight, so in the map's fingerprint)
  ambient: 'none', birds: false,
  // Always night, and the night comes from the light, not dark paint (stage 3;
  // design sections 12 and 15; tools/contrast-check.mjs measures it on
  // screen). The design's colours are the family: hemisphere sky #26304e /
  // ground #14161f, moon #8fa3c8 low from the west-south-west, haze #141828.
  // The hemisphere is that cool hue lifted to a pale cool white (a bluer sky
  // than #d0d2d8 turns the street navy: the surfaces are already blue-grey)
  // and the moon the design's colour (shade about 0.8 of moonlight).
  // Darker (owner, 2026-09-30: "make the ambience and vibe darker... keep the
  // lights"): the ambient light (hemisphere x 8 -> 5.2, moon x 3 -> 2.4) is
  // what drops, so everything lit (street, walls, props) goes down together
  // and every sign, screen, lamp and pool, which is its own light, stands
  // out more. The street reads about #1f2532 in the moon (was #2e3445),
  // #13161f wet in shade (the floor, tools/contrast-lib.mjs GROUND_FLOOR, is
  // now #12141a), a sidewalk #3b4253 (was #5f677c; world/lumen-ground.js
  // darkened the paint too). Haze and horizon fog a shade deeper; Extreme's
  // grade cools and deepens the shade instead of richening the neon
  // (saturation 1.1 -> 1: colour that pops, not glares). Blood, the team
  // colours and the coats still clear their floors (15, 15, 8) on every
  // ground and light pool, dry and wet, in the moon and in shade: the tints
  // the pools are painted with are in tools/contrast-lib.mjs POOLS.
  look: { sky: '#d0d2d8', bounce: '#262833', skyIntensity: 5.2, sun: '#8fa3c8', sunIntensity: 2.4, sunOffset: { x: -34, y: 30, z: 12 },
    haze: '#10131f', fogNear: 62, fogFar: 150, exposure: 1, fog: { colour: '#1a162b', opacity: .12 },
    grade: { warmth: -.02, shade: .07, contrast: .07, saturation: 1 } },
  playableArea: OUTLINE.map(p => [p[0], p[1]]),
  cityBuildings: LUMEN_BUILDINGS,
  // The rooms and the solids are worked out from the layout the first time they
  // are read (the simulation, a collider build, the fingerprint), not when
  // maps.js loads: edgeTowers and cityRooms cost every page load ~.03 s,
  // whichever map it played. They stay enumerable, in this place in the
  // object, and turn into plain array properties on first read, so
  // everything that reads the map (the fingerprint included) sees what it saw.
  get buildings() { return settle('buildings', () => cityBuildings(LUMEN_BUILDINGS)); },
  get solids() { return settle('solids', () => [...edgeTowers(), ...barricades(), ...blockedSolids]); },
  props: [...LUMEN_PROPS, ...BASE_SCREENS, ...LUMEN_BREAKABLE_PROPS, ...LUMEN_SETPIECE_PROPS, ...LUMEN_BODY_PROPS, ...LUMEN_DETAIL_PROPS], fences: [], zones: [], scenerySeed: 2029,
  // Bases, teamBases, FFA points, no-spawn areas, the pick view, targets.
  ...LUMEN_SPAWNS,
};

// What is only drawn (the ground's paint and markings, the standing puddles)
// is kept out of the map's fingerprint (maps.js mapHash): not enumerable.
// The signs, screens, lamps and signal heads (maps/lumen-signs.js) are only drawn
// too (render/city-signs.js addList; the wildlife reads them for perches): not
// enumerable either, and the light pools under them are painted into the ground.
// All three are made the first time they are read (Lumen built, or a test):
// made here they cost every page ~.5 s at import (stage 3 review).
const lazy = (target, key, make) => Object.defineProperty(target, key, { enumerable: false, configurable: true, get() { const value = make(); Object.defineProperty(target, key, { value, enumerable: false }); return value; } });
lazy(lumen, 'citySigns', lumenSigns);
lazy(lumen, 'cityVehicleLights', () => lumenVehicleLights(LUMEN_PROPS)); // (fed to the signs with citySigns: render/city-signs.js)
lazy(lumen.city, 'ground', () => ({ shapes: groundShapes([...lumenLightPools(lumen.citySigns), ...lumenFurnitureLights(lumen.props), ...lumenVehiclePools(LUMEN_PROPS)], [], lumenDoors()), markings: groundMarkings() })); // (the doors: their thresholds, 2026-09-30)
lazy(lumen.city, 'puddles', lumenPuddles);
