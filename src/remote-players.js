// Other players in an online game. Same silhouette as your own gunslinger so
// the world stays consistent, in a different colourway (dusty plum coat,
// mustard scarf and base ring) so you never lose track of which one is you.
// Each body is merged into one draw, and a name tag floats overhead.
import * as THREE from 'three';
import { RULES } from './config/gameplay.js';

const COLOURS = { legs: '#3a3440', coat: '#6d5a78', face: '#d6b58a', brim: '#e7d3ad', crown: '#cdb487', band: '#4b3f5a', collar: '#d9b44a', arm: '#6a5876', gun: '#4e5458', ring: '#d9b44a' };

// The canvas is cut to the text, so a short name is not a speck in a wide box.
const TAG_HEIGHT = .5;
function nameTag(name) {
 const font = '700 40px Arial', canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
 ctx.font = font;
 canvas.width = Math.ceil(ctx.measureText(name).width + 24); canvas.height = 56;
 ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
 ctx.lineJoin = 'round'; ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(28,22,16,.8)'; ctx.strokeText(name, canvas.width / 2, 30);
 ctx.fillStyle = '#f3e7c5'; ctx.fillText(name, canvas.width / 2, 30);
 const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
 const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }));
 sprite.scale.set(TAG_HEIGHT * canvas.width / canvas.height, TAG_HEIGHT, 1);
 // Above the hat and a little north, which is "up" on screen, so the tag sits
 // over the head rather than on it. It does not turn with the player.
 sprite.position.set(0, 1.9, -.6); sprite.renderOrder = 20;
 return sprite;
}

export class RemotePlayers {
 constructor(view) { this.view = view; this.avatars = new Map(); }

 build(id, name) {
  const v = this.view, c = COLOURS, root = new THREE.Group(), g = new THREE.Group(), body = new THREE.Group();
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
  const tag = nameTag(name || 'Player'); root.add(tag);
  const avatar = { root, group: g, body, tag, name, seen: true };
  this.avatars.set(id, avatar);
  return avatar;
 }

 // `players`: [{ id, name, x, z, vx, vz, aimX, aimZ, dodgeRemaining }], already
 // interpolated by the session. `time` drives the walk bob.
 update(players, time) {
  for (const avatar of this.avatars.values()) avatar.seen = false;
  for (const p of players) {
   const avatar = this.avatars.get(p.id) || this.build(p.id, p.name);
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
  // the world and stays. Sprites share one geometry across three.js, so only
  // their texture and material go.
  avatar.root.traverse(o => {
   if (o.isMesh) { o.geometry.dispose(); if (o.material.transparent) o.material.dispose(); }
   if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); }
  });
  this.avatars.delete(id);
 }

 clear() { for (const id of [...this.avatars.keys()]) this.remove(id); }
}
