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
 chaseSpeed: 5.5, chaseCatchUp: 3, nudgeSpeed: 7, nudgeReach: 2.5,
});

export function createTargetLock(config = TARGET_LOCK) {
 let id = null, point = null, lostFor = 0, arrived = false, vx = 0, vz = 0;
 const lock = {
  get id() { return id; },
  get point() { return point; },
  clear() { id = null; point = null; lostFor = 0; arrived = false; vx = vz = 0; },
  // candidates: [{ id, x, z, sx, sy }] already filtered to alive, in sight,
  // on screen and in range. Returns the locked candidate, or null when idle.
  // `find(id)`: the locked target if it still exists and is alive (seen or
  // not), so a moment behind a post or a doorframe does not drop the lock.
  // `chase`: { nudgeX, nudgeZ } (held arrows, -1..1 in world x/z) when the
  // targets are players: the point then chases instead of sticking (above).
  update(candidates, player, dt, find, chase = null) {
   if (id === null) { point = null; return null; }
   let target = candidates.find(c => c.id === id);
   if (target) lostFor = 0;
   else {
    const still = find?.(id);
    lostFor += dt;
    if (still && lostFor < config.hold) target = still;
   }
   // The locked one is gone (dead, broken, or out of sight for longer than
   // `hold`): the nearest other one takes over, or with none left, idle.
   if (!target) { target = nearest(candidates, player); id = target ? target.id : null; lostFor = 0; arrived = false; }
   if (!target) { point = null; return null; }
   // Glide to a newly picked target, then stay exactly on it (a moving target
   // is followed without lag, so the aim never drifts off it).
   if (arrived && chase) {
    const dx = target.x - point.x, dz = target.z - point.z, behind = Math.hypot(dx, dz);
    const step = Math.min(behind, (config.chaseSpeed + config.chaseCatchUp * behind) * dt);
    if (behind > 1e-6) { point.x += dx / behind * step; point.z += dz / behind * step; }
    point.x += (chase.nudgeX || 0) * config.nudgeSpeed * dt; point.z += (chase.nudgeZ || 0) * config.nudgeSpeed * dt;
    const ox = point.x - target.x, oz = point.z - target.z, off = Math.hypot(ox, oz);
    if (off > config.nudgeReach) { point.x = target.x + ox / off * config.nudgeReach; point.z = target.z + oz / off * config.nudgeReach; }
   } else if (arrived) { point.x = target.x; point.z = target.z; }
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
