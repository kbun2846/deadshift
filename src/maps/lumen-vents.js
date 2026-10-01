// Lumen's steam vents (lumen-design.md section 20.6, owner default: yes):
// manholes and pavement grates that vent a column of steam now and then,
// briefly blocking sight for everyone, robots included. Plain data and pure
// functions of the match clock, so the host, every joiner and every robot
// agree on when a vent is venting with nothing sent over the network.
//
// Gameplay: while a vent vents, a cylinder of VENTS.radius round it blocks
// sight (Simulation.sightBlocked, so target lock, aim assist, the robots'
// eyes and team callouts), never movement or rounds (you can shoot blind
// through it). The steam's look is effects/steam-vents.js; its hiss is the
// sound agent's (ventState).
//
// Placement (tests/lumen-vents.test.js): on a roadway or a sidewalk, never
// within VENTS.clear of a doorway, a base's spawn points, a zebra bar or the
// sniper lane, never under a collider, and at least VENTS.baseClear from any
// base point (a base's exits stay clear).

// The schedule and the cloud. Seconds of the match clock, metres.
export const VENTS = Object.freeze({
  period: 40,       // each vent vents once every 40 s ..
  duration: 4,      // .. for 4 s (sight blocked exactly this long)
  offset: 11,       // seconds into the first vent's cycle at clock 0 (the first burst comes 29 s in)
  radius: 1.6,      // the blocking cylinder round the vent
  height: 3.2,      // how high the column reads (visual only: sight is 2D)
  rise: .35,        // s the cloud takes to build up (visual)
  linger: 1.1,      // s it thins out after the vent shuts (visual; sight is clear again)
  clear: 3,         // m from doorways, base points, zebras and the sniper lane
  baseClear: 10,    // m from any base point (its exits)
});

// The vents: `manhole` in a roadway, `grate` in a sidewalk. Spread over the
// map (west, north, centre-north, south, south-east, east) so one is always
// somewhere; their bursts are staggered evenly through the period (index
// order), so at most one vents at a time.
export const LUMEN_VENTS = Object.freeze([
  { id: 'vent-boulevard-west', kind: 'manhole', x: -50, z: -2.5 },
  { id: 'vent-north-lane', kind: 'manhole', x: -13.5, z: -35 },
  { id: 'vent-avenue-north', kind: 'manhole', x: 3.5, z: -22.5 },
  { id: 'vent-south-street', kind: 'manhole', x: -13.5, z: 32.5 },
  { id: 'vent-cut', kind: 'grate', x: 34, z: 33 },
  { id: 'vent-boulevard-east', kind: 'manhole', x: 38, z: 5 },
].map(Object.freeze));

// Seconds into vent i's own cycle (0 .. period) at `clock`; `count` vents
// share the period, i's burst starting i / count of the way through it.
export function ventPhase(clock, i, count = LUMEN_VENTS.length, spec = VENTS) {
  const p = spec.period, t = clock + spec.offset - i * p / Math.max(1, count);
  return ((t % p) + p) % p;
}

// Is vent i venting (blocking sight) at `clock`?
export function ventOn(clock, i, count = LUMEN_VENTS.length, spec = VENTS) {
  return ventPhase(clock, i, count, spec) < spec.duration;
}

// Everything the look and the sound need about vent i at `clock`, written
// into `out` (reused: nothing allocated per frame):
//   venting   true while it blocks sight (the burst)
//   age       seconds since this burst began (0 .. period)
//   strength  the cloud's density 0 .. 1: builds over `rise`, holds, thins
//             over `linger` after the vent shuts
//   hiss      0 .. 1 how loud the hiss is (the burst, a short tail)
export function ventState(clock, i, count = LUMEN_VENTS.length, out = {}, spec = VENTS) {
  const age = ventPhase(clock, i, count, spec), venting = age < spec.duration;
  let strength = 0;
  if (venting) strength = smooth(age / spec.rise);
  else if (age < spec.duration + spec.linger) strength = 1 - smooth((age - spec.duration) / spec.linger);
  out.venting = venting; out.age = age; out.strength = strength;
  out.hiss = venting ? Math.min(1, age / .12) : Math.max(0, 1 - (age - spec.duration) / .4);
  return out;
}
const smooth = x => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };

// Does the segment a..b pass through a venting vent's cylinder? (Eye inside
// the steam counts: you see nothing out, nobody sees you.)
export function ventsBlockSight(vents, clock, ax, az, bx, bz, spec = VENTS) {
  const count = vents.length, r2 = spec.radius * spec.radius;
  const dx = bx - ax, dz = bz - az, length2 = dx * dx + dz * dz;
  for (let i = 0; i < count; i++) {
    const v = vents[i];
    // Bounding-box reject first: most rays are nowhere near a vent.
    if (Math.min(ax, bx) > v.x + spec.radius || Math.max(ax, bx) < v.x - spec.radius || Math.min(az, bz) > v.z + spec.radius || Math.max(az, bz) < v.z - spec.radius) continue;
    if (!ventOn(clock, i, count, spec)) continue;
    const t = length2 > 1e-12 ? Math.max(0, Math.min(1, ((v.x - ax) * dx + (v.z - az) * dz) / length2)) : 0;
    const ex = ax + dx * t - v.x, ez = az + dz * t - v.z;
    if (ex * ex + ez * ez < r2) return true;
  }
  return false;
}
