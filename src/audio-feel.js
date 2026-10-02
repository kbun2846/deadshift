// The feel pass's sounds (owner, 2026-10-01: "Make the kills feel amazing ...
// then do all the feel and feedback things"), synthesized like the rest of
// audio.js (Web Audio, no files): built from the Soundscape's own voices
// (tone, impact, noise, ring), so they follow its mixer, mute and suspend.
//
// - killSound: your kill of a player or a robot: a sharp crack over a short
//   low punch, then a bright two-note sting. A one-shot adds a deep boom and
//   a ringing high bell, so it is told apart at once.
// - streakSound / shutdownSound: the banners' calls (feel/streak-banner.js).
// - finaleSound: the round's last kill, under the slow motion.
// - heartbeat: the low-health warning's double thump (feel/low-health.js).
// - reloadDone: each weapon family's reload finishing, one short distinct
//   sound each (Static, Ichor and Sheath never reload).

export function killSound(s, oneShot = false) {
 // The crack: a very short bright snap with a lower body under it.
 s.impact(.03, .24, 4200);
 s.impact(.07, .16, 1300);
 s.tone(190, 60, .11, .11, 'triangle');
 // The sting: up a fifth, quick and clean.
 s.tone(988, 980, .07, .05, 'square', .02);
 s.tone(1480, 1470, .16, .045, 'sine', .055);
 if (oneShot) {
  // A one-shot: a heavier boom and a bell left ringing.
  s.tone(95, 34, .34, .16, 'sine', .01);
  s.impact(.2, .13, 520, undefined, .015);
  s.ring(1760, .55, .05, .08);
  s.noise(.09, .05, 5200);
 }
}

// Streak callouts: a rising run, one note more for each step (3, 5, 8).
export function streakSound(s, n = 3) {
 const steps = n >= 8 ? 4 : n >= 5 ? 3 : 2, base = 523;
 for (let i = 0; i < steps; i++) s.tone(base * 2 ** (i * 4 / 12), base * 2 ** (i * 4 / 12) * 1.003, .14, .05, 'triangle', i * .075);
 s.tone(base * 2 ** ((steps - 1) * 4 / 12) * 2, base * 2 ** ((steps - 1) * 4 / 12) * 2, .3, .025, 'sine', steps * .075);
 s.impact(.04, .08, 2600);
}
// A shutdown: a heavy hit and a falling chord, the streak cut off.
export function shutdownSound(s) {
 s.impact(.09, .2, 900);
 s.tone(140, 52, .3, .14, 'sine');
 s.tone(784, 523, .32, .05, 'sawtooth', .03);
 s.tone(988, 659, .32, .035, 'triangle', .03);
 s.ring(1320, .4, .03, .09);
}
// The round's last kill: a low swell that drops away, under the slow motion.
export function finaleSound(s) {
 s.tone(70, 32, .7, .16, 'sine');
 s.whoosh(.6, .07, 900, 160, 0, .25, 1.1);
 s.ring(660, .9, .035, .05, [1, 1.5, 2.01]);
}
// One heartbeat: lub-dub, low and soft (`level` 0-1).
export function heartbeat(s, level = 1) {
 if (!(level > .02)) return;
 s.tone(58, 40, .13, .12 * level, 'sine');
 s.impact(.05, .05 * level, 180);
 s.tone(52, 36, .12, .085 * level, 'sine', .19);
}

// Which family a reload-finished event belongs to (null: not one).
export function reloadFamily(e) {
 switch (e?.type) {
  case 'rifleReloaded': return 'rifle';            // Nominal
  case 'shotgunReloaded': return 'shotgun';        // Ballast
  case 'sidekickReloaded': return 'pistol';        // Sidekick
  case 'sightlineReloaded': return e.rifle ? (e.special ? 'breach' : 'sniper') : 'pistol'; // Sightline's rifle, Breach load, or its Sidekick
  case 'omenReloaded': return 'omen';              // Omen
  default: return null;
 }
}
// The sound for a family: every one short and its own.
export function reloadDone(s, family) {
 switch (family) {
  // A box magazine seated and the bolt let go: two bright clacks.
  case 'rifle': s.impact(.03, .12, 1500); s.impact(.025, .13, 3100, undefined, .065); s.tone(520, 300, .05, .035, 'triangle', .065); return true;
  // The break-action snapped shut: one heavy low clunk and a latch tick.
  case 'shotgun': s.impact(.08, .2, 640); s.tone(150, 72, .12, .1, 'triangle'); s.impact(.02, .1, 2600, undefined, .05); return true;
  // A slide run home: a quick high snap.
  case 'pistol': s.impact(.025, .14, 3600); s.tone(1100, 640, .045, .04, 'square'); return true;
  // A long bolt closed and locked: a metal slide, a solid lock and a ring.
  case 'sniper': s.whoosh(.09, .05, 2400, 1200, 0, .5, 3); s.impact(.04, .17, 2000, undefined, .08); s.ring(880, .22, .025, .1); s.tone(180, 90, .1, .06, 'triangle', .08); return true;
  // The Breach load: the same lock with a hot rising whine on it.
  case 'breach': s.impact(.04, .18, 1900); s.ring(880, .3, .03, .01); s.tone(300, 1300, .24, .04, 'sawtooth', .05); return true;
  // Omen: a hollow chime, two soft notes a sixth apart.
  case 'omen': s.tone(392, 388, .26, .05, 'sine'); s.tone(659, 652, .3, .035, 'sine', .07); s.impact(.03, .05, 1400); return true;
  default: return false;
 }
}
