// Lumen stage 4: the overhead map (pause > map) of a night city (a map with a
// `city` block). Drawn from the map's own data, never a hand-kept picture:
// overhead-map.js hands any map with `city` here; Deadwater's and Hollow
// Wick's drawings are untouched (hash-tested in tests/overhead-hills.test.js).
//
// Bottom to top: a dark base (the haze beyond the ring), the ground clipped to
// the playable outline (map.city.ground.shapes, the painted lots, sidewalks,
// the Crossroads' plaza, roadways with their median, Back Alley and the lane;
// then its markings: kerbs, the lane lines and the zebras), the edge ring of
// sealed towers as a darker mass, the cars and cover (from their collision
// boxes), every building's rooms (floors, then walls with the doorways left as
// gaps: the outer ones lit, the inner ones plain), the sealed stairwells, the
// road-end barricades, the three trees' crowns, the outline and you.
//
// Everything is in world metres (x across, z down) with no transform of its
// own on the root, so the teleport click in main.js maps a click back through
// the SVG's getScreenCTM exactly as it does on the other maps. No lettering:
// the drawing is shapes only. No team colours; the accents are pale
// cool-white doorway light, dull traffic lemon and the player's blue dot.
import { mapProps, buildingOpenings } from '../maps.js';
import { roomPolygon } from '../world/city-rooms.js';
import { LUMEN_GROUND } from '../world/lumen-ground.js';
import { overheadFrame } from './overhead-hills.js';

// The city night palette, in the menu's style: dark slate, muted greys, a few
// lit accents. The ground's own colours are the lit-street values of the
// game (they read on the road in the moon), too close to each other on a
// small panel, so each is pushed apart here (GROUND_TONES).
export const OVERHEAD_CITY = Object.freeze({
  base: '#080a0e',          // beyond the ring
  towerLow: '#1d212a', towerHigh: '#12151b', towerEdge: '#303645', // the sealed towers: a darker mass, the taller the darker
  outline: '#8d97ab',       // the playable boundary
  floorLow: '#4a5262', floorTall: '#3a4150', // a room's floor: low buildings lighter, the tall ones deeper
  wall: '#a3adc0', shell: '#c3ccdd', // inner and outer walls
  doorOuter: '#e4ebf7', // an outer doorway: lit (an inner one shows the floor)
  sealed: '#12141a', sealedEdge: '#3a404d',
  vehicle: '#7f899d', vehicleEdge: '#b7c0d2', wreck: '#565c6b', wreckEdge: '#8a91a2', van: '#8c96aa',
  cover: '#606a7d', coverEdge: '#8d97aa', low: '#454c5b',
  tree: '#4f7360', treeEdge: '#9cbfae', planter: '#3d4453',
  barricade: '#2a2d35', barricadeStripe: '#b3a92a', // traffic lemon, dulled
  lemon: '#a39b2c', paint: '#aeb2bb', kerb: '#8b909c', zebra: '#c8ccd4',
  player: '#c7efff', playerEdge: '#203844', playerHalo: '#a8e2ff',
});

// Sizes in metres. A wall is .38 m thick in the game; the map draws it wider so
// it still reads at phone size (about 2.5 px a metre), and doorways at least
// as wide as they are, plus a little, for the same reason.
export const OVERHEAD_CITY_SIZES = Object.freeze({
  wall: .8, shell: 1.3, doorLip: .5, doorSpill: 1.1, minPiece: .3, treeCrown: .86, markMin: .3,
});

const C = OVERHEAD_CITY, S = OVERHEAD_CITY_SIZES, G = LUMEN_GROUND;
const fmt = v => Math.round(v * 100) / 100;
const pts = list => list.map(p => (Array.isArray(p) ? `${fmt(p[0])},${fmt(p[1])}` : `${fmt(p.x)},${fmt(p.z)}`)).join(' ');
const deg = a => fmt(-(a || 0) * 180 / Math.PI);

// The game's ground colours are close in value; the map pulls them apart so a
// sidewalk, a plaza, a roadway and the lots between buildings each read.
const GROUND_TONES = Object.freeze({
  [G.lot]: '#34373f', '#3c3a35': '#3e3b36', '#5a5e67': '#565b66', '#50555e': '#4d525c',
  [G.sidewalk]: '#565a65', [G.plaza]: '#5f636e', [G.asphalt]: '#20232a', [G.median]: '#454852',
  [G.alley]: '#2b2822', [G.velvet]: '#241f2a',
});
const groundTone = colour => GROUND_TONES[colour] || colour;

// A rotated box from a collider-style entry: centre, local size, turn. The
// game turns a box by -angle about y (buildingWalls' convention), which is
// SVG's rotate(-angle in degrees).
const box = (x, z, w, d, angle, attrs, radius = 0) =>
  `<rect x="${fmt(x - w / 2)}" y="${fmt(z - d / 2)}" width="${fmt(w)}" height="${fmt(d)}"${radius ? ` rx="${radius}"` : ''}${angle ? ` transform="rotate(${deg(angle)} ${fmt(x)} ${fmt(z)})"` : ''} ${attrs}/>`;

// The ground: the painted shapes that are plain surfaces (a tint or a glow is
// a lighting effect, a wear patch too small to read), in paint order.
function groundLayer(map) {
  const shapes = map.city?.ground?.shapes;
  if (!Array.isArray(shapes)) return `<rect x="${-map.width / 2}" y="${-map.depth / 2}" width="${map.width}" height="${map.depth}" fill="${groundTone(map.palette?.ground || G.lot)}"/>`;
  return shapes.filter(s => s.poly && !s.blend && !s.alpha)
    .map(s => `<polygon fill="${groundTone(s.colour)}" points="${pts(s.poly)}"/>`).join('');
}

// The markings, one path per colour: kerbs, lane lines and zebras. The dark
// gutters and the fainter paint are left out (they are only shade on screen).
function markingsLayer(map) {
  const marks = map.city?.ground?.markings;
  if (!Array.isArray(marks)) return '';
  const paint = new Map(), keep = { [G.kerb]: C.kerb, [G.paint]: C.paint, [G.lemon]: C.lemon, [G.crosswalk]: C.zebra };
  for (const colour of G.crosswalkFaded) keep[colour] = C.zebra;
  for (const m of marks) {
    const colour = keep[m.colour]; if (!colour) continue;
    const q = m.quad, list = paint.get(colour) || paint.set(colour, []).get(colour);
    list.push(`M${q.map(p => `${fmt(p[0])} ${fmt(p[1])}`).join('L')}Z`);
  }
  // (Kerbs first, then the paint, the lines and the zebras over them; the faded zebras share the crisp colour: at this size they only thin the stripe.)
  return [C.kerb, C.paint, C.lemon, C.zebra].filter(c => paint.has(c)).map(c => `<path fill="${c}" d="${paint.get(c).join('')}"/>`).join('');
}

// The ring: sealed towers, a darker mass (the taller the darker, so the
// skyline's steps read). Barricades and stairwells are drawn apart.
function towersLayer(map) {
  const ring = (map.solids || []).filter(s => s.ring);
  const heights = ring.map(s => s.height ?? 60), lo = Math.min(...heights), hi = Math.max(...heights, lo + 1);
  return `<g stroke="${C.towerEdge}" stroke-width=".35">${ring.map((s, i) => {
    const t = (heights[i] - lo) / (hi - lo), mix = Math.round(t * 100) / 100;
    return box(s.x, s.z, s.w, s.d, s.angle, `data-tower="${s.id}" fill="${mixHex(C.towerLow, C.towerHigh, mix)}"`);
  }).join('')}</g>`;
}
function mixHex(a, b, t) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  return '#' + [16, 8, 0].map(s => Math.round((A >> s & 255) + ((B >> s & 255) - (A >> s & 255)) * t).toString(16).padStart(2, '0')).join('');
}

// Cars and cover from the props' own collision boxes (what you see is what
// stops you). Cars are lighter, wrecks darker, low or small pieces dim.
const VEHICLE_LOOKS = new Set(['car', 'van', 'bike']);
function propsLayer(map) {
  const cars = [], cover = [], low = [], trees = [];
  for (const p of mapProps(map)) {
    if (p.walkOver) continue;
    const size = p.scale || 1, c = Math.cos(p.angle || 0), s = Math.sin(p.angle || 0);
    const boxes = p.collisionBoxes || [[0, 0, p.w, p.d]];
    if (/^cityTree/.test(p.type)) {
      // A tree's crown is drawn over everything; its planter's low boxes stand under it.
      trees.push(`<circle data-tree="${p.id}" cx="${fmt(p.x)}" cy="${fmt(p.z)}" r="${fmt(Math.max(p.w, p.d) * S.treeCrown)}" fill="${C.tree}" stroke="${C.treeEdge}" stroke-width=".35" opacity=".92"/>`);
      for (const [bx, bz, bw, bd] of boxes) if (Math.max(bw, bd) > 1) low.push(box(p.x + (bx * c + bz * s) * size, p.z + (-bx * s + bz * c) * size, bw * size, bd * size, p.angle, `fill="${C.planter}"`));
      continue;
    }
    for (const [bx, bz, bw, bd, bh] of boxes) {
      const w = bw * size, d = bd * size;
      if (Math.max(w, d) < S.markMin) continue;
      const x = p.x + (bx * c + bz * s) * size, z = p.z + (-bx * s + bz * c) * size, height = bh ?? p.coverHeight ?? 1.2;
      if (VEHICLE_LOOKS.has(p.look)) cars.push(box(x, z, w, d, p.angle, `fill="${p.look === 'van' ? C.van : C.vehicle}" stroke="${C.vehicleEdge}" stroke-width=".22"`, .5));
      else if (p.look === 'wreck') cars.push(box(x, z, w, d, p.angle, `fill="${C.wreck}" stroke="${C.wreckEdge}" stroke-width=".22"`, .4));
      else if (height >= 1.1 && Math.max(w, d) >= .6) cover.push(box(x, z, w, d, p.angle, `fill="${C.cover}" stroke="${C.coverEdge}" stroke-width=".18"`));
      else low.push(box(x, z, w, d, p.angle, `fill="${C.low}"`));
    }
  }
  return { under: `<g data-layer="cover">${low.join('')}${cover.join('')}</g><g data-layer="cars">${cars.join('')}</g>`, trees: `<g data-layer="trees">${trees.join('')}</g>` };
}

// One building: an underlay that thickens its silhouette into a shell, every
// room's floor, the walls round each room, then the doorways cut through
// them. Rooms are drawn as a group per building; the layer order (all
// floors, all walls, all doorways) keeps a neighbour's wall from closing a
// doorway.
function buildingsLayer(map) {
  const rooms = map.buildings || [];
  const tall = b => (b.wallHeight ?? b.height ?? 0) >= 20;
  const outline = b => pts(roomPolygon(b));
  const shell = rooms.map(b => `<polygon points="${outline(b)}"/>`).join('');
  const floors = rooms.map(b => `<polygon data-room="${b.id}"${b.group ? ` data-building="${b.group}"` : ''} fill="${tall(b) ? C.floorTall : C.floorLow}" points="${outline(b)}"/>`).join('');
  const walls = rooms.map(b => `<polygon points="${outline(b)}"/>`).join('');
  const gaps = [];
  for (const b of rooms) {
    for (const o of buildingOpenings(b)) {
      if (o.type !== 'door') continue;
      // (buildingOpenings insets both ends .1 m; the gap is the doorway's full width.)
      const dx = o.b.x - o.a.x, dz = o.b.z - o.a.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
      const x0 = o.a.x - ux * .1, z0 = o.a.z - uz * .1, x1 = o.b.x + ux * .1, z1 = o.b.z + uz * .1;
      gaps.push({ outer: !!o.outer, tall: tall(b), d: `M${fmt(x0)} ${fmt(z0)}L${fmt(x1)} ${fmt(z1)}` });
    }
  }
  // (An inner doorway is the floor showing through: each room's own tone.)
  const innerGaps = tall => gaps.filter(g => !g.outer && g.tall === tall).map(g => g.d).join(''), outer = gaps.filter(g => g.outer).map(g => g.d).join('');
  return `<g data-layer="buildings">
    <g fill="${C.shell}" stroke="${C.shell}" stroke-width="${S.shell}" stroke-linejoin="miter">${shell}</g>
    <g>${floors}</g>
    <g fill="none" stroke="${C.wall}" stroke-width="${S.wall}" stroke-linejoin="miter">${walls}</g>
    <path fill="none" stroke="${C.floorLow}" stroke-width="${S.wall + S.doorLip}" d="${innerGaps(false)}"/>
    <path fill="none" stroke="${C.floorTall}" stroke-width="${S.wall + S.doorLip}" d="${innerGaps(true)}"/>
    <path data-layer="doorways" fill="none" stroke="${C.doorOuter}" stroke-width="${S.doorSpill}" d="${outer}"/>
  </g>`;
}

// Sealed stairwells (a building's blocked part) and the road-end barricades.
function sealedLayer(map) {
  const solids = map.solids || [];
  const sealed = solids.filter(s => s.blockedIn).map(s => box(s.x, s.z, s.w, s.d, s.angle, `data-sealed="${s.id}" fill="${C.sealed}" stroke="${C.sealedEdge}" stroke-width=".35"`)).join('');
  const bars = solids.filter(s => s.barricade).map(s => {
    const a = s.angle || 0, along = s.w >= s.d, len = along ? s.w : s.d, c = Math.cos(a), sn = Math.sin(a);
    // The dashed stripe runs down the barrier's length through its middle.
    const hx = (along ? c : sn) * len / 2, hz = (along ? -sn : c) * len / 2;
    return box(s.x, s.z, s.w, s.d, a, `data-barricade="${s.id}" fill="${C.barricade}"`) + `<line x1="${fmt(s.x - hx)}" y1="${fmt(s.z - hz)}" x2="${fmt(s.x + hx)}" y2="${fmt(s.z + hz)}" stroke="${C.barricadeStripe}" stroke-width=".55" stroke-dasharray="1.1 .8"/>`;
  }).join('');
  return `<g data-layer="sealed">${sealed}</g><g data-layer="barricades">${bars}</g>`;
}

// Everything but you: made once per map (the teleport click redraws the map).
const cache = new WeakMap();
function cityMapBody(map) {
  let body = cache.get(map);
  if (body) return body;
  const { x, z, w, d, outline } = overheadFrame(map), perimeter = pts(outline), props = propsLayer(map);
  body = {
    frame: { x, z, w, d },
    svg: `<defs><clipPath id="overhead-frame"><rect x="${fmt(x)}" y="${fmt(z)}" width="${fmt(w)}" height="${fmt(d)}"/></clipPath><clipPath id="overhead-playable"><polygon points="${perimeter}"/></clipPath></defs>
    <g clip-path="url(#overhead-frame)">
    <rect x="${fmt(x)}" y="${fmt(z)}" width="${fmt(w)}" height="${fmt(d)}" fill="${C.base}"/>
    <g clip-path="url(#overhead-playable)">${groundLayer(map)}${markingsLayer(map)}</g>
    ${towersLayer(map)}
    ${props.under}
    ${buildingsLayer(map)}
    ${sealedLayer(map)}
    ${props.trees}
    <polygon points="${perimeter}" fill="none" stroke="${C.outline}" stroke-width=".7" stroke-linejoin="round" opacity=".9"/>
    </g>`,
  };
  cache.set(map, body);
  return body;
}

export function cityOverheadMapSVG(map, view, player) {
  const { frame, svg } = cityMapBody(map);
  return `<svg viewBox="${fmt(frame.x)} ${fmt(frame.z)} ${fmt(frame.w)} ${fmt(frame.d)}" role="img" aria-label="Overhead map showing the roads, buildings, cover and your location" xmlns="http://www.w3.org/2000/svg">
    ${svg}
    ${player ? `<circle cx="${fmt(player.x)}" cy="${fmt(player.z)}" r="3.8" fill="${C.playerHalo}" opacity=".18"/><circle cx="${fmt(player.x)}" cy="${fmt(player.z)}" r="1.65" fill="${C.player}" stroke="${C.playerEdge}" stroke-width=".65"/>` : ''}
  </svg>`;
}
