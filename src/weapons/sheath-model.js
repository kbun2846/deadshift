// Sheath's look: a wide, straight white broadsword with a plain steel
// crossguard and a dark leather grip, and its black sheath hanging at the
// left hip (owner's brief, 2026-09-28). Low-poly, flat-shaded, merged into a
// few draws like the other weapons. The same model serves the local player,
// other players and robots (remote-players.js) and the menu picture
// (weapon-photos.js).
import * as THREE from 'three';
import { compact } from '../effects/gore.js';
import { SHEATH } from '../config/gameplay.js';
import { GUARD_R, GUARD_L, SHEATHED, SHEATH_AXIS, SHEATHE_TIME, DRAW_READY, sheathDrawDashPose, sheathSwingPose, sheathDrawStrikePose, sheathFlourishPose, sheathResheathePose } from './sheath-motion.js';

export const BLADE_LENGTH = .98, BLADE_START = .07;
// Blood on the blade builds in these many steps (sim blood 0..1).
export const BLOOD_STAGES = 4;
const STREAKS_PER_STAGE = 4;

const lambert = color => new THREE.MeshLambertMaterial({ color, flatShading: true });
function box(parent, x, y, z, w, h, d, color) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color)); m.position.set(x, y, z); parent.add(m); return m; }
function slab(parent, points, thickness, y, color) {
 const outline = new THREE.Shape(); points.forEach(([x, z], i) => i ? outline.lineTo(x, z) : outline.moveTo(x, z)); outline.closePath();
 const geo = new THREE.ExtrudeGeometry(outline, { depth: thickness, bevelEnabled: false }); geo.rotateX(Math.PI / 2);
 const m = new THREE.Mesh(geo, lambert(color)); m.position.y = y + thickness / 2; parent.add(m); return m;
}

// The sword alone, its origin at the crossguard, the blade toward -z, the
// grip toward +z; width across x, thickness in y.
function makeBlade() {
 const blade = new THREE.Group(); blade.name = 'sheath-blade';
 const L = BLADE_LENGTH, s = BLADE_START, tip = -(s + L);
 // The white blade: a broad flat body, bevelled edges a shade brighter, a
 // long fuller down the middle of each face, and a sharp point.
 slab(blade, [[-.066, -s], [.066, -s], [.058, tip + .16], [0, tip], [-.058, tip + .16]], .02, 0, '#ebe7dc');
 slab(blade, [[.044, -s], [.066, -s], [.058, tip + .16], [0, tip], [.026, tip + .15]], .012, .004, '#fbfaf5');
 slab(blade, [[-.044, -s], [-.066, -s], [-.058, tip + .16], [0, tip], [-.026, tip + .15]], .012, -.004, '#fbfaf5');
 for (const y of [.0105, -.0105]) box(blade, 0, y, -(s + L * .38), .022, .003, L * .62, '#c9c4b8');
 // A plain crossguard, the ricasso's collar, the grip and a round-ish pommel.
 box(blade, 0, 0, -.035, .38, .05, .052, '#8f928f');
 for (const x of [-.19, .19]) box(blade, x, 0, -.035, .034, .06, .062, '#a9aca7');
 box(blade, 0, 0, -.068, .14, .032, .03, '#7d807d');
 box(blade, 0, 0, .12, .042, .046, .23, '#2b2420');
 for (let i = 0; i < 6; i++) box(blade, 0, 0, .02 + i * .038, .047, .05, .012, '#3e332c').rotation.z = i % 2 ? .3 : -.3;
 box(blade, 0, 0, .255, .075, .062, .05, '#9a9c98');
 box(blade, 0, 0, .285, .04, .04, .022, '#b8bab5');
 compact(blade);
 blade.add(makeGoldExtension());
 // Blood: streaks one millimetre over both faces, in blade coordinates, so
 // they stay on through every roll. One small mesh per stage, shown by
 // visibility (a clone per avatar shares the geometry, so nothing about the
 // geometry itself may change per player).
 const shades = ['#7c111d', '#a01d2b', '#5a0c16', '#8e1824'].map(c => new THREE.Color(c));
 const material = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: .95, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
 for (let stage = 0; stage < BLOOD_STAGES; stage++) {
  const positions = [], colors = [];
  for (let k = 0; k < STREAKS_PER_STAGE; k++) {
   // Early stages near the point (the part that meets people), later ones
   // run further up toward the guard.
   const i = stage * STREAKS_PER_STAGE + k, reach = .15 + .8 * (stage + (k + .5) / STREAKS_PER_STAGE) / BLOOD_STAGES;
   const z = tip + .08 + (L - .2) * (1 - reach), w = .012 + .018 * (.5 + .5 * Math.sin(i * 2.3)), x = .03 * Math.sin(i * 1.7), len = .06 + .09 * (.5 + .5 * Math.cos(i * 1.3)), c = shades[i % 4];
   for (const y of [.0105, -.0105]) {
    const p = [[x - w, y, z + len * .6], [x + w * .8, y, z + len * .35], [x + w * .5, y, z - len * .5], [x - w * .7, y, z - len * .4]];
    for (const j of y > 0 ? [0, 1, 2, 0, 2, 3] : [2, 1, 0, 3, 2, 0]) { positions.push(...p[j]); colors.push(c.r, c.g, c.b); }
   }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.computeVertexNormals();
  const blood = new THREE.Mesh(geo, material); blood.name = 'sheath-blood-' + stage; blood.visible = false; blood.renderOrder = 1; blade.add(blood);
 }
 return blade;
}

// Gold Rush's extension: a see-through gold blade over the sword that runs
// on past its point to twice its length, bright at the edges and down the
// middle, with a white flash shell for its pop-in. Shared materials (clones
// share them), so it is shown and animated only by visibility and scale.
// Its origin is the guard; scale.z stretches it out from there.
export const EXTENSION_LENGTH = BLADE_LENGTH * 2;
const additive = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
function makeGoldExtension() {
 const g = new THREE.Group(); g.name = 'sheath-extension'; g.visible = false;
 const L = EXTENSION_LENGTH, s = BLADE_START, tip = -(s + L);
 const shape = (w, taper, t) => { const o = new THREE.Shape(); o.moveTo(-w, -s); o.lineTo(w, -s); o.lineTo(w * .88, tip + taper); o.lineTo(0, tip); o.lineTo(-w * .88, tip + taper); o.closePath(); const geo = new THREE.ExtrudeGeometry(o, { depth: t, bevelEnabled: false }); geo.rotateX(Math.PI / 2); geo.translate(0, t / 2, 0); return geo; };
 // (The body is laid over normally, not added, so it stays a saturated gold
 // over pale sand or snow; the core and edges glow on top.)
 const body = new THREE.Mesh(shape(.085, .3, .034), new THREE.MeshBasicMaterial({ color: '#e59a12', transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); body.name = 'sheath-extension-body';
 const core = new THREE.Mesh(shape(.026, .22, .038), additive('#ffd35c', .45)); core.name = 'sheath-extension-core';
 // Edges: two bright thin rails along the gold blade's sides.
 const rail = new THREE.BoxGeometry(.012, .04, L - .3).translate(0, 0, -(s + (L - .3) / 2));
 const edges = new THREE.Group(); edges.name = 'sheath-extension-edges';
 for (const x of [-.078, .078]) { const m = new THREE.Mesh(rail, additive('#fff1c4', .8)); m.position.x = x; edges.add(m); }
 const flash = new THREE.Mesh(shape(.12, .34, .06), additive('#ffffff', .85)); flash.name = 'sheath-extension-flash'; flash.visible = false;
 for (const m of [body, core, flash]) m.renderOrder = 2;
 g.add(body, core, edges, flash);
 return g;
}

// The black sheath: a long tapering scabbard with a steel throat and chape
// and a strap up to the belt. Its origin is the throat, the blade's axis
// running toward +z (a sheathed blade points back into it).
function makeScabbard() {
 const sc = new THREE.Group(); sc.name = 'sheath-scabbard';
 // (Built along -z, the same way as the blade: the sheathed pose turns both.)
 const L = BLADE_LENGTH + .06, z = v => -v;
 slab(sc, [[-.08, z(-.02)], [.08, z(-.02)], [.066, z(L - .12)], [0, z(L)], [-.066, z(L - .12)]], .038, 0, '#141417');
 box(sc, 0, .018, z(L * .45), .016, .004, L * .7, '#26262b');
 box(sc, 0, 0, z(.025), .18, .05, .07, '#8a8d8a');
 box(sc, 0, 0, z(.06), .17, .048, .012, '#5d605d');
 slab(sc, [[-.07, z(L - .22)], [.07, z(L - .22)], [.066, z(L - .12)], [0, z(L)], [-.066, z(L - .12)]], .044, 0, '#7f827f');
 box(sc, 0, 0, z(.3), .168, .044, .03, '#2a2a2f');
 // The hanger: a short strap from the throat up toward the belt.
 const strap = box(sc, 0, .06, z(.12), .03, .13, .05, '#2b2521'); strap.rotation.x = -.5;
 compact(sc);
 return sc;
}

export function makeSheath() {
 const root = new THREE.Group(); root.name = 'sheath-loadout';
 const blade = makeBlade(), scabbard = makeScabbard();
 root.add(blade, scabbard);
 // The scabbard stays put at the hip, set once from the sheathed pose.
 place(scabbard, SHEATHED);
 blade.userData.sheathMotion = null;
 return root;
}

const EULER = new THREE.Euler();
function place(object, pose) { object.position.set(pose[0], pose[1], pose[2]); EULER.set(pose[4], pose[3], pose[5], 'YXZ'); object.quaternion.setFromEuler(EULER); }
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const HANG_R = new THREE.Vector3(.07, -.3, .46), SCABBARD_HAND = new THREE.Vector3(SHEATHED[0] + .02, SHEATHED[1] + .03, SHEATHED[2] + .1);
const GRIP_R = new THREE.Vector3(0, 0, .06), GRIP_L = new THREE.Vector3(0, 0, .19);

// Poses the sword from its state `s` (sim.sheath or a player's snapshot)
// and returns the body's share of the motion. `moving` 0..1: walking.
export function poseSheath(root, s, time, moving = 0) {
 const pack = root.getObjectByName('sheath-loadout') || (root.name === 'sheath-loadout' ? root : null); if (!pack) return null;
 const blade = pack.getObjectByName('sheath-blade');
 let m = pack.userData.motion;
 if (!m || time < m.time) m = pack.userData.motion = { time, serial: -1, value: [...SHEATHED], entry: [...SHEATHED], from: [...SHEATHED], out: false, side: 1, sheatheAt: -10, cutPhase: null, target: new Array(11), hands: { right: new THREE.Vector3(), left: new THREE.Vector3(), rightGrip: false, leftGrip: false } };
 const dt = Math.max(0, Math.min(.1, time - m.time)); m.time = time;
 const cut = s.x?.phase ?? s.cut ?? null, cutT = s.x?.t ?? s.cutT ?? 0, target = m.target;
 let mode;
 if (cut === 'strike') { mode = 'strike'; sheathDrawStrikePose(Math.min(1, cutT / SHEATH.xStrike), target); }
 else if (cut === 'flourish') { mode = 'flourish'; sheathFlourishPose(Math.min(1, cutT / SHEATH.xFlourish), target); }
 else if (cut === 'back' || cut === 'tell') {
  // The hop back settles into the set; the tell holds it, trembling.
  mode = 'ready';
  if (m.cutPhase !== 'back' && m.cutPhase !== 'tell') { m.readyAt = time; for (let i = 0; i < 11; i++) m.from[i] = m.value[i]; }
  const k = Math.min(1, (time - m.readyAt) / SHEATH.xBack), e = k * k * (3 - 2 * k);
  for (let i = 0; i < 11; i++) target[i] = m.from[i] + ((i === 3 ? m.from[i] + wrap(DRAW_READY[i] - m.from[i]) : DRAW_READY[i]) - m.from[i]) * e;
  if (cut === 'tell') { const q = Math.sin(time * 90) * .004; target[0] += q; target[7] += .02 * Math.min(1, cutT / SHEATH.xTell); }
 }
 else if (cut === 'dash') { mode = 'dash'; sheathDrawDashPose(Math.min(1, cutT / .12), target); }
 else if (s.swing > 0) {
  mode = 'swing';
  if (m.serial !== s.serial) { m.serial = s.serial; for (let i = 0; i < 11; i++) m.entry[i] = m.value[i]; m.swingAt = time; }
  const t = 1 - s.swing / (s.duration || SHEATH.interval);
  sheathSwingPose(s.variant || 0, t, target);
  m.side = (s.variant === 0 || s.variant === 2 || s.variant === 4) ? -1 : 1;
  // Catch up from wherever the blade was in the first few hundredths.
  const k = Math.min(1, (time - m.swingAt) / .05);
  if (k < 1) for (let i = 0; i < 11; i++) target[i] = m.entry[i] + (target[i] - m.entry[i]) * (k * k * (3 - 2 * k));
 } else if (s.out) {
  mode = 'guard';
  const g = m.side < 0 ? GUARD_L : GUARD_R;
  // Breathing, and a heavier sway walking with the sword out.
  const breathe = Math.sin(time * 2.1), stride = Math.sin(time * 8.5);
  for (let i = 0; i < 11; i++) target[i] = g[i];
  target[1] += .012 * breathe + moving * .02 * Math.abs(stride); target[4] += .03 * breathe - moving * .12; target[3] += moving * .06 * stride; target[7] += moving * .05;
 } else {
  // Back into the sheath (after a swing or a guard), then at rest there.
  if (m.out && m.lastMode !== 'flourish') { m.sheatheAt = time; for (let i = 0; i < 11; i++) m.from[i] = m.value[i]; }
  const k = (time - m.sheatheAt) / SHEATHE_TIME;
  if (k < 1) { mode = 'resheathe'; sheathResheathePose(Math.max(0, k), m.from, target); }
  else { mode = 'sheathed'; for (let i = 0; i < 11; i++) target[i] = SHEATHED[i]; }
 }
 m.cutPhase = cut;
 m.out = !!s.out || mode === 'dash' || mode === 'strike' || mode === 'flourish';
 if (mode === 'guard') { const q = 1 - Math.exp(-dt * 14); for (let i = 0; i < 11; i++) m.value[i] += (i === 3 ? wrap(target[i] - m.value[i]) : target[i] - m.value[i]) * q; }
 else if (m.lastMode === 'flourish' && mode === 'sheathed') for (let i = 0; i < 11; i++) m.value[i] = SHEATHED[i];
 else for (let i = 0; i < 11; i++) m.value[i] = target[i];
 m.lastMode = mode;
 const v = m.value;
 place(blade, v);
 // Hands: both on the grip while the sword is out (a hand-and-a-half
 // grip); sheathed, the right hangs free and the left rests on the throat.
 const h = m.hands; h.mode = mode;
 blade.updateMatrix();
 h.right.copy(GRIP_R).applyMatrix4(blade.matrix); h.left.copy(GRIP_L).applyMatrix4(blade.matrix);
 h.rightGrip = h.leftGrip = true;
 if (mode === 'ready') { h.left.copy(SCABBARD_HAND); h.leftGrip = false; }
 else if (mode === 'dash') { const k = cutT / .12; if (k < .6) { h.left.copy(SCABBARD_HAND); h.leftGrip = false; } }
 else if (mode === 'sheathed') { h.right.copy(HANG_R); h.left.copy(SCABBARD_HAND); h.rightGrip = h.leftGrip = false; }
 else if (mode === 'swing' && s.variant === 6) { const t = 1 - s.swing / (s.duration || SHEATH.interval); if (t < .3) { h.left.copy(SCABBARD_HAND); h.leftGrip = false; } }
 else if (mode === 'resheathe') { const k = (time - m.sheatheAt) / SHEATHE_TIME; if (k > .45) { h.left.copy(SCABBARD_HAND); h.leftGrip = false; } }
 else if (mode === 'flourish') { const k = cutT / SHEATH.xFlourish; if (k > .55) { h.left.copy(SCABBARD_HAND); h.leftGrip = false; } else if (k > .1) { h.left.set(-.2, -.15, .3); h.leftGrip = false; } }
 // Gold Rush's extension: out with the blade while the rush runs. It pops
 // in (grows from the guard with a white flash) and, when the rush ends,
 // thins away (sheath-view.js throws the particles it dissolves into).
 const ext = blade.getObjectByName('sheath-extension');
 if (ext) {
  const shown = (s.rush || 0) > 0 && m.out && mode !== 'resheathe' && mode !== 'sheathed' && mode !== 'ready';
  if (shown && !m.extOn) { m.extOn = true; m.extAt = time; }
  if (!shown && m.extOn) { m.extOn = false; m.extOffAt = time; }
  const flash = ext.getObjectByName('sheath-extension-flash');
  if (m.extOn) {
   const k = Math.min(1, (time - m.extAt) / .12), grow = 1 - Math.pow(1 - k, 3), shimmer = 1 + .04 * Math.sin(time * 23);
   ext.visible = true; ext.scale.set(shimmer * (1 + (1 - k) * .5), 1, Math.max(.02, grow));
   flash.visible = time - m.extAt < .1; flash.scale.set(1 + (time - m.extAt) * 4, 1, 1);
  } else {
   const k = m.extOffAt != null ? (time - m.extOffAt) / .22 : 1;
   ext.visible = k < 1; flash.visible = false;
   if (k < 1) ext.scale.set(Math.max(.02, 1 - k), Math.max(.02, 1 - k), 1 + k * .08);
  }
 }
 // Blood on the blade, in stages.
 const stage = Math.min(BLOOD_STAGES, Math.ceil((s.blood || 0) * BLOOD_STAGES - 1e-6));
 for (let i = 0; i < BLOOD_STAGES; i++) { const mesh = blade.getObjectByName('sheath-blood-' + i); if (mesh) mesh.visible = i < stage; }
 pack.userData.sheathPose = { spin: v[6], lean: v[7], bank: v[8], dip: v[9], step: v[10], mode, hands: h };
 return pack.userData.sheathPose;
}

// The body's part of a pose (torso turned with the cut, leaning in, the
// knees bent, a step forward onto the front foot).
export function applySheathBody(body, pose) {
 if (!pose) return;
 body.rotation.y = pose.spin; body.rotation.x -= pose.lean; body.rotation.z += pose.bank;
 body.position.y -= pose.dip; body.position.x = 0; body.position.z = -pose.step; body.scale.y *= 1 - pose.dip * .45;
}
export function releaseSheathBody(body) { body.rotation.y = 0; body.position.x = body.position.z = 0; }
// Where the blade's point and its middle are, in world space (trails).
export function sheathBladePoints(pack, tip, mid) {
 const blade = pack.getObjectByName('sheath-blade'); if (!blade) return false;
 blade.updateWorldMatrix(true, false);
 tip.set(0, 0, -(BLADE_START + BLADE_LENGTH) + .02).applyMatrix4(blade.matrixWorld);
 mid.set(0, 0, -(BLADE_START + BLADE_LENGTH * .42)).applyMatrix4(blade.matrixWorld);
 return true;
}
