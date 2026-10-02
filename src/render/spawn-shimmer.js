// Spawn protection on screen (spawn-protection.js; owner-approved: "a soft
// shimmer/outline on the protected player", seen by everyone). Round a
// protected body: a faint pale low-poly bubble (seen from the camera above, a
// soft disc over the body), with three bright flat rings rising through it,
// widening and fading as they go, the whole thing shrinking away in its last
// quarter second. Your own body and everyone else's (other players, robots)
// alike.
//
// Cheap and fixed: a small pool of groups made once (one shell geometry, one
// band geometry, four shared materials: every shimmer moves in step), only
// shown and placed each frame; nothing is allocated per frame. The materials
// are plain see-through MeshBasicMaterials like the players' base rings, so
// no new shader program is built when one first appears.
import * as THREE from 'three';
import { groundY } from './ground-lift.js';

const BANDS = 3, HEIGHT = 1.38;

export class SpawnShimmer {
 constructor(view, size = 10) {
  this.view = view;
  const shell = new THREE.IcosahedronGeometry(.72, 1); shell.scale(1, 1.08, 1); shell.translate(0, .72, 0);
  const band = new THREE.RingGeometry(.5, .6, 28); band.rotateX(-Math.PI / 2);
  const base = { transparent: true, side: THREE.DoubleSide, depthWrite: false };
  this.shellMaterial = new THREE.MeshBasicMaterial({ ...base, color: '#d8f3ff', opacity: .2 });
  this.bandMaterials = Array.from({ length: BANDS }, () => new THREE.MeshBasicMaterial({ ...base, color: '#f2fbff', opacity: 0 }));
  this.groups = [];
  for (let i = 0; i < size; i++) {
   const g = new THREE.Group(); g.visible = false; g.renderOrder = 4;
   const s = new THREE.Mesh(shell, this.shellMaterial); s.renderOrder = 4; g.add(s);
   for (let b = 0; b < BANDS; b++) { const m = new THREE.Mesh(band, this.bandMaterials[b]); m.renderOrder = 5; g.add(m); }
   view.scene.add(g); this.groups.push(g);
  }
  this.used = 0; this.bandHeights = new Array(BANDS).fill(0); this.bandWidths = new Array(BANDS).fill(1);
 }
 // Start of a frame's list.
 begin(elapsed) {
  this.used = 0;
  // Shared animation: the shell flickers softly, the bands climb and fade.
  this.shellMaterial.opacity = .17 + .06 * Math.sin(elapsed * 9.5) + .03 * Math.sin(elapsed * 23);
  for (let b = 0; b < BANDS; b++) {
   const t = (elapsed * .95 + b / BANDS) % 1;
   this.bandMaterials[b].opacity = .75 * Math.sin(Math.PI * t);
   this.bandHeights[b] = .05 + t * (HEIGHT - .1); this.bandWidths[b] = .9 + .45 * t;
  }
 }
 // A protected body at (x, z), `guard` seconds left; `y` its drawn ground
 // height (null: worked out here); hidden when `visible` is false.
 add(x, z, guard, y = null, visible = true) {
  if (!visible || this.used >= this.groups.length) return;
  const g = this.groups[this.used++];
  g.visible = true;
  g.position.set(x, y ?? groundY(this.view, x, z), z);
  const k = Math.max(.05, Math.min(1, guard / .25));
  g.scale.set(.9 + .1 * k, k, .9 + .1 * k);
  for (let b = 0; b < BANDS; b++) { const m = g.children[b + 1]; m.position.y = this.bandHeights[b]; m.scale.set(this.bandWidths[b], 1, this.bandWidths[b]); }
 }
 // End of the frame's list: the rest are hidden.
 end() { for (let i = this.used; i < this.groups.length; i++) if (this.groups[i].visible) this.groups[i].visible = false; }
 clear() { this.used = 0; this.end(); }
}
