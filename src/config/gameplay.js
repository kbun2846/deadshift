// Every gameplay number worth tuning, in one place: movement, each weapon's
// damage, timing and knockback, and aim assist. The rule and weapon modules
// import from here and re-export under their old names, so older imports keep
// working. Change balance here, not inside the logic.
//
// Units: metres, seconds, radians and damage points.
//
// Balance pass (owner, 2026-09-30): every weapon's numbers retuned for
// faster, more decisive fights at 100 health (targets, old -> new values and
// measurements: BALANCE_PASS.md; tools/balance-sheet.mjs, tools/duel-matrix.mjs).
//
// Health and damage (owner, 2026-09-29: "scale all damage taken and given
// down to 100 health per player. Adjust every single weapons attacks and stuff
// to this new number proportionally so it's just the numbers that change"):
// a player has 100 health (500 before) and every damage, heal, drain, health
// pool and health threshold is a fifth of what it was, so every fight plays
// exactly as before. What used to round to a whole point now rounds to a fifth
// of one (`hpRound`, `HP_STEP`); a roll of ±n in those steps is `hpRoll`.
export const HP_STEP = .2;
// (x * 5 rather than x / .2, and a hair over, so a value that was exactly
// n.5 points at 500 health still rounds up despite floating-point error.)
export const hpRound = x => Math.round(x * 5 + 1e-7) / 5;
// `base` ± `spread`, in steps of HP_STEP (every step equally likely).
export const hpRoll = (base, spread, random = Math.random) => { const n = Math.round(spread * 5); return base - spread + Math.floor(random() * (n * 2 + 1)) / 5; };

// ---- Player movement, Static (orbs, lightning stream, hex) ----
// A launched orb's speed (owner, v0.9b): leaves at `start` m/s, so the throw
// reads, then ramps (time constant `ramp` s) to `top` and lands fast. Before:
// 18 up to 38 m/s.
export const ORB_LAUNCH = Object.freeze({ start: 7, top: 64, ramp: .11 });
export const HEX_BASE_PULSE=30,HEX_BASE_ZAP=4;
// The hex's zaps (its spinning edges) hit 3 harder (15 at 500 health), on top of the boost (owner, v0.83).
export const HEX_ZAP_BONUS=3;
export const HEX_DAMAGE_MULTIPLIER=1.14*1.4;
// (Rounded to a hundredth of a point at 500 health: a five-hundredth now.)
export const boostedHexDamage=damage=>Math.round(damage*HEX_DAMAGE_MULTIPLIER*500)/500;
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
  sprayWarmup: .2, sprayAmmoTime: .25 / 1.2, sprayRange: 8, sprayFalloff: .15, sprayInnerAngle: Math.PI * 8 / 180, sprayOuterAngle: Math.PI * 22 / 180,
  // (v0.9b, owner: the stream 8% lighter: 196 / 77 before, at 500 health;
  // balance pass 2026-09-30: back to full, and `sprayFalloff` (the share lost
  // by the far end of its reach; .25 before, then written in simulation.js)
  // .15, so a full orb bar kills at the stream's whole 8 m.)
  sprayInnerDPS: 39.2, sprayOuterDPS: 15.4, sprayTurnRate: Math.PI * .65, sprayRecoil: 2.8,
  sprayRampTime: 1.5, sprayMaxMultiplier: 1.5,
  // Placed orbs drift out faster (owner, v0.9b; .72 before).
  maxSeeds: 12, seedInterval: .145, seedLife: 9, driftSpeed: 1.5,
  orbRadius: .15,
  // Hex size (owner, 2026-09-30: "make the final size of the static x ability
  // a bit smaller of a hexagon"): hexRange 12 -> 10 (the full size, corner
  // distance, about 17% smaller) and hexSpeed 3.6 -> 3.0, so it still takes
  // hexRange / hexSpeed = 3.33 s to spread. `hexBody`: how far outside the
  // hex's circle an enemy body is held (its centre; the push and the walk
  // agree on it, Simulation.pushHexVictims / keepOutOfHexes).
  hexCost: 10, hexFormationTime: .55, hexSpeed: 3, hexRange: 10, hexBody: .66, hexPulseRadius: 1.65, hexReach: 2.3, hexPulseDamage: boostedHexDamage(HEX_BASE_PULSE), hexEdgeDamage: boostedHexDamage(HEX_BASE_ZAP)+HEX_ZAP_BONUS, hexSpinDuration: 1, hexCooldown: 30,
  // Owner (v0.9b): a hex not pulsed holds at its full size, still turning, this long before it fades (X still pulses it).
  hexLinger: 1.6,
  launchSpeed: 31, launchLife: 1.8, launchOvershoot: .2, interceptCorridor: .5, interceptReach: 1.5, playerHealth: 100, targetHealth: 50, dummyHealth: 60, targetRespawn: 4.5,
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
export const ORB_VOLLEY_TOTALS=Object.freeze([0,1.856,4.176,6.96,18,25,33,41,49,57,65,72.6,80].map(d=>d*(345/400)*VOLLEY_BOOST));
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

// Omen: deliberate diamonds, one E curse and a three-projectile X covenant.
// Balance pass 2026-09-30: diamonds 7.2 -> 9.4 (min 4.5 -> 4.7, full to 13 m), reload
// 1.8 -> 1.35, spread .025 -> .045 (11 hits, ~6.3 s alone); the curse is
// still the payoff but lighter: prime 9.9 -> 12, ticks 2.16 -> 1.8,
// rupture 27/34.2 -> 20/28 (cap 39.6 -> 32: the last-second rupture stays
// the skill moment), covenant diamonds 9 -> 6.
export const OMEN = Object.freeze({
 damage:9.4, minDamage:4.7, interval:.42, magazine:4, reload:1.35, speed:30,
 fullRange:13, falloff:22, range:26, spread:.045,
 muzzle:.88, lateral:.27, radius:.085,
 primeDamage:12, primeWindow:5, primeCooldown:10, curseDuration:3.5, tick:.5, tickDamage:1.8, curseTickVariance:.36, curseRollStep:.18,
 curseBeat:1,
 blastDamage:20, lateDamage:28, curseBlastVariance:2.7, lateWindow:1, blastRadius:2.5, splash:13.5, splashEdge:3.6, blastCap:32,
 volleyDamage:6, volleyCount:3, volleySpeed:20, volleyTurn:1.8, volleyLife:1.5,
 volleyDuration:4, volleyCooldown:40, volleyRange:24,
});

// ---- Nominal (rifle) ----
// Baseline conventional weapon: metres, seconds, damage per bullet.
// Balance pass 2026-09-30: 6.8 a bullet (4.8 by 22 m; 4.4 / 3.2 before), one
// every .2 s (.165): 15 hits, ~2.9 s up close, ~4 s at 22 m; a 20-round
// magazine holds 136 (a kill and a third). Aimed-in cone .054 -> .06, hip
// .105 -> .12. (RIFLE.maxStamina 3 was never read and is gone: Nominal has
// RULES.maxStamina, one dodge.)
export const RIFLE=Object.freeze({interval:.2,magazine:20,reload:1.95,damage:6.8,minDamage:4.8,effectiveRange:10,falloffEnd:22,maxRange:55,magazineLife:30,bulletSpeed:90,aimMoveMultiplier:.55,stationaryStamina:1.3,
 // Shot spread in radians: from the hip, aimed in, and how much running at full speed widens either.
 hipSpread:.12,aimSpread:.06,movingSpread:.7,
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
// before so a mid-range hit still counts (~30 there, ~60 up close). `recoil`
// is the launch every shot gives. Shift / RMB aims in (a tighter cone).
// shellDamage 57.4 (287 at 500 health; owner, v0.9b: 300 before, a touch lighter).
// Balance pass 2026-09-30: shellDamage 67, cone .30 -> .17 (aimed .18 ->
// .15), full power for `full` .55 of the red (.25), `edge` .65 left at its
// end (.2; `end` .14 unchanged; all three were written in shotgun.js), reload
// 2.5 -> 2.2: a hip shell at 5 m ~41 (~14 before), 6-8 m a real fight.
// v140 (owner): `range` is the red part of the cone (full power up close,
// still decent at its edge); past it pellets fly `fade` metres more, weaker
// and weaker to nothing, drawn as the red fading out.
export const SHOTGUN=Object.freeze({shells:2,pellets:12,shellDamage:67,firstShellBonus:3,reload:2.2,dodges:2,range:6.8,fade:4,full:.55,edge:.65,end:.14,aimClose:1.08,spread:.17,aimSpread:.15,doubleDelay:.05,doubleRecoilLead:.12,doubleRecoilScale:1.3,interval:.26,
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
 bigDamage:8,childDamage:2.8,burstDamage:3.6,burstEdge:.3,burstRadius:1.4,max:92,recoil:2.4});
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
// tighter while it runs (`spread`). Balance pass 2026-09-30: 4 s (5) and
// .85 damage taken (.697): with 6.8 bullets it still kills in ~1.5 s.
export const SURGE=Object.freeze({charge:2,duration:4,cooldown:50,damage:2,taken:.85,speed:1.1*1.15,spread:.6,breakRadius:3.2});
// bonus: added to every grenade hit (v0.83: +10, +50 at 500 health); surgeBonus:
// instead, for one thrown during Nominal's Surge (+20). Balance pass
// 2026-09-30: damage 48 -> 32 (a core hit 42), so grenade + fire is ~1.7 s.
export const GRENADE=Object.freeze({range:12,fuse:1.4,windup:.18,cooldown:25,radius:4,coreRadius:.7,damage:32,edgeDamage:7,bonus:10,surgeBonus:20});

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
export const TUTORIAL_TARGET_HEALTH = Object.freeze({ target: 20, dummy: 15 });

// Sightline: the rifle and its modest semi-automatic sidearm share E/X.
// Balance pass 2026-09-30: the stance rifle rolls 100-104 (98.6-101: a
// coin flip), a sure kill from full health, paid for with a 4.8 s reload
// (4.2, the Breach load too); Breach blast 60 -> 56 (158 direct, was ~160).
// The sidearm 7.4 +/- .4 (5), 14 rounds (10), one every .3 s (.28): 14 hits,
// ~4 s, about a quarter slower than the Sidekick.
export const SIGHTLINE=Object.freeze({dodges:2,dashRechargeScale:.95,pistolMagazine:14,pistolDamage:7.4,pistolDamageRoll:.4,pistolReload:2,pistolInterval:.3,pistolRange:22,pistolSpeed:65,reload:4.8,damageMin:100,damageMax:104,commit:.16,speed:114,hipSpread:.26,turnRate:.35,turnAcceleration:1.1,pistolTurnRate:3.6,setupDuration:4/3,standDuration:.42,drawDuration:.28,cone:45,scopeScale:1.46,scopeLeadShare:.76,scopeElevationRate:.006,scopeElevationMax:.06,muzzleForward:1.73,muzzleLateral:.4,roundHeight:1.28,muzzleRadius:1.5,muzzleDamage:16,hearingScale:1.5,xCooldown:50,blastRadius:4.5,blastCore:1.3,blastDamage:56,blastEdge:8});

// Bot room fights use short bursts and deliberate pauses; probing never tracks a hidden body.
export const BOT_INTERIOR=Object.freeze({memory:10,wait:3.2,waitJitter:2.4,burst:.32,pause:.85,pauseJitter:.55,probeBurst:.16,probePause:2.5,probeJitter:1.8});
export const BOT_SIGHTLINE=Object.freeze({sidekickRange:8,travel:6,travelJitter:4,scan:7,scanJitter:3,lostWait:2.4,reposition:1.6,scanTurn:.24,dwell:.45,settle:.18,settleSkill:.3});

// Noticing a laser takes time; each chosen escape lasts long enough to read.
export const BOT_LASER=Object.freeze({width:.7,hotWidth:1.05,reactionMin:.18,reactionMax:.65,notice:.12,linger:.65,step:2.8,chargeRange:20,hold:1.6,holdJitter:.8,dodgeGap:1.8});

// Standalone Sidekick. Sightline's backup keeps its own, lighter tuning.
// Balance pass 2026-09-30: 8.6 +/- .4 a shot (6), 12 rounds (10): 12 hits,
// ~3.2 s; mines 30 +/- 6 (40) refill in 25 s (30); Rush 6 s (8) at 1.6x (1.75).
export const SIDEKICK=Object.freeze({magazine:12,damage:8.6,damageRoll:.4,reload:2,interval:.28,range:22,speed:65,
 mineLimit:2,mineDamage:30,mineRoll:6,mineRadius:3.6,mineCore:.9,mineTrigger:.7,mineArm:1,mineCooldown:25,
 duration:6,summon:.55,fireRate:1.6,moveSpeed:1.2,xCooldown:45});

// Ichor: rapid contact-timed katana swings and twelve committed Frenzy cuts.
// Balance pass 2026-09-30: Frenzy 36-108 -> 78-216 by blood (a strike, 6.5-18,
// beats a slash, 6-17, and lands every .2 s, not .24: ~30% more damage a
// second than slashing; full blood kills on strike 6, ~1.07 s; kills alone
// from half blood, ~1.67 s), blood
// slash 14 -> 18 +/- 2 at .4 of it in health (.5: still ~7), guard 10 -> 16
// (bullets hit ~1.5x harder).
export const ICHOR=Object.freeze({damage:6,maxDamage:17,interval:.24,contact:.067,range:2.15,arc:2.9,meterMax:100,gain:7.5,gainRoll:1,waveGain:13,waveGainRoll:1.5,decayDelay:7,decay:3,bleedDuration:8,trailSpeed:1.20,trailLife:18,trailCap:160,dodges:2,dashRechargeScale:1.12,eCooldown:6,eBlood:50,waveDamage:18,waveRoll:2,waveCost:.4,waveSpeed:19,waveRange:17,xCooldown:50,hits:12,frenzyInterval:.20,frenzyDamage:78,frenzyMax:216,healthDrain:16/2.4,splash:.22,dashGrace:.24,dashDamage:1.15,dashReach:.3,frenzyMove:1.3,fullMove:1.05,fullRecharge:1.2,attackMove:.88,regenThreshold:90,regen:1.2,parryStart:.04,parryEnd:.095,parryRecovery:.28,parryFacing:.55,guardCooldown:20,guardCapacity:16,guardRoll:2,guardMove:.9,chainWindow:.85,chainStep:.07,chainMax:.21,shortArc:1.85,midArc:2.3});

// Sheath: a white broadsword carried in a black sheath at the hip (owner's
// brief, 2026-09-28). Heavier than Ichor: one slower, wider swing at a time.
// Main slashes: `damage` ± `damageRoll` (15-17, 7 hits for 100 health;
// balance pass 2026-09-30: 12-14 and 8-9 hits before).
// A swing every `interval` s (1.9x Ichor's .24): `windup` before the blade
// meets anyone, then a `hitWindow` in which everyone inside that swing's arc
// is cut once; the rest is recovery. The first swing out of the sheath is a
// draw-slash, a little later to land (`drawWindup`). Time to kill ~2.9 s of
// pure slashing (Nominal ~2.9 s, Ichor ~2.2 s at no blood and faster as it fills).
// Walking (owner, 2026-09-28): `outMove` with the sword out, `sheathedMove`
// with it sheathed; a swing is `attackMove` (the slower of the two, not both).
// Gold Rush draws the sword and keeps it out; while it runs the blade's gold
// extension multiplies every slash's reach by `rushReach`, and walking with
// the sword out is not slowed.
// A draw-slash made while moving takes `drawMoveSlow` times as long (its
// wind-up and whole swing stretched alike, so the pose still meets the hit).
// `arcs`, `reaches`: per swing (sheath.js SHEATH_SWINGS order); wider and a
// little longer than Ichor's 2.15 m. E Gold Rush: `rushDuration` s at
// `rushSpeed`, `eCooldown` (balance pass 2026-09-30: 1.45x every 10 s;
// 1.35x every 12 s before). X Draw-cut (rev. 2, owner 2026-09-28): a hop
// back `xBackDist` m over `xBack` s, a set of `xTell` s with the line shown
// (the tell: long enough to see and step off), then a dash at `xDashSpeed`
// m/s along the way you faced as you pressed it. The line is `xRange` m from
// where the hop ends (stops at the first solid wall); everyone within `xWidth`
// of it that the blade reaches (`xLead` m ahead of the body) is cut once for
// `xDamage` ± `xRoll`. The body lands `xShort` m short of the line's end, then
// the strike (`xStrike` s, rooted) and a flourish back into the sheath
// (`xFlourish` s, walking at `xFlourishMove`). Contact comes .29 s after the
// press at the earliest, ~.43 s at the far end. Blade blood: each hit
// on a person (never a robot) adds `bloodPerHit` of a full blade.
export const SHEATH=Object.freeze({damage:16,damageRoll:1,interval:.46,windup:.1,drawWindup:.14,hitWindow:.08,
 range:2.45,arcs:[2.1,2.0,1.9,1.95,1.35,2.35,2.0],reaches:[0,0,0,0,.3,.1,0],attackMove:.85,outMove:.88,sheathedMove:1.02,drawMoveSlow:1.25,
 dodges:2,dashRechargeScale:1.12,sheatheDelay:1.5,bloodPerHit:1/8,
 rushDuration:3,rushSpeed:1.45,eCooldown:10,
 xRange:7.5,xWidth:.75,xDamage:60,xRoll:2,xBack:.12,xBackDist:1.5,xTell:.17,xDashSpeed:52,xLead:.6,xStrike:.3,xFlourish:.5,xFlourishMove:.6,xShort:.55,xCooldown:35,rushReach:2});
