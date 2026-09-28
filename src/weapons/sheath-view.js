// Sheath on screen (owner's brief, 2026-09-28: feel first): the sword and
// its sheath on the local player, every slash's white trail, what a hit does
// (a short hit-stop on the attacker's blade, a camera nudge, blood thrown
// along the swing, sparks off props), Gold Rush's gold ribbon and
// afterimages, and the Draw-cut's line. Other players and robots get the
// same trails and effects from their events (remote-players.js draws their
// sword).
//
// Trails are not sampled from rendered frames (a fast strike crosses in
// five of them and would draw as a polygon): each swing's arc is rebuilt
// from the swing's own keys (sheath-motion.js) at any resolution, through
// the same body and gun transforms the model uses, so the ribbon follows the
// blade's point exactly, whatever the frame rate.
//
// Draws: one dynamic ribbon mesh (vertex alpha), one instanced line batch
// (sparks, shards), one instanced ghost batch (afterimages) and a small pool
// of patterned gold slash marks (the Draw-cut's). Nothing is created
// mid-game; all of them are in `meshes` for the warm-up.
import * as THREE from 'three';
import { makeSheath, poseSheath, applySheathBody, releaseSheathBody, BLADE_LENGTH, BLADE_START, EXTENSION_LENGTH } from './sheath-model.js';
import { sheathSwingPose, sheathStrike, sheathDrawStrikePose } from './sheath-motion.js';
import { SHEATH } from '../config/gameplay.js';
import { floorY } from '../render/ground-lift.js';
export const SHEATH_FX_ORDER = 3;

const WHITE = new THREE.Color('#ffffff'), IVORY = new THREE.Color('#f4f0e6'), STEEL = new THREE.Color('#dfe6ea'), GOLD = new THREE.Color('#ffc93a'), DEEP_GOLD = new THREE.Color('#e39a1c');
const RED = new THREE.Color('#9b1726'), DARK = new THREE.Color('#5a0d16'), YELLOW = new THREE.Color('#ffe27a'), BLUE = new THREE.Color('#62c4ff'), SPARK = new THREE.Color('#fff4c2');
const RIBBON_VERTS = 24000;
// How long a point of the trail stays (s), and how much of the swing's arc
// is shown behind the blade.
const TRAIL_LIFE = .13, TRAIL_REACH = .24;

// The gold slash (Draw-cut): pool size, segments, how long it stays (s),
// how long it holds before burning off, and metres per repeat of its pattern.
const SLASH_POOL = 4, SLASH_SEGMENTS = 48, SLASH_VERTS = SLASH_SEGMENTS * 6, SLASH_LIFE = 1.6, SLASH_HOLD = .6, SLASH_REPEAT = 1.7;

// The slash's texture, drawn once: across it (v, 0 inner to 1 outer) a gold
// body brightening to a white-hot outer edge; along it (u, repeating) an
// engraved band: diamonds joined by scrolling vines, dots, a hatched rule.
function goldSlashTexture() {
 if (typeof document === 'undefined') return new THREE.Texture(); // (tests, no page)
 const W = 512, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
 const g = c.getContext('2d');
 const body = g.createLinearGradient(0, 0, 0, H);
 body.addColorStop(0, 'rgba(255,255,255,0)'); body.addColorStop(.035, 'rgba(255,255,244,1)'); body.addColorStop(.1, 'rgba(255,236,160,1)');
 body.addColorStop(.28, 'rgba(255,200,72,.9)'); body.addColorStop(.6, 'rgba(236,150,30,.55)'); body.addColorStop(.85, 'rgba(190,105,18,.2)'); body.addColorStop(1, 'rgba(160,80,10,0)');
 g.fillStyle = body; g.fillRect(0, 0, W, H);
 g.globalCompositeOperation = 'lighter'; g.lineCap = g.lineJoin = 'round';
 const ink = a => `rgba(255,246,206,${a})`, mid = 60, motif = 128;
 // Rules above and below the band, the top one hatched.
 g.strokeStyle = ink(.55); g.lineWidth = 2; g.beginPath(); g.moveTo(0, 24); g.lineTo(W, 24); g.moveTo(0, 96); g.lineTo(W, 96); g.stroke();
 g.strokeStyle = ink(.4); g.lineWidth = 1.5; g.beginPath(); for (let x = 0; x < W; x += 10) { g.moveTo(x, 28); g.lineTo(x + 6, 36); } g.stroke();
 for (let k = 0; k < W / motif; k++) {
  const x0 = k * motif, cx = x0 + motif / 2;
  // A vine scrolling from this diamond to the next, with a curl each side.
  g.strokeStyle = ink(.75); g.lineWidth = 2.4; g.beginPath(); g.moveTo(cx + 18, mid);
  g.bezierCurveTo(cx + 40, mid - 26, cx + 70, mid + 26, cx + 110, mid); g.stroke();
  g.lineWidth = 1.8; g.beginPath(); g.arc(cx + 44, mid - 12, 8, Math.PI * .1, Math.PI * 1.6); g.stroke();
  g.beginPath(); g.arc(cx + 84, mid + 12, 8, Math.PI * 1.1, Math.PI * 2.6); g.stroke();
  // Leaves off the vine.
  g.fillStyle = ink(.55);
  for (const [lx, ly, r] of [[cx + 30, mid - 16, -.6], [cx + 96, mid + 14, 2.5]]) { g.save(); g.translate(lx, ly); g.rotate(r); g.beginPath(); g.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
  // The diamond: an outline round a solid bright core.
  g.strokeStyle = ink(.95); g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 18, mid); g.lineTo(cx, mid - 20); g.lineTo(cx + 18, mid); g.lineTo(cx, mid + 20); g.closePath(); g.stroke();
  g.fillStyle = ink(.9); g.beginPath(); g.moveTo(cx - 8, mid); g.lineTo(cx, mid - 9); g.lineTo(cx + 8, mid); g.lineTo(cx, mid + 9); g.closePath(); g.fill();
  // Dots above and below it.
  g.fillStyle = ink(.8); for (const dy of [-30, 30]) { g.beginPath(); g.arc(cx, mid + dy, 3, 0, Math.PI * 2); g.fill(); }
 }
 const tex = new THREE.CanvasTexture(c);
 tex.wrapS = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
 return tex;
}

export class SheathView {
 constructor(view) {
  this.view = view; this.clock = 0;
  this.model = makeSheath(); this.model.visible = false; view.player.userData.gun.add(this.model);
  this.swings = []; this.hits = []; this.lines = []; this.cuts = []; this.ghostList = []; this.goldPaths = new Map(); this.flinches = new Map();
  this.stop = 0; this.lag = 0;
  // Scratch transforms for rebuilding a swing's arc.
  this.rig = new THREE.Object3D(); this.rigBody = new THREE.Object3D(); this.rigGun = new THREE.Object3D(); this.rigBlade = new THREE.Object3D();
  this.rig.add(this.rigBody); this.rigBody.add(this.rigGun); this.rigGun.add(this.rigBlade); this.rigGun.position.set(.27, .74, -.46);
  this.pose = new Array(11); this.tip = new THREE.Vector3(); this.mid = new THREE.Vector3(); this.a = new THREE.Vector3(); this.b = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
  this.dummy = new THREE.Object3D(); this.euler = new THREE.Euler(); this.scratch = new THREE.Color();
  this.samplesTip = new Float32Array(64 * 3); this.samplesMid = new Float32Array(64 * 3); this.samplesAge = new Float32Array(64);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RIBBON_VERTS * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(RIBBON_VERTS * 4), 4).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  this.ribbons = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  this.ribbons.frustumCulled = false; this.ribbons.count = 0; view.scene.add(this.ribbons);
  const batch = (geometry, cap, material) => { const m = new THREE.InstancedMesh(geometry, material, cap); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false; m.setColorAt(0, WHITE); view.scene.add(m); return m; };
  this.lineBatch = batch(new THREE.BoxGeometry(1, 1, 1), 700, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .92, depthWrite: false, toneMapped: false }));
  // An afterimage: a plain standing body shape, glowing (additive, so it
  // fades by darkening).
  const ghost = new THREE.CylinderGeometry(.27, .22, 1.02, 8).translate(0, .52, 0);
  this.ghosts = batch(ghost, 48, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  // The Draw-cut's gold slash: a few pooled crescents, each its own
  // geometry (rewritten per cut, sized to its line) and material (its fade),
  // sharing one engraved gold texture.
  this.slashTexture = goldSlashTexture();
  this.slashes = [];
  for (let i = 0; i < SLASH_POOL; i++) {
   const g = new THREE.BufferGeometry();
   g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SLASH_VERTS * 3), 3).setUsage(THREE.DynamicDrawUsage));
   g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(SLASH_VERTS * 2), 2).setUsage(THREE.DynamicDrawUsage));
   g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SLASH_VERTS * 4), 4).setUsage(THREE.DynamicDrawUsage));
   g.setDrawRange(0, 0);
   const map = this.slashTexture.clone(); map.needsUpdate = true;
   const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map, vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
   mesh.frustumCulled = false; mesh.count = 0; view.scene.add(mesh); this.slashes.push(mesh);
  }
  this.slashList = []; this.dashes = new Map();
  this.meshes = [this.ribbons, this.lineBatch, this.ghosts, ...this.slashes];
  for (const m of this.meshes) m.renderOrder = SHEATH_FX_ORDER;
 }
 clear() { this.slashList = []; this.dashes.clear(); for (const m of this.slashes) m.geometry.setDrawRange(0, 0); this.swings = []; this.hits = []; this.lines = []; this.cuts = []; this.ghostList = []; this.goldPaths.clear(); this.flinches.clear(); this.stop = this.lag = 0; for (const m of this.meshes) m.count = 0; this.ribbons.geometry.setDrawRange(0, 0); }
 get detail() { return { potato: .5, performance: .7, balanced: 1, quality: 1.25, extreme: 1.5 }[this.view.qualityName] || 1; }
 own(e) { return e.id === this.view.lastSim?.player.id || e.by === this.view.lastSim?.player.id; }
 // An event's player as drawn: `root` (placed in the world, shown or
 // hidden) and `frame` (turned to their aim: the body's parent). For you
 // both are view.player; another player's avatar turns a group inside it.
 avatarOf(id) {
  const v = this.view;
  if (id === v.lastSim?.player.id || id == null) return this.self ||= { root: v.player, frame: v.player };
  const a = v.remote?.avatars.get(id);
  return a ? { root: a.root, frame: a.group } : null;
 }
 seen(x, z) { return this.view.lastSim?.canSeeEntity?.(x, z, .1) ?? true; }

 event(e) {
  const v = this.view;
  if (e.type === 'sheathSwing') { if (this.swings.length >= 24) this.swings.shift(); this.swings.push({ ...e, born: this.clock }); return; }
  if (e.type === 'sheathHit') { this.hit(e); return; }
  if (e.type === 'sheathClang') {
   if (!this.seen(e.x, e.z)) return;
   const y = floorY(v, e.x, e.z, e.below) + .75, n = Math.round(14 * this.detail);
   for (let i = 0; i < n; i++) { const side = (Math.random() - .5) * 4, push = 2 + Math.random() * 4; this.spark(e.x, y, e.z, e.dx * push - e.dz * side, 1 + Math.random() * 2.5, e.dz * push + e.dx * side, .18 + Math.random() * .22, i % 3 ? SPARK : YELLOW, .022); }
   // Chips: small dark flakes of whatever it was.
   v.burst?.(e.x, e.z, 5, 'hit');
   if (this.own(e)) { this.stop = Math.max(this.stop, .035); v.kick?.set(v.kick.x + e.dx * .06, 0, v.kick.z + e.dz * .06); }
   return;
  }
  if (e.type === 'sheathDrawBack') {
   if (!this.seen(e.x, e.z)) return;
   // The hop back: dust kicked forward off the front foot, and a gold glint
   // at the hip as the thumb pops the guard free.
   const y = floorY(v, e.x, e.z, e.below);
   for (let i = 0; i < 7 * this.detail; i++) { const side = (Math.random() - .5) * 2.4; this.spark(e.x + e.dx * .2, y + .05, e.z + e.dz * .2, e.dx * (1 + Math.random() * 1.6) - e.dz * side, .3 + Math.random() * .5, e.dz * (1 + Math.random() * 1.6) + e.dx * side, .22, i % 2 ? STEEL : IVORY, .02); }
   this.cuts.push({ kind: 'glint', id: e.id, x: e.x, z: e.z, y: y + .62, born: this.clock, life: .3, size: .3 });
   return;
  }
  if (e.type === 'sheathDrawTell') {
   if (!this.seen(e.x, e.z) && !this.seen(e.x + e.dx * e.length, e.z + e.dz * e.length)) return;
   // The tell: a gold line runs out along the ground to where the dash will
   // end (everyone sees it: time to step off), and the guard flares.
   const y = floorY(v, e.x, e.z, e.below);
   this.cuts.push({ kind: 'tell', ...e, born: this.clock, life: (e.tell || SHEATH.xTell) + e.length / SHEATH.xDashSpeed + .08 });
   this.cuts.push({ kind: 'glint', id: e.id, x: e.x, z: e.z, y: y + .62, born: this.clock, life: (e.tell || SHEATH.xTell) + .05, size: .55 });
   return;
  }
  if (e.type === 'sheathDrawDash') {
   // Off: a gold burst where you left from; the dash itself leaves a gold
   // wake and afterimages (updateDashes, following the body).
   const y = floorY(v, e.x, e.z, e.below);
   if (this.seen(e.x, e.z)) {
    for (let i = 0; i < 14 * this.detail; i++) { const a = i * 2.4, r = 1.5 + Math.random() * 2; this.spark(e.x, y + .2 + Math.random() * .9, e.z, Math.cos(a) * r - e.dx * 2, .5 + Math.random(), Math.sin(a) * r - e.dz * 2, .22 + Math.random() * .15, i % 3 ? GOLD : WHITE, .028); }
    this.cuts.push({ kind: 'ring', x: e.x, z: e.z, y: y + .06, born: this.clock, color: GOLD, life: .3, from: .2, to: 1.3 });
   }
   this.dashes.set(e.id, { ...e, born: this.clock, ghostAt: -1, ended: false });
   return;
  }
  if (e.type === 'sheathDrawCut') { this.drawCut(e); return; }
  if (e.type === 'sheathRush') {
   if (!this.seen(e.x, e.z)) return;
   const y = floorY(v, e.x, e.z, e.below);
   for (let i = 0; i < 18 * this.detail; i++) { const a = i * .7, r = 1.5 + Math.random() * 2.5; this.spark(e.x + Math.cos(a) * .3, y + .1 + Math.random() * 1.1, e.z + Math.sin(a) * .3, Math.cos(a) * r, 1.5 + Math.random() * 2, Math.sin(a) * r, .3 + Math.random() * .25, i % 2 ? GOLD : YELLOW, .028); }
   this.cuts.push({ kind: 'ring', x: e.x, z: e.z, y: y + .06, born: this.clock, color: GOLD, life: .45, from: .3, to: 2.4 });
   return;
  }
  if (e.type === 'sheathRushEnd') {
   if (!this.seen(e.x, e.z)) return;
   const y = floorY(v, e.x, e.z, e.below);
   this.cuts.push({ kind: 'ring', x: e.x, z: e.z, y: y + .06, born: this.clock, color: DEEP_GOLD, life: .35, from: 1.2, to: .2 });
   for (let i = 0; i < 8 * this.detail; i++) { const a = i * .8; this.spark(e.x + Math.cos(a) * .9, y + .2 + Math.random() * .8, e.z + Math.sin(a) * .9, -Math.cos(a) * 1.8, .8, -Math.sin(a) * 1.8, .3, GOLD, .022); }
  }
 }

 // A hit from a Sheath (the event carries the swing's direction).
 hit(e) {
  const v = this.view, y = floorY(v, e.x, e.z, e.below), dx = e.dx ?? 1, dz = e.dz ?? 0, mine = this.own(e) && e.by === v.lastSim?.player.id;
  if (mine) {
   // The attacker feels it: the blade stops for a moment in the body and
   // the view is pushed the way the swing was going.
   this.stop = Math.max(this.stop, e.draw ? .06 : .05);
   if (v.kick) { v.kick.x += dx * (e.draw ? .2 : .13); v.kick.z += dz * (e.draw ? .2 : .13); }
   v.shake = Math.max(v.shake || 0, e.draw ? .09 : .045);
  }
  if (e.id === v.lastSim?.player.id && v.kick) { v.kick.x += dx * .1; v.kick.z += dz * .1; v.shake = Math.max(v.shake || 0, .05); }
  // The body flinches away along the swing.
  this.flinches.set(e.id, { dx, dz, born: this.clock, power: e.draw ? 1.6 : 1 });
  if (!this.seen(e.x, e.z)) return;
  if (e.targetKind === 'robot') {
   const avatar = v.remote?.avatars.get(e.id), n = Math.round(16 * this.detail);
   for (let i = 0; i < n; i++) { const side = (Math.random() - .5) * 3, push = 2 + Math.random() * 3.5; this.spark(e.x, y + .78, e.z, dx * push - dz * side, 1 + Math.random() * 2, dz * push + dx * side, .2 + Math.random() * .2, i % 2 ? YELLOW : BLUE, .024); }
   v.burst?.(e.x, e.z, 8, 'hit', avatar ? new THREE.Color(avatar.colours.coat) : null);
   return;
  }
  if (e.targetKind !== 'player') { v.burst?.(e.x, e.z, 6, 'hit'); return; }
  // People: a spray thrown along the swing (the Ichor view's pooled blood,
  // which lands, stains walls and floors and is capped per preset).
  const ichor = v.ichorView, count = Math.round((e.draw ? 46 : 30) * this.detail);
  if (ichor) {
   ichor.bloodSpray(e.x, e.z, y + .9, dx, dz, count, e.below, { heavy: true, stain: true });
   ichor.bloodSpray(e.x, e.z, y + .7, dx * .6 - dz * .4, dz * .6 + dx * .4, Math.round(count / 3), e.below, { stain: true });
  }
  // A thin red slash mark across the body where the blade passed.
  this.cuts.push({ kind: 'nick', x: e.x, z: e.z, y: y + .85, dx, dz, born: this.clock, life: .22 });
 }

 spark(x, y, z, vx, vy, vz, life, color, width) { if (this.lines.length >= 260) this.lines.shift(); this.lines.push({ x, y, z, vx, vy, vz, born: this.clock, life, color, width }); }
 addGhost(x, y, z, yaw, color, life, scale = 1) { if (this.ghostList.length >= 40) this.ghostList.shift(); this.ghostList.push({ x, y, z, yaw, color, born: this.clock, life, scale }); }

 drawCut(e) {
  const v = this.view, dash = this.dashes.get(e.id);
  if (dash) { dash.ended = true; dash.endedAt = this.clock; dash.x1 = e.x1; dash.z1 = e.z1; }
  const y0 = floorY(v, e.x0, e.z0, e.below), y1 = floorY(v, e.x1, e.z1, e.below);
  this.cuts.push({ kind: 'line', ...e, y0, y1, born: this.clock, life: .7 });
  if (this.seen(e.x0, e.z0) || this.seen(e.x1, e.z1)) this.goldSlash(e);
  // Gold and white shards thrown off the line, and a burst where you land.
  const count = Math.round(40 * this.detail), length = Math.hypot(e.ex - e.x0, e.ez - e.z0);
  for (let i = 0; i < count; i++) {
   const f = Math.random(), x = e.x0 + e.dx * length * f, z = e.z0 + e.dz * length * f, side = i % 2 ? 1 : -1, push = 1.5 + Math.random() * 3.5;
   if (this.seen(x, z)) this.spark(x, floorY(v, x, z, e.below) + .5 + Math.random() * .6, z, -e.dz * side * push + e.dx * 1.5, .5 + Math.random() * 1.5, e.dx * side * push + e.dz * 1.5, .25 + Math.random() * .3, i % 3 === 0 ? WHITE : i % 3 === 1 ? GOLD : YELLOW, .03);
  }
  if (this.seen(e.x1, e.z1)) {
   for (let i = 0; i < 16 * this.detail; i++) { const a = i * 2.4, r = 2 + Math.random() * 2.5; this.spark(e.x1, y1 + .3 + Math.random() * .8, e.z1, Math.cos(a) * r + e.dx * 2, 1 + Math.random() * 1.5, Math.sin(a) * r + e.dz * 2, .3 + Math.random() * .2, i % 2 ? GOLD : SPARK, .026); }
   this.cuts.push({ kind: 'ring', x: e.x1, z: e.z1, y: y1 + .06, born: this.clock, color: GOLD, life: .5, from: .4, to: 2.6 });
   this.cuts.push({ kind: 'ring', x: e.x1, z: e.z1, y: y1 + .07, born: this.clock, color: WHITE, life: .25, from: .2, to: 1.6 });
  }
  if (this.own(e)) { v.shake = Math.max(v.shake || 0, .16); v.shakeDecay = 11; }
 }

 // The gold slash: a huge crescent laid along the whole line where the dash
 // went, bowed a little and rising at one edge, engraved with the gold pattern. It
 // sweeps in along the dash's direction in a few hundredths, holds, then
 // burns off from the end it started at (updateSlashes).
 goldSlash(e) {
  const v = this.view, length = Math.hypot(e.ex - e.x0, e.ez - e.z0); if (length < .3) return;
  let slot = this.slashList.length < SLASH_POOL ? this.slashes.find(m => !this.slashList.some(s => s.mesh === m)) : null;
  if (!slot) { const oldest = this.slashList.shift(); slot = oldest.mesh; }
  const g = slot.geometry, pos = g.attributes.position, uv = g.attributes.uv, sx = -e.dz, sz = e.dx;
  const bow = Math.min(.25, .05 + length * .03), W = Math.min(1.1, .5 + length * .08), n = SLASH_SEGMENTS, rows = [];
  for (let i = 0; i <= n; i++) {
   const u = i / n, k = Math.sin(Math.PI * u), taper = Math.pow(k, .75), along = length * u;
   const cx = e.x0 + e.dx * along, cz = e.z0 + e.dz * along, y = floorY(v, cx, cz, e.below) + .62 + k * .28;
   // Laid on the dash's own path (owner: "in place of where it happened"),
   // straddling the line with only a slight bow, so the mark sits where the
   // body went.
   const inner = bow * k - W * taper * .55, outer = bow * k + W * taper * .55;
   rows.push([cx + sx * inner, y - .04 * taper, cz + sz * inner, cx + sx * outer, y + .3 * taper, cz + sz * outer, along / SLASH_REPEAT]);
  }
  let k = 0;
  const put = (r, outer) => { const o = outer ? 3 : 0; pos.setXYZ(k, r[o], r[o + 1], r[o + 2]); uv.setXY(k, r[6], outer ? 1 : 0); k++; };
  for (let i = 0; i < n; i++) { const a = rows[i], b = rows[i + 1]; put(a, 0); put(a, 1); put(b, 1); put(a, 0); put(b, 1); put(b, 0); }
  g.setDrawRange(0, k); pos.needsUpdate = uv.needsUpdate = true;
  this.slashList.push({ mesh: slot, born: this.clock, life: SLASH_LIFE, count: k });
 }
 updateSlashes(dt) {
  this.slashList = this.slashList.filter(s => this.clock - s.born < s.life);
  for (const m of this.slashes) m.count = 0;
  for (const s of this.slashList) {
   const age = this.clock - s.born, m = s.mesh, col = m.geometry.attributes.color, n = SLASH_SEGMENTS;
   // The sweep in (front runs start to end), the hold, the burn-off (the
   // start end first) and a flash as it lands.
   const front = Math.min(1.08, age / .07), flash = 1 + Math.max(0, 1 - age / .12) * .8;
   const alphaAt = u => {
    const reveal = Math.max(0, Math.min(1, (front - u) / .08));
    const burn = Math.max(0, Math.min(1, 1 - (age - SLASH_HOLD - (1 - u) * .12) / (s.life - SLASH_HOLD - .12)));
    return reveal * burn * burn * Math.pow(Math.sin(Math.PI * u), .35);
   };
   let k = 0;
   for (let i = 0; i < n; i++) {
    const a0 = alphaAt(i / n), a1 = alphaAt((i + 1) / n);
    for (const a of [a0, a0, a1, a0, a1, a1]) { col.setXYZW(k++, flash, flash, flash, a); }
   }
   col.needsUpdate = true;
   // The engraving drifts along the slash as it fades.
   m.material.map.offset.x -= dt * .5;
   m.count = s.count;
  }
  for (const m of this.slashes) m.geometry.setDrawRange(0, m.count);
 }

 // Gold Rush's extension (sheath-model.js animates the blade itself): a burst
 // of white and gold as it pops in, motes shed while it is out, and when it
 // goes, the gold blade dissolves into drifting particles.
 extensionFx(pack, id, root = null) {
  const ext = pack.getObjectByName('sheath-extension'), m = pack.userData.motion; if (!ext || !m) return;
  const on = !!m.extOn, was = pack.userData.extWas; pack.userData.extWas = on;
  if ((root && !root.visible) || !pack.visible) return;
  if (on === was && !on) return;
  ext.updateWorldMatrix(true, false);
  const point = (u, spread = .07) => this.a.set((Math.random() * 2 - 1) * spread, (Math.random() - .5) * .03, -(BLADE_START + EXTENSION_LENGTH * u)).applyMatrix4(ext.matrixWorld);
  if (!this.seen(ext.matrixWorld.elements[12], ext.matrixWorld.elements[14])) return;
  if (on && !was) {
   for (let i = 0; i < 22 * this.detail; i++) { const q = point(Math.random()), a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 2.5; this.spark(q.x, q.y, q.z, Math.cos(a) * r, .6 + Math.random() * 1.8, Math.sin(a) * r, .16 + Math.random() * .12, i % 2 ? WHITE : YELLOW, .022); }
  } else if (!on && was) {
   // Dissolving: many slow motes along the whole gold blade, rising.
   for (let i = 0; i < 46 * this.detail; i++) { const q = point(.05 + Math.random() * .95, .09); this.spark(q.x, q.y, q.z, (Math.random() - .5) * .9, 1.4 + Math.random() * 1.6, (Math.random() - .5) * .9, .45 + Math.random() * .5, i % 3 === 0 ? SPARK : i % 3 === 1 ? GOLD : YELLOW, .016 + Math.random() * .012); }
  } else if (Math.random() < .55 * this.detail) {
   const q = point(.45 + Math.random() * .55, .08); this.spark(q.x, q.y, q.z, (Math.random() - .5) * .4, .8 + Math.random() * .8, (Math.random() - .5) * .4, .35 + Math.random() * .25, Math.random() < .5 ? GOLD : YELLOW, .014);
  }
 }

 // The dash: a gold wake at chest height from where it left to the body,
 // and gold afterimages every few hundredths.
 updateDashes() {
  const v = this.view;
  for (const [id, d] of this.dashes) {
   const age = this.clock - d.born, after = d.ended ? this.clock - d.endedAt : 0;
   if (after > .3 || age > 1) { this.dashes.delete(id); continue; }
   const who = this.avatarOf(id), land = Math.max(0, d.length - SHEATH.xShort);
   let x, z;
   if (d.ended) { x = d.x1; z = d.z1; }
   else if (who?.root.visible) { x = who.root.position.x; z = who.root.position.z; }
   else { const t = Math.min(land, age * SHEATH.xDashSpeed); x = d.x + d.dx * t; z = d.z + d.dz * t; }
   if (!d.ended && this.clock - d.ghostAt > .022 && this.seen(x, z)) { d.ghostAt = this.clock; this.addGhost(x, floorY(v, x, z, d.below), z, Math.atan2(-d.dx, -d.dz), GOLD, .3, 1.02); }
   const fade = 1 - after / .3, pts = [], core = [], n = 10;
   for (let i = 0; i <= n; i++) {
    const u = i / n, px = d.x + (x - d.x) * u, pz = d.z + (z - d.z) * u; if (!this.seen(px, pz)) continue;
    const y = floorY(v, px, pz, d.below) + .85, w = .05 + .22 * u;
    pts.push([px, y, pz, w, .55 * fade * u]); core.push([px, y + .01, pz, w * .25, .9 * fade * u]);
   }
   this.band(pts, GOLD); this.band(core, WHITE);
  }
 }

 // The world-space point and middle of a blade in `pose`, for a body whose
 // root matrix is `root`.
 bladeAt(root, pose, reach = 1) {
  const rig = this.rig; rig.matrixAutoUpdate = false; rig.matrix.copy(root.matrixWorld); rig.matrixWorld.copy(root.matrixWorld);
  const body = this.rigBody; body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); body.scale.set(1, 1, 1);
  applySheathBody(body, { spin: pose[6], lean: pose[7], bank: pose[8], dip: pose[9], step: pose[10] });
  const blade = this.rigBlade; blade.position.set(pose[0], pose[1], pose[2]); this.euler.set(pose[4], pose[3], pose[5], 'YXZ'); blade.quaternion.setFromEuler(this.euler);
  body.updateMatrixWorld(true);
  this.tip.set(0, 0, -(BLADE_START + BLADE_LENGTH * reach) + .03).applyMatrix4(blade.matrixWorld);
  this.mid.set(0, 0, -(BLADE_START + BLADE_LENGTH * reach * .38)).applyMatrix4(blade.matrixWorld);
 }

 // One swing's trail: the arc the point swept, drawn from TRAIL_REACH of
 // the swing behind the blade up to the blade, each part fading TRAIL_LIFE s
 // after the blade passed it, thick in the middle, tapering at both ends.
 trail(sw, root, age) {
  const duration = sw.duration || SHEATH.interval, now = age / duration, [A, B] = sheathStrike(sw.variant);
  const from = Math.max(A - .035, now - TRAIL_REACH), to = Math.min(now, B + .18);
  if (to <= from) return;
  const n = Math.max(12, Math.min(60, Math.round(44 * this.detail))), tips = this.samplesTip, mids = this.samplesMid, ages = this.samplesAge;
  for (let i = 0; i <= n; i++) {
   const t = from + (to - from) * i / n;
   sheathSwingPose(sw.variant, t, this.pose); this.bladeAt(root, this.pose, sw.rush ? EXTENSION_LENGTH / BLADE_LENGTH : 1);
   tips[i * 3] = this.tip.x; tips[i * 3 + 1] = this.tip.y; tips[i * 3 + 2] = this.tip.z;
   mids[i * 3] = this.mid.x; mids[i * 3 + 1] = this.mid.y; mids[i * 3 + 2] = this.mid.z;
   ages[i] = (now - t) * duration;
  }
  const bloody = (sw.blood || 0) > .45, heavy = sw.variant === 5 || sw.variant === 4, body = sw.rush ? this.scratch.copy(IVORY).lerp(GOLD, .7) : bloody ? this.scratch.copy(IVORY).lerp(RED, .28) : IVORY;
  // (With Gold Rush's extension the arc is twice as long and gold, with a
  // white edge and a second gold band where the steel blade ends.)
  this.strip(n, heavy ? .6 : .5, body, .92, 0, .42);
  // The bright, solid edge along the point's own path.
  this.strip(n, sw.rush ? .05 : .09, WHITE, 1, 0, .85);
  if (sw.rush) this.strip(n, .06, YELLOW, .75, .5, .6);
  // Heavy swings (and the draw) leave a faint second edge further in.
  if (heavy || sw.draw) this.strip(n, .05, STEEL, .55, .55, .5);
 }
 // A band from the tip line inward toward the middle line, `width` of the
 // way at its thickest.
 strip(n, width, color, alpha, inset, inner = .15) {
  const m = this.ribbons, pos = m.geometry.attributes.position, col = m.geometry.attributes.color, tips = this.samplesTip, mids = this.samplesMid, ages = this.samplesAge;
  const put = (x, y, z, a) => { const k = m.count++; pos.setXYZ(k, x, y, z); col.setXYZW(k, color.r, color.g, color.b, a); };
  for (let i = 0; i < n; i++) {
   if (m.count + 6 > RIBBON_VERTS) return;
   const edge = j => { const u = j / n, taper = Math.pow(Math.sin(Math.PI * u), .75), w = width * taper, fade = Math.max(0, 1 - ages[j] / TRAIL_LIFE); return { w, a: alpha * fade * Math.min(1, taper * 2.2) }; };
   const e0 = edge(i), e1 = edge(i + 1);
   if (e0.a <= .01 && e1.a <= .01) continue;
   const o = (j, w) => { const k = j * 3, s = inset; return [tips[k] + (mids[k] - tips[k]) * s, tips[k + 1] + (mids[k + 1] - tips[k + 1]) * s, tips[k + 2] + (mids[k + 2] - tips[k + 2]) * s, tips[k] + (mids[k] - tips[k]) * (s + w), tips[k + 1] + (mids[k + 1] - tips[k + 1]) * (s + w), tips[k + 2] + (mids[k + 2] - tips[k + 2]) * (s + w)]; };
   const p0 = o(i, e0.w), p1 = o(i + 1, e1.w);
   put(p0[0], p0[1], p0[2], e0.a); put(p0[3], p0[4], p0[5], e0.a * inner); put(p1[3], p1[4], p1[5], e1.a * inner);
   put(p0[0], p0[1], p0[2], e0.a); put(p1[3], p1[4], p1[5], e1.a * inner); put(p1[0], p1[1], p1[2], e1.a);
  }
 }
 // A flat band on the ground plane along a path of points (x, y, z) with a
 // width and alpha for each: the Draw-cut's line and the Gold Rush ribbon.
 band(points, color) {
  const m = this.ribbons, pos = m.geometry.attributes.position, col = m.geometry.attributes.color;
  for (let i = 0; i + 1 < points.length; i++) {
   if (m.count + 6 > RIBBON_VERTS) return;
   const [ax, ay, az, aw, aa] = points[i], [bx, by, bz, bw, ba] = points[i + 1];
   let dx = bx - ax, dz = bz - az; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
   const put = (x, y, z, a) => { const k = m.count++; pos.setXYZ(k, x, y, z); col.setXYZW(k, color.r, color.g, color.b, a); };
   put(ax - dz * aw, ay, az + dx * aw, aa); put(ax + dz * aw, ay, az - dx * aw, aa); put(bx + dz * bw, by, bz - dx * bw, ba);
   put(ax - dz * aw, ay, az + dx * aw, aa); put(bx + dz * bw, by, bz - dx * bw, ba); put(bx - dz * bw, by, bz + dx * bw, ba);
  }
 }
 line(ax, ay, az, bx, by, bz, width, color) {
  const m = this.lineBatch, i = m.count; if (i >= 700) return;
  const d = this.dummy; this.a.set(ax, ay, az); this.b.set(bx, by, bz).sub(this.a);
  const length = this.b.length(); if (length < 1e-4) return;
  d.position.copy(this.a).addScaledVector(this.b, .5); d.quaternion.setFromUnitVectors(this.up, this.b.divideScalar(length)); d.scale.set(width, length, width * .6); d.updateMatrix();
  m.setMatrixAt(i, d.matrix); m.setColorAt(i, color); m.count++;
 }

 update(sim, dt) {
  const v = this.view, p = sim.player; this.clock += dt;
  for (const m of this.meshes) m.count = 0;
  const holding = sim.weapon === 'sheath' && !p.dead;
  this.model.visible = holding;
  // The attacker's hit-stop: the blade is held back for a moment, then
  // catches up over the next few hundredths.
  if (this.stop > 0) { this.stop = Math.max(0, this.stop - dt); this.lag = Math.min(.06, this.lag + dt); }
  else this.lag = Math.max(0, this.lag - dt * .7);
  if (holding) {
   const s = sim.sheath, shown = this.lag > 0 && s.swing > 0 ? { ...s, swing: Math.min(s.duration, s.swing + this.lag) } : s;
   const pose = poseSheath(this.model, shown, this.clock, Math.min(1, Math.hypot(p.vx, p.vz) / 5));
   v.rifleView.pose.update(sim, 0, 0, 0);
   applySheathBody(v.player.userData.body, pose);
  }
  if (!p.dead) this.flinch(v.player.userData.body, p.id);
  if (this.wasHolding && !holding) releaseSheathBody(v.player.userData.body);
  this.wasHolding = holding;
  // Swing trails, on whoever swung.
  this.swings = this.swings.filter(sw => this.clock - sw.born < (sw.duration || SHEATH.interval) + TRAIL_LIFE);
  for (const sw of this.swings) {
   const who = this.avatarOf(sw.id); if (!who?.root.visible || !this.seen(sw.x, sw.z)) continue;
   who.frame.updateWorldMatrix(true, false);
   const mine = sw.id === p.id, age = this.clock - sw.born - (mine ? this.lag : 0);
   if (age > 0) this.trail(sw, who.frame, age);
  }
  this.extensionFx(this.model, p.id);
  for (const [id, a] of this.view.remote?.avatars || []) { const pack = a.hand?.getObjectByName?.('sheath-loadout'); if (pack) this.extensionFx(pack, id, a.root); }
  this.updateCuts(sim);
  this.updateDashes();
  this.updateSlashes(dt);
  this.updateRush(sim);
  // Sparks and shards.
  this.lines = this.lines.filter(l => this.clock - l.born < l.life);
  for (const l of this.lines) {
   const t = this.clock - l.born, f = 1 - t / l.life, x = l.x + l.vx * t, y = Math.max(floorY(v, x, l.z + l.vz * t) + .02, l.y + l.vy * t - 4.5 * t * t), z = l.z + l.vz * t;
   this.line(x, y, z, x - l.vx * .03, y - (l.vy - 9 * t) * .03, z - l.vz * .03, l.width * (.4 + .6 * f), this.scratch.copy(l.color).multiplyScalar(.55 + .45 * f));
  }
  // Afterimages.
  this.ghostList = this.ghostList.filter(g => this.clock - g.born < g.life);
  for (const g of this.ghostList) {
   const i = this.ghosts.count; if (i >= 48) break;
   const f = 1 - (this.clock - g.born) / g.life, d = this.dummy;
   d.position.set(g.x, g.y, g.z); d.rotation.set(0, g.yaw, 0); d.scale.set(g.scale, g.scale * (1 + (1 - f) * .06), g.scale); d.updateMatrix();
   this.ghosts.setMatrixAt(i, d.matrix); this.ghosts.setColorAt(i, this.scratch.copy(g.color).multiplyScalar(.32 * f * f)); this.ghosts.count++;
  }
  for (const [id, f] of this.flinches) if (this.clock - f.born > .3) this.flinches.delete(id);
  for (const m of this.meshes) {
   m.visible = m.count > 0;
   if (m === this.ribbons) { m.geometry.setDrawRange(0, m.count); if (m.count) { m.geometry.attributes.position.needsUpdate = m.geometry.attributes.color.needsUpdate = true; } }
   else if (m.count && m.isInstancedMesh) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
 }
 // A body hit by a Sheath jolts away along the swing and settles (you, and
 // remote-players.js asks for the others).
 flinch(body, id) {
  const f = this.flinches.get(id); if (!f || !body) return;
  const t = (this.clock - f.born) / .26; if (t >= 1) return;
  // A tilt away from the blow and a small drop (rotation and height only:
  // those are set afresh every frame for every body, so nothing builds up).
  const k = Math.sin(Math.min(1, t) * Math.PI) * (1 - t) * .22 * f.power;
  const root = body.parent, yaw = root ? root.rotation.y : 0, c = Math.cos(yaw), s = Math.sin(yaw);
  // The blow's direction in the body's own frame.
  const lx = f.dx * c - f.dz * s, lz = f.dx * s + f.dz * c;
  body.rotation.z -= lx * k; body.rotation.x += lz * k; body.position.y -= k * .12;
 }

 updateCuts(sim) {
  const v = this.view;
  this.cuts = this.cuts.filter(c => this.clock - c.born < c.life);
  for (const c of this.cuts) {
   const age = this.clock - c.born, q = age / c.life;
   if (c.kind === 'ring') {
    const r = c.from + (c.to - c.from) * (1 - (1 - q) * (1 - q)), a = (1 - q) * .8, pts = [];
    for (let i = 0; i <= 28; i++) { const u = i / 28 * Math.PI * 2; pts.push([c.x + Math.cos(u) * r, c.y, c.z + Math.sin(u) * r, .05 + .05 * (1 - q), a]); }
    this.band(pts, c.color);
   } else if (c.kind === 'nick') {
    // A short red stroke across where the blade went through.
    const a = Math.max(0, 1 - q), len = .55, sx = -c.dz, sz = c.dx;
    this.line(c.x - c.dx * len * .5 + sx * .1, c.y + .1, c.z - c.dz * len * .5 + sz * .1, c.x + c.dx * len * .5 - sx * .1, c.y - .08, c.z + c.dz * len * .5 - sz * .1, .045 * a, RED);
   } else if (c.kind === 'line') this.drawCutLine(c, age, q);
   else if (c.kind === 'tell') this.tellLine(c, age);
   else if (c.kind === 'glint') {
    // A four-point gold star at the guard (following the body).
    const who = this.avatarOf(c.id), x = who?.root.visible ? who.root.position.x : c.x, z = who?.root.visible ? who.root.position.z : c.z;
    if (!this.seen(x, z)) continue;
    const r = c.size * Math.sin(Math.PI * Math.min(1, q * 1.1)) * (1 + .15 * Math.sin(age * 60)), turn = age * 3;
    for (let j = 0; j < 4; j++) { const a = turn + j * Math.PI / 4, l = j % 2 ? r * .5 : r; this.line(x - Math.cos(a) * l, c.y, z - Math.sin(a) * l, x + Math.cos(a) * l, c.y, z + Math.sin(a) * l, j % 2 ? .02 : .035, j % 2 ? GOLD : SPARK); }
   }
  }
 }
 // Under the gold slash: two thin edges that split apart from the line and
 // linger, and a gold scar along the ground.
 drawCutLine(c, age, q) {
  const v = this.view, length = Math.hypot(c.ex - c.x0, c.ez - c.z0); if (length < .2) return;
  const n = Math.max(10, Math.round(26 * this.detail)), edgeA = [], edgeB = [], sx = -c.dz, sz = c.dx;
  for (let i = 0; i <= n; i++) {
   const u = i / n, x0 = c.x0 + c.dx * length * u, z0 = c.z0 + c.dz * length * u, bow = Math.sin(Math.PI * u) * .35, x = x0 + sx * bow, z = z0 + sz * bow;
   const y = floorY(v, x, z, c.below) + .75 + Math.sin(Math.PI * u) * .12, taper = Math.pow(Math.sin(Math.PI * u), .6);
   const w = .018 + .02 * (1 - q), a = (1 - q) * taper;
   edgeA.push([x + sx * (.22 + q * .5), y + .02, z + sz * (.22 + q * .5), w, a]); edgeB.push([x - sx * (.22 + q * .5), y - .02, z - sz * (.22 + q * .5), w, a]);
  }
  this.band(edgeA, YELLOW); this.band(edgeB, IVORY);
  const g = []; for (let i = 0; i <= 16; i++) { const u = i / 16, x = c.x0 + c.dx * length * u, z = c.z0 + c.dz * length * u; g.push([x, floorY(v, x, z, c.below) + .05, z, .08 * Math.pow(Math.sin(Math.PI * u), .5) * (1 - q * .5), (1 - q) * .6]); }
  this.band(g, DEEP_GOLD);
 }
 // The tell: a gold line runs out along the ground over the set, pulsing,
 // with chevrons pointing the way; it is eaten by the dash as it passes.
 tellLine(c, age) {
  const v = this.view, tell = c.tell || SHEATH.xTell, run = Math.min(1, age / (tell * .55)), eaten = Math.max(0, (age - tell) * SHEATH.xDashSpeed) / Math.max(.1, c.length);
  const pulse = .5 + .5 * Math.sin(age * 38), a = (.35 + .25 * pulse) * (age > tell ? .6 : 1), pts = [];
  for (let i = 0; i <= 14; i++) {
   const u = eaten + (run - eaten) * i / 14; if (u > run || u < 0) continue;
   const x = c.x + c.dx * c.length * u, z = c.z + c.dz * c.length * u; if (!this.seen(x, z)) continue;
   pts.push([x, floorY(v, x, z, c.below) + .045, z, .075, a * Math.min(1, (run - u) * 8 + .4)]);
  }
  this.band(pts, GOLD);
  const sx = -c.dz, sz = c.dx;
  for (let d = .9; d < c.length * run; d += .9) {
   if (d < c.length * eaten) continue;
   const x = c.x + c.dx * d, z = c.z + c.dz * d; if (!this.seen(x, z)) continue;
   const y = floorY(v, x, z, c.below) + .05, bx = x - c.dx * .22, bz = z - c.dz * .22;
   this.line(bx + sx * .18, y, bz + sz * .18, x, y, z, .03, YELLOW); this.line(bx - sx * .18, y, bz - sz * .18, x, y, z, .03, YELLOW);
  }
  // The far end: a small gold ring where the dash will stop.
  if (age < tell + .05) { const ex = c.x + c.dx * Math.max(0, c.length - SHEATH.xShort), ez = c.z + c.dz * Math.max(0, c.length - SHEATH.xShort), r = .35 + .1 * pulse, ring = []; if (this.seen(ex, ez)) { const y = floorY(v, ex, ez, c.below) + .05; for (let i = 0; i <= 20; i++) { const t = i / 20 * Math.PI * 2; ring.push([ex + Math.cos(t) * r, y, ez + Math.sin(t) * r, .03, a * run]); } this.band(ring, GOLD); } }
 }

 // Gold Rush: a fading ribbon at the feet of every rushing Sheath, and
 // faint gold afterimages behind them. Other players see it too (their
 // `sheath.rush` in the snapshot).
 updateRush(sim) {
  const p = sim.player;
  if (sim.weapon === 'sheath' || this.goldPaths.has(p.id)) this.rushPath(p.id, p.x, p.z, !!p.below, sim.weapon === 'sheath' && sim.sheath.rush > 0 && !p.dead, p.vx, p.vz);
  for (const b of this.view.remotePlayers || []) if (b.weapon === 'sheath' || this.goldPaths.has(b.id)) this.rushPath(b.id, b.x, b.z, !!b.below, b.weapon === 'sheath' && b.sheath?.rush > 0 && !(b.hp <= 0), b.vx || 0, b.vz || 0);
 }
 rushPath(id, bx, bz, below, rushing, vx, vz) {
  const v = this.view;
  let path = this.goldPaths.get(id);
  if (rushing) {
   if (!path) this.goldPaths.set(id, path = { points: [], ghostAt: 0, band: [] });
   const who = this.avatarOf(id), x = who ? who.root.position.x : bx, z = who ? who.root.position.z : bz, last = path.points[path.points.length - 1];
   if (!last || Math.hypot(x - last.x, z - last.z) > .18) { path.points.push({ x, z, below, born: this.clock }); if (path.points.length > 60) path.points.shift(); }
   if (this.clock - path.ghostAt > .11 && Math.hypot(vx, vz) > 1 && who?.root.visible) { path.ghostAt = this.clock; this.addGhost(x, floorY(v, x, z, below), z, who.frame.rotation.y, GOLD, .34, 1); }
  }
  if (!path) return;
  while (path.points.length && this.clock - path.points[0].born >= .7) path.points.shift();
  if (!path.points.length && !rushing) { this.goldPaths.delete(id); return; }
  const pts = path.band; pts.length = 0;
  for (let i = 0; i < path.points.length; i++) {
   const q = path.points[i], f = 1 - (this.clock - q.born) / .7, u = i / Math.max(1, path.points.length - 1);
   if (this.seen(q.x, q.z)) pts.push([q.x, floorY(v, q.x, q.z, q.below) + .07, q.z, .15 * f * Math.min(1, u * 3), .58 * f * f]);
  }
  this.band(pts, GOLD);
  // Motes rising off the ribbon.
  if (rushing && Math.random() < .5 * this.detail && path.points.length > 2) { const q = path.points[path.points.length - 2]; this.spark(q.x + (Math.random() - .5) * .4, floorY(v, q.x, q.z, q.below) + .1, q.z + (Math.random() - .5) * .4, (Math.random() - .5) * .4, .9 + Math.random() * .8, (Math.random() - .5) * .4, .45, Math.random() < .5 ? GOLD : YELLOW, .02); }
 }
}
