# DEADSHIFT ALPHA 0.3

a minimalist top down shooter with distinct weapons and explosive combat, playable on mobile or pc

## Run

Node.js 22.12+ and pnpm (or npm):

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:5173. `pnpm build` creates a self-contained `dist/` folder for static hosting, including GitHub Pages repository paths. `pnpm preview` serves the production build locally.

## Controls

| Action | Control |
| --- | --- |
| Move | WASD |
| Aim | Mouse, or arrow keys independently of movement |
| Static: place drifting orbs | Hold E |
| Static: launch / quick shot | Left click or Q |
| Static: hex / lightning stream | X / hold C |
| Nominal: single shot / automatic fire | Left click or Q / hold either |
| Nominal: tighten spread | Hold right click or Shift |
| Dodge, all weapons | Space while moving |
| Nominal: reload | R |
| Nominal: load 36-round extended magazine (60-second cooldown) | X |
| Nominal: throw grenade | E |
| Reset practice | Restart in pause menu |
| Pause / resume | Escape |
| Sound | N |
| Map | M |
| Toggle dev overrides except invincibility (enter code 1919 to unlock) | P |

Touch uses the left stick to move and the right stick to aim. Static also places orbs while holding the right stick; tap the world or Q to launch. Nominal uses hold FIRE, hold AIM, and RELOAD buttons. Settings contains a controls table for each weapon. Both weapons share a bottom HUD with stamina, weapon name, ammo segments/count, status, and control hints.

Nominal fires every 0.18 seconds, holds 18 rounds, and reloads in 1.8 seconds. Damage falls from 20 to 14 across its effective range. Bullets travel at 90 world units/second with swept collisions. Movement widens spread by up to 70%; aiming reduces it by about 49%. Each shot ejects a casing; reloads drop magazines that expire after 30 seconds. General developer tools include unlimited ammo for both weapons; Static and Nominal have separate sections for their specific overrides.

Nominal's green grenade has a 1.4-second fuse after release and a 25-second cooldown. It deals 240 damage within 0.7 metres, falling to 35 at the 4-metre blast edge. Cover blocks blast damage, including self-damage. A permanent facing marker shows its 12-metre maximum throw distance; the grenade flashes red after landing. Tutorial is always available in Gamemodes, and also appears on the main menu until a tutorial is completed.

X loads one 36-round magazine using the normal 1.8-second reload, with a 60-second cooldown from activation. R replaces it with a standard 18-round magazine. Grenade, extended magazine and Static's hex use the same cooldown-ring presentation. Settings → Controls → Show HUD control hints hides or shows the labels below ammo and persists across refreshes. Aiming briefly raises and steadies Nominal.

## Static weapon and practice

- Twelve total orb slots. Deployed orbs reserve their slots until launched or dissipated; they cannot stockpile a second magazine.
- Orbs drift slowly and expire after nine seconds. Any collision dissipates an unlaunched orb without damage.
- Pale-blue drifting orbs separate on contact and carry small electrical arcs. Each launch captures the cursor/tap point. All surviving orbs arrive there simultaneously, each along a straight path from its own location. Solid cover intercepts shots. Their individual energy trails linger briefly and fade.
- Each orb deals 8 damage in a one-orb volley, scaling to 24 per orb in a full volley. Targets have 100 health and respawn after 4.5 seconds.
- One arriving orb has no explosion. Two through twelve create one blast at the clicked point, with radius 0.55–3.024 metres (a full 12-orb impact gets a 12% radius bonus) and centre splash damage 6–60. Damage falls off with distance and cover blocks it. Intercepted orbs do not contribute to an explosion beyond cover.
- Launching starts a 0.8-second refill delay, then replenishes one orb every 0.65 seconds while moving or 0.52 seconds when standing still (25% faster). Smaller volleys leave reserve ammo available immediately.
- Crates, barrels, cacti, hay and signs break on a launched hit. Chunks scatter away from the shot, tumble, bounce, clatter and disappear. Splash can also break them. Buildings, fences, the water tower, well and cart remain solid. Reset restores destructible cover.
- Pause freezes simulation, recharge, particles, smoke, debris, roofs, camera and audio. Reduced camera motion disables shake and softens lag.

The dark map has a single clean dirt street, wordless signs, sparse procedural props and occasional windblown polygonal tumbleweeds. Balanced mode adds 140 patches of dry grass, seed heads, low desert plants and stones; Quality adds 190 more. Extra cactus clusters and breakable deadwood are present on every preset. Sand marks are more prominent in Balanced and Quality. Raised shingles, corrugated metal, wood siding and adobe brick give buildings simple physical surface detail; individually scattered short sand marks add subtle ground and path variation without a repeating texture. The saloon faces the road and has a north-side exit. Supplies has south and west entrances. Roofs fade when the player enters. Doors and the saloon window create clear outward sight-and-fire cones; the remaining exterior stays visible but muted and slightly blurred. Blocked launches preserve deployed orbs and ammo. The window passes shots while blocking walking. Buildings have subtly weathered siding, and the street has irregular worn edges and shallow surrounding terrain variations. Explosions and bullet hits leave persistent surface-clipped scorch marks until reset; target marks disappear when destroyed and targets respawn clean. Small alternating footprints darken the sand as you walk, remain briefly, and fade continuously over three seconds, with inset rim shading in Quality mode; pause freezes them and reset clears them.

## Graphics

Frame caps: 30 / 60 / 90 / 120 / Uncapped. Rendering is separate from the fixed 60 Hz simulation. Preferences persist locally.

| Preset | Resolution | Shadows | Ground texture | Ambient motes | Effect budget |
| --- | --- | --- | --- | --- | --- |
| Performance | 0.8×, pixel ratio capped at 1 | Off | 64 | 28 | 30% |
| Balanced | 1×, pixel ratio capped at 1.5 | 1024 | 256 | 80 | 65% |
| Quality | 1×, pixel ratio capped at 2 | 2048 soft shadows | 512 | 140 | 100%, energy light |

## Structure and verification

- `src/simulation.js`: deterministic movement, swept collisions, ammo, damage, destruction and explosion events, without DOM or rendering dependencies.
- `src/maps.js`: replaceable map dimensions, buildings, doorways, props, target routes and fences. Open `?map=dry-creek` for the smaller map.
- `src/renderer.js`: Three.js procedural geometry, camera, roofs, effects and cosmetic debris physics.
- `src/audio.js`: locally synthesized sound.
- `src/main.js`: browser inputs, UI and fixed-step loop.
- `src/settings.js`: graphics presets and render pacing.

```sh
pnpm test
pnpm build
```

Tests cover movement, fence sliding, door passages, cursor convergence, refill rates, destruction and reset, splash damage and cover, deterministic replay and graphics/frame budgets.

AI duels, online 1v1, 2v2 and matchmaking are not implemented. The simulation/input/rendering separation supports that future work; an authoritative multiplayer server will still need a player roster, transport, prediction and reconciliation.

All art and sound are generated locally in code. Three.js is the sole runtime dependency; playing needs no account or external asset service.





Hex ability: press X with 10 available ammo to deploy six double-size electric orbs, leaving two ammo from a full supply. Press X again to connect surviving adjacent vertices and pulse each orb. The expanding hex smoothly pushes practice targets outward without contact damage, respecting walls. Pulse radius grows from 0.28m to 1.65m, peak damage from 10 to 150 (quadratic growth with travel distance), and zap reach from 0.55m to 2.3m over the first 6m of travel. Each detonation applies at most one pulse hit. Its perimeter then rotates clockwise once over one second around the frozen cast center. Each of the six original sides can zap each nearby victim once for 20 damage; cover blocks edges and zaps. Regular orb damage remains independent. Orbs travel at 2.4m/s and fizzle at 12m or solid cover; the active hex reserves its spent ammo proportionally to surviving orbs. Reset and practice pause apply to the ability and effects.

Graphics: Balanced now uses the previous Quality settings (2048 shadows, 512 terrain texture, 330 foliage patches, dynamic blast lighting). Quality adds 4096 shadows, 1024 terrain texture, up to 420 patches, and a modestly higher effects budget. Performance remains lightweight.

The caster stays inside the original expanding hexagonal footprint until the last orb dissipates or X detonates the ability. Missing vertices do not open an escape route. At full expansion, pulse splash reaches 1.65m; short electrical strands extend the reach to 2.3m from surviving vertices or unobstructed edges, with no damage beyond that range.



Expanded Deadwater: 128 × 114 metres (3× original area), 11 interiors, a winding southern street, broken wagon, farm crops, windmill and trough, and a deserted western district. Two small abandoned houses have a single usable entrance and boarded decorative windows. Crops provide a 5.5m local visibility bubble; distant targets within crops are hidden. Interior obscured views now use 7px blur.

Quality adds approximately 2,850 foliage patches across the larger map versus about 990 in Balanced, fine wood grain, floorboards, prop seams/nails/rivets, interior furniture, shoulder stones, five electric arcs per orb, branching pulse lightning, lit smoke, double effect density and richer break debris. Hex maximum travel is 12m; a red ground hexagon marks its expiry footprint while active.

Health and balance: player 500 HP (own grenade and Static orb explosions cause splash damage; own X, C and direct shots remain safe). A soft-pink top health bar shows a larger centered current-health number underneath and a red lost-health segment that swells then smoothly contracts, range targets 100 HP, nine pole-mounted dummies 75 HP, crates/barrels 10 HP, cacti 2 HP. Targets and dummies respawn at full type-specific health after 4.5 seconds; dummies break into straw/wood fragments and dust. Quality displays an inline low-end-device warning in the graphics menu.

Weapon design policy: weapons are sidegrades, with comparable overall effectiveness and different strengths rather than a superior choice. Compare damage, ammunition/refill, range, precision, setup time, mobility, utility and counterplay together. Current starting values remain 8–24 direct damage per orb (288 full-volley direct), 6–60 blast damage with distance falloff, and hex pulses 10–150 plus up to six distinct 20-damage side zaps during the one-second clockwise spin. These are provisional balance values; real opponent playtests will be needed.

Hex precision tuning: at full expansion, pulse damage is 150 at its center, 66 halfway to the edge, and 38 at the edge. A curved falloff rewards accurate timing instead of boosting the entire splash zone equally. Up to six 20-damage side zaps can add to it (270 theoretical maximum with a perfect pulse); overlapping pulses still do not stack. Early detonations retain a low peak of 10.

Hex cooldown: 30 simulation seconds from the initial cast. Second-X detonation remains available during cooldown. Recasts are blocked until the timer expires; pause freezes it and reset clears it. The weapon HUD shows PULSE, SPIN, or the remaining cooldown.

Space dodge: captures movement direction and travels 3.2m over 0.24s, respecting walls, map edges and active hex containment. Two stamina units allow two dodges; after a 0.6s delay, one unit returns every 1.6s. The HUD shows two small stamina segments. Dodge uses a 0.18m projectile hit radius (normal 0.38m) and 50% incoming damage, never full immunity. Self-damage remains disabled. Practice pause freezes movement/stamina; reset restores stamina. General controls list Space for every weapon in the game menu.


C lightning stream: hold C for a 0.2s harmless sputtering wind-up, then 0.25s firing per available ammo (3s from twelve). The 8m cone has an 8-degree inner half-angle at 140 DPS and a 22-degree outer half-angle at 55 DPS, with up to 25% distance falloff. Solid cover blocks damage and bolt visuals. Recoil pushes backward at up to 2.8m/s and slows forward travel; aiming is limited to 117 degrees/s. Release or dodge cancels the channel; exhausted fire needs release before restarting. Shared ammo cannot recharge while channeling. Central bolts are dense white-blue energy with sparse outer arcs. Hex rotation, pulses and normal volley convergence now have brighter additive energy and branching sparks across presets, with more detail in Quality.


Electrical effects now use bright jagged white cores, animated branching arcs, blue glow and expanding pulse rings. Rotating hex edges keep a continuous animation clock. C absorbs 94% of the recoil boost when walking directly backward (scaled by retreat alignment), while idle and forward recoil are unchanged. Verified by retreat regression coverage, the 81-test suite, production build and browser pulse checks.

Remote country expansion: Deadwater is now 224 x 248 m (3.81x the previous area). The winding southern road leads to one farmhouse and a dense 30 x 28 m field. Sparse dead trees, stumps, boulders, ruined masonry, cisterns and broken telegraph posts provide landmarks and occasional solid cover. Crops comprise 56 irregular simulation sections. C and explosions ignite touched sections, fire spreads to adjacent standing sections after 0.38s and each section burns for exactly 3s from its own ignition. X pulses and rotating edges remove sections as dust without ignition. Walking bends individual instanced stalks persistently until reset. Standing crops restrict vision to a feathered 4.2m circle with fully black surroundings; destroyed ground restores visibility. Targets and dummies have slim continuous health bars; props have none. Interior vision masks feather the combined doorway/window regions. Browser checks verified crop visibility, trample, fire, the corrected farm road material and interior feathering; 88 tests include propagation, cover, destruction, reset, map reachability and landmark geometry.

Crop-fire revision: each section now burns for 8s and spreads after 1.5s. Flaming ground deals exactly 10 HP per second of exposure to players (including the caster) and targets/dummies. Adjacent sections do not stack damage, dodge does not amplify or reduce environmental fire damage, and leaving/extinguishing the fire stops exposure. A single continuous soil-bed texture replaces individual section decals; scorch blends in progressively and persists after burning or electrical removal. All 91 tests and production build pass.

Outdoor expansion: the north T-junction leads west to a three-building settlement. Ten roadside landmarks and 32 grouped stone boundaries, timber stacks, freight piles and rock ridges provide outdoor routes and solid cover. New cover conceals targets behind it while leaving aiming free; projectile collisions intercept shots. Interiors use a smoothly fitted fixed camera with shake, and conceal dynamic entities/effects outside opening cones. Quality adds ground/wood relief, landmark vegetation and increased effect budgets.


## UI design standard

Preserve this approved treatment for future game UI:
- Button labels use Arial Black, uppercase, with a 10px inset. Pause actions alternate left/right (Resume, Restart, Settings, Main Menu). All home menu labels, including Keyboard and Mobile, are left-aligned.
- Use the common 32px font and 40px button height. `src/button-typography.js` measures glyph bounds, stretches vertically to 108% of the inner height, crops 4% at each edge, and compresses long labels horizontally to fit.
- Regular buttons have a dark background and white text. Mouse hover and arrow-key focus use the health bar's soft pink (#e8afb9) with dark text. Settings, dropdown choices, checkboxes, and clickable headings share this accent. Borderless death-menu actions highlight their text in pink.
- Keyboard/mobile is a split selection: either selected mode and its side tab stay pink. Selected pink controls change only their text to white with a thin dark edge on hover/focus. Settings tabs use the same selected treatment.
- Dropdown lists are rendered in-game to avoid native blue highlights. E/Enter opens and confirms; arrows move within the list; Q/Escape cancels. Left/right changes a closed selector immediately, and every settings visit starts with lists closed.
- Maintain the slight hover lift and reduced-motion support. Arrow keys navigate, E selects, Q goes back.
- Apply the shared theme in `src/menu-theme.css` to new UI rather than introducing one-off button colors or typography.

Damage and death feedback: every hit creates a separate red damage number beside the player, with a brief entry slam and a three-second lifetime ending in a half-second fade. A quick, urgent hit cue starts on that same damage event, with small damage ticks quieter. Lethal damage immediately plays a distinct dry snap and short two-step low drop, drops the gun, bursts into low-poly blood particles, and spreads one of five larger red pool patterns. Both the burst and ground splatter follow the killing projectile direction or spread away from the explosion; environmental deaths keep a radial pattern. Damage numbers follow the rendered avatar and retain their initial side to prevent movement jitter. Nominal focused cursor response is 12/s with an 800 px/s cap, retaining aim slowdown while turning more freely. After four seconds, the blood-splatter death menu offers Restart or Main Menu; its black text turns pink on hover or keyboard focus. Both new cues respect mute and pause.

Blast movement: Static volleys of 2–5 orbs have no knockback; 6–12 scale progressively to 2.2m at the center. Nominal's grenade can push 2.8m, slightly less than a 3.2m dodge. Force falls off with distance and respects cover and movement collision. Spawning, restarting, and toggling P all restore 1× movement speed; O remains the 1× / 2× / 4× speed cycle.

Weapon selection: left/right switches between weapons, down focuses that weapon's Try button, and up returns to its card.

Nominal handling: two segmented arms keep hands attached to the trigger grip and fore-end. Focusing raises and settles the rifle, braces the torso and elbows, and reduces sway. The off hand winds back and releases the grenade, follows through, then returns to its support grip. Death scatters eight low-poly bones from six recognizable shapes plus a stylized brain, intestine coil and severed hand along the blood's impact direction. A four-second eased camera push moves toward the remains and reduces camera height to 56% before the death menu; restart restores the normal camera.
# Damage reactions

Damage popups independently choose one of three bright red shades, retain a dark outline for contrast, and scale subtly with damage. Electricity leaves a charred fallen avatar, fire reveals a fallen skeleton, gunshots leave an intact body with a head wound, and ordinary explosions scatter remains. Every death drops the weapon. New damage effects should declare `damageType` and register their reaction in `src/death-reactions.js`.

## Ballast

Ballast is a two-shell break-action shotgun with one native dodge. Hold left mouse to charge for two seconds; release to fire. Press Q while holding to store that charge for 15 seconds without firing. The same stored charge powers both shells. E discharges remaining shells 0.05 seconds apart; R reloads in 2.8 seconds. Right mouse narrows the cone. Twelve pellets total 100 uncharged or 300 fully charged damage per shell; charge extends range from 7.5 to 9 metres without changing the angle. Recoil launches the wielder 3.4–4.4 metres, stopping at cover. Targets receive proportionate knockback. Spent shells eject during the hinged reload and persist for 30 seconds. The menu preview shows the open breech with both shells; the in-game off arm braces the firing arm across the chest. Effects scale with charge and graphics preset.

Outgoing damage numbers replace target health bars, stay anchored at the hit location, and fade after 2.5 seconds. Blue changes to green below 150 remaining health. Hits give a restrained ding; kills have a short chime, with a brighter flourish for a full-health kill in one attack. Pellet contacts belonging to the same shell combine into one number. Ballast includes keyboard/mobile controls, developer instant reload, and its own training progression.

Ballast recoil ramps nonlinearly, with a strong final-charge boost. Outgoing damage numbers include overkill rather than capping at remaining target health.

Ballast launches break destructible props on actual body contact, preserving walls and solid scenery. Pellets now lose damage strongly with distance: close-range maximum damage is unchanged; a centered full-charge aimed blast deals roughly 75�100 at midrange and much less near the range limit.

Ballast's cone guide has open side lines and a small cosmetic gap at the muzzle. RMB still narrows spread; Q locks charge. Full-charge close hits require the central 55% of the target radius for full pellet damage; outer contacts deal 55%. Each point-blank pellet has a 90% independent contact chance, so perfect 300-damage hits remain possible. Full stored or live charge vents steam on both sides and shakes the camera gently; E fires both barrels without requiring Q.

A lethal Ballast burst that removes at least 85% of maximum player health from one attacker within 0.45 seconds triggers a headless kneeling corpse, directional blood fragments and pool, and blood running down the torso. The gun still drops. Smaller finishing hits retain the normal gunshot death.
