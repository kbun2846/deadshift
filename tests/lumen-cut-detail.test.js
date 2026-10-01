// Lumen's cut and the exterior detail (owner, 2026-10-01: "lots of buildings
// on lumen still have exterior detail showing when player goes in front of
// them and they go transparent"; world/city-cut.js rule 6, AGENTS.md > Lumen).
// A storey's wall shows only its outer face, so from behind it (the camera
// over a building, or looking through one whose near side is cut) the wall
// is gone; everything that hangs on it must go with it: the storeys' own end
// faces, every facade part, every sign and screen. And nothing stands inside
// the building next door (a party wall), where a cut or a camera coming in
// would bare it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CityShells } from '../src/render/city-shells.js';
import { FACADES } from '../src/render/city-facades.js';
import { maps } from '../src/maps.js';
import { CUT, CUT_ROLES, CityCut, cutBuilding, footprintMask, convexDistance, insideFootprint } from '../src/world/city-cut.js';

const map = maps.lumen;

// ---------------------------------------------------------------------------
// The rule on its own: a 10 x 8 m tower, 50 m tall, its first floor 3.6 m.
test('rule 6: a wall\'s dressing goes with the wall\'s face: from behind it inside the footprint, under the top; never in front, round a corner or over a low roof', () => {
  const poly = [[0, 0], [10, 0], [10, 8], [0, 8]];
  const tower = cutBuilding(1, [poly], 50, 3.6), low = cutBuilding(2, [[[20, 0], [30, 0], [30, 8], [20, 8]]], 5, 3.6);
  const cut = new CityCut([tower, low]);
  // A part on the tower's south face (z = 8, out +z), 20 m up, .3 m out; its anchor CUT.wall.back m in behind the line.
  const at = (x, z, nx, nz) => [x - nx * CUT.wall.back, z - nz * CUT.wall.back];
  const [ax, az] = at(5, 8, 0, 1);
  const eye = (x, y, z) => { cut.eye.x = x; cut.eye.y = y; cut.eye.z = z; };
  eye(5, 29, 18); assert.equal(cut.behindWall(5, 20, 8.3, ax, az, 50), false, 'in front of it');
  eye(5, 29, 4); assert.equal(cut.behindWall(5, 20, 8.3, ax, az, 50), true, 'from inside the tower');
  eye(5, 29, -6); assert.equal(cut.behindWall(5, 20, 8.3, ax, az, 50), true, 'through the tower from beyond it');
  // Round the corner: the line of sight crosses the wall's plane off the footprint.
  const [cx, cz] = at(9.8, 8, 0, 1);
  eye(16, 29, 7); assert.equal(cut.behindWall(9.8, 20, 8.3, cx, cz, 50), false, 'seen round the corner');
  eye(9, 29, 7); assert.equal(cut.behindWall(9.8, 20, 8.3, cx, cz, 50), true, 'the same part from inside');
  // A low building's storey part seen over its roof (the crossing above its top).
  const [lx, lz] = at(25, 8, 0, 1);
  eye(25, 29, 2); assert.equal(cut.behindWall(25, 4.4, 8.3, lx, lz, 5), false, 'over the low roof');
  eye(25, 6, 6); assert.equal(cut.behindWall(25, 4.4, 8.3, lx, lz, 5), true, 'under the low roof, through its wall');
  // A piece on no wall (anchored at its own xz) never.
  eye(5, 29, 4); assert.equal(cut.behindWall(5, 20, 8.3, 5, 8.3, 50), false);
  // A storey's end face (across the wall's thickness, where two runs meet) from inside: gone.
  for (const off of [-.19, 0, .19]) assert.equal(cut.behindWall(4, 20, 8 + off, 4, 8 - CUT.wall.back, 50), true, `end face at ${off}`);
});

// ---------------------------------------------------------------------------
// The real city: every tall building and ring tower, the camera over each of
// its parts (29 m up, as the city camera), the preset with the most detail.
const view = { scene: new THREE.Scene() }, city = { uniforms: { cutTexture: { value: null } }, cutTexture: null };
const shells = new CityShells(view, map, city);
shells.setQuality('extreme');
const meshes = [...shells.cellMeshes, ...shells.detailMeshes.flat()];
// Every triangle of a storey or a facade part above a first floor, by slot:
// its centroid, normal and anchor (the anchor is affine along a part, so the
// centroid's is the mean).
const bySlot = new Map();
for (const m of meshes) {
  const a = m.geometry.attributes, p = a.position.array, n = a.normal.array, c = a.cityCut.array, at = a.cityAt.array;
  for (let v = 0; v < c.length; v += 3) {
    const slot = Math.floor(c[v] / CUT_ROLES + .01), role = Math.round(c[v]) - slot * CUT_ROLES;
    if (role !== 1 && role !== 3) continue;
    const t = { x: (p[v * 3] + p[v * 3 + 3] + p[v * 3 + 6]) / 3, y: (p[v * 3 + 1] + p[v * 3 + 4] + p[v * 3 + 7]) / 3, z: (p[v * 3 + 2] + p[v * 3 + 5] + p[v * 3 + 8]) / 3,
      nx: n[v * 3], ny: n[v * 3 + 1], nz: n[v * 3 + 2], ax: (at[v * 2] + at[v * 2 + 2] + at[v * 2 + 4]) / 3, az: (at[v * 2 + 1] + at[v * 2 + 3] + at[v * 2 + 5]) / 3, role };
    let list = bySlot.get(slot); if (!list) bySlot.set(slot, list = []); list.push(t);
  }
}
// A building's outline edges (from the cut's own polygons: the footprints),
// each with its outward normal.
const edgesOf = b => b.polygons.flatMap((poly, k) => {
  let area = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
  return poly.map((p, i) => { const q = poly[(i + 1) % poly.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]), ux = (q[0] - p[0]) / len, uz = (q[1] - p[1]) / len, s = area > 0 ? 1 : -1; return { a: p, ux, uz, len, nx: s * uz, nz: -s * ux, k }; });
});
// Seen through its own wall (independent of the anchors: the wall is the
// footprint edge nearest the fragment, away from any corner): the camera
// behind that wall and the line of sight crossing it (.2 m in, past the
// wall's half thickness) between its ends, over the first floor, under the top.
function throughOwnWall(b, edges, eye, t) {
  let best = null, bd = Infinity;
  for (const e of edges) {
    const s = (t.x - e.a[0]) * e.ux + (t.z - e.a[1]) * e.uz, d = (t.x - e.a[0]) * e.nx + (t.z - e.a[1]) * e.nz;
    if (s < -.4 || s > e.len + .4 || d < -.25 || d > 2) continue;
    if (Math.abs(d) < bd) { bd = Math.abs(d); best = { e, s, d }; }
  }
  // (none, or by a corner, its own part's or where another part of the
  // building meets it: which wall it hangs on is not clear from here)
  if (!best || best.s < .6 || best.s > best.e.len - .6) return false;
  if (b.polygons.some((poly, k) => k !== best.e.k && convexDistance(poly, t.x, t.z) > -1.5)) return false;
  const { e } = best, ec = (eye.x - e.a[0]) * e.nx + (eye.z - e.a[1]) * e.nz, plane = -.2;
  if (ec > plane - .05 || best.d < plane) return false;
  const k = (plane - ec) / (best.d - ec), qx = eye.x + (t.x - eye.x) * k, qy = eye.y + (t.y - eye.y) * k, qz = eye.z + (t.z - eye.z) * k;
  const qs = (qx - e.a[0]) * e.ux + (qz - e.a[1]) * e.uz;
  // (between its ends, on a stretch of the building's own: not against a neighbour's footprint)
  return qs > .3 && qs < e.len - .3 && qy > b.floor + CUT.above && qy < b.top && insideFootprint(b, qx, qz, -.05);
}
// Spots over a building: its parts' centres and points 1.5 m in from each corner, 29 m up.
function spotsOver(b) {
  const out = [];
  for (const poly of b.polygons) {
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    out.push({ x: cx, z: cz });
    for (const [x, z] of poly) { const dx = cx - x, dz = cz - z, l = Math.hypot(dx, dz) || 1; out.push({ x: x + dx / l * 1.5, z: z + dz / l * 1.5 }); }
  }
  return out.filter(s => insideFootprint(b, s.x, s.z, -.5));
}

test('from over a building, nothing of its storeys or facade parts is drawn through its own walls (every tall building and ring tower, Extreme\'s detail)', () => {
  const cut = shells.cut, floating = [];
  let checked = 0, spots = 0;
  for (const b of cut.buildings) {
    if (!b.upper || b.top < 30) continue; // (the camera at 29 m: a low roof is looked over, not through)
    const edges = edgesOf(b), list = bySlot.get(b.slot) || [];
    for (const s of spotsOver(b)) {
      const eye = { x: s.x, y: 29, z: s.z };
      // (the player 10 m north of the camera, as the city camera stands)
      cut.update(1, eye, { x: s.x, z: s.z - 10.1 }, [], -1, null);
      spots++;
      for (const t of list) {
        if (t.y <= b.floor + CUT.above) continue;
        if (Math.hypot(t.x - t.ax, t.z - t.az) < CUT.wall.onWall) continue; // (on no wall: a line across a courtyard)
        if (t.nx * (eye.x - t.x) + t.ny * (eye.y - t.y) + t.nz * (eye.z - t.z) <= 0) continue; // (a back face: culled)
        if (!throughOwnWall(b, edges, eye, t)) continue;
        checked++;
        if (!cut.hidden(b, t.x, t.y, t.z) && !cut.behindWall(t.x, t.y, t.z, t.ax, t.az, b.top)) floating.push(`slot ${b.slot} role ${t.role} (${t.x.toFixed(2)}, ${t.y.toFixed(2)}, ${t.z.toFixed(2)}) from (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
      }
    }
  }
  assert.ok(spots > 150 && checked > 20000, `${spots} spots, ${checked} faces checked`);
  assert.deepEqual(floating.slice(0, 6), [], `${floating.length} faces seen through their own wall`);
});

test('rule 6 never takes a part off a wall that faces the camera (no over-cut: the street\'s side of every building stands)', () => {
  const cut = shells.cut, wrong = [];
  let checked = 0;
  for (const b of cut.buildings) {
    if (!b.upper) continue;
    const list = bySlot.get(b.slot) || [];
    for (const e of edgesOf(b)) {
      // 12 m out from the middle of each face, 29 m up.
      const mx = e.a[0] + e.ux * e.len / 2, mz = e.a[1] + e.uz * e.len / 2;
      if (insideFootprint(b, mx + e.nx * 12, mz + e.nz * 12, .5)) continue;
      cut.eye.x = mx + e.nx * 12; cut.eye.y = 29; cut.eye.z = mz + e.nz * 12;
      for (const t of list) {
        const dx = t.x - t.ax, dz = t.z - t.az, off = Math.hypot(dx, dz);
        if (off < CUT.wall.onWall || Math.abs(dx / off * e.nx + dz / off * e.nz - 1) > 1e-3) continue; // (its wall faces this way)
        if (Math.abs((t.ax + dx / off * CUT.wall.back - e.a[0]) * e.nx + (t.az + dz / off * CUT.wall.back - e.a[1]) * e.nz) > 2e-3) continue; // (and is this face)
        checked++;
        if (cut.behindWall(t.x, t.y, t.z, t.ax, t.az, b.top)) wrong.push(`slot ${b.slot} (${t.x.toFixed(2)}, ${t.y.toFixed(2)}, ${t.z.toFixed(2)})`);
      }
    }
  }
  assert.ok(checked > 50000, `${checked}`);
  assert.deepEqual(wrong.slice(0, 6), [], `${wrong.length} parts on a wall facing the camera taken off`);
});

// ---------------------------------------------------------------------------
// Signs and screens on a wall: the same rule at their centre (city-signs.js
// mount / cutAway: their anchor CUT.wall.back m in behind their wall's line).
test('a sign or screen on a wall goes with the wall\'s face seen from behind it, and stays in front of it', async () => {
  await import('../src/render/city-systems.js');
  const { CityFeatures } = await import('../src/render/city-features.js');
  const v = { scene: new THREE.Scene(), static: new THREE.Group(), box: () => new THREE.Group(), qualityName: 'balanced', camera: new THREE.PerspectiveCamera(), focus: new THREE.Vector3() };
  const hub = new CityFeatures(v, { ...map, cityVehicleLights: [], city: { signs: true } }), signs = hub.signs, cut = hub.shells.cut;
  const tex = hub.shells.texture;
  let behind = 0, front = 0;
  const bad = [];
  for (const g of map.citySigns) {
    if (!g.buildingId || !g.at || g.mount === 'free' || !['neon', 'screen', 'panel'].includes(g.kind)) continue;
    const slot = hub.shells.slots.get(g.buildingId), b = cut.bySlot.get(slot);
    if (!b?.upper || g.at[1] <= b.floor + CUT.above || b.top < 30) continue; // (a low roof is looked over from 29 m)
    const c = signs.mount(slot, g.at, 0, g.facing || 0), nx = Math.sin(g.facing || 0), nz = Math.cos(g.facing || 0);
    assert.ok(Math.abs(Math.hypot(c[2] - c[4], c[3] - c[5]) - CUT.wall.back - FACADES.face) < 1e-6, g.id);
    // From inside its building, 6 m in behind its wall (past rule 5's radius round the camera), 29 m up.
    const ix = g.at[0] - nx * (FACADES.face + 6), iz = g.at[2] - nz * (FACADES.face + 6);
    if (insideFootprint(b, ix, iz, -.3) && g.at[1] < 29) {
      cut.update(1, { x: ix, y: 29, z: iz }, null, [], -1, null); cut.pack(hub.shells.cutUniforms, tex?.image.data, 128);
      behind++; if (!signs.cutAway(c)) bad.push(`${g.id} seen from behind`);
    }
    // 12 m in front of it: not taken off by rule 6.
    cut.eye.x = g.at[0] + nx * 12; cut.eye.y = 29; cut.eye.z = g.at[2] + nz * 12;
    front++; if (cut.behindWall(c[2], c[1], c[3], c[4], c[5], b.top)) bad.push(`${g.id} taken off in front`);
  }
  assert.ok(behind > 20 && front > 40, `${behind} behind, ${front} in front`);
  assert.deepEqual(bad.slice(0, 6), [], `${bad.length} signs`);
  // A piece on no wall (a lamp's, a free-standing screen's) is anchored at its centre.
  const free = signs.mount(3, [1, 9, 2], 0, null);
  assert.deepEqual(free.slice(4), [1, 2]);
});

test('no sign, screen or panel hangs inside another building or ring tower under its top (a party wall)', () => {
  const rooms = map.buildings.filter(r => r.group), outline = r => r.quad || [[r.x - r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z + r.d / 2], [r.x - r.w / 2, r.z + r.d / 2]];
  const height = new Map(map.cityBuildings.map(b => [b.id, b.tall ? b.height : b.height ?? 5]));
  const volumes = [
    ...rooms.map(r => ({ id: r.group, poly: outline(r), top: height.get(r.group) ?? 5 })),
    ...map.cityBuildings.flatMap(b => (b.blocked || []).map(([x0, x1, z0, z1]) => ({ id: b.id, poly: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], top: height.get(b.id) }))),
    ...map.solids.filter(s => s.shell !== false).map(s => { const a = s.angle || 0, c = Math.cos(a), n = Math.sin(a), hw = s.w / 2, hd = s.d / 2; return { id: 'tower', poly: [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [s.x + x * c + z * n, s.z - x * n + z * c]), top: s.height ?? 60 }; }),
  ];
  const buried = [];
  let n = 0;
  for (const g of map.citySigns) {
    if (!g.buildingId || !g.at || g.mount === 'free' || !['neon', 'screen', 'panel'].includes(g.kind)) continue;
    n++;
    const nx = Math.sin(g.facing || 0), nz = Math.cos(g.facing || 0), x = g.at[0] + nx * .1, z = g.at[2] + nz * .1;
    const foot = g.at[1] - (g.kind === 'neon' ? g.size ?? 1 : g.h ?? .5) / 2;
    const v = volumes.find(q => q.id !== g.buildingId && foot < q.top && convexDistance(q.poly, x, z) > .01);
    if (v) buried.push(`${g.id} (${g.kind}, ${g.at.map(q => q.toFixed(1)).join(', ')}) inside ${v.id}`);
  }
  assert.ok(n > 250, `${n}`);
  assert.deepEqual(buried.slice(0, 6), [], `${buried.length} pieces inside the building next door`);
});
