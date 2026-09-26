// Hollow Wick's buildings (s2-buildings): every pad has its building, standing
// at the pad's height; every doorway opens onto walkable dry ground with 2 m
// clear; buildings keep off each other and off the paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hollowWick, BUILDING_PADS } from '../src/maps/hollow-wick.js';
import { groundFor, buildingOpenings, buildingContains, buildingWalls, mapColliders, localOpenings } from '../src/map-kit.js';
import { terrainPads } from '../src/world/terrain-bake.js';
import { isPlayable } from '../src/playable-area.js';

const map = hollowWick, ground = groundFor(map);
const STYLES = new Set(['colonial-house', 'colonial-lit-house', 'colonial-tavern', 'meetinghouse', 'smithy', 'barn', 'gristmill', 'shed', 'horse-sheds', 'tomb']);

test('every pad has its colonial building, at the pad height', () => {
  assert.equal(map.buildings.length, BUILDING_PADS.length);
  for (const p of BUILDING_PADS) {
    const b = map.buildings.find(b => b.id === p.id);
    assert.ok(b, p.id);
    for (const k of ['x', 'z', 'w', 'd']) assert.equal(b[k], p[k], `${p.id} ${k}`);
    assert.equal(b.angle || 0, p.angle || 0, `${p.id} angle`);
    assert.equal(b.baseY, p.h, `${p.id} baseY`);
    assert.equal(b.style, 'colonial');
    if (p.id === 'forge') assert.equal(b.interiorStyle, undefined, 'the forge is an open shed');
    else assert.ok(STYLES.has(b.interiorStyle), `${p.id} interiorStyle ${b.interiorStyle}`);
  }
});

test("the buildings make exactly the pads the terrain had (margin and blend kept)", () => {
  assert.equal(map.terrain.pads, undefined, 'no duplicate pads in the spec');
  const pads = terrainPads(map);
  for (const p of BUILDING_PADS) {
    const q = pads.find(q => q.x === p.x && q.z === p.z);
    assert.deepEqual(q, { x: p.x, z: p.z, w: p.w, d: p.d, angle: p.angle || 0, h: p.h, margin: p.margin ?? 1.5, blend: p.blend ?? 2 }, p.id);
  }
});

test('houses have two doors or more; heights read as the period', () => {
  const doors = b => localOpenings(b).filter(o => o.type === 'door').length;
  for (const b of map.buildings) {
    const ridge = b.height + b.roof.rise;
    if (b.interiorStyle?.startsWith('colonial')) {
      assert.ok(doors(b) >= 2, `${b.id} has ${doors(b)} doors`);
      assert.ok(ridge >= 5 && ridge <= 6.8, `${b.id} ridge ${ridge}`);
    }
    if (['shed', 'horse-sheds', 'tomb'].includes(b.interiorStyle) || b.id === 'forge') assert.ok(ridge <= 4.2, `${b.id} is low`);
  }
  const tallest = Math.max(...map.buildings.filter(b => b.id !== 'meetinghouse').map(b => b.height + b.roof.rise));
  const meeting = map.buildings.find(b => b.id === 'meetinghouse');
  assert.ok(meeting.height + meeting.roof.rise > tallest, 'the meetinghouse is the tallest (and its belfry more)');
  assert.equal(localOpenings(map.buildings.find(b => b.id === 'horse-sheds')).filter(o => o.type === 'door').length, 4, 'four open bays');
});

test('every doorway opens onto 2 m of walkable, dry, open ground', () => {
  const colliders = mapColliders(map).filter(c => !c.buildingId || !c.interiorCover);
  const hits = (x, z, r) => colliders.some(c => {
    const a = c.angle || 0, cs = Math.cos(a), sn = Math.sin(a), dx = x - c.x, dz = z - c.z;
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs, hw = (c.localW ?? c.w) / 2, hd = (c.localD ?? c.d) / 2;
    return Math.hypot(lx - Math.max(-hw, Math.min(hw, lx)), lz - Math.max(-hd, Math.min(hd, lz))) < r;
  });
  for (const b of map.buildings) for (const o of buildingOpenings(b).filter(o => o.type === 'door')) {
    const mx = (o.a.x + o.b.x) / 2, mz = (o.a.z + o.b.z) / 2;
    // Outward: away from the building's middle, square to the wall.
    const ux = o.b.x - o.a.x, uz = o.b.z - o.a.z, len = Math.hypot(ux, uz);
    let nx = -uz / len, nz = ux / len;
    if (nx * (mx - b.x) + nz * (mz - b.z) < 0) { nx = -nx; nz = -nz; }
    for (const out of [.75, 1.4, 2]) for (const side of [-.5, 0, .5]) {
      const x = mx + nx * out + ux / len * side, z = mz + nz * out + uz / len * side, where = `${b.id} ${o.side} door, ${out} m out`;
      assert.ok(Math.abs(ground.heightAt(x, z) - b.baseY) < .35, `${where}: ground ${ground.heightAt(x, z).toFixed(2)} vs floor ${b.baseY}`);
      assert.ok(ground.bankDistance(x, z) >= 0 && !ground.wetAt(x, z), `${where}: in the water`);
      assert.ok(!ground.wallAt(x, z), `${where}: on a wall`);
      assert.ok(isPlayable(map, x, z, .45), `${where}: outside the fence`);
      assert.ok(!map.buildings.some(q => buildingContains(q, { x, z })), `${where}: inside a building`);
      // (A body fits 1.4 m out; nothing solid stands 2 m out.)
      if (out > 1) assert.ok(!hits(x, z, out < 2 ? .45 : .05), `${where}: blocked`);
    }
  }
});

test('buildings keep off each other and off the paths', () => {
  const corners = b => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => { const c = Math.cos(b.angle || 0), s = Math.sin(b.angle || 0), x = sx * b.w / 2, z = sz * b.d / 2; return [b.x + x * c + z * s, b.z - x * s + z * c]; });
  const axes = b => { const c = Math.cos(b.angle || 0), s = Math.sin(b.angle || 0); return [[c, -s], [s, c]]; };
  const overlap = (a, b) => [...axes(a), ...axes(b)].every(([ax, az]) => {
    const pa = corners(a).map(([x, z]) => x * ax + z * az), pb = corners(b).map(([x, z]) => x * ax + z * az);
    return Math.max(...pa) > Math.min(...pb) + 1e-6 && Math.max(...pb) > Math.min(...pa) + 1e-6;
  });
  const list = map.buildings;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) assert.ok(!overlap(list[i], list[j]), `${list[i].id} overlaps ${list[j].id}`);
  // A drawn path never touches a building. Two stage-1 pads sit on the ends of
  // shape-only graveyard aisles (colourMix 0): the tomb's back corner 0.31 m
  // into aisle-22's line, the horse sheds' corner 0.01 m into aisle-40's.
  // Those may clip a corner by up to 0.35 m (the aisle stays 1.7 m wide).
  for (const path of map.terrain.paths) for (let i = 1; i < path.points.length; i++) {
    const [ax, az] = path.points[i - 1], [bx, bz] = path.points[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / .1);
    for (let k = 0; k <= n; k++) {
      const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
      const b = list.find(b => buildingContains(b, { x, z }));
      if (!b) continue;
      const c = Math.cos(b.angle || 0), s = Math.sin(b.angle || 0), lx = (x - b.x) * c - (z - b.z) * s, lz = (x - b.x) * s + (z - b.z) * c;
      const depth = Math.min(b.w / 2 - Math.abs(lx), b.d / 2 - Math.abs(lz));
      assert.ok(path.colourMix === 0 && depth < .35, `path ${path.id} runs ${depth.toFixed(2)} m into ${b.id}`);
    }
  }
  // Nothing but walls: the walls are cut exactly at the openings.
  for (const b of list) assert.ok(buildingWalls(b).every(w => w.buildingId === b.id));
});

test('the colonial buildings build: finite geometry, one fading roof each, merged', async () => {
  const THREE = await import('three');
  const { WorldView } = await import('../src/render/renderer.js');
  const { mapProps } = await import('../src/map-kit.js');
  const view = Object.create(WorldView.prototype);
  Object.assign(view, { materials: new Map(), static: new THREE.Group(), scene: new THREE.Scene(), roofs: [], map, ground, props: new Map(), propDetails: [] });
  view.scene.add(view.static);
  for (const b of map.buildings) view.makeBuilding(b);
  // (The buildings' own parts: the graveyard's and the field's props have
  // their own tests and budgets.)
  const { isColonialPart } = await import('../src/world/colonial-buildings.js');
  for (const p of mapProps(map)) if (isColonialPart(p.type)) view.makeProp(p);
  assert.equal(view.roofs.length, map.buildings.length);
  assert.ok([...view.materials.keys()].every(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)), 'every part has a colour');
  let triangles = 0;
  for (const root of [view.static, ...view.roofs.map(r => r.group)]) root.updateMatrixWorld(true);
  for (const root of [view.static, ...view.roofs.map(r => r.group)]) root.traverse(o => {
    // (Placed where it can be drawn: a NaN height once hid the pulpit's sounding board.)
    assert.ok(o.matrixWorld.elements.every(Number.isFinite), `finite placement (${o.geometry?.type})`);
    // (A roof's blended copy for the see-through patch shares its geometry and
    // draws only while someone is by it: roof-fade.js. Not counted twice.)
    if (!o.geometry || o.userData.fadeOverlay) return;
    assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite), 'finite geometry');
    triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  for (const r of view.roofs) {
    assert.ok(r.doors.length >= 1 && r.casters.length >= 1 && r.materials.length === 1, r.id);
    // One draw for the shingles that cast, one for the rest (plus their depth copies).
    assert.ok(r.colour.length <= 2, `${r.id} roof draws ${r.colour.length}`);
    // Stood on its pad: the roof starts above the floor at baseY.
    const box = new THREE.Box3().setFromObject(r.group);
    assert.ok(box.min.y > r.baseY + 1.5 && box.max.y < r.baseY + (r.id === 'meetinghouse' ? 14 : 9), `${r.id} roof ${box.min.y.toFixed(1)}..${box.max.y.toFixed(1)}`);
  }
  const belfry = view.roofs.find(r => r.id === 'meetinghouse'), top = new THREE.Box3().setFromObject(belfry.group).max.y;
  assert.ok(top - belfry.baseY > 12, 'the belfry is the landmark');
  view.batch(view.static);
  assert.ok(triangles < 160000, `${triangles} triangles`);
});

test('an eave facing north runs on less (the camera looks from the south: its strip hid whoever stood there)', async () => {
  const { eaveRun, EAVE } = await import('../src/world/colonial-buildings.js');
  let north = 0;
  for (const b of map.buildings.filter(b => b.roof && b.roof.kind !== 'mound')) for (const side of [1, -1]) {
    const r = b.roof, a = b.angle || 0, lx = r.axis === 'z' ? side : 0, lz = r.axis === 'z' ? 0 : side, worldZ = -lx * Math.sin(a) + lz * Math.cos(a);
    const run = eaveRun(b, side), long = r.kind === 'saltbox' && side < 0;
    if (worldZ < -.5) { north++; assert.equal(run, EAVE.north + (long ? EAVE.saltboxNorth : 0), `${b.id} ${side}`); }
    else assert.equal(run, EAVE.run + (long ? EAVE.saltbox : 0), `${b.id} ${side}`);
    assert.ok(run <= .9 && run >= .2);
  }
  assert.ok(north >= 12, `${north} north eaves`);
  assert.ok(EAVE.north < EAVE.run && EAVE.north + EAVE.saltboxNorth < EAVE.run + EAVE.saltbox);
});
