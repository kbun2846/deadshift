// Lumen's signs, screens and traffic lights (lumen-design.md sections 8, 12,
// 13, 15, 17; decisions 19/20: shootable signs, the flatiron's centrepiece,
// the power sag). Built only for a map with `city.signs` (city-features.js).
//
// Three materials, ONE each for the whole map, animated on the GPU from
// `city.uniforms.time`, so a hundred signs cost what one does:
//   SIGN    neon tubes, lit panels, lamp heads, window slits and every dark
//           backing, bezel, housing and pole the builders make (unlit; a
//           per-vertex `mode` picks steady, flicker, blink, pulse or dead,
//           and `backing` for the unlit dark parts)
//   SCREEN  billboards, ad pillars, shop screens, the flatiron's giant screen
//           (unlit; one generated glyph atlas, glyph-atlas.js; a per-vertex
//           `mode` picks the content)
//   TRAFFIC signal heads, pedestrian heads, hazards (unlit; the phase is a
//           pure function of the time, `trafficLevel`, mirrored in JS)
// plus two instanced additive card layers built from the emitter list:
//   HALOS   fake bloom, one camera-facing quad per bright emitter (Performance
//           up): a long soft streak for a tube, a soft rectangle for a screen
//           or panel (a rounded rectangle grown by the glow, never a disc), a
//           small tight flare on a faint wide glow for a lamp or a signal
//   POOLS   one ground quad per light that changes (signals, hazards,
//           flickering or blinking signs, the sag), so a signal's pool on the
//           wet road follows its phase (Performance up): an oval along the
//           wall, the kerb or the lane, with the falloff of the painted pools
//           (world/city-ground.js GLOW_PROFILE)
// Five draws on Performance and up, three on Potato; nothing per frame on the
// CPU but three numbers (the time and the sag are shared uniforms).
//
// Why ShaderMaterial and not a patched MeshBasicMaterial: nothing here is lit,
// fogged (the haze starts at 70 m) or textured the three.js way, and every
// value comes from custom attributes; a small hand shader skips Basic's chunk
// chain, keeps the program key to one fixed string, and (like the rain) is
// left alone by the scope's grey and the indoor clip, which only hook the
// built-in materials.
//
// Colours are linear (THREE.Color) and go above 1 (an `intensity` per vertex)
// so ACES gives neon its white-hot core and Extreme's bloom finds it. None of
// the palettes comes near a team colour (tests/city-signs.test.js).
//
// Shootable (decision 20.5): every sign, screen and lamp head carries a
// `signId`, an index into ONE table of (time shot, time back): a 1024 x 1
// float texture, one texel an id, read in the vertex shaders (a uniform array
// that size is too many uniforms for a phone). The shaders play the spark
// (three flickers), then dark (the dark backing stays, so a broken sign reads
// as off, not gone), and relight at the back time with no CPU work;
// `breakSign(id, now)` / `restoreSign(id, now)` write the table and flag the
// texture for upload (only then, never per frame).
//
// On a cut building: every piece mounted on one carries its building's cut
// slot (`building` option: city.shells.slots.get(id); 0 free-standing) and
// its centre (height, x, z), and goes whole where the shells' rule cuts its
// centre (world/city-cut.js CUT_GLSL cityPieceHidden, the same uniforms and
// table: above a first floor where the camera's line through it lands in
// K; a first-floor piece over the knee where it lands by you; anything above
// the first floor of your open building). Whole pieces, never single
// vertices: a triangle with some corners thrown out of view would streak
// across the screen.
import * as THREE from 'three';
import { BRIGHT_LAYER, GROUND_LAYER, registerCitySystem } from './city-registry.js';
import { CUT, SCOOP_GLSL, cutUniforms } from '../world/city-cut.js';
import { SHELLS } from './city-shells.js';
import { FACADES } from './city-facades.js';
import { ATLAS, GLYPH_COUNT, PICTOGRAMS, PICTOGRAM_INDEX, PICTOGRAM_NAMES, glyphAtlasTexture, glyphShape, pictogramRect, shapeStrokes } from './glyph-atlas.js';

// ---------------------------------------------------------------------------
// Colours (section 15). Every light, sign and screen colour on the map comes
// from here; none within reach of the team Amber, Cyan or Violet.
export const NEON = Object.freeze({
  pink: '#ff2d8a', lemon: '#fcee0a', red: '#ff3040', blue: '#3d6bff', green: '#2bff8a', lime: '#a8ff3c',
  warmWhite: '#fff1d6', coldWhite: '#e6f0ff',
  velvetRed: '#ff2a3c', rose: '#ff5fa8', sodium: '#ffcf8a', uptownBlue: '#3558f0', coral: '#ff5a6e',
  sickGreen: '#6fd46a', roseWhite: '#ffd6e4', screenBlack: '#0e1016',
});
// The screens' palette table: a screen names two entries (ink, field).
export const SCREEN_PALETTE = Object.freeze(Object.keys(NEON));
const PALETTE_INDEX = Object.freeze(Object.fromEntries(SCREEN_PALETTE.map((n, i) => [n, i])));

// The sign material.
export const SIGN = Object.freeze({
  tube: .075,           // m: a neon tube's thickness
  tubeDepth: .06,       // m: how far it stands off its backing
  backingDepth: .07,    // m: the dark glass/metal box behind the tubes
  backingMargin: .12,   // m round the tubes
  backingColour: '#16181e',
  housingColour: '#2a2d33', // lamp housings, poles, signal heads
  standoff: .04,        // m off the wall
  tilt: 25,             // degrees a wall sign leans back toward the camera (section: readability from above)
  intensity: 1.8,       // a lit tube's colour multiplier (HDR)
  light: .4,            // light a 1 m sign casts, in street lamps (the light pool's unit)
  core: .45,            // how far a tube's front face goes toward white (the hot core)
  offGlow: .06,         // an unlit tube: its glass keeps a trace of its colour
  sagDim: .6,           // the power sag at full takes this much of the light away
  // A failing tube (about 1 in 5): episodes of stutter in some windows. Each
  // state lasts a whole quantum (.22 s), so any one second holds at most five
  // changes: 2.5 flashes (the rule: nothing between 3 and 30 a second).
  flicker: Object.freeze({ window: 2.4, chance: .45, quantum: .22, quanta: 5, out: .45, dimFrom: .75, dim: .35 }),
  blink: Object.freeze({ min: .9, spread: 1.2, duty: .55, edge: .06 }),   // period .9..2.1 s: .5..1.1 Hz
  pulse: Object.freeze({ min: 2.6, spread: 1.6, low: .62 }),               // Velvet Row: a slow breath
  dead: Object.freeze({ level: .04, window: 7, chance: .3, glow: .22 }),  // a segment out, now and then a weak try
  deadShare: .3,        // of a 'dead-segment' sign's strokes that are out
  slots: 1024,          // breakable ids: one texel each of the break table (id 0 never breaks)
  restoreAfter: 30,     // s a shot sign stays dark (decision 20.5)
  spark: Object.freeze({ flickers: 3, period: .4, on: .2, levels: Object.freeze([1.6, 1, .6]) }), // 2.5 Hz, three times
  relight: Object.freeze({ stutter: .15, gap: .2 }),
  simplify: .022,       // m a tube's outline may be straightened by (Douglas-Peucker), less than a third of its thickness
  shotMargin: .12,      // m a round's path may miss a piece's edge and still break it (the round has a body)
});
export const SIGN_MODES = Object.freeze({ steady: 0, flicker: 1, blink: 2, pulse: 3, dead: 4, backing: 5 });

// The screen material.
export const SCREEN = Object.freeze({
  rowHeight: .32,       // m: one line of glyphs
  // (2026-09-30, owner: the boards' colours "not so bright and contrasty,
  // subtle... but still pop": ink 1.6 -> 1.15, field .22 -> .16, and the
  // palette a fifth of the way to its own grey on the screens only.)
  ink: 1.15,            // lit ink's multiplier (HDR)
  field: .16,           // a colour field behind a pictogram, against the ink
  desaturate: .2,       // the screens' palette: this share of the way to each colour's grey
  adTime: 6,            // s each pictogram ad holds
  wipe: .45,            // s a colour wipe takes to cross
  bezel: .09,           // m round the face
  bezelDepth: .12,
  centreAd: 7,          // s per ad of the flatiron's loop (five ads)
  reboot: 1,            // s a restored screen spends booting
  sagDim: .55,
  intensity: .6,        // a screen's emitter (for the light pool and the halo)
  glow: .5,             // m a screen's glow spills past its edges (flat, in its own plane)...
  glowPerMetre: .08,    // ...plus this per metre of its longer side
});
export const SCREEN_MODES = Object.freeze({ glyphs: 0, picto: 1, wipe: 2, loading: 3, glitch: 4, frozen: 5, cracked: 6, centrepiece: 7, warning: 8 });
// The warning loop (mode 'warning'): a trefoil, a crossed-out port and an
// arrow toward the metro, one after another (pictograms only, no words).
export const WARNING_LOOP = Object.freeze(['biohazard', 'no-port', 'arrow-right']);

// The traffic material (section 8): green 12 s, yellow 3 s, red the rest; the
// two directions half a cycle apart, a second of all-red between them.
export const TRAFFIC = Object.freeze({
  green: 12, yellow: 3, clearance: 1,
  cycle: 32,            // 2 x (green + yellow + clearance): coherent cross directions
  walk: 8,              // s the walking figure shows at the start of its green
  flash: 1,             // s period of the flashing hand after the walk (1 Hz)
  blink: 1.2, blinkDuty: .55, // the one intersection blinking red
  hazard: 1,            // s period of a hazard light (1 Hz)
  intensity: 2.2, offGlow: .07,
  sagDim: .45,
  colours: Object.freeze({ red: NEON.red, yellow: NEON.lemon, green: '#3bff6a', walk: NEON.coldWhite, stop: NEON.red, hazard: NEON.lemon }),
});
export const TRAFFIC_LAMPS = Object.freeze({ red: 0, yellow: 1, green: 2, walk: 3, stop: 4, hazard: 5, housing: 6 });
export const SIGNAL_STATES = Object.freeze({ normal: 0, blink: 1, dead: 2 });

// Halos (fake bloom) and ground light cards, by preset (section 12, 15).
export const HALO = Object.freeze({
  scale: Object.freeze({ potato: 0, performance: .55, balanced: 1, quality: 1, extreme: .6 }), // Extreme's real bloom adds the rest
  // (2026-09-30, the darker night: .34 -> .27 and a third of the way to grey,
  // so a glow is the light's own colour, softly, not a saturated disc.)
  opacity: .27,
  desaturate: .3,
  lift: .25,            // m out from the sign's face, toward the camera
});
export const POOLS = Object.freeze({
  presets: Object.freeze({ potato: false, performance: true, balanced: true, quality: true, extreme: true }),
  lift: .035,           // m over the flat street
  // (2026-09-30, owner: the signals' "big saturated green and red blobs on
  // the road" and the hazards' yellow ones: a pool card is now .7 the size,
  // half as strong (.17 -> .09 dry, .32 -> .15 more when wet) and 45% of the
  // way to its colour's grey: a tint on the wet road that changes with the
  // light, not a disc of paint.)
  strength: .09,        // a lit pool on dry asphalt
  wet: .15,             // added at full wetness: pools brighten on the wet road
  size: .7,             // x every pool card's radii
  desaturate: .45,      // of the way to the light's own grey
});

// The neon outline signs (owner, 2026-09-30: "neon pink signs and neon blue,
// not as actual sources that show light but as neon signs with just outlines
// of symbols or gibberish words"): bare tubes on a wall (no backing box), the
// sign material's own tube geometry (no material, no draw of their own), a
// thin halo card (Performance up) and no light: maps/lumen-signs.js places
// them (outlineList).
// (Their colours are NEON.pink #ff2d8a and NEON.blue #3d6bff.)
export const NEON_OUTLINE = Object.freeze({
  intensity: 1.5,       // the tubes' HDR multiplier (a street sign's is SIGN.intensity)
  halo: .12,            // m: the thin halo's spill past the tubes...
  haloPerMetre: .06,    // ...plus this per metre of the sign's shorter side
  haloGlow: .55,        // its strength against an emitter's
  simplify: .06,        // m a tube's outline may be straightened by (a street neon's is SIGN.simplify: .022): low-poly, and Lumen's ~80 cost about 9k triangles, not 35k
});

// The power sag (decision 20.4: cosmetic): every 170 s of the weather clock
// the grid dips for about 1.6 s, one gentle wobble, never a strobe. The same
// for every client (the shared clock). Pure function: `sagAt(clock)`.
export const POWER_SAG = Object.freeze({ period: 170, at: 95, dip: .18, hold: .6, recover: .8, wobble: .35 });

// ---------------------------------------------------------------------------
// The shared maths, in JS and GLSL. The hash is PCG on 32-bit integers, exact
// in both, so a light the pool moves to flickers in step with its tube.

const u32 = x => (Math.trunc(x) | 0) >>> 0;
function pcg(v) {
  const s = (Math.imul(v, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}
export const lumenHash = (a, b, c) => pcg((u32(a) + pcg((u32(b) + pcg(u32(c))) >>> 0)) >>> 0) / 4294967296;
const seedInt = seed => Math.floor(seed * 65535 + .5);
const fract = x => x - Math.floor(x);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// A sign's own level (0 out .. 1 lit) for its mode at time t.
export function signModeLevel(mode, seed, t) {
  const s = seedInt(seed);
  if (mode === SIGN_MODES.steady || mode === SIGN_MODES.backing) return 1;
  if (mode === SIGN_MODES.flicker) {
    const F = SIGN.flicker, w = Math.floor(t / F.window);
    if (lumenHash(w, s, 11) >= F.chance) return 1;
    const start = F.quantum + lumenHash(w, s, 12) * (F.window - (F.quanta + 2) * F.quantum), local = t - w * F.window - start;
    if (local < 0 || local >= F.quanta * F.quantum) return 1;
    const h = lumenHash(w * 8 + Math.floor(local / F.quantum), s, 13);
    return h < F.out ? 0 : h < F.dimFrom ? F.dim : 1;
  }
  if (mode === SIGN_MODES.blink) {
    const B = SIGN.blink, period = B.min + B.spread * seed, phase = fract(t / period + seed * 7.13), e = B.edge / period;
    return smooth(0, e, phase) * (1 - smooth(B.duty, B.duty + e, phase));
  }
  if (mode === SIGN_MODES.pulse) {
    const P = SIGN.pulse, period = P.min + P.spread * seed;
    return P.low + (1 - P.low) * (.5 + .5 * Math.sin(Math.PI * 2 * (t / period + seed)));
  }
  const D = SIGN.dead, w = Math.floor(t / D.window);
  if (lumenHash(w, s, 31) < D.chance) {
    const local = t - w * D.window - (1 + lumenHash(w, s, 32) * (D.window - 2));
    if (local >= 0 && local < 2 * SIGN.flicker.quantum) return D.glow;
  }
  return D.level;
}

// A shot sign: 1 intact, the three spark flickers, 0 dark, the relight stutter.
// brokeAt < 0: never shot. backAt <= brokeAt: dark until restored.
export function breakLevel(brokeAt, backAt, t) {
  if (brokeAt < 0 || t < brokeAt) return 1;
  if (backAt > brokeAt && t >= backAt) { const a = t - backAt, R = SIGN.relight; return a < R.stutter ? .6 : a < R.stutter + R.gap ? 0 : 1; }
  const S = SIGN.spark, a = t - brokeAt, k = Math.floor(a / S.period);
  return k < S.flickers && a - k * S.period < S.on ? S.levels[k] : 0;
}
// A screen's state: 0 showing, 1 sparking, 2 dark and cracked, 3 rebooting.
export function screenBreakState(brokeAt, backAt, t) {
  if (brokeAt < 0 || t < brokeAt) return 0;
  if (backAt > brokeAt && t >= backAt) return t - backAt < SCREEN.reboot ? 3 : 0;
  return t - brokeAt < SIGN.spark.period * SIGN.spark.flickers ? 1 : 2;
}

// A traffic lamp's level (0/1) at time t. lamp: TRAFFIC_LAMPS; state: SIGNAL_STATES.
export function trafficLevel(lamp, phaseOffset, group, state, t) {
  const T = TRAFFIC;
  if (state === SIGNAL_STATES.dead) return 0;
  if (lamp === TRAFFIC_LAMPS.hazard) return fract((t + phaseOffset) / T.hazard) < .5 ? 1 : 0;
  if (state === SIGNAL_STATES.blink) return lamp === TRAFFIC_LAMPS.red && fract((t + phaseOffset) / T.blink) < T.blinkDuty ? 1 : 0;
  const c = cycleTime(t, phaseOffset, group);
  switch (lamp) {
    case TRAFFIC_LAMPS.red: return c >= T.green + T.yellow ? 1 : 0;
    case TRAFFIC_LAMPS.yellow: return c >= T.green && c < T.green + T.yellow ? 1 : 0;
    case TRAFFIC_LAMPS.green: return c < T.green ? 1 : 0;
    case TRAFFIC_LAMPS.walk: return c < T.walk ? 1 : 0;
    case TRAFFIC_LAMPS.stop: return c >= T.green ? 1 : c >= T.walk ? (fract((c - T.walk) / T.flash) < .5 ? 1 : 0) : 0;
    default: return 0;
  }
}
const cycleTime = (t, phaseOffset, group) => { const T = TRAFFIC.cycle; return (((t + phaseOffset + group * T / 2) % T) + T) % T; };

// Where a signal is at time t, for sounds (the crossing chirp) and the light
// cards: { light: 'green'|'yellow'|'red'|'blink-on'|'blink-off'|'off',
// walk: 'walk'|'flash'|'stop'|'off', cycle (s into the cycle), next (s until
// the light changes) }. group 0 or 1 (the cross direction runs half a cycle on).
export function trafficPhase(t, { phaseOffset = 0, group = 0, state = 'normal' } = {}) {
  const T = TRAFFIC, st = typeof state === 'number' ? state : SIGNAL_STATES[state] ?? 0;
  if (st === SIGNAL_STATES.dead) return { light: 'off', walk: 'off', cycle: 0, next: Infinity };
  if (st === SIGNAL_STATES.blink) {
    const p = fract((t + phaseOffset) / T.blink) * T.blink, on = p < T.blink * T.blinkDuty;
    return { light: on ? 'blink-on' : 'blink-off', walk: 'off', cycle: p, next: on ? T.blink * T.blinkDuty - p : T.blink - p };
  }
  const c = cycleTime(t, phaseOffset, group);
  const light = c < T.green ? 'green' : c < T.green + T.yellow ? 'yellow' : 'red';
  const next = light === 'green' ? T.green - c : light === 'yellow' ? T.green + T.yellow - c : T.cycle - c;
  const walk = c < T.walk ? 'walk' : c < T.green ? 'flash' : 'stop';
  return { light, walk, cycle: c, next };
}

// The power sag, 0 .. 1, at a weather-clock time.
export function sagAt(clock, spec = POWER_SAG) {
  const p = (((clock - spec.at) % spec.period) + spec.period) % spec.period, total = spec.dip + spec.hold + spec.recover;
  if (p >= total) return 0;
  if (p < spec.dip) return smooth(0, 1, p / spec.dip);
  if (p < spec.dip + spec.hold) return 1 - spec.wobble * Math.sin(Math.PI * (p - spec.dip) / spec.hold);
  return 1 - smooth(0, 1, (p - spec.dip - spec.hold) / spec.recover);
}

const f = v => { const s = String(+v); return s.includes('.') || s.includes('e') ? s : s + '.0'; };

const HASH_GLSL = `
uint lumenPcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float lumenHash(float a, float b, float c) { return float(lumenPcg(uint(int(a)) + lumenPcg(uint(int(b)) + lumenPcg(uint(int(c)))))) * 2.3283064365386963e-10; }
`;
// The levels, the break table and the traffic phase: the JS above, line for line.
const LEVEL_GLSL = `
uniform float signalClock;   // the weather clock: signals agree with the chirps and every machine
uniform sampler2D signBreaks; // ${SIGN.slots} x 1: (shot, back) per id
uniform sampler2D cityCut;    // the shells' cut table: one texel per building slot
${HASH_GLSL}
vec2 breakTimes(float id) { return texelFetch(signBreaks, ivec2(int(id + 0.5), 0), 0).xy; }
// The shells' rule at a piece's centre (world/city-cut.js cityPieceHidden).
${SCOOP_GLSL}
// cut: (its building's slot, centre height, centre x, centre z); slot 0: free-standing, never cut.
// wall: a piece on a wall, its anchor (world/city-cut.js CUT.wall: rule 6, seen from behind its
// wall it goes with the wall's face); one on no wall, its own centre's x, z.
bool cutAway(vec4 cut, vec2 wall) {
  if (cut.x < 0.5) return false;
  vec4 row = texelFetch(cityCut, ivec2(int(cut.x + 0.5), 0), 0);
  vec3 p = vec3(cut.z, cut.y, cut.w);
  return cityPieceHidden(row, texelFetch(cityCut, ivec2(int(cut.x + 0.5), 2), 0).x, p) || cityPieceBehind(row, p, wall);
}
float signModeLevel(float mode, float seed, float t) {
  float s = floor(seed * 65535.0 + 0.5);
  if (mode < 0.5 || mode > 4.5) return 1.0;
  if (mode < 1.5) {
    float w = floor(t / ${f(SIGN.flicker.window)});
    if (lumenHash(w, s, 11.0) >= ${f(SIGN.flicker.chance)}) return 1.0;
    float start = ${f(SIGN.flicker.quantum)} + lumenHash(w, s, 12.0) * ${f(SIGN.flicker.window - (SIGN.flicker.quanta + 2) * SIGN.flicker.quantum)};
    float local = t - w * ${f(SIGN.flicker.window)} - start;
    if (local < 0.0 || local >= ${f(SIGN.flicker.quanta * SIGN.flicker.quantum)}) return 1.0;
    float h = lumenHash(w * 8.0 + floor(local / ${f(SIGN.flicker.quantum)}), s, 13.0);
    return h < ${f(SIGN.flicker.out)} ? 0.0 : h < ${f(SIGN.flicker.dimFrom)} ? ${f(SIGN.flicker.dim)} : 1.0;
  }
  if (mode < 2.5) {
    float period = ${f(SIGN.blink.min)} + ${f(SIGN.blink.spread)} * seed, phase = fract(t / period + seed * 7.13), e = ${f(SIGN.blink.edge)} / period;
    return smoothstep(0.0, e, phase) * (1.0 - smoothstep(${f(SIGN.blink.duty)}, ${f(SIGN.blink.duty)} + e, phase));
  }
  if (mode < 3.5) {
    float period = ${f(SIGN.pulse.min)} + ${f(SIGN.pulse.spread)} * seed;
    return ${f(SIGN.pulse.low)} + ${f(1 - SIGN.pulse.low)} * (0.5 + 0.5 * sin(6.283185307 * (t / period + seed)));
  }
  float w = floor(t / ${f(SIGN.dead.window)});
  if (lumenHash(w, s, 31.0) < ${f(SIGN.dead.chance)}) {
    float local = t - w * ${f(SIGN.dead.window)} - (1.0 + lumenHash(w, s, 32.0) * ${f(SIGN.dead.window - 2)});
    if (local >= 0.0 && local < ${f(2 * SIGN.flicker.quantum)}) return ${f(SIGN.dead.glow)};
  }
  return ${f(SIGN.dead.level)};
}
float breakLevel(vec2 bt, float t) {
  if (bt.x < 0.0 || t < bt.x) return 1.0;
  if (bt.y > bt.x && t >= bt.y) { float a = t - bt.y; return a < ${f(SIGN.relight.stutter)} ? 0.6 : a < ${f(SIGN.relight.stutter + SIGN.relight.gap)} ? 0.0 : 1.0; }
  float a = t - bt.x, k = floor(a / ${f(SIGN.spark.period)});
  if (k < ${f(SIGN.spark.flickers)} && a - k * ${f(SIGN.spark.period)} < ${f(SIGN.spark.on)}) return k < 0.5 ? ${f(SIGN.spark.levels[0])} : k < 1.5 ? ${f(SIGN.spark.levels[1])} : ${f(SIGN.spark.levels[2])};
  return 0.0;
}
vec2 screenBreak(vec2 bt, float t) {
  if (bt.x < 0.0 || t < bt.x) return vec2(0.0);
  if (bt.y > bt.x && t >= bt.y) { float a = t - bt.y; return a < ${f(SCREEN.reboot)} ? vec2(3.0, a) : vec2(0.0); }
  float a = t - bt.x;
  return vec2(a < ${f(SIGN.spark.period * SIGN.spark.flickers)} ? 1.0 : 2.0, a);
}
float trafficLevel(float lamp, float offset, float group, float state, float t) {
  if (state > 1.5) return 0.0;
  if (lamp > 4.5) return fract((t + offset) / ${f(TRAFFIC.hazard)}) < 0.5 ? 1.0 : 0.0;
  if (state > 0.5) return lamp < 0.5 && fract((t + offset) / ${f(TRAFFIC.blink)}) < ${f(TRAFFIC.blinkDuty)} ? 1.0 : 0.0;
  float c = mod(t + offset + group * ${f(TRAFFIC.cycle / 2)}, ${f(TRAFFIC.cycle)});
  if (lamp < 0.5) return c >= ${f(TRAFFIC.green + TRAFFIC.yellow)} ? 1.0 : 0.0;
  if (lamp < 1.5) return c >= ${f(TRAFFIC.green)} && c < ${f(TRAFFIC.green + TRAFFIC.yellow)} ? 1.0 : 0.0;
  if (lamp < 2.5) return c < ${f(TRAFFIC.green)} ? 1.0 : 0.0;
  if (lamp < 3.5) return c < ${f(TRAFFIC.walk)} ? 1.0 : 0.0;
  if (c >= ${f(TRAFFIC.green)}) return 1.0;
  return c >= ${f(TRAFFIC.walk)} && fract((c - ${f(TRAFFIC.walk)}) / ${f(TRAFFIC.flash)}) < 0.5 ? 1.0 : 0.0;
}
`;
const HIDDEN = 'gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;';
const OUTPUT = `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// ---------------------------------------------------------------------------
// The materials.

function lumenMaterial(uniforms, vertexShader, fragmentShader, key, extra = {}) {
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, fog: false, lights: false, ...extra });
  material.customProgramCacheKey = () => key;
  material.name = key;
  return material;
}
export const MATERIAL_KEYS = Object.freeze({ sign: 'lumen-signs', screen: 'lumen-screens', traffic: 'lumen-traffic', halo: 'lumen-halos', pool: 'lumen-light-pools' });

export function signMaterial(shared) {
  return lumenMaterial({ time: shared.time, signalClock: shared.signalClock, sag: shared.sag, signBreaks: shared.signBreaks, cityCut: shared.cityCut, ...shared.scoop }, `
attribute vec3 tint;
attribute float intensity;
attribute float seed;
attribute float mode;
attribute float signId;
attribute vec4 cut;
attribute vec2 cutWall;
uniform float time;
uniform float sag;
${LEVEL_GLSL}
varying vec3 vColour;
void main() {
  if (cutAway(cut, cutWall)) { ${HIDDEN} }
  if (mode > 4.5) vColour = tint;
  else {
    float level = signModeLevel(mode, seed, time) * breakLevel(breakTimes(signId), time) * (1.0 - ${f(SIGN.sagDim)} * sag);
    vColour = tint * (${f(SIGN.offGlow)} + (intensity - ${f(SIGN.offGlow)}) * level);
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`, `
varying vec3 vColour;
void main() {
  gl_FragColor = vec4(vColour, 1.0);${OUTPUT}
}`, MATERIAL_KEYS.sign);
}

// The screen's content, all from the time, the seed and the atlas.
const SCREEN_FRAGMENT = `
uniform sampler2D atlas;
uniform float time;
uniform float sag;
varying vec2 vUv;
varying vec2 vSize;
varying vec4 vInfo;   // mode, seed, break state, break age
varying vec3 vInk;
varying vec3 vField;
${HASH_GLSL}
vec2 gDx; vec2 gDy;   // d(uv) per pixel, taken once in main (uniform control flow)
const vec3 BLACK = vec3(${[...new THREE.Color(NEON.screenBlack)].map(f).join(', ')});
float atlasAt(vec2 uv, vec2 perUv) { return textureGrad(atlas, uv, gDx * perUv, gDy * perUv).r; }
// Glyph idx at local l (0..1, y up); lPerUv: local units per screen uv.
float glyphAt(float idx, vec2 l, vec2 lPerUv) {
  if (l.x < 0.0 || l.x > 1.0 || l.y < 0.0 || l.y > 1.0) return 0.0;
  vec2 cell = vec2(mod(idx, ${f(ATLAS.glyphColumns)}), floor(idx / ${f(ATLAS.glyphColumns)}));
  return atlasAt((cell * ${f(ATLAS.glyphCell)} + vec2(l.x, 1.0 - l.y) * ${f(ATLAS.glyphCell)}) / ${f(ATLAS.size)}, lPerUv * ${f(ATLAS.glyphCell / ATLAS.size)});
}
float pictoAt(float idx, vec2 l, vec2 lPerUv) {
  if (l.x < 0.0 || l.x > 1.0 || l.y < 0.0 || l.y > 1.0) return 0.0;
  vec2 cell = vec2(mod(idx, ${f(ATLAS.pictoColumns)}), floor(idx / ${f(ATLAS.pictoColumns)}));
  return atlasAt((cell * ${f(ATLAS.pictoCell)} + vec2(0.0, ${f(ATLAS.pictoTop)}) + vec2(l.x, 1.0 - l.y) * ${f(ATLAS.pictoCell)}) / ${f(ATLAS.size)}, lPerUv * ${f(ATLAS.pictoCell / ATLAS.size)});
}
float crackAt(vec2 uv) {
  return atlasAt(vec2(uv.x, (${f(ATLAS.crackTop)} + (1.0 - uv.y) * ${f(ATLAS.size - ATLAS.crackTop)}) / ${f(ATLAS.size)}), vec2(1.0, ${f((ATLAS.size - ATLAS.crackTop) / ATLAS.size)}));
}
// A line of glyphs: p.x in glyph cells (continuous), p.y 0..1 up the line.
// Some cells are word gaps. pPerUv: cells per screen uv.
float glyphLine(vec2 p, float key, vec2 pPerUv) {
  float col = floor(p.x);
  if (lumenHash(col + 4096.0, key, 3.0) < 0.2) return 0.0;
  float idx = floor(lumenHash(col + 4096.0, key, 4.0) * ${f(GLYPH_COUNT)});
  vec2 l = (vec2(fract(p.x), p.y) - vec2(0.06, 0.1)) / vec2(0.88, 0.8);
  return glyphAt(idx, l, pPerUv / vec2(0.88, 0.8));
}
float h1(float a, float b) { return lumenHash(a, b, 0.0); }

// Mode 0: lines of glyphs scrolling, alternate lines each way.
vec3 showGlyphs(vec2 uv, float seed, float t) {
  float rows = max(2.0, floor(vSize.y / ${f(SCREEN.rowHeight)}));
  float r = floor(uv.y * rows);
  float across = vSize.x / (vSize.y / rows) * 1.1;
  float dir = mod(r, 2.0) < 0.5 ? 1.0 : -1.0, key = r + floor(seed * 997.0);
  float speed = 0.7 + 0.9 * h1(key, 5.0);
  vec2 p = vec2(uv.x * across + dir * t * speed + 40.0, fract(uv.y * rows));
  float g = glyphLine(p, key, vec2(across, rows));
  vec3 ink = mod(r, 3.0) < 0.5 ? vField : vInk;
  // A slow bright band walking down the lines.
  float band = 1.0 - smoothstep(0.0, 0.5 / rows, abs(fract(0.09 * t + seed) - (1.0 - uv.y)));
  return mix(mix(BLACK, vField * 0.25, 0.3 + 0.2 * band), ink * ${f(SCREEN.ink)} * (0.85 + 0.35 * band), g);
}

// Mode 1: a pictogram ad with a line of glyphs; a colour wipe to the next.
vec3 showPicto(vec2 uv, float seed, float t, float fixedPic) {
  float at = t / ${f(SCREEN.adTime)} + seed * 13.0, slot = floor(at), local = fract(at) * ${f(SCREEN.adTime)};
  float pic = fixedPic >= 0.0 ? fixedPic : floor(h1(slot, floor(seed * 997.0) + 7.0) * ${f(PICTOGRAM_NAMES.length)});
  bool wide = vSize.x > vSize.y * 1.4;
  float side = min(vSize.x * (wide ? 0.5 : 1.0), vSize.y * 0.78) * (1.0 + 0.04 * sin(t * 2.2 + seed * 6.0));
  vec2 centre = vec2(vSize.x * (wide ? 0.27 : 0.5), vSize.y * (wide ? 0.5 : 0.58));
  vec2 l = (uv * vSize - centre) / side + 0.5;
  float p = pictoAt(pic, l, vSize / side);
  vec3 field = mix(BLACK, vField * ${f(SCREEN.field)}, 0.35 + 0.65 * uv.y);
  vec3 c = mix(field, vInk * ${f(SCREEN.ink)}, p);
  // Glyph lines: along the bottom (tall screens) or to the right (wide).
  if (wide) {
    float x0 = 0.55, rows = 3.0, y = (uv.y - 0.2) / 0.6;
    if (uv.x > x0 && y > 0.0 && y < 1.0) {
      float r = floor(y * rows), across = (vSize.x * (1.0 - x0)) / (vSize.y * 0.6 / rows) * 1.1;
      vec2 q = vec2((uv.x - x0) / (1.0 - x0) * across, fract(y * rows));
      q.x *= r < 0.5 ? 0.8 : 1.0;
      c = mix(c, (r < 0.5 ? vInk : vec3(0.9)) * ${f(SCREEN.ink)} * (r < 0.5 ? 1.0 : 0.6), glyphLine(q, slot * 3.0 + r, vec2(across, rows / 0.6)));
    }
  } else if (uv.y < 0.2) {
    float across = vSize.x / (vSize.y * 0.2) * 1.1;
    c = mix(c, vec3(0.9) * ${f(SCREEN.ink * .6)}, glyphLine(vec2(uv.x * across + t * 1.1, uv.y / 0.2), slot + 50.0, vec2(across, 5.0)));
  }
  // The wipe at the start of each ad: a band of ink crossing the screen.
  float wipe = local / ${f(SCREEN.wipe)};
  if (wipe < 1.2) { float d = uv.x - wipe; if (d > 0.0) c = d < 0.18 ? vInk * ${f(SCREEN.ink * .8)} : field; }
  return c;
}

// Mode 2: diagonal colour bands sweeping behind a dark product silhouette.
vec3 showWipe(vec2 uv, float seed, float t) {
  float x = uv.x * vSize.x / vSize.y * 0.5 + uv.y * 0.35 - t * 0.16 + seed * 5.0;
  float band = fract(x), edge = 0.02;
  vec3 c = mix(vInk, vField, smoothstep(0.45 - edge, 0.45 + edge, band) * (1.0 - smoothstep(0.95 - edge, 0.95, band)));
  c *= ${f(SCREEN.ink * .75)};
  float side = min(vSize.x, vSize.y) * 0.8;
  float pic = seed < 0.33 ? ${f(PICTOGRAM_INDEX.bottle)} : seed < 0.66 ? ${f(PICTOGRAM_INDEX.can)} : ${f(PICTOGRAM_INDEX.phone)};
  float p = pictoAt(pic, (uv * vSize - vSize * 0.5) / side + 0.5, vSize / side);
  return mix(c, BLACK, p);
}

// Mode 3: scanlines, a frame and a fake loading bar.
vec3 showLoading(vec2 uv, float seed, float t, float speed) {
  vec3 c = BLACK;
  float edge = min(min(uv.x, 1.0 - uv.x) * vSize.x, min(uv.y, 1.0 - uv.y) * vSize.y);
  c = mix(c, vField * 0.5, 1.0 - smoothstep(0.03, 0.05, abs(edge - 0.1)));
  float fill = fract(t * speed / 5.5 + seed);
  if (uv.x > 0.12 && uv.x < 0.88 && uv.y > 0.4 && uv.y < 0.52) {
    float x = (uv.x - 0.12) / 0.76, block = floor(x * 12.0);
    bool gap = fract(x * 12.0) > 0.82;
    c = !gap && block / 12.0 < fill ? vInk * ${f(SCREEN.ink)} : vField * 0.12;
  }
  // Three dots turning above the bar (1 Hz: small, soft).
  for (int i = 0; i < 3; i++) {
    vec2 d = (uv - vec2(0.44 + 0.06 * float(i), 0.66)) * vSize;
    float on = fract(t - float(i) / 3.0) < 0.34 ? 1.0 : 0.3;
    c = mix(c, vInk * on * ${f(SCREEN.ink * .8)}, 1.0 - smoothstep(0.035, 0.05, length(d)));
  }
  if (uv.y > 0.22 && uv.y < 0.32) {
    float across = vSize.x / (vSize.y * 0.1) * 1.1;
    c = mix(c, vec3(0.8) * 0.5, glyphLine(vec2(uv.x * across, (uv.y - 0.22) / 0.1), floor(seed * 997.0) + 9.0, vec2(across, 10.0)));
  }
  float scan = 0.82 + 0.18 * step(0.5, fract(uv.y * vSize.y * 20.0));
  return c * scan;
}

// A torn frame: horizontal bands shift and the colour splits (the jumps come
// at most every .35 s, never a flash).
vec2 tear(vec2 uv, float seed, float t, float amount) {
  float band = floor(uv.y * 9.0), jump = floor(t / 0.35);
  float h = h1(band + jump * 16.0, floor(seed * 997.0) + 21.0);
  return vec2(fract(uv.x + (h > 0.62 ? (h1(band, jump + 900.0) - 0.5) * 0.35 * amount : 0.0)), uv.y);
}

// Mode 5: stuck on one frame of an ad, stuttering back a frame now and then.
vec3 showFrozen(vec2 uv, float seed, float t) {
  float s = fract(t / 2.3 + seed), tf = seed * 97.0 + 3.0 + (s > 0.9 && s < 0.94 ? -0.4 : 0.0) + (s >= 0.94 && s < 0.97 ? 0.3 : 0.0);
  vec2 u = s > 0.9 ? tear(uv, seed, t, 0.5) : uv;
  vec3 c = showPicto(u, seed, tf, -1.0);
  float roll = 1.0 - smoothstep(0.0, 0.04, abs(fract(t * 0.07 + seed) - uv.y));
  return mix(c, vec3(h1(floor(uv.x * vSize.x * 30.0), floor(t * 6.0)) * 0.35), roll * 0.6);
}

// Mode 6: cracked and dark: the glass catches a little light along the cracks.
vec3 showCracked(vec2 uv, float seed) {
  vec2 u = vec2(seed > 0.5 ? 1.0 - uv.x : uv.x, uv.y); // one crack pattern, mirrored by the seed
  vec3 c = BLACK * 0.8 + vec3(0.07, 0.08, 0.1) * crackAt(u);
  float stripe = step(abs(uv.x - (0.2 + 0.6 * seed)), 0.004 * vSize.x / max(vSize.x, 0.01));
  return c + vField * 0.06 * stripe;
}

// Mode 7: the flatiron's centrepiece: five ads on a 35 s loop, a colour wipe
// between them, a tear now and then, and the fifth stuck on a frozen frame.
vec3 showCentre(vec2 uv, float seed, float t) {
  float T = ${f(SCREEN.centreAd * 5)}, lt = mod(t + seed * T, T), ad = floor(lt / ${f(SCREEN.centreAd)}), at = lt - ad * ${f(SCREEN.centreAd)};
  // A tear about once in 11 s, for .3 s.
  float gw = floor(t / 11.0), gs = h1(gw, 77.0) * 10.0;
  vec2 u = t - gw * 11.0 > gs && t - gw * 11.0 < gs + 0.3 ? tear(uv, seed + gw, t, 1.0) : uv;
  vec3 c;
  if (ad < 0.5) c = showPicto(u, 0.0, at, ${f(PICTOGRAM_INDEX.can)});
  else if (ad < 1.5) {
    // The brand: three big glyphs on a field of ink, an underline growing.
    c = mix(vField * 0.6, vInk * 0.9, u.y) * ${f(SCREEN.ink * .7)};
    float gh = vSize.y * 0.44, across = vSize.x / gh;
    vec2 p = vec2((u.x - 0.5) * across + 1.5, (u.y - 0.36) * vSize.y / gh);
    float g = p.x > 0.0 && p.x < 3.0 ? glyphAt(floor(h1(floor(p.x), 5.0) * ${f(GLYPH_COUNT)}), vec2(fract(p.x), p.y), vec2(across, vSize.y / gh)) : 0.0;
    c = mix(c, BLACK, g);
    if (abs(u.y - 0.26) < 0.025 && abs(u.x - 0.5) < 0.3 * min(1.0, at / 2.0)) c = BLACK;
  }
  else if (ad < 2.5) c = at < 4.0 ? showLoading(u, 0.3, at, 1.4) : showPicto(u, 0.0, at, ${f(PICTOGRAM_INDEX.bolt)});
  else if (ad < 3.5) {
    // Four pictograms in a row, the lit one moving along.
    float k = floor(u.x * 4.0), lit = mod(floor(at / 0.8), 4.0);
    float pic = k < 0.5 ? ${f(PICTOGRAM_INDEX.heart)} : k < 1.5 ? ${f(PICTOGRAM_INDEX.lips)} : k < 2.5 ? ${f(PICTOGRAM_INDEX.cocktail)} : ${f(PICTOGRAM_INDEX.note)};
    float side = min(vSize.x * 0.25, vSize.y) * 0.8;
    vec2 centre = vec2((k + 0.5) * vSize.x * 0.25, vSize.y * 0.5);
    float p = pictoAt(pic, (u * vSize - centre) / side + 0.5, vSize / side);
    c = mix(BLACK + vField * 0.08, (k == lit ? vInk : vField) * ${f(SCREEN.ink)} * (k == lit ? 1.0 : 0.45), p);
  }
  else {
    // The stuck ad: the first ad's frame, stuttering.
    float s = fract(at / 1.7), tf = 2.2 + (s > 0.86 && s < 0.9 ? -0.3 : 0.0) + (s >= 0.9 && s < 0.93 ? 0.25 : 0.0);
    c = showPicto(s > 0.86 ? tear(u, seed, t, 0.6) : u, 0.0, tf, ${f(PICTOGRAM_INDEX.can)});
  }
  // The wipe into each ad.
  float wipe = at / ${f(SCREEN.wipe)};
  if (wipe < 1.2) { float d = uv.x - wipe; if (d > 0.0) c = d < 0.15 ? vInk * ${f(SCREEN.ink)} : BLACK + vField * 0.1; }
  return c;
}

// Mode 8: the warning loop. The third pictogram is the arrow toward the
// metro: the seed picks which way it points on this screen (left, or right).
vec3 showWarning(vec2 uv, float seed, float t) {
  float slot = mod(floor(t / ${f(SCREEN.adTime)} + seed * 13.0), 3.0);
  float pic = slot < 0.5 ? ${f(PICTOGRAM_INDEX[WARNING_LOOP[0]])} : slot < 1.5 ? ${f(PICTOGRAM_INDEX[WARNING_LOOP[1]])} : (seed < 0.5 ? ${f(PICTOGRAM_INDEX['arrow-left'])} : ${f(PICTOGRAM_INDEX[WARNING_LOOP[2]])});
  return showPicto(uv, seed, t, pic);
}

void main() {
  gDx = dFdx(vUv); gDy = dFdy(vUv);
  float mode = vInfo.x, seed = vInfo.y, state = vInfo.z, age = vInfo.w;
  vec2 uv = vUv;
  vec3 c;
  if (state > 1.5 && state < 2.5) c = showCracked(uv, seed);
  else if (state > 2.5) c = showLoading(uv, seed, age, 5.5);
  else {
    if (state > 0.5 || sag > 0.3) uv = tear(uv, seed, time, state > 0.5 ? 1.0 : sag);
    if (mode < 0.5) c = showGlyphs(uv, seed, time);
    else if (mode < 1.5) c = showPicto(uv, seed, time, -1.0);
    else if (mode < 2.5) c = showWipe(uv, seed, time);
    else if (mode < 3.5) c = showLoading(uv, seed, time, 1.0);
    else if (mode < 4.5) {
      vec2 u = tear(uv, seed, time, 1.0);
      c = seed < 0.5 ? showGlyphs(u, seed, time) : showPicto(u, seed, time, -1.0);
      c = vec3(c.r, (seed < 0.5 ? showGlyphs(u + vec2(0.012, 0.0), seed, time) : showPicto(u + vec2(0.012, 0.0), seed, time, -1.0)).g, c.b);
    }
    else if (mode < 5.5) c = showFrozen(uv, seed, time);
    else if (mode < 6.5) c = showCracked(uv, seed);
    else if (mode < 7.5) c = showCentre(uv, seed, time);
    else c = showWarning(uv, seed, time);
    // Shot: three spark flickers (2.5 Hz) over the tearing content.
    if (state > 0.5) {
      float k = floor(age / ${f(SIGN.spark.period)});
      c *= age - k * ${f(SIGN.spark.period)} < ${f(SIGN.spark.on)} ? 1.3 - 0.3 * k : 0.15;
    }
  }
  // Quieter edges, and the sag.
  float edge = min(min(vUv.x, 1.0 - vUv.x) * vSize.x, min(vUv.y, 1.0 - vUv.y) * vSize.y);
  c *= (0.8 + 0.2 * smoothstep(0.0, 0.25, edge)) * (1.0 - ${f(SCREEN.sagDim)} * sag);
  gl_FragColor = vec4(c, 1.0);${OUTPUT}
}`;

export function screenMaterial(shared) {
  return lumenMaterial({ time: shared.time, signalClock: shared.signalClock, sag: shared.sag, signBreaks: shared.signBreaks, cityCut: shared.cityCut, ...shared.scoop, atlas: shared.atlas, screenPalette: shared.palette }, `
attribute float mode;
attribute float seed;
attribute float palette;
attribute float signId;
attribute vec2 screenSize;
attribute vec4 cut;
attribute vec2 cutWall;
uniform float time;
uniform vec3 screenPalette[${SCREEN_PALETTE.length}];
${LEVEL_GLSL}
varying vec2 vUv;
varying vec2 vSize;
varying vec4 vInfo;
varying vec3 vInk;
varying vec3 vField;
void main() {
  if (cutAway(cut, cutWall)) { ${HIDDEN} }
  vUv = uv; vSize = screenSize;
  vec2 b = mode > 6.5 && mode < 7.5 ? vec2(0.0) : screenBreak(breakTimes(signId), time); // the centrepiece is never shot out (a landmark)
  vInfo = vec4(mode, seed, b.x, b.y);
  int ink = int(mod(palette, ${f(SCREEN_PALETTE.length)}) + 0.5), field = int(floor(palette / ${f(SCREEN_PALETTE.length)}) + 0.5);
  vInk = screenPalette[ink]; vField = screenPalette[field];
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`, SCREEN_FRAGMENT, MATERIAL_KEYS.screen);
}

export function trafficMaterial(shared) {
  return lumenMaterial({ time: shared.time, signalClock: shared.signalClock, sag: shared.sag, signBreaks: shared.signBreaks, cityCut: shared.cityCut, ...shared.scoop, atlas: shared.atlas }, `
attribute vec3 tint;
attribute float lamp;
attribute float phaseOffset;
attribute float group;
attribute float signalMode;
attribute vec4 cut;
attribute vec2 cutWall;
uniform float time;
uniform float sag;
${LEVEL_GLSL}
varying vec3 vColour;
varying vec2 vUv;
varying float vLamp;
void main() {
  if (cutAway(cut, cutWall)) { ${HIDDEN} }
  vUv = uv; vLamp = lamp;
  if (lamp > 5.5) vColour = tint;
  else vColour = tint * (${f(TRAFFIC.offGlow)} + (${f(TRAFFIC.intensity)} - ${f(TRAFFIC.offGlow)}) * trafficLevel(lamp, phaseOffset, group, signalMode, signalClock) * (1.0 - ${f(TRAFFIC.sagDim)} * sag));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`, `
uniform sampler2D atlas;
varying vec3 vColour;
varying vec2 vUv;
varying float vLamp;
const vec3 LENS_BLACK = vec3(0.012, 0.013, 0.016);
void main() {
  vec3 c = vColour;
  if (vLamp < 5.5) {
    if (vLamp > 2.5 && vLamp < 4.5) c = mix(LENS_BLACK, vColour, texture2D(atlas, vUv).r); // a pedestrian pictogram (uv in the atlas)
    else { float d = length(vUv - 0.5) * 2.0; c = d > 1.0 ? LENS_BLACK : vColour * (1.15 - 0.3 * d); } // a round lens
  }
  gl_FragColor = vec4(c, 1.0);${OUTPUT}
}`, MATERIAL_KEYS.traffic);
}

// A card's level: its source is (kind, a, b, c): kind 0 a sign (mode, seed,
// signId), 1 a screen (-, -, signId), 2 a traffic lamp (lamp, phaseOffset,
// group + 4 x state).
const CARD_GLSL = `
attribute vec4 cardAt;      // x, y, z, radius
attribute vec4 cardColour;  // linear rgb, intensity
attribute vec4 cardSource;
attribute vec3 cardRight;   // a screen's glow: its face's half width along its right, and
attribute vec3 cardUp;      // half height along its up (zero: a round glow facing the camera)
attribute vec4 cardCut;     // its building's cut slot and its piece's centre (height, x, z)
attribute vec2 cardWall;    // its piece's anchor on its wall (cutAway)
uniform float time;
uniform float sag;
${LEVEL_GLSL}
float cardLevel(vec4 src) {
  if (src.x < 0.5) return signModeLevel(src.y, src.z, time) * breakLevel(breakTimes(src.w), time) * (1.0 - ${f(SIGN.sagDim)} * sag);
  if (src.x < 1.5) { vec2 b = screenBreak(breakTimes(src.w), time); return (b.x > 1.5 && b.x < 2.5 ? 0.0 : b.x > 0.5 ? 0.5 : 1.0) * (1.0 - ${f(SCREEN.sagDim)} * sag); }
  float state = floor(src.w / 4.0);
  return trafficLevel(src.y, src.z, src.w - state * 4.0, state, signalClock) * (1.0 - ${f(TRAFFIC.sagDim)} * sag);
}
varying vec2 vLocal;
varying vec3 vColour;
varying vec2 vRect;
`;
export function haloMaterial(shared) {
  return lumenMaterial({ time: shared.time, signalClock: shared.signalClock, sag: shared.sag, signBreaks: shared.signBreaks, cityCut: shared.cityCut, ...shared.scoop, haloScale: shared.haloScale }, `
uniform float haloScale;
${CARD_GLSL}
void main() {
  float level = cardLevel(cardSource), r = cardAt.w * haloScale;
  if (level < 0.002 || r <= 0.0 || cutAway(cardCut, cardWall)) { ${HIDDEN} }
  vColour = mix(cardColour.rgb, vec3(dot(cardColour.rgb, vec3(0.2126, 0.7152, 0.0722))), ${f(HALO.desaturate)}) * cardColour.w * level * ${f(HALO.opacity)};
  // A piece with a face (a tube, a lit panel, a screen): a soft rectangle in
  // the camera's plane laid along the face's own right as the camera sees it,
  // spilling r past it. A lamp or a signal: a round card.
  vec4 mv = modelViewMatrix * vec4(cardAt.xyz, 1.0);
  if (length(cardRight) > 0.0) {
    vec2 pr = (modelViewMatrix * vec4(cardRight, 0.0)).xy, pu = (modelViewMatrix * vec4(cardUp, 0.0)).xy;
    float lr = length(pr);
    vec2 e1 = lr > 1e-4 ? pr / lr : vec2(1.0, 0.0), e2 = vec2(-e1.y, e1.x);
    float ha = lr + abs(dot(pu, e1)), hb = abs(dot(pu, e2)), wa = ha + r, wb = hb + r * 0.7;
    vRect = vec2(ha / wa, hb / wb);
    mv.xy += e1 * (position.x * wa) + e2 * (position.y * wb);
  } else {
    vRect = vec2(0.0);
    mv.xy += position.xy * r;
  }
  mv.z += r * 0.5; // toward the camera: a halo on a wall is not cut in half by it
  vLocal = position.xy;
  gl_Position = projectionMatrix * mv;
}`, `
varying vec2 vLocal;
varying vec3 vColour;
varying vec2 vRect;
void main() {
  float f;
  if (vRect.x > 0.0) {
    // Full over the face, a smooth shoulder, a long soft tail, nothing at the rim.
    vec2 spill = max(abs(vLocal) - vRect, vec2(0.0)) / max(vec2(1.0) - vRect, vec2(0.001));
    float d2 = dot(spill, spill);
    if (d2 >= 1.0) discard;
    f = (1.0 - d2) * (1.0 - d2) * exp(-2.2 * d2);
  } else {
    // A small tight flare on a faint wide glow.
    float d = length(vLocal);
    if (d >= 1.0) discard;
    f = (0.9 * exp(-22.0 * d * d) + 0.22 * (1.0 - d) * (1.0 - d)) * (1.0 - d * d);
  }
  gl_FragColor = vec4(vColour, f);${OUTPUT}
}`, MATERIAL_KEYS.halo, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
}
export function poolMaterial(shared) {
  return lumenMaterial({ time: shared.time, signalClock: shared.signalClock, sag: shared.sag, signBreaks: shared.signBreaks, cityCut: shared.cityCut, ...shared.scoop, wetness: shared.wetness, roofMask: shared.roofMask, maskBounds: shared.maskBounds }, `
uniform float wetness;
${CARD_GLSL}
varying vec2 vMaskUv;
uniform vec4 maskBounds;
void main() {
  float level = cardLevel(cardSource);
  if (level < 0.002 || cutAway(cardCut, cardWall)) { ${HIDDEN} } // (its sign cut out of view: its light goes with it, as the light pool's)
  vLocal = position.xy;
  vColour = mix(cardColour.rgb, vec3(dot(cardColour.rgb, vec3(0.2126, 0.7152, 0.0722))), ${f(POOLS.desaturate)}) * cardColour.w * level;
  // A round spot, or an ellipse laid along the wall or the kerb (cardRight, cardUp: its two half axes on the ground).
  vec3 off = length(cardRight) > 0.0 ? cardRight * position.x + cardUp * position.y : vec3(position.x * cardAt.w, 0.0, position.y * cardAt.w);
  vec3 at = cardAt.xyz + off;
  vMaskUv = (at.xz - maskBounds.xy) / (maskBounds.zw - maskBounds.xy);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(at, 1.0);
}`, `
varying vec2 vLocal;
varying vec3 vColour;
varying vec2 vMaskUv;
uniform float wetness;
uniform sampler2D roofMask;
void main() {
  float d2 = dot(vLocal, vLocal);
  if (d2 >= 1.0) discard;
  // The same falloff as the baked pools (world/city-ground.js GLOW_PROFILE): a bright core, a smooth tail.
  float fall = (1.0 - d2) * (1.0 - d2) / pow(1.0 + 1.8 * d2, 1.5);
  // Brighter on the wet street, never under a roof or indoors (the rain's roof mask).
  float wet = wetness * (1.0 - texture2D(roofMask, vMaskUv).r);
  gl_FragColor = vec4(vColour * (${f(POOLS.strength)} + ${f(POOLS.wet)} * wet), fall);${OUTPUT}
}`, MATERIAL_KEYS.pool, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}

// ---------------------------------------------------------------------------
// Geometry: plain arrays filled by the builders, typed arrays at finish().

const LAYOUTS = Object.freeze({
  sign: { position: 3, tint: 3, intensity: 1, seed: 1, mode: 1, signId: 1, cut: 4, cutWall: 2 },
  screen: { position: 3, uv: 2, mode: 1, seed: 1, palette: 1, signId: 1, screenSize: 2, cut: 4, cutWall: 2 },
  traffic: { position: 3, tint: 3, uv: 2, lamp: 1, phaseOffset: 1, group: 1, signalMode: 1, cut: 4, cutWall: 2 },
});
export const ATTRIBUTES = Object.freeze(Object.fromEntries(Object.entries(LAYOUTS).map(([k, v]) => [k, Object.freeze(Object.keys(v))])));

// A piece's cut (CitySigns.mount): [slot, centre height, x, z, its wall anchor's x, z].
const cutWall = c => [c[4] ?? c[2], c[5] ?? c[3]];
class Accumulator {
  constructor(layout) { this.layout = layout; this.data = {}; for (const k in layout) this.data[k] = []; this.index = []; this.vertices = 0; this.cut = [0, 0, 0, 0, 0, 0]; }
  vertex(p, values, uv) {
    for (const k in this.layout) {
      const n = this.layout[k], v = k === 'position' ? p : k === 'uv' ? uv || values.uv : k === 'cut' ? this.cut : k === 'cutWall' ? cutWall(this.cut) : values[k], out = this.data[k];
      if (n === 1) out.push(v ?? 0); else for (let i = 0; i < n; i++) out.push(v ? v[i] : 0);
    }
    return this.vertices++;
  }
  // a, b, c, d counter-clockwise seen from the front.
  quad(a, b, c, d, values, uvs = QUAD_UV) {
    const i = this.vertex(a, values, uvs[0]); this.vertex(b, values, uvs[1]); this.vertex(c, values, uvs[2]); this.vertex(d, values, uvs[3]);
    this.index.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    // An empty accumulator still gives every attribute (one degenerate
    // triangle), so the material's program is the same before and after.
    if (!this.vertices) { const zero = {}; for (let k = 0; k < 3; k++) this.vertex([0, -1000, 0], zero); this.index.push(0, 1, 2); }
    for (const k in this.layout) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(this.data[k]), this.layout[k]));
    g.setIndex(this.vertices > 65535 ? new THREE.Uint32BufferAttribute(this.index, 1) : new THREE.Uint16BufferAttribute(this.index, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  get triangles() { return this.index.length / 3; }
}
const QUAD_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

// A mounting frame: origin o, right r, up u and out n (u and n leaned back by
// `tilt` about r). facing: the angle of the face's outward normal in the
// ground plane, 0 = +z (south, toward the camera), PI / 2 = +x (east).
export function signFrame(at, facing = 0, tilt = 0) {
  const s = Math.sin(facing), c = Math.cos(facing), ct = Math.cos(tilt), st = Math.sin(tilt);
  return { o: [at[0], at[1], at[2]], r: [c, 0, -s], u: [-s * st, ct, -c * st], n: [s * ct, st, c * ct], flat: [s, 0, c] };
}
const P = (F, x, y, z) => [F.o[0] + F.r[0] * x + F.u[0] * y + F.n[0] * z, F.o[1] + F.r[1] * x + F.u[1] * y + F.n[1] * z, F.o[2] + F.r[2] * x + F.u[2] * y + F.n[2] * z];

// A box in frame F: centre (cx, cy) in the face plane, along (dx, dy) unit
// with half length hl, half width hw across it, depth z0..z1 out of the face.
// faceValues(face) gives each face's vertex values (0 front, 1 back, 2 end +,
// 3 end -, 4 side +, 5 side -), so a tube's front can glow hotter and a
// housing's faces can carry fake light. skip: faces never seen (a bit each,
// 1 << face): a tube's back against its backing, a backing's against the wall.
const BOX_FACES = [[4, 5, 7, 6], [0, 2, 3, 1], [1, 3, 7, 5], [0, 4, 6, 2], [2, 6, 7, 3], [0, 1, 5, 4]];
const NO_BACK = 1 << 1;
// What the camera can tell of a thin tube: its front and the side that faces
// up (the game looks down), so 2 quads (4 triangles) of the box's 6, not 5.
// A diagonal tube shows two of its sides. (dx, dy): the tube's direction in the sign's plane.
function tubeSkip(dx, dy) {
  const up = [0, 0, dy, -dy, dx, -dx]; // the faces' y (up) components: front, back, +along, -along, +across, -across
  let best = 0.2; for (let k = 2; k < 6; k++) best = Math.max(best, up[k]);
  let skip = 1 << 1; // the back
  for (let k = 2; k < 6; k++) if (up[k] < best * .6) skip |= 1 << k;
  return skip;
}
// Douglas-Peucker on a stroke in the sign's metres: vertices closer than `tol`
// to the line between their neighbours go (a 20-sided ring on a 1 m sign is
// 9 sides the eye cannot tell apart).
function simplifyStroke(pts, w, h, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a][0] * w, ay = pts[a][1] * h, bx = pts[b][0] * w, by = pts[b][1] * h, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let far = -1, dist = tol;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0] * w - ax, py = pts[i][1] * h - ay;
      const t = l2 > 1e-12 ? Math.max(0, Math.min(1, (px * dx + py * dy) / l2)) : 0, d = Math.hypot(px - dx * t, py - dy * t);
      if (d > dist) { dist = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function orientedBox(acc, F, cx, cy, dx, dy, hl, hw, z0, z1, faceValues, skip = 0) {
  const corners = [];
  for (let i = 0; i < 8; i++) {
    const sl = i & 1 ? 1 : -1, sw = i & 2 ? 1 : -1, z = i & 4 ? z1 : z0;
    corners.push(P(F, cx + dx * hl * sl - dy * hw * sw, cy + dy * hl * sl + dx * hw * sw, z));
  }
  BOX_FACES.forEach((q, face) => { if (!(skip & 1 << face)) acc.quad(corners[q[0]], corners[q[1]], corners[q[2]], corners[q[3]], faceValues(face)); });
}
const rectBox = (acc, F, x0, x1, y0, y1, z0, z1, faceValues, skip = 0) => orientedBox(acc, F, (x0 + x1) / 2, (y0 + y1) / 2, 1, 0, (x1 - x0) / 2, (y1 - y0) / 2, z0, z1, faceValues, skip);

// Fake light on the unlit dark parts, by face: the tops catch the sky glow.
// Box faces in the frame: front, back, +x end, -x end, top (+y), bottom (-y)
// for a rectBox (its "along" is x, "across" y).
const HOUSING_SHADE = [1, .55, .72, .72, 1.25, .5];

const linear = colour => { const c = colour?.isColor ? colour : new THREE.Color(PALETTE_OR_HEX(colour)); return [c.r, c.g, c.b]; };
const PALETTE_OR_HEX = c => (typeof c === 'string' && NEON[c]) || c;
const vec = at => Array.isArray(at) ? at : [at.x, at.y ?? 0, at.z];
const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// The neon shapes: strokes in the unit box (y up). The pictograms' own
// outlines serve too (`shapeStrokes`), but the shapes neon is most often bent
// into have hand-drawn tube paths here.
const heartPts = Array.from({ length: 25 }, (_, i) => {
  const t = i / 24 * Math.PI * 2, x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  return [.5 + x / 34, .54 + y / 34];
});
const circle = (x, y, r, n = 16, a0 = 0, a1 = Math.PI * 2) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [x + Math.cos(a) * r, y + Math.sin(a) * r]; });
export const NEON_SHAPES = Object.freeze({
  heart: [heartPts],
  cocktail: [[[.14, .88], [.86, .88], [.5, .46], [.14, .88]], [[.5, .46], [.5, .12]], [[.3, .1], [.7, .1]], circle(.63, .74, .06, 8), [[.66, .8], [.8, .96]]],
  note: [circle(.36, .22, .12, 10), [[.48, .24], [.48, .88], [.68, .72], [.66, .52]]],
  lips: [[[.06, .5], [.24, .67], [.41, .72], [.5, .65], [.59, .72], [.76, .67], [.94, .5], [.76, .33], [.5, .26], [.24, .33], [.06, .5]], [[.14, .5], [.5, .52], [.86, .5]]],
  can: [[[.3, .1], [.7, .1], [.7, .82], [.3, .82], [.3, .1]], [[.36, .9], [.64, .9]], circle(.5, .42, .11, 10)],
  bowl: [[[.08, .44], ...circle(.5, .44, .42, 10, Math.PI, Math.PI * 2).slice(1, -1), [.92, .44], [.08, .44]], ...[.32, .5, .68].map(x => [[x, .54], [x + .05, .64], [x - .03, .75], [x + .03, .88]])],
  moon: [[...circle(.5, .5, .4, 14, Math.PI * .35, Math.PI * 1.85), ...circle(.66, .62, .32, 10, Math.PI * 1.55, Math.PI * .75).slice(1)]],
  eye: [[...Array.from({ length: 9 }, (_, i) => [.06 + .88 * i / 8, .5 + .3 * Math.sin(Math.PI * i / 8)]), ...Array.from({ length: 8 }, (_, i) => [.94 - .88 * (i + 1) / 8, .5 - .3 * Math.sin(Math.PI * (i + 1) / 8)])], circle(.5, .5, .14, 10)],
  ring: [circle(.5, .5, .45, 20)],
  frame: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
  bar: [[[0, .5], [1, .5]]],
  vbar: [[[.5, 0], [.5, 1]]],
});

// A shapeSpec -> { strokes (unit-box polylines), aspect (width / height) }.
//   'heart', 'bolt', ... : NEON_SHAPES, else a pictogram's outline
//   { glyphs: 4 | [i, j, ...], seed, vertical? }: a word of the invented script (vertical: a column of it)
//   { strokes: [[[x, y], ...], ...], aspect }: your own
export function neonStrokes(spec, seed = 0) {
  if (typeof spec === 'string') {
    if (NEON_SHAPES[spec]) return { strokes: NEON_SHAPES[spec], aspect: spec === 'bar' ? 4 : spec === 'vbar' ? .25 : 1 };
    if (PICTOGRAMS[spec]) return { strokes: shapeStrokes(PICTOGRAMS[spec]), aspect: 1 };
    throw new Error(`city-signs: no neon shape "${spec}"`);
  }
  if (spec?.glyphs != null) {
    const list = Array.isArray(spec.glyphs) ? spec.glyphs : Array.from({ length: spec.glyphs }, (_, i) => Math.floor(lumenHash(i, seedInt(spec.seed ?? seed), 41) * GLYPH_COUNT));
    const gap = .2, width = list.length + gap * (list.length - 1), strokes = [];
    // vertical: the glyphs stacked top to bottom (a corner sign's column),
    // one cell wide; aspect is then width / height = 1 / the stack's height.
    if (spec.vertical) {
      list.forEach((g, i) => { for (const s of shapeStrokes(glyphShape(g), { ringSegments: 10 })) strokes.push(s.map(([x, y]) => [x, (list.length - 1 - i) * (1 + gap) / width + y / width])); });
      return { strokes, aspect: 1 / width };
    }
    list.forEach((g, i) => { for (const s of shapeStrokes(glyphShape(g), { ringSegments: 10 })) strokes.push(s.map(([x, y]) => [(i * (1 + gap) + x) / width, y])); });
    return { strokes, aspect: width };
  }
  if (spec?.strokes) return { strokes: spec.strokes, aspect: spec.aspect ?? 1 };
  throw new Error('city-signs: a neon shape is a name, { glyphs } or { strokes }');
}

// ---------------------------------------------------------------------------
// The system.

const NEVER = -1;
const SHOT_STRIDE = 11; // onShot's packed boxes: 9 for the box, then the height range
const SPARK_DARK = 4;   // s a lamp that sparks by itself stays dark

export class CitySigns {
  constructor(view, map, city) {
    this.view = view; this.map = map; this.city = city;
    this.emitters = [];   // this system's emitters (also in city.emitters)
    this.glows = [];      // halo cards that are not emitters (the neon outlines: addNeon glow)
    this.pieces = [null]; // by signId: { kind, signId, centre, right, width, facing, emitters } (0: never breaks)
    this.trafficCount = 0;
    this.finished = false; this.dirty = false;
    this.sign = new Accumulator(LAYOUTS.sign); this.screen = new Accumulator(LAYOUTS.screen); this.traffic = new Accumulator(LAYOUTS.traffic);
    this.seedCounter = 0;
    this.sparks = [];      // lamps that spark by themselves: { id, period, next, x, y, z }
    this.onBreak = null;   // (x, z, piece) a shot broke a piece (the break sound is the sound system's)
    this.onSpark = null;   // (x, y, z) a lamp sparked on its own

    // One break table, one atlas, one palette, shared by every material.
    const breaks = new Float32Array(SIGN.slots * 4).fill(NEVER);
    this.breakTexture = floatTexture(breaks, SIGN.slots, 'lumen-sign-breaks');
    const palette = new Float32Array(SCREEN_PALETTE.length * 3);
    SCREEN_PALETTE.forEach((name, i) => { const c = linear(NEON[name]), g = .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; palette.set(c.map(v => v + (g - v) * SCREEN.desaturate), i * 3); });
    this.atlas = glyphAtlasTexture();
    // The shells' cut table (the hub makes it before us); until it exists, an
    // empty one of ours (nothing cut). Swapping the texture never rebuilds a program.
    this.noCut = floatTexture(new Float32Array(CUT_SLOTS * 3 * 4), CUT_SLOTS, 'lumen-no-cut', 3);
    const u = city.uniforms;
    const black = this.blackMask ||= floatTexture(new Float32Array(4), 1, 'lumen-no-roof'), roofSource = u.roofMask || { value: null };
    this.shared = { time: u.time, signalClock: { value: 0 }, sag: u.sag, maskBounds: u.maskBounds || { value: new THREE.Vector4(-1, -1, 1, 1) }, roofMask: { get value() { return roofSource.value || black; }, set value(v) { roofSource.value = v; } }, wetness: u.wetness, signBreaks: { value: this.breakTexture }, cityCut: { value: city.cutTexture || this.noCut },
      atlas: { value: this.atlas }, palette: { value: palette }, haloScale: { value: 1 },
      // The shells' scoop capsules (the hub's; a bare test's own, all off).
      scoop: cutUniforms(u) }; // (the shells' rule: world/city-cut.js, filled by render/city-shells.js each frame)
    this.breaks = breaks;
    this.materials = { sign: signMaterial(this.shared), screen: screenMaterial(this.shared), traffic: trafficMaterial(this.shared), halo: haloMaterial(this.shared), pool: poolMaterial(this.shared) };

    // The meshes exist (with every attribute) from the start, so the warm-up
    // builds all five programs whatever the map adds later.
    this.meshes = {};
    for (const kind of ['sign', 'screen', 'traffic']) {
      const mesh = new THREE.Mesh(new Accumulator(LAYOUTS[kind]).geometry(), this.materials[kind]);
      mesh.name = `lumen-${kind}s`; mesh.matrixAutoUpdate = false;
      mesh.layers.enable(BRIGHT_LAYER);
      this.meshes[kind] = mesh; view.scene?.add(mesh);
    }
    for (const kind of ['halo', 'pool']) {
      const mesh = new THREE.Mesh(cardGeometry([]), this.materials[kind]);
      mesh.name = `lumen-${kind}s`; mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;
      mesh.renderOrder = kind === 'halo' ? 4 : 2;
      // The mirror reflects the glow; the pools lie on the ground (GROUND_LAYER
      // only: the main camera draws that layer, the mirror never does).
      if (kind === 'halo') mesh.layers.enable(BRIGHT_LAYER); else mesh.layers.set(GROUND_LAYER);
      this.meshes[kind] = mesh; view.scene?.add(mesh);
    }

    // The power sag is ours unless the map turns it off.
    this.ownsSag = map.city?.sag !== false;

    // The map's own list, or the demo set on the test map.
    const list = Array.isArray(map.citySigns) && Array.isArray(map.cityVehicleLights) ? [...map.citySigns, ...map.cityVehicleLights] : map.citySigns; // (the cars' lights too, stage 4)
    if (Array.isArray(list)) { this.addList(list); this.finish(); }
    else if (map.city?.signs === true) { demoSigns(this, map); this.finish(); }
    this.setQuality(view.qualityName || 'balanced');
  }

  now() { return this.city.uniforms.time.value; }
  // The next builder's pieces belong to building cut slot `slot` (0: free-
  // standing) and are judged against its first floor at height `y`.
  // p: its centre ([x, y, z]; dy added to its height), for the shells' scoop.
  // wall: the facing of the wall it hangs on (on one, its `at` on the wall's
  // outer face), else null: its anchor (world/city-cut.js CUT.wall, rule 6)
  // CUT.wall.back m in behind the wall's line, as a wall's dressing's.
  mount(slot, p, dy = 0, wall = null) {
    let ax = p[0], az = p[2];
    if (slot && wall !== null) { const k = CUT.wall.back + FACADES.face; ax -= Math.sin(wall) * k; az -= Math.cos(wall) * k; }
    const c = [slot || 0, p[1] + dy, p[0], p[2], ax, az]; this.sign.cut = this.screen.cut = this.traffic.cut = c; return c;
  }
  // The cut table as the CPU sees it (the light pool: a light on a cut storey goes out).
  cutAway(cut) {
    const slot = cut?.[0]; if (!slot) return false;
    const data = this.shared.cityCut.value?.image?.data; if (!data) return false;
    // (row 0: x how far it is hidden from the top down, z its first floor, w its top: world/city-cut.js hideAt)
    const x = data[slot * 4], top = data[slot * 4 + 3] + 3, low = data[slot * 4 + 2] + CUT.above;
    return (x > .001 && cut[1] > top + (low - top) * x) || !!this.city.shells?.cut?.hides?.(slot, cut[2], cut[1], cut[3], cut[4], cut[5]);
  }
  nextSeed() { return lumenHash(++this.seedCounter, 7, 99); }
  touch() { if (this.finished) this.dirty = true; }

  // A breakable id, or 0 when the table is full (the piece never breaks).
  allocSign(piece) {
    if (piece.breakable === false) return 0;
    if (this.pieces.length >= SIGN.slots) { if (!this.warnedFull) console.warn('city-signs: the break table is full; later signs never break'); this.warnedFull = true; return 0; }
    piece.signId = this.pieces.length; this.pieces.push(piece);
    return piece.signId;
  }

  // An emitter for the light pool, the mirror's streak cards and our cards.
  // source: [kind, a, b, c] (see CARD_GLSL). halo: radius (m) or 0; pool:
  // { x, z, radius } or null. intensity: light cast (1 = one street lamp, the
  // light pool's unit); glow: the halo's and pool card's strength. Read by
  // the light pool (light-pool.js) as
  //   level   a number, now: the flicker, blink or phase and a shot sign's
  //           spark and dark, as the shaders draw them (not the sag: the pool
  //           dims its lights for that itself)
  //   broken  true while a shot sign is out
  // both getters, computed when read, nothing allocated.
  emit(e) {
    const emitter = this.city.addEmitter({
      x: e.at[0], y: e.at[1], z: e.at[2], colour: new THREE.Color(...e.colour), intensity: e.intensity, glow: e.glow ?? e.intensity, reach: e.reach, kind: e.kind,
      piece: e.piece ?? 0, signId: e.signId ?? 0, changing: !!e.pool, facing: e.facing ?? 0, source: e.source, halo: e.halo || 0, rect: e.rect || null, pool: e.pool || null, cut: e.cut || this.sign.cut,
    });
    const signs = this;
    Object.defineProperties(emitter, {
      level: { get() { return signs.cutAway(emitter.cut) ? 0 : signs.emitterLevel(emitter, signs.now(), false, signs.shared.signalClock.value); }, enumerable: true },
      broken: { get() { return emitter.signId > 0 && signs.isBroken(emitter.signId); }, enumerable: true },
    });
    this.emitters.push(emitter);
    return emitter;
  }
  // An emitter's level at `time` (withSag: as the shaders draw it, the sag
  // included; a signal's phase at `signal`, the weather clock in play).
  emitterLevel(e, time = this.now(), withSag = true, signal = time) {
    const src = e.source, kind = src[0], a = src[1], b = src[2], c = src[3], sag = withSag ? this.city.uniforms.sag.value : 0;
    if (kind === 0) return signModeLevel(a, b, time) * breakLevel(this.shotAt(c), this.backAt(c), time) * (1 - SIGN.sagDim * sag);
    if (kind === 1) { const s = screenBreakState(this.shotAt(c), this.backAt(c), time); return (s === 2 ? 0 : s ? .5 : 1) * (1 - SCREEN.sagDim * sag); }
    const state = Math.floor(c / 4);
    return trafficLevel(a, b, c - state * 4, state, signal) * (1 - TRAFFIC.sagDim * sag);
  }
  shotAt(id) { return id > 0 ? this.breaks[id * 4] : NEVER; }
  backAt(id) { return id > 0 ? this.breaks[id * 4 + 1] : NEVER; }

  // -------------------------------------------------------------------------
  // The builders. Positions in world metres; `at` [x, y, z] or { x, y, z }.
  // A wall piece's `at` is the point on the wall's face at its centre height;
  // it stands off the wall and leans back `tilt` degrees (default SIGN.tilt)
  // with its top edge at the wall. mount: 'free' puts `at` at its centre.
  // building: the cut slot of the building it is fixed to
  // (city.shells.slots.get(id)); 0 or absent: free-standing, never cut.

  // Neon: tubes along the shape's strokes over a dark backing. Returns its
  // signId (0 if unbreakable).
  // glow (with emitter false): a halo card of its own and nothing else (the
  // neon outline signs, owner 2026-09-30: they glow in their own colour but
  // light nothing: no light-pool light, no facade wash, no ground pool).
  addNeon(shape, { at, x, y, z, facing = 0, tilt = SIGN.tilt, size = 1, colour = 'pink', intensity = SIGN.intensity, mode = 'steady', seed, backing = true, breakable = true, emitter = true, glow = false, mount = 'wall', building = 0, poolReach, spark = 0 } = {}) {
    this.touch(); this.mount(building, vec(at ?? [x, y, z]), 0, mount === 'wall' ? facing : null);
    seed ??= this.nextSeed();
    const { strokes: full, aspect } = neonStrokes(shape, seed), w = size * aspect, h = size, tube = SIGN.tube;
    const outline = glow && !emitter, strokes = full.map(st => simplifyStroke(st, w, h, outline ? NEON_OUTLINE.simplify : SIGN.simplify));
    const t = tilt * DEG, F = this.mountFrame(vec(at ?? [x, y, z]), facing, t, h + 2 * SIGN.backingMargin, mount);
    const piece = { kind: 'neon', centre: null, right: F.r, width: w, facing, breakable };
    const signId = this.allocSign(piece);
    const tint = linear(colour), core = tint.map(v => v + (1 - v) * SIGN.core);
    const modeNumber = mode === 'dead-segment' ? SIGN_MODES.steady : SIGN_MODES[mode] ?? 0;
    // A 'dead-segment' sign: about a third of its strokes out (at least one).
    const dead = new Set();
    if (mode === 'dead-segment') {
      const count = Math.max(1, Math.round(strokes.length * SIGN.deadShare)), order = strokes.map((_, i) => i).sort((a, b) => lumenHash(a, seedInt(seed), 51) - lumenHash(b, seedInt(seed), 51));
      for (let i = 0; i < Math.min(count, strokes.length - 1 || 1); i++) dead.add(order[i]);
    }
    const back = backing ? SIGN.backingDepth : 0, z0 = back + .005, z1 = z0 + SIGN.tubeDepth;
    strokes.forEach((stroke, si) => {
      const m = dead.has(si) ? SIGN_MODES.dead : modeNumber;
      const front = { tint: core, intensity, seed, mode: m, signId }, side = { tint, intensity, seed, mode: m, signId };
      for (let i = 1; i < stroke.length; i++) {
        const ax = (stroke[i - 1][0] - .5) * w, ay = (stroke[i - 1][1] - .5) * h, bx = (stroke[i][0] - .5) * w, by = (stroke[i][1] - .5) * h;
        const len = Math.hypot(bx - ax, by - ay); if (len < 1e-4) continue;
        orientedBox(this.sign, F, (ax + bx) / 2, (ay + by) / 2, (bx - ax) / len, (by - ay) / len, len / 2 + tube / 2, tube / 2, z0, z1, face => face === 0 ? front : side, backing || outline ? tubeSkip((bx - ax) / len, (by - ay) / len) : 0); // (an outline's tubes lie on the wall: no back either)
      }
    });
    if (backing) this.addBacking(F, w / 2 + SIGN.backingMargin, h / 2 + SIGN.backingMargin, 0, back, signId);
    piece.centre = P(F, 0, 0, z1);
    this.extent(piece, F, w / 2 + SIGN.backingMargin, h / 2 + SIGN.backingMargin, back + SIGN.tubeDepth);
    if (spark > 0 && signId) this.sparks.push({ id: signId, period: spark, next: spark * (.3 + .7 * lumenHash(signId, 5, 71)), x: piece.centre[0], y: piece.centre[1], z: piece.centre[2] });
    if (emitter) {
      const changing = mode !== 'steady' && mode !== 'dead-segment';
      this.emit({ at: P(F, 0, 0, z1 + HALO.lift), colour: tint, intensity: SIGN.light * Math.min(1.5, size) * intensity / SIGN.intensity, glow: intensity, reach: Math.min(8, Math.max(3, size * 3)), kind: 'neon', piece: signId, signId, facing,
        source: [0, modeNumber, seed, signId], halo: .3 + Math.max(w, h) * .3, pool: changing ? this.poolSpot(F, poolReach ?? Math.min(8, Math.max(3, size * 3)), undefined, w / 2) : null,
        rect: { centre: P(F, 0, 0, z1 + HALO.lift), right: F.r.map(v => v * w / 2), up: F.u.map(v => v * h * .4) } });
    } else if (glow) {
      // A thin halo hugging the tubes (NEON_OUTLINE.halo), in the halo layer's
      // one draw; not an emitter (city.emitters: the light pool, the wash).
      const centre = P(F, 0, 0, z1 + HALO.lift), c = new THREE.Color(...tint);
      this.glows.push({ x: centre[0], y: centre[1], z: centre[2], colour: c, glow: intensity * NEON_OUTLINE.haloGlow, halo: NEON_OUTLINE.halo + Math.min(w, h) * NEON_OUTLINE.haloPerMetre,
        source: [0, modeNumber, seed, signId], cut: this.sign.cut, rect: { centre, right: F.r.map(v => v * w / 2), up: F.u.map(v => v * h / 2) } });
    }
    return signId;
  }

  // A lit panel: a lightbox, a shop fluorescent, a window slit (emitter off:
  // the facades have hundreds). Returns its signId.
  addPanel({ at, x, y, z, facing = 0, tilt = 0, w = 1, h = .3, depth = .05, colour = 'warmWhite', intensity = 1, mode = 'steady', seed, backing = false, breakable = false, emitter = false, mount = 'wall', building = 0 } = {}) {
    this.touch(); this.mount(building, vec(at ?? [x, y, z]), 0, mount === 'wall' ? facing : null);
    seed ??= this.nextSeed();
    const F = this.mountFrame(vec(at ?? [x, y, z]), facing, tilt * DEG, h, mount), tint = linear(colour);
    const piece = { kind: 'panel', centre: P(F, 0, 0, depth), right: F.r, width: w, facing, breakable };
    const signId = this.allocSign(piece), m = SIGN_MODES[mode] ?? 0;
    const back = backing ? .03 : 0;
    rectBox(this.sign, F, -w / 2, w / 2, -h / 2, h / 2, back, back + depth, () => ({ tint, intensity, seed, mode: m, signId }));
    if (backing) this.addBacking(F, w / 2 + .05, h / 2 + .05, 0, back, signId);
    this.extent(piece, F, w / 2 + (backing ? .05 : 0), h / 2 + (backing ? .05 : 0), back + depth);
    if (emitter) this.emit({ at: P(F, 0, 0, depth + HALO.lift), colour: tint, intensity: SIGN.light * Math.min(1.5, Math.max(w, h)) * intensity / SIGN.intensity, glow: intensity, reach: Math.max(3, w * 2), kind: 'panel', piece: signId, signId, facing,
      source: [0, m, seed, signId], halo: Math.max(w, h) * .25 + .25, pool: m !== SIGN_MODES.steady ? this.poolSpot(F, Math.max(3, w * 2), undefined, w / 2) : null,
      rect: { centre: P(F, 0, 0, depth + HALO.lift), right: F.r.map(v => v * w / 2), up: F.u.map(v => v * h / 2) } });
    return signId;
  }

  // A screen: a dark bezel (sign material) and the lit face (screen
  // material). mode: SCREEN_MODES name; palette: [ink, field] names from NEON
  // (or indices). Returns its signId (the centrepiece is never shot out).
  addScreen({ at, x, y, z, w = 2, h = 1.2, facing = 0, tilt = SIGN.tilt, mode = 'glyphs', seed, palette, breakable = true, emitter = true, mount = 'wall', building = 0 } = {}) {
    this.touch(); this.mount(building, vec(at ?? [x, y, z]), 0, mount === 'wall' ? facing : null);
    seed ??= this.nextSeed();
    const modeNumber = SCREEN_MODES[mode] ?? 0, centre = modeNumber === SCREEN_MODES.centrepiece;
    const F = this.mountFrame(vec(at ?? [x, y, z]), facing, tilt * DEG, h + 2 * SCREEN.bezel, mount);
    const piece = { kind: 'screen', centre: null, right: F.r, width: w, facing, breakable: breakable && !centre };
    const signId = this.allocSign(piece);
    const [ink, field] = screenPalette(palette, seed), paletteValue = ink + field * SCREEN_PALETTE.length;
    const d = SCREEN.bezelDepth, b = SCREEN.bezel;
    this.addBacking(F, w / 2 + b, h / 2 + b, 0, d, signId);
    const values = { mode: modeNumber, seed, palette: paletteValue, signId, screenSize: [w, h] }, zf = d + .004;
    this.screen.quad(P(F, -w / 2, -h / 2, zf), P(F, w / 2, -h / 2, zf), P(F, w / 2, h / 2, zf), P(F, -w / 2, h / 2, zf), values);
    piece.centre = P(F, 0, 0, zf);
    this.extent(piece, F, w / 2 + b, h / 2 + b, d);
    // A cracked, dark screen gives no light. A screen's light is the colour
    // most of its face shows: the field on the full-bleed modes, else the ink.
    if (emitter && modeNumber !== SCREEN_MODES.cracked) {
      const fullBleed = modeNumber === SCREEN_MODES.centrepiece || modeNumber === SCREEN_MODES.wipe;
      this.emit({ at: P(F, 0, 0, zf + HALO.lift), colour: linear(NEON[SCREEN_PALETTE[fullBleed ? field : ink]]), intensity: SCREEN.intensity, reach: Math.min(12, Math.max(4, Math.max(w, h) * 1.4)), kind: 'screen',
        piece: signId, signId, facing, source: [1, 0, seed, signId], halo: SCREEN.glow + Math.max(w, h) * SCREEN.glowPerMetre, pool: null,
        rect: { centre: P(F, 0, 0, d - .01), right: F.r.map(v => v * w / 2), up: F.u.map(v => v * h / 2) } });
    }
    return signId;
  }

  // A signal head: housing, three round lenses (red over yellow over green)
  // under visors. group: 0 or 1 (the cross direction); state: 'normal' |
  // 'blink' | 'dead'. Returns a traffic id.
  addSignalHead({ at, x, y, z, facing = 0, tilt = 20, group = 0, phaseOffset = 0, state = 'normal', emitter = true, building = 0 } = {}) {
    this.touch(); this.mount(building, vec(at ?? [x, y, z]));
    const F = signFrame(vec(at ?? [x, y, z]), facing, tilt * DEG), st = SIGNAL_STATES[state] ?? 0, id = ++this.trafficCount;
    const hw = .17, hh = .5, d = .24, housing = linear(SIGN.housingColour);
    rectBox(this.traffic, F, -hw, hw, -hh, hh, -d, 0, face => ({ tint: housing.map(v => v * HOUSING_SHADE[face]), lamp: TRAFFIC_LAMPS.housing }));
    const lamps = [['red', .31], ['yellow', 0], ['green', -.31]], r = .12;
    for (const [name, ly] of lamps) {
      const lamp = TRAFFIC_LAMPS[name], tint = linear(TRAFFIC.colours[name]), values = { tint, lamp, phaseOffset, group, signalMode: st };
      this.traffic.quad(P(F, -r, ly - r, .005), P(F, r, ly - r, .005), P(F, r, ly + r, .005), P(F, -r, ly + r, .005), values);
      // The visor: a thin hood over the lens.
      rectBox(this.traffic, F, -r - .02, r + .02, ly + r - .01, ly + r + .02, 0, .16, face => ({ tint: housing.map(v => v * HOUSING_SHADE[face] * .8), lamp: TRAFFIC_LAMPS.housing }));
      if (emitter) this.emit({ at: P(F, 0, ly, .3), colour: tint, intensity: 1, glow: .65, reach: 4, kind: 'signal', piece: id, facing, source: [2, lamp, phaseOffset, group + 4 * st],
        halo: .55, pool: st === SIGNAL_STATES.dead ? null : this.poolSpot(F, 4, 3, 0, true) });
    }
    return id;
  }

  // A pedestrian head: walking figure over raised hand, from the atlas.
  addPedHead({ at, x, y, z, facing = 0, tilt = 20, group = 0, phaseOffset = 0, state = 'normal', emitter = true, building = 0 } = {}) {
    this.touch(); this.mount(building, vec(at ?? [x, y, z]));
    const F = signFrame(vec(at ?? [x, y, z]), facing, tilt * DEG), st = SIGNAL_STATES[state] ?? 0, id = ++this.trafficCount;
    const hw = .18, hh = .36, d = .2, housing = linear(SIGN.housingColour), s = .15;
    rectBox(this.traffic, F, -hw, hw, -hh, hh, -d, 0, face => ({ tint: housing.map(v => v * HOUSING_SHADE[face]), lamp: TRAFFIC_LAMPS.housing }));
    for (const [name, ly, pic] of [['walk', .18, 'walk'], ['stop', -.18, 'hand']]) {
      const lamp = TRAFFIC_LAMPS[name], tint = linear(TRAFFIC.colours[name]), R = pictogramRect(pic);
      // uv in the atlas: the cell's top row is v0 (the drawing is y-up).
      const uvs = [[R.u0, R.v1], [R.u1, R.v1], [R.u1, R.v0], [R.u0, R.v0]];
      this.traffic.quad(P(F, -s, ly - s, .005), P(F, s, ly - s, .005), P(F, s, ly + s, .005), P(F, -s, ly + s, .005), { tint, lamp, phaseOffset, group, signalMode: st }, uvs);
      if (emitter) this.emit({ at: P(F, 0, ly, .25), colour: tint, intensity: .7, reach: 2.5, kind: 'ped', piece: id, facing, source: [2, lamp, phaseOffset, group + 4 * st], halo: .4, pool: null });
    }
    return id;
  }

  // A street lamp: optional pole and arm (unlit dark metal) and a housing
  // with its glowing LED lens underneath, a little wider than the housing so
  // the glow shows from above. at: the pole's foot; facing: the arm's way.
  // colour: 'coldWhite' (LED) or 'sodium' (the industrial west). Returns its signId.
  addLamp({ at, x, y = 0, z, facing = 0, height = 7, arm = 1.6, colour = 'coldWhite', intensity = 1.9, mode = 'steady', seed, pole = true, breakable = true, emitter = true, building = 0, spark = 0 } = {}) {
    this.touch(); this.mount(building, vec(at ?? [x, y, z]), height);
    seed ??= this.nextSeed();
    const foot = vec(at ?? [x, y, z]), F = signFrame(foot, facing, 0), m = SIGN_MODES[mode] ?? 0, tint = linear(colour);
    const piece = { kind: 'lamp', centre: null, right: F.r, width: .7, facing, breakable };
    const signId = this.allocSign(piece);
    const metal = linear(SIGN.housingColour), metalFaces = face => ({ tint: metal.map(v => v * HOUSING_SHADE[face]), mode: SIGN_MODES.backing, signId });
    // The frame's y is up the pole, z out along the arm.
    if (pole) {
      rectBox(this.sign, F, -.07, .07, 0, height, -.07, .07, metalFaces);
      rectBox(this.sign, F, -.045, .045, height - .1, height - .02, 0, arm, metalFaces);
    }
    const hz = arm - .05, top = height - .02;
    rectBox(this.sign, F, -.16, .16, top - .14, top + .02, hz - .42, hz, metalFaces);
    rectBox(this.sign, F, -.19, .19, top - .2, top - .14, hz - .46, hz + .03, () => ({ tint, intensity, seed, mode: m, signId }));
    const head = P(F, 0, top - .22, hz - .21);
    piece.centre = head;
    this.extent(piece, F, .3, .3, hz);
    // A sparking lamp (`spark`: about every that many seconds): the shot
    // sign's spark, dark and relight, played on its own (update).
    if (spark > 0 && signId) this.sparks.push({ id: signId, period: spark, next: spark * (.3 + .7 * lumenHash(signId, 5, 71)), x: head[0], y: head[1], z: head[2] });
    if (emitter) this.emit({ at: head, colour: tint, intensity: 1, reach: 9, kind: 'lamp', piece: signId, signId, facing, source: [0, m, seed, signId], halo: 1.3,
      pool: m !== SIGN_MODES.steady ? { x: head[0] + F.flat[0], z: head[2] + F.flat[2], radius: 4, rx: 5.6, rz: 3.8, ax: F.r[0], az: F.r[2] } : null });
    return signId;
  }

  // A bare pole with an optional mast arm (dark metal, unlit, in the sign
  // mesh): for signal heads and the demo; the street furniture brings its own.
  addPole({ at, x, y = 0, z, facing = 0, height = 6, arm = 0, width = .14, building = 0 } = {}) {
    this.touch(); this.mount(building, vec(at ?? [x, y, z]), height / 2);
    const F = signFrame(vec(at ?? [x, y, z]), facing, 0), metal = linear(SIGN.housingColour), w = width / 2;
    const faces = face => ({ tint: metal.map(v => v * HOUSING_SHADE[face]), mode: SIGN_MODES.backing, signId: 0 });
    rectBox(this.sign, F, -w, w, 0, height, -w, w, faces);
    if (arm > 0) rectBox(this.sign, F, -w * .7, w * .7, height - .3, height - .18, 0, arm, faces);
    return 0;
  }

  // The map's list: [{ kind: 'neon' | 'panel' | 'screen' | 'signal' | 'ped' | 'lamp' | 'pole', shape?, ...options }].
  addList(list) {
    const slots = this.city.shells?.slots;
    for (const item of list) {
      // The map's data cannot reach the view's cut slots: a piece names its
      // building (`buildingId`) and is resolved here.
      const s = item.buildingId ? { ...item, building: slots?.get(item.buildingId) || 0 } : item;
      if (s.kind === 'neon') this.addNeon(s.shape, s);
      else if (s.kind === 'panel') this.addPanel(s);
      else if (s.kind === 'screen') this.addScreen(s);
      else if (s.kind === 'signal') this.addSignalHead(s);
      else if (s.kind === 'ped') this.addPedHead(s);
      else if (s.kind === 'lamp') this.addLamp(s);
      else if (s.kind === 'pole') this.addPole(s);
      else throw new Error(`city-signs: unknown kind "${s.kind}"`);
    }
  }

  // A mounting frame for a piece `height` tall.
  mountFrame(at, facing, tilt, height, mount) {
    const F = signFrame(at, facing, tilt);
    if (mount === 'wall') { const out = SIGN.standoff + Math.sin(tilt) * height / 2; F.o[0] += F.flat[0] * out; F.o[2] += F.flat[2] * out; }
    return F;
  }
  addBacking(F, hw, hh, z0, z1, signId) {
    const dark = linear(SIGN.backingColour);
    // (its front and its top: the ends and the underside are a few centimetres deep and out of sight)
    rectBox(this.sign, F, -hw, hw, -hh, hh, z0, z1, face => ({ tint: dark.map(v => v * HOUSING_SHADE[face]), mode: SIGN_MODES.backing, signId }), NO_BACK | 1 << 2 | 1 << 3 | 1 << 5);
  }
  // Where a changing light's pool lies: on the street in front of it. Never a
  // round orb: a wide piece (half: its half width) throws a wash along its
  // wall, hugging it; a signal (lengthwise) a streak down the lane it faces.
  poolSpot(F, reach, ahead = reach * .45, half = 0, lengthwise = false) {
    const radius = reach * .65, spot = { x: F.o[0] + F.flat[0] * ahead, z: F.o[2] + F.flat[2] * ahead, radius };
    if (lengthwise) { const l = Math.hypot(F.flat[0], F.flat[2]) || 1; Object.assign(spot, { rx: radius * 1.2, rz: radius * .6, ax: F.flat[0] / l, az: F.flat[2] / l }); }
    else {
      const l = Math.hypot(F.r[0], F.r[2]) || 1, rz = radius * .75, rx = Math.min(7, Math.max(half, radius * .3) + radius * .85), out = Math.min(ahead, rz * .55);
      Object.assign(spot, { x: F.o[0] + F.flat[0] * out, z: F.o[2] + F.flat[2] * out, rx, rz, ax: F.r[0] / l, az: F.r[2] / l });
    }
    return spot;
  }

  // Where a piece can be hit by a round (onShot): its height range and the
  // rectangle it covers on the ground, in its own frame (origin o, `right`
  // along the wall, `flat` out from it): half its width, and how far out it
  // reaches at the bottom of a leaning sign. hw, hh: half width and height
  // of its backing; depth: how far it stands off its own back.
  extent(piece, F, hw, hh, depth) {
    let y0 = Infinity, y1 = -Infinity, o0 = Infinity, o1 = -Infinity;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const z of [0, depth]) {
      const p = P(F, sx * hw, sy * hh, z);
      y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
      const out = (p[0] - F.o[0]) * F.flat[0] + (p[2] - F.o[2]) * F.flat[2];
      o0 = Math.min(o0, out); o1 = Math.max(o1, out);
    }
    piece.y0 = y0; piece.y1 = y1;
    piece.box = [F.o[0], F.o[2], F.r[0], F.r[2], F.flat[0], F.flat[2], hw, o0, o1];
  }

  // -------------------------------------------------------------------------
  // Build the merged meshes and the card layers. Call once after the map's
  // signs are added (again after adding more: it rebuilds).
  finish() {
    for (const kind of ['sign', 'screen', 'traffic']) {
      const mesh = this.meshes[kind], old = mesh.geometry;
      mesh.geometry = this[kind].geometry(); old.dispose();
    }
    const halos = [...this.emitters.filter(e => e.halo > 0), ...this.glows], pools = this.emitters.filter(e => e.pool);
    for (const [kind, list] of [['halo', halos], ['pool', pools]]) {
      const mesh = this.meshes[kind], old = mesh.geometry;
      mesh.geometry = cardGeometry(list, kind === 'pool'); old.dispose();
    }
    // What a round can break: every breakable piece with a box, packed
    // (9 numbers of the box, the height range) so onShot allocates nothing.
    const shootable = [];
    for (let id = 1; id < this.pieces.length; id++) { const p = this.pieces[id]; if (p.breakable && p.box && p.kind !== 'lamp') shootable.push(id); }
    this.shootIds = Int32Array.from(shootable); this.shootN = shootable.length;
    this.shotBoxes = new Float32Array(Math.max(1, shootable.length) * SHOT_STRIDE);
    shootable.forEach((id, k) => { const p = this.pieces[id]; this.shotBoxes.set(p.box, k * SHOT_STRIDE); this.shotBoxes[k * SHOT_STRIDE + 9] = p.y0; this.shotBoxes[k * SHOT_STRIDE + 10] = p.y1; });
    this.finished = true; this.dirty = false;
    this.counts = { signTriangles: this.sign.triangles, screenTriangles: this.screen.triangles, trafficTriangles: this.traffic.triangles, halos: halos.length, pools: pools.length, emitters: this.emitters.length, signs: this.pieces.length - 1 };
    return this.counts;
  }

  setQuality(name) {
    this.quality = name;
    const scale = HALO.scale[name] ?? 1;
    this.shared.haloScale.value = scale;
    this.meshes.halo.visible = scale > 0;
    this.meshes.pool.visible = POOLS.presets[name] ?? true;
  }

  update(frame) {
    if (!this.finished || this.dirty) this.finish();
    const cut = this.city.cutTexture;
    if (cut && this.shared.cityCut.value !== cut) this.shared.cityCut.value = cut;
    if (this.ownsSag) this.city.uniforms.sag.value = sagAt(frame.clock);
    this.shared.signalClock.value = frame.clock;
    if (this.warming) { this.warming = false; this.setQuality(this.quality); }
    if (this.sparks.length) this.tickSparks(this.now());
  }

  // A sparking lamp plays the shot sign's spark, dark and relight on its
  // own, every so often (a few seconds dark, then back with a stutter).
  tickSparks(now) {
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (now < s.next) continue;
      s.next = now + s.period * (.75 + .5 * lumenHash(Math.floor(now), s.id, 72));
      if (this.breakSign(s.id, now, SPARK_DARK)) this.onSpark?.(s.x, s.y, s.z);
    }
  }

  // The warm-up's draw: the cards too, whatever the preset (the next update
  // puts the preset's visibility back).
  warm() { this.meshes.halo.visible = this.meshes.pool.visible = true; this.warming = true; }

  // -------------------------------------------------------------------------
  // Shooting (decision 20.5). Returns the piece ({ kind, centre [x, y, z],
  // facing }) for the sparks and the break sound (about 15 m), or null when
  // it cannot break now (unbreakable, or already out).
  breakSign(id, now = this.now(), backAfter = SIGN.restoreAfter) {
    const piece = this.pieces[id];
    if (!piece || !piece.breakable || this.isBroken(id, now)) return null;
    this.breaks[id * 4] = now; this.breaks[id * 4 + 1] = backAfter == null ? now : now + backAfter;
    this.breakTexture.needsUpdate = true;
    return piece;
  }
  // Relight now (the shader stutters it back on).
  restoreSign(id, now = this.now()) {
    if (!this.pieces[id] || !this.isBroken(id, now)) return false;
    this.breaks[id * 4 + 1] = now;
    this.breakTexture.needsUpdate = true;
    return true;
  }
  isBroken(id, now = this.now()) {
    const shot = this.shotAt(id), back = this.backAt(id);
    return shot >= 0 && now >= shot && !(back > shot && now >= back);
  }
  // The breakable piece whose face spans the wall point (x, z) within
  // `reach` m (a shot that hits a wall under a sign), or 0. Intact ones only.
  signNear(x, z, reach = .5, now = this.now()) {
    let best = 0, bestD = reach;
    for (let id = 1; id < this.pieces.length; id++) {
      const p = this.pieces[id];
      if (!p.breakable || !p.centre || this.isBroken(id, now)) continue;
      const dx = x - p.centre[0], dz = z - p.centre[2], along = dx * p.right[0] + dz * p.right[2];
      const half = p.width / 2, off = Math.max(0, Math.abs(along) - half), across = Math.abs(dx * p.right[2] - dz * p.right[0]);
      const d = Math.hypot(off, across);
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  // A round's path this step (city-features.js shot): break every intact
  // breakable piece the segment (ax, az)-(bx, bz) crosses. Rounds fly at 0.7 to
  // 1.3 m and a sign hangs above them, so what a round can reach is the data's
  // (a piece is `breakable` only if its lowest edge is under 2.4 m, and not
  // near a base or a doorway): a round breaks it whatever its height, unless
  // it flies over the piece (y above its top). `onBreak(x, z, piece)` follows
  // each break.
  onShot(ax, az, bx, bz, y = 1.28) {
    const n = this.shootN | 0; if (!n) return;
    const boxes = this.shotBoxes, now = this.now(), reach = SIGN.shotMargin;
    for (let k = 0; k < n; k++) {
      const o = k * SHOT_STRIDE;
      if (y > boxes[o + 10] + reach) continue; // (a round over the piece)
      const ox = boxes[o], oz = boxes[o + 1], rx = boxes[o + 2], rz = boxes[o + 3], fx = boxes[o + 4], fz = boxes[o + 5], hw = boxes[o + 6] + reach;
      const u0 = (ax - ox) * rx + (az - oz) * rz, v0 = (ax - ox) * fx + (az - oz) * fz, u1 = (bx - ox) * rx + (bz - oz) * rz, v1 = (bx - ox) * fx + (bz - oz) * fz;
      // Liang-Barsky: the segment against the box [-hw, hw] x [out0, out1] (a margin all round).
      let t0 = 0, t1 = 1;
      const du = u1 - u0, dv = v1 - v0, lo = boxes[o + 7] - reach, hi = boxes[o + 8] + reach;
      if (Math.abs(du) < 1e-9) { if (u0 < -hw || u0 > hw) continue; } else { const a = (-hw - u0) / du, b = (hw - u0) / du; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); }
      if (Math.abs(dv) < 1e-9) { if (v0 < lo || v0 > hi) continue; } else { const a = (lo - v0) / dv, b = (hi - v0) / dv; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); }
      if (t0 > t1) continue;
      const id = this.shootIds[k];
      if (this.isBroken(id, now)) continue;
      const piece = this.breakSign(id, now);
      if (piece) this.onBreak?.(piece.centre[0], piece.centre[2], piece);
    }
  }

  dispose() {
    for (const mesh of Object.values(this.meshes)) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    for (const m of Object.values(this.materials)) m.dispose();
    this.atlas.dispose(); this.breakTexture.dispose(); this.noCut.dispose();
  }
}

// A width x 1 RGBA float table read with texelFetch (exact texels, no filtering).
const CUT_SLOTS = SHELLS.slots; // the shells' cut table: a slot per column, three rows
function floatTexture(data, width, name, height = 1) {
  const t = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false; t.name = name; t.needsUpdate = true;
  return t;
}

// A screen's [ink, field] palette indices.
function screenPalette(palette, seed) {
  const index = p => typeof p === 'number' ? p : PALETTE_INDEX[p] ?? 0;
  if (Array.isArray(palette)) return [index(palette[0]), index(palette[1] ?? palette[0])];
  // Default: two of the signature neons by the seed.
  const lead = ['pink', 'lemon', 'blue', 'green', 'red', 'lime', 'warmWhite', 'coldWhite'];
  const a = Math.floor(lumenHash(seedInt(seed), 1, 61) * lead.length), b = (a + 1 + Math.floor(lumenHash(seedInt(seed), 2, 61) * (lead.length - 1))) % lead.length;
  return [PALETTE_INDEX[lead[a]], PALETTE_INDEX[lead[b]]];
}

// The card layer: one quad instanced per emitter. pool: ground spots.
function cardGeometry(list, pool = false) {
  const g = new THREE.InstancedBufferGeometry(), n = Math.max(1, list.length);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const at = new Float32Array(n * 4), colour = new Float32Array(n * 4), source = new Float32Array(n * 4), right = new Float32Array(n * 3), up = new Float32Array(n * 3), cut = new Float32Array(n * 4), wall = new Float32Array(n * 2);
  list.forEach((e, i) => {
    if (pool) at.set([e.pool.x, POOLS.lift, e.pool.z, e.pool.radius * POOLS.size], i * 4);
    else if (e.rect) at.set([...e.rect.centre, e.halo], i * 4);
    else at.set([e.x, e.y, e.z, e.halo], i * 4);
    colour.set([e.colour.r, e.colour.g, e.colour.b, e.glow ?? e.intensity], i * 4);
    source.set(e.source, i * 4);
    if (!pool && e.rect) { right.set(e.rect.right, i * 3); up.set(e.rect.up, i * 3); }
    else if (pool && e.pool.rx) { const rx = e.pool.rx * POOLS.size, rz = e.pool.rz * POOLS.size; right.set([e.pool.ax * rx, 0, e.pool.az * rx], i * 3); up.set([-e.pool.az * rz, 0, e.pool.ax * rz], i * 3); }
    if (e.cut) { cut.set(e.cut.slice(0, 4), i * 4); wall.set(cutWall(e.cut), i * 2); }
  });
  g.setAttribute('cardAt', new THREE.InstancedBufferAttribute(at, 4));
  g.setAttribute('cardColour', new THREE.InstancedBufferAttribute(colour, 4));
  g.setAttribute('cardSource', new THREE.InstancedBufferAttribute(source, 4));
  g.setAttribute('cardRight', new THREE.InstancedBufferAttribute(right, 3));
  g.setAttribute('cardUp', new THREE.InstancedBufferAttribute(up, 3));
  g.setAttribute('cardCut', new THREE.InstancedBufferAttribute(cut, 4));
  g.setAttribute('cardWall', new THREE.InstancedBufferAttribute(wall, 2));
  g.instanceCount = list.length; // 0 on a map with none: the empty-draw skip passes it by
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}

// ---------------------------------------------------------------------------
// The test map's demo (city-test.js: towers north of the street at z -2 and
// beyond, the wedge's prow at x 2..12, the low shop south-east at x 14..24,
// z 4..12; the street z -2..4). Only for `city.signs === true` with no list.
export function demoSigns(signs, map) {
  const on = id => signs.city.shells?.slots?.get(id) || 0; // the building's cut slot
  // Two neon pictograms on the facades: a flickering cocktail on the store's
  // south face, a blinking bolt on the wedge's back; and a glyph word with a
  // segment out on the hall's face.
  signs.addNeon('cocktail', { building: on('l-tower'), at: [-17.4, 4.2, -2], facing: 0, size: 1.5, colour: 'pink', mode: 'flicker', seed: .31 });
  signs.addNeon('bolt', { building: on('wedge'), at: [20.4, 4.6, -10], facing: 0, size: 1.6, colour: 'lemon', mode: 'blink', seed: .62 });
  signs.addNeon({ glyphs: 4, seed: .17 }, { building: on('l-tower'), at: [-14, 5.4, -8], facing: 0, size: .7, colour: 'blue', mode: 'dead-segment', seed: .17 });
  // Two screens: a glyph ad on the office's south face, and the flatiron-style
  // centrepiece on the wedge's long west face (from (2, -20) to (8, -10)).
  signs.addScreen({ building: on('l-tower'), at: [-8, 5.2, -14], facing: 0, w: 4.2, h: 2.2, mode: 'glyphs', palette: ['pink', 'warmWhite'], seed: .44 });
  const prow = Math.atan2(-10, 6); // the face's outward normal (-10, 6): west-south-west
  signs.addScreen({ building: on('wedge'), at: [4.7, 7.2, -15.5], facing: prow, w: 8, h: 4.4, mode: 'centrepiece', palette: ['lemon', 'blue'], seed: .05 });
  // A signal pole on the south kerb with a mast arm over the street: a head
  // for the east-west road (group 0), one for the cross direction (group 1),
  // and a pedestrian head (walks with group 0).
  signs.addPole({ at: [-3, 0, 4.6], facing: Math.PI, height: 6, arm: 3.4 });
  signs.addSignalHead({ at: [-3, 5.3, 1.6], facing: Math.PI / 2, group: 0 });
  signs.addSignalHead({ at: [-3, 5.3, 2.6], facing: 0, group: 1 });
  signs.addPedHead({ at: [-2.75, 2.8, 4.6], facing: Math.PI / 2, group: 0 });
  // Three street lamps along the south kerb, cold LED; the middle one failing.
  signs.addLamp({ at: [-20, 0, 4.6], facing: Math.PI, seed: .12 });
  signs.addLamp({ at: [6, 0, 4.6], facing: Math.PI, mode: 'flicker', seed: .73 });
  signs.addLamp({ at: [12, 0, 4.6], facing: Math.PI, seed: .58 });
  return signs;
}

registerCitySystem('signs', (view, map, city) => new CitySigns(view, map, city));
