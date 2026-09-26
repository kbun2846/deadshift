// Drifting fog sheets (the old "dust wisps"): a few big blended sheets that
// drift across the view and thin out round the player and the aim point, so
// weather never hides the fight. One to five of them by preset (world-build.js
// updateAmbient); a map sets their colour and strength with look.fog
// (map-look.js: Deadwater's tan dust by default).
//
// The clearing is not a circle. Round each centre its edge wanders with the
// direction (a two-lobe and a three-lobe pattern, each turning slowly) and
// with a slow world-space grain, and it trails a moving centre and closes in
// behind it, so it reads as air being pushed about. At least the old inner
// radii (2.2 m round the player, 1.2 m round the aim point) are always clear.
// The clearing is measured where the pixel's view ray passes the centre's own
// height, so it sits on the player on screen whatever height the sheet is at.
//
// Flat maps: the sheets ride with the camera, drifting across the screen, as
// they always have. Terrain maps: a sheet forms at a world height (the ground
// where it forms plus its own 1.2-2.6 m) and stays at it, anchored in the
// world, and is drawn only where there is air under it: per pixel it fades
// out where the ground comes within about a metre (a height texture of the
// ground, shared with Extreme's dust band), so a sheet drifting into a hill
// thins out against the slope instead of slicing through it, and one over a
// hilltop stays up there as you walk down. New ones form ahead of the camera,
// preferring low ground by look.fog.lowBias, and are thickest over low ground.
import * as THREE from 'three';

// The clearings: inner is always clear; the edge reaches full fog somewhere
// round outer, wandering either side of it; trail is the longest wake (m).
export const FOG_CLEAR = Object.freeze({
 player: Object.freeze({ inner: 2.2, outer: 5.5, trail: 4.5 }),
 aim: Object.freeze({ inner: 1.2, outer: 3.6, trail: 3 }),
 lag: 2.4, // per second: how quickly a wake closes in behind a moving centre
 snap: 12, // a jump further than this (a respawn, a teleport) leaves no wake
});

const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// How much fog is left (0 clear .. 1 untouched) at an offset (dx, dz) from a
// clearing's centre, with its wake at offset (tx, tz) from the centre, its
// lobes turned by p2 and p3 (radians) and the grain there (0..1). The same
// sums as the shader's fogClear (CLEAR_GLSL), so the tests can hold it to
// its promises.
export function clearingAt(dx, dz, tx, tz, p2, p3, grain, { inner, outer }) {
 const d0 = Math.hypot(dx, dz), l2 = tx * tx + tz * tz;
 const s = l2 > 1e-4 ? Math.max(0, Math.min(1, (dx * tx + dz * tz) / l2)) : 0;
 const d = Math.min(d0, Math.hypot(dx - tx * s, dz - tz * s) / (1 - .5 * s));
 const ux = dx / Math.max(d0, 1e-3), uz = dz / Math.max(d0, 1e-3);
 const c2 = ux * ux - uz * uz, s2 = 2 * ux * uz, c3 = ux * (4 * ux * ux - 3), s3 = uz * (3 - 4 * uz * uz);
 const w = .5 + .3 * (c2 * Math.cos(p2) + s2 * Math.sin(p2)) + .2 * (c3 * Math.cos(p3) + s3 * Math.sin(p3));
 const start = inner + (w * .9 + grain * .5) * (outer - inner) * .35;
 const end = outer * (.62 + .8 * w) + (grain - .5) * 2.2;
 return smoothstep(start, Math.max(end, start + .8), d);
}

const CLEAR_GLSL = `
 float fogHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
 float fogNoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fogHash(i), fogHash(i + vec2(1.0, 0.0)), u.x), mix(fogHash(i + vec2(0.0, 1.0)), fogHash(i + vec2(1.0, 1.0)), u.x), u.y);
 }
 // lobe: cos and sin of the two-lobe and three-lobe turns (see clearingAt).
 float fogClear(vec2 r, vec2 trail, vec4 lobe, float inner, float outer, float grain){
  float d0 = length(r), l2 = dot(trail, trail);
  float s = l2 > 1e-4 ? clamp(dot(r, trail) / l2, 0.0, 1.0) : 0.0;
  float d = min(d0, length(r - trail * s) / (1.0 - .5 * s));
  vec2 u = r / max(d0, 1e-3);
  float c2 = u.x * u.x - u.y * u.y, s2 = 2.0 * u.x * u.y, c3 = u.x * (4.0 * u.x * u.x - 3.0), s3 = u.y * (3.0 - 4.0 * u.y * u.y);
  float w = .5 + .3 * (c2 * lobe.x + s2 * lobe.y) + .2 * (c3 * lobe.z + s3 * lobe.w);
  float start = inner + (w * .9 + grain * .5) * (outer - inner) * .35;
  float end = outer * (.62 + .8 * w) + (grain - .5) * 2.2;
  return smoothstep(start, max(end, start + .8), d);
 }`;

const num = v => v.toFixed(3);
const turn = (v, a, b) => v.set(Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b));
const FRAGMENT = `#include <color_fragment>
 {
  // Where this pixel's view ray passes each centre's height.
  vec3 fogRay = vFogWorld - cameraPosition;
  float fogDown = min(fogRay.y, -.01);
  vec2 onPlayer = cameraPosition.xz + fogRay.xz * ((clearY.x - cameraPosition.y) / fogDown);
  vec2 onAim = cameraPosition.xz + fogRay.xz * ((clearY.y - cameraPosition.y) / fogDown);
  // (Two octaves: ragged at a metre or two, not one smooth curve.)
  float grain = fogNoise(vFogWorld.xz * .55 + vec2(fogTime * .09, fogTime * -.05)) * .6 + fogNoise(vFogWorld.xz * 1.4 + vec2(fogTime * -.13, 7.0)) * .4;
  diffuseColor.a *= fogClear(onPlayer - clearPlayer, clearTrail.xy, clearLobePlayer, ${num(FOG_CLEAR.player.inner)}, ${num(FOG_CLEAR.player.outer)}, grain)
   * fogClear(onAim - clearAim, clearTrail.zw, clearLobeAim, ${num(FOG_CLEAR.aim.inner)}, ${num(FOG_CLEAR.aim.outer)}, grain);
  #ifdef FOG_GROUND
  // Only where there is air under it: gone where the ground comes within
  // about a metre, thinner far above it, thicker over low ground.
  float under = texture2D(fogGround, (vFogWorld.xz - fogGroundBox.xy) * fogGroundBox.zw).r;
  float air = vFogWorld.y - under;
  diffuseColor.a *= smoothstep(.2, 1.0, air) * mix(1.0, .4, smoothstep(4.0, 8.0, air)) * (1.0 + fogLow.z * (1.0 - smoothstep(fogLow.x, fogLow.y, under)));
  #endif
 }`;

// Low ground, for lowBias: from about the lowest twentieth of the map (all
// low) to its middle height (none), from the ground's own grid.
export function lowRange(ground) {
 const values = [];
 for (let i = 0; i < ground.grid.length; i += 7) values.push(ground.grid[i]);
 values.sort((a, b) => a - b);
 const lo = values[Math.floor(values.length * .05)] * .001, mid = values[Math.floor(values.length * .5)] * .001;
 return { lo, hi: Math.max(mid, lo + .5) };
}

// The ground a sheet forms over: nine points across the middle of its
// footprint (w x d), the seventh lowest, and never under its middle. Most of
// the sheet then has air under it; a knoll or bank poking up through it is
// faded out per pixel.
const FOOTPRINT = [[0, 0], [-.35, 0], [.35, 0], [0, -.35], [0, .35], [-.35, -.35], [.35, -.35], [-.35, .35], [.35, .35]];
const footprintHeights = new Float64Array(FOOTPRINT.length);
export function formationGround(ground, x, z, w, d) {
 for (let i = 0; i < FOOTPRINT.length; i++) footprintHeights[i] = ground.heightAt(x + FOOTPRINT[i][0] * w, z + FOOTPRINT[i][1] * d);
 const middle = footprintHeights[0];
 return Math.max(middle, footprintHeights.sort()[6]);
}

// The sheet's picture: many soft lobes of two tones, combed with fine
// wind-blown streaks, so a cloud has body and grain instead of one blur.
// (`rand` is the ambient's own sequence: Deadwater's sheets are the same
// picture they always were.)
const rgbOf = hex => { const v = parseInt(hex.replace('#', ''), 16); return `${v >> 16 & 255},${v >> 8 & 255},${v & 255}`; };
export function makeFogTexture(rand, fog) {
 const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
 const ctx = canvas.getContext('2d');
 const lightTone = rgbOf(fog.highlight), darkTone = rgbOf(fog.colour);
 for (let i = 0; i < 46; i++) {
  const x = 70 + rand() * 372, y = 70 + rand() * 116, r = 14 + rand() * 58, light = i % 3 === 0;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
  const tone = light ? lightTone : darkTone;
  gradient.addColorStop(0, `rgba(${tone},${light ? .32 : .4})`); gradient.addColorStop(.5, `rgba(${tone},.14)`); gradient.addColorStop(1, `rgba(${tone},0)`);
  ctx.fillStyle = gradient; ctx.fillRect(x - r, y - r, r * 2, r * 2);
 }
 ctx.globalCompositeOperation = 'destination-out';
 for (let i = 0; i < 70; i++) { const y = 40 + rand() * 176, x = rand() * 512; ctx.strokeStyle = `rgba(0,0,0,${.05 + rand() * .08})`; ctx.lineWidth = 1 + rand() * 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 40 + rand() * 120, y + (rand() - .5) * 6); ctx.stroke(); }
 ctx.globalCompositeOperation = 'source-over';
 const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
 return texture;
}

export class FogSheets {
 // fog: look.fog (map-look.js). ground: the map's Ground (FLAT on a flat
 // map). heights: { texture, box } uniforms of the ground's height texture
 // (extreme-surfaces.js groundHeights), on terrain maps. texture: the
 // picture, made from `rand` when not given (the tests pass one).
 constructor({ scene, fog, ground, rand, heights = null, texture = null, random = Math.random }) {
  this.fog = fog; this.ground = ground; this.random = random;
  this.terrain = !!heights && !!ground && !ground.flat;
  const picture = texture || makeFogTexture(rand, fog);
  // `player` and `aim` are the clearings' centres (x, z); the thumbnail tool
  // moves them straight onto what it frames.
  this.clear = {
   player: { value: new THREE.Vector2() }, aim: { value: new THREE.Vector2() },
   trail: { value: new THREE.Vector4() }, heights: { value: new THREE.Vector2(.9, .7) },
   lobePlayer: { value: new THREE.Vector4(1, 0, 1, 0) }, lobeAim: { value: new THREE.Vector4(1, 0, 1, 0) },
   time: { value: 0 },
  };
  this.low = { value: new THREE.Vector3(0, 1, 0) };
  if (this.terrain) { const { lo, hi } = lowRange(ground); this.low.value.set(lo, hi, Math.max(0, fog.lowBias || 0)); }
  this.wakes = { player: null, aim: null };
  this.lead = { x: 0, z: 0, fx: null, fz: null };
  // Each of these covers a fifth to a quarter of the screen, and they
  // overlap: three of them is roughly two thirds of a full-screen blended
  // pass. On a tiler every blended layer is a read-modify-write of the tile
  // with no early depth rejection, so the phone tiers get fewer of them and
  // the scene fog carries the haze instead.
  const geometry = new THREE.PlaneGeometry(1, 1); geometry.rotateX(-Math.PI / 2);
  const key = this.terrain ? 'dust-wisp-ground' : 'dust-wisp';
  this.meshes = Array.from({ length: 5 }, (_, i) => {
   const material = new THREE.MeshBasicMaterial({ map: picture, transparent: true, opacity: 0, depthWrite: false, depthTest: true });
   if (this.terrain) material.defines = { FOG_GROUND: '' };
   material.onBeforeCompile = shader => {
    const c = this.clear;
    Object.assign(shader.uniforms, { clearPlayer: c.player, clearAim: c.aim, clearTrail: c.trail, clearY: c.heights,
     clearLobePlayer: c.lobePlayer, clearLobeAim: c.lobeAim, fogTime: c.time });
    if (this.terrain) Object.assign(shader.uniforms, { fogGround: heights.texture, fogGroundBox: heights.box, fogLow: this.low });
    shader.vertexShader = 'varying vec3 vFogWorld;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFogWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = 'uniform vec2 clearPlayer; uniform vec2 clearAim; uniform vec4 clearTrail; uniform vec2 clearY; uniform vec4 clearLobePlayer; uniform vec4 clearLobeAim; uniform float fogTime;\n'
     + (this.terrain ? 'uniform sampler2D fogGround; uniform vec4 fogGroundBox; uniform vec3 fogLow;\n' : '')
     + 'varying vec3 vFogWorld;\n' + CLEAR_GLSL + '\n' + shader.fragmentShader.replace('#include <color_fragment>', FRAGMENT);
   };
   material.customProgramCacheKey = () => key;
   const mesh = new THREE.Mesh(geometry, material); mesh.renderOrder = 5;
   mesh.scale.set(15 + (i % 3) * 3, 1, 7 + (i % 3));
   this.reset(mesh, i % 3, null);
   scene?.add(mesh);
   return mesh;
  });
 }

 hide() { for (const mesh of this.meshes) mesh.visible = false; }

 // A sheet's path across the view: in from the west, the east or the north,
 // over 30-54 s, at 1.2-2.6 m. `initial` (0..2) staggers the first ones.
 route(initial) {
  const random = this.random;
  const route = initial >= 0 ? initial : Math.floor(random() * 4);
  const horizontal = route < 2, direction = route === 1 ? -1 : 1;
  const life = 30 + random() * 24;
  return { first: initial, age: initial >= 0 ? life * (.12 + initial * .18) : 0, life,
   x: horizontal ? -direction * 1.1 : (random() - .5) * 1.8,
   z: route === 2 ? -1.05 : (random() - .5) * 1.8,
   dx: horizontal ? direction * (1.8 + random() * .6) : (random() - .5) * 1.1,
   dz: route === 2 ? 1.8 + random() * .5 : (random() - .5) * .9,
   phase: random() * Math.PI * 2, height: 1.2 + random() * 1.4 };
 }

 // Terrain: a sheet forms somewhere in the view (or where the view is
 // heading), drifts slowly east on the breeze (about 0.3-0.6 m/s: it lives in
 // the world, so it no longer has to cross the screen) and hangs at the
 // height of the ground under it where it formed, plus its own. With
 // lowBias, a few places are tried and the one over the lowest ground wins.
 reset(mesh, initial = -1, view) {
  let drift = this.route(initial);
  if (this.terrain && view) {
   const random = this.random, tries = initial >= 0 ? 1 : 1 + Math.round(Math.min(1, this.fog.lowBias || 0) * 2);
   let best = null;
   for (let i = 0; i < tries; i++) {
    const mx = view.focus.x + this.lead.x + (random() - .5) * 1.6 * view.halfWidth;
    const mz = view.focus.z + this.lead.z + (random() - .5) * 1.6 * view.halfHeight * 1.25;
    const under = formationGround(this.ground, mx, mz, mesh.scale.x, mesh.scale.z);
    if (!best || under < best.under) best = { mx, mz, under };
   }
   const vx = .3 + random() * .3, vz = (random() - .5) * .3;
   // (Laid so that it is over that ground half way through its life.)
   Object.assign(drift, { world: true, vx, vz, ox: best.mx - vx * drift.life * .5, oz: best.mz - vz * drift.life * .5, y: best.under + drift.height });
  }
  mesh.userData.drift = drift;
  mesh.rotation.y = (this.random() - .5) * .25;
 }

 // Where a sheet is this frame (its centre), without moving it.
 place(drift, view, elapsed, out) {
  const phase = drift.age / drift.life, sway = Math.sin(elapsed * .07 + drift.phase) * .7;
  if (drift.world) return out.set(drift.ox + drift.vx * drift.age, drift.y, drift.oz + drift.vz * drift.age + sway);
  return out.set(view.focus.x + (drift.x + drift.dx * phase) * view.halfWidth, drift.height + view.focus.y,
   view.focus.z + (drift.z + drift.dz * phase) * view.halfHeight * 1.25 + sway);
 }

 // A clearing's wake: a point that follows the centre, lagging, kept within
 // `trail` of it. Returns its offset from the centre.
 wake(name, x, z, dt, limit) {
  let w = this.wakes[name];
  if (!w || Math.hypot(x - w.x, z - w.z) > FOG_CLEAR.snap) w = this.wakes[name] = { x, z };
  const k = 1 - Math.exp(-FOG_CLEAR.lag * dt);
  w.x += (x - w.x) * k; w.z += (z - w.z) * k;
  let ox = w.x - x, oz = w.z - z; const length = Math.hypot(ox, oz);
  if (length > limit) { ox *= limit / length; oz *= limit / length; w.x = x + ox; w.z = z + oz; }
  return { x: ox, z: oz };
 }

 // view: { count, interior, player: {x, z, y}, aim: {x, z, y}, focus,
 // halfWidth, halfHeight (the framed ground's half size), dt, elapsed }.
 update(view) {
  const { count, dt, elapsed, player, aim } = view, c = this.clear;
  c.player.value.set(player.x, player.z); c.aim.value.set(aim.x, aim.z);
  c.heights.value.set(player.y + .9, aim.y + .7);
  const pw = this.wake('player', player.x, player.z, dt, FOG_CLEAR.player.trail), aw = this.wake('aim', aim.x, aim.z, dt, FOG_CLEAR.aim.trail);
  c.trail.value.set(pw.x, pw.z, aw.x, aw.z);
  turn(c.lobePlayer.value, elapsed * .21 + 1.3, elapsed * -.17 + 4.1);
  turn(c.lobeAim.value, elapsed * .27 + 2.2, elapsed * -.19 + .6);
  c.time.value = elapsed % 3600;
  // Terrain: which way the view is going, so new sheets form ahead of it.
  if (this.terrain) {
   const l = this.lead;
   if (l.fx !== null && dt > 0) {
    const k = 1 - Math.exp(-2 * dt), vx = (view.focus.x - l.fx) / dt, vz = (view.focus.z - l.fz) / dt;
    if (Math.hypot(vx, vz) < 40) { l.x += (vx * 2.5 - l.x) * k; l.z += (vz * 2.5 - l.z) * k; }
    const length = Math.hypot(l.x, l.z); if (length > 7) { l.x *= 7 / length; l.z *= 7 / length; }
   }
   l.fx = view.focus.x; l.fz = view.focus.z;
  }
  for (let index = 0; index < this.meshes.length; index++) {
   const mesh = this.meshes[index];
   if (index >= count) { mesh.visible = false; continue; }
   let drift = mesh.userData.drift; drift.age += dt;
   // (Terrain: the first sheets are laid in the world on the first frame,
   // keeping their staggered ages.)
   if (this.terrain && !drift.world) { const age = drift.age; this.reset(mesh, drift.first, view); drift = mesh.userData.drift; if (drift.first >= 0) drift.age = age; }
   if (drift.age >= drift.life) { this.reset(mesh, -1, view); drift = mesh.userData.drift; }
   this.place(drift, view, elapsed, mesh.position);
   // Terrain: a sheet the view has left behind (off screen by a margin, so
   // nobody sees it go) forms again ahead.
   if (drift.world && drift.age > 1 && (Math.abs(mesh.position.x - view.focus.x) > view.halfWidth + mesh.scale.x * .5 + 3
    || Math.abs(mesh.position.z - view.focus.z) > view.halfHeight * 1.4 + mesh.scale.z * .5 + 3)) {
    this.reset(mesh, -1, view); drift = mesh.userData.drift; this.place(drift, view, elapsed, mesh.position);
   }
   mesh.material.opacity = this.fog.opacity * Math.sin(drift.age / drift.life * Math.PI) ** 2;
   mesh.visible = !view.interior;
  }
 }
}
