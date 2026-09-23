// Other players in an online game. Same silhouette as your own gunslinger so
// the world stays consistent, in a colourway of their own, one per player slot
// (coat, arms, hat band, scarf and base ring), so you never lose track of which
// one is you and players can be told apart. No name floats over anyone: names
// are in the lobby and on the scoreboard (Tab), next to the same colour.
// Each body is merged into one draw.
import * as THREE from 'three';
import { RULES } from './config/gameplay.js';

const BASE = { legs: '#3a3440', face: '#d6b58a', brim: '#e7d3ad', crown: '#cdb487', gun: '#4e5458' };
// One colourway per slot (0 is the host). `swatch` is the colour shown next to
// the player's name in the lobby and on the scoreboard.
export const PLAYER_COLOURS = Object.freeze([
 { coat: '#4f6b5a', arm: '#4b6556', band: '#34463b', collar: '#c9d6a3', ring: '#b9d98a', swatch: '#b9d98a' },
 { coat: '#6d5a78', arm: '#6a5876', band: '#4b3f5a', collar: '#d9b44a', ring: '#d9b44a', swatch: '#d9b44a' },
 { coat: '#3f6474', arm: '#3c5f6e', band: '#2c4652', collar: '#8fd3e0', ring: '#8fd3e0', swatch: '#8fd3e0' },
 { coat: '#7a4b3c', arm: '#744737', band: '#553328', collar: '#f0a07a', ring: '#f0a07a', swatch: '#f0a07a' },
]);
export const playerColour = slot => PLAYER_COLOURS[((slot | 0) % PLAYER_COLOURS.length + PLAYER_COLOURS.length) % PLAYER_COLOURS.length];

export class RemotePlayers {
 constructor(view) { this.view = view; this.avatars = new Map(); }

 build(id, slot) {
  const v = this.view, c = { ...BASE, ...playerColour(slot) }, root = new THREE.Group(), g = new THREE.Group(), body = new THREE.Group();
  root.add(g); g.add(body); v.scene.add(root);
  for (const x of [-.15, .15]) v.box(x, .14, 0, .18, .27, .27, c.legs, body);
  v.cylinder(0, .57, 0, .29, .63, c.coat, body, 8, .24);
  v.cylinder(0, .96, 0, .2, .25, c.face, body, 8);
  v.cylinder(0, 1.06, 0, .39, .085, c.brim, body, 10);
  v.cylinder(0, 1.19, 0, .235, .23, c.crown, body, 8, .19);
  v.cylinder(0, 1.09, 0, .239, .075, c.band, body, 8);
  v.box(0, .84, .04, .44, .1, .4, c.collar, body);
  const scarf = v.box(-.1, .7, .32, .16, .3, .06, c.collar, body); scarf.rotation.x = -.3;
  v.box(.27, .69, -.2, .16, .16, .38, c.arm, body);
  v.box(.27, .74, -.5, .12, .14, .36, c.gun, body);
  v.batch(body);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.49, .53, 40), new THREE.MeshBasicMaterial({ color: c.ring, transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .065; g.add(ring);
  const avatar = { root, group: g, body, slot, seen: true };
  this.avatars.set(id, avatar);
  return avatar;
 }

 // `players`: [{ id, name, x, z, vx, vz, aimX, aimZ, dodgeRemaining }], already
 // interpolated by the session. `time` drives the walk bob.
 update(players, time) {
  for (const avatar of this.avatars.values()) avatar.seen = false;
  for (const p of players) {
   let avatar = this.avatars.get(p.id);
   if (avatar && avatar.slot !== (p.slot ?? 1)) { this.remove(p.id); avatar = null; }
   avatar ||= this.build(p.id, p.slot ?? 1);
   avatar.seen = true;
   avatar.root.position.set(p.x, 0, p.z);
   avatar.group.rotation.y = Math.atan2(-p.aimX, -p.aimZ);
   const speed = Math.hypot(p.vx, p.vz);
   const dodge = p.dodgeRemaining > 0 ? Math.sin(Math.PI * (1 - p.dodgeRemaining / RULES.dodgeDuration)) : 0;
   avatar.body.scale.set(1 + dodge * .12, 1 - dodge * .3, 1 + dodge * .12);
   avatar.body.position.y = Math.sin(time * 17) * .022 * speed / 7;
   avatar.body.rotation.z = Math.sin(time * 8.5) * .018 * speed / 7;
  }
  for (const [id, avatar] of this.avatars) if (!avatar.seen) this.remove(id);
 }

 remove(id) {
  const avatar = this.avatars.get(id); if (!avatar) return;
  avatar.root.removeFromParent();
  // The merged body geometry is this avatar's own; its material is shared with
  // the world and stays. The base ring's material is its own.
  avatar.root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material.transparent) o.material.dispose(); } });
  this.avatars.delete(id);
 }

 clear() { for (const id of [...this.avatars.keys()]) this.remove(id); }
}
