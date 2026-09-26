// Hollow Wick's life (stage 5, s5-life): the few things that move, each
// subtle and cheap. Placed as map data (src/maps/hollow-wick-life.js):
//  - a black goat in a small wattle pen behind the farm: it grazes, looks up
//    and about, flicks an ear or its tail, takes a step or two, and when a
//    player comes within 14 m it stops and turns its head, then its body, to
//    stare at the nearest one until they go (GoatMind: pure, tested);
//  - a washing line in the farm's back yard: a sheet, a shirt, a small
//    child's gown and an apron hanging by one peg, each swaying and lifting
//    out of step with the others;
//  - stick effigies (lashed twigs) hanging on strings from dead limbs along
//    the North Woods' track, turning slowly on their strings.
// And, from the buildings (world/colonial-buildings.js marks them; the map
// flags them, maps/hollow-wick-life.js withLife): a loose shutter on three
// houses, hanging from one hinge and swinging, now and then further and back
// against the wall; the tavern's sign swinging on its bracket; and a thin
// wisp of smoke from the lit cape's chimney, leaning east (someone is home).
//
// How it stays cheap. Every moving thing is ordinary geometry in the
// vertex-coloured material the static scenery already uses
// (view.bakedMaterial('plain')), so nothing new compiles. The pieces near one
// another share ONE mesh (a "region": the town, the farm, the woods), so the
// whole lot is one draw per region in view (and one in the shadow pass). Its
// vertices are rewritten on the CPU from each piece's rest shape when the
// mesh is drawn (onBeforeRender: nothing runs for a region off screen): a
// rigid piece (the goat's body, neck, head, ears, tail and legs, a shutter,
// the sign, an effigy) is one matrix applied to its vertices, a linen is a
// small grid bent by the wind, a piece that never moves (an effigy's limb)
// is written once. About 2,800 vertices in all, under a tenth of a
// millisecond a region on a desktop, no allocation per frame (numbers reach
// the per-frame code through objects and typed arrays, never as arguments,
// so V8 boxes none). Potato rewrites them 20 times a second, Performance 30,
// the rest every frame (LIFE_DETAIL). The smoke is one instanced draw of soft
// quads with its own small material (compiled at load with everything
// else), none on Potato.
//
// Solid parts (the pen's hurdles, the washing posts) are props like any
// other: health null, colliders with honest heights, merged into the static
// batches (world-build.js makeProp hands them here). The goat, the linens and
// the effigies are cosmetic: nothing collides with them or hurts them.
import * as THREE from 'three';

// Collision boxes are [x, z, w, d, height] in the prop's own frame. The pen:
// four wattle hurdles, 0.95 m (low cover); between their inner faces it is
// 3.0 x 1.9 m, so every spot inside is within 1 m of a hurdle and nobody is
// ever spawned in it (net/map-spawns.js spawnProblem). The washing line: its
// two posts (the line and the linens are walked under). An effigy: nothing.
export const LIFE_TYPES = Object.freeze({
 goatPen: { w: 3.6, d: 2.5, health: null, collisionBoxes: [[0, -1.05, 3.4, .2, .95], [0, 1.05, 3.4, .2, .95], [-1.6, 0, .2, 1.9, .95], [1.6, 0, .2, 1.9, .95]] },
 laundryLine: { w: 3.5, d: .6, health: null, collisionBoxes: [[-1.6, 0, .16, .16, 1.95], [1.6, 0, .16, .16, 1.95]] },
 effigy: { w: .7, d: .7, health: null, collisionBoxes: [] },
});
// The pen's inside (between the hurdles' inner faces), half extents.
export const PEN_INSIDE = Object.freeze({ hx: 1.5, hz: .95 });

// Which mesh a moving piece joins: the nearest of these (x, z).
export const LIFE_REGIONS = Object.freeze({ town: [34, -24], farm: [-44, 36], woods: [4, -53] });
// Per preset: seconds between rewrites of the moving meshes (0: every frame)
// and how many smoke puffs (none on Potato).
export const LIFE_DETAIL = Object.freeze({
 potato: { step: 1 / 20, smoke: 0 }, performance: { step: 1 / 30, smoke: 10 },
 balanced: { step: 0, smoke: 16 }, quality: { step: 0, smoke: 22 }, extreme: { step: 0, smoke: 28 },
});
const detailOf = view => LIFE_DETAIL[view.qualityName] || LIFE_DETAIL.balanced;

// The palette: muted, dull; only the goat's eyes catch the light (amber, the
// candle colour, #d9a24a).
const C = {
 coat: '#1c1a18', coat2: '#24211e', ridge: '#2e2a26', belly: '#151312', shag: '#121110', nose: '#2c2825', beard: '#0e0d0c', leg: '#191716', hoof: '#3a342f',
 horn: '#c9bfa5', hornMid: '#b3a88f', hornTip: '#8a8171',
 withy: ['#6d6150', '#7b6e5a', '#5f5445', '#857761'], stake: '#4a4036', mud: '#4a3f31', straw: '#9a8656', strawPale: '#9c8a58', strawDull: '#7d6d48', dung: '#221c16',
 bucket: '#5b4a38', iron: '#34373a', water: '#1f2426', twine: '#9a8c6c',
 post: '#6a5f52', postDark: '#4f473d', line: '#7c705c', peg: '#8a7a60', basket: '#7d6c4c', basketDark: '#5e5039',
 sheet: '#b3ac9c', sheetHem: '#9d9585', shirt: '#9f9684', gown: '#bdb3a0', gownHem: '#8f8676', apron: '#4f4943',
 bark: '#3b322c', trunk: '#231d1a',
 // The effigies: weathered, bleached sticks (paler than the living wood, so
 // they read against the litter from above) and pale twine.
 stick: ['#8c8373', '#7d7466', '#9a917f', '#6f675b'], lash: '#b3a684',
 smoke: '#8e8d89',
};
// The eyes: amber, brighter than any surface (a vertex colour over 1), so they
// catch the dusk light as a glint without a glowing material or another draw.
const EYE = new THREE.Color('#d9a24a').multiplyScalar(2.6);

// A repeatable 0..1 sequence (the same every load).
function seededRandom(seed) { let s = (Math.floor(Math.abs(seed)) % 2147483646) + 1; return () => (s = s * 16807 % 2147483647) / 2147483647; }
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const approach = (v, target, step) => v < target ? Math.min(target, v + step) : Math.max(target, v - step);
const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

// ---------------------------------------------------------------------------
// The air (pure). A slow swell, and a gust now and then (one in each 13 s
// window, 1.6-3.2 s long, of varying strength) that reaches a place a little
// later the further east it is: a gust front moving east at 6 m/s, the way
// the fog sheets and falling leaves drift.
export function gustAt(s) {
 const period = 13, k = Math.floor(s / period), local = s - k * period;
 const start = hash(k) * (period - 4), length = 1.6 + hash(k + 7.1) * 1.6, x = (local - start) / length;
 if (x <= 0 || x >= 1) return 0;
 return (.45 + .55 * hash(k + 3.3)) * Math.sin(Math.PI * x) ** 2;
}
export function windAt(t, x = 0) {
 const s = t - x / 6;
 return .5 + .2 * Math.sin(s * .23) + .12 * Math.sin(s * .61 + 1.3) + gustAt(s);
}
// The same for a frame's hot paths: set air.t and air.x, call blow(air), read
// air.wind and air.gust. (Numbers handed to or back from a function that is
// not inlined are boxed, a small allocation each; through an object's fields
// they are not.)
export const AIR = { t: 0, x: 0, wind: 0, gust: 0 };
export function blow(air) {
 const s = air.t - air.x / 6, period = 13, k = Math.floor(s / period), local = s - k * period;
 const h0 = Math.sin(k * 127.1 + 311.7) * 43758.5453, h1 = Math.sin((k + 7.1) * 127.1 + 311.7) * 43758.5453, h2 = Math.sin((k + 3.3) * 127.1 + 311.7) * 43758.5453;
 const start = (h0 - Math.floor(h0)) * (period - 4), length = 1.6 + (h1 - Math.floor(h1)) * 1.6, x = (local - start) / length;
 air.gust = x <= 0 || x >= 1 ? 0 : (.45 + .55 * (h2 - Math.floor(h2))) * Math.sin(Math.PI * x) ** 2;
 air.wind = .5 + .2 * Math.sin(s * .23) + .12 * Math.sin(s * .61 + 1.3) + air.gust;
}

// In-place rigid matrix steps for a frame's poses, reading their numbers
// from a Float64Array (v[k]...), so nothing is boxed: m = m x R(v[k]) about
// x, y or z, and m = m x T(v[k], v[k + 1], v[k + 2]). (three's column-major
// elements.)
function turnX(m, v, k) {
 const e = m.elements, c = Math.cos(v[k]), s = Math.sin(v[k]);
 for (let i = 0; i < 4; i++) { const a = e[4 + i], b = e[8 + i]; e[4 + i] = a * c + b * s; e[8 + i] = b * c - a * s; }
}
function turnY(m, v, k) {
 const e = m.elements, c = Math.cos(v[k]), s = Math.sin(v[k]);
 for (let i = 0; i < 4; i++) { const a = e[i], b = e[8 + i]; e[i] = a * c - b * s; e[8 + i] = a * s + b * c; }
}
function turnZ(m, v, k) {
 const e = m.elements, c = Math.cos(v[k]), s = Math.sin(v[k]);
 for (let i = 0; i < 4; i++) { const a = e[i], b = e[4 + i]; e[i] = a * c + b * s; e[4 + i] = b * c - a * s; }
}
function shift(m, v, k) {
 const e = m.elements, x = v[k], y = v[k + 1], z = v[k + 2];
 for (let i = 0; i < 4; i++) e[12 + i] += e[i] * x + e[4 + i] * y + e[8 + i] * z;
}

// ---------------------------------------------------------------------------
// The goat's mind (pure: no three.js). Pen-local metres (x along the pen, z
// across it), heading in radians (0 faces +z; forward is (sin h, cos h)).
// Out: where it stands and faces, the neck's turn and bend, the head's bend,
// the ears, the tail, the legs' stride and how much it is moving.
export const GOAT = Object.freeze({
 notice: 14,       // m: a player this near is stared at
 forget: 16,       // m: ...until they are this far (for 1.5 s)
 bodyTurn: 1.3,    // rad/s the body turns
 neckTurn: 2.6,    // rad/s the neck turns
 bend: 2.2,        // rad/s the neck and head bend
 walk: .3,         // m/s
 reach: 1.1,       // rad: how far the neck turns from the body
 front: .64, back: .46, half: .27, // its footprint about its centre: the nose, the tail, the horns' spread
 margin: .05,      // m kept from the hurdles
});
// Pose targets per state: [neck bend (down +), head bend (down +)].
const BEND = { graze: [1.8, -.3], look: [-.1, .15], step: [.35, .2], stare: [-.22, .05] };

export class GoatMind {
 constructor(seed = 1, inside = PEN_INSIDE) {
  this.random = seededRandom(seed * 7919 + 13);
  // The nearest player (pen-local) and how far (Infinity: nobody); set
  // before each step (see `step`).
  this.player = { x: 0, z: 0, d: Infinity };
  this.hx = inside.hx - GOAT.margin; this.hz = inside.hz - GOAT.margin;
  this.x = (this.random() - .5) * .4; this.z = 0; this.heading = Math.PI / 2 + (this.random() - .5) * .6;
  this.neckYaw = 0; this.neckBend = BEND.graze[0]; this.headBend = BEND.graze[1];
  this.earL = 0; this.earR = 0; this.perk = 0; this.tail = 0; this.stride = 0; this.moving = 0; this.chew = 0;
  this.state = 'graze'; this.timer = 3 + this.random() * 4; this.lookYaw = 0; this.lookTimer = 0;
  this.tx = 0; this.tz = 0; this.stareFor = 0; this.lost = 0;
  this.earTimer = 1 + this.random() * 3; this.earFlick = 0; this.earSide = 1;
  this.tailTimer = 2 + this.random() * 4; this.tailFlick = 0;
  this.fit();
 }
 // The allowed range of its centre for its heading, so no part of it (the
 // horns, the tail) pokes through a hurdle; it is moved into it (a shuffle
 // of the feet as it turns).
 fit() {
  const s = Math.sin(this.heading), c = Math.cos(this.heading), f0 = GOAT.front, f1 = -GOAT.back, w = GOAT.half;
  // The footprint's four corners about its centre: the extremes in x and z.
  const ax = Math.abs(w * c), az = Math.abs(w * s);
  const x0 = Math.min(f0 * s, f1 * s) - ax, x1 = Math.max(f0 * s, f1 * s) + ax, z0 = Math.min(f0 * c, f1 * c) - az, z1 = Math.max(f0 * c, f1 * c) + az;
  const lo = -this.hx - x0, hi = this.hx - x1, loZ = -this.hz - z0, hiZ = this.hz - z1;
  this.x = lo > hi ? (lo + hi) / 2 : clamp(this.x, lo, hi); this.z = loZ > hiZ ? (loZ + hiZ) / 2 : clamp(this.z, loZ, hiZ);
 }
 // The footprint's corners now (pen-local), for the tests.
 corners() {
  const s = Math.sin(this.heading), c = Math.cos(this.heading), out = [];
  for (const f of [GOAT.front, -GOAT.back]) for (const w of [GOAT.half, -GOAT.half]) out.push([this.x + f * s + w * c, this.z + f * c - w * s]);
  return out;
 }
 next(state) {
  const r = this.random;
  this.state = state;
  if (state === 'graze') this.timer = 4 + r() * 6;
  else if (state === 'look') { this.timer = 2.5 + r() * 3; this.lookTimer = 0; }
  else if (state === 'step') {
   // A step or two to somewhere else in the pen.
   this.timer = 5;
   for (let k = 0; k < 8; k++) {
    const a = r() * Math.PI * 2, d = .35 + r() * .55, x = this.x + Math.sin(a) * d, z = this.z + Math.cos(a) * d;
    if (Math.abs(x) < this.hx - GOAT.front && Math.abs(z) < Math.max(.05, this.hz - GOAT.front)) { this.tx = x; this.tz = z; return; }
   }
   this.tx = (r() - .5) * (this.hx - GOAT.front) * 2; this.tz = 0;
  }
 }
 // One step of clock.dt s, the nearest player in this.player. (Time and the
 // player come in objects, not as number arguments, so a frame boxes no
 // numbers: nothing is allocated.)
 step(clock) {
  const r = this.random, dt = clock.dt, px = this.player.x, pz = this.player.z, near = this.player.d;
  if (near <= GOAT.notice) { if (this.state !== 'stare') { this.state = 'stare'; this.stareFor = 0; } this.lost = 0; }
  else if (this.state === 'stare') {
   this.lost = near > GOAT.forget ? this.lost + dt : 0;
   if (this.lost > 1.5) this.next('look');
  }
  let turn = 0, mx = 0, mz = 0, yaw = this.neckYaw;
  if (this.state === 'stare') {
   // The head first; the body follows once it has looked a moment.
   this.stareFor += dt;
   if (this.stareFor > .9) turn = wrap(Math.atan2(px - this.x, pz - this.z) - this.heading);
  } else {
   this.timer -= dt;
   if (this.state === 'graze') {
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) { this.lookYaw = (r() - .5) * .8; this.lookTimer = 1.5 + r() * 2.5; }
    yaw = this.lookYaw;
    if (this.timer <= 0) this.next(r() < .6 ? 'look' : 'step');
   } else if (this.state === 'look') {
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) { this.lookYaw = (r() - .5) * 2; this.lookTimer = .7 + r() * 1.6; }
    yaw = this.lookYaw;
    if (this.timer <= 0) this.next(r() < .65 ? 'graze' : 'step');
   } else if (this.state === 'step') {
    const dx = this.tx - this.x, dz = this.tz - this.z, d = Math.sqrt(dx * dx + dz * dz);
    yaw = 0;
    if (d < .03 || this.timer <= 0) this.next(r() < .7 ? 'graze' : 'look');
    else {
     turn = wrap(Math.atan2(dx, dz) - this.heading);
     if (Math.abs(turn) < .6) { const v = Math.min(GOAT.walk * dt, d); mx = dx / d * v; mz = dz / d * v; }
    }
   }
  }
  const dh = clamp(turn, -GOAT.bodyTurn * dt, GOAT.bodyTurn * dt);
  this.heading = wrap(this.heading + dh);
  const x0 = this.x, z0 = this.z;
  this.x += mx; this.z += mz;
  this.fit();
  // Legs: the stride runs with how far the feet moved (walking, turning on
  // the spot, a shuffle to fit).
  const travel = Math.sqrt((this.x - x0) ** 2 + (this.z - z0) ** 2) + Math.abs(dh) * .22;
  this.stride += travel * 11;
  this.moving = approach(this.moving, travel > 1e-4 ? 1 : 0, dt * 5);
  // The neck: at a stare it keeps the player in view while the body turns under it.
  if (this.state === 'stare') yaw = clamp(wrap(Math.atan2(px - this.x, pz - this.z) - this.heading), -GOAT.reach, GOAT.reach);
  this.neckYaw = approach(this.neckYaw, yaw, GOAT.neckTurn * dt);
  const bend = BEND[this.state], neck = bend[0], head = bend[1];
  // Grazing: the head jerks a little as it pulls at the straw, and chews.
  this.chew += dt;
  const pull = this.state === 'graze' ? .07 * Math.max(0, Math.sin(this.chew * 2.3)) ** 6 + .03 * Math.sin(this.chew * 9) : 0;
  this.neckBend = approach(this.neckBend, neck, GOAT.bend * dt);
  this.headBend = approach(this.headBend, head - pull, GOAT.bend * dt);
  // Ears: a flick now and then (a quick double twitch of one ear); pricked
  // forward while it stares. The tail: a flick or two, still while it stares.
  this.perk = approach(this.perk, this.state === 'stare' ? 1 : 0, dt * 3);
  this.earTimer -= dt;
  if (this.earTimer <= 0) { this.earSide = r() < .5 ? -1 : 1; this.earFlick = .4; this.earTimer = (this.state === 'stare' ? 5 : 2.2) + r() * 5; }
  const ear = this.earFlick > 0 ? Math.sin((1 - this.earFlick / .4) * Math.PI * 2) ** 2 : 0;
  this.earFlick = Math.max(0, this.earFlick - dt);
  this.earL = this.earSide < 0 ? ear : 0; this.earR = this.earSide > 0 ? ear : 0;
  // (The tail: a quick wag side to side, dying away, -1..1.)
  this.tailTimer -= dt;
  if (this.tailTimer <= 0) { if (this.state !== 'stare') this.tailFlick = .6; this.tailTimer = 3 + r() * 6; }
  this.tail = this.tailFlick > 0 ? Math.sin((1 - this.tailFlick / .6) * Math.PI * 4) * (this.tailFlick / .6) : 0;
  this.tailFlick = Math.max(0, this.tailFlick - dt);
 }
}

// ---------------------------------------------------------------------------
// Swinging things (pure): a loose shutter on one hinge and the tavern's sign.
// Shutter: θ, how far it has swung out from the wall (0 flat against it);
// driven by the wind (a slow push and the gusts, some of which slam it back
// to the wall), a little spring toward half open, damping, and a bounce off
// the wall. Sign: a pendulum on its hooks, pushed by the wind.
// (Each takes its state `s`: angle, speed, its own phase and x, and a clock:
// { t, dt }. It steps from the time it was last stepped, `s.t`, to the
// clock's (`dt` only for the first step): the view and the soundscape both
// step it (lifeOf stir, audio-hollow.js swings), and whichever comes second
// finds nothing to do. Each notes what the soundscape plays: a shutter the
// speed it met the wall at, `bang` (rad/s, from SHUTTER.knock up), and when,
// `bangAt`; the sign how far out it turned at the end of a swing, `turn`
// (rad), and when, `turnAt`.)
export const SHUTTER = Object.freeze({ rest: .45, spring: .9, damping: .55, bounce: .35, max: 2.3, knock: .15 });
const sinceLast = (s, clock) => s.t >= 0 ? Math.min(.1, clock.t - s.t) : clock.dt;
export function stepShutter(s, clock) {
 const t = clock.t, dt = sinceLast(s, clock), x = s.x || 0;
 if (!(dt > 0)) return;
 s.t = t;
 AIR.t = t + s.phase; AIR.x = x; blow(AIR);
 const w = AIR.wind, g = AIR.gust;
 // Every other gust pushes it back against the wall instead (a bang).
 const hb = Math.sin((Math.floor((t + s.phase - x / 6) / 13) + s.phase) * 127.1 + 311.7) * 43758.5453, back = hb - Math.floor(hb) < .45 ? -1 : 1;
 const push = .55 * (w - .5) + .5 * Math.sin((t + s.phase) * .83) + back * 4.2 * g;
 for (let left = dt; left > 1e-6; left -= 1 / 60) {
  const h = Math.min(left, 1 / 60);
  s.speed += (SHUTTER.spring * (SHUTTER.rest - s.angle) - SHUTTER.damping * s.speed + push) * h;
  s.angle += s.speed * h;
  if (s.angle < 0) {
   if (-s.speed > SHUTTER.knock) { s.bang = -s.speed; s.bangAt = t; }
   s.angle = 0; s.speed = -s.speed * SHUTTER.bounce;
  }
  if (s.angle > SHUTTER.max) { s.angle = SHUTTER.max; s.speed = Math.min(0, s.speed); }
 }
 // (Nothing returned: read s.angle. A number handed back would be boxed.)
}
export const SIGN = Object.freeze({ period: 2.1, damping: .7, push: .55 });
export function stepSign(s, clock) {
 const t = clock.t, dt = sinceLast(s, clock), k = (Math.PI * 2 / SIGN.period) ** 2;
 if (!(dt > 0)) return;
 s.t = t;
 AIR.t = t + s.phase; AIR.x = s.x || 0; blow(AIR);
 const w = AIR.wind;
 const push = SIGN.push * (w - .55) + .12 * Math.sin((t + s.phase) * 1.3);
 for (let left = dt; left > 1e-6; left -= 1 / 60) {
  const h = Math.min(left, 1 / 60), was = s.speed;
  s.speed += (-k * Math.sin(s.angle) - SIGN.damping * s.speed + push) * h;
  s.angle += s.speed * h;
  if (was !== 0 && (was > 0) !== (s.speed > 0)) { s.turn = Math.abs(s.angle); s.turnAt = t; }
 }
 // (Nothing returned: read s.angle. A number handed back would be boxed.)
}
// An effigy's turn on its string (a twisted string: slowly round one way and
// back) and its sway (x, z tilts), from its seed: pose { seed, yaw, tx, tz }.
export function effigyPose(pose, clock) {
 const seed = pose.seed, t = clock.t, out = pose, period = 18 + hash(seed) * 16, reach = 1.4 + hash(seed + 1) * 1.6;
 AIR.t = t; AIR.x = 0; blow(AIR);
 const w = AIR.wind;
 out.yaw = hash(seed + 2) * 6.28 + reach * Math.sin(t * Math.PI * 2 / period + seed) + .2 * Math.sin(t * .9 + seed * 3);
 out.tx = (.02 + .03 * w) * Math.sin(t * 1.9 + seed * 5);
 out.tz = (.02 + .03 * w) * Math.sin(t * 1.6 + seed * 7);
 return out;
}

// ---------------------------------------------------------------------------
// Chimney smoke (pure): puff i of `n` at time out.t, without any state: each slot
// lives `life` s and is born again, its offsets hashed from its slot and
// cycle, so nothing needs simulating while it is off screen. Rises slowing,
// leans east with the wind (more as it climbs), grows, fades in and out.
export const SMOKE = Object.freeze({ life: 6.5, rise: .75, drift: .42, size: [.3, 1.6], alpha: .3 });
export function smokePuff(i, n, out) {
 const t = out.t, offset = i / n * SMOKE.life, k = Math.floor((t + offset) / SMOKE.life), a = t + offset - k * SMOKE.life, u = a / SMOKE.life;
 const h1 = hash(i * 31.7 + k), h2 = hash(i * 17.3 + k * 1.7 + 5), h3 = hash(i * 7.1 + k * 2.3 + 9);
 AIR.t = t - a; AIR.x = 0; blow(AIR);
 const w = AIR.wind, rise = SMOKE.rise * (.8 + .4 * h1) * (a - .045 * a * a);
 out.x = (h2 - .5) * .12 + SMOKE.drift * (.6 + .6 * w) * Math.pow(a, 1.35);
 out.y = rise;
 out.z = (h3 - .5) * .12 + .15 * Math.sin(a * .8 + i) * u;
 out.size = SMOKE.size[0] + (SMOKE.size[1] - SMOKE.size[0]) * Math.sqrt(u) * (.8 + .4 * h1);
 out.alpha = SMOKE.alpha * (.7 + .3 * h2) * smooth(a / .9) * (1 - smooth((u - .45) / .55));
 return out;
}

// ---------------------------------------------------------------------------
// Geometry: a rest shape built from boxes, sticks and cones in its own frame
// (positions, normals, colours and an index), later rewritten by a matrix.
const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
class Shape {
 constructor() { this.pos = []; this.nrm = []; this.col = []; this.idx = []; }
 get count() { return this.pos.length / 3; }
 add(geometry, matrix, colour) {
  const p = geometry.attributes.position, n = geometry.attributes.normal, e = matrix.elements, base = this.count;
  const col = colour?.isColor ? colour : _c.set(colour), ne = _n.getNormalMatrix(matrix).elements;
  for (let i = 0; i < p.count; i++) {
   const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
   this.pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
   const a = n.getX(i), b = n.getY(i), c = n.getZ(i);
   let nx = ne[0] * a + ne[3] * b + ne[6] * c, ny = ne[1] * a + ne[4] * b + ne[7] * c, nz = ne[2] * a + ne[5] * b + ne[8] * c;
   const l = Math.hypot(nx, ny, nz) || 1; this.nrm.push(nx / l, ny / l, nz / l);
   this.col.push(col.r, col.g, col.b);
  }
  if (geometry.index) for (let i = 0; i < geometry.index.count; i++) this.idx.push(geometry.index.getX(i) + base);
  else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  return this;
 }
 // A box centred at (x, y, z), turned (rx, ry, rz; order XYZ).
 box(x, y, z, w, h, d, colour, rx = 0, ry = 0, rz = 0) {
  return this.add(UNIT_BOX, _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(w, h, d)), colour);
 }
 // A tapered stick from a to b ([x, y, z]), radius r0 at a and r1 at b.
 stick(a, b, r0, colour, r1 = r0, segments = 4) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], length = Math.hypot(dx, dy, dz);
  const geometry = new THREE.CylinderGeometry(r1, r0, length, segments, 1, true);
  _q.setFromUnitVectors(UP, _v.set(dx / length, dy / length, dz / length));
  this.add(geometry, _m.compose(_v.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, _s.set(1, 1, 1)), colour);
  geometry.dispose();
  return this;
 }
 // A cone pointing down from (x, y, z) (a beard).
 cone(x, y, z, r, h, colour, segments = 5) {
  const geometry = new THREE.ConeGeometry(r, h, segments);
  this.add(geometry, _m.compose(_v.set(x, y - h / 2, z), _q.setFromEuler(_e.set(Math.PI, 0, 0)), _s.set(1, 1, 1)), colour);
  geometry.dispose();
  return this;
 }
 // Every meshes' geometry under `root`, in root's frame, in its own colour.
 adopt(view, root) {
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert(), rel = new THREE.Matrix4();
  root.traverse(o => { if (o.isMesh) this.add(o.geometry, rel.multiplyMatrices(inverse, o.matrixWorld), o.material.color); });
  return this;
 }
 frozen() { return { pos: new Float32Array(this.pos), nrm: new Float32Array(this.nrm), col: new Float32Array(this.col), idx: this.idx, count: this.count }; }
}

// A rigid piece's vertices through a matrix (rotation and translation only)
// into a region's buffers, less the region's centre `c`.
function transformInto(e, part, pos, nrm, at, c) {
 const src = part.pos, sn = part.nrm, end = part.pos.length, cx = c.x, cy = c.y, cz = c.z;
 for (let i = 0; i < end; i += 3) {
  const x = src[i], y = src[i + 1], z = src[i + 2], o = at + i, a = sn[i], b = sn[i + 1], n = sn[i + 2];
  pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12] - cx;
  pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13] - cy;
  pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14] - cz;
  nrm[o] = e[0] * a + e[4] * b + e[8] * n;
  nrm[o + 1] = e[1] * a + e[5] * b + e[9] * n;
  nrm[o + 2] = e[2] * a + e[6] * b + e[10] * n;
 }
}

// A rig: rigid parts moved by matrices that `pose(clock, matrices)` sets
// (world space; clock: { t, dt }). `centre`/`reach`: a sphere holding it
// however it moves.
class Rig {
 constructor(parts, pose, centre, reach) {
  this.parts = parts.map(p => p.frozen()); this.pose = pose; this.centre = centre; this.reach = reach;
  this.matrices = this.parts.map(() => new THREE.Matrix4());
  this.count = this.parts.reduce((n, p) => n + p.count, 0);
 }
 write(pos, nrm, clock, centre) {
  this.pose(clock, this.matrices);
  let o = this.start;
  for (let k = 0; k < this.parts.length; k++) { transformInto(this.matrices[k].elements, this.parts[k], pos, nrm, o * 3, centre); o += this.parts[k].count; }
 }
 colours(out, at) { let o = at * 3; for (const p of this.parts) { out.set(p.col, o); o += p.col.length; } }
 indices(out, at, base) { let i = at; let b = base; for (const p of this.parts) { for (const v of p.idx) out[i++] = v + b; b += p.count; } return i; }
 get indexCount() { return this.parts.reduce((n, p) => n + p.idx.length, 0); }
}

// ---------------------------------------------------------------------------
// A region: one mesh for every moving piece in one part of the map, in the
// static scenery's baked material. Its vertices are rewritten when it is drawn.
class Region {
 constructor(view, x, z) {
  this.view = view; this.pieces = []; this.last = -1; this.fresh = true;
  // (Time reaches the pieces in this object: numbers passed as arguments
  // are boxed, a small allocation per call, which a frame must not make.)
  this.clock = { t: 0, dt: 0 };
  this.centre = new THREE.Vector3(x, view.gy ? view.gy(x, z) : 0, z);
  this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), view.bakedMaterial('plain'));
  this.mesh.position.copy(this.centre); this.mesh.matrixAutoUpdate = false; this.mesh.updateMatrix();
  this.mesh.castShadow = true; this.mesh.receiveShadow = true;
  this.mesh.userData.hollowLife = true;
  this.mesh.onBeforeRender = () => this.update();
  view.scene.add(this.mesh);
 }
 add(piece) { this.pieces.push(piece); this.build(); }
 build() {
  const vertices = this.pieces.reduce((n, p) => n + p.count, 0), indexCount = this.pieces.reduce((n, p) => n + p.indexCount, 0);
  const geometry = new THREE.BufferGeometry();
  this.pos = new Float32Array(vertices * 3); this.nrm = new Float32Array(vertices * 3);
  const col = new Float32Array(vertices * 3), index = vertices > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let at = 0, i = 0;
  for (const p of this.pieces) { p.start = at; p.colours(col, at); i = p.indices(index, i, at); at += p.count; }
  this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
  this.nrmAttr = new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', this.posAttr); geometry.setAttribute('normal', this.nrmAttr);
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3)); geometry.setIndex(new THREE.BufferAttribute(index, 1));
  // A sphere round everything however it moves (culling; never recomputed).
  const box = new THREE.Box3();
  for (const p of this.pieces) box.union(new THREE.Box3().setFromCenterAndSize(p.centre, _v.setScalar(p.reach * 2)));
  const sphere = new THREE.Sphere(); box.getBoundingSphere(sphere); sphere.center.sub(this.centre);
  geometry.boundingSphere = sphere;
  this.mesh.geometry.dispose(); this.mesh.geometry = geometry;
  this.last = -1; this.fresh = true; this.update(true);
 }
 // Rewrite every piece (on Potato and Performance no more often than
 // LIFE_DETAIL.step; twice in one frame, as Extreme's occlusion pass draws
 // the scene again, is skipped).
 update(force = false, now = performance.now() / 1000) {
  if (!force && now - this.last < Math.max(detailOf(this.view).step, .004)) return false;
  const dt = this.last < 0 ? 1 / 60 : Math.min(.1, now - this.last);
  this.last = now; this.clock.t = now; this.clock.dt = dt;
  // (A piece that never moves, `fixed`, is written only once, after a build.)
  for (let i = 0; i < this.pieces.length; i++) if (this.fresh || !this.pieces[i].fixed) this.pieces[i].write(this.pos, this.nrm, this.clock, this.centre);
  this.fresh = false;
  this.posAttr.needsUpdate = true; this.nrmAttr.needsUpdate = true;
  return true;
 }
}

// The view's life: its regions and the smoke, made on first use.
export function lifeOf(view) {
 if (view.hollowLife) return view.hollowLife;
 const life = { regions: new Map(), smoke: null, goats: [], shutters: [], signs: [], effigies: [], linens: [], clock: { t: 0, dt: 1 / 60 } };
 // The soundscape steps the shutters and the sign within `reach` of (x, z)
 // to time `t` (audio-hollow.js swings), so one out of sight still bangs;
 // the view's own step then finds them there already.
 life.stir = (t, x, z, reach) => {
  life.clock.t = t;
  for (let i = 0; i < life.shutters.length; i++) { const s = life.shutters[i]; if (Math.abs(s.x - x) < reach && Math.abs(s.z - z) < reach) stepShutter(s, life.clock); }
  for (let i = 0; i < life.signs.length; i++) { const s = life.signs[i]; if (Math.abs(s.x - x) < reach && Math.abs(s.z - z) < reach) stepSign(s, life.clock); }
 };
 life.region = (x, z) => {
  let best = null, name = null;
  for (const [id, [rx, rz]] of Object.entries(LIFE_REGIONS)) { const d = Math.hypot(rx - x, rz - z); if (!best || d < best) { best = d; name = id; } }
  if (!life.regions.has(name)) life.regions.set(name, new Region(view, ...LIFE_REGIONS[name]));
  return life.regions.get(name);
 };
 return (view.hollowLife = life);
}

// ---------------------------------------------------------------------------
// The props (world-build.js makeProp): solid parts into `g` (under the
// static root, merged by batch()), moving parts into their region.
export function makeLifeProp(view, p, g) {
 if (p.type === 'goatPen') goatPen(view, p, g);
 else if (p.type === 'laundryLine') laundryLine(view, p, g);
 else if (p.type === 'effigy') effigy(view, p); // (nothing of it is static)
}

// The prop's frame: local (x, y, z) -> world, and the ground under a local point.
function frameOf(view, p) {
 const c = Math.cos(p.angle || 0), s = Math.sin(p.angle || 0), base = view.gy(p.x, p.z);
 const world = (lx, lz) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
 const matrix = new THREE.Matrix4().makeRotationY(p.angle || 0).setPosition(p.x, base, p.z);
 return { c, s, base, world, matrix, lift: (lx, lz) => view.gy(...world(lx, lz)) - base };
}

// The pen: wattle hurdles (stakes every 0.42 m, rods woven between them in
// and out, row on row), a gate hurdle tied shut with twine on the east end,
// trampled mud inside with hay and straw, a bucket; and the goat.
function goatPen(view, p, g) {
 const random = seededRandom(p.x * 131 + p.z * 977 + 3), f = frameOf(view, p);
 const box = (x, y, z, w, h, d, colour, rx = 0, ry = 0, rz = 0) => { const m = view.box(x, y, z, w, h, d, colour, g); m.rotation.set(rx, ry, rz); return m; };
 const hurdle = (ax, az, bx, bz, height, gate) => {
  const length = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / length, uz = (bz - az) / length, yaw = Math.atan2(-uz, ux);
  const stakes = Math.max(2, Math.round(length / .42)), gap = length / stakes;
  // Stakes, their tops standing proud of the weave.
  for (let i = 0; i <= stakes; i++) {
   const x = ax + ux * gap * i, z = az + uz * gap * i, y = f.lift(x, z), h = height + .14 + random() * .08;
   view.cylinder(x, y + h / 2 - .06, z, .032, h, i % 3 ? C.stake : C.postDark, g, 5).rotation.set((random() - .5) * .07, 0, (random() - .5) * .07);
  }
  // Rows of withies, each over two stakes, woven in and out: a row starts
  // at alternate stakes, so the weave shows on every face; the rows' tones
  // band the hurdle, and a thicker twisted binder runs along its top.
  for (let row = 0, y = .09; y < height - .06; row++, y += .075) {
   const tone = row % 3;
   for (let i = row % 2 ? -1 : 0; i < stakes; i += 2) {
    const from = Math.max(0, i) * gap, to = Math.min(stakes, i + 2) * gap, mid = (from + to) / 2, side = ((i + row) % 4 < 2 ? 1 : -1) * .024;
    const x = ax + ux * mid - uz * side, z = az + uz * mid + ux * side;
    box(x, f.lift(x, z) + y, z, to - from + .04, .068, .03, C.withy[(tone + Math.floor(random() * 2.4)) % 4], 0, yaw, (random() - .5) * .05);
   }
  }
  for (let i = 0; i < stakes; i++) {
   const mid = (i + .5) * gap, x = ax + ux * mid, z = az + uz * mid;
   box(x, f.lift(x, z) + height - .03, z, gap + .05, .055, .065, i % 2 ? C.withy[2] : C.withy[0], (random() - .5) * .3, yaw, 0);
  }
  if (gate) {
   // The gate: a hurdle leaned against the end, tied at the top with twine.
   const x = (ax + bx) / 2 + uz * .07, z = (az + bz) / 2 - ux * .07;
   box(x, f.lift(x, z) + .5, z, length * .7, .86, .04, C.withy[2], .06, yaw, 0);
   for (const k of [-1, 1]) { const tx = x + ux * k * length * .36, tz = z + uz * k * length * .36; box(tx, f.lift(tx, tz) + height - .06, tz, .05, .09, .09, C.twine, 0, yaw, 0); }
  }
 };
 const { hx, hz } = PEN_INSIDE, H = .95;
 hurdle(-hx - .1, -hz - .1, hx + .1, -hz - .1, H);
 hurdle(-hx - .1, hz + .1, hx + .1, hz + .1, H);
 hurdle(-hx - .1, -hz - .1, -hx - .1, hz + .1, H);
 hurdle(hx + .1, -hz - .1, hx + .1, hz + .1, H, true);
 // The floor: trampled mud laid over the ground (drawn above the terrain mesh
 // by its allowed error), then hay and straw, droppings, the bucket.
 const ground = view.ground, lift = (view.terrainError || .035) + .012, cols = 6, rows = 4;
 const floor = new THREE.PlaneGeometry(hx * 2 + .1, hz * 2 + .1, cols, rows); floor.rotateX(-Math.PI / 2);
 const fp = floor.attributes.position;
 for (let i = 0; i < fp.count; i++) {
  const [wx, wz] = f.world(fp.getX(i), fp.getZ(i));
  const top = ground && !ground.flat ? Math.max(ground.heightAt(wx, wz), ground.drawnHeightAt(wx, wz)) : 0;
  fp.setY(i, top + lift - f.base + (random() - .5) * .01);
 }
 floor.computeVertexNormals();
 view.noShadows(view.mesh(floor, C.mud, 0, 0, 0, g));
 for (let i = 0; i < 26; i++) {
  const x = (random() - .5) * hx * 1.9, z = (random() - .5) * hz * 1.8, pale = random() < .4;
  view.noShadows(box(x, f.lift(x, z) + lift + .012, z, .12 + random() * .16, .015, .025, pale ? C.straw : C.strawDull, 0, random() * 3.1, 0));
 }
 // A heap of hay in the west end, pulled about.
 for (let i = 0; i < 5; i++) { const x = -hx + .35 + random() * .3, z = (random() - .5) * .9, m = view.mesh(new THREE.IcosahedronGeometry(.2 + random() * .08, 0), i % 2 ? C.straw : C.strawPale, x, f.lift(x, z) + .05, z, g); m.scale.set(1.3, .35, 1); m.rotation.y = random() * 3; }
 for (let i = 0; i < 7; i++) { const x = (random() - .5) * hx * 1.6, z = (random() - .5) * hz * 1.6; view.noShadows(box(x, f.lift(x, z) + lift + .02, z, .035, .03, .035, C.dung)); }
 const bx = hx - .28, bz = -hz + .26, by = f.lift(bx, bz);
 view.cylinder(bx, by + .13, bz, .15, .26, C.bucket, g, 8, .17);
 for (const y of [.05, .21]) view.cylinder(bx, by + y, bz, .158 + (y > .1 ? .015 : 0), .03, C.iron, g, 8);
 view.cylinder(bx, by + .255, bz, .15, .012, C.water, g, 8);
 // The goat.
 goat(view, p, f, 1 + Math.round(Math.abs(p.x * 13 + p.z * 7)));
}

// The goat: a big black billy (Black Phillip), about 0.8 m at the withers,
// long pale horns sweeping back and out, a beard, two small amber eyes.
// Ten rigid parts in its region's one mesh: body, neck, head (with horns,
// beard and eyes), two ears, tail, four legs.
function goat(view, p, f, seed) {
 const mind = new GoatMind(seed), life = lifeOf(view);
 life.goats.push({ mind, prop: p });
 // Body frame: origin on the ground under its middle, +z forward.
 const body = new Shape()
  .box(0, .64, -.03, .34, .3, .76, C.coat)
  .box(0, .69, .25, .33, .38, .3, C.coat2)
  .box(0, .66, -.33, .31, .3, .24, C.coat)
  .box(0, .5, -.02, .24, .07, .58, C.belly);
 // A buck's long hair: a fringe along the belly and the shoulders.
 for (const s of [-1, 1]) for (let k = 0; k < 4; k++) body.box(s * .15, .47, -.24 + k * .17, .05, .13, .14, C.shag, 0, 0, s * .15);
 body.box(0, .86, .16, .1, .06, .3, C.shag, -.2);
 // The spine's ridge, a shade lighter, so the back reads from above.
 body.box(0, .81, -.1, .07, .03, .62, C.ridge);
 // Neck frame: pivot at the withers; the neck runs up and forward (50° up).
 const NECK = [0, .78, .3], AX = [0, .77, .64], LEN = .44;
 const neck = new Shape()
  .box(0, AX[1] * LEN / 2, AX[2] * LEN / 2, .16, LEN + .08, .18, C.coat, Math.atan2(AX[2], AX[1]))
  .box(0, AX[1] * LEN / 2 + .05, AX[2] * LEN / 2 - .08, .06, LEN, .08, C.shag, Math.atan2(AX[2], AX[1]));
 // Head frame: pivot at the top of the neck, +z where it looks.
 const head = new Shape()
  .box(0, .02, .06, .16, .16, .2, C.coat)
  .box(0, -.05, .2, .11, .11, .17, C.coat2, .35)
  .box(0, -.1, .28, .09, .05, .05, C.nose, .35)
  .cone(0, -.1, .16, .045, .2, C.beard)
  .box(-.083, .05, .12, .02, .035, .045, EYE)
  .box(.083, .05, .12, .02, .035, .045, EYE);
 // The horns: from the top of the skull back and out, then curving down.
 const HORN = [[.04, .09, .05], [.08, .19, -.01], [.14, .26, -.12], [.21, .26, -.25], [.26, .2, -.36], [.27, .11, -.41]];
 for (const s of [-1, 1]) for (let k = 0; k < HORN.length - 1; k++) {
  const a = HORN[k], b = HORN[k + 1], r0 = .038 - k * .005, colour = k < 2 ? C.horn : k < 4 ? C.hornMid : C.hornTip;
  head.stick([s * a[0], a[1], a[2]], [s * (b[0] + (b[0] - a[0]) * .15), b[1] + (b[1] - a[1]) * .15, b[2] + (b[2] - a[2]) * .15], r0, colour, r0 - .004, 5);
 }
 // Ears (pivot at their base on the head): hanging out sideways and down.
 const ear = s => new Shape().box(s * .07, 0, 0, .14, .025, .065, C.coat2);
 const earPivot = [[-.085, .06, .02], [.085, .06, .02]];
 // Tail: a short tuft sticking up at the rump.
 const tail = new Shape().box(0, .07, 0, .06, .15, .05, C.coat2);
 // Legs (pivot at the hip or shoulder), each a shank and a hoof.
 const HIPS = [[-.11, .55, .27], [.11, .55, .27], [-.11, .55, -.31], [.11, .55, -.31]];
 const leg = () => new Shape().box(0, -.25, 0, .07, .5, .075, C.leg).box(0, -.52, .012, .08, .06, .1, C.hoof);
 const parts = [body, neck, head, ear(-1), ear(1), tail, leg(), leg(), leg(), leg()];
 // The frame's numbers and the joints' fixed offsets (the neck at the
 // withers, the head at the neck's top, the ears, the tail, the hips):
 // nothing is allocated per frame.
 const v = new Float64Array(17), OFFSET = new Float64Array([...NECK, 0, AX[1] * LEN, AX[2] * LEN, ...earPivot[0], ...earPivot[1], 0, .76, -.44, ...HIPS.flat()]);
 const look = { gx: 0, gz: 0 }, seen = mind.player;
 const consider = q => {
  const dx = q.x - look.gx, dz = q.z - look.gz, d = Math.sqrt(dx * dx + dz * dz);
  if (d < seen.d) { seen.d = d; const ox = q.x - p.x, oz = q.z - p.z; seen.x = ox * f.c - oz * f.s; seen.z = ox * f.s + oz * f.c; }
 };
 const avatar = a => { if (a.root?.visible && a.root.parent) consider(a.root.position); };
 const pose = (clock, ms) => {
  // The nearest player it can see (you, and every other body the view draws), pen-local.
  seen.d = Infinity; look.gx = p.x + mind.x * f.c + mind.z * f.s; look.gz = p.z - mind.x * f.s + mind.z * f.c;
  const me = view.player;
  if (me && me.visible !== false) consider(me.position);
  view.remote?.avatars?.forEach(avatar);
  mind.step(clock);
  // The frame's numbers in `v` (see turnX...): where it stands, a breath and
  // a bob as it walks, how it faces, the neck, the head, ears, tail, legs.
  v[0] = mind.x; v[1] = .006 * Math.sin(clock.t * 1.7 + seed) + .018 * mind.moving * Math.abs(Math.sin(mind.stride)); v[2] = mind.z;
  v[3] = mind.heading; v[4] = mind.neckYaw; v[5] = mind.neckBend; v[6] = .25 + mind.headBend;
  v[7] = .5 * mind.perk; v[8] = .45 - .35 * mind.perk - .75 * mind.earL; v[9] = -.5 * mind.perk; v[10] = -.45 + .35 * mind.perk + .75 * mind.earR;
  v[11] = -.45; v[12] = .6 * mind.tail;
  for (let k = 0; k < 4; k++) v[13 + k] = .42 * mind.moving * Math.sin(mind.stride + (k === 0 || k === 3 ? 0 : Math.PI));
  const body = ms[0];
  body.copy(f.matrix); shift(body, v, 0); turnY(body, v, 3);
  // Neck: turned, then bent down or up; the head at its top (tipped down a little at rest).
  ms[1].copy(body); shift(ms[1], OFFSET, 0); turnY(ms[1], v, 4); turnX(ms[1], v, 5);
  ms[2].copy(ms[1]); shift(ms[2], OFFSET, 3); turnX(ms[2], v, 6);
  // Ears: hanging down and out; a flick lifts one; pricked forward at a stare.
  ms[3].copy(ms[2]); shift(ms[3], OFFSET, 6); turnY(ms[3], v, 7); turnZ(ms[3], v, 8);
  ms[4].copy(ms[2]); shift(ms[4], OFFSET, 9); turnY(ms[4], v, 9); turnZ(ms[4], v, 10);
  // Tail: up at the rump, wagged.
  ms[5].copy(body); shift(ms[5], OFFSET, 12); turnX(ms[5], v, 11); turnZ(ms[5], v, 12);
  // Legs: diagonal pairs swing together as it walks or turns.
  for (let k = 0; k < 4; k++) { ms[6 + k].copy(body); shift(ms[6 + k], OFFSET, 15 + k * 3); turnX(ms[6 + k], v, 13 + k); }
 };
 const centre = new THREE.Vector3(p.x, f.base + .6, p.z);
 life.region(p.x, p.z).add(new Rig(parts, pose, centre, 2.2));
}

// The washing line: two posts with a fork at the top, the line sagging
// between them with its pegs, a basket on the ground; the linens move.
function laundryLine(view, p, g) {
 const random = seededRandom(p.x * 71 + p.z * 13 + 5), f = frameOf(view, p), half = 1.6, top = 1.86, sag = .13;
 const lineY = u => top - sag * (1 - (u / half) ** 2);
 for (const x of [-half, half]) {
  const y = f.lift(x, 0);
  view.box(x, y + .93, 0, .11, 1.9, .11, C.post, g).rotation.z = (random() - .5) * .04;
  for (const s of [-1, 1]) view.box(x + s * .05, y + 1.93, 0, .05, .18, .05, C.postDark, g).rotation.z = s * -.35;
 }
 // The line: a rope in eight pieces along its sag.
 for (let k = 0; k < 8; k++) {
  const u0 = -half + k * half / 4, u1 = u0 + half / 4, y0 = lineY(u0), y1 = lineY(u1);
  view.noShadows(view.box((u0 + u1) / 2, (y0 + y1) / 2, 0, Math.hypot(u1 - u0, y1 - y0) + .01, .015, .015, C.line, g)).rotation.z = Math.atan2(y1 - y0, u1 - u0);
 }
 // The linens (from west to east): [u0, u1, height, colour, hem colour, cols, rows, stiffness, taper].
 // (All of one shape, so the per-frame maths reads them the same way.)
 const LINENS = [
  { u0: -1.42, u1: -.3, h: 1.02, w: 0, colour: C.sheet, hem: C.sheetHem, cols: 5, rows: 4, give: .75, sleeves: 0, flare: 0, corner: false },
  { u0: -.14, u1: .52, h: .7, w: 0, colour: C.shirt, hem: C.shirt, cols: 3, rows: 3, give: 1.02, sleeves: .5, flare: 0, corner: false },
  { u0: .68, u1: 1.08, h: .74, w: 0, colour: C.gown, hem: C.gownHem, cols: 2, rows: 4, give: 1.25, sleeves: 0, flare: .1, corner: false },
  { u0: 1.3, u1: 1.3, h: .46, w: .38, colour: C.apron, hem: C.apron, cols: 2, rows: 3, give: 1.4, sleeves: 0, flare: 0, corner: true },
 ];
 const life = lifeOf(view), region = life.region(p.x, p.z);
 LINENS.forEach((linen, i) => {
  for (const u of linen.corner ? [linen.u0] : [linen.u0 + .04, linen.u1 - .04]) view.noShadows(view.box(u, lineY(u) + .02, 0, .025, .07, .03, C.peg, g));
  const cloth = new Cloth(linen, { top, sag, half }, f.matrix, i * 1.7 + p.x, p.x + (linen.u0 + linen.u1) / 2);
  life.linens.push(cloth);
  region.add(cloth);
 });
 // A basket left under the line, a sheet still folded in it; a peg dropped.
 const bx = -1.05, bz = .5, by = f.lift(bx, bz);
 view.cylinder(bx, by + .12, bz, .24, .24, C.basket, g, 9, .29);
 view.cylinder(bx, by + .245, bz, .3, .03, C.basketDark, g, 9);
 view.box(bx + .02, by + .22, bz, .36, .07, .26, C.sheet, g).rotation.y = .3;
 view.noShadows(view.box(-.4, f.lift(-.4, .35) + .012, .35, .025, .02, .07, C.peg, g)).rotation.y = 1.1;
}

// A linen on the line: a grid hung from the line (or from one peg), bent by
// the wind each frame: the whole of it swings out and lifts (more toward its
// hem), a wave runs along it, its middle billows, its hem flutters and trails
// east. Front and back are separate faces (the material is one-sided).
class Cloth {
 constructor(spec, line, frame, seed, x) {
  // `line`: its top at the posts, its sag, half its length (the line's frame).
  const lineY = u => line.top - line.sag * (1 - (u / line.half) ** 2);
  this.spec = spec; this.line = line; this.frame = frame; this.seed = seed; this.x = x;
  const { cols, rows } = spec, n = (cols + 1) * (rows + 1);
  this.cols = cols; this.rows = rows; this.grid = n;
  this.count = n * 2 + (spec.sleeves ? 2 * 2 * 4 : 0);
  this.local = new Float32Array(n * 3); this.normals = new Float32Array(n * 3);
  const c0 = new THREE.Color(spec.colour), c1 = new THREE.Color(spec.hem);
  this.col = new Float32Array(this.count * 3);
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
   const k = j * (cols + 1) + i, v = j / rows, fade = smooth((v - .7) / .3);
   const r = c0.r + (c1.r - c0.r) * fade, gg = c0.g + (c1.g - c0.g) * fade, b = c0.b + (c1.b - c0.b) * fade, shade = .94 + .06 * Math.sin(i * 2.1 + j * 1.3);
   for (const side of [0, 1]) this.col.set([r * shade, gg * shade, b * shade], ((side * n) + k) * 3);
  }
  if (spec.sleeves) for (let k = 0; k < 16; k++) this.col.set([c0.r * .9, c0.g * .9, c0.b * .9], (2 * n + k) * 3);
  // Sleeves: two strips down the shirt's sides (4 vertices a side, front and back).
  const idx = [];
  for (const side of [0, 1]) for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
   const a = side * n + j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
   if (side === 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  if (spec.sleeves) for (let s = 0; s < 2; s++) { const o = 2 * n + s * 8; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3, o + 4, o + 5, o + 6, o + 5, o + 7, o + 6); }
  this.idx = idx; this.indexCount = idx.length;
  const reach = Math.max(spec.h, (spec.u1 - spec.u0) / 2 + (spec.w || 0)) + .8;
  this.centre = new THREE.Vector3((spec.u0 + spec.u1) / 2, lineY((spec.u0 + spec.u1) / 2) - spec.h / 2, 0).applyMatrix4(frame); this.reach = reach;
  this.lowest = Infinity; // (the tests read it: the hem never reaches the ground)
  this.scratch = new Float64Array(3); this.w = .5; this.g = 0; this.start = 0;
 }
 colours(out, at) { out.set(this.col, at * 3); }
 indices(out, at, base) { let i = at; for (const v of this.idx) out[i++] = v + base; return i; }
 // The linen's own point for grid (i, j) at clock.t, in the line's frame
 // (the wind this.w and gust this.g are the frame's, worked out once).
 point(i, j, clock, out) {
  const spec = this.spec, line = this.line, t = clock.t, v = j / this.rows, u = i / this.cols, w = this.w, g = this.g;
  let x, top, down;
  if (spec.corner) {
   // Hanging by one peg (the other lost): the square turned about the peg
   // till its far corner is nearly under it, swinging a little.
   const swing = .68 + .08 * Math.sin(t * 1.1 + this.seed) + .12 * g, cx = u * spec.w, cy = v * spec.h;
   x = spec.u0 + cx * Math.cos(swing) - cy * Math.sin(swing); down = cx * Math.sin(swing) + cy * Math.cos(swing);
   const r = spec.u0 / line.half; top = line.top - line.sag * (1 - r * r);
  } else {
   const width = spec.u1 - spec.u0, flare = spec.flare * v;
   x = spec.u0 - flare + (width + flare * 2) * u; down = v * spec.h;
   const r = (spec.u0 + width * u) / line.half; top = line.top - line.sag * (1 - r * r);
  }
  // The swing out (toward +z: the south, the camera) and the lift that comes with it.
  const give = spec.give, phase = this.seed;
  const lean = give * (.1 + .16 * w + .28 * g) + give * .08 * Math.sin(t * 1.3 + phase - 2.2 * x);
  const flutter = give * .09 * Math.sin(t * 4.3 + phase * 2 + 5 * x + 4 * v) * v;
  const a = (lean + flutter) * (.35 + .65 * v);
  const billow = .06 * give * (.4 + g) * Math.sin(Math.PI * Math.min(1, Math.max(0, u))) * Math.sin(Math.PI * v);
  out[0] = x + .05 * give * v * v * (.5 + g);
  out[1] = top - down * Math.cos(a);
  out[2] = down * Math.sin(a) + billow;
 }
 write(pos, nrm, clock, centre) {
  const cols = this.cols, rows = this.rows, local = this.local, normals = this.normals, grid = this.grid, e = this.frame.elements, p = this.scratch;
  const cx = centre.x, cy = centre.y, cz = centre.z, at = this.start;
  AIR.t = clock.t + this.seed * .37; AIR.x = this.x; blow(AIR); this.w = AIR.wind; this.g = AIR.gust;
  // (The points are kept in `local`, nothing is allocated.)
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) { this.point(i, j, clock, p); const k = (j * (cols + 1) + i) * 3; local[k] = p[0]; local[k + 1] = p[1]; local[k + 2] = p[2]; }
  // Normals from the grid's neighbours.
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
   const k = (j * (cols + 1) + i) * 3, l = (j * (cols + 1) + Math.max(0, i - 1)) * 3, r = (j * (cols + 1) + Math.min(cols, i + 1)) * 3;
   const u = (Math.max(0, j - 1) * (cols + 1) + i) * 3, d = (Math.min(rows, j + 1) * (cols + 1) + i) * 3;
   const ax = local[r] - local[l], ay = local[r + 1] - local[l + 1], az = local[r + 2] - local[l + 2];
   const bx = local[d] - local[u], by = local[d + 1] - local[u + 1], bz = local[d + 2] - local[u + 2];
   const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
   normals[k] = -nx / len; normals[k + 1] = -ny / len; normals[k + 2] = -nz / len;
  }
  // Through the line's frame into the region's buffers: the front, then the
  // back (the same points, the normal turned round).
  let lowest = Infinity;
  for (let k = 0; k < grid; k++) {
   const x = local[k * 3], y = local[k * 3 + 1], z = local[k * 3 + 2], nx = normals[k * 3], ny = normals[k * 3 + 1], nz = normals[k * 3 + 2];
   if (y < lowest) lowest = y;
   const px = e[0] * x + e[4] * y + e[8] * z + e[12] - cx, py = e[1] * x + e[5] * y + e[9] * z + e[13] - cy, pz = e[2] * x + e[6] * y + e[10] * z + e[14] - cz;
   const mx = e[0] * nx + e[4] * ny + e[8] * nz, my = e[1] * nx + e[5] * ny + e[9] * nz, mz = e[2] * nx + e[6] * ny + e[10] * nz;
   const f = (at + k) * 3, b = (at + grid + k) * 3;
   pos[f] = px; pos[f + 1] = py; pos[f + 2] = pz; nrm[f] = mx; nrm[f + 1] = my; nrm[f + 2] = mz;
   pos[b] = px; pos[b + 1] = py; pos[b + 2] = pz; nrm[b] = -mx; nrm[b + 1] = -my; nrm[b + 2] = -mz;
  }
  if (this.spec.sleeves) {
   // Each sleeve hangs from a shoulder (the top corner) down the side: a
   // strip 12 cm wide as long as `sleeves`, front and back.
   for (let s = 0; s < 2; s++) {
    const k0 = s ? cols : 0, kx = local[k0 * 3], ky = local[k0 * 3 + 1], kz = local[k0 * 3 + 2], side = s ? 1 : -1;
    const kb = (Math.min(rows, 2) * (cols + 1) + k0) * 3, bx = local[kb] - kx, by = local[kb + 1] - ky, bz = local[kb + 2] - kz;
    const L = this.spec.sleeves / Math.max(.01, Math.sqrt(bx * bx + by * by + bz * bz)), nx = normals[k0 * 3], ny = normals[k0 * 3 + 1], nz = normals[k0 * 3 + 2];
    for (let q = 0; q < 8; q++) {
     const back = q < 4 ? 1 : -1, corner = q & 3, low = corner >= 2, out = corner & 1 ? .12 : 0;
     const x = kx + side * (.01 + out) + (low ? bx * L + side * .01 : 0), y = ky + (low ? by * L : -.02), z = kz + .012 * back + (low ? bz * L : 0);
     const o = (at + 2 * grid + s * 8 + q) * 3, mx = (e[0] * nx + e[4] * ny + e[8] * nz) * back, my = (e[1] * nx + e[5] * ny + e[9] * nz) * back, mz = (e[2] * nx + e[6] * ny + e[10] * nz) * back;
     pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12] - cx; pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13] - cy; pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14] - cz;
     nrm[o] = mx; nrm[o + 1] = my; nrm[o + 2] = mz;
    }
   }
  }
  this.lowest = lowest;
 }
}

// A stick effigy hanging from a dead limb reaching in from its tree toward
// the track. The limb is static (merged); the figure, lashed twigs with its
// string, turns on the string.
function effigy(view, p) {
 const random = seededRandom(p.x * 37 + p.z * 91 + 11), f = frameOf(view, p);
 const [tx, tz] = p.tree, hang = p.hang ?? 3, scale = p.scale ?? 1;
 const treeBase = view.gy(tx, tz) - f.base;
 // The limb: from inside the trunk, rising a little, a knuckle, to the end.
 // (It joins the woods' moving mesh as a piece that never moves, written
 // once: in the static root it would start a batch of its own in the woods'
 // cells, two more draws.)
 const dx = p.x - tx, dz = p.z - tz, reach = Math.hypot(dx, dz), ux = dx / reach, uz = dz / reach;
 const start = [tx - p.x + ux * .15, treeBase + hang - .35, tz - p.z + uz * .15], knuckle = [start[0] + ux * reach * .55 + uz * .12, hang - .08, start[2] + uz * reach * .55 - ux * .12], end = [0, hang + .02, 0];
 const limb = new Shape()
  .stick(start, knuckle, .085, C.bark, .055, 5)
  .stick(knuckle, [end[0] + ux * .25, end[1] - .02, end[2] + uz * .25], .055, C.bark, .03, 5);
 // Two dead twigs off it.
 for (let k = 0; k < 2; k++) {
  const at = [knuckle[0] + ux * .2 * k, knuckle[1] + .02, knuckle[2] + uz * .2 * k], a = random() * 6.28;
  limb.stick(at, [at[0] + Math.cos(a) * .35, at[1] + .15 + random() * .2, at[2] + Math.sin(a) * .35], .02, C.trunk, .008, 4);
 }
 // The figure, in its own frame: the string's top at the origin, hanging down.
 const fig = new Shape(), s = scale, string = p.string ?? .45;
 const colour = () => C.stick[Math.floor(random() * C.stick.length)];
 fig.stick([0, .02, 0], [0, -string, 0], .006, C.twine, .006, 3);
 const top = -string, spine = 1.1 * s;
 // A spine, a crossbar of arms, splayed legs, a small triangle of a head:
 // bigger and thicker than life (a figure about 1.3 m tall, its arms 0.9 m
 // across), so it reads from the camera's height.
 fig.stick([0, top + .02, 0], [0, top - spine, .01], .045 * s, colour(), .034 * s);
 const armY = top - .27 * s, armL = .46 * s, tilt = (random() - .5) * .14;
 fig.stick([-armL, armY - tilt, .01], [armL, armY + tilt, -.01], .036 * s, colour(), .028 * s);
 const hip = top - spine * .62;
 for (const side of [-1, 1]) fig.stick([0, hip, 0], [side * .26 * s, top - spine - .22 * s, side * .04], .032 * s, colour(), .022 * s);
 const hy = top - .02, hr = .14 * s;
 for (let k = 0; k < 3; k++) {
  const a0 = k / 3 * Math.PI * 2, a1 = (k + 1) / 3 * Math.PI * 2;
  fig.stick([Math.sin(a0) * hr, hy - hr + Math.cos(a0) * hr, .02], [Math.sin(a1) * hr, hy - hr + Math.cos(a1) * hr, .02], .02 * s, colour(), .02 * s, 3);
 }
 // Twigs sticking out at odd angles (a thorny, made look).
 for (let k = 0; k < 4; k++) {
  const y = top - (.15 + random() * .7) * s, a = random() * 6.28, l = (.18 + random() * .18) * s;
  fig.stick([0, y, 0], [Math.cos(a) * l, y + (random() - .3) * l, Math.sin(a) * l * .5], .018 * s, colour(), .008 * s, 3);
 }
 // Twine lashings where the sticks cross.
 for (const y of [armY, hip]) fig.box(0, y, 0, .1 * s, .07 * s, .1 * s, C.lash, 0, random(), 0);
 const seed = Math.abs(p.x * 3.1 + p.z * 1.7) % 97, at = new THREE.Matrix4().makeTranslation(p.x, f.base + hang, p.z), pose = { seed, yaw: 0, tx: 0, tz: 0 }, v = new Float64Array(3);
 const figure = (clock, ms) => {
  effigyPose(pose, clock);
  v[0] = pose.yaw; v[1] = pose.tx; v[2] = pose.tz;
  ms[0].copy(at); turnY(ms[0], v, 0); turnX(ms[0], v, 1); turnZ(ms[0], v, 2);
 };
 const life = lifeOf(view), ground = new THREE.Matrix4().makeTranslation(p.x, f.base, p.z);
 life.effigies.push({ prop: p, pose });
 const branch = new Rig([limb], (clock, ms) => ms[0].copy(ground), new THREE.Vector3(p.x + (tx - p.x) / 2, f.base + hang, p.z + (tz - p.z) / 2), reach / 2 + 1);
 branch.fixed = true;
 life.region(p.x, p.z).add(branch);
 life.region(p.x, p.z).add(new Rig([fig], figure, new THREE.Vector3(p.x, f.base + hang - .8, p.z), 1.8));
}

// ---------------------------------------------------------------------------
// The buildings' moving parts (world/colonial-buildings.js, at the end of
// makeColonialBuilding): groups it marked are taken out of the building's
// static group (so the static merge never has them) and swung here:
//  - userData.lifeSwing = 'sign': the tavern's sign and its hooks, pivot the arm;
//  - userData.lifeShutter = { s, width, height, colour }: a loose shutter's
//    top hinge (+x along the wall away from the window times s, +z out).
// `smoke`: world points of flues that smoke.
// `building`: the id of the building whose flues these are (its roof's fade
// takes the smoke with it).
export function takeLifeParts(view, g, smoke = [], building = null) {
 const marked = [];
 g.traverse(o => { if (o.userData.lifeSwing || o.userData.lifeShutter) marked.push(o); });
 if (!marked.length && !smoke.length) return;
 g.updateMatrixWorld(true);
 const life = lifeOf(view);
 for (const o of marked) {
  const base = o.matrixWorld.clone(), x = base.elements[12], z = base.elements[14];
  if (o.userData.lifeSwing === 'sign') {
   const shape = new Shape().adopt(view, o), state = { angle: 0, speed: 0, phase: hash(x + z) * 9, x, z, t: -Infinity, turn: 0, turnAt: -Infinity };
   o.removeFromParent();
   const v = new Float64Array(2);
   life.signs.push(state);
   life.region(x, z).add(new Rig([shape], (clock, ms) => {
    stepSign(state, clock);
    v[0] = state.angle; v[1] = .04 * Math.sin(clock.t * .7 + state.phase);
    ms[0].copy(base); turnX(ms[0], v, 0); turnY(ms[0], v, 1);
   }, new THREE.Vector3(x, base.elements[13] - .6, z), 1.4));
  } else {
   const { s, width, height, colour } = o.userData.lifeShutter;
   o.removeFromParent();
   const shape = shutterShape(s, width, height, colour, x * 7 + z);
   const state = { angle: SHUTTER.rest, speed: 0, phase: hash(x * 3 + z) * 13, tilt: .1 + hash(x + z * 5) * .08, x, z, t: -Infinity, bang: 0, bangAt: -Infinity };
   life.shutters.push(state);
   const v = new Float64Array([0, -s * state.tilt]);
   life.region(x, z).add(new Rig([shape], (clock, ms) => {
    stepShutter(state, clock);
    v[0] = -s * state.angle;
    ms[0].copy(base); turnY(ms[0], v, 0); turnZ(ms[0], v, 1);
   }, new THREE.Vector3(x, base.elements[13] - height / 2, z), width + .5));
  }
 }
 for (const point of smoke) (life.smoke ||= new ChimneySmoke(view)).add(point, building);
}

// A board shutter in its hinge's frame: three planks, two battens and a brace
// on the wall side, the strap of the one hinge left on the face.
function shutterShape(s, width, height, colour, seed) {
 const random = seededRandom(seed), shape = new Shape(), plank = width / 3;
 const tone = k => new THREE.Color(colour).multiplyScalar(k);
 for (let k = 0; k < 3; k++) shape.box(s * (plank * (k + .5)), -height / 2 - (k === 2 ? .02 : 0), 0, plank - .012, height - (k === 2 ? .04 : 0), .035, tone(.92 + random() * .14));
 for (const y of [-.2, -height + .2]) shape.box(s * width / 2, y, -.03, width - .06, .1, .03, tone(.78));
 shape.box(s * width / 2, -height / 2, -.03, Math.hypot(width - .12, height - .5), .08, .025, tone(.74), 0, 0, s * Math.atan2(height - .5, width - .12));
 shape.box(s * .14, -.2, .024, .28, .035, .012, C.iron);
 return shape;
}

// ---------------------------------------------------------------------------
// Chimney smoke: one instanced draw of camera-facing soft quads (a round
// soft edge in the fragment shader, a per-puff opacity), its puffs a pure
// function of time (smokePuff). LIFE_DETAIL sets how many; none on Potato.
const SMOKE_POOL = 28;
// Drawn after the roofs, whose fade (renderer.js ROOF_PREPASS_ORDER 50, then
// 51) would otherwise paint over it: it never writes depth, and it is always
// above them.
const SMOKE_ORDER = 60;
function smokeMaterial() {
 const material = new THREE.MeshBasicMaterial({ color: C.smoke, transparent: true, depthWrite: false, fog: true });
 material.onBeforeCompile = shader => {
  shader.vertexShader = shader.vertexShader
   .replace('#include <common>', '#include <common>\nattribute float puffAlpha;\nvarying float vPuffAlpha;\nvarying vec2 vPuffUv;')
   .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPuffAlpha = puffAlpha;\nvPuffUv = uv;');
  shader.fragmentShader = shader.fragmentShader
   .replace('#include <common>', '#include <common>\nvarying float vPuffAlpha;\nvarying vec2 vPuffUv;')
   .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n{ vec2 q = vPuffUv * 2.0 - 1.0; float r = dot(q, q); gl_FragColor.a *= vPuffAlpha * (1.0 - smoothstep(.1, 1.0, r)); }');
 };
 material.customProgramCacheKey = () => 'hollow-chimney-smoke';
 return material;
}
class ChimneySmoke {
 constructor(view) {
  this.view = view; this.sources = []; this.buildings = []; this.roofs = []; this.puff = { t: 0, x: 0, y: 0, z: 0, size: 0, alpha: 0 };
  const geometry = new THREE.PlaneGeometry(1, 1);
  this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_POOL), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('puffAlpha', this.alpha);
  this.mesh = new THREE.InstancedMesh(geometry, smokeMaterial(), SMOKE_POOL);
  this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  this.mesh.matrixAutoUpdate = false; this.mesh.castShadow = false; this.mesh.receiveShadow = false;
  this.mesh.renderOrder = SMOKE_ORDER; this.mesh.userData.hollowLife = true;
  this.matrix = new THREE.Matrix4(); this.scale = new THREE.Vector3(); this.at = new THREE.Vector3();
  this.mesh.onBeforeRender = (renderer, scene, camera) => this.update(camera);
  view.scene.add(this.mesh);
 }
 add(point, building = null) {
  this.sources.push(point.clone()); this.buildings.push(building); this.roofs.push(undefined);
  const s = this.sources[0];
  this.mesh.position.copy(s); this.mesh.updateMatrix();
  // Culled as a whole: a sphere round the plume (it leans east, up to 6 m).
  this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(2.5, 2.2, 0), 5.5);
  this.update(null);
 }
 update(camera, now = performance.now() / 1000) {
  const n = Math.min(SMOKE_POOL, detailOf(this.view).smoke);
  if (!n || !this.sources.length) { this.mesh.count = 0; return; }
  const per = Math.max(1, Math.floor(n / this.sources.length)), q = camera ? camera.quaternion : _q.identity(), origin = this.sources[0];
  let i = 0;
  for (let k = 0; k < this.sources.length; k++) {
   const s = this.sources[k];
   // Its roof lifting (you inside, or in its doorway) takes the chimney and
   // its smoke with it (stage 5 review: a plume drifted over the room from a
   // chimney that was not drawn). The roof is found the first time (the
   // building registers it after its life parts are taken).
   if (this.roofs[k] === undefined) this.roofs[k] = !this.buildings[k] ? null : this.view.roofs?.find(r => r.id === this.buildings[k]); // (undefined again until it is registered)
   const shown = this.roofs[k] ? this.roofs[k].opacity : 1;
   if (shown < .02) continue;
   for (let j = 0; j < per && i < SMOKE_POOL; j++, i++) {
    this.puff.t = now + k * 2.3;
    const puff = smokePuff(j, per, this.puff);
    this.at.set(s.x - origin.x + puff.x, s.y - origin.y + puff.y, s.z - origin.z + puff.z);
    this.mesh.setMatrixAt(i, this.matrix.compose(this.at, q, this.scale.setScalar(puff.size)));
    this.alpha.array[i] = puff.alpha * shown;
   }
  }
  this.mesh.count = i;
  this.mesh.instanceMatrix.needsUpdate = true; this.alpha.needsUpdate = true;
 }
}
