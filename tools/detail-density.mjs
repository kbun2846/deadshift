#!/usr/bin/env node
// Hollow Wick's detail bar (claude/hollow-wick-plan.md "Bars"): authored
// pieces per 1000 m² of walkable ground outside the graveyard (target 35+),
// period types (45+), and every 38 x 26 m screen (the camera's view) holding
// at least 25 pieces. A piece: a map prop, a tree, stump or log, a building,
// a crossing's stone. Node only: node tools/detail-density.mjs [map] [--list]
import { maps } from '../src/maps.js';
import { mapProps } from '../src/map-kit.js';
import { isPlayable } from '../src/playable-area.js';
const id = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'hollow-wick', map = maps[id];
const pieces = [
 ...mapProps(map).map(p => ({ x: p.x, z: p.z, type: p.type })),
 ...(map.trees ? [...map.trees.trees, ...(map.trees.stumps || []), ...(map.trees.logs || [])].map(t => ({ x: t.x, z: t.z, type: t.kind || (t.length ? 'log' : 'stump') })) : []),
 ...map.buildings.map(b => ({ x: b.x, z: b.z, type: b.interiorStyle || 'building' })),
 ...(map.crossings?.stones || []).map(([x, z]) => ({ x, z, type: 'stream-stone' })),
];
const types = new Set(pieces.map(p => p.type));
// Walkable ground: inside the fence, sampled every metre.
let area = 0; const xs = map.playableArea.map(p => p[0]), zs = map.playableArea.map(p => p[1]);
const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) if (isPlayable(map, x + .5, z + .5, 0)) area++;
const inside = pieces.filter(p => isPlayable(map, p.x, p.z, 0));
console.log(`${id}: ${inside.length} pieces on ${area} m² of playable ground: ${(inside.length / area * 1000).toFixed(1)} per 1000 m² (target 35); ${types.size} types (target 45)`);
// Screens: a 38 x 26 m window every 4 m, its centre inside the fence.
const sparse = [];
for (let cx = x0 + 19; cx <= x1 - 19 + 4; cx += 4) for (let cz = z0 + 13; cz <= z1 - 13 + 4; cz += 4) {
 if (!isPlayable(map, cx, cz, 0)) continue;
 const n = inside.filter(p => Math.abs(p.x - cx) <= 19 && Math.abs(p.z - cz) <= 13).length;
 if (n < 25) sparse.push([cx, cz, n]);
}
sparse.sort((a, b) => a[2] - b[2]);
console.log(`${sparse.length} screens under 25 pieces${sparse.length ? '; sparsest: ' + sparse.slice(0, 12).map(([x, z, n]) => `(${x},${z}) ${n}`).join(', ') : ''}`);
if (process.argv.includes('--list')) console.log([...types].sort().join(', '));
