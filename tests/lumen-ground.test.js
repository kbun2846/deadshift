// Lumen stage 1: the ground, the outline, the ring of sealed towers and the
// road-end barricades (world/lumen-ground.js, world/lumen-edge.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { maps, mapColliders, mapHash } from '../src/maps.js';
import { isPlayable } from '../src/playable-area.js';
import { Simulation, inside } from '../src/simulation.js';
import { OUTLINE, ROADS, BARRICADES, CROSSROADS } from '../src/maps/lumen-layout.js';
import { groundShapes, groundMarkings, lumenPuddles, intersections, insideOutline, LUMEN_GROUND } from '../src/world/lumen-ground.js';
import { edgeTowers, barricades, inCorridor, EDGE } from '../src/world/lumen-edge.js';

const map = maps.lumen;

test('lumen: registered and released (owner, 2026-10-01), with a stable fingerprint', () => {
  assert.equal(map.menu, true); assert.ok(map.modes.includes('practice') && map.modes.includes('multiplayer'));
  assert.equal(mapHash(map), mapHash(map));
  assert.equal(map.width, 136); assert.equal(map.depth, 120);
});

test('lumen: the outline is not a square (steps, a notch, a bulge, a chamfer) and holds the core', () => {
  assert.ok(OUTLINE.length >= 20);
  const diag = OUTLINE.filter((p, i) => { const q = OUTLINE[(i + 1) % OUTLINE.length]; return p[0] !== q[0] && p[1] !== q[1]; });
  assert.ok(diag.length >= 1, 'the south-east chamfer');
  for (const [x, z] of [[6, 0], [-40, -30], [44, -24], [-16, 41], [26, 40]]) assert.ok(isPlayable(map, x, z, .4), `${x},${z}`);
});

test('lumen: the ring stands outside the playable area, never over a road, and walls it in', () => {
  const towers = edgeTowers();
  assert.ok(towers.length > 30);
  for (const t of towers) {
    for (const [dx, dz] of [[0, 0], [.3, .3], [-.3, -.3]]) {
      const x = t.x + dx * t.w, z = t.z + dz * t.d;
      if (!t.angle) assert.ok(!isPlayable(map, x, z, 0), `${t.id} at ${x.toFixed(1)},${z.toFixed(1)} is in play`);
    }
    assert.ok(!inCorridor(t.x, t.z, 0), `${t.id} on a road`);
    assert.ok(t.height >= 40);
  }
  // Every metre of the outline has a tower just outside it, unless a road leaves there.
  const colliders = mapColliders(map).filter(c => c.solid && !c.barricade);
  let open = 0, total = 0;
  for (let i = 0; i < OUTLINE.length; i++) {
    const [ax, az] = OUTLINE[i], [bx, bz] = OUTLINE[(i + 1) % OUTLINE.length], len = Math.hypot(bx - ax, bz - az);
    for (let t = .5; t < len - .5; t += 1) {
      const x = ax + (bx - ax) * t / len, z = az + (bz - az) * t / len;
      // a point 1.5 m out
      const ux = (bx - ax) / len, uz = (bz - az) / len, cands = [[x + uz * 1.5, z - ux * 1.5], [x - uz * 1.5, z + ux * 1.5]];
      const [ox, oz] = cands.find(([px, pz]) => !isPlayable(map, px, pz, 0)) || cands[0];
      if (inCorridor(ox, oz, 0)) continue;
      total++; if (!colliders.some(c => inside({ x: ox, z: oz }, c, .05))) open++;
    }
  }
  assert.ok(open / total < .03, `${open} of ${total} edge metres have no tower`);
});

test('lumen: every road leaving the map is closed by a barricade across its whole corridor', () => {
  const bars = barricades();
  assert.equal(bars.length, BARRICADES.length);
  for (const b of bars) {
    assert.ok(isPlayable(map, b.x, b.z, 0), `${b.id} inside the boundary`);
    assert.ok(b.height >= 1.2 && b.shell === false && b.barricade);
  }
});

test('lumen: nothing that moves a body gets past a barricade (walk, dodge, a long dash)', () => {
  for (const b of barricades()) {
    const [ox, oz] = b.out, sim = new Simulation(map, 'static');
    // start 4 m inside, in the middle of the road, heading out
    Object.assign(sim.player, { x: b.x - ox * 4, z: b.z - oz * 4, vx: 0, vz: 0 });
    for (let i = 0; i < 240; i++) sim.step({ moveX: ox, moveZ: oz, aimX: ox, aimZ: oz, dodge: i % 30 === 0 });
    const past = (sim.player.x - b.x) * ox + (sim.player.z - b.z) * oz;
    assert.ok(past < 0, `${b.id}: through by ${past.toFixed(2)} m`);
    // a teleport-sized push (knockback, launch, draw-cut) is still stopped
    sim.movePlayer(ox * 6, oz * 6);
    assert.ok((sim.player.x - b.x) * ox + (sim.player.z - b.z) * oz < 0, `${b.id}: pushed through`);
  }
});

test('lumen: the ground paint and markings are well formed; six junctions, one dead', () => {
  const shapes = groundShapes(), marks = groundMarkings();
  assert.ok(shapes.length > 50 && marks.length > 150);
  for (const s of shapes) { assert.ok(s.poly.length >= 3); assert.match(s.colour, /^#[0-9a-f]{6}$/i); }
  for (const m of marks) { assert.equal(m.quad.length, 4); for (const [x, z] of m.quad) assert.ok(Number.isFinite(x) && Number.isFinite(z)); }
  const js = intersections();
  assert.equal(js.length + 1, 6); // five here, and the Crossroads
  assert.deepEqual(js.map(j => j.signals).sort(), ['blink', 'dead', 'normal', 'normal', 'normal']);
  // no team colours in the ground's paint
  const team = ['#ffb020', '#2ee6ff', '#b77bff'];
  for (const c of [...shapes.map(s => s.colour), ...marks.map(m => m.colour)]) assert.ok(!team.includes(c.toLowerCase()));
});

test('lumen: standing puddles lie inside the map, seeded', () => {
  const a = lumenPuddles(), b = lumenPuddles();
  assert.deepEqual(a, b); assert.ok(a.length >= 25);
  for (const p of a) assert.ok(insideOutline(p.x, p.z), `${p.x},${p.z}`);
});

// A body (radius .38) flooded over a 0.25 m grid from the Crossroads: where it
// can stand and reach.
function reachable() {
  const r = .38, step = .25, x0 = -68, z0 = -60, nx = Math.round(136 / step), nz = Math.round(120 / step);
  const colliders = mapColliders(map).filter(c => !c.walkOver && !c.playerOnly || c.wall || c.solid);
  const free = (x, z) => isPlayable(map, x, z, r) && !colliders.some(c => Math.abs(x - c.x) < c.w / 2 + r && Math.abs(z - c.z) < c.d / 2 + r && inside({ x, z }, c, r - .02));
  const seen = new Uint8Array(nx * nz), queue = [];
  const at = (x, z) => [Math.round((x - x0) / step), Math.round((z - z0) / step)];
  const [sx, sz] = at(6, 4); seen[sz * nx + sx] = 1; queue.push(sx, sz);
  while (queue.length) {
    const i = queue.shift(), k = queue.shift();
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = k + dk; if (a < 0 || b < 0 || a >= nx || b >= nz || seen[b * nx + a]) continue;
      seen[b * nx + a] = 2; if (!free(x0 + a * step, z0 + b * step)) continue;
      seen[b * nx + a] = 1; queue.push(a, b);
    }
  }
  return { reached: (x, z) => { const [i, k] = at(x, z); return seen[k * nx + i] === 1; }, step, x0, z0, nx, nz, seen };
}

test('lumen: no spot behind any barricade can be reached (a flood of a body from the Crossroads)', () => {
  const flood = reachable();
  for (const b of barricades()) {
    const [ox, oz] = b.out, along = [-oz, ox], half = Math.max(b.w, b.d) / 2; // (its own road's corridor: beside it is just the ground by the ring)
    let behind = 0;
    for (let t = -half; t <= half; t += .25) for (let u = .4; u < 6; u += .25) {
      const x = b.x + along[0] * t + ox * u, z = b.z + along[1] * t + oz * u;
      if (flood.reached(x, z)) behind++;
    }
    assert.equal(behind, 0, `${b.id}: ${behind} reachable cells behind it`);
  }
});

// The owner's crosswalk rules (stage 2): bars kerb to kerb with no gaps, about
// a third faded; where the scramble's diagonals cross, both pause over the
// overlap; not every road gets a crossing (the dead corner none).
test('lumen: crosswalks have no gaps, some bars faded, the scramble pauses where it crosses, not every arm crossed', () => {
  const G = LUMEN_GROUND, marks = groundMarkings(), zebraColours = new Set([G.crosswalk, ...G.crosswalkFaded]);
  const bars = marks.filter(m => zebraColours.has(m.colour));
  const faded = bars.filter(m => m.colour !== G.crosswalk).length / bars.length;
  assert.ok(faded > .2 && faded < .45, `faded share ${faded.toFixed(2)}`);
  // dull, worn paint (it is lit, and a bright bar blooms): no bar or line brighter than the owner's ceiling
  const grey = c => (parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16)) / 3;
  assert.ok(Math.max(...[G.crosswalk, ...G.crosswalkFaded].map(c => Math.max(...[1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))))) <= 0x95, 'crosswalk paint');
  assert.ok(grey(G.paint) <= 0x8a && grey(G.lemon) < 0x70, 'lane paint and the lemon line');
  assert.ok(G.crosswalkFaded.every(c => grey(c) < grey(G.crosswalk)), 'faded bars are darker still');
  // every junction crossing: bars evenly spaced across it (no missing bar), first and last near the kerbs
  const js = intersections();
  for (const j of js) for (const cw of j.crosswalks) {
    const inside = bars.filter(m => { const xs = m.quad.map(p => p[0]), zs = m.quad.map(p => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2; return cx > cw.x0 && cx < cw.x1 && cz > cw.z0 && cz < cw.z1; });
    const along = inside.map(m => cw.across === 'x' ? Math.min(...m.quad.map(p => p[0])) : Math.min(...m.quad.map(p => p[1]))).sort((a, b) => a - b);
    const span = cw.across === 'x' ? cw.x1 - cw.x0 : cw.z1 - cw.z0, start = cw.across === 'x' ? cw.x0 : cw.z0;
    assert.ok(along.length >= Math.floor(span / 1.05) - 1, `${j.id}: ${along.length} bars over ${span} m`);
    for (let i = 1; i < along.length; i++) assert.ok(Math.abs(along[i] - along[i - 1] - 1.05) < .01, `${j.id}: a gap in its crossing`);
    assert.ok(along[0] - start < .8 && start + span - (along[along.length - 1] + .55) < .8, `${j.id}: bars stop short of a kerb`);
  }
  // the dead corner has none; the lanes' junctions fewer than four arms
  assert.equal(js.find(j => j.signals === 'dead').crosswalks.length, 0);
  assert.ok(js.every(j => j.crosswalks.length < 4));
  // the scramble: no diagonal bar reaches into the other diagonal's band (1.6 m each side of its line)
  const C = CROSSROADS, d1 = [C.x0 + 4, C.z0 + 4, C.x1 - 4, C.z1 - 4], d2 = [C.x1 - 4, C.z0 + 4, C.x0 + 4, C.z1 - 4];
  const off = ([ax, az, bx, bz], x, z) => Math.abs((x - ax) * (bz - az) - (z - az) * (bx - ax)) / Math.hypot(bx - ax, bz - az);
  const diagonal = bars.filter(m => { const [a, b] = m.quad; return Math.abs(a[0] - b[0]) > .05 && Math.abs(a[1] - b[1]) > .05; });
  assert.ok(diagonal.length > 20);
  for (const m of diagonal) { const on1 = m.quad.every(([x, z]) => off(d1, x, z) < 1.9), line = on1 ? d2 : d1; for (const [x, z] of m.quad) assert.ok(off(line, x, z) > 1.6, `a scramble bar at ${x.toFixed(1)},${z.toFixed(1)} lies on the other diagonal`); }
});
