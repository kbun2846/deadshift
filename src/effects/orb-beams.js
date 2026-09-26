// Static's launched orbs leave a beam where they flew (owner, v0.9b): a thin
// pale-blue streak from where the orb left to where it landed, bright for a
// moment and gone in BEAM_LIFE seconds. Every beam in the game is one
// instance of one InstancedMesh (additive, unlit; the fade is the instance
// colour going to black, so no per-beam material and no new shader mid-game).
// Hills: a beam is a chain of instances, each metre and a half over the
// ground under it, so it bends over a rise instead of cutting through it
// (owner, 2026-09-26).
import * as THREE from 'three';
import { groundY, floorY, hilly } from '../render/ground-lift.js';

export const BEAM_LIFE = .32;
const CAPACITY = 480, PIECE = 1.5, COLOUR = new THREE.Color('#bfeaff'), X_AXIS = new THREE.Vector3(1, 0, 0);

export class OrbBeams {
 constructor(view) {
  this.view = view; this.list = []; this.dir = new THREE.Vector3(); this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0); this.c = new THREE.Color();
  const material = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, CAPACITY);
  this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  this.mesh.setColorAt(0, COLOUR); this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  this.mesh.count = 0; this.mesh.visible = false; this.mesh.frustumCulled = false;
  view.scene.add(this.mesh);
 }

 // A beam from (fromX, fromZ) to (x, z); `under`: fired by someone wading
 // under a deck (hills), so it runs over the ground under it.
 add(fromX, fromZ, x, z, under = false) {
  const length = Math.hypot(x - fromX, z - fromZ); if (!(length > .2)) return;
  if (this.list.length >= CAPACITY) this.list.shift();
  this.list.push({ fromX, fromZ, x, z, length, age: 0, under });
 }

 update(dt) {
  if (!this.list.length) { if (this.mesh.visible) { this.mesh.count = 0; this.mesh.visible = false; } return; }
  const list = this.list;
  for (const b of list) b.age += dt;
  this.list = list.filter(b => b.age < BEAM_LIFE);
  let n = 0;
  const view = this.view, hills = view.ground && hilly(view);
  for (const b of this.list) {
   const k = 1 - b.age / BEAM_LIFE, fade = k * k, thick = .03 + .03 * k, wide = .03 + .05 * k;
   this.c.copy(COLOUR).multiplyScalar(fade * 1.6);
   if (!hills) {
    this.p.set((b.fromX + b.x) / 2, .72, (b.fromZ + b.z) / 2);
    this.q.setFromAxisAngle(this.up, -Math.atan2(b.z - b.fromZ, b.x - b.fromX));
    this.s.set(b.length, thick, wide);
    this.mesh.setMatrixAt(n, this.m.compose(this.p, this.q, this.s)); this.mesh.setColorAt(n, this.c);
    n++; continue;
   }
   // Hills: from over the ground it left to over the ground it landed on,
   // over the ground between.
   const pieces = Math.min(16, Math.max(1, Math.ceil(b.length / PIECE)));
   const floor = b.under ? (x, z) => floorY(view, x, z, true) : (x, z) => groundY(view, x, z);
   let ax = b.fromX, az = b.fromZ, ay = .72 + floor(ax, az);
   for (let i = 1; i <= pieces && n < CAPACITY; i++) {
    const t = i / pieces, bx = b.fromX + (b.x - b.fromX) * t, bz = b.fromZ + (b.z - b.fromZ) * t, by = .72 + floor(bx, bz);
    const length = Math.hypot(bx - ax, by - ay, bz - az);
    this.p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    this.q.setFromUnitVectors(X_AXIS, this.dir.set(bx - ax, by - ay, bz - az).normalize());
    // (A hair long, so the pieces meet at a bend.)
    this.s.set(length + .02, thick, wide);
    this.mesh.setMatrixAt(n, this.m.compose(this.p, this.q, this.s)); this.mesh.setColorAt(n, this.c);
    n++; ax = bx; az = bz; ay = by;
   }
  }
  this.mesh.count = n; this.mesh.visible = n > 0;
  if (n) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
 }

 clear() { this.list = []; this.mesh.count = 0; this.mesh.visible = false; }
}
