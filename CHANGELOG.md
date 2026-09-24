# Changelog

Deadshift, newest first. Every version is an alpha, playable in the browser on mobile or PC.

## alpha v0.8 (2026-09-24)

### Title screen
- New main menu: the "deadshift" title fills with liquid blood. It pours into the letters, part-fills the holes in the d's and the a, drips from every letter (fast drips and double drips too) and pools on the buttons.
- The blood is attached to the text and buttons, so it never lags when you drag or resize, and it fits every screen, including vertical phones.
- Version above the title; a password-protected dev tools button under the menu.
- The loading screen now matches the title.

### Gameplay
- Nominal: slight recoil in the hip-fire cone that affects aim and bullets; none while aiming down sights.
- Targets: bullet holes only appear from real bullets. Targets now break apart in stages and throw pieces on Quality and Extreme, and face different directions (never straight up).
- Death: the camera zooms in and holds on the body so you can see the gore, and the menu slides in after a few seconds.
- Walking through blood stains your gun and hat, and bloody footprints now cover the whole print.
- Roofs lift straight away when you walk in through a door, including the big building by the train.

### Interface
- The top bar uses icons: a map, a speaker (pink with a slash when muted) and a pause button.
- Settings > Controls: General and Weapons are both dropdowns.
- Keyboard HUD hints no longer overlap on narrow windows.

### Performance
- Static X no longer stutters: pulses and orb blasts reuse their effects instead of building new ones, and nothing new is compiled mid-fight (including on Extreme).
- Breaking props with the X is much cheaper.
- When the game lowers resolution to keep up on phones and laptops, it no longer freezes for a frame.
- The HUD skips work it doesn't need to do, and damage numbers and aim brackets move without re-laying out the page.
- Aim assist and target lock check sight lines more cheaply.

### Extreme preset
- Cloud shadows drift slowly across the whole map.
- Now and then a dust devil whirls across open ground with the wind.
- Better-lit birds, and more detailed low-poly weapon pictures.

### Mobile
- Redesigned touch layout editor: a clean toolbar with an icon legend and Swap / Reset / Done buttons, and buttons snap to the screen edge. Your phone gives a small tick when you pick up or drop a button.
- Settings > Mobile puts the layout tools first.
- New Vibration setting: a short buzz when you're hit and a double buzz on a kill.
- The screen stays on while you're playing.
- The grenade button now reads NADE and fits its slot, and every button label is centred in its segment.

## alpha v0.7 (2026-09-23)

### Multiplayer rounds from a lobby
- Host setup page, then a live lobby: players, colours and ping. The host picks the mode (free-for-all or practice), the map and the settings, then starts the round. 1V1, 2V2 and 3V3 are listed but not built yet.
- Round settings: spawns (random or together), round length, kill limit, health and respawn wait.
- A 10-second weapon pick over a top-down camera. Weapons only change after dying. Free-for-all ends on a results screen, then back to the lobby; practice has shared targets and nothing is counted.
- A lobby page in the pause menu (ping and settings; the host can remove players, reset the map and end the round).
- One death screen for solo and online, with a respawn countdown. One body and bloodstain per player, per-player colours, and ping on the scoreboard.
- Fixed: another player's Static stream drew from your own gun.

### Also
- Aim assist, target lock and faster aiming without a mouse.
- Nominal holds 20 rounds (40 with the extended magazine).
- Damage numbers add up into running totals.
- No more mid-fight stutter from shaders being built; about 25% fewer draw calls and cheaper shadows.
- Roof fixes, and roofs show wear.
- Menu text is fitted before it first appears. New 1V1 gamemode button.

## alpha v0.65 (2026-09-23)
- Multiplayer menu: username, room code and JOIN, or HOST A GAME. The room code is the password, and the code box is always in capitals.
- Two windows of the same browser can play each other on one PC.
- Players still loading the map get 45 seconds before being dropped; a freeze on your own side no longer counts as the other player going quiet.
- The multiplayer pause menu and death card match the original pause menu's style.

## alpha v0.6 (2026-09-23): multiplayer
- Free-for-all for up to 4 players, peer to peer. Every weapon works against players.
- Pick a weapon after loading in; change it from the pause menu or the death card.
- Spawn inside a random building, 500 HP, 5-second respawn.
- Kill feed (multi-kills on one line; you in blue, others in pink) and a Tab scoreboard (kills, deaths, damage dealt and taken, time, most-used weapon).
- The host can remove players. Broken props and crop fires are shared with everyone, and players can't walk through each other.
- Blood splatter on the floor at every player death.
- Edit the mobile layout from the menus over a still frame of the map.
- Kill feed bottom left (top right on touch); a bigger health bar.

## alpha v0.55 (2026-09-22)
- Orb blasts grow with every orb that lands: small at 2-3, medium at 4-7, full size around 10.
- Warmer light on each map.
- New Extreme preset: ambient occlusion, bloom and colour grading, weathered surfaces, sharper shadows.
- A detail-effects layer (sparks, embers, smoke, rings) on every weapon and blast.
- Optimisation pass, including stand-in shadows on Potato.
- Ballast shells bounce and roll; pellets past the red zone keep flying for show.
- Mobile layout: reset a single dragged button back to its corner.
- Menu click sounds; indoor shadow and roof fade fixes.
- Settings > Controls groups weapons in one Weapons dropdown.
- Dev tools: hidden until unlocked, with new tools (game speed, one-hit kills, freeze and respawn targets, and more).

## alpha v0.5 (2026-09-22)
- Fixed the published game getting stuck on the menu (a page file was missing from the release).
- The darkening outside the room you're in no longer flickers and is much cheaper (indoor frame times roughly halved on Performance). The crop-field view was rebuilt the same way.
- On a tablet with a keyboard, touch and keyboard no longer fight: the on-screen controls stay put and shots aren't lost when you switch between them.

### Between v0.5 and v0.55
- Fixed glitched interiors (a shelf clipping through cover in several buildings).
- Pots look like pottery, and pots, potted plants and broken chairs break when you walk over them, throwing shards instead of dust.
- Worn paths at doorways blend into the road.
- The dev window lists the Extreme preset.

## alpha v0.4 (2026-09-20)
- Better mobile performance, controls and menus; Static rebalanced.
- Fixed: moving with the joystick and pressing a button at the same time.

## alpha v0.3 (2026-09-20)
- First published version, playable in the browser (hosted on GitHub Pages).
