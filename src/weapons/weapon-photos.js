import { makeSightlineRifle } from './sightline-model.js';
import { makeOmen } from './omen-model.js';
import * as THREE from 'three';
import { makeIchor } from './ichor-model.js';
import { makeRifle } from './rifle-model.js';
import { makeShotgun } from './shotgun-model.js';
import { makeGrenade } from './grenade-model.js';

// The weapon pictures the menus ship (tools/capture-weapons.mjs renders these
// into src/assets/weapons/*.webp). Photo-only: the guns you hold in the game
// are unchanged. All weapons share one studio (the same warm key and cool fill,
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

// The same compact Sidekick in both portraits: broad steel facets, a walnut
// grip and a few readable mechanical details instead of surface noise.
function sidekickPhotoModel() {
 const gun=new THREE.Group(),steel='#53615c',edge='#929b86',dark='#26332f',brass='#b39b61';
 const outline=new THREE.Shape();
 outline.moveTo(-.055,-.047);outline.lineTo(.055,-.047);outline.lineTo(.055,.032);
 outline.lineTo(.037,.059);outline.lineTo(-.037,.059);outline.lineTo(-.055,.032);outline.closePath();
 add(gun,new THREE.ExtrudeGeometry(outline,{depth:.35,bevelEnabled:false}),steel,0,0,-.235);
 // A narrow top rail and rear notch keep the muzzle silhouette clean.
 box(gun,0,.060,-.061,.069,.014,.326,edge);
 box(gun,0,.071,-.238,.024,.022,.033,brass);
 for(const x of [-.034,.034])box(gun,x,.081,.083,.018,.025,.035,dark);
 box(gun,0,-.063,-.046,.094,.035,.30,dark);
 prism(gun,-.265,.037,.07,edge,8,0,-.004);
 prism(gun,-.303,.028,.007,'#111b18',8,0,-.004);
 prism(gun,-.308,.019,.004,'#080e0d',8,0,-.004);
 // Ejection port, slide edge and a compact catch on the side facing the studio.
 box(gun,.056,.018,-.075,.004,.033,.083,dark);
 box(gun,.060,.017,-.065,.004,.017,.047,'#a0926c');
 for(const side of [-1,1]){
  box(gun,side*.056,-.033,-.065,.005,.008,.276,'#768279');
  for(let i=0;i<4;i++)box(gun,side*.057,.005,.022+i*.020,.006,.044,.007,'#35423d');
  bolt(gun,side*.050,-.067,.075,.008,brass);
 }
 box(gun,.057,-.060,.003,.014,.011,.047,edge);
 const grip=new THREE.Group();grip.position.set(0,-.155,.065);grip.rotation.x=-.25;gun.add(grip);
 box(grip,0,0,0,.090,.198,.104,dark);
 for(const side of [-1,1]){
  box(grip,side*.047,.001,0,.009,.161,.082,'#805c3b');
  box(grip,side*.053,.001,-.030,.003,.145,.008,'#a47e51');
  for(let i=0;i<4;i++)box(grip,side*.054,-.048+i*.029,.004,.003,.006,.055,'#533d2a');
  for(const y of [-.067,.068])bolt(grip,side*.056,y,.007,.007,brass);
 }
 box(grip,0,-.107,0,.105,.026,.115,edge);
 // An open guard and simple bent trigger read even at the small card size.
 box(gun,0,-.109,-.122,.056,.077,.016,dark);
 box(gun,0,-.147,-.066,.062,.014,.126,dark);
 const trigger=box(gun,0,-.106,-.038,.021,.055,.015,brass);trigger.rotation.x=-.30;
 // All detail is photo-only; keep the held weapon's familiar proportions.
 return gun;
}

// Sheath (owner, 2026-09-28: "a lot more detail... the sheath halfway on"):
// the white broadsword half drawn, its black lacquered scabbard over the
// point half of the blade, along the card's diagonal like Ichor's katana.
// Photo-only detail on the game's proportions: a bevelled, fullered blade
// with a gold maker's mark on the ricasso; a crossguard with flared
// quillons, langets and a gold-inlaid centre; a diamond-wrapped leather
// grip between steel ferrules; a faceted pommel with a gold collar; the
// scabbard with a riveted steel locket, gold trim and inlay, a banded
// middle with a hanging ring and strap, and a pointed steel chape.
// Tip toward -z, flat face +y (as the game's model), origin at the guard.
const plate = (parent, points, thickness, y, color) => {
 const outline = new THREE.Shape(); points.forEach(([x, z], i) => i ? outline.lineTo(x, z) : outline.moveTo(x, z)); outline.closePath();
 const geo = new THREE.ExtrudeGeometry(outline, { depth: thickness, bevelEnabled: false }); geo.rotateX(Math.PI / 2);
 const m = add(parent, geo, color, 0, y + thickness / 2, 0); return m;
};
function sheathPhotoModel() {
 const gun = new THREE.Group(), GOLD = '#d9a534', DEEP = '#a8741c', STEEL = '#9a9d99', BRIGHT = '#c3c6c1', DARK_STEEL = '#6c6f6c';
 // Blade: the part out of the scabbard (it runs on inside, unseen).
 const top = -.07, mouth = -.56;
 plate(gun, [[-.066, top], [.066, top], [.066, mouth], [-.066, mouth]], .02, 0, '#ebe7dc');
 for (const side of [1, -1]) {
  // Bevelled edges a shade brighter, one catching the key light.
  plate(gun, [[side * .044, top - .05], [side * .066, top - .05], [side * .066, mouth], [side * .044, mouth]], .012, .004, side > 0 ? '#ffffff' : '#f6f4ec');
  plate(gun, [[side * .044, top - .05], [side * .066, top - .05], [side * .066, mouth], [side * .044, mouth]], .012, -.004, '#f1eee5');
 }
 for (const y of [.0105, -.0105]) {
  // The fuller down each face, and the plain ricasso by the guard with a
  // small gold mark.
  box(gun, 0, y, (top - .06 + mouth) / 2, .024, .003, Math.abs(mouth - top + .06), '#bdb6a7');
  box(gun, 0, y * 1.02, top - .03, .118, .003, .05, '#dcd6c8');
  const mark = box(gun, 0, y * 1.15, top - .032, .02, .003, .02, GOLD); mark.rotation.y = Math.PI / 4;
 }
 // Crossguard: a bar with flared, capped quillons, a raised centre block
 // with a gold diamond each face, and short langets down onto the blade.
 box(gun, 0, 0, -.035, .36, .042, .05, '#8f928f');
 for (const side of [1, -1]) {
  const q = box(gun, side * .19, 0, -.04, .05, .062, .07, STEEL); q.rotation.y = side * .18;
  box(gun, side * .218, 0, -.046, .016, .07, .078, BRIGHT);
  box(gun, side * .11, 0, -.035, .01, .05, .056, DARK_STEEL);
 }
 box(gun, 0, 0, -.035, .1, .066, .074, STEEL);
 box(gun, 0, 0, -.035, .12, .05, .06, DARK_STEEL);
 for (const y of [.034, -.034]) { const d = box(gun, 0, y, -.035, .036, .004, .036, GOLD); d.rotation.y = Math.PI / 4; box(gun, 0, y * 1.06, -.035, .014, .004, .014, '#fff0b8'); }
 box(gun, 0, 0, -.085, .032, .05, .06, STEEL);
 // Grip: leather under a diamond wrap, a steel ferrule at each end.
 box(gun, 0, 0, .135, .042, .044, .21, '#2a211c');
 for (let i = 0; i < 7; i++) {
  const z = .045 + i * .028;
  for (const turn of [.62, -.62]) { const b = box(gun, 0, 0, z, .05, .05, .01, '#4f3d2f'); b.rotation.y = turn; }
 }
 prism(gun, .03, .03, .02, STEEL, 8);
 prism(gun, .243, .031, .02, STEEL, 8);
 // Pommel: faceted, a gold collar, a bright peen cap.
 prism(gun, .275, .046, .052, '#9a9c98', 8);
 prism(gun, .275, .049, .012, GOLD, 8);
 prism(gun, .305, .026, .016, BRIGHT, 8);
 // The scabbard: black lacquer, tapering to a steel chape at the point.
 const throat = -.52, end = -1.13;
 plate(gun, [[-.088, throat], [.088, throat], [.077, end + .11], [-.077, end + .11]], .046, 0, '#141417');
 box(gun, 0, .024, -.8, .018, .004, .38, '#2a2a30');
 // Gold trim lines along both edges, and two small gold diamonds inlaid.
 for (const y of [.0235, -.0235]) {
  for (const side of [1, -1]) { const t = box(gun, side * .066, y, -.81, .006, .003, .38, DEEP); t.rotation.y = side * -.02; }
  for (const z of [-.7, -.93]) { const d = box(gun, 0, y * 1.05, z, .03, .003, .03, GOLD); d.rotation.y = Math.PI / 4; }
 }
 // Locket: a steel band at the mouth, gold edged, riveted.
 box(gun, 0, 0, throat - .045, .2, .058, .09, '#8a8d8a');
 box(gun, 0, 0, throat - .004, .206, .062, .01, GOLD);
 box(gun, 0, 0, throat - .086, .204, .06, .008, GOLD);
 for (const x of [-.06, .06]) for (const y of [.03, -.03]) bolt(gun, x, y, throat - .045, .009, BRIGHT, 'y');
 // The middle band with its hanging ring and a short strap and buckle.
 const band = throat - .29;
 box(gun, 0, 0, band, .19, .054, .034, '#7f827f');
 box(gun, 0, 0, band, .194, .056, .006, GOLD);
 const hang = add(gun, new THREE.TorusGeometry(.028, .007, 4, 8), BRIGHT, .115, 0, band); hang.rotation.x = Math.PI / 2;
 // (The strap runs from the ring back up beside the scabbard toward the belt.)
 const strap = box(gun, .142, -.004, band + .13, .026, .01, .22, '#3a2c22'); strap.rotation.y = -.12;
 const buckle = box(gun, .148, .004, band + .15, .04, .012, .034, '#8a8d8a'); buckle.rotation.y = -.12;
 box(gun, .148, .011, band + .15, .02, .004, .018, '#3a2c22').rotation.y = -.12;
 for (const k of [.07, .21]) box(gun, .142 + k * .12, .002, band + .13 - .11 + k, .03, .011, .005, '#57432f').rotation.y = -.12;
 // Chape: the steel tip, gold edged.
 plate(gun, [[-.08, end + .125], [.08, end + .125], [.08, end + .085], [0, end - .015], [-.08, end + .085]], .052, 0, '#8a8d8a');
 box(gun, 0, .027, end + .06, .012, .003, .08, BRIGHT);
 box(gun, 0, 0, end + .12, .16, .054, .008, GOLD);
 return gun;
}
function sheathPhoto(){
 const gun=sheathPhotoModel();const scene=new THREE.Group();scene.add(gun);return {scene,gun};
}
const BUILD = { sheath:sheathPhoto, ichor:()=>{const gun=makeIchor();gun.rotation.set(.08,0,-.18);const scene=new THREE.Group();scene.add(gun);return {scene,gun};}, sidekick:()=>{const gun=sidekickPhotoModel();gun.rotation.set(.12,0,-.16);const scene=new THREE.Group();scene.add(gun);return {scene,gun};}, sightline:()=>{const scene=new THREE.Group(),rifle=makeSightlineRifle(),pistol=sidekickPhotoModel();// Remove unused animated effects so their hidden bounds cannot shrink the portrait.
for(const name of ['sightline-loading-round','sightline-breach-light']){const part=rifle.getObjectByName(name);part.removeFromParent();part.traverse(o=>o.geometry?.dispose());}
for(const name of ['sightline-leg-left','sightline-leg-right'])rifle.getObjectByName(name).rotation.x=-Math.PI/2;
rifle.rotation.z=-.16;pistol.position.set(.1,-.48,.15);pistol.rotation.set(.1,0,.28);pistol.scale.setScalar(1.25);scene.add(rifle,pistol);return {scene,gun:scene};}, omen:()=>{const gun=makeOmen(3,false);gun.rotation.set(.12,0,-.16);const scene=new THREE.Group();scene.add(gun);return {scene,gun};}, static: staticGun, rifle: rifleGun, shotgun: shotgunGun };

// Ichor (v0.990a, owner: "make the katana fit better in its thumbnail"): a
// sword is long and thin, so framing its box's corners left it a small shallow
// sliver in a big empty card, seen nearly edge-on. Instead it is turned in the
// camera's own frame: the tip up and to the right along the card's diagonal,
// the handle and guard low left, the steel's flat face toward the camera
// (tipped a little up, so the key light runs down the edge and the blood
// channel shows), then framed on its actual points (every vertex projected,
// not the box's corners) and centred with a view offset, filling ~92% of the
// card's diagonal.
const ICHOR_PHOTO = { angle: .9, face: .5, fill: .92 };
function fitAlongDiagonal(gun, camera) {
 const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1), back = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
 const tip = right.clone().multiplyScalar(Math.cos(ICHOR_PHOTO.angle)).addScaledVector(up, Math.sin(ICHOR_PHOTO.angle)).normalize();
 // The flat face's normal: toward the camera, leaning up the screen, square to the tip.
 const face = back.clone().multiplyScalar(Math.cos(ICHOR_PHOTO.face)).addScaledVector(up, Math.sin(ICHOR_PHOTO.face));
 face.addScaledVector(tip, -face.dot(tip)).normalize();
 // The model's tip runs along -z and its flat face along +y (ichor-model.js).
 const z = tip.clone().negate(), x = new THREE.Vector3().crossVectors(face, z);
 const centre = new THREE.Box3().setFromObject(gun).getCenter(new THREE.Vector3());
 gun.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, face, z)); gun.rotation.reorder('XYZ');
 gun.position.set(0, 0, 0); gun.updateMatrixWorld(true);
 gun.position.copy(centre).sub(new THREE.Box3().setFromObject(gun).getCenter(new THREE.Vector3())); gun.updateMatrixWorld(true);
 // Its points on screen, at zoom 1.
 camera.zoom = 1; camera.clearViewOffset(); camera.updateProjectionMatrix();
 const v = new THREE.Vector3();
 let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
 gun.traverse(o => {
  if (!o.isMesh || !o.visible) return;
  const pos = o.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
 });
 camera.zoom = Math.min(2 * ICHOR_PHOTO.fill / (x1 - x0), 2 * ICHOR_PHOTO.fill / (y1 - y0));
 // Centred: the view offset shifts the picture by the points' middle (at this zoom).
 const W = SIZE.width, H = SIZE.height, cx = (x0 + x1) / 2 * camera.zoom, cy = (y0 + y1) / 2 * camera.zoom;
 camera.setViewOffset(W, H, cx * W / 2, -cy * H / 2, W, H);
 camera.updateProjectionMatrix();
}

// One studio for every weapon: the same lights, tone, camera direction, and
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
 camera.zoom = Math.min((id==='ichor'||id==='sheath'?.96:id==='sightline'?1.04:1.3) / ex, (id==='ichor'||id==='sheath'?.96:1.15) / ey); camera.updateProjectionMatrix();
 if (id === 'ichor' || id === 'sheath') fitAlongDiagonal(gun, camera);
 renderer.render(scene, camera);
 const url = renderer.domElement.toDataURL('image/png');
 scene.traverse(o => o.geometry?.dispose()); flat.forEach(m => m.dispose()); flat.clear(); renderer.dispose(); renderer.forceContextLoss();
 return url;
}
