# Sheath — a white broadsword in a black sheath

Built 2026-09-28 from the owner's brief ("NEW WEAPON: SHEATH"), on top of v0.993a (7f616f5); revised the same day (Draw-cut rev. 2, Gold Rush extension, walking speeds, menu picture) and shipped as v0.994a. The numbers are `SHEATH` in `src/config/gameplay.js`; the full system description is in AGENTS.md > Weapons > Sheath.

## What it is

A wide, straight, heavy white broadsword with a plain steel crossguard and a dark leather grip, carried in a black scabbard at the left hip. It stays sheathed until the first attack draws it (the draw is itself a slash, rising out of the sheath). It stays out through a fight and goes back in by itself after 1.5 s without attacking, with its own slide-and-click. Low-poly and flat-shaded, sized to read next to Ichor's katana.

## Numbers (tune in play)

| | |
|---|---|
| Slash | 60–70 (65 ± 5) to everyone in the arc, once per swing |
| Swing cycle | .46 s (Ichor .24: 1.9x); wind-up .10 s, hit window .08 s, recovery .28 s. The draw-slash lands .04 s later |
| Time to kill 500 | ~3.3 s of pure slashing (Nominal ~3.6 s; Ichor ~4 s at no blood, faster as it fills; Ballast bursty) |
| Reach / arc | 2.45 m (Ichor 2.15); arcs 1.35 (overhead, +.3 m reach) to 2.35 rad (wide sweep, +.1 m) |
| Move while slashing | .85x speed; never during a dash (a press is held and goes as the dash ends) |
| Dashes | 2, refilling at Ichor's rate |
| Walking | 1.02x sheathed, .88x drawn (.85x while swinging; the slower, not both); a draw-slash on the move takes 1.25x as long |
| E Gold Rush | 3 s, +35% speed, 12 s cooldown; draws the sword and keeps it out, a gold extension doubles reach, no drawn-walking penalty; attack freely |
| X Draw-cut (rev. 2) | hop back 1.5 m (.12 s), set .17 s with the line shown, dash at 52 m/s along the facing at the press; 7.5 m line from the hop's end, 290–310 to everyone the blade reaches (within .75 m, once each), dodgeable by stepping off during the set; breakables cut; stops at the first wall; lands .55 m short of the end; 35 s cooldown; no dash charge |
| Blade blood | people only (never robots), 1/8 per hit, shown in 4 stages; clean on respawn |

## Calls I made (the brief said not to stop and ask)

- **Dash refill "the same as Ichor's":** Ichor's two dashes refill 12% *slower* than a default single dash (`dashRechargeScale` 1.12); the brief called that "slightly faster than the default weapons". I matched Ichor exactly, as asked by name.
- **When a hit lands:** the brief's hit window is .08 s. Rather than cutting everyone at its first tick (while the blade is still visibly at the side), each body is cut as the blade reaches its side of the arc; by the end of the window everyone in the arc is reached. The damage and timing are unchanged; the hit-stop now happens where you see the blade in the body.
- **Hit-stop is visual:** the attacker's blade (pose and trail) is held back ~.05 s and catches up; the simulation never pauses (it cannot online, and a solo freeze would stall the robots too).
- **Blood reset:** on respawn (the brief), not on the map's RESET MAP.
- **Draw-cut:** the body passes through the bodies it cuts (`sim.phasing`), never through walls, fences, rocks, low walls or the map edge. It cannot be dashed out of while rooted; the flourish lets you walk at .6x. A Draw-cut is not a dash: no stamina, no dash event or look.
- **Which limbs come off:** arms (the body's legs are one merged mesh, so a single leg cannot be taken without redoing the avatar). One arm (right more often), sometimes both; the Draw-cut takes both more often. The torso is never split, and it never kneels or loses its head, so it cannot be mistaken for Ichor's or Ballast's deaths.
- **HUD:** no ammo pips (like Ichor); the status line says what the sword is doing. The blade's blood is shown on the blade itself, not in the HUD.
- **Menu picture:** the sword half drawn, the scabbard over the point half of the blade, with photo-only detail (weapon-photos.js `sheathPhotoModel`), on the card's diagonal like Ichor's.
- **"Move with the sword out" during Gold Rush:** read as no drawn-walking penalty while it runs (swings are still .85x).
- **Gold slash:** on the dash's own path, lingering 1.6 s; the engraving is drawn once on a canvas at load.
- **Tutorial:** a short three-lesson course (slash, gold rush, draw-cut). Not in the brief; every weapon has one and the Tutorial page lists every weapon.

## Change note (for the merge)

**New files:** `src/weapons/sheath.js`, `sheath-motion.js`, `sheath-model.js`, `sheath-view.js`, `src/ui/sheath-screen.js`, `src/assets/weapons/sheath.webp`, `tests/sheath.test.js`, this file.

**Shared files touched, and why:**
- `src/config/gameplay.js`: the `SHEATH` block.
- `src/items.js`: the `sheath` entry (controls, hints, touch buttons RUSH / DRAW).
- `src/simulation.js`: `WEAPON_STEPS.sheath`, resets, two dashes and refill, aiming off, `stepSheathMobility` in the step (after `prepareSightline`), move speed (rush, swinging, flourish), death/map-reset cleanup, `below` on blade hits, and `phasing` in `movePlayer` (skips the body push-outs only).
- `src/net/protocol.js`: **PROTOCOL_VERSION 16 → 17**; presses `sheathE`/`sheathX` (also in `movementInput` for Sheath), `p.sheath` in player states, the loadout.
- `src/net/host-session.js`: Sheath events in `SHARED_EVENTS`; held-input clears the two presses. `src/net/client-session.js`: the replay rebuilds a Draw-cut in progress.
- `src/bots/robot-brain.js` (Sheath tactics, style, ability/ammo checks), `bot-match.js` (state for drawing, no glide across a Draw-cut, hold-fire), `interior-tactics.js` (attack list).
- `src/render/renderer.js`: the view, event routing, blade hits bleed (x2.2), update and clear, scope-shading list. `src/render/warm-up.js`: its meshes and a `bladeDraw` death in the warm-up.
- `src/remote-players.js`: the Sheath model on other players and robots (arm rig, body pose, unseen during the vanish) and the flinch for every avatar.
- `src/weapons/rifle-pose.js`: Sheath's hand targets; arm meshes tagged `limb` for severing. `src/weapons/weapon-photos.js`: the menu picture.
- `src/effects/death-reactions.js` (`blade`, `bladeDraw`), `death-corpse.js` (`severed`), `gore.js` (`GoreBurst` `{arms}`), `remote-corpses.js` (colours).
- `src/audio.js`: `whoosh`, `ring` and Sheath's sounds. `src/main.js`: E/X inputs, no RELOAD on touch, sounds and fire-direction arcs for others' Sheath, the Gold Rush tint and Draw-cut streak.
- `src/ui/weapon-hud.js`, `ability-hud.js`, `x-ability-state.js`, `map-cards.js`, `dev-options.js`, `dev-wiring.js`, `src/tutorial.js`, `src/styles/menu-theme.css` (HUD colours).
- `tests/items.test.js`, `tests/net.test.js`: the weapon lists include `sheath` (and `ichor`, missing from the random-pick list).
- `AGENTS.md`.

**Deadwater players will notice:** nothing unless they pick Sheath or meet a Sheath robot. The golden Deadwater replay is unchanged (no RECORD needed).

**Checks run:** full suite (see the handoff message for the count); program-check Potato, Performance, Quality (Hollow Wick) and Extreme: 0 programs linked in play; a headless smoke on all five presets on both maps with a Sheath robot (1v1): no page or console errors; perf on Potato/Performance within noise of Ichor; phone layouts upright and sideways; a no-undef lint of main.js and the new files. Headless SwiftShader only: not a phone or Intel Mac benchmark.

**Changelog entry (ready to paste when pushing):**

> ### Sheath, a new weapon
> - A white broadsword in a black sheath. The first cut draws it; it goes back in when you stop. Heavy, wide cuts for 60–70 to everyone in the swing, about two a second, each swing flowing from where the last ended.
> - **E Gold Rush:** three seconds of faster movement with a gold trail; keep attacking.
> - **X Draw-cut:** vanish, reappear up to 7.5 m ahead with one huge slash that cuts everyone and every breakable on the line. Walls stop it.
> - Its kills take an arm off, sometimes both. Robots can use it too, and it has its own short tutorial.
