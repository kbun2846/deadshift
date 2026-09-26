#!/usr/bin/env node
// Fills Hollow Wick's sparsest screens (tools/detail-density.mjs) with period
// pieces: fieldstone piles and boulders on open ground, a chopping block or
// cordwood by a house. Seeded; writes src/maps/hollow-wick-detail.js. Every
// spot keeps the breakables' placement rules (tests/hollow-breakables-rules.js),
// every doorway's 2.4 m apron, 1.1 m round every spawn point, 0.35 m from any
// other solid (1.2 m from a trunk: the trees' own rule), 1.5 m off the drag
// trail and 4.6 m off the hanging tree. Run it after moving props, buildings,
// spawns or trees, then node tools/place-trees.mjs and the tests.
//   node tools/place-detail.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { maps, groundFor, mapColliders } from '../src/maps.js';
import { buildingOpenings, mapProps } from '../src/map-kit.js';
import { isPlayable } from '../src/playable-area.js';
import { placementProblems } from '../tests/hollow-breakables-rules.js';
import { DRAG_TRAIL, KEEP_CLEAR, lineDistance } from '../src/maps/hollow-wick-tree-rules.js';
import { HOLLOW_WICK_DETAIL } from '../src/maps/hollow-wick-detail.js';
import { BUILDING_PADS, BASES } from '../src/maps/hollow-wick.js';
const full = maps['hollow-wick'], ground = groundFor(full);
// The map as it stands without this file's pieces.
const own = new Set(HOLLOW_WICK_DETAIL.map(p => p.id));
const map = { ...full, props: full.props.filter(p => !own.has(p.id)) };
let seed = 1790; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const dist = (x, z, c) => { const a = c.angle || 0, cs = Math.cos(a), sn = Math.sin(a), dx = x - c.x, dz = z - c.z; const lx = Math.abs(dx * cs - dz * sn) - (c.localW ?? c.w) / 2, lz = Math.abs(dx * sn + dz * cs) - (c.localD ?? c.d) / 2; return Math.hypot(Math.max(0, lx), Math.max(0, lz)); };
const points = [...map.bases.flatMap(b => b.points), ...map.ffaSpawns];
const doors = map.buildings.flatMap(b => buildingOpenings(b).filter(o => o.type === 'door').map(o => ({ b, o })));
let solids = mapColliders(map).filter(c => !c.walkOver && !c.terrainEdge);
const collidersOf = p => mapColliders({ ...map, buildings: [], trees: null, fences: [], crossings: null, props: [p] }).filter(c => c.propId !== undefined);
const placed = [];
function problems(p) {
 const out = placementProblems(map, ground, p, [...map.props, ...placed]);
 const mine = collidersOf({ ...p, id: 'probe' });
 if (points.some(s => mine.some(c => dist(s.x, s.z, c) < 1.1))) out.push('spawn');
 for (const { b, o } of doors) {
  const mx = (o.a.x + o.b.x) / 2, mz = (o.a.z + o.b.z) / 2, ux = o.b.x - o.a.x, uz = o.b.z - o.a.z, len = Math.hypot(ux, uz);
  let nx = -uz / len, nz = ux / len; if (nx * (mx - b.x) + nz * (mz - b.z) < 0) { nx = -nx; nz = -nz; }
  for (const out2 of [.5, 1.2, 2, 2.4]) for (const side of [-.7, 0, .7]) if (mine.some(c => dist(mx + nx * out2 + ux / len * side, mz + nz * out2 + uz / len * side, c) < .55)) { out.push('door'); break; }
 }
 for (const c of mine) if (solids.some(s => dist(c.x, c.z, s) < Math.max(c.localW ?? c.w, c.localD ?? c.d) / 2 + (s.tree ? 1.2 : .35))) { out.push('solid'); break; }
 // A flat-bottomed piece: the ground under it varies by less than 0.4 m.
 const hs = mine.flatMap(c => { const a = c.angle || 0, cs = Math.cos(a), sn = Math.sin(a), w = (c.localW ?? c.w) / 2, d = (c.localD ?? c.d) / 2; return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([lx, lz]) => ground.heightAt(c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs)); });
 if (Math.max(...hs) - Math.min(...hs) > .38) out.push('uneven');
 // tests/hollow-wick-props.test.js's own rules: off every pad by 0.3 m and 2.4 m
 // from each side's middle (a door may be there), 5.5 m from a base's centre,
 // 2 m past a practice target's run, no corner on a slope over 0.34.
 const corners = mine.flatMap(c => { const a = c.angle || 0, cs = Math.cos(a), sn = Math.sin(a), w = (c.localW ?? c.w) / 2, d = (c.localD ?? c.d) / 2; return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([lx, lz]) => [c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs]); });
 for (const b of BUILDING_PADS) {
  const a = b.angle || 0, cs = Math.cos(a), sn = Math.sin(a);
  for (const [x, z] of corners) {
   const lx = (x - b.x) * cs - (z - b.z) * sn, lz = (x - b.x) * sn + (z - b.z) * cs;
   if (Math.abs(lx) <= b.w / 2 + .5 && Math.abs(lz) <= b.d / 2 + .5) out.push('pad');
   if ([[0, b.d / 2], [0, -b.d / 2], [b.w / 2, 0], [-b.w / 2, 0]].some(([mx, mz]) => Math.hypot(lx - mx, lz - mz) <= 2.4)) out.push('a side\'s middle');
  }
 }
 if (Object.values(BASES).some(([bx, bz]) => Math.hypot(p.x - bx, p.z - bz) < 5.5 + 1.2)) out.push('base');
 for (const t of map.targets || []) if (Math.abs(p.z - t.z) < 3 && p.x > t.x - (t.travel || 0) - 3 && p.x < t.x + (t.travel || 0) + 3) out.push('target');
 for (const [x, z] of corners) { const g = ground.gradientAt(x, z); if (Math.hypot(g.x, g.z) > .34) { out.push('slope'); break; } }
 if (lineDistance(p.x, p.z, DRAG_TRAIL) < 2.5) out.push('drag trail');
 if (KEEP_CLEAR.some(([kx, kz, kr]) => Math.hypot(p.x - kx, p.z - kz) < kr + 1.2)) out.push('set piece');
 // Not heaped together: 4.5 m from any other piece of this pass and from the
 // map's own piles and boulders (a stone pile is a field's clearing, set by a
 // wall or an edge, not rubble strewn about).
 if ([...placed, ...map.props.filter(q => /^(stonePile|fieldBoulder|choppingBlock)$/.test(q.type))].some(q => q.id !== p.id && Math.hypot(q.x - p.x, q.z - p.z) < 4.5)) out.push('crowded');
 // Never in (or hard against) a stalk patch: its stalks are sight cover, not a wall to hide one in.
 if ((map.crops || []).some(f => corners.some(([x, z]) => Math.abs(x - f.x) < f.w / 2 + .8 && Math.abs(z - f.z) < f.d / 2 + .8))) out.push('stalks');
 return out;
}
// Pieces per screen, as detail-density.mjs counts them.
const pieceList = () => [...mapProps({ ...map, props: [...map.props, ...placed] }).map(p => [p.x, p.z]), ...[...map.trees.trees, ...map.trees.stumps, ...map.trees.logs].map(t => [t.x, t.z]), ...map.buildings.map(b => [b.x, b.z]), ...map.crossings.stones.map(([x, z]) => [x, z])].filter(([x, z]) => isPlayable(map, x, z, 0));
const xs = map.playableArea.map(p => p[0]), zs = map.playableArea.map(p => p[1]);
const screens = []; for (let cx = Math.min(...xs) + 19; cx <= Math.max(...xs) - 15; cx += 4) for (let cz = Math.min(...zs) + 13; cz <= Math.max(...zs) - 9; cz += 4) if (isPlayable(map, cx, cz, 0)) screens.push([cx, cz]);
const count = (list, [cx, cz]) => list.filter(([x, z]) => Math.abs(x - cx) <= 19 && Math.abs(z - cz) <= 13).length;
const near = (x, z, r) => map.buildings.some(b => Math.hypot(b.x - x, b.z - z) < Math.max(b.w, b.d) / 2 + r);
// (Solid pieces only: the breakables are their own list, maps/hollow-wick-breakables.js.)
const KINDS = { open: ['stonePile', 'fieldBoulder', 'stonePile'], yard: ['woodpile', 'choppingBlock', 'waterTrough', 'stonePile'] };
const WOOD = mapProps(map).filter(p => /^(woodpile|cordwood)$/.test(p.type));
const woodNear = (x, z) => [...WOOD, ...placed].some(p => (p.type === 'woodpile' || p.type === 'cordwood') && Math.hypot(p.x - x, p.z - z) < 4.5);
// (Up to the plan's bar, 25 pieces in every screen: v0.975a; it stopped at 20.)
for (let n = 0; n < 64; n++) {
 const list = pieceList(), worst = screens.map(s => [s, count(list, s)]).sort((a, b) => a[1] - b[1])[0];
 if (!worst || worst[1] >= 25) break;
 const [[cx, cz]] = worst; let done = false;
 for (let tries = 0; tries < 400 && !done; tries++) {
  const r = 3 + random() * 12, a = random() * Math.PI * 2, x = Math.round((cx + Math.cos(a) * r) * 10) / 10, z = Math.round((cz + Math.sin(a) * r) * 10) / 10;
  if (!isPlayable(map, x, z, 1.5)) continue;
  const kinds = near(x, z, 6) ? KINDS.yard : KINDS.open;
  let type = kinds[Math.floor(random() * kinds.length)];
  // (A chopping block only by wood to split, and a trough only on level
  // ground, or a stone pile instead: stage 5 review, lone blocks in rings
  // of fresh chips with no wood near, and a trough's puddle on a slope.)
  if (type === 'choppingBlock' && !woodNear(x, z)) type = 'stonePile';
  if (type === 'waterTrough') { const g = ground.gradientAt(x, z); if (Math.hypot(g.x, g.z) > .1) type = 'stonePile'; }
  const p = { type, id: `detail-${placed.length}`, x, z, angle: Math.round(random() * 628) / 100 };
  if (!problems(p).length) { placed.push(p); solids = solids.concat(collidersOf(p)); done = true; }
 }
 if (!done) screens.splice(screens.findIndex(s => s[0] === cx && s[1] === cz), 1);
}
const out = `// Hollow Wick's detail pass (stage 5): period pieces in the sparsest screens,
// written by tools/place-detail.mjs (seeded; re-run it, never hand-edit).
export const HOLLOW_WICK_DETAIL = [
${placed.map(p => ` { type: '${p.type}', id: '${p.id}', x: ${p.x}, z: ${p.z}, angle: ${p.angle} },`).join('\n')}
];
`;
const file = new URL('../src/maps/hollow-wick-detail.js', import.meta.url);
// --check: the file must be what this run would write (exit 1 if stale).
if (process.argv.includes('--check')) { if (readFileSync(file, 'utf8') !== out) { console.log('src/maps/hollow-wick-detail.js is stale: run node tools/place-detail.mjs'); process.exitCode = 1; } }
else writeFileSync(file, out);
const after = pieceList();
console.log(`${placed.length} pieces; screens under 25: ${screens.filter(s => count(after, s) < 25).length}; under 20: ${screens.filter(s => count(after, s) < 20).length}`);
