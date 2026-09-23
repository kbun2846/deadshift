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
  sun: '#fff0cc',
  sunIntensity: 2.5,
  haze: '#8e7859',       // fog colour and the clear colour behind the map
  warmth: 0,             // 0 = colours as written; .1-.2 is "a bit warmer"
});

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

// The finished colours a map is lit with.
export function mapLook(map) {
  const look = { ...BASE_LOOK, ...(map?.look || {}) };
  const w = look.warmth;
  return { ...look, sky: warmColor(look.sky, w), bounce: warmColor(look.bounce, w), sun: warmColor(look.sun, w), haze: warmColor(look.haze, w * .6) };
}
