// Lumen's interiors, the index (stage 4): building id -> its pieces, merged
// from the district files, and the district files' own data-made kinds.
// world/city-interiors.js reads it (the colliders and the rules); the models
// are drawn by render/city-interior-models.js. The piece format, the kinds
// and the rules are in world/city-interiors.js's header.
//
// A new district file: export a memoised `<district>District()` returning
// `{ INTERIORS, KINDS }` (building id -> pieces; the kinds it makes from
// parts, or {}), and add it to DISTRICT_FILES below. A building's id may
// appear in one district file only.
//
// Nothing here is built when the module loads: the district files are
// thousands of placements and hundreds of kinds made from parts, and they
// cost every page load ~.2 s at import (maps.js reaches this file through
// map-kit.js) whichever map it played. They are made on first use: a Lumen
// room's colliders or models, or a test reading LUMEN_INTERIORS. The
// exported records are lazy (world/lazy-record.js); the functions are the
// same data without the proxy.
import { southDistrict } from './lumen-interiors-south.js';
import { eastDistrict } from './lumen-interiors-east.js';
import { northDistrict } from './lumen-interiors-north.js';
import { lazyRecord } from '../world/lazy-record.js';

const DISTRICT_FILES = [southDistrict, eastDistrict, northDistrict];

let districts = null, interiors = null, kinds = null;
/** Each district's building id -> pieces (for tests/city-interiors.test.js: no building in two files). */
export const lumenInteriorDistricts = () => districts ??= DISTRICT_FILES.map(f => f().INTERIORS);
/** Every building id -> its pieces. */
export const lumenInteriors = () => interiors ??= Object.freeze(Object.assign({}, ...lumenInteriorDistricts()));
/** Every data-made kind the district files define. */
export const lumenKinds = () => kinds ??= Object.freeze(Object.assign({}, ...DISTRICT_FILES.map(f => f().KINDS)));

export const LUMEN_INTERIORS = lazyRecord(lumenInteriors);
export const LUMEN_KINDS = lazyRecord(lumenKinds);
