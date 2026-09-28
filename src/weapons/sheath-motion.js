// Sheath's hand-authored motion (owner's brief, 2026-09-28: heavy, varied,
// never stale). Every pose is eleven numbers, in the frame of the player's
// gun group (forward -z, right +x, up +y):
//   [hilt x, hilt y, hilt z, blade yaw, pitch, roll, torso spin, lean, bank, knee dip, step]
// yaw: the blade's heading (0 straight ahead, - to the right, + to the
// left, ±π pointing back); pitch: the tip up (+) or down (-); roll: turns the
// edge about the blade (0 flat, π/2 edge down). Torso spin turns the body
// with the cut, lean tips it forward, bank to the side, dip lowers the
// stance and step carries the body forward onto the front foot.
//
// Each swing is keys over its own time (0..1 of the swing): it starts on
// the guard where the last swing ended, cocks further back (anticipation),
// crosses fast through the hit window, follows through past the target with
// the weight on the front foot, then settles on the guard of the side it
// ended on, which is where the next swing starts. The wind-up ends at the
// swing's contact time (SHEATH.windup / interval ≈ .22), the strike crosses
// by ≈ .40.
import { SHEATH } from '../config/gameplay.js';

const A = SHEATH.windup / SHEATH.interval, B = (SHEATH.windup + SHEATH.hitWindow) / SHEATH.interval;
const MID = (A + B) / 2;
// Held out, ready, the blade on the right or the left.
export const GUARD_R = [-.1, -.06, .1, -.62, .42, .95, -.18, .02, -.02, .02, 0];
export const GUARD_L = [-.36, -.04, .12, .78, .38, 2.2, .22, .02, .03, .02, 0];
// In the black sheath at the left hip: the throat at the hip's front, the
// blade back and a little down (the sheath's own angle, sheath-model.js).
export const SHEATHED = [-.57, -.2, .34, Math.PI, -.43, Math.PI / 2, 0, 0, 0, 0, 0];
// The sheath's axis in gun space (the way a blade slides in).
export const SHEATH_AXIS = [0, -Math.sin(.43), Math.cos(.43)];
// The Draw-cut's set (its hop back and the tell): still sheathed, the blade
// thumbed a few centimetres out, the body low, turned and leaning in.
export const DRAW_READY = [SHEATHED[0] - SHEATH_AXIS[0] * .07, SHEATHED[1] - SHEATH_AXIS[1] * .07, SHEATHED[2] - SHEATH_AXIS[2] * .07, SHEATHED[3], SHEATHED[4], SHEATHED[5], .5, .24, .05, .2, -.05];

const SWINGS = [
 // 0 Right to left, flat across the chest: wound far round to the right.
 [[0, GUARD_R], [A * .55, [-.02, .0, .18, -1.75, .12, .25, -.46, -.02, -.04, .04, -.02]], [A, [.04, .02, .2, -2.1, .06, .15, -.58, -.03, -.05, .05, -.03]],
  [MID, [-.2, -.01, -.06, -.1, .02, .1, -.02, .08, .02, .08, .13]], [B, [-.44, -.03, .06, 1.62, -.02, .1, .5, .1, .06, .09, .17]],
  [.68, [-.46, -.06, .13, 2.02, -.1, .2, .62, .08, .07, .07, .13]], [1, GUARD_L]],
 // 1 Left to right backhand, the edge rolled over to lead.
 [[0, GUARD_L], [A * .55, [-.43, .02, .18, 1.9, .14, 2.8, .5, -.02, .05, .04, -.02]], [A, [-.47, .03, .2, 2.25, .1, 3.05, .64, -.03, .06, .05, -.03]],
  [MID, [-.16, .0, -.06, .12, .04, 3.1, .04, .08, -.01, .08, .13]], [B, [.06, -.01, .05, -1.62, .0, 3.05, -.52, .09, -.05, .09, .16]],
  [.68, [.08, -.05, .12, -2.0, -.08, 2.9, -.6, .07, -.06, .07, .12]], [1, GUARD_R]],
 // 2 Falling diagonal from high on the right, across and down to the left.
 [[0, GUARD_R], [A * .55, [.0, .22, .18, -1.1, .95, .9, -.4, -.06, -.06, .02, -.02]], [A, [.03, .3, .2, -1.2, 1.15, .85, -.48, -.08, -.07, .02, -.03]],
  [MID, [-.2, .06, -.08, -.12, -.18, .85, .04, .12, .03, .08, .14]], [B, [-.4, -.12, .0, 1.2, -.42, .8, .44, .16, .08, .12, .18]],
  [.68, [-.42, -.14, .08, 1.4, -.48, .9, .5, .13, .08, .1, .14]], [1, GUARD_L]],
 // 3 Rising diagonal from low on the left, up and across to the right.
 [[0, GUARD_L], [A * .55, [-.4, -.14, .14, 1.4, -.36, 2.5, .45, .02, .06, .1, -.02]], [A, [-.43, -.18, .14, 1.55, -.46, 2.4, .54, .03, .07, .12, -.03]],
  [MID, [-.2, -.05, -.06, .1, .08, 2.3, .02, .06, -.02, .07, .12]], [B, [.02, .2, .05, -1.3, .88, 2.2, -.44, -.04, -.06, .02, .15]],
  [.68, [.04, .22, .12, -1.5, .95, 2.1, -.52, -.06, -.06, .01, .11]], [1, GUARD_R]],
 // 4 Overhead: up over the head, straight down through the middle.
 [[0, GUARD_R], [A * .55, [-.12, .36, .22, -.2, 1.65, 1.57, -.18, -.1, -.02, .0, -.04]], [A, [-.12, .44, .26, -.14, 1.95, 1.57, -.2, -.14, -.02, .0, -.05]],
  [MID, [-.18, .14, -.18, -.05, .25, 1.57, -.04, .12, .0, .08, .16]], [B, [-.22, -.08, -.2, .14, -.6, 1.57, .06, .24, .02, .15, .21]],
  [.68, [-.26, -.1, -.12, .3, -.66, 1.6, .12, .2, .03, .15, .17]], [1, GUARD_L]],
 // 5 The wide heavy sweep: coiled low and far left, round to the far right.
 [[0, GUARD_L], [A * .55, [-.5, -.06, .2, 2.3, .06, 2.95, .8, .0, .07, .1, -.03]], [A, [-.54, -.08, .22, 2.6, .02, 3.05, .95, .0, .08, .13, -.05]],
  [MID, [-.2, -.08, -.1, .0, .0, 3.1, .05, .1, .0, .13, .16]], [B, [.1, -.06, .04, -2.1, -.04, 3.0, -.82, .1, -.07, .12, .22]],
  [.68, [.12, -.08, .12, -2.4, -.1, 2.9, -.9, .08, -.08, .1, .17]], [1, GUARD_R]],
 // 6 The draw: out of the sheath along its axis, then rising across to the right.
 [[0, SHEATHED], [.13, [-.57, -.02, -.04, Math.PI, -.43, 1.9, .2, .0, .04, .04, 0]], [.27, [-.46, -.05, -.1, 2.35, -.18, 2.7, .42, .02, .06, .08, .02]],
  [.355, [-.2, .02, -.1, .25, .04, 2.6, .02, .07, .0, .08, .13]], [.46, [.02, .16, .04, -1.45, .5, 2.3, -.46, .02, -.05, .05, .16]],
  [.68, [.04, .14, .12, -1.62, .56, 2.1, -.5, .0, -.05, .04, .12]], [1, GUARD_R]],
];
// Where each swing's blade is fastest (the hit window), for the trail and
// the swing sound: the fraction of the swing.
export const sheathStrike = variant => variant === 6 ? [.27, .46] : [A, B];

// The Draw-cut's own slash, low and huge, then the flourish and the snap
// back into the sheath (its phases in sheath.js; these are 0..1 of each).
const DRAW_STRIKE = [[0, [-.48, -.12, .2, 2.5, -.05, 2.9, .9, .15, .06, .2, .05]], [.35, [-.2, -.1, -.14, .1, -.02, 3.0, .05, .2, .0, .22, .2]], [.7, [.12, -.08, .02, -2.2, -.02, 3.0, -.85, .18, -.08, .2, .25]], [1, [.14, -.08, .08, -2.45, .04, 2.9, -.9, .12, -.08, .16, .2]]];
const FLOURISH = [[0, DRAW_STRIKE[3][1]], [.22, [-.04, .06, .08, -1.4, .3, 4.3, -.5, .02, -.04, .06, .05]], [.42, [-.28, .06, .06, .6, .2, 5.9, .1, .0, .02, .03, 0]], [.62, [-.48, .0, -.12, 2.55, -.3, 6.3 + Math.PI / 2, .25, 0, .03, .02, 0]], [.8, [-.57, -.06, .04, Math.PI, -.43, 2 * Math.PI + Math.PI / 2, .08, 0, .01, .01, 0]], [1, [...SHEATHED.slice(0, 5), 2 * Math.PI + Math.PI / 2, 0, 0, 0, 0, 0]]];
// Back into the sheath after a short idle: round to the left hip, point
// behind, and slide it home.
const RESHEATHE = [[0, null], [.42, [-.48, -.02, -.12, 2.55, -.28, 1.9, .15, 0, .02, .01, 0]], [.72, [-.57, -.05, .06, Math.PI, -.43, Math.PI / 2, .06, 0, .01, 0, 0]], [1, SHEATHED]];
export const SHEATHE_TIME = .42;

const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
// The strike itself is not eased in and out like the rest: it snaps (fast
// through the middle), so the wind-up reads as a pause and the cut as a blow.
const snap = t => { t = Math.max(0, Math.min(1, t)); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export function keysAt(keys, t, out, from, snaps = false) {
 for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
  const [a, p0] = keys[i - 1], [b, q] = keys[i], p = p0 || from, u = (t - a) / (b - a || 1), f = snaps && (i === 3 || i === 4) ? snap(u) : ease(u);
  for (let j = 0; j < 11; j++) out[j] = p[j] + (q[j] - p[j]) * f;
  return out;
 }
 const last = keys[keys.length - 1][1]; for (let j = 0; j < 11; j++) out[j] = last[j];
 return out;
}
export const sheathSwingPose = (variant, t, out = new Array(11)) => keysAt(SWINGS[variant] || SWINGS[0], Math.max(0, Math.min(1, t)), out, null, true);
export const sheathDrawStrikePose = (t, out = new Array(11)) => keysAt(DRAW_STRIKE, t, out);
// The dash: out of the set toward the strike's first key (drawn low as the
// body flies), 0..1 of the dash.
const DASH = [[0, DRAW_READY], [1, DRAW_STRIKE[0][1]]];
export const sheathDrawDashPose = (t, out = new Array(11)) => keysAt(DASH, t, out);
export const sheathFlourishPose = (t, out = new Array(11)) => keysAt(FLOURISH, t, out);
export const sheathResheathePose = (t, from, out = new Array(11)) => keysAt(RESHEATHE, t, out, from);
export const SHEATH_SWING_COUNT = SWINGS.length;
