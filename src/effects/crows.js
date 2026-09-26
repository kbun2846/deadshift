// Hollow Wick's crows, drawn (stage 3, s3-sound). The rules live in
// crow-rules.js (CrowFlock); this draws them: two instanced meshes (bodies,
// and wings, two instances per crow), one draw each, built at load (before
// the shader warm-up) at the most crows any preset shows, so a preset change
// or a scatter never builds a mesh or a program. Nothing casts a shadow.
//
// A crow is small and dark (body #2a2c30, wing #1e2024; about 0.4 m long,
// 0.75 m across the wings): a shape at the edge of attention, never mistaken
// for a player or a pickup. Perched, the wings lie folded along the back;
// flying, they beat (or hold, gliding); at a body the whole bird tips forward
// to peck.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mapProps } from '../map-kit.js';
import { CrowFlock, crowPerches, seededRandom } from './crow-rules.js';

export const CROW_LOOK = Object.freeze({ body: '#2a2c30', wing: '#1e2024', beak: '#18191b', scale: .82 });

// Only maps whose crows are wanted (Hollow Wick: "crows only").
export const hasCrows = map => map?.id === 'hollow-wick';

function paint(geometry, colour) {
  const c = new THREE.Color(colour), n = geometry.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geometry;
}
const nonIndexed = g => (g.index ? g.toNonIndexed() : g);
// The body: a stretched icosahedron, the head, the beak and a fanned tail. +z forward.
export function crowBodyGeometry() {
  const body = new THREE.IcosahedronGeometry(.13, 0); body.scale(.85, .78, 1.45); body.translate(0, .12, 0);
  const head = new THREE.IcosahedronGeometry(.085, 0); head.translate(0, .21, .17);
  const beak = new THREE.ConeGeometry(.032, .12, 4); beak.rotateX(Math.PI / 2); beak.translate(0, .2, .28);
  const tail = new THREE.BoxGeometry(.13, .025, .2); tail.translate(0, .1, -.27);
  const legs = new THREE.BoxGeometry(.09, .08, .03); legs.translate(0, .03, .02);
  const parts = [paint(nonIndexed(body), CROW_LOOK.body), paint(nonIndexed(head), CROW_LOOK.body), paint(nonIndexed(beak), CROW_LOOK.beak), paint(nonIndexed(tail), CROW_LOOK.wing), paint(nonIndexed(legs), CROW_LOOK.beak)];
  for (const p of parts) { p.deleteAttribute('uv'); p.deleteAttribute('normal'); }
  const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
}
// A wing from the shoulder out along +x: broad, squared, a little tapered.
export function crowWingGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, .09); shape.lineTo(.3, .1); shape.lineTo(.44, .06); shape.lineTo(.46, -.04); shape.lineTo(.3, -.1); shape.lineTo(0, -.08); shape.closePath();
  const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); // lies flat, +y up, chord along z
  return g;
}

export class Crows {
  constructor(view, map, { random = seededRandom(1790) } = {}) {
    this.view = view;
    const heightAt = (x, z) => view.gy(x, z);
    const field = () => view.waterFX?.field;
    this.perches = crowPerches(map, mapProps(map), heightAt);
    this.flock = new CrowFlock(this.perches, { heightAt, random, quality: view.qualityName || 'balanced', wetAt: (x, z) => (field()?.depthAt?.(x, z) ?? -1) > .05 });
    const max = this.flock.crows.length;
    this.bodies = new THREE.InstancedMesh(crowBodyGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), max);
    this.wings = new THREE.InstancedMesh(crowWingGeometry(), new THREE.MeshLambertMaterial({ color: CROW_LOOK.wing, flatShading: true, side: THREE.DoubleSide }), max * 2);
    for (const m of [this.bodies, this.wings]) {
      m.name = 'crows'; m.frustumCulled = false; m.castShadow = m.receiveShadow = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); view.scene.add(m);
    }
    this.m = new THREE.Matrix4(); this.w = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.p = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1); this.one = new THREE.Vector3(1, 1, 1).multiplyScalar(CROW_LOOK.scale);
    this.draw();
  }

  get onCall() { return this.flock.onCall; }
  set onCall(f) { this.flock.onCall = f; }

  event(e, shooter) { this.flock.event(e, shooter); }
  reset() { this.flock.reset(); this.draw(); }

  // `players`: every living player's { x, z }; `interior`: your building's id.
  update(dt, players, interior) {
    if (this.view.qualityName && this.view.qualityName !== this.quality) { this.quality = this.view.qualityName; this.flock.setQuality(this.quality); }
    this.flock.update(dt, { players, interior });
    this.draw();
  }

  draw() {
    const { m, w, q, e, p, s } = this, time = this.flock.time;
    let n = 0;
    for (const c of this.flock.crows) {
      if (c.state === 'off') continue;
      e.set(c.pitch || 0, c.yaw, 0); q.setFromEuler(e); p.set(c.x, c.y, c.z);
      m.compose(p, q, this.one);
      this.bodies.setMatrixAt(n, m);
      // Wings: folded along the back when sat, beating or held flying.
      const sat = c.state === 'perched' || c.state === 'ground';
      const fold = sat ? Math.PI / 2 - .12 : 0;
      const flap = sat ? -.22 + c.beat * .5 * Math.sin(time * 30) : c.beat > .5 ? Math.sin(c.flap) * .85 : .08 + Math.sin(c.flap) * .05;
      for (let side = 0; side < 2; side++) {
        const sgn = side ? -1 : 1;
        w.makeRotationY(sgn * fold); s.set(sgn, 1, 1);
        const wm = this.tmp ||= new THREE.Matrix4();
        wm.makeScale(s.x, s.y, s.z); w.multiply(wm);
        wm.makeRotationZ(sgn * flap); wm.multiply(w);
        w.makeTranslation(sgn * .07, sat ? .16 : .15, sat ? .02 : .04).multiply(wm);
        w.premultiply(m);
        this.wings.setMatrixAt(n * 2 + side, w);
      }
      n++;
    }
    this.bodies.count = n; this.wings.count = n * 2;
    this.bodies.instanceMatrix.needsUpdate = true; this.wings.instanceMatrix.needsUpdate = true;
  }
}
