# Deadshift — Omen, Sightline and shared UI handoff for Claude

Updated: 2026-09-27. Running notes requested by the owner. Update this file with each subsequent change in this worktree; keep the current behavior, file inventory, verification and pending work accurate. AGENTS.md remains the project-wide source of truth.

## Location and integration status

- Working source: `C:\Users\satya\.codex\worktrees\omen-weapon\game1`.
- Branch: `codex/omen`; base/HEAD: `6ad2d18ab83f960875d55c7a807ac18bf4dd055d` (v0.985a).
- Everything described here is currently **uncommitted**. No commit, push, pull or merge has been performed for these changes.
- The owner's main/map checkout is `E:\ai slop games\game1`. Do not replace its shared files with whole copies from this worktree. These notes describe this worktree's differences from its base, not all work by Claude or other agents.
- Latest standalone preview is revision 35: [Ichor on Hollow Wick](http://127.0.0.1:5792/Deadshift-Ichor.html?play=1&weapon=ichor&map=hollow-wick&autostart=1&revision=35). All seven weapons remain selectable, including on Deadwater Outpost.
- Artifact files: `output/omen/Deadshift-Sightline.html` and `output/omen/Deadshift-Omen.html` (same game build); development server: port 5791; artifact server: port 5792. These are local previews, not a deployed release. The query revision is a cache buster, not the game version.
- `output/omen/` is ignored scratch/build/QA output. The new source, tests and weapon image listed below are not ignored and must be included when changes are eventually packaged.

## Sightline — revision 17

Owner authorized implementation and chose amber vents/chamber, the long diagonal back sling and a real Sidekick holster. This supersedes all earlier Sightline discussion-only entries in the historical log below. See `SIGHTLINE_DESIGN.md` for every final behavior and balance number. Key points: manual 25 ± 2 damage (23–27)/10-round Sidekick; E crouched 493–505 rifle; 4.2 s reload; delayed physical rounds with wind wake and prop penetration; responsive public laser; independently weighted 45-degree forward scoped visibility; full X loading and automatic standing return to Sidekick; amber armed cue; 793–805 direct explosive round and 70 s cooldown. Seven lessons, card image, typed deaths, touch, bots and protocol 13 are integrated.

Historical revision 15 (scope size/weight superseded by revision 17) fixes the recorded scope flashing with world-space gray shading, keeps the 80-degree cone attached to the shooter across terrain, extends the view to 2.65x camera height and leads toward aim with the player near the rear screen edge. Height adds at most 6% reach. Aim uses a 0.55 rad/s turn cap with acceleration. Reload exits scope and requires a fresh aim press. E setup takes two seconds, blocks firing and can be canceled with E; return takes 0.42 seconds. The rifle sling clears the hat; draw/holster, crouch/stand, hands, magazine, regular brass shell, amber X shell, bolt and recoil are animated. Breach has a small cosmetic muzzle blast that can damage nearby enemies but never the shooter, plus the existing large landing blast, also shooter-safe. Active and stowed ammo rows swap size/position without recreating their contents. Rifle ammo is one large horizontal flat sniper-round silhouette, filling left to right on reload and turning amber for X.

Scope performance changes: removed per-frame CSS backdrop filtering and projected clipping; gray world shading uses prewarmed uniforms and no extra render pass. Exact frustum intersections replace iterative camera/range searches, with aspect-based optics cached. Lasers use spatial collider queries, reuse terrain/cover paths while pose and cover stay fixed, and remain a single bounded instanced draw with rounds/wind trails. Cache invalidation follows pose, stance, ground, aspect and collider array/length; it clears when aim ends. Fixed the missing laser/wind batch: loading hid an empty InstancedMesh and update never restored visibility. The regression test starts with that hidden state and verifies visibility and changing cover. No effects or quality tiers were removed.
Sightline edits to existing files (preserve all Omen and map changes when merging):

- Rules/input/registry: `src/config/gameplay.js`, `src/simulation.js`, `src/items.js`, `src/main.js`, `src/aim-damping.js`.
- Visuals/camera: `src/render/renderer.js`, `src/render/interior-visibility.js`, `src/render/warm-up.js`, `src/remote-players.js`, `src/effects/crows.js`, `src/weapons/rifle-pose.js`, `src/weapons/weapon-photos.js`.
- HUD/tutorial/audio/death: `src/ui/ability-hud.js`, `src/ui/weapon-hud.js`, `src/ui/aim-overlay.js`, `src/ui/x-ability-state.js`, `src/ui/map-cards.js`, `src/tutorial.js`, `src/audio.js`, `src/effects/death-reactions.js`.
- Network/bots: `src/net/protocol.js`, `src/net/projectiles.js`, `src/net/host-session.js`, `src/net/client-session.js`, `src/net/arena-robots.js`, `src/bots/bot-match.js`, `src/bots/robot-brain.js`.
- Existing test expectations: `tests/items.test.js`, `tests/net.test.js`, `tests/registry.test.js`, `tests/dev-window.test.js`. Registry testing now checks the touch AIM field, which startup requires. Existing golden replay hashes did not change for Sightline.
- Documentation: `AGENTS.md`, `SIGHTLINE_DESIGN.md`, `CLAUDE_HANDOFF_OMEN.md`.

New Sightline files:

| File | Purpose |
| --- | --- |
| `src/weapons/sightline.js` | Stance/magazines/reloads, committed physical bullets, piercing, damage, range and scope geometry. |
| `src/weapons/sightline-model.js` | Rifle, Sidekick, leather sling/holster, loading shell, amber vents and locking plates; shared local/remote models. |
| `src/weapons/sightline-view.js` | Pooled streaks, wind wakes, public lasers, vapor, muzzle/impact effects and cached straight flight paths. |
| `src/styles/sightline.css` | Animated dual-magazine rows, rifle-shell shape and amber X styling. |
| `src/ui/sightline-ammo.js` | Persistent active/stowed ammo rows, reload fill and animated swapping. |
| `src/render/scope-shading.js` | Prewarmed world-space gray cone; no CSS backdrop or screen-space terrain mask. |
| `src/assets/weapons/sightline.webp` | Rifle-and-Sidekick weapon selection art rendered with the shared studio. |
| `src/weapons/sightline-flight.js` | Shared straight elevated trajectories, real height/terrain/deck collision and public laser endpoint. |
| `tests/sightline.test.js` | 41 behavior tests, including host damage, model/death cleanup, tutorial, bots and under-deck flight. |

Revision 14: the sidearm is now named Sidekick throughout the HUD, accessibility text, controls and tutorial; each shot deals 27 rather than 35 damage. The shared tuning covers players, bots, props and host authority. Internal protocol fields and damage types keep their existing names for compatibility. Changed this revision: `src/config/gameplay.js`, `src/items.js`, `src/tutorial.js`, `src/ui/ability-hud.js`, `src/ui/weapon-hud.js`, `tests/sightline.test.js`, `AGENTS.md`, `SIGHTLINE_DESIGN.md`, and this file.

Validation: 919 tests passed, no undefined-name errors in changed wiring/weapon modules, production build passed. Separate headless browsers verified standing X load → Sidekick → E → scope → special shot without errors. Additional Hollow Wick checks passed on Potato, touch-sized Performance and Extreme; a remote player ahead stayed visible and one behind disappeared. Artifacts/screenshots/logs are ignored under `output/omen/`. Software-rendered runs validate behavior/shaders, not real phone or Intel MacBook frame rates. Live multiplayer over two physical devices still needs owner playtesting; authority/snapshot behavior is covered by unit tests.

## Final controls and balance

These are the implemented values in `src/config/gameplay.js` (`OMEN`). They supersede earlier numbers in the conversation. Keep player-facing controls in step with them.

| Action | Current behavior |
| --- | --- |
| LMB / Space / FIRE | Straight orange diamond projectiles. 4-round magazine. One shot every 0.42 seconds. 36 damage through 12 m, falling to 22.5 at 22 m; maximum travel 26 m. Speed 30 m/s. |
| R / RELOAD | 1.8-second reload. Trying to shoot an empty magazine starts a reload. |
| RMB / Shift / AIM | Narrows spread: 0.025 hip / 0.009 aimed. Muzzle offset is 0.27 m sideways, aligned with the cursor using the existing aim system. |
| First E / CURSE | Primes the next shot for 5 seconds. It becomes larger, red and glowing, and deals 49.5 impact damage. A successful hit places one E curse for 3.5 seconds. |
| Unused E prime expires | Consumes exactly one reserved round and starts the 10-second E cooldown. Expiry happens before a same-tick shot can use the prime. Reloading does not refresh the timer. |
| E curse damage | Every 0.5 seconds: a uniform roll from 9, 9.9, 10.8, 11.7, 12.6. Rolls happen on the damage authority. |
| Second E / CURSE | Ruptures an active E curse. 135 direct damage, rising continuously toward 171 during its last second, with an independent ±13.5 random roll in 0.9 steps. Works during reload/cooldown if the mark is still active. |
| First X / COVENANT | Launches 3 red homing projectiles total toward up to 3 visible eligible targets, nearest first, within 24 m. With 2 targets the distribution is 2 + 1; with 1 target all 3 go there. 45 impact damage each. |
| X flight / marks | Speed 20 m/s; turn limited to 1.8 radians/s; projectile life 1.5 seconds. Dodge can evade them: after passing a target they do not turn around or reacquire. X window is 4 seconds **from launch**, cooldown 40 seconds. Its marks tick for 10.8 every 0.5 seconds. |
| Second X / COVENANT | Ruptures the active X marks together, using 135 → 171 late-window damage. X ticks and direct rupture do not use E's random variation. |
| Rupture splash | 2.5 m radius, 67.5 damage falling to 18 at the edge. Combined damage to one victim from a detonation is capped at 198. The marked victim does not also receive its own splash. |
| C | No Omen action. Keep C for Static's existing stream. |

Timing/lifecycle details:

- Firing the E shot starts its 10-second cooldown. An empty or reloading weapon cannot prime.
- An early second E, before impact, is not queued and does not refresh or spend another prime.
- Detonation is legal only while the relevant mark is active. Expired marks are removed before accepting the input; no late grace period.
- Damage ticks can land at the expiry endpoint; the cosmetic one-second click does not restart at expiry.
- Multiple hits on the same target deal impact damage but do not stack curse ticks or refresh that target's mark.
- Marks belong to the caster and use target IDs so they survive the per-tick rebuild of robot/online target proxies.
- Caster death cancels priming, marks, links and remaining Omen projectiles. Reset and weapon change clear the state. Targets dying/despawning remove their marks.
- Shots and splash respect the existing cover, shield, hill and deck/underwater rules. Do not drop the `below`, ground-flight or sight checks during the map merge.

## Implemented presentation and interface changes

1. **Weapon model and card:** a detailed oxblood relic with split claws around a suspended crimson diamond, raised ribs, rivets, inset cuts, top seal and jagged pommel. One-handed pose with a faint red aura along the holding arm. The same model is used locally, on remote players/robots and in the weapon photo studio. `omen.webp` was captured with the established studio lighting, camera, framing, dimensions and WebP settings.
2. **Shots:** detailed orange/red diamond facets, hot tips, orbiting chips, muzzle and impact particles. Each shot gathers red energy at the muzzle. Red E/X projectiles leave short beam wakes following the sampled curved flight and height, with more strands on higher presets.
3. **Caster's E prime:** a distinct purple six-point intake seal under the player using Omen, with a red inner circle. It draws purple energy inward, changing through magenta to red. Moving packets follow the paths; use/cancellation dissolves the seal. This is separate from the victim's red curse.
4. **Victim curse:** rotating red five-point ground sigil, enlarged 25% for readability. Its reaching lines have varied lengths, directions, wave phases and speeds instead of uniform spokes. The same independent tendril motion is used by the caster seal. X connects marked targets with moving red energy lines.
5. **Tick and expiry effects:** Omen ticks use a red curse effect instead of Static's electric hit effect, including on robots. Expiring sigils unravel and disperse along the ground, with no remaining damage or detonation opportunity.
6. **Rupture:** a brief bright contraction/charge, cracks, larger explosion, layered sparks/shards/rings and smoke; stronger synthesized blast audio. These visual sizes do not increase the gameplay splash radius.
7. **Curse sound:** a deep hollow click at mark landing and once each second while active. `omenCurseBeat` is separate from the half-second damage clock. It uses the weapons mixer and normal distance attenuation; it stops on expiry, detonation and death and respects mute/pause. Ordinary curse-hit sounds stay quiet to avoid doubling the rhythm.
8. **Weapon HUD:** four red diamond ammunition pips and red reload fill. E and X reuse the game's filling circular dials, with tenths during live timers and matching smaller timers beside the cursor. There is no separate orbiting marker around the dials. Touch has CURSE for both E presses, COVENANT for both X presses and AIM support.
9. **Timing cue:** during the last second of a landed curse, the HUD dial, cursor timer and touch button pulse coral/ivory (0.48-second cycle). It marks the actual damage-bonus window, never an unused prime or a volley that missed. Reduced-motion settings use a steady emphasis. Detonation is not restricted to a separate rhythm/minigame window.
10. **Covenant styling:** purple ready/active dial, matching glow, purple cursor timer and touch action. Its full name fits by reducing only the label's type size; countdown digits retain their usual size. The last-second coral cue takes precedence over purple. E keeps the standard state colors.
11. **Selection and tutorial:** Omen is the fourth selectable weapon in practice, solo robots, online selection and tutorial menus. Deadwater and Hollow Wick can use it. The seven lessons use the existing tutorial layout and progression: diamonds, reload, aim, curse, rupture, late rupture, covenant. Keyboard/touch prompts, settings controls and rebinding descriptions all use second E, not C. Only the active Omen tutorial course restores spent cooldowns after its action has ended so lessons can repeat.
12. **Rendering cost and cleanup:** fixed reusable line/particle/beam pools; occupied buffer ranges upload; effects reuse the existing light. Meshes are constructed before warm-up. Detail rises through the existing presets. Beam paths, primers, marks, smoke and links have expiry/reset/death cleanup. Keep the warm-up and interior/terrain integration when merging.

## Additional shared systems changed

### Moving cumulative damage numbers — revision 12

- Applies to **all weapons**, through `ui/outgoing-feedback.js`, including practice targets, bots and online opponents. The existing `outgoingDamage` event already contains each hit's target position; no simulation or network change was needed.
- The running number relocates to the most recent hit location at most every **0.3 seconds** (`OUTGOING_ANCHOR_BEAT`). Fast pellets/stream ticks update pending coordinates; a slower follow-up hit can relocate on the next frame once the interval has elapsed. Further hits keep updating it on that beat.
- The total never resets merely because the target moved. The same DOM node, random offset, birth/fade time, accumulated damage, subtotal/latest addition and per-target identity are retained. Existing expiry after 2.5 seconds without a hit remains intact.
- Visibility is checked at the refreshed location. After hits stop, the number stays at the latest damaged position instead of tracking an unharmed target indefinitely. Separate enemies remain independent, and clear/clock reset removes pending coordinates.
- Incoming damage numbers already follow the rendered local player and keep their existing behavior. The red directional arcs are unchanged in revision 12.
- `tests/outgoing-feedback.test.js` now checks successive moving-target hits from all four weapons, same-volley accumulation, the relocation beat, per-target independence, visibility, no-hit stability and lifecycle clearing.

### Developer target health

- Robot health selection already existed; this work preserves it and adds **Target health (solo)** for stationary boards, moving boards and hay dummies.
- It appears in both unlocked developer interfaces under World: Normal / 100 / 250 / 500 / 1,000 HP.
- `Simulation.practiceTargetHealth` / `syncTargetHealth` apply it only to practice targets, excluding robot/player proxies.
- Changing the maximum refills standing targets and clears their bullet damage. Downed targets keep their respawn timer and return at the selected health.
- Map reset/restart retains the choice. Normal, resetting dev options or locking the tools restores authored defaults, including lighter tutorial targets.
- `dev-wiring.js` rejects the override online; authority/prediction guards keep it out of online play. Developer controls remain hidden until the existing unlock; do not change or bypass that unlock.
- Omen also has unlocked developer toggles for instant reload and no curse cooldowns. Robot spawn toasts now use the weapon registry name so they can say Omen correctly.

### Red directional damage arc — revisions 10–11

- Shares the existing pink gunfire arc's 32-slice canvas drawing. Pink appearance/timing remain the same.
- Red arc sits 24 CSS pixels farther inward, uses a 7.5 px base stroke rather than pink's 12 px, and has a shorter angular span (spread 1 instead of 2). Revision 11 increases thickness from 6 px and minimum strength from .65 to .75 for more presence.
- It appears immediately, holds 160 ms and fades at 2 units/s, lasting about 0.54–0.66 seconds depending on hit strength (revision 10 was about 0.4 seconds). Simultaneous hit directions remain independent.
- It uses red `255,48,64`, less jitter and a subdued soft stroke (softness .22, raised from .18). The center is empty and the canvas ignores pointer input. It works even with sound muted.
- `playerDamage` now optionally carries normalized `sourceDX` / `sourceDZ` toward the incoming hit. This is **opposite the impact force**; do not reverse the death force. When no impact vector exists, robot/arena damage transfer supplies the caster position (curse/stream).
- Damage without a directional source, such as underfoot fire, draws **eight separated arcs** instead of a continuous ring. Each covers 62% of its 45-degree sector, leaving a clear 38% angular gap. They pulse together every .72 seconds from quarter to full strength, with peak core opacity about .57 and a narrower stroke than a directional hit.
- Fire uses separate surround level/hold/phase state in the shared canvas. Repeated damage refreshes its lifetime without resetting the pulse phase; it cannot fill gaps or prolong stale directional hits. Incoming shots remain prominent over the burning cue. Leaving the fire fades the segments away; clear/reset removes both layers. Zero/rejected damage does not show an arc.
- Screen projection follows the rendered player and compensates the nearby ground height so hills/decks cannot distort the bearing. Pause, death, reset and respawn clear it.
- Existing event serialization carries these optional fields; this feature did not separately bump the protocol version.

### Networking, bots and damage reactions

- Omen raises protocol **11 → 12**: `omenPrime` and `omenVolley` inputs, loadout state and marks. Missing-input repetition explicitly clears both one-shot inputs.
- Projectile snapshots/mirrors carry Omen bolts, target-ID marks and remote prime seals, including height/under-deck state. Remote marks count down; stale prime presentation expires after 0.3 seconds.
- Omen events, including `omenCurseBeat`, are forwarded by the host and routed into remote rendering and hearing audio.
- Bot brains support Omen ammunition, reload, aiming, priming and near-expiry ruptures; solo and hosted damage use the same rules.
- Explicit death reactions: `omenShot` leaves an intact fallen body with a head wound; `omenCurse` leaves a charred fallen body; `omenBlast` uses directional gore scatter. Weapon drops are retained. The red tick effect is distinct even though the curse death shares the charred-body reaction.

## Complete changed-file inventory

Paths are relative to the worktree root. “New” files must be included explicitly when packaging; plain `git diff` alone omits untracked files. The table covers the cumulative uncommitted changes, including these notes.

| Path | Status and purpose |
| --- | --- |
| `.gitignore` | Modified: ignores local Omen output. |
| `AGENTS.md` | Modified: system documentation and running-handoff requirement. Merge additions into Claude's newer copy. |
| `CLAUDE_HANDOFF_OMEN.md` | New: this running handoff. |
| `SIGHTLINE_DESIGN.md` | Current implemented Sightline behavior, balance, controls and integration decisions; supersedes the discussion draft. |
| `src/config/gameplay.js` | Modified: complete `OMEN` tuning block. |
| `src/config/keybinds.js` | Modified: curse/covenant descriptions. |
| `src/items.js` | Modified: Omen registry, controls, stats and HUD configuration. |
| `src/weapons/omen.js` | New: pure rules, timers, targeting, damage, collision and cleanup. |
| `src/weapons/omen-model.js` | New: shared relic weapon model. |
| `src/weapons/omen-view.js` | New: pose, aura, shots, sigils, tendrils, links, bursts and pools. |
| `src/weapons/weapon-photos.js` | Modified: Omen in the existing shared photo studio. |
| `src/assets/weapons/omen.webp` | New: shipped transparent weapon-card image. |
| `src/simulation.js` | Modified: Omen lifecycle/inputs, practice target-health override and directional damage metadata. |
| `src/main.js` | Modified: Omen style/input/event/HUD integration; damage arc creation, event handling, frame update and lifecycle cleanup. |
| `src/aim-damping.js` | Modified: Omen muzzle lateral offset. |
| `src/audio.js` | Modified: Omen shot/prime/impact/burst/reload/curse-click sounds and routing. |
| `src/bots/robot-brain.js` | Modified: Omen combat decisions. |
| `src/bots/bot-match.js` | Modified: Omen reload/noise/hold-fire integration; attacker position for force-free damage. |
| `src/net/arena.js` | Modified: Omen round-input integration and attacker bearing during damage transfer. |
| `src/net/host-session.js` | Modified: shared Omen events and lost-input handling. |
| `src/net/protocol.js` | Modified: protocol 12, Omen inputs and loadout/marks. |
| `src/net/projectiles.js` | Modified: Omen projectile/mark/primer packing, mirrors and draw state. |
| `src/remote-players.js` | Modified: remote Omen weapon model. |
| `src/render/renderer.js` | Modified: Omen view lifecycle/render/audio-event presentation, red curse hits and reset. |
| `src/render/warm-up.js` | Modified: warms Omen effect meshes. |
| `src/effects/death-reactions.js` | Modified: explicit Omen death profiles. |
| `src/effects/effects-detail.js` | Modified: exports existing smoke material for reuse. |
| `src/styles/omen.css` | New: Omen ammo, dials, cursor, touch, purple glow and timing emphasis. |
| `src/styles/mobile-controls.css` | Modified: room for both Omen ability dials. |
| `src/styles/menu-theme.css` | Modified: shared noninteractive canvas positioning and hiding for damage/sound arcs. |
| `src/ui/omen-state.js` | New: shared E/X readouts and true late-window cue. |
| `src/ui/ability-cooldown.js` | Modified: numeric timer text keeps number styling rather than word sizing. |
| `src/ui/ability-hud.js` | Modified: Omen E/X dials, touch readouts and cue cleanup when switching weapons. |
| `src/ui/aim-overlay.js` | Modified: cursor-adjacent Omen timers and late/purple presentation. |
| `src/ui/weapon-hud.js` | Modified: Omen ammo, reload, priming and focus readouts. |
| `src/ui/x-ability-state.js` | Modified: Covenant active/cooldown/ready state. |
| `src/ui/map-cards.js` | Modified: registers Omen card image; preserve map thumbnail changes from Claude. |
| `src/ui/menu.js` | Modified: Omen selection label/description routing. |
| `src/ui/dev-options.js` | Modified: Omen toggles and solo target health select. |
| `src/ui/dev-wiring.js` | Modified: target-health syncing/online guard and registry-based robot weapon names. |
| `src/ui/fire-indicator.js` | Modified: reusable directional-canvas factory; original pink arc wrapper retained. |
| `src/ui/damage-indicator.js` | New: red arc tuning, hit handling and terrain-correct bearing projection. |
| `src/ui/outgoing-feedback.js` | Modified: periodic re-anchoring of cumulative damage totals to the latest hit position across all weapons. |
| `src/tutorial.js` | Modified: Omen's seven lessons, prompts, progression and course-specific cooldown recovery. |
| `tests/omen.test.js` | New: gameplay, presentation, timers, damage, network/terrain/death/cleanup regression coverage. |
| `tests/damage-indicator.test.js` | New: arc geometry/timing, projection, source metadata, lethal force, no-source fallback and robot delivery. |
| `tests/outgoing-feedback.test.js` | Modified: moving totals, preserved accumulation/identity, relocation cadence, all-weapon coverage and lifecycle checks. |
| `tests/dev-window.test.js` | Modified: target-health controls in both developer interfaces. |
| `tests/flight-audio.test.js` | Modified: hollow curse beat and mute/pause handling. |
| `tests/health.test.js` | Modified: target override, respawn/reset/default restoration and online/proxy isolation. |
| `tests/items.test.js` | Modified: fourth weapon registry expectation. |
| `tests/net.test.js` | Modified: Omen authority/controls/marks and damage-bearing delivery to a joiner. |
| `tests/tutorial.test.js` | Modified: Omen course progression, timing and prompts. |
| `tests/golden-flat.test.js` | Modified: audited robot/hosted hashes for new directional event metadata; reason recorded in header. |
| `tools/capture-weapons.mjs` | Modified: optional weapon selection, registry IDs, corrected module path, configurable port/Chromium/Python and Windows-safe temporary path handling. |

## Verification and evidence

- Latest full source suite: **929 passed, 0 failed**, using `node --test tests/*.test.js`. Log: `output/omen/sightline-r17-final-tests.log`. Includes 41 Sightline tests and all existing Omen/shared UI/map regressions.
- Latest source changes passed a static `no-undef` check for main.js and the affected simulation/bot/arena/indicator wiring. `git diff --check` passed.
- Latest artifact revision: 17. Built using `node output/omen/build-artifact.mjs` and copied to the Sightline preview filename. Log: `output/omen/sightline-r17-build.log`. Vite's size advisory is expected for the single-file artifact.
- Revision-12 moving-number checks passed in separate Performance desktop and 844 × 390 touch previews on Hollow Wick, through actual simulation events and main.js HUD routing: the same node moved from the initial hit position to the latest one, and the accumulated number increased from 10 to 30 rather than resetting. No browser errors. Script: `output/omen/damage-follow-qa.mjs`; screenshots: `damage-follow-r12-desktop.png` / `damage-follow-r12-phone.png` (phone image visually inspected). The changed outgoing-feedback module passed the undefined-name check.
- Separate headless browser checks on Hollow Wick, repeated for revision 11: Potato desktop, Performance desktop and Performance touch at 844 × 390; both arcs coexist with about 24 px separation, correct source direction and player center, muted sound, fade, pause/resume cleanup and death hiding. Continuous underfoot fire kept eight separated arcs while observed core opacity cycled between about .14 and .57. No page/console errors. Script: `output/omen/damage-arc-qa.mjs`; current screenshots: `damage-arc-r11-<preset>-<desktop|phone>.png` and `burn-arc-r11-<preset>-<desktop|phone>.png`. Desktop and phone fire-ring screenshots were visually inspected.
- Standalone revision-10 artifact on Hollow Wick passed startup, new canvas presence, 4-round ammo, Omen controls, 5-second E-prime expiry/cost, reload/fire and weapon-menu checks without browser errors. Script: `output/omen/damage-arc-artifact-qa.mjs`.
- Earlier Omen checks cover the seven-step tutorial, E/X timing, curse audio cadence, purple/red seal palette, tendril motion, all five graphics tiers and effect cleanup. Relevant scripts include `e-controls-qa.mjs`, `timing-cue-qa.mjs`, `curse-presentation-qa.mjs`, `covenant-ui-qa.mjs`, and `target-health-qa.mjs` in `output/omen/`. Some older scratch scripts predate second-E controls: inspect them before reuse.
- Browser runs use headless software rendering; they establish correctness and visual layout, not representative phone/MacBook frame-rate measurements. The owner's visible game tab was not used for testing.

Golden replay audit:

| Replay | Before directional metadata | Current |
| --- | --- | --- |
| Static | `8500a3fd` | unchanged |
| Rifle | `5c57348a` | unchanged |
| Shotgun | `dc6257e4` | unchanged |
| Robots | `a370e78a` | `539ae613` |
| Hosted | `bb4e727d` | `db8a8c3d` |

Before updating the two hashes, all five runs were replayed with **only** `sourceDX` and `sourceDZ` omitted from serialization; every old hash matched. Thus the new event fields account for the difference, with no health/movement/death-force change. Audit script: `output/omen/damage-metadata-audit.mjs`. Do not blindly re-record hashes after merging newer map work.

## When combining with Claude's map work

This is a checklist for the eventual authorized integration, not a record of a merge already done.

1. Inspect both branches/working copies and confirm the integration base. Keep Claude's newer terrain, water, map data, spawns, interiors, audio and rendering changes. This branch does not contain changes to map/terrain data files.
2. Apply the changes as reviewed hunks/patches, including every new source/test/image file. Avoid whole-file replacement of shared code or AGENTS.md. A patch exported from tracked files alone would omit the new Omen modules and card.
3. Prioritize shared-file conflicts in `main.js`, `simulation.js`, `renderer.js`, `audio.js`, `config/gameplay.js`, `arena.js`, `bot-match.js`, `robot-brain.js`, protocol/projectile files, menu/HUD styles, tutorial and AGENTS.md. Preserve both sides' imports, constructor/reset/frame hooks and event handling.
4. If Claude's network protocol advanced beyond 12, integrate Omen's fields into the newest protocol and choose the appropriate final version; do not lower it to 12. Preserve `below`/terrain state and one-shot input handling. Check host and joiner use the same final protocol.
5. Keep the shared damage arc with its source metadata and caster fallback in both solo and arena damage paths. Preserve the original impact vector for death reactions and weapon drops.
6. Keep all developer features behind the existing unlock and practice overrides offline. Retain the newer branch's robot health behavior.
7. Re-run the complete tests and production/artifact build after integration. Recheck Omen and the other three weapons, tutorial, target health, real host/joiner behavior, terrain/deck effects, damage-bearing cleanup and phone UI. Validate the final golden replay against intentional changes rather than merely copying hashes.
8. Rebuild the local artifact from the combined source and update this note with the integration commit/base, actual test results and remaining issues. Hardware performance and owner balance/play-feel review remain valuable before a release.
9. Commit/push/pull only when the owner asks. Do not publish or send these notes to anyone automatically.

## Subsequent changes

- 2026-09-26: Created this complete cumulative handoff after revision 10 and linked it from AGENTS.md. No gameplay changes in this documentation turn. Append new changes here and update the affected sections above; record current behavior, not superseded settings.
- 2026-09-26, revision 11: Owner requested gaps and pulsing while on fire, and slightly longer/more prominent regular red hit arcs. Updated `src/ui/fire-indicator.js`, `src/ui/damage-indicator.js`, `tests/damage-indicator.test.js`, `AGENTS.md` and this handoff. Current values and lifecycle are documented above. No simulation, damage, network or golden replay changes. Full suite: 886 passed; static undefined-name check, desktop/phone browser checks and artifact build passed.
- 2026-09-26, revision 12: Owner requested accumulating damage numbers to catch up to moving victims after a few damage ticks without resetting, for all weapons. Updated `src/ui/outgoing-feedback.js`, `tests/outgoing-feedback.test.js`, AGENTS.md and this handoff. Uses a 0.3-second position refresh with the same running total. Full suite: 888 passed; desktop/phone checks and artifact build passed. Owner wants to decide the next weapon together: Maul, Ichor and Sightline were proposed as a shortlist, with Maul recommended for its guided-rocket play. No selection is final and no next-weapon implementation has begun.
- 2026-09-26, subsequent design discussion: **Sightline is now selected.** The owner asked to discuss before building and supplied a revised sniper/sidearm kit, 130-degree scoped vision, weighted public laser, delayed physical piercing bullets, 493–505 ordinary damage, 4.2-second rifle reload, 35-damage/10-round sidearm and a 60-second explosive-round X. `SIGHTLINE_DESIGN.md` preserves the full current brief, distinguishes proposals and lists open decisions. This supersedes the earlier unresolved shortlist. No Sightline gameplay code has been written; preview remains revision 12.
- 2026-09-26, Sightline follow-up: Latest requirements supersede the previous cone/cooldown numbers: **105-degree slowly turning scope cone**, players/birds/projectiles hidden outside it, **70-second X cooldown**, full 4.2-second special reload. Standing X temporarily stows the pistol and loads the sniper while moving, never auto-crouching; E alone enters the rifle's firing stance. Crouched reloads remain available. A loaded special round gives the muzzle a reddish heat/smoke cue until fired. Normal standing reloads operate on the pistol. Updated `SIGHTLINE_DESIGN.md`; return-to-pistol and interruption details remain discussion points. No gameplay/code change and no new artifact revision.
- 2026-09-26, Sightline confirmation: **Standing X reload automatically returns to the pistol**, with the special round retained in the slung rifle; E subsequently draws it in crouch. This settles the return-to-pistol question above. The suggested amber vent/chamber loaded-round effect remains a proposal, not an approved replacement. Design notes updated only; no Sightline implementation or artifact rebuild.

- 2026-09-26, revision 13: Sightline implemented and amber visual approved. All prior discussion-only statements above are historical. Controls, rifle/sidearm behavior, scope concealment, X, HUD, photo, tutorial, bots, protocol and tests are recorded in the current section. Still uncommitted; no changes were applied to the separate map checkout.

Inventory audit: all 69 changed/untracked source, test, asset and documentation paths are named above. Ignored preview/QA output is excluded.

Previous delivery: revision 13 standalone artifact passed real-control startup, standing X loading, automatic pistol return, E stance, scope, explosive fire and pistol fire with no browser errors (`output/omen/sightline-artifact-qa.log`). Opened in a new visible in-app tab with Sightline equipped on Hollow Wick; prior user tabs were not controlled. `git diff --check` and the 67-file handoff inventory audit passed.

- 2026-09-26, revision 14: renamed the Sightline sidearm to Sidekick in every player-facing label and reduced its shared per-shot damage from 35 to 27. Updated current design/handoff notes. Added near/far target, prop and host-authority damage coverage; 909 tests pass. Standalone artifact rebuilt. No commit, push, pull or merge.

Revision 14 delivery: standalone browser flow passed with no errors; the Sidekick HUD also fits at 844 x 390, including the amber-round status (`output/omen/side-kick-artifact-qa.log`, `output/omen/side-kick-mobile.png`). Static undefined-name check, artifact build, diff whitespace and all 67 inventory paths passed. Opened the new revision 14 artifact tab; the prior user tab was not controlled.

- 2026-09-27, revision 15: implemented the owner's scope/video fixes, animation timing and cancel rule, visible regular/bright Breach lasers, shooter-safe blasts, dual swapping ammo rows and horizontal flat rifle round. Source verification: 919 tests pass, including 31 Sightline tests; unchanged old golden replays, static undefined-name checks and 69-file inventory audit pass. New source files: `src/render/scope-shading.js` and `src/ui/sightline-ammo.js`. All shared source paths are inventoried above. No edits were applied to the separate map checkout and no commit/push/pull/merge was performed.

Revision 15 follow-up: Sidekick now rolls integer 23–27 damage (base 25, ±2), once at launch, shared by bots/players and preserved through impact on opponents or breakable props. Controls show the range; tests cover all five rolls, near/far shots, props and host-authoritative damage. Remote snapshots also retain Sidekick reload state for its magazine/hand animation.

Revision 15 verification and performance evidence:
- Final full suite: 919 passed, 0 failed (`output/omen/sightline-r15-tests.log`); 31 Sightline tests cover setup/cancel, reload aim exit, owner immunity, all five Sidekick damage rolls, camera edge placement, cached optics/path invalidation, hidden laser recovery, animated poses, typed deaths, tutorial, bots and host authority. Updated modules pass `no-undef`; `git diff --check` passes. Source scan finds no spaced Side Kick name; canonical name is Sidekick.
- Separate headless Hollow Wick checks: Potato desktop and touch-sized Performance pass setup, visible laser, scope, fire, forced unzoom/reload, fresh aim press, X load/automatic Sidekick return, E/amber laser and special fire at 500 HP. Final direct scene draw submissions average about 1.44 ms (145 calls) / 2.20 ms (155 calls), respectively. These are JavaScript submission timings on software rendering, not GPU cost or device FPS. The view is now much wider than the original baseline, so those earlier totals are not an equal-view comparison. No shader was added when these presets first entered scope. Evidence: `output/omen/sightline-r15-browser.log` and `r15-scope-potato.png`, `r15-scope-performance.png`, `r15-hot-laser-potato.png`.
- Extreme full flow passes separately (`output/omen/sightline-r15-extreme.log`), with no new shader IDs on entering scope and no errors. One earlier run counted 218 -> 219 during startup/entry; the dedicated repeat already had 219 before scope. Its draw-call counter is only the final postprocessing pass and must not be compared with the other presets. All scope/hot-laser screenshots were inspected. Real phone/Intel MacBook FPS still needs owner playtesting.
- Final standalone build is 2,737,003 bytes and contains the latest Sidekick spelling, 23–27 damage roll and horizontal rifle-round HUD (`output/omen/sightline-r15-build.log`). Both artifact filenames contain the same build. The production artifact has no `__capture` development hooks.
- Standalone keyboard flow passed with zero browser errors: X reload -> automatic Sidekick -> two-second E setup -> scope -> special fire -> empty ammo -> R reload -> Sidekick fire. Horizontal round stays one shape, fills left-to-right, turns amber, and scales into the stowed row. Mobile-sized 844 x 390 HUD fits. `output/omen/sightline-r15-artifact-qa.log`; inspected screenshots `sightline-r15-artifact-scope.png` and `sightline-r15-artifact-mobile.png`. All 69 changed/new source, test, asset and documentation paths remain inventoried; ignored QA/build files are not merge inputs.
Revision 15 delivered in a fresh visible in-app tab with Sightline equipped on Hollow Wick; accessibility state confirms Sidekick 10/10, rifle 1/1 and 500 HP. The prior user tab was left alone. Owner wants to discuss Sidekick as an independent weapon with E/X abilities after this task; that work is explicitly deferred and no standalone Sidekick weapon or new abilities have been added.

Revision 16: renamed the sniper's player-facing name from rifle to Sightline in the large/stowed ammo row, ready/empty/reload status, accessibility labels, controls and tutorial. Updated src/ui/sightline-ammo.js, src/ui/weapon-hud.js, src/ui/ability-hud.js, src/items.js, src/tutorial.js, AGENTS.md, SIGHTLINE_DESIGN.md and this handoff; all are already inventoried above. The label change is copy only: internal rifle IDs, gameplay, damage, photos and Nominal stay unchanged. Sidekick remains part of Sightline; independent abilities are still deferred.
Revision 16 follow-up: fixed the unwanted laser while aiming Sidekick. src/weapons/sightline-view.js now requires crouched Sightline before drawing a laser, for local and remote players. Its existing regression test in tests/sightline.test.js now covers standing aim, remote Sidekick and switching back while aim stays held. Sidekick bloom, scoped Sightline laser, projectile trails and damage are unchanged.

Revision 16 verification: all 919 tests pass (output/omen/sightline-r16-tests.log); changed source passes no-undef and git diff --check. Rebuilt both artifact filenames, 2,737,096 bytes (output/omen/sightline-r16-build.log). A separate hidden artifact tab confirms Sidekick and Sightline ammo names and Sightline setup accessibility labels; the user session was not used for testing. Local/remote Sidekick laser absence and switching out of aimed Sightline are covered by the updated existing rendering regression.


## Revision 17 changes and merge notes

- Current behavior: 45-degree scope, half revision-16 reach (1.325× height), slower camera/cone (0.35 rad/s, acceleration 1.1), responsive independent laser/shot, and no scope zoom indoors or in crops. Shared view uniforms and player snapshots retain independent cone direction; own guide stays visible outside the lagging cone, hidden targets/projectiles remain concealed.
- Sightline/Sidekick gets two dash charges; recharge per charge is 1.52 s rather than 1.6 s, preserving the 0.6 s delay, crouch restriction and water penalties. X can interrupt a normal Sightline reload for a new full 4.2 s Breach load if ready; repeated X does not restart the Breach load.
- New `src/weapons/sightline-flight.js` unifies bullet/laser straight trajectories and true height collision. Low rocks/debris below the elevated round are cleared; breakables are pierced; true terrain/tall cover stops it. Cursor elevation sets the straight slope instead of terrain draping. Actual Hollow Wick bridge checks cover the high-bank crossing; under-deck placement is retained. Remote projectiles interpolate vertical slope and respect the stop distance. Ordinary weapons retain their terrain-flight rules.
- Transparent bridge meshes formerly overpainted even an above-deck laser. Sightline batches now draw after them with depth testing still enabled, so below-deck shots remain hidden by solid decks. Normal beam core/halo are two continuous instances instead of dozens of segmented pieces; Breach retains its red width/glow and straight moving amber highlights, without angled kinks.
- Rifle draw/return now pull away from the back, turn outside the shoulder, and then shoulder. Sling is farther from the torso; reload tilt and support hands clear the character. Numerical checks sample all visible rifle vertices through 81 poses for draw, return and both reloads.
- Files changed this revision: `src/config/gameplay.js`, `src/simulation.js`, `src/weapons/sightline.js`, new `src/weapons/sightline-flight.js`, `src/weapons/sightline-model.js`, `src/weapons/sightline-view.js`, `src/weapons/rifle-pose.js`, `src/render/renderer.js`, `src/render/scope-shading.js`, `src/render/interior-visibility.js`, `src/ui/aim-overlay.js`, `src/net/projectiles.js`, `src/items.js`, `src/tutorial.js`, `tests/sightline.test.js`, and these three documentation files. All already appear in the full inventory except the new flight module added above. A temporary change to `src/world/heightfield.js` was fully undone; do not transfer any heightfield changes for this revision.
- Hidden source fixture `output/omen/sightline-r17-check.html` visually verified straight ordinary/Breach beams above the actual bridge in Performance and Potato. A 60-degree aiming change moved the cone about 17 degrees in one second while the laser reached its new bearing. Performance fixed-pose normal beam: 2 instances, 95 draws, about 0.95 ms CPU update/render submission; Potato Breach: 9 instances, 91 draws, about 1.19 ms. These local timings are not phone/MacBook FPS claims. Fixture is ignored and not shipped.
- Full run initially passed 927/927 before the final bridge/remote test; the expanded parallel 928-test run hit an unrelated existing heap-allocation threshold in `tests/hollow-life.test.js`. Rechecked with serial execution to avoid timing/GC variance; final result is recorded below. Source no-undef and diff whitespace checks passed. No commits, pushes, pulls, merges or edits to the owner/map checkout.

Revision 17 final verification: **929 passed, 0 failed** (`output/omen/sightline-r17-final-tests.log`), including 41 Sightline cases and unchanged golden replays. The earlier isolated heap threshold failure passed both a focused repeat and the final full suite; no unrelated map test or implementation was edited. Static no-undef and whitespace checks pass; the 71-file handoff inventory has no omissions. Visual pose sheet (`output/omen/sightline-r17-poses.html`) checked sling, mid-setup, held, normal reload, standing Breach and return.

Revision 17 final owner follow-up: fixed red bloom quadrilateral twisting when its corners straddled bridge/terrain elevations. Both Sightline and Sidekick now project brackets and red fill on one firing plane with their own correct muzzle offsets; other weapons remain unchanged. `sightlineAimPlane` in the new flight helper and `src/ui/aim-overlay.js` implement it; a rotating bridge-edge regression and hidden `sightline-r17-cone.html` browser fixture verify it. User screenshots remained revision 16 while this work was underway; new delivery is revision 17.

Revision 17 artifact delivery verification: final self-contained files are 2,741,320 bytes (`output/omen/sightline-r17-build.log`). A separate hidden artifact tab confirmed full Sidekick/Sightline ammo, 500 HP, two available dodges, the two-second E setup, normal firing/reload and X changing that ordinary reload to “loading explosive round.” The user's revision-16 tab was left untouched. Final source fixture checks used Performance/Potato and the actual Hollow Wick bridge; animation poses and bloom projection were visually inspected. A fresh revision-17 tab is the delivery target.


## Revision 18 changes and merge notes

- E setup reduced from 2 s to 4/3 s (1.33 s); quick rifle draw is 0.28 s, then crouch/bipod settling completes setup. E still cancels immediately and rifle shots still wait for setup. Standing/Sidekick return remains 0.42 s. Controls and tutorial match.
- Replaced stretching Sightline arms with fixed 0.33 m upper arms / 0.35 m forearms, moving the support grip to the receiver. Reload hands insert the shell closer to the body. Three-stage draw clears the hat/torso swiftly; the sling, stock fittings and reload path also clear the body. A modeled bipod folds beside the barrel while slung or standing and deploys during crouch. This is code geometry in the existing flat-shaded palette.
- Laser and precise aim require outdoor scope eligibility. Interiors and standing/burning crops use the red unscoped bloom cone and cursor-limited spread even with RMB/Shift held. Local and remote laser gating share this rule.
- Fixed alignment sources: Sightline cursor rays meet its 1.28 m firing surface rather than the ordinary 0.7 m plane; the barrel no longer has a sideways yaw; point aim/bots/flight use the Sightline-specific 0.40 m lateral and 1.73 m forward muzzle offsets. Sidekick keeps its own offset. Both normal and Breach beams attach to the animated muzzle and remain one straight core to the collision-tested endpoint. Cursor smoothing no longer adds focused-aim weight to this loadout; only the cone/camera turns slowly.
- Shared files changed in revision 18: `src/config/gameplay.js`, `src/aim-damping.js`, `src/main.js`, `src/bots/robot-brain.js`, `src/render/renderer.js`, `src/ui/aim-cursor.js`, `src/weapons/rifle-pose.js`, `src/items.js`, `src/tutorial.js`, `tests/aim-cursor.test.js`, and `AGENTS.md`. Weapon-worktree files updated: `src/weapons/sightline.js`, `src/weapons/sightline-flight.js`, `src/weapons/sightline-model.js`, `src/weapons/sightline-view.js`, `tests/sightline.test.js`, `SIGHTLINE_DESIGN.md`, and this handoff. The new shared cursor file/test are included here in the full inventory. `src/world/heightfield.js` has no content diff (only working-copy line-ending normalization); no terrain change is part of this revision.
- Focused checks: 51 passed (46 Sightline and 5 aim-cursor). New coverage verifies firing lock/cancel with the shorter setup, fixed limb lengths and compact support grip, full vertex clearance through draw/return/reloads, bipod deployment/folding, no indoor local/remote laser, screen-to-world-to-laser alignment on flat ground and actual Hollow Wick bank/bridge terrain, and normal/Breach guide attachment throughout draw.
- Hidden pose gallery inspected sling, 0.28 s draw, 1.33 s planted bipod, normal reload, standing Breach and return. Hidden Performance bridge fixture verifies the continuous attached beam above the deck: 9 Breach guide instances, 104 scene draws, about 1.31 ms CPU update/render submission on this local browser (not phone/MacBook FPS). Full suite and standalone delivery verification follow below. No commits, pushes, pulls, merges or changes to the separate map checkout.

Revision 18 owner follow-up: scoped camera reach increased about 10% from revision 17 (scopeScale 1.325 -> 1.46). The 45-degree cone, 0.35 rad/s camera turn, rear-edge player placement and small elevation bonus remain. Rifle maximum range continues to follow the scoped reach plus its existing 10% margin. Updated config, camera regression, current design and AGENTS in the same change.

Revision 18 projectile follow-up: the owner asked for a much faster bullet after the initial suggestion. Ordinary and Breach Sightline rounds now travel at 120 m/s, twice the original 60 m/s. The 0.16 s laser-blanking commitment remains, with a locked non-homing path so a perpendicular dodge can escape it. Sidekick stays 65 m/s. `src/net/projectiles.js` now takes both speeds from SIGHTLINE tuning instead of hardcoded values so remote interpolation matches simulation. This shared file is part of the revision-18 merge inventory too.

Revision 18 final verification: **936 tests passed, 0 failed** (`output/omen/sightline-r18-final-tests.log`), including 47 Sightline cases. The new host simulation check confirms a stationary player at 20 m is hit, but a player beginning a perpendicular dodge 0.20 s after the firing input escapes all damage; rounds remain physical and remote snapshots use the new 120 m/s tuning. Source no-undef checks and diff whitespace pass; all 73 changed/new paths are covered by the handoff inventory (the heightfield entry is line endings only).

Standalone files are **2,743,005 bytes** (`output/omen/sightline-r18-build.log`). Both artifact filenames carry the same build. Hidden artifact keyboard QA verified setup -> fire -> normal reload -> X replaces it with Breach, at 500 HP with two dash charges and no console errors. Source visual checks verified natural arms, the planted bipod, both laser styles above the bridge, and the final longer camera. Performance/Potato CPU submission measurements before the last camera tweak were about 1.06/1.03 ms for ordinary/Breach poses respectively; these are local browser observations, not target-device FPS claims. A fresh revision-18 tab is the owner delivery; the existing revision-17 session is left untouched. All temporary QA pages are ignored, not part of the merge.


## Revision 19 — room knowledge, Sightline bots and placement

Owner requests, 2026-09-27. Supersedes earlier free-aim/always-lit laser notes.
- Room combat: bots see an indoor enemy only from the same building, including open sheds. Unknown hidden occupants do not influence patrol hunches. A witnessed entry records only its doorway and last observed movement; no hidden live coordinates or teammate callout can move that memory. Bots may push the entrance, hold outside, or occasionally probe the known entry lane, with expiry. Indoors: short 0.32 s attack windows then 0.85–1.4 s pauses. Blind probes: 0.16 s then 2.5–4.3 s pauses; no blind abilities tracking hidden bodies.
- Roof concealment: no occupant of any building opens a position-revealing roof circle. Open sheds were the loophole. Remote character roots (including rings and weapons) hide in foreign rooms; entering the same shed reveals them through normal view rules and fades your roof.
- Sightline bots: periodic 7–10 s lane scans between travel, a .24 rad/s sweep with inspection pauses, 45-degree scoped sensing without all-round nearby vision, reaction/settling before firing, lead for .16 s commitment + 120 m/s flight. Use Sidekick when pressed closely, reposition on danger or lost lanes, finish normal reloads and load Breach with normal X. No changes to health/ammo/damage or off-screen firing fairness. BOT_INTERIOR / BOT_SIGHTLINE are tunables in config/gameplay.js.
- Breach flight stops at cursor range even when scoped; hills no longer let it overshoot. Earlier bodies/solid cover still intercept. Regular aimed rounds retain their normal long range. The guide passes the exact cursor distance to the same flight helper for remote and local guns.
- Slight scoped cursor weight: rate 28, maxSpeed 3400 px/s; Sidekick/hip controls remain responsive. No red laser with an empty magazine, including remote players; rifleAmmo now travels in the existing player sightline object (protocol 13 shape supports it).
- Local guide: the animated muzzle sits below the simulation firing plane. Drawing that connector as ordinary world geometry could enter a hill and emerge again even though the physical round cleared it. The local guide now draws after fog/decks as a placement overlay, clipped by the existing physical flight/cover query. It stays straight and attached to the barrel. Remote guides/bullets remain depth-tested, retaining concealment. No added render pass or extra draw call.

Revision 19 touched paths (in addition to the cumulative inventory above):
- New: src/bots/interior-tactics.js, src/bots/sightline-tactics.js, tests/bot-interiors.test.js, tests/bot-sightline.test.js.
- Shared: src/bots/robot-brain.js, src/bots/bot-match.js, src/config/gameplay.js, src/world/roof-fade.js, src/render/vision-polygons.js, src/render/renderer.js, src/main.js, src/ui/aim-cursor.js, src/items.js, src/tutorial.js.
- Sightline: src/weapons/sightline.js, src/weapons/sightline-view.js, tests/sightline.test.js, tests/aim-cursor.test.js.
- Other tests/docs: tests/roof-fade.test.js, tests/golden-flat.test.js, AGENTS.md, SIGHTLINE_DESIGN.md, CLAUDE_HANDOFF_OMEN.md.
- src/render/vision.js, like src/world/heightfield.js, has only working-copy line-ending normalization and no content diff. Do not treat these as map/vision logic patches.

Golden replay audit: the hosted Deadwater fight intentionally changes under the requested room tactics. Instrumentation records 99 robot ticks in rail-freight-hall/supplies and 420 ticks remembering witnessed room entry. Only hosted was updated, db8a8c3d -> a4dc5523. Both repeated hosted runs match; the other four old hashes are unchanged. Audit output: output/omen/r19-golden-audit.mjs (ignored scratch).


Revision 19 verification and delivery:
- 76 focused tests passed (room tactics/concealment, sniper scanning/tracking/reloads, Sightline flight/visuals, roof fade, cursor weight). Full suite: **954/954 passed** with --test-concurrency=1 (output/omen/r19-final-serial-tests.log). A prior parallel run exposed the existing unseeded wading-shot and heap-growth timing sensitivities; neither unrelated test was weakened or edited. The wading rerun passed and the serial suite passed both. no-undef and git diff --check pass; all 81 status paths occur in this handoff inventory.
- Hidden browser checks: south woodshed outside = bot hidden / roof opacity 1 / only the local outdoor roof patch; inside = bot visible / zero occupant roof patches / roof faded to effectively zero. Final continuous Breach beam inspected above the Hollow Wick bridge on Performance and Potato. Local CPU update/render submission averages about 1.34 ms / 1.00 ms respectively, 113 / 103 total scene draws, 9 Breach guide instances. These are local observations, not phone or Intel MacBook FPS claims. A 1332-ray hill audit confirms the lower animated-muzzle connector can intersect terrain even when its collision-tested firing plane is clear, motivating the overlay fix.
- Standalone keyboard check: E setup, shot -> empty, R reload interrupted by X -> full Breach load. 500 HP, two dashes; no console errors.
- Both artifact filenames now contain **2,750,177 bytes**, SHA256 **B702F6173F9FAFC4493E1E82584909DDC1C967EA402271B1F147771BC420DEF7**. Build log: output/omen/r19-build.log. Delivery URL: http://127.0.0.1:5792/Deadshift-Sightline.html?play=1&weapon=sightline&map=hollow-wick&autostart=1&revision=19 . Fresh delivery tab; the user's existing revision-18 game is untouched. No commits, pushes, pulls or merges. Separate map checkout untouched.


## Revision 20 — Breach cooldown

Owner requested Sightline X cooldown of **50 seconds** (previously 70), still starting on firing commitment. Updated src/config/gameplay.js, src/items.js, src/tutorial.js, tests/sightline.test.js, SIGHTLINE_DESIGN.md, AGENTS.md and this CLAUDE_HANDOFF_OMEN.md. Earlier 70-second entries are historical. HUD and bots consume the shared setting.

Revision 20 also includes the owner’s speed and bot-reaction requests: Sightline/ordinary Breach speed 120 -> **114 m/s** (5% slower), Sidekick unchanged. New **src/bots/laser-response.js** and **tests/bot-laser-response.test.js** implement and test delayed visible-laser awareness, solid-cover selection, diagonal charges, sideways evasions, Breach caution, target reprioritization, ally limits, physical beam range/height/cover, and ordinary dodge expenditure. Shared changed paths: src/bots/robot-brain.js (observe/reaction planning, meaningful sniper cover, snapshot copying), src/bots/sightline-tactics.js (stand to escape), src/bots/bot-match.js and src/net/arena-robots.js (carry visible shooter below-deck stance), src/config/gameplay.js (speed/BOT_LASER), tests/sightline.test.js and tests/bot-sightline.test.js (updated speed/reaction checks), AGENTS.md and SIGHTLINE_DESIGN.md. Initial cooldown changes listed above remain included. No final revision-20 artifact had been delivered before these follow-ups.

Revision 20 final verification: **960/960 tests passed** in the serial full suite (output/omen/r20-full-tests.log), including 94 focused bot/Sightline/flat-replay checks. All five golden replay hashes remain unchanged from revision 19. Changed JS no-undef check and diff whitespace pass; all 83 git-status paths are documented. Artifact filenames match at **2,753,506 bytes**, SHA256 **c58ba3b108854118153b54ea85d643f4477c2c5ac7b7890cf7d27d3265091140**; build log output/omen/r20-build.log. Inline bundle verified to contain 50-second cooldown, 114 m/s speed and matching controls/tutorial copy. Delivery URL: http://127.0.0.1:5792/Deadshift-Sightline.html?play=1&weapon=sightline&map=hollow-wick&autostart=1&revision=20 . No commit/push/pull/merge, and the separate map checkout remains untouched.


### Local weapon preview revision 21 (2026-09-27)

Omen and Sightline artwork is 12% larger in weapon menus, round/practice picks and robot/dev dropdowns. Shared data-weapon-art tags on the image preserve scaling when a picker copies its thumbnail; CSS scale is separate from the existing hover transform. Card sizes and other artwork stay the same. Files: src/styles/menu-theme.css, src/ui/menu.js, src/ui/weapon-grid.js, src/ui/weapon-pick.js.

Tutorial copy (src/tutorial.js) now gives a short action and one useful tip per step across all courses, especially Omen and Sightline. Detailed stat lists and the multiplayer/bot respawn tip are removed from tutorial completion. Existing lesson goals, credits, keycaps, touch prompts and mechanics stay intact.

Sightline's loaded Breach cue (src/weapons/sightline-model.js) uses brighter yellow vents/chamber, a pale yellow muzzle rim and soft yellow light around the barrel tip and chamber. The light follows the held/slung weapon, appears late in X loading, and disappears with the special round. The chamber and muzzle glow breathe at slightly offset rhythms, with a gentle flicker and five small yellow sparks spiraling forward from the muzzle. Three vertex-faded discs use two meshes, plus a muzzle rim and one instanced spark batch; no dynamic light, full-screen effect, or per-frame particle allocation. Normal depth and room/scope concealment remain.

Revision 21 verification: 70/70 existing focused checks passed (tutorial, Sightline, weapon-grid). Sightline model coverage now checks that loaded sparks move and the light disappears when the round is gone; rigid-part clipping checks exclude additive light only. Browser QA checked all three selection layouts, loaded images/scales, short tutorial cards and both held/slung yellow effects. Build succeeded; standalone artifact is 2,754,069 bytes. Additional touched files: tests/sightline.test.js and SIGHTLINE_DESIGN.md. No commit, push, pull or merge.


### Local weapon preview revision 22 (2026-09-27)

Sightline hides the two bloom/spread brackets and the associated cone while its actual laser is drawn, for both ordinary and Breach rounds. The aim dot remains at the laser endpoint. Sidekick and unscoped/indoor Sightline keep their bloom guide. src/ui/aim-overlay.js uses the renderer's live aimEnd so it follows actual laser visibility without a separate set of gameplay rules.

Revision 22 follow-ups: Breach now has bright yellow jagged filaments flickering along the straight red laser, plus expanding yellow crackles and yellow sparks on the landing explosion and the smaller muzzle blast. The existing Sightline line batches and DetailFX pools draw them; no extra render pass or new lights. Crackles respect world depth/concealment, are capped at 12 simultaneous bursts, expire within 0.65 s and clear on reset. Renderer explosion routing keys only on damageType sightlineBlast, retaining the existing grenade smoke/fireball, damage and death behavior. Files: src/weapons/sightline-view.js, src/render/renderer.js, tests/sightline.test.js.

Omen no longer has aim-in: RMB/Shift cannot narrow spread, slow walking or apply focused cursor movement. Ordinary spread remains 0.025 radians; damage and abilities stay the same. No AIM touch button, HUD/control hint or focused status; the tutorial is now six steps without the aim lesson. The simulation also rejects aim input so bots, prediction and network-supplied input follow the same rule. The legacy omen.aiming state is retained as false for loadout compatibility. Files: src/config/gameplay.js, src/weapons/omen.js, src/weapons/rifle-input.js, src/simulation.js, src/items.js, src/main.js, src/ui/weapon-hud.js, src/tutorial.js, tests/omen.test.js, tests/rifle-input.test.js, tests/items.test.js, tests/tutorial.test.js.

Revision 22 verification: 110/110 focused checks passed. The full run passed 962/964; its registry check still assumed every trigger weapon had AIM and was corrected to require a binding when AIM is offered. The other failure was the untouched randomized Scatter far-damage case; it passed on rerun. The 60-check registry/Scatter/Sightline recheck passed, including the final below-deck effect placement. tests/registry.test.js is the additional touched file. Browser overlay harness passed all six regular/Breach/indoor/Sidekick/Nominal/re-entry cases. Performance-preset visual harness shows yellow beam filaments and blast crackles without console warnings/errors. Standalone build succeeded: 2,756,204 bytes.


### Local weapon preview revision 23 — standalone Sidekick (2026-09-27)

Sidekick is a sixth selectable weapon; Sightline still keeps its separate, unchanged 25 +/- 2 backup. Standalone Sidekick deals 30 +/- 2, manual fire, 10 rounds, 0.28 s interval, 22 m range, 65 m/s projectiles and a 2 s reload. It uses the same pistol model and the existing studio for its selection art.

E plants a small ground disc under the player. One-second arming, 25-second cooldown, two mines per owner across the map. Placing a third replaces the oldest. The trigger radius is 0.7 m; allies/owner never trigger or take this blast. A single 170–230 roll is shared by the blast: full damage within 0.9 m, falling to 20% at 3.6 m. Walls and terrain block it; another deck level cannot trigger it. Friendly dots flash green and enemy dots red. Death, respawn/loadout change and map reset clear that player's mines; leaving clears their mirrored list. Existing grenade smoke, fireball, sound and directional explosion death are reused.

X is Rush: reach out for 0.55 s, then eight full seconds with a second gun. A white silhouette grows in the outstretched hand and resolves into coloured steel/wood. Running is 20% faster, normal bullets retain 30 +/- 2 damage, and LMB/Space may be held for alternating automatic fire at 1.75x cadence. Each gun has ten rounds; the new gun arrives loaded, the original retains its ammunition. A 2 s reload refills both while Rush is active. On expiry bonus ammunition disappears; the original retains its remaining rounds and returns to manual fire. Cooldown is 45 s from summoning. A dodge does not consume or cancel Rush; death and loadout reset end it. These tuning defaults can be adjusted after playtesting.

Motion echoes are merged low-poly player silhouettes, in one instanced batch capped at 48, lasting 0.4 s. Performance/Potato emit every 0.10 s; Quality/Extreme every 0.06 s. No new dynamic lights or render passes. Mine discs, rims, indicator dots and bullets use capped instance pools. Existing room/scope shader clipping applies to them; hidden bodies do not emit visible echoes. The white reveal is a shader uniform over the original vertex colours, so it needs no geometry rebuild. Natural fixed-length arm solving is shared with Sightline. Remote models animate both guns; private reveal materials are cleaned when avatars change weapons or leave.

Networking protocol is now 14: sanitized mine/Rush inputs, predicted speed state, host-owned ammo/cooldowns, remote gun state, mine allegiance and projectile snapshots. Bots use their normal perception, tap outside Rush, hold in Rush, place mines when pressured nearby, and use the same cooldowns. Shared room fire pacing includes Sidekick actions. Four short tutorial steps teach shooting, reload, mines and Rush. HUD uses the shared ammo pips and E/X filled circles (20 rounds during Rush).

New files: src/weapons/sidekick.js, src/weapons/sidekick-model.js, src/weapons/sidekick-view.js, src/assets/weapons/sidekick.webp, tests/sidekick.test.js, SIDEKICK_DESIGN.md.
Shared files touched this revision: src/config/gameplay.js, src/simulation.js, src/items.js, src/main.js, src/audio.js, src/aim-damping.js, src/effects/death-reactions.js, src/weapons/rifle-pose.js, src/weapons/weapon-photos.js, src/remote-players.js, src/render/renderer.js, src/render/warm-up.js, src/net/protocol.js, src/net/projectiles.js, src/net/host-session.js, src/net/client-session.js, src/bots/robot-brain.js, src/bots/bot-match.js, src/bots/interior-tactics.js, src/ui/weapon-hud.js, src/ui/ability-hud.js, src/ui/x-ability-state.js, src/ui/aim-overlay.js, src/ui/map-cards.js, src/tutorial.js, tests/items.test.js, tests/net.test.js, AGENTS.md, CLAUDE_HANDOFF_OMEN.md.

Revision 23 final verification: **985/985 tests passed** in output/omen/r23-final-tests.log, including 21 new Sidekick checks for manual/automatic cadence, both damage rolls, mine cap per owner, arming/cover/deck/allied immunity, typed host lethal hits, both death reactions and drops, reload/expiry/death/reset, network replication and arm/reveal/echo cleanup. All existing golden replays pass unchanged. The new weapon required expanding the fixed weapon lists in tests/items.test.js and tests/net.test.js. No-undef check and git diff whitespace check pass; all 93 git-status paths are inventoried here.

Browser checks used separate hidden tabs: the actual standalone artifact loads Sidekick, credits a shot in its four-step tutorial and displays all six selection images. No game console errors/warnings. Actual WorldView motion previews exercised Performance and Potato: example warmed route samples were 1.51 ms mean / 2.90 ms worst (Performance), 1.71 ms mean / 3.50 ms worst (Potato); these are local CPU/frame-work samples, not phone/MacBook FPS claims. Both showed moving echoes and alternating fire. Cold first frames after a preset switch compiled shaders in the bare harness; the game includes these effects in its normal warm-up.

Artifact filenames Deadshift-Omen.html, Deadshift-Sightline.html and Deadshift-Sidekick.html contain the same 2,789,725-byte build, SHA256 6fc58e021f4bdb8c298104e0ad1054a4d603470877cf8bed4680a107f98b5e30 (output/omen/r23-build.log). Open URL: http://127.0.0.1:5792/Deadshift-Sidekick.html?play=1&weapon=sidekick&map=hollow-wick&autostart=1&revision=23 . No commit/push/pull/merge; the separate map checkout is untouched.


### Local weapon preview revision 24 (2026-09-27)

Sidekick Rush now has unlimited ammo for all eight active seconds. It fires with an empty starting magazine, cancels a pending reload on activation, alternates hands at the existing 1.75x cadence, and ignores reload requests while active. Rush does not consume or refill the original magazine; its exact remaining ammo returns afterwards, with ordinary manual fire and reload rules. The HUD shows infinity and full pips while Rush is active. Bots treat it as loaded and do not request reloads. Existing active state replicates this without a protocol change. Controls and the short Rush tutorial tip explain unlimited ammo. Damage, movement, duration and cooldown are unchanged.

Both weapon portraits share a refined photo-only Sidekick: faceted steel slide and muzzle, recessed ejection port, simple sights, open trigger guard, ribbed walnut grip and small brass fasteners. The Sightline portrait folds its bipod and removes unused hidden animation effects before framing so they cannot shrink the visible guns. The held models and runtime rendering cost are unchanged; both shipped WebP images were regenerated in the existing warm-lit studio.

Files touched: src/weapons/sidekick.js, src/bots/robot-brain.js, src/ui/weapon-hud.js, src/items.js, src/tutorial.js, src/weapons/weapon-photos.js, src/assets/weapons/sidekick.webp, src/assets/weapons/sightline.webp, tests/sidekick.test.js, SIDEKICK_DESIGN.md, AGENTS.md and CLAUDE_HANDOFF_OMEN.md. Earlier revision-23 descriptions of finite Rush magazines are superseded by this change.

Revision 24 also updates src/bots/bot-match.js so observed enemy ammo status recognizes unlimited Rush.

Revision 24 verification: 93/93 focused checks passed (Sidekick, ammo presentation, item registry, tutorial, networking, room bots and flat golden replays), output/omen/r24-verification.log. Hidden browser inspection confirmed the artifact shows infinity while Rush fires, returns to 10/10 afterwards, and displays both refined portraits in the real weapon picker; no console warnings/errors. Build and whitespace checks pass, all 93 changed paths remain inventoried. Artifact aliases match at 2796534 bytes, SHA256 d56d71e6581e6a8649d49f389a7384aedbcd5b3c3bceb9481d2a892e8e4a134f; output/omen/r24-build.log. Delivery: http://127.0.0.1:5792/Deadshift-Sidekick.html?play=1&weapon=sidekick&map=hollow-wick&autostart=1&revision=24 . No commits, pushes, pulls or merges.


### Local weapon preview revision 25 (2026-09-27)

Nominal now shows the same infinity ammo count as Sidekick Rush while Nova is active. The accessible ammo label also says unlimited rounds during Nova. Charging and cooldown retain the ordinary count, which returns as soon as Nova ends. Presentation only; existing Nova mechanics and balance are unchanged. Changed files: src/ui/weapon-hud.js, AGENTS.md and CLAUDE_HANDOFF_OMEN.md.

Revision 25 verification: 18/18 existing rifle/HUD checks passed (output/omen/r25-tests.log). A hidden browser harness using the actual Simulation and weapon HUD verified 28/28 while normal/charging, infinity with the matching accessible label during active Nova, then 28/28 after expiry. Build and whitespace checks pass. Artifact aliases contain 2796609 bytes, SHA256 e3fb4d28786b4a3c471bbe9d80808ca32fd2597b3a13b00a9f560b346dc7a23a. Opened revision=25 with Sidekick on Hollow Wick; previous user tabs untouched. No commits, pushes, pulls or merges.


### Local weapon preview revision 26 (2026-09-27)

The unlimited-ammo mark for Sidekick Rush and Nominal Nova is now a 44 x 22 px, thick faceted infinity icon in the weapon accent colour with the existing dark HUD shadow. It uses one CSS SVG mask, keeps the accessible infinity text, and preserves the normal ammo row height so activating an ability does not shift the pips. The standard ammo numbers return on expiry. Presentation only; no gameplay changes. Files: src/ui/weapon-hud.js, src/styles/menu-theme.css, AGENTS.md, CLAUDE_HANDOFF_OMEN.md.

Revision 26 mine visibility: friendly mines retain a clearly visible green center between blinks (1.35x dot scale, 2x on the flash) and a slightly broader pale sage rim. Enemy discs, rims and red blink are unchanged. The existing unlit instance batches provide contrast in tree shadows without extra lights, draw calls or through-wall visibility; room, scope and depth concealment remain. Additional changed file: src/weapons/sidekick-view.js.

Revision 26 mine charge redesign: Sidekick carries two mine charges, shown as two small mine silhouettes below bullet ammo. E spends one charge immediately; there is no delay between the two placements. Only the second starts a 30-second shared refill. Both slots refill together even if old mines survive, and mines do not vanish just because the timer ends. The first placement from the new pair removes every survivor from the previous pair; the second places normally, retaining the two-live-mines-per-owner cap. Triggering a mine does not refund a charge or bypass the timer. Respawn/loadout changes retain remaining charges and any running cooldown; a full simulation reset restores both. Host loadout replication carries the new mineCharges scalar automatically. Bots, tutorial and controls use the new rule; the E dial and touch timer follow the shared refill.

Additional files for the charge redesign: src/config/gameplay.js, src/weapons/sidekick.js, src/bots/robot-brain.js, src/ui/ability-hud.js, src/ui/weapon-hud.js, src/styles/menu-theme.css, src/items.js, src/tutorial.js, tests/sidekick.test.js, SIDEKICK_DESIGN.md. All revision-26 requests are being delivered together; earlier 25-second per-mine cooldown descriptions are historical.

Revision 26 verification: 95/95 focused checks pass (Sidekick, ammo HUD, items, tutorial, networking, room bots, golden flat replays), output/omen/r26-verification.log. Tests cover immediate two placements, 30-second refill, replacement with zero/one/two survivors, charge/cooldown preservation on respawn, fresh reset and loadout replication. Hidden browser previews verified the larger faceted infinity mark, 2 -> 1 -> recharging -> 2 mine slots with halfway fill, and a friendly mine visible between blinks beside Hollow Wick's maple tree shadow; Performance and Potato retain the existing batches. Both enemy appearance and all gameplay damage remain unchanged. Build and whitespace checks pass; all 93 status paths are documented. All three artifact aliases are 2799277 bytes, SHA256 d7dc9605d8a527928e7779567bbc3199aa5ac43a39ceeb956ecb42e27a0f6e97; output/omen/r26-build.log. Latest URL: http://127.0.0.1:5792/Deadshift-Sidekick.html?play=1&weapon=sidekick&map=hollow-wick&autostart=1&revision=26 . No commit, push, pull or merge.


## Revision 27 — Ichor + human practice bodies (2026-09-27)

Implemented the complete Ichor brief; current details and playtest defaults are in ICHOR_DESIGN.md, mirrored in AGENTS.md. Added src/weapons/ichor.js (rules), ichor-model.js (katana and cut/spin posing), ichor-view.js (batched white/red slashes, growing wave, fresh blood pools, foot glow, material-aware hit feedback), src/assets/weapons/ichor.webp (shared studio capture), and tests/ichor.test.js.

Shared integration: src/config/gameplay.js, src/simulation.js, src/items.js, src/main.js, src/audio.js, src/weapons/rifle-input.js, src/weapons/rifle-pose.js, src/weapons/weapon-photos.js, src/render/renderer.js, src/render/warm-up.js, src/remote-players.js, src/effects/death-reactions.js, src/effects/death-view.js, src/effects/gore.js, src/ui/map-cards.js, src/ui/weapon-hud.js, src/ui/ability-hud.js, src/ui/x-ability-state.js, src/styles/menu-theme.css, src/styles/mobile-controls.css, src/tutorial.js, src/bots/bot-match.js, src/bots/robot-brain.js, src/bots/interior-tactics.js, src/ui/dev-options.js, src/ui/dev-wiring.js, src/net/protocol.js, src/net/projectiles.js, src/net/host-session.js, src/net/client-session.js, tests/items.test.js.

Important merge behavior: protocol 15; all new damage carries explicit Ichor type through lethal hits. Normal bots remain metal/no blood. Human practice bodies are exposed only by the existing unlocked solo dev hook and use normal RobotBrain, player proxies/avatar slots and human corpses; removal clears those corpses. Existing global Syphon is unchanged, but Frenzy itself never heals. Arms retain fixed lengths, full-body spins do not stretch them, and gore respects below-deck floors. Two new effect batches, existing pools, capped trail samples/sparks, no dynamic lights. Normal weapon inputs/default roster indices remain unchanged; Ichor appends to the registry.

Validation: full node --test --test-concurrency=2 tests/*.test.js passed 1001/1001 (output/omen/r27-suite-final.log); after final mobile/health-display/prop-wave fixes, 103/103 focused checks passed (r27-final-checks.log). First unconstrained run had a contention-sensitive 50 ms terrain timing assertion plus a missing body in a new test fixture; both resolved, no production terrain tuning changed. Production standalone build succeeded. Hidden UI QA: real Performance/Potato renderer, full-blood Frenzy on humans and robots, visible organs and dropped weapons, actual Hollow Wick artifact E/X health/cooldowns and 7-card weapon picker; no artifact console errors. Desktop measurements are not representative of phone/Intel-Mac performance. Harnesses under ignored output/omen are fixtures, not developer shortcuts in the shipped game.

Final artifact revision=27: output/omen/Deadshift-Ichor.html, 2833964 bytes, SHA-256 d782dfb40c72715fdad99dbd8bc4b2bc5719a2f545864034a5a275970c8f4080. Omen, Sightline and Sidekick aliases contain the same build. No changes to the map checkout; no commit, push, pull, merge or public deployment.

### Complete cumulative worktree inventory at revision 27

- gitignore
- AGENTS.md
- src/aim-damping.js
- src/audio.js
- src/bots/bot-match.js
- src/bots/robot-brain.js
- src/config/gameplay.js
- src/config/keybinds.js
- src/effects/crows.js
- src/effects/death-reactions.js
- src/effects/death-view.js
- src/effects/effects-detail.js
- src/effects/gore.js
- src/items.js
- src/main.js
- src/net/arena-robots.js
- src/net/arena.js
- src/net/client-session.js
- src/net/host-session.js
- src/net/projectiles.js
- src/net/protocol.js
- src/remote-players.js
- src/render/interior-visibility.js
- src/render/renderer.js
- src/render/vision-polygons.js
- src/render/vision.js
- src/render/warm-up.js
- src/simulation.js
- src/styles/menu-theme.css
- src/styles/mobile-controls.css
- src/tutorial.js
- src/ui/ability-cooldown.js
- src/ui/ability-hud.js
- src/ui/aim-cursor.js
- src/ui/aim-overlay.js
- src/ui/dev-options.js
- src/ui/dev-wiring.js
- src/ui/fire-indicator.js
- src/ui/map-cards.js
- src/ui/menu.js
- src/ui/outgoing-feedback.js
- src/ui/weapon-grid.js
- src/ui/weapon-hud.js
- src/ui/weapon-pick.js
- src/ui/x-ability-state.js
- src/weapons/rifle-input.js
- src/weapons/rifle-pose.js
- src/weapons/weapon-photos.js
- src/world/heightfield.js
- src/world/roof-fade.js
- tests/aim-cursor.test.js
- tests/dev-window.test.js
- tests/flight-audio.test.js
- tests/golden-flat.test.js
- tests/health.test.js
- tests/items.test.js
- tests/net.test.js
- tests/outgoing-feedback.test.js
- tests/registry.test.js
- tests/rifle-input.test.js
- tests/roof-fade.test.js
- tests/tutorial.test.js
- tools/capture-weapons.mjs
- CLAUDE_HANDOFF_OMEN.md
- ICHOR_DESIGN.md
- SIDEKICK_DESIGN.md
- SIGHTLINE_DESIGN.md
- src/assets/weapons/ichor.webp
- src/assets/weapons/omen.webp
- src/assets/weapons/sidekick.webp
- src/assets/weapons/sightline.webp
- src/bots/interior-tactics.js
- src/bots/laser-response.js
- src/bots/sightline-tactics.js
- src/render/scope-shading.js
- src/styles/omen.css
- src/styles/sightline.css
- src/ui/damage-indicator.js
- src/ui/omen-state.js
- src/ui/sightline-ammo.js
- src/weapons/ichor-model.js
- src/weapons/ichor-view.js
- src/weapons/ichor.js
- src/weapons/omen-model.js
- src/weapons/omen-view.js
- src/weapons/omen.js
- src/weapons/sidekick-model.js
- src/weapons/sidekick-view.js
- src/weapons/sidekick.js
- src/weapons/sightline-flight.js
- src/weapons/sightline-model.js
- src/weapons/sightline-view.js
- src/weapons/sightline.js
- tests/bot-interiors.test.js
- tests/bot-laser-response.test.js
- tests/bot-sightline.test.js
- tests/damage-indicator.test.js
- tests/ichor.test.js
- tests/omen.test.js
- tests/sidekick.test.js
- tests/sightline.test.js


## Revision 28 — prominent Ichor blood and clearer cuts

User: vivid mostly red blood meter above/below health, prominent and very shaky/liquid/oozy near full; clearly white katana slashes every attack; blood follows the slash.

- Blood meter now sits below health, sized with it, with an explicit percentage and steady cream lettering over vivid red liquid. Slosh and shake build nonlinearly as blood rises; three hanging drips elongate near full. SVG updates are capped at 30 Hz in simulation time, with no turbulence filters/world lights. Bottom ammo pips/count hidden only for Ichor. Other weapons retain their HUD.
- White crescents are much broader, red-rimmed and pointed. Joined ribbon triangles replace the visibly segmented boxes. Full-blood/spin cuts add a second smaller edge; thrusts use a forward streak. All presets retain the main white shape. One capped reusable ribbon buffer, existing spark/streak and foot-glow batches; warm-up/room/scope handling picks it up through IchorView.meshes.
- Reverse cut sweep fixed. One handedness helper keeps blood travelling with the blade; thrusts forward, sweeps across, spins tangent to each victim. Prop, human and robot hit forces share the rule, with typed damage/death handling unchanged. Damage, contact timing and cooldowns unchanged.

Changed this revision:
- src/ui/ichor-blood-hud.js (new)
- src/ui/health-hud.js
- src/ui/weapon-hud.js
- src/styles/menu-theme.css
- src/weapons/ichor-cut.js (new)
- src/weapons/ichor.js
- src/weapons/ichor-view.js
- tests/ichor.test.js
- ICHOR_DESIGN.md
- AGENTS.md
- CLAUDE_HANDOFF_OMEN.md

Hidden visual checks use the actual renderer and production HUD; no visible user session is controlled. Performance and Potato both show clean white crescents and directional spray. Desktop tests are not a phone/Intel-Mac benchmark. No commit/push/pull/merge/publication.

Revision 28 final verification: 45/45 focused tests passed (Ichor, health HUD, ammo HUD, health, death, registry). The added effect lifecycle check verifies finite, bounded ribbon vertices and complete expiry/reset; directional hit tests cover reverse sweeps, forward thrusts and spin victims on opposite sides. Hidden browser QA checked Performance/Potato contact frames, 0/30/95/100% meter states, 390/320 px phone layouts and hiding on weapon swap. The rebuilt Hollow Wick artifact loads with no browser warnings/errors. Build passed and diff whitespace check clean. Inventory: 104 paths, none missing from these notes.

Artifact aliases Deadshift-Ichor.html, Deadshift-Sidekick.html, Deadshift-Sightline.html and Deadshift-Omen.html are identical (2838130 bytes). SHA-256: f69bf9ec3eab8bb1d9826051447c1a8db4da8be4d5ef8439ba7384f1075f48cb. Latest URL: http://127.0.0.1:5792/Deadshift-Ichor.html?play=1&weapon=ichor&map=hollow-wick&autostart=1&revision=28


## Local weapon preview revision 29 — Ichor overhaul and Human AI discovery (2026-09-27)

Latest Ichor requirements supersede revisions 27/28 above. Details are in ICHOR_DESIGN.md. Hold/tap repeats identical broad slashes (no thrusts), 0.24 s cadence/contact 0.067 s, 30–85 damage. Dash/0.24 s landing grace uses a unique slash with 15% extra damage and 0.3 m reach. X keeps eight hits/200–600 total/80 health cost/no healing, now around 1.3 s; WASD adds directional movement pulses without forced motion. Full blood passively grants 5% speed and 1.2x E/X recharge, with pulsing bloody red ability dials. Fresh blood movement remains passive; E now leaves usable residue too.

The slightly longer straight dark sword has an angled point, single cutting edge, detailed dark/red grip and moving ties. ichor-motion.js authors anticipation/fast crossing/follow-through, wrist flips, moving cuts and spins. Local/remote/robot hands stay attached to fixed grip points with natural arm lengths. White low-blood slash wakes turn increasingly red with blood, broad crescents and bounded echoes. The E arc sheds liquid droplets/stains; particles retain bridge level and clear correctly. Shing is subtle; organic/robot contact effects stay distinct.

Blood HUD is now between dash pips and weapon name, with transparent backing, ragged red liquid, increasing slosh and full-hit overflow. The old status hint is removed; E/X fit desktop and touch screens. O-menu robots (test) now explicitly names Human AI and has a direct Spawn Human AI button, searchable with human. Existing developer unlock and solo guard remain. Registry/tutorial/artwork updated. Effects stay capped/batched with no dynamic lights; remote Ichor arms are created lazily.

Full suite: 1007/1008 passed initially; unchanged hollow-life heap test failed its threshold but its full 11-test file passed separately. Final focused Ichor/developer tests: 34/34 including a new bridge/particle cleanup regression. Hidden real-renderer and HUD/O-menu QA; no user visible session controlled. See handoff for build/hash and inventory. No git commit/push/pull/merge.

Changed in revision 29:
- src/config/gameplay.js
- src/simulation.js
- src/weapons/ichor.js
- src/weapons/ichor-motion.js (new)
- src/weapons/ichor-model.js
- src/weapons/ichor-cut.js
- src/weapons/ichor-view.js
- src/weapons/rifle-pose.js
- src/remote-players.js
- src/bots/robot-model.js
- src/audio.js
- src/ui/ichor-blood-hud.js
- src/ui/health-hud.js
- src/ui/weapon-hud.js
- src/ui/ability-hud.js
- src/styles/menu-theme.css
- src/styles/mobile-controls.css
- src/ui/dev-options.js
- src/ui/dev-wiring.js
- src/items.js
- src/tutorial.js
- src/weapons/weapon-photos.js
- src/assets/weapons/ichor.webp
- tests/ichor.test.js
- tests/dev-window.test.js
- ICHOR_DESIGN.md
- AGENTS.md
- CLAUDE_HANDOFF_OMEN.md

Revision 29 delivery verification: build succeeded; all four artifact aliases are identical at 2,844,965 bytes, SHA-256 09e528158ddb3921c5145f7e2fe3a0172e2aa94a67a25afa3821f62843179783. Diff whitespace check clean. Inventory has 106 changed/untracked paths, none missing from this handoff. Hidden Hollow Wick artifact loaded with no browser warnings/errors; locked O key still gives no developer hint. Human AI search/spawn was checked in the separate unlocked O-menu fixture. Potato/Performance slash frames and moving Frenzy inspected; 320/390-pixel portrait and 740-pixel landscape touch HUD keeps meter and both dials visible. Existing unrelated hollow-life heap threshold needed a separate successful rerun, as described above.
Latest artifact: http://127.0.0.1:5792/Deadshift-Ichor.html?play=1&weapon=ichor&map=hollow-wick&autostart=1&revision=29


## Local weapon preview revision 30 — slower, smoothly filling blood (2026-09-27)

Blood gain is now slightly randomized and lower: cuts/Frenzy 6.5–8.5 (mean 7.5 instead of 9), E 11.5–14.5 (mean 13 instead of 16), per successful victim. About 17–19% slower average buildup; misses do not gain and blood caps at 100. Authoritative combat still owns the amount. BloodBarMotion in ichor-blood-hud.js eases only its presentation and percentage over roughly 0.3–0.4 s, follows repeated hits without restarting, freezes with simulation time and clears on reset. No render-rate dependence. Overflow still responds to actual full-blood hits. The transparent empty outline and lettering are quieter, with bright blood red reserved for the liquid/drops; removed the bright full-frame glow. The existing full-blood ability pulse remains.

Changed: src/config/gameplay.js, src/weapons/ichor.js, src/ui/ichor-blood-hud.js, src/styles/menu-theme.css, tests/ichor.test.js, tests/ichor-blood-hud.test.js (new), ICHOR_DESIGN.md, AGENTS.md and CLAUDE_HANDOFF_OMEN.md. 46/46 focused checks passed. Hidden visual preview confirmed the display passes through intermediate values and the bright liquid reads against the quiet empty bar. No commit/push/pull/merge.

Revision 30 delivery: all four artifact aliases are identical, 2,845,452 bytes. SHA-256 1e444621dc684dafe65f32c35eda045be54304f4e673ebddcc0773a94f37fd54. Build and diff whitespace checks passed; inventory 107 paths, none missing. The rebuilt Hollow Wick artifact loaded in a separate hidden tab without browser warnings/errors.
Latest: http://127.0.0.1:5792/Deadshift-Ichor.html?play=1&weapon=ichor&map=hollow-wick&autostart=1&revision=30


## Local weapon preview revision 31 — flowing Ichor combat, timed parries and blood saturation (2026-09-27)

Current tuning supersedes earlier Ichor entries: basic cuts retain 30–85 damage and 0.24 s cadence, now with varied smaller/broader arcs and occasional 360 spins. Ten authored forms include diagonal descents, rising rolls, backhands, dash cuts and body-led spins. The blade rests on its finishing side; subsequent forms start from that side. Walking slows 12% during attacks while Frenzy retains faster WASD movement. Successful attacks within 0.85 s build an extra 7/14/21% blood, advancing once per attack rather than per victim. Above 90% blood regenerates 6 HP/sec, capped at max and disabled throughout Frenzy.

X now runs twelve strikes over 2.4 s, 180–540 total direct damage (10% lower), 22% secondary damage, unchanged 80-health cost and 50 s cooldown. Three sequences combine crossed white/red crescents, rising fans, broken spirals and finishing wheels. Normal slashes mix white and muted reds below 60% blood and turn red above it. Both ribbon edges follow terrain with normal depth testing; the below-deck level remains intact. Geometry remains capped and batched; two sampled edges replace six repeated evaluations per segment.

A timed 55 ms slash crossing can deflect one front-facing regular bullet, with 0.28 s recovery. Host and bot collision proxies share that recovery state. The original bullet is consumed without damage or hit credit; an outward random spent ricochet, clipped to cover, plus metallic ping/glints shows it. Nominal/Sidekick/Sightline normal rounds qualify; pellets, curses, electricity and explosive rounds do not. No reflected damage or new death type is introduced.

Organic hits spray more directional blood; robots remain metal with yellow/blue sparks. At high blood the wielder's existing hat/body/arm vertices become drenched, nearly all red at full, with no additional draw calls. Private geometry/material copies avoid affecting other avatars; eight display stages limit uploads. Full blood keeps boots wet for 24 steps, with extra local drips; under-bridge prints stay below. Respawn cleans the player while corpse snapshots keep the blood and release their own copies on removal. Human AI remains behind the existing solo developer unlock.

See ICHOR_DESIGN.md and CLAUDE_HANDOFF_OMEN.md for detailed balance, verification, inventory and artifact checksum. All work stays in codex/omen; no commit, push, pull, merge or public deployment.

Revision 31 changed paths:
- src/config/gameplay.js
- src/simulation.js
- src/weapons/ichor.js
- src/weapons/ichor-cut.js
- src/weapons/ichor-motion.js
- src/weapons/ichor-model.js
- src/weapons/ichor-view.js
- src/weapons/ichor-deflect.js (new)
- src/effects/ichor-drench.js (new)
- src/effects/blood-wading.js
- src/effects/blood-drops.js
- src/effects/death-corpse.js
- src/render/renderer.js
- src/remote-players.js
- src/bots/bot-match.js
- src/net/arena.js
- src/net/host-session.js
- src/audio.js
- src/items.js
- src/tutorial.js
- tests/ichor.test.js
- tests/ichor-flow.test.js (new)
- ICHOR_DESIGN.md
- AGENTS.md
- CLAUDE_HANDOFF_OMEN.md

Hidden test fixtures: output/omen/r31-play.html (flat and Hollow Wick slope variants). Potato/Performance, mixed-blood hillside cut, full-blood Frenzy finisher, nearly drenched wielder and visible timed deflection inspected. No browser warnings/errors. The trail/ricochet detail uses the existing three capped effect batches; avatar drenching adds no draws. Desktop fixture CPU readings are not phone/Intel-Mac benchmarks. Earlier full suite passed 1023/1023; two final cleanup regressions were then added for lower-bridge prints and corpse-owned blood snapshots. Final totals/build follow below.

Revision 31 final verification: 1025/1025 tests pass with --test-concurrency=2. Standalone build succeeds; all four aliases identical at 2,855,308 bytes, SHA-256 b379eb62c6392e4f326380dd53236d7b2a7e8503df58b6211e32303e35974211. Hidden Hollow Wick artifact starts Frenzy with the 2.4-second timer and no browser warnings/errors. Diff whitespace check clean; inventory 113 changed/untracked paths, none omitted from this handoff. No commit/push/pull/merge.
Latest: http://127.0.0.1:5792/Deadshift-Ichor.html?play=1&weapon=ichor&map=hollow-wick&autostart=1&revision=31


### Local weapon preview revision 32 — wet blade, shorter reach and blood-gated E (2026-09-27)

Ichor normal melee reach is 2.15 m, down from 2.35 m; dash/spin bonuses remain. E requires at least 50% blood without consuming it, deals 60–80 damage, travels at 19 m/s instead of 23, and has a six-second cooldown (five at full blood through the existing 1.2x recharge passive). A halfway marker and subdued locked E state make the requirement visible. Simulation and robot input both enforce it; tutorial and controls explain it. Rejected casts do not start cooldown or an animation.

Bloody blade faces and slash reds are deeper crimson with irregular wet streaks. Blade travel throws droplets on misses as well as hits; emission is frame-rate independent and freezes when paused. Organic contacts have heavier directional spray; robots remain bloodless on contact with metal/yellow-blue sparks. E sheds more liquid, residue and layered wakes. Airborne particles are bounded by preset (128/256/384/512/768), reuse existing batches, keep bridge level, and leave capped floor/wall/prop stains. No additional lights or damage types; death reactions and weapon drops remain unchanged.

See ICHOR_DESIGN.md and CLAUDE_HANDOFF_OMEN.md for details and verification. No commit, push, pull, merge or public deployment.

Revision 32 changed paths:
- src/config/gameplay.js
- src/weapons/ichor.js
- src/weapons/ichor-view.js
- src/weapons/ichor-model.js
- src/render/renderer.js
- src/bots/robot-brain.js
- src/ui/ability-cooldown.js
- src/ui/ability-hud.js
- src/ui/ichor-blood-hud.js
- src/styles/menu-theme.css
- src/items.js
- src/tutorial.js
- tests/ichor-flow.test.js
- tests/ichor.test.js
- ICHOR_DESIGN.md
- AGENTS.md
- CLAUDE_HANDOFF_OMEN.md


Revision 32: 1029/1029 tests pass with --test-concurrency=2. Hidden real-renderer checks confirmed locked E at zero blood, the halfway marker, casting at 50%, the slower arc with denser residue, missed-swing blood shedding and Potato full-blood human-hit Frenzy. No browser warnings/errors. These desktop checks do not constitute a phone/Intel-Mac benchmark. Existing capped batches and stain pools are retained.

Revision 32 delivery: standalone build succeeded; all four aliases identical at 2,858,706 bytes, SHA-256 81b1fe65762138cafe2e896a1c5be9248c729546333a63270f0ca5008a5ada35. Hidden Hollow Wick artifact starts with the halfway notch and disabled E below 50%, without browser warnings/errors. Full suite 1029/1029; diff whitespace check clean; inventory 113 changed/untracked paths, none missing from this handoff.
Latest: http://127.0.0.1:5792/Deadshift-Ichor.html?play=1&weapon=ichor&map=hollow-wick&autostart=1&revision=32


### Local weapon preview revision 33 — blade blood alignment, breakables and held sword guard (2026-09-27)

The blade coating is now flush to both steel faces in blade coordinates, without an offset/scaled shell. It follows blade flips and guard poses; swing-shed droplets are narrower liquid streaks. Ichor melee and its blood arc account for authored low-top cover: the permanent knee-high stump cannot shield a headstone above it. Ordinary walls/cover remain blocking; graves still leave their intended solid stump.

RMB/Left Shift now holds a two-handed high sword guard, also GUARD on touch. First two front-facing projectile catches are guaranteed; attempt three has 50% chance and four 25%, independently. Fourth attempt ends the guard even on failure; Omen projectiles cap at two attempts and cannot apply a mark when caught. Ballast intercepts individual pellets before shell damage aggregation, never the whole shell. Explosions, active curse ticks, electricity and melee bypass it. Release/exhaustion/death starts a fixed ten-second cooldown; full blood does not speed it up. Requires releasing and holding again after use. It can interrupt slashes/Frenzy without refunding X, suppresses basic attacks while held, and lowers for E/X. Existing tight timed-cut parry remains independent. Host/bot collision proxies share one counter, inputs are normalized, and loadout/remote pose state carries the guard. Ricochets remain cosmetic with no reflected damage or new death type. Ballast lethal damage/death reaction and all drops remain intact.

A compact guard strip shows two solid and two chance pips with cooldown; controls, touch button and a plain tutorial step are added. Raised pose keeps natural two-handed grip, with a short steel sound and deflection recoil.

Revision 33 changed paths:
- src/weapons/ichor-model.js
- src/weapons/ichor-motion.js
- src/weapons/ichor-view.js
- src/weapons/ichor.js
- src/weapons/ichor-deflect.js
- src/weapons/rifle-input.js
- src/weapons/shotgun.js
- src/simulation.js
- src/config/gameplay.js
- src/main.js
- src/net/protocol.js
- src/net/host-session.js
- src/ui/weapon-hud.js
- src/ui/ichor-guard-hud.js (new)
- src/styles/menu-theme.css
- src/items.js
- src/tutorial.js
- src/audio.js
- tests/ichor-guard.test.js (new)
- AGENTS.md
- ICHOR_DESIGN.md
- CLAUDE_HANDOFF_OMEN.md

Focused regression suite 113/113 passed before the final death/cooldown check. Hidden real-renderer checks confirmed the flush blade coating, guard pose/arm grip, two guaranteed catches, exhausted cooldown, and a normal cut breaking the headstone while leaving the stump. No browser warnings/errors. All changes stay local in codex/omen; no commit, push, pull, merge or public deployment.

Revision 33 verification: 1038/1039 passed in the full suite. The unchanged hollow-life allocation threshold reported 1006 KB over 1000 frames; its entire 11-test file then passed independently. The 113-test focused weapon suite passed. Hidden Performance preview and 320/390-pixel portrait HUD checks passed with no browser warnings/errors. No phone/Intel-Mac hardware benchmark is claimed.

Revision 33 delivery: all four standalone aliases are identical at 2,863,985 bytes, SHA-256 446f3a4a29972520cb131a4efcc15bded11cfb82bbc87e76be920ac8abde888c. Build succeeds, diff whitespace check clean, inventory 116 paths with none missing. Hidden built artifact starts on Hollow Wick without browser warnings/errors; actual right-click raises/releases guard and starts its cooldown. User-visible tab was not used for testing.
Latest: http://127.0.0.1:5792/Deadshift-Ichor.html?play=1&weapon=ichor&map=hollow-wick&autostart=1&revision=33


### Local weapon preview revision 34 — blade attachment, solid cover, blood HUD and held deflection (2026-09-27)

Supersedes revision 33's guard budget/HUD: each raise rolls 40–60 damage capacity (integer), holds indefinitely, and slows walking by 10%. Releasing or exhausting it starts a fixed 20-second cooldown. Excess projectile damage passes through when capacity runs out; Ballast spends capacity pellet by pellet before aggregation. Omen physical shots qualify; electricity, active curses, explosions and melee still bypass it. Existing timed-cut parry remains independent. No guard HUD bar: a white diamond glint on the held blade communicates the active guard. The blade crosses the chest with a short raise and catch recoil; successful catches make a white contact star, gold sparks, a visible cosmetic ricochet and a metal clang. Host/bot shots now route guard/deflection sounds through main.js's NET_SOUNDS as well as local shots. No new damage types; lethal remainders preserve the original type, death reaction and weapon drop.

The detached blood cluster came from generic makeGunStains: its fixed bounding-box patches stayed in hand space while Ichor animated inside that group. Ichor now routes soaking to its existing flush, blade-local coating instead; no second floating mesh is made. Wetting/drying, reset and weapon-swap cleanup are preserved, along with body stains and swing-shed blood.

Solid cover clips all cut ribbons/filaments and their blood emission with one 128-sample polar mask per cut, built from nearby colliders and reused by every layer. It retains cover through that cut even when a prop breaks. Damage uses the existing solid-cover rule; prop victims are captured before breaking any so one cut cannot penetrate a front crate into a rear one. Rotated carts/walls protect people; headstones remain breakable over their low permanent stumps.

Slashes use a filtered steel scrape with quiet, nearly steady metal partials instead of the old octave-down squeak. Higher blood raises pitch and lengthens the tail; high-blood human kills add a wet splash, while robots keep metal-only contact audio. Blood HUD gains stronger irregular sloshing, darker liquid veins, thin wet edges and bounded falling drops as it rises. E/X gain animated blood edging, beads and runs progressively with blood. Existing labels, ring cooldown fill and full-blood recharge remain intact. HUD shape updates remain capped at 30 Hz, meter drops at 36, and world glints/sparks reuse the existing capped line batch; no extra lights.

Revision 34 affected source: src/config/gameplay.js, src/weapons/ichor.js, src/weapons/ichor-deflect.js, src/weapons/ichor-cut.js, src/weapons/ichor-motion.js, src/weapons/ichor-model.js, src/weapons/ichor-view.js, src/weapons/shotgun.js, src/effects/blood-wading.js, src/simulation.js, src/main.js, src/audio.js, src/ui/weapon-hud.js, src/ui/ability-hud.js, src/ui/ichor-blood-hud.js, src/styles/menu-theme.css, src/items.js, src/tutorial.js. Removed the unused src/ui/ichor-guard-hud.js added in revision 33. Checks expanded in tests/ichor-guard.test.js, tests/ichor-flow.test.js and tests/flight-audio.test.js. Updated AGENTS.md, ICHOR_DESIGN.md and CLAUDE_HANDOFF_OMEN.md. No commit, push, pull, merge, version bump or publication.

Revision 34 verification: 1048/1048 tests pass in the full suite (--test-concurrency=2; output/omen/r34-full-tests.log). Focused revised guard/projectile/audio checks also pass (139/139). Hidden real-renderer checks on Performance and Potato confirmed the cross-body guard, white diamond, blade-positioned catch flash, attached full-blood coating and cart-clipped wakes. 320/390-pixel touch HUD checks keep both circles readable with no deflect bar. The standalone Hollow Wick artifact starts without browser warnings/errors. These desktop checks are not a phone/Intel-Mac performance benchmark. All four artifact aliases match at 2,869,013 bytes, SHA-256 b1a164db9d93cd12bec668bc889f01795daf9a8fc0b3512096521d63f4333eb0. Build succeeded (expected single-file size warning); diff whitespace clean; inventory 115 changed/untracked paths, none missing. Delivery URL: http://127.0.0.1:5792/Deadshift-Ichor.html?play=1&weapon=ichor&map=hollow-wick&autostart=1&revision=34 . No commit/push/pull/merge.


### Local weapon preview revision 35 — solid deflect spark, circle and free release (2026-09-27)

The guard cue is a filled opaque white eight-point spark with a longer main cross and shorter diagonal rays, facing the camera at the blade. It pulses and flares on catches; the outlined diamond is gone. One capped instanced batch supports up to eight visible guards, with no new lights; it hides/clears with the existing Ichor effects.

Deflect now has its own standard cooldown circle showing only RMB / LEFT SHIFT and seconds while recharging. Desktop puts it left of the weapon panel; narrow/touch layouts keep it fully in view, below E/X on touch. It appears only for Ichor, with accessible cooldown values and labels, and shares the game's filled-ring timing style. The previous horizontal bar remains removed.

Raising/lowering the sword and using E/X no longer start a cooldown. A partially used 40–60 damage charge keeps its remaining capacity across raises instead of rerolling/refilling. Only exhausting that capacity starts the 20-second cooldown; deaths do not create a new cooldown, though an already-running recharge is preserved on respawn. The existing indefinite hold, 10% slower movement, frontal check, partial-damage breakthrough, Ballast pellet accounting and independent timed-cut parry remain. Controls/tutorial now explain exhaustion-only recharge.

Files changed for revision 35: src/weapons/ichor.js, src/weapons/ichor-deflect.js, src/weapons/ichor-view.js, src/ui/ability-hud.js, src/styles/menu-theme.css, src/styles/mobile-controls.css, src/items.js, src/tutorial.js, tests/ichor-guard.test.js, tests/ichor-flow.test.js, AGENTS.md, ICHOR_DESIGN.md, CLAUDE_HANDOFF_OMEN.md. No edits in the separate map checkout and no git commit/push/pull/merge or publication.

Revision 35 verification: 118/118 focused Ichor, input, tutorial, registry and network tests pass (output/omen/r35-tests.log). Repeated release/re-raise preserves capacity without starting recharge; exhaustion starts 20 seconds, partial projectile damage and serialization remain covered. Hidden real-renderer checks confirmed the filled white spark, free lowering, retained capacity and countdown after exhaustion. All three HUD circles fit 320/390-pixel portrait and 740x330 landscape fixtures. The iframe HUD harness logged MutationObserver/observe errors during browser reloads; the actual standalone game and single-world fixture logged no warnings/errors. No claim of a phone/Intel-Mac hardware benchmark. Standalone build passes, expected single-file-size warning only; all four artifact aliases identical at 2,871,215 bytes, SHA-256 80d7317bf9f643aface9ac18735ff49ddaa0dcb4fd9031fdd4d6cb15f501ce7a. Diff whitespace clean; inventory 115 changed/untracked paths with none missing. Delivery: http://127.0.0.1:5792/Deadshift-Ichor.html?play=1&weapon=ichor&map=hollow-wick&autostart=1&revision=35 . No commit/push/pull/merge.


### Integration package preparation (2026-09-27)
Revision 35 is packaged for combining with Claude's map work at E:/ai slop games/game1/Claude outputs/Deadshift-weapons-r35-merge.zip. Base 6ad2d18ab83f960875d55c7a807ac18bf4dd055d; codex/omen remains uncommitted. The main checkout was clean at that same base when inspected; newer Claude map changes were not present locally. Package includes a full-index binary patch, all changed/new source files including four weapon images, current design/handoff notes, file hashes and verification logs. No patch has been applied to main. Current full suite: 1048/1049 pass; the known hollow-life heap threshold measured 1006 KB/1000 frames and its entire 11-test file passed separately. Production Vite build succeeds (Node invoked Vite directly because npm was not on shell PATH). The previous focused revision 35 suite remains 118/118. Combine shared logic rather than overlaying whole files, run the combined tests/build/browser checks, and resolve protocol/version/terrain conflicts before any requested commit or push. No commits, push, pull or merge performed.
