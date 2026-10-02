// The low-health warning (pure; owner-approved: "screen edge pulses, a
// heartbeat that speeds up"). Under FEEL.lowHealth.below of full health the
// edge of the screen pulses red on each heartbeat, the beats closer together
// the lower you are. It is strong when you go low (or are hit again while
// low) and eases down to a quieter level after a few seconds, so sitting at
// low health never nags; a heal past the line or a new life stops it.
import { FEEL } from '../config/feel.js';

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

export function createLowHealth(cfg = FEEL.lowHealth) {
 const out = { level: 0, pulse: 0, beat: false, volume: 0, interval: 0, low: false };
 let low = false, since = 0, sinceBeat = 0, shown = 0;
 const api = {
  // You were hit (any damage): while low, the warning is strong again.
  hurt() { if (low) since = 0; },
  // A new life, a menu, the death screen: it stops at once.
  reset() { low = false; since = 0; sinceBeat = 0; shown = 0; out.level = out.pulse = out.volume = 0; out.beat = out.low = false; },
  // Once a frame: real seconds, your health and whether you are up and playing.
  // -> { level (0-1, the edge's strength), pulse (0-1, the beat's flash),
  //      beat (a heartbeat sounds now), volume, interval, low }
  step(dt, hp, maxHp, live) {
   out.beat = false;
   const share = maxHp > 0 ? hp / maxHp : 1;
   const nowLow = !!live && hp > 0 && share < cfg.below;
   if (!live) { api.reset(); return out; }
   if (nowLow && !low) { since = 0; sinceBeat = Infinity; }
   low = nowLow; out.low = low;
   // How low (0 at the line, 1 near empty) sets the pace and the strength.
   const depth = low ? clamp01(1 - share / cfg.below) : 0;
   out.interval = cfg.slowBeat + (cfg.fastBeat - cfg.slowBeat) * depth;
   since += dt;
   // Strong for `hold`, then easing down to `rest` over `ease`.
   const fade = since <= cfg.hold ? 1 : 1 - (1 - cfg.rest) * clamp01((since - cfg.hold) / cfg.ease);
   const target = low ? (.55 + .45 * depth) * fade : 0;
   // Out of it (healed): gone in about a third of a second; into it at once.
   shown = target >= shown ? target : Math.max(target, shown - dt * 3);
   out.level = shown;
   if (low) {
    sinceBeat += dt;
    if (sinceBeat >= out.interval) { sinceBeat = sinceBeat === Infinity ? 0 : sinceBeat % out.interval; out.beat = true; }
   } else sinceBeat = 0;
   // The flash of each beat: a quick rise and a decay before the next.
   out.pulse = low ? Math.exp(-sinceBeat * 7) : 0;
   out.volume = low ? cfg.volume * (.45 + .55 * fade) * (.6 + .4 * depth) : 0;
   return out;
  },
  get state() { return out; },
 };
 return api;
}
