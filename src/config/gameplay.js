// Every gameplay number worth tuning, in one place: movement, each weapon's
// damage, timing and knockback, and aim assist. The rule and weapon modules
// import from here and re-export under their old names, so older imports keep
// working. Change balance here, not inside the logic.
//
// Units: metres, seconds, radians and damage points.

// ---- Player movement, Static (orbs, lightning stream, hex) ----
// A launched orb's speed (owner, v0.9b): leaves at `start` m/s, so the throw
// reads, then ramps (time constant `ramp` s) to `top` and lands fast. Before:
// 18 up to 38 m/s.
export const ORB_LAUNCH = Object.freeze({ start: 7, top: 64, ramp: .11 });
export const HEX_BASE_PULSE=150,HEX_BASE_ZAP=20;
// The hex's zaps (its spinning edges) hit 15 harder, on top of the boost (owner, v0.83).
export const HEX_ZAP_BONUS=15;
export const HEX_DAMAGE_MULTIPLIER=1.14*1.4;
export const boostedHexDamage=damage=>Math.round(damage*HEX_DAMAGE_MULTIPLIER*100)/100;
export const RULES = Object.freeze({
  step: 1 / 60, speed: 7.2, acceleration: 10, braking: 14, radius: .38,
  // Keyboard and touch-walk turning: how fast it closes on the new direction,
  // its top turn speed (rad/s) and how quickly it spins up to it. Lower is
  // heavier. A quarter turn takes about a quarter second and a half turn about
  // 0.4 s: quick, with just enough weight that a short tap still stops between
  // the eight directions.
  keyboardAimResponse: 9, keyboardAimMaxTurn: 10, keyboardAimSpinUp: 24,
  // A dodge pressed up to this long before it is possible still happens (input buffer, s).
  dodgeBuffer: .15,
  dodgeDistance: 3.5, dodgeDuration: .24, maxStamina: 1, dodgeStaminaCost: 1, staminaDelay: .6, staminaRecharge: 1.6, dodgeHitRadius: .18, dodgeDamageMultiplier: .5,
  // sprayAmmoTime: seconds of stream per orb (owner, v0.9b: used 20% faster, .25 before).
  sprayWarmup: .2, sprayAmmoTime: .25 / 1.2, sprayRange: 8, sprayInnerAngle: Math.PI * 8 / 180, sprayOuterAngle: Math.PI * 22 / 180,
  // (v0.9b, owner: the stream 8% lighter: 196 / 77 before.)
  sprayInnerDPS: 196 * .92, sprayOuterDPS: 77 * .92, sprayTurnRate: Math.PI * .65, sprayRecoil: 2.8,
  sprayRampTime: 1.5, sprayMaxMultiplier: 1.5,
  // Placed orbs drift out faster (owner, v0.9b; .72 before).
  maxSeeds: 12, seedInterval: .145, seedLife: 9, driftSpeed: 1.5,
  orbRadius: .15,
  hexCost: 10, hexFormationTime: .55, hexSpeed: 3.6, hexRange: 12, hexPulseRadius: 1.65, hexReach: 2.3, hexPulseDamage: boostedHexDamage(HEX_BASE_PULSE), hexEdgeDamage: boostedHexDamage(HEX_BASE_ZAP)+HEX_ZAP_BONUS, hexSpinDuration: 1, hexCooldown: 30,
  // Owner (v0.9b): a hex not pulsed holds at its full size, still turning, this long before it fades (X still pulses it).
  hexLinger: 1.6,
  launchSpeed: 31, launchLife: 1.8, launchOvershoot: .2, interceptCorridor: .5, interceptReach: 1.5, playerHealth: 500, targetHealth: 250, dummyHealth: 300, targetRespawn: 4.5,
  rechargeDelay: .8, rechargeInterval: .65, stationaryRecharge: 1.25 * 1.18, focusDistance: 7,
});

// ---- Hills (the "2.5D" ground, world/heightfield.js) ----
// Sight over the ground is symmetric. A line from one body's eye (`eye` m
// above its ground) to the other's body (`body` m) is cut only by ground that
// rises `crest` m or more above it, and either way round will do. Walking is
// up to `uphill` slower straight up a `fullGrade` (30%) slope and up to
// `downhill` faster straight down one; dodges, knockback and launches are not
// changed by slopes. Orbs float `orbHeight` above the ground and stop against a
// rise steeper than `orbRise` (m of rise per m of travel). Rounds (rifle,
// pellets, Scatter's shells, Static's spray) fly `roundHeight` over a line
// that follows the ground, climbing and dropping at most `roundClimb` per
// metre, and end where the ground rises into them (owner, 2026-09-26: they
// stay over the ground wherever the height changes gently); one hits a body
// it passes between the body's feet and `bodyTop` above them.
export const TERRAIN = Object.freeze({ eye: 1.35, body: .9, crest: .5, uphill: .07, downhill: .04, fullGrade: .3, orbHeight: .72, orbRise: .8, roundHeight: .74, roundClimb: 1, bodyTop: 1.9 });
// Wading a stream (hills maps; owner, 2026-09-26): water `depth` deep or more
// slows walking by `slow`; the current makes it up to `current` quicker going
// with it and as much slower going against it (across: just the slowing), all
// in proportion to the depth; a dodge in water goes `dodge` shorter and
// stamina refills `recharge` slower. `step`: a body walks onto a deck (a
// bridge, a log) only from ground within this of its top; from lower it wades
// in underneath.
// `under`: under a deck, a body goes no further toward either end than where
// the ground comes within `under` m of its top (the bridge's abutments; owner,
// stage 5 review: you walked straight up out of the stream through its end).
export const WADE = Object.freeze({ depth: .5, slow: .22, current: .3, dodge: .35, recharge: .45, step: .45, under: .7 });

// Static's orb volleys (its main fire, 1 to 12 orbs: impacts and blast) hit
// 1.75x as hard as they used to (owner's call, v0.83); the hex and the stream
// are not part of it.
export const VOLLEY_BOOST = 1.75;
// Larger volleys trade a long refill for a higher damage return per orb.
export const ORB_DAMAGE_MULTIPLIER = 1.16*(345/400)*VOLLEY_BOOST;
export const ORB_VOLLEY_TOTALS=Object.freeze([0,9.28,20.88,34.8,90,125,165,205,245,285,325,363,400].map(d=>d*(345/400)*VOLLEY_BOOST));
// Mouse players get a very slight pull on a volley's landing point (no other aim
// help; touch and keys have aim assist): a visible target within `radius` of
// the cursor draws the point `pull` of the way onto it.
// Owner (v0.9b): very subtle, so the volley lands where the cursor is.
export const MOUSE_VOLLEY_ASSIST = Object.freeze({ radius: .6, pull: .06 });
// Splash shape, kept separate from the blast's total so the volley budget the
// damage curve is built on stays exactly where it was. `edge` is the fraction
// still landing at the rim, and `heavyCore` is the extra a large volley adds at
// the centre — a heavy shot should feel heavier where it actually lands.
export const SPLASH = Object.freeze({ edge: .28, heavyCore: .06, heavyFrom: 4, heavyFull: 12 });

// ---- Nominal (rifle) ----
// Baseline conventional weapon: metres, seconds, damage per bullet.
export const RIFLE=Object.freeze({interval:.165,magazine:28,reload:1.95,damage:22,minDamage:16,effectiveRange:10,falloffEnd:22,maxRange:55,magazineLife:30,bulletSpeed:90,aimMoveMultiplier:.55,maxStamina:3,stationaryStamina:1.3,
 // Shot spread in radians: from the hip, aimed in, and how much running at full speed widens either.
 hipSpread:.105,aimSpread:.054,movingSpread:.7,
 // Hip-fire recoil: each shot knocks the whole cone off line by up to
 // recoilKick radians at random (more once a burst builds: recoilBuild per
 // shot, up to 1), capped at recoilMax, settling back at recoilSettle per
 // second. Aiming in adds none and settles at recoilSettleAim.
 recoilKick:.011,recoilBuild:.25,recoilMax:.03,recoilSettle:5,recoilSettleAim:14});
// Where the barrel actually is: a metre out in front of the player and a
// hand's width to one side, which is why a shot fired parallel to the player's
// centreline never passes through the crosshair.
export const RIFLE_MUZZLE=Object.freeze({forward:.96,lateral:.27});
// The barrel is never laid on a point closer than this. Converging on a cursor
// sitting on the player's own feet would rake the shot several degrees across
// the screen; holding the floor here keeps the worst tilt inside a couple of
// degrees, which is centimetres at the ranges where it could miss.
export const RIFLE_CONVERGE=8;

// ---- Ballast (charge shotgun) ----
// recoilBase/Charge/Peak shape how hard a shot kicks by charge (0..1);
// launchScale turns that kick into the backward launch speed.
// Ballast (v0.83, owner): no charging. Every shot is the same: the old
// uncharged reach (`range`), `shellDamage` per shell if every pellet lands
// point blank (+`firstShellBonus` on the first), falling off more gently than
// before so a mid-range hit still counts (~150 there, ~300 up close). `recoil`
// is the launch every shot gives. Shift / RMB aims in (a tighter cone).
// shellDamage 287 (owner, v0.9b: 300 before, a touch lighter).
// v140 (owner): `range` is the red part of the cone (full power up close,
// still decent at its edge); past it pellets fly `fade` metres more, weaker
// and weaker to nothing, drawn as the red fading out.
export const SHOTGUN=Object.freeze({shells:2,pellets:12,shellDamage:287,firstShellBonus:15,reload:2.5,dodges:2,range:6.8,fade:4,aimClose:1.08,spread:.30,aimSpread:.18,doubleDelay:.05,doubleRecoilLead:.12,doubleRecoilScale:1.3,interval:.26,
 recoil:5.4,launchScale:8,look:.6});
// Ballast's X, Scatter (weapons/scatter.js): press X to ready it (the cone
// turns red), X again to fire `shells` big red shells across a wide cone
// (`spread` each side). Each flies `splitAt` metres (or until it hits
// something), then splits into `split` smaller shells that fan out
// (`childSpread`) and fly on to `reach` in all, each ending in a small
// explosion (`burstRadius`, full `burstDamage` at the centre down to
// `burstEdge` of it at the rim; they stack). A big shell hit does
// `bigDamage`, a small one `childDamage`. One target takes at most `max`
// from one Scatter. `cooldown` from when it fires.
export const SCATTER=Object.freeze({cooldown:40,prime:3,shells:5,split:4,spread:.55,speed:24,splitAt:5.5,reach:11,childSpread:.34,childNear:.45,childFar:1.4,childSpeed:30,
 bigDamage:40,childDamage:14,burstDamage:18,burstEdge:.3,burstRadius:1.4,max:460,recoil:2.4});
// A burst from one attacker that removes this share of max health inside this
// window is a Ballast "headless" kill (see AGENTS.md).
export const BALLAST_FATAL_WINDOW=.45;
export const BALLAST_FATAL_FRACTION=.85;

// ---- Grenade (Nominal's E) ----
// Nominal's Surge (X; weapons/surge.js): `charge` seconds of power-up, then
// `duration` seconds of 2x bullets that use no ammo, 85% damage taken and
// 1.1x speed; `cooldown` after it ends; breakables within `breakRadius` break
// as the beams arrive.
// v0.9b (owner): 15% faster than before (1.1 → 1.265), another 18% less
// damage taken (.85 → .697), and the cone (hip and aimed, and the recoil kick)
// tighter while it runs (`spread`).
export const SURGE=Object.freeze({charge:2,duration:5,cooldown:50,damage:2,taken:.85*.82,speed:1.1*1.15,spread:.6,breakRadius:3.2});
// bonus: added to every grenade hit (v0.83: +50); surgeBonus: instead, for one
// thrown during Nominal's Surge (+100).
export const GRENADE=Object.freeze({range:12,fuse:1.4,windup:.18,cooldown:25,radius:4,coreRadius:.7,damage:240,edgeDamage:35,bonus:50,surgeBonus:100});

// ---- Aim assist for direction-only aim (see auto-range.js) ----
export const AUTO_RANGE = Object.freeze({
 min: 1.2, max: 14,
 halfAngle: { keyboard: 12 * Math.PI / 180, touch: 18 * Math.PI / 180 },
 lateral: .8, keep: 1.35, settle: .35, playerBonus: .6,
});

// ---- Aim assist: sticking to a target (see aim-assist.js) ----
// Angles in radians, times in seconds. pull: share of the gap to the target
// the aim is bent by (1 = dead on). hold: how far the target may drift off the
// player's own aim (from movement) before the lock breaks. release: how far
// the player must turn away to let go. reacquire: how exactly they must aim
// back to grab a target they just let go of within cooldown.
const DEG = Math.PI / 180;
export const AIM_ASSIST = Object.freeze({
 touch: Object.freeze({ pull: .6, hold: 40 * DEG, release: 14 * DEG, cooldown: .5, reacquire: 4 * DEG, maxRange: 16 }),
 keyboard: Object.freeze({ pull: .3, hold: 26 * DEG, release: 9 * DEG, cooldown: .5, reacquire: 3 * DEG, maxRange: 14 }),
});

// The tutorial's targets stay lighter than practice's (RULES.targetHealth /
// dummyHealth), so a lesson's shots stay short.
export const TUTORIAL_TARGET_HEALTH = Object.freeze({ target: 100, dummy: 75 });
