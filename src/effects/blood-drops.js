// Blood when a player is shot: a spray of droplets in the air (the renderer's
// particles) and the drops that land, as small stains on the ground, on walls
// and on crate sides. All the stains are instances of one quad (one draw),
// capped per preset; the oldest go first. A crate's stains go with it when it
// breaks; everything goes on a map reset (clearDebris) or a restart.
//
// What bleeds is decided in renderer.js (bullets, Ballast pellets, blasts;
// never Static's stream or single orbs). `amount` scales everything: a first
// bullet is a few drops, a burst of them builds up (see BLEED), a blast is a
// lot at once.
import * as THREE from 'three';
import { castToWall, floorHeight } from './blood-surfaces.js';
import { groundY, hilly } from '../render/ground-lift.js';

export const DROP_CAP = Object.freeze({ potato: 90, performance: 180, balanced: 420, quality: 700, extreme: 1000 });
// Per victim: each hit within `window` seconds of the last adds `step` to the
// amount (up to `max` times the first), so a stream of bullets bleeds more
// and more; a pause resets it. Blasts multiply it by `blast`.
export const BLEED = Object.freeze({ window: 1.4, step: .35, max: 3.2, blast: 2.6 });

function dropTexture() {
 const size = 64, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
 const ctx = canvas.getContext('2d'), c = size / 2;
 const g = ctx.createRadialGradient(c, c, 2, c, c, c);
 g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.62, 'rgba(235,235,235,.95)'); g.addColorStop(.8, 'rgba(160,160,160,.9)'); g.addColorStop(1, 'rgba(160,160,160,0)');
 ctx.fillStyle = g; ctx.beginPath();
 for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2, r = c * (.86 + .1 * Math.sin(a * 3) + .05 * Math.sin(a * 7)); i ? ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r) : ctx.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r); }
 ctx.fill();
 const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

// Boot prints kept (the oldest go first).
export const PRINT_CAP = 120;
// The boot's outline, drawn the same way the dirt print's shader draws it
// (renderer.js): a sole ellipse and a heel ellipse, tread bars across the
// sole left lighter, a slightly ragged edge.
function bootTexture() {
 const W = 64, H = 128, canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
 const ctx = canvas.getContext('2d'), image = ctx.createImageData(W, H);
 for (let row = 0; row < H; row++) for (let col = 0; col < W; col++) {
  const x = (col + .5) / W * 2 - 1, y = 1 - (row + .5) / H * 2;
  const sole = Math.hypot(x / .92, (y - .28) / .72) - 1, heel = Math.hypot(x / .78, (y + .62) / .36) - 1;
  const ragged = .035 * Math.sin(col * 1.7 + row * .9) * Math.sin(row * .53);
  const d = Math.min(sole, heel) + ragged;
  let a = d < -.06 ? 1 : d < 0 ? -d / .06 : 0;
  if (y > -.1 && sole < 0 && (y * 5 - Math.floor(y * 5)) > .55) a *= .45;
  const k = (row * W + col) * 4; image.data[k] = image.data[k + 1] = image.data[k + 2] = 255; image.data[k + 3] = Math.round(a * 235);
 }
 ctx.putImageData(image, 0, 0);
 const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

const SHADES = ['#7a0e14', '#5e0a0f', '#8c1520', '#6a0b10'].map(c => new THREE.Color(c));

export class BloodDrops {
 constructor(view) { this.view = view; this.mesh = null; this.next = 0; this.used = 0; this.props = []; this.dummy = new THREE.Object3D(); this.zero = new THREE.Matrix4().makeScale(0, 0, 0); }

 get cap() { return DROP_CAP[this.view.qualityName] ?? 420; }

 ensure() {
  const cap = this.cap;
  if (this.mesh && this.mesh.userData.cap === cap) return;
  if (this.mesh) this.dispose();
  const geometry = new THREE.PlaneGeometry(1, 1);
  this.material = new THREE.MeshBasicMaterial({ map: typeof document === 'undefined' ? null : (BloodDrops.texture ||= dropTexture()), color: '#ffffff', transparent: true, depthWrite: false,
   polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  this.mesh = new THREE.InstancedMesh(geometry, this.material, cap);
  this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; this.mesh.userData.cap = cap;
  this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  this.mesh.setColorAt(0, SHADES[0]);
  this.view.scene.add(this.mesh); this.next = 0; this.used = 0; this.props = new Array(cap).fill(null);
 }

 // One stain: on the floor at (x, z), or on a face (normal nx, nz) at height y.
 stain(x, y, z, size, nx = null, nz = 0, propId = null) {
  this.ensure();
  const d = this.dummy, i = this.next;
  d.position.set(x, y, z);
  if (nx === null) { d.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2); d.scale.set(size, size * (.7 + Math.random() * .5), 1); }
  else { d.rotation.set(0, Math.atan2(nx, nz), (Math.random() - .5) * .6); d.position.x += nx * .012; d.position.z += nz * .012; d.scale.set(size * .8, size * (1.1 + Math.random() * .8), 1); }
  d.updateMatrix();
  this.mesh.setMatrixAt(i, d.matrix); this.mesh.setColorAt(i, SHADES[Math.floor(Math.random() * SHADES.length)]);
  this.props[i] = propId;
  this.next = (i + 1) % this.mesh.userData.cap; this.used = Math.min(this.used + 1, this.mesh.userData.cap);
  this.mesh.count = this.used;
  this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
 }

 // A hit at (x, z) from direction (dx, dz): drops thrown on through the body.
 splash(x, z, dx, dz, amount, colliders, map) {
  const length = Math.hypot(dx, dz), base = length > 1e-6 ? Math.atan2(dz, dx) : Math.random() * Math.PI * 2;
  const detail = { potato: .4, performance: .6, balanced: 1, quality: 1.3, extreme: 1.6 }[this.view.qualityName] ?? 1;
  const count = Math.max(1, Math.round((2 + 5 * amount) * detail)), reach = 1.1 + amount * .6;
  for (let i = 0; i < count; i++) {
   const a = base + (Math.random() - .5) * (length > 1e-6 ? .9 : Math.PI * 2), distance = .25 + Math.random() * reach;
   const ux = Math.cos(a), uz = Math.sin(a), size = (.05 + Math.random() * .08) * (.8 + Math.min(1, amount) * .4);
   const wall = castToWall(colliders, x, z, ux, uz, distance, 0, hilly(this.view) ? this.view.ground : null);
   // Hits a wall or a crate on its way: a drop on that face, lower the
   // further it flew; otherwise it falls to the floor where it ends.
   if (wall) {
    this.stain(wall.x, Math.max(.12, Math.min(wall.height - .05, .95 - wall.distance * .25 + (Math.random() - .5) * .3)) + groundY(this.view, wall.x, wall.z), wall.z, size, wall.nx, wall.nz, wall.propId);
    // Some runs down to the floor at its foot (a wall's face is often turned
    // away from the camera; the floor beside it never is).
    if (Math.random() < .55) { const fx = wall.x + wall.nx * (.05 + Math.random() * .12), fz = wall.z + wall.nz * (.05 + Math.random() * .12); this.stain(fx, floorHeight(map, fx, fz) + .004, fz, size * .8, null, 0, wall.propId); }
   }
   else this.stain(x + ux * distance, floorHeight(map, x + ux * distance, z + uz * distance) + .004, z + uz * distance, size);
  }
 }

 // A bloody boot print (blood-wading.js): the same step, spot, size and
 // shape as the print in the dirt (renderer.js footprints: a sole and a heel
 // in a unit circle scaled .095 x .18, turned to the walking direction),
 // with the tread showing as lighter bars. Fainter as `strength` falls, from
 // 1 (fresh out of the pool). Its own instances (a boot-shaped texture), in
 // a ring of PRINT_CAP.
 print(x, z, angle, strength, map) {
  if (!this.prints) {
   const geometry = new THREE.PlaneGeometry(2, 2); geometry.rotateX(-Math.PI / 2);
   this.printMaterial = new THREE.MeshBasicMaterial({ map: typeof document === 'undefined' ? null : (BloodDrops.bootTexture ||= bootTexture()), color: '#ffffff', transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
   this.prints = new THREE.InstancedMesh(geometry, this.printMaterial, PRINT_CAP);
   this.prints.count = 0; this.prints.frustumCulled = false; this.prints.renderOrder = 2; this.prints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
   this.prints.setColorAt(0, SHADES[0]); this.view.scene.add(this.prints); this.printNext = 0; this.printUsed = 0;
  }
  const d = this.dummy, i = this.printNext;
  d.position.set(x, floorHeight(map, x, z) + .006, z); d.rotation.set(0, angle, 0); d.scale.set(.095, 1, .18); d.updateMatrix();
  this.prints.setMatrixAt(i, d.matrix); this.prints.setColorAt(i, SHADES[1].clone().lerp(new THREE.Color('#9a4a40'), (1 - strength) * .8));
  this.printNext = (i + 1) % PRINT_CAP; this.printUsed = Math.min(this.printUsed + 1, PRINT_CAP); this.prints.count = this.printUsed;
  this.prints.instanceMatrix.needsUpdate = true; if (this.prints.instanceColor) this.prints.instanceColor.needsUpdate = true;
  // Fading prints lose alpha too: the colour carries it (see bootTexture).
 }

 // A crate broke: its stains go with it.
 dropProp(id) {
  if (!this.mesh) return;
  let changed = false;
  for (let i = 0; i < this.used; i++) if (this.props[i] === id) { this.mesh.setMatrixAt(i, this.zero); this.props[i] = null; changed = true; }
  if (changed) this.mesh.instanceMatrix.needsUpdate = true;
 }

 clear() { if (this.mesh) { this.mesh.count = 0; this.used = 0; this.next = 0; this.props.fill(null); } if (this.prints) { this.prints.count = 0; this.printUsed = 0; this.printNext = 0; } }

 dispose() { this.mesh?.removeFromParent(); this.mesh?.geometry.dispose(); this.mesh?.dispose(); this.material?.dispose(); this.mesh = null; this.prints?.removeFromParent(); this.prints?.geometry.dispose(); this.prints?.dispose(); this.printMaterial?.dispose(); this.prints = null; }
}
