// s3-look: the overhead map of a map with hills (src/ui/overhead-hills.js);
// Deadwater's own overhead map is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { maps, buildingPoint, mapProps, groundFor } from '../src/maps.js';
import { overheadMapSVG } from '../src/ui/overhead-map.js';
import { OVERHEAD_HILLS, channelOutline, overheadFrame } from '../src/ui/overhead-hills.js';
import { playableOutline } from '../src/playable-area.js';

const hw = maps['hollow-wick'];
const r2 = v => Math.round(v * 100) / 100;
const count = (text, needle) => text.split(needle).length - 1;

test("Deadwater's (and Dry Creek's) overhead map is exactly as before", () => {
 // A fixed stand-in view; the hashes were taken before s3-look.
 const view = { roadProfile: [{ z: -124, left: -4, right: 4 }, { z: 0, left: 10, right: 18 }, { z: 124, left: 51, right: 59 }], farmRoadPoints: [[60, 80], [70, 90], [72, 88]], approachPaths: [{ points: [{ x: 1, z: 2 }, { x: 5, z: 9 }] }] };
 const hash = id => createHash('sha256').update(overheadMapSVG(maps[id], view, { x: 3, z: 4 })).digest('hex');
 assert.equal(hash('deadwater'), '2cbe818df5068e0801d5ba812ab80cd0c9b4c9feb4aa0e2b5ad5b97d5b89e15c');
 assert.equal(hash('dry-creek'), 'ee2d158fcede4fe87680ecb5a93003b0a21ca53f0c259c12e1443c0de42348a4');
});

test("Hollow Wick's overhead map shows the stream, paths, decks, buildings, fence and woods", () => {
 // (A terrain map needs nothing from the view: no road profile.)
 const svg = overheadMapSVG(hw, {}, { x: -10, z: -2 }), t = hw.terrain;
 // Framed on the fence, not the whole ground.
 const f = overheadFrame(hw), outline = playableOutline(hw);
 for (const [x, z] of outline) assert.ok(x >= f.x && x <= f.x + f.w && z >= f.z && z <= f.z + f.d);
 assert.ok(f.w < hw.width + 5);
 // The irregular fence: its outline, clipped to and drawn over the top.
 assert.equal(count(svg, `points="${outline.map(p => p.map(v => Math.round(v * 100) / 100).join(',')).join(' ')}"`), 3);
 assert.ok(svg.includes(`stroke="${OVERHEAD_HILLS.fenceLine}"`));
 // The stream: one channel per water line, as wide as the water.
 assert.equal(count(svg, `fill="${OVERHEAD_HILLS.water}"`), 1);
 assert.equal((svg.match(new RegExp(`<g fill="${OVERHEAD_HILLS.water}"[^>]*>(.*?)</g>`))[1].match(/<polygon/g) || []).length, t.water.length);
 // The drawn paths at their width; the shaping-only ones as faint trails.
 const drawn = t.paths.filter(p => p.colourMix !== 0);
 for (const p of drawn) assert.ok(svg.includes(`<polyline stroke-width="${p.width}" points="${p.points.map(q => q.slice(0, 2).map(r2).join(',')).join(' ')}"/>`), p.id);
 assert.ok(drawn.length >= 4 && drawn.length < t.paths.length);
 // The decks.
 for (const deck of t.decks) assert.ok(svg.includes(`<polygon points="${deck.poly.map(q => q.map(r2).join(',')).join(' ')}"/>`), deck.id);
 // Every building, turned as it stands (its corners through buildingPoint), on its pad.
 for (const b of hw.buildings) {
  const c = buildingPoint(b, b.w / 2, b.d / 2);
  assert.ok(svg.includes(`${Math.round(c.x * 100) / 100},${Math.round(c.z * 100) / 100}`), b.id);
 }
 assert.equal(count(svg, `fill="${OVERHEAD_HILLS.pad}"`), hw.buildings.length);
 // The woods: every tree's crown, and every tree that is a prop (the hanging
 // tree, the orchard); the North and West Woods' floors (ground layers).
 const treeProps = mapProps(hw).filter(p => /Tree$/.test(p.type));
 assert.ok(treeProps.some(p => p.type === 'hangingTree'));
 assert.equal(count(svg, '<circle'), hw.trees.trees.length + treeProps.length + (t.knolls?.length || 0) + 2);
 // Every ground edge (bank, wall, cliff) as a line, and the levels built over
 // the water (the dam's walkway) as solid ground.
 const edges = groundFor(hw).edges || [];
 assert.ok(edges.length > 10);
 assert.equal(count(svg, '<line x1='), edges.length);
 for (const l of (t.levels || []).filter(l => l.overWater)) assert.ok(svg.includes(`<polygon points="${l.poly.map(q => q.map(r2).join(',')).join(' ')}"/>`), l.id);
 assert.ok((t.levels || []).some(l => l.overWater));
 assert.ok(hw.trees.trees.filter(tr => tr.kind === 'woods').length > 50);
 // The player.
 assert.ok(svg.includes('cx="-10" cy="-2"'));
});

test('a channel outline is as wide as the water at every point', () => {
 const line = [[0, 0, 2], [10, 0, 3], [20, 5, 2.5]], ring = channelOutline(line), n = line.length;
 for (let i = 0; i < n; i++) {
  const a = ring[i], b = ring[2 * n - 1 - i];
  assert.ok(Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1]) - line[i][2] * 2) < 1e-9);
 }
});
