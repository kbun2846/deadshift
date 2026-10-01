// Lumen's street clutter (owner, 2026-10-01: "remove some, maybe 20% of
// objects on the streets. theres too much clutter. some objects are
// perfectly vertical and difficult to see with camera so player just runs
// into them"). The count is tests/lumen-clutter-lib.js (node
// tools/lumen-clutter.mjs prints it). What the cut keeps:
//   - thin upright colliders (a box under 0.5 m across and 0.75 m or taller:
//     a post, a meter, a bin) stay few: a new mast is a `pole` (no collider,
//     as the street lamps) or gets a box as wide as what the camera sees;
//   - the street objects stay under the budget (409 before the cut);
//   - the streets stay one walk: no open ground sealed off, every spawn
//     point reached by a robot from the Crossroads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { maps, mapColliders, PROP_TYPES } from '../src/maps.js';
import { NavGrid } from '../src/bots/nav-grid.js';
import { buildingContains } from '../src/map-kit.js';
import { CROSSROADS } from '../src/maps/lumen-layout.js';
import { walkGrid } from '../tools/lumen-walk-lib.mjs';
import { lumenClutter, thinBoxes } from './lumen-clutter-lib.js';

const map = maps.lumen;
// The line the cut drew (15 thin colliders and 327 street objects when it landed).
const CLUTTER = Object.freeze({ thin: 15, street: 330, before: 409 });

test('lumen clutter: thin upright colliders a body runs into unseen stay few (a mast is a pole)', () => {
  const r = lumenClutter();
  assert.ok(r.thin.length <= CLUTTER.thin, `${r.thin.length} thin uprights (${CLUTTER.thin} at most): ${Object.entries(r.thinByType).map(([t, n]) => `${t} ${n}`).join(', ')}. A new mast or post is a \`pole\` (world/lumen-setpieces.js: no collider, as the street lamps) or gets a box as wide as what the camera sees.`);
  // No type both a pole and solid; a pole stands up (not walk-over) and has nothing a body meets.
  for (const [name, t] of Object.entries(PROP_TYPES)) if (t.pole) {
    assert.deepEqual(t.collisionBoxes, [], `${name}: a pole with a collider`);
    assert.ok(!t.walkOver, `${name}: a pole is not ankle clutter`);
  }
  const poles = new Set(map.props.filter(p => PROP_TYPES[p.type].pole).map(p => p.id));
  assert.ok(poles.size >= 5, `${poles.size} masts`);
  assert.equal(mapColliders(map).filter(c => poles.has(c.propId)).length, 0, 'a pole has a collider');
  // (The rule catches what players ran into.)
  for (const t of ['cityBollard', 'cityParkingMeter', 'cityHydrant', 'cityMeshBin']) assert.ok(thinBoxes(PROP_TYPES[t]).length, `${t} counts as thin`);
});

test('lumen clutter: the street objects stay under the budget the cut set (a fifth fewer), cars and cover kept', () => {
  const r = lumenClutter();
  assert.ok(r.street <= CLUTTER.street, `${r.street} street objects (${CLUTTER.street} at most; ${CLUTTER.before} before the cut): take one out for each one put in`);
  assert.ok(r.street <= CLUTTER.before * .82, `${r.street} of ${CLUTTER.before}`);
  // The cut took no car (the density zones are lumen-cover.test.js's) and left every kind of thing standing.
  assert.equal(r.streetByKind.vehicle, 48, 'vehicles');
  for (const k of ['cover', 'breakable', 'setpiece', 'screen']) assert.ok(r.streetByKind[k] > 0, k);
  // Every area keeps something to hide behind or break.
  for (const a of ['boulevard', 'avenue', 'west-street', 'north-lane', 'south-street', 'the-cut', 'crossroads', 'uptown', 'stacks', 'charging', 'metro', 'velvet-row', 'flatiron'])
    assert.ok((r.streetByArea[a] || 0) >= 5, `${a}: ${r.streetByArea[a] || 0}`);
});

test('lumen clutter: the streets stay one walk (no open ground sealed off) and a robot reaches every spawn point', () => {
  const g = walkGrid(map), d = g.walk(CROSSROADS.centre[0], CROSSROADS.centre[1]);
  let lost = 0;
  for (let j = 0; j < g.NZ; j++) for (let i = 0; i < g.NX; i++) {
    const k = j * g.NX + i; if (!g.free[k] || Number.isFinite(d[k])) continue;
    const x = g.X0 + (i + .5) * g.G, z = g.Z0 + (j + .5) * g.G;
    if (!map.buildings.some(b => buildingContains(b, { x, z }))) lost++;
  }
  // (25 cells of 0.25 m before the cut: slivers between parked pieces, none a body could be in)
  assert.ok(lost <= 25, `${lost} walkable cells cut off from the Crossroads`);
  const nav = new NavGrid(map, mapColliders(map)), [cx, cz] = CROSSROADS.centre;
  const reaches = (x, z) => { const p = nav.path(cx, cz, x, z); return p && p.length && Math.hypot(p[p.length - 1].x - x, p[p.length - 1].z - z) <= 1; };
  const points = [...map.bases.flatMap(b => b.points), ...map.ffaSpawns];
  const missed = points.filter(p => !reaches(p.x, p.z)).map(p => `${p.x},${p.z}`);
  assert.deepEqual(missed, []);
});
