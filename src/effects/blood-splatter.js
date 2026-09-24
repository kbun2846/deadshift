// Blood on the ground wherever a player dies: you, or anyone else online.
//
// Each splat is one flat textured quad lying on whatever floor is under the
// body (the ground outdoors, the floorboards inside), thrown along the
// direction of the killing hit: a main pool, droplets flung ahead of it and a
// few long streaks. It grows in over a fraction of a second.
// One stain per player: a death with an `owner` (you, or another player's slot
// online) keeps that player's stain, like their body, until their next death;
// then the older one fades out in REPLACE seconds and the ground is clean
// again, so a player leaves at most their last death behind. A stain with no
// owner stays a minute, then fades. The textures are drawn once on canvases (three shapes, so two
// deaths never look stamped), shared by every splat; a splat only owns its
// material, for the fade. Splats are capped per preset so a long match cannot
// pile up blended quads on a phone (the oldest goes first).
import * as THREE from 'three';
import { castToWall, floorHeight } from './blood-surfaces.js';

export const SPLAT_CAP = Object.freeze({ potato: 6, performance: 8, balanced: 12, quality: 16, extreme: 20 });
const LIFE = 60, FADE = 4, GROW = .35, REPLACE = .6, REACH = 2.4;

// Balanced and up: twice the texture resolution, a fine mist of droplets
// around the throw and a wet sheen on the pool.
const FINE = new Set(['balanced', 'quality', 'extreme']);

// A splatter texture pointing along +x. `seed` varies the shape.
function splatterTexture(seed, fine = false) {
 const size = fine ? 512 : 256, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
 const ctx = canvas.getContext('2d');
 let s = seed * 9973 + 17; const random = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
 const blob = (x, y, r, color, alpha, wobble = .18) => {
  ctx.fillStyle = color; ctx.globalAlpha = alpha; ctx.beginPath();
  const points = 18, phase = random() * 6;
  for (let i = 0; i <= points; i++) {
   const a = i / points * Math.PI * 2, rr = r * (1 + wobble * Math.sin(a * 3 + phase) + wobble * .6 * Math.sin(a * 7 + phase * 2));
   const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
   i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.fill();
 };
 ctx.scale(size / 256, size / 256);
 const c = 128;
 // The pool: dark heart, brighter rim, a little off-centre toward the throw.
 blob(c - 4, c, 62 + random() * 12, '#6e0c11', .95, .24);
 blob(c - 2, c + (random() - .5) * 12, 44 + random() * 10, '#4a070b', .92, .18);
 // Satellite lobes around the pool.
 for (let i = 0; i < 7; i++) { const a = random() * 6.28, d = 50 + random() * 22; blob(c + Math.cos(a) * d, c + Math.sin(a) * d * .8, 12 + random() * 12, '#7a0e14', .88); }
 // Streaks thrown along +x.
 for (let i = 0; i < 4; i++) {
  const spread = (random() - .5) * .7, length = 70 + random() * 45, width = 7 + random() * 7;
  ctx.save(); ctx.translate(c + 20, c); ctx.rotate(spread); ctx.globalAlpha = .8; ctx.fillStyle = '#6a0b10';
  ctx.beginPath(); ctx.moveTo(0, -width); ctx.quadraticCurveTo(length * .6, -width * .6, length, 0); ctx.quadraticCurveTo(length * .6, width * .6, 0, width); ctx.fill();
  ctx.restore();
 }
 // Droplets flung ahead, smaller the further they flew.
 for (let i = 0; i < 26; i++) {
  const a = (random() - .5) * 1.4, d = 66 + random() * 56;
  blob(c + Math.cos(a) * d, c + Math.sin(a) * d, Math.max(2.5, 10 - d / 16) * (.6 + random() * .6), '#7c0f15', .92, .1);
 }
 if (fine) {
  // Mist: tiny droplets fanned along the throw, and a wet highlight.
  for (let i = 0; i < 140; i++) {
   const a = (random() - .5) * 1.9, d = 40 + random() * 86;
   blob(c + Math.cos(a) * d, c + Math.sin(a) * d, .6 + random() * 1.6, random() > .5 ? '#7c0f15' : '#56080d', .85, .05);
  }
  blob(c - 14, c - 10, 16, '#b8313f', .28, .3); blob(c - 20, c - 14, 6, '#e0707a', .22, .2);
  // Darker, drying rim where the pool thins.
  ctx.globalAlpha = .5; ctx.strokeStyle = '#3a0508'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(c - 4, c, 58, 54, 0, 0, Math.PI * 2); ctx.stroke();
 }
 // A few drops behind, from the fall.
 for (let i = 0; i < 8; i++) { const a = Math.PI + (random() - .5) * 2, d = 45 + random() * 25; blob(c + Math.cos(a) * d, c + Math.sin(a) * d, 2 + random() * 3, '#5e0a0f', .8, .1); }
 ctx.globalAlpha = 1;
 const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
 return texture;
}

// Blood thrown onto a wall: a burst of spray with runs dripping down from it.
function wallTexture(seed, fine = false) {
 const size = fine ? 512 : 256, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
 const ctx = canvas.getContext('2d'); ctx.scale(size / 256, size / 256);
 let s = seed * 7919 + 3; const random = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
 const dot = (x, y, r, color, alpha) => { ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, r, r * (.75 + random() * .5), random() * 3, 0, Math.PI * 2); ctx.fill(); };
 const cx = 128, cy = 96;
 dot(cx, cy, 30 + random() * 8, '#6e0c11', .9); dot(cx + (random() - .5) * 14, cy + 4, 20, '#4a070b', .9);
 for (let i = 0; i < 9; i++) { const a = random() * 6.28, d = 24 + random() * 20; dot(cx + Math.cos(a) * d, cy + Math.sin(a) * d * .8, 6 + random() * 9, '#7a0e14', .85); }
 for (let i = 0; i < (fine ? 120 : 45); i++) { const a = random() * 6.28, d = 34 + random() * 70; dot(cx + Math.cos(a) * d, cy + Math.sin(a) * d * .75, Math.max(.8, 5 - d / 22) * (.5 + random()), '#7c0f15', .9); }
 // Runs: from the pool's lower edge down the wall, each ending in a bead.
 for (let i = 0; i < (fine ? 9 : 6); i++) {
  const x = cx + (random() - .5) * 60, top = cy + 8 + random() * 14, length = 40 + random() * 100, w = 2 + random() * 3.5;
  ctx.globalAlpha = .88; ctx.fillStyle = '#640a10'; ctx.beginPath();
  ctx.moveTo(x - w, top); ctx.lineTo(x + w, top); ctx.lineTo(x + w * .55, top + length); ctx.lineTo(x - w * .55, top + length); ctx.fill();
  dot(x, top + length, w * 1.1, '#5a0a0f', .92);
 }
 ctx.globalAlpha = 1;
 const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
 return texture;
}

export class BloodSplatters {
 constructor(view) {
  this.view = view; this.splats = [];
  this.geometry = new THREE.PlaneGeometry(1, 1); this.geometry.rotateX(-Math.PI / 2); this.wallGeometry = new THREE.PlaneGeometry(1, 1);
  this.textures = null;
 }

 get cap() { return SPLAT_CAP[this.view.qualityName] ?? 12; }

 // The floor under a point: floorboards indoors, else the ground. From the
 // map's building outlines (blood-surfaces.js), not a raycast into the world.
 floorAt(x, z) { return Math.max(.05, floorHeight(this.view.map, x, z)); }

 // A death at (x, z). The hit came from direction (dx, dz): blood flies that way.
 add(x, z, dx = 0, dz = 0, owner = null) {
  // That player's last stain gives way to this one.
  if (owner !== null) for (const old of this.splats) if (old.owner === owner && !old.leaving) { old.leaving = true; old.leaveAge = 0; }
  const fine = FINE.has(this.view.qualityName);
  // Made on first use, and again if the preset crosses the fine line.
  if (!this.textures || (this.fine !== undefined && this.fine !== fine)) { this.textures?.forEach(t => t.dispose()); this.walls?.forEach(t => t.dispose()); this.textures = [1, 2, 3].map(seed => splatterTexture(seed, fine)); this.walls = null; }
  this.fine = fine;
  const length = Math.hypot(dx, dz), angle = length > 1e-6 ? Math.atan2(dz, dx) : Math.random() * Math.PI * 2;
  const material = new THREE.MeshBasicMaterial({ map: this.textures[Math.floor(Math.random() * 3)], transparent: true, depthWrite: false,
   polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  const mesh = new THREE.Mesh(this.geometry, material);
  const size = 2.6 + Math.random() * .7;
  mesh.position.set(x + Math.cos(angle) * .35, this.floorAt(x, z) + .004, z + Math.sin(angle) * .35);
  mesh.rotation.y = -angle; mesh.renderOrder = 2; mesh.scale.setScalar(size * .25);
  mesh.userData.size = size;
  this.view.scene.add(mesh);
  this.splats.push({ mesh, age: 0, owner, leaving: false, leaveAge: 0 });
  this.wall(x, z, dx, dz, owner);
  while (this.splats.length > this.cap) this.remove(this.splats.shift());
 }

 // Blood thrown onto the nearest wall along the hit (a little either side
 // too), when one stands within reach: a spray with runs down it. Only the
 // world's fixed walls take it (not props, which can break away under it).
 wall(x, z, dx, dz, owner) {
  const colliders = this.view.lastSim?.colliders; if (!colliders) return;
  const length = Math.hypot(dx, dz);
  const base = length > 1e-6 ? Math.atan2(dz, dx) : Math.random() * Math.PI * 2;
  const tries = length > 1e-6 ? [0, .35, -.35] : [0, 1.05, 2.1, 3.14, 4.2, 5.25];
  let best = null;
  // Found from the collider boxes (blood-surfaces.js), not by raycasting the
  // world's merged meshes: that tested every triangle of the map per ray.
  for (const turn of tries) {
   const a = base + turn, hit = castToWall(colliders, x, z, Math.cos(a), Math.sin(a), REACH, 1.5);
   if (hit && hit.propId === null && (!best || hit.distance < best.distance)) best = hit;
  }
  if (!best) return;
  const hit = { distance: best.distance, point: new THREE.Vector3(best.x, .85, best.z) }, normal = new THREE.Vector3(best.nx, 0, best.nz);
  this.walls ||= [4, 5].map(seed => wallTexture(seed, this.fine));
  const material = new THREE.MeshBasicMaterial({ map: this.walls[Math.floor(Math.random() * 2)], transparent: true, depthWrite: false,
   polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const mesh = new THREE.Mesh(this.wallGeometry, material);
  // Closer walls take more of it.
  const size = (1.5 - hit.distance / REACH * .6) * (.9 + Math.random() * .25);
  mesh.position.copy(hit.point).addScaledVector(normal, .012); mesh.position.y = Math.max(size * .32, hit.point.y + .05);
  mesh.lookAt(mesh.position.x + normal.x, mesh.position.y, mesh.position.z + normal.z);
  mesh.renderOrder = 2; mesh.scale.setScalar(size * .25); mesh.userData.size = size;
  this.view.scene.add(mesh);
  this.splats.push({ mesh, age: 0, owner, leaving: false, leaveAge: 0, wall: true });
 }

 update(dt) {
  for (const splat of [...this.splats]) {
   splat.age += dt;
   const grow = Math.min(1, splat.age / GROW), eased = 1 - (1 - grow) ** 3;
   splat.mesh.scale.setScalar(splat.mesh.userData.size * (.25 + .75 * eased));
   let opacity = 1, gone = false;
   if (splat.leaving) { splat.leaveAge += dt; opacity = Math.max(0, 1 - splat.leaveAge / REPLACE); gone = splat.leaveAge >= REPLACE; }
   else if (splat.owner === null) { opacity = Math.min(1, Math.max(0, (LIFE + FADE - splat.age) / FADE)); gone = splat.age >= LIFE + FADE; }
   splat.mesh.material.opacity = opacity;
   if (gone) { this.remove(splat); this.splats.splice(this.splats.indexOf(splat), 1); }
  }
 }

 remove(splat) { splat.mesh.removeFromParent(); splat.mesh.material.dispose(); }

 clear() { for (const splat of this.splats) this.remove(splat); this.splats = []; }
}
