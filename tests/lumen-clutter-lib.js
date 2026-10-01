// Lumen's street clutter, counted (tools/lumen-clutter.mjs prints it,
// tests/lumen-clutter.test.js holds the line). Every outdoor prop on the map
// (`lumen.props`; the interiors are the rooms' own lists and are not here)
// sorted three ways:
//   street  a piece a body meets (a collider the movement solver keeps), a
//           thin mast drawn without one (`pole`) or a cone: what the owner
//           means by "objects on the streets";
//   flat    walk-over litter, ground marks and wall pieces (the street
//           detail, the dead and their leavings, hung cables and curtains);
// and by kind (vehicle, cover, screen, breakable, set piece, body, detail)
// and area (the Crossroads, Back Alley, the road whose corridor it stands
// in, else its district).
//
// A thin vertical collider is a box a body bumps into that the top-down
// camera barely shows: narrower than THIN.width both ways and THIN.height
// or taller (a pole, a post, a bollard, a meter, a bin on a stick), not inside
// a bigger box of the same piece (a tree's trunk in its planter).
import { lumen } from '../src/maps/lumen.js';
import { LUMEN_PROPS } from '../src/maps/lumen-cover.js';
import { BASE_SCREENS } from '../src/maps/lumen-spawns.js';
import { LUMEN_BREAKABLE_PROPS } from '../src/maps/lumen-breakables.js';
import { LUMEN_SETPIECE_PROPS } from '../src/maps/lumen-setpieces.js';
import { LUMEN_BODY_PROPS } from '../src/maps/lumen-bodies.js';
import { LUMEN_DETAIL_PROPS } from '../src/maps/lumen-detail.js';
import { ROADS, CROSSROADS, BACK_ALLEY, DISTRICTS } from '../src/maps/lumen-layout.js';
import { PROP_TYPES } from '../src/map-kit.js';

export const THIN = Object.freeze({ width: .5, height: .75 });
export const VEHICLES = Object.freeze(['cityCompact', 'citySedan', 'citySuv', 'cityTaxi', 'citySports', 'cityVan', 'cityTruck', 'cityWreck', 'cityPileup', 'cityMotorbike']);

const sources = () => [
  ['cover', LUMEN_PROPS], ['screen', BASE_SCREENS], ['breakable', LUMEN_BREAKABLE_PROPS],
  ['setpiece', LUMEN_SETPIECE_PROPS], ['body', LUMEN_BODY_PROPS], ['detail', LUMEN_DETAIL_PROPS],
];

// Which kind a placed piece is (vehicles are the stage 2 cover's cars).
export function kindOf(p, source) { return source === 'cover' && VEHICLES.includes(p.type) ? 'vehicle' : source; }

// The area a point stands in.
export function areaOf(x, z) {
  if (x >= CROSSROADS.x0 && x <= CROSSROADS.x1 && z >= CROSSROADS.z0 && z <= CROSSROADS.z1) return 'crossroads';
  if (x >= BACK_ALLEY.x0 - .5 && x <= BACK_ALLEY.x1 + .5 && z >= BACK_ALLEY.z0 - .5 && z <= BACK_ALLEY.z1 + .5) return 'back-alley';
  for (const r of ROADS) {
    const half = r.width / 2 + r.sidewalk + .5;
    if (r.axis === 'x' && Math.abs(z - r.centre) <= half && x >= r.from && x <= r.to) return r.id;
    if (r.axis === 'z' && Math.abs(x - r.centre) <= half && z >= r.from && z <= r.to) return r.id;
    if (r.axis === 'diagonal') {
      const [ax, az] = r.a, [bx, bz] = r.b, len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
      const t = (x - ax) * ux + (z - az) * uz, n = Math.abs(-(x - ax) * uz + (z - az) * ux);
      if (t >= 0 && t <= len && n <= half) return r.id;
    }
  }
  for (const d of DISTRICTS) { const [x0, x1, z0, z1] = d.box; if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return d.id; }
  return 'other';
}

// A type's boxes a body meets (none for walk-over and hung pieces).
export const solidBoxes = t => (t.walkOver ? [] : t.collisionBoxes || []);
// Its thin vertical boxes (see the header).
export function thinBoxes(t) {
  const boxes = solidBoxes(t);
  const inside = (a, b) => a !== b && Math.abs(a[0] - b[0]) + a[2] / 2 <= b[2] / 2 + 1e-6 && Math.abs(a[1] - b[1]) + a[3] / 2 <= b[3] / 2 + 1e-6;
  return boxes.filter(b => Math.max(b[2], b[3]) < THIN.width &&(b[4] ?? 1.2) >= THIN.height && !boxes.some(o => inside(b, o)));
}

const tally = (list, key) => {
  const n = {};
  for (const x of list) n[key(x)] = (n[key(x)] || 0) + 1;
  return Object.fromEntries(Object.entries(n).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
};

export function lumenClutter() {
  const all = [];
  for (const [source, list] of sources()) for (const p of list) {
    const t = PROP_TYPES[p.type];
    const solid = solidBoxes(t).length > 0;
    // (standing without a collider: the masts, and the cones a body kicks over)
    const standing = !solid && (!!t.pole || p.type === 'cityCone');
    all.push({ type: p.type, x: p.x, z: p.z, kind: kindOf(p, source), area: areaOf(p.x, p.z), street: solid || standing, solid, thin: thinBoxes(t).length > 0 });
  }
  const street = all.filter(p => p.street), thin = all.filter(p => p.thin);
  return {
    total: all.length, street: street.length, flat: all.length - street.length, solid: all.filter(p => p.solid).length,
    byKind: tally(all, p => p.kind), streetByKind: tally(street, p => p.kind), streetByArea: tally(street, p => p.area),
    streetByType: tally(street, p => p.type), thinRule: `under ${THIN.width} m across, >= ${THIN.height} m tall`,
    thin: thin.map(p => ({ type: p.type, x: p.x, z: p.z, area: p.area })), thinByType: tally(thin, p => p.type),
    poles: all.filter(p => p.street && !p.solid && p.type !== 'cityCone').length,
    detailByArea: tally(all.filter(p => p.kind === 'detail'), p => p.area),
    mapProps: lumen.props.length,
  };
}
