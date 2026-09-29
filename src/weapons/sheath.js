// Sheath: a white broadsword kept in a black sheath at the left hip (owner's
// brief, 2026-09-28). The rules only: every number is SHEATH in
// config/gameplay.js, the look is sheath-view.js / sheath-model.js.
//
// Main slashes are one heavy swing at a time. Each swing has a wind-up, a
// short hit window in which everyone inside its arc is cut once, and a long
// recovery. The swing that follows is chosen to start on the side where the
// last one ended (a right-to-left cut leaves the blade on the left, so the
// next is a left-to-right one), never the same swing twice and not in a fixed
// loop. The first swing out of the sheath is the draw-slash.
//
// E (Gold Rush): three seconds of faster walking with a gold trail; the sword
// comes out and a gold extension doubles its reach while it runs.
// X (Draw-cut, owner 2026-09-28 rev. 2): a quick hop back, a split-second
// set with the hand on the grip (a gold line shows where it will go), then a
// straight dash along the way you faced when you pressed it, up to 7.5 m
// (stopping at the first wall). Anyone the dash passes through is cut; anyone
// who steps off the line before it reaches them is not. It is its own move:
// no dash charge, no dash look.
//
// stepSheathMobility runs in every sim, the joiner's predicting one too
// (it moves the body); stepSheath (the damage) only where the rules are
// decided.
import { SHEATH as S, RULES } from '../config/gameplay.js';
import { targetRadius } from '../target-radius.js';
import { ichorCoverMeets, ichorSweepMeets } from './ichor-cut.js';
import { cutCrops } from '../crops.js';
import { collidersAlong } from '../world/collider-grid.js';
export { S as SHEATH };

// Swing ids (their arc/reach in SHEATH.arcs / reaches; their look in
// sheath-motion.js). `from`/`to`: the side the blade starts and ends on
// (1 right, -1 left). `sweep`: +1 the blade travels right to left.
export const SHEATH_SWINGS = Object.freeze([
 { name: 'flat', from: 1, to: -1, sweep: 1 },       // 0 right-to-left horizontal
 { name: 'backhand', from: -1, to: 1, sweep: -1 },  // 1 left-to-right backhand
 { name: 'falling', from: 1, to: -1, sweep: 1 },    // 2 diagonal down from the right
 { name: 'rising', from: -1, to: 1, sweep: -1 },    // 3 rising diagonal from the left
 { name: 'overhead', from: 1, to: -1, sweep: .35 }, // 4 overhead vertical (lands left of centre)
 { name: 'sweep', from: -1, to: 1, sweep: -1 },     // 5 wide heavy sweep
 { name: 'draw', from: -1, to: 1, sweep: -1 },      // 6 the draw-slash out of the sheath
]);
export const SHEATH_DRAW = 6;

export function resetSheath(sim, keep = false) {
 const old = sim.sheath;
 sim.sheath = {
  cooldown: 0, swing: 0, duration: S.interval, windup: S.windup, variant: 0, serial: 0, history: [], hitIds: [], contact: false,
  queued: false, trigger: false, out: false, idle: 0, volley: 0, cutX: 1, cutZ: 0,
  eCooldown: keep ? old?.eCooldown || 0 : 0, xCooldown: keep ? old?.xCooldown || 0 : 0,
  rush: 0, blood: 0, x: null,
 };
 delete sim.player?.sheath;
}

// The next swing: it starts where the last one ended, is never the last one
// again, and avoids the one before that when it can, picked at random among
// the rest so there is no loop to learn.
export function nextSheathSwing(s, random = Math.random) {
 if (!s.out) return SHEATH_DRAW;
 const last = s.history[s.history.length - 1], before = s.history[s.history.length - 2];
 const side = last == null ? 1 : SHEATH_SWINGS[last].to;
 let pool = [0, 1, 2, 3, 4, 5].filter(v => SHEATH_SWINGS[v].from === side && v !== last);
 if (pool.length > 1) { const fresh = pool.filter(v => v !== before); if (fresh.length) pool = fresh; }
 return pool[Math.floor(random() * pool.length) % pool.length];
}
export const sheathDamage = (random = Math.random) => S.damage - S.damageRoll + Math.floor(random() * (S.damageRoll * 2 + 1));
export const sheathDrawCutDamage = (random = Math.random) => S.xDamage - S.xRoll + Math.floor(random() * (S.xRoll * 2 + 1));
export const sheathArc = variant => S.arcs[variant] ?? S.arcs[0];
export const sheathReach = (variant, rush = false) => (S.range + (S.reaches[variant] || 0)) * (rush ? S.rushReach : 1);

// The push a cut gives a body (blood spray, a severed limb's flight): along
// the blade's travel at the target, plus a little forward.
export function sheathCutForce(variant, aimX, aimZ, offsetX, offsetZ) {
 const d = Math.hypot(offsetX, offsetZ), rx = d > .01 ? offsetX / d : aimX, rz = d > .01 ? offsetZ / d : aimZ;
 const sweep = SHEATH_SWINGS[variant]?.sweep ?? 1, push = variant === 4 ? .8 : .3;
 const x = rz * sweep + aimX * push, z = -rx * sweep + aimZ * push, n = Math.hypot(x, z) || 1;
 return { x: x / n, z: z / n };
}

// Where a Draw-cut from (x, z) along (dx, dz) must stop: the first solid
// thing a body cannot pass (walls, fences, rocks; breakables are cut, floor
// clutter is stepped over), or its full range. Returns the distance.
export function sheathDrawCutLength(sim, x, z, dx, dz, segmentBox) {
 let length = S.xRange;
 for (const c of collidersAlong(sim.colliders, x, z, x + dx * S.xRange, z + dz * S.xRange, RULES.radius)) {
  if (c.destructible || c.walkOver) continue;
  const t = segmentBox(x, z, x + dx * S.xRange, z + dz * S.xRange, c, RULES.radius);
  if (t !== null && t * S.xRange < length) length = t * S.xRange;
 }
 // (Hills: a crest too high to walk over ends it like a wall.)
 if (!sim.ground.flat) {
  const from = sim.standY();
  for (let k = .25; k <= length; k += .25) if (Math.abs(sim.ground.heightAt(x + dx * k, z + dz * k) - from) > k * .9 + .6) { length = Math.max(0, k - .25); break; }
 }
 return Math.max(0, length - .05);
}

// Everything the body can do with the sword that moves it, run in every sim.
// Returns the input to walk with (none while the Draw-cut roots you).
export function stepSheathMobility(sim, input, dt, geo) {
 if (sim.weapon !== 'sheath') { if (sim.player) delete sim.player.sheath; return input; }
 const s = sim.sheath, p = sim.player;
 const cool = k => { s[k] = sim.dev.cooldowns ? 0 : Math.max(0, s[k] - dt); };
 cool('eCooldown'); cool('xCooldown');
 if (p.dead || p.hp <= 0) { s.rush = 0; s.x = null; s.swing = 0; s.queued = false; return input; }
 if (s.rush > 0) { s.rush = Math.max(0, s.rush - dt); if (s.rush < 1e-8) { s.rush = 0; if (!sim.predictOnly) sim.events.push({ type: 'sheathRushEnd', id: p.id, x: p.x, z: p.z }); } }
 if (input.sheathE && s.eCooldown <= 1e-8 && !s.rush) {
  // The sword comes out (and stays out while it runs) with its gold extension.
  const drew = !s.out && !s.x;
  s.rush = S.rushDuration; s.eCooldown = S.eCooldown; if (!s.x) { s.out = true; s.idle = 0; }
  if (!sim.predictOnly) sim.events.push({ type: 'sheathRush', id: p.id, x: p.x, z: p.z, draw: drew, below: !!p.below });
 }
 if (input.sheathX && s.xCooldown <= 1e-8 && !s.x && !p.dodgeRemaining) {
  // The direction is fixed now: the way you face as you press it.
  const n = Math.hypot(p.aimX, p.aimZ) || 1, dx = p.aimX / n, dz = p.aimZ / n;
  s.x = { phase: 'back', t: 0, dx, dz, back: 0, sx: p.x, sz: p.z, length: 0, travel: 0, hitIds: [], hits: 0 };
  s.xCooldown = S.xCooldown; s.swing = 0; s.queued = false; s.idle = 0;
  // (A drawn sword goes back in during the hop: the Draw-cut starts sheathed.)
  s.out = false; p.dodgeQueued = 0;
  if (!sim.predictOnly) sim.events.push({ type: 'sheathDrawBack', id: p.id, x: p.x, z: p.z, dx, dz, below: !!p.below });
 }
 let walk = input;
 if (s.x) {
  const cut = s.x; cut.t += dt;
  if (cut.phase === 'back') {
   // A short hop backwards (walls stop it like any step).
   const step = Math.min(S.xBackDist - cut.back, S.xBackDist / S.xBack * dt);
   if (step > 0) { sim.movePlayer(-cut.dx * step, -cut.dz * step); cut.back += step; }
   if (cut.t >= S.xBack - 1e-9) {
    // Set: the line is measured from here and shown to everyone.
    cut.phase = 'tell'; cut.t = 0; cut.sx = p.x; cut.sz = p.z;
    cut.length = sheathDrawCutLength(sim, p.x, p.z, cut.dx, cut.dz, geo.segmentBox);
    if (!sim.predictOnly) sim.events.push({ type: 'sheathDrawTell', id: p.id, x: p.x, z: p.z, dx: cut.dx, dz: cut.dz, length: cut.length, tell: S.xTell, below: !!p.below });
   }
  } else if (cut.phase === 'tell' && cut.t >= S.xTell - 1e-9) {
   cut.phase = 'dash'; cut.t = 0; cut.travel = 0; s.out = true;
   if (!sim.predictOnly) sim.events.push({ type: 'sheathDrawDash', id: p.id, x: p.x, z: p.z, dx: cut.dx, dz: cut.dz, length: cut.length, below: !!p.below });
  } else if (cut.phase === 'dash') {
   // Straight down the line, through bodies (never walls), cutting what the
   // blade reaches as it passes. It lands `xShort` short of the line's end;
   // the blade's reach carries on to the end.
   const land = Math.max(0, cut.length - S.xShort), from = cut.travel, to = Math.min(land, from + S.xDashSpeed * dt), last = to >= land - 1e-9;
   if (!sim.predictOnly) drawCutSweep(sim, cut, geo, from, last ? cut.length : Math.min(cut.length, to + S.xLead));
   if (to > from) sim.movePlayer(cut.dx * (to - from), cut.dz * (to - from));
   cut.travel = to;
   if (last) {
    cut.phase = 'strike'; cut.t = 0;
    if (!sim.predictOnly) sim.events.push({ type: 'sheathDrawCut', id: p.id, x0: cut.sx, z0: cut.sz, x1: p.x, z1: p.z, ex: cut.sx + cut.dx * cut.length, ez: cut.sz + cut.dz * cut.length, dx: cut.dx, dz: cut.dz, hits: cut.hits, below: !!p.below });
   }
  } else if (cut.phase === 'strike' && cut.t >= S.xStrike) { cut.phase = 'flourish'; cut.t = 0; }
  else if (cut.phase === 'flourish' && cut.t >= S.xFlourish) {
   s.x = null; s.out = false; s.idle = 0;
   if (!sim.predictOnly) sim.events.push({ type: 'sheathSheathe', id: p.id, x: p.x, z: p.z, flourish: true });
  }
  if (s.x && s.x.phase !== 'flourish') { p.vx = p.vz = 0; walk = { ...input, moveX: 0, moveZ: 0, dodge: false }; }
  else walk = { ...input, dodge: s.x ? false : input.dodge };
 }
 p.sheath = sheathSnapshot(s);
 return walk;
}

// What other players' screens need to draw the sword (playerState).
export function sheathSnapshot(s) {
 return { out: s.out, swing: s.swing, duration: s.duration, windup: s.windup, variant: s.variant, serial: s.serial, rush: s.rush, blood: s.blood,
  ...(s.x ? { cut: s.x.phase, cutT: s.x.t, cutDX: s.x.dx, cutDZ: s.x.dz, cutLen: s.x.length, cutSX: s.x.sx, cutSZ: s.x.sz, cutTr: s.x.travel, cutBack: s.x.back } : {}) };
}

// One tick of the dash: everyone within xWidth (and their own radius) of the
// part of the line covered from `a` to `b` m is cut, once; breakables and
// crops on it are cut apart.
function drawCutSweep(sim, cut, geo, a, b) {
 const p = sim.player, y = sim.standY();
 const ax = cut.sx + cut.dx * a, az = cut.sz + cut.dz * a, bx = cut.sx + cut.dx * b, bz = cut.sz + cut.dz * b;
 const volley = cut.volley ??= ++sim.volley;
 for (const t of sim.targets) {
  if (t.hp <= 0 || t.friendly || t.id === p.id || cut.hitIds.includes(t.id) || Math.abs(sim.standY(t) - y) > 1.3) continue;
  if (geo.segmentCircle(ax, az, bx, bz, t.x, t.z, S.xWidth + targetRadius(t)) === null) continue;
  cut.hitIds.push(t.id);
  const before = t.hp;
  // A clean cut across the line, thrown the way the blade finishes.
  const side = (t.x - cut.sx) * -cut.dz + (t.z - cut.sz) * cut.dx >= 0 ? 1 : -1;
  sim.hit(t, { owner: p.id, damage: sheathDrawCutDamage(), damageType: 'bladeDraw', vx: cut.dx * .7 - cut.dz * side * .7, vz: cut.dz * .7 + cut.dx * side * .7, volley });
  if (t.hp < before) { cut.hits++; bloodFrom(sim, t); sim.events.push({ type: 'sheathHit', id: t.id, by: p.id, x: t.x, z: t.z, dx: cut.dx, dz: cut.dz, draw: true, targetKind: t.kind, below: !!t.below }); }
 }
 for (const prop of sim.props) {
  if (!(prop.hp > 0) || prop.health === null) continue;
  const c = sim.colliders.find(c => c.propId === prop.id);
  const meets = c ? geo.segmentBox(ax, az, bx, bz, c, S.xWidth * .6) !== null : geo.segmentCircle(ax, az, bx, bz, prop.x, prop.z, S.xWidth) !== null;
  if (meets) sim.hitProp(prop, { owner: p.id, damage: prop.hp, damageType: 'bladeDraw', x: prop.x, z: prop.z, vx: cut.dx, vz: cut.dz });
 }
 if (sim.crops?.length && !p.below) cutCrops(sim, { kind: 'line', ax, az, bx, bz, r: S.xWidth }, sim.crops.filter(crop => crop.state !== 'gone' && geo.segmentBox(ax, az, bx, bz, crop, S.xWidth) !== null), cut.dx, cut.dz);
}

// Blood on the blade: people only, never robots or practice dummies.
function bloodFrom(sim, t) { if (t.kind === 'player') sim.sheath.blood = Math.min(1, sim.sheath.blood + S.bloodPerHit); }

function startSwing(sim) {
 const s = sim.sheath, p = sim.player, variant = nextSheathSwing(s);
 s.variant = variant; s.serial++; s.history.push(variant); if (s.history.length > 4) s.history.shift();
 s.windup = variant === SHEATH_DRAW ? S.drawWindup : S.windup;
 s.duration = S.interval + (s.windup - S.windup);
 // Drawing on the move is a little slower (the whole draw stretched).
 if (variant === SHEATH_DRAW && Math.hypot(p.vx, p.vz) > 1) { s.windup *= S.drawMoveSlow; s.duration *= S.drawMoveSlow; }
 s.swing = s.duration; s.cooldown = s.duration;
 s.hitIds = []; s.contact = false; s.cutX = p.aimX; s.cutZ = p.aimZ; s.volley = ++sim.volley;
 const drawn = !s.out; s.out = true; s.idle = 0;
 sim.events.push({ type: 'sheathSwing', id: p.id, x: p.x, z: p.z, dx: s.cutX, dz: s.cutZ, variant, serial: s.serial, duration: s.duration, windup: s.windup, draw: drawn, blood: s.blood, rush: s.rush > 0, below: !!p.below });
}

// One tick of the swing's hit window: anyone inside the arc not yet cut by
// this swing is cut now. The cut direction is locked at the swing's start
// (a heavy blade does not follow the cursor mid-swing).
// `progress` 0..1 through the hit window: the blade sweeps across its arc
// (right to left or back), and a body is cut as the blade reaches its side
// of the arc, so the hit (and the attacker's hit-stop) lands when the blade
// is seen to pass through it. By the window's end everyone in the arc has
// been reached.
function slashContact(sim, geo, progress = 1) {
 const s = sim.sheath, p = sim.player, arc = sheathArc(s.variant), reach = sheathReach(s.variant, s.rush > 0), y = sim.standY();
 const sweep = SHEATH_SWINGS[s.variant]?.sweep ?? 1, vertical = Math.abs(sweep) < .5;
 const reached = t => {
  if (progress >= 1 - 1e-9) return true;
  if (vertical) return progress >= .45;
  const dx = t.x - p.x, dz = t.z - p.z, side = Math.atan2(dx * s.cutZ - dz * s.cutX, dx * s.cutX + dz * s.cutZ);
  // side > 0: to the left of the cut's line. The blade's angle now:
  const blade = sweep > 0 ? -arc / 2 + arc * progress : arc / 2 - arc * progress;
  return sweep > 0 ? blade >= side - .12 : blade <= side + .12;
 };
 const open = t => Math.abs(sim.standY(t) - y) < 1.2 && !sim.colliders.some(c => {
  if (c.playerOnly || c.propId === t.id) return false;
  const k = geo.segmentBox(p.x, p.z, t.x, t.z, c);
  return k !== null && ichorCoverMeets(sim, c, p.x + (t.x - p.x) * k, p.z + (t.z - p.z) * k, y + .72 + (sim.standY(t) - y) * k);
 });
 const inArc = t => {
  const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz), r = targetRadius(t);
  if (d > reach + r) return false;
  if (d < .5) return true;
  const angle = Math.acos(Math.max(-1, Math.min(1, (dx * s.cutX + dz * s.cutZ) / d)));
  return angle <= arc / 2 + Math.asin(Math.min(1, r / d));
 };
 const victims = sim.targets.filter(t => t.hp > 0 && !t.friendly && !s.hitIds.includes(t.id) && inArc(t) && reached(t) && open(t));
 for (const t of victims) {
  s.hitIds.push(t.id);
  const before = t.hp, f = sheathCutForce(s.variant, s.cutX, s.cutZ, t.x - p.x, t.z - p.z);
  sim.hit(t, { owner: p.id, damage: sheathDamage(), damageType: 'blade', vx: f.x, vz: f.z, volley: s.volley, swing: s.variant });
  if (t.hp < before) {
   bloodFrom(sim, t);
   sim.events.push({ type: 'sheathHit', id: t.id, by: p.id, x: t.x, z: t.z, dx: f.x, dz: f.z, variant: s.variant, targetKind: t.kind, below: !!t.below });
  }
 }
 // Every prop is judged against the same cover before any breaks, so one
 // swing cannot cut through a front crate into the one behind it.
 const props = sim.props.filter(prop => prop.hp > 0 && !s.hitIds.includes('prop:' + prop.id) && inArc(prop) && reached(prop) && open(prop));
 for (const prop of props) {
  s.hitIds.push('prop:' + prop.id);
  const f = sheathCutForce(s.variant, s.cutX, s.cutZ, prop.x - p.x, prop.z - p.z);
  sim.hitProp(prop, { owner: p.id, damage: sheathDamage(), damageType: 'blade', x: prop.x, z: prop.z, vx: f.x, vz: f.z });
  sim.events.push({ type: 'sheathClang', id: p.id, x: prop.x, z: prop.z, dx: f.x, dz: f.z, below: !!p.below });
 }
 if (progress >= 1 - 1e-9 && sim.crops?.length && !p.below) cutCrops(sim, { kind: 'arc', x: p.x, z: p.z, cx: s.cutX, cz: s.cutZ, reach, arc }, sim.crops.filter(crop => crop.state !== 'gone' && Math.abs(sim.ground.heightAt(crop.x, crop.z) - y) < 1.2 && ichorSweepMeets(p.x, p.z, s.cutX, s.cutZ, reach, arc, crop)), s.cutX, s.cutZ);
}

export function stepSheath(sim, input, dt, geo) {
 if (sim.predictOnly) return;
 const s = sim.sheath, p = sim.player;
 s.cooldown = Math.max(0, s.cooldown - dt);
 if (p.dead || p.hp <= 0) { s.swing = 0; s.queued = false; return; }
 const press = !!input.tapFire || !!input.fire;
 s.trigger = !!input.fire;
 // An attack pressed during a dash waits for the dash to end (never a swing
 // mid-dash), then goes at once.
 if (press && (p.dodgeRemaining > 0 || s.cooldown > 1e-8)) s.queued = true;
 if (s.swing > 0) {
  s.swing = Math.max(0, s.swing - dt); if (s.swing < 1e-8) s.swing = 0;
  const age = s.duration - s.swing;
  if (age >= s.windup - 1e-9 && age <= s.windup + S.hitWindow + 1e-9) {
   const progress = Math.min(1, (age - s.windup) / S.hitWindow), last = age + dt > s.windup + S.hitWindow + 1e-9;
   s.contact = true; slashContact(sim, geo, last ? 1 : progress);
  }
 }
 const busy = !!s.x;
 if (!busy && !p.dodgeRemaining && s.cooldown <= 1e-8 && (press || s.queued)) { s.queued = false; startSwing(sim); }
 if (busy) s.queued = false;
 // Back into the sheath after a short idle.
 if (s.out && !s.swing && !s.x && !(s.rush > 0)) {
  s.idle += dt;
  if (s.idle >= S.sheatheDelay) { s.out = false; s.idle = 0; sim.events.push({ type: 'sheathSheathe', id: p.id, x: p.x, z: p.z }); }
 }
 p.sheath = sheathSnapshot(s);
}
