// Touch-control feel, in one place. Gameplay numbers are in gameplay.js; the
// weighted turning for keys and walking lives there too (RULES.keyboardAim*),
// because the simulation applies it.

// A touch that moves less than `slop` pixels and lifts within `time` seconds
// is a tap (it fires); anything else is a drag (it walks or aims, never fires).
export const TOUCH_TAP = Object.freeze({ slop: 8, time: .28 });

// The floating move stick (touch-controls.js stickResponse). Owner,
// 2026-10-01: "it shouldn't be so sensitive where I move it a little bit and
// then the character moves like that. It should be in a way slightly weightier
// and slightly bigger, so I have more control over where the player goes and I
// have to move it a little bit more to get that. It should still be kind of
// instant and responsive, but just make it a little bit more controllable."
// size: the stick's width in px (the ring drawn under the thumb; CSS reads it
// as --stick-size). travel: how far the knob pulls, as a share of that width.
// dead: the share of the pull that does nothing (a hair past TOUCH_TAP.slop, so
// a drag starts from a standstill). full: the share of the pull where full
// speed is reached, a little short of the rim so a full push never has to be
// exact. curve: the ease-in between them (speed = t^curve, t running 0..1 from
// the dead zone's edge to `full`): small pulls creep, a full pull runs at once.
// smoothing: seconds for the walk to follow the thumb (main.js; a few frames,
// not a lag you feel).
// Before (to v0.1.7): 124 px wide, travel .4 (a 50 px pull for full speed),
// dead .16, full at the rim, curve 1.45.
export const MOVE_STICK = Object.freeze({ size: 148, travel: .42, dead: .14, full: .92, curve: 1.6, smoothing: .055 });

// The right-thumb cluster: FIRE is a quarter circle of radius `fire` in the
// corner; the other actions are segments of one ring `ring` thick, `gap` out
// from it, `segmentGap` pixels apart. Bases lift the cluster off the bottom
// edge (portrait sits above the ammo panel).
export const TOUCH_CLUSTER = Object.freeze({ fire: 138, gap: 6, ring: 76, segmentGap: 4, landscapeBase: 0, portraitBase: 98,
 // Weapons with aim-down-sights (items.js adsFire): AIM moves to the bottom
 // end of the ring and gets this much more arc than the others, and the
 // bottom slice of FIRE (adsFireDegrees of its 90) becomes AIM + FIRE.
 aimWeight: 1.4, adsFireDegrees: 26,
 // Shapes: every button's outer corners are rounded by `softRound` px, and
 // FIRE's corner (the screen's corner) by `cornerRound`, so the cluster sits
 // inside a phone's curved screen corner. The whole cluster stands `inset` px
 // off both edges, the same on each (safe-area insets only add up to
 // `insetSafeMax`, so a notch does not push it far in on one side).
 softRound: 9, cornerRound: 34, inset: 10, insetSafeMax: 16 });
// Ring order from the thumb's easiest reach outward: dodge first.
export const CLUSTER_ORDER = Object.freeze(['touch-dodge', 'touch-stream', 'touch-hex', 'touch-place', 'touch-extended', 'touch-grenade']);

// The game keys on the keyboard: Space shoots (with the left mouse button), E
// is the weapon's other action (Static places orbs, Nominal throws a grenade,
// Ballast fires both shells), Q dodges (v147; was Left Ctrl). These are the
// tokens the game reads; the player can bind other keys to them
// (keybinds.js gameCode). Everything that reads or names
// these keys (main.js, rifle-input.js, the weapon registry, the tutorials, the
// HUD) goes through here. Menus keep E to confirm and Q to go back. While playing, browser shortcuts that Ctrl would start
// (Ctrl+S, Ctrl+D, Ctrl+wheel zoom…) are blocked (main.js).
export const GAME_KEYS = Object.freeze({ shoot: 'Space', secondary: 'KeyE', dodge: 'KeyQ' });

// Target lock for players without a mouse (target-lock.js; wired in main.js).
// Owner: "lock on accurately and smoothly", "Nothing is ever locked for you",
// and (2026-10-01) "make aim with arrow keys easier and tracking desired
// target ... just make it nicer and better". Distances in metres, times in
// seconds, screen distances in CSS px.
export const TARGET_LOCK = Object.freeze({
 range: 18,        // farther targets are not locked
 margin: 24,       // px: a target this close to the screen edge is not picked up
 edgeSlack: 60,    // px past the edge: a locked target out to here is kept for `hold` (a step off the edge does not drop it)
 glide: .09,       // smooth time of the aim point's travel to a new practice target (eases in and out)
 swipe: 42,        // px of finger travel that counts as one swipe
 swipeAgain: 140,  // px more, in the same drag, for each further switch
 hold: .6,         // a locked target briefly out of sight (a post, a doorframe, the screen edge) keeps the lock
 // Picking "the one that way": candidates within `cone` of the pressed
 // direction (tan 60°), ranked by distance along it plus `acrossWeight` × the
 // distance off to the side (px). From idle the direction counts from the aim
 // dot or from you, whichever fits better (never one behind you). A player or
 // robot that way always comes before a practice target (those stand in when
 // no enemy is about). The rank is multiplied by these biases (smaller wins),
 // so among targets that way the one you most likely mean is taken:
 cone: 1.73, acrossWeight: 2,
 threatBias: .7,   // the one in the direction you were just hit from...
 threatTime: 2.5,  // ...within this long
 threatAngle: .35, // rad (about 20°) either side of the hit's bearing
 recentBias: .8,   // the one you were locked on last (flicking back and forth)
 blockedBias: 1.6, // one behind a fence or a wall's end (seen, but the lock would only drift there)
 // Two arrows pressed within `chord` of each other are one diagonal press,
 // not two (the first may have locked or let go already: it is redone as the diagonal).
 chord: .08,
 // Locked on a player or robot, an arrow with nobody that way leads them (the
 // nudge below); the same arrow tapped twice within `releaseTap` lets go.
 releaseTap: .3,
 // A target lost to cover, a building or the screen edge (not killed) is
 // remembered this long: when it shows again the lock picks it back up,
 // unless you have aimed by hand or picked another since.
 reacquire: 3,
 // After a lock ends by itself (a kill, a target lost), facing something
 // locks it only once your aim has turned this far (rad, about 8°): the aim
 // never jumps to whoever happens to stand behind the one that fell.
 facingRearm: .14,
 // Locked on a moving target, held arrows push the aim point that way at
 // nudgeSpeed m/s, at most nudgeReach metres past the target, so a player
 // leads by hand; let go, the push eases back over nudgeEase s. The arrow
 // that made a switch does not push until it is let go (a held press is not
 // a lead).
 nudgeSpeed: 7, nudgeReach: 2.5, nudgeEase: .35,
 // Moving targets: smoothing while on them, the glide on after a switch, a
 // dodge or an obstacle, the pause after a dodge before gliding back, how fast
 // the drift fades, how long behind an obstacle before letting go.
 track: .035, relockGlide: .13, relockDelay: .16, driftFade: .45, blockedLimit: 1.4,
});

// Direction-only aim with the arrow keys (the turning itself is RULES.keyboardAim*).
// walkTakeover: after the arrows are let go, walking (WASD) does not swing the
// aim round to the way you walk for this long, so strafing past a fight keeps
// the aim where the arrows left it. A player who never touches the arrows
// still aims by walking.
export const KEYBOARD_AIM = Object.freeze({ walkTakeover: 4 });
