// Named places to stand for the headless tools (perf.mjs --spot, smoke.mjs
// walk). A spot is where the player stands (x, z) and, optionally, which way
// they face (look: a point, sets the aim so the camera leads that way).
// A map's "walk" spot is where smoke.mjs --walk starts (else "start").
export const SPOTS = {
 'hill-test': {
  start: { x: 0, z: 6 },
  // Where smoke.mjs --walk starts: its 8-9 m square (north, east, south,
  // west, then out north-west and back) crosses the knoll's west slope and
  // misses every prop, target and wall.
  walk: { x: -6, z: 2 },
  // On the plateau, beside the house, looking down the ramp.
  plateau: { x: -16, z: -14, look: { x: -20, z: 0 } },
  // The floor of the hollow, looking up at the hill.
  hollow: { x: 4, z: 20, look: { x: 14, z: -10 } },
  // The knoll's top, looking across the hollow.
  hilltop: { x: 14, z: -10, look: { x: 4, z: 20 } },
 },
 // Hollow Wick (src/maps/hollow-wick.js). summit-into-hollow is the widest
 // view, north-woods the densest: those two are the perf budget checks.
 'hollow-wick': {
  start: { x: -10, z: -2 },
  // The scarecrow field's east end: its whole route (the square and the
  // diagonal) clear of the stalks' props, the cart, walls and targets.
  walk: { x: 27, z: 43 },
  'summit-into-hollow': { x: -40, z: -14, look: { x: -12, z: 14 } },
  'north-woods': { x: -6, z: -52 },
  town: { x: 30, z: -4.5 },
  bridge: { x: -14, z: 14, look: { x: -14, z: 30 } },
 },
};

// "plateau" or "12,-4" (or "12 -4") to { x, z, look? }; null for no spot.
export function resolveSpot(mapId, spot) {
 if (spot == null || spot === '') return null;
 const named = SPOTS[mapId]?.[spot];
 if (named) return { name: spot, ...named };
 const m = String(spot).trim().split(/[\s,]+/).map(Number);
 if (m.length === 2 && m.every(Number.isFinite)) return { name: `${m[0]},${m[1]}`, x: m[0], z: m[1] };
 throw new Error(`unknown spot "${spot}" for ${mapId}; named: ${Object.keys(SPOTS[mapId] || {}).join(', ') || 'none'}`);
}

// --key value / --key=value / --flag, plus the positional rest. Switches
// (flags that never take a value) are listed so they leave the next word alone.
export function parseArgs(argv, switches = ['walk']) {
 const flags = {}, rest = [];
 for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { rest.push(a); continue; }
  const [k, v] = a.slice(2).split('=');
  if (v !== undefined) flags[k] = v;
  else if (!switches.includes(k) && i + 1 < argv.length && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
  else flags[k] = true;
 }
 return { flags, rest };
}

export const PRESETS = ['potato', 'performance', 'balanced', 'quality', 'extreme'];

// Judges a walk's samples ({ t, x, z, y, ground, moving }): the rules the
// walk mode fails on, kept pure so a test can pin them down.
//  - any NaN or non-finite position,
//  - the drawn player more than `sink` below the ground under them,
//  - a leg of held keys that moved less than `minMove` metres (stuck).
export function judgeWalk(samples, legs, { sink = .25, minMove = 1 } = {}) {
 const problems = [];
 for (const s of samples) {
  if (![s.x, s.z, s.y, s.ground].every(Number.isFinite)) { problems.push(`NaN position at ${s.t}ms`); break; }
 }
 for (const s of samples) {
  if (s.y < s.ground - sink) { problems.push(`below ground at ${s.x.toFixed(1)},${s.z.toFixed(1)} (y ${s.y.toFixed(2)}, ground ${s.ground.toFixed(2)})`); break; }
 }
 for (const leg of legs) {
  const d = Math.hypot(leg.to.x - leg.from.x, leg.to.z - leg.from.z);
  if (!(d >= minMove)) problems.push(`stuck on leg ${leg.name} (moved ${Number.isFinite(d) ? d.toFixed(2) : d} m)`);
 }
 return problems;
}
