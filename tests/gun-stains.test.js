// v0.990a: blood flecks on a held gun (effects/blood-wading.js makeGunStains)
// lie on the gun's own parts and stay drop-sized. A two-gun loadout (Sightline's
// slung rifle and its pistol) used to make one box round the whole body, and
// flecks sized from it were half a metre across, hanging in the air.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeGunStains, FLECK_MAX } from '../src/effects/blood-wading.js';

test('gun flecks: on the parts, never bigger than a drop', () => {
  const gun = new THREE.Group();
  const rifle = new THREE.Mesh(new THREE.BoxGeometry(.08, .08, 1.3), new THREE.MeshLambertMaterial());
  rifle.position.set(-.3, 1.1, .2); rifle.rotation.y = .8; gun.add(rifle);
  const pistol = new THREE.Mesh(new THREE.BoxGeometry(.06, .1, .22), new THREE.MeshLambertMaterial());
  pistol.position.set(.35, .75, -.3); gun.add(pistol);
  const stains = makeGunStains(gun, 'sightline');
  stains.set(1);
  const root = gun.children.find(o => o.userData.gunStains);
  assert.ok(root, 'flecks made');
  gun.updateMatrixWorld(true);
  const boxes = [rifle, pistol].map(m => new THREE.Box3().setFromObject(m));
  let n = 0;
  root.traverse(o => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position, v = new THREE.Vector3(), b = new THREE.Box3();
    // Each merged fleck is 36 vertices (a box, non-indexed).
    for (let i = 0; i < pos.count; i += 36) {
      b.makeEmpty(); for (let k = 0; k < 36; k++) b.expandByPoint(v.fromBufferAttribute(pos, i + k).applyMatrix4(o.matrixWorld));
      const size = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
      assert.ok(size <= FLECK_MAX * 1.6 * Math.SQRT2 + 1e-6, `fleck ${size.toFixed(3)} m across`);
      const c = b.getCenter(new THREE.Vector3());
      assert.ok(boxes.some(box => c.x >= box.min.x - .01 && c.x <= box.max.x + .01 && c.z >= box.min.z - .01 && c.z <= box.max.z + .01), 'on a part, not in the air between them');
      n++;
    }
  });
  assert.ok(n >= 9, `${n} flecks`);
  stains.dispose();
});
