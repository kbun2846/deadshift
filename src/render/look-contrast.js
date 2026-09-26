// s3-look: how a colour ends up on screen under a map's light, and how far
// apart two such colours are (tests/hollow-wick-look.test.js, the dusk look's
// contrast rules).
//
// Pure: no three.js, so it runs in Node. It follows three's own maths for the
// materials the world uses (MeshStandardMaterial, roughness 1, metalness 0:
// the diffuse part; the few percent of rough specular are left out):
//   radiance = albedo / PI x (hemisphere + sun x cos(sun's height) x sunLeft)
// with light colours in linear light times their intensity, then three's
// ACESFilmicToneMapping at the map's exposure, then sRGB. Unlit materials
// (blood splats and drops are MeshBasicMaterial, tone mapped) skip the light.
//
// "Stands out" is measured as CIEDE2000 (the usual perceptual colour
// difference: about 2 is the smallest difference anyone sees side by side,
// 10+ reads as a different colour at a glance) between the two on-screen
// colours. Luminance contrast alone is not enough here: a dark red pool on
// dark brown earth has almost the same luminance, and it is the hue that
// makes it read. See AGENTS.md > Hollow Wick's dusk look.
import { mapLook } from './map-look.js';

export const toLinear = c => (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
export const toSrgb = c => (c <= .0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - .055);
export const hexRgb = hex => { const v = parseInt(String(hex).replace('#', ''), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255].map(c => c / 255); };
export const hexLinear = hex => hexRgb(hex).map(toLinear);
export const rgbHex = rgb => '#' + rgb.map(c => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('');

// three's ACESFilmicToneMapping (tonemapping_pars_fragment), exposure included.
const IN = [[.59719, .35458, .04823], [.07600, .90834, .01566], [.02840, .13383, .83777]];
const OUT = [[1.60475, -.53108, -.07367], [-.10208, 1.10813, -.00605], [-.00327, -.07276, 1.07602]];
const mul = (m, v) => m.map(row => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
const fit = v => (v * (v + .0245786) - .000090537) / (v * (.983729 * v + .4329510) + .238081);
export function acesFilmic(linear, exposure = 1) {
 const scaled = linear.map(c => c * exposure / .6);
 return mul(OUT, mul(IN, scaled).map(fit)).map(c => Math.max(0, Math.min(1, c)));
}

// The light falling on flat, upward-facing ground (linear, per channel), from
// a finished look (mapLook): the whole hemisphere sky, and the sun at its
// height times `sunLeft` (1 in the open, 0 in shadow or the hills' shade).
export function groundLight(look, sunLeft = 1) {
 const { x, y, z } = look.sunOffset, up = y / Math.hypot(x, y, z);
 const sky = hexLinear(look.sky), sun = hexLinear(look.sun);
 return sky.map((s, i) => s * look.skyIntensity + sun[i] * look.sunIntensity * up * sunLeft);
}

// On screen (sRGB 0..1): a lit colour (albedo, hex or linear) under `look`.
export function litOnScreen(albedo, look, sunLeft = 1) {
 const a = typeof albedo === 'string' ? hexLinear(albedo) : albedo, e = groundLight(look, sunLeft);
 return acesFilmic(a.map((c, i) => c * e[i] / Math.PI), look.exposure ?? 1).map(toSrgb);
}
// On screen: an unlit (tone mapped) colour.
export const unlitOnScreen = (hex, look) => acesFilmic(hexLinear(hex), look.exposure ?? 1).map(toSrgb);

// sRGB 0..1 to CIELAB (D65).
export function lab(srgb) {
 const [r, g, b] = srgb.map(toLinear);
 const X = (r * .4124564 + g * .3575761 + b * .1804375) / .95047, Y = r * .2126729 + g * .7151522 + b * .0721750, Z = (r * .0193339 + g * .1191920 + b * .9503041) / 1.08883;
 const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
 return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
// Relative luminance (WCAG) of an sRGB 0..1 colour.
export const luminance = srgb => { const [r, g, b] = srgb.map(toLinear); return .2126 * r + .7152 * g + .0722 * b; };

// CIEDE2000 between two CIELAB colours.
export function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
 const rad = Math.PI / 180, C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
 const G = .5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
 const ap1 = a1 * (1 + G), ap2 = a2 * (1 + G), Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
 const hue = (b, a) => { if (!a && !b) return 0; const h = Math.atan2(b, a) / rad; return h < 0 ? h + 360 : h; };
 const hp1 = hue(b1, ap1), hp2 = hue(b2, ap2);
 const dL = L2 - L1, dC = Cp2 - Cp1;
 let dh = 0; if (Cp1 * Cp2) { dh = hp2 - hp1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
 const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(dh * rad / 2);
 const Lm = (L1 + L2) / 2, Cpm = (Cp1 + Cp2) / 2;
 let hm = hp1 + hp2; if (Cp1 * Cp2) { if (Math.abs(hp1 - hp2) > 180) hm += hm < 360 ? 360 : -360; hm /= 2; }
 const T = 1 - .17 * Math.cos((hm - 30) * rad) + .24 * Math.cos(2 * hm * rad) + .32 * Math.cos((3 * hm + 6) * rad) - .2 * Math.cos((4 * hm - 63) * rad);
 const SL = 1 + .015 * (Lm - 50) ** 2 / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + .045 * Cpm, SH = 1 + .015 * Cpm * T;
 const RT = -2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad);
 return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
export const difference = (srgbA, srgbB) => deltaE2000(lab(srgbA), lab(srgbB));

// What must stand out on Hollow Wick's ground (tests/hollow-wick-look.test.js):
// `lit` things are lit by the map (a coat, a hat), `unlit` ones keep their
// colour (blood splats and drops; base rings are lit like hats here, which
// is the harder case).
// Thresholds (CIEDE2000 on screen, against every ground texel of the
// playable area, in the sun and in shade; not under the decks or in the
// stream's channel, where the deck or the water is what shows): blood and
// the team colours at least READABLE.accent, 15 (plainly another colour at
// a glance, even as a small spot on a busy screen: about 7x the smallest
// visible difference); player coats at least READABLE.coat, 8 (clearly
// different as a large area: a coat is a big moving shape with a bright hat
// on top, which carries the player's identity; the owner's own palette puts
// its grass #6e6a50 at 6.9 from the olive coat, which is why it says to keep
// large areas away from olive and rust).
export const READABLE = Object.freeze({ accent: 15, coat: 8 });

// The finished look of a map, for these checks.
export const lookOf = map => mapLook(map);
