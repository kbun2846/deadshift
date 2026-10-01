// The contrast rule's data and maths for Lumen (tools/contrast-check.mjs, the
// browser runner, and tests/lumen-look.test.js). Pure: no three.js, no DOM, so
// it runs in Node.
//
// The rule (lumen-design.md section 15): what must stand out is measured on
// screen, after light, haze, wetness and the grade, on every ground, in white,
// blue, lemon, green, pink and red light pools and in shade, dry and wet.
// Blood and the team colours need CIEDE2000 >= 15 against the ground, the
// players' coats >= 8. The map adjusts (its colours, its pool placement); the
// players' colours never move.
import { deltaE2000, lab, READABLE } from '../src/render/look-contrast.js';
import { TEAMS } from '../src/config/match.js';
import { PLAYER_COLOURS } from '../src/remote-players.js';
import { LUMEN_GROUND } from '../src/world/lumen-ground.js';

export { READABLE };

// What is placed on the ground. `lit`: a lit surface (a coat, a hat: three's
// diffuse lighting), else unlit (a blood splat is a MeshBasicMaterial, a base
// ring too: only tone mapping and fog touch it). `need`: the CIEDE2000 floor.
// Blood is #8c1c2a (a splat's textured pool is darker, but this is the rule's
// colour); its wet rim is the brighter #c23a48 the design gives it on this map.
export const BLOOD = '#8c1c2a', BLOOD_RIM = '#c23a48';
export const SWATCHES = Object.freeze([
  { id: 'blood', label: 'blood (splat)', colour: BLOOD, lit: false, need: READABLE.accent },
  { id: 'blood-lit', label: 'blood (gore, lit)', colour: BLOOD, lit: true, need: READABLE.accent },
  { id: 'blood-rim', label: 'blood wet rim', colour: BLOOD_RIM, lit: false, need: READABLE.accent },
  ...TEAMS.map(t => ({ id: `${t.name.toLowerCase()}-lit`, label: `${t.name} (hat, lit)`, colour: t.colour, lit: true, need: READABLE.accent })),
  ...TEAMS.map(t => ({ id: `${t.name.toLowerCase()}-ring`, label: `${t.name} (ring, unlit)`, colour: t.colour, lit: false, need: READABLE.accent })),
  ...PLAYER_COLOURS.map((c, i) => ({ id: `coat-${i}`, label: `coat ${i} ${c.coat}`, colour: c.coat, lit: true, need: READABLE.coat })),
]);

// Light pools as painted into the ground. DESIGN_POOLS is the design's "lit
// ground tint" table (section 15): what the ground should READ at the centre
// of a pool. Under Lumen's night look the lit ground is lifted (the street is
// never black), so a colour painted into the ground reads about 1.4 times
// brighter than written, and a tint screened over the ground (which only
// brightens) washes out to a pastel: with the design's numbers screened on,
// a green pool reads #75afa4 and a pink one #b67eab, and Cyan and Violet sit
// 9-12 from them. POOLS are the albedo tints to PAINT (normal alpha blend,
// not screen) so the centre reads as POOL_READS on screen, dry, in the moon;
// wet it darkens with the ground and in shade it is about 0.8 of that. They
// are the design's colours except where the rule needs less: white #80868f
// (a pale pool must stay dim: Cyan and Violet are pale), red #381216 (blood
// is red: a red pool can only be a dim one, so red neon belongs on walls and
// doorways), pink #54223c. Found by inverting the look's light (tools/
// contrast-check.mjs --tints recommended measures them). `none` is bare.
export const DESIGN_POOLS = Object.freeze({
  none: null,
  white: '#9aa0aa', blue: '#2a3670', lemon: '#6a6428', green: '#235a3c',
  pink: '#6a2a48', red: '#6a2426', sodium: '#6a5234',
});
// (2026-09-30, the darker night, owner: "keep lights and stuff whatever but
// make the ambience darker"): the ground's light dropped, so the tints were
// solved again to read about as bright as before in a darker street, a
// shade dimmer and greyer (subtle, not a blob): white #72777e (was #80868f),
// green #254d39, lemon #4f4c22 (dim: an olive coat, #5c5f3a, keeps 8 on it)...
export const POOL_READS = Object.freeze({
  none: null,
  white: '#72777e', blue: '#2a3260', lemon: '#4f4c22', green: '#254d39',
  pink: '#4b2437', red: '#331417', sodium: '#5e4a31',
});
export const POOLS = Object.freeze({
  none: null,
  white: '#646564', blue: '#353853', lemon: '#4e4a27', green: '#314b38',
  pink: '#4e2e39', red: '#3e2121', sodium: '#594832',
});

// The grounds (albedo, section 15). `set`: which group of runs carries it.
export const GROUNDS = Object.freeze([
  // (as world/lumen-ground.js LUMEN_GROUND paints them: darker since 2026-09-30)
  { id: 'asphalt', colour: LUMEN_GROUND.asphalt, set: 'base' },
  { id: 'alley', colour: '#26282c', set: 'base' },          // Back Alley, the darkest asphalt
  { id: 'grime', colour: LUMEN_GROUND.alley, set: 'base' }, // Back Alley grime
  { id: 'concrete', colour: LUMEN_GROUND.sidewalk, set: 'base' }, // sidewalks
  { id: 'stone', colour: LUMEN_GROUND.uptownStone, set: 'base' }, // Uptown stone: the lightest big ground
  { id: 'paving', colour: LUMEN_GROUND.plaza, set: 'area' }, // the Crossroads
  { id: 'plaza', colour: LUMEN_GROUND.metroTile, set: 'area' }, // Flatiron and Metro tile
  { id: 'stacks', colour: LUMEN_GROUND.courtyard, set: 'area' },
  { id: 'market', colour: LUMEN_GROUND.areas['night-market'].walk, set: 'area' },
  { id: 'garage', colour: LUMEN_GROUND.areas.garage.walk, set: 'area' },
  { id: 'velvet', colour: LUMEN_GROUND.velvet, set: 'area' },
  { id: 'kerb', colour: LUMEN_GROUND.kerb, set: 'area' },
  { id: 'oil', colour: '#25252a', set: 'area' },            // Garage oil
  { id: 'cardboard', colour: '#5a4a38', set: 'area' },      // Night Market wet cardboard
  { id: 'velvet-carpet', colour: '#3a0f1c', set: 'area' },  // Velvet Row's velvet: deep red, the hardest ground for blood
  // (the paint as the ground paints it: world/lumen-ground.js LUMEN_GROUND)
  { id: 'lane-paint', colour: LUMEN_GROUND.paint, set: 'paint' },
  { id: 'crosswalk', colour: LUMEN_GROUND.crosswalk, set: 'paint' },
  { id: 'lemon-line', colour: LUMEN_GROUND.lemon, set: 'paint' },
]);

// The ground's floor on screen: it never reads darker than this, so a fight
// is never on black. Design section 12 had #1c1f26; the owner's darker night
// (2026-09-30) takes it to #12141a (wet asphalt in shade reads #13161f; the
// players keep their contrast, measured: blood and team colours 15+, coats 8+).
export const GROUND_FLOOR = '#12141a';
// The grounds that are dark by design (Back Alley, Garage oil, Velvet Row) may read a shade under the floor, never black.
export const DARK_GROUNDS = Object.freeze(['alley', 'grime', 'velvet']);
// Velvet Row's carpet is a deep red, dark in luminance by design (what matters there is blood on it, which the rule measures), and an oil stain is a small dark spill on purpose: neither has a floor.
export const FLOOR_EXEMPT = Object.freeze(['velvet-carpet', 'oil']);
export const DARK_FLOOR_SHARE = .65;

export const hexToBytes = hex => { const v = parseInt(String(hex).replace('#', ''), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; };
export const bytesToHex = rgb => '#' + rgb.map(c => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('');
const toLab = bytes => lab(bytes.map(c => c / 255));

// CIEDE2000 between two on-screen colours given as 0..255 sRGB.
export const deltaBytes = (a, b) => deltaE2000(toLab(a), toLab(b));

// A swatch's mean colour against the ground samples around it. `worst` is the
// closest ground sample (the rule: "every ground"); `p5` the 5th percentile
// (a robust figure when the ring holds a stray edge pixel, used for the real
// map's spots); `ground` the mean ground colour.
export function contrastAgainst(swatch, ground) {
  const de = ground.map(g => deltaBytes(swatch, g)).sort((a, b) => a - b);
  const mean = [0, 1, 2].map(k => ground.reduce((s, g) => s + g[k], 0) / ground.length);
  return { worst: de[0], p5: de[Math.min(de.length - 1, Math.floor(de.length * .05))], median: de[de.length >> 1], ground: mean };
}

export const luma = rgb => { const l = rgb.map(c => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }); return .2126 * l[0] + .7152 * l[1] + .0722 * l[2]; };

// Rows: { preset, clock, light, ground, pool, swatch, need, worst, p5, groundRgb }.
// Which figure the rule is judged on: `worst` on the runner's own stage (its
// ground is uniform), `p5` at the map's real spots.
export const figureOf = (row, real = false) => (real ? row.p5 : row.worst);
export const fails = (rows, real = false) => rows.filter(r => figureOf(r, real) < r.need);

// The worst case per swatch (and where): { swatch: { need, worst, at } }.
export function worstBySwatch(rows, real = false) {
  const out = new Map();
  for (const r of rows) {
    const v = figureOf(r, real), cur = out.get(r.swatch);
    if (!cur || v < cur.value) out.set(r.swatch, { need: r.need, value: v, at: `${r.ground}/${r.pool}/${r.clock}/${r.light}` });
  }
  return out;
}

// A fixed-width table: header row, then rows of cells.
export function table(rows) {
  const widths = rows[0].map((_, c) => Math.max(...rows.map(r => String(r[c] ?? '').length)));
  return rows.map(r => r.map((cell, c) => (c === 0 ? String(cell ?? '').padEnd(widths[c]) : String(cell ?? '').padStart(widths[c]))).join('  ')).join('\n');
}
