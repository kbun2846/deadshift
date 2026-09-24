// Other players in an online game. Same silhouette as your own gunslinger so
// the world stays consistent, in a colourway of their own, one per player slot
// (coat, arms, hat band, scarf and base ring), so you never lose track of which
// one is you and players can be told apart. No name floats over anyone: names
// are in the lobby and on the scoreboard (Tab), next to the same colour.
// Each body is merged into one draw. Each holds the weapon they are really
// using (the same models as your own, at the middle detail), swapped when they
// change weapon; one model per weapon is built once and shared by every avatar.
import * as THREE from 'three';
import { RULES } from './config/gameplay.js';
import { makeRifle } from './weapons/rifle-model.js';
import { makeShotgun } from './weapons/shotgun-model.js';
import { Wading, makeBloodStains } from './effects/blood-wading.js';
import { buildRobotBody, isRobotSlot, isAllySlot, skinOf, ALLY_COLOURS } from './bots/robot-model.js';

// Where the gun sits in the hand, as on your own player (renderer makePlayer).
const GUN_AT = [.27, .74, -.46];
const templates = new WeakMap();
function gunModel(view, weapon) {
 let byWeapon = templates.get(view); if (!byWeapon) templates.set(view, byWeapon = new Map());
 if (!byWeapon.has(weapon)) {
  let model;
  if (weapon === 'rifle') model = makeRifle(2);
  else if (weapon === 'shotgun') model = makeShotgun(2);
  else {
   // Static: pale-blue receiver, charge rails, yellow muzzle collar.
   model = new THREE.Group();
   view.box(0, -.08, .12, .11, .2, .14, '#354e59', model);
   view.box(0, 0, .025, .22, .19, .35, '#9bd9ee', model);
   view.box(0, .11, .04, .15, .045, .25, '#c1edfa', model);
   view.box(0, 0, -.19, .13, .13, .2, '#568697', model);
   for (const side of [-1, 1]) { view.box(side * .119, .012, .03, .025, .08, .22, '#4d8499', model); view.box(side * .137, .015, .03, .016, .027, .18, '#bff6ff', model); }
   view.cylinder(0, 0, -.267, .112, .115, '#f1ce54', model, 8).rotation.x = Math.PI / 2;
   view.cylinder(0, 0, -.327, .056, .008, '#304d5a', model, 8).rotation.x = Math.PI / 2;
   view.batch(model);
  }
  model.traverse(o => { o.userData.sharedGun = true; });
  byWeapon.set(weapon, model);
 }
 return byWeapon.get(weapon).clone();
}

const BASE = { legs: '#3a3440', face: '#d6b58a', brim: '#e7d3ad', crown: '#cdb487' };
// One colourway per slot (0 is the host). `swatch` is the colour shown next to
// the player's name in the lobby and on the scoreboard.
export const PLAYER_COLOURS = Object.freeze([
 { coat: '#4f6b5a', arm: '#4b6556', band: '#34463b', collar: '#c9d6a3', ring: '#b9d98a', swatch: '#b9d98a' },
 { coat: '#6d5a78', arm: '#6a5876', band: '#4b3f5a', collar: '#d9b44a', ring: '#d9b44a', swatch: '#d9b44a' },
 { coat: '#3f6474', arm: '#3c5f6e', band: '#2c4652', collar: '#8fd3e0', ring: '#8fd3e0', swatch: '#8fd3e0' },
 { coat: '#7a4b3c', arm: '#744737', band: '#553328', collar: '#f0a07a', ring: '#f0a07a', swatch: '#f0a07a' },
 { coat: '#5c5f3a', arm: '#585b37', band: '#3f4127', collar: '#e8e2d0', ring: '#f2eee2', swatch: '#f2eee2' },
 { coat: '#74405a', arm: '#6e3d56', band: '#522c40', collar: '#e58fb8', ring: '#e58fb8', swatch: '#e58fb8' },
]);
export const playerColour = slot => PLAYER_COLOURS[((slot | 0) % PLAYER_COLOURS.length + PLAYER_COLOURS.length) % PLAYER_COLOURS.length];

export class RemotePlayers {
 constructor(view) { this.view = view; this.avatars = new Map(); }

 build(id, slot, loose = false) {
  const v = this.view, c = { ...BASE, ...playerColour(slot) }, root = new THREE.Group(), g = new THREE.Group(), body = new THREE.Group();
  root.add(g); g.add(body); if (!loose) v.scene.add(root);
  if (isRobotSlot(slot)) return this.buildRobot(id, slot, loose, root, g, body);
  // Head and legs are tagged like your own (renderer makePlayer), so a body
  // made from this one loses the right parts (death-corpse.js).
  for (const x of [-.15, .15]) v.box(x, .14, 0, .18, .27, .27, c.legs, body).userData.deathPart = 'leg';
  v.cylinder(0, .57, 0, .29, .63, c.coat, body, 8, .24);
  v.cylinder(0, .96, 0, .2, .25, c.face, body, 8).userData.deathPart = 'head';
  v.cylinder(0, 1.06, 0, .39, .085, c.brim, body, 10).userData.deathPart = 'head';
  v.cylinder(0, 1.19, 0, .235, .23, c.crown, body, 8, .19).userData.deathPart = 'head';
  v.cylinder(0, 1.09, 0, .239, .075, c.band, body, 8).userData.deathPart = 'head';
  v.box(0, .84, .04, .44, .1, .4, c.collar, body);
  const scarf = v.box(-.1, .7, .32, .16, .3, .06, c.collar, body); scarf.rotation.x = -.3;
  v.box(.27, .69, -.2, .16, .16, .38, c.arm, body);
  v.batch(body);
  // Blood from walking through pools (blood-wading.js), like yours.
  const stains = loose ? null : makeBloodStains(body);
  const hand = new THREE.Group(); hand.position.set(...GUN_AT); body.add(hand);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.49, .53, 40), new THREE.MeshBasicMaterial({ color: c.ring, transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .065; g.add(ring);
  const avatar = { root, group: g, body, hand, weapon: null, slot, seen: true, colours: c, stains, wading: stains ? new Wading() : null };
  if (!loose) this.avatars.set(id, avatar);
  return avatar;
 }

 // A robot (bots/): the tin gunslinger in its make (skinOf: steel, copper...),
 // no blood stains, a base ring in its visor colour (an ally's is green,
 // with a pennant).
 buildRobot(id, slot, loose, root, g, body) {
  const ally = isAllySlot(slot), skin = skinOf(slot), glow = buildRobotBody(this.view, body, ally, skin);
  const hand = new THREE.Group(); hand.position.set(...GUN_AT); body.add(hand);
  const ring = new THREE.Mesh(new THREE.RingGeometry(ally ? .47 : .49, .53, 40), new THREE.MeshBasicMaterial({ color: ally ? ALLY_COLOURS.ring : skin.eye, transparent: true, opacity: ally ? .8 : .55, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .065; g.add(ring);
  const avatar = { root, group: g, body, hand, weapon: null, slot, seen: true, robot: true, glow,
   colours: { coat: skin.body, arm: skin.body, legs: skin.legs }, stains: null, wading: null };
  if (!loose) this.avatars.set(id, avatar);
  return avatar;
 }

 // `players`: [{ id, name, x, z, vx, vz, aimX, aimZ, dodgeRemaining }], already
 // interpolated by the session. `time` drives the walk bob.
 update(players, time, dt = 0, pools = []) {
  for (const avatar of this.avatars.values()) avatar.seen = false;
  for (const p of players) {
   let avatar = this.avatars.get(p.id);
   if (avatar && avatar.slot !== (p.slot ?? 1)) { this.remove(p.id); avatar = null; }
   avatar ||= this.build(p.id, p.slot ?? 1);
   avatar.seen = true;
   const weapon = p.weapon || 'static';
   if (avatar.weapon !== weapon) { avatar.hand.clear(); avatar.hand.add(gunModel(this.view, weapon)); avatar.weapon = weapon; }
   avatar.root.position.set(p.x, 0, p.z);
   avatar.group.rotation.y = Math.atan2(-p.aimX, -p.aimZ);
   const speed = Math.hypot(p.vx, p.vz);
   const dodge = p.dodgeRemaining > 0 ? Math.sin(Math.PI * (1 - p.dodgeRemaining / RULES.dodgeDuration)) : 0;
   avatar.body.scale.set(1 + dodge * .12, 1 - dodge * .3, 1 + dodge * .12);
   avatar.body.position.y = Math.sin(time * 17) * .022 * speed / 7;
   avatar.body.rotation.z = Math.sin(time * 8.5) * .018 * speed / 7;
   if (avatar.stains && dt > 0) avatar.stains.set(avatar.wading.update(p.x, p.z, p.vx, p.vz, dt, pools, this.view.drops, this.view.map));
  }
  for (const [id, avatar] of this.avatars) if (!avatar.seen) this.remove(id);
 }

 // A body for a corpse (remote-corpses.js): this slot's avatar, not in the
 // scene or the list, posed at (x, z) facing the aim, holding `weapon`.
 // `dispose` frees what is its own (not the shared gun models).
 looseBody(slot, weapon, x, z, aimX, aimZ) {
  const avatar = this.build(null, slot, true);
  avatar.hand.add(gunModel(this.view, weapon || 'static'));
  avatar.root.position.set(x, 0, z); avatar.group.rotation.y = Math.atan2(-aimX, -aimZ);
  avatar.root.updateMatrixWorld(true);
  avatar.dispose = () => avatar.root.traverse(o => { if (o.isMesh && !o.userData.sharedGun) { o.geometry.dispose(); if (o.material.transparent) o.material.dispose(); } });
  return avatar;
 }

 remove(id) {
  const avatar = this.avatars.get(id); if (!avatar) return;
  avatar.root.removeFromParent(); avatar.stains?.dispose();
  // The merged body geometry is this avatar's own; its material is shared with
  // the world and stays. The base ring's material is its own.
  avatar.root.traverse(o => { if (o.isMesh && !o.userData.sharedGun) { o.geometry.dispose(); if (o.material.transparent) o.material.dispose(); } });
  this.avatars.delete(id);
 }

 clear() { for (const id of [...this.avatars.keys()]) this.remove(id); }
}
