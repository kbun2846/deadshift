// Target lock for players without a mouse: arrow keys, and swipes on the
// aiming side of a touchscreen (the side away from the move stick).
//
// Idle by default: aiming is the ordinary kind (arrows or walking turn the
// aim). Pressing an arrow, or swiping a finger (a swipe is an arrow press, and
// the cursor never jumps under the finger), picks the target on screen that
// way from the cursor and the aim goes to it. A swipe with no target that way
// then drags the cursor by the finger's movement, like a trackpad.
// Locked, an arrow or a swipe moves to the next target that way from the
// current one (swap), or lets go if there is none that way. If the locked
// target dies, breaks, hides or leaves the screen, the
// nearest other visible target takes over, and with none left it goes idle.
// The aim point glides between targets (GLIDE) and the character turns with
// the usual eased turn. Online only players count.
//
// Moving targets (other players, robots; `mover` on a candidate) are locked
// the same ways as anything else (an arrow or swipe that way, or turning to
// face them: main.js facingLock; nothing is ever locked for you), and then
// the aim sits on them accurately and smoothly (a short smoothing only takes
// out network jitter). It lets go of them only
//  - when they dodge: the aim drifts on the way they were going, and takes a
//    brief moment (relock) after the dodge to glide back onto them;
//  - when a solid obstacle (a wall, a building, a fence; never a breakable
//    prop) gets between: the aim drifts on the way they were moving, and
//    glides back when they come out (too long behind it and it lets go);
//  - when they go into a building you are not in, or off the screen: it
//    disengages at once (and may pick someone else up).
//
// It only produces an aim point for the input; the simulation, aim assist and
// hit rules are unchanged, and a mouse never uses it.
export const TARGET_LOCK = Object.freeze({
 range: 18,        // metres: farther targets are not locked
 margin: 24,       // px: a target this close to the screen edge counts as off screen
 glide: .09,       // s: smooth time of the aim point's travel to a new target (eases in and out)
 swipe: 42,        // px of finger travel that counts as one swipe
 swipeAgain: 140,  // px more, in the same drag, for each further switch
 hold: .6,         // s: a locked target briefly out of sight (a post, a doorframe, the screen edge) keeps the lock
 // Locked on another player (online), the aim point chases them rather than
 // sitting on them: it moves at most chaseSpeed + chaseCatchUp × (how far
 // behind it is) m/s. A player walking across is kept up with; one running
 // flat out or dodging pulls ahead and the aim lags behind. Held arrows push
 // the point that way at nudgeSpeed m/s, so a skilled player leads the target
 // by hand; the push reaches at most nudgeReach metres past the target.
 nudgeSpeed: 7, nudgeReach: 2.5,
 // Moving targets: smoothing while on them (s), the glide back on after a
 // dodge or an obstacle (s), the pause after a dodge before gliding back (s),
 // how fast the drift fades (s), how long behind an obstacle before letting go (s).
 track: .035, relockGlide: .13, relockDelay: .16, driftFade: .45, blockedLimit: 1.4,
});

// A critically damped spring (smooth-damp), one axis: moves `value` toward
// `target` over about `time` seconds, carrying `velocity` (returned).
function damp(value, target, velocity, time, dt) {
 const omega = 2 / Math.max(1e-4, time), x = omega * dt, e = 1 / (1 + x + .48 * x * x + .235 * x * x * x);
 const change = value - target, temp = (velocity + omega * change) * dt;
 return { value: target + (change + temp) * e, velocity: (velocity - omega * temp) * e };
}

export function createTargetLock(config = TARGET_LOCK) {
 let id = null, point = null, lostFor = 0, arrived = false, vx = 0, vz = 0;
 // Moving targets: 'glide' onto them, 'track' on them, 'drift' off them (a
 // dodge or an obstacle), 'wait' a moment before gliding back.
 let phase = 'glide', timer = 0, driftX = 0, driftZ = 0, lastVX = 0, lastVZ = 0, wasDodging = false, blockedFor = 0, offX = 0, offZ = 0;
 const reset = () => { phase = 'glide'; timer = 0; driftX = driftZ = 0; wasDodging = false; blockedFor = 0; offX = offZ = 0; };
 const lock = {
  get id() { return id; },
  get point() { return point; },
  get phase() { return phase; },
  clear() { id = null; point = null; lostFor = 0; arrived = false; vx = vz = 0; reset(); },
  // Lock straight onto `target` (you turned to face it), gliding from `aim`.
  acquire(target, aim) { id = target.id; point = { x: aim.x, z: aim.z }; lostFor = 0; arrived = false; vx = vz = 0; reset(); return true; },
  // candidates: [{ id, x, z, sx, sy }] already filtered to alive, in sight,
  // on screen and in range. Returns the locked candidate, or null when idle.
  // `find(id)`: the locked target if it still exists and is alive (seen or
  // not), so a moment behind a post or a doorframe does not drop the lock.
  // `chase`: { nudgeX, nudgeZ } (held arrows, -1..1 in world x/z) when the
  // targets are players: the point then chases instead of sticking (above).
  update(candidates, player, dt, find, chase = null) {
   if (id === null) { point = null; return null; }
   // A moving target (a player, a robot) has its own rules (the header).
   const moving = candidates.find(c => c.id === id) || find?.(id);
   if (moving?.mover) {
    if (moving.offscreen || moving.inside) { lock.clear(); return null; }
    return follow(moving, dt, chase);
   }
   let target = candidates.find(c => c.id === id);
   if (target) lostFor = 0;
   else {
    const still = find?.(id);
    lostFor += dt;
    if (still && lostFor < config.hold) target = still;
   }
   // The locked one is gone (dead, broken, or out of sight for longer than
   // `hold`): the nearest other one takes over, or with none left, idle.
   if (!target) { target = nearest(candidates.filter(c => !c.mover), player); id = target ? target.id : null; lostFor = 0; arrived = false; }
   if (!target) { point = null; return null; }
   // Glide to a newly picked target, then stay exactly on it.
   if (arrived) { point.x = target.x; point.z = target.z; }
   else {
    // A critically damped spring (smooth-damp): the aim point speeds up and
    // settles rather than leaping off at full speed, so a switch reads as one
    // continuous sweep. Keeps its speed if the target changes mid-sweep.
    const omega = 2 / config.glide, x = omega * dt, e = 1 / (1 + x + .48 * x * x + .235 * x * x * x);
    for (const axis of ['x', 'z']) {
     const change = point[axis] - target[axis], v = axis === 'x' ? vx : vz, temp = (v + omega * change) * dt;
     const nv = (v - omega * temp) * e;
     point[axis] = target[axis] + (change + temp) * e;
     if (axis === 'x') vx = nv; else vz = nv;
    }
    arrived = Math.hypot(target.x - point.x, target.z - point.z) < .03 && Math.hypot(vx, vz) < .5;
    if (arrived) vx = vz = 0;
   }
   return target;
  },
  // From idle: the target on screen in direction (dx, dy) from the cursor
  // (screen point `from`). `aim` is where the aim point starts its glide.
  select(candidates, from, dx, dy, aim) {
   const best = pick(candidates, from, dx, dy, null, 2);
   if (!best) return false;
   id = best.id; point = { x: aim.x, z: aim.z }; lostFor = 0; arrived = false; vx = vz = 0; return true;
  },
  // Locked: the next target that way from the current one on screen. None
  // that way lets the lock go (idle), unless `keep` (locked on a player: the
  // arrow is leading them instead, see `chase`).
  swap(candidates, dx, dy, keep = false) {
   const current = candidates.find(c => c.id === id);
   const best = current ? pick(candidates, { x: current.sx, y: current.sy }, dx, dy, id) : null;
   if (!best) { if (!keep) lock.clear(); return false; }
   id = best.id; lostFor = 0; arrived = false; return true;
  },
 };
 // One tick on a moving target (see the header).
 function follow(t, dt, chase) {
  const dodging = !!t.dodging;
  if (!dodging && !t.blocked) { lastVX = t.vx || 0; lastVZ = t.vz || 0; }
  // Behind a solid obstacle, or starting a dodge: drift off the way they were going.
  if (t.blocked) {
   blockedFor += dt;
   if (blockedFor > config.blockedLimit) { lock.clear(); return null; }
   if (phase !== 'drift') { phase = 'drift'; driftX = lastVX; driftZ = lastVZ; }
  } else blockedFor = 0;
  if (dodging && !wasDodging) { phase = 'drift'; driftX = lastVX * .7; driftZ = lastVZ * .7; }
  wasDodging = dodging;
  if (phase === 'drift' && !t.blocked && !dodging) { phase = 'wait'; timer = config.relockDelay; }
  if (phase === 'drift' || phase === 'wait') {
   const fade = Math.exp(-dt / config.driftFade);
   point.x += driftX * dt; point.z += driftZ * dt; driftX *= fade; driftZ *= fade; vx = driftX; vz = driftZ;
   if (phase === 'wait' && (timer -= dt) <= 0) phase = 'glide';
   return t;
  }
  // Held arrows lead them by hand (keyboard): an offset that eases back when let go.
  const nx = chase?.nudgeX || 0, nz = chase?.nudgeZ || 0;
  if (nx || nz) { offX += nx * config.nudgeSpeed * dt; offZ += nz * config.nudgeSpeed * dt; const o = Math.hypot(offX, offZ); if (o > config.nudgeReach) { offX *= config.nudgeReach / o; offZ *= config.nudgeReach / o; } }
  else { const k = Math.exp(-dt / .35); offX *= k; offZ *= k; }
  // Aimed where they are now, not a smoothing-lag behind: their velocity
  // times the smoothing time plus one tick (their position is a tick old).
  const lead = config.track + 1 / 60;
  const gx = t.x + (t.vx || 0) * lead + offX, gz = t.z + (t.vz || 0) * lead + offZ, time = phase === 'glide' ? config.relockGlide : config.track;
  const ax = damp(point.x, gx, vx, time, dt), az = damp(point.z, gz, vz, time, dt);
  point.x = ax.value; point.z = az.value; vx = ax.velocity; vz = az.velocity;
  if (phase === 'glide' && Math.hypot(gx - point.x, gz - point.z) < .08) phase = 'track';
  return t;
 }
 return lock;
}

// The best target in screen direction (dx, dy) from `from`: within 60
// degrees of it, favouring ones straight along it over ones off to the side.
function pick(candidates, from, dx, dy, skip, minAlong = 8) {
 const length = Math.hypot(dx, dy); if (!length) return null;
 const ux = dx / length, uy = dy / length;
 let best = null, score = Infinity;
 for (const c of candidates) {
  if (c.id === skip) continue;
  const vx = c.sx - from.x, vy = c.sy - from.y, along = vx * ux + vy * uy;
  const across = Math.abs(vx * uy - vy * ux);
  if (along <= minAlong || across > along * 1.73) continue;
  const s = along + 2 * across;
  if (s < score) { score = s; best = c; }
 }
 return best;
}

function nearest(candidates, player) {
 let best = null, distance = Infinity;
 for (const c of candidates) { const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < distance) { distance = d; best = c; } }
 return best;
}
