import * as THREE from 'three';

// three.js walks every object in the scene every frame to refresh its world
// matrix, even objects that were told never to change. The world is ~3600
// objects and ~2000 of them (buildings, ground cover, scenery, props at rest)
// never move, so that walk was most of the per-frame matrix cost on a phone.
//
// freezeTransforms(root) computes the subtree's matrices once and then makes
// the root skip its whole subtree on later frames. Frozen roots must hang
// straight off a scene that never moves (WorldView turns the scene's own
// matrix updates off): the scene recomposing itself every frame is what
// forced every descendant to recompute, so a parent's "force" is ignored
// here. Two things still get through:
//  - root.updateMatrix() (or anything else that sets matrixWorldNeedsUpdate),
//    for a group that does move now and then, like a prop wobbling when hit;
//  - a child added to the root later is picked up on the next frame.
// Anything inside that animates by itself must not be frozen.
const baseUpdate = THREE.Object3D.prototype.updateMatrixWorld;

export function freezeTransforms(root, { movable = false } = {}) {
 root.updateMatrixWorld(true);
 root.traverse(o => {
  o.matrixAutoUpdate = false;
  // A movable root still carries its children when it is moved.
  if (!movable || o === root) o.matrixWorldAutoUpdate = movable;
 });
 if (!movable) root.matrixWorldAutoUpdate = false;
 let known = root.children.length;
 root.updateMatrixWorld = function () {
  if (this.matrixWorldNeedsUpdate || this.children.length !== known) {
   known = this.children.length;
   baseUpdate.call(this, true);
  }
 };
 return root;
}
