// What a robot looks like, and what is left of one.
//
// A machine built to the player's exact measurements (makePlayer /
// RemotePlayers.build), so it moves and reads the same size: the same legs,
// the same tapered can of a body, the head at the same height, the same gun
// arm with the gun in the same hand, the same base ring. No hat: a riveted
// box head with a jaw grille and a glowing visor slit, bolts for ears, a
// domed cap and an antenna with a bulb. Flat-shaded and merged into one draw
// like every body in the game; only the visor and the bulb are separate,
// because they glow (unlit, so they read in shade and indoors).
//
// Armour (robot-wear.js): the chest and back plates, a shoulder guard and
// the side of the head are bolted on over wiring, as one more draw. As a
// robot is damaged they come off one by one, clattering to the ground, and
// the wiring under them shows and sparks, more and more as it weakens.
// Robots never bleed.
//
// Skins: every robot is a different make (`ROBOT_SKINS`: steel, copper,
// brass, gunmetal, rust bucket, enamel, black iron, teal tin), picked from
// its slot: no two robots in a game share a make, and a robot keeps its
// make (and its wreck shows it) for as long as it is in the game.
//
// A dead robot topples over, its eye goes dark, whatever armour it still had
// bursts off, and it sparks and smokes where it lies for a few seconds
// (RobotWrecks) before being cleared away.
import * as THREE from 'three';
import { SIDE_COLOURS } from '../config/match.js';
import { buildArmour, shedAll } from './robot-wear.js';

export const ROBOT_SLOT = 100;          // slots from here up are robots
export const ALLY_SLOT = 1000;          // from here up, robots on your side
export const isRobotSlot = slot => slot >= ROBOT_SLOT;
export const isAllySlot = slot => slot >= ALLY_SLOT;

// Parts every make shares.
export const ROBOT_COLOURS = Object.freeze({
 iron: '#474d53', gauge: '#e8e2d0', needle: '#b8342c', rust: '#8a4b2c', bulb: '#ff5a4a', dead: '#2b3033', ring: '#7fe8ff',
 innards: '#2a2e31', wireRed: '#c9402f', wireYellow: '#e2b43e', wireBlue: '#4f8fc9', coil: '#b87a3a',
});
// The makes. body/dark: the sheet metal and its shaded plates; trim: the
// band, cuff and bolts; face: the head; hat: the cap; crown: the dome; legs; eye: the visor's glow
// (never green: green is an ally's).
export const ROBOT_SKINS = Object.freeze([
 { id: 'steel', body: '#9aa4a8', dark: '#6d777c', trim: '#c79a52', face: '#b4bec2', hat: '#737b80', crown: '#838c91', legs: '#474d53', eye: '#7fe8ff' },
 { id: 'copper', body: '#b8734a', dark: '#7d4a2f', trim: '#5fa89a', face: '#c98a5e', hat: '#8f5636', crown: '#a1623f', legs: '#5a3a28', eye: '#ffc46b', patina: '#5fa89a' },
 { id: 'brass', body: '#c9a25a', dark: '#8c6d34', trim: '#6b5a3a', face: '#d8b872', hat: '#9a7a3c', crown: '#b08c48', legs: '#5e4a2a', eye: '#ff8a5c' },
 { id: 'gunmetal', body: '#5d6f86', dark: '#3d4a5c', trim: '#c9c2b0', face: '#7d8ea3', hat: '#465569', crown: '#52627a', legs: '#2f3947', eye: '#ffe066' },
 { id: 'rust', body: '#8a5a3e', dark: '#5e3b28', trim: '#a0a6a8', face: '#9c6a4a', hat: '#7a7468', crown: '#86806f', legs: '#4a3122', eye: '#ff5a4a', rust: '#6e3a1f' },
 { id: 'enamel', body: '#d9d2bf', dark: '#a39b86', trim: '#b8433a', face: '#e6e0cf', hat: '#8a3a33', crown: '#9e4038', legs: '#5c564a', eye: '#7fe8ff' },
 { id: 'iron', body: '#4a5056', dark: '#2e3237', trim: '#c79a52', face: '#61686f', hat: '#33373b', crown: '#3d4247', legs: '#26292d', eye: '#ff5a4a' },
 { id: 'teal', body: '#4f8a8c', dark: '#34605f', trim: '#e0b35a', face: '#6aa3a3', hat: '#3b6b6c', crown: '#437a7b', legs: '#2c4a4a', eye: '#ffd27a' },
]);
// Which make a slot is: BotMatch gives each robot a make no other robot in
// the game has, and a slot of ROBOT_SLOT / ALLY_SLOT + make + 1.
export const skinOf = slot => ROBOT_SKINS[Math.max(0, (slot % ALLY_SLOT) % ROBOT_SLOT - 1) % ROBOT_SKINS.length];
// Your allies: any make, with a friendly green visor, bulb and base ring,
// and a green pennant on the antenna, so a friend reads at a glance.
export const ALLY_COLOURS = Object.freeze({ eye: '#9dff8a', bulb: '#9dff8a', ring: '#9dff8a', pennant: '#6fd66a' });

const glow = new WeakMap();
// Also held by the view (WorldView.robotGlow), so the load-time shader
// warm-up finds them: a first robot builds no shader mid-fight. One visor
// material per make (and the ally's), made up front.
export function glowMaterials(view) {
 let m = glow.get(view);
 if (!m) {
  const basic = color => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  m = { bulb: basic(ROBOT_COLOURS.bulb), dead: basic(ROBOT_COLOURS.dead), allyEye: basic(ALLY_COLOURS.eye), allyBulb: basic(ALLY_COLOURS.bulb), eyes: new Map() };
  for (const skin of ROBOT_SKINS) if (!m.eyes.has(skin.eye)) m.eyes.set(skin.eye, basic(skin.eye));
  m.lit = new Set([m.bulb, m.allyEye, m.allyBulb, ...m.eyes.values()]);
  glow.set(view, m);
 }
 return m;
}

// The body into `body` (a Group), merged; returns the glowing parts and the
// armour (robot-wear.js).
// `side` (team games): the team id paints the cap its side's colour
// (SIDE_COLOURS); otherwise the make's own.
export function buildRobotBody(view, body, ally = false, skin = ROBOT_SKINS[0], side = null) {
 const c = ROBOT_COLOURS, v = view, cap = SIDE_COLOURS[side] || (ally ? SIDE_COLOURS.friend : null);
 const k = cap ? { ...skin, hat: cap.hat, crown: cap.band } : skin;
 // Legs: the player's, in the make's darker metal, with a knee plate.
 for (const x of [-.15, .15]) {
  v.box(x, .14, 0, .18, .27, .27, k.legs, body).userData.deathPart = 'leg';
  v.box(x, .19, -.14, .12, .07, .02, k.dark, body).userData.deathPart = 'leg';
 }
 // The can: the player's coat (same radius, taper and height), a band round
 // the middle and a lid ring at the collar.
 v.cylinder(0, .57, 0, .29, .63, k.body, body, 8, .24);
 v.cylinder(0, .43, 0, .285, .07, k.trim, body, 8, .28);
 v.cylinder(0, .86, 0, .255, .05, k.dark, body, 8);
 // Rivets round the band.
 for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; v.box(Math.cos(a) * .285, .5, Math.sin(a) * .285, .035, .035, .035, k.dark, body); }
 // What the armour covers (seen once a plate is off): a dark frame with
 // coloured wiring, a coil on the back, cable at the shoulder and temple.
 v.box(0, .64, -.262, .26, .24, .03, c.innards, body);
 v.box(-.06, .66, -.278, .03, .2, .02, c.wireRed, body); v.box(.02, .62, -.278, .03, .18, .02, c.wireYellow, body); v.box(.08, .68, -.278, .025, .16, .02, c.wireBlue, body);
 v.box(0, .62, .262, .26, .26, .03, c.innards, body);
 const coil = v.cylinder(0, .62, .282, .06, .03, c.coil, body, 8); coil.rotation.x = Math.PI / 2;
 v.box(-.3, .8, 0, .08, .05, .14, c.innards, body); v.box(-.31, .8, -.03, .06, .03, .06, c.wireRed, body);
 v.box(-.152, .96, 0, .03, .16, .22, c.innards, body); v.box(-.162, .97, .02, .02, .1, .03, c.wireYellow, body).userData.deathPart = 'head';
 // Head: a box the size of the player's head, a jaw grille, bolts for ears,
 // a domed cap on top (no hat: it is a machine).
 v.box(0, .96, 0, .32, .25, .3, k.face, body).userData.deathPart = 'head';
 v.box(0, .88, -.155, .2, .045, .02, k.dark, body).userData.deathPart = 'head';
 for (const x of [-.175, .175]) { const ear = v.cylinder(x, .97, 0, .055, .04, k.trim, body, 8); ear.rotation.z = Math.PI / 2; ear.userData.deathPart = 'head'; }
 v.box(0, 1.1, 0, .34, .04, .32, k.hat, body).userData.deathPart = 'head';
 v.cylinder(0, 1.15, 0, .11, .07, k.crown, body, 8, .07).userData.deathPart = 'head';
 // The antenna out of the dome.
 v.cylinder(.05, 1.26, .02, .012, .16, c.iron, body, 4).userData.deathPart = 'head';
 // Shoulder and the player's gun arm, with a cuff.
 v.box(-.29, .78, 0, .1, .1, .16, k.dark, body);
 v.box(.27, .69, -.2, .16, .16, .38, k.body, body);
 v.box(.27, .69, -.03, .18, .18, .06, k.trim, body);
 // An ally's pennant, flying off the antenna.
 if (ally) v.box(.14, 1.3, .02, .16, .09, .02, ALLY_COLOURS.pennant, body).userData.deathPart = 'head';
 v.batch(body);
 const m = glowMaterials(view);
 const eye = new THREE.Mesh(new THREE.BoxGeometry(.24, .055, .02), ally ? m.allyEye : m.eyes.get(k.eye)); eye.position.set(0, .99, -.155); eye.userData.deathPart = 'head';
 const bulb = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, .05), ally ? m.allyBulb : m.bulb); bulb.position.set(.05, 1.35, .02); bulb.userData.deathPart = 'head';
 body.add(eye, bulb);
 const armour = buildArmour(view, body, skin);
 return { eye, bulb, armour };
}

// Dead robots: topple, go dark, spark and smoke, then are cleared.
export class RobotWrecks {
 constructor(view) { this.view = view; this.list = new Map(); }

 // `lost`: the armour plates it had already shed alive (they are on the
 // ground already); the rest burst off now.
 add(slot, avatar, event, lost = null) {
  this.remove(slot);
  this.view.scene.add(avatar.root); avatar.root.updateMatrixWorld(true);
  if (avatar.glow?.armour) shedAll(this.view, avatar, lost, event);
  const m = glowMaterials(this.view);
  avatar.root.traverse(o => { if (m.lit.has(o.material)) o.material = m.dead; });
  this.view.scene.add(avatar.root);
  // Falls away from the shot.
  const dir = Math.atan2(event.directionZ || 0, event.directionX || 1);
  this.list.set(slot, { avatar, age: 0, spark: 0, dir, x: event.x, z: event.z, y: avatar.root.position.y });
 }

 update(dt) {
  const fx = this.view.fx;
  for (const [slot, w] of this.list) {
   w.age += dt;
   const fall = Math.min(1, w.age / .45), ease = fall * fall * (3 - 2 * fall);
   // Tipped over along the push, a little bounce on landing.
   const tilt = ease * 1.45 - (fall >= 1 ? Math.sin(Math.min(1, (w.age - .45) / .25) * Math.PI) * .06 : 0);
   w.avatar.root.rotation.set(Math.sin(w.dir) * tilt, 0, -Math.cos(w.dir) * tilt);
   w.avatar.root.position.y = w.y - ease * .08;
   // Sparks and smoke for a few seconds.
   w.spark -= dt;
   if (w.age < 4.5 && w.spark <= 0 && fx?.on) {
    w.spark = .12 + Math.random() * .3;
    fx.electric(w.x + (Math.random() - .5) * .6, .35, w.z + (Math.random() - .5) * .6, .35 + Math.random() * .3, { ring: false });
    if (Math.random() < .5) fx.puff({ x: w.x, y: .5, z: w.z, vx: (Math.random() - .5) * .3, vz: (Math.random() - .5) * .3, vy: .6, rise: .8, size: .22, grow: 2.2, life: 1.8, alpha: .35, color: new THREE.Color('#4b4d4e') });
   }
   if (w.age > 30) this.remove(slot);
  }
 }

 remove(slot) { const w = this.list.get(slot); if (!w) return; w.avatar.root.removeFromParent(); w.avatar.dispose?.(); this.list.delete(slot); }
 clear() { for (const slot of [...this.list.keys()]) this.remove(slot); }
}
