// How kills and hits feel (feel/*.js, audio-feel.js; owner, 2026-10-01:
// "Make the kills feel amazing and do that for FFA too ... then do all the
// feel and feedback things"). Presentation only: nothing here touches the
// rules, and online nothing here touches the simulation's clock.
export const FEEL = Object.freeze({
 // Hit markers (feel/hit-tiers.js): one per target per frame, the frame's
 // damage on it summed (a Ballast shell's pellets are one marker). Tiers as
 // a share of the target's full health: under `tick` a graze (a small tick),
 // from `big` a big hit; a kill is the red X, a one-shot its own marker.
 marker: Object.freeze({ tick: .05, big: .2, life: .26, killLife: .5, oneShotLife: .75, pool: 6 }),
 // A kill (players and robots): a tiny freeze of the visuals (`hitstop` s;
 // the one-shot's a little longer), a small screen kick (m, the camera's
 // focus pushed toward the kill; less on phones) and the sharp kill sound.
 kill: Object.freeze({ hitstop: .04, oneShotStop: .06, kick: .2, oneShotKick: .3, touchKick: .5 }),
 // The visuals while frozen (not 0: effects keep a sliver of motion so a
 // frame never reads as a hitch).
 frozen: .04,
 // The round's (or match's) last kill: a short slow motion, real seconds.
 // Visual only online (effects and death reactions slowed; the server's
 // clock never changes); solo the simulation runs slower too. `scale` the
 // slowest, held for `hold` of it, then eased back to full speed. A kill
 // counts as the last one when the round ends within `window` s of it.
 slowmo: Object.freeze({ time: .55, scale: .28, hold: .45, window: .75 }),
 // Streak callouts (streaks.js) and shutdowns: the banner's time on screen.
 banner: Object.freeze({ life: 1.9, shutdownLife: 2.1 }),
 // Low health: under `below` of full health the screen's edge pulses with a
 // heartbeat, faster the lower (`slowBeat` s apart at the threshold, `fastBeat`
 // near empty). Strong for `hold` s after going low (or being hit again),
 // then easing over `ease` s down to `rest` of it, so it never nags.
 lowHealth: Object.freeze({ below: .3, slowBeat: .95, fastBeat: .52, hold: 3, ease: 4, rest: .38, volume: .9 }),
});
