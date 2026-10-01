// Lumen's spawns and practice targets (stage 2; maps/lumen-spawns.js), and
// the layout as bodies walk it (tools/lumen-walk-lib.mjs): the three bases
// the same walk from the Crossroads, every room and every spawn reachable,
// the FFA points spread with cover by them, the targets placed by the rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { maps, mapColliders, buildingContains, buildingOpenings } from '../src/maps.js';
import { spawnProblem, inNoSpawn } from '../src/net/map-spawns.js';
import { CROSSROADS } from '../src/maps/lumen-layout.js';
import { SNIPER_LANE } from '../src/maps/lumen-cover.js';
import { walkGrid } from '../tools/lumen-walk-lib.mjs';
import { NavGrid } from '../src/bots/nav-grid.js';
import { segmentBox } from '../src/simulation.js';
import { onScreenOf } from '../src/render/camera-framing.js';
import { LUMEN_TARGET_SPOTS } from '../src/maps/lumen-spawns.js';

const map = maps.lumen, colliders = mapColliders(map);
const grid = walkGrid(map), fromCrossroads = grid.walk(CROSSROADS.centre[0], CROSSROADS.centre[1]);
const walkTo = (x, z) => grid.at(fromCrossroads, x, z);
const onLane = (x, z) => x > SNIPER_LANE.from[0] - 3 && x < SNIPER_LANE.to[0] + 2 && Math.abs(z - SNIPER_LANE.from[1]) < 3;

test('lumen spawns: three bases of 8 valid points, each the same walk from the Crossroads', () => {
  assert.deepEqual(map.bases.map(b => b.id), ['A', 'B', 'C']);
  const walks = [];
  for (const b of map.bases) {
    assert.equal(b.points.length, 8, b.id);
    for (const p of b.points) assert.equal(spawnProblem(map, colliders, p.x, p.z), null, `${b.id} ${p.x},${p.z}`);
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) assert.ok(Math.hypot(b.points[i].x - b.points[j].x, b.points[i].z - b.points[j].z) >= 1.6, `${b.id}: points a body apart`);
    walks.push(walkTo(b.x, b.z));
  }
  // (The plan's 45 m was a straight line; walked, the three areas are ~55 m.)
  for (const w of walks) assert.ok(w > 50 && w < 60, `walk ${w.toFixed(1)} m`);
  assert.ok(Math.max(...walks) - Math.min(...walks) < 2, `walks ${walks.map(w => w.toFixed(1))} differ`);
  // Base to base: no pair more than a fifth shorter than the longest.
  const pair = (a, b) => grid.at(grid.walk(a.x, a.z), b.x, b.z), [A, B, C] = map.bases, pairs = [pair(A, B), pair(A, C), pair(B, C)];
  assert.ok(Math.min(...pairs) >= .8 * Math.max(...pairs), `base to base ${pairs.map(w => w.toFixed(1))}`);
});

test('lumen spawns: team bases (B and C for two sides, all three for three)', () => {
  assert.deepEqual(map.teamBases, { 2: ['B', 'C'], 3: ['A', 'B', 'C'] });
});

test('lumen spawns: 24 FFA points, valid, ~20 m apart, never on the sniper lane or in a base', () => {
  const pts = map.ffaSpawns;
  assert.ok(pts.length >= 20 && pts.length <= 26, `${pts.length}`);
  for (const p of pts) {
    assert.equal(spawnProblem(map, colliders, p.x, p.z), null, `${p.x},${p.z}`);
    assert.ok(!onLane(p.x, p.z), `${p.x},${p.z} on the sniper lane`);
    for (const b of map.bases) for (const q of b.points) assert.ok(Math.hypot(p.x - q.x, p.z - q.z) >= 8, `${p.x},${p.z} in base ${b.id}`);
    assert.ok(Number.isFinite(walkTo(p.x, p.z)), `${p.x},${p.z} unreachable`);
  }
  let closest = Infinity; for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) closest = Math.min(closest, Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z));
  assert.ok(closest >= 18, `closest pair ${closest.toFixed(1)} m`);
});

test('lumen spawns: every room of every building is walked to from the Crossroads (robots too)', () => {
  const lost = map.buildings.filter(r => !Number.isFinite(walkTo(r.x, r.z)));
  assert.deepEqual(lost.map(r => r.id), []);
});

test('lumen targets: ~16, boards and dummies, placed clear, within 20 m of a base, off the lane', () => {
  const t = map.targets;
  assert.ok(t.length >= 14 && t.length <= 18, `${t.length}`);
  assert.ok(t.some(x => x.kind === 'dummy') && t.some(x => !x.kind) && t.some(x => x.moving));
  for (const x of t) {
    const inRoom = map.buildings.some(b => buildingContains(b, x));
    // (the one inside the capsule hotel stands in a room; every other on open ground)
    const why = spawnProblem(map, colliders, x.x, x.z, { clear: .7 });
    assert.ok(why === null || (why === 'building' && inRoom), `${x.id}: ${why}`);
    assert.ok(!onLane(x.x, x.z) && !inNoSpawn(map, x.x, x.z), `${x.id} on the lane / body pile`);
    const near = Math.min(...map.bases.map(b => Math.hypot(b.x - x.x, b.z - x.z)));
    assert.ok(near <= 20.5, `${x.id} ${near.toFixed(1)} m from a base`);
    assert.ok(Number.isFinite(walkTo(x.x, x.z)), `${x.id} unreachable`);
  }
  // clear of every outer door's apron (its width and .7 m each side, 2.4 m out), a mover's whole track too
  const aprons = [];
  for (const r of map.buildings) for (const o of buildingOpenings(r)) if (o.outer) {
    const mx = (o.a.x + o.b.x) / 2, mz = (o.a.z + o.b.z) / 2, l = Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z), ux = (o.b.x - o.a.x) / l, uz = (o.b.z - o.a.z) / l;
    let nx = -uz, nz = ux; if (buildingContains(r, { x: mx + nx * .3, z: mz + nz * .3 })) { nx = -nx; nz = -nz; }
    aprons.push({ id: r.id, mx, mz, ux, uz, nx, nz, w: (l + .2) / 2 + .7 });
  }
  for (const x of t) for (const dx of x.moving ? [-x.travel, -x.travel / 2, 0, x.travel / 2, x.travel] : [0]) {
    const px = x.x + dx;
    if (dx) assert.equal(spawnProblem(map, colliders, px, x.z, { clear: .7 }), null, `${x.id}'s track at ${px}`);
    for (const a of aprons) { const u = (px - a.mx) * a.ux + (x.z - a.mz) * a.uz, n = (px - a.mx) * a.nx + (x.z - a.mz) * a.nz; assert.ok(!(Math.abs(u) <= a.w && n >= 0 && n <= 2.4), `${x.id} in front of ${a.id}'s door`); }
  }
  // each group in sight of its standing spot (nothing that stops a round between)
  const stops = colliders.filter(c => c.wall || c.solid || c.blocksSight || (!c.walkOver && !c.lowTop && !c.playerOnly && (c.height ?? 0) >= 1.2));
  for (const spot of LUMEN_TARGET_SPOTS) for (const id of spot.targets) { const x = t.find(q => q.id === id); assert.ok(!stops.some(c => segmentBox(spot.x, spot.z, x.x, x.z, c, 0) !== null), `${id} hidden from ${spot.id}`); }
  // the long row: 10, 14, 18, 22 m from its standing spot
  const row = ['row-10', 'row-14', 'row-18', 'row-22'].map(id => t.find(x => x.id === id));
  assert.deepEqual(row.map(x => Math.round(Math.hypot(x.x - 34, x.z + 37.5))), [10, 14, 18, 22]);
});

test('lumen robots: the nav grid finds a way from the Crossroads into every room, and base to base', () => {
  const nav = new NavGrid(map, colliders), [cx, cz] = CROSSROADS.centre;
  // (A path that stops short counts as lost: nav.path returns the way to the
  // nearest square it can reach. Inner doorways narrower than 1.6 m let no
  // square's centre through, stage 4: city-rooms.js CITY_LINK.)
  const reaches = (p, x, z) => p && p.length && Math.hypot(p[p.length - 1].x - x, p[p.length - 1].z - z) <= 1;
  const lost = map.buildings.filter(r => !reaches(nav.path(cx, cz, r.x, r.z), r.x, r.z));
  assert.deepEqual(lost.map(r => r.id), []);
  for (const a of map.bases) for (const b of map.bases) if (a !== b) assert.ok(nav.path(a.x, a.z, b.x, b.z), `${a.id} to ${b.id}`);
});

test('lumen spawns: no line out of a base runs longer than the screen\'s east-west reach (20.5 m; the plan\'s 18 m holds but for a few lines out of B and C), cover that stops rounds counting', () => {
  const blockers = colliders.filter(c => c.blocksSight || (c.buildingId && !c.playerOnly) || c.solid || (!c.walkOver && !c.lowTop && !c.playerOnly && !c.destructible && (c.height ?? 0) >= 1.3 && c.propId !== undefined));
  let worst = 0, over = 0;
  for (const b of map.bases) for (const p of b.points) for (let a = 0; a < 360; a += 4) {
    const ux = Math.cos(a * Math.PI / 180), uz = Math.sin(a * Math.PI / 180); let r = .5, edge = false;
    for (; r < 40; r += .5) { if (!onScreenOf(16 / 9, ux * r, uz * r)) { edge = true; break; } if (blockers.some(c => segmentBox(p.x, p.z, p.x + ux * r, p.z + uz * r, c, 0) !== null)) break; }
    assert.ok(r <= 20.5, `${b.id} from ${p.x},${p.z} at ${a} deg: ${r} m`); worst = Math.max(worst, r); if (r > 18.5 && !edge) over++;
  }
  assert.ok(over <= 12, `${over} lines out of the bases longer than 18 m`);
});
