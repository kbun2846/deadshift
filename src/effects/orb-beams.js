// Static's launched orbs leave a beam where they flew (owner, v0.9b): a thin
// pale-blue streak from where the orb left to where it landed, bright for a
// moment and gone in BEAM_LIFE seconds. Every beam in the game is one
// instance of one InstancedMesh (additive, unlit; the fade is the instance
// colour going to black, so no per-beam material and no new shader mid-game).
import * as THREE from 'three';

export const BEAM_LIFE = .32;
const CAPACITY = 96, COLOUR = new THREE.Color('#bfeaff');

export class OrbBeams {
 constructor(view) {
  this.view = view; this.list = []; this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0); this.c = new THREE.Color();
  const material = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, CAPACITY);
  this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  this.mesh.setColorAt(0, COLOUR); this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  this.mesh.count = 0; this.mesh.visible = false; this.mesh.frustumCulled = false;
  view.scene.add(this.mesh);
 }

 // A beam from (fromX, fromZ) to (x, z).
 add(fromX, fromZ, x, z) {
  const length = Math.hypot(x - fromX, z - fromZ); if (!(length > .2)) return;
  if (this.list.length >= CAPACITY) this.list.shift();
  this.list.push({ fromX, fromZ, x, z, length, age: 0 });
 }

 update(dt) {
  if (!this.list.length) { if (this.mesh.visible) { this.mesh.count = 0; this.mesh.visible = false; } return; }
  const list = this.list;
  for (const b of list) b.age += dt;
  this.list = list.filter(b => b.age < BEAM_LIFE);
  let n = 0;
  for (const b of this.list) {
   const k = 1 - b.age / BEAM_LIFE, fade = k * k;
   this.p.set((b.fromX + b.x) / 2, .72, (b.fromZ + b.z) / 2);
   this.q.setFromAxisAngle(this.up, -Math.atan2(b.z - b.fromZ, b.x - b.fromX));
   this.s.set(b.length, .03 + .03 * k, .03 + .05 * k);
   this.mesh.setMatrixAt(n, this.m.compose(this.p, this.q, this.s));
   this.mesh.setColorAt(n, this.c.copy(COLOUR).multiplyScalar(fade * 1.6));
   n++;
  }
  this.mesh.count = n; this.mesh.visible = n > 0;
  if (n) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
 }

 clear() { this.list = []; this.mesh.count = 0; this.mesh.visible = false; }
}
