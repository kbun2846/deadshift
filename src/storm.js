// The storm (owner, 2026-09-29): a red zone that closes in on every map in
// every counted mode but practice and 1V1 (1V1 has its duel circle). Owner:
// "the shape should close into a new circle each round. it should be
// constantly shrinking. it should take a total of 2 mins to get to its final
// zone, in which it stays in until the 2 and a half minute timer gives up ...
// if caught in the storm, u lose [15, owner's pick] health per second until
// you leave. it shouldnt be per second but tick should occur quickly, so it
// should look like health meter is quickly going down."
//
//  - Team rounds (2V2, 3V3, 4V4, 2V2V2; online and SOLO vs robots): each
//    round a new final circle. From the start the safe circle (everything on
//    the map at first) shrinks steadily for `close` s onto it, holds there to
//    the round's 2:30, then sudden death: it closes on to nothing
//    (`sudden` s) until one side is left (owner: "Sudden death").
//  - FFA (a 5 or 10 minute match): one slow close over the match, reaching a
//    small final zone (`ffaFinal` m, a bit smaller than the camera's view)
//    `ffaHold` s before the end, where it stays; the last stretch builds
//    tension (owner: "it should stay there and the game should have effects
//    and stuff showing how close the game is getting to the end").
//
// A plan is a straight line between two circles: both centre and radius move
// steadily, so the final circle is inside the safe one the whole way (and
// every circle inside the one before). Pure: the host (net/arena.js) and SOLO
// (duel.js) make the plan with their own random; joiners get it in the match
// state and read the circle off the match clock, so nothing else travels.
// Drawn by render/storm-view.js; its damage is Simulation.stepStorm.
import { isPlayable } from './playable-area.js';
import { circleFits, openShare } from './duel-circle.js';
import { openAt } from './net/spawn-points.js';

export const STORM = Object.freeze({
 damage: 15,        // health a second while in it (100 per player)
 tick: .05,         // it bites 20 times a second, so the bar runs down
 close: 120,        // team rounds: seconds from the start to the final zone
 hold: 30,          // then this long at the final zone (the round's 2:30)
 sudden: 20,        // then sudden death: the final zone closes to nothing
 ffaHold: 45,       // FFA: at the final zone this long before the match ends
 ffaFinal: 12,      // FFA's final zone radius (m)
 final: Object.freeze({ share: .2, minR: 14, maxR: 30 }), // team rounds' final zone: share of the map across
 margin: 3,         // the first circle reaches this far past the map's corners
 tries: 160,
});
// The round clock the team modes show (the storm's own 2:30).
export const STORM_ROUND = STORM.close + STORM.hold;

// Which modes have it: every counted mode but 1V1 (its duel circle); never
// practice. (SOLO vs robots: its team modes.)
export const stormMode = mode => ['ffa', '2v2', '3v3', '4v4', '2v2v2'].includes(mode);

// The team rounds' final zone radius on a map.
export function stormFinalRadius(map) {
 const size = ((map.width || 0) + (map.depth || 0)) / 2, f = STORM.final;
 return Math.max(f.minR, Math.min(f.maxR, size * f.share / 2));
}

// A final circle: whole inside the map's playable outline (duel-circle.js
// circleFits) with room to fight (openShare), somewhere new each time
// (`avoid`: the last one). Smaller if the full size fits nowhere.
export function pickStormFinal(map, colliders, { random = Math.random, radius = stormFinalRadius(map), avoid = null } = {}) {
 let best = null, score = -1;
 for (let r = radius; r >= radius * .5; r *= .9) {
  const hx = Math.max(0, map.width / 2 - r - 2), hz = Math.max(0, map.depth / 2 - r - 2);
  for (let k = 0; k < STORM.tries; k++) {
   const x = (random() * 2 - 1) * hx, z = (random() * 2 - 1) * hz;
   if (!circleFits(map, x, z, r)) continue;
   const again = avoid && Math.hypot(avoid.x - x, avoid.z - z) < r;
   const share = openShare(map, colliders, x, z, r), s = share - (again ? .5 : 0);
   if (share >= .55 && !again) return { x, z, r };
   if (s > score) { score = s; best = { x, z, r }; }
  }
  if (best) return best;
 }
 // Nowhere at all: the middle of the map, where it is playable.
 return { x: 0, z: 0, r: isPlayable(map, 0, 0, 0) ? radius * .5 : radius };
}

// The circle that starts it all: everything on the map inside it.
export function stormStart(map) {
 return { x: 0, z: 0, r: Math.hypot((map.width || 0) / 2, (map.depth || 0) / 2) + STORM.margin };
}

// A plan. kind 'round': a team round (close, hold, sudden death); 'ffa': one
// close over a match of `length` s, reaching the final zone `ffaHold` s
// before the end and staying there.
export function stormPlan(map, colliders, { kind = 'round', length = 300, random = Math.random, avoid = null } = {}) {
 const start = stormStart(map);
 if (kind === 'ffa') {
  const end = pickStormFinal(map, colliders, { random, radius: STORM.ffaFinal, avoid });
  return { kind, x0: start.x, z0: start.z, r0: start.r, x1: end.x, z1: end.z, r1: end.r, close: Math.max(30, length - STORM.ffaHold), hold: Infinity, sudden: 0 };
 }
 const end = pickStormFinal(map, colliders, { random, avoid });
 return { kind, x0: start.x, z0: start.z, r0: start.r, x1: end.x, z1: end.z, r1: end.r, close: STORM.close, hold: STORM.hold, sudden: STORM.sudden };
}

// The safe circle `t` s into the plan ({ x, z, r }).
export function stormAt(plan, t) {
 if (!plan) return null;
 const s = Math.max(0, Math.min(1, t / plan.close));
 const x = plan.x0 + (plan.x1 - plan.x0) * s, z = plan.z0 + (plan.z1 - plan.z0) * s;
 let r = plan.r0 + (plan.r1 - plan.r0) * s;
 const suddenFrom = plan.close + plan.hold;
 if (plan.sudden > 0 && t > suddenFrom) r = plan.r1 * Math.max(0, 1 - (t - suddenFrom) / plan.sudden);
 return { x, z, r };
}

// Where the plan is at `t`: 'closing' (to the final zone), 'final' (holding),
// 'sudden' (closing to nothing); `left`: seconds to the next phase (Infinity
// when there is none).
export function stormPhase(plan, t) {
 if (!plan) return null;
 if (t < plan.close) return { phase: 'closing', left: plan.close - t };
 const suddenFrom = plan.close + plan.hold;
 if (t < suddenFrom) return { phase: 'final', left: suddenFrom - t };
 return { phase: 'sudden', left: plan.sudden > 0 ? Math.max(0, suddenFrom + plan.sudden - t) : Infinity };
}

// Out in the storm (the body's centre past the edge).
export const inStorm = (circle, x, z) => !!circle && Math.hypot(x - circle.x, z - circle.z) > circle.r;

// The plan as it travels (centimetres; Infinity as null).
const cm = v => Math.round(v * 100) / 100;
export const stormState = plan => (plan ? { kind: plan.kind, x0: cm(plan.x0), z0: cm(plan.z0), r0: cm(plan.r0), x1: cm(plan.x1), z1: cm(plan.z1), r1: cm(plan.r1), close: cm(plan.close), hold: Number.isFinite(plan.hold) ? cm(plan.hold) : null, sudden: cm(plan.sudden) } : null);
// ...and back (a joiner).
export const readStormState = s => (s ? { ...s, hold: s.hold == null ? Infinity : s.hold } : null);

// A respawn spot inside the safe circle as it will be `ahead` s on, well in
// from its edge (`inset`), open for a body (net/spawn-points.js openAt), and
// `ok` with it; as far from `others` as it finds, taking the first `apart`
// or more away. Null when the storm still covers nothing (its first circle),
// or nowhere was found. (Online FFA: net/arena.js; SOLO FFA: duel.js.)
export function stormSafeSpot(plan, t, { map, colliders, others = [], random = Math.random, apart = 14, ahead = 6, inset = 3, ok = () => true, tries = 160 } = {}) {
 if (!plan) return null;
 const c = stormAt(plan, t + ahead), inner = Math.max(1.5, c.r - inset);
 let best = null, bestD = -1;
 for (let k = 0; k < tries; k++) {
  const a = random() * Math.PI * 2, d = Math.sqrt(random()) * inner, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
  if (!openAt(map, colliders, x, z, 1) || !ok(x, z)) continue;
  const near = others.reduce((m, o) => Math.min(m, Math.hypot(o.x - x, o.z - z)), Infinity);
  if (near >= apart) return { x, z };
  if (near > bestD) { bestD = near; best = { x, z }; }
 }
 return best;
}
// Whether a spot is safe to come back at (inside the circle `ahead` s on,
// `inset` in from its edge).
export const stormSafe = (plan, t, p, { ahead = 6, inset = 3 } = {}) => {
 if (!plan || !p) return true;
 const c = stormAt(plan, t + ahead);
 return Math.hypot(p.x - c.x, p.z - c.z) < c.r - inset;
};
