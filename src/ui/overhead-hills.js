// s3-look: the overhead map (pause > map) of a map with hills (map.terrain):
// Hollow Wick's lie of the land, drawn from the map's own data, never a
// hand-kept picture. overhead-map.js hands terrain maps here; Deadwater and
// the other flat maps keep their own drawing, unchanged.
//
// Bottom to top: the ground at its height (the base, then each raised level
// a step lighter: the terraces, Church Hill, the ridge, the town plateau),
// the ground's own patches (map.groundLayers: the woods' leaf litter, the
// field's stubble, the burying ground's turf, the town's yards), the stalk
// patches (crops), the stream (each water line's channel at its own width)
// and its ford, the drawn paths (the worn tracks; the paths that only shape
// the ground are faint dashes), the retaining walls, the fieldstone walls
// and rail fences, the decks over the water (bridge, log, footbridge), the
// buildings turned as they stand on their pads, the trees' crowns (the
// woods read as a mass of them), the irregular fence, and you.
import { buildingPoint, mapProps } from '../maps.js';
import { playableOutline } from '../playable-area.js';

export const OVERHEAD_HILLS = Object.freeze({
 low: '#2c2a22', high: '#4d4735',   // the ground from its lowest level to its highest
 water: '#3e5a5e', waterEdge: '#7d9a98', ford: '#6d7a72',
 path: '#9a8c6c', trail: '#8d8065',
 deck: '#8c7b5c', deckEdge: '#d0c09a',
 wall: '#a29c8e', fence: '#8f7b5d',
 pad: '#5d5646', buildingEdge: '#e0d2b2',
 tree: '#8a5a2e', treeEdge: '#c0612b', treeOther: '#6e5a3a',
 fenceLine: '#cdb88f',
});

const fmt = v => Math.round(v * 100) / 100;
const pts = list => list.map(p => (Array.isArray(p) ? `${fmt(p[0])},${fmt(p[1])}` : `${fmt(p.x)},${fmt(p.z)}`)).join(' ');
const mixHex = (a, b, t) => {
 const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
 return '#' + [16, 8, 0].map(s => Math.round((A >> s & 255) + ((B >> s & 255) - (A >> s & 255)) * t).toString(16).padStart(2, '0')).join('');
};
// A map colour drawn a little lighter, so dark dusk colours still read on the panel.
const lift = (hex, t = .25) => mixHex(hex, '#d8ccb0', t);

// A water line's channel: its centre line offset by each point's half width.
export function channelOutline(points) {
 const left = [], right = [];
 points.forEach((p, i) => {
  const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len, half = p[2] ?? 2;
  left.push([p[0] + nx * half, p[1] + nz * half]); right.push([p[0] - nx * half, p[1] - nz * half]);
 });
 return [...left, ...right.reverse()];
}

// The map's frame: the fence's box (with a margin), or the whole map.
export function overheadFrame(map) {
 const outline = playableOutline(map);
 const xs = outline.map(p => p[0]), zs = outline.map(p => p[1]), m = 2;
 return { x: Math.min(...xs) - m, z: Math.min(...zs) - m, w: Math.max(...xs) - Math.min(...xs) + m * 2, d: Math.max(...zs) - Math.min(...zs) + m * 2, outline };
}

export function hillsOverheadMapSVG(map, view, player) {
 const C = OVERHEAD_HILLS, terrain = map.terrain, { x, z, w, d, outline } = overheadFrame(map);
 const perimeter = pts(outline);
 const levels = (terrain.levels || []).filter(l => !l.overWater).slice().sort((a, b) => a.h - b.h);
 const hs = [terrain.base ?? 0, ...levels.map(l => l.h), ...(terrain.knolls || []).map(k => (terrain.base ?? 0) + k.h)];
 const lo = Math.min(...hs), hi = Math.max(...hs), tone = h => mixHex(C.low, C.high, hi > lo ? (h - lo) / (hi - lo) : .5);
 const paths = terrain.paths || [];
 const walls = mapProps(map).filter(p => /^fieldWall|Wall\d*$|railFence|splitRail/.test(p.type));
 const wallPieces = walls.flatMap(p => {
  const size = p.scale || 1, c = Math.cos(p.angle || 0), s = Math.sin(p.angle || 0);
  const boxes = p.collisionBoxes ? p.collisionBoxes.map(([bx, bz, bw, bd]) => [bx * size, bz * size, bw * size, bd * size]) : [[0, 0, p.w || 1, p.d || .3]];
  const fence = /rail|Rail/.test(p.type);
  return boxes.map(([bx, bz, bw, bd]) => {
   const cx = p.x + bx * c + bz * s, cz = p.z - bx * s + bz * c;
   return `<rect x="${fmt(cx - bw / 2)}" y="${fmt(cz - bd / 2)}" width="${fmt(bw)}" height="${fmt(Math.max(bd, .35))}" fill="${fence ? C.fence : C.wall}" transform="rotate(${fmt(-(p.angle || 0) * 180 / Math.PI)} ${fmt(cx)} ${fmt(cz)})"/>`;
  });
 });
 const trees = map.trees?.trees || [];
 const building = b => {
  const corner = (m) => pts([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => buildingPoint(b, a * (b.w / 2 + m), c * (b.d / 2 + m))));
  const ridgeAlongX = b.roof?.axis ? b.roof.axis === 'x' : b.w >= b.d;
  const ridge = ridgeAlongX ? [buildingPoint(b, -b.w / 2 + .4, 0), buildingPoint(b, b.w / 2 - .4, 0)] : [buildingPoint(b, 0, -b.d / 2 + .4), buildingPoint(b, 0, b.d / 2 - .4)];
  return `<polygon fill="${C.pad}" points="${corner(b.padMargin ?? 1)}"/><polygon fill="${lift(b.roofColor || '#938774', .42)}" stroke="${C.buildingEdge}" stroke-width=".35" points="${corner(0)}"/><polyline fill="none" stroke="${C.buildingEdge}" stroke-width=".3" opacity=".45" points="${pts(ridge)}"/>`;
 };
 return `<svg viewBox="${fmt(x)} ${fmt(z)} ${fmt(w)} ${fmt(d)}" role="img" aria-label="Overhead map showing the stream, paths, bridges, buildings, woods and your location" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="overhead-playable"><polygon points="${perimeter}"/></clipPath></defs>
    <g clip-path="url(#overhead-playable)">
    <polygon points="${perimeter}" fill="${tone(terrain.base ?? 0)}"/>
    <g>${levels.map(l => `<polygon fill="${tone(l.h)}" points="${pts(l.poly)}"/>`).join('')}${(terrain.knolls || []).map(k => `<circle cx="${k.x}" cy="${k.z}" r="${k.r}" fill="${tone((terrain.base ?? 0) + k.h)}"/>`).join('')}</g>
    <g opacity=".5">${(map.groundLayers || []).map(l => `<polygon fill="${lift([].concat(l.colour)[0], .12)}" opacity="${fmt(Math.min(1, (l.mix ?? 1) + .2))}" points="${pts(l.poly)}"/>`).join('')}</g>
    <g fill="#6f6a48" stroke="#9c9168" stroke-width=".35">${(map.crops || []).map(f => `<rect x="${fmt(f.x - f.w / 2)}" y="${fmt(f.z - f.d / 2)}" width="${f.w}" height="${f.d}" rx="1"/>`).join('')}</g>
    <g fill="${C.water}" stroke="${C.waterEdge}" stroke-width=".45">${(terrain.water || []).map(line => `<polygon points="${pts(channelOutline(line.points))}"/>`).join('')}</g>
    <g fill="none" stroke="${C.ford}" stroke-linecap="butt">${(terrain.fords || []).map(f => `<polyline stroke-width="${f.width}" stroke-dasharray=".6 .5" points="${pts(f.points)}"/>`).join('')}</g>
    <g fill="none" stroke="${C.trail}" stroke-width=".7" stroke-dasharray="1.4 1" stroke-linecap="round" opacity=".75">${paths.filter(p => p.colourMix === 0).map(p => `<polyline points="${pts(p.points)}"/>`).join('')}</g>
    <g fill="none" stroke="${C.path}" stroke-linejoin="round" stroke-linecap="round">${paths.filter(p => p.colourMix !== 0).map(p => `<polyline stroke-width="${p.width}" points="${pts(p.points)}"/>`).join('')}</g>
    <g fill="none" stroke="${C.wall}" stroke-width=".55" stroke-linecap="round">${(terrain.edges || []).map(e => `<polyline points="${pts(e.points)}"/>`).join('')}</g>
    <g>${wallPieces.join('')}</g>
    <g fill="${C.deck}" stroke="${C.deckEdge}" stroke-width=".35">${(terrain.decks || []).map(k => `<polygon points="${pts(k.poly)}"/>`).join('')}</g>
    <g>${map.buildings.map(building).join('')}</g>
    <g stroke-width=".3">${trees.map(t => `<circle cx="${fmt(t.x)}" cy="${fmt(t.z)}" r="${fmt(1.9 * (t.s || 1))}" fill="${t.kind === 'woods' ? C.tree : C.treeOther}" stroke="${t.kind === 'woods' ? C.treeEdge : C.fence}" opacity=".82"/>`).join('')}</g>
    </g>
    <polygon points="${perimeter}" fill="none" stroke="${C.fenceLine}" stroke-width=".8" stroke-linejoin="round" opacity=".95"/>
    ${player ? `<circle cx="${fmt(player.x)}" cy="${fmt(player.z)}" r="3.8" fill="#a8e2ff" opacity=".18"/><circle cx="${fmt(player.x)}" cy="${fmt(player.z)}" r="1.65" fill="#c7efff" stroke="#203844" stroke-width=".65"/>` : ''}
  </svg>`;
}
