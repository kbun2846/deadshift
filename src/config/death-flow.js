// What happens between a death and the next life, and the match summary
// (owner, 2026-10-02: "Do the killcam. Make it show a health bar on the
// player's avatar and the killer. It should be brief after zooming into the
// dead player. It should not add much time to respawn time if applicable. It
// should make the death screen pop up after the kill cam is done."; "Show the
// respawn countdown, sure. Allow for weapon swaps at each respawn."; and the
// match summary that celebrates you, "Do 4"). Presentation only: nothing
// here changes a rule or a respawn wait.

// The killcam (killcam.js, ui/killcam-hud.js). Seconds, real time.
//  zoom     the zoom onto your body when a killcam follows it (the plain death
//           shot's DEATH_ZOOM, 2.2 s, sped up so the whole thing stays brief)
//  follow   the most time on the killer after that
//  least    a killcam shorter than this is not worth the cut: none
//  decide   how long the screen waits to learn who killed you (online the
//           kill feed line comes with the death or a snapshot later); no
//           killer by then, no killcam (the plain death shot as before)
//  blendIn  the camera's ease from the plain zoom into the killcam's own
//  toKiller the glide from your body to the killer
//  back     the glide back to your body as the death card comes in
//  minCard  the death card is up at least this long before a timed respawn:
//           the killcam is cut shorter (or left out) to keep it, so it never
//           adds to the wait
//  skipAfter a press sooner than this after dying does not skip (the trigger
//           finger was already down)
//  drain    your bar runs from its last health to empty over this, after
//           `drainDelay`
//  both     metres: a killer this close to your body is framed with it
//  span     how much of the screen's height the pair may take (both framed)
export const KILLCAM = Object.freeze({
 zoom: 1.2, follow: 1.6, least: .6, decide: .25, blendIn: .3, toKiller: .42, back: .45,
 minCard: 2.2, skipAfter: .3, drain: .6, drainDelay: .3, both: 16, span: .62,
});

// The death card's weapon row: the respawn ticks with a small pop each second.
export const NEXT_LIFE = Object.freeze({ tick: .32 });

// The match summary (match-summary.js, ui/summary-card.js).
//  window   seconds a hit may come after the attack it answers (accuracy:
//           a grenade's fuse and Sightline's flight fit inside it)
//  sampleEvery  seconds between looks at the score (a comeback)
//  highlight    the least it takes for each highlight to be picked
export const SUMMARY = Object.freeze({
 window: 2, sampleEvery: .5,
 highlight: Object.freeze({ oneShots: 1, streak: 3, longLife: 60, accuracy: .55, accuracyAttacks: 12, comeback: 2, ffaComeback: 3 }),
});
