// Shots that pop (owner, 2026-10-01: "Make all weapon projectiles and actions
// from player and other players and bots more contrasting so they pop out a
// lot more.").
//
// The rule every weapon's rounds, pellets, orbs, diamonds, tracers and slash
// arcs now follow: a bright, saturated core inside a dark rim. The rim carries
// it on pale ground (Deadwater's sand and roads, the dusk's dry grass), the
// core on dark ground (Lumen's wet night street), so it reads on both. Each
// weapon keeps its own colour family (Nominal gold, Ballast hot cream and
// Scatter red, Static mint and blue, Omen orange and crimson, Sightline white
// and red, Sidekick pale steel), and an enemy's Static orbs stay a deeper
// blue than yours and your team's.
//
// Cost: nothing new is lit and no draw is added. A rim is part of the same
// geometry as its core (`hullGeometry`: an inverted hull, a copy of the core
// pushed out and wound the other way, so only its far side shows, round the
// core's silhouette, coloured per vertex), so the one instanced draw that
// carried the core carries both; ribbon and line rims are more triangles or
// instances in the batch they already use.
//
// The numbers are measured, not guessed: tools/shot-contrast.mjs and
// tests/shot-pop.test.js put each core and rim on screen (look-contrast.js:
// unlit colours through three's tone mapping where the material has it) and
// compare it, as CIEDE2000, with each map's ground as the game draws it
// (POP_GROUNDS). Every visual must read at READABLE.accent (15) on every
// ground of every map through its core or its rim.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Each map's ground on screen (sRGB), as the game draws it under the
// fighting: the most common ground colours of firefight frames at
// Performance and Balanced (the look is preset-free), the palest and the
// darkest included, since a shot has to read on both.
export const POP_GROUNDS = Object.freeze({
  // Sand in the sun, the common ground; the pale wagon road; sand in a
  // building's shadow.
  deadwater: Object.freeze({ sand: '#8a5e30', street: '#ad7d3e', road: '#c8a56b', shade: '#563718' }),
  // Dry grass and the scarecrow field's earth at dusk; the trodden paths.
  'hollow-wick': Object.freeze({ grass: '#564321', earth: '#483a1d', stalks: '#766436', path: '#4b3f20' }),
  // The boulevard's asphalt, lit and wet in shade; the sidewalk; a
  // crosswalk's paint (the palest ground in the city).
  lumen: Object.freeze({ asphalt: '#252b39', street: '#333948', wet: '#1c212c', sidewalk: '#444a57', crosswalk: '#5e6677' }),
});

// The colours and sizes each view draws with (the views import these).
export const POP = Object.freeze({
  // Nominal: a white slug with a black jacket of rim, a lemon-gold tracer
  // with a dark rim behind it (longer and thicker than before: .3 m x .013;
  // Extreme's tapered streak is rifle-quality.js trailLength, 1.5 -> 1.9).
  rifle: Object.freeze({ core: '#ffffff', rim: '#120b06', slug: [1.7, 1.3, 1.7], rimScale: [1.55, 1.16, 1.55],
    trail: '#fff27a', trailRim: '#2b1606', trailLength: .62, trailRadius: .032, trailRimScale: [1.8, 1.04, 1.8],
    flash: 1.25 }),
  // Ballast: bigger, hotter pellets with a black rim; spent ones the same.
  ballast: Object.freeze({ core: '#fff3c4', rim: '#1c0d04', radius: .072, rimScale: 1.5, flash: 1.2 }),
  // Scatter's red shells: the same red, a near-black rim.
  scatter: Object.freeze({ rim: '#2a0604', rimScale: [1.22, 1.6, 1.6] }),
  // Static: launched orbs, yours pale mint, an enemy's a deeper, saturated
  // blue. On Lumen (the city's readable look) an enemy's blue sits close to
  // the blue-grey street, so there its rim is a pale glow, not a dark one.
  static: Object.freeze({ core: '#d6fff0', rim: '#06202a', enemyCore: '#4f8dff', enemyRim: '#050b26', nightRim: '#d8e6ff', rimScale: 1.42,
    trail: '#a1ffe0', enemyTrail: '#5f95ff', trailOpacity: .9 }),
  // Omen: a dark ink diamond behind each round; the base round's body is
  // the bright orange of its rims (was a dull ember brown, close to sand).
  omen: Object.freeze({ body: '#ff7a2e', primeBody: '#e0264a', ink: '#2a0818', inkScale: 1.5 }),
  // Sightline: rounds a white core over a dark line, the laser a dark band
  // under a bright red core; the batch drawn near solid (.65 before).
  sightline: Object.freeze({ round: '#ffffff', roundRim: '#16100b', roundWidth: .062, rimWidth: .13, length: 1.3, pistolLength: .55,
    laserHalo: '#3c0a12', laserCore: '#ff3446', opacity: .92 }),
  // Sidekick's rounds: pale steel with a dark rim, solid.
  sidekick: Object.freeze({ round: '#f4f8e6', rim: '#15140f', width: .06, rimScale: [1.7, 1.03, 1.7] }),
  // Ichor's slash: white or blood red over a dark edge band (was pale grey).
  ichor: Object.freeze({ edge: '#2a1e22' }),
  // Sheath's trail: a dark line outside the white edge and a dark band
  // inside the ivory, so the arc reads as a cut on pale ground too.
  sheath: Object.freeze({ ink: '#1d1a1f', rim: .1, band: .22, rushGold: .8 }),
  // Muzzle flashes a touch bigger (fx.muzzle, every gun).
  muzzle: Object.freeze({ rifle: .56, ballast: 1.15 }),
});

// A geometry with its own dark rim: the core (coloured `core`) and an
// inverted hull (the core scaled about its origin by `scale`, a number or
// [x, y, z], wound the other way, coloured `rim`), merged, non-indexed, with
// a `color` attribute. Draw it with vertexColors; an instance colour, if the
// batch sets one, tints both (a dark rim stays dark).
export function hullGeometry(source, { scale = 1.5, core = '#ffffff', rim = '#000000' } = {}) {
  const body = source.index ? source.toNonIndexed() : source.clone();
  for (const key of Object.keys(body.attributes)) if (key !== 'position' && key !== 'normal') body.deleteAttribute(key);
  const hull = body.clone();
  const [sx, sy, sz] = Array.isArray(scale) ? scale : [scale, scale, scale];
  hull.scale(sx, sy, sz);
  // Wind every triangle the other way (swap its second and third corners).
  for (const name of ['position', 'normal']) {
    const a = hull.attributes[name]; if (!a) continue;
    for (let i = 0; i < a.count; i += 3) for (let k = 0; k < a.itemSize; k++) { const t = a.array[(i + 1) * a.itemSize + k]; a.array[(i + 1) * a.itemSize + k] = a.array[(i + 2) * a.itemSize + k]; a.array[(i + 2) * a.itemSize + k] = t; }
    if (name === 'normal') for (let i = 0; i < a.array.length; i++) a.array[i] = -a.array[i];
  }
  const paint = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, out = new Float32Array(n * 3); for (let i = 0; i < n; i++) { out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(out, 3)); };
  paint(hull, rim); paint(body, core);
  // The hull first: within one draw the core's triangles come after it.
  const merged = mergeGeometries([hull, body]);
  hull.dispose(); body.dispose();
  return merged;
}

// What the checks measure (tools/shot-contrast.mjs, tests/shot-pop.test.js):
// each visual's core and rim as drawn (unlit, not tone mapped). A visual
// reads on a ground when its core or its rim stands READABLE.accent (15)
// from it; `team` marks cores that must also stay clear of the side colours
// (config/match.js TEAMS: hats and rings) so a shot never reads as a side.
export const POP_VISUALS = Object.freeze([
  { id: 'rifle-bullet', label: 'Nominal round', core: POP.rifle.core, rim: POP.rifle.rim },
  { id: 'rifle-tracer', label: 'Nominal tracer', core: POP.rifle.trail, rim: POP.rifle.trailRim, alpha: .95, team: true },
  { id: 'ballast-pellet', label: 'Ballast pellet', core: POP.ballast.core, rim: POP.ballast.rim, team: true },
  { id: 'scatter-shell', label: 'Scatter shell', core: '#ff3a2a', rim: POP.scatter.rim },
  { id: 'static-orb', label: 'Static orb (yours)', core: POP.static.core, rim: POP.static.rim },
  { id: 'static-orb-enemy', label: 'Static orb (enemy)', core: POP.static.enemyCore, rim: POP.static.enemyRim, nightRim: POP.static.nightRim, team: true },
  { id: 'omen-round', label: 'Omen diamond', core: POP.omen.body, rim: POP.omen.ink, team: true },
  { id: 'omen-primed', label: 'Omen primed diamond', core: POP.omen.primeBody, rim: POP.omen.ink, team: true },
  { id: 'sightline-round', label: 'Sightline round', core: POP.sightline.round, rim: POP.sightline.roundRim, alpha: POP.sightline.opacity },
  { id: 'sightline-laser', label: 'Sightline laser', core: POP.sightline.laserCore, rim: POP.sightline.laserHalo, alpha: POP.sightline.opacity, team: true },
  { id: 'sidekick-round', label: 'Sidekick round', core: POP.sidekick.round, rim: POP.sidekick.rim },
  { id: 'ichor-slash', label: 'Ichor slash', core: '#fffdf3', rim: POP.ichor.edge, alpha: .92 },
  { id: 'sheath-slash', label: 'Sheath slash', core: '#f4f0e6', rim: POP.sheath.ink, alpha: .92 },
]);
