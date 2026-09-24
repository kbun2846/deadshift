// Gore on bodies: wounds, exposed bone and flesh, charring, severed parts.
// Kept low-poly and flat-shaded like the rest of the world: a few solid shapes
// in blood reds, bone and char, never textures of anatomy.
//
// `addGore(body, event, reaction, detail)` dresses a corpse (death-corpse.js):
// `body` is the corpse's pose group, in world axes centred on where the body
// stands (y up). After the fall, the side of the body that faced the killing
// hit (-direction) is the side facing up, so the wounds go there, where the
// camera sees them.
//   gunshot / ballast  a blood-soaked chest, entry wounds, torn flesh flecks
//   impact             a soaked patch and a torn one
//   electric (charred) cracked char over the whole body with ember-lit cracks,
//                      the ribs showing through a burst chest, the skull
//                      through the face, a forearm bone and burnt flesh
//   fire (skeleton)    see `skeletonRemains`: charred flesh left on the bones
// `GoreBurst` throws severed limbs and flesh with an explosion's bones.
// `detail`: 0 potato, 1 performance, 2 balanced, 3 quality and extreme.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const GORE_DETAIL = Object.freeze({ potato: 0, performance: 1, balanced: 2, quality: 3, extreme: 3 });

let shared = null;
function materials() {
 if (shared) return shared;
 const lambert = color => new THREE.MeshLambertMaterial({ color, flatShading: true });
 shared = {
  blood: lambert('#8c1c2a'), soaked: lambert('#5a1019'), wet: new THREE.MeshBasicMaterial({ color: '#b3283a' }),
  hole: new THREE.MeshBasicMaterial({ color: '#1c070b' }), flesh: lambert('#b4505e'), gristle: lambert('#d98a8e'),
  bone: lambert('#e2d6b8'), char: lambert('#1f1a17'), charRed: lambert('#4e1a17'), ash: lambert('#57463b'), seared: lambert('#7a2d24'),
  ember: new THREE.MeshBasicMaterial({ color: '#ff7a2a', toneMapped: false }),
 };
 return shared;
}

let geometryCache = null;
function geometries() {
 if (geometryCache) return geometryCache;
 const rib = new THREE.TorusGeometry(.12, .014, 3, 9, Math.PI * .95);
 geometryCache = {
  disc: new THREE.CircleGeometry(1, 9), chunk: new THREE.IcosahedronGeometry(1, 0), box: new THREE.BoxGeometry(1, 1, 1),
  bone: new THREE.CylinderGeometry(.022, .026, 1, 5), knob: new THREE.IcosahedronGeometry(.035, 0), rib,
  skull: new THREE.IcosahedronGeometry(.13, 1), cap: new THREE.CylinderGeometry(1, 1, .03, 7),
 };
 return geometryCache;
}

// Cracked char with glowing seams: a canvas drawn once. The seams are the
// emissive map, so they glow orange just after death and cool to a dull red.
let charMaps = null;
export function charTextures() {
 if (charMaps) return charMaps;
 if (typeof document === 'undefined') return (charMaps = { map: null, emissiveMap: null }); // tests, no canvas
 const size = 256, color = document.createElement('canvas'), glow = document.createElement('canvas');
 color.width = color.height = glow.width = glow.height = size;
 const c = color.getContext('2d'), g = glow.getContext('2d');
 let s = 91; const random = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
 c.fillStyle = '#231d19'; c.fillRect(0, 0, size, size);
 g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
 // Blistered patches: ash-grey, black and the raw red under split skin.
 for (let i = 0; i < 90; i++) {
  const x = random() * size, y = random() * size, r = 4 + random() * 16;
  c.fillStyle = ['#2e2621', '#15110f', '#3a2f28', '#5b1d1a', '#6e2a22'][Math.floor(random() * 5)]; c.globalAlpha = .55 + random() * .4;
  c.beginPath(); c.ellipse(x, y, r, r * (.5 + random() * .6), random() * 3, 0, Math.PI * 2); c.fill();
 }
 c.globalAlpha = 1;
 // Cracks: jagged lines, dark in the colour map, bright in the glow map.
 for (let i = 0; i < 26; i++) {
  let x = random() * size, y = random() * size, a = random() * Math.PI * 2;
  const path = [[x, y]];
  for (let j = 0; j < 6 + random() * 8; j++) { a += (random() - .5) * 1.4; x += Math.cos(a) * 9; y += Math.sin(a) * 9; path.push([x, y]); }
  for (const [ctx, style, width] of [[c, '#0b0807', 3], [g, '#ff8a3a', 1.6]]) {
   ctx.strokeStyle = style; ctx.lineWidth = width * (.6 + random() * .6); ctx.beginPath();
   path.forEach(([px, py], k) => k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.stroke();
  }
 }
 const map = new THREE.CanvasTexture(color), emissiveMap = new THREE.CanvasTexture(glow);
 map.colorSpace = emissiveMap.colorSpace = THREE.SRGBColorSpace;
 for (const t of [map, emissiveMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.6, 1.6); }
 charMaps = { map, emissiveMap };
 return charMaps;
}

// A charred-body material with the cracked texture (death-corpse.js owns it).
export function charMaterial(transparent) {
 const { map, emissiveMap } = charTextures();
 return new THREE.MeshLambertMaterial({ color: map ? '#ffffff' : '#272522', map, emissiveMap, emissive: emissiveMap ? '#ff6a24' : '#000000', emissiveIntensity: 1.2, flatShading: true, transparent });
}

// Seeded per death, so a body keeps its wounds (re-created for a replay).
function seeded(seed) { let s = (Math.abs(Math.floor(seed * 1e4)) % 2147483646) + 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

// Every gore piece under `group` merged into at most two meshes (one per kind
// of material: lit, and unlit for holes, wet shine and embers), each piece's
// colour kept per vertex. A dressed corpse was 30 to 60 separate draws; now it
// is two. Source geometries are shared and left alone. `lit` / `unlit`: the
// vertex-coloured materials to use (shared, or the corpse's own when it fades).
const VC = { lit: null, unlit: null };
export function goreMaterials() {
 VC.lit ||= new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, flatShading: true });
 VC.unlit ||= new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true });
 return VC;
}
export function compact(group, lit = goreMaterials().lit, unlit = goreMaterials().unlit) {
 group.updateMatrixWorld(true);
 const inverse = group.matrixWorld.clone().invert(), buckets = { lit: [], unlit: [] }, gone = [];
 group.traverse(o => {
  if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material.map) return;
  const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld));
  // Already merged (vertex colours): keep those, times the material colour.
  const had = o.material.vertexColors && g.attributes.color?.itemSize === 3 ? g.attributes.color.array : null;
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = o.material.color, n = g.attributes.position.count, colours = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { colours[i * 3] = c.r * (had ? had[i * 3] : 1); colours[i * 3 + 1] = c.g * (had ? had[i * 3 + 1] : 1); colours[i * 3 + 2] = c.b * (had ? had[i * 3 + 2] : 1); }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  buckets[o.material.isMeshBasicMaterial ? 'unlit' : 'lit'].push(g); gone.push(o);
 });
 for (const o of gone) o.removeFromParent();
 // Groups left empty (a limb's parts) go too.
 const out = [];
 for (const [kind, geometries] of Object.entries(buckets)) {
  if (!geometries.length) continue;
  const mesh = new THREE.Mesh(mergeGeometries(geometries), kind === 'lit' ? lit : unlit);
  geometries.forEach(g => g.dispose()); mesh.userData.goreMerged = true; group.add(mesh); out.push(mesh);
 }
 return out;
}

// Frees the geometry `compact` made under `root` (the sources are shared).
export function disposeMerged(root) { root?.traverse(o => { if (o.userData.goreMerged) o.geometry.dispose(); }); }

export function addGore(body, event, reaction, detail = 2) {
 const m = materials(), geo = geometries(), group = new THREE.Group(); body.add(group);
 const random = seeded((event.x || 0) * 13.1 + (event.z || 0) * 7.7 + 3);
 let dx = event.directionX || 0, dz = event.directionZ || 0;
 if (Math.hypot(dx, dz) < .001) { dx = -(event.aimX || 0); dz = -(event.aimZ || 0); }
 if (Math.hypot(dx, dz) < .001) dz = 1;
 const l = Math.hypot(dx, dz), ux = -dx / l, uz = -dz / l; // toward the camera once fallen
 const sx = -uz, sz = ux; // across the body
 const place = (mesh, across, y, out, radius = .29) => {
  mesh.position.set(ux * (radius + out) + sx * across, y, uz * (radius + out) + sz * across);
  mesh.lookAt(mesh.position.x + ux, y, mesh.position.z + uz); group.add(mesh); return mesh;
 };
 const disc = (material, across, y, r, stretch = 1, out = .004) => { const d = new THREE.Mesh(geo.disc, material); d.scale.set(r, r * stretch, 1); return place(d, across, y, out); };
 const chunk = (material, across, y, r, out = .02, radius) => { const c = new THREE.Mesh(geo.chunk, material); c.scale.set(r, r * (.6 + random() * .6), r); c.rotation.set(random() * 3, random() * 3, 0); return place(c, across, y, out, radius); };
 const type = event.damageType;

 if (reaction.charred && reaction.mode !== 'skeleton') {
  // The chest burst open: a dark cavity, the ribs over it, flesh at the edges.
  disc(m.charRed, 0, .6, .15, 1.15, .006);
  disc(m.hole, 0, .6, .1, 1.1, .008);
  for (let i = 0; i < 4; i++) {
   const rib = new THREE.Mesh(geo.rib, m.bone); rib.scale.setScalar(.95 - Math.abs(i - 1.5) * .08);
   place(rib, 0, .5 + i * .07, .012); rib.rotateZ(Math.PI * .03);
  }
  const sternum = new THREE.Mesh(geo.box, m.bone); sternum.scale.set(.03, .26, .02); place(sternum, 0, .6, .016);
  for (let i = 0; i < 3 + detail * 2; i++) chunk(i % 3 ? m.charRed : m.flesh, (random() - .5) * .3, .45 + random() * .32, .018 + random() * .02, .01);
  // Burnt through the face: the skull shows, the eye sockets dark.
  const skull = new THREE.Mesh(geo.skull, m.bone); skull.scale.set(.75, .8, .55); place(skull, 0, .96, -.1, .2);
  for (const side of [-1, 1]) { const socket = new THREE.Mesh(geo.disc, m.hole); socket.scale.setScalar(.024); place(socket, side * .038, .975, -.03, .2); }
  const jaw = new THREE.Mesh(geo.box, m.bone); jaw.scale.set(.1, .03, .04); place(jaw, 0, .885, -.05, .2);
  // A forearm burnt to the bone, and ember-lit flesh along the cracks.
  const arm = new THREE.Mesh(geo.bone, m.bone); arm.scale.set(1, .2, 1); arm.rotation.z = Math.PI / 2; place(arm, .34, .7, -.12);
  const knob = new THREE.Mesh(geo.knob, m.bone); place(knob, .44, .7, -.12);
  if (detail >= 2) for (let i = 0; i < detail * 2; i++) { const e = chunk(m.ember, (random() - .5) * .45, .3 + random() * .5, .01 + random() * .008, .004); e.userData.ember = true; }
 } else if (reaction.mode !== 'skeleton') {
  const gun = type === 'gunshot' || type === 'ballast';
  // A soaked patch across the chest, darker at its heart.
  disc(m.soaked, (random() - .5) * .08, .58 + random() * .06, .21 + random() * .04, 1.3);
  disc(m.blood, (random() - .5) * .06, .6, .14 + random() * .03, 1.1, .006);
  const holes = gun ? (type === 'ballast' ? 5 : 2) + (detail >= 2 ? 1 : 0) : 1;
  for (let i = 0; i < holes; i++) {
   const across = (random() - .5) * .28, y = .48 + random() * .28, r = gun ? .03 + random() * .014 : .045;
   disc(m.wet, across, y, r * 1.7, 1, .008); disc(m.hole, across, y, r, 1, .01);
   // Torn flesh at the edge of the wound.
   for (let k = 0; k < 1 + detail; k++) chunk(k % 2 ? m.flesh : m.blood, across + (random() - .5) * .07, y + (random() - .5) * .07, .012 + random() * .01, .012);
  }
  // Runs of blood down the coat from the wounds.
  if (detail >= 1) for (let i = 0; i < 2 + detail; i++) {
   const run = new THREE.Mesh(geo.box, m.blood); run.scale.set(.018 + random() * .01, .12 + random() * .18, .006);
   place(run, (random() - .5) * .22, .4 + random() * .1, .007);
  }
 }
 compact(group);
 return group;
}

// Fire: what the flames left on the bones (added to the skeleton group before
// death-corpse.js makes it fade in). Local skeleton space (y up).
export function skeletonRemains(skeleton, detail = 2) {
 // Each piece gets its own material copy: the corpse fades these in (opacity),
 // and must not fade the shared ones. Returned so the corpse can free them.
 const m = materials(), geo = geometries(), random = seeded(detail + 5), pieces = new THREE.Group(); skeleton.add(pieces);
 const own = material => material;
 const lump = (material, x, y, z, r) => { const c = new THREE.Mesh(geo.chunk, own(material)); pieces.add(c); c.scale.set(r, r * .7, r); c.position.set(x, y, z); c.rotation.set(random() * 3, random() * 3, 0); return c; };
 // Charred flesh still on the thighs, the hips and along the spine.
 for (const side of [-1, 1]) { lump(m.ash, side * .13, .28, .03, .09); lump(m.seared, side * .14, .18, .05, .06); lump(m.ash, side * .3, .66, .03, .055); lump(m.flesh, side * .32, .5, .04, .035); }
 lump(m.ash, 0, .45, .06, .11); lump(m.seared, 0, .6, .07, .08); lump(m.ash, .05, .95, .06, .06);
 // Raw red where it split, and a few embers.
 for (let i = 0; i < 4 + detail * 3; i++) lump(i % 3 ? m.charRed : m.flesh, (random() - .5) * .45, .15 + random() * .8, (random() - .5) * .12, .015 + random() * .025);
 // A fuller ribcage than the four hoops of the bank.
 for (let i = 0; i < 3; i++) { const rib = new THREE.Mesh(geo.rib, own(m.bone)); rib.position.set(0, .7 + i * .045, 0); rib.rotation.x = Math.PI / 2; rib.scale.setScalar(.9 - i * .1); pieces.add(rib); }
 // Merged into one draw on this corpse's own material (it fades in).
 const made = [new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, flatShading: true }), new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true })];
 compact(pieces, made[0], made[1]);
 return made;
}

// An explosion: severed limbs, a torn torso piece and flesh, thrown with the
// body's bones (death-view.js). `colours`: { coat, arm, legs, skin }.
export class GoreBurst {
 constructor(view, event, colours, detail = 2) {
  const m = materials(), geo = geometries();
  this.event = event; this.group = new THREE.Group(); view.scene.add(this.group); this.own = [];
  const mat = color => { const x = new THREE.MeshLambertMaterial({ color, flatShading: true }); this.own.push(x); return x; };
  const coat = mat(colours.coat), arm = mat(colours.arm), legs = mat(colours.legs), skin = mat(colours.skin || '#d6b58a');
  let dx = event.directionX || 0, dz = event.directionZ || 0; const directed = Math.hypot(dx, dz) > .001;
  if (directed) { const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
  const random = Math.random;
  this.pieces = [];
  // A limb: the cloth, a ragged red end and the bone sticking out of it.
  const limb = (cloth, length, width, handOrBoot) => {
   const g = new THREE.Group();
   const sleeve = new THREE.Mesh(geo.box, cloth); sleeve.scale.set(width, width, length); g.add(sleeve);
   const end = new THREE.Mesh(geo.cap, m.blood); end.scale.set(width * .55, 1, width * .55); end.rotation.x = Math.PI / 2; end.position.z = length / 2 + .005; g.add(end);
   const meat = new THREE.Mesh(geo.chunk, m.flesh); meat.scale.set(width * .4, width * .35, .03); meat.position.z = length / 2 + .02; g.add(meat);
   const bone = new THREE.Mesh(geo.bone, m.bone); bone.scale.set(1, .09, 1); bone.rotation.x = Math.PI / 2; bone.position.z = length / 2 + .05; g.add(bone);
   if (handOrBoot) { const tip = new THREE.Mesh(geo.box, handOrBoot); tip.scale.set(width * .9, width * .8, .1); tip.position.z = -length / 2 - .04; g.add(tip); }
   return g;
  };
  const kinds = [limb(legs, .26, .17, mat('#2b2622')), limb(legs, .22, .17), limb(arm, .3, .15, skin)];
  if (detail >= 2) kinds.push(limb(arm, .18, .15));
  // A piece of the torso: coat outside, ribs and flesh on the torn side.
  const torso = new THREE.Group();
  const cloth = new THREE.Mesh(geo.box, coat); cloth.scale.set(.3, .08, .26); torso.add(cloth);
  const wound = new THREE.Mesh(geo.box, m.blood); wound.scale.set(.26, .02, .22); wound.position.y = .045; torso.add(wound);
  for (let i = 0; i < 3; i++) { const rib = new THREE.Mesh(geo.rib, m.bone); rib.scale.setScalar(.8); rib.rotation.x = -Math.PI / 2; rib.position.set(0, .06, (i - 1) * .06); torso.add(rib); }
  kinds.push(torso);
  // Each piece one draw (its parts' colours per vertex); the colour materials
  // were only needed to carry those colours.
  for (const model of kinds) compact(model);
  this.own.forEach(x => x.dispose()); this.own = [];
  for (const [i, model] of kinds.entries()) {
   this.group.add(model);
   const a = random() * Math.PI * 2, speed = .6 + random() * .9, push = directed ? 1.6 + random() * 1.8 : 0;
   this.pieces.push({ model, vx: Math.cos(a) * speed + dx * push, vz: Math.sin(a) * speed + dz * push, vy: 1.3 + random() * 1.5, y: .4 + random() * .5,
    floor: i === kinds.length - 1 ? .05 : .08, spin: (random() - .5) * 12, angle: random() * Math.PI * 2 });
  }
  // Flesh and blood chunks, more with more detail.
  const count = [8, 14, 26, 40][detail] ?? 26;
  this.chunks = new THREE.InstancedMesh(geo.chunk, m.flesh, count); this.darkChunks = new THREE.InstancedMesh(geo.chunk, m.soaked, count);
  for (const mesh of [this.chunks, this.darkChunks]) { mesh.frustumCulled = false; mesh.count = count; this.group.add(mesh); }
  this.bits = Array.from({ length: count * 2 }, () => {
   const a = random() * Math.PI * 2, speed = .5 + random() * 1.4, push = directed ? 1 + random() * 2.4 : 0;
   return { vx: Math.cos(a) * speed + dx * push, vz: Math.sin(a) * speed + dz * push, vy: .8 + random() * 1.8, y: .4 + random() * .6, size: .018 + random() * .03, spin: random() * 6 };
  });
  this.dummy = new THREE.Object3D(); this.update(0);
 }
 update(t) {
  // Everything has landed: the pieces become one draw (the chunks stay instanced).
  if (t > 2.4) { if (!this.settled) { this.settled = true; this.finish(t); compact(this.group); } return; }
  this.finish(t);
 }
 finish(t) {
  const e = this.event, d = this.dummy;
  for (const p of this.pieces) {
   const flight = (p.vy + Math.sqrt(p.vy * p.vy + 19.6 * (p.y - p.floor))) / 9.8, age = Math.min(t, flight), landed = t >= flight;
   p.model.position.set(e.x + p.vx * age, Math.max(p.floor, p.y + p.vy * age - 4.9 * age * age), e.z + p.vz * age);
   const flat = Math.min(1, age / flight);
   p.model.rotation.set(landed ? 0 : age * p.spin * (1 - flat), p.angle + age * p.spin * .3 * (1 - flat), landed ? 0 : age * p.spin * .4 * (1 - flat));
  }
  this.bits.forEach((b, i) => {
   const flight = (b.vy + Math.sqrt(b.vy * b.vy + 19.6 * (b.y - .02))) / 9.8, age = Math.min(t, flight), landed = t >= flight;
   d.position.set(e.x + b.vx * age, Math.max(.02, b.y + b.vy * age - 4.9 * age * age), e.z + b.vz * age);
   d.rotation.set(landed ? 0 : age * b.spin, i, 0);
   d.scale.set(b.size * (landed ? 1.5 : 1), b.size * (landed ? .45 : 1), b.size * (landed ? 1.3 : 1)); d.updateMatrix();
   (i % 2 ? this.darkChunks : this.chunks).setMatrixAt(i >> 1, d.matrix);
  });
  this.chunks.instanceMatrix.needsUpdate = this.darkChunks.instanceMatrix.needsUpdate = true;
 }
 dispose() { disposeMerged(this.group); this.group.removeFromParent(); this.chunks.dispose(); this.darkChunks.dispose(); this.own.forEach(x => x.dispose()); }
}

// The weapon left on the ground: its own materials, darkened (dust and blood
// on it, and no longer in anyone's hand). Returns a function to free them.
export function darkenWeapon(root, amount = .6) {
 const made = new Map();
 root.traverse(o => {
  if (!o.isMesh) return;
  const swap = material => {
   if (!made.has(material)) {
    const dark = material.clone();
    dark.color?.multiplyScalar(amount); if (dark.emissive) dark.emissiveIntensity *= amount;
    made.set(material, dark);
   }
   return made.get(material);
  };
  o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
 });
 return () => { for (const m of made.values()) m.dispose(); };
}

// Brains spilled out on the floor: two pink, folded hemispheres with a groove
// between them, a few torn bits and a wet smear under them, so they read as
// brains from the top-down camera. Own materials (the corpse fades them in and
// frees them). Returns { group, materials }.
export function spilledBrains(detail = 2, random = Math.random) {
 const geo = geometries(), made = [], group = new THREE.Group();
 const mat = (color, basic = false) => { const x = basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color, flatShading: true }); made.push(x); return x; };
 const pink = mat('#e39aa6'), fold = mat('#c16c7c'), deep = mat('#8d3a4c'), smear = mat('#7a1420', true);
 const under = new THREE.Mesh(geo.disc, smear); under.rotation.x = -Math.PI / 2; under.scale.set(.2, .14, 1); under.position.y = .004; group.add(under);
 const lobe = new THREE.IcosahedronGeometry(1, 1);
 for (const side of [-1, 1]) {
  const half = new THREE.Mesh(lobe, pink); half.scale.set(.062, .045, .11); half.position.set(side * .066, .045, 0); group.add(half);
  // Folds: ridges running front to back over each hemisphere.
  const ridges = detail >= 2 ? 5 : 3;
  for (let i = 0; i < ridges; i++) {
   const z = (i / (ridges - 1) - .5) * .17;
   for (const off of [-.022, .022]) {
    const r = new THREE.Mesh(geo.chunk, fold); r.scale.set(.018, .014, .03 + random() * .012);
    r.position.set(side * .066 + off, .082 - Math.abs(z) * .25, z); r.rotation.y = (random() - .5) * .8; group.add(r);
   }
  }
 }
 const groove = new THREE.Mesh(geo.box, deep); groove.scale.set(.012, .02, .2); groove.position.set(0, .07, 0); group.add(groove);
 const stem = new THREE.Mesh(geo.chunk, fold); stem.scale.set(.03, .025, .05); stem.position.set(0, .025, .12); group.add(stem);
 // Torn bits flung a little way off.
 for (let i = 0; i < 2 + detail; i++) {
  const bit = new THREE.Mesh(geo.chunk, i % 2 ? pink : fold); const a = random() * Math.PI * 2, d = .16 + random() * .22;
  bit.scale.setScalar(.014 + random() * .016); bit.position.set(Math.cos(a) * d, .012, Math.sin(a) * d); group.add(bit);
 }
 // One draw for the lit parts, one for the smear, on this corpse's own
 // materials (it fades them in); the colour materials and the lobe are done.
 const lit = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, flatShading: true }), unlit = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true });
 compact(group, lit, unlit);
 made.forEach(x => x.dispose()); lobe.dispose();
 return { group, materials: [lit, unlit], geometries: [] };
}
