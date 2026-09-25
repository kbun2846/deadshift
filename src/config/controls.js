// Touch-control feel, in one place. Gameplay numbers are in gameplay.js; the
// weighted turning for keys and walking lives there too (RULES.keyboardAim*),
// because the simulation applies it.

// A touch that moves less than `slop` pixels and lifts within `time` seconds
// is a tap (it fires); anything else is a drag (it walks or aims, never fires).
export const TOUCH_TAP = Object.freeze({ slop: 8, time: .28 });

// The floating move stick. travel: how far the knob pulls, as a share of the
// stick's width (full speed at the rim). dead: the share of that pull that
// does nothing. curve: >1 makes small pulls creep and full pulls run.
// smoothing: seconds for a change of direction to ease in.
export const MOVE_STICK = Object.freeze({ travel: .4, dead: .16, curve: 1.45, smoothing: .055 });

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
