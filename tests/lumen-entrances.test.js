// Lumen's entrances (owner, 2026-10-01, by voice: "Make the doorways and
// entrances on Lumen a little bit more prominent so you can tell where you can
// enter"): every walkable outer doorway, and only those, throws one light
// spill onto the street (world/city-entrances.js, render/city-entrances.js),
// read from the rooms' openings the colliders use; each spill lies on open
// ground (never in a building, the ring or a barricade), all of them are one
// mesh on the ground layer (one draw on every preset, nothing per frame), and
// no colour it shows is near a team's. The doorway's lit header is the
// facades' (tests/city-facades.test.js holds its place and colours).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { lumen } from '../src/maps/lumen.js';
import { mapColliders, mapHash } from '../src/maps.js';
import { lumenDoors } from '../src/maps/lumen-signs.js';
import { ENTRANCE, cityEntrances, entranceSpills, entranceFootprints, footprintDistance, spillCorners } from '../src/world/city-entrances.js';
import { ENTRANCE_LIGHT, ENTRANCE_KEY, CityEntrances, entranceGeometryData } from '../src/render/city-entrances.js';
import { CITY_SYSTEMS, GROUND_LAYER, BRIGHT_LAYER } from '../src/render/city-registry.js';
import { DOORWAY, doorwayLight, facadeLook } from '../src/render/city-facades.js';
import { acesFilmic, deltaE2000, hexLinear, lab, toSrgb, hexRgb } from '../src/render/look-contrast.js';

const entrances = cityEntrances(lumen), spills = entranceSpills(lumen, entrances);

test('lumen entrances: one for every outer opening of every room (the colliders\' own), the authored doors exactly', () => {
  const openings = lumen.buildings.filter(b => b.group).flatMap(b => b.openings.filter(o => o.outer).map(o => ({ room: b.id, o })));
  assert.equal(entrances.length, openings.length);
  assert.ok(entrances.length >= 80, `${entrances.length} entrances`);
  // One to one with the buildings' authored doors (maps/lumen-*.js `doors`, at their points on the wall line).
  const doors = lumenDoors(), used = new Set();
  for (const e of entrances) {
    const i = doors.findIndex((d, k) => !used.has(k) && d.id === e.building && Math.hypot(d.x - e.x, d.z - e.z) < .05);
    assert.ok(i >= 0, `${e.room} at ${e.x.toFixed(2)}, ${e.z.toFixed(2)} is not an authored door`);
    used.add(i);
    assert.ok(Math.abs(doors[i].width - e.width) < 1e-6 && Math.abs(doors[i].nx - e.nx) < 1e-6 && Math.abs(doors[i].nz - e.nz) < 1e-6, `${e.room}: width and outward way`);
  }
  assert.equal(used.size, doors.length, 'every authored door has its entrance');
});

test('lumen entrances: each is a real way in (no wall, shutter or cover across it), facing out onto open ground', () => {
  const blocking = mapColliders(lumen).filter(c => !c.walkOver && !c.shared && (c.height ?? 1) > .3);
  const inside = (c, x, z) => { const a = c.localW !== undefined ? (c.angle || 0) : 0, co = Math.cos(a), s = Math.sin(a), dx = x - c.x, dz = z - c.z; return Math.abs(dx * co - dz * s) < (c.localW ?? c.w) / 2 && Math.abs(dx * s + dz * co) < (c.localD ?? c.d) / 2; };
  const foot = entranceFootprints(lumen), bad = [];
  for (const e of entrances) {
    // Across the doorway from just inside to just outside, at its middle and near each jamb.
    for (const s of [-e.width / 2 + .3, 0, e.width / 2 - .3]) for (let t = -.4; t <= .6 + 1e-6; t += .1) {
      const x = e.x + e.ux * s + e.nx * t, z = e.z + e.uz * s + e.nz * t, c = blocking.find(q => inside(q, x, z));
      if (c) { bad.push(`${e.room} at ${e.x.toFixed(2)}, ${e.z.toFixed(2)}: ${c.propId || c.furniture || c.buildingId || 'a wall'} across it (${s.toFixed(2)}, ${t.toFixed(2)})`); break; }
    }
    // Outward: the street, not another building.
    assert.ok(footprintDistance(foot, e.x + e.nx * .6, e.z + e.nz * .6, 1) > .3, `${e.room}: opens onto open ground`);
  }
  assert.deepEqual(bad.slice(0, 6), [], `${bad.length} blocked`);
});

test('lumen entrances: one spill each, on open ground only, fanning out from the doorway', () => {
  assert.equal(spills.length, entrances.length);
  const foot = entranceFootprints(lumen), bad = [];
  for (const p of spills) {
    const L = p.t1 - p.t0;
    assert.ok(L >= ENTRANCE.minLength - 1e-6 && L <= ENTRANCE.length + ENTRANCE.away + 1e-6, `${p.room}: ${L.toFixed(2)} m`);
    assert.ok(Math.abs(p.t0 - ENTRANCE.face) < 1e-9, 'from the wall\'s outer face');
    assert.ok(p.hw0 >= p.half - 1e-9 && p.hw1 >= p.hw0 - 1e-9, `${p.room}: as wide as its opening at the wall, no narrower out`);
    // Every point of it (the trapezoid, sampled) clear of every footprint by ENTRANCE.clear.
    const [a, b, c, d] = spillCorners(p);
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
      const u = i / 8, v = j / 8, x0 = a[0] + (b[0] - a[0]) * u, z0 = a[1] + (b[1] - a[1]) * u, x1 = d[0] + (c[0] - d[0]) * u, z1 = d[1] + (c[1] - d[1]) * u;
      const x = x0 + (x1 - x0) * v, z = z0 + (z1 - z0) * v;
      if (footprintDistance(foot, x, z, 1) < ENTRANCE.clear - .02) { bad.push(`${p.room} at (${x.toFixed(2)}, ${z.toFixed(2)})`); i = 9; break; }
    }
  }
  assert.deepEqual(bad.slice(0, 6), [], `${bad.length} spills over a footprint`);
  // Most reach their full length (a north door's: past its roof's edge on screen).
  const full = spills.filter(p => p.t1 - p.t0 >= ENTRANCE.length - .05).length;
  assert.ok(full >= spills.length * .85, `${full} of ${spills.length} full length`);
  const away = spills.filter(p => p.nz < -.5);
  assert.ok(away.length > 10 && away.filter(p => p.t1 - p.t0 > ENTRANCE.length + .5).length >= away.length * .7, 'doors facing away from the camera reach further');
});

test('lumen entrances: one mesh, four corners and two upward triangles a doorway, on the ground layer only', () => {
  const looks = new Map(lumen.cityBuildings.map(s => [s.id, facadeLook(s)]));
  const data = entranceGeometryData(spills.map(p => ({ ...p, colour: doorwayLight(looks.get(p.building)) })));
  assert.equal(data.position.length, spills.length * 12);
  assert.equal(data.index.length, spills.length * 6);
  for (const k of ['position', 'colour', 'local', 'shape', 'door']) assert.ok(data[k].every(Number.isFinite), k);
  for (let i = 0; i < data.index.length; i += 3) {
    const [p, q, r] = [0, 1, 2].map(k => data.index[i + k] * 3), P = data.position;
    const ux = P[q] - P[p], uz = P[q + 2] - P[p + 2], vx = P[r] - P[p], vz = P[r + 2] - P[p + 2];
    assert.ok(uz * vx - ux * vz > 0, 'faces up'); // (y of (q - p) x (r - p))
  }
  for (let v = 0; v < data.position.length / 3; v++) assert.ok(Math.abs(data.position[v * 3 + 1] - ENTRANCE_LIGHT.lift) < 1e-6);
  // The system: Lumen's (or a city map that asks), one mesh, ground layer only (the wet mirror never draws it), one program key.
  const entry = CITY_SYSTEMS.find(e => e[0] === 'entrances');
  assert.ok(entry, 'registered with the hub');
  const view = { scene: new THREE.Scene(), qualityName: 'potato' };
  const city = { uniforms: { wetness: { value: 0 }, sag: { value: 0 }, roofMask: { value: null }, maskBounds: { value: new THREE.Vector4() } }, shells: { looks } };
  assert.equal(entry[1](view, { id: 'city-test', city: {} }, city), null);
  const sys = entry[1](view, lumen, city);
  assert.ok(sys instanceof CityEntrances);
  const meshes = []; view.scene.traverse(o => o.isMesh && meshes.push(o));
  assert.equal(meshes.length, 1);
  const mesh = meshes[0];
  assert.ok(mesh.layers.isEnabled(GROUND_LAYER) && !mesh.layers.isEnabled(BRIGHT_LAYER) && !mesh.layers.isEnabled(0));
  assert.equal(mesh.material.customProgramCacheKey(), ENTRANCE_KEY);
  assert.equal(mesh.material.blending, THREE.AdditiveBlending);
  assert.equal(mesh.material.depthWrite, false);
  assert.equal(mesh.castShadow || mesh.receiveShadow, false);
  assert.equal(typeof sys.update, 'undefined', 'nothing per frame');
  assert.equal(sys.spills.length, entrances.length);
  // The colour is its doorway's header's (by its building's look).
  for (const p of sys.spills) assert.equal(p.colour, doorwayLight(looks.get(p.building)));
  sys.dispose(); assert.equal(view.scene.children.length, 0);
});

test('lumen entrances: no doorway light near a team colour, on the street or its header', () => {
  const teams = [['amber', '#ffb020'], ['cyan', '#2ee6ff'], ['violet', '#b77bff']].map(([k, h]) => [k, lab(hexRgb(h))]);
  const names = new Set(['warmWhite', ...Object.values(DOORWAY.stripColour)]), L = ENTRANCE_LIGHT, close = [];
  for (const base of ['#242a39', '#3a404c', '#5a5e66']) for (const name of names) {
    const hex = doorwayLight({ recipe: Object.keys(DOORWAY.stripColour).find(k => DOORWAY.stripColour[k] === name) }), lin = hexLinear(hex), grey = .2126 * lin[0] + .7152 * lin[1] + .0722 * lin[2];
    const tint = lin.map(c => c + (grey - c) * L.desaturate), street = hexLinear(base);
    for (const g of [L.fan, L.fan + L.wet, L.sill, L.sill + L.wet / 2]) {
      const shown = acesFilmic(street.map((c, i) => c + tint[i] * g), 1).map(toSrgb);
      for (const [k, t] of teams) { const d = deltaE2000(lab(shown), t); if (d < 15) close.push(`${name} x${g} over ${base}: ${d.toFixed(1)} from ${k}`); }
    }
  }
  assert.deepEqual(close, []);
});

test('lumen entrances: render only (the map\'s data and fingerprint carry nothing of them)', () => {
  assert.equal(lumen.city.entrances, undefined);
  assert.equal(typeof mapHash(lumen), 'string');
  for (const b of lumen.buildings) assert.ok(!('spill' in b) && !('entrance' in b));
});
