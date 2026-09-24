import * as THREE from 'three';
import { mapProps } from '../maps.js';

// Potato has no shadow map, which left everything looking pasted onto the
// ground. These are the cheap stand-in: a soft dark patch under each prop and
// each moving figure, nudged the way the sun throws shadows on the other
// presets so the lighting still reads the same. Two draws in total (props,
// movers), no shadow pass, and the props' patches are only rewritten when one
// breaks or comes back.
const SUN_LEAN = { x: .6, z: .45 }; // ground offset per metre of height, from the sun at (-24, 40, -18)
const COLOR = '#3a2a18';

function softTexture() {
 const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
 const ctx = canvas.getContext('2d'), g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
 g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.55, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
 ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
 const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
 return texture;
}

// How tall each kind of thing is, for how far its patch leans off it.
const HEIGHT = { barrel: 1, crate: 1.2, cactus: 1.6, sign: 1.4, hay: 1, deadTree: 3, boulder: 1.6, cart: 1.2, pot: .4, pottedPlant: .6, brokenChair: .6 };

export class BlobShadows {
 constructor(scene, map, { maxMovers = 64 } = {}) {
  const geometry = new THREE.PlaneGeometry(1, 1); geometry.rotateX(-Math.PI / 2);
  this.material = new THREE.MeshBasicMaterial({ color: COLOR, map: softTexture(), transparent: true, opacity: .42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  this.props = mapProps(map); // same order as Simulation.props
  this.propMesh = new THREE.InstancedMesh(geometry, this.material, Math.max(1, this.props.length));
  this.moverMesh = new THREE.InstancedMesh(geometry, this.material, maxMovers);
  // Drawn after the road and sand overlays, which are blended too.
  for (const mesh of [this.propMesh, this.moverMesh]) { mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.visible = false; scene.add(mesh); }
  this.dummy = new THREE.Object3D(); this.shown = new Map();
  this.maxMovers = maxMovers;
 }

 set enabled(value) { this.propMesh.visible = this.moverMesh.visible = value; if (value) this.shown.clear(); }
 get enabled() { return this.propMesh.visible; }

 place(mesh, i, x, z, w, d, angle, height) {
  const o = this.dummy;
  o.position.set(x + SUN_LEAN.x * height * .5, .05, z + SUN_LEAN.z * height * .5);
  o.rotation.set(0, angle, 0); o.scale.set(w, 1, d); o.updateMatrix();
  mesh.setMatrixAt(i, o.matrix);
 }

 // `alive(i)` says whether the i-th prop (Simulation.props order) is standing;
 // `movers` is a list of { x, z, size, height } for the player, targets and
 // other players.
 update(alive, movers) {
  if (!this.enabled) return;
  let changed = false;
  this.props.forEach((p, i) => {
   const standing = p.health === null || alive(i);
   if (this.shown.get(i) === standing) return;
   this.shown.set(i, standing); changed = true;
   const h = HEIGHT[p.type] ?? .9, grow = standing ? 1.25 : 0;
   this.place(this.propMesh, i, p.x, p.z, (p.w + h * .35) * grow, (p.d + h * .25) * grow, -(p.angle || 0), h);
  });
  if (changed) this.propMesh.instanceMatrix.needsUpdate = true;
  const count = Math.min(this.maxMovers, movers.length);
  for (let i = 0; i < count; i++) {
   const m = movers[i], size = m.size || 1;
   // Stretched along the way the sun throws it, like the real shadows.
   this.place(this.moverMesh, i, m.x, m.z, size * 1.35, size * .95, -Math.atan2(SUN_LEAN.z, SUN_LEAN.x), m.height ?? 1.3);
  }
  this.moverMesh.count = count; this.moverMesh.instanceMatrix.needsUpdate = true;
 }
}
