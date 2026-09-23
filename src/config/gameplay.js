// Every gameplay number worth tuning, in one place: movement, each weapon's
// damage, timing and knockback, and aim assist. The rule and weapon modules
// import from here and re-export under their old names, so older imports keep
// working. Change balance here, not inside the logic.
//
// Units: metres, seconds, radians and damage points.

// ---- Player movement, Static (orbs, lightning stream, hex) ----
export const HEX_BASE_PULSE=150,HEX_BASE_ZAP=20;
export const HEX_DAMAGE_MULTIPLIER=1.14*1.4;
export const boostedHexDamage=damage=>Math.round(damage*HEX_DAMAGE_MULTIPLIER*100)/100;
export const RULES = Object.freeze({
  step: 1 / 60, speed: 7.2, acceleration: 10, braking: 14, radius: .38,
  // Keyboard and touch-walk turning: how fast it closes on the new direction,
  // its top turn speed (rad/s) and how quickly it spins up to it. Lower is
  // heavier; heavy is what makes the in-between angles reachable with taps.
  keyboardAimResponse: 5.5, keyboardAimMaxTurn: 5.5, keyboardAimSpinUp: 12,
  dodgeDistance: 3.2, dodgeDuration: .24, maxStamina: 2, dodgeStaminaCost: 1, staminaDelay: .6, staminaRecharge: 1.6, dodgeHitRadius: .18, dodgeDamageMultiplier: .5,
  sprayWarmup: .2, sprayAmmoTime: .25, sprayRange: 8, sprayInnerAngle: Math.PI * 8 / 180, sprayOuterAngle: Math.PI * 22 / 180,
  sprayInnerDPS: 196, sprayOuterDPS: 77, sprayTurnRate: Math.PI * .65, sprayRecoil: 2.8,
  sprayRampTime: 1.5, sprayMaxMultiplier: 1.5,
  maxSeeds: 12, seedInterval: .145, seedLife: 9, driftSpeed: .72,
  orbRadius: .15,
  hexCost: 10, hexFormationTime: .55, hexSpeed: 2.4, hexRange: 12, hexPulseRadius: 1.65, hexReach: 2.3, hexPulseDamage: boostedHexDamage(HEX_BASE_PULSE), hexEdgeDamage: boostedHexDamage(HEX_BASE_ZAP), hexSpinDuration: 1, hexCooldown: 30,
  launchSpeed: 31, launchLife: 1.8, launchOvershoot: .55, interceptCorridor: 1.1, playerHealth: 500, targetHealth: 100, dummyHealth: 75, targetRespawn: 4.5,
  rechargeDelay: .8, rechargeInterval: .65, stationaryRecharge: 1.25 * 1.18, focusDistance: 7,
});

// Larger volleys trade a long refill for a higher damage return per orb.
export const ORB_DAMAGE_MULTIPLIER = 1.16*(345/400);
export const ORB_VOLLEY_TOTALS=Object.freeze([0,9.28,20.88,34.8,90,125,165,205,245,285,325,363,400].map(d=>d*(345/400)));
// Splash shape, kept separate from the blast's total so the volley budget the
// damage curve is built on stays exactly where it was. `edge` is the fraction
// still landing at the rim, and `heavyCore` is the extra a large volley adds at
// the centre — a heavy shot should feel heavier where it actually lands.
export const SPLASH = Object.freeze({ edge: .28, heavyCore: .06, heavyFrom: 4, heavyFull: 12 });

// ---- Nominal (rifle) ----
// Baseline conventional weapon: metres, seconds, damage per bullet.
export const RIFLE=Object.freeze({interval:.18,magazine:18,extendedMagazine:36,extendedCooldown:60,reload:1.8,damage:20,minDamage:14,effectiveRange:10,falloffEnd:22,maxRange:55,magazineLife:30,bulletSpeed:90,aimMoveMultiplier:.55,maxStamina:3,stationaryStamina:1.3,
 // Shot spread in radians: from the hip, aimed in, and how much running at full speed widens either.
 hipSpread:.105,aimSpread:.054,movingSpread:.7});
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
export const SHOTGUN=Object.freeze({shells:2,pellets:12,chargeTime:2,holdTime:15,reload:2.8,range:7.5,chargedRange:9,spread:.30,aimSpread:.18,doubleDelay:.05,doubleRecoilLead:.12,doubleRecoilScale:1.3,interval:.26,
 recoilBase:4.2,recoilCharge:1.4,recoilPeak:2,launchScale:8});
// A burst from one attacker that removes this share of max health inside this
// window is a Ballast "headless" kill (see AGENTS.md).
export const BALLAST_FATAL_WINDOW=.45;
export const BALLAST_FATAL_FRACTION=.85;

// ---- Grenade (Nominal's E) ----
export const GRENADE=Object.freeze({range:12,fuse:1.4,windup:.18,cooldown:25,radius:4,coreRadius:.7,damage:240,edgeDamage:35});

// ---- Aim assist for direction-only aim (see auto-range.js) ----
export const AUTO_RANGE = Object.freeze({
 min: 1.2, max: 14,
 halfAngle: { keyboard: 12 * Math.PI / 180, touch: 15 * Math.PI / 180 },
 lateral: .8, keep: 1.35, settle: .35, playerBonus: .6,
});
