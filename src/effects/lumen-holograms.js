// Lumen's holographic ads (stage 5; design 12 and 13, "the Cyberpunk
// signature"): big translucent pictograms projected over the plazas and the
// frontages, turning and bobbing in the night air. A koi swimming circles over
// the Crossroads' gantry, a drinks can off the Flatiron's corner, a heart over
// Velvet Row's lane and a cocktail over the club's door, a helmet over Uptown
// plaza, a paper lantern over the Night Market, an eye over Metro Plaza, a
// noodle bowl over the noodle bar's frontage. Each is a wireframe of glowing
// strokes (a front and a back layer, struts between, the faint middle layer;
// the lathe-turned ones rings and ribs), the pictogram's own filled shape
// faint inside it from Quality up, a beam from its projector, scanlines, a
// sweep of light climbing it, a slow flicker and now and then a glitch (the
// slices shear, it dims, then it settles). The projector is a small housing
// with a lit lens on a roof edge, a wall or the gantry (the signs system's
// pieces: its sign material, no draw of its own).
//
// Rules it keeps:
//   - never over the play: every shape's lowest point stands above
//     `minBottom` (4.5 m) and anything drawn over a player, as the camera sees
//     it, fades to `playerFade` (the local player and everyone drawn);
//   - cut with its building like the signs, and with its projector, which is
//     one (city-signs.js cutAway: the whole cut above the first floor, or the
//     scoop lowering the wall behind the lens): never a picture without its lens;
//     and gone over the room you are in (city-shells.js ROOM_VIEW: its line
//     from the camera lands on your room's floor);
//   - colours from the signs' NEON palette, never near the team colours at
//     their glow (tests/lumen-holograms.test.js measures them after tone
//     mapping at the HDR gain they are drawn with);
//   - nothing large flashes: the flicker is a +-8% shimmer and a glitch is one
//     dip with the slices jumping at 6 Hz (movement, not a strobe).
//
// Cost: ONE instanced mesh, one ShaderMaterial built in the constructor (a
// strip of one quad a stroke segment, camera-facing, as lumen-wrecks.js' glow),
// every shape built once at load, animated on the GPU from the weather clock.
// The instances are ordered by hologram, so a preset draws the first N
// holograms by setting the instance count; a detail tier per instance (the
// middle layer, the fill, the extra glow) is culled in the shader. The CPU's
// work a frame: per hologram (8 at most) one cut test, the room and player
// fades, its last glitch time: a few dozen multiplies, nothing allocated. On
// the mirror's bright layer (Quality reflects it, Extreme's full mirror too).
//   Potato none; Performance 3 (wires and beams); Balanced 5 (+ struts, the
//   middle layers); Quality 7 (+ the filled pictograms, details); Extreme all 8
//   (+ a wide glow layer, the base scan rings). One draw (+1 in the mirror).
import * as THREE from 'three';
import { registerCitySystem, BRIGHT_LAYER } from '../render/city-registry.js';
import { NEON, NEON_SHAPES } from '../render/city-signs.js';
import { PICTOGRAMS, shapeStrokes, pictogramRect, glyphAtlasTexture } from '../render/glyph-atlas.js';
import { lastBurst, hash01, ribbonGeometry } from './lumen-wrecks.js';

export const HOLOGRAMS = Object.freeze({
  // How many (the first N of `list`) and the detail tier drawn, by preset.
  presets: Object.freeze({
    potato:      Object.freeze({ count: 0, tier: -1 }),
    performance: Object.freeze({ count: 3, tier: 0 }),
    balanced:    Object.freeze({ count: 5, tier: 1 }),
    quality:     Object.freeze({ count: 7, tier: 2 }),
    extreme:     Object.freeze({ count: 8, tier: 3 }),
  }),
  minBottom: 4.5,       // m: no shape reaches lower than this (players stand under them)
  reach: 58,            // m from the camera's focus past which a hologram is not drawn
  wire: .045,           // m: a stroke's half width (a 3 m hologram's lines read at 400 px wide)
  depth: .24,           // of its size: how far apart a flat shape's front and back layers stand
  gain: 1.9,            // HDR: a stroke's colour multiplier (the test measures the team gap at this)
  opacity: .62,         // a stroke's alpha at full
  fill: .2,             // the filled pictogram's alpha (Quality up)
  beam: Object.freeze({ alpha: .1, lens: .06, spread: .3 }), // the projector's beam: alpha, half width at the lens, at the shape (of its size)
  playerFade: .3,       // what a hologram drawn over a player keeps
  fadeRate: 5,          // 1/s: how fast it fades in and out
  // A glitch: one per `period` s give or take `spread`, each hologram on its own site of the shared schedule
  // (lumen-ambience.js plays the crackle at the same instants: audio-lumen.js slotFire, site `site + i`).
  glitch: Object.freeze({ site: 70, period: 9, spread: 7, length: .45, dim: .55 }),
  // The holograms, most important first (a lower preset draws the first few). at: the shape's centre; size: its
  // height (m); colour/core: NEON names (the strokes, the brightest ones); spin: rad/s (the koi: round its orbit);
  // lens: the projector (on `building`, cut with it; null: free-standing); mount: 'roof' | 'wall' | 'gantry'.
  list: Object.freeze([
    Object.freeze({ id: 'crossroads', shape: 'koi', at: Object.freeze([6, 9.6, -4.6]), size: 4.4, colour: 'pink', core: 'roseWhite', spin: .36, orbit: 2, bob: .25, lens: Object.freeze([6, 6.8, -4.6]), building: null, mount: 'gantry' }),
    Object.freeze({ id: 'flatiron', shape: 'can', at: Object.freeze([31.4, 8.6, 7.9]), size: 2.8, colour: 'lemon', core: 'warmWhite', spin: .55, bob: .18, lens: Object.freeze([34.2, 7.2, 10.25]), building: 'flatiron', mount: 'wall' }),
    Object.freeze({ id: 'velvet', shape: 'heart', at: Object.freeze([-42, 8.2, 43]), size: 3, colour: 'velvetRed', core: 'roseWhite', spin: .5, bob: .22, lens: Object.freeze([-44.3, 7.05, 43]), building: 'club', mount: 'roof' }),
    Object.freeze({ id: 'uptown', shape: 'helmet', at: Object.freeze([44, 8.8, -30]), size: 3.2, colour: 'blue', core: 'coldWhite', spin: .35, bob: .2, lens: Object.freeze([38.35, 5.6, -30]), building: 'luxury-tower', mount: 'wall' }),
    Object.freeze({ id: 'market', shape: 'lantern', at: Object.freeze([-13, 8.4, -39.6]), size: 2.6, colour: 'red', core: 'warmWhite', spin: .3, bob: .16, lens: Object.freeze([-13, 6.05, -43.3]), building: 'market-hall', mount: 'roof' }),
    Object.freeze({ id: 'metro', shape: 'eye', at: Object.freeze([27, 7.4, 40.6]), size: 2.4, colour: 'green', core: 'coldWhite', spin: .45, bob: .16, lens: Object.freeze([27, 4.05, 44.3]), building: 'metro-entrance', mount: 'roof' }),
    Object.freeze({ id: 'club-door', shape: 'cocktail', at: Object.freeze([-49.5, 8.2, 34.3]), size: 1.8, colour: 'pink', core: 'roseWhite', spin: .6, bob: .12, lens: Object.freeze([-49.5, 7.05, 36.2]), building: 'club', mount: 'roof' }),
    Object.freeze({ id: 'noodle', shape: 'bowl', at: Object.freeze([-15.2, 7.2, -8.7]), size: 1.7, colour: 'coral', core: 'warmWhite', spin: .5, bob: .12, lens: Object.freeze([-15.2, 5.4, -10.25]), building: 'noodle-bar', mount: 'wall' }),
  ]),
});

const MAX = 8; // uniform slots (HOLOGRAMS.list.length at most)

// The glitch schedule: when hologram `i`'s last glitch began, at or before `clock` (-99: none yet).
export const glitchStart = (i, clock) => lastBurst(HOLOGRAMS.glitch.site + i, clock, HOLOGRAMS.glitch.period, HOLOGRAMS.glitch.spread);
// A jittered schedule's last event, kept until its next one is due (audio-lumen.js slotFire's
// events: event n at n * period + hash01(site, n, 7) * spread): the hashing runs once an event,
// not every frame (its 32-bit maths boxes numbers). Seeking back refreshes it.
export class EventClock {
  constructor(site, period, spread) { this.site = site; this.period = period; this.spread = spread; this.last = -99; this.next = -Infinity; }
  at(clock) {
    if (clock >= this.next || clock < this.last) {
      this.last = lastBurst(this.site, clock, this.period, this.spread);
      let next = Infinity;
      for (let n = Math.floor((clock - this.spread) / this.period); n <= Math.floor(clock / this.period) + 1; n++) { const t = n * this.period + hash01(this.site, n, 7) * this.spread; if (t > clock && t < next) next = t; }
      this.next = next;
    }
    return this.last;
  }
}
// How far into a glitch hologram `i` is at `clock`: 1 at its start, 0 when over.
export function glitchLevel(i, clock) {
  const age = clock - glitchStart(i, clock), L = HOLOGRAMS.glitch.length;
  return age >= 0 && age < L ? 1 - age / L : 0;
}

// --- The shapes ---------------------------------------------------------------------------
// A shape is a list of segments in its unit frame (about -.5..+.5, y up, +z toward the camera
// when unturned): { a: [x, y, z], b: [x, y, z], tier, bright } and fills { x0, y0, x1, y1, rect, tier }.
// tier 0 the main lines (every preset that draws it), 1 the middle layer and struts, 2 details, 3 the wide glow.
function Shape() { return { segs: [], fills: [] }; }
function line(s, pts, tier = 0, bright = 1, closed = false) {
  for (let i = 1; i < pts.length; i++) s.segs.push({ a: pts[i - 1], b: pts[i], tier, bright });
  if (closed && pts.length > 2) s.segs.push({ a: pts[pts.length - 1], b: pts[0], tier, bright });
}
const ringPts = (r, y, n = 14, rz = r, a0 = 0, a1 = Math.PI * 2) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [Math.sin(a) * r, y, Math.cos(a) * rz]; });

// A flat pictogram given depth: its strokes on a front and a back layer, a faint middle
// layer, struts every few points, the filled pictogram between (Quality up).
function extruded(strokes, { depth = HOLOGRAMS.depth, fill = null } = {}) {
  const s = Shape(), d = depth / 2;
  for (const st of strokes) {
    const p = st.map(([x, y]) => [x - .5, y - .5]);
    line(s, p.map(([x, y]) => [x, y, d]), 0, 1.1);
    line(s, p.map(([x, y]) => [x, y, -d]), 0, .8);
    line(s, p.map(([x, y]) => [x, y, 0]), 1, .45);
    for (let i = 0; i < p.length; i += 3) s.segs.push({ a: [p[i][0], p[i][1], d], b: [p[i][0], p[i][1], -d], tier: 1, bright: .55 });
    line(s, p.map(([x, y]) => [x, y, d]), 3, .35); // (the wide glow layer: drawn wider, Extreme)
  }
  if (fill) s.fills.push({ x0: -.5, y0: -.5, x1: .5, y1: .5, rect: pictogramRect(fill), tier: 2 });
  return s;
}

// A turned shape: rings at each profile point (r, y), ribs between them.
function lathe(profile, { ribs = 8, key = [], segments = 16, mainRibs = 4 } = {}) {
  const s = Shape();
  profile.forEach(([r, y], i) => { if (r > .005) line(s, ringPts(r, y, segments), key.includes(i) ? 0 : 1, key.includes(i) ? 1.1 : .7); });
  for (let k = 0; k < ribs; k++) {
    const a = k / ribs * Math.PI * 2, pts = profile.map(([r, y]) => [Math.sin(a) * r, y, Math.cos(a) * r]);
    line(s, pts, k % (ribs / mainRibs) === 0 ? 0 : 1, k % (ribs / mainRibs) === 0 ? 1 : .6);
  }
  const top = profile[profile.length - 1], bottom = profile[0];
  line(s, ringPts(Math.max(bottom[0], .2) + .06, bottom[1], segments), 3, .5); // (a scan ring round its foot, Extreme)
  void top;
  return s;
}

const SHAPES = {
  koi() {
    // The body along x (the head +x), rings of an oval section, ribs along it; a
    // forked tail, a dorsal fin, pectoral fins, eyes and barbels.
    const s = Shape();
    const xs = [-.44, -.32, -.18, -.04, .1, .22, .32, .4, .46], rh = [.03, .07, .11, .13, .135, .125, .1, .07, .03];
    xs.forEach((x, i) => line(s, Array.from({ length: 11 }, (_, k) => { const a = k / 10 * Math.PI * 2; return [x, Math.cos(a) * rh[i], Math.sin(a) * rh[i] * .72]; }), i === 3 || i === 5 ? 0 : 1, i === 3 || i === 5 ? 1 : .6));
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      line(s, xs.map((x, i) => [x, Math.cos(a) * rh[i], Math.sin(a) * rh[i] * .72]), k % 2 === 0 ? 0 : 1, k % 2 === 0 ? 1.05 : .6);
    }
    line(s, [[-.44, 0, 0], [-.62, .17, 0], [-.55, .02, 0], [-.62, -.15, 0], [-.44, 0, 0]], 0, 1.2);
    line(s, [[-.5, .08, 0], [-.58, .1, 0]], 2, .7); line(s, [[-.5, -.07, 0], [-.58, -.09, 0]], 2, .7);
    line(s, [[.14, .13, 0], [-.02, .24, 0], [-.22, .1, 0]], 0, 1);
    for (const z of [1, -1]) {
      line(s, [[.22, -.08, z * .08], [.1, -.15, z * .22], [.08, -.08, z * .09]], 1, .8);
      line(s, [[-.24, -.06, z * .05], [-.3, -.12, z * .14], [-.34, -.05, z * .05]], 2, .7);
      line(s, ringPts(.022, .035, 8).map(([x, y, zz]) => [.37 + x, .035 + zz, z * .072]), 2, 1.3);
      line(s, [[.45, -.02, z * .02], [.52, -.07, z * .06], [.55, -.1, z * .05]], 2, .8);
    }
    line(s, [[-.44, 0, 0], [.46, 0, 0]], 3, .4);
    return s;
  },
  can() {
    // A drinks can: lathe body, a ring pull on top, the city's bolt pictogram wrapped round its front.
    const s = lathe([[.24, -.5], [.3, -.44], [.3, -.2], [.3, .1], [.3, .38], [.24, .47], [.24, .5]], { ribs: 12, mainRibs: 4, key: [1, 4, 6] });
    line(s, ringPts(.07, .52, 10).map(([x, y, z]) => [x + .07, y, z]), 2, 1.2);
    for (const st of shapeStrokes(PICTOGRAMS.bolt)) line(s, st.map(([u, v]) => { const a = (u - .5) * 1.3; return [Math.sin(a) * .31, -.18 + v * .46, Math.cos(a) * .31]; }), 1, 1.35);
    return s;
  },
  helmet() {
    // A rider's helmet (the cyberware showroom's): a dome, a wide visor band across the front, a neck ring, a crest.
    const s = lathe([[.25, -.48], [.36, -.36], [.41, -.18], [.41, .02], [.36, .2], [.25, .35], [.1, .44], [.02, .46]], { ribs: 10, mainRibs: 5, key: [0, 3, 5] });
    const visor = (y, r) => Array.from({ length: 11 }, (_, i) => { const a = -1.1 + 2.2 * i / 10; return [Math.sin(a) * r, y, Math.cos(a) * r]; });
    line(s, visor(-.1, .425), 0, 1.4); line(s, visor(.12, .42), 0, 1.4); line(s, visor(.01, .43), 2, .9);
    for (const a of [-1.1, 1.1]) line(s, [[Math.sin(a) * .425, -.1, Math.cos(a) * .425], [Math.sin(a) * .42, .12, Math.cos(a) * .42]], 0, 1.4);
    line(s, Array.from({ length: 9 }, (_, i) => { const a = -1.3 + 2.6 * i / 8; return [0, Math.cos(a) * .47 - .02, Math.sin(a) * .47]; }), 1, .8);
    return s;
  },
  lantern() {
    // A paper lantern: a bulging body of ribs, its caps, the hanger and a tassel.
    const s = lathe([[.12, -.44], [.24, -.38], [.36, -.25], [.42, -.05], [.4, .15], [.3, .33], [.13, .42]], { ribs: 12, mainRibs: 12, key: [0, 3, 6] });
    line(s, [[0, .42, 0], [0, .56, 0]], 0, .9); line(s, ringPts(.05, .58, 8).map(([x, y, z]) => [x, y + z * .5, 0]), 2, .8);
    line(s, [[0, -.44, 0], [0, -.6, 0]], 0, .9);
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; line(s, [[0, -.6, 0], [Math.sin(a) * .04, -.72, Math.cos(a) * .04]], 2, .8); }
    return s;
  },
  heart: () => extruded(NEON_SHAPES.heart, { fill: 'heart' }),
  eye: () => extruded(NEON_SHAPES.eye, { fill: 'eye' }),
  cocktail: () => extruded(NEON_SHAPES.cocktail, { fill: 'cocktail' }),
  bowl: () => extruded(NEON_SHAPES.bowl, { fill: 'bowl' }),
  lips: () => extruded(NEON_SHAPES.lips, { fill: 'lips' }),
};
export const HOLOGRAM_SHAPES = Object.freeze(Object.keys(SHAPES));
const shapeCache = new Map();
export function hologramShape(name) {
  if (!SHAPES[name]) throw new Error(`lumen-holograms: no shape "${name}"`);
  if (!shapeCache.has(name)) shapeCache.set(name, SHAPES[name]());
  return shapeCache.get(name);
}
// The shape's extent in its unit frame (for the height rule and the fades).
export function shapeBounds(name) {
  const s = hologramShape(name); let y0 = Infinity, y1 = -Infinity, r = 0;
  for (const g of s.segs) for (const p of [g.a, g.b]) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); r = Math.max(r, Math.hypot(p[0], p[2])); }
  for (const f of s.fills) { y0 = Math.min(y0, f.y0); y1 = Math.max(y1, f.y1); r = Math.max(r, Math.abs(f.x0), Math.abs(f.x1)); }
  return { y0, y1, r };
}
// A hologram's lowest point in the world (its bob and, for the koi, its orbit included).
export function lowestPoint(h) { const b = shapeBounds(h.shape); return h.at[1] + b.y0 * h.size - (h.bob || 0); }

// --- The instances ----------------------------------------------------------------------------
// Per instance (one quad): aA (a.xyz, hologram), aB (b.xyz, kind 0 stroke / 2 fill / 3 beam),
// aC (half width, brightness, tier, 0), aD (fill: the atlas rect u0 v0 u1 v1). Ordered by hologram.
export function hologramInstances(list = HOLOGRAMS.list) {
  const rows = [], firsts = [0];
  list.forEach((h, i) => {
    const s = hologramShape(h.shape);
    rows.push([0, 0, 0, i, 0, 0, 0, 3, HOLOGRAMS.beam.lens, 1, 0, 0, 0, 0, 0, 0]);
    for (const g of s.segs) rows.push([...g.a, i, ...g.b, 0, HOLOGRAMS.wire * (g.tier === 3 ? 3.2 : 1), g.bright, g.tier, 0, 0, 0, 0, 0]);
    for (const f of s.fills) rows.push([f.x0, f.y0, 0, i, f.x1, f.y1, 0, 2, 0, 1, f.tier, 0, f.rect.u0, f.rect.v0, f.rect.u1, f.rect.v1]);
    firsts.push(rows.length);
  });
  return { rows, firsts };
}

// --- The material -----------------------------------------------------------------------------
const f = v => Number(v).toFixed(4);
const linear = hex => { const c = new THREE.Color(NEON[hex] || hex); return [c.r, c.g, c.b]; };

export function hologramMaterial(atlas) {
  const H = HOLOGRAMS;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uClock: { value: 0 }, uTier: { value: 0 }, uAtlas: { value: atlas },
      uH0: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) }, // centre, size
      uH1: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) }, // colour (linear, HDR), spin
      uH2: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) }, // phase, bob, style (0 turn, 1 swim), orbit
      uH3: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) }, // lens, shown 0..1
      uH4: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) }, // core colour, glitch start
    },
    vertexShader: `
attribute vec4 aA;
attribute vec4 aB;
attribute vec4 aC;
attribute vec4 aD;
uniform float uClock;
uniform float uTier;
uniform vec4 uH0[${MAX}];
uniform vec4 uH1[${MAX}];
uniform vec4 uH2[${MAX}];
uniform vec4 uH3[${MAX}];
uniform vec4 uH4[${MAX}];
varying vec3 vCol;
varying float vAlpha;
varying float vSide;
varying vec2 vUv;
varying float vKind;
varying float vY;
varying float vLocal;
varying float vPhase;
float h11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
// A point of hologram i's unit frame in the world, now.
vec3 place(vec3 p, int i, float gl) {
  vec4 h0 = uH0[i], h2 = uH2[i];
  float size = h0.w, t = uClock, spin = uH1[i].w, phase = h2.x;
  vec3 q = p;
  // A glitch: horizontal slices shear sideways, jumping six times a second.
  if (gl > 0.0) { float band = floor(p.y * 7.0 + 3.5); q.x += (h11(band * 3.1 + floor(t * 6.0) + phase * 17.0) - .5) * .32 * gl; }
  float a = t * spin + phase * 6.2831853;
  vec3 at = h0.xyz;
  float th = a;
  if (h2.z > .5) {
    // The koi: its tail sways, it swims round a circle, head along its path.
    q.z += sin(p.x * 9.0 - t * 5.5) * .07 * clamp(.55 - p.x, 0.0, 1.0);
    q.y += sin(t * 1.3 + p.x * 2.0) * .02;
    at += vec3(cos(a), 0.0, sin(a)) * h2.w;
    th = -(a + 1.5707963);
  }
  q *= size;
  float c = cos(th), s = sin(th);
  q = vec3(q.x * c + q.z * s, q.y, -q.x * s + q.z * c);
  at.y += sin(t * .8 + phase * 6.2831853) * h2.y;
  return at + q;
}
void main() {
  int i = int(aA.w + .5);
  float kind = aB.w, tier = aC.z, shown = uH3[i].w;
  vSide = position.y; vKind = kind; vUv = vec2(0.0); vAlpha = 0.0; vCol = vec3(0.0); vY = 0.0; vLocal = 0.0; vPhase = uH2[i].x;
  if (shown < .01 || tier > uTier + .5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float age = uClock - uH4[i].w, gl = age >= 0.0 && age < ${f(H.glitch.length)} ? 1.0 - age / ${f(H.glitch.length)} : 0.0;
  float u = position.x, size = uH0[i].w;
  // A slow shimmer (+-8%), and the glitch's one dip.
  float shimmer = .92 + .08 * sin(uClock * 2.3 + vPhase * 40.0) * sin(uClock * 1.7 + vPhase * 13.0);
  float level = shown * shimmer * (1.0 - ${f(H.glitch.dim)} * gl);
  vec3 col = uH1[i].rgb, core = uH4[i].rgb;
  vec4 mv;
  if (kind > 2.5) {
    // The beam: from the lens up to the shape's foot, wide at the shape, fading as it goes.
    vec3 a = uH3[i].xyz, b = place(vec3(0.0, -.45, 0.0), i, 0.0);
    vec4 ma = viewMatrix * vec4(a, 1.0), mb = viewMatrix * vec4(b, 1.0);
    mv = mix(ma, mb, u);
    vec2 dir = mb.xy - ma.xy; dir = length(dir) < .0001 ? vec2(1.0, 0.0) : normalize(dir);
    mv.xy += vec2(-dir.y, dir.x) * position.y * mix(aC.x, size * ${f(H.beam.spread)}, u);
    vAlpha = level * ${f(H.beam.alpha)} * (1.0 - .65 * u);
    vCol = mix(core, col, u);
    vY = mix(a.y, b.y, u); vLocal = -1.0;
  } else if (kind > 1.5) {
    // The filled pictogram: a quad in the shape's plane, the atlas' mask on it.
    float s01 = position.y * .5 + .5;
    vec3 p = vec3(mix(aA.x, aB.x, u), mix(aA.y, aB.y, s01), 0.0);
    vec3 w = place(p, i, gl);
    mv = viewMatrix * vec4(w, 1.0);
    vUv = vec2(mix(aD.x, aD.z, u), mix(aD.w, aD.y, s01));
    vAlpha = level * ${f(H.fill)};
    vCol = mix(col, core, .25);
    vY = w.y; vLocal = p.y + .5; vSide = 0.0;
  } else {
    // A stroke: a camera-facing ribbon from a to b, its ends overlapping the next.
    vec3 wa = place(aA.xyz, i, gl), wb = place(aB.xyz, i, gl);
    vec4 ma = viewMatrix * vec4(wa, 1.0), mb = viewMatrix * vec4(wb, 1.0);
    mv = mix(ma, mb, u);
    vec2 dir = mb.xy - ma.xy; dir = length(dir) < .0001 ? vec2(1.0, 0.0) : normalize(dir);
    float hw = aC.x * (.6 + .4 * size / 3.0);
    mv.xy += vec2(-dir.y, dir.x) * position.y * hw + dir * (u * 2.0 - 1.0) * hw;
    float bright = aC.y;
    vAlpha = level * ${f(H.opacity)} * min(1.0, bright) * (tier > 2.5 ? .3 : 1.0);
    vCol = mix(col, core, clamp(bright - 1.0, 0.0, .6) * 1.4);
    vY = mix(wa.y, wb.y, u); vLocal = mix(aA.y, aB.y, u) + .5;
  }
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `
uniform float uClock;
uniform sampler2D uAtlas;
varying vec3 vCol;
varying float vAlpha;
varying float vSide;
varying vec2 vUv;
varying float vKind;
varying float vY;
varying float vLocal;
varying float vPhase;
void main() {
  float a = vAlpha;
  if (vKind > 1.5 && vKind < 2.5) a *= texture2D(uAtlas, vUv).r;
  else a *= 1.0 - vSide * vSide;
  // Scanlines in world height, drifting up; a band of light climbing the shape.
  float scan = .62 + .38 * step(.42, fract(vY * 9.0 - uClock * 1.4));
  float sweep = vLocal < 0.0 ? 0.0 : smoothstep(.14, 0.0, abs(fract(uClock * .21 + vPhase) * 1.3 - .15 - vLocal));
  a *= scan * (1.0 + .9 * sweep);
  if (a <= .003) discard;
  gl_FragColor = vec4(vCol * ${f(H.gain)}, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  material.customProgramCacheKey = () => 'lumen-holograms-v1';
  return material;
}

// --- The system ---------------------------------------------------------------------------------
export class LumenHolograms {
  constructor(view, map, city) {
    this.view = view; this.map = map; this.city = city;
    const list = this.list = HOLOGRAMS.list.slice(0, MAX);
    const slots = city?.shells?.slots;
    // Per hologram: where it is, its cut slot, how far out it reaches (for the fades), how shown it is now.
    this.holos = list.map((h, i) => {
      const b = shapeBounds(h.shape);
      return { i, h, x: h.at[0], y: h.at[1], z: h.at[2], lx: h.lens[0], ly: h.lens[1], lz: h.lens[2], size: h.size, radius: Math.max(b.r * h.size + (h.orbit || 0), h.size * .5), slot: h.building ? slots?.get(h.building) || 0 : 0, vis: 0,
        glitch: new EventClock(HOLOGRAMS.glitch.site + i, HOLOGRAMS.glitch.period, HOLOGRAMS.glitch.spread) };
    });
    const { rows, firsts } = hologramInstances(list);
    this.firsts = firsts;
    this.material = hologramMaterial(city?.signs?.atlas || glyphAtlasTexture());
    const u = this.material.uniforms;
    list.forEach((h, i) => {
      const c = linear(h.colour), k = linear(h.core || h.colour);
      u.uH0.value[i].set(h.at[0], h.at[1], h.at[2], h.size);
      u.uH1.value[i].set(c[0], c[1], c[2], h.spin);
      u.uH2.value[i].set(i * .137 + .05, h.bob || 0, h.shape === 'koi' ? 1 : 0, h.orbit || 0);
      u.uH3.value[i].set(h.lens[0], h.lens[1], h.lens[2], 0);
      u.uH4.value[i].set(k[0], k[1], k[2], -99);
    });
    const geometry = ribbonGeometry(1);
    for (const [name, from] of [['aA', 0], ['aB', 4], ['aC', 8], ['aD', 12]]) {
      const a = new Float32Array(rows.length * 4);
      rows.forEach((r, n) => { for (let k = 0; k < 4; k++) a[n * 4 + k] = r[from + k]; });
      geometry.setAttribute(name, new THREE.InstancedBufferAttribute(a, 4));
    }
    geometry.instanceCount = rows.length;
    const mesh = this.mesh = new THREE.Mesh(geometry, this.material);
    mesh.name = 'lumen-holograms'; mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.raycast = () => {}; mesh.visible = false; mesh.matrixAutoUpdate = false;
    mesh.layers.enable(BRIGHT_LAYER);
    view.scene?.add(mesh);
    // (The signs are made first: render/city-systems.js imports them before this. Were they not, the projectors go up on the first frame.)
    this.mounted = false;
    if (city?.signs) this.mountProjectors(city.signs, slots);
    this.setQuality(view.qualityName || 'balanced');
  }

  // Each projector: a small dark housing and a lit lens looking up (the signs' own pieces).
  mountProjectors(signs, slots) {
    for (const h of this.list) {
      const [x, y, z] = h.lens, building = h.building ? slots?.get(h.building) || 0 : 0;
      signs.addPole({ at: [x, y - .16, z], height: .2, width: .34, building });
      if (h.mount === 'wall' || h.mount === 'gantry') signs.addPole({ at: [x, y - .5, z], height: .34, width: .08, building });
      signs.addPanel({ at: [x, y + .045, z], facing: 0, tilt: 90, w: .2, h: .2, depth: .02, colour: h.core || h.colour, intensity: 1.7, building });
    }
    signs.finish(); // (now, at load: not a rebuild on the first frame)
    this.mounted = true;
  }

  setQuality(name) {
    const p = this.preset = HOLOGRAMS.presets[name] || HOLOGRAMS.presets.balanced;
    this.count = Math.min(p.count, this.list.length);
    this.mesh.geometry.instanceCount = this.firsts[this.count];
    this.material.uniforms.uTier.value = p.tier;
  }

  update(frame) {
    const u = this.material.uniforms, H = HOLOGRAMS;
    if (!this.mounted && this.city?.signs) this.mountProjectors(this.city.signs, this.city.shells?.slots);
    if (!this.count) { this.mesh.visible = false; return; }
    const clock = Number.isFinite(frame.clock) ? frame.clock : frame.elapsed || 0, dt = Math.min(frame.dt || 0, .1);
    const cam = frame.camera?.position, focus = frame.focus, cut = this.city?.shells?.cut;
    const cu = this.city?.uniforms, roomOn = cu?.cityRoomOn?.value > .5, quad = cu?.cityRoomQuad?.value;
    const ease = Math.min(1, dt * H.fadeRate);
    let any = false;
    for (let n = 0; n < this.count; n++) {
      const o = this.holos[n];
      let want = 1;
      if (focus) { const dx = o.x - focus.x, dz = o.z - focus.z; if (dx * dx + dz * dz > H.reach * H.reach) want = 0; }
      // (Cut with its projector, a sign on the building: the whole cut, or the scoop lowering the wall behind the lens.)
      if (want && o.slot && cut?.hides?.(o.slot, o.lx, o.ly, o.lz)) want = 0;
      if (want && cam) {
        if (roomOn && quad && this.overRoom(cam, o, quad)) want = 0;
        else if (this.overPlayer(cam, o, frame.player) || this.overOthers(cam, o, frame.others)) want = H.playerFade;
      }
      o.vis = dt > 0 ? o.vis + (want - o.vis) * ease : want;
      if (o.vis < .01 && want === 0) o.vis = 0;
      u.uH3.value[n].w = o.vis;
      u.uH4.value[n].w = o.glitch.at(clock);
      if (o.vis > 0) any = true;
    }
    u.uClock.value = clock;
    this.mesh.visible = any;
  }

  // Where the camera's line through (x, y, z) meets the height `at`, into this.hit.
  landing(cam, x, y, z, at) {
    const hit = this.hit ||= { x: 0, z: 0 }, dy = y - cam.y;
    if (dy > -.001) { hit.x = x; hit.z = z; return hit; }
    const k = (at - cam.y) / dy; hit.x = cam.x + (x - cam.x) * k; hit.z = cam.z + (z - cam.z) * k; return hit;
  }
  // Is its middle, its top or its foot, as the camera sees it, over the floor of your room (grown by its reach)?
  overRoom(cam, o, q) {
    for (let k = -1; k <= 1; k++) {
      const p = this.landing(cam, o.x, o.y + k * o.size * .5, o.z, 0);
      if (insideQuad(q, p.x, p.z, o.radius)) return true;
    }
    return false;
  }
  // Is it drawn over a player (the camera's line through its middle lands within its reach of them, at chest height)?
  overPlayer(cam, o, p) {
    if (!p) return false;
    const hit = this.landing(cam, o.x, o.y, o.z, 1.2), r = o.radius + 1;
    return (hit.x - p.x) ** 2 + (hit.z - p.z) ** 2 < r * r;
  }
  overOthers(cam, o, others) {
    if (!others) return false;
    for (let i = 0; i < others.length; i++) if (this.overPlayer(cam, o, others[i])) return true;
    return false;
  }

  // The warm-up's draw: shown once (every shape drawn, whatever the preset).
  warm() { this.mesh.visible = true; }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.material.dispose(); }
}

// Is (x, z) inside the convex quad q (8 numbers) or within `grow` of it?
export function insideQuad(q, x, z, grow = 0) {
  let inside = true, best = Infinity;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, ax = q[i * 2], az = q[i * 2 + 1], ex = q[j * 2] - ax, ez = q[j * 2 + 1] - az;
    const side = ex * (z - az) - ez * (x - ax);
    if (side !== 0) { const s = Math.sign(side); if (!sign) sign = s; else if (s !== sign) inside = false; }
    const len2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / len2));
    best = Math.min(best, (ax + ex * t - x) ** 2 + (az + ez * t - z) ** 2);
  }
  return inside || best < grow * grow;
}

registerCitySystem('holograms', (view, map, city) => (map.city?.holograms ?? map.id === 'lumen') ? new LumenHolograms(view, map, city) : null);
