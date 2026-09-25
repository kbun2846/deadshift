// Robots wear out instead of bleeding.
//
// Armour: four plates bolted over a robot's wiring (robot-model.js draws the
// wiring into the body): a shoulder guard, the back plate, the chest plate
// with its gauge, and the side of the head. They are merged into one mesh
// per robot (one draw, the world's own vertex-colour material, so no new
// shader), and each plate remembers its stretch of the vertex buffer. As the
// robot's health falls past a plate's mark (`PLATES[i].below`) that stretch is
// collapsed to a point (nothing to draw) and a loose copy of the plate is
// thrown off with a burst of sparks, to clatter to the ground and lie there
// for a while (RobotScrap). Below about two thirds health the exposed wiring
// sparks now and then, faster the weaker it is, and near the end it smokes.
// When it dies whatever armour is left bursts off (shedAll).
//
// Scrap: every loose plate in the game is one InstancedMesh (one draw),
// hidden when there is none. Nothing here allocates per frame.
import * as THREE from 'three';
import { mergeTransformed } from '../render/merge-transformed.js';

// Where each plate sits on the body (the body's own space; front is -z), its
// size, which of the make's colours it is, and the share of health it comes
// off below. Order is the order they come off.
export const PLATES = Object.freeze([
 { id: 'shoulder', at: [-.3, .815, 0], size: [.15, .08, .21], colour: 'trim', below: .8 },
 { id: 'back', at: [0, .62, .288], size: [.31, .31, .035], colour: 'dark', below: .6 },
 { id: 'chest', at: [0, .64, -.288], size: [.31, .29, .035], colour: 'body', below: .4, gauge: true },
 { id: 'temple', at: [-.172, .96, 0], size: [.028, .2, .27], colour: 'face', below: .2 },
]);
export const WEAR = Object.freeze({ sparkBelow: .65, smokeBelow: .3, scrapLife: 12, maxScrap: 40 });

const boxes = new Map();
const boxOf = (w, h, d) => { const k = w + ',' + h + ',' + d; let g = boxes.get(k); if (!g) boxes.set(k, g = new THREE.BoxGeometry(w, h, d)); return g; };
let gaugeGeometry = null;
const colour = hex => new THREE.Color(hex);

// The armour onto `body` (after it was batched). Returns what wear() needs.
export function buildArmour(view, body, skin) {
 const entries = [], plates = [];
 const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
 let offset = 0;
 for (const plate of PLATES) {
  const start = offset, [w, h, d] = plate.size;
  const add = (geometry, x, y, z, hex, rot = null) => {
   q.identity(); if (rot) q.setFromEuler(rot);
   entries.push({ geometry, matrix: m.clone().compose(new THREE.Vector3(x, y, z), q, one), color: colour(hex) });
   offset += geometry.attributes.position.count;
  };
  add(boxOf(w, h, d), ...plate.at, skin[plate.colour]);
  // Four bolts at the corners of the big plates.
  if (w > .2 || h > .2) {
   const out = Math.sign(plate.at[2]) * (d / 2 + .006);
   for (const [bx, by] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(boxOf(.03, .03, .012), plate.at[0] + bx * (w / 2 - .035), plate.at[1] + by * (h / 2 - .035), plate.at[2] + out, skin.trim);
  }
  if (plate.gauge) {
   gaugeGeometry ||= new THREE.CylinderGeometry(.07, .07, .03, 8);
   add(gaugeGeometry, -.07, .67, plate.at[2] - .03, '#e8e2d0', new THREE.Euler(Math.PI / 2, 0, 0));
   add(boxOf(.012, .05, .01), -.06, .69, plate.at[2] - .05, '#b8342c', new THREE.Euler(0, 0, -.6));
  }
  plates.push({ ...plate, start, count: offset - start, on: true, hex: skin[plate.colour] });
 }
 const geometry = mergeTransformed(entries);
 if (!geometry) return null;
 geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
 geometry.computeBoundingSphere();
 const mesh = new THREE.Mesh(geometry, view.bakedMaterial('plain'));
 mesh.castShadow = true; mesh.receiveShadow = true;
 body.add(mesh);
 return { mesh, plates, lost: new Set(), sparkIn: 0, smokeIn: 0 };
}

// Hide a plate on the robot (its vertices collapse to a point).
function collapse(armour, plate) {
 const pos = armour.mesh.geometry.attributes.position, a = pos.array, s = plate.start * 3;
 const x = a[s], y = a[s + 1], z = a[s + 2];
 for (let i = 0; i < plate.count; i++) { a[s + i * 3] = x; a[s + i * 3 + 1] = y; a[s + i * 3 + 2] = z; }
 pos.addUpdateRange(s, plate.count * 3); pos.needsUpdate = true;
 plate.on = false; armour.lost.add(plate.id);
}

const at = new THREE.Vector3();
// Throw a plate off `avatar` (its body's space → the world), `push` along
// (dx, dz) and `force` (1 a hit, more a death).
function shed(view, avatar, plate, dx = 0, dz = 0, force = 1) {
 const armour = avatar.glow.armour;
 collapse(armour, plate);
 avatar.body.updateMatrixWorld(true);
 at.set(...plate.at).applyMatrix4(avatar.body.matrixWorld);
 // Out from the body's middle, up, and along the hit.
 const cx = at.x - avatar.root.position.x, cz = at.z - avatar.root.position.z, cl = Math.hypot(cx, cz) || 1;
 const out = 1.4 * force;
 view.robotScrap?.throw(at.x, at.y, at.z, cx / cl * out + dx * 1.6 * force + (Math.random() - .5), 2.2 + Math.random() * 1.6 * force, cz / cl * out + dz * 1.6 * force + (Math.random() - .5), plate.size, plate.hex);
 if (view.fx?.on) view.fx.electric(at.x, at.y, at.z, .55 * Math.min(1.6, force), { ring: false });
}

// Every frame for a living robot: plates off as its health falls, and sparks
// (and smoke) from the wiring. `share` is health / max.
export function wear(view, avatar, share, dt) {
 const armour = avatar.glow?.armour; if (!armour) return;
 for (const plate of armour.plates) if (plate.on && share < plate.below) shed(view, avatar, plate);
 const fx = view.fx; if (!fx?.on || share >= WEAR.sparkBelow) return;
 armour.sparkIn -= dt;
 if (armour.sparkIn <= 0) {
  // Every ~1 s when first hurt, several a second near the end.
  armour.sparkIn = (.14 + share * 1.4) * (.6 + Math.random() * .8);
  const lost = armour.plates.filter(p => !p.on), p = lost.length ? lost[Math.floor(Math.random() * lost.length)] : null;
  avatar.body.updateMatrixWorld(true);
  if (p) at.set(p.at[0] + (Math.random() - .5) * .1, p.at[1] + (Math.random() - .5) * .1, p.at[2]); else at.set((Math.random() - .5) * .3, .5 + Math.random() * .4, 0);
  at.applyMatrix4(avatar.body.matrixWorld);
  fx.electric(at.x, at.y, at.z, .22 + (1 - share) * .3, { ring: false });
 }
 if (share < WEAR.smokeBelow) {
  armour.smokeIn -= dt;
  if (armour.smokeIn <= 0) {
   armour.smokeIn = .35 + Math.random() * .4;
   const r = avatar.root.position;
   fx.puff?.({ x: r.x, y: 1, z: r.z, vx: (Math.random() - .5) * .3, vz: (Math.random() - .5) * .3, vy: .7, rise: .9, size: .16, grow: 2, life: 1.4, alpha: .3, color: SMOKE });
  }
 }
}
const SMOKE = new THREE.Color('#45484a');

// A robot's death: what armour it still wore bursts off. `lost`: ids it had
// already shed alive (on the ground already, so not thrown twice).
export function shedAll(view, avatar, lost, event = {}) {
 const armour = avatar.glow.armour;
 const dl = Math.hypot(event.directionX || 0, event.directionZ || 0) || 1;
 for (const plate of armour.plates) {
  if (!plate.on) continue;
  if (lost?.has(plate.id)) collapse(armour, plate);
  else shed(view, avatar, plate, (event.directionX || 0) / dl, (event.directionZ || 0) / dl, 1.8);
 }
}

// Loose plates on the ground, all of them one draw.
export class RobotScrap {
 constructor(view) {
  this.view = view;
  const material = new THREE.MeshStandardMaterial({ roughness: .75, metalness: .15 });
  this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, WEAR.maxScrap);
  this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  this.mesh.setColorAt(0, new THREE.Color('#888888'));
  this.mesh.count = 0; this.mesh.visible = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
  view.scene.add(this.mesh);
  this.pieces = []; this.next = 0;
  this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(); this.c = new THREE.Color();
 }

 throw(x, y, z, vx, vy, vz, size, hex) {
  const piece = { x, y, z, vx, vy, vz, rx: 0, ry: Math.random() * 6, rz: 0, wx: (Math.random() - .5) * 14, wy: (Math.random() - .5) * 8, wz: (Math.random() - .5) * 14, w: size[0], h: size[1], d: size[2], age: 0, rest: false };
  if (this.pieces.length < WEAR.maxScrap) this.pieces.push(piece);
  else { this.pieces[this.next] = piece; this.next = (this.next + 1) % WEAR.maxScrap; }
  const i = this.pieces.indexOf(piece);
  this.mesh.setColorAt(i, this.c.set(hex)); this.mesh.instanceColor.needsUpdate = true;
 }

 update(dt) {
  const list = this.pieces; if (!list.length) { this.mesh.visible = false; return; }
  let alive = 0;
  for (let i = 0; i < list.length; i++) {
   const p = list[i]; p.age += dt;
   if (!p.rest) {
    p.vy -= 16 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
    // Lands flat-ish, bounces once or twice, skids to a stop.
    const floor = Math.min(p.w, p.h, p.d) / 2 + .005;
    if (p.y <= floor) {
     p.y = floor;
     if (p.vy < -1.5) { p.vy *= -.3; p.vx *= .55; p.vz *= .55; p.wx *= .5; p.wz *= .5; }
     else { p.vy = 0; p.vx *= Math.max(0, 1 - dt * 8); p.vz *= Math.max(0, 1 - dt * 8); p.wx = p.wy = p.wz = 0;
      // Settle onto its broad face.
      p.rx += (Math.round(p.rx / (Math.PI / 2)) * Math.PI / 2 - p.rx) * Math.min(1, dt * 10); p.rz += (Math.round(p.rz / (Math.PI / 2)) * Math.PI / 2 - p.rz) * Math.min(1, dt * 10);
      if (Math.hypot(p.vx, p.vz) < .05) p.rest = true; }
    }
   }
   // Old scrap sinks away.
   const fade = Math.max(0, Math.min(1, WEAR.scrapLife + 1 - p.age));
   this.e.set(p.rx, p.ry, p.rz); this.q.setFromEuler(this.e);
   this.s.set(p.w * fade, p.h * fade, p.d * fade); this.p.set(p.x, p.y, p.z);
   this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
   if (fade > 0) alive++;
  }
  if (!alive) { this.clear(); return; }
  this.mesh.count = list.length; this.mesh.visible = true; this.mesh.instanceMatrix.needsUpdate = true;
 }

 clear() { this.pieces.length = 0; this.next = 0; this.mesh.count = 0; this.mesh.visible = false; }
}
