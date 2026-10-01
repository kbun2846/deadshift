// Lumen's camera and cut, proved on the map itself (world/city-camera.js,
// world/city-cut.js, with the visibility audit's caster): the outdoor focus
// slides along tall walls instead of running into them (continuous, never
// backwards); walking every road, the camera stays off the walls beside
// you, your waist and head are never hidden, and nothing beside you is cut
// in your row; and inside, from every room of every building, the camera
// the renderer uses sees all of that room's floor.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CityCamera, CITY_CAMERA, bandWeight, cameraRows, tallFootprints } from '../src/world/city-camera.js';
import { CUT, insideFootprint, besideYou, roomView } from '../src/world/city-cut.js';
import { auditModel, blockedAt, castRay, floorPoints, roomStands, roomEye } from '../tools/lumen-visaudit-lib.mjs';

import { CityShells } from '../src/render/city-shells.js';
import { CAMERA_TILT, OUTDOOR_CAMERA_HEIGHT } from '../src/render/camera-framing.js';
import { buildingOpenings } from '../src/map-kit.js';
import { isPlayable } from '../src/playable-area.js';
import { ROADS } from '../src/maps/lumen-layout.js';
import { maps } from '../src/maps.js';

const square = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const { keep, give } = CITY_CAMERA, D1 = keep * give / (1 + give);

test('city camera: the focus stops short of a tall wall beside you, a little closer as you close in, and follows you along it', () => {
  // A long tall block east of an open street, from far north to far south.
  const cam = new CityCamera({ polygons: [square(10, 40, -80, 80)] });
  assert.equal(cam.focusX(-5, 0), -5, 'well away: the camera follows you');
  assert.equal(cam.focusX(10 - keep - 1.5, 0), 10 - keep - 1.5);
  const at = d => 10 - cam.focusX(10 - d, 0); // how far the focus stands from the wall
  assert.ok(Math.abs(at(.4) - D1) < .5, `at the wall: ${at(.4)} vs ${D1}`);
  assert.ok(D1 > 6 && D1 < 7);
  let last = Infinity;
  for (let d = keep; d >= .4; d -= .1) { const f = at(d); assert.ok(f <= last + 1e-9 && f >= d - 1e-9, `d ${d}: ${f}`); last = f; }
  // Along it, sideways it stays put.
  const x = 10 - 1;
  for (let z = -40; z <= 40; z += 5) assert.ok(Math.abs(cam.focusX(x, z) - cam.focusX(x, 0)) < 1e-9);
  // Mirrored for a wall to the west.
  const west = new CityCamera({ polygons: [square(-40, -10, -80, 80)] });
  assert.ok(Math.abs(west.focusX(-10 + .4, 0) - (-10 + .4 + (D1 - .4))) < .6);
});

test('city camera: between two walls closer than twice its distance it takes (about) the middle, and never runs back', () => {
  const cam = new CityCamera({ polygons: [square(-40, -6, -80, 80), square(6, 40, -80, 80)] });
  let last = -Infinity;
  for (let x = -5.5; x <= 5.5; x += .05) {
    const f = cam.focusX(x, 0);
    assert.ok(Math.abs(f) < 1, `x ${x}: ${f}`);
    assert.ok(f >= last - 1e-9, 'moves the way you move'); last = f;
  }
});

test('city camera: a building in front of you (between you and the camera) is not a wall beside you; near its end it lets go without a jump', () => {
  // A block 6 m south of the road you walk east along, from x = 0 to 40: in front, never beside.
  const far = new CityCamera({ polygons: [square(0, 40, 6, 30)] });
  for (let x = -20; x <= 60; x += 2) assert.equal(far.focusX(x, 0), x);
  // One 2 m south (within `gap` of your row): its faces pull a little, and let go past its ends.
  const cam = new CityCamera({ polygons: [square(0, 40, 2, 30)] });
  assert.equal(cam.focusX(20, 0), 20, 'in front of its middle: the camera follows you (the scoop lowers what is in the way)');
  let last = null;
  for (let x = -20; x <= 60; x += .25) {
    const f = cam.focusX(x, 0);
    if (last !== null) { assert.ok(f - last >= -1e-9, `x ${x}: back`); assert.ok(f - last < .5, `x ${x}: ${f - last}`); }
    last = f;
  }
  // Before its corner it holds the camera back a little, and fully once it reaches your row.
  assert.ok(0 - cam.focusX(-.5, 0) > 1);
  assert.ok(0 - cam.focusX(-.5, 3) > D1 - .5);
});

test('city camera: rows and weights', () => {
  assert.equal(bandWeight(-1), 0); assert.equal(bandWeight(9), 1); assert.equal(bandWeight(CITY_CAMERA.band.at(-1)[0]), 0);
  // Party walls and the ring's overlaps merge into one wall a row.
  const rows = cameraRows([square(0, 10, 0, 4), square(10.3, 20, 0, 4), square(30, 40, 0, 4)]);
  const j = Math.floor((2 - rows.z0) / CITY_CAMERA.row);
  assert.deepEqual([...rows.xs.slice(rows.start[j], rows.start[j + 1])], [0, 20, 30, 40]);
  // Lumen: tall buildings' rooms and blocked parts, and the ring; no low building.
  const lumen = maps.lumen, polys = tallFootprints(lumen), tall = lumen.cityBuildings.filter(b => b.tall);
  const expected = lumen.buildings.filter(r => tall.some(b => b.id === r.group)).length + tall.reduce((n, b) => n + (b.blocked?.length || 0), 0) + lumen.solids.filter(s => s.shell !== false).length;
  assert.equal(polys.length, expected); assert.ok(tall.length >= 12 && polys.length > 100);
  // Allocation-free per frame: the springs are the same typed arrays call after call.
  const cam = new CityCamera(lumen), arrays = [cam.eastAt, cam.eastK, cam.westAt, cam.westK];
  for (let i = 0; i < 200; i++) cam.focusX(-30 + i * .3, -20 + i * .2);
  assert.deepEqual([cam.eastAt, cam.eastK, cam.westAt, cam.westK], arrays);
});

// The map's cut, as the shells build it, and the visibility audit's caster
// (tools/lumen-visaudit-lib.mjs) over it.
const map = maps.lumen;
const shells = new CityShells({ scene: new THREE.Scene() }, map, { uniforms: { cutTexture: { value: null } }, cutTexture: null });
const model = auditModel(shells, map), cut = shells.cut;

test('city camera: walking every road of Lumen (centre lines and sidewalks, both ways), the camera keeps off the walls beside you, your waist and head are never hidden, and nothing beside you is cut', () => {
  const cam = new CityCamera(map), H = OUTDOOR_CAMERA_HEIGHT, back = H * CAMERA_TILT, speed = 7, step = .25, dt = step / speed, ease = 1 - Math.exp(-5.7 * dt);
  const lines = [];
  for (const r of ROADS) for (const o of [0, r.width / 2 + r.sidewalk / 2, -(r.width / 2 + r.sidewalk / 2)]) {
    if (r.axis === 'x') lines.push([r.id, r.from, r.centre + o, r.to, r.centre + o]);
    else if (r.axis === 'z') lines.push([r.id, r.centre + o, r.from, r.centre + o, r.to]);
    else { const [ax, az] = r.a, [bx, bz] = r.b, l = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / l, nz = (bx - ax) / l; lines.push([r.id, ax + nx * o - (bx - ax) / l * 12, az + nz * o - (bz - az) / l * 12, bx + nx * o, bz + nz * o]); }
  }
  const s = { samples: 0, checks: 0, worstStep: 0, side: Infinity, hidden: [], beside: [] }, hit = {};
  for (const [id, x0, z0, x1, z1] of lines) for (const dir of [1, -1]) {
    const [ax, az, bx, bz] = dir > 0 ? [x0, z0, x1, z1] : [x1, z1, x0, z0], len = Math.hypot(bx - ax, bz - az);
    let live = false, prev = 0, fx = 0, fz = 0, run = 0;
    for (let d = 0; d <= len; d += step) {
      const x = ax + (bx - ax) * d / len, z = az + (bz - az) * d / len;
      if (!isPlayable(map, x, z, .4) || cut.buildings.some(b => insideFootprint(b, x, z, .45))) { live = false; continue; }
      const target = cam.focusX(x, z);
      if (!live) { live = true; fx = target; fz = z; run = 0; }
      else s.worstStep = Math.max(s.worstStep, Math.abs(target - prev));
      prev = target; s.samples++;
      fx += (target - fx) * ease; fz += (z - fz) * ease; // (renderer.js: the focus eases after its target, 5.7/s)
      const eye = { x: fx, y: H, z: fz + back }, you = { x, z };
      cut.update(dt, eye, you, [], -1, null); run++;
      if (run < 30 || run % 8) continue; // (every 2 m, once the camera has caught up)
      s.checks++;
      for (const h of [.9, 1.7]) if (blockedAt(model, x, h, z, hit)) s.hidden.push(`${id} ${x.toFixed(1)},${z.toFixed(1)} at ${h} by slot ${hit.slot} (${hit.kind})`);
      // Beside you: the camera keeps off the walls (once it has caught up
      // with where it is going, CITY_CAMERA.gap m past a wall's north end:
      // its pull comes in over the first metres), and none of them is cut
      // in your row (the storeys on every line from the camera to K).
      for (const b of cut.buildings) {
        if (b.top < CITY_CAMERA.minTop || !besideYou(b, x, z)) continue;
        const dd = Math.abs(fx - target) < 1 && z - b.z0 >= CITY_CAMERA.gap ? distanceTo(b, eye.x, eye.z) : Infinity; if (dd < s.side) { s.side = dd; s.sideAt = `${id} ${x.toFixed(1)},${z.toFixed(1)} slot ${b.slot} eye ${eye.x.toFixed(1)},${eye.z.toFixed(1)}`; }
        for (let gx = x - CUT.you; gx <= x + CUT.you; gx += .5) {
          const e = model.cut.eye, dx = gx - e.x, dz = z - e.z;
          castRay(model, dx, -e.y, dz, Infinity, hit);
          if (hit.through === b && Math.abs(hit.tz - z) < 1.5) s.beside.push(`${id} ${x.toFixed(1)},${z.toFixed(1)} slot ${b.slot} over ${gx.toFixed(1)}`);
        }
      }
    }
  }
  cut.update(1, { x: 0, y: 29, z: 10 }, null, [], -1, null);
  assert.ok(s.samples > 10000 && s.checks > 1000, `${s.samples} samples, ${s.checks} checks`);
  assert.ok(s.worstStep < .5, `the focus moved ${s.worstStep.toFixed(3)} m for 0.25 m walked`);
  // (D1 at rest; the camera eases after you, so on the move a little less)
  assert.ok(s.side >= D1 - 1.5, `a wall beside you ${s.side.toFixed(2)} m from the camera (${s.sideAt})`);
  assert.deepEqual(s.hidden.slice(0, 8), [], `${s.hidden.length}: you hidden`);
  assert.deepEqual(s.beside.slice(0, 8), [], `${s.beside.length}: a building beside you cut beside you`);
});
// How far the camera's ground point (x, z) stands from the part of building
// b north of it (what it looks at; what stands behind it is out of view),
// 0 over it.
function distanceTo(b, x, z) {
  let best = Infinity;
  for (const poly of b.polygons) {
    if (insideFootprint({ ...b, polygons: [poly] }, x, z)) return 0;
    // The nearest point of the polygon; if it is south of the camera, the
    // nearest of the polygon's chord along the camera's row instead.
    let d = Infinity, qz = 0, lo = Infinity, hi = -Infinity;
    for (let i = 0, n = poly.length; i < n; i++) {
      const ax = poly[i][0], az = poly[i][1], bx = poly[(i + 1) % n][0], bz = poly[(i + 1) % n][1], ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1;
      const t = Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / l2)), dd = Math.hypot(x - ax - ex * t, z - az - ez * t);
      if (dd < d) { d = dd; qz = az + ez * t; }
      if ((az - z) * (bz - z) <= 0 && az !== bz) { const cx = ax + ex * (z - az) / ez; lo = Math.min(lo, cx); hi = Math.max(hi, cx); }
    }
    if (qz <= z) best = Math.min(best, d);
    else if (lo <= hi) best = Math.min(best, Math.abs(x - Math.min(hi, Math.max(lo, x))));
  }
  return best;
}

// From every room of every building (its middle and near each corner, a
// wide and an upright phone screen), with the room camera the renderer
// uses: every floor point of the room is seen (the cut clears what hides
// it: its own walls come down to the knee, a neighbour's storeys are cut
// over it, a first floor in the way is see-through over it).
test('city camera: from every room of every Lumen building (its middle and near each corner, a wide and a phone screen), the room camera sees all of its floor', () => {
  let rooms = 0, points = 0; const bad = [], hit = {};
  assert.equal(map.buildings.length, 121);
  for (const aspect of [16 / 9, 390 / 844]) {
    for (const room of map.buildings) {
      rooms++;
      const slot = shells.slots.get(room.group), rv = roomView(room, buildingOpenings(room)), floor = floorPoints(room);
      for (const [px, pz] of roomStands(room)) {
        const { eye, fx, fz, follow } = roomEye(room, px, pz, aspect);
        for (let i = 0; i < 4; i++) cut.update(.25, eye, { x: px, z: pz }, [], slot, rv);
        for (const [sx, sz] of floor) {
          if (follow && (Math.abs(sx - fx) > 20 || sz - fz < -12 || sz - fz > 8)) continue; // (what a following camera shows)
          points++;
          if (blockedAt(model, sx, .015, sz, hit) && bad.length < 10) bad.push(`${room.id} (${aspect.toFixed(2)}) at ${px.toFixed(1)},${pz.toFixed(1)}: floor ${sx.toFixed(1)},${sz.toFixed(1)} behind slot ${hit.slot} (${hit.kind})`);
        }
      }
    }
  }
  cut.update(1, { x: 0, y: 29, z: 10 }, null, [], -1, null);
  assert.equal(rooms, 242);
  assert.ok(points > 100000, `${points} floor points`);
  assert.deepEqual(bad, []);
});
