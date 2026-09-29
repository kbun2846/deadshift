import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { intersectFast, nearTriangles, gridEligible } from '../src/effects/triangle-grid.js';

// A merged "world cell": boxes, slopes and a floor, moved off the origin.
function world() {
  let seed = 3; const r = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const parts = [];
  for (let i = 0; i < 90; i++) { const g = new THREE.BoxGeometry(.3 + r() * 2, .2 + r() * 2.5, .3 + r() * 2); g.rotateY(r() * 3); g.translate(r() * 20 - 10, r() * 1.2, r() * 20 - 10); parts.push(g); }
  const floor = new THREE.PlaneGeometry(24, 24, 12, 12); floor.rotateX(-Math.PI / 2); parts.push(floor);
  const mesh = new THREE.Mesh(mergeGeometries(parts.map(g => g.toNonIndexed())), new THREE.MeshBasicMaterial());
  mesh.position.set(3, .1, -2); mesh.rotation.y = .3; mesh.updateMatrixWorld(true);
  return { mesh, r };
}

test('grid rays find the same nearest hit as three.js, and decals cut from nearby triangles match', () => {
  const { mesh, r } = world(); assert.ok(gridEligible(mesh));
  const ray = new THREE.Raycaster();
  for (let i = 0; i < 300; i++) {
    const origin = new THREE.Vector3(r() * 24 - 9, .2 + r() * 2, r() * 24 - 14), dir = i % 5 ? new THREE.Vector3(r() - .5, (r() - .5) * .3, r() - .5).normalize() : new THREE.Vector3(0, -1, 0);
    ray.set(origin, dir); ray.far = 1 + r() * 3;
    const want = ray.intersectObject(mesh, false)[0], got = intersectFast(ray, [mesh])[0];
    assert.equal(!!got, !!want, 'ray ' + i);
    if (want) { assert.ok(Math.abs(got.distance - want.distance) < 1e-6); assert.ok(got.point.distanceTo(want.point) < 1e-6); assert.ok(got.face.normal.distanceTo(want.face.normal) < 1e-6); }
  }
  for (let i = 0; i < 20; i++) {
    const at = new THREE.Vector3(r() * 18 - 7, r() * 1.5, r() * 18 - 11), size = new THREE.Vector3(.5 + r(), .5 + r(), .3), turn = new THREE.Euler(-Math.PI / 2 * r(), r(), 0);
    const full = new DecalGeometry(mesh, at, turn, size), near = nearTriangles(mesh, at, size.length() / 2), cut = new DecalGeometry(near, at, turn, size);
    assert.equal(cut.attributes.position.count, full.attributes.position.count, 'decal ' + i);
    const sum = g => { let s = 0; const a = g.attributes.position.array; for (let k = 0; k < a.length; k++) s += a[k]; return s; };
    assert.ok(Math.abs(sum(cut) - sum(full)) < 1e-3);
  }
});

test('the object index finds what intersectObjects finds, nearest first', async () => {
  const { objectIndex } = await import('../src/effects/triangle-grid.js');
  const { mesh, r } = world(), root = new THREE.Group(); root.add(mesh);
  for (let i = 0; i < 200; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(.4, .4, .4), new THREE.MeshBasicMaterial()); m.position.set(r() * 40 - 20, r(), r() * 40 - 20); root.add(m); }
  root.updateMatrixWorld(true);
  const index = objectIndex([root]), ray = new THREE.Raycaster();
  for (let i = 0; i < 200; i++) {
    ray.set(new THREE.Vector3(r() * 36 - 18, .3 + r(), r() * 36 - 18), new THREE.Vector3(r() - .5, 0, r() - .5).normalize()); ray.far = 1 + r() * 4;
    const want = ray.intersectObjects([root], true)[0], got = index.intersect(ray).sort((a, b) => a.distance - b.distance)[0];
    assert.equal(!!got, !!want); if (want) { assert.equal(got.object, want.object); assert.ok(Math.abs(got.distance - want.distance) < 1e-6); }
  }
});

test('grid rays along square edges and corners still find every hit', () => {
  const { mesh, r } = world(); mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (let i = 0; i < 1500; i++) {
    const k = Math.round(r() * 12 - 6) * 1.5, h = .1 + r() * 2.2, s = r() * 24 - 12;
    const kinds = [[new THREE.Vector3(k, h, s), new THREE.Vector3(0, 0, r() > .5 ? 1 : -1)], [new THREE.Vector3(s, h, k), new THREE.Vector3(r() > .5 ? 1 : -1, 0, 0)],
      [new THREE.Vector3(k, h, Math.round(s / 1.5) * 1.5), new THREE.Vector3(r() > .5 ? 1 : -1, 0, r() > .5 ? 1 : -1).normalize()]];
    const [o, d] = kinds[i % 3]; ray.set(o, d); ray.far = 2 + r() * 10;
    const want = ray.intersectObject(mesh, false)[0], got = intersectFast(ray, [mesh])[0];
    assert.equal(!!got, !!want, 'ray ' + i); if (want) assert.ok(Math.abs(got.distance - want.distance) < 1e-6);
  }
});
