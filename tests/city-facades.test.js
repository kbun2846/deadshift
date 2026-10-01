// Lumen's facades (render/city-facades.js, dressed by render/city-shells.js),
// built without WebGL: every playable building and every ring tower a camera
// can see is dressed, no two alike; nothing stands in a doorway or out over
// the sidewalk; no colour near a team's, lit or not; every part carries the
// cut's stamp for its height (a first floor's never cut; above it, anchored
// behind its own wall's line, world/city-cut.js rule 6); faces wound to their
// normals; the preset
// ladder (Extreme never less than Quality) and the budget at the two
// densest views.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CityShells, SHELLS, roomEdges, solidOutline } from '../src/render/city-shells.js';
import { FACADES, FACADE_NEON, WINDOW_LIGHT, TOWER_GLASS, DOORWAY, facadeLook, towerLook, faceSeen, nightColour } from '../src/render/city-facades.js';
import { NEON } from '../src/render/city-signs.js';
import { buildingOpenings } from '../src/map-kit.js';
import { TEAMS } from '../src/config/match.js';
import { acesFilmic, deltaE2000, hexRgb, lab, toSrgb } from '../src/render/look-contrast.js';
import { maps } from '../src/maps.js';
import { CUT, CUT_ROLES, convexDistance } from '../src/world/city-cut.js';

const map = maps.lumen, T = SHELLS.thickness;
const view = { scene: new THREE.Scene() }, city = { uniforms: { cutTexture: { value: null } }, cutTexture: null };
const shells = new CityShells(view, map, city);
shells.setQuality('extreme'); // (the detail tiers are made the first time a preset shows them)
const towers = map.solids.filter(s => s.shell !== false);
// Every soup of parts: the ones in the shells' own cell meshes and the tiers.
const soups = [...shells.facades.cells.values()].flatMap(c => [c.fixed, c.rest, c.tiers[1], c.tiers[2], c.tiers[3]]).filter(s => s.count);
const each = fn => { for (const s of soups) { const a = s.arrays; for (let v = 0; v < s.count; v++) fn(a, v, s); } };

test('city facades: the palette is the signs\' (NEON), and the ring\'s glass is the owner\'s blue, navy, grey and near-black', () => {
  for (const [k, hex] of Object.entries(FACADE_NEON)) assert.equal(hex, NEON[k], k);
  assert.deepEqual(Object.keys(TOWER_GLASS).slice(0, 4), ['blue', 'navy', 'steel', 'black']);
  // The towers use them all, and more than one pattern each.
  const glass = new Set(towers.map((s, i) => towerLook(s, i).windows.glass)), styles = new Set(towers.map((s, i) => towerLook(s, i).recipe));
  // (as the darker night dresses them, 2026-09-30: every look colour x NIGHT.surface)
  for (const hex of Object.values(TOWER_GLASS)) assert.ok(glass.has(nightColour(hex)), hex);
  assert.ok(styles.size >= 6, [...styles].join());
});

test('city facades: every playable building (the bus left plain) and every ring tower a camera sees is dressed, no two alike', () => {
  const owners = shells.facades.owners;
  for (const b of map.cityBuildings) {
    if (b.id === 'bus') continue;
    assert.ok(owners.get(b.id)?.parts > 20, `${b.id}: ${owners.get(b.id)?.parts} parts`);
  }
  // A tower whose every outer face is a party wall, or inside an earlier
  // tower, or turned from every camera, has nothing seen to dress.
  const seenFace = new Set();
  const recs = shells.facadePieces;
  for (const r of recs) if (r.owner.startsWith('tower:') && r.seen && !r.party && !r.hidden) seenFace.add(r.owner);
  assert.ok(seenFace.size >= 45, `${seenFace.size} towers seen`);
  for (const id of seenFace) assert.ok(owners.get(id)?.parts > 0, `${id}: ${owners.get(id)?.parts} parts`);
  // No two share a recipe and a seed.
  const keys = new Set();
  for (const [id, o] of owners) { const key = `${o.recipe}:${o.seed}`; assert.ok(!keys.has(key), `${id} repeats ${key}`); keys.add(key); }
  assert.equal(keys.size, map.cityBuildings.length + towers.length);
  // Each district has its own recipe.
  const recipes = new Set(map.cityBuildings.map(b => facadeLook(b).recipe));
  for (const r of ['stacks', 'night-market', 'north-frontage', 'uptown', 'garage', 'charging', 'clinic', 'club', 'velvet-row', 'flatiron', 'booth']) assert.ok(recipes.has(r), r);
});

test('city facades: a face is dressed only where a camera can see it (north faces only glimpsed by an upright phone)', () => {
  const spots = [[0, 10]]; // (a camera over (0, 0))
  assert.equal(faceSeen(0, -10, 0, 1, spots), 2, 'a south face north of the camera');
  assert.equal(faceSeen(0, -10, 0, -1, spots), 0, 'its back');
  assert.equal(faceSeen(0, 14, 0, -1, spots), 1, 'a north face just south of the camera: only a phone\'s bottom edge');
  assert.equal(faceSeen(0, 30, 0, -1, spots), 0, 'far south of it');
  assert.equal(faceSeen(-12, 0, 1, 0, spots), 2, 'an east face to the west, leaning away at the screen\'s edge');
});

// Doors: every outer doorway on its wall line, and the footprints.
const doors = [];
for (const room of map.buildings.filter(b => b.group)) {
  const openings = buildingOpenings(room);
  for (const e of roomEdges(room)) {
    const [ax, az] = e.a, [bx, bz] = e.b, len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    for (const o of openings) if ((o.side ?? o.edge) === e.key && o.outer) doors.push({ ax, az, ux, uz, a: len / 2 + o.offset - o.width / 2, b: len / 2 + o.offset + o.width / 2, id: room.id });
  }
}
const footprints = [
  ...map.buildings.filter(b => b.group).map(r => r.quad || [[r.x - r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z - r.d / 2], [r.x + r.w / 2, r.z + r.d / 2], [r.x - r.w / 2, r.z + r.d / 2]]),
  ...map.cityBuildings.flatMap(b => (b.blocked || []).map(([x0, x1, z0, z1]) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]])),
  ...towers.map(solidOutline),
];
const segDist = (x, z, p, q) => { const dx = q[0] - p[0], dz = q[1] - p[1], t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - p[0] - dx * t, z - p[1] - dz * t); };
const inPoly = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [ax, az] = poly[j], [bx, bz] = poly[i]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) c = !c; } return c; };
const boxes = footprints.map(p => [Math.min(...p.map(q => q[0])), Math.max(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[1]))]);
// How far (x, z) stands outside every footprint (0 inside one).
function outside(x, z) {
  let best = Infinity;
  for (let i = 0; i < footprints.length; i++) {
    const b = boxes[i]; if (x < b[0] - best || x > b[1] + best || z < b[2] - best || z > b[3] + best) continue;
    const poly = footprints[i]; if (inPoly(poly, x, z)) return 0;
    for (let k = 0; k < poly.length; k++) best = Math.min(best, segDist(x, z, poly[k], poly[(k + 1) % poly.length]));
  }
  return best;
}

// (The doorway's own frame, DOORWAY (owner, 2026-09-30: doorways "subtly more
// apparent"), is the one part allowed beside an opening: flat on the wall's
// outer face, DOORWAY.depth proud at most, never over the opening itself.)
test('city facades: nothing in a doorway (its width and .3 m each side, up to 2.5 m) but its flat frame, nothing under 3 m standing more than .6 m out', () => {
  const bad = [], far = [];
  let n = 0, frames = 0;
  each((a, v) => {
    const x = a.position[v * 3], y = a.position[v * 3 + 1], z = a.position[v * 3 + 2];
    if (y < FACADES.doorTop - 1e-3) {
      for (const d of doors) {
        const off = (x - d.ax) * -d.uz + (z - d.az) * d.ux, t = (x - d.ax) * d.ux + (z - d.az) * d.uz;
        if (Math.abs(off) < 1.2 && t > d.a - FACADES.doorClear + 1e-3 && t < d.b + FACADES.doorClear - 1e-3) {
          const frame = Math.abs(off) <= T / 2 + DOORWAY.depth + 1e-3 && (t <= d.a + 1e-3 || t >= d.b - 1e-3) && t >= d.a - DOORWAY.jamb - 1e-3 && t <= d.b + DOORWAY.jamb + 1e-3;
          if (frame) { frames++; break; }
          bad.push(`${d.id} (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`); break;
        }
      }
    }
    if (y < FACADES.sidewalk.top - 1e-3 && v % 3 === 0) {
      n++;
      const o = outside(x, z);
      if (o > T / 2 + FACADES.sidewalk.reach + 1e-3) far.push(`(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) ${o.toFixed(2)} m out`);
    }
  });
  assert.ok(n > 5000, `${n} low vertices`);
  assert.deepEqual(bad.slice(0, 6), [], `${bad.length} part vertices in doorways`);
  assert.ok(frames > doors.length * 8, `${frames} doorway frame vertices for ${doors.length} doorways`);
  assert.deepEqual(far.slice(0, 6), [], `${far.length} low vertices over the sidewalk`);
});

test('city facades: no colour within 15 CIEDE2000 of a team colour, plain or lit (its glow on screen)', () => {
  const teams = TEAMS.map(t => lab(hexRgb(t.colour))), seen = new Set(), close = [];
  each((a, v) => {
    const c = [a.color[v * 3], a.color[v * 3 + 1], a.color[v * 3 + 2]], g = [a.cityGlow[v * 3], a.cityGlow[v * 3 + 1], a.cityGlow[v * 3 + 2]];
    const key = [...c, ...g].map(q => Math.round(q * 200)).join();
    if (seen.has(key)) return; seen.add(key);
    const shown = [c.map(q => toSrgb(Math.min(1, q)))];
    const glow = Math.max(...g);
    // (lit: its own glow and the scene's light, and a third more for bloom)
    if (glow > .01) for (const k of [1, 1.3]) shown.push(acesFilmic(c.map((q, i) => q * (.4 + g[i]) * k), 1).map(toSrgb));
    for (const s of shown) for (let i = 0; i < teams.length; i++) {
      const d = deltaE2000(lab(s), teams[i]);
      if (d < 15) close.push(`${s.map(q => Math.round(q * 255)).join(',')} ${TEAMS[i].name} ${d.toFixed(1)}`);
    }
  });
  assert.ok(seen.size > 200, `${seen.size} colours`);
  assert.deepEqual(close.slice(0, 8), [], `${close.length} too near a team colour`);
  // The window lights themselves, at full glow.
  for (const [k, hex] of Object.entries(WINDOW_LIGHT)) for (const t of teams) assert.ok(deltaE2000(lab(hexRgb(hex)), t) >= 15, k);
});

test('city facades: every part carries the cut for its height; above its first floor, its wall\'s anchor (rule 6) or none', () => {
  // world/city-cut.js CUT.wall: a part above its first floor (role 1: a flat
  // panel on the lattice; 3: anything else) is anchored CUT.wall.back m in
  // behind its own wall's line (so the shader reads the wall's outward
  // normal from it: a part on a wall goes with the wall's face, seen from
  // behind); a piece on no wall (roof kit, a laundry line across a courtyard)
  // at its own xz, and then only over its building's top or off its footprint.
  const bad = [], noWall = [];
  let roles = [0, 0, 0, 0, 0, 0, 0, 0], onWall = 0;
  each((a, v) => {
    const c = a.cityCut[v], slot = Math.floor(c / CUT_ROLES + .01), role = Math.round(c) - slot * CUT_ROLES;
    const x = a.position[v * 3], y = a.position[v * 3 + 1], z = a.position[v * 3 + 2];
    roles[role]++;
    if (role === 0) { if (slot < 1 || slot > shells.slotCount) bad.push(`first-floor stamp ${c}`); return; } // (a first floor: its building's slot)
    const row = shells.table[slot], floor = row.z, top = row.w, b = shells.cut.bySlot.get(slot);
    if (slot < 1 || slot > shells.slotCount || (role !== 1 && role !== 3)) { bad.push(`stamp ${c}`); return; }
    if (y < floor - 1e-3) bad.push(`slot ${slot} role ${role} at ${y.toFixed(2)} under its first floor ${floor}`);
    if (role === 1 && y > top - FACADES.topMargin + 1e-3) bad.push(`slot ${slot} flat part at ${y.toFixed(2)} over ${top} - margin`);
    const dx = x - a.cityAt[v * 2], dz = z - a.cityAt[v * 2 + 1], off = Math.hypot(dx, dz);
    if (off < CUT.wall.onWall) {
      if (off > 1e-4) bad.push(`slot ${slot}: a piece on no wall anchored ${off.toFixed(3)} m off its own xz`);
      const out = -Math.max(...b.polygons.map(poly => convexDistance(poly, x, z)));
      if (y < top - 1e-3 && out < .1) noWall.push(`slot ${slot} (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
      return;
    }
    onWall++;
    // Its wall's line: CUT.wall.back m out from the anchor, on its building's outline; the part in front of it.
    const nx = dx / off, nz = dz / off, lx = a.cityAt[v * 2] + nx * CUT.wall.back, lz = a.cityAt[v * 2 + 1] + nz * CUT.wall.back;
    // (on one of its outline's edges, or that edge's line just past its end: a corner pilaster wraps the corner)
    const onEdge = poly => poly.some((p, i) => { const q = poly[(i + 1) % poly.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]); return Math.abs(((q[0] - p[0]) * (lz - p[1]) - (q[1] - p[1]) * (lx - p[0])) / l) < 2e-3; });
    if (!b.polygons.some(poly => onEdge(poly) && convexDistance(poly, lx, lz) > -FACADES.face - .15)) bad.push(`slot ${slot}: anchor's line (${lx.toFixed(2)}, ${lz.toFixed(2)}) is not on its outline`);
    if (off - CUT.wall.back < -FACADES.face - 2e-3) bad.push(`slot ${slot}: a part ${(off - CUT.wall.back).toFixed(2)} m behind its wall's line`);
  });
  // And a first-floor part (role 0) never reaches over its first floor.
  each((a, v) => { if (a.cityCut[v] % CUT_ROLES === 0 && a.position[v * 3 + 1] > 3.6 + 1e-3) bad.push(`fixed part at ${a.position[v * 3 + 1].toFixed(2)}`); });
  assert.ok(roles[0] > 1000 && roles[1] > 1000 && roles[3] > 1000 && onWall > 10000, roles.join() + ' ' + onWall);
  assert.equal(roles[2], 0, 'no part is a cap');
  assert.deepEqual(bad.slice(0, 6), [], `${bad.length} bad stamps or anchors`);
  assert.deepEqual(noWall.slice(0, 6), [], `${noWall.length} pieces on no wall stand on their building's walls under its top`);
});

test('city facades: every part is wound to face its normal (in the shells\' meshes and the detail meshes)', () => {
  let bad = 0, n = 0;
  for (const m of [...shells.cellMeshes, ...shells.detailMeshes.flat()]) {
    const p = m.geometry.attributes.position.array, nor = m.geometry.attributes.normal.array;
    for (let v = 0; v < p.length; v += 9) {
      const ux = p[v + 3] - p[v], uy = p[v + 4] - p[v + 1], uz = p[v + 5] - p[v + 2], wx = p[v + 6] - p[v], wy = p[v + 7] - p[v + 1], wz = p[v + 8] - p[v + 2];
      const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
      if (Math.hypot(cx, cy, cz) < 1e-9) continue;
      if (cx * nor[v] + cy * nor[v + 1] + cz * nor[v + 2] < 0) bad++; n++;
    }
  }
  assert.ok(n > 80000, `${n} triangles`);
  assert.equal(bad, 0, `${bad} of ${n} triangles wound against their normal`);
});

// What a view draws: every mesh whose bounding sphere reaches the camera's
// frustum (three's own test), at a spot, on a 400 x 250 screen.
function inView(x, z, meshes) {
  const cam = new THREE.PerspectiveCamera(40, 400 / 250, .5, 400);
  cam.position.set(x, 29, z + 29 * 11.5 / 33); cam.lookAt(x, 0, z); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  return meshes.filter(m => { m.geometry.computeBoundingSphere(); return frustum.intersectsSphere(m.geometry.boundingSphere); });
}
// The detail tiers are made pass by pass (a preset shown for the first time
// adds its own): every seeded choice is made on every pass, so stepping up
// through Balanced, Quality and Extreme makes what one Extreme pass makes,
// part for part (a choice drawn in one tier only shifted every roof's kit).
test('city facades: the detail passes agree part for part (Balanced, Quality, Extreme one by one = Extreme at once)', () => {
  const stepped = new CityShells({ scene: new THREE.Scene() }, map, city);
  for (const q of ['balanced', 'quality', 'extreme']) stepped.setQuality(q);
  const sum = sh => [...sh.facades.cells.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([key, c]) => [key, ...[1, 2, 3].map(t => {
    const a = c.tiers[t].arrays; let h = c.tiers[t].count;
    for (let v = 0; v < c.tiers[t].count; v++) h += a.position[v * 3] * 1.3 + a.position[v * 3 + 1] * 2.7 + a.position[v * 3 + 2] * 3.1;
    return h.toFixed(2);
  })].join()).join('|');
  assert.equal(sum(stepped), sum(shells));
});

test('city facades: the preset ladder (one detail mesh a cell shown; Extreme never less than Quality) and the budget at the densest views', () => {
  const tiers = FACADES.tiers;
  assert.deepEqual(Object.keys(tiers), ['potato', 'performance', 'balanced', 'quality', 'extreme']);
  for (const [name, t] of Object.entries(tiers)) {
    shells.setQuality(name);
    for (let k = 1; k <= 3; k++) for (const m of shells.detailMeshes[k]) assert.equal(m.visible, k === t);
  }
  assert.ok(shells.detailTriangles[3] >= shells.detailTriangles[2] && shells.detailTriangles[2] >= shells.detailTriangles[1] && shells.detailTriangles[1] > 0, shells.detailTriangles.join());
  // Parts in the shells' own meshes (every preset), per mesh.
  const partTris = new Map(shells.cellMeshes.map(m => [m, m.userData.facadeTriangles || 0]));
  const budget = { potato: [0, 50e3], performance: [0, 90e3], balanced: [20, 150e3], quality: [30, 220e3], extreme: [30, 220e3] };
  for (const [spot, [x, z]] of Object.entries({ crossroads: [6, 4], 'stacks-courtyard': [-42, -26] })) {
    const base = inView(x, z, shells.cellMeshes).reduce((n, m) => n + partTris.get(m), 0);
    for (const [name, [draws, tris]] of Object.entries(budget)) {
      const t = tiers[name], detail = t ? inView(x, z, shells.detailMeshes[t]) : [];
      const added = base + detail.reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0);
      // (the camera's pass; the shadow and mirror passes are measured with tools/perf.mjs)
      assert.ok(detail.length <= draws, `${spot} ${name}: ${detail.length} draws added`);
      assert.ok(added <= tris * .8, `${spot} ${name}: ${added} triangles added`);
    }
  }
  shells.setQuality('potato');
});

test('city facades: the wash lights the parts too, and their lit windows glow on their own', () => {
  const lit = () => { let n = 0; for (const m of shells.cellMeshes) { const g = m.geometry.attributes.cityGlow.array; for (let i = 0; i < g.length; i += 3) if (g[i] + g[i + 1] + g[i + 2] > .05) n++; } return n; };
  const before = lit();
  assert.ok(before > 1000, `${before} glowing vertices before the wash (the lit windows, strips and neon)`);
  // A lamp in front of the laundromat's north face.
  const view2 = { scene: new THREE.Scene() }, s2 = new CityShells(view2, map, { uniforms: { cutTexture: { value: null } }, cutTexture: null });
  const count = () => { let n = 0; for (const m of s2.cellMeshes) { const g = m.geometry.attributes.cityGlow.array, c = m.geometry.attributes.cityCut.array, p = m.geometry.attributes.position.array; for (let i = 0; i < c.length; i++) if (p[i * 3 + 2] < 10.305 && p[i * 3 + 2] > 9.5 && p[i * 3] > -24 && p[i * 3] < -16 && g[i * 3] > .05) n++; } return n; };
  const a = count();
  s2.bakeLight([{ x: -20, y: 3, z: 9.4, colour: { r: .9, g: .95, b: 1 }, intensity: 1, reach: 6, kind: 'lamp', facing: 0 }]);
  assert.ok(count() > a + 20, `${a} -> ${count()} lit part vertices on the laundromat's face`);
});
