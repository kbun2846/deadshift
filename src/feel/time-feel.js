// Hitstop and slow motion (pure). The owner's rule for them: they never change
// the simulation's time online (the server is the authority); there they only
// slow what is drawn: effects, blood, bodies falling (the renderer's effect
// clock, WorldView.timeScale). Solo (practice, BOTS) the simulation may slow
// with them: it is still stepped in whole fixed ticks, so it stays exactly
// the same game, only seen slower.
import { FEEL } from '../config/feel.js';

const smooth = t => t * t * (3 - 2 * t);

export function createTimeFeel(cfg = FEEL) {
 let stop = 0, slow = 0, slowTotal = 0;
 const api = {
  // A kill: the visuals freeze for `seconds` (never shortening one running).
  hitstop(seconds = cfg.kill.hitstop) { if (seconds > stop) stop = seconds; },
  // The round's last kill: slow motion for `seconds` of real time.
  slowmo(seconds = cfg.slowmo.time) { slow = slowTotal = seconds; },
  // Real seconds pass (once a frame, whatever the game is doing).
  step(realDt) {
   if (!(realDt > 0)) return;
   if (stop > 0) stop = Math.max(0, stop - realDt);
   if (slow > 0) slow = Math.max(0, slow - realDt);
  },
  // How fast the visuals run now: 1 normally, `frozen` in a hitstop, and in
  // slow motion `slowmo.scale`, held, then eased back up to 1.
  get scale() {
   let k = 1;
   if (slow > 0 && slowTotal > 0) {
    const t = 1 - slow / slowTotal, hold = cfg.slowmo.hold;
    k = t <= hold ? cfg.slowmo.scale : cfg.slowmo.scale + (1 - cfg.slowmo.scale) * smooth((t - hold) / (1 - hold));
   }
   if (stop > 0) k = Math.min(k, cfg.frozen);
   return k;
  },
  // The simulation's clock: online always 1 (never touched); solo the visuals'.
  simScale(online) { return online ? 1 : api.scale; },
  get slowing() { return slow > 0; },
  get stopped() { return stop > 0; },
  clear() { stop = slow = slowTotal = 0; },
 };
 return api;
}

// Was it the round's last kill? The kill and the round's end are seen apart
// (a robot falls on its next tick, the online round's state comes with the
// next snapshot), in either order: a round that ends within `window` s of a
// death had that death as its last kill. Each round end fires once.
export function createFinaleWatch(window = FEEL.slowmo.window) {
 let lastDeath = -Infinity, lastEnd = -Infinity, fired = -Infinity;
 const check = () => {
  if (Math.abs(lastEnd - lastDeath) > window || fired === lastEnd) return false;
  fired = lastEnd; return true;
 };
 return {
  // A death (anyone's) at `now` (real seconds).
  death(now) { lastDeath = now; return lastEnd > -Infinity && fired !== lastEnd && check(); },
  // The round (or match) ended at `now`.
  ended(now) { lastEnd = now; return check(); },
  reset() { lastDeath = lastEnd = fired = -Infinity; },
 };
}
