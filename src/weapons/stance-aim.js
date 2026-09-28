// Sightline's stance, aimed without a mouse (owner, v0.990a: "make player use
// the side of the screen they usually use to move/joystick to control the
// cursor/laser, since they can't move with sniper in stance, and for keyboard
// without mouse players, they should be able to use keyboard to control
// sniper"). Crouched behind the rifle you cannot walk, so the walking
// controls steer the laser instead: the move stick on a phone, WASD and the
// arrow keys on a keyboard. They move a point on the ground (the laser's end)
// the way they are pushed, at a speed set by how far: toward you or away is
// the range, across is side to side.
//
// v0.992a (owner: "less weighty and more reactive to the joystick, which can
// move cursor closer to player on range, but side to side should still be
// split between aim assist and player skill ... swiping on right side of
// screen swaps aim to whatever's in that direction"): it answers at once (70%
// of the push's speed from its first moment, all of it a tenth of a second
// later, no extra curve on top of the stick's own), and it may come in to
// 3.5 m. The range is all yours. Side to side, with aim assist, the laser
// follows half of a target's sideways movement by itself (you do the other
// half) and, while you push, drifts toward its middle at up to 2.2 m/s; a
// small push over a body is slowed so the last centimetres settle. A swipe
// (main.js) picks the target that way and the point glides onto it (`glideTo`).
//
// Not a guaranteed hit: the assist never leads, it follows half, the round
// still commits .16 s after the trigger and flies at 114 m/s, so a moving
// target has to be led by hand. (A running player is 7.2 m/s; a full push is
// faster than that, scoped too.)
//
// Pure (no three.js, no DOM): main.js feeds it the pushes and keeps the
// point on screen; tests/stance-aim.test.js.
export const STANCE_AIM = Object.freeze({
  speed: 15,          // m/s at a full push, rifle up but not scoped
  scopedSpeed: 11,    // m/s at a full push, scoped
  curve: 1,           // push ^ curve (on top of the stick's own curve)
  ramp: .1,           // s from a push's first moment to full speed
  floor: .7,          // share of full speed at that first moment
  keyRamp: .35,       // a key has no half push: it starts slower...
  keyFloor: .25,      // ...and eases up over longer
  friction: .55,      // share of speed over a body at the smallest push (none at a full one)
  frictionRadius: .9, // m round a body's middle
  assistWidth: 1.8,   // m either side of the laser's line (at the target's distance) the assist works in
  focusWidth: 2.7,    // ...for a target picked by a swipe
  assistTrack: .5,    // share of a target's sideways movement the laser follows by itself
  assistPull: 2.2,    // m/s at most toward a target's middle, sideways, while pushing (by how far)
  glide: .12,         // s to settle on a target picked by a swipe
  min: 3.5,           // m from you, at least
  start: 12,          // m out along your aim, on entering the stance
  margin: 28,         // px: the point stays this far inside the screen (main.js)
});

export const createStanceAim = () => ({ on: false, x: 0, z: 0, held: 0, focus: null, gliding: 0, assisting: null });
export function resetStanceAim(state) { state.on = false; state.held = 0; state.focus = null; state.gliding = 0; state.assisting = null; }
// A swipe picked `id` (one of the `bodies` stepStanceAim is given): glide onto it.
export function glideTo(state, id) { state.focus = id; state.gliding = STANCE_AIM.glide * 2.5; }

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// One fixed step. `player` { x, z, aimX, aimZ, aimPointX?, aimPointZ? };
// `pushX`/`pushZ` the stick or keys (-1..1, screen right and down);
// `digital` keys rather than a stick; `scoped` the scope is on; `bodies`
// [{ id, x, z, vx, vz }] of enemies you can see; `assist` aim assist is on.
// Returns the state (its x, z the point).
export function stepStanceAim(state, { player, pushX = 0, pushZ = 0, digital = false, scoped = false, bodies = [], assist = false, dt }) {
  const A = STANCE_AIM;
  if (!state.on) {
    state.on = true; state.held = 0; state.focus = null; state.gliding = 0; state.assisting = null;
    const has = Number.isFinite(player.aimPointX) && Number.isFinite(player.aimPointZ);
    const ax = has ? player.aimPointX : player.x + player.aimX * A.start, az = has ? player.aimPointZ : player.z + player.aimZ * A.start;
    const d = Math.hypot(ax - player.x, az - player.z);
    // (A point you were aiming at close by is pushed out to where a rifle shot begins to make sense.)
    const out = d < A.start * .5 ? A.start / Math.max(d, 1e-3) : 1;
    state.x = d < 1e-3 ? player.x + player.aimX * A.start : player.x + (ax - player.x) * out;
    state.z = d < 1e-3 ? player.z + player.aimZ * A.start : player.z + (az - player.z) * out;
  }
  const push = Math.hypot(pushX, pushZ);
  let ramp = 0;
  if (push < 1e-3) state.held = 0;
  else {
    state.held += dt;
    ramp = digital ? Math.min(1, A.keyFloor + (1 - A.keyFloor) * state.held / A.keyRamp) : Math.min(1, A.floor + (1 - A.floor) * state.held / A.ramp);
    const amount = digital ? 1 : Math.min(1, push) ** A.curve;
    let speed = (scoped ? A.scopedSpeed : A.speed) * amount * ramp;
    // How hard the push is meant: a stick by how far it is pushed, keys by how
    // long they have been held (a tap is fine work, a hold is travel).
    const intent = digital ? ramp : Math.min(1, push);
    for (const b of bodies) if (Math.hypot(b.x - state.x, b.z - state.z) < A.frictionRadius) { speed *= A.friction + (1 - A.friction) * intent * intent; break; }
    state.x += pushX / push * speed * dt; state.z += pushZ / push * speed * dt;
  }
  // A picked target: glide onto its middle (it may move; the glide follows).
  if (state.gliding > 0) {
    const b = bodies.find(t => t.id === state.focus);
    if (!b) state.gliding = 0;
    else {
      const k = 1 - Math.exp(-dt / (A.glide / 3));
      state.x += (b.x - state.x) * k; state.z += (b.z - state.z) * k;
      state.gliding = Math.hypot(b.x - state.x, b.z - state.z) < .08 ? 0 : state.gliding - dt;
    }
  }
  // Aim assist, side to side only: the range is never touched.
  state.assisting = null;
  if (assist && bodies.length) {
    const cx = state.x - player.x, cz = state.z - player.z, r = Math.hypot(cx, cz);
    if (r > 1e-3) {
      const facing = Math.atan2(cz, cx);
      let best = null, bestOff = Infinity, bestTurn = 0;
      for (const b of bodies) {
        const dx = b.x - player.x, dz = b.z - player.z, d = Math.hypot(dx, dz);
        if (d < 1) continue;
        const turn = wrap(Math.atan2(dz, dx) - facing);
        if (Math.cos(turn) <= 0) continue;
        const off = Math.abs(d * Math.sin(turn)), width = b.id != null && b.id === state.focus ? A.focusWidth : A.assistWidth;
        if (off <= width && off < bestOff) { best = b; bestOff = off; bestTurn = turn; }
      }
      if (best) {
        state.assisting = best.id ?? null;
        const dx = best.x - player.x, dz = best.z - player.z, d2 = dx * dx + dz * dz;
        // Half its sideways movement (its turn round you), by itself.
        let rotate = A.assistTrack * ((dx * (best.vz || 0) - dz * (best.vx || 0)) / d2) * dt;
        // While you push: a drift toward its middle, no further than it.
        if (push > .05) {
          const most = A.assistPull * Math.min(1, push) * (digital ? ramp : 1) * dt / Math.max(r, 1);
          rotate += Math.max(-most, Math.min(most, bestTurn - rotate));
        }
        if (rotate) { const a = facing + rotate; state.x = player.x + Math.cos(a) * r; state.z = player.z + Math.sin(a) * r; }
      } else if (state.focus != null && !state.gliding) state.focus = null;
    }
  }
  // Never closer than `min`: the laser needs somewhere to go.
  const dx = state.x - player.x, dz = state.z - player.z, d = Math.hypot(dx, dz);
  if (d < A.min) {
    const ux = d > 1e-3 ? dx / d : player.aimX, uz = d > 1e-3 ? dz / d : player.aimZ;
    state.x = player.x + ux * A.min; state.z = player.z + uz * A.min;
  }
  return state;
}
