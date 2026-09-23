# Deadshift: project handoff

Deadshift is a top-down western shooter that runs in the browser on desktop and phones. This file is the single source of truth for anyone (person or AI) picking the project up. **Keep it current: any change that adds or changes a system updates this file in the same change.**

## Standing rules from the owner

These come first and are never removed.

- **Never push or pull the repo unless the owner says so.** No commits either unless asked.
- **Nothing in the game mentions the developer tools until they are unlocked** (pause, Shift+P, code). Keep it that way: no hints, toasts, labels or key reactions before the unlock. Practice overrides never go online.
- Do not control the user's visible game tab for testing. Use a separate hidden browser tab and leave their session alone.
- New weapons or damage effects must carry an explicit damageType through lethal hits and define their death reaction in src/death-reactions.js. Preserve weapon drops for every death. Electricity leaves a charred fallen body; fire leaves an intact fallen skeleton; bullets leave an intact body with a head wound; ordinary explosions use directional gore scatter. Add reaction and cleanup coverage for new effects.
- Ballast is an exception to the ordinary bullet death when the lethal burst from one attacker removes at least 85% of maximum health within 0.45 seconds: use the headless kneeling reaction with directional blood. Normal Ballast finishing hits retain the ordinary gunshot reaction.
- **Performance work targets the Performance and Potato presets.** Playtesting happens on phones and an Intel MacBook, not on the owner's high-end PC (RTX 5090), which is not representative.
- **"Optimize" means finding headroom and spending it on looks, never removing things.** Measure first. Merge, batch, cache or build lazily, and use what that saves to add detail that is cheap to draw.
- Explain decisions in plain language: how a system works, not just that it works.

## Engine, language, tooling

| | |
|---|---|
| Engine | **No game engine.** The rendering library is **three.js 0.180**; the game loop, physics, input, UI and audio are all hand-written. |
| Language | JavaScript (ES modules, no TypeScript). HTML and CSS for every menu and HUD. |
| Build | **Vite 7** |
| Tests | Node's built-in runner, `node --test tests/*.test.js` (about 474 tests) |
| Package manager | pnpm on the owner's PC and in CI; npm works too |
| Deploy | `.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main` |
| Networking | **PeerJS 1.5.5** (WebRTC data channels, P2P) behind a swappable transport; see Networking |
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

**Version:** `src/version.js` is the one place the version lives (`0.55a`, the a is alpha). The browser tab reads `deadshift v0.55a` (`TAB_TITLE`); keep `index.html`'s `<title>` in step when it changes.

## Where the code lives

There are three copies. Know which one you are in.
- **GitHub `main`**: what players get on GitHub Pages.
- **The owner's PC** (`E:\ai slop games\game1`): his git checkout. Changes reach it as patch files in `Claude outputs/`, applied with `git am --3way`.
- **A Claude working copy**: where most recent work happens. It is uncommitted until the owner asks.

## Folder structure

```
index.html          all menu, HUD, settings and panel markup
src/                game code (about 90 modules, one job each)
  config/
    network.js      online settings (transport, signalling, STUN/TURN, rates, timeouts)
    gameplay.js     EVERY gameplay tunable: movement, Static/orbs/hex (RULES), RIFLE, SHOTGUN (incl. recoil/launch), GRENADE, aim assist
    controls.js     touch feel: tap vs drag, move stick, button cluster shape
  net/              online play: transport interface, PeerJS transport, protocol, host and client sessions
  online-play.js    online page glue; remote-players.js draws other players
  extreme-post.js   Extreme's AO / bloom / grade passes; extreme-surfaces.js its ground and weathering shader detail
  map-look.js       each map's light and haze (warmth, sun, sky, fog)
  frozen-transforms.js, blob-shadows.js   per-frame matrix savings; Potato's stand-in shadows
  items.js          item registry: weapons and skins by unique id, ownership helper
  main.js           entry glue: game state, keyboard/mouse/touch input routing, the fixed-step loop, menus flow
  simulation.js     the rules: one Simulation object, stepped at 1/60 s from an input list
  renderer.js       WorldView: builds the 3D world and draws each frame
  aim-overlay.js    aim dot, charge ring, Ballast cone, Nominal spread brackets
  ability-hud.js    stamina pips and ability dials beside the ammo
  touch-controls.js tap/drag rule, floating move stick, right-thumb button cluster
  touch-layout.js   saved custom button positions, the layout editor, swap sides
  mobile-settings.js  Settings > Mobile wiring
  settings-panel.js graphics / FPS / volume options wiring
  tutorial.js       courses and lessons (data + progress); tutorial-card.js draws the lesson card
  debug-state.js    dev-build JSON snapshot on the canvas (data-debug)
  *.css             style.css (base), menu-theme.css (menus, HUD), mobile-controls.css, tutorial.css, loading.css
tests/              one test file per system (node:test)
.github/workflows/  Pages deploy
vite.config.js      normal build; vite.artifact.mjs is the single-file artifact build
```

## Major systems

### Simulation: the rules
- **Files:** `simulation.js` holds the rules; their numbers are `RULES` in `config/gameplay.js`. The weapon rules are in `rifle.js`, `shotgun.js` (+ `shotgun-pressure.js` visuals, `ballast-damage.js`) and `grenade.js`. Maps and colliders are in `maps.js`, crops and fire in `crops.js`, and `playable-area.js` holds the map bounds.
- **How it works:**
  - `sim.step(input)` advances one fixed 1/60 s tick from a plain input object (move, aim, fire, dodge, abilities).
  - It pushes **events** (`hit`, `kill`, `propBreak`, `dodge`, and so on) that the renderer, audio and HUD react to via `sim.drainEvents()`.
  - It knows nothing about three.js or the DOM.
- **Assumes one player** (`sim.player`, about 40 places). Online movement sidesteps this with one `Simulation` per player on the host; weapons online will need a list of players (see Networking > Next milestones).

### Movement
- **Where:** `simulation.js`. Speed, acceleration, braking and dodge values are in `RULES` (`config/gameplay.js`).
- **Dodge:** costs stamina. Nominal gets 3 charges, Static 2, Ballast 1. A dodge breaks through breakable props.
- **Direction-only aim** (arrow keys, WASD fallback, walking on touch) turns with weight: `keyboardAimResponse`, `keyboardAimMaxTurn` and `keyboardAimSpinUp` in `RULES`.
- **Aim assist** (`auto-range.js`) only adjusts **distance** along the aimed line, never direction. Mouse is never assisted. Players rank first (practice targets stand in for players).

### Weapons
- **Static** (`simulation.js`, visuals in `electric-effects.js` + `arc-batch.js`):
  - Hold E to place orbs, LMB/Q to launch a volley or a quick shot.
  - C is the lightning stream.
  - X deploys the hex, and X again pulses it (Hex Pulse).
  - The orb count sets volley damage (`ORB_VOLLEY_TOTALS`).
- **Nominal** (rifle; `rifle.js`, `rifle-view.js`, `rifle-pose.js`):
  - LMB/Q fires: tap for single shots, hold for auto.
  - RMB/Shift aims in.
  - R reloads (18 rounds). X loads a 36-round magazine (60 s cooldown).
  - E throws a grenade (`grenade.js`).
- **Ballast** (charge shotgun; `shotgun.js`, `shotgun-view.js`):
  - Hold LMB or Q to charge, release to fire.
  - Shift or RMB stores the charge.
  - E fires both shells. R reloads (2 shells).
  - Each shot **launches the player backward** through `blastVX/blastVZ` + `ballastLaunch`, and a launch smashes props on contact.
- **Deaths:** `death-reactions.js`, `death-view.js`, `death-corpse.js`, `death-bones.js`, `ballast-blood.js`.

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
- **Blob shadows** (`blob-shadows.js`): Potato has no shadow map, so soft patches under props, the player, targets and other players stand in for it, leaning the way the sun throws the real shadows. Two draws.

### Map look (light and haze per map)
- **Where:** `map-look.js`. `BASE_LOOK` holds the default sky/bounce hemisphere light, the sun, and the dust haze (fog + clear colour). A map overrides any of it with a `look` block in its own data, next to `palette` (e.g. `look: { warmth: .15 }` or `look: { sun: '#ffd9a0' }`). `mapLook(map)` gives the finished colours and the renderer builds its lights and fog from them, so a new map needs no renderer changes to get its own mood.
- **Warmth** pulls light toward amber (red stays, green eases, blue drops most) in proportion, so brightness barely moves. Deadwater, Dry Creek and the training range are all `warmth: .15`.
- Only the world's lights and haze change: the HUD, menus and unlit effects keep their colours. Every preset lights the world with these lights, so it applies to all of them. Extreme's grade pass sits on top as before.

### Graphics presets
- **Where:** `settings.js` → `GRAPHICS`. Five presets: **Potato, Performance, Balanced, Quality, Extreme**.
- **Extreme** is Quality plus, never minus (a test enforces "never less of anything"):
  - **Post-processing** (`extreme-post.js`, loaded only when Extreme is picked, disposed when it is left): half-resolution GTAO ambient occlusion (eased down to 0.4 indoors so rooms keep their warm light), bloom on near-white effects only (soft-knee, capped so the Static stream glows instead of whiting out), and one grade+sRGB pass. The scene is still tone mapped per material while drawn (the composer's buffers are flagged as output targets), so effects that skip tone mapping keep their exact colours. The AO draws its own depth/normals without glows, particles, lines, faded roofs, birds and ground cover (`WorldView.aoExcluded`). Reusing the main depth instead was tried and dropped: lopsided AO and grey screen edges.
  - **Surfaces** (`extreme-surfaces.js`, shader injection behind an `EXTREME_SURFACE` define so other presets compile the old shader): world-space ground variation and pebbles against the 4 m tile repeat; dust on the lowest half-metre of objects, streaks on walls, worn patches on roofs and tops.
  - 4096 shadow map at 60 updates/s; 2048 ground texture; anisotropy 16; cylinders built with twice the sides (applies to the map as loaded; switching to Extreme mid-game keeps the models).
  - Lit, flat-shaded birds with coverts and primaries and a soft ground shadow thrown along the sun (`birds.js`, `rich`).
  - Long tapered rifle tracers (`RIFLE_QUALITY.extreme.trailLength`), more sparks/smoke/impact debris, denser arcs (`ARC_DETAIL.extreme`), more dust, blood and blast smoke, a 400-per-colour particle pool.
  - Adaptive resolution may lower Extreme to 80% when frames drop; Quality stays fixed.
- **Detail effects** (`effects-detail.js`, `DetailFX`, `view.fx`): one shared layer of sparks, embers, lumpy smoke/dust puffs, flashes, shock rings (round and hexagonal), light columns, grit and streaks, nine instanced draws in all, counts scaled by `FX_DETAIL` (Potato none → Extreme 1.8×). Hooked to gunfire (`muzzle`), impacts, explosions and grenades, Static contacts (`electric`), the X pulse (`hexPulse`), the C stream's contact points, orb-to-orb links (`ElectricEffects.onContact`, more links per strike on Quality/Extreme via `ARC_DETAIL.links/linkGap`), shells, footsteps and dashes, burning crops. Puffs thin out right around the player (`fx.clearZone`). Pools are shown during `warmPrograms` so their shaders compile at load. Views take `view.fx || NO_FX` so tests without a view still run.
- **Orb blast sizes** (`orbBlastScale` in `effects-detail.js`): each orb that lands makes the blast look one step bigger: 2-3 orbs a small pop, 4-7 medium, about 10 the full fireball, and 12+ a bit past that (it stops growing at 16). It shrinks what used to be a fixed size: smoke puffs, how far sparks, clods and embers fly, the flash brightness, the renderer's hit burst and the blast light. The outer ring only shows from 4 orbs up. The radius and damage come from the simulation (`explosionFor`) and don't change. Grenades pass no scale, so they keep their full size.
- **Ballast shells** bounce, skid and roll to rest on their side, trailing smoke; Extreme builds them with a crimp and brass rim. **Pellets past the red zone** fly on as cosmetic copies (`ShotgunView.ghosts`) until they hit something solid or run 34 m: no damage, nothing breaks.
- **Footprints on Extreme** are pressed prints (sole, heel, tread, a lip of sand) lit from the sun's side, and last 7 s.
- **Dust wisps** are flat drifting sheets that clear around the player and the aim point (never over the fight); Extreme has five.
- **Interior shroud** repaints on any frame the camera moved (it used to lag the walls on entering a room); **roofs** count as solid for AO until half faded, so a closing roof no longer shows the room's outline.
- **UI sounds** (`ui-sounds.js`): a clack on buttons, a lower falling one for back/close/Esc, on their own audio context so they work while the game is paused.
- **Muzzle light:** rifle and Ballast shots flash the existing effects light (warm, a few hundredths of a second) on every preset that has it; no new shader variants.
- **Defaults:** phones default to Performance, desktop to Balanced.
- **What the presets set:** pixel ratio and scale, shadow map size and refresh rate, particle caps, textures and bump relief, and which detail layers are shown.
  - Performance: 768 shadow map (was 512), 256 ground texture (was 128), two-thirds of the ground cracks. Potato: blob shadows (see Rendering).
  - Dense ground cover is only built on Balanced and above; it's built on demand if you raise the preset.
- **Adaptive resolution** (`AdaptiveResolution`) lowers the 3D buffer on Performance and Balanced when fps drops. A resize reallocates the drawing buffer once (`setDrawingBufferSize`), not twice.

### UI
- **Settings > Controls:** General controls, then one Weapons dropdown with a dropdown per weapon. Each weapon's rows are `controls` on its entry in `items.js`, so a new weapon brings its own.
- **Menus:** `menu.js`, `menu-navigation.js`, `select-menu.js`, `button-typography.js`. The settings panel has tabs for Graphics, Audio, Controls and Mobile (`settings-panel.js`, `mobile-settings.js`).
- **HUD:** `weapon-hud.js`, `health-hud.js`, `ability-cooldown.js`, `damage-feedback.js`, `outgoing-feedback.js`, `perf-readout.js`, `overhead-map.js` (M).
- **Cursor and aim overlay** (`aim-overlay.js`): with a mouse, the aim dot is the only pointer, over the UI too. UI clicks never reach the game.
- **Charge ring** (`aim-overlay.js`): Ballast charge and Static hex expansion show as a ring around the cursor. Ability dials and stamina: `ability-hud.js`.
- **Touch** (`touch-controls.js` + `touch-layout.js` + `touch-action.js`, feel in `config/controls.js`; `main.js` decides what taps and drags do):
  - A **floating move stick**: drag anywhere on the left half. Walking also steers aim.
  - A **tap** anywhere fires at that spot, and a drag never fires.
  - FIRE is a quarter circle in the corner, with the other actions as ring segments around it (`arrangeTouchCluster`).
  - Settings > Mobile holds Edit layout (dragged buttons become free circles), Swap sides and Reset.
  - While editing, each dragged-out button has three handles: × removes it, ↘ resizes it, and ↺ puts just that button back in the corner cluster. It is forgotten from the saved layout (`withoutControl`), so it rejoins the cluster on the player's side: bottom right normally, bottom left with Swap sides. `restoreCluster` (main passes `arrangeTouchCluster`) lays the cluster out again afterwards.
- **Tutorial:** `tutorial.js` (courses and lessons), `tutorial-card.js` (the lesson card), `tutorial-markers.js` (pink zone and arrow), `tutorial-progress.js`.
  - The home screen's tutorial runs **basics**. Gamemodes > Tutorial > weapon runs that weapon's course.
- **Developer tools** (`dev-options.js`, `dev-tools.js`, `dev-window.js`, `dev-unlock-dialog.js`):
  - **Getting in:** pause, press **Shift+P**, enter **1213** (`DEV_CODE`). Until then P and O do nothing and nothing on screen mentions the tools. Unlocking adds Developer tools to Settings and makes **O** open the floating window. Shift+P again (once unlocked) resumes and opens the window. Settings has DISABLE & LOCK.
  - **One list, two surfaces:** `DEV_OPTIONS` in `dev-options.js` defines every option (toggle, select or action) and its section. `buildDevOptions` draws them as one dropdown per section (General, Player, Weapons, World, Display) in both the Settings panel and the O window. A new option is one entry there, plus the code that honours it; actions are hooks main.js supplies (`devHooks`).
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

## Networking (milestone 1 built, shelved for a later alpha)

**Not in this alpha.** The owner decided multiplayer ships in a later alpha build. `NETWORK.enabled` is `false` in `config/network.js`, which hides Gamemodes > ONLINE and ignores `?join=` / `?host=` links. The code and its tests stay. Do not start milestone 2 (weapons online) until he says so.

**Goal:** peer-to-peer (P2P) now, a dedicated server later. Switching is a config change plus one new transport file, not a rewrite.

### Files

```
src/config/network.js   every network setting: transport, signalling server, STUN/TURN, room codes, rates, timeouts
src/net/transport.js    the Transport interface (the only thing sessions talk to), room codes, an in-memory loopback for tests
src/net/peer-transport.js  WebRTC via PeerJS 1.5.5 (loaded only when someone goes online)
src/net/protocol.js     message shapes, what a client may send, snapshot packing
src/net/host-session.js the authority: runs every player's simulation, sends snapshots
src/net/client-session.js a joiner: prediction, reconciliation, interpolation of others
src/net/online.js       picks the transport from config and starts the right session
src/online-play.js      page glue: menu requests, the room badge, what the local sim runs, leaving
src/remote-players.js   how other players are drawn (plum coat, mustard ring, name tag), one merged draw each
tests/net.test.js       host + clients over the loopback: connect, move, agree, lose packets, time out, fill up
```

### How to host and join

- **Host:** Gamemodes > ONLINE > HOST A GAME. You get a 5-character room code (no O/0/I/1). The badge under the title shows `ROOM CODE · players/4`; tap it to copy an invite link (`?join=CODE`).
- **Join:** Gamemodes > ONLINE, type the code, JOIN. Or open an invite link, which goes straight in.
- Online runs on Deadwater only. From the tutorial map the page reloads onto Deadwater first (`?host=1` / `?join=CODE`).
- **Where it works:** GitHub Pages and the dev server. The claude.ai artifact has no network access, so ONLINE there fails with "Could not reach the matchmaking server".
- **Local testing without the internet:** run a PeerJS server (`npx peer --port 9000`, or the `peer` package's `ExpressPeerServer` bound to 127.0.0.1) and open the dev build with `?peerhost=127.0.0.1:9000` on two browsers. Headless tests need two separate browser processes: two pages in one headless browser starve each other's frames and the host drops the slow one.

### What's authoritative

- **The host decides everything.** Its own player is the normal local `Simulation`. Each joiner gets their own `Simulation` on the host, stepped once per tick with that joiner's inputs, in order.
- **Clients send only inputs** (move, aim direction, dodge), numbered, never positions or results. `protocol.readMessage` drops anything else, clamps movement to length 1 and normalises aim. Each message repeats the last 4 inputs, so a lost packet costs nothing. Data channels are unordered, so one late packet never stalls the rest; old snapshots are ignored by tick.
- **Snapshots:** 20 per second (every 3rd tick), every player's position, velocity, aim, dodge and stamina state, plus `lastSeq`, the last input the host ran for that player.
- **Your own player is predicted:** your inputs move you locally at once. When a snapshot arrives the client re-runs its unacknowledged inputs on a spare `Simulation` from the host's state and compares. Same code and same inputs usually agree exactly; a gap under 1.5 m eases out (35% per snapshot), a bigger one snaps.
- **Other players are interpolated:** drawn 0.1 s in the past, gliding between the two snapshots either side, on a clock mapped from the host's tick.
- **Late or missing inputs:** the host repeats the last input for up to 0.25 s (never a dodge), then stands the player still. A backlog is worked off a few inputs per tick. No message for 6 real seconds drops a player; a client that hears nothing from the host for 6 s leaves with "Lost connection to the host".
- **Weapons are off online for now.** Only movement inputs survive. Joiners and the host show Static but cannot fire.
- **Developer overrides never go online.** Sessions reset `sim.dev` to `{speed:1}` every tick on every simulation, P and O show "DEV TOOLS ARE OFF ONLINE" (only to someone who has unlocked them), Shift+P does nothing online, and map teleport is refused.
- **Removing a player:** the host's pause menu lists everyone else in the room with a REMOVE button (`online-play.js`). `HostSession.kick(id)` sends them `{t:'removed'}` (they leave with "The host removed you from the game."), drops them, and refuses that peer for the rest of the room. The host could still cheat on its own machine by editing code: that is the P2P trade-off a dedicated server removes.
- **The world does not pause online.** Opening the pause menu keeps the simulation running with your hands off, because everyone else is still playing.

### NAT traversal and relays

- WebRTC finds a route with ICE. `iceServers` in `config/network.js` lists Google's STUN servers, which let most home routers connect directly.
- **Some networks refuse direct connections** (many phone carriers, strict office or school Wi-Fi). Those need a **TURN relay**, which forwards the traffic. None is configured yet: add a `{ urls, username, credential }` entry from a relay provider (Cloudflare Calls TURN, Metered, or a self-hosted coturn). Without it, expect a minority of pairs, mostly on mobile data, to fail with "The host did not answer".
- **Signalling** (the introduction) uses the free public PeerJS cloud (`peerServer: null`). It only carries the handshake; if it goes down mid-game the game continues but nobody new can join. For reliability later, self-host a PeerJS server and set `peerServer`.

### Keep in mind

- The host's tab must stay in front. Browsers stop animation frames in background tabs, which stops the host's simulation for everyone. A dedicated server removes this.
- **Players are solid to each other.** Each `Simulation` has `otherPlayers` (empty offline): round bodies it stops against, two body radii apart, like targets (`pushOutOfCircle` in `movePlayer`, plus an idle push-out via `touchingPlayer`). The host fills each sim's list from every other sim before stepping it, and its own after (`bodiesExcept`). A joiner fills it from the latest snapshot, for both prediction and the reconcile replay, so they match what the host ran. You can't shove someone; you stop at their edge. When the simulation holds a real player list (milestone 1 of Next milestones), this becomes that list.
- Other players are not hidden by walls or cover the way targets are.
- Names are seats (P1 is the host, P2-P4 joiners) until accounts exist.

### Next milestones

1. **Weapons online.** Clients add fire/aim/ability inputs; the host runs them in the joiner's simulation and hit tests against every player. That needs the simulation to hold several players (today each `Simulation` has one `player`), so the plan is one shared world `Simulation` with a player list, keeping the single-player API as a wrapper. Events (shots, hits, deaths, props breaking) go out with snapshots so every screen shows the same effects. Death reactions still come from `damageType` in `death-reactions.js`.
2. **Ballast launch:** the authority owns it, since it is movement caused by firing. The shooter predicts its own launch at once (it depends only on its own charge and aim inputs, so prediction matches) and reconciles like any movement. Knockback from *other* players is never predicted; it arrives in snapshots.
3. **Randomness:** only the authority rolls dice that affect outcomes (spread, props). Cosmetic randomness stays local.
4. **Bots** run on the host as extra input producers: a bot is a remote entry whose inputs come from code instead of the wire. No networking changes.
5. **Hide players out of sight** on the authority (don't send them), which also stops wallhacks.

### Moving to a dedicated server

- Write `src/net/socket-transport.js` with the same shape as `peer-transport.js` over a WebSocket, add its branch in `net/online.js`, and set `transport: 'websocket'` plus a URL in `config/network.js`.
- Run `HostSession` in Node with no local player (it already has no DOM or three.js; `local` becomes optional). The server then owns item ownership and account checks.
- Signalling, STUN and TURN are no longer needed: clients connect straight to the server.
- Game logic does not change.

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
1. Multiplayer is shelved until a later alpha (owner's call). Don't resume it unprompted.
2. Keep splitting when touched: `main.js` (still ~640 lines: input routing, loop, menus flow; next to move out is keyboard/mouse input into its own module) and `renderer.js` (~2150 lines: world building could move out from per-frame drawing).

**Queued:**
- A loading screen after picking the map and weapon, with the world build moved into it.
- A killerbunny2846 watermark.
- A fair camera view across aspect ratios.
- A shadow-box margin.
- Fix point-blank Static orbs spawning off the muzzle when fired into props.
- Explosive barrels: reddish, 30 HP, a larger grenade-style blast, 1.8% spawn, and dashing pushes them.
- Clarify "make ADS slightly more aim in".

**Known issues:**
- Load time on slow laptops and phones, mostly world building.
- Draw calls on Performance at phone size: about 119 (was 159 before merging the player and targets). Breakable props are now the largest group (one or two draws each); instancing them per type is the next step if needed.
- Roof and wall line shimmer: the camera pixel snap is the current fix, not yet confirmed by the owner.
