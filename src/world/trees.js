// Tree models (stage 2 of Hollow Wick, the trees): low-poly branching trees,
// stumps, fallen logs, leaf drifts and the fork maple's leaf carpet, built
// once at load from `map.trees` (world/tree-kinds.js has the kinds and the
// colliders; maps/hollow-wick-trees.js the places).
//
// How it stays cheap (~130 trees): every trunk, limb, root, stump, log and
// drift is an ordinary mesh in the trees' own group, and the view's batch() merges
// them per 24 m cell into its baked vertex-colour material (one draw per
// cell, all casting). The leaves are opaque flattened icosahedra, one
// InstancedMesh per part of the map (the North Woods' west and east halves,
// the West Woods, everything else) with a colour per clump: four draws (and
// four in the shadow pass) whatever the count, culled by part.
//
// Canopies near any character you can see thin out with an ordered dither
// (alpha-hash, discard in the fragment shader) so nobody hides under leaves
// from above; the positions (up to 8) are uniforms set as the canopy is
// drawn, so it costs no extra draws.
import * as THREE from 'three';
import { TREE_KINDS, STUMP_RADIUS } from './tree-kinds.js';

const TRUNK = '#231d1a', BARK = '#3b322c', STUMP_TOP = '#4a3f36', ROOT_EARTH = '#3a3026';
// Canopies only (never on the ground: red there reads as blood).
const MAPLE_YELLOW = '#c49a3a', BURNT_ORANGE = '#c0612b', OCHRE = '#b8923c', RUST = '#a4552a', RED = '#8e2f22';
const WOODS_LEAVES = [[MAPLE_YELLOW, .3], [BURNT_ORANGE, .25], [OCHRE, .2], [RUST, .17], [RED, .08]];
const LITTER = ['#8a6a3e', '#7a5a34', '#6e4a2c'];
const CARPET = ['#c0612b', '#b08a3c'];
export const FADE_SLOTS = 8;

// A small seeded generator per tree, from its position (the same tree every
// load, on every machine).
function treeRandom(x, z, salt = 0) {
 let s = (Math.floor(x * 131 + z * 977 + salt * 7919) ^ 0x5bd1e995) >>> 0;
 return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (random, weighted) => { let r = random() * weighted.reduce((a, [, w]) => a + w, 0); for (const [c, w] of weighted) if ((r -= w) <= 0) return c; return weighted[0][0]; };

const UP = new THREE.Vector3(0, 1, 0);
// A tapered limb from a to b (world space), under view.static: merged later.
// Open-ended (its ends are always inside something: the ground, the trunk, a
// fork), four or five sides for the thin ones: triangles are the budget here.
function limb(view, a, b, r0, r1, colour, segments = r0 > .12 ? 5 : 4) {
 const dir = new THREE.Vector3().subVectors(b, a), length = dir.length();
 const mesh = view.mesh(new THREE.CylinderGeometry(r1, r0, length, segments, 1, true), colour, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
 mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
 return mesh;
}
// Turn `dir` away from itself by `spread` radians toward azimuth `turn`,
// then lift it toward the sky by `lift` (0..1).
function bend(dir, spread, turn, lift = 0) {
 const side = new THREE.Vector3(Math.cos(turn), 0, Math.sin(turn));
 side.sub(dir.clone().multiplyScalar(side.dot(dir))).normalize();
 if (!Number.isFinite(side.x)) side.set(1, 0, 0);
 return dir.clone().multiplyScalar(Math.cos(spread)).addScaledVector(side, Math.sin(spread)).lerp(UP, lift).normalize();
}
// A branch and its children; the ends it reaches are where leaves can go.
function branch(view, random, from, dir, length, radius, depth, tips, { spread = .55, lift = .12, children = [2, 3], shrink = .68 } = {}) {
 const to = from.clone().addScaledVector(dir, length);
 limb(view, from, to, radius, radius * .62, radius > .16 ? TRUNK : BARK);
 if (depth <= 0) { tips.push({ at: to, dir }); return; }
 const n = children[0] + Math.floor(random() * (children[1] - children[0] + 1)), turn0 = random() * Math.PI * 2;
 for (let i = 0; i < n; i++) {
  const d = bend(dir, spread * (.7 + random() * .6), turn0 + i / n * Math.PI * 2 + (random() - .5) * .8, lift);
  branch(view, random, to, d, length * (shrink + random() * .12), radius * .6, depth - 1, tips, { spread, lift, children, shrink });
 }
 // A short dead twig now and then, for a ragged silhouette.
 if (depth === 1 && random() < .5) {
  const d = bend(dir, 1 + random() * .5, random() * 6.28, .1);
  limb(view, to, to.clone().addScaledVector(d, length * .35), radius * .3, radius * .12, BARK, 4);
 }
}

// Each kind's shape. trunk: height; limbs: how many leave the top, their
// length, angle out from upright, depth; clumps: how many, their size, colours.
const SHAPES = {
 woods: { height: [2.5, 3.4], lean: .06, limbs: [3, 4], length: [2, 2.6], angle: [.45, .75], depth: 2, side: [1, 2], clumps: [4, 7], size: [.9, 1.3], flat: [.55, .7] },
 elm: { height: [3, 3.8], lean: .04, limbs: [4, 5], length: [2.6, 3.2], angle: [.3, .5], depth: 2, side: [0, 1], clumps: [1, 3], size: [.7, 1], flat: [.6, .7], leaves: [[OCHRE, .5], [RUST, .3], [MAPLE_YELLOW, .2]] },
 apple: { height: [1.1, 1.5], lean: .22, limbs: [4, 5], length: [1.5, 2], angle: [.8, 1.1], depth: 2, side: [0, 0], clumps: [0, 2], size: [.55, .8], flat: [.6, .75], leaves: [[OCHRE, .6], [RUST, .4]], twist: .75 },
 old: { height: [2.6, 3.1], lean: .05, limbs: [5, 6], length: [2.6, 3.2], angle: [.6, .85], depth: 2, side: [1, 2], clumps: [2, 3], size: [.9, 1.2], flat: [.55, .65], leaves: [[RUST, .6], [OCHRE, .4]] },
 willow: { height: [.6, .9], lean: 0, limbs: [2, 3], length: [3, 3.8], angle: [.3, .5], depth: 1, side: [0, 0], clumps: [3, 5], size: [.9, 1.2], flat: [.85, 1], leaves: [[MAPLE_YELLOW, .5], [OCHRE, .5]], droop: .8 },
 maple: { height: [2.8, 3.1], lean: .03, limbs: [5, 6], length: [3.2, 3.8], angle: [.6, .8], depth: 2, side: [1, 2], clumps: [3, 4], size: [1.2, 1.6], flat: [.5, .6], leaves: [[BURNT_ORANGE, .8], [OCHRE, .2]] },
};

function buildTree(view, t, clumps) {
 const shape = SHAPES[t.kind], random = treeRandom(t.x, t.z), s = t.s, span = ([a, b]) => a + (b - a) * random();
 const radius = TREE_KINDS[t.kind].trunk * s, ground = view.gy(t.x, t.z);
 // Stand on the lowest ground under the trunk, a little sunk, so a tree on a
 // slope never floats.
 let low = ground;
 for (let i = 0; i < 4; i++) low = Math.min(low, view.gy(t.x + Math.cos(i * 1.57) * radius, t.z + Math.sin(i * 1.57) * radius));
 const base = new THREE.Vector3(t.x, low - .15, t.z);
 const leanDir = new THREE.Vector3(Math.cos(t.yaw), 0, Math.sin(t.yaw));
 const trunkDir = UP.clone().addScaledVector(leanDir, shape.lean * (.5 + random())).normalize();
 const top = base.clone().addScaledVector(trunkDir, span(shape.height) * s + .15);
 limb(view, base, top, radius, radius * .72, TRUNK, 6);
 // Root flare: a few low wedges round the foot.
 for (let i = 0, n = 3 + Math.floor(random() * 2); i < n; i++) {
  const a = t.yaw + i / n * Math.PI * 2 + random() * .4, root = view.box(t.x + Math.cos(a) * radius * .9, ground + .06, t.z + Math.sin(a) * radius * .9, radius * 1.3, .28, radius * .45, TRUNK);
  root.rotation.set(0, -a, (random() - .5) * .3);
 }
 const tips = [], opts = { spread: .5, lift: t.kind === 'willow' ? 0 : .1, children: t.kind === 'apple' ? [2, 2] : [2, 3], shrink: .66 };
 const limbs = Math.round(span(shape.limbs)), turn0 = t.yaw;
 for (let i = 0; i < limbs; i++) {
  const d = bend(trunkDir, span(shape.angle) + (shape.twist ? (random() - .5) * shape.twist : 0), turn0 + i / limbs * Math.PI * 2 + (random() - .5) * .7);
  branch(view, random, top, d, span(shape.length) * s, radius * .62, shape.depth - 1, tips, opts);
 }
 // A side limb or two lower down the trunk.
 for (let i = 0, n = Math.round(span(shape.side)); i < n; i++) {
  const from = base.clone().lerp(top, .55 + random() * .3), d = bend(trunkDir, .9 + random() * .3, random() * 6.28, .15);
  branch(view, random, from, d, span(shape.length) * s * .7, radius * .4, 1, tips, opts);
 }
 // Leaves: opaque clumps at the branch ends, and one over the crown for the
 // leafy kinds so the canopy reads as one mass from above.
 const count = Math.min(tips.length + 1, Math.round(span(shape.clumps))), palette = shape.leaves;
 const primary = palette ? pick(random, palette) : pick(random, WOODS_LEAVES);
 const colour = () => random() < .7 ? primary : palette ? pick(random, palette) : pick(random, WOODS_LEAVES.filter(([c]) => c !== RED || primary === RED));
 for (let k = tips.length - 1; k > 0; k--) { const j = Math.floor(random() * (k + 1)); [tips[k], tips[j]] = [tips[j], tips[k]]; }
 for (let i = 0; i < count; i++) {
  const size = span(shape.size) * s, tip = tips[i];
  const at = tip ? tip.at.clone().add(new THREE.Vector3((random() - .5) * .5, size * .25 - (shape.droop || 0) * size, (random() - .5) * .5))
   : top.clone().add(new THREE.Vector3(0, span(shape.length) * s * .9, 0));
  clumps.push({ x: at.x, y: at.y, z: at.z, size, flat: span(shape.flat), yaw: random() * 6.28, tilt: (random() - .5) * .3, colour: colour(), shade: .92 + random() * .14 });
 }
}

function buildStump(view, p) {
 const random = treeRandom(p.x, p.z, 3), r = STUMP_RADIUS * p.s, h = .5 * p.s, y = view.gy(p.x, p.z);
 view.cylinder(p.x, y + h / 2 - .08, p.z, r, h + .16, TRUNK, undefined, 7, r * .88);
 // The weathered cut, a jagged splinter standing off one side.
 view.cylinder(p.x, y + h + .005, p.z, r * .8, .03, STUMP_TOP, undefined, 7);
 const splinter = view.box(p.x + Math.cos(p.yaw) * r * .6, y + h + .12, p.z + Math.sin(p.yaw) * r * .6, .12, .3, .08, BARK);
 splinter.rotation.set(0, -p.yaw, .2);
 for (let i = 0; i < 3; i++) {
  const a = p.yaw + i * 2.1 + random() * .5, root = view.box(p.x + Math.cos(a) * r, y + .05, p.z + Math.sin(a) * r, r * 1.3, .2, r * .45, TRUNK);
  root.rotation.y = -a;
 }
}

function buildLog(view, l) {
 const random = treeRandom(l.x, l.z, 5), ux = Math.cos(l.yaw), uz = -Math.sin(l.yaw), half = l.length / 2;
 const ha = view.gy(l.x - ux * half, l.z - uz * half), hb = view.gy(l.x + ux * half, l.z + uz * half);
 // Lying on the ground, sunk a little into the leaves.
 const a = new THREE.Vector3(l.x - ux * half, ha + l.radius * .8, l.z - uz * half), b = new THREE.Vector3(l.x + ux * half, hb + l.radius * .8, l.z + uz * half);
 limb(view, a, b, l.radius, l.radius * .82, BARK, 6);
 // Its cut and broken ends, a lighter rotten wood.
 for (const [end, r] of [[a, l.radius], [b, l.radius * .82]]) {
  const cap = view.mesh(new THREE.CircleGeometry(r * .82, 7), STUMP_TOP, end.x, end.y, end.z);
  cap.lookAt(end === a ? a.clone().sub(b).add(a) : b.clone().sub(a).add(b));
 }
 // A big log came down roots and all: its root plate stands on end.
 if (l.radius > .4) {
  const plate = view.mesh(new THREE.CylinderGeometry(l.radius * 2.1, l.radius * 2.3, .35, 8), ROOT_EARTH, a.x, a.y + .15, a.z);
  plate.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  for (let i = 0; i < 4; i++) {
   const ang = random() * 6.28, root = view.box(a.x, a.y + .15, a.z, .12, .12, l.radius * 4.6, TRUNK);
   root.rotation.set(0, ang, .3);
  }
 }
 // Two stubs of broken branches.
 for (let i = 0; i < 2; i++) {
  const t = .2 + random() * .6, p = a.clone().lerp(b, t), d = new THREE.Vector3((random() - .5) * .6, .7 + random() * .3, (random() - .5) * .6).normalize();
  limb(view, p, p.clone().addScaledVector(d, l.radius + .35 + random() * .4), l.radius * .28, l.radius * .12, BARK, 4);
 }
}

// A drift of leaves against a trunk: two or three low mounds in litter browns
// with an ochre fleck (never red on the ground).
function buildDrift(view, d) {
 const random = treeRandom(d.x, d.z, 7), y = view.gy(d.x, d.z);
 for (let i = 0; i < 3; i++) {
  const r = (.35 + random() * .3) * d.s, a = d.yaw + (i - 1) * .9, x = d.x + Math.cos(a) * r * .6, z = d.z + Math.sin(a) * r * .6;
  const mound = view.mesh(new THREE.SphereGeometry(r, 5, 3), i === 2 && random() < .5 ? CARPET[1] : LITTER[Math.floor(random() * 3)], x, view.gy(x, z) + r * .05, z);
  mound.scale.set(1.3, .28, .9); mound.rotation.y = random() * 6;
 }
 return y;
}

// The fork maple's carpet: one broad spread of burnt orange and ochre leaves,
// thick under the crown and thinning out at its edge.
function buildCarpet(view, t) {
 const random = treeRandom(t.x, t.z, 11), reach = 5.2 * t.s, g = view.ground;
 // A ragged solid bed under the crown, then loose patches over it and past it.
 const bed = new THREE.CircleGeometry(1, 14); bed.rotateX(-Math.PI / 2);
 const rim = bed.attributes.position;
 for (let i = 1; i < rim.count; i++) {
  const r = reach * (.5 + treeRandom(t.x, t.z, 20 + (i % 14))() * .18), px = rim.getX(i) * r, pz = rim.getZ(i) * r;
  rim.setXYZ(i, px, Math.max(g.heightAt(t.x + px, t.z + pz), g.drawnHeightAt(t.x + px, t.z + pz)) + .03, pz);
 }
 rim.setY(0, Math.max(g.heightAt(t.x, t.z), g.drawnHeightAt(t.x, t.z)) + .03);
 bed.computeVertexNormals();
 view.mesh(bed, CARPET[0], t.x, 0, t.z);
 for (let i = 0; i < 260; i++) {
  const d = Math.sqrt(random()) * reach, a = random() * Math.PI * 2, x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
  // Fewer patches toward the rim: its edge fades into the ground.
  if (d / reach > .55 && random() < (d / reach - .55) * 2) continue;
  const y = Math.max(g.heightAt(x, z), g.drawnHeightAt(x, z)) + .045 + random() * .03;
  const geometry = new THREE.CircleGeometry(.25 + random() * .4, 6); geometry.rotateX(-Math.PI / 2);
  const patch = view.mesh(geometry, CARPET[random() < .6 ? 0 : 1], x, y, z);
  patch.rotation.y = random() * 6; patch.scale.set(1, 1, .6 + random() * .5);
 }
}

// The dither fade (see the top): each clump's centre and size from its
// instance matrix, its distance past its own edge to the nearest character.
function canopyMaterial() {
 const material = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true });
 const fade = Array.from({ length: FADE_SLOTS }, () => new THREE.Vector3(0, 0, 0));
 material.userData.fade = fade;
 material.onBeforeCompile = shader => {
  shader.uniforms.treeFade = { value: fade };
  shader.vertexShader = shader.vertexShader
   .replace('#include <common>', `#include <common>\nuniform vec3 treeFade[${FADE_SLOTS}];\nvarying float vTreeFade;`)
   .replace('#include <begin_vertex>', `#include <begin_vertex>
 {
  #ifdef USE_INSTANCING
   vec4 clumpCentre = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
   float clumpSize = length((instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
  #else
   vec4 clumpCentre = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
   float clumpSize = 1.0;
  #endif
  float fadeBy = 0.0;
  for (int i = 0; i < ${FADE_SLOTS}; i++) {
   float away = max(0.0, length(clumpCentre.xz - treeFade[i].xy) - clumpSize);
   fadeBy = max(fadeBy, treeFade[i].z * (1.0 - smoothstep(1.6, 4.5, away)));
  }
  vTreeFade = fadeBy * 0.9;
 }`);
  shader.fragmentShader = shader.fragmentShader
   .replace('#include <common>', `#include <common>\nvarying float vTreeFade;`)
   .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
 if (vTreeFade > 0.0 && fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) < vTreeFade) discard;`);
 };
 material.customProgramCacheKey = () => 'tree-canopy-fade';
 return material;
}

// The characters the local player can see: themselves, and every other body
// the view is drawing (remote-players.js hides the unseen ones).
function updateFade(view, fade) {
 let n = 0;
 const add = (x, z) => { if (n < FADE_SLOTS) fade[n++].set(x, z, 1); };
 if (view.player?.visible !== false && view.player) add(view.player.position.x, view.player.position.z);
 for (const avatar of view.remote?.avatars?.values() || []) if (avatar.root?.visible && avatar.root.parent) add(avatar.root.position.x, avatar.root.position.z);
 for (let i = n; i < FADE_SLOTS; i++) fade[i].z = 0;
}

export function buildTrees(view, map) {
 const data = map.trees;
 if (!data) return null;
 // Everything but the leaves goes into a group of its own, all of it casting
 // (so batch() makes one mesh per 24 m cell, not a casting and a
 // non-casting one; view.static's shadowBySize would split every cell in
 // two over the twigs), merged here with the view's own baked material.
 const group = new THREE.Group(), into = Object.create(view);
 view.material(TRUNK); // (the view's colour registry exists before the proxy reads it)
 into.static = group; view.scene.add(group);
 const clumps = { north: [], northEast: [], west: [], village: [] };
 for (const t of data.trees) buildTree(into, t, t.kind !== 'woods' ? clumps.village : t.z > -38 ? clumps.west : t.x < -12 ? clumps.north : clumps.northEast);
 for (const s of data.stumps || []) buildStump(into, s);
 for (const l of data.logs || []) buildLog(into, l);
 for (const d of data.drifts || []) buildDrift(into, d);
 for (const t of data.trees) if (t.kind === 'maple') buildCarpet(into, t);
 group.traverse(o => { if (o.isMesh) o.castShadow = true; });
 view.batch(group);
 group.traverse(o => { o.matrixAutoUpdate = false; o.updateMatrix(); });
 group.updateMatrixWorld(true);
 const material = canopyMaterial(), geometry = new THREE.IcosahedronGeometry(1, 0), matrix = new THREE.Matrix4(), colour = new THREE.Color();
 const q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
 const meshes = [];
 for (const list of Object.values(clumps)) {
  if (!list.length) continue;
  const mesh = new THREE.InstancedMesh(geometry, material, list.length);
  list.forEach((c, i) => {
   matrix.compose(p.set(c.x, c.y, c.z), q.setFromEuler(e.set(c.tilt, c.yaw, 0)), sc.set(c.size, c.size * c.flat, c.size));
   mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, colour.set(c.colour).multiplyScalar(c.shade));
  });
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.computeBoundingSphere(); mesh.computeBoundingBox?.();
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  mesh.userData.treeCanopy = true;
  mesh.onBeforeRender = () => updateFade(view, material.userData.fade);
  view.scene.add(mesh); meshes.push(mesh);
 }
 view.treeCanopies = meshes;
 return meshes;
}
