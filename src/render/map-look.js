// How a map is lit: sky and ground bounce light, the sun, and the dust haze on
// the horizon (fog and the clear colour behind the world).
//
// Every map starts from BASE_LOOK. A map can override any of it with a `look`
// block in its own data, next to its `palette`, e.g.
//   look: { warmth: .15 }                      // same light, a bit warmer
//   look: { sun: '#ffd9a0', sunIntensity: 2.2 } // a different time of day
// so a new map needs no renderer changes to get its own mood.
//
// Only the world's lights and haze change. The HUD, menus and unlit effects
// (sparks, arcs, glows, tracers) keep their exact colours, and it is the same on
// every graphics preset because every preset lights the world with these lights.
// Extreme's grade pass (extreme-post.js) sits on top, as before.

export const BASE_LOOK = Object.freeze({
  sky: '#fff4df',        // hemisphere light from above
  bounce: '#b0a38c',     // hemisphere light from the ground
  skyIntensity: 2,
  sun: '#fff0cc',          // the sun's colour
  sunIntensity: 2.5,
  // Where the sun stands, from what it lights (the camera's focus): west,
  // north and high. Its shadow, its lean under Potato's blob shadows and the
  // hills' shade all follow this.
  sunOffset: Object.freeze({ x: -24, y: 40, z: -18 }),
  haze: '#8e7859',       // fog colour and the clear colour behind the map
  warmth: 0,             // 0 = colours as written; .1-.2 is "a bit warmer"
  // The drifting fog sheets (fog-sheets.js): Deadwater's tan dust. `colour`
  // and `highlight` are the sheet's two tones (a map that gives only a colour
  // gets a highlight a third of the way to white), `opacity` its strength,
  // and `lowBias` (0..1, terrain maps) how much it gathers over low ground:
  // new sheets form over the lowest ground in view, and are up to 1 +
  // lowBias times as thick there. Not warmed: it is the dust's own colour.
  fog: Object.freeze({ colour: '#d0ba8e', highlight: '#e8d6ac', opacity: .27, lowBias: 0 }),
  // s3-look: the rest of a map's grade, the same on every preset (all of it is
  // lights, fog and tone mapping: no pass, nothing per pixel added).
  // `exposure`: the tone mapping's exposure (ACES filmic). `fogNear`/`fogFar`:
  // the distance haze (three's linear fog in the haze colour), in metres of
  // view depth; the camera looks down from about 31 m, so the defaults (70,
  // 130) never touch the play area, and a nearer start greys the far side
  // of the screen and low ground a little. `glow` / `glowMix`: a low glow on
  // the horizon the sun's light passes through (mixed into the sun's colour
  // in linear light, 0..1). `grade`: Extreme's grade pass over its defaults
  // (extreme-post.js EXTREME_POST.grade: warmth, shade, contrast, saturation).
  exposure: .98, fogNear: 70, fogFar: 130, glow: null, glowMix: 0, grade: null,
});

// A map's fog over the defaults.
export function fogLook(fog) {
  if (!fog) return BASE_LOOK.fog;
  const highlight = fog.highlight || (fog.colour ? mixToWhite(fog.colour, 1 / 3) : BASE_LOOK.fog.highlight);
  return Object.freeze({ ...BASE_LOOK.fog, ...fog, highlight });
}
function mixToWhite(hex, amount) {
  const value = parseInt(hex.replace('#', ''), 16);
  return '#' + [value >> 16 & 255, value >> 8 & 255, value & 255].map(c => Math.round(c + (255 - c) * amount).toString(16).padStart(2, '0')).join('');
}

// Warmth pulls a colour toward late-afternoon amber: red stays, green eases,
// blue drops the most, in proportion, so dark haze warms as well as bright sun.
// At "a bit" (.15) brightness barely moves, so exposure does not need retuning.
const AMBER = [1, 176 / 255, 96 / 255];
export function warmColor(hex, warmth) {
  const value = parseInt(hex.replace('#', ''), 16);
  const channels = [value >> 16 & 255, value >> 8 & 255, value & 255];
  const amount = Math.max(0, Math.min(1, warmth));
  return '#' + channels.map((c, i) => Math.round(c * (1 - (1 - AMBER[i]) * amount)).toString(16).padStart(2, '0')).join('');
}

// Potato's blob shadows lean off each thing the way the sun throws its
// shadow: ground offset per metre of height ({ x: .6, z: .45 } for the
// default sun).
export function sunLean(offset) {
  return { x: -offset.x / offset.y, z: -offset.z / offset.y };
}

// The sun's shadow camera: near and far along the light, around a target
// `length` away. The default sun keeps its tuned 20..82 (30 m toward the sun,
// 32 m past the target). A lower sun throws longer shadows, so it reaches
// further toward the sun: far enough that something 10 m tall standing up
// to 19 m past the view's edge (half the framed ground, along the sun) still
// casts into view.
export function shadowDepth(offset) {
  const length = Math.hypot(offset.x, offset.y, offset.z), flat = Math.hypot(offset.x, offset.z);
  const cos = flat / length, sin = offset.y / length;
  const reach = Math.max(30, (19 + 10 * cos / sin) * cos + 10 * sin);
  return { near: length - reach, far: length + 32 };
}

// Two colours mixed in linear light (s3-look: the glow into the sun).
export function mixLinear(a, b, amount) {
  const lin = hex => { const v = parseInt(hex.replace('#', ''), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255].map(c => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }); };
  const t = Math.max(0, Math.min(1, amount)), A = lin(a), B = lin(b);
  return '#' + A.map((c, i) => { const v = c + (B[i] - c) * t, s = v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055; return Math.round(Math.max(0, Math.min(1, s)) * 255).toString(16).padStart(2, '0'); }).join('');
}

// The finished colours a map is lit with.
export function mapLook(map) {
  const look = { ...BASE_LOOK, ...(map?.look || {}) };
  const w = look.warmth;
  // (s3-look) The sun's light through the horizon's glow.
  const sun = look.glow && look.glowMix > 0 ? mixLinear(look.sun, look.glow, look.glowMix) : look.sun;
  return { ...look, sky: warmColor(look.sky, w), bounce: warmColor(look.bounce, w), sun: warmColor(sun, w), haze: warmColor(look.haze, w * .6), fog: fogLook(map?.look?.fog) };
}
