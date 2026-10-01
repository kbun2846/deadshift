// Lumen's flicker (owner, 2026-09-30: "some of these things flicker and
// jitter with their textures as I move"): two faces in one plane, facing the
// same way and overlapping, in different colours, z-fight -- which one shows
// changes with every sub-pixel step of the camera. Built without WebGL
// (tests/flicker-lib.js finds them): the facades' panels (shop glass laid
// over cladding, windows over ribs, a corner tube flush with a pilaster) and
// the street furniture's, detail's, set pieces' and vehicles' boxes (a leg's
// top flush with the cap over it, a base's end flush with a leg's side).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { maps, PROP_TYPES } from '../src/maps.js';
import { CityShells } from '../src/render/city-shells.js';
import { FACADES } from '../src/render/city-facades.js';
import { LUMEN_MODELS, makeLumenPlaceholder } from '../src/world/lumen-props.js';
import { FURNITURE_MODELS } from '../src/world/lumen-furniture.js';
import { BREAKABLE_MODELS } from '../src/world/lumen-breakables.js';
import { DETAIL_MODELS } from '../src/world/lumen-detail.js';
import { SETPIECE_MODELS } from '../src/world/lumen-setpieces.js';
import { FLUSH, unflush } from '../src/world/lumen-kit.js';
import '../src/world/lumen-vehicles.js';
import { stubView } from './lumen-stub-view.js';
import { coplanarOverlaps, worldTriangles } from './flicker-lib.js';

test('flicker: the overlap finder sees two coplanar boxes of different colours; unflush steps the later one out', () => {
  const g = new THREE.Group(), view = stubView();
  view.box(0, .5, 0, 1, 1, 1, '#ff0000', g); view.box(0, .5, .3, .4, .4, .4, '#00ff00', g); // front faces both at z .5
  view.box(.4, 1.1, 0, .2, .2, .2, '#0000ff', g); // its top at 1.2, the red box's top at 1: apart
  const flushAt = () => { const { tris, colours } = worldTriangles(g, THREE); return coplanarOverlaps(tris, colours).filter(f => Math.abs(f.at[2] - .5) < .01).reduce((n, f) => n + f.area, 0); };
  assert.ok(Math.abs(flushAt() - .16) < 1e-6, 'flush faces found');
  unflush(g);
  assert.equal(flushAt(), 0, 'stepped out');
  const green = g.children[1]; green.updateMatrixWorld();
  const front = new THREE.Box3().setFromObject(green);
  assert.ok(Math.abs(front.max.z - (.5 + FLUSH.step)) < 1e-6 && Math.abs(front.min.z - .1) < 1e-6, `only the flush face moved (${front.min.z}..${front.max.z})`);
  assert.equal(g.children[2].scale.x, 1, 'a part with nothing flush is untouched');
});

test('flicker: no facade panel shares a plane with another of a different colour (the first floors none at all)', () => {
  const view = { scene: new THREE.Scene() }, city = { uniforms: { cutTexture: { value: null } }, cutTexture: null };
  const shells = new CityShells(view, maps.lumen, city);
  shells.setQuality('extreme'); // (every tier, as Extreme draws them, over the shells' own)
  let total = 0, firstFloor = 0; const worst = [];
  for (const c of shells.facades.cells.values()) {
    const tris = [], colours = [], fixed = [];
    for (const [s, isFixed] of [[c.fixed, true], [c.rest, false], [c.tiers[1], false], [c.tiers[2], false], [c.tiers[3], false]]) {
      if (!s?.count) continue;
      const P = s.view('position'), C = s.view('color');
      for (let v = 0; v + 2 < s.count; v += 3) { for (let k = 0; k < 9; k++) tris.push(P[v * 3 + k]); colours.push(`${C[v * 3].toFixed(3)},${C[v * 3 + 1].toFixed(3)},${C[v * 3 + 2].toFixed(3)}`); fixed.push(isFixed); }
    }
    for (const f of coplanarOverlaps(tris, colours)) {
      total += f.area; if (fixed[f.a] && fixed[f.b]) firstFloor += f.area;
      worst.push(f);
    }
  }
  worst.sort((a, b) => b.area - a.area);
  const show = worst.slice(0, 3).map(f => `${f.area.toFixed(3)} m2 at ${f.at.map(v => v.toFixed(2))}`).join('; ');
  // (163 m2 before the stacking, 140 of it on the first floors: shop glass on cladding)
  assert.ok(firstFloor < .5, `first floors: ${firstFloor.toFixed(2)} m2 of flush panels (${show})`);
  assert.ok(total < 8, `facades: ${total.toFixed(2)} m2 of flush panels (${show})`);
  assert.ok(FACADES.stack >= .004, 'a stacked panel steps out at least 4 mm');
});

test('flicker: street furniture, detail, set pieces and vehicles: no two of a model\'s parts share a plane in different colours', () => {
  const VEHICLES = ['cityCompact', 'citySedan', 'citySuv', 'cityTaxi', 'citySports', 'cityVan', 'cityTruck', 'cityWreck', 'cityPileup', 'cityMotorbike'];
  let total = 0; const bad = [];
  for (const type of [...FURNITURE_MODELS, ...BREAKABLE_MODELS, ...DETAIL_MODELS, ...SETPIECE_MODELS, ...VEHICLES]) {
    if (!LUMEN_MODELS.get(type)) continue;
    const g = new THREE.Group(); makeLumenPlaceholder(stubView(), { ...PROP_TYPES[type], type, x: 10.5, z: -7.25, angle: 0 }, g);
    const { tris, colours } = worldTriangles(g, THREE);
    // (an underside is never seen from the camera above)
    const area = coplanarOverlaps(tris, colours).filter(f => f.normal[1] > -.5).reduce((n, f) => n + f.area, 0);
    total += area; if (area > .25) bad.push(`${type} ${area.toFixed(2)} m2`);
  }
  // (29 m2 over every model before unflush; what is left is round parts and turned boards)
  assert.ok(total < 1.5, `${total.toFixed(2)} m2 of flush faces over every model`);
  assert.deepEqual(bad, [], 'no model keeps a large flush pair');
});
