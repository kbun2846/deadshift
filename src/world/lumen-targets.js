// Lumen stage 4: the city's practice targets. Where Deadwater has a painted
// wooden board on a post and a straw dummy, the city has a boxy board on a
// steel pop-up stand and a padded mannequin on a weighted base. The hook is
// one line in world-build.js `makeTarget`: `if (this.map.city) return makeCityTarget(this, moving, kind);`
//
// Everything the rest of the game reads is kept exactly as the wooden ones
// have it (effects/target-damage.js draws its cracks, holes, tears and straw in
// this space, renderer.js wobbles `userData.board` and hides it when the target
// is down, respawn and facing are the sim's and `targetYaw`'s):
//  - a board's face is a group 1 m up, tipped .6 rad toward the camera, its
//    painted side local +y, plates stacked up to .12 above the centre;
//    the face is a .14 thick square 1.08 m across (the wooden one is a
//    .6 m radius disc, and the damage sits within .5-.66 of the middle);
//  - a mannequin's torso is the same tapered, squashed cylinder at 1.04 m,
//    the head at 1.58, the arms at 1.2, the front +z, straps at .85 and 1.17.
// Everything on the board moves together, so it is one draw (view.batch).
// Colours are the city's; a moving board is green, a static one red.
import * as THREE from 'three';
import { CITY as C } from './lumen-kit.js';

export function makeCityTarget(view, moving, kind) {
  const g = new THREE.Group(), board = new THREE.Group(); g.add(board); g.userData.board = board;
  if (kind === 'dummy') {
    // The weighted base: a steel-dark disc with a cast weight ring and four bolts, a stem up the middle.
    view.cylinder(0, .05, 0, .34, .1, C.steelDark, board, 12);
    view.cylinder(0, .115, 0, .27, .03, C.graphite, board, 12);
    view.cylinder(0, .14, 0, .12, .04, C.steelMid, board, 10);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; view.cylinder(Math.cos(a) * .3, .11, Math.sin(a) * .3, .022, .03, C.steel, board, 5); }
    view.box(0, .72, 0, .12, 1.3, .12, C.steelMid, board);
    // The padded body: vinyl grey-blue over foam, a darker seam line and straps.
    const torso = view.mesh(new THREE.CylinderGeometry(.24, .32, .64, 8), C.plastic, 0, 1.04, 0, board); torso.scale.z = .65;
    view.mesh(new THREE.IcosahedronGeometry(.23, 1), C.plasticGrey, 0, 1.58, 0, board);
    view.box(0, 1.37, 0, .16, .1, .14, C.graphite, board); // the neck collar
    for (const side of [-1, 1]) {
      const arm = view.box(side * .38, 1.2, 0, .4, .17, .19, C.plastic, board); arm.rotation.z = side * -.17;
      view.box(side * .53, 1.12, 0, .08, .19, .21, C.graphite, board); // padded cuffs
    }
    for (const y of [.85, 1.17]) view.box(0, y, .175, .45, .035, .025, C.graphite, board);
    const patch = view.mesh(new THREE.SphereGeometry(.095, 7, 5), C.plasticRed, 0, 1.1, .2, board); patch.scale.z = .2;
    view.batch(board);
    return g;
  }
  // The pop-up stand: a steel base plate with four bolts, two rails, a cross bracket at the hinge and a slim
  // piston behind that lifts the board.
  view.box(0, .045, 0, 1.1, .09, .65, C.steelDark, board);
  view.box(0, .1, 0, .7, .03, .4, C.steelMid, board);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) view.cylinder(sx * .48, .1, sz * .27, .028, .03, C.steel, board, 5);
  for (const s of [-1, 1]) view.box(s * .13, .5, 0, .06, .8, .08, C.steelMid, board);
  view.box(0, .94, 0, .4, .07, .12, C.graphite, board);
  view.box(0, .44, -.18, .07, .7, .07, C.steelDark, board); view.cylinder(0, .56, -.18, .05, .34, C.steel, board, 6);
  const face = new THREE.Group(); face.position.set(0, 1, 0); face.rotation.x = .6; board.add(face);
  // The board: a square panel with a raised edge, then plates stepping up to the same heights as the wooden one's rings.
  view.box(0, 0, 0, 1.08, .14, 1.08, C.plasticWhite, face);
  view.box(0, .08, 0, .82, .016, .82, moving ? C.plasticGreen : C.plasticRed, face);
  view.box(0, .096, 0, .54, .018, .54, C.plasticWhite, face);
  view.box(0, .109, 0, .26, .02, .26, C.plasticRed, face);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) view.cylinder(x * .5, .075, z * .5, .028, .02, C.steelDark, face, 5); // corner bolts
  view.batch(board);
  return g;
}
