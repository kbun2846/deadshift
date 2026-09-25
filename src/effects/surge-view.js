// Nominal's Surge on screen (weapons/surge.js has the rules).
//
// Power-up (SURGE.charge, 2 s): yellow beams race in over the ground from
// all round, spiralling a little, kicking dust; they whiten as they close in
// and meet on the player in a white flash (that is when nearby breakables
// break). Then the power lands: a burst of white light and a ring, and for
// SURGE.duration the player and their gun burn bright white, shivering, with
// white and gold sparks lifting off them. On Quality and Extreme a light
// travels with them.
//
// Cheap on purpose, since several players can surge at once while hexes are
// going off:
//  - every beam of every surge is one instance of one mesh (one draw);
//  - the white body is the player's own geometry drawn again with one shared
//    unlit material (a handful of draws, no new shaders);
//  - sparks, dust and flashes go through the shared detail-effect pools,
//    throttled per surge and scaled by the preset;
//  - no light of its own: a point light costs every lit pixel on screen (it
//    halved the frame rate in tests), so the surge borrows the one effects
//    light the game already has (your surge first), Quality and Extreme only.
import * as THREE from 'three';
import { SURGE } from '../config/gameplay.js';
import { isDemanding } from '../settings.js';

export const SURGE_VIEW = Object.freeze({ slots: 6, beams: 14, radius: 6.8, light: 9 });
const YELLOW = new THREE.Color('#ffd23f'), GOLD = new THREE.Color('#ffb21f'), WHITE = new THREE.Color('#ffffff');
const GOLD_STOPS = [new THREE.Color('#ffffff'), new THREE.Color('#fff2b0'), new THREE.Color('#ffd23f'), new THREE.Color('#b77a10')];
const WHITE_STOPS = [new THREE.Color('#ffffff'), new THREE.Color('#ffffff'), new THREE.Color('#fff6cf'), new THREE.Color('#d9c27a')];
const tmp = new THREE.Color(), dummy = new THREE.Object3D(), WHERE = new THREE.Vector3(), SHELL_INVERSE = new THREE.Matrix4();
const PILLAR = new THREE.Color('#fff3c2'), BREAK_RING = new THREE.Color('#fff0b0');
// The effect pools keep the colour they are given (by reference), so each
// gathering glow gets its own from a small ring rather than a shared scratch.
const GLOW_RING = Array.from({ length: 24 }, () => new THREE.Color()); let glowNext = 0;
const ease = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

function beamTexture() {
 const c = document.createElement('canvas'); c.width = 8; c.height = 64;
 const g = c.getContext('2d'), grad = g.createLinearGradient(0, 64, 0, 0);
 grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(.7, 'rgba(255,255,255,.55)'); grad.addColorStop(1, 'rgba(255,255,255,1)');
 g.fillStyle = grad; g.fillRect(0, 0, 8, 64);
 const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// The Surge "nova" (when the power lands), drawn once into canvases:
//  - crown: a sunburst of 14 long, jagged, forked rays of light, hot white at
//    the heart through gold to amber at the tips, uneven lengths;
//  - shock: a ragged wave front, not a clean circle: a torn band whose
//    thickness wanders, with breaks, a trail of crackle and scattered motes.
// Seeded, so every nova looks the same (the motion makes it lively).
function novaTexture(kind) {
 const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
 const g = c.getContext('2d'), m = S / 2;
 let seed = kind === 'crown' ? 17 : 91; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
 g.globalCompositeOperation = 'lighter';
 if (kind === 'crown') {
  const heart = g.createRadialGradient(m, m, 0, m, m, m * .26);
  heart.addColorStop(0, 'rgba(255,255,255,.95)'); heart.addColorStop(.35, 'rgba(255,240,190,.55)'); heart.addColorStop(1, 'rgba(255,190,80,0)');
  g.fillStyle = heart; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 14; i++) {
   const a0 = i / 14 * Math.PI * 2 + (rnd() - .5) * .18, reach = m * (.55 + rnd() * .42), width = .05 + rnd() * .05;
   // A ray: a jagged wedge that kinks as it goes, with a fork near the tip.
   const ray = (a, from, to, w, alpha) => {
    const grad = g.createRadialGradient(m, m, from, m, m, to);
    grad.addColorStop(0, `rgba(255,255,245,${alpha})`); grad.addColorStop(.45, `rgba(255,226,140,${alpha * .8})`); grad.addColorStop(1, 'rgba(255,150,40,0)');
    g.fillStyle = grad; g.beginPath(); g.moveTo(m + Math.cos(a - w) * from, m + Math.sin(a - w) * from);
    const steps = 6; let bend = 0;
    for (let k = 1; k <= steps; k++) { bend += (rnd() - .5) * .06; const r = from + (to - from) * k / steps, ww = w * (1 - k / steps * .92); g.lineTo(m + Math.cos(a + bend - ww) * r, m + Math.sin(a + bend - ww) * r); }
    for (let k = steps; k >= 0; k--) { const r = from + (to - from) * k / steps, ww = w * (1 - k / steps * .92); g.lineTo(m + Math.cos(a + bend * k / steps + ww) * r, m + Math.sin(a + bend * k / steps + ww) * r); }
    g.closePath(); g.fill();
   };
   ray(a0, m * .06, reach, width, .95);
   if (rnd() < .7) ray(a0 + (rnd() < .5 ? -1 : 1) * (.08 + rnd() * .06), reach * .55, reach * (1.02 + rnd() * .12), width * .5, .6);
   // A thin needle between the big rays.
   ray(a0 + Math.PI / 14, m * .1, m * (.3 + rnd() * .35), .015, .5);
  }
 } else {
  // The torn wave front.
  for (let pass = 0; pass < 3; pass++) {
   g.beginPath();
   const n = 180, base = m * (.8 - pass * .06);
   for (let k = 0; k <= n; k++) {
    const a = k / n * Math.PI * 2, wob = Math.sin(a * 7 + pass) * .025 + Math.sin(a * 19 + pass * 2) * .012 + (rnd() - .5) * .02;
    const r = base * (1 + wob); k ? g.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r) : g.moveTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
   }
   g.strokeStyle = pass === 0 ? 'rgba(255,255,250,.95)' : pass === 1 ? 'rgba(255,220,130,.6)' : 'rgba(255,170,60,.35)';
   g.lineWidth = pass === 0 ? 10 : 18 + pass * 8; g.setLineDash(pass === 0 ? [] : [30 + pass * 20, 14 + pass * 10]); g.stroke();
  }
  g.setLineDash([]);
  // Crackle along the front: short zigzags leaning outward.
  for (let i = 0; i < 40; i++) {
   const a = rnd() * Math.PI * 2, r = m * (.72 + rnd() * .14);
   g.beginPath(); let x = m + Math.cos(a) * r, y = m + Math.sin(a) * r; g.moveTo(x, y);
   for (let k = 0; k < 4; k++) { const out = 10 + rnd() * 14, side = (rnd() - .5) * 14; x += Math.cos(a) * out - Math.sin(a) * side; y += Math.sin(a) * out + Math.cos(a) * side; g.lineTo(x, y); }
   g.strokeStyle = 'rgba(255,245,210,.8)'; g.lineWidth = 2 + rnd() * 2; g.stroke();
  }
  // Motes left behind inside the front.
  for (let i = 0; i < 70; i++) { const a = rnd() * Math.PI * 2, r = m * (.3 + rnd() * .5); g.fillStyle = `rgba(255,${200 + rnd() * 55 | 0},${120 + rnd() * 100 | 0},${.3 + rnd() * .5})`; g.beginPath(); g.arc(m + Math.cos(a) * r, m + Math.sin(a) * r, 1.5 + rnd() * 3, 0, Math.PI * 2); g.fill(); }
 }
 const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const NOVA = Object.freeze({ life: .75, crown: 9, shock: 10 });

export class SurgeView {
 constructor(view) {
  this.view = view; this.surges = new Map(); this.time = 0;
  // A flat strip on the ground, tail at z = 0, head at z = -1 (bright end).
  const strip = new THREE.PlaneGeometry(1, 1); strip.rotateX(-Math.PI / 2); strip.translate(0, 0, -.5);
  this.beamMaterial = new THREE.MeshBasicMaterial({ map: typeof document === 'undefined' ? null : beamTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
  this.beams = new THREE.InstancedMesh(strip, this.beamMaterial, SURGE_VIEW.slots * SURGE_VIEW.beams);
  this.beams.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  this.beams.setColorAt(0, WHITE); this.beams.count = 0; this.beams.frustumCulled = false; this.beams.renderOrder = 3;
  view.scene.add(this.beams);
  // The nova: a few pooled pairs of flat sprites on the ground (crown and
  // shock) plus a standing crown facing up, made now so the warm-up builds
  // their shader (it is the ordinary additive textured one).
  const flat = new THREE.PlaneGeometry(1, 1); flat.rotateX(-Math.PI / 2);
  const make = kind => new THREE.MeshBasicMaterial({ map: typeof document === 'undefined' ? null : novaTexture(kind), color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
  this.novaMaterials = { crown: make('crown'), shock: make('shock') };
  this.novas = Array.from({ length: 3 }, () => {
   const crown = new THREE.Mesh(flat, this.novaMaterials.crown.clone()), under = new THREE.Mesh(flat, this.novaMaterials.crown.clone()), shock = new THREE.Mesh(flat, this.novaMaterials.shock.clone());
   for (const mesh of [crown, under, shock]) { mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 4; view.scene.add(mesh); }
   return { crown, under, shock, t: 9 };
  });
  // The white body: one material for every surging player.
  // Opaque (a see-through shell let the body's own colours flicker through),
  // pushed past white so it reads brighter than anything lit, and a soft
  // additive halo round it.
  this.whiteMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.35, 1.35, 1.3), toneMapped: false });
  this.haloMaterial = new THREE.MeshBasicMaterial({ color: '#fff6dc', toneMapped: false, transparent: true, opacity: .28, depthWrite: false, blending: THREE.AdditiveBlending });
 }

 // `key`: 'you' or a remote slot. `body`: the group to whiten (its meshes).
 charge(key, body, x, z) { this.start(key, body, x, z, 'charging'); }
 activate(key, body, x, z) {
  const s = this.surges.get(key) || this.start(key, body, x, z, 'active');
  s.phase = 'active'; s.t = 0; s.body = body || s.body; this.shell(s, true);
  const fx = this.view.fx, y = .8;
  if (fx?.on) {
   fx.glow({ x, y, z, size: 3.4, grow: .9, life: .35, color: WHITE, glow: 2.2 });
   this.nova(x, z);
   fx.pillar({ x, z, radius: .55, height: 5, life: .45, color: PILLAR, glow: 1.6 });
   for (let i = 0, n = fx.n(26); i < n; i++) { const a = Math.random() * 6.28, v = 3 + Math.random() * 6; fx.spark({ x, y, z, vx: Math.cos(a) * v, vy: 1 + Math.random() * 4, vz: Math.sin(a) * v, life: .3 + Math.random() * .4, stops: GOLD_STOPS, length: .14, width: .02, glow: 1.8 }); }
  }
  if (key === 'you') this.view.shake = Math.max(this.view.shake, .22);
 }
 // The nova when the power lands: a sunburst of jagged rays that flares out
 // and turns as it fades, a second one counter-turning underneath, and a torn,
 // crackling wave front racing out past them (see novaTexture).
 nova(x, z) {
  const n = this.novas.reduce((a, b) => (b.t > a.t ? b : a));
  n.t = 0; n.x = x; n.z = z; n.spin = (Math.random() < .5 ? -1 : 1) * (.9 + Math.random() * .5); n.turn = Math.random() * 6.28;
  for (const mesh of [n.crown, n.under, n.shock]) { mesh.visible = true; mesh.position.set(x, .06, z); }
 }
 stepNovas(dt) {
  for (const n of this.novas) {
   if (n.t > NOVA.life) continue;
   n.t += dt;
   const k = Math.min(1, n.t / NOVA.life), out = 1 - (1 - k) ** 3;
   if (k >= 1) { n.crown.visible = n.under.visible = n.shock.visible = false; continue; }
   // Crown: flares out fast, turns, fades after a bright moment.
   n.crown.scale.setScalar(NOVA.crown * (.25 + out * .9)); n.crown.rotation.y = n.turn + n.spin * n.t * 1.6;
   n.crown.material.opacity = Math.min(1, k * 10) * (1 - k) ** 1.4;
   n.crown.position.y = .08;
   // Under-crown: smaller, counter-turning, a little late.
   const k2 = Math.max(0, (n.t - .06) / NOVA.life);
   n.under.scale.setScalar(NOVA.crown * .7 * (.3 + (1 - (1 - k2) ** 2) * .8)); n.under.rotation.y = n.turn + 1.1 - n.spin * n.t * 2.4;
   n.under.material.opacity = Math.min(1, k2 * 8) * (1 - k2) ** 2 * .8; n.under.position.y = .07;
   // Shock front: races out past the crown and tears as it thins.
   n.shock.scale.setScalar(NOVA.shock * (.15 + out * 1.05)); n.shock.rotation.y = n.turn * .5 + n.spin * n.t * .6;
   n.shock.material.opacity = Math.min(1, k * 14) * (1 - k) ** 1.1; n.shock.position.y = .05;
  }
 }

 // The body went away (an avatar removed): end any nova drawn on it.
 dropBody(body) { for (const [key, s] of this.surges) if (s.body === body) this.end(key); }

 end(key) {
  const s = this.surges.get(key); if (!s) return;
  const p = this.where(s), fx = this.view.fx;
  if (p && fx?.on) fx.glow({ x: p.x, y: .8, z: p.z, size: 1.8, life: .2, color: WHITE, glow: 1.2 });
  this.shell(s, false); this.surges.delete(key);
 }
 clear() { for (const key of [...this.surges.keys()]) { const s = this.surges.get(key); this.shell(s, false); } this.surges.clear(); this.beams.count = 0; for (const n of this.novas) { n.t = 9; n.crown.visible = n.under.visible = n.shock.visible = false; } }

 start(key, body, x, z, phase) {
  const old = this.surges.get(key); if (old) this.shell(old, false);
  const seed = Math.random() * 6.28, beams = [];
  for (let i = 0; i < SURGE_VIEW.beams; i++) beams.push({ angle: seed + i / SURGE_VIEW.beams * 6.28 + (Math.random() - .5) * .3, reach: SURGE_VIEW.radius * (.8 + Math.random() * .4), delay: Math.random() * .22, width: .09 + Math.random() * .08 });
  const s = { key, body, phase, t: 0, beams, x, z, clock: 0, flashed: false, shellGroup: null };
  this.surges.set(key, s); return s;
 }

 // The body drawn again in white (its own geometry, one shared material),
 // attached to it so it moves with it; shivered every frame while lit.
 shell(s, on) {
  if (s.shellGroup) { s.shellGroup.removeFromParent(); s.shellGroup = null; }
  // The body's own meshes are hidden under the shell (and given back after),
  // so nothing darker shows between the shivers.
  if (s.hidden) { for (const o of s.hidden) o.visible = true; s.hidden = null; }
  if (!on || !s.body) return;
  s.hidden = []; s.pairs = [];
  const group = new THREE.Group(), haloGroup = new THREE.Group(), body = s.body;
  body.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(body.matrixWorld).invert();
  body.traverse(o => {
   if (!o.isMesh || o.isInstancedMesh || !o.visible || o.userData.surgeShell) return;
   // Only what is showing now (a muzzle flash in a hidden group is not).
   for (let q = o.parent; q && q !== body; q = q.parent) if (!q.visible) return;
   if (o.material?.transparent && o.material !== this.whiteMaterial) return;
   const m = new THREE.Mesh(o.geometry, this.whiteMaterial); m.userData.surgeShell = true;
   m.matrixAutoUpdate = false; m.matrix.copy(inverse).multiply(o.matrixWorld); m.castShadow = o.castShadow; group.add(m);
   const halo = new THREE.Mesh(o.geometry, this.haloMaterial); halo.userData.surgeShell = true; halo.userData.halo = true;
   halo.matrixAutoUpdate = false; halo.matrix.copy(m.matrix); halo.castShadow = false; halo.renderOrder = 2; haloGroup.add(halo);
   s.hidden.push(o); s.pairs.push([o, m, halo]);
  });
  for (const o of s.hidden) o.visible = false;
  // The halo: the same shapes a little larger, glowing.
  haloGroup.scale.setScalar(1.12); haloGroup.userData.surgeShell = true; group.add(haloGroup);
  group.userData.surgeShell = true; body.add(group); s.shellGroup = group; s.halo = haloGroup;
 }

 where(s) {
  if (s.key === 'you') { const p = this.view.player; return p ? { x: p.position.x, z: p.position.z } : null; }
  const b = s.body; if (!b) return { x: s.x, z: s.z };
  const v = b.getWorldPosition(WHERE); return { x: v.x, z: v.z };
 }

 update(dt) {
  this.stepNovas(dt);
  this.time += dt;
  const fx = this.view.fx, demanding = isDemanding(this.view.qualityName);
  let n = 0, lightAt = null, lightLevel = 0;
  for (const [key, s] of this.surges) {
   s.t += dt; s.clock -= dt;
   const p = this.where(s) || s; s.x = p.x; s.z = p.z;
   if (s.phase === 'charging') {
    const u = s.t / SURGE.charge;
    if (u > 1.25) { this.end(key); continue; } // the start never came (a lost event): let it go
    for (const b of s.beams) {
     if (n >= this.beams.instanceMatrix.count) break;
     const k = ease((u - b.delay) / (.85 - b.delay)), head = b.reach * (1 - k), length = Math.min(2.4, b.reach - head, .6 + (b.reach - head) * .6);
     if (k >= 1 || length <= .02) continue;
     const a = b.angle + k * .9, cx = Math.cos(a), cz = Math.sin(a);
     const hx = p.x + cx * head, hz = p.z + cz * head, tx = p.x + cx * (head + length), tz = p.z + cz * (head + length);
     dummy.position.set(tx, .045 + (n % 3) * .002, tz); dummy.rotation.set(0, Math.atan2(tx - hx, tz - hz), 0); dummy.scale.set(b.width * (1 + k * .8), 1, length);
     dummy.updateMatrix(); this.beams.setMatrixAt(n, dummy.matrix);
     this.beams.setColorAt(n, tmp.copy(YELLOW).lerp(GOLD, .3 * Math.sin(this.time * 20 + n) ** 2).lerp(WHITE, k * k).multiplyScalar(1.4));
     n++;
     // Dust kicked where the beams run, now and then.
     if (fx?.on && s.clock <= 0 && Math.random() < .35) fx.puff({ x: hx, y: .12, z: hz, vx: cx * -1.5, vz: cz * -1.5, size: .22, grow: 2.4, life: .9, alpha: .4, color: this.view.kickedDustColor?.(hx, hz) || new THREE.Color('#b99d73') });
     if (fx?.on && s.clock <= 0 && Math.random() < .3) fx.spark({ x: hx, y: .1, z: hz, vx: -cx * 3, vy: 1.5 + Math.random() * 2, vz: -cz * 3, life: .25, stops: k > .6 ? WHITE_STOPS : GOLD_STOPS, length: .1, width: .016 });
    }
    if (s.clock <= 0) s.clock = .07;
    // They meet: a white flash on the player (the breakables break now).
    if (!s.flashed && u >= .8) {
     s.flashed = true;
     if (fx?.on) { fx.glow({ x: p.x, y: .5, z: p.z, size: 2.6, life: .22, color: WHITE, glow: 2 }); fx.ring({ x: p.x, z: p.z, radius: SURGE.breakRadius, from: .9, life: .3, color: BREAK_RING, glow: 1.2 }); }
    }
    // Gathering light round them as it builds.
    if (fx?.on && Math.random() < .5 * fx.level) fx.glow({ x: p.x, y: .15, z: p.z, size: .8 + u * 1.6, life: .12, color: GLOW_RING[glowNext = (glowNext + 1) % GLOW_RING.length].copy(YELLOW).lerp(WHITE, u), glow: .6 + u });
    const level = ease(u) * .6; if (key === 'you' || !lightAt || level > lightLevel) { if (!lightAt || key === 'you') { lightAt = p; lightLevel = level; } }
   } else {
    if (s.t > SURGE.duration + 1) { this.end(key); continue; } // a lost end event
    // Shiver.
    const g = s.shellGroup;
    // Shiver: the whole white body together (nothing behind it to show), the
    // halo breathing on its own.
    // (Held still while the game is frozen, dt 0.)
    if (g && dt > 0) { g.position.set((Math.random() - .5) * .04, (Math.random() - .5) * .025, (Math.random() - .5) * .04); if (s.halo) s.halo.scale.setScalar(1.1 + Math.random() * .06); this.haloMaterial.opacity = .22 + Math.random() * .12; }
    // The white body follows the real one (arms, gun, recoil, aiming in),
    // which keeps being posed underneath while hidden.
    if (g && s.pairs && s.body) {
     s.body.updateMatrixWorld(true); SHELL_INVERSE.copy(s.body.matrixWorld).invert();
     for (const [o, m, halo] of s.pairs) { m.matrix.multiplyMatrices(SHELL_INVERSE, o.matrixWorld); halo.matrix.copy(m.matrix); }
    }
    if (fx?.on && s.clock <= 0) {
     s.clock = .05 / Math.max(.3, fx.level);
     const a = Math.random() * 6.28, r = .3 + Math.random() * .2;
     fx.spark({ x: p.x + Math.cos(a) * r, y: .3 + Math.random() * .8, z: p.z + Math.sin(a) * r, vx: Math.cos(a) * .6, vy: 2 + Math.random() * 2.5, vz: Math.sin(a) * .6, life: .35 + Math.random() * .3, gravity: -.2, stops: Math.random() < .5 ? WHITE_STOPS : GOLD_STOPS, length: .12, width: .016, glow: 1.6 });
     if (Math.random() < .5) fx.glow({ x: p.x, y: .8, z: p.z, size: 1.3 + Math.random() * .4, life: .12, color: WHITE, glow: .9, flicker: 1 });
    }
    const level = 1; if (!lightAt || key === 'you') { lightAt = p; lightLevel = level; }
   }
  }
  this.beams.count = n;
  if (n) { this.beams.instanceMatrix.needsUpdate = true; if (this.beams.instanceColor) this.beams.instanceColor.needsUpdate = true; }
  // The shared effects light, Quality and Extreme only.
  const v = this.view;
  if (lightAt && demanding && v.fxLight) { v.fxLight.color.set('#fff4cc'); v.fxLight.position.set(lightAt.x, 1.4, lightAt.z); v.fxLightLevel = Math.max(v.fxLightLevel || 0, SURGE_VIEW.light * 2.2 * lightLevel * (.85 + Math.random() * .3)); }
 }
}
