// Lumen's shells (render/city-shells.js), built without WebGL: every wall is
// built once (no two boxes with a coplanar face on the same line, where
// buildings, blocked parts and the ring's towers stand wall to wall or the
// towers overlap), every outer edge has exactly one first-floor wall, a cut
// storey tucks inside the wall below it, and a low room's first floor is no
// higher than its roof.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CityShells, SHELLS, WASH, shellDebug, roomEdges, coveredIntervals, insideIntervals, solidOutline, latticeStations, washAt, clipConvex } from '../src/render/city-shells.js';
import { maps } from '../src/maps.js';
import { CUT, CUT_ROLES, CUT_ROLE } from '../src/world/city-cut.js';

const map = maps.lumen, T = SHELLS.thickness;

function build() {
  shellDebug.walls = [];
  const view = { scene: new THREE.Scene() }, city = { uniforms: { cutTexture: { value: null } }, cutTexture: null };
  try { return { shells: new CityShells(view, map, city), walls: shellDebug.walls, view }; } finally { shellDebug.walls = null; }
}
const built = build();
// A wall box's line: its direction folded to one half-turn, and the signed
// distance of its centre from the parallel line through the origin.
const lineOf = w => {
  let ux = w.ux, uz = w.uz; if (ux < -1e-9 || (Math.abs(ux) < 1e-9 && uz < 0)) { ux = -ux; uz = -uz; }
  return { ux, uz, off: w.cx * -uz + w.cz * ux, along: w.cx * ux + w.cz * uz };
};

test('city shells: they build without WebGL, one slot a building and a tower', () => {
  const { shells, walls, view } = built;
  const towers = map.solids.filter(s => s.shell !== false).length;
  assert.equal(shells.slotCount, map.cityBuildings.length + towers);
  assert.ok(walls.length > 1000);
  assert.ok(view.scene.children.includes(shells.group) && view.scene.children.includes(shells.upper));
});

test('city shells: no two wall boxes share a coplanar face (buildings, blocked parts and towers side by side, towers overlapping)', () => {
  const walls = built.walls.map(w => ({ ...w, ...lineOf(w) }));
  // Bucket by direction, then compare the boxes of one direction.
  const dirs = new Map();
  for (const w of walls) { const k = Math.round(Math.atan2(w.uz, w.ux) * 1000); (dirs.get(k) || dirs.set(k, []).get(k)).push(w); }
  const bad = [];
  for (const list of dirs.values()) {
    list.sort((a, b) => a.off - b.off);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length && list[j].off - list[i].off < T + .01; j++) {
      const a = list[i], b = list[j];
      const along = Math.min(a.along + a.length / 2, b.along + b.length / 2) - Math.max(a.along - a.length / 2, b.along - b.length / 2);
      const high = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (along < .01 || high < -.001) continue;
      // Side faces facing the same way on one plane, overlapping (heights overlapping).
      const faces = high > .01 && [[-1], [1]].some(([s]) => Math.abs((a.off + s * a.thickness / 2) - (b.off + s * b.thickness / 2)) < .005);
      // Tops at one height, overlapping across the line.
      const across = Math.min(a.off + a.thickness / 2, b.off + b.thickness / 2) - Math.max(a.off - a.thickness / 2, b.off - b.thickness / 2);
      const tops = Math.abs(a.y1 - b.y1) < .005 && across > .005;
      if (faces || tops) bad.push(`(${a.cx.toFixed(2)}, ${a.cz.toFixed(2)}) ${a.y0}-${a.y1} t${a.thickness.toFixed(3)} s${a.stamp} / (${b.cx.toFixed(2)}, ${b.cz.toFixed(2)}) ${b.y0}-${b.y1} t${b.thickness.toFixed(3)} s${b.stamp}`);
    }
  }
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} coplanar pairs`);
});

test('city shells: every outer edge (a room\'s not against its own building, a blocked part\'s, a tower\'s) has exactly one first-floor wall', () => {
  const lower = built.walls.filter(w => (w.stamp % CUT_ROLES === CUT_ROLE.fixed || w.stamp % CUT_ROLES === CUT_ROLE.lintel) && w.y1 > 2.9).map(w => ({ ...w, ...lineOf(w) }));
  const count = (x, z, ux, uz) => {
    let n = 0, edge = false;
    for (const w of lower) {
      if (Math.abs(w.ux * uz - w.uz * ux) > 1e-3) continue; // (a wall across the edge)
      const off = x * -w.uz + z * w.ux, along = x * w.ux + z * w.uz;
      if (Math.abs(off - w.off) > .01) continue;
      const d = Math.abs(along - w.along) - w.length / 2;
      if (d < -.005) n++; else if (d < .005) edge = true;
    }
    return edge && n !== 1 ? 1 : n; // (a point on a piece's end: skipped)
  };
  const check = (label, edges, covered = () => []) => {
    for (const e of edges) {
      const [ax, az] = e.a, [bx, bz] = e.b, len = Math.hypot(bx - ax, bz - az), cov = covered(e);
      for (let t = .137; t < len - .1; t += .5) {
        if (cov.some(([a, b]) => t > a - .02 && t < b + .02)) continue;
        const n = count(ax + (bx - ax) * t / len, az + (bz - az) * t / len, (bx - ax) / len, (bz - az) / len);
        assert.equal(n, 1, `${label}: ${n} first-floor walls at ${t.toFixed(2)} m along (${ax}, ${az})-(${bx}, ${bz})`);
      }
    }
  };
  for (const spec of map.cityBuildings) {
    const rooms = map.buildings.filter(b => b.group === spec.id);
    const blocked = (spec.blocked || []).map(([x0, x1, z0, z1]) => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }));
    for (const room of rooms) check(room.id, roomEdges(room), e => coveredIntervals(e, [...rooms.filter(r => r !== room), ...blocked]));
    for (const part of blocked) check(`${spec.id} blocked`, roomEdges(part), e => coveredIntervals(e, rooms));
  }
  // A tower's wall inside an earlier tower has none (hidden in that one).
  const outlines = map.solids.filter(s => s.shell !== false).map(solidOutline);
  outlines.forEach((quad, i) => check(`tower ${i}`, roomEdges({ quad }), e => insideIntervals(e, outlines.slice(0, i))));
});

test('city shells: towers against buildings leave the first floor to the building and stand their storeys back to back with it', () => {
  // The towers' walls (sealed colour, by stamp) and the buildings' on one line:
  // at most one first floor, and the storeys each on its own side.
  const towerSlots = new Set([...Array(map.solids.filter(s => s.shell !== false).length)].map((_, i) => map.cityBuildings.length + 1 + i));
  const towerUpper = built.walls.filter(w => towerSlots.has(Math.floor(w.stamp / CUT_ROLES)) && w.thickness < T - .01);
  assert.ok(towerUpper.length > 20, 'the towers have party walls (with buildings and with each other)');
  for (const w of towerUpper) assert.ok(Math.abs(w.thickness - (T / 2 - .005)) < 1e-9);
});

test('city shells: nothing moves (the rule is per fragment: world/city-cut.js cityHidden), and the program key moved on', () => {
  const { shells } = built, shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\nvoid main() {\n#include <clipping_planes_fragment>\n#include <emissivemap_fragment>\n}' };
  shells.material.onBeforeCompile(shader);
  // The vertex shader moves only a room's knee wall (ROOM_VIEW), a gone
  // section cap and a gone plug; never a storey or a roof.
  assert.ok(!/cityHeight|cityTopAt|cityScoop/.test(shader.vertexShader));
  assert.match(shader.vertexShader, /vCityWorld = \(modelMatrix \* vec4\(transformed, 1\.0\)\)\.xyz;/);
  assert.match(shader.fragmentShader, /if \(vCityInfo\.z > -\.5 && \(cityHidden\(vCityWorld, vCityInfo\.x, vCityInfo\.y, vCityInfo\.w, vCityNear\)\s*\|\| \(vCityWall\.w > \.5 && vCityWorld\.y > vCityInfo\.x \+ [\d.]+ && cityBehindWall\(vCityWorld, vCityWall\.xy, vCityWall\.z\)\)\)\) discard;/);
  // Rule 6: a wall's dressing (role 3) hands its anchor and its building's top to the fragment.
  assert.match(shader.vertexShader, /vCityWall = vec4\(cityAt, cityRow\.w, 1\.0\)/);
  assert.match(shader.fragmentShader, /totalEmissiveRadiance \+= vCityGlow \* diffuseColor\.rgb;/);
  for (const u of ['cityCutMap', 'cutEye', 'cutTargets', 'cityRoomQuad', 'cityRoomOn', 'cityDoors', 'cityDoorCount', 'cityFootMask', 'cityFootBox']) assert.ok(shader.uniforms[u], u);
  assert.equal(shells.material.customProgramCacheKey(), 'lumen-city-shell-v10');
  assert.equal(shells.occluderMaterial.customProgramCacheKey(), 'lumen-city-shell-occluder-v6');
  const twin = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: 'void main() {\n#include <clipping_planes_fragment>\n}' };
  shells.occluderMaterial.onBeforeCompile(twin);
  assert.match(twin.fragmentShader, /cityHidden/, 'the mirror\'s black twin has the same holes');
  // The mask: the footprints as a texture, over the city.
  assert.equal(shells.cutUniforms.cityFootMask.value, shells.maskTexture);
  assert.equal(shells.maskTexture.image.width, shells.cut.mask.w);
});

// Rule 2 (world/city-cut.js): a dark section cap over every footprint with
// storeys, just over its first floor's walls (over every inner wall and
// lintel top), under anything the rule cuts; towers that overlap never
// share its height.
test('city shells: every building and tower with storeys has a section cap over its whole footprint, just over its first floor', () => {
  const { shells } = built, area = new Map(), heights = new Map();
  const polyArea = p => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; };
  for (const c of shells.plan.caps) {
    const slot = Math.floor(c.stamp / CUT_ROLES), role = c.stamp - slot * CUT_ROLES;
    if (role !== CUT_ROLE.section) continue;
    area.set(slot, (area.get(slot) || 0) + polyArea(c.poly));
    const row = shells.table[slot];
    assert.ok(c.y > row.z + .005 && c.y < row.z + CUT.above - .005, `slot ${slot}: its section cap at ${c.y.toFixed(3)} (first floor ${row.z})`);
    heights.set(slot, c.y);
  }
  let withStoreys = 0;
  for (const b of shells.cut.buildings) {
    if (!b.upper) { assert.ok(!area.has(b.slot), `slot ${b.slot} has no storey: its roof is its top`); continue; }
    withStoreys++;
    const whole = b.polygons.reduce((n, p) => n + polyArea(p), 0);
    assert.ok(Math.abs(area.get(b.slot) - whole) < 1e-6, `slot ${b.slot}: section ${area.get(b.slot)} of ${whole} m2`);
  }
  assert.ok(withStoreys > 80);
  // Nothing drawn on the first floor reaches over a section cap (walls,
  // lintels, inner walls; the facades' first-floor parts).
  for (const w of built.walls) {
    const slot = Math.floor(w.stamp / CUT_ROLES), role = w.stamp - slot * CUT_ROLES;
    if ((role === CUT_ROLE.fixed || role === CUT_ROLE.lintel) && slot > 0 && heights.has(slot)) assert.ok(w.y1 <= shells.table[slot].z + 1e-9);
  }
});

test('city rooms: a room lower than the first floor has its first floor at its roof', () => {
  const low = map.buildings.filter(b => b.group && b.wallHeight < 3.6);
  assert.ok(low.length >= 2, 'the bus and the checkpoint booth');
  for (const b of map.buildings) if (b.group) assert.ok(b.height <= b.wallHeight + 1e-9, `${b.id}: floor ${b.height} over its roof ${b.wallHeight}`);
  const bus = map.buildings.find(b => b.id === 'bus/bus'), booth = map.buildings.find(b => b.id === 'checkpoint-booth/booth');
  assert.equal(bus.height, 3.2); assert.equal(booth.height, 3);
  // Their shells: no storey above the first floor.
  for (const id of ['bus', 'checkpoint-booth']) {
    const slot = built.shells.slots.get(id);
    assert.equal(built.walls.filter(w => Math.floor(w.stamp / CUT_ROLES) === slot && w.stamp % CUT_ROLES === 1).length, 0, id);
  }
});

// The geometry the scoop bends: every storey (upper wall) in columns of at
// most SHELLS.column, breaking where its line crosses the lattice, and every
// cap in cells of that lattice, so a cap's edge meets its walls' tops.
test('city shells: storeys are columns of the lattice, caps its cells, and their breaks meet', () => {
  const G = SHELLS.column, uppers = built.shells.plan.walls.filter(w => w.kind === 'upper');
  assert.ok(uppers.length > 500);
  for (const w of uppers) {
    const cols = [0, ...w.stations, w.length];
    // (a crossing within 5 cm of an end, or 10 cm of another, is not a
    // break; a slanted line crosses the lattice up to sqrt 2 as far apart)
    const most = (Math.abs(w.ux) < 1e-6 || Math.abs(w.uz) < 1e-6 ? G : G * Math.SQRT2) + .1 + 1e-6;
    for (let i = 1; i < cols.length; i++) assert.ok(cols[i] - cols[i - 1] <= most && cols[i] - cols[i - 1] > .05, `column ${cols[i] - cols[i - 1]}`);
  }
  // A line along x breaks at every multiple of the lattice.
  assert.deepEqual(latticeStations(-2, 5, 1, 0, 4).map(v => +v.toFixed(3)), [.5, 2, 3.5]);
  // A cell clipped to a wedge: inside both, and the lattice's corners kept.
  const wedge = [[0, 0], [4, 0], [4, 3], [0, 1]], cell = clipConvex([[1.5, 0], [3, 0], [3, 1.5], [1.5, 1.5]], wedge);
  assert.ok(cell.some(([x, z]) => x === 3 && z === 0) && cell.every(([x, z]) => x >= 1.5 - 1e-9 && x <= 3 + 1e-9 && z <= 1.5 + 1e-9));
  // Every cap triangle (role 2) of a building with storeys lies in one lattice cell.
  let checked = 0;
  for (const m of built.shells.cellMeshes) {
    const p = m.geometry.attributes.position.array, c = m.geometry.attributes.cityCut.array;
    for (let v = 0; v < c.length; v += 3) {
      if (Math.round(c[v]) % 4 !== 2 || p[v * 3 + 1] < 4.5) continue;
      const xs = [p[v * 3], p[v * 3 + 3], p[v * 3 + 6]], zs = [p[v * 3 + 2], p[v * 3 + 5], p[v * 3 + 8]];
      const cx = Math.floor((xs[0] + xs[1] + xs[2]) / 3 / G), cz = Math.floor((zs[0] + zs[1] + zs[2]) / 3 / G);
      for (let i = 0; i < 3; i++) assert.ok(xs[i] >= cx * G - 1e-4 && xs[i] <= (cx + 1) * G + 1e-4 && zs[i] >= cz * G - 1e-4 && zs[i] <= (cz + 1) * G + 1e-4);
      checked++;
    }
  }
  assert.ok(checked > 1000, `${checked} cap triangles`);
});

test('city shells: every face is wound to face its normal, and a storey shows only its outer face', () => {
  let bad = 0, n = 0;
  for (const m of built.shells.cellMeshes) {
    const p = m.geometry.attributes.position.array, nor = m.geometry.attributes.normal.array;
    for (let v = 0; v < p.length; v += 9) {
      const ux = p[v + 3] - p[v], uy = p[v + 4] - p[v + 1], uz = p[v + 5] - p[v + 2], wx = p[v + 6] - p[v], wy = p[v + 7] - p[v + 1], wz = p[v + 8] - p[v + 2];
      const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
      if (cx * nor[v] + cy * nor[v + 1] + cz * nor[v + 2] < 0) bad++; n++;
    }
  }
  assert.equal(bad, 0, `${bad} of ${n} triangles wound against their normal`);
  // A storey's face points away from its own building (a party wall's: to the line).
  for (const w of built.shells.plan.walls.filter(w => w.kind === 'upper').slice(0, 400)) assert.ok(w.out && Math.abs(Math.hypot(...w.out) - 1) < 1e-9);
});

test('city shells: the facade wash is bounded, never saturated, smooth, and only in front of its light', () => {
  const pink = { x: 0, y: 4, z: .45, r2: 36, power: 30, r: 2.4, g: .4, b: .9, fx: 0, fz: 1, omni: false };
  const at = (x, y) => washAt(x, y, .19, 0, 1, [pink]);
  const lum = c => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
  let prev = null;
  for (let x = -7; x <= 7; x += .1) for (const y of [0, 2, 4, 6]) {
    const c = at(x, y), l = lum(c), hi = Math.max(...c), lo = Math.min(...c);
    assert.ok(l <= WASH.max + 1e-9, `luminance ${l}`);
    if (hi > 1e-6) assert.ok((hi - lo) / hi <= WASH.maxSaturation + 1e-6, 'saturation');
    if (y === 2) { if (prev) assert.ok(Math.abs(l - prev) < .9, `jump ${l - prev} at ${x}`); prev = l; }
  }
  assert.ok(lum(at(1.5, 3.5)) > 1, 'lit beside it');
  assert.ok(lum(at(0, 3.8)) < lum(at(1.5, 3.8)), 'less right behind it (its backing)');
  assert.deepEqual(at(7, 2), [0, 0, 0], 'out of reach');
  assert.deepEqual(washAt(0, 3, .19, 0, -1, [pink]), [0, 0, 0], 'a face turned away');
});

test('city shells: bakeLight washes the walls near the lights once, in finer columns there', () => {
  const view = { scene: new THREE.Scene() }, city = { uniforms: { cutTexture: { value: null } }, cutTexture: null };
  const shells = new CityShells(view, map, city), before = shells.triangles, occluders = shells.occluders;
  // A lamp at the Boulevard's north kerb and a sign on the laundromat's
  // north face (x -24..-16 on z 10.5, facing north).
  const lamp = { x: -5, y: 7, z: -8, colour: { r: .9, g: .95, b: 1 }, intensity: 1, reach: 9, kind: 'lamp', facing: 0 };
  const sign = { x: -20, y: 3, z: 10.1, colour: { r: 1, g: .03, b: .25 }, intensity: .9, reach: 6, kind: 'neon', facing: Math.PI };
  assert.equal(shells.bakeLight([lamp, sign]), 2);
  assert.ok(shells.triangles > before && shells.triangles < before * 1.2, `${before} -> ${shells.triangles}`);
  assert.ok(view.scene.children.includes(shells.occluders) && !view.scene.children.includes(occluders), 'the twin rebuilt in place');
  let lit = 0, max = 0;
  for (const m of shells.cellMeshes) { const g = m.geometry.attributes.cityGlow.array; for (let i = 0; i < g.length; i += 3) { const l = .2126 * g[i] + .7152 * g[i + 1] + .0722 * g[i + 2]; if (l > .01) lit++; max = Math.max(max, l); } }
  assert.ok(lit > 20 && max <= WASH.max + 1e-6, `${lit} lit, max ${max}`);
  // The first floors they reach have rows between the ground and the first
  // floor's top (the wash fades up and down them), and columns of at most
  // WASH.column (lit vertices along one face that close).
  const ys = new Set(), xs = [];
  for (const m of shells.cellMeshes) {
    if (!m.castShadow) continue;
    const p = m.geometry.attributes.position.array, g = m.geometry.attributes.cityGlow.array;
    for (let i = 0; i < g.length; i += 3) if (g[i] + g[i + 1] + g[i + 2] > .05) { ys.add(+p[i + 1].toFixed(2)); if (Math.abs(p[i + 2] - (10.5 - SHELLS.thickness / 2)) < .01 && p[i + 1] === 0) xs.push(p[i]); }
  }
  assert.ok([...ys].some(y => y > .1 && y < 3.5), [...ys].join(' '));
  xs.sort((a, b) => a - b); for (let i = xs.length - 1; i > 0; i--) if (xs[i] - xs[i - 1] < 1e-4) xs.splice(i, 1);
  const gaps = xs.slice(1).map((x, i) => x - xs[i]); // (a doorway leaves one wider gap)
  assert.ok(xs.length > 4 && gaps.filter(g => g > WASH.column + 1e-6).length <= 1, xs.join(' '));
});

// A storey's columns break where its cap's grid does, and each vertex's
// anchor (city-shells.js cityAt, world/city-cut.js rule 6) is on its wall's
// line moved CUT.wall.back m in: no crack, no overlap, and the shader reads
// the wall's outward normal from it.
test('city shells: a storey\'s columns meet its cap\'s edge vertex for vertex; the cap rides over the wall tops, never under the first floor\'s', () => {
  const caps = new Map(), key = (slot, x, z) => `${slot}:${x.toFixed(2)}:${z.toFixed(2)}`;
  let walls = 0, missed = [];
  for (const m of built.shells.cellMeshes) {
    const p = m.geometry.attributes.position.array, c = m.geometry.attributes.cityCut.array, at = m.geometry.attributes.cityAt.array;
    assert.equal(at.length, c.length * 2);
    for (let v = 0; v < c.length; v++) {
      const slot = Math.floor(c[v] / CUT_ROLES + .01), role = Math.round(c[v]) - slot * CUT_ROLES;
      if (role === 2) { let list = caps.get(slot); if (!list) caps.set(slot, list = []); list.push([p[v * 3], p[v * 3 + 2]]); assert.ok(at[v * 2] === p[v * 3] && at[v * 2 + 1] === p[v * 3 + 2]); }
    }
  }
  const capKeys = new Set([...caps].flatMap(([slot, list]) => list.map(([x, z]) => key(slot, x, z))));
  const lineOf = new Set();
  for (const m of built.shells.cellMeshes) {
    const p = m.geometry.attributes.position.array, c = m.geometry.attributes.cityCut.array, at = m.geometry.attributes.cityAt.array;
    for (let v = 0; v < c.length; v++) {
      const slot = Math.floor(c[v] / CUT_ROLES + .01), role = Math.round(c[v]) - slot * CUT_ROLES;
      if (role !== 1) continue;
      // Its anchor stands CUT.wall.back m in behind its wall's line (rule 6):
      // that line's point is CUT.wall.back m back out toward the vertex.
      const dx = p[v * 3] - at[v * 2], dz = p[v * 3 + 2] - at[v * 2 + 1], d = Math.hypot(dx, dz);
      assert.ok(Math.abs(d - CUT.wall.back) <= T * 1.5 + 1e-4, `${d}`);
      const lx = at[v * 2] + dx / d * CUT.wall.back, lz = at[v * 2 + 1] + dz / d * CUT.wall.back;
      // (off its own vertex by at most a wall and a half: on the line, or
      // the party line a tower overlapping others stands its copy back from)
      assert.ok(Math.hypot(lx - p[v * 3], lz - p[v * 3 + 2]) <= T * 1.5 + 1e-4);
      lineOf.add(key(slot, lx, lz)); lineOf.add(key(slot, lx + 4e-3, lz + 4e-3)); lineOf.add(key(slot, lx - 4e-3, lz - 4e-3));
    }
  }
  // Every column of every storey: its line point is where its vertices read
  // the scoop, and a vertex of its cap's edge.
  for (const w of built.shells.plan.walls) {
    if (w.kind !== 'upper') continue;
    const slot = Math.floor(w.stamp / CUT_ROLES);
    for (const st of w.stations) {
      const x = w.cx + w.ux * (st - w.length / 2) + w.shift[0], z = w.cz + w.uz * (st - w.length / 2) + w.shift[1];
      walls++;
      if (!lineOf.has(key(slot, x, z))) missed.push(`storey ${slot} ${x.toFixed(3)},${z.toFixed(3)}`);
      else if (!capKeys.has(key(slot, x, z)) && !(caps.get(slot) || []).some(([cx, cz]) => Math.hypot(cx - x, cz - z) < 2e-3)) missed.push(`cap ${slot} ${x.toFixed(3)},${z.toFixed(3)}`);
    }
  }
  assert.ok(walls > 2000, `${walls} columns`);
  assert.deepEqual(missed.slice(0, 5), [], `${missed.length} columns read the scoop off their line or where no cap edge does`);
});
