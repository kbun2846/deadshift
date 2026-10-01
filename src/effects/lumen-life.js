// Lumen's pigeons and rats, drawn (stage 3, agent E; lumen-design.md 14b). The
// rules live in lumen-life-rules.js (LifeWorld: where they stand, what scares
// them, how they fly); this draws them and plugs into the city hub as the
// `life` system (map.city.life). Cosmetic: nothing collides with them, nothing
// hurts them, the sim is never asked anything.
//
// Cost. Three instanced meshes, built at load at the most animals any preset
// shows, so a preset change or a flock going up never builds a mesh or a
// program: pigeon bodies (one draw), pigeon wings (a second draw, two
// instances a bird) and rats (one draw); a mesh with nothing to show is not
// drawn at all. About 110 triangles a pigeon, 50 a rat, 8 for a pair of
// wings. Only the animals inside the camera's window (rules: `act`) are
// written each frame, into reused matrices: nothing is allocated. Shadows
// from Quality up only (a shadow map draws them a second time).
//
// Looks: pigeons are grey with a darker head and a faint green-teal neck sheen
// (no team colour), about 0.35 m long; rats are dark grey-brown with a thin
// pink-grey tail, about 0.4 m with the tail (both a little over life size so they read from the
// 29 m camera). Each animal gets a slightly
// different tone (an instance colour) so a flock is not a row of copies.
//
// Sound (agent D): `city.life.onFlock = (x, z, n) => {}` a flock going up,
// `onSqueak = (x, z) => {}` a rat bolting, `onCoo = (x, z) => {}` an idle coo.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { registerCitySystem } from '../render/city-registry.js';
import { LifeWorld, LIFE, BIRD, RAT } from './lumen-life-rules.js';

export const LIFE_LOOK = Object.freeze({
  body: '#83878f', head: '#464c58', sheen: '#4f8a7c', beak: '#b9aca2', tail: '#565b66', leg: '#8a5d5a', wing: '#70747d',
  rat: '#4a3f3a', ratHead: '#54473f', ratEar: '#7a6360', ratTail: '#8a706b',
  // A tone each animal wears (a multiplier on its colours).
  pigeonTones: Object.freeze(['#ffffff', '#dfe2ea', '#f4efe8', '#cfd3dc']), ratTones: Object.freeze(['#ffffff', '#e2d6d0', '#c9bcb6']),
  ratScale: 1.3, pigeonScale: 1.1,
});

function paint(geometry, colour) {
  const c = new THREE.Color(colour), n = geometry.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geometry;
}
const flat = g => (g.index ? g.toNonIndexed() : g);
function merge(parts) {
  for (const p of parts) { p.deleteAttribute('uv'); p.deleteAttribute('normal'); }
  const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
}

// A pigeon, +z forward, feet on y = 0: plump body, dark head, sheen at the neck, short beak, tail, legs.
export function pigeonBodyGeometry() {
  const L = LIFE_LOOK;
  const body = new THREE.IcosahedronGeometry(.085, 0); body.scale(.9, .8, 1.55); body.translate(0, .105, -.01);
  const neck = new THREE.IcosahedronGeometry(.052, 0); neck.scale(1, .9, 1); neck.translate(0, .158, .088);
  const head = new THREE.IcosahedronGeometry(.044, 0); head.translate(0, .19, .138);
  const beak = new THREE.ConeGeometry(.014, .05, 4); beak.rotateX(Math.PI / 2); beak.translate(0, .186, .2);
  const tail = new THREE.BoxGeometry(.08, .014, .13); tail.rotateX(-.2); tail.translate(0, .1, -.2);
  const legL = new THREE.BoxGeometry(.012, .07, .012); legL.translate(.026, .035, .01);
  const legR = new THREE.BoxGeometry(.012, .07, .012); legR.translate(-.026, .035, .01);
  return merge([paint(flat(body), L.body), paint(flat(neck), L.sheen), paint(flat(head), L.head), paint(flat(beak), L.beak), paint(flat(tail), L.tail), paint(flat(legL), L.leg), paint(flat(legR), L.leg)]);
}
// A wing from the shoulder out along +x: broad, rounded at the tip.
export function pigeonWingGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, .06); shape.lineTo(.16, .078); shape.lineTo(.3, .035); shape.lineTo(.33, -.03); shape.lineTo(.2, -.078); shape.lineTo(0, -.05); shape.closePath();
  const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); // lies flat, +y up, chord along z
  return g;
}
// A rat, +z forward: low body, pointed head, ears, a thin tail trailing behind.
export function ratGeometry() {
  const L = LIFE_LOOK;
  const body = new THREE.IcosahedronGeometry(.055, 0); body.scale(.85, .7, 1.8); body.translate(0, .05, -.02);
  const head = new THREE.IcosahedronGeometry(.035, 0); head.scale(.85, .8, 1.3); head.translate(0, .055, .11);
  const snout = new THREE.ConeGeometry(.014, .05, 4); snout.rotateX(Math.PI / 2); snout.translate(0, .05, .165);
  const earL = new THREE.ConeGeometry(.014, .026, 3); earL.translate(.022, .088, .092);
  const earR = new THREE.ConeGeometry(.014, .026, 3); earR.translate(-.022, .088, .092);
  const tail = new THREE.ConeGeometry(.007, .22, 3); tail.rotateX(-Math.PI / 2); tail.translate(0, .028, -.2);
  return merge([paint(flat(body), L.rat), paint(flat(head), L.ratHead), paint(flat(snout), L.ratHead), paint(flat(earL), L.ratEar), paint(flat(earR), L.ratEar), paint(flat(tail), L.ratTail)]);
}

const SHADOWS = new Set(['quality', 'extreme']);

export class LumenLife {
  constructor(view, map, city) {
    this.view = view; this.city = city;
    this.world = new LifeWorld(map, { quality: view.qualityName || 'balanced' });
    const maxBirds = this.world.pigeons.length, maxRats = this.world.rats.length;
    this.bodies = new THREE.InstancedMesh(pigeonBodyGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), maxBirds);
    this.wings = new THREE.InstancedMesh(pigeonWingGeometry(), new THREE.MeshLambertMaterial({ color: LIFE_LOOK.wing, flatShading: true, side: THREE.DoubleSide }), maxBirds * 2);
    this.ratMesh = new THREE.InstancedMesh(ratGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), maxRats);
    this.meshes = [this.bodies, this.wings, this.ratMesh];
    this.bodies.name = 'lumen-pigeons'; this.wings.name = 'lumen-pigeon-wings'; this.ratMesh.name = 'lumen-rats';
    this.pigeonTones = LIFE_LOOK.pigeonTones.map(c => new THREE.Color(c)); this.ratTones = LIFE_LOOK.ratTones.map(c => new THREE.Color(c));
    for (const m of this.meshes) {
      m.frustumCulled = false; m.castShadow = m.receiveShadow = false; m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, this.pigeonTones[0]); m.instanceColor.setUsage(THREE.DynamicDrawUsage); // (the colour buffer exists from the start: the program never changes)
      view.scene.add(m); view.interiorVisibility?.apply(m);
    }
    // Reused every frame.
    this.m = new THREE.Matrix4(); this.w = new THREE.Matrix4(); this.wm = new THREE.Matrix4(); this.sm = new THREE.Matrix4();
    this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, 'YXZ'); this.p = new THREE.Vector3(); this.one = new THREE.Vector3(1, 1, 1).multiplyScalar(LIFE_LOOK.pigeonScale); this.rs = new THREE.Vector3(1, 1, 1);
    this.setQuality(view.qualityName || 'balanced');
    this.draw();
  }

  // Sound hooks (agent D).
  get onFlock() { return this.world.onFlock; } set onFlock(f) { this.world.onFlock = f; }
  get onSqueak() { return this.world.onSqueak; } set onSqueak(f) { this.world.onSqueak = f; }
  get onCoo() { return this.world.onCoo; } set onCoo(f) { this.world.onCoo = f; }

  setQuality(name) {
    this.quality = name; this.world.setQuality(name);
    const shadows = SHADOWS.has(name);
    for (const m of this.meshes) m.castShadow = shadows;
  }

  update(frame) {
    const focus = frame.focus || frame.camera?.position;
    if (!focus) return;
    this.world.update(frame.dt, focus.x, focus.z, frame.camera?.aspect || 16 / 9, frame.player, frame.others);
    this.draw();
  }

  // The hub's world events (city-features.js): a round's path, an impact or blast, a body falling.
  onShot(ax, az, bx, bz) { this.world.onShot(ax, az, bx, bz); }
  onImpact(x, z, kind) { this.world.onImpact(x, z, kind); }
  onFall(x, z) { this.world.onFall(x, z); }

  // The warm-up draws every mesh once: a mesh with nothing to show is not drawn
  // at all, which would leave its program (and the shadow pass's) to build in play.
  warm() {
    for (const m of this.meshes) if (m.count === 0) { this.m.makeScale(0, 0, 0); m.setMatrixAt(0, this.m); m.count = m === this.wings ? 2 : 1; m.setMatrixAt(1, this.m); m.instanceMatrix.needsUpdate = true; }
  }

  draw() {
    const { m, w, wm, sm, q, e, p, one, rs, world } = this, pigeons = world.pigeons, rats = world.rats;
    let n = 0;
    for (let i = 0; i < pigeons.length; i++) {
      const b = pigeons[i];
      if (b.st === BIRD.OFF || !b.act || (!b.on && b.st !== BIRD.FLY)) continue;
      const flying = b.st === BIRD.FLY, sat = !flying;
      // (A little lift with each step, a hop as it startles.)
      const lift = sat && b.mode === 2 && b.st === BIRD.GROUND ? Math.abs(Math.sin(b.bob)) * .012 : b.st === BIRD.STARTLE ? Math.abs(Math.sin(b.age * 30)) * .03 : 0;
      e.set(b.pitch, b.yaw, flying ? Math.sin(b.flap * .5) * .06 : 0); q.setFromEuler(e); p.set(b.x, b.y + lift, b.z);
      m.compose(p, q, one);
      this.bodies.setMatrixAt(n, m); this.bodies.setColorAt(n, this.pigeonTones[b.tone]); this.wings.setColorAt(n * 2, this.pigeonTones[b.tone]); this.wings.setColorAt(n * 2 + 1, this.pigeonTones[b.tone]);
      // Wings: folded along the back when sat, beating (or held) in the air.
      const fold = sat ? Math.PI / 2 - .1 : 0;
      const flap = sat ? -.2 : b.beat > .5 ? Math.sin(b.flap) * .95 : .12 + Math.sin(b.flap) * .05;
      for (let side = 0; side < 2; side++) {
        const sgn = side ? -1 : 1;
        w.makeRotationY(sgn * fold); sm.makeScale(sgn, 1, 1); w.multiply(sm);
        wm.makeRotationZ(sgn * flap); wm.multiply(w);
        w.makeTranslation(sgn * .05, sat ? .125 : .13, sat ? .02 : .03).multiply(wm);
        w.premultiply(m);
        this.wings.setMatrixAt(n * 2 + side, w);
      }
      n++;
    }
    this.bodies.count = n; this.wings.count = n * 2;
    this.bodies.instanceMatrix.needsUpdate = this.wings.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    if (this.wings.instanceColor) this.wings.instanceColor.needsUpdate = true;

    let r = 0;
    for (let i = 0; i < rats.length; i++) {
      const a = rats[i];
      if (!a.on || !a.act || a.st === RAT.HIDDEN || a.vis <= .02) continue;
      const running = a.st === RAT.BOLT ? 1 : a.mode === 1 ? .5 : 0;
      e.set(0, a.yaw + Math.sin(a.gait) * .09 * running, 0); q.setFromEuler(e);
      p.set(a.x, Math.abs(Math.sin(a.gait * .5)) * .01 * running, a.z);
      rs.setScalar(LIFE_LOOK.ratScale * a.vis);
      m.compose(p, q, rs);
      this.ratMesh.setMatrixAt(r, m); this.ratMesh.setColorAt(r, this.ratTones[a.tone]);
      r++;
    }
    this.ratMesh.count = r; this.ratMesh.instanceMatrix.needsUpdate = true; if (this.ratMesh.instanceColor) this.ratMesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    for (const m of this.meshes) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); m.dispose?.(); }
  }
}

registerCitySystem('life', (view, map, city) => new LumenLife(view, map, city));

export { LIFE };
