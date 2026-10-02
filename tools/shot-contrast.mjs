// How well every weapon's rounds and attacks read on each map's ground, before
// and after the pop pass (owner, 2026-10-01: "Make all weapon projectiles and
// actions from player and other players and bots more contrasting so they
// pop out a lot more."). Pure Node, no browser:
//   node tools/shot-contrast.mjs            the table (worst ground per map)
//   node tools/shot-contrast.mjs --all      every ground
//
// Each visual is its core and its rim as drawn (unlit, not tone mapped; a
// see-through one blended over the ground at its opacity), compared as
// CIEDE2000 with the ground on screen (src/render/shot-pop.js POP_GROUNDS:
// the game's own frames). A visual reads where its core or its rim stands
// READABLE.accent (15) from the ground. `rim` is the rim's own figure: what
// carries a pale shot on pale ground. BEFORE is what the views drew until
// the pop pass. On-screen pixel figures (frozen frames of every round on
// each map's real ground, with and without them) are in AGENTS.md > The pop pass.
import { POP_VISUALS, POP_GROUNDS } from '../src/render/shot-pop.js';
import { deltaE2000, lab, hexRgb, READABLE } from '../src/render/look-contrast.js';
import { TEAMS } from '../src/config/match.js';

// What each visual was before (core, rim or null, opacity). The Static orb
// was tone mapped (MeshBasicMaterial's default), so its pale mint read a
// little greyer than written; an enemy's launched orb took the same mint.
export const BEFORE = Object.freeze({
  'rifle-bullet': { core: '#ffffff', rim: '#10201d' },
  'rifle-tracer': { core: '#fff3b0', rim: null, alpha: .9 },
  'ballast-pellet': { core: '#fff3cb', rim: null },
  'scatter-shell': { core: '#ff3a2a', rim: null },
  'static-orb': { core: '#d6fff0', rim: null },
  'static-orb-enemy': { core: '#d6fff0', rim: null },
  'omen-round': { core: '#a93c26', rim: null },
  'omen-primed': { core: '#931d3a', rim: null },
  'sightline-round': { core: '#d9e1ce', rim: null, alpha: .65 },
  'sightline-laser': { core: '#ee4851', rim: '#80202d', alpha: .65 },
  'sidekick-round': { core: '#ecf2d9', rim: null, alpha: .85 },
  'ichor-slash': { core: '#fffdf3', rim: '#c7c7bf', alpha: .92 },
  'sheath-slash': { core: '#f4f0e6', rim: null, alpha: .92 },
});
// How big each one is from above (metres: width x length of the core, and
// with its rim), before and after.
export const SIZES = Object.freeze({
  'rifle-bullet': ['.088 x .20 (rim .13)', '.115 x .27 (rim .18)'],
  'rifle-tracer': ['.026 x .30 (Extreme 1.5), none on Potato', '.064 x .62 (rim .115; Extreme 1.9), every preset'],
  'ballast-pellet': ['.09', '.144 (rim .22)'],
  'sightline-round': ['.048 x 1.05 (pistol .40)', '.062 x 1.30, rim .13, head .093 x .22 (pistol .55)'],
  'sidekick-round': ['.035 x .9', '.06 (rim .10) x .9'],
  'static-orb': ['.25', '.25 (rim .36)'],
  'omen-round': ['.27 x .63', '.27 x .63 (ink .41 x .81)'],
});

const blend = (hex, alpha, ground) => { const c = hexRgb(hex), g = hexRgb(ground); return c.map((v, i) => v * alpha + g[i] * (1 - alpha)); };
const de = (a, b) => deltaE2000(lab(a), lab(b));
// One visual on one ground: { core, rim, reads } (CIEDE2000).
// (`night`: Lumen, where a visual with a `nightRim` draws that pale rim
// in place of the dark one: renderer.js, the city's readable look.)
export function popOn(visual, ground, night = false) {
  const a = visual.alpha ?? 1, g = hexRgb(ground), rimHex = (night && visual.nightRim) || visual.rim;
  const core = de(blend(visual.core, a, ground), g), rim = rimHex ? de(blend(rimHex, a, ground), g) : 0;
  return { core, rim, reads: Math.max(core, rim) };
}
// The worst ground of a map for a visual.
export function worstOn(visual, map) {
  let worst = null;
  for (const [name, hex] of Object.entries(POP_GROUNDS[map])) { const r = { ...popOn(visual, hex, map === 'lumen'), ground: name }; if (!worst || r.reads < worst.reads) worst = r; }
  return worst;
}
// The nearest side colour (hat, ring, colour) to a core.
export function nearestTeam(hex) {
  let best = { d: Infinity };
  for (const t of TEAMS) for (const k of ['colour', 'hat', 'ring']) { const d = de(hexRgb(hex), hexRgb(t[k])); if (d < best.d) best = { d, team: `${t.name} ${k}` }; }
  return best;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = process.argv.includes('--all'), maps = Object.keys(POP_GROUNDS), f = v => v.toFixed(0).padStart(3);
  console.log(`reads = max(core, rim) CIEDE2000 vs the worst ground of each map; floor ${READABLE.accent}`);
  console.log('visual'.padEnd(22) + maps.map(m => m.padEnd(30)).join(''));
  for (const v of POP_VISUALS) {
    const b = { ...BEFORE[v.id], id: v.id };
    const cells = maps.map(m => { const x = worstOn(b, m), y = worstOn(v, m); return `${f(x.reads)} ->${f(y.reads)} rim${f(x.rim)} ->${f(y.rim)}`.padEnd(30); });
    console.log(v.label.padEnd(22) + cells.join(''));
    if (all) for (const m of maps) for (const [g, hex] of Object.entries(POP_GROUNDS[m])) { const x = popOn(b, hex), y = popOn(v, hex, m === 'lumen'); console.log(`   ${m}/${g}`.padEnd(30) + `core ${f(x.core)} ->${f(y.core)}  rim ${f(x.rim)} ->${f(y.rim)}`); }
  }
  console.log('\nnearest side colour to each core (must stay >= 12 where marked team):');
  for (const v of POP_VISUALS) { const n = nearestTeam(v.core); console.log(`${v.label.padEnd(22)}${v.core}  ${n.d.toFixed(1).padStart(5)} (${n.team})${v.team ? '' : '  (not checked)'}`); }
  console.log('\nsizes from above (m), before -> after:');
  for (const [id, [x, y]] of Object.entries(SIZES)) console.log(`${id.padEnd(18)}${x}  ->  ${y}`);
}
