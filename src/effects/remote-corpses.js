// Other players' bodies (multiplayer): the same deaths as yours (death-corpse.js
// for a fallen body, charred, burnt to the bone or kneeling headless; gore.js
// for the wounds and an explosion's severed parts), in their colours, with
// their weapon dropped beside them, darker. One body per player, like the
// stains: their next death takes the old one away, as do a map reset and
// leaving. Built from a loose copy of their avatar (remote-players.js), so it
// never depends on whether their live avatar is still in the scene.
import * as THREE from 'three';
import { DeathCorpse } from './death-corpse.js';
import { deathReaction } from './death-reactions.js';
import { GoreBurst, darkenWeapon, GORE_DETAIL } from './gore.js';
import { groundY, floorY, hilly } from '../render/ground-lift.js';

const SETTLE = 6; // seconds: every body has come to rest by then

export class RemoteCorpses {
 constructor(view) { this.view = view; this.bodies = new Map(); }

 add(event, slot, weapon) {
  const view = this.view, remote = view.remote;
  if (!remote) return;
  this.remove(slot);
  const reaction = deathReaction(event.damageType);
  const avatar = remote.looseBody(slot, weapon || event.weapon, event.x, event.z, event.aimX ?? 1, event.aimZ ?? 0);
  const entry = { age: 0, avatar, x: event.x, z: event.z };
  // The weapon on the ground beside the body, flat and darker.
  const gun = avatar.hand.clone(true); gun.position.set(0, 0, 0); gun.rotation.set(0, 0, 0);
  const dropped = new THREE.Group(); dropped.add(gun);
  const side = Math.atan2(event.aimZ ?? 0, event.aimX ?? 1) + Math.PI / 2;
  { const gx = event.x + Math.cos(side) * .55, gz = event.z + Math.sin(side) * .55; dropped.position.set(gx, .1 + floorY(view, gx, gz, event.below), gz); }
  dropped.rotation.set(0, -side, Math.PI * .47); view.scene.add(dropped);
  entry.dropped = dropped; entry.releaseGun = darkenWeapon(dropped);
  if (reaction.mode === 'scatter') {
   // Blown apart: no body, the pieces thrown (and the stain from blood-splatter.js).
   entry.gore = new GoreBurst(view, event, { coat: avatar.colours.coat, arm: avatar.colours.arm, legs: avatar.colours.legs }, GORE_DETAIL[view.qualityName] ?? 2);
  } else {
   entry.corpse = new DeathCorpse(view, event, reaction, { root: avatar.root, skip: avatar.hand, yaw: avatar.group.rotation.y });
   entry.corpse.update(0);
  }
  this.bodies.set(slot, entry);
 }

 update(dt) {
  for (const entry of this.bodies.values()) {
   if (entry.age >= SETTLE) continue;
   entry.age = Math.min(SETTLE, entry.age + dt);
   entry.corpse?.update(entry.age); entry.gore?.update(entry.age);
  }
 }

 remove(slot) {
  const entry = this.bodies.get(slot); if (!entry) return;
  entry.corpse?.dispose(); entry.gore?.dispose();
  entry.dropped.removeFromParent(); entry.releaseGun();
  entry.avatar.dispose();
  this.bodies.delete(slot);
 }

 clear() { for (const slot of [...this.bodies.keys()]) this.remove(slot); }
}
