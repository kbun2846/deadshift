// Lumen's facades (stage 4; lumen-design.md 4 "Facades from shared parts",
// 15 "Buildings by area", 18b; the owner: "the towers are 3D detailed with
// windows, some are blue, navy, grey, black etc., make it look
// cyberpunk-ish"). A library of low-poly, flat, vertex-coloured parts
// (panels, tiles, glass and window rows, fins, ledges, pilasters, sills, AC
// units, balconies, fire escapes, pipes, cables, shutters, rolling doors,
// canopies, blade sign boxes, corner neon, light inlays, parapets and roof
// dressing) and a recipe per district that dresses every playable building
// and every ring tower by its seed, so no two are alike.
//
// Everything is built into the shells' own vertex format (render/city-
// shells.js: position, normal, colour, cityCut, cityAt, cityGlow) and merged
// per 40 m cell: the parts every preset draws (tier 0, made at load) go into
// the shells' two cell meshes (no draw added); the detail tiers (1 from
// Balanced, 2 from Quality, 3 on Extreme, made the first time a preset shows
// them) into one mesh per cell per step (setQuality shows one), on the same
// material (no program built in play).
//
// The cut: a part below the first floor is stamped with its building's
// slot, role 0 (a first floor: world/city-cut.js's rule cuts it only where
// it goes see-through by you). Above it, a flat panel whose two ends are both on
// the wall's column breaks (the 1.5 m lattice the storeys are built in) is
// role 1, everything else up there (anything with depth, anything between
// two breaks) role 3; both are cut per fragment as their wall is, and carry
// their wall's anchor (FaceKit wallOf: rule 6, a part seen from behind its
// wall goes with the wall's face, which is turned away there). A piece on
// no wall (roof kit, laundry lines) is anchored at its own xz.
// Parts stop FACADES.topMargin under a wall's top.
//
// Spend where the camera looks: it stands 29 m up, 10 m south of you, and
// looks down at 70 degrees, so nothing above it is ever seen and a face
// turned north only by an upright phone's bottom edge. Depth parts stop at
// FACADES.detailTop; a face is dressed only if some camera the game can have
// sees it (faceSeen: fully if it stands in front of it, the flat pattern and
// first floor only if just glimpsed).
import { CUT, cutStamp } from '../world/city-cut.js';
import * as THREE from 'three';

export const FACADES = Object.freeze({
  proud: .02,            // m: a flat panel (glass, tile, stain) off its wall (clear of z-fighting at 60 m)
  // m: a flat panel laid over another at the same distance steps out this
  // much more (FaceKit.stack): shop glass over cladding, windows over ribs
  // were both at `proud` and flickered through each other as the camera
  // moved (owner, 2026-09-30).
  stack: .005,
  face: .19,             // m: a wall's outer face from its line (half the shells' .38 m)
  doorClear: .3, doorTop: 2.5, // parts keep this far either side of a doorway, up to its top
  sidewalk: Object.freeze({ top: 3, reach: .6 }), // under 3 m nothing stands out more than .6 m (it would stand on the sidewalk)
  detailTop: 30,         // m: depth parts stop here (nothing above the 29 m camera is ever seen)
  patternTop: 34,        // m: windows stop here (above the camera's reach; the wall's own colour above)
  topMargin: .8,         // m under a wall's top where parts stop
  roofLift: .06,         // m over a low roof where its dressing stands (the cap rides up to 5 cm over the top)
  // m a canopy stands out at most (the charging lot's big one: `canopyBig`):
  // the camera looks down on it, and a player under a deep one is hidden.
  canopyDepth: .9, canopyBig: 1.3,
  column: 1.5,           // m: the shells' lattice (SHELLS.column)
  seenReach: 75,         // m: a face farther than this from every camera is never dressed
  phoneSouth: 7,         // m south of the camera an upright phone's view reaches (fairFov at aspect .5)
  // The preset ladder: which detail mesh a preset shows (0: the parts in
  // the shells' own meshes only). Extreme is Quality plus.
  tiers: Object.freeze({ potato: 0, performance: 0, balanced: 1, quality: 2, extreme: 3 }),
});

// The signs' palette (render/city-signs.js NEON; that module imports the
// shells, so its colours are repeated here and tests/city-facades.test.js
// checks they match): corner neon and lit sign boxes, never team colours.
export const FACADE_NEON = Object.freeze({
  pink: '#ff2d8a', lemon: '#fcee0a', red: '#ff3040', blue: '#3d6bff', green: '#2bff8a', lime: '#a8ff3c',
  warmWhite: '#fff1d6', coldWhite: '#e6f0ff', velvetRed: '#ff2a3c', rose: '#ff5fa8', sodium: '#ffcf8a',
  uptownBlue: '#3558f0', coral: '#ff5a6e', sickGreen: '#6fd46a',
});
// Lit windows: warm white, cold white, pale blue, a few pink; the Stacks'
// warm bulbs and one sick green. Never a team colour (tested lit).
export const WINDOW_LIGHT = Object.freeze({
  warm: '#fff1d6', cold: '#e6f0ff', paleBlue: '#b8c9ff', pink: '#ff8cc0', bulb: '#ffe6c4', green: '#8fe08a',
});
// The ring's glass (owner): blue, navy, steel grey, near-black, and smoke.
export const TOWER_GLASS = Object.freeze({ blue: '#1f3552', navy: '#172238', steel: '#3b414b', black: '#101318', smoke: '#23272e' });

// The darker night (owner, 2026-09-30: "make buildings darker... lit windows
// and white facade panels much less bright, fewer at full brightness"):
//   surface  every colour a look names (walls, cladding, glass, trims,
//            shutters, the shells' own wall and roof colours: they read the
//            look) is scaled by this in sRGB, on top of the night look's
//            darker light; the blue, navy, grey and black stay apart
//   pane     a lit window's colour (was .42: a pale pane the ambient light
//            alone lit near white) and its glow: base + spread x h^2 (h the
//            window's own 0..1), so most lit windows are dim and a few bright
//            (was 1.3 + .9 h: every one bright); a whole lit floor
//            (litFloors) is a dim band
export const NIGHT = Object.freeze({
  surface: .86,
  pane: .22, glowBase: .45, glowSpread: 1.2, band: .45,
  slit: .38, slitGlow: 1,     // a first-floor slit's strip and a shop's lamp (were .5 / 1.5, .45 / 1.4)
  signBox: .45, signBoxGlow: 1, // the Boulevard's blade sign boxes (were .55 / 1.25)
  strip: .8,                  // x an Uptown or Flatiron light line's glow
});

// Doorways (owner, 2026-09-30: "where doorways and entrances are should be
// made subtly more apparent"): every outer doorway of a playable building
// gets a frame a step lighter than its wall, in the look's trim colour (two
// jambs and a lintel bar, flat against the wall beside the opening, never in
// it), and a small dim strip light over it (its own glow, cityGlow: no light
// cast). The ground's threshold strip is the ground's (world/lumen-ground.js
// thresholdShapes). The ring's sealed doors get none (they are not doorways).
export const DOORWAY = Object.freeze({
  jamb: .1, depth: .06,        // m wide and proud of the wall
  lintel: .1,                  // m tall, over the opening's 2.5 m
  trim: 1.6,                   // the frame's light (linear) against its wall's: a step lighter, never bright
  strip: Object.freeze({ inset: .12, h: .05, gap: .03, depth: .05, colour: .3, glow: 1 }),
  // (by recipe; the industrial west's is a warm bulb, not sodium: sodium this dim reads amber, a team colour)
  stripColour: Object.freeze({ 'velvet-row': 'rose', club: 'rose', garage: 'bulb', charging: 'bulb', stacks: 'bulb', 'night-market': 'bulb', uptown: 'coldWhite', flatiron: 'coldWhite', 'metro-entrance': 'coldWhite', 'body-mod': 'coldWhite', clinic: 'coldWhite' }),
});
export const nightColour = hex => darkHex(hex, NIGHT.surface); // (a look's colour as the night dresses it)
const darkHex = (hex, k) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
// Every '#rrggbb' a look names, darkened (the lit colours are names: 'warm', 'coldWhite'...).
function darkenLook(look, k = NIGHT.surface) {
  const walk = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? darkHex(v, k) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([key, x]) => [key, key === 'tints' ? x : walk(x)])) : v;
  return walk(look);
}

// ---------------------------------------------------------------------------
// Seeded numbers: a hash of place and seed (every column, floor and bay
// decides alone, the same on every run) and a small generator per building.
const mix = (h, x) => { h ^= Math.round(x * 64) | 0; h = Math.imul(h, 0x01000193); return h ^ (h >>> 15); };
export function hash(a, b = 0, c = 0, d = 0) {
  let h = mix(mix(mix(mix(0x811c9dc5, a), b), c), d);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export function rng(seed) {
  let t = (Math.round(seed * 9973) ^ 0x9e3779b9) >>> 0;
  return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
const mod = (a, n) => ((a % n) + n) % n;
const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
const range = (r, a, b) => a + r() * (b - a);

// Colours: linear (three's working space, as the shells' vertex colours).
const colourCache = new Map();
// (plain { r, g, b } objects, all of one shape: the soup's writes stay fast)
const C = hex => { let c = colourCache.get(hex); if (!c) { const t = new THREE.Color(hex); colourCache.set(hex, c = { r: t.r, g: t.g, b: t.b }); } return c; };
// A colour's tone moved by k (1 = itself), in linear light.
const tone = (hex, k) => { const c = C(hex); return { r: c.r * k, g: c.g * k, b: c.b * k }; };
const lit = (hex, k = 1) => tone(hex, k);
// A part's own light: grey, times its colour in the shader (cityGlow x
// colour), so what it gives off is its own hue, never shifted. (The wash's
// glow is coloured: a light's colour on a wall's.) A lit part's colour x
// (its glow + the scene's light) stays under about 1.8 x its hue, where
// every colour here is clear of the team colours (tested).
const shine = k => ({ r: k, g: k, b: k });

// ---------------------------------------------------------------------------
// The parts' vertex soup, in the shells' layout: typed arrays in chunks
// (filled once, never copied as they grow), and the ranges the facade wash
// lights (each with the wall it stands on).
const ATTRS = [['position', 3], ['normal', 3], ['color', 3], ['cityCut', 1], ['cityAt', 2], ['cityGlow', 3]];
export class PartSoup {
  constructor() { this.count = 0; this.chunks = []; this.ranges = []; this.flat = null; this.left = 0; this.chunk = null; this.k = 0; }
  vertex(x, y, z, n, c, stamp, ax, az, g) {
    // (chunks grow with the soup, 512 to 16384 vertices: a small soup
    // allocates little, a big one is never copied as it grows)
    if (this.left === 0) {
      const size = Math.min(16384, Math.max(512, this.count));
      this.chunk = { size, start: this.count, position: new Float32Array(size * 3), normal: new Float32Array(size * 3), color: new Float32Array(size * 3), cityCut: new Float32Array(size), cityAt: new Float32Array(size * 2), cityGlow: new Float32Array(size * 3) };
      this.chunks.push(this.chunk); this.left = size; this.k = 0;
    }
    const a = this.chunk, k = this.k++, i3 = k * 3;
    a.position[i3] = x; a.position[i3 + 1] = y; a.position[i3 + 2] = z;
    a.normal[i3] = n[0]; a.normal[i3 + 1] = n[1]; a.normal[i3 + 2] = n[2];
    a.color[i3] = c.r; a.color[i3 + 1] = c.g; a.color[i3 + 2] = c.b;
    a.cityCut[k] = stamp; a.cityAt[k * 2] = ax; a.cityAt[k * 2 + 1] = az;
    if (g) { a.cityGlow[i3] = g.r; a.cityGlow[i3 + 1] = g.g; a.cityGlow[i3 + 2] = g.b; }
    this.count++; this.left--; this.flat = null;
  }
  // Copy an attribute's used part into `out` at `offset` (floats).
  copyInto(name, out, offset) {
    const size = ATTRS_SIZE[name];
    for (const ch of this.chunks) out.set(ch[name].subarray(0, Math.min(ch.size, this.count - ch.start) * size), offset + ch.start * size);
  }
  // An attribute's used part, the chunks end to end (made once, kept until
  // the soup grows).
  view(name) {
    if (!this.flat) this.flat = {};
    let arr = this.flat[name];
    if (!arr) { arr = new Float32Array(this.count * ATTRS_SIZE[name]); this.copyInto(name, arr, 0); this.flat[name] = arr; }
    return arr;
  }
  get arrays() { return Object.fromEntries(ATTRS.map(([name]) => [name, this.view(name)])); }
}
const ATTRS_SIZE = Object.fromEntries(ATTRS);
// Several soups end to end (a cell's shells, then its parts).
export function concatSoups(list) {
  const total = list.reduce((n, s) => n + s.count, 0), out = {};
  for (const [name, size] of ATTRS) {
    const arr = new Float32Array(total * size); let at = 0;
    for (const s of list) {
      if (s.copyInto) s.copyInto(name, arr, at); else arr.set(s.view(name), at);
      at += s.count * size;
    }
    out[name] = arr;
  }
  return { count: total, arrays: out };
}

// ---------------------------------------------------------------------------
// Geometry helpers.
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// A flat quad a b c d facing n into `soup`, wound to face n; colours per
// corner (a b the bottom pair, c d the top, as the callers give them). Where
// the scoop is read: `at` null (each vertex's own xz), a fixed [x, z], or a
// wall's line { line: true, ax, az, ux, uz } (each vertex projected onto it).
function quad(soup, a, b, c, d, n, cBottom, cTop, stamp, at, glow) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const flip = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] < 0;
  if (!flip) { put(soup, a, cBottom, n, stamp, at, glow); put(soup, b, cBottom, n, stamp, at, glow); put(soup, c, cTop, n, stamp, at, glow); put(soup, a, cBottom, n, stamp, at, glow); put(soup, c, cTop, n, stamp, at, glow); put(soup, d, cTop, n, stamp, at, glow); }
  else { put(soup, a, cBottom, n, stamp, at, glow); put(soup, c, cTop, n, stamp, at, glow); put(soup, b, cBottom, n, stamp, at, glow); put(soup, a, cBottom, n, stamp, at, glow); put(soup, d, cTop, n, stamp, at, glow); put(soup, c, cTop, n, stamp, at, glow); }
}
function put(soup, p, col, n, stamp, at, glow) {
  let ax = p[0], az = p[2];
  if (at) { if (at.line) { const t = (p[0] - at.ax) * at.ux + (p[2] - at.az) * at.uz; ax = at.ax + at.ux * t; az = at.az + at.uz * t; } else { ax = at[0]; az = at[1]; } }
  soup.vertex(p[0], p[1], p[2], n, col, stamp, ax, az, glow);
}

// ---------------------------------------------------------------------------
// Where the camera can be: a player anywhere in the playable area (inside a
// building too), the camera 29 m up and CAMERA_TILT x 29 = 10.1 m south of
// them, looking north and down. On a wide screen its lowest ray is about
// straight down; a phone held upright sees up to ~7 m south of it (fairFov
// gives it a taller view). faceSeen: 2 if some camera stands in front of the
// face with the face north of it (seen properly: every part), 1 if only an
// upright phone's bottom edge sees it, steeply from above (glimpsed: the flat
// pattern and the first floor, no depth), 0 never (nothing spent on it).
export function cameraSpots(map, step = 7) {
  const poly = map.playableArea || [], out = [];
  if (!poly.length) return out;
  const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const inside = (x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const ax = poly[j][0], az = poly[j][1], bx = poly[i][0], bz = poly[i][1]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) c = !c; } return c; };
  // (the grid, and the outline's own corners: its edges are where the faces are)
  for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) if (inside(x, z)) out.push([x, z + 10.1]);
  for (const [x, z] of poly) for (const [dx, dz] of [[.5, .5], [-.5, .5], [.5, -.5], [-.5, -.5]]) if (inside(x + dx, z + dz)) out.push([x + dx, z + dz + 10.1]);
  return out;
}
export function faceSeen(px, pz, ox, oz, spots, reach = FACADES.seenReach) {
  let seen = 0;
  for (const [x, z] of spots) {
    const dx = x - px, dz = z - pz;
    if (dx * ox + dz * oz < .5) continue;      // behind the face (or edge on)
    if (dx * dx + dz * dz > reach * reach) continue;
    if (pz < z - .5) return 2;                  // north of that camera: in its view
    if (pz < z + FACADES.phoneSouth) seen = 1;  // just south of it: an upright phone's bottom edge
  }
  return seen;
}

// ---------------------------------------------------------------------------
// The looks: one per building (its district's family, varied by its seed)
// and one per ring tower. `outer`/`lower`/`roofColour` are the shells' own wall
// colours; the rest drives the parts.
const DISTRICT_LOOKS = {
  stacks(r, spec) {
    const wall = pick(r, ['#3c3a35', '#4a4640', '#413e38', '#46423b']);
    return {
      recipe: 'stacks', outer: wall, lower: pick(r, ['#353330', '#3a3733']), floorH: range(r, 2.9, 3.2),
      windows: { kind: pick(r, ['punched', 'punched', 'pairs']), step: 2, phase: Math.floor(r() * 2), sill: .8, head: 2.1, glass: '#15181c', frame: '#5a4032',
        lit: range(r, .16, .3), tints: ['bulb', 'bulb', 'bulb', 'warm', 'warm', 'green'], boarded: .12, stains: .55, stain: '#2c2a26' },
      ac: .45, acColour: pick(r, ['#6a6e75', '#5f635f', '#77776e']), balconies: .12, pilasters: pick(r, [4, 5, 6]), fireEscape: true, pipes: 3, pipeColour: '#4a4e55', cables: true,
      ledges: { every: 12 + Math.floor(r() * 2) * 3, depth: .18, colour: '#35332f', h: .25 },
      base: { kind: 'panels', colour: '#3a3733', height: 3.6, seams: '#2c2a27' }, rust: '#5e3d30',
      bays: { shutter: .35, half: .3, slit: .25, blank: .4 }, shutter: '#4e5a4c', canopy: r() < .5 ? { colour: '#2e4e7a', depth: 1.1 } : null,
      cornerNeon: r() < .5 ? ['sickGreen'] : null, laundry: true, tarp: '#2e4e7a',
    };
  },
  'night-market'(r, spec) {
    return {
      recipe: 'night-market', outer: pick(r, ['#56534c', '#5c4a3e']), lower: '#4f4c46', roofColour: '#4f4c46', floorH: 3,
      upperBase: 'corrugated', ribColour: '#4f4c46',
      base: { kind: 'corrugated', colour: '#56534c', height: 3.6 },
      bays: { shutter: .5, half: .4, slit: .2, blank: .3 }, shutter: '#5c5a52', canopy: { colour: pick(r, ['#2e4e7a', '#3f5a3a', '#b8b0a0']), depth: 1.3, tarp: true },
      roof: { ac: 2, vents: 3, tanks: 1, cables: true, parapet: '#46443e' }, pipes: 1, pipeColour: '#4a4e55',
      cornerNeon: null, lanterns: true,
    };
  },
  'north-frontage'(r, spec) {
    const ribbed = r() < .5;
    return {
      recipe: 'north-frontage', outer: ribbed ? '#52575f' : pick(r, ['#454850', '#4a4d55']), lower: '#3e4a4c', roofColour: '#2a2c30', floorH: range(r, 3.2, 3.6),
      windows: { kind: pick(r, ['ribbon', 'punched', 'slits']), step: pick(r, [1, 2]), phase: Math.floor(r() * 2), sill: 1, head: 2.3, glass: '#14171d', frame: '#a2abb5',
        lit: range(r, .12, .25), tints: ['warm', 'warm', 'cold', 'pink'], boarded: .05, stains: .15, stain: '#35373d' },
      upperBase: spec.tall ? null : (ribbed ? 'ribbed' : null), ribColour: '#4a4f57', pilasters: spec.tall && r() < .5 ? pick(r, [3, 4]) : null,
      ac: .3, acColour: '#6a6e75', pipes: 2, pipeColour: '#4a4e55', cables: r() < .6, fins: spec.tall && r() < .4 ? { step: 2, depth: .22, w: .12, colour: '#5a5f68' } : null,
      ledges: spec.tall ? { every: 9 + Math.floor(r() * 3) * 3, depth: .3, colour: '#3a3d44', h: .3 } : null,
      base: { kind: 'tiles', colour: '#3e4a4c', alt: '#46555a', height: 1.3 },
      bays: { shutter: .45, half: .35, glass: .3, slit: .15, blank: .15 }, shutter: '#33363e', signBoxes: .8,
      canopy: r() < .6 ? { colour: '#2b2e36', depth: 1.1, strip: 'warmWhite' } : null,
      roof: { ac: 2, vents: 2, tanks: r() < .5 ? 1 : 0, cables: true, parapet: '#3a3d44' },
      cornerNeon: r() < .6 ? [pick(r, ['pink', 'warmWhite', 'pink', 'lemon'])] : null,
    };
  },
  uptown(r, spec) {
    const glass = pick(r, ['#181b22', '#172238', '#1c2230']);
    return {
      recipe: 'uptown', outer: '#2b2f38', lower: pick(r, ['#5a5e67', '#555961']), roofColour: '#2a2c31', floorH: range(r, 3.6, 4),
      // (steel-grey mullions, fewer lit panes and more of them pale blue: pale
      // #b5bdc6 frames and a quarter of the floor-high panes lit cold white read
      // as a white grid on Quality; the black and blue glass leads)
      windows: { kind: 'curtain', step: 1, glass, frame: '#434a54', lit: range(r, .1, .18), tints: ['cold', 'paleBlue', 'paleBlue', 'warm'], sheen: .3, litFloors: 1 },
      fins: { step: pick(r, [1, 2]), depth: range(r, .25, .45), w: .1, colour: pick(r, ['#4a5058', '#555c65']) },
      strips: r() < .7 ? { step: pick(r, [3, 4, 6]), colour: pick(r, ['coldWhite', 'uptownBlue']), glow: 1.8 } : null,
      ledges: { every: 12, depth: .5, colour: '#565d66', h: .18 }, ledgeLight: pick(r, ['coldWhite', 'uptownBlue']),
      base: { kind: 'stone', colour: '#5a5e67', alt: '#62666f', height: 3.6 },
      bays: { glass: .7, blank: .3 }, canopy: { colour: '#b5bdc6', depth: 1.6, strip: 'coldWhite', glass: true },
      roof: { ac: 3, vents: 2, tanks: 0, cables: false, parapet: '#7c838c' },
      cornerNeon: r() < .4 ? ['uptownBlue'] : null, pipes: 0,
    };
  },
  garage(r, spec) {
    return {
      recipe: 'garage', outer: pick(r, ['#4a4a48', '#6a6e70']), lower: '#4a4a48', roofColour: '#5c6064', floorH: 3.4,
      upperBase: 'ribbed', ribColour: '#62666a',
      windows: { kind: 'slits', step: 2, phase: 0, sill: 1.6, head: 2.1, glass: '#15181c', frame: '#6a6e70', lit: .5, tints: ['bulb', 'bulb', 'warm'] },
      base: { kind: 'ribbed', colour: '#4a4a48', rib: '#55575a', height: 3.6 }, hazard: true,
      bays: { rolling: .75, blank: .25 }, rolling: pick(r, ['#4e5a66', '#5e3d30']),
      canopy: null, pipes: 2, pipeColour: '#6a6e70',
      roof: { ac: 1, vents: 4, tanks: 1, cables: true, parapet: '#55595d' }, cornerNeon: null,
    };
  },
  charging(r, spec) {
    return {
      recipe: 'charging', outer: '#4a4a48', lower: '#4a4a48', roofColour: '#5c6064', floorH: 3.4,
      upperBase: 'ribbed', ribColour: '#5c6064',
      base: { kind: 'panels', colour: '#4a4a48', seams: '#3a3a3a', height: 3.6 }, hazard: true,
      bays: { glass: .5, slit: .3, blank: .2 }, canopy: { colour: '#3a3e44', depth: 2.4, strip: 'green', big: true },
      roof: { ac: 1, vents: 2, tanks: 0, cables: true, parapet: '#55595d' }, pipes: 1, pipeColour: '#6a6e70', cornerNeon: ['green'],
    };
  },
  'south-frontage'(r, spec) {
    if (spec.id === 'clinic') return {
      // (pale clinical, a step down for the darker night, 2026-09-30: #8a9098 / roof #5a5e66 read as a white slab from above)
      recipe: 'clinic', outer: '#7a8088', lower: '#3e4446', roofColour: '#4a4e55', floorH: 3.4, upperBase: null,
      windows: { kind: 'slits', step: 2, phase: 1, sill: .4, head: .9, glass: '#1a1f26', frame: '#a2abb5', lit: .7, tints: ['cold'] },
      base: { kind: 'tiles', colour: '#3e4446', alt: '#474e50', height: 1.2 }, bays: { glass: .4, shutter: .3, blank: .3 }, shutter: '#6d737b',
      canopy: { colour: '#a2abb5', depth: 1.2, strip: 'red' }, roof: { ac: 3, vents: 3, tanks: 1, cables: false, parapet: '#7a8088' }, pipes: 1, pipeColour: '#7a8088', cornerNeon: null,
    };
    return { ...DISTRICT_LOOKS['north-frontage'](r, spec), recipe: 'south-frontage', lower: pick(r, ['#3e4a4c', '#40484f']) };
  },
  'velvet-row'(r, spec) {
    const club = spec.id === 'club';
    return {
      recipe: club ? 'club' : 'velvet-row', outer: club ? '#1a1b20' : pick(r, ['#25262e', '#2b2830', '#3a2a30']), lower: club ? '#1a1b20' : '#25262e', roofColour: '#24252a', floorH: range(r, 3, 3.4),
      windows: spec.tall ? { kind: 'capsule', step: 1, glass: '#121318', frame: '#6a5a60', lit: range(r, .25, .4), tints: ['pink', 'warm', 'cold', 'paleBlue', 'pink'] }
        : club ? null : { kind: 'slits', step: 2, phase: 1, sill: 1.4, head: 1.8, glass: '#121318', frame: '#6a5a60', lit: .6, tints: ['pink', 'pink', 'warm'] },
      upperBase: null,
      base: { kind: 'lacquer', colour: club ? '#1a1b20' : '#25262e', alt: club ? '#202127' : '#2c2d36', height: 3.6 },
      bays: club ? { blank: 1 } : { glass: .4, half: .3, blank: .3 }, shutter: '#3a2f33',
      neonFrames: club ? ['rose', 'velvetRed'] : r() < .5 ? ['rose'] : null,
      canopy: club ? { colour: '#2a1418', depth: 1.5, strip: 'rose' } : r() < .5 ? { colour: '#3a0f1c', depth: 1, strip: 'rose' } : null,
      roof: { ac: 2, vents: 2, tanks: 0, cables: true, parapet: '#2e2f35' },
      cornerNeon: club ? ['rose', 'velvetRed'] : r() < .7 ? [pick(r, ['rose', 'velvetRed', 'pink'])] : null,
      ac: spec.tall ? .2 : 0, acColour: '#5a5d63', pipes: 1, pipeColour: '#3a3b42',
      ledges: spec.tall ? { every: 9, depth: .25, colour: '#6a5a60', h: .15 } : null,
    };
  },
  flatiron(r, spec) {
    return {
      recipe: 'flatiron', outer: '#2a2e36', lower: '#5a5e67', roofColour: '#2a2c31', floorH: range(r, 3.6, 4),
      windows: { kind: 'curtain', step: 1, glass: pick(r, ['#1c2027', '#1a2233']), frame: '#4a525c', lit: range(r, .12, .25), tints: ['warm', 'cold', 'paleBlue', 'cold'], sheen: .25 },
      fins: { step: 1, depth: .16, w: .1, colour: '#6f767f' }, ledges: { every: 12, depth: .45, colour: '#7c838c', h: .22 },
      strips: r() < .5 ? { step: 4, colour: pick(r, ['lemon', 'blue']), glow: 1.6 } : null,
      base: { kind: 'stone', colour: '#5a5e67', alt: '#50555e', height: 3.6 }, bays: { glass: .6, shutter: .2, blank: .2 }, shutter: '#33363e',
      canopy: { colour: '#a2abb5', depth: 1.3, strip: 'lemon', glass: true }, cornerNeon: r() < .5 ? [pick(r, ['lemon', 'blue'])] : null, pipes: 0,
    };
  },
  metro(r, spec) {
    if (!spec.tall) return {
      recipe: 'metro-entrance', outer: '#3a3e44', lower: '#50555e', roofColour: '#3a3e44', floorH: 3.4, upperBase: null,
      base: { kind: 'tiles', colour: '#cfe0d4', alt: '#bccdc1', height: 1.6 }, bays: { glass: .3, blank: .7 },
      canopy: { colour: '#3a3e44', depth: 1.8, strip: 'coldWhite' }, roof: { ac: 1, vents: 3, tanks: 0, cables: false, parapet: '#4a4e55' }, pipes: 0, cornerNeon: null,
    };
    return {
      ...DISTRICT_LOOKS.flatiron(r, spec), recipe: 'body-mod', outer: '#2e2c33',
      windows: { kind: 'bands', step: 1, sill: .9, head: 2.6, glass: pick(r, ['#1c2027', '#20172a']), frame: '#50555e', lit: .22, tints: ['pink', 'cold', 'paleBlue'] },
      base: { kind: 'tiles', colour: '#50555e', alt: '#5a5f68', height: 1.6 }, cornerNeon: ['lime'],
    };
  },
  boulevard(r, spec) { return { recipe: 'bus', plain: true }; },
};

export function facadeLook(spec) {
  const r = rng(spec.seed ?? 1);
  if (spec.id === 'checkpoint-booth') return darkenLook({ recipe: 'booth', seed: spec.seed, outer: '#3a3e44', lower: '#2c3038', roofColour: '#3a3e44', booth: true });
  const make = DISTRICT_LOOKS[spec.district] || DISTRICT_LOOKS['north-frontage'];
  return darkenLook({ seed: spec.seed, ...make(r, spec) });
}

// A ring tower: a glass tone and pattern of its own (owner: blue, navy,
// steel grey, near-black; some concrete for contrast), a step plainer than
// the playable buildings at street level (sealed shutters, blank panels).
export const TOWER_STYLES = Object.freeze(['grid', 'bands', 'fins', 'punched', 'slits', 'checker']);
export function towerLook(s, index) {
  const seed = 5101 + index * 131, r = rng(seed + Math.round(s.x * 3) + Math.round(s.z * 7));
  const style = TOWER_STYLES[(index * 5 + Math.floor(r() * 3)) % TOWER_STYLES.length];
  const concrete = style === 'punched' || style === 'slits';
  const glassKey = pick(r, Object.keys(TOWER_GLASS));
  const glass = concrete ? '#14171c' : TOWER_GLASS[glassKey];
  const frame = concrete ? pick(r, ['#3a3c42', '#44464c', '#393631']) : pick(r, ['#23262d', '#2b2f38', '#3b414b', '#1b1d22']);
  const floorH = range(r, 3.3, 4);
  const kind = { grid: 'curtain', bands: 'bands', fins: 'curtain', punched: 'punched', slits: 'slits', checker: 'checker' }[style];
  return darkenLook({
    recipe: 'tower-' + style, seed, tower: true, outer: frame, lower: concrete ? '#303238' : '#2a2c31', floorH,
    windows: { kind, step: style === 'punched' ? 2 : 1, phase: Math.floor(r() * 2), sill: kind === 'bands' ? .8 : .9, head: kind === 'bands' ? 2.7 : 2.2, glass, frame: concrete ? '#55585f' : '#7c838c',
      lit: range(r, .05, .16), tints: pick(r, [['cold', 'cold', 'warm', 'paleBlue'], ['warm', 'warm', 'cold', 'pink'], ['cold', 'paleBlue', 'paleBlue', 'warm']]), litFloors: r() < .6 ? 1 + Math.floor(r() * 2) : 0,
      sheen: concrete ? 0 : .35, stains: concrete ? .35 : 0, stain: '#26272b', blank: style === 'checker' ? .5 : .06 },
    fins: style === 'fins' ? { step: pick(r, [1, 2]), depth: range(r, .35, .6), w: .14, colour: pick(r, ['#3b414b', '#7c838c', '#1b1d22']) }
      : style === 'grid' ? { step: 1, depth: .12, w: .08, colour: pick(r, ['#3b414b', '#5a5f68']) } : null,
    ledges: { every: pick(r, [10, 12, 15]), depth: range(r, .3, .7), colour: pick(r, ['#3b414b', '#2b2f38', '#55585f']), h: range(r, .2, .45) },
    strips: r() < .25 ? { step: pick(r, [4, 6]), colour: pick(r, ['coldWhite', 'blue', 'pink']), glow: 1.6 } : null,
    cornerNeon: r() < .3 ? [pick(r, ['pink', 'blue', 'green', 'lemon', 'coldWhite'])] : null,
    ledgeLight: r() < .55 ? pick(r, ['coldWhite', 'blue', 'pink', 'uptownBlue', 'coldWhite']) : null,
    ac: concrete ? .15 : 0, acColour: '#5a5e65', pipes: concrete ? 1 : 0, pipeColour: '#3e4248', pilasters: concrete ? pick(r, [4, 6]) : null,
    base: { kind: concrete ? 'panels' : 'stone', colour: concrete ? '#303238' : '#2a2c31', alt: '#33363c', seams: '#222428', height: 3.6 },
    bays: { shutter: .55, blank: .45 }, shutter: '#2c2f35', sealed: true,
  });
}

// ---------------------------------------------------------------------------
// The builder. `input`: { pieces, doors, signs, buildings, towers, roofs,
// spots } from the shells (city-shells.js collects them while it plans the
// walls). pieces: { owner, slot, floor, top, look, ax, az, ux, uz, from,
// len (the piece), edgeLen, ox, oz, cell, fixed, lintel, upper, stations,
// party, hidden, corners: [start, end] } (one per stretch of outer wall).
// Returns { cells: Map(key -> { fixed, rest, tiers: [, t1, t2, t3] }),
// owners: Map(owner -> { recipe, seed, parts }) }.
// opts.tiers [from, to]: which tiers to make (the shells make tier 0 at
// load and the detail tiers the first time a preset shows them: a Potato or
// Performance load never spends on them); opts.into: add to an earlier
// result. Every choice is seeded and made on every pass, only what is
// emitted differs, so the passes agree part for part.
let TIERS = [0, 3];
const wants = tier => tier >= TIERS[0] && tier <= TIERS[1];
export function buildFacades(input, opts = {}) {
  TIERS = opts.tiers || [0, 3];
  const cells = opts.into?.cells || new Map(), owners = opts.into?.owners || new Map();
  const cellOf = key => { let c = cells.get(key); if (!c) cells.set(key, c = { fixed: new PartSoup(), rest: new PartSoup(), tiers: [null, new PartSoup(), new PartSoup(), new PartSoup()] }); return c; };
  const own = (owner, look) => { let o = owners.get(owner); if (!o) owners.set(owner, o = { recipe: look.recipe, seed: look.seed, parts: 0, triangles: [0, 0, 0, 0] }); return o; };
  for (const piece of input.pieces) {
    const look = piece.look;
    own(piece.owner, look);
    if (look.plain || piece.party || piece.hidden) continue;
    const kit = new FaceKit(piece, cellOf(piece.cell), owners.get(piece.owner), input);
    if (look.booth) { dressBooth(kit); continue; }
    if (piece.fixed) dressFirstFloor(kit);
    if (piece.upper && piece.seen) dressUpper(kit);
  }
  for (const roof of input.roofs || []) {
    if (roof.look.plain || roof.look.booth) continue;
    own(roof.owner, roof.look);
    dressRoof(roof, cellOf(roof.cell), owners.get(roof.owner), input);
  }
  for (const d of input.doors || []) {
    const look = d.look;
    if (!look || look.plain || look.booth) continue;
    if (wants(0)) dressDoorway(d, cellOf(d.cell), owners.get(d.owner), input);
    if (!look.canopy) continue;
    dressCanopy(d, cellOf(d.cell), owners.get(d.owner), input);
  }
  if (wants(2)) for (const l of laundryLines(input.pieces)) dressLaundry(l, cellOf(l.cell), owners.get(l.owner));
  TIERS = [0, 3];
  return { cells, owners };
}

// Scratch corners (a quad copies them as it writes).
const CORNERS = Array.from({ length: 8 }, () => [0, 0, 0]);

// Emits the parts on one piece of outer wall, in its own frame: s metres
// along it from its start, y up, d out from its outer face.
class FaceKit {
  constructor(piece, cell, owner, input) {
    this.p = piece; this.cell = cell; this.owner = owner; this.look = piece.look;
    this.F = piece.floor; this.top = piece.top; this.L = piece.len; this.slot = piece.slot;
    const cols = piece.upper ? [0, ...piece.stations, piece.len] : [0, piece.len];
    this.cols = cols;
    this.normals = { out: [piece.ox, 0, piece.oz], up: [0, 1, 0], down: [0, -1, 0], along: [piece.ux, 0, piece.uz], back: [-piece.ux, 0, -piece.uz] };
    // Where doors and signs keep parts away (s ranges, up to a height).
    this.keep = []; this.doors = input.doors || []; this.flats = [];
    for (const d of input.doors || []) {
      if (Math.abs(d.ux * piece.uz - d.uz * piece.ux) > 1e-3) continue;
      const off = (d.x0 - piece.ax) * -piece.uz + (d.z0 - piece.az) * piece.ux; if (Math.abs(off) > .05) continue;
      const a = (d.x0 - piece.ax) * piece.ux + (d.z0 - piece.az) * piece.uz - piece.from, b = (d.x1 - piece.ax) * piece.ux + (d.z1 - piece.az) * piece.uz - piece.from;
      const lo = Math.min(a, b) - FACADES.doorClear, hi = Math.max(a, b) + FACADES.doorClear;
      if (hi > -.5 && lo < this.L + .5) this.keep.push({ s0: lo, s1: hi, y0: -1, y1: FACADES.doorTop, door: true });
    }
    for (const g of input.signs || []) {
      if (g.nx * piece.ox + g.nz * piece.oz < .9) continue;
      const fx = piece.ax + piece.ux * piece.from + piece.ox * FACADES.face, fz = piece.az + piece.uz * piece.from + piece.oz * FACADES.face;
      const out = (g.x - fx) * piece.ox + (g.z - fz) * piece.oz; if (out < -.3 || out > 1) continue;
      const s = (g.x - fx) * piece.ux + (g.z - fz) * piece.uz;
      if (s + g.hw < -.2 || s - g.hw > this.L + .2) continue;
      this.keep.push({ s0: s - g.hw, s1: s + g.hw, y0: g.y - g.hh, y1: g.y + g.hh });
    }
  }
  // Is a doorway (with its clearance) within r of world point (x, z)? (a
  // corner's pilaster wraps onto the other wall, whose doors are not ours)
  nearDoor(x, z, r) {
    for (const d of this.doors) {
      const len = Math.hypot(d.x1 - d.x0, d.z1 - d.z0) || 1, t = ((x - d.x0) * d.ux + (z - d.z0) * d.uz);
      const off = Math.abs((x - d.x0) * -d.uz + (z - d.z0) * d.ux);
      if (off < r + FACADES.face && t > -FACADES.doorClear - r && t < len + FACADES.doorClear + r) return true;
    }
    return false;
  }
  // Is [s0, s1] x [y0, y1] clear of doors and signs?
  clear(s0, s1, y0, y1) { for (const k of this.keep) if (s1 > k.s0 && s0 < k.s1 && y1 > k.y0 && y0 < k.y1) return false; return true; }
  onColumn(s) { for (const c of this.cols) if (Math.abs(c - s) < 1e-6) return true; return false; }
  // World point.
  P(s, y, d, out = [0, 0, 0]) { const p = this.p, t = p.from + s, k = FACADES.face + d; out[0] = p.ax + p.ux * t + p.ox * k; out[1] = y; out[2] = p.az + p.uz * t + p.oz * k; return out; }
  line(s) { const p = this.p, t = p.from + s; return [p.ax + p.ux * t, p.az + p.uz * t]; }
  // A part's anchor above its first floor (roles 1 and 3; world/city-cut.js
  // CUT.wall, rule 6): each vertex projected onto its wall's line moved
  // CUT.wall.back m in behind it, so the fragment shader reads the wall's
  // outward normal from it (a part on a wall goes with the wall's face).
  get wallOf() { const p = this.p, b = CUT.wall.back; return this.wallRef ||= { line: true, ax: p.ax - p.ox * b, az: p.az - p.oz * b, ux: p.ux, uz: p.uz }; }
  soup(tier, fixed) { return tier ? this.cell.tiers[tier] : fixed ? this.cell.fixed : this.cell.rest; }
  // Start and end a wash range round what is emitted into a soup.
  mark(soup) { return soup.count; }
  // (own: a lit part, its light its own: the facade wash stays off it. A lit
  // pane's pale colour took a lamp's or a screen's wash up to white, the
  // "very bright white panels" of the owner's shots, 2026-09-30.)
  close(soup, start, own = false) { if (soup.count > start) { if (!own) soup.ranges.push([start, soup.count, this.p.wash]); this.owner.parts++; } }

  // A flat panel facing out, `d` off the wall (colour at its foot and head:
  // a stain, a sky sheen). Split at the first floor's top.
  // (a face only glimpsed, by an upright phone's bottom edge: no detail tiers)
  skip(o) { const t = o.tier || 0; return !wants(t) || (t > 0 && !this.p.rich); }
  // The distance out for a flat panel s0..s1 x y0..y1 wanted at `d`: past
  // every earlier panel on this wall it overlaps within FACADES.stack of
  // that distance (the later one is meant on top), so no two share a plane.
  stack(s0, s1, y0, y1, d) {
    const e = FACADES.stack, flats = this.flats;
    for (let moved = true; moved;) {
      moved = false;
      for (const f of flats) if (s1 > f.s0 + 1e-3 && s0 < f.s1 - 1e-3 && y1 > f.y0 + 1e-3 && y0 < f.y1 - 1e-3 && Math.abs(f.d - d) < e - 1e-6) { d = f.d + e; moved = true; }
    }
    flats.push({ s0, s1, y0, y1, d });
    return d;
  }
  decal(s0, s1, y0, y1, col, o = {}) {
    if (s1 - s0 < .02 || y1 - y0 < .01 || this.skip(o)) return;
    // Laid over an earlier flat panel at the same distance: a step out
    // (tier 0 only: the load pass emits every tier-0 panel, so the steps
    // come out the same every load; the detail tiers keep their own d).
    if (!o.tier && !o.stacked) o = { ...o, d: this.stack(s0, s1, y0, y1, o.d ?? FACADES.proud), stacked: true };
    const F = this.F, colTop = o.colTop || col;
    if (y0 < F - 1e-6 && y1 > F + 1e-6) {
      const t = (F - y0) / (y1 - y0), mid = { r: col.r + (colTop.r - col.r) * t, g: col.g + (colTop.g - col.g) * t, b: col.b + (colTop.b - col.b) * t };
      this.decal(s0, s1, y0, F, col, { ...o, colTop: mid }); this.decal(s0, s1, F, y1, mid, { ...o, colTop }); return;
    }
    const upper = y0 >= F - 1e-6, tier = o.tier || 0, soup = this.soup(tier, !upper), d = o.d ?? FACADES.proud;
    let stamp = cutStamp(this.slot, 0), at = null;
    if (upper) {
      stamp = cutStamp(this.slot, this.onColumn(s0) && this.onColumn(s1) ? 1 : 3); at = this.wallOf;
    }
    const start = soup.count;
    const c = CORNERS;
    quad(soup, this.P(s0, y0, d, c[0]), this.P(s1, y0, d, c[1]), this.P(s1, y1, d, c[2]), this.P(s0, y1, d, c[3]), this.normals.out, col, colTop, stamp, at, o.glow);
    this.close(soup, start, !!o.glow);
  }
  // A box standing out of the wall: s0..s1 along, y0..y1 up, d0..d1 out.
  // faces: which to draw (front, top, bottom, ends; the back is against the
  // wall), each a colour or false. Split at the first floor's top; above it
  // role 3, read at `at` (its middle on the line, unless given).
  box(s0, s1, y0, y1, d0, d1, col, o = {}) {
    if (s1 - s0 < .005 || y1 - y0 < .005 || d1 - d0 < .002 || this.skip(o)) return;
    const F = this.F;
    if (y0 < F - 1e-6 && y1 > F + 1e-6) { this.box(s0, s1, y0, F, d0, d1, col, { ...o, top: false }); this.box(s0, s1, F, y1, d0, d1, col, { ...o, bottom: false }); return; }
    const upper = y0 >= F - 1e-6, tier = o.tier || 0, soup = this.soup(tier, !upper);
    const stamp = cutStamp(this.slot, upper ? 3 : 0), at = upper ? this.wallOf : null;
    const p = this.p, n = this.normals;
    const front = o.front ?? col, top = o.top ?? col, bottom = o.bottom ?? false, ends = o.ends ?? col;
    const g = o.glow, start = soup.count;
    // (the eight corners: s0/s1 x y0/y1 x d0/d1)
    const c = CORNERS, A = this.P(s0, y0, d0, c[0]), B = this.P(s1, y0, d0, c[1]), Cc = this.P(s1, y1, d0, c[2]), D = this.P(s0, y1, d0, c[3]);
    const E = this.P(s0, y0, d1, c[4]), F2 = this.P(s1, y0, d1, c[5]), G = this.P(s1, y1, d1, c[6]), H = this.P(s0, y1, d1, c[7]);
    if (front) quad(soup, E, F2, G, H, n.out, front, o.frontTop || front, stamp, at, o.frontGlow ?? g);
    if (top && y1 < 29.5) quad(soup, D, Cc, G, H, n.up, top, top, stamp, at, o.topGlow ?? g);
    if (bottom) quad(soup, A, B, F2, E, n.down, bottom, bottom, stamp, at, o.bottomGlow ?? g);
    if (ends) {
      quad(soup, A, E, H, D, n.back, ends, ends, stamp, at, o.endGlow ?? g);
      quad(soup, B, F2, G, Cc, n.along, ends, ends, stamp, at, o.endGlow ?? g);
    }
    this.close(soup, start);
  }
  // A vertical pipe (a six-sided prism, its hidden back left out) at s, r
  // round, its axis r + gap off the wall.
  pipe(s, r, y0, y1, col, o = {}) {
    const F = this.F; if (this.skip(o)) return;
    if (y0 < F - 1e-6 && y1 > F + 1e-6) { this.pipe(s, r, y0, F, col, o); this.pipe(s, r, F, y1, col, o); return; }
    const upper = y0 >= F - 1e-6, tier = o.tier || 0, soup = this.soup(tier, !upper), stamp = cutStamp(this.slot, upper ? 3 : 0), at = upper ? this.wallOf : null;
    const dc = r + (o.gap ?? .03), p = this.p, start = soup.count;
    for (let k = 0; k < 6; k++) {
      const a0 = (k - 1.5) * Math.PI / 3, a1 = a0 + Math.PI / 3, am = (a0 + a1) / 2;
      const nd = Math.sin(am), ns = Math.cos(am); if (nd < -.2) continue; // (against the wall)
      const n = [p.ux * ns + p.ox * nd, 0, p.uz * ns + p.oz * nd];
      quad(soup, this.P(s + r * Math.cos(a0), y0, dc + r * Math.sin(a0)), this.P(s + r * Math.cos(a1), y0, dc + r * Math.sin(a1)), this.P(s + r * Math.cos(a1), y1, dc + r * Math.sin(a1)), this.P(s + r * Math.cos(a0), y1, dc + r * Math.sin(a0)), n, col, col, stamp, at, null);
    }
    this.close(soup, start);
  }
  // A slanted bar (a fire escape's stair): from (sa, ya) to (sb, yb), d0..d1
  // out, `thick` deep. Role 3 (above the first floor only).
  stair(sa, ya, sb, yb, d0, d1, thick, col, o = {}) {
    if (this.skip(o)) return;
    const soup = this.soup(o.tier || 0, false), stamp = cutStamp(this.slot, 3), at = this.wallOf, start = soup.count;
    const A = [this.P(sa, ya, d0), this.P(sb, yb, d0), this.P(sb, yb, d1), this.P(sa, ya, d1)];
    solid(soup, A, A.map(p => [p[0], p[1] - thick, p[2]]), col, stamp, at);
    this.close(soup, start);
  }
}

// A six-faced solid from its top corners A (four, in order round) and its
// bottom corners B (under them): each face wound to face away from its middle.
function solid(soup, A, B, col, stamp, at) {
  const mid = [0, 1, 2].map(i => (A.reduce((n, p) => n + p[i], 0) + B.reduce((n, p) => n + p[i], 0)) / 8);
  const faces = [[A[0], A[1], A[2], A[3]], [B[0], B[1], B[2], B[3]]];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; faces.push([B[i], B[j], A[j], A[i]]); }
  for (const [a, b, c, d] of faces) {
    let n = norm(cross(sub(b, a), sub(d, a)));
    const fc = [0, 1, 2].map(i => (a[i] + b[i] + c[i] + d[i]) / 4);
    if ((fc[0] - mid[0]) * n[0] + (fc[1] - mid[1]) * n[1] + (fc[2] - mid[2]) * n[2] < 0) n = n.map(v => -v);
    quad(soup, a, b, c, d, n, col, col, stamp, at, null);
  }
}

// ---------------------------------------------------------------------------
// The first floor (0 to 3.6 m; never cut): cladding, then bays of shutters,
// rolling doors, shop glass, slits and blank panels between the doors, then
// pilasters, pipes, hazard stripes, neon frames and sign boxes. Doorways
// keep FACADES.doorClear clear either side up to their top.
function dressFirstFloor(k) {
  const look = k.look, p = k.p, L = k.L, F = k.F, r = rng(hash(p.ax + p.from, p.az, look.seed || 1));
  const y0 = p.lintel ? FACADES.doorTop : 0, lower = look.base || { kind: 'plain', colour: look.lower || '#3e4a4c', height: F };
  const baseH = Math.min(F, lower.height ?? F);
  // Cladding (flat panels; its tone steps give the joints).
  // (flat, every preset: skipped on a detail pass, which makes only tiers 1-3)
  const clad = (from, to, ya, yb) => {
    if (yb - ya < .05 || !wants(0)) return;
    const kind = lower.kind;
    if (kind === 'tiles') {
      const w = .9, h = .45;
      for (let s = from; s < to - .01; s += w) for (let y = ya; y < yb - .01; y += h) {
        const t = hash(p.ax + p.ux * (p.from + s), p.az + p.uz * (p.from + s), y, 7), hex = t < .3 ? (lower.alt || lower.colour) : lower.colour;
        k.decal(s + .01, Math.min(to, s + w) - .01, y + .01, Math.min(yb, y + h) - .01, tone(hex, .9 + t * .2));
      }
    } else if (kind === 'stone' || kind === 'lacquer') {
      const w = kind === 'stone' ? 1.2 : .9, h = kind === 'stone' ? .9 : F;
      for (let s = from; s < to - .01; s += w) for (let y = ya; y < yb - .01; y += h) {
        const t = hash(p.ax + p.ux * (p.from + s), p.az + p.uz * (p.from + s), y, 11), hex = t < .4 ? (lower.alt || lower.colour) : lower.colour;
        k.decal(s + .015, Math.min(to, s + w) - .015, y + .015, Math.min(yb, y + h) - .015, tone(hex, .94 + t * .12), { colTop: tone(hex, kind === 'lacquer' ? 1.35 : 1.05) });
      }
    } else if (kind === 'panels') {
      const w = range(r, 1.4, 2.2);
      for (let s = from; s < to - .01; s += w) {
        const t = hash(p.ax + p.ux * (p.from + s), p.az + p.uz * (p.from + s), 3), base = tone(lower.colour, .92 + t * .16);
        k.decal(s + .03, Math.min(to, s + w) - .03, ya + .03, yb - .03, base, { colTop: tone(lower.colour, t < .5 ? .85 : 1.06) });
      }
    } else if (kind === 'ribbed' || kind === 'corrugated') {
      // (the ribs as lit stripes on the darker sheet: from 29 m up a rib is a stripe)
      const pitch = .3, rib = C(lower.rib || lower.colour), dark = tone(lower.colour, .82);
      k.decal(from, to, ya, yb, dark, { colTop: tone(lower.colour, .95) });
      for (let s = from + pitch / 2; s + .06 <= to; s += pitch) k.decal(s - .06, s + .06, ya, yb, rib, { d: .03, colTop: tone(lower.rib || lower.colour, 1.12) });
    }
  };
  // The pieces of this wall clear of doors: bays.
  const free = freeOf(k);
  if (!p.seen) return; // (a face no camera can see: nothing to spend on it)
  if (p.lintel) {
    if (baseH > y0 + .05) clad(0, L, y0, baseH);
    k.decal(0, L, Math.max(y0, baseH), F, tone(look.lower || lower.colour, 1), { colTop: tone(look.lower || lower.colour, .85) });
    return;
  }
  // Upper band (over the bays): the base's colour up to the floor's top.
  for (const [a, b] of free) {
    if (b - a < .2) continue;
    clad(a, b, 0, baseH);
    if (baseH < F - .05) k.decal(a, b, baseH, F, tone(look.lower || lower.colour, 1), { colTop: tone(look.lower || lower.colour, .85) });
    // Bays of 1.6 to 3.4 m.
    let at = a + .1;
    while (b - at > 1.3) {
      const w = Math.min(b - at - .1, range(r, 1.6, look.bays?.rolling ? 3.4 : 2.8));
      if (w < 1.2) break;
      bay(k, at, at + w, r);
      at += w + range(r, .3, .9);
    }
  }
  // Pilasters at the convex corners, and up the storeys (Balanced up).
  const pil = look.pilaster || look.lower || lower.colour;
  // (a square corner: the pilaster wraps it, round the other wall's face,
  // and fills the notch the two walls' boxes leave there)
  for (const end of [0, 1]) {
    if (!p.corners[end] || L < 1) continue;
    const [cx, , cz] = k.P(end ? L : 0, 0, 0), wrap = p.square?.[end] && !k.nearDoor(cx, cz, .45) ? FACADES.face + .1 : 0;
    const sa = end ? L - .32 : -wrap, sb = end ? L + wrap : .32, d0 = wrap ? -FACADES.face : 0;
    if (k.clear(sa, sb, 0, 2.5)) k.box(sa, sb, 0, F, d0, .1, tone(pil, .9), { frontTop: tone(pil, 1.1), top: p.upper ? false : tone(pil, 1) });
    if (p.upper) k.box(sa, sb, F, Math.min(p.top - FACADES.topMargin, FACADES.detailTop), d0, .1, tone(look.outer || pil, .8), { tier: 1, top: false });
  }
  // Pipes up the wall (from the ground; over a doorway's clearance they start above it).
  for (let i = 0; i < (look.pipes || 0); i++) {
    if (r() > .45 || L < 2.5) continue;
    const sp = range(r, .5, L - .5), rr = range(r, .05, .09), from = k.clear(sp - rr - .05, sp + rr + .05, 0, 2.5) ? 0 : FACADES.doorTop + .1;
    const to = p.upper && p.rich ? Math.min(p.top - FACADES.topMargin, range(r, 8, FACADES.detailTop)) : F - .1;
    if (!k.clear(sp - rr, sp + rr, from, Math.min(to, F))) continue;
    k.pipe(sp, rr, from, Math.min(to, F), tone(look.pipeColour || '#4a4e55', range(r, .85, 1.1)), { tier: 1 });
    if (to > F) k.pipe(sp, rr, F, to, tone(look.pipeColour || '#4a4e55', .9), { tier: 1 });
  }
  // Cable bundles along the wall under the first floor's top, sagging
  // between hooks (Quality): two or three dark lines, in steps.
  if (look.cables && p.rich && L > 2.5) {
    const n = 2 + (r() < .4 ? 1 : 0), y = F - range(r, .25, .45), hooks = Math.max(1, Math.round(L / 3));
    for (let c = 0; c < n; c++) for (let h = 0; h < hooks; h++) {
      const a = h * L / hooks, b = (h + 1) * L / hooks, w = (b - a) / 3, yc = y - c * .06, d0 = .03 + c * .035, col = tone(c === 1 ? '#2a2a2e' : '#1d1e22', 1);
      for (let q = 0; q < 3; q++) k.box(a + q * w, a + (q + 1) * w, yc - .035 - (q === 1 ? .1 : .05), yc - (q === 1 ? .1 : .05), d0, d0 + .03, col, { ends: false, tier: 2 });
    }
  }
  // Hazard stripes (the garage and the charging lot): lemon on graphite along the foot.
  if (look.hazard && wants(0)) for (const [a, b] of free) {
    if (b - a < .6) continue;
    for (let s2 = a + .05; s2 < b - .3; s2 += .5) k.decal(s2, s2 + .25, 0, .45, lit(FACADE_NEON.lemon, .55), { d: lower.kind === 'ribbed' ? .055 : .035, tier: 0 });
  }
  // Neon frames (Velvet Row): a lit tube round a panel.
  if (look.neonFrames && p.rich && free.length) {
    const [a, b] = free.reduce((m, f) => f[1] - f[0] > m[1] - m[0] ? f : m);
    if (b - a > 2.2) {
      const hex = FACADE_NEON[pick(r, look.neonFrames)], g = lit(hex, 1.6), c = lit(hex, .5), sa = a + .4, sb = b - .4, ya = 2.65, yb = 3.35;
      if (k.clear(sa, sb, ya, yb)) {
        for (const [q0, q1, v0, v1] of [[sa, sb, ya, ya + .05], [sa, sb, yb - .05, yb], [sa, sa + .05, ya, yb], [sb - .05, sb, ya, yb]]) k.box(q0, q1, v0, v1, .03, .08, c, { glow: g });
      }
    }
  }
  // Blade sign boxes (the Boulevard's shops): out from the wall over 3 m, their faces lit.
  if (look.signBoxes && p.rich && L > 3 && r() < look.signBoxes) {
    const sp = range(r, 1, L - 1), hex = FACADE_NEON[pick(r, ['pink', 'warmWhite', 'lemon', 'blue', 'green', 'red'])];
    const yTop = Math.min(p.top - FACADES.topMargin, F + range(r, .6, 1.8));
    if (yTop > 3.4 && k.clear(sp - .5, sp + .5, 3, yTop)) {
      k.box(sp - .02, sp + .02, 3.1, yTop - .2, 0, .15, tone('#2b2e36', 1), { tier: 0 }); // (its bracket)
      k.box(sp - .08, sp + .08, 3.05, yTop, .15, .95, tone('#1c1e24', 1), { ends: lit(hex, NIGHT.signBox), endGlow: shine(NIGHT.signBoxGlow), tier: 0 });
    }
  }
}

// One bay of a first floor: its recipe's mix of shutters (down, half, up),
// rolling doors, shop glass, lit slits and blank panels. Under 3 m nothing
// stands more than .6 m out.
function bay(k, a, b, r) {
  const look = k.look, F = k.F, bays = look.bays || { blank: 1 };
  if (!k.clear(a, b, 0, 3.4)) return;
  const roll = Object.entries(bays), total = roll.reduce((n, [, w]) => n + w, 0);
  let t = r() * total, kind = 'blank';
  for (const [name, w] of roll) { if ((t -= w) <= 0) { kind = name; break; } }
  const w = b - a, dark = C('#101216'), glassHex = look.windows?.glass || '#14171d';
  if (kind === 'shutter' || kind === 'half') {
    // A shutter box over the opening, the curtain down (or half down) in slats.
    const sh = look.shutter || '#33363e', openTop = 2.6, half = kind === 'half' ? range(r, .9, 1.5) : 0;
    const state = kind === 'shutter' && r() < .2 ? 'up' : kind;
    k.box(a - .05, b + .05, openTop, openTop + .32, 0, .2, tone(sh, .85), { bottom: tone(sh, .6) });
    if (state === 'up') { k.decal(a, b, .02, openTop, tone(glassHex, 1), { colTop: tone(glassHex, 1.4), d: .01 }); return; }
    if (half) k.decal(a, b, .02, half, dark, { d: .01 });
    const from = half || .02;
    if (wants(0)) for (let y = from, i = 0; y < openTop - .02; y += .26, i++) k.decal(a, b, y, Math.min(openTop, y + .26), tone(sh, i % 2 ? .82 : 1.02 + hash(a, y) * .08), { d: .05 });
    k.box(a, b, from - .04, from, .02, .08, tone(sh, .6)); // (its bottom bar)
  } else if (kind === 'rolling') {
    // A rolling door on a garage bay that is not a doorway: ribbed, framed, hazard-striped jambs.
    const rd = look.rolling || '#4e5a66', h = Math.min(3.3, F - .2);
    if (wants(0)) for (let y = .02, i = 0; y < h - .02; y += .3, i++) k.decal(a + .12, b - .12, y, Math.min(h, y + .3), tone(rd, i % 2 ? .85 : 1 + hash(b, y) * .08), { d: .04 });
    k.box(a, a + .12, 0, h + .1, 0, .12, tone('#2c2f36', 1));
    k.box(b - .12, b, 0, h + .1, 0, .12, tone('#2c2f36', 1));
    k.box(a, b, h, h + .12, 0, .16, tone('#3a3d44', 1));
    for (let y = .1; y < 1.2; y += .3) { k.decal(a + .02, a + .1, y, y + .15, lit(FACADE_NEON.lemon, .55), { d: .125 }); k.decal(b - .1, b - .02, y, y + .15, lit(FACADE_NEON.lemon, .55), { d: .125 }); }
  } else if (kind === 'glass') {
    // A shop window: dark glass, its steel frame, a lit strip (some) inside.
    const frame = look.windows?.frame || '#a2abb5', y0 = .5, y1 = 2.6, lamp = r() < .45;
    k.decal(a + .06, b - .06, y0, y1, tone(glassHex, 1), { colTop: tone(glassHex, 1.6) });
    if (lamp) k.decal(a + .12, b - .12, y1 - .22, y1 - .12, lit(WINDOW_LIGHT[pick(r, ['warm', 'cold', 'warm'])], NIGHT.slit), { d: .03, glow: shine(NIGHT.slitGlow) });
    k.box(a, b, y0 - .06, y0, 0, .1, tone(frame, .9), { tier: 1 });
    k.box(a, b, y1, y1 + .06, 0, .06, tone(frame, .9), { tier: 1, bottom: false });
    k.box(a, a + .06, y0, y1, 0, .06, tone(frame, .8), { tier: 1, top: false });
    k.box(b - .06, b, y0, y1, 0, .06, tone(frame, .8), { tier: 1, top: false });
  } else if (kind === 'slit') {
    const tint = WINDOW_LIGHT[pick(r, look.windows?.tints || ['warm'])], y = range(r, 2.15, 2.45);
    k.decal(a + .2, b - .2, y, y + .14, lit(tint, NIGHT.slit), { glow: shine(NIGHT.slitGlow) });
    k.box(a + .15, b - .15, y - .05, y, 0, .06, tone('#3a3d44', 1), { tier: 1 });
  } else {
    // Blank: a service panel, a vent grille or a poster block (colour only).
    const q = r();
    if (q < .4) k.decal(a + .2, Math.min(b - .2, a + .9), .9, 1.7, tone('#2a2c31', 1), { d: .03 });
    else if (q < .6) { const c = pick(r, ['#5a4a6a', '#3d5a6a', '#6a4a3d', '#4a6a4d']); k.decal(a + .3, Math.min(b - .3, a + 1), 1.1, 2, tone(c, .9), { d: .025 }); }
  }
  // An AC unit over some bays (Balanced up), under 3.4 m, .45 m deep.
  if (look.ac && r() < look.ac * .6) { const m = (a + b) / 2; if (k.clear(m - .4, m + .4, 2.75, 3.4)) acUnit(k, m, 2.8, look.acColour || '#6a6e75', 1); }
}

// An AC unit on a wall: a box, its fan's dark face (Quality up), a bracket.
function acUnit(k, m, y, hex, tier) {
  k.box(m - .36, m + .36, y, y + .5, .02, .44, tone(hex, .95), { tier, frontTop: tone(hex, 1.1), bottom: tone(hex, .5) });
  k.decal(m - .26, m + .06, y + .08, y + .42, tone('#1d1f23', 1), { d: .45, tier: Math.max(tier, 2) });
  k.box(m - .3, m + .3, y - .06, y, 0, .3, tone('#2b2d31', 1), { tier: Math.max(tier, 2), top: false });
}

// ---------------------------------------------------------------------------
// The storeys: the window pattern (flat, role 1, squashed with the wall) on
// every preset up to FACADES.patternTop (on to the top from Quality), then
// the depth: ledges, fins, light inlays, sills, AC units, balconies, fire
// escapes, window frames, corner neon (their tiers).
function dressUpper(k) {
  const look = k.look, p = k.p, F = k.F, top = p.top, cols = k.cols, win = look.windows;
  const limit = top - FACADES.topMargin, fh = look.floorH || 3.4;
  const r = rng(hash(p.ax + p.from, p.az, (look.seed || 1) + 3));
  // A column's lattice index along the wall (the same for every piece on one line).
  const colIndex = (s0, s1) => { const [x, z] = k.line((s0 + s1) / 2); return Math.floor((Math.abs(p.ux) >= Math.abs(p.uz) ? x : z) / FACADES.column); };
  // Low buildings: ribs (corrugated or ribbed metal) and a parapet.
  if (!look.tower && top - F < 6) {
    if (look.upperBase && wants(0)) {
      const pitch = .3, rib = C(look.ribColour || look.outer);
      // (the ribs a step under `proud`: the windows over them stay at it, clear of Extreme's blinds)
      for (let s = pitch / 2; s < k.L - .05; s += pitch) k.decal(s - .06, s + .06, F, limit + .6, rib, { colTop: tone(look.ribColour || look.outer, 1.15), d: FACADES.proud - FACADES.stack });
    }
    if (look.roof?.parapet && wants(0)) for (let i = 0; i + 1 < cols.length; i++) {
      const s0 = cols[i], s1 = cols[i + 1];
      k.box(s0, s1, top, top + .45, -FACADES.face * 2, .04, tone(look.roof.parapet, 1), { ends: false, top: tone(look.roof.parapet, 1.15) });
    }
    if (win && top - F > 2) windowRows(k, F + .3, Math.min(limit, F + fh), fh, colIndex, r, 0, 0);
    cornerNeon(k, r, limit);
    return;
  }
  // Tall: the pattern.
  if (win) {
    windowRows(k, F, Math.min(limit, FACADES.patternTop), fh, colIndex, r, 0, 0);
  }
  const dTop = Math.min(limit, FACADES.detailTop);
  // Setback ledges every 10 to 15 m (a band round the tower, a column at a time).
  if (look.ledges) {
    const L = look.ledges;
    // (Quality lights some ledges' edges from under, Extreme more: a line of
    // light round the tower, the signs' colours)
    const lamp = look.ledgeLight ? FACADE_NEON[look.ledgeLight] : null, lampTier = hash(look.seed || 1, 77) < .45 ? 2 : 3;
    for (let y = F + L.every, n = 0; y < dTop - .5; y += L.every, n++) for (let i = 0; i + 1 < cols.length; i++) {
      const s0 = cols[i], s1 = cols[i + 1];
      if (!k.clear(s0, s1, y - L.h - .1, y)) continue;
      k.box(s0, s1, y - L.h, y, 0, L.depth, tone(L.colour, .95), { top: tone(L.colour, 1.2), ends: i === 0 || i === cols.length - 2 ? tone(L.colour, .8) : false, tier: look.tower || look.recipe === 'uptown' ? 0 : 1 });
      if (lamp && (n + (look.seed || 0)) % 2 === 0) k.box(s0, s1, y - L.h - .05, y - L.h, L.depth - .08, L.depth - .02, lit(lamp, .5), { glow: shine(1.8), top: false, ends: false, tier: lampTier });
    }
  }
  // Fins on the column breaks (read there exactly), light inlays on some.
  if (look.fins || look.strips) for (let i = 1; i + 1 < cols.length; i++) {
    const s = cols[i], idx = colIndex(s - .01, s + .01);
    if (!k.clear(s - .1, s + .1, F, dTop)) continue; // (a fin or a light line through a sign: none there)
    if (look.fins && mod(idx, look.fins.step) === 0) {
      const f = look.fins, top2 = dTop;
      k.box(s - f.w / 2, s + f.w / 2, F + .1, top2, 0, f.depth, tone(f.colour, .9), { frontTop: tone(f.colour, 1.15), ends: tone(f.colour, .7), tier: look.tower || look.recipe === 'uptown' || look.recipe === 'flatiron' ? 0 : 1 });
    } else if (look.strips && mod(idx, look.strips.step) === 0) {
      const hex = FACADE_NEON[look.strips.colour];
      k.box(s - .04, s + .04, F + .2, dTop, 0, .03, lit(hex, .5), { glow: shine(look.strips.glow * NIGHT.strip), top: false });
    }
  }
  // Solid walls: pilasters up the face every few columns (Balanced up), the
  // tower's frame read from the street.
  if (look.pilasters && k.L > 4) for (let i = 1; i + 1 < cols.length; i++) {
    const s = cols[i], idx = colIndex(s - .01, s + .01);
    if (mod(idx, look.pilasters) || !k.clear(s - .2, s + .2, F, dTop)) continue;
    k.box(s - .17, s + .17, F, dTop, 0, .12, tone(look.outer, .88), { frontTop: tone(look.outer, 1.08), ends: tone(look.outer, .7), tier: 1 });
  }
  // Pilasters at the corners happen with the first floor (dressFirstFloor); corner neon here.
  cornerNeon(k, r, dTop);
  // The Stacks: a fire escape on the widest visible stretch.
  if (look.fireEscape && k.L > 5 && r() < .7) fireEscape(k, r, dTop, fh);
}

// Window rows from y0 to y1 (floors fh apart), by the look's kind, at
// `tier`; the depth (sills, AC units, balconies, frames) on the floors under
// FACADES.detailTop.
function windowRows(k, y0, y1, fh, colIndex, r, tier, floor0) {
  const look = k.look, win = look.windows, p = k.p, cols = k.cols;
  const tints = (win.tints || ['warm']).map(t => WINDOW_LIGHT[t] || t);
  const glass = win.glass, frame = win.frame || '#55585f';
  // Floors lit in bands (a few whole floors on, as offices at night).
  const bandFloors = new Set(); for (let i = 0; i < (win.litFloors || 0); i++) bandFloors.add(2 + Math.floor(hash(look.seed || 1, i, 5) * 7));
  const kind0 = win.kind;
  for (let f = floor0, y = y0; y + .8 < y1; f++, y += fh) {
    const yTop = Math.min(y1, y + fh), depthOK = y + fh < FACADES.detailTop && tier === 0;
    // A spandrel band at each floor line on the solid walls (a tone step, flush,
    // whole columns: squashed with its wall), every preset.
    if (win.spandrel !== false && kind0 !== 'curtain' && kind0 !== 'capsule' && f > floor0 && wants(tier)) {
      const band = tone(win.spandrelColour || look.outer, .78);
      for (let i = 0; i + 1 < cols.length; i++) if (k.clear(cols[i], cols[i + 1], y - .12, y + .12)) k.decal(cols[i], cols[i + 1], y - .12, y + .1, band, { colTop: tone(win.spandrelColour || look.outer, .95), tier, d: .015 });
    }
    for (let i = 0; i + 1 < cols.length; i++) {
      const s0 = cols[i], s1 = cols[i + 1], w = s1 - s0, idx = colIndex(s0, s1);
      const h = hash(idx, f, look.seed || 1, p.ox * 3 + p.oz * 7), h2 = hash(idx, f, (look.seed || 1) + 1);
      const [cx, cz] = k.line((s0 + s1) / 2);
      const band = !(h2 < win.lit) && bandFloors.has(f) && h2 < .75, isLit = h2 < win.lit || band;
      const tint = tints[Math.floor(hash(idx, f, 9, look.seed || 1) * tints.length) % tints.length];
      const glow = isLit ? shine(band ? NIGHT.band : NIGHT.glowBase + NIGHT.glowSpread * h * h) : null;
      const pane = isLit ? lit(tint, NIGHT.pane) : tone(glass, .85 + h * .3);
      const sheen = win.sheen ? (isLit ? pane : tone(glass, 1.25 + win.sheen * 2)) : pane;
      const kind = win.kind;
      let a = 0, b = 0;
      if (kind === 'curtain') {
        if (w < .3) continue;
        a = y + .12; b = yTop;
      } else if (kind === 'checker') {
        if (mod(idx + f, 2) && h > .3) { k.decal(s0, s1, y + .1, yTop - .1, tone(look.outer, .82 + h * .2), { tier }); continue; }
        a = y + .15; b = yTop - .15;
      } else if (kind === 'bands' || kind === 'ribbon') {
        if (w < .3) continue;
        a = y + win.sill; b = Math.min(yTop - .1, y + win.head);
      } else if (kind === 'punched' || kind === 'pairs') {
        const every = win.step || 2, on = kind === 'pairs' ? mod(idx + (win.phase || 0), 3) !== 2 : mod(idx + (win.phase || 0), every) === 0;
        if (!on || w < .9) { if (win.stains && h < win.stains * .4 && w > .5) k.decal(s0, s1, y + .1, yTop - .1, tone(win.stain || look.outer, 1), { colTop: tone(look.outer, 1), tier }); continue; }
        a = y + win.sill; b = Math.min(yTop - .1, y + win.head);
      } else if (kind === 'slits') {
        if (w < .9 || mod(idx + (win.phase || 0), win.step || 2)) continue;
        a = y + (win.sill ?? 1.5); b = Math.min(yTop - .1, y + (win.head ?? 1.8));
      } else if (kind === 'capsule') {
        if (w < .9) continue;
        // Two rows of pods a floor, each lit on its own.
        for (const [pa, pb, salt] of [[y + .25, y + fh / 2 - .1, 0], [y + fh / 2 + .1, yTop - .2, 1]]) {
          const on = hash(idx, f, salt, look.seed || 1) < win.lit, t2 = tints[Math.floor(hash(idx, f, salt, 3) * tints.length) % tints.length];
          const hp = hash(idx, f, salt, 17);
          k.decal(s0, s1, pa, pb, on ? lit(t2, NIGHT.pane) : tone(glass, .9 + hash(idx, f, salt) * .3), { glow: on ? shine(NIGHT.glowBase + NIGHT.glowSpread * hp * hp) : null, tier });
          if (depthOK && tier === 0) k.box(s0 + .05, s1 - .05, pa - .07, pa, 0, .12, tone(frame, .8), { tier: 2, ends: false });
        }
        continue;
      }
      if (b - a < .15) continue;
      if (!k.clear(s0, s1, a, b)) continue;
      if (win.boarded && h > 1 - win.boarded && !isLit) { k.decal(s0, s1, a, b, tone(look.rust || '#5a4a38', .7 + h * .3), { tier }); continue; }
      k.decal(s0, s1, a, b, pane, { colTop: sheen, glow, tier });
      if (win.stains && !isLit && h < win.stains && a - y > .4) k.decal(s0, s1, y + .05, a, tone(win.stain || look.outer, 1), { colTop: tone(look.outer, 1), tier });
      if (!depthOK) continue;
      // Depth, from Balanced: a sill; Quality: the head; AC units, balconies.
      if (kind === 'punched' || kind === 'pairs' || kind === 'slits' || kind === 'bands' || kind === 'ribbon') {
        k.box(s0 + (kind === 'bands' || kind === 'ribbon' ? 0 : .06), s1 - (kind === 'bands' || kind === 'ribbon' ? 0 : .06), a - .07, a, 0, .12, tone(frame, .75), { tier: 1, frontTop: tone(frame, .95), ends: false });
        if (kind !== 'bands' && kind !== 'ribbon') k.box(s0 + .06, s1 - .06, b, b + .08, 0, .07, tone(frame, .65), { tier: 2, ends: false });
      }
      if (kind === 'curtain' && hash(idx, f, 21) < .5) k.box(s0, s1, y + .02, y + .12, 0, .06, tone(frame, .6), { tier: 2, ends: false, bottom: false });
      if (look.ac && h2 > 1 - look.ac && w > 1 && a - y > .6 && k.clear(s0, s1, a - .6, a)) acUnit(k, (s0 + s1) / 2, a - .62, look.acColour || '#6a6e75', 1);
      else if (look.balconies && h > 1 - look.balconies && w > 1.2 && f > 0 && k.clear(s0 - .1, s1 + .1, y - .1, y + 1)) balcony(k, s0, s1, y, look);
      // Extreme: blinds and a silhouette in lit windows (depth behind the glass).
      if (isLit && w > .8) k.decal(s0 + w * (.15 + h * .3), s0 + w * (.45 + h * .3), a + .05, a + (b - a) * (.4 + h * .4), tone(tint, .18), { d: .025, glow: shine(.35), tier: 3 });
      else if (!isLit && h > .7) k.decal(s0, s1, a + (b - a) * .55, b, tone(frame, .55), { d: .025, tier: 3 });
    }
  }
}

// A shallow balcony: a slab and a rail (Balanced), its posts (Quality).
function balcony(k, s0, s1, y, look) {
  const rail = C(look.windows?.frame || '#5a4032'), slab = tone(look.outer, .8);
  k.box(s0 - .1, s1 + .1, y - .1, y + .02, 0, .85, slab, { tier: 1, bottom: tone(look.outer, .5), top: tone(look.outer, 1.05) });
  k.box(s0 - .1, s1 + .1, y + .95, y + 1.0, .8, .85, rail, { tier: 1 });
  for (const s of [s0 - .08, (s0 + s1) / 2, s1 + .06]) k.box(s, s + .04, y + .02, y + .95, .8, .84, rail, { tier: 2, top: false });
}

// A fire escape (the Stacks): a landing a floor, rails, stairs between.
function fireEscape(k, r, dTop, fh) {
  const cols = k.cols, look = k.look, F = k.F;
  const wide = []; for (let i = 0; i + 2 < cols.length; i++) if (cols[i + 2] - cols[i] > 2.8) wide.push(i);
  if (!wide.length) return;
  const i = pick(r, wide), s0 = cols[i], s1 = cols[i + 2], iron = C('#2b2d31'), rust = C(look.rust || '#5e3d30');
  if (!k.clear(s0, s1, F, dTop)) return;
  for (let y = F + fh, n = 0; y < dTop - .5; y += fh, n++) {
    k.box(s0, s1, y - .08, y, 0, .9, n % 3 === 1 ? rust : iron, { tier: 1, bottom: C('#1d1e22') });
    k.box(s0, s1, y + .9, y + .95, .86, .9, iron, { tier: 1 });
    for (let s = s0; s < s1; s += .5) k.box(s, s + .03, y, y + .9, .86, .89, iron, { tier: 2, top: false });
    // The stair to the next landing, zig-zagging.
    if (y + fh < dTop - .5) { const flip = n % 2; k.stair(flip ? s1 - .2 : s0 + .2, y + .02, flip ? s0 + 1.3 : s1 - 1.3, y + fh - .1, .15, .75, .08, iron, { tier: 1 }); }
  }
}

// Vertical neon at a building's corners (a few, the signs' colours).
function cornerNeon(k, r, top) {
  const look = k.look, p = k.p;
  if (!look.cornerNeon) return;
  for (const [end, s] of [[0, .07], [1, k.L - .07]]) {
    if (!p.corners[end] || hash(p.ax + p.from + end * k.L, p.az, look.seed || 1, 31) > .55) continue;
    const hex = FACADE_NEON[pick(r, look.cornerNeon)], y1 = Math.min(top, k.F + range(r, 6, 16));
    if (y1 < k.F + 1 || !k.clear(s - .05, s + .05, k.F, y1)) continue;
    // (out to .135: the corner pilaster's face is at .1 and the storeys' at .12, and a tube flush
    // with one flickered through it as the camera moved)
    k.box(s - .045, s + .045, k.F + .2, y1, .02, .135, lit(hex, .55), { glow: shine(2) });
  }
}

// The checkpoint booth: a glass booth in a steel frame.
function dressBooth(k) {
  const p = k.p, L = k.L, F = k.F, steel = C('#a2abb5'), glass = tone('#1c2530', 1), sheen = tone('#3a4a5c', 1);
  if (!p.fixed) return;
  if (p.lintel) { k.box(0, L, FACADES.doorTop, F, 0, .06, steel, { bottom: tone('#a2abb5', .6) }); return; }
  k.box(0, L, F - .25, F, 0, .08, steel, { bottom: tone('#a2abb5', .6) });
  for (const [a, b] of freeOf(k)) {
    if (b - a < .3) continue;
    k.decal(a + .06, b - .06, .9, F - .25, glass, { colTop: sheen });
    k.decal(a, b, 0, .9, tone('#2c3038', 1));
    k.box(a, b, .86, .94, 0, .06, steel);
    for (const s of [a, b - .1]) k.box(s, s + .1, 0, F - .25, 0, .08, steel, { top: false });
  }
}
// The stretches of a wall piece clear of its doorways' clearance.
function freeOf(k) {
  const free = [], keeps = k.keep.filter(q => q.door).sort((a, b) => a.s0 - b.s0);
  let s = 0;
  for (const q of keeps) { if (q.s0 > s) free.push([s, Math.min(k.L, q.s0)]); s = Math.max(s, q.s1); }
  if (s < k.L) free.push([s, k.L]);
  return free;
}

// A doorway's frame and strip light (DOORWAY): the jambs only where the
// wall stands beside the opening (a doorway at a wall's end has no jamb on
// that side), the lintel bar and the strip over the opening's full width.
function dressDoorway(d, cell, owner, input) {
  const look = d.look, piece = d.piece, D = DOORWAY;
  // (a doorway a prop already frames, Velvet Row's neon door frames: input.framed, the shells' list)
  const mx = (d.x0 + d.x1) / 2, mz = (d.z0 + d.z1) / 2;
  if ((input.framed || []).some(([x, z]) => Math.hypot(x - mx, z - mz) < 1)) return;
  const kit = new FaceKit(piece, cell, owner, { doors: [], signs: input.signs });
  const a0 = (d.x0 - piece.ax) * piece.ux + (d.z0 - piece.az) * piece.uz - piece.from, b0 = (d.x1 - piece.ax) * piece.ux + (d.z1 - piece.az) * piece.uz - piece.from;
  const a = Math.min(a0, b0), b = Math.max(a0, b0), top = FACADES.doorTop;
  // Is there built wall on this edge from s0 to s1 (the piece's own frame)?
  const wallAt = (s0, s1) => (input.pieces || []).some(q => q !== piece && !q.lintel && q.fixed && q.ax === piece.ax && q.az === piece.az && q.ux === piece.ux && q.uz === piece.uz
    && q.from - 1e-3 <= piece.from + s0 && q.from + q.len + 1e-3 >= piece.from + s1);
  // The trim: the look's window frame (its trim colour), toned to D.trim x the
  // wall's light; the wall's own colour lifted where the frame is darker.
  const lum = c => .2126 * c.r + .7152 * c.g + .0722 * c.b, wallHex = look.base?.colour || look.lower || '#3e4a4c', frameHex = look.windows?.frame || wallHex;
  const wallLum = lum(C(wallHex)), frameLum = lum(C(frameHex)), hex = frameLum > wallLum * 1.1 ? frameHex : wallHex, k = Math.min(1.25, D.trim * wallLum / Math.max(1e-4, lum(C(hex))));
  const trim = tone(hex, k), trimLit = tone(hex, k * 1.15);
  const left = wallAt(a - D.jamb, a), right = wallAt(b, b + D.jamb);
  if (left) kit.box(a - D.jamb, a, 0, top + D.lintel, 0, D.depth, trim, { frontTop: trimLit, top: false });
  if (right) kit.box(b, b + D.jamb, 0, top + D.lintel, 0, D.depth, trim, { frontTop: trimLit, top: false });
  kit.box(left ? a - D.jamb : a, right ? b + D.jamb : b, top, top + D.lintel, 0, D.depth, trim, { top: trimLit, bottom: tone(hex, k * .6) });
  // The strip, unless a lit sign already hangs there (maps/lumen-signs.js's door strips).
  const S = D.strip, y0 = top + D.lintel + S.gap, s0 = a + S.inset, s1 = b - S.inset;
  if (s1 - s0 < .3 || !kit.clear(s0, s1, y0, y0 + .35)) return;
  const name = D.stripColour[look.recipe] || 'warmWhite', light = FACADE_NEON[name] || WINDOW_LIGHT[name];
  kit.box(s0, s1, y0, y0 + S.h, .01, S.depth, lit(light, S.colour), { glow: shine(S.glow), bottom: false });
}

// A canopy over a doorway (over the door's 2.5 m, from 3 m: under 3 m
// nothing stands out past .6 m), with a lit strip under its edge.
function dressCanopy(d, cell, owner, input) {
  const look = d.look, c = look.canopy, r = rng(hash(d.x0, d.z0, look.seed || 1, 41));
  if (r() > (c.big ? 1 : .8)) return;
  const kit = new FaceKit(d.piece, cell, owner, { doors: [], signs: input.signs });
  const piece = d.piece, a = (d.x0 - piece.ax) * piece.ux + (d.z0 - piece.az) * piece.uz - piece.from, b = (d.x1 - piece.ax) * piece.ux + (d.z1 - piece.az) * piece.uz - piece.from;
  const s0 = Math.min(a, b) - .45 - (c.big ? 1.5 : 0), s1 = Math.max(a, b) + .45 + (c.big ? 1.5 : 0), y0 = FACADES.sidewalk.top + .06, y1 = y0 + .16;
  if (!kit.clear(s0, s1, y0, y1 + .2)) return;
  const col = C(c.colour), under = c.glass ? tone('#1c2027', 1) : tone(c.colour, .55), depth = Math.min(c.depth, c.big ? FACADES.canopyBig : FACADES.canopyDepth);
  kit.box(s0, s1, y0, y1, 0, depth, col, { bottom: under, top: c.tarp ? tone(c.colour, 1.1) : tone(c.colour, .95) });
  if (c.strip) { const hex = FACADE_NEON[c.strip]; kit.box(s0 + .05, s1 - .05, y0 - .04, y0, depth - .12, depth - .04, lit(hex, .5), { glow: shine(1.8), tier: 1, top: false }); }
  // Its brackets under it, at the wall (Quality).
  for (const s of [s0 + .2, s1 - .25]) kit.box(s, s + .05, y0 - .35, y0, 0, .5, tone('#2b2d31', 1), { tier: 2, top: false });
}

// Low roofs (design 5: "visible detailed roofs: AC units, vents, tanks,
// cables, rooftop billboards"): dressed once a building, over all its rooms
// (a record a room scattered the same few pale boxes on every room: the
// club's nine rooms had eighteen alike, evenly spread). Counts grow with the
// square root of the roof's area (a roof twice the size is busier, not a
// field of twice the boxes). The kit gathers in a few seeded clusters on the
// roof's outer edges (plant sits by the parapet, where the risers come up),
// long side along its edge: AC units in three sizes, vents of three kinds,
// water tanks, a hatch, pipe runs with a cable beside them, a dish, a small
// billboard frame (a blank dark panel: no lettering). Kept off the signs
// standing on it. Role 3: gone when the roof is lowered or cut.
export const ROOF_KIT = Object.freeze({
  area: 60,        // m2: a roof this size has its recipe's counts (bigger: x sqrt(area / this))
  edge: .75,       // m an item keeps from the roof's outer edge (the cap's lip)
  gap: .3,         // m between two items
  reach: 3.4,      // m along its edge an item strays from its cluster's anchor
  inward: 1.8,     // m in from the edge margin it may stand
  clusterArea: 110, // m2 of roof a cluster (1 to 4)
  // w, d, h (m): a window-type box, a split unit's condenser, a package unit.
  ac: Object.freeze([Object.freeze([.9, .7, .6]), Object.freeze([1.3, .9, .85]), Object.freeze([2.1, 1.3, 1.1])]),
  // A roof whose colour's linear luminance is under `dark` is a dark recipe
  // (the club, Velvet Row, the north frontage, Uptown): its AC units are
  // dimmed by `darkAc` (else the pale boxes are the brightest thing on it),
  // the rest of its kit by `darkKit`.
  dark: .035, darkAc: .58, darkKit: .75,
  acTop: 1.04,     // an AC unit's top against its sides (was 1.15: it glared from above)
});
const polyArea = p => { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1]); return Math.abs(a) / 2; };
const inPoly = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [ax, az] = poly[j], [bx, bz] = poly[i]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) c = !c; } return c; };
const lumOf = hex => { const c = C(hex); return .2126 * c.r + .7152 * c.g + .0722 * c.b; };

function dressRoof(roof, cell, owner, input) {
  const look = roof.look, R = look.roof; if (!R) return;
  const polys = roof.polys, all = polys.flat(), area = polys.reduce((n, p) => n + polyArea(p), 0);
  if (area < 6) return;
  const r = rng(hash(all[0][0], all[0][1], look.seed || 1, 51)), s = Math.sqrt(area / ROOF_KIT.area);
  const y = roof.top + FACADES.roofLift, stamp = cutStamp(roof.slot, 3);
  const inAny = (x, z) => { for (const p of polys) if (inPoly(p, x, z)) return true; return false; };
  // On the roof: its outline pushed out by the margin (sampled every metre or
  // less along each side) lies inside the rooms' union.
  const onRoof = (cx, cz, X, Z, m = ROOF_KIT.edge) => {
    const hx = X / 2 + m, hz = Z / 2 + m, nx = Math.ceil(2 * hx), nz = Math.ceil(2 * hz);
    for (let i = 0; i <= nx; i++) { const x = cx - hx + 2 * hx * i / nx; if (!inAny(x, cz - hz) || !inAny(x, cz + hz)) return false; }
    for (let i = 1; i < nz; i++) { const z = cz - hz + 2 * hz * i / nz; if (!inAny(cx - hx, z) || !inAny(cx + hx, z)) return false; }
    return true;
  };
  // The roof's outer edges (a wall between two of its rooms is not one),
  // each with its inward normal.
  const edges = [];
  for (const p of polys) for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 2) continue;
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    let nx = -uz, nz = ux; if (!inPoly(p, mx + nx * .3, mz + nz * .3)) { nx = -nx; nz = -nz; }
    if (inAny(mx - nx * .3, mz - nz * .3)) continue;
    edges.push({ a, ux, uz, nx, nz, len });
  }
  if (!edges.length) return;
  const perimeter = edges.reduce((n, e) => n + e.len, 0);
  const edgeAt = t => { for (const e of edges) { if (t < e.len) return [e, t]; t -= e.len; } return [edges[edges.length - 1], 0]; };
  const anchors = [];
  for (let i = 0, n = Math.max(1, Math.min(4, Math.round(area / ROOF_KIT.clusterArea))); i < n; i++) { const [e, t] = edgeAt(r() * perimeter); anchors.push({ x: e.a[0] + e.ux * t, z: e.a[1] + e.uz * t, e }); }
  const xs = all.map(p => p[0]), zs = all.map(p => p[1]);
  const signs = (input.signs || []).filter(g => g.x > Math.min(...xs) - 2 && g.x < Math.max(...xs) + 2 && g.z > Math.min(...zs) - 2 && g.z < Math.max(...zs) + 2);
  const used = [];
  // A place for a w x d footprint (w along its edge) near a cluster's
  // anchor: [cx, cz, X, Z (its size on x and z), the edge], or null.
  const place = (w, d, inward = ROOF_KIT.inward, reach = ROOF_KIT.reach) => {
    for (let t = 0; t < 16; t++) {
      const A = anchors[Math.floor(r() * anchors.length) % anchors.length], e = A.e, along = (r() * 2 - 1) * reach, inn = ROOF_KIT.edge + .05 + r() * inward;
      const alongX = Math.abs(e.ux) > .7, X = alongX ? w : d, Z = alongX ? d : w, half = Math.abs(e.nx) * X / 2 + Math.abs(e.nz) * Z / 2;
      const cx = A.x + e.ux * along + e.nx * (inn + half), cz = A.z + e.uz * along + e.nz * (inn + half);
      if (!onRoof(cx, cz, X, Z)) continue;
      if (used.some(u => Math.abs(u[0] - cx) < (u[2] + X) / 2 + ROOF_KIT.gap && Math.abs(u[1] - cz) < (u[3] + Z) / 2 + ROOF_KIT.gap)) continue;
      if (signs.some(g => Math.abs(g.x - cx) < X / 2 + g.hw + .4 && Math.abs(g.z - cz) < Z / 2 + .8)) continue;
      used.push([cx, cz, X, Z]); return [cx, cz, X, Z, e];
    }
    return null;
  };
  const box = (soup, cx, cz, w, d, ya, yb, col, o = {}) => {
    const start = soup.count, at = null, X0 = cx - w / 2, X1 = cx + w / 2, Z0 = cz - d / 2, Z1 = cz + d / 2;
    const top = o.top || col, side = o.side || tone2(col, .8);
    quad(soup, [X0, yb, Z0], [X1, yb, Z0], [X1, yb, Z1], [X0, yb, Z1], [0, 1, 0], top, top, stamp, at, o.glow);
    quad(soup, [X0, ya, Z1], [X1, ya, Z1], [X1, yb, Z1], [X0, yb, Z1], [0, 0, 1], col, o.frontTop || col, stamp, at, o.glow);
    quad(soup, [X1, ya, Z0], [X0, ya, Z0], [X0, yb, Z0], [X1, yb, Z0], [0, 0, -1], side, side, stamp, at, o.glow);
    quad(soup, [X0, ya, Z0], [X0, ya, Z1], [X0, yb, Z1], [X0, yb, Z0], [-1, 0, 0], side, side, stamp, at, o.glow);
    quad(soup, [X1, ya, Z1], [X1, ya, Z0], [X1, yb, Z0], [X1, yb, Z1], [1, 0, 0], side, side, stamp, at, o.glow);
    if (soup.count > start) { soup.ranges.push([start, soup.count, null]); owner.parts++; }
  };
  const soupFor = tier => tier ? cell.tiers[tier] : cell.rest;
  const tbox = (tier, ...args) => { if (wants(tier)) box(soupFor(tier), ...args); };
  // A box turned with its edge: `a` along it, `b` in from it (offsets from
  // the footprint's centre), sizes the same way round.
  const ebox = (tier, at, a, b, w, d, ya, yb, col, o) => {
    const e = at[4], alongX = Math.abs(e.ux) > .7;
    tbox(tier, at[0] + e.ux * a + e.nx * b, at[1] + e.uz * a + e.nz * b, alongX ? w : d, alongX ? d : w, ya, yb, col, o);
  };
  const dark = lumOf(roof.roofColour || '#2a2c30') < ROOF_KIT.dark;
  const grey = look.acColour || '#6a6e75', acK = dark ? ROOF_KIT.darkAc : 1, fan = tone('#1d1f23', 1), steel = look.pipeColour || '#4a4e55';
  // (the rest of the kit a step darker on a dark roof too: vents, hatch, pipes, the dish)
  const kit = (hex, k = 1) => tone(hex, k * (dark ? ROOF_KIT.darkKit : 1));

  // AC units: a big package unit first on a big roof (every preset), then
  // condensers and window boxes (Balanced), their fans (Quality).
  const nAc = Math.min(8, Math.round((R.ac || 0) * s) + 1);
  for (let i = 0; i < nAc; i++) {
    const size = ROOF_KIT.ac[i === 0 ? (area > 90 ? 2 : 1) : (r() < .55 ? 1 : 0)], at = place(size[0], size[1]); if (!at) continue;
    const tier = i === 0 ? 0 : 1, h = size[2], unit = tone(grey, .95 * acK * (.92 + r() * .12));
    tbox(tier, at[0], at[1], at[2], at[3], y, y + h, unit, { top: tone2(unit, ROOF_KIT.acTop) });
    const fans = size === ROOF_KIT.ac[2] ? 2 : 1, f = Math.min(size[0], size[1]) * .6;
    for (let k = 0; k < fans; k++) ebox(Math.max(tier, 2), at, fans === 1 ? size[0] * .15 : (k - .5) * size[0] * .48, 0, f, f, y + h, y + h + .03, fan);
    // (a big unit's base rail, and a condenser's line down to the roof)
    if (size === ROOF_KIT.ac[2]) ebox(2, at, 0, 0, size[0] + .12, size[1] + .12, y, y + .1, tone('#2b2d31', 1));
    else ebox(2, at, -size[0] / 2 + .12, -size[1] / 2 - .05, .05, .05, y, y + h * .7, tone('#2b2d31', 1));
  }
  // Vents: a capped box, a thin stack with its rain cap, a hooded exhaust.
  const nVents = Math.min(8, Math.round((R.vents || 0) * s));
  for (let i = 0; i < nVents; i++) {
    const kind = i === 0 ? 0 : Math.floor(r() * 3), at = place(kind === 2 ? .7 : .55, .55, 2.6); if (!at) continue;
    const tier = i === 0 ? 0 : 1;
    if (kind === 0) { ebox(tier, at, 0, 0, .35, .35, y, y + .55, kit('#4a4e55', 1)); ebox(Math.max(tier, 1), at, 0, 0, .55, .55, y + .55, y + .65, kit('#5a5e65', 1)); }
    else if (kind === 1) { const h = .9 + r() * .7; ebox(tier, at, 0, 0, .16, .16, y, y + h, kit(steel, 1)); ebox(Math.max(tier, 2), at, 0, 0, .3, .3, y + h, y + h + .06, kit(steel, 1.1)); }
    else { ebox(tier, at, 0, 0, .45, .4, y, y + .45, kit('#474b52', 1)); ebox(Math.max(tier, 1), at, 0, -.08, .6, .52, y + .45, y + .6, kit('#555960', 1)); }
  }
  // Water tanks on legs (Balanced; the legs Quality).
  const nTanks = R.tanks ? Math.min(2, Math.max(1, Math.round(R.tanks * s * .7))) : 0;
  for (let i = 0; i < nTanks; i++) {
    const at = place(1.6, 1.6, 1.4); if (!at) continue;
    for (const [dx, dz] of [[-.45, -.45], [.45, -.45], [-.45, .45], [.45, .45]]) tbox(2, at[0] + dx, at[1] + dz, .08, .08, y, y + .5, kit('#2b2d31', 1));
    if (!wants(1)) continue;
    const soup = soupFor(1), start = soup.count, rr = .7, ya = y + .5, yb = y + 2.1, c = [at[0], at[1]];
    for (let k = 0; k < 8; k++) {
      const a0 = k * Math.PI / 4, a1 = a0 + Math.PI / 4, am = a0 + Math.PI / 8, n = [Math.cos(am), 0, Math.sin(am)];
      quad(soup, [c[0] + rr * Math.cos(a0), ya, c[1] + rr * Math.sin(a0)], [c[0] + rr * Math.cos(a1), ya, c[1] + rr * Math.sin(a1)], [c[0] + rr * Math.cos(a1), yb, c[1] + rr * Math.sin(a1)], [c[0] + rr * Math.cos(a0), yb, c[1] + rr * Math.sin(a0)], n, kit('#4a4640', 1), kit('#5a564e', 1), stamp, null, null);
      // (the lid: a low cone, each slice facing out and up)
      const A = [c[0], yb + .25, c[1]], B = [c[0] + rr * Math.cos(a0), yb, c[1] + rr * Math.sin(a0)], D = [c[0] + rr * Math.cos(a1), yb, c[1] + rr * Math.sin(a1)];
      let nl = norm(cross(sub(B, A), sub(D, A))); if (nl[1] < 0) nl = nl.map(v => -v);
      const cr = cross(sub(B, A), sub(D, A)), order = cr[0] * nl[0] + cr[1] * nl[1] + cr[2] * nl[2] >= 0 ? [A, B, D] : [A, D, B];
      for (const q of order) soup.vertex(q[0], q[1], q[2], nl, kit('#55514a', 1), stamp, q[0], q[2], null);
    }
    soup.ranges.push([start, soup.count, null]); owner.parts++;
  }
  // The roof hatch (every preset): a curb and its lid, a handle (Quality).
  { const at = place(1, 1, 3); if (at) { tbox(0, at[0], at[1], .9, .9, y, y + .28, kit('#3a3d44', 1)); tbox(0, at[0], at[1], .98, .98, y + .28, y + .33, kit('#4a4e55', 1)); ebox(2, at, 0, .3, .3, .05, y + .33, y + .38, kit('#2b2d31', 1)); } }
  // Pipe runs along an edge (Balanced), on stands (Quality), a riser at one
  // end; the cable beside them where the recipe has cables.
  for (let i = 0, n = area > 150 ? 2 : 1; i < n; i++) {
    const len = 2.8 + r() * 4, at = place(len, .5, .3, 1.5); if (!at) continue;
    ebox(1, at, 0, -.05, len, .14, y + .18, y + .32, kit(steel, .9));
    ebox(1, at, len / 2 - .07, -.05, .14, .14, y, y + .95, kit(steel, .9));
    for (let t = -len / 2 + .5; t < len / 2 - .3; t += 1.3) ebox(2, at, t, -.05, .08, .3, y, y + .18, kit('#2b2d31', 1));
    if (R.cables) ebox(1, at, 0, .17, len, .06, y, y + .05, kit('#1f2024', 1));
  }
  // A dish on a short mast, tilted to the sky (Quality).
  if (R.cables || r() < .5) {
    const at = place(.9, .9, 2.4), a = r() * Math.PI * 2; // (drawn on every pass: the passes agree part for part)
    if (at) {
      tbox(2, at[0], at[1], .1, .1, y, y + .75, kit('#6a6e75', .8));
      if (wants(2)) {
        const soup = soupFor(2), start = soup.count, up = .7, lean = [Math.cos(a) * .64, up, Math.sin(a) * .64], n = norm(lean);
        const u = norm(cross([0, 1, 0], n)), v = cross(n, u), c = [at[0], y + .95, at[1]], h = .38;
        const P = (su, sv, k = 0) => [c[0] + u[0] * su * h + v[0] * sv * h + n[0] * k, c[1] + u[1] * su * h + v[1] * sv * h + n[1] * k, c[2] + u[2] * su * h + v[2] * sv * h + n[2] * k];
        quad(soup, P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), n, kit('#6f737a', 1), kit('#6f737a', 1), stamp, null, null);
        quad(soup, P(-1, -1, -.03), P(1, -1, -.03), P(1, 1, -.03), P(-1, 1, -.03), n.map(q => -q), kit('#4a4e55', 1), kit('#4a4e55', 1), stamp, null, null);
        soup.ranges.push([start, soup.count, null]); owner.parts++;
      }
    }
  }
  // A small billboard frame at the roof's edge (Balanced): two posts, a
  // blank dark panel in a steel rim facing out, its two lamps (Quality).
  if (area > 40 && r() < .65) {
    const w = 2.2 + r() * 1.4, at = place(w, .5, 0, 2.5);
    if (at) {
      const y0 = y + .9, y1 = y0 + .9 + r() * .5, rim = tone('#3a3d44', 1), panel = tone(pick(r, ['#1c1e24', '#221d26', '#1b2426']), 1);
      for (const t of [-w / 2 + .25, w / 2 - .25]) ebox(1, at, t, .1, .1, .1, y, y0, rim);
      ebox(1, at, 0, -.1, w, .06, y0, y1, panel);
      ebox(2, at, 0, -.1, w + .08, .1, y1, y1 + .06, rim); ebox(2, at, 0, -.1, w + .08, .1, y0 - .06, y0, rim);
      for (const t of [-w / 2, w / 2]) ebox(2, at, t, -.1, .06, .1, y0, y1, rim);
      for (const t of [-w / 4, w / 4]) ebox(2, at, t, -.35, .14, .08, y1 + .06, y1 + .12, lit(FACADE_NEON.warmWhite, .5), { glow: shine(1.4), top: lit(FACADE_NEON.warmWhite, .5) });
    }
  }
  // Night Market: lanterns strung along each room's street (south) edge,
  // warm and some red; not along a wall between two of its rooms.
  if (look.lanterns) for (const poly of polys) {
    const px = poly.map(p => p[0]), pz = poly.map(p => p[1]), x0 = Math.min(...px) + .8, x1 = Math.max(...px) - .8, zEdge = Math.max(...pz) + FACADES.face + .3;
    for (let x = x0; x < x1; x += .9) {
      if (inAny(x, zEdge)) continue;
      const red = hash(x, zEdge) < .5, hex = red ? '#e8322a' : FACADE_NEON.warmWhite, ly = Math.max(roof.floor + .1, roof.top - .5);
      tbox(1, x, zEdge, .18, .18, ly, ly + .2, lit(hex, .5), { glow: shine(1.6), top: lit(hex, .5) });
    }
  }
}
const tone2 = (c, k) => ({ r: c.r * k, g: c.g * k, b: c.b * k });

// Where a building with laundry has two of its storeys facing each other
// across 5 to 16 m (the Stacks' courtyard between its arms): lines across,
// high up, at a few places along the stretch both share.
function laundryLines(pieces) {
  const out = [], ups = pieces.filter(p => p.look.laundry && p.upper && !p.party && !p.hidden);
  for (const a of ups) for (const b of ups) {
    if (a === b || a.owner !== b.owner || a.ox * b.ox + a.oz * b.oz > -.99 || a.oz < b.oz || (a.oz === b.oz && a.ox < b.ox)) continue;
    const fa = [a.ax + a.ux * a.from + a.ox * FACADES.face, a.az + a.uz * a.from + a.oz * FACADES.face];
    const fb = [b.ax + b.ux * b.from + b.ox * FACADES.face, b.az + b.uz * b.from + b.oz * FACADES.face];
    const gap = (fb[0] - fa[0]) * a.ox + (fb[1] - fa[1]) * a.oz; if (gap < 5 || gap > 16) continue;
    // Their overlap along a's line.
    const tb0 = (fb[0] - fa[0]) * a.ux + (fb[1] - fa[1]) * a.uz, tb1 = tb0 + (b.ux * a.ux + b.uz * a.uz) * b.len;
    const lo = Math.max(0, Math.min(tb0, tb1)) + .8, hi = Math.min(a.len, Math.max(tb0, tb1)) - .8;
    for (let t = lo, i = 0; t < hi; t += 3.1, i++) {
      const x = fa[0] + a.ux * t, z = fa[1] + a.uz * t, y = Math.min(a.top, b.top) > 20 ? 7.5 + ((i * 7) % 5) * 1.6 : 0;
      if (!y) continue;
      out.push({ owner: a.owner, slot: a.slot, cell: a.cell, a: [x, z], b: [x + a.ox * gap, z + a.oz * gap], y });
    }
  }
  return out;
}

// Laundry lines across the Stacks' courtyard, high up (Quality): a thin
// line and cloths hanging off it; gone when the block is lowered or cut.
function dressLaundry(l, cell, owner) {
  const soup = cell.tiers[2], start = soup.count, stamp = cutStamp(l.slot, 3), at = null; // (on no wall: world/city-cut.js CUT.wall)
  const dx = l.b[0] - l.a[0], dz = l.b[1] - l.a[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
  const r = rng(hash(l.a[0], l.a[1], l.y));
  const seg = (s0, s1, ya, yb, col, depth) => {
    const A = [l.a[0] + ux * s0, l.a[1] + uz * s0], B = [l.a[0] + ux * s1, l.a[1] + uz * s1];
    for (const side of [1, -1]) quad(soup, [A[0] + nx * depth * side, ya, A[1] + nz * depth * side], [B[0] + nx * depth * side, ya, B[1] + nz * depth * side], [B[0] + nx * depth * side, yb, B[1] + nz * depth * side], [A[0] + nx * depth * side, yb, A[1] + nz * depth * side], [nx * side, 0, nz * side], col, col, stamp, at, null);
    quad(soup, [A[0] - nx * depth, yb, A[1] - nz * depth], [B[0] - nx * depth, yb, B[1] - nz * depth], [B[0] + nx * depth, yb, B[1] + nz * depth], [A[0] + nx * depth, yb, A[1] + nz * depth], [0, 1, 0], col, col, stamp, at, null);
  };
  const sag = s => .5 * Math.sin(Math.PI * s / len);
  for (let s = 0; s < len - .01; s += 1) { const s1 = Math.min(len, s + 1); seg(s, s1, l.y - sag((s + s1) / 2) - .02, l.y - sag((s + s1) / 2), tone('#2b2d31', 1), .01); }
  for (let s = .6; s < len - .6; s += range(r, .5, 1.1)) {
    if (r() < .25) continue;
    const w = range(r, .3, .7), h = range(r, .4, .9), y = l.y - sag(s) - .02, hex = pick(r, ['#b8b0a0', '#8a8278', '#2e4e7a', '#6a3a34', '#9a9a8e', '#4e5a4c']);
    seg(s, s + w, y - h, y, tone(hex, .9), .015);
  }
  soup.ranges.push([start, soup.count, null]); owner.parts++;
}
