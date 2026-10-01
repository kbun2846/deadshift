// Lumen's visibility audit (AGENTS.md > Lumen > "What the camera can and
// can't see"): the CPU ray caster (tools/lumen-visaudit-lib.mjs) over the
// whole map, no browser. From every road (centre line and both sidewalks,
// every `step` m, both screens) with the camera where the city camera
// settles, and from inside every room (its middle and near each corner) with
// the room camera, it casts a grid of rays over the view and checks the
// rule's promises (a)-(d) (auditView), that your waist and head are never
// hidden outdoors, and that your room's floor is never hidden inside
// (except by the knee border of a wall you stand against).
//
//   node tools/lumen-visaudit.mjs [--step 2] [--cols 64] [--rows 36] [--json out.json]
// Exits non-zero on any violation.
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { maps } from '../src/maps.js';
import { CityShells } from '../src/render/city-shells.js';
import { CityCamera } from '../src/world/city-camera.js';
import { roomView } from '../src/world/city-cut.js';
import { fairFov } from '../src/render/camera-framing.js';
import { buildingOpenings } from '../src/map-kit.js';
import { auditModel, auditView, viewRays, blockedAt, roadSpots, settle, outdoorEye, roomEye, floorPoints, roomStands } from './lumen-visaudit-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const step = +arg('step', 2), cols = +arg('cols', 64), rows = +arg('rows', 36), jsonOut = arg('json', ''), only = arg('only', '');

// The map's shells built without WebGL (the cut, the slots), and the model.
export function lumenAudit() {
  const map = maps.lumen, view = { scene: new THREE.Scene() }, city = { uniforms: { cutTexture: { value: null } }, cutTexture: null };
  const shells = new CityShells(view, map, city), model = auditModel(shells, map);
  return { map, shells, model, cut: shells.cut, camera: new CityCamera(map) };
}
// The whole audit. Returns { views, rays, a, b, c, d, hiddenYou, hiddenFloor, examples }.
export function runAudit({ step = 2, cols = 64, rows = 36, aspects = [16 / 9, 390 / 844], log = () => {}, only = '' } = {}) {
  const { map, shells, model, cut, camera } = lumenAudit();
  const total = { views: 0, rays: 0, inK: 0, kept: 0, a: 0, b: 0, c: 0, d: 0, hiddenYou: 0, hiddenFloor: 0, floorPoints: 0, youPoints: 0, examples: [] };
  const add = r => { for (const k of ['rays', 'inK', 'kept', 'a', 'b', 'c', 'd']) total[k] += r[k]; total.views++; for (const e of r.examples) if (total.examples.length < 30) total.examples.push(e); };
  const hit = {};
  const spots = roadSpots(map, cut, step);
  for (const aspect of aspects) {
    const fov = fairFov(aspect);
    for (const [label, x, z] of spots) {
      const { eye, fx, fz } = outdoorEye(camera, x, z), player = { x, z };
      settle(shells, cut, eye, player);
      add(auditView(model, viewRays(eye, fx, 0, fz, fov, aspect, cols, rows), player, { label, only }));
      for (const h of [.9, 1.7]) {
        total.youPoints++;
        if (blockedAt(model, x, h, z, hit)) { total.hiddenYou++; if (total.examples.length < 30) total.examples.push(`you hidden at ${h} m: ${label} by slot ${hit.slot} (${hit.kind})`); }
      }
    }
    log(`roads (${aspect.toFixed(2)}): ${spots.length} spots`);
    for (const room of map.buildings) {
      const slot = shells.slots.get(room.group); if (!slot) continue;
      const rv = roomView(room, buildingOpenings(room)), floor = floorPoints(room);
      for (const [px, pz] of roomStands(room)) {
        const { eye, fx, fz, follow } = roomEye(room, px, pz, aspect), player = { x: px, z: pz };
        cut.inside = slot;
        settle(shells, cut, eye, player, slot, rv);
        add(auditView(model, viewRays(eye, fx, 0, fz, fov, aspect, cols, rows), player, { label: room.id, only, inside: true }));
        for (const [sx, sz] of floor) {
          if (follow && (Math.abs(sx - fx) > 20 || sz - fz < -12 || sz - fz > 8)) continue; // (what a following camera shows)
          total.floorPoints++;
          if (blockedAt(model, sx, .015, sz, hit)) { total.hiddenFloor++; if (total.examples.length < 30) total.examples.push(`floor hidden: ${room.id} (${aspect.toFixed(2)}) from ${px.toFixed(1)},${pz.toFixed(1)}: ${sx.toFixed(1)},${sz.toFixed(1)} by slot ${hit.slot} (${hit.kind})`); }
        }
      }
    }
    log(`rooms (${aspect.toFixed(2)}): ${map.buildings.length}`);
  }
  settle(shells, cut, { x: 0, y: 29, z: 10 }, null);
  return total;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = performance.now();
  const r = runAudit({ step, cols, rows, only, log: m => console.log(m) });
  console.log(`${r.views} views x ${cols}x${rows} rays: ${r.rays} rays (${r.inK} landing in K, ${r.kept} of them kept by a building beside you); (a) ${r.a} (b) ${r.b} (c) ${r.c} (d) ${r.d}; you hidden ${r.hiddenYou}/${r.youPoints}; floor hidden ${r.hiddenFloor}/${r.floorPoints}; ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  for (const e of r.examples) console.log('  ' + e);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(r, null, 1));
  process.exit(r.a + r.b + r.c + r.d + r.hiddenYou + r.hiddenFloor ? 1 : 0);
}
