# Deadshift: project handoff

Deadshift is a top-down western shooter that runs in the browser on desktop and phones. This file is the single source of truth for anyone (person or AI) picking the project up. **Keep it current: any change that adds or changes a system updates this file in the same change.**

## Standing rules from the owner

These come first and are never removed.

- **Never push or pull the repo unless the owner says so.** No commits either unless asked.
- **Nothing in the game mentions the developer tools until they are unlocked** (pause, Shift+P, code). Keep it that way: no hints, toasts, labels or key reactions before the unlock. Practice overrides never go online.
- Do not control the user's visible game tab for testing. Use a separate hidden browser tab and leave their session alone.
- New weapons or damage effects must carry an explicit damageType through lethal hits and define their death reaction in src/effects/death-reactions.js. Preserve weapon drops for every death. Electricity leaves a charred fallen body; fire leaves a fallen skeleton (sometimes with snapped or missing limbs and the brains spilled beside a cracked skull, see gore.js); bullets leave an intact body with a head wound; ordinary explosions use directional gore scatter. Add reaction and cleanup coverage for new effects.
- **Every Ballast kill is the headless kneeling death** with directional blood (owner's rule, replacing the old 85%-in-0.45 s burst requirement; `recordBallastDamage` still records the hits).
- **Performance work targets the Performance and Potato presets.** Playtesting happens on phones and an Intel MacBook, not on the owner's high-end PC (RTX 5090), which is not representative.
- **"Optimize" means finding headroom and spending it on looks, never removing things.** Measure first. Merge, batch, cache or build lazily, and use what that saves to add detail that is cheap to draw.
- Explain decisions in plain language: how a system works, not just that it works.

## Design (the owner's intent; keep new work consistent with it)

### Look
- **Low-poly, flat-shaded primitives** (boxes, cylinders, icosahedra), a western frontier town in muted warm desert colours, seen from a **top-down camera** (slightly tilted from the south). No lettering anywhere in the world. Age shows through missing planks, tilts, tone shifts and seeded wear, never text or decals of words.
- **Readable from above:** anything the player must notice goes where the camera sees it: upward faces, the hat brim, the floor. Roofs fade right out when you are inside; interiors are shrouded from outside.
- **Gore is stylized, not realistic:** solid low-poly shapes in blood reds, bone and char, flat-shaded like the world; no anatomical textures. It should be obvious what it is (brains are pink folded lobes, bones are ivory, char is cracked with glowing seams), and varied (not every skeleton is whole).
- **Blood is world history:** it stays until a map reset (one stain and one body per player, capped drops), and it moves with the world (a crate's blood goes when it breaks; players who walk through it carry it and leave prints).
- **Graphics presets:** Extreme is Quality plus, never minus. "Optimize" means find headroom and spend it on looks; test targets are phones and an Intel MacBook.

### Interface
- **Panels:** dark grey (about #232827) with a pink accent (`--ui-accent`, #e8afb9); solo pause and settings cards are cream (#f0e4c9). Headings are lowercase ("paused", "lobby", "choose weapon"). The main action is pink (GO, START ROUND highlight).
- **Buttons:** big stretched display lettering, fitted before the first paint (plain text never flashes), with the same letter width across buttons shown together; a menu's buttons alternate left and right alignment. Anything destructive takes two presses ("PRESS AGAIN TO RESET"). Nothing in solo mentions multiplayer, and nothing mentions developer tools before they are unlocked.
- **Copy:** tutorial and hint text is lowercase, plain, minimal punctuation, keys as keycaps (`[SPACE]`, `[E]`). Controls: Space/LMB shoot, E the weapon's other action, Left Ctrl dash, R reload, X / C weapon abilities, Shift/RMB aim in, M map, N sound, Esc pause, Tab scoreboard; menus use E to confirm and Q to go back.
- **HUD:** top right three round icon buttons (icons centred, 38 px) in the button ink: map (folded map, M), sound (speaker, N; off turns it pink with a bar struck across) and menu (three bars, Esc); keys live in their titles. Top left the title, then "map · mode" on one line, then the room badge, in one block so nothing overlaps; health top centre; weapon panel bottom centre. Nothing floats over players' heads (names live in the lobby, scoreboard, kill feed and death screen). Overlays that are glanced at during play (the Tab scoreboard) do not dim the game and are slightly see-through, with text shadows for contrast.
- **Kill feed:** your name blue, others pink; "X killed Y", "**X one shot Y**" (from full health to dead in one hit), "Y died". The death screen says "killed by X" / "one shot by X".
- **Weapon pick:** rounded, slightly see-through squares, five to a row, only picture and name, lifting on hover or pick; a timer bar on top (not in solo); pink GO.

### Title screen blood (the owner's brief, all of it in one place)
The title (`title-screen.js`, the main menu's home page) is built to this; every point is something the owner asked for:
- **Source:** it comes from inside the hole of the **d** in "deadshift" (first asked for the a; changed to the d).
- **On the letters:** across the bottom of **every** letter, each letter bleeding its own way (higher on some letters and parts, lower on others, not one smooth line across the word; wet edges like the first sample; no splatters on the letters; where it joins the drips it is seamless), reaching about **a third of the way up** them, **uneven** from place to place (higher here, lower there), messy.
- **Gravity:** it hangs off the word as if pulled to the bottom of the screen; the parts that droop **droop a lot** (long drips), but it drips from **only a few places**, not everywhere.
- **Buttons are solid:** blood oozes onto the buttons below, gathers on their tops, oozes and drips off their edges, and runs down onto the next button; some buttons get **splatter and stains** as it lands.
- **Liquid, but 2D:** it should read as liquid, yet stay **flat and 2D**: no shiny/3D light effect, no highlights or bevels. **Cartoony like the game's gameplay design, but also somewhat real and messy.**
- **Colour:** close to the **in-game blood** (gore.js `#8c1c2a` family): a realistic red that fits the mood, **not bright red but not too dark either** (the first, near-black `#4b0c12` was too dark).
- **Animation, not simulation:** it plays as the screen opens, then stays in that settled state and **keeps playing as a repeating animation** (drips keep forming and falling).
- **Layout:** don't change the size of the word "deadshift"; the **game version sits above** the word. Buttons PLAY / GAMEMODES / SETTINGS / EXIT in the menu style; they animate and click but do nothing, EXIT goes back to the dev menu.
- **Still to come:** the loading screen (not started; the owner said title first).

### Play
- **Practice targets:** every board target 250 health, every hay dummy 300 (`RULES.targetHealth` / `dummyHealth`; Deadwater's range-b no longer has its own 500). The tutorial keeps lighter ones (`TUTORIAL_TARGET_HEALTH`: 100 / 75) so lessons stay short. They **show damage as they break**, Balanced and up, more stages and pieces on Quality and most on Extreme (see Rendering).
- **Players:** 500 health, distinct weapons (Static electric orbs, Nominal rifle + grenade, Ballast charge shotgun), dodge stamina per weapon. Every damage source carries a `damageType` and every death has a reaction (see Deaths); **every Ballast kill is headless**.
- **Targets break by what hit them:** bullets leave holes, everything else only cracks and breaks them (target-damage.js); targets face varied directions, never away from the camera.
- **Blood follows force:** shots on players bleed (never Static's stream or single orbs), bullets build up the longer you keep hitting, blasts bleed most. Walking through blood soaks you; **you respawn clean** (your body keeps the blood).
- **Modes:** multiplayer rounds (FFA and practice now; 1V1, 2V2, 2V2V2, 3V3 listed), up to 6 players, host-run lobby with host-only settings; FFA respawn wait 12 s by default, weapons change only after dying; practice changes weapon any time. A host can play alone, even without the matchmaking server. **Every gamemode outside Multiplayer is singleplayer against AI (bots) until at least the beta.**
- **Aim without a mouse:** arrows and swipes lock onto targets; against players the lock chases (a runner pulls ahead) and holding an arrow leads them. A mouse is never assisted.

## Engine, language, tooling

| | |
|---|---|
| Engine | **No game engine.** The rendering library is **three.js 0.180**; the game loop, physics, input, UI and audio are all hand-written. |
| Language | JavaScript (ES modules, no TypeScript). HTML and CSS for every menu and HUD. |
| Build | **Vite 7** |
| Tests | Node's built-in runner, `node --test tests/*.test.js` (about 485 tests) |
| Package manager | pnpm on the owner's PC and in CI; npm works too |
| Deploy | `.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main` |
| Networking | **PeerJS 1.5.5** (WebRTC data channels, P2P) behind a swappable transport; see Multiplayer |
| Audio | Synthesized in the browser (Web Audio). There are no sound files. |

### Run and build

```
pnpm install          # or npm install
pnpm dev              # dev server on http://127.0.0.1:5173
pnpm test             # all unit tests
pnpm build            # production build into dist/
```

Dev-only URL shortcuts:
- `?play=1&weapon=static|rifle|shotgun&map=deadwater|tutorial` starts straight into a match.
- `&course=basics` picks the basics tutorial.
- `&start=<buildingId|farm|propType>` spawns somewhere specific.
- `&peerhost=127.0.0.1:9000` uses a local PeerJS signalling server for online play.

Player-facing links: `?join=CODE` joins a room, `?host=1` opens one.

**Claude artifact build.** This is a single self-contained HTML page for claude.ai. `vite.artifact.mjs` builds without code splitting. A small bundler script then inlines the JS and CSS into one file that is published as an artifact. The artifact host provides its own page shell, so viewport settings in `index.html` may not apply there.

**Version:** `src/version.js` is the one place the version lives (`0.66a`, the a is alpha). The browser tab reads `deadshift v0.66a` (`TAB_TITLE`); keep `index.html`'s `<title>` in step when it changes.

## Where the code lives

There are three copies. Know which one you are in.
- **GitHub `main`**: what players get on GitHub Pages.
- **The owner's PC** (`E:\ai slop games\game1`): his git checkout. Changes reach it as patch files in `Claude outputs/`, applied with `git am --3way`.
- **A Claude working copy**: where most recent work happens. It is uncommitted until the owner asks.

## Folder structure

Files are grouped by what they do; a module keeps its name when it moves, so
"`renderer.js`" in these notes is `src/render/renderer.js`. `find src -name x.js`
finds anything.

```
index.html          all menu, HUD, settings and panel markup (and the loading screen)
CHANGELOG.md        player-facing notes per release, newest first: add a section with every version push
src/                game code, one job per module
  main.js           entry glue: game state, keyboard/mouse/touch input routing, the fixed-step loop, menus flow
  bootstrap.js      loads the game behind the loading screen
  simulation.js     the rules: one Simulation object, stepped at 1/60 s from an input list
  settings.js       presets (GRAPHICS), saved settings, adaptive resolution, render budget
  audio.js, items.js, maps.js, map-kit.js, crops.js, tutorial*.js, viewport.js, version.js,
  aim-assist.js, aim-damping.js, auto-range.js, keyboard-aim.js, target-lock.js, target-radius.js,
  box-index.js, playable-area.js, storage-migration.js, online-play.js, remote-players.js
  config/           EVERY tunable: gameplay.js (movement, Static/orbs/hex RULES, RIFLE, SHOTGUN, GRENADE,
                    aim assist), controls.js (touch feel), network.js, match.js
  maps/             one file per map (plain data)
  net/              online play: transports, protocol, host and client sessions
  render/           the 3D view: renderer.js (WorldView), crisp-output.js, extreme-post.js,
                    extreme-surfaces.js (ground detail, weathering, cloud shadows), shader-savings.js,
                    interior-visibility.js, frozen-transforms.js, bake-colors.js, arc-batch.js,
                    blob-shadows.js, camera-framing.js, shadow-snap.js, map-look.js, pick-view.js, ...
  effects/          effects-detail.js (DetailFX), electric-effects.js (Static arcs and pooled pulses),
                    dust-trail.js, dust-devils.js, birds.js, blood-*.js, gore.js, death-*.js,
                    surface-marks.js, target-damage.js, remote-corpses.js
  world/            what the map is built from: world-details.js, roadside.js, rail-depot.js,
                    interior-details.js, detailed-interiors.js, building-finishes.js, crop-view.js,
                    approach-paths.js
  weapons/          rifle*.js, shotgun*.js, grenade*.js, ballast-damage.js, weapon-photos.js (tools only)
  ui/               menus, HUD and touch: title-screen.js, menu.js, settings-panel.js,
                    mobile-settings.js, touch-controls.js, touch-layout.js, weapon-hud.js,
                    ability-hud.js, aim-overlay.js, health-hud.js, damage-feedback.js, death-screen.js,
                    lobby-*.js, dev-*.js, map-cards.js, dom-writes.js (cached HUD writes),
                    haptics.js (touch vibration), wake-lock.js (screen stays on in play), ...
  styles/           style.css (base), menu-theme.css (menus, HUD), mobile-controls.css, tutorial.css,
                    loading.css
  assets/           shipped pictures (thumbnails, weapons)
tests/              one test file per system (node:test)
tools/              dev-server helpers (dev server up unless noted):
                    smoke.mjs         every preset, prints console errors (expect none)
                    program-check.mjs shaders linked during play (Static X, blasts); expect none
                    perf.mjs          main-thread cost per frame by phase; PROFILE=1 adds a profile
                    draw-count.mjs    draws per frame on a served build
                    capture-thumbnail.mjs / capture-weapons.mjs remake the menu pictures
.github/workflows/  Pages deploy
vite.config.js      normal build; vite.artifact.mjs is the single-file artifact build
```

## Major systems

### Simulation: the rules
- **Sight lines** (`canSeeEntity` → `sightBlocked`): only the colliders that block sight, cached per collider list, each rejected by its world bounds before the slab test. Target lock and aim assist ask three rays per target per step; `lockCandidates` (main.js) now tests range and screen first and sight last.
- **Files:** `simulation.js` holds the rules; their numbers are `RULES` in `config/gameplay.js`. The weapon rules are in `rifle.js`, `shotgun.js` (+ `shotgun-pressure.js` visuals, `ballast-damage.js`) and `grenade.js`. Maps and colliders are in `maps.js`, crops and fire in `crops.js`, and `playable-area.js` holds the map bounds.
- **How it works:**
  - `sim.step(input)` advances one fixed 1/60 s tick from a plain input object (move, aim, fire, dodge, abilities).
  - It pushes **events** (`hit`, `kill`, `propBreak`, `dodge`, and so on) that the renderer, audio and HUD react to via `sim.drainEvents()`.
  - It knows nothing about three.js or the DOM.
- **One player per sim** (`sim.player`). Multiplayer keeps it that way: one sim per player sharing one world through `net/arena.js` (see Multiplayer). `respawn(at)` gives a fresh body and loadout without touching the world; `worldAuthority` says whether this sim burns crops.

### Movement
- **Where:** `simulation.js`. Speed, acceleration, braking and dodge values are in `RULES` (`config/gameplay.js`).
- **Keys** (`GAME_KEYS` in `config/controls.js`; everything that reads or names them goes through it: main.js, rifle-input.js, items.js controls/hints/touch bindings, tutorial.js, ability-hud.js, Settings > Controls): **Space (or LMB) shoots**, **E is the weapon's other action** (Static places orbs, Nominal grenade, Ballast double shot), **Left Ctrl dodges**, Q does nothing in a fight. Menus keep E confirm / Q back. From the moment a game starts, in every state, Ctrl shortcuts are blocked by a capture-phase keydown listener (Ctrl+D bookmark was firing while moving with D; Ctrl+wheel zoom too; text fields excepted), and since the browser keeps Ctrl+W/T/N, leaving the page mid-game asks first (`beforeunload`).
- **Dodge:** costs stamina. Distance `RULES.dodgeDistance` 3.5 m (was 3.2). Nominal gets 3 charges, Static 2, Ballast 1. A dodge breaks through breakable props.
- **Dodge input buffer:** a dodge pressed up to `RULES.dodgeBuffer` (0.15 s) before it can happen (mid-dodge, a hair short of stamina) goes off the moment it can, instead of being dropped.
- **Direction-only aim** (arrow keys, WASD fallback, walking on touch) turns quickly with a little weight: `keyboardAimResponse` 9, `keyboardAimMaxTurn` 10 rad/s, `keyboardAimSpinUp` 24 in `RULES` (a quarter turn in about 0.25 s, a half turn in about 0.4 s). The touch move stick eases direction changes over `MOVE_STICK.smoothing` (0.055 s).
- **Target lock for players without a mouse** (`target-lock.js`, wired in main.js: `lockMode`, `lockCandidates`, `lockTarget`). Keyboard-only aim, and touch (unless aim assist is off in Settings > Mobile). **Idle by default:** aiming is the ordinary kind (arrows or walking turn the aim, a finger drags the cursor). Candidates are alive, visible (`sim.canSeeTarget`: not under another building's roof; from indoors only out through doors and windows, the same sight lines as the dark interior shading; not behind sight-blocking cover), on screen and within 18 m; online only other players.
  - **Keyboard:** arrow directions are taken from where the cursor (aim dot) is now. From idle, an arrow press locks onto the target that way from the cursor; with none that way it just aims as usual. While locked (the cursor is on the target), an arrow moves to the next target that way; with none that way the lock lets go and the arrow turns the aim as usual.
  - **Touch:** a swipe on the aiming side is an arrow press. The cursor never jumps under the finger. From idle, a 42 px swipe locks onto the target that way from the aim dot; with none that way, the rest of that drag moves the cursor by the finger's movement (trackpad style). While locked, a swipe moves to the next target that way (one per swipe, another every 140 px of a long drag); none that way goes idle. A tap fires at the locked target (idle: at the tapped spot).
  - Consistency: offline (practice targets), once the aim arrives on the target it stays exactly on it. **Online (players) it chases instead** (`chase` in `update`): the point moves at most `chaseSpeed` 5.5 + `chaseCatchUp` 3 × (metres behind) m/s, so a walker is kept up with but a player running flat out (7.2 m/s) or dodging pulls ahead and the aim lags. Held arrows push the point that way at `nudgeSpeed` 7 m/s (at most `nudgeReach` 2.5 m past the target) so a skilled player leads by hand; online an arrow with no other target that way keeps the lock (it is leading, not letting go). Touch gets the chase without the nudge. A locked target briefly out of sight (a post, a doorframe, the screen edge; `hold` 0.6 s, alive and within 1.2x range) keeps the lock. If it dies or breaks, or stays hidden longer, the nearest other candidate takes over; with none left it goes idle.
  - The aim point sweeps to a new target on a critically damped spring (`glide` 0.09 s smooth time: eases in and out, keeps its speed if the target changes mid-sweep), and while locked the body faces the sweeping point directly, so body, cone and dot move together. From idle a target just beside the cursor still counts as "that way" (2 px). The sim's aim assist is off while locked (the input already points at the target). A mouse never uses it. `#world` has `touch-action:none` so a swipe is never taken as a page pan.
- **Aim assist** (`aim-assist.js` + `auto-range.js`, numbers in `AIM_ASSIST` / `AUTO_RANGE` in `config/gameplay.js`). Levels: **touch** strongest (finger, walking or stick; can be turned off in Settings > Mobile, `settings.aimAssist`), **keyboard** lighter, **mouse none** (`assistMode()` in main.js).
  - Only visible targets count (`sim.assistTargets()` → `canSeeTarget`, range check first).
  - Acquire: the player's own aim roughly points at a target (acquire cone, `AUTO_RANGE.halfAngle`). Players rank first; practice targets stand in for players.
  - Range: the aim reach slides out to the target (a finger's own point is overridden while locked).
  - Stick: the aim is bent toward the target by `pull` every tick, so strafing or a moving target does not drag it off. Movement never breaks a lock (only `hold`, death or range does).
  - Let go: turning your own aim away builds `resist`; the pull fades with it and at `release` the lock drops, and that target is ignored for `cooldown` unless you aim straight back (`reacquire`).
  - The aim dot turns **red** only when the dot is visibly over a target you can see: inside its on-screen outline from feet to top (`aimOnTarget` in main.js, `.reticle.on-target`). A lock alone does not turn it red. While locked on touch the dot shows the assisted aim, not the finger.
  - Online the host runs it with the joiner's input (`autoRange` travels in inputs), so it is the same for everyone.

### Weapons
- **Static** (`simulation.js`, visuals in `electric-effects.js` + `arc-batch.js`):
  - Hold E to place orbs, LMB/Q to launch a volley or a quick shot.
  - C is the lightning stream.
  - X deploys the hex, and X again pulses it (Hex Pulse).
  - The orb count sets volley damage (`ORB_VOLLEY_TOTALS`).
- **Nominal** (rifle; `rifle.js`, `rifle-view.js`, `rifle-pose.js`):
  - LMB/Q fires: tap for single shots, hold for auto.
  - RMB/Shift aims in.
  - R reloads (20 rounds). X loads a 40-round magazine (60 s cooldown). 22 damage per bullet (16 at the far falloff), one shot every 0.165 s. All menu/tutorial/HUD text reads these from `RIFLE` in config/gameplay.js.
  - E throws a grenade (`grenade.js`).
  - **Hip-fire recoil:** each hip shot knocks the whole cone slightly off line at random (`kickRifle`: up to `RIFLE.recoilKick`, building over a burst via `recoilBuild`, capped at `recoilMax`, settling at `recoilSettle`/s). Bullets fly along the knocked cone and the HUD brackets (aim-overlay.js) draw it there, so the guide shakes a little while firing and stays honest. Aimed in (RMB/Shift) adds none and settles fast (`recoilSettleAim`). `sim.rifle.sway` / `kick` travel with the rifle state online.
- **Ballast** (charge shotgun; `shotgun.js`, `shotgun-view.js`):
  - Hold LMB or Q to charge, release to fire.
  - Shift or RMB stores the charge.
  - E fires both shells. R reloads (2 shells).
  - Each shot **launches the player backward** through `blastVX/blastVZ` + `ballastLaunch`, and a launch smashes props on contact.
- **Deaths:** `death-reactions.js`, `death-view.js`, `death-corpse.js`, `death-bones.js`, `ballast-blood.js`, `gore.js`, `remote-corpses.js`.
  - **The death shot:** the camera zooms onto the body over `DEATH_ZOOM` (2.2 s) and then holds still on the gore; the death screen comes in at `DEATH_MENU_DELAY` (2.6 s), on the right (at the bottom on narrow or portrait screens), and the held frame slides so the body sits in the open half (`cameraFrame(aspect)`), so you can look at what is left of you while the respawn counts down.
  - **Gore** (`gore.js`, low-poly and flat-shaded like the world; amount by `GORE_DETAIL` per preset): wounds go on the side that faced the killing hit, which is the side facing up once the body has fallen. Gunshot/Ballast: a soaked chest, entry wounds with torn flesh, blood runs down the coat. Impact: a soaked, torn patch. **Electric (charred):** a cracked char texture whose seams glow orange and cool to dull red (`charMaterial`, emissive map), the chest burst open with the ribs showing, the skull through the face, a forearm burnt to the bone, embers. **Fire (skeleton):** charred and seared flesh left on the bones (`skeletonRemains`); **not always a whole skeleton**: about half the time 1 to 3 limbs have snapped (two pieces askew with splinters) or one is gone, and about 45% of the time the skull cracked open (knocked askew, fragments) and the **brains lie on the floor past the head** (`spilledBrains`: two pink folded hemispheres, groove, torn bits, wet smear). **Explosion:** `GoreBurst` throws severed limbs (cloth, ragged red end, bone sticking out; a boot or a hand), a torso piece with ribs and flesh chunks with the bones and organs.
  - **Draw cost:** every gore piece is merged (`compact`: one lit and one unlit vertex-coloured mesh; shared source geometry untouched, merged geometry freed with `disposeMerged`). A dressed corpse is 2 extra draws; a burnt skeleton becomes 2 draws once it has fallen (1.1 s), an explosion's bones/organs and `GoreBurst` pieces become 2-3 once landed (2.4 s); the scatter pool is one mesh. Wall and floor placement uses the collider boxes (`blood-surfaces.js`: `castToWall`, `floorHeight`), never a raycast into the merged world meshes.
  - **Dropped weapon** is darker (`darkenWeapon`: its own material copies at 60%).
  - **Other players' bodies** (`remote-corpses.js`): the same reactions from their `playerDeath` event, in their colours, built from a loose copy of their avatar (`RemotePlayers.looseBody`, head and legs tagged `deathPart` so headless/kneeling work), their weapon dropped beside them, darker. One per player (next death replaces it), cleared by a map reset (`clearDebris`) and `reset`.

### Rendering
- **`renderer.js` (WorldView):**
  - Builds terrain, roads, buildings with enterable interiors, props, crops and fences.
  - Draws each frame: camera follow with pixel snap (`camera-framing.js`), roof fades, interior vision shroud, particles and shadows.
  - Helpers include `world-details.js`, `roadside.js`, `rail-depot.js`, `interior-details.js`, `detailed-interiors.js`, `crop-view.js`, `birds.js`, `dust-trail.js`, `surface-marks.js`, `shadow-snap.js`, `interior-visibility.js` and `vision-polygons.js`.
- **Batching:** static meshes are merged per 24 m cell (`batch()` + `merge-transformed.js`).
  - Plain flat-coloured materials are **baked into vertex colours** so different colours share one draw.
  - Roofs are never baked: they fade their own materials.
- **Reusing geometry:** reuse existing geometry, materials and pools rather than allocating per frame. `arc-batch.js` draws every electric arc in 4 calls.
- **Frozen transforms** (`frozen-transforms.js`): the scene's own matrix update is off, and the static roots (buildings/scenery, ground cover, quality details) plus every breakable prop group are frozen: their world matrices are computed once and three.js skips walking them each frame (~0.86 → ~0.28 ms of matrix work here). A prop group that moves (hit wobble, restore grow-in) calls `updateMatrix()` on those frames only. **Anything added under a frozen root never animates;** give moving things their own group under the scene.
- **Merged characters:** the player's body merges into a few meshes (legs, head and the rest, keeping `deathPart` tags for death reactions; the gun and Static arm stay separate because they move and hide), and each target's board is one mesh. `batch()` keeps parts with different `deathPart` apart.
- **Shader warm-up (no first-use hitches)** (`warmPrograms`, `warmRack` in renderer.js). Every shader any preset, weapon or event needs is built *and drawn once* behind the loading screen, so no orb, grenade, blast, arc, death or building entry builds one mid-fight (checked: zero programs created or first used during play on all 5 presets x 3 weapons, with buildings, damage, death and respawn). How:
  - The weapon views (`RifleView`, `ShotgunView`, `GrenadeView`) are made in the constructor, before the warm-up, not on the first frame.
  - `warmRack()` adds a tiny stand-in for each material the view holds that nothing shows yet (walks the view's fields; skips shadow-pass depth/distance materials) plus the kinds a blast or thrown grenade makes on the spot (basic transparent/additive/double-sided, smoke, Lambert flat and smooth), each also in its indoor-clipped variant. Their materials are **kept**, not disposed: disposing the last user of a program destroys it and the real effect would build it again.
  - The pass shows every non-light object (hidden pools, the grenade in the hand) with culling off, compiles, then **draws once into a 1-pixel scissor**. A draw, not only a compile: a shader's first draw is where the driver is made to finish it and where the shadow pass builds its depth variants. Lights are left alone (their count is part of every shader). The indoor-clip variant is applied to the particle pools, effect pools and the arc batch first.
  - On Extreme the scene draws into the composer's linear target, and output colour space is in every shader key, so the warm-up draws into `post.composer.readBuffer`, and runs again when the post pipeline finishes loading.
  - Production builds set `renderer.debug.checkShaderErrors = false` (reading a shader's log forces the driver to finish it mid-frame); dev keeps it and logs a failed warm-up to the console.
  - On Extreme the warm-up also draws the scene through the AO pass's normals material **with the pass's own exclusions** (`ao._overrideVisibility()`: it hides lights, lines and points, and the light count is part of every program key). Without that, each effect pool's first appearance built an AO normals program mid-fight (the first Static X).
  - **Pooled effects** keep their materials, so no program lookup, interior patch or compile happens when they fire: Static X pulses (`ElectricEffects.takePulse`/`prewarm`, 8 built at load) and blasts (`WorldView.takeBlastKit`/`prewarmBlasts`: ring, core, four puff materials and the puffs so far, up to 8 kits kept; a preset change empties the pool because the smoke material's kind follows the preset). A new pooled effect should follow the same shape and hand its meshes to the warm-up rack.
  - Known gap: on Extreme, the AO pass's normals shader for the death effects is built at the first death (one shader). DeathView builds its meshes on first use.
  - To check after adding an effect: `node tools/program-check.mjs [quality] [weapon]` (dev server up) plays two Static X presses and orb blasts and lists every program linked after load with the object that needed it. Expect none.
- **Frame-rate savings that keep the picture identical** (checked by pixel diff of frozen frames, and `tests/render-savings.test.js`):
  - `shader-savings.js` patches three.js's shader source at import (renderer.js imports it first). **Shadow early-out:** three 0.180 filters shadows by hand, 17 shadow-map reads per pixel on PCF (Performance/Balanced) and 16 on PCF Soft (Quality/Extreme), on every receiving pixel including the whole ground. It now reads the filter's corners and middle first and only reads the rest when they disagree (a soft edge); the probe reads are reused, so edges are exactly as before. **Dark effects light:** `fxLight` stays in the scene (its count is in every shader) but its lighting is skipped while its colour is black (a uniform test, free on a GPU). Re-check both on a three.js upgrade: in dev the module throws if three's code no longer matches.
  - **Empty draws skipped** (a wrapper on `renderer.renderBufferDirect`): instanced effect pools with no instances and batches with an empty draw range were bound and drawn every frame, about a quarter of all draw calls. The warm-up sets `drawEmpty` so the pools still get their shaders built at load.
  - **One draw per rigid part** (`bake-colors.js`, `bakeColors`): parts' colours move into vertex colours on one white material of the same kind. Rifle 15 draws → 1; Ballast about 35 → 4 (body, swinging barrels, each shell); each roof about 5 → 2 (casters and shingles), one fading material per roof. Child groups (moving parts) are left alone.
  - **Ground drawn last, top layer first** (`orderGround`, renderOrder .5–.95): after the buildings and props on it, and the map's ground before the wide slab under it, so a GPU's depth test skips covered ground pixels instead of shading them. Surface marks (-1) and crops (-2) still draw before it, sand marks (1) after.
  - Draw calls on an ordinary frame (960x540 test): Performance about 122 → 92, Balanced 140 → 109, Quality 211 → 180.
  - Headless testing note: SwiftShader (CPU) runs both sides of a branch and has little early-z, so it cannot show the early-out, light skip or draw-order gains; measure those on a real GPU. Compare pictures with frozen A/B frames in one evaluate (render, toggle, render), never across runs: dust, birds and wind make separate runs differ by up to 25% of pixels.
- **Roofs:** the corner posts stop just under the eave and the front fascia and side-door lintels sit below the roof line (they poked through at the corners as small blocks). Each roof has seeded wear (by building id, the same every game): a few missing shingles showing the dark underlayer, lifted shingles, a newer board patch; on metal, rust patches and a lifted sheet end. It uses only the roof's own colours.
- **Target damage** (`target-damage.js`, `DAMAGE_STAGES`): two kinds that never mix. **Bullet damage** only from real bullets (Nominal rounds, Ballast pellets carry `bullet: true`; `sim.hit` counts `target.bulletHits`, zeroed on respawn): holes with pale chipped rings in a board, dark punctures with straw tufts in a dummy, one batch per two hits (`HITS_PER_BATCH`). **Breaking** by health lost to anything (the C stream, orbs, the hex, grenades, fire, any future ability; bullets too): a board gets gouges, cracks from the rim (branching when worse), splinters, then a split edge with a piece hanging; a dummy tears, straw bursts from the head and an arm and spills at its feet. Balanced 2 breaking stages (66%, 33%), Quality 3, Extreme 4 with twice the pieces; on Quality and Extreme each new stage also throws debris off the target (`set` returns the stages just broken; renderer `TARGET_DEBRIS` chunks). Built the first time a target is hurt (and again if the preset changes), seeded by its id, each stage and batch merged into one or two draws (`compact`); hidden again at full health. Potato and Performance show none. **Facing:** every target and dummy is turned by `targetYaw(id)` (seeded, within about 60 degrees either side of the camera, never turned away, so its face reads from above).
- **Blob shadows** (`blob-shadows.js`): Potato has no shadow map, so soft patches under props, the player, targets and other players stand in for it, leaning the way the sun throws the real shadows. Two draws.

### Map look (light and haze per map)
- **Where:** `map-look.js`. `BASE_LOOK` holds the default sky/bounce hemisphere light, the sun, and the dust haze (fog + clear colour). A map overrides any of it with a `look` block in its own data, next to `palette` (e.g. `look: { warmth: .15 }` or `look: { sun: '#ffd9a0' }`). `mapLook(map)` gives the finished colours and the renderer builds its lights and fog from them, so a new map needs no renderer changes to get its own mood.
- **Warmth** pulls light toward amber (red stays, green eases, blue drops most) in proportion, so brightness barely moves. Deadwater, Dry Creek and the training range are all `warmth: .15`.
- Only the world's lights and haze change: the HUD, menus and unlit effects keep their colours. Every preset lights the world with these lights, so it applies to all of them. Extreme's grade pass sits on top as before.

### Graphics presets
- **Crisp output (Performance, Balanced; `crisp-output.js`):** the world is drawn off-screen at the tier's usual internal size (same cost as before), then one full-screen triangle writes it to the canvas at a higher output ratio (`CRISP`: Performance up to 1.5x CSS, Balanced up to 2x, each capped in total pixels). Performance's pass does FXAA-lite (it had no antialiasing: stair-stepped, crawling thin lines); Balanced keeps 4x multisampling, now on the off-screen buffer (the screen context is created without it for these tiers). Both add contrast-limited sharpening scaled by the stretch (none at 1:1, clamped to the neighbourhood so no halos), fixing the soft look of the browser's plain stretch. Colours are unchanged: the buffer is flagged `isXRRenderTarget` so the scene's shaders tone map and encode sRGB as for the screen, stored as plain RGBA8 (an sRGB format would encode twice) and copied as is. Adaptive resolution now resizes only the off-screen buffer, never the canvas. The camera's pixel snap uses the off-screen height. A tier with antialiasing (Quality) on a page that started without screen multisampling also goes through it (4x, no stretch). Potato and Extreme draw as before. The pass's draw adds to `renderer.info` rather than replacing the frame's count.
- **No blank frames:** adaptive resolution never resizes the canvas between a draw and the screen showing it (a resize clears the canvas, which showed the brown page colour for a frame every time the scale stepped). `setResolutionScale` only records the new scale; `render()` applies it right before drawing. A window resize draws straight away. A lost WebGL context (phones out of GPU memory) stops drawing until it returns, then rebuilds the shadow map and Extreme's buffers; two losses within a minute on Extreme step down to Quality with a notice.
- **Low input lag (frame pacing):** after each frame a WebGL 2 fence is set (`fenceFrame`); while the GPU is still drawing the previous frame, main.js skips drawing this one (`gpuBusy`, `RenderBudget.hold`) instead of queueing it, so the next frame is drawn from fresher input. The game and input keep running; waits are capped at 120 ms. The aim dot updates every display frame, drawn or not.
- **Adaptive resolution:** Performance and Balanced may drop to 70%, Quality to 85%, Extreme to 80% (`ADAPTIVE_FLOOR`). Still short of the target at the floor, the tier is *strained* (`setStrain`): shadows redraw at two thirds of their rate, and on Extreme the AO runs at 38% scale with a lighter denoise and bloom a size down. It lifts after 4 s of healthy frames.
- **Faded roofs:** inside a building, or stepping through one of its doorways under the eaves (`roof.reach` bounds, `roof.doors`), its roof fades right out (about 0.1 s); the roof switches to its see-through shader a few steps before a door (`doorGap < 3`), not on the threshold, where the switch and the driver's first draw of it stalled big roofs (the freight hall, the west depot) as the player walked in and is then not drawn at all (`roof.group.visible` off below 1.5%). It used to rest at 9.5% as a faint ceiling, but on some real GPUs that rendered far heavier, shingle rows and all (seen on the workshop in two sessions; SwiftShader never showed it). During the fade a roof lays down its depth first (depth-only copies, render order 50) and then its colour (51), so overlapping surfaces are painted once; that relies on two shaders giving identical depth, which drivers don't guarantee, hence the full fade-out.
- **Where:** `settings.js` → `GRAPHICS`. Five presets: **Potato, Performance, Balanced, Quality, Extreme**.
- **Extreme** is Quality plus, never minus (a test enforces "never less of anything"):
  - **Post-processing** (`extreme-post.js`, loaded only when Extreme is picked, disposed when it is left): half-resolution GTAO ambient occlusion (eased down to 0.4 indoors so rooms keep their warm light), bloom on near-white effects only (soft-knee, capped so the Static stream glows instead of whiting out), and one grade+sRGB pass. The scene is still tone mapped per material while drawn (the composer's buffers are flagged as output targets), so effects that skip tone mapping keep their exact colours. The AO draws its own depth/normals without glows, particles, lines, faded roofs, birds and ground cover (`WorldView.aoExcluded`). Reusing the main depth instead was tried and dropped: lopsided AO and grey screen edges.
  - **Surfaces** (`extreme-surfaces.js`, shader injection behind an `EXTREME_SURFACE` define so other presets compile the old shader): world-space ground variation and pebbles against the 4 m tile repeat; dust on the lowest half-metre of objects, streaks on walls, worn patches on roofs and tops.
  - 4096 shadow map at 60 updates/s; 2048 ground texture; anisotropy 16; cylinders built with twice the sides (applies to the map as loaded; switching to Extreme mid-game keeps the models).
  - Lit, flat-shaded birds with coverts and primaries and a soft ground shadow thrown along the sun (`birds.js`, `rich`). Their lit colour is the unlit colour x .38 plus a little of it as emissive: brighter (.72) washed them into the warm ground under Extreme's sun and grade.
  - Long tapered rifle tracers (`RIFLE_QUALITY.extreme.trailLength`), more sparks/smoke/impact debris, denser arcs (`ARC_DETAIL.extreme`), more dust, blood and blast smoke, a 400-per-colour particle pool.
  - Adaptive resolution may lower Extreme to 80% when frames drop; Quality stays fixed.
  - **Cloud shadows** (`extreme-surfaces.js`, `CLOUDS`): soft shadows of high clouds, about 50 m across, drift east over the whole map (with the tumbleweeds' wind). They dim only the sun's light (`exSunLeft` after `getDirectionalLightInfo` in the lights chunk), so shade stays shade. `tickExtremeSurfaces(elapsed)` from `WorldView.update`. A few noise reads per pixel, no pass.
  - **Dust devils** (`dust-devils.js`, `DUST_DEVIL`): every 35-70 s a whirl of sand lifts off open ground upwind and wanders across the view for 13-19 s, dying out against anything solid; not indoors. Made of DetailFX's own puffs and grit (a puff or chunk with `devil` set circles the devil's centre, climbing and widening): no new meshes, materials or draws.
- **Detail effects** (`effects-detail.js`, `DetailFX`, `view.fx`): one shared layer of sparks, embers, lumpy smoke/dust puffs, flashes, shock rings (round and hexagonal), light columns, grit and streaks, nine instanced draws in all, counts scaled by `FX_DETAIL` (Potato none → Extreme 1.8×). Hooked to gunfire (`muzzle`), impacts, explosions and grenades, Static contacts (`electric`), the X pulse (`hexPulse`), the C stream's contact points, orb-to-orb links (`ElectricEffects.onContact`, more links per strike on Quality/Extreme via `ARC_DETAIL.links/linkGap`), shells, footsteps and dashes, burning crops. Puffs thin out right around the player (`fx.clearZone`). Pools are shown during `warmPrograms` so their shaders compile at load. Views take `view.fx || NO_FX` so tests without a view still run.
- **Orb blast sizes** (`orbBlastScale` in `effects-detail.js`): each orb that lands makes the blast look one step bigger: 2-3 orbs a small pop, 4-7 medium, about 10 the full fireball, and 12+ a bit past that (it stops growing at 16). It shrinks what used to be a fixed size: smoke puffs, how far sparks, clods and embers fly, the flash brightness, the renderer's hit burst and the blast light. The outer ring only shows from 4 orbs up. The radius and damage come from the simulation (`explosionFor`) and don't change. Grenades pass no scale, so they keep their full size.
- **Ballast shells** bounce, skid and roll to rest on their side, trailing smoke; Extreme builds them with a crimp and brass rim. **Pellets past the red zone** fly on as cosmetic copies (`ShotgunView.ghosts`) until they hit something solid or run 34 m: no damage, nothing breaks.
- **Footprints on Extreme** are pressed prints (sole, heel, tread, a lip of sand) lit from the sun's side, and last 7 s.
- **Dust wisps** are flat drifting sheets that clear around the player and the aim point (never over the fight); Extreme has five.
- **Interior shroud** repaints on any frame the camera moved (it used to lag the walls on entering a room); **roofs** count as solid for AO until half faded, so a closing roof no longer shows the room's outline.
- **UI sounds** (`ui-sounds.js`): a clack on buttons, a lower falling one for back/close/Esc, on their own audio context so they work while the game is paused.
- **Blood when a player is shot** (`blood-drops.js`, `WorldView.bleed`, from `hit`/`kill` events with `targetKind: 'player'`, so every screen sees it for every player): a red spray of particles along the shot (instead of the pale hit burst) and drops that stain the floor, walls and crate sides where they land (walls from the collider boxes; a drop on a wall often runs to its foot too). **Not** for electric hits (Static's stream, single orbs, hex); Static's volley blast and grenades count and bleed `BLEED.blast` (2.6x) more (`blast` flag on the hit). **Bullets build up:** each hit on the same player within `BLEED.window` (1.4 s) bleeds `step` more, up to `max` (3.2x); several pellets in one tick share one burst. Hit events now carry `damage` and `blast`. All drops are instances of one quad (one draw), `DROP_CAP` per preset (90 to 1000, oldest first); a crate's drops go when it breaks (`dropProp` on `propBreak`); all go on a map reset or restart (`clearDebris`, `reset`).
- **Walking through blood** (`blood-wading.js`, you respawn clean: `WorldView.cleanPlayer` on respawn and restart): every player (you in renderer.js, others in remote-players.js, each with a `Wading`) walking through a pool (a death stain on the ground, a body, an explosion's pool: `WorldView.poolsOnGround`) soaks up `level` (1.6 per second while moving in it) shown in three merged stain stages on the body (`makeBloodStains`: boots; legs and coat hem; up the coat, shoulders, arm and hat brim, which is what the top-down camera sees; the brim's flecks are tagged `head` so a headless death leaves them out). It dries over 150 s and is gone on a respawn. For up to 8 steps after leaving a pool, each step leaves a red boot print, fainter each time, on the very same step as the print in the dirt and the same size and shape (renderer `updateFootprints` asks `Wading.takePrint()`; `BloodDrops.print` draws a sole-and-heel texture drawn with the dirt print's own formula, tread lighter, in its own instanced ring `PRINT_CAP`; indoors too; a map reset clears them). The hat gets more as it soaks (brim flecks from stage 2, more brim and the crown's top at stage 3), and so does the gun in the hand (`makeGunStains`: flecks on its top faces from its own bounds, rebuilt for each weapon, a few at stage 2 and more at 3). A body keeps the stains it died with (the corpse copies the visible stages).
- **Blood on death** (`blood-splatter.js`): every player death (yours, and every other player's online via `netEvent`) lays a splatter on the floor under the body, thrown along the killing hit: pool, lobes, streaks and droplets on one textured quad (three canvas shapes, shared), grows in over 0.35 s, stays 60 s, fades over 4 s. Capped per preset (`SPLAT_CAP`, Potato 6 to Extreme 20), oldest first. Not cleared on restart or respawn. **Balanced and up** (`FINE`): 512 px textures (256 below), a fine mist of droplets, a wet highlight and a drying rim; more flying drops (scatter 80/120/160, Ballast 40/60/80). **Blood on walls:** along the hit (and 20 degrees either side; all round when there is no direction) the nearest fixed wall (collider taller than 1.5 m, not a prop) within 2.4 m; the nearest takes a vertical splat (spray with runs dripping down, bigger when closer), owned and faded like the floor stain.
- **Muzzle light:** rifle and Ballast shots flash the existing effects light (warm, a few hundredths of a second) on every preset that has it; no new shader variants.
- **Defaults:** phones default to Performance, desktop to Balanced.
- **What the presets set:** pixel ratio and scale, shadow map size and refresh rate, particle caps, textures and bump relief, and which detail layers are shown.
  - Performance: 768 shadow map (was 512), 256 ground texture (was 128), two-thirds of the ground cracks. Potato: blob shadows (see Rendering).
  - Dense ground cover is only built on Balanced and above; it's built on demand if you raise the preset.
- **Adaptive resolution** (`AdaptiveResolution`) lowers the 3D buffer on Performance and Balanced when fps drops. On the crisp tiers a step reallocates nothing: the off-screen buffer stays at the tier's full internal size and the world is drawn into a corner of it (`CrispOutput.setScale`: the target's viewport and scissor, and the output pass's `area`/`areaMax` uniforms, which keep every read inside the drawn corner as the edge clamp did). A step used to reallocate the canvas and the multisampled buffer, a stall of its own every time the tier was already struggling. Non-crisp tiers still resize, once (`setDrawingBufferSize`, skipped when the size is unchanged: setting a canvas's size clears and reallocates it even then).

### UI
- **Cheap HUD writes** (`ui/dom-writes.js`: `setText`, `setStyle`, `setAttr`): the HUD rewrote dozens of identical values every tick, each a DOM mutation and style recalculation. These remember the last value written through them and skip repeats; always write a given property through them or the memory goes stale. Damage numbers, outgoing totals and the rifle brackets move by `transform` alone (left/top stay 0), not left/top (layout per frame). The damage numbers read the cached `viewWidth()`/`viewHeight()`, not `clientWidth` (a forced layout per frame).
- **Touch layout editor** (`touch-layout.js`): its toolbar lives in the top quarter the controls may not use: EDIT CONTROLS, an icon legend (move, size, back to corner, hide), and SWAP SIDES / RESET / DONE as pills (DONE filled); one row in landscape, words over buttons in portrait. A picked-up control gets a solid outline and a shadow, the phone ticks (`navigator.vibrate`) on pick-up and drop, and a control dragged within 3% of an edge settles on it (`snapToEdges`, `EDGE_SNAP`). Settings > Mobile puts the layout tools first (EDIT LAYOUT filled, the three side by side), then TOUCH PLAY: opacity, aim assist, vibration, full screen.
- **Vibration** (`ui/haptics.js`, setting `vibration`, on by default, touch only): a short buzz when hurt (longer from 40 damage up) and a quick double on a kill; at most one buzz per 120 ms. iPhone Safari has no vibration and ignores it.
- **Screen stays on while playing** (`ui/wake-lock.js`, `keepAwake(running && !deathActive)` on the HUD tick): the Screen Wake Lock is taken in play and released in menus, on pause and on death; a refused request is not retried for 5 s.
- **Loading screen** (`index.html`, `styles/loading.css`): the title screen's word (same letters and stretch, version above) with a still of the blood already in the letters and a few drips; the pink wheel below.
- **Touch cluster labels**: each segment's label sits at its middle (the average of its corners and centre line, `arrangeTouchCluster`), so the end segments, cut straight by the screen edge, keep their word whole. Nominal's grenade button reads NADE on touch (items.js `touchButtons`); the keyboard hint still says GRENADE.
- **HUD control hints** (keyboard): a long binding (LMB / SPACE) wraps inside its column instead of running into the next.
- **Settings > Controls:** the HUD-hints switch, then two dropdowns, closed when Settings opens: General (the shared controls) and Weapons (a dropdown per weapon). Each weapon's rows are `controls` on its entry in `items.js`, so a new weapon brings its own.
- **Menus:** `menu.js`, `menu-navigation.js`, `select-menu.js`, `button-typography.js`. The settings panel has tabs for Graphics, Audio, Controls and Mobile (`settings-panel.js`, `mobile-settings.js`).
- **Gamemodes page order:** 1V1, MULTIPLAYER, TUTORIAL, PRACTICE. **1V1** (`#duel-mode`) is only a button for now: nothing is wired to it yet. **Owner's plan: every gamemode outside MULTIPLAYER (1V1 and any others added there) is singleplayer against AI (bots) until at least the beta**, when dedicated servers and online versions will be considered. Only MULTIPLAYER is online.
- **Screen size** (`viewport.js`): `viewWidth()` / `viewHeight()` are the #game box, cached and forgotten on any resize (window, visual viewport, orientation, ResizeObserver): reading clientWidth every call forced a layout mid-frame after HUD changes.
- **Button lettering is fitted before the first paint** (`button-typography.js`): the fit runs inside the ResizeObserver and MutationObserver callbacks (after layout, before paint), not a frame later, so a page appears with its stretched lettering already in place. Labels and map captions not fitted yet are `visibility:hidden` (menu-theme.css), so plain text is never shown.
  - **Same letter width side by side:** buttons that share a parent (a tab row, a menu page, the pause card, the title buttons) share one horizontal stretch (as a width-to-height ratio), the narrowest any of them needs to fit, capped at the usual .86. So a short label (AUDIO) is never fatter than its long neighbour (CONTROLS). Centred buttons (`text-align:center`, e.g. the settings tabs) keep a narrower label centred; the others stay on their side. Touch controls are fitted one by one.
- **HUD:** health bar top centre on desktop (260-400 px wide, 15 px track), top left on touch landscape (230-320 px), top centre on touch portrait (up to 300 px); `weapon-hud.js`, `health-hud.js`, `ability-cooldown.js`, `damage-feedback.js`, `outgoing-feedback.js`, `perf-readout.js`, `overhead-map.js` (M).
- **Damage numbers add up:** damage you take is one running number (`damage-feedback.js`): -50, -100, -150 while hits keep coming (a new number after `STACK_WINDOW`, 1.5 s, of no damage); burns grow it on `BURN_BEAT`. Damage you deal is one running total per target (`outgoing-feedback.js`, with the latest hit shown under it). Each time a figure grows it pops back in where it is with a fresh tilt leaning the other way (`damageFeedbackScale` from `bumped`, `damageFeedbackTilt(previous)`). Online it is the same for every player: each client draws its own taken and dealt numbers.
- **Cursor and aim overlay** (`aim-overlay.js`): with a mouse, the aim dot is the only pointer, over the UI too. UI clicks never reach the game.
- **Charge ring** (`aim-overlay.js`): Ballast charge and Static hex expansion show as a ring around the cursor. Ability dials and stamina: `ability-hud.js`.
- **Touch** (`touch-controls.js` + `touch-layout.js` + `touch-action.js`, feel in `config/controls.js`; `main.js` decides what taps and drags do):
  - A **floating move stick**: drag anywhere on the left half. Walking also steers aim. It lets go on a lift anywhere on the page, when no finger is left on the screen, or when the page loses focus (a lost lift used to leave walking stuck); held buttons and the aiming finger reset the same way.
  - A **tap** anywhere fires at that spot, and a drag never fires.
  - FIRE is a quarter circle in the corner, with the other actions as ring segments around it (`arrangeTouchCluster`; sizes in `TOUCH_CLUSTER`: FIRE 138 px, ring 76 px).
  - **Aim-down-sights weapons** (`adsFire` in items.js, Nominal only; body class `ads-fire`): AIM moves to the bottom end of the ring with a wider arc (`aimWeight`), and the bottom slice of FIRE (`adsFireDegrees`, about a third) becomes **AIM + FIRE** (`#touch-aimfire`), which aims and fires together; the rest of FIRE hip-fires. Mirrors with Swap sides. Ballast is left out because its AIM stores the charge. If FIRE is dragged out in the editor the slice goes away and FIRE is whole.
  - Settings > Mobile holds Edit layout (dragged buttons become free circles), Swap sides and Reset.
  - **From the menus too:** outside a match, Settings > Mobile > EDIT LAYOUT hides the menus and renders one still frame of the map where a match opens (`openLayoutPreview` in main.js; body class `layout-preview` hides the HUD), then edits the controls over it; DONE returns to Settings > Mobile.
  - While editing, each dragged-out button has three handles: × removes it, ↘ resizes it, and ↺ puts just that button back in the corner cluster. It is forgotten from the saved layout (`withoutControl`), so it rejoins the cluster on the player's side: bottom right normally, bottom left with Swap sides. `restoreCluster` (main passes `arrangeTouchCluster`) lays the cluster out again afterwards.
- **Death screen** (`death-screen.js`, one for solo and online): the red wash, DEAD, and a respawn countdown with a draining bar. Solo practice: the screen comes up 1.2 s after dying and you respawn at the map's spawn 5 s after the death (`RESPAWN_TIME`), the world as you left it and your body left where it fell; buttons RESPAWN NOW, CHANGE WEAPON (the weapon page for this map), RESTART (the whole session), MAIN MENU. Online variants: see Multiplayer.
- **Pause menu layout:** its visible buttons alternate left/right aligned, set each time it opens (`layoutPauseMenu` in main.js), so a button appearing or hiding keeps the pattern. **Solo practice (not the tutorial) has RESET MAP** (`#pause-reset-map`, after RESTART; two presses): `Simulation.resetWorld()` puts props (quiet `propRestore`), colliders, crops and targets back and sends `mapReset` (blood, drops, marks and bodies cleared); the player and weapon stay, and the game resumes. **It also has CHANGE WEAPON** (`#pause-weapon`, after RESUME): it opens the weapon pick untimed with a BACK button (back to the pause menu); GO swaps the weapon where you stand (fresh ammo and cooldowns, same position and aim) and resumes.
- **Top left while playing:** the title, then one line "MAP · MODE" (`.brand p.where`: `.map-name` + `.mode`; online the mode reads MULTIPLAYER · FFA / PRACTICE / LOBBY), then the online room badge in the same block (`#online-badge` lives in `.brand > div`), so none can overlap. On touch the title and that line are hidden and the badge keeps its fixed spot.
- **Phone browsers** (`mobile-browser.js`, `viewport.js`, CSS at the top of menu-theme.css, manifest in `public/`):
  - **No zoom:** double-tap and pinch zoom are blocked (touch-action, iOS `gesture*` events, quick second taps outside buttons/fields cancelled); if the page still ends up zoomed it snaps back to 1:1 (the viewport tag is re-applied).
  - **Size from the game's box, never `innerWidth`/`innerHeight`:** iOS reports those for the *visual* viewport, so a zoom shrank the canvas to the zoomed part (a quarter of the screen drawn, the rest the page colour). Every screen-size read goes through `viewWidth()` / `viewHeight()` (the fixed `#game` box). The canvas is resized on window resize, visual-viewport resize, a `ResizeObserver` on `#game`, full-screen changes and orientation changes (again 350 ms and 900 ms after a turn).
  - **The page never scrolls:** body fixed, overscroll none, no pull-to-refresh or bounce; one-finger drags only scroll what really scrolls (menus, lists; sliders drag). No long-press callout or text selection outside fields.
  - **Full screen:** on touch, starting a game requests full screen (Android Chrome and others; hides the address bar and toolbars) unless Settings > Mobile > FULL SCREEN WHILE PLAYING is off (`settings.fullscreen`, default on). iPhones cannot full-screen a page: the note there says Share > Add to Home Screen, which opens it as a full-screen app (`manifest.webmanifest` with `display: fullscreen`, apple-mobile-web-app tags, icons 192/512). The artifact build drops the manifest (its page shell is claude.ai's).
- **Menu pictures are shipped images** (`map-cards.js`): the map card (`CARD_IMAGES`, from `tools/capture-thumbnail.mjs`, Extreme) and the weapon pictures on the weapon page and the weapon pick (`WEAPON_IMAGES`, from `tools/capture-weapons.mjs`, the same studio shots `weapon-preview.js` / `rifle-model.js` / `shotgun-model.js` render). They are WebP inlined into the bundle (`?inline`, about 200 KB together), put into their `<img>`s when the menus are built and decoded at startup, so each is complete the first time its page shows: no request that can fail, no WebGL render (three extra contexts) when a page opens. The old runtime renders remain only as fallbacks for a map or weapon without a shipped picture. Re-run the tools when a map's framing or a weapon's model changes.
  - **Weapon pictures** come from `weapon-photos.js` (photo only, not in the bundle; the guns in play are unchanged): one shared studio for all three (same warm key / cool fill, ACES at 1.05, one camera direction, framed on each gun's bounds so each fills the card alike), flat shaded and low poly (octagonal prisms, no smooth cylinders or gloss), with photo detail: the Static's coil windings, charge cells, hazard striping, emitter prongs, cables, bolts and a caged orb; the Nominal's wood grain, rivets, muzzle brake slots, sling swivels and its grenade (behind and below the gun, fully visible but smaller); the Ballast broken open with shells out, octagonal barrels, brass bands, a vented rib, stock grain and an engraved receiver plate.
- **Menu lettering on page change:** `show()` in menu.js calls `refreshTypography()` right after unhiding a page, so every fitted label on it (the map card's PRACTICE badge used to lag a few hundred ms) is fitted before the page is painted.
- **Tab switch pauses solo play:** hiding the page (`visibilitychange`) opens the pause menu in practice and tutorials; online nothing pauses. Audio is unlocked (`wakeSound`) on the first pointerdown, keydown or touchend, since browsers start it suspended.
- **Tutorial:** `tutorial.js` (courses and lessons), `tutorial-card.js` (the lesson card), `tutorial-markers.js` (pink zone and arrow), `tutorial-progress.js`.
  - Lesson text follows the current controls (Space/LMB shoot, E the weapon's other action, Ctrl dash). Basics: touch **aim while walking** now teaches swiping toward a target (a swipe is an arrow press), and **no mouse** notes that an arrow locks on and holding it leads a running player.
  - The home screen's tutorial runs **basics**. Gamemodes > Tutorial > weapon runs that weapon's course.
- **Developer tools** (`dev-options.js`, `dev-tools.js`, `dev-window.js`, `dev-unlock-dialog.js`):
  - **Getting in:** pause, press **Shift+P**, enter **1213** (`DEV_CODE`). Until then P and O do nothing and nothing on screen mentions the tools. Unlocking adds Developer tools to Settings and makes **O** open the floating window. Shift+P again (once unlocked) resumes and opens the window. Settings has DISABLE & LOCK.
  - **One list, two surfaces:** `DEV_OPTIONS` in `dev-options.js` defines every option (toggle, select or action) and its section. `buildDevOptions` draws them as one dropdown per section (General, Player, Weapons, World, Display) in both the Settings panel and the O window. A new option is one entry there, plus the code that honours it; actions are hooks main.js supplies (`devHooks`).
  - **Title** (`title-screen.js`, `installTitle`): the main menu's home page IS the title: the game version (pink) above "deadshift" (Arial Black, cream, an SVG word fitted to its ink), the menu's own buttons (GAMEMODES, TUTORIAL, keyboard/mobile, SETTINGS) and a small DEV TOOLS link (asks for the code with the same dialog as Shift+P until unlocked, then toggles the dev window). The column sizes from `--title-w` (the word's width, which also shrinks with the window height) so everything fits without scrolling. The blood (brief: Design > Title screen blood) is an animation, flat and 2D, in the game's blood colours (`#8c1c2a` body, `#7a1824` stains): SVG shapes on a timeline (`BloodAnimation`) merged by a "goo" filter (blur + hard alpha threshold; shapes keep their own flat colours). The smear: one red, no other shades. It comes out of the bowls of the d, the a and the second d (they fill first, to about two thirds, and the pour spreads from them) and is ONE path across the whole word (each letter's own height, blended across the gaps, so there are no side edges between letters to round off unevenly): long smooth swells and a few broad rounded tongues (cos^2 shoulders) where it crept higher, rising in a dome to meet a bowl, kept low on the e and the s (under their bottom tails; the e's eye is not filled). It is gooed with a fine plain goo (`#title-goo-fine`: half the blur, so the small curves and tongues along its top survive) and no rim or shadow on top (the owner wants just red, then the pale letter), then masked to the letters grown by 1 screen px (`#title-ink`), so the letters' sides and soft rims are covered. The top outline has long swells, broad tongues and ~30 small rounded tongues and sags (detailed, cartoony, not lumpy), and every other letter has a round swell rising a little further onto the pale part. The bowls are plain goo, masked to the holes (`#title-holes`), filled only about a third (0.3-0.42 of the hole), with a few bubbles and a cartoon shadow inside (the glyphs stroked in a darker red `#6d1320`, kept within the pooled blood: a band along the bowl's inner wall). The letters' undersides are wrapped (the glyphs stroked, kept only along the bottom of the word and outside the letters, gooed with the lips). The crevice where each d's and the a's bowl meets its stem gets a bridging blob, and that letter's drip hangs from it (blood coming out); the V of the crevice itself, too narrow for the goo, is traced from the glyph on the canvas (`glyphInfo().notch`, row by row up from the baseline until it closes) and filled flat red over the hanging blood's rim (it showed as small dark holes otherwise). Blood hanging off the letters (lips, beads, drips) uses `#title-goo` (rim and a faint shadow below) masked to outside the letters. The copy of the letters used by the clip and masks is pinned glyph by glyph to the word's own start positions (`getStartPositionOfChar`), with no inherited spacing (the menu h1's .02em letter-spacing once made a one-run copy drift right along the word, so the red sat off the letters on every device; `.title-word text` has letter-spacing 0 too). Lips under each letter's feet (found from the glyph on a canvas) are rows of overlapping blobs of different sizes that the goo joins into one uneven sagging edge; every letter can drip (one site under each letter's widest foot; two are quick drippers (short drops in bursts of three, then a rest) and two are doubles (a second drop hanging beside the first on the same letter, starting a moment after it); no more than two filling at once, so it never drips everywhere at once; two long hangers; the letters nearest the top button's two ends drip over them, more often), and no drip reaches more than 70% of the way to the first button (they never hang over the buttons; drops fall onto them). The word has a dark shadow border round its letters, outside them only (CSS drop-shadows on `.title-word`: round every side and inside the bowls). All the buttons' liquid is in ONE rimmed goo (each button's in a group inside it that follows its button), so a run coming down off one button and the pool it feeds on the next are one piece (separate goos drew a border where they met); a run reaches right down onto the next button and feeds its pool directly. Drops land on the buttons (solid) and pool: a puddle, not an oval (a body and four lobes of different sizes the rimmed goo joins into an uneven edge, heaped mostly above the top edge so it never covers the lettering, thicker as more lands; up to 42% of a button's width, 55% on the keyboard / mobile pair, where pools creep toward the tab end and heap up against it); runs over the front; buttons above the keyboard / mobile pair spill off both ends (so blood reaches the pair's tab side too and heaps up there), the pair only off its free end, buttons below it off that same end; two feeder drips over the top button's two ends; a drop joins a pool only near its middle, so blood near an end builds up there and reaches it; stains clipped to the button. The pair counts the selected one's pink tab that sticks out 15 px past its side (`surfaceRect`); that end never spills. Switching keyboard / mobile is handled in place (`switchPair`: the pools, front runs, stains and run on the tab that went away are removed at once, the clip rect and the spilling end move; nothing is re-laid; the layout check ignores the selection). Each button's blood is in its own layer that copies the button's CSS transform every frame (`follow`), so hover lifts and presses carry the blood with them. The blood's svg sits inside the home page (absolute, the page's size, overflow visible) and everything is measured in page coordinates, so it is attached to the letters and buttons: a drag, scroll or resize moves it with them with no lag; the title never drags or scrolls (`#intro` overflow hidden, touch-action none while home shows) and is sized to fit any screen (`--title-w` from width and height, dvh; shorter buttons and spacing below 520 px tall). Runs only while the home page is showing and the tab is visible, and the overlay is hidden otherwise (it used to stay over the next page); twice a second it compares the layout (word and buttons, ignoring hover transforms) and re-lays itself if anything moved (a button hidden, a font, the window); full rate for the ~7 s intro, 30 fps after (the word is static then); a layout change re-lays it and fast-forwards; the intro plays once per load.
  - **Weapons dropdown:** weapon options carry `weapon: '<id>'` instead of a section and sit in one Weapons dropdown with a dropdown per weapon inside, built from `WEAPONS` in `items.js`. A new weapon gets its dropdown automatically ("No tools for this weapon yet" until it has options).
  - **Options:** run speed, game speed (¼× to 2×, scales the loop's accumulator), map teleport, unlimited ammo/dodge, one-hit kills; invulnerable, remove my player (`dev.ghost`: body hidden, walks through everything, can't be hurt), restore, take 50 damage, die now; Static orbs and hex cooldown; Nominal instant reload, extended mag and grenade cooldowns; Ballast instant reload; spawn bird (an ordinary row now), freeze moving targets, bring targets back, rebuild broken props, blast preview (2 to 12 orbs, cosmetic explosion event at the aim point); graphics preset (window only), hide HUD.
  - **P** (after unlock) flips only the everyday overrides together (`bulk: true`); invulnerable, remove my player, hide HUD, one-hit kills and game speed are only ever set by hand.

### Saved data (localStorage)
- `deadshift-settings`: graphics, fps, volume, opacity.
- `deadshift-touch-layout-v2`: custom button positions and swap.
- `deadshift-tutorial-v3-<course>`: tutorial completion.
- `deadshift-controls-override` (sessionStorage).
- `deadshift-native-thumbnail`.
- `deadshift-dev-window`.

## Coding conventions

- **One clear job per file.** Split files that do too much. `main.js` and `renderer.js` are the known offenders and should be split when touched.
- **Descriptive names**, with no mystery abbreviations.
- **Comments explain why, not what.** A short paragraph above a non-obvious decision is the house style.
- **Tunable values** (damage, charge time, knockback, fire rate, speeds, aim assist) live in **`src/config/gameplay.js`**; touch feel in **`src/config/controls.js`**; graphics presets in `GRAPHICS` (`settings.js`). The weapon/rule modules re-export their block under the old names so imports keep working. Never put a balance number inside logic.
- **Item data** (names, descriptions, accents, control hints) comes from **`src/items.js`**, never retyped in UI code.
- **Reuse existing patterns:**
  - events out of the simulation
  - `batch()` for static geometry
  - pooled or instanced effects
  - `bindTouchAction` for touch buttons
  - `node:test` tests next to the system
- **The simulation stays free of three.js and the DOM,** so it can run on a host or a server.
- **Every behaviour change gets a test.** Run `pnpm test` before handing work back.
- Visual changes are checked in a hidden headless browser, never the owner's tab.
- **main.js has no unit tests**, so after touching it (or anything it wires up) load the game headlessly and confirm it starts with no console errors, and run a static undefined-name check, e.g. ESLint with only `no-undef` enabled. A refactor once left a stray `$` in a moved function and the tests all passed while the game failed to start.

## Multiplayer (rounds: FFA and practice, in this alpha)

**On.** `NETWORK.enabled` is `true`: Gamemodes > MULTIPLAYER. Up to 6 players (`NETWORK.maxPlayers`; six colourways in `PLAYER_COLOURS`) on Deadwater, P2P (one player hosts). Rounds of FFA or practice, run from a lobby; 1V1, 2V2, 2V2V2 and 3V3 are listed in the lobby but not built.

### Files

```
src/config/network.js   every network setting: transport, signalling server, STUN/TURN, room codes, rates, timeouts
src/net/transport.js    the Transport interface (the only thing sessions talk to), room codes, an in-memory loopback for tests
src/net/peer-transport.js  WebRTC via PeerJS 1.5.5 (loaded only when someone goes online)
src/net/local-link.js   two windows of the same browser: BroadcastChannel instead of WebRTC (joining knocks here first, 0.5 s; hosting listens on both)
src/net/protocol.js     message shapes, input cleaning (playerInput), usernames, snapshot/loadout packing
src/config/match.js     the modes (MODES, `ready`), the host's round settings (SETTINGS with their values), pick and results times
src/net/arena.js        THE MATCH RULES: round phases, weapon picks, shared world, players and practice targets as targets, damage, deaths, respawns, kill feed, scoreboard, map reset
src/render/pick-view.js        the weapon-pick camera spot (map.pickView or its thumbnail spot, 44 m up) and the no-spawn area it shows
src/net/spawn-points.js random spawn spots inside buildings, clear of furniture
src/net/projectiles.js  everyone's orbs/bullets/pellets/grenades packed for snapshots and drawn through a "draw sim"
src/net/host-session.js the authority: steps every seat through the arena, numbered event log, snapshots per joiner
src/net/client-session.js a joiner: movement prediction, host-fired weapon, events/feed/scoreboard/world sync
src/net/online.js       picks the transport from config and starts the right session
src/online-play.js      page glue: menu requests (with the host's settings), badge, lobby/round/pick actions, events and projectiles (and practice targets) for main.js
src/ui/lobby-screen.js     the lobby screen between rounds (players + ping, mode, map, settings; START ROUND for the host)
src/ui/lobby-panel.js      the lobby page of the pause menu during a round (players + ping, settings; host: REMOVE, RESET MAP, END ROUND)
src/ui/lobby-settings.js   the settings rows shared by the host setup page, the lobby screen and the lobby page
src/ui/weapon-pick.js      the weapon pick (grid of rounded squares, 10 s timer, pink GO); untimed with BACK for solo practice's pause CHANGE WEAPON
src/ui/multiplayer-hud.js  kill feed, scoreboard with ping and colours (Tab / SCORES on touch), match clock, round results
src/remote-players.js   how other players are drawn: one colourway per slot (PLAYER_COLOURS), no name tag, holding the model of the weapon they really use (rifle/shotgun models at detail 2, Static's gun; one template per weapon, cloned)
tests/net.test.js       host + joiners over the loopback: join, lobby, picks, modes, settings, spawn rules, loading grace, stall forgiveness, shoot to death, multi-kill line, self-kill, time, props, map reset, results, lost packets
```

### How a game goes
- **Menu:** Gamemodes > MULTIPLAYER: USERNAME (saved in `deadshift-username`), then ROOM CODE + JOIN, then HOST A GAME. No password: the room code is the only key. The code box always shows capitals. Names are unique per room ("Sam 2").
- **Playing alone:** a host can start FFA or practice with nobody else in the room. With **no matchmaking server** reachable (offline, a blocked network, or 8 s without an answer) the room still opens (`transport.offline`, badge says OFFLINE): the host plays alone, and other windows of the same browser can still join over `local-link.js`. Other errors (a taken code) still fail.
- **Hosting:** HOST A GAME opens **host a game**, the round settings (below; remembered in `deadshift-host-settings`), then CREATE GAME opens the room. Nobody is put in the map yet: everyone lands on the **lobby screen**.
- **Lobby screen** (`lobby-screen.js`, while the round's phase is `lobby`): live list of players with their colour, host / you tags and ping, and the host's REMOVE; the room code (click copies an invite link); MODE (FFA, PRACTICE; 1V1, 2V2, 2V2V2, 3V3 listed, not startable), MAP (the multiplayer maps; only Deadwater now) and SETTINGS. Joiners see mode and map read-only and "waiting for the host"; **the settings are the host's only and are hidden from joiners** (here and on the LOBBY page). The host presses START ROUND.
- **Settings** (`config/match.js` SETTINGS, host only, changeable on the host setup page, the lobby screen and the pause menu's LOBBY page): spawns (random building each / together in one building), round length (5/10/15 min), kill limit (none/10/20/30), health (250/500/750), respawn wait (8/12/16 s, default 12). Rows that do nothing in the chosen mode are dimmed.
- **Weapon pick** (`weapon-pick.js`): every round starts with it, and a joiner arriving mid-round gets it. A see-through grey panel over a top-down view of the world from 44 m up (`pick-view.js`, above the birds); rounded squares, five to a row, scrolling, only picture and name; hover or pick lifts the square and its picture. A 10 s timer at the top: pink GO goes in at once with the pick; at zero you go in with your pick, or a random weapon. **Nobody spawns inside the ground that view shows.** FFA: weapons change only after dying (CHANGE WEAPON on the death screen opens the pick; the respawn waits for it). **Practice: any time** from the pause menu's CHANGE WEAPON (`arena.pickAgain`/`choose` allow a living practice seat: it leaves the world while picking, then GO puts it back in).
- **FFA:** kills count. The round ends when the clock runs out or someone reaches the kill limit; the results (winner, standings) show for 10 s, then everyone is back on the lobby screen. Respawn after the respawn wait with the same weapon.
- **Practice:** the map's targets are out (shared: everyone sees and hits the same ones; the host's arena runs them once per tick and they are mirrored to joiners every snapshot). Players can hit each other, but nothing is counted (no kills, deaths, feed or clock). Death has no wait: RESPAWN on the death screen puts you straight back.
- **Same computer:** two windows of one browser connect through `net/local-link.js` (BroadcastChannel), so local testing never depends on WebRTC. Players on other devices still use WebRTC.
- **Timeouts:** 6 s of silence drops a player (`timeout`), but a joiner still loading the map gets `loadGrace` (45 s) before its first message, and a freeze on our own side (loading, hidden window; any gap over 1 s between our own ticks) is not counted as the other side's silence. Ping replies alone do not count as being heard (a frozen tab still answers them).
- **Spawning:** at a random spot inside a building (rooms at least 6 m across, outside the pick view), preferring spots 6 m from anyone alive; with spawns "together", all in one building (picked per round) a body apart. Health from the health setting.
- **Death:** the same death screen as practice (`death-screen.js`): the red wash, DEAD, "killed by NAME" (or "you took yourself out") and, in FFA, the respawn countdown with a draining bar. Buttons: FFA: CHANGE WEAPON, LOBBY, LEAVE MULTIPLAYER; practice: RESPAWN, CHANGE WEAPON, LOBBY, LEAVE MULTIPLAYER. Your body stays where it fell after you respawn (settled), until your next death, a map reset or leaving. **At most one body and one bloodstain per player:** each player's last stain stays as long as their body (`BloodSplatters.add(..., owner)`: 'you', or 'slot'+slot for others), and their next death fades the older one out in 0.6 s while the old body goes, so the ground there is clean again. The camera cuts to the spawn, it does not glide across the map.
- **Pause:** your own only; the round goes on and you can be hit. RESUME, SETTINGS, LOBBY, LEAVE MULTIPLAYER; in practice also CHANGE WEAPON (after RESUME).
- **LOBBY page** (`lobby-panel.js`, pause menu or death screen): everyone sees the players with ping; only the host sees (and changes) the settings, and can REMOVE a player (`HostSession.kick`: refused for the rest of the room), RESET MAP (every prop and crop back, blood, marks and bodies cleared on every screen) and END ROUND (everyone back to the lobby screen). The two resets need a second press.
- **Names:** no name floats over players. Names show in the lobby, the scoreboard, the kill feed and "killed by"; each player has a colourway (coat, arms, band, scarf, base ring; `PLAYER_COLOURS` by slot) shown as a dot next to their name.
- **Kill feed:** one-shots (from full health to dead in one hit: that tick's damage from one attacker, or a volley the sim marks `oneShot`) get their own line, "X one shot Y" (`oneShot` on the feed line; `arena.died(..., oneShot)`), and the death screen reads "one shot by X". Bottom left on desktop; on touch it sits top right under MAP / SOUND / PAUSE (the bottom left is the move stick), in portrait a little lower. 6 s per line, "KILLER killed A, B" (everyone one attacker killed in the same tick is one line) or "NAME died". Your name blue, everyone else pink; names keep their case.
- **Scoreboard:** hold Tab (SCORES button on touch). The game around it is not dimmed; the card is slightly see-through (`#232827d1`) with a text shadow so rows stay readable. Rank, colour and name, kills, deaths, damage dealt, damage taken, time in game, most used weapon, ping, ranked by kills then fewer deaths. Time in game counts only while in the world (dead included, pause and settings included, weapon picks excluded).
- **Match clock:** top centre in an FFA round (red in the last 30 s), "results" between the round and the lobby, hidden in the lobby and in practice.
- **Own blasts hurt you** online too; dying to them is a death, not a kill.
- **Developer tools are the host's only** online (the host's sim is the authority): the host unlocks and uses them as offline (Shift+P, O, map teleport); joiners' dev settings are reset every tick and they get "DEV TOOLS ARE THE HOST'S ONLINE".

### How it works
- **One world, one sim per player (arena.js).** Each player keeps their own `Simulation` (body, weapon, ammo, orbs, cooldowns: all the single-player weapon code, unchanged). Before a player's sim steps, the arena hands it the shared `props`, `colliders` and `crops`, and puts every other living player in its `targets` as a proxy of kind `'player'` (radius `RULES.radius + .04`, see `target-radius.js`). Every weapon already hits targets, so all of them hit players. After the step, whatever health a proxy lost is dealt to the real player with `damagePlayer` (dodge reduction, damage type and direction from the kill/hit event, so the right death plays), and a changed collider list is kept for everyone.
- **World authority:** player sims have `worldAuthority = false`; crops burn and prop flashes fade once per tick in the arena's own world sim (`endTick`), whose proxies are every living player, so fire damages everyone once.
- **Host tick:** main.js calls `online.input(raw)` (host: `beforeLocal`) then steps its own sim, then `online.afterStep()` (host: `step()`): the arena finishes the host seat, steps every joiner's queued inputs, burns the world, runs respawns, clocks and the kill feed, and every 3rd tick sends each joiner a snapshot.
- **Rounds (arena.js):** `phase` is `lobby` (nobody in the world), `playing` (a round of `mode`: `ffa` or `practice`) or `results` (ffa, 10 s, then `lobby`). `startRound` resets the map, the scores and the practice targets and puts every seat on a pick (`seat.picking = { left, weapon, go }`); `tryEnter` spawns once the pick is done (GO or time up, random weapon if none) and any respawn wait is over. `counting` (ffa) decides whether stats, the feed and the clock run. Snapshots carry `match` (phase, mode, time left, results) every time, `lobby` (players with ping, settings, mode, map) every 30 ticks, your `picking`, and the practice `targets` (id, x, z, hp, flash) every time.
- **Ping:** the host sends `{t:'ping', s}` once a second to each joiner, who answers `{t:'pong', s}`; the host smooths the round trip per joiner and reports it in the lobby and on the scoreboard.
- **Practice targets online:** the arena owns them (`arena.targets`); each seat's sim sees stand-ins (like other players) so it never moves or revives them, and damage to a stand-in lands on the real target. Drawing: the host passes them through `drawSim` (`foreign.targets`); joiners hold a mirror in their own sim (`applyTargets`: never moved or revived there).
- **Joiners send full inputs** (`playerInput`: moves, aim point, every button), numbered, repeated 4 times. Their own sim only walks (prediction and reconciliation as before). **Weapons are fired by the host**, so hits have one truth; your own shots show one round trip late (simple on purpose; "favour the shooter" rewind can come later).
- **Snapshots carry:** every player (position, aim, hp, weapon, present, dead, life), your `loadout` (ammo, reloads, charges, cooldowns for the HUD), everyone's projectiles (`pack`), events not yet acknowledged, the last kill-feed lines, the scoreboard (every 30 ticks) and the world (broken props and crop fires, every 30 ticks and on joining).
- **Events are reliable:** the host numbers every shared event (`SHARED_EVENTS`) and keeps 3 s of them; each joiner's inputs carry `ack`, and the host resends everything newer. So shots, deaths and kill-feed lines are never lost on the unreliable channel.
- **Drawing others:** `view.netEvent(e, shooter, slot)` plays another player's event with them standing in for you (muzzle flashes, trails, arcs), and `drawSim` hands the views your sim plus everyone else's projectiles (orb ids made unique per slot). A joiner's own events come back from the host and go through the ordinary `event()` path (hit markers, damage numbers, death reaction).
- **Other players' deaths** leave their body with the proper reaction (`remote-corpses.js`, see Deaths), their stain and their dropped weapon.
- **Removing a player:** REMOVE on the lobby screen or the LOBBY page (`HostSession.kick`): they get `{t:'removed'}`, leave with "The host removed you from the game.", and that peer is refused for the rest of the room.
- **Developer overrides are the host's only.** Joiners' sims (on the host and their own) get `sim.dev = {speed:1}` every tick; the host's own sim keeps its settings (including a respawn: `arena.spawn` skips the host seat). A game-speed override on the host speeds up everyone, since the host runs everyone.
- **Local testing without the internet:** run a PeerJS server bound to 127.0.0.1 (`PeerServer({port:9000,host:'127.0.0.1',path:'/'})` from the `peer` package) and open the dev build with `?peerhost=127.0.0.1:9000` in two separate browser processes. On Potato the sandbox runs fast enough to play a round.

### NAT traversal and relays

- WebRTC finds a route with ICE. `iceServers` in `config/network.js` lists Google's STUN servers, which let most home routers connect directly.
- **Some networks refuse direct connections** (many phone carriers, strict office or school Wi-Fi). Those need a **TURN relay**, which forwards the traffic. None is configured yet: add a `{ urls, username, credential }` entry from a relay provider (Cloudflare Calls TURN, Metered, or a self-hosted coturn). Without it, expect a minority of pairs, mostly on mobile data, to fail with "The host did not answer".
- **Signalling** (the introduction) uses the free public PeerJS cloud (`peerServer: null`). It only carries the handshake; if it goes down mid-game the game continues but nobody new can join. For reliability later, self-host a PeerJS server and set `peerServer`.

### Keep in mind
- **Other players' effects anchor to their own gun.** `WorldView.netEvent` gives each slot its own muzzle point (`netMuzzles`) and passes it through `eventMuzzle`; handlers use `eventMuzzle || staticMuzzle`, and `muzzleLight` takes the shooter. Never borrow `staticMuzzle` (your live gun) for someone else's event: effects keep a reference to it and are drawn for several frames, which is how another player's Static stream came to draw as a white bolt out of your own gun. The shooter's flash light is placed at their gun the same way. Test: `tests/render-savings.test.js`.
- **Testing multiplayer headless:** two pages in one browser context link over BroadcastChannel; the host needs signalling, so run a local PeerJS server (`PeerServer({ port: 9000, host: '127.0.0.1' })`, IPv4) and open `?peerhost=127.0.0.1:9000`. Move players with real input: writing a position into the host's sim doesn't reach the joiners.

- The host's tab must stay in front. Browsers stop animation frames in background tabs, which stops the host's simulation for everyone (joiners are dropped after 6 s). A dedicated server removes this.
- Other players are not hidden by walls or cover the way targets are.
- Names are typed usernames until accounts exist.
- Headless testing: Chromium runs only one game page at full speed; the others' frames freeze (joiners then time out). Check two-player timing with unit tests (`tests/net.test.js`) or two real windows.

### Next steps

1. **Favour the shooter:** rewind other players to where the shooter saw them (about 100 ms) when checking hits.
2. **Your own shots instantly:** fire your own weapon locally for the flash, sound and ammo, and let the host confirm hits.
3. **1V1 / 2V2 / 3V3** (listed in `MODES` with `ready: false`), then **bots** (a bot is a seat whose inputs come from code) and **hiding players out of sight** on the authority (stops wallhacks).

### Moving to a dedicated server

- Write `src/net/socket-transport.js` with the same shape as `peer-transport.js` over a WebSocket, add its branch in `net/online.js`, and set `transport: 'websocket'` plus a URL in `config/network.js`.
- Run `HostSession` in Node with no local player (it already has no DOM or three.js; `local` becomes optional). The server then owns item ownership and account checks.
- Signalling, STUN and TURN are no longer needed: clients connect straight to the server.
- Game logic does not change.

## Adding a weapon

1. `src/items.js`: a `WEAPONS` entry (id, name, description, controls rows, HUD hints, `input: 'orbs' | 'trigger'`, `smoothCursor`, and for trigger weapons `touchButtons`; optional `adsFire`, `storesCharge`, `tutorial`). Unknown ids fall back to `DEFAULT_WEAPON` everywhere (`weaponOrDefault`), so menus, online messages and saved progress accept the new id automatically.
2. `src/config/gameplay.js`: its tuning block (named by `stats`).
3. `src/<weapon>.js`: its rules, a `step<Weapon>(sim, input, dt, geo)` added to `WEAPON_STEPS` in `simulation.js`, and a reset.
4. Visuals: `<weapon>-view.js` wired in renderer.js; its HUD rows in `weapon-hud.js` / `ability-hud.js` / `aim-overlay.js` where it differs; a 3D preview function in `menu.js` (`previews`; without one the card shows text only).
5. Deaths: its hits carry a `damageType` (`death-reactions.js`). Dev tools: options with `weapon: '<id>'` in `dev-options.js` get their own dropdown. Tutorial: a course in `tutorial.js` if it needs one.
6. Tests: `tests/registry.test.js` checks the entry is complete.

## Adding a map

1. `src/maps/<id>.js` exporting the map as plain data (copy `dry-creek.js`; helpers and prop types come from `map-kit.js`). Include `look: { warmth }`, a `spawn`, and a `thumbnail: { x, z, height }` spot for the menu picture.
2. `src/maps.js`: import it and add it to `MAP_LIST` with `modes` (`'practice'`, `'multiplayer'`) and `menu` (listed on the Practice map page).
3. **Its menu picture:** with the dev server up, `node tools/capture-thumbnail.mjs <id>` photographs the `thumbnail` spot in Extreme (post-processing on, the player and moving effects hidden, a vulture placed over open ground with the dust cleared around it) and writes `src/assets/thumbnails/<id>.webp` (690 x 855); add it to `CARD_IMAGES` in `src/ui/map-cards.js`. Until then the card falls back to a render of the loaded map.
4. That's all the wiring: the map page builds one card per `menuMaps()` entry, multiplayer uses `multiplayerMaps()`, `?map=<id>` loads any map, and unknown ids fall back to `DEFAULT_MAP`. Multiplayer spawns come from the map's building interiors (`net/spawn-points.js`), so give it buildings with rooms.
5. Tests: `tests/registry.test.js` checks every map has modes and basics.

## Items, cosmetics and a future store

- **Registry (built): `src/items.js`.** Every weapon and skin has a unique ID and its data defined there. Menus, the HUD and the tutorial read from it. Each weapon's `stats` names its tuning block in `config/gameplay.js`. Each weapon has a `<id>.default` skin (how it looks today). `ownedItems(list)` turns the authority's list into a set, dropping unknown ids; with no list, a player owns the starter set (everything today).
- **Two kinds of item:**
  - **Gameplay items** are weapons, with stats that point at the tuning configs.
  - **Cosmetics** are visual only: skins, which never change stats.
- **Ownership:**
  - It is decided by the authority, the host now and a server or backend later. It's **never trusted from the client**, so editing the game or storage can't unlock paid items.
  - It will tie to player accounts, a login, once a backend exists.
- **Store:** a future store and payment provider plug in on the backend. The backend grants ownership, and the game only reads the owned list the authority sends.
- **Online:** a player's equipped skin ids will travel in the `hello` message. The authority checks them against the owned list it got from the backend (never from the client) and falls back to `<weapon>.default` for anything not owned, so other players only ever see skins that were paid for.
- **Not built yet:** accounts, a store, and skins actually changing models. A new skin is a new `SKINS` entry plus the model code that reads its `visual` data.

## Known bugs, unfinished work, priorities

**Next up, in order:**
1. Multiplayer is live (free-for-all). See Multiplayer > Next steps.
2. Keep splitting when touched: `main.js` (now ~1110 lines: input routing, loop, menus flow; next to move out is keyboard/mouse input into its own module) and `renderer.js` (~2720 lines: world building could move out from per-frame drawing).

**Queued:**
- **Title screen, next:** it is the main menu now. Still to check on a real phone (the goo filter is the only costly part; it already stops when hidden and drops to 30 fps after the intro).
- A loading screen after picking the map and weapon, with the world build moved into it (the owner wants it styled with the title screen, after the title is settled).
- A killerbunny2846 watermark.
- A fair camera view across aspect ratios.
- A shadow-box margin.
- Fix point-blank Static orbs spawning off the muzzle when fired into props.
- Explosive barrels: reddish, 30 HP, a larger grenade-style blast, 1.8% spawn, and dashing pushes them.
- Clarify "make ADS slightly more aim in".

**Known issues:**
- **Hex (X) performance:** the spinning hex's sides and its flying orbs break props they cross; that used to test every prop against every collider six times a step (the whole frame on a laptop, a spike on the second X). `Simulation.breakablePropsAlong` now walks one cached list of prop colliders with a bounding-box reject (about 12x less work in profiles), and `segmentBox` (every bullet, orb and hex side against boxes) allocates nothing.
- Check before handing over: `node tools/smoke.mjs` (dev server up) plays every preset headlessly and must print no errors or warnings. It caught two that are now fixed: the shader warm-up cloned post-pass materials that sample a render target (three warned and dropped the texture; those now skip the indoor copy), and GTAO's depth texture was sampled before it had a size on Extreme (GL_INVALID_VALUE; it now gets its target's size up front).
- Load time on slow laptops and phones, mostly world building.
- Draw calls on Performance at phone size: about 90 (was 159 before merging the player and targets, 119 before the empty-draw skip and weapon/roof bakes). Breakable props are now the largest group (one or two draws each); instancing them per type is the next step if needed.
- Roof and wall line shimmer: the camera pixel snap is the current fix, not yet confirmed by the owner.
