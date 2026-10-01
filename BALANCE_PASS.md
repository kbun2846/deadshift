# Balance pass (2026-09-30, owner)

The owner asked for every weapon's numbers (damage, fire rates, reloads, magazines, DPS, cooldowns) to be rebalanced so balance is **fair and satisfying**. Numbers only: no new weapons or mechanics, no robot AI, visuals, storm, map or menu changes. Players have 100 health; damage keeps the 0.2-point steps (`hpRound` / `hpRoll`).

Everything below was measured with `node tools/balance-sheet.mjs` (analytic TTK from the live config and the weapons' own damage functions, cross-checked in the headless Simulation) and `node tools/duel-matrix.mjs` (hard robots 1V1 on Deadwater). Branch `balance-pass` from v0.1.0-alpha (4f2e6bc). Short version for AGENTS.md: "Balance pass (2026-09-30, owner)"; for players: CHANGELOG.md "unreleased (balance pass)".

## Targets and results

TTK = time to kill from full health with every shot landing (the sheet's 100% column), mean rolls.

| # | Target | Result | |
|---|---|---|---|
| 1 | Nominal 2.8-3.2 s within 10 m, <= 4.2 s at 22 m; magazine kills with ~30-50% spare; grenade+fire >= 1.6 s; Surge >= 1.4 s | 2.81-2.87 s (2-8 m), 2.92 at 12 m, 4.03 at 22 m; magazine 136 (36% spare); grenade+fire 1.67 s; Surge 1.47 s; aimed in with real spread it out-kills the Sidekick at 12 / 16 m (4.9 / 10.2 s vs 5.3 / 11.1) | pass |
| 2 | Sidekick 2.9-3.4 s within 22 m; magazine kills; Rush >= 1.7 s; Sightline sidearm ~20-30% slower | 3.09-3.40 s; magazine 103; Rush 2.58 s from the press (1.93 s once running); sidearm 3.91-4.22 s (+26% at 8 m) | pass (3.40 at 22 m is the edge; the frame-stepped sim reads ~0.2 s slower because its test input presses every other frame) |
| 3 | Omen primary <= 6.5 s; best E+X 2.4-3.4 s; stays a curse weapon; robot win rate down from 74% toward 50-60% | primary 6.28 s; E+X 3.15 s (E alone 3.67, X alone 3.25); rupture 20 rising to 28 in the last second; robots 67% (56% against the other five non-Static/Ichor weapons) | primary/combos pass; robot rate improved, not in 50-60 |
| 4 | Ballast point-blank double kills <= 3 m; hip shell at 5 m >= 40; 6-8 m a real (not great) fight; no better than Nominal at 12 m+ | double kills 100% at 2-4 m (hip and aimed, sim); hip shell at 5 m 41.0; 8 m 15.6 hip / 17.7 aimed a shell (5.5 s aimed); 12 m 2 a shell | pass |
| 5 | Sightline rifle a sure kill from full, paid for with a slightly longer reload; Breach unchanged or a little less overkill | 100-104 (always kills); reload 4.2 -> 4.8 s; Breach 159.8 -> 158 | pass |
| 6 | Sheath 2.8-3.2 s; Draw-cut + 3 slashes always kills | 2.93 s; Draw-cut + 3 = 108 (worst roll 103) | pass |
| 7 | Ichor 0 blood 2.2-2.6 s, full 1.2-1.5 s; Frenzy out-damages slashing and kills alone from mid blood; wave + 5 slashes not a near miss | 2.24 / 1.27 s; Frenzy 6.5-18 a strike every 0.2 s (32.5-90 dps) vs slashes 6-17 every 0.24 s (25-70.8 dps); full blood kills on strike 6 (1.07 s); half blood 147 (kills on strike 9, 1.67 s); wave + 5 full slashes 101-105 | pass, but see #9 |
| 8 | Static volley/hex about as they are; stream kills at its full 8 m from a full orb bar | volley/hex untouched; stream kills at 8 m in 2.43 s (it did 93.8 before) | pass |
| 9 | No combo lands at 97-99.x; E cooldowns 6-25 s, X 30-55 s | the sheet's near-miss check (every primary at every listed distance, every combo row) flags one: Frenzy started at exactly half blood leaves 98 after 8 strikes (12.25 each). Blood is continuous, so some blood level always lands at 97-99; 72-216 would put half blood at 96 but a zero-blood strike would only tie a slash. Cooldowns: E 25 / 10 / 25 / 6 / 10 s, X 50 / 40 / 40 / 50 / 45 / 50 / 35 / 30 s | pass except that one Frenzy sample |
| 10 | Robots (N=20 + close/far N=10): the six each 35-65%, no cell among them worse than 15/85, Static and Ichor no worse, Nominal <= 65% | Nominal 81, Sidekick 71, Omen 67, Sightline 59, Ballast 50, Sheath 50; worst cells 13/87 (Ballast v Nominal, Ballast v Sidekick, Sheath v Ballast); Static 13 -> 10, Ichor 14 -> 11 | partly: see below |
| 11 | Faster, more decisive, skill-decided fights | gun primaries 1.5-2x faster (Nominal 5.5 -> 2.9 s, Sidekick 6.3 -> 3.2, Omen 9.8 -> 6.3, sidearm 8.1 -> 4.0); nothing under ~2.8 s for a gun primary; realistic hit rates still stretch them to 5-8 s | pass |

### Why target 10 is only partly met
- Static and Ichor robots lose ~90% to every other weapon (Static seldom launches a volley; Ichor can't close). That alone gives each of the other six ~28 points of the 100: their average is then ~63%, so all six can only sit at or under 65% if they are nearly equal. Against each other (Static and Ichor left out) the six are 32-74% (before: 20-74%). The review's tighter Nominal aimed-in cone (.075 -> .06, so it beats the Sidekick at 8-16 m again for people) put robot Nominal back at 81% (75% with .075).
- The robot brain kites any weapon with a shorter STYLE reach (it holds 1.2 m beyond it), so the three long guns (Nominal, Sidekick, Omen) beat Ballast and Sheath mostly by walking backwards; robots also halve burst hits by dodging (`dodgeDamageMultiplier` .5). Number changes that would fix this in the robot matrix (e.g. Ballast doing real damage at 9 m) break the owner's targets for people.
- Static and Ichor: 13 -> 10 and 14 -> 11 on the default spawns (N=20; one standard error is ~2 points), close 13 -> 17 / 11 -> 6, far 16 -> 13 / 13 -> 9. The guns kill ~1.7x faster now and these two robots can't answer; buffing their stream (+8.7% and less fade), guard (10 -> 16) and Frenzy did not move the robot numbers (a trial with a faster orb refill and a 22 guard didn't either), so no bigger buffs were made that would only show for people.

## Final balance sheet (`node tools/balance-sheet.mjs`)

```
PRIMARY — damage per hit by distance (0/— = out of range), 100 hp
-----------------------------------------------------------------
weapon                      2m      5m      8m     12m     16m     22m  intvl   mag reload    burst     sust
Nominal                    6.8     6.8     6.8     6.7    6.03    5.03    0.2    20   1.95       34     23.7
Ballast                   68.5    68.5   45.95   11.18       0       0   0.26     2    2.2    263.5     55.7
Omen                       9.4     9.4     9.4     9.4    8.51    5.38   0.42     4   1.35     22.4     14.4
Sightline rifle            102     102     102     102     102     102   0.16     1    4.8     20.6     20.6
Sightline sidekick         7.4     7.4     7.4     7.4     7.4     7.4    0.3    14      2     24.7     17.6
Sidekick                   8.6     8.6     8.6     8.6     8.6     8.6   0.28    12      2     30.7     20.3
Ichor (from 0 blood)         6       0       0       0       0       0   0.24     ∞      0       25       25
Ichor (full blood)          17       0       0       0       0       0   0.24     ∞      0     70.8     70.8
Sheath                      16       0       0       0       0       0   0.46     ∞      0     34.8     34.8
Static 12-orb volley     123.8   123.8   123.8   123.8   123.8   123.8   0.14    12   8.41     72.3     14.5
Static stream (C)       38.2/s    36/s  33.8/s       0       0       0   0.21    12   8.41     57.3      9.2
(burst/sust DPS at the first intended distance; Ballast = every pellet landing; Static = 12-orb volley, reload = refill 12 moving)

PRIMARY — shots to kill / TTK at 100% hits (s)
----------------------------------------------
weapon                          2m          5m          8m         12m         16m         22m
Nominal                    15 2.81     15 2.84     15 2.87     15 2.92     17 3.36     20 4.03
Ballast                     2 0.27       2 0.3     3* 2.54     9* 9.96           —           —
Omen                      11* 6.08    11* 6.18    11* 6.28    11* 6.42    12* 6.97   19* 11.97
Sightline rifle           1-1 0.16    1-1 0.18    1-1 0.21    1-1 0.25    1-1 0.28    1-1 0.33
Sightline sidekick         14 3.91     14 3.96        14 4     14 4.07     14 4.13     14 4.22
Sidekick                   12 3.09     12 3.14     12 3.18     12 3.25     12 3.31      12 3.4
Ichor (from 0 blood)       10 2.24           —           —           —           —           —
Ichor (full blood)          6 1.27           —           —           —           —           —
Sheath                    6-7 2.93           —           —           —           —           —
Static 12-orb volley        1 1.68      1 1.71      1 1.77      1 1.85      1 1.91      1 2.01
Static stream (C)            — 2.2       — 2.3      — 2.43           —           —           —
(* = a full magazine cannot kill from full health)

PRIMARY — realistic TTK (s) [hit rate]
--------------------------------------
weapon                          2m          5m          8m         12m         16m         22m
Nominal                 5.12 [70%]  5.17 [70%]  5.21 [70%]  7.06 [55%]  7.96 [55%] 13.58 [40%]
Ballast                0.27 [100%]   2.5 [61%]  7.16 [35%] 58.99 [19%]           —           —
Omen                    12.1 [55%]  12.2 [55%] 12.32 [55%] 17.38 [40%] 19.01 [40%] 46.62 [25%]
Sightline rifle         2.33 [70%]  2.36 [70%]   2.4 [70%]  4.34 [55%]  4.23 [55%]  7.82 [40%]
Sightline sidekick      7.42 [70%]  7.49 [70%]  7.52 [70%]  9.63 [55%]  9.65 [55%]  13.9 [40%]
Sidekick                6.25 [70%]  6.31 [70%]  6.36 [70%]  8.16 [55%]  8.17 [55%] 11.83 [40%]
Ichor (from 0 blood)    2.85 [80%]           —           —           —           —           —
Ichor (full blood)      1.63 [80%]           —           —           —           —           —
Sheath                  3.75 [80%]           —           —           —           —           —
Static 12-orb volley    8.68 [55%]  8.69 [55%]  8.77 [55%] 14.26 [40%] 14.66 [40%] 27.28 [25%]
Static stream (C)                —           —           —           —           —           —
Ballast spread (hip): pellets landing 2m 12, 5m 7.4, 8m 4.2, 12m 2.2, 16m —, 22m — of 12; aimed-in TTK 2m 0.27, 5m 2.2, 8m 5.48, 12m 53.4, 16m —, 22m —
Intended ranges: Nominal 8-12m; Ballast 2-5m; Omen 8-12m; Sightline rifle 16-22m; Sightline sidekick 5-12m; Sidekick 5-12m; Ichor (from 0 blood) 2m; Ichor (full blood) 2m; Sheath 2m; Static 12-orb volley 5-12m; Static stream (C) 2-5m
```

```
ABILITIES (best-case single target, 100% hits)
----------------------------------------------
weapon     key              ability     dmg   cd s                                                         note
rifle      E   Grenade                   42     25  core 0.7 m, 17 at 4 m; 1.58 s to explode; +10 in Surge
rifle      X   Surge/Nova             142.8     56  2 s charge, 4 s of x2 bullets, no ammo; dmg = extra over normal fire (100% hits)
shotgun    E   Double                  137!      0  both shells 0.05 s apart at 2 m, all pellets (x1.08 aimed in point blank: 148)
shotgun    X   Scatter                   92     40  cap per target; primed 3 s before it can fire
omen       E   Curse + rupture         50.8     10  prime 12 + 6 ticks x 1.8 + late rupture 28 (±2.7); uses a round
omen       X   Covenant + rupture      58.6     40  3 x 6 homing + ticks + rupture (one mark per target: E and X marks never stack)
sightline  X   Breach round            158!   54.8  4.8 s load, direct 158 (+ muzzle blast 16 within 1.5 m)
sightline  E   Stance                     0      0  1.33 s to set up; rooted
sidekick   E   Mines x2                  60     25  30±6 each, core 0.9 m, trigger 0.7 m, arm 1 s; both stacked on one spot
sidekick   X   Rush                     173     45  6 s at 1.6x rate, no reloads; dmg = extra over normal fire (100% hits)
ichor      E   Blood slash               18      6  needs 50% blood; 17 m at 19 m/s; costs you 7.2 hp
ichor      X   Frenzy                  216!     50  78-216 by blood over 2.4 s; drains 16 hp; per-hit 6.5-18 vs slash 6-17
sheath     E   Gold Rush                  0     10  3 s, x1.45 speed, reach x2
sheath     X   Draw-cut                  60     35  ±2, 7.5 m line, contact ~.29-.43 s after press
static     X   Hex                     57.3     30  pulse 47.9 at full size (after 1.67 s of travel) + one zap 9.4; costs 10 orbs
(! = one-shots a full-health player)
```

```
COMBOS — time to kill from first press (s), 100% hits, mean rolls
-----------------------------------------------------------------
rifle      primary only                                                     2.87  before 95.2
rifle      E grenade (core) + fire                                          1.67  before 96.4
rifle      X Surge from press (2 s charge, firing through it)               2.47  before 95.2
rifle      Surge pre-charged + grenade (+20) + fire                         1.47  before 95.2
rifle      Surge pre-charged, fire only                                     1.47  before 95.2
shotgun    E double (both shells) at 2 m                                    0.05  dmgAllPellets 137, dmgHipSpread 124.5, dmgAdsSpread 134.4, oneShot true, spreadOneShot true
shotgun    E double (both shells) at 3 m                                    0.05  dmgAllPellets 137, dmgHipSpread 137, dmgAdsSpread 147, oneShot true, spreadOneShot true
shotgun    E double (both shells) at 4 m                                    0.05  dmgAllPellets 137, dmgHipSpread 111.9, dmgAdsSpread 126.7, oneShot true, spreadOneShot true
omen       primary only                                                     6.28  before 94
omen       E curse + best-timed rupture + fire                              3.67  before 90.6, ruptureAt 3.05
omen       X covenant + fire + rupture                                      3.25  before 92.2, ruptureAt 2.34
omen       E + X together (X diamonds cannot mark a cursed target) + fire   3.15  before 76.6, ruptureAt 3.15
sightline  X Breach, loaded & set up, at 8 m                                0.21  dmg 158, oneShot true, note +4.8 s load, +1.33 s stance
sightline  X Breach, loaded & set up, at 16 m                               0.28  dmg 158, oneShot true, note +4.8 s load, +1.33 s stance
sightline  X Breach, loaded & set up, at 22 m                               0.33  dmg 158, oneShot true, note +4.8 s load, +1.33 s stance
sightline  rifle one-shot chance (100-104 roll vs 100 hp)                      —  chance 1
sidekick   primary only                                                     3.18  before 94.6
sidekick   X Rush from press (summon .55 s)                                 2.58  before 94.6
sidekick   target steps on 2 stacked mines, then fire (t from trigger)      1.22  before 94.4
sidekick   2 mines + Rush already running                                    0.8  before 94.4
ichor      full blood, slashes only                                         1.27  before 85
ichor      full blood, X frenzy only                                        1.07  before 90, note kills on strike 6 of 12 (18 each, 216 in all); drains 16 hp
ichor      full blood, E wave then X frenzy                                 0.88  before 90
ichor      full blood, E wave then slashes                                  1.27  before 86
ichor      no blood, X frenzy                                                  —  dmg 78, note cannot kill alone
ichor      half blood, X frenzy                                             1.67  before 98, dmg 147, note kills alone
sheath     primary only (2 m)                                               2.93
sheath     X Draw-cut from 5 m, then slashes                                2.32  contactAt 0.38, freeAt 1.22, before 92, note 60 + 3 slashes averages 108: kills in 3 slashes 100% of the time
sheath     E Gold Rush: same TTK, but engages from 5.32 m                   2.93
static     full 12-orb volley at 8 m (placement + flight)                   1.77  dmg 123.8
static     stream from 12 orbs at 2 m                                        2.2  dmg 100
static     stream from 12 orbs at 5 m                                        2.3  dmg 100
static     stream from 12 orbs at 8 m                                       2.43  dmg 100
static     smallest one-shot volley                                            —  orbs 11
```

```
SIMULATION CROSS-CHECK (real game loop, stationary target, perfect aim; TTK s / killed share / mean dealt)
----------------------------------------------------------------------------------------------------------
rifle (no spread)                  2m: 2.82 (1) dealt 100 | 5m: 2.85 (1) dealt 100 | 8m: 2.88 (1) dealt 100 | 12m: 2.93 (1) dealt 100 | 16m: 3.37 (1) dealt 100 | 22m: 4.03 (1) dealt 100
rifle (aimed in, real spread)      2m: 2.82 (1) dealt 100 | 5m: 2.85 (1) dealt 100 | 8m: 2.88 (1) dealt 100 | 12m: 4.9 (1) dealt 100 | 16m: 10.22 (1) dealt 100 | 22m: 22.95 (0.92) dealt 99.6
ballast (hip, real spread)         2m: 0.3 (1) dealt 100 | 3m: 0.32 (1) dealt 100 | 5m: 1.8 (1) dealt 100 | 8m: 7.58 (1) dealt 100
ballast (aimed in, real spread)    2m: 0.3 (1) dealt 100 | 3m: 0.32 (1) dealt 100 | 5m: 1.56 (1) dealt 100 | 8m: 6.23 (1) dealt 100
omen (no spread)                   2m: 6.23 (1) dealt 100 | 5m: 6.33 (1) dealt 100 | 8m: 6.43 (1) dealt 100 | 12m: 6.57 (1) dealt 100 | 16m: 7.13 (1) dealt 100 | 22m: 12.23 (1) dealt 100
sidekick (no spread)               2m: 3.32 (1) dealt 100 | 5m: 3.37 (1) dealt 100 | 8m: 3.42 (1) dealt 100 | 12m: 3.47 (1) dealt 100 | 16m: 3.53 (1) dealt 100 | 22m: 3.63 (1) dealt 100
sidekick (aimed in, real spread)   2m: 3.32 (1) dealt 100 | 5m: 3.37 (1) dealt 100 | 8m: 3.42 (1) dealt 100 | 12m: 5.33 (1) dealt 100 | 16m: 11.14 (1) dealt 100 | 22m: 21.81 (0.83) dealt 98.4
ichor (0 blood)                    1.5m: 2.35 (1) dealt 100 | 2m: 2.35 (1) dealt 100 | 2.5m: 2.35 (1) dealt 100 | 3m: — (0) dealt 0
sheath                             1.5m: 3 (1) dealt 100 | 2m: 3 (1) dealt 100 | 2.8m: 3 (1) dealt 100 | 3m: 16.46 (1) dealt 100
ballast E double dmg               2 m hip: 100 kill 1 | 2 m aimed: 100 kill 1 | 3 m hip: 100 kill 1 | 3 m aimed: 100 kill 1 | 4 m hip: 100 kill 1 | 4 m aimed: 100 kill 1
scatter dmg                        2m: 65.6 | 4m: 32.8 | 6m: 27.5 | 8m: 16.9 | 11m: 9.9
static 12-orb volley               2m: — dealt 7.4 selfHp 100 | 5m: 1.82 dealt 100 selfHp 100 | 8m: 1.87 dealt 100 selfHp 100 | 12m: 1.93 dealt 100 selfHp 100 | 16m: 2 dealt 100 selfHp 100 | 22m: 2.1 dealt 100 selfHp 100
static stream (recoil pushes you)  2m: 2.3 dealt 100 | 5m: — dealt 59 | 8m: — dealt 10.6
static stream (distance held)      2m: 2.2 dealt 100 | 5m: 2.32 dealt 100 | 8m: 2.43 dealt 100
sightline rifle 1st shot           8m: 100 kill 1 | 16m: 100 kill 1
sightline breach                   8m: (1) dealt 100 | 16m: (1) dealt 100
```

## Final robot duel matrices (`node tools/duel-matrix.mjs`)

The tool also writes each run's JSON to `tools/out/` (git-ignored: everything needed is inlined below). Final runs: 2026-09-30 after the review changes.

Before (v0.1.0-alpha, same tool, seed 1): default N=20 Static 13, Nominal 80, Ballast 41, Omen 74, Sightline 55, Sidekick 67, Ichor 14, Sheath 56; close N=10 13/76/47/73/48/71/11/61; far N=10 16/81/50/66/60/65/13/49 (same order).

Without Static and Ichor (the six against each other only):

| | Nominal | Ballast | Omen | Sightline | Sidekick | Sheath | cells < 15 |
|---|---|---|---|---|---|---|---|
| default, before | 74 | 20 | 67 | 43 | 56 | 40 | Ballast v Nominal 0, v Omen 5, v Sidekick 3; Sidekick v Nominal 10 |
| default, after | 74 | 33 | 56 | 46 | 61 | 32 | Ballast v Nominal 13, v Sidekick 13; Sheath v Ballast 13 |
| close, before | 68 | 28 | 65 | 32 | 60 | 47 | Ballast v Nominal 0, v Sidekick 5; Sightline v Sheath 10; Sidekick v Nominal 10 |
| close, after | 69 | 27 | 60 | 43 | 61 | 40 | Ballast v Nominal 5, v Sidekick 10; Sidekick v Nominal 10 |
| far, before | 75 | 35 | 58 | 51 | 51 | 31 | Ballast v Sidekick 10; Sheath v Ballast 13 |
| far, after | 72 | 35 | 48 | 49 | 60 | 36 | Ballast v Sightline 5; Sheath v Ballast 5 |

### Default spawns (1V1 duel circle), 20 rounds per ordered pair

```
duel-matrix: Deadwater, hard robots (balanced), spawns: 1V1 duel circle, 20 rounds per ordered pair, cap 90 s, seed 1

Win % of ROW vs COLUMN (draws count half; each off-diagonal cell pools 40 rounds)
             Static  Nominal  Ballast     Omen Sightlin Sidekick    Ichor   Sheath  overall
Static           45        0       10        3        8        5       38        5       10
Nominal         100       60       88       75       53       83      100       73       81
Ballast          90       13       50       33       18       13      100       88       50
Omen             98       25       68       40       85       38       95       63       67
Sightline        93       48       83       15       33       43       93       40       59
Sidekick         95       18       88       63       58       55      100       78       71
Ichor            63        0        0        5        8        0       60        3       11
Sheath           95       28       13       38       60       23       98       40       50

Per weapon, against the other seven (mirror matches excluded; times in sim seconds)
weapon      win%      W-L-D   TTK  winT   len  prim%    E%    X%    C% selfDmg selfKO  TO
Static        10   27-253-0  18.9  27.3  17.9      8     0    27    65       0      0   0
Nominal       81   228-52-0   8.6  14.3  14.1     90     0    10     0     165      0   0
Ballast       50  141-139-0   7.8  14.0  14.3     94     0     6     0       0      0   0
Omen          67   188-92-0  11.1  16.7  16.1     61    18    21     0       0      0   0
Sightline     59  165-115-0   8.9  14.6  15.5     69    29     3     0       0      0   0
Sidekick      71   199-81-0   9.6  15.5  14.9     65     8    27     0       0      0   0
Ichor         11   31-249-0   9.5  20.3  15.0     83     4    13     0     734      0   0
Sheath        50  141-139-0   4.9  10.6  11.7     22    49    28     0       0      0   0
```

### Close (5 m), 10 rounds per ordered pair

```
duel-matrix: Deadwater, hard robots (balanced), spawns: close (5 m), 10 rounds per ordered pair, cap 90 s, seed 1

Win % of ROW vs COLUMN (draws count half; each off-diagonal cell pools 20 rounds)
             Static  Nominal  Ballast     Omen Sightlin Sidekick    Ichor   Sheath  overall
Static           60        0       20        0       10        0       70       20       17
Nominal         100       50       95       75       45       90      100       40       78
Ballast          80        5       50       15       20       10      100       85       45
Omen            100       25       85       60       85       50      100       55       71
Sightline        90       55       80       15       40       25       95       40       57
Sidekick        100       10       90       50       75       60      100       80       72
Ichor            30        0        0        0        5        0       30        5        6
Sheath           80       60       15       45       60       20       95       50       54

Per weapon, against the other seven (mirror matches excluded; times in sim seconds)
weapon      win%      W-L-D   TTK  winT   len  prim%    E%    X%    C% selfDmg selfKO  TO
Static        17   24-116-0  16.4  17.5  12.4      8     0    17    75       0      0   0
Nominal       78   109-31-0   8.5   9.1   8.6     97     0     3     0       0      0   0
Ballast       45    63-77-0   7.9   8.7   9.9     98     0     2     0       0      0   0
Omen          71   100-40-0  10.7  11.9  11.1     61    19    19     0       0      0   0
Sightline     57    80-60-0  10.4  11.0  11.2     87    11     2     0       0      0   0
Sidekick      72   101-39-0   8.2   9.0   8.7     69    13    17     0       0      0   0
Ichor          6    8-132-0   9.5  13.7   9.2     86     4    10     0     236      0   0
Sheath        54    75-65-0   3.4   4.8   6.2     16    51    33     0       0      0   0
```

### Far (22 m), 10 rounds per ordered pair

```
duel-matrix: Deadwater, hard robots (balanced), spawns: far (22 m), 10 rounds per ordered pair, cap 90 s, seed 1

Win % of ROW vs COLUMN (draws count half; each off-diagonal cell pools 20 rounds)
             Static  Nominal  Ballast     Omen Sightlin Sidekick    Ichor   Sheath  overall
Static           30        5       10       10        5       10       50        0       13
Nominal          95       60       80       75       70       80      100       55       79
Ballast          90       20       80       35        5       20      100       95       52
Omen             90       25       65       60       60       40      100       50       61
Sightline        95       30       95       40       30       40       90       40       61
Sidekick         90       20       80       60       60       20       95       80       69
Ichor            50        0        0        0       10        5       30        0        9
Sheath          100       45        5       50       60       20      100       40       54

Per weapon, against the other seven (mirror matches excluded; times in sim seconds)
weapon      win%      W-L-D   TTK  winT   len  prim%    E%    X%    C% selfDmg selfKO  TO
Static        13   18-122-0  20.1  25.3  16.0      7     0    28    65       7      0   0
Nominal       79   111-29-0   8.9  12.1  11.6     87     1    12     0      81      0   0
Ballast       52    73-67-0   7.7  11.0  11.0     94     0     6     0       0      0   0
Omen          61    86-54-0  11.4  15.0  14.6     63    20    18     0       0      0   0
Sightline     61    86-54-0   6.9  10.2  12.1     58    40     2     0       0      0   0
Sidekick      69    97-43-0   9.7  13.0  12.3     69    10    22     0       0      0   0
Ichor          9   13-127-0   9.0  16.0  12.5     82     4    14     0     292      0   0
Sheath        54    76-64-0   6.3   9.3   9.1     22    47    31     0       0      0   0
```

## Every changed constant (old -> new)

All in `src/config/gameplay.js` unless noted.

| Constant | Old | New | Why |
|---|---|---|---|
| `RIFLE.damage` | 4.4 | 6.8 | 15 hits (~2.9 s) instead of 23 (5.5 s); 14 hits = 95.2, no near miss |
| `RIFLE.minDamage` | 3.2 | 4.8 | 20 hits at 22 m (4.0 s, was 6.8); moved so 16 m / 22 m land clear of 97-99 |
| `RIFLE.interval` | .165 | .2 | keeps TTK in 2.8-3.2 with the heavier bullet, and Nova at >= 1.4 s |
| `RIFLE.hipSpread` | .105 | .12 | less hip accuracy up close; skill over spray |
| `RIFLE.aimSpread` | .054 | .06 | a touch wider; kept tighter than the Sidekick so the rifle wins aimed-in at 8-16 m (review: .075 lost that) |
| `RIFLE.maxStamina` | 3 | (deleted) | never read; Nominal has `RULES.maxStamina` 1 (unchanged) |
| `GRENADE.damage` | 48 | 32 | core hit 58 -> 42, so grenade + fire is 1.67 s (was 1.58) |
| `SURGE.duration` | 5 | 4 | Nova was worth ~1.7 kills of extra damage with 6.8 bullets |
| `SURGE.taken` | .85*.82 (.697) | .85 | with a 30% cut Nominal robots shrugged off whole Ballast doubles; back to the v0.83 15% |
| `SHOTGUN.shellDamage` | 57.4 | 67 | with the new cone, 41 a hip shell at 5 m |
| `SHOTGUN.spread` | .30 | .17 | a third of the pellets reached a body at 5 m; now ~60% |
| `SHOTGUN.aimSpread` | .18 | .15 | aiming in still narrows it, a little less than before |
| `SHOTGUN.full` (was `.25` in shotgun.js) | .25 | .55 | full power for 3.7 m of travel |
| `SHOTGUN.edge` (was `SHOTGUN_EDGE` in shotgun.js) | .2 | .65 | 6-8 m a real (not great) fight |
| `SHOTGUN.end` (was `SHOTGUN_END` in shotgun.js) | .14 | .14 | moved only |
| `SHOTGUN.reload` | 2.5 | 2.2 | a little faster, as allowed |
| `OMEN.damage` | 7.2 | 9.4 | 11 diamonds kill (14) |
| `OMEN.minDamage` | 4.5 | 4.7 | clear of a 97-99 near miss at 22 m |
| `OMEN.fullRange` | 12 | 13 | clear of a 97.6 near miss at 16 m |
| `OMEN.reload` | 1.8 | 1.35 | primary alone 6.3 s (9.8) |
| `OMEN.spread` | .025 | .045 | a little less pin-point at range (robots land 60% of Omen's damage with plain diamonds) |
| `OMEN.primeDamage` | 9.9 | 12 | a primed diamond stays heavier than a plain one |
| `OMEN.tickDamage` | 2.16 | 1.8 | lighter curse (rolls 1.44-2.16) |
| `OMEN.blastDamage` / `lateDamage` | 27 / 34.2 | 20 / 28 | the rupture is still the payoff and the last-second rupture a real skill moment (+40%); E+X 3.15 s instead of 1.7 with the new diamonds |
| `OMEN.blastCap` | 39.6 | 32 | cap scaled with the rupture |
| `OMEN.volleyDamage` | 9 | 6 | covenant trimmed as asked |
| `SIGHTLINE.damageMin` / `damageMax` | 98.6 / 101 | 100 / 104 | a sure kill from full, no coin flip |
| `SIGHTLINE.reload` | 4.2 | 4.8 | the price (Breach loads as long) |
| `SIGHTLINE.blastDamage` | 60 | 56 | Breach 159.8 -> 158, a little less overkill |
| `SIGHTLINE.pistolDamage` | 5 | 7.4 | sidearm 14 hits, ~4 s (8.1) |
| `SIGHTLINE.pistolMagazine` | 10 | 14 | one magazine holds a kill |
| `SIGHTLINE.pistolInterval` | .28 | .3 | ~25% slower than the Sidekick |
| `SIDEKICK.damage` | 6 | 8.6 | 12 hits, ~3.2 s (6.3); 11 hits = 94.6 |
| `SIDEKICK.magazine` | 10 | 12 | one magazine holds a kill |
| `SIDEKICK.mineDamage` | 40 | 30 | 2 mines + 5 shots = 103 (at 40, 2 mines + 2 of the new shots left 97.2); anti-melee trimmed |
| `SIDEKICK.mineCooldown` | 30 | 25 | E cooldowns within 6-25 s |
| `SIDEKICK.duration` | 8 | 6 | Rush trimmed as the shots got 43% heavier |
| `SIDEKICK.fireRate` | 1.75 | 1.6 | Rush kill 1.93 s once running (>= 1.7) |
| `ICHOR.frenzyDamage` / `frenzyMax` | 36 / 108 | 78 / 216 | a strike (6.5-18) beats a slash (6-17) at every blood level and lands every .2 s (~30% more a second); kills alone from half blood (1.67 s); full blood on strike 6 of 12 (1.07 s) |
| `ICHOR.waveDamage` | 14 | 18 | wave + 5 full slashes 99 -> 103 (101-105) |
| `ICHOR.waveCost` | .5 | .4 | the wave's price stays ~7 health (7.2) |
| `ICHOR.guardCapacity` | 10 | 16 | bullets hit ~1.5x harder: the guard still soaks about two |
| `SHEATH.damage` | 13 | 16 | 7 slashes, 2.93 s; Draw-cut + 3 = 108 |
| `SHEATH.rushSpeed` | 1.35 | 1.45 | a little more reach to gunners |
| `SHEATH.eCooldown` | 12 | 10 | Gold Rush is Sheath's main way in |
| `RULES.sprayInnerDPS` / `sprayOuterDPS` | 39.2*.92 / 15.4*.92 | 39.2 / 15.4 | stream back to full |
| `RULES.sprayFalloff` (was `.25` in simulation.js) | .25 | .15 | a full bar kills at 8 m (2.43 s) |
| `PROTOCOL_VERSION` (src/net/protocol.js) | 23 | 24 | joiners predict their own movement from config (Gold Rush speed changed): older builds must not join |

Other edits: `src/items.js` (control text built from config: Sidekick rounds, reload, mine refill and Rush, and its description's Rush length (it said eight seconds until review); Sightline reloads, Breach damage, splash and cooldown, and its HUD `capacity`; Ichor's slash range, dash bonus, guard capacity and blood-slash cost; Ballast's fall-off), `src/tutorial.js` (Gold Rush, mine and Rush notes from config), `tools/balance-sheet.mjs` (reads `sprayFalloff`; flags any primary or combo left at 97-99.x; labels from config), tests that spelled out a changed number (now read config), `tests/golden-flat.test.js` (rifle, shotgun, robots, hosted re-recorded; rifle and robots again after the review), `tests/sheath.test.js` (asserts protocol >= 24), `tests/tutorial.test.js` (Omen burst powers from OMEN), `src/bots/robot-brain.js` (one stale comment, no code), `.gitignore` (`tools/out/`). Robot brain: unchanged.

Not changed: dodge counts (Nominal keeps one), magazines of Nominal (20, the owner's recent call), Omen's 4 and Ballast's 2; Scatter; Static's volleys, orbs, recharge and hex; every cooldown not listed.

## Remaining concerns
- **Robot matrix** (above): Nominal 81%, Sidekick 71%, Omen 67% overall; Ballast v Nominal, Ballast v Sidekick and Sheath v Ballast 13/87. Structural (robot kiting and weak Static/Ichor robots), not fixable with numbers without breaking the per-weapon targets for people. A robot pass (Static volleys, Ichor closing, not kiting melee forever) is the next lever.
- **Static and Ichor robots** a couple of points lower than before (within noise on default spawns, Ichor lower at close range). For people both got stronger (stream, Frenzy, guard).
- **Ballast's double now kills out to ~4 m** (it was ~2-3 m with hip spread): a consequence of the 41-at-5 m target. Watch it in playtests; `SHOTGUN.spread` is the knob.
- **Sidekick at 22 m is exactly 3.40 s** (target edge); faster bullets would be the fix if it matters.
- **Omen realistic TTK** (55% hits on slow diamonds) is still 12 s alone; Omen leans on its curse by design.
- Hit rates for people are guesses (the sheet's realistic column); playtest the new cones (Nominal aimed .06, Ballast .17 / .15, Omen .045).
- **Frenzy at half blood** leaves the target at 98 after 8 strikes (see #9); 72-216 would clear it at the cost of the zero-blood strike only tying a slash.
- **Flaky test, not from this pass**: tests/solo-stats.test.js "robots hurt you and kill you" fails ~1 in 7 whole-file runs (an easy/normal robot sometimes never engages a player standing still for 90 s; the same 3 of 40 seeds fail with the pre-pass numbers). It passed in the final full run.
