import * as THREE from 'three';
import { makeRifle } from './rifle-model.js';
import { makeShotgun } from './shotgun-model.js';
import { makeGrenade } from './grenade-model.js';

// The weapon pictures the menus ship (tools/capture-weapons.mjs renders these
// into src/assets/weapons/*.webp). Photo-only: the guns you hold in the game
// are unchanged. All three share one studio (the same warm key and cool fill,
// camera angle, framing and tone), are flat shaded and low poly like the rest
// of the game (prisms, not smooth cylinders; no gloss), and each gets extra
// photo detail and its signature beside it: the Static with a charged orb, the
// Nominal with its grenade, the Ballast broken open with its shells coming out.
// Not imported by the game (nothing here ends up in the bundle).

const SIZE = { width: 600, height: 720 };
const flat = new Map();
const mat = (color, glow = false) => {
 const key = color + glow;
 if (!flat.has(key)) flat.set(key, glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color, flatShading: true }));
 return flat.get(key);
};
const add = (parent, geometry, color, x = 0, y = 0, z = 0, glow = false) => { const m = new THREE.Mesh(geometry, mat(color, glow)); m.position.set(x, y, z); parent.add(m); return m; };
const box = (parent, x, y, z, w, h, d, color, glow) => add(parent, new THREE.BoxGeometry(w, h, d), color, x, y, z, glow);
// A low-poly tube along z (octagonal unless told otherwise).
const prism = (parent, z, radius, length, color, sides = 8, x = 0, y = 0, glow) => { const m = add(parent, new THREE.CylinderGeometry(radius, radius, length, sides), color, x, y, z, glow); m.rotation.x = Math.PI / 2; m.rotation.y = Math.PI / sides; return m; };
const ring = (parent, z, radius, tube, color, sides = 8) => { const m = add(parent, new THREE.TorusGeometry(radius, tube, 4, sides), color, 0, 0, z); m.rotation.z = Math.PI / sides; return m; };
// A bolt head: a little hexagon facing out along an axis.
const bolt = (parent, x, y, z, r, color, axis = 'x') => { const m = add(parent, new THREE.CylinderGeometry(r, r, r * .8, 6), color, x, y, z); if (axis === 'x') m.rotation.z = Math.PI / 2; if (axis === 'z') m.rotation.x = Math.PI / 2; return m; };

// The Static: the same blocky pale-blue body and yellow collar, rebuilt in
// facets, with coil windings, cells on top, hazard striping, vents and bolts.
function staticGun() {
 const gun = new THREE.Group();
 box(gun, 0, 0, .025, .22, .19, .35, '#9bd9ee');
 box(gun, 0, .11, .04, .15, .045, .25, '#c1edfa');
 box(gun, 0, .139, .04, .065, .012, .18, '#568697');
 // Charge cells on the spine: squat hex canisters with lit caps.
 for (let i = 0; i < 4; i++) {
  const z = -.035 + i * .045;
  add(gun, new THREE.CylinderGeometry(.017, .017, .034, 6), '#3e6a7a', 0, .162, z);
  add(gun, new THREE.CylinderGeometry(.011, .011, .006, 6), '#a7eaff', 0, .182, z, true);
 }
 box(gun, 0, .018, .211, .17, .13, .022, '#6b9bac');
 box(gun, 0, .02, .226, .12, .072, .012, '#354e59');
 box(gun, 0, .02, .233, .06, .018, .004, '#a7eaff', true);
 const grip = box(gun, 0, -.14, .13, .11, .24, .14, '#354e59'); grip.rotation.x = -.15;
 for (let i = 0; i < 5; i++) box(gun, 0, -.07 - i * .037, .208, .115, .009, .012, '#597280');
 box(gun, 0, -.105, -.01, .1, .025, .13, '#354e59');
 box(gun, 0, -.18, -.018, .028, .018, .14, '#568697');
 box(gun, 0, -.145, -.08, .028, .08, .018, '#568697');
 const trigger = box(gun, 0, -.133, -.016, .018, .048, .021, '#8dbdcb'); trigger.rotation.x = -.35;
 // The barrel: an octagonal neck wound with copper coil, the yellow collar,
 // then a three-prong emitter.
 prism(gun, -.19, .068, .2, '#568697');
 for (let i = 0; i < 6; i++) ring(gun, -.125 - i * .016, .07, .006, '#b87333');
 prism(gun, -.267, .112, .115, '#f1ce54');
 for (let i = 0; i < 8; i++) {
  const a = i * Math.PI / 4 + Math.PI / 8, stripe = box(gun, Math.cos(a) * .113, Math.sin(a) * .113, -.267, .03, .006, .1, i % 2 ? '#f1ce54' : '#232a2c');
  stripe.rotation.z = a + Math.PI / 2;
 }
 for (const z of [-.22, -.29]) ring(gun, z, .115, .01, '#d2a53d');
 prism(gun, -.327, .056, .009, '#182f39');
 prism(gun, -.333, .041, .005, '#a7eaff', 8, 0, 0, true);
 for (let i = 0; i < 3; i++) {
  const a = i * Math.PI * 2 / 3 + Math.PI / 2, prong = box(gun, Math.cos(a) * .082, Math.sin(a) * .082, -.35, .018, .018, .05, '#3a5360');
  prong.rotation.z = a;
  box(gun, Math.cos(a) * .07, Math.sin(a) * .07, -.377, .01, .01, .01, '#a7eaff', true);
 }
 for (const side of [-1, 1]) {
  box(gun, side * .119, .012, .03, .025, .08, .22, '#4d8499');
  box(gun, side * .137, .015, .03, .016, .027, .18, '#bff6ff', true);
  for (let i = 0; i < 4; i++) box(gun, side * .149, .015, -.044 + i * .047, .009, .06, .008, '#486878');
  // Vent slots low on the body, bolts at the corners.
  for (let i = 0; i < 4; i++) box(gun, side * .111, -.06, -.1 + i * .03, .004, .03, .012, '#2d4652');
  for (const z of [-.12, .16]) for (const y of [-.07, .07]) bolt(gun, side * .112, y, z, .01, '#d8e5e6');
  // A cable from the grip into the collar.
  const pts = [[side * .08, -.1, .1], [side * .125, -.08, .02], [side * .13, -.06, -.09], [side * .12, -.04, -.2]];
  for (let i = 1; i < pts.length; i++) {
   const a = new THREE.Vector3(...pts[i - 1]), b = new THREE.Vector3(...pts[i]), d = b.clone().sub(a);
   const seg = add(gun, new THREE.CylinderGeometry(.009, .009, d.length(), 5), '#243238');
   seg.position.copy(a).add(b).multiplyScalar(.5); seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }
 }
 // Arcs of static round the silhouette: short straight segments.
 const arc = (points, r = .0022) => {
  for (let i = 1; i < points.length; i++) {
   const a = new THREE.Vector3(...points[i - 1]), b = new THREE.Vector3(...points[i]), d = b.clone().sub(a);
   const seg = add(gun, new THREE.CylinderGeometry(r, r, d.length(), 4), '#bff3ff', 0, 0, 0, true);
   seg.position.copy(a).add(b).multiplyScalar(.5); seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }
 };
 arc([[.151, .015, .13], [.169, .048, .095], [.155, .065, .078], [.17, .1, .042], [.137, .13, .016], [.116, .151, -.019], [.067, .161, -.05], [.041, .143, -.081], [-.012, .144, -.105]]);
 arc([[.15, .015, -.05], [.169, -.007, -.09], [.143, -.028, -.118], [.158, -.015, -.155], [.107, .028, -.186], [.09, .063, -.222], [.059, .095, -.246]]);
 arc([[.064, .105, -.224], [.105, .124, -.249], [.126, .082, -.271], [.144, .055, -.302], [.122, .013, -.34], [.135, -.024, -.353], [.104, -.068, -.345], [.062, -.108, -.331]]);
 arc([[.154, -.015, .08], [.19, -.05, .052], [.173, -.074, .023], [.188, -.091, -.018], [.145, -.107, -.057], [.123, -.083, -.098]], .0018);
 gun.rotation.z = -.16;
 // Its signature: a charged orb hanging off the muzzle, a faceted core in a
 // cage of bars.
 const orb = new THREE.Group(); orb.position.set(.12, -.1, -.44);
 add(orb, new THREE.IcosahedronGeometry(.045, 0), '#dff9ff', 0, 0, 0, true);
 const shell = add(orb, new THREE.IcosahedronGeometry(.07, 0), '#6fcfe8'); shell.material = new THREE.MeshLambertMaterial({ color: '#6fcfe8', flatShading: true, transparent: true, opacity: .7 });
 for (let i = 0; i < 3; i++) { const bar = add(orb, new THREE.TorusGeometry(.078, .004, 3, 6), '#a7eaff', 0, 0, 0, true); bar.rotation.set(i * 1.05, i * .7, 0); }
 const scene = new THREE.Group(); scene.add(gun, orb);
 return { scene, gun };
}

// The Nominal: the game's rifle plus a wooden furniture grain, rivets, a
// hooded front sight, a slotted muzzle brake and a sling swivel; its grenade.
function rifleGun() {
 const gun = makeRifle(3), extra = new THREE.Group(); gun.add(extra);
 for (const side of [-1, 1]) {
  for (let i = 0; i < 3; i++) box(extra, side * .066, -.03 + i * .03, .26, .002, .006, .17, '#5e4632');
  for (let i = 0; i < 3; i++) box(extra, side * .061, -.03 + i * .027, -.24, .002, .006, .19, '#5e4632');
  for (const z of [-.17, -.31, .19, .31]) bolt(extra, side * .066, .035, z, .007, '#c9b27a');
  for (let i = 0; i < 3; i++) box(extra, side * .034, 0, -.485 + i * .012, .004, .04, .005, '#162522');
 }
 box(extra, 0, .12, -.41, .044, .008, .04, '#242e2d');
 box(extra, 0, -.075, .34, .012, .03, .012, '#979d91');
 box(extra, 0, -.075, -.3, .012, .03, .012, '#979d91');
 box(extra, 0, .076, .08, .03, .03, .02, '#162522');
 // Tucked behind the gun (away from the camera), smaller: a supporting detail.
 const grenade = makeGrenade(2); grenade.position.set(-.02, -.34, .2); grenade.rotation.set(.1, 0, .25); grenade.scale.setScalar(.74);
 const scene = new THREE.Group(); gun.rotation.z = -.16; scene.add(gun, grenade);
 return { scene, gun };
}

// The Ballast: broken open, with grain on the stock, a brass plate engraved on
// the receiver, a vented rib between the barrels and its two shells sliding out.
function shotgunGun() {
 const gun = makeShotgun(3), b = gun.userData.barrels;
 // Octagonal barrels over the round ones (the round ones' silhouette).
 for (const side of [-1, 1]) {
  prism(b, -.25, .075, .56, '#3f4a48', 8, side * .072, .02).position.sub(new THREE.Vector3(0, -.065, -.10));
  prism(b, -.535, .079, .03, '#262d2c', 8, side * .072, .02).position.sub(new THREE.Vector3(0, -.065, -.10));
  prism(b, -.54, .05, .01, '#090f10', 8, side * .072, .02).position.sub(new THREE.Vector3(0, -.065, -.10));
 }
 // Brass bands binding the barrels together, near the muzzle and mid way.
 const hinge = new THREE.Vector3(0, -.065, -.10);
 for (const z of [-.46, -.2]) for (const side of [-1, 1]) prism(b, z, .08, .03, '#b8955a', 8, side * .072, .02).position.sub(hinge);
 for (const z of [-.46, -.2]) box(b, 0, .02, z, .06, .12, .03, '#b8955a').position.sub(hinge);
 for (let i = 0; i < 7; i++) box(b, 0, .115 + .065, -.03 - i * .07 + .1, .03, .012, .02, '#4c5451');
 for (const side of [-1, 1]) {
  for (let i = 0; i < 4; i++) box(gun, side * .091, -.1 + i * .035, .31, .002, .006, .24, '#5a3c2f');
  box(gun, side * .121, .005, .06, .003, .07, .1, '#c4a368');
  for (let i = 0; i < 3; i++) box(gun, side * .123, -.015 + i * .018, .06, .002, .004, .07, '#8a6f45');
  for (const z of [.02, .1]) bolt(gun, side * .122, .045, z, .007, '#ded0a6');
 }
 gun.userData.barrels.rotation.x = -.98; gun.rotation.set(.12, 0, -.16);
 for (const shell of gun.userData.shells) shell.position.z += .085;
 const scene = new THREE.Group(); scene.add(gun);
 return { scene, gun };
}

const BUILD = { static: staticGun, rifle: rifleGun, shotgun: shotgunGun };

// One studio for all three: the same lights, tone, camera direction, and
// framing fitted to each weapon's bounds (it fills the card and bleeds a
// little off its sides, like the old pictures).
export function weaponPhoto(id) {
 const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
 renderer.setSize(SIZE.width, SIZE.height); renderer.setPixelRatio(1);
 renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
 renderer.setClearColor(0x000000, 0);
 const scene = new THREE.Scene();
 scene.add(new THREE.HemisphereLight('#f2e6d0', '#2e2a26', 2.1));
 const key = new THREE.DirectionalLight('#fff0d8', 2.6); key.position.set(2, 4, 2.4); scene.add(key);
 const fill = new THREE.DirectionalLight('#9bd4ff', .7); fill.position.set(-3, 1, -2); scene.add(fill);
 const { scene: subject, gun } = BUILD[id](); scene.add(subject);
 // Framed on the gun alone (not its extras): its projected width fills the
 // card and a little over, the same for every weapon.
 const bounds = new THREE.Box3().setFromObject(gun), centre = bounds.getCenter(new THREE.Vector3()), radius = bounds.getSize(new THREE.Vector3()).length() / 2;
 const camera = new THREE.PerspectiveCamera(30, SIZE.width / SIZE.height, .01, 20);
 camera.position.copy(centre).add(new THREE.Vector3(1, .66, -1.12).normalize().multiplyScalar(radius * 3.1)); camera.lookAt(centre);
 camera.updateMatrixWorld(); camera.updateProjectionMatrix();
 let ex = 0, ey = 0;
 for (let i = 0; i < 8; i++) {
  const p = new THREE.Vector3(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z).project(camera);
  ex = Math.max(ex, Math.abs(p.x)); ey = Math.max(ey, Math.abs(p.y));
 }
 camera.zoom = Math.min(1.3 / ex, 1.15 / ey); camera.updateProjectionMatrix();
 renderer.render(scene, camera);
 const url = renderer.domElement.toDataURL('image/png');
 scene.traverse(o => o.geometry?.dispose()); flat.forEach(m => m.dispose()); flat.clear(); renderer.dispose(); renderer.forceContextLoss();
 return url;
}
