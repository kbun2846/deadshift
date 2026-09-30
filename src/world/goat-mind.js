// Hollow Wick's goat: its mind (pure: no three.js), moved out of
// world/hollow-life.js so the simulation can step it (critters.js: the goat
// can be killed, owner 2026-09-29) as well as the view drawing it.
// The pen's inside (between the hurdles' inner faces), half extents.
export const PEN_INSIDE = Object.freeze({ hx: 1.5, hz: .95 });
function seededRandom(seed) { let s = (Math.floor(Math.abs(seed)) % 2147483646) + 1; return () => (s = s * 16807 % 2147483647) / 2147483647; }
const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const approach = (v, target, step) => v < target ? Math.min(target, v + step) : Math.max(target, v - step);

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

