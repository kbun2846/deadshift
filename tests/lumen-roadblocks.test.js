// Lumen: the road blocks stand the way a closure would (owner, 2026-09-30: "all these road
// blocks and stuff should be placed varying, not just all facing one way ... they might be
// intended to have been blocking cars on the road, not horizontal on a horizontal road").
// Jersey barriers, hoardings, construction barriers, checkpoint barriers and water barriers
// that stand in a roadway lie across its lanes or angled to them (a lane closure, a chicane),
// at varied angles with some knocked askew; only a piece at the kerb may lie along the road
// (shielding the work zone). The other street furniture (dumpsters, benches, planters, boxes)
// is not all set square to the world either. The placement rules themselves are
// tests/lumen-cover.test.js's, which this only adds to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { maps, mapProps } from '../src/maps.js';
import { ROADS, CROSSROADS } from '../src/maps/lumen-layout.js';
import { LUMEN_PROPS } from '../src/maps/lumen-cover.js';

const map = maps.lumen, props = mapProps(map);
const BLOCKS = new Set(['cityJersey', 'cityHoarding', 'cityConstruction', 'cityCheckpointBarrier', 'cityWaterBarrier']);
const FURNITURE = new Set(['cityDumpster', 'cityBench', 'cityPlanter', 'cityPlanterTall', 'cityUtilityBox', 'cityKiosk', 'cityScreenWall', 'cityTrashBags', 'cityVending']);
const inCrossroads = p => p.x > CROSSROADS.x0 && p.x < CROSSROADS.x1 && p.z > CROSSROADS.z0 && p.z < CROSSROADS.z1;
const deg = a => a * 180 / Math.PI;

// The straight roads' frames: along (u) and the piece's offset across the centreline.
const straight = ROADS.filter(r => r.axis === 'x' || r.axis === 'z');
function roadwayOf(p) {
  for (const r of straight) {
    const s = r.axis === 'x' ? p.z - r.centre : p.x - r.centre, t = r.axis === 'x' ? p.x : p.z;
    if (t >= r.from && t <= r.to && Math.abs(s) <= r.width / 2 + .3) return { road: r, s, kerb: Math.abs(s) >= r.width / 2 - 1.3 };
  }
  return null;
}
// Degrees between a piece's long axis (local x runs along world (cos a, -sin a)) and the road: 0 along it, 90 across it.
const offRoad = (p, r) => {
  const dx = Math.cos(p.angle), dz = -Math.sin(p.angle), ux = r.axis === 'x' ? 1 : 0, uz = 1 - ux;
  return deg(Math.acos(Math.min(1, Math.abs(dx * ux + dz * uz))));
};
// (The stage 2 cover and the breakables' water barriers; the bases' sight screens, maps/lumen-spawns.js, stand for their spawn areas.)
const blocks = props.filter((p, i) => BLOCKS.has(p.type) && !inCrossroads(p) && (i < LUMEN_PROPS.length || p.type === 'cityWaterBarrier'));
const inRoad = blocks.map(p => ({ p, at: roadwayOf(p) })).filter(b => b.at);

test('road blocks in a roadway lie across the lanes or angled to them; only a kerb piece lies along the road', () => {
  assert.ok(inRoad.length >= 25, `${inRoad.length} road blocks in roadways`);
  const along = inRoad.filter(b => offRoad(b.p, b.at.road) < 25 && !b.at.kerb);
  assert.deepEqual(along.map(b => `${b.p.id} ${b.p.type} at ${b.p.x},${b.p.z}: ${offRoad(b.p, b.at.road).toFixed(0)} deg off the ${b.at.road.id}`), [], 'road blocks lying along the traffic, away from the kerb');
  const across = inRoad.filter(b => offRoad(b.p, b.at.road) >= 45);
  assert.ok(across.length / inRoad.length >= .75, `${across.length} of ${inRoad.length} road blocks are across or angled 45 degrees or more`);
});

test('road blocks vary: many angles, some knocked askew, none of one angle in bulk', () => {
  const angles = blocks.map(p => Math.round(((deg(p.angle) % 180) + 180) % 180));
  const buckets = new Set(angles.map(a => Math.floor(a / 15)));
  assert.ok(buckets.size >= 7, `${buckets.size} 15-degree angle buckets among ${blocks.length} road blocks`);
  const same = new Map(); for (const a of angles) same.set(a, (same.get(a) || 0) + 1);
  assert.ok(Math.max(...same.values()) / blocks.length <= .2, `${Math.max(...same.values())} of ${blocks.length} road blocks share one angle`);
  // Knocked askew: 20 to 50 degrees off square to the road (not merely jittered).
  const askew = inRoad.filter(b => { const o = offRoad(b.p, b.at.road); return o >= 35 && o <= 70; });
  assert.ok(askew.length >= 4, `${askew.length} road blocks knocked askew`);
  // Jittered: most are a few degrees off square, not exactly 90.
  const exact = inRoad.filter(b => Math.abs(offRoad(b.p, b.at.road) - 90) < 2);
  assert.ok(exact.length / inRoad.length <= .3, `${exact.length} of ${inRoad.length} road blocks are exactly square to the road`);
});

test('the other street furniture is not all set square to the world', () => {
  const pieces = props.filter(p => FURNITURE.has(p.type));
  const square = pieces.filter(p => { const a = Math.abs(deg(p.angle)) % 90; return a < 1 || a > 89; });
  assert.ok(pieces.length >= 40, `${pieces.length} pieces of street furniture`);
  assert.ok(square.length / pieces.length <= .5, `${square.length} of ${pieces.length} pieces of street furniture are square to the world`);
  for (const t of ['cityDumpster', 'cityBench', 'cityUtilityBox']) {
    const of = pieces.filter(p => p.type === t), sq = of.filter(p => { const a = Math.abs(deg(p.angle)) % 90; return a < 1 || a > 89; });
    assert.ok(sq.length / of.length <= .7, `${sq.length} of ${of.length} ${t} are square to the world`);
  }
});
