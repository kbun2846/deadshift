// Your player's skin (v0.999a, owner: "the skins should remain the previous
// skin, the dev tool should allow me to change skin, and should spawn as the
// original skin with the hat"). The cowboy is the default and what everyone
// else sees; the developer option Player > Player skin (dev-options.js
// `playerSkin`: 0 cowboy, 1 white, 2 blue) swaps your own body in play for
// the rigged plain figure (figure-rig.js). The gun group, the ring and the
// pointer stay; the body's skin parts (tagged userData.skin), the Static arm
// and the blood stains are rebuilt.
import * as THREE from 'three';
import { makeBloodStains } from '../effects/blood-wading.js';
import { FigureRig, makeRigStains } from './figure-rig.js';
import { figureMaterial, figureBalance } from './player-figure.js';

export const PLAYER_SKINS = Object.freeze(['cowboy', 'white', 'blue']);
export const skinOfDev = value => PLAYER_SKINS[value | 0] || 'cowboy';

// The gunslinger, as always (merged into a few draws; legs and head tagged
// for the death reactions). Returns the Static arm, kept out of the merge.
export function buildCowboy(v, body) {
  const tmp = new THREE.Group();
  for (const x of [-.15, .15]) v.box(x, .14, 0, .18, .27, .27, '#394a44', tmp).userData.deathPart = 'leg';
  v.cylinder(0, .57, 0, .29, .63, '#496e6b', tmp, 8, .24);
  v.cylinder(0, .96, 0, .2, .25, '#d6b58a', tmp, 8).userData.deathPart = 'head';
  v.cylinder(0, 1.06, 0, .39, .085, '#f0dbb2', tmp, 10).userData.deathPart = 'head';
  v.cylinder(0, 1.19, 0, .235, .23, '#dfc494', tmp, 8, .19).userData.deathPart = 'head';
  v.cylinder(0, 1.09, 0, .239, .075, '#6b5d48', tmp, 8).userData.deathPart = 'head';
  v.box(0, .84, .04, .44, .1, .4, '#b85d3e', tmp);
  const scarf = v.box(-.1, .7, .32, .16, .3, .06, '#b85d3e', tmp); scarf.rotation.x = -.3;
  v.batch(tmp);
  for (const part of [...tmp.children]) { part.userData.skin = true; body.add(part); }
  const arm = v.box(.27, .69, -.2, .16, .16, .38, '#49716b', body); arm.userData.skin = true;
  return arm;
}

export function setPlayerSkin(view, skin) {
  const player = view.player, ud = player.userData, body = ud.body;
  if (ud.skin === skin) return;
  ud.bloodStains?.dispose?.(); ud.bloodStains = null;
  ud.rig?.dispose(); ud.rig = null;
  for (const part of [...body.children]) if (part.userData.skin) { part.removeFromParent(); if (!part.userData.rig) part.traverse(o => { if (o.isMesh && !o.geometry.userData.shared) o.geometry.dispose(); }); }
  ud.staticArm = null; ud.figureMaterial = null;
  if (skin === 'cowboy') {
    ud.staticArm = buildCowboy(view, body);
    ud.bloodStains = makeBloodStains(body, ud.staticArm);
  } else {
    view.figureMaterial?.dispose();
    view.figureMaterial = ud.figureMaterial = figureMaterial(skin, figureBalance(view.look));
    ud.rig = new FigureRig(view, body, view.figureMaterial); ud.rig.root.userData.rig = true;
    ud.bloodStains = makeRigStains(ud.rig);
  }
  ud.skin = skin;
  view.gunStains?.dispose?.(); view.gunStains = null;
}
