# Changelog

Deadshift, newest first. Every version is an alpha, playable in the browser on mobile or PC.

## alpha v0.92 (2026-09-25)

### Solo
- Gamemodes > SOLO (was 1V1): 1V1, 2V2 or 3V3 against robots, with your own robot teammates. Enemy robots and your robots are set separately (weapon or random, skill, aim, temper); first to 3, 5, 10 or endless; friendly fire; spawns scattered or with team. Your weapon can be random.
- Weapons and maps are dropdowns with a scrolling picture grid. The page fits phones.

### Multiplayer
- Every mode works: FFA, PRACTICE, 1V1, 2V2, 2V2V2 and 3V3. Robots fill empty seats (setting), + ROBOT adds one by hand, and a late joiner takes a robot's seat.
- Players pick their side in the lobby. Sides are AMBER, CYAN and VIOLET, worn on hats, scarves and base rings, and on the lobby, scoreboard and results.
- TUNE a robot in the lobby (weapon, skill, aim, temper), or APPLY TO ALL, which also sets up robots added later.
- Friendly fire (on by default in team games) does half damage. Spawns scattered (nobody within a screen of anyone) or with team.
- The host setup and lobby fit phones; the lobby map is a dropdown.

### Robots
- New skill: perfect. Robots play as squads: some stay with you, some go help a teammate in a fight, some roam; a side splits up or sometimes moves as a group.

### Weapons
- Aim lines up through the muzzle, so shots land on the cursor.
- Static: volleys launch slow then fast and leave a short beam; placed orbs drift faster; the stream does 8% less and uses orbs 20% faster; enemy orbs are darker blue. The hex lets teammates in, blocks shots from outside and spins at its edge for a moment if not pulsed.
- Nominal: the nova gives 15% more speed, tighter shots and 18% less damage taken.
- Ballast: the red cone shows full power up close and a fifth at 6.8 m, then fades out over 4 m more, to about 10 a hit at the very end; aimed shots do about 20 more point blank. The blast must charge 3 s before it fires (a pulsing ring, embers and a countdown show it), its small shells land scattered, and its explosions burn crops. Bigger blast effects.

### Other
- CHANGE WEAPON after a death picks what you respawn with. Ctrl+W no longer closes the game while playing (key lock).
- Blood no longer floats on the player. The sheriff's office has a door on every side. Bigger solo score with the health bar centred.
- Tutorials updated for all of the above. Lots of bug fixes.

## alpha v0.9 (2026-09-24)

### 1V1
- Gamemodes > 1V1 works: you against one robot. Pick the map, your weapon, the robot's weapon (or random), its skill (rookie, easy, normal, hard, expert), its aim (sloppier, as its skill, sharper), its temper (calm, shifting, aggressive), and first to 3, 5, 10 or endless.
- No practice targets; the score sits at the top; at the end, REMATCH or MAIN MENU. Your last picks are remembered.

### Robots
- Two new skills: rookie and expert. Robots mix two or three play styles, and their mood shifts during a fight: pushing and hunting when fired up, keeping their distance and taking cover when calm. Getting hurt calms them; a badly hurt enemy fires them up.
- They read the fight (push, kite, close in, fall back), dodge shots they see coming, and use every weapon's tricks. Their aim is a little worse, with the odd miss; they see only ahead and hear by distance; they spawn further away and fight each other as often as you.
- Real robot heads (no hats); armour plates fall off as they take damage, and exposed wiring sparks and smokes.

### Weapons
- Nominal: 28 rounds, faster reload. New X: the nova, 2 s to power up, then 5 s of double damage, no ammo use, a little extra speed and armour, white beams, a full magazine after; 50 s cooldown.
- Ballast: no more charging; one press, one shell. New X: the blast, five big red shells that each split into four and end in small explosions (up to 460 damage), 40 s cooldown. Two dodges.
- Static: the hex hits 15 harder; the orb bar marks the tenth orb; bigger volleys.
- X abilities are named hex, nova and blast everywhere, and the X button shows its state by colour (red cooling down, pink ready, yellow charging, blue in use). Tutorials redone to match.

### Aim and screen
- Target lock: turn to face someone, or use the arrow keys (or swipes) to switch between targets; no auto-lock. Smooth, accurate tracking that lets go behind walls, indoors and off screen.
- Every screen shape sees about the same amount of the map. Pink ring shows where gunfire you hear comes from. KILL / ONE SHOT popups. Numbers from your last life no longer show after you respawn.
- Menus show pictures of the weapons and maps, and every weapon and map list has a coming-soon slot.
- Touch: see-through buttons that fade at the edges, evenly inset with rounded corners.

### Multiplayer and fixes
- Fixed games freezing when Static's stream was busy. Syphon (FFA option): a kill heals half your missing health.
- Online players no longer run the nova or blast twice; shells keep flying after you die; many smaller fixes.
- Faster loading; fewer draws on busy maps; no stutter on the first death.
- Dev tools: freeze game, many more options, a larger O window with a quick bar and search.

## alpha v0.82 (2026-09-24)

### Robots (a test build, from the dev tools)
- Robots you can add from the dev tools (solo games): they play like a player, using every weapon with the same moves, ammo and reloads.
- They find real routes round the map, take cover to reload, hunt you down, walk round cover to get a shot, and keep their aim on the corner you went round.
- Robots never bleed: hits throw sparks, and a dead robot falls over and smokes.
- Sides: free for all, an enemy team, or allies. Allies stay next to you, keep out of your line of fire, go after whoever is hurting you and step in front of you when you're nearly dead. No friendly fire.
- Eight robot skins (steel, copper, brass, gunmetal, rust, enamel, black iron, teal), never two the same in a game; allies have a green eye, flag and ring.
- Each robot has a skill (easy, normal, hard) and a style (balanced, rusher, marksman, flanker, cautious), with small differences of its own.
- Robots are the same size and shape as players.

### Menus
- Previews of robots in multiplayer: robot options when hosting, "empty slot" rows in the lobby, and a 1V1 page for you against a robot. Not working yet.

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
