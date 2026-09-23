// Blood on the ground wherever a player dies: you, or anyone else online.
//
// Each splat is one flat textured quad lying on whatever floor is under the
// body (the ground outdoors, the floorboards inside), thrown along the
// direction of the killing hit: a main pool, droplets flung ahead of it and a
// few long streaks. It grows in over a fraction of a second, stays a minute,
// then fades. The textures are drawn once on canvases (three shapes, so two
// deaths never look stamped), shared by every splat; a splat only owns its
// material, for the fade. Splats are capped per preset so a long match cannot
// pile up blended quads on a phone (the oldest goes first).
import * as THREE from 'three';

export const SPLAT_CAP = Object.freeze({ potato: 6, performance: 8, balanced: 12, quality: 16, extreme: 20 });
const LIFE = 60, FADE = 4, GROW = .35;

// A splatter texture pointing along +x. `seed` varies the shape.
function splatterTexture(seed) {
 const size = 256, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
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
 const c = size / 2;
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
 // A few drops behind, from the fall.
 for (let i = 0; i < 8; i++) { const a = Math.PI + (random() - .5) * 2, d = 45 + random() * 25; blob(c + Math.cos(a) * d, c + Math.sin(a) * d, 2 + random() * 3, '#5e0a0f', .8, .1); }
 ctx.globalAlpha = 1;
 const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
 return texture;
}

export class BloodSplatters {
 constructor(view) {
  this.view = view; this.splats = [];
  this.geometry = new THREE.PlaneGeometry(1, 1); this.geometry.rotateX(-Math.PI / 2);
  this.textures = null; this.ray = new THREE.Raycaster(); this.down = new THREE.Vector3(0, -1, 0);
 }

 get cap() { return SPLAT_CAP[this.view.qualityName] ?? 12; }

 // The floor under a point: floorboards indoors, else the ground.
 floorAt(x, z) {
  const surfaces = this.view.surfaceMarks?.surfaces?.();
  if (surfaces) {
   this.ray.set(new THREE.Vector3(x, .9, z), this.down); this.ray.far = 1.2;
   const hit = this.ray.intersectObjects(surfaces, true).find(h => !h.object.userData.surfaceMark && h.face && h.face.normal.y > .7 && h.point.y < .6);
   if (hit) return Math.max(.05, hit.point.y);
  }
  return .05;
 }

 // A death at (x, z). The hit came from direction (dx, dz): blood flies that way.
 add(x, z, dx = 0, dz = 0) {
  this.textures ||= [1, 2, 3].map(splatterTexture);
  const length = Math.hypot(dx, dz), angle = length > 1e-6 ? Math.atan2(dz, dx) : Math.random() * Math.PI * 2;
  const material = new THREE.MeshBasicMaterial({ map: this.textures[Math.floor(Math.random() * 3)], transparent: true, depthWrite: false,
   polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  const mesh = new THREE.Mesh(this.geometry, material);
  const size = 2.6 + Math.random() * .7;
  mesh.position.set(x + Math.cos(angle) * .35, this.floorAt(x, z) + .004, z + Math.sin(angle) * .35);
  mesh.rotation.y = -angle; mesh.renderOrder = 2; mesh.scale.setScalar(size * .25);
  mesh.userData.size = size;
  this.view.scene.add(mesh);
  this.splats.push({ mesh, age: 0 });
  while (this.splats.length > this.cap) this.remove(this.splats.shift());
 }

 update(dt) {
  for (const splat of [...this.splats]) {
   splat.age += dt;
   const grow = Math.min(1, splat.age / GROW), eased = 1 - (1 - grow) ** 3;
   splat.mesh.scale.setScalar(splat.mesh.userData.size * (.25 + .75 * eased));
   splat.mesh.material.opacity = Math.min(1, Math.max(0, (LIFE + FADE - splat.age) / FADE));
   if (splat.age >= LIFE + FADE) { this.remove(splat); this.splats.splice(this.splats.indexOf(splat), 1); }
  }
 }

 remove(splat) { splat.mesh.removeFromParent(); splat.mesh.material.dispose(); }

 clear() { for (const splat of this.splats) this.remove(splat); this.splats = []; }
}
