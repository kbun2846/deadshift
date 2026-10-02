// Target lock for players without a mouse: arrow keys, and swipes on the
// aiming side of a touchscreen (the side away from the move stick).
//
// Idle by default: aiming is the ordinary kind (arrows or walking turn the
// aim). Pressing an arrow, or swiping a finger (a swipe is an arrow press, and
// the cursor never jumps under the finger), picks the target on screen that
// way and the aim goes to it. From idle "that way" counts from the aim dot or
// from you, whichever fits better, and never picks one behind you; among the
// ones that way the nearest and straightest wins; any player or robot that
// way comes before every practice target, the one that just shot you before
// the rest and the one you were last on before strangers (TARGET_LOCK biases).
// Two arrows pressed together are one diagonal press.
// Locked, an arrow or a swipe moves to the next target that way from the
// current one (swap), or lets go if there is none that way; on a player or a
// robot with the keys it holds instead and the held arrow leads them, and the
// same arrow tapped twice lets go.
//
// Nothing is ever locked for you (owner). When the locked target dies or
// breaks the lock goes idle: it does not jump to whoever is next. When it is
// only lost (behind cover for too long, into a building, off the screen) the
// lock remembers it for a few seconds and picks it back up when it shows
// again, unless you have aimed by hand or picked another since.
//
// Moving targets (other players, robots; `mover` on a candidate) are locked
// the same ways as anything else (an arrow or swipe that way, or turning to
// face them: main.js facingLock), and then the aim sits on them accurately and
// smoothly (a short smoothing only takes out network jitter). It lets go of
// them only
//  - when they dodge: the aim drifts on the way they were going, and takes a
//    brief moment (relock) after the dodge to glide back onto them;
//  - when a solid obstacle (a wall, a building, a fence; never a breakable
//    prop) or anything that hides them gets between: the aim drifts on the way
//    they were moving (it never follows someone you cannot see), and glides
//    back when they come out (too long behind it and it lets go);
//  - when they go into a building you are not in, or well off the screen: it
//    disengages at once (a step past the edge is kept for a moment).
//
// It only produces an aim point for the input; the simulation, aim assist and
// hit rules are unchanged, online the host sees ordinary aim inputs, and a
// mouse never uses it. update() allocates nothing.
import { TARGET_LOCK } from './config/controls.js';
export { TARGET_LOCK };

// A critically damped spring (smooth-damp), one axis: moves `value` toward
// `target` over about `time` seconds, carrying `velocity`. The result is
// written to one shared object (no allocation per tick); read it at once.
const damped = { value: 0, velocity: 0 };
function damp(value, target, velocity, time, dt) {
 const omega = 2 / Math.max(1e-4, time), x = omega * dt, e = 1 / (1 + x + .48 * x * x + .235 * x * x * x);
 const change = value - target, temp = (velocity + omega * change) * dt;
 damped.value = target + (change + temp) * e; damped.velocity = (velocity - omega * temp) * e;
 return damped;
}

function findIn(list, wanted) { for (let i = 0; i < list.length; i++) if (list[i].id === wanted) return list[i]; return null; }

export function createTargetLock(config = TARGET_LOCK) {
 let id = null, lostFor = 0, arrived = false, vx = 0, vz = 0, seen = false, ended = 0;
 const spot = { x: 0, z: 0 };
 // Where the locked target was last seen on screen (the origin of a switch
 // while it is briefly hidden).
 let atX = 0, atY = 0;
 // Moving targets: 'glide' onto them, 'track' on them, 'drift' off them (a
 // dodge or an obstacle), 'wait' a moment before gliding back.
 let phase = 'glide', timer = 0, glideAge = 0, driftX = 0, driftZ = 0, lastVX = 0, lastVZ = 0, wasDodging = false, blockedFor = 0, edgeFor = 0, offX = 0, offZ = 0;
 // The arrow that made the last switch: it does not lead until let go.
 let quietX = 0, quietY = 0;
 // The one locked before (flicking back), the one lost and remembered.
 let recentId = null, memoryId = null, memoryLeft = 0;
 // The last press, for a diagonal made of two presses and for a double tap.
 const last = { time: -Infinity, x: 0, y: 0, before: null, idle: true, fromX: 0, fromY: 0, originX: 0, originY: 0, origin: false, result: 'none' };
 const resetMover = () => { phase = 'glide'; timer = 0; glideAge = 0; driftX = driftZ = 0; wasDodging = false; blockedFor = 0; edgeFor = 0; offX = offZ = 0; };
 // Let go. `remember`: it was lost, not killed or let go by hand, so it is
 // picked back up if it shows again soon. `byItself`: not by a press.
 function drop(remember, byItself = true) {
  if (id !== null) recentId = id;
  memoryId = remember ? id : null; memoryLeft = config.reacquire;
  id = null; lostFor = 0; arrived = false; vx = vz = 0; seen = false; quietX = quietY = 0; resetMover();
  if (byItself) ended++;
 }
 // Lock onto `target`. From idle the aim point starts at `aim` (where the
 // aim is now); otherwise it keeps sweeping from where it is, at its speed.
 function take(target, aim) {
  if (id === null) { spot.x = aim ? aim.x : target.x; spot.z = aim ? aim.z : target.z; vx = vz = 0; }
  else if (id !== target.id) recentId = id;
  id = target.id; lostFor = 0; arrived = false; seen = true; memoryId = null; quietX = quietY = 0; resetMover();
  if (Number.isFinite(target.sx)) { atX = target.sx; atY = target.sy; }
 }
 // Within the cone of the direction, nearer and straighter first.
 function rank(vx, vy, ux, uy, minAlong) {
  const along = vx * ux + vy * uy, across = Math.abs(vx * uy - vy * ux);
  if (along <= minAlong || across > along * config.cone) return Infinity;
  return along + config.acrossWeight * across;
 }
 // The best target in screen direction (dx, dy) from (fromX, fromY), and
 // with `origin` from (originX, originY) too: whichever fits better, but
 // never one behind the origin. Then the biases (TARGET_LOCK).
 function pick(candidates, fromX, fromY, dx, dy, skip, minAlong, origin, originX, originY) {
  const length = Math.hypot(dx, dy); if (!length) return null;
  const ux = dx / length, uy = dy / length;
  let best = null, score = Infinity, enemy = null, enemyScore = Infinity;
  for (let i = 0; i < candidates.length; i++) {
   const c = candidates[i];
   if (c.id === skip || c.inside) continue;
   let s = rank(c.sx - fromX, c.sy - fromY, ux, uy, minAlong);
   if (origin) {
    const ox = c.sx - originX, oy = c.sy - originY;
    if (ox * ux + oy * uy <= 0) continue;
    s = Math.min(s, rank(ox, oy, ux, uy, minAlong));
   }
   if (s === Infinity) continue;
   s *= (c.threat ? config.threatBias : 1) * (c.id === recentId ? config.recentBias : 1) * (c.blocked ? config.blockedBias : 1);
   if (c.mover) { if (s < enemyScore) { enemyScore = s; enemy = c; } }
   else if (s < score) { score = s; best = c; }
  }
  // A player or robot that way is taken before any practice target.
  return enemy || best;
 }
 const lock = {
  get id() { return id; },
  get point() { return id === null ? null : spot; },
  get phase() { return phase; },
  // Whether the locked target was among the candidates (seen, on screen) this tick.
  get seen() { return id !== null && seen; },
  // The target lost and waiting to be picked back up (null if none).
  get remembered() { return memoryId; },
  // Counts the locks that ended by themselves (main.js: the facing lock then
  // waits for a turn).
  get ended() { return ended; },
  get recent() { return recentId; },
  clear() { id = null; lostFor = 0; arrived = false; vx = vz = 0; seen = false; memoryId = null; quietX = quietY = 0; resetMover(); },
  // Forget the lost target (you aimed by hand instead).
  forget() { memoryId = null; },
  // Lock straight onto `target` (you turned to face it), gliding from `aim`.
  acquire(target, aim) { take(target, aim); return true; },
  // candidates: [{ id, x, z, sx, sy, mover?, vx?, vz?, dodging?, blocked?,
  // inside?, edge?, offscreen?, threat? }] already filtered to alive, in
  // sight, on screen and in range. Returns the locked candidate, or null
  // when idle.
  // `find(id)`: the locked target if it still exists and is alive (seen or
  // not; a mover is `blocked` too when it cannot be seen), so a moment
  // behind a post or a doorframe does not drop the lock.
  // `chase`: { nudgeX, nudgeZ } (held arrows, -1..1 in world x/z): they lead
  // a moving target by hand.
  // `aim`: where the aim is now ({ x, z }): a lost target picked back up is
  // glided onto from there.
  update(candidates, player, dt, find, chase = null, aim = null) {
   if (id === null) {
    if (memoryId === null) return null;
    memoryLeft -= dt;
    const back = memoryLeft > 0 ? findIn(candidates, memoryId) : null;
    if (memoryLeft <= 0) memoryId = null;
    if (!back || back.blocked || back.inside) return null;
    take(back, aim);
   }
   let target = findIn(candidates, id);
   seen = !!target;
   if (!target && find) target = find(id);
   if (target && Number.isFinite(target.sx) && !target.offscreen) { atX = target.sx; atY = target.sy; }
   // A moving target (a player, a robot) has its own rules (the header).
   if (target?.mover) {
    if (target.offscreen || target.inside) { drop(true); return null; }
    if (target.edge) { if ((edgeFor += dt) > config.hold) { drop(true); return null; } } else edgeFor = 0;
    return follow(target, dt, chase);
   }
   // Dead or broken: idle (nobody is picked for you). Out of sight longer
   // than `hold`: idle, and remembered.
   if (seen) lostFor = 0;
   else if (!target || (lostFor += dt) >= config.hold) { drop(!!target); return null; }
   // Glide to a newly picked target, then stay exactly on it.
   if (arrived) { spot.x = target.x; spot.z = target.z; }
   else {
    // A critically damped spring (smooth-damp): the aim point speeds up and
    // settles rather than leaping off at full speed, so a switch reads as one
    // continuous sweep. Keeps its speed if the target changes mid-sweep.
    let a = damp(spot.x, target.x, vx, config.glide, dt); spot.x = a.value; vx = a.velocity;
    a = damp(spot.z, target.z, vz, config.glide, dt); spot.z = a.value; vz = a.velocity;
    arrived = Math.hypot(target.x - spot.x, target.z - spot.z) < .03 && Math.hypot(vx, vz) < .5;
    if (arrived) vx = vz = 0;
   }
   return target;
  },
  // An arrow press (keys: `chord`, and dx, dy are -1, 0 or 1) or a swipe.
  // ctx: { cursor: { x, y } the aim dot on screen, origin: { x, y } you on
  // screen, aim: { x, z } the aim point now, time (s), keep: hold a player or
  // robot when nobody is that way (the arrow leads them), chord: a key }.
  // Idle: lock onto the target that way. Locked: the next target that way
  // from the current one; none that way lets go (or holds, with `keep`).
  // Returns 'locked', 'switched', 'released', 'kept' or 'none'.
  press(candidates, dx, dy, ctx) {
   const time = ctx.time ?? 0, sx = Math.sign(dx), sy = Math.sign(dy);
   // A second arrow on the other axis just after the first: the two are one
   // diagonal press, decided again from where the first one started. Taken
   // only if something is that way; otherwise the first press stands.
   if (ctx.chord && time - last.time <= config.chord && !(last.x && last.y) && !(sx && sy) && (sx ? !last.x && last.y : !last.y && last.x)) {
    const cx = last.x || sx, cy = last.y || sy;
    last.time = -Infinity;
    const best = last.idle
     ? pick(candidates, last.fromX, last.fromY, cx, cy, null, 2, last.origin, last.originX, last.originY)
     : pick(candidates, last.fromX, last.fromY, cx, cy, last.before, 8, false, 0, 0);
    if (!best) return 'none';
    const was = id; take(best, ctx.aim); quietX = cx; quietY = cy;
    return was === null ? 'locked' : was === best.id ? 'kept' : 'switched';
   }
   const idle = id === null, before = id;
   let fromX = atX, fromY = atY;
   if (idle) { fromX = ctx.cursor.x; fromY = ctx.cursor.y; }
   else { const current = findIn(candidates, id); if (current) { fromX = current.sx; fromY = current.sy; } }
   const origin = !!(idle && ctx.origin);
   let result;
   // The same arrow tapped twice, with nobody that way, lets go of a player or robot.
   if (!idle && ctx.keep && ctx.chord && last.result === 'kept' && sx === last.x && sy === last.y && time - last.time <= config.releaseTap) { drop(false, false); result = 'released'; }
   else {
    const best = idle
     ? pick(candidates, fromX, fromY, dx, dy, null, 2, origin, ctx.origin?.x, ctx.origin?.y)
     : pick(candidates, fromX, fromY, dx, dy, id, 8, false, 0, 0);
    if (best) { take(best, ctx.aim); result = idle ? 'locked' : 'switched'; if (ctx.chord) { quietX = sx; quietY = sy; } }
    else if (idle) { memoryId = null; result = 'none'; }
    else if (ctx.keep) result = 'kept';
    else { drop(false, false); result = 'released'; }
   }
   last.time = time; last.x = sx; last.y = sy; last.before = before; last.idle = idle; last.fromX = fromX; last.fromY = fromY;
   last.origin = origin; last.originX = origin ? ctx.origin.x : 0; last.originY = origin ? ctx.origin.y : 0; last.result = result;
   return result;
  },
  // From idle: the target on screen in direction (dx, dy) from the cursor
  // (screen point `from`; with `origin`, you on screen, from there too).
  // `aim` is where the aim point starts its glide.
  select(candidates, from, dx, dy, aim, origin = null) {
   const best = pick(candidates, from.x, from.y, dx, dy, null, 2, !!origin, origin?.x, origin?.y);
   if (!best) return false;
   if (id !== null) lock.clear();
   take(best, aim); return true;
  },
  // Locked: the next target that way from the current one on screen. None
  // that way lets the lock go (idle), unless `keep` (locked on a player: the
  // arrow is leading them instead, see `chase`).
  swap(candidates, dx, dy, keep = false) {
   if (id === null) return false;
   const current = findIn(candidates, id), fromX = current ? current.sx : atX, fromY = current ? current.sy : atY;
   const best = pick(candidates, fromX, fromY, dx, dy, id, 8, false, 0, 0);
   if (!best) { if (!keep) drop(false, false); return false; }
   take(best, null); return true;
  },
 };
 // One tick on a moving target (see the header).
 function follow(t, dt, chase) {
  const dodging = !!t.dodging;
  if (!dodging && !t.blocked) { lastVX = t.vx || 0; lastVZ = t.vz || 0; }
  // Behind a solid obstacle (or hidden), or starting a dodge: drift off the way they were going.
  if (t.blocked) {
   blockedFor += dt;
   if (blockedFor > config.blockedLimit) { drop(true); return null; }
   if (phase !== 'drift') { phase = 'drift'; driftX = lastVX; driftZ = lastVZ; }
  } else blockedFor = 0;
  if (dodging && !wasDodging) { phase = 'drift'; driftX = lastVX * .7; driftZ = lastVZ * .7; }
  wasDodging = dodging;
  if (phase === 'drift' && !t.blocked && !dodging) { phase = 'wait'; timer = config.relockDelay; }
  if (phase === 'drift' || phase === 'wait') {
   const fade = Math.exp(-dt / config.driftFade);
   spot.x += driftX * dt; spot.z += driftZ * dt; driftX *= fade; driftZ *= fade; vx = driftX; vz = driftZ;
   if (phase === 'wait' && (timer -= dt) <= 0) { phase = 'glide'; glideAge = 0; }
   return t;
  }
  // Held arrows lead them by hand (keyboard): an offset that eases back when
  // let go. The arrow that made the switch onto them is quiet until let go.
  let nx = chase?.nudgeX || 0, nz = chase?.nudgeZ || 0;
  if (quietX) { if (Math.sign(nx) === quietX) nx = 0; else quietX = 0; }
  if (quietY) { if (Math.sign(nz) === quietY) nz = 0; else quietY = 0; }
  if (nx || nz) { offX += nx * config.nudgeSpeed * dt; offZ += nz * config.nudgeSpeed * dt; const o = Math.hypot(offX, offZ); if (o > config.nudgeReach) { offX *= config.nudgeReach / o; offZ *= config.nudgeReach / o; } }
  else { const k = Math.exp(-dt / config.nudgeEase); offX *= k; offZ *= k; }
  // The glide on (a switch, a relock) starts soft (relockGlide) and firms up
  // to the tracking smoothing over two glide times; once close, or firm, it
  // is tracking. (Before 2026-10-01 the glide only ended within 8 cm, which a
  // target walking faster than about .6 m/s never let it reach: the aim
  // trailed a walker by its speed × .13 s for as long as the lock lasted.)
  let time = config.track;
  if (phase === 'glide') { glideAge += dt; time = config.track + (config.relockGlide - config.track) * Math.max(0, 1 - glideAge / (2 * config.relockGlide)); }
  // Aimed where they are now, not a smoothing-lag behind: their velocity
  // times the smoothing time plus one tick (their position is a tick old).
  const lead = time + 1 / 60;
  const gx = t.x + (t.vx || 0) * lead + offX, gz = t.z + (t.vz || 0) * lead + offZ;
  let a = damp(spot.x, gx, vx, time, dt); spot.x = a.value; vx = a.velocity;
  a = damp(spot.z, gz, vz, time, dt); spot.z = a.value; vz = a.velocity;
  if (phase === 'glide' && (time === config.track || Math.hypot(gx - spot.x, gz - spot.z) < .08)) phase = 'track';
  return t;
 }
 return lock;
}
