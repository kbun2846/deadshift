// Places Hollow Wick's trees, stumps, fallen logs and leaf drifts and writes
// them to src/maps/hollow-wick-trees.js (stage 2, the trees). Seeded, so a run
// repeats exactly; every spot is checked against the ground and the map
// (maps/hollow-wick-tree-rules.js spotProblems): off paths and their
// shoulders, out of the stream and off its banks' faces, off building pads
// and decks, clear of the bases, the other builders' set pieces and steep
// ground. Run: node tools/place-trees.mjs  (then the tests:
// node --test tests/hollow-wick-trees.test.js)
import { writeFileSync } from 'node:fs';
import { hollowWick, WOODS, STREAM } from '../src/maps/hollow-wick.js';
import { groundFor } from '../src/map-kit.js';
import { spotProblems, insidePolygon } from '../src/maps/hollow-wick-tree-rules.js';
import { TREE_KINDS } from '../src/world/tree-kinds.js';

// The map as it stands without trees (so the rules never see our own).
const map = { ...hollowWick, trees: null };
const ground = groundFor(map);
let seed = 1817;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const range = (a, b) => a + (b - a) * random();
const r2 = v => Math.round(v * 100) / 100;
const clear = (x, z, r, opts) => spotProblems(map, ground, x, z, r, opts).length === 0;
const placed = []; // every trunk so far: { x, z, r }
const roomFor = (x, z, gap) => placed.every(p => Math.hypot(p.x - x, p.z - z) >= gap);
const tree = (group, kind, x, z, s, yaw = range(0, Math.PI * 2)) => { const t = { x: r2(x), z: r2(z), kind, s: r2(s), yaw: r2(yaw) }; placed.push({ x, z, r: TREE_KINDS[kind].trunk * s }); group.push(t); return t; };

// --- the woods: clumps and gaps, never a grid --------------------------------
// A density field: a few clump centres raise it, a few clearings drop it to
// nothing; darts land where the field says, at least 2.5-3.3 m apart.
function grow(poly, count, clumps, clearings, out) {
 const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
 const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
 const inside = (x, z) => insidePolygon(x, z, poly);
 const centres = [];
 while (centres.length < clumps) { const x = range(x0, x1), z = range(z0, z1); if (inside(x, z)) centres.push([x, z, range(3.5, 7)]); }
 const holes = [];
 while (holes.length < clearings) { const x = range(x0, x1), z = range(z0, z1); if (inside(x, z)) holes.push([x, z, range(3, 5)]); }
 // The knolls' crests stay open (they are for reverse-slope play).
 for (const k of map.terrain.knolls) if (inside(k.x, k.z)) holes.push([k.x, k.z, k.r * .45]);
 const density = (x, z) => {
  if (holes.some(([hx, hz, hr]) => Math.hypot(x - hx, z - hz) < hr)) return 0;
  return .22 + centres.reduce((a, [cx, cz, cr]) => a + Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (cr * cr)), 0);
 };
 let n = 0, tries = 0;
 while (n < count && tries++ < 60000) {
  const x = range(x0, x1), z = range(z0, z1);
  if (!inside(x, z) || random() > density(x, z)) continue;
  const s = range(.85, 1.25);
  if (!roomFor(x, z, range(2.5, 3.3)) || !clear(x, z, TREE_KINDS.woods.trunk * s + .1)) continue;
  tree(out, 'woods', x, z, s); n++;
 }
 return n;
}

const north = [], west = [];

// --- the orchard: old apple trees in loose rows north of the town -----------
// Rows run along the back trail on its north-east side, about 5 m apart and
// 5.5 m between rows, a few gone (an old orchard), each a little off its row.
const orchard = [];
{
 const [ax, az] = [12, -31], [bx, bz] = [-4, -43], l = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / l, uz = (bz - az) / l;
 const nx = uz, nz = -ux; // south-west of the trail (negative: north-east)
 for (const across of [-13.6, -9, -4.4, 4.2]) for (let along = -8; along < l + 6; along += 4.7) {
  if (random() < .07) continue;
  const x = ax + ux * along + nx * across + range(-.5, .5), z = az + uz * along + nz * across + range(-.5, .5), s = range(.85, 1.15);
  if (insidePolygon(x, z, WOODS[0].poly) || !roomFor(x, z, 3) || !clear(x, z, TREE_KINDS.apple.trunk * s + .1)) continue;
  tree(orchard, 'apple', x, z, s);
 }
}

// The woods after the orchard's rows (they fill round it).
grow(WOODS.find(w => w.id === 'north-woods').poly, 74, 9, 4, north);
grow(WOODS.find(w => w.id === 'west-woods').poly, 36, 5, 2, west);

// --- village trees, the meetinghouse's old trees, the fork's maple ------------
const village = [], meeting = [], maple = [];
// The nearest clear spot to (x, z) within `reach` m (a ring search).
function near(x, z, r, reach = 3, opts) {
 for (let d = 0; d <= reach; d += .25) for (let a = 0; a < 16; a++) {
  const px = x + Math.cos(a / 16 * Math.PI * 2) * d, pz = z + Math.sin(a / 16 * Math.PI * 2) * d;
  if (clear(px, pz, r, opts) && roomFor(px, pz, 3.5)) return [px, pz];
  if (!d) break;
 }
 return null;
}
{
 const spot = near(-11, -3, TREE_KINDS.maple.trunk * 1.1 + .1, 6);
 if (spot) tree(maple, 'maple', spot[0], spot[1], 1.1, 2.2);
}
const O = [-44, -22.5], at = (r, a) => [O[0] + r * Math.cos(a * Math.PI / 180), O[1] - r * Math.sin(a * Math.PI / 180)];
for (const [r, a, s] of [[12.5, 118, 1.1], [13.5, 163, 1], [12.5, 205, 1.15], [11.5, 248, .95], [14, 92, .9]]) {
 const spot = near(...at(r, a), TREE_KINDS.old.trunk * s + .1, 2.5); if (spot) tree(meeting, 'old', spot[0], spot[1], s);
}
// About the town, the green, the lanes and the south terrace.
for (const [x, z, s] of [[16, 1.5, 1], [34.5, -13.6, .95], [46, -13.4, 1.05], [55, -13.5, .9], [36.5, -2.5, 1], [45, 5, .9],
 [19, -26, .95], [37, -25.6, 1], [53, -24.6, .9], [40, -38, 1.1], [52, -40, 1], [24, -40, .95],
 [-48, 33, 1.05], [-37.5, 37.5, .95], [-22, 45, 1], [-50, 45, .9], [-15, 40, .95], [-5, 36, .9], [-30, 44, .95]]) {
 const spot = near(x, z, TREE_KINDS.elm.trunk * s + .1, 2); if (spot) tree(village, 'elm', spot[0], spot[1], s);
}

// --- willows and alders along the stream banks (not in the water) ------------
const willows = [];
{
 const candidates = [];
 for (let i = 1; i < STREAM.length; i++) {
  const [ax, az, ah] = STREAM[i - 1], [bx, bz, bh] = STREAM[i], l = Math.hypot(bx - ax, bz - az);
  for (let t = 0; t < l; t += 2.2) {
   const f = t / l, x = ax + (bx - ax) * f, z = az + (bz - az) * f, h = ah + (bh - ah) * f, nx = -(bz - az) / l, nz = (bx - ax) / l;
   for (const side of [-1, 1]) for (const off of [h + 2.8, h + 3.6, h + 4.4]) candidates.push([x + nx * side * off, z + nz * side * off]);
  }
 }
 const inPlay = candidates.filter(([x, z]) => x > -58 && x < 54);
 for (let k = inPlay.length - 1; k > 0; k--) { const j = Math.floor(random() * (k + 1)); [inPlay[k], inPlay[j]] = [inPlay[j], inPlay[k]]; }
 for (const [x, z] of inPlay) {
  if (willows.length >= 11) break;
  const s = range(.85, 1.15);
  if (!willows.every(w => Math.hypot(w.x - x, w.z - z) > 7) || !roomFor(x, z, 3.5) || !clear(x, z, TREE_KINDS.willow.trunk * s + .1, { bank: .3, slope: .38 })) continue;
  tree(willows, 'willow', x, z, s);
 }
}

// --- stumps, fallen logs and drifts in the woods ------------------------------
const stumps = [], logs = [], drifts = [];
const woodsPolys = WOODS.map(w => w.poly);
const inWoods = (x, z) => woodsPolys.some(p => insidePolygon(x, z, p));
const randomInWoods = () => { for (;;) { const p = woodsPolys[random() < .68 ? 0 : 1], xs = p.map(q => q[0]), zs = p.map(q => q[1]); const x = range(Math.min(...xs), Math.max(...xs)), z = range(Math.min(...zs), Math.max(...zs)); if (insidePolygon(x, z, p)) return [x, z]; } };
for (let tries = 0; stumps.length < 14 && tries < 4000; tries++) {
 const [x, z] = randomInWoods(), s = range(.8, 1.3);
 if (!roomFor(x, z, 1.6) || !clear(x, z, .45 * s)) continue;
 stumps.push({ x: r2(x), z: r2(z), s: r2(s), yaw: r2(range(0, 6.28)) }); placed.push({ x, z, r: .4 });
}
// A log: clear along its whole length, 1.3 m from any trunk, lying across the
// slope more often than down it (logs roll to rest).
for (let tries = 0; logs.length < 11 && tries < 30000; tries++) {
 const [x, z] = randomInWoods(), length = range(3, 5.6), radius = random() < .45 ? range(.24, .3) : range(.44, .52), yaw = range(0, Math.PI);
 const ux = Math.cos(yaw), uz = -Math.sin(yaw);
 let ok = true;
 for (let k = -.5; k <= .501 && ok; k += .1) {
  const s = k * length;
  const px = x + ux * s, pz = z + uz * s;
  ok = clear(px, pz, radius + .15, { slope: .33 }) && placed.every(p => Math.hypot(p.x - px, p.z - pz) > p.r + radius + .9) && logs.every(l => Math.hypot(l.x - px, l.z - pz) > l.length / 2 + 2);
 }
 if (!ok) continue;
 logs.push({ x: r2(x), z: r2(z), length: r2(length), radius: r2(radius), yaw: r2(yaw) });
}
// Leaf drifts piled against the uphill-west side of some trunks.
for (const t of [...north, ...west, ...meeting, ...village.slice(0, 6)]) {
 if (random() > .32) continue;
 const a = range(0, Math.PI * 2), d = TREE_KINDS[t.kind].trunk * t.s + .35, x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
 if (!clear(x, z, .2)) continue;
 drifts.push({ x: r2(x), z: r2(z), s: r2(range(.8, 1.4)), yaw: r2(a) });
}

const counts = { north: north.length, west: west.length, orchard: orchard.length, village: village.length, meeting: meeting.length, willows: willows.length, maple: maple.length, stumps: stumps.length, logs: logs.length, drifts: drifts.length };
console.log(counts, 'outside the fence:', [...north, ...west].filter(t => !inWoods(t.x, t.z)).length);
const rows = (list, keys) => list.map(o => ' [' + keys.map(k => o[k]).join(', ') + '],').join('\n');
const tr = ['x', 'z', 's', 'yaw'];
writeFileSync(new URL('../src/maps/hollow-wick-trees.js', import.meta.url), `// Hollow Wick's trees (stage 2): written by tools/place-trees.mjs (seeded;
// run it again rather than editing by hand). Every spot is checked against
// the ground (maps/hollow-wick-tree-rules.js): off the paths and their
// shoulders, out of the stream, off pads, decks, bases and steep ground, 4 m
// clear of the hanging tree (another builder's set piece). Kinds, colliders:
// world/tree-kinds.js; models: world/trees.js. Rows: [x, z, scale, yaw];
// logs [x, z, length, radius, yaw].
const trees = (kind, rows) => rows.map(([x, z, s, yaw]) => ({ x, z, kind, s, yaw }));

// The North Woods (${north.length}): a real autumn forest on the ridge, round the knolls.
export const NORTH_WOODS = trees('woods', [
${rows(north, tr)}
]);
// The West Woods (${west.length}): Church Hill's west flank, down toward the log.
export const WEST_WOODS = trees('woods', [
${rows(west, tr)}
]);
// The old orchard (${orchard.length}): loose rows along the back trail, north of the town.
export const ORCHARD = trees('apple', [
${rows(orchard, tr)}
]);
// Bare village trees about the town, the green, the lanes and the south terrace (${village.length}).
export const VILLAGE_TREES = trees('elm', [
${rows(village, tr)}
]);
// The old trees round the meetinghouse (${meeting.length}).
export const MEETINGHOUSE_TREES = trees('old', [
${rows(meeting, tr)}
]);
// Willows and alders on the stream banks (${willows.length}).
export const STREAM_TREES = trees('willow', [
${rows(willows, tr)}
]);
// The fork's big maple (the orange leaf carpet lies under it).
export const FORK_MAPLE = trees('maple', [
${rows(maple, tr)}
]);
export const STUMPS = [
${rows(stumps, tr)}
].map(([x, z, s, yaw]) => ({ x, z, s, yaw }));
export const LOGS = [
${rows(logs, ['x', 'z', 'length', 'radius', 'yaw'])}
].map(([x, z, length, radius, yaw]) => ({ x, z, length, radius, yaw }));
export const DRIFTS = [
${rows(drifts, tr)}
].map(([x, z, s, yaw]) => ({ x, z, s, yaw }));

export const HOLLOW_WICK_TREES = {
 trees: [...NORTH_WOODS, ...WEST_WOODS, ...ORCHARD, ...VILLAGE_TREES, ...MEETINGHOUSE_TREES, ...STREAM_TREES, ...FORK_MAPLE],
 stumps: STUMPS, logs: LOGS, drifts: DRIFTS,
};
`);
